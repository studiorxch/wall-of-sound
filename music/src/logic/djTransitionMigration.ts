// DJ Transition Engine (0722D) §5.3 — legacy migration. "Legacy" here means
// the existing PlaylistTransitionPlan/playlistTransition pipeline, which
// remains the production system this build runs alongside (see
// djTransitionTypes.ts's header comment). Migrating a PlaylistTransitionPlan
// into a DjTransitionPlan produces a conservative, low-confidence starting
// point only — it never invents beats, bars, phrases, or a bass-transfer
// point, and it must never itself change playback behavior: a migrated
// plan starts life inert (evidenceState:"proposed") and only earns
// automation authority through djTransitionAutomationGate.ts like any other
// automatically-resolved plan.

import type { PlaylistTransitionPlan } from "../data/playlistTransitionTypes";
import type { DjTransitionPlan, TransitionCue, TransitionFamily, TransitionTrust } from "../data/djTransitionTypes";
import { DJ_TRANSITION_DETECTOR_VERSION } from "../data/djTransitionTypes";

export interface MigrateLegacyTransitionInput {
  legacyPlan: PlaylistTransitionPlan;
  outgoingSourceFingerprint: string;
  incomingSourceFingerprint: string;
  analysisRevisionKey: string;
  nowIso: string;
  idFactory: () => string;
}

const RHYTHMIC_SYNC_MODES: ReadonlySet<PlaylistTransitionPlan["syncMode"]> = new Set(["beat_sync", "bar_sync", "phrase_sync"]);

// Rhythmic alignment counts as "independently proven" only when the legacy
// plan itself both (a) chose a rhythmic sync mode, not a timed/gapless/
// hard-cut/unsynced fallback, and (b) trusted both sides' beat maps — never
// inferred from confidence alone, since a high confidence score can still
// come from non-rhythmic fits (bpmFit/keyFit/energyContinuityFit).
function legacyPlanProvesRhythmicAlignment(legacyPlan: PlaylistTransitionPlan): boolean {
  return (
    RHYTHMIC_SYNC_MODES.has(legacyPlan.syncMode) &&
    legacyPlan.evidence.fromBeatMapTrusted &&
    legacyPlan.evidence.toBeatMapTrusted
  );
}

function seedCue(seconds: number): TransitionCue {
  return {
    seconds,
    beatIndex: null,
    barIndex: null,
    phraseIndex: null,
    regionId: null,
    manuallyAdjusted: false,
  };
}

export function migrateLegacyTransitionPlan(input: MigrateLegacyTransitionInput): DjTransitionPlan {
  const { legacyPlan, outgoingSourceFingerprint, incomingSourceFingerprint, analysisRevisionKey, nowIso, idFactory } = input;

  const rhythmicallyProven = legacyPlanProvesRhythmicAlignment(legacyPlan);
  const family: TransitionFamily = rhythmicallyProven ? "short_rhythmic_blend" : "free_time_perceptual_handoff";
  const trust: TransitionTrust = rhythmicallyProven ? "partially_trusted" : "free_time_or_incompatible";

  return {
    id: idFactory(),
    playlistId: legacyPlan.playlistId,
    outgoingSlotId: legacyPlan.fromSlotId,
    incomingSlotId: legacyPlan.toSlotId,
    outgoingTrackId: legacyPlan.fromTrackId,
    incomingTrackId: legacyPlan.toTrackId,
    outgoingSourceFingerprint,
    incomingSourceFingerprint,
    analysisRevisionKey,
    family,
    trust,
    // Never invented: a migrated plan is seconds-based even when the
    // legacy plan reports bar_sync/beat_sync, because the legacy system's
    // own bar/beat indices are not carried across (only its seconds are
    // trustworthy here without re-resolving through the DJ evidence gates).
    timeBasis: "seconds",
    outgoingCue: seedCue(legacyPlan.outgoingCueSeconds),
    incomingCue: seedCue(legacyPlan.incomingCueSeconds),
    overlapBars: null,
    overlapSeconds: legacyPlan.transitionDurationSeconds,
    tempoAdjustmentPercentA: 0,
    tempoAdjustmentPercentB: 0,
    pulseRatio: null,
    automation: {
      outgoingGain: [
        { progress: 0, gainDb: 0 },
        { progress: 1, gainDb: -60 },
      ],
      incomingGain: [
        { progress: 0, gainDb: -60 },
        { progress: 1, gainDb: 0 },
      ],
      outgoingEq: [],
      incomingEq: [],
      bassTransferProgress: null,
    },
    doNotLayer: false,
    warnings: rhythmicallyProven ? [] : ["missing_beat_grid"],
    explanation: [
      rhythmicallyProven
        ? `Migrated from the existing playlist crossfade (${legacyPlan.syncMode}, ${legacyPlan.transitionDurationSeconds.toFixed(1)}s). Rhythmic alignment was trusted by the legacy system, but bar/beat/phrase positions were not carried over — re-resolve to recover them.`
        : `Migrated from the existing playlist crossfade (${legacyPlan.syncMode}, ${legacyPlan.transitionDurationSeconds.toFixed(1)}s) as a free-time gain blend. The legacy system did not trust a rhythmic alignment for this pair.`,
    ],
    origin: "automatic",
    evidenceState: "proposed",
    rehearsals: [],
    listeningContext: null,
    activeStemSetId: null,
    activeStemRoles: [],
    approvedAt: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

export const DJ_TRANSITION_MIGRATION_DETECTOR_VERSION = DJ_TRANSITION_DETECTOR_VERSION;
