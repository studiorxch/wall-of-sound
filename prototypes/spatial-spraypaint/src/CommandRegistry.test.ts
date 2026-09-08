import { describe, expect, it } from "vitest";
import { COMMAND_DEFINITIONS, findShortcutConflicts, resolveCommandId } from "./CommandRegistry";

const keyEvent = (key: string, overrides = {}) => ({
  key,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  repeat: false,
  ...overrides,
});

describe("command registry", () => {
  it("keeps every active shortcut unique", () => {
    expect(findShortcutConflicts()).toEqual([]);
    expect(new Set(COMMAND_DEFINITIONS.map((command) => command.id)).size).toBe(COMMAND_DEFINITIONS.length);
  });

  it("resolves standard undo on Command or Control Z", () => {
    expect(resolveCommandId(keyEvent("z", { metaKey: true }))).toBe("undo");
    expect(resolveCommandId(keyEvent("Z", { ctrlKey: true }))).toBe("undo");
    expect(resolveCommandId(keyEvent("z"))).toBeNull();
  });

  it("uses Space for playback and rejects repeats or modified forms", () => {
    expect(resolveCommandId(keyEvent(" "))).toBe("play-pause");
    expect(resolveCommandId(keyEvent(" ", { repeat: true }))).toBeNull();
    expect(resolveCommandId(keyEvent(" ", { metaKey: true }))).toBeNull();
  });
});
