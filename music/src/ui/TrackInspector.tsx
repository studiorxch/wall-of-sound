// 0827_MUSIC_Library_Workspace_Track_Inspector_Rearchitecture Parts G-O —
// replaces the previous docked-panel dense form with a spacious modal:
// Properties / Song / Advanced tabs above a persistent, substantial
// SectionalLooperWorkspace (embedded mode, reused unchanged — see
// RadioMultiTrackPrepWorkspace.tsx for the exact same reuse pattern this
// component copies). Mounted at App.tsx level (not inside
// MainTrackWindow) because the Looper's real prop authority
// (loops/loopAudition/songAnalyses/etc.) only exists there — see
// App.tsx's inspectorState/radioLooperShared wiring.
//
// useTrackForm below is unchanged in spirit from the prior implementation:
// one accumulated form-state object, one explicit Save action, no
// autosave-per-field — matching spec §24's "if the current implementation
// uses explicit Save/Cancel, keep them" instruction.

import { useState, useEffect } from "react";
import type { Track, TrackSourceOwner, PlatformUse, AnalysisStatus, AnalyzerJobStatus, TrackRating } from "../data/trackTypes";
import { toPortableAudioPath, type AudioCategory } from "../logic/audioPathResolver";
import { isBeatMapTrustedForAnalysis } from "../logic/beatMap/beatMapTrust";
import { isPlaybackBoundsTrusted } from "../logic/playbackBounds/playbackBoundsTrust";
import type { TrackPlaybackIssue } from "../data/playProjectTypes";
import { getAnalysisDisplayLabel } from "../logic/analysisStatusDisplay";
import { computeTrackOverallFileHealth } from "../logic/trackFileHealth";
import { FILE_HEALTH_LABELS } from "../data/fileHealthTypes";
import { getTrackAssets } from "../logic/trackAssetReconciliation";
import type { TrackAsset } from "../data/trackAssetTypes";
import { SectionalLooperWorkspace } from "./SectionalLooperWorkspace";
import type { RadioLooperSharedProps } from "./radio/RadioMultiTrackPrepWorkspace";

type Props = {
  track: Track;
  filteredList: Track[];
  currentIndex: number;
  onNavigate: (index: number) => void;
  onSave: (patch: Partial<Track>) => void;
  onClose: () => void;
  onRateTrack?: (trackId: string, rating: TrackRating) => void;
  onAnalyzeTrack?: (trackId: string) => void;
  onReanalyze?: (trackId: string) => void;
  analyzerJobStatus?: AnalyzerJobStatus;
  onRestoreSuggestionsFromImport?: (trackId: string) => void;
  onRestoreSuggestionsFromMechanical?: (trackId: string) => void;
  onClearSuggestedMoods?: (trackId: string) => void;
  onOpenInGlyph?: (trackId: string) => void;
  onExportStems?: (trackId: string) => void;
  trackPlaybackIssue?: TrackPlaybackIssue;
  onRecheckFileHealth?: (trackId: string) => void;
  recheckingFileHealth?: boolean;
  // 0827 Physical Asset Authority — clicking a specific format badge plays
  // THAT asset's own physical file, never the track's default/legacy
  // playback path. Does not change which asset is primary.
  onAuditionAsset?: (track: Track, asset: TrackAsset) => void;
  // 0827 Catalog Technical Format Verification — explicit, per-asset,
  // user-triggered only. Writes only asset.verifiedTechnical; never
  // asset.format, never file identity. Display-only consumer — does not
  // touch trackHasFormat, dashboard counts, or filters.
  onVerifyAsset?: (track: Track, asset: TrackAsset) => void | Promise<void>;
  // The full Looper authority, unchanged — see module doc above.
  looperShared: RadioLooperSharedProps;
};

const OWNER_OPTIONS: { value: TrackSourceOwner; label: string }[] = [
  { value: "studiorich", label: "StudioRich" },
  { value: "external",   label: "External" },
  { value: "reference",  label: "Sounds" },
  { value: "unknown",    label: "Unknown" },
];

const PLATFORM_USE_OPTIONS: { value: PlatformUse; label: string }[] = [
  { value: "internal",          label: "Internal" },
  { value: "studiorich_stream", label: "StudioRich Stream" },
  { value: "mixcloud",          label: "Mixcloud" },
  { value: "reference_only",    label: "Reference Only" },
  { value: "do_not_publish",    label: "Do Not Publish" },
];

// `grouping` is typed as `string` on Track, but some runtime records store it
// as `string[]` (see the same tolerance in libraryFilters.ts's buildFilterOptions).
function groupingToDisplayString(grouping: unknown): string {
  if (Array.isArray(grouping)) return grouping.join(", ");
  return (grouping as string | undefined) ?? "";
}

function ownerToCategory(owner: TrackSourceOwner): AudioCategory {
  if (owner === "reference") return "reference";
  if (owner === "external") return "external";
  return "catalog";
}

function buildAudioPatch(rawInput: string, track: Track): Partial<Track> {
  const trimmed = rawInput.trim();
  if (!trimmed) return { filePath: undefined };
  const category = ownerToCategory(track.sourceOwner ?? "studiorich");
  const portable = toPortableAudioPath({ value: trimmed, category });
  if (portable) {
    return {
      audioRelPath: portable.audioRelPath,
      audioFileName: portable.audioFileName,
      audioCategory: portable.audioCategory,
      audioStatus: "linked" as const,
      filePath: undefined,
    };
  }
  return { filePath: trimmed };
}

function useTrackForm(track: Track) {
  const [title, setTitle]                   = useState(track.title ?? "");
  const [artist, setArtist]                 = useState(track.artist ?? "");
  const [albumTitle, setAlbumTitle]         = useState(track.albumTitle ?? "");
  const [albumArtist, setAlbumArtist]       = useState(track.albumArtist ?? "");
  const [genre, setGenre]                   = useState(track.genre ?? "");
  const [grouping, setGrouping]             = useState(groupingToDisplayString(track.grouping));
  const [year, setYear]                     = useState(String(track.year ?? ""));
  const [composer, setComposer]             = useState(track.composer ?? "");
  const [comment, setComment]               = useState(track.comment ?? "");
  const [notes, setNotes]                   = useState(track.notes ?? "");
  const [labelsRaw, setLabelsRaw]           = useState((track.labels ?? []).join(", "));
  const [bpm, setBpm]                       = useState(String(track.bpm ?? ""));
  const [musicalKey, setMusicalKey]         = useState(track.musicalKey ?? "");
  const [camelotKey, setCamelotKey]         = useState<string>(track.camelotKey ?? "");
  const [energy, setEnergy]                 = useState(String(track.energy ?? ""));
  const [durationSeconds, setDurationSecs]  = useState(String(track.durationSeconds ?? ""));
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus>(track.analysisStatus ?? "not_analyzed");
  const [audioRelPathInput, setAudioRelPathInput] = useState(
    (track as unknown as { audioRelPath?: string }).audioRelPath ?? track.filePath ?? ""
  );
  const [coverImagePath, setCoverImagePath] = useState(track.coverImagePath ?? "");
  const [moodTagsRaw, setMoodTagsRaw]       = useState((track.moodTags ?? []).join(", "));
  const [mechMoodsRaw, setMechMoodsRaw]     = useState((track.mechanicalMoodTags ?? []).join(", "));
  const [sourceOwner, setSourceOwner]       = useState<TrackSourceOwner>(track.sourceOwner ?? "unknown");
  const [sourceLibrary, setSourceLibrary]   = useState(track.sourceLibrary ?? "");
  const [catalogId, setCatalogId]           = useState(track.catalogId ?? "");
  const [platformUse, setPlatformUse]       = useState<PlatformUse[]>(track.platformUse ?? []);

  useEffect(() => {
    setTitle(track.title ?? "");
    setArtist(track.artist ?? "");
    setAlbumTitle(track.albumTitle ?? "");
    setAlbumArtist(track.albumArtist ?? "");
    setGenre(track.genre ?? "");
    setGrouping(groupingToDisplayString(track.grouping));
    setYear(String(track.year ?? ""));
    setComposer(track.composer ?? "");
    setComment(track.comment ?? "");
    setNotes(track.notes ?? "");
    setLabelsRaw((track.labels ?? []).join(", "));
    setBpm(String(track.bpm ?? ""));
    setMusicalKey(track.musicalKey ?? "");
    setCamelotKey(track.camelotKey ?? "");
    setEnergy(String(track.energy ?? ""));
    setDurationSecs(String(track.durationSeconds ?? ""));
    setAnalysisStatus(track.analysisStatus ?? "not_analyzed");
    setAudioRelPathInput((track as unknown as { audioRelPath?: string }).audioRelPath ?? track.filePath ?? "");
    setCoverImagePath(track.coverImagePath ?? "");
    setMoodTagsRaw((track.moodTags ?? []).join(", "));
    setMechMoodsRaw((track.mechanicalMoodTags ?? []).join(", "));
    setSourceOwner(track.sourceOwner ?? "unknown");
    setSourceLibrary(track.sourceLibrary ?? "");
    setCatalogId(track.catalogId ?? "");
    setPlatformUse(track.platformUse ?? []);
  }, [track.trackId]);

  function buildPatch(): Partial<Track> {
    return {
      title: title.trim() || track.title,
      artist: artist.trim() || track.artist,
      albumTitle: albumTitle.trim() || undefined,
      albumArtist: albumArtist.trim() || undefined,
      genre: genre.trim() || undefined,
      grouping: grouping.trim() || undefined,
      year: parseInt(year) || undefined,
      composer: composer.trim() || undefined,
      comment: comment.trim() || undefined,
      notes: notes.trim() || undefined,
      labels: labelsRaw.trim() ? labelsRaw.split(",").map((l) => l.trim()).filter(Boolean) : undefined,
      bpm: parseFloat(bpm) || track.bpm,
      bpmSource: bpm.trim() ? "manual" : track.bpmSource,
      musicalKey: musicalKey.trim() || undefined,
      camelotKey: (camelotKey.trim() || track.camelotKey) as Track["camelotKey"],
      keySource: camelotKey.trim() ? "manual" : track.keySource,
      energy: parseFloat(energy) || track.energy,
      durationSeconds: parseFloat(durationSeconds) || track.durationSeconds,
      analysisStatus,
      ...buildAudioPatch(audioRelPathInput, track),
      coverImagePath: coverImagePath.trim() || undefined,
      moodTags: moodTagsRaw.trim() ? moodTagsRaw.split(",").map((t) => t.trim()).filter(Boolean) : undefined,
      mechanicalMoodTags: mechMoodsRaw.trim()
        ? (mechMoodsRaw.split(",").map((t) => t.trim()).filter(Boolean) as Track["mechanicalMoodTags"])
        : undefined,
      sourceOwner,
      sourceLibrary: sourceLibrary.trim() || undefined,
      catalogId: catalogId.trim() || undefined,
      platformUse: platformUse.length > 0 ? platformUse : undefined,
    };
  }

  function togglePlatformUse(val: PlatformUse) {
    setPlatformUse((prev) => (prev.includes(val) ? prev.filter((v) => v !== val) : [...prev, val]));
  }

  // Comprehensive dirty check — every field the Properties/Advanced tabs
  // let a person change, not just the subset the old docked panel tracked.
  const isDirty =
    title !== (track.title ?? "") ||
    artist !== (track.artist ?? "") ||
    albumTitle !== (track.albumTitle ?? "") ||
    albumArtist !== (track.albumArtist ?? "") ||
    genre !== (track.genre ?? "") ||
    grouping !== groupingToDisplayString(track.grouping) ||
    year !== String(track.year ?? "") ||
    composer !== (track.composer ?? "") ||
    comment !== (track.comment ?? "") ||
    notes !== (track.notes ?? "") ||
    labelsRaw !== (track.labels ?? []).join(", ") ||
    coverImagePath !== (track.coverImagePath ?? "") ||
    moodTagsRaw !== (track.moodTags ?? []).join(", ") ||
    audioRelPathInput !== ((track as unknown as { audioRelPath?: string }).audioRelPath ?? track.filePath ?? "") ||
    sourceOwner !== (track.sourceOwner ?? "unknown") ||
    sourceLibrary !== (track.sourceLibrary ?? "") ||
    catalogId !== (track.catalogId ?? "") ||
    platformUse.join(",") !== (track.platformUse ?? []).join(",");

  return {
    title, setTitle, artist, setArtist, albumTitle, setAlbumTitle,
    albumArtist, setAlbumArtist, genre, setGenre, grouping, setGrouping,
    year, setYear, composer, setComposer, comment, setComment, notes, setNotes,
    labelsRaw, setLabelsRaw,
    bpm, setBpm, musicalKey, setMusicalKey, camelotKey, setCamelotKey,
    energy, setEnergy, durationSeconds, setDurationSecs,
    analysisStatus, setAnalysisStatus,
    audioRelPathInput, setAudioRelPathInput, coverImagePath, setCoverImagePath,
    moodTagsRaw, setMoodTagsRaw, mechMoodsRaw, setMechMoodsRaw,
    sourceOwner, setSourceOwner, sourceLibrary, setSourceLibrary,
    catalogId, setCatalogId, platformUse, togglePlatformUse,
    buildPatch, isDirty,
  };
}

// ── Quiet-until-edit field primitives ───────────────────────────────────

function TextField({ label, value, onChange, placeholder, mono }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const empty = !value;
  if (editing) {
    return (
      <div className="ti2-field ti2-field--editing">
        <div className="ti2-field-label">{label}</div>
        <input
          className="ti2-field-input"
          autoFocus
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") { e.stopPropagation(); setEditing(false); } }}
        />
      </div>
    );
  }
  return (
    <div className="ti2-field">
      <div className="ti2-field-label">{label}</div>
      <div className="ti2-field-row">
        <div className={`ti2-field-value${empty ? " ti2-field-value--empty" : ""}${mono ? " ti2-mono" : ""}`}>
          {empty ? "Not set" : value}
        </div>
        <button className="ti2-edit-btn" onClick={() => setEditing(true)} aria-label={`Edit ${label}`} title="Edit">✎</button>
      </div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────

export function TrackInspector({
  track, filteredList, currentIndex, onNavigate, onSave, onClose,
  onRateTrack, onAnalyzeTrack, onReanalyze, analyzerJobStatus,
  onRestoreSuggestionsFromImport, onRestoreSuggestionsFromMechanical, onClearSuggestedMoods,
  onOpenInGlyph, onExportStems, trackPlaybackIssue, onRecheckFileHealth, recheckingFileHealth,
  onAuditionAsset, onVerifyAsset, looperShared,
}: Props) {
  const form = useTrackForm(track);
  const [tab, setTab] = useState<"properties" | "song" | "advanced">("properties");
  const [imgFailed, setImgFailed] = useState(false);
  const [editingCover, setEditingCover] = useState(false);
  const [advCollapsed, setAdvCollapsed] = useState<Record<string, boolean>>({});
  const [verifyingAssetId, setVerifyingAssetId] = useState<string | null>(null);

  useEffect(() => { setImgFailed(false); setEditingCover(false); setTab("properties"); }, [track.trackId]);

  async function handleVerifyAsset(asset: TrackAsset) {
    if (!onVerifyAsset || verifyingAssetId) return;
    setVerifyingAssetId(asset.assetId);
    try {
      await onVerifyAsset(track, asset);
    } finally {
      setVerifyingAssetId(null);
    }
  }

  const hasCover = !!form.coverImagePath && !imgFailed;

  function handleSave() {
    onSave(form.buildPatch());
  }

  function requestClose() {
    if (form.isDirty && !window.confirm("You have unsaved changes. Close without saving?")) return;
    onClose();
  }

  function handleNavigate(dir: -1 | 1) {
    if (form.isDirty && !window.confirm("You have unsaved changes. Discard and switch tracks?")) return;
    const next = currentIndex + dir;
    if (next < 0 || next >= filteredList.length) return;
    // 0827_MUSIC_Track_Inspector_Live_Validation — the embedded Looper's
    // loop-preview audition (loopAudition, App-root-lifted) is NOT reset
    // just because sourceTrackId changes: SectionalLooperWorkspace stays
    // mounted across a track switch here (same instance, new prop) rather
    // than unmounting, unlike RADIO's expand/collapse usage. Without this,
    // a loop preview started for the track being left keeps playing under
    // the newly-displayed track — the highest-risk stale-state case this
    // integration was flagged for. Only stop a session that actually
    // belongs to the track being navigated away FROM; an unrelated
    // session (e.g. started elsewhere before this Inspector opened) is
    // left alone. Reuses the existing controller's own stop() — no new
    // playback/loop authority.
    if (looperShared.loopAudition.session?.sourceTrackId === track.trackId) {
      looperShared.loopAudition.stop();
    }
    onNavigate(next);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") requestClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.isDirty]);

  const assets = getTrackAssets(track);
  const fileHealth = computeTrackOverallFileHealth(track, trackPlaybackIssue ? { [track.trackId]: trackPlaybackIssue } : undefined);

  function toggleAdv(section: string) {
    setAdvCollapsed((s) => ({ ...s, [section]: !s[section] }));
  }

  return (
    <div className="ti2-mask" onMouseDown={(e) => { if (e.target === e.currentTarget) requestClose(); }}>
      <div className="ti2-modal">
        <div className="ti2-header">
          <div
            className="ti2-cover"
            onClick={() => setEditingCover(true)}
            role="button"
            tabIndex={0}
            aria-label="Edit cover"
            title="Click to replace cover"
          >
            {hasCover ? (
              <img className="ti2-cover-img" src={form.coverImagePath} alt="" onError={() => setImgFailed(true)} />
            ) : (
              <span className="ti2-cover-empty">No<br />Cover</span>
            )}
          </div>
          <div className="ti2-title-block">
            {editingCover ? (
              <input
                className="ti2-field-input"
                autoFocus
                value={form.coverImagePath}
                placeholder="/path/to/cover.jpg or URL"
                onChange={(e) => form.setCoverImagePath(e.target.value)}
                onBlur={() => setEditingCover(false)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") { e.stopPropagation(); setEditingCover(false); } }}
              />
            ) : (
              <>
                <div className="ti2-title">{track.title || "Untitled"}</div>
                <div className="ti2-artist">{track.artist || ""}</div>
              </>
            )}
          </div>
          <div className="ti2-nav">
            <button className="ti2-nav-btn" onClick={() => handleNavigate(-1)} disabled={currentIndex <= 0} title="Previous track">←</button>
            <span className="ti2-nav-pos">{currentIndex + 1} / {filteredList.length}</span>
            <button className="ti2-nav-btn" onClick={() => handleNavigate(1)} disabled={currentIndex >= filteredList.length - 1} title="Next track">→</button>
          </div>
          <button className="ti2-close" onClick={requestClose} aria-label="Close" title="Close (Esc)">✕</button>
        </div>

        <div className="ti2-tabs">
          <button className={`ti2-tab${tab === "properties" ? " active" : ""}`} onClick={() => setTab("properties")}>Properties</button>
          <button className={`ti2-tab${tab === "song" ? " active" : ""}`} onClick={() => setTab("song")}>Song</button>
          <button className={`ti2-tab${tab === "advanced" ? " active" : ""}`} onClick={() => setTab("advanced")}>Advanced</button>
        </div>

        <div className="ti2-body">
          {tab === "properties" && (
            <>
              <div className="ti2-grid">
                <TextField label="Title" value={form.title} onChange={form.setTitle} />
                <TextField label="Artist" value={form.artist} onChange={form.setArtist} />
                <TextField label="Album" value={form.albumTitle} onChange={form.setAlbumTitle} />
                <TextField label="Album Artist" value={form.albumArtist} onChange={form.setAlbumArtist} />
                <TextField label="Year" value={form.year} onChange={form.setYear} />
                <TextField label="Composer" value={form.composer} onChange={form.setComposer} />
                <TextField label="Group" value={form.grouping} onChange={form.setGrouping} />
                <TextField label="Genre" value={form.genre} onChange={form.setGenre} />
              </div>

              <div className="ti2-field" style={{ marginTop: 4 }}>
                <div className="ti2-field-label">Rating</div>
                <div className="ti2-rating">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <span
                      key={n}
                      className={`ti2-star${(track.rating ?? 0) >= n ? " on" : ""}`}
                      onClick={() => onRateTrack?.(track.trackId, n as TrackRating)}
                    >★</span>
                  ))}
                </div>
              </div>

              <div className="ti2-field-label" style={{ marginTop: 22 }}>Labels</div>
              <TextField label="" value={form.labelsRaw} onChange={form.setLabelsRaw} placeholder="Episode 2, Needs Ableton, Strong bassline…" />

              <div className="ti2-field-label" style={{ marginTop: 18 }}>Notes</div>
              <textarea
                className="ti2-textarea"
                value={form.notes}
                onChange={(e) => form.setNotes(e.target.value)}
                placeholder="Internal notes…"
                rows={4}
              />
            </>
          )}

          {tab === "song" && (
            <>
              {/* No generation/source-provenance fields exist on Track for
                  Catalog/External/Sounds today (confirmed: Provider, Source
                  ID, Prompt, Style, Model, Workspace, etc. are all Suno-
                  specific concepts absent from this data model). Per §27:
                  do not fabricate fields — show a clean neutral state. */}
              <div className="ti2-empty-state">
                No generation / source-specific data for this recording.
              </div>
            </>
          )}

          {tab === "advanced" && (
            <>
              <div className={`ti2-adv-section${advCollapsed.audio ? " collapsed" : ""}`}>
                <div className="ti2-adv-header" onClick={() => toggleAdv("audio")}>
                  <span className="ti2-chev">▾</span> Audio
                </div>
                <div className="ti2-adv-grid">
                  <div className="ti2-adv-item"><div className="k">Duration</div><div className="v">{track.durationSeconds ? `${Math.floor(track.durationSeconds / 60)}:${String(Math.floor(track.durationSeconds % 60)).padStart(2, "0")}` : "—"}</div></div>
                  <div className="ti2-adv-item"><div className="k">Formats</div><div className="v">{assets.length ? assets.map((a) => a.format.toUpperCase()).join(", ") : "—"}</div></div>
                  <div className="ti2-adv-item"><div className="k">File Size</div><div className="v">{assets[0]?.fileSizeBytes ? `${(assets[0].fileSizeBytes / 1_000_000).toFixed(1)} MB` : "—"}</div></div>
                </div>
              </div>

              <div className={`ti2-adv-section${advCollapsed.analysis ? " collapsed" : ""}`}>
                <div className="ti2-adv-header" onClick={() => toggleAdv("analysis")}>
                  <span className="ti2-chev">▾</span> Analysis
                </div>
                <div className="ti2-adv-grid">
                  <div className="ti2-adv-item"><div className="k">BPM</div><div className="v">{track.bpm ?? "—"}</div></div>
                  <div className="ti2-adv-item"><div className="k">Key</div><div className="v">{track.camelotKey ?? "—"}</div></div>
                  <div className="ti2-adv-item"><div className="k">Energy</div><div className="v">{track.energy != null ? track.energy.toFixed(2) : "—"}</div></div>
                  <div className="ti2-adv-item"><div className="k">Mood</div><div className="v">{(track.moodTags ?? []).join(", ") || "—"}</div></div>
                  <div className="ti2-adv-item"><div className="k">Suggested Mood</div><div className="v">{(track.moodSuggestions ?? []).join(", ") || "—"}</div></div>
                  <div className="ti2-adv-item"><div className="k">Mechanical Mood</div><div className="v">{(track.mechanicalMoodTags ?? []).join(", ") || "—"}</div></div>
                  <div className="ti2-adv-item"><div className="k">Analysis Status</div><div className="v">{getAnalysisDisplayLabel(track)}</div></div>
                  <div className="ti2-adv-item"><div className="k">File Health</div><div className="v">{FILE_HEALTH_LABELS[fileHealth.overall]}</div></div>
                  <div className="ti2-adv-item"><div className="k">Beat Map</div><div className="v">{!track.beatMap ? "Missing" : isBeatMapTrustedForAnalysis(track.beatMap) ? "Trusted" : "Partial"}</div></div>
                  <div className="ti2-adv-item"><div className="k">Playback Bounds</div><div className="v">{!track.playbackBounds ? "Missing" : isPlaybackBoundsTrusted(track.playbackBounds) ? "Trusted" : "Partial"}</div></div>
                </div>
                {onRecheckFileHealth && (
                  <button className="ti2-small-btn" style={{ marginTop: 10 }} disabled={!!recheckingFileHealth} onClick={() => onRecheckFileHealth(track.trackId)}>
                    {recheckingFileHealth ? "Rechecking…" : "Recheck File Health"}
                  </button>
                )}
              </div>

              <div className={`ti2-adv-section${advCollapsed.identity ? " collapsed" : ""}`}>
                <div className="ti2-adv-header" onClick={() => toggleAdv("identity")}>
                  <span className="ti2-chev">▾</span> Identity / Assets
                </div>
                <div className="ti2-adv-grid">
                  <div className="ti2-adv-item"><div className="k">Canonical ID</div><div className="v">{track.trackId}</div></div>
                  <div className="ti2-adv-item"><div className="k">Preferred Asset</div><div className="v">{assets.find((a) => a.isPrimary)?.fileName ?? assets[0]?.fileName ?? "—"}</div></div>
                  <div className="ti2-adv-item">
                    <div className="k">Available Formats</div>
                    <div className="v">
                      {assets.length ? (
                        <span className="ti2-format-badges">
                          {assets.map((a) => (
                            <button
                              key={a.assetId}
                              type="button"
                              className="ti2-format-badge"
                              disabled={!onAuditionAsset}
                              title={onAuditionAsset ? `Play ${a.fileName}` : a.fileName}
                              onClick={() => onAuditionAsset?.(track, a)}
                            >
                              {a.format.toUpperCase()}
                            </button>
                          ))}
                        </span>
                      ) : "—"}
                    </div>
                  </div>
                  <div className="ti2-adv-item"><div className="k">Checksum</div><div className="v">{assets.find((a) => a.checksum)?.checksum ?? "not computed"}</div></div>
                  <div className="ti2-adv-item"><div className="k">Source Owner</div><div className="v">{OWNER_OPTIONS.find((o) => o.value === form.sourceOwner)?.label ?? form.sourceOwner}</div></div>
                  <div className="ti2-adv-item"><div className="k">Catalog ID</div><div className="v">{track.catalogId ?? "—"}</div></div>
                </div>
                {onVerifyAsset && assets.length > 0 && (
                  <div className="ti2-asset-verify-list">
                    {assets.map((a) => {
                      const vt = a.verifiedTechnical;
                      const mismatch = !!vt && vt.verifiedFormat !== "unknown" && vt.verifiedFormat !== a.format;
                      return (
                        <div key={a.assetId} className={`ti2-asset-verify-row${mismatch ? " ti2-asset-verify-row--mismatch" : ""}`}>
                          <span className="ti2-asset-verify-filename" title={a.fileName}>{a.fileName}</span>
                          {vt ? (
                            <span className="ti2-asset-verify-result">
                              Imported: {a.format.toUpperCase()} · Verified: {vt.verifiedFormat === "unknown" ? "Unknown" : vt.verifiedFormat.toUpperCase()}
                              {" "}· {vt.audioCodec ?? "—"}/{vt.containerFormat ?? "—"}
                              {mismatch && <span className="ti2-asset-verify-mismatch-badge">MISMATCH</span>}
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="ti2-small-btn"
                              disabled={verifyingAssetId === a.assetId}
                              onClick={() => handleVerifyAsset(a)}
                            >
                              {verifyingAssetId === a.assetId ? "Verifying…" : "Verify Format"}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Machine Life intentionally omitted: no Track-linked Machine
                  Life authority (training eligibility/rights/dataset
                  membership/lineage) exists in the current data model for
                  Catalog/External/Sounds. Per instruction, this section
                  appears only once real stored data backs it — never a
                  placeholder. */}

              <div className="ti2-field-label" style={{ marginTop: 22 }}>Mood Suggestions</div>
              <div className="ti2-action-row">
                {onRestoreSuggestionsFromImport && (track.importedMoodTags?.length ?? 0) > 0 && (
                  <button className="ti2-small-btn" onClick={() => onRestoreSuggestionsFromImport(track.trackId)}>From Import</button>
                )}
                {onRestoreSuggestionsFromMechanical && (track.mechanicalMoodTags?.length ?? 0) > 0 && (
                  <button className="ti2-small-btn" onClick={() => onRestoreSuggestionsFromMechanical(track.trackId)}>From Mechanical</button>
                )}
                {onClearSuggestedMoods && (
                  <button className="ti2-small-btn ti2-danger" onClick={() => onClearSuggestedMoods(track.trackId)}>Clear Suggestions</button>
                )}
              </div>

              <div className="ti2-field-label" style={{ marginTop: 18 }}>Platform Use</div>
              <div className="ti2-checks">
                {PLATFORM_USE_OPTIONS.map((o) => (
                  <label key={o.value} className="ti2-check-label">
                    <input type="checkbox" checked={form.platformUse.includes(o.value)} onChange={() => form.togglePlatformUse(o.value)} />
                    {" "}{o.label}
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="ti2-looper">
          <SectionalLooperWorkspace
            {...looperShared}
            sourceTrackId={track.trackId}
            onSelectSourceTrack={() => {}}
            embedded
          />
        </div>

        <div className={`ti2-footer${form.isDirty ? " show" : ""}`}>
          <div className="ti2-footer-left">
            {analyzerJobStatus === "running" && <span className="ti2-analyzing">Analyzing…</span>}
            {analyzerJobStatus === "complete" && <span className="ti2-analyzed">Done ✓</span>}
            {onAnalyzeTrack && (
              <button className="ti2-small-btn" disabled={analyzerJobStatus === "running"} onClick={() => onAnalyzeTrack(track.trackId)}>Analyze</button>
            )}
            {track.mechanicalAnalysisStatus && onReanalyze && (
              <button className="ti2-small-btn" disabled={analyzerJobStatus === "running"} onClick={() => onReanalyze(track.trackId)}>Reanalyze</button>
            )}
            {onOpenInGlyph && (
              <button className="ti2-small-btn" onClick={() => onOpenInGlyph(track.trackId)} title="Open in AUDIOLAB / Glyph">Open in Glyph</button>
            )}
            {onExportStems && track.derivedKind !== "stem" && (
              <button className="ti2-small-btn" onClick={() => onExportStems(track.trackId)} title="Run local Demucs separation and archive vocals/drums/bass/other as a versioned child of this exact track">Export Stems</button>
            )}
          </div>
          <div className="ti2-footer-right">
            <span className="ti2-unsaved-msg">Unsaved changes</span>
            {/* Explicit Cancel is itself the deliberate discard decision —
                no redundant confirm on top of it. The confirm guard in
                requestClose protects the ACCIDENTAL dismissal paths only
                (×/Esc/click-outside). */}
            <button className="ti2-btn ghost" onClick={onClose}>Cancel</button>
            <button className="ti2-btn primary" onClick={handleSave}>Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}
