// ── WOS Wall Runtime Bundle Loader ────────────────────────────────────────────
// 0614_WOS_Phase8ProductionPublishToWallRuntime_v1.0.0_BUILD
// Orchestrates the full Wall runtime bundle load sequence:
//   1. Fetch bundle from /wall/data/wos-wall-runtime-bundle.json
//   2. Validate schema
//   3. Version guard (reject lower/equal to active)
//   4. Filter actors (WOSWallActorFilter)
//   5. Activate bundle (structure suppression + material overrides)
//   6. Rollback to .previous.json on validation failure
//
// Doctrine:
//   - Wall never consumes draft state
//   - Wall never consumes assetPath
//   - Wall fails safe before it fails visible
//   - Studio and Wall share data contracts, not code
//   - Publish does not promote — promote first, then publish
//
// Auto-boots via SBE.MapboxViewportRuntime.onReady() when available.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SOURCE = 'BundleLoader';

  var BUNDLE_URL  = '/wall/data/wos-wall-runtime-bundle.json';
  var PREV_URL    = '/wall/data/wos-wall-runtime-bundle.previous.json';

  var _activeBundle  = null;  // currently live bundle
  var _activeVersion = null;  // semver string of active bundle

  function _diag() { return global.WOSWallDiagnostics || { info: function(){}, warn: function(){}, error: function(){} }; }
  function _filter() { return global.WOSWallActorFilter; }
  function _structLayer() { return global.WOSWallStructureReplacementLayer; }
  function _matApplicator() { return global.WOSWallMaterialOverrideApplicator; }
  function _customAssetReg() { return global.WOSWallRuntimeCustomAssetRegistry; }

  // ── Version comparison (simple semver patch) ─────────────────────────────────
  function _semverParts(v) {
    return String(v || '0.0.0').split('.').map(Number);
  }

  function _isNewer(incoming, active) {
    if (!active) return true;
    var a = _semverParts(incoming), b = _semverParts(active);
    for (var i = 0; i < 3; i++) {
      if ((a[i] || 0) > (b[i] || 0)) return true;
      if ((a[i] || 0) < (b[i] || 0)) return false;
    }
    return false; // equal → reject
  }

  // ── Bundle validation ────────────────────────────────────────────────────────
  function _validate(bundle) {
    if (!bundle || typeof bundle !== 'object') return 'bundle_null_or_not_object';
    if (!bundle.bundleVersion)                 return 'missing_bundleVersion';
    if (!bundle.publishedAt)                   return 'missing_publishedAt';
    if (!Array.isArray(bundle.actors))         return 'actors_not_array';
    if (!bundle.metadata || bundle.metadata.source !== 'studio') return 'metadata.source_must_be_studio';
    return null;
  }

  // ── Activate a validated, filtered actor list ────────────────────────────────
  function _activate(bundle, actors) {
    // Clear previous state
    if (_activeBundle) {
      var sl0 = _structLayer();
      if (sl0) sl0.clearBundle(_activeBundle.actors || []);
    }

    _activeBundle  = bundle;
    _activeVersion = bundle.bundleVersion;

    // Reset and seed AC12 counters
    var d = _diag();
    d.resetCounters();
    d.set('bundleVersion',    bundle.bundleVersion);
    d.set('publishedAt',      bundle.publishedAt);
    d.set('activeActorCount', actors.length);

    // Tally feed-bound actors
    var feedCount = actors.filter(function (a) { return !!a.liveTracking; }).length;
    d.set('feedBoundActorCount', feedCount);

    // Structure suppression
    var sl = _structLayer();
    if (sl) {
      var sResult = sl.applyBundle(actors);
      d.info(SOURCE, 'structure_suppression', JSON.stringify(sResult));
      d.set('structureReplacementCount', sResult.suppressed + sResult.failed);
      d.set('suppressedBuildingCount',   sResult.suppressed);
      if (sResult.failed) d.increment('degradedActorCount', sResult.failed);
    }

    // Material overrides (requires Wall to have a render layer exposing getObject3D)
    var matCount = 0;
    var ma = _matApplicator();
    if (ma) {
      actors.forEach(function (actor) {
        if (!actor.materialOverride) return;
        matCount++;
        var obj3D = global.WOSWallRenderLayer
          && global.WOSWallRenderLayer.getObject3D
          && global.WOSWallRenderLayer.getObject3D(actor.objectId);
        if (obj3D) {
          ma.apply(obj3D, actor.materialOverride, actor.objectId);
        } else {
          d.warn(SOURCE, 'mat_override_no_object3d', actor.objectId);
          d.increment('missingAssetCount');
        }
      });
      d.set('materialOverrideCount', matCount);
    }

    // ── 0616H: Custom asset registry ─────────────────────────────────────────
    var customReg = _customAssetReg();
    if (customReg) {
      customReg.clear();
      var customBlock = bundle.customAssets;
      var customRecords = (customBlock && Array.isArray(customBlock.assets)) ? customBlock.assets : [];
      var regResult = customReg.registerAll(customRecords);
      d.set('customAssetCount', regResult.loaded || 0);
      d.set('customAssetRegistryReady', true);
      if (regResult.rejected) d.increment('rejectedCustomAssetCount', regResult.rejected);

      // Count actors whose assetId references a custom asset; flag missing ones.
      var customActorCount = 0;
      var missingCount = 0;
      actors.forEach(function (actor) {
        if (actor.assetId && actor.assetId.indexOf('studio.custom.') === 0) {
          customActorCount++;
          if (!customReg.has(actor.assetId)) {
            missingCount++;
            d.warn(SOURCE, 'custom_asset_missing', actor.objectId + ' → ' + actor.assetId);
            d.increment('degradedCustomAssetActorCount');
          }
        }
      });
      d.set('customAssetActorCount', customActorCount);
      d.set('missingCustomAssetCount', missingCount);
      d.info(SOURCE, 'custom_assets_loaded',
        'count: ' + regResult.loaded + ', actors: ' + customActorCount + ', missing: ' + missingCount);
    }

    // ── 0616L: Broadcast readiness ───────────────────────────────────────────
    var brReady = global.WOSWallRuntimeBroadcastReadiness;
    if (brReady) {
      brReady.clear();
      brReady.activate(bundle.broadcastReadiness || null);
      d.set('broadcastReadinessReady', true);

      // Count actor readiness
      var brCounts = { READY: 0, WARN: 0, DEGRADE: 0, BLOCK: 0, UNKNOWN: 0 };
      actors.forEach(function (actor) {
        if (!actor.assetId) { brCounts.UNKNOWN++; return; }
        var r = brReady.readinessForAsset(actor.assetId);
        brCounts[r] = (brCounts[r] || 0) + 1;
        if (brReady.shouldDegradeAsset(actor.assetId)) {
          d.increment('broadcastFallbackRenderCount');
        }
      });
      d.set('broadcastReadyActorCount',    brCounts.READY);
      d.set('broadcastWarnActorCount',     brCounts.WARN);
      d.set('broadcastDegradedActorCount', brCounts.DEGRADE);
      d.set('broadcastBlockedActorCount',  brCounts.BLOCK);
      d.set('broadcastUnknownActorCount',  brCounts.UNKNOWN);
      d.info(SOURCE, 'broadcast_readiness_loaded',
        'ready:' + brCounts.READY + ' warn:' + brCounts.WARN +
        ' degrade:' + brCounts.DEGRADE + ' block:' + brCounts.BLOCK);
    }

    // ── 0617C: GLB asset registry ────────────────────────────────────────────
    var glbReg = global.WOSWallRuntimeGlbAssetRegistry;
    if (glbReg) {
      glbReg.clear();
      var glbResult = glbReg.activate(bundle.glbAssets || null);
      d.set('glbAssetCount',        glbResult.loaded   || 0);
      d.set('glbAssetRegistryReady', true);
      if (glbResult.rejected) d.increment('glbAssetBlockedCount', glbResult.rejected);

      // Tally readiness from registered GLB records
      var glbReadinessCounts = { READY: 0, WARN: 0, DEGRADE: 0, BLOCK: 0 };
      glbReg.list().forEach(function (rec) {
        var r = (rec.broadcastReadiness || 'UNKNOWN').toUpperCase();
        if (glbReadinessCounts[r] !== undefined) {
          glbReadinessCounts[r]++;
          if (r === 'DEGRADE' || r === 'BLOCK') {
            d.increment('glbAssetFallbackRenderCount');
          }
        } else {
          d.warn(SOURCE, 'glb_readiness_unknown', rec.assetId + ' readiness=' + rec.broadcastReadiness);
        }
      });
      d.set('glbAssetReadyCount',   glbReadinessCounts.READY);
      d.set('glbAssetWarnCount',    glbReadinessCounts.WARN);
      d.set('glbAssetDegradeCount', glbReadinessCounts.DEGRADE);
      d.increment('glbAssetBlockedCount', glbReadinessCounts.BLOCK);

      // Count actors referencing GLB assets; flag those missing from registry
      var glbActorCount   = 0;
      var glbMissingCount = 0;
      actors.forEach(function (actor) {
        if (!actor.assetId || actor.assetId.indexOf('studio.import.glb.') !== 0) return;
        glbActorCount++;
        if (!glbReg.has(actor.assetId)) {
          glbMissingCount++;
          d.warn(SOURCE, 'glb_package_missing', actor.objectId + ' → ' + actor.assetId);
          d.increment('glbAssetMissingPackageCount');
        }
      });
      d.set('glbAssetActorCount', glbActorCount);
      d.info(SOURCE, 'glb_assets_loaded',
        'count: ' + glbResult.loaded + ', actors: ' + glbActorCount + ', missing: ' + glbMissingCount +
        ', ready: ' + glbReadinessCounts.READY + ', warn: ' + glbReadinessCounts.WARN +
        ', degrade: ' + glbReadinessCounts.DEGRADE + ', block: ' + glbReadinessCounts.BLOCK);
    }

    // ── 0618A: GLB render layer activation ───────────────────────────────────
    var glbRender = global.WOSWallRuntimeGlbRenderLayer;
    if (glbRender) {
      var renderResult = glbRender.activate({ actors: actors });
      if (renderResult.attempted > 0) {
        d.set('glbAssetRenderAttemptCount', renderResult.attempted);
        d.set('glbAssetRenderLoadedCount',  renderResult.loaded);
        d.set('glbAssetRenderSkippedCount', renderResult.skipped);
        d.info(SOURCE, 'glb_render_activate',
          'attempted: ' + renderResult.attempted + ', status: ' + (renderResult.status || 'sync'));
      }
    }

    // ── 0618B: Building texture registry + applicator ────────────────────────
    var texReg = global.WOSWallRuntimeBuildingTextureRegistry;
    if (texReg) {
      texReg.clear();
      var texBlock = bundle.buildingTextures || null;
      var texResult = texReg.activate(texBlock);
      d.set('buildingTexturePackageCount',    texResult.packagesLoaded    || 0);
      d.set('buildingTextureAssignmentCount', texResult.assignmentsLoaded || 0);
      d.set('buildingTextureRegistryReady', true);
      if (texResult.rejected) {
        d.increment('buildingTextureRejectedCount', texResult.rejected);
      }
      d.info(SOURCE, 'building_textures_loaded',
        'packages: ' + (texResult.packagesLoaded || 0) +
        ', assignments: ' + (texResult.assignmentsLoaded || 0) +
        ', rejected: ' + (texResult.rejected || 0));

      var texApplicator = global.WOSWallRuntimeBuildingTextureApplicator;
      if (texApplicator) {
        texApplicator.clear();
        var applyResult = texApplicator.activateAll(actors);
        d.info(SOURCE, 'building_textures_apply_start', 'attempted: ' + applyResult.attempted);
      }
    }

    d.info(SOURCE, 'bundle_activated',
      'v' + bundle.bundleVersion + ' | actors: ' + actors.length);
  }

  // ── Rollback to previous bundle ───────────────────────────────────────────────
  function _rollback(callback) {
    _diag().warn(SOURCE, 'rollback_initiated', 'loading .previous.json');
    var sl = _structLayer();
    if (sl) sl.restoreAll();
    _activeBundle  = null;
    _activeVersion = null;

    fetch(PREV_URL + '?_=' + Date.now())
      .then(function (r) { return r.ok ? r.json() : Promise.reject('previous_not_found'); })
      .then(function (prev) {
        var err = _validate(prev);
        if (err) {
          _diag().error(SOURCE, 'rollback_prev_invalid', err);
          if (callback) callback(new Error('rollback_prev_invalid: ' + err), null);
          return;
        }
        var filterResult = _filter() ? _filter().filter(prev.actors) : { accepted: prev.actors, rejected: [] };
        _activate(prev, filterResult.accepted);
        _diag().info(SOURCE, 'rollback_complete', 'v' + prev.bundleVersion);
        if (callback) callback(null, { rollback: true, bundleVersion: prev.bundleVersion });
      })
      .catch(function (e) {
        _diag().error(SOURCE, 'rollback_failed', String(e));
        if (callback) callback(new Error('rollback_failed: ' + e), null);
      });
  }

  // ── Public: load ──────────────────────────────────────────────────────────────
  // callback: function(err, result)
  function load(callback) {
    callback = callback || function () {};
    _diag().info(SOURCE, 'load_start', BUNDLE_URL);

    fetch(BUNDLE_URL + '?_=' + Date.now())
      .then(function (r) {
        if (!r.ok) throw new Error('fetch_failed: HTTP ' + r.status);
        return r.json();
      })
      .then(function (bundle) {
        // Schema validation
        var schemaErr = _validate(bundle);
        if (schemaErr) {
          _diag().error(SOURCE, 'bundle_invalid', schemaErr);
          return _rollback(callback);
        }

        // Version guard
        if (!_isNewer(bundle.bundleVersion, _activeVersion)) {
          _diag().warn(SOURCE, 'bundle_version_rejected',
            'incoming: ' + bundle.bundleVersion + ' active: ' + _activeVersion);
          return callback(new Error('bundle_version_not_newer'), null);
        }

        // Actor filter
        var filterMod = _filter();
        var filterResult = filterMod
          ? filterMod.filter(bundle.actors)
          : { accepted: bundle.actors, rejected: [] };

        if (filterResult.rejected.length) {
          _diag().warn(SOURCE, 'actors_rejected', 'count: ' + filterResult.rejected.length);
        }

        _activate(bundle, filterResult.accepted);
        // Set rejected count after _activate (which calls resetCounters)
        _diag().set('rejectedActorCount', filterResult.rejected.length);

        callback(null, {
          ok:            true,
          bundleVersion: bundle.bundleVersion,
          publishedAt:   bundle.publishedAt,
          actorCount:    filterResult.accepted.length,
          rejectedCount: filterResult.rejected.length,
        });
      })
      .catch(function (err) {
        _diag().error(SOURCE, 'load_error', String(err));
        _rollback(callback);
      });
  }

  // ── Public: reload (explicit re-fetch, no version guard) ────────────────────
  function reload(callback) {
    _activeVersion = null;
    load(callback);
  }

  // ── Public: getActiveBundle ──────────────────────────────────────────────────
  function getActiveBundle() { return _activeBundle; }

  // ── Auto-boot ────────────────────────────────────────────────────────────────
  function _boot() {
    var sbe = global.SBE;
    if (sbe && sbe.MapboxViewportRuntime && sbe.MapboxViewportRuntime.onReady) {
      sbe.MapboxViewportRuntime.onReady(function () {
        _diag().info(SOURCE, 'auto_boot', 'MapboxViewportRuntime ready — loading bundle');
        load(function (err, result) {
          if (err) _diag().warn(SOURCE, 'auto_boot_load_failed', err.message);
          else     _diag().info(SOURCE, 'auto_boot_complete', JSON.stringify(result));
        });
      });
    } else {
      _diag().info(SOURCE, 'no_auto_boot', 'SBE.MapboxViewportRuntime.onReady not available');
    }
  }

  global.WOSWallBundleLoader = {
    load:            load,
    reload:          reload,
    getActiveBundle: getActiveBundle,
  };

  _boot();
  console.log('[WOSWallBundleLoader] ready');
})(window);
