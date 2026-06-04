// ── MaritimeSpawnEcology v1.0.0 ──────────────────────────────────────────────
// 0523C_WOS_MaritimeSpawnEcology_v1.2.1
// Status: active
// Classification: runtime-authority
//
// Purpose:
//   Generates weighted synthetic vessel spawn candidates for harbor density
//   and atmospheric background presence. SpawnEcology describes probable
//   harbor presence — it does NOT command vessel motion, override AIS truth,
//   or create runtime authority.
//
// Authority boundary (constitutional):
//   - SpawnEcology returns candidate SyntheticVesselRequests only.
//   - MaritimeContinuityEngine decides whether to instantiate.
//   - PopulationHierarchy owns global budget authority.
//   - After spawn, MaritimeContinuityEngine owns all synthetic vessel motion.
//   - SpawnEcology exposes NO method that accepts a syntheticId and mutates
//     position, heading, speed, lifecycle state, interpolation, or continuity.
//     The absence of these methods is the enforcement mechanism.
//
// Temporal determinism:
//   - All time reads use the injectable _simulationClock.
//   - Date.now() and performance.now() are forbidden in deterministic mode.
//   - Math.random() is forbidden; deterministic seeded LCG RNG is used instead.
//
// Synthetic ID namespace:
//   All synthetic IDs: synth::maritime::<zoneId>::<hex>
//   Never share keyspace with AIS/MMSI identifiers.
//
// Dependencies:
//   SBE.MaritimeEcologicalZones    (must be initialized first)
//   SBE.MaritimeTemporalEcology    (must be initialized first)
//   SBE.MaritimePopulationHierarchy (must be initialized first)
//
// Placement: wall/ecology/maritimeSpawnEcology.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  var VERSION = '1.0.0';

  // ── Constitutional constants (spec §SYNTHETIC VESSEL LIFECYCLE) ──────────────

  var SYNTHETIC_MIN_LIFETIME_MS     =   60000; //  1 minute
  var SYNTHETIC_DEFAULT_LIFETIME_MS =  900000; // 15 minutes
  var SYNTHETIC_MAX_LIFETIME_MS     = 1800000; // 30 minutes

  // ── Global budget constants (spec §GLOBAL SYNTHETIC BUDGETS) ────────────────

  var GLOBAL_MAX_SYNTHETIC_VESSELS    = 50;
  var GLOBAL_TARGET_SYNTHETIC_VESSELS = 24;
  var SYNTHETIC_SPAWN_INTERVAL_MIN_MS = 30000;  // 30 s — fastest per-zone cadence
  var SYNTHETIC_SPAWN_INTERVAL_MAX_MS = 120000; // 120 s — slowest per-zone cadence

  // ── EcologyScore weights (spec §ECOLOGY SCORE) ──────────────────────────────

  var W_ZONE_AFFINITY        = 0.35;
  var W_TIME_WINDOW_AFFINITY = 0.20;
  var W_WEATHER_AFFINITY     = 0.15;
  var W_CORRIDOR_AFFINITY    = 0.20;
  var W_POPULATION_PRESSURE  = 0.10;

  // ── Spawn reasons (spec §SyntheticVesselRequest) ─────────────────────────────

  var SPAWN_REASON_AIS_GAP      = 'AIS_COVERAGE_GAP';
  var SPAWN_REASON_REPLAY       = 'REPLAY_BACKGROUND';
  var SPAWN_REASON_HARBOR_MODE  = 'SYNTHETIC_HARBOR_MODE';
  var SPAWN_REASON_ATMOSPHERIC  = 'ATMOSPHERIC_BACKGROUND';

  // ── Despawn reasons (spec §SYNTHETIC VESSEL TELEMETRY) ───────────────────────

  var DESPAWN_EXPIRED         = 'EXPIRED';
  var DESPAWN_ZONE_EXIT       = 'ZONE_EXIT';
  var DESPAWN_BUDGET_PRESSURE = 'BUDGET_PRESSURE';
  var DESPAWN_AIS_RECOVERY    = 'AIS_RECOVERY';
  var DESPAWN_INVALIDATED     = 'INVALIDATED';
  var DESPAWN_MODE_DISABLED   = 'MODE_DISABLED';

  // ── Simulation clock ─────────────────────────────────────────────────────────
  // Default: performance.now() — suitable for non-deterministic mode.
  // In deterministic/replay mode, inject a clock via setSimulationClock().
  // After injection: Date.now() and performance.now() must NOT be used
  // by any code path that touches spawn timing or lifetime computation.

  var _simulationClock = {
    now: function () { return performance.now(); },
  };

  function setSimulationClock(clock) {
    if (!clock || typeof clock.now !== 'function') {
      console.error('[MaritimeSpawnEcology] setSimulationClock — clock must have a .now() method');
      return;
    }
    _simulationClock = clock;
    console.log('[MaritimeSpawnEcology] simulation clock injected');
  }

  // ── Deterministic seeded LCG RNG ─────────────────────────────────────────────
  // LCG parameters: Numerical Recipes (c=1013904223, a=1664525, m=2^32).
  // Math.imul provides 32-bit integer multiply without BigInt.
  // Seed is set once at init; callers must not re-seed mid-session in replay mode.

  var _rngState = 0x4A657465; // fixed default seed ("Jete" in hex)

  function setSeed(seed) {
    _rngState = (seed >>> 0) || 1; // guard against zero seed
  }

  function _rng() {
    _rngState = (Math.imul(1664525, _rngState) + 1013904223) >>> 0;
    return _rngState / 4294967296; // [0, 1)
  }

  // ── Synthetic ID counter ──────────────────────────────────────────────────────
  // Counter-based for determinism. Hex suffix is zero-padded to 6 chars.

  var _idCounter = 0;

  function _generateSyntheticId(zoneId) {
    _idCounter++;
    var hex = (_idCounter + 0x100000).toString(16).slice(-6);
    return 'synth::maritime::' + zoneId + '::' + hex;
  }

  // ── Runtime state ─────────────────────────────────────────────────────────────

  // Latest budget state per zone from updatePopulationBudgetState()
  // { zoneId → { activeCount, syntheticCount, maxCount, availableSyntheticSlots, pressure } }
  var _zoneBudgetState = {};

  // Last spawn time per zone (simulation clock ms)
  var _zoneLastSpawnMs = {};

  // Active synthetic vessel registry
  // { syntheticId → SyntheticVesselActor }
  var _syntheticVessels = {};
  var _globalSyntheticCount = 0;

  // SYNTHETIC_HARBOR_MODE flag — must never activate silently in live AIS mode
  var _syntheticHarborMode = false;

  // Enabled flag — master switch
  var _enabled = false;

  // Telemetry aggregator
  var _telemetry = {
    requestsGenerated: 0,
    requestsRejected:  0,
    spawnRejections:   0, // from MaritimeContinuityEngine
    despawnEvents:     0,
    overBudgetBlocks:  0,
  };

  // ── Lifecycle clamping (spec §SYNTHETIC VESSEL LIFECYCLE / Lifetime Clamp) ───

  function _clampLifetime(requestedMs) {
    var v = (requestedMs != null && Number.isFinite(requestedMs))
      ? requestedMs
      : SYNTHETIC_DEFAULT_LIFETIME_MS;
    return Math.max(SYNTHETIC_MIN_LIFETIME_MS, Math.min(SYNTHETIC_MAX_LIFETIME_MS, v));
  }

  // ── Lerp helper ──────────────────────────────────────────────────────────────

  function _lerp(a, b, t) {
    return a + (b - a) * Math.max(0, Math.min(1, t));
  }

  // ── Deterministic class selection ─────────────────────────────────────────────
  // Weighted selection from classDistribution using seeded RNG.
  // Distribution keys must sum to 1.0 (canonical zones are verified in spec).

  function _selectVesselClass(classDistribution) {
    var roll       = _rng();
    var cumulative = 0;
    var classes    = Object.keys(classDistribution);
    for (var i = 0; i < classes.length; i++) {
      cumulative += classDistribution[classes[i]];
      if (roll <= cumulative) return classes[i];
    }
    return classes[classes.length - 1]; // numerical guard: last bucket
  }

  // ── Deterministic spawn position ──────────────────────────────────────────────
  // Picks a random lat/lng within the zone's registered bounding box.
  // Returns null if bounds are not registered — request must be rejected.

  function _selectSpawnPosition(bounds) {
    if (!bounds) return null;
    var lat = bounds.minLat + _rng() * (bounds.maxLat - bounds.minLat);
    var lng = bounds.minLng + _rng() * (bounds.maxLng - bounds.minLng);
    return { lat: lat, lng: lng };
  }

  // ── EcologyScore ──────────────────────────────────────────────────────────────
  // spec §ECOLOGY SCORE:
  //   (zoneAffinity × 0.35) + (timeWindowAffinity × 0.20) + (weatherAffinity × 0.15)
  //   + (corridorAffinity × 0.20) + (populationPressure × 0.10)
  //
  // zoneAffinity: how much the zone wants more vessels relative to target density.
  //   = clamp(1 - activeCount/targetCount, 0, 1)
  //   If activeCount=0, target=18 → zoneAffinity=1.0 (strongly wants spawns).
  //   If activeCount=18, target=18 → zoneAffinity=0.0 (at capacity).
  //
  // populationPressure: from latest updatePopulationBudgetState().
  //   Higher pressure → lower ecology score (fewer spawns desired).
  //   We invert: populationPressureTerm = 1 - clamp(pressure, 0, 1).

  function _computeEcologyScore(zone, context, budgetState) {
    var mte = SBE.MaritimeTemporalEcology;
    if (!mte) return 0;

    var targetCount   = zone.densityRange.target || 1;
    var activeCount   = budgetState ? (budgetState.activeCount || 0) : 0;
    var zoneAffinity  = Math.max(0, Math.min(1, 1 - activeCount / targetCount));

    var timeAffinity  = mte.getTimeWindowAffinity(zone.zoneType, context.simulationTimeMs);
    var weatherBase   = mte.getWeatherAffinity(context.weatherState);
    // Zone-specific weather modulation via weatherSensitivity
    // sensitivity=0 → weather doesn't affect zone; sensitivity=1 → full weather effect
    var weatherAffinity = 1 - zone.weatherSensitivity * (1 - weatherBase);

    var corridorAffinity = zone.corridorAffinity;

    var pressure    = budgetState ? (budgetState.pressure || 0) : 0;
    var pressureTerm = 1 - Math.max(0, Math.min(1, pressure)); // invert: high pressure → low term

    return (
      zoneAffinity      * W_ZONE_AFFINITY        +
      timeAffinity      * W_TIME_WINDOW_AFFINITY  +
      weatherAffinity   * W_WEATHER_AFFINITY      +
      corridorAffinity  * W_CORRIDOR_AFFINITY     +
      pressureTerm      * W_POPULATION_PRESSURE
    );
  }

  // ── Spawn interval derivation ─────────────────────────────────────────────────
  // spec v1.2.1 §Deterministic Spawn Interval:
  //   spawnIntervalMs = lerp(MAX, MIN, ecologyScore)
  // High ecology score → shorter interval (faster spawning).
  // Low ecology score → longer interval (slower spawning).
  // Forbidden: Date.now(), performance.now(), Math.random()

  function _computeSpawnInterval(ecologyScore) {
    return _lerp(SYNTHETIC_SPAWN_INTERVAL_MAX_MS, SYNTHETIC_SPAWN_INTERVAL_MIN_MS, ecologyScore);
  }

  // ── Per-zone spawn gate ───────────────────────────────────────────────────────
  // SpawnEcology must not approve more than one spawn request per zone within
  // the computed spawn interval (spec §SPAWN INTERVAL ENFORCEMENT).

  function _canSpawnInZone(zoneId, ecologyScore, nowMs) {
    var lastMs   = _zoneLastSpawnMs[zoneId] || 0;
    var interval = _computeSpawnInterval(ecologyScore);
    return (nowMs - lastMs) >= interval;
  }

  // ── Global budget gate ────────────────────────────────────────────────────────

  function _globalBudgetAvailable() {
    return _globalSyntheticCount < GLOBAL_MAX_SYNTHETIC_VESSELS;
  }

  // ── Dynamic effective max ─────────────────────────────────────────────────────
  // spec §DYNAMIC SYNTHETIC BUDGET ADJUSTMENT:
  //   effectiveMax = baseMax × clamp(1 - liveAISCount/maxExpectedAIS, 0.25, 1.5)

  var MAX_EXPECTED_AIS = 120; // tunable

  function _effectiveGlobalMax(liveAISCount) {
    var factor = Math.max(0.25, Math.min(1.5, 1 - liveAISCount / MAX_EXPECTED_AIS));
    return Math.round(GLOBAL_MAX_SYNTHETIC_VESSELS * factor);
  }

  // ── Spawn mode guard ──────────────────────────────────────────────────────────
  // Synthetic vessels may only be requested when a valid mode is active.
  // SYNTHETIC_HARBOR_MODE must never activate silently in live AIS mode.

  function _spawnModeActive(context) {
    if (_syntheticHarborMode) return true;
    // AIS-gap mode: spawn when liveAISCountInZone is below threshold
    if (context && context.liveAISCountInZone <= 2) return true;
    return false;
  }

  function _resolveSpawnReason(context) {
    if (_syntheticHarborMode) return SPAWN_REASON_HARBOR_MODE;
    if (context && context.liveAISCountInZone <= 2) return SPAWN_REASON_AIS_GAP;
    return SPAWN_REASON_ATMOSPHERIC;
  }

  // ── Silence evaluation ────────────────────────────────────────────────────────
  // If ecologySilenceActive is set in context, and zone permits silence,
  // spawn is suppressed. Empty water is valid (spec §EMPTY WATER IS VALID).

  function _silenceActive(zone, context) {
    return zone.silencePermitted && context && context.ecologySilenceActive;
  }

  // ── Core: updatePopulationBudgetState ─────────────────────────────────────────
  // Called by PopulationHierarchy (downward flow) with current budget state.
  // SpawnEcology stores it passively — no reverse queries, no recursive chains.

  function updatePopulationBudgetState(zoneId, budgetState) {
    // Passive state update only — no synchronous reverse-query into PopulationHierarchy.
    _zoneBudgetState[zoneId] = {
      activeCount:            budgetState.activeCount            || 0,
      syntheticCount:         budgetState.syntheticCount         || 0,
      maxCount:               budgetState.maxCount               || GLOBAL_MAX_SYNTHETIC_VESSELS,
      availableSyntheticSlots: budgetState.availableSyntheticSlots || 0,
      pressure:               budgetState.pressure               || 0,
    };
  }

  // ── Core: getDensitySuggestion ────────────────────────────────────────────────
  // Returns a DensityProfile advisory for a zone at the current simulation time.

  function getDensitySuggestion(zoneId, simulationTimeMs) {
    var mez  = SBE.MaritimeEcologicalZones;
    var zone = mez && mez.getZoneById(zoneId);
    if (!zone) {
      return {
        zoneId:                 zoneId,
        suggestedCount:         0,
        syntheticSlotsSuggested: 0,
        ecologyScore:           0,
        silenceProbability:     1.0,
      };
    }

    var budgetState = _zoneBudgetState[zoneId] || null;
    var context = {
      simulationTimeMs:    simulationTimeMs,
      weatherState:        null,  // populated when 0523E available
      liveAISCountInZone:  budgetState ? (budgetState.activeCount - (budgetState.syntheticCount || 0)) : 0,
      syntheticCountInZone: budgetState ? (budgetState.syntheticCount || 0) : 0,
      ecologySilenceActive: false,
    };

    var score         = _computeEcologyScore(zone, context, budgetState);
    var suggested     = Math.round(zone.densityRange.target * score);
    var syntheticSlots = Math.min(zone.syntheticCeiling,
      Math.max(0, suggested - (context.liveAISCountInZone)));
    var silenceProbability = zone.silencePermitted ? Math.max(0, 1 - score) : 0;

    return {
      zoneId:                  zoneId,
      suggestedCount:          suggested,
      syntheticSlotsSuggested: syntheticSlots,
      ecologyScore:            Math.round(score * 1000) / 1000,
      silenceProbability:      Math.round(silenceProbability * 1000) / 1000,
    };
  }

  // ── Core: getSpawnCandidates ──────────────────────────────────────────────────
  // Returns up to `count` SyntheticVesselRequest objects for the given zone.
  // May return fewer if budget, silence, interval, or mode constraints apply.
  // Never returns more than one per zone per call (per-zone spawn interval gate).
  //
  // context: EcologyContext = {
  //   simulationTimeMs, weatherState, liveAISCountInZone,
  //   syntheticCountInZone, ecologySilenceActive
  // }

  function getSpawnCandidates(zoneId, count, context) {
    if (!_enabled) return [];

    var mez  = SBE.MaritimeEcologicalZones;
    var zone = mez && mez.getZoneById(zoneId);
    if (!zone) return [];

    // Silence gate
    if (_silenceActive(zone, context)) return [];

    // Spawn mode gate
    if (!_spawnModeActive(context)) return [];

    // Global budget gate
    if (!_globalBudgetAvailable()) {
      _telemetry.overBudgetBlocks++;
      return [];
    }

    var budgetState  = _zoneBudgetState[zoneId] || null;
    var nowMs        = _simulationClock.now();
    var ecologyScore = _computeEcologyScore(zone, context, budgetState);

    // Per-zone spawn interval gate
    if (!_canSpawnInZone(zoneId, ecologyScore, nowMs)) return [];

    // Zone synthetic ceiling gate
    var currentSynthetic = budgetState ? (budgetState.syntheticCount || 0) : 0;
    if (currentSynthetic >= zone.syntheticCeiling) {
      _telemetry.overBudgetBlocks++;
      return [];
    }

    // Budget available synthetic slots gate
    if (budgetState && budgetState.availableSyntheticSlots <= 0) {
      _telemetry.overBudgetBlocks++;
      return [];
    }

    // Geography gate — maxCoordinateEnvelope must derive from zone bounds
    var bounds = mez.getZoneBounds(zoneId);
    if (!bounds) {
      // spec v1.2.1: if bounds unavailable, reject request
      console.warn('[MaritimeSpawnEcology] getSpawnCandidates — no bounds for zone', zoneId, '— request rejected');
      _telemetry.requestsRejected++;
      return [];
    }

    // Generate up to `count` candidates — but per-zone interval means max 1 per call
    var maxThisCall = Math.min(count, 1); // one spawn per zone per interval
    var candidates  = [];
    var spawnReason = _resolveSpawnReason(context);

    for (var i = 0; i < maxThisCall; i++) {
      var vesselClass = _selectVesselClass(zone.classDistribution);
      var position    = _selectSpawnPosition(bounds);
      if (!position) { _telemetry.requestsRejected++; continue; }

      // Deterministic initial heading: seeded RNG [0, 360)
      var initialHeadingDeg = Math.floor(_rng() * 360);
      // Initial speed: fraction of expected cruise speed from taxonomy if available
      var initialSpeedKts   = _resolveInitialSpeed(vesselClass);

      var lifetimeMs = _clampLifetime(null);
      var syntheticId = _generateSyntheticId(zoneId);

      var request = {
        requestId:           syntheticId + '_req',
        zoneId:              zoneId,
        vesselClass:         vesselClass,
        syntheticId:         syntheticId,
        provenance:          'SYNTHETIC_ECOLOGY',
        initialPosition:     { lat: position.lat, lng: position.lng },
        initialHeadingDeg:   initialHeadingDeg,
        initialSpeedKts:     initialSpeedKts,
        maxCoordinateEnvelope: {
          minLat: bounds.minLat,
          maxLat: bounds.maxLat,
          minLng: bounds.minLng,
          maxLng: bounds.maxLng,
        },
        requestedLifetimeMs: lifetimeMs,
        spawnReason:         spawnReason,
        createdAtMs:         nowMs, // simulation clock — not wall-clock
      };

      candidates.push(request);
      _telemetry.requestsGenerated++;
    }

    if (candidates.length > 0) {
      // Advance spawn interval regardless of whether MaritimeContinuityEngine accepts.
      // Rejection handling: interval still advances (spec v1.2.1 §Rejection Handling).
      _zoneLastSpawnMs[zoneId] = nowMs;
    }

    return candidates;
  }

  // ── Initial speed helper ──────────────────────────────────────────────────────
  // Attempts to read expectedCruiseSpeedKts from taxonomy profile.
  // Uses a fraction of cruise speed for spawn so vessels don't appear at full speed.

  function _resolveInitialSpeed(vesselClass) {
    var mtp = SBE.MaritimeTaxonomyProfiles;
    if (!mtp) return 4; // safe fallback: 4 kts harbor idle
    var profile = mtp.getTaxonomyProfile(vesselClass);
    if (!profile) return 4;
    var F       = mtp.F;
    var cruise  = profile.vec[F.EXPECTED_CRUISE_KTS];
    // Spawn at 40–70% of cruise speed (seeded RNG for determinism)
    var fraction = 0.40 + _rng() * 0.30;
    return Math.max(1, Math.round(cruise * fraction * 10) / 10);
  }

  // ── Notify: vessel instantiated ───────────────────────────────────────────────
  // Called by MaritimeContinuityEngine when it accepts a spawn request.
  // SpawnEcology tracks the actor for global count and telemetry only.
  // SpawnEcology does NOT gain any motion authority from this call.

  function notifyVesselInstantiated(request, expiresAtMs) {
    var actor = {
      syntheticId: request.syntheticId,
      vesselClass: request.vesselClass,
      provenance:  'SYNTHETIC_ECOLOGY',
      spawnZoneId: request.zoneId,
      createdAtMs: request.createdAtMs,
      expiresAtMs: expiresAtMs || (request.createdAtMs + request.requestedLifetimeMs),
      ownedBy:     'MaritimeContinuityEngine', // provenance declaration — not a lock
    };
    _syntheticVessels[request.syntheticId] = actor;
    _globalSyntheticCount++;
    return actor;
  }

  // ── Notify: vessel rejected ───────────────────────────────────────────────────
  // Called by MaritimeContinuityEngine when it rejects a spawn request.
  // spec v1.2.1 §Rejection Handling:
  //   - no immediate retry
  //   - interval already advanced in getSpawnCandidates
  //   - rejection telemetry emitted
  //   - no recursive retry chains

  function notifyVesselRejected(request) {
    _telemetry.spawnRejections++;
    console.log('[MaritimeSpawnEcology] spawn rejected by continuity engine —',
      'zone:', request.zoneId, 'class:', request.vesselClass,
      'id:', request.syntheticId);
    // Interval already advanced — no retry logic.
  }

  // ── Notify: vessel despawned ──────────────────────────────────────────────────
  // Called by MaritimeContinuityEngine when a synthetic vessel exits.
  // Required telemetry fields from spec §SYNTHETIC VESSEL TELEMETRY.

  function notifyVesselDespawned(syntheticId, despawnReason, despawnTimeMs) {
    var actor = _syntheticVessels[syntheticId];
    if (!actor) return;

    var nowMs      = despawnTimeMs || _simulationClock.now();
    var lifetimeMs = nowMs - actor.createdAtMs;

    console.log('[MaritimeSpawnEcology] despawn —',
      'id:', syntheticId,
      '| zone:', actor.spawnZoneId,
      '| class:', actor.vesselClass,
      '| reason:', despawnReason,
      '| lifetime:', Math.round(lifetimeMs / 1000) + 's');

    _emitDespawnTelemetry(actor, despawnReason, nowMs, lifetimeMs);

    delete _syntheticVessels[syntheticId];
    if (_globalSyntheticCount > 0) _globalSyntheticCount--;
    _telemetry.despawnEvents++;
  }

  function _emitDespawnTelemetry(actor, reason, despawnTimeMs, lifetimeMs) {
    // Telemetry record — consumed by debug snapshot and future audit systems.
    // Must not promote synthetic vessel to AIS truth.
    var record = {
      syntheticId:  actor.syntheticId,
      zoneId:       actor.spawnZoneId,
      vesselClass:  actor.vesselClass,
      spawnTimeMs:  actor.createdAtMs,
      despawnTimeMs: despawnTimeMs,
      lifetimeMs:   lifetimeMs,
      maxLifetimeMs: (actor.expiresAtMs - actor.createdAtMs),
      despawnReason: reason,
      spawnReason:  actor.spawnReason || 'UNKNOWN',
      provenance:   'SYNTHETIC_ECOLOGY',
    };
    // In future: push to an append-only telemetry buffer for replay audit.
    // For now: the console.log in notifyVesselDespawned is the primary record.
    return record;
  }

  // ── SYNTHETIC_HARBOR_MODE ─────────────────────────────────────────────────────
  // Must never silently activate in live AIS mode.
  // Only activated via explicit API call, debug flag, or replay configuration.

  function enableSyntheticHarborMode(on) {
    _syntheticHarborMode = (on !== false);
    console.log('[MaritimeSpawnEcology] SYNTHETIC_HARBOR_MODE:', _syntheticHarborMode);
    if (_syntheticHarborMode) {
      console.warn('[MaritimeSpawnEcology] SYNTHETIC_HARBOR_MODE active — AIS-independent mode. Not for live use.');
    }
  }

  function isSyntheticHarborModeActive() {
    return _syntheticHarborMode;
  }

  // ── Enable / disable ──────────────────────────────────────────────────────────

  function enable(on) {
    _enabled = (on !== false);
    console.log('[MaritimeSpawnEcology] enabled:', _enabled);
    if (!_enabled) {
      // Notify all active synthetic vessels are to be evicted
      var ids = Object.keys(_syntheticVessels);
      for (var i = 0; i < ids.length; i++) {
        notifyVesselDespawned(ids[i], DESPAWN_MODE_DISABLED, _simulationClock.now());
      }
    }
  }

  function isEnabled() {
    return _enabled;
  }

  // ── Active synthetic vessel listing ──────────────────────────────────────────

  function getActiveSyntheticVessels() {
    return Object.keys(_syntheticVessels).map(function (id) {
      return _syntheticVessels[id];
    });
  }

  function getSyntheticCount() {
    return _globalSyntheticCount;
  }

  // ── Debug snapshot ────────────────────────────────────────────────────────────

  function getDebugSnapshot() {
    var zones       = SBE.MaritimeEcologicalZones ? SBE.MaritimeEcologicalZones.getAllZones() : [];
    var nowMs       = _simulationClock.now();
    var zoneDetails = zones.map(function (zone) {
      var budget = _zoneBudgetState[zone.zoneId];
      var bounds = SBE.MaritimeEcologicalZones && SBE.MaritimeEcologicalZones.getZoneBounds(zone.zoneId);
      var ctx = {
        simulationTimeMs:    nowMs,
        weatherState:        null,
        liveAISCountInZone:  budget ? Math.max(0, (budget.activeCount || 0) - (budget.syntheticCount || 0)) : 0,
        syntheticCountInZone: budget ? (budget.syntheticCount || 0) : 0,
        ecologySilenceActive: false,
      };
      var score    = _computeEcologyScore(zone, ctx, budget || null);
      var interval = _computeSpawnInterval(score);
      var lastMs   = _zoneLastSpawnMs[zone.zoneId] || 0;
      return {
        zoneId:          zone.zoneId,
        zoneType:        zone.zoneType,
        hasBounds:       !!bounds,
        ecologyScore:    Math.round(score * 1000) / 1000,
        spawnIntervalMs: Math.round(interval),
        nextSpawnInMs:   Math.max(0, Math.round(lastMs + interval - nowMs)),
        budgetState:     budget || null,
        syntheticCeiling: zone.syntheticCeiling,
        densityRange:    zone.densityRange,
      };
    });
    return {
      version:                VERSION,
      enabled:                _enabled,
      syntheticHarborMode:    _syntheticHarborMode,
      globalSyntheticCount:   _globalSyntheticCount,
      globalMaxSynthetic:     GLOBAL_MAX_SYNTHETIC_VESSELS,
      globalTargetSynthetic:  GLOBAL_TARGET_SYNTHETIC_VESSELS,
      telemetry:              Object.assign({}, _telemetry),
      zones:                  zoneDetails,
      activeVesselCount:      Object.keys(_syntheticVessels).length,
    };
  }

  // ── Exports ───────────────────────────────────────────────────────────────────

  SBE.MaritimeSpawnEcology = {
    // Initialization
    setSimulationClock,
    setSeed,
    enable,
    isEnabled,

    // Population interface (downward from PopulationHierarchy)
    updatePopulationBudgetState,

    // Core ecology interface
    getDensitySuggestion,
    getSpawnCandidates,

    // MaritimeContinuityEngine callbacks
    notifyVesselInstantiated,
    notifyVesselRejected,
    notifyVesselDespawned,

    // Mode control
    enableSyntheticHarborMode,
    isSyntheticHarborModeActive,

    // Inspection
    getActiveSyntheticVessels,
    getSyntheticCount,
    getDebugSnapshot,

    // Constants
    SPAWN_REASON: {
      AIS_GAP:     SPAWN_REASON_AIS_GAP,
      REPLAY:      SPAWN_REASON_REPLAY,
      HARBOR_MODE: SPAWN_REASON_HARBOR_MODE,
      ATMOSPHERIC: SPAWN_REASON_ATMOSPHERIC,
    },
    DESPAWN_REASON: {
      EXPIRED:         DESPAWN_EXPIRED,
      ZONE_EXIT:       DESPAWN_ZONE_EXIT,
      BUDGET_PRESSURE: DESPAWN_BUDGET_PRESSURE,
      AIS_RECOVERY:    DESPAWN_AIS_RECOVERY,
      INVALIDATED:     DESPAWN_INVALIDATED,
      MODE_DISABLED:   DESPAWN_MODE_DISABLED,
    },
    LIFETIME: {
      MIN_MS:     SYNTHETIC_MIN_LIFETIME_MS,
      DEFAULT_MS: SYNTHETIC_DEFAULT_LIFETIME_MS,
      MAX_MS:     SYNTHETIC_MAX_LIFETIME_MS,
    },
    BUDGET: {
      GLOBAL_MAX:    GLOBAL_MAX_SYNTHETIC_VESSELS,
      GLOBAL_TARGET: GLOBAL_TARGET_SYNTHETIC_VESSELS,
      INTERVAL_MIN:  SYNTHETIC_SPAWN_INTERVAL_MIN_MS,
      INTERVAL_MAX:  SYNTHETIC_SPAWN_INTERVAL_MAX_MS,
    },

    VERSION: VERSION,
  };

  console.log('[MaritimeSpawnEcology v' + VERSION + '] ready — disabled by default; call enable(true) to activate');

})(window);
