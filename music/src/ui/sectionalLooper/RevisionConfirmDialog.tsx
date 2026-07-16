// 0715C_MUSIC_Loop_Workspace_Editing_And_Revision_Completion §22 — the
// Create New Revision / Update Existing / Cancel prompt shown when editing
// an already-approved loop's boundaries. Default is Create New Revision.

interface RevisionConfirmDialogProps {
  loopTitle: string;
  onCreateNewRevision: () => void;
  onUpdateExisting: () => void;
  onCancel: () => void;
}

export function RevisionConfirmDialog({ loopTitle, onCreateNewRevision, onUpdateExisting, onCancel }: RevisionConfirmDialogProps) {
  return (
    <div className="looper-revision-confirm" role="alertdialog" aria-label="Revise approved loop">
      <p>
        "{loopTitle}" is already approved. Editing its boundaries will not change the original —
        choose how to save this edit:
      </p>
      <div className="looper-revision-confirm-actions">
        <button className="looper-revision-confirm-default" onClick={onCreateNewRevision} autoFocus>
          Create New Revision
        </button>
        <button onClick={onUpdateExisting}>Update Existing</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
