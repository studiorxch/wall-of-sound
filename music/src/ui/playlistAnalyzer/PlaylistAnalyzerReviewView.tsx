// Playlist Analyzer Review — UI (spec §10). Tabs, nothing expanded by default
// except Overview. Renders only real data — no synthetic rows.

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { PlaylistRecord } from "../../data/playProjectTypes";
import type { Track } from "../../data/trackTypes";
import type { CrateRecord } from "../../data/crateTypes";
import type { LibraryGapRecord, PlaylistReanalysisProgress } from "../../data/playlistRepairTypes";
import { computePlaylistAnalyzerReview } from "../../logic/playlistAnalyzer/computePlaylistAnalyzerReview";
import { fmtDuration } from "../../logic/playlistAnalyzer/gptExport";
import { computePlaylistRepairSnapshot } from "../../logic/playlistRepair/repairSnapshot";
import { buildRepairZoneSummaries } from "../../logic/playlistRepair/repairZonesForExport";
import { PlaylistIssueMarker } from "../playlistRepair/PlaylistIssueMarker";
import { PlaylistAnalyzerExportPanel } from "./PlaylistAnalyzerExportPanel";

type Tab = "overview" | "identity" | "arc" | "sections" | "tracks" | "transitions" | "exceptions" | "export";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "identity", label: "Identity" },
  { id: "arc", label: "Arc" },
  { id: "sections", label: "Sections" },
  { id: "tracks", label: "Tracks" },
  { id: "transitions", label: "Transitions" },
  { id: "exceptions", label: "Exceptions" },
  { id: "export", label: "Creative Export" },
];

type Props = {
  playlist: PlaylistRecord;
  libraryTracks: Track[];
  crates: CrateRecord[];
  libraryGaps: LibraryGapRecord[];
  onReanalyzePlaylist: () => void;
  reanalysisProgress: PlaylistReanalysisProgress | null;
  reanalysisRunning: boolean;
  onClose: () => void;
};

export function PlaylistAnalyzerReviewView({
  playlist, libraryTracks, crates, libraryGaps, onReanalyzePlaylist, reanalysisProgress, reanalysisRunning, onClose,
}: Props) {
  const [tab, setTab] = useState<Tab>("overview");

  const tracksById = useMemo(() => new Map(libraryTracks.map((t) => [t.trackId, t])), [libraryTracks]);

  const review = useMemo(() => computePlaylistAnalyzerReview(playlist, tracksById), [playlist, tracksById]);

  // Single shared repair snapshot (§15 — same readiness on both surfaces).
  const repairSnapshot = useMemo(
    () => computePlaylistRepairSnapshot(playlist, tracksById),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [playlist.slots, playlist.shapeConfig, playlist.repairState, tracksById],
  );

  const repairableIssues = useMemo(
    () => repairSnapshot.nonAggregated.filter((i) => i.repairAvailable && !i.accepted),
    [repairSnapshot.nonAggregated],
  );
  const zoneSummaries = useMemo(
    () => buildRepairZoneSummaries(playlist, repairSnapshot.entries, repairableIssues, libraryTracks, crates),
    [playlist, repairSnapshot.entries, repairableIssues, libraryTracks, crates],
  );

  const issueByPosition = useMemo(() => {
    const m = new Map<number, typeof repairSnapshot.issues>();
    for (const issue of repairSnapshot.issues) {
      if (issue.accepted) continue;
      for (const p of issue.affectedPositions) {
        if (!m.has(p)) m.set(p, []);
        m.get(p)!.push(issue);
      }
    }
    return m;
  }, [repairSnapshot.issues]);

  const briefsForPlaylist = libraryGaps.filter((g) => g.sourcePlaylistIds.includes(playlist.playlistId));
  const openGapsForPlaylist = briefsForPlaylist.filter((g) => g.status !== "resolved" && g.status !== "dismissed");

  const repairExportInput = {
    readiness: repairSnapshot.readiness,
    aggregates: repairSnapshot.aggregates,
    nonAggregatedIssues: repairSnapshot.nonAggregated,
    repairableCount: repairSnapshot.repairableCount,
    zones: zoneSummaries,
    repairState: playlist.repairState,
    playlistId: playlist.playlistId,
    libraryGaps,
  };

  return createPortal(
    <div className="par-overlay" onClick={onClose}>
      <div className="par-panel" onClick={(e) => e.stopPropagation()}>
        <div className="par-header">
          <div>
            <div className="par-title">Playlist Analyzer Review</div>
            <div className="par-subtitle">{review.playlistTitle} · {review.trackCount} tracks · {fmtDuration(review.totalDurationSeconds)}</div>
          </div>
          <button className="par-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="par-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`par-tab${tab === t.id ? " par-tab--active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="par-body">
          {tab === "overview" && (
            <OverviewTab
              review={review}
              repairSnapshot={repairSnapshot}
              openGapCount={openGapsForPlaylist.length}
              briefCount={briefsForPlaylist.length}
              onReanalyzePlaylist={onReanalyzePlaylist}
              reanalysisProgress={reanalysisProgress}
              reanalysisRunning={reanalysisRunning}
              preparation={playlist.playbackPreparation}
            />
          )}
          {tab === "identity" && <IdentityTab review={review} />}
          {tab === "arc" && <ArcTab review={review} />}
          {tab === "sections" && <SectionsTab review={review} />}
          {tab === "tracks" && <TracksTab review={review} issueByPosition={issueByPosition} />}
          {tab === "transitions" && <TransitionsTab review={review} zoneSummaries={zoneSummaries} preparation={playlist.playbackPreparation} />}
          {tab === "exceptions" && (
            <ExceptionsTab
              review={review}
              aggregates={repairSnapshot.aggregates}
              zoneSummaries={zoneSummaries}
              briefs={briefsForPlaylist}
              gaps={openGapsForPlaylist}
            />
          )}
          {tab === "export" && <PlaylistAnalyzerExportPanel review={review} repair={repairExportInput} preparation={playlist.playbackPreparation} />}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function OverviewTab({
  review, repairSnapshot, openGapCount, briefCount, onReanalyzePlaylist, reanalysisProgress, reanalysisRunning, preparation,
}: {
  review: ReturnType<typeof computePlaylistAnalyzerReview>;
  repairSnapshot: ReturnType<typeof computePlaylistRepairSnapshot>;
  openGapCount: number;
  briefCount: number;
  onReanalyzePlaylist: () => void;
  reanalysisProgress: PlaylistReanalysisProgress | null;
  reanalysisRunning: boolean;
  preparation?: import("../../data/playProjectTypes").PlaylistRecord["playbackPreparation"];
}) {
  const c = review.coverage;
  const { readiness, aggregates } = repairSnapshot;
  return (
    <div className="par-section">
      <div className="par-overview-title">{review.playlistTitle}</div>
      <div className="par-overview-meta">{review.trackCount} tracks · {fmtDuration(review.totalDurationSeconds)}</div>
      <div className="par-coverage-grid">
        <div className="par-coverage-cell par-coverage--complete">{c.completeCount} complete</div>
        <div className="par-coverage-cell par-coverage--partial">{c.partialCount} partial</div>
        <div className="par-coverage-cell par-coverage--missing">{c.missingCount} missing</div>
        <div className="par-coverage-cell par-coverage--failed">{c.failedCount} failed</div>
        <div className="par-coverage-cell par-coverage--stale">{c.staleCount} stale</div>
      </div>
      <div className="par-overview-row">Sections: {review.sections.length || "none (arc phases are inferred)"}</div>
      <div className="par-overview-row">Warnings: {review.exceptions.length}</div>
      {c.coverageRatio < 1 && (
        <div className="par-note">
          Coverage is {Math.round(c.coverageRatio * 100)}% complete — identity, arc, and creative export confidence reflect this gap rather than filling it in.
        </div>
      )}

      <div className={`par-repair-readiness par-repair-readiness--${readiness.state}`}>
        <div className="par-repair-readiness-title">Readiness: {readiness.state.replace(/_/g, " ")}</div>
        <div className="par-repair-readiness-counts">
          {readiness.unresolvedRedCount} red · {readiness.acceptedYellowCount} accepted yellow · {aggregates.length} blue aggregate{aggregates.length === 1 ? "" : "s"}
          {" · "}{repairSnapshot.repairableCount} repairable now · {briefCount} missing-track brief{briefCount === 1 ? "" : "s"} · {openGapCount} open library gap{openGapCount === 1 ? "" : "s"}
        </div>
        <button className="tb-btn sm" onClick={onReanalyzePlaylist} disabled={reanalysisRunning} style={{ marginTop: 6 }}>
          {reanalysisRunning ? "Reanalyzing…" : "Reanalyze Entire Playlist"}
        </button>
        {reanalysisRunning && reanalysisProgress && (
          <div className="par-overview-row par-dim">
            {reanalysisProgress.complete + reanalysisProgress.partial + reanalysisProgress.failed} / {reanalysisProgress.queued} processed
          </div>
        )}
      </div>

      {/* Playlist Transition Preparation (0714_MUSIC_Playlist_Transition_Preparation §24) */}
      {preparation && (
        <div className={`par-repair-readiness par-repair-readiness--${preparation.readiness === "blocked" ? "needs_repair" : preparation.readiness === "ready" ? "ready" : "ready_with_compromises"}`} style={{ marginTop: 10 }}>
          <div className="par-repair-readiness-title">Playback Preparation: {preparation.readiness.replace(/_/g, " ")}</div>
          <div className="par-repair-readiness-counts">
            {preparation.readyCount} ready · {preparation.fallbackCount} fallback · {preparation.reviewCount} review · {preparation.blockedCount} blocked
          </div>
        </div>
      )}
    </div>
  );
}

function IdentityTab({ review }: { review: ReturnType<typeof computePlaylistAnalyzerReview> }) {
  const id = review.identity;
  return (
    <div className="par-section">
      <div className="par-identity-primary">
        {id.primaryMoods.length ? id.primaryMoods.join(" · ") : "Not enough analyzed tracks to derive a primary identity"}
      </div>
      {id.secondaryMoods.length > 0 && <div className="par-identity-secondary">Also: {id.secondaryMoods.join(", ")}</div>}
      <div className="par-identity-grid">
        <Field label="Emotional temperature" value={id.emotionalTemperature} />
        <Field label="Energy range" value={id.energyRange ? `${id.energyRange[0].toFixed(2)} – ${id.energyRange[1].toFixed(2)}` : undefined} />
        <Field label="Tempo range" value={id.bpmRange ? `${id.bpmRange[0]} – ${id.bpmRange[1]} BPM` : undefined} />
        <Field label="Tonal character" value={id.tonalCharacter} />
        <Field label="Rhythmic character" value={id.rhythmicCharacter} />
        <Field label="Texture" value={id.texture} />
        <Field label="Brightness" value={id.brightness} />
        <Field label="Density" value={id.density} />
        <Field label="Movement" value={id.movement} />
        <Field label="Contrast" value={id.contrast} />
        <Field label="Resolution" value={id.resolution} />
      </div>
      <div className="par-confidence">Confidence: {Math.round(id.confidence * 100)}%</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div className="par-field">
      <div className="par-field-label">{label}</div>
      <div className="par-field-value">{value ?? "—"}</div>
    </div>
  );
}

function ArcTab({ review }: { review: ReturnType<typeof computePlaylistAnalyzerReview> }) {
  return (
    <div className="par-section">
      {!review.arc.derivedFromRealSections && (
        <div className="par-note">No real playlist sections exist — these phases are inferred from position, not from stored section boundaries.</div>
      )}
      {review.arc.phases.map((p) => (
        <div key={p.phase} className="par-arc-phase">
          <div className="par-arc-phase-name">{p.phase[0].toUpperCase()}{p.phase.slice(1)}</div>
          {p.startSlotIndex >= 0 ? (
            <>
              <div className="par-arc-row">Moods: {p.dominantMoods.join(", ") || "—"}</div>
              <div className="par-arc-row">Energy: {p.energyMovement} · Tempo: {p.tempoMovement}</div>
              <div className="par-arc-row">{p.narrativeFunction}</div>
              <div className="par-arc-row par-dim">Entry: {p.entryBehavior} · Exit: {p.exitBehavior}</div>
              <div className="par-confidence">Confidence: {Math.round(p.confidence * 100)}%</div>
            </>
          ) : (
            <div className="par-arc-row par-dim">No tracks fell in this phase.</div>
          )}
        </div>
      ))}
    </div>
  );
}

function SectionsTab({ review }: { review: ReturnType<typeof computePlaylistAnalyzerReview> }) {
  if (review.sections.length === 0) {
    return <div className="par-section par-note">This playlist has no real sections defined — see the Arc tab for inferred phase-level structure instead.</div>;
  }
  return (
    <div className="par-section">
      {review.sections.map((s) => (
        <details key={s.sectionId} className="par-collapsible">
          <summary>{s.sectionLabel} · {s.trackCount} tracks · {fmtDuration(s.durationSeconds)}</summary>
          <div className="par-section-body">
            <div className="par-arc-row">Role: {s.role}</div>
            <div className="par-arc-row">Dominant moods: {s.dominantMoods.join(", ") || "—"}</div>
            <div className="par-arc-row">Avg energy: {s.averageEnergy != null ? s.averageEnergy.toFixed(2) : "—"} {s.energyRange ? `(${s.energyRange[0].toFixed(2)}–${s.energyRange[1].toFixed(2)})` : ""}</div>
            <div className="par-arc-row">BPM range: {s.bpmRange ? `${s.bpmRange[0]}–${s.bpmRange[1]}` : "—"}</div>
            {s.entryTransition && <div className="par-arc-row par-dim">Entry: {s.entryTransition}</div>}
            {s.exitTransition && <div className="par-arc-row par-dim">Exit: {s.exitTransition}</div>}
            {s.warningCodes.length > 0 && <div className="par-warn">{s.warningCodes.join(", ")}</div>}
          </div>
        </details>
      ))}
    </div>
  );
}

function TracksTab({
  review, issueByPosition,
}: {
  review: ReturnType<typeof computePlaylistAnalyzerReview>;
  issueByPosition: Map<number, import("../../data/playlistRepairTypes").PlaylistIssue[]>;
}) {
  return (
    <div className="par-section">
      <table className="par-table">
        <thead>
          <tr>
            <th></th><th>#</th><th>Title</th><th>BPM</th><th>Key</th><th>E</th><th>Moods</th><th>Role</th><th>Conf.</th><th>Beat Map</th>
          </tr>
        </thead>
        <tbody>
          {review.tracks.map((t) => {
            const trackIssues = issueByPosition.get(t.position) ?? [];
            const worstColor = trackIssues.some((i) => i.colorState === "red") ? "red"
              : trackIssues.some((i) => i.colorState === "yellow") ? "yellow"
              : trackIssues.some((i) => i.colorState === "blue") ? "blue"
              : null;
            return (
              <tr key={t.slotId} className={t.warningCodes.length ? "par-row-warn" : ""}>
                <td>{worstColor && <PlaylistIssueMarker colorState={worstColor} label={`${trackIssues.length} repair issue${trackIssues.length === 1 ? "" : "s"}`} />}</td>
                <td>{t.position + 1}</td>
                <td>{t.title}{t.artist ? <span className="par-dim"> — {t.artist}</span> : null}</td>
                <td>{t.bpm && t.bpm > 0 ? t.bpm : "—"}</td>
                <td>{t.camelotKey ?? "—"}</td>
                <td>{t.energy != null ? t.energy.toFixed(2) : "—"}</td>
                <td>{t.primaryMoods.join(", ") || "—"}</td>
                <td>{t.role}</td>
                <td>{Math.round(t.confidence * 100)}%</td>
                <td className="par-dim">
                  {t.beatMapTrusted
                    ? `${t.beatMapTempoStable ? "stable" : "drift"} · ${t.beatMapBarCount ?? 0} bars`
                    : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TransitionsTab({
  review, zoneSummaries, preparation,
}: {
  review: ReturnType<typeof computePlaylistAnalyzerReview>;
  zoneSummaries: import("../../logic/playlistRepair/repairExport").RepairZoneExportEntry[];
  preparation?: import("../../data/playProjectTypes").PlaylistRecord["playbackPreparation"];
}) {
  const zoneByToPosition = new Map(zoneSummaries.map((z) => [z.zone.targetPosition, z]));
  const planByToPosition = new Map((preparation?.transitionPlans ?? []).map((p) => [p.toPosition, p]));
  return (
    <div className="par-section">
      {review.transitions.map((t) => {
        const repairZone = zoneByToPosition.get(t.toPosition);
        const plan = planByToPosition.get(t.toPosition);
        return (
          <div key={t.id} className={`par-transition${t.warningCodes.length ? " par-row-warn" : ""}`}>
            <div className="par-arc-row">
              #{t.fromPosition + 1} → #{t.toPosition + 1} — <strong>{t.transitionType.replace(/_/g, " ")}</strong>
            </div>
            <div className="par-arc-row par-dim">{t.narrativeEffect}</div>
            <div className="par-arc-row par-dim">
              {t.bpmDelta != null && `ΔBPM ${t.bpmDelta > 0 ? "+" : ""}${t.bpmDelta} · `}
              {t.energyDelta != null && `ΔEnergy ${t.energyDelta > 0 ? "+" : ""}${t.energyDelta.toFixed(2)} · `}
              {t.keyRelationship ?? "key unknown"}
            </div>
            <div className="par-confidence">Confidence: {Math.round(t.confidence * 100)}%</div>
            {repairZone && (
              <div className="par-arc-row par-repair-zone-row">
                <PlaylistIssueMarker colorState={repairZone.issue.colorState} />
                Repair issue: {repairZone.issue.type} ({repairZone.issue.scope}){repairZone.issue.accepted ? " · accepted" : ""}
                {repairZone.bestCandidate && ` · best candidate: ${repairZone.bestCandidate.classification.replace("_", " ")} (${repairZone.bestCandidate.totalScore.toFixed(2)})`}
                {repairZone.issue.missingTrackBriefAvailable && (!repairZone.bestCandidate || repairZone.bestCandidate.classification === "weak_match") && " · no strong candidate — missing-track brief available"}
              </div>
            )}
            {plan && (
              <div className="par-arc-row par-dim">
                Prep: {plan.syncMode.replace(/_/g, " ")} · {plan.transitionDurationSeconds.toFixed(1)}s
                {plan.transitionBars ? ` (${plan.transitionBars} bars)` : ""} · {plan.tempoRelationship.replace(/_/g, " ")} · {Math.round(plan.confidence * 100)}% · {plan.status.replace(/_/g, " ")}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ExceptionsTab({
  review, aggregates, zoneSummaries, briefs, gaps,
}: {
  review: ReturnType<typeof computePlaylistAnalyzerReview>;
  aggregates: import("../../data/playlistRepairTypes").PlaylistIssueAggregate[];
  zoneSummaries: import("../../logic/playlistRepair/repairExport").RepairZoneExportEntry[];
  briefs: import("../../data/playlistRepairTypes").LibraryGapRecord[];
  gaps: import("../../data/playlistRepairTypes").LibraryGapRecord[];
}) {
  const hasNothing = review.exceptions.length === 0 && aggregates.length === 0 && zoneSummaries.length === 0 && briefs.length === 0 && gaps.length === 0;
  if (hasNothing) {
    return <div className="par-section par-note">No exceptions surfaced for this playlist.</div>;
  }
  return (
    <div className="par-section">
      {zoneSummaries.length > 0 && (
        <div className="par-exception-group">
          <div className="par-exception-group-title">Unresolved Repair Zones</div>
          {zoneSummaries.map(({ issue, zone }) => (
            <div key={issue.issueId} className={`par-exception par-exception--${issue.severity === "error" ? "attention" : "advisory"}`}>
              <div className="par-exception-code">{issue.type}{issue.accepted && <span className="par-action-req"> · accepted</span>}</div>
              <div className="par-arc-row">{issue.explanation}</div>
              <div className="par-arc-row par-dim">Position {zone.targetPosition + 1} · scope {issue.scope}</div>
            </div>
          ))}
        </div>
      )}

      {aggregates.length > 0 && (
        <div className="par-exception-group">
          <div className="par-exception-group-title">Aggregated Blue Uncertainty</div>
          {aggregates.map((a) => (
            <div key={a.aggregateId} className="par-exception par-exception--info">
              <div className="par-exception-code">{a.issueType} ({a.count})</div>
              <div className="par-arc-row">{a.summary}</div>
            </div>
          ))}
        </div>
      )}

      {briefs.length > 0 && (
        <div className="par-exception-group">
          <div className="par-exception-group-title">Missing-Track Briefs</div>
          {briefs.map((g) => (
            <div key={g.gapId} className="par-exception par-exception--advisory">
              <div className="par-exception-code">{g.mergedBrief.role} · {g.status}</div>
              <div className="par-arc-row">{g.mergedBrief.purpose}</div>
            </div>
          ))}
        </div>
      )}

      {gaps.length > 0 && (
        <div className="par-exception-group">
          <div className="par-exception-group-title">Library Gaps</div>
          {gaps.map((g) => (
            <div key={g.gapId} className="par-exception par-exception--advisory">
              <div className="par-exception-code">{g.gapId} · {g.status}</div>
              <div className="par-arc-row par-dim">{g.occurrenceCount} occurrence{g.occurrenceCount === 1 ? "" : "s"}</div>
            </div>
          ))}
        </div>
      )}

      {review.exceptions.length > 0 && (
        <div className="par-exception-group">
          <div className="par-exception-group-title">Analyzer Warnings</div>
          {review.exceptions.map((ex, i) => (
            <div key={i} className={`par-exception par-exception--${ex.severity}`}>
              <div className="par-exception-code">{ex.code}{ex.actionRequired && <span className="par-action-req"> · action suggested</span>}</div>
              <div className="par-arc-row">{ex.explanation}</div>
              {ex.affectedPositions.length > 0 && (
                <div className="par-arc-row par-dim">Positions: {ex.affectedPositions.map((p) => p + 1).join(", ")}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
