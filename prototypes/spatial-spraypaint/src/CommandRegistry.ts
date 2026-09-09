export type CommandId =
  | "undo"
  | "clear"
  | "pan"
  | "quick-zoom"
  | "zoom-in"
  | "zoom-out"
  | "reset-view"
  | "settings"
  | "record"
  | "close-settings";
export type CommandCategory = "Canvas" | "Session" | "Interface";

export interface CommandDefinition {
  id: CommandId;
  label: string;
  shortcut: string;
  category: CommandCategory;
  description: string;
  key: string;
  modifier?: "mod" | "shift";
}

export interface Command extends CommandDefinition {
  action: () => void | Promise<void>;
}

export interface CommandKeyEvent {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat: boolean;
  target: EventTarget | null;
  preventDefault(): void;
}

export const COMMAND_DEFINITIONS: readonly CommandDefinition[] = [
  { id: "undo", label: "Undo last stroke", shortcut: "⌘/Ctrl Z", category: "Canvas", description: "Remove the most recently completed stroke.", key: "z", modifier: "mod" },
  { id: "clear", label: "Clear canvas", shortcut: "Shift Delete", category: "Canvas", description: "Clear painted strokes; Undo restores them.", key: "delete", modifier: "shift" },
  { id: "pan", label: "Pan wall", shortcut: "Space + drag", category: "Canvas", description: "Hold Space and drag to move the wall without painting.", key: " " },
  { id: "quick-zoom", label: "Quick Zoom", shortcut: "Z", category: "Canvas", description: "Toggle a detail view and restore the exact previous composition view.", key: "z" },
  { id: "zoom-in", label: "Zoom in", shortcut: "+", category: "Canvas", description: "Increase wall magnification around the working point.", key: "+" },
  { id: "zoom-out", label: "Zoom out", shortcut: "−", category: "Canvas", description: "Decrease wall magnification around the working point.", key: "-" },
  { id: "reset-view", label: "Reset view", shortcut: "0", category: "Canvas", description: "Return to the default wall origin and 100% zoom.", key: "0" },
  { id: "record", label: "Start / stop recording", shortcut: "R", category: "Session", description: "Start recording, or stop and save the current performance.", key: "r" },
  { id: "settings", label: "Open / close settings", shortcut: ",", category: "Interface", description: "Toggle the temporary Settings panel.", key: "," },
  { id: "close-settings", label: "Close settings", shortcut: "Esc", category: "Interface", description: "Dismiss Settings without changing the canvas.", key: "escape" },
] as const;

export type CommandActions = Record<CommandId, () => void | Promise<void>>;

export function shortcutIdentity(definition: CommandDefinition): string {
  return `${definition.modifier ?? "none"}:${definition.key.toLowerCase()}`;
}

export function findShortcutConflicts(
  definitions: readonly CommandDefinition[] = COMMAND_DEFINITIONS,
): string[] {
  const seen = new Set<string>();
  const conflicts = new Set<string>();
  for (const definition of definitions) {
    const identity = shortcutIdentity(definition);
    if (seen.has(identity)) conflicts.add(identity);
    seen.add(identity);
  }
  return [...conflicts];
}

export function resolveCommandId(
  event: Pick<CommandKeyEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey" | "repeat">,
  definitions: readonly CommandDefinition[] = COMMAND_DEFINITIONS,
): CommandId | null {
  if (event.repeat || event.altKey || typeof event.key !== "string") return null;
  const rawKey = event.key.toLowerCase();
  const key = rawKey === "backspace" ? "delete" : rawKey === "=" && event.shiftKey ? "+" : rawKey;
  const hasMod = event.metaKey || event.ctrlKey;
  return definitions.find((definition) => {
    if (definition.key !== key) return false;
    if (definition.modifier === "mod") return hasMod && !event.shiftKey;
    if (definition.modifier === "shift") return event.shiftKey && !hasMod;
    return !hasMod && (!event.shiftKey || key === "+");
  })?.id ?? null;
}

export class CommandRegistry {
  private readonly commands: readonly Command[];

  constructor(
    actions: CommandActions,
    private readonly releaseActions: Partial<CommandActions> = {},
  ) {
    this.commands = COMMAND_DEFINITIONS.map((definition) => ({
      ...definition,
      action: actions[definition.id],
    }));
  }

  public list(): readonly Command[] {
    return this.commands;
  }

  public handleKeyboardEvent(event: CommandKeyEvent): boolean {
    const commandId = resolveCommandId(event);
    if (!commandId) return false;
    if (this.isTextEntryTarget(event.target)) return false;
    const command = this.commands.find((candidate) => candidate.id === commandId);
    if (!command) return false;
    event.preventDefault();
    void command.action();
    return true;
  }

  public handleKeyUpEvent(event: CommandKeyEvent): boolean {
    const commandId = resolveCommandId({ ...event, repeat: false });
    if (!commandId || this.isTextEntryTarget(event.target)) return false;
    const action = this.releaseActions[commandId];
    if (!action) return false;
    event.preventDefault();
    void action();
    return true;
  }

  private isTextEntryTarget(target: EventTarget | null): boolean {
    if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) return false;
    return target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName);
  }
}
