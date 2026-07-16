// 0715G_MUSIC_Sectional_Looper_Simplification_And_Stem_Ready_Export
// §Alignment Control — collapses the existing 5-way TimelineSnapMode to
// Grid | Beat | Free. Purely presentational; the parent workspace maps
// these to snapMode ("bar"/"beat"/"off") exactly as SnapModeToolbar already
// maps its own wider set. Zero-crossing safety stays an always-on internal
// commit-time refinement, never a 4th visible button here.

export type AlignmentMode = "grid" | "beat" | "free";

interface AlignmentControlProps {
  value: AlignmentMode;
  onChange: (mode: AlignmentMode) => void;
}

export function AlignmentControl({ value, onChange }: AlignmentControlProps) {
  return (
    <div className="looper-alignment-control">
      <span>Alignment</span>
      <button className={value === "grid" ? "active" : ""} onClick={() => onChange("grid")}>Grid</button>
      <button className={value === "beat" ? "active" : ""} onClick={() => onChange("beat")}>Beat</button>
      <button className={value === "free" ? "active" : ""} onClick={() => onChange("free")}>Free</button>
    </div>
  );
}
