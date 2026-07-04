# 0621A_PLAY_BroadcastHUDPriorityAndGridLayerPatch_v1.0.0_PATCH

## Project

**PLAY — Broadcast HUD Priority + Grid Layer Patch**

## Status

Draft patch spec. Ready for Claude / Codex implementation.

## Environmental Assumptions

- Runtime: local Vite + React + TypeScript app.
- Current completed baseline: `0619A–0620H` PASS.
- Current trusted patch: `0620J_PLAY_BroadcastHUDNoDefaultChartHotfix_v1.0.0_PATCH` PASS.
- `FlowCurveCanvas` has already been removed from default Broadcast HUD.
- Flow-Curve Editor still owns the full graph / timeline view.
- Broadcast HUD now uses the background/cover image as the primary emotional surface.
- Minimal transport state line and bottom progress bar must remain.
- Now / Next / Up Next rail exists but needs priority restructuring.

## Product Correction

The Broadcast HUD should not behave like a dashboard, playlist table, or persistent menu system.

The viewer should understand one thing at a time:

```txt
Main Screen = mood / playlist world / background image
Secondary Layer = one temporary information event
Editor = hidden/internal analysis controls
Broadcast Card = playlist identity
Grid Layer = future AI / multi-PIP orchestration system
```

## Core Problem

The interface still presents too many competing information systems at once.

Current Broadcast HUD behavior appears to contain overlapping displays for:

1. currently playing track
2. currently playing playlist
3. upcoming track / playlist
4. queue or playlist rail

This creates redundancy and weakens the main visual surface.

The HUD should instead support a clear broadcast rhythm:

```txt
Primary mood surface
→ temporary secondary information
→ return to mood surface
→ next upcoming attraction
```

The secondary layer should behave like an interruption, bumper, or broadcast promo — not a constant panel.

## Product Rules

### 1. Editor Rule

The Flow-Curve Editor may show technical data.

The editor top bar currently exposes internal content that serves no viewer purpose. Convert top-bar text controls/status labels into compact icons.

Required behavior:

- Replace editor mode text/status content with icons.
- Keep editor mode access available.
- Treat this as hidden/internal mode control.
- Do not make editor metadata compete with the Flow Curve timeline.
- Preserve the Flow Curve timeline as the editor's main working surface.

### 2. Broadcast HUD Rule

Broadcast HUD should prioritize mood, playback state, and selective timing.

Required behavior:

- No default FlowCurveCanvas.
- No analytics-first chart language.
- No permanent redundant Now Playing menu system.
- Display one secondary information object at a time.
- Keep minimal state line.
- Keep bottom progress bar.
- Keep background/cover blur, veil, and vignette as the primary surface.

### 3. Broadcast Information Priority

Information should follow this priority order:

1. Currently playing audio
2. Currently playing playlist
3. Next playlist / next track / upcoming attraction
4. Optional past/present/future rail only during temporary presentation moments

The system should avoid displaying all four layers at once.

### 4. Playlist Definition Rule

A playlist card should define identity, not analytics.

Playlist metadata fields:

```ts
export type BroadcastPlaylistIdentity = {
  title: string;
  description: string;
  cover: string;
  trackCount: number;
  durationSeconds: number;
  createdAt: string;
};
```

Required visible playlist fields:

- title
- short description
- cover / blurred background
- duration
- track count

Optional / secondary:

- creation date
- next scheduled appearance
- playlist family / channel

### 5. Now Playing Rule

Now Playing should not become a second playlist card.

Required visible fields:

```ts
export type BroadcastNowPlayingState = {
  trackTitle: string;
  artistName: string;
  elapsedSeconds: number;
  durationSeconds: number;
  playlistTitle: string;
};
```

Display behavior:

- Keep Now Playing compact.
- Show current track duration/progress.
- Show playlist duration/progress separately only when needed.
- Avoid duplicating playlist title in multiple places.

### 6. Next / Upcoming Rule

Next is strongest as a temporary broadcast event.

Required behavior:

- The upcoming layer should appear as an interruption / preview.
- It should inform viewers what comes next.
- It should help viewers decide whether to keep watching or return later.
- It should not constantly occupy the primary view.

Suggested modes:

```ts
export type BroadcastSecondaryMode =
  | "none"
  | "now_playing"
  | "playlist_identity"
  | "next_up"
  | "upcoming_buffet"
  | "grid_preview";
```

Only one `BroadcastSecondaryMode` should be active at a time.

## Grid Layer Concept

The grid is a future AI / multi-PIP broadcast layer.

It should not be implemented as a heavy feature yet. This patch should introduce only the visual and structural foundation.

### Purpose

The grid forms a reusable broadcast grammar over the background layer.

Every grid square can become:

- its own screen
- part of a larger screen area
- a temporary playlist card area
- a preview window
- a PIP cell
- a fragmented motion surface
- a multi-sided polygon crop / mask area in later phases

### Key Rule

Grid dimensions must remain consistent within a mode.

Continuity in grid dimension turns chaotic PIPs into orchestrated broadcast tracks.

### Required Patch Behavior

Add a passive grid overlay component:

```txt
src/ui/BroadcastGridLayer.tsx
```

The component should:

- render a subtle grid over the broadcast background
- support fixed rows and columns
- support named regions made from multiple cells
- support low-opacity crosshair / registration-mark styling
- support disabled/default-off state
- avoid blocking interaction
- avoid replacing the main mood surface

### Suggested Types

```ts
export type BroadcastGridCell = {
  row: number;
  column: number;
};

export type BroadcastGridRegion = {
  regionId: string;
  label: string;
  cells: BroadcastGridCell[];
  role: "pip" | "card" | "preview" | "texture" | "empty";
};

export type BroadcastGridLayout = {
  layoutId: string;
  name: string;
  rows: number;
  columns: number;
  regions: BroadcastGridRegion[];
};
```

### Visual Direction

Use the supplied references as direction, not literal assets:

- dark technical grid
- registration marks
- minimal white/gray linework
- industrial broadcast labels
- subdued system-office typography
- temporary filter effects
- restrained animation

Avoid:

- bright game HUD styling
- busy cyberpunk neon overload
- permanent four-corner PIP clutter
- chart-like analytics language
- fake engineering labels that compete with playlist mood

## Required Files To Inspect

Claude / Codex should search for exact names before editing:

```bash
grep -R "BroadcastHudShell\|FlowCurveCanvas\|Now Playing\|Up Next\|hud-atmosphere-zone\|playlist" src
```

Likely files:

```txt
src/ui/BroadcastHudShell.tsx
src/ui/BroadcastCard.tsx
src/ui/BroadcastQueueRail.tsx
src/ui/BroadcastTransport.tsx
src/ui/FlowCurveCanvas.tsx
src/ui/FlowCurveEditor.tsx
src/styles.css
```

Do not assume these exact files exist. Search first.

## Implementation Scope

### A. Editor Top Bar Icon Compression

Convert editor top bar mode/status content into icon-based controls.

Acceptance criteria:

- Editor still exposes hidden/internal mode toggles.
- Text-heavy top bar content is removed or compressed.
- Flow Curve timeline remains visually dominant in editor.
- No loss of editor function.

### B. Broadcast Secondary Layer Controller

Create a single secondary presentation state.

Suggested file:

```txt
src/ui/BroadcastSecondaryLayer.tsx
```

Required behavior:

- Accepts a `mode` prop.
- Renders one information object at a time.
- Supports `now_playing`, `playlist_identity`, `next_up`, and `upcoming_buffet`.
- Falls back to `none` without visual residue.
- Does not render permanent duplicate Now Playing panels.

### C. Playlist Identity Card Cleanup

Simplify playlist card around identity.

Required fields:

- title
- description
- cover/background
- duration
- track count

Remove or hide:

- redundant Now Playing copy
- unnecessary internal metadata
- analytics-first language
- persistent queue duplication

### D. Queue Rail Behavior

Keep queue rail, but reduce its default role.

Required behavior:

- Rail may appear during `next_up` or `upcoming_buffet`.
- Rail should not constantly compete with main screen.
- Rail should preview upcoming playlist events.
- Rail should support optional past/present/future display, but only in secondary mode.

### E. Grid Layer Foundation

Add passive grid overlay component.

Required behavior:

- Default off or extremely subtle.
- Can be enabled through prop/class.
- Does not force four-corner PIP layout.
- Supports consistent rows/columns.
- Can visually combine cells into larger regions later.
- Uses minimal UI language and temporary filter effects.

## Non-Goals

Do not implement these in this patch:

- AI layout generation
- real multi-video PIP playback
- polygon masking engine
- schedule automation
- complex animation timeline editor
- new audio playback engine
- Flow Curve chart reintroduction into Broadcast HUD
- persistent full-screen analytics dashboard

## Acceptance Criteria

This patch passes when:

1. Editor top bar is icon-compressed and no longer reads as user-facing metadata.
2. Broadcast HUD has only one secondary information layer active at a time.
3. Now Playing does not duplicate playlist identity unnecessarily.
4. Playlist identity card shows title, description, cover/background, duration, and track count.
5. Queue rail is still available but no longer behaves like a permanent competing menu.
6. Next / Upcoming can appear as a temporary presentation layer.
7. Passive grid overlay exists and can be toggled without disrupting mood surface.
8. Grid styling uses subtle registration/grid language and does not become a loud HUD.
9. `FlowCurveCanvas` remains absent from default Broadcast HUD.
10. Flow-Curve Editor remains intact.
11. TypeScript build passes.

## Verification Checklist

Run:

```bash
npm run build
```

Then verify visually:

- Broadcast HUD default view: mood background dominates.
- Broadcast HUD default view: no default chart.
- Broadcast HUD default view: no redundant Now Playing menu stack.
- Now Playing mode: compact current track + progress.
- Playlist identity mode: title/description/cover/duration/track count.
- Next Up mode: temporary upcoming event card.
- Upcoming Buffet mode: short set of upcoming playlist choices.
- Grid preview mode: subtle grid overlay, no heavy PIP clutter.
- Editor: Flow Curve timeline remains visible and top bar is icon-compressed.

## Expected Result

PLAY Broadcast HUD should feel less like a dashboard and more like a broadcast surface.

The viewer sees a strong mood-first screen, then receives timed secondary information when needed: now playing, playlist identity, next attraction, or upcoming buffet.

The grid layer begins the future multi-PIP language without forcing the system into clutter.

## Implementation Guide

- **Where:** Start with `src/ui/BroadcastHudShell.tsx`, `src/ui/BroadcastCard.tsx`, queue/transport components, editor top bar component, and `src/styles.css`; add `src/ui/BroadcastSecondaryLayer.tsx` and `src/ui/BroadcastGridLayer.tsx` if missing.
- **What:** Run `grep -R "BroadcastHudShell\|FlowCurveCanvas\|Now Playing\|Up Next\|hud-atmosphere-zone\|playlist" src`, patch the Broadcast HUD to use one `BroadcastSecondaryMode`, compress the editor top bar into icons, then run `npm run build`.
- **Expect:** A mood-first Broadcast HUD with compact playback state, temporary upcoming/playlist presentation, subtle optional grid overlay, no default chart, and a clean TypeScript build.
