import { describe, expect, it } from "vitest";
import { resolvePointerSelect, emptyLibrarySelectionState } from "../library/librarySelection";
import { isVoiceRowControlTarget, voiceRowSelectionModifiers } from "./voiceRowSelection";

const ROWS = ["one", "two", "three", "four"];

describe("VOICE row selection gestures", () => {
  it("selects one row on an ordinary click", () => {
    const next = resolvePointerSelect(emptyLibrarySelectionState(), "two", ROWS, voiceRowSelectionModifiers({ shiftKey: false, altKey: false, metaKey: false, ctrlKey: false }));
    expect([...next.selectedIds]).toEqual(["two"]);
  });

  it("adds or removes an individual row with Cmd/Ctrl click", () => {
    const selected = resolvePointerSelect(emptyLibrarySelectionState(), "one", ROWS, voiceRowSelectionModifiers({ shiftKey: false, altKey: false, metaKey: false, ctrlKey: false }));
    const added = resolvePointerSelect(selected, "three", ROWS, voiceRowSelectionModifiers({ shiftKey: false, altKey: false, metaKey: true, ctrlKey: false }));
    expect([...added.selectedIds].sort()).toEqual(["one", "three"]);
    const removed = resolvePointerSelect(added, "one", ROWS, voiceRowSelectionModifiers({ shiftKey: false, altKey: false, metaKey: false, ctrlKey: true }));
    expect([...removed.selectedIds]).toEqual(["three"]);
  });

  it("selects the inclusive row range with Shift click", () => {
    const anchor = resolvePointerSelect(emptyLibrarySelectionState(), "one", ROWS, voiceRowSelectionModifiers({ shiftKey: false, altKey: false, metaKey: false, ctrlKey: false }));
    const range = resolvePointerSelect(anchor, "three", ROWS, voiceRowSelectionModifiers({ shiftKey: true, altKey: false, metaKey: false, ctrlKey: false }));
    expect([...range.selectedIds].sort()).toEqual(["one", "three", "two"]);
  });

  it("recognizes inline controls so their click does not become a row selection", () => {
    const insideControl = { closest: (selector: string) => selector === "[data-voice-row-control]" ? {} : null } as unknown as EventTarget;
    const ordinaryCell = { closest: () => null } as unknown as EventTarget;
    expect(isVoiceRowControlTarget(insideControl)).toBe(true);
    expect(isVoiceRowControlTarget(ordinaryCell)).toBe(false);
  });
});
