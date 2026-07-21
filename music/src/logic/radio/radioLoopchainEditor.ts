// 0721_MUSIC_RADIO_Sectional_Loopchain_Player — pure chain-editing
// operations. Every op that changes block adjacency (add/reorder/
// duplicate/remove) reconciles junctions immediately afterward, so the
// draft returned from any of these functions is always internally
// consistent — callers never need to remember to call reconcileJunctions
// themselves. Pure — no DOM, no Node.

import type { LoopchainBlock, LoopchainDraft, LoopchainRepeatMode } from "../../data/radioLoopchainTypes";
import { reconcileJunctions } from "./radioLoopchainJunctions";

function genBlockId(): string {
  return `loopchainblk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function touch(draft: LoopchainDraft, blocks: LoopchainBlock[], now: string): LoopchainDraft {
  return {
    ...draft,
    blocks,
    junctions: reconcileJunctions(blocks, draft.junctions, draft.defaultCrossfadeDurationSeconds),
    updatedAt: now,
  };
}

export interface AddBlockInput {
  sourceTrackId: string;
  sectionId: string;
  repeatMode: LoopchainRepeatMode;
  crossfadeDurationSeconds?: number;
}

// Appends a new block referencing a real section (never a copy of audio)
// to the end of the chain.
export function addBlock(draft: LoopchainDraft, input: AddBlockInput, now: string = new Date().toISOString()): LoopchainDraft {
  const block: LoopchainBlock = {
    id: genBlockId(),
    sourceTrackId: input.sourceTrackId,
    sectionId: input.sectionId,
    repeatMode: input.repeatMode,
    crossfadeDurationSeconds: input.crossfadeDurationSeconds ?? draft.defaultCrossfadeDurationSeconds,
  };
  return touch(draft, [...draft.blocks, block], now);
}

// Moves the block at `fromIndex` to `toIndex` (both bounds-checked; a
// no-op if either is out of range or they're equal).
export function reorderBlock(draft: LoopchainDraft, fromIndex: number, toIndex: number, now: string = new Date().toISOString()): LoopchainDraft {
  const blocks = draft.blocks;
  if (fromIndex === toIndex || fromIndex < 0 || fromIndex >= blocks.length || toIndex < 0 || toIndex >= blocks.length) {
    return draft;
  }
  const next = blocks.slice();
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return touch(draft, next, now);
}

// Inserts a fresh-id reference to the SAME section immediately after the
// original — never a copy of the audio, and (per reconcileJunctions)
// never inherits the original's junctions.
export function duplicateBlock(draft: LoopchainDraft, blockId: string, now: string = new Date().toISOString()): LoopchainDraft {
  const index = draft.blocks.findIndex((b) => b.id === blockId);
  if (index === -1) return draft;
  const original = draft.blocks[index];
  const copy: LoopchainBlock = { ...original, id: genBlockId() };
  const next = draft.blocks.slice();
  next.splice(index + 1, 0, copy);
  return touch(draft, next, now);
}

// Removes one chain occurrence (a block reference) — never touches the
// source section itself, which continues to exist independent of the
// chain.
export function removeBlock(draft: LoopchainDraft, blockId: string, now: string = new Date().toISOString()): LoopchainDraft {
  const next = draft.blocks.filter((b) => b.id !== blockId);
  if (next.length === draft.blocks.length) return draft;
  return touch(draft, next, now);
}

export function setBlockRepeatMode(draft: LoopchainDraft, blockId: string, repeatMode: LoopchainRepeatMode, now: string = new Date().toISOString()): LoopchainDraft {
  const next = draft.blocks.map((b) => (b.id === blockId ? { ...b, repeatMode } : b));
  return { ...draft, blocks: next, updatedAt: now };
}

// Compressed chain-strip label, e.g. "A ×12" for a fixed repeat count, or
// "A → 95s" for a target-residence block — never a fabricated musical
// section name (`displayLabel` is passed in from the section's own
// resolved, honest label).
export function formatBlockLabel(displayLabel: string, repeatMode: LoopchainRepeatMode): string {
  if (repeatMode.mode === "repeatCount") return `${displayLabel} ×${repeatMode.count}`;
  return `${displayLabel} → ${repeatMode.seconds}s`;
}
