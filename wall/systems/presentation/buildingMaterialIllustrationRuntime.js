// ── BuildingMaterialIllustrationRuntime v1.0.0 ───────────────────────────────
// 0612S_WOS_BuildingMaterialIllustrationRuntime_v1.0.0_BUILD
// Status: active | Classification: presentation-pass / material-illustration
//
// Purpose:
//   First true building illustration system for WOS.
//   Transforms Mapbox fill-extrusion buildings into stylized illustrated
//   architecture inspired by Moebius, Syd Mead, French sci-fi illustration,
//   and architectural concept rendering.
//
// Layer architecture (WOS-owned, all reversible):
//   wos-mat-zone-base   — fill-extrusion  0 → H×0.25 | base material zone
//   wos-mat-zone-mid    — fill-extrusion  H×0.25 → H×0.80 | main body zone
//   wos-mat-zone-top    — fill-extrusion  H×0.80 → H | sky-touched top zone
//   wos-mat-silhouette  — line            building footprint | crisp edge def
//   wos-mat-grain       — fill+pattern    building footprint | micro texture
//
// Material families (6):
//   concrete | paintedConcrete | industrialMetal
//   glassTower | civicStone | utilityStructure
//
// Assignment: deterministic feature-id mod 6
//   Same building = same material every session. No random flicker.
//
// Authority boundary:
//   MAY:  building outline, zone bands, surface texture, material classification
//   MUST NOT: map style, building replacement, suppression, density, camera,
//             publish, canvas, color lab, actor systems, Studio UI
//
// Placement: wall/systems/presentation/buildingMaterialIllustrationRuntime.js
// Load: AFTER wosMapStyleAuthority.js, threeViewStyleParityLock.js
// ─────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  // ── Layer IDs ─────────────────────────────────────────────────────────────────

  var LAYER_ZONE_BASE = 'wos-mat-zone-base';
  var LAYER_ZONE_MID  = 'wos-mat-zone-mid';
  var LAYER_ZONE_TOP  = 'wos-mat-zone-top';
  var LAYER_SIL       = 'wos-mat-silhouette';
  var LAYER_GRAIN     = 'wos-mat-grain';
  var IMAGE_GRAIN     = 'wos-mat-grain-img';
  var WOS_LAYERS      = [LAYER_ZONE_BASE, LAYER_ZONE_MID, LAYER_ZONE_TOP, LAYER_SIL, LAYER_GRAIN];

  // ── Building source ───────────────────────────────────────────────────────────

  var BLDG_SOURCE  = 'composite';
  var BLDG_LAYER   = 'building';
  var BLDG_FILTER  = ['==', ['get', 'extrude'], 'true'];

  // ── Zone height fractions ─────────────────────────────────────────────────────

  var BASE_END = 0.25;   // base zone:  0       → H × 0.25
  var MID_END  = 0.80;   // mid zone:   H × 0.25 → H × 0.80
                          // top zone:   H × 0.80 → H

  // Minimum zone floor heights (prevents paper-thin zones on short buildings)
  var BASE_MIN_H  = 3;    // base zone always at least 3m tall
  var MID_MIN_H   = 6;    // mid zone starts no lower than 6m

  // ── BuildingMaterialRegistry ──────────────────────────────────────────────────
  //
  // 6 material families. Zone colors encode the illustrated material language:
  //   base = heavy / shadow / ground contact
  //   mid  = main body / primary material read
  //   top  = sky-touched / cleaner / glazed
  //
  // Colors stay within WOS dark/cyan palette range to preserve style coherence.

  var BuildingMaterialRegistry = Object.freeze({
    concrete: Object.freeze({
      id: 'concrete',
      base: '#0d1a28',   // dark aggregate shadow
      mid:  '#18253a',   // standard concrete body
      top:  '#1f2e44',   // lighter parapet surface
      outlineColor: 'rgba(140, 200, 255, 0.22)',
      grainDotCount: 20,
    }),
    paintedConcrete: Object.freeze({
      id: 'paintedConcrete',
      base: '#0f2038',   // deep painted base / shadow
      mid:  '#1c3252',   // faded industrial paint
      top:  '#243c58',   // bleached upper zone / peeling edge
      outlineColor: 'rgba(140, 210, 255, 0.22)',
      grainDotCount: 24,
    }),
    industrialMetal: Object.freeze({
      id: 'industrialMetal',
      base: '#0e1e2e',   // dark oxide base
      mid:  '#1d3042',   // rolled steel / cold grey-blue
      top:  '#283e50',   // specular metal highlight top
      outlineColor: 'rgba(160, 210, 240, 0.25)',
      grainDotCount: 16,
    }),
    glassTower: Object.freeze({
      id: 'glassTower',
      base: '#0f2040',   // deep glass base / dark reflection
      mid:  '#1a3460',   // primary curtain-wall blue
      top:  '#214c74',   // sky-reflecting top glazing
      outlineColor: 'rgba(120, 190, 255, 0.30)',
      grainDotCount: 8,  // glass: minimal grain
    }),
    civicStone: Object.freeze({
      id: 'civicStone',
      base: '#101820',   // carved base shadow / deep stone
      mid:  '#182432',   // civic stone body — warm grey
      top:  '#20303e',   // lighter stone / parapet
      outlineColor: 'rgba(150, 200, 240, 0.20)',
      grainDotCount: 26,
    }),
    utilityStructure: Object.freeze({
      id: 'utilityStructure',
      base: '#0a1418',   // very dark utility / industrial
      mid:  '#141c26',   // flat utilitarian body
      top:  '#1a2432',   // marginal differentiation top
      outlineColor: 'rgba(130, 190, 220, 0.15)',
      grainDotCount: 30,
    }),
  });

  // Material index order — stable mapping from feature-id mod 6
  var MATERIAL_ORDER = [
    BuildingMaterialRegistry.concrete,
    BuildingMaterialRegistry.paintedConcrete,
    BuildingMaterialRegistry.industrialMetal,
    BuildingMaterialRegistry.glassTower,
    BuildingMaterialRegistry.civicStone,
    BuildingMaterialRegistry.utilityStructure,
  ];

  // ── State ─────────────────────────────────────────────────────────────────────

  var _enabled          = false;
  var _hooked           = false;
  var _imageAdded       = false;
  var _layersAdded      = [];   // ids of layers currently on the map
  var _lastError        = null;

  var _outlineIntensity  = 1.0;
  var _patchIntensity    = 1.0;
  var _grainIntensity    = 1.0;
  var _materialVariation = 1.0;

  // ── Map access ────────────────────────────────────────────────────────────────

  function _getMap() {
    var mvr = SBE.MapboxViewportRuntime;
    if (mvr && typeof mvr.getMap === 'function') return mvr.getMap();
    return null;
  }

  // ── Intensity clamp ───────────────────────────────────────────────────────────

  function _clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, +v || 0)); }
  function _clampI(v)        { return _clamp(v, 0.0, 2.0); }

  // ── Expression builders ───────────────────────────────────────────────────────

  // Build a Mapbox match expression: feature-id mod 6 → material property.
  // zone: 'base' | 'mid' | 'top'
  // matV: materialVariation [0,2]. At 0, all buildings use neutral mid tone.
  function _buildColorExpr(zone, matV) {
    var NEUTRAL = '#18253a';  // concrete mid — fallback for low material variation
    var threshold = 0.3;
    function pickColor(mat) {
      if (matV <= threshold) return NEUTRAL;
      if (zone === 'mid') return mat.mid;
      return matV >= 1.5
        ? (zone === 'base' ? mat.base : mat.top)  // strong variation
        : (zone === 'base' ? mat.base : mat.top);  // normal variation
    }
    return [
      'match', ['%', ['to-number', ['coalesce', ['id'], 0]], 6],
      0, pickColor(MATERIAL_ORDER[0]),
      1, pickColor(MATERIAL_ORDER[1]),
      2, pickColor(MATERIAL_ORDER[2]),
      3, pickColor(MATERIAL_ORDER[3]),
      4, pickColor(MATERIAL_ORDER[4]),
      pickColor(MATERIAL_ORDER[5]),
    ];
  }

  // Build fill-extrusion-height expression for zone top boundary.
  // Returns: min( max(minH, height × fraction), height )
  function _zoneTop(fraction, minH) {
    return ['min',
      ['max', minH, ['*', fraction, ['number', ['get', 'height'], 0]]],
      ['number', ['get', 'height'], 0],
    ];
  }

  // Build outline width expression: zoom-interpolated, scaled by intensity
  function _buildOutlineWidth(oi) {
    var s = _clamp(oi, 0.1, 2.0);
    return ['interpolate', ['linear'], ['zoom'],
      12, 0.5 * s,
      14, 0.75 * s,
      16, 1.1 * s,
      18, 1.6 * s,
    ];
  }

  // Build outline opacity expression: zoom-interpolated, scaled by intensity
  function _buildOutlineOpacity(oi) {
    var s = _clamp(oi, 0.0, 2.0);
    return ['interpolate', ['linear'], ['zoom'],
      12, 0.10 * s,
      14, 0.18 * s,
      16, 0.28 * s,
      18, 0.40 * s,
    ];
  }

  // ── Grain pattern generation ──────────────────────────────────────────────────
  //
  // Deterministic LCG: same seed → same pattern every session.
  // Mixed dot sizes (0.4–2.2px) and irregular spacing for organic paper feel.

  function _generateGrainImage(dotCount, opacityScale) {
    var size = 64;
    var canvas;
    try { canvas = global.document.createElement('canvas'); } catch (e) { return null; }
    canvas.width  = size;
    canvas.height = size;
    var ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // LCG constants (Numerical Recipes)
    var seed = 0xA5F3;
    function rand() {
      seed = (seed * 1664525 + 1013904223) & 0xFFFFFFFF;
      return ((seed >>> 0) / 4294967296);
    }

    for (var i = 0; i < dotCount; i++) {
      var x    = rand() * size;
      var y    = rand() * size;
      var r    = 0.4 + rand() * 1.8;         // 0.4–2.2px radius
      var a    = opacityScale * (0.3 + rand() * 0.7);
      var hue  = 200 + rand() * 40;           // cool blue-white grain
      ctx.globalAlpha = Math.min(a, 1.0);
      ctx.fillStyle   = 'hsl(' + hue + ', 40%, 75%)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    return canvas;
  }

  // ── Layer insertion helpers ───────────────────────────────────────────────────

  function _findFirstSymbolLayer(map) {
    try {
      var layers = (map.getStyle().layers) || [];
      for (var i = 0; i < layers.length; i++) {
        if (layers[i].type === 'symbol') return layers[i].id;
      }
    } catch (e) {}
    return undefined;
  }

  function _safeAddLayer(map, def, beforeId) {
    var id = def.id;
    try {
      if (map.getLayer(id)) map.removeLayer(id);
    } catch (e) {}
    try {
      if (beforeId) map.addLayer(def, beforeId);
      else          map.addLayer(def);
      _layersAdded.push(id);
      return true;
    } catch (e) {
      _lastError = 'addLayer(' + id + '): ' + (e && e.message || e);
      console.warn('[BuildingMaterialIllustrationRuntime] layer failed:', id, e.message || e);
      return false;
    }
  }

  // ── Add all illustration layers ───────────────────────────────────────────────

  function _addAllLayers(map) {
    _layersAdded = [];
    _lastError   = null;

    var beforeId = _findFirstSymbolLayer(map);
    var pi       = _patchIntensity;
    var matV     = _materialVariation;

    // ── Zone base layer (0 → H×BASE_END) ───────────────────────────────────────
    var baseTopExpr = _zoneTop(BASE_END, BASE_MIN_H);
    _safeAddLayer(map, {
      id:             LAYER_ZONE_BASE,
      type:           'fill-extrusion',
      source:         BLDG_SOURCE,
      'source-layer': BLDG_LAYER,
      filter:         BLDG_FILTER,
      minzoom:        12,
      paint: {
        'fill-extrusion-base':    0,
        'fill-extrusion-height':  baseTopExpr,
        'fill-extrusion-color':   _buildColorExpr('base', matV),
        'fill-extrusion-opacity': _clamp(0.82 * pi, 0.0, 1.0),
        'fill-extrusion-vertical-gradient': true,
      },
    }, beforeId);

    // ── Zone mid layer (H×BASE_END → H×MID_END) ─────────────────────────────────
    var midTopExpr = _zoneTop(MID_END, MID_MIN_H);
    _safeAddLayer(map, {
      id:             LAYER_ZONE_MID,
      type:           'fill-extrusion',
      source:         BLDG_SOURCE,
      'source-layer': BLDG_LAYER,
      filter:         BLDG_FILTER,
      minzoom:        12,
      paint: {
        'fill-extrusion-base':    baseTopExpr,
        'fill-extrusion-height':  midTopExpr,
        'fill-extrusion-color':   _buildColorExpr('mid', matV),
        'fill-extrusion-opacity': _clamp(0.88 * Math.max(pi, 0.1), 0.0, 1.0),
        'fill-extrusion-vertical-gradient': true,
      },
    }, beforeId);

    // ── Zone top layer (H×MID_END → H) ─────────────────────────────────────────
    _safeAddLayer(map, {
      id:             LAYER_ZONE_TOP,
      type:           'fill-extrusion',
      source:         BLDG_SOURCE,
      'source-layer': BLDG_LAYER,
      filter:         BLDG_FILTER,
      minzoom:        12,
      paint: {
        'fill-extrusion-base':    midTopExpr,
        'fill-extrusion-height':  ['number', ['get', 'height'], 0],
        'fill-extrusion-color':   _buildColorExpr('top', matV),
        'fill-extrusion-opacity': _clamp(0.78 * pi, 0.0, 1.0),
        'fill-extrusion-vertical-gradient': false,  // top: flat, no gradient
      },
    }, beforeId);

    // ── Silhouette outline layer ────────────────────────────────────────────────
    _safeAddLayer(map, {
      id:             LAYER_SIL,
      type:           'line',
      source:         BLDG_SOURCE,
      'source-layer': BLDG_LAYER,
      filter:         BLDG_FILTER,
      minzoom:        12,
      paint: {
        'line-color':   'rgba(150, 210, 255, 0.30)',
        'line-blur':    0.5,
        'line-width':   _buildOutlineWidth(_outlineIntensity),
        'line-opacity': _buildOutlineOpacity(_outlineIntensity),
      },
    }, beforeId);

    // ── Grain texture layer ─────────────────────────────────────────────────────
    // Average grain params across all materials
    var avgDots = 22;
    var grainOpacityBase = 0.12 * _clamp(_grainIntensity, 0.0, 2.0);
    _loadGrainImage(map, avgDots, grainOpacityBase);
    if (_imageAdded) {
      _safeAddLayer(map, {
        id:             LAYER_GRAIN,
        type:           'fill',
        source:         BLDG_SOURCE,
        'source-layer': BLDG_LAYER,
        filter:         BLDG_FILTER,
        minzoom:        13,
        paint: {
          'fill-pattern': IMAGE_GRAIN,
          'fill-opacity': ['interpolate', ['linear'], ['zoom'],
            13, 0.0,
            14, grainOpacityBase * 0.5,
            16, grainOpacityBase,
            18, grainOpacityBase * 0.8,
          ],
        },
      }, beforeId);
    }
  }

  function _loadGrainImage(map, dotCount, opacityScale) {
    if (_imageAdded) {
      try { map.removeImage(IMAGE_GRAIN); } catch (e) {}
      _imageAdded = false;
    }
    var canvas = _generateGrainImage(dotCount, opacityScale * 8 + 0.3);
    if (!canvas) return;
    try {
      map.addImage(IMAGE_GRAIN, canvas, { pixelRatio: 1 });
      _imageAdded = true;
    } catch (e) {
      _lastError = 'addImage(grain): ' + (e && e.message || e);
    }
  }

  // ── Remove all illustration layers ───────────────────────────────────────────

  function _removeAllLayers(map) {
    WOS_LAYERS.forEach(function (id) {
      try { if (map.getLayer(id)) map.removeLayer(id); } catch (e) {}
    });
    if (_imageAdded) {
      try { map.removeImage(IMAGE_GRAIN); } catch (e) {}
      _imageAdded = false;
    }
    _layersAdded = [];
  }

  // ── Style reload hook ─────────────────────────────────────────────────────────

  function _hookStyleLoad(map) {
    if (_hooked) return;
    _hooked = true;
    map.on('style.load', function () {
      _layersAdded = [];
      _imageAdded  = false;
      if (_enabled) {
        setTimeout(function () { _addAllLayers(map); }, 300);
      }
    });
  }

  // ── Live paint updates (without full layer teardown) ──────────────────────────

  function _updateZoneColors(map, matV) {
    if (!map) return;
    try {
      if (map.getLayer(LAYER_ZONE_BASE)) map.setPaintProperty(LAYER_ZONE_BASE, 'fill-extrusion-color', _buildColorExpr('base', matV));
      if (map.getLayer(LAYER_ZONE_MID))  map.setPaintProperty(LAYER_ZONE_MID,  'fill-extrusion-color', _buildColorExpr('mid',  matV));
      if (map.getLayer(LAYER_ZONE_TOP))  map.setPaintProperty(LAYER_ZONE_TOP,  'fill-extrusion-color', _buildColorExpr('top',  matV));
    } catch (e) {
      _lastError = 'updateZoneColors: ' + (e && e.message || e);
    }
  }

  function _updateZoneOpacity(map, pi) {
    if (!map) return;
    try {
      if (map.getLayer(LAYER_ZONE_BASE)) map.setPaintProperty(LAYER_ZONE_BASE, 'fill-extrusion-opacity', _clamp(0.82 * pi, 0.0, 1.0));
      if (map.getLayer(LAYER_ZONE_MID))  map.setPaintProperty(LAYER_ZONE_MID,  'fill-extrusion-opacity', _clamp(0.88 * Math.max(pi, 0.1), 0.0, 1.0));
      if (map.getLayer(LAYER_ZONE_TOP))  map.setPaintProperty(LAYER_ZONE_TOP,  'fill-extrusion-opacity', _clamp(0.78 * pi, 0.0, 1.0));
    } catch (e) {
      _lastError = 'updateZoneOpacity: ' + (e && e.message || e);
    }
  }

  function _updateOutline(map, oi) {
    if (!map) return;
    try {
      if (map.getLayer(LAYER_SIL)) {
        map.setPaintProperty(LAYER_SIL, 'line-width',   _buildOutlineWidth(oi));
        map.setPaintProperty(LAYER_SIL, 'line-opacity', _buildOutlineOpacity(oi));
      }
    } catch (e) {
      _lastError = 'updateOutline: ' + (e && e.message || e);
    }
  }

  function _updateGrainOpacity(map, gi) {
    if (!map) return;
    var grainOpacity = 0.12 * _clamp(gi, 0.0, 2.0);
    try {
      if (map.getLayer(LAYER_GRAIN)) {
        map.setPaintProperty(LAYER_GRAIN, 'fill-opacity', [
          'interpolate', ['linear'], ['zoom'],
          13, 0.0,
          14, grainOpacity * 0.5,
          16, grainOpacity,
          18, grainOpacity * 0.8,
        ]);
      }
    } catch (e) {
      _lastError = 'updateGrainOpacity: ' + (e && e.message || e);
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  function enable() {
    _lastError = null;
    var map = _getMap();
    if (!map) return { ok: false, reason: 'MAP_NOT_READY' };
    _enabled = true;
    _hookStyleLoad(map);
    _removeAllLayers(map);
    _addAllLayers(map);
    var r = report();
    console.log('[BuildingMaterialIllustrationRuntime] enabled |',
      'layers:', _layersAdded.length, '| materials: 6 families | grain:', _imageAdded);
    return r;
  }

  function disable() {
    var map = _getMap();
    if (!map) return { ok: false, reason: 'MAP_NOT_READY' };
    _enabled = false;
    _removeAllLayers(map);
    console.log('[BuildingMaterialIllustrationRuntime] disabled — all illustration layers removed');
    return report();
  }

  function setOutlineIntensity(v) {
    _outlineIntensity = _clampI(v);
    if (_enabled) _updateOutline(_getMap(), _outlineIntensity);
    return report();
  }

  function setPatchIntensity(v) {
    _patchIntensity = _clampI(v);
    if (_enabled) _updateZoneOpacity(_getMap(), _patchIntensity);
    return report();
  }

  function setGrainIntensity(v) {
    _grainIntensity = _clampI(v);
    if (_enabled) _updateGrainOpacity(_getMap(), _grainIntensity);
    return report();
  }

  function setMaterialVariation(v) {
    _materialVariation = _clampI(v);
    if (_enabled) _updateZoneColors(_getMap(), _materialVariation);
    return report();
  }

  function report() {
    var wsa     = SBE.WOSMapStyleAuthority;
    var wsaOk   = !!(wsa && typeof wsa.getActiveStyleProfile === 'function');
    var styleId = wsaOk ? (wsa.getActiveStyleProfile() || {}).id : null;
    return {
      ok:                       true,
      version:                  VERSION,
      enabled:                  _enabled,
      materialFamilyCount:      6,
      layersAdded:              _layersAdded.slice(),
      layerCount:               _layersAdded.length,
      grainImageLoaded:         _imageAdded,
      outlineIntensity:         _outlineIntensity,
      patchIntensity:           _patchIntensity,
      grainIntensity:           _grainIntensity,
      materialVariation:        _materialVariation,
      mapStyleAuthorityPresent: wsaOk,
      activeStyleId:            styleId,
      lastError:                _lastError,
    };
  }

  // ── Export ────────────────────────────────────────────────────────────────────

  SBE.BuildingMaterialIllustrationRuntime = Object.freeze({
    VERSION:               VERSION,
    BuildingMaterialRegistry: BuildingMaterialRegistry,
    enable:                enable,
    disable:               disable,
    report:                report,
    setOutlineIntensity:   setOutlineIntensity,
    setPatchIntensity:     setPatchIntensity,
    setGrainIntensity:     setGrainIntensity,
    setMaterialVariation:  setMaterialVariation,
  });

  // ── Debug surface ─────────────────────────────────────────────────────────────

  function _wireDebug() {
    global._wos                                  = global._wos                                  || {};
    global._wos.debug                            = global._wos.debug                            || {};
    global._wos.debug.buildingMaterialIllustration = {
      enable:               enable,
      disable:              disable,
      report:               report,
      setOutlineIntensity:  setOutlineIntensity,
      setPatchIntensity:    setPatchIntensity,
      setGrainIntensity:    setGrainIntensity,
      setMaterialVariation: setMaterialVariation,
      registry:             BuildingMaterialRegistry,
    };
  }

  _wireDebug();
  (function () {
    var mvr = SBE.MapboxViewportRuntime;
    if (mvr && typeof mvr.onReady === 'function') mvr.onReady(_wireDebug);
    else setTimeout(_wireDebug, 3000);
  })();

  console.log('[BuildingMaterialIllustrationRuntime] v' + VERSION +
    ' loaded | 6 material families | _wos.debug.buildingMaterialIllustration.enable()');

})(window);
