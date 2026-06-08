// ── BusPresentationSelector v1.0.0 ────────────────────────────────────────────
// 0604K_WOS_BusPresentationSelector_v1.0.0
// Status: active | Classification: interpretation-layer (selection authority)
//
// The authority for "which vehicle.bus actors should render right now". Separates
// camera-aware SELECTION policy (viewport zones, altitude budgets, readiness
// buffer, route focus, scoring) from the RENDERER (0604J), which keeps drawing.
// READ-ONLY: never writes TruthActorRuntime, WSL, Mapbox, adapter/bridge rows,
// assets, Studio, or maritime/transit siblings. Writes selector-local state only.
// No continuous RAF. Deterministic for identical input. Never throws publicly.
// Load AFTER mtaBusActorBridge.js, BEFORE busVisualFallbackRenderer.js.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';
  var SOURCE_ID = 'mta_bus_gtfs_rt_vehicle_positions';
  var MAX_SCAN_ACTORS = 6000;
  var DEFAULT_STALE_MS = 45000;
  var DEFAULT_VIEWPORT_PAD = 160;
  var DEFAULT_READINESS_PAD = 600;
  var MOVING_MPS = 0.5;

  // Altitude profiles (zoom proxy) → budget.
  var PROFILES = {
    low:      { minZoom: 15.5, budget: 120 },
    city:     { minZoom: 12.0, budget: 300 },
    regional: { minZoom: 9.0,  budget: 500 },
    cruise:   { minZoom: -Infinity, budget: 0 },
  };
  // Scoring weights (normalized 0..1 factors).
  var W = { center: 0.50, freshness: 0.20, routeFocus: 0.15, movement: 0.10, routeKnown: 0.05 };

  function _tar() { return SBE.TruthActorRuntime || null; }
  function _mvr() { return SBE.MapboxViewportRuntime || null; }
  function _cfg() { return SBE.MTABusFeedConfig || null; }
  function _map() { var m = _mvr(); try { return (m && typeof m.getMap === 'function') ? m.getMap() : null; } catch (e) { return null; } }
  function _staleMs() { var c = _cfg(); return (c && c.MTA_BUS_STALE_AFTER_MS) || (c && c.staleAfterMs) || DEFAULT_STALE_MS; }

  var _enabled = true, _active = false, _debug = false;
  var _viewportPad = DEFAULT_VIEWPORT_PAD, _readinessPad = DEFAULT_READINESS_PAD;
  var _budgetOverrides = {};   // profileName → count
  var _routeFocus = {};        // routeId → true
  var _routeFocusActive = false;
  var _state = {
    lastSelectAt: null, selectCount: 0, lastError: null,
    profile: 'city', budget: PROFILES.city.budget, truncated: false,
    totalBusActors: 0, selectedCount: 0, readyCount: 0, zeroRenderReason: null,
  };
  var _lastSelection = null;
  var _lastCounts = null;

  function _num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
  function _isBus(a) {
    if (!a) return false;
    if (a.actorType === 'vehicle.bus') return true;
    if (a.sourceId === SOURCE_ID) return true;
    return !!(a.metadata && a.metadata.mode === 'bus' && a.metadata.system === 'mta');
  }
  function _clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

  function _profileForZoom(zoom) {
    if (zoom == null || !isFinite(zoom)) return 'city';
    if (zoom >= PROFILES.low.minZoom) return 'low';
    if (zoom >= PROFILES.city.minZoom) return 'city';
    if (zoom >= PROFILES.regional.minZoom) return 'regional';
    return 'cruise';
  }
  function _budgetFor(profileName) {
    if (profileName === 'cruise') return 0;
    var base = PROFILES[profileName].budget;
    return _budgetOverrides[profileName] != null ? _budgetOverrides[profileName] : base;
  }
  function _project(map, lng, lat) {
    if (!map || typeof map.project !== 'function') return null;
    try { var p = map.project([lng, lat]); return { x: p.x, y: p.y }; } catch (e) { return null; }
  }
  function _canvasSize(map) {
    try { var c = map.getCanvas(); return { w: c.clientWidth || c.width || 0, h: c.clientHeight || c.height || 0 }; }
    catch (e) { return { w: 0, h: 0 }; }
  }

  // ── select() / selectFromActors(actors) ─────────────────────────────────────
  function select() {
    var tar = _tar();
    var actors = (tar && typeof tar.listActors === 'function') ? (function () { try { return tar.listActors(); } catch (e) { return []; } })() : null;
    return _selectInternal(actors, !!(tar && typeof tar.listActors === 'function'));
  }
  function selectFromActors(actors) { return _selectInternal(actors, true); }

  function _empty(reason, profileName, budget) {
    var counts = { totalBusActors: 0, scannedActors: 0, validBusActors: 0, staleRejected: 0,
      invalidRejected: 0, presentationRejected: 0, viewportRejected: 0, readinessOnly: 0, selected: 0, budget: budget || 0 };
    _record(profileName || 'city', budget || 0, [], [], counts, reason);
    return { ok: true, profile: profileName || 'city', budget: budget || 0,
      selectedActors: [], readyActors: [], counts: counts, zeroRenderReason: reason };
  }

  function _selectInternal(actors, tarAvailable) {
    _state.selectCount++;
    _state.lastSelectAt = Date.now();
    _state.lastError = null;

    if (!_enabled) { _state.lastError = 'disabled'; return _fail('disabled'); }
    if (!tarAvailable) { _state.lastError = 'actor_runtime_unavailable'; return _fail('actor_runtime_unavailable'); }
    var map = _map();
    if (!map) { _state.lastError = 'map_unavailable'; return _fail('map_unavailable'); }

    var zoom = null;
    if (typeof map.getZoom === 'function') { try { zoom = map.getZoom(); } catch (e) {} }
    var profileName = _profileForZoom(zoom);
    var budget = _budgetFor(profileName);

    actors = Array.isArray(actors) ? actors : [];
    // Bus filter + deterministic scan cap.
    var buses = [];
    for (var i = 0; i < actors.length && buses.length < MAX_SCAN_ACTORS; i++) { if (_isBus(actors[i])) buses.push(actors[i]); }
    _state.truncated = false;
    // count total bus actors (uncapped) for honesty.
    var totalBus = 0; for (var z = 0; z < actors.length; z++) if (_isBus(actors[z])) totalBus++;
    if (totalBus > MAX_SCAN_ACTORS) _state.truncated = true;

    var counts = { totalBusActors: totalBus, scannedActors: buses.length, validBusActors: 0,
      staleRejected: 0, invalidRejected: 0, presentationRejected: 0, viewportRejected: 0,
      readinessOnly: 0, selected: 0, budget: budget };

    if (totalBus === 0) return _empty('no_bus_truth', profileName, budget);

    var now = Date.now();
    var staleMs = _staleMs();
    var size = _canvasSize(map);
    var cx = size.w / 2, cy = size.h / 2;
    var diag = Math.sqrt(size.w * size.w + size.h * size.h) || 1;

    var visible = [], ready = [];
    for (var j = 0; j < buses.length; j++) {
      var a = buses[j];
      var lat = _num(a.lat), lng = _num(a.lng);
      if (lat == null || lng == null || lat < -90 || lat > 90 || lng < -180 || lng > 180) { counts.invalidRejected++; continue; }
      counts.validBusActors++;
      if (a.metadata && a.metadata.presentationEligible === false) { counts.presentationRejected++; continue; }
      var ts = _num(a.timestampMs);
      if (ts != null && (now - ts) > staleMs) { counts.staleRejected++; continue; }

      var pt = _project(map, lng, lat);
      if (!pt) { counts.viewportRejected++; continue; }
      var inVisible = pt.x >= -_viewportPad && pt.y >= -_viewportPad && pt.x <= size.w + _viewportPad && pt.y <= size.h + _viewportPad;
      var inReady = pt.x >= -_readinessPad && pt.y >= -_readinessPad && pt.x <= size.w + _readinessPad && pt.y <= size.h + _readinessPad;

      var dx = pt.x - cx, dy = pt.y - cy;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var ageMs = ts != null ? (now - ts) : staleMs;
      var routeId = (a.metadata && a.metadata.routeId) || null;
      var speed = _num(a.speedMps);

      var centerScore = 1 - _clamp01(dist / (0.5 * diag + _viewportPad));
      var freshScore = 1 - _clamp01(ageMs / staleMs);
      var focusScore = (_routeFocusActive && routeId && _routeFocus[routeId]) ? 1 : 0;
      var moveScore = (speed != null && speed > MOVING_MPS) ? 1 : 0;
      var knownScore = routeId ? 1 : 0;
      var score = W.center * centerScore + W.freshness * freshScore + W.routeFocus * focusScore + W.movement * moveScore + W.routeKnown * knownScore;
      score = Math.round(score * 1e6) / 1e6;

      var cand = {
        actor: a, actorId: a.actorId, lat: lat, lng: lng,
        routeId: routeId, vehicleId: (a.metadata && a.metadata.vehicleId) || a.sourceEntityId || null,
        screenX: Math.round(pt.x), screenY: Math.round(pt.y),
        distanceToViewportCenterPx: Math.round(dist), freshnessMs: ageMs,
        score: score, selectionReason: null,
      };
      if (inVisible) visible.push(cand);
      else if (inReady) { cand.selectionReason = 'readiness_buffer'; ready.push(cand); counts.readinessOnly++; }
      else counts.viewportRejected++;
    }

    // Deterministic ordering: score desc, then actorId asc.
    function cmp(p, q) {
      if (q.score !== p.score) return q.score - p.score;
      return String(p.actorId) < String(q.actorId) ? -1 : (String(p.actorId) > String(q.actorId) ? 1 : 0);
    }
    visible.sort(cmp); ready.sort(cmp);

    var selectedActors;
    var zeroReason = null;
    if (profileName === 'cruise') { selectedActors = []; zeroReason = 'cruise_profile_individual_buses_disabled'; }
    else if (budget <= 0) { selectedActors = []; zeroReason = 'budget_zero'; }
    else {
      selectedActors = visible.slice(0, budget);
      for (var s = 0; s < selectedActors.length; s++) selectedActors[s].selectionReason = 'selected_in_viewport';
    }
    counts.selected = selectedActors.length;

    if (zeroReason == null && selectedActors.length === 0) {
      if (counts.validBusActors === 0) zeroReason = 'no_valid_bus_coordinates';
      else if (counts.staleRejected > 0 && counts.staleRejected >= counts.validBusActors - counts.presentationRejected) zeroReason = 'all_buses_stale';
      else if (visible.length === 0) zeroReason = 'all_buses_outside_viewport';
      else zeroReason = 'unknown';
    }

    _record(profileName, budget, selectedActors, ready, counts, zeroReason);
    if (_debug) console.log('[BusSelector]', profileName, 'budget', budget, '| valid', counts.validBusActors, '| selected', selectedActors.length, '| ready', ready.length, '| zero', zeroReason);
    return { ok: true, profile: profileName, budget: budget,
      selectedActors: selectedActors, readyActors: ready, counts: counts, zeroRenderReason: zeroReason };
  }

  function _fail(reason) {
    var counts = { totalBusActors: 0, scannedActors: 0, validBusActors: 0, staleRejected: 0,
      invalidRejected: 0, presentationRejected: 0, viewportRejected: 0, readinessOnly: 0, selected: 0, budget: 0 };
    _record(_state.profile, 0, [], [], counts, reason);
    return { ok: false, profile: _state.profile, budget: 0, selectedActors: [], readyActors: [], counts: counts, zeroRenderReason: reason };
  }

  function _record(profileName, budget, selected, ready, counts, zeroReason) {
    _state.profile = profileName; _state.budget = budget;
    _state.totalBusActors = counts.totalBusActors;
    _state.selectedCount = selected.length; _state.readyCount = ready.length;
    _state.zeroRenderReason = zeroReason;
    _lastCounts = counts;
    _lastSelection = { profile: profileName, budget: budget, selectedActors: selected, readyActors: ready, counts: counts, zeroRenderReason: zeroReason };
  }

  // ── Lifecycle / config ──────────────────────────────────────────────────────
  function start() { _active = true; return true; }
  function stop() { _active = false; return true; }
  function isActive() { return _active; }
  function setEnabled(on) { _enabled = on !== false; return _enabled; }
  function setDebug(on) { _debug = on !== false; return _debug; }

  function setRouteFocus(routeIds) {
    var arr = Array.isArray(routeIds) ? routeIds : (routeIds != null ? [routeIds] : []);
    _routeFocus = {};
    for (var i = 0; i < arr.length; i++) { var r = arr[i]; if (r != null && String(r).trim()) _routeFocus[String(r).trim()] = true; }
    _routeFocusActive = Object.keys(_routeFocus).length > 0;
    return Object.keys(_routeFocus);
  }
  function clearRouteFocus() { _routeFocus = {}; _routeFocusActive = false; return true; }

  function setMaxVisible(profile, count) {
    if (!PROFILES.hasOwnProperty(profile)) return false;
    var n = Number(count);
    if (!isFinite(n) || n < 0) { delete _budgetOverrides[profile]; return null; }
    _budgetOverrides[profile] = Math.floor(n);
    return _budgetOverrides[profile];
  }
  function setViewportPaddingPx(px) { var n = Number(px); if (isFinite(n) && n >= 0) _viewportPad = Math.floor(n); return _viewportPad; }
  function setReadinessPaddingPx(px) { var n = Number(px); if (isFinite(n) && n >= 0) _readinessPad = Math.floor(n); return _readinessPad; }

  function getLastSelection() { return _lastSelection; }
  function getRejectSummary() {
    if (!_lastCounts) return null;
    return { staleRejected: _lastCounts.staleRejected, invalidRejected: _lastCounts.invalidRejected,
      presentationRejected: _lastCounts.presentationRejected, viewportRejected: _lastCounts.viewportRejected,
      readinessOnly: _lastCounts.readinessOnly, zeroRenderReason: _state.zeroRenderReason };
  }
  function getState() {
    var tar = _tar(), map = _map();
    return {
      version: VERSION, active: _active, enabled: _enabled, debug: _debug,
      lastSelectAt: _state.lastSelectAt, selectCount: _state.selectCount, lastError: _state.lastError,
      profile: _state.profile, budget: _state.budget,
      viewportPaddingPx: _viewportPad, readinessPaddingPx: _readinessPad,
      maxScanActors: MAX_SCAN_ACTORS, truncated: _state.truncated,
      routeFocusActive: _routeFocusActive, routeFocus: Object.keys(_routeFocus),
      totalBusActors: _state.totalBusActors, selectedCount: _state.selectedCount,
      readyCount: _state.readyCount, zeroRenderReason: _state.zeroRenderReason,
      mapAvailable: !!map, actorRuntimeAvailable: !!(tar && typeof tar.listActors === 'function'),
    };
  }

  SBE.BusPresentationSelector = Object.freeze({
    VERSION:              VERSION,
    start:                start,
    stop:                 stop,
    isActive:             isActive,
    select:               select,
    selectFromActors:     selectFromActors,
    getState:             getState,
    getLastSelection:     getLastSelection,
    getRejectSummary:     getRejectSummary,
    setEnabled:           setEnabled,
    setDebug:             setDebug,
    setRouteFocus:        setRouteFocus,
    clearRouteFocus:      clearRouteFocus,
    setMaxVisible:        setMaxVisible,
    setViewportPaddingPx: setViewportPaddingPx,
    setReadinessPaddingPx: setReadinessPaddingPx,
  });

  console.log('[BusPresentationSelector] v' + VERSION + ' loaded (selection authority — no WSL/truth writes)');
})(window);
