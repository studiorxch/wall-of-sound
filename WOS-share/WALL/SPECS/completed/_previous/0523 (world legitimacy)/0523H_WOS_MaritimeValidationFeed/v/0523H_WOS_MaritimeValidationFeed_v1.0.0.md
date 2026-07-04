---
title: "WOS Maritime Validation Feed"
filename: "0523H_WOS_MaritimeValidationFeed_v1.0.0.md"
version: "1.0.0"
date: "2026-05-24"
system: "WOS"
module: "Maritime Validation Feed"
type: "runtime-validation-spec"

status: "[BUILD]"
stage: "[BUILD]"
freeze_decision: "GO"

build_scope: "deterministic-ais-validation-feed-only"
owner: "StudioRich / WOS"

depends_on:
  - "0522O_WOS_MaritimeMotionAuthority_v1.0.0"
  - "0522P_WOS_AISRuntimeContinuity_v1.0.0"
  - "0523A_WOS_MaritimeVesselTaxonomyProfiles_v1.2.2"
  - "0523B_WOS_MaritimePopulationHierarchy_v1.1.0"
  - "0523C_WOS_MaritimeSpawnEcology_v1.2.1"
  - "0523D_WOS_MaritimeWakeAuthority_v1.2.1"
  - "0523E_WOS_MaritimeAtmosphericReadability_v1.2.0"
  - "0523F_WOS_MaritimeContinuityDensity_v1.2.0"
  - "0523G_WOS_MaritimeOccupancyRenderer_v1.2.3"
---

# 🚦 SPEC STAGE

Stage: [BUILD]  
Freeze Decision: GO  
Action: Implement deterministic AIS-backed harbor validation feed.

---

# 0523H_WOS_MaritimeValidationFeed_v1.0.0

## Purpose

Create a deterministic validation feed that injects harbor test vessels through `AISRuntime` instead of renderer-local seed state.

This system exists to prove the full maritime stack under controlled conditions:

- AIS ingestion
- lifecycle behavior
- continuity scalars
- population hierarchy
- wake emission
- atmospheric readability
- continuity density
- occupancy rendering
- harbor-scale visual legibility

Core doctrine:

```text
ValidationFeed may simulate AIS packets.
ValidationFeed may not bypass AISRuntime truth.
```

---

# 1. Problem Statement

Renderer-local seed vessels proved visual viability, but they are not sufficient for runtime validation.

Renderer-local seeds bypass:

- AISRuntime ingestion
- AIS lifecycle state
- continuity scalar derivation
- wake emission authority
- population hierarchy assignment
- continuity density pressure
- AIS fault telemetry
- runtime aging behavior

Therefore, the next validation layer must inject deterministic vessel packets through the same AISRuntime path that future live AIS feeds will use.

---

# 2. Authority Boundaries

## ValidationFeed Owns

- deterministic validation packet generation
- validation vessel catalog
- validation feed cadence
- validation route progression
- validation packet timestamps
- validation scenario state
- validation feed enable/disable controls

## ValidationFeed May Observe

- simulation time
- AISRuntime public ingest API
- validation vessel definitions
- validation scenario config

## ValidationFeed May Not Mutate

- AISRuntime active buckets directly
- AISRuntime dormant buckets directly
- vessel lifecycle state directly
- vessel continuity scalars directly
- PopulationHierarchy tier records directly
- WakeAuthority wake segments directly
- AtmosphericReadability output directly
- OccupancyRenderer state directly
- camera state

---

# 3. Runtime Path Rule

ValidationFeed must inject only through AISRuntime public ingestion.

Allowed:

```ts
SBE.AISRuntime.ingestPacket(packet)
```

or existing canonical equivalent.

Forbidden:

```ts
SBE.AISRuntime._activeBucket[mmsi] = vessel
SBE.MaritimeOccupancyRenderer._seedVessels.push(...)
SBE.WakeAuthority.emitWakeSegment(...) directly from feed
SBE.MaritimePopulationHierarchy.assign(...) directly from feed
```

The validation feed is an AIS source, not a runtime owner.

---

# 4. Validation Vessel Catalog

The validation catalog should preserve the water-safe corridor logic from 0523G v1.2.3.

Required corridors:

- Upper Bay Ship Channel
- Staten Island Ferry Lane
- East River Ferry Lane
- Hudson River West-Side Lane
- Kill Van Kull Industrial Lane
- Verrazzano / Ambrose Approach
- Brooklyn Cruise / Red Hook Basin
- Lower Bay Anchorage

Recommended count:

```text
35 validation vessels
```

The catalog must remain deterministic.

No `Math.random()`.

---

# 5. Validation Vessel Definition

```ts
type MaritimeValidationVessel = {
  readonly mmsi: string;
  readonly vesselName: string;

  readonly vesselClass:
    | "CARGO"
    | "TANKER"
    | "PASSENGER"
    | "FERRY"
    | "TUG"
    | "SERVICE"
    | "FISHING"
    | "RECREATIONAL"
    | "MILITARY"
    | "INDUSTRIAL"
    | "UNKNOWN";

  readonly aisTypeCode: number;

  readonly corridorId: string;
  readonly waterwayLabel: string;

  readonly state:
    | "STATUS_UNDERWAY"
    | "STATUS_ANCHORED"
    | "STATUS_MOORED"
    | "STATUS_RESTRICTED";

  readonly startLat: number;
  readonly startLng: number;

  readonly headingDeg: number;
  readonly speedKts: number;

  readonly lengthMeters: number;
  readonly widthMeters: number;

  readonly route?: readonly MaritimeValidationRoutePoint[];
};
```

---

# 6. Validation Route Point

```ts
type MaritimeValidationRoutePoint = {
  readonly lat: number;
  readonly lng: number;
  readonly atMs: number;
};
```

Routes must be deterministic.

`atMs` is relative to validation scenario start time.

---

# 7. Packet Contract

ValidationFeed emits AIS-like packets compatible with AISRuntime.

```ts
type MaritimeValidationAISPacket = {
  readonly mmsi: string;
  readonly vesselName: string;
  readonly timestampMs: number;

  readonly state: string;

  readonly telemetry: {
    readonly lat: number;
    readonly lng: number;
    readonly speedKnots: number;
    readonly courseOverGround: number;
    readonly trueHeading: number;
  };

  readonly dimensions: {
    readonly lengthMeters: number;
    readonly widthMeters: number;
  };

  readonly aisTypeCode: number;
  readonly shipType: number;

  readonly validation: {
    readonly source: "MARITIME_VALIDATION_FEED";
    readonly corridorId: string;
    readonly waterwayLabel: string;
  };
};
```

---

# 8. Cadence

ValidationFeed cadence must be simulation-time driven.

Default:

```ts
const VALIDATION_FEED_INTERVAL_MS = 1000;
```

Allowed:

- 1Hz validation packet updates
- deterministic route interpolation
- deterministic timestamp assignment

Forbidden:

- wall-clock authority
- renderer frame timing
- random jitter
- adaptive cadence based on visual output

---

# 9. Route Progression

Underway vessels with routes should move along deterministic route points.

Allowed:

- linear interpolation between route points
- heading derived from route segment
- speed derived from vessel definition or route distance
- looped route playback if explicitly configured

Forbidden:

- steering around map features dynamically
- camera-driven route changes
- renderer-driven position changes
- WakeAuthority-driven route changes
- random route variation

---

# 10. Stationary Vessels

Anchored and moored validation vessels must still emit AIS packets on cadence.

They should retain:

- stable position
- speedKts = 0
- stable or slowly rotating heading only if explicitly defined

Default:

```text
stationary heading remains fixed
```

No drift.

No fake movement.

---

# 11. AIS Type Mapping

ValidationFeed must provide AIS type codes compatible with 0523A.

Recommended baseline:

| Vessel Class | AIS Type Code |
|---|---:|
| CARGO | 70 |
| TANKER | 80 |
| PASSENGER | 60 |
| FERRY | 60 + validation metadata |
| TUG | 52 |
| SERVICE | 50 |
| FISHING | 30 |
| RECREATIONAL | 37 |
| MILITARY | 55 |
| INDUSTRIAL | 53 |
| UNKNOWN | 0 |

FERRY classification must be supported by validation metadata, not AIS type code alone.

---

# 12. Scenario Control

Public API:

```ts
SBE.MaritimeValidationFeed.enable(true);
SBE.MaritimeValidationFeed.enable(false);
SBE.MaritimeValidationFeed.reset();
SBE.MaritimeValidationFeed.tick(simulationTimeMs);
SBE.MaritimeValidationFeed.debug();
```

Console helpers:

```ts
_wos.enableMaritimeValidationFeed(true);
_wos.enableMaritimeValidationFeed(false);
_wos.resetMaritimeValidationFeed();
_wos.debugMaritimeValidationFeed();
```

---

# 13. Integration With Existing Renderer Seeds

Renderer-local seed helpers may remain for visual-only testing.

However:

```text
ValidationFeed is the preferred full-stack harbor validation path.
```

`seedWaterCorridors()` should remain available but clearly labeled:

```text
renderer-local visual validation only
```

Do not remove it.

Do not silently redirect it to AISRuntime.

---

# 14. Fault / Telemetry Behavior

ValidationFeed should expose telemetry:

```ts
type MaritimeValidationFeedDebug = {
  enabled: boolean;
  scenarioStartMs: number | null;

  vesselCount: number;
  packetsEmitted: number;
  lastEmitMs: number | null;

  activeCorridors: readonly string[];

  movingVessels: number;
  stationaryVessels: number;

  rejectedByAISRuntime: number;
};
```

ValidationFeed may count rejected packets only if AISRuntime exposes rejection feedback.

ValidationFeed must not inspect AISRuntime private rejection structures.

---

# 15. Wake Integration

ValidationFeed does not emit wakes directly.

Wake generation must occur downstream through existing runtime integration.

Expected flow:

```text
ValidationFeed
→ AISRuntime ingest
→ vessel state update
→ PopulationHierarchy interpretation
→ WakeAuthority read/emit path
→ AtmosphericReadability
→ OccupancyRenderer
```

Direct wake emission from ValidationFeed is forbidden.

---

# 16. Density Integration

ValidationFeed does not compute density.

ContinuityDensity should observe resulting AISRuntime and WakeAuthority state normally.

Expected:

```text
35 validation vessels
→ AISRuntime active vessels
→ ContinuityDensity sector pressure
→ AtmosphericReadability clutterPressure
→ OccupancyRenderer readability
```

ValidationFeed must not write clutterPressure.

---

# 17. Build Requirements

Create:

```text
wall/validation/maritimeValidationFeed.js
```

Add script tag after AISRuntime and before renderer consumers.

Suggested load order:

```text
AISRuntime
MaritimeTaxonomyProfiles
MaritimePopulationHierarchy
WakeAuthority
MaritimeAtmosphericReadability
MaritimeContinuityDensity
MaritimeValidationFeed
MaritimeOccupancyRenderer
```

If exact order differs in the current project, ValidationFeed must load after AISRuntime and before user test helpers are called.

---

# 18. Runtime Flags

Add:

```ts
SBE.runtimeFlags.enableMaritimeValidationFeed = false;
SBE.runtimeFlags.maritimeValidationFeedAutostart = false;
SBE.runtimeFlags.showMaritimeValidationFeedLogs = false;
```

Defaults:

- disabled
- no autostart
- logs off

ValidationFeed should not auto-enable unless explicitly requested.

---

# 19. Determinism Requirements

Forbidden:

- `Math.random()`
- `Date.now()` as authority
- renderer frame timestamps as authority
- DOM reads as authority
- private runtime bucket mutation

Allowed:

- provided `simulationTimeMs`
- `performance.now()` only as fallback if no simulation clock exists and clearly marked as non-replay validation fallback
- deterministic route math
- public AISRuntime ingest

---

# 20. Acceptance Criteria

Build is successful when:

- `_wos.enableMaritimeValidationFeed(true)` activates 35 AIS-backed validation vessels
- vessels appear through normal occupancy renderer path
- `_wos.debugOccupancy()` counts AIS vessels instead of only renderer-local seeds
- `_wos.debugMaritimeValidationFeed()` shows packet cadence and corridor state
- stationary vessels remain stationary
- underway vessels update positions deterministically
- no renderer-local seed state is required
- WakeAuthority receives enough movement to generate wake memory if wake integration is active
- PopulationHierarchy can assign tiers from runtime vessel identity
- AtmosphericReadability still controls visibility
- no private AISRuntime buckets are mutated directly

---

# 21. Non-Goals

This spec does NOT implement:

- live AIS subscription
- MarineTraffic integration
- ferry schedules
- real-world route lookup
- hydrodynamic simulation
- official maritime lane registry
- long-term persistence
- camera behavior
- gameplay interaction
- audio-reactive vessel behavior

---

# 22. Build Readiness

```text
Stage: [BUILD]
Freeze Decision: GO
```

This is approved as:

```text
deterministic AIS validation feed
```

---

# 23. Implementation Guide

- **Where this goes:** `wall/validation/maritimeValidationFeed.js`
- **What to run:** inject deterministic AIS-like validation packets through AISRuntime at 1Hz simulation time.
- **What to expect:** the harbor validation layer moves from renderer-local visual proof into full-stack AIS-backed maritime behavior.
