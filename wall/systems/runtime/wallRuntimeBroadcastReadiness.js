// ── WOS Wall Runtime Broadcast Readiness ──────────────────────────────────────
// 0616L_WOS_BroadcastReadyCustomObjectPass_v1.0.0_BUILD
// Wall-side read-only broadcast readiness registry.
// Activated from bundle.broadcastReadiness — never reads Studio localStorage,
// never fetches external files, never mutates actor manifests.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var _readiness  = {};   // assetId → { readiness, kind, score, checks }
  var _budget     = null;
  var _summary    = null;
  var _ready      = false;
  var _lastError  = null;

  function _diag() {
    return global.WOSWallDiagnostics ||
      { info: function(){}, warn: function(){}, error: function(){} };
  }

  function activate(bundleBroadcastReadiness) {
    _readiness = {};
    _budget    = null;
    _summary   = null;
    _ready     = false;
    _lastError = null;

    if (!bundleBroadcastReadiness) {
      _diag().info('BroadcastReadiness', 'no_broadcast_block', 'bundle.broadcastReadiness absent — defaulting to UNKNOWN for all');
      _ready = true;
      return;
    }

    try {
      _budget  = bundleBroadcastReadiness.budget  || null;
      _summary = bundleBroadcastReadiness.summary || null;
      var assets = bundleBroadcastReadiness.assets || {};
      Object.keys(assets).forEach(function (assetId) {
        var rec = assets[assetId];
        if (rec && rec.readiness) {
          _readiness[assetId] = {
            readiness: rec.readiness,
            kind:      rec.kind      || 'unknown',
            score:     rec.score     || 0,
            checks:    rec.checks    || [],
          };
        }
      });
      _ready = true;
      _diag().info('BroadcastReadiness', 'activated',
        'assets: ' + Object.keys(_readiness).length);
    } catch (e) {
      _lastError = e.message;
      _diag().error('BroadcastReadiness', 'activate_failed', e.message);
      _ready = true;  // fail open at Wall level — diagnostics only
    }
  }

  function readinessForAsset(assetId) {
    if (!assetId) return 'UNKNOWN';
    var rec = _readiness[assetId];
    return rec ? rec.readiness : 'UNKNOWN';
  }

  function shouldDegradeAsset(assetId) {
    var r = readinessForAsset(assetId);
    return r === 'DEGRADE' || r === 'BLOCK';
  }

  function clear() {
    _readiness  = {};
    _budget     = null;
    _summary    = null;
    _ready      = false;
    _lastError  = null;
  }

  function getSnapshot() {
    return {
      ready:        _ready,
      assetCount:   Object.keys(_readiness).length,
      budget:       _budget,
      summary:      _summary,
      assets:       Object.assign({}, _readiness),
      lastError:    _lastError,
    };
  }

  global.WOSWallRuntimeBroadcastReadiness = {
    activate:           activate,
    readinessForAsset:  readinessForAsset,
    shouldDegradeAsset: shouldDegradeAsset,
    getSnapshot:        getSnapshot,
    clear:              clear,
  };

  // Debug surface
  global._wos = global._wos || {};
  global._wos.debug = global._wos.debug || {};
  global._wos.debug.wall = global._wos.debug.wall || {};
  global._wos.debug.wall.broadcastReadiness = function () {
    return global.WOSWallRuntimeBroadcastReadiness.getSnapshot();
  };
  global._wos.debug.wall.broadcastAsset = function (assetId) {
    var snap = global.WOSWallRuntimeBroadcastReadiness.getSnapshot();
    return snap.assets[assetId] || { readiness: 'UNKNOWN', assetId: assetId };
  };

  console.log('[WOSWallRuntimeBroadcastReadiness] ready — 0616L');
})(window);
