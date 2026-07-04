# 0622G_PLAY_MapChannelMockFallbackAndSourceUXHotfix_v1.0.0_PATCH

## Project

PLAY — Programmable Music Channel System

## Patch Type

Hotfix / UX correction

## Status

Draft for implementation

## Purpose

Make `Map Channel` immediately useful as a playlist-level Broadcast HUD wallpaper mode, even when live WOS / iframe projection is not configured.

0622F correctly proved that the playlist `Presentation Mode: Map Channel` dropdown can divert Broadcast HUD from the normal background image path into the map/WOS visual path. However, the visible result is currently only the static placeholder when the map feed source is `none`.

That is not enough for the current offline working mode.

The offline expectation is:

```text
Presentation Mode = Map Channel
↓
Broadcast HUD
↓
Map-like visual appears as the full-bleed atmosphere surface
```

No scheduler should be required. No Smart Grid toggle should be required.

---

## Product Correction

`Map Channel` is a playlist visual mode, not only a scheduled grid mode.

The scheduler decides when a playlist/program is active. It does not own visual identity. The playlist defines its intended visual source. The Smart Grid may later arrange that source, but the Broadcast HUD should be able to render the playlist's visual mode directly.

```text
Playlist defines audio + visual intent.
Scheduler defines timing.
Smart Grid defines layout/composition.
Broadcast HUD renders the current output surface.
```

---

## Current Problem

Current behavior after 0622F:

```text
Playlist Identity → Presentation Mode = Map Channel
Broadcast HUD → map layer selected
Map feed source = none
Result → blank/static WOS/MAP placeholder
```

This proves routing, but it does not provide a usable map-style wallpaper.

---

## Required Behavior

When a playlist is set to `Map Channel`, Broadcast HUD must show a map-like visual without requiring live WOS.

Priority for HUD wallpaper rendering:

```text
1. If map feed source is iframe and a usable iframe URL exists → render iframe WOS preview.
2. Else render deterministic mock WOS/map feed.
3. Else render static WOS/MAP placeholder only as final fallback.
```

The mock feed from 0621L should become the offline fallback for playlist-level `map_channel` wallpaper mode.

---

## In Scope

- Update playlist-level Map Channel wallpaper behavior.
- Reuse the existing `MapRegionFeed` renderer.
- Add or expose a context/mode for `MapRegionFeed` if needed:
  - `region` context: preserve existing source behavior for Smart Grid regions.
  - `wallpaper` context: prefer visible offline map fallback.
- If the active source is `none`, render mock feed for HUD wallpaper mode.
- Preserve existing static placeholder for Smart Grid region mode when source is `none`, unless explicitly selected otherwise.
- Keep `iframe` supported when local WOS URL is configured.
- Preserve bottom transport row readability.
- Preserve top operator row readability.
- Preserve Broadcast HUD stage clearance.
- Preserve scheduler behavior.
- Preserve Smart Grid off-by-default behavior.

---

## Out of Scope

- Do not add live WOS runtime integration.
- Do not add Mapbox token handling to PLAY.
- Do not add map controls.
- Do not make iframe the committed default.
- Do not require Scheduler for Map Channel.
- Do not require Smart Grid for Map Channel.
- Do not change playback state architecture.
- Do not change source-group isolation.

---

## Suggested Implementation

### 1. Add Feed Render Context

In the map feed component or config layer, introduce a small render context if useful:

```ts
export type MapRegionFeedRenderContext = "region" | "wallpaper";
```

Usage intent:

```text
region    = Smart Grid map region; safe default may stay placeholder.
wallpaper = playlist-level Broadcast HUD background; should show mock when live source is unavailable.
```

### 2. Resolve Effective Source

Add a helper similar to:

```ts
export function resolveEffectiveMapFeedSource(params: {
  configuredSource: MapRegionFeedSource;
  context: MapRegionFeedRenderContext;
  iframeUrl?: string;
}): MapRegionFeedSource {
  if (params.configuredSource === "iframe" && params.iframeUrl) {
    return "iframe";
  }

  if (params.context === "wallpaper") {
    return "mock";
  }

  return params.configuredSource;
}
```

This preserves the committed safe default while making playlist-level Map Channel visually useful offline.

### 3. Keep Placeholder as Final Fallback

If mock feed throws or cannot mount, fallback to the existing placeholder:

```text
WOS / MAP
spatial feed placeholder
awaiting live world source
```

### 4. Broadcast HUD Use

In `BroadcastHudShell`, when playlist presentation mode is `map_channel`, render:

```tsx
<MapRegionFeed context="wallpaper" />
```

or equivalent.

### 5. Smart Grid Use

In `BroadcastGridLayer`, keep region behavior:

```tsx
<MapRegionFeed context="region" />
```

or equivalent.

---

## Acceptance Criteria

1. Set any playlist's Presentation Mode to `Map Channel`.
2. Open Broadcast HUD.
3. A map-like mock WOS visual appears as the full-bleed atmosphere surface.
4. No Scheduler block is required.
5. No Smart Grid toggle is required.
6. Bottom transport row remains visible and readable.
7. Top operator row remains visible and readable.
8. If local WOS iframe config is selected and URL is available, iframe renders instead of mock.
9. If iframe config is missing/unsupported, mock renders rather than blank placeholder.
10. Static placeholder remains available as final fallback.
11. Smart Grid map region behavior from 0622E remains intact.
12. TypeScript passes.
13. No console errors on fresh dev-server load.

---

## Testing Checklist

### Offline Wallpaper Test

```text
1. Leave committed map feed config as source: "none".
2. Set playlist Presentation Mode to Map Channel.
3. Open Broadcast HUD.
4. Confirm mock WOS/map visual fills the HUD atmosphere surface.
5. Confirm transport bar remains visible.
6. Confirm no scheduler/grid is needed.
```

### Smart Grid Regression Test

```text
1. Toggle Smart Grid on with ⊞.
2. Use a map_channel grid composition.
3. Confirm existing map region path still works.
4. Confirm no permanent HUD takeover occurs.
```

### Iframe Local Test

```text
1. Start local WOS preview server.
2. Locally set map feed source to iframe with the WOS preview URL.
3. Open Broadcast HUD with Map Channel playlist.
4. Confirm iframe renders in the wallpaper surface.
5. Revert committed config to source: "none" before finalizing.
```

---

## Future-Safe Precedence Rule

When normal programming runs later, visual source resolution should follow:

```text
1. Playing playlist visual mode, if playback is active.
2. Scheduled NOW playlist visual mode, only when scheduler playback handoff is explicitly armed.
3. Editor-selected playlist visual mode, only when nothing is playing.
4. Default background image / cover blur fallback.
```

Do not let Scheduler become the visual identity owner.

---

## Implementation Guide

- **Where:** `src/ui/MapRegionFeed.tsx`, `src/ui/BroadcastHudShell.tsx`, `src/ui/BroadcastGridLayer.tsx`, `src/config/mapRegionFeedConfig.ts`, and related CSS in `src/styles.css`.
- **What:** Add a wallpaper context/effective-source fallback so playlist-level `Map Channel` renders mock WOS/map visuals when live iframe is unavailable, while preserving existing Smart Grid map-region behavior.
- **Expect:** `Map Channel` behaves like a useful offline broadcast wallpaper immediately: no scheduler, no grid toggle, no live WOS dependency, no blank placeholder.
