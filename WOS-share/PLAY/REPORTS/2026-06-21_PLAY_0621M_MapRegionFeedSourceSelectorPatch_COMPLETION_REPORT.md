# PLAY Patch 0621M — Map Region Feed Source Selector
**Completion Report · 2026-06-21 · Architecture Preparation**

---

## Summary

Replaced the 0621L `ENABLE_MAP_REGION_FEED` boolean with a typed `MapRegionFeedSource` selector. The Smart Grid map region now switches between a static placeholder (`none`), the deterministic mock SVG feed (`mock`), and three future-but-safe sources (`snapshot` / `iframe` / `live_wos`) that render a clear fallback. Default committed source is `none`. No live WOS/Mapbox/iframe/network added.

```
Smart Grid owns the region · MapRegionFeed owns the renderer ·
selected source decides what appears · unsupported/failed → static placeholder
```

---

## Files Changed

### NEW: `src/ui/mapRegionFeedConfig.ts`
- `MapRegionFeedSource = "none" | "mock" | "snapshot" | "iframe" | "live_wos"`.
- `MapRegionFeedConfig = { source }`.
- `DEFAULT_MAP_REGION_FEED_CONFIG` and `DEV_MAP_REGION_FEED_CONFIG` — both committed as `source: "none"`.
- `SUPPORTED_FEED_SOURCES = Set(["mock"])`.
- `ACTIVE_MAP_REGION_FEED_CONFIG` — the resolved config the grid reads (the dev knob; default-off).

### `src/ui/MapRegionFeed.tsx`
- **Removed** `ENABLE_MAP_REGION_FEED` and `MapRegionFeedMode`.
- `MapRegionFeed({ source })` is now a source router:
  - `mock` → `<MockMapFeed />` (the 0621L deterministic SVG; no `Math.random`, no network, `pointer-events: none`, reduced-motion safe, labeled "WOS / MAP FEED SPIKE").
  - `none` → static `WOS / MAP · spatial feed placeholder · awaiting live world source`.
  - unsupported (`snapshot`/`iframe`/`live_wos`) → `WOS / MAP · <source> source not connected · showing placeholder`.
- Mock SVG extracted to internal `MockMapFeed`; placeholder/fallback extracted to internal `MapPlaceholder`.

### `src/ui/BroadcastGridLayer.tsx`
- Reads `ACTIVE_MAP_REGION_FEED_CONFIG.source` into `MAP_FEED_SOURCE`.
- `MapRegionContent()` renders `<MapRegionFeed source={MAP_FEED_SOURCE} />` inside a `try/catch`; on throw it warns (DEV) and renders `<MapRegionFeed source="none" />`.
- `isFeed` (full-region fill + clip) now keys on `MAP_FEED_SOURCE === "mock"` — only the mock fills the region; placeholder/fallback are content-sized text overlays.

No region-type renames (0621H/0621K names preserved). No persisted data, scheduler, persistence, or source-group changes.

---

## Source Modes Implemented

| Source | 0621M behavior |
|--------|----------------|
| `none` (default) | static WOS/MAP placeholder |
| `mock` | deterministic mock SVG feed (fills + clips to region) |
| `snapshot` | fallback: "snapshot source not connected / showing placeholder" |
| `iframe` | fallback: "iframe source not connected / showing placeholder" |
| `live_wos` | fallback: "live_wos source not connected / showing placeholder" |

**Default committed source: `none`** (both `DEFAULT_` and `DEV_` configs).

---

## Verification (browser, port 5173)

### `none` (default)
- ✅ Grid off → no map feed. Grid on + `map_channel` block → static placeholder (`WOS / MAP · spatial feed placeholder · awaiting live world source`); no `.mrf-root`. (criteria 3, 4)

### `mock` (temporarily, then reverted)
- ✅ Grid on → `.mrf-root` mock feed renders inside the region; no placeholder; `pointer-events: none`; "WOS / MAP FEED SPIKE" label. (criteria 5, 9)

### `iframe` (unsupported, temporarily, then reverted)
- ✅ Grid on → fallback copy "iframe source not connected / showing placeholder"; no feed; no error boundary; no crash; no network. (criterion 6)

### Reverted to `none`
- ✅ Placeholder returns; `source: "none"` confirmed in both committed configs.

### Fresh-server re-check
- ✅ Clean reload → placeholder, no feed, no error boundary, **no console errors**. (An earlier console showed stale-HMR `ENABLE_MAP_REGION_FEED is not defined` errors from a mid-edit bundle; `grep` confirms zero references remain in source and the fresh bundle is clean.)

### Preservation
- ✅ Grid off by default + `⊞`-gated; feed only inside `map_placeholder` regions (criteria 7, 8).
- ✅ schedule_preview + bumper_card routing unchanged (criterion 13).
- ✅ Live clock (0621I), persistence (0621C), source-group isolation (0621E), HUD stage clearance (0621D) untouched (criteria 11, 12, 14).
- ✅ `npx tsc --noEmit` clean; boolean fully removed (criteria 1, 15).

**Acceptance criteria 1–15: all met.**

---

## No Live Integration (by design)

No Mapbox, no token, no WOS fetch/iframe, no map controls, no network requests. `mock` is a self-contained deterministic SVG; `snapshot`/`iframe`/`live_wos` are **typed only** and render fallback copy. The `try/catch` in `MapRegionContent` plus the default-`none` config keep the region safe regardless of source.

---

## Confirmation of Unchanged Subsystems

Broadcast HUD layout, Scheduler logic + live clock, playlist persistence, and source-group isolation were not modified — only the map-region feed selection path changed.

---

## Follow-up

A future patch can implement one real source behind the same contract by adding it to `SUPPORTED_FEED_SOURCES` and a renderer branch (e.g. `snapshot` = static route image, `iframe` = WOS preview, `live_wos` = live feed). The region host, clipping, fallback, and selector are all in place.

---

## Patch Status: ✅ COMPLETE (default source = none)
