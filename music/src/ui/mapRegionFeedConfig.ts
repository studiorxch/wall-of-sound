// Map-region feed config (0623A — direct WOS iframe path).
// Single source of truth for the WOS local URL and feed source.
//
// 0729_STUDIORICH_Navigation_Consolidation — same-origin path through the
// /wall-app proxy (vite.config.ts), not the standalone :5500 server.
// Absolute (not relative) because broadcastRouteSource.ts's toEmbedUrl()
// calls `new URL(base)`, which requires an absolute URL. localhost:5176 is
// the canonical MUSIC entry point.
export const DEFAULT_WOS_LOCAL_URL = "http://localhost:5176/wall-app/";

export type MapRegionFeedSource =
  | "wos_iframe"  // real WOS local surface via iframe
  | "mock"        // deterministic mock SVG feed (offline dev)
  | "none";       // static placeholder (safe default for region context)

export type MapRegionFeedContext = "wallpaper" | "region";

export type MapRegionFeedConfig = {
  source: MapRegionFeedSource;
  wosUrl: string;
  allowMockFallback: boolean;
};

/** Active config — wos_iframe is the committed default for Map Channel wallpaper. */
export const ACTIVE_MAP_REGION_FEED_CONFIG: MapRegionFeedConfig = {
  source: "wos_iframe",
  wosUrl: DEFAULT_WOS_LOCAL_URL,
  allowMockFallback: false,
};

// ── Render context ────────────────────────────────────────────────────────────

/** "wallpaper" = full-bleed HUD atmosphere surface.
 *  "region"    = Smart Grid map_placeholder cell — region-safe fallback OK. */
export type MapRegionFeedRenderContext = MapRegionFeedContext;
