// ── WOS Building Texture Preview Controller ───────────────────────────────────
// 0618C_WOS_BuildingTexturePreviewParityPass_v1.0.0_BUILD
//
// Resolves building texture assignments and applies packaged runtime textures
// to Studio-side preview objects. Reports APPLIED / FALLBACK / MISSING truth
// explicitly — never claims success when runtime application is unavailable.
//
// Does NOT:
//   - Write to actor manifests
//   - Write to bundle.buildingTextures
//   - Mutate Wall runtime state
//   - Change the 0618B publish contract
//
// Material restore: preserves prior material.map on first apply per buildingKey
// so clearPreview() can restore the previous state.
// ─────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SOURCE = 'BuildingTexturePreviewCtrl';

  var ALLOWED_MIMES = ['image/png', 'image/jpeg', 'image/webp'];

  // buildingKey → { status, slotName, packageId, reason, appliedObjectId, runtimeUrl, updatedAt }
  var _states = {};
  // packageId → THREE.Texture (session cache, disposed on clearAll)
  var _texCache = {};
  // buildingKey → [{ mesh, previousMap }]
  var _prevMaterials = {};
  var _lastError = null;

  function _assignCtl()  { return global.WOSBuildingTextureAssignmentController; }
  function _pkgStore()   { return global.WOSBuildingTexturePackageStore; }
  function _canvasView() { return global.WOSThreeDCanvasView; }

  function _isSafeRuntimeUrl(url) {
    if (!url || typeof url !== 'string') return false;
    if (url.indexOf('blob:')    === 0) return false;
    if (url.indexOf('file:')    === 0) return false;
    if (url.indexOf('http://')  === 0) return false;
    if (url.indexOf('https://') === 0) return false;
    return true;
  }

  function _setResult(key, fields) {
    _states[key] = Object.assign({ updatedAt: new Date().toISOString() }, fields);
    return _states[key];
  }

  // ── _loadTexture ─────────────────────────────────────────────────────────────
  function _loadTexture(runtimeUrl, packageId, callback) {
    if (_texCache[packageId]) return callback(null, _texCache[packageId]);
    var THREE = global.THREE;
    if (!THREE || !THREE.TextureLoader) return callback(new Error('THREE.TextureLoader_unavailable'), null);
    var loader = new THREE.TextureLoader();
    loader.load(
      runtimeUrl,
      function (tex) { _texCache[packageId] = tex; callback(null, tex); },
      undefined,
      function (e)   { callback(new Error(e ? (e.message || String(e)) : 'load_failed'), null); }
    );
  }

  // ── _applyToObject3D ─────────────────────────────────────────────────────────
  // Returns 'applied' or 'uv_or_material_slot_unavailable'
  function _applyToObject3D(obj3D, texture, slotMeta, buildingKey) {
    var THREE = global.THREE;
    if (!THREE || !obj3D) return 'no_preview_object3d';

    // Save previous maps for restore
    var saved = [];
    var applied = false;
    obj3D.traverse(function (mesh) {
      if (!mesh.isMesh) return;
      var mat = mesh.material;
      if (!mat) return;
      // Save only once per mesh
      saved.push({ mesh: mesh, previousMap: mat.map || null });
      if (mat.map !== undefined) {
        mat.map = texture;
        if (slotMeta) {
          if (slotMeta.repeat && texture.repeat) {
            texture.repeat.set(slotMeta.repeat.x || 1, slotMeta.repeat.y || 1);
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
          }
          if (slotMeta.rotationDeg != null) {
            texture.rotation = (slotMeta.rotationDeg || 0) * Math.PI / 180;
          }
          mat.opacity  = slotMeta.opacity != null ? slotMeta.opacity : 1;
        }
        mat.needsUpdate = true;
        applied = true;
      }
    });
    if (saved.length) _prevMaterials[buildingKey] = saved;
    return applied ? 'applied' : 'uv_or_material_slot_unavailable';
  }

  // ── previewBuilding ───────────────────────────────────────────────────────────
  function previewBuilding(selection, options, callback) {
    callback = callback || function () {};
    options  = options  || {};

    var ctl     = _assignCtl();
    var pkgSt   = _pkgStore();
    var cv      = _canvasView();

    // Step 1 — key
    var key = ctl && ctl.buildingKey(selection);
    if (!key) {
      var r = _setResult('(invalid)', { status: 'MISSING', reason: 'invalid_selection' });
      return callback(null, r);
    }

    // Step 2 — assignment
    var assignment = ctl && ctl.getForBuilding(selection);
    if (!assignment || !Object.keys(assignment.slots || {}).length) {
      var r = _setResult(key, { status: 'MISSING', buildingKey: key, reason: 'no_assignment' });
      return callback(null, r);
    }

    // Step 3 — slot resolution
    var slots     = assignment.slots || {};
    var slotName  = options.slotName && slots[options.slotName]
      ? options.slotName
      : (slots['facade'] ? 'facade' : Object.keys(slots)[0]);
    var slot = slots[slotName];
    if (!slot || !slot.packageId) {
      var r = _setResult(key, { status: 'MISSING', buildingKey: key, slotName: slotName, reason: 'slot_no_package' });
      return callback(null, r);
    }

    // Step 4 — package validation
    var pkg = pkgSt && pkgSt.get(slot.packageId);
    if (!pkg) {
      var r = _setResult(key, { status: 'MISSING', buildingKey: key, slotName: slotName, packageId: slot.packageId, reason: 'package_not_found' });
      return callback(null, r);
    }
    if (pkg.status !== 'packaged' || !pkg.runtimeUrl) {
      var r = _setResult(key, { status: 'MISSING', buildingKey: key, slotName: slotName, packageId: slot.packageId, reason: 'package_not_ready' });
      return callback(null, r);
    }
    if (!_isSafeRuntimeUrl(pkg.runtimeUrl)) {
      var r = _setResult(key, { status: 'MISSING', buildingKey: key, slotName: slotName, packageId: slot.packageId, reason: 'unsafe_runtime_url' });
      return callback(null, r);
    }
    if (ALLOWED_MIMES.indexOf(pkg.mimeType) === -1) {
      var r = _setResult(key, { status: 'MISSING', buildingKey: key, slotName: slotName, packageId: slot.packageId, reason: 'unsupported_mime' });
      return callback(null, r);
    }

    // Step 5 — locate preview object
    var obj3D = null;
    if (cv && cv.getBuildingPreviewObject3D) {
      obj3D = cv.getBuildingPreviewObject3D(selection);
    }

    // Step 6 — if no object, report FALLBACK immediately (no texture load needed)
    if (!obj3D) {
      var r = _setResult(key, {
        status:    'FALLBACK',
        buildingKey: key,
        slotName:  slotName,
        packageId: slot.packageId,
        runtimeUrl: pkg.runtimeUrl,
        reason:    'no_preview_object3d',
      });
      return callback(null, r);
    }

    // Load + apply
    _loadTexture(pkg.runtimeUrl, slot.packageId, function (err, texture) {
      if (err) {
        _lastError = err.message;
        var r = _setResult(key, {
          status:    'FALLBACK',
          buildingKey: key,
          slotName:  slotName,
          packageId: slot.packageId,
          runtimeUrl: pkg.runtimeUrl,
          reason:    'texture_load_failed: ' + err.message,
        });
        return callback(null, r);
      }

      var applyResult = _applyToObject3D(obj3D, texture, slot, key);
      var status = applyResult === 'applied' ? 'APPLIED' : 'FALLBACK';

      // Best-effort objectId for diagnostics
      var objectId = obj3D.name || obj3D.userData && obj3D.userData.objectId || null;

      var r = _setResult(key, {
        status:         status,
        buildingKey:    key,
        slotName:       slotName,
        packageId:      slot.packageId,
        runtimeUrl:     pkg.runtimeUrl,
        appliedObjectId: objectId,
        reason:         status === 'FALLBACK' ? applyResult : null,
      });
      callback(null, r);
    });
  }

  // ── clearPreview ─────────────────────────────────────────────────────────────
  function clearPreview(selectionOrKey) {
    var key;
    if (typeof selectionOrKey === 'string') {
      key = selectionOrKey;
    } else {
      var ctl = _assignCtl();
      key = ctl && ctl.buildingKey(selectionOrKey);
    }
    if (!key) return;

    // Restore prior material maps
    var saved = _prevMaterials[key];
    if (saved) {
      saved.forEach(function (entry) {
        if (entry.mesh && entry.mesh.material) {
          entry.mesh.material.map = entry.previousMap;
          entry.mesh.material.needsUpdate = true;
        }
      });
      delete _prevMaterials[key];
    }

    delete _states[key];
  }

  // ── clearAll ─────────────────────────────────────────────────────────────────
  function clearAll() {
    Object.keys(_states).forEach(function (k) { clearPreview(k); });
    Object.keys(_texCache).forEach(function (id) {
      var t = _texCache[id];
      if (t && t.dispose) t.dispose();
    });
    _texCache      = {};
    _prevMaterials = {};
    _states        = {};
    _lastError     = null;
  }

  // ── getPreviewState ───────────────────────────────────────────────────────────
  function getPreviewState(key) { return _states[key] || null; }

  // ── getSnapshot ──────────────────────────────────────────────────────────────
  function getSnapshot() {
    var counts = { APPLIED: 0, FALLBACK: 0, MISSING: 0 };
    Object.keys(_states).forEach(function (k) { counts[_states[k].status]++; });
    return {
      enabled:       true,
      previewCount:  Object.keys(_states).length,
      appliedCount:  counts.APPLIED,
      fallbackCount: counts.FALLBACK,
      missingCount:  counts.MISSING,
      states:        JSON.parse(JSON.stringify(_states)),
      cachedTextures: Object.keys(_texCache).length,
      lastError:     _lastError,
    };
  }

  global.WOSBuildingTexturePreviewController = {
    previewBuilding:  previewBuilding,
    clearPreview:     clearPreview,
    clearAll:         clearAll,
    getPreviewState:  getPreviewState,
    getSnapshot:      getSnapshot,
  };

  console.log('[WOSBuildingTexturePreviewController] ready — 0618C');
})(window);
