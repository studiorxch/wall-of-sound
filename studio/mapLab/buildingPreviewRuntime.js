// ── BuildingPreviewRuntime v1.5.0 ─────────────────────────────────────────────
// 0611G_WOS_WallPreviewHeightSuppressionParity_v1.0.0_BUILD
// Prior: 0610N_WOS_MapboxStyleParityAudit_v1.0.0_BUILD
// Prior: 0610M_WOS_SourceBuildingHideAuthority_v1.0.0_BUILD
// Prior: 0610K_WOS_CompoundBuildingAuthority_v1.0.0_BUILD
// Prior: 0610J_WOS_ReplacementBuildingGroupAuthority_v1.0.0_BUILD
// Prior: 0610G_WOS_ReplacementStudioWallParity_v1.0.0_BUILD
// Status: active | Classification: studio-maplab
//
// True runtime preview of Wall replacement geometry inside Studio Map Lab.
// Renders replacement actors using the same BuildingStyleKit geometry and
// ARCHETYPE_MATERIALS palette used by Wall BuildingReplacementRuntime, so
// the Studio author sees exactly what Wall will render.
//
// Modes:
//   'author'  (default) — editing view: color cues, selection overlays, originals visible
//   'preview'           — output view: replacement actors, materials, originals suppressed
//
// Preview layer: 'wos-preview-replacements' (fill-extrusion, Studio map only)
// Diagnostic:    WOSMapLab.previewStatus()
//
// Map access:      WOSMapLab.MapboxAdapter.getMap()
// Manifest access: WOSMapLab.BuildingEditRegistry.getAll()
// Geometry:        SBE.BuildingStyleKit.getParts(archetype, W, D, H, tier)
// Materials:       ARCHETYPE_MATERIALS (duplicated from buildingReplacementRuntime.js)
//
// IMPORTANT: ARCHETYPE_CFG, ARCHETYPE_MATERIALS, HEIGHT_MODE_MUL and the
// _p/_rectPolygon/_partsToFeatures utilities are intentional copies of the
// equivalent constants and helpers in wall/systems/runtime/buildingReplacementRuntime.js.
// They must be kept in sync when either file is updated.
//
// Parity Debt (0612G):
//   This runtime intentionally mirrors BuildingReplacementRuntime
//   geometry/material semantics for Studio preview.
//   It is not the canonical source of replacement geometry truth.
//   Any duplicated constants must remain version-checked or be moved into a
//   shared authority in a future cleanup.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var PREVIEW_SOURCE_ID   = 'wos-preview-replacements';
  var PREVIEW_LAYER_ID    = 'wos-preview-layer';
  var PREVIEW_OPACITY     = 0.96;
  var SUPPRESSION_OPACITY = 0;
  var DEFAULT_HEIGHT_M    = 14;
  var MIN_DIM_M           = 4;

  // ── Archetype configuration (must match buildingReplacementRuntime.js) ────────
  var ARCHETYPE_CFG = {
    'warehouse':          { color: '#f2a23c', heightMul: 0.40, bW: 13, bD: 8,  fpW: 0.95, fpD: 0.85 },
    'skyscraper':         { color: '#3dd8c5', heightMul: 1.00, bW:  6, bD: 6,  fpW: 0.70, fpD: 0.70 },
    'apartment':          { color: '#a7c7e7', heightMul: 0.60, bW:  9, bD: 8,  fpW: 0.80, fpD: 0.80 },
    'radio-tower':        { color: '#ff4b4b', heightMul: 1.20, bW:  5, bD: 5,  fpW: 0.45, fpD: 0.45 },
    'pagoda':             { color: '#d85cff', heightMul: 0.50, bW:  7, bD: 7,  fpW: 0.80, fpD: 0.80 },
    'civic-block':        { color: '#f5d76e', heightMul: 0.30, bW: 12, bD: 10, fpW: 0.90, fpD: 0.90 },
    'industrial-stack':   { color: '#8d6e63', heightMul: 0.70, bW:  9, bD: 8,  fpW: 0.85, fpD: 0.85 },
    'custom-placeholder': { color: '#ffffff', heightMul: 0.50, bW:  8, bD: 8,  fpW: 0.75, fpD: 0.75 },
  };

  // ── Archetype material palette (must match buildingReplacementRuntime.js) ─────
  var ARCHETYPE_MATERIALS = {
    'warehouse': {
      body:       '#d8c6a1',
      roof:       '#c97a2e',
      accent:     '#7a5c34',
      foundation: '#b0a08a',
    },
    'skyscraper': {
      body:       '#9fb6c8',
      roof:       '#3dd8c5',
      accent:     '#d9eef7',
      foundation: '#7a94a8',
    },
    'apartment': {
      body:       '#8fafc8',
      roof:       '#4a5a6a',
      accent:     '#c0d8f0',
      foundation: '#6e8299',
    },
    'radio-tower': {
      body:       '#5a4a4a',
      stack:      '#e03030',
      beacon:     '#ffec40',
      foundation: '#3a2e2e',
    },
    'pagoda': {
      body:       '#b84bd8',
      roof:       '#7a2a9c',
      accent:     '#f0c0ff',
      foundation: '#8c3ab0',
    },
    'civic-block': {
      body:       '#d8ceb4',
      roof:       '#c8a830',
      accent:     '#f0e8cc',
      foundation: '#b0a880',
    },
    'industrial-stack': {
      body:       '#9c7b4c',
      stack:      '#5c3520',
      accent:     '#c0956a',
      foundation: '#7a5c38',
    },
    'custom-placeholder': {
      body:       '#e8e8e8',
      roof:       '#c8c8c8',
      accent:     '#f8f8f8',
      foundation: '#b8b8b8',
    },
  };

  // ── Height mode multipliers (must match buildingReplacementRuntime.js) ────────
  var HEIGHT_MODE_MUL = {
    'inherit': 1.0,
    'low':     0.5,
    'medium':  1.0,
    'tall':    1.5,
    'hero':    2.5,
  };

  // ── Geometry utilities (must match buildingReplacementRuntime.js) ─────────────

  function _archetypeCfg(archetype) {
    return ARCHETYPE_CFG[archetype] || ARCHETYPE_CFG['custom-placeholder'];
  }

  function _materialColor(archetype, role) {
    var palette = ARCHETYPE_MATERIALS[archetype] || ARCHETYPE_MATERIALS['custom-placeholder'];
    return palette[role] || null;
  }

  // _p — compact part descriptor factory
  function _p(hw, hd, base, height, offX, offY, materialRole) {
    return {
      hw:           hw,
      hd:           hd,
      base:         base,
      height:       height,
      offX:         offX  || 0,
      offY:         offY  || 0,
      materialRole: materialRole || 'body',
    };
  }

  // _rectPolygon — GeoJSON polygon ring for a rotated rectangle.
  // hw/hd: half-width / half-depth in metres; offXM/offYM: offset from centroid.
  // heading: degrees from north, clockwise.
  function _rectPolygon(lng, lat, hw, hd, offXM, offYM, heading) {
    var cosLat = Math.cos(lat * Math.PI / 180) || 0.0001;
    var dLng   = 1 / (111320 * cosLat);
    var dLat   = 1 / 111320;

    var ox = offXM || 0;
    var oy = offYM || 0;

    var corners = [
      [-hw, -hd],
      [ hw, -hd],
      [ hw,  hd],
      [-hw,  hd],
      [-hw, -hd],
    ];

    if (heading) {
      var rad  = heading * Math.PI / 180;
      var sinH = Math.sin(rad), cosH = Math.cos(rad);
      var rox  = ox * cosH - oy * sinH;
      var roy  = ox * sinH + oy * cosH;
      ox = rox;
      oy = roy;
      corners = corners.map(function (c) {
        return [c[0] * cosH - c[1] * sinH, c[0] * sinH + c[1] * cosH];
      });
    }

    var cx = lng + ox * dLng;
    var cy = lat + oy * dLat;

    return [corners.map(function (c) {
      return [cx + c[0] * dLng, cy + c[1] * dLat];
    })];
  }

  // _partsToFeatures — converts part descriptors → GeoJSON Feature[].
  function _partsToFeatures(parts, lng, lat, color, actorId, heading, archetype) {
    var features = [];
    for (var i = 0; i < parts.length; i++) {
      var p    = parts[i];
      var role = p.materialRole || 'body';
      var mc   = archetype ? _materialColor(archetype, role) : null;
      features.push({
        type: 'Feature',
        id:   actorId + ':' + i,
        properties: {
          color:         color,
          materialColor: mc || color,
          materialRole:  role,
          base:          p.base,
          height:        p.height,
        },
        geometry: {
          type:        'Polygon',
          coordinates: _rectPolygon(lng, lat, p.hw, p.hd, p.offX, p.offY, heading || 0),
        },
      });
    }
    return features;
  }

  // ── Module state ──────────────────────────────────────────────────────────────

  var _mode               = 'author';    // 'author' | 'preview'
  var _suppressedLayers   = [];          // { id, opacityProp, originalOpacity }
  var _mapInitialized     = false;
  var _lastModeChangeAt   = null;        // timestamp of last successful setMode call
  var _lastError          = null;        // last caught error string, or null

  // 0610I: per-suppress-pass stats
  var _suppressionIdCount        = 0;   // total unique IDs suppressed across all layers
  var _footprintSuppressionCount = 0;   // extra IDs found via footprint query (Phase 2)
  var _lastSuppressionIdsByLayer = {};  // layerId → numId[] — for unsuppressedSourceBuildings audit

  // 0610N: restored layer count (updated each _restoreOriginals call)
  var _restoredLayerCount = 0;

  // 0611G: suppression method used in last _suppressOriginals pass
  var _lastSuppressionMethod = 'none';  // 'extrusion-height-suppression' | 'opacity-match'

  // ── Map / manifest access ─────────────────────────────────────────────────────

  function _getMap() {
    var adapter = global.WOSMapLab && global.WOSMapLab.MapboxAdapter;
    return (adapter && typeof adapter.getMap === 'function') ? adapter.getMap() : null;
  }

  function _getManifest() {
    var registry = global.WOSMapLab && global.WOSMapLab.BuildingEditRegistry;
    return (registry && typeof registry.getAll === 'function') ? registry.getAll() : {};
  }

  // _getManifestGroups — returns { [groupId]: group } from registry, safe.
  function _getManifestGroups() {
    var registry = global.WOSMapLab && global.WOSMapLab.BuildingEditRegistry;
    return (registry && typeof registry.getGroups === 'function') ? registry.getGroups() : {};
  }

  // _getManifestCompounds — returns { [compoundId]: compound } from registry, safe.
  function _getManifestCompounds() {
    var registry = global.WOSMapLab && global.WOSMapLab.BuildingEditRegistry;
    return (registry && typeof registry.getCompounds === 'function') ? registry.getCompounds() : {};
  }

  // _geometryFromGroup — extracts geometry from a group record (same shape as edit.geometry).
  function _geometryFromGroup(group) {
    try {
      var g = group && group.geometry;
      if (!g) return null;
      if (!g.centroid ||
          typeof g.centroid.lng !== 'number' ||
          typeof g.centroid.lat !== 'number') return null;
      var wM = typeof g.widthM === 'number' ? g.widthM : 0;
      var dM = typeof g.depthM === 'number' ? g.depthM : 0;
      if (wM < MIN_DIM_M || dM < MIN_DIM_M) return null;
      return {
        centroid: g.centroid,
        widthM:   wM,
        depthM:   dM,
        heading:  typeof g.heading === 'number' ? g.heading : 0,
        height:   typeof g.height  === 'number' ? g.height  : null,
      };
    } catch (e) { return null; }
  }

  // _geometryFromCompound — extracts geometry from a compound record.
  // Same validation logic as _geometryFromGroup.
  function _geometryFromCompound(compound) {
    try {
      var g = compound && compound.geometry;
      if (!g) return null;
      if (!g.centroid ||
          typeof g.centroid.lng !== 'number' ||
          typeof g.centroid.lat !== 'number') return null;
      var wM = typeof g.widthM === 'number' ? g.widthM : 0;
      var dM = typeof g.depthM === 'number' ? g.depthM : 0;
      if (wM < MIN_DIM_M || dM < MIN_DIM_M) return null;
      return {
        centroid: g.centroid,
        widthM:   wM,
        depthM:   dM,
        heading:  typeof g.heading === 'number' ? g.heading : 0,
        height:   typeof g.height  === 'number' ? g.height  : null,
      };
    } catch (e) { return null; }
  }

  // ── Height resolution ─────────────────────────────────────────────────────────

  function _resolveActorHeight(replacement, baseHeightM) {
    var base  = (baseHeightM != null && baseHeightM > 0) ? baseHeightM : DEFAULT_HEIGHT_M;
    var hm    = HEIGHT_MODE_MUL[replacement.heightMode] != null
      ? HEIGHT_MODE_MUL[replacement.heightMode] : 1.0;
    var scale = (typeof replacement.scale === 'number' && replacement.scale > 0)
      ? replacement.scale : 1.0;
    var cfg   = _archetypeCfg(replacement.archetype);
    return Math.max(3, base * hm * scale * cfg.heightMul);
  }

  // ── Geometry from manifest edit ───────────────────────────────────────────────

  function _geometryFromEdit(edit) {
    try {
      var g = edit && edit.geometry;
      if (!g) return null;
      if (!g.centroid ||
          typeof g.centroid.lng !== 'number' ||
          typeof g.centroid.lat !== 'number') return null;
      var wM = typeof g.widthM === 'number' ? g.widthM : 0;
      var dM = typeof g.depthM === 'number' ? g.depthM : 0;
      if (wM < MIN_DIM_M || dM < MIN_DIM_M) return null;
      return {
        centroid: g.centroid,
        widthM:   wM,
        depthM:   dM,
        heading:  typeof g.heading === 'number' ? g.heading : 0,
        height:   typeof g.height  === 'number' ? g.height  : null,
      };
    } catch (e) { return null; }
  }

  // ── Feature generation for a single manifest edit ─────────────────────────────

  function _generateFeaturesForEdit(bKey, edit) {
    var rep = edit && edit.replacement;
    if (!rep || !rep.enabled) return [];
    var geom = _geometryFromEdit(edit);
    if (!geom) return [];

    var archetype = rep.archetype || 'custom-placeholder';
    var cfg       = _archetypeCfg(archetype);
    var height    = _resolveActorHeight(rep, geom.height);
    var lng       = geom.centroid.lng;
    var lat       = geom.centroid.lat;
    var heading   = geom.heading || 0;
    var W, D;

    if (geom.widthM >= MIN_DIM_M && geom.depthM >= MIN_DIM_M) {
      W = (geom.widthM / 2) * cfg.fpW;
      D = (geom.depthM / 2) * cfg.fpD;
    } else {
      W = cfg.bW;
      D = cfg.bD;
    }

    var actorId = 'pvw:' + bKey;
    var color   = cfg.color;

    // Use BuildingStyleKit if available; otherwise fallback to plain box
    var parts = null;
    var kit   = global.SBE && global.SBE.BuildingStyleKit;
    if (kit && typeof kit.getParts === 'function') {
      try { parts = kit.getParts(archetype, W, D, height, 'mid'); } catch (e) {}
    }
    if (!parts || !parts.length) {
      parts = [_p(W, D, 0, height, 0, 0, 'body')];
    }

    return _partsToFeatures(parts, lng, lat, color, actorId, heading, archetype);
  }

  // ── Feature generation for a group ───────────────────────────────────────────

  // _generateFeaturesForGroup — generates replacement features from group geometry.
  // Uses group.replacement for archetype/scale/heightMode and group.geometry for
  // the combined footprint dimensions.
  function _generateFeaturesForGroup(groupId, group) {
    var rep  = group && group.replacement;
    if (!rep || !rep.enabled) return [];
    var geom = _geometryFromGroup(group);
    if (!geom) return [];

    var archetype = rep.archetype || 'custom-placeholder';
    var cfg       = _archetypeCfg(archetype);
    var height    = _resolveActorHeight(rep, geom.height);
    var lng       = geom.centroid.lng;
    var lat       = geom.centroid.lat;
    var heading   = geom.heading || 0;
    var W, D;

    if (geom.widthM >= MIN_DIM_M && geom.depthM >= MIN_DIM_M) {
      W = (geom.widthM / 2) * cfg.fpW;
      D = (geom.depthM / 2) * cfg.fpD;
    } else {
      W = cfg.bW;
      D = cfg.bD;
    }

    var actorId = 'pvw-group:' + groupId;
    var color   = cfg.color;

    var parts = null;
    var kit   = global.SBE && global.SBE.BuildingStyleKit;
    if (kit && typeof kit.getParts === 'function') {
      try { parts = kit.getParts(archetype, W, D, height, 'mid'); } catch (e) {}
    }
    if (!parts || !parts.length) {
      parts = [_p(W, D, 0, height, 0, 0, 'body')];
    }

    return _partsToFeatures(parts, lng, lat, color, actorId, heading, archetype);
  }

  // ── Feature generation for a compound (0610K) ────────────────────────────────

  // _generateFeaturesForCompound — uses compound.replacement + compound.geometry.
  function _generateFeaturesForCompound(compoundId, compound) {
    var rep  = compound && compound.replacement;
    if (!rep || !rep.enabled) return [];
    var geom = _geometryFromCompound(compound);
    if (!geom) return [];

    var archetype = rep.archetype || 'custom-placeholder';
    var cfg       = _archetypeCfg(archetype);
    var height    = _resolveActorHeight(rep, geom.height);
    var lng       = geom.centroid.lng;
    var lat       = geom.centroid.lat;
    var heading   = geom.heading || 0;
    var W, D;

    if (geom.widthM >= MIN_DIM_M && geom.depthM >= MIN_DIM_M) {
      W = (geom.widthM / 2) * cfg.fpW;
      D = (geom.depthM / 2) * cfg.fpD;
    } else {
      W = cfg.bW;
      D = cfg.bD;
    }

    var actorId = 'pvw-compound:' + compoundId;
    var color   = cfg.color;

    var parts = null;
    var kit   = global.SBE && global.SBE.BuildingStyleKit;
    if (kit && typeof kit.getParts === 'function') {
      try { parts = kit.getParts(archetype, W, D, height, 'mid'); } catch (e) {}
    }
    if (!parts || !parts.length) {
      parts = [_p(W, D, 0, height, 0, 0, 'body')];
    }

    return _partsToFeatures(parts, lng, lat, color, actorId, heading, archetype);
  }

  // ── GeoJSON collection ────────────────────────────────────────────────────────

  function _buildCollection() {
    var buildings = _getManifest();
    var groups    = _getManifestGroups();
    var compounds = _getManifestCompounds();
    var features  = [];

    // ── Priority 1: compounds ─────────────────────────────────────────────────
    // Mark all building keys and group IDs claimed by active compounds so lower
    // tiers skip them.
    var compoundClaimedBuildings = {};  // bKey → compoundId
    var compoundClaimedGroups    = {};  // groupId → compoundId

    Object.keys(compounds).forEach(function (compoundId) {
      var compound = compounds[compoundId];
      if (!compound || !compound.replacement || !compound.replacement.enabled) return;
      if (!compound.members) return;
      compound.members.forEach(function (m) {
        if (!m) return;
        if (m.indexOf('group_') === 0) {
          compoundClaimedGroups[m]   = compoundId;
          // Also claim the group's buildings
          var grp = groups[m];
          if (grp && grp.members) {
            grp.members.forEach(function (mk) { compoundClaimedBuildings[mk] = compoundId; });
          }
        } else {
          compoundClaimedBuildings[m] = compoundId;
        }
      });
      try {
        var fs = _generateFeaturesForCompound(compoundId, compound);
        for (var i = 0; i < fs.length; i++) features.push(fs[i]);
      } catch (e) {}
    });

    // ── Priority 2: groups not claimed by a compound ──────────────────────────
    var groupedKeys = {};  // bKey → groupId (for standalone skip below)

    Object.keys(groups).forEach(function (groupId) {
      if (compoundClaimedGroups[groupId]) return; // claimed by compound
      var group = groups[groupId];
      if (!group || !group.replacement || !group.replacement.enabled) return;
      if (!group.members) return;
      group.members.forEach(function (mk) { groupedKeys[mk] = groupId; });
      try {
        var fs = _generateFeaturesForGroup(groupId, group);
        for (var i = 0; i < fs.length; i++) features.push(fs[i]);
      } catch (e) {}
    });

    // ── Priority 3: standalone buildings not claimed by group or compound ─────
    Object.keys(buildings).forEach(function (bKey) {
      if (compoundClaimedBuildings[bKey]) return; // claimed by compound
      if (groupedKeys[bKey])              return; // claimed by group
      var edit = buildings[bKey];
      if (!edit || !edit.replacement || !edit.replacement.enabled) return;
      try {
        var fs = _generateFeaturesForEdit(bKey, edit);
        for (var i = 0; i < fs.length; i++) features.push(fs[i]);
      } catch (e) {}
    });

    return { type: 'FeatureCollection', features: features };
  }

  // ── Layer management ──────────────────────────────────────────────────────────

  function _ensurePreviewLayer(map) {
    var src = null;
    try { src = map.getSource(PREVIEW_SOURCE_ID); } catch (e) {}
    if (!src) {
      map.addSource(PREVIEW_SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id:     PREVIEW_LAYER_ID,
        type:   'fill-extrusion',
        source: PREVIEW_SOURCE_ID,
        paint: {
          'fill-extrusion-color':   ['coalesce', ['get', 'materialColor'], ['get', 'color']],
          'fill-extrusion-height':  ['get', 'height'],
          'fill-extrusion-base':    ['get', 'base'],
          'fill-extrusion-opacity': PREVIEW_OPACITY,
        },
      });
    }
    _ensureLayerDominance(map);
  }

  // _ensureLayerDominance — move the preview layer above all building layers.
  function _ensureLayerDominance(map) {
    try {
      var style  = map.getStyle();
      var layers = (style && style.layers) || [];
      var highestBldgIdx = -1;
      for (var i = 0; i < layers.length; i++) {
        var l   = layers[i];
        var lid = (l.id  || '').toLowerCase();
        var sl  = (l['source-layer'] || '').toLowerCase();
        if (lid === PREVIEW_LAYER_ID.toLowerCase()) continue;
        if (lid.indexOf('wos-') === 0) continue;
        var isBldg = l.type === 'fill-extrusion' ||
                     (l.type === 'fill' && /building/.test(sl)) ||
                     /building/.test(lid);
        if (isBldg && i > highestBldgIdx) highestBldgIdx = i;
      }
      if (highestBldgIdx === -1) return;
      var beforeId = null;
      for (var j = highestBldgIdx + 1; j < layers.length; j++) {
        if (layers[j].id !== PREVIEW_LAYER_ID) { beforeId = layers[j].id; break; }
      }
      if (beforeId) map.moveLayer(PREVIEW_LAYER_ID, beforeId);
      else          map.moveLayer(PREVIEW_LAYER_ID);
    } catch (e) {}
  }

  // _pushToMap — set GeoJSON data onto the preview source.
  function _pushToMap(map) {
    try {
      _ensurePreviewLayer(map);
      var src = map.getSource(PREVIEW_SOURCE_ID);
      if (src) src.setData(_buildCollection());
    } catch (e) {
      console.warn('[BuildingPreviewRuntime] push error:', e.message || e);
    }
  }

  // _clearPreviewLayer — empty the preview source (but leave layer in place).
  function _clearPreviewLayer(map) {
    try {
      var src = map.getSource(PREVIEW_SOURCE_ID);
      if (src) src.setData({ type: 'FeatureCollection', features: [] });
    } catch (e) {}
  }

  // ── Original building suppression ─────────────────────────────────────────────

  // _queryFootprintFeatureIds — Phase 2 suppression expansion (0610I).
  // Projects the manifest geometry bounding box to screen space, queries all
  // rendered features in that region, and returns per-layer numeric IDs.
  // Returns: { [layerId]: numId[] }
  // Never throws — all errors are caught and logged; returns {} on failure.
  function _queryFootprintFeatureIds(map, geom, layerIds) {
    var result = {};
    try {
      var cosLat = Math.cos(geom.centroid.lat * Math.PI / 180) || 0.0001;
      // Pad the query box by 15% of the larger dimension so tile-clipped geometry
      // and nearby building:part features are included.
      var halfW = (geom.widthM  / 2) * 1.15;
      var halfD = (geom.depthM  / 2) * 1.15;
      var dLng  = halfW / (111320 * cosLat);
      var dLat  = halfD / 111320;

      var sw = map.project([geom.centroid.lng - dLng, geom.centroid.lat - dLat]);
      var ne = map.project([geom.centroid.lng + dLng, geom.centroid.lat + dLat]);

      var minX = Math.min(sw.x, ne.x) - 4;
      var minY = Math.min(sw.y, ne.y) - 4;
      var maxX = Math.max(sw.x, ne.x) + 4;
      var maxY = Math.max(sw.y, ne.y) + 4;

      var opts     = (layerIds && layerIds.length) ? { layers: layerIds } : {};
      var features = map.queryRenderedFeatures([[minX, minY], [maxX, maxY]], opts);

      for (var i = 0; i < features.length; i++) {
        var f = features[i];
        if (f.id == null) continue;
        var numId = Number(f.id);
        if (isNaN(numId) || numId === 0) continue;
        var lid = (f.layer && f.layer.id) || 'unknown';
        if (!result[lid]) result[lid] = [];
        if (result[lid].indexOf(numId) === -1) result[lid].push(numId);
      }
    } catch (e) {
      console.warn('[BuildingPreviewRuntime] _queryFootprintFeatureIds error:', e.message || e);
    }
    return result;
  }

  // _findSuppressibleLayers — discover Studio building layers eligible for suppression.
  // 0611G: also captures originalHeight/originalBase for fill-extrusion layers so
  //        _restoreOriginals can restore them exactly after height-suppression.
  function _findSuppressibleLayers(map) {
    var style = null;
    try { style = map.getStyle(); } catch (e) { return []; }
    if (!style || !style.layers) return [];
    var found = [];
    for (var i = 0; i < style.layers.length; i++) {
      var l   = style.layers[i];
      var lid = (l.id || '').toLowerCase();
      var sl  = (l['source-layer'] || '').toLowerCase();
      if (lid.indexOf('wos-') === 0) continue;
      var isBldg = l.type === 'fill-extrusion' ||
                   (l.type === 'fill' && /building/.test(sl));
      if (!isBldg) continue;
      var opProp  = l.type === 'fill-extrusion' ? 'fill-extrusion-opacity' : 'fill-opacity';
      var origOp  = (l.paint && l.paint[opProp] !== undefined)
        ? l.paint[opProp]
        : (l.type === 'fill-extrusion' ? 0.85 : 1.0);
      var entry = { id: l.id, type: l.type, opacityProp: opProp, originalOpacity: origOp,
                    originalHeight: null, originalBase: null };
      if (l.type === 'fill-extrusion' && l.paint) {
        if (l.paint['fill-extrusion-height'] !== undefined)
          entry.originalHeight = l.paint['fill-extrusion-height'];
        if (l.paint['fill-extrusion-base'] !== undefined)
          entry.originalBase = l.paint['fill-extrusion-base'];
      }
      found.push(entry);
    }
    return found;
  }

  // _suppressOriginals — apply per-feature opacity=0 for replaced buildings.
  // Phase 1: registry-key derived numeric IDs (baseline, always applied).
  //   0610J: group members are also added in Phase 1 even if their own replacement
  //   is not enabled — the group owns the visual.
  // Phase 2 (0610I): footprint bbox query expands each replacement to all rendered
  //   source features overlapping the manifest geometry — suppresses tile copies,
  //   building:part features, and other ID variants Mapbox may use for the same
  //   physical building.
  function _suppressOriginals(map) {
    var buildings = _getManifest();
    var groups    = _getManifestGroups();
    var compounds = _getManifestCompounds();

    // Build compound-claimed sets first (highest authority).
    var compoundClaimedBuildings = {};
    var compoundClaimedGroups    = {};
    Object.keys(compounds).forEach(function (compoundId) {
      var compound = compounds[compoundId];
      if (!compound || !compound.replacement || !compound.replacement.enabled) return;
      if (!compound.members) return;
      compound.members.forEach(function (m) {
        if (!m) return;
        if (m.indexOf('group_') === 0) {
          compoundClaimedGroups[m] = compoundId;
          var grp = groups[m];
          if (grp && grp.members) {
            grp.members.forEach(function (mk) { compoundClaimedBuildings[mk] = compoundId; });
          }
        } else {
          compoundClaimedBuildings[m] = compoundId;
        }
      });
    });

    // Build set of grouped member keys (groups not claimed by compound).
    var groupedKeys = {};
    Object.keys(groups).forEach(function (groupId) {
      if (compoundClaimedGroups[groupId]) return;
      var group = groups[groupId];
      if (!group || !group.replacement || !group.replacement.enabled) return;
      if (!group.members) return;
      group.members.forEach(function (mk) { groupedKeys[mk] = groupId; });
    });

    // Phase 1 — collect registry key numeric IDs + geometry for each replacement.
    // Includes: standalone enabled replacements + all group members (active groups)
    // + all compound-claimed buildings (active compounds).
    var replacements = [];   // { numId, geom }

    // Phase 1a — standalone building replacements + compound/group members
    Object.keys(buildings).forEach(function (bKey) {
      var edit = buildings[bKey];
      var isGroupMember    = !!groupedKeys[bKey];
      var isCompoundMember = !!compoundClaimedBuildings[bKey];
      var shouldSuppress = isGroupMember || isCompoundMember ||
        (edit && edit.replacement && edit.replacement.enabled) ||
        (edit && edit.hidden);  // 0610M: hidden-only source suppression
      if (!shouldSuppress) return;
      var first  = bKey.indexOf(':');
      var second = bKey.indexOf(':', first + 1);
      if (first === -1 || second === -1) return;
      var numId = Number(bKey.slice(second + 1));
      if (isNaN(numId)) return;
      var geom = _geometryFromEdit(edit);
      replacements.push({ numId: numId, geom: geom });
    });

    // Phase 1b — also add group geometry as a Phase 2 footprint query target
    // (so the combined footprint suppresses all nearby tile features)
    var groupGeoms = [];
    Object.keys(groups).forEach(function (groupId) {
      var group = groups[groupId];
      if (!group || !group.replacement || !group.replacement.enabled) return;
      var geom = _geometryFromGroup(group);
      if (geom) groupGeoms.push(geom);
    });

    _suppressedLayers            = [];
    _suppressionIdCount          = 0;
    _footprintSuppressionCount   = 0;
    _lastSuppressionIdsByLayer   = {};
    if (!replacements.length && !groupGeoms.length) return;

    var layers      = _findSuppressibleLayers(map);
    var layerIdList = layers.map(function (l) { return l.id; });

    // Base ID set from registry keys (same for all layers)
    var baseIds = replacements.map(function (r) { return r.numId; });

    // Phase 2 — footprint bbox query, per replacement with geometry.
    // Also runs on group combined geometries (groupGeoms) to catch all tile copies
    // that overlap the group's combined footprint.
    // perLayerExtras[layerId] = numId[] (IDs found via query, not in baseIds)
    var perLayerExtras = {};

    replacements.forEach(function (r) {
      if (!r.geom) return;
      try {
        var queried = _queryFootprintFeatureIds(map, r.geom, layerIdList);
        Object.keys(queried).forEach(function (lid) {
          if (!perLayerExtras[lid]) perLayerExtras[lid] = [];
          var candidates = queried[lid];
          for (var i = 0; i < candidates.length; i++) {
            var cId = candidates[i];
            if (baseIds.indexOf(cId) === -1 && perLayerExtras[lid].indexOf(cId) === -1) {
              perLayerExtras[lid].push(cId);
              _footprintSuppressionCount++;
            }
          }
        });
      } catch (e) {}
    });

    // Phase 2b — group combined footprint queries
    groupGeoms.forEach(function (geom) {
      try {
        var queried = _queryFootprintFeatureIds(map, geom, layerIdList);
        Object.keys(queried).forEach(function (lid) {
          if (!perLayerExtras[lid]) perLayerExtras[lid] = [];
          var candidates = queried[lid];
          for (var i = 0; i < candidates.length; i++) {
            var cId = candidates[i];
            if (baseIds.indexOf(cId) === -1 && perLayerExtras[lid].indexOf(cId) === -1) {
              perLayerExtras[lid].push(cId);
              _footprintSuppressionCount++;
            }
          }
        });
      } catch (e) {}
    });

    // Phase 3 — compound combined footprint queries (0610K)
    Object.keys(compounds).forEach(function (compoundId) {
      var compound = compounds[compoundId];
      if (!compound || !compound.replacement || !compound.replacement.enabled) return;
      var geom = _geometryFromCompound(compound);
      if (!geom) return;
      try {
        var queried = _queryFootprintFeatureIds(map, geom, layerIdList);
        Object.keys(queried).forEach(function (lid) {
          if (!perLayerExtras[lid]) perLayerExtras[lid] = [];
          var candidates = queried[lid];
          for (var i = 0; i < candidates.length; i++) {
            var cId = candidates[i];
            if (baseIds.indexOf(cId) === -1 && perLayerExtras[lid].indexOf(cId) === -1) {
              perLayerExtras[lid].push(cId);
              _footprintSuppressionCount++;
            }
          }
        });
      } catch (e) {}
    });

    // Apply suppression per layer, combining all phases.
    // 0611G: fill-extrusion layers use height/base = 0 match expression.
    //        fill-extrusion-opacity is NOT data-driven (layer-scope only).
    //        fill-extrusion-color alpha is discarded in FBO compositing (renders black).
    //        Setting height/base = 0 collapses geometry to the ground plane — no pixels.
    var extrusionLayerSeen = false;
    layers.forEach(function (layer) {
      var extras = perLayerExtras[layer.id] || [];
      var allIds = baseIds.slice();
      for (var j = 0; j < extras.length; j++) {
        if (allIds.indexOf(extras[j]) === -1) allIds.push(extras[j]);
      }
      if (!allIds.length) return;

      // Build deduped id list
      var seen = {}, dedupedIds = [];
      for (var k = 0; k < allIds.length; k++) {
        if (seen[allIds[k]]) continue;
        seen[allIds[k]] = true;
        dedupedIds.push(allIds[k]);
      }

      if (layer.type === 'fill-extrusion') {
        // ── 0611G: height/base suppression ───────────────────────────────────
        var origH = layer.originalHeight;
        var origB = layer.originalBase;
        var fallbackH = (origH !== null && origH !== undefined) ? origH : 0;
        var fallbackB = (origB !== null && origB !== undefined) ? origB : 0;

        var heightExpr = ['match', ['id']];
        var baseExpr   = ['match', ['id']];
        for (var hi = 0; hi < dedupedIds.length; hi++) {
          heightExpr.push(dedupedIds[hi]); heightExpr.push(0);
          baseExpr.push(dedupedIds[hi]);   baseExpr.push(0);
        }
        heightExpr.push(fallbackH);
        baseExpr.push(fallbackB);

        var heightOk = false;
        try {
          map.setPaintProperty(layer.id, 'fill-extrusion-height', heightExpr);
          heightOk = true;
        } catch (e) {
          console.warn('[BuildingPreviewRuntime] height suppression failed on', layer.id, ':', e.message || e);
        }
        if (heightOk) {
          try {
            map.setPaintProperty(layer.id, 'fill-extrusion-base', baseExpr);
          } catch (e) {
            // base failure non-fatal — height alone collapses the geometry
            console.warn('[BuildingPreviewRuntime] base suppression failed on', layer.id, ':', e.message || e, '(non-fatal)');
          }
          _suppressedLayers.push(layer);
          _suppressionIdCount += dedupedIds.length;
          _lastSuppressionIdsByLayer[layer.id] = dedupedIds.slice();
          extrusionLayerSeen = true;
        }
      } else {
        // ── fill-opacity match (fill layers — opacity IS data-driven) ─────────
        var expr = ['match', ['id']];
        for (var oi = 0; oi < dedupedIds.length; oi++) {
          expr.push(dedupedIds[oi]);
          expr.push(SUPPRESSION_OPACITY);
        }
        var defOp = typeof layer.originalOpacity === 'number' ? layer.originalOpacity : 1.0;
        expr.push(defOp);

        try {
          map.setPaintProperty(layer.id, layer.opacityProp, expr);
          _suppressedLayers.push(layer);
          _suppressionIdCount += dedupedIds.length;
          _lastSuppressionIdsByLayer[layer.id] = dedupedIds.slice();
        } catch (e) {
          console.warn('[BuildingPreviewRuntime] opacity suppression failed on', layer.id, ':', e.message || e);
        }
      }
    });

    _lastSuppressionMethod = extrusionLayerSeen ? 'extrusion-height-suppression' : 'opacity-match';

    if (_footprintSuppressionCount > 0) {
      console.log('[BuildingPreviewRuntime] footprint expansion added',
        _footprintSuppressionCount, 'extra suppression ID(s)');
    }
  }

  // _restoreOriginals — reset all suppressed layers to their original paint values.
  // 0611G: fill-extrusion layers were suppressed via height/base — restore those props.
  //        fill layers were suppressed via opacity — restore opacity.
  function _restoreOriginals(map) {
    var restored = 0;
    _suppressedLayers.forEach(function (layer) {
      try {
        if (layer.type === 'fill-extrusion') {
          // Restore height
          try {
            map.setPaintProperty(layer.id, 'fill-extrusion-height',
              layer.originalHeight !== null && layer.originalHeight !== undefined
                ? layer.originalHeight : null);
          } catch (e) {}
          // Restore base
          try {
            map.setPaintProperty(layer.id, 'fill-extrusion-base',
              layer.originalBase !== null && layer.originalBase !== undefined
                ? layer.originalBase : null);
          } catch (e) {}
        } else {
          map.setPaintProperty(layer.id, layer.opacityProp,
            layer.originalOpacity != null ? layer.originalOpacity : null);
        }
        restored++;
      } catch (e) {}
    });
    _restoredLayerCount   = restored;  // 0610N: track for styleParityStatus
    _suppressedLayers     = [];
    _lastSuppressionMethod = 'none';
  }

  // ── Mode management ───────────────────────────────────────────────────────────

  function setMode(mode) {
    if (mode !== 'author' && mode !== 'preview') mode = 'author';
    _mode = mode;
    var map = _getMap();
    if (!map) {
      console.warn('[BuildingPreviewRuntime] setMode: map not available');
      return;
    }
    try {
      if (_mode === 'preview') {
        _pushToMap(map);
        _suppressOriginals(map);
        _ensureLayerDominance(map);
      } else {
        _clearPreviewLayer(map);
        _restoreOriginals(map);
      }
      _lastModeChangeAt = Date.now();
    } catch (e) {
      _lastError = String(e && e.message || e);
      console.warn('[BuildingPreviewRuntime] setMode error:', _lastError);
    }
    console.log('[BuildingPreviewRuntime] mode:', _mode);
  }

  function getMode() { return _mode; }

  // refresh — re-read manifest and re-render (call after registry changes).
  function refresh() {
    if (_mode !== 'preview') return;
    var map = _getMap();
    if (!map) return;
    _pushToMap(map);
    _suppressOriginals(map);
    _ensureLayerDominance(map);
  }

  // ── Style reload handling ─────────────────────────────────────────────────────

  function _onStyleReady(map) {
    if (_mode === 'preview') {
      _suppressedLayers = [];   // reset saved refs — layer was destroyed
      _pushToMap(map);
      _suppressOriginals(map);
    }
  }

  // ── Init ──────────────────────────────────────────────────────────────────────

  function init(map) {
    if (!map || _mapInitialized) return;
    _mapInitialized = true;
    map.on('load',      function () { _onStyleReady(map); });
    map.on('styledata', function () {
      var loaded = false;
      try { loaded = !!map.isStyleLoaded(); } catch (e) {}
      if (loaded) _onStyleReady(map);
    });
  }

  // ── Diagnostic ────────────────────────────────────────────────────────────────

  // visualAuthorityStatus — single visual authority diagnostic.
  // Returns the authoritative state table used by 0610H acceptance tests.
  //   mode:               'author' | 'preview'
  //   authorCueActive:    true in author mode — applyRegistryEdits may run
  //   previewLayerActive: true in preview mode AND preview layer exists on map
  //   originalSuppressed: true in preview mode AND at least one original layer suppressed
  //   replacementCount:   number of replacement-enabled edits in manifest
  //   lastModeChangeAt:   ms timestamp of last successful setMode(), or null
  //   lastError:          last caught error message, or null
  function visualAuthorityStatus() {
    var map       = _getMap();
    var buildings = _getManifest();
    var repCount  = 0;
    Object.keys(buildings).forEach(function (bKey) {
      var edit = buildings[bKey];
      if (edit && edit.replacement && edit.replacement.enabled) repCount++;
    });
    var layerPresent = false;
    if (map) {
      try { layerPresent = !!map.getLayer(PREVIEW_LAYER_ID); } catch (e) {}
    }
    var status = {
      mode:                      _mode,
      authorCueActive:           _mode === 'author',
      previewLayerActive:        _mode === 'preview' && layerPresent,
      originalSuppressed:        _mode === 'preview' && _suppressedLayers.length > 0,
      replacementCount:          repCount,
      lastModeChangeAt:          _lastModeChangeAt,
      lastError:                 _lastError,
      // 0610I suppression audit fields
      suppressionIdCount:        _suppressionIdCount,
      footprintSuppressionCount: _footprintSuppressionCount,
      unsuppressedSourceCount:   0,   // call unsuppressedSourceBuildings() for live count
      // 0611G
      suppressionMethod:         _lastSuppressionMethod,
    };
    console.log('[BuildingPreviewRuntime] visualAuthorityStatus:', JSON.stringify(status, null, 2));
    return status;
  }

  // unsuppressedSourceBuildings — 0610I audit: re-query each replacement footprint and
  // return any rendered source features whose ID is NOT in the last suppression set.
  // Returns [] when suppression is complete or when not in preview mode.
  // Shape: [{ replacementKey, candidateId, layerId, sourceLayer, reason, suppressed }]
  function unsuppressedSourceBuildings() {
    var map       = _getMap();
    var buildings = _getManifest();
    if (!map || _mode !== 'preview') return [];

    var layerIdList = _suppressedLayers.map(function (l) { return l.id; });
    var result      = [];

    Object.keys(buildings).forEach(function (bKey) {
      var edit = buildings[bKey];
      if (!edit || !edit.replacement || !edit.replacement.enabled) return;
      var geom = _geometryFromEdit(edit);
      if (!geom) return;

      try {
        var queried = _queryFootprintFeatureIds(map, geom, layerIdList);
        Object.keys(queried).forEach(function (lid) {
          var suppressedForLayer = _lastSuppressionIdsByLayer[lid] || [];
          queried[lid].forEach(function (candidateId) {
            var isSuppressed = suppressedForLayer.indexOf(candidateId) !== -1;
            result.push({
              replacementKey: bKey,
              candidateId:    candidateId,
              layerId:        lid,
              sourceLayer:    'building',
              reason:         'bbox-query',
              suppressed:     isSuppressed,
            });
          });
        });
      } catch (e) {}
    });

    var unsuppressedCount = result.filter(function (r) { return !r.suppressed; }).length;
    if (unsuppressedCount > 0) {
      console.warn('[BuildingPreviewRuntime] unsuppressedSourceBuildings: ' +
        unsuppressedCount + ' unsuppressed candidate(s) found');
    } else {
      console.log('[BuildingPreviewRuntime] unsuppressedSourceBuildings: all candidates suppressed');
    }
    return result;
  }

  // ── verifyPreviewSuppression — 0611H verification harness ────────────────────
  //
  // Read-only proof that source buildings are actually suppressed after 0611G.
  // Does NOT mutate map state.
  //
  // Call from Studio console:
  //   WOSMapLab.verifyPreviewSuppression()
  //
  // Report shape:
  //   layers[]           — per-layer paint readback + expression analysis
  //   footprintChecks[]  — per-building footprint re-query + unsuppressed IDs
  //   summary            — overall classification + unsuppressed count
  //
  // Classifications:
  //   A — No suppression expression on layer (height not a match expr after suppression)
  //   B — Expression present, but registered suppressed IDs missing from match arms
  //   C — Expression present and IDs correct, but extra rendered tile IDs remain
  //   D — All rendered source features appear suppressed (success)
  //   E — Replacement layer not dominant (preview layer below source building layer)
  function verifyPreviewSuppression() {
    var map = _getMap();
    var report = {
      timestamp:         new Date().toISOString(),
      mode:              _mode,
      suppressionMethod: _lastSuppressionMethod,
      suppressedLayerCount: _suppressedLayers.length,
      layers:            [],
      footprintChecks:   [],
      summary: {
        totalSuppressedLayers: _suppressedLayers.length,
        totalUnsuppressedIds:  0,
        allSuppressed:         false,
        classification:        null,
        classificationCode:    null,
      },
    };

    if (!map) {
      report.summary.classification = 'ERROR: map not available';
      report.summary.classificationCode = 'ERROR';
      console.log('[BuildingPreviewRuntime] verifyPreviewSuppression:', JSON.stringify(report, null, 2));
      return report;
    }

    if (_mode !== 'preview') {
      report.summary.classification     = 'NOT_IN_PREVIEW_MODE — suppression is only active in preview mode';
      report.summary.classificationCode = 'NOT_IN_PREVIEW_MODE';
      console.log('[BuildingPreviewRuntime] verifyPreviewSuppression:', JSON.stringify(report, null, 2));
      return report;
    }

    // ── 1. Paint readback per suppressed layer ─────────────────────────────
    _suppressedLayers.forEach(function (layer) {
      var suppIds = (_lastSuppressionIdsByLayer[layer.id] || []).slice();
      var entry = {
        layerId:           layer.id,
        layerType:         layer.type,
        suppressedIds:     suppIds,
        suppressedIdCount: suppIds.length,
        // fill-extrusion readback
        currentHeight:     null,
        currentBase:       null,
        currentOpacity:    null,
        // expression analysis
        heightIsMatchExpr:    false,
        heightMatchIds:       [],
        heightFallback:       null,
        missingFromExpr:      [],
        baseIsMatchExpr:      false,
        // classification for this layer
        classification:    null,
        classificationCode: null,
        readErrors:        [],
      };

      if (layer.type === 'fill-extrusion') {
        try { entry.currentHeight  = map.getPaintProperty(layer.id, 'fill-extrusion-height'); }  catch (e) { entry.readErrors.push('height: ' + String(e.message || e)); }
        try { entry.currentBase    = map.getPaintProperty(layer.id, 'fill-extrusion-base'); }    catch (e) { entry.readErrors.push('base: '   + String(e.message || e)); }
        try { entry.currentOpacity = map.getPaintProperty(layer.id, 'fill-extrusion-opacity'); } catch (e) {}

        if (Array.isArray(entry.currentHeight) && entry.currentHeight[0] === 'match') {
          entry.heightIsMatchExpr = true;
          entry.heightFallback    = entry.currentHeight[entry.currentHeight.length - 1];
          for (var i = 2; i < entry.currentHeight.length - 1; i += 2) {
            entry.heightMatchIds.push(entry.currentHeight[i]);
          }
          // Check which suppressed IDs are absent from the match expression
          suppIds.forEach(function (sid) {
            var inExpr = entry.heightMatchIds.some(function (mid) {
              return String(mid) === String(sid);
            });
            if (!inExpr) entry.missingFromExpr.push(sid);
          });
        }

        if (Array.isArray(entry.currentBase) && entry.currentBase[0] === 'match') {
          entry.baseIsMatchExpr = true;
        }

        if (!entry.heightIsMatchExpr) {
          entry.classificationCode = 'A';
          entry.classification     = 'A — fill-extrusion-height is NOT a match expression — suppression did not apply to this layer';
        } else if (entry.missingFromExpr.length > 0) {
          entry.classificationCode = 'B';
          entry.classification     = 'B — Height match expression present, but ' + entry.missingFromExpr.length + ' suppressed ID(s) missing from match arms: ' + JSON.stringify(entry.missingFromExpr);
        } else {
          entry.classificationCode = 'D';
          entry.classification     = 'D — Height match expression contains all suppressed IDs (footprint query may refine to C)';
        }
      } else {
        // fill layer
        try { entry.currentOpacity = map.getPaintProperty(layer.id, layer.opacityProp || 'fill-opacity'); } catch (e) { entry.readErrors.push('opacity: ' + String(e.message || e)); }
        var opIsMatch = Array.isArray(entry.currentOpacity) && entry.currentOpacity[0] === 'match';
        entry.classificationCode = opIsMatch ? 'D' : 'A';
        entry.classification     = opIsMatch
          ? 'D — fill-opacity match expression present'
          : 'A — fill-opacity is NOT a match expression';
      }

      report.layers.push(entry);
    });

    // ── 2. Footprint re-query for each hidden/replacement building ─────────
    var buildings   = _getManifest();
    var groups      = _getManifestGroups();
    var compounds   = _getManifestCompounds();
    var layerIdList = _suppressedLayers.map(function (l) { return l.id; });

    // Also check group and compound members even if they have no individual replacement
    // (they are suppressed as group/compound members — must not remain visible)
    var shouldCheckKeys = {};  // bKey → { reason }
    Object.keys(buildings).forEach(function (bKey) {
      var edit = buildings[bKey];
      if (edit && ((edit.replacement && edit.replacement.enabled) || edit.hidden)) {
        shouldCheckKeys[bKey] = { reason: edit.hidden ? 'hidden' : 'replacement' };
      }
    });
    // Add group members
    Object.keys(groups).forEach(function (gid) {
      var g = groups[gid];
      if (!g || !g.replacement || !g.replacement.enabled) return;
      if (!Array.isArray(g.members)) return;
      g.members.forEach(function (mk) {
        if (!shouldCheckKeys[mk]) shouldCheckKeys[mk] = { reason: 'group-member' };
      });
    });
    // Add compound members
    Object.keys(compounds).forEach(function (cid) {
      var c = compounds[cid];
      if (!c || !c.replacement || !c.replacement.enabled) return;
      if (!Array.isArray(c.members)) return;
      c.members.forEach(function (m) {
        if (!m) return;
        if (m.indexOf('group_') === 0) {
          var grp = groups[m];
          if (grp && Array.isArray(grp.members)) {
            grp.members.forEach(function (mk) {
              if (!shouldCheckKeys[mk]) shouldCheckKeys[mk] = { reason: 'compound-member' };
            });
          }
        } else {
          if (!shouldCheckKeys[m]) shouldCheckKeys[m] = { reason: 'compound-member' };
        }
      });
    });

    var totalUnsuppressed = 0;

    Object.keys(shouldCheckKeys).forEach(function (bKey) {
      var reason = shouldCheckKeys[bKey].reason;
      var edit   = buildings[bKey];
      var geom   = edit ? _geometryFromEdit(edit) : null;

      if (!geom) {
        report.footprintChecks.push({
          buildingKey:  bKey,
          reason:       reason,
          status:       'NO_GEOMETRY',
          unsuppressedIds: [],
          classification: null,
        });
        return;
      }

      try {
        var queried = _queryFootprintFeatureIds(map, geom, layerIdList);
        var allRenderedIds = [];
        Object.keys(queried).forEach(function (lid) {
          queried[lid].forEach(function (fid) {
            if (allRenderedIds.indexOf(fid) === -1) allRenderedIds.push(fid);
          });
        });

        var unsuppressed = allRenderedIds.filter(function (fid) {
          return !layerIdList.some(function (lid) {
            return (_lastSuppressionIdsByLayer[lid] || []).indexOf(fid) !== -1;
          });
        });

        var code;
        if (allRenderedIds.length === 0) {
          code = 'D';  // Nothing rendered — building gone
        } else if (unsuppressed.length === 0) {
          code = 'D';  // All rendered IDs covered by suppression expressions
        } else {
          code = 'C';  // Extra rendered IDs not in suppression set
          totalUnsuppressed += unsuppressed.length;
        }

        report.footprintChecks.push({
          buildingKey:       bKey,
          reason:            reason,
          renderedIdCount:   allRenderedIds.length,
          renderedIds:       allRenderedIds,
          unsuppressedIds:   unsuppressed,
          unsuppressedCount: unsuppressed.length,
          classificationCode: code,
          classification:    code === 'D'
            ? 'D — All rendered features suppressed or building fully invisible'
            : 'C — ' + unsuppressed.length + ' rendered feature ID(s) not in suppression set: ' + JSON.stringify(unsuppressed),
        });
      } catch (e) {
        report.footprintChecks.push({
          buildingKey: bKey,
          reason:      reason,
          status:      'QUERY_ERROR',
          error:       String(e.message || e),
          unsuppressedIds: [],
        });
      }
    });

    // ── 3. Check preview layer dominance ────────────────────────────────────
    var previewLayerPresent = false;
    var previewLayerDominant = true;
    try {
      var style  = map.getStyle();
      var layers = (style && style.layers) || [];
      var pvwIdx = -1;
      var highestSrcBldgIdx = -1;
      for (var li = 0; li < layers.length; li++) {
        if (layers[li].id === 'wos-preview-layer') pvwIdx = li;
        if (layers[li].id !== 'wos-preview-layer' &&
            (layers[li].id || '').indexOf('wos-') !== 0 &&
            (layers[li].type === 'fill-extrusion' || /building/.test((layers[li].id || '').toLowerCase()))) {
          highestSrcBldgIdx = li;
        }
      }
      previewLayerPresent  = pvwIdx !== -1;
      previewLayerDominant = pvwIdx === -1 || pvwIdx > highestSrcBldgIdx;
    } catch (e) {}
    report.previewLayerPresent  = previewLayerPresent;
    report.previewLayerDominant = previewLayerDominant;
    if (!previewLayerDominant) {
      report.footprintChecks.push({
        buildingKey:    '__preview_layer__',
        reason:         'dominance',
        classificationCode: 'E',
        classification: 'E — wos-preview-layer is not above all source building layers — replacement actor may render under source building',
        unsuppressedIds: [],
      });
    }

    // ── 4. Summary classification ────────────────────────────────────────────
    report.summary.totalUnsuppressedIds = totalUnsuppressed;

    var layerCodes    = report.layers.map(function (l) { return l.classificationCode; });
    var footprintCodes = report.footprintChecks
      .filter(function (fc) { return fc.classificationCode; })
      .map(function (fc) { return fc.classificationCode; });
    var allCodes = layerCodes.concat(footprintCodes);

    var worstCode = 'D';
    if (allCodes.indexOf('E') !== -1) worstCode = 'E';
    if (allCodes.indexOf('A') !== -1) worstCode = 'A';
    if (allCodes.indexOf('B') !== -1 && worstCode !== 'A') worstCode = 'B';
    if (allCodes.indexOf('C') !== -1 && worstCode === 'D') worstCode = 'C';

    var classificationMessages = {
      'A': 'A — No suppression expression on one or more layers: suppression did not apply',
      'B': 'B — Expression present but registered IDs missing from match arms: ID type mismatch or stale snapshot',
      'C': 'C — Expression present and IDs correct, but extra rendered tile/part IDs remain: live-requery needed',
      'D': 'D — All source building features appear suppressed ✓',
      'E': 'E — Replacement layer not dominant: wos-preview-layer renders below source building layer',
    };
    report.summary.allSuppressed    = worstCode === 'D';
    report.summary.classificationCode = worstCode;
    report.summary.classification   = classificationMessages[worstCode] || worstCode;

    console.log('[BuildingPreviewRuntime] verifyPreviewSuppression CLASSIFICATION:', worstCode, '—', report.summary.classification);
    if (totalUnsuppressed > 0) {
      console.warn('[BuildingPreviewRuntime] verifyPreviewSuppression: ' + totalUnsuppressed + ' unsuppressed rendered ID(s) remain');
    }
    console.log('[BuildingPreviewRuntime] verifyPreviewSuppression FULL REPORT:');
    console.log(JSON.stringify(report, null, 2));
    return report;
  }

  function previewStatus() {
    var map       = _getMap();
    var buildings = _getManifest();

    var total = 0, ready = 0;
    Object.keys(buildings).forEach(function (bKey) {
      var edit = buildings[bKey];
      if (!edit || !edit.replacement || !edit.replacement.enabled) return;
      total++;
      if (_geometryFromEdit(edit)) ready++;
    });

    var layerPresent = false;
    if (map) {
      try { layerPresent = !!map.getLayer(PREVIEW_LAYER_ID); } catch (e) {}
    }

    var status = {
      version:              '1.0.0',
      mode:                 _mode,
      previewLayerPresent:  layerPresent,
      replacementCount:     total,
      geometryReadyCount:   ready,
      missingGeometryCount: total - ready,
      styleKitLoaded:       !!(global.SBE && global.SBE.BuildingStyleKit),
      suppressedLayerCount: _suppressedLayers.length,
    };
    console.log('[BuildingPreviewRuntime] previewStatus:', JSON.stringify(status, null, 2));
    return status;
  }

  // ── Group status (0610J) ─────────────────────────────────────────────────────

  function groupStatus() {
    var groups    = _getManifestGroups();
    var buildings = _getManifest();

    var groupCount          = Object.keys(groups).length;
    var groupedMemberCount  = 0;
    var activeGroupActors   = 0;

    var groupedKeys = {};
    Object.keys(groups).forEach(function (gid) {
      var g = groups[gid];
      if (!g || !g.members) return;
      g.members.forEach(function (mk) { groupedKeys[mk] = true; groupedMemberCount++; });
      if (g.replacement && g.replacement.enabled) activeGroupActors++;
    });

    var ungroupedReplacementCount = 0;
    Object.keys(buildings).forEach(function (bKey) {
      var edit = buildings[bKey];
      if (edit && edit.replacement && edit.replacement.enabled && !groupedKeys[bKey]) {
        ungroupedReplacementCount++;
      }
    });

    var report = {
      groupCount:                groupCount,
      activeGroupActors:         activeGroupActors,
      groupedMemberCount:        groupedMemberCount,
      ungroupedReplacementCount: ungroupedReplacementCount,
      lastError:                 _lastError,
    };
    console.log('[BuildingPreviewRuntime] groupStatus:', JSON.stringify(report, null, 2));
    return report;
  }

  // ── Compound status (0610K) ───────────────────────────────────────────────────

  function compoundStatus() {
    var compounds = _getManifestCompounds();
    var groups    = _getManifestGroups();
    var buildings = _getManifest();

    var compoundCount           = Object.keys(compounds).length;
    var activeCompoundActors    = 0;
    var compoundClaimedBldgs    = {};
    var compoundClaimedGrps     = {};

    Object.keys(compounds).forEach(function (cid) {
      var c = compounds[cid];
      if (!c) return;
      if (c.replacement && c.replacement.enabled) activeCompoundActors++;
      if (!c.members) return;
      c.members.forEach(function (m) {
        if (!m) return;
        if (m.indexOf('group_') === 0) {
          compoundClaimedGrps[m] = cid;
          var grp = groups[m];
          if (grp && grp.members) grp.members.forEach(function (mk) { compoundClaimedBldgs[mk] = cid; });
        } else {
          compoundClaimedBldgs[m] = cid;
        }
      });
    });

    var activeGroupActors = 0, ungroupedReplacementCount = 0;
    Object.keys(groups).forEach(function (gid) {
      if (!compoundClaimedGrps[gid]) {
        var g = groups[gid];
        if (g && g.replacement && g.replacement.enabled) activeGroupActors++;
      }
    });
    Object.keys(buildings).forEach(function (bKey) {
      if (compoundClaimedBldgs[bKey]) return;
      var edit = buildings[bKey];
      if (edit && edit.replacement && edit.replacement.enabled) ungroupedReplacementCount++;
    });

    var report = {
      compoundCount:             compoundCount,
      activeCompoundActors:      activeCompoundActors,
      compoundClaimedGroupCount: Object.keys(compoundClaimedGrps).length,
      compoundClaimedBldgCount:  Object.keys(compoundClaimedBldgs).length,
      activeGroupActors:         activeGroupActors,
      ungroupedReplacementCount: ungroupedReplacementCount,
      lastError:                 _lastError,
    };
    console.log('[BuildingPreviewRuntime] compoundStatus:', JSON.stringify(report, null, 2));
    return report;
  }

  // ── Style parity status (0610N) ───────────────────────────────────────────────

  // previewStyleParityStatus — parity audit for the preview runtime.
  // Returns the current mode, layer presence, suppression counts, and whether
  // source building opacities have been correctly restored when in Author mode.
  function previewStyleParityStatus() {
    var map          = _getMap();
    var layerPresent = false;
    if (map) {
      try { layerPresent = !!map.getLayer(PREVIEW_LAYER_ID); } catch (e) {}
    }

    // In preview mode: count manifest entries that qualify for suppression
    var buildings     = _getManifest();
    var suppressCandidates = 0;
    Object.keys(buildings).forEach(function (k) {
      var e = buildings[k];
      if (e && ((e.replacement && e.replacement.enabled) || e.hidden)) suppressCandidates++;
    });

    var snap = {
      version:                      '1.5.0',
      mode:                         _mode,
      previewLayerPresent:          layerPresent,
      suppressedLayerCount:         _suppressedLayers.length,
      restoredLayerCount:           _restoredLayerCount,
      originalOpacitySnapshotCount: _suppressedLayers.length,
      suppressCandidateCount:       suppressCandidates,
      suppressionIdCount:           _suppressionIdCount,
      footprintSuppressionCount:    _footprintSuppressionCount,
      unsuppressedSourceCount:      0,  // call unsuppressedSourceBuildings() for live count
      authorCueActive:              _mode === 'author',
      sourceSuppressionActive:      _mode === 'preview' && _suppressedLayers.length > 0,
      parityOk:                     (_mode === 'preview') === layerPresent,
      // 0611G: suppression method used
      suppressionMethod:            _lastSuppressionMethod,
      lastError:                    _lastError,
    };
    console.log('[BuildingPreviewRuntime] previewStyleParityStatus:', JSON.stringify(snap, null, 2));
    return snap;
  }

  // ── Export ────────────────────────────────────────────────────────────────────

  global.WOSMapLab = global.WOSMapLab || {};
  global.WOSMapLab.BuildingPreviewRuntime = Object.freeze({
    VERSION:                     '1.5.0',
    init:                        init,
    setMode:                     setMode,
    getMode:                     getMode,
    refresh:                     refresh,
    previewStatus:               previewStatus,
    visualAuthorityStatus:       visualAuthorityStatus,
    unsuppressedSourceBuildings: unsuppressedSourceBuildings,   // 0610I
    groupStatus:                 groupStatus,                   // 0610J
    compoundStatus:              compoundStatus,                // 0610K
    previewStyleParityStatus:    previewStyleParityStatus,      // 0610N
    verifyPreviewSuppression:    verifyPreviewSuppression,      // 0611H
  });

  // Shortcuts
  global.WOSMapLab.previewStatus               = previewStatus;
  global.WOSMapLab.visualAuthorityStatus       = visualAuthorityStatus;
  global.WOSMapLab.unsuppressedSourceBuildings = unsuppressedSourceBuildings;  // 0610I
  global.WOSMapLab.groupStatus                 = groupStatus;                  // 0610J
  global.WOSMapLab.compoundStatus              = compoundStatus;               // 0610K
  global.WOSMapLab.previewStyleParityStatus    = previewStyleParityStatus;     // 0610N shortcut
  global.WOSMapLab.verifyPreviewSuppression    = verifyPreviewSuppression;     // 0611H shortcut

  console.log('[BuildingPreviewRuntime] v1.5.0 loaded | suppression: extrusion-height-suppression');
})(window);
