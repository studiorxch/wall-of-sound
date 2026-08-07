import type { TargetWithVisibility } from "./MapsGeographicCatalog";

type Props = {
  targets: TargetWithVisibility[];
  selectedIds: Set<string>;
  focusedTargetId: string | null;
  onToggleSelect: (targetId: string) => void;
  onFocus: (targetId: string) => void;
};

function formatOpacity(v: unknown): string {
  if (typeof v === "number") return `${Math.round(v * 100)}%`;
  if (v == null) return "—";
  return "—"; // an opacity expression — not worth rendering raw JSON in a compact cell
}

function formatPattern(v: unknown): string {
  return typeof v === "string" && v ? v : "none";
}

function swatchCell(field: TargetWithVisibility["colorFields"][number] | undefined) {
  if (!field) return <span className="geo-row-cell-empty">—</span>;
  return (
    <span className="geo-row-swatch-cell" title={field.isExpression ? `${field.roleLabel} (expression)` : `${field.roleLabel}: ${field.value}`}>
      <span className="geo-row-swatch" style={{ background: field.isExpression ? undefined : field.value }} />
      {!field.isExpression && <span className="geo-row-hex">{field.value}</span>}
    </span>
  );
}

// Rows view — metadata comparison, sorting, filtering, bulk operations.
// Detailed field editing lives in the shared target editor (opened by
// clicking a row), not inline in the table — this stays a compact,
// scannable subset per spec.
export function MapsGeographicRows({ targets, selectedIds, focusedTargetId, onToggleSelect, onFocus }: Props) {
  if (targets.length === 0) {
    return <div className="pg-empty"><div className="pg-empty-msg">No targets match the current search/filters.</div></div>;
  }
  return (
    <div className="geo-rows-scroll">
      <table className="geo-rows-table">
        <thead>
          <tr>
            <th className="geo-row-col-check" />
            <th>Name</th>
            <th>Category</th>
            <th>Source / Type</th>
            <th>Fill</th>
            <th>Outline / Line</th>
            <th>Pattern</th>
            <th>Opacity</th>
            <th>Visibility</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {targets.map((t) => {
            const selected = selectedIds.has(t.targetId);
            const focused = focusedTargetId === t.targetId;
            const colorOnly = t.colorFields.filter((f) => f.valueKind === "color");
            const primary = colorOnly[0];
            const secondary = colorOnly.find((f, i) => i > 0 && /Outline|Stroke|Halo/.test(f.roleLabel));
            // Prefer the genuinely editable registry opacity field (this
            // build's new line-opacity/fill-opacity wiring) over the older
            // read-only live-paint sample — same layer, two sources, and the
            // editable one is the one a user's edit actually lands in.
            const opacityField = t.colorFields.find((f) => f.valueKind === "opacity");
            const opacityDisplay = opacityField ? `${Math.round(parseFloat(opacityField.value) * 100)}%` : formatOpacity(t.opacity);
            return (
              <tr
                key={t.targetId}
                className={`geo-row${selected ? " geo-row--selected" : ""}${focused ? " geo-row--focused" : ""}`}
                onClick={() => onFocus(t.targetId)}
              >
                <td className="geo-row-col-check" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={selected} onChange={() => onToggleSelect(t.targetId)} />
                </td>
                <td className="geo-row-name">{t.name}</td>
                <td>{t.category}</td>
                <td>{t.layerType ?? t.sourceType}</td>
                <td>{swatchCell(primary)}</td>
                <td>{swatchCell(secondary)}</td>
                <td>{formatPattern(t.pattern)}</td>
                <td>{opacityDisplay}</td>
                <td>{t.visibility ?? "—"}</td>
                <td>
                  {t.editable === false && <span className="geo-badge">Read-only</span>}
                  {t.hasExpression && <span className="geo-badge geo-badge--expression">Expression</span>}
                  {t.isCustomized && <span className="geo-badge geo-badge--customized">Customized</span>}
                  {t.isActive && <span className="geo-badge geo-badge--active">Active</span>}
                  {t.editable !== false && !t.hasExpression && !t.isCustomized && !t.isActive && <span className="geo-row-cell-empty">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
