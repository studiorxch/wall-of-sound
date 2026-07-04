# 0620E_PLAY_NowNextQueuePanelPatch_v1.0.0_PATCH

## Patch Name

**PLAY Now / Next Queue Panel Patch**

## Version

`v1.0.0`

## Date

2026-06-20

## Status

Draft for implementation

---

# 1. Purpose

0620C introduced **Broadcast HUD Mode**.

0620D introduced **Broadcast Card / Bumper Preview**.

0620E adds the next missing broadcast layer: a compact **Now / Next / Up Next Queue Panel**.

The purpose is to make PLAY feel less like a playlist editor with playback and more like a real broadcast channel control surface.

Core principle:

```text
Broadcast HUD tells us what is playing.
Broadcast Card tells us what program we are entering.
Now / Next tells us what is coming.
```

---

# 2. Product Context

Current PLAY chain:

```text
0619A — multi-playlist workspace
0619B — drag-to-playlist
0619C — fill / regenerate controls
0620A — integrity + playback safety
0620B — playlist identity
0620C — Broadcast HUD mode
0620D — Broadcast Card / Bumper Preview
```

PLAY can now:

```text
build playlist
manage playlist identity
play from browser
present as Broadcast HUD
present playlist identity as Broadcast Card / Bumper
```

0620E adds:

```text
present the active playback queue as Now / Next / Up Next
```

---

# 3. Patch Goal

Create a compact queue panel that shows:

```text
Now Playing
Next Track
Up Next 3–5 tracks
```

The queue panel should work in:

- Broadcast HUD mode
- possibly Flow-Curve Editor mode as a collapsible panel
- future scheduler / channel mode

The panel should be readable, compact, OBS-safe, and aware of unplayable/skipped tracks.

---

# 4. Scope

## Included

### A. Queue Panel Component

Create a reusable component:

```text
NowNextQueuePanel
```

It should display:

- Now Playing
- Next
- Up Next list
- slot index
- track title
- artist
- duration
- playback/playability state

### B. Broadcast HUD Integration

Add the panel to Broadcast HUD mode.

Recommended placement:

- right-side HUD panel
- bottom-right overlay
- collapsible panel above transport
- compact side rail

### C. Queue Calculation

Derive queue from the active playlist slots and playback state.

### D. Playback Safety Awareness

The panel must handle:

- unplayable tracks
- empty slots
- skipped tracks
- end-of-playlist
- autoplay off/on state

### E. Compact Layout

Keep the panel small and HUD-safe.

It should not recreate the full playlist table.

---

# 5. Non-Goals

Do not implement in this patch:

- full scheduler
- calendar/daypart timeline
- waveform mixer
- transition editor
- beatgrid/phrase alignment
- drag/drop queue editing in HUD mode
- audio-reactive animation
- OBS API integration
- full playlist table redesign
- per-track artwork
- crossfade engine
- timeline stream mixer

This patch is about **queue visibility**, not queue editing.

---

# 6. Queue Definition

The queue panel should show a short contextual slice of the active playlist.

Recommended structure:

```text
NOW
#08  Track Title — Artist
     03:14 / 05:22

NEXT
#09  Next Track — Artist
     04:11

UP NEXT
#10  Track A — Artist
#11  Track B — Artist
#12  Track C — Artist
```

If no current playback exists:

```text
NOW
Not playing

NEXT
#01 First playable track
```

If playlist is complete:

```text
NEXT
End of playlist
```

---

# 7. Data Requirements

The component needs:

```ts
type QueuePanelTrack = {
  slotIndex: number;
  trackId?: string;
  title: string;
  artist?: string;
  durationSeconds?: number;
  isCurrent?: boolean;
  isNext?: boolean;
  isPlayable?: boolean;
  playbackIssueCode?: string;
  isEmptySlot?: boolean;
  isSkipped?: boolean;
};
```

Suggested computed model:

```ts
type NowNextQueueState = {
  now?: QueuePanelTrack;
  next?: QueuePanelTrack;
  upNext: QueuePanelTrack[];
  autoplayEnabled: boolean;
  currentSlotIndex?: number;
  totalSlots: number;
  playableRemainingCount: number;
  skippedCount: number;
};
```

This can be computed from:

- active playlist slots
- current playback track/slot
- playback issue map
- empty-slot state
- autoplay state

---

# 8. Queue Calculation Rules

## Current Track

The current track should be resolved from existing playback state.

Use best available source:

```text
currently playing trackId
current slot index
selected/active slot
transport state
```

If playback has no slot index yet, infer from first matching slot by trackId.

## Next Track

Next track should be the next playable slot after current slot.

Skip:

- empty slots
- unplayable tracks
- missing tracks
- tracks marked skipped if relevant

## Up Next

Show the next 3–5 playable slots after `next`.

Default:

```text
3 items
```

Optional prop:

```ts
maxItems?: number;
```

## Autoplay Off

If autoplay is off, still show queue, but indicate:

```text
Autoplay Off
```

or:

```text
Next if continued
```

## End of Playlist

If no playable tracks remain:

```text
End of playlist
```

---

# 9. Playback Safety Integration

The queue panel should respect 0620A playback safety.

If a track is unplayable:

- do not select it as `next`
- do not include it in `upNext` by default
- optionally show skipped count

Example:

```text
2 skipped · 1 unplayable
```

If a current track fails and auto-skip moves forward, the queue panel should update.

---

# 10. Empty Slot Integration

Empty slots should not appear as playable next items.

If relevant, show summary only:

```text
1 empty slot skipped
```

Do not let empty slots make the panel look broken.

---

# 11. UI / Visual Requirements

## Compact HUD Panel

The panel should be visually compact.

Recommended design:

```text
┌────────────────────────────┐
│ NOW                         │
│ #08 Midnight Signal         │
│     Artist Name · 5:22      │
│                             │
│ NEXT                        │
│ #09 Transit Ghosts          │
│     Artist Name · 4:11      │
│                             │
│ UP NEXT                     │
│ #10 Neon Harbor · 3:58      │
│ #11 Lower Grid · 6:14       │
│ #12 Dawn Loop · 4:44        │
└────────────────────────────┘
```

## Styling

Use existing playlist accent color for:

- current track marker
- section dividers
- active border
- progress accent

Do not make the panel louder than the flow curve or now-playing strip.

## Typography

The panel should prioritize:

```text
track title
slot number
artist
duration
status
```

Long names should truncate gracefully.

---

# 12. Broadcast HUD Placement

Recommended placement:

```text
right side rail
```

or:

```text
bottom-right above transport
```

The panel should not obscure:

- current playing node
- transport controls
- playlist identity strip
- main flow curve

If screen width is small:

- collapse to `Now / Next` only
- hide Up Next items
- allow toggle

---

# 13. Editor Mode Placement

Optional:

Add a compact queue preview in Flow-Curve Editor mode if low-risk.

If added, it should be collapsible and not compete with the playlist table.

Do not block Broadcast HUD integration on editor placement.

---

# 14. Interaction

For v1, queue panel is read-only.

Allowed interactions:

- click current/next item to focus slot if easy
- toggle show/hide panel
- maybe jump to next track only if using existing transport behavior

Not allowed in v1:

- drag queue order
- reorder playlist
- delete tracks
- replace tracks
- regenerate
- edit curve

Broadcast HUD must remain safe.

---

# 15. HUD Preferences

Add optional setting:

```ts
type BroadcastHudPrefs = {
  showQueuePanel: boolean;
  queuePanelSize?: "compact" | "standard";
  queuePanelMaxItems?: number;
};
```

If existing Broadcast HUD prefs exist, extend them.

If not, local component state is acceptable for v1.

Default:

```text
showQueuePanel = true
queuePanelMaxItems = 3
```

---

# 16. Component Plan

Recommended new component:

```text
src/ui/NowNextQueuePanel.tsx
```

Recommended helper:

```text
src/queuePanel.ts
```

or:

```text
src/playbackQueue.ts
```

Possible APIs:

```ts
export function buildNowNextQueueState(params: {
  playlist: PlaylistRecord;
  tracksById: Map<string, Track>;
  currentTrackId?: string;
  currentSlotIndex?: number;
  playbackIssues?: Record<string, TrackPlaybackIssue>;
  autoplayEnabled: boolean;
  maxUpNextItems?: number;
}): NowNextQueueState;
```

---

# 17. Edge Cases

Handle:

- no active playlist
- empty playlist
- no current playback
- current track not found in playlist
- duplicate track IDs in old playlists
- current slot is empty
- current track becomes unplayable
- autoplay off
- playlist ends
- all remaining tracks unplayable
- all remaining slots empty
- missing metadata
- very long titles/artists
- unknown duration

---

# 18. Display States

## No Playlist

```text
No playlist selected
```

## Empty Playlist

```text
No tracks in playlist
```

## Not Playing

```text
Now: Not playing
Next: First playable track
```

## Ended

```text
End of playlist
```

## Unsafe Remaining Queue

```text
No playable tracks remaining
```

## Skipped Summary

```text
Skipped: 2 unplayable · 1 empty slot
```

---

# 19. Acceptance Criteria

## Queue Computation

- Current track resolves correctly during playback.
- Next track resolves as next playable slot.
- Up Next shows 3 playable tracks by default.
- Unplayable tracks are skipped.
- Empty slots are skipped.
- End-of-playlist state appears correctly.
- No-playlist and empty-playlist states are handled.

## Broadcast HUD

- Queue panel appears in Broadcast HUD.
- Panel is compact and readable.
- Panel does not obscure core HUD controls.
- Panel updates when playback advances.
- Panel updates after auto-skip.
- Panel uses playlist accent color.

## Playback Safety

- Unplayable tracks are not shown as playable next items.
- Skipped/unplayable count is visible if useful.
- Panel handles CODEC-failed tracks cleanly.

## Interaction Safety

- Panel is read-only in Broadcast HUD.
- Panel does not mutate playlist.
- Panel does not trigger regeneration.
- Panel does not allow accidental destructive actions.

## No Regressions

- Broadcast HUD still works.
- Broadcast Card Preview still works.
- Flow-Curve Editor still works.
- Playback still works.
- Fill/regenerate still work.
- Playlist identity still works.

---

# 20. Manual Test Plan

## Test 1 — Basic Queue

1. Load a playlist with at least 8 playable tracks.
2. Start playback.
3. Enter Broadcast HUD.
4. Confirm Now, Next, and Up Next appear.

Expected:

```text
Queue panel shows current and upcoming tracks.
```

## Test 2 — Playback Advance

1. Start playback.
2. Click Next.
3. Confirm Now changes.
4. Confirm Next and Up Next shift forward.

Expected:

```text
Queue updates correctly as playback advances.
```

## Test 3 — Autoplay Off

1. Turn autoplay off.
2. Start playback.
3. Enter Broadcast HUD.

Expected:

```text
Queue remains visible and indicates autoplay state if implemented.
```

## Test 4 — Unplayable Skip

1. Mark an upcoming track unplayable.
2. Start playback before it.
3. Confirm queue skips it.
4. Confirm skipped summary appears if implemented.

Expected:

```text
Unplayable tracks do not appear as playable next items.
```

## Test 5 — Empty Slot Skip

1. Add or preserve an empty slot in upcoming positions.
2. Enter Broadcast HUD.
3. Confirm queue skips empty slot.

Expected:

```text
Empty slot does not break queue display.
```

## Test 6 — End of Playlist

1. Jump near final playable track.
2. Play through or click next.
3. Confirm end state.

Expected:

```text
Panel shows End of playlist or No playable tracks remaining.
```

## Test 7 — OBS View

1. Fullscreen Broadcast HUD.
2. Capture in OBS/browser capture.
3. Confirm queue panel is readable and does not cause scrollbars.

Expected:

```text
Queue panel is capture-safe.
```

---

# 21. Implementation Order

Recommended:

```text
1. Define queue panel types
2. Build queue computation helper
3. Build NowNextQueuePanel component
4. Integrate into Broadcast HUD
5. Add responsive/collapsed styling
6. Wire playback state updates
7. Add skipped/unplayable summary
8. Test edge cases
9. Test OBS/fullscreen capture
```

---

# 22. Claude / Codex Notes

Keep this patch read-only.

Do not use this patch to introduce queue editing.

Do not build scheduler logic.

Do not build waveform or transition features.

The important result is:

```text
Broadcast HUD gains program awareness.
```

The viewer/operator should understand:

```text
what is playing
what comes next
what is coming after that
whether the remaining queue is safe/playable
```

---

# 23. Product Principle

```text
PLAYLIST turns playlists into programmable broadcast channels.
```

A broadcast channel needs continuity.

0620E adds the first continuity display:

```text
Now
Next
Up Next
```

---

# 24. Future Follow-Up

Natural next patches after this:

```text
0620F_PLAY_AudioReactiveHUDSignalsPatch_v1.0.0_PATCH
0620G_PLAY_PlaylistScheduleBlockPatch_v1.0.0_PATCH
0620H_PLAY_BroadcastScenePackagePatch_v1.0.0_PATCH
0620I_PLAY_TimelineStreamMixerFoundationPatch_v1.0.0_PATCH
```
