// ── AISVesselMetadataAudit v1.0.0 ─────────────────────────────────────────────
// 0603Y_WOS_AISVesselMetadataAudit_v1.0.0
// Status: active | Classification: diagnostic-audit (read-only)
//
// Measures whether live AIS metadata is reliable enough to classify vessels at
// scale. READ-ONLY — never starts feeds/Drive, never mutates actor records,
// metadata, assignments, taxonomy/bridge settings, or the renderer. Manual only.
// Load AFTER marineTaxonomyAssetBridge.js. Never throws.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  var _debug = false;
  var _stats = { lastAuditAt: 0, lastError: null };

  function _tar() { return SBE.TruthActorRuntime; }
  function _resolver() { return SBE.MarineVesselTaxonomyResolver; }
  function _bridge() { return SBE.MarineTaxonomyAssetBridge; }
  function _isMarine(t) { return t === 'marine.vessel' || t === 'marine.ferry'; }
  function _pct(n, total) { return total > 0 ? Math.round((n / total) * 10000) / 100 : 0; }
  function _num(v) { return (typeof v === 'number' && isFinite(v)) ? v : (typeof v === 'string' && /^\d+(\.\d+)?$/.test(v) ? parseFloat(v) : null); }

  // 0603Y.1 — read-only marine-record detection across heterogeneous sources.
  function _recordIsMarine(r) {
    if (!r || typeof r !== 'object') return false;
    if (r.actorType === 'marine.vessel' || r.actorType === 'marine.ferry') return true;
    if (r.type === 'vessel' || r.kind === 'vessel') return true;
    if (r.sourceId === 'ais_runtime') return true;
    if (r.mmsi != null || (r.metadata && r.metadata.mmsi != null)) return true;
    if (r.shipType != null || (r.metadata && r.metadata.shipType != null) || r.aisShipType != null) return true;
    return false;
  }

  // Normalize any source record into an actor-like shape (shallow, read-only).
  function _normalize(r, sourceId, ferry) {
    if (r.actorType && r.metadata) return r;   // already actor-shaped (TruthActorRuntime)
    var md = r.metadata || {};
    return {
      actorId: r.actorId || (r.mmsi != null ? ('ais:' + r.mmsi) : (r.id || 'vessel:' + (r.callsign || Math.random().toString(36).slice(2)))),
      actorType: ferry ? 'marine.ferry' : 'marine.vessel',
      sourceId: r.sourceId || sourceId,
      label: r.label || r.vesselName || r.name || (r.mmsi != null ? ('MMSI ' + r.mmsi) : null),
      name: r.vesselName || r.name || r.label || null,
      mmsi: r.mmsi || md.mmsi || null,
      shipType: r.shipType || r.aisShipType || md.shipType,
      vesselType: r.vesselType || md.vesselType,
      vesselClass: r.vesselClass || md.vesselClass,
      metadata: {
        shipType: r.shipType != null ? r.shipType : md.shipType,
        ship_type: r.ship_type != null ? r.ship_type : md.ship_type,
        aisShipType: r.aisShipType != null ? r.aisShipType : md.aisShipType,
        type: r.type != null ? r.type : md.type,
        vesselType: r.vesselType || md.vesselType,
        vesselClass: r.vesselClass || md.vesselClass,
        lengthM: r.lengthMeters != null ? r.lengthMeters : (r.lengthM != null ? r.lengthM : md.lengthM),
        widthM: r.widthMeters != null ? r.widthMeters : (r.widthM != null ? r.widthM : md.widthM),
        speedKts: r.speedKnots != null ? r.speedKnots : (r.speedKts != null ? r.speedKts : md.speedKts),
        headingDeg: r.trueHeading != null ? r.trueHeading : (r.headingDeg != null ? r.headingDeg : md.headingDeg),
        status: r.state || r.status || md.status,
        callsign: r.callsign || md.callsign,
      },
      lng: r.lng != null ? r.lng : r.lon, lat: r.lat,
    };
  }

  // Probe an accessor chain safely; returns raw array or null.
  function _probe(obj, paths) {
    if (!obj) return null;
    for (var i = 0; i < paths.length; i++) {
      try {
        var v = paths[i](obj);
        if (Array.isArray(v) && v.length >= 0) return v;
      } catch (e) {}
    }
    return null;
  }

  // ── 0603Y.1 source adapter — discover marine actors from the live source ─────
  function _collectMarineActors() {
    var tried = [];
    function record(source, available, raw) {
      var arr = Array.isArray(raw) ? raw : [];
      var marine = arr.filter(_recordIsMarine);
      tried.push({ source: source, available: available, count: arr.length, marineCount: marine.length,
        reason: !available ? 'missing_runtime' : (marine.length === 0 ? 'no_marine_records' : null) });
      return marine;
    }

    // 1. TruthActorRuntime
    var tar = _tar();
    var truthRaw = (tar && typeof tar.listActors === 'function') ? (function () { try { return tar.listActors(); } catch (e) { return []; } })() : null;
    var m1 = record('truth_actor_runtime', !!(tar && tar.listActors), truthRaw);
    if (m1.length) return { source: 'truth_actor_runtime', actors: m1.map(function (a) { return _normalize(a, 'truth_actor_runtime'); }), sourcesTried: tried };

    // 2. AISRuntime
    var ais = SBE.AISRuntime;
    var aisRaw = _probe(ais, [
      function (o) { return o.getActiveVessels(); }, function (o) { return o.listVessels(); }, function (o) { return o.getVessels(); },
      function (o) { return o.getState().vessels; }, function (o) { return o.getDebugSnapshot().vessels; },
      function (o) { return o.getSnapshot().vessels; }, function (o) { return o.vessels; }, function (o) { return o._vessels; },
    ]);
    var m2 = record('ais_runtime', !!ais, aisRaw);
    if (m2.length) return { source: 'ais_runtime', actors: m2.map(function (v) { return _normalize(v, 'ais_runtime'); }), sourcesTried: tried };

    // 3. Maritime validation / feed
    var mvf = SBE.MaritimeValidationFeed;
    var mvfRaw = _probe(mvf, [
      function (o) { return o.listVessels(); }, function (o) { return o.getVessels(); },
      function (o) { return o.getState().vessels; }, function (o) { return o.getSnapshot().vessels; },
    ]);
    var m3 = record('maritime_validation_feed', !!mvf, mvfRaw);
    if (m3.length) return { source: 'maritime_validation_feed', actors: m3.map(function (v) { return _normalize(v, 'maritime_validation_feed'); }), sourcesTried: tried };

    // 4. Renderer / WSL snapshot (IDs/positions may lack AIS metadata → diagnostics only).
    var wsl = SBE.WorldSpaceVehicleLayer;
    var wslRaw = _probe(wsl, [
      function (o) { return o.listActors(); }, function (o) { return o.listVehicles(); },
      function (o) { return o.getState().actors; }, function (o) { return o.getDebugSnapshot().actors; },
      function (o) { return o.getDebugSnapshot().vehicles; }, function (o) { return o.getState().vehicles; },
    ]);
    var m4 = record('world_space_vehicle_layer', !!wsl, wslRaw);
    // WSL records rarely carry AIS metadata; only use if they look marine.
    if (m4.length && m4.some(function (r) { return r.mmsi != null || (r.metadata && r.metadata.shipType != null); })) {
      return { source: 'world_space_vehicle_layer', actors: m4.map(function (v) { return _normalize(v, 'world_space_vehicle_layer'); }), sourcesTried: tried };
    }

    return { source: 'none', actors: [], sourcesTried: tried };
  }

  function _extractShipType(a) {
    var md = a.metadata || {};
    var prop = a.properties || {};
    var src = [
      ['shipType', a.shipType], ['type', a.type], ['ship_type', a.ship_type],
      ['aisShipType', a.aisShipType], ['vesselType', a.vesselType], ['vesselClass', a.vesselClass],
      ['metadata.shipType', md.shipType], ['metadata.ship_type', md.ship_type],
      ['metadata.aisShipType', md.aisShipType], ['metadata.type', md.type],
      ['metadata.vessel_type', md.vessel_type], ['metadata.class', md.class],
      ['properties.shipType', prop.shipType], ['properties.ship_type', prop.ship_type], ['properties.type', prop.type],
    ];
    for (var i = 0; i < src.length; i++) { var n = _num(src[i][1]); if (n != null) return { value: n, source: src[i][0] }; }
    return { value: null, source: null };
  }

  // ── auditActor(actorOrId) ───────────────────────────────────────────────────
  function auditActor(actorOrId) {
    var a = actorOrId;
    if (typeof actorOrId === 'string') {
      var tar = _tar();
      a = (tar && typeof tar.getActor === 'function') ? tar.getActor(actorOrId) : null;
    }
    if (!a || typeof a !== 'object') return { ok: false, reason: 'actor_not_found' };

    var md = a.metadata || {};
    var st = _extractShipType(a);
    var name = a.name || a.label || md.name || null;
    var mmsi = a.mmsi || md.mmsi || null;
    var lengthM = _num(a.lengthM) != null ? _num(a.lengthM) : _num(md.lengthM);
    var widthM = _num(a.widthM) != null ? _num(a.widthM) : _num(md.widthM);
    var hasShipType = st.value != null, hasName = !!(name && String(name).trim()), hasMmsi = !!mmsi;
    var hasDimensions = (lengthM != null) || (widthM != null);

    // Taxonomy (read-only).
    var resolver = _resolver();
    var tax = null;
    if (resolver && typeof resolver.resolveAssetCandidate === 'function') {
      try { tax = resolver.resolveAssetCandidate(a); } catch (e) { _stats.lastError = 'resolve_failed'; }
    }
    if (!tax) tax = { ok: false, role: 'unknown', assetId: null, confidence: 0, source: 'none', reason: 'resolver_unavailable', fallbackUsed: true };

    // Bridge decision (read-only; resolveBridge accepts actor-like objects).
    var bridge = _bridge(); var bAvail = !!(bridge && typeof bridge.resolveBridge === 'function');
    var bEnabled = bAvail && bridge.getState ? bridge.getState().enabled : false;
    var bDecision = bAvail ? (function () { try { return bridge.resolveBridge(a, (a._lastPayload && a._lastPayload.lodTier) || 'model'); } catch (e) { return { apply: false, reason: 'bridge_error' }; } })() : { apply: false, reason: 'bridge_unavailable' };

    // Quality flags + score.
    var conf = typeof tax.confidence === 'number' ? tax.confidence : 0;
    var flags = [];
    flags.push(hasShipType ? 'has_ship_type' : 'missing_ship_type');
    flags.push(hasName ? 'has_name' : 'missing_name');
    flags.push(hasMmsi ? 'has_mmsi' : 'missing_mmsi');
    flags.push(hasDimensions ? 'has_dimensions' : 'missing_dimensions');
    if (tax.role === 'unknown') flags.push('taxonomy_unknown');
    else if (conf >= 0.80) flags.push('taxonomy_high_confidence');
    else if (conf >= 0.50) flags.push('taxonomy_medium_confidence');
    else flags.push('taxonomy_low_confidence');
    if (tax.assetId === 'asset://marine/vessel_generic') flags.push('taxonomy_generic');
    flags.push(bDecision.apply ? 'bridge_applied' : 'bridge_not_applied');
    if (!hasShipType && !hasName && !hasDimensions) flags.push('metadata_sparse');

    var score = 0;
    if (hasShipType) score += 0.35;
    if (hasName) score += 0.15;
    if (hasMmsi) score += 0.10;
    if (hasDimensions) score += 0.10;
    if (conf >= 0.80) score += 0.20;
    if (bDecision.apply) score += 0.10;
    score = Math.max(0, Math.min(1, score));

    return {
      ok: true, actorId: a.actorId, actorType: a.actorType, sourceId: a.sourceId, label: a.label || null, name: name, mmsi: mmsi,
      hasShipType: hasShipType, shipType: st.value, shipTypeSource: st.source,
      hasName: hasName, hasMmsi: hasMmsi, hasDimensions: hasDimensions, lengthM: lengthM, widthM: widthM,
      taxonomy: { ok: tax.ok !== false, role: tax.role, assetId: tax.assetId, assetLabel: tax.assetLabel || null,
        confidence: conf, source: tax.source, reason: tax.reason, fallbackUsed: !!tax.fallbackUsed },
      bridge: { available: bAvail, enabled: bEnabled, applied: !!bDecision.apply, reason: bDecision.apply ? null : bDecision.reason },
      qualityFlags: flags, qualityScore: Math.round(score * 100) / 100,
    };
  }

  // ── audit() — aggregate over live marine actors ─────────────────────────────
  function audit() {
    _stats.lastAuditAt = Date.now();
    var collected = _collectMarineActors();
    var actors = collected.actors;
    var n = actors.length;
    var cov = { shipType: 0, name: 0, mmsi: 0, dimensions: 0 };
    var tax = { resolved: 0, high: 0, medium: 0, low: 0, unknown: 0, generic: 0 };
    var bridgeApplied = 0;
    var roleCounts = {}, assetCounts = {}, scoreSum = 0;
    var rows = [];
    // 0604C — normalization coverage (derived, read-only).
    var norm = { inferred: 0, rawShipType: 0, nameHint: 0, dimensionHint: 0, fallback: 0 };
    var normConfSum = 0, normConfCount = 0;
    var nz = SBE.AISMetadataNormalizer;

    actors.forEach(function (a) {
      // Route audit through a derived normalized copy so name/dimension hints
      // count toward shipType coverage without mutating raw AIS truth.
      var auditTarget = a, ninf = null;
      if (nz && typeof nz.normalize === 'function') {
        try { var nr = nz.normalize(a); if (nr && nr.ok) { auditTarget = nr.normalized; ninf = nr.inference; } } catch (e) {}
      }
      if (ninf) {
        if (ninf.source === 'raw_ship_type') norm.rawShipType++;
        else if (ninf.source === 'name_hint') norm.nameHint++;
        else if (ninf.source === 'dimension_hint') norm.dimensionHint++;
        if (ninf.applied) { norm.inferred++; normConfSum += ninf.confidence; normConfCount++; }
        else norm.fallback++;
      }
      var r = auditActor(auditTarget);
      if (!r.ok) return;
      rows.push(r);
      if (r.hasShipType) cov.shipType++;
      if (r.hasName) cov.name++;
      if (r.hasMmsi) cov.mmsi++;
      if (r.hasDimensions) cov.dimensions++;
      var c = r.taxonomy.confidence;
      if (r.taxonomy.role !== 'unknown' && r.taxonomy.assetId) tax.resolved++;
      if (r.taxonomy.role === 'unknown') tax.unknown++;
      else if (c >= 0.80) tax.high++; else if (c >= 0.50) tax.medium++; else tax.low++;
      if (r.taxonomy.assetId === 'asset://marine/vessel_generic') tax.generic++;
      if (r.bridge.applied) bridgeApplied++;
      roleCounts[r.taxonomy.role] = (roleCounts[r.taxonomy.role] || 0) + 1;
      if (r.taxonomy.assetId) assetCounts[r.taxonomy.assetId] = (assetCounts[r.taxonomy.assetId] || 0) + 1;
      scoreSum += r.qualityScore;
    });

    var warnings = [];
    if (n === 0) warnings.push('marine actor count is 0');
    if (n > 0 && _pct(cov.shipType, n) < 60) warnings.push('shipType coverage below 60%');
    if (n > 0 && _pct(tax.unknown, n) > 25) warnings.push('unknown taxonomy above 25%');
    if (n > 0 && _pct(tax.generic, n) > 35) warnings.push('generic fallback above 35%');
    if (n > 0 && _pct(bridgeApplied, n) < 40) warnings.push('bridge applied below 40%');
    var avg = n > 0 ? Math.round((scoreSum / n) * 100) / 100 : 0;
    if (n > 0 && avg < 0.50) warnings.push('average quality score below 0.50');
    var normAvgConf = normConfCount > 0 ? Math.round((normConfSum / normConfCount) * 1000) / 1000 : 0;
    if (n > 0 && _pct(norm.fallback, n) > 50) warnings.push('normalization fallback above 50%');
    if (normConfCount > 0 && normAvgConf < 0.50) warnings.push('inferred confidence average below 0.50');

    return {
      version: VERSION, active: true, actorCount: n, marineActorCount: n,
      source: collected.source, sourceDiagnostics: collected.sourcesTried,
      metadataCoverage: {
        shipType: { count: cov.shipType, percent: _pct(cov.shipType, n) },
        name: { count: cov.name, percent: _pct(cov.name, n) },
        mmsi: { count: cov.mmsi, percent: _pct(cov.mmsi, n) },
        dimensions: { count: cov.dimensions, percent: _pct(cov.dimensions, n) },
      },
      taxonomyCoverage: {
        resolved: { count: tax.resolved, percent: _pct(tax.resolved, n) },
        highConfidence: { count: tax.high, percent: _pct(tax.high, n) },
        mediumConfidence: { count: tax.medium, percent: _pct(tax.medium, n) },
        lowConfidence: { count: tax.low, percent: _pct(tax.low, n) },
        unknown: { count: tax.unknown, percent: _pct(tax.unknown, n) },
        generic: { count: tax.generic, percent: _pct(tax.generic, n) },
      },
      bridgeCoverage: {
        applied: { count: bridgeApplied, percent: _pct(bridgeApplied, n) },
        notApplied: { count: n - bridgeApplied, percent: _pct(n - bridgeApplied, n) },
      },
      normalizationCoverage: {
        inferred: { count: norm.inferred, percent: _pct(norm.inferred, n) },
        rawShipType: { count: norm.rawShipType, percent: _pct(norm.rawShipType, n) },
        nameHint: { count: norm.nameHint, percent: _pct(norm.nameHint, n) },
        dimensionHint: { count: norm.dimensionHint, percent: _pct(norm.dimensionHint, n) },
        fallback: { count: norm.fallback, percent: _pct(norm.fallback, n) },
        averageInferredConfidence: normAvgConf,
      },
      roleCounts: roleCounts, assetCounts: assetCounts,
      averageQualityScore: avg, warnings: warnings, actors: rows,
    };
  }

  // ── sample(options) ─────────────────────────────────────────────────────────
  function sample(options) {
    options = options || {};
    var limit = options.limit || 20;
    var sortBy = options.sortBy || 'qualityScore';
    var dir = options.direction || 'asc';
    var rows = audit().actors;
    if (options.role) rows = rows.filter(function (r) { return r.taxonomy.role === options.role; });
    if (options.onlyWarnings) rows = rows.filter(function (r) { return r.qualityScore < 0.50 || r.taxonomy.role === 'unknown'; });
    function val(r) {
      if (sortBy === 'confidence') return r.taxonomy.confidence;
      if (sortBy === 'role') return r.taxonomy.role;
      if (sortBy === 'actorId') return r.actorId;
      return r.qualityScore;
    }
    rows.sort(function (x, y) { var a = val(x), b = val(y); var c = a < b ? -1 : (a > b ? 1 : 0); return dir === 'desc' ? -c : c; });
    return rows.slice(0, limit).map(function (r) {
      return { actorId: r.actorId, name: r.name, shipType: r.shipType, role: r.taxonomy.role,
        confidence: r.taxonomy.confidence, assetId: r.taxonomy.assetId, bridgeApplied: r.bridge.applied,
        qualityScore: r.qualityScore, flags: r.qualityFlags };
    });
  }

  // 0603Y.1 — source diagnostics without running full taxonomy audit.
  function sources() {
    var c = _collectMarineActors();
    return { selectedSource: c.source, sourceDiagnostics: c.sourcesTried,
      actorCount: c.actors.length, marineActorCount: c.actors.length };
  }

  function getState() { return { version: VERSION, debug: _debug, lastAuditAt: _stats.lastAuditAt, lastError: _stats.lastError }; }
  function setDebug(on) { _debug = on !== false; return _debug; }

  SBE.AISVesselMetadataAudit = Object.freeze({
    VERSION:    VERSION,
    audit:      audit,
    auditActor: auditActor,
    sample:     sample,
    sources:    sources,
    getState:   getState,
    setDebug:   setDebug,
  });

  console.log('[AISVesselMetadataAudit] v' + VERSION + ' loaded');
})(window);
