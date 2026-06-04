// ── AircraftRuntime v1.1.0 ────────────────────────────────────────────────────
// 0528A_WOS_AirflightRuntimeBootstrap_v1.0.0
// 0528K_WOS_RegionalFlightTripRuntime_v1.0.0
// Status: active
// Classification: runtime-authority
//
// Purpose:
//   First aircraft runtime layer for WOS.  Manages airport-origin aircraft,
//   altitude progression through lifecycle states, and airspace influence
//   field emission.  Does not ingest live ADS-B — this is a bootstrap runtime
//   seeded from NYC airport anchors.
//
// Authority:
//   OWNS: aircraft entity state, airport anchors, lifecycle transitions,
//         altitude scalar, position projection, camera test follow
//   MUST NOT MUTATE: AISRuntime, vessel continuity, map style, atmosphere truth,
//                    ViewportAuthority outside explicit camera test mode
//
// Placement: wall/systems/world/aircraftRuntime.js
// Load: BEFORE airspaceInfluenceField.js, aircraftRenderer.js, main.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  var VERSION = '1.1.0';

  // ── System constants ──────────────────────────────────────────────────────────

  var MAX_ACTIVE             = 12;
  var UPDATE_HZ              = 10;
  var CRUISE_ALT_FT          = 9000;
  var SHADOW_FADE_ALT_FT     = 2500;
  var INFLUENCE_MIN_RADIUS_M = 600;
  var INFLUENCE_MAX_RADIUS_M = 6500;
  var INFLUENCE_DECAY_MS     = 8000;

  // Lifecycle durations in seconds
  var DURATION_S = {
    PARKED:       3,
    TAKEOFF_ROLL: 45,
    CLIMB:        180,
    CRUISE:       300,
    DESCENT:      180,
    LANDING:      45,
  };

  // Ground speed in m/s per lifecycle state
  var SPEED_MS = {
    PARKED:       0,
    TAKEOFF_ROLL: 41,    // ≈ 80 kts
    CLIMB:        129,   // ≈ 250 kts
    CRUISE:       216,   // ≈ 420 kts
    DESCENT:      129,
    LANDING:      67,    // ≈ 130 kts
    COMPLETE:     0,
    DORMANT:      0,
  };

  var LIFECYCLE_ORDER = [
    'PARKED', 'TAKEOFF_ROLL', 'CLIMB', 'CRUISE', 'DESCENT', 'LANDING', 'COMPLETE',
  ];

  // ── Airport anchors ───────────────────────────────────────────────────────────

  var AIRPORT_ANCHORS = [
    {
      id: 'JFK',
      label: 'John F. Kennedy International Airport',
      lat:  40.6413,
      lng: -73.7781,
      runwayHeadingsDeg: [40, 130, 220, 310],
      defaultTakeoffHeadingDeg: 310,
      localAirspaceRadiusM: 14000,
      enabled: true,
    },
    {
      id: 'LGA',
      label: 'LaGuardia Airport',
      lat:  40.7769,
      lng: -73.8740,
      runwayHeadingsDeg: [40, 130, 220, 310],
      defaultTakeoffHeadingDeg: 220,
      localAirspaceRadiusM: 10000,
      enabled: true,
    },
    {
      id: 'EWR',
      label: 'Newark Liberty International Airport',
      lat:  40.6895,
      lng: -74.1745,
      runwayHeadingsDeg: [40, 220, 110, 290],
      defaultTakeoffHeadingDeg: 40,
      localAirspaceRadiusM: 14000,
      enabled: true,
    },
  ];

  // ── Runtime state ─────────────────────────────────────────────────────────────

  var _aircraft         = {};   // { id: AircraftEntity }
  var _anchors          = {};   // { id: AirportAnchor }
  var _initialized      = false;
  var _updateInterval   = null;
  var _idCounter        = 0;
  var _debugVisible     = false;
  var _cameraFollowId   = null;
  var _cameraFollowTimer = null;
  var _autoSpawn        = true;

  // ── Geo utility ───────────────────────────────────────────────────────────────

  var _EARTH_R_M = 6371000;

  function _geoBearingOffset(lat, lng, bearingDeg, distM) {
    var d   = distM / _EARTH_R_M;
    var b   = bearingDeg * Math.PI / 180;
    var φ1  = lat * Math.PI / 180;
    var λ1  = lng * Math.PI / 180;
    var φ2  = Math.asin(Math.sin(φ1) * Math.cos(d) +
                        Math.cos(φ1) * Math.sin(d) * Math.cos(b));
    var λ2  = λ1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(φ1),
                               Math.cos(d) - Math.sin(φ1) * Math.sin(φ2));
    return { lat: φ2 * 180 / Math.PI, lng: λ2 * 180 / Math.PI };
  }

  // ── Altitude scalar ───────────────────────────────────────────────────────────
  // Returns 0 (ground) → 1 (cruise) based on lifecycle state and intra-state progress.

  function _altScalar(state, stateProgress) {
    switch (state) {
      case 'PARKED':       return 0;
      case 'TAKEOFF_ROLL': return stateProgress * 0.04;
      case 'CLIMB':        return 0.04 + stateProgress * 0.96;
      case 'CRUISE':       return 1.0;
      case 'DESCENT':      return 1.0 - stateProgress * 0.96;
      case 'LANDING':      return Math.max(0, 0.04 - stateProgress * 0.04);
      default:             return 0;
    }
  }

  // ── Entity helpers ────────────────────────────────────────────────────────────

  var _CLASSES     = ['regional', 'narrowbody', 'narrowbody', 'widebody', 'narrowbody'];
  var _CALLSIGNS   = ['AAL', 'UAL', 'DAL', 'WN', 'JBU', 'FFT', 'ASA', 'EJA'];

  function _nextId()       { return 'ac_' + (++_idCounter); }
  function _nextCallsign() {
    var pfx = _CALLSIGNS[Math.floor(Math.random() * _CALLSIGNS.length)];
    return pfx + (100 + Math.floor(Math.random() * 900));
  }
  function _nextClass() { return _CLASSES[Math.floor(Math.random() * _CLASSES.length)]; }
  function _nextLifecycle(state) {
    var idx = LIFECYCLE_ORDER.indexOf(state);
    return (idx >= 0 && idx < LIFECYCLE_ORDER.length - 1)
      ? LIFECYCLE_ORDER[idx + 1]
      : 'COMPLETE';
  }

  // ── Core functions ────────────────────────────────────────────────────────────

  function initializeAircraftRuntime() {
    if (_initialized) return;

    AIRPORT_ANCHORS.forEach(function (a) { _anchors[a.id] = a; });

    _updateInterval = global.setInterval(function () {
      updateAircraftRuntime(1000 / UPDATE_HZ);
    }, 1000 / UPDATE_HZ);

    _initialized = true;
    console.log('[AircraftRuntime] v' + VERSION + ' initialized — anchors: JFK LGA EWR');

    // Auto-spawn one aircraft per airport after map has had time to initialize.
    // Satisfies "visible output over hidden infrastructure" doctrine.
    global.setTimeout(function () {
      if (!_autoSpawn) return;
      if (Object.keys(_aircraft).length === 0) {
        spawnAircraftFromAirport('JFK');
        spawnAircraftFromAirport('LGA');
        spawnAircraftFromAirport('EWR');
        console.log('[AircraftRuntime] auto-spawned 3 bootstrap aircraft');
      }
    }, 4000);
  }

  function registerAirportAnchor(anchor) {
    if (!anchor || !anchor.id) return;
    _anchors[anchor.id] = anchor;
  }

  function spawnAircraftFromAirport(airportId, options) {
    var anchor = _anchors[airportId];
    if (!anchor || !anchor.enabled) {
      console.warn('[AircraftRuntime] unknown or disabled airport:', airportId);
      return null;
    }

    var active = getActiveAircraft();
    if (active.length >= MAX_ACTIVE) {
      console.warn('[AircraftRuntime] MAX_ACTIVE reached (' + MAX_ACTIVE + ')');
      return null;
    }

    var id  = _nextId();
    var cls = _nextClass();

    var entity = {
      id:                  id,
      callsign:            _nextCallsign(),
      aircraftClass:       cls,
      originAirportId:     airportId,
      destinationAirportId: null,
      lat:                 anchor.lat,
      lng:                 anchor.lng,
      headingDeg:          anchor.defaultTakeoffHeadingDeg,
      groundSpeedKts:      0,
      altitudeFt:          0,
      altitudeScalar:      0,
      routeProgress:       0,
      lifecycleState:      'PARKED',
      stateElapsedMs:      0,
      influenceProfileId:  cls,
      createdAtMs:         Date.now(),
      updatedAtMs:         Date.now(),
    };

    if (options) {
      for (var k in options) {
        if (Object.prototype.hasOwnProperty.call(options, k)) entity[k] = options[k];
      }
    }

    _aircraft[id] = entity;
    console.log('[AircraftRuntime] spawned', entity.callsign,
      '(' + cls + ') from', airportId,
      'hdg', anchor.defaultTakeoffHeadingDeg + '°');
    return entity;
  }

  function updateAircraftRuntime(deltaMs) {
    var ids = Object.keys(_aircraft);
    for (var i = 0; i < ids.length; i++) {
      var e = _aircraft[ids[i]];
      if (!e || e.lifecycleState === 'COMPLETE' || e.lifecycleState === 'DORMANT') continue;
      _updateEntity(e, deltaMs);
    }
  }

  function _updateEntity(e, deltaMs) {
    // External-control entities (e.g. RegionalFlightTripRuntime) manage their own
    // position, altitude, and lifecycle. Only emit influence from this loop.
    if (e._externalControl) {
      var inf0 = global.SBE && SBE.AirspaceInfluenceField;
      if (inf0 && inf0.emitInfluenceSample) inf0.emitInfluenceSample(e);
      return;
    }

    e.stateElapsedMs = (e.stateElapsedMs || 0) + deltaMs;

    var durMs       = (DURATION_S[e.lifecycleState] || 10) * 1000;
    var stateProgress = Math.min(1, e.stateElapsedMs / durMs);

    // Advance geographic position
    var speedMs = SPEED_MS[e.lifecycleState] || 0;
    if (speedMs > 0) {
      var distM  = speedMs * (deltaMs / 1000);
      var newPos = _geoBearingOffset(e.lat, e.lng, e.headingDeg, distM);
      e.lat = newPos.lat;
      e.lng = newPos.lng;
    }

    // Update altitude
    e.altitudeScalar  = _altScalar(e.lifecycleState, stateProgress);
    e.altitudeFt      = e.altitudeScalar * CRUISE_ALT_FT;
    e.groundSpeedKts  = (SPEED_MS[e.lifecycleState] || 0) * 1.944;

    // Emit airspace influence
    var inf = global.SBE && SBE.AirspaceInfluenceField;
    if (inf && inf.emitInfluenceSample) inf.emitInfluenceSample(e);

    // Lifecycle transition
    if (stateProgress >= 1.0) {
      var next = _nextLifecycle(e.lifecycleState);
      e.lifecycleState = next;
      e.stateElapsedMs = 0;

      if (next === 'COMPLETE') {
        console.log('[AircraftRuntime]', e.callsign, 'route complete — removing');
        delete _aircraft[e.id];
        if (_cameraFollowId === e.id) setAircraftCameraFollow(null);
        return;
      }

      console.log('[AircraftRuntime]', e.callsign, '→', next);
    }

    e.updatedAtMs = Date.now();
  }

  // ── Camera test follow ────────────────────────────────────────────────────────
  // Soft center on followed aircraft via MapboxViewportRuntime.flyTo().
  // Preserves pitch and bearing.  Test mode only.

  function setAircraftCameraFollow(entityId) {
    _cameraFollowId = entityId || null;

    if (_cameraFollowTimer) {
      global.clearInterval(_cameraFollowTimer);
      _cameraFollowTimer = null;
    }

    if (!_cameraFollowId) {
      console.log('[AircraftRuntime] camera follow disabled');
      return;
    }

    console.log('[AircraftRuntime] camera follow → ' + _cameraFollowId);

    _cameraFollowTimer = global.setInterval(function () {
      var e = _aircraft[_cameraFollowId];
      if (!e) { setAircraftCameraFollow(null); return; }

      var mvr = global.SBE && SBE.MapboxViewportRuntime;
      if (!mvr || !mvr.flyTo) return;

      var cam = mvr.getCamera ? mvr.getCamera() : {};
      mvr.flyTo({
        center:   [e.lng, e.lat],
        pitch:    cam.pitch  !== undefined ? cam.pitch  : 35,
        bearing:  cam.bearing !== undefined ? cam.bearing : 0,
        duration: 600,
        speed:    0.8,
      });
    }, 1500);  // re-center every 1.5s
  }

  // ── Public accessors ──────────────────────────────────────────────────────────

  function getActiveAircraft() {
    var result = [];
    var ids    = Object.keys(_aircraft);
    for (var i = 0; i < ids.length; i++) {
      var e = _aircraft[ids[i]];
      if (e && e.lifecycleState !== 'COMPLETE') result.push(e);
    }
    return result;
  }

  function resolveAircraftRoutePosition(entity) {
    return { lat: entity.lat, lng: entity.lng, headingDeg: entity.headingDeg };
  }

  function resolveAircraftAltitude(entity) {
    return { altitudeFt: entity.altitudeFt, altitudeScalar: entity.altitudeScalar };
  }

  function emitAirspaceInfluence(entity) {
    var inf = global.SBE && SBE.AirspaceInfluenceField;
    return inf ? inf.emitInfluenceSample(entity) : null;
  }

  function setAircraftDebugVisible(enabled) {
    _debugVisible = !!enabled;
    var rend = global.SBE && SBE.AircraftRenderer;
    if (rend && rend.setDebugVisible) rend.setDebugVisible(_debugVisible);
  }

  function getAllAnchors() {
    return Object.keys(_anchors).map(function (k) { return _anchors[k]; });
  }

  function getAnchor(id) { return _anchors[id] || null; }

  function clearAllAircraft() {
    _aircraft = {};
    if (_cameraFollowId) setAircraftCameraFollow(null);
    console.log('[AircraftRuntime] all aircraft cleared');
  }

  function setAutoSpawn(val) { _autoSpawn = !!val; }

  // ── External aircraft control ─────────────────────────────────────────────────
  // Allows trip runtimes to register a single trip-controlled aircraft entity.
  // The entity is stored in _aircraft and returned by getActiveAircraft(), but
  // the normal update loop skips it — the caller owns all state mutations.

  function upsertExternalAircraft(entity) {
    if (!entity || !entity.id) {
      console.warn('[AircraftRuntime] upsertExternalAircraft: entity must have .id');
      return null;
    }
    entity._externalControl = true;
    _aircraft[entity.id] = entity;
    return entity;
  }

  function removeExternalAircraft(id) {
    if (!id || !_aircraft[id]) return;
    if (!_aircraft[id]._externalControl) {
      console.warn('[AircraftRuntime] removeExternalAircraft: entity', id, 'not external');
      return;
    }
    delete _aircraft[id];
    if (_cameraFollowId === id) setAircraftCameraFollow(null);
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  SBE.AircraftRuntime = Object.freeze({
    VERSION:                  VERSION,
    init:                     initializeAircraftRuntime,
    spawnFromAirport:         spawnAircraftFromAirport,
    update:                   updateAircraftRuntime,
    getActiveAircraft:        getActiveAircraft,
    resolveRoutePosition:     resolveAircraftRoutePosition,
    resolveAltitude:          resolveAircraftAltitude,
    emitInfluence:            emitAirspaceInfluence,
    setDebugVisible:          setAircraftDebugVisible,
    setCameraFollow:          setAircraftCameraFollow,
    clearAll:                 clearAllAircraft,
    getAnchor:                getAnchor,
    getAllAnchors:             getAllAnchors,
    setAutoSpawn:             setAutoSpawn,
    registerAirportAnchor:    registerAirportAnchor,
    upsertExternalAircraft:   upsertExternalAircraft,
    removeExternalAircraft:   removeExternalAircraft,
    // Constants
    CRUISE_ALT_FT:            CRUISE_ALT_FT,
    SHADOW_FADE_ALT_FT:       SHADOW_FADE_ALT_FT,
    INFLUENCE_MIN_RADIUS_M:   INFLUENCE_MIN_RADIUS_M,
    INFLUENCE_MAX_RADIUS_M:   INFLUENCE_MAX_RADIUS_M,
    MAX_ACTIVE:               MAX_ACTIVE,
    AIRPORT_ANCHORS:          AIRPORT_ANCHORS,
  });

  // Auto-initialize on load
  initializeAircraftRuntime();

  console.log('[AircraftRuntime] v' + VERSION + ' loaded');

})(window);
