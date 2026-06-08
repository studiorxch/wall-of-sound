// ── AISMetadataNormalizer v1.0.0 ──────────────────────────────────────────────
// 0604C_WOS_AISMetadataNormalizationPatch_v1.0.0
// Status: active | Classification: read-only-normalization
//
// Derives explicit, inspectable vessel-classification hints from sparse AIS
// records (name / dimensions / status) WITHOUT mutating raw AIS truth. Produces
// a derived normalized COPY for taxonomy/audit/bridge consumption only. Never
// starts feeds/Drive, never writes inferred fields back to AISRuntime records,
// actor records, metadata, assignments, bridge state, or the renderer.
// Load AFTER marineTaxonomyAssetBridge.js, BEFORE aisVesselMetadataAudit.js.
// Never throws.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  var _enabled = true, _debug = false;
  var _stats = { normalized: 0, inferred: 0, fallback: 0, lastAt: 0, lastError: null };

  // ── Explicit, inspectable name-pattern rule registry ────────────────────────
  // NYC-harbor bias is intentional but explicit (see "Known NYC Harbor Bias").
  var NAME_RULES = [
    { id: 'name:tug', type: 'name', keywords: ['tug', 'towing', 'towboat', 'tractor tug'],
      role: 'tug', pseudoShipType: 52, assetId: 'asset://marine/tug_boat', confidence: 0.72 },
    { id: 'name:nyc_ferry', type: 'name', keywords: ['nyc ferry'],
      role: 'passenger', pseudoShipType: 60, assetId: 'asset://marine/nyc_ferry_small', confidence: 0.78 },
    { id: 'name:ferry', type: 'name', keywords: ['ferry', 'staten island', 'seastreak', 'hornblower', 'circle line', 'water taxi'],
      role: 'passenger', pseudoShipType: 60, assetId: 'asset://marine/passenger_ferry', confidence: 0.70 },
    { id: 'name:pilot', type: 'name', keywords: ['pilot', 'sandy hook pilot', 'harbor pilot'],
      role: 'pilot', pseudoShipType: 50, assetId: 'asset://marine/pilot_boat', confidence: 0.75 },
    { id: 'name:law_enforcement', type: 'name', keywords: ['police', 'nypd', 'sheriff', 'coast guard', 'uscg', 'law enforcement'],
      role: 'law_enforcement', pseudoShipType: 55, assetId: 'asset://marine/police_boat', confidence: 0.70 },
    { id: 'name:fire_rescue', type: 'name', keywords: ['fire', 'fdny', 'rescue', 'marine rescue'],
      role: 'fire_rescue', pseudoShipType: 51, assetId: 'asset://marine/fire_boat', confidence: 0.72 },
    { id: 'name:cargo', type: 'name', keywords: ['cargo', 'container', 'maersk', 'msc', 'cosco', 'evergreen', 'hapag', 'sealand', 'cmacgm', 'cma cgm'],
      role: 'cargo', pseudoShipType: 70, assetId: 'asset://marine/container_ship', confidence: 0.70 },
    { id: 'name:tanker', type: 'name', keywords: ['tanker', 'oil', 'petroleum', 'chemical', 'fuel', 'gas', 'lng', 'lpg'],
      role: 'tanker', pseudoShipType: 80, assetId: 'asset://marine/tanker', confidence: 0.72 },
    { id: 'name:barge', type: 'name', keywords: ['barge', 'scow', 'deck barge', 'hopper'],
      role: 'barge', pseudoShipType: 90, assetId: 'asset://marine/barge', confidence: 0.68 },
    { id: 'name:yacht', type: 'name', keywords: ['yacht', 'pleasure', 'private'],
      role: 'yacht', pseudoShipType: 37, assetId: 'asset://marine/yacht_small', confidence: 0.62 },
    { id: 'name:sailing', type: 'name', keywords: ['sail', 'sailing', 'sloop', 'ketch'],
      role: 'sailing', pseudoShipType: 36, assetId: 'asset://marine/sailboat', confidence: 0.68 },
    { id: 'name:fishing', type: 'name', keywords: ['fish', 'fishing', 'trawler', 'lobster'],
      role: 'fishing', pseudoShipType: 30, assetId: 'asset://marine/fishing_boat', confidence: 0.68 },
  ];

  // Dimension rules: only when name inference absent/weak. Lower confidence.
  var DIMENSION_RULES = [
    { id: 'dim:cargo_xl', type: 'dimension', role: 'cargo', pseudoShipType: 70, assetId: 'asset://marine/container_ship',
      confidence: 0.60, test: function (l, w) { return l >= 220 && w >= 25; }, desc: 'length>=220 & width>=25 → container/cargo_large' },
    { id: 'dim:cargo_large', type: 'dimension', role: 'cargo', pseudoShipType: 70, assetId: 'asset://marine/cargo_large',
      confidence: 0.55, test: function (l, w) { return l >= 160 && w >= 20; }, desc: 'length>=160 & width>=20 → cargo_large' },
    { id: 'dim:cargo_small', type: 'dimension', role: 'cargo', pseudoShipType: 70, assetId: 'asset://marine/cargo_small',
      confidence: 0.50, test: function (l, w) { return l >= 80 && w >= 12; }, desc: 'length>=80 & width>=12 → cargo_small' },
    { id: 'dim:service', type: 'dimension', role: 'service', pseudoShipType: 50, assetId: 'asset://marine/service_boat',
      confidence: 0.48, test: function (l, w, s) { return l <= 35 && w <= 10 && s != null && s >= 10; }, desc: 'small & fast → service/pilot candidate' },
  ];

  var FALLBACK = { role: 'unknown', assetId: 'asset://marine/unknown_vessel', confidence: 0.25 };

  function _num(v) {
    if (typeof v === 'number' && isFinite(v)) return v;
    if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim())) return parseFloat(v);
    return null;
  }
  function _clampInferred(v) { return Math.max(0, Math.min(0.90, v)); }

  // Read shipType numeric across known field aliases (raw, not inferred).
  function _rawShipType(r, md) {
    var c = [r.shipType, r.aisShipType, md.shipType, md.ship_type, md.aisShipType, md.type, r.ship_type, r.type];
    for (var i = 0; i < c.length; i++) { var n = _num(c[i]); if (n != null && n > 0) return n; }
    return null;
  }
  function _name(r, md) {
    return ((r.vesselName || r.name || r.label || md.name || '') + '').toString();
  }
  function _callsign(r, md) { return (r.callsign || md.callsign || '') + ''; }
  function _mmsi(r, md) { return r.mmsi != null ? r.mmsi : (md.mmsi != null ? md.mmsi : null); }
  function _dim(r, md, a, b) {
    return _num(r[a]) != null ? _num(r[a]) : (_num(r[b]) != null ? _num(r[b]) : _num(md[b]));
  }

  function _matchName(name, callsign) {
    var s = (name + ' ' + callsign).toLowerCase().replace(/\s+/g, ' ').trim();
    if (!s) return null;
    for (var i = 0; i < NAME_RULES.length; i++) {
      var rule = NAME_RULES[i];
      for (var k = 0; k < rule.keywords.length; k++) {
        if (s.indexOf(rule.keywords[k]) !== -1) return { rule: rule, keyword: rule.keywords[k] };
      }
    }
    return null;
  }
  function _matchDimension(lengthM, widthM, speedKts) {
    if (lengthM == null && widthM == null) return null;
    var l = lengthM == null ? 0 : lengthM, w = widthM == null ? 0 : widthM;
    for (var i = 0; i < DIMENSION_RULES.length; i++) {
      var rule = DIMENSION_RULES[i];
      try { if (rule.test(l, w, speedKts)) return { rule: rule }; } catch (e) {}
    }
    return null;
  }

  // ── normalize(record) — returns derived copy + inference, NEVER mutates ──────
  function normalize(record) {
    if (typeof record === 'string') {
      var looked = _lookupById(record);
      if (!looked) return { ok: false, reason: 'record_not_found' };
      record = looked;
    }
    if (!record || typeof record !== 'object') return { ok: false, reason: 'record_not_found' };

    var md = record.metadata || {};
    var name = _name(record, md);
    var callsign = _callsign(record, md);
    var mmsi = _mmsi(record, md);
    var lengthM = _dim(record, md, 'lengthMeters', 'lengthM');
    var widthM = _dim(record, md, 'widthMeters', 'widthM');
    var speedKts = _dim(record, md, 'speedKnots', 'speedKts');
    var headingDeg = _dim(record, md, 'trueHeading', 'headingDeg');
    var status = record.state || record.status || md.status || null;
    var rawShipType = _rawShipType(record, md);

    var warnings = [];
    var inference;

    var nameMatch = _matchName(name, callsign);
    var dimMatch = _matchDimension(lengthM, widthM, speedKts);

    if (rawShipType != null) {
      // Rule 1: preserve raw numeric ship type. Never override with name.
      inference = { applied: true, role: null, assetId: null, pseudoShipType: rawShipType,
        confidence: 0.95, source: 'raw_ship_type', reason: 'AIS provides raw numeric ship type ' + rawShipType,
        rules: ['raw:ship_type'] };
      // role/asset come from the resolver downstream; we still expose hint role if a name maps.
      if (nameMatch) {
        inference.role = nameMatch.rule.role;
        inference.assetId = nameMatch.rule.assetId;
        // flag conflict if name maps to a clearly different class than the raw type band
        if (!_shipTypeAgreesWithRole(rawShipType, nameMatch.rule.role)) {
          warnings.push('name_conflicts_with_raw_ship_type');
        }
      }
    } else if (nameMatch) {
      // Rule 2: name-based inference.
      var nr = nameMatch.rule;
      var conf = nr.confidence;
      var rules = [nr.id];
      // Rule 4: combined boost when dimensions agree with name role.
      if (dimMatch && dimMatch.rule.role === nr.role) { conf += 0.08; rules.push(dimMatch.rule.id + '(agree)'); }
      else if (dimMatch && dimMatch.rule.role !== nr.role) { warnings.push('dimension_conflict'); }
      inference = { applied: true, role: nr.role, assetId: nr.assetId, pseudoShipType: nr.pseudoShipType,
        confidence: _clampInferred(conf), source: 'name_hint',
        reason: 'name contains ' + nr.role + ' keyword "' + nameMatch.keyword + '"', rules: rules };
    } else if (dimMatch) {
      // Rule 3: dimension-only inference (lower confidence).
      var dr = dimMatch.rule;
      inference = { applied: true, role: dr.role, assetId: dr.assetId, pseudoShipType: dr.pseudoShipType,
        confidence: _clampInferred(dr.confidence), source: 'dimension_hint',
        reason: dr.desc, rules: [dr.id] };
    } else {
      // Fallback.
      inference = { applied: false, role: FALLBACK.role, assetId: FALLBACK.assetId, pseudoShipType: null,
        confidence: FALLBACK.confidence, source: 'fallback', reason: 'no reliable normalization hints', rules: [] };
      warnings.push('no_normalization_hint');
    }

    var normalizedShipType = (rawShipType != null) ? rawShipType : (inference.applied ? inference.pseudoShipType : null);
    var shipTypeSource = (rawShipType != null) ? 'raw_ship_type' : (inference.applied ? inference.source : null);

    var normalized = {
      actorId: record.actorId || (mmsi != null ? ('ais:' + mmsi) : (record.id || null)),
      actorType: record.actorType || 'marine.vessel',
      sourceId: record.sourceId || 'ais_runtime',
      name: name || null,
      mmsi: mmsi,
      callsign: callsign || null,
      lng: record.lng != null ? record.lng : record.lon,
      lat: record.lat,
      metadata: {
        normalized: true,
        normalizedAt: Date.now(),
        normalizerVersion: VERSION,
        rawShipType: rawShipType,
        shipType: normalizedShipType,
        shipTypeSource: shipTypeSource,
        inferredRole: inference.role,
        inferredAssetId: inference.assetId,
        inferenceConfidence: inference.confidence,
        inferenceReason: inference.reason,
        lengthM: lengthM,
        widthM: widthM,
        speedKts: speedKts,
        headingDeg: headingDeg,
        status: status,
        callsign: callsign || null,
        raw: { shipType: rawShipType, type: md.type != null ? md.type : (record.type != null ? record.type : null),
               vesselType: record.vesselType != null ? record.vesselType : (md.vesselType != null ? md.vesselType : null) },
      },
    };

    _stats.normalized++; _stats.lastAt = Date.now();
    if (inference.applied) _stats.inferred++; else _stats.fallback++;
    if (_debug) console.log('[AISNormalizer]', normalized.actorId, '→', inference.role, '(' + inference.confidence + ', ' + inference.source + ')');

    return { ok: true, raw: record, normalized: normalized, inference: inference, warnings: warnings };
  }

  // Approx agreement between a raw shipType code band and an inferred role.
  function _shipTypeAgreesWithRole(t, role) {
    var band = (t === 52 || t === 31 || t === 32) ? 'tug'
      : (t === 50) ? 'pilot' : (t === 51) ? 'fire_rescue' : (t === 55) ? 'law_enforcement'
      : (t === 36) ? 'sailing' : (t === 37) ? 'yacht' : (t === 30) ? 'fishing'
      : (t >= 60 && t <= 69) ? 'passenger' : (t >= 70 && t <= 79) ? 'cargo'
      : (t >= 80 && t <= 89) ? 'tanker' : (t >= 90 && t <= 99) ? 'barge' : null;
    if (band == null) return true; // unknown band → don't flag conflict
    return band === role;
  }

  function _lookupById(id) {
    // audit-source lookup, then TruthActor lookup (read-only).
    var ais = SBE.AISRuntime;
    if (ais && typeof ais.getVessel === 'function') { try { var v = ais.getVessel(id); if (v) return v; } catch (e) {} }
    var tar = SBE.TruthActorRuntime;
    if (tar && typeof tar.getActor === 'function') { try { var a = tar.getActor(id); if (a) return a; } catch (e) {} }
    return null;
  }

  // ── normalizeBatch(records) ─────────────────────────────────────────────────
  function normalizeBatch(records) {
    var arr = Array.isArray(records) ? records : [];
    var rows = [], inferredCount = 0, rawCount = 0, fallbackCount = 0, confSum = 0, normalizedCount = 0;
    arr.forEach(function (rec) {
      var r = normalize(rec);
      if (!r.ok) return;
      normalizedCount++;
      var inf = r.inference, m = r.normalized.metadata;
      if (m.rawShipType != null) rawCount++;
      if (inf.applied) inferredCount++; else fallbackCount++;
      confSum += inf.confidence;
      rows.push({ actorId: r.normalized.actorId, name: r.normalized.name,
        rawShipType: m.rawShipType, normalizedShipType: m.shipType, role: inf.role, assetId: inf.assetId,
        confidence: inf.confidence, source: inf.source, reason: inf.reason, warnings: r.warnings });
    });
    return { version: VERSION, count: arr.length, normalizedCount: normalizedCount,
      inferredCount: inferredCount, rawShipTypeCount: rawCount, fallbackCount: fallbackCount,
      averageConfidence: normalizedCount > 0 ? Math.round((confSum / normalizedCount) * 1000) / 1000 : 0,
      rows: rows };
  }

  // ── explain(record) — normalized result + matched rule details ──────────────
  function explain(record) {
    var r = (typeof record === 'string') ? normalize(record) : normalize(record);
    if (!r.ok) return r;
    var src = (typeof record === 'string') ? r.raw : record;
    var md = (src && src.metadata) || {};
    var name = _name(src, md), callsign = _callsign(src, md);
    var nameMatch = _matchName(name, callsign);
    var dimMatch = _matchDimension(_dim(src, md, 'lengthMeters', 'lengthM'), _dim(src, md, 'widthMeters', 'widthM'), _dim(src, md, 'speedKnots', 'speedKts'));
    return { ok: true, normalized: r.normalized, inference: r.inference, warnings: r.warnings,
      matched: { name: nameMatch ? { ruleId: nameMatch.rule.id, keyword: nameMatch.keyword, rule: nameMatch.rule } : null,
                 dimension: dimMatch ? { ruleId: dimMatch.rule.id, rule: dimMatch.rule } : null,
                 rawShipType: r.normalized.metadata.rawShipType } };
  }

  function listRules() {
    var out = [];
    NAME_RULES.forEach(function (r) { out.push({ id: r.id, type: r.type, keywords: r.keywords.slice(), role: r.role, pseudoShipType: r.pseudoShipType, assetId: r.assetId, confidence: r.confidence }); });
    DIMENSION_RULES.forEach(function (r) { out.push({ id: r.id, type: r.type, role: r.role, pseudoShipType: r.pseudoShipType, assetId: r.assetId, confidence: r.confidence, desc: r.desc }); });
    return out;
  }

  function getState() {
    return { version: VERSION, enabled: _enabled, debug: _debug,
      normalizedCount: _stats.normalized, inferredCount: _stats.inferred, fallbackCount: _stats.fallback,
      ruleCount: NAME_RULES.length + DIMENSION_RULES.length, nameRuleCount: NAME_RULES.length, dimensionRuleCount: DIMENSION_RULES.length,
      lastAt: _stats.lastAt, lastError: _stats.lastError };
  }
  function setEnabled(on) { _enabled = on !== false; return _enabled; }
  function setDebug(on) { _debug = on !== false; return _debug; }

  SBE.AISMetadataNormalizer = Object.freeze({
    VERSION:        VERSION,
    normalize:      normalize,
    normalizeBatch: normalizeBatch,
    explain:        explain,
    listRules:      listRules,
    getState:       getState,
    setEnabled:     setEnabled,
    setDebug:       setDebug,
  });

  console.log('[AISMetadataNormalizer] v' + VERSION + ' loaded');
})(window);
