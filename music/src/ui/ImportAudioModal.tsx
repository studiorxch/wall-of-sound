import { useState } from "react";
import type { TrackSourceOwner } from "../data/trackTypes";

// One canonical Import Audio entry point (0712_MUSIC_Audio_Import_And_Readiness).
// Destination confirmation only — file selection happens after this via the
// existing native file picker (pickAudioFiles), then the existing intake
// review queue (ImportIntakePanel) takes over. This modal does not duplicate
// any file-handling/validation logic.

const DESTINATIONS: { owner: TrackSourceOwner; label: string; desc: string }[] = [
  { owner: "studiorich", label: "Catalog", desc: "StudioRich-owned or controlled music" },
  { owner: "external", label: "External", desc: "Music by other artists" },
  { owner: "reference", label: "Sounds", desc: "Loops, stems, one-shots, field recordings, effects, ambience" },
];

interface Props {
  onConfirm: (destination: TrackSourceOwner) => void;
  onCancel: () => void;
}

export function ImportAudioModal({ onConfirm, onCancel }: Props) {
  const [destination, setDestination] = useState<TrackSourceOwner>("studiorich");

  return (
    <div className="npw-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="npw-modal">
        <div className="npw-header">
          <div className="npw-header-title">Import Audio</div>
          <button className="npw-close" onClick={onCancel}>✕</button>
        </div>
        <div className="npw-body">
          <div className="npw-step-label">Add to</div>
          <div className="iam-dest-list">
            {DESTINATIONS.map((d) => (
              <label key={d.owner} className={`iam-dest-row${destination === d.owner ? " iam-dest-row--selected" : ""}`}>
                <input
                  type="radio"
                  name="import-destination"
                  checked={destination === d.owner}
                  onChange={() => setDestination(d.owner)}
                />
                <div className="iam-dest-info">
                  <div className="iam-dest-label">{d.label}</div>
                  <div className="iam-dest-desc">{d.desc}</div>
                </div>
              </label>
            ))}
          </div>
          <div className="npw-actions">
            <button className="npw-btn npw-btn--ghost" onClick={onCancel}>Cancel</button>
            <button className="npw-btn npw-btn--primary" onClick={() => onConfirm(destination)}>
              Choose Files →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
