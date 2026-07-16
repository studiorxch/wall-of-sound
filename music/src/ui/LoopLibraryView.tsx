// Sectional Looper and Loop Library — the Loop Library page (§20, §21, §22).
// "Show in Finder" / real Ableton/CapCut import are NOT implemented in this
// browser-only build (no Electron/native shell access) — see completion
// report. Copy-path is the honest substitute this build actually provides.

import { useMemo, useRef, useState } from "react";
import type { Track } from "../data/trackTypes";
import type { LoopAsset, LoopContentClass, LoopCandidateGenerationMode, LoopPreviewState, LoopRevision } from "../data/loopTypes";
import type { LoopRenderRecord } from "../data/loopRenderTypes";
import { isRenderStale } from "../logic/loops/loopRenderStaleness";
import { resolveActiveLoopBoundsFrames } from "../logic/loops/loopRevisions";
import { inferLegacyLoopLength, migrateLegacyLoopGenerationMode } from "../logic/loops/loopCandidateMigration";
import { defaultContentClassOptions } from "./SectionalLooperWorkspace";

const GENERATION_MODE_LABEL: Record<LoopCandidateGenerationMode, string> = {
  trusted_grid: "Trusted", provisional_grid: "Provisional", time_fallback: "Time-based", manual_only: "Manual",
};

function fmtBytes(bytes?: number): string {
  if (!bytes) return "—";
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

type Props = {
  loops: LoopAsset[];
  libraryTracks: Track[];
  resolveTrackUrl: (track: Track) => string | null;
  onUpdateLoop: (id: string, patch: Partial<LoopAsset>) => void;
  onOpenSourceTrack: (trackId: string) => void;
  onReopenInLooper: (trackId: string) => void;
  onBeforeLoopPreview: () => void;
  onDeleteRenderedFile: (id: string) => void;
  loopRenders: LoopRenderRecord[];
  onRenderLoop: (loopId: string) => Promise<{ ok: boolean; error?: string }>;
  onRenderAllApproved: () => Promise<{ rendered: number; failed: number }>;
  // 0715D — needed to compare render staleness against the loop's ACTIVE
  // REVISION bounds rather than its frozen original bounds (see
  // effectiveRenderStatus's doc comment).
  loopRevisions: LoopRevision[];
};

export function LoopLibraryView({
  loops, libraryTracks, resolveTrackUrl, onUpdateLoop, onOpenSourceTrack, onReopenInLooper, onBeforeLoopPreview,
  onDeleteRenderedFile, loopRenders, onRenderLoop, onRenderAllApproved, loopRevisions,
}: Props) {
  const [renderingIds, setRenderingIds] = useState<Set<string>>(new Set());
  const [batchStatus, setBatchStatus] = useState<string | null>(null);

  async function triggerRender(loopId: string) {
    setRenderingIds((s) => new Set(s).add(loopId));
    const result = await onRenderLoop(loopId);
    setRenderingIds((s) => { const next = new Set(s); next.delete(loopId); return next; });
    if (!result.ok) window.alert(`Render failed: ${result.error ?? "unknown error"}`);
  }

  async function triggerBatchRender() {
    setBatchStatus("Rendering approved loops…");
    const result = await onRenderAllApproved();
    setBatchStatus(`Rendered ${result.rendered}, failed ${result.failed}`);
  }
  const [statusFilter, setStatusFilter] = useState<"all" | "approved" | "candidate" | "rejected" | "archived">("approved");
  const [contentClassFilter, setContentClassFilter] = useState<LoopContentClass | "all">("all");
  const [lengthFilter, setLengthFilter] = useState<"all" | 4 | 8 | 16 | 32 | 64>("all");
  const [modeFilter, setModeFilter] = useState<"all" | LoopCandidateGenerationMode>("all");
  const [search, setSearch] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const previewGenerationRef = useRef(0);
  // §14/§15 — same preview-reliability fix as the Sectional Looper
  // workspace: "Stop" may only show once play() actually resolves.
  const [previewState, setPreviewState] = useState<{ id: string; state: LoopPreviewState; error?: string } | null>(null);

  const tracksById = useMemo(() => new Map(libraryTracks.map((t) => [t.trackId, t])), [libraryTracks]);
  const renderByLoopId = useMemo(() => new Map(loopRenders.map((r) => [r.loopId, r])), [loopRenders]);

  function effectiveRenderStatus(loop: LoopAsset): LoopRenderRecord | undefined {
    const render = renderByLoopId.get(loop.id);
    if (!render) return undefined;
    if (render.status === "rendered") {
      const track = tracksById.get(loop.sourceTrackId);
      // 0715D — live-caught real defect: comparing against the loop's own
      // frozen ORIGINAL bounds meant any loop that ever had a revision
      // applied read "stale" forever, even immediately after a fresh
      // render of the CURRENT revision (since the render's own
      // sourceStartSeconds/sourceEndSeconds are stamped from the active
      // revision, not the original — see App.tsx's handleRenderLoop). Use
      // the active revision's own bounds instead when one exists; falls
      // back to the loop's stored seconds for a never-revisioned loop.
      // `render.settings.sampleRate` (not a per-track constant here) is
      // the correct rate — it's the sample rate of the SAME decoded buffer
      // the frames were computed from at render time.
      const activeBounds = resolveActiveLoopBoundsFrames(loop, loopRevisions, render.settings.sampleRate);
      const currentStartSeconds = activeBounds.startFrame / render.settings.sampleRate;
      const currentEndSeconds = activeBounds.endFrame / render.settings.sampleRate;
      const stale = isRenderStale(render, {
        currentSourceFingerprint: track?.playbackBounds?.sourceFingerprint,
        currentStartSeconds,
        currentEndSeconds,
        currentSettings: render.settings,
        // 0715C — an edited approved loop repoints activeRevisionId; once
        // it no longer matches what this render was made from, the render
        // is stale even if the loop's own seconds happen to be unchanged
        // (e.g. an Update-Existing revision that only nudged frame-level
        // precision).
        currentRevisionId: loop.activeRevisionId,
      });
      if (stale) return { ...render, status: "stale" };
    }
    return render;
  }

  const visible = useMemo(() => {
    return loops.filter((l) => {
      if (statusFilter !== "all" && l.status !== statusFilter) return false;
      if (contentClassFilter !== "all" && l.contentClass !== contentClassFilter) return false;
      if (lengthFilter !== "all" && l.barCount !== lengthFilter) return false;
      if (modeFilter !== "all" && migrateLegacyLoopGenerationMode(l) !== modeFilter) return false;
      if (search.trim()) {
        const hay = `${l.title} ${l.sourceTitle} ${l.sourceArtist ?? ""}`.toLowerCase();
        if (!hay.includes(search.trim().toLowerCase())) return false;
      }
      return true;
    });
  }, [loops, statusFilter, contentClassFilter, lengthFilter, modeFilter, search]);

  function stopPreview() {
    previewGenerationRef.current++;
    audioRef.current?.pause();
    if (audioRef.current) audioRef.current.ontimeupdate = null;
    setPreviewState(null);
  }

  // §15 — same reliability fix as the workspace: loading → play() → AWAIT →
  // only then playing; rejection reverts to idle/error and permits retry.
  async function previewLoop(loop: LoopAsset) {
    const track = tracksById.get(loop.sourceTrackId);
    if (!track) return;
    const url = resolveTrackUrl(track);
    if (!url) {
      setPreviewState({ id: loop.id, state: "error", error: "No playable source for this track." });
      return;
    }
    stopPreview();
    const generation = previewGenerationRef.current;
    setPreviewState({ id: loop.id, state: "loading" });
    onBeforeLoopPreview();
    const audio = audioRef.current ?? new Audio();
    audioRef.current = audio;
    audio.src = url;
    audio.currentTime = loop.startSeconds;
    audio.ontimeupdate = () => {
      if (audio.currentTime >= loop.endSeconds) audio.currentTime = loop.startSeconds;
    };
    try {
      await audio.play();
      if (previewGenerationRef.current !== generation) return;
      setPreviewState({ id: loop.id, state: "playing" });
    } catch (err) {
      if (previewGenerationRef.current !== generation) return;
      audio.pause();
      audio.ontimeupdate = null;
      const message = err instanceof Error ? err.message : "Preview playback was rejected by the browser.";
      setPreviewState({ id: loop.id, state: "error", error: message });
    }
  }

  function copyPath(loop: LoopAsset) {
    const track = tracksById.get(loop.sourceTrackId);
    const render = renderByLoopId.get(loop.id);
    // §27 — no real filesystem path exists in this browser-only build; the
    // rendered filename (or, failing that, the source path) is the honest
    // substitute copied here — never a fabricated absolute path.
    const path = render?.filename ?? loop.loopFilePath ?? track?.audioRelPath ?? track?.filePath ?? "";
    if (path) navigator.clipboard?.writeText(path).catch(() => {});
  }

  return (
    <div className="loop-library-root">
      <div className="loop-library-header">
        <h2>Loop Library</h2>
        <input className="loop-library-search" placeholder="Search title, source, artist…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
          <option value="all">All statuses</option>
          <option value="approved">Approved</option>
          <option value="candidate">Candidate</option>
          <option value="rejected">Rejected</option>
          <option value="archived">Archived</option>
        </select>
        <select value={contentClassFilter} onChange={(e) => setContentClassFilter(e.target.value as typeof contentClassFilter)}>
          <option value="all">All content classes</option>
          {defaultContentClassOptions().map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={lengthFilter} onChange={(e) => setLengthFilter(e.target.value === "all" ? "all" : (Number(e.target.value) as 4 | 8 | 16 | 32 | 64))}>
          <option value="all">All lengths</option>
          {[4, 8, 16, 32, 64].map((n) => <option key={n} value={n}>{n} bars</option>)}
        </select>
        <select value={modeFilter} onChange={(e) => setModeFilter(e.target.value as typeof modeFilter)}>
          <option value="all">All modes</option>
          <option value="trusted_grid">Trusted</option>
          <option value="provisional_grid">Provisional</option>
          <option value="time_fallback">Time-based</option>
          <option value="manual_only">Manual</option>
        </select>
        <button onClick={triggerBatchRender}>Render All Approved</button>
        {batchStatus && <span className="loop-library-batch-status">{batchStatus}</span>}
      </div>

      <table className="loop-library-table">
        <thead>
          <tr>
            <th>Title</th><th>Source</th><th>Section</th><th>Artist</th><th>BPM</th><th>Key</th>
            <th>Length</th><th>Duration</th><th>Mode</th><th>Class</th><th>Seamlessness</th><th>Confidence</th>
            <th>Created</th><th>Render</th><th>Size</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((loop) => {
            const render = effectiveRenderStatus(loop);
            const status = render?.status ?? "not_rendered";
            const isRendering = renderingIds.has(loop.id);
            const preview = previewState?.id === loop.id ? previewState.state : "idle";
            const previewLabel = preview === "loading" ? "Loading…" : preview === "playing" ? "Stop" : "Preview";
            return (
              <tr key={loop.id} className={`${loop.needsReview ? "loop-row-needs-review" : ""}${status === "stale" ? " loop-row-stale" : ""}${status === "missing" ? " loop-row-missing" : ""}`}>
                <td>{loop.title}</td>
                <td>{loop.sourceTitle}</td>
                <td>{loop.sectionLabel ?? "—"}</td>
                <td>{loop.sourceArtist ?? "—"}</td>
                <td>{loop.bpm ? Math.round(loop.bpm) : "—"}</td>
                <td>{loop.key ?? "—"}</td>
                <td>{loop.barCount ? `${loop.barCount} bars` : inferLegacyLoopLength(loop)?.kind === "seconds" ? `${(inferLegacyLoopLength(loop) as { seconds: number }).seconds}s` : "—"}</td>
                <td>{fmtTime(loop.durationSeconds)}</td>
                <td title={loop.provisional ? "Provisional bar grid — approximate, not beat-synced" : undefined}>
                  {GENERATION_MODE_LABEL[migrateLegacyLoopGenerationMode(loop)]}
                </td>
                <td>
                  <select value={loop.contentClass} onChange={(e) => onUpdateLoop(loop.id, { contentClass: e.target.value as LoopContentClass })}>
                    {defaultContentClassOptions().map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </td>
                <td>{loop.seamlessnessScore != null ? `${Math.round(loop.seamlessnessScore * 100)}%` : "—"}</td>
                <td>{loop.confidence != null ? `${Math.round(loop.confidence * 100)}%` : "—"}</td>
                <td>{new Date(loop.createdAt).toLocaleDateString()}</td>
                <td title={status === "stale" ? "Rendered file stale — re-render required" : undefined}>
                  {status === "rendered" ? `WAV · ${render?.settings.bitDepth}-bit` : status === "stale" ? "Stale" : status === "failed" ? "Failed" : "Not rendered"}
                </td>
                <td>{fmtBytes(render?.fileSizeBytes)}</td>
                <td className="loop-library-actions">
                  <button disabled={preview === "loading"} onClick={() => (preview === "playing" ? stopPreview() : previewLoop(loop))}>
                    {previewLabel}
                  </button>
                  <button onClick={() => onOpenSourceTrack(loop.sourceTrackId)}>Open source</button>
                  <button onClick={() => onReopenInLooper(loop.sourceTrackId)}>Reopen in Looper</button>
                  <button disabled={isRendering} onClick={() => triggerRender(loop.id)}>
                    {isRendering ? "Rendering…" : status === "rendered" || status === "stale" ? "Re-render" : "Render"}
                  </button>
                  <button onClick={() => copyPath(loop)} title="Show in Finder is unavailable in this browser-only build; copies the filename instead">Copy path</button>
                  <button onClick={() => onUpdateLoop(loop.id, { status: "archived" })} disabled={loop.status === "archived"}>Archive</button>
                  <button onClick={() => onDeleteRenderedFile(loop.id)} disabled={status !== "rendered" && status !== "stale"} title="Preserves loop metadata; only clears the rendered-file reference">Delete rendered file</button>
                </td>
              </tr>
            );
          })}
          {visible.length === 0 && (
            <tr><td colSpan={16} className="loop-library-empty">No loops match the current filters.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
