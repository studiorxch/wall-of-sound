# 0621L_PLAY_WOSMapRegionFeedSpike_v1.0.0_PATCH

## Project

PLAY — Playlist / Scheduler / Smart Grid Broadcast System

## Patch Type

Spike / guarded integration foundation

## Status

Ready for implementation

## Purpose

Mount a controlled map/world feed inside the existing Smart Grid `map_placeholder` region without disturbing Broadcast HUD, Scheduler, playlist persistence, or source-group isolation.

This patch is not full WOS integration. It is a safe host test proving that Smart Grid regions can contain map-like content behind a flag.

```text
PLAYLIST  = creates trusted program blocks
SCHEDULER = decides what is active and upcoming
SMART GRID = decides where content appears
MAP FEED  = one possible content source inside a grid region
```

## Product Rule

```text
The map feed must live inside Smart Grid territory.
It must not become a new HUD layer, permanent background takeover, or interactive map control surface.
```

## Background

0621K completed region-content routing:

- `schedule_preview` renders live Now / Next / Later content.
- `map_placeholder` renders a static WOS / MAP placeholder.
- `bumper_card` renders a program card.
- content-bearing regions suppress technical SVG labels.
- routing is based on `region.regionType`, not label text.

0621L should build directly on that foundation by replacing the `map_placeholder` content with a guarded map-like feed when enabled.

## Non-Negotiables

- Grid remains off by default and `⊞`-gated.
- Placeholder remains the fallback.
- No live WOS dependency is required to pass this patch.
- No Mapbox token dependency is required to pass this patch.
- No map controls.
- No drag / resize.
- No Scheduler behavior changes.
- No playlist persistence changes except if a feature flag is stored intentionally.
- No source-group behavior changes.
- No Broadcast HUD layout regression.
- All map feed content must remain clipped to the grid region.
- Default should be safe even if feed mounting fails.

## Recommended Implementation Strategy

### Phase 1 — Flag

Add a feature flag for map-region feed.

Recommended constant:

```ts
export const ENABLE_MAP_REGION_FEED = false;
```

A local constant is acceptable for this spike. Do not build a full settings system yet.

### Phase 2 — Component

Add a small component:

```text
src/ui/MapRegionFeed.tsx
```

Initial behavior:

- renders a mock WOS/map feed
- fills the region container
- uses `pointer-events: none`
- has no controls
- shows a small label such as `WOS / MAP FEED SPIKE`
- includes simple visual structure to prove clipping, scale, and readability

Acceptable mock visuals:

- abstract map grid
- route lines
- borough-like polygons
- scanline / coordinate marks
- muted motion-safe animated drift if already low-risk

Do not use external network resources in the spike.

### Phase 3 — Region Router

In `BroadcastGridLayer`, update the `map_placeholder` branch:

```text
if region.regionType === "map_placeholder":
  if ENABLE_MAP_REGION_FEED:
    render <MapRegionFeed />
  else:
    render existing WOS / MAP placeholder
```

Keep existing placeholder copy when disabled:

```text
WOS / MAP
spatial feed placeholder
awaiting live world source
```

### Phase 4 — Failure Safety

If the feed component errors or receives bad input, the app should not crash.

Preferred behavior:

- render fallback placeholder
- optionally `console.warn` in development

Do not introduce an error boundary unless one already exists nearby and can be reused cleanly.

## Data / Type Requirements

No new persisted data is required for this spike.

Optional, only if useful:

```ts
export type MapRegionFeedMode = "placeholder" | "mock" | "wos_embed";
```

Do not rename existing 0621H / 0621K region types.

## UI Requirements

When flag is off:

- behavior must match 0621K exactly.
- map region shows the static placeholder.

When flag is on:

- map-like content appears only inside `map_placeholder` regions.
- content is clipped to the region.
- no scrollbars.
- no pointer interaction.
- no map controls.
- no background takeover.
- secondary cards remain independent.
- bottom playback row remains readable.

## Acceptance Criteria

1. TypeScript build passes.
2. Grid remains off by default.
3. With grid off, no map feed is visible.
4. With grid on and flag off, existing WOS / MAP placeholder appears.
5. With grid on and flag on, `MapRegionFeed` appears inside the `map_placeholder` region.
6. Feed is clipped to the region and does not cover the whole HUD.
7. Feed has `pointer-events: none`.
8. No map controls are rendered.
9. No Mapbox / WOS network dependency is required.
10. `schedule_preview` still renders live Now / Next / Later content.
11. `bumper_card` still renders program content.
12. Scheduler live clock from 0621I still advances.
13. Playlist persistence from 0621C still survives reload.
14. Source-group isolation from 0621E remains untouched.
15. No console errors during normal use.

## Browser Verification Checklist

```text
1. Start app.
2. Confirm Broadcast HUD loads with grid off.
3. Toggle grid on.
4. Schedule or activate a map_channel block.
5. Confirm map_placeholder region appears.
6. With feed flag off, confirm existing placeholder appears.
7. Turn feed flag on.
8. Confirm mock map/feed appears inside the same region.
9. Confirm no scrollbars, no pointer capture, no controls.
10. Switch to guide_preview block.
11. Confirm schedule preview still works.
12. Switch to bumper block.
13. Confirm bumper card still works.
14. Hard refresh.
15. Confirm schedule + playlists persist.
```

## Out of Scope

- Real Mapbox integration
- Live WOS iframe/embed
- WOS repo coupling
- Map controls
- camera controls
- pointer interaction
- drag/resize grid regions
- recurring schedules
- playlist generation changes
- source-group rule changes
- HUD redesign

## Notes for Future Work

A future patch may replace the mock feed with one of these:

```text
1. iframe-style WOS preview
2. shared runtime bundle renderer
3. Mapbox mini-view
4. static route snapshot
5. OBS/browser-source route preview
```

Do not choose that architecture inside 0621L unless it is already trivial and safe.

## Implementation Guide

- **Where:** Add `src/ui/MapRegionFeed.tsx`; update `BroadcastGridLayer` region-content routing; add a small local feature flag or constants file if needed.
- **What:** Render a flagged mock map/world feed inside `map_placeholder` regions while preserving the existing WOS / MAP placeholder fallback.
- **Expect:** Smart Grid proves it can host WOS/map-like content in a controlled region without disrupting HUD clarity, schedule behavior, persistence, or source isolation.
