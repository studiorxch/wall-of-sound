# 0625I_PLAY_WALL_RuntimeBridgeHeartbeatLatencyAndStopControlPatch_v1.0.0_PATCH

## Status

Ready for implementation.

## Priority

P0 / Runtime Bridge Signals — Heartbeat, Latency, Stop Control

This patch continues from the confirmed `0625H` Smart Grid baseline.

`0625H` correctly displays missing runtime signals honestly:

```text
SYNC MISSING — NO HEARTBEAT BRIDGE
LATENCY MISSING — NO PING BRIDGE
STOP MISSING — NO ROUTE STOP BRIDGE
```

`0625I` attempts to replace those missing states with real runtime signals.

No fake data.

---

## Active Project Paths

```text
WOS root:
  /Users/studio/Projects/wall-of-sound

WALL runtime:
  /Users/studio/Projects/wall-of-sound/wall

PLAY root:
  /Users/studio/Projects/wall-of-sound/play

PLAY app:
  /Users/studio/Projects/wall-of-sound/play/flow-curve-builder

PLAY source:
  /Users/studio/Projects/wall-of-sound/play/flow-curve-builder/src
```

Do not use:

```text
/Users/studio/Projects/play
```

That path is legacy/inactive.

---

## Protected Baseline

Do not regress the recovered and confirmed baseline:

```text
Smart Grid overlay
PLAY / WOS / AUDIO BROADCAST cluster
AUDIO NO TRACK / AUDIO LIVE state
TX IDLE / TX ACTIVE derived state
SOURCE WOS LOCAL
UPTIME PLAY
Routes: Live
Studio / Canvas access
Subway Map / Website / Kinetic Fish explicit route status
CAM ROUTE
POV EXT / DRIVER / PASS
SPD 1X
ALT CITY
ROUTE LIVE
SKY / SUN / CLOUD / ATM
TIME / ZONE / WX / TEMP / HUM / PREC / WIND / SRC
WOS nav Flight / Drive / Walk / Bike / Transit / Speed / Alt / Launch
TAB hide/show
map pan/zoom
```

Do not restore:

```text
Operate button
Show button
Snapshot button
big rounded play button
big PAUSE label
bottom playback dock
fake route line
signal dot
vignette/haze
```

---

## Core Rule

Every indicator must remain truth-labeled:

```text
LIVE
DERIVED
STATIC
MISSING
```

No fake heartbeat.

No fake latency.

No fake stop.

---

# Part 1 — WALL → PLAY Heartbeat

## Goal

Replace:

```text
SYNC MISSING — NO HEARTBEAT BRIDGE
```

with real bridge state:

```text
SYNC LOCKED
```

or:

```text
SYNC DEGRADED
```

or:

```text
SYNC LOST
```

based on actual WALL messages.

---

## Required WALL Heartbeat Message

Add a periodic postMessage from WALL to parent PLAY when WALL is embedded.

Suggested message:

```js
window.parent.postMessage({
  type: "wall:heartbeat",
  payload: {
    wallTime: Date.now(),
    source: "wall",
    routeStatus: "...",
    skyRenderer: "...",
    cameraMode: "...",
    povMode: "...",
    speedLabel: "...",
    altitudeLabel: "..."
  }
}, "*");
```

Frequency:

```text
1 second
```

Use existing event loop or timer.

Do not spam faster than needed.

---

## Required PLAY Heartbeat Consumer

In PLAY Broadcast HUD, listen for:

```text
wall:heartbeat
```

Track:

```ts
lastHeartbeatAt
lastHeartbeatPayload
heartbeatAgeMs
```

Status rules:

```text
age <= 2500ms:
  SYNC LOCKED

2500ms < age <= 7500ms:
  SYNC DEGRADED

age > 7500ms:
  SYNC LOST
```

If no heartbeat ever received:

```text
SYNC MISSING — NO HEARTBEAT BRIDGE
```

---

## Required Security/Validation

Validate message shape.

Do not trust arbitrary messages.

At minimum:

```ts
if (event.data?.type !== "wall:heartbeat") return;
if (!event.data.payload) return;
```

If feasible, restrict origin to known localhost origins.

---

# Part 2 — PLAY ↔ WALL Latency Ping/Pong

## Goal

Replace:

```text
LATENCY MISSING — NO PING BRIDGE
```

with real measured RTT.

---

## Required Ping Message

PLAY sends ping to WALL iframe:

```ts
{
  type: "play:ping",
  payload: {
    pingId: string,
    sentAt: performance.now()
  }
}
```

Frequency:

```text
every 3 seconds
```

Only when iframe is available and controls/system overlay active.

---

## Required Pong Message

WALL replies:

```js
window.parent.postMessage({
  type: "wall:pong",
  payload: {
    pingId,
    sentAt,
    wallAt: performance.now()
  }
}, "*");
```

PLAY computes:

```ts
rttMs = performance.now() - sentAt
```

Display:

```text
LATENCY 12 MS
```

or:

```text
LATENCY 12.7 MS
```

Use one decimal only if useful.

If no pong:

```text
LATENCY MISSING — NO PONG
```

If iframe not available:

```text
LATENCY MISSING — NO WALL IFRAME
```

---

## Required Latency Truth State

Latency is:

```text
LIVE
```

only when measured from actual ping/pong.

It is:

```text
MISSING
```

if not measured.

Never hardcode fake ms values.

---

# Part 3 — Runtime Status Bundle

## Goal

Consolidate WALL runtime data into one optional status payload.

Extend heartbeat payload if available:

```ts
type WallRuntimeStatus = {
  routeStatus?: string;
  routeMode?: string;
  cameraMode?: string;
  povMode?: "ext" | "driver" | "passenger";
  speedLabel?: string;
  altitudeLabel?: string;
  skyRenderer?: "three-sky" | "sky-bridge" | "unavailable";
  mapCenter?: { lng: number; lat: number };
  mapZoom?: number;
};
```

Use only fields that are actually available.

Do not invent missing fields.

---

## Indicator Updates From Runtime Status

Use heartbeat/runtime status to improve existing indicators where available:

```text
SOURCE
SYNC
LATENCY
CAM
POV
SPD
ALT
ROUTE
ATM
```

Existing local defaults remain acceptable if WALL data is missing, but must be truth-labeled.

---

# Part 4 — Stop Control Audit / Recovery

## Goal

Resolve:

```text
STOP MISSING — NO ROUTE STOP BRIDGE
```

by searching for real stop/pause route controls.

---

## Required Search Terms

Search WALL and PLAY for:

```text
stop
Stop
pause
Pause
halt
cancel
abort
routeStop
stopRoute
pauseRoute
launch
Launch
isPaused
isRunning
routeState
traversal
```

Likely files:

```text
wall/traversalControlDeck.js
wall/**/*route*
wall/**/*traversal*
wall/index.html
play/flow-curve-builder/src/**/*.tsx
```

---

## Stop Control Behavior

Only expose active stop if it is real.

If real stop exists, implement guarded control:

```text
EMERGENCY STOP
```

Two-step interaction:

```text
1st click: ARM STOP
2nd click within 3 seconds: STOP route/audio if wired
timeout: disarm
```

Required labels:

```text
STOP AVAILABLE
STOP ARMED
STOP SENT
STOP FAILED
```

If only route pause exists, label truthfully:

```text
ROUTE PAUSE
```

Do not call pause “emergency stop” unless it actually stops route/motion.

---

## Stop Bridge

If WALL stop function exists inside iframe, use postMessage bridge:

PLAY → WALL:

```ts
{
  type: "play:route-stop",
  payload: { armed: true, requestId }
}
```

WALL → PLAY:

```ts
{
  type: "wall:route-stop-result",
  payload: { requestId, ok: true, state: "stopped" }
}
```

Validate message.

---

## Stop Missing State

If no stop/pause bridge exists after search, keep missing state but improve reason:

```text
STOP MISSING — WOS NAV HAS PAUSE UI BUT NO EXPOSED STOP FUNCTION
```

or exact result from audit.

No bare missing.

---

# Part 5 — Smart Grid Integration

## Required Indicator Updates

Update Smart Grid top-left cluster:

Before:

```text
SYNC MISSING — NO HEARTBEAT BRIDGE
LATENCY MISSING — NO PING BRIDGE
STOP MISSING — NO ROUTE STOP BRIDGE
```

After successful bridge:

```text
SYNC LOCKED
LATENCY 12 MS
STOP AVAILABLE
```

or honest missing/degraded states.

---

## Styling

Use the existing Smart Grid style.

Do not introduce rounded consumer buttons.

Do not introduce large friendly controls.

Stop control, if available, should use guarded system styling:

```text
thin line box
warning accent
confirm/armed state
not easy to hit accidentally
```

---

# Part 6 — Preserve Visibility Model

TAB remains the only hide/show toggle.

Required:

```text
Open Broadcast HUD -> controls/signals visible
TAB -> hide
TAB again -> restore
Reload -> visible
```

Heartbeat and ping may continue while hidden if lightweight.

Do not make hidden state persistent.

---

## Files Likely Touched

WALL:

```text
wall/index.html
wall/traversalControlDeck.js
wall/*runtime*.js
wall/*route*.js
```

PLAY:

```text
play/flow-curve-builder/src/ui/BroadcastHudShell.tsx
play/flow-curve-builder/src/ui/BroadcastSmartGridOverlay.tsx
play/flow-curve-builder/src/runtime/broadcastIndicatorRegistry.ts
play/flow-curve-builder/src/styles.css
```

Possible new PLAY runtime file:

```text
play/flow-curve-builder/src/runtime/wallRuntimeBridge.ts
```

Use actual repo names.

---

## Implementation Steps

### 1. Preserve baseline

Confirm `0625H` still works before changes.

### 2. Add WALL heartbeat

Post `wall:heartbeat` once per second when embedded.

### 3. Add PLAY heartbeat listener

Track heartbeat age and display sync state.

### 4. Add ping/pong

PLAY sends `play:ping`.

WALL replies `wall:pong`.

PLAY computes RTT.

### 5. Wire latency indicator

Replace missing state only when measured.

### 6. Audit stop/pause functions

Search code.

Document exact result.

### 7. Add guarded stop only if real

Do not fake it.

### 8. Update Smart Grid indicators

Keep truth states.

### 9. Test TAB, controls, map interaction.

### 10. Run TypeScript

```bash
cd /Users/studio/Projects/wall-of-sound/play/flow-curve-builder
tsc -b
```

---

## Acceptance Criteria

### A. Heartbeat bridge implemented

WALL sends heartbeat and PLAY receives it.

---

### B. SYNC updates truthfully

SYNC shows one of:

```text
SYNC LOCKED
SYNC DEGRADED
SYNC LOST
SYNC MISSING — [reason]
```

---

### C. Ping/pong implemented

PLAY sends ping; WALL returns pong.

---

### D. Latency measured

LATENCY displays real measured RTT.

If unavailable, shows exact missing reason.

---

### E. No fake values

No hardcoded fake latency, sync, or stop state.

---

### F. Runtime status payload optional fields are validated

Unknown/missing fields do not break UI.

---

### G. Stop audited

Route stop/pause function search is documented.

---

### H. Stop only active if real

No fake emergency stop.

If available, guarded stop uses two-step confirm.

---

### I. Missing stop has exact reason

No bare stop missing.

---

### J. Smart Grid style preserved

No rounded button regression.

---

### K. Existing baseline preserved

No loss of:

```text
clock
weather
audio cluster
vehicle controls
camera POV controls
sky status
WOS nav
access cluster
```

---

### L. TAB still works

TAB hides/restores Smart Grid and controls.

---

### M. Map remains interactive

Pan/zoom works.

---

### N. tsc clean

`tsc -b` exits 0.

---

## Manual Test Checklist

1. Start WALL.

2. Start PLAY.

```bash
cd /Users/studio/Projects/wall-of-sound/play/flow-curve-builder
npm run dev
```

3. Open Broadcast HUD.

4. Confirm baseline visible.

5. Confirm SYNC changes from missing to:

```text
SYNC LOCKED
```

when heartbeat arrives.

6. Stop/reload WALL if needed.

Expected:

```text
SYNC DEGRADED / LOST
```

after timeout.

7. Confirm LATENCY shows measured ms.

8. Confirm latency changes over time and is not hardcoded.

9. Confirm STOP state:

```text
available guarded control
```

or exact blocker.

10. Test guarded stop only if available.

11. Press TAB.

Expected:

```text
Smart Grid hides
```

12. Press TAB again.

Expected:

```text
Smart Grid returns
```

13. Test map pan/zoom.

14. Run:

```bash
tsc -b
```

Expected:

```text
exits 0
```

---

## Expected Result

The Smart Grid becomes more operational:

```text
SYNC LOCKED / DEGRADED / LOST from real heartbeat
LATENCY measured from real ping/pong
STOP available only if real, guarded if active
```

No fake data.

No lost controls.

No rounded UI regression.

---

## Implementation Guide

- **Where:** WALL embedded runtime bridge, PLAY Broadcast Smart Grid registry/listener, optional stop bridge.
- **What:** Add heartbeat, ping/pong latency measurement, runtime status payload, and real/guarded stop handling only if a stop function exists.
- **Expect:** Current missing Smart Grid cells become real operational signals where possible, while missing stop remains explicit if no real bridge exists.
