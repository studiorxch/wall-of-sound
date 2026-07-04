# [BUILD] 0602M_WOS_AmbientTrafficSpawnRecovery_v1.0.0

## Purpose

Fix ambient traffic spawning after `0602L` made entry rules too strict.

Current runtime state proves the ambient traffic loop is alive, the hero is detected, and density is requested, but no actors are placed:

```js
active: true
heroDetected: true
actorCount: 0
activeCount: 0
targetCount: 2
spawnAttempts: 86
rejects: 1118
recycles: 0
```

This means the issue is not rendering, not Drive startup, and not WorldSpaceVehicleLayer enablement. It is spawn rejection.

The goal is to recover reliable low-density ambient traffic while preserving the visual rules established in `0602L`:

- no cars spawning under or near the hero
- no visible pop-in beside the hero
- no clusters
- no traffic blocking the hero lane
- no debug beacon behavior
- no collision/intelligence system yet

---

## Build Status

`[BUILD]`

Ready for Claude/Codex.

---

## Files

### Modify

```txt
wall/systems/traffic/ambientTrafficRuntime.js
wall/systems/presentation/worldSpaceVehicleDebug.js
```

### Do Not Modify

```txt
wall/systems/render/worldSpaceVehicleLayer.js
wall/systems/render/heroVehicleRenderer.js
wall/index.html
```

`0602M` must not change render math, hero runtime, camera behavior, Mapbox style, depth policy, heading math, or vehicle mesh geometry.

---

## Diagnosis

`0602L` introduced stricter spawn rules:

```js
SPAWN_ENTRY_MIN_SCREEN_MARGIN_PX = 80
SPAWN_ENTRY_MAX_SCREEN_MARGIN_PX = 260
SPAWN_ENTRY_MIN_HERO_DISTANCE_M = 90
SPAWN_ENTRY_MAX_HERO_DISTANCE_M = 220
HERO_EXCLUSION_RADIUS_M = 42
MIN_ACTOR_SEPARATION_M = 42
MIN_SAME_ROAD_SEPARATION_M = 70
```

The runtime currently attempts random road candidates. Each spawn attempt only tries 12 candidates, and almost all candidates are rejected. The audit does not show which rule caused rejection, so the system cannot be tuned intelligently.

The likely failure is a combination of:

1. offscreen entry band too narrow for current camera/zoom
2. hero-distance band incompatible with edge-band road candidates
3. random sampling missing valid edge-road candidates
4. `_maintain()` not surfacing `spawn_blocked` clearly enough
5. visible fallback not being used when offscreen candidates fail

---

## Required Changes

## 1. Add Spawn Rejection Accounting

Add a structured rejection counter object.

```js
var _rejectStats = {
  noRoads: 0,
  building: 0,
  heroExclusion: 0,
  heroDistanceNear: 0,
  heroDistanceFar: 0,
  heroCorridor: 0,
  futureCorridor: 0,
  actorSpacing: 0,
  sameRoadSpacing: 0,
  screenEntryBand: 0,
  visibleFallbackDenied: 0,
  invalidGeometry: 0,
  exhaustedCandidates: 0,
};
```

Add helper:

```js
function _reject(reason) {
  _stats.spawnRejects++;
  if (_rejectStats[reason] == null) _rejectStats[reason] = 0;
  _rejectStats[reason]++;
}
```

Replace direct `_stats.spawnRejects++` increments inside spawn validation with `_reject('reason')`.

Do not remove existing `spawnRejects`; keep it as the total count.

---

## 2. Replace Random-Only Spawn Search With Candidate Scan

Add a function that builds spawn candidates from sampled roads before selection.

```js
function _collectSpawnCandidates(map, hero, roads, opts) {
  // returns array of candidate records
}
```

Each candidate should include:

```js
{
  road: road,
  roadKey: road.layerId + ':' + road.index,
  dist: Number,
  lat: Number,
  lng: Number,
  headingDeg: Number,
  flowSign: 1 | -1,
  laneOffsetM: Number,
  heroDistanceM: Number,
  screenEntry: Boolean,
  onScreen: Boolean,
  score: Number
}
```

Candidate scan requirements:

- sample each road at several distances, not one random distance
- use at least 5 samples per road, capped at 12 samples per road
- prefer road points just outside the viewport
- prefer candidates 90–260m from hero
- prefer opposing flow relative to hero
- reject candidates inside hero exclusion or forward corridor
- reject building hits
- reject actor spacing conflicts

Use deterministic candidate scoring instead of pure random selection.

Suggested score:

```js
score = 0;
if (candidate.screenEntry) score += 100;
if (candidate.heroDistanceM >= 120 && candidate.heroDistanceM <= 200) score += 30;
if (_angleDiffDeg(hero.headingDeg, candidate.headingDeg) >= 135) score += 20;
score -= Math.abs(candidate.heroDistanceM - 160) * 0.1;
score += Math.random() * 5;
```

Sort candidates descending by score.

---

## 3. Widen Edge Entry Band Slightly

Update only these constants:

```js
var SPAWN_ENTRY_MIN_SCREEN_MARGIN_PX = 40;
var SPAWN_ENTRY_MAX_SCREEN_MARGIN_PX = 420;
var SPAWN_ENTRY_MIN_HERO_DISTANCE_M  = 80;
var SPAWN_ENTRY_MAX_HERO_DISTANCE_M  = 260;
```

Reason:

The current 80–260px screen band is too narrow at several camera heights. Widening it still prevents obvious center-frame pop-in but allows valid candidates to be found.

---

## 4. Add Controlled Visible Fallback

If no offscreen candidates exist, allow a visible fallback only when all are true:

```js
heroDistanceM >= 160
not inside hero forward corridor
not inside hero exclusion
not near another ambient actor
not on building
```

Visible fallback actors must spawn at opacity `1`, not fade from transparent inside the scene.

Rule:

```js
if (candidate.onScreen && candidate.visibleFallback) {
  actor.state = 'active';
  actor._opacity = 1;
}
```

This avoids ghost fade-in inside the visible scene.

---

## 5. Update `_trySpawn()` Flow

Replace the existing random attempt loop with:

```js
function _trySpawn(map, hero, roads, allowVisibleFallback) {
  _stats.spawnAttempts++;

  var edgeCandidates = _collectSpawnCandidates(map, hero, roads, {
    allowVisibleFallback: false,
  });

  var candidates = edgeCandidates;

  if (!candidates.length && allowVisibleFallback) {
    candidates = _collectSpawnCandidates(map, hero, roads, {
      allowVisibleFallback: true,
    });
  }

  if (!candidates.length) {
    _reject('exhaustedCandidates');
    return false;
  }

  return _spawnCandidate(candidates[0]);
}
```

Add `_spawnCandidate(candidate)` to preserve the existing actor object shape.

---

## 6. Update `_maintain()` Error Reporting

Currently the runtime can attempt many spawns and still leave `lastError` unclear.

Change maintenance logic:

```js
var spawned = false;
for (var s = 0; s < toSpawn; s++) {
  if (_trySpawn(map, hero, roads, true)) spawned = true;
  else break;
}

if (!spawned && have < want) {
  _stats.lastError = 'spawn_blocked';
} else {
  _stats.lastError = null;
}
```

Do not clear `lastError` unless at least one actor exists or a spawn succeeds.

---

## 7. Add Spawn Audit State

Extend `getState()` with:

```js
rejectStats: Object.assign({}, _rejectStats),
entryPolicy: {
  screenMarginMinPx: SPAWN_ENTRY_MIN_SCREEN_MARGIN_PX,
  screenMarginMaxPx: SPAWN_ENTRY_MAX_SCREEN_MARGIN_PX,
  heroDistanceMinM: SPAWN_ENTRY_MIN_HERO_DISTANCE_M,
  heroDistanceMaxM: SPAWN_ENTRY_MAX_HERO_DISTANCE_M,
  heroExclusionRadiusM: HERO_EXCLUSION_RADIUS_M,
  minActorSeparationM: MIN_ACTOR_SEPARATION_M,
  minSameRoadSeparationM: MIN_SAME_ROAD_SEPARATION_M,
}
```

---

## 8. Add Debug Command

In `worldSpaceVehicleDebug.js`, add:

```js
ambientTrafficSpawnAudit: function () {
  var a = global.SBE && SBE.AmbientTrafficRuntime;
  if (!a) { console.warn('[worldVehicles] AmbientTrafficRuntime unavailable'); return null; }
  var s = a.getState();
  console.group('[worldVehicles] ambientTrafficSpawnAudit');
  console.log('active        :', s.active, '| enabled:', s.enabled, '| heroDetected:', s.heroDetected);
  console.log('actorCount    :', s.actorCount, '| activeCount:', s.activeCount, '| targetCount:', s.targetCount);
  console.log('spawnAttempts :', s.spawnAttempts, '| rejects:', s.spawnRejects, '| recycles:', s.recycleCount);
  console.log('lastError     :', s.lastError || '-');
  console.log('entryPolicy   :', s.entryPolicy);
  console.table(s.rejectStats || {});
  s.actors.forEach(function (ac) {
    console.log('  ' + ac.id + ' | scale ' + ac.scale + ' | opacity ' + ac.opacity +
      ' | heroDist ' + ac.heroDistanceM + 'm | onScreen ' + ac.onScreen + ' | ' + ac.state);
  });
  console.groupEnd();
  return s;
}
```

Keep existing `ambientTrafficAudit()` unchanged or lightly extend it. Do not remove it.

---

## Acceptance Tests

Run after Drive launch:

```js
_wos.debug.worldVehicles.ambientTrafficRestart()
setTimeout(() => _wos.debug.worldVehicles.ambientTrafficSpawnAudit(), 3000)
```

Expected:

```js
active: true
heroDetected: true
actorCount: 1..3
activeCount: 1..3
lastError: null OR temporary spawn_blocked with existing actors still present
```

Then continue driving for 60 seconds.

Expected:

- ambient traffic remains sparse, usually 1–3 actors
- no cars spawn under the hero
- no cars fade ghost-like into the middle of the scene
- visible fallback, when used, appears fully opaque and far away
- no clusters near the hero
- no cars blocking the hero forward corridor
- no debug beacon blocks
- no console frame spam

---

## Failure Conditions

Do not accept the patch if:

- `actorCount` remains `0` while `spawnAttempts` rises above 40
- `lastError` is `null` while every spawn fails
- cars visibly spawn beside or under the hero
- cars fade in from transparent while already central on screen
- ambient traffic exceeds 3 actors by default
- hero speed, route, camera, or heading changes
- WorldSpaceVehicleLayer render/depth policy is changed

---

## Implementation Guide

- **Where**: Modify `wall/systems/traffic/ambientTrafficRuntime.js` around spawn validation, `_trySpawn()`, `_maintain()`, and `getState()`; modify `wall/systems/presentation/worldSpaceVehicleDebug.js` by adding `ambientTrafficSpawnAudit()` next to the existing ambient traffic debug commands.
- **What**: Run `node --check wall/systems/traffic/ambientTrafficRuntime.js && node --check wall/systems/presentation/worldSpaceVehicleDebug.js`, then launch Drive and run `_wos.debug.worldVehicles.ambientTrafficRestart(); setTimeout(() => _wos.debug.worldVehicles.ambientTrafficSpawnAudit(), 3000);`.
- **Expect**: 1–3 ambient actors appear naturally near the hero route, rejection reasons are visible in `rejectStats`, and `actorCount` no longer stays at `0` with rising reject counts.
