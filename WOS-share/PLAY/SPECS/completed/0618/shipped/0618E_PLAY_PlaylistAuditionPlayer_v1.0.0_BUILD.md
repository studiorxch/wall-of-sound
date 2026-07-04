# 0618E_PLAY_PlaylistAuditionPlayer_v1.0.0_BUILD

## Project

**Project Title:** `0618E_PLAY_PlaylistAuditionPlayer_v1.0.0_BUILD`  
**Parent System:** PLAY — Flow Curve Playlist Builder  
**Build Type:** Feature Build  
**Status:** Ready for Claude / Codex implementation  

---

## Purpose

Build a **Playlist Audition Player** inside the current Flow Curve Playlist Builder so the user can listen through the generated playlist in chronological order, stop when something feels wrong, adjust the playlist, and resume playback from any slot without exporting to Mixxx.

This is **not** a transition editor, AutoDJ mixer, beat-sync system, waveform labeler, or broadcast runtime.

The goal is simple:

```text
Import analyzed CSV
Generate Flow Curve playlist
Play from slot 6
Listen through 7, 8, 9...
Stop
Adjust / swap / lock tracks
Play from slot 9
Stop
Play from slot 13
```

The user is getting to know the music, testing strategic order, and making playlist decisions with track intelligence visible.

---

## Environmental Assumptions

- Existing app: local Vite + React + TypeScript Flow Curve Builder.
- Existing CSV contains `filePath` from the Track Pool Analyzer.
- Existing playlist table already has slot order, track metadata, warnings, locks, and curve nodes.
- Browser playback of absolute local paths may not work directly.
- A small local media server may be required for reliable playback.
- Keep implementation local-only for now.

---

## Non-Goals

Do **not** implement these in this build:

- Crossfades.
- Beat sync.
- BPM warping.
- Waveform rendering.
- Cue-point editing.
- Intro/outro/tail labeling.
- Transition timing.
- AutoDJ runtime.
- OBS integration.
- WOS audio reaction.
- Mixxx API integration.

This build is only for **playlist audition playback**.

---

## Core Workflow

The user should be able to:

1. Import a real analyzed CSV.
2. Generate or adjust a Flow Curve playlist.
3. Click **Play** on any playlist slot.
4. Hear that track.
5. Continue automatically to the next slot when the current track ends.
6. Stop playback at any time.
7. Move, swap, remove, exclude, or lock tracks.
8. Resume playback from any chosen slot.
9. Use visible metadata while listening.

---

## Product Rule

The player exists to support playlist judgment, not performance.

The user is not mixing yet. The user is auditioning order.

```text
Flow Curve = suggested strategic order
Playlist Audition = human listening check
Transition Lab = later surgical mixing layer
AutoDJ = later runtime execution layer
```

---

## Feature Scope

### Include

| Feature | Required |
|---|---:|
| Play selected playlist slot | Yes |
| Play from row button | Yes |
| Pause / resume | Yes |
| Stop | Yes |
| Next / previous | Yes |
| Autoplay next slot | Yes |
| Highlight now-playing row | Yes |
| Highlight now-playing timeline node | Yes |
| Play from typed slot number | Yes |
| Stop and preserve current playlist state | Yes |
| Resume from any slot | Yes |
| Manual row move up/down | Yes |
| Recalculate warnings after manual reorder | Yes |
| Node index labels | Yes |
| Node hover highlights matching row | Yes |
| Row hover highlights matching node | Yes |

### Exclude

| Feature | Reason |
|---|---|
| Crossfade | Transition phase |
| Beat sync | Transition / AutoDJ phase |
| Waveform | Transition Lab phase |
| Cue labels | Transition Lab phase |
| Mixer controls | AutoDJ phase |
| OBS output | Broadcast phase |

---

## Required User Interface

### 1. Compact Audition Transport

Add a compact transport bar, preferably docked above the main track table or inside the top workspace area.

Suggested layout:

```text
Now: #09  SR-20260606-27A (Geography)
[Prev] [Play/Pause] [Stop] [Next]   Play from slot: [ 9 ]   Autoplay [on/off]
```

Required controls:

- Previous track.
- Play / pause toggle.
- Stop.
- Next track.
- Play from slot input.
- Autoplay next toggle.
- Current slot display.
- Current title display.

### 2. Row Playback Actions

Each playlist row should include:

```text
▶ Play from here
Lock / Unlock
Move Up
Move Down
```

If space is tight, use compact buttons:

```text
▶  ↑  ↓  Lock
```

### 3. Now-Playing Row Highlight

When a track is playing:

- Highlight its row.
- Show a clear now-playing marker.
- Keep the row visible if possible.

Suggested visual:

```text
▶ #09  SR-20260606-27A (Geography)
```

### 4. Timeline Node Index Labels

Track nodes on the Flow Curve timeline should show small slot numbers.

Example:

```text
•11  •12  •13
```

Do not require clicking nodes, because clicking the curve creates a new curve joint.

### 5. Node / Row Hover Linking

Since node click conflicts with curve editing:

- Hovering a node highlights the matching row.
- Hovering a row highlights the matching node.
- Hovering a node shows a compact tooltip.

Tooltip:

```text
#12 · 130.81 BPM · 11A · E .51
```

Do not show long titles on the curve by default; titles may fall offscreen.

### 6. Manual Row Reorder

The user needs to handle tracks like playing cards.

Required:

- Move selected row up.
- Move selected row down.
- Recalculate warnings after movement.
- Preserve locks.
- Preserve current playback state unless the currently playing row is removed.

Manual movement should be treated as a human playlist decision.

---

## Playback Behavior

### Play From Slot

When user clicks play on slot `N`:

```text
currentSlotIndex = N
load assigned track file
play audio
highlight slot N
```

### Autoplay Next

If autoplay is enabled:

```text
on track ended:
  if next assigned slot exists:
    play next slot
  else:
    stop
```

### Stop

Stop should:

- Pause audio.
- Reset audio time to `0`.
- Clear active playback state or keep last selected slot as a resume target.
- Leave playlist editable.

### Pause

Pause should:

- Pause audio at current time.
- Preserve current slot and current time.
- Resume from same position when play is pressed.

### Previous / Next

Previous:

- Move to previous assigned slot.
- Start playback from beginning of that track.

Next:

- Move to next assigned slot.
- Start playback from beginning of that track.

---

## Local Media Playback

The CSV contains absolute `filePath` values. Browser audio may not be able to play these paths directly.

Implement one of the following, preferring Option A.

### Option A — Local Media Server

Add a small local server endpoint that streams files by path.

Example endpoint:

```text
GET /media?path=/Users/studio/Music/Folder/Track.wav
```

The React app should convert a track `filePath` into a playable URL.

Example:

```ts
const audioUrl = `/media?path=${encodeURIComponent(track.filePath)}`;
```

#### Safety Requirements

- Validate that `path` exists.
- Validate that path extension is a supported audio format.
- Return readable error for missing file.
- Do not crash the app if a file cannot play.

### Option B — Browser File Access

Only use this if a local media server is not feasible.

- User grants access to a folder.
- App maps CSV `filePath` to selected file handles.
- More complex; not preferred for this build.

### Option C — Public Folder

Acceptable only for quick testing.

- Copy test audio files into app-accessible public folder.
- Not acceptable as the long-term library workflow.

---

## Suggested File Additions

### UI

```text
src/ui/PlaylistAuditionPlayer.tsx
src/ui/PlaybackControls.tsx
```

### Logic

```text
src/logic/playbackQueue.ts
src/logic/manualPlaylistOrder.ts
```

### Server / Media

If using Node/Express or Vite middleware:

```text
server/mediaServer.ts
```

or:

```text
tools/local-media-server/mediaServer.ts
```

Do not turn the app into a large backend. Keep this minimal.

---

## Data Types

Add playback state types.

```ts
export type PlaybackStatus = "idle" | "playing" | "paused" | "error";

export type PlaylistPlaybackState = {
  status: PlaybackStatus;
  currentSlotIndex: number | null;
  currentTrackId: string | null;
  currentTimeSeconds: number;
  durationSeconds: number;
  autoplayNext: boolean;
  errorMessage?: string;
};
```

Add UI selection state if not already present.

```ts
export type PlaylistSelectionState = {
  hoveredSlotIndex: number | null;
  selectedSlotIndex: number | null;
  nowPlayingSlotIndex: number | null;
};
```

---

## Playback Queue Logic

Create helpers:

```ts
export function getPlayableSlots(slots: TrackSlot[]): TrackSlot[];

export function getNextPlayableSlot(params: {
  slots: TrackSlot[];
  currentSlotIndex: number;
}): TrackSlot | null;

export function getPreviousPlayableSlot(params: {
  slots: TrackSlot[];
  currentSlotIndex: number;
}): TrackSlot | null;
```

Rules:

- Skip empty slots.
- Skip slots whose assigned track has no `filePath`.
- Report missing filePath as a playback warning.
- Do not modify playlist order during playback unless user explicitly edits it.

---

## Manual Playlist Reorder Logic

Create helpers:

```ts
export function moveSlotUp(params: {
  slots: TrackSlot[];
  slotIndex: number;
  locks: TrackLock[];
}): TrackSlot[];

export function moveSlotDown(params: {
  slots: TrackSlot[];
  slotIndex: number;
  locks: TrackLock[];
}): TrackSlot[];
```

Rules:

- Do not move locked tracks unless the user unlocks them.
- If moving a row would cross a locked row, block the move or swap only with unlocked rows.
- After manual movement, recalculate warnings.
- Do not auto-regenerate the entire playlist in a way that undoes the manual move.

Important:

Manual reordering is a human decision. The system should respect it.

---

## Warning Behavior After Manual Reorder

After manual row movement:

- Recalculate adjacent BPM warnings.
- Recalculate key warnings.
- Recalculate energy drift warnings.
- Preserve orphan state unless the track pool changes.
- Preserve locks.

Do not silently regenerate all unlocked tracks unless the user explicitly requests auto-fit/regenerate.

---

## Adjacent BPM Drift Check

Add or prepare a transition-readiness warning pass without adding transition editing.

For each adjacent pair:

```text
slot[i] → slot[i + 1]
```

Calculate:

```text
bpmDiff = abs(nextBpm - currentBpm)
bpmPercent = bpmDiff / currentBpm
```

Suggested thresholds:

| Drift | Status |
|---:|---|
| `0–3%` | clean |
| `3–6%` | acceptable / no major warning |
| `6–8%` | yellow |
| `>8%` | red / review |
| `>10 BPM raw difference` | at least yellow unless approved |

This is not a surgical transition feature. It is only a listening-readiness signal.

---

## Node Label Requirements

Track nodes should display slot numbers without requiring clicks.

Requirements:

- Node label should be small.
- Node label should not clutter the curve.
- Hide labels if zoom level or density makes them unreadable, but show on hover.
- Hovering node highlights table row.
- Hovering row highlights node.
- Now-playing node should be visually distinct.

Suggested colors:

| State | Visual |
|---|---|
| Normal track node | white dot |
| Hovered node | brighter / enlarged |
| Now playing | green or active accent |
| Locked | blue / purple accent |
| Weak warning | yellow ring |
| Critical warning | red ring |

---

## Error Handling

Playback errors should not crash the app.

Handle:

- Missing `filePath`.
- File does not exist.
- Unsupported codec.
- Browser blocked autoplay.
- Media server unavailable.
- Track failed to load.

Show readable message:

```text
Could not play slot #12: file missing or unsupported.
```

Then allow user to skip, stop, or continue to next track.

---

## Acceptance Criteria

This build is complete when the user can:

1. Import `real-track-pool.csv` from the Track Pool Analyzer.
2. Generate a playlist.
3. Click play on slot 6.
4. Hear slot 6.
5. Automatically continue to slot 7, then 8, then 9.
6. Press Stop.
7. Move or swap a track.
8. Lock a track.
9. Press Play from slot 9.
10. Stop again.
11. Press Play from slot 13.
12. See now-playing row highlighted.
13. See now-playing curve node highlighted.
14. Hover a curve node and see/highlight the matching row.
15. Hover a row and see/highlight the matching node.
16. Use the app for playlist listening without exporting to Mixxx.

---

## Testing Checklist

### Playback

- Play from first slot.
- Play from middle slot.
- Play from final slot.
- Stop resets playback.
- Pause resumes correctly.
- Next skips to next playable slot.
- Previous skips to previous playable slot.
- Autoplay proceeds to next slot.
- Autoplay stops at end of playlist.

### Missing Files

- Track without `filePath` shows playback warning.
- Missing local file does not crash app.
- Unsupported file does not crash app.

### UI Sync

- Now-playing row highlights.
- Now-playing node highlights.
- Hover node highlights row.
- Hover row highlights node.
- Node labels show slot number or show it on hover.

### Playlist Editing During Playback

- Stop, reorder, and play again works.
- Moving a row recalculates warnings.
- Locked rows do not move accidentally.
- Playback state remains stable after manual edits.

---

## Future Notes

After this build is stable, later phases may add:

- transition preview
- intro/outro/tail markers
- waveform view
- beat-grid snap
- crossfade preview
- AutoDJ runtime
- OBS/WOS integration

Do not add those here.

---

## Implementation Guide

- **Where:** Add `PlaylistAuditionPlayer` inside the current Flow Curve Builder workspace; add a minimal local media server only if direct browser playback from `filePath` fails.
- **What:** Implement play-from-row, autoplay-through-playlist, stop/pause/next/previous, now-playing highlights, node index labels, hover node-to-row linking, and manual row move/swap controls.
- **Expect:** The user can audition the generated playlist directly inside the app, stop when something feels wrong, adjust the playlist, and resume from any slot without exporting to Mixxx.
