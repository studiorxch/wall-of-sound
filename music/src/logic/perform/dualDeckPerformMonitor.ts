import type { DjActiveExecutionDiagnostics } from "../../audio/usePreparedPlaybackController";
import type { PlaybackDeckState, PlaylistPlaybackSession, PreparedPlaybackRuntimeFallback } from "../../audio/dualDeckTypes";
import { compileDjTransition, type DjTransitionExecutionStrategy } from "../../audio/djTransitionPlayback";
import type { CompleteSongAnalysis, SongWaveformSummary } from "../../data/songAnalysisTypes";
import type { CuePoint, Track } from "../../data/trackTypes";
import type { DjTransitionPlan, TransitionCue } from "../../data/djTransitionTypes";
import type { PlaylistRecord } from "../../data/playProjectTypes";
import type { DjTransitionMode } from "../djTransitionModeStorage";
import { evaluateDjTransitionAuthority, type DjTransitionAuthorityResult } from "../djTransitionAuthorityGate";
import { assembleDjTransitionTrackEvidence, type TransitionSectionEvidence } from "../djTransitionEvidence";
import { selectDjTransitionRegions, type TransitionRegionCandidate } from "../djTransitionRegions";
import { isDjTransitionPlanStale } from "../djTransitionStaleness";
import { analysisRevisionMarkerFor, sourceFingerprintFor } from "../djTransitionShadowResolve";

export interface PerformTimingOverlay {
  beats: number[] | null;
  bars: number[] | null;
  phrases: number[] | null;
  sections: TransitionSectionEvidence[];
}

export interface PerformDeckMonitor {
  deckId: "A" | "B";
  state: PlaybackDeckState;
  track: Track | null;
  waveform: SongWaveformSummary | null;
  genericCues: CuePoint[];
  transitionCue: TransitionCue | null;
  selectedRegion: TransitionRegionCandidate | null;
  timing: PerformTimingOverlay;
}

export interface PerformTransitionMonitor {
  adjacency: { outgoingSlotId: string; incomingSlotId: string } | null;
  plan: DjTransitionPlan | null;
  stale: boolean | null;
  authority: DjTransitionAuthorityResult | null;
  compiledStrategy: DjTransitionExecutionStrategy | null;
  actualExecution: "active" | "legacy_fallback" | "not_executed";
  actualExecutionAdjacency: string | null;
  actualExecutionReason: string | null;
}

export interface DualDeckPerformMonitor {
  decks: Record<"A" | "B", PerformDeckMonitor>;
  transition: PerformTransitionMonitor;
}

export interface BuildDualDeckPerformMonitorInput {
  playlist: PlaylistRecord | undefined;
  decks: Record<"A" | "B", PlaybackDeckState> | null;
  session: PlaylistPlaybackSession | null;
  tracksById: ReadonlyMap<string, Track>;
  songAnalyses: CompleteSongAnalysis[];
  djTransitionMode: DjTransitionMode;
  djActiveDiagnostics: DjActiveExecutionDiagnostics | null;
  runtimeFallback?: PreparedPlaybackRuntimeFallback;
  fallbackReason?: string;
}

interface ResolvedDeckEvidence {
  model: PerformDeckMonitor;
  regions: TransitionRegionCandidate[];
}

function emptyDeck(deckId: "A" | "B"): PerformDeckMonitor {
  return {
    deckId,
    state: { deckId, role: "idle", state: "empty", currentTimeSeconds: 0, gain: 1, muted: false },
    track: null,
    waveform: null,
    genericCues: [],
    transitionCue: null,
    selectedRegion: null,
    timing: { beats: null, bars: null, phrases: null, sections: [] },
  };
}

function resolveDeck(
  deckId: "A" | "B",
  state: PlaybackDeckState | undefined,
  side: "outgoing" | "incoming" | null,
  tracksById: ReadonlyMap<string, Track>,
  analysesByTrackId: ReadonlyMap<string, CompleteSongAnalysis>,
): ResolvedDeckEvidence {
  if (!state?.trackId) return { model: state ? { ...emptyDeck(deckId), state } : emptyDeck(deckId), regions: [] };
  const track = tracksById.get(state.trackId) ?? null;
  if (!track) return { model: { ...emptyDeck(deckId), state }, regions: [] };
  const analysis = analysesByTrackId.get(track.trackId);
  const evidence = assembleDjTransitionTrackEvidence({
    track,
    beatMap: track.beatMap,
    playbackBounds: track.playbackBounds,
    songAnalysis: analysis,
    currentStemRoleAvailability: {},
    sourceFingerprint: sourceFingerprintFor(track, analysis),
  });
  const regions = side
    ? selectDjTransitionRegions({ side, evidence, playbackBounds: track.playbackBounds })
    : [];
  return {
    model: {
      deckId,
      state,
      track,
      waveform: analysis?.waveformSummary ?? null,
      genericCues: track.cuePoints ?? [],
      transitionCue: null,
      selectedRegion: null,
      timing: {
        beats: evidence.beatTrusted ? evidence.beatTimesSeconds.value : null,
        bars: evidence.barTrusted ? evidence.barStartTimesSeconds.value : null,
        phrases: evidence.phraseTrusted ? evidence.phraseBoundarySeconds.value : null,
        sections: evidence.verifiedSections,
      },
    },
    regions,
  };
}

function actualExecutionOf(
  diagnostics: DjActiveExecutionDiagnostics | null,
  runtimeFallback: PreparedPlaybackRuntimeFallback | undefined,
  fallbackReason: string | undefined,
): Pick<PerformTransitionMonitor, "actualExecution" | "actualExecutionAdjacency" | "actualExecutionReason"> {
  if (diagnostics) {
    if (diagnostics.executed) return { actualExecution: "active", actualExecutionAdjacency: diagnostics.legacyTransitionId, actualExecutionReason: null };
    if (diagnostics.legacyExecutedInstead) {
      return { actualExecution: "legacy_fallback", actualExecutionAdjacency: diagnostics.legacyTransitionId, actualExecutionReason: diagnostics.reason };
    }
  }
  if (runtimeFallback && runtimeFallback !== "none") {
    return { actualExecution: "legacy_fallback", actualExecutionAdjacency: null, actualExecutionReason: fallbackReason ?? runtimeFallback };
  }
  return { actualExecution: "not_executed", actualExecutionAdjacency: null, actualExecutionReason: null };
}

export function buildDualDeckPerformMonitor(input: BuildDualDeckPerformMonitorInput): DualDeckPerformMonitor {
  const analysesByTrackId = new Map(input.songAnalyses.map((analysis) => [analysis.sourceTrackId, analysis]));
  const activeDeckId = input.session?.activeDeckId ?? null;
  const incomingDeckId = input.session?.incomingDeckId ?? null;
  const resolvedA = resolveDeck("A", input.decks?.A, activeDeckId === "A" ? "outgoing" : incomingDeckId === "A" ? "incoming" : null, input.tracksById, analysesByTrackId);
  const resolvedB = resolveDeck("B", input.decks?.B, activeDeckId === "B" ? "outgoing" : incomingDeckId === "B" ? "incoming" : null, input.tracksById, analysesByTrackId);
  const resolved = { A: resolvedA, B: resolvedB };

  const outgoing = activeDeckId ? resolved[activeDeckId] : null;
  const incoming = incomingDeckId ? resolved[incomingDeckId] : null;
  const outgoingState = outgoing?.model.state;
  const incomingState = incoming?.model.state;
  const hasExactLiveAdjacency = Boolean(
    input.playlist && outgoingState?.slotId && incomingState?.slotId &&
    outgoingState.trackId && incomingState.trackId && outgoing?.model.track && incoming?.model.track,
  );
  const matchingPlans = hasExactLiveAdjacency
    ? (input.playlist?.djTransitionPlans ?? []).filter((plan) =>
        plan.outgoingSlotId === outgoingState!.slotId &&
        plan.incomingSlotId === incomingState!.slotId &&
        plan.outgoingTrackId === outgoingState!.trackId &&
        plan.incomingTrackId === incomingState!.trackId)
    : [];
  const plan = matchingPlans.length === 1 ? matchingPlans[0] : null;
  const actual = actualExecutionOf(input.djActiveDiagnostics, input.runtimeFallback, input.fallbackReason);

  if (!hasExactLiveAdjacency || !outgoing || !incoming) {
    return {
      decks: { A: resolvedA.model, B: resolvedB.model },
      transition: { adjacency: null, plan: null, stale: null, authority: null, compiledStrategy: null, ...actual },
    };
  }

  const outgoingTrack = outgoing.model.track!;
  const incomingTrack = incoming.model.track!;
  const outgoingAnalysis = analysesByTrackId.get(outgoingTrack.trackId);
  const incomingAnalysis = analysesByTrackId.get(incomingTrack.trackId);
  const selectedRegionsStillExist = Boolean(plan) &&
    (plan!.outgoingCue.regionId == null || outgoing.regions.some((region) => region.regionId === plan!.outgoingCue.regionId)) &&
    (plan!.incomingCue.regionId == null || incoming.regions.some((region) => region.regionId === plan!.incomingCue.regionId));
  const revisionKey = `${analysisRevisionMarkerFor(outgoingTrack)}::${analysisRevisionMarkerFor(incomingTrack)}`;
  const stale = plan ? isDjTransitionPlanStale({
    plan,
    currentOutgoingTrackId: outgoingTrack.trackId,
    currentIncomingTrackId: incomingTrack.trackId,
    currentOutgoingSourceFingerprint: sourceFingerprintFor(outgoingTrack, outgoingAnalysis),
    currentIncomingSourceFingerprint: sourceFingerprintFor(incomingTrack, incomingAnalysis),
    currentAnalysisRevisionKey: revisionKey,
    selectedRegionsStillExist,
    activeStemSetLostCurrency: false,
  }) : null;
  const authority = evaluateDjTransitionAuthority({
    djTransitionMode: input.djTransitionMode,
    plan: plan ?? undefined,
    currentOutgoingTrackId: outgoingTrack.trackId,
    currentIncomingTrackId: incomingTrack.trackId,
    currentOutgoingSourceFingerprint: sourceFingerprintFor(outgoingTrack, outgoingAnalysis),
    currentIncomingSourceFingerprint: sourceFingerprintFor(incomingTrack, incomingAnalysis),
    currentAnalysisRevisionKey: revisionKey,
    outgoingRegionsNow: outgoing.regions,
    incomingRegionsNow: incoming.regions,
    activeStemSetLostCurrency: false,
    outgoingDeckState: outgoingState!.state,
    incomingDeckState: incomingState!.state,
  });
  const compilation = plan ? compileDjTransition(plan) : null;

  outgoing.model.transitionCue = plan?.outgoingCue ?? null;
  incoming.model.transitionCue = plan?.incomingCue ?? null;
  outgoing.model.selectedRegion = plan?.outgoingCue.regionId
    ? outgoing.regions.find((region) => region.regionId === plan.outgoingCue.regionId) ?? null
    : null;
  incoming.model.selectedRegion = plan?.incomingCue.regionId
    ? incoming.regions.find((region) => region.regionId === plan.incomingCue.regionId) ?? null
    : null;

  return {
    decks: { A: resolvedA.model, B: resolvedB.model },
    transition: {
      adjacency: { outgoingSlotId: outgoingState!.slotId!, incomingSlotId: incomingState!.slotId! },
      plan,
      stale,
      authority,
      compiledStrategy: compilation?.compiled ? compilation.strategy : null,
      ...actual,
    },
  };
}
