---
layout: spec
title: "Marine Asset Palette Pack"
date: 2026-06-03
doc_id: "0603_WOS_MarineAssetPalettePack_v1.0.0"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"

domain: "actors"
component: "marine_asset_palette_pack"

type: "system-spec"
status: "approved"

priority: "high"
risk: "low"

classification: "palette-pack"

summary: "Adds marine-specific palette tokens for the 0603T marine asset pack so taxonomy-driven vessels render with distinct, readable harbor colors without changing AIS truth, taxonomy, geometry, or assignments."

depends_on:
  - "0603T_WOS_MarineVesselAssetPack_v1.0.0_BUILD"
  - "0603V_WOS_MarineTaxonomyAssetBridge_v1.0.0_BUILD"
  - "0603W_WOS_MarineAssetWorldGeometryPass_v1.0.0_BUILD"

enables:
  - "marine color differentiation"
  - "harbor readability"
  - "taxonomy-driven palette clarity"
  - "workboat/commercial/private vessel distinction"
  - "future night lighting pass"

tags:
  - "wos"
  - "marine"
  - "palette"
  - "asset-library"
  - "vessels"
  - "rendering"
  - "harbor"
---

# 0603X_WOS_MarineAssetPalettePack_v1.0.0_BUILD

## Build Readiness

[BUILD]

---

# Purpose

Add marine-specific palette tokens for the vessel asset pack.

0603W made the shapes different.

0603X makes the colors different.

The goal is simple:

```text
different vessel role
→ different readable color family
```

without touching truth, taxonomy, assignments, or geometry.

---

# Core Result

Before:

```text
tug
cargo
tanker
barge
sailboat
yacht
ferry
```

may still collapse into fallback gray/cyan palette behavior.

After:

```text
tug/service boats → orange / yellow workboat language
police/fire boats → civic emergency language
cargo/container   → rust / industrial language
tanker            → black-red industrial language
barge             → muted gray deck language
ferry             → blue-white public transit language
cruise            → white / pale blue passenger language
yacht/sailboat    → white private craft language
fishing           → green-white working craft language
unknown           → muted gray
```

---

# Required Files

Modify:

```text
wall/systems/actors/actorPresentationPaletteRegistry.js
```

Optional only if debug wrappers are missing:

```text
wall/systems/presentation/worldSpaceVehicleDebug.js
studio/studioShell.js
```

Do not modify:

```text
AISRuntime
MarineVesselTaxonomyResolver
MarineTaxonomyAssetBridge
ActorAssetLibraryAuthority
ActorRenderAuthority
WorldSpaceVehicleLayer
TruthActorRuntime
Mapbox style systems
feed runtimes
hero runtime
```

---

# Authority Boundary

Palette registry owns:

- palette token resolution
- numeric Three.js color values
- readable fallback palettes
- palette listing

Palette registry does not own:

- asset assignment
- taxonomy
- geometry dispatch
- actor truth
- AIS metadata
- renderer behavior

---

# Required Palette Tokens

Add these palette refs:

```text
marine.truth-blue
marine.workboat.orange
marine.service.yellow
marine.police.blue-white
marine.fire.red-white
marine.cargo.rust
marine.container.dark
marine.tanker.black-red
marine.barge.gray
marine.ferry.blue-white
marine.cruise.white
marine.yacht.white
marine.sailboat.white
marine.fishing.green-white
marine.unknown.gray
```

These match the 0603T asset pack palette refs.

---

# Palette Object Shape

Each palette must resolve through existing registry format:

```js
{
  key,
  body,
  roof,
  side,
  glass,
  accent,
  light,
  shadow,
  stroke,
  opacity
}
```

Colors should be numeric hex values usable by Three.js materials.

Example:

```js
{
  key: "marine.workboat.orange",
  body: 0xf28c28,
  roof: 0xf7c95f,
  side: 0x8f4a18,
  glass: 0x10202a,
  accent: 0xffd34d,
  light: 0xffffff,
  shadow: 0x000000,
  stroke: 0x1a1210,
  opacity: 1
}
```

---

# Recommended Palette Values

Use these as starting values.

## `marine.truth-blue`

```js
body:   0x1f6f8b
roof:   0xd9f2ff
side:   0x13485f
glass:  0x0b1f2a
accent: 0x52e0ff
light:  0xffffff
shadow: 0x000000
stroke: 0x06202c
opacity: 1
```

## `marine.workboat.orange`

```js
body:   0xf28c28
roof:   0xf7c95f
side:   0x8f4a18
glass:  0x10202a
accent: 0xffd34d
light:  0xffffff
shadow: 0x000000
stroke: 0x241308
opacity: 1
```

## `marine.service.yellow`

```js
body:   0xf4c430
roof:   0xffe38a
side:   0x9b6d00
glass:  0x111b20
accent: 0xff7a00
light:  0xffffff
shadow: 0x000000
stroke: 0x241b00
opacity: 1
```

## `marine.police.blue-white`

```js
body:   0xeff7ff
roof:   0xffffff
side:   0x184f9c
glass:  0x071523
accent: 0x2aa8ff
light:  0xffffff
shadow: 0x000000
stroke: 0x061426
opacity: 1
```

## `marine.fire.red-white`

```js
body:   0xd92d20
roof:   0xffffff
side:   0x7a120d
glass:  0x160b0b
accent: 0xffd34d
light:  0xffffff
shadow: 0x000000
stroke: 0x260606
opacity: 1
```

## `marine.cargo.rust`

```js
body:   0x9a4b22
roof:   0xd9b08c
side:   0x4f2815
glass:  0x111820
accent: 0xf0a04b
light:  0xffffff
shadow: 0x000000
stroke: 0x1f0e08
opacity: 1
```

## `marine.container.dark`

```js
body:   0x2c3e50
roof:   0x5d6d7e
side:   0x17202a
glass:  0x08131d
accent: 0xe67e22
light:  0xffffff
shadow: 0x000000
stroke: 0x061018
opacity: 1
```

## `marine.tanker.black-red`

```js
body:   0x1f1f1f
roof:   0x5a5a5a
side:   0x0d0d0d
glass:  0x101820
accent: 0xb3261e
light:  0xffffff
shadow: 0x000000
stroke: 0x000000
opacity: 1
```

## `marine.barge.gray`

```js
body:   0x6f7478
roof:   0x9ea5aa
side:   0x3c4246
glass:  0x111820
accent: 0xd6b15f
light:  0xffffff
shadow: 0x000000
stroke: 0x171a1d
opacity: 1
```

## `marine.ferry.blue-white`

```js
body:   0xf3f8ff
roof:   0xffffff
side:   0x1f6fba
glass:  0x081827
accent: 0x4dd8ff
light:  0xffffff
shadow: 0x000000
stroke: 0x061a2b
opacity: 1
```

## `marine.cruise.white`

```js
body:   0xf8fbff
roof:   0xffffff
side:   0xbfd2e2
glass:  0x0d2538
accent: 0x79d8ff
light:  0xffffff
shadow: 0x000000
stroke: 0x4f6170
opacity: 1
```

## `marine.yacht.white`

```js
body:   0xfafafa
roof:   0xffffff
side:   0xcfd8dc
glass:  0x0a2233
accent: 0x58d8ff
light:  0xffffff
shadow: 0x000000
stroke: 0x68777f
opacity: 1
```

## `marine.sailboat.white`

```js
body:   0xf8f8f2
roof:   0xffffff
side:   0xd9d9cf
glass:  0x102838
accent: 0xfff2b8
light:  0xffffff
shadow: 0x000000
stroke: 0x6f6f64
opacity: 1
```

## `marine.fishing.green-white`

```js
body:   0x2e7d5b
roof:   0xf2fff8
side:   0x164d37
glass:  0x0c1e18
accent: 0xffd166
light:  0xffffff
shadow: 0x000000
stroke: 0x062014
opacity: 1
```

## `marine.unknown.gray`

```js
body:   0x7c858b
roof:   0xaeb7bd
side:   0x4c555b
glass:  0x111820
accent: 0x9aa0a6
light:  0xffffff
shadow: 0x000000
stroke: 0x22282c
opacity: 0.85
```

---

# Contrast Requirement

Palettes must remain readable against the current WOS dark/cyan basemap.

Avoid:

```text
all-cyan
all-blue
low-contrast black-on-water
pure white everywhere
```

White vessels must use darker `side`, `glass`, and `stroke` values.

---

# Registry Behavior

Existing fallback behavior must remain:

```text
unknown palette ref → actor.generic
```

No throw.

Do not remove existing palette tokens.

Do not rename existing tokens.

---

# Studio Requirements

Studio Palette Lab should automatically show new marine palette tokens if it already lists the registry.

No special UI required.

Asset Library should show updated swatches for marine assets.

No feeds.

No map.

No Drive.

---

# Debug API

If not already available, add or verify:

```js
_wos.debug.worldActors.actorPaletteList()
```

and optionally:

```js
_wos.debug.studio.marinePalettes()
```

Expected:

```js
{
  count: 15,
  palettes: [...]
}
```

---

# Acceptance Tests

## Test 1: Palette Count

Run:

```js
[
  "marine.truth-blue",
  "marine.workboat.orange",
  "marine.service.yellow",
  "marine.police.blue-white",
  "marine.fire.red-white",
  "marine.cargo.rust",
  "marine.container.dark",
  "marine.tanker.black-red",
  "marine.barge.gray",
  "marine.ferry.blue-white",
  "marine.cruise.white",
  "marine.yacht.white",
  "marine.sailboat.white",
  "marine.fishing.green-white",
  "marine.unknown.gray"
].every(k => !!SBE.ActorPresentationPaletteRegistry.resolvePalette(k))
```

Expected:

```text
true
```

---

## Test 2: No Fallback for Marine Pack

Run:

```js
SBE.ActorPresentationPaletteRegistry.resolvePalette("marine.workboat.orange").key
```

Expected:

```text
marine.workboat.orange
```

Not:

```text
actor.generic
```

---

## Test 3: Marine Assets Resolve Palettes

For every marine asset:

```js
var assets = SBE.ActorAssetLibraryAuthority.listByCategory("marine");
assets.map(a => SBE.ActorPresentationPaletteRegistry.resolvePalette(a.paletteRef).key)
```

Expected:

```text
No marine asset palette resolves to actor.generic unless the asset intentionally uses a generic palette.
```

---

## Test 4: Studio Swatches

Open:

```text
studio/index.html#asset-library
```

Expected:

```text
marine assets show distinct swatches
workboat/cargo/tanker/ferry/yacht/sailboat differ visibly
```

---

## Test 5: World Geometry Still Works

Spawn/proof marine payloads for:

```text
tug
cargo
tanker
barge
ferry
sailboat
```

Expected:

```text
distinct geometry from 0603W remains
colors now differ by palette
no crash
```

---

## Test 6: Non-Marine Unchanged

Bus, utility, Citi Bike, aircraft, hero, and synthetic palettes still resolve as before.

---

# Failure Conditions

This build fails if:

- any required marine palette token is missing
- marine assets fall back to `actor.generic` unexpectedly
- existing palette tokens are removed or renamed
- missing palette fallback breaks
- Studio fails to load
- WSL fails to build marine geometry
- AIS truth changes
- taxonomy bridge changes
- actor assignments change
- actor IDs change
- feeds start in Studio
- Drive breaks
- Mapbox style changes

---

# Implementation Notes

## Keep Palette Pack Small

This is not a full color-design system.

It is a focused marine token pack.

## No Geometry Changes

Do not adjust shape builders here.

If colors reveal geometry problems, log them for a later geometry refinement.

## No Taxonomy Changes

Do not add or adjust AIS ship-type logic.

0603X is color only.

---

# Future Follow-Ups

After this:

```text
0603Y_WOS_AISVesselMetadataAudit_v1.0.0_BUILD
0603Z_WOS_HarborActorVisualDifferentiationPass_v1.0.0_BUILD
0604A_WOS_HarborAtmospherePass_v1.0.0_BUILD
0604B_WOS_MarineLightCuePass_v1.0.0_BUILD
```

---

# Implementation Guide

- **Where**: Add the 15 required `marine.*` palette records to `wall/systems/actors/actorPresentationPaletteRegistry.js`; optionally add a Studio debug helper for `marinePalettes()` if useful.
- **What**: Run `node --check wall/systems/actors/actorPresentationPaletteRegistry.js` and `node --check studio/studioShell.js`; verify all 15 `marine.*` refs resolve to themselves; open `studio/index.html#asset-library`; test marine proof/live payload colors.
- **Expect**: Marine vessels keep their 0603W distinct silhouettes and now receive distinct readable color palettes by role, while AIS truth, taxonomy, asset assignments, renderer geometry, non-marine actors, Studio feed behavior, Drive, and Mapbox style remain unchanged.
