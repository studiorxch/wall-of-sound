// Broadcast cards are identity/title surfaces — cinematic, not analytical.
// Do NOT render FlowCurveCanvas here. Flow graphs belong in Editor and Broadcast HUD modes.
import { useState } from "react";
import type { PlaylistRecord } from "../data/playProjectTypes";
import type {
  BroadcastCardVariant,
  BroadcastCardBackgroundSource,
} from "../data/playProjectTypes";

const VARIANT_LABELS: Record<BroadcastCardVariant, string> = {
  now_entering: "NOW ENTERING",
  playing_next: "PLAYING NEXT",
  live_set: "LIVE SET",
  release_event: "RELEASE EVENT",
};

function fmtDur(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function CardCoverThumb({
  playlist,
  size,
}: {
  playlist: PlaylistRecord;
  size: number;
}) {
  const [err, setErr] = useState(false);
  const src = playlist.coverImage?.src;
  const accent = playlist.accentColor ?? "var(--accent)";
  const initials = playlist.title
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  if (src && !err) {
    return (
      <img
        src={src}
        alt={playlist.title}
        className="bc-cover-img"
        style={{ width: size, height: size }}
        onError={() => setErr(true)}
      />
    );
  }
  return (
    <div
      className="bc-cover-placeholder"
      style={{
        width: size,
        height: size,
        background: accent,
        fontSize: size * 0.3,
      }}
    >
      {initials || "♫"}
    </div>
  );
}

type Props = {
  playlist: PlaylistRecord;
  totalTrackCount: number;
  totalDurationSeconds: number;
  onClose: () => void;
};

export function BroadcastCardPreview({
  playlist,
  totalTrackCount,
  totalDurationSeconds,
  onClose,
}: Props) {
  const [variant, setVariant] = useState<BroadcastCardVariant>("now_entering");
  const [bgSource, setBgSource] =
    useState<BroadcastCardBackgroundSource>("playlist");
  const [fullscreen, setFullscreen] = useState(false);

  const accent = playlist.accentColor ?? "var(--accent)";
  const tags = playlist.mood?.tags ?? [];

  const bgSrc =
    bgSource === "playlist"
      ? playlist.backgroundImage?.src
      : bgSource === "cover_blur"
        ? playlist.coverImage?.src
        : undefined;

  const statsStr = [
    totalTrackCount > 0 &&
      `${totalTrackCount} track${totalTrackCount !== 1 ? "s" : ""}`,
    totalDurationSeconds > 0 && fmtDur(totalDurationSeconds),
    playlist.targetDurationMinutes > 0 &&
    totalDurationSeconds / 60 < playlist.targetDurationMinutes * 0.95
      ? `target ${fmtDur(playlist.targetDurationMinutes * 60)}`
      : undefined,
  ]
    .filter(Boolean)
    .join(" · ");

  const card = (
    <div
      className={`bc-card${fullscreen ? " bc-card-fullscreen" : ""}`}
      style={{ borderColor: accent }}
    >
      {/* Background */}
      {bgSrc && (
        <div
          className={`bc-bg${bgSource === "cover_blur" ? " bc-bg-blur" : ""}`}
          style={{ backgroundImage: `url(${bgSrc})` }}
        />
      )}
      <div className="bc-veil" />

      {/* Top accent line */}
      <div className="bc-accent-line" style={{ background: accent }} />

      {/* Content */}
      <div className="bc-content">
        <div className="bc-eyebrow" style={{ color: accent }}>
          {VARIANT_LABELS[variant]}
        </div>

        <div className="bc-identity-row">
          <CardCoverThumb playlist={playlist} size={fullscreen ? 120 : 72} />
          <div className="bc-meta">
            <div className="bc-title">{playlist.title}</div>
            {playlist.description && (
              <div className="bc-description">{playlist.description}</div>
            )}
            {tags.length > 0 && (
              <div className="bc-tags">
                {tags.map((t) => (
                  <span
                    key={t}
                    className="bc-tag"
                    style={{ borderColor: accent, color: accent }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
            {statsStr && <div className="bc-stats">{statsStr}</div>}
          </div>
        </div>
      </div>

      {/* Bottom branding */}
      <div className="bc-branding">MUSIC</div>

      {/* Bottom accent line */}
      <div
        className="bc-accent-line bc-accent-line-bottom"
        style={{ background: accent }}
      />
    </div>
  );

  return (
    <div className="export-modal-overlay" onClick={onClose}>
      <div
        className="export-modal bc-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="export-modal-header">
          <span>Broadcast Card Preview</span>
          <button className="export-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Controls */}
        <div className="bc-controls">
          <div className="bc-control-group">
            <span className="bc-control-label">Variant</span>
            <div className="bc-btn-row">
              {(Object.keys(VARIANT_LABELS) as BroadcastCardVariant[]).map(
                (v) => (
                  <button
                    key={v}
                    className={`bc-pill${variant === v ? " active" : ""}`}
                    style={
                      variant === v
                        ? { borderColor: accent, color: accent }
                        : {}
                    }
                    onClick={() => setVariant(v)}
                  >
                    {VARIANT_LABELS[v]}
                  </button>
                ),
              )}
            </div>
          </div>
          <div className="bc-control-group">
            <span className="bc-control-label">Background</span>
            <div className="bc-btn-row">
              {(
                [
                  "playlist",
                  "cover_blur",
                  "dark",
                ] as BroadcastCardBackgroundSource[]
              ).map((s) => (
                <button
                  key={s}
                  className={`bc-pill${bgSource === s ? " active" : ""}`}
                  style={
                    bgSource === s ? { borderColor: accent, color: accent } : {}
                  }
                  onClick={() => setBgSource(s)}
                >
                  {s === "playlist"
                    ? "Playlist BG"
                    : s === "cover_blur"
                      ? "Cover Blur"
                      : "Dark"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 16:9 card preview */}
        <div className="bc-preview-wrap">{card}</div>

        <div className="export-modal-footer">
          <button className="tb-btn" onClick={() => setFullscreen(!fullscreen)}>
            {fullscreen ? "Exit Fullscreen" : "Fullscreen Preview"}
          </button>
          <button className="tb-btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>

      {/* Fullscreen overlay sits outside the modal */}
      {fullscreen && (
        <div
          className="bc-fullscreen-overlay"
          onClick={() => setFullscreen(false)}
        >
          <div
            className="bc-fullscreen-frame"
            onClick={(e) => e.stopPropagation()}
          >
            {card}
          </div>
          <button className="bc-fs-exit" onClick={() => setFullscreen(false)}>
            ✕ Exit
          </button>
        </div>
      )}
    </div>
  );
}
