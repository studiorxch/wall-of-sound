import { useEffect, useMemo, useState } from "react";
import type {
  MachineLifeCategory,
  MachineLifeCollection,
  MachineLifeConstructionMode,
  MachineLifeDisposition,
  MachineLifeProxyLibrary,
  MachineLifeRecordingReview,
} from "../../data/machineLifeTypes";
import {
  commitMachineLifeManifestImport,
  type MachineLifeManifestStageResult,
} from "../../logic/machineLife/machineLifeManifestAdapter";
import {
  stageMachineLifeManifestFromWosShare,
  importMachineLifeProxiesFromWosShare,
  type ProxyImportProgress,
} from "../../logic/machineLife/machineLifeWosImport";
import {
  filterMachineLifeRecordings,
  findMachineLifeReview,
  reviewCompleteness,
  summarizeMachineLifeCollection,
  type MachineLifeRecordingFilters,
} from "../../logic/machineLife/machineLifeSelectors";
import {
  downloadMachineLifeReviewExport,
  downloadMachineLifeReviewsMarkdown,
  parseMachineLifeReviewExport,
  machineLifeReviewsRoundTripEquals,
} from "../../logic/machineLife/machineLifeExport";
import { MachineLifeRecordingDetail } from "./MachineLifeRecordingDetail";

const CATEGORIES: MachineLifeCategory[] = ["signal", "pulse", "texture", "environment", "gesture", "collision", "structure", "free-dream"];
const MODES: MachineLifeConstructionMode[] = ["layer", "sequence"];
const DISPOSITIONS: MachineLifeDisposition[] = ["preserve", "extract", "develop", "resident-seed", "system-clue", "dormant"];

function nowIso() { return new Date().toISOString(); }

interface Props {
  collections: MachineLifeCollection[];
  reviews: MachineLifeRecordingReview[];
  proxyLibraries: MachineLifeProxyLibrary[];
  onCommitCollection(collections: MachineLifeCollection[]): void;
  onSaveReview(review: MachineLifeRecordingReview): void;
  onCommitProxyLibrary(library: MachineLifeProxyLibrary): void;
  onReplaceReviewsForCollection(collectionId: string, reviews: MachineLifeRecordingReview[]): void;
}

export function MachineLifeResearchWorkspace({
  collections, reviews, proxyLibraries, onCommitCollection, onSaveReview, onCommitProxyLibrary, onReplaceReviewsForCollection,
}: Props) {
  const [selectedCollectionIdOverride, setSelectedCollectionIdOverride] = useState<string | null>(null);
  const [selectedRecordingId, setSelectedRecordingId] = useState<string | null>(null);
  const [filters, setFilters] = useState<MachineLifeRecordingFilters>({});
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [proxyProgress, setProxyProgress] = useState<ProxyImportProgress | null>(null);
  const [mirrorRootAbsPath, setMirrorRootAbsPath] = useState<string | null>(null);

  // Derived at render time (no setState-in-effect sync needed): defaults to
  // the first collection until the user explicitly picks another one.
  const selectedCollectionId = selectedCollectionIdOverride ?? collections[0]?.id ?? null;
  const setSelectedCollectionId = setSelectedCollectionIdOverride;

  useEffect(() => {
    fetch("/machine-life-mirror-root")
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { root: string; exists: boolean } | null) => {
        if (body?.exists) setMirrorRootAbsPath(body.root);
      })
      .catch(() => {});
  }, []);

  const collection = collections.find((c) => c.id === selectedCollectionId) ?? null;
  const collectionReviews = useMemo(
    () => (collection ? reviews.filter((r) => collection.recordings.some((rec) => rec.id === r.recordingId)) : []),
    [collection, reviews],
  );
  const proxyLibrary = proxyLibraries.find((p) => p.collectionId === selectedCollectionId);

  const summary = collection ? summarizeMachineLifeCollection(collection, collectionReviews, proxyLibrary) : null;
  const filteredRecordings = collection
    ? filterMachineLifeRecordings(collection.recordings, collectionReviews, proxyLibrary, filters)
    : [];
  const selectedRecording = collection?.recordings.find((r) => r.id === selectedRecordingId) ?? filteredRecordings[0] ?? null;

  async function handleImportManifest() {
    setImporting(true);
    setStatusMessage("Importing Stage 0 Pre-Life manifest from WOS Share…");
    try {
      const result: MachineLifeManifestStageResult = await stageMachineLifeManifestFromWosShare(collections, nowIso());
      if (result.status === "rejected_schema") {
        setStatusMessage(`Import rejected — unsupported or unreadable manifest: ${result.error}`);
      } else if (result.status === "rejected_invalid") {
        setStatusMessage(`Import rejected — manifest failed validation: ${result.errors.slice(0, 3).join("; ")}${result.errors.length > 3 ? "…" : ""}`);
      } else if (result.status === "duplicate") {
        setStatusMessage(`This collection is already imported (id ${result.existingCollectionId}) — duplicate import skipped.`);
        setSelectedCollectionId(result.existingCollectionId);
      } else {
        const nextCollections = commitMachineLifeManifestImport(collections, result.collection);
        onCommitCollection(nextCollections);
        setSelectedCollectionId(result.collection.id);
        setStatusMessage(`Imported ${result.collection.recordings.length} Pre-Life recordings and ${result.collection.rawSources.length} raw sources.`);
      }
    } catch (e) {
      setStatusMessage(`Import failed: ${String(e)}`);
    } finally {
      setImporting(false);
    }
  }

  async function handleImportProxies() {
    if (!collection) return;
    setImporting(true);
    setProxyProgress(null);
    setStatusMessage("Importing audition proxies from WOS Share…");
    try {
      const result = await importMachineLifeProxiesFromWosShare(collection, nowIso(), setProxyProgress);
      const existing = proxyLibrary?.proxies ?? [];
      const existingKeys = new Set(existing.map((p) => `${p.kind}:${p.stem}`));
      const merged = [...existing, ...result.proxies.filter((p) => !existingKeys.has(`${p.kind}:${p.stem}`))];
      onCommitProxyLibrary({ collectionId: collection.id, proxies: merged, issues: result.issues });
      setStatusMessage(`Imported ${result.proxies.length} audition proxies (${result.issues.length} issue(s)).`);
    } catch (e) {
      setStatusMessage(`Proxy import failed: ${String(e)}`);
    } finally {
      setImporting(false);
      setProxyProgress(null);
    }
  }

  function handleExportJson() {
    if (!collection) return;
    downloadMachineLifeReviewExport(collection.id, collectionReviews, nowIso());
  }
  function handleExportMarkdown() {
    if (!collection) return;
    downloadMachineLifeReviewsMarkdown(collection, collectionReviews, nowIso());
  }

  function handleReimportReviewsFile(file: File) {
    file.text().then((text) => {
      const parsed = parseMachineLifeReviewExport(text);
      if (!parsed.ok) { setStatusMessage(`Review re-import rejected: ${parsed.error}`); return; }
      if (!collection) return;
      const equal = machineLifeReviewsRoundTripEquals(collectionReviews, parsed.exportData.reviews);
      onReplaceReviewsForCollection(collection.id, parsed.exportData.reviews);
      setStatusMessage(equal ? "Reviews re-imported — round-trip equality confirmed." : "Reviews re-imported (content differs from the currently loaded reviews).");
    });
  }

  return (
    <main className="ml-workspace">
      <header className="ml-workspace-header">
        <h1>Machine Life Research</h1>
        <p className="ml-workspace-tagline">Deterministic Pre-Life recordings — procedural collages, not trained-model outputs.</p>
        <div className="ml-workspace-import-actions">
          <button onClick={handleImportManifest} disabled={importing}>Import Stage 0 Pre-Life manifest</button>
          <button onClick={handleImportProxies} disabled={importing || !collection}>Import audition proxies</button>
          {proxyProgress && <span className="ml-workspace-progress">{proxyProgress.done}/{proxyProgress.total} {proxyProgress.current}</span>}
        </div>
        {statusMessage && <p className="ml-workspace-status" role="status">{statusMessage}</p>}
      </header>

      {!collection || !summary ? (
        <section className="ml-workspace-empty">
          <p>No Machine Life collection imported yet. Import the real Stage 0 Pre-Life manifest from WOS Share to begin.</p>
        </section>
      ) : (
        <>
          <section className="ml-overview">
            <div><span>Collection</span><strong>{summary.collectionVersion}</strong><small>{summary.collectionId}</small></div>
            <div><span>Engine</span><strong>{summary.engine}</strong><small>{summary.engineVersion} · {summary.identityNote}</small></div>
            <div><span>Recordings</span><strong>{summary.recordingCount}</strong><small>{Object.entries(summary.categoryDistribution).map(([k, v]) => `${k}:${v}`).join(" · ")}</small></div>
            <div><span>Life</span><strong>0:{summary.lifeDistribution[0]} 1:{summary.lifeDistribution[1]} 2:{summary.lifeDistribution[2]}</strong><small>unreviewed: {summary.lifeDistribution.unreviewed}</small></div>
            <div><span>Replay</span><strong>yes:{summary.replayCount.yes} no:{summary.replayCount.no}</strong><small>unreviewed: {summary.replayCount.unreviewed}</small></div>
            <div><span>Review completion</span><strong>{summary.reviewCompletion.complete} complete</strong><small>{summary.reviewCompletion.partial} partial · {summary.reviewCompletion.unreviewed} unreviewed</small></div>
            <div><span>Pre-Life proxies</span><strong>{summary.preLifeProxiesAvailable}/{summary.preLifeProxiesExpected}</strong><small>audition MP3s, not canonical</small></div>
            <div><span>Raw proxies</span><strong>{summary.rawProxiesAvailable}/{summary.rawProxiesExpected}</strong><small>audition MP3s, not canonical</small></div>
            {summary.validationWarnings.length > 0 && (
              <div className="ml-overview-warnings"><span>Warnings</span><ul>{summary.validationWarnings.map((w, i) => <li key={i}>{w}</li>)}</ul></div>
            )}
          </section>

          <section className="ml-export-actions">
            <button onClick={handleExportJson}>Export reviews JSON</button>
            <button onClick={handleExportMarkdown}>Export reviews Markdown</button>
            <label className="ml-reimport-label">
              Re-import reviews JSON
              <input type="file" accept="application/json" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleReimportReviewsFile(f); e.target.value = ""; }} />
            </label>
          </section>

          <section className="ml-filters">
            <label>Category
              <select value={filters.category ?? ""} onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value ? (e.target.value as MachineLifeCategory) : undefined }))}>
                <option value="">All</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label>Mode
              <select value={filters.mode ?? ""} onChange={(e) => setFilters((f) => ({ ...f, mode: e.target.value ? (e.target.value as MachineLifeConstructionMode) : undefined }))}>
                <option value="">All</option>
                {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
            <label>Life
              <select value={filters.life ?? ""} onChange={(e) => setFilters((f) => ({ ...f, life: e.target.value === "" ? undefined : e.target.value === "unreviewed" ? "unreviewed" : (Number(e.target.value) as 0 | 1 | 2) }))}>
                <option value="">All</option>
                <option value="0">0</option><option value="1">1</option><option value="2">2</option>
                <option value="unreviewed">Unreviewed</option>
              </select>
            </label>
            <label>Replay
              <select value={filters.replay ?? ""} onChange={(e) => setFilters((f) => ({ ...f, replay: e.target.value ? (e.target.value as "yes" | "no" | "unreviewed") : undefined }))}>
                <option value="">All</option>
                <option value="yes">Yes</option><option value="no">No</option><option value="unreviewed">Unreviewed</option>
              </select>
            </label>
            <label>Disposition
              <select value={filters.disposition ?? ""} onChange={(e) => setFilters((f) => ({ ...f, disposition: e.target.value ? (e.target.value as MachineLifeDisposition) : undefined }))}>
                <option value="">All</option>
                {DISPOSITIONS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
            <label>Review status
              <select value={filters.reviewStatus ?? ""} onChange={(e) => setFilters((f) => ({ ...f, reviewStatus: e.target.value ? (e.target.value as "reviewed" | "unreviewed") : undefined }))}>
                <option value="">All</option>
                <option value="reviewed">Reviewed</option><option value="unreviewed">Unreviewed</option>
              </select>
            </label>
            <label>Audio
              <select value={filters.audioAvailable === undefined ? "" : filters.audioAvailable ? "available" : "unavailable"} onChange={(e) => setFilters((f) => ({ ...f, audioAvailable: e.target.value === "" ? undefined : e.target.value === "available" }))}>
                <option value="">All</option>
                <option value="available">Available</option><option value="unavailable">Unavailable</option>
              </select>
            </label>
          </section>

          <div className="ml-body">
            <section className="ml-grid">
              <table>
                <thead>
                  <tr><th>ID</th><th>Category</th><th>Mode</th><th>Duration</th><th>Life</th><th>Replay</th><th>Disposition</th><th>Audio</th><th>Review</th></tr>
                </thead>
                <tbody>
                  {filteredRecordings.map((rec) => {
                    const review = findMachineLifeReview(collectionReviews, rec.id);
                    const completeness = reviewCompleteness(review);
                    const available = proxyLibrary?.proxies.some((p) => p.kind === "pre-life" && p.stem === rec.canonicalFilename.replace(/\.[^.]+$/, "")) ?? false;
                    return (
                      <tr key={rec.id} className={selectedRecording?.id === rec.id ? "is-selected" : ""} onClick={() => setSelectedRecordingId(rec.id)}>
                        <td>{rec.id}</td>
                        <td>{rec.category}</td>
                        <td>{rec.mode}</td>
                        <td>{rec.durationSeconds}s</td>
                        <td>{review?.lifeScore ?? "—"}</td>
                        <td>{review?.replay === null || review?.replay === undefined ? "—" : review.replay ? "yes" : "no"}</td>
                        <td>{review?.disposition ?? "—"}</td>
                        <td>{available ? "available" : "unavailable"}</td>
                        <td>{completeness}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredRecordings.length === 0 && <p className="ml-grid-empty">No recordings match the current filters.</p>}
            </section>

            {selectedRecording && (
              <MachineLifeRecordingDetail
                key={selectedRecording.id}
                recording={selectedRecording}
                review={findMachineLifeReview(collectionReviews, selectedRecording.id)}
                proxyLibrary={proxyLibrary}
                mirrorRootAbsPath={mirrorRootAbsPath}
                onSaveReview={onSaveReview}
              />
            )}
          </div>
        </>
      )}
    </main>
  );
}
