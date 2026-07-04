# PLAY Patch 0622G — Map Channel Mock Fallback and Source UX Hotfix
**Completion Report · 2026-06-23**

---

## Summary

`Map Channel` is now a fully usable offline broadcast wallpaper mode. When the committed feed source is `none`, playlist-level Map Channel now renders the deterministic mock WOS/map feed (borough polygons, route lines, scanline animation) rather than the blank static placeholder. Smart Grid region behavior is unchanged — it still honors the configured source as-is. The fix is a two-value render context (`"wallpaper"` | `"region"`) that selects effective source independently of the committed config.

---

## Root Cause

After 0622F, `Map Channel` correctly routed to `MapRegionFeed` in the HUD atmosphere, but the component received `source: "none"` from the committed config and rendered the static placeholder — no visual map content. The committed safe default must stay `"none"` (no network), but the wallpaper context needs a visible offline fallback.

---

## Changes

### `src/ui/mapRegionFeedConfig.ts`

Added `MapRegionFeedRenderContext` type and `resolveEffectiveMapFeedSource` helper:

```ts
export type MapRegionFeedRenderContext = "region" | "wallpaper";

export function resolveEffectiveMapFeedSource(params: {
  configuredSource: MapRegionFeedSource;
  context: MapRegionFeedRenderContext;
  iframeUrl?: string;
}): MapRegionFeedSource {
  if (params.configuredSource === "iframe" && params.iframeUrl) return "iframe";
  if (params.context === "wallpaper") return "mock";
  return params.configuredSource;
}
```

Logic:
- iframe with URL → render iframe regardless of context
- wallpaper context → fall back to mock when live unavailable
- region context → honor configured source (preserves 0622E Smart Grid behavior)

### `src/ui/MapRegionFeed.tsx`

- Switched to importing `MapRegionFeedRenderContext` and `resolveEffectiveMapFeedSource` (dropped direct `SUPPORTED_FEED_SOURCES` reference).
- `MapRegionFeed` now accepts `context?: MapRegionFeedRenderContext` (default `"region"`).
- Resolves effective source via `resolveEffectiveMapFeedSource` before routing to renderer.

### `src/ui/BroadcastHudShell.tsx`

```diff
- <MapRegionFeed {...ACTIVE_MAP_REGION_FEED_CONFIG} />
+ <MapRegionFeed {...ACTIVE_MAP_REGION_FEED_CONFIG} context="wallpaper" />
```

### `src/ui/BroadcastGridLayer.tsx`

```diff
- return <MapRegionFeed {...ACTIVE_MAP_REGION_FEED_CONFIG} />;
+ return <MapRegionFeed {...ACTIVE_MAP_REGION_FEED_CONFIG} context="region" />;
```

---

## Effective Source Resolution Table

| Config source | Context | iframeUrl | Renders |
|---|---|---|---|
| `"none"` | `"wallpaper"` | — | mock feed ✅ (0622G) |
| `"none"` | `"region"` | — | placeholder (unchanged) |
| `"mock"` | either | — | mock feed |
| `"iframe"` | either | present | iframe |
| `"iframe"` | `"wallpaper"` | missing | mock feed |
| `"iframe"` | `"region"` | missing | placeholder |
| `"snapshot"`/`"live_wos"` | `"wallpaper"` | — | mock feed |
| `"snapshot"`/`"live_wos"` | `"region"` | — | placeholder + "not connected" |

---

## Verification (browser, port 5173)

**State:** playlist `presentationMode = "map_channel"`, committed config `source: "none"`.

1. **Mock feed renders in HUD atmosphere**: `.mrf-root` present = `true` ✅
2. **`hud-bg-map` wrapper present**: `true` ✅
3. **No static placeholder in HUD**: `.bgl-map-placeholder` = `false` ✅
4. **No iframe**: `0` ✅
5. **Smart Grid off**: `gridOff: true` ✅
6. **Transport bar visible**: `true` ✅
7. **No console errors** ✅
8. **TypeScript**: `npx tsc --noEmit` clean ✅

Screenshot confirms: full-bleed mock WOS/map visual (borough polygons, route lines, coordinate marks, scan animation, "WOS / MAP FEED SPIKE" label) fills HUD atmosphere. Bottom transport row "Not playing / My Mix · 0:00" clearly readable.

---

## Invariants Preserved

- **0622F atmosphere routing**: `isMapChannel` detection in `BroadcastHudShell` unchanged.
- **0622E Smart Grid region path**: `BroadcastGridLayer` passes `context="region"` — Smart Grid map-region behavior (placeholder when source is `none`) unchanged.
- **Committed config**: `ACTIVE_MAP_REGION_FEED_CONFIG = { source: "none" }` — no iframe, no network in default build.
- **0622A playback decoupling**: HUD playlist resolution via `hudPlaylist = playingPlaylist ?? activePlaylist` unchanged.
- **0621E source-group isolation**: no playlist/track logic touched.
- **Scheduler**: timing-only, not consulted for visual mode.

---

## Patch Status: ✅ COMPLETE
