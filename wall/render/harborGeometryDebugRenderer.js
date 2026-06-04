// ── HarborGeometryDebugRenderer v1.0.0 ───────────────────────────────────────
// 0528E_WOS_HarborGeometryBakePipeline_v1.0.0 — visual proof renderer
// Status: active
// Classification: debug-renderer — do NOT load in production
//
// Purpose:
//   Renders baked harbor sector geometry as a canvas proof overlay.
//   Proves that geometry exists at the correct geographic coordinates.
//
//   Activate:
//     SBE.runtimeFlags = SBE.runtimeFlags || {};
//     SBE.runtimeFlags.showHarborGeometryDebug = true;
//
// Layer rendering:
//   shoreline        — thin blue-white outline
//   pier             — amber outline
//   ferry_slip       — cyan fill + outline
//   island           — green outline
//   bridge_context   — yellow dashed line
//   waterfront_block — muted orange fill
//
// Authority:
//   READS:  SBE.HarborGeometryRegistry, SBE.MapboxViewportRuntime
//   WRITES: debug canvas pixels only
//   MUST NOT MUTATE: any runtime state, Mapbox style
//
// Placement: wall/render/harborGeometryDebugRenderer.js
// Load: AFTER harborGeometryRegistry.js, after main.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  var VERSION = '1.0.0';

  // ── Layer render styles ───────────────────────────────────────────────────────

  var LAYER_STYLE = {
    shoreline: {
      type:        'line',
      stroke:      'rgba(180,220,255,0.85)',
      lineWidth:   1.5,
      lineDash:    [],
    },
    pier: {
      type:        'line',
      stroke:      'rgba(255,165,60,0.90)',
      lineWidth:   2.0,
      lineDash:    [],
    },
    ferry_slip: {
      type:        'fill+line',
      fill:        'rgba(60,210,255,0.22)',
      stroke:      'rgba(60,210,255,0.90)',
      lineWidth:   1.5,
      lineDash:    [],
    },
    island: {
      type:        'fill+line',
      fill:        'rgba(90,210,120,0.15)',
      stroke:      'rgba(90,210,120,0.88)',
      lineWidth:   1.5,
      lineDash:    [],
    },
    bridge_context: {
      type:        'line',
      stroke:      'rgba(255,230,80,0.85)',
      lineWidth:   2.0,
      lineDash:    [8, 5],
    },
    waterfront_block: {
      type:        'fill+line',
      fill:        'rgba(210,130,60,0.18)',
      stroke:      'rgba(210,130,60,0.65)',
      lineWidth:   1.0,
      lineDash:    [3, 4],
    },
    harbor_channel: {
      type:        'line',
      stroke:      'rgba(80,160,255,0.50)',
      lineWidth:   2.5,
      lineDash:    [12, 6],
    },
    hero_landmark: {
      type:        'fill+line',
      fill:        'rgba(255,255,255,0.25)',
      stroke:      'rgba(255,255,255,0.95)',
      lineWidth:   2.0,
      lineDash:    [],
    },
  };

  var LAYER_ORDER = ['waterfront_block', 'island', 'harbor_channel', 'ferry_slip', 'pier', 'shoreline', 'bridge_context', 'hero_landmark'];

  // ── Canvas ────────────────────────────────────────────────────────────────────

  var _canvas = null;
  var _ctx    = null;
  var _rafId  = null;

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
    _canvas.style.zIndex        = '9.5';   // above sector debug (9), below HUD
    container.appendChild(_canvas);
    _ctx = _canvas.getContext('2d');
    _resize();
    return true;
  }

  function _resize() {
    if (!_canvas) return;
    var ref = document.querySelector('.mapboxgl-canvas');
    var w   = ref ? ref.width  : window.innerWidth;
    var h   = ref ? ref.height : window.innerHeight;
    if (_canvas.width !== w || _canvas.height !== h) {
      _canvas.width  = w;
      _canvas.height = h;
    }
  }

  // ── Projection ────────────────────────────────────────────────────────────────

  function _project(lat, lng) {
    var mvr = global.SBE && SBE.MapboxViewportRuntime;
    if (!mvr || !mvr.project) return null;
    try { return mvr.project([lng, lat]); } catch (e) { return null; }
  }

  // ── GeoJSON geometry → screen paths ──────────────────────────────────────────

  // Project a ring/linestring of [lng, lat] coords, return array of screen pts.
  function _projectRing(coords) {
    var pts = [];
    for (var i = 0; i < coords.length; i++) {
      var c  = coords[i];
      var pt = _project(c[1], c[0]);
      if (pt) pts.push(pt);
    }
    return pts;
  }

  // Draw a ring (LineString or Polygon exterior) onto ctx.
  function _drawRing(ctx, pts, close) {
    if (pts.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    if (close) ctx.closePath();
  }

  // ── Draw one feature ──────────────────────────────────────────────────────────

  function _drawFeature(ctx, feat, style, zoom) {
    var props = feat.properties || {};
    var geom  = feat.geometry;
    if (!geom) return;

    // Zoom culling
    var minZ = props.minZoom || 0;
    var maxZ = props.maxZoom || 20;
    if (zoom < minZ || zoom > maxZ) return;

    var gtype = geom.type;
    var coords = geom.coordinates;

    // Set style
    ctx.strokeStyle = style.stroke || 'rgba(255,255,255,0.8)';
    ctx.fillStyle   = style.fill   || 'rgba(0,0,0,0)';
    ctx.lineWidth   = style.lineWidth || 1.5;
    ctx.setLineDash (style.lineDash || []);

    var needFill   = style.type && style.type.indexOf('fill') >= 0;
    var needStroke = true;

    if (gtype === 'LineString') {
      var pts = _projectRing(coords);
      _drawRing(ctx, pts, false);
      if (needStroke) ctx.stroke();

    } else if (gtype === 'MultiLineString') {
      for (var li = 0; li < coords.length; li++) {
        var pts2 = _projectRing(coords[li]);
        _drawRing(ctx, pts2, false);
        if (needStroke) ctx.stroke();
      }

    } else if (gtype === 'Polygon') {
      // Outer ring only (skip holes for now)
      var ring = _projectRing(coords[0]);
      _drawRing(ctx, ring, true);
      if (needFill)   ctx.fill();
      if (needStroke) ctx.stroke();

    } else if (gtype === 'MultiPolygon') {
      for (var pi = 0; pi < coords.length; pi++) {
        var ring2 = _projectRing(coords[pi][0]);
        _drawRing(ctx, ring2, true);
        if (needFill)   ctx.fill();
        if (needStroke) ctx.stroke();
      }

    } else if (gtype === 'Point') {
      var pt = _project(coords[1], coords[0]);
      if (pt) {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
        if (needFill)   ctx.fill();
        if (needStroke) ctx.stroke();
      }
    }

    // Label for priority-5 features at zoom >= 11
    if (props.priority >= 5 && zoom >= 11 && gtype !== 'LineString') {
      var labelPt = null;
      if (gtype === 'Point') {
        labelPt = _project(coords[1], coords[0]);
      } else if (gtype === 'Polygon') {
        // Centroid approximation: average first ring
        var ring3 = coords[0];
        var cx = 0, cy = 0;
        for (var ri = 0; ri < ring3.length; ri++) { cx += ring3[ri][0]; cy += ring3[ri][1]; }
        cx /= ring3.length; cy /= ring3.length;
        labelPt = _project(cy, cx);
      }
      if (labelPt && props.label) {
        ctx.save();
        ctx.fillStyle   = 'rgba(255,255,255,0.90)';
        ctx.font        = 'bold 10px sans-serif';
        ctx.textAlign   = 'center';
        ctx.strokeStyle = 'rgba(0,0,0,0.70)';
        ctx.lineWidth   = 2.5;
        ctx.setLineDash([]);
        ctx.strokeText(props.label, labelPt.x, labelPt.y - 7);
        ctx.fillText  (props.label, labelPt.x, labelPt.y - 7);
        ctx.restore();
      }
    }
  }

  // ── HUD ───────────────────────────────────────────────────────────────────────

  function _drawHUD(ctx, cW, reg) {
    var st = reg.getLoadState();
    var total = reg.getAllFeatures().length;
    var lineH = 14, padX = 8, padY = 8;
    var lines = [
      'HARBOR GEOMETRY DEBUG',
      'sector: ' + (st.sectorId || 'none'),
      'loaded: ' + st.loaded + '  total: ' + total + ' features',
    ];
    var boxW = 260, boxH = lines.length * lineH + padY * 2;
    var bx = cW - boxW - 10, by = 10;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(bx, by, boxW, boxH);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font      = '10px monospace';
    ctx.textAlign = 'left';
    for (var i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], bx + padX, by + padY + (i + 0.75) * lineH);
    }
    ctx.restore();
  }

  // ── Main render ───────────────────────────────────────────────────────────────

  function _render() {
    var flags = global.SBE && SBE.runtimeFlags;
    if (!flags || !flags.showHarborGeometryDebug) {
      if (_ctx) _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
      return;
    }

    var reg = global.SBE && SBE.HarborGeometryRegistry;
    if (!reg || !reg.isLoaded()) return;

    if (!_canvas && !_initCanvas()) return;
    _resize();

    var mvr    = global.SBE && SBE.MapboxViewportRuntime;
    var camera = mvr && mvr.getCamera ? mvr.getCamera() : { zoom: 12 };
    var zoom   = camera.zoom || 12;

    _ctx.clearRect(0, 0, _canvas.width, _canvas.height);

    // Draw layers in defined order (back → front)
    for (var li = 0; li < LAYER_ORDER.length; li++) {
      var layerName = LAYER_ORDER[li];
      var style     = LAYER_STYLE[layerName];
      if (!style) continue;

      var feats = reg.getLayerFeatures(layerName);
      _ctx.save();
      for (var fi = 0; fi < feats.length; fi++) {
        _drawFeature(_ctx, feats[fi], style, zoom);
      }
      _ctx.restore();
    }

    _drawHUD(_ctx, _canvas.width, reg);
  }

  // ── RAF loop ──────────────────────────────────────────────────────────────────

  function _rafLoop() {
    _rafId = global.requestAnimationFrame(_rafLoop);
    _render();
  }

  function init() {
    if (_rafId) return;
    _rafId = global.requestAnimationFrame(_rafLoop);
    console.log('[HarborGeometryDebugRenderer] v' + VERSION + ' RAF loop started');
    console.log('  Activate: SBE.runtimeFlags = SBE.runtimeFlags || {}; SBE.runtimeFlags.showHarborGeometryDebug = true;');
  }

  function setVisible(val) {
    SBE.runtimeFlags = SBE.runtimeFlags || {};
    SBE.runtimeFlags.showHarborGeometryDebug = !!val;
    console.log('[HarborGeometryDebugRenderer] showHarborGeometryDebug →', !!val);
  }

  function getCanvas() { return _canvas; }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    global.setTimeout(init, 0);
  }

  SBE.HarborGeometryDebugRenderer = Object.freeze({
    VERSION:    VERSION,
    init:       init,
    setVisible: setVisible,
    getCanvas:  getCanvas,
  });

  console.log('[HarborGeometryDebugRenderer] v' + VERSION + ' loaded');

})(window);
