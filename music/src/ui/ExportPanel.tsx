import type { PlaylistProject } from "../data/playlistTypes";
import { exportProjectJson, exportPlaylistCsv, exportM3u, downloadFile } from "../data/exportPlaylist";
import { useState } from "react";

type Props = { project: PlaylistProject };

export function ExportPanel({ project }: Props) {
  const [m3uWarning, setM3uWarning] = useState<string[]>([]);

  function handleJson() {
    downloadFile(`${project.title}.json`, exportProjectJson(project), "application/json");
  }

  function handleCsv() {
    downloadFile(`${project.title}.csv`, exportPlaylistCsv(project), "text/csv");
  }

  function handleM3u() {
    const { content, report } = exportM3u({ tracks: project.tracks, slots: project.slots, title: project.title });
    downloadFile(`${project.title}.m3u`, content, "audio/x-mpegurl");
    const skippedTitles = report.items
      .filter((item) => ["empty_slot", "no_path", "missing_file", "unsupported_extension", "unknown_error"].includes(item.status))
      .map((item) => item.title ?? `slot ${item.slotIndex + 1}`);
    setM3uWarning(skippedTitles);
  }

  return (
    <div className="panel export-panel">
      <h3>Export</h3>
      <div className="export-row">
        <button onClick={handleJson}>Export JSON Project</button>
        <button onClick={handleCsv}>Export CSV Playlist</button>
        <button onClick={handleM3u}>Export M3U</button>
      </div>
      {m3uWarning.length > 0 && (
        <div className="export-warning">
          <strong>M3U: {m3uWarning.length} track(s) skipped (no filePath):</strong>
          <ul>{m3uWarning.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
