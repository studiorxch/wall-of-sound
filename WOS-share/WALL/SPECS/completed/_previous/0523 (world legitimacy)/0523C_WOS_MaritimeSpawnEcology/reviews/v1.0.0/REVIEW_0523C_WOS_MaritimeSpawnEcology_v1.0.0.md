# Architectural Review: 0523C_WOS_MaritimeSpawnEcology_v1.0.0

**Review Type:** Ecology Infrastructure — Constitutional Compliance and Implementation Readiness
**Prior Chain:** 0522O → 0522P → 0522Q → 0523A v1.1/1.2 → 0523C
**Stance:** Spawn ecology is the first spec in the chain that introduces synthetic vessel authority. That makes it the highest constitutional risk point so far.

---

## What This Spec Gets Right

The core principle — "spawn ecology describes probabilistic harbor presence, NOT simulation authority" — is correctly positioned. AIS authority override is explicit. Synthetic vessel identity rules are present. Ecological silence is acknowledged. The non-goals list is tight and correct.

For a v1.0.0 review draft, the constitutional posture is sound. The problems are in what the spec doesn't say.

---

## Critical Gaps

### 1. Synthetic Vessel Authority Is Underspecified — HIGH RISK

This is the most consequential gap in the spec. Synthetic ecology vessels are introduced as a concept with four rules:

- use explicit synthetic IDs
- never impersonate AIS identities
- never overwrite live AIS
- remain internally distinguishable

But the spec does not answer: **who owns synthetic vessel motion?**

The entire 0522O–0522Q chain exists to prevent renderer-controlled vessel truth. Synthetic vessels are a new class of maritime actor that has no AIS source. Without an explicit authority declaration, synthetic vessel motion will be owned by whoever implements them first — most likely the spawn ecology system itself, or the renderer.

**Required:**

> Synthetic ecology vessels are owned by MaritimeContinuityEngine under the same motion authority doctrine as AIS-sourced vessels. The spawn ecology system may request vessel instantiation with an initial position, class, and heading. It may not thereafter modify vessel position, heading, velocity, or lifecycle state. Synthetic vessel motion after spawn is governed exclusively by the continuity runtime.

Without this, synthetic vessels become a parallel simulation system living outside the constitutional authority hierarchy — exactly what the prior specs were designed to prevent.

---

### 2. Spawn Authority Is Not Assigned

The spec defines ecological zones and dominant vessel classes but never states who has authority to spawn vessels into those zones. Who calls spawn? When? Under what conditions?

Three interpretable ownership models exist:

1. **PopulationHierarchy spawns** — ecology is just a probability distribution that population hierarchy reads
2. **Spawn ecology spawns** — this system directly instantiates vessels into the continuity runtime
3. **An external orchestrator spawns** — using ecology as a lookup table

The spec says "spawn ecology remains subordinate to PopulationHierarchy" for density governance, but doesn't state whether ecology has any direct spawn authority at all. If it does, that authority must be bounded. If it doesn't, the spec should say so explicitly.

**Required:** State explicitly whether this system has spawn authority or is a passive distribution reference consumed by a system that does.

---

### 3. Synthetic Vessel Lifecycle Is Undefined

Synthetic vessels are introduced but their full lifecycle is absent:

- What lifecycle state do they enter at spawn? (Presumably SPAWNING, per 0522O)
- What causes a synthetic vessel to despawn?
- If a real AIS vessel appears at a position occupied by a synthetic vessel, what happens?
- Do synthetic vessels have a maximum lifetime?
- Can synthetic vessels enter DORMANT? If so, do they despawn or persist?

Without lifecycle rules, synthetic vessels will accumulate indefinitely — the ghost accumulation problem the entire 0522P dormancy section was designed to prevent, now reintroduced through a different vector.

**Required additions:**

> Synthetic vessels have a maximum lifetime defined by their vessel class's `maxCoastSeconds × coastWindowMultiplier`. At expiry, they transition to DORMANT and are evicted from the registry within one dormant tick cycle. If a live AIS vessel appears in the same harbor zone while a synthetic vessel is active, the synthetic vessel is immediately scheduled for eviction. It does not attempt to reconcile with the AIS vessel.

---

### 4. Ecological Zone Geography Is Declared But Not Structured

The three canonical zones name real geographic areas (Port Newark, Kill Van Kull, Staten Island Ferry, East River) but provide no structured representation. Downstream systems that need to query "is this AIS position in the Industrial Corridor?" have no data contract to work from.

This matters for the AIS authority override rule. If ecology is "expectation + interpretation only" and AIS truth overrides it, the system still needs to know which zone an AIS vessel is operating in to apply the right ecological context. Without a zone data structure, zone membership is unqueryable.

**Required:** Define at minimum a zone schema:

```ts
type EcologicalZone = {
  zoneId: string;
  dominantClasses: VesselClass[];
  secondaryClasses: VesselClass[];
  densityRange: [number, number]; // min/max active vessels
  silencePermitted: boolean;
};
```

Geographic boundary definition (polygon, bounding box, or named region reference) can defer to a companion spec, but the schema must be frozen here.

---

### 5. Density Governance Has No Numbers

"Spawn ecology remains subordinate to PopulationHierarchy" for density governance is correct constitutionally. But the spec provides no density parameters at all — not even ranges. The ecological zones name dominant classes but give no indication of how many vessels should be present, what the floor and ceiling are, or how density varies by time or conditions.

Without at least a density range per zone, the population hierarchy has nothing to enforce subordination against. "Subordinate to hierarchy" only has meaning if there are values the hierarchy can constrain.

**Required:** Each zone should define a `densityRange: [min, max]` as part of its schema. Exact values can be tuned, but the structural contract must exist here so PopulationHierarchy has a governing parameter to observe.

---

### 6. `FISHING` Zone Assignment Is Missing

The three zones cover Industrial Corridor, Ferry Transit Corridor, and Open Recreational Water. FISHING is absent from the dominant class lists of all three zones. Fishing vessels operate in harbor environments and must have a zone assignment — or the spec must explicitly state they operate zone-free, which would be a meaningful ecological declaration.

**Required:** Assign FISHING to a zone or declare it zone-agnostic with an explanation.

---

### 7. AIS Override Rule Has No Conflict Resolution Procedure

"AIS truth overrides ecology" is the correct doctrine. But the spec doesn't define what happens operationally when they conflict. Two scenarios need explicit handling:

**Scenario A:** An AIS vessel of class RECREATIONAL enters the Industrial Corridor. Ecology says this zone is dominant CARGO/TANKER. Does anything happen? Does the system flag it? Does it influence observability? Or is it simply unremarkable?

**Scenario B:** The spawn ecology system has instantiated a synthetic CARGO vessel in the Industrial Corridor. A live AIS RECREATIONAL vessel appears in the same zone. The AIS vessel gets priority — but does the synthetic CARGO vessel despawn immediately, or does it complete its natural lifecycle?

Neither scenario requires complex logic, but both need a defined answer to prevent ad hoc implementation.

**Required:** Add a conflict resolution section, even if brief:

> When live AIS data contradicts ecological zone expectations, AIS truth is accepted without adjustment. No runtime flag is raised. No ecological rebalancing occurs. Synthetic vessel lifecycle is not affected by the presence of out-of-zone AIS vessels.

---

## Minor Issues

### Validation Checklist Is Incomplete

The current checklist has 5 items. Based on the gaps above, it should include:

- [ ] Synthetic vessels are owned by MaritimeContinuityEngine after spawn
- [ ] Synthetic vessels have a defined maximum lifetime
- [ ] Synthetic vessels do not reconcile with AIS vessels
- [ ] Ecological zones have queryable geographic schemas
- [ ] Density ranges are defined per zone
- [ ] FISHING has a zone assignment or declared zone-agnostic status
- [ ] Spawn authority is assigned to exactly one system
- [ ] AIS conflict resolution is defined

---

### No Reference to 0523A

The taxonomy spec (0523A v1.1/1.2) defines vessel classes and their ecological roles via `populationEnvelope`. 0523C should reference 0523A as the source of class behavioral traits and should state that spawn ecology consumes taxonomy profiles, not raw class identifiers.

---

## Final Assessment

---

### Review Status

**NOT READY FOR FREEZE — One constitutional gap, five structural gaps.**

The spec is correctly oriented. The constitutional posture is right. But the introduction of synthetic vessels without motion authority assignment is a constitutional breach that must be resolved before any implementation proceeds. Synthetic vessels are the first non-AIS maritime actors in the system — their authority model must be as explicit as the AIS vessel model.

---

### Blocking Before Freeze

1. **Assign synthetic vessel motion authority to MaritimeContinuityEngine** — spawn ecology requests instantiation; continuity engine owns all subsequent motion.
2. **Define synthetic vessel lifecycle** — maximum lifetime, despawn conditions, AIS coexistence rules.
3. **Assign spawn authority** — state explicitly which system calls spawn and under what conditions.
4. **Define ecological zone schema** — typed structure with queryable geographic reference, dominant/secondary classes, density range.

---

### Required Before Freeze (Non-Blocking)

5. Add density ranges per zone — minimum required for PopulationHierarchy subordination to be meaningful.
6. Assign FISHING to a zone or declare zone-agnostic.
7. Add AIS conflict resolution procedure.
8. Add reference to 0523A as taxonomy source.
9. Expand validation checklist to cover synthetic vessel authority items.

---

### Highest Risk

**Synthetic vessel motion ownership.** If this is not resolved before implementation, synthetic vessels will be simulated by the spawn ecology system, the population hierarchy system, or the renderer — each of which is constitutionally forbidden from owning vessel motion. The entire 0522 spec chain exists to prevent exactly this. Synthetic vessels are a second front where the same battle must be won before the first shot is fired.
