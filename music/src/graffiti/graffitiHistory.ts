// ── graffitiHistory ─────────────────────────────────────────────────────────────
// 0818_SUBWAY_Artwork_Creation_Drawing_App_v1.0.0 — BUILD §15
//
// Undo/redo/clear operating on drawing ACTIONS (add_stroke / clear), never
// on a flattened bitmap — undoing after 40 strokes removes exactly the
// last stroke and repaints from the remaining structured data, not from a
// pixel snapshot. Clearing is itself one undoable action (BUILD §15:
// "Clearing should be undoable unless explicitly confirmed as permanent
// reset") — callers that want a genuinely irreversible reset call
// `hardReset()` instead of `clear()`.

import type { ArtworkCreationSession, HistoryAction, HistoryState, Stroke } from "./graffitiTypes";

export function emptyHistory(): HistoryState {
  return { undoStack: [], redoStack: [] };
}

export function recordAddStroke(history: HistoryState, stroke: Stroke): HistoryState {
  return { undoStack: [...history.undoStack, { type: "add_stroke", stroke }], redoStack: [] };
}

export function recordClear(history: HistoryState, removedStrokes: Stroke[]): HistoryState {
  return { undoStack: [...history.undoStack, { type: "clear", removedStrokes }], redoStack: [] };
}

function applyInverse(session: ArtworkCreationSession, action: HistoryAction): ArtworkCreationSession {
  if (action.type === "add_stroke") {
    return { ...session, strokes: session.strokes.filter((s) => s.id !== action.stroke.id) };
  }
  // Undoing a clear restores exactly the strokes it removed, in their original order.
  return { ...session, strokes: [...action.removedStrokes, ...session.strokes] };
}

function applyForward(session: ArtworkCreationSession, action: HistoryAction): ArtworkCreationSession {
  if (action.type === "add_stroke") {
    return { ...session, strokes: [...session.strokes, action.stroke] };
  }
  const removedIds = new Set(action.removedStrokes.map((s) => s.id));
  return { ...session, strokes: session.strokes.filter((s) => !removedIds.has(s.id)) };
}

export function undo(session: ArtworkCreationSession, history: HistoryState, now: number): { session: ArtworkCreationSession; history: HistoryState } {
  if (history.undoStack.length === 0) return { session, history };
  const action = history.undoStack[history.undoStack.length - 1];
  const nextSession = { ...applyInverse(session, action), updatedAt: now };
  const nextHistory: HistoryState = { undoStack: history.undoStack.slice(0, -1), redoStack: [...history.redoStack, action] };
  return { session: nextSession, history: nextHistory };
}

export function redo(session: ArtworkCreationSession, history: HistoryState, now: number): { session: ArtworkCreationSession; history: HistoryState } {
  if (history.redoStack.length === 0) return { session, history };
  const action = history.redoStack[history.redoStack.length - 1];
  const nextSession = { ...applyForward(session, action), updatedAt: now };
  const nextHistory: HistoryState = { undoStack: [...history.undoStack, action], redoStack: history.redoStack.slice(0, -1) };
  return { session: nextSession, history: nextHistory };
}

// The one genuinely destructive, non-undoable action — callers must ask
// for explicit confirmation before invoking this (never wired to a single
// accidental click in the UI).
export function hardReset(session: ArtworkCreationSession, now: number): { session: ArtworkCreationSession; history: HistoryState } {
  return { session: { ...session, strokes: [], updatedAt: now, dirty: true }, history: emptyHistory() };
}
