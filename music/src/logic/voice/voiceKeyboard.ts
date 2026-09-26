export interface VoiceKeyboardTarget {
  tagName?: string | null;
  isContentEditable?: boolean;
}

/** Keeps library navigation shortcuts out of editable VOICE controls. Accepts a real DOM EventTarget (from event.target, which TS types with no properties of its own) or the plain test-shaped object, same cast pattern voiceRowSelection.ts's isVoiceRowControlTarget already uses. */
export function isVoiceTextEditingTarget(target: EventTarget | VoiceKeyboardTarget | null | undefined): boolean {
  const candidate = target as VoiceKeyboardTarget | null | undefined;
  if (!candidate) return false;
  const tagName = candidate.tagName?.toUpperCase();
  return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT" || candidate.isContentEditable === true;
}
