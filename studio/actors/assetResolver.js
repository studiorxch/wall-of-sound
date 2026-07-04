// ── WOS AssetResolver ──────────────────────────────────────────────────────────
// 0613_WOS_3DCanvasLabLockedArchitecture_v1.0.0
// 0615F_WOS_3DAssetPlacementLibraryPass_v1.0.0_BUILD
// 0616D_WOS_CustomStudioAssetSavePass_v1.0.0_BUILD
// Resolves assetId → asset record. Falls back to placeholder when unresolved.
// Does NOT expose assetPath. Multiple actors may share one assetId.
// 0615F: resolvePlacementDefaults() infers actorCategory/actorType from ALA
//        asset.category/tags so Library selection can drive placement defaults.
//        placementReadiness() classifies a row as placeable/unresolved/experimental.
// 0616D: list() filters assets removed from WOSCustomStudioAssetStore (ALA has
//        no unregister API; removed records are flagged in place) and surfaces
//        `source` so the Library can show a "Custom" badge.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var PLACEHOLDER_ID = 'wos_placeholder_cube';

  function _ala() {
    return global.SBE && global.SBE.ActorAssetLibraryAuthority;
  }

  var WOS_PLACEHOLDER_ENTRY = { assetId: 'wos_placeholder_cube', name: 'Placeholder Cube', category: 'system' };

  // ALA asset.category (domain grouping) → manifest actorCategory (render/governance grouping).
  // Matches studio/actors/inspectorController.js ACTOR_TYPES keys exactly.
  var CATEGORY_MAP = {
    marine:    'maritime',
    road:      'vehicle',
    transit:   'vehicle',
    synthetic: 'vehicle',
    aircraft:  'vehicle',
    civic:     'prop',
    world:     'prop',
    debug:     'prop',
    system:    'prop',
    unknown:   'prop',
    structure: 'structure', // 0616A — studioAssetPack.js structure.* seeds
    prop:      'prop',      // 0616A — studioAssetPack.js prop.* seeds (explicit)
  };

  // actorType inference only ever returns values already whitelisted in
  // inspectorController's ACTOR_TYPES — 'custom' is valid for every category,
  // so unmapped cases fall back to it rather than guessing an invalid type.
  function _inferActorCategory(asset) {
    if (!asset) return 'prop';
    var tags = asset.tags || [];
    if (tags.indexOf('building') !== -1 || tags.indexOf('structure') !== -1) return 'structure';
    return CATEGORY_MAP[asset.category] || 'prop';
  }

  function _inferActorType(asset, actorCategory) {
    if (!asset) return 'custom';
    if (actorCategory === 'structure') return 'building';
    if (asset.category === 'aircraft') return 'aircraft';
    if (actorCategory === 'maritime') {
      var at = (asset.actorTypes && asset.actorTypes[0]) || '';
      if (at.indexOf('vessel') !== -1) return 'vessel';
    }
    return 'custom';
  }

  var Resolver = {
    placeholderAssetId: function () { return PLACEHOLDER_ID; },

    // list() → AssetRegistryEntry[] per Phase 2 spec.
    // Always includes wos_placeholder_cube as first entry.
    list: function () {
      var ala = _ala();
      var assets = (ala && ala.listAssets) ? ala.listAssets() : [];
      assets = assets.filter(function (a) { return !a._customAssetRemoved && !a._glbImportRemoved; });
      var entries = assets.map(function (a) {
        return { assetId: a.id, name: a.label || a.id, category: a.category || 'unknown', source: a.source || 'system' };
      });
      return [WOS_PLACEHOLDER_ENTRY].concat(entries);
    },

    placeholderEntry: function () { return WOS_PLACEHOLDER_ENTRY; },

    resolve: function (assetId) {
      var ala = _ala();
      if (!assetId) {
        return { assetId: PLACEHOLDER_ID, placeholder: true, asset: null };
      }
      if (ala && ala.getAsset) {
        var asset = ala.getAsset(assetId);
        if (asset && !asset._customAssetRemoved && !asset._glbImportRemoved) return { assetId: assetId, placeholder: false, asset: asset };
      }
      return { assetId: assetId, placeholder: true, asset: null };
    },

    listAssets: function () {
      var ala = _ala();
      var assets = (ala && ala.listAssets) ? ala.listAssets() : [];
      return assets.filter(function (a) { return !a._customAssetRemoved && !a._glbImportRemoved; });
    },

    listByCategory: function (category) {
      var ala = _ala();
      var assets = (ala && ala.listByCategory) ? ala.listByCategory(category) : [];
      return assets.filter(function (a) { return !a._customAssetRemoved && !a._glbImportRemoved; });
    },

    // 0615F — resolvePlacementDefaults(assetId) → { assetId, actorCategory, actorType, resolved }
    // Drives placement-time defaults so the Library's selected asset determines
    // the manifest's actorCategory/actorType, not a hardcoded 'prop'.
    resolvePlacementDefaults: function (assetId) {
      var r = Resolver.resolve(assetId);
      var actorCategory = _inferActorCategory(r.asset);
      var actorType     = _inferActorType(r.asset, actorCategory);
      return {
        assetId:       r.assetId,
        actorCategory: actorCategory,
        actorType:     actorType,
        resolved:      !r.placeholder,
      };
    },

    // 0615F — placementReadiness(assetId) → 'placeable' | 'unresolved' | 'experimental'
    // Display-only row classification; never persisted.
    placementReadiness: function (assetId) {
      if (assetId === PLACEHOLDER_ID) return 'placeable';
      var r = Resolver.resolve(assetId);
      if (r.placeholder) return 'unresolved';
      var cat = r.asset && r.asset.category;
      if (cat === 'debug' || cat === 'synthetic') return 'experimental';
      return 'placeable';
    },
  };

  global.WOSAssetResolver = Resolver;
  console.log('[AssetResolver] ready');
})(window);
