// 0717D_RADIO_Playlist_Inbox_and_Performance_Foundation §10 — one
// collapsed row in the multi-track prep stack. Renders the persisted
// waveform overview and Section Map overview WITHOUT decoding audio —
// both read straight off the track's existing CompleteSongAnalysis. The
// only decode this row can ever trigger is via the embedded Looper, and
// only once expanded (handled by the parent workspace, not here).
//
// 0718B_RADIO_Web_Publication_Asset_Export_Bridge §State model — adds the
// approval toggle, include-in-export toggle, derived preparation badge,
// bound package version, and per-entry Prepare/Retry/Prepare-new-version
// actions. `preparationState` is computed by the parent workspace (the ONE
// place that owns verification results) via computeEntryPreparationState —
// this row never derives it itself.

import type { Track } from "../../data/trackTypes";
import type { CompleteSongAnalysis } from "../../data/songAnalysisTypes";
import type { RadioPlaylistEntry, RadioEntryPreparationState } from "../../data/radioPlaylistTypes";
import { resolveActiveSongSection } from "../../logic/songAnalysis/songSectionRevisions";
import { computeRadioAssetReadiness } from "../../logic/radio/radioAssetReadiness";
import { WaveformSummaryPreview } from "./WaveformSummaryPreview";
import { SectionMap, type SectionMapDisplaySection } from "../sectionalLooper/SectionMap";

function fmtDuration(seconds: number | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

const PREP_STATE_LABEL: Record<RadioEntryPreparationState, string> = {
  NOT_APPROVED: "Not approved",
  NEEDS_PREPARATION: "Needs preparation",
  PREPARING: "Preparing…",
  READY: "Ready",
  STALE: "Stale",
  FAILED: "Failed",
  EXCLUDED: "Excluded",
};

interface Props {
  order: number;
  entry: RadioPlaylistEntry;
  track: Track | undefined;
  analysis: CompleteSongAnalysis | undefined;
  preparationState: RadioEntryPreparationState;
  isApproving: boolean;
  isPreparing: boolean;
  onExpand: () => void;
  onToggleLock: () => void;
  onToggleInclude: () => void;
  onApprove: () => void;
  onPrepare: () => void;
  onPrepareNewVersion: () => void;
}

const NOOP = () => {};

export function RadioPrepRow({
  order, entry, track, analysis, preparationState, isApproving, isPreparing,
  onExpand, onToggleLock, onToggleInclude, onApprove, onPrepare, onPrepareNewVersion,
}: Props) {
  const { readiness } = computeRadioAssetReadiness({ kind: "track", songAnalysisStatus: analysis?.status });
  const sections: SectionMapDisplaySection[] = (analysis?.sections ?? []).map((s) => {
    const resolved = resolveActiveSongSection(s, analysis?.sectionRevisions ?? []);
    return { id: s.id, structuralType: resolved.structuralType, displayLabel: resolved.displayLabel, startFrame: resolved.startFrame, endFrame: resolved.endFrame, verification: resolved.verification };
  });
  const verifiedCount = sections.filter((s) => s.verification === "verified").length;

  const failureReason = entry.lastPreparationError?.message;
  const canPrepare = preparationState === "NEEDS_PREPARATION" || preparationState === "FAILED" || preparationState === "STALE";

  return (
    <div className="radio-prep-row">
      <div className="radio-prep-row-order">{order + 1}</div>
      <div className="radio-prep-row-main">
        <div className="radio-prep-row-header">
          <button className="radio-prep-row-title" onClick={onExpand}>
            {track ? `${track.artist} — ${track.title}` : "Track not found"}
          </button>
          <label className="radio-prep-row-include" title="Include this entry in the next Web Bundle export">
            <input type="checkbox" checked={entry.includedInPublish} onChange={onToggleInclude} />
            Include
          </label>
          <button
            className={`radio-prep-row-approve${entry.approval?.approved ? " is-approved" : ""}`}
            onClick={onApprove}
            disabled={isApproving}
            title="Approve this entry's current source audio for web publication"
          >
            {isApproving ? "Approving…" : entry.approval?.approved ? "Approved ✓" : "Approve"}
          </button>
          <button className={`radio-prep-row-lock${entry.locked ? " is-locked" : ""}`} onClick={onToggleLock} title={entry.locked ? "Unlock" : "Lock"}>
            {entry.locked ? "🔒" : "🔓"}
          </button>
        </div>

        <div className="radio-prep-row-waveform">
          <WaveformSummaryPreview summary={analysis?.waveformSummary} height={32} />
        </div>

        {sections.length > 0 && analysis && (
          <div className="radio-prep-row-sectionmap">
            <SectionMap
              sections={sections}
              totalFrames={analysis.decodedFrameCount}
              sampleRate={analysis.sampleRate}
              onSectionClick={NOOP}
              onSectionDoubleClick={NOOP}
              onBoundaryDown={NOOP}
            />
          </div>
        )}

        <div className="radio-prep-row-meta">
          <span>{fmtDuration(track?.durationSeconds)}</span>
          {track?.bpm && <span>{track.bpm.toFixed(1)} BPM</span>}
          {track?.camelotKey && <span>{track.camelotKey}</span>}
          {track?.genre && <span>{track.genre}</span>}
          <span>Analysis: {analysis?.status ?? "NOT_ANALYZED"}</span>
          <span>Sections: {verifiedCount}/{sections.length} verified</span>
          <span className="radio-prep-row-stems-note">Stems: not available in this environment</span>
          <span className={`radio-badge radio-badge-${readiness.toLowerCase()}`}>{readiness}</span>
        </div>

        <div className="radio-prep-row-web-status">
          <span className={`radio-badge radio-badge-prep-${preparationState.toLowerCase()}`}>{PREP_STATE_LABEL[preparationState]}</span>
          {entry.trackBinding && <span className="radio-prep-row-version">v{entry.trackBinding.packageVersion}</span>}
          {(preparationState === "FAILED" || preparationState === "STALE") && failureReason && (
            <span className="radio-prep-row-reason">{failureReason}</span>
          )}
          {canPrepare && (
            <button className="tb-btn sm" onClick={onPrepare} disabled={isPreparing}>
              {isPreparing ? "Preparing…" : preparationState === "NEEDS_PREPARATION" ? "Prepare" : "Retry"}
            </button>
          )}
          {preparationState === "READY" && (
            <button className="tb-btn sm ghost" onClick={onPrepareNewVersion} disabled={isPreparing}>
              Prepare new version
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
