import { useState } from "react";
import type {
  PlaylistRecord,
  PlaylistImage,
  PlaylistBroadcastIdentity,
  PlayColorTheme,
  PlaylistSourcePolicy,
} from "../data/playProjectTypes";
import type { Track, TrackSourceOwner } from "../data/trackTypes";
import type { CurvePresetType } from "../data/flowCurveTypes";
import type { MusicSourcePool } from "../data/sourcePoolTypes";
import type { LibraryTrackFilters } from "../logic/libraryFilters";
import { PlaylistIdentityPanel } from "./PlaylistIdentityPanel";
import { fmtUpdatedLabel, fmtShortDate } from "../logic/dateFormat";

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
  totalTrackCount: number;
  totalDurationSeconds: number;
  flash?: string;
  onTitleChange: (t: string) => void;
  onDescriptionChange: (d: string) => void;
  onTargetDurationChange: (minutes: number) => void;
  onPresetChange: (p: CurvePresetType) => void;
  onFillMissingTime: () => void;
  onRegenerateFromCurve: () => void;
  onExportM3u: () => void;
  onCoverImageChange: (img: PlaylistImage | undefined) => void;
  onBackgroundImageChange: (img: PlaylistImage | undefined) => void;
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
  children?: React.ReactNode;
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

export function PlaylistHeader({
  playlist,
  libraryTracks,
  totalTrackCount,
  totalDurationSeconds,
  flash,
  onTitleChange,
  onDescriptionChange,
  onTargetDurationChange,
  onPresetChange,
  onFillMissingTime,
  onRegenerateFromCurve,
  onExportM3u,
  onCoverImageChange,
  onBackgroundImageChange,
  onAccentColorChange,
  onMoodTagsChange,
  onBroadcastIdentityChange,
  sourcePools = [],
  onCreateSourcePool,
  onSetPlaylistRole,
  onSetSourcePoolId,
  onSetTargetTrackCount,
  onSetRegenerationMode,
  onSetTemplateSourceFilters,
  onCreateFromTemplate,
  onColorThemesChange,
  onSourcePolicyChange,
  onAllowedSourceOwnersChange,
  onAddMusic,
  children,
}: Props) {
  const [showCurveTools, setShowCurveTools] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showIdentity, setShowIdentity] = useState(false);
  const [confirmPreset, setConfirmPreset] = useState<CurvePresetType | null>(
    null,
  );
  const [confirmRegen, setConfirmRegen] = useState(false);

  const tracksById = new Map(libraryTracks.map((t) => [t.trackId, t]));
  const assignedSlots = playlist.slots.filter((s) => s.assignedTrackId);
  const totalDur = assignedSlots.reduce(
    (sum, s) =>
      sum + (tracksById.get(s.assignedTrackId!)?.durationSeconds ?? 0),
    0,
  );
  const targetSecs = playlist.targetDurationMinutes * 60;
  const count = assignedSlots.length;

  const role = playlist.playlistRole ?? "static";
  const isTemplate = role === "template";
  const isGenerated = role === "event_generated";

  let statsStr = `${count} track${count !== 1 ? "s" : ""} · ${fmtDur(totalDur)}`;
  if (targetSecs > 0) {
    const diff = totalDur - targetSecs;
    if (diff < -30)
      statsStr += ` · target ${fmtDur(targetSecs)} · missing ${fmtDur(-diff)}`;
    else if (diff > 30)
      statsStr += ` · target ${fmtDur(targetSecs)} · +${fmtDur(diff)} buffer`;
    else if (targetSecs > 0)
      statsStr += ` · target ${fmtDur(targetSecs)} · ✓ on target`;
  }

  const presetType = playlist.curve.presetType;

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
              {statsStr}
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

      {/* Curve canvas + right-side tool stack */}
      <div className="ph-curve-row" onClick={(e) => e.stopPropagation()}>
        <div className="ph-curve-slot">{children}</div>

        <div className="ph-tool-stack">
          {/* Fill Time */}
          <button
            className="ph-tool-btn"
            onClick={onFillMissingTime}
            title="Fill missing time with eligible tracks"
          >
            Fill Time
          </button>

          {/* Curve — shape presets */}
          <div className="ph-dropdown ph-tool-dropdown">
            <button
              className="ph-tool-btn"
              onClick={(e) => {
                e.stopPropagation();
                setShowCurveTools((v) => !v);
                setShowSettings(false);
              }}
              title="Curve shape presets + regenerate"
            >
              Curve
            </button>
            {showCurveTools && (
              <div
                className="ph-dropdown-panel ph-dropdown-panel-right"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="ph-dropdown-label">Templates</div>
                <div className="ph-preset-row">
                  {PRESET_ORDER.map((p) => {
                    const shape = PRESET_SHAPES[p];
                    return (
                      <button
                        key={p}
                        className={`tb-preset-btn${presetType === p ? " active" : ""}`}
                        title={shape.label}
                        onClick={() => handlePresetClick(p)}
                      >
                        <svg
                          viewBox="0 0 28 16"
                          width="28"
                          height="16"
                          fill="none"
                        >
                          <path
                            d={shape.path}
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    );
                  })}
                </div>
                <button
                  className="tb-btn ph-btn-primary"
                  style={{ marginTop: 10, width: "100%" }}
                  onClick={() => {
                    setConfirmRegen(true);
                    setShowCurveTools(false);
                  }}
                >
                  Regenerate From Curve
                </button>
              </div>
            )}
          </div>

          {/* M3U export */}
          <button
            className="ph-tool-btn"
            onClick={onExportM3u}
            title="Export playlist as M3U"
          >
            M3U
          </button>

          {/* Form — identity / profile editor */}
          <button
            className="ph-tool-btn"
            onClick={() => setShowIdentity(true)}
            title="Edit playlist profile and identity"
          >
            Form
          </button>

          {/* Add Music */}
          {onAddMusic && (
            <button
              className="ph-tool-btn ph-tool-btn--add-music"
              onClick={onAddMusic}
              title="Browse and add tracks to this playlist"
            >
              + Music
            </button>
          )}

          {/* Settings dropdown */}
          <div className="ph-dropdown ph-tool-dropdown">
            <button
              className="ph-tool-btn"
              onClick={(e) => {
                e.stopPropagation();
                setShowSettings((v) => !v);
                setShowCurveTools(false);
              }}
              title="Playlist settings"
            >
              Settings
            </button>
            {showSettings && (
              <div
                className="ph-dropdown-panel ph-dropdown-panel-right"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="ph-dropdown-label">Target Duration</div>
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
            )}
          </div>
        </div>
      </div>

      {/* Identity panel */}
      {showIdentity && (
        <PlaylistIdentityPanel
          playlist={playlist}
          totalTrackCount={totalTrackCount}
          totalDurationSeconds={totalDurationSeconds}
          onClose={() => setShowIdentity(false)}
          onTitleChange={onTitleChange}
          onDescriptionChange={onDescriptionChange}
          onCoverImageChange={onCoverImageChange}
          onBackgroundImageChange={onBackgroundImageChange}
          onMoodTagsChange={onMoodTagsChange}
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
              <span>Regenerate Playlist From Curve?</span>
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
              This will rebuild track assignments from the active flow curve.
              <br />
              <br />
              Manual edits and slot order will be replaced. Locked tracks will
              stay fixed.
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
                Regenerate
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
    </div>
  );
}
