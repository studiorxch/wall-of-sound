// 0722C_MUSIC_Production_Stem_Export — one row per stem role inside the
// sublayer: mute/solo only (instantaneous gain, never a fade — see
// stemPlaybackEngine.ts). No waveform/cue editing in this build.

import type { StemRole, TrackStemFile } from "../../data/trackStemTypes";

const ROLE_LABEL: Record<StemRole, string> = { vocals: "Vocals", drums: "Drums", bass: "Bass", other: "Other" };

interface Props {
  role: StemRole;
  file: TrackStemFile | undefined;
  muted: boolean;
  soloed: boolean;
  onToggleMute: (role: StemRole) => void;
  onToggleSolo: (role: StemRole) => void;
}

export function StemRoleRow({ role, file, muted, soloed, onToggleMute, onToggleSolo }: Props) {
  return (
    <div className="stem-role-row">
      <span className="stem-role-label">{ROLE_LABEL[role]}</span>
      <span className="stem-role-meta">
        {file ? `${file.sampleRateHz}Hz · ${file.channels}ch · ${file.bitDepth ?? "?"}-bit` : "missing"}
      </span>
      <button
        type="button"
        className={`stem-role-btn stem-role-btn--mute${muted ? " stem-role-btn--active" : ""}`}
        aria-pressed={muted}
        onClick={() => onToggleMute(role)}
      >
        Mute
      </button>
      <button
        type="button"
        className={`stem-role-btn stem-role-btn--solo${soloed ? " stem-role-btn--active" : ""}`}
        aria-pressed={soloed}
        onClick={() => onToggleSolo(role)}
      >
        Solo
      </button>
    </div>
  );
}
