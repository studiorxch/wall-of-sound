# 0622A_PLAY_DecouplePlaybackFromEditorPlaylistPatch_v1.0.0_PATCH

## Project

PLAY — Playlist / Scheduler / Broadcast HUD

## Document Type

Patch Spec

## Version

v1.0.0

## Status

Ready for implementation

## Purpose

Decouple live playback from the playlist currently selected in the editor.

The operator must be able to play one playlist while browsing, editing, filling, repairing, or scheduling another playlist. Selecting a playlist in the workspace must not stop or reset the currently playing audio.

## Product Rule

```txt
Editor selection must not control live playback.
Scheduler timing must not control live playback until explicitly armed.
Playback must have its own stable state.
```

## Current Issue

When music is playing, switching to another playlist in the editor stops playback. This means the player is still coupled to the active editor playlist.

This blocks normal operation because PLAY is becoming a programmable channel system. An operator must be able to:

- keep a playlist/program playing
- inspect another playlist
- build another playlist
- edit schedule blocks
- prepare the next program
- return to Broadcast HUD without interrupting audio

## Required State Separation

Replace the implicit single-active-playlist model with explicit roles:

```ts
type PlaylistSelectionState = {
  editingPlaylistId: string;
  playingPlaylistId?: string;
  scheduledPlaylistId?: string;
};
```

Meaning:

| Field | Meaning |
|---|---|
| `editingPlaylistId` | Playlist currently selected in the editor/workspace |
| `playingPlaylistId` | Playlist currently loaded/playing in the player |
| `scheduledPlaylistId` | Playlist currently active according to scheduler timing |

If the existing project model still uses `activePlaylistId`, keep it as the editor selection alias for compatibility, but do not use it as playback authority.

## Scope

### Included

- Add explicit playback playlist identity.
- Ensure changing editor playlist does not stop playback.
- Ensure bottom HUD row displays the playing playlist, not merely the selected editor playlist.
- Ensure Broadcast HUD uses playing context where playback state is involved.
- Ensure editor still shows selected playlist for editing.
- Ensure persistence remains stable.
- Add defensive fallbacks if `playingPlaylistId` points to a deleted playlist.
- Keep scheduler handoff manual / non-automatic.

### Excluded

- Do not add scheduler autoplay.
- Do not automatically switch playback when schedule changes.
- Do not add recurrence.
- Do not change Smart Grid behavior.
- Do not change source-group isolation.
- Do not change Flow Curve assignment logic.
- Do not redesign the player UI.

## Expected Behavior

### Case 1 — Manual Playback Continues

```txt
1. Select Playlist A.
2. Start playing a track from Playlist A.
3. Switch editor selection to Playlist B.
4. Playback continues from Playlist A.
5. Bottom HUD still reports Playlist A as playing context.
6. Editor displays Playlist B for work.
```

### Case 2 — Explicit Play Changes Playing Playlist

```txt
1. Playlist A is playing.
2. Operator selects Playlist B.
3. Operator presses play on a track in Playlist B.
4. playingPlaylistId becomes Playlist B.
5. Playback switches only because the operator explicitly started Playlist B.
```

### Case 3 — Deleted Playing Playlist

```txt
1. Playlist A is playing or loaded.
2. Playlist A is deleted.
3. App must not crash.
4. playingPlaylistId is cleared or safely repaired.
5. Playback stops only because the playing source no longer exists.
```

## Implementation Requirements

### 1. Identify Coupling Points

Search for any effect or handler where editor selection changes affect playback:

```bash
grep -R "activePlaylistId\|setActivePlaylist\|currentPlaylist\|playback" src
```

Review likely areas:

- `App.tsx`
- playlist selection handlers
- player controls
- playback effects
- bottom HUD row props
- Broadcast HUD props
- Scheduler view props

### 2. Add Stable Playback Context

Create or preserve a clear playback context object:

```ts
type PlaybackContext = {
  playingPlaylistId?: string;
  playingTrackId?: string;
  playingSlotIndex?: number;
};
```

Do not derive this from editor selection on every render.

### 3. Update Playlist Selection

Editor playlist selection should only update editor state:

```ts
function selectEditingPlaylist(playlistId: string): void {
  setEditingPlaylistId(playlistId);
}
```

It must not call:

- pause
- stop
- reset player
- clear current track
- replace playback queue

### 4. Update Explicit Play Handler

Only explicit playback actions should update playing context:

```ts
function playTrackFromPlaylist(playlistId: string, trackId: string): void {
  setPlayingPlaylistId(playlistId);
  setPlayingTrackId(trackId);
  // existing play logic continues here
}
```

### 5. Update HUD / Bottom Row

Broadcast HUD and bottom row must use playback context first:

```txt
playing playlist > scheduler active playlist > editor playlist fallback
```

But do not let fallback mutate playback state.

### 6. Storage Repair

If playback context is persisted, repair invalid IDs on load:

- if `playingPlaylistId` does not exist, clear it
- if `playingTrackId` does not exist inside the playing playlist, clear it
- do not crash

If playback context is not persisted yet, keep it runtime-only for this patch.

## Acceptance Criteria

- Music continues while selecting another playlist in the editor.
- Editor can work on Playlist B while Playlist A is playing.
- Bottom HUD row remains bound to the playing playlist.
- Explicit play from another playlist updates playing context correctly.
- Scheduler `NOW` state does not hijack playback.
- Persistence from 0621C remains stable.
- Source-group isolation from 0621E remains intact.
- Scheduler/Smart Grid behavior from 0621G–0621M remains intact.
- TypeScript passes.
- No console errors during normal use.

## Regression Tests

```txt
1. Create Playlist A and Playlist B.
2. Add playable tracks to Playlist A.
3. Start playback from Playlist A.
4. Select Playlist B in editor.
5. Confirm audio keeps playing.
6. Confirm bottom HUD still displays Playlist A context.
7. Add/edit/fill Playlist B.
8. Confirm Playlist A audio still plays.
9. Press play on Playlist B track.
10. Confirm playback switches only after explicit play.
11. Reload browser.
12. Confirm app does not crash and persisted playlists survive.
```

## Do Not Reopen

- Do not restore playback coupling to `activePlaylistId`.
- Do not add scheduler autoplay in this patch.
- Do not make Broadcast HUD responsible for playback routing.

## Implementation Guide

- **Where:** `src/App.tsx`, playlist selection handlers, playback handlers, bottom playback row props, Broadcast HUD playback props, and project storage repair if playback context is persisted.
- **What:** Split editor playlist selection from playback playlist context; make explicit play actions the only path that changes `playingPlaylistId`; update HUD/bottom row to read the playing context.
- **Expect:** You can play Playlist A, switch to and edit Playlist B, and Playlist A keeps playing uninterrupted.
