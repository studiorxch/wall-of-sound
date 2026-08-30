import type { PointerSelectModifiers } from "../library/librarySelection";

export interface VoiceRowPointerEvent {
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
}

/** Maps platform-specific row gestures to MUSIC's shared selection resolver. */
export function voiceRowSelectionModifiers(event: VoiceRowPointerEvent): PointerSelectModifiers {
  return {
    shift: event.shiftKey,
    alt: event.altKey || event.metaKey || event.ctrlKey,
  };
}

export function isVoiceRowControlTarget(target: EventTarget | null): boolean {
  const candidate = target as { closest?: (selector: string) => unknown } | null;
  return typeof candidate?.closest === "function" && candidate.closest("[data-voice-row-control]") != null;
}
