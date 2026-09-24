export type ArtMaterialId = "graphite" | "ink" | "marker" | "mop" | "spray" | "legacy-neutral";
export type ArtSupplyId = "pencil" | "pen" | "marker" | "mop" | "spray" | "eraser" | "legacy-stroke";

export interface MarkMaterialIdentity {
  readonly supplyId: ArtSupplyId;
  readonly materialId: ArtMaterialId;
}

export interface ArtSupplySettings {
  readonly width: number;
  readonly opacity: number;
}

export type PencilSupplySettings = ArtSupplySettings;

export const PENCIL_SUPPLY = Object.freeze({
  id: "pencil" as const,
  materialId: "graphite" as const,
  defaultSettings: Object.freeze({ width: 5, opacity: 0.82 }),
});

export const PEN_SUPPLY = Object.freeze({
  id: "pen" as const,
  materialId: "ink" as const,
  defaultSettings: Object.freeze({ width: 3, opacity: 0.95 }),
});

export const MARKER_SUPPLY = Object.freeze({
  id: "marker" as const,
  materialId: "marker" as const,
  defaultSettings: Object.freeze({ width: 16, opacity: 0.72 }),
});

/**
 * V3: Mop is the first supply whose material is deliberately distinct from
 * a uniform digital stroke -- broad default width and a lower default
 * opacity than Marker, so a single pass reads as translucent/wet and
 * repeated overlapping passes visibly accumulate toward full coverage (see
 * `resolveMopDabPlan` in the Blackbook renderer for the deposition
 * behavior this default is tuned against). Material stays "mop", never
 * "marker" -- a thicker Marker is not the same material identity.
 */
export const MOP_SUPPLY = Object.freeze({
  id: "mop" as const,
  materialId: "mop" as const,
  defaultSettings: Object.freeze({ width: 34, opacity: 0.55 }),
});

/**
 * V4: Spray's material is "spray" -- a coverage FIELD of many small
 * deposited particles around the authored path (see the aerosol engine in
 * `music/src/member/sprayDeposition.ts`), not a rendered path itself. The
 * default width is a footprint radius scale (a creative control, not a
 * physical nozzle dimension); opacity scales overall deposition strength,
 * not a flat canvas-wide alpha wrapper, so repeated passes still visibly
 * accumulate. Never represented as "marker" or "mop" material.
 */
export const SPRAY_SUPPLY = Object.freeze({
  id: "spray" as const,
  materialId: "spray" as const,
  defaultSettings: Object.freeze({ width: 24, opacity: 0.6 }),
});

export const PENCIL_ERASER_SUPPLY = Object.freeze({
  id: "eraser" as const,
  targetMaterialId: "graphite" as const,
  defaultWidth: 28,
});

export function canEraseMaterial(supplyId: ArtSupplyId, materialId: ArtMaterialId): boolean {
  return supplyId === PENCIL_ERASER_SUPPLY.id && materialId === PENCIL_ERASER_SUPPLY.targetMaterialId;
}

/**
 * Drawing Shell V1 -- canonical Art Supply presentation constants, the
 * single source both Map (`subwayMapPaintSurface.js`, a plain-JS
 * window.SBE runtime) and Blackbook (`blackbookRuntime.ts`, a Vite-built
 * module) now read instead of each keeping its own private, independently
 * drifting copy. Values are UNCHANGED from what both implementations
 * already used identically before this consolidation -- this is a
 * de-duplication, not a recalibration. Deliberately just data (order,
 * ranges, colors): no component, no DOM, no runtime coupling between the
 * two bundling environments.
 */
export type DrawingSupplyId = "pencil" | "pen" | "marker" | "mop" | "spray";

export const DRAWING_SUPPLY_ORDER: readonly DrawingSupplyId[] = Object.freeze(["pencil", "pen", "marker", "mop", "spray"]);

export interface DrawingWidthRange {
  readonly min: number;
  readonly max: number;
}

/** Calibration V1: each slider's own min/max so its middle lands in that instrument's own everyday useful range -- see PENCIL_SUPPLY etc.'s `defaultSettings.width` for the single starting value within this range. */
export const DRAWING_WIDTH_RANGES: Readonly<Record<DrawingSupplyId, DrawingWidthRange>> = Object.freeze({
  pencil: Object.freeze({ min: 2, max: 14 }),
  pen: Object.freeze({ min: 1, max: 10 }),
  marker: Object.freeze({ min: 6, max: 32 }),
  mop: Object.freeze({ min: 14, max: 54 }),
  spray: Object.freeze({ min: 8, max: 40 }),
});

/** Each material's own visually-distinct default ink color -- see mopDeposition.ts/strokeSmoothing.ts's own docs for why Mop's muted teal and Spray's punchy orange stay distinguishable from Marker's saturated pink at a glance. */
export const DRAWING_DEFAULT_COLORS: Readonly<Record<DrawingSupplyId, string>> = Object.freeze({
  pencil: "#171412",
  pen: "#101828",
  marker: "#d32852",
  mop: "#1c6e6e",
  spray: "#e2572b",
});
