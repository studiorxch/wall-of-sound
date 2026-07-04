// ── WOS ProxyShapeEditorController ────────────────────────────────────────────
// 0616B_WOS_ProxyShapeEditorPass_v1.0.0_BUILD
// Owns the in-memory shape-recipe draft for whichever Draft actor is being
// edited in the Inspector's Shape Editor section. Pushes previews to
// ActorObjectRenderLayer.setShapePreview() — never writes to the actor
// manifest, publish bundle, or Wall runtime. Mirrors the Phase 7
// MaterialOverrideController draft/preview pattern (preview is immediate,
// there is no "commit" in 0616B — persistence belongs to 0616D).
// 0616D: selectActor()/resetShape() now seed from the actor's resolved custom
// asset shapeRecipe when one exists, falling back to category defaults
// otherwise — so editing/resetting a custom-asset actor starts from its
// saved form instead of a blank template.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  function ProxyShapeEditorController(renderLayer, proxyFactory) {
    this._renderLayer = renderLayer || null;
    this._proxyFac     = proxyFactory || null;
    this._drafts        = {}; // objectId → { template, params, dirty }
    this._lastError     = null;
  }

  ProxyShapeEditorController.prototype.setRenderLayer = function (rl) {
    this._renderLayer = rl;
  };

  // ── Draft lifecycle ────────────────────────────────────────────────────────

  // Ensure a draft exists for this actor (lazy-initialized from category/type
  // defaults). Does not push a preview — selecting an actor must not silently
  // change its proxy until the user actually edits a parameter.
  ProxyShapeEditorController.prototype.selectActor = function (actor) {
    if (!actor) return null;
    var objectId = actor.objectId;
    if (this._drafts[objectId]) return this._drafts[objectId];

    var fac = this._proxyFac;
    var saved = this._savedShapeRecipeFor(actor);
    var template, params;
    if (saved) {
      template = saved.template;
      params   = Object.assign({}, saved.params);
    } else {
      template = fac && fac.defaultTemplateFor ? fac.defaultTemplateFor(actor.actorCategory, actor.actorType) : null;
      if (!template) { this._lastError = 'no_template_for_category'; return null; }
      params = fac && fac.defaultParamsFor ? fac.defaultParamsFor(template) : {};
    }
    this._drafts[objectId] = { template: template, params: params, dirty: false };
    this._lastError = null;
    return this._drafts[objectId];
  };

  // 0616D — read-only lookup of the actor's resolved custom asset shapeRecipe.
  ProxyShapeEditorController.prototype._savedShapeRecipeFor = function (actor) {
    var resolver = global.WOSAssetResolver;
    if (!resolver) return null;
    var resolved = resolver.resolve(actor.assetId);
    return (resolved.asset && resolved.asset.shapeRecipe) ? resolved.asset.shapeRecipe : null;
  };

  ProxyShapeEditorController.prototype.availableTemplates = function (actor) {
    var fac = this._proxyFac;
    if (!fac || !actor) return [];
    return fac.templatesForCategory(actor.actorCategory, actor.actorType);
  };

  ProxyShapeEditorController.prototype.getDraft = function (objectId) {
    return this._drafts[objectId] || null;
  };

  ProxyShapeEditorController.prototype.hasDraft = function (objectId) {
    return !!this._drafts[objectId];
  };

  ProxyShapeEditorController.prototype.isDirty = function (objectId) {
    return !!(this._drafts[objectId] && this._drafts[objectId].dirty);
  };

  ProxyShapeEditorController.prototype.getTemplate = function (objectId) {
    return this._drafts[objectId] ? this._drafts[objectId].template : null;
  };

  ProxyShapeEditorController.prototype.getParams = function (objectId) {
    return this._drafts[objectId] ? Object.assign({}, this._drafts[objectId].params) : null;
  };

  // Switch template — resets params to that template's defaults, then previews.
  ProxyShapeEditorController.prototype.setTemplate = function (objectId, template) {
    var fac = this._proxyFac;
    if (!fac) return { ok: false, reason: 'factory_unavailable' };
    var defaults = fac.defaultParamsFor(template);
    if (!Object.keys(defaults).length) { this._lastError = 'unknown_template'; return { ok: false, reason: 'unknown_template' }; }
    this._drafts[objectId] = { template: template, params: defaults, dirty: true };
    this._lastError = null;
    this.previewShape(objectId);
    return { ok: true };
  };

  // Update one parameter and preview immediately (live update, no debounce —
  // matches the existing MaterialOverrideController.setPreviewField pattern).
  ProxyShapeEditorController.prototype.setParam = function (objectId, key, value) {
    var draft = this._drafts[objectId];
    if (!draft) return { ok: false, reason: 'no_draft' };
    var num = parseFloat(value);
    if (isNaN(num)) { this._lastError = 'invalid_param_value'; return { ok: false, reason: 'invalid_value' }; }
    draft.params[key] = num;
    draft.dirty = true;
    this._lastError = null;
    this.previewShape(objectId);
    return { ok: true };
  };

  // Reset params to the actor's saved custom shapeRecipe (if its template
  // matches) — else the current template's factory defaults — and re-preview.
  ProxyShapeEditorController.prototype.resetShape = function (objectId) {
    var draft = this._drafts[objectId];
    var fac   = this._proxyFac;
    if (!draft || !fac) return { ok: false, reason: 'no_draft' };
    var store = global.WOSActorManifestStore;
    var actor = store && store.get(objectId);
    var saved = actor ? this._savedShapeRecipeFor(actor) : null;
    draft.params = (saved && saved.template === draft.template)
      ? Object.assign({}, saved.params)
      : fac.defaultParamsFor(draft.template);
    draft.dirty  = false;
    this.previewShape(objectId);
    return { ok: true };
  };

  // ── Preview application (render layer) ───────────────────────────────────────

  ProxyShapeEditorController.prototype.previewShape = function (objectId) {
    var draft = this._drafts[objectId];
    var rl    = this._renderLayer;
    if (!draft || !rl || !rl.setShapePreview) return { ok: false, reason: 'unavailable' };
    rl.setShapePreview(objectId, { template: draft.template, params: Object.assign({}, draft.params) });
    return { ok: true };
  };

  // Clears the rendered preview override (proxy reverts to default 0615D
  // category geometry) but keeps the in-memory draft so re-editing resumes
  // from where the user left off.
  ProxyShapeEditorController.prototype.clearPreview = function (objectId) {
    var rl = this._renderLayer;
    if (rl && rl.clearShapePreview) rl.clearShapePreview(objectId);
    return { ok: true };
  };

  ProxyShapeEditorController.prototype.discardDraft = function (objectId) {
    delete this._drafts[objectId];
    this.clearPreview(objectId);
  };

  ProxyShapeEditorController.prototype.previewActive = function (objectId) {
    var rl = this._renderLayer;
    return !!(rl && rl.getShapePreview && rl.getShapePreview(objectId));
  };

  // ── Debug snapshot ────────────────────────────────────────────────────────────

  ProxyShapeEditorController.prototype.getSnapshot = function (objectId, actor) {
    var draft = this._drafts[objectId] || null;
    return {
      enabled:               true,
      selectedObjectId:      objectId || null,
      selectedAssetId:       actor ? actor.assetId : null,
      selectedActorCategory: actor ? actor.actorCategory : null,
      template:              draft ? draft.template : null,
      hasDraft:               !!draft,
      draftParams:           draft ? Object.assign({}, draft.params) : null,
      previewActive:         this.previewActive(objectId),
      dirty:                 draft ? !!draft.dirty : false,
      lastError:             this._lastError,
    };
  };

  global.WOSProxyShapeEditorController = ProxyShapeEditorController;
  console.log('[ProxyShapeEditorController] ready — 0616D saved recipe seeding');
})(window);
