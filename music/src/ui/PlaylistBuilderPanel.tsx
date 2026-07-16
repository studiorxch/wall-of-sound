import { useState, useMemo } from "react";
import type { Track, TrackSourceOwner, MechanicalMoodTag, TrackRating } from "../data/trackTypes";
import type { PlaylistArcConfig } from "../data/playlistArcTypes";
import { DEFAULT_THREE_PART_SECTIONS } from "../data/playlistArcTypes";
import { PlaylistMoodArcPanel } from "./PlaylistMoodArcPanel";
import { normalizeTrackGenreIndexTokens } from "../logic/genreTaxonomy";

export type BuilderCreateMode = "create" | "create_fit_curve" | "create_fill_time";

export interface PlaylistBuilderFilters {
  sourceOwners: TrackSourceOwner[];
  bpmMin?: number;
  bpmMax?: number;
  energyMin?: number;
  energyMax?: number;
  targetMinutes?: number;
  trackCount?: number;
  mechanicalMoodTags: MechanicalMoodTag[];
  primaryMood?: string;
  genres: string[];
  grouping?: string;
  ratingMin?: TrackRating;
  audioLinked?: boolean | null; // null = any
  analysisStatus?: string;
  mechanicalAnalysisStatus?: string;
}

export interface PlaylistBuilderResult {
  title: string;
  filters: PlaylistBuilderFilters;
  mode: BuilderCreateMode;
  arcConfig?: PlaylistArcConfig;
}

const ALL_OWNERS: TrackSourceOwner[] = ["studiorich", "external", "reference", "unknown"];
const OWNER_LABELS: Record<TrackSourceOwner, string> = {
  studiorich: "StudioRich", external: "External", reference: "Sounds", unknown: "Unknown",
};

const MECHANICAL_MOODS: MechanicalMoodTag[] = [
  "opener","closer","bridge","reset","lift","drop","hold","drift",
  "pulse","tension","release","build","plateau","recovery","transition",
  "anchor","disruptor","deepener","brightener","shadow",
];

function matchesFilters(t: Track, f: PlaylistBuilderFilters): boolean {
  if (f.sourceOwners.length && !f.sourceOwners.includes(t.sourceOwner ?? "unknown")) return false;
  if (f.bpmMin !== undefined && (t.bpm ?? -Infinity) < f.bpmMin) return false;
  if (f.bpmMax !== undefined && (t.bpm ?? Infinity) > f.bpmMax) return false;
  if (f.energyMin !== undefined && t.energy < f.energyMin) return false;
  if (f.energyMax !== undefined && t.energy > f.energyMax) return false;
  if (f.ratingMin !== undefined && f.ratingMin > 0 && (t.rating ?? 0) < f.ratingMin) return false;
  if (f.primaryMood && t.primaryMood !== f.primaryMood) return false;
  if (f.genres.length) {
    const tg = normalizeTrackGenreIndexTokens(t);
    if (!f.genres.some((g) => tg.includes(g.toLowerCase()))) return false;
  }
  if (f.grouping && t.grouping !== f.grouping) return false;
  if (f.mechanicalMoodTags.length) {
    const tm = t.mechanicalMoodTags ?? [];
    if (!f.mechanicalMoodTags.every((m) => tm.includes(m))) return false;
  }
  if (f.audioLinked === true && !t.audioLinked) return false;
  if (f.audioLinked === false && t.audioLinked) return false;
  if (f.analysisStatus && t.analysisStatus !== f.analysisStatus) return false;
  if (f.mechanicalAnalysisStatus && t.mechanicalAnalysisStatus !== f.mechanicalAnalysisStatus) return false;
  return true;
}

type Props = {
  libraryTracks: Track[];
  onConfirm: (result: PlaylistBuilderResult) => void;
  onCancel: () => void;
  defaultSourceOwner?: TrackSourceOwner;
};

export function PlaylistBuilderPanel({ libraryTracks, onConfirm, onCancel, defaultSourceOwner }: Props) {
  const [title, setTitle] = useState("New Playlist");
  const [sourceOwners, setSourceOwners] = useState<TrackSourceOwner[]>(
    defaultSourceOwner ? [defaultSourceOwner] : ["studiorich"]
  );
  const [bpmMin, setBpmMin] = useState("");
  const [bpmMax, setBpmMax] = useState("");
  const [energyMin, setEnergyMin] = useState("");
  const [energyMax, setEnergyMax] = useState("");
  const [targetMinutes, setTargetMinutes] = useState("");
  const [trackCount, setTrackCount] = useState("");
  const [moodTags, setMoodTags] = useState<MechanicalMoodTag[]>([]);
  const [primaryMood, setPrimaryMood] = useState("");
  const [genre, setGenre] = useState("");
  const [grouping, setGrouping] = useState("");
  const [ratingMin, setRatingMin] = useState<TrackRating>(0);
  const [audioLinked, setAudioLinked] = useState<"any" | "yes" | "no">("any");
  const [analysisStatus, setAnalysisStatus] = useState("");
  const [mechStatus, setMechStatus] = useState("");
  const [mode, setMode] = useState<BuilderCreateMode>("create");
  const [builderTab, setBuilderTab] = useState<"filters" | "arc">("filters");
  const [arcConfig, setArcConfig] = useState<PlaylistArcConfig>({
    mode: "three_part",
    sections: DEFAULT_THREE_PART_SECTIONS.map((s) => ({ ...s })),
  });

  // Derive distinct values from library for dropdowns
  const { distinctMoods, distinctGroupings, distinctGenres } = useMemo(() => {
    const moods = new Set<string>();
    const groupings = new Set<string>();
    const genres = new Set<string>();
    for (const t of libraryTracks) {
      if (t.primaryMood) moods.add(t.primaryMood);
      // grouping may be stored as string or string[] at runtime — handle both.
      const rawGrouping = t.grouping as unknown;
      if (Array.isArray(rawGrouping)) {
        (rawGrouping as string[]).forEach((g) => g && groupings.add(g));
      } else if (rawGrouping) {
        groupings.add(rawGrouping as string);
      }
      normalizeTrackGenreIndexTokens(t).forEach((g) => genres.add(g));
    }
    return {
      distinctMoods: [...moods].sort(),
      distinctGroupings: [...groupings].sort(),
      distinctGenres: [...genres].sort(),
    };
  }, [libraryTracks]);

  const filters: PlaylistBuilderFilters = {
    sourceOwners,
    bpmMin: bpmMin ? Number(bpmMin) : undefined,
    bpmMax: bpmMax ? Number(bpmMax) : undefined,
    energyMin: energyMin ? Number(energyMin) : undefined,
    energyMax: energyMax ? Number(energyMax) : undefined,
    targetMinutes: targetMinutes ? Number(targetMinutes) : undefined,
    trackCount: trackCount ? Number(trackCount) : undefined,
    mechanicalMoodTags: moodTags,
    primaryMood: primaryMood || undefined,
    genres: genre ? [genre] : [],
    grouping: grouping || undefined,
    ratingMin,
    audioLinked: audioLinked === "yes" ? true : audioLinked === "no" ? false : null,
    analysisStatus: analysisStatus || undefined,
    mechanicalAnalysisStatus: mechStatus || undefined,
  };

  const matchingTracks = useMemo(
    () => libraryTracks.filter((t) => matchesFilters(t, filters)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [libraryTracks, sourceOwners, bpmMin, bpmMax, energyMin, energyMax,
     moodTags, primaryMood, genre, grouping, ratingMin, audioLinked, analysisStatus, mechStatus]
  );

  function toggleOwner(o: TrackSourceOwner) {
    setSourceOwners((prev) =>
      prev.includes(o) ? prev.filter((x) => x !== o) : [...prev, o]
    );
  }

  function toggleMoodTag(m: MechanicalMoodTag) {
    setMoodTags((prev) => prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]);
  }

  const arcTrackCount = filters.trackCount ? Number(filters.trackCount) : 12;

  function handleConfirm() {
    const result: PlaylistBuilderResult = { title, filters, mode };
    if (builderTab === "arc") result.arcConfig = arcConfig;
    onConfirm(result);
  }

  return (
    <div className="pb-overlay" onClick={onCancel}>
      <div className="pb-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="pb-header">
          <span className="pb-title">Build Playlist From Catalog</span>
          <button className="export-modal-close" onClick={onCancel}>✕</button>
        </div>

        {/* Tab bar */}
        <div className="pb-tab-bar">
          <button
            className={`pb-tab${builderTab === "filters" ? " active" : ""}`}
            onClick={() => setBuilderTab("filters")}
          >
            Filters
          </button>
          <button
            className={`pb-tab${builderTab === "arc" ? " active" : ""}`}
            onClick={() => setBuilderTab("arc")}
          >
            Mood Arc
          </button>
        </div>

        <div className="pb-body">
          {/* Playlist name — always visible */}
          <div className="pb-field-row">
            <label className="pb-label">Playlist Name</label>
            <input
              className="pb-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="New Playlist"
            />
          </div>

          {builderTab === "arc" && (
            <>
              {/* Track count needed for section calculation */}
              <div className="pb-section-header">Target Track Count</div>
              <div className="pb-range-row">
                <span className="pb-range-label">Track Count</span>
                <input
                  className="pb-input-sm"
                  placeholder="e.g. 12"
                  value={trackCount}
                  onChange={(e) => setTrackCount(e.target.value)}
                  type="number" min={3}
                />
              </div>
              <PlaylistMoodArcPanel
                libraryTracks={libraryTracks}
                config={arcConfig}
                totalTrackCount={arcTrackCount}
                onChange={setArcConfig}
              />
            </>
          )}

          {builderTab === "filters" && (<>
          {/* Source owners */}
          <div className="pb-section-header">Source</div>
          <div className="pb-chip-row">
            {ALL_OWNERS.map((o) => (
              <button
                key={o}
                className={`pb-chip pb-chip-owner-${o}${sourceOwners.includes(o) ? " active" : ""}`}
                onClick={() => toggleOwner(o)}
              >
                {OWNER_LABELS[o]}
              </button>
            ))}
          </div>

          {/* BPM + Energy */}
          <div className="pb-section-header">BPM &amp; Energy</div>
          <div className="pb-range-row">
            <span className="pb-range-label">BPM</span>
            <input className="pb-input-sm" placeholder="min" value={bpmMin} onChange={(e) => setBpmMin(e.target.value)} type="number" min={0} />
            <span className="pb-range-sep">–</span>
            <input className="pb-input-sm" placeholder="max" value={bpmMax} onChange={(e) => setBpmMax(e.target.value)} type="number" min={0} />
            <span className="pb-range-label" style={{ marginLeft: 12 }}>Energy</span>
            <input className="pb-input-sm" placeholder="min" value={energyMin} onChange={(e) => setEnergyMin(e.target.value)} type="number" min={0} max={10} step={0.5} />
            <span className="pb-range-sep">–</span>
            <input className="pb-input-sm" placeholder="max" value={energyMax} onChange={(e) => setEnergyMax(e.target.value)} type="number" min={0} max={10} step={0.5} />
          </div>

          {/* Mechanical mood tags */}
          <div className="pb-section-header">Mechanical Mood Tags <span className="pb-section-note">(track must have ALL selected)</span></div>
          <div className="pb-chip-row pb-chip-row-wrap">
            {MECHANICAL_MOODS.map((m) => (
              <button
                key={m}
                className={`pb-chip pb-chip-mood${moodTags.includes(m) ? " active" : ""}`}
                onClick={() => toggleMoodTag(m)}
              >
                {m}
              </button>
            ))}
          </div>

          {/* Mood + Genre + Grouping */}
          <div className="pb-section-header">Mood / Genre / Grouping</div>
          <div className="pb-field-grid">
            <div className="pb-field-col">
              <label className="pb-label">Primary Mood</label>
              <select className="pb-select" value={primaryMood} onChange={(e) => setPrimaryMood(e.target.value)}>
                <option value="">Any</option>
                {distinctMoods.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="pb-field-col">
              <label className="pb-label">Genre</label>
              <select className="pb-select" value={genre} onChange={(e) => setGenre(e.target.value)}>
                <option value="">Any</option>
                {distinctGenres.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div className="pb-field-col">
              <label className="pb-label">Grouping</label>
              <select className="pb-select" value={grouping} onChange={(e) => setGrouping(e.target.value)}>
                <option value="">Any</option>
                {distinctGroupings.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div className="pb-field-col">
              <label className="pb-label">Rating ≥</label>
              <select className="pb-select" value={ratingMin} onChange={(e) => setRatingMin(Number(e.target.value) as TrackRating)}>
                {[0,1,2,3,4,5].map((r) => <option key={r} value={r}>{r === 0 ? "Any" : `${r}★`}</option>)}
              </select>
            </div>
          </div>

          {/* Audio + Analysis */}
          <div className="pb-section-header">Audio &amp; Analysis</div>
          <div className="pb-field-grid">
            <div className="pb-field-col">
              <label className="pb-label">Audio Linked</label>
              <select className="pb-select" value={audioLinked} onChange={(e) => setAudioLinked(e.target.value as "any"|"yes"|"no")}>
                <option value="any">Any</option>
                <option value="yes">Playable only (audio linked)</option>
                <option value="no">Missing audio only</option>
              </select>
            </div>
            <div className="pb-field-col">
              <label className="pb-label">Analysis Status</label>
              <select className="pb-select" value={analysisStatus} onChange={(e) => setAnalysisStatus(e.target.value)}>
                <option value="">Any</option>
                {["not_analyzed","partial","analyzed","stale","failed"].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="pb-field-col">
              <label className="pb-label">Mech. Analysis</label>
              <select className="pb-select" value={mechStatus} onChange={(e) => setMechStatus(e.target.value)}>
                <option value="">Any</option>
                {["not_analyzed","partial","analyzed","stale","failed"].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Duration / count */}
          <div className="pb-section-header">Playlist Size</div>
          <div className="pb-range-row">
            <span className="pb-range-label">Target (min)</span>
            <input className="pb-input-sm" placeholder="e.g. 60" value={targetMinutes} onChange={(e) => setTargetMinutes(e.target.value)} type="number" min={0} />
            <span className="pb-range-label" style={{ marginLeft: 12 }}>Track Count</span>
            <input className="pb-input-sm" placeholder="e.g. 20" value={trackCount} onChange={(e) => setTrackCount(e.target.value)} type="number" min={1} />
          </div>

          {/* Match preview */}
          <div className="pb-preview-bar">
            <span className="pb-preview-count">{matchingTracks.length}</span>
            <span className="pb-preview-label"> tracks match current filters</span>
            {matchingTracks.length > 0 && (() => {
              const unlinked = matchingTracks.filter((t) => !t.audioLinked && !t.objectUrl).length;
              if (!unlinked) return null;
              return (
                <span className="pb-preview-warn">
                  {" "}· {unlinked} without audio
                </span>
              );
            })()}
          </div>

          {/* Create mode */}
          <div className="pb-section-header">Create Mode</div>
          <div className="pb-mode-row">
            {(["create", "create_fit_curve", "create_fill_time"] as BuilderCreateMode[]).map((m) => (
              <button
                key={m}
                className={`pb-mode-btn${mode === m ? " active" : ""}`}
                onClick={() => setMode(m)}
              >
                {m === "create" ? "Create" : m === "create_fit_curve" ? "Create + Fit Flow Curve" : "Create + Fill Time"}
              </button>
            ))}
          </div>
          </>)}
        </div>

        <div className="pb-footer">
          <button className="tb-btn" onClick={onCancel}>Cancel</button>
          <button
            className="tb-btn ph-btn-primary"
            disabled={!title.trim() || (builderTab === "filters" ? matchingTracks.length === 0 : false)}
            onClick={handleConfirm}
          >
            {builderTab === "arc"
              ? "Create Arc Playlist"
              : mode === "create" ? "Create Playlist"
              : mode === "create_fit_curve" ? "Create + Fit Curve"
              : "Create + Fill Time"}
            {builderTab === "filters" && matchingTracks.length > 0 && (
              <span className="pb-btn-count"> ({matchingTracks.length})</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
