// Stable transition warning taxonomy (0713_MUSIC_Playlist_BPM_Key_Sequencing
// §16). Warnings are informational unless existing generation rules already
// mark something blocking — nothing here excludes a track or fails a build.

import type { BpmTransitionDistance } from "./bpmTransition";
import type { SectionSequencingProfile } from "./sectionSequencingProfile";

export type PlaylistSequencingWarningCode =
  | "PLAYLIST_TRANSITION_BPM_LARGE_JUMP"
  | "PLAYLIST_TRANSITION_BPM_HALF_DOUBLE_AMBIGUITY"
  | "PLAYLIST_TRANSITION_KEY_INCOMPATIBLE"
  | "PLAYLIST_TRANSITION_KEY_UNTRUSTED"
  | "PLAYLIST_SECTION_TEMPO_CHAOTIC"
  | "PLAYLIST_SECTION_KEY_FRAGMENTED"
  | "PLAYLIST_OUTRO_TEMPO_DISRUPTION";

export interface PlaylistSequencingWarning {
  code: PlaylistSequencingWarningCode;
  severity: "info" | "notice" | "warning";
  explanation: string;
  positions: number[];
  trackIds: string[];
  sectionId?: string;
  requiresUserAction: boolean;
}

const LARGE_JUMP_BASE_THRESHOLD = 20; // BPM, matches §8's "20+ strong penalty" band

export function describeTransitionWarnings(input: {
  fromPosition: number;
  toPosition: number;
  fromTrackId: string;
  toTrackId: string;
  sectionId: string;
  bpmDistance: BpmTransitionDistance;
  keyPenalty?: number;
  keyTrusted: boolean;
  profile: SectionSequencingProfile;
}): PlaylistSequencingWarning[] {
  const warnings: PlaylistSequencingWarning[] = [];
  const positions = [input.fromPosition, input.toPosition];
  const trackIds = [input.fromTrackId, input.toTrackId];

  if (input.bpmDistance.effectiveDelta != null) {
    const threshold = LARGE_JUMP_BASE_THRESHOLD * input.profile.bpmToleranceMultiplier;
    if (input.bpmDistance.effectiveDelta > threshold) {
      warnings.push({
        code: "PLAYLIST_TRANSITION_BPM_LARGE_JUMP",
        severity: "warning",
        explanation: `Effective BPM difference of ${input.bpmDistance.effectiveDelta.toFixed(1)} exceeds this section's tolerance (${threshold.toFixed(0)}).`,
        positions, trackIds, sectionId: input.sectionId,
        requiresUserAction: false,
      });
    }
  }

  if (input.bpmDistance.relationship === "half_time" || input.bpmDistance.relationship === "double_time") {
    warnings.push({
      code: "PLAYLIST_TRANSITION_BPM_HALF_DOUBLE_AMBIGUITY",
      severity: "info",
      explanation: `Tempo relationship read as ${input.bpmDistance.relationship.replace("_", "-")} rather than a direct match — rhythmically plausible, but not identical continuity.`,
      positions, trackIds, sectionId: input.sectionId,
      requiresUserAction: false,
    });
  }

  if (input.keyPenalty != null && !input.profile.allowHarmonicTension && input.keyPenalty >= 18) {
    warnings.push({
      code: "PLAYLIST_TRANSITION_KEY_INCOMPATIBLE",
      severity: "notice",
      explanation: `Camelot penalty ${input.keyPenalty} indicates a distant/tense key relationship for a section that doesn't expect harmonic tension.`,
      positions, trackIds, sectionId: input.sectionId,
      requiresUserAction: false,
    });
  }

  if (!input.keyTrusted && input.profile.role === "outro") {
    warnings.push({
      code: "PLAYLIST_TRANSITION_KEY_UNTRUSTED",
      severity: "info",
      explanation: "Key data is missing or untrusted for this closing transition — resolution character could not be evaluated.",
      positions, trackIds, sectionId: input.sectionId,
      requiresUserAction: false,
    });
  }

  return warnings;
}

// Section-level aggregate warnings — computed across a section's already-
// generated transitions, not synthesized independently.
export function describeSectionSequencingWarnings(input: {
  sectionId: string;
  sectionRole: SectionSequencingProfile["role"];
  transitions: Array<{ fromPosition: number; toPosition: number; fromTrackId: string; toTrackId: string; bpmDistance: BpmTransitionDistance; keyPenalty?: number; keyTrusted: boolean }>;
}): PlaylistSequencingWarning[] {
  const warnings: PlaylistSequencingWarning[] = [];
  if (input.transitions.length === 0) return warnings;

  const largeJumps = input.transitions.filter((t) => t.bpmDistance.effectiveDelta != null && t.bpmDistance.effectiveDelta > LARGE_JUMP_BASE_THRESHOLD);
  if (largeJumps.length >= 2 && largeJumps.length / input.transitions.length >= 0.4) {
    warnings.push({
      code: "PLAYLIST_SECTION_TEMPO_CHAOTIC",
      severity: "warning",
      explanation: `${largeJumps.length} of ${input.transitions.length} transitions in this section show large tempo jumps — the section reads as tempo-chaotic rather than intentionally varied.`,
      positions: largeJumps.flatMap((t) => [t.fromPosition, t.toPosition]),
      trackIds: largeJumps.flatMap((t) => [t.fromTrackId, t.toTrackId]),
      sectionId: input.sectionId,
      requiresUserAction: false,
    });
  }

  const trustedKeyTransitions = input.transitions.filter((t) => t.keyTrusted && t.keyPenalty != null);
  const fragmentedKey = trustedKeyTransitions.filter((t) => (t.keyPenalty ?? 0) >= 18);
  if (trustedKeyTransitions.length >= 2 && fragmentedKey.length / trustedKeyTransitions.length >= 0.5) {
    warnings.push({
      code: "PLAYLIST_SECTION_KEY_FRAGMENTED",
      severity: "notice",
      explanation: `${fragmentedKey.length} of ${trustedKeyTransitions.length} trusted-key transitions in this section land in distant/tense Camelot territory.`,
      positions: fragmentedKey.flatMap((t) => [t.fromPosition, t.toPosition]),
      trackIds: fragmentedKey.flatMap((t) => [t.fromTrackId, t.toTrackId]),
      sectionId: input.sectionId,
      requiresUserAction: false,
    });
  }

  if (input.sectionRole === "outro") {
    const last = input.transitions[input.transitions.length - 1];
    if (last?.bpmDistance.effectiveDelta != null && last.bpmDistance.effectiveDelta > LARGE_JUMP_BASE_THRESHOLD * 0.8) {
      warnings.push({
        code: "PLAYLIST_OUTRO_TEMPO_DISRUPTION",
        severity: "warning",
        explanation: `The final transition into the closer shows a ${last.bpmDistance.effectiveDelta.toFixed(1)} BPM effective jump — a disruptive way to end the playlist.`,
        positions: [last.fromPosition, last.toPosition],
        trackIds: [last.fromTrackId, last.toTrackId],
        sectionId: input.sectionId,
        requiresUserAction: false,
      });
    }
  }

  return warnings;
}
