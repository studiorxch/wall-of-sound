WOS Maritime Spawn Ecology — Infrastructure Review
Review Date: 2026-05-24
Document: 0523C_WOS_MaritimeSpawnEcology_v1.0.0
Stage: REVIEW
Classification: Ecology Governance

Executive Summary
This specification defines probabilistic harbor presence for maritime vessel populations. It correctly subordinates ecology to AIS authority, prohibits ecology from mutating runtime state, and requires explicit synthetic vessel marking.

However, the specification is incomplete as an infrastructure spec. It provides principles and constraints but lacks:

concrete ecological zone definitions with coordinates/boundaries

probability distributions or density curves

spawn timing/cadence rules

interaction with PopulationHierarchy (referenced but not defined)

synthetic vessel lifecycle rules (spawn, persist, despawn)

ecological succession or rhythm rules

Verdict: ACCEPT as governance principles. REJECT as implementation infrastructure until v1.1.0 adds concrete ecological parameters.

Overall Assessment
Category Rating Notes
Authority Boundaries EXCELLENT AIS overrides ecology, no runtime mutation
Core Principle EXCELLENT "Probabilistic harbor presence, NOT simulation authority"
Ecological Zones PARTIAL Named zones, no boundaries/coordinates
Probability Specification MISSING No distributions, densities, or spawn rates
Synthetic Vessel Rules GOOD Explicit marking, no AIS impersonation
Interaction with PopulationHierarchy MISSING Referenced but dependency not defined
Empty Water Permitted EXCELLENT Silence as realism
Validation Checklist GOOD 5 items, needs expansion
Strengths (Preserve)

1. Core Principle: "Probabilistic harbor presence, NOT simulation authority"
   This correctly bounds ecology as a density suggestion system, not a simulation engine. Ecology does not steer vessels, override AIS, or mutate runtime state.

2. AIS Authority Boundary
   "AIS truth overrides ecology" is constitutionally correct. Synthetic vessels must never overwrite live AIS.

3. Explicit Synthetic Vessel Marking
   Synthetic vessels require explicit IDs and must remain distinguishable from AIS sources. Prevents debugging confusion and authority leakage.

4. Ecological Silence
   "The harbor must permit empty water" — this is important for realism. Not every moment needs maximum density.

5. Three Canonical Zones
   Industrial Corridor, Ferry Transit Corridor, Open Recreational Water provide a foundation. The spec correctly notes dominant classes per zone.

Critical Deficiencies (Blocking Implementation)
Deficiency 1: No Zone Boundaries — Cannot Implement
Problem: Zones are named ("Port Newark, Elizabeth, Kill Van Kull") but no geographic boundaries, coordinate ranges, or polygon definitions are provided.

Impact: Implementers cannot determine which zone a coordinate belongs to.

Required for v1.1.0:

js
// OPTION A: Bounding boxes
const INDUSTRIAL_CORRIDOR = {
type: "MultiPolygon",
coordinates: [[[-74.2, 40.7], [-74.1, 40.7], ...]]
}

// OPTION B: Named anchor points with radius
const INDUSTRIAL_ANCHORS = [
{ name: "Port Newark", lat: 40.68, lng: -74.12, radiusM: 3000 },
{ name: "Kill Van Kull", lat: 40.64, lng: -74.12, radiusM: 2000 }
]

// OPTION C: Reference to external geography spec (RECOMMENDED)
// "Zone boundaries defined in HarborGeographySpec (deferred)"
Recommendation: Defer exact coordinates to a separate geography spec. This spec should define zone types and zone selection rules, not hardcoded boundaries.

Deficiency 2: No Probability Distributions — Cannot Spawn
Problem: Spec says "dominant: CARGO, TANKER, INDUSTRIAL" but provides no probabilities. Does CARGO appear 80% of the time or 30%? Does FERRY ever appear in Industrial Corridor (5% of the time? 0%?)

Required for v1.1.0:

js
type ZonePopulationProfile = {
zoneId: string;
classDistribution: Map<VesselClass, number>; // probability weight
densityBaseline: number; // vessels per square km
densityVariance: number; // temporal/seasonal variation
}

const INDUSTRIAL_PROFILE = {
zoneId: "industrial_corridor",
classDistribution: {
CARGO: 0.35,
TANKER: 0.25,
INDUSTRIAL: 0.15,
TUG: 0.15,
SERVICE: 0.08,
UNKNOWN: 0.02
},
densityBaseline: 12, // vessels per 10km²
densityVariance: 0.4
}
Deficiency 3: No Spawn Timing/Cadence — When Do Vessels Appear?
Problem: Spec does not define:

How frequently new synthetic vessels spawn

Whether spawn rate varies by time of day

Whether spawn rate varies by zone

Minimum/maximum vessel counts per zone

Required for v1.1.0:

js
const SPAWN_RULES = {
globalMaxSyntheticVessels: 50,
zoneMaxVessels: {
industrial_corridor: 25,
ferry_transit: 15,
recreational: 20
},
spawnIntervalSeconds: [30, 120], // random uniform
despawnAfterSeconds: [300, 1800], // time before removal if not observed
timeOfDayMultipliers: {
// Optional: diurnal patterns
"06:00-09:00": 1.5, // morning peak
"12:00-14:00": 1.2,
"17:00-19:00": 1.5, // evening peak
"22:00-05:00": 0.3 // night lull
}
}
Deficiency 4: Synthetic Vessel Lifecycle Undefined
Problem: Rules for synthetic vessel lifecycle missing:

When do synthetic vessels despawn?

Do synthetic vessels persist across user sessions?

Can synthetic vessels transition to dormant?

Do synthetic vessels generate wakes?

Required for v1.1.0:

js
const SYNTHETIC*LIFECYCLE = `
Spawn: Created by ecology system with synthetic ID prefix ('syn*')

Tracking: Same lifecycle states as AIS vessels (SPAWNING, TRACKING, COASTING, DORMANT)

Despawn: Removed when ANY of:

- Despawn timer expires (default: 30 minutes without camera observation)
- Zone max vessel count exceeded (oldest removed first)
- AIS vessel with same MMSI appears (overrides synthetic)

Despawn behavior:

- Fade out over 2 seconds (renderer-only)
- No continuity jump
- Wake dissipates normally

Synthetic vessels DO NOT persist across sessions.
Synthetic vessels ARE NOT stored in telemetry as AIS truth.
`
Deficiency 5: No Interaction with PopulationHierarchy
Problem: Spec states "Spawn ecology remains subordinate to PopulationHierarchy" but PopulationHierarchy (0523B) has not been reviewed. No interface contract is defined.

Risk: Ecology and PopulationHierarchy will be implemented with incompatible assumptions.

Required for v1.1.0 (or 0523B):

js
// Interface contract between Ecology and PopulationHierarchy
interface EcologyPopulationInterface {
// PopulationHierarchy requests density suggestion
getDensitySuggestion(zoneId: string, timeMs: number): DensityProfile;

// Ecology provides spawnable vessel candidates
getSpawnCandidates(zoneId: string, count: number): VesselClass[];

// PopulationHierarchy notifies ecology of active vessel count
onVesselCountChanged(zoneId: string, activeCount: number, maxCount: number): void;
}
Deficiency 6: No Ecological Succession or Rhythm Rules
Problem: Ecology as defined is static. Real harbors have:

Tug activity increasing before cargo arrivals

Ferry rhythm (every 15-30 minutes)

Fishing vessels returning at evening

Night vs day class distribution differences

Impact: Harbor will feel static, not rhythmic.

Optional for v1.1.0, required for production:

js
const RHYTHM_RULES = {
// Ferry schedule (simplified)
FERRY: {
peakIntervalMinutes: 15,
offPeakIntervalMinutes: 30,
firstDeparture: "06:00",
lastDeparture: "22:00"
},

// Tug-Cargo correlation
TUG_CARGO_CORRELATION: 0.7, // tugs spawn near cargo spawns

// Diurnal class weights
diurnalWeights: {
RECREATIONAL: { day: 1.0, night: 0.1 },
FISHING: { day: 0.6, night: 1.0 } // night fishing
}
}
Optional Refinements (Non-Blocking)
Refinement 1: Ecological Zone Transitions
Vessels moving between zones should respect zone-appropriate behavior. A CARGO in recreational water should be rare.

js
// OPTIONAL
const ZONE_TRANSITION_RULES = {
industrial_to_recreational: 0.05, // 5% of vessels cross
ferry_to_industrial: 0.15,
allowClassInZone: {
CARGO: ["industrial"], // never in recreational
RECREATIONAL: ["recreational", "ferry"], // rarely in industrial
FERRY: ["ferry", "industrial"] // ferries may traverse industrial
}
}
Refinement 2: Spawn Cooldown per Class
Prevent spawning 10 CARGO vessels in rapid succession.

js
// OPTIONAL
const SPAWN_COOLDOWN_SECONDS = {
CARGO: 300,
TANKER: 300,
FERRY: 120,
RECREATIONAL: 30,
TUG: 60
}
Refinement 3: Ecology Telemetry
js
// OPTIONAL
const ECOLOGY_TELEMETRY = `
Required telemetry:

- Synthetic vessels spawned per zone per hour
- Max synthetic vessel count reached
- Class distribution vs target distribution (error)
- Despawn reasons (timeout, zone full, AIS override)
  `
  Authority Boundary Compliance
  0522O Requirement v1.0.0 Status
  AIS owns truth ✅ "AIS truth overrides ecology" PASS
  Runtime owns continuity ✅ Ecology does not mutate lifecycle PASS
  Taxonomy defines identity ✅ Uses classes from 0523A PASS
  No renderer simulation ✅ Ecology is presence, not motion PASS
  Constitutional status: COMPLIANT (principles only)

Relationship to Other Specs
Spec Relationship Status
0523A (Taxonomy) Consumes vessel classes ✅ Defined
0523B (PopulationHierarchy) Subordinate to, interface undefined ❌ Missing
0522O (MotionAuthority) Must not override AIS ✅ Compliant
HarborGeography (deferred) Zone boundaries ❌ Deferred
Validation Checklist (Current vs Required)
Current Required Addition
✅ Ecology never overrides AIS truth —
✅ Ecology never mutates lifecycle state —
✅ Ecology remains probabilistic ⚠️ Needs probability distributions
✅ Empty-water states possible —
✅ Synthetic vessels explicitly marked —
❌ Missing Zone boundaries defined
❌ Missing Spawn timing/cadence rules
❌ Missing Despawn rules
❌ Missing Density baselines per zone
❌ Missing PopulationHierarchy interface
Final Status
Document Status: ACCEPT as governance principles. REJECT as implementation infrastructure

Stage: REVIEW → needs v1.1.0 for implementation

Can implement against this spec? NO — missing zone boundaries, probability distributions, spawn rules, lifecycle rules

Can use as governance reference? YES — principles and authority boundaries are correct

Required for v1.1.0 (Implementation Readiness)
Requirement Priority
Zone boundary definition (or defer to geography spec) BLOCKING
Probability distributions per zone BLOCKING
Spawn timing/cadence rules BLOCKING
Synthetic vessel lifecycle (spawn→despawn) BLOCKING
Density baselines (vessels per area) BLOCKING
PopulationHierarchy interface contract BLOCKING
Despawn rules HIGH
Validation checklist expansion HIGH
Recommended for v1.2.0 (Production Readiness)
Requirement Priority
Ecological rhythm (diurnal, seasonal) MEDIUM
Zone transition probabilities MEDIUM
Spawn cooldowns per class LOW
Ecology telemetry spec LOW
Correlation rules (Tug-Cargo, etc.) LOW
Summary
Question Answer
Is the governance model correct? YES — AIS override, no runtime mutation
Are authority boundaries clear? YES — Subordinate to PopulationHierarchy, AIS
Can I implement spawning from this spec? NO — Missing probabilities, boundaries, timing
Should this be accepted as a spec? YES — as governance principles
Should this be frozen for implementation? NO — needs v1.1.0 with concrete parameters
Final Statement
v1.0.0 correctly establishes ecological governance — the "what" (zones exist, AIS overrides, synthetic vessels are marked) and the "why" (probabilistic presence, not authority). It does not provide the ecological parameters required for implementation — the "how much" (probabilities, densities, timing, boundaries). A v1.1.0 with concrete ecological profiles is required before spawning can be implemented.

Action: Accept v1.0.0 as governance. Create v1.1.0 with ecological parameter tables, zone definitions (or deferral to geography spec), and PopulationHierarchy interface.
