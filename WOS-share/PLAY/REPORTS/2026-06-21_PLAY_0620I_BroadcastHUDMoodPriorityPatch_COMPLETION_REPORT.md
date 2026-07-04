# PLAY Patch 0620I — Broadcast HUD Mood Priority
**Completion Report · 2026-06-21**

---

## Summary

Corrected the Broadcast HUD visual hierarchy so that playlist mood and atmosphere own the screen, with the flow curve demoted to a quiet navigation signal. Removed editor-only UI from HUD, suppressed duplicate progress indicators, and reduced graph panel opacity to let background imagery show through.

---

## Visual Rule (locked in)

```
Editor   = analysis surface — full graph, axes, labels, legend, warnings, controls
HUD      = mood + playback state — quiet curve, no editor chrome
Card     = cinematic identity — no graph
```

```
Playlist mood owns the screen.
The chart is only a route signal.
```

---

## Changes

### `src/ui/FlowCurveCanvas.tsx`

- Added `FlowCurveDisplayMode = "editor" | "hud_compact" | "hud_minimal"` type (exported)
- Added `displayMode?: FlowCurveDisplayMode` prop (default `"editor"`)
- Derived booleans: `isHud`, `isMinimal`, `showAxes`, `showLegend`, `showHint`, `showGrid`, `showWarningBands`
- Derived rendering values: `gridOpacity` (0.25 in HUD), `curveOpacity` (0.55 in HUD), `curveStrokeWidth` (1.5 in HUD)

| Element | Editor | hud_compact | hud_minimal |
|---------|--------|-------------|-------------|
| Hint text | ✅ | ✗ | ✗ |
| Axis labels (Energy / Time →) | ✅ | ✗ | ✗ |
| Legend | ✅ | ✗ | ✗ |
| Grid lines | ✅ | ✅ (25% opacity) | ✗ |
| Warning bands | ✅ | ✗ | ✗ |
| Curve line | full | dimmed/thin | dimmed/thin |
| All track nodes | ✅ | ✅ (non-playing at 35% opacity) | now-playing only |
| Warning rings | all | red only (40% opacity) | none |
| Slot number labels | ✅ | ✗ | ✗ |
| Control points | ✅ | ✗ | ✗ |

### `src/ui/BroadcastHudShell.tsx`

- Added `displayMode="hud_compact"` to `<FlowCurveCanvas>` call

### `src/ui/NowNextQueuePanel.tsx`

- Removed NOW progress bar block (`nnq-progress-bar` / `nnq-progress-fill`)
- Bottom minimal transport progress line remains as the single primary duration indicator
- `currentTimeSeconds` and `durationSeconds` props still present but now unused (kept for future use)

### `src/styles.css`

| Rule | Change |
|------|--------|
| `.hud-canvas-zone .curve-container` | `background: rgba(6,6,18,0.52)` → `rgba(6,6,18,0.28)` — more transparent glass panel |
| `.hud-canvas-zone .curve-container` | `backdrop-filter: blur(4px)` → `blur(2px)` — lighter blur |
| `.hud-canvas-zone .curve-container` | `box-shadow` reduced — less visual weight |

---

## Duration Signal After Patch

```
Primary:   Bottom transport progress line      ← stays
Removed:   Queue rail NOW progress bar         ← gone
Reduced:   Flow curve line opacity/weight      ← quiet signal
Removed:   Warning bands (red zone blocks)     ← hidden in HUD
```

---

## Verification

- `npx tsc --noEmit` — clean
- Broadcast HUD: no axes, no legend, no hint text, no grid, no warning bands, no control points, no slot labels
- Broadcast HUD: curve shows as quiet thin dimmed line
- Broadcast HUD: now-playing node visible; other nodes at 35% opacity
- Broadcast HUD: glass panel more transparent — background imagery visible
- Broadcast HUD: queue rail has no progress bar
- Flow-Curve Editor: full graph, axes, legend, hint text, control points, warning bands — no regression
- TypeScript: clean

---

## Patch Status: ✅ COMPLETE
