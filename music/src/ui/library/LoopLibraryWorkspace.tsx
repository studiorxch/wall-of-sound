// 0828_MUSIC_Looper_Loop_Library_Tagging — promoted from
// 0722_MUSIC_Loops_Library_And_Looper_Naming's SoundsLoopRows.tsx (a rename
// + extension, not a rewrite — every render/promote/revision/persistence
// call this file makes is the exact same one SoundsLoopRows already made).
//
// This deliberately SUPERSEDES 0722's own decision to fold saved loops into
// Sounds as a Tracks/Loops content toggle, replacing the standalone Loop
// Library page that existed before that. That decision predates two things
// this build adds: multi-source Recording provenance (a loop can now come
// from Catalog/External/Sounds/Song Library, not just whichever library
// happened to host the toggle) and Production/Machine Life/Subway purpose
// membership — neither has a natural home under "Sounds" specifically, and
// 0722's own toggle already had a live mismatch before this change: its
// `loops` prop was always the full, unfiltered array, so a Catalog-sourced
// loop already rendered inside a page whose sidebar said "Sounds." This
// surface aggregates every loop, filterable by source library/purpose/tags,
// under its own dedicated nav entry. Sounds' own Tracks/Loops toggle is now
// a filtered deep-link into this same surface (source=sounds), not a
// second, competing implementation.

import { useMemo, useRef, useState } from "react";
import type { Track } from "../../data/trackTypes";
import type { LoopAsset, LoopContentClass, LoopCandidateGenerationMode, LoopPreviewState, LoopRevision, LoopSourceLibrary, LoopPurpose } from "../../data/loopTypes";
import type { LoopRenderRecord } from "../../data/loopRenderTypes";
import type { RadioPromotionFormInput } from "../../data/radioLoopTypes";
import { isRenderStale } from "../../logic/loops/loopRenderStaleness";
import { resolveActiveLoopBoundsFrames } from "../../logic/loops/loopRevisions";
import { migrateLegacyLoopGenerationMode } from "../../logic/loops/loopCandidateMigration";
import { defaultContentClassOptions } from "../SectionalLooperWorkspace";
import { PromoteToRadioDialog } from "../radio/PromoteToRadioDialog";
import type { PromoteLoopToRadioResult, RadioPromotionPhase } from "../../logic/radio/radioPromotionOrchestrator";
import { LoopMachineLifeAnnotationDialog } from "./LoopMachineLifeAnnotationDialog";

const GENERATION_MODE_LABEL: Record<LoopCandidateGenerationMode, string> = {
  trusted_grid: "Trusted", provisional_grid: "Provisional", time_fallback: "Time-based", manual_only: "Manual",
};

const SOURCE_LIBRARY_LABEL: Record<LoopSourceLibrary, string> = {
  catalog: "Catalog", external: "External", sounds: "Sounds", song_library: "Song Library",
};

const PURPOSE_LABEL: Record<LoopPurpose, string> = {
  production: "Production", machine_life: "Machine Life", subway: "Subway",
};
const ALL_PURPOSES: LoopPurpose[] = ["production", "machine_life", "subway"];

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
  // 0828 — for a song_library-sourced loop (no real Track to open).
  onOpenSourceSunoRecording: (canonicalRecordingId: string) => void;
  onReopenInLooper: (trackId: string) => void;
  onBeforeLoopPreview: () => void;
  onDeleteRenderedFile: (id: string) => void;
  loopRenders: LoopRenderRecord[];
  onRenderLoop: (loopId: string) => Promise<{ ok: boolean; error?: string }>;
  onRenderAllApproved: () => Promise<{ rendered: number; failed: number }>;
  loopRevisions: LoopRevision[];
  onPromoteToRadio: (loopId: string, formInput: RadioPromotionFormInput, onProgress?: (phase: RadioPromotionPhase) => void) => Promise<PromoteLoopToRadioResult>;
  onSendLoopToRadio?: (loopId: string) => void;
  // 0828 — pre-set by a deep-link (e.g. Sounds' "Loops" toggle lands here
  // with sourceLibrary="sounds" already applied). "all" shows everything.
  initialSourceLibraryFilter?: LoopSourceLibrary | "all";
};

export function LoopLibraryWorkspace({
  loops, libraryTracks, resolveTrackUrl, onUpdateLoop, onOpenSourceTrack, onOpenSourceSunoRecording, onReopenInLooper, onBeforeLoopPreview,
  onDeleteRenderedFile, loopRenders, onRenderLoop, onRenderAllApproved, loopRevisions, onPromoteToRadio, onSendLoopToRadio,
  initialSourceLibraryFilter,
}: Props) {
  const [renderingIds, setRenderingIds] = useState<Set<string>>(new Set());
  const [batchStatus, setBatchStatus] = useState<string | null>(null);
  const [promoteLoopId, setPromoteLoopId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "approved" | "candidate" | "rejected" | "archived">("approved");
  const [contentClassFilter, setContentClassFilter] = useState<LoopContentClass | "all">("all");
  const [sourceLibraryFilter, setSourceLibraryFilter] = useState<LoopSourceLibrary | "all">(initialSourceLibraryFilter ?? "all");
  const [purposeFilter, setPurposeFilter] = useState<LoopPurpose | "all">("all");
  const [search, setSearch] = useState("");
  // 0828 §Phase D/E — at most one row's tag-input/notes-editor open at a
  // time, matching the existing promoteLoopId single-active-dialog pattern.
  const [activeTagEditId, setActiveTagEditId] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  const [activeNotesEditId, setActiveNotesEditId] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [annotationLoopId, setAnnotationLoopId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const previewGenerationRef = useRef(0);
  const [previewState, setPreviewState] = useState<{ id: string; state: LoopPreviewState; error?: string } | null>(null);

  const tracksById = useMemo(() => new Map(libraryTracks.map((t) => [t.trackId, t])), [libraryTracks]);
  const renderByLoopId = useMemo(() => new Map(loopRenders.map((r) => [r.loopId, r])), [loopRenders]);

  function effectiveRenderStatus(loop: LoopAsset): LoopRenderRecord | undefined {
    const render = renderByLoopId.get(loop.id);
    if (!render) return undefined;
    if (render.status === "rendered") {
      const track = tracksById.get(loop.sourceTrackId ?? "");
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
      if (sourceLibraryFilter !== "all" && l.sourceRecording?.sourceLibrary !== sourceLibraryFilter) return false;
      if (purposeFilter !== "all" && !(l.purposeMemberships ?? []).includes(purposeFilter)) return false;
      if (search.trim()) {
        const hay = `${l.title} ${l.sourceTitle} ${l.sourceArtist ?? ""} ${(l.tags ?? []).join(" ")}`.toLowerCase();
        if (!hay.includes(search.trim().toLowerCase())) return false;
      }
      return true;
    });
  }, [loops, statusFilter, contentClassFilter, sourceLibraryFilter, purposeFilter, search]);

  function stopPreview() {
    previewGenerationRef.current++;
    audioRef.current?.pause();
    if (audioRef.current) audioRef.current.ontimeupdate = null;
    setPreviewState(null);
  }

  async function previewLoop(loop: LoopAsset) {
    const track = tracksById.get(loop.sourceTrackId ?? "");
    if (!track) {
      setPreviewState({ id: loop.id, state: "error", error: "No playable source for this track." });
      return;
    }
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
    const track = tracksById.get(loop.sourceTrackId ?? "");
    const render = renderByLoopId.get(loop.id);
    const path = render?.filename ?? loop.loopFilePath ?? track?.audioRelPath ?? track?.filePath ?? "";
    if (path) navigator.clipboard?.writeText(path).catch(() => {});
  }

  // 0828 §Phase D — plain array include/exclude, non-duplicating by
  // construction; goes through the same onUpdateLoop(id, patch) authority
  // every other field on this row already uses. Purpose is additive/
  // non-exclusive — a loop may hold any combination of the three.
  function togglePurpose(loop: LoopAsset, purpose: LoopPurpose) {
    const current = loop.purposeMemberships ?? [];
    const next = current.includes(purpose) ? current.filter((p) => p !== purpose) : [...current, purpose];
    onUpdateLoop(loop.id, { purposeMemberships: next });
  }

  // 0828 §Phase E — free-form, no fixed ontology (per spec). Case-sensitive
  // dedup keeps this simple; a loop's own tag list is small.
  function addTag(loop: LoopAsset) {
    const value = tagDraft.trim();
    if (!value) { setActiveTagEditId(null); return; }
    const current = loop.tags ?? [];
    if (!current.includes(value)) onUpdateLoop(loop.id, { tags: [...current, value] });
    setTagDraft("");
  }

  function removeTag(loop: LoopAsset, tag: string) {
    onUpdateLoop(loop.id, { tags: (loop.tags ?? []).filter((t) => t !== tag) });
  }

  function saveNotes(loop: LoopAsset) {
    onUpdateLoop(loop.id, { notes: notesDraft.trim() || undefined });
    setActiveNotesEditId(null);
  }

  function openSource(loop: LoopAsset) {
    if (loop.sourceRecording?.sourceLibrary === "song_library") {
      onOpenSourceSunoRecording(loop.sourceRecording.recordingId);
    } else {
      onOpenSourceTrack(loop.sourceRecording?.recordingId ?? loop.sourceTrackId ?? "");
    }
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
        <div className="cat-page-title">Loop Library</div>
        <div className="cat-page-status">{countLabel}</div>
      </div>

      <div className="cat-filter-section">
        <div className="cat-filter-section-label">FILTERS</div>
        <div className="cat-filter-row">
          <input
            className="cat-filter-search"
            placeholder="Search title, source, artist, tags…"
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
          <select className="cat-filter-sel" value={sourceLibraryFilter} onChange={(e) => setSourceLibraryFilter(e.target.value as typeof sourceLibraryFilter)}>
            <option value="all">Source: All</option>
            {(["catalog", "external", "sounds", "song_library"] as LoopSourceLibrary[]).map((s) => (
              <option key={s} value={s}>{SOURCE_LIBRARY_LABEL[s]}</option>
            ))}
          </select>
          <select className="cat-filter-sel" value={purposeFilter} onChange={(e) => setPurposeFilter(e.target.value as typeof purposeFilter)}>
            <option value="all">Purpose: All</option>
            {(["production", "machine_life", "subway"] as LoopPurpose[]).map((p) => (
              <option key={p} value={p}>{PURPOSE_LABEL[p]}</option>
            ))}
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
              <th>Source</th><th>Source Library</th><th>BPM</th><th>Key</th><th>Length</th><th>Duration</th><th>Mode</th><th>Status</th>
              <th>Purpose</th><th>Tags</th><th>Notes</th>
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
              const sourceLibrary = loop.sourceRecording?.sourceLibrary;
              return (
                <tr key={loop.id} className={`${loop.needsReview ? "loop-row-needs-review" : ""}${status === "stale" ? " loop-row-stale" : ""}${status === "missing" ? " loop-row-missing" : ""}`}>
                  <td className="col-title cat-col-frozen cat-col-frozen--title">
                    <span className="playlist-row-title" onClick={() => openSource(loop)}>{loop.title}</span>
                  </td>
                  <td>{loop.sourceTitle}</td>
                  <td title={loop.needsReview && !sourceLibrary ? "Source library could not be confidently resolved — flagged for review" : undefined}>
                    {sourceLibrary ? SOURCE_LIBRARY_LABEL[sourceLibrary] : "—"}
                  </td>
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
                  <td className="col-loop-purpose">
                    {ALL_PURPOSES.map((p) => (
                      <button
                        key={p}
                        type="button"
                        className={`loop-purpose-chip${(loop.purposeMemberships ?? []).includes(p) ? " loop-purpose-chip--active" : ""}`}
                        onClick={() => togglePurpose(loop, p)}
                        title={`Toggle ${PURPOSE_LABEL[p]} membership`}
                      >
                        {PURPOSE_LABEL[p]}
                      </button>
                    ))}
                  </td>
                  <td className="col-loop-tags">
                    {(loop.tags ?? []).map((t) => (
                      <span key={t} className="loop-tag-chip">
                        {t}
                        <button type="button" className="loop-tag-remove" onClick={() => removeTag(loop, t)} title={`Remove tag "${t}"`}>×</button>
                      </span>
                    ))}
                    {activeTagEditId === loop.id ? (
                      <input
                        autoFocus
                        className="loop-tag-input"
                        value={tagDraft}
                        placeholder="Add tag…"
                        onChange={(e) => setTagDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") addTag(loop);
                          if (e.key === "Escape") { setActiveTagEditId(null); setTagDraft(""); }
                        }}
                        onBlur={() => addTag(loop)}
                      />
                    ) : (
                      <button type="button" className="loop-tag-add" onClick={() => { setActiveTagEditId(loop.id); setTagDraft(""); }}>+ tag</button>
                    )}
                  </td>
                  <td className="col-loop-notes">
                    {activeNotesEditId === loop.id ? (
                      <textarea
                        autoFocus
                        className="loop-notes-textarea"
                        value={notesDraft}
                        onChange={(e) => setNotesDraft(e.target.value)}
                        onBlur={() => saveNotes(loop)}
                        onKeyDown={(e) => { if (e.key === "Escape") setActiveNotesEditId(null); }}
                      />
                    ) : (
                      <button
                        type="button"
                        className="loop-notes-cell"
                        onClick={() => { setActiveNotesEditId(loop.id); setNotesDraft(loop.notes ?? ""); }}
                        title={loop.notes ?? "Add notes"}
                      >
                        {loop.notes ? <span className="loop-notes-indicator">● Notes</span> : <span className="loop-notes-empty">+ notes</span>}
                      </button>
                    )}
                  </td>
                  <td className="col-actions">
                    <button className="tb-btn sm" disabled={preview === "loading"} onClick={() => (preview === "playing" ? stopPreview() : previewLoop(loop))}>
                      {previewLabel}
                    </button>
                    <button className="tb-btn sm" onClick={() => onReopenInLooper(loop.sourceTrackId ?? "")} disabled={!loop.sourceTrackId} title={!loop.sourceTrackId ? "Reopen in Looper isn't available for this source yet — open the source Recording instead" : undefined}>
                      Reopen in Looper
                    </button>
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
                    <button className="tb-btn sm" onClick={() => setAnnotationLoopId(loop.id)} title="Machine Life training annotation — additive, separate from general tags">
                      {loop.machineLifeAnnotation ? "Edit Annotation" : "Annotate"}
                    </button>
                    <button className="tb-btn sm" onClick={() => copyPath(loop)} title="Show in Finder is unavailable in this browser-only build; copies the filename instead">Copy path</button>
                    <button className="tb-btn sm" onClick={() => onUpdateLoop(loop.id, { status: "archived" })} disabled={loop.status === "archived"}>Archive</button>
                    <button className="tb-btn sm" onClick={() => onDeleteRenderedFile(loop.id)} disabled={status !== "rendered" && status !== "stale"} title="Preserves loop metadata; only clears the rendered-file reference">Delete render</button>
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr><td colSpan={12} className="loop-library-empty">No loops match the current filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {promoteLoopId && (() => {
        const loop = loops.find((l) => l.id === promoteLoopId);
        if (!loop) return null;
        return <PromoteToRadioDialog loop={loop} onPromote={onPromoteToRadio} onClose={() => setPromoteLoopId(null)} />;
      })()}
      {annotationLoopId && (() => {
        const loop = loops.find((l) => l.id === annotationLoopId);
        if (!loop) return null;
        return (
          <LoopMachineLifeAnnotationDialog
            loop={loop}
            onSave={(annotation) => { onUpdateLoop(loop.id, { machineLifeAnnotation: annotation }); setAnnotationLoopId(null); }}
            onClose={() => setAnnotationLoopId(null)}
          />
        );
      })()}
    </div>
  );
}
