// 0715C_MUSIC_Loop_Workspace_Editing_And_Revision_Completion §5, §6 —
// subdivision snap. Locates the nearest subdivision-grid frame between two
// adjacent beat frames of the ALREADY-COMPUTED active MusicalGrid — never
// re-derives the beat-map/BPM detector's own output. A subdivision target
// is only ever interpolated between two frames the grid itself already
// placed within source bounds, so out-of-bounds markers are structurally
// impossible (§6's "do not create subdivision markers outside source
// bounds").

import type { MusicalGrid, SubdivisionSnapTarget } from "../../data/loopTypes";

const SUBDIVISIONS_PER_BEAT: Record<4 | 8 | 16 | 32, number> = {
  4: 1, 8: 2, 16: 4, 32: 8,
};

export function computeSubdivisionSnapTarget(
  targetFrame: number,
  grid: MusicalGrid,
  division: 4 | 8 | 16 | 32,
  sampleRate: number,
): SubdivisionSnapTarget | null {
  const beats = grid.beatFrames;
  if (beats.length < 2) return null;

  const perBeat = SUBDIVISIONS_PER_BEAT[division];
  const beatsPerBar = grid.meterNumerator || 4;

  let bestFrame = beats[0];
  let bestBeatIndex = 0;
  let bestSub = 0;
  let bestDist = Math.abs(beats[0] - targetFrame);

  for (let i = 0; i < beats.length - 1; i++) {
    const span = beats[i + 1] - beats[i];
    for (let k = 0; k < perBeat; k++) {
      const frame = Math.round(beats[i] + (k / perBeat) * span);
      const dist = Math.abs(frame - targetFrame);
      if (dist < bestDist) {
        bestDist = dist;
        bestFrame = frame;
        bestBeatIndex = i;
        bestSub = k;
      }
    }
  }
  // The final beat frame itself is a valid candidate (subdivision 0 of the
  // beat after the last interpolated span) — never extrapolated past it.
  const lastIdx = beats.length - 1;
  const lastDist = Math.abs(beats[lastIdx] - targetFrame);
  if (lastDist < bestDist) {
    bestDist = lastDist;
    bestFrame = beats[lastIdx];
    bestBeatIndex = lastIdx;
    bestSub = 0;
  }

  const bar = Math.floor(bestBeatIndex / beatsPerBar);
  const beatInBar = bestBeatIndex % beatsPerBar;

  return {
    frame: bestFrame,
    seconds: bestFrame / sampleRate,
    bar,
    beat: beatInBar,
    subdivision: bestSub,
    division,
  };
}
