// 0722C_MUSIC_Production_Stem_Export — shared role-guessing for the
// salvage/legacy-migration flows. Deliberately a fresh module rather than
// reaching into src/logic/loops/stemRegistration.ts (the deprecated
// top-level-track system's own copy of this same regex) — the two systems
// stay dependency-clean of each other even though the pattern is identical.

import { STEM_ROLES, type StemRole } from "../../data/trackStemTypes";

const ROLE_PATTERNS: Record<StemRole, RegExp> = {
  drums: /drum/i,
  bass: /bass/i,
  vocals: /vocal/i,
  other: /other/i,
};

// Returns null when a filename doesn't match any known role, so the
// caller must prompt for an explicit manual assignment rather than guessing.
export function matchStemRoleFromFileName(fileName: string): StemRole | null {
  for (const role of STEM_ROLES) {
    if (ROLE_PATTERNS[role].test(fileName)) return role;
  }
  return null;
}
