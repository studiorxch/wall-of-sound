// ── WOS GLB Runtime Package Store ─────────────────────────────────────────────
// 0617C_WOS_GLBAssetRuntimePackagingPass_v1.0.0_BUILD
// Converts imported Studio GLBs into packaged, Broadcast-loadable assets.
//
// Contract:
//   - Package records are metadata-only. No File/Blob/ArrayBuffer/objectUrl/base64 persisted.
//   - Package writes the binary to wall/assets/glb/ via local publish server.
//   - Actor manifests remain assetId-only.
//   - Wall/Broadcast reads glbAssets from published bundle, not from Studio localStorage.
//   - BLOCK-readiness assets cannot be packaged.
//   - Missing-file assets cannot be packaged.
//
// Storage key: wos.studio.glbRuntimePackages.v1
// ─────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var STORAGE_KEY      = 'wos.studio.glbRuntimePackages.v1';
  var PACKAGE_ENDPOINT = 'http://localhost:5503/wos/package-glb';

  var _packages   = {};  // assetId → package record
  var _lastError  = null;

  // ── Slug / hash / filename helpers ───────────────────────────────────────────
  function _slugify(s) {
    return (s || 'asset').toLowerCase()
      .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'asset';
  }

  // Simple FNV-32 hash over a Uint8Array — 6 hex chars for filename uniqueness.
  function _fnv32(uint8Array) {
    var hash = 0x811c9dc5;
    for (var i = 0; i < uint8Array.length; i++) {
      hash ^= uint8Array[i];
      hash = (hash * 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0').slice(0, 6);
  }

  function _packageFileName(assetId, hash) {
    var slug = _slugify(assetId.replace(/\./g, '_'));
    return slug + '__' + hash + '.glb';
  }

  function _packageId(assetId, hash) {
    var slug = _slugify(assetId.split('.').slice(-2).join('_'));
    return 'glb.pkg.' + slug + '.' + hash;
  }

  // ── Persistence ───────────────────────────────────────────────────────────────
  function _save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_packages)); } catch (e) {}
  }

  function _load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') _packages = parsed;
    } catch (e) {}
  }

  // ── packageGlb(assetId, callback) ────────────────────────────────────────────
  // Reads objectUrl from WOSGlbImportStore, fetches binary, POSTs to server.
  // callback: function(err, { packageId, runtimeUrl, packageRecord })
  function packageGlb(assetId, callback) {
    callback = callback || function () {};
    _lastError = null;

    var glbStore = global.WOSGlbImportStore;
    if (!glbStore) {
      _lastError = 'WOSGlbImportStore_not_loaded';
      return callback(new Error(_lastError), null);
    }

    var importRec = glbStore.get(assetId);
    if (!importRec) {
      _lastError = 'asset_not_found';
      return callback(new Error('Asset not found: ' + assetId), null);
    }

    // Require objectUrl to be attached
    var objectUrl = glbStore.getObjectUrl(assetId);
    if (!objectUrl || (importRec.glbImport && importRec.glbImport.status === 'missing-file')) {
      _lastError = 'missing-file';
      return callback(new Error('Re-attach GLB before packaging for Broadcast.'), null);
    }

    // Require readiness is not BLOCK
    var analyzer = global.WOSBroadcastReadinessAnalyzer;
    if (analyzer) {
      try {
        var readiness = analyzer.analyzeAsset(assetId);
        if (readiness.readiness === 'BLOCK') {
          _lastError = 'blocked';
          return callback(new Error('Cannot package BLOCK asset. Fix GLB or reduce complexity.'), null);
        }
      } catch (e) {}
    }

    // Fetch binary from objectUrl
    fetch(objectUrl)
      .then(function (r) {
        if (!r.ok) throw new Error('objectUrl_fetch_failed: HTTP ' + r.status);
        return r.arrayBuffer();
      })
      .then(function (buf) {
        var uint8 = new Uint8Array(buf);
        var hash  = _fnv32(uint8);
        var pkgFileName = _packageFileName(assetId, hash);
        var pkgId       = _packageId(assetId, hash);
        var runtimeUrl  = './assets/glb/' + pkgFileName;

        var gi = importRec.glbImport || {};
        var metadataPayload = JSON.stringify({
          assetId:       assetId,
          fileName:      gi.fileName || '',
          fileSizeBytes: buf.byteLength,
          contentHash:   hash,
          meshCount:     gi.meshCount  || 0,
          materialCount: gi.matCount   || gi.materialCount || 0,
          boundsM:       gi.boundsM    || { x: 0, y: 0, z: 0 },
          scaleToMeters: gi.scaleToMeters != null ? gi.scaleToMeters : 1,
        });

        // POST binary to local package server
        return fetch(PACKAGE_ENDPOINT, {
          method:  'POST',
          headers: {
            'Content-Type':      'application/octet-stream',
            'X-Asset-Id':        assetId,
            'X-Package-Filename': pkgFileName,
            'X-Metadata':        metadataPayload,
          },
          body: buf,
        }).then(function (r2) {
          if (!r2.ok) return r2.json().then(function (e) { throw new Error(e.error || 'package_server_error'); });
          return r2.json();
        }).then(function (serverResult) {
          if (!serverResult.ok) throw new Error(serverResult.error || 'package_server_rejected');

          var now = new Date().toISOString();
          var brReadiness = 'UNKNOWN';
          if (analyzer) {
            try { brReadiness = (analyzer.analyzeAsset(assetId).readiness || 'UNKNOWN'); } catch (e) {}
          }

          var rec = {
            packageId:        pkgId,
            assetId:          assetId,
            source:           'studio-glb-runtime-package',
            status:           'packaged',
            fileName:         gi.fileName || '',
            packageFileName:  pkgFileName,
            runtimeUrl:       runtimeUrl,
            fileSizeBytes:    serverResult.fileSizeBytes || buf.byteLength,
            contentHash:      serverResult.contentHash  || hash,
            packagedAt:       now,
            validatedAt:      gi.validatedAt || now,
            broadcastReadiness: brReadiness,
            metadata: {
              meshCount:              gi.meshCount  || 0,
              materialCount:          gi.matCount   || gi.materialCount || 0,
              textureWarningCount:    0,
              animationWarningCount:  0,
              skinningWarningCount:   0,
              boundsM:                gi.boundsM    || { x: 0, y: 0, z: 0 },
              scaleToMeters:          gi.scaleToMeters != null ? gi.scaleToMeters : 1,
            },
          };

          _packages[assetId] = rec;
          _save();
          callback(null, { packageId: pkgId, runtimeUrl: runtimeUrl, packageRecord: rec });
        });
      })
      .catch(function (err) {
        _lastError = err.message;
        callback(err, null);
      });
  }

  function get(assetId)    { return _packages[assetId] || null; }
  function has(assetId)    { return Object.prototype.hasOwnProperty.call(_packages, assetId); }
  function list()          { return Object.keys(_packages).map(function (id) { return _packages[id]; }); }

  function remove(assetId) {
    if (!_packages[assetId]) return { ok: false, reason: 'package_not_found' };
    delete _packages[assetId];
    _save();
    return { ok: true };
  }

  // getForBundle() — sanitized records for bundle.glbAssets.assets[]
  // Forbidden: objectUrl, localPath, absolutePath, base64, File, Blob
  function getForBundle(assetIds) {
    var result = [];
    (assetIds || Object.keys(_packages)).forEach(function (id) {
      var rec = _packages[id];
      if (!rec || rec.status !== 'packaged') return;
      result.push({
        assetId:           rec.assetId,
        packageId:         rec.packageId,
        source:            'studio-glb-runtime-package',
        runtimeUrl:        rec.runtimeUrl,
        fileSizeBytes:     rec.fileSizeBytes,
        contentHash:       rec.contentHash,
        broadcastReadiness: rec.broadcastReadiness,
        boundsM:           (rec.metadata && rec.metadata.boundsM) || { x: 0, y: 0, z: 0 },
        scaleToMeters:     (rec.metadata && rec.metadata.scaleToMeters) != null ? rec.metadata.scaleToMeters : 1,
        meshCount:         (rec.metadata && rec.metadata.meshCount)     || 0,
        materialCount:     (rec.metadata && rec.metadata.materialCount) || 0,
      });
    });
    return result;
  }

  function getSnapshot() {
    var ids       = Object.keys(_packages);
    var packaged  = ids.filter(function (id) { return _packages[id].status === 'packaged'; });
    var missing   = ids.filter(function (id) { return _packages[id].status === 'missing-file'; });
    var blocked   = ids.filter(function (id) { return _packages[id].status === 'blocked'; });
    return {
      enabled:         true,
      packageCount:    ids.length,
      packagedCount:   packaged.length,
      missingCount:    missing.length,
      blockedCount:    blocked.length,
      packagedAssetIds: packaged,
      lastError:       _lastError,
    };
  }

  _load();

  global.WOSGlbRuntimePackageStore = {
    packageGlb:    packageGlb,
    get:           get,
    has:           has,
    list:          list,
    remove:        remove,
    getForBundle:  getForBundle,
    getSnapshot:   getSnapshot,
    PACKAGE_ENDPOINT: PACKAGE_ENDPOINT,
  };

  console.log('[WOSGlbRuntimePackageStore] ready — 0617C | ' + Object.keys(_packages).length + ' package(s) loaded');
})(window);
