---
layout: spec

title: "WOS Map Style Authority Sync"
date: 2026-06-12
doc_id: "0612Q_WOS_MapStyleAuthoritySync_v1.0.0"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"

domain: "geography"
component: "map_style_authority_sync"

type: "system-spec"
status: "canonical-draft"

priority: "high"
risk: "high"

classification: "runtime-authority"

summary: "Defines the required authority sync between the Wall map and Studio Map Lab map so both maps resolve the same base style, lighting, fog, and extrusion profile from one source of truth."

doctrine:
  - "2D owns truth"
  - "2.5D owns presentation"
  - "One style authority owns map visual truth"

depends_on:
  - "threeViewStyleParityLock"
  - "mapLabView"
  - "mapboxAdapter"
  - "studio/index.html"
  - "wall/index.html"

enables:
  - "Authored City Zone Density Authority"
  - "Skyline-Only Building Filter"
  - "Ghost Footprint Layer"
  - "WOS Object Placement"

tags:
  - "map-style"
  - "mapbox"
  - "studio"
  - "wall"
  - "authority-sync"
---

# 0612Q_WOS_MapStyleAuthoritySync_v1.0.0_BUILD

## Purpose

The two visible maps are still not style-synced.

The Wall map and Studio Map Lab map must share the same authoritative style source.

Loading `threeViewStyleParityLock.js` is not enough.

The issue is that Studio Map Lab appears to instantiate or maintain its own Mapbox style instead of consuming the same resolved WOS map style authority used by the Wall view.

This build exists to establish one authoritative map style source and require both map instances to consume it.

---

## Direct Problem

Current visual behavior:

```txt
Wall map        → WOS cyan-on-dark skyline style
Studio Map Lab  → separate darker/default Mapbox 3D building style
```

This means Map Lab previews cannot be trusted as production previews.

The Studio map is not visually authoritative if it does not match the Wall map.

---

## Required Authority

Create or expose a single style authority:

```js
SBE.WOSMapStyleAuthority
```

It must own the currently active WOS map style configuration.

Both maps must consume it:

```txt
Wall map instance
Studio Map Lab map instance
```

No map instance may independently define its own base style if it is supposed to match WOS.

---

## Core Rule

There must be exactly one answer to:

```txt
What map style is WOS using right now?
```

Both Wall and Studio Map Lab must resolve that answer from the same authority.

```txt
WOSMapStyleAuthority
├── Wall Map
└── Studio Map Lab Map
```

---

## Required Behavior

When Wall is using the cyan-on-dark WOS style, Studio Map Lab must use the same style.

When the active WOS style changes, both maps must resolve to the same style profile.

Map Lab Author/Preview mode may change:

- editing overlays
- selected-building treatment
- outlines
- debug layers
- inspection markers

Map Lab Author/Preview mode may NOT change:

- base map style
- road palette
- land palette
- water palette
- building extrusion color profile
- fog profile
- lighting profile
- base atmospheric style

---

## Files To Inspect First

```txt
studio/mapLab/mapLabView.js
studio/mapLab/mapboxAdapter.js
wall/systems/presentation/threeViewStyleParityLock.js
wall/index.html
studio/index.html
```

Find:

- where each Mapbox map is instantiated
- where `style:` is set
- where Wall gets its current visual style
- where Map Lab gets its current visual style
- where building extrusion styling is applied
- whether Map Lab is overriding or restyling buildings after load

---

## Required Fix

Replace duplicated or hardcoded style selection with one shared resolver.

Recommended resolver API:

```js
SBE.WOSMapStyleAuthority = {
  getActiveStyleProfile: function () {},
  getMapboxStyle: function () {},
  applyToMap: function (map, options) {},
  getDebugState: function () {}
};
```

The exact implementation can vary, but the authority boundary must not.

---

## Required Debug Output

Debug state must identify the active style profile and all registered map consumers.

Example:

```js
SBE.WOSMapStyleAuthority.getDebugState()
```

Expected shape:

```js
{
  activeStyleId: "wos.dark.cyan",
  consumers: {
    wall: {
      registered: true,
      appliedStyleId: "wos.dark.cyan"
    },
    studioMapLab: {
      registered: true,
      appliedStyleId: "wos.dark.cyan"
    }
  },
  mismatches: []
}
```

If styles diverge, the debug state must expose the mismatch.

---

## Acceptance Tests

1. Open Wall.
2. Open Studio Map Lab.
3. Confirm both maps use the same base style.
4. Roads, water, land, building colors, fog, light, and extrusion treatment match.
5. Studio Map Lab may still show editing overlays, but the base visual style must match Wall.
6. No hardcoded divergent Mapbox style remains inside Map Lab.
7. Debug output shows the same resolved style id/profile for both map instances.
8. Switching style profile updates both consumers or clearly marks one as stale.
9. Map Lab Preview mode does not replace the base style.
10. Map Lab Author mode does not replace the base style.

---

## Do Not

Do not create another visual workaround.

Do not manually approximate colors in Map Lab.

Do not only sync buildings.

Do not only sync Preview mode.

Do not rely on screenshot matching.

Do not leave two independent style authorities.

Do not hide the issue behind `threeViewStyleParityLock.js` unless that file actually becomes or delegates to the single authority.

---

## Non-Goals

This build does not implement:

- authored city zones
- skyline-only filtering
- ghost footprint layer
- landmark registry
- event interest graph
- advertising/commercial layer
- WOS symbolic building replacement

Those are blocked until style authority is synced.

---

## Hard Blocker Rule

Before any more Map Lab features:

```txt
Wall map style and Studio Map Lab style must be identical by authority, not by visual approximation.
```

If this is not true, Map Lab cannot be trusted as a production preview tool.

---

## Implementation Guide

- **Where**: Inspect and update `studio/mapLab/mapLabView.js`, `studio/mapLab/mapboxAdapter.js`, `wall/systems/presentation/threeViewStyleParityLock.js`, `wall/index.html`, and `studio/index.html`.
- **What**: Run the local server, open both Wall and Studio Map Lab, then verify both map instances resolve style through `SBE.WOSMapStyleAuthority`.
- **Expect**: Wall and Studio Map Lab display the same base map style, with only Studio-specific edit overlays differing.
