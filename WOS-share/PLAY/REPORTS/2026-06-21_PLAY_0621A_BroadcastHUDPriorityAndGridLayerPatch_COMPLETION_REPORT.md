# PLAY Patch 0621A — Broadcast HUD Priority + Grid Layer
**Completion Report · 2026-06-21**

---

## Summary

Restructured the Broadcast HUD information hierarchy so one secondary layer is active at a time. Replaced the permanent queue rail with a cycled secondary presentation controller. Added the passive BroadcastGridLayer foundation. Compressed editor top bar action buttons to icons.

---

## Product Rule (locked in)

```
Main Screen   = mood / playlist world / background image
Secondary Layer = one temporary information event at a time
Editor        = hidden/internal analysis controls
Broadcast Card = playlist identity
Grid Layer    = future AI / multi-PIP orchestration foundation
```

```
Information priority:
1. Currently playing audio
2. Currently playing playlist
3. Next playlist / upcoming attraction
4. Optional queue — only during temporary presentation moments
```

---

## Changes

### NEW: `src/ui/BroadcastGridLayer.tsx`

Passive broadcast grid overlay — registration crosshairs + cell grid lines + corner brackets.

Types exported: `BroadcastGridCell`, `BroadcastGridRegion`, `BroadcastGridLayout`

Props:
- `visible?: boolean` — default `false` (completely absent from DOM when off)
- `rows?: number` — default 4
- `columns?: number` — default 6
- `layout?: BroadcastGridLayout` — optional named layout with regions

Rendered as: absolute-positioned `pointer-events: none` SVG overlay with `vectorEffect="non-scaling-stroke"`. Grid lines at ~6% opacity, registration crosshairs at intersections at ~18% opacity, corner brackets at ~25% opacity.

### NEW: `src/ui/BroadcastSecondaryLayer.tsx`

Single secondary information object rendered as a floating glass card.

Type exported: `BroadcastSecondaryMode = "none" | "now_playing" | "playlist_identity" | "next_up" | "upcoming_buffet" | "grid_preview"`

| Mode | Position | Content |
|------|----------|---------|
| `none` | — | nothing |
| `now_playing` | bottom-left card | NOW PLAYING label, title, artist, progress bar, time |
| `playlist_identity` | centered card | PLAYLIST label, cover, title, desc, meta, tags |
| `next_up` | bottom-right card | NEXT UP label, track title, artist |
| `upcoming_buffet` | bottom-right panel | COMING UP label, slot#, title, artist list |
| `grid_preview` | — | handled by BroadcastGridLayer; this layer returns null |

All cards: dark glass `rgba(8,8,20,0.72–0.80)`, `backdrop-filter: blur(12–16px)`, monospaced system label typography, 1px border at 8–10% white opacity.

### `src/ui/BroadcastHudShell.tsx`

- Removed permanent queue rail from `hud-body` (no longer a default column)
- Added `secondaryMode` state (default `"none"`)
- Added `gridVisible` state (default `false`)
- Added two operator control buttons in header-right:
  - Secondary cycle button: shows current mode glyph (`—` / `▶` / `◈` / `→` / `≡`), cycles through SECONDARY_MODES on click, glows accent when active
  - Grid toggle button `⊞`: toggles BroadcastGridLayer, glows accent when active
- Replaced `hud-canvas-zone` + `hud-queue-rail` columns with:
  - `hud-atmosphere-zone` (transparent fill, mood surface)
  - `<BroadcastGridLayer>` (absolute, pointer-events none)
  - `<BroadcastSecondaryLayer>` (absolute, single info object)
- Removed unused imports: `FlowCurveCanvas`, `NowNextQueuePanel`, `locks`, `hoveredSlotIndex`, `onNodeHoverChange`

### `src/ui/TopBar.tsx`

Compressed three text action buttons to icon-only `tb-icon-btn` buttons:

| Before | After | title attribute |
|--------|-------|-----------------|
| "Import to Library" | `⊕` | "Import CSV tracks to library" |
| "Restore Project" | `↺` | "Restore project from JSON backup" |
| "Backup Project" | `⬡` | "Backup project as JSON" |

Two separate `tb-io` sections collapsed into one. Editor top bar now reads as compact operator controls, not user-facing text menu.

### `src/styles.css`

New rules added:
- `.tb-icon-btn` — 26×22px square icon button, matches `.tb-btn` interaction pattern
- `.hud-header-right` — flex container for operator controls
- `.hud-ctl-btn` — HUD operator button (26×22px, translucent, glows on active)
- `.bgl-overlay`, `.bgl-svg`, `.bgl-line`, `.bgl-reg line`, `.bgl-corner line` — grid layer
- `.bsl-layer`, `.bsl-sys-label` — secondary layer base + system label
- `.bsl-now-playing`, `.bsl-np-*` — Now Playing card
- `.bsl-identity`, `.bsl-identity-*`, `.bsl-tag` — Playlist Identity card
- `.bsl-next-up`, `.bsl-next-*` — Next Up card
- `.bsl-buffet`, `.bsl-buffet-*` — Upcoming Buffet panel

---

## Broadcast HUD Surface Stack (after patch)

```
Layer 1 (bottom): playlist.backgroundImage  OR  cover-blur  OR  dark
Layer 2:          hud-bg-veil (gradient vignette)
Layer 3 (z:2):    hud-header (title, cover thumb, tags — always visible)
Layer 4:          hud-body (flex, position: relative)
  ├── hud-atmosphere-zone       (transparent fill, mood owns the space)
  ├── bgl-overlay (z:1)         (grid layer, pointer-events: none)
  └── bsl-layer (z:3)           (one secondary object OR nothing)
Layer 5 (top):    hud-transport-wrap (minimal transport + progress line — always visible)
```

---

## Verification

- `npx tsc --noEmit` — clean
- Broadcast HUD default (`none`): pure atmosphere, no chart, no queue rail, no secondary content
- Grid toggle: 4×6 registration grid with crosshairs and corner brackets, subtle, pointer-events none
- `now_playing` mode: bottom-left glass card — NOW PLAYING, title, progress bar, time
- Mode cycle button glows accent when secondary mode is active
- Editor top bar: three icon buttons (`⊕ ↺ ⬡`) instead of text labels, all functional with tooltips
- Flow-Curve Editor: full graph, axes, legend, hint text — no regression
- TypeScript: clean

---

## Patch Status: ✅ COMPLETE
