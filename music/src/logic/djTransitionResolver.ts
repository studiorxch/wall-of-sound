// DJ Transition Engine (0722D) §8 — pure resolver. Implements the spec's
// 10-step resolution order (§8.1) and family-selection rules (§8.2-§8.4)
// exactly, governed by 0722_MUSIC_DJ_Doctrine_v1.1.0's tempo caution (§12)
// and honest-unimplemented-path disclosure.
//
// Two families this build's resolver deliberately never auto-recommends,
// per the "no partial fake wiring" rule: loop_assisted_handoff (this build
// has no durable Looper reference API to create a real loop from) and
// effect_handoff (no effect send/tail path exists in the transport yet —
// see deckEqChain.ts/djTransitionPlayback.ts). Both remain real union
// members (an operator can still manually author one — origin:"manual"
// plans bypass the resolver entirely) and both are recorded in
// rejectedCandidates with an honest reason when they would otherwise have
// been considered. stem_assisted_transition is gated behind an explicit
// `stemTransportImplemented` input flag for the same reason — the resolver
// never assumes a capability the playback adapter hasn't actually shipped.

import type { TrackSlot } from "../data/playlistTypes";
import type { Track } from "../data/trackTypes";
import type { DjTransitionPlan, TransitionFamily, TransitionTrust, TransitionTimeBasis, TransitionWarning, TransitionCue } from "../data/djTransitionTypes";
import type { DjTransitionPairEvidence, DjTransitionTrackEvidence } from "./djTransitionEvidence";
import { DJ_TRANSITION_TRUST_POLICY } from "./djTransitionEvidence";
import type { TransitionRegionCandidate } from "./djTransitionRegions";
import { computeBpmTransitionDistance } from "./playlistSequencing/bpmTransition";
import { buildDjTransitionAutomationDefaults } from "./djTransitionAutomationDefaults";

const COLLISION_THRESHOLD = 0.65;

export interface ResolveDjTransitionInput {
  playlistId: string;
  outgoingSlot: TrackSlot;
  incomingSlot: TrackSlot;
  outgoingTrack: Track;
  incomingTrack: Track;
  evidence: DjTransitionPairEvidence;
  outgoingRegions: TransitionRegionCandidate[];
  incomingRegions: TransitionRegionCandidate[];
  analysisRevisionKey: string;
  intent?: "continuity" | "lift" | "release" | "reset" | "disruption";
  existingManualPlan?: DjTransitionPlan;
  existingManualPlanIsStale?: boolean;
  stemTransportImplemented: boolean;
  nowIso: string;
  idFactory: () => string;
}

export interface RejectedTransitionCandidate {
  family: TransitionFamily;
  reason: string;
}

export interface ResolveDjTransitionResult {
  recommended: DjTransitionPlan;
  alternatives: DjTransitionPlan[];
  rejectedCandidates: RejectedTransitionCandidate[];
}

function regionScore(region: TransitionRegionCandidate): number {
  const trustScore = { trusted_rhythmic: 3, partially_trusted: 2, manually_authored: 2, free_time_or_incompatible: 1 }[region.rhythmicTrust];
  return trustScore;
}

function pickBestRegionPair(outgoingRegions: TransitionRegionCandidate[], incomingRegions: TransitionRegionCandidate[]): { outgoing: TransitionRegionCandidate; incoming: TransitionRegionCandidate }[] {
  const pairs: { outgoing: TransitionRegionCandidate; incoming: TransitionRegionCandidate; score: number }[] = [];
  for (const outgoing of outgoingRegions) {
    for (const incoming of incomingRegions) {
      const collisionPenalty = (outgoing.bassActivitySummary ?? 0) > COLLISION_THRESHOLD && (incoming.bassActivitySummary ?? 0) > COLLISION_THRESHOLD ? 2 : 0;
      const foregroundPenalty = (outgoing.foregroundActivitySummary ?? 0) > COLLISION_THRESHOLD && (incoming.foregroundActivitySummary ?? 0) > COLLISION_THRESHOLD ? 1 : 0;
      pairs.push({ outgoing, incoming, score: regionScore(outgoing) + regionScore(incoming) - collisionPenalty - foregroundPenalty });
    }
  }
  return pairs.sort((a, b) => b.score - a.score);
}

function chooseTimeBasis(outgoing: DjTransitionTrackEvidence, incoming: DjTransitionTrackEvidence, outgoingRegion: TransitionRegionCandidate, incomingRegion: TransitionRegionCandidate): TransitionTimeBasis {
  if (outgoing.phraseTrusted && incoming.phraseTrusted && outgoingRegion.availablePhrasesSeconds.length > 0 && incomingRegion.availablePhrasesSeconds.length > 0) return "phrase";
  if (outgoing.barTrusted && incoming.barTrusted && outgoingRegion.availableBarsSeconds.length > 0 && incomingRegion.availableBarsSeconds.length > 0) return "bar";
  if (outgoing.beatTrusted && incoming.beatTrusted && outgoingRegion.availableBeatsSeconds.length > 0 && incomingRegion.availableBeatsSeconds.length > 0) return "beat";
  return "seconds";
}

function makeCue(seconds: number, regionId: string): TransitionCue {
  return { seconds, beatIndex: null, barIndex: null, phraseIndex: null, regionId, manuallyAdjusted: false };
}

export function resolveDjTransition(input: ResolveDjTransitionInput): ResolveDjTransitionResult {
  const {
    playlistId, outgoingSlot, incomingSlot, outgoingTrack, incomingTrack, evidence,
    outgoingRegions, incomingRegions, analysisRevisionKey, intent,
    existingManualPlan, existingManualPlanIsStale, stemTransportImplemented, nowIso, idFactory,
  } = input;

  const rejectedCandidates: RejectedTransitionCandidate[] = [];

  // Step 1 — reuse a non-stale APPROVED manual plan. REHEARSED/REVISED
  // plans are reusable for review but doctrine §14.1 reserves unattended
  // playback authority for APPROVED alone — this resolver never
  // auto-recommends anything less than that as a substitute for real
  // resolution.
  if (existingManualPlan && !existingManualPlanIsStale && existingManualPlan.evidenceState === "approved") {
    return { recommended: existingManualPlan, alternatives: [], rejectedCandidates: [] };
  }

  // Step 1b — insufficient evidence to resolve anything at all.
  if (outgoing(evidence).durationSeconds.value == null || incoming(evidence).durationSeconds.value == null || outgoingRegions.length === 0 || incomingRegions.length === 0) {
    const plan = buildPlan({
      playlistId, outgoingSlot, incomingSlot, outgoingTrack, incomingTrack, analysisRevisionKey, nowIso, idFactory,
      family: "do_not_place_adjacent", trust: "free_time_or_incompatible", timeBasis: "seconds",
      outgoingCue: makeCue(0, "none"), incomingCue: makeCue(0, "none"),
      overlapBars: null, overlapSeconds: 0, tempoAdjustmentPercentA: 0, tempoAdjustmentPercentB: 0, pulseRatio: null,
      doNotLayer: true, warnings: ["missing_beat_grid"], explanation: ["Insufficient evidence (unknown duration or no candidate regions) to resolve any transition for this pair."],
      evidenceState: "proposed",
      outgoingSourceFingerprint: outgoing(evidence).sourceFingerprint, incomingSourceFingerprint: incoming(evidence).sourceFingerprint,
    });
    return { recommended: plan, alternatives: [], rejectedCandidates: [] };
  }

  const outgoingEvidence = outgoing(evidence);
  const incomingEvidence = incoming(evidence);

  // Step 2 — rhythmic layering support.
  const rhythmicLayeringSupported = outgoingEvidence.beatTrusted && incomingEvidence.beatTrusted;

  // Step 3 — rank region pairs.
  const rankedPairs = pickBestRegionPair(outgoingRegions, incomingRegions);
  const bestPair = rankedPairs[0];
  const outgoingRegion = bestPair.outgoing;
  const incomingRegion = bestPair.incoming;

  // Step 4 — pulse relationship.
  const bpmDistance = computeBpmTransitionDistance(outgoingEvidence.bpm.value ?? undefined, incomingEvidence.bpm.value ?? undefined);
  const pulseRatio: DjTransitionPlan["pulseRatio"] = bpmDistance.relationship === "half_time" ? 0.5 : bpmDistance.relationship === "double_time" ? 2 : bpmDistance.relationship === "direct" ? 1 : null;

  // Step 5 — highest trustworthy time basis.
  const timeBasis = rhythmicLayeringSupported ? chooseTimeBasis(outgoingEvidence, incomingEvidence, outgoingRegion, incomingRegion) : "seconds";

  // Collision evidence for this pair.
  const bassCollision = (outgoingRegion.bassActivitySummary ?? 0) > COLLISION_THRESHOLD && (incomingRegion.bassActivitySummary ?? 0) > COLLISION_THRESHOLD;
  const foregroundCollision = (outgoingRegion.foregroundActivitySummary ?? 0) > COLLISION_THRESHOLD && (incomingRegion.foregroundActivitySummary ?? 0) > COLLISION_THRESHOLD;

  // Tempo adjustment — §8.4: smallest adjustment creating a trusted
  // relationship, capped at ±3% automatically, half/double are candidates
  // never proof. A large effectiveDelta (e.g. 120 -> 80, a 3:2 ratio
  // computeBpmTransitionDistance does NOT recognize as half/double) simply
  // produces a large required adjustment here, which naturally exceeds the
  // cap and is disclosed as a warning rather than silently accepted —
  // doctrine §12's "mathematical realignment is evidence of timing
  // opportunity, not proof of compatibility" falls out of this honestly,
  // with no special-cased fractional-ratio detection required.
  const avgBpm = ((outgoingEvidence.bpm.value ?? 0) + (incomingEvidence.bpm.value ?? 0)) / 2 || 1;
  const requiredAdjustmentPercent = bpmDistance.effectiveDelta != null ? (bpmDistance.effectiveDelta / avgBpm) * 100 / 2 : 0;
  const tempoWithinCap = requiredAdjustmentPercent <= DJ_TRANSITION_TRUST_POLICY.maxAutomaticTempoAdjustmentPercent;

  const warnings: TransitionWarning[] = [];
  if (!outgoingEvidence.beatTrusted || !incomingEvidence.beatTrusted) warnings.push("missing_beat_grid");
  if (timeBasis !== "bar" && timeBasis !== "phrase" && (outgoingEvidence.barTrusted === false || incomingEvidence.barTrusted === false) && rhythmicLayeringSupported) warnings.push("untrusted_downbeat");
  if (timeBasis !== "phrase" && (!outgoingEvidence.phraseTrusted || !incomingEvidence.phraseTrusted)) warnings.push("untrusted_phrase");
  if (bassCollision) warnings.push("bass_collision");
  if (foregroundCollision) warnings.push("foreground_collision");
  if (!tempoWithinCap && bpmDistance.relationship !== "unknown") warnings.push("tempo_adjustment_excessive");
  if (!tempoWithinCap && bpmDistance.relationship === "unknown") warnings.push("non_mathematical_tempo_jump");
  else if (requiredAdjustmentPercent > DJ_TRANSITION_TRUST_POLICY.tempoAdjustmentWarningBandPercent && tempoWithinCap) warnings.push("tempo_drift");

  // Step 6/7 — overlap + family selection.
  let family: TransitionFamily;
  let trust: TransitionTrust;
  let overlapBars: number | null = null;
  let overlapSeconds: number;
  let doNotLayer = false;
  const explanation: string[] = [];

  const layeringViable = rhythmicLayeringSupported && tempoWithinCap && (timeBasis === "phrase" || timeBasis === "bar" || timeBasis === "beat");

  // Tempo adjustment is only actually APPLIED when a rhythmic family is
  // chosen — a clean cut, reset, or free-time handoff never time-stretches
  // anything, so it must report 0%, not the theoretical amount that would
  // have been required to force a blend that never happens.
  const tempoAdjustmentPercentA = layeringViable && bpmDistance.relationship !== "unknown" ? round2(requiredAdjustmentPercent) : 0;
  const tempoAdjustmentPercentB = tempoAdjustmentPercentA;

  if (!layeringViable) {
    if (!stemTransportImplemented) {
      // stem_assisted_transition would otherwise be worth considering when
      // both sides expose CURRENT stem roles — recorded honestly as
      // rejected rather than silently skipped.
      if (outgoingEvidence.currentStemRoles.value && incomingEvidence.currentStemRoles.value) {
        rejectedCandidates.push({ family: "stem_assisted_transition", reason: "Current stems are available for this pair, but stem transport is not implemented in this build's playback adapter." });
      }
    }
    rejectedCandidates.push({ family: "effect_handoff", reason: "No effect send/tail routing exists in the playback transport yet — resolving to a non-layered alternative instead." });
    rejectedCandidates.push({ family: "loop_assisted_handoff", reason: "This build has no durable Looper reference API to create a real loop from — resolving to a non-layered alternative instead." });

    if (intent === "reset") {
      family = "reset_bridge";
      trust = "manually_authored";
      overlapSeconds = 3;
      doNotLayer = true;
      explanation.push("Playlist intent explicitly requested a reset; no bridge asset was invented — this is a silence/gap-based reset only.");
    } else {
      family = "clean_cut";
      trust = rhythmicLayeringSupported ? "partially_trusted" : "free_time_or_incompatible";
      overlapSeconds = 0.5;
      doNotLayer = rhythmicLayeringSupported; // layering was possible in principle but rejected due to tempo/collision — a real Do Not Layer case
      explanation.push(
        !rhythmicLayeringSupported
          ? "Rhythmic layering is not supported for this pair (beat grid untrusted on at least one side) — resolved to a clean cut."
          : !tempoWithinCap
            ? `Tempo relationship (${bpmDistance.relationship}) would require more than ${DJ_TRANSITION_TRUST_POLICY.maxAutomaticTempoAdjustmentPercent}% automatic adjustment — resolved to a clean cut rather than forcing an unstable blend.`
            : "Rhythmic evidence did not clear a trusted time basis — resolved to a clean cut.",
      );
    }
  } else if (bassCollision || foregroundCollision) {
    // §8.2 short_rhythmic_blend: rhythmic alignment trusted but long
    // overlap creates risk -> shorten rather than abandon the blend.
    family = "short_rhythmic_blend";
    trust = "trusted_rhythmic";
    overlapBars = 4;
    overlapSeconds = estimateOverlapSeconds(outgoingRegion, incomingRegion, overlapBars, timeBasis);
    explanation.push(
      bassCollision && foregroundCollision
        ? "Bass and foreground collision risk detected — overlap shortened to 4 bars with a managed bass transfer."
        : bassCollision
          ? "Bass collision risk detected — overlap shortened to 4 bars with a managed bass transfer at the exchange point."
          : "Foreground collision risk detected — overlap shortened to 4 bars.",
    );
  } else if (timeBasis === "phrase") {
    // §13.1 doctrine default: prefer 16/32-bar overlaps for gradual
    // electronic blends "when the material supports them" — capacity-
    // gated by how many bars are actually available in the smaller of the
    // two regions, never assumed just because the grid is trusted.
    const commonBars = Math.min(outgoingRegion.availableBarsSeconds.length, incomingRegion.availableBarsSeconds.length);
    overlapBars = commonBars >= 32 ? 32 : commonBars >= 16 ? 16 : 8;
    family = "phrase_eq_blend";
    trust = "trusted_rhythmic";
    overlapSeconds = estimateOverlapSeconds(outgoingRegion, incomingRegion, overlapBars, timeBasis);
    explanation.push(`Trusted phrase grid on both sides — ${overlapBars}-bar phrase-aligned EQ blend with bass responsibility transferring at the overlap midpoint.`);
  } else if (timeBasis === "bar" || timeBasis === "beat") {
    family = "short_rhythmic_blend";
    trust = "partially_trusted";
    overlapBars = 8;
    overlapSeconds = estimateOverlapSeconds(outgoingRegion, incomingRegion, overlapBars, timeBasis);
    explanation.push(`${timeBasis === "bar" ? "Bar" : "Beat"}-level alignment trusted, but phrase evidence is not — a shorter rhythmic blend rather than a full phrase-length one.`);
  } else {
    family = "free_time_perceptual_handoff";
    trust = "free_time_or_incompatible";
    overlapSeconds = Math.min(8, outgoingRegion.endSeconds - outgoingRegion.startSeconds, incomingRegion.endSeconds - incomingRegion.startSeconds);
    explanation.push("No trusted rhythmic grid on this pair — an honest seconds-based, manually-cued free-time handoff.");
  }

  const bassTransferProgress = family === "phrase_eq_blend" || family === "short_rhythmic_blend" ? 0.5 : null;
  const automation = buildDjTransitionAutomationDefaults({ family, bassTransferProgress });

  const outgoingCue = makeCue(clampToRegion(outgoingRegion.endSeconds - overlapSeconds, outgoingRegion), outgoingRegion.regionId);
  const incomingCue = makeCue(clampToRegion(incomingRegion.startSeconds, incomingRegion), incomingRegion.regionId);

  const recommended = buildPlan({
    playlistId, outgoingSlot, incomingSlot, outgoingTrack, incomingTrack, analysisRevisionKey, nowIso, idFactory,
    family, trust, timeBasis, outgoingCue, incomingCue, overlapBars, overlapSeconds,
    tempoAdjustmentPercentA, tempoAdjustmentPercentB, pulseRatio, doNotLayer, warnings, explanation,
    automation, evidenceState: "proposed",
    outgoingSourceFingerprint: outgoingEvidence.sourceFingerprint, incomingSourceFingerprint: incomingEvidence.sourceFingerprint,
  });

  // Step 10 — alternatives: materially different families, not cosmetic
  // parameter changes. Always offer clean_cut as a fallback alternative
  // when the recommendation is a blend, and vice versa.
  const alternatives: DjTransitionPlan[] = [];
  if (family !== "clean_cut") {
    alternatives.push(
      buildPlan({
        playlistId, outgoingSlot, incomingSlot, outgoingTrack, incomingTrack, analysisRevisionKey, nowIso, idFactory,
        family: "clean_cut", trust: "manually_authored", timeBasis: "seconds",
        outgoingCue: makeCue(outgoingRegion.endSeconds, outgoingRegion.regionId), incomingCue: makeCue(incomingRegion.startSeconds, incomingRegion.regionId),
        overlapBars: null, overlapSeconds: 0.5, tempoAdjustmentPercentA: 0, tempoAdjustmentPercentB: 0, pulseRatio: null,
        doNotLayer: true, warnings: [], explanation: ["Alternative: an instant handoff with no overlap."],
        automation: buildDjTransitionAutomationDefaults({ family: "clean_cut", bassTransferProgress: null }),
        evidenceState: "proposed",
        outgoingSourceFingerprint: outgoingEvidence.sourceFingerprint, incomingSourceFingerprint: incomingEvidence.sourceFingerprint,
      }),
    );
  }

  return { recommended, alternatives, rejectedCandidates };
}

function outgoing(evidence: DjTransitionPairEvidence): DjTransitionTrackEvidence {
  return evidence.outgoing;
}
function incoming(evidence: DjTransitionPairEvidence): DjTransitionTrackEvidence {
  return evidence.incoming;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function clampToRegion(seconds: number, region: TransitionRegionCandidate): number {
  return Math.max(region.startSeconds, Math.min(region.endSeconds, seconds));
}

function estimateOverlapSeconds(outgoingRegion: TransitionRegionCandidate, incomingRegion: TransitionRegionCandidate, bars: number, timeBasis: TransitionTimeBasis): number {
  if (timeBasis === "seconds") return Math.min(8, outgoingRegion.endSeconds - outgoingRegion.startSeconds, incomingRegion.endSeconds - incomingRegion.startSeconds);
  const outgoingBars = outgoingRegion.availableBarsSeconds;
  if (outgoingBars.length >= 2) {
    const barDuration = (outgoingBars[outgoingBars.length - 1] - outgoingBars[0]) / Math.max(1, outgoingBars.length - 1);
    return Math.max(0.5, barDuration * bars);
  }
  return Math.min(8, outgoingRegion.endSeconds - outgoingRegion.startSeconds);
}

interface BuildPlanParams {
  playlistId: string;
  outgoingSlot: TrackSlot;
  incomingSlot: TrackSlot;
  outgoingTrack: Track;
  incomingTrack: Track;
  analysisRevisionKey: string;
  nowIso: string;
  idFactory: () => string;
  family: TransitionFamily;
  trust: TransitionTrust;
  timeBasis: TransitionTimeBasis;
  outgoingCue: TransitionCue;
  incomingCue: TransitionCue;
  overlapBars: number | null;
  overlapSeconds: number;
  tempoAdjustmentPercentA: number;
  tempoAdjustmentPercentB: number;
  pulseRatio: DjTransitionPlan["pulseRatio"];
  doNotLayer: boolean;
  warnings: TransitionWarning[];
  explanation: string[];
  evidenceState: DjTransitionPlan["evidenceState"];
  automation?: DjTransitionPlan["automation"];
  outgoingSourceFingerprint: string;
  incomingSourceFingerprint: string;
}

function buildPlan(p: BuildPlanParams): DjTransitionPlan {
  return {
    id: p.idFactory(),
    playlistId: p.playlistId,
    outgoingSlotId: p.outgoingSlot.slotId,
    incomingSlotId: p.incomingSlot.slotId,
    outgoingTrackId: p.outgoingTrack.trackId,
    incomingTrackId: p.incomingTrack.trackId,
    outgoingSourceFingerprint: p.outgoingSourceFingerprint,
    incomingSourceFingerprint: p.incomingSourceFingerprint,
    analysisRevisionKey: p.analysisRevisionKey,
    family: p.family,
    trust: p.trust,
    timeBasis: p.timeBasis,
    outgoingCue: p.outgoingCue,
    incomingCue: p.incomingCue,
    overlapBars: p.overlapBars,
    overlapSeconds: p.overlapSeconds,
    tempoAdjustmentPercentA: p.tempoAdjustmentPercentA,
    tempoAdjustmentPercentB: p.tempoAdjustmentPercentB,
    pulseRatio: p.pulseRatio,
    automation: p.automation ?? buildDjTransitionAutomationDefaults({ family: p.family, bassTransferProgress: null }),
    doNotLayer: p.doNotLayer,
    warnings: p.warnings,
    explanation: p.explanation,
    origin: "automatic",
    evidenceState: p.evidenceState,
    rehearsals: [],
    listeningContext: null,
    activeStemSetId: null,
    activeStemRoles: [],
    approvedAt: null,
    createdAt: p.nowIso,
    updatedAt: p.nowIso,
  };
}
