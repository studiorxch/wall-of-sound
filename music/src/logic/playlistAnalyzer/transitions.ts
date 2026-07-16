// Playlist Analyzer Review — adjacent-pair transition analysis (spec §5.6).
// Reuses the canonical Camelot penalty function rather than re-deriving key
// compatibility; never claims harmonic compatibility when key data is missing.

import type { PlaylistTransitionReview, PlaylistTransitionType } from "../../data/playlistAnalyzerTypes";
import type { OrderedPlaylistEntry } from "./resolveOrder";
import { isBpmTrustedForAnalysis, isKeyTrustedForAnalysis } from "../dspFeatureExtraction";
import { computeBpmTransitionDistance, scoreBpmTransition } from "../playlistSequencing/bpmTransition";
import { scoreKeyTransition } from "../playlistSequencing/keyTransition";
import { computeTransitionScore } from "../playlistSequencing/transitionScore";
import { classifySectionSequencingRole, getSectionSequencingProfile } from "../playlistSequencing/sectionSequencingProfile";
import { describeTransitionWarnings } from "../playlistSequencing/transitionWarnings";

// Shared with playlist generation (playlistShapeBuilder.ts) — §18 "prefer
// shared helpers used by both generation and analyzer review."
export function computeMoodContinuity(a: string[], b: string[]): number | undefined {
  if (a.length === 0 || b.length === 0) return undefined;
  const shared = a.filter((m) => b.includes(m)).length;
  return +(shared / Math.max(a.length, b.length)).toFixed(3);
}

export function computeTransitions(entries: OrderedPlaylistEntry[]): PlaylistTransitionReview[] {
  const transitions: PlaylistTransitionReview[] = [];
  // Section role classification needs the total section count once, up front
  // (0713_MUSIC_Playlist_BPM_Key_Sequencing §11) — reused for every pair.
  const totalSections = 1 + Math.max(0, ...entries.map((e) => e.slot.sectionIndex ?? 0));

  for (let i = 0; i < entries.length - 1; i++) {
    const from = entries[i];
    const to = entries[i + 1];

    // 0712_MUSIC_BPM_Key_Detector_Calibration §21 — only trusted/confident
    // values (not legacy_unknown, not carrying an unresolved ambiguity flag)
    // may drive tempo/harmonic analysis here.
    const fromBpm = isBpmTrustedForAnalysis(from.track) ? from.track.bpm : undefined;
    const toBpm = isBpmTrustedForAnalysis(to.track) ? to.track.bpm : undefined;
    const bpmDelta = fromBpm != null && toBpm != null ? +(toBpm - fromBpm).toFixed(1) : undefined;

    // 0713_MUSIC_Playlist_BPM_Key_Sequencing §18 — same shared helper
    // generation uses for its own candidate ranking, not re-derived here.
    const bpmDistance = computeBpmTransitionDistance(fromBpm, toBpm);
    const bpmFit = scoreBpmTransition(bpmDistance);

    const fromEnergy = from.row.energy != null && from.row.energy > 0 ? from.row.energy : undefined;
    const toEnergy = to.row.energy != null && to.row.energy > 0 ? to.row.energy : undefined;
    const energyDelta = fromEnergy != null && toEnergy != null ? +(toEnergy - fromEnergy).toFixed(3) : undefined;
    const energyFit = fromEnergy != null && toEnergy != null ? Math.max(0, 1 - Math.abs(toEnergy - fromEnergy)) : 0.5;

    const fromKeyTrusted = isKeyTrustedForAnalysis(from.track);
    const toKeyTrusted = isKeyTrustedForAnalysis(to.track);
    const keyResult = scoreKeyTransition(
      fromKeyTrusted ? (from.track.camelotKey as string) : undefined,
      toKeyTrusted ? (to.track.camelotKey as string) : undefined,
    );
    let keyRelationship: string | undefined;
    if (fromKeyTrusted && toKeyTrusted && keyResult.penalty != null) {
      const penalty = keyResult.penalty;
      keyRelationship = penalty === 0 ? "same key" : penalty <= 6 ? "compatible" : penalty <= 18 ? "moderate shift" : "distant / tense";
    }
    // spec §5.6/§12.2: never claim compatibility when key data is missing,
    // untrusted, or ambiguous — keyRelationship stays undefined above rather
    // than defaulting to "compatible".

    const continuity = computeMoodContinuity(from.row.moodTags, to.row.moodTags);

    const sectionRole = classifySectionSequencingRole(from.slot.sectionId ?? "", from.slot.sectionIndex ?? 0, totalSections);
    const profile = getSectionSequencingProfile(sectionRole);
    const sequencingScore = computeTransitionScore({
      energyFit, bpmFit, keyFit: keyResult.score, moodContinuity: continuity ?? 0.5, variety: 1, profile,
    }).total;
    const sequencingWarnings = describeTransitionWarnings({
      fromPosition: from.position, toPosition: to.position,
      fromTrackId: from.track.trackId, toTrackId: to.track.trackId,
      sectionId: from.slot.sectionId ?? "unsectioned",
      bpmDistance, keyPenalty: keyResult.penalty, keyTrusted: fromKeyTrusted && toKeyTrusted, profile,
    });

    const fromBrightness = from.row.features?.brightness;
    const toBrightness = to.row.features?.brightness;
    const brightnessDelta = fromBrightness != null && toBrightness != null ? +(toBrightness - fromBrightness).toFixed(3) : undefined;

    const fromBandwidth = from.row.features?.bandwidth;
    const toBandwidth = to.row.features?.bandwidth;
    const densityDelta = fromBandwidth != null && toBandwidth != null ? +(toBandwidth - fromBandwidth).toFixed(3) : undefined;

    const warningCodes: string[] = [];
    let transitionType: PlaylistTransitionType;
    let narrativeEffect: string;
    let confidence: number;

    const hasCoreData = energyDelta != null;
    if (!hasCoreData) {
      transitionType = "uncertain";
      narrativeEffect = "insufficient measured data to characterize this transition";
      confidence = 0.15;
    } else {
      const absEnergy = Math.abs(energyDelta!);
      const absBpm = bpmDelta != null ? Math.abs(bpmDelta) : 0;

      if (absEnergy >= 0.4) {
        transitionType = "hard_interruption";
        narrativeEffect = energyDelta! > 0 ? "an abrupt jolt upward in intensity" : "a sudden drop that resets the mood";
        warningCodes.push("PLAYLIST_TRANSITION_ABRUPT_ENERGY");
      } else if (absEnergy >= 0.28 && energyDelta! < 0) {
        transitionType = "reset";
        narrativeEffect = "energy pulls back sharply, resetting before the next movement";
        warningCodes.push("PLAYLIST_TRANSITION_ABRUPT_ENERGY");
      } else if (continuity != null && continuity < 0.2 && absEnergy < 0.28) {
        transitionType = "intentional_contrast";
        narrativeEffect = "mood shifts deliberately while energy stays close";
      } else if (energyDelta! > 0.12) {
        transitionType = "gentle_lift";
        narrativeEffect = "energy rises smoothly into the next track";
      } else if (energyDelta! < -0.12) {
        transitionType = "gradual_release";
        narrativeEffect = "energy eases down without disrupting the flow";
      } else {
        transitionType = "smooth_continuation";
        narrativeEffect = "the sequence continues without a notable shift";
      }

      if (bpmDelta != null && absBpm >= 20) warningCodes.push("PLAYLIST_TRANSITION_ABRUPT_TEMPO");
      if (keyRelationship === "distant / tense") warningCodes.push("PLAYLIST_TRANSITION_HARMONIC_TENSION");

      const knownSignals = [bpmDelta != null, energyDelta != null, keyRelationship != null, continuity != null].filter(Boolean).length;
      confidence = +(knownSignals / 4).toFixed(2);
    }

    transitions.push({
      id: `t_${from.track.trackId}_${to.track.trackId}`,
      fromTrackId: from.track.trackId,
      toTrackId: to.track.trackId,
      fromPosition: from.position,
      toPosition: to.position,
      bpmDelta,
      energyDelta,
      keyRelationship,
      moodContinuity: continuity,
      brightnessDelta,
      densityDelta,
      effectiveBpmDelta: bpmDistance.effectiveDelta,
      bpmRelationship: bpmDistance.relationship,
      keyPenalty: keyResult.penalty,
      sequencingScore: +sequencingScore.toFixed(3),
      sequencingWarningCodes: sequencingWarnings.map((w) => w.code),
      transitionType,
      narrativeEffect,
      confidence,
      warningCodes,
    });
  }

  return transitions;
}
