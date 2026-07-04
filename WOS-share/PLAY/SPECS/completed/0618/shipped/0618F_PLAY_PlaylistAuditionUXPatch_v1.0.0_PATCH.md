# 0618F_PLAY_PlaylistAuditionUXPatch_v1.0.0_PATCH

## Project Title

**0618F_PLAY_PlaylistAuditionUXPatch_v1.0.0_PATCH**

## Purpose

Patch the current Flow Curve Playlist Builder / Playlist Audition Player so the audition workflow becomes fast enough for real playlist building.

The user must be able to:

- Remove a song from the current playlist without deleting it from the library.
- Drag songs through the playlist instead of clicking move buttons repeatedly.
- See index numbers in Library mode.
- Understand why certain songs fail playback.
- See an unambiguous playback display with current time, duration, progress, and basic seek control.

This patch does **not** add transitions, waveform editing, beat-sync, crossfades, or AutoDJ. It improves the listening and playlist-ordering loop.

---

## Environmental Assumptions

- Existing app: Vite + React + TypeScript.
- Existing modules include:
  - `src/App.tsx`
  - `src/ui/MainTrackWindow.tsx`
  - `src/ui/PlaybackTransport.tsx`
  - `src/logic/manualPlaylistOrder.ts`
  - `src/logic/playbackQueue.ts`
  - `src/logic/warningEngine.ts`
  - `src/styles.css`
  - `vite.config.ts`
- Existing behavior must be preserved:
  - CSV import
  - JSON import/export
  - M3U export
  - Flow Curve editing
  - playlist assignment
  - inline locks
  - playback audition
  - ratings
  - play count / last played tracking

---

## Patch Targets

### 1. Remove Song From Current Playlist

#### Problem

The user can remove songs from the library, but cannot quickly remove a song from the current playlist. Rating a song one star and filtering it out is a workaround, not a proper workflow.

#### Required Behavior

Add playlist-only removal:

- Removing from playlist must **not** delete the track from the library.
- Removed playlist songs should become excluded from the current playlist build.
- Removed tracks should be visible in the `Excluded` drawer mode.
- Removed tracks should be restorable.
- JSON export/import must preserve excluded state.

#### Interaction Requirements

Support at least two removal paths:

1. **Keyboard delete**
   - Select or focus a playlist row.
   - Press `Delete` or `Backspace`.
   - Remove that track from the current playlist.
   - Do not delete from library.

2. **Context menu**
   - Right-click a playlist row.
   - Show compact menu:
     - Remove from Playlist
     - Lock / Unlock
     - Play from Here
     - Rate
   - `Remove from Playlist` excludes the track from the current playlist.

#### Optional UI-Minimal Action

A visible delete button is optional. If added, keep it compact and hidden until row hover.

Suggested icon:

```text
×
```

Tooltip:

```text
Remove from playlist only
```

---

### 2. Drag Reorder Playlist Rows

#### Problem

Moving a song from slot 21 to slot 2 requires 19 clicks. This is not usable.

#### Required Behavior

Add drag-and-drop reordering inside Current Playlist mode.

- Drag handle should be small and use an existing footprint.
- The current lock column or row handle area can act as the drag handle.
- Dragging a row changes playlist order directly.
- Warnings recalculate after drop.
- Flow curve fit recalculates after drop.
- Playback order follows the new row order.
- Manual reorder must not regenerate the playlist automatically.
- Locks must be respected.

#### Lock Rules

- Locked rows can be dragged only if the user unlocks first, or dragging a locked row should be blocked with a small message.
- Dropping another row into a locked slot should be blocked.
- If a locked row is involved, show a clear tooltip/status:
  - `Locked slot — unlock before moving`

#### Implementation Preference

Use pointer events or native drag events. Do not add a large dependency unless already present.

Preferred row handle:

```text
☰
```

or use the existing small lock/action space.

#### Required State Update

Create or update logic:

```ts
reorderPlaylistSlot(params: {
  slots: TrackSlot[];
  fromSlotIndex: number;
  toSlotIndex: number;
  locks: TrackLock[];
}): TrackSlot[];
```

Rules:

- Preserve assigned tracks.
- Preserve lock state.
- Re-index slots after move.
- Recalculate start times if needed.
- Re-run warning-only pass.
- Do not call full playlist regeneration.

---

### 3. Library Index Numbers

#### Problem

Library view lacks row index numbers, making it hard to read clusters and count groups.

#### Required Behavior

Library mode must show a leftmost index column.

- Index should be visible in Library, Current Playlist, Orphans, Excluded, and Locks where applicable.
- In Library mode, index reflects current filtered/sorted visible order.
- In Playlist mode, index reflects slot order.
- In filtered Library views, index should allow quick counting of clusters.

Column:

```text
#
```

Example:

```text
#   Title                         BPM    Key
1   Track A                       117    7B
2   Track B                       119    8B
3   Track C                       122    8B
```

---

### 4. Playback Failure Diagnostics

#### Problem

Some songs fail playback even though they appear to be in the same folder tree and are imported into the library. Mixxx also imports fewer songs than expected. The user needs visible diagnostics.

#### Required Behavior

Replace vague browser errors with categorized playback diagnostics.

Playback status categories:

```ts
type PlaybackFileStatus =
  | "unknown"
  | "playable"
  | "no_file_path"
  | "file_missing"
  | "blocked_path"
  | "unsupported_extension"
  | "unsupported_codec"
  | "media_server_error";
```

#### Required UI

Add compact table status badges:

```text
PLAY
NO PATH
MISSING
BLOCKED
EXT
CODEC
ERR
```

The badge should appear in Library mode and Current Playlist mode.

#### Required Diagnostics

When playback fails, show:

- Track title
- Slot number
- File path
- Error category
- Browser audio error code if available
- HTTP status from `/media?path=...` if available
- Suggested fix

Examples:

```text
#6 failed: file exists but browser cannot decode codec.
#6 failed: media server returned 404. Check file path.
#6 failed: unsupported extension.
```

#### Middleware Requirements

Patch `vite.config.ts` media middleware to return clear JSON or status messages for:

- missing `path`
- unsupported extension
- file does not exist
- file is not a file
- failed stat
- range request error
- stream error

#### Browser Error Handling

Patch audio element error handling in `App.tsx`:

- Read `audio.error.code`
- Map error codes to readable categories:
  - `MEDIA_ERR_ABORTED`
  - `MEDIA_ERR_NETWORK`
  - `MEDIA_ERR_DECODE`
  - `MEDIA_ERR_SRC_NOT_SUPPORTED`
- Display user-facing reason.

---

### 5. Playback Display / Seek Control

#### Problem

Current playback state is too ambiguous. The user needs to know what is playing, where playback is, and have control.

#### Required Behavior

Upgrade `PlaybackTransport` with a compact playback display.

Include:

- Current slot number
- Track title
- Artist
- Current playback time
- Total duration
- Progress bar
- Seek support
- Play / pause
- Stop
- Previous
- Next
- Autoplay toggle
- Play-from-slot input

#### Required Layout

Keep footprint small. Suggested compact row:

```text
#05 · Artist – Title                       1:22 / 4:23
[⏮] [▶/⏸] [■] [⏭]  [────────●────]  Slot [ 5 ]  Auto ON
```

#### Progress Bar Behavior

- Shows current playback progress.
- User can click/drag to seek.
- Updates via audio `timeupdate`.
- Resets on stop.
- Updates when playback moves to next slot.

#### Keyboard Shortcuts

Add simple shortcuts:

| Key | Action |
|---|---|
| Space | Play / Pause |
| Escape | Stop |
| ArrowRight | Next track |
| ArrowLeft | Previous track |
| Delete / Backspace | Remove selected row from playlist |

Only trigger shortcuts when user is not typing inside an input.

---

### 6. Row Selection Model

#### Problem

Delete key and node/row relationships need a clear selection model.

#### Required Behavior

Add selected row state.

- Clicking a row selects it.
- Hovering a curve node highlights the matching row, but does not permanently select it.
- Selected row remains selected until another row is selected.
- Delete key acts on selected row.
- Playback row highlight remains separate from selected row highlight.

State:

```ts
selectedSlotIndex: number | null;
hoveredSlotIndex: number | null;
playingSlotIndex: number | null;
```

Visual priority:

```text
playing > selected > hover > warning
```

---

### 7. Preserve Current Working Behavior

Do not break:

- Flow Curve editing
- clicking empty curve space to add control points
- right-clicking curve points to remove them
- node number labels
- hover node → row highlight
- ratings
- play count
- last played
- JSON round-trip
- M3U export
- CSV export
- warning badges
- locks

---

## Acceptance Criteria

Patch passes when all are true:

1. User can select a playlist row and press Delete to remove it from the playlist only.
2. Removed tracks appear in Excluded and can be restored.
3. User can right-click a row and choose Remove from Playlist.
4. User can drag slot 21 to slot 2 in one gesture.
5. Locked rows cannot be accidentally displaced.
6. Library view shows index numbers.
7. Playlist view still shows slot numbers.
8. Playback transport shows current time, total duration, and progress.
9. User can seek within a playing track.
10. Failed playback shows a specific reason instead of generic unsupported error.
11. Current playlist playback still supports play from any slot, stop, pause, next, previous, and autoplay.
12. Ratings and play counts still work.
13. Manual reorder does not trigger full playlist regeneration.
14. Warnings recalculate after remove, restore, or drag reorder.

---

## Suggested Build Order

### 1. Selection State

Patch `App.tsx`:

- add selected slot state
- row click selects
- Delete/Backspace removes selected playlist track

### 2. Playlist Removal

Patch:

- `App.tsx`
- `MainTrackWindow.tsx`
- exclusion/restore logic if needed

### 3. Drag Reorder

Patch:

- `manualPlaylistOrder.ts`
- `MainTrackWindow.tsx`
- `App.tsx`

### 4. Playback Display

Patch:

- `PlaybackTransport.tsx`
- `App.tsx`
- `styles.css`

### 5. Playback Diagnostics

Patch:

- `vite.config.ts`
- `App.tsx`
- `MainTrackWindow.tsx`

### 6. Library Index

Patch:

- `MainTrackWindow.tsx`

---

## Non-Goals

Do not add:

- crossfades
- beat sync
- waveform display
- intro/outro labels
- transition lab
- AutoDJ runtime
- OBS integration
- WOS bridge
- permanent library deletion changes beyond existing behavior

---

## Implementation Guide

- **Where:** Patch `App.tsx`, `MainTrackWindow.tsx`, `PlaybackTransport.tsx`, `manualPlaylistOrder.ts`, `vite.config.ts`, and `styles.css`.
- **What:** Add playlist-only delete, drag reorder, library indexes, clearer playback failure diagnostics, selected row state, and a progress/seek playback display.
- **Expect:** The user can audition a playlist, stop, delete or drag songs quickly, see exactly what is playing, identify unplayable files, and resume playback without exporting to Mixxx.
