# PLAY Patch 0620J — Broadcast HUD No Default Chart Hotfix
**Completion Report · 2026-06-21**

---

## Summary

Removed the flow-curve chart entirely from the default Broadcast HUD surface. The main HUD body is now an atmosphere zone — playlist background/cover imagery owns the screen. Queue rail and minimal transport are unchanged.

---

## Product Rule (locked in)

```
Editor        = analysis — full chart, axes, legend, warnings, editing controls
Broadcast HUD = mood + playback state — image surface, queue, minimal transport
Broadcast Card = cinematic identity — no chart
```

---

## Changes

### `src/ui/BroadcastHudShell.tsx`

- Removed `FlowCurveCanvas` import and JSX render from HUD body
- Removed `hoveredSlotIndex`, `onNodeHoverChange`, `locks` from destructuring (props type kept intact for call-site compatibility)
- Replaced `.hud-canvas-zone` + `<FlowCurveCanvas>` with `.hud-atmosphere-zone` — a transparent flex fill that lets the background layer show through
- `libraryTracks`, `onStop`, `onNext`, `onPrevious`, `onAutoplayToggle`, `onSeek` remain in Props (call site passes them)

### `src/styles.css`

| Rule | Change |
|------|--------|
| `.hud-canvas-zone` | Removed |
| `.hud-canvas-zone .curve-container` | Removed |
| `.hud-atmosphere-zone` | NEW — `flex: 1; min-width: 0` transparent fill |

The orphaned `.hud-canvas-zone .flow-curve-svg` rule at line 763 is harmless (no element matches it) but left in place as it caused no issues.

---

## HUD Surface Stack (after patch)

```
Layer 1 (bottom): playlist.backgroundImage  OR  cover-blur  OR  dark
Layer 2:          hud-bg-veil (gradient vignette)
Layer 3:          hud-header (title, cover thumb, tags, stats)
Layer 4:          hud-body
  ├── hud-atmosphere-zone  ← transparent, lets background show through
  └── hud-queue-rail       ← NOW / NEXT / UP NEXT
Layer 5 (top):    hud-transport-wrap (minimal transport + bottom progress line)
```

---

## Verification

- `npx tsc --noEmit` — clean
- Broadcast HUD: no chart, no axes, no legend, no curve line — main surface is pure atmosphere
- Broadcast HUD: queue rail visible (NOW / NEXT / End of playlist)
- Broadcast HUD: minimal transport visible with bottom progress line
- Flow-Curve Editor: full graph, axes, legend, hint text, control points, warning bands — no regression
- No Broadcast Card regression

---

## Patch Status: ✅ COMPLETE
