// ── WOS ObjectMaterialAuthoringController ────────────────────────────────────
// 0616C_WOS_ObjectColorMaterialAuthoringPass_v1.0.0_BUILD
// Owns the in-memory object material draft for whichever Draft actor is being
// edited in the Inspector's Object Material Editor section. Pushes previews
// to ActorObjectRenderLayer.setMaterialPreview() — never writes materialRecipe
// or any draft field to the actor manifest, publish bundle, or Wall runtime.
// Mirrors the 0616B ProxyShapeEditorController pattern (lazy seed, immediate
// preview, no commit method — persistence belongs to 0616D).
//
// This is a SEPARATE preview layer from Phase 7's MaterialOverrideController.
// Deterministic visual order in Studio: base proxy → Phase 7 override (if
// active) → 0616C object material preview (if active, wins visually).
// 0616D: selectActor()/resetMaterial() now seed/restore from the actor's
// resolved custom asset materialRecipe when one exists, instead of always
// starting blank — Reset Material returns to the saved recipe, not nothing.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var VALID_HEX = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;
  var DEFAULT_SLOTS = { body: '#A89880', roof: '#9A8870', glass: '#203848', accent: '#00CED1', edge: '#111111', emissive: '#000000' };

  function ObjectMaterialAuthoringController(renderLayer) {
    this._renderLayer = renderLayer || null;
    this._drafts       = {}; // objectId → { slots, materialClass, roughness, metalness, opacity, dirty }
    this._lastError    = null;
  }

  ObjectMaterialAuthoringController.prototype.setRenderLayer = function (rl) {
    this._renderLayer = rl;
  };

  // ── Draft lifecycle ────────────────────────────────────────────────────────

  // Lazily seed a draft for this actor. Does NOT mutate the actor or push a
  // preview — selecting an actor must not silently recolor its proxy.
  ObjectMaterialAuthoringController.prototype.selectActor = function (actor) {
    if (!actor) return null;
    var objectId = actor.objectId;
    if (this._drafts[objectId]) return this._drafts[objectId];

    var saved = this._savedMaterialRecipeFor(actor);
    this._drafts[objectId] = saved ? {
      slots:         Object.assign({}, saved.slots || {}),
      materialClass: saved.materialClass != null ? saved.materialClass : null,
      roughness:     saved.roughness != null ? saved.roughness : null,
      metalness:     saved.metalness != null ? saved.metalness : null,
      opacity:       saved.opacity != null ? saved.opacity : null,
      dirty:         false,
    } : {
      slots:         {}, // empty = inherit base proxy/Phase-7 colors until user sets a slot
      materialClass: null,
      roughness:     null,
      metalness:     null,
      opacity:       null,
      dirty:         false,
    };
    this._lastError = null;
    return this._drafts[objectId];
  };

  // 0616D — read-only lookup of the actor's resolved custom asset materialRecipe.
  ObjectMaterialAuthoringController.prototype._savedMaterialRecipeFor = function (actor) {
    var resolver = global.WOSAssetResolver;
    if (!resolver) return null;
    var resolved = resolver.resolve(actor.assetId);
    return (resolved.asset && resolved.asset.materialRecipe) ? resolved.asset.materialRecipe : null;
  };

  ObjectMaterialAuthoringController.prototype.getDraft = function (objectId) {
    return this._drafts[objectId] || null;
  };

  ObjectMaterialAuthoringController.prototype.hasDraft = function (objectId) {
    return !!this._drafts[objectId];
  };

  ObjectMaterialAuthoringController.prototype.isDirty = function (objectId) {
    return !!(this._drafts[objectId] && this._drafts[objectId].dirty);
  };

  // ── Field setters — each previews immediately ────────────────────────────────

  ObjectMaterialAuthoringController.prototype.setSlot = function (objectId, slot, hex) {
    var draft = this._drafts[objectId];
    if (!draft) return { ok: false, reason: 'no_draft' };
    if (hex && !VALID_HEX.test(hex)) { this._lastError = 'invalid_hex'; return { ok: false, reason: 'invalid_hex' }; }
    draft.slots[slot] = hex || null;
    if (!hex) delete draft.slots[slot];
    draft.dirty = true;
    this._lastError = null;
    this.previewMaterial(objectId);
    return { ok: true };
  };

  ObjectMaterialAuthoringController.prototype.setMaterialClass = function (objectId, materialClass) {
    var draft = this._drafts[objectId];
    if (!draft) return { ok: false, reason: 'no_draft' };
    draft.materialClass = materialClass || null;
    draft.dirty = true;
    this.previewMaterial(objectId);
    return { ok: true };
  };

  // key: 'roughness' | 'metalness' | 'opacity'
  ObjectMaterialAuthoringController.prototype.setScalar = function (objectId, key, value) {
    var draft = this._drafts[objectId];
    if (!draft) return { ok: false, reason: 'no_draft' };
    if (value === '' || value == null) { draft[key] = null; }
    else {
      var num = parseFloat(value);
      if (isNaN(num)) { this._lastError = 'invalid_scalar_value'; return { ok: false, reason: 'invalid_value' }; }
      draft[key] = Math.min(1, Math.max(0, num));
    }
    draft.dirty = true;
    this._lastError = null;
    this.previewMaterial(objectId);
    return { ok: true };
  };

  // ── Preview application (render layer) ───────────────────────────────────────

  ObjectMaterialAuthoringController.prototype.previewMaterial = function (objectId) {
    var draft = this._drafts[objectId];
    var rl    = this._renderLayer;
    if (!draft || !rl || !rl.setMaterialPreview) return { ok: false, reason: 'unavailable' };
    rl.setMaterialPreview(objectId, {
      slots:         Object.assign({}, draft.slots),
      materialClass: draft.materialClass,
      roughness:     draft.roughness,
      metalness:     draft.metalness,
      opacity:       draft.opacity,
    });
    return { ok: true };
  };

  // Resets to the actor's saved custom materialRecipe if one exists, else
  // blank inherited appearance — clears the rendered preview either way, but
  // keeps the in-memory draft so re-editing resumes from the restored state.
  ObjectMaterialAuthoringController.prototype.resetMaterial = function (objectId) {
    var draft = this._drafts[objectId];
    if (!draft) return { ok: false, reason: 'no_draft' };
    var store = global.WOSActorManifestStore;
    var actor = store && store.get(objectId);
    var saved = actor ? this._savedMaterialRecipeFor(actor) : null;
    draft.slots         = saved ? Object.assign({}, saved.slots || {}) : {};
    draft.materialClass = saved && saved.materialClass != null ? saved.materialClass : null;
    draft.roughness      = saved && saved.roughness != null ? saved.roughness : null;
    draft.metalness      = saved && saved.metalness != null ? saved.metalness : null;
    draft.opacity         = saved && saved.opacity != null ? saved.opacity : null;
    draft.dirty = false;
    this.clearPreview(objectId);
    return { ok: true };
  };

  ObjectMaterialAuthoringController.prototype.clearPreview = function (objectId) {
    var rl = this._renderLayer;
    if (rl && rl.clearMaterialPreview) rl.clearMaterialPreview(objectId);
    return { ok: true };
  };

  ObjectMaterialAuthoringController.prototype.discardDraft = function (objectId) {
    delete this._drafts[objectId];
    this.clearPreview(objectId);
  };

  ObjectMaterialAuthoringController.prototype.previewActive = function (objectId) {
    var rl = this._renderLayer;
    return !!(rl && rl.getMaterialPreview && rl.getMaterialPreview(objectId));
  };

  ObjectMaterialAuthoringController.prototype.defaultSlotSuggestion = function (slot) {
    return DEFAULT_SLOTS[slot] || '#A89880';
  };

  // ── Debug snapshot ────────────────────────────────────────────────────────────

  ObjectMaterialAuthoringController.prototype.getSnapshot = function (objectId, actor) {
    var draft = this._drafts[objectId] || null;
    var rl    = this._renderLayer;
    return {
      enabled:               true,
      selectedObjectId:      objectId || null,
      selectedAssetId:       actor ? actor.assetId : null,
      selectedActorCategory: actor ? actor.actorCategory : null,
      hasDraft:               !!draft,
      previewActive:         this.previewActive(objectId),
      dirty:                 draft ? !!draft.dirty : false,
      slots:                 draft ? Object.assign({}, draft.slots) : {},
      materialClass:         draft ? draft.materialClass : null,
      roughness:             draft ? draft.roughness : null,
      metalness:             draft ? draft.metalness : null,
      opacity:               draft ? draft.opacity : null,
      previewCount:          rl && rl.getObjectMaterialSnapshot ? rl.getObjectMaterialSnapshot().previewCount : 0,
      lastError:             this._lastError,
    };
  };

  global.WOSObjectMaterialAuthoringController = ObjectMaterialAuthoringController;
  console.log('[ObjectMaterialAuthoringController] ready — 0616D saved recipe seeding');
})(window);
