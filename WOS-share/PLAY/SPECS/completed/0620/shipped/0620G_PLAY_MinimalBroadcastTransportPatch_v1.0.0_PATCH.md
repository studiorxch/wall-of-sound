# 0620G_PLAY_MinimalBroadcastTransportPatch_v1.0.0_PATCH

## Patch Name

**PLAY Minimal Broadcast Transport Patch**

## Version

`v1.0.0`

## Date

2026-06-21

## Status

Draft for implementation

---

# 1. Purpose

0620F protected the visual separation between PLAY surfaces:

```text
Editor = graph-heavy
Broadcast HUD = graph-as-navigation
Broadcast Card = cinematic identity
```

0620G applies the same separation to the audio player.

The current Broadcast HUD transport still looks like an operator/player control bar:

```text
previous
play
stop
next
seek knob
Auto ON
```

For a stream-facing HUD, this is too much.

The Broadcast HUD does not need to expose every playback control. It needs to communicate playback state.

Core principle:

```text
Editor transport = full controls
Broadcast HUD transport = minimal playback signal
```

---

# 2. Product Context

Current PLAY build chain:

```text
0619A — multi-playlist workspace ✅
0619B — drag-to-playlist ✅
0619C — fill / regenerate controls ✅
0620A — integrity + playback safety ✅
0620B — playlist identity ✅
0620C — Broadcast HUD mode ✅
0620D — Broadcast Card / Bumper Preview ✅
0620E — Now / Next Queue Panel ✅
0620F — Broadcast HUD polish + card separation ✅
```

PLAY now has:

```text
Editor Surface
Broadcast HUD Surface
Broadcast Card Surface
```

0620G makes the Broadcast HUD transport behave like a visual playback indicator, not a full media-control deck.

---

# 3. Patch Goal

Create a minimal Broadcast HUD transport that shows:

```text
play / pause state
now-playing title
artist
slot number if available
thin moving progress line
elapsed / duration
```

and hides:

```text
previous
stop
next
Auto ON toggle
large seek knob
editing/operator-heavy controls
```

The full transport remains available in Flow-Curve Editor mode.

---

# 4. Scope

## Included

### A. Minimal Broadcast Transport Component

Create a dedicated HUD transport component:

```text
MinimalBroadcastTransport
```

or equivalent.

### B. Replace Broadcast HUD Transport Only

Use the minimal transport only in Broadcast HUD mode.

Keep the existing full `PlaybackTransport` in Flow-Curve Editor.

### C. Thin Progress Line

Replace the large seek bar / knob with a slim progress line.

### D. Passive Playback State

Show state, not controls.

Required display:

- play/pause icon or state indicator
- track title
- artist
- elapsed / duration
- progress line

### E. Hide Operator Controls

Hide in Broadcast HUD:

- previous button
- stop button
- next button
- Auto ON toggle
- large seek knob
- backend control buttons

### F. Preserve Playback

Do not break audio playback or editor controls.

---

# 5. Non-Goals

Do not implement in this patch:

- waveform display
- audio-reactive visualizer
- queue editing
- scheduler
- DJ transport controls
- crossfade controls
- OBS API integration
- keyboard shortcut redesign
- full transport redesign for Editor mode
- timeline stream mixer

This patch is visual/presentation cleanup for Broadcast HUD only.

---

# 6. Surface Separation Rule

Lock in this transport rule:

```text
Flow-Curve Editor
= full playback controls

Broadcast HUD
= minimal playback status signal

Broadcast Card
= no playback controls
```

Or:

```text
Editor = controls
Broadcast HUD = presentation
Broadcast Card = identity
```

---

# 7. Required Broadcast HUD Transport Layout

Preferred compact layout:

```text
#04  Tendency — Jan Jelinek                         0:29 / 7:21
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Alternate layout:

```text
▶  #04 Tendency — Jan Jelinek
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
0:29 / 7:21
```

Either is acceptable.

The key is:

```text
one state mark
one now-playing line
one moving progress line
one compact time readout
```

---

# 8. Visual Direction

The transport should feel like:

```text
broadcast status line
tape deck progress
signal indicator
minimal HUD meter
```

Not:

```text
desktop media player
DAW transport
debug panel
operator control cluster
```

Reference direction:

```text
minimal play glyph
thin progress line
large negative space
low visual noise
```

---

# 9. Component Requirements

## MinimalBroadcastTransport Props

Suggested props:

```ts
type MinimalBroadcastTransportProps = {
  isPlaying: boolean;
  slotIndex?: number;
  title?: string;
  artist?: string;
  elapsedSeconds?: number;
  durationSeconds?: number;
  progress?: number;
  accentColor?: string;
};
```

Optional:

```ts
onTogglePlay?: () => void;
```

If the play icon is clickable, it may toggle play/pause. If not, it can be purely presentational.

Do not include:

```ts
onPrevious
onNext
onStop
onToggleAutoplay
```

in the HUD version.

---

# 10. Play / Pause State

The HUD transport should show a simple state glyph:

```text
▶
Ⅱ
```

or existing icon style.

If playback is stopped/not playing:

```text
Not playing
```

Acceptable stopped layout:

```text
—  Not playing                                      0:00 / 0:00
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

If no track exists:

```text
No track loaded
```

---

# 11. Progress Line

The progress line should:

- be thin
- use accent color for played portion
- use muted line for remaining portion
- avoid large knob
- avoid large controls
- update during playback
- be stable in OBS/browser capture

Recommended CSS concept:

```css
.minimal-transport-progress {
  height: 2px;
  background: rgba(255,255,255,0.18);
}

.minimal-transport-progress-fill {
  width: var(--progress);
  height: 100%;
  background: var(--playlist-accent);
}
```

Optional:

- tiny pulse at current point
- no big handle/knob

---

# 12. Interaction Rule

Broadcast HUD transport should be mostly passive.

Allowed:

- click play/pause if simple
- keyboard shortcuts can still work globally if already implemented

Not allowed:

- visible prev/next/stop controls
- visible autoplay toggle
- visible seek handle
- destructive actions
- editing controls

The viewer should see the playback state, not the control system.

---

# 13. Queue Panel Relationship

0620E already added Now / Next / Up Next.

Therefore the transport does not need to show:

- next track
- up-next list
- queue details

Queue rail owns continuity.

Transport owns current playback progress.

Rule:

```text
Queue panel = what is coming
Transport = where we are now
```

---

# 14. Broadcast HUD Layout Impact

Replace the bottom transport strip in Broadcast HUD with minimal transport.

Requirements:

- reduce height if possible
- keep bottom boundary clean
- avoid duplicate now-playing info if queue panel already shows NOW
- maintain readability

If duplicate NOW information is too much, prefer:

```text
bottom transport = title/progress/time
queue rail = now/next/up-next details
```

---

# 15. Editor Mode Must Keep Full Transport

The full transport must remain in Flow-Curve Editor mode because the user needs:

```text
previous
play
stop
next
seek control
Auto ON toggle
debug/operator behavior
```

Do not simplify editor transport in this patch unless required for code separation.

---

# 16. Edge Cases

Handle:

- no active playlist
- empty playlist
- no current track
- not playing
- playing but duration unknown
- duration 0
- missing artist
- very long title
- very long artist
- stopped after error
- unplayable auto-skip
- end of playlist

Display gracefully.

Examples:

```text
No track loaded
Not playing
Unknown duration
End of playlist
```

---

# 17. Accessibility

If play/pause icon is clickable:

- use button semantics
- provide aria-label
- preserve focus state
- ensure keyboard activation works

If presentational:

- do not make it look like a clickable button
- use state label or icon with accessible text if necessary

---

# 18. Expected Files To Touch

Likely files:

```text
src/ui/BroadcastHudShell.tsx
src/ui/PlaybackTransport.tsx
src/styles.css
```

Possible new file:

```text
src/ui/MinimalBroadcastTransport.tsx
```

Possible helper:

```text
src/timeFormat.ts
```

Use actual project paths.

---

# 19. Acceptance Criteria

## Broadcast HUD

- Broadcast HUD uses minimal transport.
- Previous button is hidden.
- Stop button is hidden.
- Next button is hidden.
- Auto ON toggle is hidden.
- Large seek knob is hidden.
- Thin progress line is visible.
- Now-playing title/artist are visible.
- Elapsed/duration is visible.
- Layout feels cleaner and less operator-heavy.

## Editor Mode

- Flow-Curve Editor still uses full transport.
- Previous/play/stop/next still work in Editor.
- Auto ON still works in Editor.
- Seek behavior still works in Editor.

## Playback

- Audio playback still works.
- Progress updates during playback.
- Pause/play state updates.
- Auto-skip/unplayable behavior still works.
- End-of-playlist state renders safely.

## No Regressions

- Broadcast HUD still works.
- Queue panel still works.
- Broadcast Card Preview still works.
- Flow-Curve Editor still works.
- Playlist identity still works.
- Playback safety still works.

---

# 20. Manual Test Plan

## Test 1 — HUD Transport Simplification

1. Enter Broadcast HUD.
2. Confirm previous/stop/next/Auto ON are hidden.
3. Confirm minimal line appears.

Expected:

```text
HUD transport looks like a playback signal, not a media control deck.
```

## Test 2 — Playback Progress

1. Start playback.
2. Enter Broadcast HUD.
3. Watch progress line for 30 seconds.

Expected:

```text
Progress line moves smoothly and time updates.
```

## Test 3 — Pause State

1. Pause playback.
2. Confirm icon/state changes.
3. Resume playback if play icon is interactive.

Expected:

```text
Play/pause state is readable.
```

## Test 4 — Editor Transport Regression

1. Return to Flow-Curve Editor.
2. Confirm full transport is still present.
3. Test previous/play/stop/next.
4. Test Auto ON.

Expected:

```text
Editor controls are unchanged.
```

## Test 5 — Long Titles

1. Play track with long title/artist.
2. Enter Broadcast HUD.

Expected:

```text
Text truncates cleanly without layout break.
```

## Test 6 — No Track / Empty Playlist

1. Open empty playlist.
2. Enter Broadcast HUD.

Expected:

```text
Minimal transport shows safe empty/not-playing state.
```

## Test 7 — OBS Capture

1. Fullscreen Broadcast HUD.
2. Capture in OBS or browser capture.
3. Confirm clean lower strip and no distracting control cluster.

Expected:

```text
Transport is stream-safe.
```

---

# 21. Implementation Order

Recommended:

```text
1. Create MinimalBroadcastTransport component
2. Wire it into BroadcastHudShell
3. Keep PlaybackTransport in editor mode
4. Add minimal progress CSS
5. Remove HUD-visible prev/stop/next/Auto controls
6. Test playback state and timing
7. Test editor regression
8. Test OBS/fullscreen view
```

---

# 22. Claude / Codex Notes

Do not delete the full transport.

Do not simplify the editor transport.

This patch only changes Broadcast HUD presentation.

The main objective:

```text
Make Broadcast HUD look like a stream-facing playback display,
not a desktop media player.
```

Keep it small and safe.

---

# 23. Product Principle

```text
The stream viewer needs state, not controls.
```

Broadcast HUD should show:

```text
what is playing
where we are in the track
whether playback is active
```

The operator/editor can still access full controls in Flow-Curve Editor.

