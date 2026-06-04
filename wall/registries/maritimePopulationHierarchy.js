// ── MaritimePopulationHierarchy v1.1.0 ───────────────────────────────────────
// 0523B_WOS_MaritimePopulationHierarchy_v1.0.0
// Status: active
// Classification: runtime-authority
//
// Patch v1.1.0:
//   - Added _classTierCap — class-based maximum tier reachable by scoring alone.
//     CARGO/TANKER/INDUSTRIAL/FISHING/SERVICE cap at BACKGROUND; UNKNOWN/RECREATIONAL
//     cap at GHOST. Manual and event-based promotion may still exceed cap.
//   - Cap applied after score + floor, before force override, so the precedence
//     chain is: score → floor (raise) → cap (lower) → force (override).
//   - Renamed SIM_PRIORITY_* constants to population update advisory names.
//     GHOST → UPDATE_MINIMAL (was DORMANT). PopulationHierarchy never mutates
//     AISRuntime lifecycle state; AISRuntime owns lifecycle truth.
//   - Exported SIM_PRIORITY block uses UPDATE_* keys; removed the DORMANT key
//     that previously implied AIS lifecycle semantics.
//
// Purpose:
//   Defines the four-tier population hierarchy (HERO → MID → BACKGROUND → GHOST)
//   that gives a harbor readable density without collapsing into visual chaos.
//   Each vessel receives exactly one population tier. Tier assignment drives:
//     - render priority and alpha budget
//     - population update advisory (read by AISRuntime as a scheduling hint only)
//     - label and observability weight
//     - per-zone density accounting
//
// Tier semantics:
//   HERO        5–20 vessels   cinematic anchors, full fidelity, always rendered
//   MID         50–150         readable activity layer, full physics
//   BACKGROUND  300–1000       ecological density, reduced update cadence
//   GHOST       1000+          atmospheric implication only — no labels, minimal GPU cost
//
// NOTE — AIS lifecycle boundary:
//   PopulationHierarchy assigns render/observability tiers only.
//   It does NOT set or imply AISRuntime vessel state (UNDERWAY/DORMANT/etc.).
//   AISRuntime owns lifecycle truth; population tier is advisory input, not authority.
//
// Dependencies:
//   SBE.MaritimeTaxonomyProfiles   (must be initialized before this module)
//
// Placement: wall/registries/maritimePopulationHierarchy.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  // ── Version ─────────────────────────────────────────────────────────────────

  var POPULATION_VERSION = '1.1.0';

  // ── Tier string constants ────────────────────────────────────────────────────
  // Canonical population tier names. No downstream system may introduce tiers
  // without a hierarchy governance revision.

  var TIER_HERO       = 'HERO';
  var TIER_MID        = 'MID';
  var TIER_BACKGROUND = 'BACKGROUND';
  var TIER_GHOST      = 'GHOST';

  // ── Tier numeric indices ─────────────────────────────────────────────────────
  // Lower index = higher priority. Used for fast comparisons in hot paths —
  // avoid string comparison in tick loops.
  //   0 = HERO (highest)
  //   1 = MID
  //   2 = BACKGROUND
  //   3 = GHOST (lowest)

  var TIER_IDX_HERO       = 0;
  var TIER_IDX_MID        = 1;
  var TIER_IDX_BACKGROUND = 2;
  var TIER_IDX_GHOST      = 3;

  var _tierIndexMap = {
    HERO:       TIER_IDX_HERO,
    MID:        TIER_IDX_MID,
    BACKGROUND: TIER_IDX_BACKGROUND,
    GHOST:      TIER_IDX_GHOST,
  };

  // ── Zone budget constants ────────────────────────────────────────────────────
  // Soft ceiling per tier per zone. Soft means the system logs when exceeded
  // but does not forcibly evict — eviction is the responsibility of spawn ecology
  // (0523C). Budgets are per named zone; global defaults apply to unnamed zones.

  var ZONE_BUDGET_HERO_DEFAULT       =  20;
  var ZONE_BUDGET_MID_DEFAULT        = 150;
  var ZONE_BUDGET_BACKGROUND_DEFAULT = 1000;
  var ZONE_BUDGET_GHOST_DEFAULT      = 2000; // no practical ceiling — atmospheric

  // ── Population update advisory names ─────────────────────────────────────────
  // Maps population tier → update frequency advisory string.
  // These strings are hints consumed by AISRuntime's scheduling heuristics.
  // They describe observability cadence from the population layer's perspective.
  //
  // CRITICAL: These are advisory only. PopulationHierarchy does NOT mutate
  // AISRuntime vessel lifecycle state (UNDERWAY, COAST, DORMANT, etc.).
  // AISRuntime owns lifecycle truth; population tier is an input hint, not authority.
  //
  // UPDATE_FULL     — full-cadence observability; vessel is a cinematic anchor
  // UPDATE_STANDARD — normal observability; vessel is readable activity
  // UPDATE_REDUCED  — lower-cadence advisory; vessel is ecological background
  // UPDATE_MINIMAL  — minimal observability advisory; vessel is atmospheric presence
  //                   (NOT the same as AIS DORMANT — vessel may still be underway)

  var UPDATE_ADVISORY_FULL     = 'UPDATE_FULL';
  var UPDATE_ADVISORY_STANDARD = 'UPDATE_STANDARD';
  var UPDATE_ADVISORY_REDUCED  = 'UPDATE_REDUCED';
  var UPDATE_ADVISORY_MINIMAL  = 'UPDATE_MINIMAL';

  var _updateAdvisoryMap = {
    HERO:       UPDATE_ADVISORY_FULL,
    MID:        UPDATE_ADVISORY_STANDARD,
    BACKGROUND: UPDATE_ADVISORY_REDUCED,
    GHOST:      UPDATE_ADVISORY_MINIMAL,
  };

  // ── Render fidelity descriptors ──────────────────────────────────────────────
  // Advisory to MarineRenderer. Renderer may use these to gate hull detail,
  // label rendering, wake system participation, atmospheric clipping, etc.

  var RENDER_FIDELITY_FULL     = 'FULL';     // HERO — all render features
  var RENDER_FIDELITY_STANDARD = 'STANDARD'; // MID  — full hull, no extras
  var RENDER_FIDELITY_REDUCED  = 'REDUCED';  // BACKGROUND — simplified hull
  var RENDER_FIDELITY_GHOST    = 'GHOST';    // GHOST — dot/alpha only

  var _renderFidelityMap = {
    HERO:       RENDER_FIDELITY_FULL,
    MID:        RENDER_FIDELITY_STANDARD,
    BACKGROUND: RENDER_FIDELITY_REDUCED,
    GHOST:      RENDER_FIDELITY_GHOST,
  };

  // ── Alpha budget per tier ────────────────────────────────────────────────────
  // Base render alpha. Actual alpha may be further modified by atmospheric
  // readability (0523E) and continuity confidence.

  var ALPHA_BUDGET_HERO       = 1.00;
  var ALPHA_BUDGET_MID        = 0.90;
  var ALPHA_BUDGET_BACKGROUND = 0.65;
  var ALPHA_BUDGET_GHOST      = 0.20;

  var _alphaBudgetMap = {
    HERO:       ALPHA_BUDGET_HERO,
    MID:        ALPHA_BUDGET_MID,
    BACKGROUND: ALPHA_BUDGET_BACKGROUND,
    GHOST:      ALPHA_BUDGET_GHOST,
  };

  // ── Label authority per tier ─────────────────────────────────────────────────
  // Whether tier permits label/tooltip rendering. GHOST vessels never label.

  var _labelAuthorityMap = {
    HERO:       true,
    MID:        true,
    BACKGROUND: false,
    GHOST:      false,
  };

  // ── Scoring weights for tier classification ─────────────────────────────────
  // Tier assignment derives from a composite score built from taxonomy profile
  // scalar fields. Weights are tuned so:
  //   - High-projection / high-label-priority vessels naturally score HERO band
  //   - Service/transit vessels score MID band
  //   - Fishing/recreational/industrial background score BACKGROUND band
  //   - Unknown / low-confidence remain GHOST until promoted
  //
  // Score band is then adjusted by floor and cap constraints before commit.

  var SCORE_WEIGHT_PROJECTION_WEIGHT    = 0.35;
  var SCORE_WEIGHT_LABEL_PRIORITY       = 0.30;
  var SCORE_WEIGHT_DENSITY_CONTRIBUTION = 0.20;
  var SCORE_WEIGHT_HARBOR_ZONE_AFFINITY = 0.15;

  // Score thresholds — raw scores are in [0.0, 1.0]
  var SCORE_THRESHOLD_HERO       = 0.70;  // score >= 0.70 → HERO band
  var SCORE_THRESHOLD_MID        = 0.42;  // score >= 0.42 → MID band
  var SCORE_THRESHOLD_BACKGROUND = 0.18;  // score >= 0.18 → BACKGROUND band
  // score < 0.18 → GHOST band

  // ── Vessel class tier floors ─────────────────────────────────────────────────
  // Hard minimum tier by vessel class. A vessel may score into a higher priority
  // tier but never drop below its floor through scoring alone.
  // Floor = minimum tier index (lower idx = higher priority).
  //
  // Example: MILITARY floor is TIER_IDX_HERO (0) — a MILITARY vessel always
  // reaches at least HERO regardless of a low score.

  var _classTierFloor = {
    MILITARY:     TIER_IDX_HERO,       // authority vessels always cinematic
    FERRY:        TIER_IDX_MID,        // route rhythm is readable
    PASSENGER:    TIER_IDX_MID,        // human cargo — observable
    TUG:          TIER_IDX_MID,        // harbor labor — visible
    CARGO:        TIER_IDX_BACKGROUND, // industrial density — background minimum
    TANKER:       TIER_IDX_BACKGROUND,
    INDUSTRIAL:   TIER_IDX_BACKGROUND,
    FISHING:      TIER_IDX_BACKGROUND,
    SERVICE:      TIER_IDX_BACKGROUND,
    RECREATIONAL: TIER_IDX_GHOST,      // ambient presence minimum
    UNKNOWN:      TIER_IDX_GHOST,      // unresolved identity — ghost minimum
  };

  // ── Vessel class tier caps ───────────────────────────────────────────────────
  // Hard maximum tier reachable by score + floor alone.
  // A vessel cannot auto-promote above its cap through scoring.
  // Manual promotion (promoteVessel) and event promotions may still exceed the cap.
  // Cap = maximum tier index via auto-classification (higher idx = lower priority).
  //
  // Precedence chain:  score → floor (raise if too low) → cap (lower if too high)
  //                    → force override (from options.force or promoteVessel)
  //
  // Classes without a cap entry have no ceiling from scoring (uncapped).
  // MILITARY/FERRY/PASSENGER/TUG are intentionally uncapped — their floors
  // already anchor them correctly.
  //
  // UNKNOWN cap at GHOST: unresolved identity should never auto-reach HERO or MID.
  // CARGO/TANKER: industrial bulk traffic should not auto-reach HERO from score.
  // INDUSTRIAL/FISHING/SERVICE: background ecology — cap at BACKGROUND.
  // RECREATIONAL: atmospheric ambient — cap at GHOST; explicit promotion only.

  var _classTierCap = {
    CARGO:        TIER_IDX_BACKGROUND, // cap: cannot auto-score above BACKGROUND
    TANKER:       TIER_IDX_BACKGROUND,
    INDUSTRIAL:   TIER_IDX_BACKGROUND,
    FISHING:      TIER_IDX_BACKGROUND,
    SERVICE:      TIER_IDX_BACKGROUND,
    RECREATIONAL: TIER_IDX_GHOST,      // cap: atmospheric only unless promoted
    UNKNOWN:      TIER_IDX_GHOST,      // cap: ghost until identity resolved + promoted
  };

  // ── Promotion rules ──────────────────────────────────────────────────────────
  // Vessels may be temporarily promoted above their base tier (and above their cap)
  // by external events or manual override.
  // Valid promotion reasons (advisory strings — no runtime logic depends on text):
  var PROMOTION_REASON_MANUAL    = 'MANUAL_PROMOTION';    // _wos console override
  var PROMOTION_REASON_CAMERA    = 'CAMERA_INTEREST';     // observability targeting
  var PROMOTION_REASON_CROSSING  = 'TRAJECTORY_CROSSING'; // two vessels converging
  var PROMOTION_REASON_ARRIVAL   = 'HARBOR_ARRIVAL';      // entering scene
  var PROMOTION_REASON_DEPARTURE = 'HARBOR_DEPARTURE';    // leaving scene

  // Promotion duration — how long a manual or event-based promotion lasts (ms).
  // After expiry the tier reverts to its base classification.
  var PROMOTION_TTL_MS = 30000; // 30 seconds

  // ── Zone budget registry ─────────────────────────────────────────────────────
  // Per-zone budget overrides. Keys are zone names; values are { HERO, MID, BACKGROUND, GHOST }.
  // Populated via registerZoneBudget().

  var _zoneBudgets = {};

  // ── Population state ─────────────────────────────────────────────────────────
  // Per-vessel tier records. Key: vesselId (MMSI string or internal id).
  // Value: { tier, tierIdx, baseTier, baseTierIdx, score, promotionExpiry,
  //          promotionReason, zone, assignedMs }

  var _vesselTierMap = {};

  // Per-zone counts of live vessels per tier.
  // Key: zoneName. Value: { HERO: n, MID: n, BACKGROUND: n, GHOST: n, total: n }

  var _zoneCounts = {};

  // ── Telemetry ────────────────────────────────────────────────────────────────

  var _telemetryFlushMs     = 5000; // flush population telemetry every 5 seconds
  var _lastTelemetryFlushMs = 0;
  var _telemetryAgg = { assignments: 0, promotions: 0, expirations: 0, overBudgetEvents: 0 };

  // ── Score computation ────────────────────────────────────────────────────────
  // Produces a composite [0,1] score from taxonomy profile vector fields.
  // Called once per vessel assignment or reclassification.

  function _computeScore(profile) {
    var F = SBE.MaritimeTaxonomyProfiles && SBE.MaritimeTaxonomyProfiles.F;
    if (!F || !profile || !profile.vec) return 0;
    var vec = profile.vec;
    return (
      vec[F.PROJECTION_WEIGHT]    * SCORE_WEIGHT_PROJECTION_WEIGHT    +
      vec[F.LABEL_PRIORITY]       * SCORE_WEIGHT_LABEL_PRIORITY       +
      vec[F.DENSITY_CONTRIBUTION] * SCORE_WEIGHT_DENSITY_CONTRIBUTION +
      vec[F.HARBOR_ZONE_AFFINITY] * SCORE_WEIGHT_HARBOR_ZONE_AFFINITY
    );
  }

  // ── Score → tier band mapping ────────────────────────────────────────────────

  function _scoreToBand(score) {
    if (score >= SCORE_THRESHOLD_HERO)       return TIER_IDX_HERO;
    if (score >= SCORE_THRESHOLD_MID)        return TIER_IDX_MID;
    if (score >= SCORE_THRESHOLD_BACKGROUND) return TIER_IDX_BACKGROUND;
    return TIER_IDX_GHOST;
  }

  function _tierIdxToString(idx) {
    switch (idx) {
      case TIER_IDX_HERO:       return TIER_HERO;
      case TIER_IDX_MID:        return TIER_MID;
      case TIER_IDX_BACKGROUND: return TIER_BACKGROUND;
      default:                  return TIER_GHOST;
    }
  }

  // ── Zone accounting ──────────────────────────────────────────────────────────

  function _zoneCountsFor(zoneName) {
    var z = zoneName || 'default';
    if (!_zoneCounts[z]) {
      _zoneCounts[z] = { HERO: 0, MID: 0, BACKGROUND: 0, GHOST: 0, total: 0 };
    }
    return _zoneCounts[z];
  }

  function _incrementZoneCount(zoneName, tier) {
    var zc = _zoneCountsFor(zoneName);
    if (zc[tier] !== undefined) zc[tier]++;
    zc.total++;
    _checkBudget(zoneName, tier, zc[tier]);
  }

  function _decrementZoneCount(zoneName, tier) {
    var zc = _zoneCountsFor(zoneName);
    if (zc[tier] !== undefined && zc[tier] > 0) zc[tier]--;
    if (zc.total > 0) zc.total--;
  }

  function _checkBudget(zoneName, tier, count) {
    var z      = zoneName || 'default';
    var budget = _zoneBudgets[z] || {};
    var cap    = budget[tier] != null ? budget[tier] : _defaultBudget(tier);
    if (count > cap) {
      _telemetryAgg.overBudgetEvents++;
      console.warn('[MaritimePopulationHierarchy] zone "' + z + '" tier ' + tier +
        ' over budget — count ' + count + ' / cap ' + cap);
    }
  }

  function _defaultBudget(tier) {
    switch (tier) {
      case TIER_HERO:       return ZONE_BUDGET_HERO_DEFAULT;
      case TIER_MID:        return ZONE_BUDGET_MID_DEFAULT;
      case TIER_BACKGROUND: return ZONE_BUDGET_BACKGROUND_DEFAULT;
      default:              return ZONE_BUDGET_GHOST_DEFAULT;
    }
  }

  // ── Core assignment ──────────────────────────────────────────────────────────
  // Assigns or refreshes a vessel's population tier.
  //
  // Precedence chain:
  //   1. score      — raw composite score from taxonomy profile
  //   2. floor      — class minimum tier (raise bandIdx if score would go lower)
  //   3. cap        — class maximum auto-tier (lower bandIdx if score+floor went higher)
  //   4. force      — options.force bypasses score/floor/cap, sets tier directly
  //
  // Manual promotion (promoteVessel) also bypasses the cap — it is an event
  // authority above automatic classification.
  //
  // vesselId    — MMSI string or internal identifier
  // vesselClass — canonical vessel class string (from MaritimeTaxonomyProfiles)
  // zoneName    — optional harbor zone name (default 'default')
  // options     — optional: { force: tierString } bypasses score+floor+cap

  function assignPopulationTier(vesselId, vesselClass, zoneName, options) {
    var mtp = SBE.MaritimeTaxonomyProfiles;
    if (!mtp) {
      console.warn('[MaritimePopulationHierarchy] MaritimeTaxonomyProfiles not available — defaulting GHOST');
      return _recordTier(vesselId, TIER_GHOST, TIER_IDX_GHOST, 0, zoneName, null);
    }

    var profile = mtp.getTaxonomyProfile(vesselClass);
    var score   = _computeScore(profile);

    // Step 1: score band
    var bandIdx = _scoreToBand(score);

    // Step 2: floor — raise bandIdx if score landed too low for this class
    // (lower index = higher priority, so floor constrains from below: bandIdx > floorIdx means too low)
    var floorIdx = _classTierFloor[vesselClass];
    if (floorIdx != null && bandIdx > floorIdx) {
      bandIdx = floorIdx;
    }

    // Step 3: cap — lower bandIdx if score+floor reached above the auto-classification ceiling
    // (higher index = lower priority, so cap constrains from above: bandIdx < capIdx means too high)
    var capIdx = _classTierCap[vesselClass];
    if (capIdx != null && bandIdx < capIdx) {
      bandIdx = capIdx;
    }

    // Step 4: force override — bypasses score/floor/cap (for _wos console and test tooling)
    if (options && options.force && _tierIndexMap[options.force] != null) {
      bandIdx = _tierIndexMap[options.force];
    }

    var tier = _tierIdxToString(bandIdx);
    return _recordTier(vesselId, tier, bandIdx, score, zoneName, null);
  }

  function _recordTier(vesselId, tier, tierIdx, score, zoneName, promotionReason) {
    var z   = zoneName || 'default';
    var now = performance.now();

    // Deregister from previous zone/tier if changing
    var prev = _vesselTierMap[vesselId];
    if (prev) {
      _decrementZoneCount(prev.zone, prev.tier);
    }

    var record = {
      tier:            tier,
      tierIdx:         tierIdx,
      baseTier:        tier,
      baseTierIdx:     tierIdx,
      score:           score,
      zone:            z,
      assignedMs:      now,
      promotionExpiry: 0,
      promotionReason: null,
    };

    _vesselTierMap[vesselId] = record;
    _incrementZoneCount(z, tier);
    _telemetryAgg.assignments++;

    return record;
  }

  // ── Promotion ─────────────────────────────────────────────────────────────────
  // Temporarily elevates a vessel to a higher-priority tier for PROMOTION_TTL_MS.
  // Promotion may exceed the vessel's class cap — it is an event authority above
  // automatic classification.
  // If targetTier is not higher priority than current tier, call is a no-op.

  function promoteVessel(vesselId, targetTier, reason) {
    var record = _vesselTierMap[vesselId];
    if (!record) {
      console.warn('[MaritimePopulationHierarchy] promoteVessel — vessel not registered:', vesselId);
      return;
    }

    var targetIdx = _tierIndexMap[targetTier];
    if (targetIdx == null) {
      console.warn('[MaritimePopulationHierarchy] promoteVessel — unknown tier:', targetTier);
      return;
    }

    if (targetIdx >= record.tierIdx) {
      return; // no promotion needed (same or lower priority)
    }

    // Update zone counts: remove from current tier, add to promoted tier
    _decrementZoneCount(record.zone, record.tier);
    record.tier            = targetTier;
    record.tierIdx         = targetIdx;
    record.promotionExpiry = performance.now() + PROMOTION_TTL_MS;
    record.promotionReason = reason || PROMOTION_REASON_MANUAL;
    _incrementZoneCount(record.zone, record.tier);
    _telemetryAgg.promotions++;
  }

  // ── Promotion expiry sweep ───────────────────────────────────────────────────
  // Should be called periodically (e.g. on each render frame or 1Hz).
  // Reverts promoted vessels whose TTL has elapsed back to their base tier.

  function sweepPromotionExpiry() {
    var now = performance.now();
    var ids = Object.keys(_vesselTierMap);
    for (var i = 0; i < ids.length; i++) {
      var id  = ids[i];
      var rec = _vesselTierMap[id];
      if (rec.promotionExpiry > 0 && now >= rec.promotionExpiry) {
        _decrementZoneCount(rec.zone, rec.tier);
        rec.tier            = rec.baseTier;
        rec.tierIdx         = rec.baseTierIdx;
        rec.promotionExpiry = 0;
        rec.promotionReason = null;
        _incrementZoneCount(rec.zone, rec.tier);
        _telemetryAgg.expirations++;
      }
    }
  }

  // ── Vessel removal ───────────────────────────────────────────────────────────

  function deregisterVessel(vesselId) {
    var rec = _vesselTierMap[vesselId];
    if (!rec) return;
    _decrementZoneCount(rec.zone, rec.tier);
    delete _vesselTierMap[vesselId];
  }

  // ── Tier lookup ──────────────────────────────────────────────────────────────

  function getVesselTier(vesselId) {
    return _vesselTierMap[vesselId] || null;
  }

  function getVesselTierString(vesselId) {
    var rec = _vesselTierMap[vesselId];
    return rec ? rec.tier : TIER_GHOST;
  }

  // Returns the population update advisory for a vessel.
  // Advisory strings: UPDATE_FULL / UPDATE_STANDARD / UPDATE_REDUCED / UPDATE_MINIMAL
  // These are hints for AISRuntime scheduling — they do NOT represent AIS lifecycle state.
  function getUpdateAdvisory(vesselId) {
    var rec = _vesselTierMap[vesselId];
    if (!rec) return UPDATE_ADVISORY_MINIMAL;
    return _updateAdvisoryMap[rec.tier] || UPDATE_ADVISORY_MINIMAL;
  }

  function getRenderFidelity(vesselId) {
    var rec = _vesselTierMap[vesselId];
    if (!rec) return RENDER_FIDELITY_GHOST;
    return _renderFidelityMap[rec.tier] || RENDER_FIDELITY_GHOST;
  }

  function getAlphaBudget(vesselId) {
    var rec = _vesselTierMap[vesselId];
    if (!rec) return ALPHA_BUDGET_GHOST;
    return _alphaBudgetMap[rec.tier] != null ? _alphaBudgetMap[rec.tier] : ALPHA_BUDGET_GHOST;
  }

  function getLabelAuthority(vesselId) {
    var rec = _vesselTierMap[vesselId];
    if (!rec) return false;
    return _labelAuthorityMap[rec.tier] || false;
  }

  // ── Zone budget registration ─────────────────────────────────────────────────
  // Spawn ecology (0523C) and other systems may register custom zone budgets.
  // budgets: { HERO: n, MID: n, BACKGROUND: n, GHOST: n }

  function registerZoneBudget(zoneName, budgets) {
    if (!zoneName || typeof zoneName !== 'string') {
      console.warn('[MaritimePopulationHierarchy] registerZoneBudget — invalid zone name');
      return;
    }
    _zoneBudgets[zoneName] = {
      HERO:       budgets.HERO       != null ? budgets.HERO       : ZONE_BUDGET_HERO_DEFAULT,
      MID:        budgets.MID        != null ? budgets.MID        : ZONE_BUDGET_MID_DEFAULT,
      BACKGROUND: budgets.BACKGROUND != null ? budgets.BACKGROUND : ZONE_BUDGET_BACKGROUND_DEFAULT,
      GHOST:      budgets.GHOST      != null ? budgets.GHOST      : ZONE_BUDGET_GHOST_DEFAULT,
    };
  }

  // ── Zone summary ─────────────────────────────────────────────────────────────

  function getZoneSummary(zoneName) {
    var z  = zoneName || 'default';
    var zc = _zoneCounts[z] || { HERO: 0, MID: 0, BACKGROUND: 0, GHOST: 0, total: 0 };
    var bz = _zoneBudgets[z] || {};
    return {
      zone:   z,
      counts: { HERO: zc.HERO, MID: zc.MID, BACKGROUND: zc.BACKGROUND, GHOST: zc.GHOST, total: zc.total },
      budgets: {
        HERO:       bz.HERO       != null ? bz.HERO       : ZONE_BUDGET_HERO_DEFAULT,
        MID:        bz.MID        != null ? bz.MID        : ZONE_BUDGET_MID_DEFAULT,
        BACKGROUND: bz.BACKGROUND != null ? bz.BACKGROUND : ZONE_BUDGET_BACKGROUND_DEFAULT,
        GHOST:      bz.GHOST      != null ? bz.GHOST      : ZONE_BUDGET_GHOST_DEFAULT,
      },
    };
  }

  function getAllZoneSummaries() {
    var zones    = {};
    var allZones = Object.keys(_zoneCounts);
    for (var i = 0; i < allZones.length; i++) {
      zones[allZones[i]] = getZoneSummary(allZones[i]);
    }
    return zones;
  }

  // ── Telemetry flush ──────────────────────────────────────────────────────────

  function flushTelemetry(force) {
    var now = performance.now();
    if (!force && (now - _lastTelemetryFlushMs) < _telemetryFlushMs) return;
    _lastTelemetryFlushMs = now;

    var total = Object.keys(_vesselTierMap).length;
    console.log(
      '[MaritimePopulationHierarchy] telemetry — vessels:', total,
      '| assignments:', _telemetryAgg.assignments,
      '| promotions:', _telemetryAgg.promotions,
      '| expirations:', _telemetryAgg.expirations,
      '| overBudget:', _telemetryAgg.overBudgetEvents
    );
    _telemetryAgg = { assignments: 0, promotions: 0, expirations: 0, overBudgetEvents: 0 };
  }

  // ── Debug snapshot ───────────────────────────────────────────────────────────

  function getDebugSnapshot() {
    var vesselCount   = Object.keys(_vesselTierMap).length;
    var tierBreakdown = { HERO: 0, MID: 0, BACKGROUND: 0, GHOST: 0 };
    var ids = Object.keys(_vesselTierMap);
    for (var i = 0; i < ids.length; i++) {
      var t = _vesselTierMap[ids[i]].tier;
      if (tierBreakdown[t] !== undefined) tierBreakdown[t]++;
    }
    return {
      version:       POPULATION_VERSION,
      vesselCount:   vesselCount,
      tierBreakdown: tierBreakdown,
      zoneSummaries: getAllZoneSummaries(),
      budgetDefaults: {
        HERO:       ZONE_BUDGET_HERO_DEFAULT,
        MID:        ZONE_BUDGET_MID_DEFAULT,
        BACKGROUND: ZONE_BUDGET_BACKGROUND_DEFAULT,
        GHOST:      ZONE_BUDGET_GHOST_DEFAULT,
      },
      scoreThresholds: {
        HERO:       SCORE_THRESHOLD_HERO,
        MID:        SCORE_THRESHOLD_MID,
        BACKGROUND: SCORE_THRESHOLD_BACKGROUND,
      },
    };
  }

  // ── Exports ──────────────────────────────────────────────────────────────────

  SBE.MaritimePopulationHierarchy = {
    // Core vessel lifecycle
    assignPopulationTier,
    deregisterVessel,
    sweepPromotionExpiry,

    // Promotion
    promoteVessel,

    // Tier lookup
    getVesselTier,
    getVesselTierString,
    getUpdateAdvisory,   // renamed from getSimPriority — advisory only, not AIS lifecycle
    getRenderFidelity,
    getAlphaBudget,
    getLabelAuthority,

    // Zone management
    registerZoneBudget,
    getZoneSummary,
    getAllZoneSummaries,

    // Telemetry & debug
    flushTelemetry,
    getDebugSnapshot,

    // Tier string constants
    TIER: {
      HERO:       TIER_HERO,
      MID:        TIER_MID,
      BACKGROUND: TIER_BACKGROUND,
      GHOST:      TIER_GHOST,
    },

    // Tier index constants (for fast hot-path comparisons)
    TIER_IDX: {
      HERO:       TIER_IDX_HERO,
      MID:        TIER_IDX_MID,
      BACKGROUND: TIER_IDX_BACKGROUND,
      GHOST:      TIER_IDX_GHOST,
    },

    // Render fidelity constants
    FIDELITY: {
      FULL:     RENDER_FIDELITY_FULL,
      STANDARD: RENDER_FIDELITY_STANDARD,
      REDUCED:  RENDER_FIDELITY_REDUCED,
      GHOST:    RENDER_FIDELITY_GHOST,
    },

    // Population update advisory constants.
    // Advisory only — PopulationHierarchy never mutates AIS lifecycle state.
    // AISRuntime consumes these as scheduling hints; it retains lifecycle authority.
    UPDATE_ADVISORY: {
      FULL:     UPDATE_ADVISORY_FULL,     // HERO tier
      STANDARD: UPDATE_ADVISORY_STANDARD, // MID tier
      REDUCED:  UPDATE_ADVISORY_REDUCED,  // BACKGROUND tier
      MINIMAL:  UPDATE_ADVISORY_MINIMAL,  // GHOST tier (NOT the same as AIS DORMANT)
    },

    // Promotion reasons
    PROMOTION_REASON: {
      MANUAL:    PROMOTION_REASON_MANUAL,
      CAMERA:    PROMOTION_REASON_CAMERA,
      CROSSING:  PROMOTION_REASON_CROSSING,
      ARRIVAL:   PROMOTION_REASON_ARRIVAL,
      DEPARTURE: PROMOTION_REASON_DEPARTURE,
    },

    // Budget defaults (readable by zone registration callers)
    BUDGET_DEFAULT: {
      HERO:       ZONE_BUDGET_HERO_DEFAULT,
      MID:        ZONE_BUDGET_MID_DEFAULT,
      BACKGROUND: ZONE_BUDGET_BACKGROUND_DEFAULT,
      GHOST:      ZONE_BUDGET_GHOST_DEFAULT,
    },

    // Score thresholds (exposed for debug tooling only)
    SCORE_THRESHOLD: {
      HERO:       SCORE_THRESHOLD_HERO,
      MID:        SCORE_THRESHOLD_MID,
      BACKGROUND: SCORE_THRESHOLD_BACKGROUND,
    },

    // Version
    VERSION: POPULATION_VERSION,
  };

  console.log('[MaritimePopulationHierarchy v' + POPULATION_VERSION + '] ready');

})(window);
