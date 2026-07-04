# PLAY Patch 0622E — WOS Projection Source Spike
**Completion Report · 2026-06-23**

---

## Summary

Added the first real WOS projection path to PLAY's Smart Grid map region via `iframe` source. The `MapRegionFeedConfig` type now carries an optional `iframeUrl` and `label`. A new `IframeMapFeed` component renders a clipped, pointer-events-off iframe inside `map_placeholder` regions when `source === "iframe"`. Default committed config remains `source: "none"` — no iframe, no network, no WOS in the default build.

---

## Architecture

```
SCHEDULER resolves map_channel block → nowBlock.displayMode = "map_channel"
  → resolveSmartGridComposition() → preset "map_channel"
    → regionsForPreset() → map_placeholder region
      → BroadcastGridLayer → MapRegionContent
        → MapRegionFeed({ ...ACTIVE_MAP_REGION_FEED_CONFIG })
          → source === "none"    → MapPlaceholder (default)
          → source === "iframe"  → IframeMapFeed (0622E, opt-in)
          → source === "mock"    → MockMapFeed (0621L)
```

WOS does not enter PLAY's playlist, scheduler, playback, or editor state — only through the Smart Grid map region.

---

## Changed Files

### `src/ui/mapRegionFeedConfig.ts`

- Added `iframeUrl?: string` and `label?: string` to `MapRegionFeedConfig`.
- Added `DEV_WOS_IFRAME_FEED_CONFIG` preset (`source: "iframe"`, `iframeUrl: "http://localhost:5503/"`, `label: "WOS / IFRAME PREVIEW"`).
- Added `"iframe"` to `SUPPORTED_FEED_SOURCES`.
- `ACTIVE_MAP_REGION_FEED_CONFIG` and `DEV_MAP_REGION_FEED_CONFIG` remain `source: "none"`.

### `src/ui/MapRegionFeed.tsx`

- `MapRegionFeed` now accepts `MapRegionFeedConfig` (spread props) instead of `{ source: MapRegionFeedSource }`.
- Added `IframeMapFeed` component: renders a `<div class="mrf-iframe-shell">` with an `<iframe>` clipped to region bounds. Missing `iframeUrl` → `MapPlaceholder` fallback. `pointer-events: none`, `overflow: hidden`, `border: 0`.

### `src/ui/BroadcastGridLayer.tsx`

- `MapRegionContent` now passes `{...ACTIVE_MAP_REGION_FEED_CONFIG}` (full config spread) to `MapRegionFeed` instead of just `source`.
- `isFeed` flag (controls full-fill styling) updated to include `"iframe"` alongside `"mock"`.
- Removed the now-dead `MAP_FEED_SOURCE` module-level constant that was causing a runtime crash when referenced at line 198.

### `src/styles.css`

- Added `.mrf-iframe-shell` and `.mrf-iframe` rules: `position: absolute; inset: 0; overflow: hidden; pointer-events: none; width/height: 100%; border: 0`.

---

## How to Use (Dev Only)

To project a local WOS preview into the Smart Grid:

1. Start your WOS preview server (e.g. at `http://localhost:5503/`).
2. In `mapRegionFeedConfig.ts`, change:
   ```ts
   export const ACTIVE_MAP_REGION_FEED_CONFIG = DEV_WOS_IFRAME_FEED_CONFIG;
   ```
   or inline a custom URL in `DEV_WOS_IFRAME_FEED_CONFIG.iframeUrl`.
3. Open PLAY → Broadcast HUD → toggle Smart Grid (⊞).
4. With a `map_channel` schedule block active, the WOS iframe renders in the map region.
5. **Before committing:** revert `ACTIVE_MAP_REGION_FEED_CONFIG = DEFAULT_MAP_REGION_FEED_CONFIG`.

---

## Verification (browser, port 5173)

Test state: `map_channel` schedule block active (`displayMode: "map_channel"`, covering current time), default `source: "none"` config.

1. **Default state** (`source: "none"`): placeholder "WOS / MAP / spatial feed placeholder / awaiting live world source" renders in map region. `iframeCount: 0`. ✅
2. **No iframe in DOM**: `document.querySelectorAll('iframe').length === 0`. ✅
3. **No network requests to WOS**: `performance.getEntriesByType('resource').filter(r => r.name.includes('5503')).length === 0`. ✅
4. **Grid layout correct**: `map_channel` region fills upper area; bottom transport bar ("Not playing / My Mix · 0:00") visible. ✅
5. **No error boundary**: app loads and renders HUD without crash. ✅
6. **TypeScript build**: `npx tsc --noEmit` clean. ✅

Iframe-with-URL path source-verified: `IframeMapFeed` renders `<iframe src={iframeUrl} style={{pointerEvents:"none",...}}` inside `.mrf-iframe-shell` (absolute inset, overflow hidden). Browser sandbox security may block localhost cross-origin frames — this is expected behavior, not a bug.

---

## Do Not Reopen

- `iframe` is not the committed default — operator must explicitly opt in.
- No Mapbox token, no WOS runtime module, no live API connection.
- WOS is not a HUD layer; it enters only through Smart Grid map region.
- Grid remains off by default and `⊞`-gated.

---

## Patch Status: ✅ COMPLETE
