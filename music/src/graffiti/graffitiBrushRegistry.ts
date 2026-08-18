// ── graffitiBrushRegistry ──────────────────────────────────────────────────────
// Maps a BrushId to its pure render function — the ONE place a new brush
// would be registered. graffitiCanvasRenderer.ts never switches on
// stroke.tool itself; it always dispatches through this table.

import type { BrushId, Stroke } from "./graffitiTypes";
import { renderMarkerStroke } from "./graffitiMarkerBrush";
import { renderFatcapStroke } from "./graffitiFatcapBrush";
import { renderMopStroke } from "./graffitiMopBrush";

export type BrushRenderer = (ctx: CanvasRenderingContext2D, stroke: Stroke, canvasWidthPx: number, canvasHeightPx: number) => void;

export const BRUSH_REGISTRY: Record<BrushId, BrushRenderer> = {
  marker: renderMarkerStroke,
  fatcap: renderFatcapStroke,
  mop: renderMopStroke,
};

export const BRUSH_LABELS: Record<BrushId, string> = {
  marker: "Marker",
  fatcap: "Fatcap",
  mop: "Mop",
};

export const BRUSH_IDS: BrushId[] = ["marker", "fatcap", "mop"];
