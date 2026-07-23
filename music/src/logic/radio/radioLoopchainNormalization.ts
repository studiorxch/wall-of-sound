// 0722A_RADIOOS_Loopchain_Player_Web_Demo §2.1 — repairs an older saved
// chain that already violates the intro/outro single-use invariant (from
// before this build's enforcement existed, or from an external/manual data
// edit). Pure — no DOM, no Node. Never relabels a section's structuralType
// to dodge the rule — a duplicate is removed, never relabeled; an illegal
// repeat count is clamped, never explained away. The one surviving block of
// each role is always the FIRST in chain order — never the "best" one by
// any other measure.

import type { LoopchainBlock, LoopchainDraft } from "../../data/radioLoopchainTypes";
import type { SongStructuralType } from "../../data/songAnalysisTypes";
import { removeBlock } from "./radioLoopchainEditor";

const SINGLE_USE_ROLES: readonly ("intro" | "outro")[] = ["intro", "outro"];

export interface LoopchainNormalizationWarning {
  role: "intro" | "outro";
  // All but the first occurrence in chain order — never relabeled, only removed.
  removedDuplicateBlockIds: string[];
  // The one surviving block of this role, if its repeatMode wasn't already
  // exactly 1x and had to be forced.
  repeatCountClampedBlockIds: string[];
}

export interface LoopchainNormalizationResult {
  draft: LoopchainDraft;
  warnings: LoopchainNormalizationWarning[];
}

export function normalizeIntroOutroSingleUse(
  draft: LoopchainDraft,
  resolveStructuralTypeForBlock: (block: LoopchainBlock) => SongStructuralType | undefined,
): LoopchainNormalizationResult {
  let current = draft;
  const warnings: LoopchainNormalizationWarning[] = [];

  for (const role of SINGLE_USE_ROLES) {
    const matching = current.blocks.filter((b) => resolveStructuralTypeForBlock(b) === role);
    const removedDuplicateBlockIds: string[] = [];
    if (matching.length > 1) {
      // Keep the first in chain order; remove the rest via the
      // already-guarded removeBlock, reusing its reconciliation rather
      // than duplicating that logic here.
      for (const dup of matching.slice(1)) {
        current = removeBlock(current, dup.id);
        removedDuplicateBlockIds.push(dup.id);
      }
    }

    const repeatCountClampedBlockIds: string[] = [];
    const survivor = current.blocks.find((b) => resolveStructuralTypeForBlock(b) === role);
    if (survivor && !(survivor.repeatMode.mode === "repeatCount" && survivor.repeatMode.count === 1)) {
      current = {
        ...current,
        blocks: current.blocks.map((b) =>
          b.id === survivor.id ? { ...b, repeatMode: { mode: "repeatCount" as const, count: 1 }, repeatPreference: undefined } : b,
        ),
      };
      repeatCountClampedBlockIds.push(survivor.id);
    }

    if (removedDuplicateBlockIds.length > 0 || repeatCountClampedBlockIds.length > 0) {
      warnings.push({ role, removedDuplicateBlockIds, repeatCountClampedBlockIds });
    }
  }

  return { draft: current, warnings };
}
