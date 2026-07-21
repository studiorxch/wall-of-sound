// 0715G_MUSIC_Sectional_Looper_Simplification_And_Stem_Ready_Export §Main
// Action Area — one compact action bar for the ONE active selection.
//
// 0716A_MUSIC_Direct_Manipulation_Looper_And_Playhead — collapsed to
// exactly the spec's own default-layout row: Play/Pause | Loop On/Off |
// Export | Clear. Mark Heard/Reject/Create Stem Loops (0715G) are not
// deleted — they moved into the Advanced drawer as plain buttons wired to
// the same existing handlers, since they're not part of the locked default
// action row.
//
// 0717B_MUSIC_Sectional_Looper_Radio_Export_Bridge — the single "Export
// WAV" button became an [Export ▾] menu (WAV / RADIO), same toolbar slot,
// same row height. See ExportMenu.tsx.

import { ExportMenu } from "./ExportMenu";

export type MainActionPreviewStatus = "idle" | "loading" | "playing" | "paused" | "error";

interface MainActionBarProps {
  previewStatus: MainActionPreviewStatus;
  onPlayPause: () => void;
  loopEnabled: boolean;
  onToggleLoop: () => void;
  onExportWav: () => void;
  onExportRadio: () => void;
  wavExportDisabled?: boolean;
  radioExportDisabled?: boolean;
  radioExportDisabledReason?: string;
  onClear: () => void;
  clearDisabled?: boolean;
}

export function MainActionBar({
  previewStatus, onPlayPause, loopEnabled, onToggleLoop,
  onExportWav, onExportRadio, wavExportDisabled, radioExportDisabled, radioExportDisabledReason,
  onClear, clearDisabled,
}: MainActionBarProps) {
  return (
    <div className="looper-main-action-bar">
      <button disabled={previewStatus === "loading"} onClick={onPlayPause}>
        {previewStatus === "playing" ? "Pause" : previewStatus === "loading" ? "Loading…" : "Play"}
      </button>
      <button className={loopEnabled ? "active" : ""} onClick={onToggleLoop} aria-pressed={loopEnabled}>
        {loopEnabled ? "Loop: On" : "Loop: Off"}
      </button>
      <ExportMenu
        onSelectWav={onExportWav}
        onSelectRadio={onExportRadio}
        wavDisabled={wavExportDisabled}
        radioDisabled={radioExportDisabled}
        radioDisabledReason={radioExportDisabledReason}
      />
      <button disabled={clearDisabled} onClick={onClear}>Clear</button>
    </div>
  );
}
