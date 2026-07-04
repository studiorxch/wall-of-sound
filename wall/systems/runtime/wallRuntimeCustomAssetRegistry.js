// ── WOS Wall Runtime Custom Asset Registry ────────────────────────────────────
// 0616H_WOS_CustomAssetPublishRuntimePass_v1.0.0_BUILD
// Wall-side read-only registry for custom Studio asset records loaded from the
// published bundle's customAssets block.
//
// Contract:
//   - Runtime-read-only: registerAll() is called once per bundle load by the
//     bundle loader; Wall actors look up their custom asset recipe via get().
//   - Never mutates actor manifests.
//   - Never writes localStorage.
//   - Never imports Studio controllers.
//   - Does not load files from wall/assets.
// ─────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SOURCE = 'CustomAssetRegistry';

  var _records = {}; // assetId → CustomWallAssetRecord
  var _lastLoadedCount = 0;
  var _lastError = null;

  function _diag() {
    return global.WOSWallDiagnostics || { info: function(){}, warn: function(){}, error: function(){} };
  }

  // Validate a minimal record shape before registering.
  function _isValidRecord(r) {
    return r && typeof r.assetId === 'string' && r.assetId.length > 0 &&
           r.source === 'studio-custom' &&
           r.shapeRecipe && typeof r.shapeRecipe.template === 'string' &&
           r.shapeRecipe.params && typeof r.shapeRecipe.params === 'object' &&
           r.materialRecipe && typeof r.materialRecipe.slots === 'object';
  }

  // registerAll(records) — called by bundle loader with bundle.customAssets.assets
  function registerAll(records) {
    _records = {};
    _lastError = null;
    if (!Array.isArray(records)) {
      _lastError = 'registerAll: records is not an array';
      _diag().error(SOURCE, 'register_invalid_input', _lastError);
      _lastLoadedCount = 0;
      return { ok: false, loaded: 0, reason: _lastError };
    }
    var loaded = 0, rejected = 0;
    records.forEach(function (r) {
      if (!_isValidRecord(r)) {
        rejected++;
        _diag().warn(SOURCE, 'record_skipped_invalid', r && r.assetId ? r.assetId : '(no assetId)');
        return;
      }
      _records[r.assetId] = r;
      loaded++;
    });
    _lastLoadedCount = loaded;
    _diag().info(SOURCE, 'register_complete', 'loaded: ' + loaded + ', rejected: ' + rejected);
    return { ok: true, loaded: loaded, rejected: rejected };
  }

  function get(assetId) {
    return _records[assetId] || null;
  }

  function has(assetId) {
    return Object.prototype.hasOwnProperty.call(_records, assetId);
  }

  function list() {
    return Object.keys(_records).map(function (k) { return _records[k]; });
  }

  function clear() {
    _records = {};
    _lastLoadedCount = 0;
    _lastError = null;
  }

  function getSnapshot() {
    var ids = Object.keys(_records);
    return {
      enabled:          true,
      registryReady:    true,
      customAssetCount: ids.length,
      ids:              ids.slice(),
      lastError:        _lastError,
    };
  }

  global.WOSWallRuntimeCustomAssetRegistry = {
    registerAll:  registerAll,
    get:          get,
    has:          has,
    list:         list,
    clear:        clear,
    getSnapshot:  getSnapshot,
  };

  // ── _wos.debug.wall.customAssets() ───────────────────────────────────────────
  global._wos = global._wos || {};
  global._wos.debug = global._wos.debug || {};
  global._wos.debug.wall = global._wos.debug.wall || {};
  global._wos.debug.wall.customAssets = function () {
    var reg = global.WOSWallRuntimeCustomAssetRegistry;
    var d   = global.WOSWallDiagnostics;
    if (!reg) return { enabled: false, reason: 'WOSWallRuntimeCustomAssetRegistry unavailable' };
    var snap = reg.getSnapshot();
    var diag = d ? d.snapshot() : {};
    return {
      enabled:                    true,
      registryReady:              snap.registryReady,
      customAssetCount:           snap.customAssetCount,
      customAssetActorCount:      diag.customAssetActorCount      || 0,
      missingCustomAssetCount:    diag.missingCustomAssetCount    || 0,
      rejectedCustomAssetCount:   diag.rejectedCustomAssetCount   || 0,
      degradedCustomAssetActorCount: diag.degradedCustomAssetActorCount || 0,
      customAssetRecipeErrorCount: diag.customAssetRecipeErrorCount || 0,
      ids:                        snap.ids,
      lastError:                  snap.lastError,
    };
  };
  global._wos.debug.wall.customAsset = function (assetId) {
    var reg = global.WOSWallRuntimeCustomAssetRegistry;
    if (!reg) return { enabled: false, reason: 'WOSWallRuntimeCustomAssetRegistry unavailable' };
    var rec = reg.get(assetId);
    if (!rec) return { found: false, assetId: assetId };
    return { found: true, record: rec };
  };

  console.log('[WOSWallRuntimeCustomAssetRegistry] ready — 0616H');
})(window);
