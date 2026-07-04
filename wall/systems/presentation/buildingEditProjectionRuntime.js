// ── BuildingEditProjectionRuntime v1.18.0 ────────────────────────────────────
// 0611U_WOS_EditableModeVisualIsolationResolution_v1.0.0_BUILD
// Prior: 0611T_WOS_EditableModeVisualSourceIsolation_v1.0.0_BUILD
// Prior: 0611S_WOS_EditableBuildingModeImportBypass_v1.0.0_BUILD
// Prior: 0611R_WOS_ImportedBasemapContaminationExitStrategy_v1.0.0_BUILD
// Prior: 0611Q_WOS_HostOwnedBuildingLayerAuthority_v1.0.0_BUILD
// Prior: 0611P_WOS_MapboxStyleSourceDecompositionAudit_v1.0.0_BUILD
// Prior: 0611O_WOS_MapboxStandardSchemaKeyResolver_v1.0.0_BUILD
// Prior: 0611N_WOS_StandardImportConfigTargetAudit_v1.0.0_BUILD
// Prior: 0611M_WOS_MapboxStandardConfigSuppressionAudit_v1.0.0_BUILD
// Prior: 0611G_WOS_WallPreviewHeightSuppressionParity_v1.0.0_BUILD
// Prior: 0610N_WOS_MapboxStyleParityAudit_v1.0.0_BUILD
// Prior: 0610K_WOS_CompoundBuildingAuthority_v1.0.0_BUILD
// Prior: 0610J_WOS_ReplacementBuildingGroupAuthority_v1.0.0_BUILD
// Prior: 0610I_WOS_ReplacementSourceBuildingSuppressionAudit_v1.0.0_BUILD
// Prior: 0610F_WOS_ReplacementLayerDominance_v1.0.0_BUILD
// Status: active | Classification: presentation-runtime, read-only, wall-safe
// 0612G reclassification:
//   BuildingEditProjectionRuntime is a source-building suppression/projection
//   compatibility runtime.
//   It does not own editable basemap authority.
//   It does not own replacement geometry.
//   It does not mutate the manifest.
//
// v1.4.0 — Footprint suppression expansion: _apply() now runs a Phase 2 footprint
//           query after the Phase 1 registry-key ID collection. For each replacement
//           with manifest geometry, queryRenderedFeatures() over the projected bbox
//           finds all tile copies, building:part features, and other ID variants that
//           share the same physical footprint. All IDs go into suppressedBySL before
//           the opacity-match expression is written. Adds suppressionIdCount,
//           footprintSuppressionCount to status(). Adds unsuppressedSourceBuildings()
//           public debug method. Version bump.
// v1.3.0 — Dominance wiring: adds cross-tab storage event listener so suppression
//           re-applies whenever Studio writes the manifest (was reload-only before).
//           Adds _collectReplacementSuppressionIds(manifest) internal helper and
//           getSuppressionIds() public method — returns { [sourceLayer]: numericId[] }
//           used by buildingReplacementRuntime dominanceStatus() audit.
// v1.2.0 — Original building suppression for replacement-enabled buildings.
//           Buildings with replacement.enabled === true (or hidden === true) are
//           now opacity-suppressed on the original Mapbox layer so the replacement
//           actor from buildingReplacementRuntime.js visually owns the footprint.
//           Primary strategy: fill-extrusion-opacity / fill-opacity match expression.
//           Fallback: transparent color override if opacity expression is rejected.
//           _discoverLayers now captures originalOpacity, colorProp, opacityProp.
//           clearProjection restores original opacity as well as original color.
//           Adds replacementSuppressionCount, suppressionStrategy,
//           suppressionLayerCount, suppressionFallbackCount to status().
//           Adds suppressionStatus() → per-layer suppression diagnostics.
// v1.1.0 — replacement projection: archetype color cue, replacementCount tracking.
// v1.0.0 — initial Wall projection of Studio building color/hidden edits.
//
// Authority:
//   READS:   localStorage["wos_building_published"] (0612L: published registry —
//            Wall consumes published state only, never the Studio draft)
//            Mapbox GL map — active style layers, paint properties
//   WRITES:  map.setPaintProperty() — color/opacity on building layers only
//   MUST NOT: mutate localStorage, expose editing UI, block Wall rendering,
//             crash on corrupt manifest, modify wos-replacement-* layers
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.18.1';

  var STORAGE_KEY               = 'wos_building_published';   // 0612L publish boundary
  // 0611Q: WOS-owned host building layer — always present, queryable, suppressible.
  var WOS_HOST_BUILDING_LAYER_ID = 'wos-host-buildings-3d';

  // 0611R: Building authority mode constants.
  // standard-import-mode  — cinematic; Standard import remains; suppression is best-effort.
  // editable-building-mode — strict authoring; WOS must own the visible building geometry.
  var BUILDING_AUTHORITY_MODES = Object.freeze({
    STANDARD_IMPORT:   'standard-import-mode',
    EDITABLE_BUILDING: 'editable-building-mode',
  });
  var SUPPRESSION_OPACITY = 0;     // preferred: fully invisible
  var SUPPRESSION_FALLBACK = 0.08; // used only if 0 causes map artifacts

  // ── Archetype projection colors ───────────────────────────────────────────────
  // Retained for status/debug; no longer projected as color on suppressed buildings
  // (replacement actor from buildingReplacementRuntime.js owns the visual).
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

  // ── Internal state ────────────────────────────────────────────────────────────

  var _initialized          = false;
  var _mapListenersAttached = false;
  var _manifest             = null;  // { version, buildings }
  var _layers               = [];    // discovered building layers with paint cache
  var _suppressionLayerStatus = [];  // per-layer suppression detail for suppressionStatus()

  var _state = {
    loaded:                      false,
    editCount:                   0,
    projectedColorCount:         0,
    hiddenCount:                 0,
    replacementCount:            0,
    replacementArchetypes:       {},
    buildingLayerCount:          0,
    layerIds:                    [],
    lastAppliedAt:               null,
    lastError:                   null,
    // 0610B suppression diagnostics
    replacementSuppressionCount: 0,
    suppressionStrategy:         'none',
    suppressionLayerCount:       0,
    suppressionFallbackCount:    0,
    // 0610I footprint expansion diagnostics
    suppressionIdCount:          0,   // total unique IDs suppressed across all source:layer keys
    footprintSuppressionCount:   0,   // extra IDs discovered via bbox query (Phase 2)
    // 0610M source-hide diagnostics
    hiddenOnlyCount:             0,   // buildings where hidden: true but no replacement.enabled
  };

  // 0610I: stores last computed per-slKey suppression ID sets for unsuppressedSourceBuildings()
  var _lastSuppressionBySL = {};  // slKey → numId[]

  // 0611J: IDs added by the final live query pass in _apply() — reported by verifySuppression()
  var _lastFinalLiveQueryIds   = {};  // fid(str) → true
  var _lastFinalLiveQueryCount = 0;

  // 0611K: model-type layers (Mapbox Standard) discovered but not suppressible
  var _modelLayers         = [];  // { id, type, source, sourceLayer, paintKeys }
  // 0611K: full candidate log from last _discoverLayers call — for verifySuppression
  var _discoveryCandidates = [];  // { id, type, source, sourceLayer, paintKeys, accepted, isModel, reason }

  // 0611Q: host-owned building authority layer state — updated by _ensureHostBuildingLayer
  var _hostBuildingLayerStatus = {
    enabled:               false,   // true once wos-host-buildings-3d is present in style
    sourceId:              null,    // 'composite' or import-derived source id
    sourceLayer:           'building',
    sourceOrigin:          null,    // 'host' | 'import-data' | 'none'
    layerPresent:          false,   // confirmed by most-recent _ensureHostBuildingLayer call
    layerAdded:            false,   // true if we added it (vs. found pre-existing)
    sourceAdded:           false,   // true if we had to addSource
    importBldgSuppAttempted: false, // true if we tried to suppress imported building layers
    importBldgSuppStrategy: 'none', // 'layout-visibility' | 'config-property' | 'none'
    lastError:             null,
  };

  // 0611R: current building authority mode (runtime-only, not persisted)
  var _buildingAuthorityMode  = BUILDING_AUTHORITY_MODES.STANDARD_IMPORT;

  var _buildingAuthorityState = {
    mode:                          BUILDING_AUTHORITY_MODES.STANDARD_IMPORT,
    hostLayerPresent:              false,
    hostLayerSuppressible:         false,
    importedBasemapPresent:        false,
    importedBuildingContamination: null,
    truePerBuildingSuppressionAvailable: false,
    visualAuthorityState:          'UNKNOWN',
    lastChangedAt:                 null,
    lastError:                     null,
  };

  // 0611S: editable building bypass state — updated by _applyEditableBuildingBypass
  var _editableBuildingBypassState = {
    active:                            false,
    hostLayerReady:                    false,
    hostLayerSuppressible:             false,
    importBypassedAsAuthority:         false,
    importedVisualContaminationLikely: false,
    lastAppliedAt:                     null,
    lastError:                         null,
  };

  // 0611T: editable visual isolation state — three separate facts
  var _editableVisualIsolationState = {
    editableDataAuthorityActive:          false,
    editableVisualIsolationAchieved:      false,
    importedBuildingsBypassedAsAuthority: false,
    importedVisualContaminationLikely:    false,
    truePerBuildingSuppressionAvailable:  false,
    visualAuthorityState:                 'UNKNOWN',
    lastCheckedAt:                        null,
    lastError:                            null,
  };

  // 0610K: compound suppression diagnostic state (updated each _apply)
  var _compoundSuppressionState = {
    compoundCount:                  0,
    compoundSuppressionIdCount:     0,
    compoundFootprintSuppressionCount: 0,
    suppressedCompoundIds:          [],
    lastError:                      null,
  };

  // ── Map access ────────────────────────────────────────────────────────────────

  function _getMap() {
    var mvr = global.SBE && SBE.MapboxViewportRuntime;
    return (mvr && typeof mvr.getMap === 'function') ? mvr.getMap() : null;
  }

  // ── Manifest loading ──────────────────────────────────────────────────────────

  function _loadManifest() {
    _manifest = null;
    _state.loaded    = false;
    _state.editCount = 0;
    _state.lastError = null;
    try {
      var raw = global.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        _manifest = { version: '1.0.0', buildings: {} };
        _state.loaded    = true;
        _state.editCount = 0;
        return true;
      }
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.buildings !== 'object') {
        console.warn('[BuildingEditProjectionRuntime] invalid manifest schema — projection disabled');
        _state.lastError = 'invalid_schema';
        return false;
      }
      _manifest = parsed;
      _state.loaded    = true;
      _state.editCount = Object.keys(_manifest.buildings).length;
      return true;
    } catch (e) {
      var msg = String(e && e.message || e);
      console.warn('[BuildingEditProjectionRuntime] manifest parse failed (corrupt JSON):', msg);
      _state.lastError = msg;
      return false;
    }
  }

  // ── Layer discovery ───────────────────────────────────────────────────────────
  // 0611K: Extended to detect Mapbox Standard 'model' layers and log every
  // fill-extrusion/model/fill candidate with explicit acceptance reasoning.
  //
  // Acceptance rules:
  //   fill-extrusion  → ACCEPTED (all) — height/base suppression works on this type
  //   model           → REJECTED (MODEL_LAYER_LIMITATION) — no height/base data-driven prop
  //   fill            → ACCEPTED if source-layer or id contains "building"
  //   other           → ACCEPTED only if id contains "building"
  //
  // All candidates (fill-extrusion, model, fill/other with "building") are stored in
  // _discoveryCandidates for verifySuppression() to report.

  function _discoverLayers(map) {
    _layers              = [];
    _modelLayers         = [];
    _discoveryCandidates = [];
    _state.buildingLayerCount = 0;
    _state.layerIds           = [];

    if (!map || typeof map.getStyle !== 'function') return [];
    var style = null;
    try { style = map.getStyle(); } catch (e) { return []; }
    if (!style || !style.layers) return [];

    var found = [];

    for (var i = 0; i < style.layers.length; i++) {
      var l    = style.layers[i];
      var lid  = (l.id || '').toLowerCase();
      var sl   = (l['source-layer'] || '').toLowerCase();
      var ltype = l.type || '';

      // 0611Q: always accept the WOS host building authority layer — it is a fill-extrusion
      // owned by WOS and is the primary suppression target; never skip it.
      var isWosHostBuildingLayer = (l.id === WOS_HOST_BUILDING_LAYER_ID);

      // Never suppress our own replacement or preview layers
      if ((l.id || '').indexOf('wos-replacement') === 0) continue;
      if ((l.id || '').indexOf('wos-preview')     === 0) continue;

      // ── Determine whether this layer is a candidate to log / accept ────────
      var isCandidate = ltype === 'fill-extrusion' ||
                        ltype === 'model'           ||
                        /building/.test(lid)        ||
                        /building/.test(sl);
      if (!isCandidate) continue;

      var paintKeys = l.paint ? Object.keys(l.paint) : [];
      var accepted  = false;
      var isModel   = false;
      var reason    = '';

      if (isWosHostBuildingLayer) {
        // 0611Q: WOS host building authority layer — unconditional acceptance.
        accepted = true;
        reason   = 'ACCEPTED — wos-host-buildings-3d: WOS host building authority layer; height/base suppression target';
      } else if (ltype === 'fill-extrusion') {
        // Accept all fill-extrusion layers — Mapbox Classic/Standard classic style.
        // fill-extrusion-height IS data-driven; height/base = 0 suppression works.
        accepted = true;
        reason   = 'ACCEPTED — fill-extrusion type; height/base suppression applicable';
      } else if (ltype === 'model') {
        // Mapbox Standard GL (v3) renders 3D buildings as 'model' layers.
        // model layers have no fill-extrusion-height — per-feature suppression not possible.
        isModel  = true;
        accepted = false;
        reason   = 'REJECTED — MODEL_LAYER_LIMITATION: model type has no data-driven height; fill-extrusion-height/base suppression cannot be applied';
      } else if (ltype === 'fill') {
        if (/building/.test(sl) || /building/.test(lid)) {
          accepted = true;
          reason   = 'ACCEPTED — fill type with "building" in source-layer or id';
        } else {
          reason   = 'REJECTED — fill type but "building" absent from source-layer and id';
        }
      } else {
        if (/building/.test(lid)) {
          accepted = true;
          reason   = 'ACCEPTED — type "' + ltype + '" with "building" in id';
        } else {
          reason   = 'REJECTED — type "' + ltype + '", "building" absent from id';
        }
      }

      _discoveryCandidates.push({
        id:          l.id,
        type:        ltype,
        source:      l.source          || null,
        sourceLayer: l['source-layer'] || null,
        paintKeys:   paintKeys,
        accepted:    accepted,
        isModel:     isModel,
        reason:      reason,
      });

      if (isModel) {
        _modelLayers.push({
          id:          l.id,
          type:        ltype,
          source:      l.source          || null,
          sourceLayer: l['source-layer'] || null,
          paintKeys:   paintKeys,
        });
        continue;
      }

      if (!accepted) continue;

      // ── Capture paint props for accepted layers ────────────────────────────
      var colorProp   = (ltype === 'fill-extrusion') ? 'fill-extrusion-color'
                      : (ltype === 'fill')            ? 'fill-color'
                      : null;
      var opacityProp = (ltype === 'fill-extrusion') ? 'fill-extrusion-opacity'
                      : (ltype === 'fill')            ? 'fill-opacity'
                      : null;

      var originalColor   = null;
      var originalOpacity = null;
      var originalHeight  = null;
      var originalBase    = null;

      if (colorProp && l.paint && l.paint[colorProp] !== undefined) {
        originalColor = l.paint[colorProp];
      }
      if (opacityProp) {
        if (l.paint && l.paint[opacityProp] !== undefined) {
          originalOpacity = l.paint[opacityProp];
        } else {
          originalOpacity = (ltype === 'fill-extrusion') ? 0.85 : 1.0;
        }
      }
      if (ltype === 'fill-extrusion' && l.paint) {
        if (l.paint['fill-extrusion-height'] !== undefined)
          originalHeight = l.paint['fill-extrusion-height'];
        if (l.paint['fill-extrusion-base'] !== undefined)
          originalBase = l.paint['fill-extrusion-base'];
      }

      found.push({
        id:              l.id,
        type:            ltype,
        source:          l.source          || null,
        sourceLayer:     l['source-layer'] || null,
        colorProp:       colorProp,
        opacityProp:     opacityProp,
        originalColor:   originalColor,
        originalOpacity: originalOpacity,
        originalHeight:  originalHeight,
        originalBase:    originalBase,
      });
    }

    _layers = found;
    _state.buildingLayerCount = found.length;
    _state.layerIds           = found.map(function (l) { return l.id; });

    // Always log the full candidate table for diagnostics
    if (_discoveryCandidates.length) {
      console.log('[BuildingEditProjectionRuntime] _discoverLayers candidates (' +
        _discoveryCandidates.length + '):',
        JSON.stringify(_discoveryCandidates.map(function (c) {
          return { id: c.id, type: c.type, source: c.source,
                   sourceLayer: c.sourceLayer, accepted: c.accepted, reason: c.reason };
        }), null, 2));
    }

    if (found.length) {
      console.log('[BuildingEditProjectionRuntime] discovered', found.length,
        'suppressible building layer(s):', found.map(function (l) {
          return l.id + '(' + l.type + ')';
        }).join(', '));
    } else if (_modelLayers.length) {
      console.warn('[BuildingEditProjectionRuntime] MODEL_LAYER_LIMITATION:',
        _modelLayers.length, 'model layer(s) found — fill-extrusion-height/base suppression not applicable.',
        'IDs:', _modelLayers.map(function (m) { return m.id; }).join(', '),
        '| Mapbox Standard (v3) "model" layers require a different suppression strategy.');
    } else {
      console.warn('[BuildingEditProjectionRuntime] no suppressible building layers found in current style',
        '(' + _discoveryCandidates.length + ' candidates examined)');
    }
    return found;
  }

  // ── Expression builders ───────────────────────────────────────────────────────

  // _buildMatchExpr — match on feature id → color (or any scalar)
  function _buildMatchExpr(entries, defaultExpr) {
    if (!entries || !entries.length) return defaultExpr;
    var args = ['match', ['id']];
    for (var i = 0; i < entries.length; i++) {
      args.push(entries[i].numericId);
      args.push(entries[i].value !== undefined ? entries[i].value : entries[i].color);
    }
    args.push(defaultExpr);
    return args;
  }

  // _buildOpacityMatchExpr — match feature id → 0 for suppressed, default otherwise
  function _buildOpacityMatchExpr(numericIds, defaultOpacity) {
    if (!numericIds || !numericIds.length) return defaultOpacity;
    var args = ['match', ['id']];
    for (var i = 0; i < numericIds.length; i++) {
      args.push(numericIds[i]);
      args.push(SUPPRESSION_OPACITY);
    }
    args.push(defaultOpacity);
    return args;
  }

  // 0611G: fill-extrusion height/base match expressions.
  // Setting height to 0 collapses extrusion to ground plane — no rendered pixels.
  // fill-extrusion-opacity is NOT data-driven; fill-extrusion-color alpha renders black.
  // Height suppression is the only reliable per-feature strategy for fill-extrusion.
  function _buildHeightMatchExpr(numericIds, originalHeight) {
    var fallback = (originalHeight !== null && originalHeight !== undefined) ? originalHeight : 0;
    if (!numericIds || !numericIds.length) return fallback;
    var args = ['match', ['id']];
    for (var i = 0; i < numericIds.length; i++) { args.push(numericIds[i]); args.push(0); }
    args.push(fallback);
    return args;
  }

  function _buildBaseMatchExpr(numericIds, originalBase) {
    var fallback = (originalBase !== null && originalBase !== undefined) ? originalBase : 0;
    if (!numericIds || !numericIds.length) return fallback;
    var args = ['match', ['id']];
    for (var i = 0; i < numericIds.length; i++) { args.push(numericIds[i]); args.push(0); }
    args.push(fallback);
    return args;
  }

  // ── Footprint query helper (0610I) ────────────────────────────────────────────

  // _queryFootprintFeatureIds — projects a manifest geometry bbox to screen space
  // and queries all rendered building features in that region.
  // Returns: { [source:sourceLayer]: numId[] }
  // Never throws — all errors caught; returns {} on any failure.
  function _queryFootprintFeatureIds(map, geom, queryLayerIds) {
    var result = {};
    try {
      var centroid = geom.centroid;
      var cosLat   = Math.cos(centroid.lat * Math.PI / 180) || 0.0001;
      // Pad 15% on each side so tile-clipped and building:part geometry is included.
      var halfW = (geom.widthM  / 2) * 1.15;
      var halfD = (geom.depthM  / 2) * 1.15;
      var dLng  = halfW / (111320 * cosLat);
      var dLat  = halfD / 111320;

      var sw = map.project([centroid.lng - dLng, centroid.lat - dLat]);
      var ne = map.project([centroid.lng + dLng, centroid.lat + dLat]);

      var minX = Math.min(sw.x, ne.x) - 4;
      var minY = Math.min(sw.y, ne.y) - 4;
      var maxX = Math.max(sw.x, ne.x) + 4;
      var maxY = Math.max(sw.y, ne.y) + 4;

      var opts     = (queryLayerIds && queryLayerIds.length) ? { layers: queryLayerIds } : {};
      var features = map.queryRenderedFeatures([[minX, minY], [maxX, maxY]], opts);

      for (var i = 0; i < features.length; i++) {
        var f = features[i];
        if (f.id == null) continue;
        var numId = Number(f.id);
        if (isNaN(numId) || numId === 0) continue;
        var src    = f.source       || '';
        var sl     = f.sourceLayer  || '';
        var slKey  = src + ':' + sl;
        if (!result[slKey]) result[slKey] = [];
        if (result[slKey].indexOf(numId) === -1) result[slKey].push(numId);
      }
    } catch (e) {
      // Footprint query is best-effort — one failure must not stop suppression of others.
    }
    return result;
  }

  // ── Paint application ─────────────────────────────────────────────────────────

  function _apply(map) {
    if (!_manifest || !_layers.length) return;

    var buildings = _manifest.buildings;
    var keys = Object.keys(buildings);
    var hasGroups = _manifest.groups && typeof _manifest.groups === 'object' &&
                    Object.keys(_manifest.groups).length > 0;
    if (!keys.length && !hasGroups) {
      // Nothing to project; ensure any previous suppression is cleared
      _clearPaintOverrides(map);
      return;
    }

    // Reset per-apply counters
    var totalColors      = 0;
    var totalHidden      = 0;
    var totalReplacement = 0;
    var totalSuppressed  = 0;
    var totalHiddenOnly  = 0;  // 0610M: hidden but no replacement.enabled
    var replacementArchetypes = {};

    // Group by source:sourceLayer
    // colorsBySL    — buildings that need only a color override (no suppression)
    // suppressedBySL — buildings that need opacity → 0 (hidden OR replacement.enabled)
    var colorsBySL     = {};   // slKey → [ { numericId, color } ]
    var suppressedBySL = {};   // slKey → [ numericId ]

    for (var i = 0; i < keys.length; i++) {
      var key  = keys[i];
      var edit = buildings[key];
      if (!edit) continue;

      var firstColon  = key.indexOf(':');
      var secondColon = key.indexOf(':', firstColon + 1);
      if (firstColon === -1 || secondColon === -1) continue;

      var src       = key.slice(0, firstColon);
      var sl        = key.slice(firstColon + 1, secondColon);
      var featureId = key.slice(secondColon + 1);
      var numId     = Number(featureId);
      if (isNaN(numId)) continue;

      var slKey = src + ':' + sl;
      if (!colorsBySL[slKey])     colorsBySL[slKey]    = [];
      if (!suppressedBySL[slKey]) suppressedBySL[slKey] = [];

      // ── Priority: hidden or replacement → suppress; else simple color ──────
      var doSuppress = edit.hidden || (edit.replacement && edit.replacement.enabled);

      if (doSuppress) {
        suppressedBySL[slKey].push(numId);
        totalSuppressed++;
        if (edit.hidden) {
          totalHidden++;
          if (!(edit.replacement && edit.replacement.enabled)) totalHiddenOnly++;  // 0610M
        }
        if (edit.replacement && edit.replacement.enabled) {
          totalReplacement++;
          var archetype = edit.replacement.archetype || 'custom-placeholder';
          replacementArchetypes[archetype] = (replacementArchetypes[archetype] || 0) + 1;
        }
      } else if (edit.color) {
        colorsBySL[slKey].push({ numericId: numId, color: edit.color });
        totalColors++;
      }
    }

    // ── 0610J: Group member suppression ──────────────────────────────────────
    // For each enabled group, suppress all member building keys so no original
    // Mapbox feature from any member is visible under the group replacement actor.
    var groups = (_manifest.groups && typeof _manifest.groups === 'object')
                 ? _manifest.groups : {};
    var groupGeoms = [];  // group combined geometries for Phase 2b

    Object.keys(groups).forEach(function (groupId) {
      var group = groups[groupId];
      if (!group || !group.replacement || !group.replacement.enabled) return;
      if (!Array.isArray(group.members)) return;

      // Collect group's combined geometry for Phase 2 footprint query
      var gg = group.geometry;
      if (gg && gg.centroid &&
          typeof gg.centroid.lng === 'number' &&
          typeof gg.centroid.lat === 'number' &&
          typeof gg.widthM === 'number' && gg.widthM >= 4 &&
          typeof gg.depthM === 'number' && gg.depthM >= 4) {
        groupGeoms.push({ centroid: gg.centroid, widthM: gg.widthM, depthM: gg.depthM });
      }

      // Suppress each member building feature
      group.members.forEach(function (memberKey) {
        var firstColon  = memberKey.indexOf(':');
        var secondColon = memberKey.indexOf(':', firstColon + 1);
        if (firstColon === -1 || secondColon === -1) return;
        var src    = memberKey.slice(0, firstColon);
        var sl     = memberKey.slice(firstColon + 1, secondColon);
        var numId  = Number(memberKey.slice(secondColon + 1));
        if (isNaN(numId)) return;
        var slKey  = src + ':' + sl;
        if (!suppressedBySL[slKey]) suppressedBySL[slKey] = [];
        if (suppressedBySL[slKey].indexOf(numId) === -1) {
          suppressedBySL[slKey].push(numId);
          totalSuppressed++;
        }
      });
    });

    // ── 0610K: Compound member suppression (Passes 3 + 4) ────────────────────
    // Pass 3: directly-referenced building keys in active compounds.
    // Pass 4: buildings that are members of groups referenced by active compounds.
    var compounds = (_manifest.compounds && typeof _manifest.compounds === 'object')
                    ? _manifest.compounds : {};
    var compoundGeoms     = [];  // compound combined geometries for Phase 3
    var compoundCount0610 = 0;
    var compoundSuppressed0610 = 0;
    var suppressedCompoundIds0610 = [];

    Object.keys(compounds).forEach(function (compoundId) {
      var compound = compounds[compoundId];
      if (!compound || !compound.replacement || !compound.replacement.enabled) return;
      if (!Array.isArray(compound.members)) return;

      compoundCount0610++;
      suppressedCompoundIds0610.push(compoundId);

      // Collect compound geometry for Phase 3
      var cg = compound.geometry;
      if (cg && cg.centroid &&
          typeof cg.centroid.lng === 'number' &&
          typeof cg.centroid.lat === 'number' &&
          typeof cg.widthM === 'number' && cg.widthM >= 4 &&
          typeof cg.depthM === 'number' && cg.depthM >= 4) {
        compoundGeoms.push({ centroid: cg.centroid, widthM: cg.widthM, depthM: cg.depthM });
      }

      // Pass 3: direct building-key members
      // Pass 4: group-id members → expand each group's buildings
      compound.members.forEach(function (memberKey) {
        if (!memberKey) return;
        if (memberKey.indexOf('group_') === 0) {
          // Pass 4: group member → expand
          var grp = (_manifest.groups && _manifest.groups[memberKey]) || null;
          if (!grp || !Array.isArray(grp.members)) return;
          grp.members.forEach(function (mk) {
            var fc  = mk.indexOf(':');
            var sc  = mk.indexOf(':', fc + 1);
            if (fc === -1 || sc === -1) return;
            var src   = mk.slice(0, fc);
            var sl    = mk.slice(fc + 1, sc);
            var numId = Number(mk.slice(sc + 1));
            if (isNaN(numId)) return;
            var slKey = src + ':' + sl;
            if (!suppressedBySL[slKey]) suppressedBySL[slKey] = [];
            if (suppressedBySL[slKey].indexOf(numId) === -1) {
              suppressedBySL[slKey].push(numId);
              totalSuppressed++;
              compoundSuppressed0610++;
            }
          });
        } else {
          // Pass 3: direct building key
          var fc  = memberKey.indexOf(':');
          var sc  = memberKey.indexOf(':', fc + 1);
          if (fc === -1 || sc === -1) return;
          var src   = memberKey.slice(0, fc);
          var sl    = memberKey.slice(fc + 1, sc);
          var numId = Number(memberKey.slice(sc + 1));
          if (isNaN(numId)) return;
          var slKey = src + ':' + sl;
          if (!suppressedBySL[slKey]) suppressedBySL[slKey] = [];
          if (suppressedBySL[slKey].indexOf(numId) === -1) {
            suppressedBySL[slKey].push(numId);
            totalSuppressed++;
            compoundSuppressed0610++;
          }
        }
      });
    });

    // ── Phase 2: footprint bbox query expansion (0610I) ──────────────────────
    // For each replacement-enabled edit that has manifest geometry, query all
    // rendered building features in the footprint bbox and merge those IDs into
    // suppressedBySL so tile copies and building:part features are also suppressed.
    var footprintCount   = 0;
    var queryLayerIds    = _layers.filter(function (l) {
      return l.source && l.sourceLayer;
    }).map(function (l) { return l.id; });

    for (var ip = 0; ip < keys.length; ip++) {
      var kp   = keys[ip];
      var editp = buildings[kp];
      if (!editp || !editp.replacement || !editp.replacement.enabled) continue;
      var gp = editp.geometry;
      if (!gp || !gp.centroid ||
          typeof gp.centroid.lng !== 'number' ||
          typeof gp.centroid.lat !== 'number') continue;
      var wMp = typeof gp.widthM === 'number' ? gp.widthM : 0;
      var dMp = typeof gp.depthM === 'number' ? gp.depthM : 0;
      if (wMp < 4 || dMp < 4) continue;

      var geomForQuery = {
        centroid: gp.centroid,
        widthM:   wMp,
        depthM:   dMp,
      };

      try {
        var queried = _queryFootprintFeatureIds(map, geomForQuery, queryLayerIds);
        var qKeys   = Object.keys(queried);
        for (var qi = 0; qi < qKeys.length; qi++) {
          var qSlKey  = qKeys[qi];
          var qIds    = queried[qSlKey];
          if (!suppressedBySL[qSlKey]) suppressedBySL[qSlKey] = [];
          for (var qj = 0; qj < qIds.length; qj++) {
            if (suppressedBySL[qSlKey].indexOf(qIds[qj]) === -1) {
              suppressedBySL[qSlKey].push(qIds[qj]);
              footprintCount++;
              totalSuppressed++;
            }
          }
        }
      } catch (e) {}
    }

    // Phase 2b — group combined footprint queries (0610J)
    // Run footprint bbox query on each group's combined geometry so tile copies
    // that only overlap the group boundary (but not individual members) are caught.
    for (var ig = 0; ig < groupGeoms.length; ig++) {
      try {
        var ggQueried = _queryFootprintFeatureIds(map, groupGeoms[ig], queryLayerIds);
        var ggKeys    = Object.keys(ggQueried);
        for (var gqi = 0; gqi < ggKeys.length; gqi++) {
          var gqSlKey = ggKeys[gqi];
          var gqIds   = ggQueried[gqSlKey];
          if (!suppressedBySL[gqSlKey]) suppressedBySL[gqSlKey] = [];
          for (var gqj = 0; gqj < gqIds.length; gqj++) {
            if (suppressedBySL[gqSlKey].indexOf(gqIds[gqj]) === -1) {
              suppressedBySL[gqSlKey].push(gqIds[gqj]);
              footprintCount++;
              totalSuppressed++;
            }
          }
        }
      } catch (e) {}
    }

    // Phase 3 — compound combined footprint queries (0610K)
    var compoundFootprintCount = 0;
    for (var ic = 0; ic < compoundGeoms.length; ic++) {
      try {
        var cQueried = _queryFootprintFeatureIds(map, compoundGeoms[ic], queryLayerIds);
        var cQKeys   = Object.keys(cQueried);
        for (var cqi = 0; cqi < cQKeys.length; cqi++) {
          var cqSlKey = cQKeys[cqi];
          var cqIds   = cQueried[cqSlKey];
          if (!suppressedBySL[cqSlKey]) suppressedBySL[cqSlKey] = [];
          for (var cqj = 0; cqj < cqIds.length; cqj++) {
            if (suppressedBySL[cqSlKey].indexOf(cqIds[cqj]) === -1) {
              suppressedBySL[cqSlKey].push(cqIds[cqj]);
              footprintCount++;
              compoundFootprintCount++;
              totalSuppressed++;
            }
          }
        }
      } catch (e) {}
    }

    if (footprintCount > 0) {
      console.log('[BuildingEditProjectionRuntime] Phase 2/3 footprint expansion: +' +
        footprintCount + ' suppression ID(s) (' + compoundFootprintCount + ' compound)');
    }

    // ── Phase 4 (0611J): final live query pass ────────────────────────────────
    // Re-queries every suppression footprint with an unrestricted queryRenderedFeatures
    // call (no layer filter). This catches building:part features, tile copies, and
    // any features from source layers not present in _layers (e.g. when the active
    // Mapbox style has no standard building layer and queryLayerIds is empty).
    //
    // Filter: source === 'composite' AND (sourceLayer ∋ 'building' OR layer.id ∋ 'building')
    //         AND feature.id != null AND numeric.
    // Result is merged into suppressedBySL before any height/base expression is written.
    var finalLiveQueryNewCount = 0;
    var finalLiveQueryIdMap    = {};  // fid(str) → true — only newly added IDs

    // Collect all footprint geometries that need suppression.
    // Reuse the individual-building geometries (already filtered above for Phase 2),
    // plus groupGeoms and compoundGeoms collected earlier.
    var allSuppressionGeoms = [];
    for (var p4i = 0; p4i < keys.length; p4i++) {
      var p4Edit = buildings[keys[p4i]];
      var p4Suppress = p4Edit && (p4Edit.hidden || (p4Edit.replacement && p4Edit.replacement.enabled));
      if (!p4Suppress) continue;
      var p4G = p4Edit.geometry;
      if (!p4G || !p4G.centroid ||
          typeof p4G.centroid.lng !== 'number' ||
          typeof p4G.centroid.lat !== 'number') continue;
      var p4W = typeof p4G.widthM === 'number' ? p4G.widthM : 0;
      var p4D = typeof p4G.depthM === 'number' ? p4G.depthM : 0;
      if (p4W < 4 || p4D < 4) continue;
      allSuppressionGeoms.push({ centroid: p4G.centroid, widthM: p4W, depthM: p4D });
    }
    for (var p4gi = 0; p4gi < groupGeoms.length; p4gi++)    allSuppressionGeoms.push(groupGeoms[p4gi]);
    for (var p4ci = 0; p4ci < compoundGeoms.length; p4ci++) allSuppressionGeoms.push(compoundGeoms[p4ci]);

    for (var p4idx = 0; p4idx < allSuppressionGeoms.length; p4idx++) {
      var p4Geom = allSuppressionGeoms[p4idx];
      try {
        var p4CosLat = Math.cos(p4Geom.centroid.lat * Math.PI / 180) || 0.0001;
        var p4HalfW  = (p4Geom.widthM / 2) * 1.15;
        var p4HalfD  = (p4Geom.depthM / 2) * 1.15;
        var p4DLng   = p4HalfW / (111320 * p4CosLat);
        var p4DLat   = p4HalfD / 111320;
        var p4Sw     = map.project([p4Geom.centroid.lng - p4DLng, p4Geom.centroid.lat - p4DLat]);
        var p4Ne     = map.project([p4Geom.centroid.lng + p4DLng, p4Geom.centroid.lat + p4DLat]);
        var p4MinX   = Math.min(p4Sw.x, p4Ne.x) - 4;
        var p4MinY   = Math.min(p4Sw.y, p4Ne.y) - 4;
        var p4MaxX   = Math.max(p4Sw.x, p4Ne.x) + 4;
        var p4MaxY   = Math.max(p4Sw.y, p4Ne.y) + 4;

        // Unrestricted query — no layers filter — so building:part and any composite
        // building features not in _layers are included.
        var p4Feats = map.queryRenderedFeatures([[p4MinX, p4MinY], [p4MaxX, p4MaxY]]) || [];
        for (var p4fi = 0; p4fi < p4Feats.length; p4fi++) {
          var p4F = p4Feats[p4fi];
          if (p4F.id == null) continue;
          if (p4F.source !== 'composite') continue;
          var p4Sl  = p4F.sourceLayer || '';
          var p4Lid = (p4F.layer && p4F.layer.id) || '';
          if (!/building/i.test(p4Sl) && !/building/i.test(p4Lid)) continue;
          var p4NumId = Number(p4F.id);
          if (isNaN(p4NumId)) continue;
          var p4SlKey = 'composite:' + p4Sl;
          if (!suppressedBySL[p4SlKey]) suppressedBySL[p4SlKey] = [];
          if (suppressedBySL[p4SlKey].indexOf(p4NumId) === -1) {
            suppressedBySL[p4SlKey].push(p4NumId);
            finalLiveQueryNewCount++;
            totalSuppressed++;
            finalLiveQueryIdMap[String(p4NumId)] = true;
          }
        }
      } catch (e) {}
    }

    if (finalLiveQueryNewCount > 0) {
      console.log('[BuildingEditProjectionRuntime] Phase 4 live query added',
        finalLiveQueryNewCount, 'suppression ID(s):',
        Object.keys(finalLiveQueryIdMap).join(', '));
    }
    _lastFinalLiveQueryIds   = finalLiveQueryIdMap;
    _lastFinalLiveQueryCount = finalLiveQueryNewCount;

    // Update compound suppression diagnostic state
    _compoundSuppressionState.compoundCount                     = compoundCount0610;
    _compoundSuppressionState.compoundSuppressionIdCount        = compoundSuppressed0610;
    _compoundSuppressionState.compoundFootprintSuppressionCount = compoundFootprintCount;
    _compoundSuppressionState.suppressedCompoundIds             = suppressedCompoundIds0610.slice();
    _compoundSuppressionState.lastError                         = null;

    // ── Apply to each building layer ──────────────────────────────────────────
    // 0611G: fill-extrusion layers use height/base=0 suppression.
    //   • fill-extrusion-opacity is NOT data-driven (layer-scope only, match expr ignored).
    //   • fill-extrusion-color alpha is discarded in FBO compositing (renders solid black).
    //   • fill-extrusion-height IS data-driven. Setting to 0 collapses extrusion → no pixels.
    // fill layers continue to use fill-opacity (IS data-driven, unchanged).
    var newLayerStatus        = [];
    var suppressionLayerCount = 0;
    var fallbackCount         = 0;
    var strategyUsed          = 'none';

    for (var j = 0; j < _layers.length; j++) {
      var layer = _layers[j];
      var lKey  = (layer.source || '') + ':' + (layer.sourceLayer || '');

      if (!layer.colorProp) continue; // unsupported layer type — skip

      var colorEntries  = colorsBySL[lKey]    || [];
      var suppressedIds = suppressedBySL[lKey] || [];

      var defaultColor   = layer.originalColor   != null ? layer.originalColor   : '#8899aa';
      var defaultOpacity = layer.originalOpacity != null ? layer.originalOpacity
                         : (layer.type === 'fill-extrusion' ? 0.85 : 1.0);

      var layerStatus = {
        id:             layer.id,
        type:           layer.type,
        strategy:       'none',
        suppressedCount: suppressedIds.length,
        fallback:        false,
      };

      // ── 1. Color overrides (color-only buildings, no suppression) ─────────
      if (colorEntries.length) {
        var colorExpr = _buildMatchExpr(colorEntries, defaultColor);
        try {
          map.setPaintProperty(layer.id, layer.colorProp, colorExpr);
        } catch (e) {
          var errMsg = String(e && e.message || e);
          console.warn('[BuildingEditProjectionRuntime] color setPaintProperty failed on "' + layer.id + '":', errMsg);
          _state.lastError = errMsg;
        }
      } else if (!suppressedIds.length) {
        // No overrides for this layer — restore default color
        try { map.setPaintProperty(layer.id, layer.colorProp, defaultColor); } catch (e) {}
      }

      // ── 2. Suppression ────────────────────────────────────────────────────
      if (suppressedIds.length) {
        if (layer.type === 'fill-extrusion') {
          // 0611G: height/base suppression — only reliable per-feature method
          var heightExpr = _buildHeightMatchExpr(suppressedIds, layer.originalHeight);
          var baseExpr   = _buildBaseMatchExpr(suppressedIds, layer.originalBase);
          var heightSet  = false;
          try {
            map.setPaintProperty(layer.id, 'fill-extrusion-height', heightExpr);
            heightSet = true;
            layerStatus.strategy = 'extrusion-height-suppression';
            if (strategyUsed === 'none') strategyUsed = 'extrusion-height-suppression';
          } catch (e) {
            console.warn('[BuildingEditProjectionRuntime] height suppression failed on "' + layer.id + '":', e.message || e);
            _state.lastError = String(e && e.message || e);
          }
          if (heightSet) {
            try {
              map.setPaintProperty(layer.id, 'fill-extrusion-base', baseExpr);
            } catch (e) {
              // base failure non-fatal — height alone collapses the extrusion
              console.warn('[BuildingEditProjectionRuntime] base suppression failed on "' + layer.id + '" (non-fatal):', e.message || e);
            }
            suppressionLayerCount++;
          }
        } else {
          // fill layers — fill-opacity IS data-driven
          if (layer.opacityProp) {
            var opacityExpr = _buildOpacityMatchExpr(suppressedIds, defaultOpacity);
            var opacitySet  = false;
            try {
              map.setPaintProperty(layer.id, layer.opacityProp, opacityExpr);
              opacitySet = true;
              layerStatus.strategy = 'opacity-match';
              if (strategyUsed === 'none') strategyUsed = 'opacity-match';
            } catch (e) {
              console.warn('[BuildingEditProjectionRuntime] opacity suppression failed on "' + layer.id + '" — using color fallback:', e.message || e);
            }
            if (!opacitySet) {
              var fallbackEntries = colorEntries.slice();
              for (var fi = 0; fi < suppressedIds.length; fi++) {
                fallbackEntries.push({ numericId: suppressedIds[fi], color: 'rgba(0,0,0,0)' });
              }
              var fallbackColorExpr = _buildMatchExpr(fallbackEntries, defaultColor);
              try {
                map.setPaintProperty(layer.id, layer.colorProp, fallbackColorExpr);
                layerStatus.strategy = 'color-fallback';
                layerStatus.fallback = true;
                fallbackCount++;
                if (strategyUsed === 'none') strategyUsed = 'color-fallback';
              } catch (e2) {
                console.warn('[BuildingEditProjectionRuntime] color fallback also failed on "' + layer.id + '":', e2.message || e2);
                _state.lastError = String(e2 && e2.message || e2);
              }
            }
            suppressionLayerCount++;
          }
        }
      } else {
        // No suppressions active — restore original values for this layer
        if (layer.type === 'fill-extrusion') {
          try { map.setPaintProperty(layer.id, 'fill-extrusion-height',
            layer.originalHeight !== null && layer.originalHeight !== undefined ? layer.originalHeight : null); } catch (e) {}
          try { map.setPaintProperty(layer.id, 'fill-extrusion-base',
            layer.originalBase !== null && layer.originalBase !== undefined ? layer.originalBase : null); } catch (e) {}
        } else if (layer.opacityProp) {
          try { map.setPaintProperty(layer.id, layer.opacityProp,
            layer.originalOpacity != null ? layer.originalOpacity : null); } catch (e) {}
        }
      }

      newLayerStatus.push(layerStatus);
    }

    // ── Update state ──────────────────────────────────────────────────────────
    _suppressionLayerStatus              = newLayerStatus;
    _state.projectedColorCount           = totalColors;
    _state.hiddenCount                   = totalHidden;
    _state.replacementCount              = totalReplacement;
    _state.replacementArchetypes         = replacementArchetypes;
    _state.replacementSuppressionCount   = totalSuppressed;
    _state.suppressionStrategy           = strategyUsed;
    _state.suppressionLayerCount         = suppressionLayerCount;
    _state.suppressionFallbackCount      = fallbackCount;
    _state.lastAppliedAt                 = Date.now();
    // 0610I: store footprint counts + suppressed ID snapshot for audit
    _state.footprintSuppressionCount     = footprintCount;
    _state.hiddenOnlyCount               = totalHiddenOnly;  // 0610M
    var totalUniqueIds = 0;
    var slSnap = {};
    var slKeys = Object.keys(suppressedBySL);
    for (var si = 0; si < slKeys.length; si++) {
      totalUniqueIds += suppressedBySL[slKeys[si]].length;
      slSnap[slKeys[si]] = suppressedBySL[slKeys[si]].slice();
    }
    _state.suppressionIdCount = totalUniqueIds;
    _lastSuppressionBySL      = slSnap;

    if (totalColors || totalSuppressed) {
      console.log('[BuildingEditProjectionRuntime] applied —',
        'colors:', totalColors,
        '| suppressed:', totalSuppressed,
        '(' + totalReplacement + ' replacement + ' + totalHidden + ' hidden)',
        '| strategy:', strategyUsed,
        '| fallbacks:', fallbackCount,
        '| layers:', _layers.length);
    }
  }

  // _clearPaintOverrides — restores all building layers to their original paint
  // values without touching _manifest or _layers. Used internally when no edits
  // are present, and publicly via clearProjection().
  // 0611G: fill-extrusion layers were suppressed via height/base — restore those too.
  function _clearPaintOverrides(map) {
    if (!map || !_layers.length) return;
    for (var i = 0; i < _layers.length; i++) {
      var layer = _layers[i];
      // Restore color
      if (layer.colorProp) {
        var restoreColor = layer.originalColor != null ? layer.originalColor : null;
        try { map.setPaintProperty(layer.id, layer.colorProp, restoreColor); } catch (e) {}
      }
      if (layer.type === 'fill-extrusion') {
        // 0611G: restore height and base (suppression wrote match expressions here)
        var restoreH = layer.originalHeight !== null && layer.originalHeight !== undefined
          ? layer.originalHeight : null;
        var restoreB = layer.originalBase !== null && layer.originalBase !== undefined
          ? layer.originalBase : null;
        try { map.setPaintProperty(layer.id, 'fill-extrusion-height', restoreH); } catch (e) {}
        try { map.setPaintProperty(layer.id, 'fill-extrusion-base',   restoreB); } catch (e) {}
      } else {
        // Restore opacity (fill layers)
        if (layer.opacityProp) {
          var restoreOpacity = layer.originalOpacity != null ? layer.originalOpacity : null;
          try { map.setPaintProperty(layer.id, layer.opacityProp, restoreOpacity); } catch (e) {}
        }
      }
    }
  }

  // ── 0611Q: Host-owned building layer authority ────────────────────────────────

  // _discoverHostSource — resolves the best available building tile source for
  // the WOS host fill-extrusion layer.  Priority:
  //   1. 'composite' already in host style (Mapbox Classic / most setups)
  //   2. First vector source found in imports[0].data.sources
  // Returns: { ok, sourceId, sourceLayer, sourceDefinition, sourceOrigin, error }
  function _discoverHostSource(map) {
    var style = null;
    try { style = map.getStyle(); } catch (e) {
      return { ok: false, sourceId: null, sourceLayer: null, sourceDefinition: null, sourceOrigin: 'none', error: String(e && e.message || e) };
    }
    var hostSources = (style && style.sources) || {};

    // Priority 1: composite in host
    if (hostSources['composite']) {
      return { ok: true, sourceId: 'composite', sourceLayer: 'building',
               sourceDefinition: hostSources['composite'], sourceOrigin: 'host', error: null };
    }

    // Priority 2: vector source inside import data
    var imports = (style && Array.isArray(style.imports)) ? style.imports : [];
    for (var ii = 0; ii < imports.length; ii++) {
      var impData = imports[ii].data;
      if (!impData || typeof impData.sources !== 'object') continue;
      var impSrcKeys = Object.keys(impData.sources);
      for (var si = 0; si < impSrcKeys.length; si++) {
        var sk    = impSrcKeys[si];
        var srcDef = impData.sources[sk];
        if (srcDef && (srcDef.type === 'vector' || srcDef.url)) {
          return { ok: true, sourceId: sk, sourceLayer: 'building',
                   sourceDefinition: srcDef, sourceOrigin: 'import-data', error: null };
        }
      }
    }

    return { ok: false, sourceId: null, sourceLayer: null, sourceDefinition: null, sourceOrigin: 'none',
             error: 'No accessible vector building source found in host style or import data' };
  }

  // _ensureHostBuildingLayer — idempotent. Adds wos-host-buildings-3d to the host
  // style if absent, and best-effortily attempts to hide imported Standard buildings.
  // Never throws. Called at every style-ready / reload / apply convergence point.
  // Returns a status object that updates _hostBuildingLayerStatus.
  function _ensureHostBuildingLayer(map) {
    var result = {
      ok: false, layerAdded: false, layerAlreadyPresent: false,
      sourceAdded: false, sourceId: null, sourceLayer: null, sourceOrigin: null,
      importBldgSuppAttempted: false, importBldgSuppStrategy: 'none', error: null,
    };

    if (!map) { result.error = 'map not available'; _hostBuildingLayerStatus.lastError = result.error; return result; }

    var style = null;
    try { style = map.getStyle(); } catch (e) {
      result.error = String(e && e.message || e);
      _hostBuildingLayerStatus.lastError = result.error;
      return result;
    }
    var layers = (style && style.layers) || [];

    // Check if layer already exists
    var alreadyPresent = false;
    for (var li = 0; li < layers.length; li++) {
      if (layers[li].id === WOS_HOST_BUILDING_LAYER_ID) { alreadyPresent = true; break; }
    }

    if (alreadyPresent) {
      result.ok = true; result.layerAlreadyPresent = true;
      // Re-read source from existing layer
      for (var lj = 0; lj < layers.length; lj++) {
        if (layers[lj].id === WOS_HOST_BUILDING_LAYER_ID) {
          result.sourceId    = layers[lj].source           || null;
          result.sourceLayer = layers[lj]['source-layer']  || null;
          result.sourceOrigin = 'host';
        }
      }
    } else {
      // Resolve source
      var srcInfo = _discoverHostSource(map);
      if (!srcInfo.ok) {
        result.error = srcInfo.error || 'source discovery failed';
        _hostBuildingLayerStatus.enabled   = false;
        _hostBuildingLayerStatus.lastError = result.error;
        return result;
      }
      result.sourceId     = srcInfo.sourceId;
      result.sourceLayer  = srcInfo.sourceLayer;
      result.sourceOrigin = srcInfo.sourceOrigin;

      // Add source to host if it came from import data
      if (srcInfo.sourceOrigin === 'import-data') {
        var curSources = {};
        try { curSources = map.getStyle().sources || {}; } catch (e) {}
        if (!curSources[srcInfo.sourceId]) {
          try {
            map.addSource(srcInfo.sourceId, srcInfo.sourceDefinition);
            result.sourceAdded = true;
            console.log('[BuildingEditProjectionRuntime] _ensureHostBuildingLayer: added source "' + srcInfo.sourceId + '" from import data');
          } catch (e) {
            result.error = 'addSource("' + srcInfo.sourceId + '") failed: ' + String(e && e.message || e);
            _hostBuildingLayerStatus.lastError = result.error;
            return result;
          }
        }
      }

      // Find insertion point: just below the first wos-replacement-* or wos-preview-* layer
      var insertBefore = null;
      var latestLayers = [];
      try { latestLayers = map.getStyle().layers || []; } catch (e) { latestLayers = layers; }
      for (var lli = 0; lli < latestLayers.length; lli++) {
        var llid = latestLayers[lli].id || '';
        if (llid.indexOf('wos-replacement') === 0 || llid.indexOf('wos-preview') === 0) {
          insertBefore = llid; break;
        }
      }

      // Build layer definition per spec §5
      var layerDef = {
        id:             WOS_HOST_BUILDING_LAYER_ID,
        type:           'fill-extrusion',
        source:         srcInfo.sourceId,
        'source-layer': srcInfo.sourceLayer,
        minzoom:        13,
        paint: {
          'fill-extrusion-color':   '#d8dee8',
          'fill-extrusion-height':  ['interpolate', ['linear'], ['zoom'], 13, 0, 13.5, ['get', 'height']],
          'fill-extrusion-base':    ['case', ['has', 'min_height'], ['get', 'min_height'], 0],
          'fill-extrusion-opacity': 1,
        },
      };

      try {
        if (insertBefore) { map.addLayer(layerDef, insertBefore); }
        else               { map.addLayer(layerDef); }
        result.layerAdded = true;
        result.ok         = true;
        console.log('[BuildingEditProjectionRuntime] _ensureHostBuildingLayer: added',
          WOS_HOST_BUILDING_LAYER_ID, 'source=' + srcInfo.sourceId + ':' + srcInfo.sourceLayer,
          '| insertBefore:', insertBefore || '(top)');
      } catch (e) {
        result.error = 'addLayer failed: ' + String(e && e.message || e);
        _hostBuildingLayerStatus.lastError = result.error;
        console.warn('[BuildingEditProjectionRuntime] _ensureHostBuildingLayer:', result.error);
        return result;
      }
    }

    // ── Attempt to suppress imported Standard building layers (best-effort) ────
    // Per spec §6: try in priority order; do not fail if these don't work.
    var importStyle = null;
    try { importStyle = map.getStyle(); } catch (e) {}
    var styleImports = (importStyle && Array.isArray(importStyle.imports)) ? importStyle.imports : [];
    var impSuppAttempted = false;
    var impSuppStrategy  = 'none';

    if (styleImports.length) {
      var flatLayerIds = [];
      try { (map.getStyle().layers || []).forEach(function (l) { flatLayerIds.push(l.id); }); } catch (e) {}

      // Try 1: setLayoutProperty on any imported building layer IDs that appear in host flat list
      styleImports.forEach(function (imp) {
        if (!imp.data || !Array.isArray(imp.data.layers)) return;
        imp.data.layers.forEach(function (il) {
          var iltype = (il.type || '').toLowerCase();
          var ilsl   = ((il['source-layer']) || '').toLowerCase();
          var ilid   = (il.id || '').toLowerCase();
          var isBldg = iltype === 'fill-extrusion' || iltype === 'model' ||
                       /building/.test(ilsl) || /building/.test(ilid);
          if (!isBldg) return;
          if (flatLayerIds.indexOf(il.id) !== -1) {
            try {
              map.setLayoutProperty(il.id, 'visibility', 'none');
              impSuppAttempted = true;
              impSuppStrategy  = 'layout-visibility';
              console.log('[BuildingEditProjectionRuntime] _ensureHostBuildingLayer: tried setLayoutProperty("' + il.id + '","visibility","none")');
            } catch (e) {}
          }
        });
      });

      // Try 2: setConfigProperty with building keys for each import
      if (typeof map.setConfigProperty === 'function') {
        styleImports.forEach(function (imp) {
          if (!imp.id) return;
          ['show3dBuildings', 'show3dFacades', 'show3dObjects'].forEach(function (ck) {
            try { map.setConfigProperty(imp.id, ck, false); } catch (e) {}
          });
          if (!impSuppAttempted) { impSuppAttempted = true; impSuppStrategy = 'config-property'; }
        });
      }

      if (!impSuppAttempted) {
        console.log('[BuildingEditProjectionRuntime] _ensureHostBuildingLayer: imported building suppression — no reachable import layer found; accepting contamination and reporting');
      }
    }

    result.importBldgSuppAttempted = impSuppAttempted;
    result.importBldgSuppStrategy  = impSuppStrategy;

    // Update module-level status
    _hostBuildingLayerStatus.enabled               = result.ok;
    _hostBuildingLayerStatus.sourceId              = result.sourceId;
    _hostBuildingLayerStatus.sourceLayer           = result.sourceLayer;
    _hostBuildingLayerStatus.sourceOrigin          = result.sourceOrigin;
    _hostBuildingLayerStatus.layerPresent          = result.ok;
    _hostBuildingLayerStatus.layerAdded            = result.layerAdded;
    _hostBuildingLayerStatus.sourceAdded           = result.sourceAdded;
    _hostBuildingLayerStatus.importBldgSuppAttempted = impSuppAttempted;
    _hostBuildingLayerStatus.importBldgSuppStrategy  = impSuppStrategy;
    _hostBuildingLayerStatus.lastError             = result.error;

    return result;
  }

  // _queryHostBuildingFeatureCount — queries only wos-host-buildings-3d at the screen
  // centre. Returns feature count (> 0 proves the layer is queryable and receiving tile data).
  // Returns -1 on any error.
  function _queryHostBuildingFeatureCount(map) {
    if (!map) return -1;
    try {
      var canvas = map.getCanvas();
      var cw = canvas.clientWidth  || canvas.width  || 800;
      var ch = canvas.clientHeight || canvas.height || 600;
      var feats = map.queryRenderedFeatures(
        [[cw / 2 - 100, ch / 2 - 100], [cw / 2 + 100, ch / 2 + 100]],
        { layers: [WOS_HOST_BUILDING_LAYER_ID] }
      ) || [];
      return feats.length;
    } catch (e) { return -1; }
  }

  // _ensureReplacementAboveHostLayer — safety net to guarantee wos-replacement-*
  // layers sit above wos-host-buildings-3d in the draw order.  In normal flow
  // _ensureHostBuildingLayer inserts below wos-replacement-*, so this is only
  // needed if layer order was externally disturbed.
  function _ensureReplacementAboveHostLayer(map) {
    if (!map) return;
    try {
      var layers  = map.getStyle().layers || [];
      var hostIdx = -1;
      var firstReplacementIdx = -1;
      for (var i = 0; i < layers.length; i++) {
        if (layers[i].id === WOS_HOST_BUILDING_LAYER_ID) hostIdx = i;
        if ((layers[i].id || '').indexOf('wos-replacement') === 0 && firstReplacementIdx === -1) {
          firstReplacementIdx = i;
        }
      }
      if (hostIdx === -1 || firstReplacementIdx === -1) return; // nothing to fix
      if (firstReplacementIdx > hostIdx) return;                // already correct
      // Order is inverted — log a warning. Repositioning would require moveLayer which
      // can disturb Mapbox Standard imported layer compositing; leave for a follow-up patch.
      console.warn('[BuildingEditProjectionRuntime] _ensureReplacementAboveHostLayer: ' +
        'wos-replacement layer (' + firstReplacementIdx + ') is below wos-host-buildings-3d (' + hostIdx + '). ' +
        'Call apply() to re-establish correct order.');
    } catch (e) {}
  }

  // ── Suppression ID collection (0610F) ────────────────────────────────────────

  // _collectReplacementSuppressionIds — walks the manifest and returns every
  // building numeric ID that should be suppressed, grouped by sourceLayer.
  // Suppression candidates: hidden === true OR replacement.enabled === true.
  // 0610J: also includes all members of enabled groups.
  // Returns: { [sourceLayer]: numericId[] }
  function _collectReplacementSuppressionIds(manifest) {
    var result = {};
    if (!manifest || typeof manifest.buildings !== 'object') return result;
    var buildings = manifest.buildings;

    // Individual buildings
    var keys = Object.keys(buildings);
    for (var i = 0; i < keys.length; i++) {
      var key  = keys[i];
      var edit = buildings[key];
      if (!edit) continue;
      var doSuppress = edit.hidden || (edit.replacement && edit.replacement.enabled);
      if (!doSuppress) continue;
      var firstColon  = key.indexOf(':');
      var secondColon = key.indexOf(':', firstColon + 1);
      if (firstColon === -1 || secondColon === -1) continue;
      var sl    = key.slice(firstColon + 1, secondColon);
      var numId = Number(key.slice(secondColon + 1));
      if (isNaN(numId)) continue;
      if (!result[sl]) result[sl] = [];
      if (result[sl].indexOf(numId) === -1) result[sl].push(numId);
    }

    // 0610J: group members — suppress regardless of individual replacement settings
    var groups = (manifest.groups && typeof manifest.groups === 'object') ? manifest.groups : {};
    var groupIds = Object.keys(groups);
    for (var gi = 0; gi < groupIds.length; gi++) {
      var group = groups[groupIds[gi]];
      if (!group || !group.replacement || !group.replacement.enabled) continue;
      if (!Array.isArray(group.members)) continue;
      for (var mi = 0; mi < group.members.length; mi++) {
        var mk  = group.members[mi];
        var fc  = mk.indexOf(':');
        var sc  = mk.indexOf(':', fc + 1);
        if (fc === -1 || sc === -1) continue;
        var mSl    = mk.slice(fc + 1, sc);
        var mNumId = Number(mk.slice(sc + 1));
        if (isNaN(mNumId)) continue;
        if (!result[mSl]) result[mSl] = [];
        if (result[mSl].indexOf(mNumId) === -1) result[mSl].push(mNumId);
      }
    }

    // 0610K: compound members — direct building keys + group→building expansion
    var compounds = (manifest.compounds && typeof manifest.compounds === 'object') ? manifest.compounds : {};
    var compoundIds = Object.keys(compounds);
    for (var ci = 0; ci < compoundIds.length; ci++) {
      var compound = compounds[compoundIds[ci]];
      if (!compound || !compound.replacement || !compound.replacement.enabled) continue;
      if (!Array.isArray(compound.members)) continue;
      for (var cmi = 0; cmi < compound.members.length; cmi++) {
        var cmk = compound.members[cmi];
        if (!cmk) continue;
        if (cmk.indexOf('group_') === 0) {
          // Expand group members
          var cgrp = groups[cmk];
          if (!cgrp || !Array.isArray(cgrp.members)) continue;
          for (var cgmi = 0; cgmi < cgrp.members.length; cgmi++) {
            var cgmk = cgrp.members[cgmi];
            var cgfc = cgmk.indexOf(':');
            var cgsc = cgmk.indexOf(':', cgfc + 1);
            if (cgfc === -1 || cgsc === -1) continue;
            var cgmSl    = cgmk.slice(cgfc + 1, cgsc);
            var cgmNumId = Number(cgmk.slice(cgsc + 1));
            if (isNaN(cgmNumId)) continue;
            if (!result[cgmSl]) result[cgmSl] = [];
            if (result[cgmSl].indexOf(cgmNumId) === -1) result[cgmSl].push(cgmNumId);
          }
        } else {
          var cmfc = cmk.indexOf(':');
          var cmsc = cmk.indexOf(':', cmfc + 1);
          if (cmfc === -1 || cmsc === -1) continue;
          var cmSl    = cmk.slice(cmfc + 1, cmsc);
          var cmNumId = Number(cmk.slice(cmsc + 1));
          if (isNaN(cmNumId)) continue;
          if (!result[cmSl]) result[cmSl] = [];
          if (result[cmSl].indexOf(cmNumId) === -1) result[cmSl].push(cmNumId);
        }
      }
    }

    return result;
  }

  // ── Style reload handler ──────────────────────────────────────────────────────

  var _styleReadyGuard = false;
  var _styleReadyTimer = null;

  function _onStyleReady() {
    if (_styleReadyGuard) return;
    _styleReadyGuard = true;
    if (_styleReadyTimer) clearTimeout(_styleReadyTimer);
    _styleReadyTimer = setTimeout(function () {
      _styleReadyGuard = false;
      _styleReadyTimer = null;
    }, 1000);

    var map = _getMap();
    if (!map) return;

    // 0611Q: ensure WOS host building layer exists before discovery/apply
    _ensureHostBuildingLayer(map);
    _discoverLayers(map);
    if (_state.editCount > 0) _apply(map);
    _ensureReplacementAboveHostLayer(map);
  }

  // ── Map event wiring ──────────────────────────────────────────────────────────

  function _attachMapListeners(map) {
    if (_mapListenersAttached || !map || typeof map.on !== 'function') return;
    map.on('load', _onStyleReady);
    map.on('styledata', function () {
      var loaded = false;
      try { loaded = !!map.isStyleLoaded(); } catch (e) {}
      if (loaded) _onStyleReady();
    });
    _mapListenersAttached = true;
  }

  // ── Initialization ────────────────────────────────────────────────────────────

  function init() {
    if (_initialized) return;

    var ok = _loadManifest();
    if (!ok) {
      _initialized = true;
      console.warn('[BuildingEditProjectionRuntime] init: manifest load failed — projection disabled');
      return;
    }

    var mvr = global.SBE && SBE.MapboxViewportRuntime;
    if (!mvr) {
      console.warn('[BuildingEditProjectionRuntime] init: MapboxViewportRuntime not available — retrying in 500ms');
      setTimeout(init, 500);
      return;
    }

    _initialized = true;

    // 0610F: re-apply suppression on cross-tab manifest writes from Studio
    try {
      global.addEventListener('storage', function (e) {
        if (!e || e.key !== STORAGE_KEY) return;
        var m = _getMap();
        if (!m) return;
        var ok = _loadManifest();
        if (!ok) return;
        _ensureHostBuildingLayer(m);   // 0611Q
        _discoverLayers(m);
        _apply(m);
        _ensureReplacementAboveHostLayer(m);  // 0611Q
      });
    } catch (e) {}

    var map = mvr.getMap();

    if (typeof mvr.onStyleLoad === 'function') {
      mvr.onStyleLoad(function () {
        var m = mvr.getMap();
        if (m) {
          if (!_mapListenersAttached) _attachMapListeners(m);
          _onStyleReady();
        }
      });
    }

    if (map) {
      _attachMapListeners(map);
      var alreadyLoaded = false;
      try { alreadyLoaded = !!map.isStyleLoaded(); } catch (e) {}
      if (alreadyLoaded) _onStyleReady();
    } else if (typeof mvr.onReady === 'function') {
      mvr.onReady(function () {
        var m = mvr.getMap();
        if (m) {
          _attachMapListeners(m);
          _onStyleReady();
        }
      });
    }

    console.log('[BuildingEditProjectionRuntime] v' + VERSION + ' initialized —',
      _state.editCount, 'edit(s) in manifest');
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  function reload() {
    var ok = _loadManifest();
    if (!ok) {
      console.warn('[BuildingEditProjectionRuntime] reload: manifest load failed');
      return _statusSnapshot();
    }
    var map = _getMap();
    if (map) {
      _ensureHostBuildingLayer(map);          // 0611Q
      _discoverLayers(map);
      _apply(map);
      _ensureReplacementAboveHostLayer(map);  // 0611Q
      // 0611R: warn if true per-building suppression is not available
      var _reloadAuthority = buildingAuthorityStatus();
      if (!_reloadAuthority.truePerBuildingSuppressionAvailable && _reloadAuthority.warning) {
        console.warn('[BuildingEditProjectionRuntime] building authority warning:', _reloadAuthority.warning);
      }
    } else {
      console.warn('[BuildingEditProjectionRuntime] reload: map not available');
    }
    return _statusSnapshot();
  }

  function apply() {
    var map = _getMap();
    if (!map) { console.warn('[BuildingEditProjectionRuntime] apply: map not available'); return _statusSnapshot(); }
    if (!_manifest) { console.warn('[BuildingEditProjectionRuntime] apply: manifest not loaded'); return _statusSnapshot(); }
    _ensureHostBuildingLayer(map);          // 0611Q
    _discoverLayers(map);
    _apply(map);
    _ensureReplacementAboveHostLayer(map);  // 0611Q
    // 0611R: warn if true per-building suppression is not available
    var _applyAuthority = buildingAuthorityStatus();
    if (!_applyAuthority.truePerBuildingSuppressionAvailable && _applyAuthority.warning) {
      console.warn('[BuildingEditProjectionRuntime] building authority warning:', _applyAuthority.warning);
    }
    return _statusSnapshot();
  }

  function clearProjection() {
    var map = _getMap();
    if (!map) { console.warn('[BuildingEditProjectionRuntime] clearProjection: map not available'); return false; }
    _clearPaintOverrides(map);
    _state.projectedColorCount         = 0;
    _state.hiddenCount                 = 0;
    _state.replacementCount            = 0;
    _state.replacementArchetypes       = {};
    _state.replacementSuppressionCount = 0;
    _state.suppressionStrategy         = 'none';
    _state.suppressionLayerCount       = 0;
    _state.suppressionFallbackCount    = 0;
    _state.suppressionIdCount          = 0;
    _state.footprintSuppressionCount   = 0;
    _suppressionLayerStatus            = [];
    _lastSuppressionBySL               = {};
    _lastFinalLiveQueryIds             = {};   // 0611J
    _lastFinalLiveQueryCount           = 0;    // 0611J
    _state.lastAppliedAt               = null;
    console.log('[BuildingEditProjectionRuntime] projection cleared — original paint restored');
    return true;
  }

  function _statusSnapshot() {
    return {
      loaded:                      _state.loaded,
      editCount:                   _state.editCount,
      projectedColorCount:         _state.projectedColorCount,
      hiddenCount:                 _state.hiddenCount,
      replacementCount:            _state.replacementCount,
      replacementArchetypes:       _state.replacementArchetypes,
      buildingLayerCount:          _state.buildingLayerCount,
      layerIds:                    _state.layerIds.slice(),
      lastAppliedAt:               _state.lastAppliedAt,
      lastError:                   _state.lastError,
      // 0610B suppression diagnostics
      replacementSuppressionCount: _state.replacementSuppressionCount,
      suppressionStrategy:         _state.suppressionStrategy,
      suppressionLayerCount:       _state.suppressionLayerCount,
      suppressionFallbackCount:    _state.suppressionFallbackCount,
      // 0610I footprint expansion diagnostics
      suppressionIdCount:          _state.suppressionIdCount,
      footprintSuppressionCount:   _state.footprintSuppressionCount,
      // 0610M source-hide diagnostics
      hiddenOnlyCount:             _state.hiddenOnlyCount,
      sourceHiddenCount:           _state.hiddenOnlyCount,  // alias for clarity
    };
  }

  function status() {
    var snap = _statusSnapshot();
    console.log('[BuildingEditProjectionRuntime] status:', JSON.stringify(snap, null, 2));
    return snap;
  }

  function suppressionStatus() {
    var snap = {
      layers: _suppressionLayerStatus.map(function (s) {
        return {
          id:             s.id,
          type:           s.type,
          strategy:       s.strategy,
          suppressedCount: s.suppressedCount,
          fallback:        s.fallback,
        };
      }),
    };
    console.log('[BuildingEditProjectionRuntime] suppressionStatus:', JSON.stringify(snap, null, 2));
    return snap;
  }

  // unsuppressedSourceBuildings (0610I) — re-queries each replacement footprint and
  // returns any rendered source features whose ID is NOT in the last suppression set.
  // Shape: [{ replacementKey, candidateId, slKey, layerId, sourceLayer, reason, suppressed }]
  // Returns [] when suppression is complete.
  function unsuppressedSourceBuildings() {
    var map = _getMap();
    if (!map || !_manifest) return [];

    var buildings     = _manifest.buildings;
    var queryLayerIds = _layers.map(function (l) { return l.id; });
    var result        = [];

    var keys = Object.keys(buildings);
    for (var i = 0; i < keys.length; i++) {
      var key  = keys[i];
      var edit = buildings[key];
      if (!edit || !edit.replacement || !edit.replacement.enabled) continue;
      var g = edit.geometry;
      if (!g || !g.centroid ||
          typeof g.centroid.lng !== 'number' ||
          typeof g.centroid.lat !== 'number') continue;
      var wM = typeof g.widthM === 'number' ? g.widthM : 0;
      var dM = typeof g.depthM === 'number' ? g.depthM : 0;
      if (wM < 4 || dM < 4) continue;

      try {
        var queried = _queryFootprintFeatureIds(map, {
          centroid: g.centroid, widthM: wM, depthM: dM,
        }, queryLayerIds);

        var qks = Object.keys(queried);
        for (var qi = 0; qi < qks.length; qi++) {
          var slKey      = qks[qi];
          var suppForSL  = _lastSuppressionBySL[slKey] || [];
          var parts      = slKey.split(':');
          var sl         = parts.length > 1 ? parts[1] : slKey;
          var candidates = queried[slKey];
          for (var ci = 0; ci < candidates.length; ci++) {
            var cId         = candidates[ci];
            var isSuppressed = suppForSL.indexOf(cId) !== -1;
            result.push({
              replacementKey: key,
              candidateId:    cId,
              slKey:          slKey,
              layerId:        null,
              sourceLayer:    sl,
              reason:         'bbox-query',
              suppressed:     isSuppressed,
            });
          }
        }
      } catch (e) {}
    }

    var unsuppCount = result.filter(function (r) { return !r.suppressed; }).length;
    console.log('[BuildingEditProjectionRuntime] unsuppressedSourceBuildings: ' +
      unsuppCount + ' unsuppressed / ' + result.length + ' total candidate(s)');
    return result;
  }

  // compoundSuppressionStatus() — 0610K debug: returns compound suppression diagnostics.
  function compoundSuppressionStatus() {
    var snap = {
      compoundCount:                     _compoundSuppressionState.compoundCount,
      compoundSuppressionIdCount:        _compoundSuppressionState.compoundSuppressionIdCount,
      compoundFootprintSuppressionCount: _compoundSuppressionState.compoundFootprintSuppressionCount,
      suppressedCompoundIds:             _compoundSuppressionState.suppressedCompoundIds.slice(),
      lastError:                         _compoundSuppressionState.lastError,
    };
    console.log('[BuildingEditProjectionRuntime] compoundSuppressionStatus:', JSON.stringify(snap, null, 2));
    return snap;
  }

  // getSuppressionIds() — returns all numeric IDs that should be suppressed,
  // grouped by sourceLayer. Used by buildingReplacementRuntime dominanceStatus()
  // to identify which replacement actors have confirmed source suppression.
  // Does NOT trigger any map operations.
  function getSuppressionIds() {
    return _collectReplacementSuppressionIds(_manifest);
  }

  // styleParityStatus (0610N) — returns a parity audit snapshot for the Wall
  // projection runtime. Reports whether it correctly restores original paint,
  // never touches non-building or wos-replacement-* layers, and tracks suppression state.
  function styleParityStatus() {
    var snap = {
      version:                     VERSION,
      baseStyleAuthority:          'mapbox-studio',
      loaded:                      _state.loaded,
      editCount:                   _state.editCount,
      buildingLayerCount:          _state.buildingLayerCount,
      layerIds:                    _state.layerIds.slice(),
      suppressionActive:           _state.replacementSuppressionCount > 0,
      suppressionLayerCount:       _state.suppressionLayerCount,
      suppressionIdCount:          _state.suppressionIdCount,
      footprintSuppressionCount:   _state.footprintSuppressionCount,
      hiddenOnlyCount:             _state.hiddenOnlyCount,
      sourceHiddenCount:           _state.hiddenOnlyCount,
      replacementCount:            _state.replacementCount,
      hiddenCount:                 _state.hiddenCount,
      suppressionStrategy:         _state.suppressionStrategy,
      // Restore audit: _clearPaintOverrides uses originalColor/originalOpacity/originalHeight/
      // originalBase from _discoverLayers() which captures them at style-load time.
      originalPaintCaptured:        _state.buildingLayerCount > 0,
      wosReplacementLayersExcluded: true, // _discoverLayers skips 'wos-replacement*'
      nonBuildingLayersExcluded:    true,  // _discoverLayers only matches building types
      // 0611G: suppression method
      suppressionMethod:            _state.suppressionStrategy,
      sourcePaintMutationType:      _state.suppressionStrategy,
      lastAppliedAt:                _state.lastAppliedAt,
      parityOk:                     _state.lastError === null,
      lastError:                    _state.lastError,
    };
    console.log('[BuildingEditProjectionRuntime] styleParityStatus:', JSON.stringify(snap, null, 2));
    return snap;
  }

  // ── verifySuppression — 0611H verification harness ───────────────────────────
  //
  // Read-only proof that source buildings are suppressed after 0611G.
  // Does NOT mutate map state.
  //
  // Call from Wall console:
  //   _wos.debug.buildingEdits.verifySuppression()
  //   SBE.BuildingEditProjectionRuntime.verifySuppression()
  //
  // Classifications (same as verifyPreviewSuppression):
  //   A — No suppression expression (height/base not a match expr after suppression)
  //   B — Expression present, registered IDs missing from match arms
  //   C — Expression present and IDs correct, but extra rendered tile IDs remain
  //   D — All rendered source features appear suppressed (success)
  //   E — Replacement layer dominance issue
  function verifySuppression() {
    var map = _getMap();
    // 0611K: snapshot discovery state for the report
    var candidateRenderableLayers = _discoveryCandidates.map(function (c) {
      return {
        id:          c.id,
        type:        c.type,
        source:      c.source,
        sourceLayer: c.sourceLayer,
        paintKeys:   c.paintKeys,
        accepted:    c.accepted,
        isModel:     c.isModel,
        reason:      c.reason,
      };
    });
    var modelLayerCount = _modelLayers.length;
    var hasModelLayers  = modelLayerCount > 0;

    var report = {
      timestamp:              new Date().toISOString(),
      version:                VERSION,
      suppressionMethod:      _state.suppressionStrategy,
      editCount:              _state.editCount,
      // 0611K: layer discovery detail
      discoveredRenderableLayerCount: _state.buildingLayerCount,
      discoveredModelLayerCount:      modelLayerCount,
      hasModelLayerLimitation:        hasModelLayers,
      candidateRenderableLayers:      candidateRenderableLayers,
      buildingLayerCount:             _state.buildingLayerCount,
      // 0611J: Phase 4 live query stats
      finalLiveQueryCount:    _lastFinalLiveQueryCount,
      finalLiveQueryIds:      Object.keys(_lastFinalLiveQueryIds),
      layers:                 [],
      footprintChecks:        [],
      summary: {
        totalSuppressedLayers:   _state.suppressionLayerCount,
        totalUnsuppressedIds:    0,
        remainingUnsuppressedIds: [],   // 0611J
        allSuppressed:           false,
        classificationCode:      null,
        classification:          null,
      },
    };

    if (!map) {
      report.summary.classification     = 'ERROR: map not available';
      report.summary.classificationCode = 'ERROR';
      console.log('[BuildingEditProjectionRuntime] verifySuppression:', JSON.stringify(report, null, 2));
      return report;
    }

    // 0611K: if only model layers were found, suppression cannot work — report immediately
    if (_state.buildingLayerCount === 0 && hasModelLayers) {
      report.summary.classificationCode = 'MODEL_LAYER_LIMITATION';
      report.summary.classification     = 'MODEL_LAYER_LIMITATION — Mapbox Standard "model" layers detected (' +
        modelLayerCount + '): ' + _modelLayers.map(function (m) { return m.id; }).join(', ') +
        '. fill-extrusion-height/base suppression cannot be applied to model layers. ' +
        'A different suppression strategy is required for Mapbox Standard v3 styles.';
      report.summary.allSuppressed = false;
      console.warn('[BuildingEditProjectionRuntime] verifySuppression:', report.summary.classification);
      console.log('[BuildingEditProjectionRuntime] verifySuppression FULL REPORT:');
      console.log(JSON.stringify(report, null, 2));
      return report;
    }

    // ── 1. Paint readback per building layer ───────────────────────────────
    for (var li = 0; li < _layers.length; li++) {
      var layer = _layers[li];
      var lKey  = (layer.source || '') + ':' + (layer.sourceLayer || '');
      var suppIds = (_lastSuppressionBySL[lKey] || []).slice();
      var entry = {
        layerId:              layer.id,
        layerType:            layer.type,
        slKey:                lKey,
        suppressedIds:        suppIds,
        suppressedIdCount:    suppIds.length,
        currentHeight:        null,
        currentBase:          null,
        currentOpacity:       null,
        heightIsMatchExpr:    false,
        heightMatchIds:       [],
        heightFallback:       null,
        missingFromExpr:      [],
        baseIsMatchExpr:      false,
        classificationCode:   null,
        classification:       null,
        readErrors:           [],
      };

      if (layer.type === 'fill-extrusion') {
        try { entry.currentHeight  = map.getPaintProperty(layer.id, 'fill-extrusion-height'); }  catch (e) { entry.readErrors.push('height: '  + String(e.message || e)); }
        try { entry.currentBase    = map.getPaintProperty(layer.id, 'fill-extrusion-base'); }    catch (e) { entry.readErrors.push('base: '    + String(e.message || e)); }
        try { entry.currentOpacity = map.getPaintProperty(layer.id, 'fill-extrusion-opacity'); } catch (e) {}

        if (Array.isArray(entry.currentHeight) && entry.currentHeight[0] === 'match') {
          entry.heightIsMatchExpr = true;
          entry.heightFallback    = entry.currentHeight[entry.currentHeight.length - 1];
          for (var hi = 2; hi < entry.currentHeight.length - 1; hi += 2) {
            entry.heightMatchIds.push(entry.currentHeight[hi]);
          }
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

        if (suppIds.length === 0) {
          entry.classificationCode = 'D';
          entry.classification     = 'D — No suppressions active on this layer';
        } else if (!entry.heightIsMatchExpr) {
          entry.classificationCode = 'A';
          entry.classification     = 'A — fill-extrusion-height is NOT a match expression — suppression did not apply';
        } else if (entry.missingFromExpr.length > 0) {
          entry.classificationCode = 'B';
          entry.classification     = 'B — Height match expression present, but ' + entry.missingFromExpr.length + ' suppressed ID(s) missing from match arms: ' + JSON.stringify(entry.missingFromExpr);
        } else {
          entry.classificationCode = 'D';
          entry.classification     = 'D — Height match expression contains all suppressed IDs (footprint query may refine to C)';
        }
      } else {
        try { entry.currentOpacity = map.getPaintProperty(layer.id, layer.opacityProp || 'fill-opacity'); } catch (e) { entry.readErrors.push('opacity: ' + String(e.message || e)); }
        if (suppIds.length === 0) {
          entry.classificationCode = 'D';
          entry.classification     = 'D — No suppressions active on this layer';
        } else {
          var opIsMatch = Array.isArray(entry.currentOpacity) && entry.currentOpacity[0] === 'match';
          entry.classificationCode = opIsMatch ? 'D' : 'A';
          entry.classification     = opIsMatch
            ? 'D — fill-opacity match expression present'
            : 'A — fill-opacity is NOT a match expression';
        }
      }

      report.layers.push(entry);
    }

    // ── 2. Footprint re-query for each suppression candidate ───────────────
    if (!_manifest) {
      report.summary.classification     = 'ERROR: manifest not loaded';
      report.summary.classificationCode = 'ERROR';
      console.log('[BuildingEditProjectionRuntime] verifySuppression:', JSON.stringify(report, null, 2));
      return report;
    }

    var buildings    = _manifest.buildings || {};
    var groups       = _manifest.groups    || {};
    var compounds    = _manifest.compounds || {};
    var queryLayerIds = _layers.map(function (l) { return l.id; });

    // Collect all building keys that should be suppressed
    var shouldCheckKeys = {};
    Object.keys(buildings).forEach(function (bKey) {
      var edit = buildings[bKey];
      if (edit && (edit.hidden || (edit.replacement && edit.replacement.enabled))) {
        shouldCheckKeys[bKey] = { reason: edit.hidden ? 'hidden' : 'replacement', edit: edit };
      }
    });
    Object.keys(groups).forEach(function (gid) {
      var g = groups[gid];
      if (!g || !g.replacement || !g.replacement.enabled) return;
      if (!Array.isArray(g.members)) return;
      g.members.forEach(function (mk) {
        if (!shouldCheckKeys[mk]) {
          shouldCheckKeys[mk] = { reason: 'group-member', edit: buildings[mk] || null };
        }
      });
    });
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
              if (!shouldCheckKeys[mk]) shouldCheckKeys[mk] = { reason: 'compound-member', edit: buildings[mk] || null };
            });
          }
        } else {
          if (!shouldCheckKeys[m]) shouldCheckKeys[m] = { reason: 'compound-member', edit: buildings[m] || null };
        }
      });
    });

    var totalUnsuppressed = 0;

    Object.keys(shouldCheckKeys).forEach(function (bKey) {
      var info = shouldCheckKeys[bKey];
      var edit = info.edit;
      var g = edit && edit.geometry;
      var geom = null;
      if (g && g.centroid &&
          typeof g.centroid.lng === 'number' &&
          typeof g.centroid.lat === 'number' &&
          typeof g.widthM === 'number' && g.widthM >= 4 &&
          typeof g.depthM === 'number' && g.depthM >= 4) {
        geom = { centroid: g.centroid, widthM: g.widthM, depthM: g.depthM };
      }

      if (!geom) {
        report.footprintChecks.push({
          buildingKey:     bKey,
          reason:          info.reason,
          status:          'NO_GEOMETRY',
          unsuppressedIds: [],
          classificationCode: null,
          classification:  'No geometry stored — cannot verify footprint',
        });
        return;
      }

      try {
        // 0611J: use the same unrestricted composite/building query as Phase 4
        // so the verify harness sees the same feature universe as suppression.
        var vfAllIds = [];
        try {
          var vCosLat = Math.cos(geom.centroid.lat * Math.PI / 180) || 0.0001;
          var vHalfW  = (geom.widthM / 2) * 1.15;
          var vHalfD  = (geom.depthM / 2) * 1.15;
          var vDLng   = vHalfW / (111320 * vCosLat);
          var vDLat   = vHalfD / 111320;
          var vSw     = map.project([geom.centroid.lng - vDLng, geom.centroid.lat - vDLat]);
          var vNe     = map.project([geom.centroid.lng + vDLng, geom.centroid.lat + vDLat]);
          var vMinX = Math.min(vSw.x, vNe.x) - 4;
          var vMinY = Math.min(vSw.y, vNe.y) - 4;
          var vMaxX = Math.max(vSw.x, vNe.x) + 4;
          var vMaxY = Math.max(vSw.y, vNe.y) + 4;
          var vFeats = map.queryRenderedFeatures([[vMinX, vMinY], [vMaxX, vMaxY]]) || [];
          for (var vfi = 0; vfi < vFeats.length; vfi++) {
            var vF = vFeats[vfi];
            if (vF.id == null) continue;
            if (vF.source !== 'composite') continue;
            var vSl  = vF.sourceLayer || '';
            var vLid = (vF.layer && vF.layer.id) || '';
            if (!/building/i.test(vSl) && !/building/i.test(vLid)) continue;
            var vNumId = Number(vF.id);
            if (isNaN(vNumId)) continue;
            if (vfAllIds.indexOf(vNumId) === -1) vfAllIds.push(vNumId);
          }
        } catch (qe) {}

        var unsuppressed = vfAllIds.filter(function (fid) {
          return !Object.keys(_lastSuppressionBySL).some(function (slKey) {
            return (_lastSuppressionBySL[slKey] || []).indexOf(fid) !== -1;
          });
        });

        var code;
        if (vfAllIds.length === 0) {
          code = 'D';
        } else if (unsuppressed.length === 0) {
          code = 'D';
        } else {
          code = 'C';
          totalUnsuppressed += unsuppressed.length;
        }

        report.footprintChecks.push({
          buildingKey:       bKey,
          reason:            info.reason,
          renderedIdCount:   vfAllIds.length,
          renderedIds:       vfAllIds,
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
          reason:      info.reason,
          status:      'QUERY_ERROR',
          error:       String(e.message || e),
          unsuppressedIds: [],
        });
      }
    });

    // ── 3. Replacement layer dominance check ───────────────────────────────
    try {
      var style  = map.getStyle();
      var layers = (style && style.layers) || [];
      var replacementLayerIdx    = -1;
      var highestSrcBldgLayerIdx = -1;
      for (var dli = 0; dli < layers.length; dli++) {
        var lid = (layers[dli].id || '');
        if (lid.indexOf('wos-replacement') === 0) {
          if (dli > replacementLayerIdx) replacementLayerIdx = dli;
        } else if (layers[dli].type === 'fill-extrusion' || /building/.test(lid.toLowerCase())) {
          if (dli > highestSrcBldgLayerIdx) highestSrcBldgLayerIdx = dli;
        }
      }
      report.replacementLayerIndex    = replacementLayerIdx;
      report.highestSourceLayerIndex  = highestSrcBldgLayerIdx;
      report.replacementLayerDominant = replacementLayerIdx === -1 || replacementLayerIdx > highestSrcBldgLayerIdx;
      if (!report.replacementLayerDominant) {
        report.footprintChecks.push({
          buildingKey:        '__replacement_layer__',
          reason:             'dominance',
          classificationCode: 'E',
          classification:     'E — wos-replacement-* layer is not above all source building layers (idx ' + replacementLayerIdx + ' vs ' + highestSrcBldgLayerIdx + ')',
          unsuppressedIds:    [],
        });
      }
    } catch (e) {}

    // ── 4. Summary classification ────────────────────────────────────────────
    report.summary.totalUnsuppressedIds = totalUnsuppressed;
    // 0611J: collect all unsuppressed IDs across all footprint checks
    var remainingUnsuppressedIds = [];
    report.footprintChecks.forEach(function (fc) {
      (fc.unsuppressedIds || []).forEach(function (fid) {
        if (remainingUnsuppressedIds.indexOf(fid) === -1) remainingUnsuppressedIds.push(fid);
      });
    });
    report.summary.remainingUnsuppressedIds = remainingUnsuppressedIds;

    var allCodes = report.layers.map(function (l) { return l.classificationCode; })
      .concat(report.footprintChecks
        .filter(function (fc) { return fc.classificationCode; })
        .map(function (fc) { return fc.classificationCode; }));

    var worstCode = 'D';
    if (allCodes.indexOf('E') !== -1) worstCode = 'E';
    if (allCodes.indexOf('A') !== -1) worstCode = 'A';
    if (allCodes.indexOf('B') !== -1 && worstCode !== 'A') worstCode = 'B';
    if (allCodes.indexOf('C') !== -1 && worstCode === 'D') worstCode = 'C';

    var classMessages = {
      'A': 'A — No suppression expression on one or more layers',
      'B': 'B — Expression present but suppressed IDs missing from match arms',
      'C': 'C — Expression present and IDs correct, but extra rendered tile/part IDs remain',
      'D': 'D — All source building features appear suppressed ✓',
      'E': 'E — Replacement layer not dominant: renders below source building layer',
    };
    // 0611K: if model layers also present alongside suppressible layers, note the mixed state
    if (hasModelLayers && worstCode === 'D') {
      worstCode = 'MODEL_LAYER_LIMITATION';
      classMessages['MODEL_LAYER_LIMITATION'] =
        'MODEL_LAYER_LIMITATION — fill-extrusion layers suppressed ✓, but ' +
        modelLayerCount + ' model layer(s) also present: ' +
        _modelLayers.map(function (m) { return m.id; }).join(', ') +
        '. Model layers cannot be height-suppressed.';
    }
    report.summary.allSuppressed      = worstCode === 'D';
    report.summary.classificationCode = worstCode;
    report.summary.classification     = classMessages[worstCode] || worstCode;

    console.log('[BuildingEditProjectionRuntime] verifySuppression CLASSIFICATION:', worstCode, '—', report.summary.classification);
    if (totalUnsuppressed > 0) {
      console.warn('[BuildingEditProjectionRuntime] verifySuppression: ' + totalUnsuppressed + ' unsuppressed rendered ID(s) remain');
    }
    console.log('[BuildingEditProjectionRuntime] verifySuppression FULL REPORT:');
    console.log(JSON.stringify(report, null, 2));
    return report;
  }

  // ── auditWallBuildingRenderOwnership — 0611L diagnostic ──────────────────────
  //
  // Identifies exactly what is rendering the visible beige 3D buildings on Wall
  // when _discoverLayers() returns zero suppressible layers.
  //
  // Call from Wall console:
  //   auditWallBuildingRenderOwnership()
  //   _wos.debug.buildingEdits.auditWallBuildingRenderOwnership()
  //   SBE.BuildingEditProjectionRuntime.auditWallBuildingRenderOwnership()
  //
  // Probe points:
  //   1. queryRenderedFeatures at screen center — broadest sample
  //   2. queryRenderedFeatures at selected/hidden building footprint (if manifest has geometry)
  //   3. Full screen bbox sample (4 corners + center)
  //
  // Style inspection:
  //   map.getStyle().layers   — flat layer list
  //   map.getStyle().imports  — Mapbox Standard basemap import entries (if present)
  //
  // Classifications:
  //   STYLE_FILL_EXTRUSION  — fill-extrusion layer in style, renderable, missed by _discoverLayers
  //   STYLE_MODEL_LAYER     — model layer in style — Mapbox Standard Classic/Standard v3
  //   IMPORTED_BASEMAP_3D   — imports[] present, buildings likely in imported basemap fragment
  //   CUSTOM_RUNTIME_MESH   — no style layer, features present in query, likely Three.js mesh
  //   UNKNOWN_RENDER_PATH   — could not determine source
  function auditWallBuildingRenderOwnership() {
    var map    = _getMap();
    var report = {
      timestamp:              new Date().toISOString(),
      version:                VERSION,
      // ── A. Style layer audit ─────────────────────────────────────────────────
      styleLayerCount:        0,
      allFillExtrusionLayers: [],   // every fill-extrusion layer in style
      allModelLayers:         [],   // every model layer in style
      allBuildingNamedLayers: [],   // any layer whose id/source-layer contains "building"
      importsPresent:         false,
      imports:                [],   // map.getStyle().imports entries
      // ── B. queryRenderedFeatures audit ──────────────────────────────────────
      querySamples:           [],   // one entry per probe point
      allRenderedFeatures:    [],   // deduplicated across all probes
      // ── C. Discovery candidates (from last _discoverLayers run) ─────────────
      discoveryCandidates:    [],
      // ── D. Classification ────────────────────────────────────────────────────
      classificationCode:     null,
      classification:         null,
      actionableNextPatch:    null,
    };

    if (!map) {
      report.classificationCode = 'UNKNOWN_RENDER_PATH';
      report.classification     = 'UNKNOWN_RENDER_PATH — map not available';
      report.actionableNextPatch = 'Ensure map is initialized before calling this function';
      console.log('[auditWallBuildingRenderOwnership]', JSON.stringify(report, null, 2));
      return report;
    }

    // ── A. Style layer audit ───────────────────────────────────────────────────
    var style = null;
    try { style = map.getStyle(); } catch (e) {}
    var styleLayers = (style && style.layers) || [];
    report.styleLayerCount = styleLayers.length;

    // Collect imports (Mapbox Standard basemap)
    var styleImports = (style && style.imports) || [];
    if (Array.isArray(styleImports) && styleImports.length) {
      report.importsPresent = true;
      styleImports.forEach(function (imp) {
        report.imports.push({
          id:     imp.id     || null,
          url:    imp.url    || null,
          config: imp.config || null,
        });
      });
    } else {
      // Also check for the newer 'fragment' / 'basemap' key shape some Mapbox versions use
      try {
        var rawStyle = map.getStyle();
        ['fragment', 'schema', 'basemap', 'standardStyle'].forEach(function (k) {
          if (rawStyle && rawStyle[k]) {
            report.importsPresent = true;
            report.imports.push({ key: k, value: String(rawStyle[k]).slice(0, 200) });
          }
        });
      } catch (e) {}
    }

    for (var i = 0; i < styleLayers.length; i++) {
      var l    = styleLayers[i];
      var lid  = (l.id || '').toLowerCase();
      var sl   = (l['source-layer'] || '').toLowerCase();
      var ltype = l.type || '';
      var paintKeys  = l.paint  ? Object.keys(l.paint)  : [];
      var layoutKeys = l.layout ? Object.keys(l.layout) : [];
      var entry = {
        id:          l.id,
        type:        ltype,
        source:      l.source          || null,
        sourceLayer: l['source-layer'] || null,
        paintKeys:   paintKeys,
        layoutKeys:  layoutKeys,
        minzoom:     l.minzoom  != null ? l.minzoom  : null,
        maxzoom:     l.maxzoom  != null ? l.maxzoom  : null,
        visibility:  (l.layout && l.layout.visibility) || 'visible',
      };
      if (ltype === 'fill-extrusion') report.allFillExtrusionLayers.push(entry);
      if (ltype === 'model')          report.allModelLayers.push(entry);
      if (/building/.test(lid) || /building/.test(sl)) report.allBuildingNamedLayers.push(entry);
    }

    // ── B. queryRenderedFeatures at multiple probe points ─────────────────────
    var probePoints = [];

    // 1. Screen center
    try {
      var canvas  = map.getCanvas();
      var cw = canvas.clientWidth  || canvas.width  || 800;
      var ch = canvas.clientHeight || canvas.height || 600;
      probePoints.push({ label: 'screen-center', bbox: [[cw / 2 - 1, ch / 2 - 1], [cw / 2 + 1, ch / 2 + 1]] });
      probePoints.push({ label: 'screen-center-wide', bbox: [[cw / 2 - 100, ch / 2 - 100], [cw / 2 + 100, ch / 2 + 100]] });
      // Four corners
      probePoints.push({ label: 'top-left',     bbox: [[0,  0],  [80,  80]] });
      probePoints.push({ label: 'top-right',    bbox: [[cw - 80, 0],  [cw, 80]] });
      probePoints.push({ label: 'bottom-left',  bbox: [[0,  ch - 80], [80,  ch]] });
      probePoints.push({ label: 'bottom-right', bbox: [[cw - 80, ch - 80], [cw, ch]] });
    } catch (e) {}

    // 2. Hidden/replacement building footprint from manifest
    if (_manifest && _manifest.buildings) {
      var mKeys = Object.keys(_manifest.buildings);
      for (var mi = 0; mi < mKeys.length && probePoints.length < 10; mi++) {
        var medit = _manifest.buildings[mKeys[mi]];
        var mg = medit && medit.geometry;
        if (!mg || !mg.centroid ||
            typeof mg.centroid.lng !== 'number' ||
            typeof mg.centroid.lat !== 'number') continue;
        var doCheck = medit.hidden || (medit.replacement && medit.replacement.enabled);
        if (!doCheck) continue;
        try {
          var cosLat  = Math.cos(mg.centroid.lat * Math.PI / 180) || 0.0001;
          var halfW   = ((typeof mg.widthM  === 'number' ? mg.widthM  : 20) / 2) * 1.30;
          var halfD   = ((typeof mg.depthM  === 'number' ? mg.depthM  : 20) / 2) * 1.30;
          var dLng    = halfW / (111320 * cosLat);
          var dLat    = halfD / 111320;
          var sw = map.project([mg.centroid.lng - dLng, mg.centroid.lat - dLat]);
          var ne = map.project([mg.centroid.lng + dLng, mg.centroid.lat + dLat]);
          probePoints.push({
            label:  'manifest-footprint:' + mKeys[mi],
            bbox:   [[Math.min(sw.x, ne.x) - 8, Math.min(sw.y, ne.y) - 8],
                     [Math.max(sw.x, ne.x) + 8, Math.max(sw.y, ne.y) + 8]],
          });
        } catch (e) {}
        break; // one footprint is enough
      }
    }

    // Run queries — unrestricted (no layer filter) so we see everything Mapbox renders
    var seenFeatureKeys = {};  // layerId:featureId → true (dedup)

    probePoints.forEach(function (probe) {
      var features = [];
      var queryError = null;
      try {
        features = map.queryRenderedFeatures(probe.bbox) || [];
      } catch (e) {
        queryError = String(e.message || e);
      }

      var probeFeatures = [];
      features.forEach(function (f) {
        var fLayerId = (f.layer && f.layer.id)   || 'unknown';
        var fType    = (f.layer && f.layer.type) || 'unknown';
        var fSrc     = f.source      || 'unknown';
        var fSl      = f.sourceLayer || '';
        var fId      = f.id != null ? f.id : null;
        var dedupeKey = fLayerId + ':' + String(fId);

        var feat = {
          featureId:      fId,
          featureIdType:  typeof fId,
          source:         fSrc,
          sourceLayer:    fSl,
          layerId:        fLayerId,
          layerType:      fType,
          geometryType:   (f.geometry && f.geometry.type) || null,
          propertiesType: (f.properties && f.properties.type) || null,
          paintKeys:      (f.layer && f.layer.paint)  ? Object.keys(f.layer.paint)  : [],
          layoutKeys:     (f.layer && f.layer.layout) ? Object.keys(f.layer.layout) : [],
        };
        probeFeatures.push(feat);

        if (!seenFeatureKeys[dedupeKey]) {
          seenFeatureKeys[dedupeKey] = true;
          report.allRenderedFeatures.push(feat);
        }
      });

      report.querySamples.push({
        label:         probe.label,
        featureCount:  features.length,
        queryError:    queryError,
        features:      probeFeatures,
      });
    });

    // ── C. Discovery candidates from last _discoverLayers run ─────────────────
    report.discoveryCandidates = _discoveryCandidates.map(function (c) {
      return { id: c.id, type: c.type, source: c.source,
               sourceLayer: c.sourceLayer, accepted: c.accepted, reason: c.reason };
    });

    // ── D. Classify render ownership ──────────────────────────────────────────
    // Walk allRenderedFeatures and style layers to determine what owns the 3D buildings.

    var has3dFeatures      = false;
    var fillExtrusionSeen  = false;
    var modelSeen          = false;
    var importedBasemapSeen = false;
    var unknownLayerSeen   = false;
    var wosLayerSeen       = false;

    report.allRenderedFeatures.forEach(function (f) {
      var sl  = (f.sourceLayer || '').toLowerCase();
      var lid = (f.layerId || '').toLowerCase();
      var ltype = (f.layerType || '').toLowerCase();
      var isBuildingFeature = /building/.test(sl) || /building/.test(lid) ||
                              f.geometryType === 'Polygon' || f.geometryType === 'MultiPolygon';
      if (!isBuildingFeature) return;
      has3dFeatures = true;
      if (lid.indexOf('wos-') === 0)   { wosLayerSeen = true; return; }
      if (ltype === 'fill-extrusion')  { fillExtrusionSeen = true; }
      else if (ltype === 'model')      { modelSeen = true; }
      else if (f.source === 'unknown' || f.layerId === 'unknown') { unknownLayerSeen = true; }
    });

    // Check for imported basemap (Mapbox Standard slot system)
    if (report.importsPresent) importedBasemapSeen = true;
    if (report.allModelLayers.length > 0) modelSeen = true;

    // Determine classification with priority
    var code;
    var note;
    var nextPatch;

    if (!has3dFeatures && !fillExtrusionSeen && !modelSeen) {
      if (report.importsPresent) {
        code      = 'IMPORTED_BASEMAP_3D';
        note      = 'IMPORTED_BASEMAP_3D — map.getStyle().imports present (' +
          report.imports.length + ' import(s)). Buildings likely rendered by the Mapbox Standard ' +
          'imported basemap. queryRenderedFeatures may not return features from imported layers ' +
          'because Mapbox GL JS does not expose them to the query API.';
        nextPatch = '0611M_WOS_ImportedBasemapBuildingSuppressionStrategy — investigate ' +
          'map.setConfigProperty / map.setFeatureState on the imported basemap slot, or use ' +
          'map.setFilter on the Standard slot\'s building layer via the slot API.';
      } else {
        code      = 'CUSTOM_RUNTIME_MESH';
        note      = 'CUSTOM_RUNTIME_MESH — no building features returned by queryRenderedFeatures ' +
          'and no style layers match. Visible buildings may be Three.js/custom WebGL meshes ' +
          'rendered outside the Mapbox layer system.';
        nextPatch = '0611M_WOS_ThreeJsBuildingMeshSuppression — locate the Three.js scene node ' +
          'or custom layer that renders building geometry and hide/remove it for suppressed buildings.';
      }
    } else if (modelSeen && !fillExtrusionSeen) {
      code      = 'STYLE_MODEL_LAYER';
      note      = 'STYLE_MODEL_LAYER — Mapbox Standard "model" type layer(s) are rendering 3D buildings. ' +
        'Model layers: ' + report.allModelLayers.map(function (m) { return m.id; }).join(', ') + '. ' +
        'fill-extrusion-height/base suppression cannot be applied to model layers.';
      nextPatch = '0611M_WOS_ModelLayerBuildingSuppressionStrategy — use map.setFilter() or ' +
        'map.setPaintProperty("layer-id","model-opacity",[...]) if the model layer supports ' +
        'per-feature opacity; alternatively use map.setFeatureState + a filter expression ' +
        'on the model layer.';
    } else if (fillExtrusionSeen && !modelSeen) {
      code      = 'STYLE_FILL_EXTRUSION';
      note      = 'STYLE_FILL_EXTRUSION — fill-extrusion features rendered but _discoverLayers ' +
        'missed them. Layers found: ' +
        report.allRenderedFeatures
          .filter(function (f) { return f.layerType === 'fill-extrusion'; })
          .map(function (f) { return f.layerId; })
          .filter(function (v, i, a) { return a.indexOf(v) === i; })
          .join(', ') + '.';
      nextPatch = '0611N_WOS_FillExtrusionLayerDiscoveryFix — widen _discoverLayers acceptance ' +
        'criteria to include all fill-extrusion layers regardless of id/source-layer naming.';
    } else if (fillExtrusionSeen && modelSeen) {
      code      = 'STYLE_FILL_EXTRUSION';
      note      = 'STYLE_FILL_EXTRUSION + STYLE_MODEL_LAYER mix — both fill-extrusion and model ' +
        'layers present. fill-extrusion layers can be height-suppressed; model layers cannot.';
      nextPatch = '0611N_WOS_FillExtrusionLayerDiscoveryFix — ensure fill-extrusion layers are ' +
        'discovered, then handle the model layer separately.';
    } else if (report.importsPresent) {
      code      = 'IMPORTED_BASEMAP_3D';
      note      = 'IMPORTED_BASEMAP_3D — map.getStyle().imports present. Buildings likely in ' +
        'imported Mapbox Standard basemap. queryRenderedFeatures may not surface them.';
      nextPatch = '0611M_WOS_ImportedBasemapBuildingSuppressionStrategy — use the Mapbox Standard ' +
        'slot API or setConfigProperty to control building visibility in the imported basemap.';
    } else {
      code      = 'UNKNOWN_RENDER_PATH';
      note      = 'UNKNOWN_RENDER_PATH — visible buildings could not be attributed to any known ' +
        'Mapbox layer type. ' + report.allRenderedFeatures.length + ' rendered feature(s) found. ' +
        'Check whether buildings come from a custom Mapbox GL layer plugin or a WebGL overlay.';
      nextPatch = '0611M_WOS_UnknownRenderPathInvestigation — add map.on("render") listener and ' +
        'inspect gl.getParameter()/drawArrays calls, or enumerate map.__proto__ for custom layers.';
    }

    report.classificationCode  = code;
    report.classification      = note;
    report.actionableNextPatch = nextPatch;

    // ── Summary log ──────────────────────────────────────────────────────────
    console.log('[auditWallBuildingRenderOwnership] ══════════════════════════════════════');
    console.log('[auditWallBuildingRenderOwnership] CLASSIFICATION:', code);
    console.log('[auditWallBuildingRenderOwnership]', note);
    console.log('[auditWallBuildingRenderOwnership] NEXT PATCH:', nextPatch);
    console.log('[auditWallBuildingRenderOwnership] Style layers:', styleLayers.length,
      '| fill-extrusion:', report.allFillExtrusionLayers.length,
      '| model:', report.allModelLayers.length,
      '| building-named:', report.allBuildingNamedLayers.length,
      '| imports:', report.imports.length);
    console.log('[auditWallBuildingRenderOwnership] Rendered features (all probes, deduped):',
      report.allRenderedFeatures.length);
    if (report.allRenderedFeatures.length > 0) {
      var layerTypeSummary = {};
      report.allRenderedFeatures.forEach(function (f) {
        var k = (f.layerType || 'unknown') + ':' + (f.layerId || 'unknown');
        layerTypeSummary[k] = (layerTypeSummary[k] || 0) + 1;
      });
      console.log('[auditWallBuildingRenderOwnership] Rendered feature breakdown:', JSON.stringify(layerTypeSummary, null, 2));
    }
    console.log('[auditWallBuildingRenderOwnership] FULL REPORT:');
    console.log(JSON.stringify(report, null, 2));
    return report;
  }

  // ── auditMapboxStandardConfig — 0611M audit-only diagnostic ─────────────────
  //
  // Audits whether Mapbox Standard setConfigProperty/getConfigProperty API controls
  // the visible 3D buildings.  Reads current config, toggles each building-related
  // key to false (then restores it), measures before/after rendered-feature counts,
  // and classifies the result.
  //
  // Call from Wall console:
  //   auditMapboxStandardConfig()
  //   _wos.debug.buildingEdits.auditMapboxStandardConfig()
  //
  // NOTE: Toggles are synchronous — Mapbox GL repaints asynchronously.
  //       Rendered-feature counts are sampled immediately after each setConfigProperty
  //       call.  A count change in the same frame means the engine applied the toggle
  //       synchronously (rare).  getConfigProperty readback is always synchronous and
  //       is the primary signal for CONFIG_KEY_WORKS.
  //
  // Does NOT permanently change map or style state — every toggle is restored.
  //
  // Classifications:
  //   A. CONFIG_KEY_WORKS             — setConfigProperty + getConfigProperty round-trips
  //                                     and/or rendered geometry count drops on toggle
  //   B. CONFIG_KEY_IGNORED           — setConfigProperty writes, getConfigProperty echoes
  //                                     the new value, but geometry count is unchanged
  //   C. CONFIG_RESETS_ON_STYLE       — getConfigProperty value resets after setPaintProperty
  //                                     (not testable synchronously — flagged if restore
  //                                     readback differs from what was written)
  //   D. GEOMETRY_NOT_STANDARD_CONFIG — no imports present; buildings are not Standard config
  //   E. MAPBOX_STANDARD_IMPORT_LIMITATION — imports present but setConfigProperty/
  //                                     getConfigProperty APIs throw or return undefined
  function auditMapboxStandardConfig() {
    var map = _getMap();

    // ── Known Mapbox Standard config keys that affect 3D geometry ────────────
    var CONFIG_KEYS = [
      'show3dBuildings',
      'show3dFacades',
      'show3dObjects',
      'show3dLandmarks',
      'showIndoor',
      'show3dTrees',
    ];

    var report = {
      timestamp:                new Date().toISOString(),
      version:                  VERSION,
      // ── A. Imports inspection ───────────────────────────────────────────────
      importsPresent:           false,
      imports:                  [],
      importIds:                [],
      // ── B. API availability ─────────────────────────────────────────────────
      getConfigPropertyAvailable: false,
      setConfigPropertyAvailable: false,
      // ── C. Per-key audit results ─────────────────────────────────────────────
      configKeys:               [],
      // ── D. Rendered-feature baseline ────────────────────────────────────────
      baselineRenderedBuildingCount: 0,
      // ── E. Classification ────────────────────────────────────────────────────
      classificationCode:       null,
      classification:           null,
      actionableNextStep:       null,
    };

    if (!map) {
      report.classificationCode = 'ERROR';
      report.classification     = 'ERROR — map not available';
      report.actionableNextStep = 'Ensure map is initialized before calling this function';
      console.log('[auditMapboxStandardConfig]', JSON.stringify(report, null, 2));
      return report;
    }

    // ── A. Inspect imports ────────────────────────────────────────────────────
    var style = null;
    try { style = map.getStyle(); } catch (e) {}
    var styleImports = (style && Array.isArray(style.imports)) ? style.imports : [];
    if (styleImports.length) {
      report.importsPresent = true;
      styleImports.forEach(function (imp) {
        var entry = {
          id:     imp.id     || null,
          url:    imp.url    || null,
          config: imp.config || null,
        };
        report.imports.push(entry);
        if (imp.id) report.importIds.push(imp.id);
      });
    }

    // ── B. Check API availability ─────────────────────────────────────────────
    report.getConfigPropertyAvailable = typeof map.getConfigProperty === 'function';
    report.setConfigPropertyAvailable = typeof map.setConfigProperty === 'function';

    if (!report.importsPresent) {
      // Buildings are not coming from a Mapbox Standard imported basemap.
      report.classificationCode = 'GEOMETRY_NOT_STANDARD_CONFIG';
      report.classification     = 'GEOMETRY_NOT_STANDARD_CONFIG — map.getStyle().imports is empty or absent. ' +
        'The visible 3D buildings are not governed by the Mapbox Standard config API. ' +
        'They may come from a fill-extrusion layer in the local style or a custom mesh.';
      report.actionableNextStep = 'Run auditWallBuildingRenderOwnership() to determine the actual render owner, ' +
        'then patch the appropriate layer directly.';
      console.log('[auditMapboxStandardConfig] CLASSIFICATION:', report.classificationCode);
      console.log('[auditMapboxStandardConfig]', report.classification);
      console.log('[auditMapboxStandardConfig] FULL REPORT:');
      console.log(JSON.stringify(report, null, 2));
      return report;
    }

    if (!report.getConfigPropertyAvailable && !report.setConfigPropertyAvailable) {
      report.classificationCode = 'MAPBOX_STANDARD_IMPORT_LIMITATION';
      report.classification     = 'MAPBOX_STANDARD_IMPORT_LIMITATION — imports present (' +
        report.importIds.join(', ') + ') but map.getConfigProperty and map.setConfigProperty ' +
        'are not functions on this Mapbox GL version. The config API is only available in ' +
        'Mapbox GL JS ≥ 3.x with the Standard style.';
      report.actionableNextStep = 'Upgrade Mapbox GL JS to ≥ 3.0 and use the Standard style, ' +
        'or use map.setFilter on an accessible building layer as an alternative.';
      console.log('[auditMapboxStandardConfig] CLASSIFICATION:', report.classificationCode);
      console.log('[auditMapboxStandardConfig]', report.classification);
      console.log('[auditMapboxStandardConfig] FULL REPORT:');
      console.log(JSON.stringify(report, null, 2));
      return report;
    }

    // ── Baseline: count rendered building features before any toggle ──────────
    var baselineCount = 0;
    try {
      var canvas = map.getCanvas();
      var cw = canvas.clientWidth  || canvas.width  || 800;
      var ch = canvas.clientHeight || canvas.height || 600;
      var baseFeats = map.queryRenderedFeatures(
        [[cw / 2 - 150, ch / 2 - 150], [cw / 2 + 150, ch / 2 + 150]]
      ) || [];
      baseFeats.forEach(function (f) {
        var sl  = (f.sourceLayer || '').toLowerCase();
        var lid = ((f.layer && f.layer.id) || '').toLowerCase();
        var ft  = ((f.layer && f.layer.type) || '').toLowerCase();
        if (/building/.test(sl) || /building/.test(lid) || ft === 'fill-extrusion' || ft === 'model') {
          baselineCount++;
        }
      });
    } catch (e) {}
    report.baselineRenderedBuildingCount = baselineCount;

    // ── C. Per-key audit — read, toggle off, readback, count, restore ─────────
    var importIdsToTry = report.importIds.length ? report.importIds : ['basemap'];
    var anyKeyRoundTrips = false;
    var anyKeyReducedCount = false;
    var anyKeyThrew = false;
    var anyKeyUndefined = false;

    CONFIG_KEYS.forEach(function (configKey) {
      var keyReport = {
        key:                  configKey,
        testedImportIds:      [],
        results:              [],
        roundTripOk:          false,
        geometryCountChanged: false,
        classification:       null,
      };

      importIdsToTry.forEach(function (importId) {
        var entry = {
          importId:         importId,
          initialValue:     undefined,
          initialReadError: null,
          setError:         null,
          afterSetValue:    undefined,
          afterSetReadError: null,
          afterSetCount:    null,
          restoreError:     null,
          afterRestoreValue: undefined,
          roundTripOk:      false,
          geometryCountChanged: false,
        };

        // 1. Read initial value
        try {
          entry.initialValue = map.getConfigProperty(importId, configKey);
        } catch (e) {
          entry.initialReadError = String(e && e.message || e);
          anyKeyThrew = true;
        }

        if (entry.initialValue === undefined && !entry.initialReadError) {
          anyKeyUndefined = true;
        }

        // 2. Set to false
        try {
          map.setConfigProperty(importId, configKey, false);
        } catch (e) {
          entry.setError = String(e && e.message || e);
          anyKeyThrew = true;
        }

        // 3. Readback immediately after set
        try {
          entry.afterSetValue = map.getConfigProperty(importId, configKey);
        } catch (e) {
          entry.afterSetReadError = String(e && e.message || e);
        }

        // 4. Check round-trip: afterSetValue should be false (or falsy)
        var roundTrip = (entry.setError === null) &&
                        (entry.afterSetReadError === null) &&
                        (entry.afterSetValue === false || entry.afterSetValue === 0 ||
                         entry.afterSetValue === 'false');
        entry.roundTripOk = roundTrip;
        if (roundTrip) anyKeyRoundTrips = true;

        // 5. Re-query rendered building features after toggle
        try {
          var cw2 = 800, ch2 = 600;
          try {
            var cv2 = map.getCanvas();
            cw2 = cv2.clientWidth  || cv2.width  || 800;
            ch2 = cv2.clientHeight || cv2.height || 600;
          } catch (e) {}
          var afterFeats = map.queryRenderedFeatures(
            [[cw2 / 2 - 150, ch2 / 2 - 150], [cw2 / 2 + 150, ch2 / 2 + 150]]
          ) || [];
          var afterCount = 0;
          afterFeats.forEach(function (f) {
            var sl  = (f.sourceLayer || '').toLowerCase();
            var lid = ((f.layer && f.layer.id) || '').toLowerCase();
            var ft  = ((f.layer && f.layer.type) || '').toLowerCase();
            if (/building/.test(sl) || /building/.test(lid) || ft === 'fill-extrusion' || ft === 'model') {
              afterCount++;
            }
          });
          entry.afterSetCount = afterCount;
          entry.geometryCountChanged = (afterCount < baselineCount);
          if (entry.geometryCountChanged) anyKeyReducedCount = true;
        } catch (e) {}

        // 6. Restore original value
        try {
          var restoreVal = (entry.initialValue !== undefined) ? entry.initialValue : true;
          map.setConfigProperty(importId, configKey, restoreVal);
        } catch (e) {
          entry.restoreError = String(e && e.message || e);
        }

        // 7. Verify restore
        try {
          entry.afterRestoreValue = map.getConfigProperty(importId, configKey);
        } catch (e) {}

        // 8. Detect config-resets-on-style: if afterRestoreValue !== initialValue
        if (entry.initialValue !== undefined && entry.afterRestoreValue !== undefined) {
          entry.restoreVerified = (String(entry.afterRestoreValue) === String(entry.initialValue));
        }

        keyReport.results.push(entry);
        keyReport.testedImportIds.push(importId);
        if (entry.roundTripOk)          keyReport.roundTripOk          = true;
        if (entry.geometryCountChanged) keyReport.geometryCountChanged = true;
      });

      if (keyReport.roundTripOk && keyReport.geometryCountChanged) {
        keyReport.classification = 'A_CONFIG_KEY_WORKS';
      } else if (keyReport.roundTripOk && !keyReport.geometryCountChanged) {
        keyReport.classification = 'B_CONFIG_KEY_IGNORED_GEOMETRY_UNCHANGED';
      } else if (!keyReport.roundTripOk && !anyKeyThrew) {
        keyReport.classification = 'B_ROUND_TRIP_FAILED_NO_REFLECTION';
      } else if (anyKeyThrew) {
        keyReport.classification = 'E_API_THREW';
      } else {
        keyReport.classification = 'UNKNOWN';
      }

      report.configKeys.push(keyReport);
    });

    // ── D. Overall classification ──────────────────────────────────────────────
    var allRoundTripOk = report.configKeys.every(function (k) { return k.roundTripOk; });
    var anyRoundTripOk = report.configKeys.some(function (k) { return k.roundTripOk; });

    var code, classification, nextStep;

    if (anyKeyReducedCount && anyRoundTripOk) {
      code           = 'CONFIG_KEY_WORKS';
      classification = 'CONFIG_KEY_WORKS — setConfigProperty round-trips correctly AND at least one ' +
        'toggle reduced the rendered building feature count immediately. The Mapbox Standard config ' +
        'API governs these buildings. Suppression can be implemented by setting show3dBuildings and ' +
        'show3dFacades to false for the target import.';
      nextStep       = 'Implement 0611N_WOS_MapboxStandardConfigSuppression — call ' +
        'map.setConfigProperty(importId, "show3dBuildings", false) + ' +
        'map.setConfigProperty(importId, "show3dFacades", false) at projection time, and ' +
        'restore on clearProjection(). Note this hides ALL buildings in the import, not per-feature — ' +
        'combine with a fill-extrusion overlay or slot filter for per-building suppression.';
    } else if (anyRoundTripOk && !anyKeyReducedCount) {
      code           = 'CONFIG_KEY_IGNORED';
      classification = 'CONFIG_KEY_IGNORED — setConfigProperty round-trips (getConfigProperty reflects ' +
        'the new value) but the rendered geometry count did not change immediately. ' +
        'This is expected if Mapbox GL repaints asynchronously — the toggle may take effect on ' +
        'the next render frame. Synchronous queryRenderedFeatures cannot confirm the visual effect.';
      nextStep       = 'Run the manual test: call map.setConfigProperty(importId,"show3dBuildings",false), ' +
        'wait 500ms, then call queryRenderedFeatures to check if building features disappeared. ' +
        'If yes → CONFIG_KEY_WORKS (async). If geometry still present → key is structurally ignored ' +
        'and a different approach (slot filter, layer override) is needed.';
    } else if (anyKeyThrew && report.importsPresent) {
      code           = 'MAPBOX_STANDARD_IMPORT_LIMITATION';
      classification = 'MAPBOX_STANDARD_IMPORT_LIMITATION — imports present but setConfigProperty / ' +
        'getConfigProperty threw errors on one or more keys. The config API may not be available ' +
        'for this import or Mapbox GL version.';
      nextStep       = 'Check error details in configKeys[].results[].setError. If "not a function": ' +
        'upgrade Mapbox GL JS. If "invalid import": verify the importId matches map.getStyle().imports[].id.';
    } else if (anyKeyUndefined && report.importsPresent) {
      code           = 'MAPBOX_STANDARD_IMPORT_LIMITATION';
      classification = 'MAPBOX_STANDARD_IMPORT_LIMITATION — imports present and API exists, but ' +
        'getConfigProperty returns undefined for all tested keys. The import may not expose ' +
        'a schema with these config keys, or the import ID is wrong.';
      nextStep       = 'Inspect report.imports to find the correct importId and any config schema. ' +
        'Try map.getConfigProperty(importId, "lights") or map.getConfigProperty(importId, "colorPlacesLabel") ' +
        'to confirm the API is working at all. Then identify the correct key name from the Mapbox Standard ' +
        'schema documentation.';
    } else {
      code           = 'GEOMETRY_NOT_STANDARD_CONFIG';
      classification = 'GEOMETRY_NOT_STANDARD_CONFIG — API available and imports present, but config ' +
        'key round-trips failed and no geometry change detected. Buildings may not be controlled ' +
        'by this import\'s config keys.';
      nextStep       = 'Run auditWallBuildingRenderOwnership() to identify the actual render source. ' +
        'Buildings may be in a separate fill-extrusion layer unrelated to the Standard config.';
    }

    report.classificationCode = code;
    report.classification     = classification;
    report.actionableNextStep = nextStep;

    // ── Summary log ────────────────────────────────────────────────────────────
    console.log('[auditMapboxStandardConfig] ══════════════════════════════════════');
    console.log('[auditMapboxStandardConfig] CLASSIFICATION:', code);
    console.log('[auditMapboxStandardConfig]', classification);
    console.log('[auditMapboxStandardConfig] NEXT STEP:', nextStep);
    console.log('[auditMapboxStandardConfig] imports:', report.importIds.join(', ') || '(none)');
    console.log('[auditMapboxStandardConfig] baselineBuilding features:', baselineCount);
    console.log('[auditMapboxStandardConfig] getConfigProperty available:', report.getConfigPropertyAvailable);
    console.log('[auditMapboxStandardConfig] setConfigProperty available:', report.setConfigPropertyAvailable);
    console.log('[auditMapboxStandardConfig] per-key summary:');
    report.configKeys.forEach(function (k) {
      console.log('  ' + k.key + ': roundTrip=' + k.roundTripOk +
        ' | geometryChanged=' + k.geometryCountChanged +
        ' | ' + k.classification);
    });
    console.log('[auditMapboxStandardConfig] FULL REPORT:');
    console.log(JSON.stringify(report, null, 2));
    return report;
  }

  // ── auditStandardImportConfigTarget — 0611N async audit ─────────────────────
  //
  // Async (Promise-based). Waits 1000 ms after each setConfigProperty so the GL
  // engine has time to repaint before pixel/query samples are taken.
  //
  // Call from Wall console (note: returns a Promise):
  //   auditStandardImportConfigTarget().then(r => console.log(r))
  //   _wos.debug.buildingEdits.auditStandardImportConfigTarget()
  //
  // For each (importId × configKey) it records:
  //   initialValue       — getConfigProperty before any write
  //   roundTripOk        — getConfigProperty immediately after setConfigProperty returns false/0
  //   afterWaitValue     — getConfigProperty after 1000 ms
  //   afterWaitQueryCount — queryRenderedFeatures building-feature count after 1000 ms
  //   pixelBefore/After  — RGBA at building probe point (WebGL readPixels during render frame)
  //   pixelChanged       — sum-of-channel-deltas > 15
  //   buildingDisappeared — pixelChanged OR queryCountChanged
  //   status             — ACCEPTED_AND_EFFECTIVE | ACCEPTED_NOT_EFFECTIVE |
  //                        UNDEFINED | THREW_ERROR | NOT_ACCEPTED
  //
  // Probe point: first hidden/replacement building centroid in manifest, else screen centre.
  // Pixel sampling: map.triggerRepaint() + map.once('render') to read inside an active GL frame.
  //   Falls back to null if preserveDrawingBuffer is false and readPixels returns zeroes.
  //
  // Classifications:
  //   CONFIG_KEY_WORKS              — round-trip OK AND visual change observed
  //   A. WRONG_IMPORT_ID            — all keys returned undefined (importId not in schema)
  //   B. WRONG_CONFIG_KEY           — some keys round-trip but none produced a visual change,
  //                                   AND at least one key returned undefined (key name wrong)
  //   C. CONFIG_ACCEPTED_NOT_APPLIED — round-trips work, 1000 ms elapsed, no visual change
  //   D. IMPORTED_STANDARD_NOT_CONFIGURABLE — mixed/inconclusive, nothing worked
  //   E. NOT_STANDARD_IMPORT        — no imports, or all API calls threw

  async function auditStandardImportConfigTarget() {
    var map = _getMap();

    var ALL_CONFIG_KEYS = [
      'show3dBuildings',
      'show3dFacades',
      'showBuildings',
      'showBuildingModels',
      'showBuildingExtrusions',
      'show3dObjects',
      'show3dLandmarks',
      'showIndoor',
    ];

    var report = {
      timestamp:                  new Date().toISOString(),
      version:                    VERSION,
      // ── 1. Raw imports ──────────────────────────────────────────────────────
      rawImports:                 [],
      importIds:                  [],
      // ── 2. Per-key results ──────────────────────────────────────────────────
      keyTests:                   [],
      // ── 3. Pixel sampling ───────────────────────────────────────────────────
      pixelSamplingSupported:     false,
      buildingProbePoint:         null,
      baselinePixel:              null,
      baselineQueryCount:         0,
      // ── 4. Summary ──────────────────────────────────────────────────────────
      workingImportId:            null,
      keysAccepted:               [],    // round-trip OK AND visual change
      keysIgnored:                [],    // round-trip OK but no visual change
      keysUndefined:              [],    // getConfigProperty returned undefined
      keysThrewErrors:            [],    // any API call threw
      buildingsVisuallyChanged:   false,
      classificationCode:         null,
      classification:             null,
    };

    if (!map) {
      report.classificationCode = 'ERROR';
      report.classification     = 'ERROR — map not available';
      console.log('[auditStandardImportConfigTarget]', JSON.stringify(report, null, 2));
      return report;
    }

    // ── 1. Dump raw imports ────────────────────────────────────────────────────
    var style = null;
    try { style = map.getStyle(); } catch (e) {}
    var styleImports = (style && Array.isArray(style.imports)) ? style.imports : [];

    console.log('[auditStandardImportConfigTarget] map.getStyle().imports:');
    console.log(JSON.stringify(styleImports, null, 2));

    if (!styleImports.length) {
      report.classificationCode = 'NOT_STANDARD_IMPORT';
      report.classification     = 'E. NOT_STANDARD_IMPORT — map.getStyle().imports is empty or absent.';
      console.log('[auditStandardImportConfigTarget]', report.classification);
      console.log(JSON.stringify(report, null, 2));
      return report;
    }

    styleImports.forEach(function (imp) {
      var entry = {
        id:     imp.id     != null ? imp.id     : null,
        url:    imp.url    != null ? imp.url    : null,
        config: null,
      };
      // Deep-copy config without crashing on non-serialisable values
      if (imp.config && typeof imp.config === 'object') {
        try { entry.config = JSON.parse(JSON.stringify(imp.config)); } catch (e) { entry.config = String(imp.config); }
      }
      report.rawImports.push(entry);
      if (imp.id != null) report.importIds.push(String(imp.id));
    });

    // Always try 'basemap' as a fallback even if importIds array is populated,
    // because some GL versions expose a different effective ID at runtime.
    var importIdsToTest = report.importIds.slice();
    if (importIdsToTest.indexOf('basemap') === -1) importIdsToTest.push('basemap');

    console.log('[auditStandardImportConfigTarget] import IDs to test:', importIdsToTest);

    // ── Canvas & probe point ───────────────────────────────────────────────────
    var canvas = null;
    var probeX = 400;
    var probeY = 300;

    try {
      canvas = map.getCanvas();
      var cw = canvas.clientWidth  || canvas.width  || 800;
      var ch = canvas.clientHeight || canvas.height || 600;
      probeX = Math.round(cw / 2);
      probeY = Math.round(ch / 2);
    } catch (e) {}

    // Prefer a known building location from the manifest
    if (_manifest && _manifest.buildings) {
      var mBldKeys = Object.keys(_manifest.buildings);
      for (var mbi = 0; mbi < mBldKeys.length; mbi++) {
        var mbedit = _manifest.buildings[mBldKeys[mbi]];
        var mbg    = mbedit && mbedit.geometry;
        if (!mbg || !mbg.centroid) continue;
        var mbHidden  = mbedit.hidden;
        var mbReplace = mbedit.replacement && mbedit.replacement.enabled;
        if (!mbHidden && !mbReplace) continue;
        try {
          var mbPt = map.project([mbg.centroid.lng, mbg.centroid.lat]);
          probeX = Math.round(mbPt.x);
          probeY = Math.round(mbPt.y);
          report.buildingProbePoint = { x: probeX, y: probeY, lng: mbg.centroid.lng, lat: mbg.centroid.lat, source: mBldKeys[mbi] };
          break;
        } catch (e) {}
      }
    }
    if (!report.buildingProbePoint) {
      report.buildingProbePoint = { x: probeX, y: probeY, source: 'screen-center' };
    }

    // ── Pixel sampler — reads GL pixels during an active render frame ──────────
    // map.triggerRepaint() schedules a frame; map.once('render') fires inside it.
    // WebGL readPixels is only reliable within the frame callback.
    // If preserveDrawingBuffer is false (Mapbox default) out-of-frame reads return zeros.
    function samplePixel(px, py) {
      return new Promise(function (resolve) {
        if (!canvas) { resolve(null); return; }
        try {
          map.triggerRepaint();
          map.once('render', function () {
            try {
              var gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
              if (!gl) { resolve(null); return; }
              var canvasH = canvas.height || 600;
              var buf     = new Uint8Array(4);
              // WebGL coordinate origin is bottom-left; DOM is top-left → flip Y
              gl.readPixels(Math.round(px), Math.round(canvasH - py), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
              // All-zeros means either the pixel IS black/transparent, or preserveDrawingBuffer=false
              // and we landed outside the render frame. We report what we read and flag it.
              resolve({ r: buf[0], g: buf[1], b: buf[2], a: buf[3], allZero: (buf[0] === 0 && buf[1] === 0 && buf[2] === 0 && buf[3] === 0) });
            } catch (e2) {
              resolve(null);
            }
          });
        } catch (e) {
          resolve(null);
        }
      });
    }

    // Wait helper
    function waitMs(ms) {
      return new Promise(function (resolve) { setTimeout(resolve, ms); });
    }

    // Building feature counter (queryRenderedFeatures centre box)
    function countBldgFeatures() {
      try {
        var cw2 = 800, ch2 = 600;
        try { var cv2 = map.getCanvas(); cw2 = cv2.clientWidth || cv2.width || 800; ch2 = cv2.clientHeight || cv2.height || 600; } catch (e) {}
        var feats = map.queryRenderedFeatures([[cw2/2 - 150, ch2/2 - 150], [cw2/2 + 150, ch2/2 + 150]]) || [];
        var n = 0;
        feats.forEach(function (f) {
          var sl   = (f.sourceLayer || '').toLowerCase();
          var lid  = ((f.layer && f.layer.id)   || '').toLowerCase();
          var ft   = ((f.layer && f.layer.type) || '').toLowerCase();
          if (/building/.test(sl) || /building/.test(lid) || ft === 'fill-extrusion' || ft === 'model') n++;
        });
        return n;
      } catch (e) { return -1; }
    }

    // Helper: pixel distance
    function pixelDelta(a, b) {
      if (!a || !b) return null;
      return Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
    }

    // ── Baseline (before any toggle) ──────────────────────────────────────────
    var baselinePixel      = await samplePixel(probeX, probeY);
    var baselineQueryCount = countBldgFeatures();
    report.baselinePixel      = baselinePixel;
    report.baselineQueryCount = baselineQueryCount;
    report.pixelSamplingSupported = baselinePixel !== null && !baselinePixel.allZero;

    console.log('[auditStandardImportConfigTarget] baseline pixel:', JSON.stringify(baselinePixel),
      '| query count:', baselineQueryCount,
      '| probe:', JSON.stringify(report.buildingProbePoint));

    // ── Per-importId × per-key test loop ──────────────────────────────────────
    for (var ii = 0; ii < importIdsToTest.length; ii++) {
      var importId = importIdsToTest[ii];
      console.log('[auditStandardImportConfigTarget] ── testing importId: "' + importId + '" ──');

      for (var ki = 0; ki < ALL_CONFIG_KEYS.length; ki++) {
        var configKey = ALL_CONFIG_KEYS[ki];

        var kEntry = {
          importId:           importId,
          key:                configKey,
          initialValue:       undefined,
          initialReadError:   null,
          setError:           null,
          syncReadbackValue:  undefined,
          syncRoundTripOk:    false,
          afterWaitValue:     undefined,
          afterWaitQueryCount: null,
          afterWaitPixel:     null,
          pixelDelta:         null,
          pixelChanged:       false,
          queryCountChanged:  false,
          buildingDisappeared: false,
          restoreValue:       undefined,
          restoreError:       null,
          afterRestoreValue:  undefined,
          status:             null,
        };

        // 1. Read initial value
        try {
          kEntry.initialValue = map.getConfigProperty(importId, configKey);
        } catch (e) {
          kEntry.initialReadError = String(e && e.message || e);
        }

        // 2. Set to false
        if (!kEntry.initialReadError) {
          try {
            map.setConfigProperty(importId, configKey, false);
          } catch (e) {
            kEntry.setError = String(e && e.message || e);
          }
        }

        // 3. Synchronous readback (no wait — verifies the write was accepted)
        if (!kEntry.setError && !kEntry.initialReadError) {
          try {
            kEntry.syncReadbackValue = map.getConfigProperty(importId, configKey);
            kEntry.syncRoundTripOk   = (kEntry.syncReadbackValue === false  ||
                                        kEntry.syncReadbackValue === 0      ||
                                        String(kEntry.syncReadbackValue) === 'false');
          } catch (e) {}
        }

        // 4. Wait 1000 ms for GL engine to repaint
        await waitMs(1000);

        // 5. Post-wait checks
        try {
          kEntry.afterWaitValue = map.getConfigProperty(importId, configKey);
        } catch (e) {}

        kEntry.afterWaitQueryCount = countBldgFeatures();
        kEntry.afterWaitPixel      = await samplePixel(probeX, probeY);
        kEntry.pixelDelta          = pixelDelta(baselinePixel, kEntry.afterWaitPixel);
        // Threshold 15 absorbs normal rendering jitter; meaningful building removal
        // typically shifts beige→sky-blue or beige→dark which changes channels by 40+.
        kEntry.pixelChanged       = (kEntry.pixelDelta !== null && kEntry.pixelDelta > 15)
                                  && (!kEntry.afterWaitPixel || !kEntry.afterWaitPixel.allZero);
        kEntry.queryCountChanged  = (kEntry.afterWaitQueryCount !== baselineQueryCount &&
                                     kEntry.afterWaitQueryCount >= 0);
        kEntry.buildingDisappeared = kEntry.pixelChanged || kEntry.queryCountChanged;

        // 6. Restore original value
        kEntry.restoreValue = (kEntry.initialValue !== undefined) ? kEntry.initialValue : true;
        try {
          map.setConfigProperty(importId, configKey, kEntry.restoreValue);
        } catch (e) {
          kEntry.restoreError = String(e && e.message || e);
        }

        // Brief wait for restore to settle (shorter — we don't re-sample after restore)
        await waitMs(300);

        try {
          kEntry.afterRestoreValue = map.getConfigProperty(importId, configKey);
        } catch (e) {}

        // 7. Classify this (importId, key) pair
        if (kEntry.initialReadError || kEntry.setError) {
          kEntry.status = 'THREW_ERROR';
          report.keysThrewErrors.push(importId + '.' + configKey);
        } else if (kEntry.initialValue === undefined) {
          kEntry.status = 'UNDEFINED';
          report.keysUndefined.push(importId + '.' + configKey);
        } else if (kEntry.syncRoundTripOk && kEntry.buildingDisappeared) {
          kEntry.status = 'ACCEPTED_AND_EFFECTIVE';
          report.keysAccepted.push(importId + '.' + configKey);
          report.buildingsVisuallyChanged = true;
          if (!report.workingImportId) report.workingImportId = importId;
        } else if (kEntry.syncRoundTripOk && !kEntry.buildingDisappeared) {
          kEntry.status = 'ACCEPTED_NOT_EFFECTIVE';
          report.keysIgnored.push(importId + '.' + configKey);
        } else {
          kEntry.status = 'NOT_ACCEPTED';
          report.keysIgnored.push(importId + '.' + configKey);
        }

        console.log('[auditStandardImportConfigTarget]',
          '"' + importId + '"."' + configKey + '"',
          '→ initial:', JSON.stringify(kEntry.initialValue),
          '| roundTrip:', kEntry.syncRoundTripOk,
          '| pixelΔ:', kEntry.pixelDelta,
          '| pixelChanged:', kEntry.pixelChanged,
          '| queryChanged:', kEntry.queryCountChanged,
          '| status:', kEntry.status);

        report.keyTests.push(kEntry);
      }
    }

    // ── Final classification ───────────────────────────────────────────────────
    var totalPairs      = importIdsToTest.length * ALL_CONFIG_KEYS.length;
    var allUndefined    = report.keysUndefined.length    === totalPairs;
    var allThrew        = report.keysThrewErrors.length  === totalPairs;
    var someUndefined   = report.keysUndefined.length    > 0;
    var someRoundTrip   = report.keysIgnored.length      > 0 || report.keysAccepted.length > 0;
    var hasEffective    = report.keysAccepted.length     > 0;

    var finalCode, finalClass;

    if (hasEffective) {
      finalCode  = 'CONFIG_KEY_WORKS';
      finalClass = 'CONFIG_KEY_WORKS — at least one (importId, key) pair produced a confirmed visual change after 1000 ms. ' +
        'Working importId: "' + report.workingImportId + '". ' +
        'Effective pairs: ' + report.keysAccepted.join(', ') + '.';
    } else if (allThrew && !allUndefined) {
      finalCode  = 'NOT_STANDARD_IMPORT';
      finalClass = 'E. NOT_STANDARD_IMPORT — setConfigProperty/getConfigProperty threw for all tested pairs. ' +
        'The import may not be a Mapbox Standard style, or this GL version predates the config API.';
    } else if (allUndefined) {
      finalCode  = 'WRONG_IMPORT_ID';
      finalClass = 'A. WRONG_IMPORT_ID — getConfigProperty returned undefined for every tested key across ' +
        'all import IDs (' + importIdsToTest.join(', ') + '). ' +
        'The Standard style schema does not expose these keys under the tested IDs. ' +
        'Either the effective runtime import ID differs from what getStyle().imports[].id reports, ' +
        'or this Standard style variant exposes a different config schema (check import.config in rawImports).';
    } else if (someUndefined && someRoundTrip && !hasEffective) {
      finalCode  = 'WRONG_CONFIG_KEY';
      finalClass = 'B. WRONG_CONFIG_KEY — some keys returned undefined (name mismatch) while others ' +
        'round-tripped (write accepted) but neither produced a visual change. ' +
        'The import is reachable but the specific keys controlling regular building extrusions are ' +
        'different from the ones tested. Inspect rawImports[*].config for the authoritative key list.';
    } else if (someRoundTrip && !hasEffective) {
      finalCode  = 'CONFIG_ACCEPTED_NOT_APPLIED';
      finalClass = 'C. CONFIG_ACCEPTED_NOT_APPLIED — config writes round-trip and 1000 ms elapsed, ' +
        'but no visual change was detected. Possible causes: ' +
        '(1) The keys tested control a different building tier than the beige boxes visible on screen. ' +
        '(2) The Standard import renders buildings via an internal tile path that ignores hot config changes. ' +
        '(3) Pixel sampling is unreliable at this probe point (allZero baseline = preserveDrawingBuffer:false — check pixelSamplingSupported). ' +
        'Manual visual inspection is required to discriminate.';
    } else {
      finalCode  = 'IMPORTED_STANDARD_NOT_CONFIGURABLE';
      finalClass = 'D. IMPORTED_STANDARD_NOT_CONFIGURABLE — imports present and API available, ' +
        'but no key produced a visual change and results are mixed. ' +
        'The visible beige buildings are likely rendered by the Standard imported basemap through ' +
        'an internal GL layer that is not reachable via the public config API.';
    }

    report.classificationCode = finalCode;
    report.classification     = finalClass;

    // ── Summary log ────────────────────────────────────────────────────────────
    console.log('[auditStandardImportConfigTarget] ══════════════════════════════════════');
    console.log('[auditStandardImportConfigTarget] CLASSIFICATION:', finalCode);
    console.log('[auditStandardImportConfigTarget]', finalClass);
    console.log('[auditStandardImportConfigTarget] working importId:', report.workingImportId || '(none)');
    console.log('[auditStandardImportConfigTarget] pixel sampling supported:', report.pixelSamplingSupported);
    console.log('[auditStandardImportConfigTarget] baseline pixel:', JSON.stringify(baselinePixel));
    console.log('[auditStandardImportConfigTarget] keys ACCEPTED_AND_EFFECTIVE:', report.keysAccepted.join(', ') || '(none)');
    console.log('[auditStandardImportConfigTarget] keys ACCEPTED_NOT_EFFECTIVE:', report.keysIgnored.join(', ') || '(none)');
    console.log('[auditStandardImportConfigTarget] keys UNDEFINED:', report.keysUndefined.join(', ') || '(none)');
    console.log('[auditStandardImportConfigTarget] keys THREW:', report.keysThrewErrors.join(', ') || '(none)');
    console.log('[auditStandardImportConfigTarget] buildings visually changed:', report.buildingsVisuallyChanged);
    console.log('[auditStandardImportConfigTarget] FULL REPORT:');
    console.log(JSON.stringify(report, null, 2));
    return report;
  }

  // ── auditMapboxStandardSchemaKeyResolver — 0611O async audit ─────────────────
  //
  // Diagnoses exactly why getConfigProperty('basemap', key) returns null even
  // though imports[0].config contains the key, and setConfigProperty executes
  // without throwing but roundTrip stays false.
  //
  // Call:
  //   auditMapboxStandardSchemaKeyResolver()
  //   auditMapboxStandardSchemaKeyResolver({ testSetStyle: true })   ← DESTRUCTIVE
  //   _wos.debug.buildingEdits.auditMapboxStandardSchemaKeyResolver()
  //
  // opts.testSetStyle (default false): if true, calls map.setStyle() with a
  //   modified imports[0].config copy to test whether config changes take effect
  //   on style reload.  DESTRUCTIVE — wipes all runtime paint overrides.  The
  //   runtime re-applies suppression after the style-ready event, but there will
  //   be a visual flash. Pass { testSetStyle: true } only when the visual flash
  //   is acceptable and you need a definitive answer.
  //
  // What it does:
  //  1. Dumps imports[0] in full (id, url, config, data.schema if present).
  //  2. Builds a unified key inventory: schemaKeys, configKeys, inBoth, inSchemaOnly,
  //     inConfigOnly — so you can see if the config and schema are in sync.
  //  3. Tests every key in (configKeys ∪ schemaKeys) with four access patterns:
  //       P1 getConfigProperty(id, key)          ← known to return null
  //       P2 setConfigProperty(id, key, false) → wait 1000ms → get(id, key)
  //       P3 setConfigProperty(id, key, true)  → wait 300ms  → get(id, key)
  //          (tests whether the value can be driven to true; proves read/write parity)
  //       P4 inspect map.getStyle().imports[0].config[key] directly after P2/P3
  //          (tests whether setConfigProperty mutates the style config object or a
  //           separate runtime store)
  //  4. Checks whether any key from imports[0].config survives a null→non-null
  //     round-trip by trying setConfigProperty(id, key, true) then getting.
  //  5. If opts.testSetStyle: deep-clones getStyle(), sets
  //     imports[0].config.show3dBuildings = false, calls setStyle(), waits for
  //     'style.load', samples a pixel, then restores with the original style.
  //
  // Classifications:
  //   A. WRONG_CONFIG_PROPERTY_PATH   — get returns null because the API path is
  //      wrong (wrong id format, key needs namespace prefix, etc.) but the schema
  //      key exists and setStyle approach works.
  //   B. CONFIG_ONLY_THROUGH_SETSTYLE — setConfigProperty has no runtime effect;
  //      only map.setStyle() with modified imports[0].config takes effect.
  //   C. CONFIG_API_UNAVAILABLE       — API exists and schema keys found, but neither
  //      setConfigProperty nor setStyle produces a runtime change.
  //   D. IMPORTED_STANDARD_NOT_CONTROLLABLE — no mechanism found to remove buildings
  //      from the imported Standard basemap post-load.
  //   E. NOT_STANDARD_IMPORT          — no imports with data.schema found.

  async function auditMapboxStandardSchemaKeyResolver(opts) {
    var testSetStyle = !!(opts && opts.testSetStyle === true);

    var BUILDING_KEYS = [
      'show3dBuildings', 'show3dFacades', 'showBuildings',
      'showBuildingModels', 'showBuildingExtrusions',
      'show3dObjects', 'show3dLandmarks', 'showIndoor',
    ];

    var map = _getMap();

    var report = {
      timestamp:             new Date().toISOString(),
      version:               VERSION,
      // ── 1. Import inventory ─────────────────────────────────────────────────
      importId:              null,
      importUrl:             null,
      importConfigKeys:      [],
      importConfigSnapshot:  null,
      schemaKeys:            [],
      schemaSnapshot:        null,      // full schema object (types + defaults)
      dataPresentInGetStyle: false,
      keyInventory: {
        inBoth:         [],
        inSchemaOnly:   [],
        inConfigOnly:   [],
      },
      // ── 2. Config property access tests ────────────────────────────────────
      accessTests:           [],        // one entry per key tested
      // ── 3. Read/write parity check ──────────────────────────────────────────
      setStyleTestSkipped:   !testSetStyle,
      setStyleTestResult:    null,
      // ── 4. Classification ────────────────────────────────────────────────────
      classificationCode:    null,
      classification:        null,
    };

    if (!map) {
      report.classificationCode = 'ERROR';
      report.classification     = 'ERROR — map not available';
      console.log('[auditMapboxStandardSchemaKeyResolver]', JSON.stringify(report, null, 2));
      return report;
    }

    // ── 1. Import inventory ────────────────────────────────────────────────────
    var style = null;
    try { style = map.getStyle(); } catch (e) {}
    var styleImports = (style && Array.isArray(style.imports)) ? style.imports : [];

    console.log('[auditMapboxStandardSchemaKeyResolver] ── import inventory ──');

    if (!styleImports.length) {
      report.classificationCode = 'NOT_STANDARD_IMPORT';
      report.classification     = 'E. NOT_STANDARD_IMPORT — no imports in getStyle()';
      console.log('[auditMapboxStandardSchemaKeyResolver]', report.classification);
      return report;
    }

    // Work with the first import (the Standard basemap)
    var imp = styleImports[0];
    report.importId  = imp.id  != null ? String(imp.id)  : null;
    report.importUrl = imp.url != null ? String(imp.url) : null;

    // Snapshot config keys + values
    if (imp.config && typeof imp.config === 'object') {
      try {
        report.importConfigSnapshot = JSON.parse(JSON.stringify(imp.config));
        report.importConfigKeys     = Object.keys(imp.config);
      } catch (e) {
        report.importConfigSnapshot = String(imp.config);
      }
    }

    // Inspect data.schema — exposed in Mapbox GL JS v3 when the imported style is loaded
    if (imp.data && typeof imp.data === 'object') {
      report.dataPresentInGetStyle = true;
      var schema = imp.data.schema;
      if (schema && typeof schema === 'object') {
        try {
          report.schemaSnapshot = JSON.parse(JSON.stringify(schema));
          report.schemaKeys     = Object.keys(schema);
        } catch (e) {
          report.schemaSnapshot = String(schema);
        }
      } else {
        // data is present but no schema property — log what top-level keys data has
        report.schemaSnapshot = { _dataTopLevelKeys: Object.keys(imp.data).slice(0, 40) };
      }
    }

    // Also probe deeper — some GL versions nest the schema differently
    var schemaProbeResults = {};
    ['data', 'schema', 'properties', 'params'].forEach(function (k) {
      if (imp[k] && typeof imp[k] === 'object') {
        schemaProbeResults[k] = Object.keys(imp[k]).slice(0, 60);
      }
    });
    report.impTopLevelKeys    = Object.keys(imp).slice(0, 30);
    report.schemaProbeResults = schemaProbeResults;

    console.log('[auditMapboxStandardSchemaKeyResolver] importId:', report.importId, '| url:', report.importUrl);
    console.log('[auditMapboxStandardSchemaKeyResolver] imp top-level keys:', report.impTopLevelKeys);
    console.log('[auditMapboxStandardSchemaKeyResolver] importConfigKeys:', report.importConfigKeys);
    console.log('[auditMapboxStandardSchemaKeyResolver] schemaKeys:', report.schemaKeys);
    console.log('[auditMapboxStandardSchemaKeyResolver] schemaProbeResults:', JSON.stringify(schemaProbeResults));
    console.log('[auditMapboxStandardSchemaKeyResolver] importConfigSnapshot:', JSON.stringify(report.importConfigSnapshot, null, 2));
    console.log('[auditMapboxStandardSchemaKeyResolver] schemaSnapshot:', JSON.stringify(report.schemaSnapshot, null, 2));

    // Key set diff
    var allKeys = [];
    report.importConfigKeys.forEach(function (k) { if (allKeys.indexOf(k) === -1) allKeys.push(k); });
    report.schemaKeys.forEach(function     (k) { if (allKeys.indexOf(k) === -1) allKeys.push(k); });
    // Also always include building-specific keys even if not in either
    BUILDING_KEYS.forEach(function (k) { if (allKeys.indexOf(k) === -1) allKeys.push(k); });

    allKeys.forEach(function (k) {
      var inSchema = report.schemaKeys.indexOf(k)       !== -1;
      var inConfig = report.importConfigKeys.indexOf(k) !== -1;
      if (inSchema && inConfig) report.keyInventory.inBoth.push(k);
      else if (inSchema)        report.keyInventory.inSchemaOnly.push(k);
      else if (inConfig)        report.keyInventory.inConfigOnly.push(k);
    });
    console.log('[auditMapboxStandardSchemaKeyResolver] keyInventory:', JSON.stringify(report.keyInventory));

    // ── 2. Config property access tests ───────────────────────────────────────
    var importId = report.importId || 'basemap';

    function waitMs(ms) {
      return new Promise(function (resolve) { setTimeout(resolve, ms); });
    }

    // Read the config key directly from the style object (bypasses the API)
    function readStyleConfigDirect(key) {
      try {
        var s = map.getStyle();
        var imps = (s && s.imports) || [];
        if (!imps.length) return undefined;
        var cfg = imps[0].config;
        return cfg && typeof cfg === 'object' ? cfg[key] : undefined;
      } catch (e) { return undefined; }
    }

    console.log('[auditMapboxStandardSchemaKeyResolver] ── access tests (importId: "' + importId + '") ──');

    for (var ki = 0; ki < allKeys.length; ki++) {
      var key = allKeys[ki];

      var entry = {
        key:                        key,
        inSchema:                   report.schemaKeys.indexOf(key)       !== -1,
        inConfig:                   report.importConfigKeys.indexOf(key) !== -1,
        // P1: baseline get
        p1_get:                     undefined,
        p1_getError:                null,
        // P2: set(false) → wait 1000ms → get
        p2_setError:                null,
        p2_syncGet:                 undefined,        // get immediately after set (no wait)
        p2_syncRoundTrip:           false,
        p2_styleConfigDirect_after: undefined,        // reads imp.config[key] directly
        p2_afterWaitGet:            undefined,
        p2_afterWaitStyleDirect:    undefined,
        // P3: set(true) → wait 300ms → get (can we drive it back to truthy?)
        p3_setError:                null,
        p3_syncGet:                 undefined,
        p3_syncRoundTrip:           false,
        p3_styleConfigDirect_after: undefined,
        // P4: comparison — does setConfigProperty mutate getStyle().imports[0].config?
        p4_styleConfigMutated:      false,
        // Summary
        getReturnsNull:             false,
        roundTripEverSucceeded:     false,
        styleConfigEverMutated:     false,
      };

      // P1 — baseline read
      try {
        entry.p1_get = map.getConfigProperty(importId, key);
      } catch (e) {
        entry.p1_getError = String(e && e.message || e);
      }
      entry.getReturnsNull = (entry.p1_get === null);

      // P2 — set(false), sync read, wait 1000ms, read again; also read style directly
      try { map.setConfigProperty(importId, key, false); } catch (e) { entry.p2_setError = String(e && e.message || e); }

      if (!entry.p2_setError) {
        try { entry.p2_syncGet           = map.getConfigProperty(importId, key);    } catch (e) {}
        entry.p2_syncRoundTrip            = (entry.p2_syncGet === false || entry.p2_syncGet === 0 || String(entry.p2_syncGet) === 'false');
        entry.p2_styleConfigDirect_after  = readStyleConfigDirect(key);
        entry.p4_styleConfigMutated       = (entry.p2_styleConfigDirect_after === false ||
                                             entry.p2_styleConfigDirect_after === 0    ||
                                             String(entry.p2_styleConfigDirect_after) === 'false');

        await waitMs(1000);

        try { entry.p2_afterWaitGet          = map.getConfigProperty(importId, key); } catch (e) {}
        entry.p2_afterWaitStyleDirect        = readStyleConfigDirect(key);
      }

      // P3 — set(true), sync read (can we drive it to true? proves API accepts writes)
      try { map.setConfigProperty(importId, key, true); } catch (e) { entry.p3_setError = String(e && e.message || e); }

      if (!entry.p3_setError) {
        try { entry.p3_syncGet           = map.getConfigProperty(importId, key);   } catch (e) {}
        entry.p3_syncRoundTrip            = (entry.p3_syncGet === true || entry.p3_syncGet === 1 || String(entry.p3_syncGet) === 'true');
        entry.p3_styleConfigDirect_after  = readStyleConfigDirect(key);
        // Restore original value
        var origVal = (imp.config && imp.config[key] !== undefined) ? imp.config[key] : true;
        try { map.setConfigProperty(importId, key, origVal); } catch (e) {}
        await waitMs(200);
      }

      entry.roundTripEverSucceeded = entry.p2_syncRoundTrip || entry.p3_syncRoundTrip;
      entry.styleConfigEverMutated = entry.p4_styleConfigMutated ||
        (entry.p3_styleConfigDirect_after === true ||
         entry.p3_styleConfigDirect_after === 1);

      console.log('[auditMapboxStandardSchemaKeyResolver]',
        '"' + key + '"',
        '| p1_get:', JSON.stringify(entry.p1_get),
        '| p2_syncGet:', JSON.stringify(entry.p2_syncGet),
        '| p2_styleConfigDirect:', JSON.stringify(entry.p2_styleConfigDirect_after),
        '| p3_syncGet:', JSON.stringify(entry.p3_syncGet),
        '| p3_styleConfigDirect:', JSON.stringify(entry.p3_styleConfigDirect_after),
        '| p4_styleMutated:', entry.p4_styleConfigMutated,
        '| roundTrip:', entry.roundTripEverSucceeded);

      report.accessTests.push(entry);
    }

    // ── 3. setStyle test (opt-in, destructive) ────────────────────────────────
    if (testSetStyle) {
      console.log('[auditMapboxStandardSchemaKeyResolver] ── setStyle test (DESTRUCTIVE) ──');
      var setStyleResult = {
        attempted:          true,
        cloneSucceeded:     false,
        setStyleCalled:     false,
        setStyleError:      null,
        styleLoadFired:     false,
        buildingKeyInNewImport: false,
        pixelBefore:        null,
        pixelAfter:         null,
        pixelChanged:       false,
        restoredOriginal:   false,
        restoreError:       null,
      };

      try {
        var origStyle     = map.getStyle();
        var origStyleJSON = JSON.parse(JSON.stringify(origStyle));  // deep clone for restore
        var modStyle      = JSON.parse(JSON.stringify(origStyle));  // deep clone to modify

        if (modStyle.imports && modStyle.imports[0] && modStyle.imports[0].config) {
          modStyle.imports[0].config.show3dBuildings = false;
          modStyle.imports[0].config.show3dFacades   = false;
          setStyleResult.cloneSucceeded = true;
          setStyleResult.buildingKeyInNewImport = true;
        }

        if (setStyleResult.cloneSucceeded) {
          // Pixel sample helper (inline, no samplePixel function in this scope)
          var canvas0 = null;
          try { canvas0 = map.getCanvas(); } catch (e) {}
          function quickPixel() {
            return new Promise(function (resolve) {
              if (!canvas0) { resolve(null); return; }
              try {
                map.triggerRepaint();
                map.once('render', function () {
                  try {
                    var gl0 = canvas0.getContext('webgl2') || canvas0.getContext('webgl');
                    if (!gl0) { resolve(null); return; }
                    var cw0 = canvas0.clientWidth  || canvas0.width  || 800;
                    var ch0 = canvas0.clientHeight || canvas0.height || 600;
                    var ph0 = canvas0.height || 600;
                    var buf0 = new Uint8Array(4);
                    gl0.readPixels(Math.round(cw0 / 2), Math.round(ph0 - ch0 / 2), 1, 1, gl0.RGBA, gl0.UNSIGNED_BYTE, buf0);
                    resolve({ r: buf0[0], g: buf0[1], b: buf0[2], a: buf0[3] });
                  } catch (e2) { resolve(null); }
                });
              } catch (e) { resolve(null); }
            });
          }

          setStyleResult.pixelBefore = await quickPixel();

          // Call setStyle with modified config
          try {
            map.setStyle(modStyle);
            setStyleResult.setStyleCalled = true;
          } catch (e) {
            setStyleResult.setStyleError = String(e && e.message || e);
          }

          if (setStyleResult.setStyleCalled) {
            // Wait for style.load event (max 8 seconds)
            await new Promise(function (resolve) {
              var done = false;
              var timeout = setTimeout(function () {
                if (!done) { done = true; resolve(); }
              }, 8000);
              map.once('style.load', function () {
                if (!done) {
                  done = true;
                  clearTimeout(timeout);
                  setStyleResult.styleLoadFired = true;
                  resolve();
                }
              });
            });

            // Extra 500ms for GL to finish painting after style.load
            await waitMs(500);
            setStyleResult.pixelAfter = await quickPixel();

            if (setStyleResult.pixelBefore && setStyleResult.pixelAfter) {
              var dr = Math.abs(setStyleResult.pixelAfter.r - setStyleResult.pixelBefore.r);
              var dg = Math.abs(setStyleResult.pixelAfter.g - setStyleResult.pixelBefore.g);
              var db = Math.abs(setStyleResult.pixelAfter.b - setStyleResult.pixelBefore.b);
              setStyleResult.pixelDelta = dr + dg + db;
              setStyleResult.pixelChanged = setStyleResult.pixelDelta > 15;
            }

            // Restore original style
            try {
              map.setStyle(origStyleJSON);
              setStyleResult.restoredOriginal = true;
              // Wait for restore style.load, then re-apply suppression
              await new Promise(function (resolve) {
                var done = false;
                var timeout = setTimeout(function () { if (!done) { done = true; resolve(); } }, 8000);
                map.once('style.load', function () {
                  if (!done) { done = true; clearTimeout(timeout); resolve(); }
                });
              });
              await waitMs(300);
              // Re-apply projection so suppression expressions are restored
              var m = _getMap();
              if (m) { try { _discoverLayers(m); _apply(m); } catch (e) {} }
            } catch (e) {
              setStyleResult.restoreError = String(e && e.message || e);
            }
          }
        }
      } catch (e) {
        setStyleResult.setStyleError = setStyleResult.setStyleError || String(e && e.message || e);
      }

      report.setStyleTestResult = setStyleResult;
      console.log('[auditMapboxStandardSchemaKeyResolver] setStyle test result:', JSON.stringify(setStyleResult, null, 2));
    }

    // ── 4. Classification ──────────────────────────────────────────────────────
    var anyRoundTrip        = report.accessTests.some(function (t) { return t.roundTripEverSucceeded; });
    var anyStyleMutated     = report.accessTests.some(function (t) { return t.styleConfigEverMutated; });
    var allGetNull          = report.accessTests.length > 0 &&
                              report.accessTests.every(function (t) { return t.p1_get === null && !t.p1_getError; });
    var anyGetNonNull       = report.accessTests.some(function (t) { return t.p1_get !== null && t.p1_get !== undefined && !t.p1_getError; });
    var schemaPresent       = report.schemaKeys.length > 0;
    var setStyleWorked      = report.setStyleTestResult && report.setStyleTestResult.pixelChanged;

    var finalCode, finalClass;

    if (setStyleWorked && !anyRoundTrip) {
      finalCode  = 'CONFIG_ONLY_THROUGH_SETSTYLE';
      finalClass = 'B. CONFIG_ONLY_THROUGH_SETSTYLE — setConfigProperty has no runtime effect ' +
        '(roundTrip=false, get always returns null). map.setStyle() with modified ' +
        'imports[0].config DID produce a visual change (pixelDelta=' +
        report.setStyleTestResult.pixelDelta + '). ' +
        'The Standard import config is only applied at style-load time — there is no hot-reload ' +
        'path via setConfigProperty.';
    } else if (setStyleWorked && anyRoundTrip) {
      finalCode  = 'WRONG_CONFIG_PROPERTY_PATH';
      finalClass = 'A. WRONG_CONFIG_PROPERTY_PATH — setStyle approach worked AND some keys round-tripped ' +
        'via setConfigProperty. The get/set API is reachable but the key path format may be wrong ' +
        'for the keys that stayed null.';
    } else if (!anyRoundTrip && allGetNull && schemaPresent) {
      finalCode  = 'WRONG_CONFIG_PROPERTY_PATH';
      finalClass = 'A. WRONG_CONFIG_PROPERTY_PATH — getConfigProperty returns null for all keys ' +
        'despite those keys existing in the import schema/config. setConfigProperty does not ' +
        'mutate the value getConfigProperty reads. This indicates the get and set operations ' +
        'target different internal stores: setConfigProperty writes to a runtime override buffer ' +
        'that the renderer does not honour for this GL version; getConfigProperty reads the ' +
        'style-config object which setConfigProperty does not modify. ' +
        (anyStyleMutated
          ? 'HOWEVER, readStyleConfigDirect() DID see a mutation — the style config object IS ' +
            'being mutated but getConfigProperty reads from a different path.'
          : 'readStyleConfigDirect() also showed no mutation — the style config object is not ' +
            'mutated by setConfigProperty. Both APIs bypass each other entirely.');
    } else if (anyRoundTrip && !setStyleWorked && !report.setStyleTestResult) {
      finalCode  = 'CONFIG_API_UNAVAILABLE';
      finalClass = 'C. CONFIG_API_UNAVAILABLE — some keys round-trip via the config API but no ' +
        'visual change was detected (setStyle test was not run — rerun with { testSetStyle: true } ' +
        'to confirm). Manual visual inspection is required.';
    } else if (!anyRoundTrip && !setStyleWorked) {
      finalCode  = 'IMPORTED_STANDARD_NOT_CONTROLLABLE';
      finalClass = 'D. IMPORTED_STANDARD_NOT_CONTROLLABLE — no mechanism found to suppress buildings ' +
        'in the imported Standard basemap. Neither setConfigProperty nor setStyle (if tested) ' +
        'produced a detectable change.';
    } else {
      finalCode  = 'CONFIG_API_UNAVAILABLE';
      finalClass = 'C. CONFIG_API_UNAVAILABLE — inconclusive. schemaPresent=' + schemaPresent +
        ', anyRoundTrip=' + anyRoundTrip + ', anyStyleMutated=' + anyStyleMutated +
        ', setStyleTested=' + testSetStyle + '.';
    }

    report.classificationCode = finalCode;
    report.classification     = finalClass;

    // ── Summary log ────────────────────────────────────────────────────────────
    console.log('[auditMapboxStandardSchemaKeyResolver] ══════════════════════════════════════');
    console.log('[auditMapboxStandardSchemaKeyResolver] CLASSIFICATION:', finalCode);
    console.log('[auditMapboxStandardSchemaKeyResolver]', finalClass);
    console.log('[auditMapboxStandardSchemaKeyResolver] importId:', report.importId, '| url:', report.importUrl);
    console.log('[auditMapboxStandardSchemaKeyResolver] schemaPresent:', schemaPresent, '| schemaKeys:', report.schemaKeys.length);
    console.log('[auditMapboxStandardSchemaKeyResolver] configKeys:', report.importConfigKeys);
    console.log('[auditMapboxStandardSchemaKeyResolver] inBoth:', report.keyInventory.inBoth);
    console.log('[auditMapboxStandardSchemaKeyResolver] inSchemaOnly:', report.keyInventory.inSchemaOnly);
    console.log('[auditMapboxStandardSchemaKeyResolver] inConfigOnly:', report.keyInventory.inConfigOnly);
    console.log('[auditMapboxStandardSchemaKeyResolver] allGetNull:', allGetNull,
      '| anyRoundTrip:', anyRoundTrip, '| anyStyleMutated:', anyStyleMutated);
    console.log('[auditMapboxStandardSchemaKeyResolver] setStyleTested:', testSetStyle,
      '| setStyleWorked:', !!setStyleWorked);
    console.log('[auditMapboxStandardSchemaKeyResolver] FULL REPORT:');
    console.log(JSON.stringify(report, null, 2));
    return report;
  }

  // ── hostBuildingAuthorityStatus — 0611Q public debug API ─────────────────────
  //
  // Read-only snapshot of the WOS host building layer authority state.
  // Does NOT mutate map state.
  //
  // Call:
  //   _wos.debug.buildingEdits.hostBuildingAuthorityStatus()
  //   SBE.BuildingEditProjectionRuntime.hostBuildingAuthorityStatus()
  //
  // visualAuthorityState values:
  //   HOST_AUTHORITY_CLEAN                  — host layer present, queryable, no contamination
  //   HOST_AUTHORITY_ACTIVE_IMPORTED_CONTAMINATION — host layer works; Standard import
  //                                           buildings may still render underneath
  //   HOST_AUTHORITY_UNAVAILABLE            — host layer could not be added
  //   ERROR                                 — exception during status check
  // ── 0611S: Editable building mode bypass helpers ─────────────────────────────

  function _isEditableBuildingMode() {
    return _buildingAuthorityMode === BUILDING_AUTHORITY_MODES.EDITABLE_BUILDING;
  }

  // _applyEditableBuildingBypass — marks imported Standard buildings as
  // non-authoritative and confirms the WOS host layer is ready for suppression.
  // Does NOT attempt setConfigProperty or any imported layer mutation.
  // Never throws. Updates _editableBuildingBypassState.
  function _applyEditableBuildingBypass(map) {
    var result = {
      ok:                                false,
      hostLayerReady:                    false,
      hostLayerSuppressible:             false,
      importBypassedAsAuthority:         false,
      importedVisualContaminationLikely: false,
      error:                             null,
    };

    try {
      if (!map) throw new Error('map_not_available');

      _ensureHostBuildingLayer(map);
      _discoverLayers(map);

      var hostLayer = null;
      for (var i = 0; i < _layers.length; i++) {
        if (_layers[i].id === WOS_HOST_BUILDING_LAYER_ID) {
          hostLayer = _layers[i];
          break;
        }
      }

      result.hostLayerReady       = !!hostLayer;
      result.hostLayerSuppressible = !!hostLayer && hostLayer.type === 'fill-extrusion';
      // Import is declared bypassed as authority — it is non-authoritative for editing regardless
      // of whether its visual rendering can be suppressed.
      result.importBypassedAsAuthority = true;

      var contamination = _detectImportedBuildingContamination(map);
      result.importedVisualContaminationLikely = !!contamination.contaminationLikely;

      result.ok = result.hostLayerReady && result.hostLayerSuppressible;

      console.log('[BuildingEditProjectionRuntime] _applyEditableBuildingBypass:',
        'hostLayerReady=' + result.hostLayerReady,
        '| hostLayerSuppressible=' + result.hostLayerSuppressible,
        '| importBypassed=' + result.importBypassedAsAuthority,
        '| importContaminationLikely=' + result.importedVisualContaminationLikely,
        '| ok=' + result.ok);
    } catch (e) {
      result.error = String(e && e.message || e);
      console.warn('[BuildingEditProjectionRuntime] _applyEditableBuildingBypass error:', result.error);
    }

    _editableBuildingBypassState.active                            = _isEditableBuildingMode();
    _editableBuildingBypassState.hostLayerReady                    = result.hostLayerReady;
    _editableBuildingBypassState.hostLayerSuppressible             = result.hostLayerSuppressible;
    _editableBuildingBypassState.importBypassedAsAuthority         = result.importBypassedAsAuthority;
    _editableBuildingBypassState.importedVisualContaminationLikely = result.importedVisualContaminationLikely;
    _editableBuildingBypassState.lastAppliedAt                     = Date.now();
    _editableBuildingBypassState.lastError                         = result.error;

    return result;
  }

  // ── 0611T: Editable visual isolation status helper ───────────────────────────
  //
  // Separates three distinct facts:
  //   editableDataAuthorityActive      — WOS host layer exists, is suppressible, import is bypassed
  //   editableVisualIsolationAchieved  — data authority is active AND no import contamination is likely
  //   truePerBuildingSuppressionAvailable — only true when visual isolation is achieved
  //
  // This helper is the single source of truth for the editable-mode status decision.
  function _computeEditableVisualIsolationStatus(map, hostStatus, contamination, bypass) {
    var result = {
      editableDataAuthorityActive:          false,
      editableVisualIsolationAchieved:      false,
      importedBuildingsBypassedAsAuthority: false,
      importedVisualContaminationLikely:    false,
      truePerBuildingSuppressionAvailable:  false,
      visualAuthorityState:                 'UNKNOWN',
      warning:                              null,
      lastError:                            null,
    };

    try {
      var hostLayerPresent       = !!(hostStatus && hostStatus.hostLayerPresent);
      var hostLayerSuppressible  = !!(
        hostStatus &&
        hostStatus.discoveredByProjectionRuntime &&
        hostStatus.suppressionStrategy === 'extrusion-height-suppression'
      );
      var importBypassed         = !!(bypass && bypass.importBypassedAsAuthority);
      var contaminationLikely    = !!(contamination && contamination.contaminationLikely);

      result.editableDataAuthorityActive          = hostLayerPresent && hostLayerSuppressible && importBypassed;
      result.importedBuildingsBypassedAsAuthority = importBypassed;
      result.importedVisualContaminationLikely    = contaminationLikely;
      result.editableVisualIsolationAchieved      = result.editableDataAuthorityActive && !contaminationLikely;
      // truePerBuildingSuppressionAvailable requires clean visual isolation:
      // host layer works AND no imported visual contamination is likely.
      result.truePerBuildingSuppressionAvailable  = result.editableVisualIsolationAchieved;

      if (!hostLayerPresent) {
        result.visualAuthorityState = 'EDITABLE_BUILDING_HOST_LAYER_UNAVAILABLE';
        result.warning = 'Editable building mode is unavailable because the WOS host-owned building layer is missing.';
      } else if (!hostLayerSuppressible) {
        result.visualAuthorityState = 'EDITABLE_BUILDING_HOST_LAYER_NOT_SUPPRESSIBLE';
        result.warning = 'Editable building mode is unavailable because the WOS host-owned building layer is not currently suppressible.';
      } else if (!importBypassed) {
        result.visualAuthorityState = 'EDITABLE_BUILDING_IMPORT_NOT_BYPASSED_AS_AUTHORITY';
        result.warning = 'Editable building mode has not bypassed imported Standard buildings as source authority.';
      } else if (contaminationLikely) {
        result.visualAuthorityState = 'EDITABLE_BUILDING_AUTHORITY_ACTIVE_BUT_VISUALLY_CONTAMINATED';
        result.warning = 'WOS host-owned buildings are editable, but imported Standard buildings may still render visually. Hide Source Building only guarantees suppression on WOS-owned layers.';
      } else {
        result.visualAuthorityState = 'EDITABLE_BUILDING_VISUAL_ISOLATION_ACTIVE';
        result.warning = null;
      }
    } catch (e) {
      result.visualAuthorityState = 'ERROR';
      result.lastError            = String(e && e.message || e);
      result.warning              = 'Editable visual isolation status failed.';
    }

    return result;
  }

  // ── 0611R: Imported building contamination detector ──────────────────────────
  // Conservative: if Mapbox Standard import exists and its building layers are not
  // proven disabled, contamination is reported as likely.
  function _detectImportedBuildingContamination(map) {
    var result = {
      importedBasemapPresent:         false,
      importedBuildingLayerReachable: false,
      contaminationLikely:            false,
      reason:                         'none',
    };

    if (!map || typeof map.getStyle !== 'function') {
      result.reason = 'map_unavailable';
      return result;
    }

    var style = null;
    try { style = map.getStyle(); } catch (e) {
      result.reason = 'style_unavailable';
      return result;
    }

    var imports = style && Array.isArray(style.imports) ? style.imports : [];
    result.importedBasemapPresent = imports.length > 0;

    if (!imports.length) {
      result.contaminationLikely = false;
      result.reason = 'no_imports';
      return result;
    }

    var flatLayerIds = (style.layers || []).map(function (l) { return l.id; });

    imports.forEach(function (imp) {
      if (!imp || !imp.data || !Array.isArray(imp.data.layers)) return;
      imp.data.layers.forEach(function (layer) {
        var id          = layer.id             || '';
        var type        = layer.type           || '';
        var sourceLayer = layer['source-layer'] || '';
        var isBuilding  = type === 'fill-extrusion' || type === 'model' ||
          /building/i.test(id) || /building/i.test(sourceLayer);
        if (isBuilding && flatLayerIds.indexOf(id) !== -1) {
          result.importedBuildingLayerReachable = true;
        }
      });
    });

    if (result.importedBuildingLayerReachable) {
      result.contaminationLikely = true;
      result.reason = 'import_building_layer_reachable_but_not_wos_owned';
    } else {
      result.contaminationLikely = true;
      result.reason = 'import_present_internal_layers_not_queryable';
    }

    return result;
  }

  function hostBuildingAuthorityStatus() {
    var map = _getMap();

    var result = {
      version:                         VERSION,
      hostAuthorityEnabled:            _hostBuildingLayerStatus.enabled,
      hostLayerId:                     WOS_HOST_BUILDING_LAYER_ID,
      hostLayerPresent:                false,
      hostLayerIndex:                  -1,
      hostSourceId:                    _hostBuildingLayerStatus.sourceId,
      hostSourceLayer:                 _hostBuildingLayerStatus.sourceLayer,
      hostSourceAccessible:            false,
      hostFeatureQueryCount:           0,
      discoveredByProjectionRuntime:   false,
      suppressionStrategy:             _state.suppressionStrategy,
      suppressionLayerCount:           _state.suppressionLayerCount,
      replacementLayerIndex:           -1,
      replacementAboveHostLayer:       false,
      importedBasemapPresent:          false,
      importedBuildingLayerReachable:  false,
      importedBuildingSuppressionStrategy: _hostBuildingLayerStatus.importBldgSuppStrategy,
      importedBuildingStillVisible:    null,   // null = not determinable programmatically
      visualAuthorityState:            'ERROR',
      lastError:                       _hostBuildingLayerStatus.lastError,
    };

    if (!map) {
      result.lastError           = 'map not available';
      result.visualAuthorityState = 'ERROR';
      console.log('[hostBuildingAuthorityStatus]', JSON.stringify(result, null, 2));
      return result;
    }

    var style = null;
    try { style = map.getStyle(); } catch (e) {
      result.lastError           = String(e && e.message || e);
      result.visualAuthorityState = 'ERROR';
      console.log('[hostBuildingAuthorityStatus]', JSON.stringify(result, null, 2));
      return result;
    }

    var layers      = (style && style.layers)  || [];
    var hostSources = (style && style.sources) || {};

    // Locate host building layer and first replacement layer
    for (var li = 0; li < layers.length; li++) {
      if (layers[li].id === WOS_HOST_BUILDING_LAYER_ID) {
        result.hostLayerPresent = true;
        result.hostLayerIndex   = li;
        result.hostSourceId     = layers[li].source          || null;
        result.hostSourceLayer  = layers[li]['source-layer'] || null;
      }
      if ((layers[li].id || '').indexOf('wos-replacement') === 0 && result.replacementLayerIndex === -1) {
        result.replacementLayerIndex = li;
      }
    }

    // Source accessible from host?
    if (result.hostSourceId && hostSources[result.hostSourceId]) result.hostSourceAccessible = true;

    // Discovered by _discoverLayers?
    result.discoveredByProjectionRuntime = _layers.some(function (l) {
      return l.id === WOS_HOST_BUILDING_LAYER_ID;
    });

    // Feature query count (proves layer is receiving tile data)
    result.hostFeatureQueryCount = _queryHostBuildingFeatureCount(map);

    // Replacement above host?
    if (result.hostLayerPresent && result.replacementLayerIndex !== -1) {
      result.replacementAboveHostLayer = result.replacementLayerIndex > result.hostLayerIndex;
    } else if (!result.hostLayerPresent && result.replacementLayerIndex !== -1) {
      result.replacementAboveHostLayer = true;  // host absent — no order constraint violated
    }

    // Imported basemap presence and whether any import building layer is in host flat list
    var styleImports = (style && Array.isArray(style.imports)) ? style.imports : [];
    result.importedBasemapPresent = styleImports.length > 0;
    var flatLayerIds = layers.map(function (l) { return l.id; });
    styleImports.forEach(function (imp) {
      if (!imp.data || !Array.isArray(imp.data.layers)) return;
      imp.data.layers.forEach(function (il) {
        var iltype = (il.type || '').toLowerCase();
        var ilsl   = ((il['source-layer']) || '').toLowerCase();
        var ilid   = (il.id || '').toLowerCase();
        var isBldg = iltype === 'fill-extrusion' || iltype === 'model' ||
                     /building/.test(ilsl) || /building/.test(ilid);
        if (isBldg && flatLayerIds.indexOf(il.id) !== -1) {
          result.importedBuildingLayerReachable = true;
        }
      });
    });

    // Determine visual authority state
    if (!result.hostLayerPresent) {
      result.visualAuthorityState = 'HOST_AUTHORITY_UNAVAILABLE';
      result.hostAuthorityEnabled = false;
    } else if (result.importedBasemapPresent) {
      // Conservative: assume imported buildings remain visible unless
      // importedBuildingLayerReachable is true and we confirmed hiding them.
      result.importedBuildingStillVisible = !result.importedBuildingLayerReachable ||
        _hostBuildingLayerStatus.importBldgSuppStrategy === 'none';
      result.visualAuthorityState = result.importedBuildingStillVisible
        ? 'HOST_AUTHORITY_ACTIVE_IMPORTED_CONTAMINATION'
        : 'HOST_AUTHORITY_CLEAN';
      result.hostAuthorityEnabled = true;
    } else {
      result.importedBuildingStillVisible = false;
      result.visualAuthorityState         = 'HOST_AUTHORITY_CLEAN';
      result.hostAuthorityEnabled         = true;
    }

    // 0611R: expose current authority mode and suppression availability
    result.buildingAuthorityMode = _buildingAuthorityMode;
    result.truePerBuildingSuppressionAvailable =
      _buildingAuthorityMode === BUILDING_AUTHORITY_MODES.EDITABLE_BUILDING &&
      result.hostLayerPresent &&
      result.discoveredByProjectionRuntime &&
      !result.importedBuildingStillVisible;

    console.log('[hostBuildingAuthorityStatus] ══════════════════════════════════════');
    console.log('[hostBuildingAuthorityStatus] visualAuthorityState:', result.visualAuthorityState);
    console.log('[hostBuildingAuthorityStatus] hostLayerPresent:', result.hostLayerPresent,
      '| index:', result.hostLayerIndex,
      '| source:', result.hostSourceId + ':' + result.hostSourceLayer,
      '| accessible:', result.hostSourceAccessible);
    console.log('[hostBuildingAuthorityStatus] hostFeatureQueryCount:', result.hostFeatureQueryCount,
      '| discoveredByRuntime:', result.discoveredByProjectionRuntime,
      '| suppressionStrategy:', result.suppressionStrategy);
    console.log('[hostBuildingAuthorityStatus] replacementAboveHost:', result.replacementAboveHostLayer,
      '| importPresent:', result.importedBasemapPresent,
      '| importBldgReachable:', result.importedBuildingLayerReachable,
      '| importBldgStillVisible:', result.importedBuildingStillVisible);
    console.log('[hostBuildingAuthorityStatus] FULL REPORT:');
    console.log(JSON.stringify(result, null, 2));
    return result;
  }

  // ── 0611R: Building authority mode public API ─────────────────────────────────

  function getBuildingAuthorityMode() {
    return _buildingAuthorityMode;
  }

  function setBuildingAuthorityMode(mode) {
    if (mode !== BUILDING_AUTHORITY_MODES.STANDARD_IMPORT &&
        mode !== BUILDING_AUTHORITY_MODES.EDITABLE_BUILDING) {
      return {
        ok:      false,
        mode:    _buildingAuthorityMode,
        error:   'invalid_building_authority_mode',
        allowed: [BUILDING_AUTHORITY_MODES.STANDARD_IMPORT, BUILDING_AUTHORITY_MODES.EDITABLE_BUILDING],
      };
    }

    _buildingAuthorityMode              = mode;
    _buildingAuthorityState.mode        = mode;
    _buildingAuthorityState.lastChangedAt = Date.now();
    _buildingAuthorityState.lastError   = null;

    var map = _getMap();
    if (map) {
      try {
        // 0611S: if switching to editable mode, apply the import bypass first
        if (_isEditableBuildingMode()) {
          _applyEditableBuildingBypass(map);
        }
        _ensureHostBuildingLayer(map);
        _discoverLayers(map);
        _apply(map);
        _ensureReplacementAboveHostLayer(map);
      } catch (e) {
        _buildingAuthorityState.lastError = String(e && e.message || e);
      }
    }

    return buildingAuthorityStatus();
  }

  function buildingAuthorityStatus() {
    var map = _getMap();
    var result = {
      version:                             VERSION,
      mode:                                _buildingAuthorityMode,
      hostLayerId:                         WOS_HOST_BUILDING_LAYER_ID,
      hostLayerPresent:                    false,
      hostLayerSuppressible:               false,
      hostFeatureQueryCount:               0,
      suppressionStrategy:                 _state.suppressionStrategy,
      suppressionLayerCount:               _state.suppressionLayerCount,
      importedBasemapPresent:              false,
      importedBuildingContamination:       null,
      truePerBuildingSuppressionAvailable: false,
      visualAuthorityState:                'ERROR',
      warning:                             null,
      lastChangedAt:                       _buildingAuthorityState.lastChangedAt,
      lastError:                           _buildingAuthorityState.lastError,
    };

    if (!map) {
      result.lastError = 'map not available';
      return result;
    }

    try {
      var hostStatus   = hostBuildingAuthorityStatus();
      var contamination = _detectImportedBuildingContamination(map);

      result.hostLayerPresent       = !!hostStatus.hostLayerPresent;
      result.hostLayerSuppressible  = !!hostStatus.discoveredByProjectionRuntime &&
                                      hostStatus.suppressionStrategy === 'extrusion-height-suppression';
      result.hostFeatureQueryCount  = hostStatus.hostFeatureQueryCount;
      result.suppressionStrategy    = hostStatus.suppressionStrategy;
      result.suppressionLayerCount  = hostStatus.suppressionLayerCount;
      result.importedBasemapPresent = contamination.importedBasemapPresent;
      result.importedBuildingContamination = contamination;

      if (!result.hostLayerPresent) {
        result.visualAuthorityState               = 'HOST_LAYER_UNAVAILABLE';
        result.truePerBuildingSuppressionAvailable = false;
        result.warning = 'Host-owned building layer is unavailable. WOS cannot guarantee building suppression.';
      } else if (_buildingAuthorityMode === BUILDING_AUTHORITY_MODES.STANDARD_IMPORT) {
        result.truePerBuildingSuppressionAvailable = false;
        result.visualAuthorityState = contamination.contaminationLikely
          ? 'STANDARD_IMPORT_CONTAMINATED'
          : 'STANDARD_IMPORT_PARTIAL_AUTHORITY';
        result.warning = 'Standard import mode keeps Mapbox Standard buildings. Hide Source Building is not guaranteed to remove imported basemap geometry in standard-import-mode.';
      } else if (_buildingAuthorityMode === BUILDING_AUTHORITY_MODES.EDITABLE_BUILDING) {
        // 0611T: use centralized isolation helper — separates data authority from visual isolation.
        // truePerBuildingSuppressionAvailable is only true when visual isolation is also achieved.
        var isolation = _computeEditableVisualIsolationStatus(
          map,
          hostStatus,
          contamination,
          _editableBuildingBypassState
        );

        result.editableDataAuthorityActive           = isolation.editableDataAuthorityActive;
        result.editableVisualIsolationAchieved       = isolation.editableVisualIsolationAchieved;
        result.importedVisualContaminationLikely     = isolation.importedVisualContaminationLikely;
        result.importedBuildingsBypassedAsAuthority  = isolation.importedBuildingsBypassedAsAuthority;
        result.truePerBuildingSuppressionAvailable   = isolation.truePerBuildingSuppressionAvailable;
        result.visualAuthorityState                  = isolation.visualAuthorityState;
        result.warning                               = isolation.warning;
        result.lastError                             = isolation.lastError || result.lastError;
      }
    } catch (e) {
      result.visualAuthorityState = 'ERROR';
      result.lastError = String(e && e.message || e);
    }

    _buildingAuthorityState.mode                                = result.mode;
    _buildingAuthorityState.hostLayerPresent                    = result.hostLayerPresent;
    _buildingAuthorityState.hostLayerSuppressible               = result.hostLayerSuppressible;
    _buildingAuthorityState.importedBasemapPresent              = result.importedBasemapPresent;
    _buildingAuthorityState.importedBuildingContamination       = result.importedBuildingContamination;
    _buildingAuthorityState.truePerBuildingSuppressionAvailable = result.truePerBuildingSuppressionAvailable;
    _buildingAuthorityState.visualAuthorityState                = result.visualAuthorityState;
    _buildingAuthorityState.lastError                           = result.lastError;

    console.log('[BuildingEditProjectionRuntime] buildingAuthorityStatus:', JSON.stringify(result, null, 2));
    return result;
  }

  // ── 0611S: Editable building bypass status debug method ──────────────────────

  function editableBuildingBypassStatus() {
    var authorityStatus = buildingAuthorityStatus();
    var snap = {
      mode:                              _buildingAuthorityMode,
      active:                            _editableBuildingBypassState.active,
      hostLayerReady:                    _editableBuildingBypassState.hostLayerReady,
      hostLayerSuppressible:             _editableBuildingBypassState.hostLayerSuppressible,
      importBypassedAsAuthority:         _editableBuildingBypassState.importBypassedAsAuthority,
      importedVisualContaminationLikely: _editableBuildingBypassState.importedVisualContaminationLikely,
      truePerBuildingSuppressionAvailable: authorityStatus.truePerBuildingSuppressionAvailable,
      visualAuthorityState:              authorityStatus.visualAuthorityState,
      lastAppliedAt:                     _editableBuildingBypassState.lastAppliedAt,
      lastError:                         _editableBuildingBypassState.lastError,
    };
    console.log('[BuildingEditProjectionRuntime] editableBuildingBypassStatus:', JSON.stringify(snap, null, 2));
    return snap;
  }

  // ── 0611T: Editable visual isolation public status method ────────────────────

  function editableVisualIsolationStatus() {
    var map = _getMap();
    var result = {
      mode:                                 _buildingAuthorityMode,
      hostLayerPresent:                     false,
      hostLayerSuppressible:                false,
      editableDataAuthorityActive:          false,
      editableVisualIsolationAchieved:      false,
      importedBuildingsBypassedAsAuthority: false,
      importedVisualContaminationLikely:    false,
      truePerBuildingSuppressionAvailable:  false,
      visualAuthorityState:                 'ERROR',
      warning:                              null,
      lastCheckedAt:                        Date.now(),
      lastError:                            null,
    };

    try {
      if (!map) throw new Error('map_not_available');

      var hostStatus    = hostBuildingAuthorityStatus();
      var contamination = _detectImportedBuildingContamination(map);
      var isolation     = _computeEditableVisualIsolationStatus(
        map, hostStatus, contamination, _editableBuildingBypassState
      );

      result.hostLayerPresent       = !!hostStatus.hostLayerPresent;
      result.hostLayerSuppressible  = !!(
        hostStatus.discoveredByProjectionRuntime &&
        hostStatus.suppressionStrategy === 'extrusion-height-suppression'
      );
      result.editableDataAuthorityActive          = isolation.editableDataAuthorityActive;
      result.editableVisualIsolationAchieved      = isolation.editableVisualIsolationAchieved;
      result.importedBuildingsBypassedAsAuthority = isolation.importedBuildingsBypassedAsAuthority;
      result.importedVisualContaminationLikely    = isolation.importedVisualContaminationLikely;
      result.truePerBuildingSuppressionAvailable  = isolation.truePerBuildingSuppressionAvailable;
      result.visualAuthorityState                 = isolation.visualAuthorityState;
      result.warning                              = isolation.warning;
      result.lastError                            = isolation.lastError;
    } catch (e) {
      result.lastError            = String(e && e.message || e);
      result.visualAuthorityState = 'ERROR';
      result.warning              = 'Editable visual isolation status failed.';
    }

    _editableVisualIsolationState.editableDataAuthorityActive          = result.editableDataAuthorityActive;
    _editableVisualIsolationState.editableVisualIsolationAchieved      = result.editableVisualIsolationAchieved;
    _editableVisualIsolationState.importedBuildingsBypassedAsAuthority = result.importedBuildingsBypassedAsAuthority;
    _editableVisualIsolationState.importedVisualContaminationLikely    = result.importedVisualContaminationLikely;
    _editableVisualIsolationState.truePerBuildingSuppressionAvailable  = result.truePerBuildingSuppressionAvailable;
    _editableVisualIsolationState.visualAuthorityState                 = result.visualAuthorityState;
    _editableVisualIsolationState.lastCheckedAt                        = result.lastCheckedAt;
    _editableVisualIsolationState.lastError                            = result.lastError;

    console.log('[BuildingEditProjectionRuntime] editableVisualIsolationStatus:', JSON.stringify(result, null, 2));
    return result;
  }

  // ── 0611U: Visual isolation resolution helpers ────────────────────────────────

  // _waitMs — simple Promise-based delay.
  function _waitMs(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms || 0); });
  }

  // _waitForStyleLoad — resolves when map.isStyleLoaded() becomes true,
  // or rejects after timeoutMs. Polls via map.once('styledata', ...).
  function _waitForStyleLoad(map, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var t = timeoutMs || 5000;
      var tid = setTimeout(function () { reject(new Error('style_load_timeout')); }, t);
      function check() {
        var loaded = false;
        try { loaded = !!map.isStyleLoaded(); } catch (e) {}
        if (loaded) { clearTimeout(tid); resolve(); return; }
        try {
          map.once('styledata', function () {
            var l = false;
            try { l = !!map.isStyleLoaded(); } catch (e) {}
            if (l) { clearTimeout(tid); resolve(); } else { check(); }
          });
        } catch (e) { clearTimeout(tid); reject(e); }
      }
      check();
    });
  }

  // _sampleVisualIsolationPixel — samples one pixel at the probe location using
  // WebGL readPixels inside a render callback.  Returns a Promise.
  // Probe priority: first manifest-building centroid → screen center.
  function _sampleVisualIsolationPixel(map) {
    return new Promise(function (resolve) {
      var result = {
        x: 0, y: 0,
        rgba: { r: -1, g: -1, b: -1, a: -1 },
        allZero: false,
        source: 'screen-center',
        error: null,
      };

      if (!map) { result.error = 'map_not_available'; resolve(result); return; }

      // Determine probe point
      try {
        var canvas = map.getCanvas();
        var cw = canvas.clientWidth  || canvas.width  || 800;
        var ch = canvas.clientHeight || canvas.height || 600;
        result.x = Math.round(cw / 2);
        result.y = Math.round(ch / 2);

        // Try manifest-building centroid first
        if (_manifest && _manifest.buildings) {
          var mKeys = Object.keys(_manifest.buildings);
          for (var mi = 0; mi < mKeys.length; mi++) {
            var medit = _manifest.buildings[mKeys[mi]];
            if (!medit) continue;
            var doCheck = medit.hidden || (medit.replacement && medit.replacement.enabled);
            if (!doCheck) continue;
            var mg = medit.geometry;
            if (!mg || !mg.centroid ||
                typeof mg.centroid.lng !== 'number' ||
                typeof mg.centroid.lat !== 'number') continue;
            try {
              var pt = map.project([mg.centroid.lng, mg.centroid.lat]);
              result.x = Math.round(pt.x);
              result.y = Math.round(pt.y);
              result.source = 'manifest-building';
            } catch (e) {}
            break;
          }
        }
      } catch (e) { result.error = String(e && e.message || e); resolve(result); return; }

      try {
        map.triggerRepaint();
        map.once('render', function () {
          try {
            var gl = map.getCanvas().getContext('webgl') ||
                     map.getCanvas().getContext('webgl2') ||
                     map.getCanvas().getContext('experimental-webgl');
            if (!gl) { result.error = 'webgl_context_unavailable'; resolve(result); return; }
            var ch2 = gl.drawingBufferHeight;
            var px = new Uint8Array(4);
            // WebGL y-axis is flipped relative to DOM
            gl.readPixels(result.x, ch2 - result.y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
            result.rgba  = { r: px[0], g: px[1], b: px[2], a: px[3] };
            result.allZero = (px[0] === 0 && px[1] === 0 && px[2] === 0 && px[3] === 0);
          } catch (e) {
            result.error = String(e && e.message || e);
          }
          resolve(result);
        });
      } catch (e) {
        result.error = String(e && e.message || e);
        resolve(result);
      }
    });
  }

  // _captureIsolationSnapshot — async composite snapshot of all isolation signals.
  function _captureIsolationSnapshot(map) {
    return _sampleVisualIsolationPixel(map).then(function (pixelProbe) {
      return {
        editableVisualIsolationStatus: editableVisualIsolationStatus(),
        buildingAuthorityStatus:       buildingAuthorityStatus(),
        hostBuildingAuthorityStatus:   hostBuildingAuthorityStatus(),
        pixelProbe:                    pixelProbe,
        hostFeatureQueryCount:         _queryHostBuildingFeatureCount(map),
      };
    });
  }

  // _restoreStyleAndReapply — calls map.setStyle(originalStyle) then waits for
  // style load and re-runs the convergence chain.
  function _restoreStyleAndReapply(map, originalStyle, waitMs) {
    return new Promise(function (resolve, reject) {
      try {
        map.setStyle(originalStyle);
      } catch (e) { reject(e); return; }
      _waitForStyleLoad(map, 8000).then(function () {
        return _waitMs(waitMs || 500);
      }).then(function () {
        try {
          _ensureHostBuildingLayer(map);
          _discoverLayers(map);
          _apply(map);
          _ensureReplacementAboveHostLayer(map);
          resolve();
        } catch (e) { reject(e); }
      }).catch(reject);
    });
  }

  // ── 0611U: resolveEditableVisualIsolation ─────────────────────────────────────
  //
  // Async. Runs each resolution strategy in order and returns a comprehensive
  // report with a final classification and next-architecture recommendation.
  //
  // Options:
  //   testStyleReload  {boolean}  default false — run Strategy A (style reload test)
  //   destructive      {boolean}  default false — required alongside testStyleReload
  //   keepCandidateStyle {boolean} default false — do not restore original style if A passes
  //   waitMs           {number}   default 1000  — ms to wait after each async action
  //
  // Call forms:
  //   await resolveEditableVisualIsolation()
  //   await resolveEditableVisualIsolation({ testStyleReload: true, destructive: true })
  //   _wos.debug.buildingEdits.resolveEditableVisualIsolation()
  //   SBE.BuildingEditProjectionRuntime.resolveEditableVisualIsolation()
  //
  function resolveEditableVisualIsolation(options) {
    var opts = options || {};
    var testStyleReload   = opts.testStyleReload   === true;
    var destructive       = opts.destructive       === true;
    var keepCandidate     = opts.keepCandidateStyle === true;
    var waitMs            = typeof opts.waitMs === 'number' ? opts.waitMs : 1000;

    var startedAt = Date.now();

    var map = _getMap();

    var report = {
      version:                          VERSION,
      mode:                             _buildingAuthorityMode,
      destructiveAllowed:               destructive,
      styleReloadTested:                false,
      startedAt:                        startedAt,
      completedAt:                      null,
      before:                           null,
      strategies:                       [],
      after:                            null,
      finalClassification:              'VISUAL_ISOLATION_UNRESOLVABLE_WITH_STANDARD_IMPORT',
      editableVisualIsolationAchieved:  false,
      truePerBuildingSuppressionAvailable: false,
      recommendation:                   null,
      lastError:                        null,
    };

    if (!map) {
      report.lastError           = 'map not available';
      report.finalClassification = 'ERROR';
      report.completedAt         = Date.now();
      return Promise.resolve(report);
    }

    var originalStyle = null;
    try { originalStyle = JSON.parse(JSON.stringify(map.getStyle())); } catch (e) {
      report.lastError           = 'getStyle failed: ' + String(e && e.message || e);
      report.finalClassification = 'ERROR';
      report.completedAt         = Date.now();
      return Promise.resolve(report);
    }

    // ── Before snapshot ───────────────────────────────────────────────────────
    return _captureIsolationSnapshot(map).then(function (beforeSnap) {
      report.before = beforeSnap;

      // ── Strategy A: Standard import config reload test ───────────────────
      var strategyA = {
        id:            'A',
        name:          'standard-import-config-reload-test',
        attempted:     false,
        skippedReason: null,
        passed:        false,
        before:        null,
        after:         null,
        error:         null,
      };
      report.strategies.push(strategyA);

      var strategyAPromise;
      if (!testStyleReload || !destructive) {
        strategyA.skippedReason = !testStyleReload
          ? 'testStyleReload_not_requested'
          : 'destructive_mode_not_enabled';
        strategyAPromise = Promise.resolve();
      } else {
        strategyA.attempted = true;
        report.styleReloadTested = true;
        strategyA.before = beforeSnap;

        var candidateStyle = null;
        try {
          candidateStyle = JSON.parse(JSON.stringify(originalStyle));
          var buildingKeys = ['show3dBuildings', 'show3dFacades', 'show3dObjects',
                              'show3dLandmarks', 'showIndoor', 'show3dTrees'];
          if (Array.isArray(candidateStyle.imports)) {
            candidateStyle.imports.forEach(function (imp) {
              if (!imp.config) imp.config = {};
              buildingKeys.forEach(function (k) { imp.config[k] = false; });
            });
          }
        } catch (e) {
          strategyA.error = 'candidate_style_clone_failed: ' + String(e && e.message || e);
          strategyAPromise = Promise.resolve();
        }

        if (!strategyA.error) {
          strategyAPromise = new Promise(function (resolveA) {
            try {
              map.setStyle(candidateStyle);
            } catch (e) {
              strategyA.error = 'setStyle failed: ' + String(e && e.message || e);
              resolveA(); return;
            }
            _waitForStyleLoad(map, 8000)
              .then(function () { return _waitMs(waitMs); })
              .then(function () {
                _ensureHostBuildingLayer(map);
                _discoverLayers(map);
                _apply(map);
                _ensureReplacementAboveHostLayer(map);
                return _captureIsolationSnapshot(map);
              })
              .then(function (afterA) {
                strategyA.after = afterA;
                strategyA.passed = !!(
                  afterA.editableVisualIsolationStatus &&
                  afterA.editableVisualIsolationStatus.editableVisualIsolationAchieved
                );
                if (!strategyA.passed && !keepCandidate) {
                  // Restore original style
                  return _restoreStyleAndReapply(map, originalStyle, waitMs)
                    .catch(function (e) {
                      strategyA.error = (strategyA.error || '') +
                        ' | restore failed: ' + String(e && e.message || e);
                    });
                }
              })
              .catch(function (e) {
                strategyA.error = String(e && e.message || e);
                if (!keepCandidate) {
                  return _restoreStyleAndReapply(map, originalStyle, waitMs).catch(function () {});
                }
              })
              .then(function () { resolveA(); });
          });
        }
      }

      return strategyAPromise;
    })

    // ── Strategy B: non-3D basemap feasibility audit ──────────────────────
    .then(function () {
      var strategyB = {
        id:        'B',
        name:      'non-3d-basemap-replacement-feasibility',
        attempted: true,
        passed:    false,
        audit:     null,
        error:     null,
      };
      report.strategies.push(strategyB);

      try {
        var style        = map.getStyle();
        var importUrls   = [];
        var hasSources   = !!(style.sources && Object.keys(style.sources).length > 0);
        var hasLayers    = !!(style.layers  && style.layers.length > 0);
        var hasImports   = Array.isArray(style.imports) && style.imports.length > 0;

        if (hasImports) {
          style.imports.forEach(function (imp) {
            if (imp.url) importUrls.push(imp.url);
          });
        }

        strategyB.audit = {
          importUrls:           importUrls,
          hasSources:           hasSources,
          hasLayers:            hasLayers,
          hasImports:           hasImports,
          compositeAccessible:  !!(style.sources && style.sources['composite']),
          recommendation:       'USE_NON_3D_BASEMAP_PLUS_WOS_HOST_BUILDINGS',
          feasible:             true,
          notes: [
            'Replace Standard import with a flat (non-3D) basemap for editable-building-mode.',
            'WOS host-owned fill-extrusion layer (wos-host-buildings-3d) continues to own building geometry.',
            'Flat basemap provides land, water, roads, labels without 3D building contamination.',
            'Standard import remains available for standard-import-mode (cinematic).',
          ],
        };

        // B never "passes" because it is audit-only — feasible but not yet applied.
        strategyB.passed = false;
      } catch (e) {
        strategyB.error = String(e && e.message || e);
      }
    })

    // ── Strategy C: host-owned building authority validation ──────────────
    .then(function () {
      var strategyC = {
        id:                 'C',
        name:               'host-owned-building-authority-validation',
        attempted:          true,
        passed:             false,
        hostLayerPresent:   false,
        hostLayerSuppressible: false,
        replacementAbove:   false,
        hostQueryCount:     -1,
        classification:     null,
        error:              null,
      };
      report.strategies.push(strategyC);

      try {
        var hStatus = hostBuildingAuthorityStatus();
        strategyC.hostLayerPresent    = !!hStatus.hostLayerPresent;
        strategyC.hostLayerSuppressible = !!hStatus.discoveredByProjectionRuntime &&
          hStatus.suppressionStrategy === 'extrusion-height-suppression';
        strategyC.replacementAbove    = !!hStatus.replacementAboveHostLayer;
        strategyC.hostQueryCount      = _queryHostBuildingFeatureCount(map);

        var hostReady = strategyC.hostLayerPresent && strategyC.hostLayerSuppressible;
        strategyC.passed = hostReady;
        strategyC.classification = hostReady
          ? 'HOST_BUILDING_AUTHORITY_READY_VISUAL_ISOLATION_BLOCKED'
          : 'HOST_BUILDING_AUTHORITY_NOT_READY';
      } catch (e) {
        strategyC.error = String(e && e.message || e);
      }
    })

    // ── After snapshot + final classification ─────────────────────────────
    .then(function () {
      return _captureIsolationSnapshot(map);
    })
    .then(function (afterSnap) {
      report.after = afterSnap;

      // Check if Strategy A succeeded (style reload worked)
      var stratA = report.strategies[0];
      if (stratA && stratA.passed) {
        report.finalClassification               = 'EDITABLE_BUILDING_VISUAL_ISOLATION_ACTIVE';
        report.editableVisualIsolationAchieved   = true;
        report.truePerBuildingSuppressionAvailable = true;
        report.recommendation = {
          mode:         'editable-building-mode',
          architecture: 'STANDARD_IMPORT_CONFIG_RELOAD_RESOLVED',
          nextPatchId:  null,
          rationale:    'Standard import config reload disabled imported 3D buildings. Editable visual isolation is now active.',
        };
      } else {
        // Neither A nor C could achieve clean visual isolation
        report.finalClassification               = 'VISUAL_ISOLATION_UNRESOLVABLE_WITH_STANDARD_IMPORT';
        report.editableVisualIsolationAchieved   = false;
        report.truePerBuildingSuppressionAvailable = false;
        report.recommendation = {
          mode:         'editable-building-mode',
          architecture: 'NON_3D_BASEMAP_PLUS_WOS_HOST_BUILDINGS',
          nextPatchId:  '0611V_WOS_EditableModeNon3DBasemapAuthority_v1.0.0_BUILD',
          rationale:    'Imported Mapbox Standard buildings remain visually uncontrollable; ' +
            'WOS host building layer works but cannot visually isolate while Standard 3D remains. ' +
            'Replace Standard import for editable mode with a non-3D basemap or custom decomposed style. ' +
            'Keep Standard import only for cinematic (standard-import-mode).',
        };
      }

      report.completedAt = Date.now();

      console.log('[BuildingEditProjectionRuntime] resolveEditableVisualIsolation CLASSIFICATION:', report.finalClassification);
      console.log('[BuildingEditProjectionRuntime] resolveEditableVisualIsolation RECOMMENDATION:', report.recommendation.architecture);
      if (report.finalClassification === 'VISUAL_ISOLATION_UNRESOLVABLE_WITH_STANDARD_IMPORT') {
        console.warn('[BuildingEditProjectionRuntime] resolveEditableVisualIsolation:',
          'Editable building mode cannot achieve clean visual isolation while the current Mapbox Standard import remains active.');
      }
      console.log('[BuildingEditProjectionRuntime] resolveEditableVisualIsolation FULL REPORT:');
      console.log(JSON.stringify(report, null, 2));

      return report;
    })
    .catch(function (e) {
      report.lastError       = String(e && e.message || e);
      report.finalClassification = 'ERROR';
      report.completedAt     = Date.now();
      console.warn('[BuildingEditProjectionRuntime] resolveEditableVisualIsolation error:', report.lastError);
      return report;
    });
  }

  // ── auditMapboxStyleSourceDecomposition — 0611P read-only architectural audit ──
  //
  // Answers: can WOS suppress individual buildings in this style, and if not,
  // which architectural change would make it possible?
  //
  // Call:
  //   auditMapboxStyleSourceDecomposition()
  //   _wos.debug.buildingEdits.auditMapboxStyleSourceDecomposition()
  //
  // Does NOT mutate map state. Read-only.
  //
  // What it inspects:
  //  Host style:
  //    getStyle().imports      — all imports with id/url/config/data
  //    getStyle().sources      — host-style tile sources
  //    getStyle().layers       — host-style flat layer list
  //  For each import[i].data:
  //    data.schema             — config keys the import exposes
  //    data.sources            — tile sources declared inside the import
  //    data.layers             — ALL layers inside the import, specifically:
  //       fill-extrusion layers   (3D buildings in classic Standard)
  //       model layers            (3D buildings in v3 Standard)
  //       layers with source-layer containing "building"
  //       layers with id containing "building"
  //
  // Architectural options evaluated:
  //  A. CLONE_LAYERS_TO_HOST — copy building fill-extrusion layers from import.data
  //     into the host style, bring the tile source along, suppress normally.
  //     Feasible if import.data.layers contains fill-extrusion building layers.
  //  B. DISABLE_IMPORT_INTERNAL_LAYERS — call setLayoutProperty('visibility','none')
  //     on imported layer IDs. Feasible only if those layer IDs are in getStyle().layers
  //     (they are not in the current version — this path will likely fail).
  //  C. REPLACE_WITH_CUSTOM_STYLE — download Standard JSON, strip building layers or
  //     add show3dBuildings to schema, host as custom URL. Always feasible, high ops cost.
  //  D. KEEP_IMPORT_ADD_OVERLAY — keep Standard import for everything, add a solid-colour
  //     fill-extrusion overlay layer from the same composite source. Overlay renders on top
  //     of Standard buildings for replacements; for hidden buildings, paint overlay black
  //     with height=original to occlude but not suppress. Feasible if composite source is
  //     accessible from host style.
  //
  // Recommendation matrix (returned in report.recommendation):
  //  Editable WOS map mode:     A (clone) or D (overlay) depending on feasibility
  //  Basemap cinematic mode:    D (overlay, colour=sky) — hides buildings with same-sky paint
  //  Hybrid mode:               A for suppression + Standard import for all non-building layers
  //
  // Output fields:
  //  hostSources        — keys from getStyle().sources
  //  hostLayerCount     — total layers in flat host layer list
  //  hostBuildingLayers — host layers with fill-extrusion type or "building" in id/source-layer
  //  imports[]          — per-import breakdown (see below)
  //  compositeSourceAccessible — whether 'composite' source is in host style
  //  architecturalOptions[]    — A/B/C/D with feasibility and reasoning
  //  recommendation            — { mode, option, rationale, nextPatchId }

  function auditMapboxStyleSourceDecomposition() {
    var map = _getMap();

    var report = {
      timestamp:               new Date().toISOString(),
      version:                 VERSION,
      // ── Host style ──────────────────────────────────────────────────────────
      hostSources:             [],
      hostLayerCount:          0,
      hostBuildingLayers:      [],
      hostWosLayers:           [],
      compositeSourceAccessible: false,
      // ── Imports ─────────────────────────────────────────────────────────────
      imports:                 [],
      // ── Architectural options ────────────────────────────────────────────────
      architecturalOptions:    [],
      // ── Recommendation ───────────────────────────────────────────────────────
      recommendation:          null,
    };

    if (!map) {
      report.recommendation = { error: 'map not available' };
      console.log('[auditMapboxStyleSourceDecomposition]', JSON.stringify(report, null, 2));
      return report;
    }

    // ── Host style inspection ──────────────────────────────────────────────────
    var style = null;
    try { style = map.getStyle(); } catch (e) {}

    var hostSources = (style && style.sources) ? Object.keys(style.sources) : [];
    var hostLayers  = (style && style.layers)  ? style.layers : [];
    report.hostSources    = hostSources;
    report.hostLayerCount = hostLayers.length;
    report.compositeSourceAccessible = hostSources.indexOf('composite') !== -1;

    hostLayers.forEach(function (l) {
      var lid   = (l.id             || '').toLowerCase();
      var sl    = (l['source-layer'] || '').toLowerCase();
      var ltype =  l.type            || '';
      var pk    = l.paint  ? Object.keys(l.paint)  : [];
      var lk    = l.layout ? Object.keys(l.layout) : [];
      var entry = { id: l.id, type: ltype, source: l.source || null,
                    sourceLayer: l['source-layer'] || null, paintKeys: pk, layoutKeys: lk };
      if (ltype === 'fill-extrusion' || /building/.test(lid) || /building/.test(sl)) {
        report.hostBuildingLayers.push(entry);
      }
      if (lid.indexOf('wos-') === 0) {
        report.hostWosLayers.push(entry);
      }
    });

    console.log('[auditMapboxStyleSourceDecomposition] host sources:', hostSources);
    console.log('[auditMapboxStyleSourceDecomposition] host layers:', hostLayers.length,
      '| building:', report.hostBuildingLayers.length,
      '| wos:', report.hostWosLayers.length,
      '| composite accessible:', report.compositeSourceAccessible);

    // ── Per-import deep inspection ─────────────────────────────────────────────
    var styleImports = (style && Array.isArray(style.imports)) ? style.imports : [];

    styleImports.forEach(function (imp, idx) {
      var impData = imp.data || null;
      var impSources = {};
      var impLayers  = [];

      if (impData) {
        if (impData.sources && typeof impData.sources === 'object') impSources = impData.sources;
        if (Array.isArray(impData.layers)) impLayers = impData.layers;
      }

      // Classify every layer in the import data
      var impFillExtrusionLayers = [];
      var impModelLayers         = [];
      var impBuildingNamedLayers = [];
      var impBuildingSummary     = [];

      impLayers.forEach(function (l) {
        var lid   = (l.id              || '').toLowerCase();
        var sl    = (l['source-layer'] || '').toLowerCase();
        var ltype =  l.type             || '';
        var pk    = l.paint  ? Object.keys(l.paint)  : [];
        var lk    = l.layout ? Object.keys(l.layout) : [];
        var entry = {
          id:          l.id,
          type:        ltype,
          source:      l.source          || null,
          sourceLayer: l['source-layer'] || null,
          minzoom:     l.minzoom  != null ? l.minzoom  : null,
          maxzoom:     l.maxzoom  != null ? l.maxzoom  : null,
          paintKeys:   pk,
          layoutKeys:  lk,
          // Snapshot height paint value to understand suppression feasibility
          heightValue: (l.paint && l.paint['fill-extrusion-height'] !== undefined)
                       ? l.paint['fill-extrusion-height'] : undefined,
          colorValue:  (l.paint && (l.paint['fill-extrusion-color'] || l.paint['fill-color'])) || undefined,
        };

        var isBuildingLayer = ltype === 'fill-extrusion' || ltype === 'model' ||
                              /building/.test(lid) || /building/.test(sl);

        if (ltype === 'fill-extrusion') impFillExtrusionLayers.push(entry);
        if (ltype === 'model')          impModelLayers.push(entry);
        if (isBuildingLayer)            impBuildingNamedLayers.push(entry);
        if (isBuildingLayer) {
          impBuildingSummary.push({
            id: l.id, type: ltype,
            source: l.source || null, sourceLayer: l['source-layer'] || null,
            paintKeys: pk,
          });
        }
      });

      // Schema keys
      var schemaKeys = (impData && impData.schema) ? Object.keys(impData.schema) : [];

      // Source names inside the import
      var impSourceNames = Object.keys(impSources);

      // Check whether any import source is the same as a host source (shared tile pool)
      var sharedSources = impSourceNames.filter(function (s) {
        return hostSources.indexOf(s) !== -1;
      });

      // Check whether any host layer already references an import source
      var hostLayersUsingImportSource = hostLayers.filter(function (hl) {
        return impSourceNames.indexOf(hl.source || '') !== -1;
      }).map(function (hl) { return hl.id; });

      var impEntry = {
        index:                     idx,
        id:                        imp.id     || null,
        url:                       imp.url    || null,
        configKeys:                imp.config ? Object.keys(imp.config) : [],
        configSnapshot:            null,
        schemaKeys:                schemaKeys,
        // Note that show3dBuildings/show3dFacades NOT in schema — confirmed by 0611O
        show3dBuildingsInSchema:   schemaKeys.indexOf('show3dBuildings') !== -1,
        show3dFacadesInSchema:     schemaKeys.indexOf('show3dFacades')   !== -1,
        // Data layers
        dataPresent:               !!impData,
        dataTotalLayerCount:       impLayers.length,
        dataFillExtrusionLayers:   impFillExtrusionLayers,
        dataModelLayers:           impModelLayers,
        dataBuildingNamedLayers:   impBuildingNamedLayers,
        dataBuildingSummary:       impBuildingSummary,
        dataBuildingLayerCount:    impBuildingNamedLayers.length,
        // Data sources
        dataSources:               impSourceNames,
        sharedWithHostSources:     sharedSources,
        hostLayersUsingImportSource: hostLayersUsingImportSource,
        // Import layer IDs accessible in host flat list (to test option B)
        importLayerIdsInHostStyle: [],
      };

      // Shallow config snapshot (just values, no deep objects)
      if (imp.config && typeof imp.config === 'object') {
        try { impEntry.configSnapshot = JSON.parse(JSON.stringify(imp.config)); } catch (e) {}
      }

      // Test whether any import data layer ID appears in the host flat layer list
      // (If yes, Option B — disabling imported layers via host API — might work)
      var hostLayerIds = hostLayers.map(function (hl) { return hl.id; });
      impLayers.forEach(function (il) {
        if (hostLayerIds.indexOf(il.id) !== -1) {
          impEntry.importLayerIdsInHostStyle.push(il.id);
        }
      });

      report.imports.push(impEntry);

      console.log('[auditMapboxStyleSourceDecomposition] import[' + idx + ']',
        '"' + impEntry.id + '"', impEntry.url);
      console.log('  schemaKeys:', schemaKeys.join(', ') || '(none)');
      console.log('  show3dBuildings in schema:', impEntry.show3dBuildingsInSchema);
      console.log('  data.layers total:', impLayers.length,
        '| fill-extrusion:', impFillExtrusionLayers.length,
        '| model:', impModelLayers.length,
        '| building-named:', impBuildingNamedLayers.length);
      console.log('  data.sources:', impSourceNames.join(', ') || '(none)');
      console.log('  sharedWithHostSources:', sharedSources.join(', ') || '(none)');
      console.log('  importLayerIdsInHostStyle:', impEntry.importLayerIdsInHostStyle.join(', ') || '(none)');
      if (impBuildingSummary.length) {
        console.log('  building layers in import.data:');
        impBuildingSummary.forEach(function (b) {
          console.log('    ', JSON.stringify(b));
        });
      }
    });

    // ── Primary import reference ───────────────────────────────────────────────
    var primaryImp = report.imports[0] || null;

    // ── Evaluate architectural options ────────────────────────────────────────
    // A. CLONE_LAYERS_TO_HOST
    var optionA_hasBuildingLayers   = primaryImp && primaryImp.dataFillExtrusionLayers.length > 0;
    var optionA_hasSource           = primaryImp && primaryImp.dataSources.length > 0;
    var optionA_sourceAlreadyInHost = primaryImp && primaryImp.sharedWithHostSources.length > 0;
    var optionA_feasible = !!(optionA_hasBuildingLayers || optionA_hasSource);

    report.architecturalOptions.push({
      id:        'A',
      name:      'CLONE_LAYERS_TO_HOST',
      feasible:  optionA_feasible,
      effort:    optionA_feasible ? 'MEDIUM' : 'HIGH',
      reasoning: optionA_hasBuildingLayers
        ? 'import.data.layers contains ' + (primaryImp && primaryImp.dataFillExtrusionLayers.length) +
          ' fill-extrusion layer(s) — these can be copied into the host style. ' +
          'Their tile source must also be added to the host style. ' +
          (optionA_sourceAlreadyInHost ? 'Source already shared with host — trivial.' :
            'Source is import-internal — must be re-declared in host style sources.') +
          ' Once in the host style, fill-extrusion-height suppression works as designed.'
        : primaryImp && primaryImp.dataModelLayers.length > 0
          ? 'import.data.layers has model-type building layers (Mapbox Standard v3). ' +
            'Model layers cannot use fill-extrusion-height suppression — would need model-opacity or setFeatureState.'
          : 'import.data not available or contains no fill-extrusion building layers. ' +
            'Cannot clone what is not visible via getStyle().imports[0].data. ' +
            'The Standard style JSON must be fetched directly from the Mapbox API.',
    });

    // B. DISABLE_IMPORT_INTERNAL_LAYERS
    var optionB_layersAccessible = primaryImp && primaryImp.importLayerIdsInHostStyle.length > 0;

    report.architecturalOptions.push({
      id:        'B',
      name:      'DISABLE_IMPORT_INTERNAL_LAYERS',
      feasible:  optionB_layersAccessible,
      effort:    'LOW',
      reasoning: optionB_layersAccessible
        ? 'Some import data layer IDs appear in the host style flat layer list: [' +
          (primaryImp && primaryImp.importLayerIdsInHostStyle.join(', ')) + ']. ' +
          'map.setLayoutProperty(id, "visibility", "none") may work for these. Test immediately.'
        : 'No import data layer IDs appear in getStyle().layers. ' +
          'Mapbox GL JS v3 does not expose imported layers in the host flat layer list — ' +
          'setLayoutProperty cannot reach them. This option is not viable.',
    });

    // C. REPLACE_WITH_CUSTOM_STYLE
    var optionC_importUrl = primaryImp && primaryImp.url;

    report.architecturalOptions.push({
      id:        'C',
      name:      'REPLACE_WITH_CUSTOM_STYLE',
      feasible:  true,   // always feasible, just requires effort
      effort:    'HIGH',
      reasoning: 'Fetch ' + (optionC_importUrl || 'the Standard style JSON') +
        ' from the Mapbox Styles API (requires access token), modify to either: ' +
        '(1) remove fill-extrusion/model building layers entirely and re-add them in the host style, or ' +
        '(2) add show3dBuildings/show3dFacades to the schema so setConfigProperty works. ' +
        'Host the modified JSON at a stable URL and update imports[0].url. ' +
        'Downsides: WOS must maintain the style JSON; automatic Mapbox Standard updates no longer propagate. ' +
        'Upside: complete control, correct schema exposure, no hacks needed.',
    });

    // D. KEEP_IMPORT_ADD_SOLID_OVERLAY
    // If composite source is accessible from host style, a host fill-extrusion layer
    // on the composite:building source-layer can be painted solid to occlude Standard buildings.
    // For "hidden" buildings: paint overlay same colour as sky/background at that height.
    // For "replacement" buildings: already handled by wos-replacement-layer on top.
    var optionD_compositeAccessible = report.compositeSourceAccessible;
    var optionD_buildingSourceLayer = null;
    // Try to find the building source-layer name from host layers or import layers
    var allBuildingEntries = report.hostBuildingLayers.concat(
      primaryImp ? primaryImp.dataBuildingNamedLayers : []
    );
    for (var di = 0; di < allBuildingEntries.length; di++) {
      if (allBuildingEntries[di].sourceLayer) {
        optionD_buildingSourceLayer = allBuildingEntries[di].sourceLayer;
        break;
      }
    }

    report.architecturalOptions.push({
      id:        'D',
      name:      'KEEP_IMPORT_ADD_SOLID_OVERLAY',
      feasible:  optionD_compositeAccessible,
      effort:    optionD_compositeAccessible ? 'LOW' : 'MEDIUM',
      compositeBuildingSourceLayer: optionD_buildingSourceLayer,
      reasoning: optionD_compositeAccessible
        ? '"composite" source is accessible from the host style. A new fill-extrusion layer can be ' +
          'added to the host style using source="composite", source-layer="' +
          (optionD_buildingSourceLayer || 'building') + '". ' +
          'For HIDDEN buildings: paint this overlay with fill-extrusion-height=0 match expression ' +
          '(zero-height = no rendered pixels) for suppressed IDs — same approach as current suppression. ' +
          'For REPLACEMENT buildings: wos-replacement-layer already dominates. ' +
          'The Standard import\'s buildings remain rendered underneath, but the overlay at height=0 ' +
          'causes the ID-matched features to be invisible. ' +
          'CAVEAT: composite:building features from the host-style overlay and the Standard import\'s ' +
          'internal building layer are the same tile data — if the overlay collapses height to 0, ' +
          'the import\'s layer still renders at full height for those features. ' +
          'This approach suppresses the OVERLAY\'s extrusion but NOT the Standard import\'s. ' +
          'Only works if Option A (cloned layers) replaces the Standard building rendering entirely.'
        : '"composite" source is NOT in getStyle().sources. The building tile data is only accessible ' +
          'inside the Standard import. This option requires first adding composite to the host sources.',
    });

    // ── Recommendation ─────────────────────────────────────────────────────────
    //
    // Decision tree:
    //  1. If import.data.layers has fill-extrusion building layers → Option A (clone + suppress)
    //  2. If import.data.layers has only model layers → Option C (custom style, model → fill-extrusion)
    //  3. If import.data not available → Option C (fetch Standard JSON, extract layers)
    //  4. If composite accessible and above fails → Option D as stopgap for replacement mode only
    //
    // Confirmed evidence applied here:
    //  - show3dBuildings NOT in schema → config API cannot suppress buildings
    //  - getConfigProperty always null → setConfigProperty has no effect
    //  - queryRenderedFeatures returns nothing for buildings → features are import-internal
    //  - Option B is not viable (no imported layer IDs in host flat list)

    var hasFillExtrusionInImport = primaryImp && primaryImp.dataFillExtrusionLayers.length > 0;
    var hasModelInImport         = primaryImp && primaryImp.dataModelLayers.length > 0;
    var hasDataAtAll             = primaryImp && primaryImp.dataPresent;

    var rec;

    if (hasFillExtrusionInImport) {
      rec = {
        mode:        'EDITABLE_WOS_MAP_MODE',
        option:      'A',
        confidence:  'HIGH',
        rationale:   'The Standard import contains fill-extrusion building layers in import.data.layers. ' +
          'These layers reference a tile source that can be re-declared in the host style. ' +
          'Once cloned into the host style: (1) remove or mask the Standard import\'s building layers ' +
          'by adding an identical host-style fill-extrusion layer that replaces them, then ' +
          '(2) apply fill-extrusion-height=0 match expressions per-building as designed. ' +
          'All existing _apply() / _discoverLayers() / verifySuppression() logic applies without change.',
        nextPatchId: '0611Q_WOS_FillExtrusionLayerCloneFromStandardImport',
        steps: [
          '1. Extract fill-extrusion layer definitions from imports[0].data.layers.',
          '2. Extract the tile source definition from imports[0].data.sources.',
          '3. Add the source to the host style via map.addSource() at init time.',
          '4. Add the fill-extrusion layer(s) to the host style via map.addLayer() above the Standard import slot.',
          '5. The Standard import continues to render all non-building layers (roads, labels, etc.).',
          '6. _discoverLayers() now finds the cloned fill-extrusion layer; suppression applies as normal.',
          '7. Standard import\'s internal building layer still renders underneath — it must be occluded by the cloned layer, OR the import must be replaced with a custom URL that omits the building layer.',
        ],
      };
    } else if (hasModelInImport) {
      rec = {
        mode:        'EDITABLE_WOS_MAP_MODE',
        option:      'C',
        confidence:  'HIGH',
        rationale:   'The Standard import contains model-type building layers. Model layers are not ' +
          'data-driven for height — fill-extrusion-height suppression cannot be applied to them. ' +
          'The only viable path for per-feature suppression is to replace the Standard import with ' +
          'a custom style that substitutes the model building layers with fill-extrusion layers, ' +
          'and exposes show3dBuildings/show3dFacades in the schema. ' +
          'Alternatively, if only replacement/overlay mode is needed (not full suppression), ' +
          'Option D (overlay) works for the replacement use case.',
        nextPatchId: '0611Q_WOS_CustomStandardStyleDerivative',
        steps: [
          '1. Fetch mapbox://styles/mapbox/standard via the Mapbox Styles API.',
          '2. Replace model building layers with equivalent fill-extrusion layers.',
          '3. Add show3dBuildings / show3dFacades to the schema with default:true.',
          '4. Host the modified style JSON at a stable URL.',
          '5. Update imports[0].url to point to the custom style.',
          '6. setConfigProperty now controls building visibility correctly.',
        ],
      };
    } else if (!hasDataAtAll) {
      rec = {
        mode:        'EDITABLE_WOS_MAP_MODE',
        option:      'C',
        confidence:  'MEDIUM',
        rationale:   'imports[0].data is not available in getStyle() — the Standard style JSON ' +
          'has not been surfaced by this Mapbox GL version, or the import loads asynchronously. ' +
          'Without knowing the internal layer structure, Option A cannot be attempted. ' +
          'Option C (fetch Standard JSON directly, extract and modify) is the safe path.',
        nextPatchId: '0611Q_WOS_StandardStyleFetch',
        steps: [
          '1. Fetch https://api.mapbox.com/styles/v1/mapbox/standard?access_token=TOKEN.',
          '2. Inspect the layers array for fill-extrusion building layers.',
          '3. Proceed with Option A if fill-extrusion, Option C if model.',
        ],
      };
    } else {
      // import.data present but no building layers found
      rec = {
        mode:        'BASEMAP_CINEMATIC_MODE',
        option:      'D',
        confidence:  'LOW',
        rationale:   'import.data is available but contains no fill-extrusion or model building layers. ' +
          'The Standard import may be rendering buildings through a mechanism not visible in data.layers ' +
          '(e.g. a slot, a GL extension, or a tile-side compositing pipeline). ' +
          'Without a layer handle, no programmatic suppression is possible from the host style. ' +
          'Option D (overlay) works only for the REPLACEMENT use case, not for HIDDEN buildings. ' +
          'Recommend investigating the Standard style JSON directly before proceeding.',
        nextPatchId: '0611Q_WOS_StandardStyleDirectFetch',
        steps: [
          '1. Fetch the Standard style JSON directly from the Mapbox API.',
          '2. Search for any layer type that references building geometry.',
          '3. If building geometry is tile-side only (no JS layer), suppression may be impossible without Option C.',
        ],
      };
    }

    report.recommendation = rec;

    // ── Architectural option B ruling ─────────────────────────────────────────
    // Add a definitive ruling on B since it's the simplest path if viable.
    report.optionBRuling = optionB_layersAccessible
      ? 'POTENTIALLY_VIABLE — ' + (primaryImp && primaryImp.importLayerIdsInHostStyle.length) +
        ' import layer IDs found in host style. Test immediately before proceeding with A/C.'
      : 'NOT_VIABLE — imported layer IDs are not in the host style flat layer list. ' +
        'Mapbox GL JS v3 does not expose imported layers to the host setPaintProperty/setLayoutProperty API.';

    // ── Summary log ────────────────────────────────────────────────────────────
    console.log('[auditMapboxStyleSourceDecomposition] ══════════════════════════════════════');
    console.log('[auditMapboxStyleSourceDecomposition] RECOMMENDATION:', rec.option, '—', rec.mode);
    console.log('[auditMapboxStyleSourceDecomposition] confidence:', rec.confidence);
    console.log('[auditMapboxStyleSourceDecomposition]', rec.rationale);
    console.log('[auditMapboxStyleSourceDecomposition] nextPatch:', rec.nextPatchId);
    console.log('[auditMapboxStyleSourceDecomposition] OPTION B ruling:', report.optionBRuling);
    console.log('[auditMapboxStyleSourceDecomposition] architecturalOptions:');
    report.architecturalOptions.forEach(function (o) {
      console.log('  ' + o.id + '. ' + o.name + ' — feasible:', o.feasible, '| effort:', o.effort);
      console.log('     ' + o.reasoning);
    });
    if (rec.steps) {
      console.log('[auditMapboxStyleSourceDecomposition] implementation steps:');
      rec.steps.forEach(function (s) { console.log('  ' + s); });
    }
    console.log('[auditMapboxStyleSourceDecomposition] FULL REPORT:');
    console.log(JSON.stringify(report, null, 2));
    return report;
  }

  // ── Exports ───────────────────────────────────────────────────────────────────

  SBE.BuildingEditProjectionRuntime = Object.freeze({
    VERSION:                     VERSION,
    ARCHETYPE_COLORS:            ARCHETYPE_COLORS,
    init:                        init,
    reload:                      reload,
    apply:                       apply,
    clearProjection:             clearProjection,
    status:                      status,
    suppressionStatus:           suppressionStatus,
    getSuppressionIds:           getSuppressionIds,           // 0610F — for dominance audit
    unsuppressedSourceBuildings: unsuppressedSourceBuildings, // 0610I — footprint audit
    compoundSuppressionStatus:   compoundSuppressionStatus,  // 0610K — compound suppression audit
    styleParityStatus:           styleParityStatus,           // 0610N — parity audit
    hostBuildingAuthorityStatus:          hostBuildingAuthorityStatus,          // 0611Q
    setBuildingAuthorityMode:             setBuildingAuthorityMode,             // 0611R
    getBuildingAuthorityMode:             getBuildingAuthorityMode,             // 0611R
    buildingAuthorityStatus:              buildingAuthorityStatus,              // 0611R
    editableBuildingBypassStatus:         editableBuildingBypassStatus,         // 0611S
    editableVisualIsolationStatus:        editableVisualIsolationStatus,        // 0611T
    resolveEditableVisualIsolation:       resolveEditableVisualIsolation,       // 0611U
    verifySuppression:                    verifySuppression,                    // 0611H
    auditWallBuildingRenderOwnership:     auditWallBuildingRenderOwnership,     // 0611L
    auditMapboxStandardConfig:            auditMapboxStandardConfig,            // 0611M
    auditStandardImportConfigTarget:      auditStandardImportConfigTarget,      // 0611N
    auditMapboxStandardSchemaKeyResolver: auditMapboxStandardSchemaKeyResolver, // 0611O
    auditMapboxStyleSourceDecomposition:  auditMapboxStyleSourceDecomposition,  // 0611P
  });

  // ── Self-wire debug binding and auto-initialize ───────────────────────────────
  // 0611I: create _wos / _wos.debug if absent so the binding is unconditional.
  global._wos        = global._wos        || {};
  global._wos.debug  = global._wos.debug  || {};
  global._wos.debug.buildingEdits = SBE.BuildingEditProjectionRuntime;

  // 0611Q: host building authority status shortcut
  global.hostBuildingAuthorityStatus = SBE.BuildingEditProjectionRuntime.hostBuildingAuthorityStatus;
  // 0611R: building authority mode API shortcuts
  global._wos.debug.buildingEdits.setBuildingAuthorityMode = setBuildingAuthorityMode;
  global._wos.debug.buildingEdits.getBuildingAuthorityMode = getBuildingAuthorityMode;
  global._wos.debug.buildingEdits.buildingAuthorityStatus  = buildingAuthorityStatus;
  global.setBuildingAuthorityMode      = setBuildingAuthorityMode;
  global.buildingAuthorityStatus       = buildingAuthorityStatus;
  global.editableBuildingBypassStatus   = editableBuildingBypassStatus;
  global._wos.debug.buildingEdits.editableVisualIsolationStatus  = editableVisualIsolationStatus;
  global.editableVisualIsolationStatus   = editableVisualIsolationStatus;
  global._wos.debug.buildingEdits.resolveEditableVisualIsolation = resolveEditableVisualIsolation;
  global.resolveEditableVisualIsolation  = resolveEditableVisualIsolation;
  // 0611I: top-level shortcut for quick console access
  global.verifyWallSuppression = SBE.BuildingEditProjectionRuntime.verifySuppression;
  // 0611L: ownership audit shortcut
  global.auditWallBuildingRenderOwnership = SBE.BuildingEditProjectionRuntime.auditWallBuildingRenderOwnership;
  // 0611M: Standard config audit shortcut
  global.auditMapboxStandardConfig = SBE.BuildingEditProjectionRuntime.auditMapboxStandardConfig;
  // 0611N: Standard import config target audit (async — returns Promise)
  global.auditStandardImportConfigTarget = SBE.BuildingEditProjectionRuntime.auditStandardImportConfigTarget;
  // 0611O: schema key resolver (async — returns Promise; pass {testSetStyle:true} for destructive setStyle test)
  global.auditMapboxStandardSchemaKeyResolver = SBE.BuildingEditProjectionRuntime.auditMapboxStandardSchemaKeyResolver;
  // 0611P: style source decomposition + architectural recommendation (sync, read-only)
  global.auditMapboxStyleSourceDecomposition  = SBE.BuildingEditProjectionRuntime.auditMapboxStyleSourceDecomposition;

  SBE.BuildingEditProjectionRuntime.init();

  console.log('[BuildingEditProjectionRuntime] v' + VERSION +
    ' loaded | host-building-layer: active | building-authority-mode: ' + _buildingAuthorityMode + ' | editable-bypass: active | storage-listener: active | footprint-suppression: active | groups: active | compounds: active | source-hide: active | style-parity: active | suppression: extrusion-height-suppression | auditMapboxStandardConfig: active | auditStandardImportConfigTarget: active | auditMapboxStandardSchemaKeyResolver: active | auditMapboxStyleSourceDecomposition: active');

})(window);
