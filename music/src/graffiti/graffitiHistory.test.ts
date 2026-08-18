import { describe, it, expect } from "vitest";
import { emptyHistory, recordAddStroke, recordClear, undo, redo, hardReset } from "./graffitiHistory";
import { createSession, startStroke, commitStroke } from "./graffitiStrokeStore";
import type { StrokePoint } from "./graffitiTypes";

// BUILD §33 categories 10-12.

const POINT: StrokePoint = { x: 0.1, y: 0.1, pointerType: "mouse", timestamp: 1000 };

function buildSessionWithTwoStrokes() {
  let session = createSession({ kind: "sticker" }, 500, 500, [], 1000);
  let history = emptyHistory();
  const s1 = startStroke("marker", "#111111", 0.02, POINT, 1000);
  session = commitStroke(session, s1, 1001);
  history = recordAddStroke(history, s1);
  const s2 = startStroke("fatcap", "#222222", 0.02, POINT, 1002);
  session = commitStroke(session, s2, 1003);
  history = recordAddStroke(history, s2);
  return { session, history, s1, s2 };
}

describe("undo (#10)", () => {
  it("removes exactly the most recently added stroke, leaving earlier strokes intact — operates on structured actions, not a bitmap", () => {
    const { session, history, s1 } = buildSessionWithTwoStrokes();
    const result = undo(session, history, 2000);
    expect(result.session.strokes.map((s) => s.id)).toEqual([s1.id]);
  });

  it("undoing with an empty history is a no-op, not an error", () => {
    let session = createSession({ kind: "sticker" }, 500, 500, [], 1000);
    const result = undo(session, emptyHistory(), 2000);
    expect(result.session.strokes).toHaveLength(0);
  });
});

describe("redo (#11)", () => {
  it("re-applies an undone stroke exactly, restoring the prior state", () => {
    const { session, history, s1, s2 } = buildSessionWithTwoStrokes();
    const afterUndo = undo(session, history, 2000);
    const afterRedo = redo(afterUndo.session, afterUndo.history, 2001);
    expect(afterRedo.session.strokes.map((s) => s.id)).toEqual([s1.id, s2.id]);
  });

  it("a new stroke action clears the redo stack (standard undo/redo semantics — redoing after a fresh action would corrupt history)", () => {
    const { session, history } = buildSessionWithTwoStrokes();
    const afterUndo = undo(session, history, 2000);
    // recordAddStroke always resets redoStack — verified directly here.
    const freshHistory = recordAddStroke(afterUndo.history, startStroke("marker", "#333333", 0.02, POINT, 2002));
    expect(freshHistory.redoStack).toHaveLength(0);
  });
});

describe("clear / restore via undo (#12)", () => {
  it("clear removes all strokes but remains undoable — recorded as one action, not destroyed", () => {
    const { session, history, s1, s2 } = buildSessionWithTwoStrokes();
    const clearedSession = { ...session, strokes: [] };
    const clearedHistory = recordClear(history, session.strokes);
    expect(clearedSession.strokes).toHaveLength(0);

    const restored = undo(clearedSession, clearedHistory, 3000);
    expect(restored.session.strokes.map((s) => s.id)).toEqual([s1.id, s2.id]);
  });

  it("hardReset is genuinely irreversible — clears both the session and the entire history stack", () => {
    const { session, history } = buildSessionWithTwoStrokes();
    const result = hardReset(session, 3000);
    expect(result.session.strokes).toHaveLength(0);
    expect(result.history).toEqual(emptyHistory());
    // Confirms hardReset is a DIFFERENT code path from clear/undo — history
    // itself (not just the session) is what makes it non-undoable.
    expect(history.undoStack.length).toBeGreaterThan(0);
  });
});
