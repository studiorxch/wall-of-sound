(function (global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  // ── SurfaceDrawingRuntime (0520_WOS_SurfaceDrawingRuntime_v1.0.0) ─────────
  //
  // Transparent overlay drawing on geographic surfaces.
  // Owns: #surface-overlay canvas pointer events, stroke rendering,
  // geographic anchor storage, and camera-change reprojection.
  //
  // Stack order: Mapbox → #engine-canvas (route overlays) → #surface-overlay (drawing)
  //
  // Interaction modes (set via SBE.Workspace.setInteractionMode):
  //   "navigate"   — overlay pointer-events: none  → Mapbox handles all input
  //   "draw"       — overlay pointer-events: auto  → strokes captured here
  //   "route-edit" — overlay pointer-events: none  → routePlannerRuntime handles

  var _canvas = null;
  var _ctx    = null;

  var _isDrawing  = false;
  var _livePoints = []; // screen-coord points for the stroke in progress
  var _nextId     = 1;

  var _brush = { color: "#ff4488", width: 4, opacity: 0.88 };

  // ── Accessors ──────────────────────────────────────────────────────────────
  function _mbr() { return SBE.MapboxViewportRuntime; }
  function _ws()  { return SBE.Workspace; }

  function _activeSurface() {
    return _ws() ? _ws().getActiveSurface() : null;
  }

  function _overlayObjects(surface) {
    var s = surface || _activeSurface();
    if (!s) return [];
    s.overlayObjects = s.overlayObjects || [];
    return s.overlayObjects;
  }

  function _isDrawMode() {
    return _ws() && _ws().getInteractionMode() === "draw";
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  function init(overlayCanvas) {
    _canvas = overlayCanvas;
    _ctx    = overlayCanvas ? overlayCanvas.getContext("2d") : null;
    if (!_canvas) return;

    _canvas.addEventListener("pointerdown",  _onPointerDown);
    _canvas.addEventListener("pointermove",  _onPointerMove);
    _canvas.addEventListener("pointerup",    _onPointerUp);
    _canvas.addEventListener("pointerleave", _onPointerLeave);

    var bus = SBE.WorkspaceEventBus;
    if (bus) {
      // Re-render on any camera movement so strokes stay geo-locked
      bus.on("map:cameraMoved",   _renderAll);
      bus.on("map:cameraChanged", _renderAll);
      // Re-render when switching surfaces
      bus.on("surface:opened",    _renderAll);
    }

    console.log("[SurfaceDrawingRuntime] initialized");
  }

  // ── Brush ──────────────────────────────────────────────────────────────────
  function getBrush() { return Object.assign({}, _brush); }
  function setBrush(opts) { Object.assign(_brush, opts); }

  // ── Pointer handlers ───────────────────────────────────────────────────────
  function _onPointerDown(e) {
    if (!_isDrawMode()) return;
    e.preventDefault();
    _canvas.setPointerCapture(e.pointerId);
    _isDrawing  = true;
    _livePoints = [_capturePoint(e)];
    _renderAll();
  }

  function _onPointerMove(e) {
    if (!_isDrawing) return;
    e.preventDefault();
    _livePoints.push(_capturePoint(e));
    _renderAll();
  }

  function _onPointerUp(e) {
    if (!_isDrawing) return;
    _isDrawing = false;
    _commitStroke();
  }

  function _onPointerLeave(e) {
    if (!_isDrawing) return;
    _isDrawing = false;
    _commitStroke();
  }

  // ── Point capture ──────────────────────────────────────────────────────────
  function _capturePoint(e) {
    var rect = _canvas.getBoundingClientRect();
    // CSS-pixel position relative to canvas
    var cssX = e.clientX - rect.left;
    var cssY = e.clientY - rect.top;
    // Scale to canvas pixel coordinates
    var scaleX = rect.width  > 0 ? _canvas.width  / rect.width  : 1;
    var scaleY = rect.height > 0 ? _canvas.height / rect.height : 1;

    // Geographic anchor — stored so strokes reproject after pan/zoom
    var mbr = _mbr();
    var geo = (mbr && mbr.isReady()) ? mbr.unproject({ x: cssX, y: cssY }) : null;

    return {
      x:         cssX * scaleX,
      y:         cssY * scaleY,
      longitude: geo ? geo.lng : null,
      latitude:  geo ? geo.lat : null,
    };
  }

  // ── Stroke commit ──────────────────────────────────────────────────────────
  function _commitStroke() {
    if (_livePoints.length < 2) {
      _livePoints = [];
      _renderAll();
      return;
    }
    var surf = _activeSurface();
    if (surf) {
      _overlayObjects(surf).push({
        id:        "stroke-" + (_nextId++),
        type:      "stroke",
        points:    _livePoints.slice(),
        style:     Object.assign({}, _brush),
        createdAt: Date.now(),
      });
    }
    _livePoints = [];
    _renderAll();
  }

  // ── Rendering ──────────────────────────────────────────────────────────────
  function _renderAll() {
    if (!_ctx || !_canvas) return;
    _ctx.clearRect(0, 0, _canvas.width, _canvas.height);

    var surf    = _activeSurface();
    var objects = _overlayObjects(surf);
    var mbr     = _mbr();

    objects.forEach(function (obj) {
      if (obj.type === "stroke") _drawStroke(_ctx, obj, mbr);
    });

    // In-progress stroke
    if (_isDrawing && _livePoints.length > 1) {
      _drawRawPoints(_ctx, _livePoints, _brush);
    }
  }

  function _drawStroke(ctx, obj, mbr) {
    var pts = obj.points;
    if (!pts || pts.length < 2) return;

    // Reproject each point from its geographic anchor when the map has moved
    var drawPts = pts.map(function (p) {
      if (mbr && mbr.isReady() && p.longitude !== null && p.latitude !== null) {
        var screen = mbr.project([p.longitude, p.latitude]);
        // mbr.project returns CSS pixels; scale to canvas pixels
        var rect = _canvas.getBoundingClientRect();
        var sx = rect.width  > 0 ? _canvas.width  / rect.width  : 1;
        var sy = rect.height > 0 ? _canvas.height / rect.height : 1;
        return { x: screen.x * sx, y: screen.y * sy };
      }
      // Fallback: original canvas-pixel position (map hasn't moved or no geo anchor)
      return { x: p.x, y: p.y };
    });

    _drawRawPoints(ctx, drawPts, obj.style);
  }

  function _drawRawPoints(ctx, pts, style) {
    ctx.save();
    ctx.strokeStyle = style.color;
    ctx.lineWidth   = style.width;
    ctx.globalAlpha = style.opacity;
    ctx.lineCap     = "round";
    ctx.lineJoin    = "round";
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    ctx.restore();
  }

  // ── Canvas resize sync ─────────────────────────────────────────────────────
  // Called from workspaceUI when the canvas-area changes size.
  function syncCanvasSize() {
    if (!_canvas) return;
    var area = document.querySelector(".canvas-area");
    if (!area) return;
    var rect = area.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      var w = Math.round(rect.width);
      var h = Math.round(rect.height);
      if (_canvas.width !== w || _canvas.height !== h) {
        _canvas.width  = w;
        _canvas.height = h;
      }
    }
    _renderAll();
  }

  // ── Public ─────────────────────────────────────────────────────────────────
  function clearSurface(surfaceId) {
    var surf = surfaceId
      ? (_ws() && _ws().getSurfaceById(surfaceId))
      : _activeSurface();
    if (surf) surf.overlayObjects = [];
    _renderAll();
  }

  // Force a re-render (called externally after camera change)
  function renderOverlay() { _renderAll(); }

  SBE.SurfaceDrawingRuntime = {
    init:           init,
    getBrush:       getBrush,
    setBrush:       setBrush,
    renderOverlay:  renderOverlay,
    syncCanvasSize: syncCanvasSize,
    clearSurface:   clearSurface,
  };

})(window);
