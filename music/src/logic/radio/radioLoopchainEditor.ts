// 0721_MUSIC_RADIO_Sectional_Loopchain_Player — pure chain-editing
// operations. Every op that changes block adjacency (add/reorder/
// duplicate/remove) reconciles junctions immediately afterward, so the
// draft returned from any of these functions is always internally
// consistent — callers never need to remember to call reconcileJunctions
// themselves. Pure — no DOM, no Node.
//
// 0722A_RADIOOS_Loopchain_Player_Web_Demo §2.1 — intro/outro single-use
// enforcement lives here, at the domain-logic layer, in THREE places:
// (1) addBlock/duplicateBlock reject a second intro/outro block outright
// (via hasExistingIntroOrOutroUse below); (2) setBlockRepeatMode/
// setBlockRepeatPreference force an intro/outro block's repeatMode to
// exactly 1x regardless of what's requested, closing the gap a
// preference-resolver default alone can't (an operator could otherwise
// hand-edit an intro block's exact count via the advanced disclosure).
// (3) Older saved drafts are repaired by radioLoopchainNormalization.ts,
// which reuses removeBlock below rather than duplicating reconciliation
// logic. This module still never reaches into songAnalyses itself — every
// caller supplies the section's already-resolved structuralType/role
// lookup, keeping this file pure/DOM-free.

import type { LoopchainBlock, LoopchainDraft, LoopchainRepeatMode, LoopchainRepeatPreference } from "../../data/radioLoopchainTypes";
import type { SongStructuralType } from "../../data/songAnalysisTypes";
import { reconcileJunctions } from "./radioLoopchainJunctions";
import { resolveRepeatPreference } from "./radioLoopchainRepeatPreference";

const ONE_TIME_ONLY_ROLES: SongStructuralType[] = ["intro", "outro"];

function forcesSingleRepeat(structuralType: SongStructuralType): boolean {
  return ONE_TIME_ONLY_ROLES.includes(structuralType);
}

// Intro and outro are independently single-use — one intro max AND one
// outro max, not "one of either combined." Scans via a caller-supplied
// resolver so this module never touches songAnalyses directly.
export function hasExistingIntroOrOutroUse(
  draft: LoopchainDraft,
  structuralType: SongStructuralType,
  resolveStructuralTypeForBlock: (block: LoopchainBlock) => SongStructuralType | undefined,
): boolean {
  if (!forcesSingleRepeat(structuralType)) return false;
  return draft.blocks.some((b) => resolveStructuralTypeForBlock(b) === structuralType);
}

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
  // The section's resolved structural role — the caller already knows this
  // (via resolveActiveSongSection against songAnalyses) before calling
  // addBlock; making it explicit here is what lets this module enforce the
  // intro/outro invariant without reaching into songAnalyses itself.
  structuralType: SongStructuralType;
}

export type AddBlockResult =
  | { ok: true; draft: LoopchainDraft }
  | { ok: false; reason: "intro_outro_already_used"; existingBlockId: string };

// Appends a new block referencing a real section (never a copy of audio)
// to the end of the chain. Rejects a second intro or a second outro block
// outright — a normal, expected user outcome (not the kind of exceptional
// condition this module reserves thrown errors for), so it's modeled as
// data, not a throw.
export function addBlock(
  draft: LoopchainDraft,
  input: AddBlockInput,
  resolveStructuralTypeForBlock: (block: LoopchainBlock) => SongStructuralType | undefined,
  now: string = new Date().toISOString(),
): AddBlockResult {
  if (hasExistingIntroOrOutroUse(draft, input.structuralType, resolveStructuralTypeForBlock)) {
    const existing = draft.blocks.find((b) => resolveStructuralTypeForBlock(b) === input.structuralType)!;
    return { ok: false, reason: "intro_outro_already_used", existingBlockId: existing.id };
  }
  const repeatMode = forcesSingleRepeat(input.structuralType) ? { mode: "repeatCount" as const, count: 1 } : input.repeatMode;
  const block: LoopchainBlock = {
    id: genBlockId(),
    sourceTrackId: input.sourceTrackId,
    sectionId: input.sectionId,
    repeatMode,
    crossfadeDurationSeconds: input.crossfadeDurationSeconds ?? draft.defaultCrossfadeDurationSeconds,
  };
  return { ok: true, draft: touch(draft, [...draft.blocks, block], now) };
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
// never inherits the original's junctions. Duplicating an intro/outro
// block is exactly the same invariant violation as adding a second one, so
// it's rejected the same way.
export function duplicateBlock(
  draft: LoopchainDraft,
  blockId: string,
  resolveStructuralTypeForBlock: (block: LoopchainBlock) => SongStructuralType | undefined,
  now: string = new Date().toISOString(),
): AddBlockResult {
  const index = draft.blocks.findIndex((b) => b.id === blockId);
  if (index === -1) return { ok: true, draft };
  const original = draft.blocks[index];
  const structuralType = resolveStructuralTypeForBlock(original);
  if (structuralType && hasExistingIntroOrOutroUse(draft, structuralType, resolveStructuralTypeForBlock)) {
    return { ok: false, reason: "intro_outro_already_used", existingBlockId: original.id };
  }
  const copy: LoopchainBlock = { ...original, id: genBlockId() };
  const next = draft.blocks.slice();
  next.splice(index + 1, 0, copy);
  return { ok: true, draft: touch(draft, next, now) };
}

// Removes one chain occurrence (a block reference) — never touches the
// source section itself, which continues to exist independent of the
// chain.
export function removeBlock(draft: LoopchainDraft, blockId: string, now: string = new Date().toISOString()): LoopchainDraft {
  const next = draft.blocks.filter((b) => b.id !== blockId);
  if (next.length === draft.blocks.length) return draft;
  return touch(draft, next, now);
}

// §2.1 — an intro/outro block's repeatMode is ALWAYS forced to exactly 1x
// here, regardless of what's requested. This is the domain-logic backstop
// for a state the interface layer should never even offer an affordance
// to reach (no editable repeat control is rendered for intro/outro blocks
// at all) — a silent clamp, not a rejection, since it's not a routine
// outcome a normal user flow needs surfaced like addBlock's rejection is.
export function setBlockRepeatMode(
  draft: LoopchainDraft,
  blockId: string,
  repeatMode: LoopchainRepeatMode,
  structuralType: SongStructuralType,
  now: string = new Date().toISOString(),
): LoopchainDraft {
  const effective = forcesSingleRepeat(structuralType) ? { mode: "repeatCount" as const, count: 1 } : repeatMode;
  const next = draft.blocks.map((b) => (b.id === blockId ? { ...b, repeatMode: effective, repeatPreference: undefined } : b));
  return { ...draft, blocks: next, updatedAt: now };
}

// §2.2 — the Low/Medium/High control. Resolves the concrete repeatMode via
// resolveRepeatPreference and stores the preference label alongside it (so
// the interface layer can highlight which of the three buttons is active
// without recomputing every render — though it still recomputes to detect
// divergence after a subsequent hand-edit). Same intro/outro 1x floor as
// setBlockRepeatMode above.
export function setBlockRepeatPreference(
  draft: LoopchainDraft,
  blockId: string,
  preference: LoopchainRepeatPreference,
  structuralType: SongStructuralType,
  now: string = new Date().toISOString(),
): LoopchainDraft {
  const repeatMode = resolveRepeatPreference(structuralType, preference);
  const next = draft.blocks.map((b) => (b.id === blockId ? { ...b, repeatMode, repeatPreference: preference } : b));
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
