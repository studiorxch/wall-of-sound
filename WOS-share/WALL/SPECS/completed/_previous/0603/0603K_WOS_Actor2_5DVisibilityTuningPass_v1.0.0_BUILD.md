```
# 0603K_WOS_Actor2_5DVisibilityTuningPass_v1.0.0 [BUILD
]## PurposeImprove immediate readability of the new 2.5D actor presentation system.This pass exists because:```textThe infrastructure is working.The visibility is not.
```

The goal is not new actor types.

The goal is:

```
better screenshotsbetter videosbetter first impressions
```

without violating Truth Actor Runtime authority.

---

# Problem

0603J successfully introduced:

- city buses
- utility trucks
- ferries
- vessels
- aircraft
- station nodes

However current visibility remains weak.

Observed issues:

### City Bus

Appears visually similar to:

```
long blue rectangle
```

at common operating zooms.

---

### Utility Truck

Silhouette difference exists but is difficult to notice.

---

### Stations

Availability accents work.

Overall presence remains too subtle.

---

### Aircraft

Can disappear into scene noise.

---

### Harbor Actors

Can blend into waterways.

---

# Constitutional Constraints

## Truth Remains Untouched

Must NOT modify:

```
TruthActorRuntimeActorRenderAuthorityAISRuntimeGBFSRuntimeGTFSRuntimeMapboxViewportRuntime
```

No truth changes.

No feed changes.

No polling changes.

No actor state changes.

---

## Presentation Only

May modify:

```
worldSpaceVehicleLayer.jsactorPresentationPaletteRegistry.js
```

Only visual interpretation.

---

# Goals

## Goal 1

Increase actor readability at:

```
Zoom 11Zoom 12Zoom 13Zoom 14
```

Current visibility loss is most noticeable here.

---

## Goal 2

Preserve differentiation.

A bus should look like:

```
bus
```

not:

```
large car
```

---

## Goal 3

Preserve screenshot value.

Actors should remain recognizable in:

```
static screenshotsYouTube thumbnailsstream previews
```

without requiring interaction.

---

# Visibility Authority

Add:

```
ACTOR_VISIBILITY_PROFILE
```

Example:

```
{  cityBus: {    scale: 1.35,    shadow: 1.20  },  utilityTruck: {    scale: 1.25,    shadow: 1.15  },  ferry: {    scale: 1.15,    shadow: 1.20  },  aircraft: {    scale: 1.50,    opacity: 1.00  },  station: {    scale: 1.35  }}
```

Applied once during mesh construction.

Never cumulative.

---

# Bus Visibility Pass

Increase:

```
route strip thicknessglass strip contrastfront fascia contrast
```

Add:

```
slightly taller roof profile
```

Goal:

```
bus silhouette visible immediately
```

---

# Utility Visibility Pass

Increase:

```
equipment box heighthazard stripe visibility
```

Beacon bar:

```
wider
```

still static.

No animation.

---

# Ferry Visibility Pass

Increase:

```
deckhouse heightroof contrast
```

Improve separation between:

```
hullcabin
```

from aerial view.

---

# Vessel Visibility Pass

Increase:

```
bow wedge prominence
```

Maintain:

```
navigation lights
```

---

# Aircraft Visibility Pass

Current:

```
too faint
```

Increase:

```
wing spantail span
```

Increase minimum opacity:

```
1.0
```

for aircraft-light.

Purpose:

```
readable from regional zoom
```

---

# Station Visibility Pass

Increase:

```
puck diametercap diameter
```

by approximately:

```
20%
```

Maintain:

```
availability-state accents
```

---

# Contact Shadow Pass

Current shadows:

```
too subtle
```

Increase:

```
15–25%
```

per profile.

Do NOT introduce blur.

Do NOT introduce shaders.

Simple opacity adjustment only.

---

# LOD Protection

New actor silhouettes must remain visible through:

```
Zoom 10Zoom 15
```

Add minimum visibility floor.

Purpose:

```
prevent actor collapse into noise
```

before atmospheric tuning exists.

---

# Debug Authority

Add:

```
_wos.debug.worldActors.visibilityState()
```

Returns:

```
{  actorType,  silhouetteClass,  scaleMultiplier,  opacity,  shadowOpacity}
```

---

# Acceptance Criteria

## Bus

Immediately identifiable as:

```
bus
```

from neighborhood zoom.

---

## Utility

Immediately identifiable as:

```
utility vehicle
```

from neighborhood zoom.

---

## Ferry

Clearly distinguishable from:

```
generic vessel
```

---

## Aircraft

Visible without requiring hover.

---

## Station

Visible without requiring hover.

---

## Truth

No runtime changes.

No feed changes.

No actor authority changes.

---

# Expected Result

Before:

```
Actor system works.Visual difference requires inspection.
```

After:

```
Actor system works.Visual difference is obvious.
```

The objective is not realism.

The objective is:

```
instant readability.
```

---

# Implementation Guide

### Where

```
wall/systems/render/worldSpaceVehicleLayer.jsactorPresentationPaletteRegistry.js
```

### What

```
npm run build
```

Reload WOS.

Run:

```
_wos.debug.worldActors.testBus()_wos.debug.worldActors.testUtility()_wos.debug.worldActors.visibilityState()
```

### Expect

```
Buses visibly larger.Utility trucks visibly distinct.Stations easier to locate.Aircraft readable.Ferries distinguishable from vessels.No Truth Actor Runtime changes.
```