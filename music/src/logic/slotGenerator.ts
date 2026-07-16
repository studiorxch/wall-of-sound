import type { Track } from "../data/trackTypes";
import type { FlowCurve } from "../data/flowCurveTypes";
import type { TrackSlot } from "../data/playlistTypes";
import { sampleCurveEnergy } from "./curveSampler";

export function generateTrackSlots(params: {
  curve: FlowCurve;
  tracks: Track[];
  targetDurationSeconds: number;
}): TrackSlot[] {
  const { curve, tracks, targetDurationSeconds } = params;
  if (tracks.length === 0) return [];

  const avgDuration = tracks.reduce((s, t) => s + t.durationSeconds, 0) / tracks.length;
  const slotCount = Math.min(
    Math.max(1, Math.floor(targetDurationSeconds / avgDuration)),
    tracks.length
  );

  const bpms = tracks.map((t) => t.bpm ?? 120);
  const minBpm = Math.min(...bpms);
  const maxBpm = Math.max(...bpms);

  return Array.from({ length: slotCount }, (_, i) => {
    const timePercent = slotCount === 1 ? 0.5 : i / (slotCount - 1);
    const startTimeSeconds = (i / slotCount) * targetDurationSeconds;
    const targetEnergy = sampleCurveEnergy(curve, timePercent);
    const targetBpm = minBpm + targetEnergy * (maxBpm - minBpm);

    return {
      slotId: `slot_${i}`,
      slotIndex: i,
      startTimeSeconds,
      targetEnergy,
      targetBpm,
      assignedTrackId: undefined,
      warningLevel: "none",
      warningMessages: [],
    };
  });
}
