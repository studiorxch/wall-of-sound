// DJ Transition Engine (0722D) §7 — pure candidate-region selection. Takes
// one side's track evidence (djTransitionEvidence.ts) plus playback bounds
// and returns RANKED candidates, never a single mandatory intro/outro.
//
// Regions are derived from real evidence only: verified/reviewed structural
// sections (songAnalysisTypes.ts SongSection — provisional sections are
// never used to place a cue), the trust-gated beat/bar/phrase grid, the
// existing windowed NumericProfile activity curves (energy/bass/density/
// brightness), and playback bounds as an always-available fallback. There
// is no per-region short-window re-analysis of raw audio here — that would
// require a new audio-decode step, which is I/O this pure module
// deliberately stays outside of (djTransitionEvidence.ts already resolves
// everything it needs before calling in). Local activity for a candidate
// region is sampled from the existing 128-bin whole-track profile at the
// bins the region actually overlaps — real, non-fabricated data, just
// bounded by that profile's own resolution (duration/128 per bin), which
// is disclosed via confidence rather than hidden.
//
// Doctrine §9: without a vocal stem or a proven classifier, spectral
// midrange activity must never be labeled "vocal." vocal_pickup is
// therefore only ever produced when a CURRENT vocals stem is actually
// available (evidence.currentStemRoles) — never guessed from brightness.

import type { TrackPlaybackBounds } from "../data/playbackBoundsTypes";
import type { TransitionTrust } from "../data/djTransitionTypes";
import type { DjTransitionTrackEvidence } from "./djTransitionEvidence";

export type OutgoingRegionRole =
  | "final_phrase"
  | "percussion_only_exit"
  | "breakdown_exit"
  | "ambient_tail"
  | "loopable_body_exit"
  | "hard_ending_handoff";

export type IncomingRegionRole =
  | "clean_intro"
  | "percussion_only_entrance"
  | "melodic_entrance"
  | "vocal_pickup"
  | "breakdown_entrance"
  | "loopable_body_entrance";

export interface TransitionRegionCandidate {
  regionId: string;
  role: OutgoingRegionRole | IncomingRegionRole;
  startSeconds: number;
  endSeconds: number;
  availableBeatsSeconds: number[];
  availableBarsSeconds: number[];
  availablePhrasesSeconds: number[];
  rhythmicTrust: TransitionTrust;
  bassActivitySummary: number | null;
  foregroundActivitySummary: number | null;
  localLoudness: number | null;
  localEnergy: number | null;
  loopSuitability: number | null;
  sourceExplanation: string;
}

interface NumericProfileLike {
  values: number[];
  windowSeconds: number;
}

function sampleProfileWindow(profile: NumericProfileLike | null, startSeconds: number, endSeconds: number): number | null {
  if (!profile || profile.windowSeconds <= 0 || profile.values.length === 0) return null;
  const firstBin = Math.max(0, Math.floor(startSeconds / profile.windowSeconds));
  const lastBin = Math.min(profile.values.length - 1, Math.ceil(endSeconds / profile.windowSeconds));
  if (firstBin > lastBin) return null;
  let sum = 0;
  let count = 0;
  for (let i = firstBin; i <= lastBin; i++) {
    sum += profile.values[i];
    count++;
  }
  return count > 0 ? sum / count : null;
}

function withinWindow(times: number[], startSeconds: number, endSeconds: number): number[] {
  return times.filter((t) => t >= startSeconds && t <= endSeconds);
}

function classifyRhythmicTrust(evidence: DjTransitionTrackEvidence, phrasesInWindow: number[], barsInWindow: number[]): TransitionTrust {
  if (evidence.phraseTrusted && phrasesInWindow.length > 0) return "trusted_rhythmic";
  if (evidence.barTrusted && barsInWindow.length > 0) return "partially_trusted";
  if (evidence.beatTrusted) return "partially_trusted";
  return "free_time_or_incompatible";
}

// Bars group evenly into a phrase length (4/8/16/32) -> real loop
// suitability signal; anything else stays null (unknown), never guessed.
function estimateLoopSuitability(barsInWindow: number[]): number | null {
  if (barsInWindow.length < 4) return null;
  const PHRASE_LENGTHS = [32, 16, 8, 4];
  for (const length of PHRASE_LENGTHS) {
    if (barsInWindow.length % length === 0) return Math.min(1, length / 32);
  }
  return null;
}

function buildCandidate(
  regionId: string,
  role: OutgoingRegionRole | IncomingRegionRole,
  startSeconds: number,
  endSeconds: number,
  evidence: DjTransitionTrackEvidence,
  explanation: string,
): TransitionRegionCandidate {
  const beats = withinWindow(evidence.beatTimesSeconds.value ?? [], startSeconds, endSeconds);
  const bars = withinWindow(evidence.barStartTimesSeconds.value ?? [], startSeconds, endSeconds);
  const phrases = withinWindow(evidence.phraseBoundarySeconds.value ?? [], startSeconds, endSeconds);
  const energyProfile = evidence.energyProfile.value ? { values: evidence.energyProfile.value, windowSeconds: profileWindowSecondsOf(evidence, evidence.energyProfile.value) } : null;
  const bassProfile = evidence.bassWeightProfile.value ? { values: evidence.bassWeightProfile.value, windowSeconds: profileWindowSecondsOf(evidence, evidence.bassWeightProfile.value) } : null;
  const densityProfile = evidence.densityProfile.value ? { values: evidence.densityProfile.value, windowSeconds: profileWindowSecondsOf(evidence, evidence.densityProfile.value) } : null;

  return {
    regionId,
    role,
    startSeconds,
    endSeconds,
    availableBeatsSeconds: beats,
    availableBarsSeconds: bars,
    availablePhrasesSeconds: phrases,
    rhythmicTrust: classifyRhythmicTrust(evidence, phrases, bars),
    bassActivitySummary: sampleProfileWindow(bassProfile, startSeconds, endSeconds),
    // Doctrine §9 — never "vocal," always the honest "foreground_risk" framing;
    // densityProfile is the closest existing real signal (spectral
    // change/onset density is not separately available yet).
    foregroundActivitySummary: sampleProfileWindow(densityProfile, startSeconds, endSeconds),
    localLoudness: sampleProfileWindow(energyProfile, startSeconds, endSeconds),
    localEnergy: sampleProfileWindow(energyProfile, startSeconds, endSeconds),
    loopSuitability: estimateLoopSuitability(bars),
    sourceExplanation: explanation,
  };
}

// NumericProfile.windowSeconds isn't carried on the raw values[] array by
// itself (djTransitionEvidence.ts unwraps TransitionEvidenceValue<number[]>
// down to just `.value`) — durationSeconds/sampleCount gives the same
// number back out. 128 matches songNumericProfiles.ts's fixed sample count.
function profileWindowSecondsOf(evidence: DjTransitionTrackEvidence, values: number[]): number {
  const duration = evidence.durationSeconds.value ?? 0;
  return values.length > 0 ? duration / values.length : 0;
}

export interface SelectDjTransitionRegionsInput {
  side: "outgoing" | "incoming";
  evidence: DjTransitionTrackEvidence;
  playbackBounds?: TrackPlaybackBounds;
}

export function selectDjTransitionRegions(input: SelectDjTransitionRegionsInput): TransitionRegionCandidate[] {
  const { side, evidence, playbackBounds } = input;
  const duration = evidence.durationSeconds.value;
  if (duration == null || duration <= 0) return [];

  const audibleStart = playbackBounds?.audibleStartSeconds ?? 0;
  const audibleEnd = playbackBounds?.audibleEndSeconds ?? duration;
  const preferredStart = playbackBounds?.preferredStartSeconds ?? audibleStart;
  const preferredEnd = playbackBounds?.preferredEndSeconds ?? audibleEnd;

  const clamp = (seconds: number) => Math.max(audibleStart, Math.min(audibleEnd, seconds));

  const candidates: TransitionRegionCandidate[] = [];
  let regionIndex = 0;
  const nextId = () => `${side}-region-${regionIndex++}`;

  if (side === "outgoing") {
    // Always-available fallback: the last stretch of audible audio, per
    // playback-bounds evidence (silence-trim only — informs ranking, never
    // clamps a manual cue away from valid decoded audio).
    const fallbackStart = clamp(preferredEnd - Math.min(16, preferredEnd - audibleStart));
    candidates.push(
      buildCandidate(nextId(), "hard_ending_handoff", fallbackStart, audibleEnd, evidence, "Fallback: last audible stretch of the track, from playback-bounds evidence."),
    );

    if (evidence.phraseTrusted && evidence.phraseBoundarySeconds.value && evidence.phraseBoundarySeconds.value.length > 0) {
      const lastPhraseBoundary = evidence.phraseBoundarySeconds.value[evidence.phraseBoundarySeconds.value.length - 1];
      candidates.push(
        buildCandidate(nextId(), "final_phrase", clamp(lastPhraseBoundary), audibleEnd, evidence, "Trusted phrase grid: the last synthesized phrase boundary through the audible end."),
      );
    }

    for (const section of lastSections(evidence.verifiedSections, 2)) {
      const role = outgoingRoleForSection(section.structuralType);
      if (!role) continue;
      candidates.push(
        buildCandidate(nextId(), role, clamp(section.startSeconds), clamp(section.endSeconds), evidence, `Verified structural section (${section.structuralType}, ${section.verification}).`),
      );
    }
  } else {
    const fallbackEnd = clamp(preferredStart + Math.min(16, audibleEnd - preferredStart));
    candidates.push(
      buildCandidate(nextId(), "clean_intro", audibleStart, fallbackEnd, evidence, "Fallback: first audible stretch of the track, from playback-bounds evidence."),
    );

    if (evidence.currentStemRoles.value?.includes("vocals")) {
      candidates.push(
        buildCandidate(nextId(), "vocal_pickup", audibleStart, fallbackEnd, evidence, "A CURRENT vocals stem is available for this track — pickup candidate near the intro."),
      );
    }

    for (const section of firstSections(evidence.verifiedSections, 2)) {
      const role = incomingRoleForSection(section.structuralType);
      if (!role) continue;
      candidates.push(
        buildCandidate(nextId(), role, clamp(section.startSeconds), clamp(section.endSeconds), evidence, `Verified structural section (${section.structuralType}, ${section.verification}).`),
      );
    }
  }

  return candidates;
}

function lastSections(sections: DjTransitionTrackEvidence["verifiedSections"], count: number) {
  return [...sections].sort((a, b) => a.startSeconds - b.startSeconds).slice(-count);
}

function firstSections(sections: DjTransitionTrackEvidence["verifiedSections"], count: number) {
  return [...sections].sort((a, b) => a.startSeconds - b.startSeconds).slice(0, count);
}

function outgoingRoleForSection(structuralType: string): OutgoingRegionRole | null {
  switch (structuralType) {
    case "breakdown":
      return "breakdown_exit";
    case "outro":
      return "ambient_tail";
    case "interlude":
      return "percussion_only_exit";
    case "body":
    case "verse":
    case "chorus":
    case "bridge":
      return "loopable_body_exit";
    default:
      return null;
  }
}

function incomingRoleForSection(structuralType: string): IncomingRegionRole | null {
  switch (structuralType) {
    case "intro":
      return "clean_intro";
    case "breakdown":
      return "breakdown_entrance";
    case "interlude":
      return "percussion_only_entrance";
    case "verse":
    case "chorus":
      return "melodic_entrance";
    case "body":
    case "bridge":
      return "loopable_body_entrance";
    default:
      return null;
  }
}
