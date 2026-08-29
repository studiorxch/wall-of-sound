import type { VoiceColumnId, VoiceLibraryPreferences } from "../../data/voiceLibraryTypes";
import { VOICE_COLUMN_REGISTRY } from "../../logic/voice/voiceLibraryState";

interface Props {
  preferences: VoiceLibraryPreferences;
  onUpdate: (next: VoiceLibraryPreferences) => void;
  onClose: () => void;
}

const COLUMN_BY_ID = new Map(VOICE_COLUMN_REGISTRY.map((column) => [column.id, column]));

export function VoiceColumnsPanel({ preferences, onUpdate, onClose }: Props) {
  function toggleVisible(id: VoiceColumnId) {
    if (COLUMN_BY_ID.get(id)?.required) return;
    onUpdate({
      ...preferences,
      columns: preferences.columns.map((column) => (column.id === id ? { ...column, visible: !column.visible } : column)),
      updatedAt: new Date().toISOString(),
    });
  }

  function move(id: VoiceColumnId, direction: -1 | 1) {
    const order = preferences.columnOrder.slice();
    const index = order.indexOf(id);
    if (index === -1) return;
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= order.length) return;
    [order[index], order[targetIndex]] = [order[targetIndex], order[index]];
    onUpdate({ ...preferences, columnOrder: order, updatedAt: new Date().toISOString() });
  }

  return (
    <div className="export-modal-overlay" onClick={onClose}>
      <div className="export-modal cat-columns-panel" onClick={(event) => event.stopPropagation()}>
        <h3>Columns</h3>
        <ul className="cat-columns-list">
          {preferences.columnOrder.map((id, index) => {
            const definition = COLUMN_BY_ID.get(id);
            const preference = preferences.columns.find((column) => column.id === id);
            if (!definition || !preference) return null;
            return (
              <li key={id} className="cat-columns-list-row">
                <label>
                  <input type="checkbox" checked={preference.visible} disabled={definition.required} onChange={() => toggleVisible(id)} />
                  {definition.label}{definition.required ? <span className="dim"> (required)</span> : null}
                </label>
                <span className="cat-columns-reorder">
                  <button type="button" className="tb-btn sm" disabled={index === 0} onClick={() => move(id, -1)} aria-label={`Move ${definition.label} up`}>↑</button>
                  <button
                    type="button"
                    className="tb-btn sm"
                    disabled={index === preferences.columnOrder.length - 1}
                    onClick={() => move(id, 1)}
                    aria-label={`Move ${definition.label} down`}
                  >
                    ↓
                  </button>
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
