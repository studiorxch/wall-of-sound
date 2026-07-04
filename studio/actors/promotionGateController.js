// ── WOS PromotionGateController ───────────────────────────────────────────────
// 0613_WOS_3DCanvasLabPhase4Governance_v1.0.0_BUILD
// Owns: gate submission, check execution (Group A/B/C), result recording,
// GATE_PENDING ↔ DRAFT ↔ PROMOTED transitions, warning acknowledgements.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var VALID_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  var VALID_ISO  = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

  var DEFAULT_LOD = { highM: 500, medM: 2000, lowM: 8000, billboardM: 20000 };

  var LIVE_TRACKING_CATEGORIES = ['maritime', 'vehicle'];

  function _store()    { return global.WOSActorManifestStore; }
  function _registry() { return global.WOSActorRegistryController; }
  function _resolver() { return global.WOSAssetResolver; }
  function _stamp()    { try { return new Date().toISOString(); } catch (e) { return ''; } }

  // ── Lifecycle state helpers ───────────────────────────────────────────────────
  function _getState(actor) {
    if (!actor || !actor.meta) return 'DRAFT';
    return actor.meta.lifecycleState || (actor.meta.promoted ? 'PROMOTED' : 'DRAFT');
  }

  function _setLifecycleState(objectId, state, extra) {
    var store = _store();
    if (!store || !store.setLifecycleState) return;
    store.setLifecycleState(objectId, state, extra || {});
  }

  // ── Group A — blocking checks ─────────────────────────────────────────────────
  function _runGroupA(actor) {
    var results = [];
    var reg = _registry();
    var resolver = _resolver();

    // Schema: objectId is valid UUID v4
    results.push({
      id: 'schema-uuid', group: 'A',
      result: VALID_UUID.test(actor.objectId) ? 'pass' : 'fail',
      message: 'objectId must be UUID v4.',
    });

    // specVersion present
    results.push({
      id: 'schema-specversion', group: 'A',
      result: (actor.meta && actor.meta.specVersion) ? 'pass' : 'fail',
      message: 'specVersion must be set.',
    });

    // anchor coordinates valid
    var anchor = actor.anchor || {};
    var anchorOk = (typeof anchor.lat === 'number' && anchor.lat >= -90 && anchor.lat <= 90) &&
                   (typeof anchor.lon === 'number' && anchor.lon >= -180 && anchor.lon <= 180) &&
                   (typeof anchor.altM === 'number' && anchor.altM >= -500) &&
                   (typeof anchor.headingDeg === 'number' && anchor.headingDeg >= 0 && anchor.headingDeg < 360);
    results.push({
      id: 'anchor-valid', group: 'A',
      result: anchorOk ? 'pass' : 'fail',
      message: 'Anchor coordinates are out of range.',
    });

    // assetId resolves
    var assetOk = actor.assetId === 'wos_placeholder_cube';
    if (!assetOk && resolver) {
      var res = resolver.resolve(actor.assetId);
      assetOk = res && !res.placeholder;
    }
    results.push({
      id: 'asset-resolves', group: 'A',
      result: assetOk ? 'pass' : 'fail',
      message: 'assetId does not resolve in the asset registry.',
    });

    // objectId uniqueness in registry
    var entry = reg ? reg.get(actor.objectId) : null;
    results.push({
      id: 'objectid-unique', group: 'A',
      result: !entry ? 'pass' : 'fail',
      message: 'objectId already exists in the canonical registry.',
    });

    // LOD ascending (if lod present)
    var lod = actor.lod || DEFAULT_LOD;
    var lodOk = lod.highM < lod.medM && lod.medM < lod.lowM && lod.lowM < lod.billboardM;
    results.push({
      id: 'lod-ascending', group: 'A',
      result: lodOk ? 'pass' : 'fail',
      message: 'LOD thresholds must be strictly ascending.',
    });

    // Static actors carry deadReckoningWeight = 0
    var isLiveTracking = actor.liveTracking && actor.liveTracking.feedType;
    var scalars = actor.scalars || {};
    var staticDrOk = isLiveTracking || (scalars.deadReckoningWeight === 0 || scalars.deadReckoningWeight == null);
    results.push({
      id: 'static-dr-zero', group: 'A',
      result: staticDrOk ? 'pass' : 'fail',
      message: 'Static actors must have deadReckoningWeight = 0.',
    });

    // liveTracking feedType discriminator (only if liveTracking present)
    if (isLiveTracking) {
      var validFeedTypes = ['ais', 'gtfs_rt', 'gbfs'];
      results.push({
        id: 'feed-discriminator', group: 'A',
        result: validFeedTypes.indexOf(actor.liveTracking.feedType) !== -1 ? 'pass' : 'fail',
        message: 'liveTracking.feedType must be one of: ais, gtfs_rt, gbfs.',
      });
    }

    // materialOverride field validation (Phase 7)
    var mo = actor.materialOverride;
    if (mo) {
      var VALID_HEX_MO = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;
      if (mo.color != null) {
        results.push({
          id: 'mat-color-valid', group: 'A',
          result: VALID_HEX_MO.test(mo.color) ? 'pass' : 'fail',
          message: 'materialOverride.color must be a valid hex string (#RGB or #RRGGBB).',
        });
      }
      if (mo.paletteRef != null) {
        var pal = global.WOSPalette;
        results.push({
          id: 'mat-paletteref-known', group: 'A',
          result: (pal && pal[mo.paletteRef]) ? 'pass' : 'fail',
          message: 'materialOverride.paletteRef is not a recognised WOS palette name.',
        });
      }
      if (mo.roughness != null) {
        results.push({
          id: 'mat-roughness-range', group: 'A',
          result: (typeof mo.roughness === 'number' && mo.roughness >= 0 && mo.roughness <= 1) ? 'pass' : 'fail',
          message: 'materialOverride.roughness must be a number in [0, 1].',
        });
      }
      if (mo.metalness != null) {
        results.push({
          id: 'mat-metalness-range', group: 'A',
          result: (typeof mo.metalness === 'number' && mo.metalness >= 0 && mo.metalness <= 1) ? 'pass' : 'fail',
          message: 'materialOverride.metalness must be a number in [0, 1].',
        });
      }
      if (mo.materialClass != null) {
        results.push({
          id: 'mat-class-enum', group: 'A',
          result: (mo.materialClass === 'lambert' || mo.materialClass === 'standard') ? 'pass' : 'fail',
          message: 'materialOverride.materialClass must be "lambert" or "standard".',
        });
      }
    }

    // ── 0616G: Custom asset governance checks ──────────────────────────────────
    var assetId = actor.assetId;
    var isCustom = false;
    if (resolver && assetId) {
      var assetRes = resolver.resolve(assetId);
      var assetRec = assetRes && assetRes.asset;
      isCustom = !!(assetRec && assetRec.source === 'studio-custom');
    }
    if (isCustom) {
      var validator = global.WOSCustomAssetGovernanceValidator;
      if (!validator) {
        results.push({
          id: 'A_CUSTOM_ASSET_RESOLVES', group: 'A', result: 'fail',
          message: 'WOSCustomAssetGovernanceValidator is unavailable — cannot validate custom asset.',
        });
      } else {
        var govChecks = validator.validateForActor(actor);
        govChecks.forEach(function (c) { results.push(c); });
      }
    }

    return results;
  }

  // ── Group B — warnings ────────────────────────────────────────────────────────
  function _runGroupB(actor) {
    var results = [];
    var lod = actor.lod || DEFAULT_LOD;

    // changeReason present and >= 10 chars
    var reason = (actor.meta && actor.meta.changeReason) || '';
    var isFirstPromotion = !(actor.meta && actor.meta.promotedAt);
    var reasonOk = reason.trim().length >= 10;
    results.push({
      id: 'change-reason', group: 'B',
      result: reasonOk ? 'pass' : (isFirstPromotion ? 'warned' : 'fail'),
      message: 'changeReason must be at least 10 characters.',
      overridable: isFirstPromotion,
    });

    // authoredBy present
    var authoredBy = actor.meta && actor.meta.authoredBy;
    results.push({
      id: 'authored-by', group: 'B',
      result: authoredBy ? 'pass' : 'warned',
      message: 'authoredBy is not set.',
      overridable: true,
    });

    // LOD differs from DEFAULT_LOD
    var lodDefault = (lod.highM === DEFAULT_LOD.highM && lod.medM === DEFAULT_LOD.medM &&
                     lod.lowM === DEFAULT_LOD.lowM && lod.billboardM === DEFAULT_LOD.billboardM);
    results.push({
      id: 'lod-reviewed', group: 'B',
      result: lodDefault ? 'warned' : 'pass',
      message: 'LOD thresholds match defaults. Consider reviewing for this asset.',
      overridable: true,
    });

    // Live-tracking scalar review
    var lt = actor.liveTracking;
    if (lt && lt.drEnabled) {
      var scalars = actor.scalars || {};
      var nullScalars = ['continuityAlpha', 'coastAlpha', 'staleWeight', 'interpolationWeight']
        .every(function (k) { return scalars[k] == null; });
      results.push({
        id: 'scalars-reviewed', group: 'B',
        result: nullScalars ? 'warned' : 'pass',
        message: 'All continuity scalars are null while drEnabled=true. Consider reviewing.',
        overridable: true,
      });
    }

    // Phase 7: warn if PBR scalars are set on a lambert material
    var mo2 = actor.materialOverride;
    if (mo2 && (mo2.roughness != null || mo2.metalness != null)) {
      var resolvedClass = mo2.materialClass;
      if (!resolvedClass && mo2.paletteRef && global.WOSPalette) {
        var palEntry = global.WOSPalette[mo2.paletteRef];
        if (palEntry) resolvedClass = palEntry.materialClass;
      }
      if (resolvedClass === 'lambert') {
        results.push({
          id: 'mat-pbr-on-lambert', group: 'B',
          result: 'warned',
          message: 'roughness/metalness set but resolved materialClass is lambert — PBR scalars are ignored at runtime.',
          overridable: true,
        });
      }
    }

    return results;
  }

  // ── Group C — auto-verified ───────────────────────────────────────────────────
  function _runGroupC(actor) {
    var results = [];

    // UUID validity (already in A, but also auto-verified here for completeness)
    results.push({
      id: 'auto-uuid', group: 'C',
      result: VALID_UUID.test(actor.objectId) ? 'pass' : 'fail',
      message: 'objectId failed UUID v4 auto-validation.',
    });

    // authoredAt valid ISO 8601
    var authoredAt = actor.meta && actor.meta.authoredAt;
    results.push({
      id: 'auto-timestamp', group: 'C',
      result: (authoredAt && VALID_ISO.test(authoredAt)) ? 'pass' : 'fail',
      message: 'authoredAt is not a valid ISO 8601 timestamp.',
    });

    // bindingValue advisory (feed reachability not available in browser authoring context)
    var lt = actor.liveTracking;
    if (lt && lt.bindingValue) {
      results.push({
        id: 'auto-feed-validate', group: 'C',
        result: 'warned',
        message: 'Feed reachability not verified at gate time in Lab. Validate before promoting to production.',
        overridable: true,
      });
    }

    return results;
  }

  // ── Public API ────────────────────────────────────────────────────────────────
  var Controller = {
    lifecycleState: function (actor) { return _getState(actor); },

    // Run checks for preview/inspection without state transition
    previewChecks: function (objectId) {
      var store = _store();
      if (!store) return null;
      var actor = store.get(objectId);
      if (!actor) return null;
      return {
        a: _runGroupA(actor),
        b: _runGroupB(actor),
        c: _runGroupC(actor),
      };
    },

    // Submit actor to gate: DRAFT → GATE_PENDING, run checks, return gate result.
    submit: function (objectId) {
      var store = _store();
      if (!store) return { ok: false, reason: 'store_unavailable' };
      var actor = store.get(objectId);
      if (!actor) return { ok: false, reason: 'actor_not_found' };
      if (_getState(actor) !== 'DRAFT') return { ok: false, reason: 'not_draft' };

      // Transition to GATE_PENDING
      _setLifecycleState(objectId, 'GATE_PENDING');

      var groupA = _runGroupA(store.get(objectId));
      var groupB = _runGroupB(store.get(objectId));
      var groupC = _runGroupC(store.get(objectId));

      var allChecks = groupA.concat(groupB).concat(groupC);
      var blockingFails = allChecks.filter(function (c) {
        return c.result === 'fail' && (c.group === 'A' || (c.group === 'B' && !c.overridable));
      });

      var gateResult = {
        objectId:    objectId,
        submittedAt: _stamp(),
        outcome:     blockingFails.length > 0 ? 'failed' : 'pending',
        checks:      allChecks,
        promotedAt:  null,
      };

      var reg = _registry();
      if (reg) reg.writeGateResult(objectId, gateResult);

      return {
        ok: true,
        blocking: blockingFails.length > 0,
        checks: allChecks,
        gateResult: gateResult,
      };
    },

    // Withdraw from GATE_PENDING → DRAFT
    withdraw: function (objectId) {
      var store = _store();
      if (!store) return { ok: false, reason: 'store_unavailable' };
      var actor = store.get(objectId);
      if (!actor) return { ok: false, reason: 'actor_not_found' };
      if (_getState(actor) !== 'GATE_PENDING') return { ok: false, reason: 'not_gate_pending' };

      _setLifecycleState(objectId, 'DRAFT');

      var reg = _registry();
      if (reg) {
        var gr = reg.getGateResult(objectId);
        if (gr) {
          gr.outcome = 'withdrawn';
          reg.writeGateResult(objectId, gr);
        }
      }
      return { ok: true };
    },

    // Promote: GATE_PENDING → PROMOTED.
    // acknowledgedWarnings: [{ checkId, note }] for overridable warnings.
    promote: function (objectId, acknowledgedWarnings) {
      var store = _store();
      var reg = _registry();
      if (!store || !reg) return { ok: false, reason: 'dependencies_unavailable' };

      var actor = store.get(objectId);
      if (!actor) return { ok: false, reason: 'actor_not_found' };
      if (_getState(actor) !== 'GATE_PENDING') return { ok: false, reason: 'not_gate_pending' };

      var groupA = _runGroupA(actor);
      var groupB = _runGroupB(actor);
      var groupC = _runGroupC(actor);
      var allChecks = groupA.concat(groupB).concat(groupC);

      var blockingFails = allChecks.filter(function (c) { return c.result === 'fail' && c.group === 'A'; });
      if (blockingFails.length > 0) return { ok: false, reason: 'blocking_checks_failed', checks: blockingFails };

      // Apply acknowledgements to warnings
      var acked = acknowledgedWarnings || [];
      var ackedIds = {};
      acked.forEach(function (a) { ackedIds[a.checkId] = a.note; });

      var unackedWarnings = allChecks.filter(function (c) {
        return c.result === 'warned' && c.overridable && !ackedIds[c.id];
      });
      if (unackedWarnings.length > 0) return { ok: false, reason: 'unacknowledged_warnings', warnings: unackedWarnings };

      var registryResult = reg.addEntry(objectId, {
        specVersion: actor.meta && actor.meta.specVersion,
        supersedes:  actor.meta && actor.meta.supersedes,
      });
      if (!registryResult.ok) return { ok: false, reason: 'registry_write_failed: ' + registryResult.reason };

      // If this is a fork, deprecate the original in both registry and manifest store
      var supersedes = actor.meta && actor.meta.supersedes;
      if (supersedes) {
        reg.supersede(supersedes, objectId);
        store.setLifecycleState(supersedes, 'DEPRECATED', { supersededBy: objectId });
      }

      var promotedAt = _stamp();
      store.setLifecycleState(objectId, 'PROMOTED', { promotedAt: promotedAt });

      var gr = reg.getGateResult(objectId) || {};
      gr.outcome = 'promoted';
      gr.promotedAt = promotedAt;
      gr.checks = allChecks.map(function (c) {
        if (ackedIds[c.id]) return Object.assign({}, c, { acknowledged: true, note: ackedIds[c.id] });
        return c;
      });
      reg.writeGateResult(objectId, gr);

      return { ok: true };
    },

    gateResult: function (objectId) {
      var reg = _registry();
      return reg ? reg.getGateResult(objectId) : null;
    },

    // Fork a PROMOTED actor → new DRAFT with supersedes pointer
    fork: function (objectId, changeReason, dependentAcknowledgement) {
      var store = _store();
      var reg = _registry();
      if (!store || !reg) return { ok: false, reason: 'dependencies_unavailable' };

      var actor = store.get(objectId);
      if (!actor) return { ok: false, reason: 'actor_not_found' };
      var state = _getState(actor);
      if (state !== 'PROMOTED' && state !== 'DEPRECATED') return { ok: false, reason: 'not_promoted' };

      var regEntry = reg.get(objectId);
      var dependents = (regEntry && regEntry.dependents) || [];
      if (dependents.length > 0 && !dependentAcknowledgement) {
        return { ok: false, reason: 'unacknowledged_dependents', dependents: dependents };
      }
      if (dependentAcknowledgement && dependentAcknowledgement.note && dependentAcknowledgement.note.length < 10) {
        return { ok: false, reason: 'acknowledgement_note_too_short' };
      }

      var forkManifest = store.fork(objectId, changeReason);
      if (!forkManifest) return { ok: false, reason: 'fork_failed' };

      return { ok: true, manifest: forkManifest };
    },

    isPromoted:    function (actor) { return _getState(actor) === 'PROMOTED'; },
    isDeprecated:  function (actor) { return _getState(actor) === 'DEPRECATED'; },
    isGatePending: function (actor) { return _getState(actor) === 'GATE_PENDING'; },
    isDraft:       function (actor) { return _getState(actor) === 'DRAFT'; },
    isRetired:     function (actor) { return _getState(actor) === 'RETIRED'; },
    getState:      function (actor) { return _getState(actor); },
    defaultLod:    function () { return Object.assign({}, DEFAULT_LOD); },
  };

  global.WOSPromotionGateController = Controller;
  console.log('[PromotionGateController] ready');
})(window);
