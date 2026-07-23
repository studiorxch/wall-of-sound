// DJ Transition Engine (0722D) — shadow-mode orchestration. This is the
// ONE place in the whole pipeline that touches asynchronous I/O (stem-set
// lookup); everything it calls into (djTransitionEvidence.ts,
// djTransitionRegions.ts, djTransitionResolver.ts) stays fully synchronous
// and pure, receiving already-resolved data as plain arguments per this
// build's own "no I/O inside pure logic" rule.
//
// Shadow mode NEVER touches playback: this module only resolves and
// returns a `ResolveDjTransitionResult` for display. Nothing here writes to
// PlaylistRecord.djTransitionPlans, nothing here is consulted by
// preparePlaylistForPlayback or DualDeckPlaybackEngine. That wiring is
// explicitly out of scope for this checkpoint (active mode, task #43).

import type { PlaylistRecord } from "../data/playProjectTypes";
import type { Track } from "../data/trackTypes";
import type { TrackSlot } from "../data/playlistTypes";
import type { CompleteSongAnalysis } from "../data/songAnalysisTypes";
import type { StemRole } from "../data/trackStemTypes";
import type { PlaylistTransitionPlan } from "../data/playlistTransitionTypes";
import { assembleDjTransitionPairEvidence, type DjTransitionEvidenceTrackInput } from "./djTransitionEvidence";
import { selectDjTransitionRegions } from "./djTransitionRegions";
import { resolveDjTransition, type ResolveDjTransitionResult } from "./djTransitionResolver";
import { fetchStemSets, resolveTrackAudioIdentifier } from "./stems/stemClient";

export interface DjTransitionShadowPair {
  pairKey: string;
  outgoingSlot: TrackSlot;
  incomingSlot: TrackSlot;
  outgoingTrack: Track;
  incomingTrack: Track;
}

// Real, ordered, assigned adjacent pairs from the playlist's own slot
// order — independent of whether the legacy playbackPreparation has ever
// run, so shadow diagnostics are available for any playlist with at least
// two assigned tracks.
export function computeAdjacentAssignedPairs(playlist: PlaylistRecord, tracksById: Map<string, Track>): DjTransitionShadowPair[] {
  const ordered = [...playlist.slots].sort((a, b) => a.slotIndex - b.slotIndex).filter((s) => s.assignedTrackId);
  const pairs: DjTransitionShadowPair[] = [];
  for (let i = 0; i < ordered.length - 1; i++) {
    const outgoingSlot = ordered[i];
    const incomingSlot = ordered[i + 1];
    const outgoingTrack = tracksById.get(outgoingSlot.assignedTrackId!);
    const incomingTrack = tracksById.get(incomingSlot.assignedTrackId!);
    if (!outgoingTrack || !incomingTrack) continue;
    pairs.push({
      pairKey: `${outgoingSlot.slotId}__${incomingSlot.slotId}`,
      outgoingSlot, incomingSlot, outgoingTrack, incomingTrack,
    });
  }
  return pairs;
}

export function findLegacyPlanForPair(playlist: PlaylistRecord, pair: DjTransitionShadowPair): PlaylistTransitionPlan | null {
  const plans = playlist.playbackPreparation?.transitionPlans ?? [];
  return plans.find((p) => p.fromSlotId === pair.outgoingSlot.slotId && p.toSlotId === pair.incomingSlot.slotId) ?? null;
}

async function resolveCurrentStemRoles(track: Track): Promise<Partial<Record<StemRole, boolean>>> {
  const audioRelPath = resolveTrackAudioIdentifier(track);
  if (!audioRelPath) return {};
  try {
    const res = await fetchStemSets(track.trackId, audioRelPath);
    if (!res.ok) return {};
    const current = res.sets.find((s) => res.lifecycles[s.id]?.lifecycle === "current");
    if (!current) return {};
    const roles: Partial<Record<StemRole, boolean>> = {};
    for (const role of Object.keys(current.stems) as StemRole[]) roles[role] = true;
    return roles;
  } catch {
    // Fail closed — no stem evidence, never a guess.
    return {};
  }
}

// Exported for reuse by the active-mode authority gate wiring
// (usePreparedPlaybackController.ts), which needs the exact same
// fingerprint/revision-key computation to re-check staleness synchronously
// on the live playback path — never a second, subtly-different formula.
export function sourceFingerprintFor(track: Track, songAnalysis?: CompleteSongAnalysis): string {
  return songAnalysis?.sourceMediaFingerprint ?? track.playbackBounds?.sourceFingerprint ?? "";
}

export function analysisRevisionMarkerFor(track: Track): string {
  return `${track.analysisUpdatedAt ?? ""}|${track.beatMap?.analyzedAt ?? ""}|${track.playbackBounds?.analyzedAt ?? ""}`;
}

function evidenceInputFor(track: Track, songAnalysis: CompleteSongAnalysis | undefined, stemRoles: Partial<Record<StemRole, boolean>>): DjTransitionEvidenceTrackInput {
  return {
    track,
    beatMap: track.beatMap,
    playbackBounds: track.playbackBounds,
    songAnalysis,
    currentStemRoleAvailability: stemRoles,
    sourceFingerprint: sourceFingerprintFor(track, songAnalysis),
  };
}

let shadowIdCounter = 0;
function nextShadowId(): string {
  shadowIdCounter += 1;
  return `dj-shadow-${shadowIdCounter}`;
}

export interface DjTransitionShadowResolution {
  pairKey: string;
  result: ResolveDjTransitionResult;
  evidence: ReturnType<typeof assembleDjTransitionPairEvidence>;
  outgoingRegions: ReturnType<typeof selectDjTransitionRegions>;
  incomingRegions: ReturnType<typeof selectDjTransitionRegions>;
}

// The single async entry point. Fetches stem availability for both tracks
// (the one real I/O step), then runs the fully synchronous
// evidence -> regions -> resolver pipeline. `stemTransportImplemented` is
// hardcoded false — this build's playback adapter doesn't exist yet
// (task #43), so the resolver must never be told otherwise.
export async function resolveDjTransitionPairShadow(
  pair: DjTransitionShadowPair,
  playlistId: string,
  songAnalysesByTrackId: Map<string, CompleteSongAnalysis>,
): Promise<DjTransitionShadowResolution> {
  const [outgoingStemRoles, incomingStemRoles] = await Promise.all([
    resolveCurrentStemRoles(pair.outgoingTrack),
    resolveCurrentStemRoles(pair.incomingTrack),
  ]);

  const outgoingSongAnalysis = songAnalysesByTrackId.get(pair.outgoingTrack.trackId);
  const incomingSongAnalysis = songAnalysesByTrackId.get(pair.incomingTrack.trackId);

  const evidence = assembleDjTransitionPairEvidence(
    evidenceInputFor(pair.outgoingTrack, outgoingSongAnalysis, outgoingStemRoles),
    evidenceInputFor(pair.incomingTrack, incomingSongAnalysis, incomingStemRoles),
  );

  const outgoingRegions = selectDjTransitionRegions({ side: "outgoing", evidence: evidence.outgoing, playbackBounds: pair.outgoingTrack.playbackBounds });
  const incomingRegions = selectDjTransitionRegions({ side: "incoming", evidence: evidence.incoming, playbackBounds: pair.incomingTrack.playbackBounds });

  const analysisRevisionKey = `${analysisRevisionMarkerFor(pair.outgoingTrack)}::${analysisRevisionMarkerFor(pair.incomingTrack)}`;

  const result = resolveDjTransition({
    playlistId,
    outgoingSlot: pair.outgoingSlot,
    incomingSlot: pair.incomingSlot,
    outgoingTrack: pair.outgoingTrack,
    incomingTrack: pair.incomingTrack,
    evidence,
    outgoingRegions,
    incomingRegions,
    analysisRevisionKey,
    // No DjTransitionPlan is ever persisted in shadow mode (no editor/save
    // path exists yet at this checkpoint) — always resolve fresh.
    existingManualPlan: undefined,
    existingManualPlanIsStale: undefined,
    stemTransportImplemented: false,
    nowIso: new Date().toISOString(),
    idFactory: nextShadowId,
  });

  return { pairKey: pair.pairKey, result, evidence, outgoingRegions, incomingRegions };
}
