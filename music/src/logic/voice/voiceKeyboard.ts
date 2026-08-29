export interface VoiceKeyboardTarget {
  tagName?: string | null;
  isContentEditable?: boolean;
}

/** Keeps library navigation shortcuts out of editable VOICE controls. */
export function isVoiceTextEditingTarget(target: VoiceKeyboardTarget | null | undefined): boolean {
  if (!target) return false;
  const tagName = target.tagName?.toUpperCase();
  return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT" || target.isContentEditable === true;
}
