// ── WOS RetirementController ──────────────────────────────────────────────────
// 0613_WOS_3DCanvasLabPhase4Governance_v1.0.0_BUILD
// Owns retirement flow: reason validation, confirmation, registry write, scene removal.
// Retirement is PERMANENT and NOT undoable.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  function _store()      { return global.WOSActorManifestStore; }
  function _registry()   { return global.WOSActorRegistryController; }
  function _gateCtrl()   { return global.WOSPromotionGateController; }
  function _placCtrl()   { return global.WOSActorPlacementController; }
  function _stamp()      { try { return new Date().toISOString(); } catch (e) { return ''; } }

  var Controller = {
    // Validate retire reason — must be >= 20 characters.
    validateReason: function (reason) {
      if (!reason || reason.trim().length < 20) {
        return { ok: false, message: 'Retire reason must be at least 20 characters.' };
      }
      return { ok: true };
    },

    // Check if retirement is allowed.
    // Blocks if actor is the supersedes target of a GATE_PENDING fork.
    canRetire: function (objectId) {
      var reg = _registry();
      var store = _store();
      var gateCtrl = _gateCtrl();
      if (!reg || !store) return { ok: false, reason: 'dependencies_unavailable' };

      var actor = store.get(objectId);
      if (!actor) return { ok: false, reason: 'actor_not_found' };

      var state = gateCtrl ? gateCtrl.getState(actor) : (actor.meta && actor.meta.lifecycleState);
      if (state !== 'PROMOTED' && state !== 'DEPRECATED') {
        return { ok: false, reason: 'actor_not_promoted_or_deprecated' };
      }

      // Check if any GATE_PENDING actor supersedes this one
      var allActors = store.list();
      var blocked = allActors.some(function (a) {
        return a.meta && a.meta.lifecycleState === 'GATE_PENDING' &&
               a.meta.supersedes === objectId;
      });
      if (blocked) return { ok: false, reason: 'pending_fork_supersedes_this_actor' };

      return { ok: true };
    },

    // Execute retirement. Writes to registry, manifest, emits remove event.
    retire: function (objectId, reason, retiredBy) {
      var canCheck = this.canRetire(objectId);
      if (!canCheck.ok) return canCheck;

      var v = this.validateReason(reason);
      if (!v.ok) return { ok: false, reason: v.message };

      var reg = _registry();
      var store = _store();
      var placCtrl = _placCtrl();

      // Write registry retirement entry
      var regResult = reg.retireEntry(objectId, retiredBy || 'author', reason);
      if (!regResult.ok) return { ok: false, reason: 'registry_write_failed: ' + regResult.reason };

      // Write breaking change artifact
      var actor = store.get(objectId);
      var artifact = {
        artifactType: 'breaking-change',
        severity:     'breaking',
        objectId:     objectId,
        retiredAt:    _stamp(),
        retiredBy:    retiredBy || 'author',
        reason:       reason,
        supersededBy: (actor && actor.meta && actor.meta.supersededBy) || null,
      };
      localStorage.setItem('wos-breaking-change:' + objectId, JSON.stringify(artifact));

      // Retire in manifest store
      store.retire(objectId, reason);

      // Remove from authoring scene (deselect + emit remove)
      if (placCtrl) {
        if (placCtrl.selectedObjectId() === objectId) placCtrl.deselect();
        placCtrl.emit && placCtrl.emit('remove', { objectId: objectId });
      }

      return { ok: true, artifact: artifact };
    },
  };

  global.WOSRetirementController = Controller;
  console.log('[RetirementController] ready');
})(window);
