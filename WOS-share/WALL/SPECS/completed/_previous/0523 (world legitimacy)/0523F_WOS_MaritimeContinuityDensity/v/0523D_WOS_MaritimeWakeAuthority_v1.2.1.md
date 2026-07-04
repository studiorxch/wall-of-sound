---
title: "WOS Maritime Wake Authority"
filename: "0523D_WOS_MaritimeWakeAuthority_v1.2.1.md"
version: "1.2.1"
date: "2026-05-24"
system: "WOS"
module: "Maritime Wake Authority"
type: "runtime-memory-spec"

status: "[BUILD]"
stage: "[BUILD]"
freeze_decision: "GO"

build_scope: "deterministic-wake-memory-only"
owner: "StudioRich / WOS"

supersedes:
  - "0523D_WOS_MaritimeWakeAuthority_v1.0.0"
  - "0523D_WOS_MaritimeWakeAuthority_v1.1.0"
  - "0523D_WOS_MaritimeWakeAuthority_v1.2.0"

depends_on:
  - "0522O_WOS_MaritimeMotionAuthority_v1.0.0"
  - "0522P_WOS_AISRuntimeContinuity_v1.0.0"
  - "0523A_WOS_MaritimeVesselTaxonomyProfiles_v1.2.2"
  - "0523B_WOS_MaritimePopulationHierarchy_v1.1.0"
  - "0523C_WOS_MaritimeSpawnEcology_v1.2.1"
  - "0523R_WOS_InfrastructureRegistry_v1.2.3"
---

# 🚦 SPEC STAGE

Stage: [BUILD]
Freeze Decision: GO
Action: Approved for deterministic wake-memory implementation.

---

# 1. Core Doctrine

WakeAuthority owns wake memory.

WakeAuthority does NOT own:
- vessel truth
- vessel lifecycle
- vessel density
- atmospheric readability
- camera behavior
- renderer authority

Canonical doctrine:

```text
WakeAuthority may preserve water memory.
WakeAuthority may never mutate maritime truth.
```

---

# 2. Runtime Authority Boundaries

```text
AISRuntime owns vessel truth.
PopulationHierarchy owns tier assignment.
SpawnEcology owns synthetic ecology.
WakeAuthority owns wake memory.
AtmosphericReadability owns visibility interpretation.
Renderer owns presentation.
```

WakeAuthority is a deterministic memory layer.

It may not:
- rewrite AIS telemetry
- mutate vessel lifecycle
- promote vessels
- suppress vessels
- alter spawn cadence
- alter camera targeting

---

# 3. Wake Segment Ownership

WakeAuthority owns:

- wake segment allocation
- wake segment decay
- wake segment ring buffering
- wake continuity memory
- wake intensity projection
- wake provenance tracking

WakeAuthority may observe:
- vessel position
- vessel heading
- vessel speed
- vessel taxonomy
- vessel population tier
- simulation time

WakeAuthority may NOT mutate:
- vessel coordinates
- vessel speed
- vessel lifecycle
- vessel class
- renderer buffers
- AIS confidence

---

# 4. Provenance Supremacy

AIS-derived wake memory has constitutional priority over synthetic wake memory.

Canonical rule:

```text
Synthetic wake memory may never evict AIS-derived wake memory.
```

If wake budgets saturate:

1. Synthetic wake segments are evicted first
2. Synthetic wake insertions may fail
3. AIS wake continuity remains protected

WakeAuthority may never:
- downgrade AIS wake provenance
- convert AIS wake memory into synthetic memory
- collapse provenance categories

---

# 5. Wake Provenance Model

```ts
type WakeProvenance =
  | "AIS_VESSEL"
  | "SYNTHETIC_ECOLOGY";
```

Wake provenance is immutable after creation.

Wake provenance may not change during:
- decay
- coasting
- replay
- continuity recovery
- ring-buffer relocation

---

# 6. Wake Identity Stability

Wake identity must remain deterministic.

Canonical format:

```text
wake::<vesselId>::<simulationTimeMs>
```

Forbidden:
- UUIDs
- Date.now()
- Math.random()

Wake identity may not change:
- after insertion
- during replay
- during decay
- during migration between buffers

---

# 7. Wake Class Canonicalization

WakeAuthority does NOT define an independent wake class taxonomy.

WakeAuthority consumes canonical wake-class projections from:

```text
0523A_WOS_MaritimeVesselTaxonomyProfiles
```

Bridge function:

```ts
resolveWakeAuthorityClass(vesselClass)
```

Canonical mapping:

| Taxonomy Wake Class | WakeAuthority Class |
|---|---|
| WAKE_NONE | NONE |
| WAKE_NARROW | MINIMAL |
| WAKE_STANDARD | STANDARD |
| WAKE_WIDE | STANDARD |
| WAKE_HEAVY | HEAVY |
| WAKE_TURBULENT | HEAVY |

WakeAuthority may not redefine this mapping internally.

No magic-number wake mapping is permitted.

---

# 8. Ring Buffer Governance

WakeAuthority uses a deterministic fixed-size ring buffer.

Canonical requirements:

- O(1) insertion
- deterministic eviction
- replay-safe ordering
- simulation-time ordering only

Canonical insertion behavior:

```text
new insertion
→ overwrite oldest eligible slot
→ deterministic eviction
```

Forbidden:
- dynamic array growth
- adaptive resizing
- renderer-driven eviction
- camera-driven retention

---

# 9. Mutable Runtime Segment State

Wake segment structs contain limited mutable runtime fields.

The following fields are permitted to mutate:

```ts
parentEvicted: boolean
expiresAtMs: number
```

These mutations are allowed ONLY for:
- deterministic decay
- deterministic parent eviction compression

All identity/provenance fields remain immutable.

---

# 10. Parent Eviction Compression

When a parent vessel is evicted or removed:

WakeAuthority may:
- compress remaining wake lifetime
- flag parentEvicted = true

WakeAuthority may NOT:
- instantly erase wake memory
- fabricate wake continuity
- extend wake lifetime

Canonical compression rule:

```text
remainingLifetime / 4
```

This preserves short-lived atmospheric residue.

---

# 11. AIS Gap Handling

AIS signal gaps must not fabricate wake continuity.

When AIS continuity breaks:

```text
lastEndLatLng reset
→ next wake begins as fresh seed segment
```

Forbidden:
- wake bridging across AIS gaps
- extrapolated wake stitching
- synthetic continuity fabrication

---

# 12. Determinism Requirements

Forbidden:
- Date.now()
- performance.now()
- Math.random()
- renderer reads
- camera reads
- DOM timing reads

Allowed:
- simulationTimeMs
- deterministic scalar math
- taxonomy snapshots
- AIS snapshots
- tier snapshots

---

# 13. Wake Input Contract

```ts
type WakeAuthorityInput = {
  readonly vesselId: string;

  readonly vesselClass: string;

  readonly provenance:
    | "AIS_VESSEL"
    | "SYNTHETIC_ECOLOGY";

  readonly populationTier:
    | "HERO"
    | "MID"
    | "BACKGROUND"
    | "GHOST";

  readonly lat: number;
  readonly lng: number;

  readonly headingDeg: number;
  readonly speedKts: number;

  readonly simulationTimeMs: number;
};
```

---

# 14. Wake Segment Contract

```ts
type WakeSegment = {
  readonly wakeId: string;

  readonly vesselId: string;

  readonly provenance:
    | "AIS_VESSEL"
    | "SYNTHETIC_ECOLOGY";

  readonly wakeClass:
    | "NONE"
    | "MINIMAL"
    | "STANDARD"
    | "HEAVY";

  readonly startLat: number;
  readonly startLng: number;

  readonly endLat: number;
  readonly endLng: number;

  readonly createdAtMs: number;

  expiresAtMs: number;

  readonly intensityRaw: number;

  parentEvicted: boolean;
};
```

---

# 15. Synthetic Wake Budget Protection

Synthetic wakes must respect independent synthetic sub-budgets.

Canonical rule:

```text
Synthetic ecology may fail gracefully.
AIS wake continuity may not fail because of synthetic occupancy.
```

Synthetic wake rejection is permitted.

AIS wake rejection due to synthetic occupancy is forbidden.

---

# 16. Wake Lifetime Rules

Canonical maximum lifetime:

```ts
const WAKE_MAX_LIFETIME_MS = 1800000;
```

Tier guidance:

| Tier | Lifetime |
|---|---|
| HERO | 30 min |
| MID | 15 min |
| BACKGROUND | 5 min |
| GHOST | minimal |

Synthetic wakes:
```text
0.75 × canonical tier lifetime
```

WakeAuthority may not extend lifetime dynamically.

---

# 17. Public Functions

```ts
function emitWakeSegment(
  input: WakeAuthorityInput
): WakeSegment | null;
```

Deterministic.

---

```ts
function decayWakeSegments(
  simulationTimeMs: number
): void;
```

Deterministic.

---

```ts
function notifyAISSignalGap(
  vesselId: string
): void;
```

Deterministic.

---

```ts
function notifyVesselEvicted(
  vesselId: string,
  simulationTimeMs: number
): void;
```

Deterministic.

---

# 18. Validation Checklist

- [ ] WakeAuthority never mutates AIS truth
- [ ] WakeAuthority never mutates lifecycle state
- [ ] WakeAuthority never mutates vessel motion
- [ ] WakeAuthority never mutates population hierarchy
- [ ] WakeAuthority never mutates renderer buffers
- [ ] Wake provenance remains immutable
- [ ] Synthetic wakes cannot evict AIS wakes
- [ ] Wake identity remains deterministic
- [ ] No magic-number wake mappings
- [ ] No renderer-driven wake eviction
- [ ] No camera-driven wake retention
- [ ] No fabricated wake continuity
- [ ] Ring buffer remains deterministic
- [ ] No Date.now()
- [ ] No Math.random()
- [ ] Wake decay uses simulation time only

---

# 19. Build Readiness

```text
Stage: [BUILD]
Freeze Decision: GO
```

0523D v1.2.1 resolves:
- provenance-aware eviction ordering
- wake-class canonicalization
- mutable runtime-state clarification
- deterministic wake identity guarantees

This spec is approved for:
```text
deterministic wake-memory infrastructure
```

---

# 20. Suggested Runtime Files

```text
wall/
  systems/
    world/
      wakeAuthority.js
```

Optional:

```text
wall/
  systems/
    world/
      wakeAuthorityDebug.js
```

---

# 21. Canonical Artifact Rule

This is a complete standalone canonical artifact.

Patch releases must remain reconstructable without prior versions.

Partial-file patch releases are forbidden.

---

# 22. Implementation Guide

- **Where this goes:** `wall/systems/world/wakeAuthority.js`
- **What to run:** deterministic wake emission + decay using simulationTimeMs and provenance-aware ring buffering
- **What to expect:** replay-safe harbor wake memory that preserves AIS supremacy and atmospheric continuity without mutating maritime truth
