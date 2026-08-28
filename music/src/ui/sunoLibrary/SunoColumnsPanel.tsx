// Suno Library Parity Repair — mirrors LibraryColumnsPanel.tsx's exact
// shell/UX pattern (show/hide + reorder in an accessible list, same CSS
// classes) for the columns SunoArchiveTable already renders. Deliberately
// NOT the same component: LibraryColumnsPanel is hard-typed to Track's
// LIBRARY_COLUMN_REGISTRY/LibrarySourceKey, and widening those shared types
// was judged out of this narrow repair's risk budget (see the parity
// repair's completion report). Session-local state only — not persisted to
// PlayProject, unlike Catalog's LibraryGridPreferences; a smaller
// commitment appropriate for this pass.

export interface SunoColumnDef {
  id: string;
  label: string;
}

interface Props {
  columns: SunoColumnDef[];
  order: string[];
  hidden: ReadonlySet<string>;
  onToggleVisible: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onRestoreDefaults: () => void;
  onClose: () => void;
}

export function SunoColumnsPanel({ columns, order, hidden, onToggleVisible, onMove, onRestoreDefaults, onClose }: Props) {
  const byId = new Map(columns.map((c) => [c.id, c]));
  return (
    <div className="export-modal-overlay" onClick={onClose}>
      <div className="export-modal cat-columns-panel" onClick={(e) => e.stopPropagation()}>
        <h3>Columns</h3>
        <div className="cat-columns-panel-actions">
          <button type="button" className="tb-btn sm" onClick={onRestoreDefaults}>Restore Defaults</button>
        </div>
        <ul className="cat-columns-list">
          {order.map((id, idx) => {
            const def = byId.get(id);
            if (!def) return null;
            return (
              <li key={id} className="cat-columns-list-row">
                <label>
                  <input type="checkbox" checked={!hidden.has(id)} onChange={() => onToggleVisible(id)} />
                  {def.label}
                </label>
                <span className="cat-columns-reorder">
                  <button type="button" className="tb-btn sm" disabled={idx === 0} onClick={() => onMove(id, -1)} aria-label={`Move ${def.label} up`}>↑</button>
                  <button type="button" className="tb-btn sm" disabled={idx === order.length - 1} onClick={() => onMove(id, 1)} aria-label={`Move ${def.label} down`}>↓</button>
                </span>
              </li>
            );
          })}
        </ul>
        <div className="cat-batch-comments-actions">
          <button type="button" className="tb-btn sm" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
