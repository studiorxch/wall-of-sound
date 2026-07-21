// 0717D_RADIO_Playlist_Inbox_and_Performance_Foundation §10 — the 25-50
// row multi-track preparation stack. On mount, kicks off bounded-
// concurrency batch waveform/analysis preparation (default concurrency 1)
// for every track lacking a fresh CompleteSongAnalysis; collapsed rows
// read the resulting persisted waveformSummary with zero decode. Rows are
// windowed via computeVisibleRowRange (no virtualization library exists
// in this codebase); exactly one row can be expanded at a time, mounting
// the SAME SectionalLooperWorkspace component the standalone page uses
// (embedded prop), fully unmounted on collapse.
//
// 0718B_RADIO_Web_Publication_Asset_Export_Bridge — owns the ONE
// verification pass (GET /radio-track-verify per bound entry, run on
// mount/playlist change) and per-entry approve/prepare orchestration.
// RadioPrepRow never fetches anything itself; every derived preparation
// state it renders comes from computeEntryPreparationState here.

import { useEffect, useMemo, useRef, useState } from "react";
import type { Track } from "../../data/trackTypes";
import type { CompleteSongAnalysis } from "../../data/songAnalysisTypes";
import type { RadioInboxItem } from "../../data/radioInboxTypes";
import type { RadioPlaylist, RadioPlaylistEntry, RadioTrackPackageBinding } from "../../data/radioPlaylistTypes";
import type { RadioTrackPrepareResponse, RadioTrackVerifyResult } from "../../data/radioTrackPackageTypes";
import type { RadioWebExportRecord } from "../../data/radioWebBundleTypes";
import { prepareMissingAnalysesForPlaylist, type PlaylistWaveformPreparationProgress } from "../../logic/radio/radioPlaylistWaveformPreparation";
import { computeVisibleRowRange } from "../../logic/radio/radioRowWindowing";
import { computeEntryPreparationState, buildApprovalPatch, buildTrackPrepareRequest } from "../../logic/radio/radioEntryPreparation";
import { runTrackPreparationBatch, prepareTrackViaFetch, fetchSourceAssetHash, verifyTrackBindingViaFetch, type PrepareEntryTask } from "../../logic/radio/radioTrackPreparationOrchestrator";
import { RadioPrepRow } from "./RadioPrepRow";
import { SectionalLooperWorkspace, type SectionalLooperWorkspaceProps } from "../SectionalLooperWorkspace";
import { RadioPlaylistPublishPanel } from "./RadioPlaylistPublishPanel";

// The RADIO multi-track prep workspace mounts the exact same
// SectionalLooperWorkspace component the standalone Looper page uses, per
// expanded row — every prop except sourceTrackId/onSelectSourceTrack/
// embedded/onCollapse (which the prep workspace supplies itself) is
// shared verbatim with the standalone call site. Moved here from the now-
// deleted RadioWorkspace.tsx (0718A §6 — the tab shell is gone).
export type RadioLooperSharedProps = Omit<SectionalLooperWorkspaceProps, "sourceTrackId" | "onSelectSourceTrack" | "embedded" | "onCollapse">;

const ROW_HEIGHT = 130;
const CONTAINER_HEIGHT = 640;
const OVERSCAN = 3;

interface Props {
  radioPlaylist: RadioPlaylist;
  allRadioPlaylists: RadioPlaylist[];
  radioInboxItems: RadioInboxItem[];
  libraryTracks: Track[];
  songAnalyses: CompleteSongAnalysis[];
  radioWebExports: RadioWebExportRecord[];
  onUpdateRadioPlaylist: (id: string, patch: Partial<RadioPlaylist>) => void;
  onUpdateRadioInboxItem: (id: string, patch: Partial<RadioInboxItem>) => void;
  onExportWebBundle: (record: RadioWebExportRecord) => void;
  looperShared: RadioLooperSharedProps;
  onBack: () => void;
  // 0721_MUSIC_RADIO_Sectional_Loopchain_Player — opens the loopchain
  // player with this playlist's currently-bound source tracks as
  // candidates. Optional so this component never breaks if a caller
  // hasn't wired it (e.g. a test render).
  onOpenLoopchainPlayer?: (candidateSourceTrackIds: string[]) => void;
}

interface BatchState {
  total: number;
  completed: number;
  currentEntryId: string | null;
}

export function RadioMultiTrackPrepWorkspace({
  radioPlaylist, allRadioPlaylists, radioInboxItems, libraryTracks, songAnalyses, radioWebExports,
  onUpdateRadioPlaylist, onUpdateRadioInboxItem, onExportWebBundle, looperShared, onBack, onOpenLoopchainPlayer,
}: Props) {
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [prepProgress, setPrepProgress] = useState<PlaylistWaveformPreparationProgress | null>(null);
  const [showPublishPanel, setShowPublishPanel] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // 0718B — always-fresh entries for async callbacks (approve/prepare
  // responses arrive after the render that started them; reading the
  // closed-over `radioPlaylist` prop directly there would silently stomp
  // over any other entry patched in between).
  const radioPlaylistRef = useRef(radioPlaylist);
  useEffect(() => { radioPlaylistRef.current = radioPlaylist; }, [radioPlaylist]);

  const [verificationByEntryId, setVerificationByEntryId] = useState<Map<string, RadioTrackVerifyResult>>(new Map());
  const [busyEntryIds, setBusyEntryIds] = useState<Set<string>>(new Set());
  const [approvingEntryIds, setApprovingEntryIds] = useState<Set<string>>(new Set());
  const [batchState, setBatchState] = useState<BatchState | null>(null);
  const [confirmingApproveEligible, setConfirmingApproveEligible] = useState(false);
  const batchAbortRef = useRef<AbortController | null>(null);

  const entries = useMemo(() => radioPlaylist.entries.slice().sort((a, b) => a.order - b.order), [radioPlaylist.entries]);

  const entryTrack = useMemo(() => {
    const map = new Map<string, Track | undefined>();
    for (const entry of entries) {
      const item = radioInboxItems.find((i) => i.id === entry.inboxItemId);
      map.set(entry.id, item?.sourceTrackId ? libraryTracks.find((t) => t.trackId === item.sourceTrackId) : undefined);
    }
    return map;
  }, [entries, radioInboxItems, libraryTracks]);

  function analysisFor(track: Track | undefined): CompleteSongAnalysis | undefined {
    return track ? songAnalyses.find((a) => a.sourceTrackId === track.trackId) : undefined;
  }

  // Batch preparation — starts fresh whenever the OPEN playlist changes.
  // Re-running this over an already-fully-prepared playlist costs nothing
  // (ensureSongAnalysisReady's own cache boundary makes it a no-op per
  // track), so this can safely run every time the workspace mounts.
  useEffect(() => {
    const tracks = entries
      .map((e) => entryTrack.get(e.id))
      .filter((t): t is Track => !!t);

    if (tracks.length === 0) return;
    const controller = new AbortController();
    abortRef.current = controller;

    prepareMissingAnalysesForPlaylist(tracks, looperShared.ensureSongAnalysisReady, {
      signal: controller.signal,
      // A track already in flight when Cancel is clicked still finishes
      // and reports its own completion — ignore that report once aborted
      // so a stale "Preparing…" bar doesn't reappear after cancellation.
      onProgress: (p) => { if (!controller.signal.aborted) setPrepProgress(p); },
    }).finally(() => {
      if (!controller.signal.aborted) setPrepProgress(null);
    });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radioPlaylist.id]);

  // 0718B — the ONE verification pass: every bound entry gets a live
  // /radio-track-verify call on mount/playlist change, never a UI-derived
  // guess. Entries with no binding yet have nothing to verify.
  useEffect(() => {
    let cancelled = false;
    const bound = entries.filter((e) => e.trackBinding);

    // Promise.all([]) still resolves asynchronously via the same .then()
    // below — no early-return special case needed, and every setState
    // call here happens inside that async callback, never synchronously
    // in the effect body itself.
    Promise.all(bound.map(async (e) => {
      const binding = e.trackBinding!;
      const result = await verifyTrackBindingViaFetch({
        radioTrackId: binding.radioTrackId, packageVersion: binding.packageVersion,
        sourceAssetHash: binding.sourceAssetHash, packageManifestHash: binding.packageManifestHash,
      });
      return [e.id, result] as const;
    })).then((pairs) => {
      if (cancelled) return;
      const next = new Map<string, RadioTrackVerifyResult>();
      for (const [entryId, result] of pairs) if (result) next.set(entryId, result);
      setVerificationByEntryId(next);
    });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radioPlaylist.id, entries.map((e) => `${e.id}:${e.trackBinding?.packageVersion ?? ""}`).join(",")]);

  const preparationStateByEntryId = useMemo(() => {
    const map = new Map<string, ReturnType<typeof computeEntryPreparationState>>();
    for (const entry of entries) {
      map.set(entry.id, computeEntryPreparationState({
        entry,
        verification: verificationByEntryId.get(entry.id) ?? null,
        isPreparing: batchState?.currentEntryId === entry.id || (busyEntryIds.has(entry.id) && !approvingEntryIds.has(entry.id)),
      }));
    }
    return map;
  }, [entries, verificationByEntryId, batchState, busyEntryIds, approvingEntryIds]);

  function patchEntry(entryId: string, patch: Partial<RadioPlaylistEntry>) {
    const nextEntries = radioPlaylistRef.current.entries.map((e) => (e.id === entryId ? { ...e, ...patch } : e));
    onUpdateRadioPlaylist(radioPlaylistRef.current.id, { entries: nextEntries });
  }

  function applyPrepareResponse(entryId: string, response: RadioTrackPrepareResponse) {
    const now = new Date().toISOString();
    if (response.ok && response.radioTrackId && response.packageVersion != null && response.sourceAssetHash && response.packageManifestHash) {
      const binding: RadioTrackPackageBinding = {
        radioTrackId: response.radioTrackId, packageVersion: response.packageVersion,
        sourceTrackId: entryTrack.get(entryId)?.trackId ?? "", sourceAssetHash: response.sourceAssetHash,
        packageManifestHash: response.packageManifestHash, boundAt: now,
      };
      patchEntry(entryId, { trackBinding: binding, lastPreparationError: undefined });
    } else {
      const issue = response.issues[0];
      patchEntry(entryId, { lastPreparationError: { code: issue?.code ?? "RADIO_TRACK_PREPARE_FAILED", message: issue?.message ?? "Preparation failed", at: now } });
    }
    setVerificationByEntryId((m) => { const n = new Map(m); n.delete(entryId); return n; });
  }

  async function handleApprove(entryId: string) {
    const track = entryTrack.get(entryId);
    if (!track?.audioRelPath) return;
    setApprovingEntryIds((s) => new Set(s).add(entryId));
    setBusyEntryIds((s) => new Set(s).add(entryId));
    try {
      const hash = await fetchSourceAssetHash(track.audioRelPath);
      if (!hash) return;
      const patch = buildApprovalPatch(hash, analysisFor(track));
      patchEntry(entryId, { approval: patch });
    } finally {
      setApprovingEntryIds((s) => { const n = new Set(s); n.delete(entryId); return n; });
      setBusyEntryIds((s) => { const n = new Set(s); n.delete(entryId); return n; });
    }
  }

  async function handleApproveEligible() {
    setConfirmingApproveEligible(false);
    const eligible = entries.filter((e) => preparationStateByEntryId.get(e.id) === "NOT_APPROVED");
    for (const e of eligible) await handleApprove(e.id); // sequential — same source-hash-fetch cost profile as a single approve
  }

  async function handlePrepareOne(entryId: string, forceNewVersion?: boolean) {
    const track = entryTrack.get(entryId);
    const entry = entries.find((e) => e.id === entryId);
    const request = track && entry ? buildTrackPrepareRequest(track, analysisFor(track), entry.approval, forceNewVersion) : null;
    if (!request) return;
    setBusyEntryIds((s) => new Set(s).add(entryId));
    try {
      const response = await prepareTrackViaFetch(request);
      applyPrepareResponse(entryId, response);
    } finally {
      setBusyEntryIds((s) => { const n = new Set(s); n.delete(entryId); return n; });
    }
  }

  async function handlePrepareBatch() {
    const eligible = entries.filter((e) => {
      const state = preparationStateByEntryId.get(e.id);
      return state === "NEEDS_PREPARATION" || state === "FAILED" || state === "STALE";
    });
    const tasks: PrepareEntryTask[] = [];
    for (const e of eligible) {
      const track = entryTrack.get(e.id);
      const request = track ? buildTrackPrepareRequest(track, analysisFor(track), e.approval) : null;
      if (request) tasks.push({ entryId: e.id, request });
    }
    if (tasks.length === 0) return;

    const controller = new AbortController();
    batchAbortRef.current = controller;
    setBatchState({ total: tasks.length, completed: 0, currentEntryId: null });

    await runTrackPreparationBatch(tasks, {
      signal: controller.signal,
      prepareTrack: prepareTrackViaFetch,
      onEntryStart: (entryId) => setBatchState((s) => (s ? { ...s, currentEntryId: entryId } : s)),
      onEntryComplete: (entryId, response) => {
        applyPrepareResponse(entryId, response);
        setBatchState((s) => (s ? { ...s, completed: s.completed + 1, currentEntryId: null } : s));
      },
    });
    setBatchState(null);
  }

  function handleCancelBatch() {
    batchAbortRef.current?.abort();
  }

  function handleCancelPrep() {
    abortRef.current?.abort();
    setPrepProgress(null);
  }

  function handleToggleLock(entryId: string) {
    patchEntry(entryId, { locked: !entries.find((e) => e.id === entryId)?.locked });
  }

  function handleToggleInclude(entryId: string) {
    patchEntry(entryId, { includedInPublish: !entries.find((e) => e.id === entryId)?.includedInPublish });
  }

  const notApprovedCount = entries.filter((e) => preparationStateByEntryId.get(e.id) === "NOT_APPROVED").length;
  const preparableCount = entries.filter((e) => {
    const s = preparationStateByEntryId.get(e.id);
    return s === "NEEDS_PREPARATION" || s === "FAILED" || s === "STALE";
  }).length;

  const expandedIndex = expandedEntryId ? entries.findIndex((e) => e.id === expandedEntryId) : null;
  const range = computeVisibleRowRange(scrollTop, CONTAINER_HEIGHT, ROW_HEIGHT, entries.length, OVERSCAN, expandedIndex);
  const visibleEntries = entries.slice(range.startIndex, range.endIndex);

  const expandedEntry = expandedEntryId ? entries.find((e) => e.id === expandedEntryId) : undefined;
  const expandedTrack = expandedEntry ? entryTrack.get(expandedEntry.id) : undefined;

  return (
    <div className="radio-prep-workspace">
      <div className="radio-prep-header">
        <button className="looper-back" onClick={onBack}>← Back to Playlists</button>
        <h2>{radioPlaylist.title}</h2>
        <span className="radio-prep-header-meta">{entries.length} entries · {radioPlaylist.state}</span>
        <div className="radio-prep-header-actions">
          {!confirmingApproveEligible ? (
            <button className="tb-btn sm" disabled={notApprovedCount === 0} onClick={() => setConfirmingApproveEligible(true)}>
              Approve eligible… ({notApprovedCount})
            </button>
          ) : (
            <span className="radio-prep-confirm-inline">
              Approve {notApprovedCount} entries with their current source audio?
              <button className="tb-btn sm ghost" onClick={() => setConfirmingApproveEligible(false)}>Cancel</button>
              <button className="tb-btn sm" onClick={handleApproveEligible}>Confirm</button>
            </span>
          )}
          <button className="tb-btn sm" disabled={preparableCount === 0 || !!batchState} onClick={handlePrepareBatch}>
            Prepare assets… ({preparableCount})
          </button>
          <button className="tb-btn sm" onClick={() => setShowPublishPanel(true)}>Publication Tracking…</button>
          {onOpenLoopchainPlayer && (
            <button
              className="tb-btn sm"
              disabled={entryTrack.size === 0}
              onClick={() => onOpenLoopchainPlayer(
                Array.from(new Set(Array.from(entryTrack.values()).filter((t): t is Track => Boolean(t)).map((t) => t.trackId))),
              )}
            >
              Loopchain Player…
            </button>
          )}
        </div>
      </div>

      {showPublishPanel && (
        <RadioPlaylistPublishPanel
          radioPlaylist={radioPlaylist}
          allRadioPlaylists={allRadioPlaylists}
          radioInboxItems={radioInboxItems}
          libraryTracks={libraryTracks}
          loops={looperShared.loops}
          preparationStateByEntryId={preparationStateByEntryId}
          radioWebExports={radioWebExports}
          onUpdateRadioPlaylist={onUpdateRadioPlaylist}
          onUpdateRadioInboxItem={onUpdateRadioInboxItem}
          onPromoteToRadio={looperShared.onPromoteToRadio}
          onExportedWebBundle={onExportWebBundle}
          onClose={() => setShowPublishPanel(false)}
        />
      )}

      {prepProgress && (
        <div className="radio-prep-progress" role="status">
          <span>Preparing waveforms… {prepProgress.completed}/{prepProgress.total}</span>
          <button onClick={handleCancelPrep}>Cancel</button>
        </div>
      )}

      {batchState && (
        <div className="radio-prep-progress" role="status">
          <span>Preparing web assets… {batchState.completed}/{batchState.total}{batchState.currentEntryId ? ` — ${entryTrack.get(batchState.currentEntryId)?.title ?? "…"}` : ""}</span>
          <button onClick={handleCancelBatch}>Cancel</button>
        </div>
      )}

      {expandedEntry && expandedTrack ? (
        <div className="radio-prep-expanded">
          <SectionalLooperWorkspace
            {...looperShared}
            sourceTrackId={expandedTrack.trackId}
            onSelectSourceTrack={() => {}}
            embedded
            onCollapse={() => setExpandedEntryId(null)}
          />
        </div>
      ) : (
        <div
          className="radio-prep-row-list"
          style={{ height: CONTAINER_HEIGHT, overflowY: "auto" }}
          onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        >
          <div style={{ height: range.startIndex * ROW_HEIGHT }} />
          {visibleEntries.map((entry, i) => {
            const globalIndex = range.startIndex + i;
            const track = entryTrack.get(entry.id);
            const analysis = analysisFor(track);
            return (
              <RadioPrepRow
                key={entry.id}
                order={globalIndex}
                entry={entry}
                track={track}
                analysis={analysis}
                preparationState={preparationStateByEntryId.get(entry.id) ?? "NOT_APPROVED"}
                isApproving={approvingEntryIds.has(entry.id)}
                isPreparing={busyEntryIds.has(entry.id) && !approvingEntryIds.has(entry.id) || batchState?.currentEntryId === entry.id}
                onExpand={() => setExpandedEntryId(entry.id)}
                onToggleLock={() => handleToggleLock(entry.id)}
                onToggleInclude={() => handleToggleInclude(entry.id)}
                onApprove={() => handleApprove(entry.id)}
                onPrepare={() => handlePrepareOne(entry.id)}
                onPrepareNewVersion={() => handlePrepareOne(entry.id, true)}
              />
            );
          })}
          <div style={{ height: (entries.length - range.endIndex) * ROW_HEIGHT }} />
          {entries.length === 0 && <div className="radio-inbox-empty">This playlist has no entries.</div>}
        </div>
      )}
    </div>
  );
}
