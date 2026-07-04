// ── WOS Wall Runtime Material Override Applicator ────────────────────────────
// 0614_WOS_Phase8ProductionPublishToWallRuntime_v1.0.0_BUILD
// Applies materialOverride records from the Wall runtime bundle to Three.js
// Object3D instances already in the scene.
//
// Doctrine:
//   - Wall never imports Studio modules
//   - Wall never mutates shared materials — always clones before write
//   - paletteRef takes precedence over color if both present
//   - roughness/metalness silently ignored for MeshLambertMaterial
//   - Invalid fields: skip field, emit diagnostic
//   - No WebGL context created here
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SOURCE = 'MatOverrideApplicator';
  var HEX_RE = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

  function _diag() { return global.WOSWallDiagnostics || { info: function(){}, warn: function(){}, error: function(){} }; }
  function _THREE() { return global.THREE; }
  function _palette() { return global.WOSPalette || {}; }

  function _cloneMaterial(mesh) {
    if (!mesh.material) return;
    if (mesh.material._wosCloned) return;
    mesh.material = mesh.material.clone();
    mesh.material._wosCloned = true;
  }

  function _resolveColor(override) {
    if (override.paletteRef) {
      var entry = _palette()[override.paletteRef];
      return entry ? entry.color : null;
    }
    return (override.color && HEX_RE.test(override.color)) ? override.color : null;
  }

  function _resolveMaterialClass(override) {
    if (override.materialClass) return override.materialClass;
    if (override.paletteRef) {
      var entry = _palette()[override.paletteRef];
      return entry ? entry.materialClass : null;
    }
    return null;
  }

  function _resolveRoughness(override) {
    if (override.roughness != null) return override.roughness;
    if (override.paletteRef) {
      var entry = _palette()[override.paletteRef];
      return (entry && entry.roughness != null) ? entry.roughness : null;
    }
    return null;
  }

  function _resolveMetalness(override) {
    if (override.metalness != null) return override.metalness;
    if (override.paletteRef) {
      var entry = _palette()[override.paletteRef];
      return (entry && entry.metalness != null) ? entry.metalness : null;
    }
    return null;
  }

  function _applyToMesh(mesh, override, objectId) {
    var THREE = _THREE();
    if (!THREE || !mesh.material) return;

    var resolvedClass = _resolveMaterialClass(override);

    // Upgrade/downgrade material class if specified
    if (resolvedClass === 'standard' && !(mesh.material instanceof THREE.MeshStandardMaterial)) {
      _cloneMaterial(mesh);
      var std = new THREE.MeshStandardMaterial();
      std.color.copy(mesh.material.color || new THREE.Color(0xffffff));
      std._wosCloned = true;
      mesh.material = std;
    } else if (resolvedClass === 'lambert' && !(mesh.material instanceof THREE.MeshLambertMaterial)) {
      _cloneMaterial(mesh);
      var lam = new THREE.MeshLambertMaterial();
      lam.color.copy(mesh.material.color || new THREE.Color(0xffffff));
      lam._wosCloned = true;
      mesh.material = lam;
    } else {
      _cloneMaterial(mesh);
    }

    // Apply color
    var color = _resolveColor(override);
    if (color) {
      try { mesh.material.color.set(color); }
      catch (e) { _diag().warn(SOURCE, 'color_apply_failed', objectId + ' | ' + e.message); }
    }

    // Apply roughness/metalness only for MeshStandardMaterial
    if (mesh.material instanceof THREE.MeshStandardMaterial) {
      var roughness = _resolveRoughness(override);
      if (roughness != null) {
        if (roughness >= 0 && roughness <= 1) { mesh.material.roughness = roughness; }
        else { _diag().warn(SOURCE, 'roughness_out_of_range', objectId + ' | ' + roughness); }
      }
      var metalness = _resolveMetalness(override);
      if (metalness != null) {
        if (metalness >= 0 && metalness <= 1) { mesh.material.metalness = metalness; }
        else { _diag().warn(SOURCE, 'metalness_out_of_range', objectId + ' | ' + metalness); }
      }
    }

    mesh.material.needsUpdate = true;
  }

  // apply(object3D, override, objectId)
  // Traverses the object and applies materialOverride to all Mesh children.
  function apply(object3D, override, objectId) {
    if (!object3D || !override) return;
    var THREE = _THREE();
    if (!THREE) {
      _diag().error(SOURCE, 'three_not_ready', 'THREE.js unavailable for ' + objectId);
      return;
    }
    object3D.traverse(function (node) {
      if (node.isMesh) {
        try { _applyToMesh(node, override, objectId); }
        catch (e) { _diag().error(SOURCE, 'mesh_apply_failed', objectId + ' | ' + e.message); }
      }
    });
    _diag().info(SOURCE, 'override_applied', objectId);
  }

  global.WOSWallMaterialOverrideApplicator = { apply: apply };
  console.log('[WOSWallMaterialOverrideApplicator] ready');
})(window);
