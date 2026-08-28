// Suno Library Manifest Integration — main workspace orchestrator.
//
// Fetches and parses the five WOS-share manifests client-side (lazy: only
// when this component mounts, i.e. only when the user opens Suno under
// Libraries — spec §7.3 "parse/import outside render loops"). The full
// archive-authority result lives only in this component's own state, never
// persisted to PlayProject (see sunoLibraryTypes.ts's module doc). Owns its
// own internal vertical scroll region — MUSIC's app shell and transport are
// fixed (spec §10.6/§9).

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  SunoAssetKind,
  SunoInterestMarker,
  SunoLibraryImportPointer,
  SunoLibraryImportResult,
  SunoListeningRecord,
  SunoListeningStatus,
  SunoLibraryReviewExport,
  SunoSuggestedUse,
  SunoAnalysisRecord,
} from "../../data/sunoLibraryTypes";
import { importSunoLibraryManifests } from "../../logic/sunoLibrary/manifestAdapter";
import { validateManifestSourceTexts, type ManifestSourceTexts } from "../../logic/sunoLibrary/manifestValidation";
import { indexEncodedLocationsById, indexCanonicalRecordingsById } from "../../logic/sunoLibrary/canonicalIdentity";
import { checkSunoArchiveAvailability } from "../../logic/sunoLibrary/archiveAvailability";
import { indexListeningRecordsByCanonicalId, indexWorkspacesBySlug, indexBatchesById } from "../../logic/sunoLibrary/selectors";
import {
  downloadSunoLibraryReviewExport,
  parseSunoLibraryReviewExport,
  isSunoLibraryReviewExportCompatible,
} from "../../logic/sunoLibrary/reviewExport";
import { buildTrainingExclusionRecords } from "../../logic/sunoLibrary/trainingEligibility";
import { downloadTrainingExclusionExport } from "../../logic/sunoLibrary/trainingExclusionExport";
import type { SunoTrainingExclusionBuildResult } from "../../data/sunoTrainingExclusionTypes";
import type { SunoAnalysisResultInput } from "../../logic/sunoLibrary/analysisRecords";
import { analyzeSunoRecording } from "../../logic/sunoLibrary/sunoIntelligenceAdapter";
import { flushMusicStateWrites } from "../../logic/musicAutosave";
import type { PlaybackStatus } from "../../data/playbackTypes";
import type { TrackRating } from "../../data/trackTypes";
import { SunoLibraryOverview } from "./SunoLibraryOverview";
import { SunoWorkspaceBrowser, titleFor, type SunoBrowseNavState } from "./SunoWorkspaceBrowser";
import { SunoArchiveTable } from "./SunoArchiveTable";
import { SunoRecordingDetail, type CreateSunoLoopParams } from "./SunoRecordingDetail";

export interface SunoAnalysisBatchSummary {
  total: number;
  skipped: number;
  succeeded: number;
  failed: number;
}

export interface SunoLibraryWorkspaceProps {
  listeningRecords: SunoListeningRecord[];
  interestMarkers: SunoInterestMarker[];
  analysisRecords: SunoAnalysisRecord[];
  onCommitImport: (pointer: SunoLibraryImportPointer) => void;
  onSetListeningStatus: (canonicalRecordingId: string, snapshotId: string, status: SunoListeningStatus) => void;
  onSetAssetKind: (canonicalRecordingId: string, snapshotId: string, assetKind: SunoAssetKind) => void;
  onToggleSuggestedUse: (canonicalRecordingId: string, snapshotId: string, use: SunoSuggestedUse) => void;
  onSetNotes: (canonicalRecordingId: string, snapshotId: string, notes: string) => void;
  onSetRating: (canonicalRecordingId: string, snapshotId: string, rating: TrackRating) => void;
  onUpsertInterestMarker: (marker: SunoInterestMarker) => void;
  onRemoveInterestMarker: (markerId: string) => void;
  onMergeReviewImport: (exportData: SunoLibraryReviewExport) => void;
  onMarkAnalysisQueued: (canonicalRecordingId: string, snapshotId: string) => void;
  onMarkAnalysisAnalyzing: (canonicalRecordingId: string, snapshotId: string) => void;
  onApplyAnalysisResult: (canonicalRecordingId: string, snapshotId: string, result: SunoAnalysisResultInput) => void;
  onApplyAnalysisFailure: (canonicalRecordingId: string, snapshotId: string, warnings: string[]) => void;
  // Suno Library Parity Repair — row playback through the shared MUSIC
  // transport (same audioRef/playbackStatus/PlaybackTransport as Catalog/
  // External/Sounds). auditionTrackId/playbackStatus are read-only mirrors
  // of App.tsx's own state so a Suno row can show the correct ▶/⏸ icon.
  auditionTrackId: string | null;
  playbackStatus: PlaybackStatus;
  onAuditionExternal: (meta: { trackId: string; title: string; artist: string; bpm?: number; camelotKey?: string; energy?: number }, audioUrl: string) => void;
  onPauseTrack: () => void;
  onResumeTrack: () => void;
  // 0827_MUSIC_Library_Workspace_Track_Inspector_Rearchitecture §6 — bumped
  // by App.tsx whenever the sidebar's "Song Library" row is clicked, so
  // Recordings opens even if this component is already mounted deep in a
  // workspace/batch/recording view. 0 (the initial value) never triggers.
  recordingsRequestNonce?: number;
  // 0828_MUSIC_Looper_Loop_Library_Tagging — see SunoRecordingDetail's own
  // doc comment on the identically-named prop it passes this straight
  // through to.
  onCreateLoopFromRecording?: (params: CreateSunoLoopParams) => void;
  // 0828 — deep-link straight into one recording's detail view, mirroring
  // recordingsRequestNonce's own nonce-bump pattern exactly (a changed
  // nonce always jumps, even from deep in a workspace/batch/recording
  // view). Used by the new Loop Library's "open source Recording" action
  // for a song_library-sourced loop.
  openRecordingRequest?: { canonicalRecordingId: string; nonce: number } | null;
}

type SunoNavState =
  | { level: "overview" }
  | { level: "all" }
  | { level: "workspace"; workspaceSlug: string }
  | { level: "batch"; workspaceSlug: string; batchId: string }
  | { level: "recording"; canonicalRecordingId: string; returnTo: SunoNavState };

export function SunoLibraryWorkspace(props: SunoLibraryWorkspaceProps) {
  const [importResult, setImportResult] = useState<SunoLibraryImportResult | null>(null);
  const [importPhase, setImportPhase] = useState<"loading" | "loaded" | "error">("loading");
  const [archiveOnline, setArchiveOnline] = useState<boolean | null>(null);
  // 0812C — computed alongside the manifest import, from the same already-
  // fetched sources; null until the import finishes (or if it's blocked).
  const [exclusionResult, setExclusionResult] = useState<SunoTrainingExclusionBuildResult | null>(null);
  // 0827_MUSIC_Library_Workspace_Track_Inspector_Rearchitecture §6 — the
  // FIRST-EVER sidebar click both sets viewMode to "suno_library" AND bumps
  // the nonce in the same React batch, so this component's very first
  // mount already sees a nonce > 0 — the initializer must account for that
  // directly (checking it only in a useEffect would either miss this case
  // or cause a visible dashboard-then-recordings flash).
  const [nav, setNav] = useState<SunoNavState>(() =>
    (props.recordingsRequestNonce ?? 0) > 0 ? { level: "all" } : { level: "overview" },
  );
  const importAttemptedRef = useRef(false);
  const recordingsRequestNonceRef = useRef(props.recordingsRequestNonce ?? 0);

  // A nonce change WHILE already mounted (e.g. clicking the sidebar again
  // from deep in a workspace/batch/recording view) always jumps to
  // Recordings too, regardless of whatever nav level is currently shown.
  useEffect(() => {
    const nonce = props.recordingsRequestNonce ?? 0;
    if (nonce !== recordingsRequestNonceRef.current) {
      recordingsRequestNonceRef.current = nonce;
      setNav({ level: "all" });
    }
  }, [props.recordingsRequestNonce]);

  // 0828 — same nonce-change-always-jumps pattern as recordingsRequestNonce
  // above, but straight to one recording's own detail view.
  const openRecordingNonceRef = useRef(props.openRecordingRequest?.nonce ?? 0);
  useEffect(() => {
    const req = props.openRecordingRequest;
    if (!req || req.nonce === openRecordingNonceRef.current) return;
    openRecordingNonceRef.current = req.nonce;
    setNav({ level: "recording", canonicalRecordingId: req.canonicalRecordingId, returnTo: { level: "all" } });
  }, [props.openRecordingRequest]);

  useEffect(() => {
    if (importAttemptedRef.current) return;
    importAttemptedRef.current = true;

    (async () => {
      try {
        const [acquisitionSnapshot, audioInventory, duplicateGroups, supplementalAssets, syncCheckpoint] =
          await Promise.all(
            [
              "suno-acquisition-snapshot.json",
              "suno-audio-inventory.json",
              "suno-duplicate-groups.json",
              "suno-supplemental-assets.json",
              "suno-sync-checkpoint.json",
            ].map((name) => fetch(`/suno-library-manifest/${name}`).then((r) => (r.ok ? r.text() : null))),
          );
        const sources: ManifestSourceTexts = {
          acquisitionSnapshot,
          audioInventory,
          duplicateGroups,
          supplementalAssets,
          syncCheckpoint,
        };
        const result = importSunoLibraryManifests(sources);
        setImportResult(result);
        setImportPhase("loaded");
        if (result.status !== "BLOCKED") {
          props.onCommitImport({
            snapshotId: result.snapshot.snapshotId,
            schemaVersion: result.snapshot.schemaVersion,
            importedAt: new Date().toISOString(),
            status: "imported",
            encodedLocationCount: result.snapshot.encodedLocationCount,
            canonicalRecordingCount: result.canonicalRecordings.length,
          });

          // 0812C: reuses the same already-fetched sources, no new I/O.
          const validation = validateManifestSourceTexts(sources);
          if (validation.status !== "BLOCKED") {
            setExclusionResult(
              buildTrainingExclusionRecords(
                result.encodedLocations,
                result.canonicalRecordings,
                result.batches,
                result.duplicateRelationships,
                validation.bundle.audioInventory.audioAssets,
                new Date().toISOString(),
              ),
            );
          }
        }
      } catch {
        setImportPhase("error");
      }
    })();

    checkSunoArchiveAvailability().then((availability) => setArchiveOnline(availability.state === "online"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loaded = importResult && importResult.status !== "BLOCKED" ? importResult : null;

  const locationsById = useMemo(
    () => (loaded ? indexEncodedLocationsById(loaded.encodedLocations) : new Map()),
    [loaded],
  );
  const canonicalById = useMemo(
    () => (loaded ? indexCanonicalRecordingsById(loaded.canonicalRecordings) : new Map()),
    [loaded],
  );
  const listeningByCanonicalId = useMemo(
    () => indexListeningRecordsByCanonicalId(props.listeningRecords),
    [props.listeningRecords],
  );
  const workspacesBySlug = useMemo(
    () => (loaded ? indexWorkspacesBySlug(loaded.workspaces) : new Map()),
    [loaded],
  );
  const batchesById = useMemo(() => (loaded ? indexBatchesById(loaded.batches) : new Map()), [loaded]);
  const excludedCanonicalRecordingIds = useMemo(
    () =>
      exclusionResult && exclusionResult.status === "PASS"
        ? new Set(exclusionResult.canonicalSummaries.map((s) => s.canonicalRecordingId))
        : null,
    [exclusionResult],
  );
  const exclusionSummaryByCanonicalId = useMemo(() => {
    if (!exclusionResult || exclusionResult.status !== "PASS") return new Map();
    return new Map(exclusionResult.canonicalSummaries.map((s) => [s.canonicalRecordingId, s]));
  }, [exclusionResult]);
  const analysisByCanonicalId = useMemo(
    () => new Map(props.analysisRecords.map((r) => [r.canonicalRecordingId, r])),
    [props.analysisRecords],
  );

  function openAllRecordings() {
    setNav({ level: "all" });
  }
  function openWorkspace(workspaceSlug: string) {
    setNav({ level: "workspace", workspaceSlug });
  }
  function openBatch(workspaceSlug: string, batchId: string) {
    setNav({ level: "batch", workspaceSlug, batchId });
  }
  function openRecording(canonicalRecordingId: string) {
    setNav((current) => ({ level: "recording", canonicalRecordingId, returnTo: current.level === "recording" ? current.returnTo : current }));
  }
  function goBack() {
    setNav((current) => (current.level === "recording" ? current.returnTo : { level: "overview" }));
  }

  function handleExportReviews() {
    if (!loaded) return;
    downloadSunoLibraryReviewExport(
      loaded.snapshot.snapshotId,
      props.listeningRecords,
      props.interestMarkers,
      new Date().toISOString(),
    );
  }

  function handleExportTrainingExclusions() {
    if (!exclusionResult) return;
    downloadTrainingExclusionExport(exclusionResult, new Date().toISOString());
  }

  function handleImportReviewsFile(jsonText: string): string | null {
    const parsed = parseSunoLibraryReviewExport(jsonText);
    if (!parsed.ok) return parsed.error;
    if (!loaded) return "Snapshot not loaded yet.";
    if (!isSunoLibraryReviewExportCompatible(parsed.exportData, loaded.snapshot.snapshotId)) {
      return `Export is for snapshot "${parsed.exportData.snapshotId}", current snapshot is "${loaded.snapshot.snapshotId}".`;
    }
    props.onMergeReviewImport(parsed.exportData);
    return null;
  }

  // Suno → Common MUSIC Intelligence Adapter (Phase 2) — the one place this
  // screen actually calls the real analyzer (via sunoIntelligenceAdapter.ts,
  // itself a thin bridge to the existing, unmodified analyzeTrackDspFeatures/
  // analyzeMechanicalMoods). Lives here, not in App.tsx, because this is
  // where canonicalById/locationsById already exist — the archive-authority
  // data is deliberately never lifted into App.tsx/PlayProject (see this
  // file's own module doc). Persistence (queued/analyzing/result/failure)
  // bubbles up through the four onXxx props exactly like every other Suno
  // mutation. Sequential per-recording, not a parallel batch: if analysis is
  // interrupted mid-run, everything before the current recording is already
  // saved, the current one is left in a real "analyzing" state (recoverable
  // on next load — resetOrphanedSunoAnalysis in App.tsx), and everything
  // after is untouched at its prior status.
  async function analyzeRecordings(
    canonicalRecordingIds: string[],
    opts?: { onProgress?: (done: number, total: number) => void; onPersisting?: () => void; force?: boolean },
  ): Promise<SunoAnalysisBatchSummary> {
    const onProgress = opts?.onProgress;
    const force = opts?.force ?? false;
    const summary: SunoAnalysisBatchSummary = { total: canonicalRecordingIds.length, skipped: 0, succeeded: 0, failed: 0 };
    if (!loaded) return summary;
    const snapshotId = loaded.snapshot.snapshotId;
    let done = 0;
    for (const canonicalRecordingId of canonicalRecordingIds) {
      const canonical = canonicalById.get(canonicalRecordingId);
      if (!canonical) { done++; onProgress?.(done, summary.total); continue; }

      // 0827_MUSIC_Suno_Library_Integrity_Repair — a filtered/full-archive
      // batch must be safely re-runnable: skip anything that already has a
      // real result so a re-run only does the genuinely missing work,
      // rather than redoing thousands of already-good analyses. An explicit
      // single-record Reanalyze (SunoRecordingDetail) passes force:true and
      // must always run, exactly like Track's own Reanalyze does.
      const existing = analysisByCanonicalId.get(canonicalRecordingId);
      if (!force && existing && (existing.analysisStatus === "analyzed" || existing.analysisStatus === "partial")) {
        summary.skipped++; done++; onProgress?.(done, summary.total); continue;
      }

      props.onMarkAnalysisQueued(canonicalRecordingId, snapshotId);

      const playableId = canonical.playableEncodedLocationId;
      if (!playableId) {
        // Honest failure, never a fabricated result — no materialized audio
        // exists for this recording, so there is nothing to analyze.
        props.onApplyAnalysisFailure(canonicalRecordingId, snapshotId, [
          "No materialized audio available for this recording.",
        ]);
        summary.failed++; done++; onProgress?.(done, summary.total);
        continue;
      }

      props.onMarkAnalysisAnalyzing(canonicalRecordingId, snapshotId);
      // 0827_MUSIC_Suno_Library_Integrity_Repair — analyzeSunoRecording
      // calls analyzeTrackDspFeatures, which deliberately re-throws a
      // DSP_HTTP_* error for batch classification (see its own comment)
      // and has no protection against the real BPM/key/mood/mechanical-role
      // pipeline itself throwing on an edge-case file. Catalog/External's
      // own batch loop (App.tsx, Step C / 0826B) already hit this exact
      // failure mode: an unhandled rejection here would silently abort the
      // rest of the batch with zero visible error, and root-caused it with
      // a per-track try/catch at the batch-loop level. This loop never
      // carried that same protection over from Phase 2 — a single bad file
      // among 6,925 real recordings must not silently end the run.
      // Classify any thrown error as this recording's own failure and keep
      // going, exactly like the reference implementation.
      let outcome: Awaited<ReturnType<typeof analyzeSunoRecording>>;
      try {
        outcome = await analyzeSunoRecording({
          canonicalRecordingId,
          title: titleFor(canonical, locationsById),
          durationSeconds: canonical.totalDurationSeconds,
          playableAudioUrl: `/suno-library-audio/${playableId}`,
        });
      } catch (e) {
        outcome = { ok: false, warnings: [String(e)] };
      }
      if (outcome.ok) {
        props.onApplyAnalysisResult(canonicalRecordingId, snapshotId, outcome.result);
        summary.succeeded++;
      } else {
        props.onApplyAnalysisFailure(canonicalRecordingId, snapshotId, outcome.warnings);
        summary.failed++;
      }
      done++; onProgress?.(done, summary.total);
    }
    // Gate A — Completion Semantics. Every onMarkAnalysis*/onApplyAnalysis*
    // call above enqueues a savePlayProject -> saveMusicState write onto the
    // shared, serialized _writeQueue but does not wait for it to land. This
    // function's own promise must not resolve (and callers must not report
    // "done") until every one of those writes has actually landed in
    // IndexedDB — otherwise a refresh shortly after "Done" can read stale
    // state. This does not change write ordering or the persistence model,
    // only when this function's caller learns the batch is truly finished.
    opts?.onPersisting?.();
    await flushMusicStateWrites();
    return summary;
  }

  return (
    <div className="suno-workspace">
      <div className="suno-workspace-scroll-region">
        {importPhase === "loading" && <div className="suno-loading">Loading Suno Library snapshot…</div>}
        {importPhase === "error" && (
          <div className="suno-error">Could not load the Suno Library manifests. Check the dev server console.</div>
        )}
        {importResult && importResult.status === "BLOCKED" && (
          <div className="suno-blocked">
            <h2>Suno Library import blocked</h2>
            <ul>
              {importResult.messages.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          </div>
        )}
        {loaded && nav.level === "overview" && (
          <SunoLibraryOverview
            result={loaded}
            listeningRecordsByCanonicalId={listeningByCanonicalId}
            archiveOnline={archiveOnline}
            exclusionResult={exclusionResult}
            onOpenWorkspace={openWorkspace}
            onOpenAllRecordings={openAllRecordings}
            onExportReviews={handleExportReviews}
            onImportReviewsFile={handleImportReviewsFile}
            onExportTrainingExclusions={handleExportTrainingExclusions}
          />
        )}
        {loaded && nav.level === "all" && (
          <SunoArchiveTable
            result={loaded}
            locationsById={locationsById}
            workspacesBySlug={workspacesBySlug}
            listeningRecordsByCanonicalId={listeningByCanonicalId}
            analysisByCanonicalId={analysisByCanonicalId}
            excludedCanonicalRecordingIds={excludedCanonicalRecordingIds}
            onOpenRecording={openRecording}
            onAnalyzeRecordings={analyzeRecordings}
            onBack={() => setNav({ level: "overview" })}
            auditionTrackId={props.auditionTrackId}
            playbackStatus={props.playbackStatus}
            onAuditionExternal={props.onAuditionExternal}
            onPauseTrack={props.onPauseTrack}
            onResumeTrack={props.onResumeTrack}
            onSetRating={props.onSetRating}
          />
        )}
        {loaded && (nav.level === "workspace" || nav.level === "batch") && (
          <SunoWorkspaceBrowser
            result={loaded}
            nav={nav as SunoBrowseNavState}
            locationsById={locationsById}
            workspacesBySlug={workspacesBySlug}
            batchesById={batchesById}
            listeningRecordsByCanonicalId={listeningByCanonicalId}
            archiveOnline={archiveOnline}
            excludedCanonicalRecordingIds={excludedCanonicalRecordingIds}
            onOpenBatch={openBatch}
            onOpenRecording={openRecording}
            onBack={() => setNav({ level: "overview" })}
            onBackToWorkspace={(workspaceSlug) => setNav({ level: "workspace", workspaceSlug })}
          />
        )}
        {loaded && nav.level === "recording" && (
          <SunoRecordingDetail
            canonicalRecordingId={nav.canonicalRecordingId}
            result={loaded}
            locationsById={locationsById}
            canonicalById={canonicalById}
            listeningRecordsByCanonicalId={listeningByCanonicalId}
            interestMarkers={props.interestMarkers}
            archiveOnline={archiveOnline}
            trainingExclusion={exclusionSummaryByCanonicalId.get(nav.canonicalRecordingId)}
            analysisRecord={analysisByCanonicalId.get(nav.canonicalRecordingId)}
            onBack={goBack}
            onSetListeningStatus={props.onSetListeningStatus}
            onSetAssetKind={props.onSetAssetKind}
            onToggleSuggestedUse={props.onToggleSuggestedUse}
            onSetNotes={props.onSetNotes}
            onSetRating={props.onSetRating}
            onUpsertInterestMarker={props.onUpsertInterestMarker}
            onRemoveInterestMarker={props.onRemoveInterestMarker}
            onAnalyzeRecordings={analyzeRecordings}
            onCreateLoopFromRecording={props.onCreateLoopFromRecording}
          />
        )}
      </div>
    </div>
  );
}
