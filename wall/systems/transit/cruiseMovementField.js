// ── CruiseMovementField v1.0.0 ────────────────────────────────────────────────
// 0605D_WOS_CruiseMovementField_v1.0.0
// Status: active | Classification: presentation-layer (far-altitude atmosphere)
//
// Far-altitude aggregate transit movement field. At regional/cruise zoom — where
// individual buses are intentionally NOT drawn — this summarizes dense live bus
// truth into tiny screen-space movement pulses ("citywide transit pulse"), so the
// far view feels alive without rendering thousands of vehicle sprites. It SCANS
// bus truth directly (the selector returns 0 individuals at cruise) but is
// READ-ONLY: never mutates truth/metadata/selector/smoothing/presence/WSL/Mapbox.
// Single transparent canvas overlay; cell data computed regardless of canvas.
// Load AFTER transitPresencePass.js. Never throws out of a public call.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';
  var CANVAS_ID = 'wos-cruise-movement-field';
  var SOURCE_ID = 'mta_bus_gtfs_rt_vehicle_positions';
  var MAX_SCAN = 6000;
  var DEFAULT_STALE_MS = 45000;
  var FIELD_PAD = 240;
  var MOVING_MPS = 0.5;

  var PRESETS = {
    clean:      { color: '#bcd6e6', dirTick: false, shimmer: 0.05, dotMul: 0.6, alphaMul: 0.6 },
    night_grid: { color: '#9fd0ff', dirTick: true,  shimmer: 0.18, dotMul: 1.0, alphaMul: 1.0 },
    cyan_infra: { color: '#6dffe8', dirTick: true,  shimmer: 0.22, dotMul: 1.0, alphaMul: 1.0 },
    debug_heat: { color: '#ff5b5b', dirTick: true,  shimmer: 0.3,  dotMul: 1.4, alphaMul: 1.0 },
    off:        { color: '#000',    dirTick: false, shimmer: 0,    dotMul: 0,   alphaMul: 0 },
  };
  var CELL_BUDGET = { low: 0, city: 0, regional: 80, cruise: 160 };

  function _tar() { return SBE.TruthActorRuntime || null; }
  function _mvr() { return SBE.MapboxViewportRuntime || null; }
  function _cfg() { return SBE.MTABusFeedConfig || null; }
  function _map() { var m = _mvr(); try { return (m && typeof m.getMap === 'function') ? m.getMap() : null; } catch (e) { return null; } }
  function _staleMs() { var c = _cfg(); return (c && c.MTA_BUS_STALE_AFTER_MS) || (c && c.staleAfterMs) || DEFAULT_STALE_MS; }
  function _num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }

  var _enabled = true, _active = false, _debug = false;
  var _preset = 'night_grid', _intensity = 1.0, _maxCells = null, _cellSizePx = 96;
  var _cells = [], _pulses = [], _pollTimer = null;
  var _canvas = null, _ctx = null, _container = null, _dpr = 1, _w = 0, _h = 0;
  var _t0 = (global.performance && performance.now) ? performance.now() : Date.now();
  var _state = { lastRenderAt: null, renderCount: 0, lastError: null, profile: 'cruise',
    busActorCount: 0, validBusCount: 0, staleRejected: 0, viewportRejected: 0,
    cellCount: 0, renderedPulseCount: 0, budgetRejected: 0, zeroFieldReason: null };

  function _profileForZoom(z) {
    if (z == null || !isFinite(z)) return 'cruise';
    if (z >= 15.5) return 'low';
    if (z >= 12.0) return 'city';
    if (z >= 9.0) return 'regional';
    return 'cruise';
  }
  function _budgetFor(profile) {
    var base = CELL_BUDGET[profile] != null ? CELL_BUDGET[profile] : 0;
    return _maxCells != null ? Math.min(_maxCells, base) : base;
  }
  function _isBus(a) {
    if (!a) return false;
    if (a.actorType === 'vehicle.bus') return true;
    if (a.sourceId === SOURCE_ID) return true;
    return !!(a.metadata && a.metadata.mode === 'bus' && a.metadata.system === 'mta');
  }
  function _project(map, lng, lat) {
    if (!map || typeof map.project !== 'function') return null;
    try { var p = map.project([lng, lat]); return { x: p.x, y: p.y }; } catch (e) { return null; }
  }
  function _hash(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h * 16777619) >>> 0; } return h; }

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
        _canvas = global.document.createElement('canvas');
        _canvas.id = CANVAS_ID;
        var s = _canvas.style;
        s.position = 'absolute'; s.left = '0'; s.top = '0'; s.right = '0'; s.bottom = '0';
        s.width = '100%'; s.height = '100%'; s.pointerEvents = 'none'; s.mixBlendMode = 'screen'; s.zIndex = '4';
      }
      if (_canvas.parentNode !== _container) { try { _container.appendChild(_canvas); } catch (e) { return false; } }
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
    _w = w; _h = h; _canvas.width = Math.round(w * _dpr); _canvas.height = Math.round(h * _dpr);
    if (_ctx) _ctx.setTransform(_dpr, 0, 0, _dpr, 0, 0);
  }
  function _clearCanvas() { if (_ctx) { try { _ctx.clearRect(0, 0, _w, _h); } catch (e) {} } }
  function _rgba(c, a) {
    if (typeof c === 'string' && c.charAt(0) === '#') { var hx = c.slice(1); if (hx.length === 3) hx = hx[0] + hx[0] + hx[1] + hx[1] + hx[2] + hx[2]; var n = parseInt(hx, 16); return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'; }
    return 'rgba(160,210,255,' + a + ')';
  }

  // ── renderOnce() — aggregate bus truth into a movement field ────────────────
  function renderOnce() {
    _state.renderCount++;
    _state.lastRenderAt = Date.now();
    _state.lastError = null;
    _cells = []; _pulses = []; _reset();

    if (!_enabled || _preset === 'off') { _state.zeroFieldReason = 'disabled'; _clearCanvas(); return _result(true); }
    var tar = _tar();
    if (!tar || typeof tar.listActors !== 'function') { _state.lastError = 'actor_runtime_unavailable'; _state.zeroFieldReason = 'actor_runtime_unavailable'; return _result(false); }
    var map = _map();
    if (!map) { _state.lastError = 'map_unavailable'; _state.zeroFieldReason = 'map_unavailable'; return _result(false); }

    var zoom = null; if (typeof map.getZoom === 'function') { try { zoom = map.getZoom(); } catch (e) {} }
    var profile = _profileForZoom(zoom);
    _state.profile = profile;
    if (profile === 'low' || profile === 'city') { _state.zeroFieldReason = 'off_profile_low_city'; _clearCanvas(); return _result(true); }

    var budget = _budgetFor(profile);
    var all; try { all = tar.listActors(); } catch (e) { all = []; }
    var buses = [];
    for (var i = 0; i < all.length && buses.length < MAX_SCAN; i++) { if (_isBus(all[i])) buses.push(all[i]); }
    _state.busActorCount = buses.length;
    if (buses.length === 0) { _state.zeroFieldReason = 'no_bus_truth'; _clearCanvas(); return _result(true); }

    var now = Date.now(), staleMs = _staleMs();
    var size = _canvasSize(map);
    var cellMap = {};
    for (var j = 0; j < buses.length; j++) {
      var a = buses[j];
      var lat = _num(a.lat), lng = _num(a.lng);
      if (lat == null || lng == null || lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;
      _state.validBusCount++;
      if (a.metadata && a.metadata.presentationEligible === false) continue;
      var ts = _num(a.timestampMs);
      if (ts != null && (now - ts) > staleMs) { _state.staleRejected++; continue; }
      var pt = _project(map, lng, lat);
      if (!pt) { _state.viewportRejected++; continue; }
      if (pt.x < -FIELD_PAD || pt.y < -FIELD_PAD || pt.x > size.w + FIELD_PAD || pt.y > size.h + FIELD_PAD) { _state.viewportRejected++; continue; }

      var cx = Math.floor(pt.x / _cellSizePx), cy = Math.floor(pt.y / _cellSizePx);
      var cellId = cx + ':' + cy;
      var cell = cellMap[cellId];
      if (!cell) { cell = cellMap[cellId] = { cellId: cellId, x: cx * _cellSizePx + _cellSizePx / 2, y: cy * _cellSizePx + _cellSizePx / 2,
        busCount: 0, movingCount: 0, speedSum: 0, headX: 0, headY: 0, routes: {}, newestTimestampMs: 0 }; }
      cell.busCount++;
      var speed = _num(a.speedMps);
      if (speed != null && speed > MOVING_MPS) { cell.movingCount++; cell.speedSum += speed; }
      var hd = _num(a.headingDeg);
      if (hd != null) { var r = hd * Math.PI / 180; cell.headX += Math.sin(r); cell.headY += -Math.cos(r); }
      var route = (a.metadata && a.metadata.routeId) || null;
      if (route && !cell.routes[route]) cell.routes[route] = true;
      if (ts != null && ts > cell.newestTimestampMs) cell.newestTimestampMs = ts;
      // 0605E — hero pulse bias (cell containing a hero bus; applied ≤5%).
      var aa = SBE.TransitAssignmentAuthority;
      if (!cell.hasHero && aa && typeof aa.isHeroVehicle === 'function') {
        var hv = (a.metadata && a.metadata.vehicleId) || a.sourceEntityId || null;
        try { if (hv != null && aa.isHeroVehicle(hv)) cell.hasHero = true; } catch (e) {}
      }
    }

    // Finalize cells + intensity.
    var cells = [];
    for (var id in cellMap) {
      if (!cellMap.hasOwnProperty(id)) continue;
      var c = cellMap[id];
      var fresh = c.newestTimestampMs ? (now - c.newestTimestampMs) : staleMs;
      var density = Math.min(c.busCount / 8, 1) * 0.45;
      var movement = Math.min(c.movingCount / 5, 1) * 0.35;
      var freshness = Math.max(0, 1 - fresh / 45000) * 0.20;
      var intensity = Math.max(0, Math.min(1, density + movement + freshness));
      if (c.hasHero) intensity = Math.min(1, intensity * 1.05);   // 0605E hero bias (≤5%)
      cells.push({ cellId: c.cellId, x: c.x, y: c.y, busCount: c.busCount, movingCount: c.movingCount,
        avgSpeedMps: c.movingCount > 0 ? Math.round((c.speedSum / c.movingCount) * 100) / 100 : 0,
        avgHeadingX: c.busCount > 0 ? c.headX / c.busCount : 0, avgHeadingY: c.busCount > 0 ? c.headY / c.busCount : 0,
        routeSample: Object.keys(c.routes).slice(0, 6), newestTimestampMs: c.newestTimestampMs, freshnessMs: fresh,
        intensity: Math.round(intensity * 1000) / 1000 });
    }
    _state.cellCount = cells.length;

    // Budget: strongest intensity → newest → deterministic cellId.
    cells.sort(function (p, q) {
      if (q.intensity !== p.intensity) return q.intensity - p.intensity;
      if (q.newestTimestampMs !== p.newestTimestampMs) return q.newestTimestampMs - p.newestTimestampMs;
      return p.cellId < q.cellId ? -1 : (p.cellId > q.cellId ? 1 : 0);
    });
    var kept = budget > 0 ? cells.slice(0, budget) : [];
    if (cells.length > kept.length) _state.budgetRejected = cells.length - kept.length;
    _cells = cells;

    // Draw + record pulses.
    _ensureCanvasSafely(); _clearCanvas();
    var preset = PRESETS[_preset] || PRESETS.night_grid;
    var t = ((global.performance && performance.now ? performance.now() : Date.now()) - _t0) / 1000;
    for (var k = 0; k < kept.length; k++) {
      var cc = kept[k];
      var shimmer = 1 - preset.shimmer + preset.shimmer * (0.5 + 0.5 * Math.sin(t * 0.8 + (_hash(cc.cellId) % 628) / 100));
      var alpha = Math.max(0, Math.min(1, cc.intensity * _intensity * preset.alphaMul * shimmer));
      var radius = (6 + cc.intensity * 18) * preset.dotMul;
      _dot(cc.x, cc.y, radius, preset.color, alpha * 0.7);
      if (preset.dirTick && cc.movingCount > 0) {
        var tl = 6 + cc.intensity * 14;
        _lineDir(cc.x, cc.y, cc.avgHeadingX, cc.avgHeadingY, tl, preset.color, alpha * 0.6);
      }
      _pulses.push({ cellId: cc.cellId, screenX: Math.round(cc.x), screenY: Math.round(cc.y),
        busCount: cc.busCount, movingCount: cc.movingCount, avgSpeedMps: cc.avgSpeedMps,
        intensity: cc.intensity, routeSample: cc.routeSample });
    }
    _state.renderedPulseCount = _pulses.length;

    // Zero-field explanation.
    if (_pulses.length === 0) {
      if (_state.validBusCount === 0) _state.zeroFieldReason = 'no_valid_bus_coordinates';
      else if (_state.staleRejected >= _state.validBusCount) _state.zeroFieldReason = 'all_buses_stale';
      else if (cells.length === 0) _state.zeroFieldReason = 'all_buses_outside_viewport';
      else if (budget <= 0 || kept.length === 0) _state.zeroFieldReason = 'no_cells_after_budget';
      else _state.zeroFieldReason = 'unknown';
    } else _state.zeroFieldReason = null;

    if (_debug) console.log('[CruiseField]', _preset, profile, '| buses', buses.length, '| cells', cells.length, '| pulses', _pulses.length, '| budgetRej', _state.budgetRejected);
    return _result(true);
  }

  function _canvasSize(map) { try { var c = map.getCanvas(); return { w: c.clientWidth || c.width || 0, h: c.clientHeight || c.height || 0 }; } catch (e) { return { w: _w, h: _h }; } }
  function _ensureCanvasSafely() { try { _ensureCanvas(); } catch (e) { _ctx = null; } }
  function _dot(x, y, r, color, alpha) {
    if (!_ctx) return;
    try { var g = _ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, _rgba(color, alpha)); g.addColorStop(1, _rgba(color, 0));
      _ctx.fillStyle = g; _ctx.beginPath(); _ctx.arc(x, y, r, 0, Math.PI * 2); _ctx.fill(); } catch (e) {}
  }
  function _lineDir(x, y, hx, hy, len, color, alpha) {
    if (!_ctx) return;
    var m = Math.sqrt(hx * hx + hy * hy) || 1;
    try { _ctx.strokeStyle = _rgba(color, alpha); _ctx.lineWidth = 2; _ctx.beginPath(); _ctx.moveTo(x, y); _ctx.lineTo(x + (hx / m) * len, y + (hy / m) * len); _ctx.stroke(); } catch (e) {}
  }
  function _reset() {
    _state.busActorCount = 0; _state.validBusCount = 0; _state.staleRejected = 0; _state.viewportRejected = 0;
    _state.cellCount = 0; _state.renderedPulseCount = 0; _state.budgetRejected = 0; _state.zeroFieldReason = null;
  }
  function _result(ok) {
    return { ok: ok, preset: _preset, profile: _state.profile,
      busActorCount: _state.busActorCount, validBusCount: _state.validBusCount,
      staleRejected: _state.staleRejected, viewportRejected: _state.viewportRejected,
      cellCount: _state.cellCount, renderedPulseCount: _state.renderedPulseCount,
      budgetRejected: _state.budgetRejected, zeroFieldReason: _state.zeroFieldReason, lastError: _state.lastError };
  }

  function clear() { _cells = []; _pulses = []; _clearCanvas(); return true; }

  // ── Lifecycle / config ──────────────────────────────────────────────────────
  function start(opts) {
    _active = true;
    if (opts && typeof opts.intervalMs === 'number') { var ms = Math.max(15000, opts.intervalMs); _stopPoll(); _pollTimer = global.setInterval(function () { try { renderOnce(); } catch (e) {} }, ms); }
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
  function setIntensity(v) { var n = Number(v); _intensity = isFinite(n) ? Math.max(0, Math.min(1, n)) : _intensity; return _intensity; }
  function setMaxCells(count) { if (count == null) { _maxCells = null; return null; } var n = Number(count); _maxCells = (isFinite(n) && n >= 0) ? Math.floor(n) : null; return _maxCells; }
  function setCellSizePx(px) { var n = Number(px); if (isFinite(n) && n >= 16) _cellSizePx = Math.floor(n); return _cellSizePx; }

  function getCells() { return _cells.slice(); }
  function getRenderedPulses() { return _pulses.slice(); }
  function getState() {
    var tar = _tar(), map = _map();
    return {
      version: VERSION, active: _active, enabled: _enabled, debug: _debug,
      preset: _preset, intensity: _intensity,
      lastRenderAt: _state.lastRenderAt, renderCount: _state.renderCount, lastError: _state.lastError,
      profile: _state.profile, busActorCount: _state.busActorCount, validBusCount: _state.validBusCount,
      staleRejected: _state.staleRejected, viewportRejected: _state.viewportRejected,
      cellCount: _state.cellCount, renderedPulseCount: _state.renderedPulseCount, budgetRejected: _state.budgetRejected,
      cellSizePx: _cellSizePx, maxCells: _maxCells,
      canvasAttached: !!(_canvas && _canvas.parentNode), canvasSize: { width: _w, height: _h, dpr: _dpr },
      zeroFieldReason: _state.zeroFieldReason,
      mapAvailable: !!map, actorRuntimeAvailable: !!(tar && typeof tar.listActors === 'function'),
    };
  }

  SBE.CruiseMovementField = Object.freeze({
    VERSION:           VERSION,
    start:             start,
    stop:              stop,
    isActive:          isActive,
    renderOnce:        renderOnce,
    clear:             clear,
    setEnabled:        setEnabled,
    setDebug:          setDebug,
    setPreset:         setPreset,
    getPreset:         getPreset,
    setIntensity:      setIntensity,
    setMaxCells:       setMaxCells,
    setCellSizePx:     setCellSizePx,
    getState:          getState,
    getCells:          getCells,
    getRenderedPulses: getRenderedPulses,
  });

  console.log('[CruiseMovementField] v' + VERSION + ' loaded (far-altitude aggregate — no individual buses)');
})(window);
