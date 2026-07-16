import { useState, useEffect, useRef } from "react";
import type { TrackSourceOwner } from "../data/trackTypes";

export type NewPlaylistBuildMode = "manual" | "auto";

export type NewPlaylistDialogResult = {
  title: string;
  allowedSourceOwners: TrackSourceOwner[];
  buildMode: NewPlaylistBuildMode;
};

type Props = {
  defaultTitle?: string;
  onConfirm: (result: NewPlaylistDialogResult) => void;
  onCancel: () => void;
};

export function NewPlaylistDialog({ defaultTitle = "Untitled Playlist", onConfirm, onCancel }: Props) {
  const [title, setTitle] = useState(defaultTitle);
  const [catEnabled, setCatEnabled] = useState(true);
  const [extEnabled, setExtEnabled] = useState(false);
  const [buildMode, setBuildMode] = useState<NewPlaylistBuildMode>("manual");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  function handleConfirm() {
    const owners: TrackSourceOwner[] = [];
    if (catEnabled) owners.push("studiorich");
    if (extEnabled) owners.push("external");
    if (owners.length === 0) owners.push("studiorich"); // always at least one
    onConfirm({ title: title.trim() || defaultTitle, allowedSourceOwners: owners, buildMode });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleConfirm();
    if (e.key === "Escape") onCancel();
  }

  return (
    <div className="npd-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="npd-modal" onKeyDown={handleKeyDown}>
        <div className="npd-header">New Playlist</div>

        <div className="npd-field">
          <label className="npd-label">Name</label>
          <input
            ref={inputRef}
            className="npd-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Playlist name…"
          />
        </div>

        <div className="npd-field">
          <label className="npd-label">Source Pool</label>
          <div className="npd-source-row">
            <button
              className={`npd-source-btn${catEnabled ? " npd-source-btn--on" : ""}`}
              onClick={() => { if (!catEnabled || extEnabled) setCatEnabled(!catEnabled); }}
              title="Catalog tracks (studiorich)"
            >
              CAT
            </button>
            <button
              className={`npd-source-btn${extEnabled ? " npd-source-btn--on" : ""}`}
              onClick={() => { if (!extEnabled || catEnabled) setExtEnabled(!extEnabled); }}
              title="External tracks"
            >
              EXT
            </button>
            <span className="npd-source-hint">
              {catEnabled && extEnabled ? "Catalog + External" : catEnabled ? "Catalog only" : "External only"}
            </span>
          </div>
        </div>

        <div className="npd-field">
          <label className="npd-label">Build Mode</label>
          <div className="npd-mode-row">
            <label className="npd-mode-opt">
              <input
                type="radio"
                name="buildMode"
                checked={buildMode === "manual"}
                onChange={() => setBuildMode("manual")}
              />
              <span className="npd-mode-title">Manual</span>
              <span className="npd-mode-desc">Open empty — add tracks yourself</span>
            </label>
            <label className="npd-mode-opt">
              <input
                type="radio"
                name="buildMode"
                checked={buildMode === "auto"}
                onChange={() => setBuildMode("auto")}
              />
              <span className="npd-mode-title">Auto Fill</span>
              <span className="npd-mode-desc">Fill slots from Flow Curve immediately</span>
            </label>
          </div>
        </div>

        <div className="npd-actions">
          <button className="npd-btn npd-btn--cancel" onClick={onCancel}>Cancel</button>
          <button className="npd-btn npd-btn--confirm" onClick={handleConfirm}>Create Playlist</button>
        </div>
      </div>
    </div>
  );
}
