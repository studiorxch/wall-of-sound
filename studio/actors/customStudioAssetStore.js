// ── WOS CustomStudioAssetStore ────────────────────────────────────────────────
// 0616D_WOS_CustomStudioAssetSavePass_v1.0.0_BUILD
// Studio-local custom asset registry. Turns 0616B shape-preview drafts and
// 0616C material-preview drafts into reusable Studio assets registered through
// the existing ActorAssetLibraryAuthority.registerAsset() path — no parallel
// library list. shapeRecipe/materialRecipe live ONLY on these asset records,
// never on actor manifests, never on publish bundles, never on Wall.
// Persists to localStorage (wos.studio.customAssets.v1) — Studio asset
// persistence only, not actor manifest persistence.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var STORAGE_KEY = 'wos.studio.customAssets.v1';
  var ID_PREFIX   = 'studio.custom.';
  var VALID_HEX   = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

  // ALA domain category + safe default actorTypes per manifest actorCategory.
  // Mirrors assetResolver.js's inverse mapping (CATEGORY_MAP) so saved custom
  // assets resolve back to the same actorCategory/actorType on placement.
  var FIELDS_BY_ACTOR_CATEGORY = {
    structure: { category: 'structure', actorTypes: ['structure.building'], labelName: 'Structure' },
    vehicle:   { category: 'road',       actorTypes: ['vehicle.car'],        labelName: 'Vehicle' },
    maritime:  { category: 'marine',     actorTypes: ['marine.vessel'],      labelName: 'Maritime' },
    prop:      { category: 'prop',        actorTypes: ['world.prop'],         labelName: 'Prop' },
  };

  // Mirrors actorProxyGeometryFactory.js TEMPLATE_DEFAULTS bounds intent.
  var PARAM_BOUNDS = {
    lengthM: [0.1, 500], widthM: [0.1, 500], bodyWidthM: [0.1, 500], bodyHeightM: [0.1, 500],
    baseLengthM: [0.1, 500], baseWidthM: [0.1, 500],
    heightM: [0, 1000], roofHeightM: [0, 1000], cabinHeightM: [0, 1000], baseHeightM: [0, 1000],
    topHeightM: [0, 1000], wingSpanM: [0, 1000], tailSpanM: [0, 1000], setbackM: [0, 1000],
    shaftScale: [0, 1], bowTaper: [0, 1], sternTaper: [0, 1], frontSlope: [0, 1], rearSlope: [0, 1], noseTaper: [0, 1],
  };

  function _ala() { return global.SBE && global.SBE.ActorAssetLibraryAuthority; }

  var _assets = {};               // assetId → record (same object reference ALA holds once registered)
  var _lastCreatedAssetId = null;
  var _lastUpdatedAssetId = null;
  var _lastForkedAssetId  = null;
  var _lastError = null;

  // ── Persistence ──────────────────────────────────────────────────────────────

  function _load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        Object.keys(parsed).forEach(function (id) { _assets[id] = parsed[id]; });
      }
    } catch (e) {}
  }

  function _save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_assets)); } catch (e) {}
  }

  function _registerOne(record) {
    var ala = _ala();
    if (!ala || !ala.registerAsset) return false;
    return !!ala.registerAsset(record);
  }

  function registerAll() {
    var count = 0;
    Object.keys(_assets).forEach(function (id) { if (_registerOne(_assets[id])) count++; });
    return count;
  }

  // ── Validation ─────────────────────────────────────────────────────────────

  function _validateShapeParams(params) {
    if (!params) return null;
    for (var k in params) {
      if (!params.hasOwnProperty(k)) continue;
      var v = params[k];
      if (typeof v !== 'number' || !isFinite(v)) return 'param_' + k + '_not_finite';
      var b = PARAM_BOUNDS[k];
      if (b && (v < b[0] || v > b[1])) return 'param_' + k + '_out_of_bounds';
    }
    return null;
  }

  function _validateMaterialRecipe(mr) {
    if (!mr) return null;
    var slots = mr.slots || {};
    for (var k in slots) {
      if (!slots.hasOwnProperty(k)) continue;
      if (slots[k] != null && !VALID_HEX.test(slots[k])) return 'invalid_slot_color_' + k;
    }
    var scalars = ['roughness', 'metalness', 'opacity'];
    for (var i = 0; i < scalars.length; i++) {
      var v = mr[scalars[i]];
      if (v != null && (typeof v !== 'number' || v < 0 || v > 1)) return 'invalid_scalar_' + scalars[i];
    }
    return null;
  }

  // ── ID / label generation ──────────────────────────────────────────────────

  function _pad3(n) { return (n < 10 ? '00' : n < 100 ? '0' : '') + n; }

  function _slugFromTemplate(template) {
    if (!template) return 'object';
    var parts = template.split('.');
    return parts[parts.length - 1].toLowerCase();
  }

  function _fieldsFor(actorCategory, actorType) {
    if (actorCategory === 'vehicle' && actorType === 'aircraft') {
      return { category: 'aircraft', actorTypes: ['aircraft.plane'], labelName: 'Aircraft' };
    }
    return FIELDS_BY_ACTOR_CATEGORY[actorCategory] ||
      { category: 'prop', actorTypes: ['world.prop'], labelName: 'Prop' };
  }

  function _nextIdAndNumber(category, slug) {
    var n = 1, id;
    do {
      id = ID_PREFIX + category + '.' + slug + '.' + _pad3(n);
      n++;
    } while (_assets[id]);
    return { id: id, n: n - 1 };
  }

  function _variantsFor(id) {
    return {
      dot:     { kind: 'procedural', renderVariant: id + '_dot',     minZoom: 8,  maxZoom: 12 },
      icon:    { kind: 'procedural', renderVariant: id + '_icon',    minZoom: 12, maxZoom: 14 },
      lowpoly: { kind: 'procedural', renderVariant: id + '_lowpoly', minZoom: 14, maxZoom: 20 },
    };
  }

  // ── Recipe sourcing (0616B / 0616C preview state) ────────────────────────────

  function _shapeRecipeFromDrafts(actor) {
    var shapeCtrl = global.WOSProxyShapeEditorControllerInstance;
    var fac       = global.WOSActorProxyGeometryFactory;
    var draft     = shapeCtrl ? shapeCtrl.getDraft(actor.objectId) : null;
    if (draft) return { template: draft.template, params: Object.assign({}, draft.params) };

    var template = fac && fac.defaultTemplateFor ? fac.defaultTemplateFor(actor.actorCategory, actor.actorType) : null;
    if (!template) return null;
    return { template: template, params: fac.defaultParamsFor(template) };
  }

  function _materialRecipeFromDrafts(actor) {
    var matCtrl = global.WOSObjectMaterialAuthoringControllerInstance;
    var draft   = matCtrl ? matCtrl.getDraft(actor.objectId) : null;
    if (draft) {
      return {
        slots:         Object.assign({}, draft.slots),
        materialClass: draft.materialClass,
        roughness:     draft.roughness,
        metalness:     draft.metalness,
        opacity:       draft.opacity,
      };
    }
    return { slots: {}, materialClass: null, roughness: null, metalness: null, opacity: null };
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  function list() {
    return Object.keys(_assets).map(function (id) { return _assets[id]; });
  }

  function get(assetId) { return _assets[assetId] || null; }

  function createFromActor(actor, options) {
    options = options || {};
    _lastError = null;
    if (!actor) { _lastError = 'no_actor'; return { ok: false, reason: 'no_actor' }; }

    var gate  = global.WOSPromotionGateController;
    var state = gate && gate.getState ? gate.getState(actor) : ((actor.meta && actor.meta.promoted) ? 'PROMOTED' : 'DRAFT');
    if (state !== 'DRAFT') { _lastError = 'actor_not_draft'; return { ok: false, reason: 'actor_not_draft' }; }

    var fields = _fieldsFor(actor.actorCategory, actor.actorType);

    var shapeRecipe = _shapeRecipeFromDrafts(actor);
    if (!shapeRecipe) { _lastError = 'no_template'; return { ok: false, reason: 'no_template' }; }
    var shapeErr = _validateShapeParams(shapeRecipe.params);
    if (shapeErr) { _lastError = shapeErr; return { ok: false, reason: shapeErr }; }

    var materialRecipe = _materialRecipeFromDrafts(actor);
    var matErr = _validateMaterialRecipe(materialRecipe);
    if (matErr) { _lastError = matErr; return { ok: false, reason: matErr }; }

    var label = (options.label || '').trim();
    if (label.length > 80) { _lastError = 'label_too_long'; return { ok: false, reason: 'label_too_long' }; }

    var slug   = _slugFromTemplate(shapeRecipe.template);
    var idInfo = _nextIdAndNumber(fields.category, slug);
    if (!label) label = 'Custom ' + fields.labelName + ' ' + _pad3(idInfo.n);

    var now = new Date().toISOString();
    var record = {
      id: idInfo.id, key: idInfo.id, label: label, category: fields.category,
      source: 'studio-custom', editable: true, silhouetteClass: null,
      actorTypes: fields.actorTypes.slice(), identityKeys: [],
      tags: ['custom', 'studio', fields.category],
      defaultVariant: 'lowpoly', variants: _variantsFor(idInfo.id),
      paletteRef: null, glyphRef: null,
      materialClass: materialRecipe.materialClass || 'standard',
      lightClass: 'none', scaleClass: 'standard', priorityClass: 'background',
      files: { svg: null, glb: null, webp: null, thumbnail: null },
      shapeRecipe: shapeRecipe,
      materialRecipe: materialRecipe,
      authoring: { editable: true, locked: false, version: '1.0.0', createdAt: now, updatedAt: now },
      metadata: {},
    };

    _assets[idInfo.id] = record;
    _save();
    _registerOne(record);
    _lastCreatedAssetId = idInfo.id;
    return { ok: true, assetId: idInfo.id, asset: record };
  }

  function update(assetId, patch) {
    _lastError = null;
    var rec = _assets[assetId];
    if (!rec) { _lastError = 'asset_not_found'; return { ok: false, reason: 'asset_not_found' }; }
    if (rec.source !== 'studio-custom' || !rec.editable) { _lastError = 'not_editable'; return { ok: false, reason: 'not_editable' }; }
    patch = patch || {};

    if (patch.shapeRecipe) {
      var perr = _validateShapeParams(patch.shapeRecipe.params || {});
      if (perr) { _lastError = perr; return { ok: false, reason: perr }; }
      rec.shapeRecipe = { template: patch.shapeRecipe.template, params: Object.assign({}, patch.shapeRecipe.params) };
    }
    if (patch.materialRecipe) {
      var merr = _validateMaterialRecipe(patch.materialRecipe);
      if (merr) { _lastError = merr; return { ok: false, reason: merr }; }
      rec.materialRecipe = Object.assign({}, patch.materialRecipe);
    }
    if (patch.label != null) {
      if (String(patch.label).length > 80) { _lastError = 'label_too_long'; return { ok: false, reason: 'label_too_long' }; }
      rec.label = patch.label;
    }

    // rec is the same object reference ALA's registry holds (registerAsset stores
    // it by reference) — mutating in place is sufficient, no re-register needed.
    rec.authoring.updatedAt = new Date().toISOString();
    _save();
    _lastUpdatedAssetId = assetId;
    return { ok: true, asset: rec };
  }

  function fork(assetId, options) {
    options = options || {};
    _lastError = null;
    var src = _assets[assetId];
    if (!src) { _lastError = 'asset_not_found'; return { ok: false, reason: 'asset_not_found' }; }

    var slug   = _slugFromTemplate(src.shapeRecipe && src.shapeRecipe.template);
    var idInfo = _nextIdAndNumber(src.category, slug);
    var now    = new Date().toISOString();

    var forked = JSON.parse(JSON.stringify(src)); // deep clone — all fields are plain JSON
    forked.id = idInfo.id;
    forked.key = idInfo.id;
    forked.label = options.label || (src.label + ' (Fork)');
    forked.source = 'studio-custom';
    forked.editable = true;
    forked.variants = _variantsFor(idInfo.id);
    forked.authoring = { editable: true, locked: false, version: '1.0.0', createdAt: now, updatedAt: now };

    // 0616F: caller may supply explicit recipes (from live editor drafts) so the
    // fork captures the edited state rather than just the previously saved state.
    // Recipes are validated before overwriting the cloned source data.
    if (options.shapeRecipe) {
      var fperr = _validateShapeParams(options.shapeRecipe.params || {});
      if (fperr) { _lastError = fperr; return { ok: false, reason: fperr }; }
      forked.shapeRecipe = { template: options.shapeRecipe.template, params: Object.assign({}, options.shapeRecipe.params) };
    }
    if (options.materialRecipe) {
      var fmerr = _validateMaterialRecipe(options.materialRecipe);
      if (fmerr) { _lastError = fmerr; return { ok: false, reason: fmerr }; }
      forked.materialRecipe = Object.assign({}, options.materialRecipe);
    }

    _assets[idInfo.id] = forked;
    _save();
    _registerOne(forked);
    _lastCreatedAssetId = idInfo.id;
    _lastForkedAssetId  = idInfo.id;
    return { ok: true, assetId: idInfo.id, asset: forked };
  }

  // 0616F: list all actors from the manifest store that use a given assetId.
  function actorsUsing(assetId) {
    var store = global.WOSActorManifestStore;
    if (!store) return [];
    return store.list().filter(function (a) { return a.assetId === assetId; });
  }

  function remove(assetId) {
    _lastError = null;
    var rec = _assets[assetId];
    if (!rec) { _lastError = 'asset_not_found'; return { ok: false, reason: 'asset_not_found' }; }
    var store = global.WOSActorManifestStore;
    var inUse = store && store.list().some(function (a) { return a.assetId === assetId; });
    if (inUse) { _lastError = 'asset_in_use'; return { ok: false, reason: 'asset_in_use' }; }

    // ALA has no unregister API. Flag the live (shared-reference) object so
    // assetResolver.list()/Library filters it out; our own store drops it outright.
    rec._customAssetRemoved = true;
    delete _assets[assetId];
    _save();
    return { ok: true };
  }

  // 0616I: single-asset export compatible with exportJSON schema
  function exportOne(assetId) {
    var asset = _assets[assetId];
    if (!asset) { _lastError = 'asset_not_found'; return { ok: false, reason: 'asset_not_found' }; }
    var payload = {};
    payload[assetId] = JSON.parse(JSON.stringify(asset));
    return {
      ok: true,
      payload: { schema: 'wos.studio.customAssets', version: '1.0.0', exportedAt: new Date().toISOString(), assets: payload },
    };
  }

  // 0616I: per-asset usage breakdown by lifecycle state
  function usageSummary(assetId) {
    var actors = actorsUsing(assetId);
    var counts = { draft: 0, gatePending: 0, promoted: 0, retired: 0 };
    actors.forEach(function (a) {
      var state = (a.meta && a.meta.lifecycleState) || (a.meta && a.meta.promoted ? 'PROMOTED' : 'DRAFT');
      if (state === 'GATE_PENDING')     counts.gatePending++;
      else if (state === 'PROMOTED')    counts.promoted++;
      else if (state === 'RETIRED')     counts.retired++;
      else                              counts.draft++;
    });
    return {
      assetId:         assetId,
      actorCount:      actors.length,
      objectIds:       actors.map(function (a) { return a.objectId; }),
      lifecycleCounts: counts,
    };
  }

  function exportJSON() {
    return {
      schema: 'wos.studio.customAssets', version: '1.0.0',
      exportedAt: new Date().toISOString(),
      assets: JSON.parse(JSON.stringify(_assets)),
    };
  }

  function importJSON(payload) {
    if (!payload || !payload.assets) { _lastError = 'invalid_payload'; return { ok: false, reason: 'invalid_payload' }; }
    var count = 0;
    Object.keys(payload.assets).forEach(function (id) {
      _assets[id] = payload.assets[id];
      _registerOne(_assets[id]);
      count++;
    });
    _save();
    return { ok: true, importedCount: count };
  }

  function getSnapshot() {
    var ala = _ala();
    var registeredCount = Object.keys(_assets).filter(function (id) {
      return ala && ala.getAsset && !!ala.getAsset(id);
    }).length;
    return {
      enabled:             true,
      customAssetCount:    Object.keys(_assets).length,
      registeredCount:     registeredCount,
      storageKey:          STORAGE_KEY,
      lastCreatedAssetId:  _lastCreatedAssetId,
      lastUpdatedAssetId:  _lastUpdatedAssetId,
      lastForkedAssetId:   _lastForkedAssetId,
      lastError:           _lastError,
    };
  }

  _load();
  registerAll();

  global.WOSCustomStudioAssetStore = {
    list:            list,
    get:             get,
    createFromActor: createFromActor,
    update:          update,
    fork:            fork,
    remove:          remove,
    registerAll:     registerAll,
    exportJSON:      exportJSON,
    exportOne:       exportOne,
    importJSON:      importJSON,
    getSnapshot:     getSnapshot,
    actorsUsing:     actorsUsing,
    usageSummary:    usageSummary,
  };
  console.log('[CustomStudioAssetStore] ready — ' + Object.keys(_assets).length + ' custom asset(s) loaded');
})(window);
