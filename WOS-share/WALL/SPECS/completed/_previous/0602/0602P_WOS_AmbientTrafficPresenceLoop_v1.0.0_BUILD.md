# [BUILD] 0602P_WOS_AmbientTrafficPresenceLoop_v1.0.0

## Build Readiness

[BUILD]

## Purpose

Stabilize ambient traffic so it behaves like persistent background life instead of a short-lived debug event.

This spec fixes the current 0602O behavior:

- traffic appears briefly, then disappears
- safe mode caps presence too aggressively
- cars can travel against expected lane direction
- cars can overlap or ghost through one another
- traffic can recycle out faster than it replenishes
- no clear audit explains why the world became empty

The goal is not full traffic simulation. The goal is reliable sparse presence:

```text
1–3 nearby actors, usually visible, never blocking the hero, never clustering, never freezing launch.
```

---

## Environmental Assumptions

- Existing files:
  - `wall/systems/traffic/ambientTrafficRuntime.js`
  - `wall/systems/render/heroVehicleRenderer.js`
  - `wall/systems/presentation/worldSpaceVehicleDebug.js`
- Existing world vehicle layer provides:
  - `SBE.WorldSpaceVehicleLayer.upsertVehicle(payload)`
  - `SBE.WorldSpaceVehicleLayer.removeVehicle(id)`
  - `SBE.WorldSpaceVehicleLayer.setActorOpacity(id, opacity)`
- Existing hero runtime provides:
  - `SBE.HeroVehicleRuntime.getEntity()`
- Existing Mapbox viewport runtime provides:
  - `SBE.MapboxViewportRuntime.getMap()`
- This patch must not mutate hero route, hero speed, camera, Mapbox style, heading math, depth policy, or mesh geometry.

---

## Current Diagnosis

### 1. Safe mode is too restrictive after launch

0602O correctly prevented launch freeze by deferring traffic and starting in safe mode. But safe mode now behaves like a permanent traffic suppressor:

```text
safeMode → target 1
safeMode → Stage B disabled
safeMode → fallback recovery disabled
```

That means one successful car can satisfy the runtime, then after recycle the system may remain empty if edge-entry candidates are unavailable.

### 2. Lane side is currently random, not road-aware

Lane offset currently alternates/randomizes left/right from the sampled road centerline. It does not know traffic side, one-way direction, or whether reversing `flowSign` should also mirror the lane offset.

That creates this visible failure:

```text
car travels opposite direction, but appears in the hero's lane
```

### 3. Overlap prevention is spawn-time only

0602O has actor spacing and runtime crowd recycle, but it does not predict actor paths. Two cars can still visually pass through each other if their polylines cross or converge after spawn.

Collision is not required yet. We need soft separation first.

### 4. Recycle can remove presence without replacement

When actors leave range, go offscreen, enter exclusion, or crowd, they fade out. The replacement logic is still too conservative and budget-gated, so the world can become empty.

---

## Doctrine

Ambient traffic is atmosphere.

It must suggest life without becoming the main simulation.

```text
Traffic presence beats traffic correctness.
Hero safety beats traffic density.
Sparse continuity beats visible clusters.
```

---

## Non-Goals

Do not add:

- collision physics
- car-to-car intelligence
- hero braking/yielding
- lane changing
- intersection rules
- traffic lights
- pathfinding
- Mapbox style edits
- bridge/tunnel grade corrections
- new mesh geometry
- actor creation tooling

Those belong to later specs.

---

## Required Behavior

### A. Persistent Sparse Presence

Ambient traffic must maintain a soft target:

```text
target: 2
visible band: 1–3
minimum acceptable: 1
```

Rules:

- If actor count drops to 0 while Drive is active, recovery must begin immediately.
- If actor count stays 0 for more than 4 seconds, allow visible distant recovery.
- Visible recovery must spawn opaque, far from hero, and already moving.
- Runtime must prefer 1 clean actor over 2 risky actors.

### B. Safe Mode Must Auto-Release

Safe mode remains useful during launch, but must not permanently suppress traffic.

Add:

```js
SAFE_MODE_RELEASE_MS = 9000;
```

Behavior:

- Drive start may still begin with `safeMode:true`.
- After `SAFE_MODE_RELEASE_MS`, runtime auto-releases safe mode if:
  - hero is active
  - WSL is render-ready
  - no freeze strikes are active
- After auto-release:
  - normal target returns to 2
  - max returns to 3
  - Stage B recovery becomes available
- If freeze watchdog triggers, safe mode may re-enable.

### C. Lane Side Stabilization

Add deterministic lane-side authority.

Each actor must store:

```js
laneSide: -1 | 1
travelHeadingDeg: number
baseHeadingDeg: number
flowSign: -1 | 1
```

Rules:

- For right-hand traffic default:
  - forward flow uses right-side lane
  - reverse flow uses its own right-side lane relative to reverse travel
- Lane offset must be computed from final travel heading, not original road heading.
- Opposing traffic must not be placed in the same lateral lane as hero-forward traffic on the same road.
- Random lane side is forbidden for ambient traffic.

Add constants:

```js
TRAFFIC_SIDE = 'right';
LANE_OFFSET_M = 3.2;
LANE_JITTER_M = 0.35;
```

Allowed jitter:

```text
±0.35m max
```

This keeps cars visually alive without hopping lanes.

### D. Anti-Ghosting Spacing

Add predictive separation without collision.

Each actor must reserve a short future capsule:

```js
future0: current point
future1: position + 2.5s
future2: position + 5.0s
```

Spawn rejection:

- reject if future points come within:
  - 34m of another actor on same road
  - 24m of another actor on a different road
- reject if future path enters hero forward corridor

Runtime behavior:

- If two ambient actors come within 18m:
  - recycle the newer actor
  - never stop, slow, or move the hero
  - never apply collision impulse
- If two actors are on the same `roadKey` and same `flowSign`, maintain 45m spacing.

### E. Replacement Queue

Add a lightweight replacement queue so the system does not go silent.

When an actor begins fading out, enqueue:

```js
_pendingReplacementCount += 1;
```

Maintenance rules:

- If pending replacements exist, spawn attempts get priority.
- Pending replacements are consumed only on successful spawn.
- Pending replacements expire after 12 seconds.
- Replacement still obeys budget and safety rules.
- Replacement may use Stage B if the system is empty or starved.

### F. Better Recycle Rules

Current despawn is too eager.

Change:

```js
DESPAWN_DISTANCE_M = 260;
OFFSCREEN_GRACE_MS = 5000;
```

Keep:

- hero exclusion recycle
- forward corridor recycle
- crowd recycle

But avoid removing actors just because camera framing briefly changes.

### G. No Ghost Fade In-Scene

Edge-entry fade is allowed only when the actor is outside the viewport or near the edge.

Rules:

- offscreen edge entry:
  - may fade 0 → 1
- visible fallback:
  - must spawn opacity 1
- actor already visible:
  - opacity must never sit between 0.2 and 0.85
  - either opaque or fading out briefly

### H. Debug State Must Explain Emptiness

Extend `getState()` with:

```js
presence: {
  desiredMin,
  desiredTarget,
  desiredMax,
  emptyMs,
  safeModeReleased,
  pendingReplacementCount,
  lastSuccessfulSpawnMode,
  lastRecycleReason
}
```

Add per-actor:

```js
laneSide
travelHeadingDeg
roadKey
spawnMode
ageMs
```

Add debug command:

```js
_wos.debug.worldVehicles.ambientTrafficPresenceAudit()
```

It must print:

- safe mode status
- actor count
- empty duration
- pending replacements
- last spawn mode
- last recycle reason
- lane side per actor
- actor spacing warnings
- dominant rejection reason

---

## File Changes

## 1. `wall/systems/traffic/ambientTrafficRuntime.js`

### Required Version Bump

```js
var VERSION = '1.5.0';
```

### Add Constants

```js
var SAFE_MODE_RELEASE_MS = 9000;

var PRESENCE_MIN_ACTORS = 1;
var PRESENCE_TARGET_ACTORS = 2;
var PRESENCE_MAX_ACTORS = 3;
var EMPTY_RECOVERY_AFTER_MS = 4000;

var TRAFFIC_SIDE = 'right';
var LANE_OFFSET_M = 3.2;
var LANE_JITTER_M = 0.35;

var SAME_ROAD_FUTURE_SEPARATION_M = 34;
var CROSS_ROAD_FUTURE_SEPARATION_M = 24;
var RUNTIME_COLLISION_RECYCLE_M = 18;
var SAME_FLOW_RUNTIME_SPACING_M = 45;

var DESPAWN_DISTANCE_M = 260;
var OFFSCREEN_GRACE_MS = 5000;

var REPLACEMENT_EXPIRE_MS = 12000;
```

If constants already exist, update values rather than duplicating names.

### Add Presence State

```js
var _presence = {
  emptySinceMs: null,
  safeModeReleased: false,
  pendingReplacementCount: 0,
  pendingReplacementSinceMs: null,
  lastSuccessfulSpawnMode: null,
  lastRecycleReason: null
};
```

### Add Safe Mode Release

Create:

```js
function _maybeReleaseSafeMode(hero, wsl) {
  if (!_safeMode || _presence.safeModeReleased) return;
  if (!_startupArmedAt) return;
  if ((_now() - _startupArmedAt) < SAFE_MODE_RELEASE_MS) return;
  if (!hero || !hero.active) return;
  if (wsl && typeof wsl.isRenderReady === 'function' && !wsl.isRenderReady()) return;
  if (_perf.freezeStrikes > 0 || _perf.autoDisabled) return;

  _safeMode = false;
  _presence.safeModeReleased = true;
}
```

Call inside `_maintain()` after hero/map readiness.

### Add Lane Resolver

Create:

```js
function _resolveLaneSide(flowSign) {
  if (TRAFFIC_SIDE === 'left') return flowSign >= 0 ? -1 : 1;
  return flowSign >= 0 ? 1 : -1;
}

function _resolveLaneOffsetM(flowSign) {
  var side = _resolveLaneSide(flowSign);
  return side * (LANE_OFFSET_M + _rand(-LANE_JITTER_M, LANE_JITTER_M));
}
```

Replace all ambient spawn-time lane randomization with this resolver.

### Add Future Prediction

Create:

```js
function _predictActorPoint(road, dist, flowSign, laneOffsetM, seconds, speedMs) {
  var raw = dist + flowSign * speedMs * seconds;
  var wrapped = ((raw % road.meta.total) + road.meta.total) % road.meta.total;
  var pos = _interpPolyline(road.pts, road.meta, wrapped);
  var hdg = flowSign >= 0 ? pos.headingDeg : (pos.headingDeg + 180) % 360;
  var perp = (hdg + 90) * Math.PI / 180;
  var off = _offsetLatLng(pos.lat, pos.lng, laneOffsetM * Math.cos(perp), laneOffsetM * Math.sin(perp));
  return { lat: off.lat, lng: off.lng, headingDeg: hdg };
}
```

Create:

```js
function _futureSpacingBlocked(candidate) {
  var checks = [0, 2.5, 5.0];
  for (var i = 0; i < _actors.length; i++) {
    var actor = _actors[i];
    if (actor.state === 'fadingOut' || actor._lastLat == null) continue;

    for (var c = 0; c < checks.length; c++) {
      var cand = _predictActorPoint(
        candidate.road,
        candidate.dist,
        candidate.flowSign,
        candidate.laneOffsetM,
        checks[c],
        candidate.speedMs
      );

      var other = _predictActorPoint(
        { pts: actor.pts, meta: actor.meta },
        actor.dist,
        actor.flowSign,
        actor.laneOffsetM,
        checks[c],
        actor.speedMs
      );

      var limit = actor.roadKey === candidate.roadKey
        ? SAME_ROAD_FUTURE_SEPARATION_M
        : CROSS_ROAD_FUTURE_SEPARATION_M;

      if (_haversineM(cand.lat, cand.lng, other.lat, other.lng) < limit) {
        _reject('futureActorSpacing');
        return true;
      }
    }
  }
  return false;
}
```

Add `futureActorSpacing` to `_rejectStats`.

### Add Runtime Anti-Ghosting

Create:

```js
function _findRuntimeSpacingRecycle(actor) {
  for (var i = 0; i < _actors.length; i++) {
    var other = _actors[i];
    if (other === actor || other.state === 'fadingOut') continue;
    if (other._lastLat == null || actor._lastLat == null) continue;

    var dist = _haversineM(actor._lastLat, actor._lastLng, other._lastLat, other._lastLng);

    if (dist < RUNTIME_COLLISION_RECYCLE_M) return 'runtime_collision_spacing';

    if (
      actor.roadKey === other.roadKey &&
      actor.flowSign === other.flowSign &&
      dist < SAME_FLOW_RUNTIME_SPACING_M
    ) {
      return 'same_flow_spacing';
    }
  }
  return null;
}
```

Use this inside `_shouldRecycle()`.

### Add Recycle Reason

Change `_shouldRecycle()` to return:

```js
null | string
```

Instead of boolean.

Examples:

```js
return 'too_far';
return 'hero_exclusion';
return 'hero_corridor';
return 'offscreen_grace';
return 'runtime_collision_spacing';
return 'same_flow_spacing';
```

Then in `_frame()`:

```js
var recycleReason = _shouldRecycle(a, hero, map, t);
if (a.state === 'active' && recycleReason) {
  a.state = 'fadingOut';
  a.stateStart = t;
  _stats.recycleCount++;
  _stats.lastRecycleAt = _now();
  _presence.lastRecycleReason = recycleReason;
  _enqueueReplacement();
}
```

### Add Replacement Queue

Create:

```js
function _enqueueReplacement() {
  _presence.pendingReplacementCount = Math.min(3, _presence.pendingReplacementCount + 1);
  _presence.pendingReplacementSinceMs = _now();
}

function _pruneReplacementQueue() {
  if (!_presence.pendingReplacementSinceMs) return;
  if ((_now() - _presence.pendingReplacementSinceMs) > REPLACEMENT_EXPIRE_MS) {
    _presence.pendingReplacementCount = 0;
    _presence.pendingReplacementSinceMs = null;
  }
}
```

Call `_pruneReplacementQueue()` in `_maintain()`.

On successful spawn:

```js
if (_presence.pendingReplacementCount > 0) {
  _presence.pendingReplacementCount--;
  if (_presence.pendingReplacementCount === 0) _presence.pendingReplacementSinceMs = null;
}
```

### Presence-Aware Maintenance

In `_maintain()`:

```js
var activeCount = _activeCount();
var desiredTarget = _safeMode ? 1 : PRESENCE_TARGET_ACTORS;
var desiredMax = _safeMode ? 1 : PRESENCE_MAX_ACTORS;
var want = Math.min(desiredMax, desiredTarget);

if (_presence.pendingReplacementCount > 0 && activeCount < desiredMax) {
  want = Math.min(desiredMax, activeCount + 1);
}

if (activeCount < 1) {
  if (_presence.emptySinceMs == null) _presence.emptySinceMs = _now();
} else {
  _presence.emptySinceMs = null;
}

var emptyMs = _presence.emptySinceMs ? _now() - _presence.emptySinceMs : 0;
var allowEmptyRecovery = emptyMs > EMPTY_RECOVERY_AFTER_MS;
var allowStageB = !_safeMode && (_starvation.fallbackVisibleAllowed || allowEmptyRecovery);
```

### Spawn Mode Tracking

When `_trySpawnBudgeted()` succeeds:

```js
_presence.lastSuccessfulSpawnMode = r;
```

Inside `_spawnCandidate(c)` store:

```js
spawnMode: c.visibleFallback ? 'visibleFallback' : 'edgeEntry',
laneSide: _resolveLaneSide(c.flowSign),
travelHeadingDeg: c.headingDeg
```

### State Export

Extend `getState()` with `presence` and per-actor lane fields.

---

## 2. `wall/systems/presentation/worldSpaceVehicleDebug.js`

Add:

```js
ambientTrafficPresenceAudit: function () {
  var a = global.SBE && SBE.AmbientTrafficRuntime;
  if (!a) { console.warn('[worldVehicles] AmbientTrafficRuntime unavailable'); return null; }

  var s = a.getState();
  console.group('[worldVehicles] ambientTrafficPresenceAudit');
  console.log('active        :', s.active, '| enabled:', s.enabled, '| safeMode:', s.safeMode);
  console.log('presence      :', s.presence);
  console.log('actorCount    :', s.actorCount, '| activeCount:', s.activeCount, '| target:', s.targetCount);
  console.log('lastError     :', s.lastError || '-');
  console.log('dominantReject:', s.lastDominantReject);

  s.actors.forEach(function (actor) {
    console.log(
      actor.id,
      '|', actor.variant,
      '| state:', actor.state,
      '| laneSide:', actor.laneSide,
      '| flow:', actor.flowSign,
      '| heading:', actor.travelHeadingDeg,
      '| road:', actor.roadKey,
      '| age:', actor.ageMs,
      '| heroDist:', actor.heroDistanceM
    );
  });

  console.groupEnd();
  return s;
}
```

Do not remove existing debug commands.

---

## 3. `wall/systems/render/heroVehicleRenderer.js`

No required changes unless 0602O safe-mode start was hardcoded.

If present, keep:

```js
ambient.start({ source: 'drive_launch', deferred: true, safeMode: true });
```

This spec handles auto-release inside the ambient runtime.

---

## Acceptance Tests

### 1. Launch Smoothness

Run:

```bash
node --check wall/systems/traffic/ambientTrafficRuntime.js
node --check wall/systems/presentation/worldSpaceVehicleDebug.js
node --check wall/systems/render/heroVehicleRenderer.js
```

Expected:

```text
no syntax errors
```

### 2. Startup Presence

Browser:

```js
_wos.debug.worldVehicles.ambientTrafficPerfAudit()
_wos.debug.worldVehicles.ambientTrafficPresenceAudit()
```

Expected after 10–20 seconds of Drive:

```text
safeMode false OR presence.safeModeReleased true
actorCount 1–3
activeCount 1–3
autoDisabled false
```

### 3. No Empty World After Recycle

Let Drive run for 3–5 minutes.

Expected:

```text
actorCount recovers after fade-outs
presence.emptyMs does not grow indefinitely
pendingReplacementCount clears after successful replacement
```

### 4. Lane Direction Readability

Observe traffic near hero.

Expected:

```text
opposing traffic is offset to its own side
no opposite-direction actor rides directly in hero lane
laneSide is stable per actor
```

### 5. Anti-Ghosting

Observe sparse traffic.

Expected:

```text
actors do not visibly pass through each other in normal sparse mode
if spacing fails, newer actor fades/recycles
hero never slows, brakes, or yields
```

---

## Failure Conditions

Reject implementation if:

- Drive launch freezes again.
- Ambient runtime scans all roads and all candidates in one frame.
- Safe mode remains permanently true during normal Drive.
- Cars disappear permanently after the first recycle.
- Opposing cars spawn in the hero lane by default.
- Hero speed, route, camera, or heading is modified.
- Collision physics is introduced.
- Any debug showcase path is used as production ambient traffic.

---

## Implementation Guide

- **Where**: Edit `wall/systems/traffic/ambientTrafficRuntime.js` constants/state/spawn/recycle/maintenance/getState`; add `ambientTrafficPresenceAudit()` in `wall/systems/presentation/worldSpaceVehicleDebug.js`; leave `wall/systems/render/heroVehicleRenderer.js` unchanged unless safe-mode deferred start is missing.
- **What**: Run `node --check wall/systems/traffic/ambientTrafficRuntime.js && node --check wall/systems/presentation/worldSpaceVehicleDebug.js && node --check wall/systems/render/heroVehicleRenderer.js`, then launch Drive and run `_wos.debug.worldVehicles.ambientTrafficPresenceAudit()`.
- **Expect**: Drive launches smoothly, traffic auto-recovers to 1–3 visible actors over time, safe mode releases after startup, lane side is stable, and ghosting is reduced by predictive spacing/recycle rather than collision.
