# 🚦 SPEC STAGE

Stage: [REVIEW]  
Freeze Decision: REVIEW  
Action: Architecture + governance pass before build.

# 0523C_WOS_MaritimeSpawnEcology_v1.0.0

## Purpose

Define how maritime vessel populations naturally distribute across the harbor without violating:

- AIS truth
- continuity doctrine
- runtime determinism
- taxonomy authority boundaries
- population hierarchy authority boundaries

This spec governs:

- where vessel classes tend to exist
- how density forms geographically
- how harbor corridors sustain realism
- how vessel ecology creates believable harbor rhythm

This spec does NOT govern:

- AIS motion
- vessel steering
- runtime pathfinding
- wake rendering
- camera behavior
- atmosphere orchestration
- gameplay
- vessel AI

# Core Principle

Spawn ecology describes probabilistic harbor presence, NOT simulation authority.

# Canonical Maritime Ecological Zones

## Industrial Corridor

- Port Newark
- Elizabeth
- Kill Van Kull

Dominant:

- CARGO
- TANKER
- INDUSTRIAL
- TUG
- SERVICE

## Ferry Transit Corridor

- Staten Island Ferry
- East River ferry lanes

Dominant:

- FERRY
- PASSENGER
- SERVICE

## Open Recreational Water

Dominant:

- RECREATIONAL
- FISHING
- SERVICE

# AIS Authority Boundary

AIS truth overrides ecology.

Ecology is expectation + interpretation only.

# Synthetic Ecology Vessel Rules

Synthetic ecology vessels must:

- use explicit synthetic IDs
- never impersonate AIS identities
- never overwrite live AIS
- remain internally distinguishable

# Density Governance

Spawn ecology remains subordinate to PopulationHierarchy.

# Ecological Silence

The harbor must permit empty water.

Silence is part of realism.

# Validation Checklist

- [ ] Ecology never overrides AIS truth
- [ ] Ecology never mutates lifecycle state
- [ ] Ecology remains probabilistic
- [ ] Empty-water states possible
- [ ] Synthetic vessels are explicitly marked

# Current Assessment

Stage: [REVIEW]  
Freeze Decision: REVIEW
💾 ARCHITECTURAL REVIEW: 0523C_WOS_MaritimeSpawnEcology_v1.0.0The review of specification 0523C_WOS_MaritimeSpawnEcology_v1.0.0 has been generated and saved. You can access and save the standalone review file directly via the raw layout markdown block attached below.This audit ensures that probabilistic spatial density rules and synthetic vessel injections cannot leak authority into your core deterministic AIS tracking engine, keeping the architecture aligned with your foundation laws.📦 Standalone Architectural Review Artifact (0523C_Review_v1.0.0.md)Markdown---
layout: review
title: "Architectural Review: WOS Maritime Spawn Ecology"
date: 2026-05-24
doc_id: "0523C_REV_WOS_MaritimeSpawnEcology_v1.0.0"
version: "1.0.0"
project: "Wall of Sound"
system: "WOS"
domain: "runtime-governance"
status: "review-complete"
priority: "high"

---

# 🔎 EXECUTIVE SUMMARY

An architectural and governance audit of `0523C_WOS_MaritimeSpawnEcology_v1.0.0` has been executed. This document establishes the spatial boundaries and classification rules for geographic presence throughout the harbor layout.

The core philosophy—defining ecology as **probabilistic expectation and interpretation infrastructure** rather than simulation logic—is highly accurate. It prevents downstream developers from misusing geographic "zones" to hijack, alter, or nudge real-world AIS telemetry tracks.

However, the introduction of **Synthetic Ecology Vessels** introduces severe runtime authority risks. Without an explicit, unyielding boundary between real telemetry tracks and simulated background entities, the system risks memory fragmentation, ID collisions, and visual state corruption.

---

## 1. 🚨 CRITICAL VULNERABILITY: SYNTHETIC ENTITY CORRUPTION

The specification notes under **"Synthetic Ecology Vessel Rules"** that synthetic vessels must use explicit synthetic IDs and never overwrite live AIS data. This rule requires aggressive engineering constraints to prevent runtime leakages.

### The ID Pollution and Collision Risk

If live AIS tracking targets are assigned randomly allocated or variable integer IDs (such as MMSI integers), and synthetic background entities use an overlapping allocation strategy, an incoming live packet could inadvertently match an active synthetic object slot. This would corrupt telemetry historical buffers.

- **The Hardening Rule:** The system must enforce a binary bitwise partition or explicit namespace isolation for all vessel IDs inside the `VesselRegistry`. Live AIS targets must preserve their literal 9-digit MMSI integers as keys. Synthetic vessels must operate under an explicit string namespace prefix (e.g., `synth::[UUID]`) or use negative integer space (`< 0`) to prevent any possible hashing or array-index collision within the tracking runtime.

### Memory Leakage via Long-Duration Uptime

Synthetic background vessels generated to pad out density in the **Industrial Corridor** or **Ferry Transit Corridor** can easily trigger allocation bloat if they lack strict termination boundaries. If a synthetic craft drifts outside a monitored viewport or zone but remains registered, performance metrics will quickly collapse.

- **The Hardening Rule:** Synthetic vessels must possess a strict, immutable **Spatial and Temporal Culling Window**. Unlike live AIS vessels which pass through the standardized `COASTING` ➔ `DORMANT` lifecycle based on telemetry age, synthetic craft must be instantly culled (deleted from memory, not cached) the microsecond they exit active viewport boundaries or exceed an allocated operational lifetime limit.

---

## 2. 🗺️ STRUCTURAL DEFICIENCIES & SPECIFICATION REFINEMENT

### Lack of Mathematical Mapping Schema

The definition of zones like **Industrial Corridor** and **Ferry Transit Corridor** is entirely descriptive. To be read efficiently by a $20\text{Hz}$ fixed-timestep runtime, spatial ecology must map cleanly to static query layers.

- **The Fix:** The specification must reference an authoritative structural file (e.g., `0523C_Zones.geojson` or a static grid matrix map). Zones must be evaluated via fast spatial polygon checks or normalized 2D lookups ($O(1)$ coordinate grid checks), ensuring that performance remains stable when matching active coordinates to zone metadata.

### The "Subordinate to PopulationHierarchy" Ambiguity

The specification states: _"Spawn ecology remains subordinate to PopulationHierarchy."_ This creates an undefined priority tree.

- **The Fix:** Clarify the relationship explicitly. The `PopulationHierarchy` layer acts as a strict **Global Budget Controller** (e.g., "Maximum allowed concurrent background vessels across the entire application = 250"). The `Spawn Ecology` layer acts purely as a local **Spatial Density Weighted Filter** determining _where_ those budgeted background items may safely populate. Ecology can never spawn an entity if the global hierarchy engine caps the class quota.

---

## 3. 🎯 FORMAL EVALUATION AGAINST DOCTRINES

### "2D Owns Truth, 2.5D Owns Presentation"

- **Verdict: PASS.** The ecology framework correctly presents zone metrics as passive lookup vectors. The renderer uses these vectors to handle details like local lighting modulations or ambient label behaviors without altering geographic reality.

### "Taxonomy Defines Identity, Not Importance"

- **Verdict: PASS.** The zone dominance structure maps cleanly to the baseline `VesselClass` literals defined in `0523A_v1.1.0`. It does not invent dynamic, ad-hoc urgency or camera-priority scores inside the mapping table.

---

## 4. 🛠️ MANDATORY IMPLEMENTATION CODE LAYER CONTRACTS

To lock down the rules of `v1.0.0`, the runtime initialization loop must implement these strict TypeScript interfaces:

```ts
/** Immutable structural definition for an ecological zone */
export interface MaritimeEcologicalZone {
  readonly zoneId: string;
  readonly polygonCoordinates: readonly [number, number][];
  readonly dominantClasses: readonly string[];
  readonly baseDensityWeight: number; // Normalized 0.0 -> 1.0
}

/** Complete isolation envelope for synthetic entities */
export interface SyntheticVesselActor {
  readonly syntheticId: string; // Must match /^synth::.+$/
  readonly vesselClass: string;
  readonly spawnZoneId: string;
  currentPositionX: number;
  currentPositionY: number;
  lifetimeMs: number;
}
5. 🏛️ ARCHITECTURAL SIGN-OFF & ROADMAPStatus: APPROVED WITH CONDITIONSThe document is approved for engineering development ONLY after the binary identifier separation rules (Namespace Isolation) and Flyweight budget models outlined in this review are written directly into the code execution layer.Readiness Evaluation MatrixComponent AreaStatusRisk LevelRemediating Action RequiredZone ClassificationFROZENMinimalStandardize via static polygon lookups.Synthetic GuardrailsCRITICALHighEnforce prefix/negative integer namespace isolation.Density GovernanceREADYLowBind strictly under Global Population caps.Silence HandlingFROZENMinimalBounded probabilistic thresholds allow empty spaces.PlaintextThe ecology maps expectation.
The telemetry commands execution.

***

### 🙋 Single Follow-Up Question for Conversation Guidance

With the spatial boundaries and synthetic guardrails for `0523C` reviewed, should we lock down the **global entity allocation logic and budget scaling matrices** in **`0523B_WOS_MaritimePopulationHierarchy_v1.0.0`** next to safely cap concurrent tracking pipelines?
```
