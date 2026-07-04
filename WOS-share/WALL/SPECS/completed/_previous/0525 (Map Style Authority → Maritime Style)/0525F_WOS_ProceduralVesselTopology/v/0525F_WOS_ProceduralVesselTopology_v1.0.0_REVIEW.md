---
layout: spec

title: "WOS Procedural Vessel Topology"
date: 2026-05-26
doc_id: "0525F_WOS_ProceduralVesselTopology_v1.0.0"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"

domain: "presentation"
component: "ProceduralVesselTopology"

type: "runtime-presentation-spec"
status: "review"

priority: "high"
risk: "medium"

classification: "presentation-layer"

summary: "Defines the procedural semantic topology system for recognizable low-resolution vessel rendering across 2D overhead and future 2.5D tilt presentation, preserving AIS truth while improving class readability and atmospheric world identity."

doctrine:
  - "2D owns truth"
  - "2.5D owns presentation"
  - "Semantic topology over photorealism"
  - "Procedural vessel grammar preserves class identity"
  - "GlyphLab may author topology; renderers interpret topology"
  - "Vessel topology is presentation geometry, not AIS truth"
  - "Low-resolution recognition beats high-detail realism"

depends_on:
  - "0525A_WOS_MapStyleAuthority_v1.0.2"
  - "0525B_WOS_MaritimeStyleRegistry_v1.0.1"
  - "0525D_WOS_SurfaceStylePresets_v1.0.1"
  - "0525E_WOS_VisibilityClassRuntime_v1.0.0"
  - "0523A_WOS_MaritimeVesselTaxonomyProfiles_v1.2.2"
  - "0523B_WOS_MaritimePopulationHierarchy_v1.1.0"
  - "0523D_WOS_MaritimeWakeAuthority_v1.2.1"

enables:
  - "0525G_WOS_GlyphLabTopologyBridge_v1.0.0"
  - "0525H_WOS_VesselTopologyLODRenderer_v1.0.0"
  - "0525I_WOS_Maritime2_5DProjectionAdapter_v1.0.0"
  - "0525J_WOS_VisualLabStudioSeparation_v1.0.0"

tags:
  - "maritime"
  - "vessels"
  - "topology"
  - "procedural"
  - "low-resolution"
  - "2d"
  - "2.5d"
  - "glyphlab"
  - "visual-language"
  - "semantic-geometry"

supersedes: []

owner: "StudioRich / WOS"

stage: "[REVIEW]"
freeze_decision: "REVIEW"
build_scope: "procedural-vessel-semantic-topology-and-lod-rendering"
---

# 🚦 SPEC STAGE

Stage: [REVIEW]  
Freeze Decision: REVIEW  
Action: Define procedural vessel topology as the immediate maritime visual upgrade path before building full GlyphLab, VisualLab, or Studio infrastructure.

---

# 0525F_WOS_ProceduralVesselTopology_v1.0.0

## Canonical Artifact Rule

This is a full standalone canonical REVIEW artifact.

This specification defines the procedural vessel topology system for WOS maritime rendering.

It exists to solve the immediate visual problem:

```text
boats currently read too similarly
```

without derailing into:

```text
full Studio shell
full GlyphLab UI
large asset pipeline
photorealistic sprite production
2.5D engine rewrite
```

This spec keeps the project focused on the maritime layer.

---

# 🎯 PURPOSE

Define a procedural topology system for recognizable low-resolution vessel rendering across:

- 2D overhead map presentation
- future 2.5D tilt interpretation
- atmospheric visibility degradation
- Surface style presets
- class-specific vessel identities
- future GlyphLab authoring workflows

The goal is to transition vessels from:

```text
generic symbolic boat markers
```

toward:

```text
recognizable semantic vessel forms
```

without sacrificing runtime safety, render performance, or atmospheric restraint.

---

# 🧠 CORE DOCTRINE

## Semantic Topology Over Photorealism

WOS vessels should be recognizable through:

- silhouette
- deck rhythm
- hull proportions
- bridge placement
- cargo/deck topology
- lighting zones
- low-resolution form language

NOT through:

- texture realism
- detailed ship modeling
- high-poly geometry
- photographic sprite sheets
- tactical simulation detail

Canonical rule:

```text
Low-resolution recognition beats high-detail realism.
```

---

## Vessels Are Procedural Grammars

A WOS vessel is not just a sprite.

A WOS vessel presentation is composed from:

```text
Hull Grammar
+ Deck Grammar
+ Superstructure Grammar
+ Cargo Grammar
+ Lighting Grammar
+ Wake Anchor Grammar
+ Visibility Envelope
+ Surface Preset Atmosphere
```

This creates recognizable class-specific vessels while preserving procedural variation.

---

## GlyphLab Authors Topology; Renderers Interpret Topology

GlyphLab does not need to own 2.5D.

GlyphLab should eventually author:

```text
semantic topology blueprints
```

Renderers interpret those blueprints into:

- 2D overhead forms
- 2.5D tilt forms
- cinematic close-up forms
- low-power symbolic forms

Canonical rule:

```text
Topology is authored once.
Presentation is interpreted many ways.
```

---

## Topology Is Not Runtime Truth

ProceduralVesselTopology may define:

- how a cargo ship is visually structured
- where a bridge appears in presentation geometry
- how cruise deck zones are arranged
- how container stacks create rhythm
- which anchor points emit lights or wakes

It may NOT define:

- AIS vessel class truth
- vessel position
- vessel heading truth
- vessel speed truth
- vessel lifecycle
- wake persistence
- collision
- camera priority
- narrative priority

---

# 🧭 ARCHITECTURAL PLACEMENT

Canonical flow:

```text
AISRuntime
→ VesselTaxonomy
→ MaritimeStyleRegistry
→ VisibilityClassRuntime
→ ProceduralVesselTopology
→ MaritimeOccupancyRenderer
→ 2D / 2.5D presentation
```

Future authoring flow:

```text
GlyphLab
→ VesselTopologyBlueprint
→ ProceduralVesselTopology
→ Renderer interpretation
```

ProceduralVesselTopology is a presentation geometry system.

It does not own runtime state.

---

# 🏛️ AUTHORITY BOUNDARIES

## ProceduralVesselTopology Owns

- vessel topology blueprint schema
- class-specific topology defaults
- procedural variation rules
- low-resolution geometry grammar
- LOD-specific topology emission
- topology anchors
- deck module placement
- bridge module placement
- hull geometry recipes
- symbolic detail recipes
- future GlyphLab topology import format

---

## ProceduralVesselTopology May Observe

- vessel class key
- vessel dimensions if provided by AIS/taxonomy
- MaritimeStyleRegistry style values
- VisibilityClassRuntime output
- SurfaceStylePresetRuntime active preset context
- population tier
- zoom level
- renderer LOD request

Observation does not grant runtime mutation authority.

---

## ProceduralVesselTopology May Produce

- `VesselTopologyBlueprint`
- `VesselTopologyInstance`
- `VesselGeometryPlan`
- `VesselLODPlan`
- topology anchor records
- renderer-friendly primitive lists

---

## ProceduralVesselTopology May NOT Mutate

- AIS state
- vessel coordinates
- vessel heading truth
- vessel speed truth
- vessel class truth
- wake buffers
- runtime continuity
- population tier
- visibilityClass
- Surface preset state
- MapStyleAuthority registries
- MaritimeStyleRegistry registries
- renderer global state
- camera target selection
- overlay semantic content

---

# 🧬 CANONICAL TOPOLOGY CLASSES

Procedural topology must support the same 11 canonical vessel classes plus default fallback:

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

Important taxonomy distinction:

```text
unknown = recognized canonical unresolved vessel class
default = defensive fallback for invalid/missing/future keys
```

---

# 🚢 CLASS TOPOLOGY DOCTRINE

## Cargo

Recognizable through:

- long rectangular hull
- flat deck zone
- repeated container blocks
- rear or aft-superstructure bridge
- strong longitudinal axis
- stacked color rhythm

Topology grammar:

```text
long hull
+ container grid
+ aft bridge block
+ minimal open deck
```

---

## Tanker

Recognizable through:

- long low hull
- central spine or pipe lane
- circular/rectangular tank hints
- sparse deck rhythm
- industrial restraint

Topology grammar:

```text
long hull
+ central pipe spine
+ low deck modules
+ minimal bridge block
```

---

## Ferry

Recognizable through:

- broad passenger hull
- central cabin mass
- symmetrical window/deck bands
- civic route-readability
- readable bow/stern orientation

Topology grammar:

```text
medium-wide hull
+ central passenger cabin
+ side bands
+ bright deck accents
```

---

## Service

Recognizable through:

- compact workboat proportions
- utility deck modules
- equipment blocks
- asymmetrical support structure

Topology grammar:

```text
compact hull
+ utility module
+ small bridge
+ equipment deck
```

---

## Recreational

Recognizable through:

- small hull
- minimal cabin or open deck
- light proportions
- fragile low-mass silhouette

Topology grammar:

```text
small tapered hull
+ tiny cabin or open deck
+ minimal wake/lights
```

---

## Fishing

Recognizable through:

- compact working hull
- asymmetric deck clutter
- rigging hints
- small cabin offset
- warm/local texture rhythm

Topology grammar:

```text
small work hull
+ offset cabin
+ rigging marks
+ deck clutter blocks
```

---

## Passenger

Recognizable through:

- elongated civic/passenger structure
- cabin bands
- route-friendly shape
- brighter top deck

Topology grammar:

```text
passenger hull
+ long cabin mass
+ deck bands
+ brighter accents
```

---

## Tug

Recognizable through:

- short dense hull
- large bridge relative to hull
- strong nose
- compact forceful silhouette
- pronounced directional heading

Topology grammar:

```text
short heavy hull
+ oversized bridge
+ strong bow
+ utility deck
```

---

## Military

Recognizable through:

- restrained angular hull
- low-emission detail
- gray/neutral topology
- controlled silhouette
- non-spectacular authority

Topology grammar:

```text
angular hull
+ low bridge
+ restrained deck marks
+ minimal lights
```

Military topology must not imply threat state or target priority.

---

## Industrial

Recognizable through:

- platform-like geometry
- work modules
- cranes/equipment abstraction
- orange/utility-coded details
- floating machinery feel

Topology grammar:

```text
platform hull
+ machinery blocks
+ crane/equipment hints
+ utility accents
```

---

## Unknown

Recognizable through:

- neutral simplified hull
- low detail
- unresolved class identity
- safe visual fallback

Topology grammar:

```text
neutral hull
+ minimal deck
+ low accent strength
```

---

# 📦 DATA MODEL

```ts
type VesselTopologyClassKey =
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
  | "unknown"
  | "default";

type VesselTopologyLOD =
  | "LIGHT"
  | "MARKER"
  | "SILHOUETTE"
  | "TOPOLOGY"
  | "CLOSE_DETAIL";

type VesselTopologyAnchorType =
  | "bow"
  | "stern"
  | "bridge"
  | "deck"
  | "cargo"
  | "light"
  | "wake"
  | "label"
  | "hover"
  | "height";

type VesselTopologyPrimitiveType =
  | "polygon"
  | "rect"
  | "roundedRect"
  | "circle"
  | "line"
  | "dot"
  | "stack"
  | "band";

type VesselTopologyAnchor = {
  readonly anchorId: string;
  readonly type: VesselTopologyAnchorType;
  readonly xNorm: number;
  readonly yNorm: number;
  readonly zHint?: number;
  readonly role?: string;
};

type VesselTopologyPrimitive = {
  readonly primitiveId: string;
  readonly type: VesselTopologyPrimitiveType;
  readonly role: string;
  readonly xNorm: number;
  readonly yNorm: number;
  readonly wNorm: number;
  readonly hNorm: number;
  readonly rotationDeg?: number;
  readonly fillRole?: "hull" | "deck" | "accent" | "light" | "shadow";
  readonly strokeRole?: "hull" | "deck" | "accent" | "none";
  readonly zHint?: number;
  readonly visibleFromLOD: VesselTopologyLOD;
};

type VesselTopologyBlueprint = {
  readonly blueprintId: string;
  readonly version: "1.0.0";
  readonly classKey: VesselTopologyClassKey;
  readonly displayName: string;

  readonly baseHull: {
    readonly lengthNorm: number;
    readonly beamNorm: number;
    readonly bowShape: "pointed" | "rounded" | "flat" | "blunt";
    readonly sternShape: "flat" | "rounded" | "notched";
    readonly hullWeight: number;
  };

  readonly primitives: readonly VesselTopologyPrimitive[];
  readonly anchors: readonly VesselTopologyAnchor[];

  readonly variation: {
    readonly seedable: boolean;
    readonly maxJitterNorm: number;
    readonly moduleRepeatMin: number;
    readonly moduleRepeatMax: number;
    readonly asymmetryStrength: number;
  };

  readonly lodPolicy: {
    readonly minTopologyZoom: number;
    readonly minCloseDetailZoom: number;
    readonly allow2_5D: boolean;
    readonly heightHintStrength: number;
  };
};

type VesselTopologyInstanceInput = {
  readonly vesselId: string;
  readonly classKey: string | null;
  readonly lengthMeters?: number | null;
  readonly widthMeters?: number | null;
  readonly seed: number;
  readonly visibilityClass: string | null;
  readonly zoom: number | null;
  readonly populationTier: string | null;
};

type VesselTopologyInstance = {
  readonly vesselId: string;
  readonly classKey: VesselTopologyClassKey;
  readonly blueprintId: string;
  readonly lod: VesselTopologyLOD;
  readonly primitives: readonly VesselTopologyPrimitive[];
  readonly anchors: readonly VesselTopologyAnchor[];
  readonly scale: number;
  readonly headingLocked: boolean;
};
```

---

# ⚙️ SYSTEM CONSTANTS

```ts
const PROCEDURAL_VESSEL_TOPOLOGY_VERSION = "1.0.0";

const REQUIRED_TOPOLOGY_CLASS_COUNT = 12;

const DEFAULT_MIN_TOPOLOGY_ZOOM = 11.8;

const DEFAULT_MIN_CLOSE_DETAIL_ZOOM = 13.2;

const DEFAULT_MAX_JITTER_NORM = 0.025;

const DEFAULT_HEIGHT_HINT_STRENGTH = 0.35;

const MAX_PRIMITIVES_PER_VESSEL_LOD3 = 48;

const MAX_PRIMITIVES_PER_VESSEL_LOD4 = 96;
```

---

# 🔍 LOD POLICY

## LIGHT

Equivalent to far-light mode.

Used when:

- visibilityClass is `LIGHT_ONLY`
- vessel is extremely distant
- zoom is low
- density suppression is high

Allowed output:

- light anchor
- halo anchor
- no hull primitives

---

## MARKER

Used when:

- visibilityClass is `MARKER_ONLY`
- low zoom
- high density
- background tier

Allowed output:

- one marker primitive
- class tint
- optional heading tick

---

## SILHOUETTE

Used when:

- visibilityClass is `SILHOUETTE`
- medium distance
- class shape is useful but detail should be suppressed

Allowed output:

- hull primitive
- simple bridge mass
- no fine modules
- no topology rhythm

---

## TOPOLOGY

Primary target for the current visual upgrade.

Used when:

- zoom is close enough
- visibilityClass allows detail
- vessel is MID/HERO or screen-space visible
- density pressure is acceptable

Allowed output:

- hull
- deck modules
- bridge
- class-specific detail rhythm
- container/tank/cabin blocks
- lighting anchors
- wake anchors

---

## CLOSE_DETAIL

Used sparingly.

Used when:

- hero vessel
- close camera
- inspection
- cinematic close-up
- social export

Allowed output:

- refined deck modules
- stronger topology rhythm
- additional lights
- visual storytelling details

---

# 🌫️ VISIBILITY CLASS INTEGRATION

ProceduralVesselTopology consumes visibilityClass.

It does not assign visibilityClass.

Mapping:

```text
ATMOSPHERIC_HIDDEN → no topology output
LIGHT_ONLY         → LIGHT
MARKER_ONLY        → MARKER
SILHOUETTE         → SILHOUETTE
REDUCED            → SILHOUETTE or TOPOLOGY depending on zoom
FULL               → TOPOLOGY or CLOSE_DETAIL depending on zoom
```

Downward-only rule:

```text
Topology may degrade detail.
Topology may not restore detail suppressed by visibilityClass.
```

---

# 🎨 STYLE INTEGRATION

Procedural topology does not define final color.

It uses semantic roles:

```text
hull
deck
accent
light
shadow
```

MaritimeStyleRegistry resolves actual colors.

SurfaceStylePresetRuntime may modulate them.

MapStyleAuthority governs manifest-level presentation.

Canonical rule:

```text
Topology defines structure.
Style registries define appearance.
```

---

# 🧊 2D / 2.5D SEPARATION

Topology is stored as flat semantic structure.

2.5D is an interpretation layer.

ProceduralVesselTopology may provide:

- `zHint`
- `height` anchors
- bridge height hints
- deck height hints
- shadow anchors

It may NOT bake a fixed camera perspective into the topology asset.

Canonical rule:

```text
2.5D interprets topology.
Topology does not hardcode perspective.
```

This allows the same blueprint to serve:

- overhead map
- tilted map
- cinematic export
- social video render
- future VisualLab/GlyphLab tools

---

# 🧩 GLYPHLAB / VISUALLAB COMPATIBILITY

This spec intentionally prepares for future Studio tools without requiring them now.

Future role:

```text
GlyphLab authors topology blueprints.
VisualLab exports visual media assets.
Main View consumes runtime-safe assets.
```

Current role:

```text
ProceduralVesselTopology supplies built-in topology defaults.
```

The map renderer should not wait for full Studio infrastructure.

Immediate goal remains:

```text
better boats now
```

---

# 🔧 CORE FUNCTIONS

```ts
function normalizeTopologyClass(
  rawClass: string | null | undefined
): VesselTopologyClassKey;

function getTopologyBlueprint(
  classKey: string | null | undefined
): VesselTopologyBlueprint;

function createTopologyInstance(
  input: VesselTopologyInstanceInput
): VesselTopologyInstance;

function resolveTopologyLOD(
  visibilityClass: string | null,
  zoom: number | null,
  populationTier: string | null
): VesselTopologyLOD;

function emitGeometryPlan(
  instance: VesselTopologyInstance
): readonly VesselTopologyPrimitive[];

function getTopologyAnchors(
  instance: VesselTopologyInstance,
  anchorType?: VesselTopologyAnchorType
): readonly VesselTopologyAnchor[];
```

---

# 🧮 REFERENCE LOD RESOLUTION

```ts
function resolveTopologyLOD(
  visibilityClass: string | null,
  zoom: number | null,
  populationTier: string | null
): VesselTopologyLOD {
  if (visibilityClass === "ATMOSPHERIC_HIDDEN") return "LIGHT";
  if (visibilityClass === "LIGHT_ONLY") return "LIGHT";
  if (visibilityClass === "MARKER_ONLY") return "MARKER";
  if (visibilityClass === "SILHOUETTE") return "SILHOUETTE";

  const z = typeof zoom === "number" ? zoom : 0;

  if (visibilityClass === "REDUCED") {
    return z >= DEFAULT_MIN_TOPOLOGY_ZOOM ? "TOPOLOGY" : "SILHOUETTE";
  }

  if (visibilityClass === "FULL") {
    if (populationTier === "HERO" && z >= DEFAULT_MIN_CLOSE_DETAIL_ZOOM) {
      return "CLOSE_DETAIL";
    }
    return z >= DEFAULT_MIN_TOPOLOGY_ZOOM ? "TOPOLOGY" : "SILHOUETTE";
  }

  return z >= DEFAULT_MIN_TOPOLOGY_ZOOM ? "TOPOLOGY" : "SILHOUETTE";
}
```

Implementation note:

`ATMOSPHERIC_HIDDEN` should later map to no direct render output in the renderer. `LIGHT` here means no topology primitives, not visible hull.

---

# 🚢 REQUIRED BUILT-IN BLUEPRINTS

## cargo blueprint

Required primitives:

- hull polygon
- aft bridge block
- container stack field
- optional container color rhythm bands
- bow/stern anchors
- wake anchor
- light anchors

---

## tanker blueprint

Required primitives:

- hull polygon
- central pipe spine
- low deck modules
- bridge block
- tank hint marks
- wake anchor
- light anchors

---

## ferry blueprint

Required primitives:

- broad hull
- passenger cabin mass
- side deck bands
- front/back orientation cue
- route/civic light anchors

---

## recreational blueprint

Required primitives:

- small tapered hull
- tiny cabin or open deck mark
- minimal lighting anchor
- minimal wake anchor

---

## fishing blueprint

Required primitives:

- small work hull
- offset cabin
- rigging hint lines
- deck clutter blocks
- warm utility accent anchor

---

## tug blueprint

Required primitives:

- compact heavy hull
- oversized bridge
- strong bow shape
- utility deck block
- wake anchor close to stern

---

## service blueprint

Required primitives:

- compact support hull
- utility module
- equipment block
- small bridge

---

## passenger blueprint

Required primitives:

- passenger hull
- long cabin mass
- deck bands
- bright accent anchors

---

## military blueprint

Required primitives:

- angular hull
- restrained low bridge
- minimal deck marks
- suppressed light anchors

---

## industrial blueprint

Required primitives:

- platform hull
- machinery modules
- crane/equipment hint blocks
- utility accents

---

## unknown/default blueprints

Required primitives:

- neutral hull
- minimal bridge or deck mark
- low detail
- safe fallback anchors

---

# 🛰️ DEBUG API

Debug namespace:

```ts
_wos.vesselTopology
```

Required commands:

```ts
_wos.vesselTopology.catalog()
_wos.vesselTopology.inspect("cargo")
_wos.vesselTopology.preview("cruise")
_wos.vesselTopology.previewAll()
_wos.vesselTopology.lodMatrix("cargo")
_wos.vesselTopology.emit("tug", { zoom: 12.5, visibilityClass: "FULL" })
_wos.vesselTopology.anchors("cargo")
_wos.vesselTopology.validate()
_wos.vesselTopology.constants()
```

Note:

If `cruise` is used as a user-facing alias, it should resolve to:

```text
passenger
```

or a future sub-profile under passenger.

---

# 🧪 VALIDATION CHECKLIST

- [ ] all 11 canonical classes plus default fallback have blueprints
- [ ] unknown and default remain distinct
- [ ] topology never mutates AIS/runtime truth
- [ ] topology consumes visibilityClass but does not assign it
- [ ] LOD output degrades detail correctly
- [ ] ATMOSPHERIC_HIDDEN produces no visible direct vessel geometry downstream
- [ ] topology uses semantic color roles, not hardcoded final colors
- [ ] 2.5D hints do not bake fixed perspective
- [ ] class recognition improves at medium zoom
- [ ] cargo, tanker, ferry, tug, fishing, recreational read distinctly
- [ ] primitive counts remain bounded
- [ ] debug previews expose all classes
- [ ] renderer can consume primitive list safely
- [ ] future GlyphLab can author same blueprint format

---

# ✅ BUILD READINESS CRITERIA

This spec is ready for BUILD when:

- [ ] topology blueprint schema is accepted
- [ ] class blueprint requirements are accepted
- [ ] LOD policy is accepted
- [ ] 2D/2.5D separation is accepted
- [ ] debug namespace is accepted
- [ ] integration path into MaritimeOccupancyRenderer is confirmed
- [ ] no Studio/GlyphLab dependency is required for first implementation
- [ ] built-in procedural blueprints are enough to improve boats immediately

Current build status:

```text
REVIEW
```

---

# 🚫 NON-GOALS

This specification is NOT responsible for:

- full GlyphLab UI
- full VisualLab UI
- Studio shell design
- photorealistic ship models
- texture atlas production
- AIS vessel classification
- runtime vessel spawning
- camera hero selection
- wake persistence
- overlay semantic content
- social video export
- 3D mesh production
- weather simulation

---

# ⏸️ DEFERRED SYSTEMS

Deferred:

- GlyphLab topology editor
- VisualLab export workflows
- 2.5D extrusion renderer
- animated vessel deck modules
- texture atlas export
- user-authored vessel grammar library
- cruise-ship sub-profile expansion
- port-specific vessel variants
- weather-specific topology suppression
- hero vessel cinematic close-up renderer

---

# 📚 CANONICAL REFERENCES

- 0525A_WOS_MapStyleAuthority_v1.0.2
- 0525B_WOS_MaritimeStyleRegistry_v1.0.1
- 0525D_WOS_SurfaceStylePresets_v1.0.1
- 0525E_WOS_VisibilityClassRuntime_v1.0.0
- 0523A_WOS_MaritimeVesselTaxonomyProfiles_v1.2.2
- 0523D_WOS_MaritimeWakeAuthority_v1.2.1
- WOS Naming Doctrine
- WOS Constitutional Spec Template v2.0.1

---

# 💬 IMPLEMENTATION NOTES

Recommended implementation files:

```text
wall/systems/presentation/proceduralVesselTopology.js
wall/systems/presentation/proceduralVesselTopologyDebug.js
```

Recommended runtime namespace:

```ts
SBE.ProceduralVesselTopology
```

Recommended debug namespace:

```ts
_wos.vesselTopology
```

Recommended renderer integration:

```text
MaritimeOccupancyRenderer
→ resolve vessel class
→ request topology instance
→ draw primitives according to LOD
→ apply MaritimeStyleRegistry semantic colors
→ apply SurfaceStylePreset manifest modifiers
```

First implementation should not build VisualLab/GlyphLab.

First implementation should improve the current renderer with built-in topology defaults only.

---

# 🧱 NEXT SPECIFICATION

Recommended next specification after review:

```text
0525F_WOS_ProceduralVesselTopology_v1.0.1_BUILD
```

Then implementation target:

```text
proceduralVesselTopology.js
proceduralVesselTopologyDebug.js
MaritimeOccupancyRenderer integration patch
```

Do not build Studio shell first.

---

# 📊 FINAL STATUS

```text
0525F_WOS_ProceduralVesselTopology_v1.0.0
```

Status:

```text
[REVIEW]
```

Freeze Decision:

```text
REVIEW
```

Classification:

```text
procedural-vessel-semantic-topology-presentation-system
```

Build Scope:

```text
class-specific procedural vessel blueprints, low-resolution topology grammar, LOD emission, 2D/2.5D compatible semantic primitives
```

Final instruction:

```text
Submit for architecture and governance review before implementation.
```
