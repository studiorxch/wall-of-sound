// 0722_MUSIC_Loops_Library_And_Looper_Naming — saved loops as a content
// type inside the Sounds workspace, replacing the retired standalone Loop
// Library page. Deliberately NOT a copy of the old loop-library-* table:
// this reuses Sounds/Catalog's own visual system (cat-page-header/
// cat-filter-section/cat-grid-scroll/mtw-table cat-data-grid/tb-btn) so
// Loops reads as one more Sounds surface, not a second product. All
// underlying loop services (render/promote/revisions/persistence) are the
// same ones the old page called — nothing here is a new implementation of
// loop behavior, only a new presentation.

import { useMemo, useRef, useState } from "react";
import type { Track } from "../../data/trackTypes";
import type { LoopAsset, LoopContentClass, LoopCandidateGenerationMode, LoopPreviewState, LoopRevision } from "../../data/loopTypes";
import type { LoopRenderRecord } from "../../data/loopRenderTypes";
import type { RadioPromotionFormInput } from "../../data/radioLoopTypes";
import { isRenderStale } from "../../logic/loops/loopRenderStaleness";
import { resolveActiveLoopBoundsFrames } from "../../logic/loops/loopRevisions";
import { migrateLegacyLoopGenerationMode } from "../../logic/loops/loopCandidateMigration";
import { defaultContentClassOptions } from "../SectionalLooperWorkspace";
import { PromoteToRadioDialog } from "../radio/PromoteToRadioDialog";
import type { PromoteLoopToRadioResult, RadioPromotionPhase } from "../../logic/radio/radioPromotionOrchestrator";

const GENERATION_MODE_LABEL: Record<LoopCandidateGenerationMode, string> = {
  trusted_grid: "Trusted", provisional_grid: "Provisional", time_fallback: "Time-based", manual_only: "Manual",
};

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
  loopRevisions: LoopRevision[];
  onPromoteToRadio: (loopId: string, formInput: RadioPromotionFormInput, onProgress?: (phase: RadioPromotionPhase) => void) => Promise<PromoteLoopToRadioResult>;
  onSendLoopToRadio?: (loopId: string) => void;
};

export function SoundsLoopRows({
  loops, libraryTracks, resolveTrackUrl, onUpdateLoop, onOpenSourceTrack, onReopenInLooper, onBeforeLoopPreview,
  onDeleteRenderedFile, loopRenders, onRenderLoop, onRenderAllApproved, loopRevisions, onPromoteToRadio, onSendLoopToRadio,
}: Props) {
  const [renderingIds, setRenderingIds] = useState<Set<string>>(new Set());
  const [batchStatus, setBatchStatus] = useState<string | null>(null);
  const [promoteLoopId, setPromoteLoopId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "approved" | "candidate" | "rejected" | "archived">("approved");
  const [contentClassFilter, setContentClassFilter] = useState<LoopContentClass | "all">("all");
  const [search, setSearch] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const previewGenerationRef = useRef(0);
  const [previewState, setPreviewState] = useState<{ id: string; state: LoopPreviewState; error?: string } | null>(null);

  const tracksById = useMemo(() => new Map(libraryTracks.map((t) => [t.trackId, t])), [libraryTracks]);
  const renderByLoopId = useMemo(() => new Map(loopRenders.map((r) => [r.loopId, r])), [loopRenders]);

  function effectiveRenderStatus(loop: LoopAsset): LoopRenderRecord | undefined {
    const render = renderByLoopId.get(loop.id);
    if (!render) return undefined;
    if (render.status === "rendered") {
      const track = tracksById.get(loop.sourceTrackId);
      const activeBounds = resolveActiveLoopBoundsFrames(loop, loopRevisions, render.settings.sampleRate);
      const currentStartSeconds = activeBounds.startFrame / render.settings.sampleRate;
      const currentEndSeconds = activeBounds.endFrame / render.settings.sampleRate;
      const stale = isRenderStale(render, {
        currentSourceFingerprint: track?.playbackBounds?.sourceFingerprint,
        currentStartSeconds,
        currentEndSeconds,
        currentSettings: render.settings,
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
      if (search.trim()) {
        const hay = `${l.title} ${l.sourceTitle} ${l.sourceArtist ?? ""}`.toLowerCase();
        if (!hay.includes(search.trim().toLowerCase())) return false;
      }
      return true;
    });
  }, [loops, statusFilter, contentClassFilter, search]);

  function stopPreview() {
    previewGenerationRef.current++;
    audioRef.current?.pause();
    if (audioRef.current) audioRef.current.ontimeupdate = null;
    setPreviewState(null);
  }

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
    const path = render?.filename ?? loop.loopFilePath ?? track?.audioRelPath ?? track?.filePath ?? "";
    if (path) navigator.clipboard?.writeText(path).catch(() => {});
  }

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

  const countLabel = visible.length !== loops.length ? `${visible.length} of ${loops.length} loops` : `${loops.length} loops`;

  return (
    <div>
      <div className="cat-page-header">
        <div className="cat-page-title">Sounds</div>
        <div className="cat-page-status">{countLabel}</div>
      </div>

      <div className="cat-filter-section">
        <div className="cat-filter-section-label">FILTERS</div>
        <div className="cat-filter-row">
          <input
            className="cat-filter-search"
            placeholder="Search title, source, artist…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className="cat-filter-sel" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
            <option value="all">Status: All</option>
            <option value="approved">Approved</option>
            <option value="candidate">Candidate</option>
            <option value="rejected">Rejected</option>
            <option value="archived">Archived</option>
          </select>
          <select className="cat-filter-sel" value={contentClassFilter} onChange={(e) => setContentClassFilter(e.target.value as typeof contentClassFilter)}>
            <option value="all">Class: All</option>
            {defaultContentClassOptions().map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button className="cat-clear-btn" onClick={triggerBatchRender}>Render All Approved</button>
          {batchStatus && <span className="cat-filter-section-label">{batchStatus}</span>}
        </div>
      </div>

      <div className="cat-tracks-label">LOOPS</div>
      <div className="cat-grid-scroll">
        <table className="mtw-table cat-data-grid">
          <thead>
            <tr>
              <th className="cat-col-frozen cat-col-frozen--title">Title</th>
              <th>Source</th><th>BPM</th><th>Key</th><th>Length</th><th>Duration</th><th>Mode</th><th>Status</th>
              <th>Actions</th>
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
                  <td className="col-title cat-col-frozen cat-col-frozen--title">
                    <span className="playlist-row-title" onClick={() => onOpenSourceTrack(loop.sourceTrackId)}>{loop.title}</span>
                  </td>
                  <td>{loop.sourceTitle}</td>
                  <td>{loop.bpm ? Math.round(loop.bpm) : "—"}</td>
                  <td>{loop.key ?? "—"}</td>
                  <td>{loop.barCount ? `${loop.barCount} bars` : "—"}</td>
                  <td>{fmtTime(loop.durationSeconds)}</td>
                  <td title={loop.provisional ? "Provisional bar grid — approximate, not beat-synced" : undefined}>
                    {GENERATION_MODE_LABEL[migrateLegacyLoopGenerationMode(loop)]}
                  </td>
                  <td title={status === "stale" ? "Rendered file stale — re-render required" : undefined}>
                    {status === "rendered" ? `Rendered · ${render?.settings.bitDepth}-bit` : status === "stale" ? "Stale" : status === "failed" ? "Failed" : "Not rendered"}
                  </td>
                  <td className="col-actions">
                    <button className="tb-btn sm" disabled={preview === "loading"} onClick={() => (preview === "playing" ? stopPreview() : previewLoop(loop))}>
                      {previewLabel}
                    </button>
                    <button className="tb-btn sm" onClick={() => onReopenInLooper(loop.sourceTrackId)}>Reopen in Looper</button>
                    <button className="tb-btn sm" disabled={isRendering} onClick={() => triggerRender(loop.id)}>
                      {isRendering ? "Rendering…" : status === "rendered" || status === "stale" ? "Re-render" : "Render"}
                    </button>
                    <button
                      className="tb-btn sm"
                      disabled={loop.status !== "approved"}
                      onClick={() => setPromoteLoopId(loop.id)}
                      title={loop.status !== "approved" ? "Only approved loops can be promoted to Radio" : undefined}
                    >
                      Promote to Radio
                    </button>
                    {onSendLoopToRadio && (
                      <button className="tb-btn sm" onClick={() => onSendLoopToRadio(loop.id)} title="Send this loop to RADIO's Inbox (does not package or publish)">
                        Send → RADIO
                      </button>
                    )}
                    <button className="tb-btn sm" onClick={() => copyPath(loop)} title="Show in Finder is unavailable in this browser-only build; copies the filename instead">Copy path</button>
                    <button className="tb-btn sm" onClick={() => onUpdateLoop(loop.id, { status: "archived" })} disabled={loop.status === "archived"}>Archive</button>
                    <button className="tb-btn sm" onClick={() => onDeleteRenderedFile(loop.id)} disabled={status !== "rendered" && status !== "stale"} title="Preserves loop metadata; only clears the rendered-file reference">Delete render</button>
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr><td colSpan={9} className="loop-library-empty">No loops match the current filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {promoteLoopId && (() => {
        const loop = loops.find((l) => l.id === promoteLoopId);
        if (!loop) return null;
        return <PromoteToRadioDialog loop={loop} onPromote={onPromoteToRadio} onClose={() => setPromoteLoopId(null)} />;
      })()}
    </div>
  );
}
