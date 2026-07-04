# [BUILD] 0602O_WOS_AmbientTrafficNonBlockingStart_v1.0.0

## Purpose

Fix the Drive-launch freeze introduced by the ambient traffic startup recovery path.

Ambient traffic must become **non-blocking atmospheric background**, not launch-critical infrastructure.

Current failure pattern:

```text
Click Drive
→ HeroVehicleRenderer.start()
→ AmbientTrafficRuntime.start()
→ RAF + startup watchdog
→ forced _maintain(true)
→ queryRenderedFeatures + full road scan + candidate scan
→ browser stalls / launch freezes
```

This spec keeps ambient traffic, but makes startup safe, budgeted, deferred, and disposable.

---

## Build Readiness

Status: `[BUILD]`

Send to Claude/Codex.

---

## Environmental Assumptions

- Runtime is browser JavaScript, not TypeScript.
- Files are under `wall/`.
- Existing relevant files:
  - `wall/systems/traffic/ambientTrafficRuntime.js`
  - `wall/systems/render/heroVehicleRenderer.js`
  - `wall/systems/presentation/worldSpaceVehicleDebug.js`
- `SBE.WorldSpaceVehicleLayer` remains the vehicle rendering authority.
- `SBE.HeroVehicleRuntime` remains the hero movement authority.
- `SBE.AmbientTrafficRuntime` must never block Drive launch.

---

## Current Diagnosis

The freeze is likely caused by ambient traffic doing expensive road discovery and candidate validation during or immediately after Drive launch.

Key risk points:

1. `HeroVehicleRenderer.start()` starts ambient traffic directly during Drive launch and retries 500ms later.
2. `AmbientTrafficRuntime.start()` immediately starts RAF and startup watchdog.
3. The watchdog calls forced `_maintain(true)` once readiness is true.
4. `_maintain(true)` calls `_sampleRoads(map)` and `_trySpawn(...)` synchronously.
5. `_sampleRoads()` and candidate collection use `queryRenderedFeatures(...)`, polyline conversion, building checks, projection checks, and candidate scoring.

This is too much work for the launch path.

---

## Doctrine

```text
Ambient traffic may fail silently.
Hero launch may never fail because of ambient traffic.
```

```text
Atmospheric systems must be budgeted.
Core traversal must remain real-time.
```

---

# Scope

## In Scope

- Defer ambient startup until after hero launch stabilizes.
- Add budgeted, chunked road/candidate scanning.
- Add startup safe mode.
- Add a performance watchdog that disables ambient traffic if it stalls frames.
- Add debug performance audit commands.
- Keep target density sparse: `0–2`, hard max `3`.

## Out of Scope

- Collision.
- Car intelligence.
- Lane changing.
- New vehicle meshes.
- Bridge/tunnel grade logic.
- Mapbox style changes.
- Hero route, speed, camera, or heading changes.

---

# Required Changes

## 1. HeroVehicleRenderer must not start ambient traffic synchronously

### File

```text
wall/systems/render/heroVehicleRenderer.js
```

### Replace current direct ambient start behavior

Current behavior starts ambient traffic during `start(entity)` and retries after `500ms`.

Change it so ambient traffic starts only after:

- the hero renderer is active,
- the world-space layer has accepted at least one hero upsert, or at minimum Drive has survived the first rendered frame,
- a delay has elapsed.

### Required helper

Add a private helper:

```js
function _scheduleAmbientTrafficStart(reason) {
  global.setTimeout(function () {
    try {
      var ambient = global.SBE && SBE.AmbientTrafficRuntime;
      if (!ambient || typeof ambient.start !== 'function') return;
      ambient.start({
        source: reason || 'drive_deferred',
        deferred: true,
        safeMode: true,
      });
    } catch (e) {
      console.warn('[HeroVehicleRenderer] deferred ambient traffic start failed:', e && e.message ? e.message : e);
    }
  }, 1500);
}
```

### Acceptance

Drive launch must remain responsive even if AmbientTrafficRuntime is broken, slow, or missing.

---

## 2. AmbientTrafficRuntime startup must be non-blocking

### File

```text
wall/systems/traffic/ambientTrafficRuntime.js
```

### Replace immediate heavy startup behavior

`start(opts)` must:

- set `_active = true`,
- start RAF,
- mark startup as pending,
- return immediately,
- not call `_maintain(true)` directly,
- not run road sampling in the same event turn.

### Required constants

```js
var STARTUP_DELAY_MS = 1500;
var STARTUP_SAFE_TARGET = 1;
var STARTUP_BUDGET_MS = 3.5;
var STEADY_BUDGET_MS = 4.5;
var ROAD_CACHE_TTL_MS = 2500;
var MAX_ROADS_PER_SCAN = 24;
var MAX_CANDIDATES_PER_MAINTAIN = 28;
var FREEZE_FRAME_MS = 80;
var FREEZE_STRIKE_LIMIT = 2;
```

### Required state

```js
var _startupArmedAt = 0;
var _roadCache = { roads: [], at: 0, zoom: null, centerKey: null };
var _perf = {
  lastMaintainMs: 0,
  maxMaintainMs: 0,
  lastRoadScanMs: 0,
  maxRoadScanMs: 0,
  freezeStrikes: 0,
  autoDisabled: false,
  lastAutoDisableReason: null,
};
```

---

## 3. Add budgeted maintenance

### Required behavior

`_maintain(force)` must become `_maintainBudgeted(force)` or internally budget itself.

It must:

- measure elapsed time with `_now()`.
- refuse heavy work until `STARTUP_DELAY_MS` has elapsed.
- use target `1` during startup, then normal target later.
- exit early if elapsed exceeds budget.
- set `_stats.lastError = 'budget_exhausted'` when it exits because of budget.
- never loop through all roads and all samples in one frame.

### Required helper

```js
function _budgetExceeded(startMs, budgetMs) {
  return (_now() - startMs) >= budgetMs;
}
```

### Required maintenance flow

```text
_read dependencies
if not ready → return
if startup delay not elapsed → return
get cached roads or scan with budget
if no roads → lastError = no_valid_roads
attempt at most one spawn per maintain cycle
never attempt targetCount spawns in one cycle
```

### Critical rule

Remove this pattern from startup/runtime maintenance:

```js
for (var s = 0; s < toSpawn; s++) {
  var r = _trySpawn(...);
}
```

Replace with:

```js
if (have < want) {
  _trySpawnBudgeted(...); // one actor max per cycle
}
```

---

## 4. Cache road sampling

### Problem

`_sampleRoads(map)` calls `queryRenderedFeatures(...)`, walks returned features, converts polylines, computes length, and sorts roads. That is not safe to run repeatedly during launch.

### Required helper

```js
function _roadCacheKey(map) {
  try {
    var c = map.getCenter();
    var z = map.getZoom();
    return Math.round(c.lng * 100) + ':' + Math.round(c.lat * 100) + ':' + Math.round(z * 10);
  } catch (e) {
    return 'unknown';
  }
}
```

### Required helper

```js
function _getCachedRoads(map, budgetMs) {
  var t = _now();
  var key = _roadCacheKey(map);
  if (_roadCache.roads.length && _roadCache.centerKey === key && (t - _roadCache.at) < ROAD_CACHE_TTL_MS) {
    return _roadCache.roads;
  }

  var scanStart = _now();
  var roads = _sampleRoadsBudgeted(map, budgetMs);
  _perf.lastRoadScanMs = _now() - scanStart;
  _perf.maxRoadScanMs = Math.max(_perf.maxRoadScanMs, _perf.lastRoadScanMs);

  _roadCache = { roads: roads, at: _now(), zoom: null, centerKey: key };
  return roads;
}
```

### `_sampleRoadsBudgeted(map, budgetMs)` requirements

- Limit query bbox to a smaller center region during startup.
- Cap returned roads to `MAX_ROADS_PER_SCAN`.
- Stop converting features when budget is exceeded.
- Do not sort huge arrays. If sorting is needed, sort only the capped candidate list.
- If budget is exceeded, return the roads collected so far.

---

## 5. Budget candidate collection

### Required behavior

Create `_collectSpawnCandidatesBudgeted(...)`.

It must:

- scan a small number of roads per maintain cycle,
- sample fewer points per road during startup,
- cap candidates at `MAX_CANDIDATES_PER_MAINTAIN`,
- stop immediately when budget is exceeded,
- prefer the first safe candidate over perfect scoring.

### Rule

Ambient traffic does not need optimal placement. It needs **safe enough, cheap enough, sparse enough**.

---

## 6. Add freeze watchdog / auto-disable

### Required behavior

In `_frame(nowMs)`, measure frame delta. If `dt` exceeds `FREEZE_FRAME_MS`, increment `_perf.freezeStrikes`.

If strikes exceed `FREEZE_STRIKE_LIMIT`:

```js
_enabled = false;
_perf.autoDisabled = true;
_perf.lastAutoDisableReason = 'frame_budget_exceeded';
clear();
console.warn('[AmbientTrafficRuntime] auto-disabled — frame budget exceeded');
```

This protects Drive and prevents repeated freezes.

---

## 7. Debug commands

### File

```text
wall/systems/presentation/worldSpaceVehicleDebug.js
```

Add:

```js
ambientTrafficPerfAudit()
ambientTrafficSafeMode(on)
ambientTrafficWake()
```

### `ambientTrafficPerfAudit()` must print

- active
- enabled
- autoDisabled
- lastAutoDisableReason
- lastMaintainMs
- maxMaintainMs
- lastRoadScanMs
- maxRoadScanMs
- freezeStrikes
- roadCache count / age
- actorCount
- lastError
- lastDominantReject

### `ambientTrafficSafeMode(on)`

When on:

- target = 1
- max = 1
- road scan cap lower
- no Stage B visible fallback
- no watchdog forced maintain

### `ambientTrafficWake()`

Debug-only manual wake:

```text
clear autoDisabled
set enabled true
clear freeze strikes
run one budgeted maintain cycle
return state
```

---

## 8. Acceptance Tests

### Terminal

```bash
node --check wall/systems/traffic/ambientTrafficRuntime.js
node --check wall/systems/presentation/worldSpaceVehicleDebug.js
node --check wall/systems/render/heroVehicleRenderer.js
```

Expected:

```text
no syntax errors
```

### Browser

1. Reload page.
2. Click Drive.
3. Launch must not freeze.
4. Hero car must move within 1 second.
5. Ambient traffic may appear after 2–6 seconds.
6. If traffic cannot safely spawn, Drive must still continue.

Run:

```js
_wos.debug.worldVehicles.ambientTrafficPerfAudit()
_wos.debug.worldVehicles.ambientTrafficBootAudit()
```

Expected:

```text
autoDisabled: false under normal conditions
lastMaintainMs under 5ms most cycles
actorCount 0–2 acceptable
lastError may be budget_exhausted / spawn_blocked without freezing
```

If frozen behavior persists, expected safe failure is:

```text
autoDisabled: true
lastAutoDisableReason: frame_budget_exceeded
hero remains running
```

---

## Non-Negotiables

- Do not call full road sampling inside Drive launch stack.
- Do not call full candidate scan from startup watchdog.
- Do not spawn more than one ambient actor per maintenance cycle.
- Do not use beacon mode.
- Do not alter hero speed, camera, route, heading, mesh geometry, or depth policy.
- Do not add collision yet.
- Do not add traffic intelligence yet.

---

## Implementation Guide

- **Where**: `wall/systems/render/heroVehicleRenderer.js` near `start(entity)` ambient-start block; `wall/systems/traffic/ambientTrafficRuntime.js` around startup, `_frame`, `_maintain`, `_sampleRoads`, and candidate collection; `wall/systems/presentation/worldSpaceVehicleDebug.js` near existing ambient debug commands.
- **What**: Run `node --check wall/systems/traffic/ambientTrafficRuntime.js && node --check wall/systems/presentation/worldSpaceVehicleDebug.js && node --check wall/systems/render/heroVehicleRenderer.js`, then reload the browser and click Drive.
- **Expect**: Drive launches without freezing; hero moves immediately; ambient traffic appears later if safe; if ambient traffic exceeds frame budget, it auto-disables and reports the reason without breaking Drive.
