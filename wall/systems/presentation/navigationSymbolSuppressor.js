// ── NavigationSymbolSuppressor v1.0.0 ─────────────────────────────────────────
// 0530G_WOS_HeroVehicleTier1Cleanup_v1.0.0
// Status: active
// Classification: presentation-style
//
// Hides Mapbox symbol layers that read as GPS-app navigation UI:
//   direction arrows, oneway arrows, turn indicators, route-guidance glyphs.
//
// Doctrine: Direction is implied by motion. Arrows are navigation UI.
//
// Preserves:
//   road edges, lane dividers, crosswalks, medians, rail lines, road labels
//
// Authority:
//   OWNS: visibility of matched navigation symbol layers
//   READS: active Mapbox style via MapboxViewportRuntime.getMap()
//   MUST NOT: remove road structure, change layer order, mutate non-arrow layers
//
// Debug:
//   _wos.debug.mapStyle.navigationSymbols()
//     → { hiddenLayers, candidateLayers, active }
//
// Placement: wall/systems/presentation/navigationSymbolSuppressor.js
// Load: AFTER main.js (map must be styled before layer scan)
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  // Patterns matched against layer ID, icon-image value, AND text-field value.
  var ARROW_PATTERNS = [
    'arrow',
    'oneway',
    'one-way',
    'one_way',
    'turn-',
    'turn_',
    'direction',
    'wayfinding',
    'route-label',
    'road-label-arrow',
    'navigation',
    'maneuver',
    'lane',
    'shield-arrow',
    'motorway-arrow',
  ];

  // Layer IDs to never hide regardless of pattern match.
  // Bridge/tunnel/elevated patterns MUST be protected — the arrow suppressor
  // scans for 'direction' and 'lane' which can match bridge layer IDs like
  // 'bridge-motorway-lane' or 'tunnel-oneway-direction'. Safelist takes priority.
  var LAYER_SAFELIST = [
    'road-label',
    'street-label',
    'road-number',
    'highway-label',
    'ferry-label',
    'transit-label',
    'rail-label',
    'waterway-label',
    'poi-label',
    'place-label',
    'settlement-label',
    'state-label',
    'country-label',
    // Bridge / overpass / elevated road structure — must never be hidden
    'bridge',
    'tunnel',
    'overpass',
    'elevated',
    // Road case/fill layers that carry bridge geometry
    'bridge-case',
    'bridge-major',
    'bridge-minor',
    'bridge-street',
    'bridge-motorway',
    'bridge-primary',
    'bridge-secondary',
    'bridge-tertiary',
    'bridge-rail',
  ];

  // Hard-disable by exact layer ID — populated after running findArrows() and
  // identifying the real layer IDs in the active style. Extend as needed.
  var FORCE_HIDE_LAYER_IDS = [
    // Examples — add real IDs from _wos.debug.mapStyle.findArrows() output:
    // 'road-oneway-arrows-blue',
    // 'road-oneway-arrows-white',
    // 'bridge-oneway-arrows-blue',
    // 'bridge-oneway-arrows-white',
    // 'tunnel-oneway-arrows-blue',
  ];

  var _hiddenLayers    = [];
  var _candidateLayers = [];
  var _active          = false;
  var _applied         = false;

  function _isArrowLayer(layer) {
    if (!layer || layer.type !== 'symbol') return false;
    var id = (layer.id || '').toLowerCase();

    // Check safelist first
    for (var s = 0; s < LAYER_SAFELIST.length; s++) {
      if (id.indexOf(LAYER_SAFELIST[s]) !== -1) return false;
    }

    // Check arrow patterns
    for (var p = 0; p < ARROW_PATTERNS.length; p++) {
      if (id.indexOf(ARROW_PATTERNS[p]) !== -1) return true;
    }

    // Check layout property values: icon-image and text-field.
    // Many Mapbox styles match by property value rather than layer ID —
    // e.g. icon-image:"oneway-arrow-white" on a layer named "road-symbols".
    var layout = layer.layout || {};

    // icon-image can be a string literal or an expression array
    var iconValue = layout['icon-image'];
    var iconStr   = '';
    if (typeof iconValue === 'string') {
      iconStr = iconValue.toLowerCase();
    } else if (Array.isArray(iconValue)) {
      iconStr = JSON.stringify(iconValue).toLowerCase();
    }

    // text-field similarly
    var textValue = layout['text-field'];
    var textStr   = '';
    if (typeof textValue === 'string') {
      textStr = textValue.toLowerCase();
    } else if (Array.isArray(textValue)) {
      textStr = JSON.stringify(textValue).toLowerCase();
    }

    for (var q = 0; q < ARROW_PATTERNS.length; q++) {
      var pat = ARROW_PATTERNS[q];
      if (iconStr && iconStr.indexOf(pat) !== -1) return true;
      if (textStr && textStr.indexOf(pat) !== -1) return true;
    }

    return false;
  }

  // ── Diagnostic: log all symbol layers with their property values ─────────────
  function audit() {
    var mvr = global.SBE && SBE.MapboxViewportRuntime;
    var map = mvr && typeof mvr.getMap === 'function' ? mvr.getMap() : null;
    if (!map) { console.warn('[NavigationSymbolSuppressor] map not ready'); return []; }
    var style = null;
    try { style = map.getStyle(); } catch (e) {}
    if (!style || !style.layers) { console.warn('[NavigationSymbolSuppressor] style not loaded'); return []; }

    var symbolLayers = style.layers.filter(function (l) { return l.type === 'symbol'; });
    console.group('[NavigationSymbolSuppressor] audit() — ' + symbolLayers.length + ' symbol layers');
    var report = symbolLayers.map(function (l) {
      var layout     = l.layout || {};
      var iconImage  = layout['icon-image'];
      var textField  = layout['text-field'];
      var vis        = null;
      try { vis = map.getLayoutProperty(l.id, 'visibility'); } catch (e) {}
      var entry = {
        id:         l.id,
        iconImage:  iconImage != null ? iconImage : '—',
        textField:  textField != null ? textField : '—',
        visibility: vis || 'visible',
        candidate:  _isArrowLayer(l),
      };
      console.log(
        (l.id + '                              ').slice(0, 40),
        'icon:', (typeof iconImage === 'string' ? iconImage : (iconImage ? '[expr]' : '—')).slice(0, 30),
        'text:', (typeof textField === 'string' ? textField : (textField ? '[expr]' : '—')).slice(0, 20),
        entry.candidate ? '← CANDIDATE' : ''
      );
      return entry;
    });
    console.groupEnd();
    return report;
  }

  // ── findArrows() — deep scan of ALL layer types ───────────────────────────────
  // Unlike audit() which only looks at symbol layers, this scans every layer
  // and flags anything whose id, source-layer, layout, or paint contains an
  // arrow/direction/oneway/turn/lane/traffic keyword.
  // Run _wos.debug.mapStyle.findArrows() in the console, find the real IDs,
  // then add them to FORCE_HIDE_LAYER_IDS above and call apply() again.

  var FIND_PATTERNS = ['arrow','oneway','one-way','one_way','direction','turn','lane','traffic','shield'];

  function findArrows() {
    var mvr = global.SBE && SBE.MapboxViewportRuntime;
    var map = mvr && typeof mvr.getMap === 'function' ? mvr.getMap() : null;
    if (!map) { console.warn('[NavigationSymbolSuppressor] map not ready'); return []; }
    var style = null;
    try { style = map.getStyle(); } catch (e) {}
    if (!style || !style.layers) { console.warn('[NavigationSymbolSuppressor] style not loaded'); return []; }

    var found = [];
    console.group('[NavigationSymbolSuppressor] findArrows() — scanning all ' + style.layers.length + ' layers');

    for (var i = 0; i < style.layers.length; i++) {
      var l      = style.layers[i];
      var layout = l.layout || {};
      var paint  = l.paint  || {};

      // Build a single searchable string from all identifiers
      var searchStr = [
        l.id || '',
        l['source-layer'] || '',
        JSON.stringify(layout),
        JSON.stringify(paint),
      ].join(' ').toLowerCase();

      var matched = false;
      for (var p = 0; p < FIND_PATTERNS.length; p++) {
        if (searchStr.indexOf(FIND_PATTERNS[p]) !== -1) { matched = true; break; }
      }

      var vis = null;
      try { vis = map.getLayoutProperty(l.id, 'visibility'); } catch (e) {}

      if (matched) {
        var entry = {
          id:          l.id,
          type:        l.type,
          sourceLayer: l['source-layer'] || '—',
          visibility:  vis || 'visible',
          iconImage:   layout['icon-image']   != null ? layout['icon-image']   : '—',
          textField:   layout['text-field']   != null ? layout['text-field']   : '—',
        };
        found.push(entry);
        console.log(
          '▶', (l.id + '                           ').slice(0, 40),
          'type:', (l.type + '       ').slice(0, 8),
          'src-layer:', (entry.sourceLayer + '              ').slice(0, 20),
          'vis:', vis || 'visible',
          typeof entry.iconImage === 'string' && entry.iconImage !== '—' ? ('icon:' + entry.iconImage.slice(0,20)) : ''
        );
      }
    }

    console.log('\nTo hard-disable found layers, add their IDs to FORCE_HIDE_LAYER_IDS in navigationSymbolSuppressor.js');
    console.groupEnd();
    return found;
  }

  // ── bridgeLayers() — report all bridge/tunnel/overpass/road structure layers ──
  // Shows visibility, minzoom, maxzoom, source-layer for each.
  // Use this to confirm bridge geometry is not being suppressed.

  var BRIDGE_PATTERNS = ['bridge', 'tunnel', 'overpass', 'elevated',
                         'motorway', 'primary', 'secondary', 'tertiary', 'rail',
                         'road-', 'street'];

  function bridgeLayers() {
    var mvr = global.SBE && SBE.MapboxViewportRuntime;
    var map = mvr && typeof mvr.getMap === 'function' ? mvr.getMap() : null;
    if (!map) { console.warn('[NavigationSymbolSuppressor] map not ready'); return []; }
    var style = null;
    try { style = map.getStyle(); } catch (e) {}
    if (!style || !style.layers) { console.warn('[NavigationSymbolSuppressor] style not loaded'); return []; }

    var matched = [];
    console.group('[NavigationSymbolSuppressor] bridgeLayers() — road/bridge/tunnel structure');

    for (var i = 0; i < style.layers.length; i++) {
      var l  = style.layers[i];
      var id = (l.id || '').toLowerCase();
      var hit = false;
      for (var p = 0; p < BRIDGE_PATTERNS.length; p++) {
        if (id.indexOf(BRIDGE_PATTERNS[p]) !== -1) { hit = true; break; }
      }
      if (!hit) continue;

      var vis = null;
      try { vis = map.getLayoutProperty(l.id, 'visibility'); } catch (e) {}
      var entry = {
        id:          l.id,
        type:        l.type,
        sourceLayer: l['source-layer'] || '—',
        minzoom:     l.minzoom != null ? l.minzoom : '—',
        maxzoom:     l.maxzoom != null ? l.maxzoom : '—',
        visibility:  vis || 'visible',
        safelisted:  _isSafelisted(l.id),
      };
      matched.push(entry);

      var flag = entry.visibility === 'none' ? ' ← HIDDEN ⚠' : '';
      console.log(
        (l.id + '                                    ').slice(0, 44),
        'type:', (l.type + '       ').slice(0, 8),
        'z:', entry.minzoom + '→' + entry.maxzoom,
        'vis:', entry.visibility + flag,
        entry.safelisted ? '[safe]' : ''
      );
    }

    if (matched.filter(function (e) { return e.visibility === 'none'; }).length) {
      console.warn('[bridgeLayers] Some structure layers are hidden! Check suppressor safelist.');
    }
    console.groupEnd();
    return matched;
  }

  // Helper: check if a layer ID matches the safelist
  function _isSafelisted(id) {
    var lower = (id || '').toLowerCase();
    for (var s = 0; s < LAYER_SAFELIST.length; s++) {
      if (lower.indexOf(LAYER_SAFELIST[s]) !== -1) return true;
    }
    return false;
  }

  // ── forceBridgeVisibility() ───────────────────────────────────────────────────
  // Iterates every bridge/tunnel/overpass/elevated layer and:
  //   1. Forces visibility: visible
  //   2. Expands zoom range to 0–24 (overrides minzoom/maxzoom that can hide
  //      bridge geometry at low zoom levels)
  //   3. Warns if current map zoom is outside original minzoom/maxzoom

  function forceBridgeVisibility() {
    var mvr = global.SBE && SBE.MapboxViewportRuntime;
    var map = mvr && typeof mvr.getMap === 'function' ? mvr.getMap() : null;
    if (!map) { console.warn('[NavigationSymbolSuppressor] map not ready'); return []; }
    var style = null;
    try { style = map.getStyle(); } catch (e) {}
    if (!style || !style.layers) { console.warn('[NavigationSymbolSuppressor] style not loaded'); return []; }

    var curZoom = null;
    try { curZoom = map.getZoom(); } catch (e) {}

    var forced = [];
    console.group('[NavigationSymbolSuppressor] forceBridgeVisibility()');

    for (var i = 0; i < style.layers.length; i++) {
      var l  = style.layers[i];
      var id = (l.id || '').toLowerCase();

      // Only act on layers explicitly identifiable as bridge/tunnel/overpass/elevated
      // road geometry — not just anything with a road pattern
      var isBridge = id.indexOf('bridge') !== -1 ||
                     id.indexOf('tunnel') !== -1 ||
                     id.indexOf('overpass') !== -1 ||
                     id.indexOf('elevated') !== -1;
      if (!isBridge) continue;

      // Restore visibility
      var vis = null;
      try { vis = map.getLayoutProperty(l.id, 'visibility'); } catch (e) {}
      try { map.setLayoutProperty(l.id, 'visibility', 'visible'); } catch (e) {}

      // Expand zoom range so the layer is never hidden by zoom thresholds
      var origMin = l.minzoom != null ? l.minzoom : 0;
      var origMax = l.maxzoom != null ? l.maxzoom : 24;
      try { map.setLayerZoomRange(l.id, 0, 24); } catch (e) {}

      var outOfRange = curZoom != null && (curZoom < origMin || curZoom > origMax);

      forced.push({ id: l.id, type: l.type, origMin: origMin, origMax: origMax,
                    wasHidden: vis === 'none', outOfRange: outOfRange });

      console.log(
        (l.id + '                                  ').slice(0, 44),
        'type:', (l.type + '       ').slice(0, 8),
        'z:', origMin + '→' + origMax,
        wasHidden ? '[was hidden ← FIXED]' : '[vis ok]',
        outOfRange ? '⚠ zoom ' + (curZoom != null ? curZoom.toFixed(1) : '?') + ' outside range!' : ''
      );
    }

    console.log('Forced', forced.length, 'bridge/tunnel layers visible at z0–24');
    console.groupEnd();
    return forced;
  }

  function apply() {
    var mvr = global.SBE && SBE.MapboxViewportRuntime;
    var map = mvr && typeof mvr.getMap === 'function' ? mvr.getMap() : null;
    if (!map) {
      console.warn('[NavigationSymbolSuppressor] map not ready — will retry');
      global.setTimeout(apply, 1500);
      return;
    }

    var style = null;
    try { style = map.getStyle(); } catch (e) {}
    if (!style || !style.layers) {
      global.setTimeout(apply, 1500);
      return;
    }

    _candidateLayers = [];
    _hiddenLayers    = [];

    function _hideLayer(id) {
      var current = null;
      try { current = map.getLayoutProperty(id, 'visibility'); } catch (e) {}
      if (current === 'none') return;
      try {
        map.setLayoutProperty(id, 'visibility', 'none');
        _hiddenLayers.push(id);
      } catch (e) {
        console.warn('[NavigationSymbolSuppressor] could not hide layer:', id, e.message);
      }
    }

    // Pattern-matched pass (symbol layers only — deeper types via FORCE_HIDE_LAYER_IDS)
    for (var i = 0; i < style.layers.length; i++) {
      var layer = style.layers[i];
      if (!_isArrowLayer(layer)) continue;
      _candidateLayers.push(layer.id);
      _hideLayer(layer.id);
    }

    // Hard-disable pass — exact IDs identified via findArrows() diagnostic
    for (var f = 0; f < FORCE_HIDE_LAYER_IDS.length; f++) {
      var fid = FORCE_HIDE_LAYER_IDS[f];
      if (_hiddenLayers.indexOf(fid) === -1) {   // avoid double-push
        _hideLayer(fid);
        if (_candidateLayers.indexOf(fid) === -1) _candidateLayers.push(fid);
      }
    }

    _active  = true;
    _applied = true;

    console.log('[NavigationSymbolSuppressor] hidden', _hiddenLayers.length,
      'of', _candidateLayers.length, 'candidate layers');
    if (_hiddenLayers.length) {
      console.log('  →', _hiddenLayers.join(', '));
    }
  }

  function restore() {
    var mvr = global.SBE && SBE.MapboxViewportRuntime;
    var map = mvr && typeof mvr.getMap === 'function' ? mvr.getMap() : null;
    if (!map) return;

    for (var i = 0; i < _hiddenLayers.length; i++) {
      try { map.setLayoutProperty(_hiddenLayers[i], 'visibility', 'visible'); } catch (e) {}
    }
    _hiddenLayers = [];
    _active       = false;
    console.log('[NavigationSymbolSuppressor] restored all hidden layers');
  }

  function getState() {
    return {
      hiddenLayers:    _hiddenLayers.slice(),
      candidateLayers: _candidateLayers.slice(),
      active:          _active,
    };
  }

  // ── Auto-apply after map loads ────────────────────────────────────────────────
  function init() {
    var mvr = global.SBE && SBE.MapboxViewportRuntime;
    var map = mvr && typeof mvr.getMap === 'function' ? mvr.getMap() : null;
    if (map) {
      if (map.isStyleLoaded()) {
        apply();
      } else {
        map.once('styledata', function () {
          global.setTimeout(apply, 300);
        });
      }
    } else {
      // map not mounted yet — wait
      global.setTimeout(init, 2000);
    }
  }

  SBE.NavigationSymbolSuppressor = Object.freeze({
    VERSION:      VERSION,
    init:         init,
    apply:        apply,
    restore:      restore,
    getState:     getState,
    audit:        audit,
    findArrows:   findArrows,
    bridgeLayers:          bridgeLayers,
    forceBridgeVisibility: forceBridgeVisibility,
  });

  // ── Debug binding ─────────────────────────────────────────────────────────────

  function _bindDebug() {
    global._wos             = global._wos             || {};
    global._wos.debug       = global._wos.debug       || {};
    global._wos.debug.mapStyle = global._wos.debug.mapStyle || {};
    global._wos.debug.mapStyle.navigationSymbols = function () {
      var s = getState();
      console.group('[mapStyle] navigationSymbols()');
      console.log('active          :', s.active);
      console.log('hiddenLayers    :', s.hiddenLayers.length ? s.hiddenLayers.join(', ') : '(none)');
      console.log('candidateLayers :', s.candidateLayers.length ? s.candidateLayers.join(', ') : '(none)');
      console.groupEnd();
      return s;
    };
    // Full symbol layer dump — find missed arrow layers by icon-image/text-field
    global._wos.debug.mapStyle.auditSymbols = audit;
    // Deep all-layer scan — finds arrows in fill/line/raster layers too
    global._wos.debug.mapStyle.findArrows   = findArrows;
    // Bridge/tunnel/overpass structure report
    global._wos.debug.mapStyle.bridgeLayers        = bridgeLayers;
    global._wos.debug.mapStyle.forceBridgeVisibility = forceBridgeVisibility;
  }
  _bindDebug();
  global.setTimeout(_bindDebug, 1000);
  global.setTimeout(_bindDebug, 2500);

  // Auto-init after a brief delay so the map is ready
  global.setTimeout(init, 3000);

  console.log('[NavigationSymbolSuppressor] v' + VERSION + ' loaded');

})(window);
