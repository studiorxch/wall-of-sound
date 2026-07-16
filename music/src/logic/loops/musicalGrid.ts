// 0714T_MUSIC_Musical_Grid_Editor_And_Segment_Timeline — musical grid
// construction and manual-correction operations (§6, §11-§17). Pure logic
// only: reuses the existing beat-map detector's trust decision verbatim
// (isBeatMapTrustedForAnalysis) and never retunes it. Every manual
// operation returns a NEW MusicalGrid (immutable) — callers are
// responsible for wrapping it in a MusicalGridRevision (§17) so detector
// evidence is retained, never overwritten in place.

import type { TrackBeatMap } from "../../data/beatMapTypes";
import type { MusicalGrid } from "../../data/loopTypes";
import { isBeatMapTrustedForAnalysis } from "../beatMap/beatMapTrust";
import { secondsToFrame, frameToSeconds } from "./loopSegmentation";

const BEATS_PER_BAR = 4;

// §7 — regenerates beat/bar frame arrays from bpm + origin, purely from
// spacing math (frame-authoritative, per §6 "Do not generate ruler marks
// from rounded display seconds" — this never rounds intermediate values).
function regenerateSpacingFrames(
  bpm: number, originSeconds: number, windowEndSeconds: number, sampleRate: number,
): { beatFrames: number[]; barFrames: number[] } {
  const beatFrames: number[] = [];
  const barFrames: number[] = [];
  if (bpm <= 0 || windowEndSeconds <= originSeconds) return { beatFrames, barFrames };
  const secondsPerBeat = 60 / bpm;
  let i = 0;
  let t = originSeconds;
  while (t <= windowEndSeconds) {
    const frame = secondsToFrame(t, sampleRate);
    beatFrames.push(frame);
    if (i % BEATS_PER_BAR === 0) barFrames.push(frame);
    i++;
    t = originSeconds + i * secondsPerBeat;
  }
  return { beatFrames, barFrames };
}

// §6 — real detected-grid construction, reusing beatMap's OWN beat/bar
// timestamps directly rather than re-deriving spacing (most accurate when
// the grid is trusted). Falls back to spacing math from decimal BPM when
// only a usable BPM exists (matches loopCandidates.ts's provisional-grid
// reasoning, never duplicating that decision logic — just building a
// grid object around whichever BPM is already usable).
export function buildMusicalGridFromBeatMap(
  beatMap: TrackBeatMap | undefined,
  trackBpm: number | undefined,
  sourceFingerprint: string,
  sourceDurationSeconds: number,
  sampleRate: number,
  now: string = new Date().toISOString(),
): MusicalGrid | null {
  const bpm = beatMap?.bpm ?? trackBpm;
  if (!bpm || bpm <= 0) return null;

  const trusted = isBeatMapTrustedForAnalysis(beatMap);
  if (trusted && beatMap && beatMap.barStartTimesSeconds.length > 1) {
    const originSeconds = beatMap.barStartTimesSeconds[0];
    return {
      bpm,
      meterNumerator: 4, meterDenominator: 4,
      originSeconds,
      originFrame: secondsToFrame(originSeconds, sampleRate),
      originSource: "trusted_downbeat",
      trust: "trusted",
      confidence: beatMap.confidence,
      beatFrames: beatMap.beatTimesSeconds.map((s) => secondsToFrame(s, sampleRate)),
      barFrames: beatMap.barStartTimesSeconds.map((s) => secondsToFrame(s, sampleRate)),
      sourceFingerprint,
      updatedAt: now,
    };
  }

  // Provisional: no trusted grid, but a usable BPM exists — spacing-based
  // frames from origin 0, explicitly marked provisional (never claimed
  // trusted), matching loopCandidates.ts's own provisional_grid honesty.
  const { beatFrames, barFrames } = regenerateSpacingFrames(bpm, 0, sourceDurationSeconds, sampleRate);
  return {
    bpm,
    meterNumerator: 4, meterDenominator: 4,
    originSeconds: 0,
    originFrame: 0,
    originSource: "detected_beat",
    trust: "provisional",
    confidence: beatMap?.confidence ?? 0.3,
    beatFrames, barFrames,
    sourceFingerprint,
    updatedAt: now,
  };
}

function withManualEdit(
  grid: MusicalGrid, patch: Partial<MusicalGrid>, sourceDurationSeconds: number, sampleRate: number,
  now: string,
): MusicalGrid {
  const next: MusicalGrid = { ...grid, ...patch, trust: "manual", updatedAt: now };
  const { beatFrames, barFrames } = regenerateSpacingFrames(next.bpm, next.originSeconds, sourceDurationSeconds, sampleRate);
  next.beatFrames = beatFrames;
  next.barFrames = barFrames;
  return next;
}

// §12 — "Set Downbeat Here" / "Set Grid Origin Here": writes an exact
// frame as the new origin. Does not touch approved loop boundaries (those
// live on separate LoopAsset records, never mutated here).
export function setManualOrigin(
  grid: MusicalGrid, originSeconds: number, sourceDurationSeconds: number, sampleRate: number,
  now: string = new Date().toISOString(),
): MusicalGrid {
  const originFrame = secondsToFrame(originSeconds, sampleRate);
  return withManualEdit(
    grid,
    { originSeconds: frameToSeconds(originFrame, sampleRate), originFrame, originSource: "manual" },
    sourceDurationSeconds, sampleRate, now,
  );
}

// §13 — grid nudge. Modifies origin frame only, never waveform audio.
export function nudgeGridOrigin(
  grid: MusicalGrid, deltaSeconds: number, sourceDurationSeconds: number, sampleRate: number,
  now: string = new Date().toISOString(),
): MusicalGrid {
  const nextOriginSeconds = Math.max(0, grid.originSeconds + deltaSeconds);
  return setManualOrigin(grid, nextOriginSeconds, sourceDurationSeconds, sampleRate, now);
}

// §14 — half/double BPM. Preserves full decimal precision throughout;
// origin remains fixed unless explicitly reset (§14 requirement).
export function halfBpm(
  grid: MusicalGrid, sourceDurationSeconds: number, sampleRate: number, now: string = new Date().toISOString(),
): MusicalGrid {
  return withManualEdit(grid, { bpm: grid.bpm / 2 }, sourceDurationSeconds, sampleRate, now);
}

export function doubleBpm(
  grid: MusicalGrid, sourceDurationSeconds: number, sampleRate: number, now: string = new Date().toISOString(),
): MusicalGrid {
  return withManualEdit(grid, { bpm: grid.bpm * 2 }, sourceDurationSeconds, sampleRate, now);
}

// §15 — manual precise BPM entry. Validation: finite, positive, practical
// range (20-999 covers any real musical tempo without silently accepting
// garbage); never coerces to an integer.
export function setManualBpm(
  grid: MusicalGrid, nextBpm: number, sourceDurationSeconds: number, sampleRate: number,
  now: string = new Date().toISOString(),
): MusicalGrid {
  if (!Number.isFinite(nextBpm) || nextBpm < 20 || nextBpm > 999) {
    throw new Error(`BPM must be a finite number between 20 and 999 (got ${nextBpm})`);
  }
  return withManualEdit(grid, { bpm: nextBpm }, sourceDurationSeconds, sampleRate, now);
}

// §16 — "Reset to Detected Grid." Simply re-derives from the beat map /
// track BPM again — never mutates or discards the manual grid the caller
// already has; the caller decides whether to keep the prior revision in
// history (§17 note: "manual revisions remain in edit history where
// practical").
export function resetToDetectedGrid(
  beatMap: TrackBeatMap | undefined,
  trackBpm: number | undefined,
  sourceFingerprint: string,
  sourceDurationSeconds: number,
  sampleRate: number,
  now: string = new Date().toISOString(),
): MusicalGrid | null {
  return buildMusicalGridFromBeatMap(beatMap, trackBpm, sourceFingerprint, sourceDurationSeconds, sampleRate, now);
}

// §6 — derives ruler marks from the grid's OWN frame arrays (never from
// rounded display seconds). `zoomLevel` controls density: overview shows
// sparse bars only, fine shows every beat.
export function buildGridMarks(
  grid: MusicalGrid, sampleRate: number, zoomLevel: "overview" | "bars" | "beats" | "subdivisions" | "fine",
): MusicalGridMarkOut[] {
  const marks: MusicalGridMarkOut[] = [];
  const barEvery = zoomLevel === "overview" ? 4 : 1;
  grid.barFrames.forEach((frame, i) => {
    if (i % barEvery !== 0) return;
    marks.push({ frame, seconds: frameToSeconds(frame, sampleRate), bar: i + 1, beat: 1, kind: "bar", label: `${i + 1}` });
  });
  if (zoomLevel === "beats" || zoomLevel === "subdivisions" || zoomLevel === "fine") {
    grid.beatFrames.forEach((frame, i) => {
      if (i % BEATS_PER_BAR === 0) return; // already covered by the bar mark
      const bar = Math.floor(i / BEATS_PER_BAR) + 1;
      const beat = (i % BEATS_PER_BAR) + 1;
      marks.push({ frame, seconds: frameToSeconds(frame, sampleRate), bar, beat, kind: "beat", label: `${bar}.${beat}` });
    });
  }
  return marks.sort((a, b) => a.frame - b.frame);
}

type MusicalGridMarkOut = {
  frame: number; seconds: number; bar: number; beat: number; subdivision?: number;
  kind: "bar" | "beat" | "subdivision"; label?: string;
};
