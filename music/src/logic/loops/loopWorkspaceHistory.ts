// 0715C_MUSIC_Loop_Workspace_Editing_And_Revision_Completion §13-§16 —
// undo/redo stack for the NARROWED undoable operation set (see
// data/loopTypes.ts's LoopWorkspaceHistoryEntryType doc comment for why
// approve/reject/archive/render are excluded — those keep their own
// explicit Loop Bin row actions instead of an ephemeral history entry).
// Plain array+index, no React dependency — the UI hook
// (sectionalLooper/useLoopWorkspaceHistory.ts) just wraps this so the
// underlying reducer logic is trivially unit-testable.

import type { LoopWorkspaceHistoryEntry } from "../../data/loopTypes";

export const HISTORY_DEPTH_LIMIT = 50;

export interface LoopWorkspaceHistoryState {
  entries: LoopWorkspaceHistoryEntry[];
  // points at the entry most recently applied; -1 = nothing yet.
  index: number;
}

export function emptyHistory(): LoopWorkspaceHistoryState {
  return { entries: [], index: -1 };
}

// §15 — pushing a new entry always truncates any redo tail (you can't redo
// past a new action), and discards the OLDEST entry once the 50-op cap is
// exceeded.
export function pushHistoryEntry(
  state: LoopWorkspaceHistoryState,
  entry: LoopWorkspaceHistoryEntry,
): LoopWorkspaceHistoryState {
  const truncated = state.entries.slice(0, state.index + 1);
  let entries = [...truncated, entry];
  let index = entries.length - 1;
  if (entries.length > HISTORY_DEPTH_LIMIT) {
    const overflow = entries.length - HISTORY_DEPTH_LIMIT;
    entries = entries.slice(overflow);
    index -= overflow;
  }
  return { entries, index };
}

export function canUndo(state: LoopWorkspaceHistoryState): boolean {
  return state.index >= 0;
}

export function canRedo(state: LoopWorkspaceHistoryState): boolean {
  return state.index < state.entries.length - 1;
}

export interface HistoryStepResult {
  state: LoopWorkspaceHistoryState;
  entry: LoopWorkspaceHistoryEntry;
}

// Caller applies `entry.before` to roll the workspace back.
export function undo(state: LoopWorkspaceHistoryState): HistoryStepResult | null {
  if (!canUndo(state)) return null;
  const entry = state.entries[state.index];
  return { state: { entries: state.entries, index: state.index - 1 }, entry };
}

// Caller applies `entry.after` to re-apply the action.
export function redo(state: LoopWorkspaceHistoryState): HistoryStepResult | null {
  if (!canRedo(state)) return null;
  const entry = state.entries[state.index + 1];
  return { state: { entries: state.entries, index: state.index + 1 }, entry };
}
