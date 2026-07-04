// ── WOS Building Texture Proof Controller ─────────────────────────────────────
// 0618D_WOS_BuildingTextureVisibleProofPatch_v1.0.0_BUILD
//
// Generates an obvious canvas proof texture and applies it directly to
// the Studio-side preview object for the selected building.
//
// This is Studio-only proof tooling — it does NOT change the 0618B publish
// contract. Proof texture application is in-session only.
//
// Flow:
//   1. Ensure or create a structure replacement actor for selected building
//   2. Ensure the actor's mesh materials are texture-ready (MeshStandardMaterial)
//   3. Generate 512×512 cyan/magenta checker via Canvas
//   4. Create THREE.CanvasTexture, apply to mesh materials
//   5. Report APPLIED / FALLBACK / MISSING truth via preview controller contract
// ─────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SOURCE = 'BuildingTextureProofCtrl';

  // Last proof result — per debug snapshot
  var _lastProof = null;

  function _actorStore()     { return global.WOSActorManifestStore; }
  function _placCtrl()       { return global.WOSActorPlacementController; }
  function _assignCtl()      { return global.WOSBuildingTextureAssignmentController; }
  function _previewCtl()     { return global.WOSBuildingTexturePreviewController; }
  function _brl()            { return global.WOSBuildingReplacementLayerInstance; }
  function _canvasView()     { return global.WOSThreeDCanvasView; }

  // ── _makeCheckerCanvas ────────────────────────────────────────────────────────
  // Returns a 512×512 HTMLCanvasElement with alternating cyan/magenta/black/white.
  function _makeCheckerCanvas() {
    var size  = 512;
    var tiles = 8;
    var tSize = size / tiles;
    var canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    var ctx = canvas.getContext('2d');
    var colors = ['#00e5ff', '#ff00cc', '#111111', '#ffffff'];
    for (var row = 0; row < tiles; row++) {
      for (var col = 0; col < tiles; col++) {
        var idx = ((row + col) % 2 === 0) ? (Math.floor(row / 2) % 2 === 0 ? 0 : 2) : (Math.floor(col / 2) % 2 === 0 ? 1 : 3);
        ctx.fillStyle = colors[idx];
        ctx.fillRect(col * tSize, row * tSize, tSize, tSize);
      }
    }
    // Label so it's obviously a proof texture
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('WOS PROOF', size / 2, size / 2);
    return canvas;
  }

  // ── _applyCanvasTexture ────────────────────────────────────────────────────────
  // Creates a THREE.CanvasTexture and applies it to all mesh materials on obj3D.
  // Saves prior maps for restore. Returns { applied, meshCount, textureReadyCount }.
  function _applyCanvasTexture(obj3D, canvas, buildingKey) {
    var THREE = global.THREE;
    if (!THREE || !THREE.CanvasTexture) return { applied: false, reason: 'THREE.CanvasTexture_unavailable' };

    var tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;

    var meshCount = 0;
    var applied   = 0;
    var saved     = [];

    obj3D.traverse(function (node) {
      if (!node.isMesh) return;
      meshCount++;
      var mat = node.material;
      if (!mat) return;
      if (mat.map === undefined) return; // no texture slot on this material type
      saved.push({ mesh: node, previousMap: mat.map }); // use 'mesh' key to match preview controller restore
      mat.map = tex;
      mat.needsUpdate = true;
      applied++;
    });

    // Persist restore record — shared fallback store so clearPreview/clearProof both work
    global._wosBtexPrevMaterials = global._wosBtexPrevMaterials || {};
    global._wosBtexPrevMaterials[buildingKey] = saved;

    return { applied: applied > 0, meshCount: meshCount, textureReadyCount: applied, texture: tex };
  }

  // ── _ensureOrCreateReplacement ────────────────────────────────────────────────
  // Finds an existing structure actor bound to selection.featureId, or creates one.
  // Returns { objectId, created } or null on failure.
  function _ensureOrCreateReplacement(selection, statusCallback) {
    var store   = _actorStore();
    var ctrl    = _placCtrl();
    var brl     = _brl();
    var cv      = _canvasView();

    // Try to find existing bound actor
    if (store) {
      var found = null;
      store.list().forEach(function (a) {
        if (a.actorCategory === 'structure' && a.structure &&
            String(a.structure.mapboxFeatureId) === String(selection.featureId)) {
          found = a;
        }
      });
      if (found) return { objectId: found.objectId, created: false };
    }

    // Create a new structure replacement actor
    if (!ctrl || !store) return null;
    var result = ctrl.place(selection.centroid.lat, selection.centroid.lon, {
      assetId:       'wos_placeholder_cube',
      actorCategory: 'structure',
      actorType:     'building',
    });
    if (!result.ok) return null;

    var newId = result.manifest.objectId;
    store.update(newId, {
      structure: {
        mapboxFeatureId:   selection.featureId,
        mapboxSourceId:    selection.sourceId    || 'composite',
        mapboxSourceLayer: selection.sourceLayer || 'building',
        mapboxLayerId:     selection.layerId     || 'building',
      },
    });
    if (brl) brl.suppress(selection.featureId, selection.sourceId, selection.sourceLayer, selection.layerId);
    if (cv && cv.refreshActor) cv.refreshActor(newId);
    return { objectId: newId, created: true };
  }

  // ── applyVisibleProof ─────────────────────────────────────────────────────────
  // Main entry point. Called by studioShell "Apply Test Texture".
  // callback(null, { status, reason, buildingKey, packageId, slotName, appliedObjectId, ... })
  function applyVisibleProof(selection, callback) {
    callback = callback || function () {};

    var assignCtl = _assignCtl();
    var THREE     = global.THREE;

    if (!assignCtl) {
      var r = _record({ status: 'MISSING', reason: 'assignment_controller_unavailable' });
      return callback(null, r);
    }

    var key = assignCtl.buildingKey(selection);
    if (!key) {
      var r = _record({ status: 'MISSING', reason: 'invalid_selection' });
      return callback(null, r);
    }

    // Step 1 — ensure / create replacement actor
    var replacement = _ensureOrCreateReplacement(selection);
    if (!replacement) {
      var r = _record({ status: 'FALLBACK', buildingKey: key, reason: 'no_preview_object3d', slotName: 'facade' });
      return callback(null, r);
    }

    // Step 2 — ensure texture-ready materials
    var rl = global._wosRLInstance; // debug handle set by threeDCanvasView
    var readiness = { ok: true, meshCount: 0, textureReadyCount: 0 };
    if (rl && rl.ensureTextureReadyObject) {
      readiness = rl.ensureTextureReadyObject(replacement.objectId);
    }

    // Step 3 — get object3D after material normalisation
    var obj3D = null;
    var cv = _canvasView();
    if (cv && cv.getBuildingPreviewObject3D) {
      obj3D = cv.getBuildingPreviewObject3D(selection);
    }

    if (!obj3D) {
      var r = _record({
        status: 'FALLBACK', buildingKey: key, slotName: 'facade',
        appliedObjectId: replacement.objectId,
        reason: 'no_preview_object3d',
        textureReady: readiness.textureReadyCount > 0,
        meshCount: readiness.meshCount,
        textureReadyCount: readiness.textureReadyCount,
      });
      return callback(null, r);
    }

    // Step 4 — generate and apply canvas texture
    if (!THREE) {
      var r = _record({ status: 'FALLBACK', buildingKey: key, slotName: 'facade', reason: 'THREE_unavailable' });
      return callback(null, r);
    }

    var canvas      = _makeCheckerCanvas();
    var applyResult = _applyCanvasTexture(obj3D, canvas, key);

    if (!applyResult.applied) {
      var r = _record({
        status: 'FALLBACK', buildingKey: key, slotName: 'facade',
        appliedObjectId: replacement.objectId,
        reason: applyResult.reason || 'uv_or_material_slot_unavailable',
        textureReady: readiness.textureReadyCount > 0,
        meshCount: applyResult.meshCount,
        textureReadyCount: applyResult.textureReadyCount || 0,
      });
      return callback(null, r);
    }

    // Step 5 — also create a governed assignment so preview state shows correctly in inspector
    // (Uses a proof-marker packageId that will be MISSING in governed publish — this is intentional.
    //  The user must still package a real texture through 0618B for publish.)
    var proofPkgId = 'proof.canvas.' + key.replace(/[|]/g, '-');
    var assignResult = assignCtl.assign(selection, 'facade', proofPkgId, {
      repeat: { x: 1, y: 1 }, opacity: 1, blendMode: 'normal',
    });

    var r = _record({
      status:           'APPLIED',
      buildingKey:      key,
      slotName:         'facade',
      packageId:        proofPkgId,
      appliedObjectId:  replacement.objectId,
      reason:           null,
      textureReady:     true,
      meshCount:        applyResult.meshCount,
      textureReadyCount: applyResult.textureReadyCount,
      createdReplacement: replacement.created,
    });
    callback(null, r);
  }

  // ── clearProof(selection) ─────────────────────────────────────────────────────
  // Restores prior materials. Works from global fallback store (set in _applyCanvasTexture).
  function clearProof(selection) {
    var assignCtl = _assignCtl();
    var key = assignCtl && assignCtl.buildingKey(selection);
    if (!key) return;

    var saved = global._wosBtexPrevMaterials && global._wosBtexPrevMaterials[key];
    if (saved) {
      saved.forEach(function (entry) {
        if (entry.mesh && entry.mesh.material) {
          entry.mesh.material.map = entry.previousMap;
          entry.mesh.material.needsUpdate = true;
        }
      });
      delete global._wosBtexPrevMaterials[key];
    }

    // Also delegate to preview controller clear (covers 0618C-originated previews)
    var pc = _previewCtl();
    if (pc && pc.clearPreview) pc.clearPreview(key);

    if (_lastProof && _lastProof.buildingKey === key) _lastProof = null;
  }

  function _record(fields) {
    fields.updatedAt = new Date().toISOString();
    _lastProof = fields;
    return fields;
  }

  function getSnapshot() {
    var pc = _previewCtl();
    return {
      enabled:         true,
      lastProof:       _lastProof,
      previewSnapshot: pc ? pc.getSnapshot() : null,
    };
  }

  global.WOSBuildingTextureProofController = {
    applyVisibleProof: applyVisibleProof,
    clearProof:        clearProof,
    getSnapshot:       getSnapshot,
  };

  console.log('[WOSBuildingTextureProofController] ready — 0618D');
})(window);
