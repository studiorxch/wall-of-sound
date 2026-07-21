// Complete Song Intelligence and Section Map (0717C) — pure revision-record
// helpers for SongSection corrections, mirroring loopRevisions.ts's exact
// doctrine 1:1: a human correction is always a brand-new, append-only
// revision record, never a mutation of the section it corrects. The
// section's own `activeRevisionId` pointer is repointed by the caller;
// resolveActiveSongSection is the ONE sanctioned way to read "this
// section's current corrected state" — merging only the fields the active
// revision actually overrides, falling back to the section's own
// analyzer-origin values for everything else.

import type { SongSection, SongSectionRevision, SongSectionVerification, SongStructuralType } from "../../data/songAnalysisTypes";

function genSongSectionRevisionId(): string {
  return `songsecrev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export interface CreateSongSectionRevisionOptions {
  parentRevisionId?: string;
  structuralType?: SongStructuralType;
  displayLabel?: string;
  startFrame?: number;
  endFrame?: number;
  variationGroupId?: string;
  variationOrdinal?: number;
  verification?: SongSectionVerification;
}

// Never mutates `section` — the caller is responsible for repointing
// SongSection.activeRevisionId at the result.
export function createSongSectionRevision(
  section: SongSection,
  opts: CreateSongSectionRevisionOptions,
  now: string = new Date().toISOString(),
): SongSectionRevision {
  return {
    id: genSongSectionRevisionId(),
    sectionId: section.id,
    parentRevisionId: opts.parentRevisionId,
    structuralType: opts.structuralType,
    displayLabel: opts.displayLabel,
    startFrame: opts.startFrame,
    endFrame: opts.endFrame,
    variationGroupId: opts.variationGroupId,
    variationOrdinal: opts.variationOrdinal,
    verification: opts.verification,
    createdAt: now,
    createdBy: "user",
  };
}

export interface ResolvedSongSection {
  structuralType: SongStructuralType;
  displayLabel: string;
  startFrame: number;
  endFrame: number;
  variationGroupId?: string;
  variationOrdinal?: number;
  verification: SongSectionVerification;
  activeRevision?: SongSectionRevision;
}

// The one shared source of truth for "what is this section's CURRENT
// state right now" — every field the active revision doesn't explicitly
// set falls back to the section's own analyzer-origin value. Unlike
// LoopAsset (seconds-only, needs sampleRate to fall back), SongSection is
// already frame-authoritative, so no conversion is needed on the
// no-revision-yet path.
export function resolveActiveSongSection(section: SongSection, revisions: SongSectionRevision[]): ResolvedSongSection {
  const activeRevision = section.activeRevisionId
    ? revisions.find((r) => r.id === section.activeRevisionId) : undefined;

  return {
    structuralType: activeRevision?.structuralType ?? section.structuralType,
    displayLabel: activeRevision?.displayLabel ?? section.displayLabel,
    startFrame: activeRevision?.startFrame ?? section.startFrame,
    endFrame: activeRevision?.endFrame ?? section.endFrame,
    variationGroupId: activeRevision?.variationGroupId ?? section.variationGroupId,
    variationOrdinal: activeRevision?.variationOrdinal ?? section.variationOrdinal,
    verification: activeRevision?.verification ?? section.verification,
    activeRevision,
  };
}
