// 0715C_MUSIC_Loop_Workspace_Editing_And_Revision_Completion §21-§25 —
// pure revision-record helpers for the LIVE editor workflow (create a new
// revision, or update the active one). The v1-synthesis step for EXISTING
// approved loops lives in its own dedicated, versioned, idempotent
// migration module (data/migrations/migrateLoopRevisionsV1.ts) — not here,
// per the completion plan's "Migration" decision.

import type { LoopAsset, LoopRevision } from "../../data/loopTypes";
import type { LoopRenderRecord } from "../../data/loopRenderTypes";

function genRevisionId(): string {
  return `rev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export interface CreateRevisionOptions {
  parentRevisionId?: string;
  label?: string;
  gridRevisionId?: string;
  segmentationRevisionId?: string;
  createdBy: LoopRevision["createdBy"];
}

// §21/§23 — a brand-new revision, never mutating the loop's own stored
// boundaries. The caller is responsible for repointing `LoopAsset.
// activeRevisionId` at the result and flipping render status toward stale.
export function createRevision(
  loop: LoopAsset,
  bounds: { startFrame: number; endFrame: number },
  opts: CreateRevisionOptions,
  now: string = new Date().toISOString(),
): LoopRevision {
  return {
    id: genRevisionId(),
    loopId: loop.id,
    parentRevisionId: opts.parentRevisionId,
    startFrame: bounds.startFrame,
    endFrame: bounds.endFrame,
    label: opts.label ?? loop.title,
    gridRevisionId: opts.gridRevisionId,
    segmentationRevisionId: opts.segmentationRevisionId,
    createdAt: now,
    createdBy: opts.createdBy,
  };
}

// §24 — "Update Existing": preserves the prior revision by returning a NEW
// revision object linked via parentRevisionId (never mutates the prior
// revision record in place), while the caller repoints activeRevisionId at
// it. "Update existing" differs from "create new revision" only in UX
// framing (no second, visible history branch) — the underlying data
// operation is identical: append, then repoint.
export function updateExistingRevision(
  loop: LoopAsset,
  priorRevision: LoopRevision,
  bounds: { startFrame: number; endFrame: number },
  opts: Omit<CreateRevisionOptions, "parentRevisionId">,
  now: string = new Date().toISOString(),
): LoopRevision {
  return createRevision(loop, bounds, { ...opts, parentRevisionId: priorRevision.id }, now);
}

// 0715D_MUSIC_0715C_Live_Verification_And_Typecheck_Process_Repair — the
// ONE shared source of truth for "what are this loop's CURRENT bounds
// right now." Live verification caught two real defects that were both
// the same root cause spread across four separate call sites (App.tsx's
// render pipeline, the Selection Inspector, the Loop Bin row builder, and
// LoopLibraryView): rendering and staleness checks were comparing against
// the loop's own frozen ORIGINAL startSeconds/endSeconds instead of its
// ACTIVE REVISION's bounds, so (a) rendering silently re-rendered the
// wrong region once any revision existed, and (b) any revisioned loop
// read "stale" forever, even immediately after a fresh, fully up-to-date
// render. All four call sites now resolve through this single function
// instead of repeating the "find the active revision, else fall back"
// logic inline.
export interface ActiveLoopBoundsFrames {
  startFrame: number;
  endFrame: number;
  activeRevision?: LoopRevision;
}

// `sampleRate` is only needed for the fallback path — LoopAsset stores no
// frame fields of its own (only seconds), while LoopRevision is
// frame-authoritative, so converting the no-revision-yet case requires it.
export function resolveActiveLoopBoundsFrames(
  loop: LoopAsset,
  revisions: LoopRevision[],
  sampleRate: number,
): ActiveLoopBoundsFrames {
  const activeRevision = loop.activeRevisionId
    ? revisions.find((r) => r.id === loop.activeRevisionId) : undefined;
  if (activeRevision) {
    return { startFrame: activeRevision.startFrame, endFrame: activeRevision.endFrame, activeRevision };
  }
  return {
    startFrame: Math.round(loop.startSeconds * sampleRate),
    endFrame: Math.round(loop.endSeconds * sampleRate),
    activeRevision: undefined,
  };
}

// §25 — compact before/after summary. Bars are computed from the grid's
// beat spacing when available so "8 bars → 7.99 bars" style output is
// possible; falls back to a plain seconds label otherwise.
export interface RevisionCompareSummary {
  startBeforeSeconds: number;
  startAfterSeconds: number;
  endBeforeSeconds: number;
  endAfterSeconds: number;
  durationBeforeSeconds: number;
  durationAfterSeconds: number;
  barsBefore?: number;
  barsAfter?: number;
}

// 0715E_MUSIC_Loop_Revision_Activation_And_Stem_Source_Entry — the implicit
// "v1 · original" revision has no stored LoopRevision record and is
// represented in code as `null`, while `LoopAsset.activeRevisionId` and
// `LoopRenderRecord.renderedRevisionId` represent that same "original"
// state as `undefined` (an absent field). `null !== undefined` under `===`,
// so any bare comparison between a timeline entry's `id` and one of those
// fields would silently misclassify the original revision as inactive or
// as stale against its own render. These two functions are the ONLY
// sanctioned way to compare a revision identity anywhere in this feature.
export function normalizeRevisionId(id: string | null | undefined): string | null {
  return id ?? null;
}

export function revisionIdsMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  return normalizeRevisionId(a) === normalizeRevisionId(b);
}

// §8 — one ordered timeline entry per revision, plus a synthetic leading
// entry for the implicit original (id: null) that exists even when the
// loop has never been revisioned. `isActive` always goes through
// `revisionIdsMatch` so the original entry correctly reads active when
// `loop.activeRevisionId` is `undefined`.
export interface RevisionTimelineEntry {
  id: string | null;
  label: string;
  startFrame: number;
  endFrame: number;
  createdAt: string;
  createdBy: LoopRevision["createdBy"] | "original";
  isActive: boolean;
}

export function buildRevisionTimeline(
  loop: LoopAsset,
  revisions: LoopRevision[],
  sampleRate: number,
): RevisionTimelineEntry[] {
  const loopRevisions = revisions
    .filter((r) => r.loopId === loop.id)
    .slice()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const originalEntry: RevisionTimelineEntry = {
    id: null,
    label: "v1 · Original",
    startFrame: Math.round(loop.startSeconds * sampleRate),
    endFrame: Math.round(loop.endSeconds * sampleRate),
    createdAt: loop.createdAt ?? "",
    createdBy: "original",
    isActive: revisionIdsMatch(null, loop.activeRevisionId),
  };

  const revisionEntries: RevisionTimelineEntry[] = loopRevisions.map((r, index) => ({
    id: r.id,
    label: `v${index + 2} · ${r.label}`,
    startFrame: r.startFrame,
    endFrame: r.endFrame,
    createdAt: r.createdAt,
    createdBy: r.createdBy,
    isActive: revisionIdsMatch(r.id, loop.activeRevisionId),
  }));

  return [originalEntry, ...revisionEntries];
}

// §7 — pure confirmation-gate check: would activating `targetRevisionId`
// make the given render stale? Only ever compares live, contemporaneous
// values at the moment of a fresh user decision (never historical/legacy
// render records), so strict normalized-identity equality is correct here
// — unlike loopRenderStaleness.ts's `isRenderStale`, which deliberately
// keeps a more conservative "both sides must be concretely defined" guard
// for arbitrary historical renders where an absent `renderedRevisionId`
// may just mean "predates this field, unknown" rather than "original."
export function wouldActivationStaleRender(
  render: LoopRenderRecord | undefined,
  targetRevisionId: string | null,
): boolean {
  if (!render || render.status !== "rendered") return false;
  return !revisionIdsMatch(render.renderedRevisionId, targetRevisionId);
}

export function buildRevisionCompareSummary(
  prev: { startFrame: number; endFrame: number },
  next: { startFrame: number; endFrame: number },
  sampleRate: number,
  barFrameLength?: number,
): RevisionCompareSummary {
  const durationBeforeFrames = prev.endFrame - prev.startFrame;
  const durationAfterFrames = next.endFrame - next.startFrame;
  return {
    startBeforeSeconds: prev.startFrame / sampleRate,
    startAfterSeconds: next.startFrame / sampleRate,
    endBeforeSeconds: prev.endFrame / sampleRate,
    endAfterSeconds: next.endFrame / sampleRate,
    durationBeforeSeconds: durationBeforeFrames / sampleRate,
    durationAfterSeconds: durationAfterFrames / sampleRate,
    barsBefore: barFrameLength ? durationBeforeFrames / barFrameLength : undefined,
    barsAfter: barFrameLength ? durationAfterFrames / barFrameLength : undefined,
  };
}
