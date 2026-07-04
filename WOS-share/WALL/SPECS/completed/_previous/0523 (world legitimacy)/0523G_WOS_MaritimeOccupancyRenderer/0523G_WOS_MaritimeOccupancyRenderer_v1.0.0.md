# 0523G_WOS_MaritimeOccupancyRenderer_v1.0.0

## Build Objective

Implement the first visible harbor occupancy layer for WOS.

This system is responsible for rendering:

- AIS vessels
- synthetic ecology vessels
- wake segments
- atmospheric visibility states
- density-aware harbor occupancy

This is a presentation layer only.

Renderer owns presentation.  
Renderer does NOT own:

- AIS truth
- wake truth
- spawn ecology
- continuity
- population hierarchy
- atmospheric authority

---

# Dependencies

Consume ONLY:

- 0523A MaritimeTaxonomyProfiles
- 0523B PopulationHierarchy
- 0523C SpawnEcology
- 0523D WakeAuthority
- 0523E AtmosphericReadability
- 0523F ContinuityDensity

Renderer must remain read-only.

---

# Core Renderer Responsibilities

## Vessel Rendering

Render:

- HERO
- MID
- BACKGROUND
- GHOST

using:

- tier-aware scale
- tier-aware alpha
- taxonomy silhouette class
- atmospheric readability visibilityClass

---

## Atmospheric Visibility Consumption

Consume:

```
visibilityClass
```

Valid states:

```
FULLREDUCEDSILHOUETTELIGHT_ONLYMARKER_ONLYATMOSPHERIC_HIDDEN
```

Renderer may interpret visibility.

Renderer may NOT override visibility authority.

---

## Wake Rendering

Render wake segments from WakeAuthority.

Rules:

- AIS wake provenance visually prioritized
- synthetic wakes visually secondary
- parentEvicted may alter fade only
- parentEvicted may NOT alter geometry
- no fabricated wake continuity

Wake rendering remains atmospheric residue only.

NOT:

- hydrodynamic simulation
- gameplay mechanic
- continuity authority

---

# Density Consumption

Consume:

```
clutterPressuredensityClass
```

for:

- label suppression
- alpha shaping
- atmospheric crowding
- visual clutter reduction

Renderer may NOT:

- hide AIS truth
- mutate population hierarchy
- suppress spawn ecology
- alter continuity state

---

# Projection Rules

2D owns truth.

Renderer owns projection only.

Forbidden:

- renderer-side coordinate smoothing
- wake interpolation fabrication
- synthetic continuity generation
- camera-driven vessel retention
- visibility-driven AIS mutation

---

# Initial Visual Goals

Target:

- visible harbor occupancy
- believable vessel persistence
- atmospheric harbor density
- readable wakes
- Manhattan shoreline activity
- Verrazzano traffic visibility
- East River movement
- Hudson occupancy perception

NOT:

- final graphics
- cinematic polish
- gameplay systems
- advanced shaders

Goal is:

```
prove the harbor can feel alive
```

---

# Suggested Runtime Files

```
wall/  render/    maritimeOccupancyRenderer.js
```

Optional:

```
wall/  render/    maritimeWakeRenderer.jswall/  render/    maritimeLabelRenderer.js
```

---

# Validation Checklist

- [ ]  Renderer remains read-only
- [ ]  No AIS mutation
- [ ]  No wake mutation
- [ ]  No spawn mutation
- [ ]  No continuity mutation
- [ ]  VisibilityClass consumed only
- [ ]  No fabricated wake continuity
- [ ]  AIS wakes visually prioritized
- [ ]  Synthetic wakes visually secondary
- [ ]  Density remains advisory only
- [ ]  No camera authority leakage
- [ ]  Renderer never invents truth
- [ ]  Harbor remains performant at scale

---

# Implementation Guide

- **Where this goes:** `wall/render/maritimeOccupancyRenderer.js`
- **What to run:** render AIS + synthetic vessels using atmosphere, density, and wake systems as read-only inputs
- **What to expect:** the first truly inhabited WOS harbor layer with persistent visible maritime occupancy