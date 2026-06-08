// ── TerrainAwareActorCamera v1.0.0 ────────────────────────────────────────────
// 0605K_WOS_TerrainAwareActorCamera_v1.0.0
// Status: active | Classification: presentation-layer (camera terrain)
//
// Makes actor-mounted camera shots (0605I) RIDE Mapbox terrain instead of floating
// over a flat abstraction: samples ground elevation, clamps the camera above
// terrain + clearance, and subtly compensates pitch for hill grade on POV/transit/
// walker shots. Terrain is presentation CONTEXT — never mutates actor truth, route
// truth, targeting, shot definitions, WSL, or Mapbox style/sources/layers/terrain
// config. One request in → one enhanced request out. Reads Mapbox terrain APIs only
// when available; otherwise passes the request through (terrainAvailable:false).
// Load AFTER actorCameraShotPresets.js. Never throws out of a public call.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  var MIN_CAMERA_CLEARANCE_M = 1.5;
  var GRADE_SAMPLE_DISTANCE_M = 12;
  var PITCH_COMPENSATION_FACTOR = 0.35;
  var MAX_PITCH_COMPENSATION_DEG = 8;
  var GRADE_SMOOTHING = 0.18;
  var ELEVATION_SMOOTHING = 0.22;
  var CACHE_LIMIT = 1000;

  // Per-shot grade pitch-compensation multipliers. Only pov/transit/walker get
  // compensation; external cinematic shots are left alone (0 below by family).
  var COMP_MUL = {
    windshield: 1.0, bus_front_window: 1.0, actor_pov: 1.0, head_pov: 1.0, street_level: 1.0,
    left_window: 0.4, right_window: 0.4, bus_side_window: 0.4, left_shoulder: 0.4, right_shoulder: 0.4,
    rear_window: 0.25, bus_rear_window: 0.25, bumper_rear: 0.25,
    roof_mount: 0.15, bus_roof: 0.15,
    bumper_front: 0.8, articulated_joint_view: 0.5, rear_follow: 0.4,
  };
  function _compMul(req) {
    if (req.shotId && COMP_MUL[req.shotId] != null) return COMP_MUL[req.shotId];
    var fam = req.family;
    return (fam === 'pov' || fam === 'transit' || fam === 'walker') ? 0.7 : 0;   // external → 0
  }

  function _mvr() { return SBE.MapboxViewportRuntime || null; }
  function _map() { var m = _mvr(); try { return (m && typeof m.getMap === 'function') ? m.getMap() : null; } catch (e) { return null; } }
  function _num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
  function _clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  var _enabled = true, _active = false, _debug = false;
  var _minClearance = MIN_CAMERA_CLEARANCE_M, _gradeSmoothing = GRADE_SMOOTHING, _pitchComp = PITCH_COMPENSATION_FACTOR;
  var _cache = {}, _cacheOrder = [], _smooth = {};   // smoothing per shotId
  var _state = { terrainAvailable: false, lastTerrainError: null, lastSample: null, lastEnhancedRequest: null };
  var _stats = { enhancedRequests: 0, terrainSamples: 0, terrainUnavailable: 0, gradeSamples: 0,
    pitchCompensations: 0, clearanceClamps: 0, cacheHits: 0, cacheEvictions: 0 };

  function _key(lng, lat) { return (Math.round(lng * 1e5) / 1e5) + ',' + (Math.round(lat * 1e5) / 1e5); }
  function _cachePut(k, v) {
    if (!_cache.hasOwnProperty(k)) { _cacheOrder.push(k);
      if (_cacheOrder.length > CACHE_LIMIT) { var old = _cacheOrder.shift(); delete _cache[old]; _stats.cacheEvictions++; } }
    _cache[k] = v;
  }
  function _metersToLatLng(lng, lat, bearingDeg, distM) {
    var br = bearingDeg * Math.PI / 180;
    return { lng: lng + (distM * Math.sin(br)) / (111320 * Math.cos(lat * Math.PI / 180)), lat: lat + (distM * Math.cos(br)) / 111320 };
  }

  // Raw terrain query (cached). Returns { elev:number|null, exaggerated, error }.
  function _queryTerrain(map, lng, lat) {
    var k = _key(lng, lat);
    if (_cache.hasOwnProperty(k)) { _stats.cacheHits++; return _cache[k]; }
    var res;
    if (!map || typeof map.queryTerrainElevation !== 'function') { res = { elev: null, exaggerated: false, error: 'no_terrain_api' }; }
    else {
      try {
        var e = map.queryTerrainElevation([lng, lat], { exaggerated: true });
        var exg = true;
        if (e == null) { e = map.queryTerrainElevation([lng, lat]); exg = false; }
        res = { elev: (_num(e) != null) ? e : null, exaggerated: exg, error: (_num(e) != null) ? null : 'terrain_null' };
      } catch (err) { res = { elev: null, exaggerated: false, error: 'terrain_query_failed' }; }
    }
    if (res.elev != null) _cachePut(k, res);   // never cache null (avoid poisoning on transient unavailability)
    return res;
  }

  // ── Public sampling ─────────────────────────────────────────────────────────
  function sampleTerrain(lng, lat) {
    _stats.terrainSamples++;
    var map = _map();
    if (!map) { _state.lastTerrainError = 'map_unavailable'; return null; }
    var r = _queryTerrain(map, lng, lat);
    _state.lastSample = { lng: lng, lat: lat, elevationM: r.elev, timestamp: Date.now() };
    if (r.elev == null) { _stats.terrainUnavailable++; _state.lastTerrainError = r.error; _state.terrainAvailable = false; return null; }
    _state.terrainAvailable = true; _state.lastTerrainError = null;
    return r.elev;
  }
  function sampleGrade(lng, lat, headingDeg) {
    _stats.gradeSamples++;
    var map = _map();
    if (!map || typeof map.queryTerrainElevation !== 'function') { _state.lastTerrainError = 'map_unavailable'; return null; }
    var h = _num(headingDeg) || 0;
    var ahead = _metersToLatLng(lng, lat, h, GRADE_SAMPLE_DISTANCE_M);
    var behind = _metersToLatLng(lng, lat, h + 180, GRADE_SAMPLE_DISTANCE_M);
    var ea = _queryTerrain(map, ahead.lng, ahead.lat).elev;
    var eb = _queryTerrain(map, behind.lng, behind.lat).elev;
    if (ea == null || eb == null) { _state.lastTerrainError = 'terrain_null'; return null; }
    return Math.atan2(ea - eb, GRADE_SAMPLE_DISTANCE_M * 2) * 180 / Math.PI;
  }

  function _smoothGrade(shotId, raw) {
    var s = _smooth[shotId] || (_smooth[shotId] = { grade: raw });
    s.grade += (raw - s.grade) * _gradeSmoothing;
    return s.grade;
  }

  // ── enhanceRequest(request) — one in, one out; never throws ─────────────────
  function enhanceRequest(request) {
    _stats.enhancedRequests++;
    if (!request || typeof request !== 'object' || _num(request.lng) == null || _num(request.lat) == null) {
      _state.lastTerrainError = 'invalid_request'; return request;
    }
    if (!_enabled) return request;   // disabled passthrough — no terrain mutation
    var map = _map();
    if (!map) { _state.lastTerrainError = 'map_unavailable'; return _unavailable(request, 'map_unavailable'); }

    var terr = _queryTerrain(map, request.lng, request.lat);
    if (terr.elev == null) { _stats.terrainUnavailable++; _state.lastTerrainError = terr.error || 'terrain_unavailable'; _state.terrainAvailable = false; return _unavailable(request, _state.lastTerrainError); }
    _state.terrainAvailable = true; _state.lastTerrainError = null;
    _state.lastSample = { lng: request.lng, lat: request.lat, elevationM: terr.elev, timestamp: Date.now() };

    // Clearance: never below terrain + clearance; respect offsetZ for high shots.
    var offZ = _num(request.offsetZ) || 0;
    var camElev = Math.max(terr.elev + _minClearance, terr.elev + offZ);
    if ((terr.elev + _minClearance) >= (terr.elev + offZ)) _stats.clearanceClamps++;

    // Grade pitch compensation (pov/transit/walker only; per-shot strength).
    var origPitch = _num(request.pitch) != null ? request.pitch : 45;
    var newPitch = origPitch, pitchCompensated = false, gradeDeg = null;
    var mul = _compMul(request);
    if (mul !== 0) {
      var rawGrade = sampleGrade(request.lng, request.lat, request.headingDeg);
      if (rawGrade != null) {
        gradeDeg = _smoothGrade(request.shotId || 'default', rawGrade);
        var comp = _clamp(gradeDeg * _pitchComp * mul, -MAX_PITCH_COMPENSATION_DEG, MAX_PITCH_COMPENSATION_DEG);
        if (Math.abs(comp) > 0.001) { newPitch = _clamp(origPitch + comp, 0, 85); pitchCompensated = true; _stats.pitchCompensations++; }
      }
    }

    var out = {};
    for (var k in request) if (request.hasOwnProperty(k)) out[k] = request[k];
    out.terrainAware = true;
    out.terrainAvailable = true;
    out.terrainExaggerated = !!terr.exaggerated;
    out.terrainElevationM = terr.elev;
    out.targetElevationM = terr.elev;
    out.cameraElevationM = camElev;
    out.gradeDeg = gradeDeg;
    out.pitch = newPitch;
    out.pitchCompensated = pitchCompensated;
    out.originalPitch = origPitch;
    _state.lastEnhancedRequest = out;
    if (_debug) console.log('[TerrainCamera]', request.shotId, 'elev', terr.elev, 'grade', gradeDeg, 'pitch', origPitch, '→', newPitch);
    return out;
  }
  function _unavailable(request, error) {
    var out = {};
    for (var k in request) if (request.hasOwnProperty(k)) out[k] = request[k];
    out.terrainAware = true; out.terrainAvailable = false; out.terrainElevationM = null;
    out.targetElevationM = null; out.cameraElevationM = null; out.gradeDeg = null;
    out.pitchCompensated = false; out.originalPitch = _num(request.pitch) != null ? request.pitch : 45;
    _state.lastEnhancedRequest = out;
    return out;
  }

  // ── Lifecycle / config ──────────────────────────────────────────────────────
  function start() { _active = true; return true; }
  function stop() { _active = false; return true; }
  function isActive() { return _active; }
  function setEnabled(on) { _enabled = on !== false; return _enabled; }
  function setDebug(on) { _debug = on !== false; return _debug; }
  function setMinClearanceMeters(v) { var n = Number(v); if (isFinite(n) && n >= 0) _minClearance = n; return _minClearance; }
  function setGradeSmoothing(v) { var n = Number(v); if (isFinite(n) && n >= 0 && n <= 1) _gradeSmoothing = n; return _gradeSmoothing; }
  function setPitchCompensation(v) { var n = Number(v); if (isFinite(n) && n >= 0) _pitchComp = n; return _pitchComp; }
  function clearCache() { _cache = {}; _cacheOrder = []; _smooth = {}; return true; }

  function getState() {
    return { version: VERSION, active: _active, enabled: _enabled, debug: _debug,
      terrainAvailable: _state.terrainAvailable, lastTerrainError: _state.lastTerrainError,
      minClearanceMeters: _minClearance, gradeSmoothing: _gradeSmoothing, pitchCompensation: _pitchComp,
      cacheSize: _cacheOrder.length, lastSample: _state.lastSample, lastEnhancedRequest: _state.lastEnhancedRequest };
  }
  function getStats() {
    return { enhancedRequests: _stats.enhancedRequests, terrainSamples: _stats.terrainSamples, terrainUnavailable: _stats.terrainUnavailable,
      gradeSamples: _stats.gradeSamples, pitchCompensations: _stats.pitchCompensations, clearanceClamps: _stats.clearanceClamps,
      cacheHits: _stats.cacheHits, cacheEvictions: _stats.cacheEvictions };
  }

  SBE.TerrainAwareActorCamera = Object.freeze({
    VERSION:                VERSION,
    start:                  start,
    stop:                   stop,
    isActive:               isActive,
    enhanceRequest:         enhanceRequest,
    sampleTerrain:          sampleTerrain,
    sampleGrade:            sampleGrade,
    setEnabled:             setEnabled,
    setDebug:               setDebug,
    setMinClearanceMeters:  setMinClearanceMeters,
    setGradeSmoothing:      setGradeSmoothing,
    setPitchCompensation:   setPitchCompensation,
    getState:               getState,
    getStats:               getStats,
    clearCache:             clearCache,
  });

  console.log('[TerrainAwareActorCamera] v' + VERSION + ' loaded (camera rides terrain)');
})(window);
