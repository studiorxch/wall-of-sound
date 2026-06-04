# 0528Z — WOS Predictive Tile Preload Camera v1.0.0

**Status:** shipped  
**Date:** 2026-05-28  
**Classification:** runtime — production-safe

---

## Problem

During surface-glide traversal, Mapbox tiles at zoom ~17 can arrive 200–600ms after the visible camera reaches that position. Buildings and roads pop in visibly because the browser hasn't fetched those tiles yet — they're simply not in the network queue until the main viewport requests them.

The TCA veil (0528X) and BCR extrusion probing (0528W) conceal this cinematically, but the root cause is tile latency. The only real fix is to get tiles into the browser cache before the visible camera arrives.

---

## Solution

A **hidden second Mapbox GL JS map** that follows the route ahead of the visible camera. It stays offscreen (`left:-9999px`) so the browser renders real tiles for it — unlike `display:none` which suppresses tile loading entirely. As the hidden map visits future route positions, Mapbox populates the browser tile cache. When the visible camera arrives, tiles are already warm.

---

## Implementation

**File:** `wall/systems/presentation/predictiveTilePreloadRuntime.js`  
**Export:** `SBE.PredictiveTilePreloadRuntime`

### Hidden Map Container

```
position: fixed
left: -9999px
top: -9999px
width: 800px
height: 800px
opacity: 0
pointer-events: none
z-index: -1
```

Must have real pixel dimensions — Mapbox skips tile loading without them.

### Step Loop

- Interval: **1600ms** between positions
- Idle timeout: **4000ms** — waits for Mapbox `idle` event before advancing queue
- Lookahead offsets: `[0.010, 0.025, 0.050]` normalized route progress units ahead of current position
- Max warmed cache entries tracked: **80** (ring buffer, oldest evicted)

### Queue Refresh

`_refreshQueueFromTrip()` reads `SBE.RegionalFlightTripRuntime` route + current progress, generates future positions via `_interpolateRoute(route, t)` + `_geoOffset()`, and builds the step queue.

### Style

Obtained via `SBE.MapboxViewportRuntime.getMap().getStyle()` at init time. Falls back to the known presentation style URL if the main map isn't ready.

---

## API

```js
SBE.PredictiveTilePreloadRuntime.start()         // create hidden map, begin stepping
SBE.PredictiveTilePreloadRuntime.stop()          // destroy hidden map, clear queue
SBE.PredictiveTilePreloadRuntime.setEnabled(b)   // enable/disable
SBE.PredictiveTilePreloadRuntime.getEnabled()
SBE.PredictiveTilePreloadRuntime.preloadAhead()  // immediate queue refresh + step
SBE.PredictiveTilePreloadRuntime.getState()      // debug snapshot
```

---

## Debug Companion

**File:** `wall/systems/presentation/tilePreloadDebug.js`  
**Namespace:** `_wos.debug.tilePreload`

```js
_wos.debug.tilePreload.audit()         // full state report with bars
_wos.debug.tilePreload.start()
_wos.debug.tilePreload.stop()
_wos.debug.tilePreload.preloadAhead()
_wos.debug.tilePreload.state()         // compact one-liner
```

---

## Deck Integration

`traversalControlDeck.js` launch sequence step 16 calls:

```js
SBE.PredictiveTilePreloadRuntime.start();
// 500ms later (after route init):
SBE.PredictiveTilePreloadRuntime.preloadAhead();
```

---

## Load Order (index.html)

```html
<!-- runtime -->
<script src="./systems/presentation/traversalContinuityAuthority.js"></script>
<script src="./systems/presentation/predictiveTilePreloadRuntime.js"></script>

<!-- debug -->
<script src="./systems/presentation/traversalContinuityDebug.js"></script>
<script src="./systems/presentation/tilePreloadDebug.js"></script>
<script src="./systems/presentation/traversalControlDeck.js"></script>
```

---

## Key Constraint

Mapbox GL JS requires a map container with real rendered dimensions to load tiles. The offscreen positioning (`left:-9999px`) satisfies this. Do not use `display:none`, `visibility:hidden`, or zero dimensions.
