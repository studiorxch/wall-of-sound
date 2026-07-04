// Smart Grid map-region feed + Map Channel wallpaper renderer (0623A).
// wallpaper context: wos_iframe → real WOS iframe; unavailable message if URL missing;
//                   mock only when allowMockFallback === true.
// region context: honors source as-is; placeholder is the safe default.

import type { MapRegionFeedConfig, MapRegionFeedRenderContext } from "./mapRegionFeedConfig";
import { DEFAULT_WOS_LOCAL_URL } from "./mapRegionFeedConfig";

// Mock geometry — deterministic (no Math.random) so renders are stable.
const BOROUGHS = [
  "20,18 46,12 58,30 44,48 22,44",
  "60,14 86,22 82,46 62,40",
  "24,52 50,54 46,80 26,78",
  "54,58 84,52 88,82 58,84",
];
const ROUTES = [
  "8,30 34,28 52,40 78,34 96,42",
  "16,70 40,60 60,66 84,58",
  "44,8 48,40 40,72 52,94",
];
const COORD_MARKS = [
  [18, 24], [70, 30], [40, 66], [78, 70], [52, 48],
];

function MapPlaceholder({ note }: { note?: string }) {
  return (
    <div className="bgl-region-content bgl-map-placeholder">
      <span className="bgl-rc-label">WOS / MAP</span>
      <span className="bgl-rc-title">{note ?? "spatial feed placeholder"}</span>
      <span className="bgl-rc-sub">{note ? "showing placeholder" : "awaiting live world source"}</span>
    </div>
  );
}

function WosUnavailable({ wosUrl }: { wosUrl?: string }) {
  const url = wosUrl || DEFAULT_WOS_LOCAL_URL;
  return (
    <div className="mrf-unavailable" aria-hidden="true">
      <span className="mrf-unavailable-title">WOS LOCAL SURFACE UNAVAILABLE</span>
      <span className="mrf-unavailable-url">Expected: {url}</span>
      <span className="mrf-unavailable-hint">Start WOS, then reload PLAY Broadcast HUD.</span>
    </div>
  );
}

function WosIframeFeed({ wosUrl }: { wosUrl: string }) {
  return (
    <div className="mrf-iframe-shell" aria-hidden="true">
      <iframe
        className="map-region-feed__iframe"
        src={wosUrl}
        title="WOS Map Channel"
        loading="eager"
      />
    </div>
  );
}

function MockMapFeed() {
  return (
    <div className="mrf-root" aria-hidden="true">
      <svg className="mrf-svg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
        {[12.5, 25, 37.5, 50, 62.5, 75, 87.5].map((p) => (
          <g key={p}>
            <line x1={p} y1={0} x2={p} y2={100} className="mrf-grid" vectorEffect="non-scaling-stroke" />
            <line x1={0} y1={p} x2={100} y2={p} className="mrf-grid" vectorEffect="non-scaling-stroke" />
          </g>
        ))}
        {BOROUGHS.map((pts, i) => (
          <polygon key={i} points={pts} className="mrf-borough" vectorEffect="non-scaling-stroke" />
        ))}
        {ROUTES.map((pts, i) => (
          <polyline key={i} points={pts} className="mrf-route" fill="none" vectorEffect="non-scaling-stroke" />
        ))}
        {COORD_MARKS.map(([x, y], i) => (
          <g key={i} className="mrf-mark">
            <line x1={x - 1.6} y1={y} x2={x + 1.6} y2={y} vectorEffect="non-scaling-stroke" />
            <line x1={x} y1={y - 1.6} x2={x} y2={y + 1.6} vectorEffect="non-scaling-stroke" />
          </g>
        ))}
        <line x1={0} y1={0} x2={100} y2={0} className="mrf-scan" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mrf-label">WOS / MAP FEED SPIKE</div>
    </div>
  );
}

/**
 * Source router for both Smart Grid map regions and Map Channel HUD wallpaper.
 *
 * wallpaper context fallback order:
 *   1. wos_iframe → real WOS iframe (wosUrl required)
 *   2. wosUrl missing → WosUnavailable message
 *   3. mock only when allowMockFallback === true
 *
 * region context:
 *   honors source as-is; none → placeholder.
 */
export function MapRegionFeed({
  source,
  wosUrl,
  allowMockFallback,
  context = "region",
}: MapRegionFeedConfig & { context?: MapRegionFeedRenderContext }) {
  if (context === "wallpaper") {
    if (source === "wos_iframe") {
      if (wosUrl) return <WosIframeFeed wosUrl={wosUrl} />;
      return <WosUnavailable wosUrl={wosUrl} />;
    }
    if (source === "mock") return <MockMapFeed />;
    if (allowMockFallback) return <MockMapFeed />;
    return <WosUnavailable wosUrl={wosUrl} />;
  }

  // region context
  if (source === "mock") return <MockMapFeed />;
  if (source === "wos_iframe") {
    if (wosUrl) return <WosIframeFeed wosUrl={wosUrl} />;
    return <MapPlaceholder note="WOS iframe URL not configured" />;
  }
  return <MapPlaceholder />;
}
