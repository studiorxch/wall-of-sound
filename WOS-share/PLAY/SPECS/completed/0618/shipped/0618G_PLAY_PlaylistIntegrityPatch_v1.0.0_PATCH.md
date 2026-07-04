# 0618G_PLAY_PlaylistIntegrityPatch_v1.0.0_PATCH

## Project

**PLAY — Flow Curve Playlist Builder**

## Patch Name

`0618G_PLAY_PlaylistIntegrityPatch_v1.0.0_PATCH`

## Purpose

Patch playlist integrity issues discovered during real audition testing:

1. Removing a song from the current playlist leaves an empty slot instead of compacting or replacing.
2. Songs can be removed from the library, but not efficiently removed from only the playlist.
3. Songs can be auditioned and rated, but cannot be added from Library back into the Current Playlist.
4. Drag reorder works, but playlist edits need cleaner slot recalculation and warning refresh.
5. M3U export and Mixxx import counts do not always match, with no clear report explaining which songs were skipped or why.
6. Playback diagnostics exist, but export/Mixxx diagnostics need to become explicit and reviewable.

This patch keeps the current Flow Curve Builder usable as a playlist/library manager and audition workstation, while improving playlist reliability before transition editing or AutoDJ work begins.

---

## Hard Boundaries

Do **not** add:

- Crossfades
- Beat sync
- Waveforms
- Intro/outro labeling
- Transition timing
- AutoDJ runtime
- OBS/WOS integration
- Audio-reactive visuals

This is a playlist integrity and export diagnostics patch only.

---

## Current Working System To Preserve

The patch must preserve:

- CSV import from Track Pool Analyzer
- JSON project import/export
- CSV playlist export
- M3U export
- Flow Curve canvas
- Curve presets
- Track nodes
- Warning badges
- Inline locks
- Playlist audition player
- Play from any slot
- Pause / stop / previous / next
- Auto-play next track
- Now-playing row and node highlight
- Star ratings
- Play count and last played memory
- Drag reorder
- Right-click context menu
- Playback error badges

---

# Patch Tasks

## 1. Change Playlist Removal Default

### Current Behavior

Removing a song from the playlist clears the slot but leaves an empty row.

```text
slot 03 track removed
↓
slot 03 remains empty
↓
playback skips it
```

### New Default Behavior

Removing a song from the playlist should **compact the playlist by default**.

```text
remove slot 03
↓
slot 04 becomes slot 03
slot 05 becomes slot 04
...
playlist duration recalculates
warnings recalculate
```

### Requirements

- `Delete` / `Backspace` removes selected playlist track and compacts the playlist.
- Hover-only `×` remove button removes and compacts.
- Right-click context menu primary action: `Remove from playlist` should compact by default.
- Removed track stays in the library.
- Removed track is not deleted from the track pool.
- Playback should stop if the removed slot is currently playing.
- If a later slot is playing and an earlier slot is removed, now-playing slot index must update correctly.
- Locks must remain attached to the same track identity where possible, not blindly to the old row number.

### Acceptance

If a 32-track playlist removes slot 3, the playlist should become 31 visible tracks with no empty slot unless the user explicitly chooses to preserve a gap.

---

## 2. Add Optional Remove Modes

The context menu should expose three removal variants.

```text
Remove from playlist
Remove + replace with best fit
Remove and leave gap
```

### A. Remove from playlist

Default.

- Removes track from current playlist.
- Compacts remaining slots.
- Keeps track in library.
- Recalculates warning state.

### B. Remove + replace with best fit

Optional smart mode.

- Removes current track from slot.
- Searches available library/orphan pool for the best candidate for that slot.
- Candidate must not already be assigned in the playlist.
- Candidate should be scored against:
  - target slot energy
  - target slot BPM
  - previous track Camelot/BPM
  - next track Camelot/BPM
  - duration fit
- If no suitable candidate exists, fall back to compact removal or ask user via non-blocking confirm.

### C. Remove and leave gap

Advanced/manual mode.

- Current behavior preserved only as an explicit option.
- Leaves an empty slot.
- Empty slot receives `EMPTY` warning.
- Playback skips empty slot.
- Export skips empty slot and reports it.

---

## 3. Add From Library To Playlist

Library tracks must be insertable into the current playlist without regenerating the whole playlist.

### Library Row Context Menu

Add right-click actions in Library mode:

```text
Play preview
Add to playlist end
Insert after selected slot
Replace selected slot
Find best curve slot
```

### Add to playlist end

- Appends the selected library track to the end of the current playlist.
- Recalculates total playlist duration.
- Recalculates warnings for affected end slots.
- Track remains in library.

### Insert after selected slot

- Requires a selected playlist slot.
- Inserts the library track after the selected slot.
- Shifts later slots down.
- Recalculates timing and warnings.
- If no selected slot exists, insert at end.

### Replace selected slot

- Requires a selected playlist slot.
- Replaces that slot with the library track.
- Does not remove the old track from the library.
- Recalculates warnings for previous/current/next slots.
- If the replaced slot was locked, unlock by default unless the user explicitly re-locks.

### Find best curve slot

- Scores candidate placement across the current playlist.
- Finds best insertion or replacement location based on energy/BPM/key fit.
- Should not disrupt locked tracks.
- For v1.0.0, this can be conservative and place only into empty slots or append if no clear slot is available.

---

## 4. Preserve Manual Playlist Editing

Manual edits must not immediately get undone by auto-regeneration.

### Requirements

- Drag reorder must not trigger full playlist regeneration.
- Remove/insert/replace must not trigger full playlist regeneration.
- Instead, run a warning-only recalculation pass.
- The user’s manual order is authoritative until they intentionally apply a curve preset or regenerate from the curve.

### Add State Flag

Add an internal state flag:

```ts
manualOrderDirty: boolean;
```

Set to `true` after:

- drag reorder
- remove from playlist
- insert from library
- replace from library
- manual compact

When `manualOrderDirty` is true, curve preset changes may prompt or clearly indicate that applying a preset will reorder unlocked tracks.

---

## 5. Add Playlist Slot Utilities

Add or update utility functions in `src/logic/manualPlaylistOrder.ts`.

Required functions:

```ts
removeSlotCompact(slots, slotIndex): PlaylistSlot[]
removeSlotLeaveGap(slots, slotIndex): PlaylistSlot[]
replaceSlot(slots, slotIndex, track): PlaylistSlot[]
insertTrackAfterSlot(slots, slotIndex, track): PlaylistSlot[]
appendTrackToPlaylist(slots, track): PlaylistSlot[]
reindexPlaylistSlots(slots): PlaylistSlot[]
recalculateSlotStartTimes(slots): PlaylistSlot[]
```

### Rules

- Slot indexes must remain sequential after compact operations.
- Start times must be recalculated from durations.
- Empty slots must be preserved only in explicit leave-gap mode.
- Locked tracks must not be moved by smart replacement unless directly selected by the user.
- Manual reorder should respect locked-row guard unless the user is dragging an unlocked track around locked anchors.

---

# Export / Mixxx Diagnostics

## 6. Add Export Health Check

Add a validation pass before M3U export.

Create:

```text
src/logic/exportHealth.ts
```

### Function

```ts
type ExportHealthStatus =
  | "ok"
  | "empty_slot"
  | "no_path"
  | "missing_file"
  | "unsupported_extension"
  | "questionable_path"
  | "duplicate_path"
  | "unknown_error";
```

```ts
validatePlaylistForExport(slots: PlaylistSlot[]): ExportHealthReport
```

### Report Shape

```ts
type ExportHealthItem = {
  slotIndex: number;
  trackId?: string;
  title?: string;
  artist?: string;
  filePath?: string;
  status: ExportHealthStatus;
  message: string;
};

interface ExportHealthReport {
  totalSlots: number;
  exportableCount: number;
  skippedCount: number;
  problemCount: number;
  items: ExportHealthItem[];
}
```

### Checks

For each playlist slot:

- Is the slot empty?
- Does the track exist?
- Does `filePath` exist?
- Is the extension exportable?
- Is the path suspicious?
- Is the same file used multiple times?
- Will the M3U line be non-empty?

### Suspicious Path Heuristics

Flag as `questionable_path` if the path contains:

- newline characters
- null characters
- unresolved `file://` prefix if exporter expects raw path
- leading/trailing whitespace
- path that is not absolute
- characters known to cause M3U ambiguity if not handled safely

Do not automatically block questionable paths. Report them.

---

## 7. Add M3U Export Report

When exporting M3U, display and/or export a report.

### UI Summary

After export:

```text
M3U Export: 29 exported · 3 skipped · 1 warning
```

### Detailed Report Example

```text
M3U Export Report
Project: Mapgasm v2.3.0
Generated: 2026-06-18T23:44:00

SUMMARY
Total playlist slots: 32
Exported entries: 29
Skipped entries: 3
Warnings: 1

SKIPPED
#03 EMPTY SLOT
#14 MISSING FILE — /Users/studio/Music/.../Fragmented Shelf s01.wav
#21 NO PATH — Archive Drift s01

WARNINGS
#18 QUESTIONABLE PATH — contains leading/trailing whitespace
```

### Requirements

- Export report must identify exact slot numbers.
- Export report must identify exact track title and file path when available.
- Export report must explain why an item was skipped.
- Report should be copyable from UI.
- Optional: allow downloading as `.txt` or `.json` later.

---

## 8. Strengthen M3U Export

Patch `exportPlaylist.ts` if needed.

### Requirements

- Export only non-empty slots with valid `filePath`.
- Use absolute paths as raw lines unless current implementation requires another format.
- Include `#EXTM3U` header.
- Include `#EXTINF:<duration>,<artist> - <title>` before each path.
- Normalize line endings to `\n`.
- Do not export blank path lines.
- Count exactly how many path lines are written.
- Return export report alongside file content.

### Example

```m3u
#EXTM3U
#EXTINF:190,Unknown Artist - GPT-20260611-07A
/Users/studio/Music/_INBOX/Mapgasm/GPT-20260611-07A.wav
#EXTINF:150,Unknown Artist - Negative Space Dept.
/Users/studio/Music/_INBOX/Mapgasm/Negative Space Dept.wav
```

---

## 9. Add Export Problem Filters

Add filters in Library and Current Playlist modes:

```text
All
Playback Problems
Export Problems
Missing Files
Unrated
Played
Unplayed
1 Star
4 Stars
5 Stars
```

Minimum for this patch:

```text
All
Playback Problems
Export Problems
```

### Behavior

- `Playback Problems` uses existing `playbackErrors` map.
- `Export Problems` uses latest `ExportHealthReport`.
- If export health has not been run yet, run it lazily when filter is selected.

---

## 10. Add Diagnostic Badges For Export State

Current playback badges include:

```text
NO PATH
MISSING
CODEC
EXT
ERR
```

Add export-related badges:

```text
EMPTY
NO PATH
MISS
M3U
DUP
PATH
```

### Badge meanings

| Badge | Meaning |
|---|---|
| `EMPTY` | empty playlist slot |
| `NO PATH` | no file path available |
| `MISS` | file missing on disk |
| `M3U` | not exportable to M3U safely |
| `DUP` | duplicate file path appears more than once |
| `PATH` | questionable path formatting |

---

# Playback Problem Investigation

## 11. Improve Playback Error Explanations

The app already maps browser audio errors and does a HEAD request for media failures.

Improve the visible output so a failed track says:

```text
#06 CODEC — file exists, but browser cannot decode this audio format
```

or:

```text
#06 MISSING — file does not exist at path
```

or:

```text
#06 EXT — extension is blocked by media server
```

### Requirements

- Keep the transport error concise.
- Full diagnostic should be available in tooltip or context menu.
- Context menu action: `Copy file path`.
- Context menu action: `Copy diagnostic`.

---

## 12. Optional CLI Media Verification

Add optional utility later if time allows:

```text
tools/track-pool-analyzer/verify_playlist_media.py
```

This is not mandatory for this patch.

Purpose:

```text
Read exported M3U or project JSON and verify every referenced file exists on disk.
```

For now, prefer implementing the app-side export health report first.

---

# UI Rules

## Keep UI Footprint Low

Do not add bulky new permanent panels.

Preferred patterns:

- Right-click context menu
- Hover-only buttons
- Compact badges
- Existing warning bar
- Copyable modal only after export
- Existing drawer filters

## Remove Behavior Must Be Fast

Fast path:

```text
click row
press Delete
slot disappears
playlist compacts
```

Context path:

```text
right-click row
Remove from playlist
```

Advanced path:

```text
right-click row
Remove and leave gap
```

---

# Test Path

## Test A — Compact Remove

1. Load project with 32 playlist tracks.
2. Select slot 3.
3. Press Delete.
4. Confirm slot 3 disappears.
5. Confirm old slot 4 becomes new slot 3.
6. Confirm there is no empty row.
7. Confirm total track count decrements by one.
8. Confirm removed track still appears in Library mode.

## Test B — Leave Gap

1. Right-click slot 3.
2. Choose `Remove and leave gap`.
3. Confirm slot 3 remains empty.
4. Confirm `EMPTY` warning appears.
5. Confirm playback skips slot 3.
6. Confirm M3U export report skips slot 3 with reason `EMPTY SLOT`.

## Test C — Add From Library

1. Switch to Library mode.
2. Right-click a track not currently in playlist.
3. Choose `Add to playlist end`.
4. Confirm track appears at end of Current Playlist.
5. Choose another library track.
6. Choose `Insert after selected slot`.
7. Confirm insertion location is correct.
8. Choose another library track.
9. Choose `Replace selected slot`.
10. Confirm replacement happens without deleting old track from library.

## Test D — Export Report

1. Create playlist with known playable tracks and one empty slot.
2. Export M3U.
3. Confirm UI reports:
   - total slots
   - exported entries
   - skipped entries
   - reasons
4. Import into Mixxx.
5. Confirm Mixxx count matches exported entries count.

## Test E — Playback Problems

1. Play through playlist until a failed track appears.
2. Confirm row receives diagnostic badge.
3. Confirm diagnostic explains one of:
   - missing file
   - no path
   - codec issue
   - unsupported extension
   - unknown error
4. Filter by Playback Problems.
5. Confirm failed tracks appear.

---

# Acceptance Criteria

This patch passes when:

- Removing a playlist track compacts by default.
- Empty slots only occur when explicitly requested.
- Library tracks can be appended, inserted, and used to replace playlist slots.
- Manual playlist edits preserve the user’s order and do not trigger unwanted regeneration.
- M3U export shows exact exported/skipped counts.
- Mixxx import count can be predicted from the export report.
- Every skipped or missing Mixxx track has an exact slot/title/path/reason in the report.
- Playback problem tracks can be filtered and diagnosed.

---

# Files Likely To Patch

```text
flow-curve-builder/src/App.tsx
flow-curve-builder/src/ui/MainTrackWindow.tsx
flow-curve-builder/src/ui/PlaybackTransport.tsx
flow-curve-builder/src/logic/manualPlaylistOrder.ts
flow-curve-builder/src/logic/exportPlaylist.ts
flow-curve-builder/src/logic/exportHealth.ts
flow-curve-builder/src/styles.css
flow-curve-builder/vite.config.ts
```

---

# Implementation Guide

- **Where:** Patch playlist editing logic in `manualPlaylistOrder.ts` and `App.tsx`; patch row/context actions in `MainTrackWindow.tsx`; add export validation in `exportHealth.ts` / `exportPlaylist.ts`.
- **What:** Make playlist removal compact by default, allow library-to-playlist insertion/replacement, and add M3U export diagnostics that explain every skipped or missing track.
- **Expect:** No mystery gaps: removed tracks disappear or are intentionally replaced, library tracks can enter the playlist, and Mixxx import counts match the app’s export report.
