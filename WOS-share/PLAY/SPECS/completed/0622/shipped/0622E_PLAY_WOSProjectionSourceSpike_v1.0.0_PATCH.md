# 0622E_PLAY_WOSProjectionSourceSpike_v1.0.0_PATCH

## Project

PLAY — Programmable Music Channel System

## Patch Type

WOS Projection Source Spike

## Status

Draft for implementation

## Purpose

Test the first real WOS projection path inside the existing PLAY Smart Grid map region without merging PLAY and WOS runtimes.

The goal is to prove that WOS can be projected into PLAY as a visual source while PLAY remains responsible for playlist authoring, scheduling, Smart Grid layout, and Broadcast HUD presentation.

```text
PLAYLIST  = creates trusted program blocks
SCHEDULER = decides what is active / next
SMART GRID = routes visual content into regions
WOS/MAP   = feed source inside the Smart Grid map region
```

## Product Rule

```text
WOS enters PLAY through Smart Grid regions.
WOS must not become a new permanent HUD layer.
WOS must not take over playlist, scheduler, playback, or editor state.
```

## Current Context

0621K–0621M prepared the WOS/MAP lane:

- `map_placeholder` regions exist inside Smart Grid composition.
- `MapRegionFeed` can render placeholder or mock map feed.
- `MapRegionFeedSource` is typed as:

```ts
type MapRegionFeedSource =
  | "none"
  | "mock"
  | "snapshot"
  | "iframe"
  | "live_wos";
```

- Default source is still `none`.
- `mock` proves the region can host map-like visual content.
- `iframe`, `snapshot`, and `live_wos` are typed future states with safe fallback.

0622E should activate the first real projection path through `iframe` only.

## Scope

### Included

- Add an `iframe` renderer path to `MapRegionFeed`.
- Add configurable local WOS preview URL.
- Render iframe only inside `map_placeholder` Smart Grid regions.
- Keep `none` as the committed default source.
- Keep placeholder fallback when source is `none` or URL is missing.
- Keep unsupported source fallback for `snapshot` and `live_wos`.
- Keep `pointer-events: none` for iframe/map feed by default.
- Ensure iframe clips to region bounds.
- Ensure iframe cannot create scrollbars in Broadcast HUD.
- Ensure grid remains off-by-default and `⊞` gated.
- Confirm schedule-driven `map_channel` layout can host the iframe region.

### Excluded

- Do not add Mapbox tokens to PLAY.
- Do not import WOS runtime modules directly.
- Do not add live WOS API connection.
- Do not add map controls.
- Do not make WOS source default.
- Do not make the grid permanent.
- Do not change scheduler logic.
- Do not change playlist playback.
- Do not change source-group isolation.
- Do not change Flow Curve behavior.

## Recommended Configuration

Create or extend the existing map feed config file.

Suggested shape:

```ts
export type MapRegionFeedSource =
  | "none"
  | "mock"
  | "snapshot"
  | "iframe"
  | "live_wos";

export type MapRegionFeedConfig = {
  source: MapRegionFeedSource;
  iframeUrl?: string;
  label?: string;
};

export const DEFAULT_MAP_REGION_FEED_CONFIG: MapRegionFeedConfig = {
  source: "none",
};

export const DEV_WOS_IFRAME_FEED_CONFIG: MapRegionFeedConfig = {
  source: "iframe",
  iframeUrl: "http://localhost:5503/",
  label: "WOS / IFRAME PREVIEW",
};

export const ACTIVE_MAP_REGION_FEED_CONFIG: MapRegionFeedConfig =
  DEFAULT_MAP_REGION_FEED_CONFIG;
```

Use the actual WOS local URL only if known. If not known, leave the dev config as a clearly editable placeholder.

## Iframe Renderer Behavior

When `source === "iframe"`:

1. If `iframeUrl` is missing or blank, render fallback:

```text
WOS / MAP
iframe source not configured
showing placeholder
```

2. If `iframeUrl` exists, render an iframe inside the region.

3. Iframe must be:

```text
positioned inside the map region
width: 100%
height: 100%
border: 0
overflow: hidden by parent
pointer-events: none
```

4. The iframe should use a descriptive title:

```text
WOS map preview
```

5. Do not assume the iframe loaded successfully. Keep a visible small label / fallback shell if the frame cannot load due to browser security, localhost mismatch, or missing server.

## Safety Requirements

- Default committed config must remain `source: "none"`.
- `iframe` must require deliberate local config change.
- Missing iframe URL must not crash.
- Invalid iframe URL must not crash.
- If the iframe fails visually, the HUD must remain usable.
- No network request should happen in the default committed config.
- No user interaction should pass into the iframe by default.

## Acceptance Criteria

1. With default config `source: "none"`, the existing static WOS/MAP placeholder appears.
2. With dev config `source: "iframe"` and missing URL, placeholder fallback appears.
3. With dev config `source: "iframe"` and local WOS URL, iframe renders inside `map_placeholder` region.
4. Iframe is clipped to the Smart Grid region.
5. Iframe does not create HUD scrollbars.
6. Iframe does not receive pointer events by default.
7. Smart Grid remains off by default and toggled by `⊞`.
8. `schedule_preview` and `bumper_card` region content still work.
9. Scheduler live clock still works.
10. Playback remains decoupled from editor selection.
11. Source-group isolation remains unchanged.
12. TypeScript build passes.
13. No console errors on default `none` config.

## Verification Plan

### Default State

```text
1. Confirm ACTIVE_MAP_REGION_FEED_CONFIG.source === "none".
2. Open Broadcast HUD.
3. Toggle Smart Grid.
4. Confirm WOS/MAP placeholder appears for map region.
5. Confirm no iframe/network attempt.
```

### Iframe Missing URL

```text
1. Temporarily set source to "iframe" with no iframeUrl.
2. Open Broadcast HUD.
3. Toggle Smart Grid.
4. Confirm fallback copy appears.
5. Confirm no crash.
```

### Iframe Local URL

```text
1. Start WOS preview server if available.
2. Set source to "iframe" and iframeUrl to the local WOS preview URL.
3. Open Broadcast HUD.
4. Toggle Smart Grid with a map_channel schedule block active.
5. Confirm WOS preview renders inside map region.
6. Confirm bottom playback/program line remains visible.
7. Confirm no scrollbars or controls appear.
```

### Revert

```text
1. Revert ACTIVE_MAP_REGION_FEED_CONFIG to DEFAULT_MAP_REGION_FEED_CONFIG.
2. Confirm source is "none" before final build.
3. Run TypeScript build.
```

## Do Not Reopen

- Do not turn this into direct WOS runtime integration.
- Do not add Mapbox token management to PLAY.
- Do not add interactive map controls.
- Do not make WOS visible unless grid is toggled on.
- Do not make iframe source the committed default.

## Implementation Guide

- **Where:** Update `src/ui/MapRegionFeed.tsx`, `src/ui/BroadcastGridLayer.tsx`, and `src/config/mapRegionFeedConfig.ts` or the existing map feed config file.
- **What:** Add `iframe` source rendering inside `map_placeholder`, preserve `none` default, keep placeholder fallback for missing/unsupported sources, and test iframe clipping inside the Smart Grid region.
- **Expect:** PLAY can safely project a local WOS preview into the Smart Grid map region without changing playback, scheduler, playlist, or HUD architecture.
