import { useState, useEffect } from "react";
import type { Track, TrackSourceOwner, PlatformUse, AnalysisStatus, AnalyzerJobStatus } from "../data/trackTypes";
import { toPortableAudioPath, resolveAudioUrl, type AudioCategory } from "../logic/audioPathResolver";
import { isBeatMapTrustedForAnalysis } from "../logic/beatMap/beatMapTrust";
import { isPlaybackBoundsTrusted } from "../logic/playbackBounds/playbackBoundsTrust";

type Props = {
  track: Track;
  filteredList: Track[];
  currentIndex: number;
  onNavigate: (index: number) => void;
  onSave: (patch: Partial<Track>) => void;
  onClose: () => void;
  onOpenModal?: (track: Track) => void;
  onAnalyzeTrack?: (trackId: string) => void;
  onReanalyze?: (trackId: string) => void;
  analyzerJobStatus?: AnalyzerJobStatus;
  onRestoreSuggestionsFromImport?: (trackId: string) => void;
  onRestoreSuggestionsFromMechanical?: (trackId: string) => void;
  onClearSuggestedMoods?: (trackId: string) => void;
  onCreateLoops?: (trackId: string) => void;
  onExportStems?: (trackId: string) => void;
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

const ANALYSIS_STATUS_OPTIONS: { value: AnalysisStatus; label: string }[] = [
  { value: "not_analyzed", label: "Not analyzed" },
  { value: "partial",      label: "Partial (import data)" },
  { value: "analyzed",     label: "Analyzed" },
  { value: "stale",        label: "Stale — needs reanalysis" },
  { value: "failed",       label: "Analysis failed" },
];

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
      // Clear legacy absolute path so playback doesn't fall back to it
      filePath: undefined,
    };
  }

  // Could not parse — keep the raw value in filePath as fallback (legacy)
  return { filePath: trimmed };
}

function useTrackForm(track: Track) {
  const [title, setTitle]                   = useState(track.title ?? "");
  const [artist, setArtist]                 = useState(track.artist ?? "");
  const [albumTitle, setAlbumTitle]         = useState(track.albumTitle ?? "");
  const [albumArtist, setAlbumArtist]       = useState(track.albumArtist ?? "");
  const [genre, setGenre]                   = useState(track.genre ?? "");
  const [grouping, setGrouping]             = useState(track.grouping ?? "");
  const [year, setYear]                     = useState(String(track.year ?? ""));
  const [composer, setComposer]             = useState(track.composer ?? "");
  const [comment, setComment]               = useState(track.comment ?? "");
  const [notes, setNotes]                   = useState(track.notes ?? "");
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
    setGrouping(track.grouping ?? "");
    setYear(String(track.year ?? ""));
    setComposer(track.composer ?? "");
    setComment(track.comment ?? "");
    setNotes(track.notes ?? "");
    setBpm(String(track.bpm ?? ""));
    setMusicalKey(track.musicalKey ?? "");
    setCamelotKey(track.camelotKey ?? "");
    setEnergy(String(track.energy ?? ""));
    setDurationSecs(String(track.durationSeconds ?? ""));
    setAnalysisStatus(track.analysisStatus ?? "not_analyzed");
    setAudioRelPathInput(
      (track as unknown as { audioRelPath?: string }).audioRelPath ?? track.filePath ?? ""
    );
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
      bpm: parseFloat(bpm) || track.bpm,
      // 0712_MUSIC_BPM_Key_Detection_Engine §17 — manual correction outranks
      // detected/imported values and must survive reanalysis.
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
    setPlatformUse((prev) =>
      prev.includes(val) ? prev.filter((v) => v !== val) : [...prev, val]
    );
  }

  const isDirty =
    title !== (track.title ?? "") ||
    artist !== (track.artist ?? "") ||
    grouping !== (track.grouping ?? "") ||
    genre !== (track.genre ?? "") ||
    coverImagePath !== (track.coverImagePath ?? "") ||
    moodTagsRaw !== (track.moodTags ?? []).join(", ");

  return {
    title, setTitle, artist, setArtist, albumTitle, setAlbumTitle,
    albumArtist, setAlbumArtist, genre, setGenre, grouping, setGrouping,
    year, setYear, composer, setComposer, comment, setComment, notes, setNotes,
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

export function TrackInspector({
  track,
  filteredList,
  currentIndex,
  onNavigate,
  onSave,
  onClose,
  onOpenModal,
  onAnalyzeTrack,
  onReanalyze,
  analyzerJobStatus,
  onRestoreSuggestionsFromImport,
  onRestoreSuggestionsFromMechanical,
  onClearSuggestedMoods,
  onCreateLoops,
  onExportStems,
}: Props) {
  const form = useTrackForm(track);
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => { setImgFailed(false); }, [form.coverImagePath]);

  const hasCover = !!form.coverImagePath && !imgFailed;
  const coverSrc = form.coverImagePath;

  function handleSave() {
    onSave(form.buildPatch());
  }

  function handleNavigate(dir: -1 | 1) {
    const next = currentIndex + dir;
    if (next < 0 || next >= filteredList.length) return;
    onNavigate(next);
  }

  return (
    <div className="ti-panel">
      {/* Header nav */}
      <div className="ti-header">
        <div className="ti-nav">
          <button
            className="ti-nav-btn"
            onClick={() => handleNavigate(-1)}
            disabled={currentIndex <= 0}
            title="Previous track"
          >←</button>
          <span className="ti-nav-pos">{currentIndex + 1} / {filteredList.length}</span>
          <button
            className="ti-nav-btn"
            onClick={() => handleNavigate(1)}
            disabled={currentIndex >= filteredList.length - 1}
            title="Next track"
          >→</button>
        </div>
        <div className="ti-header-actions">
          {onOpenModal && (
            <button className="ti-modal-btn" onClick={() => onOpenModal(track)} title="Open full editor modal">⤢</button>
          )}
          <button className="ti-close" onClick={onClose} title="Close inspector">✕</button>
        </div>
      </div>

      {/* Cover preview */}
      <div className={`ti-cover${hasCover ? "" : " ti-cover--empty"}`}>
        {hasCover ? (
          <img
            className="ti-cover-img"
            src={coverSrc}
            alt="Cover"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="ti-cover-placeholder">
            <span className="ti-cover-icon">🎵</span>
            <span className="ti-cover-missing">No cover</span>
          </div>
        )}
      </div>

      {/* Track identity summary */}
      <div className="ti-identity">
        <div className="ti-track-title" title={track.title}>{track.title ?? "—"}</div>
        <div className="ti-track-artist">{track.artist ?? ""}</div>
        <div className="ti-track-meta">
          {form.isDirty && <span className="ti-dirty">● unsaved</span>}
        </div>
      </div>

      {/* Scrollable form body */}
      <div className="ti-body">

        {/* Identity */}
        <div className="te-section-label">Identity</div>
        <div className="te-row">
          <label className="te-label">Title</label>
          <input className="te-input" value={form.title} onChange={(e) => form.setTitle(e.target.value)} />
        </div>
        <div className="te-row">
          <label className="te-label">Artist</label>
          <input className="te-input" value={form.artist} onChange={(e) => form.setArtist(e.target.value)} />
        </div>
        <div className="te-row">
          <label className="te-label">Album</label>
          <input className="te-input" value={form.albumTitle} onChange={(e) => form.setAlbumTitle(e.target.value)} />
        </div>
        <div className="te-row-group">
          <div className="te-row te-row-half">
            <label className="te-label">Genre</label>
            <input className="te-input" value={form.genre} onChange={(e) => form.setGenre(e.target.value)} />
          </div>
          <div className="te-row te-row-half">
            <label className="te-label">Year</label>
            <input className="te-input" type="number" value={form.year} onChange={(e) => form.setYear(e.target.value)} />
          </div>
        </div>
        <div className="te-row">
          <label className="te-label">Grouping</label>
          <input className="te-input" value={form.grouping} onChange={(e) => form.setGrouping(e.target.value)} />
        </div>
        <div className="te-row">
          <label className="te-label">Composer</label>
          <input className="te-input" value={form.composer} onChange={(e) => form.setComposer(e.target.value)} />
        </div>
        <div className="te-row">
          <label className="te-label">Comment</label>
          <input className="te-input" value={form.comment} onChange={(e) => form.setComment(e.target.value)} />
        </div>

        {/* Cover */}
        <div className="te-section-label">Cover / File</div>
        <div className="te-row">
          <label className="te-label">Cover Path</label>
          <input
            className="te-input"
            value={form.coverImagePath}
            onChange={(e) => form.setCoverImagePath(e.target.value)}
            placeholder="/path/to/cover.jpg or URL"
          />
        </div>
        {track.artworkStatus && (
          <div className="te-row">
            <label className="te-label">Artwork</label>
            <span className={`ti-artwork-status ti-artwork-${track.artworkStatus}`}>{track.artworkStatus}</span>
          </div>
        )}
        {form.coverImagePath && (
          <div className="ti-cover-actions">
            <button
              className="tb-btn sm"
              onClick={() => form.setCoverImagePath("")}
              title="Clear cover path"
            >Clear Cover</button>
          </div>
        )}
        <div className="te-row">
          <label className="te-label">Audio File</label>
          <input
            className="te-input"
            value={form.audioRelPathInput}
            onChange={(e) => form.setAudioRelPathInput(e.target.value)}
            placeholder="catalog/audio/filename.flac or filename.flac"
            title="Relative path from library/music/ root, e.g. catalog/audio/track.flac"
          />
          {resolveAudioUrl(
            (() => {
              const t = track as unknown as { audioRelPath?: string };
              return t.audioRelPath;
            })()
          ) && (
            <span className="te-value-dim" style={{ fontSize: "0.7em", opacity: 0.6 }}>
              {resolveAudioUrl((track as unknown as { audioRelPath?: string }).audioRelPath)}
            </span>
          )}
        </div>
        {track.sunoId && (
          <div className="te-row">
            <label className="te-label">Suno ID</label>
            <span className="te-value-dim">{track.sunoId}</span>
          </div>
        )}

        {/* Audio */}
        <div className="te-section-label">Audio</div>
        <div className="te-row-group">
          <div className="te-row te-row-half">
            <label className="te-label">BPM</label>
            <input className="te-input" type="number" value={form.bpm} onChange={(e) => form.setBpm(e.target.value)} />
          </div>
          <div className="te-row te-row-half">
            <label className="te-label">Energy</label>
            <input className="te-input" type="number" step="0.01" min="0" max="1" value={form.energy} onChange={(e) => form.setEnergy(e.target.value)} />
          </div>
        </div>
        <div className="te-row-group">
          <div className="te-row te-row-half">
            <label className="te-label">Key</label>
            <input className="te-input" value={form.musicalKey} onChange={(e) => form.setMusicalKey(e.target.value)} placeholder="Eb major" />
          </div>
          <div className="te-row te-row-half">
            <label className="te-label">Camelot</label>
            <input className="te-input" value={form.camelotKey} onChange={(e) => form.setCamelotKey(e.target.value)} placeholder="5B" />
          </div>
        </div>
        <div className="te-row-group">
          <div className="te-row te-row-half">
            <label className="te-label">Duration (s)</label>
            <input className="te-input" type="number" value={form.durationSeconds} onChange={(e) => form.setDurationSecs(e.target.value)} />
          </div>
          <div className="te-row te-row-half">
            <label className="te-label">Analysis</label>
            <select className="te-select" value={form.analysisStatus} onChange={(e) => form.setAnalysisStatus(e.target.value as AnalysisStatus)}>
              {ANALYSIS_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        {/* Beat Map (0713_MUSIC_Track_Beat_Map_Foundation §21) — compact
            read-only diagnostic, not a grid editor. */}
        <div className="te-section-label">Beat Map</div>
        <div className="te-row-group">
          <div className="te-row te-row-half">
            <label className="te-label">Status</label>
            <span className="te-value-dim">
              {!track.beatMap ? "Missing" : isBeatMapTrustedForAnalysis(track.beatMap) ? "Trusted" : "Partial"}
            </span>
          </div>
          <div className="te-row te-row-half">
            <label className="te-label">Tempo</label>
            <span className="te-value-dim">
              {track.beatMap ? (track.beatMap.tempoStable ? "Stable" : "Drifting") : "—"}
            </span>
          </div>
        </div>
        <div className="te-row-group">
          <div className="te-row te-row-half">
            <label className="te-label">Intro</label>
            <span className="te-value-dim">
              {track.beatMap?.introRegion ? `${track.beatMap.introRegion.cleanBars} clean bars` : "—"}
            </span>
          </div>
          <div className="te-row te-row-half">
            <label className="te-label">Outro</label>
            <span className="te-value-dim">
              {track.beatMap?.outroRegion ? `${track.beatMap.outroRegion.cleanBars} clean bars` : "—"}
            </span>
          </div>
        </div>

        {/* Playback Bounds (0714_MUSIC_Track_Playback_Bounds §27) — compact
            read-only diagnostic. No waveform editing. */}
        <div className="te-section-label">Playback Bounds</div>
        <div className="te-row-group">
          <div className="te-row te-row-half">
            <label className="te-label">Status</label>
            <span className="te-value-dim">
              {!track.playbackBounds ? "Missing" : isPlaybackBoundsTrusted(track.playbackBounds) ? "Trusted" : "Partial"}
            </span>
          </div>
          <div className="te-row te-row-half">
            <label className="te-label">Effective</label>
            <span className="te-value-dim">
              {track.playbackBounds ? `${track.playbackBounds.effectiveDurationSeconds.toFixed(1)}s` : "—"}
            </span>
          </div>
        </div>
        <div className="te-row-group">
          <div className="te-row te-row-half">
            <label className="te-label">Start</label>
            <span className="te-value-dim">
              {track.playbackBounds ? `${track.playbackBounds.preferredStartSeconds.toFixed(2)}s (${track.playbackBounds.startClassification})` : "—"}
            </span>
          </div>
          <div className="te-row te-row-half">
            <label className="te-label">End</label>
            <span className="te-value-dim">
              {track.playbackBounds ? `${track.playbackBounds.preferredEndSeconds.toFixed(2)}s (${track.playbackBounds.endClassification})` : "—"}
            </span>
          </div>
        </div>

        {/* Mood */}
        <div className="te-section-label">Mood</div>
        <div className="te-row">
          <label className="te-label">Mood Tags</label>
          <input className="te-input" value={form.moodTagsRaw} onChange={(e) => form.setMoodTagsRaw(e.target.value)} placeholder="Comma-separated" />
        </div>
        {track.primaryMood && (
          <div className="te-row">
            <label className="te-label">Primary</label>
            <span className="te-value-dim">{track.primaryMood}</span>
          </div>
        )}
        {(track.moodSuggestions?.length ?? 0) > 0 && (
          <div className="te-row te-row-actions">
            <label className="te-label te-label-dim">Suggested</label>
            <span className="te-value-dim">{(track.moodSuggestions ?? []).join(", ")}</span>
          </div>
        )}
        <div className="te-row te-row-actions">
          <label className="te-label te-label-dim">Actions</label>
          <div className="te-action-row">
            {onRestoreSuggestionsFromImport && (track.importedMoodTags?.length ?? 0) > 0 && (
              <button className="te-action-btn" onClick={() => onRestoreSuggestionsFromImport(track.trackId)}>From Import</button>
            )}
            {onRestoreSuggestionsFromMechanical && (track.mechanicalMoodTags?.length ?? 0) > 0 && (
              <button className="te-action-btn" onClick={() => onRestoreSuggestionsFromMechanical(track.trackId)}>From Mechanical</button>
            )}
            {onClearSuggestedMoods && (
              <button className="te-action-btn te-action-btn-danger" onClick={() => onClearSuggestedMoods(track.trackId)}>Clear Suggestions</button>
            )}
          </div>
        </div>

        {/* Source */}
        <div className="te-section-label">Source</div>
        <div className="te-row">
          <label className="te-label">Owner</label>
          <select className="te-select" value={form.sourceOwner} onChange={(e) => form.setSourceOwner(e.target.value as TrackSourceOwner)}>
            {OWNER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="te-row">
          <label className="te-label">Library</label>
          <input className="te-input" value={form.sourceLibrary} onChange={(e) => form.setSourceLibrary(e.target.value)} placeholder="e.g. StudioRich Catalog" />
        </div>
        <div className="te-row">
          <label className="te-label">Catalog ID</label>
          <input className="te-input" value={form.catalogId} onChange={(e) => form.setCatalogId(e.target.value)} />
        </div>
        <div className="te-section-label" style={{ marginTop: 6 }}>Platform Use</div>
        <div className="te-platform-use">
          {PLATFORM_USE_OPTIONS.map((o) => (
            <label key={o.value} className="te-check-label">
              <input type="checkbox" checked={form.platformUse.includes(o.value)} onChange={() => form.togglePlatformUse(o.value)} />
              {" "}{o.label}
            </label>
          ))}
        </div>

        {/* Notes */}
        <div className="te-section-label">Notes</div>
        <textarea
          className="te-input te-textarea"
          value={form.notes}
          onChange={(e) => form.setNotes(e.target.value)}
          placeholder="Internal notes…"
          rows={3}
        />
      </div>

      {/* Footer */}
      <div className="ti-footer">
        <div className="ti-footer-left">
          {analyzerJobStatus === "running" && (
            <span className="te-analysis-note te-analysis-partial" style={{ padding: "4px 8px" }}>Analyzing…</span>
          )}
          {analyzerJobStatus === "complete" && (
            <span className="te-analysis-note te-analysis-ok" style={{ padding: "4px 8px" }}>Done ✓</span>
          )}
          {onAnalyzeTrack && (
            <button className="tb-btn" disabled={analyzerJobStatus === "running"} onClick={() => onAnalyzeTrack(track.trackId)}>
              Analyze
            </button>
          )}
          {track.mechanicalAnalysisStatus && onReanalyze && (
            <button className="tb-btn" disabled={analyzerJobStatus === "running"} onClick={() => onReanalyze(track.trackId)}>
              Reanalyze
            </button>
          )}
          {onCreateLoops && (
            <button className="tb-btn" onClick={() => onCreateLoops(track.trackId)} title="Open in AUDIOLAB / Looper">
              Create Loops
            </button>
          )}
          {/* 0722C_MUSIC_Production_Stem_Export — the old top-level-track
              "Import Existing Stems" button (0715G) is retired here: MUSIC
              cannot keep two live definitions of "stem." Existing legacy
              derived-stem tracks are handled by the Legacy Stem Migration
              panel (Library Actions), not this button. Not shown on a
              legacy derived-stem track (it has no stems of its own) or once
              this track has already been through migration. */}
          {onExportStems && track.derivedKind !== "stem" && (
            <button className="tb-btn" onClick={() => onExportStems(track.trackId)} title="Run local Demucs separation and archive vocals/drums/bass/other as a versioned child of this exact track">
              Export Stems
            </button>
          )}
        </div>
        <div className="ti-footer-right">
          <button className="tb-btn ph-btn-primary" onClick={handleSave}>Save</button>
          <button className="tb-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
