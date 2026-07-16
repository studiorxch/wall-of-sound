import type { CrateRecord } from "../../data/crateTypes";
import type { PlaylistEnergyShape, PlaylistShapeSection } from "../../data/playlistShapeTypes";
import { InlineSectionName } from "./InlineSectionName";
import { InlineSectionDuration } from "./InlineSectionDuration";
import { InlineCrateWeights } from "./InlineCrateWeights";
import { SectionEnergyMeter } from "./SectionEnergyMeter";
import { SectionRowMenu } from "./SectionRowMenu";

// One fully self-contained, directly editable Shape-step row (0712_MUSIC_
// Playlist_Shape_Inline_Editing) — no expanded editor, no per-row Edit
// button. Every column owns its own inline-edit affordance.
export function PlaylistShapeSectionRow({
  section,
  cratesMap,
  availableCrates,
  crateCountsById,
  onRename,
  onDurationChange,
  onAddCrate,
  onRemoveCrate,
  onCrateWeightChange,
  onEnergyStartChange,
  onEnergyEndChange,
  onEnergyBracketChange,
  onEnergyShapeChange,
  onDuplicate,
  onRemove,
}: {
  section: PlaylistShapeSection;
  cratesMap: Map<string, CrateRecord>;
  availableCrates: CrateRecord[];
  crateCountsById: Map<string, number>;
  onRename: (next: string) => void;
  onDurationChange: (minutes: number) => void;
  onAddCrate: (crateId: string) => void;
  onRemoveCrate: (crateId: string) => void;
  onCrateWeightChange: (crateId: string, weight: number) => void;
  onEnergyStartChange: (value: number) => void;
  onEnergyEndChange: (value: number) => void;
  onEnergyBracketChange: (start: number, end: number) => void;
  onEnergyShapeChange: (value: "auto" | PlaylistEnergyShape) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  return (
    <tr className="npw-shape-row">
      <td className="npw-shape-label">
        <InlineSectionName value={section.label} onCommit={onRename} />
      </td>
      <td className="npw-shape-time">
        <InlineSectionDuration minutes={section.durationMinutes} onCommit={onDurationChange} />
      </td>
      <td className="npw-shape-crates">
        <InlineCrateWeights
          crateWeights={section.crateWeights}
          cratesMap={cratesMap}
          availableCrates={availableCrates}
          crateCountsById={crateCountsById}
          onAdd={onAddCrate}
          onRemove={onRemoveCrate}
          onWeightChange={onCrateWeightChange}
        />
      </td>
      <td className="npw-shape-energy">
        <SectionEnergyMeter
          envelope={section.energyEnvelope}
          sectionLabel={section.label}
          onChangeStart={onEnergyStartChange}
          onChangeEnd={onEnergyEndChange}
          onChangeBracket={onEnergyBracketChange}
          onChangeShape={onEnergyShapeChange}
        />
      </td>
      <td className="npw-shape-action">
        <SectionRowMenu onDuplicate={onDuplicate} onRemove={onRemove} />
      </td>
    </tr>
  );
}
