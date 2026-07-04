# 0621M_PLAY_MapRegionFeedSourceSelectorPatch_v1.0.0_PATCH

## Project

PLAY — Playlist / Scheduler / Smart Grid Broadcast System

## Patch Type

Stability / Architecture Preparation Patch

## Status

Draft for implementation

## Purpose

Replace the single `ENABLE_MAP_REGION_FEED` boolean with a typed map-region feed source selector so the Smart Grid can safely support multiple future WOS/map source types without committing to live WOS or Mapbox integration yet.

The map region should remain safe, default-off, OBS-friendly, and fully fallback-capable.

```text
Smart Grid owns the region.
MapRegionFeed owns the inner renderer.
The selected feed source decides what appears.
Unsupported or failed sources fall back to the static placeholder.
```

---

# Background

0621L proved that the Smart Grid can host map-like content inside a `map_placeholder` region without disrupting Broadcast HUD layout, schedule behavior, source-group isolation, or persistence.

However, 0621L used a single local boolean flag:

```ts
ENABLE_MAP_REGION_FEED = false
```

That is sufficient for a spike, but not enough for the next phase. The system needs to distinguish between several possible map feed sources.

---

# Product Rule

```text
WOS/map content must enter through Smart Grid regions, not as a new permanent HUD layer.
```

This patch does not change that rule.

---

# Core Requirement

Replace the boolean feed flag with a typed source selector.

Required source modes:

```ts
type MapRegionFeedSource =
  | "none"
  | "mock"
  | "snapshot"
  | "iframe"
  | "live_wos";
```

For this patch, only these modes need to render real behavior:

| Source | Required Behavior |
|---|---|
| `none` | Show the existing static `WOS / MAP` placeholder |
| `mock` | Show the deterministic mock SVG map from 0621L |

Future modes should be typed but fallback-safe:

| Source | 0621M Behavior |
|---|---|
| `snapshot` | Show placeholder / unsupported message, no crash |
| `iframe` | Show placeholder / unsupported message, no iframe yet |
| `live_wos` | Show placeholder / unsupported message, no live integration yet |

---

# Non-Goals

Do not implement:

- live Mapbox
- WOS iframe embed
- WOS fetch / API connection
- map controls
- token handling
- network requests
- user-facing feed settings UI unless already trivial
- drag / resize grid regions
- persistent feed preferences unless already low-risk
- OBS capture changes
- any playlist generation changes
- any scheduler logic changes

---

# Required Files / Areas

Likely files:

```text
src/ui/MapRegionFeed.tsx
src/ui/BroadcastGridLayer.tsx
src/data/smartGridTypes.ts
src/logic/smartGridResolver.ts
src/App.tsx
```

Optional new file:

```text
src/data/mapRegionFeedTypes.ts
```

or:

```text
src/ui/mapRegionFeedConfig.ts
```

Keep the change small. Prefer one config/type file only if it improves clarity.

---

# Data / Type Contract

Add a typed feed config:

```ts
export type MapRegionFeedSource =
  | "none"
  | "mock"
  | "snapshot"
  | "iframe"
  | "live_wos";

export type MapRegionFeedConfig = {
  source: MapRegionFeedSource;
};
```

Default config:

```ts
export const DEFAULT_MAP_REGION_FEED_CONFIG: MapRegionFeedConfig = {
  source: "none",
};
```

Development override may be local-only:

```ts
export const DEV_MAP_REGION_FEED_CONFIG: MapRegionFeedConfig = {
  source: "none",
};
```

The default committed state must be:

```ts
source: "none"
```

---

# Rendering Behavior

## `source: "none"`

Render the 0621K static placeholder:

```text
WOS / MAP
spatial feed placeholder
awaiting live world source
```

## `source: "mock"`

Render the 0621L deterministic mock SVG feed.

Requirements:

- no `Math.random`
- no network
- no iframe
- no controls
- `pointer-events: none`
- clipped to region
- reduced-motion safe
- clear label that this is a mock/spike feed

## Unsupported Future Sources

For `snapshot`, `iframe`, and `live_wos`, do not attempt to render real feeds yet.

Render a safe fallback:

```text
WOS / MAP
<source> source not connected
showing placeholder
```

No crash. No blank screen. No hidden failure.

---

# Error Handling

Keep or improve the 0621L try/catch guard around feed rendering.

If a feed renderer throws:

1. Catch the error.
2. Log a concise warning to console.
3. Render the static placeholder.
4. Do not break the Broadcast HUD.

Example warning:

```text
[PLAY] MapRegionFeed failed; falling back to placeholder.
```

---

# Smart Grid Integration Rules

Map feed rendering must only occur when all are true:

1. Broadcast HUD is active.
2. Smart Grid is toggled on via `⊞`.
3. The current Smart Grid composition includes a region with `regionType === "map_placeholder"`.
4. The source selector resolves to a supported rendering mode.

Do not render map content outside the Smart Grid region.

---

# Visual Requirements

- The feed must fill the assigned region.
- The feed must clip to the assigned region.
- The feed must not cover the bottom playback/program line.
- The feed must not introduce scrollbars.
- The feed must remain visually subordinate to the broadcast surface.
- Technical SVG region labels should remain suppressed for content-bearing regions.

---

# Acceptance Criteria

0621M passes when:

1. `ENABLE_MAP_REGION_FEED` boolean is removed or no longer controls rendering directly.
2. A typed `MapRegionFeedSource` exists.
3. Default committed source is `none`.
4. `none` renders the static placeholder.
5. `mock` renders the 0621L mock map feed.
6. `snapshot`, `iframe`, and `live_wos` do not crash and show fallback copy.
7. The feed only appears inside `map_placeholder` Smart Grid regions.
8. Grid remains off by default and `⊞`-gated.
9. `pointer-events: none` is preserved.
10. No network, Mapbox, iframe, or WOS live connection is added.
11. Broadcast HUD stage clearance remains intact.
12. Scheduler live clock still works.
13. Schedule preview and bumper card routing still work.
14. Playlist persistence and source-group isolation remain untouched.
15. TypeScript is clean.

---

# Verification Checklist

Run these browser checks:

## Default State

```text
source = "none"
grid off → no map feed
grid on + map_channel block → static WOS / MAP placeholder
```

## Mock State

Temporarily set:

```ts
source: "mock"
```

Confirm:

```text
grid on + map_channel block → mock SVG feed appears inside region
bottom row remains readable
no scrollbars
no pointer interaction
```

Then revert to:

```ts
source: "none"
```

## Future Source Fallbacks

Temporarily test:

```ts
source: "snapshot"
source: "iframe"
source: "live_wos"
```

Confirm each:

```text
fallback placeholder appears
no crash
no network request
no console error except optional concise unsupported-source warning
```

---

# Completion Report Requirements

Write completion report to the existing PLAY reports location used by the current 0621x build series.

Include:

- files changed
- source modes implemented
- default committed source value
- verification results for `none`
- verification results for `mock`
- fallback behavior for unsupported future sources
- confirmation that no live WOS / Mapbox / iframe integration was added
- confirmation that HUD, scheduler, persistence, and source-group behavior were not changed

---

# Implementation Guide

- **Where:** Update `MapRegionFeed.tsx`, `BroadcastGridLayer`, and a small feed config/type location such as `mapRegionFeedConfig.ts` or `mapRegionFeedTypes.ts`.
- **What:** Replace the boolean feed flag with `MapRegionFeedSource`, support `none` and `mock`, fallback safely for `snapshot`, `iframe`, and `live_wos`, then run `npm run build`.
- **Expect:** The Smart Grid map region can switch between placeholder and mock feed through a typed source selector, with future WOS/Mapbox sources represented safely but not yet integrated.
