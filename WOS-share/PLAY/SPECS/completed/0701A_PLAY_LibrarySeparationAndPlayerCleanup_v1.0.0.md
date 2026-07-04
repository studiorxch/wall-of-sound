---
location: Specs
title: PLAY Library Separation + Player Cleanup
date: 2026-07-01
status: implementation-spec
scope: "PLAY / library sidebar / player controls / tracklist cleanup"
target_executor: Claude
tags:
  - play
  - library
  - player
  - tracklist
  - ui
  - studiorich
  - implementation
  - claude
---

# PLAY Library Separation + Player Cleanup

## Purpose

Refine the PLAY interface after the StudioRich catalog/source-safety work.

This pass focuses on two UI issues:

1. The left library panel needs clearer separation between StudioRich catalog, external/reference library, playlists, groups, and utilities.
2. The player/tracklist section has redundant controls and needs a cleaner playback/rating layout.

This is a UI cleanup pass. Do not change Flow Curve assignment logic, catalog ownership logic, Scheduler behavior, WOS/WALL/MAPS, OBS, Colorlab, or Canvas/Studio.

---

## Current Problems

## 1. Left Panel Source Separation Is Not Clear Enough

The left panel now contains library items, playlists, groups, and utilities, but the distinction between source libraries is still not visually clear enough.

The user needs to see a clear separation between:

```text
StudioRich Catalog
External / Reference Library
Playlists
Groups
Utility views
```

StudioRich-owned songs and external/reference tracks must not feel like one undifferentiated pool.

## 2. Player Section Has Redundant Controls

The player row currently includes redundant or ambiguous controls.

Issues:

```text
Stop button is redundant when play/pause toggle exists.
Auto ON label is ambiguous.
Slot / Play selection is not needed in this location.
Rating control is missing from player focus area.
There is a redundant warning row; node warnings + warning column are enough.
```

---

## Required UI Changes

## 1. Left Panel Library Separation

Make the left panel explicitly show source separation.

Recommended structure:

```text
LIBRARIES
  StudioRich Catalog   [count]
  External             [count]
  Reference            [count]
  Unknown Review       [count]

PLAYLISTS
  playlist items...

GROUPS
  library groups...

UTILITY
  Orphans
  Excluded
  Locked Tracks
```

If Reference is currently folded under External, expose it if data supports it.

### Visual Requirements

Use clear labels and spacing:

```text
section headers
distinct source rows
counts
source badges/colors
consistent indentation
```

Acceptance:

```text
StudioRich Catalog is clearly separated from External/Reference.
Unknown Review is visible if unknown tracks exist.
Playlists are visually separate from source libraries.
Utilities remain separate from playlists and libraries.
```

---

## 2. Source Library Rows

Each source library row should communicate:

```text
source name
track count
active filter state
```

Examples:

```text
StudioRich Catalog  123
External             75
Reference            42
Unknown Review       15
```

Clicking a source row should filter the library/track pool to that source.

Acceptance:

```text
Clicking StudioRich Catalog shows StudioRich-owned tracks.
Clicking External shows external tracks.
Clicking Reference shows reference tracks.
Clicking Unknown Review shows unknown/unclassified tracks.
```

---

## 3. Player Focus Area

The player focus area should be simplified and clarified.

Player focus should display:

```text
current track title
artist
back control
play/pause toggle
forward control
slidable duration/progress
current time / total time
track rating
loop toggle
```

### Rename Auto ON

Rename:

```text
Auto ON
```

to something less ambiguous.

Preferred:

```text
Loop
```

or:

```text
Loop ON / Loop OFF
```

If the current behavior is not actually loop, use a precise name such as:

```text
Auto Advance
```

But if it is controlling repeat/loop behavior, call it `Loop`.

Acceptance:

```text
Auto ON no longer appears.
The control label matches the actual behavior.
```

---

## 4. Remove Redundant Stop Button

The stop button should be removed from the default player/tracklist view.

Rationale:

```text
Play/pause toggle is enough.
Stop is redundant in this playlist planning context.
```

If stop must remain for technical reasons, move it into advanced controls, not the main row.

Acceptance:

```text
Main player controls show back, play/pause, forward.
No primary stop button is visible.
```

---

## 5. Add Track Rating in Player Area

The active/selected track should have a rating control in the player focus area.

Requirements:

```text
show current rating
allow rating update
rating updates the track row
rating persists with track/project state if existing rating persistence exists
```

Acceptance:

```text
User can rate the current/selected track from the player area.
```

---

## 6. Tracklist Cleanup

Remove from the visible tracklist row/control area:

```text
stop button
Slot / Play selection if redundant
redundant warning row
```

### Slot / Play Selection

The current Slot / Play selection is not needed in this location.

Replace or repurpose that area for:

```text
rating
current track focus
or nothing
```

Acceptance:

```text
Slot / Play selection is no longer visible in the main control strip.
```

### Redundant Warning Row

If there is a row of warning tags above the table, remove it.

Keep:

```text
warning column in table
node/curve warnings on the curve
orphan/empty-slot markers where needed
```

Remove:

```text
extra redundant warning row/chip strip
```

Acceptance:

```text
Warnings remain visible where useful, but the redundant warning chip row is gone.
```

---

## 7. Preserve Required Behavior

Do not regress:

```text
Flow Curve node editing
Fill Time
curve-reactive reassignment
sourceOwner badges
playlist sourcePolicy enforcement
track row editor
unknown metadata editing
orphan behavior
locked tracks
M3U export
```

Acceptance:

```text
UI cleanup does not break library source policy or Flow Curve behavior.
```

---

## Verification Checklist

Before reporting complete:

```text
[ ] App builds.
[ ] Left panel clearly separates StudioRich Catalog from External/Reference.
[ ] Source rows show counts.
[ ] Source rows filter the library/track pool.
[ ] Unknown Review is visible if unknown tracks exist.
[ ] Playlists are visually separated from libraries.
[ ] Player focus area shows title/artist.
[ ] Player controls show back, play/pause, forward.
[ ] Stop button is removed from default view.
[ ] Auto ON is renamed to Loop or precise behavior label.
[ ] Track rating is available in player area.
[ ] Slot / Play selection is removed from main strip.
[ ] Redundant warning chip row is removed.
[ ] Table warning column remains.
[ ] Curve/node warnings remain.
[ ] Track row editor still opens.
[ ] Playlist source policies still work.
[ ] Flow Curve still edits and reassigns.
```

---

## Explicit Non-Goals

Do not implement:

```text
new audio playback engine
waveform rendering
beatgrid analysis
full rights management
new scheduler
WOS/WALL/MAPS changes
OBS integration
Colorlab palette system
Canvas/Studio work
new playlist assignment algorithm
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
- left panel library separation
- source filter rows/counts
- player control cleanup
- Auto ON rename
- rating control placement
- tracklist warning/control cleanup

Verification:
- build result
- source filter result
- player control result
- rating result
- Flow Curve regression check
- source policy regression check

Remaining blockers:
- list or none

Do not reopen:
- StudioRich and external/reference libraries must remain visually distinct.
- Stop button should not return to default player controls.
- Auto ON must not remain as an ambiguous label.
- Redundant warning row should stay removed.
```

---

## Claude Prompt

Use this prompt with Claude from the main project folder:

```text
Implement 0701A_PLAY_LibrarySeparationAndPlayerCleanup_v1.0.0.md.

Work in the active PLAY source.

Primary goals:
1. Make the left panel clearly separate StudioRich Catalog, External, Reference, Unknown Review, Playlists, Groups, and Utilities.
2. Source library rows should show counts and filter the library/track pool.
3. Clean the player focus area: title/artist, back, play/pause, forward, progress slider, time clock, rating, loop/auto behavior.
4. Remove the redundant stop button from the default controls.
5. Rename Auto ON to Loop or a precise behavior label.
6. Add/update rating control in the player focus area.
7. Remove Slot/Play selection from the main strip.
8. Remove the redundant warning chip row while preserving table warning column and curve/node warnings.
9. Preserve Flow Curve behavior, sourceOwner badges, track editor, and playlist source policy enforcement.

Do not change playback engine, assignment logic, WOS/WALL/MAPS, Scheduler, Colorlab, OBS, or Canvas/Studio.

Return a completion report with files changed, verification results, blockers, and do-not-reopen notes.
```
