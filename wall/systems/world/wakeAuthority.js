// ── WakeAuthority v1.2.1 ─────────────────────────────────────────────────────
// 0523D_WOS_MaritimeWakeAuthority_v1.2.1
// Status: active
// Classification: runtime-authority
//
// Supersedes: v1.0.0, v1.1.0, v1.2.0 (WakeAuthority implementation series)
//
// v1.2.1 governance changes from v1.0.1 (prior implementation):
//
//   §9 — Mutable Runtime Segment State (spec-authorized direct mutation)
//     parentEvicted and expiresAtMs are now explicitly permitted to mutate
//     directly on ring segment objects. The Object.freeze() + _evictionState
//     map approach used in v1.0.1 is superseded. Mutations remain restricted
//     to deterministic decay and deterministic parent eviction compression only.
//     All identity/provenance fields remain immutable by convention.
//
//   §7 — Wake Class Canonicalization (no internal mapping permitted)
//     WakeAuthority no longer defines an internal taxonomy→WakeAuthority
//     class mapping. The bridge function resolveWakeAuthorityClass(vesselClass)
//     in MaritimeTaxonomyProfiles (0523A) is the sole canonical source.
//     Magic-number wake mapping is forbidden. If taxonomy is unavailable,
//     eligible=false is returned (fail-closed; no fabricated wake class).
//
// Preserved from v1.0.1:
//   §4  — Provenance supremacy: synthetic wakes may not evict AIS wakes
//   §8  — Fixed-size ring buffer, O(1) insertion, deterministic overflow
//   §11 — AIS gap handling: no fabricated wake continuity
//   §12 — Determinism: no Date.now(), performance.now(), Math.random()
//   §15 — Synthetic budget independence from AIS budget
//   8-step canonical emission ordering
//
// Core invariant:
//   vessel motion creates wake memory
//   wake memory never creates vessel motion
//
// Placement: wall/systems/world/wakeAuthority.js
// ─────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  var VERSION = '1.2.1';

  // ── Constitutional constants ──────────────────────────────────────────────

  var WAKE_MAX_SEGMENTS_GLOBAL             = 5000;
  var WAKE_MAX_SYNTHETIC_SEGMENTS_GLOBAL   = 1000;
  var WAKE_MAX_SEGMENTS_PER_VESSEL         = 48;
  var WAKE_MAX_SEGMENTS_PER_ZONE           = 800;

  var WAKE_EMIT_INTERVAL_HERO_MS           = 500;
  var WAKE_EMIT_INTERVAL_MID_MS            = 1000;
  var WAKE_EMIT_INTERVAL_BACKGROUND_MS     = 3000;

  var WAKE_MIN_SEGMENT_DISTANCE_M          = 8;

  var WAKE_MAX_LIFETIME_MS                 = 1800000; // 30 min (§16)
  var SYNTHETIC_WAKE_MAX_LIFETIME_MULTIPLIER = 0.75;  // §16 synthetic modifier

  var WAKE_EVICTION_DECAY_MULTIPLIER       = 4;       // §10 parent eviction compression

  // ── Wake lifetime by population tier (§16) ───────────────────────────────

  var _tierLifetimeMs = {
    HERO:       1800000, // 30 min
    MID:         900000, // 15 min
    BACKGROUND:  300000, //  5 min
    GHOST:             0,
  };

  // ── Wake width range ──────────────────────────────────────────────────────

  var WAKE_WIDTH_MIN_M = 5;
  var WAKE_WIDTH_MAX_M = 80;

  // ── Harbor flat-earth approximation ──────────────────────────────────────
  // Localized to NY Harbor center latitude. No haversine in hot paths.

  var _HARBOR_CENTER_LAT_DEG = 40.65;
  var _LAT_M_PER_DEG         = 111320;
  var _LNG_M_PER_DEG         = 111320 * Math.cos(_HARBOR_CENTER_LAT_DEG * Math.PI / 180);

  function _approxDistanceM(lat1, lng1, lat2, lng2) {
    var dlat = (lat2 - lat1) * _LAT_M_PER_DEG;
    var dlng = (lng2 - lng1) * _LNG_M_PER_DEG;
    return Math.sqrt(dlat * dlat + dlng * dlng);
  }

  // ── §7: Wake class resolution — taxonomy bridge, no internal mapping ──────
  // WakeAuthority may not redefine the taxonomy→WakeAuthority class mapping.
  // All resolution goes through MaritimeTaxonomyProfiles.resolveWakeAuthorityClass().
  // If taxonomy is unavailable, fail-closed (return null → eligible=false).

  function _resolveWakeClass(vesselClass) {
    var mtp = SBE.MaritimeTaxonomyProfiles;
    if (!mtp || !mtp.resolveWakeAuthorityClass) return null;
    return mtp.resolveWakeAuthorityClass(vesselClass); // 'NONE'|'MINIMAL'|'STANDARD'|'HEAVY'|null
  }

  // ── Emit interval by tier ─────────────────────────────────────────────────

  function _emitIntervalForTier(tier) {
    switch (tier) {
      case 'HERO':       return WAKE_EMIT_INTERVAL_HERO_MS;
      case 'MID':        return WAKE_EMIT_INTERVAL_MID_MS;
      case 'BACKGROUND': return WAKE_EMIT_INTERVAL_BACKGROUND_MS;
      default:           return Infinity;
    }
  }

  // ── Ring buffer ───────────────────────────────────────────────────────────
  // Fixed-allocation. _ringHead = next write position.
  // On capacity overflow, oldest segment at _ringHead is evicted first.
  //
  // §9: Segment objects in the ring have two mutable fields:
  //   parentEvicted — set by notifyVesselEvicted()
  //   expiresAtMs   — compressed by notifyVesselEvicted() / cleared by decayWakeSegments()
  // All other fields (wakeId, vesselId, provenance, start, end, …) are
  // immutable by convention after _ringInsert().

  var _ring       = new Array(WAKE_MAX_SEGMENTS_GLOBAL).fill(null);
  var _ringHead   = 0;
  var _ringActive = 0;

  // Budget counters
  var _globalSyntheticCount = 0;
  var _vesselCounts         = {};
  var _zoneCounts           = {};

  function _ringInsert(segment) {
    var slot    = _ringHead;
    var evicted = _ring[slot];
    if (evicted !== null) {
      _onRingOverflow(evicted);
    }
    _ring[slot] = segment;
    _ringHead   = (_ringHead + 1) % WAKE_MAX_SEGMENTS_GLOBAL;
    _ringActive++;

    _vesselCounts[segment.vesselId] = (_vesselCounts[segment.vesselId] || 0) + 1;
    if (segment.zoneId) _zoneCounts[segment.zoneId] = (_zoneCounts[segment.zoneId] || 0) + 1;
    if (segment.provenance === 'SYNTHETIC_ECOLOGY') _globalSyntheticCount++;
  }

  function _onRingOverflow(evictedSegment) {
    _ringActive--;
    _removeCounts(evictedSegment);
    _tel.ringOverflowEvictions++;
  }

  function _clearSlot(idx) {
    var seg = _ring[idx];
    if (seg === null) return;
    _ring[idx] = null;
    _ringActive--;
    _removeCounts(seg);
  }

  function _removeCounts(segment) {
    var vid = segment.vesselId;
    if (_vesselCounts[vid] > 0) _vesselCounts[vid]--;
    if (_vesselCounts[vid] === 0) delete _vesselCounts[vid];

    var zid = segment.zoneId;
    if (zid && _zoneCounts[zid] > 0) _zoneCounts[zid]--;
    if (zid && _zoneCounts[zid] === 0) delete _zoneCounts[zid];

    if (segment.provenance === 'SYNTHETIC_ECOLOGY' && _globalSyntheticCount > 0) {
      _globalSyntheticCount--;
    }
  }

  // ── Per-vessel emitter tracking ───────────────────────────────────────────

  var _vesselEmitters = {};

  function _emitterFor(vesselId) {
    if (!_vesselEmitters[vesselId]) {
      _vesselEmitters[vesselId] = {
        lastEmissionMs: 0,
        lastEndLat:     null,
        lastEndLng:     null,
        cachedZoneId:   null,
      };
    }
    return _vesselEmitters[vesselId];
  }

  // ── Telemetry ─────────────────────────────────────────────────────────────

  var _tel = {
    emitted:               0,
    rejected:              0,
    decayed:               0,
    parentEvictions:       0,
    ringOverflowEvictions: 0,
  };

  // ── resolveWakeEligibility ────────────────────────────────────────────────
  // Resolves eligibility via taxonomy bridge (§7).
  // Returns a WakeEmitterState for use by emitWakeSegment().

  function resolveWakeEligibility(vesselId, vesselClass, populationTier, speedKts, provenance) {
    var wakeClass = _resolveWakeClass(vesselClass); // null if taxonomy unavailable

    var eligible = (
      wakeClass !== null &&
      wakeClass !== 'NONE' &&
      populationTier !== 'GHOST' &&
      Number.isFinite(speedKts) &&
      speedKts >= 0
    );

    return {
      eligible:       eligible,
      wakeClass:      wakeClass || 'NONE',
      populationTier: populationTier || 'GHOST',
      provenance:     provenance     || 'AIS_VESSEL',
    };
  }

  // ── emitWakeSegment — canonical 8-step ordered evaluation (spec §17) ──────
  //
  // Step ordering is constitutional and may not vary between implementations.
  //
  // §4 provenance supremacy enforced at step 4:
  //   AIS_VESSEL: ring overflow permitted — _ringInsert() evicts oldest.
  //   SYNTHETIC_ECOLOGY: hard-rejected if ring is at capacity. Synthetic wakes
  //     may NEVER evict AIS segments.

  function emitWakeSegment(emitter, vessel, previousEmission, simulationTimeMs) {
    var vid = vessel.vesselId;

    // ── Step 1: eligibility ───────────────────────────────────────────────
    if (!emitter.eligible) { _tel.rejected++; return null; }

    // ── Step 2: wakeClass NONE ────────────────────────────────────────────
    if (emitter.wakeClass === 'NONE') { _tel.rejected++; return null; }

    // ── Step 3: GHOST tier ────────────────────────────────────────────────
    if (emitter.populationTier === 'GHOST') { _tel.rejected++; return null; }

    // ── Step 4: global wake budget — provenance-aware (§4, §15) ──────────
    if (emitter.provenance === 'SYNTHETIC_ECOLOGY') {
      // Synthetic emissions may not evict AIS segments. Hard-reject if full.
      if (_ringActive >= WAKE_MAX_SEGMENTS_GLOBAL) {
        _tel.rejected++;
        return null;
      }
      // Synthetic sub-budget: independent ceiling within the global ring.
      if (_globalSyntheticCount >= WAKE_MAX_SYNTHETIC_SEGMENTS_GLOBAL) {
        _tel.rejected++;
        return null;
      }
    }
    // AIS_VESSEL: no hard-reject; _ringInsert() evicts oldest deterministically.

    // ── Step 5: per-vessel budget ─────────────────────────────────────────
    if ((_vesselCounts[vid] || 0) >= WAKE_MAX_SEGMENTS_PER_VESSEL) {
      _tel.rejected++;
      return null;
    }

    // ── Step 6: emit interval ─────────────────────────────────────────────
    var emitterState = _emitterFor(vid);
    var interval     = _emitIntervalForTier(emitter.populationTier);
    if ((simulationTimeMs - emitterState.lastEmissionMs) < interval) {
      _tel.rejected++;
      return null;
    }

    // ── Step 7: minimum distance ──────────────────────────────────────────
    if (emitterState.lastEndLat !== null) {
      var dist = _approxDistanceM(
        emitterState.lastEndLat, emitterState.lastEndLng,
        vessel.lat, vessel.lng
      );
      if (dist < WAKE_MIN_SEGMENT_DISTANCE_M) {
        _tel.rejected++;
        return null;
      }
    }

    // ── Step 8: emit ──────────────────────────────────────────────────────

    // Zone — cached per vessel; refresh when movement confirmed
    var zoneId = vessel.zoneId || emitterState.cachedZoneId || null;
    if (!zoneId) {
      var mez = SBE.MaritimeEcologicalZones;
      if (mez) {
        var zone = mez.getZoneForCoordinate(vessel.lat, vessel.lng);
        zoneId = zone ? zone.zoneId : null;
      }
      emitterState.cachedZoneId = zoneId;
    }

    // Per-zone budget
    if (zoneId && (_zoneCounts[zoneId] || 0) >= WAKE_MAX_SEGMENTS_PER_ZONE) {
      _tel.rejected++;
      return null;
    }

    // Geometry
    var startLat = (previousEmission !== null && emitterState.lastEndLat !== null)
      ? previousEmission.end.lat
      : vessel.lat;
    var startLng = (previousEmission !== null && emitterState.lastEndLng !== null)
      ? previousEmission.end.lng
      : vessel.lng;

    // Intensity, width, turbulence from taxonomy profile
    var mtp     = SBE.MaritimeTaxonomyProfiles;
    var profile = mtp && mtp.getTaxonomyProfile(vessel.vesselClass);
    var F       = mtp && mtp.F;

    var maxSpeedKts = profile ? profile.vec[F.MAX_EXPECTED_KTS] : 20;
    var wakeAuth    = profile ? profile.vec[F.WAKE_AUTHORITY]   : 0.3;
    var wakeWidthF  = profile ? profile.vec[F.WAKE_WIDTH]       : 0.3;
    var turbF       = profile ? profile.vec[F.TURBULENCE]       : 0.2;

    var speedFactor   = Math.max(0, Math.min(1, vessel.speedKts / Math.max(1, maxSpeedKts)));
    var intensityRaw  = Math.max(0, Math.min(1, speedFactor * wakeAuth));
    var widthMeters   = WAKE_WIDTH_MIN_M + wakeWidthF * (WAKE_WIDTH_MAX_M - WAKE_WIDTH_MIN_M);
    var turbulenceRaw = Math.max(0, Math.min(1, turbF * speedFactor));

    // Lifetime (§16)
    var lifetimeMs = Math.min(
      _tierLifetimeMs[emitter.populationTier] || 300000,
      WAKE_MAX_LIFETIME_MS
    );
    if (emitter.provenance === 'SYNTHETIC_ECOLOGY') {
      lifetimeMs = Math.min(
        lifetimeMs,
        Math.floor(WAKE_MAX_LIFETIME_MS * SYNTHETIC_WAKE_MAX_LIFETIME_MULTIPLIER)
      );
    }

    // Wake identifier (§6): deterministic, replay-stable
    var wakeId = 'wake::' + vid + '::' + simulationTimeMs;

    // §9: parentEvicted and expiresAtMs are mutable runtime fields.
    // All other fields are identity/provenance fields — immutable by convention.
    var segment = {
      wakeId:                   wakeId,
      vesselId:                 vid,
      zoneId:                   zoneId,
      provenance:               emitter.provenance,
      createdAtMs:              simulationTimeMs,
      expiresAtMs:              simulationTimeMs + lifetimeMs, // mutable (§9)
      start:                    { lat: startLat, lng: startLng },
      end:                      { lat: vessel.lat, lng: vessel.lng },
      headingDeg:               vessel.trueHeading  || 0,
      speedKts:                 vessel.speedKts     || 0,
      intensityRaw:             intensityRaw,
      widthMeters:              widthMeters,
      turbulenceRaw:            turbulenceRaw,
      populationTierAtEmission: emitter.populationTier,
      sourceContinuityConfidence: Number.isFinite(vessel.continuityConfidence)
                                    ? vessel.continuityConfidence : 1.0,
      parentEvicted:            false, // mutable (§9) — set by notifyVesselEvicted()
    };

    _ringInsert(segment);

    emitterState.lastEmissionMs = simulationTimeMs;
    emitterState.lastEndLat     = vessel.lat;
    emitterState.lastEndLng     = vessel.lng;

    _tel.emitted++;
    return segment;
  }

  // ── decayWakeSegments (§17) ───────────────────────────────────────────────
  // Sweeps the ring; clears segments whose expiresAtMs has passed.
  // expiresAtMs may have been compressed by notifyVesselEvicted() (§9, §10).

  function decayWakeSegments(simulationTimeMs) {
    var decayedCount  = 0;
    var budgetPressure = _ringActive >= Math.floor(WAKE_MAX_SEGMENTS_GLOBAL * 0.85);

    for (var i = 0; i < WAKE_MAX_SEGMENTS_GLOBAL; i++) {
      var seg = _ring[i];
      if (seg === null) continue;
      if (simulationTimeMs >= seg.expiresAtMs) {
        _clearSlot(i);
        decayedCount++;
      }
    }

    _tel.decayed += decayedCount;

    return {
      decayedCount:         decayedCount,
      culledCount:          0,
      remainingSegments:    _ringActive,
      budgetPressureActive: budgetPressure,
    };
  }

  // ── notifyVesselEvicted (§10, §17) ───────────────────────────────────────
  // §9 authorizes direct mutation of parentEvicted and expiresAtMs.
  // §10: compress remaining lifetime by WAKE_EVICTION_DECAY_MULTIPLIER (4×).
  // This preserves short-lived atmospheric residue without extending lifetime.

  function notifyVesselEvicted(vesselId, simulationTimeMs) {
    var count = 0;
    for (var i = 0; i < WAKE_MAX_SEGMENTS_GLOBAL; i++) {
      var seg = _ring[i];
      if (seg === null || seg.vesselId !== vesselId) continue;
      if (seg.parentEvicted) continue; // already compressed

      // §9: direct mutation permitted for parentEvicted and expiresAtMs
      var remaining = Math.max(0, seg.expiresAtMs - simulationTimeMs);
      seg.expiresAtMs   = simulationTimeMs + Math.ceil(remaining / WAKE_EVICTION_DECAY_MULTIPLIER);
      seg.parentEvicted = true;
      count++;
    }

    delete _vesselEmitters[vesselId];
    _tel.parentEvictions++;

    if (count > 0) {
      console.log('[WakeAuthority] vessel evicted:', vesselId,
        '| compressed', count, 'segments (4× decay — §10 direct mutation)');
    }
  }

  // ── notifyAISSignalGap (§11, §17) ────────────────────────────────────────
  // Breaks position continuity. Next emission after recovery is a seed segment.
  // No wake bridges fabricated across AIS gaps.

  function notifyAISSignalGap(vesselId) {
    var e = _vesselEmitters[vesselId];
    if (!e) return;
    e.lastEndLat = null;
    e.lastEndLng = null;
  }

  // ── Query functions ───────────────────────────────────────────────────────

  function getAllActiveSegments() {
    var out = [];
    for (var i = 0; i < WAKE_MAX_SEGMENTS_GLOBAL; i++) {
      if (_ring[i] !== null) out.push(_ring[i]);
    }
    return out;
  }

  function getWakeSegmentsForVessel(vesselId) {
    var out = [];
    for (var i = 0; i < WAKE_MAX_SEGMENTS_GLOBAL; i++) {
      var seg = _ring[i];
      if (seg !== null && seg.vesselId === vesselId) out.push(seg);
    }
    return out;
  }

  function getActiveSegmentCount()          { return _ringActive; }
  function getVesselSegmentCount(vesselId)  { return _vesselCounts[vesselId] || 0; }
  function getZoneSegmentCount(zoneId)      { return _zoneCounts[zoneId]     || 0; }

  // ── Debug snapshot ────────────────────────────────────────────────────────

  function getDebugSnapshot() {
    var topVessels = Object.keys(_vesselCounts)
      .sort(function (a, b) { return (_vesselCounts[b] || 0) - (_vesselCounts[a] || 0); })
      .slice(0, 10)
      .map(function (id) { return { vesselId: id, count: _vesselCounts[id] }; });

    return {
      version:          VERSION,
      activeSegments:   _ringActive,
      syntheticSegments: _globalSyntheticCount,
      budgets: {
        globalMax:      WAKE_MAX_SEGMENTS_GLOBAL,
        syntheticMax:   WAKE_MAX_SYNTHETIC_SEGMENTS_GLOBAL,
        perVesselMax:   WAKE_MAX_SEGMENTS_PER_VESSEL,
        perZoneMax:     WAKE_MAX_SEGMENTS_PER_ZONE,
        globalPressure: _ringActive / WAKE_MAX_SEGMENTS_GLOBAL,
      },
      telemetry:  Object.assign({}, _tel),
      topVessels: topVessels,
      zoneCounts: Object.assign({}, _zoneCounts),
    };
  }

  // ── Exports ───────────────────────────────────────────────────────────────

  SBE.WakeAuthority = {
    resolveWakeEligibility,
    emitWakeSegment,
    decayWakeSegments,
    notifyVesselEvicted,
    notifyAISSignalGap,

    getAllActiveSegments,
    getWakeSegmentsForVessel,
    getActiveSegmentCount,
    getVesselSegmentCount,
    getZoneSegmentCount,

    getDebugSnapshot,

    CONSTANTS: {
      WAKE_MAX_SEGMENTS_GLOBAL:               WAKE_MAX_SEGMENTS_GLOBAL,
      WAKE_MAX_SYNTHETIC_SEGMENTS_GLOBAL:     WAKE_MAX_SYNTHETIC_SEGMENTS_GLOBAL,
      WAKE_MAX_SEGMENTS_PER_VESSEL:           WAKE_MAX_SEGMENTS_PER_VESSEL,
      WAKE_MAX_SEGMENTS_PER_ZONE:             WAKE_MAX_SEGMENTS_PER_ZONE,
      WAKE_EMIT_INTERVAL_HERO_MS:             WAKE_EMIT_INTERVAL_HERO_MS,
      WAKE_EMIT_INTERVAL_MID_MS:              WAKE_EMIT_INTERVAL_MID_MS,
      WAKE_EMIT_INTERVAL_BACKGROUND_MS:       WAKE_EMIT_INTERVAL_BACKGROUND_MS,
      WAKE_MIN_SEGMENT_DISTANCE_M:            WAKE_MIN_SEGMENT_DISTANCE_M,
      WAKE_MAX_LIFETIME_MS:                   WAKE_MAX_LIFETIME_MS,
      SYNTHETIC_WAKE_MAX_LIFETIME_MULTIPLIER: SYNTHETIC_WAKE_MAX_LIFETIME_MULTIPLIER,
      WAKE_EVICTION_DECAY_MULTIPLIER:         WAKE_EVICTION_DECAY_MULTIPLIER,
    },

    PROVENANCE: {
      AIS_VESSEL:        'AIS_VESSEL',
      SYNTHETIC_ECOLOGY: 'SYNTHETIC_ECOLOGY',
    },

    WAKE_CLASS: {
      NONE:     'NONE',
      MINIMAL:  'MINIMAL',
      STANDARD: 'STANDARD',
      HEAVY:    'HEAVY',
    },

    VERSION: VERSION,
  };

  console.log('[WakeAuthority v' + VERSION + '] initialized —',
    'ring:', WAKE_MAX_SEGMENTS_GLOBAL, 'slots |',
    '§7 taxonomy bridge | §9 direct mutation | §4 provenance supremacy');

})(window);
