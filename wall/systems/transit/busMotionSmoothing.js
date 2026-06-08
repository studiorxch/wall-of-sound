// ── BusMotionSmoothing v1.0.0 ─────────────────────────────────────────────────
// 0605B_WOS_BusMotionSmoothing_v1.0.0
// Status: active | Classification: presentation-layer (motion continuity)
//
// Presentation-only motion continuity for live buses: interpolates a smoothed
// "presentation position" between ~15s GTFS-RT truth updates (critically-damped
// lerp + capped dead-reckoning) so buses move continuously instead of teleporting.
// Motion continuity is PRESENTATION, never truth: this NEVER mutates actor
// coordinates, TruthActorRuntime, WSL, Mapbox, the selector, the resolver, or the
// presence pass. Local cache only. Reads TruthActorRuntime/selector via observe().
// Load AFTER busPresentationSelector.js. Never throws out of a public call.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  var SMOOTHING_FACTOR = 0.12;   // critically damped — no spring/overshoot
  var REGIONAL_FACTOR_MUL = 0.5;
  var MAX_PREDICT_S = 3;         // dead-reckoning cap, then freeze
  var STALE_MS = 45000;          // matches bus stale doctrine → snap to truth
  var MAX_CACHE = 6000;          // selector scan-cap parity

  function _mvr() { return SBE.MapboxViewportRuntime || null; }
  function _map() { var m = _mvr(); try { return (m && typeof m.getMap === 'function') ? m.getMap() : null; } catch (e) { return null; } }
  function _num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }

  var _enabled = true, _active = false, _debug = false;
  var _cache = {};   // actorId → smoothing record (local presentation cache)
  var _count = 0;
  var _stats = { observed: 0, updates: 0, snaps: 0, predictions: 0, lastError: null };

  function _profile() {
    var m = _map(); var z = null;
    if (m && typeof m.getZoom === 'function') { try { z = m.getZoom(); } catch (e) {} }
    if (z == null || !isFinite(z)) return 'city';
    if (z >= 15.5) return 'low';
    if (z >= 12.0) return 'city';
    if (z >= 9.0) return 'regional';
    return 'cruise';
  }

  // ── observe(actor) — ingest a truth update (no mutation of the actor) ───────
  function observe(actor) {
    if (!_enabled || !actor || actor.actorId == null) return false;
    var lng = _num(actor.lng), lat = _num(actor.lat);
    if (lng == null || lat == null) return false;
    var id = actor.actorId;
    var ts = _num(actor.timestampMs) || Date.now();
    var now = Date.now();
    var s = _cache[id];

    if (!s) {
      if (_count >= MAX_CACHE) return false;   // bounded
      _cache[id] = {
        actorId: id, lastTruthLng: lng, lastTruthLat: lat,
        targetTruthLng: lng, targetTruthLat: lat, lastTruthTimestamp: ts,
        presentationLng: lng, presentationLat: lat, velocityLng: 0, velocityLat: 0, lastSeenAt: now,
      };
      _count++; _stats.observed++;
      return true;
    }

    // New truth update? (position changed or newer timestamp)
    var moved = (lng !== s.targetTruthLng) || (lat !== s.targetTruthLat);
    var newer = ts > s.lastTruthTimestamp;
    if (moved || newer) {
      var dt = (ts - s.lastTruthTimestamp) / 1000;
      if (dt <= 0) dt = (now - s.lastSeenAt) / 1000;
      if (dt <= 0 || !isFinite(dt)) dt = 1;
      s.lastTruthLng = s.targetTruthLng; s.lastTruthLat = s.targetTruthLat;
      s.targetTruthLng = lng; s.targetTruthLat = lat;
      // Velocity in deg/sec — lives only here; truth never receives it.
      s.velocityLng = (s.targetTruthLng - s.lastTruthLng) / dt;
      s.velocityLat = (s.targetTruthLat - s.lastTruthLat) / dt;
      s.lastTruthTimestamp = ts;
      _stats.updates++;
    }
    s.lastSeenAt = now;
    return true;
  }

  // ── getPresentationPosition(actorId) — smoothed {lng,lat} (advances state) ──
  function getPresentationPosition(actorId) {
    var s = _cache[actorId];
    if (!s) return null;
    if (!_enabled) return { lng: s.targetTruthLng, lat: s.targetTruthLat, smoothed: false, reason: 'disabled' };

    var now = Date.now();
    // Stale → snap to truth, no ghost motion.
    if ((now - s.lastTruthTimestamp) > STALE_MS) {
      s.presentationLng = s.targetTruthLng; s.presentationLat = s.targetTruthLat;
      _stats.snaps++;
      return { lng: s.presentationLng, lat: s.presentationLat, smoothed: false, reason: 'stale_snap' };
    }
    var profile = _profile();
    // Cruise → no smoothing (snap to truth).
    if (profile === 'cruise') {
      s.presentationLng = s.targetTruthLng; s.presentationLat = s.targetTruthLat;
      return { lng: s.presentationLng, lat: s.presentationLat, smoothed: false, reason: 'cruise' };
    }

    var factor = SMOOTHING_FACTOR * (profile === 'regional' ? REGIONAL_FACTOR_MUL : 1);
    // Dead-reckoned target (capped at 3s, then freeze).
    var predT = (now - s.lastTruthTimestamp) / 1000;
    if (predT > MAX_PREDICT_S) predT = MAX_PREDICT_S;
    if (predT < 0) predT = 0;
    if (predT > 0 && (s.velocityLng !== 0 || s.velocityLat !== 0)) _stats.predictions++;
    var effLng = s.targetTruthLng + s.velocityLng * predT;
    var effLat = s.targetTruthLat + s.velocityLat * predT;

    s.presentationLng += (effLng - s.presentationLng) * factor;
    s.presentationLat += (effLat - s.presentationLat) * factor;
    return { lng: s.presentationLng, lat: s.presentationLat, smoothed: true, profile: profile,
      velocityLng: s.velocityLng, velocityLat: s.velocityLat };
  }

  // ── Lifecycle / config ──────────────────────────────────────────────────────
  function start() { _active = true; return true; }
  function stop() { _active = false; return true; }
  function isActive() { return _active; }
  function setEnabled(on) { _enabled = on !== false; return _enabled; }
  function setDebug(on) { _debug = on !== false; return _debug; }
  function clear() { _cache = {}; _count = 0; return true; }

  function getState() {
    return { version: VERSION, active: _active, enabled: _enabled, debug: _debug,
      cachedCount: _count, profile: _profile(),
      smoothingFactor: SMOOTHING_FACTOR, maxPredictionS: MAX_PREDICT_S, staleMs: STALE_MS,
      mapAvailable: !!_map(), lastError: _stats.lastError };
  }
  function getStats() {
    return { observed: _stats.observed, updates: _stats.updates, snaps: _stats.snaps,
      predictions: _stats.predictions, cachedCount: _count };
  }
  function inspect(actorId) {
    var s = _cache[actorId];
    if (!s) return null;
    var o = {}; for (var k in s) if (s.hasOwnProperty(k)) o[k] = s[k];
    o.ageMs = Date.now() - s.lastTruthTimestamp;
    return o;
  }

  SBE.BusMotionSmoothing = Object.freeze({
    VERSION:                 VERSION,
    start:                   start,
    stop:                    stop,
    isActive:                isActive,
    observe:                 observe,
    getPresentationPosition: getPresentationPosition,
    clear:                   clear,
    setEnabled:              setEnabled,
    setDebug:                setDebug,
    getState:                getState,
    getStats:                getStats,
    inspect:                 inspect,
  });

  console.log('[BusMotionSmoothing] v' + VERSION + ' loaded (presentation-only continuity)');
})(window);
