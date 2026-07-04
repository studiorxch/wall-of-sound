---
location: Specs
title: PLAY Playlist-First Player Dock + Filter Subset Cleanup
date: 2026-07-01
status: implementation-spec
scope: "PLAY / playlist layout / player dock / filters / auto advance"
target_executor: Claude
tags:
  - play
  - playlist
  - player
  - filters
  - layout
  - ui
  - implementation
  - claude
---

# PLAY Playlist-First Player Dock + Filter Subset Cleanup

## Purpose

Refine the PLAY Flowcurve workspace so the playlist becomes the main working area.

The player currently divides the Flow Curve from the playlist and interrupts the visual hierarchy. The player should move to the bottom as a dock, while filters become a subset/control area of the playlist list they affect.

This pass also removes the Auto Advance button because playlist playback should auto-advance by default until the end of the playlist.

---

## Current Problems

```text
The player row separates the Flow Curve from the playlist table.
The playlist is not visually prioritized enough.
The filter area feels like a separate block instead of a subset of the list/table.
Auto Advance is unnecessary as a visible button.
Playback should naturally continue track-to-track until the playlist ends.
```

---

## Core Decision

```text
Playlist table = main working area.
Flow Curve = control/overview above playlist.
Player = bottom dock.
Filters = playlist/table subset, not a separate dominant band.
Auto-advance = default behavior, not a visible toggle.
```

---

## Required Changes

## 1. Remove Auto Advance Button

Remove the visible `Auto Advance ON/OFF` control from the default interface.

Required behavior:

```text
Tracks auto-advance by default.
Playback continues until the end of the playlist.
No visible Auto Advance button appears.
```

If a setting is technically needed later, it can live in Settings/advanced behavior, not the main player.

Acceptance:

```text
Auto Advance button is gone from the default view.
Playlist playback continues automatically by default.
```

---

## 2. Move Player to Bottom Dock

Move the player section to the bottom of the workspace.

The player should no longer sit between Flow Curve and playlist.

Target player dock:

```text
bottom of app/workspace
shows current track
shows artist
shows rating
shows back / play-pause / forward
shows duration/progress bar
shows current time / total time
```

Acceptance:

```text
The player no longer divides Flow Curve from playlist.
The player appears as a bottom dock.
The playlist table can sit directly under the Flow Curve/filter area.
```

---

## 3. Playlist Comes First

Prioritize the playlist table visually.

Required:

```text
Flow Curve remains visible as an upper control surface.
Playlist table begins higher.
More playlist rows are visible.
Player dock does not reduce the table's main usable space unnecessarily.
```

Acceptance:

```text
The playlist reads as the main working area.
The user can see most/all of a 13-15 track playlist in normal fullscreen use.
```

---

## 4. Filters Become a Subset of the Playlist/List

The filter area should be tied to the playlist table, not appear as an unrelated dominant strip.

Recommended behavior:

```text
filters live inside or directly above the table header
filters are compact
filters can collapse
filters visually belong to the table/list
```

Examples:

```text
table header row
└── compact filters / source chips / warning filters / owner filters
```

Do not let the filter area become a large blue/panel block.

Acceptance:

```text
Filters feel like controls for the table/list they represent.
Filters do not dominate the layout.
Filters can be hidden/collapsed if not active.
```

---

## 5. Keep Flow Curve + Playlist Relationship Clear

The Flow Curve should sit above the playlist as an overview/controller.

Required:

```text
Flow Curve directly relates to playlist below.
No large player strip between them.
No large empty area between them.
```

Acceptance:

```text
The visual order is:
1. Playlist identity/header
2. Flow Curve overview
3. Table filters/header
4. Playlist table
5. Player dock
```

---

## 6. Preserve Player Essentials

The player dock should still show:

```text
current track title
artist
rating
previous
play/pause
next
duration/progress slider
current time / total time
```

Remove from default dock:

```text
stop button
auto advance button
slot jump
redundant warning chips
```

Acceptance:

```text
Player is useful but not layout-dominant.
```

---

## 7. Preserve Existing Behavior

Do not regress:

```text
Flow Curve node editing
Fill Time
curve-reactive reassignment
sourceOwner library filters
source policy enforcement
track row editor
unknown metadata editing
rating updates
orphan behavior
locked tracks
M3U export
```

Acceptance:

```text
Layout cleanup does not break playlist generation or catalog filtering.
```

---

## Verification Checklist

Before reporting complete:

```text
[ ] App builds.
[ ] Auto Advance button is removed.
[ ] Tracks still auto-advance by default.
[ ] Player is docked at the bottom.
[ ] Player no longer separates Flow Curve from playlist.
[ ] Playlist table begins higher.
[ ] More playlist rows are visible.
[ ] Filters appear as a compact subset of the playlist/table.
[ ] Large filter panel/block is gone.
[ ] Current track title/artist/rating remain visible in player dock.
[ ] Back/play-pause/forward controls remain.
[ ] Duration/progress remains.
[ ] Flow Curve still edits and reassigns playlist.
[ ] Source library filters still work.
[ ] Track editor still opens from row click.
```

---

## Explicit Non-Goals

Do not implement:

```text
new playback engine
waveform rendering
beatgrid analysis
scheduler redesign
WOS/WALL/MAPS changes
OBS changes
Colorlab palette work
Canvas/Studio changes
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
- Auto Advance removal
- bottom player dock
- playlist-first layout
- filter subset cleanup

Verification:
- build result
- playback auto-advance confirmation
- row visibility improvement
- Flow Curve regression check
- source filter regression check

Remaining blockers:
- list or none

Do not reopen:
- Auto Advance should not return as a default visible button.
- Player belongs at the bottom dock.
- Playlist table must remain the main working area.
- Filters should remain compact and tied to the table/list.
```

---

## Claude Prompt

Use this prompt with Claude from the main project folder:

```text
Implement 0701B_PLAY_PlaylistFirstPlayerDockAndFilterSubset_v1.0.0.md.

Work in the active PLAY source.

Primary goals:
1. Remove Auto Advance from the default visible controls.
2. Keep playlist playback auto-advancing by default until the end.
3. Move the player into a bottom dock.
4. Ensure the player no longer divides Flow Curve from playlist.
5. Make the playlist table the main working area.
6. Convert filters into a compact subset of the playlist/table, not a dominant separate panel.
7. Preserve title/artist/rating, previous/play-pause/next, and duration/progress in the player dock.
8. Preserve Flow Curve editing, source filters, track editor, source policy enforcement, and rating updates.

Do not change playback engine, assignment logic, Scheduler, WOS/WALL/MAPS, OBS, Colorlab, or Canvas/Studio.

Return a completion report with files changed, verification results, blockers, and do-not-reopen notes.
```
