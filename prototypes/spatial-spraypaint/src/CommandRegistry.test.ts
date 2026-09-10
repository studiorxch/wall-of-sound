import { describe, expect, it } from "vitest";
import { CommandRegistry, COMMAND_DEFINITIONS, findShortcutConflicts, resolveCommandId, type CommandActions } from "./CommandRegistry";

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
    expect(resolveCommandId(keyEvent("z"))).toBe("quick-zoom");
  });

  it("reserves Space for pan readiness and rejects repeats or modified forms", () => {
    expect(resolveCommandId(keyEvent(" "))).toBe("pan");
    expect(resolveCommandId(keyEvent(" ", { repeat: true }))).toBeNull();
    expect(resolveCommandId(keyEvent(" ", { metaKey: true }))).toBeNull();
  });

  it("reserves Shift Delete for undoable Clear without accepting bare Delete", () => {
    expect(resolveCommandId(keyEvent("Delete", { shiftKey: true }))).toBe("clear");
    expect(resolveCommandId(keyEvent("Backspace", { shiftKey: true }))).toBe("clear");
    expect(resolveCommandId(keyEvent("Delete"))).toBeNull();
    expect(resolveCommandId(keyEvent("Delete", { shiftKey: true, metaKey: true }))).toBeNull();
  });

  it("registers quick and precision zoom without shortcut conflicts", () => {
    expect(resolveCommandId(keyEvent("z"))).toBe("quick-zoom");
    expect(resolveCommandId(keyEvent("+"))).toBe("zoom-in");
    expect(resolveCommandId(keyEvent("+", { shiftKey: true }))).toBe("zoom-in");
    expect(resolveCommandId(keyEvent("=", { shiftKey: true }))).toBe("zoom-in");
    expect(resolveCommandId(keyEvent("-"))).toBe("zoom-out");
    expect(resolveCommandId(keyEvent("0"))).toBe("reset-view");
  });

  it("ignores malformed browser key events without throwing", () => {
    expect(resolveCommandId(keyEvent(undefined as unknown as string))).toBeNull();
  });

  it("owns both the start and release phases of the Space pan command", () => {
    let panReady = false;
    const actions = Object.fromEntries(
      COMMAND_DEFINITIONS.map(({ id }) => [id, () => undefined]),
    ) as CommandActions;
    actions.pan = () => { panReady = true; };
    const registry = new CommandRegistry(actions, { pan: () => { panReady = false; } });
    const event = { ...keyEvent(" "), target: null, preventDefault: () => undefined };

    expect(registry.handleKeyboardEvent(event)).toBe(true);
    expect(panReady).toBe(true);
    expect(registry.handleKeyUpEvent(event)).toBe(true);
    expect(panReady).toBe(false);
  });
});
