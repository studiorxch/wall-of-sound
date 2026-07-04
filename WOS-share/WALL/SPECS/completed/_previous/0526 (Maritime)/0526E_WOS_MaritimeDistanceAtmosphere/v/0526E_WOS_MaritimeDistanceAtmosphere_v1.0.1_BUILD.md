---
layout: spec

title: "WOS Maritime Distance Atmosphere"
date: 2026-05-27
doc_id: "0526E_WOS_MaritimeDistanceAtmosphere_v1.0.1"
version: "1.0.1"

project: "Wall of Sound"
system: "WOS"

domain: "presentation"
component: "MaritimeDistanceAtmosphere"

type: "runtime-presentation-spec"
status: "approved"

priority: "high"
risk: "medium"

classification: "presentation-layer"

summary: "Build-ready maritime distance-atmosphere specification for stateless presentation compression, distance-band hierarchy, visibility-class suppression, far-light preservation, label/hover suppression, and topology/wake LOD hints."

stage: "[BUILD]"
freeze_decision: "GO"
build_scope: "maritime-distance-depth-atmospheric-compression"

depends_on:
  - "0525A_WOS_MapStyleAuthority_v1.0.2"
  - "0525B_WOS_MaritimeStyleRegistry_v1.0.1"
  - "0525D_WOS_SurfaceStylePresets_v1.0.1"
  - "0525E_WOS_VisibilityClassRuntime_v1.0.0"
  - "0525F_WOS_ProceduralVesselTopology_v1.0.1"
  - "0526C_WOS_ActiveWakePolish_v1.0.1"

related:
  - "0526D_WOS_MaritimeSurfaceInteraction_v1.0.0"

supersedes:
  - "0526E_WOS_MaritimeDistanceAtmosphere_v1.0.0"

owner: "StudioRich / WOS"
---

# 🚦 SPEC STAGE

Stage: [BUILD]  
Freeze Decision: GO  
Action: Implement stateless maritime distance-atmosphere envelopes for depth hierarchy, visibility suppression, wake reduction, topology LOD hints, light preservation, label/hover suppression, and debug matrix inspection.

# 0526E_WOS_MaritimeDistanceAtmosphere_v1.0.1_BUILD

## Canonical Artifact Rule

This is the full standalone BUILD artifact for:

```text
0526E_WOS_MaritimeDistanceAtmosphere_v1.0.1
```

This version supersedes:

```text
0526E_WOS_MaritimeDistanceAtmosphere_v1.0.0
```

v1.0.1 resolves review blockers:

- defines `resolveDistanceEnvelope()` reference logic
- replaces freeform `reason: string` with typed `reasonCode`
- defines `MaritimeDistanceReasonCode`
- tightens loose input strings with canonical local type aliases
- defines `_wos.distanceAtmosphere.matrix()` return structure
- clarifies focus-anchor ownership
- clarifies renderer sequencing ownership
- blocks global-observability middleware creep
- states screen-space distance is a temporary v1 heuristic
- states `applyVisibilityClassToEnvelope()` returns a new immutable envelope

---

# 1. Purpose

Define the build-ready maritime distance-atmosphere system for WOS.

This system establishes how maritime objects lose detail, soften, compress, fade, and blend into the world as distance increases.

The goal is to move the harbor from:

```text
flat visible objects over a map
```

toward:

```text
layered atmospheric water space
```

This specification does not add:

- new boat types
- new wake modes
- WaterMemory accumulation
- fluid simulation
- fog rendering
- camera orchestration
- gameplay visibility

It defines a stateless, per-vessel, per-frame presentation envelope.

---

# 2. Core Doctrine

```text
Distance is presentation truth.

It is not simulation truth.
```

```text
Distance atmosphere interprets visibility.

It does not define reality.
```

```text
MaritimeDistanceAtmosphere governs presentation compression only.

It is not a global observability authority.
```

DistanceAtmosphere may alter:

- alpha
- contrast
- detail visibility
- glow strength
- label visibility
- wake visibility
- topology LOD hints
- far-light treatment
- haze/fog compression

It may not alter:

- AIS truth
- vessel existence
- vessel position
- vessel speed
- vessel heading
- vessel class truth
- population tier
- camera state
- runtime continuity

---

# 3. Focus-Anchor Governance

DistanceAtmosphere consumes externally resolved focus anchors.

It does not determine focal authority.

Focus-anchor resolution belongs to orchestration systems outside this spec.

For v1.0.1, the default focus anchor is:

```text
viewport center
```

This is a temporary presentation heuristic.

Future systems may provide a resolved focus anchor from:

- camera focus
- selected vessel
- director-mode focal subject
- route progress anchor
- cinematic camera state

But those systems must pass the focus anchor into this module.

DistanceAtmosphere must not choose or mutate focus authority.

---

# 4. Renderer Governance

DistanceAtmosphere exposes passive presentation envelopes.

Renderer sequencing ownership remains external.

The renderer may call DistanceAtmosphere once per vessel per frame and pass the returned envelope to downstream presentation systems.

DistanceAtmosphere must not:

- reorder render passes
- own draw sequencing
- mutate renderer state
- decide camera targets
- decide global render orchestration

Canonical rule:

```text
DistanceAtmosphere returns envelope data.

The renderer owns when and how it consumes that data.
```

---

# 5. Anti-Middleware Containment

MaritimeDistanceAtmosphere is not a global observability middleware layer.

It must not expand into:

- AI perception
- gameplay visibility
- audio attenuation
- event prioritization
- tactical awareness
- stealth logic
- route authority
- camera scoring
- narrative importance
- entity targeting

It governs only maritime presentation compression.

---

# 6. Authority Boundaries

## MaritimeDistanceAtmosphere Owns

- distance envelope calculation
- far/mid/near presentation bands
- atmospheric alpha compression
- detail suppression rules
- wake suppression rules
- light-softening rules
- label suppression rules
- hover-card distance policy
- far-vessel abstraction rules
- depth-fog blending inputs
- debug matrix sampling contract

## MaritimeDistanceAtmosphere May Observe

- projected vessel screen position
- externally resolved focus anchor
- renderer zoom / observability input
- viewport dimensions
- visibility class
- population tier
- vessel class
- Surface preset context
- fog/haze state
- density pressure
- renderer pass context

## MaritimeDistanceAtmosphere May Produce

- `MaritimeDistanceEnvelope`
- `VesselDistancePresentation`
- `MaritimeDistanceBand`
- opacity multipliers
- topology LOD hints
- wake suppression factors
- light damping factors
- label eligibility flags
- hover eligibility flags
- debug matrix cells

## MaritimeDistanceAtmosphere May NOT Mutate

- AIS state
- vessel truth
- vessel lifecycle
- camera state
- map projection
- renderer orchestration
- visibility class
- population tier
- wake authority
- topology blueprint
- style registry
- Surface preset state
- WaterMemory state

---

# 7. Authority Relationships

## Reads From

- VisibilityClassRuntime
- MaritimeStyleRegistry
- SurfaceStylePresetRuntime
- renderer zoom / observability input
- projected vessel coordinates
- viewport dimensions
- externally resolved focus anchor
- atmosphere/fog context
- population hierarchy output

## Writes To

```text
none
```

The module returns presentation data only.

## Observed By

- MaritimeOccupancyRenderer
- MaritimeWakeSignature
- ProceduralVesselTopology
- hover-card renderer
- label renderer
- far-light renderer
- debug tools

## Forbidden Mutations

- runtime vessel truth
- AIS continuity
- camera focus
- route geometry
- map projection
- style registry values
- global rendering order
- WaterMemory state

---

# 8. Canonical Types

## MaritimeDistanceBand

```ts
type MaritimeDistanceBand =
  | "HERO"
  | "NEAR"
  | "MID"
  | "FAR"
  | "ATMOSPHERIC";
```

Note:

`HERO` remains as the v1.0.1 canonical band name for compatibility with existing population-tier language.

Runtime-facing descriptions should prefer:

```text
foreground / primary / close-focus
```

where possible.

---

## Canonical Local Type Aliases

These aliases prevent loose strings in the public contract while still allowing implementation inside the current vanilla JS runtime.

```ts
type MaritimeDistanceVesselClass =
  | "cargo"
  | "tanker"
  | "ferry"
  | "tug"
  | "recreational"
  | "fishing"
  | "passenger"
  | "military"
  | "industrial"
  | "service"
  | "unknown"
  | "default";

type MaritimeDistancePopulationTier =
  | "HERO"
  | "MID"
  | "BACKGROUND"
  | "GHOST"
  | null;

type MaritimeDistanceVisibilityClass =
  | "ATMOSPHERIC_HIDDEN"
  | "LIGHT_ONLY"
  | "MARKER_ONLY"
  | "SILHOUETTE"
  | "REDUCED"
  | "FULL"
  | null;
```

---

## MaritimeDistanceReasonCode

Freeform runtime reason strings are forbidden.

Use deterministic reason codes.

```ts
type MaritimeDistanceReasonCode =
  | "DISTANCE_HERO"
  | "DISTANCE_NEAR"
  | "DISTANCE_MID"
  | "DISTANCE_FAR"
  | "DISTANCE_ATMOSPHERIC"
  | "VISIBILITY_ATMOSPHERIC_HIDDEN"
  | "VISIBILITY_LIGHT_ONLY"
  | "VISIBILITY_MARKER_ONLY"
  | "VISIBILITY_SILHOUETTE"
  | "VISIBILITY_REDUCED"
  | "VISIBILITY_FULL"
  | "FALLBACK_INVALID_INPUT"
  | "FALLBACK_MISSING_VIEWPORT"
  | "FALLBACK_MISSING_ZOOM";
```

---

# 9. Data Model

```ts
type MaritimeDistanceEnvelope = {
  readonly version: "1.0.1";

  readonly band: MaritimeDistanceBand;
  readonly reasonCode: MaritimeDistanceReasonCode;

  readonly distanceNorm: number;
  readonly zoomNorm: number;
  readonly atmosphereNorm: number;

  readonly vesselAlpha: number;
  readonly topologyAlpha: number;
  readonly wakeAlpha: number;
  readonly lightAlpha: number;
  readonly labelAlpha: number;
  readonly hoverAlpha: number;

  readonly topologyDetailScale: number;
  readonly wakeDetailScale: number;
  readonly lightBloomScale: number;

  readonly topologyLodHint:
    | "CLOSE_DETAIL"
    | "TOPOLOGY"
    | "SILHOUETTE"
    | "MARKER"
    | "LIGHT"
    | "NONE";

  readonly allowWake: boolean;
  readonly allowTopology: boolean;
  readonly allowLabel: boolean;
  readonly allowHover: boolean;
  readonly allowNavLights: boolean;
  readonly allowFarLight: boolean;
};

type MaritimeDistanceInput = {
  readonly vesselId?: string | null;
  readonly vesselClass: MaritimeDistanceVesselClass;
  readonly populationTier: MaritimeDistancePopulationTier;

  readonly screenX: number;
  readonly screenY: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;

  readonly focusX?: number | null;
  readonly focusY?: number | null;

  readonly zoom: number;
  readonly visibilityClass: MaritimeDistanceVisibilityClass;

  readonly fogAlpha?: number;
  readonly hazeAlpha?: number;
  readonly densityPressure?: number;
};
```

---

# 10. Debug Matrix Contract

`_wos.distanceAtmosphere.matrix()` must return a deterministic 2D grid of sampled envelopes.

```ts
type DistanceMatrixCell = {
  readonly row: number;
  readonly col: number;
  readonly x: number;
  readonly y: number;
  readonly band: MaritimeDistanceBand;
  readonly reasonCode: MaritimeDistanceReasonCode;
  readonly distanceNorm: number;
  readonly vesselAlpha: number;
  readonly topologyAlpha: number;
  readonly wakeAlpha: number;
  readonly lightAlpha: number;
  readonly labelAlpha: number;
  readonly allowWake: boolean;
  readonly allowLabel: boolean;
  readonly allowFarLight: boolean;
};

type DistanceMatrix = {
  readonly version: "1.0.1";
  readonly rows: number;
  readonly cols: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly zoom: number;
  readonly cells: readonly DistanceMatrixCell[][];
};
```

Default matrix size:

```text
5 rows × 5 columns
```

The matrix is debug-only and observational.

It must not mutate runtime state.

---

# 11. System Constants

```ts
const MARITIME_DISTANCE_ATMOSPHERE_VERSION = "1.0.1";

const HERO_RADIUS_NORM = 0.12;
const NEAR_RADIUS_NORM = 0.24;
const MID_RADIUS_NORM = 0.46;
const FAR_RADIUS_NORM = 0.72;

const DEFAULT_FOG_WEIGHT = 0.45;
const DEFAULT_HAZE_WEIGHT = 0.35;
const DEFAULT_DENSITY_WEIGHT = 0.25;

const MIN_ATMOSPHERIC_ALPHA = 0.04;
const MAX_FAR_LIGHT_ALPHA = 0.55;

const FAR_WAKE_SUPPRESSION = 0.12;
const ATMOSPHERIC_WAKE_SUPPRESSION = 0.0;

const DEFAULT_MATRIX_ROWS = 5;
const DEFAULT_MATRIX_COLS = 5;
```

---

# 12. Distance Bands

The system defines five canonical distance bands.

## HERO

The vessel is visually important.

Allowed:

- full topology detail
- class-specific active wake
- labels if enabled
- hover card
- nav lights
- strongest contrast

## NEAR

The vessel is readable.

Allowed:

- topology detail
- simple wake
- nav lights
- labels if enabled
- moderate contrast

## MID

The vessel is present but secondary.

Allowed:

- silhouette
- reduced topology
- minimal wake
- reduced lighting
- no hover unless actively selected by a separate authorized UI system

## FAR

The vessel becomes atmosphere.

Allowed:

- silhouette or marker
- tiny far light
- no active wake except faint direction trace if explicitly allowed by renderer
- no label
- no hover card
- low contrast

## ATMOSPHERIC

The vessel becomes mostly signal.

Allowed:

- twinkle/light only
- marker only if needed
- no wake
- no topology detail
- no label
- no hover

---

# 13. Alpha Matrix

Base alpha by band:

| Band | Vessel | Topology | Wake | Light | Label | Hover |
|---|---:|---:|---:|---:|---:|---:|
| HERO | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| NEAR | 0.88 | 0.88 | 0.72 | 0.90 | 0.80 | 0.75 |
| MID | 0.62 | 0.48 | 0.32 | 0.72 | 0.20 | 0.00 |
| FAR | 0.32 | 0.18 | 0.08 | 0.55 | 0.00 | 0.00 |
| ATMOSPHERIC | 0.10 | 0.00 | 0.00 | 0.35 | 0.00 | 0.00 |

Fog/haze/density may only reduce these values.

---

# 14. Distance Calculation

Distance is calculated from normalized screen-space distance to the externally resolved focus anchor.

For v1.0.1:

```text
if no focus anchor is supplied, viewport center is used
```

Screen-space distance is a temporary presentation heuristic for v1.

DistanceAtmosphere does not own long-term observability geography.

Reference:

```ts
function resolveDistanceNorm(input: MaritimeDistanceInput): number {
  const fx = typeof input.focusX === "number"
    ? input.focusX
    : input.viewportWidth * 0.5;

  const fy = typeof input.focusY === "number"
    ? input.focusY
    : input.viewportHeight * 0.5;

  const dx = input.screenX - fx;
  const dy = input.screenY - fy;

  const maxX = Math.max(fx, input.viewportWidth - fx);
  const maxY = Math.max(fy, input.viewportHeight - fy);
  const maxD = Math.sqrt(maxX * maxX + maxY * maxY);

  if (maxD <= 0) return 0.5;

  return clamp01(Math.sqrt(dx * dx + dy * dy) / maxD);
}
```

---

# 15. Band Resolution

```ts
function resolveDistanceBand(distanceNorm: number): MaritimeDistanceBand {
  if (distanceNorm <= HERO_RADIUS_NORM) return "HERO";
  if (distanceNorm <= NEAR_RADIUS_NORM) return "NEAR";
  if (distanceNorm <= MID_RADIUS_NORM) return "MID";
  if (distanceNorm <= FAR_RADIUS_NORM) return "FAR";
  return "ATMOSPHERIC";
}
```

---

# 16. Reason Code Resolution

```ts
function reasonCodeForBand(
  band: MaritimeDistanceBand
): MaritimeDistanceReasonCode {
  switch (band) {
    case "HERO": return "DISTANCE_HERO";
    case "NEAR": return "DISTANCE_NEAR";
    case "MID": return "DISTANCE_MID";
    case "FAR": return "DISTANCE_FAR";
    case "ATMOSPHERIC": return "DISTANCE_ATMOSPHERIC";
    default: return "FALLBACK_INVALID_INPUT";
  }
}
```

---

# 17. Atmosphere Compression

Atmosphere factor:

```ts
function resolveAtmosphereNorm(input: MaritimeDistanceInput): number {
  const fog = clamp01(input.fogAlpha ?? 0);
  const haze = clamp01(input.hazeAlpha ?? 0);
  const density = clamp01(input.densityPressure ?? 0);

  return clamp01(
    fog * DEFAULT_FOG_WEIGHT +
    haze * DEFAULT_HAZE_WEIGHT +
    density * DEFAULT_DENSITY_WEIGHT
  );
}
```

Compression applies as a reducer:

```ts
const atmosphereFactor = 1 - atmosphereNorm * 0.6;
```

Atmosphere compression may preserve:

- tiny far lights
- subtle twinkles
- silhouette hints

Atmosphere compression must reduce:

- vessel alpha
- topology detail
- wake alpha
- label eligibility
- hover eligibility
- glow intensity

---

# 18. Reference resolveDistanceEnvelope()

This is the primary public API.

It must be reconstructable from this spec.

```ts
function resolveDistanceEnvelope(
  input: MaritimeDistanceInput
): MaritimeDistanceEnvelope {
  if (!input) {
    return getFallbackEnvelope("FALLBACK_INVALID_INPUT");
  }

  if (
    typeof input.viewportWidth !== "number" ||
    typeof input.viewportHeight !== "number" ||
    input.viewportWidth <= 0 ||
    input.viewportHeight <= 0
  ) {
    return getFallbackEnvelope("FALLBACK_MISSING_VIEWPORT");
  }

  if (typeof input.zoom !== "number") {
    return getFallbackEnvelope("FALLBACK_MISSING_ZOOM");
  }

  const distanceNorm = resolveDistanceNorm(input);
  const band = resolveDistanceBand(distanceNorm);
  const atmosphereNorm = resolveAtmosphereNorm(input);
  const zoomNorm = clamp01((input.zoom - 8) / 12);

  const base = ALPHA_BY_BAND[band];
  const detail = DETAIL_BY_BAND[band];
  const reasonCode = reasonCodeForBand(band);

  const atmosphereFactor = clamp01(1 - atmosphereNorm * 0.6);

  const envelope: MaritimeDistanceEnvelope = Object.freeze({
    version: "1.0.1",
    band,
    reasonCode,

    distanceNorm,
    zoomNorm,
    atmosphereNorm,

    vesselAlpha: clamp01(base.vessel * atmosphereFactor),
    topologyAlpha: clamp01(base.topology * atmosphereFactor),
    wakeAlpha: clamp01(base.wake * atmosphereFactor),
    lightAlpha: clamp01(Math.min(base.light, MAX_FAR_LIGHT_ALPHA)),
    labelAlpha: clamp01(base.label * atmosphereFactor),
    hoverAlpha: clamp01(base.hover * atmosphereFactor),

    topologyDetailScale: detail.topologyDetailScale,
    wakeDetailScale: detail.wakeDetailScale,
    lightBloomScale: detail.lightBloomScale,

    topologyLodHint: detail.topologyLodHint,

    allowWake: base.wake > 0.02 && band !== "ATMOSPHERIC",
    allowTopology: base.topology > 0.02 && band !== "ATMOSPHERIC",
    allowLabel: base.label > 0.05 && (band === "HERO" || band === "NEAR"),
    allowHover: base.hover > 0.05 && band === "HERO",
    allowNavLights: base.light > 0.30 && (band === "HERO" || band === "NEAR" || band === "MID"),
    allowFarLight: base.light > 0.10 && band !== "HERO",
  });

  return applyVisibilityClassToEnvelope(
    envelope,
    input.visibilityClass
  );
}
```

---

# 19. Base Tables

```ts
const ALPHA_BY_BAND = Object.freeze({
  HERO: {
    vessel: 1.00,
    topology: 1.00,
    wake: 1.00,
    light: 1.00,
    label: 1.00,
    hover: 1.00,
  },

  NEAR: {
    vessel: 0.88,
    topology: 0.88,
    wake: 0.72,
    light: 0.90,
    label: 0.80,
    hover: 0.75,
  },

  MID: {
    vessel: 0.62,
    topology: 0.48,
    wake: 0.32,
    light: 0.72,
    label: 0.20,
    hover: 0.00,
  },

  FAR: {
    vessel: 0.32,
    topology: 0.18,
    wake: 0.08,
    light: 0.55,
    label: 0.00,
    hover: 0.00,
  },

  ATMOSPHERIC: {
    vessel: 0.10,
    topology: 0.00,
    wake: 0.00,
    light: 0.35,
    label: 0.00,
    hover: 0.00,
  },
});
```

```ts
const DETAIL_BY_BAND = Object.freeze({
  HERO: {
    topologyDetailScale: 1.00,
    wakeDetailScale: 1.00,
    lightBloomScale: 1.00,
    topologyLodHint: "CLOSE_DETAIL",
  },

  NEAR: {
    topologyDetailScale: 0.88,
    wakeDetailScale: 0.72,
    lightBloomScale: 0.90,
    topologyLodHint: "TOPOLOGY",
  },

  MID: {
    topologyDetailScale: 0.48,
    wakeDetailScale: 0.32,
    lightBloomScale: 0.72,
    topologyLodHint: "SILHOUETTE",
  },

  FAR: {
    topologyDetailScale: 0.18,
    wakeDetailScale: 0.08,
    lightBloomScale: 0.55,
    topologyLodHint: "MARKER",
  },

  ATMOSPHERIC: {
    topologyDetailScale: 0.00,
    wakeDetailScale: 0.00,
    lightBloomScale: 0.35,
    topologyLodHint: "LIGHT",
  },
});
```

---

# 20. Visibility-Class Suppression

DistanceAtmosphere consumes `visibilityClass`.

It does not assign it.

Hard rule:

```text
DistanceAtmosphere may reduce visibility.
It may not elevate suppressed detail.
```

`applyVisibilityClassToEnvelope()` must return a new immutable envelope.

It must never mutate the input envelope in place.

```ts
function applyVisibilityClassToEnvelope(
  envelope: MaritimeDistanceEnvelope,
  visibilityClass: MaritimeDistanceVisibilityClass
): MaritimeDistanceEnvelope {
  if (!visibilityClass || visibilityClass === "FULL") {
    return envelope;
  }

  if (visibilityClass === "ATMOSPHERIC_HIDDEN") {
    return Object.freeze({
      ...envelope,
      reasonCode: "VISIBILITY_ATMOSPHERIC_HIDDEN",
      vesselAlpha: 0,
      topologyAlpha: 0,
      wakeAlpha: 0,
      lightAlpha: 0,
      labelAlpha: 0,
      hoverAlpha: 0,
      allowWake: false,
      allowTopology: false,
      allowLabel: false,
      allowHover: false,
      allowNavLights: false,
      allowFarLight: false,
      topologyLodHint: "NONE",
    });
  }

  if (visibilityClass === "LIGHT_ONLY") {
    return Object.freeze({
      ...envelope,
      reasonCode: "VISIBILITY_LIGHT_ONLY",
      vesselAlpha: 0,
      topologyAlpha: 0,
      wakeAlpha: 0,
      labelAlpha: 0,
      hoverAlpha: 0,
      allowWake: false,
      allowTopology: false,
      allowLabel: false,
      allowHover: false,
      allowNavLights: false,
      allowFarLight: envelope.lightAlpha > 0.05,
      topologyLodHint: "LIGHT",
    });
  }

  if (visibilityClass === "MARKER_ONLY") {
    return Object.freeze({
      ...envelope,
      reasonCode: "VISIBILITY_MARKER_ONLY",
      topologyAlpha: 0,
      wakeAlpha: 0,
      labelAlpha: 0,
      hoverAlpha: 0,
      topologyDetailScale: 0,
      wakeDetailScale: 0,
      allowWake: false,
      allowTopology: false,
      allowLabel: false,
      allowHover: false,
      allowNavLights: false,
      allowFarLight: envelope.lightAlpha > 0.05,
      topologyLodHint: "MARKER",
    });
  }

  if (visibilityClass === "SILHOUETTE") {
    return Object.freeze({
      ...envelope,
      reasonCode: "VISIBILITY_SILHOUETTE",
      topologyAlpha: Math.min(envelope.topologyAlpha, 0.32),
      wakeAlpha: Math.min(envelope.wakeAlpha, 0.08),
      labelAlpha: 0,
      hoverAlpha: 0,
      topologyDetailScale: Math.min(envelope.topologyDetailScale, 0.32),
      wakeDetailScale: Math.min(envelope.wakeDetailScale, 0.08),
      allowWake: envelope.wakeAlpha > 0.04 && envelope.band !== "FAR" && envelope.band !== "ATMOSPHERIC",
      allowLabel: false,
      allowHover: false,
      topologyLodHint: "SILHOUETTE",
    });
  }

  if (visibilityClass === "REDUCED") {
    return Object.freeze({
      ...envelope,
      reasonCode: "VISIBILITY_REDUCED",
      vesselAlpha: envelope.vesselAlpha * 0.72,
      topologyAlpha: envelope.topologyAlpha * 0.62,
      wakeAlpha: envelope.wakeAlpha * 0.42,
      labelAlpha: envelope.labelAlpha * 0.30,
      hoverAlpha: envelope.hoverAlpha * 0.20,
      topologyDetailScale: envelope.topologyDetailScale * 0.62,
      wakeDetailScale: envelope.wakeDetailScale * 0.42,
      allowLabel: envelope.allowLabel && envelope.band === "HERO",
      allowHover: false,
    });
  }

  return envelope;
}
```

---

# 21. Fallback Envelope

```ts
function getFallbackEnvelope(
  reasonCode: MaritimeDistanceReasonCode
): MaritimeDistanceEnvelope {
  return Object.freeze({
    version: "1.0.1",
    band: "ATMOSPHERIC",
    reasonCode,

    distanceNorm: 1.0,
    zoomNorm: 0.5,
    atmosphereNorm: 0.5,

    vesselAlpha: MIN_ATMOSPHERIC_ALPHA,
    topologyAlpha: 0,
    wakeAlpha: 0,
    lightAlpha: 0.20,
    labelAlpha: 0,
    hoverAlpha: 0,

    topologyDetailScale: 0,
    wakeDetailScale: 0,
    lightBloomScale: 0.10,

    topologyLodHint: "LIGHT",

    allowWake: false,
    allowTopology: false,
    allowLabel: false,
    allowHover: false,
    allowNavLights: false,
    allowFarLight: true,
  });
}
```

---

# 22. Population Tier Refinement

Population tier may refine but not replace distance band.

Rules:

- `HERO` tier in FAR may preserve `lightAlpha` and `allowFarLight`
- `HERO` tier in FAR may not force full topology detail
- `GHOST` tier in NEAR may suppress wake/detail, but may not erase actual vessel truth
- population tier must not mutate distance band

v1.0.1 optional multiplier:

```ts
const POPULATION_TIER_DETAIL_MULTIPLIER = Object.freeze({
  HERO: 1.00,
  MID: 0.90,
  BACKGROUND: 0.65,
  GHOST: 0.35,
});
```

This multiplier may apply only to:

- topologyDetailScale
- wakeDetailScale
- labelAlpha
- hoverAlpha

It may not alter:

- vessel existence
- coordinates
- distance band
- visibility class

---

# 23. Wake Suppression Policy

Wakes reduce aggressively with distance.

Rules:

- HERO: full active wake allowed
- NEAR: active wake allowed
- MID: wake reduced and simplified
- FAR: wake almost hidden
- ATMOSPHERIC: no wake

Wake suppression happens before drawing, not after drawing.

Renderer should avoid drawing wake geometry if:

```ts
allowWake === false
```

---

# 24. Light Policy

Distance does not remove all light.

It transforms vessels into atmosphere.

Far light behavior:

- FAR: tiny twinkle allowed
- ATMOSPHERIC: light-only signal allowed
- HERO/NEAR: nav lights allowed
- MID: reduced nav/far hybrid allowed

Rules:

```text
Far lights may remain alive.
Far lights may not become urgent.
```

No emergency coding.

No false operational meaning.

---

# 25. Label and Hover Policy

Labels and hover cards are close-range UI elements.

Rules:

- HERO: labels/hover allowed
- NEAR: labels allowed if toggled; hover allowed only if explicitly selected by UI authority
- MID: labels suppressed except debug
- FAR: labels forbidden
- ATMOSPHERIC: labels forbidden

Hover cards must not appear for atmospheric vessels.

---

# 26. Topology LOD Policy

Distance atmosphere feeds topology LOD hints.

Mapping:

```text
HERO         → CLOSE_DETAIL or TOPOLOGY
NEAR         → TOPOLOGY
MID          → SILHOUETTE or reduced TOPOLOGY
FAR          → MARKER or SILHOUETTE
ATMOSPHERIC  → LIGHT or none
```

This is a hint.

ProceduralVesselTopology remains the authority for actual topology emission.

---

# 27. Required Public API

```ts
function resolveDistanceEnvelope(
  input: MaritimeDistanceInput
): MaritimeDistanceEnvelope;

function resolveDistanceBand(
  distanceNorm: number
): MaritimeDistanceBand;

function resolveDistanceNorm(
  input: MaritimeDistanceInput
): number;

function applyVisibilityClassToEnvelope(
  envelope: MaritimeDistanceEnvelope,
  visibilityClass: MaritimeDistanceVisibilityClass
): MaritimeDistanceEnvelope;

function getFallbackEnvelope(
  reasonCode: MaritimeDistanceReasonCode
): MaritimeDistanceEnvelope;

function getConstants(): object;
```

Runtime namespace:

```ts
SBE.MaritimeDistanceAtmosphere
```

Debug namespace:

```ts
_wos.distanceAtmosphere
```

---

# 28. Debug API

```ts
_wos.distanceAtmosphere.sampleAt(x, y)
_wos.distanceAtmosphere.inspectVessel(vesselId)
_wos.distanceAtmosphere.matrix(rows?, cols?)
_wos.distanceAtmosphere.constants()
_wos.distanceAtmosphere.setDebug(true)
```

Debug overlay may visualize bands.

Debug overlay must not alter runtime truth.

`matrix()` must return the typed `DistanceMatrix` structure defined in this spec.

---

# 29. Renderer Integration

Recommended integration point:

```text
MaritimeOccupancyRenderer
→ for each vessel:
   resolve distance envelope once
   pass envelope to topology rendering
   pass envelope to wake rendering
   pass envelope to lights
   pass envelope to labels/hover
```

The distance envelope should be computed once per vessel per frame.

Do not recalculate independently inside every draw function.

Renderer sequencing remains renderer-owned.

---

# 30. Failure Modes

If viewport dimensions are missing:

```text
return FALLBACK_MISSING_VIEWPORT envelope
```

If zoom is missing:

```text
return FALLBACK_MISSING_ZOOM envelope
```

If input invalid:

```text
return FALLBACK_INVALID_INPUT envelope
```

If visibilityClass unknown:

```text
apply distance band only
```

No exception should break maritime rendering.

---

# 31. Non-Goals

This spec does NOT implement:

- new wake geometry
- new vessel topology
- WaterMemory resurrection
- fog renderer
- weather simulation
- 2.5D projection
- water reflection rendering
- shoreline interaction
- camera director logic
- AIS continuity changes
- gameplay targeting
- tactical stealth/visibility
- global observability middleware
- audio attenuation
- AI perception
- event prioritization

---

# 32. First Build Scope

Create:

```text
wall/systems/presentation/maritimeDistanceAtmosphere.js
wall/systems/presentation/maritimeDistanceAtmosphereDebug.js
```

Patch:

```text
wall/render/maritimeOccupancyRenderer.js
wall/index.html
```

Minimum behavior:

- resolve distance envelope per vessel
- reduce wake visibility by distance
- reduce topology detail by distance
- suppress labels/hover at FAR/ATMOSPHERIC
- preserve tiny far lights
- expose debug matrix
- use typed `reasonCode`
- keep WaterMemory disabled by default

---

# 33. Validation Checklist

- [ ] distance envelope returns stable values
- [ ] `resolveDistanceEnvelope()` is implemented
- [ ] bands resolve from normalized screen distance
- [ ] focus anchor is consumed, not owned
- [ ] visibilityClass only suppresses, never elevates
- [ ] `reasonCode` uses deterministic enum values
- [ ] no freeform runtime reason strings
- [ ] `matrix()` returns typed `DistanceMatrix`
- [ ] wake alpha reduces with distance
- [ ] FAR/ATMOSPHERIC labels are forbidden
- [ ] hover cards do not appear for atmospheric vessels
- [ ] far lights remain subtle
- [ ] topology receives LOD hints
- [ ] no AIS/runtime truth mutation
- [ ] no camera mutation
- [ ] no renderer orchestration mutation
- [ ] debug overlay is observational only
- [ ] WaterMemory remains disabled by default
- [ ] no global observability middleware behavior

---

# 34. Final Status

```text
0526E_WOS_MaritimeDistanceAtmosphere_v1.0.1
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
maritime-distance-depth-atmospheric-compression
```

Build Scope:

```text
stateless distance bands, alpha compression, visibility-class suppression, reasonCode enums, wake suppression, far-light preservation, label/hover suppression, topology LOD hints, typed debug matrix
```

Final instruction:

```text
Proceed to implementation.
```

---

# Implementation Guide

- Create `wall/systems/presentation/maritimeDistanceAtmosphere.js` and `wall/systems/presentation/maritimeDistanceAtmosphereDebug.js`.
- Integrate once per vessel inside `maritimeOccupancyRenderer.js` before topology, wake, light, label, and hover drawing.
- Expect clearer near/mid/far hierarchy, less wake clutter, stronger harbor depth, typed debug output, and no runtime truth mutation.
