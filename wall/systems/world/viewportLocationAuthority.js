// ── ViewportLocationAuthority v1.0.0 ─────────────────────────────────────────
// 0530G_WOS_HeroVehicleTier1Cleanup_v1.0.0
// Status: active
// Classification: world-authority
//
// Single source of truth for "where is the user/actor right now?"
// Feeds RealitySyncRuntime._fetch() (weather lat/lng) and future locality label.
//
// Priority order:
//   1. heroVehicle  — actor position when a drive is active
//   2. flight       — camera/map center during regional flight
//   3. camera       — raw map center fallback
//
// Throttling rules:
//   - locality refresh: update label at most every 30s OR after ≥ 0.5° movement
//   - weather refresh:  trigger RealitySyncRuntime.forceRefresh() only when
//                       moved ≥ 0.5° from the lat/lng used for the last fetch
//     (0.5° ≈ 55 km at equator; enough to change weather cell)
//
// Mapbox Geocoding for reverse-lookup (locality label):
//   Uses Mapbox Geocoding API (places endpoint) when access token is present.
//   Falls back to "Current Route" when unavailable.
//
// Authority:
//   OWNS: current world position, locality label, weather fetch trigger
//   READS: HeroVehicleRuntime (actor pos), MapboxViewportRuntime (camera)
//   WRITES: triggers RealitySyncRuntime.forceRefresh() when position changes enough
//   MUST NOT: mutate AIS, traversal state, camera, renderer
//
// Placement: wall/systems/world/viewportLocationAuthority.js
// Load: BEFORE realitySyncRuntime.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  // ── Thresholds ────────────────────────────────────────────────────────────────
  var LOCALITY_UPDATE_INTERVAL_MS = 45000;    // poll locality label every 45s
  var LOCALITY_MOVE_DEG           = 0.03;     // update label if moved ≥ 0.03° (~3 km) — neighborhood scale
  var WEATHER_MOVE_DEG            = 0.50;     // trigger weather refresh if moved ≥ 0.5°
  var GEOCODE_THROTTLE_MS         = 10000;    // min 10s between Geocoding API calls

  // ── State ─────────────────────────────────────────────────────────────────────
  var _lat = 40.6782;   // default: Brooklyn
  var _lng = -73.9442;
  var _source = 'fallback';

  var _lastLocalityLat = null;
  var _lastLocalityLng = null;
  var _lastLocalityMs  = 0;
  var _lastGeocodeMs   = 0;

  var _lastWeatherLat  = null;
  var _lastWeatherLng  = null;

  var _label  = null;   // current locality label (e.g. "Williamsburg")
  var _region = null;   // current region label  (e.g. "Brooklyn, NY")

  // Actor-pushed position (set by heroVehicleRuntime each frame)
  var _actorLat = null;
  var _actorLng = null;
  var _actorSource = null;

  // ── Helpers ───────────────────────────────────────────────────────────────────

  function _deg2diff(a1, a2, b1, b2) {
    var dLat = (a1 - b1);
    var dLng = (a2 - b2);
    return Math.sqrt(dLat * dLat + dLng * dLng);
  }

  function _resolvePosition() {
    // 1. Actor position (hero vehicle, set each RAF frame)
    if (_actorLat != null) {
      _lat    = _actorLat;
      _lng    = _actorLng;
      _source = _actorSource || 'heroVehicle';
      return;
    }

    // 2. Flight actor position — read directly when a regional flight is active.
    //    RegionalFlightCameraRig calls map.jumpTo() each frame so map.getCenter()
    //    also follows the aircraft, but geocoding can lag at trip start (showing
    //    the origin city). Reading rtState.current here lets _maybeUpdateLocality()
    //    detect movement immediately without waiting for the camera to settle.
    var rftr = global.SBE && SBE.RegionalFlightTripRuntime;
    if (rftr && typeof rftr.getState === 'function') {
      var rftState = rftr.getState();
      if (rftState && rftState.active && rftState.current &&
          rftState.current.lat != null && rftState.current.lng != null) {
        _lat    = rftState.current.lat;
        _lng    = rftState.current.lng;
        _source = 'flight';
        return;
      }
    }

    // 3. Map camera center
    var mvr = global.SBE && SBE.MapboxViewportRuntime;
    var map = mvr && typeof mvr.getMap === 'function' ? mvr.getMap() : null;
    if (map) {
      try {
        var c = map.getCenter();
        _lat    = c.lat;
        _lng    = c.lng;
        _source = 'camera';
        return;
      } catch (e) { /* map not ready */ }
    }

    _source = 'fallback';
  }

  function _maybeRefreshWeather() {
    var moved = _lastWeatherLat == null ||
                _deg2diff(_lat, _lng, _lastWeatherLat, _lastWeatherLng) >= WEATHER_MOVE_DEG;
    if (!moved) return;

    _lastWeatherLat = _lat;
    _lastWeatherLng = _lng;

    var rsr = global.SBE && SBE.RealitySyncRuntime;
    if (rsr && typeof rsr.forceRefresh === 'function') {
      rsr.forceRefresh();
      console.log('[ViewportLocationAuthority] weather refresh triggered at',
        _lat.toFixed(3), _lng.toFixed(3));
    }
  }

  function _reverseGeocode(lat, lng) {
    var token = global.mapboxgl && global.mapboxgl.accessToken;
    if (!token) { _label = null; _region = null; return; }

    var now = Date.now();
    if (now - _lastGeocodeMs < GEOCODE_THROTTLE_MS) return;
    _lastGeocodeMs = now;

    // types priority: neighborhood > locality > district > place
    // district added so "DUMBO", "SoHo", "Tribeca" etc. appear
    var url = 'https://api.mapbox.com/geocoding/v5/mapbox.places/'
      + lng.toFixed(5) + ',' + lat.toFixed(5)
      + '.json?types=neighborhood,locality,district,place'
      + '&access_token=' + encodeURIComponent(token);

    fetch(url)
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (data) {
        var features = (data && data.features) ? data.features : [];

        // Scan in priority order: neighborhood → locality → district → place
        var label  = null;   // fine-grained: neighborhood/locality/district
        var region = null;   // coarse: city + state code

        for (var i = 0; i < features.length; i++) {
          var f     = features[i];
          var types = f.place_type || [];

          if (!label) {
            if (types.indexOf('neighborhood') !== -1 ||
                types.indexOf('locality')     !== -1 ||
                types.indexOf('district')     !== -1) {
              label = f.text;
            }
          }

          if (!region && types.indexOf('place') !== -1) {
            region = f.text;
            // Append short region code: "Brooklyn" → "Brooklyn, NY"
            var ctx = f.context || [];
            for (var j = 0; j < ctx.length; j++) {
              if (ctx[j].id && ctx[j].id.indexOf('region') === 0) {
                var shortCode = ctx[j].short_code || '';
                if (shortCode) region += ', ' + shortCode.split('-').pop().toUpperCase();
                break;
              }
            }
          }

          if (label && region) break;
        }

        var prevLabel  = _label;
        var prevRegion = _region;

        _label  = label  || null;
        _region = region || null;

        var changed = (_label !== prevLabel || _region !== prevRegion);
        if (changed) {
          var prev = [prevLabel, prevRegion].filter(Boolean).join(' / ') || '—';
          var next = [_label,  _region ].filter(Boolean).join(' / ') || '—';
          console.log('[LocationDisplay]', prev, '→', next);
        }

        // Emit viewport:locationChanged so WorldTelemetryHUD and workspaceUI update.
        // HUD reads loc.city + loc.region; we map:
        //   city   = neighborhood/district label (fine grain) when available,
        //            else the place name without state code
        //   region = state code portion (e.g. "NY") or full region string
        var cityPart   = _label || (_region ? _region.split(',')[0].trim() : '');
        var regionPart = _region ? (_region.indexOf(',') !== -1 ? _region.split(',')[1].trim() : _region) : '';

        var bus = global.SBE && SBE.WorkspaceEventBus;
        if (bus && typeof bus.emit === 'function') {
          bus.emit('viewport:locationChanged', {
            location: {
              city:     cityPart,
              region:   regionPart,
              label:    _label,
              fullRegion: _region,
              source:   _source,
              latitude: _lat,
              longitude: _lng,
            },
          });
        }

        // Notify PLAY parent window so its map overlay can show current location.
        // PLAY listens for 'wall:location' in BroadcastHudShell.
        try {
          if (global.parent && global.parent !== global) {
            global.parent.postMessage({
              type: 'wall:location',
              payload: {
                city:      cityPart,
                region:    regionPart,
                label:     _label,
                latitude:  _lat,
                longitude: _lng,
              },
            }, '*');
          }
        } catch (e) { /* cross-origin guard */ }
      })
      .catch(function () { /* API unreachable — keep previous label */ });
  }

  function _maybeUpdateLocality() {
    var now   = Date.now();
    var moved = _lastLocalityLat == null ||
                _deg2diff(_lat, _lng, _lastLocalityLat, _lastLocalityLng) >= LOCALITY_MOVE_DEG;
    var stale = (now - _lastLocalityMs) >= LOCALITY_UPDATE_INTERVAL_MS;

    if (!moved && !stale) return;

    _lastLocalityLat = _lat;
    _lastLocalityLng = _lng;
    _lastLocalityMs  = now;

    _reverseGeocode(_lat, _lng);
  }

  // ── Tick (called every POLL_MS) ───────────────────────────────────────────────
  var POLL_MS = 5000;   // position resolution runs every 5s (cheap)

  function _tick() {
    _resolvePosition();
    _maybeRefreshWeather();
    _maybeUpdateLocality();
  }

  // ── Actor position push (called from heroVehicleRuntime each RAF frame) ───────
  // Throttle writes to avoid _tick overhead in the hot loop.
  var _actorPushThrottleMs = 0;
  var ACTOR_PUSH_THROTTLE  = 500;

  function setActorPosition(lat, lng, source) {
    var now = Date.now();
    if (now - _actorPushThrottleMs < ACTOR_PUSH_THROTTLE) return;
    _actorPushThrottleMs = now;
    _actorLat    = lat;
    _actorLng    = lng;
    _actorSource = source || 'actor';
  }

  function clearActorPosition() {
    _actorLat    = null;
    _actorLng    = null;
    _actorSource = null;
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  function getState() {
    return {
      latitude:     _lat,
      longitude:    _lng,
      source:       _source,
      label:        _label,
      region:       _region,
      lastUpdateMs: _lastLocalityMs,
    };
  }

  // Immediately resolves position, bypasses throttle, forces geocode + event.
  function force() {
    _resolvePosition();
    _lastGeocodeMs   = 0;   // bypass throttle
    _lastLocalityLat = null; // bypass movement guard
    _lastLocalityMs  = 0;
    _reverseGeocode(_lat, _lng);
    console.log('[ViewportLocationAuthority] force() — resolving at', _lat.toFixed(4), _lng.toFixed(4), 'source:', _source);
  }

  function init() {
    _tick();
    global.setInterval(_tick, POLL_MS);
    console.log('[ViewportLocationAuthority] v' + VERSION + ' — polling every', POLL_MS / 1000 + 's');
  }

  SBE.ViewportLocationAuthority = Object.freeze({
    VERSION:            VERSION,
    init:               init,
    getState:           getState,
    setActorPosition:   setActorPosition,
    clearActorPosition: clearActorPosition,
    tick:               _tick,
    force:              force,
  });

  // Auto-start with a short delay so the map and other runtimes are ready.
  global.setTimeout(init, 500);

  console.log('[ViewportLocationAuthority] v' + VERSION + ' loaded');

})(window);
