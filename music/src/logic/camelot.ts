// 0712_MUSIC_BPM_Key_Persistence_Repair — canonical Camelot validity check.
// A syntactically-plausible-but-fabricated default (e.g. "1A" stamped at
// track creation) parses fine via parseCamelotKey, so callers that need to
// distinguish "really detected" from "just happens to match the regex" still
// need this — the real fix is upstream (stop stamping fake defaults), this is
// the shared validator so downstream code can check before trusting a value.
export function isValidCamelotKey(value: unknown): value is string {
  return typeof value === "string" && /^(?:[1-9]|1[0-2])[AB]$/.test(value);
}

// Pitch-class index (0=C, 1=C#, 2=D, ... 11=B) → Camelot code, per the
// standard Camelot wheel. Single canonical conversion table (0712_MUSIC_BPM_
// Key_Detection_Engine §7.3 "use one canonical note-to-Camelot conversion
// utility") — do not re-derive this mapping elsewhere.
export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

const MAJOR_CAMELOT_BY_PITCH_CLASS: Record<number, string> = {
  0: "8B", 7: "9B", 2: "10B", 9: "11B", 4: "12B", 11: "1B",
  6: "2B", 1: "3B", 8: "4B", 3: "5B", 10: "6B", 5: "7B",
};

const MINOR_CAMELOT_BY_PITCH_CLASS: Record<number, string> = {
  9: "8A", 4: "9A", 11: "10A", 6: "11A", 1: "12A", 8: "1A",
  3: "2A", 10: "3A", 5: "4A", 0: "5A", 7: "6A", 2: "7A",
};

export function noteModeToCamelot(pitchClass: number, mode: "major" | "minor"): string | null {
  const table = mode === "major" ? MAJOR_CAMELOT_BY_PITCH_CLASS : MINOR_CAMELOT_BY_PITCH_CLASS;
  return table[((pitchClass % 12) + 12) % 12] ?? null;
}

export function parseCamelotKey(key: string): { number: number; letter: "A" | "B" } | null {
  const match = key.match(/^(1[0-2]|[1-9])([AB])$/);
  if (!match) return null;
  return { number: parseInt(match[1], 10), letter: match[2] as "A" | "B" };
}

export function getCamelotPenalty(fromKey: string, toKey: string): number {
  const from = parseCamelotKey(fromKey);
  const to = parseCamelotKey(toKey);
  if (!from || !to) return 40;

  const numDiff = Math.min(
    Math.abs(from.number - to.number),
    12 - Math.abs(from.number - to.number)
  );
  const sameNumber = numDiff === 0;
  const sameLetter = from.letter === to.letter;

  if (sameNumber && sameLetter) return 0;
  if (sameNumber && !sameLetter) return 4;
  if (numDiff === 1 && sameLetter) return 6;
  if (numDiff === 1 && !sameLetter) return 12;
  if (numDiff === 2) return 18;
  if (numDiff <= 4) return 30;
  return 40;
}
