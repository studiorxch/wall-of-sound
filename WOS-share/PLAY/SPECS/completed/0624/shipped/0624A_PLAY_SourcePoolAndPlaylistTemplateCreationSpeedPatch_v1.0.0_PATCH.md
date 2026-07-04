# 0624A_PLAY_SourcePoolAndPlaylistTemplateCreationSpeedPatch_v1.0.0_PATCH

## Status

Ready for implementation.

## Priority

P0 / Playlist Creation Acceleration

This patch makes PLAY faster to program by turning the new `MusicSourcePool` and playlist-template foundations from 0623C into a practical workflow.

---

## Active Project Paths

Use the relocated PLAY location.

```text
WOS root:
  /Users/studio/Projects/wall-of-sound

PLAY root:
  /Users/studio/Projects/wall-of-sound/play

PLAY app:
  /Users/studio/Projects/wall-of-sound/play/flow-curve-builder

PLAY source:
  /Users/studio/Projects/wall-of-sound/play/flow-curve-builder/src
```

Do not write new PLAY changes to:

```text
/Users/studio/Projects/play
```

That path is legacy/inactive.

---

## Product Lock

```text
Events are what we promote.
Playlists are reusable engines.
Library is the central music source.
Scheduler is the event calendar.
Broadcast HUD is the live stage.
WOS is the spatial visual world.
```

This patch focuses on the middle layer:

```text
Library Track
→ Source Pool / Album Group
→ Playlist Template
→ Broadcast Event
```

---

## Problem

PLAY now has event-first data foundations, but playlist creation is still too manual.

The operator should not have to rebuild similar playlists from scratch every time.

Example current pain:

```text
Microhouse event needs 2 hours
source collection has 100 tracks
event only needs ~15 tracks
same event repeats weekly
each occurrence should feel fresh
```

The desired workflow:

```text
Create source pool: Microhouse 100
Create playlist template: Midnight Grid Template
Set target: 2 hours / ~15 tracks
Attach template to event
Generate or duplicate event playlist quickly
```

---

## Goal

Add a fast creation layer for:

1. central source pools
2. playlist templates
3. template-based playlist creation
4. basic dynamic fill from a selected source pool

This should be a foundation patch, not a full recommendation engine.

---

## Required Behavior

### 1. Add Source Pool creation workflow

Add a minimal UI path to create and manage `MusicSourcePool` records.

Preferred location:

```text
left panel / playlist panel / library section
```

or a compact section near playlist controls.

Minimum required actions:

```text
Create Source Pool
Edit Source Pool title
Assign selected/current playlist tracks to Source Pool
View pool track count
```

Minimum source pool fields exposed:

```text
title
description
genreFilter
moodFilter
trackIds
defaultDurationMinutes
defaultPresentationMode
```

Do not build a full library manager yet.

---

### 2. Add “Create Source Pool from Playlist”

This is the fastest practical bridge from current work.

Required action:

```text
Create Source Pool from Active Playlist
```

Behavior:

- creates a new `MusicSourcePool`
- title defaults to:

```text
<Playlist Title> Pool
```

- `trackIds` comes from all non-empty active playlist slots
- `defaultDurationMinutes` comes from playlist total/target duration if available
- `defaultPresentationMode` comes from playlist presentation mode if available
- persists into project state and export JSON

This allows existing playlists to become reusable source groups.

---

### 3. Add Playlist Template role workflow

Expose a way to mark a playlist as a template.

Existing 0623C field:

```ts
playlistRole?: "static" | "template" | "event_generated";
```

Minimum UI:

```text
Playlist Role:
  Static
  Template
  Event Generated
```

or a compact action:

```text
Use as Template
```

When a playlist is marked as `template`, expose:

```text
sourcePoolId
targetDurationMinutes
targetTrackCount
regenerationMode
```

Do not hide normal playlist editing.

A template is still editable.

---

### 4. Add “Create Playlist from Template”

Required action:

```text
Create Playlist from Template
```

Behavior:

- duplicates template identity fields
- creates a new playlist with `playlistRole: "event_generated"`
- copies presentation mode, title seed, description, accent color, cover/background if present
- fills slots from selected `sourcePoolId` when available
- if no source pool exists, falls back to duplicating current template slots

Suggested generated title:

```text
<Template Title> · Generated
```

or:

```text
<Template Title> · YYYY-MM-DD
```

---

### 5. Basic source-pool fill algorithm

Add a simple deterministic fill helper. Do not overbuild.

Possible new file:

```text
src/logic/sourcePoolFill.ts
```

Suggested function:

```ts
export function buildPlaylistSlotsFromSourcePool(args: {
  sourcePool: MusicSourcePool;
  tracks: Track[];
  targetDurationMinutes?: number;
  targetTrackCount?: number;
  seed?: string;
}): PlaylistSlot[];
```

Minimum rules:

- include only tracks listed in `sourcePool.trackIds` if provided
- otherwise match by genre/mood filters if provided
- skip invalid/missing tracks
- stop when target track count is reached
- also stop when target duration is reached or exceeded
- preserve deterministic order for now, using stable seeded shuffle if easy
- do not mutate library tracks

This is not a recommendation engine yet. It is a fast-fill utility.

---

### 6. Preserve artist and multi-genre metadata

Track metadata added in 0623C must become useful.

Expose or preserve where feasible:

```text
artist
genres[]
moodTags[]
albumTitle
albumGroupId
sourceOwner
```

Minimum visible improvement:

- track rows should show artist if present
- source pool creation should preserve genre/mood metadata
- export/import should round-trip all metadata

If editing fields is too large, preserve the data and expose read-only indicators first.

---

### 7. Event integration

When creating or editing an event, it should be able to point to:

```text
playlistId
playlistTemplateId
sourcePoolId
```

Minimum behavior:

- `Add Event` from a template playlist should set `playlistTemplateId`
- `Add Event` from a normal playlist should set `playlistId`
- if playlist has `sourcePoolId`, event should inherit it

Do not implement automatic per-occurrence regeneration yet unless it is low-risk.

---

## Non-Goals

Do not implement these in this patch:

- full central library manager
- full album cover grid
- full recurrence expansion
- weekly/monthly calendar redesign
- recently-used avoidance
- weighted recommendations
- BPM/energy matching
- audio analysis
- external artist database
- rights management workflow
- public event pages
- WOS map style editor
- snapshot button
- audio-reactive grid gestures
- swarm fish
- postMessage control

Those are later patches.

---

## Implementation Targets

Likely files to inspect/change:

```text
src/data/playlistTypes.ts
src/data/sourcePoolTypes.ts
src/data/eventTypes.ts
src/data/playProjectStorage.ts
src/data/playProjectExport.ts
src/App.tsx
src/ui/PlaylistPanel.tsx
src/ui/TrackTable.tsx
src/ui/SchedulerGuideView.tsx
src/styles.css
```

Possible new file:

```text
src/logic/sourcePoolFill.ts
```

If the playlist panel has a different component name, use the existing component that controls playlist list/metadata.

---

## Suggested State/API Additions

In `App.tsx`, add handlers similar to:

```ts
function handleCreateSourcePoolFromPlaylist(playlistId: string): void;

function handleUpdateSourcePool(poolId: string, patch: Partial<MusicSourcePool>): void;

function handleSetPlaylistRole(
  playlistId: string,
  role: "static" | "template" | "event_generated"
): void;

function handleCreatePlaylistFromTemplate(templatePlaylistId: string): void;
```

Keep handlers small and reuse existing project persistence.

---

## Source Pool Fill Details

### Input priority

Use this order:

```text
1. sourcePool.trackIds
2. sourcePool.albumGroupIds
3. sourcePool.genreFilter + moodFilter
4. fallback: empty result
```

### Duration behavior

If target duration is 120 minutes:

```text
add tracks until total duration >= 120 minutes
```

If target track count is 15:

```text
stop at 15 tracks
```

If both exist:

```text
stop when either target is satisfied
```

### Stable shuffle

If simple enough, use a seeded shuffle based on:

```text
sourcePool.id + templatePlaylistId + date seed
```

If not simple, preserve original order and leave seeded shuffle for later.

Do not use `Math.random()` unless order does not need to persist.

---

## UI Requirements

### Source Pool Section

Minimum row/card:

```text
Microhouse 100
100 tracks · microhouse / minimal / night
```

Actions:

```text
Create from Playlist
Use in Template
```

### Playlist Template Fields

For a template playlist, show:

```text
Template
Source Pool: <pool title>
Target: 2h / 15 tracks
Regeneration: manual / per event occurrence
```

### Generated Playlist Indication

Generated playlists should show a small label:

```text
Generated
```

or:

```text
Event Generated
```

They should still be editable.

---

## Storage / Export Requirements

After creating a source pool and template, Project JSON must include:

```text
sourcePools
playlistRole
sourcePoolId
targetDurationMinutes
targetTrackCount
regenerationMode
broadcastEvents sourcePoolId/template references where used
```

Clearing LocalStorage and importing the JSON must restore these.

---

## Acceptance Criteria

### A. Source pool can be created from active playlist

Given active playlist has tracks:

```text
Create Source Pool from Playlist
```

creates a pool with matching track IDs and visible track count.

---

### B. Playlist can be marked as template

Given an existing playlist:

```text
Use as Template
```

sets:

```text
playlistRole = "template"
```

and exposes template-specific fields.

---

### C. Generated playlist can be created

Given a template playlist with a source pool:

```text
Create Playlist from Template
```

creates a new playlist with:

```text
playlistRole = "event_generated"
sourcePoolId inherited
presentation mode inherited
filled slots from source pool
```

---

### D. Metadata persists

Track metadata and pool/template references survive:

```text
export Project JSON
clear LocalStorage
import Project JSON
```

---

### E. Events inherit template/source-pool references

When adding an event from a template playlist, event contains:

```text
playlistTemplateId
sourcePoolId
```

When adding an event from a static playlist, event contains:

```text
playlistId
```

---

### F. No current behavior regression

Existing playlists, Scheduler, Broadcast HUD, Map Channel, and Project JSON import/export continue to work.

---

### G. TypeScript clean for touched files

Run:

```bash
cd /Users/studio/Projects/wall-of-sound/play/flow-curve-builder
npm run build
```

Expected:

```text
no new TypeScript errors from this patch
```

---

## Manual Test Checklist

1. Start PLAY.

```bash
cd /Users/studio/Projects/wall-of-sound/play/flow-curve-builder
npm run dev
```

2. Open a playlist with tracks.

3. Click:

```text
Create Source Pool from Playlist
```

4. Confirm source pool appears with correct track count.

5. Mark playlist as:

```text
Template
```

6. Assign the source pool.

7. Set:

```text
targetDurationMinutes = 120
targetTrackCount = 15
regenerationMode = manual
```

8. Click:

```text
Create Playlist from Template
```

9. Confirm generated playlist appears.

10. Confirm generated playlist contains source-pool tracks.

11. Add Event from generated or template playlist.

12. Export Project JSON.

13. Clear LocalStorage.

14. Import Project JSON.

15. Confirm source pool, template playlist, generated playlist, and event relationships restore.

16. Confirm Broadcast HUD / Map Channel still works.

---

## Expected Result

PLAY gains a practical creation-speed workflow:

```text
existing playlist → source pool
source pool → playlist template
playlist template → generated playlist
generated playlist → event
event → broadcast
```

This is the first major step toward fast recurring event programming and 24/7 channel operations.

---

## Implementation Guide

- **Where:** Work inside `/Users/studio/Projects/wall-of-sound/play/flow-curve-builder`, mainly playlist/source-pool data, App handlers, playlist panel UI, and optional `sourcePoolFill.ts`.
- **What:** Add source-pool creation from playlist, template roles, generated playlist creation from template, and basic source-pool fill.
- **Expect:** PLAY can rapidly turn existing playlists into reusable event-ready playlist engines instead of rebuilding similar programming blocks manually.
