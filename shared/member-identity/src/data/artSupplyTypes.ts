export type ArtMaterialId = "graphite" | "legacy-neutral";
export type ArtSupplyId = "pencil" | "eraser" | "legacy-stroke";

export interface MarkMaterialIdentity {
  readonly supplyId: ArtSupplyId;
  readonly materialId: ArtMaterialId;
}

export interface PencilSupplySettings {
  readonly width: number;
  readonly opacity: number;
}

export const PENCIL_SUPPLY = Object.freeze({
  id: "pencil" as const,
  materialId: "graphite" as const,
  defaultSettings: Object.freeze({ width: 5, opacity: 0.82 }),
});

export const PENCIL_ERASER_SUPPLY = Object.freeze({
  id: "eraser" as const,
  targetMaterialId: "graphite" as const,
  defaultWidth: 28,
});

export function canEraseMaterial(supplyId: ArtSupplyId, materialId: ArtMaterialId): boolean {
  return supplyId === PENCIL_ERASER_SUPPLY.id && materialId === PENCIL_ERASER_SUPPLY.targetMaterialId;
}
