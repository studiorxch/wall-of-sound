// 0715C_MUSIC_Loop_Workspace_Editing_And_Revision_Completion §13-§16 — React
// wrapper around the pure reducer in logic/loops/loopWorkspaceHistory.ts,
// plus the Command-Z / Shift-Command-Z global shortcut (§16). Kept as its
// own hook (rather than inline state in SectionalLooperWorkspace.tsx) so
// the workspace component only wires callbacks, not history bookkeeping.

import { useEffect, useState } from "react";
import type { LoopWorkspaceHistoryEntry, LoopWorkspaceHistoryEntryType, LoopWorkspaceSnapshot } from "../../data/loopTypes";
import {
  emptyHistory, pushHistoryEntry, canUndo as canUndoState, canRedo as canRedoState, undo as undoState, redo as redoState,
} from "../../logic/loops/loopWorkspaceHistory";

function genHistoryEntryId(): string {
  return `hist_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export interface UseLoopWorkspaceHistoryOptions {
  // Shortcuts are inert when the workspace isn't the active page (e.g. no
  // source track selected) — mirrors App.tsx's own guard pattern.
  enabled: boolean;
  onApplySnapshot: (snapshot: LoopWorkspaceSnapshot) => void;
}

export function useLoopWorkspaceHistory({ enabled, onApplySnapshot }: UseLoopWorkspaceHistoryOptions) {
  const [state, setState] = useState(() => emptyHistory());

  // Records a completed action. Caller supplies the workspace snapshot
  // before/after — this hook never inspects workspace state itself, it
  // only stores what it's given.
  function record(type: LoopWorkspaceHistoryEntryType, before: LoopWorkspaceSnapshot, after: LoopWorkspaceSnapshot) {
    const entry: LoopWorkspaceHistoryEntry = { id: genHistoryEntryId(), type, before, after, createdAt: new Date().toISOString() };
    setState((s) => pushHistoryEntry(s, entry));
  }

  function performUndo() {
    setState((s) => {
      const result = undoState(s);
      if (!result) return s;
      onApplySnapshot(result.entry.before);
      return result.state;
    });
  }

  function performRedo() {
    setState((s) => {
      const result = redoState(s);
      if (!result) return s;
      onApplySnapshot(result.entry.after);
      return result.state;
    });
  }

  function reset() {
    setState(emptyHistory());
  }

  // §16 — Command-Z / Shift-Command-Z, guarded against typing in inputs
  // (same idiom as App.tsx's own global transport shortcut listener).
  useEffect(() => {
    if (!enabled) return;
    function handleKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      e.preventDefault();
      if (e.shiftKey) performRedo(); else performUndo();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  const lastEntry = state.index >= 0 ? state.entries[state.index] : undefined;
  const nextRedoEntry = state.index + 1 < state.entries.length ? state.entries[state.index + 1] : undefined;

  return {
    canUndo: canUndoState(state),
    canRedo: canRedoState(state),
    lastUndoType: lastEntry?.type,
    nextRedoType: nextRedoEntry?.type,
    record,
    undo: performUndo,
    redo: performRedo,
    reset,
  };
}
