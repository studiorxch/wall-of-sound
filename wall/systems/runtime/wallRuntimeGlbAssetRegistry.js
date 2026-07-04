// ── WOS Wall Runtime GLB Asset Registry ───────────────────────────────────────
// 0617C_WOS_GLBAssetRuntimePackagingPass_v1.0.0_BUILD
// Wall-side read-only registry for packaged GLB assets loaded from the
// published bundle's glbAssets block.
//
// Contract:
//   - Runtime-read-only: activate() is called once per bundle load.
//   - Never writes localStorage.
//   - Never imports Studio controllers.
//   - Never reads Studio GLB import records.
//   - Only consumes bundle.glbAssets published by studioPublisher.
//   - runtimeUrl is the relative path used to load the GLB file.
// ─────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SOURCE = 'GlbAssetRegistry';

  var _records = {};   // assetId → glb runtime record
  var _registryReady = false;
  var _lastError     = null;

  function _diag() {
    return global.WOSWallDiagnostics || { info: function(){}, warn: function(){}, error: function(){} };
  }

  function _isValidRecord(r) {
    return r &&
      typeof r.assetId === 'string' && r.assetId.length > 0 &&
      r.source === 'studio-glb-runtime-package' &&
      typeof r.runtimeUrl === 'string' && r.runtimeUrl.length > 0 &&
      // runtimeUrl must be relative — no objectUrl, no file://, no absolute paths
      r.runtimeUrl.indexOf('blob:')   === -1 &&
      r.runtimeUrl.indexOf('file:')   === -1 &&
      r.runtimeUrl.indexOf('http://' ) === -1 &&
      r.runtimeUrl.indexOf('https://') === -1;
  }

  // activate(glbAssetsBlock) — called by bundle loader with bundle.glbAssets
  function activate(glbAssetsBlock) {
    _records       = {};
    _registryReady = false;
    _lastError     = null;

    if (!glbAssetsBlock) {
      _diag().info(SOURCE, 'activate_no_block', 'bundle has no glbAssets block');
      _registryReady = true;
      return { ok: true, loaded: 0, rejected: 0 };
    }

    var assets = glbAssetsBlock.assets;
    if (!Array.isArray(assets)) {
      _lastError = 'glbAssets.assets is not an array';
      _diag().error(SOURCE, 'activate_invalid', _lastError);
      return { ok: false, loaded: 0, reason: _lastError };
    }

    var loaded = 0, rejected = 0;
    assets.forEach(function (r) {
      if (!_isValidRecord(r)) {
        rejected++;
        _diag().warn(SOURCE, 'record_skipped', r && r.assetId ? r.assetId : '(no assetId)');
        return;
      }
      // Store only safe runtime fields — never store objectUrl/localPath/base64
      _records[r.assetId] = {
        assetId:           r.assetId,
        packageId:         r.packageId  || '',
        source:            'studio-glb-runtime-package',
        runtimeUrl:        r.runtimeUrl,
        fileSizeBytes:     typeof r.fileSizeBytes === 'number' ? r.fileSizeBytes : 0,
        contentHash:       r.contentHash || '',
        broadcastReadiness: r.broadcastReadiness || 'UNKNOWN',
        boundsM:           r.boundsM        || { x: 0, y: 0, z: 0 },
        scaleToMeters:     r.scaleToMeters  != null ? r.scaleToMeters : 1,
        meshCount:         r.meshCount      || 0,
        materialCount:     r.materialCount  || 0,
      };
      loaded++;
    });

    _registryReady = true;
    _diag().info(SOURCE, 'activate_complete', 'loaded: ' + loaded + ', rejected: ' + rejected);
    return { ok: true, loaded: loaded, rejected: rejected };
  }

  function get(assetId)   { return _records[assetId] || null; }
  function has(assetId)   { return Object.prototype.hasOwnProperty.call(_records, assetId); }
  function list()         { return Object.keys(_records).map(function (k) { return _records[k]; }); }
  function clear()        { _records = {}; _registryReady = false; _lastError = null; }

  function getSnapshot() {
    var ids = Object.keys(_records);
    return {
      enabled:       true,
      registryReady: _registryReady,
      glbAssetCount: ids.length,
      ids:           ids.slice(),
      lastError:     _lastError,
    };
  }

  global.WOSWallRuntimeGlbAssetRegistry = {
    activate:    activate,
    get:         get,
    has:         has,
    list:        list,
    clear:       clear,
    getSnapshot: getSnapshot,
  };

  // ── Debug surface ─────────────────────────────────────────────────────────────
  global._wos = global._wos || {};
  global._wos.debug = global._wos.debug || {};
  global._wos.debug.wall = global._wos.debug.wall || {};

  global._wos.debug.wall.glbAssets = function () {
    var reg  = global.WOSWallRuntimeGlbAssetRegistry;
    var diag = global.WOSWallDiagnostics;
    if (!reg) return { enabled: false, reason: 'WOSWallRuntimeGlbAssetRegistry unavailable' };
    var snap = reg.getSnapshot();
    var d    = diag ? diag.snapshot() : {};
    return {
      enabled:                 true,
      registryReady:           snap.registryReady,
      glbAssetCount:           snap.glbAssetCount,
      glbAssetActorCount:      d.glbAssetActorCount      || 0,
      glbAssetReadyCount:      d.glbAssetReadyCount      || 0,
      glbAssetWarnCount:       d.glbAssetWarnCount       || 0,
      glbAssetDegradeCount:    d.glbAssetDegradeCount    || 0,
      glbAssetBlockedCount:    d.glbAssetBlockedCount    || 0,
      glbAssetMissingPkgCount: d.glbAssetMissingPackageCount || 0,
      glbAssetLoadErrorCount:  d.glbAssetLoadErrorCount  || 0,
      glbAssetFallbackCount:   d.glbAssetFallbackRenderCount || 0,
      ids:                     snap.ids,
      lastError:               snap.lastError,
    };
  };

  global._wos.debug.wall.glbAsset = function (assetId) {
    var reg = global.WOSWallRuntimeGlbAssetRegistry;
    if (!reg) return { enabled: false, reason: 'WOSWallRuntimeGlbAssetRegistry unavailable' };
    var rec = reg.get(assetId);
    if (!rec) return { found: false, assetId: assetId };
    return { found: true, record: rec };
  };

  console.log('[WOSWallRuntimeGlbAssetRegistry] ready — 0617C');
})(window);
