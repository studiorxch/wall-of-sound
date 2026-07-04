export type CurvePresetType =
  | "elegant_nested_arc"
  | "rolling_waves"
  | "mountain"
  | "valley_rebuild"
  | "ramp";

export type FlowPoint = {
  pointId: string;
  timePercent: number;
  energy: number;
};

export type FlowCurve = {
  curveId: string;
  name: string;
  presetType: CurvePresetType;
  targetDurationSeconds: number;
  points: FlowPoint[];
};
