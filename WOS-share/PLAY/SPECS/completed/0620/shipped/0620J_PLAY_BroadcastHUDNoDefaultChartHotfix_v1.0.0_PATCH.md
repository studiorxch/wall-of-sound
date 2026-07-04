# 0620J_PLAY_BroadcastHUDNoDefaultChartHotfix_v1.0.0_PATCH

## Project

**PLAY — Broadcast HUD No Default Chart Hotfix**  
**Patch ID:** `0620J_PLAY_BroadcastHUDNoDefaultChartHotfix_v1.0.0_PATCH`  
**Status:** Draft / Ready if `0620I_PLAY_BroadcastHUDMoodPriorityPatch_v1.0.0_PATCH` fails visual validation  
**Date:** 2026-06-21  
**Primary Use:** Claude / Codex / developer handoff

---

## Environmental Assumptions

- Runtime: local Vite + React + TypeScript PLAY prototype.
- `0619A–0620H` are complete and PASS.
- `0620I_PLAY_BroadcastHUDMoodPriorityPatch_v1.0.0_PATCH` has been drafted but is not yet trusted.
- `0620G` reduced Broadcast HUD transport to a minimal state line plus bottom progress bar.
- `0620H` made playlist background / cover blur visible with veil and vignette.
- `0620E` added the Now / Next / Up Next queue rail.
- `FlowCurveCanvas` exists and should remain available inside the Flow-Curve Editor.
- Broadcast HUD currently risks feeling too chart-led / engineering-led.

---

## Product Correction

Broadcast HUD must sell **mood first**, not analysis.

For **“A Playlist for Nappers,”** the default Broadcast HUD should read as:

- sleepy
- warm
- soft
- atmospheric
- immersive
- playlist-as-place

It should not read as:

- engineering dashboard
- duration analytics
- route chart
- graph-first interface
- developer tool
- playlist debugger

---

## Current Rule

```text
Editor = analysis
Broadcast HUD = mood + playback state
Broadcast Card = identity
```

This patch exists to enforce that rule visually.

---

## Trigger Condition

Apply this patch only if `0620I_PLAY_BroadcastHUDMoodPriorityPatch_v1.0.0_PATCH` still feels wrong after testing.

`0620I` fails if any of the following remain true:

1. The flow curve chart visually dominates the Broadcast HUD.
2. A purple route / curve remnant still pulls attention away from mood.
3. Nodes, axes, legends, or analytic chart marks remain visible by default.
4. The HUD still feels like duration analytics instead of a sleepy broadcast surface.
5. Background cover / playlist atmosphere does not feel like the main surface.
6. “A Playlist for Nappers” does not immediately read as warm, soft, sleepy, and atmospheric.

---

## Patch Goal

Remove the default graph from Broadcast HUD entirely.

The Broadcast HUD should rely on:

1. visible background / cover blur
2. veil and vignette
3. playlist title / identity
4. minimal playback state line
5. bottom progress bar
6. Now / Next / Up Next rail
7. soft mood-first typography and spacing

The Flow Curve should still exist in the Flow-Curve Editor, but it should not be mounted in default Broadcast HUD.

---

## Hard Requirement

Remove `FlowCurveCanvas` from default Broadcast HUD.

Default Broadcast HUD must show:

```text
No route line.
No purple chart remnant.
No nodes.
No axes.
No legend.
No default analytic graph.
```

The chart may return only as an explicit optional overlay later.

---

## Non-Goals

Do not rebuild the Flow-Curve Editor.

Do not delete `FlowCurveCanvas` globally.

Do not remove playlist assignment logic.

Do not remove the flow curve data model.

Do not remove the Now / Next / Up Next rail.

Do not undo the `0620G` transport simplification.

Do not undo the `0620H` background / cover blur treatment.

Do not introduce waveform, audio analysis, or playback-control complexity.

---

## Required Behavior

### Broadcast HUD Default

The default Broadcast HUD must prioritize atmosphere.

Required visible elements:

- playlist title
- playlist mood subtitle or descriptor, if already available
- current track state line
- bottom progress bar
- Now / Next / Up Next rail
- background / cover blur surface
- veil / vignette treatment

Forbidden visible elements by default:

- `FlowCurveCanvas`
- flow curve SVG
- analytic chart path
- route line
- curve nodes
- axes
- energy labels
- chart legend
- grid-heavy analysis panel

---

## Optional Overlay Rule

If a chart overlay already exists or is added later, it must be explicit.

Acceptable overlay states:

```ts
type BroadcastOverlayMode = "mood" | "flow";
```

Default:

```ts
const DEFAULT_BROADCAST_OVERLAY_MODE: BroadcastOverlayMode = "mood";
```

Rules:

- `mood` mode shows no chart.
- `flow` mode may show chart only when explicitly selected.
- Chart overlay must never be the default for Broadcast HUD.
- Chart overlay should feel secondary and temporary.
- Editor remains the primary home for Flow Curve analysis.

---

## Component Guidance

Likely files to inspect:

```text
src/ui/BroadcastHUD.tsx
src/ui/BroadcastCard.tsx
src/ui/FlowCurveCanvas.tsx
src/ui/FlowCurveEditor.tsx
src/App.tsx
src/styles.css
```

Actual filenames may differ. Search for:

```text
FlowCurveCanvas
BroadcastHUD
broadcast
flow curve
curve canvas
playlist background
Now
Next
Up Next
```

---

## Implementation Steps

### 1. Remove Default Chart Mount from Broadcast HUD

Find any default Broadcast HUD render path like:

```tsx
<FlowCurveCanvas ... />
```

Remove it from the default Broadcast HUD layout.

If the component is shared, move the chart render behind an explicit mode check:

```tsx
{overlayMode === "flow" ? (
  <FlowCurveCanvas curve={flowCurve} slots={slots} readonly compact />
) : null}
```

Do not leave a hidden chart container that still affects layout, spacing, or visual hierarchy.

---

### 2. Preserve Flow-Curve Editor Chart

Ensure `FlowCurveCanvas` still renders in the Flow-Curve Editor.

Expected editor behavior:

- curve is visible
- curve remains editable if already editable
- editor keeps analytic controls
- editor remains the analysis surface

---

### 3. Strengthen Mood Surface

Use the Broadcast HUD space previously occupied by the chart to make the background / cover blur feel like the main surface.

Prioritize:

- larger soft negative space
- readable title / identity block
- gentle veil / vignette
- low-contrast metadata
- minimal current playback state
- queue rail as support, not dashboard

---

### 4. Keep Transport Minimal

Preserve `0620G` behavior:

- minimal state line
- bottom progress bar
- no large transport control cluster
- no chart-like timing dashboard

The bottom progress bar should remain the only persistent time-progress visual.

---

### 5. Keep Queue Rail

Preserve `0620E` behavior:

- Now
- Next
- Up Next

The queue rail may remain visible because it supports playback context without making the HUD feel analytical.

---

## CSS Guidance

Remove or disable chart-specific Broadcast HUD styles only where they affect Broadcast.

Do not delete editor chart styles if the editor still needs them.

Likely class patterns to inspect:

```css
.broadcast-flow
.broadcast-curve
.broadcast-chart
.broadcast-route
.flow-curve-canvas
.broadcast-hud__analysis
.broadcast-hud__curve
```

Default Broadcast HUD should visually lean into classes like:

```css
.broadcast-hud__mood
.broadcast-hud__background
.broadcast-hud__veil
.broadcast-hud__vignette
.broadcast-hud__state
.broadcast-hud__queue
.broadcast-hud__progress
```

---

## Acceptance Criteria

This patch passes when:

1. Default Broadcast HUD contains no `FlowCurveCanvas`.
2. No route line, purple chart remnant, nodes, axes, or legend are visible by default.
3. Flow Curve remains available in Flow-Curve Editor.
4. Playlist background / cover blur reads as the primary surface.
5. Transport remains reduced to minimal state line plus bottom progress bar.
6. Now / Next / Up Next rail remains available.
7. “A Playlist for Nappers” reads as sleepy / warm / soft / atmospheric before it reads as technical.
8. Broadcast HUD no longer feels like an engineering chart or duration analytics panel.
9. App builds without TypeScript or runtime errors.
10. Existing `0619A–0620H` behaviors remain intact.

---

## Test Checklist

Run visual checks in this order:

1. Open Broadcast HUD with “A Playlist for Nappers.”
2. Confirm no chart or chart residue appears on initial load.
3. Confirm background / cover blur is visible and mood-forward.
4. Confirm title and playlist identity remain readable.
5. Confirm minimal state line appears.
6. Confirm bottom progress bar appears.
7. Confirm Now / Next / Up Next rail appears.
8. Navigate to Flow-Curve Editor.
9. Confirm Flow Curve chart still appears in editor.
10. Confirm app rebuilds cleanly.

---

## Suggested Manual Validation Language

Use this plain-language validation test:

```text
Does this screen feel like a sleepy playlist world, or does it feel like an analytics dashboard?
```

Pass only if the answer is:

```text
Sleepy playlist world.
```

---

## Implementation Guide

- **Where:** Remove the default `FlowCurveCanvas` mount from the Broadcast HUD render path, likely in `src/ui/BroadcastHUD.tsx`; keep `FlowCurveCanvas` mounted in the Flow-Curve Editor path, likely `src/ui/FlowCurveEditor.tsx`.
- **What:** Run `grep -R "FlowCurveCanvas\|broadcast.*curve\|broadcast.*chart" src`, patch the Broadcast HUD conditional render, then run `npm run build`.
- **Expect:** Broadcast HUD opens as a mood-first playlist surface with background blur, state line, progress bar, and queue rail; the Flow Curve chart appears only in the editor or explicit future overlay, never by default.
