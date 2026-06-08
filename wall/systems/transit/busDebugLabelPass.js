// ── BusDebugLabelPass v1.0.0 ──────────────────────────────────────────────────
// 0604L_WOS_BusDebugLabelPass_v1.0.0
// Status: active | Classification: debug-infrastructure (NOT presentation)
//
// Debug-only label overlay for live MTA buses: improves observability, camera
// targeting, and future bus-follow workflows. Labels are DEBUG INFRASTRUCTURE —
// the world must remain fully readable with labels disabled. READ-ONLY: attaches
// only to `selectedActors` from SBE.BusPresentationSelector (never runs its own
// actor scan), never mutates TruthActorRuntime, the selector, the renderer, WSL,
// or Mapbox sources/layers. Single transparent canvas overlay, no DOM-per-bus.
// Load AFTER busVisualFallbackRenderer.js. Never throws out of a public call.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';
  var CANVAS_ID = 'wos-bus-debug-labels';

  var MODES = { off: 1, route: 1, vehicle: 1, route_vehicle: 1, technical: 1 };
  var LABEL_BUDGET = { low: 40, city: 20, regional: 0, cruise: 0 };

  function _selector() { return SBE.BusPresentationSelector || null; }
  function _mvr() { return SBE.MapboxViewportRuntime || null; }
  function _map() { var m = _mvr(); try { return (m && typeof m.getMap === 'function') ? m.getMap() : null; } catch (e) { return null; } }

  var _enabled = true, _active = false, _debug = false;
  var _mode = 'route';
  var _maxLabelsOverride = null;
  var _followedRoute = null, _followedVehicle = null;
  var _labels = [];   // last computed visible labels
  var _canvas = null, _ctx = null, _container = null;
  var _state = { profile: 'city', labelBudget: LABEL_BUDGET.city, lastRenderAt: null, renderCount: 0, lastError: null };

  function _num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
  function _budgetFor(profile) {
    var base = LABEL_BUDGET[profile] != null ? LABEL_BUDGET[profile] : 0;
    return _maxLabelsOverride != null ? Math.min(_maxLabelsOverride, base) : base;
  }
  function _project(map, lng, lat) {
    if (!map || typeof map.project !== 'function') return null;
    try { var p = map.project([lng, lat]); return { x: p.x, y: p.y }; } catch (e) { return null; }
  }

  function _labelText(c, actor) {
    var route = c.routeId || (actor.metadata && actor.metadata.routeId) || null;
    var veh = c.vehicleId || (actor.metadata && actor.metadata.vehicleId) || actor.sourceEntityId || null;
    if (_mode === 'route') return route || '—';
    if (_mode === 'vehicle') return veh || '—';
    if (_mode === 'route_vehicle') return (route || '?') + ' • ' + (veh || '?');
    if (_mode === 'technical') {
      var sp = _num(actor.speedMps);
      var ts = _num(actor.timestampMs);
      var ageS = ts != null ? Math.max(0, Math.round((Date.now() - ts) / 1000)) : null;
      var lines = [route || '—', veh || '—'];
      lines.push((sp != null ? (Math.round(sp * 10) / 10) : '?') + ' m/s');
      lines.push('age: ' + (ageS != null ? ageS : '?') + 's');
      return lines.join('\n');
    }
    return '';
  }

  // ── Canvas overlay (best-effort; label data exists regardless of canvas) ─────
  function _ensureCanvas() {
    var map = _map();
    if (!map || typeof map.getContainer !== 'function' || !global.document) return false;
    var container; try { container = map.getContainer(); } catch (e) { return false; }
    if (!container) return false;
    _container = container;
    if (!_canvas) {
      _canvas = global.document.getElementById(CANVAS_ID);
      if (!_canvas) {
        _canvas = global.document.createElement('canvas');
        _canvas.id = CANVAS_ID;
        var s = _canvas.style;
        s.position = 'absolute'; s.left = '0'; s.top = '0'; s.right = '0'; s.bottom = '0';
        s.width = '100%'; s.height = '100%'; s.pointerEvents = 'none'; s.zIndex = '6';
      }
      if (_canvas.parentNode !== _container) { try { _container.appendChild(_canvas); } catch (e) { return false; } }
      _ctx = _canvas.getContext ? _canvas.getContext('2d') : null;
    }
    return true;
  }
  function _resizeCanvas(map) {
    if (!_canvas || !_container) return { w: 0, h: 0 };
    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    var w, h;
    try { var r = _container.getBoundingClientRect(); w = Math.round(r.width); h = Math.round(r.height); }
    catch (e) { w = _container.clientWidth || 0; h = _container.clientHeight || 0; }
    _canvas.width = Math.round(w * dpr); _canvas.height = Math.round(h * dpr);
    if (_ctx) _ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: w, h: h };
  }
  function _paint() {
    if (!_ctx) return;
    try {
      _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
      _ctx.font = '11px ui-monospace, Menlo, monospace';
      _ctx.textBaseline = 'top';
      for (var i = 0; i < _labels.length; i++) {
        var L = _labels[i];
        if (L.screenX == null) continue;
        var lines = String(L.text).split('\n');
        var pad = 3, lh = 13, x = L.screenX + 6, y = L.screenY - 6;
        var wMax = 0;
        for (var m = 0; m < lines.length; m++) { var tw = _ctx.measureText(lines[m]).width; if (tw > wMax) wMax = tw; }
        _ctx.fillStyle = L.followed ? 'rgba(255,196,0,0.85)' : 'rgba(8,16,22,0.66)';
        _ctx.fillRect(x - pad, y - pad, wMax + pad * 2, lines.length * lh + pad);
        _ctx.fillStyle = L.followed ? '#1a1200' : '#bfe9ff';
        for (var n = 0; n < lines.length; n++) _ctx.fillText(lines[n], x, y + n * lh);
      }
    } catch (e) { _state.lastError = 'paint_failed'; }
  }

  // ── renderOnce() — attach labels to the selector's selectedActors ────────────
  function renderOnce() {
    _state.renderCount++;
    _state.lastRenderAt = Date.now();
    _state.lastError = null;
    _labels = [];

    if (!_enabled || _mode === 'off') { _state.labelBudget = 0; _paintClear(); return _result(); }
    var selector = _selector();
    if (!selector || typeof selector.select !== 'function') { _state.lastError = 'selector_unavailable'; _paintClear(); return _result(); }

    var selection;
    try { selection = selector.select(); } catch (e) { selection = null; }
    if (!selection) { _state.lastError = 'selection_unavailable'; _paintClear(); return _result(); }

    var profile = selection.profile || 'city';
    _state.profile = profile;
    var budget = _budgetFor(profile);
    _state.labelBudget = budget;

    // Altitude rule: labels only at low/city.
    if (profile === 'regional' || profile === 'cruise' || budget <= 0) { _paintClear(); return _result(); }

    var map = _map();
    var selected = selection.selectedActors || [];
    var count = Math.min(budget, selected.length);   // labels never exceed visible bus count
    for (var i = 0; i < count; i++) {
      var c = selected[i];
      var actor = (c && c.actor) ? c.actor : c;
      if (!actor) continue;
      var route = c.routeId || (actor.metadata && actor.metadata.routeId) || null;
      var veh = c.vehicleId || (actor.metadata && actor.metadata.vehicleId) || actor.sourceEntityId || null;
      var sx = c.screenX, sy = c.screenY;
      if ((sx == null || sy == null) && map) { var pt = _project(map, actor.lng, actor.lat); if (pt) { sx = Math.round(pt.x); sy = Math.round(pt.y); } }
      var followed = (_followedRoute != null && route === _followedRoute) || (_followedVehicle != null && String(veh) === String(_followedVehicle));
      _labels.push({ actorId: actor.actorId, routeId: route, vehicleId: veh != null ? String(veh) : null,
        text: _labelText(c, actor), screenX: sx != null ? sx : null, screenY: sy != null ? sy : null, followed: !!followed });
    }

    if (_ensureCanvas()) { _resizeCanvas(map); _paint(); }
    if (_debug) console.log('[BusDebugLabel]', _mode, profile, '| budget', budget, '| labels', _labels.length);
    return _result();
  }

  function _paintClear() { if (_ensureCanvas()) { _resizeCanvas(_map()); if (_ctx) { try { _ctx.clearRect(0, 0, _canvas.width, _canvas.height); } catch (e) {} } } }
  function _result() {
    return { ok: true, mode: _mode, profile: _state.profile, labelBudget: _state.labelBudget,
      visibleLabels: _labels.length, followedRoute: _followedRoute, followedVehicle: _followedVehicle, lastError: _state.lastError };
  }

  function clear() {
    _labels = [];
    if (_canvas && _ctx) { try { _ctx.clearRect(0, 0, _canvas.width, _canvas.height); } catch (e) {} }
    return true;
  }

  // ── Follow helpers (highlight + report; camera control deferred) ────────────
  function _followReport() {
    var selector = _selector();
    var matches = [];
    if (selector && typeof selector.select === 'function') {
      var sel = null; try { sel = selector.select(); } catch (e) {}
      if (sel) {
        var pool = (sel.selectedActors || []).concat(sel.readyActors || []);
        for (var i = 0; i < pool.length; i++) {
          var c = pool[i]; var a = (c && c.actor) ? c.actor : c;
          var route = c.routeId || (a.metadata && a.metadata.routeId) || null;
          var veh = c.vehicleId || (a.metadata && a.metadata.vehicleId) || a.sourceEntityId || null;
          var hit = (_followedRoute != null && route === _followedRoute) || (_followedVehicle != null && String(veh) === String(_followedVehicle));
          if (hit) matches.push({ actorId: a.actorId, routeId: route, vehicleId: veh != null ? String(veh) : null,
            lat: a.lat, lng: a.lng, screenX: c.screenX != null ? c.screenX : null, screenY: c.screenY != null ? c.screenY : null });
        }
      }
    }
    return matches;
  }
  function followRoute(routeId) {
    _followedRoute = (routeId != null && String(routeId).trim()) ? String(routeId).trim() : null;
    _followedVehicle = null;
    renderOnce();
    return { ok: true, followedRoute: _followedRoute, matches: _followReport(), cameraControl: 'deferred' };
  }
  function followVehicle(vehicleId) {
    _followedVehicle = (vehicleId != null && String(vehicleId).trim()) ? String(vehicleId).trim() : null;
    _followedRoute = null;
    renderOnce();
    return { ok: true, followedVehicle: _followedVehicle, matches: _followReport(), cameraControl: 'deferred' };
  }
  function clearFollow() { _followedRoute = null; _followedVehicle = null; renderOnce(); return true; }

  // ── Lifecycle / config ──────────────────────────────────────────────────────
  function start() { _active = true; try { renderOnce(); } catch (e) {} return true; }
  function stop() { _active = false; clear(); return true; }
  function isActive() { return _active; }
  function setEnabled(on) { _enabled = on !== false; if (!_enabled) clear(); return _enabled; }
  function setDebug(on) { _debug = on !== false; return _debug; }
  function setMode(mode) { if (!MODES[mode]) return false; _mode = mode; return _mode; }
  function setMaxLabels(count) { var n = Number(count); _maxLabelsOverride = (isFinite(n) && n >= 0) ? Math.floor(n) : null; return _maxLabelsOverride; }

  function getVisibleLabels() { return _labels.slice(); }
  function getState() {
    var map = _map(), selector = _selector();
    return {
      version: VERSION, active: _active, enabled: _enabled, debug: _debug, mode: _mode,
      visibleLabels: _labels.length, labelBudget: _state.labelBudget, profile: _state.profile,
      followedRoute: _followedRoute, followedVehicle: _followedVehicle,
      lastRenderAt: _state.lastRenderAt, renderCount: _state.renderCount, lastError: _state.lastError,
      mapAvailable: !!map, selectorAvailable: !!(selector && typeof selector.select === 'function'),
    };
  }

  SBE.BusDebugLabelPass = Object.freeze({
    VERSION:          VERSION,
    start:            start,
    stop:             stop,
    isActive:         isActive,
    renderOnce:       renderOnce,
    clear:            clear,
    setEnabled:       setEnabled,
    setDebug:         setDebug,
    setMode:          setMode,
    setMaxLabels:     setMaxLabels,
    getState:         getState,
    getVisibleLabels: getVisibleLabels,
    followRoute:      followRoute,
    followVehicle:    followVehicle,
    clearFollow:      clearFollow,
  });

  console.log('[BusDebugLabelPass] v' + VERSION + ' loaded (debug-only labels — not presentation)');
})(window);
