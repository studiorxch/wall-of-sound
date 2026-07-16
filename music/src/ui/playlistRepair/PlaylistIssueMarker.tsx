import type { PlaylistIssueColorState } from "../../data/playlistRepairTypes";

const COLOR_LABEL: Record<PlaylistIssueColorState, string> = {
  green: "No meaningful issue",
  yellow: "Acceptable compromise or intentional tension",
  red: "Material unresolved defect",
  blue: "Insufficient evidence or incomplete analysis",
};

/** Compact colored alert marker (0713_MUSIC_Playlist_Local_Repair_And_Gap_
 * Analysis §3/§15) — reused everywhere an issue's color state needs to be
 * shown: repair panel rows, section summaries, tooltips. */
export function PlaylistIssueMarker({ colorState, label }: { colorState: PlaylistIssueColorState; label?: string }) {
  return (
    <span
      className={`prm-dot prm-dot--${colorState}`}
      title={label ?? COLOR_LABEL[colorState]}
      aria-label={label ?? COLOR_LABEL[colorState]}
    />
  );
}
