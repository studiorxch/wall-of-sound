# PLAY Patch 0623A — WOS Local URL and Map Channel Direct Patch
**Completion Report · 2026-06-23**

---

## Summary

`Map Channel` now renders the real WOS local surface as the full-bleed Broadcast HUD wallpaper — no mock detour, no placeholder, no scheduler dependency. The committed default is `source: "wos_iframe"` pointing to `http://localhost:5500`. When WOS is not running, a clear "WOS LOCAL SURFACE UNAVAILABLE" message appears with the expected URL and restart instructions. Mock is no longer the wallpaper fallback unless `allowMockFallback: true` is explicitly set.

---

## Root Cause

After 0622G, `Map Channel` wallpaper resolved to `"mock"` for any non-iframe source — including `"none"`. This was correct as an offline development fallback, but the committed config needed to flip from `source: "none"` to `source: "wos_iframe"` to make Map Channel actually show WOS. The config schema also needed restructuring to carry `wosUrl` and `allowMockFallback` as first-class fields instead of ad-hoc optional strings.

---

## Changes

### `src/ui/mapRegionFeedConfig.ts` — full rewrite

New schema:

```ts
export const DEFAULT_WOS_LOCAL_URL = "http://localhost:5500";

export type MapRegionFeedSource = "wos_iframe" | "mock" | "none";

export type MapRegionFeedContext = "wallpaper" | "region";

export type MapRegionFeedConfig = {
  source: MapRegionFeedSource;
  wosUrl: string;
  allowMockFallback: boolean;
};

export const ACTIVE_MAP_REGION_FEED_CONFIG: MapRegionFeedConfig = {
  source: "wos_iframe",
  wosUrl: DEFAULT_WOS_LOCAL_URL,
  allowMockFallback: false,
};
```

Removed: `iframeUrl`, `label`, `DEV_MAP_REGION_FEED_CONFIG`, `DEV_WOS_IFRAME_FEED_CONFIG`, `SUPPORTED_FEED_SOURCES`, `resolveEffectiveMapFeedSource` (logic moved inline into `MapRegionFeed`).

Retained: `MapRegionFeedRenderContext` type alias (= `MapRegionFeedContext`), kept for backward compat with existing callers.

---

### `src/ui/MapRegionFeed.tsx` — rewrite

New wallpaper fallback chain (hard-coded, no helper function):

```
wallpaper context:
  source = "wos_iframe" + wosUrl present → WosIframeFeed (real WOS iframe)
  source = "wos_iframe" + wosUrl missing → WosUnavailable message
  source = "mock"                        → MockMapFeed
  source = "none" + allowMockFallback    → MockMapFeed
  source = "none"                        → WosUnavailable message

region context:
  source = "wos_iframe" + wosUrl → WosIframeFeed
  source = "wos_iframe" + no url → MapPlaceholder ("WOS iframe URL not configured")
  source = "mock"                → MockMapFeed
  source = "none"                → MapPlaceholder (static)
```

New components:
- `WosIframeFeed` — renders `<iframe className="map-region-feed__iframe" src={wosUrl} title="WOS Map Channel" loading="eager" />`
- `WosUnavailable` — "WOS LOCAL SURFACE UNAVAILABLE / Expected: http://localhost:5500 / Start WOS, then reload PLAY Broadcast HUD."

Removed: `IframeMapFeed` (replaced by `WosIframeFeed`), `resolveEffectiveMapFeedSource` call (logic now inline).

---

### `src/ui/BroadcastGridLayer.tsx` — two line fixes

1. `isFeed` guard updated: `"iframe"` → `"wos_iframe"` (matches new source type)
2. Error-fallback `<MapRegionFeed source="none" />` → `<MapRegionFeed source="none" wosUrl="" allowMockFallback={false} />` (new required props)

`BroadcastHudShell.tsx` required no changes — `isMapChannel` detection and `context="wallpaper"` spread were already correct from 0622F/G.

---

### `src/styles.css`

Added:

```css
/* 0623A — WOS Map Channel wallpaper iframe */
.map-region-feed__iframe {
  position: absolute; inset: 0;
  width: 100%; height: 100%;
  border: 0; display: block;
  pointer-events: none;
  background: #000;
}

/* 0623A — WOS unavailable fallback */
.mrf-unavailable { ... }
.mrf-unavailable-title { ... }
.mrf-unavailable-url { ... }
.mrf-unavailable-hint { ... }
```

Legacy `.mrf-iframe` kept (no callers in new code; removes safely in future cleanup patch).

---

## Effective Source Resolution Table

| Config source | `wosUrl` | `allowMockFallback` | Context | Renders |
|---|---|---|---|---|
| `"wos_iframe"` | present | — | `"wallpaper"` | **WOS iframe** ✅ |
| `"wos_iframe"` | missing | — | `"wallpaper"` | WOS unavailable message |
| `"mock"` | — | — | `"wallpaper"` | mock feed |
| `"none"` | — | `true` | `"wallpaper"` | mock feed |
| `"none"` | — | `false` | `"wallpaper"` | WOS unavailable message |
| `"wos_iframe"` | present | — | `"region"` | WOS iframe |
| `"wos_iframe"` | missing | — | `"region"` | placeholder (not configured) |
| `"mock"` | — | — | `"region"` | mock feed |
| `"none"` | — | — | `"region"` | static placeholder |

---

## TypeScript Verification

```bash
cd /Users/studio/Projects/wall-of-sound/play/flow-curve-builder
npx tsc --noEmit
# EXIT: 0 — clean
```

Pre-existing build errors (10 unused-var / missing-prop errors in `App.tsx`, `FlowCurveCanvas.tsx`, `ExportPanel.tsx`, etc.) are unchanged — not introduced or removed by this patch. They existed identically in the legacy path build before relocation.

---

## Manual Test Checklist

1. Start WOS at `http://localhost:5500`
2. `cd /Users/studio/Projects/wall-of-sound/play/flow-curve-builder && npm run dev`
3. Set playlist Presentation Mode = Map Channel
4. Open Broadcast HUD → confirm WOS appears full-bleed
5. Stop WOS → reload HUD → confirm "WOS LOCAL SURFACE UNAVAILABLE" message
6. Restart WOS → reload HUD → confirm WOS returns
7. Confirm transport bar and HUD controls remain readable over the iframe

---

## Invariants Preserved

- **0622F/G atmosphere routing**: `isMapChannel` detection in `BroadcastHudShell` unchanged; `context="wallpaper"` spread unchanged.
- **BroadcastGridLayer region path**: `context="region"` unchanged; Smart Grid `map_placeholder` behavior preserved.
- **No scheduler dependency**: `isMapChannel` reads only `playlist.broadcastIdentity?.presentationMode` — no schedule state, grid state, or secondary overlay consulted.
- **No postMessage / cross-origin fetch**: iframe is visual-only; no DOM inspection.
- **No PLAY/WOS runtime merge**: they remain separate subsystems; only an iframe boundary crosses.

---

## Patch Status: ✅ COMPLETE
