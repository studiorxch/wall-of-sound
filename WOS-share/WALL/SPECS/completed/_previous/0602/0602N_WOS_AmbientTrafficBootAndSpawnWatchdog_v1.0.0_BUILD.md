# [BUILD] 0602N_WOS_AmbientTrafficBootAndSpawnWatchdog_v1.0.0

## Build Readiness

[BUILD]

## Purpose

Fix ambient traffic startup reliability after 0602M.

The current behavior shows:

- `AmbientTrafficRuntime v1.2.0 started`
- Drive launches correctly
- hero runtime starts correctly
- ambient traffic may still show zero actors
- console tests are being pasted with shell commands like `node --check`, causing browser syntax errors unrelated to the app

This spec adds a runtime-safe startup watchdog and spawn recovery path so ambient traffic naturally appears during Drive without console intervention, while preserving the sparse traffic goal: 1–3 cars, no clusters, no hero-lane blocking, no hard pop-in near the hero.

## Environmental Assumptions

- Browser runtime uses global `window.SBE`.
- `SBE.WorldSpaceVehicleLayer` exists before ambient traffic starts.
- `SBE.HeroVehicleRuntime.getEntity()` returns the live hero entity after Drive launch.
- `SBE.MapboxViewportRuntime.getMap()` or equivalent map getter is available.
- `ambientTrafficRuntime.js` is loaded after `heroVehicleRuntime.js`, `heroVehicleRenderer.js`, and `worldSpaceVehicleLayer.js` in `index.html`.
- This patch must not alter hero route, hero camera, hero speed, heading math, bridge/tunnel depth, vehicle mesh geometry, or Mapbox style.

## Current Load Order Confirmation

The provided `index.html` already loads Ambient Traffic after WSL and Hero Vehicle systems:

```html
<script src="./systems/render/worldSpaceVehicleLayer.js"></script>
<script src="./systems/world/heroVehicleRuntime.js"></script>
<script src="./systems/render/heroVehicleRenderer.js"></script>
<script src="./systems/presentation/heroVehicleDebug.js"></script>
<script src="./systems/traffic/ambientTrafficRuntime.js"></script>
```

Do not change script order for this pass.

## Problem

0602M made spawn recovery smarter, but the runtime still depends on favorable spawn candidates appearing quickly. At some camera heights and locations, the runtime can remain active with zero actors because the candidate scan rejects everything.

This is now a runtime quality problem, not a render-layer problem.

The browser console syntax error:

```text
Uncaught SyntaxError: Unexpected identifier 'check'
```

is caused by pasting terminal commands like this into the browser console:

```js
node --check wall/systems/traffic/ambientTrafficRuntime.js
```

That command belongs in the terminal, not DevTools.

## Non-Goals

Do not add collision.
Do not add traffic AI.
Do not add hero yielding.
Do not add lane changing.
Do not add bridge/tunnel grade logic.
Do not increase density beyond three ambient actors.
Do not use beacon blocks.
Do not use grid fallback.
Do not spawn cars directly under, beside, or ahead of the hero.
Do not replace the actor renderer.

## Required Changes

### 1. Add Ambient Startup Watchdog

File:

```text
wall/systems/traffic/ambientTrafficRuntime.js
```

Add a startup watchdog that begins when `start()` is called.

Behavior:

- wait until all required dependencies exist:
  - `SBE.WorldSpaceVehicleLayer`
  - `SBE.HeroVehicleRuntime.getEntity()`
  - map getter returns a loaded Mapbox map
- do not spawn until hero is detected
- do not spawn until WSL is enabled and render-ready if those checks exist
- retry every 750ms while active
- stop retrying only when:
  - actor count reaches target, or
  - runtime is stopped

Pseudo-flow:

```js
function _startStartupWatchdog() {
  if (_watchdogTimer) return;
  _watchdogTimer = setInterval(function () {
    if (!_active || !_enabled) return;
    var ready = _readStartupReadiness();
    _lastStartupReadiness = ready;
    if (!ready.ready) return;
    _maintain(true);
    if (_actors.length >= _targetCount) _stopStartupWatchdog();
  }, 750);
}
```

### 2. Add Startup Readiness Audit

Expose readiness in `getState()`:

```js
startup: {
  ready: boolean,
  mapReady: boolean,
  heroReady: boolean,
  layerReady: boolean,
  layerEnabled: boolean,
  renderReady: boolean,
  reason: string
}
```

Valid `reason` values:

```text
ready
runtime_inactive
runtime_disabled
map_missing
map_not_loaded
hero_missing
layer_missing
layer_disabled
layer_not_render_ready
```

If a dependency check is unavailable, do not fail hard. Mark it as `unknown` only in debug fields and continue when safe.

### 3. Add Two-Stage Spawn Recovery

Keep 0602M edge-first behavior, but add a sparse fallback path that still looks natural.

#### Stage A — Edge Entry

Preferred behavior:

- spawn offscreen or near edge
- within expanded hero distance band
- outside hero exclusion bubble
- outside forward corridor
- clear actor spacing
- building rejected

#### Stage B — Distant Visible Entry

If Stage A fails for 3 consecutive maintenance cycles:

- allow visible spawn only if:
  - distance from hero is at least 180m
  - not in hero forward corridor
  - not in hero exclusion bubble
  - not on building
  - not within 60m of another ambient actor
  - opacity starts at 1.0
  - actor is already moving

This prevents ghost fade inside the scene while avoiding an empty world.

### 4. Add Spawn Rejection Prioritization

Current rejection counts are useful but too broad. Add `lastDominantReject`:

```js
lastDominantReject: {
  reason: string,
  count: number,
  percent: number
}
```

This should be calculated from `rejectStats` each time `getState()` runs.

### 5. Add Runtime Starvation State

Track starvation explicitly:

```js
starvation: {
  active: boolean,
  cycles: number,
  ms: number,
  fallbackVisibleAllowed: boolean
}
```

Rules:

- starvation starts when runtime is active, hero is ready, and actor count is below minimum for more than 3 seconds
- starvation ends once actor count is at least 1
- while starving, visible fallback is allowed under Stage B rules

### 6. Keep Actor Count Sparse

Maintain:

```js
TARGET = 2
MIN = 0
MAX = 3
```

Do not force target if clean spawns are unavailable. One good actor is better than two bad actors.

### 7. Debug Commands

File:

```text
wall/systems/presentation/worldSpaceVehicleDebug.js
```

Add:

```js
_wos.debug.worldVehicles.ambientTrafficBootAudit()
_wos.debug.worldVehicles.ambientTrafficForceRecover()
```

#### ambientTrafficBootAudit()

Prints:

- active/enabled
- startup readiness object
- actor count / target count
- starvation object
- lastError
- lastDominantReject
- rejectStats table
- actor summaries if present

#### ambientTrafficForceRecover()

Debug-only.

Behavior:

- calls runtime restart
- forces immediate `_maintain(true)` or equivalent recovery pass
- allows Stage B visible fallback if edge spawn fails
- returns state

Do not make this required for normal Drive startup.

### 8. Hero Renderer Integration

File:

```text
wall/systems/render/heroVehicleRenderer.js
```

Keep the existing 0602K auto-start call, but make it more defensive:

```js
var atr = global.SBE && SBE.AmbientTrafficRuntime;
if (atr && typeof atr.start === 'function') {
  atr.start({ source: 'drive_launch' });
}
```

If the runtime is not available yet, do not throw. Add one deferred retry:

```js
setTimeout(function () {
  var atr2 = global.SBE && SBE.AmbientTrafficRuntime;
  if (atr2 && typeof atr2.start === 'function') atr2.start({ source: 'drive_launch_retry' });
}, 500);
```

Do not create a hard dependency from hero renderer to ambient traffic.

## Acceptance Tests

### Terminal

Run in terminal only:

```bash
node --check wall/systems/traffic/ambientTrafficRuntime.js
node --check wall/systems/presentation/worldSpaceVehicleDebug.js
node --check wall/systems/render/heroVehicleRenderer.js
```

Expected:

```text
(no output)
```

### Browser Console

After page load, click Drive. Then run:

```js
_wos.debug.worldVehicles.ambientTrafficBootAudit()
```

Expected:

```text
startup.ready: true
heroReady: true
mapReady: true
actorCount: 1..3 after recovery window
```

If `actorCount` remains 0 after 5 seconds, expected debug output must identify the dominant rejection reason.

### Visual

Expected:

- 1–3 ambient cars appear naturally during Drive
- no cars spawn under the hero
- no translucent ghost cars fade in beside the hero
- cars may be absent briefly when no clean spawn exists
- at least one clean car should appear once the hero travels through a road-dense area
- hero lane remains clear
- no beacon blocks
- no clusters

## Failure Conditions

Fail the build if:

- Drive freezes
- any browser console error is introduced by this patch
- ambient runtime blocks hero launch
- actors spawn inside the hero exclusion bubble
- actors spawn directly in the hero forward corridor
- runtime creates more than 3 ambient actors
- traffic appears as beacon blocks in normal mode
- traffic requires manual console commands to start after Drive
- terminal-only commands are documented as browser-console commands

## Implementation Guide

- **Where**: update `wall/systems/traffic/ambientTrafficRuntime.js` startup/watchdog/spawn recovery; update `wall/systems/presentation/worldSpaceVehicleDebug.js` debug commands; update `wall/systems/render/heroVehicleRenderer.js` deferred ambient start retry.
- **What**: run `node --check wall/systems/traffic/ambientTrafficRuntime.js && node --check wall/systems/presentation/worldSpaceVehicleDebug.js && node --check wall/systems/render/heroVehicleRenderer.js`, then launch the app and click Drive.
- **Expect**: Drive launches without freezing; `_wos.debug.worldVehicles.ambientTrafficBootAudit()` shows startup readiness and either 1–3 actors or a clear dominant rejection reason while recovery continues.
