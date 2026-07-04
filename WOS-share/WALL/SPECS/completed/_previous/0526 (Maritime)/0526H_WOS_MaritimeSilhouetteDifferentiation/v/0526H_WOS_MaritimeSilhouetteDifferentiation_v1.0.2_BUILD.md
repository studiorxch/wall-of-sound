---
layout: spec

title: "WOS Maritime Silhouette Differentiation"
date: 2026-05-27
doc_id: "0526H_WOS_MaritimeSilhouetteDifferentiation_v1.0.2"
version: "1.0.2"

project: "Wall of Sound"
system: "WOS"

domain: "presentation"
component: "MaritimeSilhouetteDifferentiation"

type: "runtime-presentation-spec"
classification: "interpretation-layer"

status: "[BUILD]"
stage: "[BUILD]"
freeze_decision: "GO"
build_scope: "maritime-silhouette-readability"

summary: "Build-ready silhouette readability and atmospheric vessel differentiation contract for the WOS maritime presentation layer."

owner: "StudioRich / WOS"

supersedes:
  - "0526H_WOS_MaritimeSilhouetteDifferentiation_v1.0.0"
  - "0526H_WOS_MaritimeSilhouetteDifferentiation_v1.0.1"

depends_on:
  - "0525A_WOS_MapStyleAuthority_v1.0.2"
  - "0525B_WOS_MaritimeStyleRegistry_v1.0.1"
  - "0525E_WOS_VisibilityClassRuntime_v1.0.0"
  - "0525F_WOS_ProceduralVesselTopology_v1.0.1"
  - "0526C_WOS_ActiveWakePolish_v1.0.1"
  - "0526E_WOS_MaritimeDistanceAtmosphere_v1.0.1"
  - "0526F_WOS_MaritimeLightAuthority_v1.0.2"

related:
  - "0526B_WOS_MaritimeWaterMemory_v1.0.1"
---

# 🚦 SPEC STAGE

Stage: [BUILD]  
Freeze Decision: GO  
Action: Proceed to implementation. This specification defines a stateless, presentation-only silhouette readability layer with canonical taxonomy, deterministic profile resolution, validation-entity governance, and no runtime truth mutation.

# 0526H_WOS_MaritimeSilhouetteDifferentiation_v1.0.2_BUILD

---

# 1. Canonical Artifact Rule

This is the full standalone BUILD artifact for:

```text
0526H_WOS_MaritimeSilhouetteDifferentiation_v1.0.2
```

This document supersedes:

```text
0526H_WOS_MaritimeSilhouetteDifferentiation_v1.0.0
0526H_WOS_MaritimeSilhouetteDifferentiation_v1.0.1
```

v1.0.2 resolves final review blockers:

- adds full `SILHOUETTE_PROFILES` dictionary
- adds canonical `resolveSilhouetteProfile()` assembly flow
- defines validation entity governance
- clarifies topology ownership separation
- clarifies wake readability ownership separation
- clarifies debug immutability
- preserves canonical taxonomy alignment
- preserves distance/visibility authority separation
- preserves non-accumulative persistence doctrine
- keeps all behavior presentation-only

Partial files, placeholders, continuations, or omitted profile tables are invalid.

---

# 2. Purpose

Define the build-ready presentation-readability system for maritime silhouette differentiation inside WOS.

This specification governs:

- silhouette readability
- atmospheric vessel distinction
- category-level shape implication
- distance-safe vessel differentiation
- non-textural maritime presence
- lightweight occupancy readability
- deterministic silhouette profile resolution

This system exists to evolve maritime rendering from:

```text
uniform occupancy markers
```

toward:

```text
atmospherically distinguishable maritime presence
```

without introducing:

- simulation mutation
- AIS corruption
- gameplay iconography
- narrative orchestration
- behavioral simulation
- texture dependency
- persistent environmental state

---

# 3. Constitutional Doctrine

## 3.1 Presentation Interprets Reality

Silhouette differentiation exists only within:

```text
presentation-space
```

It may NOT:

- alter AIS truth
- modify vessel state
- inject fake classifications
- affect continuity
- mutate occupancy authority
- rewrite visibility state
- modify camera state
- persist environmental simulation

---

## 3.2 Presentation-Readability Only

MaritimeSilhouetteDifferentiation governs:

```text
presentation readability only
```

It is NOT:

- a vessel identity authority system
- a behavioral simulation layer
- a continuity engine
- a harbor-state accumulator
- a cinematic orchestration layer
- a gameplay visibility system
- a taxonomy authority system

---

## 3.3 Shape Language Over Literal Representation

The system rejects:

- texture realism
- literal vessel depiction
- branded ship likenesses
- detailed simulation geometry
- MMO-style iconography
- radar-style symbols
- minimap-style markers

Vessel distinction must emerge through:

- aspect ratio
- atmospheric mass weighting
- light spacing
- wake readability modulation
- heading stability bias
- bloom softness
- occupancy density implication

---

# 4. Authority Boundaries

## 4.1 Owns

This system owns:

- silhouette readability profiles
- atmospheric mass interpretation
- hull aspect weighting
- presentation-only heading stability bias
- far-light spacing interpretation
- silhouette degradation policy
- presentation-only wake readability scaling

---

## 4.2 Observes

This system may observe:

- AIS vessel class
- AIS vessel state
- speed
- heading
- visibility class
- distance atmosphere envelopes
- wake authority outputs
- light authority outputs
- renderer-provided validation status

---

## 4.3 Must Not Mutate

This system must NEVER mutate:

- `AISRuntime`
- `MaritimeDistanceAtmosphere`
- `MaritimeLightAuthority`
- `ActiveWakePolish`
- `VisibilityClassRuntime`
- `ProceduralVesselTopology`
- camera state
- continuity state
- harbor environmental state
- vessel taxonomy
- vessel identity
- renderer orchestration

---

# 5. Ownership Separation

## 5.1 ProceduralVesselTopology Separation

```text
ProceduralVesselTopology owns structural vessel abstraction.

MaritimeSilhouetteDifferentiation owns presentation readability weighting only.
```

This system may provide scalar hints such as `hullAspectBias`.

It may NOT:

- rewrite topology blueprints
- create new vessel geometry primitives
- override topology LOD authority
- mutate topology registries
- redefine canonical vessel classes

---

## 5.2 Wake Authority Separation

```text
Wake systems remain independently authoritative.
```

`wakeReadabilityScale` may modulate presentation interpretation only.

It may NOT:

- alter wake creation
- extend wake lifetime
- mutate wake state
- revive WaterMemory
- generate persistent wake residue
- imply hydrodynamic simulation

---

## 5.3 Light Authority Separation

```text
MaritimeLightAuthority owns maritime light behavior.

MaritimeSilhouetteDifferentiation may provide light-spacing readability hints only.
```

This system may influence:

- presentation spacing interpretation
- cluster variance hints
- silhouette-related bloom softness hints

It may NOT:

- override light envelopes
- mutate light signatures
- create light behavior
- change pulse cadence
- create urgency semantics

---

# 6. Canonical Taxonomy Alignment

This system must use canonical maritime taxonomy keys.

## 6.1 Allowed Class Keys

```ts
type MaritimeSilhouetteClass =
  | "cargo"
  | "tanker"
  | "ferry"
  | "service"
  | "recreational"
  | "fishing"
  | "passenger"
  | "tug"
  | "military"
  | "industrial"
  | "unknown";
```

---

## 6.2 Vessel State Separation

Anchored, drifting, moored, idle, and stationary behavior belongs to:

```text
vesselState
```

not class taxonomy.

Forbidden:

```text
ANCHORED as a class
FAST_CRAFT as a class
```

---

# 7. Distance Authority

Canonical distance bands must align with `0526E_WOS_MaritimeDistanceAtmosphere`.

```ts
type DistanceBand =
  | "HERO"
  | "NEAR"
  | "MID"
  | "FAR"
  | "ATMOSPHERIC";
```

Distance bands describe observation hierarchy.

They do not define vessel truth.

---

# 8. Visibility Authority

Visibility classes must align with `0525E_WOS_VisibilityClassRuntime`.

```ts
type VisibilityClass =
  | "FULL"
  | "REDUCED"
  | "SILHOUETTE"
  | "MARKER_ONLY"
  | "LIGHT_ONLY"
  | "ATMOSPHERIC_HIDDEN";
```

Distance authority and visibility authority must NEVER be conflated.

---

# 9. Runtime Contracts

## 9.1 MaritimeSilhouetteProfile

```ts
type MaritimeSilhouetteProfile = {
  readonly version: "1.0.2";

  readonly silhouetteClass: MaritimeSilhouetteClass;

  readonly hullAspectBias: number;
  readonly atmosphericMassBias: number;

  readonly wakeReadabilityScale: number;
  readonly headingStabilityBias: number;
  readonly turnSoftnessDeg: number;

  readonly farLightSpacing: number;
  readonly lightClusterVariance: number;

  readonly bloomSoftness: number;
};
```

---

## 9.2 Field Definitions

| Field | Meaning | Range |
|---|---|---:|
| `hullAspectBias` | relative presentation elongation multiplier | `0.0–5.0` |
| `atmosphericMassBias` | resistance to atmospheric silhouette collapse | `0.0–1.0` |
| `wakeReadabilityScale` | presentation-only wake readability weighting | `0.0–1.0` |
| `headingStabilityBias` | visual directional persistence smoothing | `0.0–1.0` |
| `turnSoftnessDeg` | rotational dampening threshold | `0.0–45.0` |
| `farLightSpacing` | normalized spacing multiplier for far-light grouping | `0.0–3.0` |
| `lightClusterVariance` | deterministic cluster offset variance | `0.0–1.0` |
| `bloomSoftness` | edge-softening multiplier for glow interpretation | `0.0–1.0` |

All fields are presentation-only.

No field may imply:

- cognition
- intent
- tactical awareness
- navigation certainty
- runtime behavior

---

## 9.3 MaritimeSilhouetteInput

```ts
type MaritimeSilhouetteInput = {
  readonly vesselId: string;

  readonly vesselClass: string;
  readonly vesselState?: string | null;

  readonly speedKts: number;
  readonly headingDeg: number;

  readonly distanceBand: DistanceBand;
  readonly visibilityClass: VisibilityClass;

  readonly isValidationEntity: boolean;
};
```

---

# 10. System Constants

```ts
const MARITIME_SILHOUETTE_VERSION = "1.0.2";

const MIN_ASPECT_BIAS = 0.0;
const MAX_ASPECT_BIAS = 5.0;

const MIN_MASS_BIAS = 0.0;
const MAX_MASS_BIAS = 1.0;

const MIN_READABILITY_SCALE = 0.0;
const MAX_READABILITY_SCALE = 1.0;

const MAX_TURN_SOFTNESS_DEG = 45.0;

const DEFAULT_UNKNOWN_CLASS: MaritimeSilhouetteClass = "unknown";
```

---

# 11. Complete Canonical Profile Dictionary

This table is canonical runtime data.

It must be present in the implementation.

```ts
const SILHOUETTE_PROFILES: Record<MaritimeSilhouetteClass, MaritimeSilhouetteProfile> = {
  cargo: {
    version: "1.0.2",
    silhouetteClass: "cargo",
    hullAspectBias: 3.20,
    atmosphericMassBias: 0.90,
    wakeReadabilityScale: 0.85,
    headingStabilityBias: 0.90,
    turnSoftnessDeg: 6.0,
    farLightSpacing: 2.20,
    lightClusterVariance: 0.05,
    bloomSoftness: 0.55,
  },

  tanker: {
    version: "1.0.2",
    silhouetteClass: "tanker",
    hullAspectBias: 3.50,
    atmosphericMassBias: 0.95,
    wakeReadabilityScale: 0.75,
    headingStabilityBias: 0.95,
    turnSoftnessDeg: 4.0,
    farLightSpacing: 2.40,
    lightClusterVariance: 0.04,
    bloomSoftness: 0.60,
  },

  ferry: {
    version: "1.0.2",
    silhouetteClass: "ferry",
    hullAspectBias: 1.95,
    atmosphericMassBias: 0.65,
    wakeReadabilityScale: 0.70,
    headingStabilityBias: 0.80,
    turnSoftnessDeg: 14.0,
    farLightSpacing: 1.50,
    lightClusterVariance: 0.12,
    bloomSoftness: 0.40,
  },

  service: {
    version: "1.0.2",
    silhouetteClass: "service",
    hullAspectBias: 1.40,
    atmosphericMassBias: 0.50,
    wakeReadabilityScale: 0.60,
    headingStabilityBias: 0.70,
    turnSoftnessDeg: 20.0,
    farLightSpacing: 1.10,
    lightClusterVariance: 0.18,
    bloomSoftness: 0.35,
  },

  recreational: {
    version: "1.0.2",
    silhouetteClass: "recreational",
    hullAspectBias: 0.85,
    atmosphericMassBias: 0.35,
    wakeReadabilityScale: 0.50,
    headingStabilityBias: 0.55,
    turnSoftnessDeg: 35.0,
    farLightSpacing: 0.65,
    lightClusterVariance: 0.28,
    bloomSoftness: 0.25,
  },

  fishing: {
    version: "1.0.2",
    silhouetteClass: "fishing",
    hullAspectBias: 1.30,
    atmosphericMassBias: 0.60,
    wakeReadabilityScale: 0.80,
    headingStabilityBias: 0.65,
    turnSoftnessDeg: 22.0,
    farLightSpacing: 0.95,
    lightClusterVariance: 0.22,
    bloomSoftness: 0.45,
  },

  passenger: {
    version: "1.0.2",
    silhouetteClass: "passenger",
    hullAspectBias: 2.80,
    atmosphericMassBias: 0.80,
    wakeReadabilityScale: 0.65,
    headingStabilityBias: 0.85,
    turnSoftnessDeg: 8.0,
    farLightSpacing: 1.90,
    lightClusterVariance: 0.08,
    bloomSoftness: 0.50,
  },

  tug: {
    version: "1.0.2",
    silhouetteClass: "tug",
    hullAspectBias: 1.15,
    atmosphericMassBias: 0.80,
    wakeReadabilityScale: 0.95,
    headingStabilityBias: 0.60,
    turnSoftnessDeg: 28.0,
    farLightSpacing: 0.75,
    lightClusterVariance: 0.24,
    bloomSoftness: 0.30,
  },

  military: {
    version: "1.0.2",
    silhouetteClass: "military",
    hullAspectBias: 2.50,
    atmosphericMassBias: 0.40,
    wakeReadabilityScale: 0.55,
    headingStabilityBias: 0.90,
    turnSoftnessDeg: 12.0,
    farLightSpacing: 1.30,
    lightClusterVariance: 0.15,
    bloomSoftness: 0.20,
  },

  industrial: {
    version: "1.0.2",
    silhouetteClass: "industrial",
    hullAspectBias: 1.60,
    atmosphericMassBias: 0.85,
    wakeReadabilityScale: 0.85,
    headingStabilityBias: 0.75,
    turnSoftnessDeg: 15.0,
    farLightSpacing: 1.20,
    lightClusterVariance: 0.18,
    bloomSoftness: 0.45,
  },

  unknown: {
    version: "1.0.2",
    silhouetteClass: "unknown",
    hullAspectBias: 1.50,
    atmosphericMassBias: 0.50,
    wakeReadabilityScale: 0.50,
    headingStabilityBias: 0.75,
    turnSoftnessDeg: 15.0,
    farLightSpacing: 1.00,
    lightClusterVariance: 0.15,
    bloomSoftness: 0.40,
  },
};
```

---

# 12. Validation Entity Governance

Validation entities are renderer-authorized diagnostic vessels used for:

- visibility verification
- distance envelope inspection
- atmospheric calibration
- debug overlay validation
- silhouette profile inspection
- regression verification

Ownership:

```text
MaritimeOccupancyRenderer or authorized debug/runtime tooling only.
```

Validation status must NEVER originate from:

- AIS feeds
- external telemetry
- gameplay state
- vessel metadata
- persistence layers
- user-generated vessel data
- network-provided vessel flags

Validation entities are:

```text
ephemeral renderer diagnostics
```

not simulation entities.

They may bypass degradation only to preserve diagnostic authority.

They may not be used to elevate real vessels, gameplay vessels, live AIS vessels, or persisted synthetic vessels.

Implementation rule:

```ts
isValidationEntity = Boolean(rendererDiagnosticFlag);
```

Forbidden:

```ts
isValidationEntity = Boolean(vessel.isValidationEntityFromAIS);
```

---

# 13. Canonical Class Resolution

## 13.1 resolveSilhouetteClass()

```ts
function resolveSilhouetteClass(
  vesselClass: string,
  vesselState?: string | null
): MaritimeSilhouetteClass {
  const cls = String(vesselClass || "unknown").toLowerCase().trim();

  if (cls === "cargo") return "cargo";
  if (cls === "tanker") return "tanker";
  if (cls === "ferry") return "ferry";
  if (cls === "service") return "service";
  if (cls === "recreational") return "recreational";
  if (cls === "fishing") return "fishing";
  if (cls === "passenger") return "passenger";
  if (cls === "tug") return "tug";
  if (cls === "military") return "military";
  if (cls === "industrial") return "industrial";

  if (cls === "cruise") return "passenger";
  if (cls === "container") return "cargo";
  if (cls === "freighter") return "cargo";
  if (cls === "barge") return "industrial";
  if (cls === "yacht") return "recreational";
  if (cls === "speedboat") return "recreational";
  if (cls === "trawler") return "fishing";
  if (cls === "pilot") return "service";
  if (cls === "patrol") return "service";

  return "unknown";
}
```

`vesselState` may influence profile modifiers.

It must not create class taxonomy.

---

# 14. Canonical Profile Resolution Flow

## 14.1 resolveSilhouetteProfile()

Canonical assembly order:

```text
1. validate input
2. resolve validation entity bypass
3. resolve canonical silhouette class
4. lookup base profile
5. apply vessel state modifiers
6. apply distance band degradation
7. apply visibility class suppression
8. clamp scalar ranges
9. return immutable profile
```

---

## 14.2 Reference Implementation

```ts
function resolveSilhouetteProfile(
  input: MaritimeSilhouetteInput
): MaritimeSilhouetteProfile {
  if (!input || !input.vesselId) {
    return Object.freeze({ ...SILHOUETTE_PROFILES.unknown });
  }

  if (input.isValidationEntity === true) {
    return Object.freeze({
      version: "1.0.2",
      silhouetteClass: "unknown",
      hullAspectBias: 1.50,
      atmosphericMassBias: 1.00,
      wakeReadabilityScale: 1.00,
      headingStabilityBias: 1.00,
      turnSoftnessDeg: 0.0,
      farLightSpacing: 1.00,
      lightClusterVariance: 0.00,
      bloomSoftness: 0.00,
    });
  }

  const resolvedClass = resolveSilhouetteClass(
    input.vesselClass,
    input.vesselState
  );

  const baseProfile =
    SILHOUETTE_PROFILES[resolvedClass] ||
    SILHOUETTE_PROFILES.unknown;

  let hullAspectBias = baseProfile.hullAspectBias;
  let atmosphericMassBias = baseProfile.atmosphericMassBias;
  let wakeReadabilityScale = baseProfile.wakeReadabilityScale;
  let headingStabilityBias = baseProfile.headingStabilityBias;
  let turnSoftnessDeg = baseProfile.turnSoftnessDeg;
  let farLightSpacing = baseProfile.farLightSpacing;
  let lightClusterVariance = baseProfile.lightClusterVariance;
  let bloomSoftness = baseProfile.bloomSoftness;

  const state = String(input.vesselState || "").toLowerCase();
  const speedKts = Number.isFinite(input.speedKts) ? input.speedKts : 0;

  if (
    state === "anchored" ||
    state === "moored" ||
    state === "stationary" ||
    speedKts < 0.15
  ) {
    hullAspectBias *= 1.05;
    wakeReadabilityScale = 0.0;
    headingStabilityBias = Math.max(headingStabilityBias, 0.90);
    turnSoftnessDeg = Math.min(turnSoftnessDeg, 5.0);
  }

  switch (input.distanceBand) {
    case "HERO":
    case "NEAR":
      break;

    case "MID":
      hullAspectBias *= 0.80;
      wakeReadabilityScale *= 0.65;
      lightClusterVariance *= 0.85;
      break;

    case "FAR":
      hullAspectBias *= 0.25;
      wakeReadabilityScale *= 0.15;
      farLightSpacing *= 1.20;
      atmosphericMassBias *= 0.70;
      break;

    case "ATMOSPHERIC":
      hullAspectBias = 0.0;
      atmosphericMassBias = 0.0;
      wakeReadabilityScale = 0.0;
      headingStabilityBias = Math.max(headingStabilityBias, 0.95);
      turnSoftnessDeg = Math.min(turnSoftnessDeg, 5.0);
      farLightSpacing *= 1.50;
      lightClusterVariance *= 1.40;
      bloomSoftness *= 1.30;
      break;

    default:
      hullAspectBias *= 0.80;
      wakeReadabilityScale *= 0.65;
      break;
  }

  switch (input.visibilityClass) {
    case "FULL":
      break;

    case "REDUCED":
      hullAspectBias *= 0.85;
      wakeReadabilityScale *= 0.50;
      break;

    case "SILHOUETTE":
      atmosphericMassBias = Math.min(atmosphericMassBias * 1.30, 1.0);
      wakeReadabilityScale *= 0.25;
      break;

    case "MARKER_ONLY":
      hullAspectBias = 0.05;
      wakeReadabilityScale = 0.0;
      break;

    case "LIGHT_ONLY":
    case "ATMOSPHERIC_HIDDEN":
      hullAspectBias = 0.0;
      atmosphericMassBias = 0.0;
      wakeReadabilityScale = 0.0;
      break;

    default:
      hullAspectBias *= 0.85;
      wakeReadabilityScale *= 0.50;
      break;
  }

  return Object.freeze({
    version: "1.0.2",
    silhouetteClass: resolvedClass,

    hullAspectBias: clamp(hullAspectBias, MIN_ASPECT_BIAS, MAX_ASPECT_BIAS),
    atmosphericMassBias: clamp(atmosphericMassBias, MIN_MASS_BIAS, MAX_MASS_BIAS),

    wakeReadabilityScale: clamp(
      wakeReadabilityScale,
      MIN_READABILITY_SCALE,
      MAX_READABILITY_SCALE
    ),
    headingStabilityBias: clamp(
      headingStabilityBias,
      MIN_READABILITY_SCALE,
      MAX_READABILITY_SCALE
    ),
    turnSoftnessDeg: clamp(turnSoftnessDeg, 0, MAX_TURN_SOFTNESS_DEG),

    farLightSpacing: clamp(farLightSpacing, 0, 3.0),
    lightClusterVariance: clamp(lightClusterVariance, 0, 1.0),

    bloomSoftness: clamp(bloomSoftness, 0, 1.0),
  });
}
```

---

# 15. Clamp Helper

```ts
function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}
```

---

# 16. Atmospheric Persistence Governance

Persistence effects must remain:

```text
lightweight
local
non-accumulative
```

No persistent environmental simulation state may emerge from silhouette systems.

Replace prohibited terminology:

| Forbidden | Allowed |
|---|---|
| glow memory | residual atmospheric persistence |
| harbor memory | atmospheric persistence |
| motion personality | motion readability |
| directional confidence | heading stability bias |

---

# 17. Light Readability Doctrine

At FAR and ATMOSPHERIC bands:

```text
light spacing becomes the vessel
```

Hull readability becomes secondary.

Examples:

| Vessel Type | Far-Light Readability |
|---|---|
| tug | clustered dense glints |
| ferry | elongated bilateral spacing |
| cargo | distributed staggered chain |
| recreational | narrow directional spacing |
| passenger | broad layered occupancy glow |

---

# 18. Motion Readability

Motion differentiation must emerge from:

- heading stability
- inertia smoothing
- wake readability
- turn softness
- directional persistence

NOT from:

- animation exaggeration
- behavioral implication
- gameplay semantics
- procedural chaos
- cartoon oscillation

These characteristics are:

```text
presentation interpretations only
```

They must NOT imply runtime behavioral state.

---

# 19. Validation Vessel Immunity

Validation/debug vessels may bypass:

- atmospheric suppression
- silhouette degradation
- drift modulation
- readability reduction
- distance degradation

Only when their validation status originates from renderer-authorized diagnostic tooling.

This preserves diagnostic authority.

It does not create a general escape hatch for runtime vessels.

---

# 20. Determinism Rules

Allowed:

- deterministic seeded offsets
- stable ID-derived spacing
- repeatable degradation
- bounded mathematical modulation

Forbidden:

- `Math.random()`
- non-repeatable variance
- frame-dependent instability
- runtime entropy

---

# 21. Distance Collapse Rules

## HERO / NEAR

Allowed:

- full silhouette readability
- class-specific weighting
- wake readability differentiation

---

## MID

Allowed:

- reduced structural distinction
- moderate simplification
- reduced wake readability

---

## FAR

Allowed:

- light-spacing readability
- atmospheric mass implication
- reduced hull readability

---

## ATMOSPHERIC

Allowed:

- light spacing only
- minimal atmospheric implication
- no readable hull identity

---

# 22. Public API

```ts
function resolveSilhouetteProfile(
  input: MaritimeSilhouetteInput
): MaritimeSilhouetteProfile;

function resolveSilhouetteClass(
  vesselClass: string,
  vesselState?: string | null
): MaritimeSilhouetteClass;

function getSilhouetteConstants(): object;

function getSilhouetteProfiles(): Readonly<
  Record<MaritimeSilhouetteClass, MaritimeSilhouetteProfile>
>;
```

Runtime namespace:

```ts
SBE.MaritimeSilhouetteDifferentiation
```

Debug namespace:

```ts
_wos.silhouetteDifferentiation
```

---

# 23. Debug API

```ts
_wos.silhouetteDifferentiation.inspect("cargo")
_wos.silhouetteDifferentiation.preview("ferry")
_wos.silhouetteDifferentiation.compare("cargo", "tug")
_wos.silhouetteDifferentiation.matrix()
_wos.silhouetteDifferentiation.constants()
```

Debug tooling must remain observational only.

Debug tooling must not mutate live presentation envelopes during runtime execution.

Debug tooling may inspect but not author authoritative runtime presentation state.

---

# 24. Debug Matrix Contract

`.matrix()` returns:

```ts
Array<{
  classKey: MaritimeSilhouetteClass;
  distanceBand: DistanceBand;
  visibilityClass: VisibilityClass;
  hullAspectBias: number;
  atmosphericMassBias: number;
  wakeReadabilityScale: number;
  farLightSpacing: number;
}>;
```

Axes:

```text
rows = canonical vessel classes
columns = distance bands
```

Purpose:

```text
observability inspection only
```

---

# 25. Integration Rules

This system modulates presentation interpretation only.

It must NEVER override:

- MaritimeWakeAuthority
- MaritimeDistanceAtmosphere
- MaritimeLightAuthority
- VisibilityClassRuntime
- ProceduralVesselTopology

This system consumes upstream authority outputs and applies presentation-readability interpretation afterward.

Preferred integration language:

```text
Consumes upstream presentation envelopes prior to final renderer observation.
```

Avoid wording that implies renderer sequencing ownership.

---

# 26. Renderer Constraints

The following are permanently forbidden:

- ship texture packs
- realistic ship models
- explicit commercial branding
- minimap iconography
- MMO presentation semantics
- cinematic flare abuse
- procedural ocean simulation
- fake AIS identities

---

# 27. Implementation Scope

Create:

```text
wall/systems/presentation/maritimeSilhouetteDifferentiation.js
wall/systems/presentation/maritimeSilhouetteDifferentiationDebug.js
```

Patch:

```text
wall/render/maritimeOccupancyRenderer.js
wall/index.html
```

Minimum build behavior:

- runtime namespace exists
- debug namespace exists
- all canonical profiles exist
- profile resolver returns immutable object
- validation entity governance is enforced
- distance degradation works
- visibility suppression works
- no runtime truth mutation
- no topology registry mutation
- no wake authority mutation
- no light authority mutation

---

# 28. Success Criteria

The system succeeds when:

- distant vessels feel atmospherically distinct
- vessel classes remain lightweight
- harbor occupancy feels inhabited
- light spacing communicates presence
- zoom transitions alter observability hierarchy
- renderer complexity remains low
- atmosphere increases without realism collapse

---

# 29. Failure Conditions

The system fails if:

- vessels resemble game icons
- categories become literal
- silhouettes require textures
- rendering becomes noisy
- persistence becomes accumulative
- atmosphere implies narrative authority
- presentation mutates runtime truth
- validation immunity becomes a general suppression bypass
- silhouette profiles override topology authority
- silhouette profiles override light authority
- silhouette profiles override wake authority

---

# 30. Validation Checklist

- [ ] canonical taxonomy keys only
- [ ] no non-canonical vessel classes
- [ ] no distance/visibility authority conflation
- [ ] no runtime mutation
- [ ] no texture dependency
- [ ] no persistent environmental state
- [ ] no gameplay semantics
- [ ] deterministic only
- [ ] validation vessels bypass degradation only through renderer diagnostics
- [ ] public API declared
- [ ] TypeScript contracts defined
- [ ] full profile table exists
- [ ] `resolveSilhouetteProfile()` assembly flow defined
- [ ] validation entity governance defined
- [ ] authority boundaries explicit
- [ ] debug tools observational only
- [ ] topology ownership remains separate
- [ ] wake ownership remains separate
- [ ] light ownership remains separate

---

# 31. Non-Goals

This system does NOT implement:

- new topology primitives
- new light behavior
- new wake behavior
- WaterMemory resurrection
- environmental persistence
- 3D models
- sprite atlases
- commercial vessel assets
- gameplay classification
- navigation certainty
- AIS continuity changes

---

# 32. Final Doctrine

```text
The harbor should not feel rendered.

It should feel occupied.
```

---

# 33. Final Status

```text
0526H_WOS_MaritimeSilhouetteDifferentiation_v1.0.2
```

Status:

```text
[BUILD]
```

Freeze Decision:

```text
GO
```

Classification:

```text
interpretation-layer
```

Build Scope:

```text
stateless silhouette readability profiles, canonical taxonomy mapping, deterministic profile resolution, distance/visibility degradation, validation diagnostics governance, no runtime truth mutation
```

Final instruction:

```text
Proceed to implementation.
```

---

# Implementation Guide

- Create `wall/systems/presentation/maritimeSilhouetteDifferentiation.js` and `wall/systems/presentation/maritimeSilhouetteDifferentiationDebug.js`.
- Integrate by consuming upstream visibility/distance/light/wake context before final renderer observation; do not give this system renderer sequencing authority.
- Expect vessel readability to emerge from silhouette weighting, mass implication, and light-spacing hierarchy without textures, fake identities, or runtime mutation.
