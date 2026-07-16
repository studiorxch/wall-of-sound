import { useState, useEffect } from "react";
import type { Track, TrackSourceOwner, PlatformUse, AnalysisStatus, AnalyzerJobStatus } from "../data/trackTypes";

type Props = {
  track: Track;
  onSave: (patch: Partial<Track>) => void;
  onClose: () => void;
  onAnalyzeTrack?: (trackId: string) => void;
  onReanalyze?: (trackId: string) => void;
  analyzerJobStatus?: AnalyzerJobStatus;
  onRestoreSuggestionsFromImport?: (trackId: string) => void;
  onRestoreSuggestionsFromMechanical?: (trackId: string) => void;
  onClearSuggestedMoods?: (trackId: string) => void;
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

function AnalysisStatusBadge({ status }: { status: AnalysisStatus | undefined }) {
  if (!status || status === "not_analyzed") {
    return <span className="te-analysis-note te-analysis-pending">Not analyzed</span>;
  }
  if (status === "partial") {
    return <span className="te-analysis-note te-analysis-partial">Partial import data</span>;
  }
  if (status === "analyzed") {
    return <span className="te-analysis-note te-analysis-ok">Analyzed</span>;
  }
  if (status === "stale") {
    return <span className="te-analysis-note te-analysis-warn">Stale</span>;
  }
  return <span className="te-analysis-note te-analysis-error">Failed</span>;
}

export function TrackEditorPanel({ track, onSave, onClose, onAnalyzeTrack, onReanalyze, analyzerJobStatus, onRestoreSuggestionsFromImport, onRestoreSuggestionsFromMechanical, onClearSuggestedMoods }: Props) {
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

  const [filePath, setFilePath]             = useState(track.filePath ?? "");
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
    setFilePath(track.filePath ?? "");
    setCoverImagePath(track.coverImagePath ?? "");
    setMoodTagsRaw((track.moodTags ?? []).join(", "));
    setMechMoodsRaw((track.mechanicalMoodTags ?? []).join(", "));
    setSourceOwner(track.sourceOwner ?? "unknown");
    setSourceLibrary(track.sourceLibrary ?? "");
    setCatalogId(track.catalogId ?? "");
    setPlatformUse(track.platformUse ?? []);
  }, [track.trackId]);

  function togglePlatformUse(val: PlatformUse) {
    setPlatformUse((prev) =>
      prev.includes(val) ? prev.filter((v) => v !== val) : [...prev, val]
    );
  }

  function handleSave() {
    const patch: Partial<Track> = {
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
      filePath: filePath.trim() || undefined,
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
    onSave(patch);
  }

  const analysisNote = track.analysisSources?.length
    ? `Sources: ${track.analysisSources.join(", ")}`
    : undefined;

  return (
    <div className="track-editor-overlay" onClick={onClose}>
      <div className="track-editor-panel" onClick={(e) => e.stopPropagation()}>
        <div className="track-editor-header">
          <span className="track-editor-title">Edit Track</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <AnalysisStatusBadge status={track.analysisStatus} />
            <button className="export-modal-close" onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="track-editor-body">

          {/* Identity */}
          <div className="te-section-label">Identity</div>
          <div className="te-row">
            <label className="te-label">Title</label>
            <input className="te-input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="te-row">
            <label className="te-label">Artist</label>
            <input className="te-input" value={artist} onChange={(e) => setArtist(e.target.value)} />
          </div>
          <div className="te-row">
            <label className="te-label">Album</label>
            <input className="te-input" value={albumTitle} onChange={(e) => setAlbumTitle(e.target.value)} />
          </div>
          <div className="te-row">
            <label className="te-label">Album Artist</label>
            <input className="te-input" value={albumArtist} onChange={(e) => setAlbumArtist(e.target.value)} />
          </div>
          <div className="te-row-group">
            <div className="te-row te-row-half">
              <label className="te-label">Genre</label>
              <input className="te-input" value={genre} onChange={(e) => setGenre(e.target.value)} />
            </div>
            <div className="te-row te-row-half">
              <label className="te-label">Year</label>
              <input className="te-input" type="number" value={year} onChange={(e) => setYear(e.target.value)} />
            </div>
          </div>
          <div className="te-row">
            <label className="te-label">Grouping</label>
            <input className="te-input" value={grouping} onChange={(e) => setGrouping(e.target.value)} />
          </div>
          <div className="te-row">
            <label className="te-label">Composer</label>
            <input className="te-input" value={composer} onChange={(e) => setComposer(e.target.value)} />
          </div>
          <div className="te-row">
            <label className="te-label">Comment</label>
            <input className="te-input" value={comment} onChange={(e) => setComment(e.target.value)} />
          </div>

          {/* Audio — analyzer-derived */}
          <div className="te-section-label">
            Audio
            <span className="te-section-note"> — analyzer-derived; edit to correct</span>
          </div>
          <div className="te-analyzer-notice">
            BPM, Key, and Energy are set by automated analysis or import data. Manual edits are corrections only.
            {analysisNote && <span style={{ display: "block", opacity: 0.6, marginTop: 2 }}>{analysisNote}</span>}
          </div>
          <div className="te-row-group">
            <div className="te-row te-row-half">
              <label className="te-label">BPM</label>
              <input className="te-input" type="number" value={bpm} onChange={(e) => setBpm(e.target.value)} />
            </div>
            <div className="te-row te-row-half">
              <label className="te-label">Musical Key</label>
              <input className="te-input" value={musicalKey} onChange={(e) => setMusicalKey(e.target.value)} placeholder="e.g. Eb major" />
            </div>
          </div>
          <div className="te-row-group">
            <div className="te-row te-row-half">
              <label className="te-label">Camelot Key</label>
              <input className="te-input" value={camelotKey} onChange={(e) => setCamelotKey(e.target.value)} placeholder="e.g. 5B" />
            </div>
            <div className="te-row te-row-half">
              <label className="te-label">Energy (0–1)</label>
              <input className="te-input" type="number" step="0.01" min="0" max="1" value={energy} onChange={(e) => setEnergy(e.target.value)} />
            </div>
          </div>
          <div className="te-row-group">
            <div className="te-row te-row-half">
              <label className="te-label">Duration (s)</label>
              <input className="te-input" type="number" value={durationSeconds} onChange={(e) => setDurationSecs(e.target.value)} />
            </div>
            <div className="te-row te-row-half">
              <label className="te-label">Analysis status</label>
              <select className="te-select" value={analysisStatus} onChange={(e) => setAnalysisStatus(e.target.value as AnalysisStatus)}>
                {ANALYSIS_STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* File */}
          <div className="te-section-label">File</div>
          <div className="te-row">
            <label className="te-label">File Path</label>
            <input className="te-input" value={filePath} onChange={(e) => setFilePath(e.target.value)} placeholder="/path/to/file.flac" />
          </div>
          <div className="te-row">
            <label className="te-label">Cover Path</label>
            <input className="te-input" value={coverImagePath} onChange={(e) => setCoverImagePath(e.target.value)} placeholder="/path/to/cover.jpg or URL" />
          </div>
          {track.artworkStatus && (
            <div className="te-row">
              <label className="te-label">Artwork</label>
              <span className="te-value-dim">{track.artworkStatus}</span>
            </div>
          )}
          {track.sunoId && (
            <div className="te-row">
              <label className="te-label">Suno ID</label>
              <span className="te-value-dim">{track.sunoId}</span>
            </div>
          )}

          {/* Mood — analyzer-derived */}
          <div className="te-section-label">
            Mood
            <span className="te-section-note"> — analyzer-derived; edit to correct</span>
          </div>
          <div className="te-row">
            <label className="te-label">Mood Tags</label>
            <input className="te-input" value={moodTagsRaw} onChange={(e) => setMoodTagsRaw(e.target.value)} placeholder="Comma-separated" />
          </div>
          {track.importedMoodTags && track.importedMoodTags.length > 0 && (
            <div className="te-row">
              <label className="te-label te-label-dim">From Import</label>
              <span className="te-value-dim">{track.importedMoodTags.join(", ")}</span>
            </div>
          )}
          {(track.moodSuggestions?.length ?? 0) > 0 && (
            <div className="te-row te-row-actions">
              <label className="te-label te-label-dim">Suggested</label>
              <span className="te-value-dim">{(track.moodSuggestions ?? []).join(", ")}</span>
            </div>
          )}
          <div className="te-row te-row-actions">
            <label className="te-label te-label-dim">Suggestions</label>
            <div className="te-action-row">
              {onRestoreSuggestionsFromImport && (track.importedMoodTags?.length ?? 0) > 0 && (
                <button className="te-action-btn" onClick={() => onRestoreSuggestionsFromImport(track.trackId)} title="Copy import mood tags into suggestions">
                  Restore from Import
                </button>
              )}
              {onRestoreSuggestionsFromMechanical && (track.mechanicalMoodTags?.length ?? 0) > 0 && (
                <button className="te-action-btn" onClick={() => onRestoreSuggestionsFromMechanical(track.trackId)} title="Copy mechanical mood tags into suggestions">
                  Restore from Mechanical
                </button>
              )}
              {onClearSuggestedMoods && (
                <button className="te-action-btn te-action-btn-danger" onClick={() => onClearSuggestedMoods(track.trackId)} title="Clear all mood suggestions">
                  Clear Suggestions
                </button>
              )}
            </div>
          </div>
          <div className="te-row">
            <label className="te-label">Mech. Moods</label>
            <input
              className="te-input"
              value={mechMoodsRaw}
              onChange={(e) => setMechMoodsRaw(e.target.value)}
              placeholder="opener, bridge, closer… (populated by analyzer)"
            />
          </div>
          {track.primaryMood && (
            <div className="te-row">
              <label className="te-label">Primary Mood</label>
              <span className="te-value-dim">{track.primaryMood}</span>
            </div>
          )}
          {track.focusCategory && (
            <div className="te-row">
              <label className="te-label">Focus</label>
              <span className="te-value-dim">{track.focusCategory}</span>
            </div>
          )}
          {track.style && (
            <div className="te-row">
              <label className="te-label">Style</label>
              <span className="te-value-dim">{track.style}</span>
            </div>
          )}

          {/* Mechanical mood analysis */}
          <div className="te-section-label">
            Mechanical Mood
            <span className="te-section-note"> — analyzer-derived; edit Mech. Moods field above to correct</span>
          </div>
          {track.mechanicalAnalysisStatus ? (
            <>
              <div className="te-row">
                <label className="te-label">Status</label>
                <span className={`te-analysis-note te-analysis-${
                  track.mechanicalAnalysisStatus === "analyzed" ? "ok" :
                  track.mechanicalAnalysisStatus === "partial" ? "partial" :
                  track.mechanicalAnalysisStatus === "stale" ? "warn" :
                  track.mechanicalAnalysisStatus === "failed" ? "error" : "pending"
                }`}>
                  {track.mechanicalAnalysisStatus}
                </span>
              </div>
              {track.mechanicalAnalysisSources && track.mechanicalAnalysisSources.length > 0 && (
                <div className="te-row">
                  <label className="te-label">Sources</label>
                  <span className="te-value-dim">{track.mechanicalAnalysisSources.join(", ")}</span>
                </div>
              )}
              {track.mechanicalMoodConfidence && Object.keys(track.mechanicalMoodConfidence).length > 0 && (
                <div className="te-mech-confidence">
                  {(Object.entries(track.mechanicalMoodConfidence) as [string, number][])
                    .sort(([, a], [, b]) => b - a)
                    .map(([tag, conf]) => (
                      <span key={tag} className="te-mech-chip">
                        {tag}
                        <span className="te-mech-chip-conf">{Math.round(conf * 100)}%</span>
                      </span>
                    ))}
                </div>
              )}
              {track.mechanicalAnalysisNotes && track.mechanicalAnalysisNotes.length > 0 && (
                <div className="te-analyzer-notice" style={{ marginTop: 4, fontSize: 9 }}>
                  {track.mechanicalAnalysisNotes.slice(0, 4).map((n, i) => (
                    <div key={i}>{n}</div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="te-analyzer-notice">
              Not yet analyzed. Click "Analyze Track" below to run catalog-derived mechanical mood analysis.
            </div>
          )}

          {/* Source */}
          <div className="te-section-label">Source</div>
          <div className="te-row">
            <label className="te-label">Owner</label>
            <select className="te-select" value={sourceOwner} onChange={(e) => setSourceOwner(e.target.value as TrackSourceOwner)}>
              {OWNER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="te-row">
            <label className="te-label">Library</label>
            <input className="te-input" value={sourceLibrary} onChange={(e) => setSourceLibrary(e.target.value)} placeholder="e.g. StudioRich Catalog" />
          </div>
          <div className="te-row">
            <label className="te-label">Catalog ID</label>
            <input className="te-input" value={catalogId} onChange={(e) => setCatalogId(e.target.value)} placeholder="Suno ID or internal ID" />
          </div>
          <div className="te-section-label" style={{ marginTop: 6 }}>Platform Use</div>
          <div className="te-platform-use">
            {PLATFORM_USE_OPTIONS.map((o) => (
              <label key={o.value} className="te-check-label">
                <input type="checkbox" checked={platformUse.includes(o.value)} onChange={() => togglePlatformUse(o.value)} />
                {" "}{o.label}
              </label>
            ))}
          </div>

          {/* Notes */}
          <div className="te-section-label">Notes</div>
          <textarea
            className="te-input te-textarea"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Internal notes about this track…"
            rows={3}
          />
        </div>

        <div className="track-editor-footer">
          <div className="te-footer-left">
            {analyzerJobStatus === "running" && (
              <span className="te-analysis-note te-analysis-partial" style={{ padding: "4px 8px" }}>Analyzing…</span>
            )}
            {analyzerJobStatus === "complete" && (
              <span className="te-analysis-note te-analysis-ok" style={{ padding: "4px 8px" }}>Done ✓</span>
            )}
            <button
              className="tb-btn"
              disabled={!onAnalyzeTrack || analyzerJobStatus === "running"}
              title={onAnalyzeTrack ? "Run catalog-derived mechanical mood analysis" : "Analyzer not connected"}
              onClick={() => onAnalyzeTrack?.(track.trackId)}
            >
              Analyze Track
            </button>
            {track.mechanicalAnalysisStatus && onReanalyze && (
              <button
                className="tb-btn"
                disabled={analyzerJobStatus === "running"}
                title="Re-run mechanical mood analysis"
                onClick={() => onReanalyze(track.trackId)}
              >
                Reanalyze
              </button>
            )}
          </div>
          <div className="te-footer-right">
            <button className="tb-btn" onClick={onClose}>Cancel</button>
            <button className="tb-btn ph-btn-primary" onClick={handleSave}>Save Changes</button>
          </div>
        </div>
      </div>
    </div>
  );
}
