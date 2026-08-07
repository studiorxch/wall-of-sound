import type { TargetWithVisibility } from "./MapsGeographicCatalog";

type Props = {
  targets: TargetWithVisibility[];
  selectedIds: Set<string>;
  focusedTargetId: string | null;
  onToggleSelect: (targetId: string) => void;
  onFocus: (targetId: string) => void;
};

// Grid view — visual recognition and fast selection. Each card's "preview"
// is its real dominant swatches (fill/outline/etc.), not a fabricated
// per-target map thumbnail; the one real live map preview stays in the
// style header above this catalog. "Open" focuses the shared target editor
// (same one Rows view uses) rather than duplicating an editor per card.
export function MapsGeographicGrid({ targets, selectedIds, focusedTargetId, onToggleSelect, onFocus }: Props) {
  if (targets.length === 0) {
    return <div className="pg-empty"><div className="pg-empty-msg">No targets match the current search/filters.</div></div>;
  }
  return (
    <div className="geo-grid">
      {targets.map((t) => {
        const selected = selectedIds.has(t.targetId);
        const focused = focusedTargetId === t.targetId;
        return (
          <div
            key={t.targetId}
            className={`geo-card${selected ? " geo-card--selected" : ""}${focused ? " geo-card--focused" : ""}`}
            onClick={() => onFocus(t.targetId)}
          >
            <label className="geo-card-check" onClick={(e) => e.stopPropagation()}>
              <input type="checkbox" checked={selected} onChange={() => onToggleSelect(t.targetId)} />
            </label>
            <div className="geo-card-swatches">
              {t.editable === false ? (
                <span className="pgc-art-initials">—</span>
              ) : (
                t.colorFields.filter((f) => f.valueKind === "color").map((f) => (
                  <span
                    key={f.propId}
                    className="geo-card-swatch"
                    style={{ background: f.isExpression ? undefined : f.value }}
                    title={`${f.roleLabel}${f.isExpression ? " (expression)" : ": " + f.value}`}
                  />
                ))
              )}
            </div>
            <div className="geo-card-info">
              <span className="geo-card-name">{t.name}</span>
              <span className="geo-card-meta">
                {t.category}
                {t.editable === false && <span className="geo-badge">Read-only</span>}
                {t.hasExpression && <span className="geo-badge geo-badge--expression">Expression</span>}
                {t.isCustomized && <span className="geo-badge geo-badge--customized">Customized</span>}
                {t.isActive && <span className="geo-badge geo-badge--active">Active</span>}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
