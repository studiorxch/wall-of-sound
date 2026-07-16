// Passive broadcast grid overlay — registration marks + cell lines.
// Pointer-events none. Default off. Schedule-aware composition regions (0621H).

import { useRef, useState, useEffect, type ReactNode } from "react";
import type { SmartGridComposition, SmartGridRegion } from "../data/smartGridTypes";
import type { ResolvedSchedule } from "../data/scheduleTypes";
import type { PlaylistRecord } from "../data/playProjectTypes";
import { buildSchedulePreviewItems } from "../logic/scheduleResolver";
import { MapRegionFeed } from "./MapRegionFeed";
import { ACTIVE_MAP_REGION_FEED_CONFIG } from "./mapRegionFeedConfig";

function MapRegionContent() {
  // MapRegionFeed owns placeholder/mock/unsupported rendering; this only guards
  // against an unexpected throw and falls back to the static placeholder.
  try {
    return <MapRegionFeed {...ACTIVE_MAP_REGION_FEED_CONFIG} context="region" />;
  } catch (err) {
    if (import.meta.env?.DEV) console.warn("[PLAY] MapRegionFeed failed; falling back to placeholder.", err);
    return <MapRegionFeed source="none" wosUrl="" allowMockFallback={false} />;
  }
}

export type BroadcastGridCell = {
  row: number;
  column: number;
};

export type BroadcastGridRegion = {
  regionId: string;
  label: string;
  cells: BroadcastGridCell[];
  role: "pip" | "card" | "preview" | "texture" | "empty";
};

export type BroadcastGridLayout = {
  layoutId: string;
  name: string;
  rows: number;
  columns: number;
  regions: BroadcastGridRegion[];
};

type Props = {
  visible?: boolean;
  rows?: number;
  columns?: number;
  layout?: BroadcastGridLayout;
  composition?: SmartGridComposition;
  resolvedSchedule?: ResolvedSchedule;
  activePlaylist?: PlaylistRecord;
};

function fmtBlockDur(min: number): string {
  const h = Math.floor(min / 60), m = min % 60;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}

const ARM_PX  = 14; // crosshair arm length in absolute pixels — kept square at any viewport
const CORNER_PX = 22;
const INSET = 0.8; // region outline inset in viewBox %

// Region types that render user-facing HTML content (their SVG technical label
// is suppressed so it can't collide with the content's own labels).
const CONTENT_REGION_TYPES = new Set(["schedule_preview", "map_placeholder", "bumper_card"]);

export function BroadcastGridLayer({ visible = false, rows = 4, columns = 6, layout, composition, resolvedSchedule, activePlaylist }: Props) {
  if (!visible) return null;

  // Square crosshairs: measure container and compute arm lengths in viewBox % per axis.
  // ARM_PX is constant in pixels; the viewBox is 100×100 mapped to actual dimensions.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const overlayRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [armX, setArmX] = useState(1.4);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [armY, setArmY] = useState(1.4);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [crnX, setCrnX] = useState(2.2);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [crnY, setCrnY] = useState(2.2);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        setArmX((ARM_PX / width) * 100);
        setArmY((ARM_PX / height) * 100);
        setCrnX((CORNER_PX / width) * 100);
        setCrnY((CORNER_PX / height) * 100);
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Composition grid dims win so regions align to the drawn cells.
  const r = composition?.rows ?? layout?.rows ?? rows;
  const c = composition?.columns ?? layout?.columns ?? columns;

  const vLines = Array.from({ length: c - 1 }, (_, i) => ((i + 1) / c) * 100);
  const hLines = Array.from({ length: r - 1 }, (_, i) => ((i + 1) / r) * 100);

  // Composition regions (skip atmosphere — it's the whole surface, no outline).
  const regions = (composition?.regions ?? []).filter((rg) => rg.regionType !== "atmosphere");

  // Region content routing (0621K): each region type maps to its own renderer.
  // Schedule-preview reuses the 0621J live guide items.
  const previewItems = resolvedSchedule ? buildSchedulePreviewItems(resolvedSchedule, 1) : [];

  function renderRegionContent(rg: SmartGridRegion): ReactNode {
    switch (rg.regionType) {
      case "schedule_preview":
        if (previewItems.length === 0) return null;
        return (
          <div className="bgl-preview">
            {previewItems.map((item, i) => (
              <div key={i} className={`bgl-preview-item bgl-preview-${item.label.toLowerCase().replace(/\s+/g, "-")}`}>
                <span className="bgl-preview-label">{item.label}</span>
                <span className="bgl-preview-title" title={item.title}>{item.title}</span>
                {item.startTimeLabel && (
                  <span className="bgl-preview-time">
                    {item.startTimeLabel}{item.endTimeLabel ? ` – ${item.endTimeLabel}` : ""}
                  </span>
                )}
              </div>
            ))}
          </div>
        );

      case "map_placeholder":
        // Flag-gated mock feed (0621L) or static placeholder fallback.
        return <MapRegionContent />;

      case "bumper_card": {
        // Prefer the active scheduled block, fall back to the active playlist.
        const now = resolvedSchedule?.now ?? null;
        const title = now?.title ?? activePlaylist?.title;
        if (!title) return null;
        const tags = activePlaylist?.mood?.tags?.slice(0, 2).join(" / ");
        const durMin = now?.durationMinutes ?? activePlaylist?.targetDurationMinutes;
        const sub = [tags, durMin ? fmtBlockDur(durMin) : null].filter(Boolean).join(" · ");
        return (
          <div className="bgl-region-content bgl-bumper-card">
            <span className="bgl-rc-label">PROGRAM</span>
            <span className="bgl-rc-title" title={title}>{title}</span>
            {sub && <span className="bgl-rc-sub">{sub}</span>}
          </div>
        );
      }

      // atmosphere / program_line (lower_third): outline-only, no extra content.
      default:
        return null;
    }
  }

  return (
    <div className="bgl-overlay" aria-hidden="true" ref={overlayRef}>
      <svg className="bgl-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
        {/* Cell grid lines */}
        {vLines.map((x) => (
          <line key={`v${x}`} x1={x} y1={0} x2={x} y2={100} vectorEffect="non-scaling-stroke" className="bgl-line" />
        ))}
        {hLines.map((y) => (
          <line key={`h${y}`} x1={0} y1={y} x2={100} y2={y} vectorEffect="non-scaling-stroke" className="bgl-line" />
        ))}

        {/* Registration crosshairs — arm lengths computed in px to stay square at any aspect ratio */}
        {hLines.map((y) =>
          vLines.map((x) => (
            <g key={`reg_${x}_${y}`} className="bgl-reg">
              <line x1={x - armX} y1={y} x2={x + armX} y2={y} vectorEffect="non-scaling-stroke" />
              <line x1={x} y1={y - armY} x2={x} y2={y + armY} vectorEffect="non-scaling-stroke" />
            </g>
          ))
        )}

        {/* Corner registration brackets — pixel-based lengths to stay square */}
        {([
          [0, 0, 1, 1],
          [100, 0, -1, 1],
          [0, 100, 1, -1],
          [100, 100, -1, -1],
        ] as const).map(([x, y, sx, sy], i) => (
          <g key={`corner${i}`} className="bgl-corner">
            <line x1={x} y1={y} x2={x + sx * crnX} y2={y} vectorEffect="non-scaling-stroke" />
            <line x1={x} y1={y} x2={x} y2={y + sy * crnY} vectorEffect="non-scaling-stroke" />
          </g>
        ))}

        {/* Schedule-aware composition regions (0621H) */}
        {regions.map((rg) => {
          const x = ((rg.columnStart - 1) / c) * 100 + INSET;
          const w = (rg.columnSpan / c) * 100 - INSET * 2;
          const y = ((rg.rowStart - 1) / r) * 100 + INSET;
          const h = (rg.rowSpan / r) * 100 - INSET * 2;
          return (
            <g key={rg.regionId} className={`bgl-region bgl-region-${rg.regionType}`}>
              <rect
                x={x} y={y} width={Math.max(0, w)} height={Math.max(0, h)}
                vectorEffect="non-scaling-stroke"
                className="bgl-region-rect"
              />
              {/* Content regions render their own HTML labels below — suppress the SVG one */}
              {rg.label && !CONTENT_REGION_TYPES.has(rg.regionType) && (
                <text x={x + 1.2} y={y + 3.2} className="bgl-region-label">{rg.label}</text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Routed region content (0621K) — HTML overlay positioned over each content
          region. Router switches on region.regionType; still pointer-events: none. */}
      {regions.map((rg) => {
        const content = renderRegionContent(rg);
        if (!content) return null;
        const left = ((rg.columnStart - 1) / c) * 100;
        const top = ((rg.rowStart - 1) / r) * 100;
        const width = (rg.columnSpan / c) * 100;
        const height = (rg.rowSpan / r) * 100;
        // Only the mock feed fills + clips to the whole region; placeholder /
        // unsupported-source copy are text overlays sized to content.
        const isFeed = rg.regionType === "map_placeholder" && (ACTIVE_MAP_REGION_FEED_CONFIG.source === "mock" || ACTIVE_MAP_REGION_FEED_CONFIG.source === "wos_iframe");
        return (
          <div
            key={`content_${rg.regionId}`}
            className={`bgl-region-overlay${isFeed ? " bgl-region-overlay-feed" : ""}`}
            style={{
              left: `${left}%`, top: `${top}%`, width: `${width}%`,
              ...(isFeed ? { height: `${height}%` } : {}),
            }}
          >
            {content}
          </div>
        );
      })}
    </div>
  );
}
