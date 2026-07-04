// ── WOS Wall Runtime Diagnostics ─────────────────────────────────────────────
// 0614_WOS_Phase8ProductionPublishToWallRuntime_v1.0.0_BUILD
// Ring-buffer event recorder + AC12-compliant debug snapshot.
// Counters are updated by the loader/filter/structure/material modules via
// the increment() method so snapshot() returns live totals.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var MAX_EVENTS = 200;
  var _events = [];

  // AC12 counters — reset on each bundle load
  var _counters = {
    bundleVersion:            null,
    publishedAt:              null,
    activeActorCount:         0,
    rejectedActorCount:       0,
    structureReplacementCount:0,
    suppressedBuildingCount:  0,
    materialOverrideCount:    0,
    feedBoundActorCount:      0,
    degradedActorCount:       0,
    missingAssetCount:        0,
    // 0616H: custom asset counters
    customAssetCount:               0,
    customAssetActorCount:          0,
    missingCustomAssetCount:        0,
    rejectedCustomAssetCount:       0,
    degradedCustomAssetActorCount:  0,
    customAssetRecipeErrorCount:    0,
    customAssetRegistryReady:       false,
    // 0616L: broadcast readiness counters
    broadcastReadyActorCount:       0,
    broadcastWarnActorCount:        0,
    broadcastDegradedActorCount:    0,
    broadcastBlockedActorCount:     0,
    broadcastUnknownActorCount:     0,
    broadcastReadinessReady:        false,
    broadcastBudgetExceededCount:   0,
    broadcastFallbackRenderCount:   0,
    // 0617C: GLB runtime asset counters
    glbAssetCount:               0,
    glbAssetActorCount:          0,
    glbAssetReadyCount:          0,
    glbAssetWarnCount:           0,
    glbAssetDegradeCount:        0,
    glbAssetBlockedCount:        0,
    glbAssetMissingPackageCount: 0,
    glbAssetLoadErrorCount:      0,
    glbAssetFallbackRenderCount: 0,
    glbAssetRegistryReady:       false,
    // 0618A: render counters
    glbAssetRenderAttemptCount:  0,
    glbAssetRenderLoadedCount:   0,
    glbAssetRenderSkippedCount:  0,
    // 0618B: building texture counters
    buildingTexturePackageCount:   0,
    buildingTextureAssignmentCount:0,
    buildingTextureLoadedCount:    0,
    buildingTextureLoadErrorCount: 0,
    buildingTextureFallbackCount:  0,
    buildingTextureRejectedCount:  0,
    buildingTextureRegistryReady:  false,
  };

  function _record(level, source, code, detail) {
    var evt = {
      ts:     new Date().toISOString(),
      level:  level,
      source: source,
      code:   code,
      detail: detail || null,
    };
    _events.push(evt);
    if (_events.length > MAX_EVENTS) _events.shift();
    var msg = '[WOS:Wall:' + source + '] ' + code + (detail ? ' | ' + detail : '');
    if (level === 'error')   console.error(msg);
    else if (level === 'warn') console.warn(msg);
    else                       console.log(msg);
    return evt;
  }

  function info(source, code, detail)  { return _record('info',  source, code, detail); }
  function warn(source, code, detail)  { return _record('warn',  source, code, detail); }
  function error(source, code, detail) { return _record('error', source, code, detail); }

  // Increment a named counter by delta (default 1).
  function increment(key, delta) {
    if (_counters.hasOwnProperty(key)) {
      _counters[key] = (_counters[key] || 0) + (delta !== undefined ? delta : 1);
    }
  }

  // Set a named counter or metadata field directly.
  function set(key, value) {
    _counters[key] = value;
  }

  // Reset all counters (called by BundleLoader at the start of each load).
  function resetCounters() {
    _counters.bundleVersion            = null;
    _counters.publishedAt              = null;
    _counters.activeActorCount         = 0;
    _counters.rejectedActorCount       = 0;
    _counters.structureReplacementCount= 0;
    _counters.suppressedBuildingCount  = 0;
    _counters.materialOverrideCount    = 0;
    _counters.feedBoundActorCount      = 0;
    _counters.degradedActorCount       = 0;
    _counters.missingAssetCount        = 0;
    // 0616H
    _counters.customAssetCount               = 0;
    _counters.customAssetActorCount          = 0;
    _counters.missingCustomAssetCount        = 0;
    _counters.rejectedCustomAssetCount       = 0;
    _counters.degradedCustomAssetActorCount  = 0;
    _counters.customAssetRecipeErrorCount    = 0;
    _counters.customAssetRegistryReady       = false;
    // 0616L
    _counters.broadcastReadyActorCount       = 0;
    _counters.broadcastWarnActorCount        = 0;
    _counters.broadcastDegradedActorCount    = 0;
    _counters.broadcastBlockedActorCount     = 0;
    _counters.broadcastUnknownActorCount     = 0;
    _counters.broadcastReadinessReady        = false;
    _counters.broadcastBudgetExceededCount   = 0;
    _counters.broadcastFallbackRenderCount   = 0;
    // 0617C
    _counters.glbAssetCount               = 0;
    _counters.glbAssetActorCount          = 0;
    _counters.glbAssetReadyCount          = 0;
    _counters.glbAssetWarnCount           = 0;
    _counters.glbAssetDegradeCount        = 0;
    _counters.glbAssetBlockedCount        = 0;
    _counters.glbAssetMissingPackageCount = 0;
    _counters.glbAssetLoadErrorCount      = 0;
    _counters.glbAssetFallbackRenderCount = 0;
    _counters.glbAssetRegistryReady       = false;
    // 0618A
    _counters.glbAssetRenderAttemptCount  = 0;
    _counters.glbAssetRenderLoadedCount   = 0;
    _counters.glbAssetRenderSkippedCount  = 0;
    // 0618B
    _counters.buildingTexturePackageCount    = 0;
    _counters.buildingTextureAssignmentCount = 0;
    _counters.buildingTextureLoadedCount     = 0;
    _counters.buildingTextureLoadErrorCount  = 0;
    _counters.buildingTextureFallbackCount   = 0;
    _counters.buildingTextureRejectedCount   = 0;
    _counters.buildingTextureRegistryReady   = false;
  }

  // AC12-compliant debug snapshot.
  function snapshot() {
    return {
      capturedAt:                new Date().toISOString(),
      bundleVersion:             _counters.bundleVersion,
      publishedAt:               _counters.publishedAt,
      activeActorCount:          _counters.activeActorCount,
      rejectedActorCount:        _counters.rejectedActorCount,
      structureReplacementCount: _counters.structureReplacementCount,
      suppressedBuildingCount:   _counters.suppressedBuildingCount,
      materialOverrideCount:     _counters.materialOverrideCount,
      feedBoundActorCount:       _counters.feedBoundActorCount,
      degradedActorCount:             _counters.degradedActorCount,
      missingAssetCount:              _counters.missingAssetCount,
      // 0616H
      customAssetCount:               _counters.customAssetCount,
      customAssetActorCount:          _counters.customAssetActorCount,
      missingCustomAssetCount:        _counters.missingCustomAssetCount,
      rejectedCustomAssetCount:       _counters.rejectedCustomAssetCount,
      degradedCustomAssetActorCount:  _counters.degradedCustomAssetActorCount,
      customAssetRecipeErrorCount:    _counters.customAssetRecipeErrorCount,
      customAssetRegistryReady:       _counters.customAssetRegistryReady,
      // 0616L
      broadcastReadyActorCount:       _counters.broadcastReadyActorCount,
      broadcastWarnActorCount:        _counters.broadcastWarnActorCount,
      broadcastDegradedActorCount:    _counters.broadcastDegradedActorCount,
      broadcastBlockedActorCount:     _counters.broadcastBlockedActorCount,
      broadcastUnknownActorCount:     _counters.broadcastUnknownActorCount,
      broadcastReadinessReady:        _counters.broadcastReadinessReady,
      broadcastBudgetExceededCount:   _counters.broadcastBudgetExceededCount,
      broadcastFallbackRenderCount:   _counters.broadcastFallbackRenderCount,
      // 0617C
      glbAssetCount:               _counters.glbAssetCount,
      glbAssetActorCount:          _counters.glbAssetActorCount,
      glbAssetReadyCount:          _counters.glbAssetReadyCount,
      glbAssetWarnCount:           _counters.glbAssetWarnCount,
      glbAssetDegradeCount:        _counters.glbAssetDegradeCount,
      glbAssetBlockedCount:        _counters.glbAssetBlockedCount,
      glbAssetMissingPackageCount: _counters.glbAssetMissingPackageCount,
      glbAssetLoadErrorCount:      _counters.glbAssetLoadErrorCount,
      glbAssetFallbackRenderCount: _counters.glbAssetFallbackRenderCount,
      glbAssetRegistryReady:       _counters.glbAssetRegistryReady,
      // 0618A
      glbAssetRenderAttemptCount:  _counters.glbAssetRenderAttemptCount,
      glbAssetRenderLoadedCount:   _counters.glbAssetRenderLoadedCount,
      glbAssetRenderSkippedCount:  _counters.glbAssetRenderSkippedCount,
      // 0618B
      buildingTexturePackageCount:    _counters.buildingTexturePackageCount,
      buildingTextureAssignmentCount: _counters.buildingTextureAssignmentCount,
      buildingTextureLoadedCount:     _counters.buildingTextureLoadedCount,
      buildingTextureLoadErrorCount:  _counters.buildingTextureLoadErrorCount,
      buildingTextureFallbackCount:   _counters.buildingTextureFallbackCount,
      buildingTextureRejectedCount:   _counters.buildingTextureRejectedCount,
      buildingTextureRegistryReady:   _counters.buildingTextureRegistryReady,
      eventCount:                _events.length,
      diagnostics:               _events.slice(),
    };
  }

  function clear() { _events = []; resetCounters(); }

  global.WOSWallDiagnostics = {
    info:          info,
    warn:          warn,
    error:         error,
    increment:     increment,
    set:           set,
    resetCounters: resetCounters,
    snapshot:      snapshot,
    clear:         clear,
  };
  console.log('[WOSWallDiagnostics] ready');
})(window);
