// ── WOS Map Look Controller ───────────────────────────────────────────────────
// 0615C_WOS_StudioMapLookAuthoringSurface_v1.0.0_BUILD
//
// Owns Studio 3D Canvas map look state. Applies Mapbox style presets and
// layer visibility/opacity overrides. Emits wos:map-look-changed events.
// Never writes to actor manifests, Wall bundles, or publish pipeline.
//
// Look presets:
//   authoring       — clear working map (light style)
//   broadcast-dark  — cinematic preview (dark style)
//   night           — night-world design preview (dark + dimmed labels)
//   tron            — grid/edge treatment preview (dark + no labels)
//   illustration    — outlined building direction preview (light + low opacity)
//
// Persistence: wos.studio.mapLook (localStorage key — look name only)
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  // ── Base-style resolver ───────────────────────────────────────────────────────
  // Presets describe intent, not hardcoded style URLs.
  // Resolution order:
  //   1. SBE.WOSMapStyleAuthority.resolveStudioStyle(lookKey)  — future custom WOS looks
  //   2. SBE.WOSMapStyleAuthority.getMapboxStyle()             — known-good active WOS style
  //   3. Hard fallback: wos.dark.cyan (never mapbox/light — that style is 401 for this token)
  var WOS_FALLBACK_STYLE = 'mapbox://styles/studiorich/cm3goyx23003901qkb60ff29p';

  function _resolveBaseStyle(lookKey) {
    var auth = global.SBE && global.SBE.WOSMapStyleAuthority;
    if (auth && typeof auth.resolveStudioStyle === 'function') {
      var custom = auth.resolveStudioStyle(lookKey);
      if (custom) return custom;
    }
    if (auth && typeof auth.getMapboxStyle === 'function') {
      var active = auth.getMapboxStyle();
      if (active) return active;
    }
    return WOS_FALLBACK_STYLE;
  }

  // ── Look presets ─────────────────────────────────────────────────────────────
  // styleIntent describes the desired look family; actual URL resolved at runtime
  // via _resolveBaseStyle() so we never depend on stock Mapbox styles directly.
  var LOOKS = {
    'authoring': {
      label:       'Authoring',
      styleIntent: 'clear-working',
      options: {
        labels: true, roads: true, water: true, parks: true,
        buildings: true, buildingOpacity: 0.65,
        actorOverlay: true, selectedEmphasis: true,
      },
    },
    'broadcast-dark': {
      label:       'Broadcast Dark',
      styleIntent: 'wos-broadcast',
      options: {
        labels: true, roads: true, water: true, parks: false,
        buildings: true, buildingOpacity: 0.85,
        actorOverlay: true, selectedEmphasis: true,
      },
    },
    'night': {
      label:       'Night',
      styleIntent: 'wos-night',
      options: {
        labels: true, roads: true, water: true, parks: false,
        buildings: true, buildingOpacity: 0.92,
        actorOverlay: true, selectedEmphasis: true,
      },
    },
    'tron': {
      label:       'Tron',
      styleIntent: 'wos-tron',
      options: {
        labels: false, roads: true, water: true, parks: false,
        buildings: true, buildingOpacity: 1.0,
        actorOverlay: true, selectedEmphasis: true,
      },
    },
    'illustration': {
      label:       'Illustration',
      styleIntent: 'wos-illustration',
      options: {
        labels: true, roads: true, water: true, parks: true,
        buildings: true, buildingOpacity: 0.45,
        actorOverlay: true, selectedEmphasis: true,
      },
    },
  };

  var DEFAULT_LOOK = 'authoring';
  var LS_KEY_LOOK  = 'wos.studio.mapLook';

  // ── State ────────────────────────────────────────────────────────────────────
  var _map         = null;
  var _activeLook  = DEFAULT_LOOK;
  var _options     = null;   // merged options (preset defaults + overrides)
  var _callbacks   = null;   // { onStyleReload, onMapIdle }
  var _ready       = false;
  var _lastApplied = null;

  // Applied layer counts (for debugSnapshot)
  var _appliedCounts = { labels: 0, roads: 0, water: 0, parks: 0, buildings: 0 };

  // ── Layer classifier ─────────────────────────────────────────────────────────
  function _classifyLayer(layer) {
    var id   = (layer.id || '').toLowerCase();
    var type = layer.type || '';

    // Buildings (fill-extrusion first — must not match road labels)
    if (type === 'fill-extrusion')          return 'buildings';
    if (id.indexOf('building') !== -1)      return 'buildings';

    // Labels (before roads — road-label must match here, not roads)
    if (id.indexOf('label')       !== -1)   return 'labels';
    if (id.indexOf('place-')      !== -1)   return 'labels';
    if (id.indexOf('settlement')  !== -1)   return 'labels';
    if (id.indexOf('country')     !== -1)   return 'labels';
    if (id.indexOf('state-')      !== -1)   return 'labels';
    if (id.indexOf('-poi')        !== -1)   return 'labels';
    if (id.indexOf('poi-')        !== -1)   return 'labels';

    // Water
    if (id.indexOf('water')  !== -1)        return 'water';
    if (id.indexOf('ocean')  !== -1)        return 'water';
    if (id.indexOf('lake')   !== -1)        return 'water';
    if (id.indexOf('bay')    !== -1)        return 'water';

    // Parks / landuse / nature
    if (id.indexOf('national-park') !== -1) return 'parks';
    if (id.indexOf('park')    !== -1)       return 'parks';
    if (id.indexOf('landuse') !== -1)       return 'parks';
    if (id.indexOf('natural') !== -1)       return 'parks';
    if (id.indexOf('grass')   !== -1)       return 'parks';
    if (id.indexOf('scrub')   !== -1)       return 'parks';
    if (id.indexOf('greenspace') !== -1)    return 'parks';
    if (id.indexOf('wood')    !== -1)       return 'parks';

    // Roads / transport
    if (id.indexOf('road')    !== -1)       return 'roads';
    if (id.indexOf('bridge')  !== -1)       return 'roads';
    if (id.indexOf('tunnel')  !== -1)       return 'roads';
    if (id.indexOf('ferry')   !== -1)       return 'roads';
    if (id.indexOf('transit') !== -1)       return 'roads';
    if (id.indexOf('motorway') !== -1)      return 'roads';
    if (id.indexOf('street')  !== -1)       return 'roads';
    if (id.indexOf('path')    !== -1)       return 'roads';

    return null;
  }

  // ── Style-ready guard ────────────────────────────────────────────────────────
  function _whenStyleReady(fn) {
    if (!_map || typeof fn !== 'function') return;
    try {
      if (_map.isStyleLoaded && _map.isStyleLoaded()) { fn(); return; }
    } catch (e) {}
    _map.once('styledata', function () {
      try {
        if (_map.isStyleLoaded && !_map.isStyleLoaded()) {
          _map.once('idle', fn);
        } else {
          fn();
        }
      } catch (e2) {
        _map.once('idle', fn);
      }
    });
  }

  // ── Apply layer options after style loads ─────────────────────────────────────
  function _applyLayerOptions(opts) {
    if (!_map || !_map.getStyle) return;
    try {
      if (_map.isStyleLoaded && !_map.isStyleLoaded()) return;
    } catch (e) {}
    var style = _map.getStyle();
    if (!style || !style.layers) return;

    var counts = { labels: 0, roads: 0, water: 0, parks: 0, buildings: 0 };

    style.layers.forEach(function (layer) {
      var cat = _classifyLayer(layer);
      if (!cat) return;

      var show;
      if (cat === 'labels')    show = opts.labels    !== false;
      if (cat === 'roads')     show = opts.roads     !== false;
      if (cat === 'water')     show = opts.water     !== false;
      if (cat === 'parks')     show = opts.parks     !== false;
      if (cat === 'buildings') show = opts.buildings !== false;

      try {
        _map.setLayoutProperty(layer.id, 'visibility', show ? 'visible' : 'none');
        if (show) counts[cat]++;

        // Building opacity
        if (cat === 'buildings' && show && layer.type === 'fill-extrusion') {
          var opacity = (opts.buildingOpacity != null) ? opts.buildingOpacity : 0.8;
          _map.setPaintProperty(layer.id, 'fill-extrusion-opacity', opacity);
        }
      } catch (e) {
        // Fail soft — layer may not support this property in this style
      }
    });

    _appliedCounts = counts;
  }

  // ── Actor overlay visibility (CSS toggle on map container) ───────────────────
  function _applyActorOverlay(show) {
    var mapEl = document.getElementById('tdcv-map');
    if (!mapEl) return;
    mapEl.classList.toggle('tdcv-map--actors-hidden', !show);
  }

  // ── Emit look-changed event ───────────────────────────────────────────────────
  function _emitLookChanged() {
    document.dispatchEvent(new CustomEvent('wos:map-look-changed', {
      detail: { lookKey: _activeLook, options: _options, source: 'studio-map-look-controller' }
    }));
  }

  // ── Apply a full look after style is ready ───────────────────────────────────
  function _applyLookPostLoad() {
    _whenStyleReady(function () { _applyLayerOptions(_options); });
    _applyActorOverlay(_options.actorOverlay !== false);

    // Remount custom layers (render layer + building replacement layer)
    if (_callbacks && _callbacks.onStyleReload) {
      try { _callbacks.onStyleReload(); } catch (e) {}
    }

    _lastApplied = new Date().toISOString();
    _emitLookChanged();

    // After map is fully idle, trigger location resync and UI refresh
    _map.once('idle', function () {
      if (_callbacks && _callbacks.onMapIdle) {
        try { _callbacks.onMapIdle(); } catch (e) {}
      }
      _emitLookChanged(); // second emit — UI can re-read fresh state
    });
  }

  // ── CSS look class on map wrap ────────────────────────────────────────────────
  function _applyLookClass(lookKey) {
    var wrapEl = document.getElementById('tdcv-wrap');
    if (!wrapEl) return;
    Object.keys(LOOKS).forEach(function (k) {
      wrapEl.classList.remove('studio-map-look--' + k.replace(/[^a-z0-9]/g, '-'));
    });
    wrapEl.classList.add('studio-map-look--' + lookKey.replace(/[^a-z0-9]/g, '-'));
  }

  // ── Update toolbar look dropdown ──────────────────────────────────────────────
  function _syncToolbarLookSel(lookKey) {
    var sel = document.getElementById('tdcv-look-sel');
    if (sel) sel.value = lookKey;
  }

  // ── Public: init ─────────────────────────────────────────────────────────────
  function init(map, opts) {
    _map       = map;
    _callbacks = opts || {};

    // Restore look from localStorage (preference only — never manifests)
    var saved = null;
    try { saved = localStorage.getItem(LS_KEY_LOOK); } catch (e) {}
    var startLook = (saved && LOOKS[saved]) ? saved : DEFAULT_LOOK;

    _activeLook = startLook;
    _options    = Object.assign({}, LOOKS[startLook].options);
    _ready      = true;

    // Apply initial style then options
    var baseStyle = _resolveBaseStyle(startLook);
    _applyLookClass(startLook);
    _syncToolbarLookSel(startLook);

    if (map.getStyle()) {
      // Style already loaded (map re-enter path). Check whether the loaded base style
      // matches the saved look — if not, switch it first then apply layer options.
      var currentStyleUrl = (map.getStyle().sprite || '').replace(/\/sprite.*$/, '');
      var targetStyleId   = baseStyle.replace('mapbox://styles/', '');
      var currentStyleId  = currentStyleUrl.replace('https://api.mapbox.com/styles/v1/', '');
      if (currentStyleId !== targetStyleId) {
        // Base style mismatch — switch then apply
        _map.setStyle(baseStyle);
        _map.once('styledata', function () { _applyLookPostLoad(); });
      } else {
        // Same base style — just apply layer options
        _applyLayerOptions(_options);
        _applyActorOverlay(_options.actorOverlay !== false);
        _lastApplied = new Date().toISOString();
        _emitLookChanged();
      }
    } else {
      map.once('load', function () {
        // 0619F: guard — do not replace the safe public style with a custom
        // StudioRich style until WOSMapboxAccessController confirms access.
        var access = global.WOSMapboxAccessController;
        if (access && !access.canUseCustomStyle(baseStyle)) {
          console.warn('[WOSMapLookController] custom style blocked — access not verified:', baseStyle);
          _applyLookPostLoad(); // apply layer options on current safe style only
          return;
        }
        _map.setStyle(baseStyle);
        _map.once('styledata', function () { _applyLookPostLoad(); });
      });
    }

    console.log('[WOSMapLookController] initialized | look:', startLook);
  }

  // ── Public: setLook ──────────────────────────────────────────────────────────
  function setLook(lookKey) {
    if (!LOOKS[lookKey]) {
      console.warn('[WOSMapLookController] unknown look:', lookKey);
      return { ok: false, reason: 'unknown_look' };
    }
    if (!_map) {
      // Pre-init path: save preference so init() picks it up from localStorage
      _activeLook = lookKey;
      _options    = Object.assign({}, LOOKS[lookKey].options);
      try { localStorage.setItem(LS_KEY_LOOK, lookKey); } catch (e) {}
      _emitLookChanged();
      return { ok: true, lookKey: lookKey, pending: true };
    }

    var prev  = _activeLook;
    _activeLook = lookKey;
    _options  = Object.assign({}, LOOKS[lookKey].options);

    // Persist preference
    try { localStorage.setItem(LS_KEY_LOOK, lookKey); } catch (e) {}

    _applyLookClass(lookKey);
    _syncToolbarLookSel(lookKey);

    var prevBase = _resolveBaseStyle(prev);
    var newBase  = _resolveBaseStyle(lookKey);

    if (prevBase !== newBase) {
      // Style switch — apply options after styledata
      // 0619F: guard custom styles until access controller confirms ready
      var access = global.WOSMapboxAccessController;
      if (access && !access.canUseCustomStyle(newBase)) {
        console.warn('[WOSMapLookController] setLook: custom style blocked — access not verified:', newBase);
        return { ok: false, reason: 'custom_style_access_not_verified', styleUrl: newBase };
      }
      _map.setStyle(newBase);
      _map.once('styledata', function () { _applyLookPostLoad(); });
    } else {
      // Same base style — apply layer options once style is confirmed ready
      _whenStyleReady(function () {
        _applyLayerOptions(_options);
        _applyActorOverlay(_options.actorOverlay !== false);
        _lastApplied = new Date().toISOString();
        _emitLookChanged();
        if (_callbacks && _callbacks.onMapIdle) {
          _map.once('idle', function () {
            try { _callbacks.onMapIdle(); } catch (e) {}
          });
        }
      });
    }
    return { ok: true, lookKey: lookKey };
  }

  // ── Public: setOption ────────────────────────────────────────────────────────
  // Override a single option on the active look (does not switch look)
  function setOption(key, value) {
    if (!_options) return;
    _options[key] = value;
    if (!_map) return;
    if (key === 'actorOverlay') {
      _applyActorOverlay(value !== false);
      _lastApplied = new Date().toISOString();
      _emitLookChanged();
    } else {
      _whenStyleReady(function () {
        _applyLayerOptions(_options);
        _lastApplied = new Date().toISOString();
        _emitLookChanged();
      });
    }
  }

  function getLook()     { return _activeLook; }
  function getOptions()  { return _options ? Object.assign({}, _options) : {}; }
  function listLooks()   {
    return Object.keys(LOOKS).map(function (k) {
      return { key: k, label: LOOKS[k].label, styleIntent: LOOKS[k].styleIntent, resolvedStyle: _resolveBaseStyle(k) };
    });
  }

  function reset() {
    if (!_activeLook || !LOOKS[_activeLook]) return;
    _options = Object.assign({}, LOOKS[_activeLook].options);
    if (_map) {
      _whenStyleReady(function () {
        _applyLayerOptions(_options);
        _applyActorOverlay(_options.actorOverlay !== false);
        _lastApplied = new Date().toISOString();
        _emitLookChanged();
      });
    } else {
      _emitLookChanged();
    }
  }

  function debugSnapshot() {
    return {
      ready:              _ready,
      activeLook:         _activeLook,
      resolvedStyle:      LOOKS[_activeLook] ? _resolveBaseStyle(_activeLook) : null,
      styleIntent:        LOOKS[_activeLook] ? LOOKS[_activeLook].styleIntent : null,
      options:            _options ? Object.assign({}, _options) : {},
      appliedLayerCounts: Object.assign({}, _appliedCounts),
      lastAppliedAt:      _lastApplied,
    };
  }

  global.WOSMapLookController = {
    init:          init,
    setLook:       setLook,
    getLook:       getLook,
    listLooks:     listLooks,
    setOption:     setOption,
    getOptions:    getOptions,
    reset:         reset,
    debugSnapshot: debugSnapshot,
  };
  console.log('[WOSMapLookController] ready');
})(window);
