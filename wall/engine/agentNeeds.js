// 0511_WOS_FoundationProtocols_HumanAquarium_v1.0.0
// Agent Needs — lifecycle causality system for WOS agents.
// Vanilla IIFE. Attaches to SBE.AgentNeeds.
// Load order: universalClock.js → environmentState.js → agentNeeds.js → …
//
// ═══════════════════════════════════════════════════════════════════════════
// DESIGN PRINCIPLE
//   Agents move because they NEED something. Not because of random wandering
//   or fake loops. Every movement decision traces back to a need.
//
//   Phase 1 Needs: energy, fuel, hunger, shelter (each 0–1, 1 = full, 0 = empty)
//
// OWNERSHIP
//   This module owns: need values, drain logic, destination selection.
//   It DOES NOT own: route traversal, actor position, rendering.
//
// PERSIST: needs values, role, homeBase, schedule
// NEVER PERSIST: _lastTickWorldSec (runtime only)
//
// ARCHITECTURE
//   All agents carry a `needs` object updated by tickNeeds().
//   The aquarium and episode system read needs for decisions.
//   Agents do NOT write to each other's needs.
// ═══════════════════════════════════════════════════════════════════════════

(function initAgentNeeds(global) {
  "use strict";

  var SBE = (global.SBE = global.SBE || {});

  // ── Helpers ───────────────────────────────────────────────────────────────
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  // ── Need thresholds ───────────────────────────────────────────────────────
  var THRESHOLD = {
    warning:  0.35,   // begins influencing destination preference
    critical: 0.15,   // urgent — highest priority, overrides schedule
  };

  // ── Drain rates (need units per world-second) ─────────────────────────────
  // All values normalized: 1.0 = needs completely full, 0 = empty.
  // A drain of 1/3600 depletes fully in 1 world-hour.
  var DRAIN_RATES = {
    commuter:   { energy: 1/14400, fuel: 1/7200,  hunger: 1/10800, shelter: 1/28800 },
    driver:     { energy: 1/18000, fuel: 1/5400,  hunger: 1/9000,  shelter: 1/21600 },
    worker:     { energy: 1/18000, fuel: 1/21600, hunger: 1/10800, shelter: 1/36000 },
    tourist:    { energy: 1/10800, fuel: 1/9000,  hunger: 1/7200,  shelter: 1/18000 },
    delivery:   { energy: 1/14400, fuel: 1/3600,  hunger: 1/9000,  shelter: 1/43200 },
    student:    { energy: 1/14400, fuel: 1/18000, hunger: 1/9000,  shelter: 1/36000 },
    night_shift:{ energy: 1/10800, fuel: 1/21600, hunger: 1/7200,  shelter: 1/21600 },
    traveler:   { energy: 1/9000,  fuel: 1/5400,  hunger: 1/7200,  shelter: 1/14400 },
    _default:   { energy: 1/14400, fuel: 1/10800, hunger: 1/9000,  shelter: 1/28800 },
  };

  // Fuel drain modifier from environment (bad weather = slight inefficiency)
  function _envFuelMultiplier(env) {
    if (!env) return 1;
    // Heavy rain, wind, snow increase fuel drain slightly
    return 1 + env.windStrength * 0.15 + (1 - env.visibility) * 0.05;
  }

  // ── Need → destination type mapping ──────────────────────────────────────
  var NEED_DESTINATION = {
    fuel:    "gas_station",
    hunger:  "food_stop",
    energy:  "rest_area",
    shelter: "motel",
  };

  // ── Needs factory ─────────────────────────────────────────────────────────
  function makeNeeds(opts) {
    opts = opts || {};
    return {
      energy:  typeof opts.energy  === "number" ? opts.energy  : 0.85,
      fuel:    typeof opts.fuel    === "number" ? opts.fuel    : 0.90,
      hunger:  typeof opts.hunger  === "number" ? opts.hunger  : 0.80,
      shelter: typeof opts.shelter === "number" ? opts.shelter : 1.00,
    };
  }

  var NEEDS_KEYS = ["energy", "fuel", "hunger", "shelter"];

  // ── Tick ──────────────────────────────────────────────────────────────────
  // worldDtSec: elapsed world-time in seconds (NOT real-time dt).
  // Use clock: worldDtSec = realDt * clock.worldTimeScale
  function tickNeeds(agent, worldDtSec, env) {
    if (!agent || !agent.needs) return;
    var role   = agent.role || "_default";
    var rates  = DRAIN_RATES[role] || DRAIN_RATES._default;
    var fuelM  = _envFuelMultiplier(env);

    agent.needs.energy  = clamp(agent.needs.energy  - rates.energy  * worldDtSec, 0, 1);
    agent.needs.fuel    = clamp(agent.needs.fuel    - rates.fuel    * worldDtSec * fuelM, 0, 1);
    agent.needs.hunger  = clamp(agent.needs.hunger  - rates.hunger  * worldDtSec, 0, 1);
    agent.needs.shelter = clamp(agent.needs.shelter - rates.shelter * worldDtSec, 0, 1);
  }

  // ── Restore need (arrival at service destination) ────────────────────────
  function restoreNeed(agent, needKey, amount) {
    if (!agent || !agent.needs) return;
    if (NEEDS_KEYS.indexOf(needKey) === -1) return;
    agent.needs[needKey] = clamp((agent.needs[needKey] || 0) + amount, 0, 1);
  }

  function restoreAll(agent) {
    if (!agent || !agent.needs) return;
    NEEDS_KEYS.forEach(function (k) { agent.needs[k] = 1; });
  }

  // ── Priority need ─────────────────────────────────────────────────────────
  // Returns the name of the need with the lowest value.
  // Returns null if all needs are above the warning threshold.
  function priorityNeed(agent) {
    if (!agent || !agent.needs) return null;
    var lowest = null;
    var lowestVal = THRESHOLD.warning;
    NEEDS_KEYS.forEach(function (k) {
      var v = agent.needs[k];
      if (v < lowestVal) { lowest = k; lowestVal = v; }
    });
    return lowest;  // null = no urgent need
  }

  // ── Is need critical? ─────────────────────────────────────────────────────
  function isNeedCritical(agent, needKey) {
    return agent && agent.needs && agent.needs[needKey] <= THRESHOLD.critical;
  }

  // ── Destination selection ─────────────────────────────────────────────────
  // Returns a destination type string based on priority need.
  // Callers should route to the nearest matching POI in the world.
  // Returns null if no urgent destination is required (agent continues route).
  function selectDestinationType(agent) {
    var need = priorityNeed(agent);
    if (!need) return null;
    return NEED_DESTINATION[need] || null;
  }

  // ── Status report (for HUD / inspector) ──────────────────────────────────
  function needsStatus(agent) {
    if (!agent || !agent.needs) return null;
    var n = agent.needs;
    return {
      energy:  { value: n.energy,  critical: n.energy  <= THRESHOLD.critical, warning: n.energy  <= THRESHOLD.warning },
      fuel:    { value: n.fuel,    critical: n.fuel    <= THRESHOLD.critical, warning: n.fuel    <= THRESHOLD.warning },
      hunger:  { value: n.hunger,  critical: n.hunger  <= THRESHOLD.critical, warning: n.hunger  <= THRESHOLD.warning },
      shelter: { value: n.shelter, critical: n.shelter <= THRESHOLD.critical, warning: n.shelter <= THRESHOLD.warning },
      priority: priorityNeed(agent),
      destinationType: selectDestinationType(agent),
    };
  }

  // ── Serialization ─────────────────────────────────────────────────────────
  function serializeNeeds(needs) {
    if (!needs) return null;
    return { energy: needs.energy, fuel: needs.fuel, hunger: needs.hunger, shelter: needs.shelter };
  }

  function rehydrateNeeds(saved) {
    return makeNeeds(saved || {});
  }

  // ── Convenience: attach fresh needs to an actor ───────────────────────────
  // Call on actor creation. Does not overwrite existing needs.
  function initActorNeeds(actor, opts) {
    if (!actor.needs) actor.needs = makeNeeds(opts);
  }

  // ── Public API ────────────────────────────────────────────────────────────
  SBE.AgentNeeds = {
    makeNeeds:             makeNeeds,
    tickNeeds:             tickNeeds,
    restoreNeed:           restoreNeed,
    restoreAll:            restoreAll,
    priorityNeed:          priorityNeed,
    isNeedCritical:        isNeedCritical,
    selectDestinationType: selectDestinationType,
    needsStatus:           needsStatus,
    serializeNeeds:        serializeNeeds,
    rehydrateNeeds:        rehydrateNeeds,
    initActorNeeds:        initActorNeeds,
    // Constants
    THRESHOLD:         THRESHOLD,
    NEED_DESTINATION:  NEED_DESTINATION,
    DRAIN_RATES:       DRAIN_RATES,
  };

  console.log("[WOS AgentNeeds] Loaded — Foundation Protocols v1.0.0");
})(window);
