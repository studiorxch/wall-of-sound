// ── WOS Wall Runtime Building Texture Registry ────────────────────────────────
// 0618B_WOS_BuildingTexturePackageAuthoringPass_v1.0.0_BUILD
//
// Wall-side read-only registry for building texture packages and assignments.
// Consumes bundle.buildingTextures only — never reads Studio localStorage.
//
// Contract:
//   - activate(bundle.buildingTextures) once per bundle load
//   - Rejects unsafe runtime URLs (blob:, file:, http://, https://)
//   - Rejects unsupported MIME types
//   - Never writes localStorage
//   - Never imports Studio modules
// ─────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SOURCE = 'BuildingTextureRegistry';

  var ALLOWED_MIMES = ['image/png', 'image/jpeg', 'image/webp'];

  var _packages    = {};  // packageId → package record
  var _assignments = {};  // buildingKey → assignment record
  var _registryReady = false;
  var _lastError     = null;

  function _diag() {
    return global.WOSWallDiagnostics || { info: function(){}, warn: function(){}, error: function(){} };
  }

  function _isValidRuntimeUrl(url) {
    if (!url || typeof url !== 'string') return false;
    if (url.indexOf('blob:')    === 0) return false;
    if (url.indexOf('file:')    === 0) return false;
    if (url.indexOf('http://')  === 0) return false;
    if (url.indexOf('https://') === 0) return false;
    return true;
  }

  function _isAllowedMime(mime) {
    return ALLOWED_MIMES.indexOf(mime) !== -1;
  }

  function activate(buildingTexturesBlock) {
    _packages      = {};
    _assignments   = {};
    _registryReady = false;
    _lastError     = null;

    if (!buildingTexturesBlock) {
      _diag().info(SOURCE, 'activate_no_block', 'bundle has no buildingTextures block');
      _registryReady = true;
      return { ok: true, packagesLoaded: 0, assignmentsLoaded: 0, rejected: 0 };
    }

    var packagesArr    = buildingTexturesBlock.packages    || [];
    var assignmentsArr = buildingTexturesBlock.assignments || [];
    var rejected = 0;

    packagesArr.forEach(function (p) {
      if (!p || !p.packageId || !p.source) { rejected++; return; }
      if (p.source !== 'studio-building-texture-package') { rejected++; return; }
      if (!_isValidRuntimeUrl(p.runtimeUrl)) {
        _diag().warn(SOURCE, 'package_skipped_url', p.packageId);
        rejected++; return;
      }
      if (!_isAllowedMime(p.mimeType)) {
        _diag().warn(SOURCE, 'package_skipped_mime', p.packageId + ' | ' + p.mimeType);
        rejected++; return;
      }
      _packages[p.packageId] = {
        packageId:     p.packageId,
        source:        'studio-building-texture-package',
        runtimeUrl:    p.runtimeUrl,
        contentHash:   p.contentHash   || '',
        fileSizeBytes: p.fileSizeBytes  || 0,
        mimeType:      p.mimeType,
        width:         p.width         || null,
        height:        p.height        || null,
        materialClass: p.materialClass || 'facade',
        textureRole:   p.textureRole   || 'baseColor',
      };
    });

    assignmentsArr.forEach(function (a) {
      if (!a || !a.buildingKey) { rejected++; return; }
      // Validate all referenced packageIds exist
      var slots = a.slots || {};
      var validSlots = {};
      Object.keys(slots).forEach(function (s) {
        var slot = slots[s];
        if (slot && slot.packageId && _packages[slot.packageId]) {
          validSlots[s] = slot;
        } else {
          rejected++;
        }
      });
      if (!Object.keys(validSlots).length) return;
      _assignments[a.buildingKey] = {
        buildingKey: a.buildingKey,
        target:      a.target || {},
        slots:       validSlots,
      };
    });

    _registryReady = true;
    var loaded = Object.keys(_packages).length;
    var assigns = Object.keys(_assignments).length;
    _diag().info(SOURCE, 'activate_complete',
      'packages: ' + loaded + ', assignments: ' + assigns + ', rejected: ' + rejected);
    return { ok: true, packagesLoaded: loaded, assignmentsLoaded: assigns, rejected: rejected };
  }

  function getPackage(packageId)     { return _packages[packageId]    || null; }
  function getAssignment(buildingKey){ return _assignments[buildingKey]|| null; }
  function hasPackage(packageId)     { return Object.prototype.hasOwnProperty.call(_packages, packageId); }
  function listPackages()            { return Object.keys(_packages).map(function (k) { return _packages[k]; }); }
  function listAssignments()         { return Object.keys(_assignments).map(function (k) { return _assignments[k]; }); }
  function clear()                   { _packages = {}; _assignments = {}; _registryReady = false; _lastError = null; }

  function getSnapshot() {
    return {
      enabled:           true,
      registryReady:     _registryReady,
      packageCount:      Object.keys(_packages).length,
      assignmentCount:   Object.keys(_assignments).length,
      packageIds:        Object.keys(_packages).slice(),
      assignmentKeys:    Object.keys(_assignments).slice(),
      lastError:         _lastError,
    };
  }

  global.WOSWallRuntimeBuildingTextureRegistry = {
    activate:        activate,
    getPackage:      getPackage,
    getAssignment:   getAssignment,
    hasPackage:      hasPackage,
    listPackages:    listPackages,
    listAssignments: listAssignments,
    clear:           clear,
    getSnapshot:     getSnapshot,
  };

  // ── Debug surface ─────────────────────────────────────────────────────────────
  global._wos = global._wos || {};
  global._wos.debug = global._wos.debug || {};
  global._wos.debug.wall = global._wos.debug.wall || {};

  global._wos.debug.wall.buildingTextures = function () {
    var reg  = global.WOSWallRuntimeBuildingTextureRegistry;
    var diag = global.WOSWallDiagnostics;
    if (!reg) return { enabled: false, reason: 'WOSWallRuntimeBuildingTextureRegistry unavailable' };
    var snap = reg.getSnapshot();
    var d    = diag ? diag.snapshot() : {};
    return {
      enabled:                      true,
      registryReady:                snap.registryReady,
      packageCount:                 snap.packageCount,
      assignmentCount:              snap.assignmentCount,
      packageIds:                   snap.packageIds,
      assignmentKeys:               snap.assignmentKeys,
      buildingTextureLoadedCount:   d.buildingTextureLoadedCount   || 0,
      buildingTextureLoadErrorCount:d.buildingTextureLoadErrorCount || 0,
      buildingTextureFallbackCount: d.buildingTextureFallbackCount  || 0,
      buildingTextureRejectedCount: d.buildingTextureRejectedCount  || 0,
      buildingTextureRegistryReady: d.buildingTextureRegistryReady  || false,
      lastError:                    snap.lastError,
    };
  };

  global._wos.debug.wall.buildingTexture = function (packageId) {
    var reg = global.WOSWallRuntimeBuildingTextureRegistry;
    if (!reg) return { enabled: false };
    var rec = reg.getPackage(packageId);
    return rec ? { found: true, record: rec } : { found: false, packageId: packageId };
  };

  global._wos.debug.wall.buildingTextureAssignment = function (buildingKey) {
    var reg = global.WOSWallRuntimeBuildingTextureRegistry;
    if (!reg) return { enabled: false };
    var a = reg.getAssignment(buildingKey);
    return a ? { found: true, assignment: a } : { found: false, buildingKey: buildingKey };
  };

  console.log('[WOSWallRuntimeBuildingTextureRegistry] ready — 0618B');
})(window);
