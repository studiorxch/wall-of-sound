type Props = {
  routeStatus?: string;
  trackIndex?: number | null;
  totalTracks?: number;
  source?: string;
  playlistTitle?: string;
};

const SOURCE_LABELS: Record<string, string> = {
  "configured":        "CONFIGURED",
  "wos-local-fallback": "WOS LOCAL",
  "playlist":          "PLAYLIST",
  "missing":           "NONE",
};

export function BroadcastMicrographicsGrid({
  routeStatus,
  trackIndex,
  totalTracks,
  source,
  playlistTitle,
}: Props) {
  const rows: { label: string; value: string }[] = [];

  if (routeStatus) {
    const statusLabel =
      routeStatus === "live"      ? "ROUTES LIVE" :
      routeStatus === "launching" ? "LAUNCHING"   :
      routeStatus === "error"     ? "ERROR"        :
      "IDLE";
    rows.push({ label: "STATUS", value: statusLabel });
  }

  if (trackIndex != null && totalTracks != null && totalTracks > 0) {
    rows.push({
      label: "TRACK",
      value: `${String(trackIndex + 1).padStart(2, "0")} / ${String(totalTracks).padStart(2, "0")}`,
    });
  }

  if (source && source !== "missing") {
    rows.push({ label: "SOURCE", value: SOURCE_LABELS[source] ?? source.toUpperCase() });
  }

  if (playlistTitle) {
    rows.push({ label: "CHANNEL", value: playlistTitle.toUpperCase().slice(0, 18) });
  }

  if (rows.length === 0) return null;

  return (
    <div className="bmg-grid">
      {rows.map(({ label, value }) => (
        <div key={label} className="bmg-row">
          <span className="bmg-label">{label}</span>
          <span className="bmg-value">{value}</span>
        </div>
      ))}
    </div>
  );
}
