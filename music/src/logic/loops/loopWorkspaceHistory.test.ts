import { describe, it, expect } from "vitest";
import {
  emptyHistory, pushHistoryEntry, canUndo, canRedo, undo, redo, HISTORY_DEPTH_LIMIT,
} from "./loopWorkspaceHistory";
import type { LoopWorkspaceHistoryEntry } from "../../data/loopTypes";

function entry(id: string): LoopWorkspaceHistoryEntry {
  return {
    id,
    type: "boundary_move",
    before: { timelineSelection: null, snapMode: "bar" },
    after: { timelineSelection: null, snapMode: "beat" },
    createdAt: "now",
  };
}

describe("loopWorkspaceHistory", () => {
  it("starts empty with nothing to undo or redo", () => {
    const s = emptyHistory();
    expect(canUndo(s)).toBe(false);
    expect(canRedo(s)).toBe(false);
  });

  it("pushing an entry makes it undoable but not redoable", () => {
    const s = pushHistoryEntry(emptyHistory(), entry("a"));
    expect(canUndo(s)).toBe(true);
    expect(canRedo(s)).toBe(false);
  });

  it("undo returns the entry and makes redo available", () => {
    const s1 = pushHistoryEntry(emptyHistory(), entry("a"));
    const result = undo(s1)!;
    expect(result.entry.id).toBe("a");
    expect(canUndo(result.state)).toBe(false);
    expect(canRedo(result.state)).toBe(true);
  });

  it("redo re-applies the entry and disables further redo", () => {
    const s1 = pushHistoryEntry(emptyHistory(), entry("a"));
    const afterUndo = undo(s1)!.state;
    const result = redo(afterUndo)!;
    expect(result.entry.id).toBe("a");
    expect(canRedo(result.state)).toBe(false);
    expect(canUndo(result.state)).toBe(true);
  });

  it("pushing a new entry after undo truncates the redo tail", () => {
    let s = pushHistoryEntry(emptyHistory(), entry("a"));
    s = pushHistoryEntry(s, entry("b"));
    s = undo(s)!.state; // back to "a", "b" is redoable
    expect(canRedo(s)).toBe(true);
    s = pushHistoryEntry(s, entry("c"));
    expect(canRedo(s)).toBe(false); // "b" is gone
    const undone = undo(s)!;
    expect(undone.entry.id).toBe("c");
  });

  it("undo/redo return null at the ends of the stack", () => {
    expect(undo(emptyHistory())).toBeNull();
    const s = pushHistoryEntry(emptyHistory(), entry("a"));
    expect(redo(s)).toBeNull();
  });

  it("discards the oldest entry once the depth limit is exceeded", () => {
    let s = emptyHistory();
    for (let i = 0; i < HISTORY_DEPTH_LIMIT + 5; i++) {
      s = pushHistoryEntry(s, entry(`e${i}`));
    }
    expect(s.entries.length).toBe(HISTORY_DEPTH_LIMIT);
    expect(s.entries[0].id).toBe("e5"); // the first 5 were discarded
    expect(s.entries[s.entries.length - 1].id).toBe(`e${HISTORY_DEPTH_LIMIT + 4}`);
  });
});
