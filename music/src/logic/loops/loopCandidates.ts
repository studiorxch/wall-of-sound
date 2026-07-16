// Sectional Looper and Loop Library — candidate generation (§4-§12 of
// 0714P_MUSIC_Multi_Length_Loop_Candidate_Generation_And_Preview_
// Reliability_v1.0.0). Pure logic only: reuses the canonical beat map +
// playback bounds already on the track (never re-derives them, never
// retunes those detectors' own trust thresholds — the provisional-grid
// threshold below is this build's OWN new business-logic threshold, not a
// change to beatMapTrust.ts/playbackBoundsTrust.ts).

import type { TrackBeatMap } from "../../data/beatMapTypes";
import type { TrackPlaybackBounds } from "../../data/playbackBoundsTypes";
import type {
  LoopBoundarySource, LoopCandidateGenerationMode, LoopLength,
  SupportedLoopBars, SupportedLoopSeconds, LoopWarningCode,
} from "../../data/loopTypes";
import { isBeatMapTrustedForAnalysis } from "../beatMap/beatMapTrust";
import { isPlaybackBoundsTrusted } from "../playbackBounds/playbackBoundsTrust";
import { rankAndLimitCandidates, type RankableCandidateInput } from "./loopCandidateRanking";

export interface LoopCandidate {
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
  barCount?: number;
  beatCount?: number;
  bpm?: number;
  boundarySource: LoopBoundarySource;
  // Combined display string, e.g. "Groove A · 16 bars" — kept for simple
  // UI rendering; sectionLabel/length carry the same info structurally.
  label: string;
  sectionLabel: string;
  length: LoopLength;
  generationMode: LoopCandidateGenerationMode;
  gridTrusted: boolean;
  provisional: boolean;
  warnings: LoopWarningCode[];
}

// §3 — recommended priority: primary 8/16/32, secondary 4/64.
const BAR_SIZES: SupportedLoopBars[] = [4, 8, 16, 32, 64];
const TIME_SECONDS: SupportedLoopSeconds[] = [8, 16, 32, 64];
const BEATS_PER_BAR = 4;
// §10 — recommended visible default: 2 candidates per section per length.
const MAX_VISIBLE_PER_GROUP = 2;
// §5 — this build's OWN provisional-grid threshold (not a detector-trust
// threshold, and not a change to any existing one).
const PROVISIONAL_BPM_CONFIDENCE_MIN = 0.2;
const MIN_PLAYABLE_WINDOW_SECONDS = 2;

const SECTION_LABELS = ["Groove A", "Groove B", "Break", "Build", "Drop", "Bridge", "Fill", "Texture", "Tail"] as const;

function barLength(bars: SupportedLoopBars, secondsPerBar: number): LoopLength {
  return { kind: "bars", bars, beatCount: bars * BEATS_PER_BAR, expectedDurationSeconds: bars * secondsPerBar };
}
function secondsLength(seconds: SupportedLoopSeconds): LoopLength {
  return { kind: "seconds", seconds, expectedDurationSeconds: seconds };
}

function combinedLabel(sectionLabel: string, length: LoopLength): string {
  return length.kind === "bars"
    ? `${sectionLabel} · ${length.bars} bars`
    : `${sectionLabel} · ${length.seconds} seconds`;
}

export function generateLoopCandidates(
  beatMap: TrackBeatMap | undefined,
  playbackBounds: TrackPlaybackBounds | undefined,
  sourceDurationSeconds: number,
  // §4/§5 — "usable BPM" is the track's own top-level BPM value (the
  // canonical BPM/key detector's output), which commonly exists even when
  // the SEPARATE beat-map detector's own `beatMap.bpm` field is unset —
  // falling back to beatMap.bpm alone (as an earlier pass of this function
  // did) silently dropped provisional-grid generation for exactly the
  // tracks §4 describes ("usable BPM... but the beat/bar grid is
  // untrusted"). beatMap.bpm is still preferred when present (it reflects
  // the same analysis the bar grid itself is built from).
  trackBpm?: number,
): LoopCandidate[] {
  const windowStart = playbackBounds?.override?.preferredStartSeconds
    ?? playbackBounds?.preferredStartSeconds ?? 0;
  const windowEnd = playbackBounds?.override?.preferredEndSeconds
    ?? playbackBounds?.preferredEndSeconds ?? sourceDurationSeconds;

  if (windowEnd - windowStart < MIN_PLAYABLE_WINDOW_SECONDS) return []; // §4 manual_only

  const beatMapTrusted = isBeatMapTrustedForAnalysis(beatMap);
  const boundsTrusted = playbackBounds ? isPlaybackBoundsTrusted(playbackBounds) : false;
  const gridTrusted = beatMapTrusted && boundsTrusted;
  const bpm = beatMap?.bpm ?? trackBpm;
  const bpmUsable = !!bpm && bpm > 0;

  if (gridTrusted && beatMap && beatMap.barStartTimesSeconds.length > 1) {
    return fromTrustedGrid(beatMap, windowStart, windowEnd);
  }
  if (bpmUsable && (beatMap?.confidence ?? 1) >= PROVISIONAL_BPM_CONFIDENCE_MIN) {
    return fromProvisionalGrid(bpm, windowStart, windowEnd);
  }
  return fromTimeFallback(windowStart, windowEnd);
}

// §4 trusted_grid / §7 multi-length / §8 sliding step / §10 density
function fromTrustedGrid(beatMap: TrackBeatMap, windowStart: number, windowEnd: number): LoopCandidate[] {
  const bars = beatMap.barStartTimesSeconds.filter((t) => t >= windowStart && t <= windowEnd);
  const tempoStabilityScore = beatMap.tempoStabilityScore;

  // §9 — section grouping: use trusted phrase candidates as sections when
  // available; otherwise the whole trusted window is one section (a
  // reduced but honest fallback — no fabricated section splitting).
  const phraseSections = (beatMap.phraseCandidates ?? [])
    .filter((p) => p.startSeconds >= windowStart && p.endSeconds <= windowEnd && p.endSeconds > p.startSeconds);
  const sections = phraseSections.length
    ? phraseSections.map((p, i) => ({ label: SECTION_LABELS[i % SECTION_LABELS.length], start: p.startSeconds, end: p.endSeconds }))
    : [{ label: "Groove A", start: windowStart, end: windowEnd }];

  const out: LoopCandidate[] = [];
  for (const section of sections) {
    const sectionBars = bars.filter((t) => t >= section.start && t <= section.end);
    for (const barSize of BAR_SIZES) {
      const pool: (RankableCandidateInput & { startSeconds: number; endSeconds: number })[] = [];
      // §8 — one-bar sliding step, generated internally then ranked/deduped.
      for (let i = 0; i + barSize < sectionBars.length; i++) {
        const start = sectionBars[i];
        const end = sectionBars[i + barSize];
        if (end <= start || end > section.end) continue;
        pool.push({ startSeconds: start, endSeconds: end, barCount: barSize, gridTrusted: true, provisional: false, tempoStabilityScore });
      }
      const chosen = rankAndLimitCandidates(pool, MAX_VISIBLE_PER_GROUP);
      const secondsPerBar = chosen.length ? (chosen[0].candidate.endSeconds - chosen[0].candidate.startSeconds) / barSize : 0;
      for (const { candidate } of chosen) {
        const length = barLength(barSize, secondsPerBar);
        out.push({
          startSeconds: candidate.startSeconds, endSeconds: candidate.endSeconds,
          durationSeconds: candidate.endSeconds - candidate.startSeconds,
          barCount: barSize, beatCount: barSize * BEATS_PER_BAR, bpm: beatMap.bpm,
          boundarySource: phraseSections.length ? "section_analysis" : "bar_grid",
          sectionLabel: section.label, label: combinedLabel(section.label, length), length,
          generationMode: "trusted_grid", gridTrusted: true, provisional: false, warnings: [],
        });
      }
    }
  }
  return out;
}

// §4 provisional_grid — approximate bar durations from BPM only; the beat/
// bar grid itself is untrusted, so there is nothing to slide a real grid
// over. Every candidate is explicitly labeled provisional, never trusted.
function fromProvisionalGrid(bpm: number, windowStart: number, windowEnd: number): LoopCandidate[] {
  const secondsPerBar = (60 / bpm) * BEATS_PER_BAR;
  const section = { label: "Region 1", start: windowStart, end: windowEnd };
  const out: LoopCandidate[] = [];

  for (const barSize of BAR_SIZES) {
    const duration = secondsPerBar * barSize;
    if (duration > windowEnd - windowStart) continue;
    const pool: (RankableCandidateInput & { startSeconds: number; endSeconds: number })[] = [];
    for (let start = windowStart; start + duration <= windowEnd; start += secondsPerBar) {
      pool.push({ startSeconds: start, endSeconds: start + duration, barCount: barSize, gridTrusted: false, provisional: true });
    }
    const chosen = rankAndLimitCandidates(pool, MAX_VISIBLE_PER_GROUP);
    for (const { candidate } of chosen) {
      const length = barLength(barSize, secondsPerBar);
      out.push({
        startSeconds: candidate.startSeconds, endSeconds: candidate.endSeconds,
        durationSeconds: candidate.endSeconds - candidate.startSeconds,
        barCount: barSize, beatCount: barSize * BEATS_PER_BAR, bpm,
        boundarySource: "bar_grid",
        sectionLabel: section.label, label: combinedLabel(section.label, length), length,
        generationMode: "provisional_grid", gridTrusted: false, provisional: true,
        warnings: ["LOOP_PROVISIONAL_BAR_GRID"],
      });
    }
  }
  return out;
}

// §4 time_fallback — explicit, clearly non-bar-aligned seconds-based
// candidates, only reached when no usable BPM/grid exists at all.
function fromTimeFallback(windowStart: number, windowEnd: number): LoopCandidate[] {
  const windowLen = windowEnd - windowStart;
  const regionSize = Math.min(64, windowLen);
  const out: LoopCandidate[] = [];
  let regionStart = windowStart;
  let regionIndex = 1;
  while (regionStart < windowEnd - MIN_PLAYABLE_WINDOW_SECONDS) {
    const regionEnd = Math.min(regionStart + regionSize, windowEnd);
    const sectionLabel = `Time Region ${regionIndex}`;
    for (const seconds of TIME_SECONDS) {
      const end = regionStart + seconds;
      if (end > regionEnd) continue;
      const length = secondsLength(seconds);
      out.push({
        startSeconds: regionStart, endSeconds: end, durationSeconds: seconds,
        boundarySource: "manual",
        sectionLabel, label: combinedLabel(sectionLabel, length), length,
        generationMode: "time_fallback", gridTrusted: false, provisional: false,
        warnings: ["LOOP_TIME_BASED_FALLBACK"],
      });
    }
    regionStart = regionEnd;
    regionIndex++;
  }
  return out;
}
