import type { Track } from "../data/trackTypes";
import type { TrackSlot } from "../data/playlistTypes";
import { getCamelotPenalty } from "./camelot";

export function scoreTrackForSlot(params: {
  track: Track;
  slot: TrackSlot;
  previousTrack?: Track;
  allTracks: Track[];
}): number {
  const { track, slot, previousTrack, allTracks } = params;

  const allBpms = allTracks.map((t) => t.bpm ?? 120);
  const minBpm = Math.min(...allBpms);
  const maxBpm = Math.max(...allBpms);
  const bpmRange = maxBpm - minBpm || 1;

  const energyDistance = Math.abs(track.energy - slot.targetEnergy);
  const bpmDistance = Math.abs((track.bpm ?? 120) - slot.targetBpm) / bpmRange;

  const camelotPenalty = previousTrack
    ? getCamelotPenalty(previousTrack.camelotKey ?? "", track.camelotKey ?? "") / 40
    : 0;

  const avgDuration = allTracks.reduce((s, t) => s + t.durationSeconds, 0) / allTracks.length;
  const durationPenalty = Math.abs(track.durationSeconds - avgDuration) / (avgDuration || 1);

  const artistRepeatPenalty = previousTrack?.artist === track.artist ? 1 : 0;

  return (
    energyDistance * 40 +
    bpmDistance * 25 +
    camelotPenalty * 25 +
    durationPenalty * 5 +
    artistRepeatPenalty * 5
  );
}
