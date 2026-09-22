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
  var _liveAuthoredZoom = null; // Mapbox camera zoom captured once at gesture start -- see Calibration V1 Revision 7
  var _nextId     = 1;

  var _brush = { supplyId: "pencil", color: "#ff4488", width: 4, opacity: 0.88 };

  var MATERIAL_IDS = ["graphite", "mop", "spray", "ink", "marker"]; // composite/paint order, matches Blackbook
  var MATERIAL_BY_SUPPLY = { pencil: "graphite", pen: "ink", marker: "marker", mop: "mop", spray: "spray" };
  var _materialLayers = null;

  // ── Accessors ──────────────────────────────────────────────────────────────
  function _mbr() { return SBE.MapboxViewportRuntime; }
  function _ws()  { return SBE.Workspace; }
  function _deposition() { return SBE.ArtSupplyDeposition || null; }
  function _rendering() { return SBE.ArtSupplyRendering || null; }
  function _zoomScaleAuthority() { return SBE.MapZoomScale || null; }

  // Calibration V1 Revision 7: the Width-vs-zoom scale correction -- see
  // mapZoomScale.ts for the full rationale. `authoredZoom` may be
  // undefined (a hydrated/legacy Mark, or the bridge hasn't loaded yet);
  // `resolveZoomScale` itself falls back to the shared Map reference zoom
  // in that case. Falls back to a scale of 1 (today's unscaled behavior)
  // only if the bridge hasn't loaded at all.
  function _zoomScaleFor(authoredZoom) {
    var authority = _zoomScaleAuthority();
    var mbr = _mbr();
    if (!authority || !mbr || !mbr.isReady()) return 1;
    var map = mbr.getMap && mbr.getMap();
    if (!map) return 1;
    var scale = authority.resolveZoomScale(map.getZoom(), authoredZoom);
    // Defensive: never let a malformed/legacy authoredZoom value (or a
    // transient non-finite camera read mid-transition) turn into a NaN/
    // Infinity render width downstream (createRadialGradient throws hard
    // on a non-finite radius). Falls back to unscaled (1) rather than
    // silently failing to render the Mark at all.
    return (typeof scale === "number" && isFinite(scale) && scale > 0) ? scale : 1;
  }

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
    // Calibration V1 Revision 7: captured ONCE here, never rewritten for
    // the rest of this gesture (see mapZoomScale.ts) -- setPointerCapture
    // above means Mapbox's own drag-pan/pinch-zoom cannot fire for THIS
    // pointer while it's down, but a mouse-wheel zoom is a separate event
    // channel and is NOT blocked by pointer capture, so the camera CAN
    // still change mid-gesture via scroll wheel. That's fine for the
    // authored geographic POINTS (each one unprojects through whatever the
    // camera is at that instant, same as always) -- only this one fixed
    // authoredZoom value is used for the Width scale reference, exactly as
    // specified: capture once, don't invent a mid-stroke zoom model.
    var mbr = _mbr();
    var map = mbr && mbr.getMap && mbr.getMap();
    _liveAuthoredZoom = map ? map.getZoom() : null;
    _renderAll();
  }

  function _onPointerMove(e) {
    if (!_isDrawing) return;
    e.preventDefault();
    // Calibration V1: read every coalesced pointer sample (where the
    // browser supports it), not just the event's own final position -- a
    // fast gesture batches several real samples into one move event, and
    // reading only the last one silently drops the in-between points,
    // making fast strokes look coarser/more angular than a slow one.
    var coalesced = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [];
    var samples = coalesced.length > 0 ? coalesced : [e];
    for (var i = 0; i < samples.length; i++) _livePoints.push(_capturePoint(samples[i]));
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
            authoredZoom: _liveAuthoredZoom,
            surface:   { type: "map", surfaceId: surf.surfaceId || surf.id },
            createdAt: Date.now(),
          }
        : {
            id:        "stroke-" + (_nextId++),
            type:      "stroke",
            operation: _brush.supplyId,
            points:    _livePoints.slice(),
            style:     { color: _brush.color, width: _brush.width, opacity: _brush.opacity },
            authoredZoom: _liveAuthoredZoom,
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
      // Same zoom-scale correction as a committed stroke (Calibration V1
      // Revision 7), using the SAME authoredZoom this gesture captured at
      // pointerdown, so the live preview matches what actually commits.
      var previewScale = _zoomScaleFor(_liveAuthoredZoom);
      var previewStyle = { color: _brush.color, width: _brush.width * previewScale, opacity: _brush.opacity };
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
    // Calibration V1 Revision 7: the SAME zoom scale is applied here, once,
    // to a COPY of this Mark's style, so every material sublayer downstream
    // (Mop body + dabs, Spray core + particles, or a plain Pencil/Pen/
    // Marker line) uses the identical scaled Width -- material layers never
    // scale independently. See mapZoomScale.ts.
    var scale = _zoomScaleFor(obj.authoredZoom);
    var scaledStyle = scale === 1 ? obj.style : Object.assign({}, obj.style, { width: obj.style.width * scale });
    if (materialId === "mop") {
      _drawMopPoints(ctx, drawPts, scaledStyle);
    } else if (materialId === "spray") {
      _drawSprayPoints(ctx, drawPts, scaledStyle, seedSource);
    } else {
      _drawRawPoints(ctx, drawPts, scaledStyle);
    }
  }

  // Graphite-only, matching Blackbook's Eraser -- destination-out on the
  // graphite layer alone, never any other material's layer.
  function _drawErasure(layers, obj, mbr) {
    var pts = obj.points;
    if (!pts || pts.length < 2) return;
    var drawPts = _reprojectPoints(pts);
    var ctx = layers.graphite.ctx;
    var scale = _zoomScaleFor(obj.authoredZoom);
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.lineWidth = obj.width * scale;
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "#000";
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(drawPts[0].x, drawPts[0].y);
    for (var i = 1; i < drawPts.length; i++) ctx.lineTo(drawPts[i].x, drawPts[i].y);
    ctx.stroke();
    ctx.restore();
  }

  // Calibration V1 (revised): quadratic-midpoint smoothing applies ONLY to
  // the clean-line instruments -- Pencil/Pen/Marker (via _drawRawPoints) --
  // where it removes the "crude/angular" kinks a fast handwritten gesture
  // produces from lineTo-per-sample. Mop and Spray are NOT clean-line
  // materials and must use `_rawPath` below instead: routing Mop's own
  // background pass through this smoothing broke its accepted V3 character,
  // because resolveMopDabPlan's dabs are placed at the RAW recorded points
  // and no longer lined up with a now-curved background stroke. Falls back
  // to a plain polyline if the rendering bridge hasn't loaded yet.
  function _tracePath(ctx, pts) {
    var rendering = _rendering();
    if (rendering && rendering.traceSmoothedPath) { rendering.traceSmoothedPath(ctx, pts); return; }
    _rawPath(ctx, pts);
  }

  // The plain, un-smoothed polyline -- Mop's background pass (kept aligned
  // with its dabs) and Spray's macro core pass both use this, never the
  // smoothed one.
  function _rawPath(ctx, pts) {
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
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
    _tracePath(ctx, pts);
    ctx.stroke();
    ctx.restore();
  }

  // Same two-pass technique as Blackbook's drawMopStroke: a continuous
  // rounded stroke for path continuity (raw, un-smoothed -- see _rawPath),
  // plus the shared resolveMopDabPlan's dabs for the wet/broad deposited
  // character. Falls back to a plain stroke if the deposition bridge hasn't
  // loaded yet.
  // Calibration V1 Revision 4: rebalanced from Revision 3 -- dabs used to
  // be drawn at up to their own full speed-response radius (diameter up to
  // 1.25x the body's own width), bulging past the body stroke's edges and
  // staying visually dominant even after Revision 3's overlap-guaranteed
  // resampling fix ("Mop seems the same, drawing as a dotted pattern").
  // Now the BODY stroke is the dominant pass (near-full opacity, was
  // 0.7x), and dabs are drawn at a fraction of their resolved radius
  // (well under the body's own half-width, so they blend inside the
  // stroke) at low alpha and only every other one -- same shared
  // `resolveMopDabPlan` data, just rebalanced visual weighting.
  // Calibration V1 Revision 5: isolating body-only vs dabs-only render
  // showed dabs sit EXACTLY on the (densely resampled) centerline points,
  // so the dab layer alone was a second thin track down the middle of the
  // body, not lateral texture -- the user's "inner dotted line" report.
  // Each dab now gets a small, purely deterministic lateral offset
  // (`_hashLateralUnit`, a function of the dab's own position, no seed/
  // randomness) applied PERPENDICULAR to the local path direction, so dabs
  // scatter across the stroke's width like grain instead of stacking on
  // its centerline -- the same "scatter around the point" principle
  // Spray's particle field already uses.
  // Calibration V1 Revision 6: close-zoom inspection showed dabs still
  // read as an identifiable stamped sequence even after Revision 5's
  // lateral scatter -- a flat hard-edged circle, drawn at every resampled
  // point with only a narrow speed-response size range, at perfectly
  // regular spacing. Fixed on all three fronts: soft radial-gradient fill
  // (via the shared fillSprayParticle helper, same as Spray's particles --
  // no hard edge), independent deterministic radius/alpha jitter per dab,
  // and a deterministic per-dab inclusion probability that breaks the
  // regular along-path rhythm (the body stroke, not the dab texture, is
  // what guarantees no gaps -- skipping dabs never reopens Revision 3's
  // continuity bug). Lateral scatter (Revision 5) is unchanged.
  var MOP_DAB_VISUAL_SCALE = 0.55;
  var MOP_DAB_LATERAL_SCALE = 0.6;
  var MOP_DAB_INCLUDE_PROBABILITY = 0.6;
  var MOP_DAB_RADIUS_JITTER_RANGE = 0.5;
  var MOP_DAB_ALPHA_JITTER_RANGE = 0.45;

  // Fallback only -- same shape as strokeSmoothing.ts's hash01, used
  // solely if the rendering bridge hasn't loaded yet.
  function _hash01Fallback(x, y, salt) {
    var h = Math.sin(x * 12.9898 + y * 78.233 + (salt || 0) * 37.719) * 43758.5453;
    return h - Math.floor(h);
  }
  function _hashLateralUnitFallback(x, y) {
    return _hash01Fallback(x, y, 0) * 2 - 1;
  }

  function _drawMopPoints(ctx, pts, style) {
    var deposition = _deposition();
    if (!deposition || !deposition.resolveMopDabPlan) { _drawRawPoints(ctx, pts, style); return; }
    var rendering = _rendering();
    var hashLateralUnit = (rendering && rendering.hashLateralUnit) || _hashLateralUnitFallback;
    var hash01 = (rendering && rendering.hash01) || _hash01Fallback;
    var fillSoftDab = rendering && rendering.fillSprayParticle;
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath();
    _rawPath(ctx, pts);
    ctx.lineWidth = style.width;
    ctx.globalAlpha = style.opacity * 0.92;
    ctx.strokeStyle = style.color;
    ctx.stroke();
    ctx.fillStyle = style.color;
    var dabs = deposition.resolveMopDabPlan(pts, style.width * 0.5);
    var baseRadius = style.width * 0.5;
    for (var d = 0; d < dabs.length; d++) {
      var dab = dabs[d];
      if (hash01(dab.x, dab.y, 4) > MOP_DAB_INCLUDE_PROBABILITY) continue;
      var prev = dabs[d - 1] || dab;
      var next = dabs[d + 1] || dab;
      var tangentX = next.x - prev.x;
      var tangentY = next.y - prev.y;
      var tangentLength = Math.hypot(tangentX, tangentY) || 1;
      var perpX = -tangentY / tangentLength;
      var perpY = tangentX / tangentLength;
      var lateral = hashLateralUnit(dab.x, dab.y) * baseRadius * MOP_DAB_LATERAL_SCALE;
      var radiusJitter = 1 + (hash01(dab.x, dab.y, 1) * 2 - 1) * MOP_DAB_RADIUS_JITTER_RANGE;
      var alphaJitter = 1 + (hash01(dab.x, dab.y, 2) * 2 - 1) * MOP_DAB_ALPHA_JITTER_RANGE;
      var px = dab.x + perpX * lateral, py = dab.y + perpY * lateral;
      var r = Math.max(0.3, dab.radius * MOP_DAB_VISUAL_SCALE * radiusJitter);
      var a = Math.max(0, dab.alphaScale * 0.55 * alphaJitter);
      if (fillSoftDab) {
        fillSoftDab(ctx, { x: px, y: py, radius: r, alpha: a }, style.color, style.opacity);
      } else {
        ctx.globalAlpha = style.opacity * a;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // Calibration V1 Revision 4: the core is `resolveSprayCorePlan` -- each
  // pass is ONE continuous stroke (one moveTo/lineTo chain, one stroke()
  // call), never many separate short segment strokes. Revision 3 drew the
  // core per tiny sub-segment (reusing the particle field's fine spacing);
  // since each segment was shorter than the core's own line width, every
  // one rendered as a fat round blob, producing a regularly-spaced
  // "dotted/stamped pattern". A single continuous stroke per pass has no
  // such node artifact regardless of point count, and still needs no
  // canvas blur (Revision 2's separate airbrush-glow problem). Falls back
  // to a single raw-line pass only if the deposition bridge hasn't loaded
  // `resolveSprayCorePlan` yet (an older cached bundle), never as the
  // normal path.
  function _drawSprayCore(ctx, pts, style, seed) {
    var deposition = _deposition();
    if (!deposition || !deposition.resolveSprayCorePlan) {
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath();
      _rawPath(ctx, pts);
      ctx.lineWidth = style.width * 0.55;
      ctx.globalAlpha = style.opacity * 0.55;
      ctx.strokeStyle = style.color;
      ctx.stroke();
      ctx.restore();
      return;
    }
    var plan = deposition.resolveSprayCorePlan(pts, style.width * 0.5, seed);
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = style.color;
    for (var i = 0; i < plan.length; i++) {
      var pass = plan[i];
      if (!pass.points || pass.points.length < 2) continue;
      ctx.globalAlpha = style.opacity * pass.alpha;
      ctx.lineWidth = pass.width;
      ctx.beginPath();
      ctx.moveTo(pass.points[0].x, pass.points[0].y);
      for (var p = 1; p < pass.points.length; p++) ctx.lineTo(pass.points[p].x, pass.points[p].y);
      ctx.stroke();
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
    var seed = deposition.hashSeed(String(seedSource));
    if (pts.length > 1) _drawSprayCore(ctx, pts, style, seed);
    var plan = deposition.resolveSprayParticlePlan(pts, style.width * 0.5, seed);
    var rendering = _rendering();
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    if (rendering && rendering.fillSprayParticle) {
      // Calibration V1: soft radial-gradient particle fill (the same helper
      // blackbookRuntime.ts uses) instead of a flat, hard-edged circle --
      // see strokeSmoothing.ts.
      for (var i = 0; i < plan.length; i++) rendering.fillSprayParticle(ctx, plan[i], style.color, style.opacity);
    } else {
      ctx.fillStyle = style.color;
      for (var j = 0; j < plan.length; j++) {
        var particle = plan[j];
        ctx.globalAlpha = style.opacity * particle.alpha;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        ctx.fill();
      }
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
        // Calibration V1 Revision 7: carries through if the persisted Mark
        // has it; a legacy Mark (authored before this revision, or any
        // Mark that predates the Firestore rules change) simply won't --
        // `typeof mark.authoredZoom === "number"` leaves it `undefined` in
        // that case, and `_zoomScaleFor` already falls back to the shared
        // reference zoom for `undefined`.
        authoredZoom: typeof mark.authoredZoom === "number" ? mark.authoredZoom : undefined,
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
