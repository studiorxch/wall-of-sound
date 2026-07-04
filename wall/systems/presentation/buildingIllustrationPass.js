// ── BuildingIllustrationPass v1.0.0 ──────────────────────────────────────────
// 0612R_WOS_BuildingIllustrationPass_v1.0.0_BUILD
// Status: active | Classification: presentation-pass / visual-illustration
//
// Purpose:
//   First WOS building illustration pass.
//   Moves building rendering toward a Moebius-inspired, technical-comic aesthetic:
//     T1 — thin building footprint outlines (always-visible, distance-aware)
//     T2 — surface speckle pattern (world-anchored dots on building footprints)
//     T3 — geographic patch variation (subtle tonal shift per-building, ~territory feel)
//     T4 — weathered color tone (fill-extrusion paint expression, 4-cycle tones)
//
// Layers added:
//   wos-illustration-outline  — line on composite/building (building footprint edges)
//   wos-illustration-speckle  — fill + fill-pattern on composite/building (ground grain)
//
// Paint modified (reversible):
//   Existing non-WOS fill-extrusion building layers: fill-extrusion-color
//   Original paint snapshots saved; restored on disable().
//
// Authority:
//   READS:   map.getStyle().layers, WOSMapStyleAuthority (advisory only)
//   WRITES:  wos-illustration-* layers, fill-extrusion-color on non-WOS building layers
//   MUST NOT: touch map style selection, replacement manifest, suppression logic,
//             city density rules, camera, audio, Canvas, Studio UI, actor systems
//
// Placement: wall/systems/presentation/buildingIllustrationPass.js
// Load: AFTER wosMapStyleAuthority.js, threeViewStyleParityLock.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  // ── Layer IDs ─────────────────────────────────────────────────────────────────

  var OUTLINE_LAYER_ID = 'wos-illustration-outline';
  var SPECKLE_LAYER_ID = 'wos-illustration-speckle';
  var SPECKLE_IMAGE_ID = 'wos-illustration-speckle-img';

  var BUILDING_SOURCE       = 'composite';
  var BUILDING_SOURCE_LAYER = 'building';
  var BUILDING_FILTER       = ['==', ['get', 'extrude'], 'true'];

  // WOS-owned layer IDs — must not be treated as candidate building layers
  var WOS_LAYER_PREFIXES = ['wos-', 'maplab-'];

  // ── Intensity parameter tables ────────────────────────────────────────────────
  //
  // Intensity 1 = subtle (default)  — non-dominant, cinematic readable
  // Intensity 2 = strong (debug)    — clearly visible verification mode

  var PARAMS = {
    1: {
      outlineColor:          'rgba(160, 210, 255, 0.20)',
      outlineBlur:            0.6,
      outlineWidthStops:     [12, 0.5,  14, 0.75, 16, 1.0, 18, 1.3],
      outlineOpacityStops:   [12, 0.12, 14, 0.18, 16, 0.25, 18, 0.32],
      speckleOpacity:         0.10,
      speckleDotCount:        15,   // dots per 64×64 tile
      // Weathered tones — 4-cycle based on feature ID modulo 4
      tones: [
        'rgba(15, 26, 42, 0.88)',   // 0: base (dark navy)
        'rgba(20, 32, 50, 0.88)',   // 1: patch (navy-teal)
        'rgba(24, 38, 56, 0.88)',   // 2: weather (lighter)
        'rgba(11, 20, 34, 0.88)',   // 3: shadow (deeper)
      ],
    },
    2: {
      outlineColor:          'rgba(160, 220, 255, 0.55)',
      outlineBlur:            0.3,
      outlineWidthStops:     [12, 0.8,  14, 1.2,  16, 1.7,  18, 2.2],
      outlineOpacityStops:   [12, 0.35, 14, 0.50, 16, 0.62, 18, 0.75],
      speckleOpacity:         0.38,
      speckleDotCount:        32,
      tones: [
        'rgba(18, 34, 58, 0.92)',
        'rgba(28, 50, 80, 0.92)',
        'rgba(38, 62, 90, 0.92)',
        'rgba(10, 20, 40, 0.92)',
      ],
    },
  };

  // ── State ─────────────────────────────────────────────────────────────────────

  var _enabled         = false;
  var _intensity       = 1;
  var _styleHooked     = false;
  var _originalPaint   = {};   // layerId → original fill-extrusion-color value
  var _outlineAdded    = false;
  var _speckleAdded    = false;
  var _imageAdded      = false;
  var _targetLayers    = [];   // ids of discovered non-WOS fill-extrusion layers
  var _skippedLayers   = [];   // ids skipped (WOS-owned, wrong type, etc.)
  var _lastError       = null;

  // ── Map access ────────────────────────────────────────────────────────────────

  function _getMap() {
    var mvr = SBE.MapboxViewportRuntime;
    if (mvr && typeof mvr.getMap === 'function') return mvr.getMap();
    var adp = global.WOSMapLab && global.WOSMapLab.MapboxAdapter;
    if (adp && typeof adp.getMap === 'function') return adp.getMap();
    return null;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  function _isWosOwned(layerId) {
    for (var i = 0; i < WOS_LAYER_PREFIXES.length; i++) {
      if (layerId.indexOf(WOS_LAYER_PREFIXES[i]) === 0) return true;
    }
    return false;
  }

  // Find the first symbol layer id so we can insert illustration layers before it
  // (keeps road labels and symbol layers rendering on top).
  function _findFirstSymbolLayer(map) {
    try {
      var layers = (map.getStyle().layers) || [];
      for (var i = 0; i < layers.length; i++) {
        if (layers[i].type === 'symbol') return layers[i].id;
      }
    } catch (e) {}
    return undefined;
  }

  // Discover non-WOS fill-extrusion building layers for paint modification (T4).
  function _discoverBuildingLayers(map) {
    _targetLayers = [];
    _skippedLayers = [];
    try {
      var layers = (map.getStyle().layers) || [];
      layers.forEach(function (l) {
        if (l.type !== 'fill-extrusion') return;
        if (_isWosOwned(l.id)) { _skippedLayers.push(l.id); return; }
        _targetLayers.push(l.id);
      });
    } catch (e) { _lastError = String(e && e.message || e); }
  }

  // ── T2: Speckle pattern image ─────────────────────────────────────────────────
  //
  // Generates a deterministic 64×64 canvas tile with scattered dots.
  // Uses a LCG so the pattern is stable across page loads.

  function _generateSpecklePattern(dotCount, opacity) {
    var size = 64;
    var el   = null;
    try { el = global.document.createElement('canvas'); } catch (e) { return null; }
    el.width  = size;
    el.height = size;
    var ctx = el.getContext('2d');
    if (!ctx) return null;

    // LCG seeded at 0xBEEF for determinism
    var seed = 0xBEEF;
    function rand() {
      seed = (seed * 1664525 + 1013904223) & 0xFFFFFFFF;
      return ((seed >>> 0) / 4294967296);
    }

    for (var i = 0; i < dotCount; i++) {
      var x = rand() * size;
      var y = rand() * size;
      var r = rand() * 1.4 + 0.3;
      ctx.globalAlpha = opacity * (0.5 + rand() * 0.5);
      ctx.fillStyle   = 'rgb(200, 230, 255)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    return el;
  }

  function _loadSpeckleImage(map, params) {
    if (_imageAdded) {
      // Remove old image so we can reload with new params
      try { map.removeImage(SPECKLE_IMAGE_ID); } catch (e) {}
      _imageAdded = false;
    }
    var canvas = _generateSpecklePattern(params.speckleDotCount, params.speckleOpacity);
    if (!canvas) return false;
    try {
      map.addImage(SPECKLE_IMAGE_ID, canvas, { pixelRatio: 1, sdf: false });
      _imageAdded = true;
      return true;
    } catch (e) {
      _lastError = 'addImage: ' + (e && e.message || e);
      return false;
    }
  }

  // ── T1: Outline layer ─────────────────────────────────────────────────────────

  function _addOutlineLayer(map, params, beforeId) {
    if (_outlineAdded) return;
    // Remove stale layer if present (from previous enable cycle)
    try { if (map.getLayer(OUTLINE_LAYER_ID)) map.removeLayer(OUTLINE_LAYER_ID); } catch (e) {}

    var widths  = params.outlineWidthStops;
    var opacs   = params.outlineOpacityStops;

    var paint = {
      'line-color':   params.outlineColor,
      'line-blur':    params.outlineBlur,
      'line-width': [
        'interpolate', ['linear'], ['zoom'],
        widths[0], widths[1], widths[2], widths[3],
        widths[4], widths[5], widths[6], widths[7],
      ],
      'line-opacity': [
        'interpolate', ['linear'], ['zoom'],
        opacs[0], opacs[1], opacs[2], opacs[3],
        opacs[4], opacs[5], opacs[6], opacs[7],
      ],
    };

    try {
      var layerDef = {
        id:             OUTLINE_LAYER_ID,
        type:           'line',
        source:         BUILDING_SOURCE,
        'source-layer': BUILDING_SOURCE_LAYER,
        filter:         BUILDING_FILTER,
        minzoom:        12,
        paint:          paint,
      };
      if (beforeId) map.addLayer(layerDef, beforeId);
      else          map.addLayer(layerDef);
      _outlineAdded = true;
    } catch (e) {
      _lastError = 'addLayer(outline): ' + (e && e.message || e);
      console.warn('[BuildingIllustrationPass] outline layer failed:', e.message || e);
    }
  }

  // ── T2: Speckle fill layer ────────────────────────────────────────────────────

  function _addSpeckleLayer(map, params, beforeId) {
    if (_speckleAdded) return;
    try { if (map.getLayer(SPECKLE_LAYER_ID)) map.removeLayer(SPECKLE_LAYER_ID); } catch (e) {}
    if (!_imageAdded) return; // pattern must be loaded first

    try {
      var layerDef = {
        id:             SPECKLE_LAYER_ID,
        type:           'fill',
        source:         BUILDING_SOURCE,
        'source-layer': BUILDING_SOURCE_LAYER,
        filter:         BUILDING_FILTER,
        minzoom:        13,
        paint: {
          'fill-pattern': SPECKLE_IMAGE_ID,
          'fill-opacity': [
            'interpolate', ['linear'], ['zoom'],
            13, 0.0,
            14, params.speckleOpacity * 0.5,
            16, params.speckleOpacity,
            18, params.speckleOpacity * 0.85,
          ],
        },
      };
      if (beforeId) map.addLayer(layerDef, beforeId);
      else          map.addLayer(layerDef);
      _speckleAdded = true;
    } catch (e) {
      _lastError = 'addLayer(speckle): ' + (e && e.message || e);
      console.warn('[BuildingIllustrationPass] speckle layer failed:', e.message || e);
    }
  }

  // ── T4: Weathered color tone variation ───────────────────────────────────────
  //
  // Applies a 4-cycle tone expression to each non-WOS fill-extrusion building layer.
  // Uses feature id modulo 4 so each building consistently lands in one tone.
  // Original paint is snapshotted before mutation for clean restore in disable().

  function _applyToneVariation(map, params) {
    var tones = params.tones;
    var expr = [
      'match',
      ['%', ['to-number', ['coalesce', ['id'], 0]], 4],
      0, tones[0],
      1, tones[1],
      2, tones[2],
      tones[3],
    ];

    _targetLayers.forEach(function (layerId) {
      try {
        // Snapshot before first mutation
        if (!(_originalPaint[layerId] !== undefined)) {
          var style  = map.getStyle();
          var layers = (style && style.layers) || [];
          for (var i = 0; i < layers.length; i++) {
            if (layers[i].id === layerId) {
              var p = layers[i].paint || {};
              _originalPaint[layerId] = p['fill-extrusion-color'] !== undefined
                ? p['fill-extrusion-color'] : null;
              break;
            }
          }
        }
        map.setPaintProperty(layerId, 'fill-extrusion-color', expr);
      } catch (e) {
        _lastError = 'setPaintProperty(' + layerId + '): ' + (e && e.message || e);
        console.warn('[BuildingIllustrationPass] tone variation failed on', layerId, ':', e.message || e);
      }
    });
  }

  function _restoreToneVariation(map) {
    Object.keys(_originalPaint).forEach(function (layerId) {
      try {
        map.setPaintProperty(layerId, 'fill-extrusion-color', _originalPaint[layerId]);
      } catch (e) {}
    });
    _originalPaint = {};
  }

  // ── Layer orchestration ───────────────────────────────────────────────────────

  function _addLayers(map) {
    _outlineAdded = false;
    _speckleAdded = false;
    var params   = PARAMS[_intensity] || PARAMS[1];
    var beforeId = _findFirstSymbolLayer(map);

    _discoverBuildingLayers(map);
    _loadSpeckleImage(map, params);
    _addOutlineLayer(map, params, beforeId);
    _addSpeckleLayer(map, params, beforeId);
    _applyToneVariation(map, params);
  }

  function _removeLayers(map) {
    [SPECKLE_LAYER_ID, OUTLINE_LAYER_ID].forEach(function (id) {
      try { if (map.getLayer(id)) map.removeLayer(id); } catch (e) {}
    });
    if (_imageAdded) {
      try { map.removeImage(SPECKLE_IMAGE_ID); } catch (e) {}
      _imageAdded = false;
    }
    _outlineAdded = false;
    _speckleAdded = false;
    _restoreToneVariation(map);
  }

  // ── Style reload hook ─────────────────────────────────────────────────────────

  function _hookStyleLoad(map) {
    if (_styleHooked) return;
    _styleHooked = true;
    map.on('style.load', function () {
      // All images and layers are wiped on style switch. Re-add if enabled.
      _outlineAdded = false;
      _speckleAdded = false;
      _imageAdded   = false;
      _originalPaint = {};
      if (_enabled) {
        setTimeout(function () { _addLayers(map); }, 300);
      }
    });
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  // enable() — activates the illustration pass in the current intensity mode.
  function enable() {
    _lastError = null;
    var map = _getMap();
    if (!map) return { ok: false, reason: 'MAP_NOT_READY' };
    _enabled = true;
    _hookStyleLoad(map);
    _addLayers(map);
    var r = report();
    console.log('[BuildingIllustrationPass] enabled | intensity:', _intensity,
      '| outline:', _outlineAdded, '| speckle:', _speckleAdded,
      '| toneTargets:', _targetLayers.length);
    return r;
  }

  // disable() — removes all illustration layers and restores original building paint.
  function disable() {
    var map = _getMap();
    if (!map) return { ok: false, reason: 'MAP_NOT_READY' };
    _enabled = false;
    _removeLayers(map);
    _targetLayers  = [];
    _skippedLayers = [];
    var r = report();
    console.log('[BuildingIllustrationPass] disabled — building paint restored');
    return r;
  }

  // setIntensity(value) — 1 (subtle, default) or 2 (strong, debug).
  // Re-applies layers at new intensity when enabled.
  function setIntensity(value) {
    var v = (value === 2) ? 2 : 1;
    if (_intensity === v) return report();
    _intensity = v;
    if (_enabled) {
      var map = _getMap();
      if (map) {
        _removeLayers(map);
        _originalPaint = {};
        _addLayers(map);
      }
    }
    console.log('[BuildingIllustrationPass] intensity →', v);
    return report();
  }

  // report() — full diagnostic state object per spec.
  function report() {
    var wsa      = SBE.WOSMapStyleAuthority;
    var wsaOk    = !!(wsa && typeof wsa.getActiveStyleProfile === 'function');
    var styleId  = wsaOk ? wsa.getActiveStyleProfile().id : null;
    return {
      ok:                      true,
      version:                 VERSION,
      enabled:                 _enabled,
      intensity:               _intensity,
      mode:                    _enabled ? (_intensity === 2 ? 'strong' : 'subtle') : 'off',
      mapStyleAuthorityPresent: wsaOk,
      activeStyleId:           styleId,
      targetLayerCount:        _targetLayers.length,
      outlineLayerCount:       _outlineAdded ? 1 : 0,
      speckleLayerCount:       _speckleAdded ? 1 : 0,
      patchLayerCount:         _targetLayers.length,   // tone variation = patch treatment
      affectedLayerIds:        [].concat(
        _outlineAdded ? [OUTLINE_LAYER_ID] : [],
        _speckleAdded ? [SPECKLE_LAYER_ID] : [],
        _targetLayers
      ),
      skippedLayerIds:         _skippedLayers.slice(),
      lastError:               _lastError,
    };
  }

  // ── Export ────────────────────────────────────────────────────────────────────

  SBE.BuildingIllustrationPass = Object.freeze({
    VERSION:      VERSION,
    enable:       enable,
    disable:      disable,
    report:       report,
    setIntensity: setIntensity,
  });

  // ── Debug surface wiring ──────────────────────────────────────────────────────

  function _wireDebug() {
    global._wos                         = global._wos                         || {};
    global._wos.debug                   = global._wos.debug                   || {};
    global._wos.debug.buildingIllustration = {
      enable:       enable,
      disable:      disable,
      report:       report,
      setIntensity: setIntensity,
    };
  }

  _wireDebug();
  (function () {
    var mvr = SBE.MapboxViewportRuntime;
    if (mvr && typeof mvr.onReady === 'function') mvr.onReady(_wireDebug);
    else setTimeout(_wireDebug, 3000);
  })();

  console.log('[BuildingIllustrationPass] v' + VERSION +
    ' loaded | _wos.debug.buildingIllustration.enable()');

})(window);
