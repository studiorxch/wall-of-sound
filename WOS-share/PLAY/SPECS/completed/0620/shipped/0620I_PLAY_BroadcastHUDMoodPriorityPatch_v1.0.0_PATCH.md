# 0620I_PLAY_BroadcastHUDMoodPriorityPatch_v1.0.0_PATCH

## Patch Name
**PLAY Broadcast HUD Mood Priority Patch**

## Version
`v1.0.0`

## Date
2026-06-21

## Status
Draft for implementation

---

# 1. Purpose

0620H improved Broadcast HUD atmosphere by adding full-surface background imagery, cover-blur fallback, richer veil, glass panels, and reduced structural purple lines.

However, the Broadcast HUD still visually prioritizes the **flow chart / engineering state** over the **playlist mood**.

For a playlist titled:

```text
A Playlist for Nappers
```

the HUD should sell:

```text
sleepy mood
warmth
softness
slow program
playlist atmosphere
```

not:

```text
technical graph
warning chart
duration analytics
engineering surface
```

0620I corrects this by making **playlist mood and color identity** the dominant Broadcast HUD layer, while reducing the flow curve into a quiet playback/navigation signal.

Core principle:

```text
Playlist mood owns the screen.
The chart is allowed only as a quiet navigation signal.
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
0620F — HUD polish + card separation ✅
0620G — Minimal Broadcast Transport ✅
0620H — Broadcast HUD Background Surface ✅
```

PLAY now has a working Broadcast HUD, but the HUD is still too graph-dominant.

0620I is a visual hierarchy correction.

---

# 3. Current Problem

The Broadcast HUD currently shows multiple competing “duration/progress” signals:

```text
1. Bottom full-width playback progress line
2. Queue rail NOW progress line
3. Flow curve line across the chart
4. Chart grid/warning bands/timeline structure
```

The result is that the viewer reads:

```text
duration
chart
engineering state
warning analysis
```

before reading:

```text
playlist mood
music identity
visual atmosphere
```

This is backwards for Broadcast HUD.

---

# 4. Patch Goal

Make Broadcast HUD prioritize playlist mood by:

- making playlist background/cover image more visible
- reducing the flow curve’s visual dominance
- hiding editor-only chart labels in Broadcast HUD
- removing redundant progress/duration indicators
- keeping only the bottom transport progress as the primary duration line
- reducing warning/node/chart visual noise
- creating Broadcast HUD curve display modes

The HUD should feel like:

```text
music channel surface
playlist atmosphere
soft playback world
broadcast mood layer
```

not:

```text
Excel chart
analytics dashboard
playlist engineering panel
```

---

# 5. Scope

## Included

### A. Mood Priority Background

Increase playlist image/mood visibility in Broadcast HUD.

### B. Reduce Graph Dominance

The graph should become secondary in Broadcast HUD.

### C. Hide Editor-Only Chart UI in HUD

Hide in Broadcast HUD:

- `Click curve to add point`
- Energy axis label
- Time axis label
- full legend
- editor hint text
- chart-heavy labels where possible

### D. Reduce Duplicate Duration Lines

Keep the bottom minimal transport progress as the primary progress/duration line.

Reduce or remove:

- queue rail now-progress line
- heavy flow curve line dominance
- chart visual elements that read as progress bars

### E. Broadcast HUD Curve Display Modes

Add or prepare display modes:

```text
Full
Compact
Minimal
```

Default should become `Compact` or `Minimal`, not full editor graph.

### F. Reduce Warning / Node Visual Noise

Make weak/critical/locked markers less visually dominant in Broadcast HUD.

Warnings can still exist, but should not dominate the mood.

---

# 6. Non-Goals

Do not implement in this patch:

- audio-reactive visualizer
- waveform
- scheduler
- transition editor
- new queue features
- new playback engine
- WOS integration changes
- OBS API integration
- new title card system
- AI image generation
- image editor/cropper
- particle system
- shader engine

This is a Broadcast HUD visual hierarchy patch.

---

# 7. Surface Separation Rule

Lock in:

```text
Editor = analysis
Broadcast HUD = mood + playback state
Broadcast Card = identity
```

More specifically:

```text
Flow-Curve Editor
= full graph, axes, labels, legends, warnings, editing controls

Broadcast HUD
= atmosphere, current playback, queue, subtle route signal

Broadcast Card
= cinematic title / identity, no graph
```

---

# 8. New Graph Rule

The full graph belongs to Flow-Curve Editor.

Broadcast HUD should use a reduced “route” version.

```text
Editor Graph = analytic tool
HUD Curve = music route signal
```

The HUD curve should not look like a spreadsheet chart.

---

# 9. Broadcast HUD Curve Display Modes

Add a mode option for the Broadcast HUD curve display.

Recommended type:

```ts
export type BroadcastHudCurveMode =
  | "full"
  | "compact"
  | "minimal";
```

## Full

Similar to current HUD graph, but still no editor instructions.

Use only if user/operator explicitly selects it.

## Compact

Default preferred mode.

Behavior:

- no editor hints
- no axis labels
- no full legend
- softer grid
- softer curve
- fewer/lower-opacity markers
- current playing marker emphasized
- warning markers subdued unless active

## Minimal

Most broadcast-oriented mode.

Behavior:

- thin route line only
- no axes
- no grid
- no legend
- no all-track node density
- current node/pulse only
- optional few nearby nodes
- maximum background/mood visibility

If implementing all three is too much, implement:

```text
Full / Compact
```

and make Compact the default in Broadcast HUD.

---

# 10. Default Behavior

Broadcast HUD default should not use the full editor graph.

Recommended default:

```text
Broadcast HUD curve mode = Compact
```

If possible:

```text
Minimal
```

for playlists with strong cover/background imagery.

Do not change Flow-Curve Editor default.

---

# 11. Hide Editor-Only Text in Broadcast HUD

Remove or hide in Broadcast HUD:

```text
Click curve to add point · Right-click point to remove
```

This is editor language and should never appear in Broadcast HUD.

Also hide/reduce:

```text
Energy
Time →
Flow Curve legend
Track / Playing / Locked / Weak / Critical legend
```

These can remain in Flow-Curve Editor.

---

# 12. Duplicate Duration / Progress Signals

## Keep

The bottom minimal transport progress line remains the primary duration line.

This is the one clear track-level duration indicator.

## Remove or Reduce

### Queue rail progress line

The queue rail already says NOW and lists the current item.

The small NOW progress line should be removed or heavily reduced unless it adds unique information.

### Flow curve line

The curve may remain, but it should not visually read as a second progress/duration bar.

Reduce:

- opacity
- stroke width
- brightness
- label density
- marker density

### Chart grid

Reduce grid opacity or hide in Compact/Minimal mode.

### Warning blocks

Reduce warning band dominance. They should not look like huge red timeline blocks in Broadcast HUD unless there is a critical active issue.

---

# 13. Playlist Image Priority

The background image or cover-blur fallback should be clearly visible.

Current issue:

```text
The image technically exists, but the chart owns the screen.
```

Required change:

```text
Playlist art/mood should be visible enough to influence the whole HUD feel.
```

Ways to improve:

- reduce graph panel opacity
- reduce chart surface darkness slightly if readability allows
- make panel smaller or less dominant
- use gradient masks instead of opaque panel blocks
- use Compact/Minimal curve mode by default
- let background/cover colors inform HUD accent treatment

Do not reduce readability.

---

# 14. Mood-Based Visual Priority

The header title and background should communicate the playlist’s purpose.

For example:

```text
A Playlist for Nappers
```

should visually lean toward:

```text
soft
low contrast
warm/dim
slow
sleepy
low motion
minimal warning noise
```

Do not hardcode “napper” styling.

Instead, allow playlist imagery/accent color to carry the mood.

---

# 15. Queue Rail

The queue rail should remain useful, but it should not compete with the background or transport progress.

Recommended changes:

- remove/reduce NOW progress line
- keep text readable
- use subtle section labels
- reduce bright accent line repetition
- keep skipped summary low-priority

The queue rail owns:

```text
what is coming
```

The transport owns:

```text
where we are now
```

---

# 16. Minimal Transport

Keep 0620G MinimalBroadcastTransport.

It is working.

Rules:

- bottom progress line remains
- no prev/stop/next/autoplay buttons
- state glyph remains
- track title/artist/time remain

This is the primary duration/progress signal.

---

# 17. Warning State

Warnings still matter, but Broadcast HUD should not look like a warning dashboard.

Rules:

- weak/critical rings can exist, but reduce dominance
- large red warning bands should be hidden or low opacity by default
- active critical issue may surface more strongly
- warning details belong in Editor mode

Recommended:

```text
HUD = quiet warning awareness
Editor = detailed warning analysis
```

---

# 18. Suggested Component / Prop Changes

Possible props for `FlowCurveCanvas`:

```ts
type FlowCurveDisplayMode = "editor" | "hud_full" | "hud_compact" | "hud_minimal";

type FlowCurveCanvasProps = {
  readOnly?: boolean;
  displayMode?: FlowCurveDisplayMode;
  showAxes?: boolean;
  showLegend?: boolean;
  showEditorHints?: boolean;
  showGrid?: boolean;
  showAllTrackNodes?: boolean;
  showWarningBands?: boolean;
};
```

Or simpler:

```tsx
<FlowCurveCanvas
  readOnly
  displayMode="hud_compact"
/>
```

Do not over-parameterize unless needed.

---

# 19. CSS / Visual Targets

Broadcast HUD Compact curve target:

```text
curve opacity: lower than current
grid opacity: very low or none
node opacity: reduced
current node: visible/pulsed
warning bands: low opacity or off
panel: more transparent/glass
legend: hidden
axes: hidden
```

Minimal curve target:

```text
thin line
current node only
no grid
no axes
no legend
no warning bands
very low visual footprint
```

---

# 20. Expected Files To Touch

Likely files:

```text
src/ui/FlowCurveCanvas.tsx
src/ui/BroadcastHudShell.tsx
src/ui/NowNextQueuePanel.tsx
src/ui/MinimalBroadcastTransport.tsx
src/styles.css
```

Possible files:

```text
src/ui/broadcastHudTypes.ts
src/playlistTypes.ts
```

Use actual project paths.

---

# 21. Acceptance Criteria

## Mood Priority

- Playlist background/cover imagery is more visible in Broadcast HUD.
- Playlist mood/color feels dominant over graph UI.
- The chart no longer visually owns the screen.

## Graph Reduction

- Broadcast HUD hides editor helper text.
- Broadcast HUD hides or greatly reduces axes.
- Broadcast HUD hides or greatly reduces legend.
- Broadcast HUD reduces grid/marker density.
- Broadcast HUD reduces warning band dominance.
- Full graph remains available in Flow-Curve Editor.

## Duration Signal Cleanup

- Bottom transport progress line remains.
- Queue rail progress line is removed or substantially reduced.
- HUD no longer appears to have multiple competing duration bars.
- Flow curve no longer reads as the dominant duration line.

## Curve Modes

- Broadcast HUD supports at least one reduced graph mode.
- Preferred: Full / Compact / Minimal modes.
- Compact or Minimal is default in Broadcast HUD.
- Editor remains full graph.

## No Regressions

- Flow-Curve Editor still works.
- Broadcast HUD still works.
- Queue panel still works.
- Minimal transport still works.
- Broadcast Card Preview still works.
- Playback still works.
- readOnly protection remains active in HUD.

---

# 22. Manual Test Plan

## Test 1 — Playlist Mood Visibility

1. Select a playlist with strong cover/background imagery.
2. Enter Broadcast HUD.
3. Confirm the image/color mood is clearly visible.

Expected:

```text
The playlist mood owns the surface more than the chart.
```

## Test 2 — Napper Playlist

1. Use `A Playlist for Nappers`.
2. Enter Broadcast HUD.
3. Confirm the screen feels soft/playlist-oriented, not like engineering analytics.

Expected:

```text
HUD supports the playlist mood.
```

## Test 3 — Hide Editor Text

1. Enter Broadcast HUD.
2. Confirm `Click curve to add point` is gone.
3. Confirm axes/legend are hidden or reduced.

Expected:

```text
No editor-only chart language appears in HUD.
```

## Test 4 — Duration Signal Cleanup

1. Start playback.
2. Enter Broadcast HUD.
3. Count visible progress/duration lines.

Expected:

```text
Bottom transport progress is the primary duration line.
No competing duration bars dominate.
```

## Test 5 — Editor Regression

1. Switch to Flow-Curve Editor.
2. Confirm full graph, labels, legend, and editing behavior still work.

Expected:

```text
Editor remains analytic and fully usable.
```

## Test 6 — Warning Visuals

1. Use playlist with weak/critical warnings.
2. Enter Broadcast HUD.
3. Confirm warning visuals are present but subdued.
4. Switch to Editor.
5. Confirm warnings are detailed there.

Expected:

```text
HUD is not overwhelmed by warning dashboard language.
```

## Test 7 — OBS Capture

1. Fullscreen Broadcast HUD.
2. Capture in OBS/browser.
3. Confirm mood, image, and current playback read clearly.

Expected:

```text
HUD feels like a music broadcast scene, not an analysis tool.
```

---

# 23. Implementation Order

Recommended:

```text
1. Add FlowCurveCanvas displayMode for HUD compact/minimal.
2. Hide editor helper text in HUD.
3. Hide/reduce axes and legend in HUD.
4. Reduce grid/node/warning opacity in HUD.
5. Remove/reduce queue NOW progress line.
6. Increase playlist image/background visibility.
7. Make compact/minimal curve mode the Broadcast HUD default.
8. Confirm Editor still uses full graph.
9. Test napper playlist / strong-image playlist.
10. Test OBS/fullscreen capture.
```

---

# 24. Claude / Codex Notes

This is not an effects patch.

Do not add audio-reactive visuals yet.

Do not remove the flow curve from Editor.

Do not remove the bottom transport progress line.

Do not make Broadcast HUD unreadable.

Main objective:

```text
Broadcast HUD should sell playlist mood first,
then playback state,
then route/curve context.
```

The chart must stop acting like it has its own identity separate from the playlist.

---

# 25. Product Principle

```text
The playlist is the program.
The graph is only a guide.
```

For Broadcast HUD:

```text
Mood first.
Playback second.
Route third.
Analysis last.
```
