import { useState, useMemo, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { effectiveDuration } from "../logic/metadataReadiness";
import { resolveCrateTracks } from "../logic/resolveCrate";
import { computePlaylistUiState, type PlaylistUiStateSummary } from "../logic/playlistUiState";
import { SourceBadge, getSourceComposition } from "./SourceBadge";
import type {
  PlaylistRecord,
  PlaylistImage,
  PlaylistBroadcastIdentity,
  PlayColorTheme,
  PlaylistSourcePolicy,
  PlaylistDuplicateRules,
  DuplicateFamilyMode,
  DuplicatePreferredVariant,
} from "../data/playProjectTypes";
import { DEFAULT_DUPLICATE_RULES } from "../data/playProjectTypes";
import type { Track, TrackSourceOwner } from "../data/trackTypes";
import type { CurvePresetType } from "../data/flowCurveTypes";
import type { MusicSourcePool } from "../data/sourcePoolTypes";
import type { LibraryTrackFilters } from "../logic/libraryFilters";
import { PlaylistIdentityPanel } from "./PlaylistIdentityPanel";
import { CollectionDetailBar } from "./CollectionDetailBar";
import { PlaylistPathOptionsPanel } from "./PlaylistPathOptionsPanel";
import { fmtUpdatedLabel, fmtShortDate } from "../logic/dateFormat";
import { getCrateVisualToken } from "../logic/crateMoodSummary";
import { PlaylistMoodArcPanel } from "./PlaylistMoodArcPanel";
import type { PlaylistArcConfig } from "../data/playlistArcTypes";
import { DEFAULT_THREE_PART_SECTIONS, DEFAULT_FOUR_PART_SECTIONS } from "../data/playlistArcTypes";
import { PlaylistAnalyzerReviewView } from "./playlistAnalyzer/PlaylistAnalyzerReviewView";
import { PlaylistRepairPanel } from "./playlistRepair/PlaylistRepairPanel";
import { PlaylistPreparationPanel } from "./playlistTransition/PlaylistPreparationPanel";
import type { PlaylistRepairState, LibraryGapRecord, PlaylistReanalysisProgress } from "../data/playlistRepairTypes";

const ROLE_LABELS: Record<
  NonNullable<PlaylistRecord["playlistRole"]>,
  string
> = {
  static: "Static",
  template: "Smart Fill",
  event_generated: "Generated",
};
const REGEN_MODES: Array<{
  value: NonNullable<PlaylistRecord["regenerationMode"]>;
  label: string;
}> = [
  { value: "manual", label: "Manual" },
  { value: "per_event_occurrence", label: "Per Event" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
];

const PRESET_SHAPES: Record<CurvePresetType, { path: string; label: string }> =
  {
    elegant_nested_arc: {
      label: "Elegant Nested Arc",
      path: "M0 13 C5 8 7 4 11 7 C15 10 17 5 21 7 C23 9 25 11 28 13",
    },
    rolling_waves: {
      label: "Rolling Waves",
      path: "M0 8 C3 2 6 2 7 8 C8 14 11 14 14 8 C17 2 20 2 21 8 C22 14 25 14 28 8",
    },
    mountain: { label: "Mountain", path: "M0 14 L14 2 L28 14" },
    valley_rebuild: {
      label: "Valley Rebuild",
      path: "M0 2 L10 13 L18 13 L28 2",
    },
    ramp: { label: "Ramp", path: "M0 14 L28 2" },
  };

const PRESET_ORDER: CurvePresetType[] = [
  "elegant_nested_arc",
  "rolling_waves",
  "mountain",
  "valley_rebuild",
  "ramp",
];

type Props = {
  playlist: PlaylistRecord;
  libraryTracks: Track[];
  flash?: string;
  onTitleChange: (t: string) => void;
  onDescriptionChange: (d: string) => void;
  onTargetDurationChange: (minutes: number) => void;
  onPresetChange: (p: CurvePresetType) => void;
  onFillMissingTime: () => void;
  onRegenerateFromCurve: () => void;
  // Blocked-track cleanup (0709) — codec/unplayable/missing-audio tracks
  // currently assigned to playlist slots.
  blockedTrackCount?: number;
  onRemoveBlockedTracks?: () => void;
  onExportM3u: () => void;
  onCoverImageChange: (img: PlaylistImage | undefined) => void;
  onBackgroundImageChange: (img: PlaylistImage | undefined) => void;
  onBroadcastBgChange: (src: string | undefined) => void;
  onAccentColorChange: (color: string | undefined) => void;
  onMoodTagsChange: (tags: string[]) => void;
  onBroadcastIdentityChange: (bi: PlaylistBroadcastIdentity) => void;
  // Source pool / template controls (0624A)
  sourcePools?: MusicSourcePool[];
  onCreateSourcePool?: () => void;
  onSetPlaylistRole?: (
    role: NonNullable<PlaylistRecord["playlistRole"]>,
  ) => void;
  onSetSourcePoolId?: (id: string | undefined) => void;
  onSetTargetTrackCount?: (n: number | undefined) => void;
  onSetRegenerationMode?: (
    m: NonNullable<PlaylistRecord["regenerationMode"]>,
  ) => void;
  onSetTemplateSourceFilters?: (f: LibraryTrackFilters) => void;
  onCreateFromTemplate?: () => void;
  onColorThemesChange?: (themes: PlayColorTheme[], activeId: string) => void;
  onSourcePolicyChange?: (policy: PlaylistSourcePolicy | undefined) => void;
  onAllowedSourceOwnersChange?: (owners: TrackSourceOwner[] | undefined) => void;
  onAddMusic?: () => void;
  onGoHome?: () => void;
  onNewPlaylist?: () => void;
  // Crate Sources (Phase 1)
  crates?: import("../data/crateTypes").CrateRecord[];
  cratePoolTracks?: import("../data/trackTypes").Track[];
  onAddCrate?: (crateId: string) => void;
  onRemoveCrate?: (crateId: string) => void;
  onOpenCrate?: (crateId: string) => void;
  // Duplicate family rules (Phase 2 — 0704D)
  onSetDuplicateRules?: (rules: PlaylistDuplicateRules) => void;
  // Sections / Weights (0711)
  onArcConfigChange?: (config: PlaylistArcConfig) => void;
  onRegenerateWithSections?: () => void;
  // Playlist Path Options (0704G)
  pathOptions?: import("../data/playlistPathTypes").PlaylistPathOption[];
  acceptedPathOptionId?: string;
  isGeneratingOptions?: boolean;
  onGenerateOptions?: () => void;
  onAcceptOption?: (optionId: string) => void;
  onDuplicateOption?: (optionId: string) => void;
  onFixMetadata?: () => void;
  // Metadata stale detection (0705E)
  currentMetadataRevision?: string;
  metadataRepairImpact?: import("../data/playlistPathTypes").PlaylistMetadataRepairImpact;
  // Crate-change stale reason (0707_PlaylistOptionsCrateFlowCleanup)
  playlistOptionsStaleReason?: PlaylistRecord["playlistOptionsStaleReason"];
  // Artwork display mode (0706A)
  onArtworkDisplayModeChange?: (mode: NonNullable<PlaylistRecord["artworkDisplayMode"]>) => void;
  // Recovery warning integration
  recoveryWarning?: boolean;
  onReviewRecovery?: () => void;
  // Options popup control (lifted to App.tsx)
  showOptionsPopup?: boolean;
  onOpenOptionsPopup?: () => void;
  onCloseOptionsPopup?: () => void;
  // Playlist Local Repair (0713_MUSIC_Playlist_Local_Repair_And_Gap_Analysis)
  libraryGaps?: LibraryGapRecord[];
  onLibraryGapsChange?: (gaps: LibraryGapRecord[]) => void;
  onReplaceSlot?: (trackId: string, slotIndex: number) => void;
  onRepairStateChange?: (state: PlaylistRepairState) => void;
  onReanalyzePlaylist?: () => void;
  reanalysisProgress?: PlaylistReanalysisProgress | null;
  reanalysisRunning?: boolean;
  onPreparationChange?: (preparation: import("../data/playProjectTypes").PlaylistRecord["playbackPreparation"]) => void;
  // 0718A_MUSIC_RADIO_Clean_Board_and_Explicit_Send_Flows §3 — explicit
  // send affordance, MUSIC-side; never auto-publishes.
  onSendToRadio?: () => void;
};

function fmtDur(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function PlaylistCoverThumb({
  playlist,
  size = 48,
}: {
  playlist: PlaylistRecord;
  size?: number;
}) {
  const [imgErr, setImgErr] = useState(false);
  const src = playlist.coverImage?.src;
  const accent = playlist.accentColor ?? "var(--accent)";

  if (src && !imgErr) {
    return (
      <img
        src={src}
        alt={playlist.coverImage?.alt ?? playlist.title}
        width={size}
        height={size}
        className="ph-cover-img"
        onError={() => setImgErr(true)}
      />
    );
  }

  const initials = playlist.title
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div
      className="ph-cover-placeholder"
      style={{ width: size, height: size, background: accent }}
      title={playlist.title}
    >
      {initials || "♫"}
    </div>
  );
}

// Portal-rendered dropdown — escapes overflow:hidden containers
function DropdownPortal({
  open,
  anchorRef,
  align = "left",
  onClose,
  children,
}: {
  open: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
  align?: "left" | "right";
  onClose: () => void;
  children: React.ReactNode;
}) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (open && anchorRef.current) {
      setRect(anchorRef.current.getBoundingClientRect());
    } else {
      setRect(null);
    }
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return;
    function handleMouseDown(_e: MouseEvent) {
      onClose();
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [open, onClose]);

  if (!open || !rect) return null;
  const style: React.CSSProperties = {
    position: "fixed",
    top: rect.bottom + 4,
    zIndex: 1000,
    ...(align === "right"
      ? { right: window.innerWidth - rect.right }
      : { left: rect.left }),
  };
  return createPortal(
    <div style={style} onMouseDown={(e) => e.stopPropagation()}>
      {children}
    </div>,
    document.body,
  );
}

export function PlaylistHeader({
  playlist,
  libraryTracks,
  flash,
  onTitleChange,
  onDescriptionChange,
  onTargetDurationChange,
  onPresetChange,
  onFillMissingTime,
  onRegenerateFromCurve,
  blockedTrackCount = 0,
  onRemoveBlockedTracks,
  onExportM3u,
  onCoverImageChange,
  onBackgroundImageChange,
  onBroadcastBgChange,
  onAccentColorChange: _onAccentColorChange,
  onMoodTagsChange,
  onBroadcastIdentityChange: _onBroadcastIdentityChange,
  sourcePools = [],
  onCreateSourcePool,
  onSetPlaylistRole,
  onSetSourcePoolId,
  onSetTargetTrackCount,
  onSetRegenerationMode,
  onSetTemplateSourceFilters,
  onCreateFromTemplate,
  onColorThemesChange: _onColorThemesChange,
  onSourcePolicyChange,
  onAllowedSourceOwnersChange,
  onAddMusic: _onAddMusic,
  onGoHome,
  onNewPlaylist,
  crates = [],
  cratePoolTracks = [],
  onAddCrate,
  onRemoveCrate,
  onOpenCrate,
  onSetDuplicateRules,
  onArcConfigChange,
  onRegenerateWithSections,
  pathOptions = [],
  acceptedPathOptionId,
  isGeneratingOptions = false,
  onGenerateOptions,
  onAcceptOption,
  onDuplicateOption,
  onFixMetadata: _onFixMetadata,
  currentMetadataRevision,
  metadataRepairImpact,
  playlistOptionsStaleReason,
  onArtworkDisplayModeChange,
  recoveryWarning,
  onReviewRecovery,
  showOptionsPopup = false,
  onOpenOptionsPopup,
  onCloseOptionsPopup,
  libraryGaps = [],
  onLibraryGapsChange,
  onReplaceSlot,
  onRepairStateChange,
  onReanalyzePlaylist,
  reanalysisProgress = null,
  reanalysisRunning = false,
  onPreparationChange,
  onSendToRadio,
}: Props) {
  // Accepted playlist read mode (0705K)
  const acceptedOutputCount = playlist.slots.filter((s) => s.assignedTrackId).length;
  const isAcceptedMode = Boolean(acceptedPathOptionId) && acceptedOutputCount > 0;

  // Computed playlist UI state
  const tracksById = new Map(libraryTracks.map((t) => [t.trackId, t]));
  const uiState: PlaylistUiStateSummary = useMemo(
    () => computePlaylistUiState(playlist, tracksById, recoveryWarning),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [playlist, libraryTracks, recoveryWarning],
  );
  const isDraftEmpty = uiState.state === "draft_empty" || uiState.state === "needs_crates";

  const [_showCurveTools, setShowCurveTools] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showArcPanel, setShowArcPanel] = useState(false);
  const [showIdentity, setShowIdentity] = useState(false);
  const [showAnalyzerReview, setShowAnalyzerReview] = useState(false);
  const [showRepairPanel, setShowRepairPanel] = useState(false);
  const [showPreparationPanel, setShowPreparationPanel] = useState(false);
  const [showCratePicker, setShowCratePicker] = useState(false);
  const settingsBtnRef = useRef<HTMLButtonElement>(null);
  const addCrateBtnRef = useRef<HTMLButtonElement>(null);
  const showOptionsDrawer = showOptionsPopup;
  const setShowOptionsDrawer = (open: boolean) => open ? onOpenOptionsPopup?.() : onCloseOptionsPopup?.();

  const [confirmPreset, setConfirmPreset] = useState<CurvePresetType | null>(
    null,
  );
  const [confirmRegen, setConfirmRegen] = useState(false);

  const assignedSlots = playlist.slots.filter((s) => s.assignedTrackId);
  const { totalDur, totalDurIsEstimated } = (() => {
    let sum = 0; let anyEstimated = false;
    for (const s of assignedSlots) {
      const t = tracksById.get(s.assignedTrackId!);
      if (t) {
        sum += effectiveDuration(t);
        if ((t.durationSeconds ?? 0) <= 0) anyEstimated = true;
      }
    }
    return { totalDur: sum, totalDurIsEstimated: anyEstimated };
  })();
  const count = assignedSlots.length;

  const role = playlist.playlistRole ?? "static";
  const isTemplate = role === "template";
  const isGenerated = role === "event_generated";

  let statsStr: string;
  if (isAcceptedMode) {
    statsStr = `${count} track${count !== 1 ? "s" : ""} · ${fmtDur(totalDur)}${totalDurIsEstimated ? " est" : ""}`;
  } else {
    statsStr = `${count} track${count !== 1 ? "s" : ""} · ${fmtDur(totalDur)}${totalDurIsEstimated ? " est" : ""}`;
  }

  const isOptionsStale = !!(playlistOptionsStaleReason && playlistOptionsStaleReason !== "options_never_generated");
  const sourceComposition = useMemo(
    () => getSourceComposition(cratePoolTracks.map((t) => t.trackId), cratePoolTracks),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cratePoolTracks],
  );

  const presetType = playlist.curve.presetType;

  // Crate pool derived stats
  const attachedCrateIds = new Set(playlist.crateIds ?? []);
  const attachedCrates = crates.filter((c) => attachedCrateIds.has(c.id));
  const hasCrates = attachedCrates.length > 0;

  const crateCountsById = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of attachedCrates) {
      m.set(c.id, resolveCrateTracks(c, libraryTracks).tracks.length);
    }
    return m;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlist.crateIds, libraryTracks]);

  // allTagsCountById: tracks where ANY moodTag matches the crate's single mood filter,
  // ignoring sourceOwner — used to detect stale crate membership.
  const allTagsCountById = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of attachedCrates) {
      if (c.filters.moodTags.length !== 1) continue;
      const mood = c.filters.moodTags[0].toLowerCase();
      m.set(c.id, libraryTracks.filter((t) => (t.moodTags ?? []).some((mt) => mt.toLowerCase() === mood)).length);
    }
    return m;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlist.crateIds, libraryTracks]);

  const poolCount = cratePoolTracks.length;

  const assignedTrackIdSet = useMemo(() => {
    const s = new Set<string>();
    for (const sl of playlist.slots) { if (sl.assignedTrackId) s.add(sl.assignedTrackId); }
    return s;
  }, [playlist.slots]);
  const outputCount = assignedTrackIdSet.size;
  const nextCandidatesCount = cratePoolTracks.filter((t) => !assignedTrackIdSet.has(t.trackId)).length;

  function handlePresetClick(p: CurvePresetType) {
    if (p === presetType) return;
    setConfirmPreset(p);
  }

  function closeDropdowns() {
    setShowCurveTools(false);
    setShowSettings(false);
  }

  return (
    <div className="playlist-header" onClick={closeDropdowns}>
      {onGoHome && (
        <CollectionDetailBar
          collectionLabel="Playlists"
          onBackToCollection={onGoHome}
          createLabel={onNewPlaylist ? "+ New Playlist" : undefined}
          onCreate={onNewPlaylist}
        />
      )}

      <div className="ph-top" onClick={(e) => e.stopPropagation()}>
        {/* Row 1: cover + meta */}
        <div className="ph-identity-row">
          <button
            className="ph-cover-btn"
            onClick={() => setShowIdentity(true)}
            title="Edit playlist identity"
          >
            <PlaylistCoverThumb playlist={playlist} size={44} />
          </button>

          <div className="ph-meta">
            <input
              className="ph-title"
              value={playlist.title}
              onChange={(e) => onTitleChange(e.target.value)}
              spellCheck={false}
            />
            <div className="ph-stats">
              {uiState.showHeaderBadge && (
                <span className={`ph-state-badge ph-state-badge--${uiState.severity}`} title={uiState.description}>
                  {uiState.label}
                </span>
              )}
              {sourceComposition.map((k) => (
                <SourceBadge key={k} source={k} />
              ))}
              {!isDraftEmpty && <span className="ph-stats-text">{statsStr}</span>}
              {(isTemplate || isGenerated) && (
                <span className={`ph-role-badge ph-role-badge--${role}`}>
                  {ROLE_LABELS[role]}
                </span>
              )}
              {flash && <span className="ph-flash">{flash}</span>}
            </div>
            <div className="ph-dates">
              {playlist.updatedAt && (
                <span>{fmtUpdatedLabel(playlist.updatedAt)}</span>
              )}
              {playlist.createdAt && (
                <span>Created {fmtShortDate(playlist.createdAt)}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Blocked-track cleanup banner (0709) */}
      {blockedTrackCount > 0 && onRemoveBlockedTracks && (
        <div className="ph-blocked-banner" onClick={(e) => e.stopPropagation()}>
          <span className="ph-blocked-banner-text">
            This playlist contains blocked tracks.
          </span>
          <button
            className="tb-btn sm ph-blocked-banner-btn"
            onClick={onRemoveBlockedTracks}
            title="Remove codec-blocked, unplayable, and missing-audio tracks from this playlist"
          >
            Remove Blocked Tracks ({blockedTrackCount})
          </button>
        </div>
      )}

      {/* Curve area: horizontal toolbar above full-width chart */}
      <div className="ph-curve-area" onClick={(e) => e.stopPropagation()}>
        <div className="ph-curve-toolbar">
          {/* 0718A §3 — explicit send affordance; never auto-publishes */}
          {onSendToRadio && (
            <button
              className="ph-ct-btn"
              onClick={(e) => { e.stopPropagation(); onSendToRadio(); }}
              title="Send this playlist to RADIO"
            >
              ◎ Send → RADIO
            </button>
          )}
          {/* Settings dropdown */}
          <div className="ph-dropdown ph-ct-dropdown">
            <button
              ref={settingsBtnRef}
              className="ph-ct-btn"
              onClick={(e) => {
                e.stopPropagation();
                setShowSettings((v) => !v);
                setShowCurveTools(false);
              }}
              title="Playlist settings"
            >
              ⚙ Playlist Settings
            </button>
            <DropdownPortal
              open={showSettings}
              anchorRef={settingsBtnRef}
              align="right"
              onClose={() => setShowSettings(false)}
            >
              <div
                className="ph-dropdown-panel"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Identity + Exports — always in Settings */}
                <div className="ph-dropdown-label">Identity</div>
                <button
                  className="tb-btn"
                  style={{ marginTop: 4, width: "100%" }}
                  onClick={() => { setShowIdentity(true); setShowSettings(false); }}
                >
                  Edit Playlist Profile
                </button>
                <div className="ph-dropdown-label" style={{ marginTop: 10 }}>Analyzer</div>
                <button
                  className="tb-btn"
                  style={{ marginTop: 4, width: "100%" }}
                  onClick={() => { setShowAnalyzerReview(true); setShowSettings(false); }}
                >
                  Analyze Playlist
                </button>
                <button
                  className="tb-btn"
                  style={{ marginTop: 4, width: "100%" }}
                  onClick={() => { setShowRepairPanel(true); setShowSettings(false); }}
                >
                  Repair Playlist
                </button>
                <button
                  className="tb-btn"
                  style={{ marginTop: 4, width: "100%" }}
                  onClick={() => { setShowPreparationPanel(true); setShowSettings(false); }}
                >
                  Prepare for Playback
                </button>
                <div className="ph-dropdown-label" style={{ marginTop: 10 }}>Exports</div>
                <button
                  className="tb-btn"
                  style={{ marginTop: 4, width: "100%" }}
                  onClick={() => { onExportM3u(); setShowSettings(false); }}
                >
                  ↓ Export M3U
                </button>
                <div className="ph-dropdown-label" style={{ marginTop: 10 }}>Broadcast</div>
                <button
                  className="tb-btn"
                  style={{ marginTop: 4, width: "100%", opacity: 0.5, cursor: "not-allowed" }}
                  disabled
                  title="Playlist-to-broadcast handoff coming soon"
                >
                  Prepare Countdown Screen
                </button>

                {recoveryWarning && onReviewRecovery && (
                  <>
                    <div className="ph-dropdown-label" style={{ marginTop: 10 }}>Data Management</div>
                    <button
                      className="tb-btn"
                      style={{ marginTop: 4, width: "100%" }}
                      onClick={() => { onReviewRecovery(); setShowSettings(false); }}
                    >
                      Backups &amp; Recovery
                    </button>
                  </>
                )}

                {/* Curve tools — moved from main toolbar */}
                {!isAcceptedMode && (
                  <>
                    <div className="ph-dropdown-label" style={{ marginTop: 10 }}>Flow Curve</div>
                    <div className="ph-preset-row" style={{ marginTop: 4 }}>
                      {PRESET_ORDER.map((p) => {
                        const shape = PRESET_SHAPES[p];
                        return (
                          <button
                            key={p}
                            className={`tb-preset-btn${presetType === p ? " active" : ""}`}
                            title={shape.label}
                            onClick={() => { handlePresetClick(p); setShowSettings(false); }}
                          >
                            <svg viewBox="0 0 28 16" width="28" height="16" fill="none">
                              <path d={shape.path} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </button>
                        );
                      })}
                    </div>
                    {hasCrates && poolCount > 0 && (
                      <div className="ph-curve-pool-stat" style={{ marginTop: 4 }}>
                        Crate Pool: {poolCount} · Output: {outputCount} · Next: {nextCandidatesCount}
                      </div>
                    )}
                    {onSetDuplicateRules && (() => {
                      const dr = playlist.duplicateRules ?? DEFAULT_DUPLICATE_RULES;
                      function patchDR(partial: Partial<PlaylistDuplicateRules>) {
                        onSetDuplicateRules!({ ...dr, ...partial });
                      }
                      return (
                        <div className="ph-dup-rules" style={{ marginTop: 8 }}>
                          <div className="ph-dropdown-label">Duplicate Family</div>
                          <div className="ph-dup-mode-btns" style={{ marginTop: 4 }}>
                            {([
                              { value: "allow", label: "Allow" },
                              { value: "avoid_family", label: "One per family" },
                              { value: "separate_family", label: "Separate" },
                            ] as { value: DuplicateFamilyMode; label: string }[]).map(({ value, label }) => (
                              <button
                                key={value}
                                className={`ph-dup-btn${dr.mode === value ? " active" : ""}`}
                                onClick={() => patchDR({ mode: value })}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                          {dr.mode === "separate_family" && (
                            <div className="ph-dup-sep-row" style={{ marginTop: 6 }}>
                              <span className="ph-tf-label">Separate by</span>
                              <input
                                className="tb-num"
                                type="number"
                                min={1}
                                max={50}
                                value={dr.separationTracks}
                                onChange={(e) => {
                                  const v = parseInt(e.target.value, 10);
                                  if (!isNaN(v) && v >= 1) patchDR({ separationTracks: v });
                                }}
                              />
                              <span className="ph-tf-label">tracks</span>
                            </div>
                          )}
                          <div className="ph-dropdown-label" style={{ marginTop: 8 }}>Preferred Variant</div>
                          <select
                            className="ph-select"
                            style={{ marginTop: 4, width: "100%" }}
                            value={dr.preferredVariant}
                            onChange={(e) => patchDR({ preferredVariant: e.target.value as DuplicatePreferredVariant })}
                          >
                            <option value="none">No preference</option>
                            <option value="non_s01">Prefer non-S01/final</option>
                            <option value="highest_rating">Prefer highest rated</option>
                            <option value="longest">Prefer longest</option>
                            <option value="shortest">Prefer shortest</option>
                            <option value="newest">Prefer newest</option>
                          </select>
                        </div>
                      );
                    })()}
                    <button
                      className="tb-btn"
                      style={{ marginTop: 10, width: "100%" }}
                      onClick={() => { setConfirmRegen(true); setShowSettings(false); }}
                    >
                      {hasCrates ? "Regenerate From Crate" : "Regenerate From Curve"}
                    </button>
                    {onFillMissingTime && (
                      <button
                        className="tb-btn"
                        style={{ marginTop: 6, width: "100%" }}
                        onClick={() => { onFillMissingTime(); setShowSettings(false); }}
                        title="Fill missing time with eligible tracks"
                      >
                        ⧗ Fill Time
                      </button>
                    )}
                  </>
                )}

                {onArcConfigChange && (
                  <>
                    <div className="ph-dropdown-label" style={{ marginTop: 10 }}>Sections / Weights</div>
                    <div className="ph-arc-summary-row">
                      <span className="ph-arc-summary-text">
                        {playlist.arcConfig && playlist.arcConfig.mode !== "none"
                          ? `${playlist.arcConfig.sections.length} sections: ${playlist.arcConfig.sections.map((s) => `${s.label} ${Math.round(s.weight * 100)}%`).join(", ")}`
                          : "Off — flat pool generation"}
                      </span>
                      <button
                        className="tb-btn sm"
                        onClick={() => setShowArcPanel((v) => !v)}
                      >
                        {showArcPanel ? "Hide" : "Edit"}
                      </button>
                    </div>
                    {showArcPanel && (
                      <div className="ph-arc-panel-wrap">
                        <div className="ph-arc-mode-row">
                          {(["none", "three_part", "four_part"] as const).map((m) => (
                            <button
                              key={m}
                              className={`arc-mode-btn${(playlist.arcConfig?.mode ?? "none") === m ? " active" : ""}`}
                              onClick={() => onArcConfigChange(
                                m === "none"
                                  ? { mode: "none", sections: playlist.arcConfig?.sections ?? [] }
                                  : { mode: m, sections: (playlist.arcConfig?.sections?.length ? playlist.arcConfig.sections
                                      : (m === "three_part" ? DEFAULT_THREE_PART_SECTIONS : DEFAULT_FOUR_PART_SECTIONS)) },
                              )}
                            >
                              {m === "none" ? "Off" : m === "three_part" ? "3-Part" : "4-Part"}
                            </button>
                          ))}
                        </div>
                        {playlist.arcConfig && playlist.arcConfig.mode !== "none" && (
                          <>
                            <PlaylistMoodArcPanel
                              libraryTracks={libraryTracks}
                              config={playlist.arcConfig}
                              totalTrackCount={playlist.targetTrackCount ?? playlist.slots.filter((s) => s.assignedTrackId).length ?? 12}
                              onChange={onArcConfigChange}
                            />
                            {onRegenerateWithSections && (
                              <button
                                className="tb-btn ph-btn-primary"
                                style={{ marginTop: 8, width: "100%" }}
                                onClick={() => { onRegenerateWithSections(); setShowSettings(false); }}
                              >
                                ↻ Regenerate With Sections
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </>
                )}

                <div className="ph-dropdown-label" style={{ marginTop: 10 }}>Timing</div>
                <div className="ph-dropdown-label">{""}</div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    marginTop: 4,
                  }}
                >
                  <input
                    className="tb-num"
                    type="number"
                    min={10}
                    max={720}
                    value={playlist.targetDurationMinutes}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      if (!isNaN(v) && v >= 10) onTargetDurationChange(v);
                    }}
                  />
                  <span className="tb-label">min</span>
                </div>

                {onCreateSourcePool && (
                  <>
                    <div
                      className="ph-dropdown-label"
                      style={{ marginTop: 12 }}
                    >
                      Library
                    </div>
                    <button
                      className="tb-btn"
                      style={{ marginTop: 4, width: "100%" }}
                      onClick={() => {
                        onCreateSourcePool();
                        setShowSettings(false);
                      }}
                      title="Save this playlist's tracks as a reusable library group"
                    >
                      Create Library Group
                    </button>
                  </>
                )}

                {onSetPlaylistRole && (
                  <>
                    <div
                      className="ph-dropdown-label"
                      style={{ marginTop: 12 }}
                    >
                      Playlist Role
                    </div>
                    <div className="ph-role-btns">
                      {(["static", "template", "event_generated"] as const).map(
                        (r) => (
                          <button
                            key={r}
                            className={`ph-role-btn${role === r ? " active" : ""}`}
                            onClick={() => onSetPlaylistRole(r)}
                          >
                            {ROLE_LABELS[r]}
                          </button>
                        ),
                      )}
                    </div>
                  </>
                )}

                {isTemplate && (
                  <>
                    <div
                      className="ph-dropdown-label"
                      style={{ marginTop: 12 }}
                    >
                      Library Group
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        marginTop: 4,
                      }}
                    >
                      <select
                        className="ph-select"
                        value={playlist.sourcePoolId ?? ""}
                        onChange={(e) =>
                          onSetSourcePoolId?.(e.target.value || undefined)
                        }
                      >
                        <option value="">— none —</option>
                        {sourcePools.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.title}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div
                      className="ph-dropdown-label"
                      style={{ marginTop: 10 }}
                    >
                      Target Tracks
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        marginTop: 4,
                      }}
                    >
                      <input
                        className="tb-num"
                        type="number"
                        min={1}
                        max={500}
                        placeholder="—"
                        value={playlist.targetTrackCount ?? ""}
                        onChange={(e) => {
                          const v = parseInt(e.target.value, 10);
                          onSetTargetTrackCount?.(isNaN(v) ? undefined : v);
                        }}
                      />
                      <span className="tb-label">tracks</span>
                    </div>

                    <div
                      className="ph-dropdown-label"
                      style={{ marginTop: 10 }}
                    >
                      Regeneration
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        marginTop: 4,
                      }}
                    >
                      <select
                        className="ph-select"
                        value={playlist.regenerationMode ?? "manual"}
                        onChange={(e) =>
                          onSetRegenerationMode?.(
                            e.target.value as NonNullable<
                              PlaylistRecord["regenerationMode"]
                            >,
                          )
                        }
                      >
                        {REGEN_MODES.map((m) => (
                          <option key={m.value} value={m.value}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {onSetTemplateSourceFilters && (
                      <>
                        <div
                          className="ph-dropdown-label"
                          style={{ marginTop: 12 }}
                        >
                          Source Rules
                        </div>
                        <div className="ph-template-filters">
                          <div className="ph-tf-row">
                            <span className="ph-tf-label">Grouping</span>
                            <input
                              className="ph-select"
                              style={{ fontSize: 11 }}
                              placeholder="any"
                              value={
                                playlist.templateSourceFilters?.grouping ?? ""
                              }
                              onChange={(e) =>
                                onSetTemplateSourceFilters({
                                  ...playlist.templateSourceFilters,
                                  grouping: e.target.value || undefined,
                                })
                              }
                            />
                          </div>
                          <div className="ph-tf-row">
                            <span className="ph-tf-label">Mood</span>
                            <input
                              className="ph-select"
                              style={{ fontSize: 11 }}
                              placeholder="any"
                              value={
                                playlist.templateSourceFilters?.moodTags?.[0] ??
                                ""
                              }
                              onChange={(e) =>
                                onSetTemplateSourceFilters({
                                  ...playlist.templateSourceFilters,
                                  moodTags: e.target.value
                                    ? [e.target.value]
                                    : undefined,
                                })
                              }
                            />
                          </div>
                          <div className="ph-tf-row">
                            <span className="ph-tf-label">Genre</span>
                            <input
                              className="ph-select"
                              style={{ fontSize: 11 }}
                              placeholder="any"
                              value={
                                playlist.templateSourceFilters?.genre ?? ""
                              }
                              onChange={(e) =>
                                onSetTemplateSourceFilters({
                                  ...playlist.templateSourceFilters,
                                  genre: e.target.value || undefined,
                                })
                              }
                            />
                          </div>
                          <div className="ph-tf-row">
                            <span className="ph-tf-label">Owner</span>
                            <select
                              className="ph-select"
                              value={
                                playlist.templateSourceFilters?.sourceOwner ??
                                "any"
                              }
                              onChange={(e) =>
                                onSetTemplateSourceFilters({
                                  ...playlist.templateSourceFilters,
                                  sourceOwner: e.target
                                    .value as LibraryTrackFilters["sourceOwner"],
                                })
                              }
                            >
                              <option value="any">Any</option>
                              <option value="studiorich">StudioRich</option>
                              <option value="external">External</option>
                              <option value="unknown">Unknown</option>
                            </select>
                          </div>
                          <div className="ph-tf-row">
                            <span className="ph-tf-label">Min Rating</span>
                            <select
                              className="ph-select"
                              value={String(
                                playlist.templateSourceFilters?.minRating ?? 0,
                              )}
                              onChange={(e) =>
                                onSetTemplateSourceFilters({
                                  ...playlist.templateSourceFilters,
                                  minRating:
                                    parseInt(e.target.value) || undefined,
                                })
                              }
                            >
                              <option value="0">Any</option>
                              {[1, 2, 3, 4, 5].map((n) => (
                                <option key={n} value={String(n)}>
                                  {"★".repeat(n)}+
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </>
                    )}
                    {onCreateFromTemplate && (
                      <button
                        className="tb-btn ph-btn-primary"
                        style={{ marginTop: 12, width: "100%" }}
                        onClick={() => {
                          onCreateFromTemplate();
                          setShowSettings(false);
                        }}
                      >
                        Generate Playlist
                      </button>
                    )}
                  </>
                )}

                {/* Artwork Display Mode (0706A) */}
                {onArtworkDisplayModeChange && (
                  <>
                    <div className="ph-dropdown-label" style={{ marginTop: 12 }}>
                      Artwork Display
                    </div>
                    <div className="ph-mode-btns" style={{ marginTop: 4 }}>
                      {([
                        { value: "cover_only" as const, label: "Cover Only" },
                        { value: "banner" as const, label: "Banner" },
                        { value: "full_atmosphere" as const, label: "Atmosphere" },
                      ]).map(({ value, label }) => (
                        <button
                          key={value}
                          className={`ph-mode-btn${(playlist.artworkDisplayMode ?? "cover_only") === value ? " active" : ""}`}
                          onClick={() => onArtworkDisplayModeChange(value)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {/* Source policy (0630C) */}
                {(onSourcePolicyChange || onAllowedSourceOwnersChange) && (
                  <>
                    <div className="ph-dropdown-label" style={{ marginTop: 12 }}>
                      Source Policy
                    </div>
                    <select
                      className="ph-select"
                      style={{ marginTop: 4, width: "100%" }}
                      value={playlist.sourcePolicy ?? ""}
                      onChange={(e) =>
                        onSourcePolicyChange?.(
                          (e.target.value as PlaylistSourcePolicy) || undefined
                        )
                      }
                    >
                      <option value="">— any source —</option>
                      <option value="studiorich_only">StudioRich only</option>
                      <option value="external_only">External only</option>
                      <option value="mixed">Mixed</option>
                      <option value="unknown_review">Unknown / review</option>
                    </select>
                    <div className="ph-dropdown-label" style={{ marginTop: 8 }}>
                      Source Pool
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                      {([
                        { owner: "studiorich" as TrackSourceOwner, label: "CAT" },
                        { owner: "external" as TrackSourceOwner, label: "EXT" },
                      ]).map(({ owner, label }) => {
                        const checked = (playlist.allowedSourceOwners ?? ["studiorich"]).includes(owner);
                        const current = playlist.allowedSourceOwners ?? ["studiorich"];
                        const wouldBeEmpty = checked && current.filter((x) => x !== owner).length === 0;
                        return (
                          <button
                            key={owner}
                            className={`npd-source-btn${checked ? " npd-source-btn--on" : ""}`}
                            disabled={wouldBeEmpty}
                            title={wouldBeEmpty ? "At least one source must be enabled" : undefined}
                            onClick={() => {
                              const next = checked
                                ? current.filter((x) => x !== owner)
                                : [...current, owner];
                              onAllowedSourceOwnersChange?.(next.length > 0 ? next : undefined);
                            }}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </DropdownPortal>
          </div>
        </div>

        {/* Empty playlist guided setup */}
        {isDraftEmpty && (
          <div className="ph-empty-setup">
            <div className="ph-empty-steps">
              <div className="ph-empty-step">
                <span className="ph-empty-step-num">1</span>
                <div className="ph-empty-step-body">
                  <div className="ph-empty-step-title">Add crate sources</div>
                  <div className="ph-empty-step-desc">Choose one or more crates as the track pool for this playlist.</div>
                </div>
              </div>
              <div className="ph-empty-step">
                <span className="ph-empty-step-num">2</span>
                <div className="ph-empty-step-body">
                  <div className="ph-empty-step-title">Generate playlist options</div>
                  <div className="ph-empty-step-desc">MUSIC scores and arranges candidate tracks from your crate pool.</div>
                </div>
              </div>
              <div className="ph-empty-step">
                <span className="ph-empty-step-num">3</span>
                <div className="ph-empty-step-body">
                  <div className="ph-empty-step-title">Accept a playlist output</div>
                  <div className="ph-empty-step-desc">Pick the option you like and confirm it as the playlist.</div>
                </div>
              </div>
            </div>
            {onAddCrate && (() => {
              const availableCrates = crates.filter((c) => !attachedCrateIds.has(c.id));
              return (
                <div className="ph-empty-crate-action">
                  <button
                    ref={addCrateBtnRef}
                    className="ph-empty-add-crate"
                    onClick={(e) => { e.stopPropagation(); setShowCratePicker((v) => !v); }}
                  >
                    + Add Crate
                  </button>
                  <DropdownPortal
                    open={showCratePicker}
                    anchorRef={addCrateBtnRef}
                    align="left"
                    onClose={() => setShowCratePicker(false)}
                  >
                    <div className="ph-crate-picker" onClick={(e) => e.stopPropagation()}>
                      {availableCrates.length === 0 && (
                        <div className="ph-crate-picker-empty">No crates available — create a crate first.</div>
                      )}
                      {availableCrates.map((c) => (
                        <button
                          key={c.id}
                          className="ph-crate-picker-item"
                          onClick={() => { onAddCrate(c.id); setShowCratePicker(false); }}
                        >
                          ◈ {c.name}
                        </button>
                      ))}
                    </div>
                  </DropdownPortal>
                </div>
              );
            })()}
          </div>
        )}

        {/* Accepted mode: compact crate pool summary — hidden (redundant with crate chips) */}

        {/* Crate Sources — hidden when in draft_empty guided setup */}
        {!isDraftEmpty && (onAddCrate || (playlist.crateIds && playlist.crateIds.length > 0)) && (() => {
          const availableCrates = crates.filter((c) => !attachedCrateIds.has(c.id));
          return (
            <div className="ph-crate-sources">
              <div className="ph-crate-row">
                <span className="ph-crate-label">Crates</span>
                <div className="ph-crate-chips">
                  {attachedCrates.map((c) => {
                    const cnt = crateCountsById.get(c.id) ?? 0;
                    const allTags = allTagsCountById.get(c.id);
                    const staleDelta = allTags != null ? allTags - cnt : 0;
                    const isStale = staleDelta > 10 && cnt < allTags! * 0.8;
                    const vt = getCrateVisualToken(c, []);
                    const accentVar = vt.colorToken ? `var(${vt.colorToken})` : undefined;
                    return (
                      <span
                        key={c.id}
                        className="ph-crate-chip"
                        style={accentVar ? { "--chip-accent": accentVar } as React.CSSProperties : undefined}
                      >
                        {onOpenCrate
                          ? <button className="ph-crate-chip-label" title="Open crate" onClick={() => onOpenCrate(c.id)}>{c.name}</button>
                          : <span className="ph-crate-chip-label">{c.name}</span>}
                        {cnt > 0 && <span className="ph-crate-chip-count">{cnt}</span>}
                        {isStale && <span className="ph-crate-chip-warn" title={`${staleDelta} tracks excluded by source filter`}>⚠</span>}
                        {onRemoveCrate && (
                          <button className="ph-crate-chip-remove" title="Remove crate" onClick={() => onRemoveCrate(c.id)}>×</button>
                        )}
                      </span>
                    );
                  })}
                  {!hasCrates && onAddCrate && (
                    <span className="ph-crate-empty-hint">No crates selected — add one or more crates to generate playlist options.</span>
                  )}
                  {onAddCrate && (
                    <div className="ph-crate-add-wrap">
                      <button
                        ref={addCrateBtnRef}
                        className="ph-crate-add-btn"
                        onClick={(e) => { e.stopPropagation(); setShowCratePicker((v) => !v); }}
                      >
                        + Add Crate
                      </button>
                      <DropdownPortal
                        open={showCratePicker}
                        anchorRef={addCrateBtnRef}
                        align="left"
                        onClose={() => setShowCratePicker(false)}
                      >
                        <div className="ph-crate-picker" onClick={(e) => e.stopPropagation()}>
                          {availableCrates.length === 0 && (
                            <div className="ph-crate-picker-empty">All crates already attached</div>
                          )}
                          {availableCrates.map((c) => (
                            <button
                              key={c.id}
                              className="ph-crate-picker-item"
                              onClick={() => { onAddCrate(c.id); setShowCratePicker(false); }}
                            >
                              ◈ {c.name}
                            </button>
                          ))}
                        </div>
                      </DropdownPortal>
                    </div>
                  )}
                </div>
              </div>

              {/* Stale CTA — shown in crate row when options are stale in accepted mode */}
              {isOptionsStale && isAcceptedMode && onOpenOptionsPopup && (
                <button className="ph-stale-cta" onClick={onOpenOptionsPopup}>
                  Options stale · Regenerate
                </button>
              )}

              {/* Options panel — suppressed in accepted mode (access via Flow panel popup) */}
              {hasCrates && poolCount > 0 && onGenerateOptions && !isAcceptedMode && pathOptions.length === 0 && (
                <PlaylistPathOptionsPanel
                  options={pathOptions}
                  acceptedOptionId={acceptedPathOptionId}
                  crates={crates}
                  tracksById={tracksById}
                  targetDurationSeconds={playlist.targetDurationMinutes * 60}
                  isGenerating={isGeneratingOptions}
                  onGenerate={onGenerateOptions}
                  onAccept={(id) => onAcceptOption?.(id)}
                  onDuplicate={(id) => onDuplicateOption?.(id)}
                  currentMetadataRevision={currentMetadataRevision}
                  metadataRepairImpact={metadataRepairImpact}
                  isAcceptedMode={false}
                  isCrateOptionsOpen={false}
                  hideAcceptedBar={true}
                />
              )}
              {hasCrates && poolCount > 0 && onGenerateOptions && !isAcceptedMode && pathOptions.length > 0 && (
                <div className="ph-review-options-cta">
                  <span className="ph-review-options-count">{pathOptions.length} option{pathOptions.length !== 1 ? "s" : ""} generated</span>
                  <button className="ph-review-options-btn" onClick={onOpenOptionsPopup}>
                    Review Options
                  </button>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Identity panel */}
      {showIdentity && (
        <PlaylistIdentityPanel
          playlist={playlist}
          onClose={() => setShowIdentity(false)}
          onTitleChange={onTitleChange}
          onDescriptionChange={onDescriptionChange}
          onCoverImageChange={onCoverImageChange}
          onBackgroundImageChange={onBackgroundImageChange}
          onBroadcastBgChange={onBroadcastBgChange}
          onMoodTagsChange={onMoodTagsChange}
        />
      )}

      {/* Playlist Analyzer Review (0712_MUSIC_Playlist_Analyzer_Review + 0713 repair integration) */}
      {showAnalyzerReview && (
        <PlaylistAnalyzerReviewView
          playlist={playlist}
          libraryTracks={libraryTracks}
          crates={crates}
          libraryGaps={libraryGaps}
          onReanalyzePlaylist={() => onReanalyzePlaylist?.()}
          reanalysisProgress={reanalysisProgress}
          reanalysisRunning={reanalysisRunning}
          onClose={() => setShowAnalyzerReview(false)}
        />
      )}

      {/* Playlist Local Repair (0713_MUSIC_Playlist_Local_Repair_And_Gap_Analysis) */}
      {showRepairPanel && (
        <PlaylistRepairPanel
          playlist={playlist}
          libraryTracks={libraryTracks}
          crates={crates}
          libraryGaps={libraryGaps}
          onLibraryGapsChange={(gaps) => onLibraryGapsChange?.(gaps)}
          onReplaceSlot={(trackId, slotIndex) => onReplaceSlot?.(trackId, slotIndex)}
          onRepairStateChange={(state) => onRepairStateChange?.(state)}
          onReanalyzePlaylist={() => onReanalyzePlaylist?.()}
          reanalysisProgress={reanalysisProgress}
          reanalysisRunning={reanalysisRunning}
          onPreparationChange={(preparation) => onPreparationChange?.(preparation)}
          onClose={() => setShowRepairPanel(false)}
        />
      )}

      {/* Playlist Transition Preparation (0714_MUSIC_Playlist_Transition_Preparation) */}
      {showPreparationPanel && (
        <PlaylistPreparationPanel
          playlist={playlist}
          libraryTracks={libraryTracks}
          onPreparationChange={(preparation) => onPreparationChange?.(preparation)}
          onClose={() => setShowPreparationPanel(false)}
        />
      )}

      {/* Confirm regenerate */}
      {confirmRegen && (
        <div
          className="export-modal-overlay"
          onClick={() => setConfirmRegen(false)}
        >
          <div
            className="export-modal"
            style={{ maxWidth: 380 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="export-modal-header">
              <span>{hasCrates ? "Regenerate From Crate?" : "Regenerate Playlist From Curve?"}</span>
              <button
                className="export-modal-close"
                onClick={() => setConfirmRegen(false)}
              >
                ✕
              </button>
            </div>
            <div
              style={{
                padding: "14px 16px",
                fontSize: 12,
                color: "var(--text-mid)",
                lineHeight: 1.5,
              }}
            >
              {hasCrates
                ? "This will rebuild Playlist Output from the selected crate pool using the active Flow Curve. Manual edits and slot order will be replaced. Locked tracks will stay fixed."
                : "This will rebuild track assignments from the active flow curve. Manual edits and slot order will be replaced. Locked tracks will stay fixed."}
            </div>
            <div className="export-modal-footer">
              <button className="tb-btn" onClick={() => setConfirmRegen(false)}>
                Cancel
              </button>
              <button
                className="tb-btn ph-btn-primary"
                onClick={() => {
                  onRegenerateFromCurve();
                  setConfirmRegen(false);
                }}
              >
                {hasCrates ? "Regenerate From Crate" : "Regenerate"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm preset replacement */}
      {confirmPreset && (
        <div
          className="export-modal-overlay"
          onClick={() => setConfirmPreset(null)}
        >
          <div
            className="export-modal"
            style={{ maxWidth: 360 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="export-modal-header">
              <span>Replace Flow Curve?</span>
              <button
                className="export-modal-close"
                onClick={() => setConfirmPreset(null)}
              >
                ✕
              </button>
            </div>
            <div
              style={{
                padding: "14px 16px",
                fontSize: 12,
                color: "var(--text-mid)",
                lineHeight: 1.5,
              }}
            >
              Replace current flow curve with "
              {PRESET_SHAPES[confirmPreset].label}"?
              <br />
              <br />
              This will overwrite the edited curve for this playlist.
            </div>
            <div className="export-modal-footer">
              <button className="tb-btn" onClick={() => setConfirmPreset(null)}>
                Cancel
              </button>
              <button
                className="tb-btn"
                onClick={() => {
                  onPresetChange(confirmPreset);
                  setConfirmPreset(null);
                  setShowCurveTools(false);
                }}
              >
                Replace Curve
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Options drawer */}
      {showOptionsDrawer && createPortal(
        <div
          className="export-modal-overlay"
          onClick={() => setShowOptionsDrawer(false)}
        >
          <div
            className="ph-options-drawer"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="export-modal-header">
              <span>Playlist Options</span>
              <button
                className="export-modal-close"
                onClick={() => setShowOptionsDrawer(false)}
              >
                ✕
              </button>
            </div>
            <div className="ph-options-drawer-body">
              {/* Playlist state + source pool header */}
              <div className="ph-drawer-state-row">
                <span className={`ph-state-badge ph-state-badge--${uiState.severity}`} title={uiState.description}>
                  {uiState.label}
                </span>
                {sourceComposition.map((k) => (
                  <SourceBadge key={k} source={k} />
                ))}
              </div>

              {/* Crate sources inside drawer */}
              <div className="ph-crate-sources ph-crate-sources--drawer">
                <div className="ph-crate-row">
                  <span className="ph-crate-label">Crate Sources</span>
                  <div className="ph-crate-chips">
                    {attachedCrates.map((c) => {
                      const cnt = crateCountsById.get(c.id) ?? 0;
                      const vt = getCrateVisualToken(c, []);
                      const accentVar = vt.colorToken ? `var(${vt.colorToken})` : undefined;
                      return (
                        <span
                          key={c.id}
                          className="ph-crate-chip"
                          style={accentVar ? { "--chip-accent": accentVar } as React.CSSProperties : undefined}
                        >
                          {onOpenCrate
                            ? <button className="ph-crate-chip-label" onClick={() => { onOpenCrate(c.id); setShowOptionsDrawer(false); }}>{c.name}</button>
                            : <span className="ph-crate-chip-label">{c.name}</span>}
                          {cnt > 0 && <span className="ph-crate-chip-count">{cnt}</span>}
                          {onRemoveCrate && (
                            <button className="ph-crate-chip-remove" onClick={() => onRemoveCrate(c.id)}>×</button>
                          )}
                        </span>
                      );
                    })}
                    {!hasCrates && <span className="ph-crate-empty-hint">No crates selected — add one or more crates to generate playlist options.</span>}
                    {onAddCrate && (() => {
                      const availableCrates = crates.filter((c) => !attachedCrateIds.has(c.id));
                      return (
                        <div className="ph-crate-add-wrap">
                          <button ref={addCrateBtnRef} className="ph-crate-add-btn" onClick={(e) => { e.stopPropagation(); setShowCratePicker((v) => !v); }}>
                            + Add Crate
                          </button>
                          <DropdownPortal
                            open={showCratePicker}
                            anchorRef={addCrateBtnRef}
                            align="left"
                            onClose={() => setShowCratePicker(false)}
                          >
                            <div className="ph-crate-picker" onClick={(e) => e.stopPropagation()}>
                              {availableCrates.length === 0 && (
                                <div className="ph-crate-picker-empty">All crates already attached</div>
                              )}
                              {availableCrates.map((c) => (
                                <button key={c.id} className="ph-crate-picker-item" onClick={() => { onAddCrate(c.id); setShowCratePicker(false); }}>
                                  ◈ {c.name}
                                </button>
                              ))}
                            </div>
                          </DropdownPortal>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* Stale banner for crate changes */}
              {playlistOptionsStaleReason === "crate_sources_changed" && (
                <div className="ppo-stale-banner">
                  <div className="ppo-stale-banner-main">
                    Crate sources changed after these options were generated. Regenerate Options to score the current crate pool.
                  </div>
                  <div className="ppo-stale-note">
                    Existing accepted playlist output will not change until you accept a new option.
                  </div>
                </div>
              )}
              {playlistOptionsStaleReason === "track_pool_changed" && (
                <div className="ppo-stale-banner">
                  <div className="ppo-stale-banner-main">
                    The crate track pool changed after these options were generated. Regenerate Options to rebuild candidates.
                  </div>
                </div>
              )}

              {/* Mood Target placeholder */}
              <div className="ph-mood-target">
                <div className="ph-mood-target-label">Mood Target</div>
                {playlist.mood?.tags && playlist.mood.tags.length > 0 ? (
                  <div className="ph-mood-target-chips">
                    {playlist.mood.tags.map((tag: string) => (
                      <span key={tag} className="ph-mood-target-chip">{tag}</span>
                    ))}
                  </div>
                ) : (
                  <div className="ph-mood-target-empty">Mood weights not configured yet.</div>
                )}
              </div>

              {/* Broadcast placeholder */}
              <div className="ph-broadcast-placeholder">
                <div className="ph-broadcast-label">Broadcast</div>
                <button className="ph-broadcast-btn" disabled title="Full playlist-to-broadcast handoff coming soon">
                  Prepare Countdown Screen
                  <span className="ph-broadcast-soon">coming soon</span>
                </button>
              </div>

              {/* Options panel */}
              {onGenerateOptions && (hasCrates && poolCount > 0 ? (
                <PlaylistPathOptionsPanel
                  options={pathOptions}
                  acceptedOptionId={acceptedPathOptionId}
                  crates={crates}
                  tracksById={tracksById}
                  targetDurationSeconds={playlist.targetDurationMinutes * 60}
                  isGenerating={isGeneratingOptions}
                  onGenerate={onGenerateOptions}
                  onAccept={(id) => { onAcceptOption?.(id); setShowOptionsDrawer(false); }}
                  onDuplicate={(id) => { onDuplicateOption?.(id); setShowOptionsDrawer(false); }}
                  currentMetadataRevision={currentMetadataRevision}
                  metadataRepairImpact={metadataRepairImpact}
                  isAcceptedMode={false}
                />
              ) : (
                <div className="ph-options-no-crates">
                  {!hasCrates
                    ? "Add at least one crate to generate playlist options."
                    : "No eligible tracks in selected crates. Add tracks to a crate first."}
                </div>
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
