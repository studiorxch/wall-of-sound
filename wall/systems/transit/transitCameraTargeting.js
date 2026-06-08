// ── TransitCameraTargeting v1.0.0 ─────────────────────────────────────────────
// 0605F_WOS_TransitCameraTargeting_v1.0.0
// Status: active | Classification: presentation-layer (camera request)
//
// Lets the camera "care" about assigned/selected buses. A bus follow is NOT a car
// follow: buses stop, dwell, jump between feed updates, go stale, and disappear —
// the camera must respect that (hold composition, ease jumps, freeze-then-release
// on stale, report lost). This is a presentation CAMERA-REQUEST layer, never a new
// camera engine: it resolves targets + forms requests and submits to an existing
// camera/viewport authority when present, else returns camera_unavailable. READ-
// ONLY to the world (only BusMotionSmoothing.observe() is allowed). Load AFTER
// transitAssignmentAuthority.js + busMotionSmoothing.js. Never throws publicly.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';
  var SOURCE_ID = 'mta_bus_gtfs_rt_vehicle_positions';
  var MAX_SCAN = 6000;
  var DEFAULT_STALE_MS = 45000;
  var DEFAULT_DWELL_HOLD_MS = 90000;
  var DEFAULT_STALE_HOLD_MS = 15000;
  var JUMP_DISTANCE_M = 120;
  var JUMP_CORRECTION_EASE_MS = 1800;
  var ROUTE_RETARGET_MIN_MS = 30000;
  var FOLLOW_TICK_MS = 1000;
  var STOPPED_MPS = 0.5;

  function _aa() { return SBE.TransitAssignmentAuthority || null; }
  function _tar() { return SBE.TruthActorRuntime || null; }
  function _sm() { return SBE.BusMotionSmoothing || null; }
  function _sel() { return SBE.BusPresentationSelector || null; }
  function _mvr() { return SBE.MapboxViewportRuntime || null; }
  function _cfg() { return SBE.MTABusFeedConfig || null; }
  function _map() { var m = _mvr(); try { return (m && typeof m.getMap === 'function') ? m.getMap() : null; } catch (e) { return null; } }
  function _staleMs() { var c = _cfg(); return (c && c.MTA_BUS_STALE_AFTER_MS) || (c && c.staleAfterMs) || DEFAULT_STALE_MS; }
  function _num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }

  var _enabled = true, _active = false, _debug = false;
  var _mode = 'follow';
  var _dwellHoldMs = DEFAULT_DWELL_HOLD_MS, _staleHoldMs = DEFAULT_STALE_HOLD_MS, _correctionEase = JUMP_CORRECTION_EASE_MS;
  var _target = null;            // TransitCameraTarget
  var _lastTickAt = null, _routeTargetAt = null, _lastError = null;
  var _stats = { resolves: 0, successfulResolves: 0, failedResolves: 0, cameraRequests: 0, cameraUnavailable: 0,
    staleHolds: 0, lostTargets: 0, dwellDetections: 0, jumpCorrections: 0,
    followHeroCalls: 0, followVehicleCalls: 0, followRouteCalls: 0, followActorCalls: 0 };

  function _isBus(a) {
    if (!a) return false;
    if (a.actorType === 'vehicle.bus') return true;
    if (a.sourceId === SOURCE_ID) return true;
    return !!(a.metadata && a.metadata.mode === 'bus' && a.metadata.system === 'mta');
  }
  function _vid(a) { var md = (a && a.metadata) || {}; return md.vehicleId != null ? md.vehicleId : (a && a.sourceEntityId != null ? a.sourceEntityId : null); }
  function _rid(a) { var md = (a && a.metadata) || {}; return md.routeId != null ? md.routeId : (a && a.routeId != null ? a.routeId : null); }
  function _busActors() {
    var tar = _tar(); if (!tar || typeof tar.listActors !== 'function') return [];
    var out = []; var all; try { all = tar.listActors(); } catch (e) { return []; }
    for (var i = 0; i < all.length && out.length < MAX_SCAN; i++) if (_isBus(all[i])) out.push(all[i]);
    return out;
  }
  function _findByVehicle(vid) { var b = _busActors(); for (var i = 0; i < b.length; i++) if (String(_vid(b[i])) === String(vid)) return b[i]; return null; }
  function _findByActor(aid) { var b = _busActors(); for (var i = 0; i < b.length; i++) if (String(b[i].actorId) === String(aid)) return b[i]; return null; }

  function _presentationPos(actor) {
    if (!actor) return null;
    var sm = _sm();
    if (sm && typeof sm.getPresentationPosition === 'function') {
      try { if (typeof sm.observe === 'function') sm.observe(actor); var sp = sm.getPresentationPosition(actor.actorId); if (sp) return { lng: sp.lng, lat: sp.lat, smoothed: sp.smoothed !== false }; } catch (e) {}
    }
    return (actor.lng != null && actor.lat != null) ? { lng: actor.lng, lat: actor.lat, smoothed: false } : null;
  }
  function _distM(aLng, aLat, bLng, bLat) {
    var dLat = (bLat - aLat) * 111320;
    var dLng = (bLng - aLng) * 111320 * Math.cos(((aLat + bLat) / 2) * Math.PI / 180);
    return Math.sqrt(dLat * dLat + dLng * dLng);
  }

  // ── Camera request formation + submission ───────────────────────────────────
  function _makeRequest(target, mode, reason, easeMs) {
    return { source: 'transit-camera-targeting', targetType: target.targetType, targetKey: target.targetKey,
      lng: target.presentationLng != null ? target.presentationLng : target.lng,
      lat: target.presentationLat != null ? target.presentationLat : target.lat,
      headingDeg: target.headingDeg, mode: mode, zoom: null, pitch: null, bearing: null,
      easeMs: easeMs, reason: reason };
  }
  function _submit(request, aggressive) {
    if (request.lng == null || request.lat == null) { _lastError = 'invalid_target'; return false; }
    // Priority: ViewportAuthority → AttentionGeography → Mapbox easeTo/flyTo.
    var va = SBE.ViewportAuthority;
    if (va && typeof va.requestCamera === 'function') { try { va.requestCamera(request); _stats.cameraRequests++; _markReq(); return true; } catch (e) {} }
    var ag = SBE.AttentionGeography;
    if (ag && typeof ag.focusOn === 'function') { try { ag.focusOn(request); _stats.cameraRequests++; _markReq(); return true; } catch (e) {} }
    var map = _map();
    if (map) {
      var opts = { center: [request.lng, request.lat], duration: request.easeMs };
      try {
        if (aggressive && typeof map.flyTo === 'function') { map.flyTo(opts); _stats.cameraRequests++; _markReq(); return true; }
        if (typeof map.easeTo === 'function') { map.easeTo(opts); _stats.cameraRequests++; _markReq(); return true; }
        if (typeof map.flyTo === 'function') { map.flyTo(opts); _stats.cameraRequests++; _markReq(); return true; }
      } catch (e) {}
    }
    _stats.cameraUnavailable++; _lastError = 'camera_authority_unavailable';
    return false;
  }
  function _markReq() { if (_target) _target.lastCameraRequestAt = Date.now(); }

  // ── Target creation ─────────────────────────────────────────────────────────
  function _newTarget(type, key, actor) {
    var aa = _aa();
    var asg = (aa && typeof aa.resolve === 'function' && actor) ? (function () { try { return aa.resolve(actor); } catch (e) { return null; } })() : null;
    return { targetType: type, targetKey: key != null ? String(key) : null,
      actorId: actor ? actor.actorId : null, vehicleId: actor ? _vid(actor) : null, routeId: actor ? _rid(actor) : null,
      label: asg && asg.ok ? asg.label : null, assignmentId: asg && asg.ok ? asg.assignmentId : null, assignmentType: asg && asg.ok ? asg.assignmentType : null,
      status: 'resolved', lng: actor ? actor.lng : null, lat: actor ? actor.lat : null,
      presentationLng: null, presentationLat: null, speedMps: actor ? _num(actor.speedMps) : null,
      headingDeg: actor ? _num(actor.headingDeg) : null, freshnessMs: null,
      lastResolvedAt: Date.now(), lastCameraRequestAt: null };
  }

  // ── Status classification + position refresh (re-resolve) ───────────────────
  function _refresh(submit, aggressive) {
    if (!_target) return { ok: false, reason: 'invalid_target' };
    _stats.resolves++;
    var actor = null;
    if (_target.targetType === 'route') actor = _pickRouteActor(_target.targetKey, true);
    else if (_target.targetType === 'actor') actor = _findByActor(_target.targetKey);
    else actor = _findByVehicle(_target.targetKey);   // hero_bus + vehicle

    var now = Date.now(), staleMs = _staleMs();
    if (!actor) {
      // Disappeared — hold last known until staleHold, then lost.
      var sinceResolve = now - (_target.lastResolvedAt || now);
      if (sinceResolve <= _staleHoldMs) { _target.status = 'stale_hold'; _stats.staleHolds++; _lastError = 'target_stale'; return { ok: true, status: 'stale_hold' }; }
      _target.status = 'lost'; _stats.lostTargets++; _stats.failedResolves++; _lastError = 'target_lost'; return { ok: false, reason: 'target_lost', status: 'lost' };
    }

    var ts = _num(actor.timestampMs);
    var age = ts != null ? (now - ts) : 0;
    _target.freshnessMs = age;
    _target.actorId = actor.actorId; _target.vehicleId = _vid(actor); _target.routeId = _rid(actor);
    _target.speedMps = _num(actor.speedMps); _target.headingDeg = _num(actor.headingDeg);
    _target.lng = actor.lng; _target.lat = actor.lat;

    var pos = _presentationPos(actor);
    var jumped = false;
    if (pos) {
      if (_target.presentationLng != null) {
        var d = _distM(_target.presentationLng, _target.presentationLat, pos.lng, pos.lat);
        if (d > JUMP_DISTANCE_M) { jumped = true; _stats.jumpCorrections++; }
      }
      _target.presentationLng = pos.lng; _target.presentationLat = pos.lat;
    }
    _target.lastResolvedAt = now;
    _stats.successfulResolves++;

    // Status: stale → dwelling → following/resolved.
    if (age > staleMs + _staleHoldMs) { _target.status = 'lost'; _stats.lostTargets++; _lastError = 'target_lost'; return { ok: false, reason: 'target_lost', status: 'lost' }; }
    if (age > staleMs) { _target.status = 'stale_hold'; _stats.staleHolds++; _lastError = 'target_stale'; }
    else if (_target.speedMps != null && _target.speedMps < STOPPED_MPS) { _target.status = 'dwelling'; _stats.dwellDetections++; _lastError = null; }
    else { _target.status = (_mode === 'follow') ? 'following' : 'resolved'; _lastError = null; }

    // Submit a camera request (lost/stale handled above; never panic-snap).
    if (submit && _mode !== 'off' && _target.status !== 'lost') {
      var ease = jumped ? _correctionEase : (aggressive ? 600 : (_mode === 'inspect' ? 700 : 1200));
      var reqMode = (_mode === 'orbit') ? (_orbitSupported() ? 'orbit' : 'frame') : _mode;
      _submit(_makeRequest(_target, reqMode, jumped ? 'jump_correction' : ('tick_' + _target.status), ease), aggressive);
    }
    return { ok: true, status: _target.status, jumped: jumped };
  }
  function _orbitSupported() { var va = SBE.ViewportAuthority; return !!(va && typeof va.orbit === 'function'); }

  function _pickRouteActor(routeId, allowCached) {
    var buses = _busActors();
    var cand = [];
    for (var i = 0; i < buses.length; i++) if (String(_rid(buses[i])) === String(routeId)) cand.push(buses[i]);
    if (!cand.length) return null;
    // 1. selector-selected on route (highest-ranked).
    var sel = _sel();
    if (sel && typeof sel.select === 'function') {
      var s = null; try { s = sel.select(); } catch (e) {}
      if (s && s.selectedActors) {
        for (var j = 0; j < s.selectedActors.length; j++) {
          var sa = s.selectedActors[j]; var act = (sa && sa.actor) ? sa.actor : sa;
          if (act && String(_rid(act)) === String(routeId)) { for (var k = 0; k < cand.length; k++) if (cand[k].actorId === act.actorId) return cand[k]; return act; }
        }
      }
    }
    // 2. nearest viewport center.
    var map = _map();
    if (map && typeof map.project === 'function') {
      var w = 0, h = 0; try { var cv = map.getCanvas(); w = cv.clientWidth || 0; h = cv.clientHeight || 0; } catch (e) {}
      var cx = w / 2, cy = h / 2, best = null, bd = Infinity;
      for (var n = 0; n < cand.length; n++) { var b = cand[n]; if (b.lng == null) continue; var pt; try { pt = map.project([b.lng, b.lat]); } catch (e) { continue; } var dd = (pt.x - cx) * (pt.x - cx) + (pt.y - cy) * (pt.y - cy); if (dd < bd) { bd = dd; best = b; } }
      if (best) return best;
    }
    // 3. freshest, then 4. actorId asc.
    cand.sort(function (p, q) { var pt = _num(p.timestampMs) || 0, qt = _num(q.timestampMs) || 0; if (qt !== pt) return qt - pt; return String(p.actorId) < String(q.actorId) ? -1 : 1; });
    return cand[0];
  }

  // ── Public follow API ───────────────────────────────────────────────────────
  function _guards() {
    if (!_enabled) return 'disabled';
    if (!_aa()) return 'assignment_authority_unavailable';
    if (!_tar() || typeof _tar().listActors !== 'function') return 'actor_runtime_unavailable';
    return null;
  }
  function _result(ok, reason) { return { ok: ok, targetType: _target ? _target.targetType : null, targetStatus: _target ? _target.status : 'none', lastError: _lastError, reason: reason || null, target: _target }; }

  function followHeroBus() {
    _stats.followHeroCalls++;
    var g = _guards(); if (g) { _lastError = g; return _result(false, g); }
    var aa = _aa(); var hero = (typeof aa.getHeroBus === 'function') ? aa.getHeroBus() : null;
    if (!hero || hero.vehicleId == null) { _lastError = 'no_hero_bus'; return _result(false, 'no_hero_bus'); }
    var actor = _findByVehicle(hero.vehicleId);
    _target = _newTarget('hero_bus', hero.vehicleId, actor);
    if (!actor) { _lastError = 'vehicle_not_found'; }
    var r = _refresh(true, false); _lastError = actor ? _lastError : 'vehicle_not_found';
    return _result(!!actor, actor ? null : 'vehicle_not_found');
  }
  function followVehicle(vehicleId) {
    _stats.followVehicleCalls++;
    var g = _guards(); if (g) { _lastError = g; return _result(false, g); }
    var actor = _findByVehicle(vehicleId);
    if (!actor) { _lastError = 'vehicle_not_found'; _target = _newTarget('vehicle', vehicleId, null); return _result(false, 'vehicle_not_found'); }
    _target = _newTarget('vehicle', vehicleId, actor); _refresh(true, false);
    return _result(true);
  }
  function followRoute(routeId) {
    _stats.followRouteCalls++;
    var g = _guards(); if (g) { _lastError = g; return _result(false, g); }
    var actor = _pickRouteActor(routeId, false);
    if (!actor) { _lastError = 'route_not_found'; _target = _newTarget('route', routeId, null); return _result(false, 'route_not_found'); }
    _target = _newTarget('route', routeId, actor); _routeTargetAt = Date.now(); _refresh(true, false);
    return _result(true);
  }
  function followActor(actorId) {
    _stats.followActorCalls++;
    var g = _guards(); if (g) { _lastError = g; return _result(false, g); }
    var actor = _findByActor(actorId);
    if (!actor) { _lastError = 'actor_not_found'; _target = _newTarget('actor', actorId, null); return _result(false, 'actor_not_found'); }
    _target = _newTarget('actor', actorId, actor); _refresh(true, false);
    return _result(true);
  }

  function jumpToTarget() { if (!_target) { _lastError = 'invalid_target'; return _result(false, 'invalid_target'); } _refresh(true, true); return _result(true); }
  function frameTarget() { if (!_target) { _lastError = 'invalid_target'; return _result(false, 'invalid_target'); } var prev = _mode; _mode = 'frame'; var r = _refresh(true, false); _mode = prev === 'off' ? 'frame' : prev; return _result(true); }
  function orbitTarget() {
    if (!_target) { _lastError = 'invalid_target'; return _result(false, 'invalid_target'); }
    var supported = _orbitSupported(); var prev = _mode; _mode = supported ? 'orbit' : 'frame';
    _refresh(true, false); var deg = supported ? null : 'frame'; _mode = prev;
    var res = _result(true); res.degradedTo = deg; return res;
  }
  function clearTarget() { _target = null; _routeTargetAt = null; _lastError = null; return true; }

  function tick() {
    _lastTickAt = Date.now();
    if (!_target || _mode === 'off' || !_enabled) return _result(!!_target);
    _refresh(true, false);
    return _result(_target.status !== 'lost');
  }
  function renderOnce() { return tick(); }

  // ── Accessors / config ──────────────────────────────────────────────────────
  function getTarget() { return _target ? (function () { var o = {}; for (var k in _target) o[k] = _target[k]; return o; })() : null; }
  function getTargetActor() {
    if (!_target) return null;
    if (_target.targetType === 'route') return _pickRouteActor(_target.targetKey, true);
    if (_target.targetType === 'actor') return _findByActor(_target.targetKey);
    return _findByVehicle(_target.targetKey);
  }
  function getTargetPosition() {
    var actor = getTargetActor();
    if (!actor) return _target && _target.presentationLng != null ? { lng: _target.presentationLng, lat: _target.presentationLat, smoothed: false, stale: true } : null;
    return _presentationPos(actor);
  }

  function start() { _active = true; return true; }
  function stop() { _active = false; return true; }
  function isActive() { return _active; }
  function setEnabled(on) { _enabled = on !== false; return _enabled; }
  function setDebug(on) { _debug = on !== false; return _debug; }
  function setMode(mode) { if (['off', 'follow', 'frame', 'orbit', 'inspect'].indexOf(mode) === -1) return false; _mode = mode; return _mode; }
  function setDwellHoldMs(ms) { var n = Number(ms); if (isFinite(n) && n >= 0) _dwellHoldMs = n; return _dwellHoldMs; }
  function setStaleHoldMs(ms) { var n = Number(ms); if (isFinite(n) && n >= 0) _staleHoldMs = n; return _staleHoldMs; }
  function setCorrectionEase(v) { var n = Number(v); if (isFinite(n) && n >= 0) _correctionEase = n; return _correctionEase; }

  function getState() {
    return { version: VERSION, active: _active, enabled: _enabled, debug: _debug, mode: _mode,
      targetType: _target ? _target.targetType : null, targetKey: _target ? _target.targetKey : null,
      targetStatus: _target ? _target.status : 'none',
      targetActorId: _target ? _target.actorId : null, targetVehicleId: _target ? _target.vehicleId : null, targetRouteId: _target ? _target.routeId : null,
      lastTargetResolvedAt: _target ? _target.lastResolvedAt : null, lastCameraRequestAt: _target ? _target.lastCameraRequestAt : null, lastTickAt: _lastTickAt,
      dwellHoldMs: _dwellHoldMs, staleHoldMs: _staleHoldMs, correctionEase: _correctionEase, lastError: _lastError };
  }
  function getStats() { var o = {}; for (var k in _stats) o[k] = _stats[k]; return o; }

  SBE.TransitCameraTargeting = Object.freeze({
    VERSION:            VERSION,
    start:              start,
    stop:               stop,
    isActive:           isActive,
    followHeroBus:      followHeroBus,
    followVehicle:      followVehicle,
    followRoute:        followRoute,
    followActor:        followActor,
    jumpToTarget:       jumpToTarget,
    orbitTarget:        orbitTarget,
    frameTarget:        frameTarget,
    clearTarget:        clearTarget,
    getTarget:          getTarget,
    getTargetActor:     getTargetActor,
    getTargetPosition:  getTargetPosition,
    renderOnce:         renderOnce,
    tick:               tick,
    getState:           getState,
    getStats:           getStats,
    setEnabled:         setEnabled,
    setDebug:           setDebug,
    setMode:            setMode,
    setDwellHoldMs:     setDwellHoldMs,
    setStaleHoldMs:     setStaleHoldMs,
    setCorrectionEase:  setCorrectionEase,
  });

  console.log('[TransitCameraTargeting] v' + VERSION + ' loaded (camera requests — not a camera engine)');
})(window);
