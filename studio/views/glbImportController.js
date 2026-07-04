// ── WOS GLB Import Controller ──────────────────────────────────────────────────
// 0616J_WOS_GLBImportBridgePass_v1.0.0_BUILD
// Thin UI-state controller for the GLB Import Bridge panel in studioShell.js.
// Owns: per-session import state, last-import summary, selected imported asset.
// Does not own: file I/O (glbImportStore), rendering (actorObjectRenderLayer).
// ─────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var _selectedImportedAssetId = null;
  var _lastImportAssetId       = null;
  var _lastImportStatus        = null;   // 'ok' | error reason string
  var _lastImportWarnings      = [];
  var _lastError               = null;

  function selectAsset(assetId) { _selectedImportedAssetId = assetId; }
  function clearSelection()     { _selectedImportedAssetId = null; }

  function recordImportResult(assetId, warnings) {
    _lastImportAssetId  = assetId;
    _lastImportStatus   = 'ok';
    _lastImportWarnings = warnings || [];
    _lastError          = null;
  }

  function recordImportError(reason) {
    _lastImportStatus = reason;
    _lastError        = reason;
  }

  function getSnapshot() {
    var store  = global.WOSGlbImportStore;
    var snap   = store ? store.getSnapshot() : {};
    return {
      enabled:                 true,
      importedAssetCount:      snap.importedAssetCount      || 0,
      readyCount:              snap.readyCount              || 0,
      missingFileCount:        snap.missingFileCount        || 0,
      invalidCount:            snap.invalidCount            || 0,
      selectedImportedAssetId: _selectedImportedAssetId,
      lastImportAssetId:       _lastImportAssetId,
      lastImportStatus:        _lastImportStatus,
      lastImportWarnings:      _lastImportWarnings.slice(),
      lastError:               _lastError,
    };
  }

  global.WOSGlbImportController = {
    selectAsset:         selectAsset,
    clearSelection:      clearSelection,
    recordImportResult:  recordImportResult,
    recordImportError:   recordImportError,
    getSnapshot:         getSnapshot,

    get selectedAssetId() { return _selectedImportedAssetId; },
  };

  console.log('[WOSGlbImportController] ready — 0616J');
})(window);
