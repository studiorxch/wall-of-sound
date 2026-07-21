// Complete Song Intelligence and Section Map (0717C) — maps the existing
// deriveStructuralSections() heuristic output (0715B, intro/body/outro/
// section) into the new persisted SongSection model. Reuses that detector
// verbatim (spec §3.1's explicit permission to start with the simpler
// existing vocabulary) rather than reimplementing structural detection.
//
// Stable ids are assigned ONCE here, at mapping time — never derived from
// startFrame/endFrame. StructuralSectionBand.id is explicitly
// non-deterministic (Date.now()/Math.random(), see structuralSections.ts)
// and unsafe to persist; SongSection records ARE persisted and mutated in
// place via drag, so they need their own independent, stable identity.

import type { StructuralSectionBand, StructuralSectionLabel } from "../../data/loopTypes";
import type { SongSection, SongStructuralType } from "../../data/songAnalysisTypes";

const LABEL_MAP: Record<StructuralSectionLabel, SongStructuralType> = {
  intro: "intro",
  body: "body",
  outro: "outro",
  section: "unknown",
};

const CONFIDENCE_MAP: Record<StructuralSectionBand["confidence"], number> = {
  high: 0.85,
  provisional: 0.4,
};

export function mapStructuralBandsToSongSections(
  bands: StructuralSectionBand[],
  sourceTrackId: string,
  genId: () => string,
): SongSection[] {
  return bands.map((band) => ({
    id: genId(),
    sourceTrackId,
    structuralType: LABEL_MAP[band.label],
    displayLabel: band.displayLabel,
    startFrame: band.startFrame,
    endFrame: band.endFrame,
    confidence: CONFIDENCE_MAP[band.confidence],
    verification: "provisional",
    origin: "analyzer",
  }));
}
