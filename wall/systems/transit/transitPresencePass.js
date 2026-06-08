// ── TransitPresencePass v1.0.0 ────────────────────────────────────────────────
// 0605A_WOS_TransitPresencePass_v1.0.0
// Status: active | Classification: presentation-layer (atmosphere-only)
//
// Adds lightweight screen-space presence cues (headlight, taillight, class-accent
// glow, subtle motion streak) to the buses the selector already chose. Presence
// is NOT physics: it decorates, never interpolates or moves actors. READ-ONLY to
// the world — reads BusPresentationSelector.select() + BusAssetResolver only,
// never mutates truth/selector/resolver/WSL/Mapbox/Studio/assets. Single
// transparent canvas overlay (no DOM-per-bus, no Mapbox source/layer). Manual
// renderOnce() by default. Load AFTER busAssetResolver.js / busDebugLabelPass.js.
// Never throws out of a public call.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';
  var CANVAS_ID = 'wos-transit-presence';

  var PRESETS = {
    clean:        { headTail: true, accent: 0.25, streak: false, bloom: 0.0,  warm: '#ffe9c2', cool: '#dff3ff', alphaMul: 0.7 },
    night_city:   { headTail: true, accent: 0.55, streak: true,  bloom: 0.35, warm: '#ffb86b', cool: '#eaf6ff', alphaMul: 1.0 },
    cyan_infra:   { headTail: true, accent: 0.65, streak: true,  bloom: 0.4,  warm: '#ff9d5c', cool: '#7dffe8', alphaMul: 1.0 },
    debug_bright: { headTail: true, accent: 1.0,  streak: true,  bloom: 0.6,  warm: '#ff5b5b', cool: '#9be7ff', alphaMul: 1.0 },
    off:          { headTail: false, accent: 0,   streak: false, bloom: 0,    warm: '#000', cool: '#000', alphaMul: 0 },
  };
  var CUE_BUDGET = { low: 80, city: 160, regional: 260, cruise: 0 };
  var CLASS_SPAN = { standard: 1.0, articulated: 1.3, express: 1.1, shuttle: 0.8, special: 1.15 };
  var FRESH_FULL_MS = 15000, FRESH_FADE_MS = 45000, MOVING_MPS = 0.5;

  function _selector() { return SBE.BusPresentationSelector || null; }
  function _resolver() { return SBE.BusAssetResolver || null; }
  function _mvr() { return SBE.MapboxViewportRuntime || null; }
  function _map() { var m = _mvr(); try { return (m && typeof m.getMap === 'function') ? m.getMap() : null; } catch (e) { return null; } }

  var _enabled = true, _active = false, _debug = false;
  var _preset = 'night_city', _intensity = 1.0, _maxCues = null;
  var _cues = [];
  var _canvas = null, _ctx = null, _container = null, _dpr = 1, _w = 0, _h = 0;
  var _t0 = (global.performance && performance.now) ? performance.now() : Date.now();
  var _state = { lastRenderAt: null, renderCount: 0, lastError: null, profile: 'city',
    selectedActorCount: 0, cueCandidateCount: 0, renderedCueCount: 0, skippedCount: 0,
    projectionRejected: 0, cruiseRejected: 0, budgetRejected: 0 };

  function _num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
  function _budgetFor(profile) {
    var base = CUE_BUDGET[profile] != null ? CUE_BUDGET[profile] : 0;
    return _maxCues != null ? Math.min(_maxCues, base) : base;
  }
  function _project(map, lng, lat) {
    if (!map || typeof map.project !== 'function') return null;
    try { var p = map.project([lng, lat]); return { x: p.x, y: p.y }; } catch (e) { return null; }
  }

  // ── Canvas overlay (best-effort; cue data exists regardless of canvas) ───────
  // Best-effort canvas attach. Failure here is NOT a render error — cue data is
  // computed regardless of canvas, so this never writes _state.lastError.
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
        s.width = '100%'; s.height = '100%'; s.pointerEvents = 'none'; s.mixBlendMode = 'screen'; s.zIndex = '5';
      }
      if (_canvas.parentNode !== _container) { try { _container.appendChild(_canvas); } catch (e) { _state.lastError = 'attach_failed'; return false; } }
      _ctx = _canvas.getContext ? _canvas.getContext('2d') : null;
    }
    _resizeCanvas();
    return true;
  }
  function _resizeCanvas() {
    if (!_canvas || !_container) return;
    _dpr = Math.min(global.devicePixelRatio || 1, 2);
    var w, h;
    try { var r = _container.getBoundingClientRect(); w = Math.round(r.width); h = Math.round(r.height); }
    catch (e) { w = _container.clientWidth || 0; h = _container.clientHeight || 0; }
    _w = w; _h = h;
    _canvas.width = Math.round(w * _dpr); _canvas.height = Math.round(h * _dpr);
    if (_ctx) _ctx.setTransform(_dpr, 0, 0, _dpr, 0, 0);
  }
  function _clearCanvas() { if (_ctx) { try { _ctx.clearRect(0, 0, _w, _h); } catch (e) {} } }

  function _dot(x, y, r, color, alpha) {
    if (!_ctx) return;
    try {
      var g = _ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, _rgba(color, alpha));
      g.addColorStop(1, _rgba(color, 0));
      _ctx.fillStyle = g; _ctx.beginPath(); _ctx.arc(x, y, r, 0, Math.PI * 2); _ctx.fill();
    } catch (e) {}
  }
  function _line(x1, y1, x2, y2, color, alpha, w) {
    if (!_ctx) return;
    try { _ctx.strokeStyle = _rgba(color, alpha); _ctx.lineWidth = w || 2; _ctx.beginPath(); _ctx.moveTo(x1, y1); _ctx.lineTo(x2, y2); _ctx.stroke(); } catch (e) {}
  }
  function _rgba(c, a) {
    if (typeof c === 'string' && c.charAt(0) === '#') {
      var h = c.slice(1); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      var n = parseInt(h, 16); return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
    }
    return 'rgba(255,255,255,' + a + ')';
  }

  // ── renderOnce() — decorate selector.selectedActors ─────────────────────────
  function renderOnce() {
    _state.renderCount++;
    _state.lastRenderAt = Date.now();
    _state.lastError = null;
    _cues = [];
    _resetCounts();

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

    if (profile === 'cruise') {
      // Selector already returns 0 selected at cruise; report would-be buses.
      _state.cruiseRejected = (selection.counts && selection.counts.validBusActors) || selected.length || 0;
      _clearCanvas(); return _result(true);
    }

    var budget = _budgetFor(profile);
    var preset = PRESETS[_preset] || PRESETS.night_city;
    var resolver = _resolver();
    var now = Date.now();

    _ensureCanvasSafely();
    _clearCanvas();

    var candidate = 0;
    for (var i = 0; i < selected.length; i++) {
      var c = selected[i];
      var actor = (c && c.actor) ? c.actor : c;
      if (!actor) continue;
      candidate++;
      if (_cues.length >= budget) { _state.budgetRejected++; continue; }

      // 0605B — attach cues to the smoothed presentation position when available,
      // so glows/streaks track continuous motion (presence never smooths itself).
      var pLng = actor.lng, pLat = actor.lat, usedSmoothed = false;
      var sm = SBE.BusMotionSmoothing;
      if (sm && typeof sm.getPresentationPosition === 'function') {
        try { sm.observe(actor); var sp = sm.getPresentationPosition(actor.actorId); if (sp) { pLng = sp.lng; pLat = sp.lat; usedSmoothed = true; } } catch (e) {}
      }
      var pt = usedSmoothed ? _project(map, pLng, pLat)
        : ((c && c.screenX != null && c.screenY != null) ? { x: c.screenX, y: c.screenY } : _project(map, actor.lng, actor.lat));
      if (!pt) { _state.projectionRejected++; continue; }

      // Class + freshness.
      var ap = resolver && typeof resolver.getPresentationProfile === 'function'
        ? (function () { try { return resolver.getPresentationProfile(actor); } catch (e) { return null; } })() : null;
      var assetClass = ap ? ap.assetClass : null;
      var accent = ap ? ap.accent : (preset.cool);
      // 0605C — subtle livery accent influence (no ads/graffiti drawing here).
      var lh = SBE.TransitLiveryHooks;
      if (lh && typeof lh.resolveForActor === 'function') {
        try { var lv = lh.resolveForActor(actor); if (lv && lv.accent) accent = lv.accent; } catch (e) {}
      }
      var span = (assetClass && CLASS_SPAN[assetClass] != null) ? CLASS_SPAN[assetClass] : 1.0;

      var ts = _num(actor.timestampMs);
      var age = ts != null ? (now - ts) : 0;
      if (age > FRESH_FADE_MS) { _state.skippedCount++; continue; }   // would not be selected; skip
      var freshAlpha = age <= FRESH_FULL_MS ? 1 : (1 - 0.5 * ((age - FRESH_FULL_MS) / (FRESH_FADE_MS - FRESH_FULL_MS)));
      var alpha = _clamp(freshAlpha * _intensity * preset.alphaMul, 0, 1);
      // 0605E — subtle hero visibility boost (max +15%). No particles/beams.
      var aa = SBE.TransitAssignmentAuthority;
      if (aa && typeof aa.isHeroVehicle === 'function') {
        var hvid = (actor.metadata && actor.metadata.vehicleId) || actor.sourceEntityId || null;
        try { if (hvid != null && aa.isHeroVehicle(hvid)) alpha = _clamp(alpha * 1.15, 0, 1); } catch (e) {}
      }

      var headingDeg = _num(actor.headingDeg) || 0;
      var rad = headingDeg * Math.PI / 180;
      var hx = Math.sin(rad), hy = -Math.cos(rad);   // screen-space heading unit vector
      var speed = _num(actor.speedMps);
      var cueTypes = [];

      if (profile === 'regional') {
        // Tiny light pulse only.
        _dot(pt.x, pt.y, 4, accent, 0.5 * alpha);
        cueTypes.push('regional_light');
      } else {
        // low / city — head + tail + class accent (+ optional streak).
        var span2 = (profile === 'city') ? 7 * span : 10 * span;   // compact at city
        var fx = pt.x + hx * span2, fy = pt.y + hy * span2;
        var rx = pt.x - hx * span2, ry = pt.y - hy * span2;
        if (preset.headTail) {
          _dot(fx, fy, (profile === 'city' ? 4 : 6), preset.cool, alpha * 0.9);
          _dot(rx, ry, (profile === 'city' ? 3 : 5), preset.warm, alpha * 0.85);
          cueTypes.push('headlight'); cueTypes.push('taillight');
        }
        if (preset.accent > 0) {
          _dot(pt.x, pt.y, (profile === 'city' ? 7 : 10) * span, accent, alpha * 0.35 * preset.accent);
          cueTypes.push('class_accent');
        }
        if (preset.streak && speed != null && speed > MOVING_MPS) {
          var tl = (profile === 'city' ? 10 : 16) * Math.min(2, speed / 8 + 0.6);
          _line(pt.x, pt.y, pt.x - hx * tl, pt.y - hy * tl, accent, alpha * 0.4, profile === 'city' ? 2 : 3);
          cueTypes.push('motion_streak');
        }
      }

      _cues.push({ actorId: actor.actorId,
        vehicleId: (actor.metadata && actor.metadata.vehicleId) || actor.sourceEntityId || null,
        routeId: (actor.metadata && actor.metadata.routeId) || null,
        busAssetClass: assetClass, profile: profile, cueTypes: cueTypes,
        screenX: Math.round(pt.x), screenY: Math.round(pt.y) });
    }
    _state.cueCandidateCount = candidate;
    _state.renderedCueCount = _cues.length;
    if (_debug) console.log('[TransitPresence]', _preset, profile, '| budget', budget, '| candidates', candidate, '| cues', _cues.length, '| projRej', _state.projectionRejected, '| budgetRej', _state.budgetRejected);
    return _result(true);
  }

  function _ensureCanvasSafely() { try { _ensureCanvas(); } catch (e) { _ctx = null; } }
  function _clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function _resetCounts() {
    _state.selectedActorCount = 0; _state.cueCandidateCount = 0; _state.renderedCueCount = 0;
    _state.skippedCount = 0; _state.projectionRejected = 0; _state.cruiseRejected = 0; _state.budgetRejected = 0;
  }
  function _result(ok) {
    return { ok: ok, preset: _preset, profile: _state.profile,
      selectedActorCount: _state.selectedActorCount, cueCandidateCount: _state.cueCandidateCount,
      renderedCueCount: _state.renderedCueCount, projectionRejected: _state.projectionRejected,
      cruiseRejected: _state.cruiseRejected, budgetRejected: _state.budgetRejected, lastError: _state.lastError };
  }

  function clear() { _cues = []; _clearCanvas(); return true; }

  // ── Lifecycle / config ──────────────────────────────────────────────────────
  function start(opts) {
    _active = true;
    if (opts && typeof opts.intervalMs === 'number') {
      var ms = Math.max(15000, opts.intervalMs);
      _stopPoll();
      _pollTimer = global.setInterval(function () { try { renderOnce(); } catch (e) {} }, ms);
    }
    _ensureCanvasSafely();
    try { renderOnce(); } catch (e) {}
    return true;
  }
  var _pollTimer = null;
  function _stopPoll() { if (_pollTimer) { try { global.clearInterval(_pollTimer); } catch (e) {} _pollTimer = null; } }
  function stop() { _active = false; _stopPoll(); clear(); if (_canvas) _canvas.style.display = 'none'; return true; }
  function isActive() { return _active; }

  function setEnabled(on) { _enabled = on !== false; if (!_enabled) clear(); if (_canvas) _canvas.style.display = _enabled ? '' : 'none'; return _enabled; }
  function setDebug(on) { _debug = on !== false; return _debug; }
  function setPreset(name) { if (!PRESETS[name]) return false; _preset = name; return _preset; }
  function getPreset() { return _preset; }
  function setIntensity(v) { var n = Number(v); _intensity = isFinite(n) ? _clamp(n, 0, 1) : _intensity; return _intensity; }
  function setMaxCues(count) { var n = Number(count); _maxCues = (isFinite(n) && n >= 0) ? Math.floor(n) : null; return _maxCues; }

  function getRenderedCues() { return _cues.slice(); }
  function getState() {
    return {
      version: VERSION, active: _active, enabled: _enabled, debug: _debug,
      preset: _preset, intensity: _intensity, maxCues: _maxCues,
      lastRenderAt: _state.lastRenderAt, renderCount: _state.renderCount, lastError: _state.lastError,
      profile: _state.profile, selectedActorCount: _state.selectedActorCount,
      cueCandidateCount: _state.cueCandidateCount, renderedCueCount: _state.renderedCueCount,
      skippedCount: _state.skippedCount, projectionRejected: _state.projectionRejected,
      cruiseRejected: _state.cruiseRejected, budgetRejected: _state.budgetRejected,
      canvasAttached: !!(_canvas && _canvas.parentNode),
      canvasSize: { width: _w, height: _h, dpr: _dpr },
    };
  }

  SBE.TransitPresencePass = Object.freeze({
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
  });

  console.log('[TransitPresencePass] v' + VERSION + ' loaded (presentation-only atmosphere)');
})(window);
