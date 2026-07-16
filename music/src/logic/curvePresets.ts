import type { CurvePresetType, FlowCurve, FlowPoint } from "../data/flowCurveTypes";

let _pointCounter = 0;
function pid(): string {
  return `p_${++_pointCounter}_${Date.now().toString(36)}`;
}

function pts(pairs: [number, number][]): FlowPoint[] {
  return pairs.map(([t, e]) => ({ pointId: pid(), timePercent: t, energy: e }));
}

function curveId(): string {
  return `curve_${Date.now().toString(36)}`;
}

function estimateCurveCount(targetDurationSeconds: number, density: "low" | "medium" | "high"): number {
  const minutes = targetDurationSeconds / 60;
  const densityIndex = density === "low" ? 0 : density === "medium" ? 1 : 2;
  const table: [number, number, number, number][] = [
    [30, 1, 2, 3],
    [60, 2, 3, 4],
    [120, 4, 5, 6],
    [180, 5, 7, 9],
    [240, 7, 9, 12],
  ];

  let best = table[0];
  for (const row of table) {
    if (Math.abs(row[0] - minutes) < Math.abs(best[0] - minutes)) best = row;
  }
  if (minutes > 240) {
    const count = Math.round(minutes / 24);
    return Math.max(1, count + densityIndex);
  }
  return best[densityIndex + 1];
}

function buildNestedArcPoints(curveCount: number): FlowPoint[] {
  // Macro arc: gentle rise, peak around 65%, taper off. Nested local waves inside.
  const macroAt = (t: number) => {
    // Bell-ish arc peaking at ~0.65: rise fast, plateau, gradual drop
    if (t < 0.15) return 0.25 + t * 1.5;
    if (t < 0.65) return 0.47 + (t - 0.15) * 0.56;
    if (t < 0.85) return 0.75 - (t - 0.65) * 1.5;
    return 0.45 - (t - 0.85) * 1.5;
  };

  const waveDepth = 0.08;
  const rawPairs: [number, number][] = [];

  // start
  rawPairs.push([0, 0.2]);

  for (let i = 0; i < curveCount; i++) {
    const tStart = i / curveCount;
    const tEnd = (i + 1) / curveCount;
    const tMid = (tStart + tEnd) / 2;

    const macroBase = macroAt(tMid);
    // rise to peak of local wave
    rawPairs.push([tStart + (tEnd - tStart) * 0.35, macroBase + waveDepth]);
    // dip back
    rawPairs.push([tStart + (tEnd - tStart) * 0.75, macroBase - waveDepth]);
  }

  rawPairs.push([1, 0.15]);

  return pts(rawPairs);
}

function buildRollingWavesPoints(curveCount: number): FlowPoint[] {
  const pairs: [number, number][] = [[0, 0.3]];
  for (let i = 0; i < curveCount; i++) {
    const tStart = i / curveCount;
    const tEnd = (i + 1) / curveCount;
    pairs.push([tStart + (tEnd - tStart) * 0.5, 0.75]);
    pairs.push([tEnd, 0.35]);
  }
  return pts(pairs);
}

function buildMountainPoints(): FlowPoint[] {
  return pts([[0, 0.2], [0.25, 0.5], [0.5, 0.85], [0.65, 0.9], [0.8, 0.6], [1, 0.25]]);
}

function buildValleyRebuildPoints(curveCount: number): FlowPoint[] {
  const half = Math.ceil(curveCount / 2);
  const pairs: [number, number][] = [[0, 0.7]];
  for (let i = 0; i < half; i++) {
    const t = (i + 1) / curveCount;
    pairs.push([t, Math.max(0.2, 0.7 - (i + 1) * (0.5 / half))]);
  }
  for (let i = half; i < curveCount; i++) {
    const t = (i + 1) / curveCount;
    pairs.push([t, 0.2 + ((i - half + 1) / (curveCount - half)) * 0.65]);
  }
  return pts(pairs);
}

function buildRampPoints(): FlowPoint[] {
  return pts([[0, 0.1], [0.2, 0.25], [0.5, 0.55], [0.75, 0.75], [0.9, 0.87], [1, 0.95]]);
}

export function generateFlowCurve(params: {
  presetType: CurvePresetType;
  targetDurationSeconds: number;
  curveDensity: "low" | "medium" | "high";
}): FlowCurve {
  const { presetType, targetDurationSeconds, curveDensity } = params;
  const curveCount = estimateCurveCount(targetDurationSeconds, curveDensity);
  const presetNames: Record<CurvePresetType, string> = {
    elegant_nested_arc: "Elegant Nested Arc",
    rolling_waves: "Rolling Waves",
    mountain: "Mountain",
    valley_rebuild: "Valley Rebuild",
    ramp: "Ramp",
  };

  let points: FlowPoint[];
  switch (presetType) {
    case "rolling_waves":
      points = buildRollingWavesPoints(curveCount);
      break;
    case "mountain":
      points = buildMountainPoints();
      break;
    case "valley_rebuild":
      points = buildValleyRebuildPoints(curveCount);
      break;
    case "ramp":
      points = buildRampPoints();
      break;
    case "elegant_nested_arc":
    default:
      points = buildNestedArcPoints(curveCount);
      break;
  }

  return {
    curveId: curveId(),
    name: presetNames[presetType],
    presetType,
    targetDurationSeconds,
    points,
  };
}
