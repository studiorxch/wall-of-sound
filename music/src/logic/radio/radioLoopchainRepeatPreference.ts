// 0722A_RADIOOS_Loopchain_Player_Web_Demo §2.2 — Low/Medium/High repeat
// preference, mapped by structural role rather than one universal
// multiplier. Pure — no DOM, no Node.
//
// The concrete counts below are a documented, deliberately easy-to-tune
// placeholder table — the spec gives no numbers, and real tuning against
// real chains belongs to the (out-of-scope for 0722A) Stage 2 listening
// pass. Change this table freely; nothing else in the codebase depends on
// its exact values.
//
// intro/outro are handled here too (forced to 1x) as defense-in-depth, but
// per spec §2.1 the interface layer never actually calls this for an
// intro/outro block in the first place (no editable repeat control exists
// for them at all), and radioLoopchainEditor.ts's setBlockRepeatMode/
// setBlockRepeatPreference independently enforce the same 1x floor —
// this function is the third, redundant layer, not the primary one.

import type { LoopchainRepeatMode, LoopchainRepeatPreference } from "../../data/radioLoopchainTypes";
import type { SongStructuralType } from "../../data/songAnalysisTypes";

const REPETITION_FRIENDLY_ROLES: SongStructuralType[] = ["chorus", "body", "bridge"];
const FORWARD_MOVING_ROLES: SongStructuralType[] = ["verse", "breakdown", "interlude"];

const REPETITION_FRIENDLY_COUNTS: Record<LoopchainRepeatPreference, number> = { low: 2, medium: 4, high: 8 };
const FORWARD_MOVING_COUNTS: Record<LoopchainRepeatPreference, number> = { low: 1, medium: 2, high: 4 };
const CONSERVATIVE_COUNTS: Record<LoopchainRepeatPreference, number> = { low: 1, medium: 2, high: 3 };

export function resolveRepeatPreference(
  structuralType: SongStructuralType,
  preference: LoopchainRepeatPreference,
): LoopchainRepeatMode {
  if (structuralType === "intro" || structuralType === "outro") {
    return { mode: "repeatCount", count: 1 };
  }
  const table = REPETITION_FRIENDLY_ROLES.includes(structuralType)
    ? REPETITION_FRIENDLY_COUNTS
    : FORWARD_MOVING_ROLES.includes(structuralType)
      ? FORWARD_MOVING_COUNTS
      : CONSERVATIVE_COUNTS;
  return { mode: "repeatCount", count: table[preference] };
}
