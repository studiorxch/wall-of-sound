---
layout: spec
title: "Marine Asset World Geometry Pass"
date: 2026-06-03
doc_id: "0603_WOS_MarineAssetWorldGeometryPass_v1.0.0"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"

domain: "render"
component: "marine_asset_world_geometry"

type: "system-spec"
status: "approved"

priority: "high"
risk: "medium"

classification: "visible-geometry-pass"

summary: "Adds distinct low-poly world-space marine vessel geometry for taxonomy-driven marine asset payloads, allowing tugs, barges, cargo ships, tankers, sailboats, yachts, ferries, and generic vessels to read differently on the map without changing AIS truth or taxonomy logic."

depends_on:
  - "0603T_WOS_MarineVesselAssetPack_v1.0.0_BUILD"
  - "0603U_WOS_MarineVesselTaxonomyResolver_v1.0.0_BUILD"
  - "0603V_WOS_MarineTaxonomyAssetBridge_v1.0.0_BUILD"

enables:
  - "visible marine differentiation"
  - "taxonomy-driven silhouettes"
  - "harbor readability"
  - "asset-specific vessel forms"
  - "future palette and animation passes"

tags:
  - "wos"
  - "marine"
  - "vessels"
  - "geometry"
  - "world-space"
  - "2.5d"
  - "rendering"
  - "asset-library"
---

# 0603W_WOS_MarineAssetWorldGeometryPass_v1.0.0_BUILD

## Build Readiness

[BUILD]

---

# Purpose

Make marine taxonomy visible.

0603V successfully pushes taxonomy-driven marine asset payloads into the render path:

```text
AIS vessel
→ taxonomy role
→ marine asset
→ render payload
```

But WSL still falls most marine silhouettes back to generic vessel geometry.

0603W adds distinct 2.5D low-poly marine geometry so different marine assets finally look different in the world.

This is the first marine build expected to produce an obvious screenshot difference.

---

# Core Result

Before:

```text
tug_boat
cargo_large
tanker
barge
sailboat
yacht
```

all visually resolve as:

```text
generic vessel
```

After:

```text
tug_boat        → compact workboat with raised cabin
cargo_large     → long cargo hull with block stacks
container_ship  → long hull with container stacks
tanker          → long rounded tank deck
barge           → flat low rectangle / deck raft
sailboat        → slim hull + mast + triangular sail
yacht           → sleek hull + cabin
ferry           → passenger hull + cabin deck
```

---

# Scope

Modify:

```text
wall/systems/render/worldSpaceVehicleLayer.js
wall/systems/presentation/worldSpaceVehicleDebug.js
```

Optional only if needed:

```text
studio/studioShell.js
studio/styles.css
```

Do not modify:

```text
AISRuntime
MarineVesselTaxonomyResolver
MarineTaxonomyAssetBridge
ActorAssetLibraryAuthority
ActorRenderAuthority
TruthActorRuntime
Mapbox style systems
feed runtimes
hero runtime
```

---

# Authority Boundary

WSL may consume:

```js
payload.silhouetteClass
payload.renderVariant
payload.assetId
payload.paletteRef
payload.taxonomyRole
```

WSL must not:

- inspect AIS shipType
- inspect MMSI
- run taxonomy rules
- mutate payload
- mutate actor truth
- mutate asset records
- mutate global assignments
- call resolver or bridge
- change feed cadence
- change actor IDs

WSL is only allowed to build geometry from already-resolved presentation payload fields.

---

# Required Geometry Dispatch

In `worldSpaceVehicleLayer.js`, extend identity mesh dispatch so these silhouettes route to marine builders:

```text
vessel-generic
unknown-vessel
tug-boat
pilot-boat
service-boat
police-boat
fire-boat
cargo-ship
container-ship
tanker
barge
passenger-ferry
cruise-ship
yacht
sailboat
fishing-boat
```

Use existing ferry builder for:

```text
passenger-ferry
cruise-ship
```

only if new ferry/cruise distinction is too large for v1.

Do not route any marine silhouette to car or truck geometry.

---

# Builder Functions

Add small single-purpose builders.

Recommended:

```js
_buildMarineTugMesh(payload, palette)
_buildMarineServiceBoatMesh(payload, palette)
_buildMarineCargoMesh(payload, palette)
_buildMarineContainerMesh(payload, palette)
_buildMarineTankerMesh(payload, palette)
_buildMarineBargeMesh(payload, palette)
_buildMarineFerryMesh(payload, palette)
_buildMarineYachtMesh(payload, palette)
_buildMarineSailboatMesh(payload, palette)
_buildMarineFishingBoatMesh(payload, palette)
_buildMarineGenericMesh(payload, palette)
```

If this is too much for v1, combine where safe:

```js
_buildMarineWorkboatMesh(kind, payload, palette)
_buildMarineCargoLikeMesh(kind, payload, palette)
_buildMarinePrivateCraftMesh(kind, payload, palette)
```

Avoid one giant marine function.

---

# Geometry Language

Keep the style consistent with WOS 2.5D:

```text
simple low-poly
top-down readable
few primitives
strong silhouettes
contact shadow
no textures
no shaders
no imported assets
no water wakes
no animation
```

This is a silhouette pass, not a realism pass.

---

# Dimensions

Use meter-like dimensions.

Recommended base dimensions:

```text
tug/service/pilot/police/fire: 14m L × 5m W × 3.5m H
fishing:                    16m L × 5m W × 3m H
yacht:                      18m L × 4.5m W × 3m H
sailboat:                   16m L × 4m W × 8m mast visual
ferry:                      35m L × 10m W × 6m H
cruise:                     70m L × 14m W × 10m H
cargo_small:                45m L × 10m W × 6m H
cargo_large/container:      75m L × 14m W × 8m H
tanker:                     70m L × 13m W × 7m H
barge:                      55m L × 16m W × 2m H
generic/unknown:            24m L × 7m W × 4m H
```

Scale classes may further modify these.

Do not make real-world accurate scale the priority.

Readability comes first.

---

# Shape Requirements

## Tug / Workboat

Must read as:

```text
compact hull
high cabin
small rear deck
strong bow wedge
```

Visual cues:

- short thick hull
- raised cabin block near front/mid
- rear deck rectangle
- optional amber/service light

## Pilot / Service / Police / Fire

Can share workboat geometry.

Differentiate through:

- palette
- light class
- small roof beacon
- side stripe / accent bar

## Cargo Ship

Must read as:

```text
long hull
block cargo stacks
small bridge cabin
```

Visual cues:

- long rectangle hull
- bow wedge
- 2–4 cargo stack boxes
- cabin at rear

## Container Ship

Similar to cargo but:

- multiple small container blocks
- grid-like container rows
- wider/longer silhouette

## Tanker

Must read as:

```text
long hull
rounded tank deck
minimal cabin
```

Visual cues:

- long hull
- rounded cylinders or capsule deck forms
- small rear bridge
- dark/red/industrial palette

## Barge

Must read as:

```text
flat low deck raft
```

Visual cues:

- wide flat rectangle
- no tall cabin
- low profile
- optional tiny pusher notch / deck panels

## Ferry

Must read as:

```text
public passenger vessel
```

Visual cues:

- broad hull
- cabin deck
- window strip
- front ramp or bow shape

## Cruise Ship

Can be oversized ferry-like v1.

Visual cues:

- long white hull
- stacked deck blocks
- window bands
- higher height than ferry

## Yacht

Must read as:

```text
sleek private craft
```

Visual cues:

- tapered hull
- low cabin
- glass strip
- pointed bow

## Sailboat

Must read as:

```text
sail silhouette
```

Visual cues:

- narrow hull
- mast line
- triangular sail plane
- optional boom

Do not let sailboat look like a car or ferry.

## Fishing Boat

Must read as:

```text
small work vessel
```

Visual cues:

- compact hull
- cabin
- rear working deck
- optional small mast/rig pole

## Unknown Vessel

Use generic vessel with muted palette.

---

# Palette Use

Use:

```js
payload.paletteRef
```

through existing palette helper.

If palette token is missing, fallback safely.

Do not introduce ColorRegistry dependency if existing palette registry already resolves.

Do not hard-fail on missing palette refs from 0603T.

---

# Contact Shadows

Each vessel should include a simple contact shadow under the hull.

No blur shader.

Use existing contact shadow helper if available.

Suggested:

```text
large cargo/tanker/barge: larger, lower opacity
small craft: tighter shadow
sailboat: narrow shadow
```

---

# Heading

All vessels must respect:

```js
payload.headingDeg
```

through existing WSL transform path.

Do not introduce custom heading math if existing mesh rotation already works.

The local forward axis should remain consistent with existing marine/ferry builders.

---

# Mesh Metadata

Stamp mesh fields for debug:

```js
mesh._presentationMeshKind
mesh._marineGeometryKind
mesh._assetId
mesh._assetKey
mesh._silhouetteClass
mesh._taxonomyRole
mesh._taxonomyConfidence
mesh._renderVariant
```

Where mesh means the top-level group returned by the builder.

---

# Debug State

Extend existing debug output so a rendered marine actor can report:

```js
{
  id,
  actorType,
  assetId,
  assetLabel,
  silhouetteClass,
  taxonomyRole,
  taxonomyConfidence,
  renderVariant,
  marineGeometryKind,
  presentationMeshKind
}
```

Add if simple:

```js
_wos.debug.worldActors.marineGeometryState()
_wos.debug.worldActors.marineGeometrySample()
```

These should not mutate runtime.

---

# Proof Harness

Update the existing visual proof lineup if simple:

- ensure vessel/ferry proof actors show different geometry
- add optional proof actors for:
  - tug
  - cargo
  - tanker
  - barge
  - sailboat

Do not expand proof harness so much that it clutters the stage.

Preferred:

```js
_wos.debug.worldActors.visualProofMarineLineup()
```

Optional v1.

---

# No Taxonomy Logic Here

Do not add:

```js
if shipType === 52
```

inside WSL.

All taxonomy already happened upstream.

WSL only sees:

```js
silhouetteClass: "tug-boat"
assetId: "asset://marine/tug_boat"
renderVariant: "tug_lowpoly"
```

and builds the correct silhouette.

---

# Acceptance Tests

## Test 1: Builder Dispatch

Create payload-like upserts through WSL or proof actor path for:

```text
tug-boat
cargo-ship
container-ship
tanker
barge
passenger-ferry
yacht
sailboat
```

Expected:

```text
each resolves to distinct marineGeometryKind
none routes to traffic_car or box_truck
```

---

## Test 2: Taxonomy Payload Consumed

With a marine actor payload:

```js
{
  actorType: "marine.vessel",
  silhouetteClass: "tug-boat",
  assetId: "asset://marine/tug_boat",
  renderVariant: "tug_lowpoly"
}
```

Expected:

```text
marineGeometryKind: tug-boat
assetId stamped
renderVariant stamped
```

---

## Test 3: Unknown Vessel Safe

For:

```js
silhouetteClass: "unknown-vessel"
```

Expected:

```text
generic/unknown vessel geometry
no crash
```

---

## Test 4: Non-Marine Unchanged

Bus, utility, Citi Bike station, aircraft, hero, and synthetic vehicle still render as before.

Expected:

```text
no car/bus/station regression
```

---

## Test 5: Defaults Unchanged

Run:

```js
SBE.ActorAssetLibraryAuthority.getAssignment("ais.vessel").assetId
```

Expected:

```text
asset://marine/vessel_generic
```

---

## Test 6: Bridge Still Payload-Only

Disable bridge:

```js
SBE.MarineTaxonomyAssetBridge.setEnabled(false)
```

Expected:

```text
live marine actors return to base asset behavior on next payload resolution
geometry pass still works for manual/proof payloads
```

Re-enable:

```js
SBE.MarineTaxonomyAssetBridge.setEnabled(true)
```

---

## Test 7: Screenshot Difference

Using proof or live marine actors, compare:

```text
generic vessel
tug
barge
cargo/container
tanker
sailboat
ferry
```

Expected:

```text
visibly different silhouettes at normal harbor zoom
```

---

# Failure Conditions

This build fails if:

- WSL reads AIS shipType or MMSI directly
- AISRuntime changes
- taxonomy resolver changes
- taxonomy bridge changes beyond payload-field compatibility
- actor IDs change
- marine actor truth changes
- asset records mutate
- global assignment map mutates
- bus/utility/station/hero/aircraft rendering regresses
- marine silhouettes route to car/truck geometry
- missing palette crashes
- unknown vessel crashes
- mesh scale compounds over repeated upserts
- heading breaks for marine actors
- proof harness auto-starts feeds
- Drive breaks

---

# Implementation Notes

## Keep Builders Small

Each builder should be readable.

If using combined helpers, names must still describe the role:

```js
_buildMarineWorkboatMesh("tug", ...)
```

is acceptable.

```js
_buildMarineMesh(...)
```

with 400 lines is not acceptable.

## Reuse Existing Helpers

Reuse:

```js
_palette()
_contactShadow()
_lightCues()
```

if already present.

Do not fork color or shadow logic unless necessary.

## Screenshot Priority

This is a visual pass.

Favor:

```text
clear silhouette
obvious category difference
stable render
```

over:

```text
real maritime accuracy
full detail
perfect scale
```

---

# Future Follow-Ups

After this:

```text
0603X_WOS_MarineAssetPalettePack_v1.0.0_BUILD
0603Y_WOS_AISVesselMetadataAudit_v1.0.0_BUILD
0603Z_WOS_HarborActorVisualDifferentiationPass_v1.0.0_BUILD
0604A_WOS_HarborAtmospherePass_v1.0.0_BUILD
```

---

# Implementation Guide

- **Where**: Extend marine dispatch and add compact marine geometry builders in `wall/systems/render/worldSpaceVehicleLayer.js`; add read-only marine geometry debug helpers in `wall/systems/presentation/worldSpaceVehicleDebug.js`; optionally add a dedicated marine proof lineup if it can reuse existing proof infrastructure safely.
- **What**: Run `node --check wall/systems/render/worldSpaceVehicleLayer.js` and `node --check wall/systems/presentation/worldSpaceVehicleDebug.js`; spawn or proof-test `tug-boat`, `cargo-ship`, `container-ship`, `tanker`, `barge`, `passenger-ferry`, `yacht`, and `sailboat`; verify `ais.vessel` default assignment remains generic.
- **Expect**: Marine payloads with different `silhouetteClass` values produce visibly different low-poly world-space vessel geometry, while AIS truth, taxonomy logic, bridge logic, asset assignments, non-marine actors, hero, feeds, Drive, and Mapbox behavior remain unchanged.
