import { useState, useEffect, useRef } from "react";

type Props = {
  trackIndex?: number | null;
  totalTracks?: number;
  title?: string;
  artist?: string;
  playlistTitle?: string;
};

function formatMicroText(value: string | undefined): string {
  if (!value) return "";
  return value
    .trim()
    .toUpperCase()
    .replace(/&/g, "PLUS")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_");
}

export function TypedTrackIndexOverlay({
  trackIndex,
  totalTracks,
  title,
  artist,
  playlistTitle,
}: Props) {
  const [phase, setPhase] = useState<"hidden" | "expanded" | "collapsed">("hidden");
  const prevTitleRef = useRef<string | undefined>(undefined);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (title !== prevTitleRef.current) {
      prevTitleRef.current = title;
      if (!title && trackIndex == null) return;
      setPhase("expanded");
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setPhase("collapsed"), 4200);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [title, trackIndex]);

  if (phase === "hidden") return null;

  const indexStr = trackIndex != null ? String(trackIndex + 1).padStart(2, "0") : "--";
  const totalStr = totalTracks != null && totalTracks > 0
    ? String(totalTracks).padStart(2, "0")
    : "--";

  const titleFormatted = formatMicroText(title);
  const artistFormatted = formatMicroText(artist);
  const playlistFormatted = formatMicroText(playlistTitle);

  return (
    <div className={`bti-overlay bti-overlay--${phase}`}>
      <div className="bti-index">{indexStr}</div>
      <div className="bti-meta">
        {titleFormatted && (
          <div className={`bti-title${phase === "expanded" ? " bti-type-cursor" : ""}`}>
            {titleFormatted}
          </div>
        )}
        <div className="bti-submeta">
          {playlistFormatted && (
            <span className="bti-metarow">SRC&nbsp;{playlistFormatted.slice(0, 22)}</span>
          )}
          {artistFormatted && (
            <span className="bti-metarow">ART&nbsp;{artistFormatted.slice(0, 22)}</span>
          )}
          <span className="bti-metarow bti-count">{indexStr}&thinsp;/&thinsp;{totalStr}</span>
        </div>
      </div>
    </div>
  );
}
