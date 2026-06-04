// ── HarborSectorDebugRenderer v1.0.0 ─────────────────────────────────────────
// 0528D_WOS_HarborSectorAuthority_v1.0.0 — visual proof hook
// Status: active
// Classification: debug-renderer — do NOT load in production
//
// Purpose:
//   Renders a geographic debug overlay that proves the harbor sector exists at
//   the correct lat/lng coordinates:
//     • sector bounding box
//     • anchor zone circles (colour-coded by category)
//     • ferry corridor polylines
//     • labels for priority-5 anchors
//
//   Only active when:
//     SBE.runtimeFlags.showHarborSectorDebug === true
//
//   Toggle:
//     SBE.runtimeFlags = SBE.runtimeFlags || {};
//     SBE.runtimeFlags.showHarborSectorDebug = true;
//
// Authority:
//   READS:  SBE.HarborSectorAuthority, SBE.MapboxViewportRuntime
//   WRITES: debug canvas pixels only
//   MUST NOT MUTATE: any runtime state, Mapbox style
//
// Placement: wall/render/harborSectorDebugRenderer.js
// Load: AFTER harborSectorAuthority.js, after main.js (or end of body)
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  var VERSION = '1.0.0';

  // ── Category colours ─────────────────────────────────────────────────────────

  var CAT_COLOR = {
    industrial_waterfront: { stroke: 'rgba(255,165,60,0.85)',  fill: 'rgba(255,165,60,0.14)' },
    ferry_terminal:        { stroke: 'rgba(60,200,255,0.85)',  fill: 'rgba(60,200,255,0.14)' },
    landmark:              { stroke: 'rgba(255,80,80,0.90)',   fill: 'rgba(255,80,80,0.18)'  },
    island:                { stroke: 'rgba(100,220,120,0.85)', fill: 'rgba(100,220,120,0.14)'},
    bridge_context:        { stroke: 'rgba(210,210,100,0.80)', fill: 'rgba(210,210,100,0.10)'},
    skyline_context:       { stroke: 'rgba(200,160,255,0.85)', fill: 'rgba(200,160,255,0.14)'},
    airport_overlap:       { stroke: 'rgba(255,255,255,0.70)', fill: 'rgba(255,255,255,0.08)'},
    shipping_channel:      { stroke: 'rgba(100,180,255,0.70)', fill: 'rgba(100,180,255,0.08)'},
  };

  var FERRY_COLOR = {
    primary:   'rgba(60,200,255,0.80)',
    secondary: 'rgba(60,160,200,0.65)',
    tourist:   'rgba(255,200,60,0.80)',
    industrial:'rgba(200,140,60,0.65)',
  };

  // ── Projection ────────────────────────────────────────────────────────────────

  function _project(lat, lng) {
    var mvr = global.SBE && SBE.MapboxViewportRuntime;
    if (!mvr || !mvr.project) return null;
    try { return mvr.project([lng, lat]); } catch (e) { return null; }
  }

  function _metersPerPixel(lat, zoom) {
    return (40075016.686 * Math.cos(lat * Math.PI / 180)) /
           (256 * Math.pow(2, zoom || 12));
  }

  // ── Canvas ────────────────────────────────────────────────────────────────────

  var _canvas  = null;
  var _ctx     = null;
  var _rafId   = null;

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
    _canvas.style.zIndex        = '9';   // above aircraft — debug only
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

  // ── Draw Sector Bounds ────────────────────────────────────────────────────────

  function _drawBounds(ctx, bounds) {
    var nw = _project(bounds.north, bounds.west);
    var ne = _project(bounds.north, bounds.east);
    var se = _project(bounds.south, bounds.east);
    var sw = _project(bounds.south, bounds.west);
    if (!nw || !ne || !se || !sw) return;

    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(nw.x, nw.y);
    ctx.lineTo(ne.x, ne.y);
    ctx.lineTo(se.x, se.y);
    ctx.lineTo(sw.x, sw.y);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    // Label
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font      = '10px monospace';
    ctx.fillText('NYC HARBOR SECTOR 01', nw.x + 6, nw.y + 14);
    ctx.restore();
  }

  // ── Draw Anchor Zones ─────────────────────────────────────────────────────────

  function _drawAnchors(ctx, zones, camera) {
    var zoom = camera ? camera.zoom : 12;
    var mpx  = _metersPerPixel(40.68, zoom);

    for (var i = 0; i < zones.length; i++) {
      var z  = zones[i];
      if (zoom < z.visibleAtZoomMin || zoom > z.visibleAtZoomMax) continue;

      var pt = _project(z.lat, z.lng);
      if (!pt) continue;

      var rPx  = z.radiusM / mpx;
      var col  = CAT_COLOR[z.category] || CAT_COLOR.landmark;

      ctx.save();

      // Fill circle
      ctx.globalAlpha = 1;
      ctx.fillStyle   = col.fill;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, rPx, 0, Math.PI * 2);
      ctx.fill();

      // Stroke — dashed for lower priority, solid for priority 5
      ctx.strokeStyle = col.stroke;
      ctx.lineWidth   = z.priority >= 5 ? 1.5 : 1.0;
      if (z.priority < 5) ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, rPx, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Centre dot
      ctx.fillStyle = col.stroke;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, z.priority >= 5 ? 3.5 : 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Label — only for priority 5 or zoomed in enough
      if (z.priority >= 5 || zoom >= 11) {
        var labelY = pt.y - rPx - 5;
        ctx.fillStyle = 'rgba(255,255,255,0.90)';
        ctx.font      = z.priority >= 5 ? 'bold 11px sans-serif' : '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(z.label, pt.x, labelY);
      }

      ctx.restore();
    }
  }

  // ── Draw Ferry Corridors ──────────────────────────────────────────────────────

  function _drawCorridors(ctx, corridors) {
    for (var i = 0; i < corridors.length; i++) {
      var c   = corridors[i];
      var pts = c.points;
      if (!pts.length) continue;

      var col = FERRY_COLOR[c.renderHint] || FERRY_COLOR.secondary;

      // Project all points
      var screen = [];
      for (var pi = 0; pi < pts.length; pi++) {
        var pt = _project(pts[pi].lat, pts[pi].lng);
        if (pt) screen.push(pt);
      }
      if (screen.length < 2) continue;

      ctx.save();
      ctx.strokeStyle = col;
      ctx.lineWidth   = c.priority >= 5 ? 2.0 : 1.2;
      ctx.setLineDash(c.renderHint === 'primary' ? [] : [6, 5]);

      ctx.beginPath();
      ctx.moveTo(screen[0].x, screen[0].y);
      for (var si = 1; si < screen.length; si++) {
        ctx.lineTo(screen[si].x, screen[si].y);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Arrowhead at the end point
      if (screen.length >= 2) {
        var last  = screen[screen.length - 1];
        var prev  = screen[screen.length - 2];
        var angle = Math.atan2(last.y - prev.y, last.x - prev.x);
        var al    = 10, aw = 4;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(last.x, last.y);
        ctx.lineTo(last.x - al * Math.cos(angle - 0.4), last.y - al * Math.sin(angle - 0.4));
        ctx.lineTo(last.x - al * Math.cos(angle + 0.4), last.y - al * Math.sin(angle + 0.4));
        ctx.closePath();
        ctx.fill();
      }

      // Route label at midpoint
      var mid = screen[Math.floor(screen.length / 2)];
      ctx.fillStyle = 'rgba(255,255,255,0.70)';
      ctx.font      = '9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(c.label, mid.x, mid.y - 7);

      ctx.restore();
    }
  }

  // ── Main Render ───────────────────────────────────────────────────────────────

  function _render() {
    var flags = global.SBE && SBE.runtimeFlags;
    if (!flags || !flags.showHarborSectorDebug) {
      if (_ctx) _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
      return;
    }

    var hsa = global.SBE && SBE.HarborSectorAuthority;
    if (!hsa) return;

    if (!_canvas && !_initCanvas()) return;
    _resize();

    var mvr    = global.SBE && SBE.MapboxViewportRuntime;
    var camera = mvr && mvr.getCamera ? mvr.getCamera() : null;
    var aws    = global.SBE && SBE.AltitudeWorldState;

    _ctx.clearRect(0, 0, _canvas.width, _canvas.height);

    _drawBounds(_ctx, hsa.getSectorBounds());
    _drawAnchors(_ctx, hsa.getAnchorZones(), camera);
    _drawCorridors(_ctx, hsa.getFerryCorridors());

    // Refresh state snapshot
    hsa.refreshState(camera);

    // HUD: LOD and focus score
    var lod   = hsa.resolveSectorLOD(camera, aws);
    var focus = hsa.resolveSectorFocusScore(camera);
    _ctx.save();
    _ctx.fillStyle = 'rgba(0,0,0,0.55)';
    _ctx.fillRect(8, 8, 310, 72);
    _ctx.fillStyle = 'rgba(255,255,255,0.85)';
    _ctx.font      = '10px monospace';
    _ctx.textAlign = 'left';
    _ctx.fillText('HARBOR SECTOR DEBUG', 16, 24);
    _ctx.fillText('LOD  shore:' + lod.shorelineDetail + '  landmark:' + lod.landmarkDetail, 16, 39);
    _ctx.fillText('     ferry:' + lod.ferryCorridorDetail + '  building:' + lod.buildingDetail, 16, 53);
    _ctx.fillText('focus score: ' + focus.toFixed(3) + '   zoom: ' + (camera ? camera.zoom.toFixed(2) : 'n/a'), 16, 67);
    _ctx.restore();
  }

  // ── RAF Loop ──────────────────────────────────────────────────────────────────

  function _rafLoop() {
    _rafId = global.requestAnimationFrame(_rafLoop);
    _render();
  }

  function init() {
    if (_rafId) return;
    _rafId = global.requestAnimationFrame(_rafLoop);
    console.log('[HarborSectorDebugRenderer] v' + VERSION + ' RAF loop started');
    console.log('  Activate: SBE.runtimeFlags = SBE.runtimeFlags || {}; SBE.runtimeFlags.showHarborSectorDebug = true;');
  }

  function setVisible(val) {
    SBE.runtimeFlags = SBE.runtimeFlags || {};
    SBE.runtimeFlags.showHarborSectorDebug = !!val;
    console.log('[HarborSectorDebugRenderer] showHarborSectorDebug →', !!val);
  }

  function getCanvas() { return _canvas; }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    global.setTimeout(init, 0);
  }

  SBE.HarborSectorDebugRenderer = Object.freeze({
    VERSION:    VERSION,
    init:       init,
    setVisible: setVisible,
    getCanvas:  getCanvas,
  });

  console.log('[HarborSectorDebugRenderer] v' + VERSION + ' loaded');

})(window);
