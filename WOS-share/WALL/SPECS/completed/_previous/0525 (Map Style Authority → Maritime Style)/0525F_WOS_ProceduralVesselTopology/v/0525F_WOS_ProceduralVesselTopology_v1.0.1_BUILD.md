# 🚦 SPEC STAGE

Stage: [BUILD]  
Freeze Decision: GO  
Action: Implement procedural vessel topology rendering as the immediate maritime visual upgrade path.

# 0525F_WOS_ProceduralVesselTopology_v1.0.1_BUILD

## Purpose

Define the canonical procedural vessel topology system for recognizable low-resolution maritime rendering across:

- 2D overhead presentation
- future 2.5D interpretation
- atmospheric visibility degradation
- Surface preset integration
- MaritimeStyleRegistry integration
- future GlyphLab topology authoring

This specification upgrades WOS maritime vessels from:

```text
generic symbolic markers
```

toward:

```text
recognizable semantic silhouettes
```

without introducing photorealistic rendering, large sprite pipelines, or perspective-locked assets.

---

# 🧠 CORE DOCTRINE

## Semantic Topology Over Photorealism

WOS maritime presentation prioritizes:

- silhouette
- deck rhythm
- bridge placement
- recognizable proportions
- topology readability
- low-fatigue visuals
- atmosphere compatibility

NOT:

- texture realism
- simulation-grade geometry
- perspective-baked sprites
- photorealistic ship rendering

Canonical rule:

```text
Low-resolution recognition beats high-detail realism.
```

---

## Procedural Vessel Grammar

Vessels are generated from semantic topology grammars:

```text
Hull
+ Deck Modules
+ Bridge Modules
+ Cargo/Tank/Passenger Patterns
+ Lighting Anchors
+ Wake Anchors
+ Visibility Envelope
```

This preserves:
- procedural variation
- class identity
- render scalability
- atmosphere compatibility
- future 2.5D interpretation

---

## GlyphLab Compatibility

GlyphLab is future authoring infrastructure.

This specification must NOT depend on GlyphLab.

Instead:

```text
ProceduralVesselTopology
```

defines the canonical topology blueprint schema that GlyphLab may eventually author.

Canonical rule:

```text
Topology is authored once.
Presentation is interpreted many ways.
```

---

# 🧭 ARCHITECTURAL PLACEMENT

Canonical runtime flow:

```text
AISRuntime
→ MaritimeVesselTaxonomy
→ MaritimeStyleRegistry
→ VisibilityClassRuntime
→ ProceduralVesselTopology
→ MaritimeOccupancyRenderer
→ 2D / 2.5D Presentation
```

ProceduralVesselTopology owns:
- semantic geometry generation
- topology primitives
- LOD geometry selection
- class silhouette generation

It does NOT own:
- runtime truth
- AIS state
- vessel position
- continuity
- wake simulation
- camera routing

---

# 🏛️ AUTHORITY BOUNDARIES

## ProceduralVesselTopology Owns

- topology blueprint schema
- primitive generation
- semantic hull generation
- class-specific topology defaults
- LOD emission
- bridge placement
- deck rhythm generation
- anchor generation
- topology variation
- future GlyphLab blueprint compatibility

---

## ProceduralVesselTopology May Observe

- vessel class
- MaritimeStyleRegistry style data
- VisibilityClassRuntime output
- SurfaceStylePresetRuntime context
- population tier
- zoom level
- renderer LOD request

Observation does not grant mutation authority.

---

## ProceduralVesselTopology May NOT Mutate

- AIS truth
- vessel coordinates
- vessel heading truth
- vessel speed truth
- wake persistence
- visibilityClass
- population hierarchy
- camera targets
- renderer global state
- MapStyleAuthority registries

---

# 🚢 CANONICAL TOPOLOGY CLASSES

Required supported classes:

```text
cargo
tanker
ferry
service
recreational
fishing
passenger
tug
military
industrial
unknown
default
```

Important distinction:

```text
unknown = unresolved canonical vessel class
default = defensive fallback
```

---

# 🎨 CLASS VISUAL LANGUAGE

## Cargo

Recognizable through:

- long hull
- stacked cargo rhythm
- aft bridge
- strong rectangular silhouette

---

## Tanker

Recognizable through:

- low industrial profile
- central spine
- sparse deck rhythm
- restrained silhouette

---

## Ferry

Recognizable through:

- broad passenger body
- central cabin mass
- civic symmetry
- bright deck accents

---

## Tug

Recognizable through:

- short heavy hull
- oversized bridge
- aggressive bow
- compact dense proportions

---

## Fishing

Recognizable through:

- asymmetry
- deck clutter
- offset cabin
- rigging hints

---

## Recreational

Recognizable through:

- small hull
- minimal cabin
- lightweight silhouette
- sparse lighting

---

## Passenger / Cruise

Recognizable through:

- layered deck segmentation
- entertainment-spine silhouette
- bright upper decks
- passenger massing

---

## Industrial

Recognizable through:

- machinery blocks
- utility rhythm
- platform-like silhouette
- crane/equipment hints

---

## Military

Recognizable through:

- restrained angular silhouette
- low-emission visual profile
- minimal lights
- disciplined geometry

Military rendering must never imply combat state.

---

# 📦 DATA MODEL

```ts
type VesselTopologyLOD =
  | "LIGHT"
  | "MARKER"
  | "SILHOUETTE"
  | "TOPOLOGY"
  | "CLOSE_DETAIL";

type VesselTopologyPrimitiveType =
  | "polygon"
  | "rect"
  | "roundedRect"
  | "circle"
  | "line"
  | "stack"
  | "band";

type VesselTopologyPrimitive = {
  readonly primitiveId: string;
  readonly type: VesselTopologyPrimitiveType;
  readonly role: string;

  readonly xNorm: number;
  readonly yNorm: number;

  readonly wNorm: number;
  readonly hNorm: number;

  readonly rotationDeg?: number;

  readonly fillRole?:
    | "hull"
    | "deck"
    | "accent"
    | "light"
    | "shadow";

  readonly visibleFromLOD: VesselTopologyLOD;
};

type VesselTopologyBlueprint = {
  readonly blueprintId: string;
  readonly version: "1.0.1";

  readonly classKey: string;

  readonly primitives:
    readonly VesselTopologyPrimitive[];

  readonly variation: {
    readonly seedable: boolean;
    readonly maxJitterNorm: number;
    readonly asymmetryStrength: number;
  };

  readonly lodPolicy: {
    readonly minTopologyZoom: number;
    readonly minCloseDetailZoom: number;
    readonly allow2_5D: boolean;
  };
};
```

---

# 🔍 LOD POLICY

## LIGHT

Used when:
- visibilityClass = LIGHT_ONLY
- extremely distant vessels
- saturated harbor density

Allowed:
- far light
- halo
- twinkle

No hull geometry.

---

## MARKER

Used when:
- visibilityClass = MARKER_ONLY
- low zoom
- high density

Allowed:
- simple marker
- heading tick
- class tint

---

## SILHOUETTE

Used when:
- visibilityClass = SILHOUETTE
- medium zoom
- reduced readability

Allowed:
- hull
- simple bridge
- no fine deck rhythm

---

## TOPOLOGY

Primary target of this build.

Used when:
- zoom supports readability
- density allows detail
- visibilityClass permits detail

Allowed:
- deck segmentation
- bridge modules
- cargo stacks
- tanker spine
- passenger bands
- utility blocks
- wake anchors
- light anchors

---

## CLOSE_DETAIL

Reserved for:
- HERO vessels
- cinematic framing
- future VisualLab exports
- social render capture

Must remain limited.

---

# 🌫️ VISIBILITY CLASS INTEGRATION

VisibilityClassRuntime constrains topology detail.

ProceduralVesselTopology consumes visibilityClass.

It never assigns it.

Mapping:

```text
ATMOSPHERIC_HIDDEN → no visible topology
LIGHT_ONLY         → LIGHT
MARKER_ONLY        → MARKER
SILHOUETTE         → SILHOUETTE
REDUCED            → SILHOUETTE or TOPOLOGY
FULL               → TOPOLOGY or CLOSE_DETAIL
```

Canonical rule:

```text
Topology may degrade detail.
Topology may not restore suppressed detail.
```

---

# 🎨 STYLE SYSTEM INTEGRATION

Procedural topology does not define final colors.

Topology uses semantic style roles:

```text
hull
deck
accent
light
shadow
```

Final appearance resolves through:

```text
MaritimeStyleRegistry
→ SurfaceStylePresetRuntime
→ MapStyleAuthority
→ Renderer
```

Canonical rule:

```text
Topology defines structure.
Style systems define appearance.
```

---

# 🧊 2D / 2.5D SEPARATION

Topology remains flat semantic geometry.

2.5D remains interpretation logic.

Allowed:
- zHint
- heightHint
- shadow anchors

Forbidden:
- perspective-baked sprites
- fixed-angle topology
- hardcoded isometric geometry

Canonical rule:

```text
2.5D interprets topology.
Topology does not hardcode perspective.
```

---

# ⚙️ SYSTEM CONSTANTS

```ts
const PROCEDURAL_VESSEL_TOPOLOGY_VERSION =
  "1.0.1";

const DEFAULT_MIN_TOPOLOGY_ZOOM = 11.8;

const DEFAULT_MIN_CLOSE_DETAIL_ZOOM = 13.2;

const DEFAULT_MAX_JITTER_NORM = 0.025;

const MAX_PRIMITIVES_PER_TOPOLOGY = 48;

const MAX_PRIMITIVES_PER_CLOSE_DETAIL = 96;
```

---

# 🔧 REQUIRED PUBLIC API

```ts
function normalizeTopologyClass(
  classKey: string | null | undefined
): string;

function getTopologyBlueprint(
  classKey: string
): VesselTopologyBlueprint;

function resolveTopologyLOD(
  visibilityClass: string | null,
  zoom: number | null,
  populationTier: string | null
): VesselTopologyLOD;

function createTopologyInstance(
  input: VesselTopologyInstanceInput
): VesselTopologyInstance;

function emitGeometryPlan(
  instance: VesselTopologyInstance
): readonly VesselTopologyPrimitive[];
```

---

# 🧮 REFERENCE LOD RESOLUTION

```ts
function resolveTopologyLOD(
  visibilityClass,
  zoom,
  populationTier
) {
  if (
    visibilityClass === "ATMOSPHERIC_HIDDEN"
  ) {
    return "LIGHT";
  }

  if (
    visibilityClass === "LIGHT_ONLY"
  ) {
    return "LIGHT";
  }

  if (
    visibilityClass === "MARKER_ONLY"
  ) {
    return "MARKER";
  }

  if (
    visibilityClass === "SILHOUETTE"
  ) {
    return "SILHOUETTE";
  }

  const z =
    typeof zoom === "number"
      ? zoom
      : 0;

  if (
    visibilityClass === "REDUCED"
  ) {
    return z >= DEFAULT_MIN_TOPOLOGY_ZOOM
      ? "TOPOLOGY"
      : "SILHOUETTE";
  }

  if (
    visibilityClass === "FULL"
  ) {
    if (
      populationTier === "HERO" &&
      z >= DEFAULT_MIN_CLOSE_DETAIL_ZOOM
    ) {
      return "CLOSE_DETAIL";
    }

    return z >= DEFAULT_MIN_TOPOLOGY_ZOOM
      ? "TOPOLOGY"
      : "SILHOUETTE";
  }

  return "SILHOUETTE";
}
```

---

# 🛰️ DEBUG API

Required namespace:

```ts
_wos.vesselTopology
```

Required methods:

```ts
_wos.vesselTopology.catalog()
_wos.vesselTopology.inspect("cargo")
_wos.vesselTopology.preview("tanker")
_wos.vesselTopology.previewAll()
_wos.vesselTopology.lodMatrix("cargo")
_wos.vesselTopology.emit("tug")
_wos.vesselTopology.validate()
_wos.vesselTopology.constants()
```

---

# 🧪 VALIDATION RULES

- all canonical classes must have blueprints
- unknown and default remain distinct
- topology never mutates runtime truth
- topology never assigns visibilityClass
- topology uses semantic style roles only
- primitive counts remain bounded
- ATMOSPHERIC_HIDDEN never restores visible geometry
- topology supports future GlyphLab blueprint authoring
- 2.5D hints never hardcode perspective

---

# 🚫 NON-GOALS

This specification is NOT responsible for:

- full GlyphLab UI
- full VisualLab UI
- Studio shell architecture
- photorealistic ships
- texture atlas pipelines
- runtime vessel spawning
- camera choreography
- social export rendering
- 3D mesh generation
- weather simulation

---

# 💬 IMPLEMENTATION NOTES

Recommended files:

```text
wall/systems/presentation/proceduralVesselTopology.js
wall/systems/presentation/proceduralVesselTopologyDebug.js
```

Recommended namespaces:

```ts
SBE.ProceduralVesselTopology
_wos.vesselTopology
```

Recommended integration:

```text
MaritimeOccupancyRenderer
→ resolve vessel class
→ resolve topology LOD
→ emit primitive plan
→ apply MaritimeStyleRegistry colors
→ apply Surface preset modifiers
→ render semantic topology
```

This implementation should NOT wait for:
- VisualLab
- GlyphLab
- Studio shell
- serialization systems

Immediate objective:

```text
make boats recognizable now
```

---

# 📊 FINAL STATUS

```text
0525F_WOS_ProceduralVesselTopology_v1.0.1
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
procedural-vessel-semantic-topology-presentation-system
```

Build Scope:

```text
semantic vessel topology blueprints, low-resolution recognizable silhouettes, procedural deck grammar, topology LOD rendering, MaritimeOccupancyRenderer integration
```

Final instruction:

```text
Proceed to implementation.
```
