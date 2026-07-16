import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { Track } from "../../data/trackTypes";
import type { CrateRecord } from "../../data/crateTypes";
import type { PlaylistRecord } from "../../data/playProjectTypes";
import type {
  PlaylistIssue, PlaylistRepairState, PlaylistIssueDisposition, LibraryGapRecord,
  PlaylistRepairCandidate, PlaylistReanalysisProgress,
} from "../../data/playlistRepairTypes";
import { computePlaylistRepairSnapshot } from "../../logic/playlistRepair/repairSnapshot";
import { issueKey } from "../../logic/playlistRepair/issueDetection";
import { buildRepairZone } from "../../logic/playlistRepair/repairZone";
import { searchRepairCandidates } from "../../logic/playlistRepair/candidateSearch";
import { rankRepairCandidates } from "../../logic/playlistRepair/candidateRanking";
import { buildMissingTrackBrief } from "../../logic/playlistRepair/missingTrackBrief";
import { mergeBriefIntoGapRegister } from "../../logic/playlistRepair/libraryGapRegister";
import { getEnergyTargetAtPosition } from "../../logic/playlistEnergyEnvelope";
import { PlaylistIssueMarker } from "./PlaylistIssueMarker";
import { previewCandidateTransition } from "../../logic/playlistRepair/candidateTransitionPreview";
import { countStaleLocalTransitions, reprepareLocalTransitions } from "../../logic/playlistTransition/preparePlaylist";
import type { PlaylistTransitionPlan } from "../../data/playlistTransitionTypes";

interface Props {
  playlist: PlaylistRecord;
  libraryTracks: Track[];
  crates: CrateRecord[];
  libraryGaps: LibraryGapRecord[];
  onLibraryGapsChange: (gaps: LibraryGapRecord[]) => void;
  onReplaceSlot: (trackId: string, slotIndex: number) => void;
  onRepairStateChange: (state: PlaylistRepairState) => void;
  onReanalyzePlaylist: () => void;
  reanalysisProgress: PlaylistReanalysisProgress | null;
  reanalysisRunning: boolean;
  onPreparationChange?: (preparation: PlaylistRecord["playbackPreparation"]) => void;
  onClose: () => void;
}

const SYNC_MODE_LABEL: Record<string, string> = {
  beat_sync: "Beat Sync", bar_sync: "Bar Sync", phrase_sync: "Phrase Sync",
  timed_crossfade: "Timed Crossfade", gapless: "Gapless", hard_cut: "Hard Cut", unsynced: "Unsynced",
};
const STATUS_LABEL: Record<string, string> = {
  ready: "Ready", ready_with_fallback: "Fallback", needs_review: "Needs Review", blocked: "Blocked",
};

function nowIso(): string {
  return new Date().toISOString();
}

export function PlaylistRepairPanel({
  playlist, libraryTracks, crates, libraryGaps, onLibraryGapsChange, onReplaceSlot, onRepairStateChange,
  onReanalyzePlaylist, reanalysisProgress, reanalysisRunning, onPreparationChange, onClose,
}: Props) {
  const tracksById = useMemo(() => new Map(libraryTracks.map((t) => [t.trackId, t])), [libraryTracks]);
  const cratesById = useMemo(() => new Map(crates.map((c) => [c.id, c])), [crates]);

  const dispositions = playlist.repairState?.dispositions ?? {};
  const snapshot = useMemo(
    () => computePlaylistRepairSnapshot(playlist, tracksById),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [playlist.slots, playlist.shapeConfig, playlist.repairState, tracksById],
  );
  const { entries, aggregates, nonAggregated: issues, readiness } = snapshot;

  const [focusedIssueId, setFocusedIssueId] = useState<string | null>(null);
  const [expandedAggregateId, setExpandedAggregateId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<PlaylistRepairCandidate[]>([]);
  const [searchedCount, setSearchedCount] = useState(0);
  const [zoneNeighborIds, setZoneNeighborIds] = useState<{ previousTrackId?: string; nextTrackId?: string }>({});

  const focusedIssue = issues.find((i) => i.issueId === focusedIssueId) ?? null;

  // Playlist Transition Preparation integration (0714 Completion Pass §11) —
  // incoming/outgoing plan status per position, informational only. Never
  // drives repair candidate ranking.
  const preparation = playlist.playbackPreparation;
  const planIntoPosition = useMemo(() => {
    const m = new Map<number, PlaylistTransitionPlan>();
    for (const p of preparation?.transitionPlans ?? []) m.set(p.toPosition, p);
    return m;
  }, [preparation]);
  const planOutOfPosition = useMemo(() => {
    const m = new Map<number, PlaylistTransitionPlan>();
    for (const p of preparation?.transitionPlans ?? []) m.set(p.fromPosition, p);
    return m;
  }, [preparation]);
  const staleLocalCount = preparation ? countStaleLocalTransitions(playlist.slots, tracksById, preparation) : 0;

  function reprepareLocal() {
    if (!preparation || !onPreparationChange) return;
    onPreparationChange(reprepareLocalTransitions(playlist.playlistId, playlist.slots, tracksById, preparation, nowIso()));
  }

  function setDisposition(issue: PlaylistIssue, disposition: PlaylistIssueDisposition) {
    const key = issueKey(issue);
    onRepairStateChange({ ...playlist.repairState, dispositions: { ...dispositions, [key]: disposition } });
  }

  function findReplacements(issue: PlaylistIssue) {
    setFocusedIssueId(issue.issueId);
    const zone = buildRepairZone(issue, entries);
    setZoneNeighborIds({ previousTrackId: zone.previousTrackId, nextTrackId: zone.nextTrackId });
    const section = issue.sectionId ? playlist.shapeConfig?.sections.find((s) => s.id === issue.sectionId) : undefined;
    const playlistTrackIds = entries.map((e) => e.track.trackId);
    const pool = searchRepairCandidates({ zone, section, cratesById, libraryTracks, playlistTrackIds });
    setSearchedCount(pool.length);

    const prevTrack = zone.previousTrackId ? tracksById.get(zone.previousTrackId) : undefined;
    const currentTrack = zone.currentTrackId ? tracksById.get(zone.currentTrackId) : undefined;
    const nextTrack = zone.nextTrackId ? tracksById.get(zone.nextTrackId) : undefined;
    const position = zone.targetPosition;
    const targetEnergy = section
      ? getEnergyTargetAtPosition(section.energyEnvelope, entries.length > 1 ? position / (entries.length - 1) : 0)
      : currentTrack?.energy;

    const ranked = rankRepairCandidates({ zone, candidates: pool, previousTrack: prevTrack, currentTrack, nextTrack, targetEnergy });
    setCandidates(ranked);
  }

  function applyCandidate(issue: PlaylistIssue, candidate: PlaylistRepairCandidate, disposition: PlaylistIssueDisposition) {
    const target = entries[issue.primaryPosition];
    if (!target) return;
    onReplaceSlot(candidate.trackId, target.slot.slotIndex);
    setDisposition(issue, disposition);
    setFocusedIssueId(null);
    setCandidates([]);
  }

  function createMissingTrackBrief(issue: PlaylistIssue) {
    const zone = buildRepairZone(issue, entries);
    const prevTrack = zone.previousTrackId ? tracksById.get(zone.previousTrackId) : undefined;
    const nextTrack = zone.nextTrackId ? tracksById.get(zone.nextTrackId) : undefined;
    const section = issue.sectionId ? playlist.shapeConfig?.sections.find((s) => s.id === issue.sectionId) : undefined;
    const targetEnergy = section
      ? getEnergyTargetAtPosition(section.energyEnvelope, entries.length > 1 ? issue.primaryPosition / (entries.length - 1) : 0)
      : undefined;
    const brief = buildMissingTrackBrief({
      playlistId: playlist.playlistId, zone, previousTrack: prevTrack, nextTrack, role: issue.type, targetEnergy,
      searchedCandidateCount: searchedCount,
    });
    const updated = mergeBriefIntoGapRegister(libraryGaps, brief, playlist.playlistId, issue.issueId, nowIso());
    onLibraryGapsChange(updated);
  }

  const hasStrongOrPerfect = candidates.some((c) => c.classification === "perfect_match" || c.classification === "strong_match");
  const expandedAggregate = aggregates.find((a) => a.aggregateId === expandedAggregateId) ?? null;

  return createPortal(
    <div className="par-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="prp-modal">
        <div className="prp-header">
          <div>
            <div className="prp-title">Playlist Repair</div>
            <div className="prp-subtitle">{playlist.title} · {entries.length} tracks</div>
          </div>
          <button className="npw-close" onClick={onClose}>✕</button>
        </div>

        <div className={`prp-readiness prp-readiness--${readiness.state}`}>
          <strong>{readiness.state.replace(/_/g, " ")}</strong> — {readiness.explanation}
          <span className="prp-readiness-counts">
            {readiness.unresolvedRedCount} red · {readiness.acceptedYellowCount} accepted yellow · {readiness.blueUncertaintyCount} blue
          </span>
        </div>

        {/* Playlist Transition Preparation staleness (0714 Completion Pass §10) */}
        {staleLocalCount > 0 && (
          <div className="prp-stale-strip">
            <span>{staleLocalCount} local transition plan{staleLocalCount !== 1 ? "s" : ""} {staleLocalCount !== 1 ? "are" : "is"} stale</span>
            <button className="tb-btn sm" onClick={reprepareLocal} disabled={!onPreparationChange}>
              Reprepare Local Transitions
            </button>
          </div>
        )}

        {(aggregates.length > 0 || reanalysisRunning || playlist.repairState?.lastReanalysis) && (
          <div className="prp-reanalyze-strip">
            <button className="tb-btn sm" onClick={onReanalyzePlaylist} disabled={reanalysisRunning}>
              {reanalysisRunning ? "Reanalyzing…" : "Reanalyze Entire Playlist"}
            </button>
            {reanalysisRunning && reanalysisProgress && (
              <span className="prp-reanalyze-progress">
                {reanalysisProgress.complete + reanalysisProgress.partial + reanalysisProgress.failed} / {reanalysisProgress.queued} processed
                {reanalysisProgress.failed > 0 ? ` · ${reanalysisProgress.failed} failed` : ""}
              </span>
            )}
            {!reanalysisRunning && playlist.repairState?.lastReanalysis && (
              <span className="prp-reanalyze-progress">
                Last run: {playlist.repairState.lastReanalysis.complete}/{playlist.repairState.lastReanalysis.queued} complete
                {playlist.repairState.lastReanalysis.failed > 0 ? `, ${playlist.repairState.lastReanalysis.failed} failed` : ""}
              </span>
            )}
          </div>
        )}

        <div className="prp-body">
          <div className="prp-issue-list">
            {aggregates.length === 0 && issues.length === 0 && <div className="prp-empty">No issues detected.</div>}

            {aggregates.map((a) => (
              <div key={a.aggregateId} className="prp-aggregate-card">
                <PlaylistIssueMarker colorState="blue" />
                <div className="prp-issue-body">
                  <div className="prp-issue-explanation">Blue · {a.summary}</div>
                  <div className="prp-issue-meta">{a.detail}</div>
                </div>
                <div className="prp-issue-actions">
                  <button className="tb-btn sm" onClick={() => setExpandedAggregateId(expandedAggregateId === a.aggregateId ? null : a.aggregateId)}>
                    {expandedAggregateId === a.aggregateId ? "Hide Tracks" : "Review Tracks"}
                  </button>
                  {(a.actionType === "reanalyze_playlist" || a.actionType === "reanalyze_tracks") && (
                    <button className="tb-btn sm" onClick={onReanalyzePlaylist} disabled={reanalysisRunning}>
                      Reanalyze Entire Playlist
                    </button>
                  )}
                </div>
              </div>
            ))}
            {expandedAggregate && (
              <div className="prp-aggregate-expanded">
                {expandedAggregate.affectedTrackIds.map((id) => (
                  <div key={id} className="prp-aggregate-track">{tracksById.get(id)?.title ?? id}</div>
                ))}
              </div>
            )}

            {issues.map((issue) => {
              const incoming = planIntoPosition.get(issue.primaryPosition);
              const outgoing = planOutOfPosition.get(issue.primaryPosition);
              return (
                <div key={issue.issueId} className={`prp-issue-row${focusedIssueId === issue.issueId ? " prp-issue-row--focused" : ""}`}>
                  <PlaylistIssueMarker colorState={issue.colorState} />
                  <div className="prp-issue-body">
                    <div className="prp-issue-explanation">{issue.explanation}</div>
                    <div className="prp-issue-meta">
                      {issue.scope} · position {issue.primaryPosition + 1}{issue.accepted ? " · accepted" : ""}
                    </div>
                    {(incoming || outgoing) && (
                      <div className="prp-playback-impact">
                        Playback Impact
                        {incoming && <span> · In: {SYNC_MODE_LABEL[incoming.syncMode]} · {STATUS_LABEL[incoming.status]}</span>}
                        {outgoing && <span> · Out: {SYNC_MODE_LABEL[outgoing.syncMode]} · {STATUS_LABEL[outgoing.status]}</span>}
                      </div>
                    )}
                  </div>
                  <div className="prp-issue-actions">
                    {issue.repairAvailable && (
                      <button className="tb-btn sm" onClick={() => findReplacements(issue)}>Find Replacements</button>
                    )}
                    <button className="tb-btn sm" onClick={() => setDisposition(issue, "kept_current")}>Keep Current</button>
                    <button className="tb-btn sm" onClick={() => setDisposition(issue, "ignored")}>Ignore</button>
                  </div>
                </div>
              );
            })}
          </div>

          {focusedIssue && (
            <div className="prp-candidate-panel">
              <div className="prp-candidate-header">
                Candidates for position {focusedIssue.primaryPosition + 1} ({searchedCount} searched)
              </div>
              {candidates.length === 0 && <div className="prp-empty">No eligible candidates found in the assigned crate(s).</div>}
              {candidates.slice(0, 8).map((c) => {
                const track = tracksById.get(c.trackId);
                const previousTrack = zoneNeighborIds.previousTrackId ? tracksById.get(zoneNeighborIds.previousTrackId) : undefined;
                const nextTrack = zoneNeighborIds.nextTrackId ? tracksById.get(zoneNeighborIds.nextTrackId) : undefined;
                const preview = previewCandidateTransition(playlist.playlistId, c.trackId, previousTrack, nextTrack, tracksById, nowIso());
                return (
                  <div key={c.trackId} className={`prp-candidate-row prp-candidate-row--${c.classification}`}>
                    <span className="prp-candidate-class">{c.classification.replace("_", " ")}</span>
                    <span className="prp-candidate-name">{track?.title ?? c.trackId}</span>
                    <span className="prp-candidate-score">{c.totalScore.toFixed(2)}</span>
                    {(preview.previousSyncMode || preview.nextSyncMode) && (
                      <div className="prp-candidate-impact">
                        Playback Impact
                        {preview.previousSyncMode && (
                          <div>Previous → Candidate: {SYNC_MODE_LABEL[preview.previousSyncMode]} · {STATUS_LABEL[preview.previousPlanStatus!]}</div>
                        )}
                        {preview.nextSyncMode && (
                          <div>Candidate → Next: {SYNC_MODE_LABEL[preview.nextSyncMode]} · {STATUS_LABEL[preview.nextPlanStatus!]}</div>
                        )}
                      </div>
                    )}
                    {c.classification === "perfect_match" || c.classification === "strong_match" ? (
                      <button className="tb-btn sm" onClick={() => applyCandidate(focusedIssue, c, "kept_current")}>Apply Best Fix</button>
                    ) : c.classification === "temporary_match" ? (
                      <button className="tb-btn sm" onClick={() => applyCandidate(focusedIssue, c, "accepted_temporary")}>Apply Temporary Match</button>
                    ) : null}
                  </div>
                );
              })}
              {!hasStrongOrPerfect && focusedIssue.missingTrackBriefAvailable && (
                <button className="tb-btn sm prp-brief-btn" onClick={() => createMissingTrackBrief(focusedIssue)}>
                  Create Missing-Track Brief
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
