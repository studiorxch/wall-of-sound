// ── WOS CustomAssetGovernanceValidator ────────────────────────────────────────
// 0616G_WOS_CustomAssetPromotionGatePass_v1.0.0_BUILD
// Validates custom Studio asset records for promotion gate integrity.
// Called by WOSPromotionGateController for actors whose assetId resolves to a
// studio-custom asset record.  Non-custom assets skip all checks here.
// Fail-closed: unavailable authorities produce blocking failures for custom assets.
// ─────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var VALID_HEX = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

  var ALLOWED_SLOTS = { body: 1, roof: 1, glass: 1, accent: 1, edge: 1, emissive: 1 };
  var ALLOWED_MAT_CLASSES = { 'lambert': 1, 'standard': 1, 'emissive': 1 };

  var FORBIDDEN_MANIFEST_FIELDS = [
    'shapeRecipe', 'materialRecipe', 'shapeDraft', 'materialDraft',
    'materialSlots', 'slotColors', 'roughnessPreview', 'metalnessPreview',
    'opacityPreview', 'customAssetRecipe', 'customAssetSource', 'studioCustomAsset',
    'proxyParams', 'parametricTemplate',
  ];

  function _pass(id, group) { return { id: id, group: group, result: 'pass', message: id + ' passed.' }; }
  function _fail(id, group, msg) { return { id: id, group: group, result: 'fail', message: msg }; }
  function _warn(id, group, msg) { return { id: id, group: group, result: 'warned', message: msg, overridable: true }; }

  // ── validate(actor, asset, opts) ─────────────────────────────────────────────
  // actor: full manifest object (may be null for direct asset validation)
  // asset: resolved asset record
  // opts: { skipCategoryCheck: bool }
  // Returns array of check result objects.
  function validate(actor, asset, opts) {
    opts = opts || {};
    var results = [];

    // ── 5.1 Resolution checks ───────────────────────────────────────────────────
    var resolver = global.WOSAssetResolver;
    if (!resolver) {
      results.push(_fail('A_CUSTOM_ASSET_RESOLVES', 'A', 'WOSAssetResolver is unavailable — cannot validate custom asset.'));
      return results;
    }

    var assetId = actor ? actor.assetId : (asset && asset.id);
    if (!assetId) {
      results.push(_fail('A_CUSTOM_ASSET_RESOLVES', 'A', 'Actor has no assetId.'));
      return results;
    }

    if (!asset) {
      results.push(_fail('A_CUSTOM_ASSET_RESOLVES', 'A', 'assetId "' + assetId + '" does not resolve in the asset registry.'));
      return results;
    }
    results.push(_pass('A_CUSTOM_ASSET_RESOLVES', 'A'));

    // ── soft-remove check ───────────────────────────────────────────────────────
    if (asset._customAssetRemoved) {
      results.push(_fail('A_CUSTOM_ASSET_NOT_REMOVED', 'A', 'Custom asset "' + assetId + '" has been removed and cannot be promoted.'));
    } else {
      results.push(_pass('A_CUSTOM_ASSET_NOT_REMOVED', 'A'));
    }

    // Non-custom assets: skip all further custom checks with neutral pass.
    if (!asset || asset.source !== 'studio-custom') {
      return results;
    }

    // ── 5.2 Custom asset structural checks ─────────────────────────────────────
    var factory = global.WOSActorProxyGeometryFactory;

    // id matches assetId
    if (asset.id !== assetId) {
      results.push(_fail('A_CUSTOM_ASSET_RESOLVES', 'A', 'Resolved asset id "' + asset.id + '" does not match actor assetId "' + assetId + '".'));
    }

    var structOk = (
      typeof asset.editable === 'boolean' &&
      asset.category &&
      asset.variants && typeof asset.variants === 'object' &&
      asset.defaultVariant &&
      asset.variants[asset.defaultVariant] &&
      asset.authoring &&
      asset.authoring.createdAt &&
      asset.authoring.updatedAt
    );

    // ── 5.3 Shape recipe checks ─────────────────────────────────────────────────
    var sr = asset.shapeRecipe;
    var shapeChecks = [];

    if (!sr) {
      shapeChecks.push('shapeRecipe is missing.');
    } else {
      if (!sr.template) {
        shapeChecks.push('shapeRecipe.template is missing.');
      } else if (!factory) {
        shapeChecks.push('WOSActorProxyGeometryFactory unavailable — cannot validate shapeRecipe.template.');
      } else {
        var knownKeys = factory.paramKeysFor(sr.template);
        if (!knownKeys || knownKeys.length === 0) {
          shapeChecks.push('shapeRecipe.template "' + sr.template + '" is unknown.');
        } else {
          if (!sr.params || typeof sr.params !== 'object') {
            shapeChecks.push('shapeRecipe.params is missing or not an object.');
          } else {
            // All required params present
            knownKeys.forEach(function (k) {
              if (!(k in sr.params)) shapeChecks.push('shapeRecipe is missing required param ' + k + '.');
            });
            // All params finite numbers, no dangerous types, no extra object/array/fn values
            Object.keys(sr.params).forEach(function (k) {
              var v = sr.params[k];
              if (typeof v !== 'number') {
                shapeChecks.push('shapeRecipe param ' + k + ' must be a number, got ' + typeof v + '.');
              } else if (!isFinite(v)) {
                shapeChecks.push('shapeRecipe param ' + k + ' is not a finite number (got ' + v + ').');
              }
            });
            // Bounds (use same PARAM_BOUNDS from store if factory doesn't expose them)
            var PARAM_BOUNDS = {
              lengthM: [0.1, 500], widthM: [0.1, 500], bodyWidthM: [0.1, 500], bodyHeightM: [0.1, 500],
              baseLengthM: [0.1, 500], baseWidthM: [0.1, 500],
              heightM: [0, 1000], roofHeightM: [0, 1000], cabinHeightM: [0, 1000], baseHeightM: [0, 1000],
              topHeightM: [0, 1000], wingSpanM: [0, 1000], tailSpanM: [0, 1000], setbackM: [0, 1000],
              shaftScale: [0, 1], bowTaper: [0, 1], sternTaper: [0, 1], frontSlope: [0, 1],
              rearSlope: [0, 1], noseTaper: [0, 1],
            };
            Object.keys(sr.params).forEach(function (k) {
              var v = sr.params[k];
              if (typeof v !== 'number' || !isFinite(v)) return; // already flagged above
              var b = PARAM_BOUNDS[k];
              if (b && (v < b[0] || v > b[1])) {
                shapeChecks.push('shapeRecipe param ' + k + ' is out of bounds (' + v + ', allowed ' + b[0] + '–' + b[1] + ').');
              }
            });
          }
        }
      }
    }

    if (shapeChecks.length > 0) {
      results.push(_fail('A_CUSTOM_ASSET_SHAPE_RECIPE_VALID', 'A', 'Custom asset shapeRecipe invalid: ' + shapeChecks.join(' ')));
    } else {
      results.push(_pass('A_CUSTOM_ASSET_SHAPE_RECIPE_VALID', 'A'));
    }

    // ── 5.4 Material recipe checks ──────────────────────────────────────────────
    var mr = asset.materialRecipe;
    var matChecks = [];

    if (!mr) {
      matChecks.push('materialRecipe is missing.');
    } else {
      if (!mr.slots || typeof mr.slots !== 'object') {
        matChecks.push('materialRecipe.slots is missing or not an object.');
      } else {
        Object.keys(mr.slots).forEach(function (k) {
          if (!ALLOWED_SLOTS[k]) {
            matChecks.push('materialRecipe slot "' + k + '" is not a recognized slot key.');
          } else if (mr.slots[k] != null && !VALID_HEX.test(mr.slots[k])) {
            matChecks.push('materialRecipe slot ' + k + ' color "' + mr.slots[k] + '" is not a valid hex color.');
          }
        });
      }
      if (mr.materialClass != null && !ALLOWED_MAT_CLASSES[mr.materialClass]) {
        matChecks.push('materialRecipe materialClass "' + mr.materialClass + '" is not allowed (must be lambert/standard/emissive or null).');
      }
      ['roughness', 'metalness', 'opacity'].forEach(function (k) {
        if (mr[k] != null && (typeof mr[k] !== 'number' || !isFinite(mr[k]) || mr[k] < 0 || mr[k] > 1)) {
          matChecks.push('materialRecipe ' + k + ' must be a number in [0, 1], got ' + mr[k] + '.');
        }
      });
    }

    if (matChecks.length > 0) {
      results.push(_fail('A_CUSTOM_ASSET_MATERIAL_RECIPE_VALID', 'A', 'Custom asset materialRecipe invalid: ' + matChecks.join(' ')));
    } else {
      results.push(_pass('A_CUSTOM_ASSET_MATERIAL_RECIPE_VALID', 'A'));
    }

    // ── 5.5 Category compatibility ──────────────────────────────────────────────
    if (!actor || opts.skipCategoryCheck) {
      results.push({ id: 'A_CUSTOM_ASSET_CATEGORY_COMPATIBLE', group: 'A', result: 'pass', message: 'Category check skipped (no actor context).' });
    } else {
      var placement = resolver.resolvePlacementDefaults ? resolver.resolvePlacementDefaults(assetId) : null;
      var resolvedCategory = placement ? placement.actorCategory : null;
      var actorCategory    = actor.actorCategory;
      if (!resolvedCategory) {
        results.push(_fail('A_CUSTOM_ASSET_CATEGORY_COMPATIBLE', 'A', 'Cannot resolve placement category for custom asset "' + assetId + '".'));
      } else if (resolvedCategory !== actorCategory) {
        results.push(_fail('A_CUSTOM_ASSET_CATEGORY_COMPATIBLE', 'A',
          'Custom asset category resolves to ' + resolvedCategory + ' but actor category is ' + actorCategory + '.'));
      } else {
        results.push(_pass('A_CUSTOM_ASSET_CATEGORY_COMPATIBLE', 'A'));
      }
    }

    // ── 5.6 Manifest cleanliness ────────────────────────────────────────────────
    if (!actor) {
      results.push({ id: 'A_CUSTOM_ASSET_MANIFEST_CLEAN', group: 'A', result: 'pass', message: 'Manifest cleanliness check skipped (no actor context).' });
    } else {
      var dirty = FORBIDDEN_MANIFEST_FIELDS.filter(function (f) { return actor.hasOwnProperty(f); });
      if (dirty.length > 0) {
        results.push(_fail('A_CUSTOM_ASSET_MANIFEST_CLEAN', 'A',
          'Actor manifest contains forbidden field' + (dirty.length > 1 ? 's' : '') + ': ' + dirty.join(', ') + '. Recipes must live on the asset record only.'));
      } else {
        results.push(_pass('A_CUSTOM_ASSET_MANIFEST_CLEAN', 'A'));
      }
    }

    // ── Group B warnings ────────────────────────────────────────────────────────
    if (!asset.label || !asset.label.trim()) {
      results.push(_warn('B_CUSTOM_ASSET_NO_LABEL', 'B', 'Custom asset has no label. Consider adding a descriptive label.'));
    }
    if (!asset.authoring || !asset.authoring.updatedAt) {
      results.push(_warn('B_CUSTOM_ASSET_NO_UPDATED_TIMESTAMP', 'B', 'Custom asset has no updatedAt timestamp on authoring record.'));
    }

    return results;
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  global.WOSCustomAssetGovernanceValidator = {
    // Run full validation. actor may be null for direct asset checks.
    validate: validate,

    // Convenience: validate from an actor manifest directly.
    validateForActor: function (actor) {
      if (!actor) return [{ id: 'A_CUSTOM_ASSET_RESOLVES', group: 'A', result: 'fail', message: 'No actor provided.' }];
      var resolver = global.WOSAssetResolver;
      var resolved = resolver ? resolver.resolve(actor.assetId) : { asset: null, placeholder: true };
      return validate(actor, resolved.asset, {});
    },

    // Validate an asset directly without an actor context.
    validateAssetById: function (assetId) {
      var resolver = global.WOSAssetResolver;
      var resolved = resolver ? resolver.resolve(assetId) : { asset: null, placeholder: true };
      var stub = { assetId: assetId }; // minimal actor stub — category/manifest checks will use skip path
      return validate(stub, resolved.asset, { skipCategoryCheck: true });
    },
  };

  console.log('[CustomAssetGovernanceValidator] ready — 0616G');
})(window);
