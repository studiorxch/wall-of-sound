// ── WOS MaterialOverrideController (Phase 7) ─────────────────────────────────
// 0614_WOS_3DCanvasLabPhase7BuildingSurfaceMaterialOverrides_v1.0.0_BUILD
// Owns per-actor material override draft state and Three.js material mutation.
// Preview (applyPreview / setPreviewField) is immediate; save (commitDraft) is
// explicit. Reset restores the original pre-clone material.
// Security: no assetPath written. No second renderer created.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var VALID_HEX = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

  function _isProxy(actor) {
    return !actor || !actor.assetId || actor.assetId === 'wos_placeholder_cube';
  }

  function MaterialOverrideController(renderLayer, store, proxyFactory) {
    this._renderLayer = renderLayer;   // ActorObjectRenderLayer (set via setRenderLayer after init)
    this._store       = store;
    this._proxyFac    = proxyFactory;
    this._drafts      = {};            // objectId → materialOverride draft object
    this._originals   = {};            // meshUUID → THREE.Material (stashed before first clone)
  }

  // ── Chicken-and-egg wiring ────────────────────────────────────────────────────
  MaterialOverrideController.prototype.setRenderLayer = function (rl) {
    this._renderLayer = rl;
  };

  // ── Draft management ──────────────────────────────────────────────────────────

  MaterialOverrideController.prototype.getDraft = function (objectId) {
    if (this._drafts[objectId]) return this._drafts[objectId];
    var actor = this._store && this._store.get(objectId);
    var saved = actor && actor.materialOverride;
    return saved ? Object.assign({}, saved) : null;
  };

  MaterialOverrideController.prototype._ensureDraft = function (objectId) {
    if (!this._drafts[objectId]) {
      var actor = this._store && this._store.get(objectId);
      this._drafts[objectId] = Object.assign(
        { color: null, paletteRef: null, materialClass: null, roughness: null, metalness: null },
        actor && actor.materialOverride
      );
    }
    return this._drafts[objectId];
  };

  // Update one field on the draft and apply preview immediately.
  MaterialOverrideController.prototype.setPreviewField = function (objectId, field, value) {
    var draft = this._ensureDraft(objectId);
    draft[field] = value;
    // Setting a free hex clears paletteRef; setting a paletteRef clears hex.
    if (field === 'color'      && value) draft.paletteRef = null;
    if (field === 'paletteRef' && value) draft.color = null;
    this.applyPreview(objectId, draft);
  };

  // Revert draft to saved state; re-apply saved override (or restore base).
  MaterialOverrideController.prototype.discardDraft = function (objectId) {
    delete this._drafts[objectId];
    var actor = this._store && this._store.get(objectId);
    var saved = actor && actor.materialOverride;
    var obj3d = this._getObj(objectId);
    if (!obj3d) return;
    if (saved) {
      this._apply(obj3d, saved, _isProxy(actor));
    } else {
      this._restoreBase(objectId, obj3d, actor);
    }
  };

  // Write draft → manifest store.
  MaterialOverrideController.prototype.commitDraft = function (objectId) {
    var draft = this._drafts[objectId];
    if (!draft) return;
    if (this._store) this._store.update(objectId, { materialOverride: draft });
  };

  // ── Preview application ───────────────────────────────────────────────────────

  // Apply an override object to the actor's Object3D without saving.
  MaterialOverrideController.prototype.applyPreview = function (objectId, override) {
    if (!override) return;
    var obj3d = this._getObj(objectId);
    if (!obj3d) return;
    var actor = this._store && this._store.get(objectId);
    this._apply(obj3d, override, _isProxy(actor));
  };

  // Called by ActorObjectRenderLayer after an Object3D is placed in scene.
  // Reads actor.materialOverride from the manifest and applies it.
  MaterialOverrideController.prototype.applyFromManifest = function (objectId) {
    var actor = this._store && this._store.get(objectId);
    if (!actor || !actor.materialOverride) return;
    var obj3d = this._getObj(objectId);
    if (!obj3d) return;
    this._apply(obj3d, actor.materialOverride, _isProxy(actor));
  };

  // ── Reset ─────────────────────────────────────────────────────────────────────

  // Clear materialOverride from manifest and restore pre-clone materials.
  MaterialOverrideController.prototype.reset = function (objectId) {
    delete this._drafts[objectId];
    if (this._store) this._store.update(objectId, { materialOverride: null });
    var actor = this._store && this._store.get(objectId);
    var obj3d = this._getObj(objectId);
    if (obj3d && actor) this._restoreBase(objectId, obj3d, actor);
  };

  // Read saved materialOverride from manifest (not draft).
  MaterialOverrideController.prototype.getOverride = function (objectId) {
    var actor = this._store && this._store.get(objectId);
    return (actor && actor.materialOverride) || null;
  };

  // ── Internal: core apply logic ────────────────────────────────────────────────
  // Implements spec §6.2 exactly.

  MaterialOverrideController.prototype._apply = function (obj3d, override, isProxy) {
    var THREE = global.THREE;
    if (!THREE) return;

    var color     = override.color     || null;
    var matClass  = override.materialClass;
    var roughness = override.roughness;
    var metalness = override.metalness;

    // paletteRef takes precedence over free colour
    if (override.paletteRef && global.WOSPalette) {
      var entry = global.WOSPalette[override.paletteRef];
      if (entry) {
        color     = entry.color;
        matClass  = entry.materialClass;
        roughness = entry.roughness;
        metalness = entry.metalness;
      }
    }

    var self = this;
    obj3d.traverse(function (child) {
      if (!child.isMesh) return;

      // Stash original before first clone so reset can restore it.
      if (!child.material._wosCloned && !self._originals[child.uuid]) {
        self._originals[child.uuid] = child.material;
      }

      // Clone material before mutating to avoid shared-material corruption.
      if (!child.material._wosCloned) {
        child.material = child.material.clone();
        child.material._wosCloned = true;
      }

      // Material class upgrade / downgrade
      var needsStandard = matClass === 'standard';
      var isStandard = child.material instanceof THREE.MeshStandardMaterial;
      var isLambert  = child.material instanceof THREE.MeshLambertMaterial;

      if (needsStandard && isLambert) {
        var std = new THREE.MeshStandardMaterial({ color: child.material.color.clone() });
        std._wosCloned = true;
        child.material = std;
        isStandard = true;
      } else if (matClass === 'lambert' && isStandard && isProxy) {
        var lmb = new THREE.MeshLambertMaterial({ color: child.material.color.clone() });
        lmb._wosCloned = true;
        child.material = lmb;
        isStandard = false;
      }

      if (color) {
        try { child.material.color.set(color); } catch (e) {}
      }

      if (child.material instanceof THREE.MeshStandardMaterial) {
        if (roughness !== null && roughness !== undefined) child.material.roughness = roughness;
        if (metalness !== null && metalness !== undefined) child.material.metalness = metalness;
      }

      child.material.needsUpdate = true;
    });
  };

  // Restore pre-clone material from _originals map; fallback to proxy factory.
  MaterialOverrideController.prototype._restoreBase = function (objectId, obj3d, actor) {
    var self = this;
    obj3d.traverse(function (child) {
      if (!child.isMesh || !child.material || !child.material._wosCloned) return;

      var orig = self._originals[child.uuid];
      if (orig) {
        child.material = orig;
        child.material.needsUpdate = true;
        delete self._originals[child.uuid];
        return;
      }

      // Fallback for proxy actors: re-create material from factory.
      if (_isProxy(actor) && self._proxyFac) {
        try {
          var cat   = (actor && actor.actorCategory) || 'prop';
          var atype = (actor && actor.actorType)     || 'custom';
          var proxy = self._proxyFac.create(cat, atype);
          proxy.traverse(function (p) {
            if (p.isMesh) {
              child.material = p.material.clone();
              child.material.needsUpdate = true;
            }
          });
        } catch (e) {}
      }
    });
  };

  MaterialOverrideController.prototype._getObj = function (objectId) {
    var rl = this._renderLayer;
    return (rl && rl.getObject3D) ? rl.getObject3D(objectId) : null;
  };

  global.WOSMaterialOverrideController = MaterialOverrideController;
  console.log('[MaterialOverrideController] ready');
})(window);
