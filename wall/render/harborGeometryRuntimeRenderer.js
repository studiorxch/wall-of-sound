// ── HarborGeometryRuntimeRenderer v1.0.0 ─────────────────────────────────────
// 0528G_WOS_HarborGeometryRuntimeRenderer_v1.0.0 — production layer
// Status: active
// Classification: production-renderer — safe for normal runtime
//
// Purpose:
//   Render baked harbor geometry as a normal cinematic layer.
//   Reads from SBE.HarborGeometryRegistry, styles from
//   SBE.HarborGeometryRuntimeStyle, opacity/LOD gated by sector focus and
//   altitude world state.
//
// Z-order: 6.4 — above Mapbox base, below altitude/cloud/aircraft layers.
//
// Draw order (back → front):
//   waterfront_block, island, harbor_channel, ferry_slip,
//   pier, shoreline, bridge_context, hero_landmark
//
// Authority:
//   READS:  SBE.HarborGeometryRegistry, SBE.HarborGeometryRuntimeStyle,
//           SBE.HarborSectorAuthority, SBE.AltitudeWorldState,
//           SBE.MapboxViewportRuntime
//   WRITES: own canvas pixels only
//   MUST NOT MUTATE: any registry, runtime state, Mapbox style
//
// Placement: wall/render/harborGeometryRuntimeRenderer.js
// Load: AFTER harborGeometryRuntimeStyle.js, AFTER harborGeometryRegistry.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  var VERSION = '1.0.0';

  // ── Constants ─────────────────────────────────────────────────────────────────

  var LAYER_ORDER = [
    'waterfront_block', 'island', 'harbor_channel',
    'ferry_slip', 'pier', 'shoreline', 'bridge_context', 'hero_landmark',
  ];

  var SECTOR_FOCUS_THRESHOLD = 0.12;
  var DEFAULT_OPACITY        = 0.85;

  // Point marker radii by zoom band
  var POINT_RADIUS_ZOOM = [
    { maxZoom: 10, r: 3 },
    { maxZoom: 13, r: 4 },
    { maxZoom: 99, r: 5 },
  ];

  // ── Internal state ────────────────────────────────────────────────────────────

  var _enabled = true;
  var _opacity = DEFAULT_OPACITY;
  var _canvas  = null;
  var _ctx     = null;
  var _rafId   = null;

  // Per-frame render stats (updated each render)
  var _state = {
    enabled:           _enabled,
    opacity:           _opacity,
    preset:            'cinematic',
    sectorFocus:       0,
    activeLOD:         null,
    drawnFeatureCount: 0,
    skippedFeatureCount: 0,
    visibleLayers:     [],
    lastRenderMs:      0,
  };

  // ── Canvas setup ──────────────────────────────────────────────────────────────

  function _initCanvas() {
    if (_canvas) return true;
    var container = document.querySelector('.mapboxgl-canvas-container');
    if (!container) return false;

    _canvas = document.createElement('canvas');
    _canvas.style.position      = 'absolute';
    _canvas.style.top           = '0';
    _canvas.style.left          = '0';
    _canvas.style.width         = '100%';
    _canvas.style.height        = '100%';
    _canvas.style.pointerEvents = 'none';
    _canvas.style.zIndex        = '6.4';
    container.appendChild(_canvas);
    _ctx = _canvas.getContext('2d');
    _resize();
    return true;
  }

  function _resize() {
    if (!_canvas) return;
    var ref = document.querySelector('.mapboxgl-canvas');
    var w   = ref ? ref.width  : global.innerWidth;
    var h   = ref ? ref.height : global.innerHeight;
    if (_canvas.width !== w || _canvas.height !== h) {
      _canvas.width  = w;
      _canvas.height = h;
    }
  }

  // ── Projection ────────────────────────────────────────────────────────────────

  function _project(lat, lng) {
    var mvr = SBE.MapboxViewportRuntime;
    if (!mvr || !mvr.project) return null;
    try { return mvr.project([lng, lat]); } catch (e) { return null; }
  }

  function _projectRing(coords) {
    var pts = [];
    for (var i = 0; i < coords.length; i++) {
      var c = coords[i];
      var p = _project(c[1], c[0]);
      if (p) pts.push(p);
    }
    return pts;
  }

  // Quick screen-bounds check: true if any projected point is on canvas
  function _anyVisible(pts, w, h) {
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i];
      if (p.x >= -50 && p.x <= w + 50 && p.y >= -50 && p.y <= h + 50) return true;
    }
    return false;
  }

  // ── Geometry drawing primitives ───────────────────────────────────────────────

  function _buildRingPath(ctx, pts, close) {
    if (pts.length < 2) return false;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    if (close) ctx.closePath();
    return true;
  }

  // ── Point marker radius ───────────────────────────────────────────────────────

  function _pointRadius(zoom) {
    for (var i = 0; i < POINT_RADIUS_ZOOM.length; i++) {
      if (zoom <= POINT_RADIUS_ZOOM[i].maxZoom) return POINT_RADIUS_ZOOM[i].r;
    }
    return 5;
  }

  // ── Apply opacity to a CSS color string ──────────────────────────────────────
  // Replaces or injects alpha into rgba(…) strings.
  // Used to scale preset colors by computed opacity.

  function _applyAlpha(colorStr, alpha) {
    // Already rgba — replace last value
    var m = colorStr.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*[\d.]+\)$/);
    if (m) return 'rgba(' + m[1] + ',' + m[2] + ',' + m[3] + ',' + alpha.toFixed(3) + ')';
    // rgb
    var m2 = colorStr.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
    if (m2) return 'rgba(' + m2[1] + ',' + m2[2] + ',' + m2[3] + ',' + alpha.toFixed(3) + ')';
    return colorStr;
  }

  // ── Draw one feature ──────────────────────────────────────────────────────────

  function _drawFeature(ctx, feat, style, finalOpacity, zoom, cW, cH) {
    if (finalOpacity < 0.01) return false;

    var geom  = feat.geometry;
    if (!geom) return false;
    var gtype  = geom.type;
    var coords = geom.coordinates;

    // Zoom culling from baked properties
    var props = feat.properties || {};
    var minZ  = props.minZoom || 0;
    var maxZ  = props.maxZoom || 20;
    if (zoom < minZ || zoom > maxZ) return false;

    // Compute scaled colors
    var strokeColor = style.stroke ? _applyAlpha(style.stroke, finalOpacity) : 'rgba(255,255,255,0)';
    var fillColor   = style.fill   ? _applyAlpha(style.fill,   finalOpacity) : 'rgba(0,0,0,0)';
    var needFill    = style.type && style.type.indexOf('fill') >= 0;
    var needStroke  = true;

    ctx.strokeStyle = strokeColor;
    ctx.fillStyle   = fillColor;
    ctx.lineWidth   = style.lineWidth || 1.0;
    ctx.setLineDash(style.lineDash || []);

    if (gtype === 'Point') {
      var pt = _project(coords[1], coords[0]);
      if (!pt) return false;
      if (pt.x < -10 || pt.x > cW + 10 || pt.y < -10 || pt.y > cH + 10) return false;
      var r = _pointRadius(zoom);
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
      if (needFill)   ctx.fill();
      if (needStroke) ctx.stroke();
      return true;
    }

    if (gtype === 'LineString') {
      var pts = _projectRing(coords);
      if (!_anyVisible(pts, cW, cH)) return false;
      if (!_buildRingPath(ctx, pts, false)) return false;
      ctx.stroke();
      return true;
    }

    if (gtype === 'MultiLineString') {
      var drew = false;
      for (var li = 0; li < coords.length; li++) {
        var lpts = _projectRing(coords[li]);
        if (!_anyVisible(lpts, cW, cH)) continue;
        if (_buildRingPath(ctx, lpts, false)) { ctx.stroke(); drew = true; }
      }
      return drew;
    }

    if (gtype === 'Polygon') {
      var ring = _projectRing(coords[0]);
      if (!_anyVisible(ring, cW, cH)) return false;
      if (!_buildRingPath(ctx, ring, true)) return false;
      if (needFill)   ctx.fill();
      if (needStroke) ctx.stroke();
      return true;
    }

    if (gtype === 'MultiPolygon') {
      var drew2 = false;
      for (var pi = 0; pi < coords.length; pi++) {
        var pr = _projectRing(coords[pi][0]);
        if (!_anyVisible(pr, cW, cH)) continue;
        if (_buildRingPath(ctx, pr, true)) {
          if (needFill)   ctx.fill();
          if (needStroke) ctx.stroke();
          drew2 = true;
        }
      }
      return drew2;
    }

    return false;
  }

  // ── Resolve LOD ───────────────────────────────────────────────────────────────

  function _resolveLOD(camera) {
    var hsa = SBE.HarborSectorAuthority;
    if (!hsa || !hsa.resolveSectorLOD) return 'low_climb';
    var aws = SBE.AltitudeWorldState || null;
    return hsa.resolveSectorLOD(camera, aws) || 'low_climb';
  }

  // ── Main render ───────────────────────────────────────────────────────────────

  function _render() {
    var t0 = Date.now();

    // Gate: disabled
    if (!_enabled) {
      if (_ctx) _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
      _state.enabled = false;
      return;
    }
    _state.enabled = true;

    // Gate: registry not loaded
    var reg = SBE.HarborGeometryRegistry;
    if (!reg || !reg.isLoaded()) return;

    // Gate: style module
    var style = SBE.HarborGeometryRuntimeStyle;
    if (!style) return;

    // Gate: canvas
    if (!_canvas && !_initCanvas()) return;
    _resize();

    var cW = _canvas.width;
    var cH = _canvas.height;

    // Camera / viewport
    var mvr    = SBE.MapboxViewportRuntime;
    var camera = mvr && mvr.getCamera ? mvr.getCamera() : { zoom: 12 };
    var zoom   = (camera && camera.zoom) ? camera.zoom : 12;

    // Sector focus gate
    var hsa   = SBE.HarborSectorAuthority;
    var focus = 0;
    if (hsa && hsa.resolveSectorFocusScore) {
      focus = hsa.resolveSectorFocusScore(camera);
    } else {
      focus = 1.0; // permissive fallback if authority not loaded
    }
    _state.sectorFocus = focus;

    if (focus < SECTOR_FOCUS_THRESHOLD) {
      _ctx.clearRect(0, 0, cW, cH);
      _state.drawnFeatureCount   = 0;
      _state.skippedFeatureCount = 0;
      _state.visibleLayers       = [];
      return;
    }

    // LOD
    var lod = _resolveLOD(camera);
    _state.activeLOD = lod;

    // Altitude band
    var aws  = SBE.AltitudeWorldState;
    var band = (aws && aws.band) ? aws.band : 'ground';

    // Style state
    var styleState = style.getStyleState();
    _state.preset  = styleState.preset;

    // Sector focus opacity multiplier (linear ramp from threshold to 1.0)
    var focusMult = Math.min(1.0, (focus - SECTOR_FOCUS_THRESHOLD) / (0.40 - SECTOR_FOCUS_THRESHOLD));
    focusMult = Math.max(0, Math.min(1, focusMult));

    // Maritime opacity from AltitudeWorldState
    var maritimeMult = 1.0;
    if (aws && typeof aws.maritimeOpacity === 'number') {
      maritimeMult = aws.maritimeOpacity;
    }

    _ctx.clearRect(0, 0, cW, cH);

    var drawn   = 0;
    var skipped = 0;
    var visLayers = [];

    for (var li = 0; li < LAYER_ORDER.length; li++) {
      var layerName = LAYER_ORDER[li];

      // LOD opacity for this layer
      var lodOp = style.getLayerOpacity(layerName, lod, band);
      var finalBase = lodOp * _opacity * focusMult * maritimeMult;

      if (finalBase < 0.01) {
        // Layer effectively invisible at this LOD/band
        skipped += (reg.getLayerFeatures(layerName) || []).length;
        continue;
      }

      var layerStyle = style.getLayerStyle(layerName);
      if (!layerStyle) continue;

      var feats = reg.getLayerFeatures(layerName);
      if (!feats || !feats.length) continue;

      visLayers.push(layerName);
      _ctx.save();

      for (var fi = 0; fi < feats.length; fi++) {
        var didDraw = _drawFeature(_ctx, feats[fi], layerStyle, finalBase, zoom, cW, cH);
        if (didDraw) { drawn++; } else { skipped++; }
      }

      _ctx.restore();
    }

    _state.drawnFeatureCount   = drawn;
    _state.skippedFeatureCount = skipped;
    _state.visibleLayers       = visLayers;
    _state.opacity             = _opacity;
    _state.lastRenderMs        = Date.now() - t0;
  }

  // ── RAF loop ──────────────────────────────────────────────────────────────────

  function _rafLoop() {
    _rafId = global.requestAnimationFrame(_rafLoop);
    _render();
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  function init() {
    if (_rafId) return;
    _rafId = global.requestAnimationFrame(_rafLoop);
    console.log('[HarborGeometryRuntimeRenderer] v' + VERSION + ' RAF loop started');
  }

  function setEnabled(val) {
    _enabled = !!val;
    _state.enabled = _enabled;
    console.log('[HarborGeometryRuntimeRenderer] enabled →', _enabled);
  }

  function isEnabled() { return _enabled; }

  function setOpacity(val) {
    var v = parseFloat(val);
    if (isNaN(v) || v < 0 || v > 1) {
      console.warn('[HarborGeometryRuntimeRenderer] setOpacity: expected 0–1, got', val);
      return;
    }
    _opacity = v;
    _state.opacity = v;
  }

  function getOpacity() { return _opacity; }

  function getState() {
    return {
      enabled:           _state.enabled,
      opacity:           _state.opacity,
      preset:            _state.preset,
      sectorFocus:       _state.sectorFocus,
      activeLOD:         _state.activeLOD,
      drawnFeatureCount: _state.drawnFeatureCount,
      skippedFeatureCount: _state.skippedFeatureCount,
      visibleLayers:     _state.visibleLayers.slice(),
      lastRenderMs:      _state.lastRenderMs,
    };
  }

  function getCanvas() { return _canvas; }

  // ── Boot ──────────────────────────────────────────────────────────────────────
  // Deferred 500ms after first visible frame — this renderer needs the map
  // container to exist but is non-essential at first paint.

  function _scheduleInit() {
    var bs = global.SBE && SBE.WOSBootSequencer;
    if (bs && typeof bs.defer === 'function') {
      bs.defer('harborGeometryRuntimeRenderer.init', init, 500);
    } else {
      init();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _scheduleInit);
  } else {
    global.setTimeout(_scheduleInit, 0);
  }

  SBE.HarborGeometryRuntimeRenderer = Object.freeze({
    VERSION:    VERSION,
    init:       init,
    setEnabled: setEnabled,
    isEnabled:  isEnabled,
    setOpacity: setOpacity,
    getOpacity: getOpacity,
    getState:   getState,
    getCanvas:  getCanvas,
  });

  console.log('[HarborGeometryRuntimeRenderer] v' + VERSION + ' loaded');

})(window);
