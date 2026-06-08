// ── ArticulatedBusPresentationPass v1.0.0 ─────────────────────────────────────
// 0605G_WOS_ArticulatedBusPresentationPass_v1.0.0
// Status: active | Classification: presentation-layer (articulation)
//
// Believable two-segment articulation for articulated buses: the front segment is
// the truth anchor + heading authority; the rear segment and accordion joint are
// DERIVED presentation positions from heading history (no route geometry, no map
// matching, no physics). Articulation is visual, not simulated — continuity over
// twitch. READ-ONLY to the world: writes presentation cache only; never mutates
// actors/routes/feed/selector/smoothing/assignment/camera/Mapbox. Applies ONLY to
// busAssetClass === 'articulated'. Load AFTER busAssetResolver.js + busMotionSmoothing.js.
// Never throws out of a public call.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';
  var SOURCE_ID = 'mta_bus_gtfs_rt_vehicle_positions';

  var ARTICULATED_SEGMENT_LENGTH_M = 18;
  var MAX_BEND_DEG = 32;
  var BEND_SMOOTHING_FACTOR = 0.15;
  var CACHE_LIMIT = 2000;

  function _ar() { return SBE.BusAssetResolver || null; }
  function _sm() { return SBE.BusMotionSmoothing || null; }
  function _mvr() { return SBE.MapboxViewportRuntime || null; }
  function _map() { var m = _mvr(); try { return (m && typeof m.getMap === 'function') ? m.getMap() : null; } catch (e) { return null; } }
  function _num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }

  var _enabled = true, _active = false, _debug = false;
  var _cache = {}, _count = 0;
  var _stats = { observed: 0, articulated: 0, ignored: 0, simplified: 0, disabledCruise: 0, bendClamps: 0, lastError: null };

  function _profile() {
    var m = _map(); var z = null;
    if (m && typeof m.getZoom === 'function') { try { z = m.getZoom(); } catch (e) {} }
    if (z == null || !isFinite(z)) return 'city';
    if (z >= 15.5) return 'low';
    if (z >= 12.0) return 'city';
    if (z >= 9.0) return 'regional';
    return 'cruise';
  }
  function _isArticulated(actor) {
    var ar = _ar();
    if (ar && typeof ar.getAssetClass === 'function') { try { return ar.getAssetClass(actor) === 'articulated'; } catch (e) {} }
    var md = (actor && actor.metadata) || {};
    return (md.busAssetClass || md.busClass) === 'articulated';
  }
  function _frontPos(actor) {
    var sm = _sm();
    if (sm && typeof sm.getPresentationPosition === 'function') {
      try { if (typeof sm.observe === 'function') sm.observe(actor); var sp = sm.getPresentationPosition(actor.actorId); if (sp) return { lng: sp.lng, lat: sp.lat }; } catch (e) {}
    }
    return (actor.lng != null && actor.lat != null) ? { lng: actor.lng, lat: actor.lat } : null;
  }
  // Normalize a degree difference to [-180, 180].
  function _angDiff(a, b) { var d = ((a - b + 540) % 360) - 180; return d; }
  // Project lng/lat by metres along a compass bearing (0 = north, clockwise).
  function _projectM(lng, lat, bearingDeg, distM) {
    var br = bearingDeg * Math.PI / 180;
    var dLat = (distM * Math.cos(br)) / 111320;
    var dLng = (distM * Math.sin(br)) / (111320 * Math.cos(lat * Math.PI / 180));
    return { lng: lng + dLng, lat: lat + dLat };
  }

  // ── observe(actor) — update derived articulation state ──────────────────────
  function observe(actor) {
    _stats.observed++;
    if (!_enabled || !actor || actor.actorId == null) return false;
    if (!_isArticulated(actor)) { _stats.ignored++; return false; }

    var profile = _profile();
    if (profile === 'cruise') { _stats.disabledCruise++; return false; }   // aggregate field only

    var front = _frontPos(actor);
    if (!front) return false;
    var heading = _num(actor.headingDeg) || 0;
    var id = actor.actorId;
    var s = _cache[id];
    if (!s) {
      if (_count >= CACHE_LIMIT) return false;
      s = _cache[id] = { actorId: id, frontLng: front.lng, frontLat: front.lat, rearLng: front.lng, rearLat: front.lat,
        jointLng: front.lng, jointLat: front.lat, bendAngleDeg: 0, trailHeading: heading, simplified: false, lastUpdateMs: Date.now() };
      _count++; _stats.articulated++;
    }

    // Bend from heading history: front heading vs lagged "trail" heading.
    s.trailHeading += _angDiff(heading, s.trailHeading) * BEND_SMOOTHING_FACTOR;
    var bendTarget = _angDiff(heading, s.trailHeading);
    if (bendTarget > MAX_BEND_DEG) { bendTarget = MAX_BEND_DEG; _stats.bendClamps++; }
    else if (bendTarget < -MAX_BEND_DEG) { bendTarget = -MAX_BEND_DEG; _stats.bendClamps++; }
    s.bendAngleDeg += (bendTarget - s.bendAngleDeg) * BEND_SMOOTHING_FACTOR;
    if (s.bendAngleDeg > MAX_BEND_DEG) s.bendAngleDeg = MAX_BEND_DEG;
    else if (s.bendAngleDeg < -MAX_BEND_DEG) s.bendAngleDeg = -MAX_BEND_DEG;

    s.frontLng = front.lng; s.frontLat = front.lat;

    if (profile === 'regional') {
      // Single articulated silhouette — collapse rear onto front.
      s.simplified = true; _stats.simplified++;
      s.rearLng = front.lng; s.rearLat = front.lat;
      s.jointLng = front.lng; s.jointLat = front.lat;
    } else {
      s.simplified = false;
      // Rear lags behind the front along the trail heading; bend offsets it.
      var rearHeading = heading - s.bendAngleDeg;
      var rear = _projectM(front.lng, front.lat, rearHeading + 180, ARTICULATED_SEGMENT_LENGTH_M);
      s.rearLng = rear.lng; s.rearLat = rear.lat;
      var joint = _projectM(front.lng, front.lat, rearHeading + 180, ARTICULATED_SEGMENT_LENGTH_M * 0.5);
      s.jointLng = joint.lng; s.jointLat = joint.lat;
    }
    s.simplifiedProfile = profile;
    s.lastUpdateMs = Date.now();
    return true;
  }

  function getPresentationState(actorId) {
    var s = _cache[actorId];
    if (!s) return null;
    return { actorId: s.actorId, frontLng: s.frontLng, frontLat: s.frontLat,
      rearLng: s.rearLng, rearLat: s.rearLat, jointLng: s.jointLng, jointLat: s.jointLat,
      bendAngleDeg: Math.round(s.bendAngleDeg * 100) / 100, simplified: !!s.simplified,
      profile: s.simplifiedProfile || null, lastUpdateMs: s.lastUpdateMs };
  }

  function clear() { _cache = {}; _count = 0; return true; }
  function start() { _active = true; return true; }
  function stop() { _active = false; return true; }
  function isActive() { return _active; }
  function setEnabled(on) { _enabled = on !== false; if (!_enabled) clear(); return _enabled; }
  function setDebug(on) { _debug = on !== false; return _debug; }

  function getState() {
    return { version: VERSION, active: _active, enabled: _enabled, debug: _debug,
      cachedCount: _count, profile: _profile(),
      segmentLengthM: ARTICULATED_SEGMENT_LENGTH_M, maxBendDeg: MAX_BEND_DEG, bendSmoothingFactor: BEND_SMOOTHING_FACTOR,
      cacheLimit: CACHE_LIMIT, mapAvailable: !!_map(), lastError: _stats.lastError };
  }
  function getStats() {
    return { observed: _stats.observed, articulated: _stats.articulated, ignored: _stats.ignored,
      simplified: _stats.simplified, disabledCruise: _stats.disabledCruise, bendClamps: _stats.bendClamps, cachedCount: _count };
  }

  SBE.ArticulatedBusPresentationPass = Object.freeze({
    VERSION:              VERSION,
    start:                start,
    stop:                 stop,
    isActive:             isActive,
    observe:              observe,
    getPresentationState: getPresentationState,
    clear:                clear,
    getState:             getState,
    getStats:             getStats,
    setEnabled:           setEnabled,
    setDebug:             setDebug,
  });

  console.log('[ArticulatedBusPresentationPass] v' + VERSION + ' loaded (two-segment articulation — presentation only)');
})(window);
