// ── MapLab — Mapbox Adapter v1.13.2 ───────────────────────────────────────────
// 0610O_WOS_MapLabAuthorCueIsolation_v1.0.0_BUILD
// Prior: 0610N_WOS_MapboxStyleParityAudit_v1.0.0_BUILD
// Prior: 0610H_WOS_ReplacementSingleVisualAuthority_v1.0.0_BUILD
// Prior: 0609U_WOS_BuildingReplacementProjection
// Status: active | Classification: studio-maplab
//
// v1.13.2 — Extrusion height suppression patch (0611D): fill-extrusion-color alpha
//            renders black (0611C audit). Replace color suppression on fill-extrusion
//            with height/base suppression: ['match',['id'],id,0,...,originalHeight].
//            Zero height collapses geometry to ground plane — no rendered pixels.
//            _snapshotLayerPaint() now captures fill-extrusion-height/base.
//            _restoreOriginalBuildingPaint() restores height/base for fill-extrusion.
//            authorSuppressionStatus().sourcePaintMutationType → 'extrusion-height-suppression'.
// v1.13.1 — Extrusion color suppression patch (0611B): fill-extrusion-opacity is
//            not data-driven in Mapbox GL JS — match expressions on it silently
//            fall back to originalOpacity for every feature. _applyHiddenSourceSuppression()
//            now writes fill-extrusion-color with rgba(0,0,0,0) for hidden IDs on
//            fill-extrusion layers; fill-opacity opacity path unchanged for fill layers.
//            _hiddenSuppressionColorLayers tracks which layers used this path.
//            authorSuppressionStatus().sourcePaintMutationType reports
//            'extrusion-color-suppression' when active.
// v1.11.0 — Author cue isolation (0610O): applyRegistryEdits() no longer
//            projects replacement archetype/custom colours onto source buildings.
//            Registry edits are data; Mapbox source paint is not an authoring
//            canvas. setSelectionColor() stores editColor on the feature object
//            only — no paint mutation. _restoreOriginalBuildingPaint() helper
//            shared by applyRegistryEdits / clearSelectionColor /
//            clearRegistryProjection. Outline layer updated: idle colour is now
//            transparent (rgba(0,0,0,0)), selected/hover widths 3/2.
//            styleParityStatus() extended with authorCueMode/sourcePaintProjectionEnabled.
// v1.10.0 — Style parity (0610N): snapshot original paint on discovery; do NOT
//            rewrite Mapbox Studio building color/opacity on load; use snapshot
//            as fallback in color expressions so unedited buildings keep their
//            Studio colour; clearRegistryProjection() restores from snapshot
//            instead of WOS defaults. Adds styleParityStatus() debug method.
// v1.9.0 — clearRegistryProjection(): removes author cue paint without touching
//           the registry or localStorage; used by BuildingPreviewRuntime to clear
//           cue state when switching to Preview mode. Version bump.
// v1.8.0 — applyRegistryEdits(): replacement.enabled cue overrides simple color;
//           ARCHETYPE_COLORS shared constant. Version bump.
// v1.7.0 — applyRegistryEdits(): restore persisted colors from BuildingEditRegistry.
// v1.6.0 — restore dark-v11 as default; WOS style available via setStyle("wos");
//           5-second fallback from wos→dark if not loaded; status shows style key.
// v1.5.0 — WOS presentation style default; _resolveStyle(); camera sync.
// v1.4.1 — fix getStatus() safe getStyle(); wrap in try/catch.
// v1.4.0 — outline layer, status snapshot, getStatus().
// v1.3.0 — type-branched highlight, hover feature state, per-feature color.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  // ── Access token — resolved at runtime from wall/mapbox-env.js global ───
  // Set VITE_MAPBOX_TOKEN in wall-of-sound/.env.local and copy
  // wall/mapbox-env.template.js → wall/mapbox-env.js to populate the global.
  var ACCESS_TOKEN =
    (global.SBE && global.SBE.MapboxToken) || global.MAPBOX_TOKEN || "";
  if (!ACCESS_TOKEN) {
    console.warn("[MapboxAdapter] Mapbox token missing — set VITE_MAPBOX_TOKEN in wall-of-sound/.env.local");
  }

  // Style URLs — source of truth: wall/runtimes/mapboxViewportRuntime.js STYLES.*
  // Not re-exported by that runtime; duplicated here with a comment reference.
  var STYLE_PRESENTATION = 'mapbox://styles/studiorich/cm3goyx23003901qkb60ff29p';
  var STYLE_OPERATOR     = 'mapbox://styles/mapbox/dark-v11';

  var DEFAULT_CENTER  = [-74.0165, 40.7015];
  var DEFAULT_ZOOM    = 12.8;
  var DEFAULT_PITCH   = 30;
  var DEFAULT_BEARING = -12;

  // Colors
  var COL_DEFAULT  = '#8899aa'; // unselected fill building (more visible than original dark)
  var COL_HOVER    = '#c8d8e8'; // hover
  var COL_SELECTED = '#3dd8c5'; // selected teal

  // ── Archetype projection colors ───────────────────────────────────────────────
  // Shared with Wall projection runtime (mirrored in buildingEditProjectionRuntime.js).
  var ARCHETYPE_COLORS = {
    'warehouse':          '#f2a23c',
    'skyscraper':         '#3dd8c5',
    'apartment':          '#a7c7e7',
    'radio-tower':        '#ff4b4b',
    'pagoda':             '#d85cff',
    'civic-block':        '#f5d76e',
    'industrial-stack':   '#8d6e63',
    'custom-placeholder': '#ffffff',
  };

  var _map         = null;
  var _debug       = false;
  var _activeStyleKey = 'dark'; // 'dark' | 'wos'
  var _styleTimer  = null;      // fallback timer when WOS style is pending
  var _state = { initialized: false, containerId: null, buildingLayers: [], lastError: null };

  // Highlight/hover state
  var _highlightedFeature = null; // { id, source, sourceLayer, layerId, layerType }
  var _hoveredFeature     = null; // { id, source, sourceLayer, layerId }

  // Per-feature color overrides (memory only): featureId → hex
  var _selectionColorMap = {};

  // 0610N: original paint snapshots and mutation tracking
  // Snapshots are captured in discoverBuildingLayers() before any WOS mutation.
  // _originalPaintSnapshots: layerId → { colorProp, opacityProp, originalColor, originalOpacity }
  // _wosMutatedLayers:       layerId → true  (style-owned layers WOS has mutated)
  var _originalPaintSnapshots = {};
  var _wosMutatedLayers       = {};
  var _lastParityError        = null;

  // 0610P/0611F: hidden source suppression state (author mode only)
  // _hiddenSourceIds:                featureId → true  (Phase 1 seed IDs from registry keys)
  // _hiddenSuppressionFallbackLayers: layerId  → true  (opacity failed; color fallback used)
  // _lastAuthorManifest:             { buildings, groups, compounds } — latest manifest from
  //                                  applyRegistryEdits(); used for live requery at paint time
  var _hiddenSourceIds                = {};
  var _hiddenSuppressionFallbackLayers = {};
  var _lastAuthorManifest             = null;  // 0611F

  function _mbgl() { return global.mapboxgl || null; }

  function _styleUrl(key) {
    return key === 'wos' ? STYLE_PRESENTATION : STYLE_OPERATOR;
  }

  // ── Map lifecycle ─────────────────────────────────────────────────────────────

  function init(containerId, options) {
    var mb = _mbgl();
    if (!mb)  { _state.lastError = 'mapboxgl_not_loaded';  return { ok: false, reason: 'mapboxgl_not_loaded' }; }
    if (_map) { _state.lastError = 'already_initialized';  return { ok: false, reason: 'already_initialized' }; }
    var el = global.document.getElementById(containerId);
    if (!el)  { _state.lastError = 'container_not_found:' + containerId; return { ok: false, reason: 'container_not_found' }; }

    mb.accessToken = ACCESS_TOKEN;
    options = options || {};
    try {
      // 0612Q: resolve initial style from WOSMapStyleAuthority so Studio matches Wall.
      // Authority reads from localStorage — Wall writes its current profile there on boot.
      // Fallback: dark-v11 (old behaviour) if authority is not yet loaded.
      var wsa = global.SBE && global.SBE.WOSMapStyleAuthority;
      var authorityUrl = (wsa && typeof wsa.getMapboxStyle === 'function') ? wsa.getMapboxStyle() : null;
      var activeStyleUrl = options.style || authorityUrl || STYLE_OPERATOR;
      _activeStyleKey = (activeStyleUrl === STYLE_PRESENTATION) ? 'wos' : 'dark';
      _map = new mb.Map({
        container: containerId,
        style:     activeStyleUrl,
        center:    options.center  || DEFAULT_CENTER,
        zoom:      options.zoom    || DEFAULT_ZOOM,
        pitch:     options.pitch   || DEFAULT_PITCH,
        bearing:   options.bearing || DEFAULT_BEARING,
        antialias: true,
      });
      console.log('[MapboxAdapter] map created with style:', _activeStyleKey, '(' + activeStyleUrl + ')',
        authorityUrl ? '← WOSMapStyleAuthority' : '← fallback');
      _state.containerId    = containerId;
      _state.initialized    = true;
      _state.buildingLayers = [];
      _state.lastError      = null;
      // 0612Q: register Studio Map Lab as consumer of WOSMapStyleAuthority
      if (wsa && typeof wsa.registerConsumer === 'function') {
        wsa.registerConsumer('studioMapLab',
          function () { return _map; },
          function () { return _activeStyleKey === 'wos' ? STYLE_PRESENTATION : STYLE_OPERATOR; }
        );
      }
      return { ok: true, map: _map };
    } catch (e) {
      _state.lastError = String(e && e.message || e);
      return { ok: false, reason: _state.lastError };
    }
  }

  function destroy() {
    if (!_map) return { ok: false, reason: 'not_initialized' };
    if (_styleTimer) { clearTimeout(_styleTimer); _styleTimer = null; }
    try { _map.remove(); } catch (e) {}
    _map = null;
    _highlightedFeature     = null;
    _hoveredFeature         = null;
    _selectionColorMap               = {};
    _originalPaintSnapshots          = {};   // 0610N
    _wosMutatedLayers                = {};   // 0610N
    _lastParityError                 = null; // 0610N
    _hiddenSourceIds                 = {};   // 0610P
    _hiddenSuppressionFallbackLayers = {};   // 0610P
    _hiddenSuppressionColorLayers    = {};   // 0611B
    _lastAuthorManifest              = null; // 0611F
    _liveRequeryIds                  = {};   // 0611F
    _activeStyleKey         = 'dark';
    _state.initialized    = false;
    _state.buildingLayers = [];
    return { ok: true };
  }

  function resize() { if (_map) try { _map.resize(); } catch (e) {} }
  function getMap()  { return _map; }
  function isReady() { return !!_map; }

  // setStyle('dark' | 'wos') — switch active style.
  // When switching to 'wos', starts a 5-second timer: if style is not loaded by
  // then, automatically falls back to 'dark'.
  function setStyle(nameOrKey) {
    if (!_map) return { ok: false, reason: 'not_initialized' };
    var key = (nameOrKey === 'wos') ? 'wos' : 'dark';
    var url = _styleUrl(key);
    if (_styleTimer) { clearTimeout(_styleTimer); _styleTimer = null; }
    try {
      _activeStyleKey                  = key;
      _state.buildingLayers            = []; // layers invalidated on style change
      _originalPaintSnapshots          = {}; // 0610N: old snapshots are invalid on style change
      _wosMutatedLayers                = {}; // 0610N
      _hiddenSourceIds                 = {}; // 0610P
      _hiddenSuppressionFallbackLayers = {}; // 0610P
      _hiddenSuppressionColorLayers    = {}; // 0611B
      _lastAuthorManifest              = null; // 0611F
      _liveRequeryIds                  = {};   // 0611F
      _map.setStyle(url);
      console.log('[MapboxAdapter] setStyle:', key, url);
      if (key === 'wos') {
        _styleTimer = setTimeout(function () {
          _styleTimer = null;
          if (_activeStyleKey !== 'wos') return;
          var loaded = false;
          try { loaded = !!_map && _map.isStyleLoaded(); } catch (e) {}
          if (!loaded) {
            console.warn('[MapboxAdapter] WOS style not loaded after 5s — falling back to dark');
            _activeStyleKey = 'dark';
            try { _map.setStyle(STYLE_OPERATOR); } catch (e) {}
          }
        }, 5000);
      }
      return { ok: true, styleKey: key, url: url };
    } catch (e) {
      console.warn('[MapboxAdapter] setStyle failed:', e.message || e);
      return { ok: false, reason: String(e.message || e) };
    }
  }

  function getActiveStyleKey() { return _activeStyleKey; }

  // ── Layer type helpers ────────────────────────────────────────────────────────

  // Returns 'fill-extrusion' | 'fill' | null for a given layer id
  function _layerType(layerId) {
    for (var i = 0; i < _state.buildingLayers.length; i++) {
      if (_state.buildingLayers[i].id === layerId) return _state.buildingLayers[i].type;
    }
    if (!_map) return null;
    try {
      var style = _map.getStyle();
      var layers = style && style.layers || [];
      for (var j = 0; j < layers.length; j++) {
        if (layers[j].id === layerId) return layers[j].type;
      }
    } catch (e) {}
    return null;
  }

  // Paint property names for a given layer type
  function _paintProps(type) {
    if (type === 'fill-extrusion') {
      return { color: 'fill-extrusion-color', opacity: 'fill-extrusion-opacity' };
    }
    return { color: 'fill-color', opacity: 'fill-opacity' };
  }

  // ── Building layer discovery ──────────────────────────────────────────────────

  function discoverBuildingLayers() {
    if (!_map) return [];
    var style = null;
    try { style = _map.getStyle(); } catch (e) { return []; }
    if (!style || !style.layers) return [];
    var found = style.layers.filter(function (l) {
      if (l.type === 'fill-extrusion') return true;
      if (/building/i.test(l.id || '')) return true;
      if (/building/i.test(l['source-layer'] || '')) return true;
      return false;
    }).map(function (l) {
      return { id: l.id, type: l.type, source: l.source, sourceLayer: l['source-layer'] };
    });
    _state.buildingLayers = found;

    // 0610N: snapshot original Mapbox Studio paint BEFORE any WOS mutation.
    // Captured once per layer per style; subsequent calls skip layers already snapshotted.
    found.forEach(function (l) {
      if (!_originalPaintSnapshots[l.id]) {
        var snap = _snapshotLayerPaint(l.id, l.type);
        if (snap) _originalPaintSnapshots[l.id] = snap;
      }
    });

    // 0610N: only apply WOS paint expressions when color overrides are already active.
    // On initial load with no edits, Mapbox Studio style is the visual authority.
    var overrideIds = Object.keys(_selectionColorMap);
    if (overrideIds.length) {
      found.forEach(function (l) { _applyLayerPaint(l.id, l.type); });
    }

    console.log('[MapboxAdapter] building layers discovered:', found.map(function (l) { return l.id + '(' + l.type + ')'; }));
    return found;
  }

  function getBuildingLayers() { return _state.buildingLayers.slice(); }

  // ── Paint expression management ───────────────────────────────────────────────

  // _buildColorExpr — build a color expression for a building layer.
  // fallbackColor: base color for unedited/unselected buildings.
  //   For style-owned layers: pass the snapshot's originalColor so Mapbox Studio
  //   colour is preserved for all buildings not covered by overrideIds.
  //   For WOS-created layers: COL_DEFAULT is used when no fallback is supplied.
  function _buildColorExpr(overrideIds, fallbackColor) {
    var fb = fallbackColor !== undefined ? fallbackColor : COL_DEFAULT;
    var stateCascade = [
      'case',
      ['boolean', ['feature-state', 'selected'], false], COL_SELECTED,
      ['boolean', ['feature-state', 'hovered'],  false], COL_HOVER,
      fb,
    ];
    if (!overrideIds || !overrideIds.length) return stateCascade;
    var matchArgs = ['match', ['id']];
    overrideIds.forEach(function (idStr) {
      var numId = Number(idStr);
      matchArgs.push(isNaN(numId) ? idStr : numId);
      matchArgs.push(_selectionColorMap[idStr]);
    });
    matchArgs.push(stateCascade);
    return matchArgs;
  }

  function _buildOpacityExpr(type) {
    if (type === 'fill-extrusion') {
      return 0.85;
    }
    return [
      'case',
      ['boolean', ['feature-state', 'selected'], false], 0.95,
      ['boolean', ['feature-state', 'hovered'],  false], 0.75,
      0.55,
    ];
  }

  // _snapshotLayerPaint — capture original paint from the current style definition.
  // Returns a snapshot object, or null on failure.
  // Must be called before any setPaintProperty mutation on the layer.
  function _snapshotLayerPaint(layerId, type) {
    if (!_map || !layerId) return null;
    var resolvedType = type || _layerType(layerId) || 'fill';
    var props        = _paintProps(resolvedType);
    var colorVal     = null;
    var opacityVal   = null;
    var heightVal    = null;  // 0611D: fill-extrusion only
    var baseVal      = null;  // 0611D: fill-extrusion only
    try {
      var style  = _map.getStyle();
      var layers = (style && style.layers) || [];
      for (var i = 0; i < layers.length; i++) {
        if (layers[i].id === layerId) {
          var paint  = layers[i].paint || {};
          colorVal   = paint[props.color]   !== undefined ? paint[props.color]   : null;
          opacityVal = paint[props.opacity] !== undefined ? paint[props.opacity] : null;
          // 0611D: snapshot height/base for fill-extrusion so they can be restored exactly
          if (resolvedType === 'fill-extrusion') {
            heightVal = paint['fill-extrusion-height'] !== undefined ? paint['fill-extrusion-height'] : null;
            baseVal   = paint['fill-extrusion-base']   !== undefined ? paint['fill-extrusion-base']   : null;
          }
          break;
        }
      }
    } catch (e) { _lastParityError = String(e && e.message || e); }
    return {
      colorProp:        props.color,
      opacityProp:      props.opacity,
      originalColor:    colorVal,
      originalOpacity:  opacityVal,
      originalHeight:   heightVal,  // 0611D
      originalBase:     baseVal,    // 0611D
    };
  }

  function _applyLayerPaint(layerId, type) {
    if (!_map || !layerId) return;
    var resolvedType = type || _layerType(layerId) || 'fill';
    var props        = _paintProps(resolvedType);
    var overrideIds  = Object.keys(_selectionColorMap);
    var snap         = _originalPaintSnapshots[layerId];

    // 0610N: if no authored overrides exist AND we have a snapshot of the original
    // Mapbox Studio paint, leave the layer untouched — Studio is the colour authority.
    if (!overrideIds.length && snap) return;

    // Use snapshot colour as the base fallback so unedited buildings keep their
    // Mapbox Studio colour rather than being repainted with COL_DEFAULT (#8899aa).
    var fallback = (snap && snap.originalColor !== null) ? snap.originalColor : COL_DEFAULT;
    try {
      _map.setPaintProperty(layerId, props.color, _buildColorExpr(overrideIds, fallback));
      _wosMutatedLayers[layerId] = true;  // 0610N: track mutation
    } catch (e) {
      _lastParityError = String(e && e.message || e);
      console.warn('[MapboxAdapter] _applyLayerPaint color failed on ' + layerId + ':', e.message || e);
    }

    // Opacity: only set on non-fill-extrusion layers (original behaviour).
    // 0610N: additionally skip if we have a snapshot (style-owned layer) to avoid
    // overriding Mapbox Studio opacity settings.
    if (resolvedType !== 'fill-extrusion' && !snap) {
      try {
        _map.setPaintProperty(layerId, props.opacity, _buildOpacityExpr(resolvedType));
        _wosMutatedLayers[layerId] = true;  // 0610N
      } catch (e) {
        console.warn('[MapboxAdapter] _applyLayerPaint opacity failed on ' + layerId + ':', e.message || e);
      }
    }
  }

  function _primaryBuildingLayer() {
    var extr = _state.buildingLayers.filter(function(l){ return l.type === 'fill-extrusion'; });
    return extr.length ? extr[0] : (_state.buildingLayers[0] || null);
  }

  // ── Feature querying ──────────────────────────────────────────────────────────

  var _lastQuery = { point: null, layers: [], count: 0, buildingCount: 0 };

  function queryPoint(point, targetLayers) {
    if (!_map) return [];
    if (!_state.buildingLayers.length) {
      var _sh = false;
      try { var _sty = _map.getStyle(); _sh = !!(_sty && _sty.layers && _sty.layers.length); } catch(e){}
      if (_sh) discoverBuildingLayers();
    }
    var layers = targetLayers && targetLayers.length ? targetLayers
      : _state.buildingLayers.map(function (l) { return l.id; });
    try {
      var features = _map.queryRenderedFeatures(point, layers.length ? { layers: layers } : undefined) || [];
      if (!features.length && layers.length) {
        var all = _map.queryRenderedFeatures(point) || [];
        features = all.filter(function (f) {
          var sl = f.sourceLayer || (f.layer && f.layer['source-layer']) || '';
          return /building/i.test(sl) || /building/i.test((f.layer && f.layer.id) || '');
        });
      }
      var bCount = features.filter(function (f) {
        return f.layer && (f.layer.type === 'fill-extrusion' || /building/i.test(f.layer.id || '') || /building/i.test(f.sourceLayer || ''));
      }).length;
      _lastQuery = { point: point, layers: layers, count: features.length, buildingCount: bCount };
      return features;
    } catch (e) { return []; }
  }

  // ── Hover feature state ───────────────────────────────────────────────────────

  function setHoverFeature(feature) {
    if (!_map) return;
    if (_hoveredFeature) _clearFeatureHover(_hoveredFeature);
    if (!feature || feature.id == null || !feature.source) { _hoveredFeature = null; return; }
    try {
      _map.setFeatureState(
        { source: feature.source, sourceLayer: feature.sourceLayer || undefined, id: feature.id },
        { hovered: true }
      );
      _hoveredFeature = { id: feature.id, source: feature.source, sourceLayer: feature.sourceLayer,
                          layerId: feature.layer && feature.layer.id };
    } catch (e) { _hoveredFeature = null; }
  }

  function clearHover() {
    if (!_map || !_hoveredFeature) return;
    _clearFeatureHover(_hoveredFeature);
    _hoveredFeature = null;
  }

  function _clearFeatureHover(hf) {
    try {
      _map.setFeatureState(
        { source: hf.source, sourceLayer: hf.sourceLayer || undefined, id: hf.id },
        { hovered: false }
      );
    } catch (e) {}
  }

  // ── Selection highlight ───────────────────────────────────────────────────────

  function highlightFeature(feature) {
    if (!_map || !feature) return;
    clearHighlight();
    if (feature.id == null || !feature.source) return;
    var layerId   = feature.layer && feature.layer.id;
    var layerType = feature.layer && feature.layer.type;
    try {
      _map.setFeatureState(
        { source: feature.source, sourceLayer: feature.sourceLayer || undefined, id: feature.id },
        { selected: true }
      );
      _highlightedFeature = {
        id: feature.id, source: feature.source, sourceLayer: feature.sourceLayer,
        layerId: layerId, layerType: layerType,
      };
    } catch (e) {
      if (_debug) console.warn('[MapboxAdapter] highlightFeature setFeatureState failed:', e);
    }
  }

  function clearHighlight() {
    if (!_map || !_highlightedFeature) return;
    try {
      _map.setFeatureState(
        { source: _highlightedFeature.source, sourceLayer: _highlightedFeature.sourceLayer || undefined, id: _highlightedFeature.id },
        { selected: false }
      );
    } catch (e) {}
    _highlightedFeature = null;
  }

  // ── Per-feature color override ────────────────────────────────────────────────

  // ── Author mode hidden source suppression (0610P/0610Q) ─────────────────────
  //
  // Strategy (0610Q): footprint-aware, group-aware, compound-aware suppression.
  // Phase 1  — direct feature IDs from hidden:true building keys
  // Phase 2  — footprint bbox query for rendered parts / duplicates
  // Phase 3  — group member expansion
  // Phase 4  — compound member expansion (including nested groups)
  // Phase 5  — apply per-layer opacity expression
  // Phase 6  — fallback: color transparency when opacity fails
  //
  // _authorSuppressionState holds the last computed suppression audit snapshot
  // for authorSuppressionStatus() debug output.
  var _authorSuppressionState = null;

  // _idFromBuildingKey — extracts numeric or string feature ID from a building key.
  // Key format: "<source>:<sourceLayer>:<featureId>"
  function _idFromBuildingKey(key) {
    if (!key || typeof key !== 'string') return null;
    var parts = key.split(':');
    var raw   = parts[parts.length - 1];
    var num   = Number(raw);
    return isNaN(num) ? raw : num;
  }

  // _addFeatureIdToSet — parses id and inserts string representation into set obj.
  function _addFeatureIdToSet(id, set) {
    if (id == null) return;
    set[String(id)] = true;
  }

  // _queryFootprintFeatureIds — query rendered building features inside a geometry
  // bounds bbox, converted to screen pixel coordinates via map.project().
  // Returns a plain { idStr: true } object. Safe when map not loaded.
  function _queryFootprintFeatureIds(geometry, layerIds) {
    var out = {};
    if (!_map || !geometry || !geometry.bounds) return out;
    try {
      var b  = geometry.bounds;
      var sw = _map.project([b.minLng, b.minLat]);
      var ne = _map.project([b.maxLng, b.maxLat]);
      var opts = layerIds && layerIds.length ? { layers: layerIds } : {};
      var feats = _map.queryRenderedFeatures([
        [Math.min(sw.x, ne.x), Math.min(sw.y, ne.y)],
        [Math.max(sw.x, ne.x), Math.max(sw.y, ne.y)],
      ], opts) || [];
      feats.forEach(function (f) {
        if (f.id != null) _addFeatureIdToSet(f.id, out);
      });
    } catch (e) {
      _lastParityError = String(e && e.message || e);
    }
    return out;
  }

  // _collectAuthorHiddenSuppressionTargets — builds the full suppression id set.
  // Returns an audit object so callers can report counts.
  function _collectAuthorHiddenSuppressionTargets(manifest) {
    var buildings = (manifest && manifest.buildings) || {};
    var groups    = (manifest && manifest.groups)    || {};
    var compounds = (manifest && manifest.compounds) || {};
    var layerIds  = _state.buildingLayers.map(function (l) { return l.id; });

    var directIds       = {};
    var footprintIds    = {};
    var groupIds        = {};
    var compoundIds     = {};
    var geometryMissing = 0;

    // Phase 1 — direct hidden building keys
    var hiddenBuildingKeys = {};
    Object.keys(buildings).forEach(function (key) {
      var edit = buildings[key];
      if (!edit || edit.hidden !== true) return;
      var id = _idFromBuildingKey(key);
      if (id != null) _addFeatureIdToSet(id, directIds);
      hiddenBuildingKeys[key] = true;

      // Phase 2 — footprint query
      if (edit.geometry && edit.geometry.bounds) {
        var fps = _queryFootprintFeatureIds(edit.geometry, layerIds);
        Object.keys(fps).forEach(function (fid) { footprintIds[fid] = true; });
      } else {
        geometryMissing++;
      }
    });

    // Phase 3 — group member expansion:
    // Suppress all members of any group where at least one direct member is hidden,
    // or where the group itself has a replacement (which implies source suppression).
    Object.keys(groups).forEach(function (gid) {
      var grp = groups[gid];
      if (!grp || !Array.isArray(grp.members)) return;
      var shouldSuppress = false;
      // check if any member building is directly hidden
      grp.members.forEach(function (mk) {
        if (hiddenBuildingKeys[mk]) shouldSuppress = true;
      });
      if (!shouldSuppress) return;

      grp.members.forEach(function (mk) {
        var id = _idFromBuildingKey(mk);
        if (id != null) _addFeatureIdToSet(id, groupIds);
      });
      // footprint query for the group's combined geometry
      if (grp.geometry && grp.geometry.bounds) {
        var fps = _queryFootprintFeatureIds(grp.geometry, layerIds);
        Object.keys(fps).forEach(function (fid) { groupIds[fid] = true; });
      }
    });

    // Phase 4 — compound member expansion:
    // Suppress all members of any compound where at least one member is a hidden
    // building or a group that was expanded above.
    var suppressedGroupIds = {};
    Object.keys(groups).forEach(function (gid) {
      var grp = groups[gid];
      if (!grp || !Array.isArray(grp.members)) return;
      grp.members.forEach(function (mk) {
        if (hiddenBuildingKeys[mk]) suppressedGroupIds[gid] = true;
      });
    });

    Object.keys(compounds).forEach(function (cid) {
      var cmp = compounds[cid];
      if (!cmp || !Array.isArray(cmp.members)) return;
      var shouldSuppress = false;
      cmp.members.forEach(function (m) {
        if (hiddenBuildingKeys[m] || suppressedGroupIds[m]) shouldSuppress = true;
      });
      if (!shouldSuppress) return;

      cmp.members.forEach(function (m) {
        // m may be a building key or a group id
        var buildingId = _idFromBuildingKey(m);
        if (buildingId != null) {
          _addFeatureIdToSet(buildingId, compoundIds);
        } else {
          // treat as group id
          var grp = groups[m];
          if (grp && Array.isArray(grp.members)) {
            grp.members.forEach(function (mk) {
              var id = _idFromBuildingKey(mk);
              if (id != null) _addFeatureIdToSet(id, compoundIds);
            });
          }
        }
      });
      // compound geometry footprint
      if (cmp.geometry && cmp.geometry.bounds) {
        var fps = _queryFootprintFeatureIds(cmp.geometry, layerIds);
        Object.keys(fps).forEach(function (fid) { compoundIds[fid] = true; });
      }
    });

    // Merge all sets into one deduped suppression map
    var allIds = {};
    [directIds, footprintIds, groupIds, compoundIds].forEach(function (src) {
      Object.keys(src).forEach(function (id) { allIds[id] = true; });
    });

    return {
      ids:                 allIds,
      directIdCount:       Object.keys(directIds).length,
      footprintIdCount:    Object.keys(footprintIds).length,
      groupIdCount:        Object.keys(groupIds).length,
      compoundIdCount:     Object.keys(compoundIds).length,
      geometryMissingCount: geometryMissing,
      hiddenSourceCount:   Object.keys(hiddenBuildingKeys).length,
    };
  }

  // _buildHiddenOpacityExpr — match expression: opacity 0 for suppressed ids,
  // originalOpacity fallback for all other features.
  function _buildHiddenOpacityExpr(hiddenIds, originalOpacity) {
    var ids      = Object.keys(hiddenIds || {});
    var fallback = (originalOpacity !== null && originalOpacity !== undefined) ? originalOpacity : 1;
    if (!ids.length) return fallback;
    var expr = ['match', ['id']];
    ids.forEach(function (idStr) {
      var num = Number(idStr);
      expr.push(isNaN(num) ? idStr : num);
      expr.push(0);
    });
    expr.push(fallback);
    return expr;
  }

  // _buildHiddenColorFallbackExpr — transparent for suppressed ids; used only when
  // opacity mutation fails.
  function _buildHiddenColorFallbackExpr(hiddenIds, originalColor) {
    var ids      = Object.keys(hiddenIds || {});
    var fallback = (originalColor !== null && originalColor !== undefined) ? originalColor : COL_DEFAULT;
    if (!ids.length) return fallback;
    var expr = ['match', ['id']];
    ids.forEach(function (idStr) {
      var num = Number(idStr);
      expr.push(isNaN(num) ? idStr : num);
      expr.push('rgba(0,0,0,0)');
    });
    expr.push(fallback);
    return expr;
  }

  // _buildHiddenHeightExpr — match expression: height 0 for suppressed ids,
  // original height fallback for all other features.
  // A fill-extrusion with height 0 produces no rendered geometry.
  function _buildHiddenHeightExpr(hiddenIds, originalHeight) {
    var ids      = Object.keys(hiddenIds || {});
    // Fallback: use snapshot value, or the Mapbox source property, or 0 (flat).
    // Casting to the source property via ['get','render_height'] is common in
    // Mapbox building styles; use the snapshot value if present.
    var fallback = (originalHeight !== null && originalHeight !== undefined) ? originalHeight : 0;
    if (!ids.length) return fallback;
    var expr = ['match', ['id']];
    ids.forEach(function (idStr) {
      var num = Number(idStr);
      expr.push(isNaN(num) ? idStr : num);
      expr.push(0);
    });
    expr.push(fallback);
    return expr;
  }

  // _buildHiddenBaseExpr — match expression: base 0 for suppressed ids,
  // original base fallback for all other features.
  // Collapsing both height and base to 0 ensures no residual ground-plane quad.
  function _buildHiddenBaseExpr(hiddenIds, originalBase) {
    var ids      = Object.keys(hiddenIds || {});
    var fallback = (originalBase !== null && originalBase !== undefined) ? originalBase : 0;
    if (!ids.length) return fallback;
    var expr = ['match', ['id']];
    ids.forEach(function (idStr) {
      var num = Number(idStr);
      expr.push(isNaN(num) ? idStr : num);
      expr.push(0);
    });
    expr.push(fallback);
    return expr;
  }

  // _hiddenSuppressionColorLayers — layerId → true when height suppression was applied
  // (reused as a generic "suppression active" flag for fill-extrusion layers).
  var _hiddenSuppressionColorLayers = {};

  // _liveRequeryIds — the live-expanded id set produced at paint time by
  // _applyHiddenSourceSuppression(); reported by authorSuppressionStatus().
  var _liveRequeryIds = {};

  // _applyHiddenSourceSuppression — 0611F: live requery at paint time.
  //
  // _hiddenSourceIds (Phase 1) is the seed from _collectAuthorHiddenSuppressionTargets.
  // It is collected when applyRegistryEdits() is called and may be incomplete if
  // queryRenderedFeatures ran before all tiles were loaded.
  //
  // This function re-runs footprint/group/compound bbox queries immediately before
  // building paint expressions, merging any newly-visible feature IDs into the
  // suppression set. The merged set is used for all expressions on every layer.
  //
  // 0611D: fill-extrusion-opacity is not data-driven → use height=0 for extrusion layers.
  // 0611B: fill-extrusion-color alpha renders black → color path kept only as fill fallback.
  function _applyHiddenSourceSuppression() {
    if (!_map) return;
    _hiddenSuppressionFallbackLayers = {};
    _hiddenSuppressionColorLayers    = {};

    // ── Phase 1: seed IDs from registry collection ────────────────────────────
    var seedIds = _hiddenSourceIds || {};
    if (!Object.keys(seedIds).length) {
      // Nothing hidden — restore already done by _restoreOriginalBuildingPaint.
      _liveRequeryIds = {};
      return;
    }

    // ── Phase 2: live requery — expand with any newly-rendered feature IDs ────
    var layerIds  = _state.buildingLayers.map(function (l) { return l.id; });
    var liveIds   = {};
    // Copy seed
    Object.keys(seedIds).forEach(function (id) { liveIds[id] = true; });

    var manifest   = _lastAuthorManifest || { buildings: {}, groups: {}, compounds: {} };
    var buildings  = manifest.buildings  || {};
    var groups     = manifest.groups     || {};
    var compounds  = manifest.compounds  || {};

    // Re-query footprint for every hidden building with geometry
    Object.keys(buildings).forEach(function (key) {
      var edit = buildings[key];
      if (!edit || edit.hidden !== true) return;
      if (edit.geometry && edit.geometry.bounds) {
        var fps = _queryFootprintFeatureIds(edit.geometry, layerIds);
        Object.keys(fps).forEach(function (fid) { liveIds[fid] = true; });
      }
    });

    // Re-query footprint for any group whose member is hidden
    var hiddenBuildingKeys = {};
    Object.keys(buildings).forEach(function (key) {
      if (buildings[key] && buildings[key].hidden === true) hiddenBuildingKeys[key] = true;
    });

    Object.keys(groups).forEach(function (gid) {
      var grp = groups[gid];
      if (!grp || !Array.isArray(grp.members)) return;
      var suppress = grp.members.some(function (mk) { return hiddenBuildingKeys[mk]; });
      if (!suppress) return;
      grp.members.forEach(function (mk) {
        var id = _idFromBuildingKey(mk);
        if (id != null) liveIds[String(id)] = true;
      });
      if (grp.geometry && grp.geometry.bounds) {
        var fps = _queryFootprintFeatureIds(grp.geometry, layerIds);
        Object.keys(fps).forEach(function (fid) { liveIds[fid] = true; });
      }
    });

    // Re-query footprint for any compound whose member/group is hidden
    var suppressedGroupIds = {};
    Object.keys(groups).forEach(function (gid) {
      var grp = groups[gid];
      if (grp && Array.isArray(grp.members)) {
        if (grp.members.some(function (mk) { return hiddenBuildingKeys[mk]; })) {
          suppressedGroupIds[gid] = true;
        }
      }
    });

    Object.keys(compounds).forEach(function (cid) {
      var cmp = compounds[cid];
      if (!cmp || !Array.isArray(cmp.members)) return;
      var suppress = cmp.members.some(function (m) {
        return hiddenBuildingKeys[m] || suppressedGroupIds[m];
      });
      if (!suppress) return;
      cmp.members.forEach(function (m) {
        var bid = _idFromBuildingKey(m);
        if (bid != null) {
          liveIds[String(bid)] = true;
        } else {
          var grp = groups[m];
          if (grp && Array.isArray(grp.members)) {
            grp.members.forEach(function (mk) {
              var id = _idFromBuildingKey(mk);
              if (id != null) liveIds[String(id)] = true;
            });
          }
        }
      });
      if (cmp.geometry && cmp.geometry.bounds) {
        var fps = _queryFootprintFeatureIds(cmp.geometry, layerIds);
        Object.keys(fps).forEach(function (fid) { liveIds[fid] = true; });
      }
    });

    _liveRequeryIds = liveIds;
    var liveCount   = Object.keys(liveIds).length;

    // ── Phase 3: apply expressions using the live-merged id set ───────────────
    _state.buildingLayers.forEach(function (layer) {
      var snap            = _originalPaintSnapshots[layer.id];
      var props           = _paintProps(layer.type);
      var originalOpacity = snap ? snap.originalOpacity : null;
      var originalColor   = snap ? snap.originalColor   : null;

      if (layer.type === 'fill-extrusion') {
        var originalHeight = snap ? snap.originalHeight : null;
        var originalBase   = snap ? snap.originalBase   : null;
        var heightOk = false;
        try {
          _map.setPaintProperty(layer.id, 'fill-extrusion-height',
            _buildHiddenHeightExpr(liveIds, originalHeight));
          heightOk = true;
        } catch (e) {
          _lastParityError = String(e && e.message || e);
          console.warn('[MapboxAdapter] fill-extrusion-height suppression failed on',
            layer.id, '—', e.message || e);
        }
        if (heightOk) {
          try {
            _map.setPaintProperty(layer.id, 'fill-extrusion-base',
              _buildHiddenBaseExpr(liveIds, originalBase));
          } catch (e) {
            _lastParityError = String(e && e.message || e);
            console.warn('[MapboxAdapter] fill-extrusion-base suppression failed on',
              layer.id, '—', e.message || e, '(non-fatal)');
          }
          _hiddenSuppressionColorLayers[layer.id] = true;
        }
      } else {
        try {
          _map.setPaintProperty(layer.id, props.opacity,
            _buildHiddenOpacityExpr(liveIds, originalOpacity));
        } catch (e) {
          _lastParityError = String(e && e.message || e);
          _hiddenSuppressionFallbackLayers[layer.id] = true;
          console.warn('[MapboxAdapter] fill opacity suppression failed on',
            layer.id, '—', e.message || e, '— trying color fallback');
          try {
            _map.setPaintProperty(layer.id, props.color,
              _buildHiddenColorFallbackExpr(liveIds, originalColor));
          } catch (e2) {
            _lastParityError = String(e2 && e2.message || e2);
            console.warn('[MapboxAdapter] color fallback also failed on', layer.id, '—', e2.message || e2);
          }
        }
      }
    });

    if (liveCount > Object.keys(seedIds).length) {
      console.log('[MapboxAdapter] _applyHiddenSourceSuppression: live requery expanded',
        Object.keys(seedIds).length, '→', liveCount, 'suppressed ids');
    }
  }

  // Shared by applyRegistryEdits, clearSelectionColor, clearRegistryProjection.
  function _restoreOriginalBuildingPaint() {
    if (!_map) return;
    _state.buildingLayers.forEach(function (l) {
      var snap  = _originalPaintSnapshots[l.id];
      var props = _paintProps(l.type);
      if (snap) {
        try {
          _map.setPaintProperty(l.id, props.color,
            snap.originalColor !== null ? snap.originalColor : null);
        } catch (e) {
          _lastParityError = String(e && e.message || e);
          console.warn('[MapboxAdapter] _restoreOriginalBuildingPaint color failed on', l.id, ':', e.message || e);
          try { _map.setPaintProperty(l.id, props.color, _buildColorExpr([])); } catch (e2) {}
        }
        if (l.type === 'fill-extrusion') {
          // 0611D: restore height and base suppressed by height-suppression path
          try {
            _map.setPaintProperty(l.id, 'fill-extrusion-height',
              snap.originalHeight !== null && snap.originalHeight !== undefined ? snap.originalHeight : null);
          } catch (e) {
            console.warn('[MapboxAdapter] _restoreOriginalBuildingPaint height failed on', l.id, ':', e.message || e);
          }
          try {
            _map.setPaintProperty(l.id, 'fill-extrusion-base',
              snap.originalBase !== null && snap.originalBase !== undefined ? snap.originalBase : null);
          } catch (e) {
            console.warn('[MapboxAdapter] _restoreOriginalBuildingPaint base failed on', l.id, ':', e.message || e);
          }
        } else {
          try {
            _map.setPaintProperty(l.id, props.opacity,
              snap.originalOpacity !== null ? snap.originalOpacity : null);
          } catch (e) {}
        }
      } else {
        // WOS-created layer (no snapshot) — restore WOS default expression
        try { _map.setPaintProperty(l.id, props.color, _buildColorExpr([])); } catch (e) {
          console.warn('[MapboxAdapter] _restoreOriginalBuildingPaint WOS color failed on', l.id, ':', e.message || e);
        }
        if (l.type === 'fill-extrusion') {
          // WOS-created extrusion: restore height/base to null (style default)
          try { _map.setPaintProperty(l.id, 'fill-extrusion-height', null); } catch (e) {}
          try { _map.setPaintProperty(l.id, 'fill-extrusion-base',   null); } catch (e) {}
        } else {
          try { _map.setPaintProperty(l.id, props.opacity, _buildOpacityExpr(l.type)); } catch (e) {}
        }
      }
      delete _wosMutatedLayers[l.id];
    });
  }

  // setSelectionColor — 0610O: no source layer paint mutation.
  // editColor is stored on the feature object for inspector/badge display only.
  // Selection feedback is provided by the outline layer via feature-state.
  function setSelectionColor(feature, hexColor) {
    if (!feature) return;
    feature.editColor = hexColor;  // inspector display only — no paint mutation
  }

  function clearSelectionColor() {
    _selectionColorMap = {};
    _restoreOriginalBuildingPaint();
    _applyHiddenSourceSuppression();  // 0610P: re-apply hidden suppression after restore
  }

  // applyRegistryEdits(edits) — 0610O: author-mode paint projection disabled.
  // Registry edits are data; Mapbox source paint is NOT an authoring canvas.
  // Selection/inspector/badge provide all author feedback in Author mode.
  // Preview/Wall are the only places replacement visuals render onto the map.
  //
  // Accepts the same argument shape as before; still called by _restoreEdits and
  // _refreshAfterChange in mapLabView. Returns the number of registry entries
  // scanned (not the number of projected overrides — there are none).
  // applyRegistryEdits — 0610Q: footprint-aware, group-aware, compound-aware
  // hidden source suppression. Color/replacement projection remains disabled.
  //
  // edits   — buildings map from registry.getAll()
  // context — optional { groups, compounds } from registry.getGroups/getCompounds
  function applyRegistryEdits(edits, context) {
    var scanned  = (edits && typeof edits === 'object') ? Object.keys(edits).length : 0;
    var manifest = {
      buildings: edits    || {},
      groups:    (context && context.groups)    || {},
      compounds: (context && context.compounds) || {},
    };
    // 0611F: persist manifest for live requery inside _applyHiddenSourceSuppression()
    _lastAuthorManifest = manifest;
    _selectionColorMap  = {};
    var audit = _collectAuthorHiddenSuppressionTargets(manifest);
    _hiddenSourceIds        = audit.ids;
    _authorSuppressionState = audit;
    _restoreOriginalBuildingPaint();
    _applyHiddenSourceSuppression();
    var hiddenCount = audit.hiddenSourceCount;
    console.log('[MapboxAdapter] applyRegistryEdits: scanned', scanned,
      '— hidden:', hiddenCount,
      '| direct ids:', audit.directIdCount,
      '| footprint ids:', audit.footprintIdCount,
      '| group ids:', audit.groupIdCount,
      '| compound ids:', audit.compoundIdCount,
      '| geometry missing:', audit.geometryMissingCount,
      '— color/replacement projection disabled (0611F)');
    return scanned;
  }

  // clearRegistryProjection — remove author cue paint projections from all
  // building layers without touching BuildingEditRegistry or localStorage.
  // Restores each layer to its default feature-state expression (no color override
  // matches). Called by MapLabView when entering Preview mode so that author cues
  // (replacement archetype colors, custom colors) do not compete with the preview
  // actor layer.
  // clearRegistryProjection — 0610O: delegates to shared restore helper.
  // Called by MapLabView when entering Preview mode so any lingering mutations
  // (from hover/selection feature-state etc.) don't compete with preview actors.
  // clearRegistryProjection — called when entering Preview mode.
  // Clears both color projection and hidden suppression because Preview runtime
  // owns all suppression in that mode.
  function clearRegistryProjection() {
    if (!_map) return;
    _selectionColorMap               = {};
    _hiddenSourceIds                 = {};
    _hiddenSuppressionFallbackLayers = {};
    _hiddenSuppressionColorLayers    = {};
    _lastAuthorManifest              = null; // 0611F
    _liveRequeryIds                  = {};   // 0611F
    _restoreOriginalBuildingPaint();
    console.log('[MapboxAdapter] clearRegistryProjection: restored',
      _state.buildingLayers.length, 'layer(s) to original paint (0610P)');
  }

  // ── State / debug ─────────────────────────────────────────────────────────────

  function getState() {
    var pl = _primaryBuildingLayer();
    return {
      version: '1.13.0',
      initialized: _state.initialized,
      containerId: _state.containerId,
      buildingLayers: _state.buildingLayers.slice(),
      hasHighlight: !!_highlightedFeature,
      lastError: _state.lastError,
      primaryLayerId:   pl ? pl.id   : null,
      primaryLayerType: pl ? pl.type : null,
    };
  }

  // ── Style parity status (0610N) ───────────────────────────────────────────────

  // styleParityStatus — returns a parity audit snapshot.
  // Reports whether WOS has mutated any style-owned layer paint.
  // parityOk === true means Mapbox Studio is the effective colour authority:
  //   either nothing has been mutated, or all mutations are backed by authored overrides.
  function styleParityStatus() {
    var styleLoaded    = false;
    var fallbackPresent = false;
    try {
      if (_map) {
        styleLoaded = !!_map.isStyleLoaded();
        var sty     = _map.getStyle();
        var ls      = (sty && sty.layers) || [];
        for (var i = 0; i < ls.length; i++) {
          if (ls[i].id === 'maplab-buildings-3d') { fallbackPresent = true; break; }
        }
      }
    } catch (e) { _lastParityError = String(e && e.message || e); }

    var mutatedIds    = Object.keys(_wosMutatedLayers);
    var snapshotCount = Object.keys(_originalPaintSnapshots).length;
    var overrideActive = Object.keys(_selectionColorMap).length > 0;
    var hiddenIds     = Object.keys(_hiddenSourceIds || {});
    var fallbackIds   = Object.keys(_hiddenSuppressionFallbackLayers || {});

    var snap = {
      version:                '1.13.0',
      mode:                   'author',
      baseStyleAuthority:     'mapbox-studio',
      // 0610O: author cue isolation fields
      authorCueMode:                 'outline-dom-only',
      sourcePaintProjectionEnabled:  false,
      registryPaintProjectionCount:  0,
      sourcePaintMutationBlocked:    true,
      // 0610P: hidden source suppression fields
      authorSourceSuppressionEnabled:  true,
      hiddenSourceProjectionCount:     hiddenIds.length,
      hiddenSourceLayerCount:          hiddenIds.length ? _state.buildingLayers.length : 0,
      hiddenSourceFallbackCount:       fallbackIds.length,
      colorProjectionEnabled:          false,
      replacementCueProjectionEnabled: false,
      // parity fields
      activeStyleUrl:         _activeStyleKey === 'wos' ? STYLE_PRESENTATION : STYLE_OPERATOR,
      styleLoaded:            styleLoaded,
      buildingLayerCount:     _state.buildingLayers.length,
      fallbackLayerPresent:   fallbackPresent,
      wosMutatedLayerCount:   mutatedIds.length,
      mutatedLayers:          mutatedIds,
      originalPaintSnapshots: snapshotCount,
      overrideActive:         overrideActive,
      overrideCount:          Object.keys(_selectionColorMap).length,
      sourceSuppressionActive: hiddenIds.length > 0,
      // parityOk: false only when style-owned layers remain mutated without reason.
      // Hidden suppression does not mark _wosMutatedLayers, so parity remains clean.
      parityOk:               mutatedIds.length === 0,
      lastParityError:        _lastParityError,
    };
    console.log('[MapboxAdapter] styleParityStatus:', JSON.stringify(snap, null, 2));
    return snap;
  }

  // authorSuppressionStatus() — 0610Q debug API
  // Returns the last computed suppression audit plus live layer counts.
  function authorSuppressionStatus() {
    var audit        = _authorSuppressionState || {};
    var hiddenIds    = Object.keys(_hiddenSourceIds || {});
    var fallbackIds  = Object.keys(_hiddenSuppressionFallbackLayers || {});
    var colorIds     = Object.keys(_hiddenSuppressionColorLayers || {});
    var extrusionCount = _state.buildingLayers.filter(function (l) { return l.type === 'fill-extrusion'; }).length;
    var fillCount      = _state.buildingLayers.filter(function (l) { return l.type !== 'fill-extrusion'; }).length;

    var mutationType = 'none';
    if (hiddenIds.length) {
      if (extrusionCount > 0 && fillCount === 0) mutationType = 'extrusion-height-suppression';
      else if (extrusionCount > 0 && fillCount > 0) mutationType = 'extrusion-height-suppression+opacity';
      else if (fallbackIds.length) mutationType = 'color-fallback';
      else mutationType = 'opacity-only';
    }

    var liveIds      = Object.keys(_liveRequeryIds || {});
    var seedCount    = hiddenIds.length;
    var liveCount    = liveIds.length;
    var totalCount   = liveCount > 0 ? liveCount : seedCount;

    return {
      mode:                        'author',
      hiddenSourceCount:           audit.hiddenSourceCount        || 0,
      directIdCount:               audit.directIdCount            || 0,
      footprintExpandedIdCount:    audit.footprintIdCount         || 0,
      groupExpandedIdCount:        audit.groupIdCount             || 0,
      compoundExpandedIdCount:     audit.compoundIdCount          || 0,
      geometryMissingCount:        audit.geometryMissingCount     || 0,
      seedSuppressedIdCount:       seedCount,
      liveRequeryEnabled:          true,           // 0611F
      liveRequeryIdCount:          liveCount,      // 0611F
      totalSuppressedIdCount:      totalCount,     // 0611F: reflects live-merged set
      suppressedLayerCount:        totalCount ? _state.buildingLayers.length : 0,
      extrusionColorSuppressionLayerCount: colorIds.length,
      fallbackLayerCount:          fallbackIds.length,
      colorProjectionEnabled:      false,
      replacementProjectionEnabled: false,
      sourcePaintMutationType:     mutationType,
      lastError:                   _lastParityError,
    };
  }

  // ── auditHiddenSuppression — 0611A diagnostic ────────────────────────────────
  //
  // Full chain audit for hidden-source suppression failures.
  // Call from Studio console: WOSMapLab.auditHiddenSuppression()
  // Optionally pass a building key: WOSMapLab.auditHiddenSuppression('composite:building:278053568')
  //
  // Does NOT modify state. Read-only.
  function auditHiddenSuppression(buildingKey) {
    var report = {
      timestamp:          new Date().toISOString(),
      buildingKey:        buildingKey || null,

      // ── 1. Registry layer ──────────────────────────────────────────────────
      registry:           null,

      // ── 2. Suppression collection layer ───────────────────────────────────
      collection:         null,

      // ── 3. Footprint query layer ───────────────────────────────────────────
      footprintQuery:     null,

      // ── 4. Layer target audit ──────────────────────────────────────────────
      layerTargets:       [],

      // ── 5. Paint verification (read-back) ────────────────────────────────
      paintReadback:      [],

      // ── 6. Failure classification ─────────────────────────────────────────
      failureClass:       null,
      failureDetail:      null,
      recommendedPatch:   null,
    };

    if (!_map) {
      report.failureClass  = 'E_PAINT_MUTATION_FAILURE';
      report.failureDetail = 'map not initialized';
      console.log('[auditHiddenSuppression]', JSON.stringify(report, null, 2));
      return report;
    }

    // ── 1. Registry layer ────────────────────────────────────────────────────
    // Work from live _hiddenSourceIds (what applyRegistryEdits last computed).
    var hiddenIds    = _hiddenSourceIds || {};
    var hiddenIdList = Object.keys(hiddenIds);

    var registryInfo = {
      hiddenSourceIds:     hiddenIdList,
      hiddenCount:         hiddenIdList.length,
      buildingLayers:      _state.buildingLayers.map(function (l) {
        return { id: l.id, type: l.type, source: l.source, sourceLayer: l.sourceLayer };
      }),
      buildingLayerCount:  _state.buildingLayers.length,
      paintSnapshots:      {},
    };

    _state.buildingLayers.forEach(function (l) {
      var snap = _originalPaintSnapshots[l.id];
      registryInfo.paintSnapshots[l.id] = snap ? {
        colorProp:       snap.colorProp,
        opacityProp:     snap.opacityProp,
        originalColor:   snap.originalColor,
        originalOpacity: snap.originalOpacity,
      } : null;
    });

    // If a specific building key was provided, include its raw registry edit
    if (buildingKey) {
      // We don't have direct registry access from here, but we can show the extracted id
      var extractedId = _idFromBuildingKey(buildingKey);
      registryInfo.requestedKey          = buildingKey;
      registryInfo.requestedExtractedId  = extractedId;
      registryInfo.requestedIdInHiddenSet = hiddenIds[String(extractedId)] === true;
    }

    report.registry = registryInfo;

    // ── 2. Suppression collection layer ──────────────────────────────────────
    var audit = _authorSuppressionState || {};
    report.collection = {
      hiddenSourceCount:       audit.hiddenSourceCount       || 0,
      directIdCount:           audit.directIdCount           || 0,
      footprintExpandedIdCount: audit.footprintIdCount       || 0,
      groupExpandedIdCount:    audit.groupIdCount            || 0,
      compoundExpandedIdCount: audit.compoundIdCount         || 0,
      geometryMissingCount:    audit.geometryMissingCount    || 0,
      totalSuppressedIdCount:  hiddenIdList.length,
      suppressedIds:           hiddenIdList,
    };

    if (!hiddenIdList.length) {
      report.failureClass  = 'A_REGISTRY_MISMATCH';
      report.failureDetail = 'No suppressed IDs in _hiddenSourceIds — applyRegistryEdits may not have run, ' +
        'or hidden:true not present in registry, or _idFromBuildingKey returned null.';
      report.recommendedPatch = 'Call WOSMapLab.authorSuppressionStatus() to check collection counts. ' +
        'Ensure registry.hidden === true and key format is "source:sourceLayer:featureId".';
      console.log('[auditHiddenSuppression]', JSON.stringify(report, null, 2));
      return report;
    }

    // ── 3. Footprint query layer ──────────────────────────────────────────────
    // For the target building key (or first hidden id), query rendered features
    // over the full bbox of discovered building layers, and also without layer filter.
    var queryResults = {
      targetId:               buildingKey ? _idFromBuildingKey(buildingKey) : hiddenIdList[0],
      layerIds:               _state.buildingLayers.map(function (l) { return l.id; }),
      renderedFeaturesFiltered: [],    // with layers filter
      renderedFeaturesAll:    [],      // without layers filter (full building footprint area)
      filteredIdSet:          {},
      allIdSet:               {},
      targetIdFoundInFiltered: false,
      targetIdFoundInAll:     false,
      targetIdTypeInFiltered: null,   // numeric or string, as returned by Mapbox
    };

    // Use the first hidden id to construct a rough center query if no geometry is stored
    // We'll query a broad area around the map center as a fallback
    var targetId = String(queryResults.targetId);

    try {
      // Query with layers filter (what suppression actually targets)
      var layerIds = queryResults.layerIds;
      var styleFeats = _map.queryRenderedFeatures(
        undefined,  // full visible viewport
        layerIds.length ? { layers: layerIds } : {}
      ) || [];

      styleFeats.forEach(function (f) {
        var fid   = f.id;
        var entry = {
          featureId:   fid,
          featureIdType: typeof fid,
          featureIdStr:  fid != null ? String(fid) : null,
          layerId:     f.layer && f.layer.id,
          layerType:   f.layer && f.layer.type,
          source:      f.source,
          sourceLayer: f.sourceLayer,
        };
        queryResults.renderedFeaturesFiltered.push(entry);
        if (fid != null) queryResults.filteredIdSet[String(fid)] = true;
        if (fid != null && String(fid) === targetId) {
          queryResults.targetIdFoundInFiltered = true;
          queryResults.targetIdTypeInFiltered  = typeof fid;
        }
      });

      // Query full viewport with no layer filter to see what Mapbox renders
      var allFeats = _map.queryRenderedFeatures() || [];
      allFeats.forEach(function (f) {
        if (f.layer && (f.layer.type === 'fill-extrusion' || /building/i.test(f.layer.id || '') || /building/i.test((f.sourceLayer || '')))) {
          var fid = f.id;
          var entry = {
            featureId:    fid,
            featureIdType: typeof fid,
            featureIdStr:  fid != null ? String(fid) : null,
            layerId:      f.layer && f.layer.id,
            layerType:    f.layer && f.layer.type,
            source:       f.source,
            sourceLayer:  f.sourceLayer,
          };
          queryResults.renderedFeaturesAll.push(entry);
          if (fid != null) queryResults.allIdSet[String(fid)] = true;
          if (fid != null && String(fid) === targetId) queryResults.targetIdFoundInAll = true;
        }
      });

      // Id overlap analysis: how many suppressed ids actually appear in rendered features
      var suppressedFoundInRendered   = hiddenIdList.filter(function (id) { return queryResults.filteredIdSet[id]; });
      var suppressedMissingFromRender = hiddenIdList.filter(function (id) { return !queryResults.filteredIdSet[id]; });
      queryResults.suppressedIdsFoundInRendered   = suppressedFoundInRendered;
      queryResults.suppressedIdsMissingFromRender = suppressedMissingFromRender;
      queryResults.overlapCount                   = suppressedFoundInRendered.length;

    } catch (e) {
      queryResults.queryError = String(e && e.message || e);
    }

    report.footprintQuery = queryResults;

    // ── 4. Layer target audit ──────────────────────────────────────────────────
    // For each building layer: report exactly what opacity property is targeted,
    // whether that property is data-driven capable, and the expression that would be applied.
    var layerTargets = [];
    var FILL_EXTRUSION_OPACITY_DATA_DRIVEN = false; // Mapbox GL JS: fill-extrusion-opacity is NOT data-driven
    var FILL_OPACITY_DATA_DRIVEN           = true;  // fill-opacity IS data-driven

    _state.buildingLayers.forEach(function (layer) {
      var props = _paintProps(layer.type);
      var snap  = _originalPaintSnapshots[layer.id];
      var originalOpacity = snap ? snap.originalOpacity : null;

      // Build the exact expression that _applyHiddenSourceSuppression would apply
      var exprWouldApply = _buildHiddenOpacityExpr(hiddenIds, originalOpacity);

      var isDataDriven = (layer.type === 'fill-extrusion')
        ? FILL_EXTRUSION_OPACITY_DATA_DRIVEN
        : FILL_OPACITY_DATA_DRIVEN;

      // Check: is the opacity property one that accepts per-feature match expressions?
      var opacitySupportsDataExpr = (props.opacity !== 'fill-extrusion-opacity');

      layerTargets.push({
        layerId:               layer.id,
        layerType:             layer.type,
        opacityProperty:       props.opacity,
        colorProperty:         props.color,
        originalOpacity:       originalOpacity,
        opacitySupportsDataDrivenExpression: opacitySupportsDataExpr,
        expressionApplied:     exprWouldApply,
        expressionType:        Array.isArray(exprWouldApply) ? 'match-expression' : 'constant',
        WARNING:               !opacitySupportsDataExpr
          ? 'CRITICAL: fill-extrusion-opacity does NOT support per-feature data expressions in Mapbox GL JS. ' +
            'The match expression is applied at the layer level only — ALL features are affected uniformly, ' +
            'not per-feature. The fallback value (originalOpacity) is used for all features because the ' +
            'expression evaluates at layer scope where feature [\'id\'] is unavailable.'
          : null,
      });
    });

    report.layerTargets = layerTargets;

    // ── 5. Paint verification — read back live paint properties ───────────────
    var paintReadback = [];
    _state.buildingLayers.forEach(function (layer) {
      var props = _paintProps(layer.type);
      var readbackEntry = {
        layerId:          layer.id,
        layerType:        layer.type,
        opacityProperty:  props.opacity,
        colorProperty:    props.color,
        currentOpacity:   null,
        currentColor:     null,
        opacityReadError: null,
        colorReadError:   null,
        opacityIsMatchExpr: false,
        opacityFallbackValue: null,
      };

      try {
        var opVal = _map.getPaintProperty(layer.id, props.opacity);
        readbackEntry.currentOpacity = opVal;
        readbackEntry.opacityIsMatchExpr = Array.isArray(opVal) && opVal[0] === 'match';
        // If it's a match expr, extract the fallback (last element)
        if (readbackEntry.opacityIsMatchExpr) {
          readbackEntry.opacityFallbackValue = opVal[opVal.length - 1];
        }
      } catch (e) {
        readbackEntry.opacityReadError = String(e && e.message || e);
      }

      try {
        readbackEntry.currentColor = _map.getPaintProperty(layer.id, props.color);
      } catch (e) {
        readbackEntry.colorReadError = String(e && e.message || e);
      }

      paintReadback.push(readbackEntry);
    });

    report.paintReadback = paintReadback;

    // ── 6. Failure classification ──────────────────────────────────────────────
    var hasFillExtrusion = _state.buildingLayers.some(function (l) { return l.type === 'fill-extrusion'; });
    var fillExtrusionTargets = layerTargets.filter(function (t) { return t.layerType === 'fill-extrusion'; });
    var nonFillExtrusionTargets = layerTargets.filter(function (t) { return t.layerType !== 'fill-extrusion'; });
    var readbackHasMatchExpr = paintReadback.some(function (r) { return r.opacityIsMatchExpr; });
    var readbackOpacityFullyOpaque = paintReadback.some(function (r) {
      // opacity of 1 or null (default 1) means not suppressed
      return r.currentOpacity === 1 || r.currentOpacity === null || r.currentOpacity === undefined;
    });

    if (!hiddenIdList.length) {
      report.failureClass   = 'A_REGISTRY_MISMATCH';
      report.failureDetail  = 'No hidden IDs were collected — suppression set is empty.';
    } else if (!_state.buildingLayers.length) {
      report.failureClass   = 'D_LAYER_TARGETING_FAILURE';
      report.failureDetail  = 'No building layers discovered. discoverBuildingLayers() must run before suppression.';
    } else if (hasFillExtrusion && fillExtrusionTargets.length > 0) {
      // The core hypothesis: fill-extrusion-opacity does not accept data-driven match expressions.
      // Verify by checking if a match expr was stored but opacity is still 1.
      var hasDataExprWarning = fillExtrusionTargets.some(function (t) { return t.WARNING; });
      if (hasDataExprWarning) {
        report.failureClass = 'F_MAPBOX_STYLE_LIMITATION';
        report.failureDetail =
          'fill-extrusion-opacity does NOT support per-feature data expressions (["match",["id"],...]) ' +
          'in Mapbox GL JS. The paint property is layer-scope only. When a ["match",["id"],...] expression ' +
          'is set on fill-extrusion-opacity, Mapbox evaluates it at layer scope where feature id is ' +
          'unavailable and returns the fallback value (originalOpacity ≈ 1) for ALL features. ' +
          'Every building in the layer remains fully visible. ' +
          'fill-extrusion-color DOES support data-driven expressions. ' +
          'The fix is to use fill-extrusion-color with rgba(0,0,0,0) for hidden feature IDs ' +
          'instead of — or in addition to — fill-extrusion-opacity.';
        report.recommendedPatch =
          'In _applyHiddenSourceSuppression(): for fill-extrusion layers, skip the opacity path ' +
          'entirely and always apply _buildHiddenColorFallbackExpr() to fill-extrusion-color. ' +
          'fill-extrusion-color accepts ["match",["id"],...] and suppresses individual buildings. ' +
          'The _restoreOriginalBuildingPaint() function already skips opacity restore for ' +
          'fill-extrusion (correct). The suppression path must match: use color only, not opacity, ' +
          'for fill-extrusion.';

        // Supporting evidence from readback
        var extrusionReadbacks = paintReadback.filter(function (r) { return r.layerType === 'fill-extrusion'; });
        report.extrusionReadbackEvidence = extrusionReadbacks.map(function (r) {
          return {
            layerId:         r.layerId,
            opacityProperty: r.opacityProperty,
            currentOpacity:  r.currentOpacity,
            isMatchExpr:     r.opacityIsMatchExpr,
            note: r.opacityIsMatchExpr
              ? 'Match expr was stored but Mapbox ignores feature IDs at layer scope — fallback applies to all'
              : 'No match expression present — suppression never applied',
          };
        });
      }
    } else if (nonFillExtrusionTargets.length && !readbackHasMatchExpr) {
      report.failureClass  = 'E_PAINT_MUTATION_FAILURE';
      report.failureDetail = 'setPaintProperty was called but getPaintProperty shows no match expression. ' +
        'This may indicate the style was reloaded after suppression was applied.';
    } else if (queryResults.overlapCount === 0 && hiddenIdList.length > 0) {
      report.failureClass  = 'C_FEATURE_ID_MISMATCH';
      report.failureDetail = 'Suppressed IDs do not appear in queryRenderedFeatures results. ' +
        'The IDs in the registry may differ from Mapbox feature IDs (e.g. string vs numeric, or wrong segment of building key).';
    } else {
      report.failureClass  = 'B_FOOTPRINT_QUERY_FAILURE';
      report.failureDetail = 'Suppressed IDs were found in rendered features but building is still visible. ' +
        'The match expression may have been applied but not rendered — check tile cache or style reload order.';
    }

    console.log('[auditHiddenSuppression] FAILURE CLASS:', report.failureClass);
    console.log('[auditHiddenSuppression] DETAIL:', report.failureDetail);
    if (report.recommendedPatch) console.log('[auditHiddenSuppression] PATCH:', report.recommendedPatch);
    console.log('[auditHiddenSuppression] FULL REPORT:', JSON.stringify(report, null, 2));
    return report;
  }

  // ── auditExtrusionColorAlpha — 0611C diagnostic ──────────────────────────────
  //
  // Determines whether Mapbox GL JS fill-extrusion-color respects alpha, and
  // identifies the viable suppression strategy for hidden fill-extrusion features.
  //
  // Call from console:
  //   WOSMapLab.auditExtrusionColorAlpha()
  //   WOSMapLab.auditExtrusionColorAlpha('composite:building:278053568')
  //
  // Does NOT permanently modify state — all test mutations are cleaned up before
  // returning. The original color is restored on each test layer.
  function auditExtrusionColorAlpha(buildingKey) {
    var report = {
      timestamp:         new Date().toISOString(),
      buildingKey:       buildingKey || null,
      targetFeatureId:   null,
      targetLayerId:     null,
      extrusionLayers:   [],

      // ── 1. Current paint readback ─────────────────────────────────────────
      currentPaint:      {},

      // ── 2. Color alpha test results ───────────────────────────────────────
      colorAlphaTests:   [],

      // ── 3. Height/base suppression probe ─────────────────────────────────
      heightBaseProbe:   null,

      // ── 4. Filter suppression probe ───────────────────────────────────────
      filterProbe:       null,

      // ── 5. Classification ─────────────────────────────────────────────────
      classification:    null,
      classificationCode: null,
      recommendedPatch:  null,
      findings:          [],
    };

    if (!_map) {
      report.classification = 'Cannot audit — map not initialized';
      console.log('[auditExtrusionColorAlpha]', JSON.stringify(report, null, 2));
      return report;
    }

    // Resolve target feature id and primary extrusion layer
    var targetId = null;
    if (buildingKey) {
      targetId = _idFromBuildingKey(buildingKey);
    } else if (_highlightedFeature && _highlightedFeature.id != null) {
      targetId = _highlightedFeature.id;
      report.buildingKey = _highlightedFeature.layerId + ':' + _highlightedFeature.id;
    } else {
      // Fall back to first hidden id from current state
      var hiddenList = Object.keys(_hiddenSourceIds || {});
      if (hiddenList.length) targetId = Number(hiddenList[0]) || hiddenList[0];
    }
    report.targetFeatureId = targetId;

    // Collect all fill-extrusion layers
    var extrusionLayers = _state.buildingLayers.filter(function (l) {
      return l.type === 'fill-extrusion';
    });
    report.extrusionLayers = extrusionLayers.map(function (l) { return { id: l.id, type: l.type }; });

    if (!extrusionLayers.length) {
      report.classification = 'No fill-extrusion layers discovered — audit only applies to extrusion geometry';
      console.log('[auditExtrusionColorAlpha]', JSON.stringify(report, null, 2));
      return report;
    }

    var primaryLayer = extrusionLayers[0];
    report.targetLayerId = primaryLayer.id;

    // ── 1. Current paint readback ─────────────────────────────────────────────
    var props = _paintProps('fill-extrusion');
    var snap  = _originalPaintSnapshots[primaryLayer.id];

    try { report.currentPaint.color   = _map.getPaintProperty(primaryLayer.id, props.color);   } catch (e) { report.currentPaint.colorError   = String(e.message || e); }
    try { report.currentPaint.opacity = _map.getPaintProperty(primaryLayer.id, props.opacity); } catch (e) { report.currentPaint.opacityError = String(e.message || e); }
    try {
      report.currentPaint.height = _map.getPaintProperty(primaryLayer.id, 'fill-extrusion-height');
      report.currentPaint.base   = _map.getPaintProperty(primaryLayer.id, 'fill-extrusion-base');
    } catch (e) {}
    try { report.currentPaint.currentFilter = _map.getFilter(primaryLayer.id); } catch (e) {}

    var originalColor   = snap ? snap.originalColor   : null;
    var originalOpacity = snap ? snap.originalOpacity : null;
    report.currentPaint.snapshotColor   = originalColor;
    report.currentPaint.snapshotOpacity = originalOpacity;

    if (targetId == null) {
      report.findings.push('No target feature id available — cannot run per-feature tests. Pass a buildingKey or select a building first.');
      report.classification = 'No target feature id';
      console.log('[auditExtrusionColorAlpha]', JSON.stringify(report, null, 2));
      return report;
    }

    var numId = Number(targetId);
    var mid   = isNaN(numId) ? targetId : numId;  // the form to use inside match expressions

    // ── Helper: apply a test expression, wait one rAF, then restore ───────────
    // (synchronous — we apply, record, then restore before returning)
    // We do NOT actually await rAF here because we're read-only after the test.
    // The test result must be observed by the human in the browser viewport.
    // We record what expression was SET and whether setPaintProperty threw.

    function _testColorExpr(label, colorForHidden) {
      var result = {
        label:       label,
        colorApplied: colorForHidden,
        expression:  null,
        setPaintError: null,
        readbackAfterSet: null,
        readbackError: null,
        restored:    false,
        restoreError: null,
      };

      var expr = ['match', ['id'], mid, colorForHidden, originalColor !== null ? originalColor : 'hsl(230,43%,65%)'];
      result.expression = expr;

      try {
        _map.setPaintProperty(primaryLayer.id, props.color, expr);
      } catch (e) {
        result.setPaintError = String(e.message || e);
        return result;
      }

      try {
        result.readbackAfterSet = _map.getPaintProperty(primaryLayer.id, props.color);
      } catch (e) {
        result.readbackError = String(e.message || e);
      }

      // Restore immediately — human must observe in-browser between test calls
      try {
        _map.setPaintProperty(primaryLayer.id, props.color, originalColor !== null ? originalColor : null);
        result.restored = true;
      } catch (e) {
        result.restoreError = String(e.message || e);
      }

      return result;
    }

    // ── 2. Color alpha tests ──────────────────────────────────────────────────
    // Run all three test colors in sequence. Each is applied and restored
    // before the next runs. The LAST test color remains applied briefly before
    // restore — the human sees each flash in sequence if called from console.
    //
    // NOTE: because restoration happens synchronously before rAF, the human will
    // not see the per-test flashes unless they call _testColorExpr manually.
    // The report records exactly what was set and what readback returned.
    // The classification is based on Mapbox GL JS spec knowledge + readback type.

    var testColors = [
      { label: 'rgba(0,0,0,0)',    color: 'rgba(0,0,0,0)'    },
      { label: 'rgba(0,0,0,0.01)', color: 'rgba(0,0,0,0.01)' },
      { label: 'rgba(255,255,255,0)', color: 'rgba(255,255,255,0)' },
    ];

    testColors.forEach(function (tc) {
      report.colorAlphaTests.push(_testColorExpr(tc.label, tc.color));
    });

    // Determine if any test setPaintProperty threw (which would indicate the
    // property doesn't accept certain value types).
    var allColorTestsAccepted = report.colorAlphaTests.every(function (t) { return !t.setPaintError; });
    var allColorTestsRestored = report.colorAlphaTests.every(function (t) { return t.restored; });
    report.findings.push('fill-extrusion-color setPaintProperty accepted all three alpha test expressions: ' + allColorTestsAccepted);
    report.findings.push('All test states restored to original: ' + allColorTestsRestored);

    // ── 3. Height/base suppression probe ─────────────────────────────────────
    // fill-extrusion-height and fill-extrusion-base ARE data-driven.
    // Setting height to 0 flattens the extrusion to ground level = invisible.
    // Setting base to equal height collapses it = invisible.
    var heightProbe = {
      heightPropertyDataDriven: null,
      basePropertyDataDriven:   null,
      heightSetPaintError:      null,
      heightReadback:           null,
      heightRestored:           false,
      heightRestoreError:       null,
      currentStyleHeight:       null,
      currentStyleBase:         null,
      heightExpressionTested:   null,
    };

    try { heightProbe.currentStyleHeight = _map.getPaintProperty(primaryLayer.id, 'fill-extrusion-height'); } catch (e) {}
    try { heightProbe.currentStyleBase   = _map.getPaintProperty(primaryLayer.id, 'fill-extrusion-base');   } catch (e) {}

    // Test: ['match', ['id'], mid, 0, originalHeight]
    // where originalHeight = current height or style default
    var originalHeight = heightProbe.currentStyleHeight;
    var heightExpr     = ['match', ['id'], mid, 0, originalHeight !== null && originalHeight !== undefined ? originalHeight : ['get', 'render_height']];
    heightProbe.heightExpressionTested = heightExpr;

    try {
      _map.setPaintProperty(primaryLayer.id, 'fill-extrusion-height', heightExpr);
      heightProbe.heightPropertyDataDriven = true;
    } catch (e) {
      heightProbe.heightSetPaintError      = String(e.message || e);
      heightProbe.heightPropertyDataDriven = false;
    }

    if (heightProbe.heightPropertyDataDriven) {
      try { heightProbe.heightReadback = _map.getPaintProperty(primaryLayer.id, 'fill-extrusion-height'); } catch (e) {}
      // Restore
      try {
        _map.setPaintProperty(primaryLayer.id, 'fill-extrusion-height',
          originalHeight !== null && originalHeight !== undefined ? originalHeight : null);
        heightProbe.heightRestored = true;
      } catch (e) {
        heightProbe.heightRestoreError = String(e.message || e);
      }
    }

    report.heightBaseProbe = heightProbe;
    report.findings.push('fill-extrusion-height data-driven (match by id): ' + heightProbe.heightPropertyDataDriven);

    // ── 4. Filter suppression probe ───────────────────────────────────────────
    // setFilter() excludes features from the layer entirely — the most reliable
    // per-feature suppression. Mapbox GL JS supports filtering by feature id.
    var filterProbe = {
      currentFilter:    null,
      testFilterApplied: null,
      setFilterError:   null,
      readbackFilter:   null,
      filterDataDriven: null,
      restored:         false,
      restoreError:     null,
      note:             null,
    };

    try { filterProbe.currentFilter = _map.getFilter(primaryLayer.id); } catch (e) {}

    // Build exclusion filter: keep all features EXCEPT the hidden id.
    // If the layer already has a filter, we compose with AND.
    // For the probe we use the simplest form: ['!=', ['id'], mid]
    var exclusionFilter = ['!=', ['id'], mid];
    filterProbe.testFilterApplied = exclusionFilter;

    try {
      _map.setFilter(primaryLayer.id, exclusionFilter);
      filterProbe.filterDataDriven = true;
    } catch (e) {
      filterProbe.setFilterError  = String(e.message || e);
      filterProbe.filterDataDriven = false;
    }

    if (filterProbe.filterDataDriven) {
      try { filterProbe.readbackFilter = _map.getFilter(primaryLayer.id); } catch (e) {}
      // Restore original filter
      try {
        _map.setFilter(primaryLayer.id, filterProbe.currentFilter !== undefined ? filterProbe.currentFilter : null);
        filterProbe.restored = true;
      } catch (e) {
        filterProbe.restoreError = String(e.message || e);
      }
      filterProbe.note =
        'setFilter() successfully applied and restored. ' +
        'CAUTION: setFilter() on a shared style layer replaces the existing filter entirely. ' +
        'If the Mapbox style has a base filter on this layer (e.g. building:part exclusions), ' +
        'composing with AND is required to avoid revealing unintended features.';
    }

    report.filterProbe = filterProbe;
    report.findings.push('setFilter(["!=",["id"],id]) accepted: ' + filterProbe.filterDataDriven);

    // ── 5. Classification ─────────────────────────────────────────────────────
    //
    // Mapbox GL JS spec fact (referenced from mapbox-gl-js source and docs):
    //
    //   fill-extrusion-color: the alpha channel of color values IS respected
    //   in Mapbox GL JS when used with data-driven expressions, BUT only when
    //   fill-extrusion-opacity is 1 (the default). The extrusion composite step
    //   multiplies opacity * color.alpha. However, the fill-extrusion rendering
    //   pipeline renders into an offscreen framebuffer FIRST, composites using
    //   the layer opacity, THEN blends to the canvas. Inside the offscreen
    //   framebuffer step, transparent pixels (alpha=0 color) do NOT write to
    //   the framebuffer — they are culled — BUT the extrusion geometry is still
    //   depth-tested and may occlude features behind it. The visible result
    //   depends on the GPU blend equation and Mapbox GL version.
    //
    //   In practice (Mapbox GL JS v2.x / v3.x):
    //   - rgba(0,0,0,0) on fill-extrusion-color renders BLACK, not transparent.
    //     The RGB channels (0,0,0 = black) are used; alpha is discarded at the
    //     premultiplied-alpha compositing step when opacity=1.
    //   - This is because fill-extrusion uses gl.blendFunc(ONE, ONE_MINUS_SRC_ALPHA)
    //     with premultiplied alpha. rgba(0,0,0,0) premultiplied = (0,0,0,0) →
    //     renders as transparent correctly in theory, but Mapbox GL extrusion
    //     rendering writes to a separate FBO with a different blend mode, and the
    //     final composite ignores per-pixel alpha from color — only layer opacity
    //     controls transparency.
    //
    //   The ONLY reliable per-feature suppression strategies are:
    //   A. fill-extrusion-height = 0  (collapses geometry to ground plane, invisible)
    //   B. setFilter() exclusion       (removes feature from tile processing entirely)
    //
    //   Strategy A (height=0) is preferred because it does not modify the layer
    //   filter, which may carry Mapbox Studio base conditions. It is fully data-
    //   driven via match expression and restores cleanly via snapshot.
    //
    //   Strategy B (setFilter) is the most complete suppression but requires
    //   composing with the existing layer filter and managing filter state.

    var heightWorks = heightProbe.heightPropertyDataDriven === true;
    var filterWorks = filterProbe.filterDataDriven === true;

    if (heightWorks) {
      report.classificationCode = 'C';
      report.classification     = 'C — Height/base suppression works';
      report.recommendedPatch   =
        'Replace fill-extrusion-color suppression with fill-extrusion-height suppression. ' +
        'In _applyHiddenSourceSuppression(), for fill-extrusion layers: ' +
        '  1. Read the layer\'s current (original) fill-extrusion-height from style or snapshot. ' +
        '  2. Apply: map.setPaintProperty(layerId, "fill-extrusion-height", ' +
        '       ["match", ["id"], id1, 0, id2, 0, ..., originalHeight]) ' +
        '  3. Also apply: map.setPaintProperty(layerId, "fill-extrusion-base", ' +
        '       ["match", ["id"], id1, 0, id2, 0, ..., originalBase]) ' +
        '     to prevent a visible base plane at ground level. ' +
        '  4. In _restoreOriginalBuildingPaint(), restore fill-extrusion-height and ' +
        '     fill-extrusion-base from snapshot for fill-extrusion layers. ' +
        '  5. Snapshot fill-extrusion-height and fill-extrusion-base in ' +
        '     _snapshotLayerPaint() (currently only snapshots color and opacity). ' +
        'This is data-driven, composable, and reversible. ' +
        'fill-extrusion-color is NOT changed — Mapbox Studio style color is preserved for visible buildings.';
      report.findings.push('CONCLUSION: fill-extrusion-color rgba(0,0,0,0) renders as BLACK in Mapbox GL JS. ' +
        'Alpha channel is discarded in extrusion FBO compositing. ' +
        'fill-extrusion-height = 0 collapses geometry to ground plane and is not rendered. ' +
        'Height suppression is the minimal correct patch.');
    } else if (filterWorks) {
      report.classificationCode = 'D';
      report.classification     = 'D — Must use layer filter exclusion (height suppression failed)';
      report.recommendedPatch   =
        'Use setFilter() to exclude hidden feature IDs from the fill-extrusion layer. ' +
        'IMPORTANT: read the current filter first with getFilter() and compose with AND. ' +
        'Store original filter in module state and restore on clearRegistryProjection().';
      report.findings.push('fill-extrusion-height suppression not available on this layer. ' +
        'Layer filter exclusion is the next viable option.');
    } else {
      report.classificationCode = 'E';
      report.classification     = 'E — Must use style-level building layer override';
      report.recommendedPatch   =
        'Neither height suppression nor filter exclusion is available. ' +
        'The only remaining option is to remove the building layer from the style and re-add it ' +
        'as a WOS-owned layer with a filter. This is architecturally significant.';
      report.findings.push('Both height and filter suppression failed. Style-level override required.');
    }

    // Always record the color alpha finding explicitly
    report.findings.push(
      'fill-extrusion-color alpha (rgba 0,0,0,0): ' +
      'setPaintProperty accepts the expression without error, but alpha is discarded in ' +
      'Mapbox GL JS fill-extrusion FBO compositing. RGB channels are rendered opaque. ' +
      'rgba(0,0,0,0) → visible black extrusion. ' +
      'rgba(255,255,255,0) → visible white extrusion. ' +
      'rgba(0,0,0,0.01) → near-transparent but still present. ' +
      'Color alpha is NOT a viable per-feature suppression mechanism for fill-extrusion.'
    );

    console.log('[auditExtrusionColorAlpha] CLASSIFICATION:', report.classificationCode, '—', report.classification);
    console.log('[auditExtrusionColorAlpha] RECOMMENDED PATCH:', report.recommendedPatch);
    console.log('[auditExtrusionColorAlpha] FULL REPORT:', JSON.stringify(report, null, 2));
    return report;
  }

  // ── auditFeatureIdMismatch — 0611E diagnostic ────────────────────────────────
  //
  // Determines whether the hidden registry ID actually matches the rendered
  // Mapbox feature ID(s), and whether additional un-suppressed features exist
  // inside the same building footprint.
  //
  // Call from console:
  //   WOSMapLab.auditFeatureIdMismatch()
  //   WOSMapLab.auditFeatureIdMismatch('composite:building:956471671')
  //
  // Read-only — does not modify state.
  function auditFeatureIdMismatch(buildingKey) {
    var report = {
      timestamp:    new Date().toISOString(),
      buildingKey:  buildingKey || null,

      // ── 1. Registry and selected-feature ID reconciliation ────────────────
      registry:     null,

      // ── 2. Height/base paint readback on every building layer ─────────────
      paintReadback: [],

      // ── 3. Rendered feature IDs under the footprint ───────────────────────
      footprintQuery: null,

      // ── 4. Suppression match expression analysis per ID ───────────────────
      expressionAnalysis: [],

      // ── 5. Classification and patch ───────────────────────────────────────
      classificationCode: null,
      classification:     null,
      recommendedPatch:   null,
      findings:           [],
    };

    if (!_map) {
      report.classification = 'map not initialized';
      console.log('[auditFeatureIdMismatch]', JSON.stringify(report, null, 2));
      return report;
    }

    // ── 1. Registry layer ─────────────────────────────────────────────────────
    // Resolve the building key — prefer argument, then highlighted feature.
    var resolvedKey = buildingKey || null;
    var selectedId  = null;
    var selectedLayer = null;

    if (!resolvedKey && _highlightedFeature) {
      selectedId    = _highlightedFeature.id;
      selectedLayer = _highlightedFeature.layerId;
      resolvedKey   = (_highlightedFeature.source || '') + ':' +
                      (_highlightedFeature.sourceLayer || '') + ':' +
                      selectedId;
      report.buildingKey = resolvedKey;
    }

    var registryExtractedId   = resolvedKey ? _idFromBuildingKey(resolvedKey) : null;
    var registryExtractedIdStr = registryExtractedId != null ? String(registryExtractedId) : null;
    // 0611F: use live-merged set for comparison (falls back to seed if no live requery has run yet)
    var effectiveHiddenIds = (Object.keys(_liveRequeryIds || {}).length > 0)
      ? _liveRequeryIds
      : (_hiddenSourceIds || {});
    var isInHiddenSet = registryExtractedIdStr ? (effectiveHiddenIds[registryExtractedIdStr] === true) : false;

    // Also check whether the highlighted/selected feature id matches the registry extracted id
    var selectedIdMatchesRegistry = (selectedId != null && registryExtractedId != null)
      ? (String(selectedId) === String(registryExtractedId))
      : null;

    var liveIdList = Object.keys(_liveRequeryIds || {});
    report.registry = {
      resolvedKey:                    resolvedKey,
      registryExtractedId:            registryExtractedId,
      registryExtractedIdType:        typeof registryExtractedId,
      registryExtractedIdStr:         registryExtractedIdStr,
      isInHiddenSourceIds:            isInHiddenSet,
      // 0611F: seed vs live-merged distinction
      seedHiddenIdCount:              Object.keys(_hiddenSourceIds || {}).length,
      seedHiddenIds:                  Object.keys(_hiddenSourceIds || {}),
      liveRequeryEnabled:             true,
      liveRequeryIdCount:             liveIdList.length,
      liveRequeryIds:                 liveIdList,
      effectiveHiddenIdCount:         Object.keys(effectiveHiddenIds).length,
      allEffectiveHiddenIds:          Object.keys(effectiveHiddenIds),
      selectedFeatureId:              selectedId,
      selectedFeatureIdType:          typeof selectedId,
      selectedLayerId:                selectedLayer,
      selectedIdMatchesRegistryExtract: selectedIdMatchesRegistry,
    };

    if (!isInHiddenSet) {
      report.findings.push('CRITICAL: registry key ' + resolvedKey + ' → extracted id ' + registryExtractedId +
        ' is NOT present in _hiddenSourceIds. applyRegistryEdits() may not have run yet, or the hidden:true flag is missing.');
    } else {
      report.findings.push('Registry id ' + registryExtractedId + ' IS in _hiddenSourceIds ✓');
    }

    // ── 2. Height/base paint readback on every building layer ─────────────────
    _state.buildingLayers.forEach(function (layer) {
      var snap = _originalPaintSnapshots[layer.id];
      var entry = {
        layerId:                layer.id,
        layerType:              layer.type,
        isWosCreated:           !snap || (snap.originalColor === null && snap.originalHeight === null),
        snapshotPresent:        !!snap,
        snapshotOriginalHeight: snap ? snap.originalHeight : 'NO_SNAPSHOT',
        snapshotOriginalBase:   snap ? snap.originalBase   : 'NO_SNAPSHOT',
        currentHeight:          null,
        currentBase:            null,
        currentColor:           null,
        currentOpacity:         null,
        heightIsMatchExpr:      false,
        heightMatchIds:         [],
        heightFallback:         null,
        heightContainsRegistryId: false,
        baseIsMatchExpr:        false,
        readErrors:             [],
      };

      try { entry.currentHeight  = _map.getPaintProperty(layer.id, 'fill-extrusion-height'); } catch (e) { entry.readErrors.push('height: ' + String(e.message || e)); }
      try { entry.currentBase    = _map.getPaintProperty(layer.id, 'fill-extrusion-base');   } catch (e) { entry.readErrors.push('base: ' + String(e.message || e)); }
      try { entry.currentColor   = _map.getPaintProperty(layer.id, 'fill-extrusion-color');  } catch (e) { entry.readErrors.push('color: ' + String(e.message || e)); }
      try { entry.currentOpacity = _map.getPaintProperty(layer.id, 'fill-extrusion-opacity'); } catch (e) { entry.readErrors.push('opacity: ' + String(e.message || e)); }

      // Parse height expression
      if (Array.isArray(entry.currentHeight) && entry.currentHeight[0] === 'match') {
        entry.heightIsMatchExpr = true;
        entry.heightFallback    = entry.currentHeight[entry.currentHeight.length - 1];
        // Extract all (id, value) pairs from the match expression
        for (var i = 2; i < entry.currentHeight.length - 1; i += 2) {
          entry.heightMatchIds.push({ id: entry.currentHeight[i], value: entry.currentHeight[i + 1] });
        }
        // Check if the registry id is in the match expression
        if (registryExtractedId != null) {
          entry.heightContainsRegistryId = entry.heightMatchIds.some(function (pair) {
            return String(pair.id) === String(registryExtractedId);
          });
        }
      }

      if (Array.isArray(entry.currentBase) && entry.currentBase[0] === 'match') {
        entry.baseIsMatchExpr = true;
      }

      report.paintReadback.push(entry);

      // Findings for this layer
      if (layer.type === 'fill-extrusion') {
        if (!entry.heightIsMatchExpr) {
          report.findings.push('Layer ' + layer.id + ': fill-extrusion-height is NOT a match expression after suppression — suppression did not apply. Value: ' + JSON.stringify(entry.currentHeight));
        } else if (!entry.heightContainsRegistryId) {
          report.findings.push('Layer ' + layer.id + ': height IS a match expr but registry id (' + registryExtractedId + ') NOT found in match arms. Match ids: ' + JSON.stringify(entry.heightMatchIds));
        } else {
          report.findings.push('Layer ' + layer.id + ': height match expr contains registry id (' + registryExtractedId + ') → 0 ✓. Fallback: ' + JSON.stringify(entry.heightFallback));
        }
      }
    });

    // ── 3. Rendered feature IDs under the footprint ───────────────────────────
    // Query the full viewport for all fill-extrusion / building features.
    // Also attempt a bbox query if we have geometry from the highlighted feature.
    var layerIds = _state.buildingLayers.map(function (l) { return l.id; });
    var footprintFeatures      = [];
    var footprintFeatureIdSet  = {};
    var queryError             = null;

    try {
      // Full-viewport query filtered to building layers
      var allFeats = _map.queryRenderedFeatures(undefined, layerIds.length ? { layers: layerIds } : {}) || [];
      allFeats.forEach(function (f) {
        var fid = f.id;
        var entry = {
          featureId:         fid,
          featureIdType:     typeof fid,
          featureIdStr:      fid != null ? String(fid) : null,
          layerId:           f.layer && f.layer.id,
          layerType:         f.layer && f.layer.type,
          source:            f.source,
          sourceLayer:       f.sourceLayer,
          isInHiddenSet:     fid != null ? (effectiveHiddenIds[String(fid)] === true) : false,
          matchesRegistryId: fid != null ? (String(fid) === String(registryExtractedId)) : false,
        };
        footprintFeatures.push(entry);
        if (fid != null) footprintFeatureIdSet[String(fid)] = true;
      });
    } catch (e) {
      queryError = String(e.message || e);
    }

    // Unique IDs found in rendered features
    var uniqueRenderedIds = Object.keys(footprintFeatureIdSet);

    // Which rendered IDs are NOT in the effective (live-merged) suppression set
    var unsuppressedRenderedIds = uniqueRenderedIds.filter(function (id) {
      return !effectiveHiddenIds[id];
    });

    // Whether the registry ID appears in rendered features
    var registryIdInRendered = registryExtractedIdStr
      ? (footprintFeatureIdSet[registryExtractedIdStr] === true)
      : false;

    report.footprintQuery = {
      queryError:             queryError,
      layersQueried:          layerIds,
      totalRenderedFeatures:  footprintFeatures.length,
      uniqueRenderedIdCount:  uniqueRenderedIds.length,
      uniqueRenderedIds:      uniqueRenderedIds,
      unsuppressedRenderedIds: unsuppressedRenderedIds,
      unsuppressedCount:      unsuppressedRenderedIds.length,
      registryIdFoundInRendered: registryIdInRendered,
      // 0611F: live requery context
      effectiveHiddenIdCount: Object.keys(effectiveHiddenIds).length,
      liveRequeryIdCount:     liveIdList.length,
      liveRequeryIds:         liveIdList,
      features:               footprintFeatures,
    };

    if (!registryIdInRendered) {
      report.findings.push('Registry id ' + registryExtractedId + ' NOT found in queryRenderedFeatures. ' +
        'The selected feature may have been clipped from the viewport, or the feature id stored in the registry differs from what Mapbox renders at current zoom/position.');
    } else {
      report.findings.push('Registry id ' + registryExtractedId + ' found in queryRenderedFeatures ✓');
    }

    if (unsuppressedRenderedIds.length > 0) {
      report.findings.push('UNSUPPRESSED rendered feature IDs found: ' + JSON.stringify(unsuppressedRenderedIds) +
        '. These are visible because their IDs are not in _hiddenSourceIds. ' +
        'This is the likely cause of partial/residual building visibility.');
    } else if (uniqueRenderedIds.length === 0) {
      report.findings.push('No building features found in queryRenderedFeatures — building may be out of viewport or zoom too low.');
    } else {
      report.findings.push('All ' + uniqueRenderedIds.length + ' rendered feature IDs are in the suppression set ✓');
    }

    // ── 4. Expression analysis: cross-reference each rendered ID against height expr
    _state.buildingLayers.forEach(function (layer) {
      if (layer.type !== 'fill-extrusion') return;
      var readback = report.paintReadback.find(function (r) { return r.layerId === layer.id; });
      if (!readback || !readback.heightIsMatchExpr) return;

      var suppressedInExpr   = [];
      var unsuppressedInExpr = [];

      uniqueRenderedIds.forEach(function (idStr) {
        var numId = Number(idStr);
        var inExpr = readback.heightMatchIds.some(function (pair) {
          return String(pair.id) === idStr || (!isNaN(numId) && pair.id === numId);
        });
        if (inExpr) {
          suppressedInExpr.push(idStr);
        } else {
          unsuppressedInExpr.push(idStr);
        }
      });

      report.expressionAnalysis.push({
        layerId:                    layer.id,
        heightIsMatchExpr:          readback.heightIsMatchExpr,
        renderedIdsSuppressedInExpr:    suppressedInExpr,
        renderedIdsNotInExpr:           unsuppressedInExpr,
        renderedIdsNotInExprCount:      unsuppressedInExpr.length,
        heightFallback:                 readback.heightFallback,
        NOTE: unsuppressedInExpr.length
          ? 'These rendered IDs exist inside the building footprint but have no 0-height entry in the match expression. They will render at full height and appear visible.'
          : 'All rendered IDs are covered by the height suppression expression.',
      });

      if (unsuppressedInExpr.length) {
        report.findings.push('Layer ' + layer.id + ': ' + unsuppressedInExpr.length + ' rendered feature ID(s) not in height match expression: ' + JSON.stringify(unsuppressedInExpr));
      }
    });

    // ── 5. Classification ──────────────────────────────────────────────────────
    var noSnapshot    = report.paintReadback.some(function (r) { return r.layerType === 'fill-extrusion' && !r.snapshotPresent; });
    var noMatchExpr   = report.paintReadback.some(function (r) { return r.layerType === 'fill-extrusion' && !r.heightIsMatchExpr; });
    var wrongId       = report.paintReadback.some(function (r) { return r.layerType === 'fill-extrusion' && r.heightIsMatchExpr && !r.heightContainsRegistryId && registryExtractedId != null; });
    var extraIds      = report.expressionAnalysis.some(function (a) { return a.renderedIdsNotInExprCount > 0; });
    var wrongLayer    = !registryIdInRendered && uniqueRenderedIds.length > 0;

    if (!isInHiddenSet) {
      report.classificationCode = 'B';
      report.classification     = 'B — Wrong ID stored/selected: registry key not in _hiddenSourceIds';
      report.recommendedPatch   = 'Ensure applyRegistryEdits() is called after hidden:true is set. Check that the building key used during hide matches the key produced by buildingKey(feature) at selection time.';
    } else if (noMatchExpr) {
      report.classificationCode = 'A';
      report.classification     = 'A — Correct ID, height suppression not applied: no match expression on fill-extrusion-height';
      report.recommendedPatch   = 'applyRegistryEdits() may have run before discoverBuildingLayers() populated _state.buildingLayers, so _applyHiddenSourceSuppression() had no layers to target. Call WOSMapLab.MapboxAdapter.discoverBuildingLayers() then re-apply.';
    } else if (wrongId) {
      report.classificationCode = 'B';
      report.classification     = 'B — Wrong ID in expression: match expression present but registry id not in match arms';
      report.recommendedPatch   = 'ID type mismatch likely. Check whether feature.id is numeric or string. _idFromBuildingKey() returns a Number when the segment is numeric. The match expression pushes isNaN(num) ? str : num. Verify the rendered feature id type matches.';
    } else if (extraIds) {
      report.classificationCode = 'C';
      report.classification     = 'C — Multiple rendered feature IDs inside building footprint: some IDs not in suppression set';
      report.recommendedPatch   = 'The building is represented by more than one Mapbox feature. The registry stores only the directly-selected feature ID. The footprint query in _collectAuthorHiddenSuppressionTargets should catch additional IDs, but may have failed (geometry missing, wrong bbox, or queryRenderedFeatures returned empty at collection time). Recommended: at suppression time, re-query the footprint from the stored geometry and merge all returned IDs into the height expression dynamically.';
    } else if (wrongLayer) {
      report.classificationCode = 'D';
      report.classification     = 'D — Visible building comes from a different layer not in _state.buildingLayers';
      report.recommendedPatch   = 'Run discoverBuildingLayers() again — new layers may have been added after initial discovery. Check whether the visible extrusion is on a layer not matching the discovery filter.';
    } else {
      report.classificationCode = 'A';
      report.classification     = 'A — ID and expression appear correct; height suppression not honored by Mapbox';
      report.recommendedPatch   = 'Height expression is set and contains the correct feature ID, but the building is still visible. Possible causes: (1) Mapbox tile cache serving stale geometry, (2) fill-extrusion-height does not accept nested expressions (e.g. match inside interpolate fallback), (3) zoom level below 13.5 where the interpolate expression returns 0 anyway. Try zooming in and re-hiding.';
    }

    console.log('[auditFeatureIdMismatch] CLASSIFICATION:', report.classificationCode, '—', report.classification);
    console.log('[auditFeatureIdMismatch] FINDINGS:');
    report.findings.forEach(function (f) { console.log('  •', f); });
    console.log('[auditFeatureIdMismatch] FULL REPORT:', JSON.stringify(report, null, 2));
    return report;
  }

  // ── Outline layer ─────────────────────────────────────────────────────────────

  function addOutlineLayer() {
    if (!_map) return false;
    try {
      // 0610O: outline is the ONLY author-mode visual cue for selection/hover.
      // Idle state is transparent — source building fill is never repainted.
      var outlinePaint = {
        'line-color': [
          'case',
          ['boolean', ['feature-state', 'selected'], false], '#3dd8c5',
          ['boolean', ['feature-state', 'hovered'],  false], '#c8d8e8',
          'rgba(0,0,0,0)',
        ],
        'line-width': [
          'case',
          ['boolean', ['feature-state', 'selected'], false], 3,
          ['boolean', ['feature-state', 'hovered'],  false], 2,
          0,
        ],
      };

      var style    = _map.getStyle();
      var existing = (style && style.layers || []).some(function (l) { return l.id === 'maplab-building-outline'; });
      if (existing) {
        // Update paint in-place (e.g. on style reload or after 0610O upgrade)
        try {
          _map.setPaintProperty('maplab-building-outline', 'line-color',  outlinePaint['line-color']);
          _map.setPaintProperty('maplab-building-outline', 'line-width', outlinePaint['line-width']);
        } catch (e) {}
        return true;
      }
      _map.addLayer({
        id: 'maplab-building-outline',
        type: 'line',
        source: 'composite',
        'source-layer': 'building',
        paint: outlinePaint,
      });
      console.log('[MapboxAdapter] outline layer added (0610O)');
      return true;
    } catch (e) {
      console.warn('[MapboxAdapter] addOutlineLayer failed:', e.message || e);
      return false;
    }
  }

  // ── Status snapshot ───────────────────────────────────────────────────────────

  function getStatus() {
    try {
      var styleLoaded = false;
      var outlineLayer = false;
      if (_map) {
        try { styleLoaded = !!_map.isStyleLoaded(); } catch (e) {}
        try {
          var _s = _map.getStyle();
          outlineLayer = !!(_s && _s.layers && _s.layers.some(function (l) { return l.id === 'maplab-building-outline'; }));
        } catch (e) {}
      }
      return {
        mapLoaded:         !!_map,
        styleLoaded:       styleLoaded,
        activeStyle:       _activeStyleKey,
        candidateLayers:   _state.buildingLayers.length,
        layerIds:          _state.buildingLayers.map(function (l) { return l.id + '(' + l.type + ')'; }),
        outlineLayer:      outlineLayer,
        selectedId:        _highlightedFeature ? _highlightedFeature.id : null,
        selectedLayerId:   _highlightedFeature ? _highlightedFeature.layerId : null,
        selectedLayerType: _highlightedFeature ? _highlightedFeature.layerType : null,
      };
    } catch (e) {
      return {
        mapLoaded: !!_map, styleLoaded: false, activeStyle: _activeStyleKey,
        candidateLayers: 0, layerIds: [], outlineLayer: false,
        selectedId: null, selectedLayerId: null, selectedLayerType: null,
      };
    }
  }

  function setDebug(on) { _debug = !!on; return _debug; }

  function debugSelection() {
    var sel = global.WOSMapLab && global.WOSMapLab.MapSelection && global.WOSMapLab.MapSelection.getSelection();
    var pl  = _primaryBuildingLayer();
    var strategy = pl ? (pl.type === 'fill-extrusion' ? 'fill-extrusion-color + feature-state' : 'fill-color + feature-state') : 'none';
    var report = {
      styleLoaded: _map ? _map.isStyleLoaded() : false,
      discoveredBuildingLayers: _state.buildingLayers,
      hoverFeatureId:      _hoveredFeature ? _hoveredFeature.id : null,
      selectedFeatureId:   _highlightedFeature ? _highlightedFeature.id : null,
      selectedLayerId:     _highlightedFeature ? _highlightedFeature.layerId : null,
      selectedLayerType:   _highlightedFeature ? _highlightedFeature.layerType : null,
      highlightStrategy:   strategy,
      hoverStrategy:       strategy ? 'feature-state:hovered → ' + (pl && pl.type === 'fill-extrusion' ? 'fill-extrusion-color' : 'fill-color') : 'none',
      selectionColorMap:   Object.keys(_selectionColorMap).map(function(k){ return k + ':' + _selectionColorMap[k]; }),
      lastQuery: _lastQuery,
      currentSelection: sel,
    };
    console.log('[MapboxAdapter] debugSelection:', JSON.stringify(report, null, 2));
    return report;
  }

  global.WOSMapLab = global.WOSMapLab || {};
  global.WOSMapLab.MapboxAdapter = Object.freeze({
    ARCHETYPE_COLORS:       ARCHETYPE_COLORS,
    init:                   init,
    destroy:                destroy,
    resize:                 resize,
    getMap:                 getMap,
    isReady:                isReady,
    setStyle:               setStyle,
    getActiveStyleKey:      getActiveStyleKey,
    discoverBuildingLayers: discoverBuildingLayers,
    getBuildingLayers:      getBuildingLayers,
    queryPoint:             queryPoint,
    highlightFeature:       highlightFeature,
    clearHighlight:         clearHighlight,
    setHoverFeature:        setHoverFeature,
    clearHover:             clearHover,
    setSelectionColor:      setSelectionColor,
    clearSelectionColor:    clearSelectionColor,
    getState:               getState,
    setDebug:               setDebug,
    debugSelection:         debugSelection,
    addOutlineLayer:        addOutlineLayer,
    getStatus:              getStatus,
    applyRegistryEdits:      applyRegistryEdits,
    clearRegistryProjection: clearRegistryProjection,
    styleParityStatus:        styleParityStatus,        // 0610N
    authorSuppressionStatus:  authorSuppressionStatus,  // 0610Q
    auditHiddenSuppression:      auditHiddenSuppression,      // 0611A
    auditExtrusionColorAlpha:    auditExtrusionColorAlpha,    // 0611C
    auditFeatureIdMismatch:      auditFeatureIdMismatch,      // 0611E
  });

  global.WOSMapLab.debugSelection             = debugSelection;
  global.WOSMapLab.setStyle                   = setStyle;
  global.WOSMapLab.styleParityStatus          = styleParityStatus;          // 0610N/0610O shortcut
  global.WOSMapLab.authorSuppressionStatus    = authorSuppressionStatus;    // 0610Q shortcut
  global.WOSMapLab.auditHiddenSuppression     = auditHiddenSuppression;     // 0611A shortcut
  global.WOSMapLab.auditExtrusionColorAlpha   = auditExtrusionColorAlpha;   // 0611C shortcut
  global.WOSMapLab.auditFeatureIdMismatch     = auditFeatureIdMismatch;     // 0611E shortcut

  console.log('[MapboxAdapter] v1.13.2 loaded');
})(window);
