// ── TransitStopDwellCuePass v1.0.0 ────────────────────────────────────────────
// 0605H_WOS_TransitStopDwellCuePass_v1.0.0
// Status: active | Classification: presentation-layer (dwell readability)
//
// Makes stopped/dwelling buses read as intentional transit behavior — not frozen
// telemetry. Dwell is behavior, not failure: moving→motion cues (0605A), stopped→
// dwell cues (here), stale→degraded, lost→released. Subtle pause-halo / door-light
// / dwell-tick / camera target-hold cues over the selector's selectedActors only.
// READ-ONLY: reads selector/camera/smoothing/asset-resolver; writes only its own
// canvas + state. No WSL/Mapbox/truth/selector/camera mutation. Single transparent
// overlay; cue data computed regardless of canvas. Load AFTER transitPresencePass.js
// + transitCameraTargeting.js + articulatedBusPresentationPass.js. Never throws.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';
  var CANVAS_ID = 'wos-transit-dwell';

  var PRESETS = {
    clean:        { halo: 0.4, door: false, tick: false, hold: 0.5, color: '#bfe9ff', door_color: '#ffd166', alphaMul: 0.7 },
    night_city:   { halo: 0.6, door: true,  tick: false, hold: 0.7, color: '#a8e0ff', door_color: '#ffcf6b', alphaMul: 1.0 },
    debug_bright: { halo: 1.0, door: true,  tick: true,  hold: 1.0, color: '#ff5b5b', door_color: '#ffe000', alphaMul: 1.0 },
    off:          { halo: 0,   door: false, tick: false, hold: 0,   color: '#000', door_color: '#000', alphaMul: 0 },
  };
  var CUE_BUDGET = { low: 80, city: 120, regional: 0, cruise: 0 };
  var DEFAULT_STALE_MS = 45000;
  var DWELL_MPS = 0.5;

  function _selector() { return SBE.BusPresentationSelector || null; }
  function _camera() { return SBE.TransitCameraTargeting || null; }
  function _sm() { return SBE.BusMotionSmoothing || null; }
  function _ar() { return SBE.BusAssetResolver || null; }
  function _cfg() { return SBE.MTABusFeedConfig || null; }
  function _mvr() { return SBE.MapboxViewportRuntime || null; }
  function _map() { var m = _mvr(); try { return (m && typeof m.getMap === 'function') ? m.getMap() : null; } catch (e) { return null; } }
  function _staleMs() { var c = _cfg(); return (c && c.MTA_BUS_STALE_AFTER_MS) || (c && c.staleAfterMs) || DEFAULT_STALE_MS; }
  function _num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }

  var _enabled = true, _active = false, _debug = false;
  var _preset = 'night_city', _intensity = 1.0, _maxCues = null;
  var _cues = [], _pollTimer = null;
  var _canvas = null, _ctx = null, _container = null, _dpr = 1, _w = 0, _h = 0;
  var _t0 = (global.performance && performance.now) ? performance.now() : Date.now();
  var _state = { profile: 'city', lastRenderAt: null, renderCount: 0, lastError: null,
    selectedActorCount: 0, dwellCandidateCount: 0, renderedCueCount: 0,
    staleRejected: 0, movingRejected: 0, projectionRejected: 0, budgetRejected: 0 };
  var _stats = { renders: 0, dwellDetections: 0, targetHolds: 0 };

  function _budgetFor(p) { var b = CUE_BUDGET[p] != null ? CUE_BUDGET[p] : 0; return _maxCues != null ? Math.min(_maxCues, b) : b; }
  function _clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function _project(map, lng, lat) { if (!map || typeof map.project !== 'function') return null; try { var p = map.project([lng, lat]); return { x: p.x, y: p.y }; } catch (e) { return null; } }

  // ── Canvas (best-effort; never sets lastError on attach failure) ────────────
  function _ensureCanvas() {
    var map = _map();
    if (!map || typeof map.getContainer !== 'function' || !global.document) return false;
    var container; try { container = map.getContainer(); } catch (e) { return false; }
    if (!container) return false;
    _container = container;
    if (!_canvas) {
      _canvas = global.document.getElementById(CANVAS_ID);
      if (!_canvas) {
        _canvas = global.document.createElement('canvas'); _canvas.id = CANVAS_ID;
        var s = _canvas.style; s.position = 'absolute'; s.left = '0'; s.top = '0'; s.right = '0'; s.bottom = '0';
        s.width = '100%'; s.height = '100%'; s.pointerEvents = 'none'; s.mixBlendMode = 'screen'; s.zIndex = '5';
      }
      if (_canvas.parentNode !== _container) { try { _container.appendChild(_canvas); } catch (e) { return false; } }
      _ctx = _canvas.getContext ? _canvas.getContext('2d') : null;
    }
    _resize(); return true;
  }
  function _resize() {
    if (!_canvas || !_container) return;
    _dpr = Math.min(global.devicePixelRatio || 1, 2);
    var w, h; try { var r = _container.getBoundingClientRect(); w = Math.round(r.width); h = Math.round(r.height); } catch (e) { w = _container.clientWidth || 0; h = _container.clientHeight || 0; }
    _w = w; _h = h; _canvas.width = Math.round(w * _dpr); _canvas.height = Math.round(h * _dpr);
    if (_ctx) _ctx.setTransform(_dpr, 0, 0, _dpr, 0, 0);
  }
  function _clearCanvas() { if (_ctx) { try { _ctx.clearRect(0, 0, _w, _h); } catch (e) {} } }
  function _rgba(c, a) { if (typeof c === 'string' && c.charAt(0) === '#') { var h = c.slice(1); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; var n = parseInt(h, 16); return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'; } return 'rgba(190,233,255,' + a + ')'; }
  function _ring(x, y, r, color, alpha, lw) { if (!_ctx) return; try { _ctx.strokeStyle = _rgba(color, alpha); _ctx.lineWidth = lw || 2; _ctx.beginPath(); _ctx.arc(x, y, r, 0, Math.PI * 2); _ctx.stroke(); } catch (e) {} }
  function _dot(x, y, r, color, alpha) { if (!_ctx) return; try { var g = _ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, _rgba(color, alpha)); g.addColorStop(1, _rgba(color, 0)); _ctx.fillStyle = g; _ctx.beginPath(); _ctx.arc(x, y, r, 0, Math.PI * 2); _ctx.fill(); } catch (e) {} }

  function _cameraTargetInfo() {
    var cam = _camera();
    if (!cam || typeof cam.getState !== 'function') return null;
    try { var s = cam.getState(); return { actorId: s.targetActorId, vehicleId: s.targetVehicleId, status: s.targetStatus }; } catch (e) { return null; }
  }
  function _smoothedPos(actor, map) {
    var sm = _sm();
    if (sm && typeof sm.getPresentationPosition === 'function') {
      try { if (typeof sm.observe === 'function') sm.observe(actor); var sp = sm.getPresentationPosition(actor.actorId); if (sp) return _project(map, sp.lng, sp.lat); } catch (e) {}
    }
    return _project(map, actor.lng, actor.lat);
  }

  // ── renderOnce() ────────────────────────────────────────────────────────────
  function renderOnce() {
    _state.renderCount++; _stats.renders++;
    _state.lastRenderAt = Date.now(); _state.lastError = null;
    _cues = []; _reset();

    if (!_enabled || _preset === 'off') { _state.profile = 'city'; _clearCanvas(); return _result(true); }
    var selector = _selector();
    if (!selector || typeof selector.select !== 'function') { _state.lastError = 'selector_unavailable'; return _result(false); }
    var map = _map();
    if (!map) { _state.lastError = 'map_unavailable'; _clearCanvas(); return _result(false); }

    var selection; try { selection = selector.select(); } catch (e) { selection = null; }
    if (!selection) { _state.lastError = 'selection_unavailable'; return _result(false); }

    var profile = selection.profile || 'city';
    _state.profile = profile;
    var selected = selection.selectedActors || [];
    _state.selectedActorCount = selected.length;
    if (profile === 'regional' || profile === 'cruise') { _clearCanvas(); return _result(true); }   // individual dwell off

    var budget = _budgetFor(profile);
    var preset = PRESETS[_preset] || PRESETS.night_city;
    var now = Date.now(), staleMs = _staleMs();
    var camInfo = _cameraTargetInfo();
    var ar = _ar();
    _ensureCanvasSafely(); _clearCanvas();
    var t = ((global.performance && performance.now ? performance.now() : Date.now()) - _t0) / 1000;

    for (var i = 0; i < selected.length; i++) {
      var c = selected[i]; var actor = (c && c.actor) ? c.actor : c;
      if (!actor) continue;
      var ts = _num(actor.timestampMs);
      var age = ts != null ? (now - ts) : null;
      var vid = (actor.metadata && actor.metadata.vehicleId) || actor.sourceEntityId || null;
      var isTarget = !!(camInfo && ((camInfo.actorId != null && String(camInfo.actorId) === String(actor.actorId)) || (camInfo.vehicleId != null && String(camInfo.vehicleId) === String(vid))));
      var targetDwelling = isTarget && camInfo.status === 'dwelling';

      // Stale rejection (still allow target_hold to read camera intent? spec: stale rejected).
      if (age != null && age > staleMs) { _state.staleRejected++; continue; }

      var speed = _num(actor.speedMps);
      var dwelling = (speed != null && speed < DWELL_MPS) || (speed == null && targetDwelling);
      if (!dwelling) {
        if (speed != null && speed >= DWELL_MPS) { _state.movingRejected++; continue; }
        // unknown speed & not target-dwelling → not a dwell candidate.
        continue;
      }
      _state.dwellCandidateCount++; _stats.dwellDetections++;

      if (_cues.length >= budget) { _state.budgetRejected++; continue; }

      var pt = (c && c.screenX != null && c.screenY != null) ? { x: c.screenX, y: c.screenY } : _smoothedPos(actor, map);
      if (!pt) { _state.projectionRejected++; continue; }

      var freshAlpha = (age == null || age <= 15000) ? 1 : (1 - 0.4 * ((age - 15000) / (staleMs - 15000)));
      var alpha = _clamp(freshAlpha * _intensity * preset.alphaMul, 0, 1);
      var assetClass = (ar && typeof ar.getAssetClass === 'function') ? (function () { try { return ar.getAssetClass(actor); } catch (e) { return null; } })() : null;
      var compact = (profile === 'city');
      var cueTypes = [];

      // pause_halo — pulsing ring.
      var pulse = 0.7 + 0.3 * Math.sin(t * 2.2 + (pt.x + pt.y) * 0.01);
      _ring(pt.x, pt.y, (compact ? 9 : 13), preset.color, alpha * preset.halo * pulse, compact ? 1.5 : 2);
      cueTypes.push('pause_halo');
      // door_light — curb-side hint (low/city per preset).
      if (preset.door) { _dot(pt.x + (compact ? 7 : 10), pt.y, compact ? 3 : 4, preset.door_color, alpha * 0.8); cueTypes.push('door_light'); }
      // dwell_tick — debug blink.
      if (preset.tick) { var blink = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 4)); _dot(pt.x, pt.y - (compact ? 8 : 12), 2, preset.color, alpha * blink); cueTypes.push('dwell_tick'); }
      // target_hold — only the camera-followed dwelling bus.
      if (targetDwelling) { _ring(pt.x, pt.y, (compact ? 14 : 20), preset.door_color, alpha * preset.hold, 2); cueTypes.push('target_hold'); _stats.targetHolds++; }

      _cues.push({ actorId: actor.actorId, vehicleId: vid, routeId: (actor.metadata && actor.metadata.routeId) || null,
        dwellState: 'dwelling', speedMps: speed, freshnessMs: age, screenX: Math.round(pt.x), screenY: Math.round(pt.y),
        busAssetClass: assetClass, isCameraTarget: isTarget, cueTypes: cueTypes });
    }
    _state.renderedCueCount = _cues.length;
    if (_debug) console.log('[TransitDwell]', _preset, profile, '| dwell', _state.dwellCandidateCount, '| cues', _cues.length, '| movingRej', _state.movingRejected, '| staleRej', _state.staleRejected);
    return _result(true);
  }

  function _ensureCanvasSafely() { try { _ensureCanvas(); } catch (e) { _ctx = null; } }
  function _reset() {
    _state.selectedActorCount = 0; _state.dwellCandidateCount = 0; _state.renderedCueCount = 0;
    _state.staleRejected = 0; _state.movingRejected = 0; _state.projectionRejected = 0; _state.budgetRejected = 0;
  }
  function _result(ok) {
    return { ok: ok, preset: _preset, profile: _state.profile, selectedActorCount: _state.selectedActorCount,
      dwellCandidateCount: _state.dwellCandidateCount, renderedCueCount: _state.renderedCueCount,
      staleRejected: _state.staleRejected, movingRejected: _state.movingRejected,
      projectionRejected: _state.projectionRejected, budgetRejected: _state.budgetRejected, lastError: _state.lastError };
  }
  function clear() { _cues = []; _clearCanvas(); return true; }

  // ── Lifecycle / config ──────────────────────────────────────────────────────
  function start(opts) {
    _active = true;
    if (opts && typeof opts.intervalMs === 'number') { var ms = Math.max(1000, opts.intervalMs); _stopPoll(); _pollTimer = global.setInterval(function () { try { renderOnce(); } catch (e) {} }, ms); }
    _ensureCanvasSafely(); try { renderOnce(); } catch (e) {}
    return true;
  }
  function _stopPoll() { if (_pollTimer) { try { global.clearInterval(_pollTimer); } catch (e) {} _pollTimer = null; } }
  function stop() { _active = false; _stopPoll(); clear(); if (_canvas) _canvas.style.display = 'none'; return true; }
  function isActive() { return _active; }
  function setEnabled(on) { _enabled = on !== false; if (!_enabled) clear(); if (_canvas) _canvas.style.display = _enabled ? '' : 'none'; return _enabled; }
  function setDebug(on) { _debug = on !== false; return _debug; }
  function setPreset(name) { if (!PRESETS[name]) return false; _preset = name; return _preset; }
  function getPreset() { return _preset; }
  function setIntensity(v) { var n = Number(v); _intensity = isFinite(n) ? _clamp(n, 0, 1) : _intensity; return _intensity; }
  function setMaxCues(count) { if (count == null) { _maxCues = null; return null; } var n = Number(count); _maxCues = (isFinite(n) && n >= 0) ? Math.floor(n) : null; return _maxCues; }

  function getRenderedCues() { return _cues.slice(); }
  function getStats() { return { renders: _stats.renders, dwellDetections: _stats.dwellDetections, targetHolds: _stats.targetHolds }; }
  function getState() {
    return { version: VERSION, active: _active, enabled: _enabled, debug: _debug, preset: _preset, intensity: _intensity,
      profile: _state.profile, selectedActorCount: _state.selectedActorCount, dwellCandidateCount: _state.dwellCandidateCount,
      renderedCueCount: _state.renderedCueCount, staleRejected: _state.staleRejected, movingRejected: _state.movingRejected,
      projectionRejected: _state.projectionRejected, budgetRejected: _state.budgetRejected,
      lastRenderAt: _state.lastRenderAt, renderCount: _state.renderCount, lastError: _state.lastError,
      canvasAttached: !!(_canvas && _canvas.parentNode) };
  }

  SBE.TransitStopDwellCuePass = Object.freeze({
    VERSION:         VERSION,
    start:           start,
    stop:            stop,
    isActive:        isActive,
    renderOnce:      renderOnce,
    clear:           clear,
    setEnabled:      setEnabled,
    setDebug:        setDebug,
    setPreset:       setPreset,
    getPreset:       getPreset,
    setIntensity:    setIntensity,
    setMaxCues:      setMaxCues,
    getState:        getState,
    getRenderedCues: getRenderedCues,
    getStats:        getStats,
  });

  console.log('[TransitStopDwellCuePass] v' + VERSION + ' loaded (dwell readability — presentation only)');
})(window);
