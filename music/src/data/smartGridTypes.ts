// Smart Grid composition (0621H).
// Scheduler decides WHAT plays; Smart Grid decides WHERE/HOW it appears as a
// subtle, non-interactive layout over the cleared Broadcast HUD surface.

export type SmartGridPreset =
  | "full_scene"
  | "lower_third"
  | "guide_preview"
  | "map_channel"
  | "bumper_card";

export type SmartGridRegionType =
  | "atmosphere"
  | "program_line"
  | "schedule_preview"
  | "map_placeholder"
  | "bumper_card";

export type SmartGridRegion = {
  regionId: string;
  regionType: SmartGridRegionType;
  columnStart: number; // 1-based
  columnSpan: number;
  rowStart: number;    // 1-based
  rowSpan: number;
  label?: string;
};

export type SmartGridComposition = {
  preset: SmartGridPreset;
  columns: number;
  rows: number;
  regions: SmartGridRegion[];
  activeBlockId?: string;
  nextBlockId?: string;
};

export const REGION_LABELS: Record<SmartGridRegionType, string> = {
  atmosphere:       "ATMOSPHERE",
  program_line:     "PROGRAM",
  schedule_preview: "NEXT",
  map_placeholder:  "WOS / MAP",
  bumper_card:      "BUMPER",
};
