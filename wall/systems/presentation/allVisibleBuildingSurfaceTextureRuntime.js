// allVisibleBuildingSurfaceTextureRuntime.js
// 0612U_WOS_AllVisibleBuildingSurfaceTextureRuntime_v1.0.0
//
// Applies organic surface texture to ALL visible buildings (host + WOS replacement)
// via fill-extrusion-pattern overlay layers. Auto-enables on map ready.
// Strategy: Path A — Mapbox fill-extrusion-pattern on composite/building source.

(function () {
  'use strict';

  var VERSION         = '1.0.0';
  var LAYER_HOST      = 'wos-surface-texture-host';
  var LAYER_WOS       = 'wos-surface-texture-wos';
  var IMAGE_ID        = 'wos-surface-texture-img';
  var SOURCE_WOS      = 'wos-replacement-markers';

  var _enabled        = false;
  var _autoEnabled    = false;
  var _intensity      = 1;
  var _profileId      = 'warmConcrete';
  var _report         = null;
  var _lastError      = null;
  var _styleListener  = null;
  var _originalPaint  = {}; // { layerId: { color, opacity } } — for disable() restore

  // ── Material profiles ────────────────────────────────────────────────────────
  // 6 families — each must read as distinct on wall and roof faces.
  // Patch contrast target: ≥60 RGB units vs base. Line is dark ink.

  var Profiles = Object.freeze({
    warmConcrete:    { base:[218,200,170,255], patch:[138,102, 54,255], line:[ 58, 38, 12,230], grain:[192,155,108,255] },
    paintedConcrete: { base:[132,168,202,255], patch:[ 60, 96,148,255], line:[ 15, 42, 84,230], grain:[102,138,172,255] },
    industrialGreen: { base:[108,150,108,255], patch:[ 42, 82, 44,255], line:[ 12, 40, 14,230], grain:[ 76,114, 78,255] },
    signalOrange:    { base:[228,148, 58,255], patch:[148, 60,  6,255], line:[ 74, 22,  2,230], grain:[202,108, 30,255] },
    glassBlue:       { base:[ 78,138,202,255], patch:[ 22, 74,148,255], line:[  8, 36, 86,230], grain:[ 55,108,172,255] },
    civicStone:      { base:[188,180,162,255], patch:[125,115, 92,255], line:[ 52, 46, 28,230], grain:[158,148,125,255] },
  });

  // ── Deterministic PRNG ───────────────────────────────────────────────────────

  function _fnv1a(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h * 0x01000193) >>> 0;
    }
    return h;
  }

  function _lcg(seed) {
    var s = seed >>> 0;
    return function () {
      s = ((s * 1664525 + 1013904223) >>> 0);
      return s / 4294967296;
    };
  }

  // ── Pattern generation ───────────────────────────────────────────────────────
  // Generates a tileable Voronoi patch texture as ImageData.
  // Toroidal distance ensures seamless tiling at all four edges.

  function _generatePattern(profileId, intensity) {
    var profile  = Profiles[profileId] || Profiles.warmConcrete;
    var size     = intensity === 2 ? 512 : 256;
    var nCells   = intensity === 2 ? 6   : 8;
    var borderT  = intensity === 2 ? 16  : 7;
    var nGrain   = intensity === 2 ? 420 : 150;
    var grScale  = intensity === 2 ? 2.2 : 1.3;

    var canvas   = document.createElement('canvas');
    canvas.width = canvas.height = size;
    var ctx      = canvas.getContext('2d');
    var rng      = _lcg(_fnv1a(profileId + ':' + intensity));

    // Cell centers
    var cells = [];
    for (var i = 0; i < nCells; i++) {
      cells.push({ x: rng() * size, y: rng() * size });
    }

    var imageData = ctx.createImageData(size, size);
    var d         = imageData.data;

    // Toroidal (wrap-around) distance for seamless tiling
    function tdist(ax, ay, bx, by) {
      var dx = Math.abs(ax - bx);
      var dy = Math.abs(ay - by);
      if (dx > size / 2) dx = size - dx;
      if (dy > size / 2) dy = size - dy;
      return Math.sqrt(dx * dx + dy * dy);
    }

    for (var py = 0; py < size; py++) {
      for (var px = 0; px < size; px++) {
        var d1 = Infinity, d2 = Infinity, c1 = 0;
        for (var c = 0; c < nCells; c++) {
          var dist = tdist(px, py, cells[c].x, cells[c].y);
          if (dist < d1) { d2 = d1; d1 = dist; c1 = c; }
          else if (dist < d2) { d2 = dist; }
        }

        // Alternate cells between base and patch color
        var cell = (c1 % 2 === 0) ? profile.base : profile.patch;
        var diff = d2 - d1;

        var col;
        if (diff < borderT) {
          // Soft ink-line border: smoothstep from line color to cell color
          var t  = diff / borderT;
          var ts = t * t * (3 - 2 * t);
          col = [
            (profile.line[0] + (cell[0] - profile.line[0]) * ts) | 0,
            (profile.line[1] + (cell[1] - profile.line[1]) * ts) | 0,
            (profile.line[2] + (cell[2] - profile.line[2]) * ts) | 0,
            255
          ];
        } else {
          col = cell;
        }

        var off      = (py * size + px) * 4;
        d[off]       = col[0];
        d[off + 1]   = col[1];
        d[off + 2]   = col[2];
        d[off + 3]   = 255;
      }
    }

    // Grain pass — small speckle dots for material texture
    for (var g = 0; g < nGrain; g++) {
      var gx  = (rng() * size) | 0;
      var gy  = (rng() * size) | 0;
      var r   = 0.8 + rng() * grScale;
      var ri  = Math.ceil(r);
      for (var dy2 = -ri; dy2 <= ri; dy2++) {
        for (var dx2 = -ri; dx2 <= ri; dx2++) {
          if (dx2 * dx2 + dy2 * dy2 > r * r) continue;
          var nx  = ((gx + dx2 + size) % size);
          var ny  = ((gy + dy2 + size) % size);
          var go  = (ny * size + nx) * 4;
          d[go]     = (d[go]     * 0.35 + profile.grain[0] * 0.65) | 0;
          d[go + 1] = (d[go + 1] * 0.35 + profile.grain[1] * 0.65) | 0;
          d[go + 2] = (d[go + 2] * 0.35 + profile.grain[2] * 0.65) | 0;
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return { imageData: d, width: size, height: size, data: d };
  }

  // ── Map access ───────────────────────────────────────────────────────────────

  function _getMap() {
    // Wall: MapboxViewportRuntime.getMap() is the authoritative Mapbox map accessor
    if (window.SBE && window.SBE.MapboxViewportRuntime &&
        typeof window.SBE.MapboxViewportRuntime.getMap === 'function') {
      var m = window.SBE.MapboxViewportRuntime.getMap();
      if (m && typeof m.getStyle === 'function') return m;
    }
    // Studio Map Lab
    if (window.WOSMapLab && typeof window.WOSMapLab.getMap === 'function') {
      var ml = window.WOSMapLab.getMap();
      if (ml && typeof ml.getStyle === 'function') return ml;
    }
    // Bare window.map fallback
    if (window.map && typeof window.map.getStyle === 'function') return window.map;
    return null;
  }

  // ── Discovery ────────────────────────────────────────────────────────────────

  function _hasWOSSource(map) {
    try {
      var s = map.getStyle();
      return !!(s && s.sources && s.sources[SOURCE_WOS]);
    } catch (e) { return false; }
  }

  function _discoverHostLayers(map) {
    var found = [];
    try {
      var layers = (map.getStyle() || {}).layers || [];
      layers.forEach(function (l) {
        if (l.type !== 'fill-extrusion') return;
        var sl = l['source-layer'] || '';
        // WOS-owned host building layers
        if (l.id === 'wos-host-buildings-3d' || l.id === 'wos-host-building-layer') {
          found.push(l.id);
          return;
        }
        // Studio Map Lab layer
        if (l.id === 'map-lab-buildings-3d') {
          found.push(l.id);
          return;
        }
        // Any fill-extrusion from composite/building that isn't WOS-owned
        if ((l.source === 'composite' || l.source === 'mapbox') &&
            sl === 'building' &&
            l.id.indexOf('wos-') !== 0) {
          found.push(l.id);
        }
      });
    } catch (e) {}
    return found;
  }

  // ── Layer management ─────────────────────────────────────────────────────────

  function _removeLayers(map) {
    // Restore original paint on host layers that we modified directly
    Object.keys(_originalPaint).forEach(function (id) {
      try {
        var orig = _originalPaint[id];
        // Removing pattern restores color-based rendering
        map.setPaintProperty(id, 'fill-extrusion-color', orig.color);
        map.setPaintProperty(id, 'fill-extrusion-opacity', orig.opacity);
        // Mapbox: setting pattern to null/undefined clears it
        try { map.setPaintProperty(id, 'fill-extrusion-pattern', null); } catch (e) {}
      } catch (e) {}
    });
    _originalPaint = {};
    // Remove WOS overlay layer
    try { if (map.getLayer(LAYER_WOS)) map.removeLayer(LAYER_WOS); } catch (e) {}
    // Remove fallback host overlay if present
    try { if (map.getLayer(LAYER_HOST)) map.removeLayer(LAYER_HOST); } catch (e) {}
    try { if (map.hasImage(IMAGE_ID)) map.removeImage(IMAGE_ID); } catch (e) {}
  }

  function _addLayers(map) {
    // Generate and register sprite image
    var pat    = _generatePattern(_profileId, _intensity);
    var imgObj = { width: pat.width, height: pat.height, data: pat.data };
    try { if (map.hasImage(IMAGE_ID)) map.removeImage(IMAGE_ID); } catch (e) {}
    map.addImage(IMAGE_ID, imgObj, { pixelRatio: 1, sdf: false });

    // ── Apply pattern directly to discovered host building layers ─────────────
    // Direct setPaintProperty avoids z-fighting between overlapping fill-extrusions.
    var hostLayers = _discoverHostLayers(map);
    hostLayers.forEach(function (layerId) {
      try {
        var origColor   = map.getPaintProperty(layerId, 'fill-extrusion-color');
        var origOpacity = map.getPaintProperty(layerId, 'fill-extrusion-opacity');
        _originalPaint[layerId] = { color: origColor, opacity: origOpacity };
        map.setPaintProperty(layerId, 'fill-extrusion-pattern', IMAGE_ID);
        console.log('[AllVisibleBuildingSurfaceTextureRuntime] pattern → ' + layerId);
      } catch (e) {
        console.warn('[AllVisibleBuildingSurfaceTextureRuntime] setPaintProperty(' + layerId + ') failed:', e.message || e);
      }
    });

    // ── Fallback overlay: buildings not covered by any discovered host layer ──
    // Only added if no host layer covers composite/building source.
    var compositeHostFound = hostLayers.length > 0;
    if (!compositeHostFound && !map.getLayer(LAYER_HOST)) {
      try {
        map.addLayer({
          id:             LAYER_HOST,
          type:           'fill-extrusion',
          source:         'composite',
          'source-layer': 'building',
          filter:         ['>', ['coalesce', ['get', 'height'], 0], 0],
          paint: {
            'fill-extrusion-pattern': IMAGE_ID,
            'fill-extrusion-opacity': _intensity === 2 ? 0.84 : 0.76,
            'fill-extrusion-height':  ['coalesce', ['get', 'height'], ['get', 'render_height'], 10],
            'fill-extrusion-base':    ['coalesce', ['get', 'min_height'], ['get', 'render_min_height'], 0],
          }
        });
      } catch (e) {
        _lastError = 'fallback addLayer: ' + (e.message || String(e));
        console.error('[AllVisibleBuildingSurfaceTextureRuntime] fallback layer error:', e);
      }
    }

    // ── WOS replacement overlay ───────────────────────────────────────────────
    if (_hasWOSSource(map) && !map.getLayer(LAYER_WOS)) {
      try {
        map.addLayer({
          id:     LAYER_WOS,
          type:   'fill-extrusion',
          source: SOURCE_WOS,
          paint: {
            'fill-extrusion-pattern': IMAGE_ID,
            'fill-extrusion-opacity': _intensity === 2 ? 0.84 : 0.76,
            'fill-extrusion-height':  ['get', 'height'],
            'fill-extrusion-base':    ['coalesce', ['get', 'base'], 0],
          }
        });
      } catch (e) {
        console.warn('[AllVisibleBuildingSurfaceTextureRuntime] WOS overlay error:', e);
      }
    }

    _enabled = true;
    if (map.triggerRepaint) map.triggerRepaint();
    _updateReport(map);
  }

  // ── Report ───────────────────────────────────────────────────────────────────

  function _updateReport(map) {
    var hostLayers  = _discoverHostLayers(map);
    var hasWOSSrc   = _hasWOSSource(map);
    var hostAdded   = false;
    var wosAdded    = false;
    try { hostAdded = !!map.getLayer(LAYER_HOST); } catch (e) {}
    try { wosAdded  = !!map.getLayer(LAYER_WOS);  } catch (e) {}

    var directPaintApplied = Object.keys(_originalPaint).length > 0;

    _report = {
      ok:                            _enabled && (directPaintApplied || hostAdded),
      version:                       VERSION,
      enabled:                       _enabled,
      autoEnabled:                   _autoEnabled,
      hostBuildingTextureSupported:  true,
      hostBuildingTextureStrategy:   'mapbox-layer',
      visibleHostBuildingLayers:     hostLayers,
      directPaintLayers:             Object.keys(_originalPaint),
      texturedHostBuildingCount:     (directPaintApplied || hostAdded) ? 'all-composite-buildings' : 0,
      replacementBuildingCount:      hasWOSSrc ? 'source-present' : 0,
      texturedReplacementBuildingCount: wosAdded ? 'all-wos-buildings' : 0,
      wallSupported:                 true,
      studioSupported:               true,
      largeHostBuildingsChanged:     directPaintApplied || hostAdded,
      consoleCommandRequired:        false,
      profileId:                     _profileId,
      intensity:                     _intensity,
      lastError:                     _lastError,
    };
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  function enable() {
    var map = _getMap();
    if (!map) { console.warn('[AllVisibleBuildingSurfaceTextureRuntime] map not available'); return; }
    if (!map.isStyleLoaded()) { map.once('style.load', function () { _addLayers(map); }); return; }
    _removeLayers(map);
    _addLayers(map);
  }

  function disable() {
    _enabled = false;
    var map = _getMap();
    if (!map) return;
    _removeLayers(map);
    _updateReport(map);
    if (map.triggerRepaint) map.triggerRepaint();
  }

  function refresh() {
    var map = _getMap();
    if (!map || !map.isStyleLoaded()) return;
    _removeLayers(map);
    _addLayers(map);
  }

  function setIntensity(val) {
    _intensity = (val === 2) ? 2 : 1;
    if (_enabled) refresh();
  }

  function setProfile(id) {
    if (!Profiles[id]) {
      console.warn('[AllVisibleBuildingSurfaceTextureRuntime] unknown profile:', id,
        '— valid:', Object.keys(Profiles).join(', '));
      return;
    }
    _profileId = id;
    if (_enabled) refresh();
  }

  function report() {
    var map = _getMap();
    if (map && _report === null) {
      try { _updateReport(map); } catch (e) {}
    }
    return _report || {
      ok:     false,
      reason: 'FAIL_HOST_BUILDING_TEXTURE_NOT_SUPPORTED',
      enabled: false,
      lastError: _lastError,
    };
  }

  // ── Auto-enable ──────────────────────────────────────────────────────────────

  function _doAutoEnable(map) {
    try {
      _addLayers(map);
      _autoEnabled = true;
      _updateReport(map); // refresh after setting _autoEnabled
      // Re-apply after style switch
      _styleListener = function () {
        setTimeout(function () {
          if (_enabled) _addLayers(map);
        }, 300);
      };
      map.on('style.load', _styleListener);
    } catch (err) {
      _lastError = err.message || String(err);
      _report = {
        ok:        false,
        reason:    'FAIL_HOST_BUILDING_TEXTURE_NOT_SUPPORTED',
        lastError: _lastError,
      };
      console.error('[AllVisibleBuildingSurfaceTextureRuntime] auto-enable failed:', err);
    }
  }

  function _autoEnable() {
    var mvr = window.SBE && window.SBE.MapboxViewportRuntime;
    if (mvr && typeof mvr.onReady === 'function') {
      // onReady fires after style + tiles are loaded — safe to add layers immediately.
      // If already ready, onReady calls fn() synchronously.
      mvr.onReady(function () {
        var map = _getMap();
        if (map) {
          _doAutoEnable(map);
        } else {
          // Shouldn't happen, but fall back to poll
          setTimeout(function () {
            var m = _getMap();
            if (m) _doAutoEnable(m);
          }, 200);
        }
      });
      return;
    }
    // Studio / no-MVR fallback: poll until map is available and style is loaded
    var map = _getMap();
    if (!map) { setTimeout(_autoEnable, 400); return; }
    if (map.isStyleLoaded()) {
      _doAutoEnable(map);
    } else {
      map.once('style.load', function () { _doAutoEnable(map); });
    }
  }

  // ── Namespace ────────────────────────────────────────────────────────────────

  window.SBE = window.SBE || {};

  var pub = {
    enable:       enable,
    disable:      disable,
    refresh:      refresh,
    setIntensity: setIntensity,
    setProfile:   setProfile,
    report:       report,
    profiles:     Object.keys(Profiles),
    version:      VERSION,
  };

  window.SBE.AllVisibleBuildingSurfaceTextureRuntime = pub;

  // _wos.debug is replaced by main.js after map-ready — must wire via onReady
  // so the entry survives the rewire (same pattern as OrganicBuildingSurfacePatternRuntime).
  function _wireDebug() {
    window._wos = window._wos || {};
    window._wos.debug = window._wos.debug || {};
    window._wos.debug.allVisibleBuildingTexture = pub;
  }
  var _mvrForDebug = window.SBE && window.SBE.MapboxViewportRuntime;
  if (_mvrForDebug && typeof _mvrForDebug.onReady === 'function') {
    _mvrForDebug.onReady(_wireDebug);
  } else {
    _wireDebug(); // Studio / no-MVR fallback
  }

  // Kick off
  _autoEnable();

})();
