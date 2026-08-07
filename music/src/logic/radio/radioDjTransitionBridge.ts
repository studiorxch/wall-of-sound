import type { RadioPlaylist } from "../../data/radioPlaylistTypes";
import type { PlaylistRecord } from "../../data/playProjectTypes";
import type { Track } from "../../data/trackTypes";
import type { CompleteSongAnalysis } from "../../data/songAnalysisTypes";
import type { DjTransitionPlan } from "../../data/djTransitionTypes";
import type { RadioWebBundleExportRequest } from "../../data/radioWebBundleTypes";
import { assembleDjTransitionTrackEvidence } from "../djTransitionEvidence";
import { selectDjTransitionRegions } from "../djTransitionRegions";
import { analysisRevisionMarkerFor, sourceFingerprintFor } from "../djTransitionShadowResolve";
import { resolveTransitionHintForAdjacency } from "./radioWebTransitionHint";

export interface RadioExportReadyEntry {
  entryId: string;
  sourceTrackId: string | null;
}

export interface RadioExportResolvedTransition {
  incomingEntryId: string;
  djTransitionPlan: DjTransitionPlan;
  djTransitionContext: NonNullable<NonNullable<RadioWebBundleExportRequest["entries"][number]["djTransitionContext"]>>;
}

interface SourceAdjacency {
  outgoingSlotId: string;
  incomingSlotId: string;
  outgoingTrackId: string;
  incomingTrackId: string;
}

function orderedAssignedAdjacencies(sourcePlaylist: PlaylistRecord): SourceAdjacency[] {
  const ordered = sourcePlaylist.slots
    .slice()
    .sort((a, b) => a.slotIndex - b.slotIndex)
    .filter((slot) => slot.assignedTrackId);

  const adjacencies: SourceAdjacency[] = [];
  for (let i = 0; i < ordered.length - 1; i += 1) {
    adjacencies.push({
      outgoingSlotId: ordered[i].slotId,
      incomingSlotId: ordered[i + 1].slotId,
      outgoingTrackId: ordered[i].assignedTrackId!,
      incomingTrackId: ordered[i + 1].assignedTrackId!,
    });
  }
  return adjacencies;
}

export function resolveRadioExportDjTransitions(
  radioPlaylist: RadioPlaylist,
  readyEntries: RadioExportReadyEntry[],
  sourceMusicPlaylists: PlaylistRecord[],
  libraryTracks: Track[],
  songAnalyses: CompleteSongAnalysis[],
): Map<string, RadioExportResolvedTransition> {
  const resolved = new Map<string, RadioExportResolvedTransition>();
  if (!radioPlaylist.sourceMusicPlaylistId) return resolved;

  const sourcePlaylist = sourceMusicPlaylists.find((playlist) => playlist.playlistId === radioPlaylist.sourceMusicPlaylistId);
  if (!sourcePlaylist) return resolved;

  const adjacencies = orderedAssignedAdjacencies(sourcePlaylist);
  if (adjacencies.length === 0) return resolved;

  const tracksById = new Map(libraryTracks.map((track) => [track.trackId, track]));
  const analysesByTrackId = new Map(songAnalyses.map((analysis) => [analysis.sourceTrackId, analysis]));

  for (let i = 1; i < readyEntries.length; i += 1) {
    const outgoingEntry = readyEntries[i - 1];
    const incomingEntry = readyEntries[i];
    if (!outgoingEntry.sourceTrackId || !incomingEntry.sourceTrackId) continue;

    const matchingAdjacencies = adjacencies.filter(
      (adjacency) =>
        adjacency.outgoingTrackId === outgoingEntry.sourceTrackId &&
        adjacency.incomingTrackId === incomingEntry.sourceTrackId,
    );
    if (matchingAdjacencies.length !== 1) continue;

    const matchedAdjacency = matchingAdjacencies[0];
    const matchingPlans = (sourcePlaylist.djTransitionPlans ?? []).filter(
      (plan) =>
        plan.outgoingSlotId === matchedAdjacency.outgoingSlotId &&
        plan.incomingSlotId === matchedAdjacency.incomingSlotId,
    );
    if (matchingPlans.length !== 1) continue;

    const outgoingTrack = tracksById.get(matchedAdjacency.outgoingTrackId);
    const incomingTrack = tracksById.get(matchedAdjacency.incomingTrackId);
    if (!outgoingTrack || !incomingTrack) continue;

    const outgoingSongAnalysis = analysesByTrackId.get(outgoingTrack.trackId);
    const incomingSongAnalysis = analysesByTrackId.get(incomingTrack.trackId);

    const outgoingEvidence = assembleDjTransitionTrackEvidence({
      track: outgoingTrack,
      beatMap: outgoingTrack.beatMap,
      playbackBounds: outgoingTrack.playbackBounds,
      songAnalysis: outgoingSongAnalysis,
      currentStemRoleAvailability: {},
      sourceFingerprint: sourceFingerprintFor(outgoingTrack, outgoingSongAnalysis),
    });
    const incomingEvidence = assembleDjTransitionTrackEvidence({
      track: incomingTrack,
      beatMap: incomingTrack.beatMap,
      playbackBounds: incomingTrack.playbackBounds,
      songAnalysis: incomingSongAnalysis,
      currentStemRoleAvailability: {},
      sourceFingerprint: sourceFingerprintFor(incomingTrack, incomingSongAnalysis),
    });

    const djTransitionContext = {
      currentOutgoingTrackId: outgoingTrack.trackId,
      currentIncomingTrackId: incomingTrack.trackId,
      currentOutgoingSourceFingerprint: sourceFingerprintFor(outgoingTrack, outgoingSongAnalysis),
      currentIncomingSourceFingerprint: sourceFingerprintFor(incomingTrack, incomingSongAnalysis),
      currentAnalysisRevisionKey: `${analysisRevisionMarkerFor(outgoingTrack)}::${analysisRevisionMarkerFor(incomingTrack)}`,
      outgoingRegionsNow: selectDjTransitionRegions({ side: "outgoing", evidence: outgoingEvidence, playbackBounds: outgoingTrack.playbackBounds }),
      incomingRegionsNow: selectDjTransitionRegions({ side: "incoming", evidence: incomingEvidence, playbackBounds: incomingTrack.playbackBounds }),
      activeStemSetLostCurrency: false,
    } satisfies RadioExportResolvedTransition["djTransitionContext"];

    const djTransitionPlan = matchingPlans[0];
    const authorizedHint = resolveTransitionHintForAdjacency({
      djTransitionMode: "active",
      plan: djTransitionPlan,
      ...djTransitionContext,
    });
    if (!authorizedHint) continue;

    resolved.set(incomingEntry.entryId, {
      incomingEntryId: incomingEntry.entryId,
      djTransitionPlan,
      djTransitionContext,
    });
  }

  return resolved;
}
