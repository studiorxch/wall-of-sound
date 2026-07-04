// ── WOS Broadcast Readiness Analyzer ─────────────────────────────────────────
// 0616L_WOS_BroadcastReadyCustomObjectPass_v1.0.0_BUILD
// Studio-side analyzer for broadcast safety of custom assets, imported GLBs,
// and compositions.
// Readiness levels: READY | WARN | DEGRADE | BLOCK | UNKNOWN
// This module is diagnostic only — it never writes to actor manifests.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var BUDGET = {
    maxCustomAssetActorsVisible:        250,
    maxImportedGlbActorsVisible:        40,
    maxImportedGlbFileSizeBytes:        10 * 1024 * 1024,
    maxImportedGlbMeshCount:            50,
    maxImportedGlbMaterialCount:        20,
    maxCompositionChildrenPerPlacement: 100,
    maxCompositionBoundsM:              1000,
    maxCustomAssetRecipeParams:         32,
    maxMaterialSlots:                   12,
  };

  // Readiness score thresholds: check results accumulate a score; higher = worse
  var SCORE_WARN    = 10;
  var SCORE_DEGRADE = 25;
  var SCORE_BLOCK   = 50;

  function _scoreToReadiness(score, hasBlock) {
    if (hasBlock)          return 'BLOCK';
    if (score >= SCORE_BLOCK)   return 'BLOCK';
    if (score >= SCORE_DEGRADE) return 'DEGRADE';
    if (score >= SCORE_WARN)    return 'WARN';
    return 'READY';
  }

  function _check(id, result, message, score) {
    return { id: id, result: result, message: message, score: score || 0 };
  }

  // ── Custom asset analysis ─────────────────────────────────────────────────────

  function analyzeCustomAsset(asset) {
    if (!asset) return { id: null, kind: 'custom-asset', readiness: 'UNKNOWN', score: 0, checks: [], diagnostics: {} };
    var checks  = [];
    var score   = 0;
    var hasBlock = false;

    // Resolve check
    var resolver = global.WOSAssetResolver;
    if (resolver) {
      var r = resolver.resolve(asset.id);
      if (r.placeholder) {
        checks.push(_check('BROADCAST_ASSET_RESOLVES', 'fail', 'asset does not resolve', 50));
        hasBlock = true;
      } else {
        checks.push(_check('BROADCAST_ASSET_RESOLVES', 'pass', 'asset resolves'));
      }
    }

    // Removed check
    if (asset._customAssetRemoved) {
      checks.push(_check('BROADCAST_ASSET_NOT_REMOVED', 'fail', 'asset is soft-removed', 50));
      hasBlock = true;
    }

    // shapeRecipe param count
    var paramCount = 0;
    if (asset.shapeRecipe && asset.shapeRecipe.params) {
      paramCount = Object.keys(asset.shapeRecipe.params).length;
      if (paramCount > BUDGET.maxCustomAssetRecipeParams) {
        checks.push(_check('BROADCAST_RECIPE_PARAM_COUNT', 'warn',
          'shapeRecipe params (' + paramCount + ') exceeds budget (' + BUDGET.maxCustomAssetRecipeParams + ')', 15));
        score += 15;
      } else {
        checks.push(_check('BROADCAST_RECIPE_PARAM_COUNT', 'pass', 'param count ok: ' + paramCount));
      }
    }

    // materialRecipe slot count
    var slotCount = 0;
    if (asset.materialRecipe && asset.materialRecipe.slots) {
      slotCount = Object.keys(asset.materialRecipe.slots).length;
      if (slotCount > BUDGET.maxMaterialSlots) {
        checks.push(_check('BROADCAST_MATERIAL_SLOT_COUNT', 'warn',
          'material slots (' + slotCount + ') exceeds budget (' + BUDGET.maxMaterialSlots + ')', 10));
        score += 10;
      } else {
        checks.push(_check('BROADCAST_MATERIAL_SLOT_COUNT', 'pass', 'slot count ok: ' + slotCount));
      }
    }

    // Governance validator cross-check
    var validator = global.WOSCustomAssetGovernanceValidator;
    if (validator) {
      var govChecks = validator.validateAssetById(asset.id);
      var govFails  = govChecks.filter(function (c) { return c.result === 'fail'; });
      if (govFails.length) {
        checks.push(_check('BROADCAST_GOVERNANCE_PASS', 'fail',
          'governance fails: ' + govFails.map(function (c) { return c.id; }).join(', '), 50));
        hasBlock = true;
      } else {
        checks.push(_check('BROADCAST_GOVERNANCE_PASS', 'pass', 'governance ok'));
      }
    }

    checks.forEach(function (c) { if (c.result !== 'pass') score += (c.score || 0); });
    // dedupe score
    score = Math.min(score, 100);

    return {
      id:         asset.id,
      kind:       'custom-asset',
      readiness:  _scoreToReadiness(score, hasBlock),
      score:      score,
      checks:     checks,
      diagnostics: {
        meshCount:       null,
        materialCount:   slotCount,
        fileSizeBytes:   null,
        childCount:      null,
        boundsM:         null,
        hasMissingFile:  false,
        paramCount:      paramCount,
      },
    };
  }

  // ── Imported GLB analysis ─────────────────────────────────────────────────────

  function analyzeImportedGlbAsset(asset) {
    if (!asset) return { id: null, kind: 'glb-import', readiness: 'UNKNOWN', score: 0, checks: [], diagnostics: {} };
    var checks   = [];
    var score    = 0;
    var hasBlock = false;
    var gi = asset.glbImport || {};

    // Missing file
    var hasMissingFile = gi.status === 'missing-file' || !gi.status;
    if (hasMissingFile) {
      checks.push(_check('BROADCAST_GLB_FILE_PRESENT', 'warn',
        'GLB file not attached (missing-file) — proxy fallback active', 20));
      score += 20;
    } else {
      checks.push(_check('BROADCAST_GLB_FILE_PRESENT', 'pass', 'GLB file attached'));
    }

    // File size
    var sizeBytes = gi.fileSizeBytes || 0;
    if (sizeBytes > BUDGET.maxImportedGlbFileSizeBytes) {
      checks.push(_check('BROADCAST_GLB_FILE_SIZE', 'fail',
        'file size ' + Math.round(sizeBytes / 1024 / 1024) + 'MB exceeds ' +
        Math.round(BUDGET.maxImportedGlbFileSizeBytes / 1024 / 1024) + 'MB budget', 40));
      score += 40;
    } else if (sizeBytes > BUDGET.maxImportedGlbFileSizeBytes * 0.75) {
      checks.push(_check('BROADCAST_GLB_FILE_SIZE', 'warn', 'file size near budget: ' + Math.round(sizeBytes/1024) + 'KB', 10));
      score += 10;
    } else {
      checks.push(_check('BROADCAST_GLB_FILE_SIZE', 'pass', 'file size ok: ' + Math.round(sizeBytes/1024) + 'KB'));
    }

    // Mesh count
    var meshCount = (gi.boundsM && gi.meshCount) || 0;
    if (meshCount > BUDGET.maxImportedGlbMeshCount) {
      checks.push(_check('BROADCAST_GLB_MESH_COUNT', 'fail',
        'mesh count (' + meshCount + ') exceeds budget (' + BUDGET.maxImportedGlbMeshCount + ')', 30));
      score += 30;
    } else if (meshCount > BUDGET.maxImportedGlbMeshCount * 0.7) {
      checks.push(_check('BROADCAST_GLB_MESH_COUNT', 'warn', 'mesh count near budget: ' + meshCount, 10));
      score += 10;
    }

    // Material count
    var matCount = gi.materialCount || 0;
    if (matCount > BUDGET.maxImportedGlbMaterialCount) {
      checks.push(_check('BROADCAST_GLB_MATERIAL_COUNT', 'warn',
        'material count (' + matCount + ') exceeds budget (' + BUDGET.maxImportedGlbMaterialCount + ')', 15));
      score += 15;
    }

    // Warnings (textures, animations, skinning from glbImportStore validateScene)
    var warnings = gi.validationWarnings || [];
    if (warnings.indexOf('has_textures') !== -1) {
      checks.push(_check('BROADCAST_GLB_NO_TEXTURES', 'warn', 'GLB has textures (broadcast cost)', 8));
      score += 8;
    }
    if (warnings.indexOf('has_animations') !== -1) {
      checks.push(_check('BROADCAST_GLB_NO_ANIMATIONS', 'warn', 'GLB has animations (broadcast cost)', 10));
      score += 10;
    }
    if (warnings.indexOf('has_skinning') !== -1) {
      checks.push(_check('BROADCAST_GLB_NO_SKINNING', 'warn', 'GLB has skinning (broadcast cost)', 15));
      score += 15;
    }

    score = Math.min(score, 100);
    // missing-file → always at least DEGRADE, not BLOCK
    var readiness = _scoreToReadiness(score, hasBlock);
    if (hasMissingFile && readiness === 'READY') readiness = 'DEGRADE';

    return {
      id:         asset.id,
      kind:       'glb-import',
      readiness:  readiness,
      score:      score,
      checks:     checks,
      diagnostics: {
        meshCount:       meshCount,
        materialCount:   matCount,
        fileSizeBytes:   sizeBytes,
        childCount:      null,
        boundsM:         gi.boundsM || null,
        hasMissingFile:  hasMissingFile,
      },
    };
  }

  // ── Composition analysis ──────────────────────────────────────────────────────

  function analyzeComposition(composition) {
    if (!composition || !composition.composition) {
      return { id: null, kind: 'composition', readiness: 'UNKNOWN', score: 0, checks: [], diagnostics: {} };
    }
    var checks   = [];
    var score    = 0;
    var hasBlock = false;
    var comp     = composition.composition;

    // Child count
    var childCount = comp.childCount || 0;
    if (childCount === 0) {
      checks.push(_check('BROADCAST_COMP_HAS_CHILDREN', 'fail', 'composition has no children', 50));
      hasBlock = true;
    } else if (childCount > BUDGET.maxCompositionChildrenPerPlacement) {
      checks.push(_check('BROADCAST_COMP_CHILD_COUNT', 'fail',
        'child count (' + childCount + ') exceeds budget (' + BUDGET.maxCompositionChildrenPerPlacement + ')', 50));
      hasBlock = true;
    } else if (childCount > BUDGET.maxCompositionChildrenPerPlacement * 0.5) {
      checks.push(_check('BROADCAST_COMP_CHILD_COUNT', 'warn',
        'child count (' + childCount + ') near budget', 15));
      score += 15;
    } else {
      checks.push(_check('BROADCAST_COMP_CHILD_COUNT', 'pass', 'child count ok: ' + childCount));
    }

    // Bounds check
    var b = comp.boundsM || {};
    var maxBound = Math.max(b.widthM || 0, b.depthM || 0);
    if (maxBound > BUDGET.maxCompositionBoundsM) {
      checks.push(_check('BROADCAST_COMP_BOUNDS', 'fail',
        'bounds (' + maxBound + 'm) exceeds budget (' + BUDGET.maxCompositionBoundsM + 'm)', 50));
      hasBlock = true;
    } else if (maxBound > BUDGET.maxCompositionBoundsM * 0.5) {
      checks.push(_check('BROADCAST_COMP_BOUNDS', 'warn', 'bounds near budget: ' + maxBound + 'm', 10));
      score += 10;
    } else {
      checks.push(_check('BROADCAST_COMP_BOUNDS', 'pass', 'bounds ok: ' + maxBound + 'm'));
    }

    // Check child asset readiness
    var unresolvedChildren = 0;
    var degradedChildren   = 0;
    var children = comp.children || [];
    var resolver = global.WOSAssetResolver;
    children.forEach(function (child) {
      if (!child.assetId) { unresolvedChildren++; return; }
      if (resolver) {
        var r = resolver.resolve(child.assetId);
        if (r.placeholder) { unresolvedChildren++; return; }
        // Check if it's a GLB import missing file
        var glbStore = global.WOSGlbImportStore;
        if (glbStore && r.asset && r.asset.source === 'studio-glb-import') {
          var gi2 = r.asset.glbImport || {};
          if (gi2.status === 'missing-file') degradedChildren++;
        }
      }
    });

    if (unresolvedChildren > 0) {
      checks.push(_check('BROADCAST_COMP_CHILDREN_RESOLVED', 'fail',
        unresolvedChildren + ' unresolved child asset(s)', 50));
      hasBlock = true;
    } else {
      checks.push(_check('BROADCAST_COMP_CHILDREN_RESOLVED', 'pass', 'all child assets resolve'));
    }

    if (degradedChildren > 0) {
      checks.push(_check('BROADCAST_COMP_CHILDREN_DEGRADE', 'warn',
        degradedChildren + ' child(ren) have missing GLB file (proxy fallback)', 15));
      score += 15;
    }

    score = Math.min(score, 100);

    return {
      id:         composition.id,
      kind:       'composition',
      readiness:  _scoreToReadiness(score, hasBlock),
      score:      score,
      checks:     checks,
      diagnostics: {
        meshCount:       null,
        materialCount:   null,
        fileSizeBytes:   null,
        childCount:      childCount,
        boundsM:         comp.boundsM || null,
        hasMissingFile:  degradedChildren > 0,
        unresolvedChildren: unresolvedChildren,
        degradedChildren:   degradedChildren,
      },
    };
  }

  // ── Actor analysis ────────────────────────────────────────────────────────────

  function analyzeActor(actor) {
    if (!actor) return { id: null, kind: 'actor', readiness: 'UNKNOWN', score: 0, checks: [], diagnostics: {} };
    var assetId  = actor.assetId;
    var resolver = global.WOSAssetResolver;
    if (!assetId || !resolver) {
      return { id: actor.objectId, kind: 'actor', readiness: 'UNKNOWN', score: 0,
               checks: [_check('BROADCAST_ACTOR_HAS_ASSET', 'fail', 'no assetId or resolver', 50)],
               diagnostics: {} };
    }
    var r     = resolver.resolve(assetId);
    var asset = r && r.asset;
    if (!asset) {
      return { id: actor.objectId, kind: 'actor', readiness: 'BLOCK', score: 50,
               checks: [_check('BROADCAST_ACTOR_ASSET_RESOLVES', 'fail', 'assetId unresolved: ' + assetId, 50)],
               diagnostics: {} };
    }
    var result;
    if (asset.source === 'studio-glb-import') {
      result = analyzeImportedGlbAsset(asset);
    } else if (asset.source === 'studio-custom') {
      result = analyzeCustomAsset(asset);
    } else {
      // Starter / system asset — treat as READY
      result = {
        id: assetId, kind: 'actor', readiness: 'READY', score: 0,
        checks: [_check('BROADCAST_ACTOR_STARTER_ASSET', 'pass', 'starter/system asset — broadcast-safe')],
        diagnostics: {},
      };
    }
    result.id   = actor.objectId;
    result.kind = 'actor';
    return result;
  }

  // ── assetId-based entrypoint ──────────────────────────────────────────────────

  function analyzeAsset(assetId) {
    var resolver = global.WOSAssetResolver;
    if (!resolver) return { id: assetId, kind: 'unknown', readiness: 'UNKNOWN', score: 0, checks: [], diagnostics: {} };
    var r     = resolver.resolve(assetId);
    var asset = r && r.asset;
    if (!asset) return { id: assetId, kind: 'unknown', readiness: 'BLOCK', score: 50,
                          checks: [_check('BROADCAST_ASSET_RESOLVES', 'fail', 'assetId unresolved', 50)], diagnostics: {} };
    if (asset.source === 'studio-glb-import') return analyzeImportedGlbAsset(asset);
    if (asset.source === 'studio-custom')     return analyzeCustomAsset(asset);
    // Starter/system
    return { id: assetId, kind: 'starter', readiness: 'READY', score: 0,
             checks: [_check('BROADCAST_ASSET_STARTER', 'pass', 'starter asset — broadcast-safe')], diagnostics: {} };
  }

  // ── Bulk analysis ─────────────────────────────────────────────────────────────

  function analyzeAll() {
    var resolver   = global.WOSAssetResolver;
    var customStore = global.WOSCustomStudioAssetStore;
    var glbStore    = global.WOSGlbImportStore;
    var compStore   = global.WOSCompositionStore;
    var results     = { customAssets: [], glbAssets: [], compositions: [], summary: {} };

    if (customStore) {
      customStore.list().forEach(function (a) {
        results.customAssets.push(analyzeCustomAsset(a));
      });
    }
    if (glbStore) {
      glbStore.list().forEach(function (a) {
        results.glbAssets.push(analyzeImportedGlbAsset(a));
      });
    }
    if (compStore) {
      compStore.list().forEach(function (c) {
        results.compositions.push(analyzeComposition(c));
      });
    }

    var all = results.customAssets.concat(results.glbAssets).concat(results.compositions);
    var summary = { total: all.length, ready: 0, warn: 0, degrade: 0, block: 0, unknown: 0 };
    all.forEach(function (r) {
      var k = (r.readiness || 'unknown').toLowerCase();
      if (summary[k] !== undefined) summary[k]++;
    });
    results.summary = summary;
    return results;
  }

  function getBudget() {
    return Object.assign({}, BUDGET);
  }

  function getSnapshot() {
    var all = analyzeAll();
    return {
      budget:   getBudget(),
      summary:  all.summary,
      customAssetResults:  all.customAssets.map(function (r) { return { id: r.id, readiness: r.readiness, score: r.score }; }),
      glbAssetResults:     all.glbAssets.map(function (r)    { return { id: r.id, readiness: r.readiness, score: r.score }; }),
      compositionResults:  all.compositions.map(function (r) { return { id: r.id, readiness: r.readiness, score: r.score }; }),
    };
  }

  global.WOSBroadcastReadinessAnalyzer = {
    analyzeAsset:             analyzeAsset,
    analyzeActor:             analyzeActor,
    analyzeCustomAsset:       analyzeCustomAsset,
    analyzeImportedGlbAsset:  analyzeImportedGlbAsset,
    analyzeComposition:       analyzeComposition,
    analyzeAll:               analyzeAll,
    getBudget:                getBudget,
    getSnapshot:              getSnapshot,
  };

  console.log('[BroadcastReadinessAnalyzer] ready — 0616L');
})(window);
