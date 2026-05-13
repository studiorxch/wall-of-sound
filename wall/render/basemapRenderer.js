// 0516_WOS_BasemapFoundation_v1.0.0
// Basemap Renderer — OSM raster tile layer, renders beneath all WOS spatial systems.
// Vanilla IIFE. Attaches to SBE.BasemapRenderer.
// Load order: spatialInfrastructure.js → basemapRenderer.js → referenceGeographyLayer.js → …
//
// ═══════════════════════════════════════════════════════════════════════════
// DESIGN
//   Fetches Web Mercator raster tiles from OpenStreetMap.
//   Projects tile corners through the stored corridor projection (SI.projectGeo)
//   so tiles align with all other spatial layers in canvas space.
//
//   Projection note: OSM tiles are Web Mercator; the corridor uses a linear
//   equirectangular projection. Over the 0.78° latitude span of Phase 1, the
//   distortion is ~17% max (latitude non-linearity). This is acceptable for
//   cinematic geographic orientation.
//
// TILE PROVIDER
//   https://tile.openstreetmap.org/{z}/{x}/{y}.png
//   No API key required. CORS: Access-Control-Allow-Origin: *
//
// RENDER ORDER (call before everything in renderRouteWorldOverlay)
//   [1] BasemapRenderer    ← this module
//   [2] ReferenceGeographyLayer
//   [3] CorridorRenderer
//   [4] Route FX / Actors
//   [5] HUD
//
// ZOOM CALIBRATION
//   At camera scale 1 (full 110km corridor visible), Z=11 gives ~21 tiles.
//   Rule: Z = clamp(round(log2(cameraScale) + 11), 8, 17)
// ═══════════════════════════════════════════════════════════════════════════

(function initBasemapRenderer(global) {
  "use strict";

  var SBE = (global.SBE = global.SBE || {});

  // ── Constants ──────────────────────────────────────────────────────────────
  var TILE_URL      = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
  var TILE_SIZE     = 256;
  var MAX_CACHE     = 256;
  var MIN_ZOOM      = 8;
  var MAX_ZOOM      = 17;
  var DEFAULT_ZOOM  = 11;
  var MAX_TILES_PER_FRAME = 50;    // safety cap on tiles drawn per render
  var TILE_MARGIN   = 1;           // extra tiles fetched beyond visible edge

  // ── LRU Tile Cache ─────────────────────────────────────────────────────────
  // Each entry: { img: HTMLImageElement, loaded: bool, failed: bool, lastUsed: int }
  var _cache    = {};
  var _loading  = {};   // keys currently being fetched
  var _cacheN   = 0;    // current cache size
  var _frame    = 0;    // monotonic frame counter for LRU

  function _evict() {
    if (_cacheN < MAX_CACHE) return;
    var oldestKey = null, oldestTime = Infinity;
    var keys = Object.keys(_cache);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (_cache[k].lastUsed < oldestTime) {
        oldestTime = _cache[k].lastUsed;
        oldestKey  = k;
      }
    }
    if (oldestKey) { delete _cache[oldestKey]; _cacheN--; }
  }

  function _getTile(Z, tx, ty, onLoad) {
    var key = Z + "/" + tx + "/" + ty;

    // Already cached
    if (_cache[key]) {
      _cache[key].lastUsed = _frame;
      return _cache[key];
    }

    // Already being fetched
    if (_loading[key]) return null;

    // Don't retry known failures for 60s
    if (_loading[key + "_fail"]) return null;

    _loading[key] = true;

    var url = TILE_URL.replace("{z}", Z).replace("{x}", tx).replace("{y}", ty);
    var img = new global.Image();
    img.crossOrigin = "anonymous";

    img.onload = function () {
      delete _loading[key];
      _evict();
      _cache[key] = { img: img, loaded: true, failed: false, lastUsed: _frame };
      _cacheN++;
      if (onLoad) onLoad();
    };

    img.onerror = function () {
      delete _loading[key];
      _loading[key + "_fail"] = true;
      global.setTimeout(function () { delete _loading[key + "_fail"]; }, 60000);
    };

    img.src = url;
    return null;
  }

  // ── Web Mercator helpers ───────────────────────────────────────────────────

  function _lngToTileX(lng, Z) {
    return (lng + 180) / 360 * Math.pow(2, Z);
  }

  function _latToTileY(lat, Z) {
    var r = lat * Math.PI / 180;
    return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Math.pow(2, Z);
  }

  function _tileToLng(tx, Z) {
    return tx / Math.pow(2, Z) * 360 - 180;
  }

  function _tileToLat(ty, Z) {
    var n = Math.PI - 2 * Math.PI * ty / Math.pow(2, Z);
    return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  }

  // ── Corridor projection helpers ────────────────────────────────────────────
  // Convert lat/lng to corridor canvas coordinates using stored projection params.

  function _lngToCanvas(lng, proj) {
    return proj.canvasMinX + (lng - proj.minLng) * proj.scaleX;
  }

  function _latToCanvas(lat, proj) {
    return proj.canvasMinY + (proj.maxLat - lat) * proj.scaleY;
  }

  // Inverse: canvas coords → lat/lng
  function _canvasToLat(cy, proj) {
    return proj.maxLat - (cy - proj.canvasMinY) / proj.scaleY;
  }

  function _canvasToLng(cx, proj) {
    return proj.minLng + (cx - proj.canvasMinX) / proj.scaleX;
  }

  // ── Zoom level auto-selection ──────────────────────────────────────────────
  // At camera scale 1 (full corridor visible), Z=11 is correct.
  // Each doubling of scale increases zoom by 1.

  function _autoZoom(cameraScale, defaultZ) {
    var base = (defaultZ != null) ? defaultZ : DEFAULT_ZOOM;
    var z = Math.round(Math.log2(Math.max(0.01, cameraScale)) + base);
    return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
  }

  // ── Style filters ──────────────────────────────────────────────────────────
  // Applied via ctx.filter before drawing all tiles.

  var _FILTERS = {
    dark:      "grayscale(1) brightness(0.30) contrast(1.1)",
    muted:     "grayscale(0.85) brightness(0.45) saturate(0.2) contrast(1.0)",
    blueprint: "grayscale(1) brightness(0.30) sepia(1) hue-rotate(195deg) saturate(5) contrast(1.2)",
    wireframe: "grayscale(1) contrast(4) brightness(0.12) invert(0)",
  };

  // ── Main render function ───────────────────────────────────────────────────
  //
  // ctx        — 2D canvas context, already in camera-transformed space
  //              (after ctx.translate + ctx.scale — same space as CorridorRenderer)
  // routeWorld — current rw state (needs rw.basemap + rw.spatial.projection)
  // opts       — { transform: {tx,ty,scale}, canvasWidth, canvasHeight, debug }
  //
  function render(ctx, routeWorld, opts) {
    var bm = routeWorld && routeWorld.basemap;
    if (!bm || !bm.enabled) return;

    var spatial = routeWorld && routeWorld.spatial;
    var proj    = spatial && spatial.projection;
    if (!proj) return;

    _frame++;

    var xf = (opts && opts.transform) || { tx: 0, ty: 0, scale: 1 };
    var cw = (opts && opts.canvasWidth)  || 1080;
    var ch = (opts && opts.canvasHeight) || 1920;
    var debugMode = !!(opts && opts.debug);

    // ── Determine visible canvas-space bounds ─────────────────────────────
    // ctx is already scaled by xf.scale; positions are in canvas coordinates.
    // Invert the camera transform to find visible corridor-canvas rect.
    var visL = -xf.tx / xf.scale;
    var visT = -xf.ty / xf.scale;
    var visR = (cw  - xf.tx) / xf.scale;
    var visB = (ch  - xf.ty) / xf.scale;

    // ── Inverse-project canvas corners to lat/lng ─────────────────────────
    var pad = 0.08;  // degrees of geographic margin
    var latN = Math.min( 85.05, _canvasToLat(visT, proj) + pad);
    var latS = Math.max(-85.05, _canvasToLat(visB, proj) - pad);
    var lngW = _canvasToLng(visL, proj) - pad;
    var lngE = _canvasToLng(visR, proj) + pad;

    if (latN <= latS || lngW >= lngE) return;

    // ── Choose tile zoom ──────────────────────────────────────────────────
    var lockZoom = bm.zoomLocked;
    var Z = lockZoom ? Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, bm.zoom || DEFAULT_ZOOM))
                     : _autoZoom(xf.scale, bm.zoom || DEFAULT_ZOOM);

    var n = Math.pow(2, Z);

    // ── Compute tile index range ──────────────────────────────────────────
    var tMinX = Math.max(0,     Math.floor(_lngToTileX(lngW, Z)) - TILE_MARGIN);
    var tMaxX = Math.min(n - 1, Math.floor(_lngToTileX(lngE, Z)) + TILE_MARGIN);
    var tMinY = Math.max(0,     Math.floor(_latToTileY(latN, Z)) - TILE_MARGIN);
    var tMaxY = Math.min(n - 1, Math.floor(_latToTileY(latS, Z)) + TILE_MARGIN);

    var tileCountX = tMaxX - tMinX + 1;
    var tileCountY = tMaxY - tMinY + 1;
    var tileTotal  = tileCountX * tileCountY;

    // Safety: too many tiles → step back one zoom level
    if (tileTotal > MAX_TILES_PER_FRAME) {
      if (Z > MIN_ZOOM) {
        Z = Z - 1;
        n = Math.pow(2, Z);
        tMinX = Math.max(0,     Math.floor(_lngToTileX(lngW, Z)) - TILE_MARGIN);
        tMaxX = Math.min(n - 1, Math.floor(_lngToTileX(lngE, Z)) + TILE_MARGIN);
        tMinY = Math.max(0,     Math.floor(_latToTileY(latN, Z)) - TILE_MARGIN);
        tMaxY = Math.min(n - 1, Math.floor(_latToTileY(latS, Z)) + TILE_MARGIN);
        tileTotal = (tMaxX - tMinX + 1) * (tMaxY - tMinY + 1);
      }
      if (tileTotal > MAX_TILES_PER_FRAME) return;  // give up gracefully
    }

    // ── Store visible tile list for debug API ────────────────────────────
    if (bm.visibleTiles) {
      bm.visibleTiles.length = 0;
    } else {
      bm.visibleTiles = [];
    }

    // ── Re-render callback (triggers renderFrame when a tile loads) ───────
    var onTileLoad = bm._reRender || (global._wos && global._wos.renderFrame) || null;

    // ── Apply style + opacity ─────────────────────────────────────────────
    ctx.save();
    var style  = bm.style || "dark";
    var filter = _FILTERS[style] || _FILTERS.dark;
    ctx.filter = filter;
    var masterOpacity = (bm.opacity != null) ? Math.max(0, Math.min(1, bm.opacity)) : 0.35;
    ctx.globalAlpha   = (ctx.globalAlpha || 1) * masterOpacity;

    var drawnCount = 0;
    var pendingCount = 0;

    // ── Draw tiles ────────────────────────────────────────────────────────
    for (var ty = tMinY; ty <= tMaxY; ty++) {
      for (var tx = tMinX; tx <= tMaxX; tx++) {
        var key = Z + "/" + tx + "/" + ty;

        var entry = _getTile(Z, tx, ty, onTileLoad);

        if (!entry || !entry.loaded) {
          pendingCount++;
          continue;
        }

        // Tile lat/lng bounds (Web Mercator)
        var lngTW = _tileToLng(tx,     Z);
        var lngTE = _tileToLng(tx + 1, Z);
        var latTN = _tileToLat(ty,     Z);
        var latTS = _tileToLat(ty + 1, Z);

        // Project to corridor canvas coordinates
        // Note: slight distortion at edges due to Mercator vs linear projection
        var cx0 = _lngToCanvas(lngTW, proj);
        var cy0 = _latToCanvas(latTN, proj);
        var cx1 = _lngToCanvas(lngTE, proj);
        var cy1 = _latToCanvas(latTS, proj);

        var drawW = cx1 - cx0;
        var drawH = cy1 - cy0;

        // Skip degenerate or invisible tiles
        if (drawW <= 0 || drawH <= 0) continue;

        try {
          ctx.drawImage(entry.img, cx0, cy0, drawW, drawH);
        } catch (e) {
          // Image might not be usable; skip silently
        }

        bm.visibleTiles.push(key);
        drawnCount++;
      }
    }

    // ── Debug overlay ─────────────────────────────────────────────────────
    if (debugMode) {
      ctx.filter = "none";
      ctx.globalAlpha = 0.8;

      for (var ty2 = tMinY; ty2 <= tMaxY; ty2++) {
        for (var tx2 = tMinX; tx2 <= tMaxX; tx2++) {
          var lngW2 = _tileToLng(tx2, Z);
          var lngE2 = _tileToLng(tx2 + 1, Z);
          var latN2 = _tileToLat(ty2, Z);
          var latS2 = _tileToLat(ty2 + 1, Z);
          var x0 = _lngToCanvas(lngW2, proj);
          var y0 = _latToCanvas(latN2, proj);
          var x1 = _lngToCanvas(lngE2, proj);
          var y1 = _latToCanvas(latS2, proj);

          ctx.strokeStyle = "rgba(100,200,255,0.4)";
          ctx.lineWidth   = 0.5;
          ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);

          var key2 = Z + "/" + tx2 + "/" + ty2;
          ctx.font      = "8px monospace";
          ctx.fillStyle = "rgba(100,200,255,0.6)";
          ctx.textAlign = "center";
          ctx.fillText(key2, (x0 + x1) / 2, (y0 + y1) / 2);
        }
      }
    }

    ctx.filter = "none";
    ctx.restore();

    // Store debug stats on bm for the console API
    bm._lastZ       = Z;
    bm._lastDrawn   = drawnCount;
    bm._lastPending = pendingCount;
  }

  // ── State factory ──────────────────────────────────────────────────────────
  function makeDefaultState() {
    return {
      enabled:      true,
      opacity:      0.35,
      zoom:         DEFAULT_ZOOM,
      zoomLocked:   false,
      style:        "dark",     // "dark" | "muted" | "blueprint" | "wireframe"
      tileSize:     TILE_SIZE,
      visibleTiles: [],
      // Runtime stats (not persisted)
      _lastZ:       null,
      _lastDrawn:   0,
      _lastPending: 0,
      _reRender:    null,       // set by main.js to renderFrame
    };
  }

  // ── Cache inspector ────────────────────────────────────────────────────────
  function cacheStats() {
    var loaded  = 0, pending = 0;
    Object.keys(_cache).forEach(function (k) {
      if (_cache[k].loaded) loaded++;
    });
    Object.keys(_loading).forEach(function (k) {
      if (k.slice(-5) !== "_fail") pending++;
    });
    return { cacheSize: _cacheN, loaded: loaded, pending: pending, maxCache: MAX_CACHE };
  }

  function clearCache() {
    _cache   = {};
    _loading = {};
    _cacheN  = 0;
    console.log("[BasemapRenderer] Cache cleared");
  }

  // ── Persistence helpers (persist only non-runtime fields) ─────────────────
  function serializeBasemap(bm) {
    if (!bm) return null;
    return {
      enabled:    bm.enabled,
      opacity:    bm.opacity,
      zoom:       bm.zoom,
      zoomLocked: bm.zoomLocked,
      style:      bm.style,
    };
  }

  function rehydrateBasemap(saved) {
    var state = makeDefaultState();
    if (!saved) return state;
    if (saved.enabled    != null) state.enabled    = saved.enabled;
    if (saved.opacity    != null) state.opacity     = saved.opacity;
    if (saved.zoom       != null) state.zoom        = saved.zoom;
    if (saved.zoomLocked != null) state.zoomLocked  = saved.zoomLocked;
    if (saved.style      != null) state.style       = saved.style;
    return state;
  }

  // ── Projection utilities (geographic / canonical) ─────────────────────────
  // These are exposed as the canonical geographic projection utilities.
  // Other systems should use SI.projectGeo() for corridor-aligned projection.

  function latLngToTileXY(lat, lng, Z) {
    return {
      x: _lngToTileX(lng, Z),
      y: _latToTileY(lat, Z),
    };
  }

  function tileXYToLatLng(tx, ty, Z) {
    return {
      lat: _tileToLat(ty, Z),
      lng: _tileToLng(tx, Z),
    };
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  SBE.BasemapRenderer = {
    render:              render,
    makeDefaultState:    makeDefaultState,
    serializeBasemap:    serializeBasemap,
    rehydrateBasemap:    rehydrateBasemap,
    // Cache management
    cacheStats:          cacheStats,
    clearCache:          clearCache,
    // Projection utilities
    latLngToTileXY:      latLngToTileXY,
    tileXYToLatLng:      tileXYToLatLng,
    // Constants
    MIN_ZOOM:    MIN_ZOOM,
    MAX_ZOOM:    MAX_ZOOM,
    DEFAULT_ZOOM: DEFAULT_ZOOM,
    TILE_URL:    TILE_URL,
    STYLES:      Object.keys(_FILTERS),
  };

  console.log("[WOS BasemapRenderer] Loaded — OSM raster tiles · 0516 v1.0.0");
})(window);
