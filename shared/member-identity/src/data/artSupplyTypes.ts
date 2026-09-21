export type ArtMaterialId = "graphite" | "ink" | "marker" | "legacy-neutral";
export type ArtSupplyId = "pencil" | "pen" | "marker" | "eraser" | "legacy-stroke";

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

export const PENCIL_ERASER_SUPPLY = Object.freeze({
  id: "eraser" as const,
  targetMaterialId: "graphite" as const,
  defaultWidth: 28,
});

export function canEraseMaterial(supplyId: ArtSupplyId, materialId: ArtMaterialId): boolean {
  return supplyId === PENCIL_ERASER_SUPPLY.id && materialId === PENCIL_ERASER_SUPPLY.targetMaterialId;
}
