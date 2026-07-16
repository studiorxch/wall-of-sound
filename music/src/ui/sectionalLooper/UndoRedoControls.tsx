// 0715C_MUSIC_Loop_Workspace_Editing_And_Revision_Completion §16 — pure
// presentational Undo/Redo controls, driven entirely by
// useLoopWorkspaceHistory.ts. No state of its own.

import type { LoopWorkspaceHistoryEntryType } from "../../data/loopTypes";

const LABELS: Record<LoopWorkspaceHistoryEntryType, string> = {
  selection_create: "selection",
  selection_clear: "clear selection",
  boundary_move: "boundary move",
  rename: "rename",
  revision_create: "create revision",
  revision_update: "update revision",
};

interface UndoRedoControlsProps {
  canUndo: boolean;
  canRedo: boolean;
  lastUndoType?: LoopWorkspaceHistoryEntryType;
  nextRedoType?: LoopWorkspaceHistoryEntryType;
  onUndo: () => void;
  onRedo: () => void;
}

export function UndoRedoControls({ canUndo, canRedo, lastUndoType, nextRedoType, onUndo, onRedo }: UndoRedoControlsProps) {
  return (
    <div className="looper-undo-redo">
      <button disabled={!canUndo} onClick={onUndo} title="Command-Z">
        Undo{lastUndoType ? ` ${LABELS[lastUndoType]}` : ""}
      </button>
      <button disabled={!canRedo} onClick={onRedo} title="Shift-Command-Z">
        Redo{nextRedoType ? ` ${LABELS[nextRedoType]}` : ""}
      </button>
    </div>
  );
}
