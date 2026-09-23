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

  // Calibration V1 Revision 9: cached composite of every COMPLETED Mark --
  // see _rebuildStaticComposite's doc. `_staticDirty` starts true so the
  // very first render always builds it.
  var _staticComposite = null;
  var _staticCompositeCtx = null;
  var _staticDirty = true;
  var _staticRebuildCount = 0; // test-only introspection, see __test below

  // Calibration V1 Revision 12: Camera Interaction Cache. Revision 9 cached
  // the composite of every COMPLETED Mark; Revision 12 stops re-baking that
  // composite on every single Mapbox "move" tick during a pan/zoom/bearing
  // gesture. `_cameraBaseline` records the camera state (and the composite's
  // own on-screen reference geometry) at the moment the composite was last
  // authoritatively rebuilt -- captured at the end of every
  // `_rebuildStaticComposite()` call, whatever triggered it. While the
  // camera is moving, `_cameraTransform` holds a screen-space similarity
  // transform (translate + uniform scale + rotate) derived FRESH each tick
  // directly from `_cameraBaseline` -> the CURRENT camera (never
  // incrementally accumulated frame-to-frame, which is what would let
  // floating-point drift creep in over a long gesture) -- `_renderAll` draws
  // the already-baked composite through that transform instead of
  // rebuilding it. At moveend, `_cameraTransform` is cleared and exactly one
  // authoritative rebuild runs at the final camera state, which also
  // refreshes `_cameraBaseline` for the next gesture. Web Mercator at a
  // fixed pitch is a conformal (angle- and shape-preserving) projection, so
  // pan/zoom/bearing at pitch 0 is provably an exact global similarity
  // transform of the screen-projected plane -- this is not an approximation
  // for those three. Pitch is NOT representable by a 2D affine transform
  // (Mapbox applies true perspective foreshortening under pitch), so pitch
  // is deliberately left on the pre-Revision-12 conservative path: if either
  // the baseline or the current camera has nonzero pitch, every tick falls
  // back to a full authoritative rebuild exactly as before Revision 12.
  var _cameraBaseline = null;
  var _cameraTransform = null;

  // Calibration V1 Revision 18 (CanvasSource presentation spike, experimental
  // -- see canvasSourcePresentationSpike.js): "canvas" (default) is the
  // unchanged Revision 9-17 presentation (this file draws the composite to
  // `_ctx` itself, with Revision 12's transform during a gesture).
  // "canvassource" means an external Mapbox CanvasSource is presenting the
  // SAME `_staticComposite` canvas geographically -- this file still owns
  // Marks -> culling -> rasterization -> the composite canvas's pixel
  // content, unchanged; it just stops blitting that canvas to `_ctx` itself
  // (see _renderAll) and stops deriving/applying its own screen-space
  // transform mid-gesture (see init()'s "map:cameraMoved" handler). Never
  // set outside setPresentationMode(); defaults to today's behavior.
  var _presentationMode = "canvas";
  // Calibration V1 Revision 20: the optional single production consumer of
  // every authoritative rebuild while in "canvassource" mode -- set via
  // `setPresentationHook`. This file remains authoritative for producing
  // the parent composite; it does not know or care what (if anything) is
  // presenting it geographically. Called with (compositeCanvas) at the end
  // of `_rebuildStaticComposite` -- covers every trigger that already
  // invalidates the cache (commit, undo, hydrate, moveend, surface switch,
  // resize), not a separate/parallel event-listener path. The consumer
  // (ArtworkGeographicPresentation) derives its own tile geography directly
  // from the REAL current camera via map.unproject() -- this file no
  // longer computes any geographic coverage itself (Revision 20; see
  // Revision 19I for why an earlier detached-camera version of that
  // computation was wrong).
  var _presentationHook = null;

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
    _canvas.addEventListener("wheel",        _onWheel, { passive: false });

    var bus = SBE.WorkspaceEventBus;
    if (bus) {
      // Calibration V1 Revision 12 (Camera Interaction Cache): a mid-gesture
      // "move" tick no longer rebuilds the static composite -- see
      // `_deriveCameraTransform`'s doc. When a transform can be derived
      // (pitch inactive), it's applied for presentation only; when it can't
      // (pitch active, or no baseline captured yet), this falls back to the
      // exact pre-Revision-12 behavior of a full rebuild on every tick, so
      // pitched interaction is never less correct than before.
      bus.on("map:cameraMoved", function () {
        // Calibration V1 Revision 18 (CanvasSource spike): when a
        // CanvasSource is presenting the composite, Mapbox's own render
        // loop reprojects it every frame -- this file does NOTHING at all
        // on a mid-gesture tick (no transform derivation, no rebuild, no
        // _renderAll -- the active-gesture live-preview layer, if any, is
        // still driven separately by pointer events, unaffected).
        if (_presentationMode === "canvassource") return;
        var transform = _deriveCameraTransform();
        if (transform) {
          _cameraTransform = transform;
          _renderAll();
        } else {
          _cameraTransform = null;
          _markStaticDirty();
          _renderAll();
        }
      });
      // moveend: exactly one authoritative geographic rebuild at the final
      // camera state. `_rebuildStaticComposite` clears `_cameraTransform`
      // and recaptures `_cameraBaseline` itself (see its own doc), so no
      // stale transform can linger on top of a freshly-baked composite.
      bus.on("map:cameraChanged", function () { _markStaticDirty(); _renderAll(); });
      // Re-render when switching surfaces
      bus.on("surface:opened",    function () { _markStaticDirty(); _renderAll(); });
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

  // Calibration V1 Revision 8 (Bug 1 fix): the overlay canvas sits ABOVE
  // Mapbox's own canvas the entire time a drawing supply is selected
  // (`overlay.style.pointerEvents = "auto"` while workspace interaction
  // mode === "draw" -- see workspaceUI.js), not just during an active
  // gesture -- it has to, to catch the pointerdown that STARTS a gesture.
  // CSS `pointer-events` governs hit-testing for every pointing-device
  // event type at that DOM position, not just pointer/mouse/touch events --
  // so a real mouse wheel scroll, and (on macOS trackpads) a pinch-zoom
  // gesture, which Chrome/Safari both synthesize as `wheel` events with
  // `ctrlKey: true`, were landing on the overlay and going nowhere: the
  // overlay had no wheel handler, and CSS pointer-events provides no
  // "fall through to the element behind" mechanism, so the event never
  // reached Mapbox's own scroll-zoom listener on its canvas underneath.
  // The user had to switch to PAN (which sets pointer-events: none on the
  // overlay) just to zoom, even between gestures. Fix: explicitly forward
  // the wheel delta to the SAME map instance's own zoom, anchored at the
  // cursor position -- Spray/Mop/etc. remain selected throughout, and this
  // applies regardless of whether a gesture is in progress (matches every
  // other supply's identical overlay lifecycle, not a Spray-specific fix).
  function _onWheel(e) {
    var mbr = _mbr();
    var map = mbr && mbr.getMap && mbr.getMap();
    if (!map) return;
    e.preventDefault();
    var rect = _canvas.getBoundingClientRect();
    var around = mbr.unproject({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    // Same shape as Mapbox GL JS's own default scroll-zoom response curve
    // (a log-scaled delta, sign-preserved) -- not an attempt to exactly
    // replicate its internal easing, just a comparable feel.
    var zoomDelta = Math.sign(-e.deltaY) * Math.log2(1 + Math.abs(e.deltaY) / 100);
    map.easeTo({
      zoom: map.getZoom() + zoomDelta,
      around: around ? [around.lng, around.lat] : undefined,
      duration: 120,
    });
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
  // Calibration V1 Revision 10 (dot-gesture fix): a true zero-movement
  // click/tap -- pointerdown, then pointerup with NO intervening
  // pointermove at all -- left `_livePoints` at exactly 1 captured point.
  // This guard used to require >=2 and silently discard the gesture
  // entirely, which is the root cause of "some clicks produce no
  // persistent dot": there was no Mark to hydrate/render/persist at all,
  // for every supply, not just Mop. A single pointerdown IS a valid
  // authored dot gesture (see the canonical principle in the Revision 10
  // task). Rather than changing the canonical Mark schema (which requires
  // >=2 points, matching Firestore's own validation) or inventing a fake
  // arbitrary second point, the single captured point is duplicated into a
  // genuine ZERO-LENGTH segment -- both endpoints identical, which is
  // geometrically exactly what a motionless click authored. This needs no
  // schema/rules change: the existing >=2-point representation already
  // accepts two identical points.
  // Calibration V1 Revision 17 (Drawing Stability Closure, finding B, Mop/
  // Spray-specific part): the id this gesture WILL get if committed right
  // now -- `_nextId` itself is never incremented here, only read, so this
  // is safe to call every live-preview frame with no side effect, and it
  // exactly matches what `_commitStroke` assigns below (`"stroke-" +
  // (_nextId++)`) as long as no OTHER stroke commits mid-gesture, which
  // isn't possible (only one gesture is ever in flight at a time). Used
  // instead of the old fixed `"live-preview"` seed string: Mop/Spray's
  // per-dab/per-particle jitter, lateral scatter, and alpha variance are
  // all seeded from this value, so a constant placeholder seed meant every
  // completed Mop/Spray Mark re-rolled its ENTIRE randomized texture -- not
  // just shifted a little -- the instant it committed and picked up its
  // real, different id. Confirmed live: with the placeholder seed, ~7,700
  // of ~419,000 canvas pixels differed between the last live frame and the
  // first static frame for a test Mop stroke (~1.8% of the canvas), versus
  // near-zero once the seed matches.
  function _prospectiveMarkId() {
    return "stroke-" + _nextId;
  }

  function _commitStroke() {
    if (_livePoints.length === 1) {
      _livePoints = [_livePoints[0], Object.assign({}, _livePoints[0])];
    }
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
      // Revision 9: the just-committed Mark moves from "active gesture"
      // to "completed" -- the static cache must include it from here on.
      _markStaticDirty();
      _notify("surface-drawing:stroke-committed", {
        stroke: stroke,
        surfaceId: surf.surfaceId || surf.id,
      });
    }
    _livePoints = [];
    _renderAll();
  }

  // Calibration V1 Revision 14 (Artwork Cache Overscan): the static
  // composite/material layers are baked BIGGER than the visible viewport --
  // a fixed 50%-per-side margin (prototype calibration, not a permanent
  // constant) -- so inertial pan/flick has real pixel coverage to expose
  // before the next authoritative rebuild catches up, instead of exposing
  // blank canvas the instant the Revision 12 transform slides the
  // viewport-sized raster away from its origin. Bounded and fixed: never
  // grows with zoom, pan distance, or scene size -- always exactly
  // (1 + 2*OVERSCAN_RATIO)x the current viewport's own width/height, i.e.
  // 4x the pixel AREA at the default ratio, never a world-sized raster.
  var OVERSCAN_RATIO = 0.5;

  function _overscanOffsetX() { return _canvas ? _canvas.width  * OVERSCAN_RATIO : 0; }
  function _overscanOffsetY() { return _canvas ? _canvas.height * OVERSCAN_RATIO : 0; }
  function _overscanWidth()   { return _canvas ? Math.round(_canvas.width  * (1 + 2 * OVERSCAN_RATIO)) : 0; }
  function _overscanHeight()  { return _canvas ? Math.round(_canvas.height * (1 + 2 * OVERSCAN_RATIO)) : 0; }

  // ── Material layers ────────────────────────────────────────────────────────
  function _ensureMaterialLayers() {
    if (!_canvas) return null;
    var targetW = _overscanWidth(), targetH = _overscanHeight();
    if (_materialLayers && _materialLayers.graphite.canvas.width === targetW && _materialLayers.graphite.canvas.height === targetH) {
      return _materialLayers;
    }
    _materialLayers = {};
    for (var i = 0; i < MATERIAL_IDS.length; i++) {
      var id = MATERIAL_IDS[i];
      var layerCanvas = global.document.createElement("canvas");
      layerCanvas.width = targetW;
      layerCanvas.height = targetH;
      _materialLayers[id] = { canvas: layerCanvas, ctx: layerCanvas.getContext("2d") };
    }
    // Backing-store size changed (canvas resize, device-pixel-ratio change,
    // or the viewport dimensions the overscan margin is computed from) --
    // any existing static composite is now the wrong size and must be
    // rebuilt from scratch.
    _staticComposite = null;
    _staticDirty = true;
    return _materialLayers;
  }

  function _ensureStaticComposite() {
    if (!_canvas) return null;
    var targetW = _overscanWidth(), targetH = _overscanHeight();
    if (_staticComposite && _staticComposite.width === targetW && _staticComposite.height === targetH) {
      return _staticComposite;
    }
    _staticComposite = global.document.createElement("canvas");
    _staticComposite.width = targetW;
    _staticComposite.height = targetH;
    _staticCompositeCtx = _staticComposite.getContext("2d");
    _staticDirty = true;
    return _staticComposite;
  }

  // Calibration V1 Revision 9: every caller that changes what the
  // completed-Mark cache should show calls this -- see the call sites
  // (commit, undo, hydrate, removePersistedStrokes, clearSurface, the
  // camera/surface bus handlers in init()). Cheap (one boolean write); the
  // actual rebuild only happens lazily, once, the next time _renderAll
  // runs.
  function _markStaticDirty() {
    _staticDirty = true;
  }

  // ── Calibration V1 Revision 16: Visible-Mark Culling ────────────────────
  //
  // Reconnaissance (Revision 15) measured that at the app's normal starting
  // camera, ~78% of a 575-Mark scene's Marks contribute zero visible pixels
  // even with the Revision 14 50% overscan margin included -- most of every
  // ~190ms authoritative rebuild was spent rasterizing Marks nobody could
  // see. This selects, before rasterization, only the Marks whose geographic
  // bounds intersect the SAME "useful region" Revision 14 already rasterizes
  // into (viewport + the existing 50% overscan margin) -- it does not change
  // WHAT that region is, only skips fully-irrelevant Marks within it.
  //
  // Canonical Mark representation is untouched: no bounds are stored on a
  // Mark or Artwork, nothing is persisted -- bounds are derived fresh from
  // `obj.points` every rebuild (measured live: 1ms for 575 Marks, utterly
  // negligible next to the ~190ms it saves).
  //
  // CORRECTNESS -- conservative rendering allowance (reconnaissance done
  // before choosing this, not invented): a Mark's raw point bbox alone is
  // NOT enough to cull safely, because rendered pixels extend beyond the
  // raw path -- checked the actual deposition math rather than guessing:
  //   - a plain stroke (Pencil/Pen/Marker) extends up to `width/2` beyond
  //     its centerline (round caps/joins).
  //   - Mop's dabs can offset up to `baseRadius * MOP_DAB_LATERAL_SCALE`
  //     (0.6) laterally PLUS extend up to
  //     `baseRadius * MOP_DAB_VISUAL_SCALE * (1 + RADIUS_JITTER_RANGE)`
  //     (0.55 * 1.5 = 0.825) in radius, where `baseRadius = width/2` --
  //     worst case combined reach from the centerline is
  //     `~1.425 * baseRadius = ~0.71 * width` (mopDeposition.ts /
  //     surfaceDrawingRuntime.js's own MOP_DAB_* constants).
  //   - Spray's particles offset up to `baseRadius` from their emission
  //     point (bandedRadius maxes at 1) plus their own small radius, ~
  //     `1.09 * baseRadius = ~0.55 * width` (sprayDeposition.ts).
  //   - Eraser uses `obj.width` directly, same treatment as a plain stroke.
  // The largest of these (Mop, ~0.71x) is comfortably covered by using the
  // FULL `width` (not `width/2`) as the margin -- ~40% headroom over the
  // worst measured case, cheap to keep simple/uniform across all four
  // supplies rather than a separate precise allowance per material.
  // `authoredZoom` is accounted for by applying the SAME `_zoomScaleFor`
  // scale the actual render pass uses, so a Mark authored at a very
  // different zoom than the current camera still gets a correctly
  // proportioned margin.
  var _lastCullStats = null; // test/diagnostic-only, see __test.getLastCullStats() below

  function _computeDegreesPerPixel() {
    var mbr = _mbr();
    var map = mbr && mbr.getMap && mbr.getMap();
    if (!mbr || !map || !mbr.isReady() || !_canvas) return null;
    var center = map.getCenter ? map.getCenter() : null;
    if (!center) return null;
    var a = _projectScaled([center.lng, center.lat]);
    var b = _projectScaled([center.lng + 0.01, center.lat]);
    if (!a || !b) return null;
    var pixelDistance = Math.hypot(b.x - a.x, b.y - a.y);
    if (!(pixelDistance > 0)) return null;
    return 0.01 / pixelDistance; // degrees longitude per device pixel, at the current camera
  }

  function _markBBox(obj) {
    var pts = obj.points;
    if (!pts || !pts.length) return null;
    var minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i];
      if (p.longitude == null || p.latitude == null || !isFinite(p.longitude) || !isFinite(p.latitude)) continue;
      if (p.longitude < minLng) minLng = p.longitude;
      if (p.longitude > maxLng) maxLng = p.longitude;
      if (p.latitude < minLat) minLat = p.latitude;
      if (p.latitude > maxLat) maxLat = p.latitude;
    }
    if (minLng === Infinity) return null; // no geographic points on this Mark at all (e.g. local-2d format)
    return { minLng: minLng, maxLng: maxLng, minLat: minLat, maxLat: maxLat };
  }

  function _markRenderMarginDegrees(obj, degreesPerPixel) {
    var widthPx = obj.type === "material-erasure" ? obj.width : (obj.style && obj.style.width);
    if (!widthPx || !isFinite(widthPx)) return 0;
    var scale = _zoomScaleFor(obj.authoredZoom);
    return widthPx * scale * degreesPerPixel;
  }

  function _bboxIntersects(a, b) {
    return a.minLng <= b.maxLng && a.maxLng >= b.minLng && a.minLat <= b.maxLat && a.maxLat >= b.minLat;
  }

  // The SAME useful region Revision 14 already rasterizes into: the current
  // viewport expanded by the existing OVERSCAN_RATIO -- selection never
  // covers a smaller area than what actually gets rasterized/presented.
  function _usefulRegionBBox() {
    var mbr = _mbr();
    var map = mbr && mbr.getMap && mbr.getMap();
    if (!mbr || !map || !mbr.isReady()) return null;
    var b = map.getBounds ? map.getBounds() : null;
    if (!b) return null;
    var west = b.getWest(), east = b.getEast(), south = b.getSouth(), north = b.getNorth();
    var marginLng = (east - west) * OVERSCAN_RATIO;
    var marginLat = (north - south) * OVERSCAN_RATIO;
    return { minLng: west - marginLng, maxLng: east + marginLng, minLat: south - marginLat, maxLat: north + marginLat };
  }

  // Selects the subset of `objects` worth rasterizing this rebuild. Returns
  // `null` (meaning "cull nothing, use every object") when the region or a
  // degrees-per-pixel conversion isn't available -- e.g. before the map has
  // ever become ready -- so this NEVER drops a Mark it lacks the geographic
  // context to correctly evaluate; failing open (render everything) is the
  // only safe default here.
  function _cullObjectsForRebuild(objects) {
    var region = _usefulRegionBBox();
    var degreesPerPixel = _computeDegreesPerPixel();
    if (!region || degreesPerPixel === null) {
      return { selected: objects, stats: { total: objects.length, selected: objects.length, culled: 0, skipped: true } };
    }
    var selected = [];
    for (var i = 0; i < objects.length; i++) {
      var obj = objects[i];
      var bbox = _markBBox(obj);
      if (!bbox) { selected.push(obj); continue; } // no geographic bbox derivable -- fail open, keep it
      var margin = _markRenderMarginDegrees(obj, degreesPerPixel);
      var expanded = { minLng: bbox.minLng - margin, maxLng: bbox.maxLng + margin, minLat: bbox.minLat - margin, maxLat: bbox.maxLat + margin };
      if (_bboxIntersects(expanded, region)) selected.push(obj);
    }
    return { selected: selected, stats: { total: objects.length, selected: selected.length, culled: objects.length - selected.length, skipped: false } };
  }

  // Rebuilds the cached composite of every COMPLETED Mark -- exactly the
  // full-replay work `_renderAll` used to do on EVERY pointermove (measured:
  // ~169ms at 255 accumulated Marks / ~17,000 points, versus ~2-5ms for a
  // single long Spray Mark's OWN rendering in isolation -- the historical
  // replay, not the active gesture, was the entire cost). Now this only
  // runs when `_staticDirty` is set -- see `_markStaticDirty`'s call sites
  // for the full invalidation list. A pointermove during an active gesture
  // never marks this dirty, so it stays a single cheap `drawImage` blit for
  // the whole gesture.
  function _rebuildStaticComposite() {
    var layers = _ensureMaterialLayers();
    var composite = _ensureStaticComposite();
    if (!layers || !composite || !_staticCompositeCtx) return;

    // Calibration V1 Revision 14: layers/composite are the PADDED (overscan)
    // size -- clear the whole padded canvas, not just the viewport-sized
    // region, or a stale margin from a smaller previous bake could survive.
    for (var m = 0; m < MATERIAL_IDS.length; m++) {
      layers[MATERIAL_IDS[m]].ctx.clearRect(0, 0, composite.width, composite.height);
    }

    var surf    = _activeSurface();
    var objects = _overlayObjects(surf);
    var mbr     = _mbr();

    // Calibration V1 Revision 16: cull before rasterizing -- see this
    // section's own doc above. `_lastCullStats` is test/diagnostic-only
    // introspection, never read by production code.
    var cullT0 = performance.now();
    var culled = _cullObjectsForRebuild(objects);
    _lastCullStats = culled.stats;
    _lastCullStats.computeMs = performance.now() - cullT0;

    culled.selected.forEach(function (obj) {
      if (obj.type === "stroke") _drawStroke(layers, obj, mbr);
      else if (obj.type === "material-erasure") _drawErasure(layers, obj, mbr);
    });

    _staticCompositeCtx.clearRect(0, 0, composite.width, composite.height);
    for (var c = 0; c < MATERIAL_IDS.length; c++) {
      _staticCompositeCtx.drawImage(layers[MATERIAL_IDS[c]].canvas, 0, 0);
    }
    _staticDirty = false;
    _staticRebuildCount += 1;
    // Revision 12: this composite is now exact/authoritative for the
    // CURRENT camera -- any in-flight interaction transform is stale by
    // definition the instant a fresh bake exists, so it's cleared here
    // rather than left for a caller to remember to clear. The baseline is
    // recaptured against the current camera so the NEXT gesture (whatever
    // triggers it) has a correct reference to derive from.
    _cameraTransform = null;
    _captureCameraBaseline();
    // Calibration V1 Revision 20: hand the completed composite to whatever
    // is presenting it geographically (if anything) -- this file no longer
    // computes any geographic coverage itself; the consumer derives its own
    // tile geometry from the REAL current camera. Every trigger that
    // reaches this function (commit, undo, hydrate, moveend, surface
    // switch, resize) is covered uniformly, with no separate event wiring
    // needed.
    if (_presentationMode === "canvassource" && _presentationHook) {
      _presentationHook(composite);
    }
  }

  // Calibration V1 Revision 12: records the camera state (via two
  // geographic reference points' CURRENT screen projections) at the moment
  // the static composite was just authoritatively rebuilt. `refLngLat` is
  // an arbitrary second point near the map center -- its only job is to
  // give `_deriveCameraTransform` a second vector to measure scale/rotation
  // from; it is not tied to any Mark. Never used for actual Mark placement,
  // only for deriving the temporary presentation transform.
  function _captureCameraBaseline() {
    var mbr = _mbr();
    var map = mbr && mbr.getMap && mbr.getMap();
    if (!mbr || !map || !mbr.isReady() || !_canvas) { _cameraBaseline = null; return; }
    var center = map.getCenter ? map.getCenter() : null;
    if (!center || !isFinite(center.lng) || !isFinite(center.lat)) { _cameraBaseline = null; return; }
    var anchorLngLat = [center.lng, center.lat];
    var refLngLat = [center.lng + 0.01, center.lat];
    var anchorScreen = _projectScaled(anchorLngLat);
    var refScreen = _projectScaled(refLngLat);
    if (!anchorScreen || !refScreen) { _cameraBaseline = null; return; }
    _cameraBaseline = {
      anchorLngLat: anchorLngLat,
      refLngLat: refLngLat,
      anchorScreen: anchorScreen,
      refScreen: refScreen,
      pitch: map.getPitch ? map.getPitch() : 0,
    };
  }

  // Calibration V1 Revision 17 (Drawing Stability Closure, finding B): the
  // raw Mapbox map's own `map.project()` returns full sub-pixel precision.
  // `MapboxViewportRuntime.project()` (the SHARED wrapper other Wall systems
  // use) additionally rounds to the nearest integer pixel -- appropriate for
  // its own callers, but going through it here silently snapped every
  // geographic Mark point to an integer pixel on every reprojection, while
  // the live-preview path (which draws `_livePoints`' raw captured
  // coordinates directly, no reprojection at all) kept full sub-pixel
  // precision. That mismatch -- confirmed live, up to ~0.5px per point for
  // a realistic non-integer pointer position -- is what made a completed
  // stroke visibly "harden and shift" the instant it committed: the FIRST
  // static rebuild reprojects the exact same points through the ROUNDING
  // path the live preview never used. Calling the map directly here (not
  // the shared wrapper) keeps full precision consistently across both
  // Mark-rendering call sites (`_reprojectPoints` and here), matching
  // `_capturePoint`'s own unrounded values -- this is the fix, not a visual
  // compensation: it removes the actual coordinate divergence at its
  // source, for every supply, since every supply's render path funnels
  // through one of these two functions.
  function _mapProjectRaw(lngLat) {
    var mbr = _mbr();
    var map = mbr && mbr.getMap && mbr.getMap();
    if (map && typeof map.project === "function") return map.project(lngLat);
    return mbr ? mbr.project(lngLat) : null; // defensive fallback only -- not expected in practice
  }

  // Projects a [lng, lat] through the CURRENT camera into canvas-pixel
  // (device-pixel, not CSS-pixel) space -- the same coordinate system
  // `_reprojectPoints` produces for authored Mark geometry.
  function _projectScaled(lngLat) {
    var mbr = _mbr();
    if (!mbr || !mbr.isReady() || !_canvas) return null;
    var screen = _mapProjectRaw(lngLat);
    if (!screen || !isFinite(screen.x) || !isFinite(screen.y)) return null;
    var rect = _canvas.getBoundingClientRect();
    var sx = rect.width  > 0 ? _canvas.width  / rect.width  : 1;
    var sy = rect.height > 0 ? _canvas.height / rect.height : 1;
    return { x: screen.x * sx, y: screen.y * sy };
  }

  // Calibration V1 Revision 12: derives the screen-space similarity
  // transform (uniform scale + rotate about `_cameraBaseline.anchorScreen`,
  // landing at the reference point's CURRENT screen position) that maps the
  // already-baked composite (rendered under `_cameraBaseline`'s camera) onto
  // its geographically-correct position under the CURRENT camera -- without
  // reprojecting or redrawing a single Mark. Always computed fresh from the
  // fixed baseline to the current camera (never composed with the previous
  // tick's transform), so nothing can accumulate drift across a long
  // gesture. Web Mercator at constant pitch is conformal, so this is an
  // EXACT transform for pan/zoom/bearing -- not an approximation. Returns
  // null (caller must fall back to a full rebuild) when: no baseline has
  // been captured yet, the map isn't ready, or either the baseline or the
  // current camera has nonzero pitch -- pitch breaks the affine-similarity
  // assumption (Mapbox applies true perspective foreshortening under tilt),
  // and Revision 12 deliberately does not attempt a 2D approximation of it.
  var PITCH_EPSILON_DEGREES = 0.01;
  function _deriveCameraTransform() {
    if (!_cameraBaseline) return null;
    var mbr = _mbr();
    var map = mbr && mbr.getMap && mbr.getMap();
    if (!mbr || !map || !mbr.isReady()) return null;
    var currentPitch = map.getPitch ? map.getPitch() : 0;
    if (Math.abs(_cameraBaseline.pitch) > PITCH_EPSILON_DEGREES || Math.abs(currentPitch) > PITCH_EPSILON_DEGREES) return null;

    var anchorNow = _projectScaled(_cameraBaseline.anchorLngLat);
    var refNow = _projectScaled(_cameraBaseline.refLngLat);
    if (!anchorNow || !refNow) return null;

    var a0 = _cameraBaseline.anchorScreen, r0 = _cameraBaseline.refScreen;
    var vx0 = r0.x - a0.x, vy0 = r0.y - a0.y;
    var vx1 = refNow.x - anchorNow.x, vy1 = refNow.y - anchorNow.y;
    var len0 = Math.hypot(vx0, vy0);
    var len1 = Math.hypot(vx1, vy1);
    if (!(len0 > 0) || !isFinite(len1) || !(len1 >= 0)) return null;

    var scale = len1 / len0;
    var rotate = Math.atan2(vy1, vx1) - Math.atan2(vy0, vx0);
    if (!isFinite(scale) || scale <= 0 || !isFinite(rotate)) return null;

    return { fromX: a0.x, fromY: a0.y, toX: anchorNow.x, toY: anchorNow.y, scale: scale, rotate: rotate };
  }

  // Draws the already-baked static composite through an EXACT screen-space
  // similarity transform (see `_deriveCameraTransform`) instead of
  // reprojecting/rasterizing every Mark -- this is the Revision 12 mid-
  // gesture presentation path. `ctx.transform` composes right-to-left, so
  // reading bottom-up: translate the ORIGIN to the baseline anchor,
  // rotate + scale about it, then translate that anchor to its current
  // screen position -- equivalent to "rotate/scale about the baseline
  // anchor, then move the anchor to `toX,toY`".
  function _drawTransformedComposite(ctx, composite, transform) {
    ctx.save();
    ctx.translate(transform.toX, transform.toY);
    ctx.rotate(transform.rotate);
    ctx.scale(transform.scale, transform.scale);
    ctx.translate(-transform.fromX, -transform.fromY);
    // Calibration V1 Revision 14: the padded composite's own true-viewport
    // region starts at (overscanOffsetX, overscanOffsetY) within it (see
    // _offsetForOverscan) -- drawing at that negative offset, in this SAME
    // already-established transformed coordinate frame, moves the padding
    // rigidly along with the rest of the image under the exact similarity
    // transform, so the margin is exposed correctly during a gesture
    // instead of only ever being usable in the untransformed case.
    ctx.drawImage(composite, -_overscanOffsetX(), -_overscanOffsetY());
    ctx.restore();
  }

  // ── Rendering ──────────────────────────────────────────────────────────────
  function _renderAll() {
    if (!_ctx || !_canvas) return;
    _ensureMaterialLayers();
    var composite = _ensureStaticComposite();
    if (!composite) return;
    if (_staticDirty) _rebuildStaticComposite();

    _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
    // Calibration V1 Revision 18 (CanvasSource presentation spike): when an
    // experimental CanvasSource is presenting this SAME composite canvas
    // geographically (see canvasSourcePresentationSpike.js), this overlay
    // must stay blank -- Mapbox's own layer already shows the composite, so
    // drawing it AGAIN here would double-present it. Everything upstream
    // (culling, rasterization, the composite canvas itself) is completely
    // unchanged; only this final blit-to-screen step is skipped.
    if (_presentationMode === "canvassource") {
      // still draw the active in-progress gesture below, just not the composite
    } else if (_cameraTransform) {
      _drawTransformedComposite(_ctx, composite, _cameraTransform);
    } else {
      // Calibration V1 Revision 14: crop/blit the padded composite's center
      // (true-viewport) region -- see _offsetForOverscan's doc. The canvas's
      // own bounds clip the surrounding margin automatically; nothing
      // beyond _canvas.width/height is ever visible in the untransformed
      // (settled) case, only during a camera-transform gesture above.
      _ctx.drawImage(composite, -_overscanOffsetX(), -_overscanOffsetY());
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
        _drawMopPoints(_ctx, _livePoints, previewStyle, _prospectiveMarkId());
      } else if (_brush.supplyId === "spray") {
        _drawSprayPoints(_ctx, _livePoints, previewStyle, _prospectiveMarkId());
      } else {
        _drawRawPoints(_ctx, _livePoints, previewStyle);
      }
    }
  }

  function _reprojectPoints(pts) {
    var mbr = _mbr();
    return pts.map(function (p) {
      if (mbr && mbr.isReady() && p.longitude !== null && p.latitude !== null && p.longitude !== undefined && p.latitude !== undefined) {
        var screen = _mapProjectRaw([p.longitude, p.latitude]); // Revision 17: full sub-pixel precision, see _mapProjectRaw's doc
        var rect = _canvas.getBoundingClientRect();
        var sx = rect.width  > 0 ? _canvas.width  / rect.width  : 1;
        var sy = rect.height > 0 ? _canvas.height / rect.height : 1;
        return { x: screen.x * sx, y: screen.y * sy };
      }
      // Fallback: original canvas-pixel position (map hasn't moved or no geo anchor)
      return { x: p.x, y: p.y };
    });
  }

  // Calibration V1 Revision 14: `_reprojectPoints` itself keeps returning
  // TRUE viewport screen coordinates -- overscan is purely a rendering
  // detail of the padded material layers/composite, applied here (the only
  // place points are actually placed into those padded canvases) so
  // `_reprojectPoints`'s own meaning, and every existing caller/test of it,
  // is unaffected.
  function _offsetForOverscan(pts) {
    var offsetX = _overscanOffsetX(), offsetY = _overscanOffsetY();
    if (!offsetX && !offsetY) return pts;
    return pts.map(function (p) { return { x: p.x + offsetX, y: p.y + offsetY }; });
  }

  function _drawStroke(layers, obj, mbr) {
    var pts = obj.points;
    if (!pts || pts.length < 2) return;
    var drawPts = _offsetForOverscan(_reprojectPoints(pts));
    var materialId = MATERIAL_BY_SUPPLY[obj.operation] || "graphite";
    var ctx = layers[materialId].ctx;
    // Calibration V1 Revision 11: `obj.id` (NOT `obj.markId`) is the seed
    // source. `obj.id` is assigned exactly ONCE -- at local creation
    // ("stroke-N") or at hydration ("artwork-mark-" + the Firestore mark
    // id) -- and NEVER reassigned afterward. `obj.markId` is set later,
    // asynchronously, by `bindArtwork()` once Firestore persistence
    // completes -- using `markId || id` meant a Mark's deterministic
    // deposition seed silently SWITCHED the instant persistence finished,
    // which is what made completed Mop dots appear to reroll during
    // ordinary live use (the change coincided with, but was never actually
    // caused by, camera movement). `obj.id` alone is stable across the
    // entire lifecycle: local creation -> active preview -> commit ->
    // persistence -> bindArtwork -> any number of cache rebuilds -> reload.
    var seedSource = obj.id;
    // Calibration V1 Revision 7: the SAME zoom scale is applied here, once,
    // to a COPY of this Mark's style, so every material sublayer downstream
    // (Mop body + dabs, Spray core + particles, or a plain Pencil/Pen/
    // Marker line) uses the identical scaled Width -- material layers never
    // scale independently. See mapZoomScale.ts.
    var scale = _zoomScaleFor(obj.authoredZoom);
    var scaledStyle = scale === 1 ? obj.style : Object.assign({}, obj.style, { width: obj.style.width * scale });
    if (materialId === "mop") {
      _drawMopPoints(ctx, drawPts, scaledStyle, seedSource);
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
    var drawPts = _offsetForOverscan(_reprojectPoints(pts));
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

  // Calibration V1 Revision 10 (camera-instability fix): every dab's
  // jitter/skip/scatter used to be keyed on `dab.x, dab.y` -- the dab's
  // REPROJECTED SCREEN POSITION, which changes on every pan/zoom/pitch.
  // That meant a completed Mark's "deterministic" texture silently
  // re-rolled on every camera move (most visible on a dot, where the
  // Mark's entire rendering hinges on one or two dabs' hash draws, but
  // present for every Mop Mark). Fixed by keying on the Mark's own STABLE
  // identity (`seedSource` -- `markId` once persisted, the local stroke id
  // before that, matching exactly what Spray's `resolveSprayParticlePlan`/
  // `resolveSprayCorePlan` already do) plus the dab's INDEX in its own
  // deposition plan (stable for a given authored path), never screen
  // coordinates.
  function _drawMopPoints(ctx, pts, style, seedSource) {
    var deposition = _deposition();
    if (!deposition || !deposition.resolveMopDabPlan) { _drawRawPoints(ctx, pts, style); return; }
    var rendering = _rendering();
    var hash01 = (rendering && rendering.hash01) || _hash01Fallback;
    // Calibration V1 Revision 11: fillMopDab (crisp contact edge), not
    // fillSprayParticle (Spray's soft aerosol falloff) -- see
    // strokeSmoothing.ts's doc. Falls back to fillSprayParticle only if an
    // older cached bundle hasn't loaded fillMopDab yet, never as the
    // normal path.
    var fillSoftDab = (rendering && rendering.fillMopDab) || (rendering && rendering.fillSprayParticle);
    var markSeed = (deposition.hashSeed && seedSource != null) ? deposition.hashSeed(String(seedSource)) : 0;
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
    // Calibration V1 Revision 10 (dot-gesture fix): the random per-dab
    // inclusion probability and lateral scatter exist to break up a LONG
    // stroke's regular rhythm -- across hundreds of dabs, randomly
    // dropping/offsetting some is invisible texture. Applied to a DOT
    // gesture (one, or very few, dabs total) the exact same randomness
    // instead makes the dot itself unreliable: a coin-flip whether its
    // one dab renders at all, and a visible off-center wobble when it
    // does. A short dab list (<=3, generously covers a dot/near-dot) skips
    // both -- every dab always renders, centered -- while any real stroke
    // (every-day case, dabs.length usually in the dozens+) is completely
    // unaffected.
    var isDotLike = dabs.length <= 3;
    for (var d = 0; d < dabs.length; d++) {
      var dab = dabs[d];
      if (!isDotLike && hash01(markSeed, d, 4) > MOP_DAB_INCLUDE_PROBABILITY) continue;
      var prev = dabs[d - 1] || dab;
      var next = dabs[d + 1] || dab;
      var tangentX = next.x - prev.x;
      var tangentY = next.y - prev.y;
      var tangentLength = Math.hypot(tangentX, tangentY) || 1;
      var perpX = -tangentY / tangentLength;
      var perpY = tangentX / tangentLength;
      var lateral = isDotLike ? 0 : (hash01(markSeed, d, 0) * 2 - 1) * baseRadius * MOP_DAB_LATERAL_SCALE;
      var radiusJitter = 1 + (hash01(markSeed, d, 1) * 2 - 1) * MOP_DAB_RADIUS_JITTER_RANGE;
      var alphaJitter = 1 + (hash01(markSeed, d, 2) * 2 - 1) * MOP_DAB_ALPHA_JITTER_RANGE;
      var px = dab.x + perpX * lateral, py = dab.y + perpY * lateral;
      var r = Math.max(0.3, dab.radius * MOP_DAB_VISUAL_SCALE * radiusJitter);
      var a = Math.max(0, dab.alphaScale * 0.55 * alphaJitter);
      // Defensive: some legacy/edge-case reprojected point (e.g. a
      // pre-existing Mark whose geographic coordinates land outside the
      // camera's currently representable range) can yield a non-finite
      // screen position -- createRadialGradient/arc throw hard on that.
      // Skip just this one dab rather than aborting the whole render pass.
      if (!isFinite(px) || !isFinite(py) || !isFinite(r) || !isFinite(a)) continue;
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
    _markStaticDirty();
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
    _markStaticDirty();
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

  // Calibration V1 Revision 11 (batch-hydration fix): the actual
  // mark-decoding/pushing logic, with NO render/cache side effects of its
  // own -- `hydrateArtwork` and `hydrateArtworks` below both call this,
  // then decide ONCE whether/when to mark the cache dirty and render. This
  // is what lets `hydrateArtworks` add many Artworks while paying for
  // exactly one rebuild at the end, instead of one progressively-more-
  // expensive rebuild per Artwork document (see hydrateArtworks' own doc).
  function _hydrateArtworkInto(artwork, objects, surf) {
    if (!artwork || !artwork.id || !Array.isArray(artwork.marks)) return 0;
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
    return added;
  }

  // Single-Artwork hydration -- unchanged public behavior (one render/cache
  // rebuild per call). Kept for any caller that genuinely needs to hydrate
  // exactly one Artwork at a time (e.g. a single new Artwork arriving after
  // initial load).
  function hydrateArtwork(artwork) {
    var surf = _activeSurface();
    if (!surf) return 0;
    var added = _hydrateArtworkInto(artwork, _overlayObjects(surf), surf);
    if (added > 0) _markStaticDirty();
    _renderAll();
    return added;
  }

  // Calibration V1 Revision 11 (fixes the ~30s sign-in freeze): bulk
  // hydration for sign-in restoration. The old code path called
  // `hydrateArtwork` once PER Artwork document (~150-200+ in the current
  // dataset) in a tight loop; each call triggered its own full
  // static-composite rebuild (Revision 9), with rebuild cost growing as
  // marks accumulated -- O(n) per call x n calls, an O(n^2) total that
  // measured close to the reported ~30 seconds. This decodes/pushes every
  // Artwork's Marks with ZERO render/cache side effects per Artwork (via
  // `_hydrateArtworkInto`), then marks the cache dirty and renders exactly
  // ONCE at the end, regardless of how many Artwork documents were
  // hydrated.
  function hydrateArtworks(artworks) {
    if (!Array.isArray(artworks) || artworks.length === 0) return 0;
    var surf = _activeSurface();
    if (!surf) return 0;
    var objects = _overlayObjects(surf);
    var total = 0;
    for (var i = 0; i < artworks.length; i += 1) {
      total += _hydrateArtworkInto(artworks[i], objects, surf);
    }
    if (total > 0) _markStaticDirty();
    _renderAll();
    return total;
  }

  function removePersistedStrokes() {
    var surf = _activeSurface();
    if (!surf) return 0;
    var objects = _overlayObjects(surf);
    var retained = objects.filter(function (item) { return !item.artworkId; });
    var removed = objects.length - retained.length;
    surf.overlayObjects = retained;
    if (removed > 0) _markStaticDirty();
    _renderAll();
    return removed;
  }

  // Force a re-render (called externally after camera change)
  function renderOverlay() { _renderAll(); }

  // ── Calibration V1 Revision 20: production presentation API ─────────────
  // Promoted from __test-only Revision 18 introspection to a real,
  // supported integration surface -- ArtworkGeographicPresentation.js is
  // a genuine production consumer, not a test. __test.* aliases below are
  // kept pointing at the SAME functions so existing Revision 12/16/18
  // regression tests keep working unchanged. This file computes NO
  // geographic coverage itself (Revision 20 removed the Revision 19
  // detached-pitch-0-camera quad math after Revision 19I proved it wrong
  // -- see ArtworkGeographicPresentation.js's own doc); it only exposes the
  // composite canvas and overscan geometry so the presenter can derive its
  // own tile geography from the REAL current camera.
  function setPresentationMode(mode) {
    if (mode !== "canvas" && mode !== "canvassource") return false;
    _presentationMode = mode;
    _renderAll();
    return true;
  }
  function getPresentationMode() { return _presentationMode; }
  function getCompositeCanvas() { return _ensureStaticComposite(); }
  function getStaticRebuildCount() { return _staticRebuildCount; }
  function setPresentationHook(fn) { _presentationHook = typeof fn === "function" ? fn : null; }
  function getOverscanInfo() {
    return {
      ratio: OVERSCAN_RATIO,
      viewportWidth: _canvas ? _canvas.width : 0,
      viewportHeight: _canvas ? _canvas.height : 0,
      rasterWidth: _overscanWidth(),
      rasterHeight: _overscanHeight(),
      offsetX: _overscanOffsetX(),
      offsetY: _overscanOffsetY(),
    };
  }

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
    hydrateArtworks: hydrateArtworks,
    removePersistedStrokes: removePersistedStrokes,
    setPresentationMode:   setPresentationMode,
    getPresentationMode:   getPresentationMode,
    getCompositeCanvas:    getCompositeCanvas,
    getStaticRebuildCount: getStaticRebuildCount,
    markStaticDirty:       _markStaticDirty,
    setPresentationHook:   setPresentationHook,
    getOverscanInfo:       getOverscanInfo,
    __test: {
      capturePoint: function (clientX, clientY) {
        return _capturePoint({ clientX: clientX, clientY: clientY });
      },
      commitPoints: function (points) {
        _livePoints = (points || []).slice();
        _commitStroke();
      },
      reprojectPoints: _reprojectPoints,
      // Calibration V1 Revision 9 test support -- introspection into the
      // static-composite cache, used by the focused caching regression
      // tests in subwayMapPaintSurface.tests.js. Never used by production
      // code paths.
      getStaticRebuildCount: function () { return _staticRebuildCount; },
      isStaticDirty: function () { return _staticDirty; },
      markStaticDirty: _markStaticDirty,
      // Renders once as if an active gesture were in progress with the
      // given points, without actually starting/ending a real gesture or
      // touching `_isDrawing`'s real state -- lets a test call renderOverlay
      // repeatedly "mid-gesture" and confirm the static cache is NOT
      // rebuilt each time.
      simulateActiveGestureRender: function (points) {
        var wasDrawing = _isDrawing;
        var savedPoints = _livePoints;
        _isDrawing = true;
        _livePoints = points || [];
        _renderAll();
        _isDrawing = wasDrawing;
        _livePoints = savedPoints;
      },
      // Calibration V1 Revision 12 (Camera Interaction Cache) introspection
      // -- used by the camera-interaction regression tests in
      // subwayMapPaintSurface.tests.js. Never used by production code paths.
      getCameraTransform: function () { return _cameraTransform ? Object.assign({}, _cameraTransform) : null; },
      getCameraBaseline: function () { return _cameraBaseline ? Object.assign({}, _cameraBaseline) : null; },
      // Calibration V1 Revision 14 (Artwork Cache Overscan) introspection.
      getOverscanInfo: getOverscanInfo,
      // Calibration V1 Revision 16 (Visible-Mark Culling) introspection.
      getLastCullStats: function () { return _lastCullStats ? Object.assign({}, _lastCullStats) : null; },
      // Calibration V1 Revision 20: these now just alias the real
      // production API above -- kept under __test too since existing
      // regression tests reference them via this namespace.
      setPresentationMode: setPresentationMode,
      getPresentationMode: getPresentationMode,
      getCompositeCanvas: getCompositeCanvas,
      getOverscanRasterSize: function () { return { width: _overscanWidth(), height: _overscanHeight() }; },
      // Renders the static composite using ALL objects (no culling) into an
      // offscreen canvas of the SAME padded size, for direct pixel-identity
      // comparison against the normal (culled) composite -- the correctness
      // test this revision requires. Never used by production code paths.
      snapshotUncleanComposite: function () {
        var surf = _activeSurface();
        var objects = _overlayObjects(surf);
        var mbr = _mbr();
        var w = _overscanWidth(), h = _overscanHeight();
        if (!w || !h) return null;
        var tmpLayers = {};
        for (var i = 0; i < MATERIAL_IDS.length; i++) {
          var c = global.document.createElement("canvas");
          c.width = w; c.height = h;
          tmpLayers[MATERIAL_IDS[i]] = { canvas: c, ctx: c.getContext("2d") };
        }
        objects.forEach(function (obj) {
          if (obj.type === "stroke") _drawStroke(tmpLayers, obj, mbr);
          else if (obj.type === "material-erasure") _drawErasure(tmpLayers, obj, mbr);
        });
        var out = global.document.createElement("canvas");
        out.width = w; out.height = h;
        var outCtx = out.getContext("2d");
        for (var c2 = 0; c2 < MATERIAL_IDS.length; c2++) outCtx.drawImage(tmpLayers[MATERIAL_IDS[c2]].canvas, 0, 0);
        return Array.from(outCtx.getImageData(0, 0, w, h).data);
      },
      // Renders the static composite to an offscreen canvas EXACTLY as
      // `_renderAll` would (respecting a live `_cameraTransform`, if any)
      // and returns its pixel bytes -- lets a test compare "the composite
      // as currently presented" against "a forced authoritative rebuild"
      // without depending on screenshot/DOM timing.
      snapshotComposite: function () {
        var composite = _ensureStaticComposite();
        if (!composite) return null;
        var canvas = global.document.createElement("canvas");
        canvas.width = composite.width;
        canvas.height = composite.height;
        var ctx = canvas.getContext("2d");
        if (_cameraTransform) {
          _drawTransformedComposite(ctx, composite, _cameraTransform);
        } else {
          ctx.drawImage(composite, 0, 0);
        }
        return Array.from(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
      },
    },
  };

})(window);
