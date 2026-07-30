import { useEffect, useState } from "react";
import type { CrateRecord } from "../data/crateTypes";
import type { Track } from "../data/trackTypes";
import type { MusicImportIntakeItem, IntakeItemStatus, IntakeDuplicateResolution } from "../data/importTypes";
import { resolveIntakeStatus, reresolveIntakeItem, intakeStatusReason } from "../logic/importIntake";
import { scanPlaybackBatch } from "../logic/audioPlaybackScan";

interface Props {
  initialItems: MusicImportIntakeItem[];
  crates: CrateRecord[];
  resolveItemUrl: (item: MusicImportIntakeItem) => string | null;
  onCommit: (result: {
    committedItems: MusicImportIntakeItem[];
    updatedCrates: CrateRecord[];
    skippedCount: number;
    blockedCount: number;
  }) => void;
  onCancel: () => void;
}

function fmtDur(secs?: number): string {
  if (secs == null) return "—";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const STATUS_LABEL: Record<IntakeItemStatus, string> = {
  pending: "Pending",
  scanning: "Scanning…",
  ready: "Ready",
  needs_review: "Needs Review",
  duplicate: "Duplicate",
  blocked: "Blocked",
  committed: "Committed",
};

// 0728_MUSIC_Import_Intake_Simplification — the importer's job is destination,
// file validity, duplicate detection, editable identifying metadata, and one
// final batch import. Crate assignment, per-row Recheck/Skip/Commit, and a
// generic "Warning" status with no stated reason all belonged to Catalog, not
// here — removed rather than relabeled.
export function ImportIntakePanel({ initialItems, crates, resolveItemUrl, onCommit, onCancel }: Props) {
  const [items, setItems] = useState<MusicImportIntakeItem[]>(initialItems);
  const [scanning, setScanning] = useState(true);
  const [summary, setSummary] = useState<string | null>(null);

  // Auto-run the playability scan once on mount — this is real file-validity
  // checking, not a review-queue affordance, so it stays automatic with no
  // manual "Recheck" trigger.
  useEffect(() => {
    let cancelled = false;
    setScanning(true);
    scanPlaybackBatch(
      initialItems,
      (item) => resolveItemUrl(item),
      (item, result) => {
        if (cancelled) return;
        setItems((prev) => prev.map((it) => {
          if (it.id !== item.id) return it;
          const updated: MusicImportIntakeItem = { ...it, playbackIssue: { status: result.status, code: result.code, message: result.message } };
          return { ...updated, status: resolveIntakeStatus(updated) };
        }));
      },
    ).then(() => { if (!cancelled) setScanning(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const readyCount = items.filter((i) => i.status === "ready").length;
  const needsReviewCount = items.filter((i) => i.status === "needs_review").length;
  const duplicateCount = items.filter((i) => i.status === "duplicate").length;
  const blockedCount = items.filter((i) => i.status === "blocked").length;
  const hasCatalogItems = items.some((it) => it.track.sourceOwner === "studiorich" && it.status !== "committed");

  // Shared by the single-row edit and the Catalog "Apply StudioRich to All"
  // bulk default — keeps metadata/track in sync and reruns the SAME
  // duplicate resolver (reresolveIntakeItem → detectDuplicate) rather than
  // leaving the prior duplicateStatus/status stale after an edit.
  function applyMetadataPatch(item: MusicImportIntakeItem, patch: { title?: string; artist?: string }): MusicImportIntakeItem {
    const nextTrack: Track = {
      ...item.track,
      ...(patch.title !== undefined && { title: patch.title }),
      ...(patch.artist !== undefined && { artist: patch.artist }),
    };
    const nextMetadata = {
      ...item.metadata,
      ...(patch.title !== undefined && { title: patch.title }),
      ...(patch.artist !== undefined && { artist: patch.artist }),
    };
    return reresolveIntakeItem({ ...item, track: nextTrack, metadata: nextMetadata });
  }

  function editItem(id: string, patch: { title?: string; artist?: string }) {
    setItems((prev) => prev.map((it) => (it.id === id ? applyMetadataPatch(it, patch) : it)));
  }

  function applyStudioRichToAll() {
    setItems((prev) => prev.map((it) => (
      it.track.sourceOwner === "studiorich" && it.status !== "committed"
        ? applyMetadataPatch(it, { artist: "StudioRich" })
        : it
    )));
  }

  // The one decision a Duplicate row supports: keep the existing library
  // track (the default — a duplicate row is already excluded from Import All
  // Ready with no action needed), or explicitly authorize importing this
  // incoming file anyway. Clicking the already-active choice toggles it back
  // to undecided. No crate/playlist/analysis action lives here.
  function setDuplicateResolution(id: string, resolution: IntakeDuplicateResolution) {
    setItems((prev) => prev.map((it) => {
      if (it.id !== id) return it;
      const nextResolution = it.duplicateResolution === resolution ? undefined : resolution;
      const updated = { ...it, duplicateResolution: nextResolution };
      return { ...updated, status: resolveIntakeStatus(updated) };
    }));
  }

  function commitItems(targetItems: MusicImportIntakeItem[]) {
    if (targetItems.length === 0) return;
    const committedIds = new Set(targetItems.map((i) => i.id));
    const committedItems = targetItems.map((it) => ({ ...it, status: "committed" as const }));
    setItems((prev) => prev.map((it) => (committedIds.has(it.id) ? { ...it, status: "committed" as const } : it)));

    setSummary(
      `Imported ${committedItems.length}. ` +
      `Duplicate (not imported): ${duplicateCount}. Blocked: ${blockedCount}.`,
    );

    onCommit({
      committedItems,
      updatedCrates: crates,
      skippedCount: duplicateCount,
      blockedCount,
    });
  }

  function importAllReady() {
    commitItems(items.filter((i) => i.status === "ready" || i.status === "needs_review"));
  }

  return (
    <div className="npw-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="npw-modal npw-modal--shape">
        <div className="npw-header">
          <div className="npw-header-title">Import — {items.length} file{items.length !== 1 ? "s" : ""}</div>
          <button className="npw-close" onClick={onCancel}>✕</button>
        </div>

        <div className="npw-body">
          <div className="npw-gate-summary">
            {scanning
              ? "Scanning audio playability…"
              : `Ready ${readyCount} · Needs Review ${needsReviewCount} · Duplicate ${duplicateCount} · Blocked ${blockedCount}`}
          </div>

          {summary && <div className="npw-option-note">{summary}</div>}

          <div className="playlist-shape-table">
            <table className="npw-shape-table">
              <thead>
                <tr>
                  <th>File</th>
                  <th>Title</th>
                  <th>Artist</th>
                  <th>Duration</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const reason = intakeStatusReason(it);
                  return (
                    <tr key={it.id} className="npw-shape-row">
                      <td className="npw-shape-crates">{it.fileName}</td>
                      <td className="npw-shape-crates">
                        <input
                          className="cat-filter-search"
                          style={{ width: "100%" }}
                          value={it.metadata.title ?? ""}
                          disabled={it.status === "committed"}
                          onChange={(e) => editItem(it.id, { title: e.target.value })}
                        />
                      </td>
                      <td className="npw-shape-crates">
                        <input
                          className="cat-filter-search"
                          style={{ width: "100%" }}
                          value={it.metadata.artist ?? ""}
                          disabled={it.status === "committed"}
                          onChange={(e) => editItem(it.id, { artist: e.target.value })}
                        />
                      </td>
                      <td className="npw-shape-time">{fmtDur(it.metadata.durationSeconds)}</td>
                      <td className="npw-shape-label">
                        {STATUS_LABEL[it.status]}
                        {reason && (
                          <span style={{ display: "block", opacity: 0.7, fontSize: "0.85em", fontWeight: "normal" }}>
                            {reason}{it.duplicateResolution === "import_separately" ? " — importing separately." : ""}
                          </span>
                        )}
                        {it.status === "duplicate" && (
                          <span style={{ display: "block", marginTop: 4 }}>
                            <button
                              type="button"
                              className={`npw-btn npw-btn--small ${it.duplicateResolution === "keep_existing" ? "npw-btn--primary" : "npw-btn--ghost"}`}
                              onClick={() => setDuplicateResolution(it.id, "keep_existing")}
                            >Keep Existing</button>
                            {" "}
                            <button
                              type="button"
                              className={`npw-btn npw-btn--small ${it.duplicateResolution === "import_separately" ? "npw-btn--primary" : "npw-btn--ghost"}`}
                              onClick={() => setDuplicateResolution(it.id, "import_separately")}
                            >Import Separately</button>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="npw-actions">
            <button className="npw-btn npw-btn--ghost" onClick={onCancel}>Close</button>
            {hasCatalogItems && (
              <button className="npw-btn npw-btn--ghost" onClick={applyStudioRichToAll} title="Set Artist to StudioRich on every Catalog row in this batch">
                Apply StudioRich to All
              </button>
            )}
            <button className="npw-btn npw-btn--primary" onClick={importAllReady} disabled={readyCount + needsReviewCount === 0}>
              Import All Ready
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
