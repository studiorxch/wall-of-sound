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
  //
  // Map Art Supplies Integration V1: this runtime now understands the SAME
  // five Art Supply materials Blackbook proves (graphite/ink/marker/mop/
  // spray) plus the graphite-only material-erasure Mark -- never a second,
  // Map-specific supply model. Mop and Spray's actual deposition math is
  // never reimplemented here: it is read live from `window.SBE.ArtSupplyDeposition`
  // (published by subwayMemberRuntime.ts, a Vite-bundled module that runs on
  // this same page and imports the EXACT functions blackbookRuntime.ts uses
  // -- see that file's own doc for why this is the correct seam given this
  // runtime has no module bundler of its own). If that bridge hasn't loaded
  // yet, Mop/Spray silently fall back to a plain stroke rather than throwing,
  // so drawing never hard-fails while the module script is still loading.

  var _canvas = null;
  var _ctx    = null;

  var _isDrawing  = false;
  var _livePoints = []; // screen-coord points for the stroke in progress
  var _nextId     = 1;

  var _brush = { supplyId: "pencil", color: "#ff4488", width: 4, opacity: 0.88 };

  var MATERIAL_IDS = ["graphite", "mop", "spray", "ink", "marker"]; // composite/paint order, matches Blackbook
  var MATERIAL_BY_SUPPLY = { pencil: "graphite", pen: "ink", marker: "marker", mop: "mop", spray: "spray" };
  var _materialLayers = null;

  // ── Accessors ──────────────────────────────────────────────────────────────
  function _mbr() { return SBE.MapboxViewportRuntime; }
  function _ws()  { return SBE.Workspace; }
  function _deposition() { return SBE.ArtSupplyDeposition || null; }

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

  function _notify(name, detail) {
    if (!global.document || typeof global.CustomEvent !== "function") return;
    global.document.dispatchEvent(new global.CustomEvent(name, { detail: detail }));
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
      var isEraser = _brush.supplyId === "eraser";
      // Eraser uses its own fixed default width, the same way Blackbook's
      // activeOperation() ignores the WIDTH slider for Eraser -- Width/
      // Opacity/Color are drawing-supply contextual options, not Eraser's.
      var supplies = SBE.ArtSupplies;
      var eraserWidth = (supplies && supplies.PENCIL_ERASER_SUPPLY) ? supplies.PENCIL_ERASER_SUPPLY.defaultWidth : 28;
      var stroke = isEraser
        ? {
            id:        "stroke-" + (_nextId++),
            type:      "material-erasure",
            operation: "eraser",
            targetMaterialId: "graphite",
            points:    _livePoints.slice(),
            width:     eraserWidth,
            surface:   { type: "map", surfaceId: surf.surfaceId || surf.id },
            createdAt: Date.now(),
          }
        : {
            id:        "stroke-" + (_nextId++),
            type:      "stroke",
            operation: _brush.supplyId,
            points:    _livePoints.slice(),
            style:     { color: _brush.color, width: _brush.width, opacity: _brush.opacity },
            surface:   { type: "map", surfaceId: surf.surfaceId || surf.id },
            createdAt: Date.now(),
          };
      _overlayObjects(surf).push(stroke);
      if (_ws() && _ws().markModified) _ws().markModified(surf.id);
      _notify("surface-drawing:stroke-committed", {
        stroke: stroke,
        surfaceId: surf.surfaceId || surf.id,
      });
    }
    _livePoints = [];
    _renderAll();
  }

  // ── Material layers ────────────────────────────────────────────────────────
  function _ensureMaterialLayers() {
    if (!_canvas) return null;
    if (_materialLayers && _materialLayers.graphite.canvas.width === _canvas.width && _materialLayers.graphite.canvas.height === _canvas.height) {
      return _materialLayers;
    }
    _materialLayers = {};
    for (var i = 0; i < MATERIAL_IDS.length; i++) {
      var id = MATERIAL_IDS[i];
      var layerCanvas = global.document.createElement("canvas");
      layerCanvas.width = _canvas.width;
      layerCanvas.height = _canvas.height;
      _materialLayers[id] = { canvas: layerCanvas, ctx: layerCanvas.getContext("2d") };
    }
    return _materialLayers;
  }

  // ── Rendering ──────────────────────────────────────────────────────────────
  function _renderAll() {
    if (!_ctx || !_canvas) return;
    var layers = _ensureMaterialLayers();
    if (!layers) return;

    for (var m = 0; m < MATERIAL_IDS.length; m++) {
      var layerId = MATERIAL_IDS[m];
      layers[layerId].ctx.clearRect(0, 0, _canvas.width, _canvas.height);
    }

    var surf    = _activeSurface();
    var objects = _overlayObjects(surf);
    var mbr     = _mbr();

    objects.forEach(function (obj) {
      if (obj.type === "stroke") _drawStroke(layers, obj, mbr);
      else if (obj.type === "material-erasure") _drawErasure(layers, obj, mbr);
    });

    _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
    for (var c = 0; c < MATERIAL_IDS.length; c++) {
      _ctx.drawImage(layers[MATERIAL_IDS[c]].canvas, 0, 0);
    }

    // In-progress stroke — drawn directly on top, not persisted to a layer
    if (_isDrawing && _livePoints.length > 1) {
      var previewStyle = { color: _brush.color, width: _brush.width, opacity: _brush.opacity };
      if (_brush.supplyId === "eraser") {
        // No destructive live preview for Eraser -- Blackbook doesn't show
        // one either; the effect commits on pointerup, same as every other
        // supply's commit-on-release semantics.
      } else if (_brush.supplyId === "mop") {
        _drawMopPoints(_ctx, _livePoints, previewStyle);
      } else if (_brush.supplyId === "spray") {
        _drawSprayPoints(_ctx, _livePoints, previewStyle, "live-preview");
      } else {
        _drawRawPoints(_ctx, _livePoints, previewStyle);
      }
    }
  }

  function _reprojectPoints(pts) {
    var mbr = _mbr();
    return pts.map(function (p) {
      if (mbr && mbr.isReady() && p.longitude !== null && p.latitude !== null && p.longitude !== undefined && p.latitude !== undefined) {
        var screen = mbr.project([p.longitude, p.latitude]);
        var rect = _canvas.getBoundingClientRect();
        var sx = rect.width  > 0 ? _canvas.width  / rect.width  : 1;
        var sy = rect.height > 0 ? _canvas.height / rect.height : 1;
        return { x: screen.x * sx, y: screen.y * sy };
      }
      // Fallback: original canvas-pixel position (map hasn't moved or no geo anchor)
      return { x: p.x, y: p.y };
    });
  }

  function _drawStroke(layers, obj, mbr) {
    var pts = obj.points;
    if (!pts || pts.length < 2) return;
    var drawPts = _reprojectPoints(pts);
    var materialId = MATERIAL_BY_SUPPLY[obj.operation] || "graphite";
    var ctx = layers[materialId].ctx;
    var seedSource = obj.markId || obj.id;
    if (materialId === "mop") {
      _drawMopPoints(ctx, drawPts, obj.style);
    } else if (materialId === "spray") {
      _drawSprayPoints(ctx, drawPts, obj.style, seedSource);
    } else {
      _drawRawPoints(ctx, drawPts, obj.style);
    }
  }

  // Graphite-only, matching Blackbook's Eraser -- destination-out on the
  // graphite layer alone, never any other material's layer.
  function _drawErasure(layers, obj, mbr) {
    var pts = obj.points;
    if (!pts || pts.length < 2) return;
    var drawPts = _reprojectPoints(pts);
    var ctx = layers.graphite.ctx;
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.lineWidth = obj.width;
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "#000";
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(drawPts[0].x, drawPts[0].y);
    for (var i = 1; i < drawPts.length; i++) ctx.lineTo(drawPts[i].x, drawPts[i].y);
    ctx.stroke();
    ctx.restore();
  }

  function _drawRawPoints(ctx, pts, style) {
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
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

  // Same two-pass technique as Blackbook's drawMopStroke: a continuous
  // rounded stroke for path continuity, plus the shared resolveMopDabPlan's
  // dabs for the wet/broad deposited character. Falls back to a plain
  // stroke if the deposition bridge hasn't loaded yet.
  function _drawMopPoints(ctx, pts, style) {
    var deposition = _deposition();
    if (!deposition || !deposition.resolveMopDabPlan) { _drawRawPoints(ctx, pts, style); return; }
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.lineWidth = style.width;
    ctx.globalAlpha = style.opacity * 0.7;
    ctx.strokeStyle = style.color;
    ctx.stroke();
    ctx.fillStyle = style.color;
    var dabs = deposition.resolveMopDabPlan(pts, style.width * 0.5);
    for (var d = 0; d < dabs.length; d++) {
      var dab = dabs[d];
      ctx.globalAlpha = style.opacity * dab.alphaScale;
      ctx.beginPath();
      ctx.arc(dab.x, dab.y, dab.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Same aerosol engine Blackbook uses (resolveSprayParticlePlan + the
  // StudioRich Stock Cap) -- `seedSource` is the Mark's own stable id
  // (markId once persisted, the local stroke id before that), so a
  // committed Spray Mark's deposition never reseeds on camera movement or
  // reload: only the SCREEN POSITION of each particle changes as `pts`
  // (already reprojected by the caller) moves with the map.
  function _drawSprayPoints(ctx, pts, style, seedSource) {
    var deposition = _deposition();
    if (!deposition || !deposition.resolveSprayParticlePlan || !deposition.hashSeed) { _drawRawPoints(ctx, pts, style); return; }
    var plan = deposition.resolveSprayParticlePlan(pts, style.width * 0.5, deposition.hashSeed(String(seedSource)));
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = style.color;
    for (var i = 0; i < plan.length; i++) {
      var particle = plan[i];
      ctx.globalAlpha = style.opacity * particle.alpha;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      ctx.fill();
    }
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

  // Removes the LATEST authored operation regardless of type -- a Stroke
  // (Pencil/Pen/Marker/Mop/Spray) or a material-erasure Mark, matching
  // Blackbook's plain stack-pop Undo. A Spray/Mop Mark is one authored
  // operation here too: Undo removes the whole Mark, never individual
  // dabs/particles (those are never persisted or tracked separately).
  function undo(surfaceId) {
    var surf = surfaceId
      ? (_ws() && _ws().getSurfaceById(surfaceId))
      : _activeSurface();
    if (!surf) return null;
    var objects = _overlayObjects(surf);
    if (!objects.length) return null;
    var removed = objects.pop();
    if (_ws() && _ws().markModified) _ws().markModified(surf.id);
    _renderAll();
    _notify("surface-drawing:stroke-removed", { stroke: removed });
    return removed;
  }

  function getStrokes(surfaceId) {
    var surf = surfaceId
      ? (_ws() && _ws().getSurfaceById(surfaceId))
      : _activeSurface();
    return _overlayObjects(surf).filter(function (obj) { return obj && (obj.type === "stroke" || obj.type === "material-erasure"); });
  }

  function bindArtwork(strokeOrId, artworkId, markId, creatorId, surfaceId) {
    var stroke = typeof strokeOrId === "object" && strokeOrId
      ? strokeOrId
      : getStrokes().find(function (item) { return item.id === strokeOrId; });
    if (!stroke) return false;
    stroke.artworkId = artworkId;
    stroke.markId = markId;
    stroke.creatorId = creatorId;
    stroke.surfaceId = surfaceId;
    return true;
  }

  function hydrateArtwork(artwork) {
    if (!artwork || !artwork.id || !Array.isArray(artwork.marks)) return 0;
    var surf = _activeSurface();
    if (!surf) return 0;
    var objects = _overlayObjects(surf);
    var added = 0;
    artwork.marks.forEach(function (mark) {
      if (!mark || !mark.geometry || !Array.isArray(mark.geometry.points) || mark.geometry.points.length < 2) return;
      if (objects.some(function (item) { return item.artworkId === artwork.id && item.markId === mark.id; })) return;
      var points = mark.geometry.points.map(function (point) {
        return { x: 0, y: 0, longitude: point.longitude, latitude: point.latitude };
      });
      var base = {
        id: "artwork-mark-" + mark.id,
        artworkId: artwork.id,
        markId: mark.id,
        creatorId: artwork.creatorId,
        surfaceId: artwork.surfaceId,
        points: points,
        surface: { type: "map", surfaceId: surf.surfaceId || surf.id },
        createdAt: artwork.createdAt instanceof Date ? artwork.createdAt.getTime() : Date.parse(artwork.createdAt),
      };
      if (mark.type === "stroke") {
        objects.push(Object.assign({}, base, {
          type: "stroke",
          operation: mark.material ? mark.material.supplyId : "pencil",
          style: Object.assign({}, mark.style),
        }));
        added += 1;
      } else if (mark.type === "material-erasure") {
        objects.push(Object.assign({}, base, {
          type: "material-erasure",
          operation: "eraser",
          targetMaterialId: mark.targetMaterialId,
          width: mark.width,
        }));
        added += 1;
      }
    });
    _renderAll();
    return added;
  }

  function removePersistedStrokes() {
    var surf = _activeSurface();
    if (!surf) return 0;
    var objects = _overlayObjects(surf);
    var retained = objects.filter(function (item) { return !item.artworkId; });
    var removed = objects.length - retained.length;
    surf.overlayObjects = retained;
    _renderAll();
    return removed;
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
    undo:           undo,
    getStrokes:     getStrokes,
    bindArtwork:    bindArtwork,
    hydrateArtwork: hydrateArtwork,
    removePersistedStrokes: removePersistedStrokes,
    __test: {
      capturePoint: function (clientX, clientY) {
        return _capturePoint({ clientX: clientX, clientY: clientY });
      },
      commitPoints: function (points) {
        _livePoints = (points || []).slice();
        _commitStroke();
      },
      reprojectPoints: _reprojectPoints,
    },
  };

})(window);
