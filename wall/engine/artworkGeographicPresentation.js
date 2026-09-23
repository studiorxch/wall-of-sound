(function (global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  // ── ArtworkGeographicPresentation (Calibration V1 Revision 20) ───────────
  //
  // PRODUCTION. Presents the SAME authoritative composite
  // SurfaceDrawingRuntime already builds (canonical Marks -> Revision 16
  // culling -> material rasterization -> one composite canvas) through
  // Mapbox's own WebGL pipeline, letting Mapbox own pan/zoom/bearing/pitch
  // reprojection natively.
  //
  // MANDATORY INVARIANT (Revision 19I root cause, proven in 19J/19K/19L/19O):
  //
  //   THE SAME REAL CURRENT MAPBOX CAMERA MUST BE USED BOTH TO PLACE MARK
  //   CONTENT INTO THE COMPOSITE (SurfaceDrawingRuntime's own
  //   _reprojectPoints/map.project) AND TO DERIVE EVERY TILE'S GEOGRAPHIC
  //   CORNERS (map.unproject, here).
  //
  // The Revision 19/19E production path violated this by deriving the
  // parent geo quad from a DETACHED pitch=0 transform clone -- avoiding the
  // Revision 18/19B horizon-degeneracy of one huge quad, but at the cost of
  // a pitch-proportional registration error (measured ~18px at pitch 30),
  // because content was placed via the real (possibly pitched) camera while
  // its presentation coordinates came from a different, pitch-0 camera
  // model. Revision 19K/19L/19O proved the fix: use the REAL camera for
  // both, and keep each presentation tile SMALL (~100 CSS px) so its own
  // bilinear 4-corner interpolation stays close to the true perspective
  // projection across that small area -- this is what avoids reproducing
  // the original Revision 18 horizon/frustum failure without needing a
  // detached camera model at all. Fixed ~100px tiles are a proven,
  // deliberate choice -- Revision 19P measured that error-bounded adaptive
  // subdivision at this tile size causes routine (35-68%) subdivision at
  // normal operating pitch and an 3-8x settle-cost regression for a
  // fix that did not reliably improve worst-case error; it was rejected.
  //
  // ACCEPTED LIMITATION (Revision 19O/19P, not solved here): fixed ~100px
  // tiles remain a bounded perspective approximation, not an exact one.
  // Measured worst cases: large (~9.8km) Artwork registration up to ~3.9px
  // at pitch45+bearing30; some camera-settle (B->C) transitions (zoom,
  // pitch-to-0) up to ~2.4-2.8px. These are known, accepted, and NOT
  // blockers -- they are a dramatic improvement over the ~18px error this
  // revision replaces, not a regression against any prior shipped behavior.
  //
  // Only creates tiles for OCCUPIED raster regions -- keeps the Mapbox
  // source/layer count bounded by actual content, not by the full
  // composite's padded/overscanned extent.
  //
  // OWNERSHIP BOUNDARY: this file owns ONLY presentation (tile crop +
  // lifecycle). It does not own Mark semantics, culling policy, material
  // rasterization, Artwork grouping, or persistence -- SurfaceDrawingRuntime
  // remains authoritative for the parent composite and calls
  // `_onCompositeRebuilt` (wired via `setPresentationHook`) exactly once per
  // authoritative rebuild -- commit, undo, hydrate, moveend, surface
  // switch, or resize, whichever triggered it. This module performs ZERO
  // work on a mid-gesture camera tick: Mapbox's own renderer continuously
  // reprojects the already-placed tile sources with no crop or coordinate
  // update from here at all.
  //
  // FALLBACK: if enabling fails for any reason -- map unavailable,
  // source/layer creation fails -- this fails atomically, cleans up any
  // partially-created tiles, and leaves SurfaceDrawingRuntime on its
  // existing direct `_ctx` canvas presentation (the Revision 12 transform
  // machinery remains available underneath that "canvas" mode for
  // pan/zoom/bearing at pitch 0, unchanged, untouched by this revision).
  // It never retries during camera motion.

  var TILE_SIZE_PX = 100;

  var _enabled = false;
  var _tiles = {}; // "gx_gy" -> { canvas, sourceId, layerId }
  var _updateCount = 0;
  var _initFailedReason = null;
  var _lastStats = null;

  function _drawing() { return SBE.SurfaceDrawingRuntime; }
  function _map() {
    var mbr = SBE.MapboxViewportRuntime;
    return mbr && mbr.getMap ? mbr.getMap() : null;
  }
  function _sourceId(key) { return "studiorich-artwork-geo-tile-" + key; }
  function _layerId(key) { return _sourceId(key) + "-layer"; }

  // Single alpha-channel scan of the composite to find its occupied
  // (non-transparent) pixel bounding box -- cheap relative to a rebuild,
  // and correct by construction: it looks at what actually got
  // rasterized, not at which Marks culling selected.
  function _occupiedBounds(compositeCanvas) {
    var w = compositeCanvas.width, h = compositeCanvas.height;
    var ctx = compositeCanvas.getContext("2d");
    var data = ctx.getImageData(0, 0, w, h).data;
    var minX = w, minY = h, maxX = -1, maxY = -1;
    var step = 2; // a presentation bounding box does not need per-pixel precision
    for (var y = 0; y < h; y += step) {
      var rowOffset = y * w * 4;
      for (var x = 0; x < w; x += step) {
        if (data[rowOffset + x * 4 + 3] > 0) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < minX || maxY < minY) return null;
    return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
  }

  function _cellHasContent(compositeCanvas, rect) {
    var ctx = compositeCanvas.getContext("2d");
    var w = rect[2], h = rect[3];
    if (w <= 0 || h <= 0) return false;
    var data = ctx.getImageData(rect[0], rect[1], w, h).data;
    var step = 4; // this only needs to answer "any content at all"
    for (var y = 0; y < h; y += step) {
      var rowOffset = y * w * 4;
      for (var x = 0; x < w; x += step) {
        if (data[rowOffset + x * 4 + 3] > 0) return true;
      }
    }
    return false;
  }

  function _removeAllTiles() {
    var map = _map();
    if (!map) { _tiles = {}; return; }
    Object.keys(_tiles).forEach(function (key) {
      var t = _tiles[key];
      if (map.getLayer(t.layerId)) map.removeLayer(t.layerId);
      if (map.getSource(t.sourceId)) map.removeSource(t.sourceId);
    });
    _tiles = {};
  }

  // The one production integration point -- called by SurfaceDrawingRuntime
  // at the end of EVERY authoritative rebuild, never on a mid-gesture tick.
  function _onCompositeRebuilt(compositeCanvas) {
    if (!_enabled || !compositeCanvas) return;
    var t0 = performance.now();
    var map = _map();
    var drawing = _drawing();
    if (!map || !drawing) return;

    var info = drawing.getOverscanInfo ? drawing.getOverscanInfo() : drawing.__test.getOverscanInfo();
    var offX = info.offsetX, offY = info.offsetY;

    var occupied = _occupiedBounds(compositeCanvas);
    if (!occupied) { _removeAllTiles(); _lastStats = { emptyComposite: true }; return; }

    var gridMinGX = Math.floor(occupied.minX / TILE_SIZE_PX);
    var gridMaxGX = Math.floor(occupied.maxX / TILE_SIZE_PX);
    var gridMinGY = Math.floor(occupied.minY / TILE_SIZE_PX);
    var gridMaxGY = Math.floor(occupied.maxY / TILE_SIZE_PX);
    var totalPotentialTiles = (gridMaxGX - gridMinGX + 1) * (gridMaxGY - gridMinGY + 1);
    var createdCount = 0, skippedEmpty = 0;
    var newTiles = {};

    for (var gy = gridMinGY; gy <= gridMaxGY; gy++) {
      for (var gx = gridMinGX; gx <= gridMaxGX; gx++) {
        var rx = gx * TILE_SIZE_PX, ry = gy * TILE_SIZE_PX;
        var rw = Math.min(TILE_SIZE_PX, compositeCanvas.width - rx);
        var rh = Math.min(TILE_SIZE_PX, compositeCanvas.height - ry);
        if (rw <= 0 || rh <= 0) continue;
        if (!_cellHasContent(compositeCanvas, [rx, ry, rw, rh])) { skippedEmpty++; continue; }

        // Composite-pixel rect -> overlay/CSS-pixel rect (the overscan
        // offset is already in CSS px, no devicePixelRatio conversion --
        // confirmed live across Revisions 19C-19O).
        var cssRect = { x: rx - offX, y: ry - offY, w: rw, h: rh };

        // MANDATORY INVARIANT: geographic corners come from the REAL
        // current camera via map.unproject() -- the exact same camera
        // _reprojectPoints used to place this tile's own pixel content
        // moments earlier in this same rebuild. Never a detached/pitch=0
        // camera model.
        var corners = [
          { x: cssRect.x, y: cssRect.y },
          { x: cssRect.x + cssRect.w, y: cssRect.y },
          { x: cssRect.x + cssRect.w, y: cssRect.y + cssRect.h },
          { x: cssRect.x, y: cssRect.y + cssRect.h },
        ].map(function (p) { var ll = map.unproject([p.x, p.y]); return [ll.lng, ll.lat]; });
        if (!corners.every(function (c) { return isFinite(c[0]) && isFinite(c[1]); })) { skippedEmpty++; continue; }

        var key = gx + "_" + gy;
        var sourceId = _sourceId(key), layerId = _layerId(key);
        var existing = _tiles[key];
        var canvas = existing ? existing.canvas : global.document.createElement("canvas");
        if (canvas.width !== rw || canvas.height !== rh) { canvas.width = rw; canvas.height = rh; }
        var ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, rw, rh);
        // Crop directly from the ONE authoritative composite -- never
        // rasterize a tile's material independently (keeps deterministic
        // Mop/Spray texture byte-identical to a direct-canvas render).
        ctx.drawImage(compositeCanvas, rx, ry, rw, rh, 0, 0, rw, rh);

        if (!map.getSource(sourceId)) {
          map.addSource(sourceId, { type: "canvas", canvas: canvas, coordinates: corners, animate: true });
        } else {
          map.getSource(sourceId).setCoordinates(corners);
        }
        // Appended with no "before" layer id -- same as every existing
        // subway route/station layer's own addLayer call, so Artwork
        // renders on top of them, preserving the pre-existing visual
        // stacking (Mapbox -> #engine-canvas -> #surface-overlay). These
        // raster layers live inside the Mapbox WebGL canvas itself,
        // underneath the (blank-while-settled) #surface-overlay DOM canvas,
        // which still owns pointer input for drawing -- a Mapbox layer
        // cannot intercept DOM pointer events on a different canvas
        // element, so this changes nothing about drawing/pointer input.
        if (!map.getLayer(layerId)) {
          map.addLayer({ id: layerId, type: "raster", source: sourceId, paint: { "raster-fade-duration": 0 } });
        }
        newTiles[key] = { canvas: canvas, sourceId: sourceId, layerId: layerId };
        createdCount++;
      }
    }

    // Remove tiles that existed before but aren't needed this rebuild
    // (grid moved/shrunk/content changed).
    Object.keys(_tiles).forEach(function (key) {
      if (!newTiles[key]) {
        var t = _tiles[key];
        if (map.getLayer(t.layerId)) map.removeLayer(t.layerId);
        if (map.getSource(t.sourceId)) map.removeSource(t.sourceId);
      }
    });
    _tiles = newTiles;
    _updateCount += 1;

    _lastStats = {
      tileSizePx: TILE_SIZE_PX,
      compositeSize: { w: compositeCanvas.width, h: compositeCanvas.height },
      occupied: occupied,
      totalPotentialTiles: totalPotentialTiles,
      tilesCreated: createdCount,
      tilesSkippedEmpty: skippedEmpty,
      sourcesActive: Object.keys(_tiles).length,
      layersActive: Object.keys(_tiles).length,
      updateDurationMs: performance.now() - t0,
    };
  }

  // Atomic failure handling: never leaves a partial tile set active.
  // Cleans up whatever partial state exists and falls back to
  // SurfaceDrawingRuntime's own existing direct canvas presentation. Does
  // not retry during camera motion -- a later explicit enable() call is the
  // only way back in.
  function _handleRuntimeFailure(reason) {
    _initFailedReason = reason;
    _removeAllTiles();
    var drawing = _drawing();
    if (drawing) {
      if (drawing.setPresentationHook) drawing.setPresentationHook(null);
      if (drawing.setPresentationMode) drawing.setPresentationMode("canvas");
      if (drawing.markStaticDirty) drawing.markStaticDirty();
      if (drawing.renderOverlay) drawing.renderOverlay();
    }
    _enabled = false;
    console.warn("[ArtworkGeographicPresentation] disabled -- " + reason);
  }

  function enable() {
    var map = _map();
    var drawing = _drawing();
    if (!map || !drawing || !drawing.getCompositeCanvas || !drawing.setPresentationHook) {
      _initFailedReason = "map or SurfaceDrawingRuntime production API unavailable";
      return false;
    }
    _initFailedReason = null;
    _updateCount = 0;
    _tiles = {};

    // Force a fresh authoritative bake at the CURRENT camera before wiring
    // anything up, so the very first composite this module sees (and the
    // tile geography derived from it) is guaranteed current.
    drawing.markStaticDirty();
    drawing.setPresentationMode("canvassource");
    drawing.setPresentationHook(_onCompositeRebuilt);

    var composite = drawing.getCompositeCanvas();
    if (!composite) {
      _handleRuntimeFailure("no composite available after forced rebuild");
      return false;
    }
    _onCompositeRebuilt(composite);
    if (Object.keys(_tiles).length === 0 && _lastStats && !_lastStats.emptyComposite) {
      _handleRuntimeFailure("initial tile creation failed");
      return false;
    }
    _enabled = true;
    console.log("[ArtworkGeographicPresentation] enabled -- fixed " + TILE_SIZE_PX + "px real-camera tile presentation active");
    return true;
  }

  // Safe to call twice, and safe if initialization was partial/failed.
  function disable() {
    _removeAllTiles();
    var drawing = _drawing();
    if (drawing) {
      if (drawing.setPresentationHook) drawing.setPresentationHook(null);
      if (drawing.setPresentationMode) drawing.setPresentationMode("canvas");
      if (drawing.markStaticDirty) drawing.markStaticDirty();
    }
    _enabled = false;
  }

  function isEnabled() { return _enabled; }

  function getDiagnostics() {
    return {
      enabled: _enabled,
      updateCount: _updateCount,
      initFailedReason: _initFailedReason,
      stats: _lastStats,
    };
  }

  // Auto-initialize once the map is ready -- the production startup path.
  // If the map somehow became ready before this script's own registration
  // ran (unlikely given the fixed script load order in index.html, but
  // defensive), enable() immediately instead of waiting for an event that
  // already fired.
  var bus = SBE.WorkspaceEventBus;
  if (bus) bus.on("map:ready", function () { enable(); });
  var mbrEarly = SBE.MapboxViewportRuntime;
  if (mbrEarly && mbrEarly.isReady && mbrEarly.isReady()) enable();

  SBE.ArtworkGeographicPresentation = {
    enable: enable,
    disable: disable,
    isEnabled: isEnabled,
    getDiagnostics: getDiagnostics,
    TILE_SIZE_PX: TILE_SIZE_PX,
    __test: {
      sourceId: _sourceId,
      layerId: _layerId,
      occupiedBounds: _occupiedBounds,
      onCompositeRebuilt: _onCompositeRebuilt,
    },
  };

})(window);
