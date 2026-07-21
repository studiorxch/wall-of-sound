// 0721_MUSIC_RADIO_Sectional_Loopchain_Player §4 — region-bound loop
// playability. Boundary-detection quality (confidence/verification/
// origin/grid trust) describes how reliable a section's EDGES are, not
// whether the audio loops musically — this module never reads any of
// those fields. `loopable` is reachable only through a stored, exact-
// region operator acceptance; everything else falls back to a tiny
// structural default. Pure — no DOM, no Node.

import type { SongStructuralType } from "../../data/songAnalysisTypes";
import type { LoopchainSectionPlayability, RadioLoopchainSectionAcceptance } from "../../data/radioLoopchainTypes";

// The entire default rule: intro/outro can only be played forward once
// (a loop across a fade-in/fade-out boundary is not a meaningful musical
// repeat); everything else is playable/chainable today, pending an
// operator's own judgment on whether repeating it sounds right.
export function defaultPlayability(structuralType: SongStructuralType): LoopchainSectionPlayability {
  if (structuralType === "intro" || structuralType === "outro") return "forward_only";
  return "review";
}

export interface CurrentSectionBounds {
  sourceTrackId: string;
  sectionId: string;
  startFrame: number;
  endFrame: number;
  revisionId?: string;
}

// Exact-region match against stored acceptances wins; anything else
// (including a region that WAS once accepted but has since moved) falls
// back to the structural default. Superseded acceptance records are never
// consulted again here, but this function never deletes them either — it
// only decides which one currently applies, if any.
export function resolveSectionPlayability(
  current: CurrentSectionBounds,
  structuralType: SongStructuralType,
  acceptances: RadioLoopchainSectionAcceptance[],
): LoopchainSectionPlayability {
  const matches = acceptances.some((a) =>
    a.sourceTrackId === current.sourceTrackId &&
    a.sectionId === current.sectionId &&
    a.startFrame === current.startFrame &&
    a.endFrame === current.endFrame &&
    (a.revisionId ?? undefined) === (current.revisionId ?? undefined));
  if (matches) return "loopable";
  return defaultPlayability(structuralType);
}

function genAcceptanceId(): string {
  return `loopchainaccept_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// Builds (never persists) a new acceptance record for the section's
// CURRENT exact bounds — the caller is responsible for actually having
// live-auditioned the region as a repeating loop before calling this.
export function buildSectionAcceptance(
  current: CurrentSectionBounds,
  now: string = new Date().toISOString(),
): RadioLoopchainSectionAcceptance {
  return {
    id: genAcceptanceId(),
    sourceTrackId: current.sourceTrackId,
    sectionId: current.sectionId,
    startFrame: current.startFrame,
    endFrame: current.endFrame,
    revisionId: current.revisionId,
    acceptedAt: now,
  };
}
