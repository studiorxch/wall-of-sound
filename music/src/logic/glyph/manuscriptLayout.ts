// Glyph Audio — Manuscript Rows layout
// (docs/glyph-audio/07_GLYPH_AUDIO_Layout_Spec.md, "Version-one layout:
// Manuscript Rows"). Arranges an already-generated glyph sequence; never
// reanalyzes the music or changes glyph meanings. Time progresses left to
// right, rows progress top to bottom, wrapping occurs strictly at bar
// boundaries (never character-count word-wrap —
// 10_GLYPH_AUDIO_Acceptance_Criteria.md §8).
//
// This slice's single combined section (beatUnitDerivation.ts) means
// `sectionStartsNewRow`/`preserveSilence`/`alignBars` have nothing to act
// on yet (no section boundaries, no silence data, uniform beats-per-bar) —
// they are accepted on ManuscriptLayoutPreset but inert until a later
// build adds section detection and silence.

import type { BeatUnit } from "../../data/glyphAudioTypes";
import type { GeneratedGlyphInstance } from "../../data/glyphGrammarTypes";
import type { GlyphSequenceItem, PlacedGlyph, LayoutDocument, ManuscriptLayoutPreset } from "../../data/glyphLayoutTypes";
import type { ConnectionDecision, ConnectionGrammar } from "../../data/glyphConnectionTypes";

// Extra spacingBefore (in the same beat-width units the layout scales by
// baseBeatWidthMm) contributed by the connection decision leading INTO a
// sequence item — connected pulses get none (the connector line fills the
// gap visually); punctuated boundaries get the grammar's own configured
// gap size (a smaller nudge for a dot/dotCluster/restMark, a full gap for
// an actual "gap"-flavored behavior); a genuine break gets the largest
// nudge, scaled by the grammar's sectionGapMultiplier.
function spacingForDecision(decision: ConnectionDecision | undefined, grammar: ConnectionGrammar | undefined): number {
  if (!decision || !grammar) return 0;
  if (decision.result === "connected") return 0;
  if (decision.result === "broken") return grammar.punctuationGapSize * grammar.sectionGapMultiplier;
  // punctuated
  if (decision.punctuation === "gap") return grammar.punctuationGapSize;
  return grammar.punctuationGapSize * 0.5; // dot / dotCluster / restMark — a smaller nudge, not a full gap
}

export function buildGlyphSequence(
  beats: BeatUnit[],
  glyphInstances: GeneratedGlyphInstance[],
  beatsPerBar: number,
  decisions?: ConnectionDecision[],
  grammar?: ConnectionGrammar,
): GlyphSequenceItem[] {
  const glyphByBeatId = new Map(glyphInstances.map((g) => [g.beatUnitId, g]));
  const safeBeatsPerBar = Math.max(1, beatsPerBar);
  // Keyed by the pulse the decision leads INTO, matching one decision per
  // adjacent pair from glyphRunFormation.ts's buildGlyphRuns.
  const decisionByToPulseId = new Map((decisions ?? []).map((d) => [d.toPulseId, d]));

  return beats
    .map((beat): GlyphSequenceItem => {
      const glyph = glyphByBeatId.get(beat.id);
      return {
        glyphInstanceId: glyph?.id ?? "",
        beatUnitId: beat.id,
        startBeat: beat.startBeat,
        durationBeats: beat.durationBeats,
        barIndex: Math.floor(beat.index / safeBeatsPerBar),
        phraseIndex: null,
        sectionIndex: 0,
        spacingBefore: spacingForDecision(decisionByToPulseId.get(beat.id), grammar),
        spacingAfter: 0,
      };
    })
    .filter((item) => item.glyphInstanceId !== "");
}

export function layoutManuscriptRows(sequence: GlyphSequenceItem[], preset: ManuscriptLayoutPreset): LayoutDocument {
  const barsPerRow = Math.max(1, preset.barsPerRow);
  const placedGlyphs: PlacedGlyph[] = [];

  let orderIndex = 0;
  let currentRow = 0;
  let rowStartBarIndex: number | null = null;
  // A running cursor (rather than columnInRow * baseBeatWidthMm) so
  // spacingBefore/spacingAfter — punctuation and break gaps from the
  // connection grammar — actually shift later glyphs instead of silently
  // overlapping them. Identical to the old fixed-column math whenever every
  // item's spacing is 0 (the case for every pre-connection-grammar caller).
  let cursorX = preset.marginMm;

  for (const item of sequence) {
    if (rowStartBarIndex === null) rowStartBarIndex = item.barIndex;

    const barsIntoRow = item.barIndex - rowStartBarIndex;
    if (barsIntoRow >= barsPerRow) {
      currentRow += 1;
      rowStartBarIndex = item.barIndex;
      cursorX = preset.marginMm;
    }

    cursorX += item.spacingBefore;
    const x = cursorX;
    const rowHeightMm = preset.baseBeatWidthMm * 2;
    const y = preset.marginMm + currentRow * (rowHeightMm + preset.rowGapMm);

    placedGlyphs.push({
      glyphInstanceId: item.glyphInstanceId,
      x,
      y,
      scaleX: 1,
      scaleY: 1,
      rotationDegrees: 0,
      rowIndex: currentRow,
      orderIndex: orderIndex++,
    });

    cursorX += preset.baseBeatWidthMm + item.spacingAfter;
  }

  const rowCount = currentRow + 1;
  const rowHeightMm = preset.baseBeatWidthMm * 2 + preset.rowGapMm;

  return {
    schemaVersion: 1,
    layoutPresetId: preset.id,
    page: {
      widthMm: preset.pageWidthMm,
      heightMm: Math.max(preset.pageHeightMm, preset.marginMm * 2 + rowCount * rowHeightMm),
      marginMm: preset.marginMm,
    },
    placedGlyphs,
  };
}
