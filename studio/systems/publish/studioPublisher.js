// ── WOS StudioPublisher ───────────────────────────────────────────────────────
// 0614_WOS_Phase8ProductionPublishToWallRuntime_v1.0.0_BUILD
// Assembles the WOS Wall Runtime Bundle from promoted actor manifests and
// POSTs it to the local publish endpoint (localPublishServer.js).
//
// 0616H: Extended to collect validated custom Studio asset records into
// bundle.customAssets.  Custom assets are included only when referenced by
// a promoted actor in the exported set.  Actor manifests remain assetId-only.
//
// Responsibilities:
//   - Read PROMOTED actors from WOSActorManifestStore
//   - Read registry entries from WOSActorRegistryController
//   - Strip forbidden runtime fields
//   - Collect referenced custom assets via WOSCustomAssetGovernanceValidator
//   - Increment bundleVersion
//   - POST to localPublishServer endpoint
//
// Does NOT own:
//   - Bundle file writing (localPublishServer owns that)
//   - Wall runtime loading or validation
//   - Promotion gate (PromotionGateController Phase 4)
//   - Any rendering
//
// Security:
//   - assetPath, assetUrl, glbPath are stripped before publish (AC2)
//   - Only PROMOTED, non-retired actors are included (AC1)
//   - Custom asset recipe fields never written to actor manifests (AC11)
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  // 0616L: broadcast readiness forbidden fields — must never reach actor manifests
  var BROADCAST_FORBIDDEN_FIELDS = [
    'broadcastReady', 'broadcastBudget', 'renderBudget', 'lodProfile',
    'meshCount', 'materialCount', 'glbComplexity', 'compositionComplexity',
    'customAssetBudget', 'objectComplexityScore',
    'compositionRecipe', 'compositionChildren', 'compositionAssetId',
    'compositionSource', 'childOffsets', 'kitRecipe', 'groupRecipe',
    // 0617C: GLB package fields must never reach actor manifests
    'glbRuntimeUrl', 'glbPackageId', 'glbPackagePath', 'glbPackageRecord',
    'glbRuntimeRecord', 'glbFileName', 'glbFileSizeBytes', 'glbContentHash',
    'glbObjectUrl', 'glbLocalPath', 'glbBinary', 'glbBase64',
    'glbScene', 'glbMeshCount', 'glbMaterialCount',
  ];

  var FORBIDDEN_FIELDS = [
    'assetPath', 'assetUrl', 'glbPath', 'localFilePath',
    'authoringSelectionState', 'inspectorDraft',
    'previewAnchor', 'previewHeading',
    // 0616H: custom asset recipe fields must never reach actor manifests
    'shapeRecipe', 'materialRecipe', 'shapeDraft', 'materialDraft',
    'materialSlots', 'slotColors', 'roughnessPreview', 'metalnessPreview',
    'opacityPreview', 'customAssetRecipe', 'customAssetSource',
    'studioCustomAsset', 'proxyParams', 'parametricTemplate',
  ];

  // ── 0616H: Custom asset collection ──────────────────────────────────────────
  // Collects validated custom asset records referenced by the exported actor set.
  // Returns { customAssetsBlock, rejectedCustomAssets }.
  // customAssetsBlock is null when no custom assets are referenced.
  function _collectCustomAssets(eligibleActors) {
    var resolver  = global.WOSAssetResolver;
    var validator = global.WOSCustomAssetGovernanceValidator;
    if (!resolver) return { customAssetsBlock: null, rejectedCustomAssets: [] };

    var seen = {};
    var assets = [];
    var rejected = [];

    eligibleActors.forEach(function (actor) {
      var assetId = actor.assetId;
      if (!assetId || seen[assetId]) return;
      seen[assetId] = true;

      var resolved = resolver.resolve(assetId);
      var asset    = resolved && resolved.asset;
      if (!asset || asset.source !== 'studio-custom') return;

      // Soft-removed
      if (asset._customAssetRemoved) {
        rejected.push({ assetId: assetId, reason: 'custom_asset_removed' });
        return;
      }

      // Validate via governance validator (fail-closed)
      if (validator) {
        var checks   = validator.validateAssetById(assetId);
        var failures = checks.filter(function (c) { return c.result === 'fail'; });
        if (failures.length > 0) {
          rejected.push({
            assetId: assetId,
            reason:  'governance_failed: ' + failures.map(function (c) { return c.id; }).join(', '),
          });
          return;
        }
      }

      // Build the sanitized CustomWallAssetRecord — asset-only fields, never actor fields
      assets.push({
        assetId:        asset.id,
        label:          asset.label || '',
        source:         'studio-custom',
        category:       asset.category || '',
        actorTypes:     asset.actorTypes ? asset.actorTypes.slice() : [],
        defaultVariant: asset.defaultVariant || 'default',
        variants:       asset.variants ? Object.assign({}, asset.variants) : { 'default': {} },
        shapeRecipe: {
          template: asset.shapeRecipe.template,
          params:   Object.assign({}, asset.shapeRecipe.params),
        },
        materialRecipe: {
          slots:         Object.assign({}, asset.materialRecipe.slots),
          materialClass: asset.materialRecipe.materialClass || null,
          roughness:     asset.materialRecipe.roughness  != null ? asset.materialRecipe.roughness  : null,
          metalness:     asset.materialRecipe.metalness  != null ? asset.materialRecipe.metalness  : null,
          opacity:       asset.materialRecipe.opacity    != null ? asset.materialRecipe.opacity    : null,
        },
        authoring: {
          version:   (asset.authoring && asset.authoring.version)   || '1.0.0',
          createdAt: (asset.authoring && asset.authoring.createdAt) || '',
          updatedAt: (asset.authoring && asset.authoring.updatedAt) || '',
        },
      });
    });

    var customAssetsBlock = assets.length > 0 ? {
      schema:  'wos.wall.customAssets',
      version: '1.0.0',
      assets:  assets,
    } : null;

    return { customAssetsBlock: customAssetsBlock, rejectedCustomAssets: rejected };
  }

  // ── 0617C: GLB asset collection ──────────────────────────────────────────────
  // Collects packaged GLB asset records for promoted actors that reference
  // imported GLB assets. Fails closed if any promoted actor has no package record.
  function _collectGlbAssets(eligibleActors) {
    var pkgStore = global.WOSGlbRuntimePackageStore;
    if (!pkgStore) return { glbAssetsBlock: null, blockedGlbAssets: [], glbAssetCount: 0 };

    var seenIds = {};
    var assetIds = [];
    eligibleActors.forEach(function (actor) {
      var id = actor.assetId;
      if (!id || seenIds[id]) return;
      if (id.indexOf('studio.import.glb.') !== 0) return;
      seenIds[id] = true;
      assetIds.push(id);
    });

    if (assetIds.length === 0) return { glbAssetsBlock: null, blockedGlbAssets: [], glbAssetCount: 0 };

    var blockedGlbAssets = [];
    assetIds.forEach(function (id) {
      var rec = pkgStore.get(id);
      if (!rec || rec.status !== 'packaged' || !rec.runtimeUrl) {
        blockedGlbAssets.push({
          assetId: id,
          reason: !rec ? 'no_package_record' : 'package_status_' + rec.status,
        });
      }
    });

    if (blockedGlbAssets.length > 0) return { glbAssetsBlock: null, blockedGlbAssets: blockedGlbAssets, glbAssetCount: assetIds.length };

    var assets = pkgStore.getForBundle(assetIds);
    var glbAssetsBlock = {
      schema:      'wos.glbRuntimeAssets.v1',
      generatedAt: new Date().toISOString(),
      assets:      assets,
    };
    return { glbAssetsBlock: glbAssetsBlock, blockedGlbAssets: [], glbAssetCount: assetIds.length };
  }

  // ── 0618B: Building texture collection ───────────────────────────────────────
  // Collects packaged building texture packages and their assignments.
  // Fails closed if any assignment references an unpackaged/missing package.
  function _collectBuildingTextures() {
    var pkgStore  = global.WOSBuildingTexturePackageStore;
    var assignCtl = global.WOSBuildingTextureAssignmentController;
    if (!pkgStore || !assignCtl) {
      return { buildingTexturesBlock: null, blockedTextures: [] };
    }

    // Walk ALL assignments — fail closed on any slot referencing a non-packaged package.
    var allAssignments = assignCtl.list();
    if (!allAssignments.length) {
      return { buildingTexturesBlock: null, blockedTextures: [] };
    }

    var blocked = [];
    allAssignments.forEach(function (a) {
      var slots = a.slots || {};
      Object.keys(slots).forEach(function (slotName) {
        var slot = slots[slotName];
        if (!slot || !slot.packageId) {
          blocked.push({ buildingKey: a.buildingKey, slotName: slotName, packageId: '(missing)', reason: 'slot_has_no_packageId' });
          return;
        }
        var rec = pkgStore.get(slot.packageId);
        if (!rec) {
          blocked.push({ buildingKey: a.buildingKey, slotName: slotName, packageId: slot.packageId, reason: 'package_not_found' });
        } else if (rec.status !== 'packaged' || !rec.runtimeUrl) {
          blocked.push({ buildingKey: a.buildingKey, slotName: slotName, packageId: slot.packageId, reason: 'package_status_' + rec.status });
        }
      });
    });

    if (blocked.length > 0) {
      return { buildingTexturesBlock: null, blockedTextures: blocked };
    }

    // All assignments are clean — collect referenced package IDs and build block.
    var usedIds = {};
    allAssignments.forEach(function (a) {
      Object.keys(a.slots || {}).forEach(function (s) {
        if (a.slots[s].packageId) usedIds[a.slots[s].packageId] = true;
      });
    });

    var bundleResult = assignCtl.getForBundle(Object.keys(usedIds));
    var packages = pkgStore.getForBundle(bundleResult.referencedPackageIds);
    var buildingTexturesBlock = {
      schema:      'wos.wall.buildingTextures',
      version:     '1.0.0',
      generatedAt: new Date().toISOString(),
      packages:    packages,
      assignments: bundleResult.assignments,
    };
    return { buildingTexturesBlock: buildingTexturesBlock, blockedTextures: [] };
  }

  var DEFAULT_ENDPOINT   = 'http://localhost:5503/wos/publish';
  var BUNDLE_FETCH_URL   = '/wall/data/wos-wall-runtime-bundle.json';

  // ── 0616L: Broadcast readiness collection ────────────────────────────────────
  function _collectBroadcastReadiness(eligibleActors) {
    var analyzer = global.WOSBroadcastReadinessAnalyzer;
    if (!analyzer) {
      return { broadcastBlock: null, blockedAssets: [] };
    }
    var seen        = {};
    var assetMap    = {};
    var blockedAssets = [];
    var summary     = { actorCount: 0, customAssetActorCount: 0, importedGlbActorCount: 0,
                        readyCount: 0, warnCount: 0, degradeCount: 0, blockCount: 0, unknownCount: 0 };

    summary.actorCount = eligibleActors.length;

    eligibleActors.forEach(function (actor) {
      var assetId = actor.assetId;
      if (!assetId) return;
      if (assetId.indexOf('studio.custom.') === 0)     summary.customAssetActorCount++;
      if (assetId.indexOf('studio.import.glb.') === 0) summary.importedGlbActorCount++;
      if (seen[assetId]) return;
      seen[assetId] = true;

      var result = analyzer.analyzeAsset(assetId);
      var r      = (result.readiness || 'UNKNOWN').toLowerCase();
      if (summary[r + 'Count'] !== undefined) summary[r + 'Count']++;

      assetMap[assetId] = {
        readiness: result.readiness,
        kind:      result.kind,
        score:     result.score,
        checks:    (result.checks || []).map(function (c) {
          return { id: c.id, result: c.result, message: c.message };
        }),
      };

      if (result.readiness === 'BLOCK') {
        blockedAssets.push({ assetId: assetId, checks: result.checks });
      }
    });

    var broadcastBlock = {
      version:     '1.0.0',
      generatedAt: new Date().toISOString(),
      budget:      analyzer.getBudget(),
      summary:     summary,
      assets:      assetMap,
    };
    return { broadcastBlock: broadcastBlock, blockedAssets: blockedAssets };
  }

  // ── Field stripping ───────────────────────────────────────────────────────────
  function _stripForbidden(manifest) {
    var allForbidden = FORBIDDEN_FIELDS.concat(BROADCAST_FORBIDDEN_FIELDS);
    var clean = {};
    for (var k in manifest) {
      if (manifest.hasOwnProperty(k) && allForbidden.indexOf(k) === -1) {
        clean[k] = manifest[k];
      }
    }
    // Also strip from nested meta (inspectorDraft may nest here)
    if (clean.meta) {
      var meta = {};
      for (var mk in clean.meta) {
        if (clean.meta.hasOwnProperty(mk) && allForbidden.indexOf(mk) === -1) {
          meta[mk] = clean.meta[mk];
        }
      }
      clean.meta = meta;
    }
    return clean;
  }

  // ── Version increment ─────────────────────────────────────────────────────────
  function _incVersion(v) {
    try {
      var parts = String(v || '1.0.0').split('.').map(Number);
      while (parts.length < 3) parts.push(0);
      parts[2] = (parts[2] || 0) + 1;
      return parts.join('.');
    } catch (e) { return '1.0.1'; }
  }

  // ── Actor collection ──────────────────────────────────────────────────────────
  function _store()    { return global.WOSActorManifestStore; }
  function _registry() { return global.WOSActorRegistryController; }

  function _collectEligible() {
    var store = _store();
    if (!store) return { eligible: [], draft: [], retired: [], gatePending: [] };
    var all = store.list();
    var eligible = [], draft = [], retired = [], gatePending = [];
    all.forEach(function (a) {
      var meta = a.meta || {};
      var state = meta.lifecycleState || (meta.promoted ? 'PROMOTED' : 'DRAFT');
      if (state === 'RETIRED' || meta.retiredAt) { retired.push(a); return; }
      if (state === 'GATE_PENDING')              { gatePending.push(a); return; }
      if (!meta.promoted)                        { draft.push(a); return; }
      eligible.push(a);
    });
    return { eligible: eligible, draft: draft, retired: retired, gatePending: gatePending };
  }

  // ── Bundle assembly ───────────────────────────────────────────────────────────
  function _assembleSummary(eligible) {
    return {
      eligibleCount:  eligible.length,
      structureCount: eligible.filter(function (a) {
        return a.actorCategory === 'structure' && a.structure && a.structure.mapboxFeatureId != null;
      }).length,
      materialCount: eligible.filter(function (a) { return !!a.materialOverride; }).length,
      feedCount:     eligible.filter(function (a) { return !!a.liveTracking; }).length,
    };
  }

  // ── Public: preview bundle (dry run, no write) ───────────────────────────────
  function previewBundle() {
    var collected = _collectEligible();
    var actors    = collected.eligible.map(_stripForbidden);
    var reg       = _registry();
    var registry  = [];
    collected.eligible.forEach(function (a) {
      var entry = reg ? reg.get(a.objectId) : null;
      if (entry) registry.push(entry);
    });
    var summary = _assembleSummary(collected.eligible);
    var customResult    = _collectCustomAssets(collected.eligible);
    var broadcastResult = _collectBroadcastReadiness(collected.eligible);
    var glbResult       = _collectGlbAssets(collected.eligible);
    var texResult       = _collectBuildingTextures();
    var preview = {
      bundleVersion:  '(preview)',
      publishedAt:    new Date().toISOString(),
      metadata:       { source: 'studio' },
      registry:       registry,
      actors:         actors,
      _summary:       Object.assign(summary, {
        draftCount:              collected.draft.length,
        retiredCount:            collected.retired.length,
        gatePendingCount:        collected.gatePending.length,
        customAssetCount:        customResult.customAssetsBlock ? customResult.customAssetsBlock.assets.length : 0,
        rejectedCustomAssetCount: customResult.rejectedCustomAssets.length,
        blockedBroadcastAssets:  broadcastResult.blockedAssets.length,
        glbAssetCount:           glbResult.glbAssetCount,
        blockedGlbAssets:        glbResult.blockedGlbAssets.length,
        buildingTextureAssignmentCount: texResult.buildingTexturesBlock ? texResult.buildingTexturesBlock.assignments.length : 0,
        blockedBuildingTextures: texResult.blockedTextures.length,
      }),
    };
    if (customResult.customAssetsBlock) {
      preview.customAssets = customResult.customAssetsBlock;
    }
    if (glbResult.glbAssetsBlock) {
      preview.glbAssets = glbResult.glbAssetsBlock;
    }
    if (texResult.buildingTexturesBlock) {
      preview.buildingTextures = texResult.buildingTexturesBlock;
    }
    preview.broadcastReadiness = broadcastResult.broadcastBlock;
    if (broadcastResult.blockedAssets.length > 0) {
      preview._broadcastBlocked = broadcastResult.blockedAssets;
    }
    if (glbResult.blockedGlbAssets.length > 0) {
      preview._glbBlocked = glbResult.blockedGlbAssets;
    }
    if (texResult.blockedTextures.length > 0) {
      preview._buildingTextureBlocked = texResult.blockedTextures;
    }
    return preview;
  }

  // ── Public: publish ──────────────────────────────────────────────────────────
  // opts: { publishedBy?: string, endpoint?: string }
  // callback: function(err, result)
  function publish(opts, callback) {
    if (typeof opts === 'function') { callback = opts; opts = {}; }
    opts     = opts     || {};
    callback = callback || function () {};
    var endpoint = opts.endpoint || DEFAULT_ENDPOINT;

    // Step 1: fetch current bundle to read bundleVersion for increment
    var fetchCurrent = function () {
      return fetch(BUNDLE_FETCH_URL + '?_=' + Date.now())
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; });
    };

    fetchCurrent().then(function (current) {
      var currentVersion = (current && current.bundleVersion) || '1.0.0';
      var newVersion = _incVersion(currentVersion);

      var collected = _collectEligible();
      var actors    = collected.eligible.map(_stripForbidden);
      var reg       = _registry();
      var registry  = [];
      collected.eligible.forEach(function (a) {
        var entry = reg ? reg.get(a.objectId) : null;
        if (entry) registry.push(entry);
      });

      // 0616H: collect validated custom assets referenced by exported actors
      var customResult = _collectCustomAssets(collected.eligible);

      // 0616L: broadcast readiness — fail closed on BLOCK assets
      var broadcastResult = _collectBroadcastReadiness(collected.eligible);
      if (broadcastResult.blockedAssets.length > 0) {
        var blockedIds = broadcastResult.blockedAssets.map(function (b) { return b.assetId; });
        callback(new Error('publish_blocked: BLOCK readiness assets referenced by promoted actors: ' + blockedIds.join(', ')), null);
        return;
      }

      // 0618B: building textures — fail closed if any assignment references unpackaged texture
      var texResult = _collectBuildingTextures();
      if (texResult.blockedTextures.length > 0) {
        var texBlockedIds = texResult.blockedTextures.map(function (b) {
          return b.buildingKey + ' slot:' + b.slotName + ' pkg:' + b.packageId + ' (' + b.reason + ')';
        });
        callback(new Error('publish_blocked: unpackaged building textures: ' + texBlockedIds.join(' | ')), null);
        return;
      }

      // 0617C: GLB packaging — fail closed if any promoted actor references unpackaged GLB
      var glbResult = _collectGlbAssets(collected.eligible);
      if (glbResult.blockedGlbAssets.length > 0) {
        var glbBlockedIds = glbResult.blockedGlbAssets.map(function (b) { return b.assetId + ' (' + b.reason + ')'; });
        callback(new Error('publish_blocked: unpackaged GLB assets: ' + glbBlockedIds.join(', ')), null);
        return;
      }

      var bundle = {
        bundleVersion: newVersion,
        publishedAt:   new Date().toISOString(),
        publishedBy:   opts.publishedBy || 'studio-author',
        metadata:      { source: 'studio', studioVersion: '1.0.0' },
        registry:      registry,
        actors:        actors,
      };
      if (customResult.customAssetsBlock) {
        bundle.customAssets = customResult.customAssetsBlock;
      }
      if (glbResult.glbAssetsBlock) {
        bundle.glbAssets = glbResult.glbAssetsBlock;
      }
      if (texResult.buildingTexturesBlock) {
        bundle.buildingTextures = texResult.buildingTexturesBlock;
      }
      bundle.broadcastReadiness = broadcastResult.broadcastBlock;

      // Step 2: POST to localPublishServer
      return fetch(endpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(bundle),
      })
        .then(function (r) {
          if (!r.ok) throw new Error('endpoint_error: HTTP ' + r.status);
          return r.json();
        })
        .then(function (result) {
          if (!result.ok) throw new Error(result.error || 'publish_rejected');
          callback(null, {
            ok:                      true,
            bundleVersion:           result.bundleVersion,
            publishedAt:             result.publishedAt,
            actorCount:              result.actorCount,
            draftExcluded:           collected.draft.length,
            customAssetCount:        customResult.customAssetsBlock ? customResult.customAssetsBlock.assets.length : 0,
            rejectedCustomAssets:    customResult.rejectedCustomAssets,
          });
        });
    }).catch(function (err) {
      callback(err, null);
    });
  }

  global.WOSStudioPublisher = {
    publish:          publish,
    previewBundle:    previewBundle,
    DEFAULT_ENDPOINT: DEFAULT_ENDPOINT,
  };
  console.log('[WOSStudioPublisher] ready | endpoint:', DEFAULT_ENDPOINT);
})(window);
