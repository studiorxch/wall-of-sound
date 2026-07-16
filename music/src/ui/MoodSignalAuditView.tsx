import { useState, useMemo } from "react";
import type { Track } from "../data/trackTypes";
import {
  auditMoodSignals,
  SONIC_MECHANISMS,
  type MoodSignalHealth,
  type TrackSignalState,
} from "../logic/moodSignalAudit";
import { getMoodColorToken } from "../logic/moodTaxonomy";

type FilterKey = "all" | "needs_mood" | "has_suggested" | "needs_mechanism" | "unmapped" | "complete" | "needs_analysis";

const HEALTH_LABEL: Record<MoodSignalHealth, string> = {
  complete: "Complete",
  needs_mood: "No Mood",
  needs_more_mood: "Needs More",
  needs_mechanism: "No Mechanism",
  unmapped_suggested: "Unmapped",
  empty: "Empty",
};

const HEALTH_CLS: Record<MoodSignalHealth, string> = {
  complete: "msa-health--ok",
  needs_mood: "msa-health--warn",
  needs_more_mood: "msa-health--info",
  needs_mechanism: "msa-health--info",
  unmapped_suggested: "msa-health--info",
  empty: "msa-health--bad",
};

type Props = {
  tracks: Track[];
  onPromoteSuggested: (trackId: string, mood: string) => void;
  onAssignMechanism: (trackId: string, mechanism: string) => void;
  onImportAudio?: () => void;
};

export function MoodSignalAuditView({ tracks, onPromoteSuggested, onAssignMechanism, onImportAudio }: Props) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [mechanismPickerId, setMechanismPickerId] = useState<string | null>(null);

  const { summary, states } = useMemo(() => auditMoodSignals(tracks), [tracks]);

  const filtered = useMemo(() => {
    switch (filter) {
      case "needs_mood":    return states.filter((s) => s.approvedMoods.length === 0);
      case "has_suggested": return states.filter((s) => s.suggestedMoods.length > 0);
      case "needs_mechanism": return states.filter((s) => s.mechanisms.length === 0);
      case "unmapped":        return states.filter((s) => s.unmappedSuggested.length > 0);
      case "complete":        return states.filter((s) => s.health === "complete");
      case "needs_analysis":  return states.filter((s) => {
        const st = tracks.find((t) => t.trackId === s.trackId)?.analysisStatus;
        return st === "review_needed" || st === "queued" || st === "analyzing";
      });
      default:              return states;
    }
  }, [states, filter]);

  const needsAnalysisCount = tracks.filter(
    (t) => t.analysisStatus === "review_needed" || t.analysisStatus === "queued" || t.analysisStatus === "analyzing",
  ).length;

  return (
    <div className="msa-root">
      {/* Summary panel */}
      <div className="msa-summary">
        <span className="msa-stat">{summary.totalTracks} tracks</span>
        <span className="msa-sep">·</span>
        <span className="msa-stat msa-stat--ok">{summary.withApprovedMood} approved mood</span>
        <span className="msa-sep">·</span>
        <span className={`msa-stat${summary.withNoApprovedMood > 0 ? " msa-stat--warn" : ""}`}>{summary.withNoApprovedMood} no mood</span>
        <span className="msa-sep">·</span>
        <span className="msa-stat">{summary.withSuggested} has suggested</span>
        <span className="msa-sep">·</span>
        <span className={`msa-stat${summary.missingMechanism > 0 ? " msa-stat--dim" : " msa-stat--ok"}`}>{summary.missingMechanism} missing mechanism</span>
        <span className="msa-sep">·</span>
        <span className="msa-stat">{summary.withUnmappedSuggested} unmapped</span>
        <span className="msa-sep">·</span>
        <span className="msa-stat msa-stat--ok">{summary.complete} complete</span>
        {onImportAudio && (
          <>
            <span className="msa-sep">·</span>
            <button className="msa-import-btn" onClick={onImportAudio}>+ Import Audio</button>
          </>
        )}
      </div>

      {/* Filters */}
      <div className="msa-filters">
        {([
          ["all", "All"],
          ["needs_mood", `No Mood (${summary.withNoApprovedMood})`],
          ["has_suggested", `Has Suggested (${summary.withSuggested})`],
          ["needs_mechanism", `Missing Mech (${summary.missingMechanism})`],
          ["unmapped", `Unmapped (${summary.withUnmappedSuggested})`],
          ["complete", `Complete (${summary.complete})`],
          ...(needsAnalysisCount > 0 ? [["needs_analysis", `Needs Review (${needsAnalysisCount})`] as [FilterKey, string]] : []),
        ] as [FilterKey, string][]).map(([key, label]) => (
          <button
            key={key}
            className={`msa-filter-btn${filter === key ? " msa-filter-btn--active" : ""}`}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Audit table */}
      <div className="msa-table-wrap">
        <table className="msa-table">
          <thead>
            <tr>
              <th className="msa-col-track">Track</th>
              <th className="msa-col-approved">Approved Mood</th>
              <th className="msa-col-suggested">Suggested</th>
              <th className="msa-col-mech">Mechanism</th>
              <th className="msa-col-health">Health</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="msa-empty">No tracks match this filter.</td></tr>
            )}
            {filtered.map((s) => (
              <AuditRow
                key={s.trackId}
                state={s}
                mechanismPickerOpen={mechanismPickerId === s.trackId}
                onOpenMechanismPicker={() => setMechanismPickerId(s.trackId)}
                onCloseMechanismPicker={() => setMechanismPickerId(null)}
                onPromote={(mood) => onPromoteSuggested(s.trackId, mood)}
                onAssignMechanism={(mech) => { onAssignMechanism(s.trackId, mech); setMechanismPickerId(null); }}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type RowProps = {
  state: TrackSignalState;
  mechanismPickerOpen: boolean;
  onOpenMechanismPicker: () => void;
  onCloseMechanismPicker: () => void;
  onPromote: (mood: string) => void;
  onAssignMechanism: (mechanism: string) => void;
};

function AuditRow({ state, mechanismPickerOpen, onOpenMechanismPicker, onCloseMechanismPicker, onPromote, onAssignMechanism }: RowProps) {
  const approvedSet = new Set(state.approvedMoods.map((m) => m.toLowerCase()));

  return (
    <tr className={`msa-row msa-row--${state.health}`}>
      <td className="msa-col-track">
        <span className="msa-track-title">{state.title}</span>
        {state.artist && <span className="msa-track-artist">{state.artist}</span>}
      </td>

      <td className="msa-col-approved">
        {state.approvedMoods.length === 0 ? (
          <span className="msa-empty-cell">—</span>
        ) : (
          <div className="msa-chip-row">
            {state.approvedMoods.map((mood) => {
              const token = getMoodColorToken(mood);
              return (
                <span
                  key={mood}
                  className="msa-chip msa-chip--approved"
                  style={{ "--mc-token": `var(${token})` } as React.CSSProperties}
                >
                  {mood}
                </span>
              );
            })}
          </div>
        )}
      </td>

      <td className="msa-col-suggested">
        {state.suggestedMoods.length === 0 ? (
          <span className="msa-empty-cell">—</span>
        ) : (
          <div className="msa-chip-row">
            {state.suggestedMoods.map((mood) => {
              const alreadyApproved = approvedSet.has(mood.toLowerCase());
              const token = getMoodColorToken(mood);
              return (
                <span
                  key={mood}
                  className={`msa-chip msa-chip--suggested${alreadyApproved ? " msa-chip--promoted" : ""}`}
                  style={{ "--mc-token": `var(${token})` } as React.CSSProperties}
                >
                  {mood}
                  {!alreadyApproved && (
                    <button
                      className="msa-promote-btn"
                      title={`Promote "${mood}" to approved mood`}
                      onClick={() => onPromote(mood)}
                    >+</button>
                  )}
                </span>
              );
            })}
          </div>
        )}
      </td>

      <td className="msa-col-mech">
        {state.mechanisms.length > 0 ? (
          <div className="msa-chip-row">
            {state.mechanisms.map((m) => (
              <span key={m} className="msa-chip msa-chip--mech">{m}</span>
            ))}
          </div>
        ) : (
          <div className="msa-mech-assign">
            <span className="msa-empty-cell">—</span>
            {mechanismPickerOpen ? (
              <div className="msa-mech-picker">
                {SONIC_MECHANISMS.map((m) => (
                  <button key={m} className="msa-mech-opt" onClick={() => onAssignMechanism(m)}>{m}</button>
                ))}
                <button className="msa-mech-cancel" onClick={onCloseMechanismPicker}>Cancel</button>
              </div>
            ) : (
              <button className="msa-assign-btn" onClick={onOpenMechanismPicker}>Assign</button>
            )}
          </div>
        )}
      </td>

      <td className="msa-col-health">
        <span className={`msa-health ${HEALTH_CLS[state.health]}`}>
          {HEALTH_LABEL[state.health]}
        </span>
      </td>
    </tr>
  );
}
