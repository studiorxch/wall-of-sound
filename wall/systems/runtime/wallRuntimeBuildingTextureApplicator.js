// ── WOS Wall Runtime Building Texture Applicator ──────────────────────────────
// 0618B_WOS_BuildingTexturePackageAuthoringPass_v1.0.0_BUILD
//
// Loads approved building texture packages and attempts to apply them to
// building surfaces in Broadcast.
//
// Application target: Three.js objects associated with building replacements
// (WOSWallStructureReplacementLayer / WOSWallRenderLayer.getObject3D).
//
// Degradation contract:
//   If direct application is unavailable (no Three.js object, UV inaccessible,
//   or Mapbox basemap surface), the applicator reports explicit fallback
//   diagnostics rather than claiming success.
//
//   Never blocks Wall boot.
//   Never crashes on missing objects.
// ─────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SOURCE = 'BuildingTextureApplicator';

  // Cache loaded textures by packageId — dispose on clear()
  var _textureCache  = {};  // packageId → THREE.Texture or { error }
  var _appliedActors = {};  // objectId → { packageId, slot, applied: bool }
  var _lastError     = null;

  var _loadedCount   = 0;
  var _errorCount    = 0;
  var _fallbackCount = 0;

  function _diag() {
    return global.WOSWallDiagnostics || { info: function(){}, warn: function(){}, error: function(){} };
  }

  function _reg() { return global.WOSWallRuntimeBuildingTextureRegistry; }

  function _getThree() { return global.THREE || null; }

  // ── _loadTexture(packageId, callback) ────────────────────────────────────────
  function _loadTexture(packageId, callback) {
    if (_textureCache[packageId]) {
      return callback(null, _textureCache[packageId]);
    }

    var reg = _reg();
    if (!reg) return callback(new Error('registry_unavailable'), null);
    var pkg = reg.getPackage(packageId);
    if (!pkg || !pkg.runtimeUrl) return callback(new Error('package_not_found: ' + packageId), null);

    var THREE = _getThree();
    if (!THREE || !THREE.TextureLoader) {
      return callback(new Error('THREE.TextureLoader_unavailable'), null);
    }

    var loader = new THREE.TextureLoader();
    loader.load(
      pkg.runtimeUrl,
      function (tex) {
        _textureCache[packageId] = tex;
        _loadedCount++;
        _diag().increment('buildingTextureLoadedCount');
        _diag().info(SOURCE, 'texture_loaded', packageId + ' ← ' + pkg.runtimeUrl);
        callback(null, tex);
      },
      undefined,
      function (err) {
        _lastError = err ? (err.message || String(err)) : 'unknown';
        _errorCount++;
        _diag().increment('buildingTextureLoadErrorCount');
        _diag().error(SOURCE, 'texture_load_failed', packageId + ' | ' + _lastError);
        callback(new Error(_lastError), null);
      }
    );
  }

  // ── _applyToObject3D(obj3D, texture, slot) ───────────────────────────────────
  function _applyToObject3D(obj3D, texture, slot) {
    if (!obj3D || !texture) return false;
    var THREE = _getThree();
    if (!THREE) return false;

    var applied = false;
    obj3D.traverse(function (mesh) {
      if (!mesh.isMesh) return;
      var mat = mesh.material;
      if (!mat) return;
      if (slot === 'facade') {
        if (mat.map !== undefined) {
          mat.map     = texture;
          mat.needsUpdate = true;
          applied = true;
        }
      }
    });
    return applied;
  }

  // ── applyForBuilding(objectId, buildingKey) ───────────────────────────────────
  // Resolves assignment for buildingKey, loads the texture, applies to objectId's
  // Three.js object if available.
  function applyForBuilding(objectId, buildingKey, callback) {
    callback = callback || function () {};

    var reg = _reg();
    if (!reg) {
      _fallbackCount++;
      _diag().increment('buildingTextureFallbackCount');
      _diag().warn(SOURCE, 'apply_no_registry', objectId);
      return callback(new Error('registry_unavailable'), { fallback: true });
    }

    var assignment = reg.getAssignment(buildingKey);
    if (!assignment) {
      // No texture assigned — not an error, just nothing to do
      return callback(null, { applied: false, reason: 'no_assignment' });
    }

    var slots    = assignment.slots || {};
    var slotKeys = Object.keys(slots);
    if (!slotKeys.length) {
      return callback(null, { applied: false, reason: 'no_slots' });
    }

    // Use first slot (facade preferred)
    var slotName = slots['facade'] ? 'facade' : slotKeys[0];
    var slot     = slots[slotName];
    if (!slot || !slot.packageId) {
      return callback(null, { applied: false, reason: 'slot_no_packageId' });
    }

    _loadTexture(slot.packageId, function (err, texture) {
      if (err) {
        _fallbackCount++;
        _diag().increment('buildingTextureFallbackCount');
        _diag().warn(SOURCE, 'apply_fallback', objectId + ' | ' + err.message);
        return callback(null, { fallback: true, reason: err.message });
      }

      // Find the Three.js object for this objectId
      var obj3D = null;
      var rl    = global.WOSWallRenderLayer;
      var glbRl = global.WOSWallRuntimeGlbRenderLayer;
      if (rl && rl.getObject3D)    obj3D = rl.getObject3D(objectId);
      if (!obj3D && glbRl && glbRl.getObject3D) obj3D = glbRl.getObject3D(objectId);

      if (!obj3D) {
        // No Three.js object for this building — explicit fallback, not a failure
        _fallbackCount++;
        _diag().increment('buildingTextureFallbackCount');
        _diag().info(SOURCE, 'apply_no_object3d',
          objectId + ' — texture application unavailable, fallback material used');
        _appliedActors[objectId] = { packageId: slot.packageId, slot: slotName, applied: false };
        return callback(null, {
          fallback: true,
          reason:   'no_three_object: texture application unavailable, fallback material used',
        });
      }

      var applied = _applyToObject3D(obj3D, texture, slotName);
      _appliedActors[objectId] = { packageId: slot.packageId, slot: slotName, applied: applied };
      if (!applied) {
        _fallbackCount++;
        _diag().increment('buildingTextureFallbackCount');
        _diag().warn(SOURCE, 'apply_no_uv', objectId + ' — UV/material slot unavailable');
      } else {
        _diag().info(SOURCE, 'apply_success', objectId + ' slot:' + slotName);
      }
      callback(null, { applied: applied, slot: slotName,
        fallback: !applied,
        reason:   applied ? null : 'uv_or_material_slot_unavailable' });
    });
  }

  // ── activateAll(actors) ───────────────────────────────────────────────────────
  // Called by bundle loader after registry activation.
  // For each actor that has a building assignment, attempts texture application.
  function activateAll(actors) {
    var reg = _reg();
    if (!reg || !actors) return { ok: true, attempted: 0 };

    var attempted = 0;
    actors.forEach(function (actor) {
      if (!actor || !actor.objectId) return;
      // Resolve buildingKey from actor structure fields
      var s = actor.structure || {};
      if (!s.mapboxFeatureId) return;
      var sid  = s.mapboxSourceId    || 'composite';
      var sl   = s.mapboxSourceLayer || 'building';
      var fid  = String(s.mapboxFeatureId);
      var key  = sid + '|' + sl + '|' + fid;
      if (!reg.getAssignment(key)) return;
      attempted++;
      applyForBuilding(actor.objectId, key, function () {});
    });
    return { ok: true, attempted: attempted };
  }

  function clear() {
    // Dispose loaded textures
    Object.keys(_textureCache).forEach(function (id) {
      var t = _textureCache[id];
      if (t && t.dispose) t.dispose();
    });
    _textureCache  = {};
    _appliedActors = {};
    _loadedCount   = 0;
    _errorCount    = 0;
    _fallbackCount = 0;
    _lastError     = null;
  }

  function getSnapshot() {
    return {
      enabled:        true,
      loadedCount:    _loadedCount,
      errorCount:     _errorCount,
      fallbackCount:  _fallbackCount,
      cachedPackages: Object.keys(_textureCache).length,
      appliedActors:  Object.keys(_appliedActors).length,
      lastError:      _lastError,
    };
  }

  global.WOSWallRuntimeBuildingTextureApplicator = {
    activateAll:      activateAll,
    applyForBuilding: applyForBuilding,
    clear:            clear,
    getSnapshot:      getSnapshot,
  };

  console.log('[WOSWallRuntimeBuildingTextureApplicator] ready — 0618B');
})(window);
