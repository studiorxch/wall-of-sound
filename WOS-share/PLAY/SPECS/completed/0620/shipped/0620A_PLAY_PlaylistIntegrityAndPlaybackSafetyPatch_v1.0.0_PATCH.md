# 0620A_PLAY_PlaylistIntegrityAndPlaybackSafetyPatch_v1.0.0_PATCH

## Patch Name

**PLAY Playlist Integrity + Playback Safety Patch**

## Version

`v1.0.0`

## Date

2026-06-20

## Status

Draft for implementation

---

# 1. Purpose

PLAY now has the core playlist workflow working:

```text
Create playlist
Import / browse Library
Drag tracks into playlist
Fill Missing Time
Regenerate From Curve
Export M3U
Reload
Persist state
```

The next priority is reliability.

This patch addresses four workflow failures discovered during testing:

1. Empty slots cannot be repaired after using “Remove and leave gap.”
2. Flow-curve nodes can become stuck while dragging.
3. Duplicate/repeated tracks can still enter playlists and need prevention before cleanup.
4. Unplayable tracks can disrupt audition playback and would be dangerous during a live stream.

Core principle:

```text
Nothing unplayable, duplicated, or empty should silently enter a playlist intended for export or broadcast.
```

---

# 2. Current Test Result

The following workflow passed:

```text
Create playlist ✅
Import / browse Library ✅
Drag tracks into playlist ✅
Fill Missing Time ✅
Regenerate From Curve ✅
Export M3U ✅
Reload ✅
Confirm everything persists ✅
```

This means the next patch should not re-architect the workspace. It should harden the current system.

---

# 3. Scope

## Included

### A. Empty Slot Repair

- Fill an individual empty slot.
- Drag a track into an empty slot.
- Replace an empty slot with selected/library track if feasible.
- Delete an empty slot and compact playlist.
- Make `Fill Missing Time` fill empty slots first before adding new slots.

### B. Duplicate Prevention

- Centralize duplicate detection.
- Prevent duplicates before they enter playlists.
- Apply duplicate guard to:
  - drag-to-playlist
  - Fill Missing Time
  - Regenerate From Curve
  - manual insert/replace
  - restore flows if applicable
- Keep `Remove Repeated Copies` as a repair tool, not the main defense.

### C. Playback Safety

- Detect CODEC / unsupported / no-source playback errors.
- Mark failed tracks as unplayable.
- Skip unplayable tracks during playback.
- Exclude unplayable tracks from Fill Missing Time and Regenerate From Curve.
- Add Playback Issues filter/view.
- Add quarantine/remove action for unplayable tracks.
- Add export-health warnings for unplayable tracks.

### D. Flow Curve Drag Stability

- Harden curve point dragging.
- Prevent stuck drag state.
- Use pointer capture if feasible.
- Clear drag state on pointerup / pointercancel / mouseleave / blur.
- Track active drag by pointId, not stale point object reference.

## Excluded

- Playlist cover/background identity.
- Broadcast scene rendering.
- 24-hour / 7-day scheduler.
- Waveform mixer.
- Mood vector.
- Full audio transcoding.
- Codec conversion.
- Cloud file repair.
- Beatgrid/phrase analysis.

---

# 4. Issue 1 — Empty Slot Repair

## Problem

The current app supports:

```text
Remove and leave gap
```

But an empty gap is not useful unless it can be filled later.

Current failure:

```text
User removes a song and leaves an empty slot.
The slot remains visible.
There is no obvious way to fill that exact slot.
```

## Required Behavior

An empty slot should become a purposeful placeholder.

Example row:

```text
#12 Empty slot · target E 0.62 · 126 BPM · 8A/9A preferred
[Fill Gap] [Choose Track] [Delete Gap]
```

## Required Actions

### Fill Gap

Find the best eligible unused track for this specific slot.

Rules:

- use the slot target energy
- use neighbor BPM / key if available
- block duplicates
- block excluded/removed tracks
- block unplayable tracks
- assign the best candidate to this slot
- recalculate warnings
- autosave

### Choose Track / Replace From Library

If a selected library track exists, allow:

```text
Replace empty slot with selected track
```

If no selected library track exists, show readable message:

```text
Select a library track first, then replace this gap.
```

Optional v1 alternative:

```text
Right-click library row → Replace selected empty slot
```

### Delete Gap

Compact the playlist by removing the empty slot.

Behavior:

- remove empty slot
- reindex remaining slots
- recalculate duration
- autosave

## Fill Missing Time Integration

`Fill Missing Time` must fill empty slots before adding new slots.

Order:

```text
1. Fill existing empty slots.
2. Recalculate duration.
3. If still under target, add new eligible tracks.
4. Recalculate warnings.
5. Autosave.
```

---

# 5. Issue 2 — Flow-Curve Node Drag Stability

## Problem

While adjusting the flow curve, nodes can stop responding or become stuck.

Likely causes:

- pointer capture not used or not released
- drag state not cleared on pointer cancel
- mouse leaves canvas while dragging
- canvas rerender invalidates active point reference
- drag logic tracks object reference instead of stable pointId
- event listeners miss mouseup when pointer exits component

## Required Fix

Harden `FlowCurveCanvas` pointer handling.

Recommended behavior:

```text
onPointerDown:
  identify pointId
  set activeDragPointId
  setPointerCapture(pointerId)

onPointerMove:
  if activeDragPointId exists, update that point by id

onPointerUp:
  releasePointerCapture
  clear activeDragPointId

onPointerCancel:
  clear activeDragPointId

onMouseLeave / onBlur:
  clear activeDragPointId safely
```

## Required Safety

- Drag state must never remain stuck after pointer release.
- Clicking outside the canvas should not permanently block future node edits.
- Drag should still work after multiple edits.
- Curve points should remain editable after playlist regeneration/fill actions.

## Optional

Add:

```text
Escape = cancel current curve drag
```

Do not block the patch on this if pointer cleanup solves the issue.

---

# 6. Issue 3 — Duplicate Prevention Before Cleanup

## Problem

`Remove Repeated Copies` is valuable, but duplicate tracks should be blocked earlier.

Duplicates should not enter playlists through:

- drag-to-playlist
- Fill Missing Time
- Regenerate From Curve
- manual add/insert/replace
- restore flows
- project migration if feasible

## Required Shared Guard

Create or extend a central helper.

Suggested file:

```text
src/playlistIntegrity.ts
```

Suggested APIs:

```ts
export function normalizeFilePath(path?: string): string;

export function getPlaylistTrackIdentity(params: {
  track: Track;
}): {
  trackId: string;
  normalizedFilePath?: string;
  fallbackKey: string;
};

export function findPlaylistDuplicate(params: {
  playlist: PlaylistRecord;
  candidateTrack: Track;
  tracksById: Map<string, Track>;
}): {
  duplicate: boolean;
  reason?: "trackId" | "filePath" | "fallback";
  existingSlotIndex?: number;
  existingTrackId?: string;
};

export function canAddTrackToPlaylist(params: {
  playlist: PlaylistRecord;
  candidateTrack: Track;
  tracksById: Map<string, Track>;
  allowReplaceSameSlot?: boolean;
  targetSlotIndex?: number;
}): {
  ok: boolean;
  reason?: "duplicate_track_id" | "duplicate_file_path" | "duplicate_fallback" | "unplayable" | "excluded" | "removed";
  existingSlotIndex?: number;
};
```

## Duplicate Rules

Block by:

```text
trackId
normalized filePath
```

Optional fallback if both path and ID are unreliable:

```text
normalized title + artist + duration bucket
```

Fallback should be conservative. Do not over-block unrelated remixes unless confidence is high.

## Required Application Points

Use the shared guard in:

- drag-to-playlist append
- active playlist manual insert
- replace slot
- Fill Gap
- Fill Missing Time
- Regenerate From Curve candidate selection
- Restore / unexclude flows if they can auto-place tracks

## Keep Cleanup Tool

Keep:

```text
Remove Repeated Copies
```

But reposition as:

```text
repair existing playlist
```

not the primary duplicate defense.

---

# 7. Issue 4 — Playback Safety / Unplayable Tracks

## Problem

Some tracks are not playable in the browser/audio environment.

Observed error:

```text
Playback error — CODEC
#1: Failed to load because no supported source was found.
```

This disrupts normal playback and could break a live stream.

The app must detect, remember, and avoid these tracks.

## Required Track Playback Status

Add playback safety metadata to track records.

Recommended type:

```ts
export type TrackPlaybackStatus =
  | "unknown"
  | "playable"
  | "unplayable";

export type TrackPlaybackIssue = {
  status: TrackPlaybackStatus;
  code?: "CODEC" | "NO_SOURCE" | "MISSING" | "NETWORK" | "UNKNOWN";
  message?: string;
  detectedAt?: string;
  source?: "audio_element" | "head_check" | "export_health" | "manual";
};
```

Add to `Track` or a track-status map:

```ts
playbackIssue?: TrackPlaybackIssue;
```

If avoiding mutation of `Track`, store in project-level map:

```ts
trackPlaybackIssues: Record<string, TrackPlaybackIssue>;
```

Choose the least disruptive approach for existing persistence.

## Error Handling

When audio playback fails:

1. capture error type
2. map browser/media error to internal issue code
3. mark track unplayable
4. save issue state
5. show toast
6. if Auto is ON, skip to next playable track
7. do not repeatedly retry the same unplayable track

Toast example:

```text
Skipped unplayable track: CODEC.
```

## Auto-Advance Behavior

If Auto is ON and current track fails:

```text
mark unplayable
skip to next playable slot
continue playback
```

If no playable next track:

```text
stop playback
show: "No playable tracks remaining."
```

If Auto is OFF:

```text
mark unplayable
stop playback
show error
```

## Candidate Exclusion

Unplayable tracks must be excluded from:

- Fill Gap
- Fill Missing Time
- Regenerate From Curve
- future AutoMix selection
- live playback queues

Unless a future explicit setting says:

```text
Allow unverified tracks
```

Do not add that setting in v1 unless already easy.

## Library / File Manager UI

Add a filter:

```text
Playback Issues
```

or:

```text
Unplayable
```

In track rows, show badge:

```text
CODEC
UNPLAYABLE
NO SOURCE
MISSING
```

## Actions

For unplayable tracks, add row/context actions:

```text
Quarantine Track
Remove From Playlist
Remove From All Playlists
Clear Playback Issue
```

Minimum v1:

- Remove From Playlist
- Clear Playback Issue

`Clear Playback Issue` is needed if the user fixes/converts the file later.

## Quarantine

If quarantine is easy:

```text
Quarantine = mark unplayable and exclude from generation/fill.
```

If not easy, unplayable status itself can act as quarantine.

---

# 8. Export Health Updates

Export health should detect and report:

```text
UNPLAYABLE
CODEC
NO_PATH
MISSING_FILE
UNSUPPORTED_EXT
REPEAT
UNDER_TARGET
EMPTY_SLOT
```

## Required Behavior

M3U export should warn if active playlist contains unplayable tracks.

Recommended behavior:

- skip unplayable tracks by default
- report skipped count
- explain why

Example:

```text
UNPLAYABLE — Slot #7 was skipped because browser playback failed with CODEC.
```

If the current export code cannot know browser support ahead of time, use stored playback issue state.

## Empty Slot Warning

If active playlist contains empty slots:

```text
EMPTY_SLOT — Slot #12 has no assigned track.
```

## Under Target Warning

If exported duration is below playlist target:

```text
UNDER_TARGET — Exported playlist is 41 min below target.
```

---

# 9. Empty Slot + Export Behavior

Empty slots should not produce broken M3U lines.

Rules:

- skip empty slots in M3U
- report them as `EMPTY_SLOT`
- include slot index in report
- do not crash export

---

# 10. Playlist Fill Candidate Filter

Create a shared candidate filter for fill/regenerate actions.

Suggested API:

```ts
export function getEligiblePlaylistCandidates(params: {
  playlist: PlaylistRecord;
  libraryTracks: Track[];
  tracksById: Map<string, Track>;
  excludedTrackIds: Set<string>;
  removedTrackIds: Set<string>;
  playbackIssues?: Record<string, TrackPlaybackIssue>;
}): {
  candidates: Track[];
  rejected: {
    trackId: string;
    reason: string;
  }[];
};
```

Candidate filter must reject:

- duplicate in target playlist
- excluded
- removed/rejected
- unplayable
- missing basic metadata
- invalid path if strict export-ready mode is active

Use this shared filter for:

- Fill Gap
- Fill Missing Time
- Regenerate From Curve

---

# 11. UI Labels

Use clear labels.

## Empty Slot

```text
Empty Slot
Fill Gap
Choose Track
Delete Gap
```

## Duplicate Prevention

```text
Duplicate skipped
Already in playlist
Same audio file already exists
```

## Playback Safety

```text
Playback Issues
Unplayable
CODEC
Clear Issue
Skip Unplayable
```

## Reports

```text
Added 4 tracks. Skipped 2 duplicates and 1 unplayable track.
```

```text
Could not fill gap. No eligible playable tracks match this slot.
```

---

# 12. Persistence

Persist:

- empty slot repairs
- duplicate-guarded additions
- playback issue states
- quarantine/unplayable states
- cleared playback issue states
- export health report if currently persisted

Reload test must confirm:

- unplayable status remains
- Playback Issues filter still shows affected tracks
- Fill Missing Time still excludes unplayable tracks after reload

---

# 13. Expected Files To Touch

Likely files:

```text
src/App.tsx
src/components/MainTrackWindow.tsx
src/components/FlowCurveCanvas.tsx
src/components/LeftDrawer.tsx
src/components/PlaybackTransport.tsx
src/exportHealth.ts
src/exportPlaylist.ts
src/manualPlaylistOrder.ts
src/playbackTypes.ts
src/playbackQueue.ts
src/styles.css
```

Possible new files:

```text
src/playlistIntegrity.ts
src/playbackSafety.ts
src/fillGap.ts
src/playlistCandidateFilter.ts
```

Use actual project paths.

---

# 14. Acceptance Criteria

## Empty Slot Repair

- User can remove a song and leave a gap.
- Empty slot row shows as `Empty Slot`.
- User can fill that exact gap.
- User can delete that gap and compact playlist.
- `Fill Missing Time` fills empty slots before adding new slots.
- Empty slots are reported in export health.

## Duplicate Prevention

- Dragging same track into playlist twice is blocked.
- Fill Missing Time does not add duplicate track IDs.
- Fill Missing Time does not add duplicate file paths.
- Regenerate From Curve does not create repeated file paths.
- Manual insert/replace blocks duplicates unless replacing the same slot.
- Remove Repeated Copies still works as a cleanup tool.

## Playback Safety

- CODEC error marks track unplayable.
- Unplayable track is persisted.
- Auto playback skips unplayable track.
- Fill Missing Time excludes unplayable tracks.
- Regenerate From Curve excludes unplayable tracks.
- Playback Issues filter shows unplayable tracks.
- User can clear playback issue after fixing file.
- Export health reports unplayable tracks.

## Curve Stability

- Curve nodes remain draggable after repeated edits.
- Drag state does not get stuck after mouse leaves canvas.
- Drag state clears on pointerup/pointercancel.
- Curve remains editable after Fill Missing Time and Regenerate From Curve.

## No Regressions

- Create playlist still works.
- Import/browse Library still works.
- Drag tracks into playlist still works.
- Fill Missing Time still works.
- Regenerate From Curve still works.
- Export M3U still works.
- Reload persistence still works.

---

# 15. Manual Test Plan

## Test 1 — Fill Empty Gap

1. Select a playlist.
2. Right-click a playlist row.
3. Choose `Remove and leave gap`.
4. Confirm empty slot appears.
5. Click `Fill Gap`.
6. Confirm a replacement track appears in that slot.
7. Reload.
8. Confirm replacement persists.

Expected:

```text
Empty slot is repairable.
```

## Test 2 — Delete Empty Gap

1. Remove a track and leave gap.
2. Choose `Delete Gap`.
3. Confirm playlist compacts.
4. Confirm slot numbers reindex.
5. Export M3U.

Expected:

```text
Gap is removed cleanly and export does not include empty slot.
```

## Test 3 — Fill Missing Time Fills Gaps First

1. Create two empty gaps.
2. Set playlist below target duration.
3. Click `Fill Missing Time`.
4. Confirm empty gaps are filled before new slots are appended.

Expected:

```text
Existing holes are repaired before playlist expands.
```

## Test 4 — Duplicate Prevention

1. Drag a Library track into active playlist.
2. Drag the same track again.
3. Confirm duplicate is skipped.
4. Try Fill Missing Time.
5. Confirm it does not re-add already used tracks.
6. Run Remove Repeated Copies.
7. Confirm no repeated copies found.

Expected:

```text
Duplicates are blocked before cleanup is needed.
```

## Test 5 — CODEC Playback Error

1. Play a known unplayable track.
2. Confirm CODEC error appears.
3. Confirm track is marked unplayable.
4. Turn Auto ON.
5. Try playback through sequence.
6. Confirm app skips unplayable track.

Expected:

```text
Unplayable track is quarantined and skipped.
```

## Test 6 — Unplayable Excluded From Fill

1. Mark a track unplayable.
2. Remove it from playlist.
3. Run Fill Missing Time.
4. Confirm the unplayable track is not re-added.

Expected:

```text
Playback safety affects future selection.
```

## Test 7 — Export Health

1. Keep an empty slot.
2. Keep an unplayable track in playlist.
3. Export M3U.
4. Confirm report includes `EMPTY_SLOT` and `UNPLAYABLE`.
5. Confirm export does not crash.

Expected:

```text
Export explains unsafe playlist state.
```

## Test 8 — Curve Drag Hardening

1. Drag curve node repeatedly.
2. Release pointer outside canvas.
3. Return and drag again.
4. Use Fill Missing Time.
5. Drag curve node again.
6. Use Regenerate From Curve.
7. Drag curve node again.

Expected:

```text
Curve nodes do not get stuck.
```

---

# 16. Implementation Order

Recommended order:

```text
1. Central playlist integrity helpers
2. Duplicate guard at all entry points
3. Empty slot repair UI/actions
4. Playback safety status persistence
5. Auto-skip unplayable tracks
6. Export health warnings
7. FlowCurveCanvas pointer hardening
8. Manual tests
```

---

# 17. Claude / Codex Notes

Keep this patch surgical.

Do not rebuild playlist architecture. The multi-playlist workspace is already working.

Avoid mixing this patch with playlist identity/artwork unless required by file structure.

Main risk areas:

- Drag/drop regression
- Playback auto-advance loop
- Persistence migration
- Overblocking legitimate remixes with duplicate fallback
- Curve canvas pointer event regressions

If a feature is risky, implement the safer minimum:

```text
single-slot Fill Gap
trackId/filePath duplicate guard
stored unplayable status
skip unplayable during playback
pointer drag cleanup
```

---

# 18. Product Principle

The playlist system is becoming a broadcast authoring tool.

Broadcast systems must fail safely.

```text
Bad files should be quarantined.
Duplicates should be blocked before export.
Empty slots should be repairable.
Curve controls should not get stuck.
```
