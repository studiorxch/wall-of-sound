// 0721_MUSIC_RADIO_Sectional_Loopchain_Player §6 — first-class per-junction
// transition settings. A junction connects two DIFFERENT adjacent blocks
// (a block's own repeats use its own crossfadeDurationSeconds, never a
// junction). Identity is the adjacent block-id pair, never array position
// — reordering preserves a junction whose pair survives the reorder,
// resolved purely from `blocks`' new order each time this runs. Pure — no
// DOM, no Node.

import type { LoopchainBlock, LoopchainJunction } from "../../data/radioLoopchainTypes";

function genJunctionId(): string {
  return `loopchainjct_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function adjacentPairs(blocks: LoopchainBlock[]): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < blocks.length - 1; i++) {
    pairs.push([blocks[i].id, blocks[i + 1].id]);
  }
  return pairs;
}

// Runs after every chain edit (reorder/add/duplicate/remove). Keeps a
// junction as-is when its exact block-id pair is still adjacent; drops one
// whose pair no longer is; seeds a fresh default-crossfade junction for
// every newly-adjacent pair with no existing junction. A duplicated block
// gets a new id, so it is always treated as "newly adjacent" — it never
// inherits the original's junctions.
export function reconcileJunctions(
  blocks: LoopchainBlock[],
  existingJunctions: LoopchainJunction[],
  defaultCrossfadeSeconds: number,
): LoopchainJunction[] {
  const pairs = adjacentPairs(blocks);
  const byPair = new Map(existingJunctions.map((j) => [`${j.outgoingBlockId}::${j.incomingBlockId}`, j]));

  return pairs.map(([outgoingBlockId, incomingBlockId]) => {
    const existing = byPair.get(`${outgoingBlockId}::${incomingBlockId}`);
    if (existing) return existing;
    return {
      id: genJunctionId(),
      outgoingBlockId,
      incomingBlockId,
      crossfadeDurationSeconds: defaultCrossfadeSeconds,
    } satisfies LoopchainJunction;
  });
}
