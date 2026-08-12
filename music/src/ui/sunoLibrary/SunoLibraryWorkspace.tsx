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
import { SunoLibraryOverview } from "./SunoLibraryOverview";
import { SunoWorkspaceBrowser } from "./SunoWorkspaceBrowser";
import { SunoRecordingDetail } from "./SunoRecordingDetail";

export interface SunoLibraryWorkspaceProps {
  listeningRecords: SunoListeningRecord[];
  interestMarkers: SunoInterestMarker[];
  onCommitImport: (pointer: SunoLibraryImportPointer) => void;
  onSetListeningStatus: (canonicalRecordingId: string, snapshotId: string, status: SunoListeningStatus) => void;
  onSetAssetKind: (canonicalRecordingId: string, snapshotId: string, assetKind: SunoAssetKind) => void;
  onToggleSuggestedUse: (canonicalRecordingId: string, snapshotId: string, use: SunoSuggestedUse) => void;
  onSetNotes: (canonicalRecordingId: string, snapshotId: string, notes: string) => void;
  onUpsertInterestMarker: (marker: SunoInterestMarker) => void;
  onRemoveInterestMarker: (markerId: string) => void;
  onMergeReviewImport: (exportData: SunoLibraryReviewExport) => void;
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
  const [nav, setNav] = useState<SunoNavState>({ level: "overview" });
  const importAttemptedRef = useRef(false);

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
        {loaded && (nav.level === "all" || nav.level === "workspace" || nav.level === "batch") && (
          <SunoWorkspaceBrowser
            result={loaded}
            nav={nav}
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
            onBack={goBack}
            onSetListeningStatus={props.onSetListeningStatus}
            onSetAssetKind={props.onSetAssetKind}
            onToggleSuggestedUse={props.onToggleSuggestedUse}
            onSetNotes={props.onSetNotes}
            onUpsertInterestMarker={props.onUpsertInterestMarker}
            onRemoveInterestMarker={props.onRemoveInterestMarker}
          />
        )}
      </div>
    </div>
  );
}
