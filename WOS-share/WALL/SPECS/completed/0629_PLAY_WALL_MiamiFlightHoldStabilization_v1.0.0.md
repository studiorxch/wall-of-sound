---
location: Doctrine
title: PLAY/WALL Miami Flight Hold Stabilization
filename: 0629_PLAY_WALL_MiamiFlightHoldStabilization_v1.0.0.md
date: 2026-06-29
status: field-test-followup
scope: "PLAY / WALL / FlowCurve / Flight Hold / OBS / Twitch"
primary_wall: WALL_FLIGHT
primary_mode: Miami Flight Hold
test_basis: "1.2-hour Twitch field test, 2026-06-28"
tags:
  - wos
  - play
  - wall
  - flight-hold
  - flow-curve
  - obs
  - twitch
  - field-test
  - stabilization
---

# PLAY/WALL Miami Flight Hold Stabilization

## Field Test Summary

A 1.2-hour Miami Flight Hold test was performed on Twitch before the planned 2-hour target. The test was successful enough to prove the channel format is viable, but it exposed four immediate blockers:

1. FlowCurve point editing is unstable.
2. Playlist pairing is not predictable enough.
3. The music library needs clearer source separation.
4. WALL needs clouds or visible atmospheric motion to avoid a stalled-screen impression.

This note continues from:

- `0628E_PLAY_WALL_EventVisualProfileAndWallSourceBoundary_v1.1.0.md`
- `0628F_PLAY_EventSchedulerAndIntermissionDoctrine_v1.0.0.md`
- `0628G_WOS_ChannelRuntimeAndSchedulerBoundary_v1.0.0.md`
- `0628H_WOS_LowMotionFlightHoldAndOrbitalHoldChannels_v1.0.0.md`

The current operating goal is not feature expansion. The goal is stabilizing a repeatable 2-hour Miami Flight Hold broadcast.

---

## Core Decision

The Miami Flight Hold test should become the first **PLAY/WALL broadcast proof channel**.

It should be simple, durable, and boring in the correct way:

```text
Flight mode.
1x speed.
Cruise altitude.
Minimal HUD.
Clouds / atmosphere present.
Snapshot shortcut available.
OBS browser-source safe.
```

This test should not depend on event scheduling, complex map modes, or high-motion visual changes. It is a low-motion channel designed to prove that WOS can hold attention through stability, mood, and audiovisual continuity.

---

## Immediate Stabilization Priorities

| Priority | Area | Problem | Required Fix |
|---:|---|---|---|
| P0 | FlowCurve editing | Moving nodes creates new nodes | Separate drag behavior from add-point click behavior |
| P0 | Flight Hold runtime | Screen reads as stalled when all blue | Add cloud / atmosphere layer |
| P1 | Playlist assignment | Song pairing feels impossible | Add slot diagnostics and manual placement controls |
| P1 | Library structure | StudioRich and external tracks are mixed together | Add source ownership fields and filters |
| P2 | OBS readiness | Browser source needs predictable clean state | Add locked broadcast preset URL/state |
| P2 | Snapshot workflow | Need fast capture during test | Add keyboard shortcut and safe export naming |

---

# 1. FlowCurve Node Editing Hotfix

## Problem

While updating a 5-node curve, dragging points produced additional nodes. The curve could grow from 5 points to 15 points during normal editing.

## Likely Cause

The FlowCurve canvas currently supports:

```text
click canvas → add point
mouse down point → drag point
mouse up → stop drag
```

The failure pattern suggests a drag action can still result in a canvas click event. In practice, this turns one intended edit into two actions:

```text
move existing point
add new point at release/click position
```

## Doctrine Rule

Dragging a point must never add a point.

Adding points must only happen through an explicit add-point gesture.

## Required Behavior

| Gesture | Result |
|---|---|
| Click empty curve area | Add point |
| Drag existing point | Move point only |
| Right-click point | Remove point |
| Shift-click empty curve area | Optional future add-point mode |
| Double-click empty curve area | Optional future add-point mode |

## Implementation Requirement

Introduce a drag guard:

```text
isDraggingPoint
hasMovedDuringDrag
suppressNextCanvasClick
```

The canvas add-point handler must exit when a drag just occurred.

Recommended minimum fix:

```ts
if (suppressNextCanvasClick.current) {
  suppressNextCanvasClick.current = false;
  return;
}
```

Add-point should also ignore clicks originating from `.curve-point`.

## Stability Rule

The curve editor must preserve point count unless the user intentionally adds or removes a point.

---

# 2. Playlist Pairing Diagnostics

## Problem

The current playlist builder makes it hard to place the right song into the right slot. The issue may be one or more of the following:

- The library does not contain enough compatible songs.
- The target slot is too narrow.
- The scoring weights are wrong.
- Key and BPM are fighting the energy curve.
- Songs are being assigned before the user understands why.

## Core Decision

The playlist builder needs to explain its decisions before it tries to feel automatic.

For now, PLAY should prioritize **debuggable playlist construction** over perfect automatic sequencing.

## Required Slot Diagnostics

Each slot should show:

```text
slot index
target energy
target BPM range
preferred Camelot keys
assigned track
score breakdown
near misses
why rejected
```

## Required Candidate View

Each slot should expose a ranked candidate list:

| Rank | Track | Artist | BPM | Key | Energy | Fit | Issue |
|---:|---|---|---:|---|---:|---:|---|
| 1 | Track A | Artist | 118 | 7A | 0.52 | 91 | Good fit |
| 2 | Track B | Artist | 124 | 8A | 0.61 | 84 | Energy high |
| 3 | Track C | Artist | 102 | 7B | 0.47 | 71 | BPM low |

This turns pairing from guesswork into a visible decision process.

## Manual Override Requirement

For the Miami Flight Hold test, the user must be able to:

```text
lock opener
lock closer
lock a track to a specific slot
exclude a track
swap two tracks
search candidate tracks by BPM/key/energy/source
```

Automation should assist the operator, not fight them.

---

# 3. Library Source Separation

## Problem

The current library does not sufficiently separate StudioRich tracks from external/reference tracks.

This creates several practical problems:

- Broadcast-safe ownership is unclear.
- Original StudioRich identity gets diluted.
- External music may be useful as reference but not always eligible for stream use.
- The playlist builder cannot filter by source intent.

## Core Decision

The music library needs source ownership metadata before deeper automation.

## Required Track Fields

Add or normalize these fields:

```ts
type TrackOwnership = "studiorich" | "external" | "collab" | "unknown";
type BroadcastClearance = "approved" | "reference_only" | "blocked" | "unknown";
type LibraryUse = "broadcast" | "reference" | "draft" | "archive";
```

Recommended expanded track metadata:

```ts
type Track = {
  trackId: string;
  title: string;
  artist: string;
  bpm: number;
  camelotKey: CamelotKey;
  durationSeconds: number;
  energy: number;
  energySource: TrackEnergySource;
  ownership: TrackOwnership;
  clearance: BroadcastClearance;
  libraryUse: LibraryUse;
  filePath?: string;
  genre?: string;
  sourcePlaylist?: string;
  collection?: string;
  notes?: string;
};
```

## Miami Flight Hold Filter

The Miami Flight Hold test should default to:

```text
ownership: StudioRich OR approved external
clearance: approved
libraryUse: broadcast
```

External songs may remain in the system, but they should not silently enter a broadcast playlist.

---

# 4. Cloud / Atmosphere Requirement

## Problem

During the Twitch test, the screen became entirely blue without clouds. This made the WALL look stalled, even if the flight runtime was technically functioning.

## Core Decision

Flight Hold requires visible atmospheric motion.

A clean sky is not enough for broadcast. The viewer needs a subtle sign that the world is alive.

## Required Visual Layer

Miami Flight Hold should include:

```text
slow cloud drift
subtle haze gradient
low-contrast atmospheric depth
optional faint horizon band
no aggressive weather
no high-motion storm layer
```

## Visual Doctrine

Clouds are not decoration. In Flight Hold, clouds are the motion floor.

They provide:

- proof of runtime activity
- scale
- altitude context
- visual patience
- reduced stalled-screen risk

## Minimum Cloud Preset

```text
cloud_density: low-to-medium
cloud_speed: slow
cloud_scale: large
opacity: soft
motion_direction: lateral or diagonal
loop_safety: required
```

---

# 5. Flight Hold Broadcast Preset

## Required Default State

The Miami Flight Hold browser source should load into a predictable state:

```text
mode=flight
speed=1x
altitude=cruise
hud=minimal
clouds=on
camera=orbital_hold or low_motion_flight_hold
snapshot=enabled
controls=hidden or minimized
```

## Recommended URL Contract

```text
/wall?channel=miami-flight-hold&mode=flight&speed=1&altitude=cruise&hud=minimal&clouds=1&obs=1
```

OBS should not require manual UI cleanup after loading.

## Minimal HUD Contents

Keep:

```text
channel name
mode label
optional track/playlist identity card
small StudioRich/WOS mark
```

Hide:

```text
debug panels
top bars
left authoring panels
route controls
developer buttons
large clocks
unneeded speed controls
```

The HUD should confirm the channel identity without turning the broadcast into software footage.

---

# 6. Snapshot Shortcut

## Requirement

The operator needs a fast snapshot shortcut during tests.

## Recommended Shortcut

```text
S = save snapshot
Shift + S = save clean snapshot without HUD
```

## Snapshot Naming

```text
YYYYMMDD_WOS_MiamiFlightHold_HHMMSS.png
YYYYMMDD_WOS_MiamiFlightHold_HHMMSS_CLEAN.png
```

Snapshots should capture the WALL canvas/browser output, not the authoring shell.

---

# 7. Test Plan for Next 2-Hour Run

## Preflight Checklist

```text
[ ] FlowCurve drag does not add points
[ ] 5-node curve remains 5 nodes after editing
[ ] Playlist slots show target BPM/key/energy diagnostics
[ ] StudioRich/external filter is active
[ ] Flight mode loads by URL
[ ] Speed defaults to 1x
[ ] Cruise altitude defaults correctly
[ ] Minimal HUD loads cleanly
[ ] Clouds are visible immediately
[ ] OBS browser source loads without manual cleanup
[ ] Snapshot shortcut works
```

## During Test

Track these observations:

```text
timestamp
track title
slot fit issue
visual issue
HUD issue
OBS issue
viewer-facing note
operator note
```

## Success Criteria

The next Miami Flight Hold test is successful if:

```text
2-hour runtime completes
no accidental curve-node multiplication
no all-blue stalled-screen impression
OBS source remains clean
playlist does not require constant fighting
snapshot capture works during broadcast
```

---

# 8. Build Order

## P0 — Fix Before Next Broadcast

1. Patch FlowCurve drag/add behavior.
2. Add cloud layer or cloud preset to Flight Hold.
3. Add Miami Flight Hold URL preset.
4. Confirm OBS browser source clean load.

## P1 — Improve Operator Control

1. Add slot diagnostics.
2. Add candidate track list.
3. Add library ownership/clearance/use filters.
4. Add lock/swap/exclude controls to playlist workflow.

## P2 — Improve Broadcast Polish

1. Add snapshot shortcut.
2. Add clean snapshot mode.
3. Add identity card timing.
4. Add intermission compatibility.

---

# 9. Operational Framing

This Twitch test changed the project state.

Miami Flight Hold is no longer an abstract channel idea. It is now a tested broadcast format with specific failure modes.

The next phase should be treated as stabilization, not invention.

```text
Make the curve editor safe.
Make the playlist builder explain itself.
Make the library source-aware.
Make the sky visibly alive.
Make OBS load clean.
Then run the 2-hour test again.
```

