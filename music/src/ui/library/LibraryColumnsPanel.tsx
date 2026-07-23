// Shared Columns control — used identically by Catalog, External, and
// Sounds: show/hide, reorder (accessible up/down list — the explicitly
// permitted alternative to in-header drag-and-drop reordering), auto-fit
// all, restore defaults, and row density. "Restore Defaults" restores THIS
// library's own defaults (e.g. Sounds restores with bpm/key/suggested/
// mechanical hidden), never another library's.

import type { LibraryGridPreferences, LibraryColumnId, LibraryRowDensity, LibrarySourceKey } from "../../data/libraryGridTypes";
import { getLibraryColumnDef, restoreDefaultLibraryGridPreferences, REQUIRED_COLUMN_ID } from "../../logic/library/libraryColumns";

interface Props {
  preferences: LibraryGridPreferences;
  sourceKey: LibrarySourceKey;
  onUpdate: (next: LibraryGridPreferences) => void;
  onAutoFitAll: () => void;
  onClose: () => void;
}

export function LibraryColumnsPanel({ preferences, sourceKey, onUpdate, onAutoFitAll, onClose }: Props) {
  function toggleVisible(id: LibraryColumnId) {
    if (id === REQUIRED_COLUMN_ID) return; // never hideable
    onUpdate({
      ...preferences,
      columns: preferences.columns.map((c) => (c.id === id ? { ...c, visible: !c.visible } : c)),
      updatedAt: new Date().toISOString(),
    });
  }

  function move(id: LibraryColumnId, direction: -1 | 1) {
    const order = preferences.columnOrder.slice();
    const idx = order.indexOf(id);
    if (idx === -1 || id === REQUIRED_COLUMN_ID) return; // title stays pinned first
    const targetIdx = idx + direction;
    if (targetIdx <= 0 || targetIdx >= order.length) return; // can't move above title or off the end
    [order[idx], order[targetIdx]] = [order[targetIdx], order[idx]];
    onUpdate({ ...preferences, columnOrder: order, updatedAt: new Date().toISOString() });
  }

  function setDensity(density: LibraryRowDensity) {
    onUpdate({ ...preferences, density, updatedAt: new Date().toISOString() });
  }

  function restoreDefaults() {
    onUpdate(restoreDefaultLibraryGridPreferences(sourceKey));
  }

  return (
    <div className="export-modal-overlay" onClick={onClose}>
      <div className="export-modal cat-columns-panel" onClick={(e) => e.stopPropagation()}>
        <h3>Columns</h3>
        <div className="cat-columns-panel-actions">
          <button className="tb-btn sm" onClick={onAutoFitAll}>Auto-fit All</button>
          <button className="tb-btn sm" onClick={restoreDefaults}>Restore Defaults</button>
          <span className="cat-columns-density">
            <label><input type="radio" checked={preferences.density === "comfortable"} onChange={() => setDensity("comfortable")} /> Comfortable</label>
            <label><input type="radio" checked={preferences.density === "compact"} onChange={() => setDensity("compact")} /> Compact</label>
          </span>
        </div>
        <ul className="cat-columns-list">
          {preferences.columnOrder.map((id, idx) => {
            const def = getLibraryColumnDef(id);
            const pref = preferences.columns.find((c) => c.id === id);
            if (!def || !pref) return null;
            const required = id === REQUIRED_COLUMN_ID;
            return (
              <li key={id} className="cat-columns-list-row">
                <label>
                  <input type="checkbox" checked={pref.visible} disabled={required} onChange={() => toggleVisible(id)} />
                  {def.label}{required && <span className="dim"> (required)</span>}
                </label>
                <span className="cat-columns-reorder">
                  <button className="tb-btn sm" disabled={required || idx <= 1} onClick={() => move(id, -1)} aria-label={`Move ${def.label} up`}>↑</button>
                  <button className="tb-btn sm" disabled={required || idx >= preferences.columnOrder.length - 1} onClick={() => move(id, 1)} aria-label={`Move ${def.label} down`}>↓</button>
                </span>
              </li>
            );
          })}
        </ul>
        <div className="cat-batch-comments-actions">
          <button className="tb-btn sm" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
