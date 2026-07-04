---
location: Specs
title: PLAY Flow Curve Fill Gap Guardrails + Library Ownership
date: 2026-06-29
status: implementation-spec
scope: "PLAY / Flow Curve / Fill Gap / node guardrails / library ownership"
target_executor: Claude
tags:
  - play
  - flow-curve
  - fill-gap
  - node-guardrails
  - library
  - studiorich
  - implementation
  - claude
---

# PLAY Flow Curve Fill Gap Guardrails + Library Ownership

## Purpose

Fix the next set of PLAY Flow Curve issues discovered after node removal and warning reduction.

This spec focuses on:

1. `Fill Gap` freezing the Flow Curve after it fills.
2. Accidental node flooding in one corner.
3. Too many nodes being allowed for small playlists.
4. Node creation being too sensitive.
5. Library ownership separation for StudioRich songs.
6. Editable metadata for songs marked `unknown`.

Do not add playback, mixer, WOS, WALL, OBS, Canvas, or Scheduler work in this pass.

---

## Current Problems

## 1. Fill Gap Freezes the Flow Curve

Using `Fill Gap` freezes the Flow Curve after it fills.

Observed behavior:

```text
Fill Gap runs.
Nodes/curve become locked or non-responsive.
Self-adjustments no longer work.
Refreshing does not restore normal behavior.
```

This suggests the filled/generated node state may be persisted as locked, invalid, overloaded, or incompatible with normal curve editing.

### Required Fix

`Fill Gap` must not permanently freeze the curve.

After Fill Gap:

```text
curve remains editable
nodes can still be moved
nodes can still be removed
playlist can still regenerate
self-adjustment still works
refresh does not preserve a broken/frozen state
```

### Required Audit

Check:

```text
Fill Gap function
curve point generation
lock flags
dirty/project persistence
localStorage/projectStorage
node count after Fill Gap
curve sampler assumptions
regeneration trigger after Fill Gap
```

Acceptance:

```text
Fill Gap can run without freezing curve edits.
Refreshing does not reload a frozen/invalid curve.
User can still drag/remove nodes after Fill Gap.
```

---

## 2. Prevent Node Flooding in One Corner

There is currently no protection against accidental creation of many nodes in one corner.

Observed:

```text
corner may contain 30+ nodes
small playlist may only have 13 tracks
curve becomes unusable
```

### Required Fix

Add guardrails:

```text
minimum spacing between nodes
maximum nodes per curve
maximum nodes per time window/region
reject duplicate/near-duplicate points
prevent repeated addPoint in same corner
```

Suggested initial values:

```ts
const MIN_POINT_TIME_DISTANCE = 0.025; // 2.5% of curve width
const MIN_POINT_ENERGY_DISTANCE = 0.03;
const MAX_CURVE_POINTS = 16;
const MAX_POINTS_PER_REGION = 4;
```

Do not blindly use these exact values if current curve scale differs. Adjust to match current point model.

Acceptance:

```text
User cannot accidentally create 30 nodes in one corner.
Near-duplicate nodes are ignored or merged.
Curve stays visually usable.
```

---

## 3. Max Nodes Should Scale With Playlist Size

Node count should be related to playlist size.

A playlist with 13 tracks should not allow 30+ active curve nodes.

### Required Rule

Add a derived max node count based on active playlist/slot count.

Suggested:

```ts
maxNodes = Math.min(16, Math.max(4, Math.ceil(trackCount * 0.75)));
```

Alternative:

```ts
maxNodes = Math.min(18, Math.max(5, Math.ceil(slotCount / 2)));
```

Core principle:

```text
small playlist = fewer curve nodes
large playlist = more curve nodes allowed
```

Acceptance:

```text
13-track playlist cannot create 30 nodes.
Max node count is visible or enforced clearly.
Attempting to add beyond max gives a non-breaking notice.
```

---

## 4. Node Creation Is Too Sensitive

Currently, nodes are too easy to create.

Observed:

```text
nodes are created by touching/clicking outside the curve line
accidental clicks create unwanted points
editing becomes messy
```

### Required Fix

Make node creation intentional.

Options, choose the simplest safe one:

```text
Add-point mode toggle
Shift+Click to add node
Double-click near curve line to add node
Button: Add Point, then click curve
Only allow node creation within a distance threshold of the curve line
```

Recommended near-term behavior:

```text
Click existing point = select
Drag existing point = move
Delete/Backspace = remove selected point
Shift+Click near curve line = add point
Plain click empty area = no add
```

Acceptance:

```text
Plain click outside curve line does not create node.
Node creation requires intentional action.
No accidental node creation during normal editing.
```

---

## 5. StudioRich Library Separation

Need a dedicated library/group for StudioRich songs.

The system should clearly separate:

```text
StudioRich songs
external/reference songs
mixed library
unknown ownership songs
```

Playlists should support:

```text
StudioRich only
external/reference only
mixed
exclude StudioRich
exclude external
```

### Required Data Model

Add or normalize a track ownership/source field.

Suggested:

```ts
export type TrackOwnership =
  | "studiorich"
  | "external"
  | "reference"
  | "unknown";
```

Track should support:

```ts
ownership?: TrackOwnership;
librarySource?: string;
catalogId?: string;
```

If current system already has `sourcePlaylist`, extend carefully without breaking imports.

### Required UI

Add a simple library filter:

```text
All
StudioRich only
External/reference only
Mixed allowed
Unknown
```

Acceptance:

```text
User can clearly filter StudioRich songs.
Playlist generation can include/exclude StudioRich songs.
Ownership is preserved in project export/import if touched.
```

---

## 6. Unknown Songs Need Editable Metadata

StudioRich has many songs marked as `unknown`.

There is currently no way to update these.

### Required Fix

Add basic metadata editing for selected tracks or table rows.

Minimum editable fields:

```text
title
artist
ownership/source
bpm
camelotKey
durationSeconds
energy
filePath if present
```

At minimum, allow updating:

```text
title
artist
ownership
source/library
```

### Unknown Cleanup

Songs with `unknown` title/artist should be easy to find.

Required filter:

```text
Unknown metadata
```

Acceptance:

```text
User can filter unknown tracks.
User can edit unknown title/artist/source.
Edits affect assignment/export.
Edits persist in JSON project save/load if available.
```

---

## 7. Preserve Current Fixes

Do not regress the previous 0629B fixes.

Must preserve:

```text
click point to select
selected point highlight
Delete/Backspace removes selected point
Escape deselects
right-click removal
stopPropagation preventing accidental addPoint on point click
loosened BPM red/yellow thresholds
candidate debug output for unassigned slots
```

Acceptance:

```text
Previous node removal behavior still works.
Warning threshold improvement remains.
Debug output remains dev-safe.
```

---

## Verification Checklist

Before reporting complete:

```text
[ ] App builds.
[ ] Fill Gap no longer freezes the curve.
[ ] Refresh does not reload a frozen Fill Gap state.
[ ] User can drag nodes after Fill Gap.
[ ] User can delete nodes after Fill Gap.
[ ] Max node count is enforced.
[ ] 13-track playlist cannot create 30 nodes.
[ ] Plain click outside curve does not create accidental node.
[ ] Intentional add-node action works.
[ ] Near-duplicate/corner node flooding is prevented.
[ ] StudioRich ownership field exists or is supported.
[ ] User can filter StudioRich-only songs.
[ ] User can include/exclude/mix StudioRich songs.
[ ] Unknown tracks can be found.
[ ] Unknown metadata can be edited.
[ ] Project export/import preserves touched metadata if export/import is affected.
```

---

## Explicit Non-Goals

Do not implement:

```text
audio playback
waveform rendering
beatgrid analysis
phrase analysis
transition timing
OBS overlay
custom mixer
WOS/WALL/MAPS changes
sampler controls
event scheduler
Canvas/Studio changes
full catalog management system
cloud sync
database backend
```

---

## Claude Completion Report Required

When complete, report:

```text
Status: complete / partial / blocked

Files changed:
- path
- path

What changed:
- Fill Gap fix
- node guardrails
- add-node sensitivity fix
- StudioRich library ownership
- unknown metadata edit support

Verification:
- build result
- Fill Gap result
- node max result
- accidental add prevention result
- StudioRich filter result
- unknown edit result

Remaining blockers:
- list or none

Do not reopen:
- Flow Curve remains playlist planning, not playback/mixer.
- Fill Gap must not freeze the curve.
- Node creation must be intentional.
- StudioRich ownership must remain distinct from external/reference tracks.
```

---

## Claude Prompt

Use this prompt with Claude from the main project folder:

```text
Implement 0629C_PLAY_FlowCurveFillGapGuardrailsAndLibraryOwnership_v1.0.0.md.

Work in the active PLAY source.

Primary goals:
1. Fix Fill Gap freezing the Flow Curve.
2. Add max-node and corner/near-duplicate guardrails.
3. Make node creation intentional, not accidental.
4. Preserve prior node select/delete behavior.
5. Add StudioRich library ownership separation.
6. Add filtering for StudioRich/external/unknown songs.
7. Add basic editing for unknown metadata.

Do not add playback, waveform, mixer, OBS, WOS, WALL, scheduler, or Canvas work.

Return a completion report with files changed, verification results, blockers, and do-not-reopen notes.
```
