// ── MarineVesselTaxonomyResolver v1.0.0 ───────────────────────────────────────
// 0603U_WOS_MarineVesselTaxonomyResolver_v1.0.0
// Status: active | Classification: taxonomy-authority (advisory, read-only)
//
// Infers a likely vessel ROLE and candidate marine ASSET from AIS metadata +
// the 0603T asset-pack taxonomy hints. ADVISORY ONLY — never mutates AIS truth,
// actor records, the assignment map, default assignments, the renderer, or feeds.
// Load AFTER actorAssetLibraryAuthority.js. Never throws.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  // AIS ship-type → role (specific codes; ranges handled in code).
  var SHIP_TYPE_ROLE = {
    0: 'unknown',
    30: 'fishing', 31: 'towing', 32: 'towing', 33: 'dredging', 34: 'diving',
    35: 'military', 36: 'sailing', 37: 'yacht',
    50: 'pilot', 51: 'search_rescue', 52: 'tug', 53: 'port_tender',
    54: 'anti_pollution', 55: 'law_enforcement', 58: 'medical', 59: 'special',
  };
  function _roleFromShipType(t) {
    if (SHIP_TYPE_ROLE[t] != null) return { role: SHIP_TYPE_ROLE[t], range: false };
    if (t >= 60 && t <= 69) return { role: 'passenger', range: true };
    if (t >= 70 && t <= 79) return { role: 'cargo', range: true };
    if (t >= 80 && t <= 89) return { role: 'tanker', range: true };
    if (t >= 90 && t <= 99) return { role: 'other', range: true };
    return null;
  }

  var ROLE_ASSET = {
    tug: 'asset://marine/tug_boat', towing: 'asset://marine/tug_boat',
    pilot: 'asset://marine/pilot_boat', port_tender: 'asset://marine/service_boat', service: 'asset://marine/service_boat',
    search_rescue: 'asset://marine/service_boat', anti_pollution: 'asset://marine/service_boat',
    law_enforcement: 'asset://marine/police_boat', police: 'asset://marine/police_boat',
    fire: 'asset://marine/fire_boat',
    fishing: 'asset://marine/fishing_boat', sailing: 'asset://marine/sailboat',
    yacht: 'asset://marine/yacht_small',
    passenger: 'asset://marine/passenger_ferry', ferry: 'asset://marine/passenger_ferry',
    cruise: 'asset://marine/cruise_ship',
    cargo: 'asset://marine/cargo_small', container: 'asset://marine/container_ship',
    tanker: 'asset://marine/tanker', barge: 'asset://marine/barge',
    unknown: 'asset://marine/unknown_vessel', other: 'asset://marine/vessel_generic',
  };
  var GENERIC = 'asset://marine/vessel_generic';

  // Conservative name/callsign hints (lower authority than numeric ship type).
  var NAME_HINTS = [
    ['tug', 'tug'], ['pilot', 'pilot'], ['police', 'police'], ['fire', 'fire'],
    ['ferry', 'ferry'], ['cruise', 'cruise'], ['container', 'container'], ['cargo', 'cargo'],
    ['tanker', 'tanker'], ['barge', 'barge'], ['yacht', 'yacht'], ['sail', 'sailing'], ['fishing', 'fishing'],
  ];

  var _enabled = true, _debug = false;
  var _stats = { resolved: 0, lastResolvedAt: 0, lastError: null };

  function _ala() { return SBE.ActorAssetLibraryAuthority; }
  function _num(v) {
    if (typeof v === 'number' && isFinite(v)) return v;
    if (typeof v === 'string' && /^\d+$/.test(v.trim())) return parseInt(v, 10);
    return null;
  }
  function _extractShipType(input) {
    var md = input.metadata || {};
    var c = [input.shipType, md.shipType, md.ship_type, md.aisShipType, md.type];
    for (var i = 0; i < c.length; i++) { var n = _num(c[i]); if (n != null) return n; }
    return null;
  }
  function _textRole(input) {
    var t = (input.vesselType || input.vesselClass || (input.metadata && (input.metadata.type)) || '').toString().toLowerCase();
    if (!t) return null;
    if (/passenger/.test(t)) return 'passenger';
    if (/cargo/.test(t)) return 'cargo';
    if (/tanker/.test(t)) return 'tanker';
    if (/tug/.test(t)) return 'tug';
    if (/ferry/.test(t)) return 'ferry';
    return null;
  }
  function _nameHint(input) {
    var s = ((input.name || '') + ' ' + (input.callsign || '')).toLowerCase();
    if (!s.trim()) return null;
    for (var i = 0; i < NAME_HINTS.length; i++) if (s.indexOf(NAME_HINTS[i][0]) !== -1) return NAME_HINTS[i][1];
    return null;
  }
  function _clamp(v) { return Math.max(0, Math.min(0.98, v)); }

  // ── resolveVessel(input) — advisory; never throws ──────────────────────────
  function resolveVessel(input) {
    input = input || {};
    var shipType = _extractShipType(input);

    // 0604C — if raw AIS shipType is absent, consult the read-only normalizer for
    // a derived pseudo shipType (name/dimension hint). Never mutates input.
    var normInfo = null;
    if (shipType == null && SBE.AISMetadataNormalizer && typeof SBE.AISMetadataNormalizer.normalize === 'function') {
      try {
        var nr = SBE.AISMetadataNormalizer.normalize(input);
        if (nr && nr.ok && nr.inference && nr.inference.applied && nr.inference.pseudoShipType != null) {
          shipType = nr.inference.pseudoShipType;
          normInfo = { normalized: true, normalizationSource: nr.inference.source,
            normalizationConfidence: nr.inference.confidence, normalizationReason: nr.inference.reason };
        }
      } catch (e) {}
    }

    var nameHint = _nameHint(input);
    var lengthM = _num(input.lengthM) || (input.metadata && _num(input.metadata.lengthM)) || null;
    var name = ((input.name || '') + '').toLowerCase();

    var role = null, source = 'fallback', confidence = 0.25, reason = 'No AIS ship type or reliable hint available';

    if (shipType != null) {
      var r = _roleFromShipType(shipType);
      if (r) {
        role = r.role;
        if (normInfo) {
          // Derived pseudo shipType — keep confidence at the normalizer's level, not raw-AIS level.
          source = 'normalized'; confidence = Math.min(r.range ? 0.80 : 0.90, normInfo.normalizationConfidence);
          reason = 'Normalized pseudo shipType ' + shipType + ' maps to ' + role + ' (' + normInfo.normalizationReason + ')';
        } else {
          source = 'shipType'; confidence = r.range ? 0.80 : 0.90;
          reason = 'AIS shipType ' + shipType + ' maps to ' + role;
        }
      }
    }
    if (!role) { var tr = _textRole(input); if (tr) { role = tr; source = 'vesselType'; confidence = 0.70; reason = 'Declared vessel type maps to ' + role; } }
    if (!role && nameHint) { role = nameHint; source = 'name'; confidence = 0.65; reason = 'Name/callsign hint maps to ' + role; }
    if (!role) { role = 'unknown'; source = 'fallback'; confidence = 0.25; }

    // Dimension-based refinement (secondary; small confidence effect).
    var dimensionHint = null;
    if (role === 'cargo' && lengthM != null) {
      if (lengthM >= 220 && /container/.test(name)) { role = 'container'; dimensionHint = 'container_by_length_name'; }
      else if (lengthM >= 180) { dimensionHint = 'cargo_large'; }
    } else if (role === 'passenger' && lengthM != null && lengthM >= 120 && /cruise/.test(name)) {
      role = 'cruise'; dimensionHint = 'cruise_by_length_name';
    } else if (role === 'yacht' && lengthM != null) {
      dimensionHint = lengthM >= 35 ? 'yacht_large' : 'yacht_small';
    }

    // Role → asset.
    var assetId = ROLE_ASSET[role] || GENERIC;
    if (dimensionHint === 'cargo_large') assetId = 'asset://marine/cargo_large';
    if (dimensionHint === 'yacht_large') assetId = 'asset://marine/yacht_large';
    if (dimensionHint === 'yacht_small') assetId = 'asset://marine/yacht_small';

    var fallbackUsed = (role === 'unknown') || (assetId === GENERIC && role !== 'other');

    // Asset metadata crosscheck (taxonomyReady + expectedAISShipTypes boost).
    var ala = _ala();
    var asset = ala && ala.getAsset ? ala.getAsset(assetId) : null;
    var expectedMatched = false;
    if (asset) {
      var md = asset.metadata || {};
      if (md.taxonomyReady === false) { assetId = GENERIC; asset = ala.getAsset(GENERIC); fallbackUsed = true; }
      else if (md.expectedAISShipTypes && shipType != null && md.expectedAISShipTypes.indexOf(shipType) !== -1) {
        expectedMatched = true; confidence += 0.05;
      }
    } else { assetId = GENERIC; asset = ala && ala.getAsset ? ala.getAsset(GENERIC) : null; fallbackUsed = true; }

    // Name agrees with numeric role → small boost.
    if (nameHint && shipType != null && nameHint === role) confidence += 0.05;
    if (role === 'unknown') confidence = Math.min(confidence, 0.30);
    confidence = _clamp(confidence);

    _stats.resolved++; _stats.lastResolvedAt = Date.now();
    if (_debug) console.log('[MarineTaxonomy]', role, '→', assetId, '(' + confidence.toFixed(2) + ', ' + source + ')');

    return {
      ok: true, role: role, confidence: Math.round(confidence * 1000) / 1000, source: source, reason: reason,
      shipType: shipType, nameHint: nameHint, dimensionHint: dimensionHint,
      assetId: assetId, assetLabel: asset ? asset.label : null,
      assetSilhouetteClass: asset ? asset.silhouetteClass : null,
      fallbackUsed: fallbackUsed,
      normalized: !!normInfo,
      normalizationSource: normInfo ? normInfo.normalizationSource : null,
      normalizationConfidence: normInfo ? normInfo.normalizationConfidence : null,
      normalizationReason: normInfo ? normInfo.normalizationReason : null,
      metadata: { expectedAISShipTypesMatched: expectedMatched, lengthM: lengthM },
    };
  }

  // ── resolveAssetCandidate(actor) — actor-record wrapper ─────────────────────
  function resolveAssetCandidate(actor) {
    actor = actor || {};
    var type = actor.actorType || '';
    if (type.indexOf('marine') !== 0) return { ok: false, reason: 'not_marine_actor' };
    var md = actor.metadata || {};
    return resolveVessel({
      actorId: actor.actorId, actorType: type, sourceId: actor.sourceId, metadata: md,
      shipType: actor.shipType, vesselType: actor.vesselType, vesselClass: actor.vesselClass,
      name: actor.name || actor.label, callsign: actor.callsign || md.callsign, mmsi: actor.mmsi || md.mmsi,
      lengthM: actor.lengthM || md.lengthM, widthM: actor.widthM || md.widthM, speedKts: actor.speedKts,
    });
  }

  // ── Audit helpers (read-only) ───────────────────────────────────────────────
  function auditActor(actorId) {
    var tar = SBE.TruthActorRuntime;
    if (!tar || typeof tar.getActor !== 'function') return { ok: false, reason: 'runtime_unavailable' };
    var a = tar.getActor(actorId);
    if (!a) return { ok: false, reason: 'actor_not_found' };
    return resolveAssetCandidate(a);
  }
  function auditActors() {
    var tar = SBE.TruthActorRuntime;
    if (!tar || typeof tar.listActors !== 'function') return [];
    return tar.listActors().filter(function (a) { return (a.actorType || '').indexOf('marine') === 0; })
      .map(function (a) { var r = resolveAssetCandidate(a); return { actorId: a.actorId, role: r.role, assetId: r.assetId, confidence: r.confidence }; });
  }

  function listRules() {
    return {
      shipTypeRoles: (function () { var o = {}; for (var k in SHIP_TYPE_ROLE) o[k] = SHIP_TYPE_ROLE[k]; return o; })(),
      ranges: { '60-69': 'passenger', '70-79': 'cargo', '80-89': 'tanker', '90-99': 'other' },
      roleAsset: (function () { var o = {}; for (var k in ROLE_ASSET) o[k] = ROLE_ASSET[k]; return o; })(),
    };
  }
  function listMarineAssets() {
    var ala = _ala();
    return (ala && ala.listByCategory) ? ala.listByCategory('marine') : [];
  }

  function getState() {
    return { version: VERSION, enabled: _enabled, debug: _debug,
      resolvedCount: _stats.resolved, lastResolvedAt: _stats.lastResolvedAt, lastError: _stats.lastError,
      ruleCount: Object.keys(SHIP_TYPE_ROLE).length + 4, roleCount: Object.keys(ROLE_ASSET).length };
  }
  function setEnabled(on) { _enabled = on !== false; return _enabled; }
  function setDebug(on) { _debug = on !== false; return _debug; }

  SBE.MarineVesselTaxonomyResolver = Object.freeze({
    VERSION:               VERSION,
    resolveVessel:         resolveVessel,
    resolveAssetCandidate: resolveAssetCandidate,
    listRules:             listRules,
    listMarineAssets:      listMarineAssets,
    auditActor:            auditActor,
    auditActors:           auditActors,
    getState:              getState,
    setEnabled:            setEnabled,
    setDebug:              setDebug,
  });

  console.log('[MarineVesselTaxonomyResolver] v' + VERSION + ' loaded');
})(window);
