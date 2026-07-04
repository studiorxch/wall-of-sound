---
location: Specs
title: PLAY Flow Curve Node Removal + Red Warning Reduction
date: 2026-06-29
status: implementation-spec
scope: "PLAY / Flow Curve / playlist assignment / warning engine"
target_executor: Claude
tags:
  - play
  - flow-curve
  - playlist-builder
  - implementation
  - claude
  - warnings
  - orphans
---

# PLAY Flow Curve Node Removal + Red Warning Reduction

## Purpose

Fix the current Flow Curve Playlist Builder issues:

1. Users cannot remove curve nodes/points.
2. Playlist generation is producing too many red songs or red sections.
3. Red warnings need to become more useful and less noisy without forcing bad tracks into the playlist.

This spec applies to the active `play/` project source.

---

## Source Principle

The Flow Curve Builder is a playlist planning/composition tool.

Do not turn this pass into playback, mixing, waveform analysis, OBS overlay, sampler work, or WOS/WALL work.

The correct Phase 1 focus is:

```text
visible Flow Curve
playlist ordering
editable curve points
locks
warnings
orphans
export
```

---

## Current Problems

### Problem 1 — Node Removal Broken

The user can edit/drag nodes, but cannot reliably remove nodes.

Likely causes to check:

```text
remove-point handler missing
click/drag conflict
delete key not bound
selected point not tracked
minimum point guard too aggressive
canvas click adds point immediately after pointer interaction
event propagation conflict
```

### Problem 2 — Too Many Red Songs

The current warning/assignment behavior may be over-classifying weak fits as red.

Possible causes:

```text
thresholds too strict
slot target BPM too narrow
energy target too narrow
Camelot penalty too punitive
duration drift too sensitive
artist repeat penalty causing unnecessary red
warnings based on raw distance rather than relative pool availability
assignment algorithm not looking ahead
tracks marked red instead of yellow/orphan
```

### Problem 3 — Red Warnings Need Better Meaning

Red should mean:

```text
bad fit
missing track
broken flow
empty slot
lock conflict
```

Red should not mean:

```text
slightly imperfect
usable but not ideal
library does not perfectly match the curve
```

Usable weak fits should usually be yellow.

---

## Implementation Tasks

## 1. Fix Curve Point Removal

Implement reliable point/node removal in `FlowCurveCanvas`.

Required behaviors:

```text
select point
remove selected point
delete/backspace removes selected point
right-click or option-click may remove point if appropriate
remove button may be added if UI already has point controls
minimum point count is enforced
opener/closer boundary points are protected if required
```

Minimum rule:

```text
A curve must keep enough points to remain valid.
```

Recommended:

```text
minimumPoints = 2
```

or, if the current preset requires anchors:

```text
minimumPoints = 3
```

Do not allow removal that leaves the curve impossible to sample.

Acceptance:

```text
User can remove an unlocked/non-required curve point.
Deleted point disappears immediately.
Playlist regenerates or marks dirty after node removal.
No accidental addPoint occurs after drag/delete.
Curve sampler still works after removal.
```

---

## 2. Separate Drag, Click, Select, and Delete

Prevent common canvas interaction conflicts.

Required:

```text
dragging a point must not trigger addPoint
clicking an existing point selects it
clicking empty curve area may add point only if add mode is active or existing behavior requires it
delete/backspace removes selected point
escape clears selection
```

Acceptance:

```text
Drag does not create duplicate points.
Delete removes selected point.
Empty click behavior remains intentional.
```

---

## 3. Improve Assignment Before Warning

Do not only soften warnings. First improve assignment quality.

Check these modules:

```text
play/src/logic/playlistAssigner.ts
play/src/logic/trackScoring.ts
play/src/logic/warningEngine.ts
play/src/logic/orphanDetector.ts
play/src/logic/slotGenerator.ts
```

Required improvements:

```text
normalize BPM distance against library range
normalize energy distance against 0..1
use warning thresholds based on score bands
prefer yellow for usable weak fits
reserve red for truly broken slots/fits
avoid marking every imperfect match red
do not force unfit tracks into slots
move true non-fits to Orphans with explanation
```

---

## 4. Add Score Bands

Introduce clear score bands so warnings are consistent.

Suggested default bands:

```ts
export const WARNING_SCORE_BANDS = {
  cleanMax: 28,
  yellowMax: 55,
  redMin: 56
};
```

Interpretation:

```text
0–28 = clean / no warning
29–55 = yellow / usable but weak
56+ = red only if fit is genuinely bad
```

Do not blindly use these exact numbers if the current score scale differs. First inspect the current score range.

Acceptance:

```text
Warnings are based on consistent bands.
Yellow appears for weak but usable songs.
Red is reduced to genuinely broken flow problems.
```

---

## 5. Add Pool-Aware Tolerance

The tool should understand when the library cannot perfectly match the curve.

If the available pool has limited BPM/energy range, warning logic should avoid punishing every slot for not reaching impossible values.

Required:

```text
calculate library BPM range
calculate library energy range
calculate available candidate range per slot
adjust warning severity based on available candidate reality
```

Example:

```text
If the curve requests 0.85 energy but the library max is 0.68,
show a library coverage warning, not red every assigned track.
```

Acceptance:

```text
Red warnings decrease when the issue is global library coverage.
The UI explains missing zones instead of blaming every song.
```

---

## 6. Add Candidate Debug Output

Add a small developer/debug output for slot assignment.

This can be console-only or dev-only UI.

For each red slot, report:

```text
slot index
target BPM
target energy
assigned track
fit score
top 5 candidate tracks
candidate scores
warning reasons
orphan reasons if applicable
```

Acceptance:

```text
Claude/developer can explain why a slot is red.
This debug output is not shown in normal user UI unless dev mode is enabled.
```

---

## 7. Preserve Human Locks

Do not reduce red warnings by breaking locks.

Required:

```text
opener lock stays fixed
closer lock stays fixed
position locks stay fixed
lock conflicts show red
unlocked songs may reorder
```

Acceptance:

```text
Locked songs remain locked after node removal and reassignment.
Lock conflict is still red.
```

---

## 8. Preserve Orphan Behavior

Do not force every track into the playlist just to reduce red.

Required:

```text
tracks that do not fit should become Orphans
orphans need readable reasons
red should not be hidden by forcing bad tracks into slots
```

Acceptance:

```text
Bad fits move to Orphans.
Orphan explanations remain readable.
Red count drops because assignment/warnings improve, not because bad fits are hidden.
```

---

## 9. Testing Checklist

Create or run test data covering:

```text
remove middle curve point
remove point after dragging another point
delete selected point with keyboard
attempt to remove required minimum point
regenerate after point removal
small library with limited BPM range
small library with limited energy range
locked opener/closer
position lock conflict
track that should be yellow, not red
track that should be red
track that should become orphan
```

---

## Verification Checklist

Before reporting complete:

```text
[ ] App builds.
[ ] Curve point can be selected.
[ ] Curve point can be removed.
[ ] Delete/backspace removes selected point.
[ ] Dragging point does not add duplicate point.
[ ] Curve remains sampleable after point removal.
[ ] Playlist regenerates or marks dirty after point removal.
[ ] Red warning count is lower on the same test library.
[ ] Yellow warnings still appear for weak usable fits.
[ ] True bad fits still become red or Orphans.
[ ] Locks are preserved.
[ ] Exports still work if touched.
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
- node removal fix
- assignment/scoring changes
- warning changes
- debug output if added

Verification:
- build result
- node removal result
- same-library red count before/after if available
- examples of red/yellow/orphan behavior

Remaining blockers:
- list or none

Do not reopen:
- Flow Curve remains playlist planning, not playback/mixer.
- Red reduction must not force bad tracks into slots.
- Human locks still win.
```

---

## Claude Prompt

Use this prompt with Claude from the main project folder:

```text
Implement 0629B_PLAY_FlowCurveNodeRemovalAndWarningReduction_v1.0.0.md.

Work in the active PLAY source.

Primary goals:
1. Fix Flow Curve node/point removal.
2. Prevent drag/click/delete conflicts.
3. Improve assignment and warning logic so fewer usable songs appear red.
4. Keep true bad fits red or move them to Orphans.
5. Preserve human locks.
6. Do not add playback, waveform, mixer, OBS, WOS, WALL, or scheduler work.

Return a completion report with files changed, verification results, before/after red behavior if available, and remaining blockers.
```
