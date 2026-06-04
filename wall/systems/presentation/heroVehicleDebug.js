// ── HeroVehicleDebug v1.0.0 ───────────────────────────────────────────────────
// 0530F_WOS_HeroVehicleCameraFollowPrototype_v1.0.0
// Status: prototype
// Classification: debug-namespace
//
// Console API: _wos.debug.heroVehicle
//   state()           — current actor state
//   start(to)         — start a drive from current map center to `to`
//   stop()            — stop the hero vehicle
//   speed(multiplier) — change live speed
//   route()           — current route summary
//   camera()          — camera follow diagnostic
//
// Placement: wall/systems/presentation/heroVehicleDebug.js
// Load: AFTER heroVehicleRuntime.js, heroVehicleRenderer.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  function _rt()   { return global.SBE && SBE.HeroVehicleRuntime; }
  function _deck() { return global.SBE && SBE.TraversalControlDeck; }

  function state() {
    var rt = _rt();
    if (!rt) { console.warn('[heroVehicle] runtime not loaded'); return null; }
    var s = rt.getState();
    console.group('[heroVehicle] state()');
    Object.keys(s).forEach(function (k) {
      console.log((k + '                       ').slice(0, 24) + ':', s[k] != null ? s[k] : '—');
    });
    console.groupEnd();
    return s;
  }

  // start('Los Angeles') — resolves via the deck's destination resolver, reads
  // current map center as origin, and starts the hero vehicle.
  function start(to) {
    var rt   = _rt();
    var deck = _deck();
    if (!rt)   { console.error('[heroVehicle] runtime not loaded'); return false; }
    if (!deck || typeof deck.driveTo !== 'function') {
      console.error('[heroVehicle] deck.driveTo unavailable');
      return false;
    }
    if (!to) { console.error('[heroVehicle] start(to): destination required'); return false; }
    return deck.driveTo(to);
  }

  function stop() {
    var rt = _rt();
    if (!rt) { console.warn('[heroVehicle] runtime not loaded'); return; }
    rt.stop();
    return true;
  }

  function speed(mult) {
    var rt = _rt();
    if (!rt) { console.warn('[heroVehicle] runtime not loaded'); return; }
    rt.setSpeed(mult);
    return rt.getState().speedMultiplier;
  }

  function route() {
    var rt = _rt();
    if (!rt) { console.warn('[heroVehicle] runtime not loaded'); return null; }

    // Read the canonical live route polyline (same source traffic spawns on),
    // not getState() snapshot counters which can read stale during transitions.
    var r = typeof rt.getRoute === 'function' ? rt.getRoute() : null;
    if (!r) {
      console.warn('[heroVehicle] route() — no active route (is Drive running?)');
      return null;
    }
    var summary = {
      source:      r.source,
      profile:     r.profile,
      points:      r.pointCount,
      distance:    r.distance,
      coordinates: r.coordinates,
    };
    console.group('[heroVehicle] route()');
    console.log('source  :', summary.source);
    console.log('profile :', summary.profile);
    console.log('points  :', summary.points);
    console.log('distance:', summary.distance != null ? summary.distance + ' m' : '—');
    console.log('coords  :', summary.coordinates ? summary.coordinates.length + ' × [lng,lat]' : '—');
    if (summary.source === 'destination-table-fallback') {
      console.warn('⚠ Using FALLBACK straight route — not road-aware.');
    }
    console.groupEnd();
    return summary;
  }

  function camera() {
    var rt  = _rt();
    var s   = rt ? rt.getState() : null;
    var cs  = rt && typeof rt.getCameraState === 'function' ? rt.getCameraState() : {};

    var result = Object.assign({
      povType:      'drone_follow_vehicle',
      following:    s ? s.active : false,
      actorLat:     s ? s.lat    : null,
      actorLng:     s ? s.lng    : null,
      actorHeading: s ? s.headingDeg : null,
    }, cs);

    console.group('[heroVehicle] camera()');
    Object.keys(result).forEach(function (k) {
      console.log((k + '                ').slice(0, 18) + ':', result[k] != null ? result[k] : '—');
    });
    console.groupEnd();
    return result;
  }

  function visual() {
    var renderer = global.SBE && global.SBE.HeroVehicleRenderer;
    if (!renderer || typeof renderer.getVisualState !== 'function') {
      console.warn('[heroVehicle] renderer visual state unavailable'); return null;
    }
    var v = renderer.getVisualState();
    console.group('[heroVehicle] visual()');
    Object.keys(v).forEach(function (k) { console.log((k + '          ').slice(0, 14) + ':', v[k]); });
    console.groupEnd();
    return v;
  }

  function cameraPreset(name) {
    var rt = _rt();
    if (!rt) { console.warn('[heroVehicle] runtime not loaded'); return null; }
    if (name !== undefined) {
      rt.setCameraPreset(name);
    }
    var cs = typeof rt.getCameraState === 'function' ? rt.getCameraState() : null;
    if (cs) {
      console.group('[heroVehicle] cameraPreset: ' + rt.getCameraPreset());
      Object.keys(cs).forEach(function (k) { console.log((k + '              ').slice(0, 18) + ':', cs[k]); });
      console.groupEnd();
    }
    return cs;
  }

  function smoothing() {
    var rt = _rt();
    if (!rt || typeof rt.getSmoothingState !== 'function') {
      console.warn('[heroVehicle] smoothing state unavailable');
      return null;
    }
    var s = rt.getSmoothingState();
    console.group('[heroVehicle] smoothing()');
    Object.keys(s).forEach(function (k) {
      var v = s[k];
      console.log((k + '                 ').slice(0, 20) + ':',
        (v != null && typeof v === 'object') ? JSON.stringify(v) : v);
    });
    console.groupEnd();
    return s;
  }

  var _debugObj = {
    state:        state,
    start:        start,
    stop:         stop,
    speed:        speed,
    route:        route,
    camera:       camera,
    cameraPreset: cameraPreset,
    smoothing:    smoothing,
    visual:       visual,
  };

  function _bindDebug() {
    global._wos             = global._wos             || {};
    global._wos.debug       = global._wos.debug       || {};
    global._wos.debug.heroVehicle = _debugObj;

    // _wos.debug.location.state() — locality/weather location source
    global._wos.debug.location = global._wos.debug.location || {};
    global._wos.debug.location.state = function () {
      var vla = global.SBE && global.SBE.ViewportLocationAuthority;
      if (!vla) { console.warn('[location] ViewportLocationAuthority not loaded'); return null; }
      var s = vla.getState();
      console.group('[location] state()');
      console.log('source      :', s.source);
      console.log('label       :', s.label || '—');
      console.log('region      :', s.region || '—');
      console.log('lat/lng     :', s.latitude, s.longitude);
      var age = s.lastUpdateMs ? Math.round((Date.now() - s.lastUpdateMs) / 1000) + 's ago' : '—';
      console.log('lastUpdate  :', age);
      console.groupEnd();
      return s;
    };

    // force(): immediately resolves position and triggers reverse geocode + event
    global._wos.debug.location.force = function () {
      var vla = global.SBE && global.SBE.ViewportLocationAuthority;
      if (!vla || typeof vla.force !== 'function') {
        console.warn('[location] force() unavailable'); return;
      }
      vla.force();
    };
  }
  _bindDebug();
  global.setTimeout(_bindDebug, 300);
  global.setTimeout(_bindDebug, 1000);
  global.setTimeout(_bindDebug, 2500);

  console.log('[HeroVehicleDebug] loaded — _wos.debug.heroVehicle | _wos.debug.location');

})(window);
