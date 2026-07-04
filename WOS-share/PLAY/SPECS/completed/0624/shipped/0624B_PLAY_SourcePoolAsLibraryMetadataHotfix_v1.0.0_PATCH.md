# 0624B_PLAY_SourcePoolAsLibraryMetadataHotfix_v1.0.0_PATCH

## Status

Ready for implementation.

## Priority

P0 / Corrective UX Hotfix

This patch corrects the 0624A Source Pool workflow so Source Pools stop behaving like duplicate playlist objects in the left panel.

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

## Problem

0624A added useful foundations:

```text
sourcePoolFill
playlist roles
template playlists
generated playlists
source pool persistence
event/template/sourcePool inheritance
```

But the Source Pool UI is wrong.

The current left panel creates a separate `SOURCE POOLS` section that behaves like another playlist list:

```text
PLAYLISTS
SOURCE POOLS
```

This increases visual footprint and creates duplicate-looking objects.

That conflicts with the actual product goal:

```text
centralize the music library
reduce left-panel footprint
manage groups through track metadata/properties
```

Source Pools should behave like DJ-library crates, smart crates, tags, or saved filters — not like more playlists.

---

## Correct Product Model

```text
Source Pool is not another playlist.
Source Pool is a reusable library grouping/filter.
Playlist is an ordered program.
Event is the scheduled promoted show.
Library is the central source of tracks.
```

Correct hierarchy:

```text
Library Track
├── artist
├── title
├── genres[]
├── moodTags[]
├── albumGroupId
├── sourceOwner
└── sourcePoolIds[] / group membership

Source Pool
└── saved grouping/filter over Library Tracks

Playlist Template
└── pulls from Source Pool

Event
└── attaches playlist/template/source pool to calendar
```

---

## Rollback Scope

Do **not** fully revert 0624A.

Keep these 0624A foundations:

```text
src/logic/sourcePoolFill.ts
playlistRole
sourcePoolId on playlists/templates
targetTrackCount
regenerationMode
Create Playlist from Template
event inheritance of playlistTemplateId/sourcePoolId
sourcePools[] in project state/export/import
```

Rollback or revise only the Source Pool UI behavior that makes pools look like playlist duplicates.

---

## Required Behavior

### 1. Remove permanent Source Pools list from left panel

Target likely file:

```text
src/ui/FileManager.tsx
```

Remove or collapse the visible sidebar section:

```text
SOURCE POOLS
```

Do not display every source pool as a competing sidebar row under playlists.

The left panel should stay focused:

```text
Library
AutoMix
Playlists
Events later
```

Source pools may appear as a compact count or nested Library tool, but not as a second playlist stack.

---

### 2. Move Source Pool creation/management toward Library metadata

Source Pools should appear under Library behavior, not playlist navigation.

Acceptable minimal UI:

```text
Library
  Groups / Filters
  Microhouse 100 · 100 tracks
  Stranger Vibes · 40 tracks
```

If building that UI is too large, use a compact modal/dropdown/action area instead.

Minimum corrected behavior:

- `Create Source Pool from Playlist` can remain.
- The created pool should not create a permanent left-panel row.
- The pool should be available in template source-pool dropdowns.
- The pool should be visible only in a compact Library/Groups context or template settings.

---

### 3. Add track-level membership foundation

Add track-level pool membership if low-risk:

```ts
sourcePoolIds?: string[];
```

When `Create Source Pool from Playlist` runs:

- create/update the `MusicSourcePool`
- add the new pool id to each included track's `sourcePoolIds`
- preserve existing `sourcePool.trackIds` for compatibility

Repair rule:

```text
if track.sourcePoolIds missing → []
```

This moves the system toward Mixxx/Rekordbox-style library grouping.

If adding track-level membership creates too much risk, keep `sourcePool.trackIds` but do not expose pools as sidebar objects. Track-level membership should then be scheduled for the next patch.

---

### 4. Source Pool selection remains in Playlist Template settings

Keep the useful part from 0624A:

```text
Template playlist
→ Source Pool dropdown
→ Target tracks/duration
→ Create Playlist from Template
```

This is the right place for Source Pools to be selected.

The operator should not navigate to a Source Pool as if it were a playlist.

---

### 5. Rename UI language if needed

Use language that communicates library grouping:

Preferred labels:

```text
Library Group
Track Group
Source Group
Saved Filter
Pool
```

Avoid labels that imply another playlist.

Recommended near-term label:

```text
Library Groups
```

Internally the type can remain `MusicSourcePool`.

---

### 6. Preserve Project JSON compatibility

Projects exported after 0624A must still import.

Do not delete `sourcePools[]`.

Do not break:

```text
sourcePoolId
playlistRole
targetTrackCount
regenerationMode
broadcastEvent.sourcePoolId
playlistTemplateId
```

Project JSON should still round-trip all source pool/template data.

---

## Non-Goals

Do not implement these in this patch:

- full central library manager
- full DJ crate UI
- smart filter builder
- album cover grid
- bulk metadata editor
- BPM/energy filters
- recently-used avoidance
- full event recurrence/calendar
- map style editor
- snapshot button
- audio-reactive grid gestures
- WOS postMessage control

This is a corrective UX/data-model hotfix only.

---

## Implementation Targets

Likely files:

```text
src/ui/FileManager.tsx
src/ui/PlaylistHeader.tsx
src/data/playlistTypes.ts
src/data/sourcePoolTypes.ts
src/data/playProjectStorage.ts
src/App.tsx
src/logic/sourcePoolFill.ts
src/styles.css
```

Primary target:

```text
src/ui/FileManager.tsx
```

because that is where the visible Source Pools footprint appears.

---

## Acceptance Criteria

### A. No duplicate Source Pools sidebar stack

The left panel should no longer show a full `SOURCE POOLS` list under playlists.

Expected:

```text
PLAYLISTS remain visible
SOURCE POOLS does not appear as a competing object list
```

A compact Library Groups entry is acceptable only if it does not expand the footprint significantly.

---

### B. Template workflow still works

A template playlist can still select a source pool/library group.

```text
Playlist Role = Template
Source Pool dropdown works
Create Playlist from Template works
```

---

### C. Create Source Pool from Playlist still works

The action should still create a reusable grouping from the active playlist, but it should now behave as library metadata/grouping rather than creating sidebar clutter.

Expected:

```text
Create Source Pool from Playlist
→ group exists in project
→ template dropdown can use it
→ no permanent duplicate row stack appears in sidebar
```

---

### D. Project JSON survives

Export/import must preserve:

```text
sourcePools
playlistRole
sourcePoolId
targetTrackCount
regenerationMode
broadcastEvents
playlistTemplateId
```

If `sourcePoolIds[]` is added to tracks, it must also round-trip.

---

### E. Existing 0624A projects still load

If a project already has several Source Pools from 0624A, importing/loading it should not crash and should not show those pools as a large duplicate playlist stack.

---

### F. TypeScript clean

Run:

```bash
cd /Users/studio/Projects/wall-of-sound/play/flow-curve-builder
npm run build
```

Expected:

```text
no new TypeScript errors
```

---

## Manual Test Checklist

1. Start PLAY.

```bash
cd /Users/studio/Projects/wall-of-sound/play/flow-curve-builder
npm run dev
```

2. Load current project.

3. Confirm left panel no longer shows large `SOURCE POOLS` stack.

4. Open a playlist.

5. Click:

```text
Create Source Pool
```

or:

```text
Create Source Pool from Playlist
```

6. Confirm the group is created without adding a duplicate visible sidebar row.

7. Mark playlist as Template.

8. Confirm source pool/library group appears in template dropdown.

9. Create Playlist from Template.

10. Confirm generated playlist still fills from the pool.

11. Export Project JSON.

12. Clear LocalStorage.

13. Import Project JSON.

14. Confirm groups/templates/generated playlists/events restore.

15. Confirm Broadcast HUD and Map Channel still work.

---

## Expected Result

PLAY keeps the useful 0624A source-pool/template engine while correcting the UX direction.

The system moves toward a DJ-library model:

```text
central library
track metadata
library groups / saved filters
playlist templates
events
broadcast
```

not a left panel filled with duplicate collection objects.

---

## Implementation Guide

- **Where:** Work mainly in `FileManager.tsx`, preserving the 0624A data/model work while removing the Source Pools sidebar footprint.
- **What:** Treat Source Pools as Library Groups / track metadata filters, not playlist-like navigation rows.
- **Expect:** Less left-panel clutter, better centralized-library behavior, and no regression to playlist template/event workflows.
