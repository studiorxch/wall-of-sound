// 0715E_MUSIC_Loop_Revision_Activation_And_Stem_Source_Entry §7 — shown only
// when wouldActivationStaleRender is true; otherwise Make Active applies
// immediately with no dialog.

interface ActivateRevisionConfirmProps {
  onConfirm: () => void;
  onCancel: () => void;
}

export function ActivateRevisionConfirm({ onConfirm, onCancel }: ActivateRevisionConfirmProps) {
  return (
    <div className="looper-activate-revision-confirm" role="alertdialog" aria-label="Activate revision">
      <p>
        Activate this revision? The current render was created from another revision and will become stale.
      </p>
      <div className="looper-activate-revision-confirm-actions">
        <button onClick={onConfirm} autoFocus>Activate</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
