export type CommandId = "undo" | "settings" | "record" | "play-pause" | "close-settings";
export type CommandCategory = "Canvas" | "Session" | "Interface";

export interface CommandDefinition {
  id: CommandId;
  label: string;
  shortcut: string;
  category: CommandCategory;
  description: string;
  key: string;
  modifier?: "mod";
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
  { id: "play-pause", label: "Play / pause soundtrack", shortcut: "Space", category: "Session", description: "Toggle the loaded session soundtrack.", key: " " },
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
  if (event.repeat || event.altKey || event.shiftKey) return null;
  const key = event.key.toLowerCase();
  const hasMod = event.metaKey || event.ctrlKey;
  return definitions.find((definition) => {
    if (definition.key !== key) return false;
    return definition.modifier === "mod" ? hasMod : !hasMod;
  })?.id ?? null;
}

export class CommandRegistry {
  private readonly commands: readonly Command[];

  constructor(actions: CommandActions) {
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
    if (
      event.target instanceof HTMLButtonElement &&
      commandId === "play-pause"
    ) return false;
    const command = this.commands.find((candidate) => candidate.id === commandId);
    if (!command) return false;
    event.preventDefault();
    void command.action();
    return true;
  }

  private isTextEntryTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName);
  }
}
