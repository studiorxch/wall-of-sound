// 0718A_MUSIC_RADIO_Clean_Board_and_Explicit_Send_Flows §6 — playlist-owned
// publication tracking, ported from the deleted RadioPublishView.tsx's
// dry-run preview/storage-estimate/per-entry-promote-dialog logic, now
// scoped to ONE radioPlaylist instead of a global `<select>`. Rendered as a
// modal from both the RADIO Playlist card and the multi-track prep
// workspace header (same panel, same modal).
//
// 0718B_RADIO_Web_Publication_Asset_Export_Bridge §Architecture decision 8
// — reworked from the old three-way alreadyPublished/needsPromotion/
// excluded split to the real five-category preview (Ready/Needs approval/
// Needs preparation/Stale-or-failed/Excluded) plus a separate, non-gating
// "Performance assets (optional)" section for already-published RadioLoop
// entries. The derived lifecycle line (Draft/Preparing/Ready to
// Export/Exported vN) is display-only — EXPORTED is only ever shown when
// a validated RadioWebExportRecord exists (never inferred from playlist
// state alone).
//
// HONEST LOCAL-ONLY LANGUAGE (mandatory, spec-corrected): this build does
// not implement a real web-publish bridge. Every button and status label
// here MUST go through radioPlaylistStateLabel/the copy below — never the
// words "Publish to Web" or "Unpublish" anywhere in this file, and the
// Web Bundle export flow must always say "Does not upload or deploy."
// (see RadioWebExportPreflightDialog.tsx).

import { useEffect, useRef, useState } from "react";
import type { Track } from "../../data/trackTypes";
import type { CompleteSongAnalysis } from "../../data/songAnalysisTypes";
import type { LoopAsset } from "../../data/loopTypes";
import type { RadioInboxItem } from "../../data/radioInboxTypes";
import type { RadioPlaylist, RadioEntryPreparationState } from "../../data/radioPlaylistTypes";
import type { RadioWebExportRecord } from "../../data/radioWebBundleTypes";
import type { RadioPromotionFormInput } from "../../data/radioLoopTypes";
import type { PromoteLoopToRadioResult, RadioPromotionPhase } from "../../logic/radio/radioPromotionOrchestrator";
import { buildPublishPreview } from "../../logic/radio/radioPublishPreview";
import { estimateInboxItemBytes, summarizePlaylistStorage } from "../../logic/radio/radioStorageEstimate";
import { computePublishPatch, computeUnpublishPatch, radioPlaylistStateLabel } from "../../logic/radio/radioPlaylistPublicationState";
import {
  runOnePublishViaFetch, PUBLISH_FAILURE_LABEL,
  type PublishStage, type PublishEntryFailure,
} from "../../logic/radio/radioOnePublishOrchestrator";
import { PromoteToRadioDialog } from "./PromoteToRadioDialog";
import { RadioWebExportPreflightDialog } from "./RadioWebExportPreflightDialog";

const PUBLISH_STAGE_LABEL: Record<PublishStage, string> = {
  validating: "Validating audio",
  preparing: "Preparing audio",
  exporting: "Exporting web version",
};

function nowIso(): string {
  return new Date().toISOString();
}

interface Props {
  radioPlaylist: RadioPlaylist;
  allRadioPlaylists: RadioPlaylist[];
  radioInboxItems: RadioInboxItem[];
  libraryTracks: Track[];
  songAnalyses: CompleteSongAnalysis[];
  loops: LoopAsset[];
  preparationStateByEntryId: Map<string, RadioEntryPreparationState>;
  radioWebExports: RadioWebExportRecord[];
  onUpdateRadioPlaylist: (id: string, patch: Partial<RadioPlaylist>) => void;
  onUpdateRadioInboxItem: (id: string, patch: Partial<RadioInboxItem>) => void;
  onPromoteToRadio: (loopId: string, formInput: RadioPromotionFormInput, onProgress?: (phase: RadioPromotionPhase) => void) => Promise<PromoteLoopToRadioResult>;
  onExportedWebBundle: (record: RadioWebExportRecord) => void;
  onClose: () => void;
}

// Derived, display-only lifecycle — never rewrites the persisted
// RadioPlaylistState enum. EXPORTED vN only ever renders when a validated
// RadioWebExportRecord actually exists for this playlist.
function derivedLifecycleLabel(preview: ReturnType<typeof buildPublishPreview>, latestExport: RadioWebExportRecord | undefined, hasPreparing: boolean): string {
  if (latestExport) return `Exported v${latestExport.bundleVersion}`;
  if (hasPreparing) return "Preparing";
  const total = preview.ready.length + preview.needsApproval.length + preview.needsPreparation.length + preview.staleOrFailed.length;
  if (total > 0 && preview.ready.length === total) return "Ready to Export";
  return "Draft";
}

export function RadioPlaylistPublishPanel({
  radioPlaylist, allRadioPlaylists, radioInboxItems, libraryTracks, songAnalyses, loops,
  preparationStateByEntryId, radioWebExports,
  onUpdateRadioPlaylist, onUpdateRadioInboxItem, onPromoteToRadio, onExportedWebBundle, onClose,
}: Props) {
  const [promotingLoop, setPromotingLoop] = useState<LoopAsset | null>(null);
  const [confirmingMark, setConfirmingMark] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);

  // 0723_RADIO_One_Action_Publish — the single Publish action's own state.
  const [publishStage, setPublishStage] = useState<PublishStage | null>(null);
  const [publishFailures, setPublishFailures] = useState<PublishEntryFailure[]>([]);

  // Same pattern as RadioMultiTrackPrepWorkspace's radioPlaylistRef —
  // onEntryPatch fires repeatedly across awaited network calls within one
  // Publish run; reading the closed-over `radioPlaylist` prop directly
  // there would silently stomp an earlier entry's patch with a stale
  // entries array once React re-renders between them.
  const radioPlaylistRef = useRef(radioPlaylist);
  useEffect(() => { radioPlaylistRef.current = radioPlaylist; }, [radioPlaylist]);

  async function handlePublish() {
    setPublishFailures([]);
    setPublishStage("validating");
    try {
      const result = await runOnePublishViaFetch(
        { playlist: radioPlaylistRef.current, inboxItems: radioInboxItems, tracks: libraryTracks, analyses: songAnalyses, allPlaylists: allRadioPlaylists },
        {
          onProgress: (stage) => setPublishStage(stage),
          onEntryPatch: (entryId, patch) => {
            const nextEntries = radioPlaylistRef.current.entries.map((e) => (e.id === entryId ? { ...e, ...patch } : e));
            radioPlaylistRef.current = { ...radioPlaylistRef.current, entries: nextEntries };
            onUpdateRadioPlaylist(radioPlaylistRef.current.id, { entries: nextEntries });
          },
        },
      );
      if (result.exportRecord) onExportedWebBundle(result.exportRecord);
      if (result.playlistPatch) onUpdateRadioPlaylist(radioPlaylistRef.current.id, result.playlistPatch);
      setPublishFailures(result.failures);
    } finally {
      setPublishStage(null);
    }
  }

  const preview = buildPublishPreview(radioPlaylist, radioInboxItems, preparationStateByEntryId);
  const entries = radioPlaylist.entries.slice().sort((a, b) => a.order - b.order);
  const entryTrack = new Map<string, Track | undefined>(
    entries.map((e) => {
      const item = radioInboxItems.find((i) => i.id === e.inboxItemId);
      return [e.id, item?.sourceTrackId ? libraryTracks.find((t) => t.trackId === item.sourceTrackId) : undefined];
    }),
  );

  const playlistExports = radioWebExports
    .filter((r) => r.radioPlaylistId === radioPlaylist.id)
    .slice()
    .sort((a, b) => b.bundleVersion - a.bundleVersion);
  const latestExport = playlistExports[0];
  const hasPreparing = entries.some((e) => preparationStateByEntryId.get(e.id) === "PREPARING");

  const storageSummary = summarizePlaylistStorage(
    [...preview.ready, ...preview.needsApproval, ...preview.needsPreparation, ...preview.staleOrFailed].map((e) => {
      const item = radioInboxItems.find((i) => i.id === e.inboxItemId);
      const track = item?.sourceTrackId ? libraryTracks.find((t) => t.trackId === item.sourceTrackId) : undefined;
      const bytes = item ? estimateInboxItemBytes(item.kind, track?.durationSeconds) : "unknown";
      return { entryId: e.entryId, bytes };
    }),
    radioPlaylist.storageBudgetBytes,
  );

  function itemFor(entryId: string): RadioInboxItem | undefined {
    const entry = radioPlaylist.entries.find((e) => e.id === entryId);
    return entry ? radioInboxItems.find((i) => i.id === entry.inboxItemId) : undefined;
  }

  function trackLabelFor(entryId: string): string {
    const item = itemFor(entryId);
    if (!item?.sourceTrackId) return entryId;
    const track = libraryTracks.find((t) => t.trackId === item.sourceTrackId);
    return track ? `${track.artist} — ${track.title}` : item.sourceTrackId;
  }

  function handlePromoteClick(entryId: string) {
    const item = itemFor(entryId);
    if (!item?.sourceLoopId) return;
    const loop = loops.find((l) => l.id === item.sourceLoopId);
    if (loop) setPromotingLoop(loop);
  }

  function handlePromotionComplete(item: RadioInboxItem | undefined, result: PromoteLoopToRadioResult) {
    if (item && result.ok && result.radioLoopId) {
      onUpdateRadioInboxItem(item.id, { legacyRadioLoopId: result.radioLoopId, state: "PUBLISHED" });
    }
  }

  function handleConfirmMarkReady() {
    const now = nowIso();
    const { targetPatch, othersToUnpublish } = computePublishPatch(radioPlaylist, allRadioPlaylists, now);
    onUpdateRadioPlaylist(radioPlaylist.id, targetPatch);
    for (const other of othersToUnpublish) onUpdateRadioPlaylist(other.id, other.patch);
    setConfirmingMark(false);
  }

  function handleRemoveMark() {
    onUpdateRadioPlaylist(radioPlaylist.id, computeUnpublishPatch(radioPlaylist, nowIso()));
  }

  const isMarkedReady = radioPlaylist.state === "PUBLISHED";
  const hasPriorMark = !!radioPlaylist.publishedAt;
  const eligibleForMark = preview.ready.length + preview.performanceAssets.length;

  function renderCategory(title: string, items: typeof preview.ready, opts?: { showLoopPromote?: boolean }) {
    return (
      <div className="radio-publish-section">
        <h3>{title} ({items.length})</h3>
        <ul>
          {items.map((e) => {
            const item = itemFor(e.entryId);
            const canPromote = opts?.showLoopPromote && item?.kind === "loop" && !item.legacyRadioLoopId && item.sourceLoopId;
            return (
              <li key={e.entryId}>
                {trackLabelFor(e.entryId)}
                {e.reason && <span className="radio-diff-note"> — {e.reason}</span>}
                {canPromote && <button onClick={() => handlePromoteClick(e.entryId)}>Promote…</button>}
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <div className="radio-dialog-overlay" role="dialog" aria-modal="true">
      <div className="radio-dialog radio-publish-panel">
        <div className="radio-dialog-header-row">
          <h3>{radioPlaylist.title} — Publication Tracking</h3>
          <button className="radio-overlay-close" onClick={onClose}>✕</button>
        </div>

        <p className="radio-publish-notice">
          Publishing exports a local, self-contained web bundle. It does not upload, host, or deploy anything.
        </p>

        <div className="radio-publish-primary">
          {publishStage ? (
            <>
              <button className="npw-btn npw-btn--primary" disabled>Publishing…</button>
              <span className="radio-diff-note">{PUBLISH_STAGE_LABEL[publishStage]}</span>
            </>
          ) : latestExport ? (
            <>
              <a className="npw-btn npw-btn--primary" href={`/radio-player.html?slug=${encodeURIComponent(latestExport.slug)}&v=${latestExport.bundleVersion}`} target="_blank" rel="noreferrer">
                Play Preview
              </a>
              <button className="npw-btn npw-btn--ghost" onClick={handlePublish}>Update Published Version</button>
            </>
          ) : (
            <button className="npw-btn npw-btn--primary" onClick={handlePublish}>Publish</button>
          )}
        </div>

        {publishFailures.length > 0 && (
          <div className="radio-publish-failures">
            <h4>Publish couldn't complete ({publishFailures.length})</h4>
            <ul>
              {publishFailures.map((f, i) => (
                <li key={i}>{f.title && f.entryId ? `"${f.title}" — ` : ""}{PUBLISH_FAILURE_LABEL[f.category]}{f.message ? ` — ${f.message}` : ""}</li>
              ))}
            </ul>
            <button className="npw-btn npw-btn--primary" onClick={handlePublish}>Retry Publish</button>
          </div>
        )}

        <details className="radio-publish-preview">
          <summary>Diagnostics — approval, preparation, and manual export controls</summary>

          <p className="radio-diff-note">
            Current state: <strong>{radioPlaylistStateLabel(radioPlaylist.state)}</strong>
            {" · "}Web bundle lifecycle: <strong>{derivedLifecycleLabel(preview, latestExport, hasPreparing)}</strong>
          </p>

          <div className="radio-publish-storage">
            <span>Estimated size: {(storageSummary.totalBytes / 1024 / 1024).toFixed(1)} MB</span>
            <span>Budget: {(storageSummary.budgetBytes / 1024 / 1024 / 1024).toFixed(1)} GB</span>
            <span>Remaining: {(storageSummary.remainingBytes / 1024 / 1024).toFixed(1)} MB</span>
            {storageSummary.unknownCount > 0 && <span>{storageSummary.unknownCount} unknown-size assets</span>}
            {storageSummary.overBudget && <span className="radio-badge radio-badge-failed">Over budget</span>}
            {storageSummary.nearBudget && !storageSummary.overBudget && <span className="radio-badge radio-badge-unprepared">Near budget</span>}
          </div>

          {renderCategory("Ready", preview.ready)}
          {renderCategory("Needs approval", preview.needsApproval)}
          {renderCategory("Needs preparation", preview.needsPreparation)}
          {renderCategory("Stale / failed", preview.staleOrFailed)}
          {renderCategory("Excluded", preview.excluded, { showLoopPromote: true })}

          <div className="radio-publish-section radio-publish-performance-assets">
            <h3>Performance assets — optional ({preview.performanceAssets.length})</h3>
            <p className="radio-diff-note">RadioLoop performance clips never gate a full-track Web Bundle export.</p>
            <ul>
              {preview.performanceAssets.map((e) => <li key={e.entryId}>{trackLabelFor(e.entryId)} · {e.radioLoopId}</li>)}
            </ul>
          </div>

          {playlistExports.length > 0 && (
            <div className="radio-publish-section radio-publish-export-history">
              <h3>Exported bundles ({playlistExports.length})</h3>
              <ul>
                {playlistExports.map((r) => (
                  <li key={r.id}>
                    v{r.bundleVersion} — {r.entryCount} tracks — {(r.totalByteSize / 1024 / 1024).toFixed(1)} MB — {new Date(r.exportedAt).toLocaleString()}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="radio-dialog-actions">
            <button className="npw-btn npw-btn--primary" onClick={() => setShowExportDialog(true)}>Export Web Bundle…</button>
            {isMarkedReady ? (
              <button className="npw-btn npw-btn--ghost" onClick={handleRemoveMark}>Remove Publication Mark</button>
            ) : !confirmingMark ? (
              <button
                className="npw-btn npw-btn--ghost"
                disabled={eligibleForMark === 0}
                onClick={() => setConfirmingMark(true)}
              >
                {hasPriorMark ? "Update Publication Mark" : "Mark Ready for Publishing"}
              </button>
            ) : (
              <>
                <span>Mark {eligibleForMark} entries ready? Excluded entries are skipped.</span>
                <button className="npw-btn npw-btn--ghost" onClick={() => setConfirmingMark(false)}>Cancel</button>
                <button className="npw-btn npw-btn--primary" onClick={handleConfirmMarkReady}>Confirm</button>
              </>
            )}
          </div>
        </details>

        {showExportDialog && (
          <RadioWebExportPreflightDialog
            radioPlaylist={radioPlaylist}
            entries={entries}
            entryTrack={entryTrack}
            preparationStateByEntryId={preparationStateByEntryId}
            radioWebExports={radioWebExports}
            onExported={(record) => { onExportedWebBundle(record); }}
            onClose={() => setShowExportDialog(false)}
          />
        )}

        {promotingLoop && (
          <PromoteToRadioDialog
            loop={promotingLoop}
            onPromote={async (loopId, formInput, onProgress) => {
              const result = await onPromoteToRadio(loopId, formInput, onProgress);
              const item = radioInboxItems.find((i) => i.sourceLoopId === loopId);
              handlePromotionComplete(item, result);
              return result;
            }}
            onClose={() => setPromotingLoop(null)}
          />
        )}
      </div>
    </div>
  );
}
