# 0612U_WOS_AllVisibleBuildingSurfaceTextureRuntime_v1.0.0_BUILD

## Status

BUILD

---

# Purpose

Apply visible organic surface texture treatment to **all visible buildings**, not only WOS replacement buildings.

0612T proved that organic surface textures can render on WOS replacement meshes, but it did not solve the visible problem in the scene: the large host / Mapbox buildings remain plain white blocks.

This build exists to make the visible city surface read as illustrated architecture immediately, without requiring the user to run console commands.

---

# Problem Statement

Current behavior:

```text
WOS replacement building → may receive organic texture
Large visible host buildings → remain plain
User must run debug commands
```

Required behavior:

```text
All visible buildings → receive visible illustration texture treatment
No console command required
Studio and Wall match on load
```

This build fails if only replacement buildings receive texture.

---

# Authority Boundary

This runtime owns:

```text
visible building surface texture application
organic patch rendering
building material overlay visibility
auto-activation of the texture pass
```

This runtime does not own:

```text
building selection
building replacement registry
building deletion
publish authority
map style authority
density authority
camera authority
weather/time overlays
Studio UI controls
Canvas
Color Lab
Palette Lab
Glyph Lab
```

---

# Required File

Create:

```text
wall/systems/presentation/allVisibleBuildingSurfaceTextureRuntime.js
```

Version:

```text
v1.0.0
```

Add script tags to:

```text
wall/index.html
studio/index.html
```

Load after:

```text
organicBuildingSurfacePatternRuntime.js
```

---

# Critical Requirement

The runtime must auto-enable.

No manual console command should be required to see the effect.

Expected:

```text
open Wall → building texture visible
open Studio Map Lab → building texture visible
```

Debug commands may exist, but they are not the activation path.

---

# Visual Target

All visible buildings should show:

```text
large organic patch regions
thin internal border lines
subtle speckles
weathered material variation
visible roof treatment
visible wall / facade treatment when technically possible
```

Target direction:

```text
Moebius / French sci-fi illustration
Syd Mead material clarity
architectural concept art
country-border / geological patch language
```

---

# Host Building Requirement

The large white host buildings must visibly change.

This build fails if:

```text
only WOS replacement actors change
only small custom meshes change
host buildings remain plain white
```

---

# Implementation Decision Tree

## Path A — True Host Building Texture

If Mapbox host building layers can accept visible texture-like treatment:

```text
apply material expression / pattern / overlay to host building layers
ensure large buildings visibly change
```

## Path B — Host Building Proxy Overlay

If Mapbox fill-extrusion cannot receive true face textures:

```text
generate WOS-owned proxy meshes for visible host buildings
hide or fade the original host building layer enough that the proxy reads clearly
apply organic textures to the proxy meshes
```

## Path C — Honest Failure

If neither Path A nor Path B is feasible in v1.0.0:

```text
return FAIL_HOST_BUILDING_TEXTURE_NOT_SUPPORTED
do not fake success with replacement-only texture
do not leave invisible overlay code
```

---

# Feature Discovery

The runtime must discover visible building features from the active Mapbox map.

Required discovery sources:

```text
rendered building features
source-layer: building
wos-host-building-layer
map-lab-buildings-3d
wos-replacement-layer
WOS replacement actors
Studio BuildingEditRegistry edits
```

The runtime must clearly report which source produced the visible textured result.

---

# Required Strategy Report

`report()` must return:

```js
{
  ok: true,
  version: "1.0.0",
  enabled: true,
  autoEnabled: true,

  hostBuildingTextureSupported: true,
  hostBuildingTextureStrategy: "mapbox-layer" | "proxy-mesh" | "unsupported",

  visibleHostBuildingCount: 0,
  texturedHostBuildingCount: 0,
  replacementBuildingCount: 0,
  texturedReplacementBuildingCount: 0,

  wallSupported: true,
  studioSupported: true,

  largeHostBuildingsChanged: true,
  consoleCommandRequired: false,

  lastError: null
}
```

---

# Auto-Enable Flow

Expected flow:

```text
script loads
→ waits for map ready / style loaded
→ discovers visible building layers/features
→ applies texture strategy
→ triggers repaint
→ exposes report
```

No user activation required.

---

# Debug API

Expose:

```js
SBE.AllVisibleBuildingSurfaceTextureRuntime.enable()
SBE.AllVisibleBuildingSurfaceTextureRuntime.disable()
SBE.AllVisibleBuildingSurfaceTextureRuntime.report()
SBE.AllVisibleBuildingSurfaceTextureRuntime.setIntensity(value)
SBE.AllVisibleBuildingSurfaceTextureRuntime.setProfile(profileId)
SBE.AllVisibleBuildingSurfaceTextureRuntime.refresh()
```

Mirror under:

```js
_wos.debug.allVisibleBuildingTexture.*
```

---

# Required Profiles

Include at least:

```text
warmConcrete
paintedConcrete
industrialGreen
signalOrange
glassBlue
civicStone
```

Every profile must be visibly different.

Every profile must maintain enough contrast for immediate visual proof.

---

# Acceptance Tests

## T1 — Auto-Enable Wall

Open:

```text
/wall/index.html
```

Expected:

```text
building texture visible without console command
```

---

## T2 — Auto-Enable Studio

Open:

```text
/studio/index.html#map-lab
```

Expected:

```text
building texture visible without console command
```

---

## T3 — Host Building Visible Change

The large white host buildings must visibly change.

Expected:

```text
organic patch regions or visible material variation on large host buildings
```

Forbidden:

```text
host buildings remain plain white
```

---

## T4 — Replacement Building Still Works

WOS replacement buildings must keep or receive the same organic texture treatment.

---

## T5 — Studio / Wall Sync

Studio and Wall must show the same texture treatment on equivalent buildings.

Allowed difference:

```text
Wall may have weather/time overlays.
```

Forbidden difference:

```text
Wall textured, Studio plain
Studio textured, Wall plain
different material logic
different profile defaults
```

---

## T6 — Disable

Console:

```js
_wos.debug.allVisibleBuildingTexture.disable()
```

Expected:

```text
texture treatment removed
original building appearance restored
```

---

## T7 — Strong Mode

Console:

```js
_wos.debug.allVisibleBuildingTexture.setIntensity(2)
```

Expected:

```text
obvious organic borders and patch regions on visible host buildings
```

---

## T8 — Honest Failure

If host building texture is impossible:

Expected:

```js
{
  ok: false,
  reason: "FAIL_HOST_BUILDING_TEXTURE_NOT_SUPPORTED"
}
```

Do not claim success if only replacement buildings changed.

---

# Visual Verification Requirement

Claude/Codex must return screenshot descriptions:

```text
Before:
large host buildings are plain

After:
large host buildings visibly show texture / patch treatment

Replacement:
WOS replacement building also shows treatment
```

Console-only proof is not accepted.

---

# Failure Conditions

This build fails if:

```text
console command required to activate
only WOS replacement buildings change
large host buildings remain plain
Studio and Wall diverge
effect only appears on ground footprints
effect only appears as outline
report claims success without visual host-building change
```

---

# Non-Goals

Do not build:

```text
new Studio UI
new tabs
new inspector controls
new Color Lab
new Palette Lab
new Glyph Lab
new Canvas feature
new publish workflow
new density workflow
new replacement workflow
```

---

# Claude Instruction

Keep this narrow.

The user asked to texture all visible buildings.

Do not solve this by adding another panel.

Do not solve this by texturing only replacement actors.

Do not hide failure behind console success.

If Mapbox host building face texture is not possible directly, attempt a visible proxy-mesh strategy.

If proxy mesh strategy is not feasible, report failure clearly and stop.

---

# Deliverables

Return:

```text
1. Files changed
2. Exact load order
3. Auto-enable proof
4. Public API proof
5. Debug API proof
6. Host building discovery report
7. Host building texture strategy used
8. Before screenshot description
9. After screenshot description
10. Studio/Wall parity proof
11. Failure or limitations
```

---

# Success Definition

This build succeeds only when the large visible host buildings visibly receive organic surface texture treatment automatically on load.

A viewer should not need DevTools or console commands to know that the texture pass is active.
