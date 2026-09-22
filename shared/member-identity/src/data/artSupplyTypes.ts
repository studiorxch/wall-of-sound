export type ArtMaterialId = "graphite" | "ink" | "marker" | "mop" | "legacy-neutral";
export type ArtSupplyId = "pencil" | "pen" | "marker" | "mop" | "eraser" | "legacy-stroke";

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

export const PENCIL_ERASER_SUPPLY = Object.freeze({
  id: "eraser" as const,
  targetMaterialId: "graphite" as const,
  defaultWidth: 28,
});

export function canEraseMaterial(supplyId: ArtSupplyId, materialId: ArtMaterialId): boolean {
  return supplyId === PENCIL_ERASER_SUPPLY.id && materialId === PENCIL_ERASER_SUPPLY.targetMaterialId;
}
