import { useEffect, useMemo, useState } from "react";
import type { CrateRecord } from "../data/crateTypes";
import type { MusicImportIntakeItem } from "../data/importTypes";
import { resolveIntakeStatus, assignTracksToCrates } from "../logic/importIntake";
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

const STATUS_LABEL: Record<MusicImportIntakeItem["status"], string> = {
  pending: "Pending",
  scanning: "Scanning…",
  ready: "Ready",
  warning: "Warning",
  blocked: "Blocked",
  committed: "Committed",
  skipped: "Skipped",
};

export function ImportIntakePanel({ initialItems, crates, resolveItemUrl, onCommit, onCancel }: Props) {
  const [items, setItems] = useState<MusicImportIntakeItem[]>(initialItems);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [scanning, setScanning] = useState(true);
  const [summary, setSummary] = useState<string | null>(null);

  // Auto-run the playability scan once on mount (spec §Audio Playability Scan
  // — "Import must run a playability scan automatically").
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
  const warningCount = items.filter((i) => i.status === "warning").length;
  const blockedCount = items.filter((i) => i.status === "blocked").length;
  const skippedCount = items.filter((i) => i.status === "skipped").length;

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function recheckItem(id: string) {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, status: "scanning" } : it)));
    scanPlaybackBatch([item], (i) => resolveItemUrl(i), (i, result) => {
      setItems((prev) => prev.map((it) => {
        if (it.id !== i.id) return it;
        const updated: MusicImportIntakeItem = { ...it, playbackIssue: { status: result.status, code: result.code, message: result.message } };
        return { ...updated, status: resolveIntakeStatus(updated) };
      }));
    });
  }

  function clearIssue(id: string) {
    setItems((prev) => prev.map((it) => {
      if (it.id !== id) return it;
      const updated: MusicImportIntakeItem = { ...it, playbackIssue: undefined };
      return { ...updated, status: resolveIntakeStatus(updated) };
    }));
  }

  function skipItem(id: string) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, status: "skipped" } : it)));
    setSelectedIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
  }

  function skipBlocked() {
    setItems((prev) => prev.map((it) => (it.status === "blocked" ? { ...it, status: "skipped" } : it)));
  }

  function recheckSelected() {
    const targets = items.filter((i) => selectedIds.has(i.id));
    targets.forEach((i) => setItems((prev) => prev.map((it) => (it.id === i.id ? { ...it, status: "scanning" } : it))));
    scanPlaybackBatch(targets, (i) => resolveItemUrl(i), (i, result) => {
      setItems((prev) => prev.map((it) => {
        if (it.id !== i.id) return it;
        const updated: MusicImportIntakeItem = { ...it, playbackIssue: { status: result.status, code: result.code, message: result.message } };
        return { ...updated, status: resolveIntakeStatus(updated) };
      }));
    });
  }

  function assignCrateToItems(ids: string[], crateId: string) {
    setItems((prev) => prev.map((it) => (ids.includes(it.id) && !it.assignedCrateIds.includes(crateId)
      ? { ...it, assignedCrateIds: [...it.assignedCrateIds, crateId] }
      : it)));
  }

  const cratesById = useMemo(() => new Map(crates.map((c) => [c.id, c])), [crates]);

  function commitItems(targetItems: MusicImportIntakeItem[]) {
    if (targetItems.length === 0) return;
    // Group by exact assigned-crate set so assignTracksToCrates tags each
    // group with the right shared grouping value.
    const groups = new Map<string, MusicImportIntakeItem[]>();
    for (const it of targetItems) {
      const key = [...it.assignedCrateIds].sort().join(",");
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(it);
    }

    let updatedCrates = crates;
    const committedTracks: typeof targetItems[number]["track"][] = [];
    const cratesByIdLocal = new Map(updatedCrates.map((c) => [c.id, c]));

    for (const [key, groupItems] of groups) {
      const crateIds = key ? key.split(",") : [];
      const groupCrates = crateIds.map((id) => cratesByIdLocal.get(id)).filter((c): c is CrateRecord => !!c);
      const tracksIn = groupItems.map((it) => it.track);
      const { tracks: taggedTracks, crates: updatedGroupCrates } = assignTracksToCrates(tracksIn, groupCrates);
      committedTracks.push(...taggedTracks);
      for (const c of updatedGroupCrates) cratesByIdLocal.set(c.id, c);
    }

    updatedCrates = [...cratesByIdLocal.values()];

    const taggedTrackById = new Map(committedTracks.map((t) => [t.trackId, t]));
    const committedIds = new Set(targetItems.map((i) => i.id));
    const committedItems = targetItems.map((it) => ({
      ...it,
      track: taggedTrackById.get(it.track.trackId) ?? it.track,
      status: "committed" as const,
    }));
    setItems((prev) => prev.map((it) => (committedIds.has(it.id) ? { ...it, status: "committed" } : it)));

    const crateAssignSummary = updatedCrates
      .filter((c) => crates.find((orig) => orig.id === c.id)?.filters.groupings.length !== c.filters.groupings.length)
      .map((c) => `Added ${committedItems.filter((it) => it.assignedCrateIds.includes(c.id)).length} tracks to ${c.name}.`)
      .join(" ");

    setSummary(
      `Import complete. Committed: ${committedItems.length}. Skipped duplicates: ${targetItems.filter((i) => i.duplicateStatus === "exact_duplicate").length}. ` +
      `Blocked: ${blockedCount}. ${crateAssignSummary}`.trim(),
    );

    onCommit({
      committedItems,
      updatedCrates,
      skippedCount,
      blockedCount,
    });
  }

  function commitAllSafe() {
    commitItems(items.filter((i) => (i.status === "ready" || i.status === "warning")));
  }

  function commitOne(id: string) {
    const item = items.find((i) => i.id === id);
    if (item) commitItems([item]);
  }

  const allDone = !scanning && items.every((i) => i.status === "committed" || i.status === "skipped" || i.status === "blocked");

  return (
    <div className="npw-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="npw-modal npw-modal--shape">
        <div className="npw-header">
          <div className="npw-header-title">Import Intake — {items.length} file{items.length !== 1 ? "s" : ""}</div>
          <button className="npw-close" onClick={onCancel}>✕</button>
        </div>

        <div className="npw-body">
          <div className="npw-gate-summary">
            {scanning ? "Scanning audio playability…" : `Ready ${readyCount} · Warning ${warningCount} · Blocked ${blockedCount} · Skipped ${skippedCount}`}
          </div>

          {summary && <div className="npw-option-note">{summary}</div>}

          <div className="playlist-shape-table">
            <table className="npw-shape-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Status</th>
                  <th>File</th>
                  <th>Title</th>
                  <th>Artist</th>
                  <th>Duration</th>
                  <th>Codec / Playback</th>
                  <th>Duplicate</th>
                  <th>Crates</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className="npw-shape-row">
                    <td>
                      <input type="checkbox" checked={selectedIds.has(it.id)} onChange={() => toggleSelect(it.id)} disabled={it.status === "committed"} />
                    </td>
                    <td className="npw-shape-label">{STATUS_LABEL[it.status]}</td>
                    <td className="npw-shape-crates">{it.fileName}</td>
                    <td className="npw-shape-crates">{it.metadata.title ?? "—"}</td>
                    <td className="npw-shape-crates">{it.metadata.artist || "—"}</td>
                    <td className="npw-shape-time">{fmtDur(it.metadata.durationSeconds)}</td>
                    <td className="npw-shape-crates">
                      {it.playbackIssue?.status === "unplayable"
                        ? <span className="npw-warn-red">{it.playbackIssue.code}: {it.playbackIssue.message}</span>
                        : it.status === "scanning" ? "…" : "OK"}
                    </td>
                    <td className="npw-shape-crates">
                      {it.duplicateStatus === "not_duplicate" ? "—" : it.duplicateStatus.replace("_", " ")}
                    </td>
                    <td className="npw-shape-crates">
                      <select
                        className="arc-select"
                        value=""
                        onChange={(e) => { if (e.target.value) assignCrateToItems([it.id], e.target.value); }}
                      >
                        <option value="">{it.assignedCrateIds.length > 0 ? it.assignedCrateIds.map((id) => cratesById.get(id)?.name ?? "?").join(", ") : "+ Assign crate…"}</option>
                        {crates.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </td>
                    <td className="npw-shape-action">
                      {it.status !== "committed" && it.status !== "skipped" && (
                        <>
                          <button className="npw-btn npw-btn--ghost npw-btn--small" onClick={() => recheckItem(it.id)}>Recheck</button>
                          {it.playbackIssue?.status === "unplayable" && (
                            <button className="npw-btn npw-btn--ghost npw-btn--small" onClick={() => clearIssue(it.id)}>Clear Issue</button>
                          )}
                          <button className="npw-btn npw-btn--ghost npw-btn--small" onClick={() => skipItem(it.id)}>Skip</button>
                          {(it.status === "ready" || it.status === "warning") && (
                            <button className="npw-btn npw-btn--ghost npw-btn--small" onClick={() => commitOne(it.id)}>Commit</button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="npw-actions">
            <button className="npw-btn npw-btn--ghost" onClick={onCancel}>Close</button>
            <button
              className="npw-btn npw-btn--ghost"
              onClick={() => {
                const crateId = crates[0]?.id;
                if (crateId) assignCrateToItems([...selectedIds], crateId);
              }}
              disabled={selectedIds.size === 0 || crates.length === 0}
              title="Assign the first crate to all selected rows — use the per-row picker for a specific crate"
            >
              Assign Selected → {crates[0]?.name ?? "crate"}
            </button>
            <button className="npw-btn npw-btn--ghost" onClick={recheckSelected} disabled={selectedIds.size === 0}>
              Recheck Selected
            </button>
            <button className="npw-btn npw-btn--ghost" onClick={skipBlocked} disabled={blockedCount === 0}>
              Skip Blocked
            </button>
            <button className="npw-btn npw-btn--primary" onClick={commitAllSafe} disabled={readyCount + warningCount === 0}>
              Commit All Safe
            </button>
          </div>

          {allDone && <div className="npw-option-note">All items reviewed — you can close this panel.</div>}
        </div>
      </div>
    </div>
  );
}
