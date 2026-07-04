import { useRef, useState } from "react";
import type { Track } from "../data/trackTypes";
import { parseCsvTracks } from "../data/importCsv";
import { loadProjectFromJson } from "../data/projectStorage";
import type { PlaylistProject } from "../data/playlistTypes";

type Props = {
  onTracksImported: (tracks: Track[]) => void;
  onProjectLoaded: (project: PlaylistProject) => void;
};

export function ImportPanel({ onTracksImported, onProjectLoaded }: Props) {
  const csvRef = useRef<HTMLInputElement>(null);
  const jsonRef = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [info, setInfo] = useState<string>("");

  function handleCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const { tracks, errors } = parseCsvTracks(text);
      setErrors(errors);
      if (tracks.length > 0) {
        setInfo(`Imported ${tracks.length} track${tracks.length !== 1 ? "s" : ""}.`);
        onTracksImported(tracks);
      } else {
        setInfo("");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function handleJson(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const project = loadProjectFromJson(text);
      if (project) {
        setInfo(`Project "${project.title}" loaded.`);
        setErrors([]);
        onProjectLoaded(project);
      } else {
        setErrors(["Could not parse project JSON."]);
        setInfo("");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  return (
    <div className="panel import-panel">
      <h3>Import</h3>
      <div className="import-row">
        <button onClick={() => csvRef.current?.click()}>Import CSV Track Pool</button>
        <input ref={csvRef} type="file" accept=".csv" style={{ display: "none" }} onChange={handleCsv} />
        <button onClick={() => jsonRef.current?.click()}>Load Project JSON</button>
        <input ref={jsonRef} type="file" accept=".json" style={{ display: "none" }} onChange={handleJson} />
      </div>
      {info && <p className="info-msg">{info}</p>}
      {errors.length > 0 && (
        <ul className="error-list">
          {errors.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      )}
    </div>
  );
}
