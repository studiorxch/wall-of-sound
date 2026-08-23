// ── MapsGeographicStyleApplyAdapters v1.0.0 ───────────────────────────────────
// 0729A_MAPS_Palette_Audit_Default_Wiring; renamed from MapsPaletteApplyAdapters
// by 0729D_MAPS_Vehicle_Overlay_Libraries_Foundation's terminology-migration gate.
// Status: active | Classification: presentation-authority / geographic-style-adapters
//
// Translates a GeographicStylePropertyRecord + value into the correct live
// mutation for its source, and reads the current live value back (used by the
// diagnostic round-trip check). One small function per wired source — nothing
// here touches a deferred system.
//
// vehicle/hud/overlay dispatch moved OUT of this file in 0729D Phase 2/3 —
// see standalone vehicleStyleApplyAdapters.js/overlayStyleApplyAdapters.js.
//
// Placement: wall/systems/presentation/mapsGeographicStyleApplyAdapters.js
// Load: AFTER mapsGeographicStyleRegistry.js, BEFORE mapsGeographicStyleAuthority.js.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  function _clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function _readStyleLayers(map) {
    if (!map || typeof map.getStyle !== 'function') return [];
    try {
      var style = map.getStyle();
      return (style && style.layers) || [];
    } catch (e) {
      return [];
    }
  }

  function _readImportedStyleLayers(map) {
    if (!map || typeof map.getStyle !== 'function') return [];
    try {
      var style = map.getStyle();
      var out = [];
      ((style && style.imports) || []).forEach(function (imp) {
        var importLayers = imp && imp.data && Array.isArray(imp.data.layers)
          ? imp.data.layers : [];
        importLayers.forEach(function (layer) {
          if (!layer) return;
          layer.__mapsImportedStyle = true;
          layer.__mapsImportedStyleId = imp && imp.id ? imp.id : null;
          out.push(layer);
        });
      });
      return out;
    } catch (e) {
      return [];
    }
  }

  function _readStyleImports(map) {
    if (!map || typeof map.getStyle !== 'function') return [];
    try {
      var style = map.getStyle();
      return (style && style.imports) || [];
    } catch (e) {
      return [];
    }
  }

  function _isControllableBuildingLayer(layer) {
    if (!layer || layer.type !== 'fill-extrusion') return false;
    var id = String(layer.id || '');
    var sourceLayer = String(layer['source-layer'] || '');
    if (/^indoor-/i.test(id)) return false;
    if (sourceLayer.toLowerCase() === 'building') return true;
    return /(^|-)building($|-)/i.test(id);
  }

  function _isControllableBuildingModelLayer(layer) {
    if (!layer || layer.type !== 'model') return false;
    var id = String(layer.id || '');
    var sourceLayer = String(layer['source-layer'] || '');
    if (/^indoor-/i.test(id)) return false;
    if (sourceLayer && /building|landmark|object/i.test(sourceLayer)) return true;
    return /building|landmark|object/i.test(id);
  }

  function _isControllableBuildingPresentationLayer(layer) {
    if (!layer) return false;
    var id = String(layer.id || '');
    var sourceLayer = String(layer['source-layer'] || '');
    var type = String(layer.type || '');
    if (/^indoor-/i.test(id)) return false;
    var isBuildingish = /building|landmark|object/i.test(id) || /building|landmark|object/i.test(sourceLayer);
    if (!isBuildingish) return false;
    return ['fill-extrusion', 'model', 'fill', 'line'].indexOf(type) !== -1;
  }

  function _discoverBuildingLayers(map) {
    var seen = {};
    var layers = [];

    function pushIfBuilding(layer) {
      if (!layer || !layer.id || seen[layer.id]) return;
      if (!_isControllableBuildingLayer(layer)) return;
      seen[layer.id] = true;
      layers.push(layer);
    }

    _readStyleLayers(map).forEach(pushIfBuilding);
    _readImportedStyleLayers(map).forEach(pushIfBuilding);
    return layers;
  }

  function _discoverBuildingModelLayers(map) {
    var seen = {};
    var layers = [];

    function pushIfModel(layer) {
      if (!layer || !layer.id || seen[layer.id]) return;
      if (!_isControllableBuildingModelLayer(layer)) return;
      seen[layer.id] = true;
      layers.push(layer);
    }

    _readStyleLayers(map).forEach(pushIfModel);
    _readImportedStyleLayers(map).forEach(pushIfModel);
    return layers;
  }

  function _discoverBuildingPresentationLayers(map) {
    var seen = {};
    var layers = [];

    function pushIfPresentationLayer(layer) {
      if (!layer || !layer.id || seen[layer.id]) return;
      if (!_isControllableBuildingPresentationLayer(layer)) return;
      seen[layer.id] = true;
      layers.push(layer);
    }

    _readStyleLayers(map).forEach(pushIfPresentationLayer);
    _readImportedStyleLayers(map).forEach(pushIfPresentationLayer);
    return layers;
  }

  function _desiredImportedBuildingVisibility(layer, visible, flatColor) {
    var type = String((layer && layer.type) || '');
    if (type === 'model') return visible && !flatColor ? 'visible' : 'none';
    return visible ? 'visible' : 'none';
  }

  var IMPORTED_BUILDING_VISIBILITY_KEYS = [
    'show3dBuildings',
    'show3dFacades',
    'showBuildings',
    'showBuildingExtrusions'
  ];

  var IMPORTED_BUILDING_OBJECT_KEYS = [
    'show3dObjects',
    'show3dLandmarks'
  ];

  function _importLayerColorProperty(layer) {
    var type = String((layer && layer.type) || '');
    if (type === 'fill-extrusion') return 'fill-extrusion-color';
    if (type === 'fill') return 'fill-color';
    if (type === 'line') return 'line-color';
    return null;
  }

  function _applyImportedBuildingStyleViaSetStyle(map, options) {
    if (!map || typeof map.getStyle !== 'function' || typeof map.setStyle !== 'function') return false;
    var style;
    try { style = map.getStyle(); } catch (e) { return false; }
    if (!style || !Array.isArray(style.imports) || !style.imports.length) return false;

    var visible = !!(options && options.visible);
    var flatColor = !!(options && options.flatColor);
    var color = options && options.color ? options.color : null;
    var opacity = typeof (options && options.opacity) === 'number' ? options.opacity : null;

    var changed = false;
    var cloned;
    try { cloned = JSON.parse(JSON.stringify(style)); } catch (e) { return false; }

    cloned.imports.forEach(function (imp) {
      if (!imp || !imp.data || !Array.isArray(imp.data.layers)) return;
      imp.data.layers.forEach(function (layer) {
        if (!_isControllableBuildingPresentationLayer(layer)) return;

        var desiredVisibility = _desiredImportedBuildingVisibility(layer, visible, flatColor);
        layer.layout = layer.layout || {};
        if ((layer.layout.visibility || 'visible') !== desiredVisibility) {
          layer.layout.visibility = desiredVisibility;
          changed = true;
        }

        var colorProp = _importLayerColorProperty(layer);
        if (colorProp && color) {
          layer.paint = layer.paint || {};
          if (layer.paint[colorProp] !== color) {
            layer.paint[colorProp] = color;
            changed = true;
          }
        }
        if (layer.type === 'fill-extrusion' && opacity != null) {
          layer.paint = layer.paint || {};
          if (layer.paint['fill-extrusion-opacity'] !== opacity) {
            layer.paint['fill-extrusion-opacity'] = opacity;
            changed = true;
          }
        }
      });

      if (!imp.config) return;
      IMPORTED_BUILDING_VISIBILITY_KEYS.forEach(function (key) {
        if (!Object.prototype.hasOwnProperty.call(imp.config, key)) return;
        if (imp.config[key] !== !!visible) {
          imp.config[key] = !!visible;
          changed = true;
        }
      });
      IMPORTED_BUILDING_OBJECT_KEYS.forEach(function (key) {
        if (!Object.prototype.hasOwnProperty.call(imp.config, key)) return;
        var nextValue = !!visible && !flatColor;
        if (imp.config[key] !== nextValue) {
          imp.config[key] = nextValue;
          changed = true;
        }
      });

      if (!color || !Object.prototype.hasOwnProperty.call(imp.config, 'colorBuildings')) return;
      var rgba = _parseCssColor(color);
      if (rgba) {
        if (opacity != null) rgba.a = opacity;
        var nextColor = _formatRgba(rgba);
        if (imp.config.colorBuildings !== nextColor) {
          imp.config.colorBuildings = nextColor;
          changed = true;
        }
      }
    });

    if (!changed) return false;
    try {
      map.setStyle(cloned);
      return true;
    } catch (e) {
      return false;
    }
  }

  function _discoverImportedBuildingConfigImports(map) {
    return _readStyleImports(map).filter(function (imp) {
      var importLayers = imp && imp.data && Array.isArray(imp.data.layers)
        ? imp.data.layers : [];
      return importLayers.some(_isControllableBuildingLayer);
    });
  }

  function _discoverTopLevelBuildingLayers(map) {
    return _readStyleLayers(map).filter(_isControllableBuildingLayer);
  }

  function _discoverTopLevelBuildingModelLayers(map) {
    return _readStyleLayers(map).filter(_isControllableBuildingModelLayer);
  }

  function _discoverTopLevelBuildingPresentationLayers(map) {
    return _readStyleLayers(map).filter(_isControllableBuildingPresentationLayer);
  }

  function _parseCssColor(color) {
    if (typeof color !== 'string' || !color.trim() || !global.document) return null;
    var probe = global.document.createElement('span');
    probe.style.color = '';
    probe.style.color = color;
    if (!probe.style.color) return null;
    probe.style.display = 'none';
    (global.document.body || global.document.documentElement).appendChild(probe);
    var computed = '';
    try { computed = global.getComputedStyle(probe).color || ''; } catch (e) {}
    probe.parentNode && probe.parentNode.removeChild(probe);
    var m = computed.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
    if (!m) return null;
    return {
      r: Math.max(0, Math.min(255, parseFloat(m[1]))),
      g: Math.max(0, Math.min(255, parseFloat(m[2]))),
      b: Math.max(0, Math.min(255, parseFloat(m[3]))),
      a: m[4] == null ? 1 : _clamp(parseFloat(m[4]), 0, 1),
    };
  }

  function _formatRgba(color) {
    if (!color) return null;
    return 'rgba(' +
      Math.round(color.r) + ', ' +
      Math.round(color.g) + ', ' +
      Math.round(color.b) + ', ' +
      _clamp(color.a, 0, 1) + ')';
  }

  function _readImportedBuildingConfigColor(map) {
    var imports = _discoverImportedBuildingConfigImports(map);
    if (!imports.length) return null;
    var importId = imports[0].id;
    if (typeof map.getConfigProperty === 'function' && importId) {
      try {
        var runtimeValue = map.getConfigProperty(importId, 'colorBuildings');
        if (typeof runtimeValue === 'string' && runtimeValue) return runtimeValue;
      } catch (e) {}
    }
    for (var i = 0; i < imports.length; i++) {
      var cfg = imports[i] && imports[i].config;
      if (cfg && typeof cfg.colorBuildings === 'string' && cfg.colorBuildings) {
        return cfg.colorBuildings;
      }
    }
    return null;
  }

  function _setImportedBuildingConfigColor(map, colorValue, alphaOverride) {
    if (!map || typeof map.setConfigProperty !== 'function') return false;
    var imports = _discoverImportedBuildingConfigImports(map);
    if (!imports.length) return false;

    var base = _parseCssColor(colorValue) || _parseCssColor(_readImportedBuildingConfigColor(map) || '');
    if (!base) return false;
    if (alphaOverride != null) base.a = _clamp(alphaOverride, 0, 1);
    var nextColor = _formatRgba(base);
    if (!nextColor) return false;

    var ok = false;
    imports.forEach(function (imp) {
      if (!imp || !imp.id) return;
      try {
        map.setConfigProperty(imp.id, 'colorBuildings', nextColor);
        ok = true;
      } catch (e) {}
    });
    return ok;
  }

  function _buildingBaseFilter() {
    return ['==', ['get', 'extrude'], 'true'];
  }

  function _buildingDensityFilter(mode) {
    var base = _buildingBaseFilter();
    if (mode === 'CONTEXTUAL') {
      return ['all', base, ['>=', ['coalesce', ['to-number', ['get', 'height']], 0], 20]];
    }
    if (mode === 'EDITORIAL') {
      return ['all', base, ['>=', ['coalesce', ['to-number', ['get', 'height']], 0], 60]];
    }
    return base;
  }

  // ── Mapbox style paint properties ─────────────────────────────────────────
  // Geographic Style values are always stored as strings (GeographicStyleRecord.
  // values is Record<string,string>) — opacity properties need the numeric form
  // Mapbox's setPaintProperty actually expects; color properties pass the
  // string straight through unchanged, same as before this build.
  function _applyMapboxStyle(record, value, map) {
    if (!map || typeof map.setPaintProperty !== 'function') return;
    if (!map.getLayer(record.sourceObject)) return; // layer not present on this map/style — skip, no throw
    var applied = value;
    if (record.valueKind === 'opacity') {
      var n = parseFloat(value);
      if (isNaN(n)) return;
      applied = Math.max(0, Math.min(1, n));
    }
    map.setPaintProperty(record.sourceObject, record.sourceProperty, applied);
  }

  function _readMapboxStyle(record, map) {
    if (!map || typeof map.getPaintProperty !== 'function') return undefined;
    if (!map.getLayer(record.sourceObject)) return undefined;
    var value = map.getPaintProperty(record.sourceObject, record.sourceProperty);
    return record.valueKind === 'opacity' && typeof value === 'number' ? String(value) : value;
  }

  function _syncReplacementBuildingPresentation() {
    var runtime = SBE.BuildingReplacementRuntime;
    if (!runtime || typeof runtime.syncGeographicStylePresentation !== 'function') return;
    try { runtime.syncGeographicStylePresentation(); } catch (e) {}
  }

  function _readActiveBuildingAuthorityValues() {
    var authority = SBE.MapsGeographicStyleAuthority;
    if (!authority || typeof authority.getGeographicStyle !== 'function') return null;
    try {
      var liveId = typeof authority.getPreviewId === 'function' ? authority.getPreviewId() : null;
      if (liveId == null && typeof authority.getActiveId === 'function') liveId = authority.getActiveId();
      if (!liveId) return null;
      var style = authority.getGeographicStyle(liveId);
      return style && style.values ? style.values : null;
    } catch (e) {
      return null;
    }
  }

  function _setImportedBuildingVisibility(map, visible) {
    if (!map || typeof map.setConfigProperty !== 'function') return false;
    var imports = _discoverImportedBuildingConfigImports(map);
    if (!imports.length) return false;
    var keys = ['show3dBuildings', 'show3dFacades', 'show3dObjects', 'show3dLandmarks', 'showBuildings', 'showBuildingExtrusions'];
    var ok = false;
    imports.forEach(function (imp) {
      if (!imp || !imp.id) return;
      keys.forEach(function (key) {
        try {
          map.setConfigProperty(imp.id, key, !!visible);
          ok = true;
        } catch (e) {}
      });
    });
    return ok;
  }

  function syncLiveBuildingPresentationFromAuthority(map) {
    if (!map) return { ok: false, reason: 'map_unavailable' };
    var values = _readActiveBuildingAuthorityValues();
    if (!values) return { ok: false, reason: 'style_unavailable' };

    var layers = _discoverTopLevelBuildingLayers(map);
    var modelLayers = _discoverTopLevelBuildingModelLayers(map);
    var presentationLayers = _discoverTopLevelBuildingPresentationLayers(map);
    var topLevelLayers = _discoverTopLevelBuildingLayers(map);
    var hasImportedConfigLayers = _discoverImportedBuildingConfigImports(map).length > 0;
    var visible = values['mapbox-buildings.3d.visibility'] !== 'false';
    var color = typeof values['mapbox-buildings.3d.color'] === 'string' && values['mapbox-buildings.3d.color']
      ? values['mapbox-buildings.3d.color']
      : null;
    var flatColor = !!_parseCssColor(color || '');
    var opacity = parseFloat(values['mapbox-buildings.3d.opacity']);
    var scale = parseFloat(values['mapbox-buildings.3d.height-scale']);
    var minzoom = parseFloat(values['mapbox-buildings.3d.minzoom']);
    var maxzoom = parseFloat(values['mapbox-buildings.3d.maxzoom']);
    var filter = _buildingDensityFilter(values['mapbox-buildings.3d.density-mode']);

    if (isNaN(opacity)) opacity = null;
    else opacity = _clamp(opacity, 0, 1);
    if (isNaN(scale)) scale = 1;
    else scale = _clamp(scale, 0, 2);
    if (isNaN(minzoom)) minzoom = 0;
    else minzoom = _clamp(minzoom, 0, 24);
    if (isNaN(maxzoom)) maxzoom = 24;
    else maxzoom = _clamp(maxzoom, minzoom, 24);

    var heightExpr = ['*', ['coalesce', ['to-number', ['get', 'height']], 0], scale];
    var baseExpr = ['*', ['coalesce', ['to-number', ['get', 'min_height']], 0], scale];

    _setImportedBuildingVisibility(map, visible && !flatColor);
    layers.forEach(function (layer) {
      try { map.setLayoutProperty(layer.id, 'visibility', visible ? 'visible' : 'none'); } catch (e) {}
      try { map.setPaintProperty(layer.id, 'fill-extrusion-height', heightExpr); } catch (e2) {}
      try { map.setPaintProperty(layer.id, 'fill-extrusion-base', baseExpr); } catch (e3) {}
      try { map.setLayerZoomRange(layer.id, minzoom, maxzoom); } catch (e4) {}
      try { map.setFilter(layer.id, filter); } catch (e5) {}
      if (opacity != null) {
        try { map.setPaintProperty(layer.id, 'fill-extrusion-opacity', opacity); } catch (e6) {}
      }
      if (color) {
        try { map.setPaintProperty(layer.id, 'fill-extrusion-color', color); } catch (e7) {}
      }
    });

    modelLayers.forEach(function (layer) {
      var nextVisibility = (visible && !flatColor) ? 'visible' : 'none';
      try { map.setLayoutProperty(layer.id, 'visibility', nextVisibility); } catch (e) {}
    });

    presentationLayers.forEach(function (layer) {
      var type = String(layer.type || '');
      var nextVisibility = (type === 'model')
        ? ((visible && !flatColor) ? 'visible' : 'none')
        : (visible ? 'visible' : 'none');
      try { map.setLayoutProperty(layer.id, 'visibility', nextVisibility); } catch (e) {}
      if (!color) return;
      if (type === 'fill-extrusion') {
        try { map.setPaintProperty(layer.id, 'fill-extrusion-color', color); } catch (e2) {}
      } else if (type === 'fill') {
        try { map.setPaintProperty(layer.id, 'fill-color', color); } catch (e3) {}
      } else if (type === 'line') {
        try { map.setPaintProperty(layer.id, 'line-color', color); } catch (e4) {}
      }
    });

    if (hasImportedConfigLayers && color) _setImportedBuildingConfigColor(map, color, opacity);
    topLevelLayers.forEach(function (layer) {
      if (color) {
        try { map.setPaintProperty(layer.id, 'fill-extrusion-color', color); } catch (e) {}
      }
      if (opacity != null) {
        try { map.setPaintProperty(layer.id, 'fill-extrusion-opacity', opacity); } catch (e2) {}
      }
    });
    _applyImportedBuildingStyleViaSetStyle(map, {
      visible: visible,
      color: color,
      flatColor: flatColor,
      opacity: opacity,
    });
    _syncReplacementBuildingPresentation();
    return { ok: true, layerCount: layers.length, modelLayerCount: modelLayers.length };
  }

  function _applyBuildingStyle(record, value, map) {
    if (!map) return;
    var topLevelLayers = _discoverTopLevelBuildingLayers(map);
    var hasImportedConfigLayers = _discoverImportedBuildingConfigImports(map).length > 0;
    if (!topLevelLayers.length && !hasImportedConfigLayers) return;

    if (record.sourceProperty === 'visibility') {
      var visible = value === 'false' ? 'none' : 'visible';
      topLevelLayers.forEach(function (layer) {
        try { map.setLayoutProperty(layer.id, 'visibility', visible); } catch (e) {}
      });
      if (hasImportedConfigLayers) _setImportedBuildingVisibility(map, visible !== 'none');
      _syncReplacementBuildingPresentation();
      return;
    }

    if (record.sourceProperty === 'fill-extrusion-color') {
      if (hasImportedConfigLayers) _setImportedBuildingConfigColor(map, value, null);
      topLevelLayers.forEach(function (layer) {
        try { map.setPaintProperty(layer.id, 'fill-extrusion-color', value); } catch (e) {}
      });
      _syncReplacementBuildingPresentation();
      return;
    }

    if (record.sourceProperty === 'fill-extrusion-opacity') {
      var opacity = parseFloat(value);
      if (isNaN(opacity)) return;
      opacity = _clamp(opacity, 0, 1);
      if (hasImportedConfigLayers) _setImportedBuildingConfigColor(map, _readImportedBuildingConfigColor(map) || '#ffffff', opacity);
      topLevelLayers.forEach(function (layer) {
        try { map.setPaintProperty(layer.id, 'fill-extrusion-opacity', opacity); } catch (e) {}
      });
      _syncReplacementBuildingPresentation();
      return;
    }

    if (record.sourceProperty === 'height-scale') {
      var scale = parseFloat(value);
      if (isNaN(scale)) return;
      scale = _clamp(scale, 0, 2);
      var heightExpr = ['*', ['coalesce', ['to-number', ['get', 'height']], 0], scale];
      var baseExpr = ['*', ['coalesce', ['to-number', ['get', 'min_height']], 0], scale];
      topLevelLayers.forEach(function (layer) {
        try { map.setPaintProperty(layer.id, 'fill-extrusion-height', heightExpr); } catch (e) {}
        try { map.setPaintProperty(layer.id, 'fill-extrusion-base', baseExpr); } catch (e2) {}
      });
      _syncReplacementBuildingPresentation();
      return;
    }

    if (record.sourceProperty === 'minzoom' || record.sourceProperty === 'maxzoom') {
      if (typeof map.setLayerZoomRange !== 'function') return;
      var next = parseFloat(value);
      if (isNaN(next)) return;
      next = _clamp(next, 0, 24);
      topLevelLayers.forEach(function (layer) {
        var min = typeof layer.minzoom === 'number' ? layer.minzoom : 0;
        var max = typeof layer.maxzoom === 'number' ? layer.maxzoom : 24;
        if (record.sourceProperty === 'minzoom') min = next;
        else max = next;
        if (min > max) {
          if (record.sourceProperty === 'minzoom') max = min;
          else min = max;
        }
        try { map.setLayerZoomRange(layer.id, min, max); } catch (e) {}
      });
      _syncReplacementBuildingPresentation();
      return;
    }

    if (record.sourceProperty === 'density-mode') {
      if (typeof map.setFilter !== 'function') return;
      var filter = _buildingDensityFilter(value);
      topLevelLayers.forEach(function (layer) {
        try { map.setFilter(layer.id, filter); } catch (e) {}
      });
    }
  }

  function _readBuildingStyle(record, map) {
    if (!map) return undefined;
    var layers = _discoverBuildingLayers(map);
    var importedColor = _readImportedBuildingConfigColor(map);
    if (!layers.length && !importedColor) return undefined;
    var first = layers[0];

    if (record.sourceProperty === 'visibility') {
      if (!first) return 'true';
      if (typeof map.getLayoutProperty !== 'function') return 'true';
      try { return map.getLayoutProperty(first.id, 'visibility') === 'none' ? 'false' : 'true'; }
      catch (e) { return 'true'; }
    }
    if (record.sourceProperty === 'fill-extrusion-color') {
      if (importedColor) return importedColor;
      if (!first) return undefined;
      try { return map.getPaintProperty(first.id, 'fill-extrusion-color'); } catch (e) { return undefined; }
    }
    if (record.sourceProperty === 'fill-extrusion-opacity') {
      if (importedColor) {
        var parsedImported = _parseCssColor(importedColor);
        return parsedImported ? String(parsedImported.a) : undefined;
      }
      if (!first) return undefined;
      try {
        var opacity = map.getPaintProperty(first.id, 'fill-extrusion-opacity');
        return typeof opacity === 'number' ? String(opacity) : opacity;
      } catch (e) { return undefined; }
    }
    if (record.sourceProperty === 'height-scale') return '1';
    if (record.sourceProperty === 'density-mode') return 'FULL';
    if (!first) return undefined;
    if (record.sourceProperty === 'minzoom') return String(typeof first.minzoom === 'number' ? first.minzoom : 0);
    if (record.sourceProperty === 'maxzoom') return String(typeof first.maxzoom === 'number' ? first.maxzoom : 24);
    return undefined;
  }

  // ── Route (mapboxOperatorRenderer.js / routePlannerRuntime.js / routePanel.js) ──
  function _applyRoute(record, value) {
    if (record.id === 'route.line.default-color') {
      if (SBE.MapboxOperatorRenderer) SBE.MapboxOperatorRenderer.setColors({ routeLine: value });
      if (SBE.RoutePlannerRuntime)    SBE.RoutePlannerRuntime.setDefaultColor(value);
    } else if (record.id === 'route.selection.color') {
      if (SBE.MapboxOperatorRenderer) SBE.MapboxOperatorRenderer.setColors({ selection: value });
    } else if (record.id === 'route.panel.visible-indicator') {
      if (SBE.RoutePanel) SBE.RoutePanel.setVisibleColor(value);
    }
  }

  function _readRoute(record) {
    if (record.id === 'route.line.default-color') {
      var mor = SBE.MapboxOperatorRenderer;
      return mor && mor.getColors ? mor.getColors().routeLine : undefined;
    }
    if (record.id === 'route.selection.color') {
      var mor2 = SBE.MapboxOperatorRenderer;
      return mor2 && mor2.getColors ? mor2.getColors().selection : undefined;
    }
    if (record.id === 'route.panel.visible-indicator') {
      var rp = SBE.RoutePanel;
      return rp && rp.getVisibleColor ? rp.getVisibleColor() : undefined;
    }
    return undefined;
  }

  // ── Dispatch ───────────────────────────────────────────────────────────────
  function apply(record, value, map) {
    if (value === undefined || value === null) return;
    switch (record.source) {
      case 'mapbox-style': return _applyMapboxStyle(record, value, map);
      case 'mapbox-building': return _applyBuildingStyle(record, value, map);
      case 'route':        return _applyRoute(record, value);
      default:
        console.warn('[MapsGeographicStyleApplyAdapters] unknown source for apply:', record.source, record.id);
    }
  }

  function read(record, map) {
    switch (record.source) {
      case 'mapbox-style': return _readMapboxStyle(record, map);
      case 'mapbox-building': return _readBuildingStyle(record, map);
      case 'route':        return _readRoute(record);
      default:             return undefined;
    }
  }

  SBE.MapsGeographicStyleApplyAdapters = Object.freeze({
    VERSION: VERSION,
    apply: apply,
    read: read,
    syncLiveBuildingPresentationFromAuthority: syncLiveBuildingPresentationFromAuthority,
  });

  // Temporary compat alias (0729D terminology migration) — remove once
  // nothing references the old name. New code must use MapsGeographicStyleApplyAdapters.
  SBE.MapsPaletteApplyAdapters = SBE.MapsGeographicStyleApplyAdapters;

  console.log('[MapsGeographicStyleApplyAdapters] v' + VERSION + ' loaded');

})(window);
