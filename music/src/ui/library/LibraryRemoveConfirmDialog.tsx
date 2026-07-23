// Shared guarded-removal confirmation — used identically by Catalog,
// External, and Sounds. Names the exact library and count before requiring
// an explicit confirmation; the underlying removal handler (and whether it
// also needs to sync an on-disk index, as Sounds/reference does) is the
// caller's responsibility via `onConfirm`, never this dialog's.

interface Props {
  count: number;
  libraryLabel: string; // "Catalog" | "External" | "Sounds"
  unitLabel: string; // "tracks" | "clips"
  onConfirm: () => void;
  onCancel: () => void;
}

export function LibraryRemoveConfirmDialog({ count, libraryLabel, unitLabel, onConfirm, onCancel }: Props) {
  const unit = count === 1 ? unitLabel.replace(/s$/, "") : unitLabel;
  return (
    <div className="export-modal-overlay" onClick={onCancel}>
      <div className="export-modal cat-remove-confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Remove from {libraryLabel}</h3>
        <p>
          Remove <b>{count}</b> {unit} from {libraryLabel}? This does not delete the
          underlying audio file — only the library entry.
        </p>
        <div className="cat-batch-comments-actions">
          <button className="tb-btn sm" onClick={onCancel}>Cancel</button>
          <button className="tb-btn sm remove-btn" onClick={onConfirm}>Remove {count} {unit}</button>
        </div>
      </div>
    </div>
  );
}
