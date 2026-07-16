// Canonical key-transition scoring (0713_MUSIC_Playlist_BPM_Key_Sequencing
// §10). Reuses getCamelotPenalty — does not re-derive Camelot compatibility.

import { getCamelotPenalty, isValidCamelotKey } from "../camelot";

const NEUTRAL_SCORE = 0.5;
const MAX_PENALTY = 40; // getCamelotPenalty's own worst-case ceiling

export function normalizeCamelotPenalty(penalty: number): number {
  return Math.max(0, Math.min(1, 1 - penalty / MAX_PENALTY));
}

// Untrusted or missing key must remain neutral (§10, §21) — callers pass
// `undefined` for any key that failed trust gating (isKeyTrustedForAnalysis),
// this function itself only validates FORMAT, not provenance/confidence,
// since that's the caller's job (avoids duplicating trust logic here).
export function scoreKeyTransition(fromKey: string | undefined, toKey: string | undefined): { score: number; penalty?: number } {
  if (!isValidCamelotKey(fromKey) || !isValidCamelotKey(toKey)) {
    return { score: NEUTRAL_SCORE };
  }
  const penalty = getCamelotPenalty(fromKey, toKey);
  return { score: normalizeCamelotPenalty(penalty), penalty };
}
