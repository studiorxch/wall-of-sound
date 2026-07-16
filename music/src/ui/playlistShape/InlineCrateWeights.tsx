import { useState } from "react";
import type { CrateRecord } from "../../data/crateTypes";
import type { SectionCrateWeight } from "../../data/playlistShapeTypes";

// Inline crate chips (0712_MUSIC_Playlist_Shape_Inline_Editing §8). Preserves
// existing crate weighting/eligibility/round-robin logic untouched — this
// component only edits the section's crateWeights array, the same data the
// generator already reads.
export function InlineCrateWeights({
  crateWeights,
  cratesMap,
  availableCrates,
  crateCountsById,
  onAdd,
  onRemove,
  onWeightChange,
}: {
  crateWeights: SectionCrateWeight[];
  cratesMap: Map<string, CrateRecord>;
  availableCrates: CrateRecord[];
  crateCountsById?: Map<string, number>;
  onAdd: (crateId: string) => void;
  onRemove: (crateId: string) => void;
  onWeightChange: (crateId: string, weight: number) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingWeightFor, setEditingWeightFor] = useState<string | null>(null);

  const addable = availableCrates.filter((c) => !crateWeights.some((cw) => cw.crateId === c.id));

  return (
    <div className="npw-crate-chips">
      {crateWeights.map((cw) => {
        const crate = cratesMap.get(cw.crateId);
        const isEditingWeight = editingWeightFor === cw.crateId;
        return (
          <span key={cw.crateId} className="npw-crate-chip">
            <span className="npw-crate-chip-name">{crate?.name ?? "?"}</span>
            {isEditingWeight ? (
              <input
                className="npw-crate-chip-weight-input"
                type="number"
                min={0}
                max={100}
                autoFocus
                defaultValue={Math.round(cw.weight)}
                onBlur={(e) => { onWeightChange(cw.crateId, Number(e.target.value)); setEditingWeightFor(null); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); onWeightChange(cw.crateId, Number((e.target as HTMLInputElement).value)); setEditingWeightFor(null); }
                  else if (e.key === "Escape") { e.preventDefault(); setEditingWeightFor(null); }
                }}
                aria-label={`${crate?.name ?? "Crate"} weight percent`}
              />
            ) : (
              <button
                type="button"
                className="npw-crate-chip-weight"
                onClick={() => setEditingWeightFor(cw.crateId)}
                title="Click to edit weight"
              >
                {Math.round(cw.weight)}%
              </button>
            )}
            <button
              type="button"
              className="npw-crate-chip-remove"
              onClick={() => onRemove(cw.crateId)}
              aria-label={`Remove ${crate?.name ?? "crate"} from this section`}
            >
              ×
            </button>
          </span>
        );
      })}

      <span className="npw-crate-add-anchor">
        <button
          type="button"
          className="npw-crate-add-btn"
          onClick={() => setPickerOpen((v) => !v)}
          aria-label="Add crate"
          aria-expanded={pickerOpen}
        >
          {crateWeights.length === 0 ? "+ Add crate" : "+"}
        </button>
        {pickerOpen && (
          <div className="npw-crate-picker">
            {addable.length === 0 ? (
              <div className="npw-crate-picker-empty">No more crates available</div>
            ) : (
              addable.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="npw-crate-picker-item"
                  onClick={() => { onAdd(c.id); setPickerOpen(false); }}
                >
                  {c.name} {crateCountsById ? `(${crateCountsById.get(c.id) ?? 0})` : ""}
                </button>
              ))
            )}
          </div>
        )}
      </span>
    </div>
  );
}
