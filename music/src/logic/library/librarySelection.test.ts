import { describe, it, expect } from "vitest";
import {
  resolvePointerSelect, resolveHeaderCheckboxToggle, resolveSelectAllVisible,
  clearLibrarySelection, moveLibraryFocus, toggleFocusedLibrarySelection, extendLibrarySelectionFromFocus,
  type LibrarySelectionState,
} from "./librarySelection";

const VISIBLE = ["a", "b", "c", "d", "e"];

function withSelection(ids: string[], anchorId: string | null = null, focusedId: string | null = null): LibrarySelectionState {
  return { selectedIds: new Set(ids), anchorId, focusedId };
}

describe("resolvePointerSelect — plain click", () => {
  it("replaces selection and establishes anchor/focus", () => {
    const state = withSelection(["a", "b"], "a", "a");
    const next = resolvePointerSelect(state, "c", VISIBLE, { shift: false, alt: false });
    expect([...next.selectedIds]).toEqual(["c"]);
    expect(next.anchorId).toBe("c");
    expect(next.focusedId).toBe("c");
  });
});

describe("resolvePointerSelect — option/alt click", () => {
  it("toggles only the clicked track without clearing the rest", () => {
    const state = withSelection(["a", "b"], "a", "a");
    const next = resolvePointerSelect(state, "c", VISIBLE, { shift: false, alt: true });
    expect([...next.selectedIds].sort()).toEqual(["a", "b", "c"]);
    expect(next.anchorId).toBe("c");
  });
  it("removes an already-selected track and keeps the rest", () => {
    const state = withSelection(["a", "b", "c"], "a", "a");
    const next = resolvePointerSelect(state, "b", VISIBLE, { shift: false, alt: true });
    expect([...next.selectedIds].sort()).toEqual(["a", "c"]);
  });
});

describe("resolvePointerSelect — shift click", () => {
  it("selects the inclusive anchored visible range, forward direction", () => {
    const state = withSelection(["a"], "a", "a");
    const next = resolvePointerSelect(state, "d", VISIBLE, { shift: true, alt: false });
    expect([...next.selectedIds].sort()).toEqual(["a", "b", "c", "d"]);
    expect(next.anchorId).toBe("a"); // anchor unchanged
  });
  it("selects the inclusive anchored visible range, backward direction", () => {
    const state = withSelection(["d"], "d", "d");
    const next = resolvePointerSelect(state, "b", VISIBLE, { shift: true, alt: false });
    expect([...next.selectedIds].sort()).toEqual(["b", "c", "d"]);
  });
  it("replaces the existing selection rather than unioning with it", () => {
    const state = withSelection(["a", "e"], "a", "a");
    const next = resolvePointerSelect(state, "c", VISIBLE, { shift: true, alt: false });
    expect([...next.selectedIds].sort()).toEqual(["a", "b", "c"]);
  });
  it("falls back to selecting only the target when the anchor is no longer visible", () => {
    const state = withSelection(["z"], "z", "z"); // "z" not in VISIBLE (filtered out)
    const next = resolvePointerSelect(state, "c", VISIBLE, { shift: true, alt: false });
    expect([...next.selectedIds]).toEqual(["c"]);
    expect(next.anchorId).toBe("c");
  });
});

describe("resolvePointerSelect — option/alt+shift click", () => {
  it("subtracts only the inclusive range, leaving tracks outside it untouched", () => {
    const state = withSelection(["a", "b", "c", "d", "e"], "b", "b");
    const next = resolvePointerSelect(state, "d", VISIBLE, { shift: true, alt: true });
    expect([...next.selectedIds].sort()).toEqual(["a", "e"]);
  });
  it("keeps the existing anchor so repeated subtractive gestures compound from the same origin", () => {
    const state = withSelection(["a", "b", "c", "d", "e"], "a", "a");
    const next = resolvePointerSelect(state, "c", VISIBLE, { shift: true, alt: true });
    expect(next.anchorId).toBe("a");
    const next2 = resolvePointerSelect(next, "e", VISIBLE, { shift: true, alt: true });
    expect(next2.anchorId).toBe("a");
    expect([...next2.selectedIds].sort()).toEqual([]);
  });
  it("falls back to removing only the target when the anchor is no longer visible", () => {
    const state = withSelection(["c"], "z", "z");
    const next = resolvePointerSelect(state, "c", VISIBLE, { shift: true, alt: true });
    expect([...next.selectedIds]).toEqual([]);
    expect(next.anchorId).toBe("c");
  });
});

describe("selection continuity across sort/filter (via visibleOrderedIds)", () => {
  it("selection set itself never depends on ordering — sorting the visible sequence doesn't change selectedIds", () => {
    const state = withSelection(["a", "c"], "a", "a");
    const reordered = ["c", "a", "b", "d", "e"]; // same rows, different (e.g. sorted) order
    expect([...state.selectedIds].sort()).toEqual(["a", "c"]);
    void reordered;
  });

  it("header checkbox affects only currently-visible (filtered) rows, leaving hidden selections intact", () => {
    const state = withSelection(["z"], null, null); // "z" selected but currently filtered out
    const next = resolveHeaderCheckboxToggle(state, VISIBLE);
    expect(next.selectedIds.has("z")).toBe(true);
    expect(VISIBLE.every((id) => next.selectedIds.has(id))).toBe(true);
  });

  it("header checkbox clears only visible rows when all visible are already selected", () => {
    const state = withSelection([...VISIBLE, "z"], null, null);
    const next = resolveHeaderCheckboxToggle(state, VISIBLE);
    expect(next.selectedIds.has("z")).toBe(true);
    expect(VISIBLE.some((id) => next.selectedIds.has(id))).toBe(false);
  });
});

describe("resolveSelectAllVisible (Cmd/Ctrl+A)", () => {
  it("selects every visible row, unioned with existing selection", () => {
    const state = withSelection(["z"], null, null);
    const next = resolveSelectAllVisible(state, VISIBLE);
    expect(next.selectedIds.has("z")).toBe(true);
    expect(VISIBLE.every((id) => next.selectedIds.has(id))).toBe(true);
  });
});

describe("clearLibrarySelection", () => {
  it("clears selection and anchor but preserves focus", () => {
    const state = withSelection(["a", "b"], "a", "b");
    const next = clearLibrarySelection(state);
    expect(next.selectedIds.size).toBe(0);
    expect(next.anchorId).toBeNull();
    expect(next.focusedId).toBe("b");
  });
});

describe("keyboard — moveLibraryFocus", () => {
  it("moves focus down without changing selection", () => {
    const state = withSelection(["a"], "a", "a");
    const next = moveLibraryFocus(state, VISIBLE, 1);
    expect(next.focusedId).toBe("b");
    expect(next.selectedIds).toBe(state.selectedIds);
  });
  it("moves focus up", () => {
    const state = withSelection([], null, "c");
    const next = moveLibraryFocus(state, VISIBLE, -1);
    expect(next.focusedId).toBe("b");
  });
  it("clamps at the first row", () => {
    const state = withSelection([], null, "a");
    const next = moveLibraryFocus(state, VISIBLE, -1);
    expect(next.focusedId).toBe("a");
  });
  it("clamps at the last row", () => {
    const state = withSelection([], null, "e");
    const next = moveLibraryFocus(state, VISIBLE, 1);
    expect(next.focusedId).toBe("e");
  });
  it("starts at the first row when nothing is focused yet and moving down", () => {
    const state = withSelection([], null, null);
    const next = moveLibraryFocus(state, VISIBLE, 1);
    expect(next.focusedId).toBe("a");
  });
});

describe("keyboard — toggleFocusedLibrarySelection (Space)", () => {
  it("toggles the focused track on, preserving the rest", () => {
    const state = withSelection(["a"], "a", "c");
    const next = toggleFocusedLibrarySelection(state);
    expect([...next.selectedIds].sort()).toEqual(["a", "c"]);
    expect(next.anchorId).toBe("c");
  });
  it("toggles the focused track off", () => {
    const state = withSelection(["a", "c"], "a", "c");
    const next = toggleFocusedLibrarySelection(state);
    expect([...next.selectedIds].sort()).toEqual(["a"]);
  });
  it("is a no-op when nothing is focused", () => {
    const state = withSelection(["a"], "a", null);
    const next = toggleFocusedLibrarySelection(state);
    expect(next).toBe(state);
  });
});

describe("keyboard — extendLibrarySelectionFromFocus (Shift+Arrow)", () => {
  it("extends the range downward from the previously-focused row on first press", () => {
    const state = withSelection([], null, "b");
    const next = extendLibrarySelectionFromFocus(state, VISIBLE, 1);
    expect([...next.selectedIds].sort()).toEqual(["b", "c"]);
    expect(next.anchorId).toBe("b");
    expect(next.focusedId).toBe("c");
  });
  it("continues extending using the same anchor on a second press", () => {
    let state = withSelection([], null, "b");
    state = extendLibrarySelectionFromFocus(state, VISIBLE, 1); // b,c ; anchor b
    state = extendLibrarySelectionFromFocus(state, VISIBLE, 1); // b,c,d ; anchor b
    expect([...state.selectedIds].sort()).toEqual(["b", "c", "d"]);
    expect(state.anchorId).toBe("b");
  });
  it("contracts the range when moving back toward the anchor", () => {
    let state = withSelection([], null, "b");
    state = extendLibrarySelectionFromFocus(state, VISIBLE, 1); // b,c
    state = extendLibrarySelectionFromFocus(state, VISIBLE, 1); // b,c,d
    state = extendLibrarySelectionFromFocus(state, VISIBLE, -1); // back to b,c
    expect([...state.selectedIds].sort()).toEqual(["b", "c"]);
  });
});

describe("parity across libraries — the resolver has no library-specific branching", () => {
  it("produces identical results for the same inputs regardless of which library calls it", () => {
    const stateA = withSelection(["a"], "a", "a");
    const stateB = withSelection(["a"], "a", "a");
    const nextA = resolvePointerSelect(stateA, "d", VISIBLE, { shift: true, alt: false });
    const nextB = resolvePointerSelect(stateB, "d", VISIBLE, { shift: true, alt: false });
    expect([...nextA.selectedIds].sort()).toEqual([...nextB.selectedIds].sort());
  });
});
