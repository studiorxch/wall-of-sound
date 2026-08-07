// Glyph Notes — explicit run formation
// (docs/glyph-audio/0804_GLYPH_NOTES_Connection_Grammar_Spec_v0.1.0.md §13, §23).
//
// This is the ONE place connection decisions and runs get built as real,
// inspectable data (GlyphRun[]/ConnectionDecision[]/ConnectionWarning[]) —
// never computed ad hoc inside a render function, matching the pipeline
// ordering in §17 (Connection Grammar -> Glyph Run Formation -> Manuscript
// Layout -> SVG Export). Boundary tier (bar/phrase/section) between two
// adjacent pulses is derived directly from their own sectionId/phraseId/barId
// fields — more robust than positionally matching against the separate
// `boundaries` list, and always self-consistent with the beats actually
// being connected.

import type { BeatUnit } from "../../data/glyphAudioTypes";
import type { GeneratedGlyphInstance } from "../../data/glyphGrammarTypes";
import type { LayoutDocument } from "../../data/glyphLayoutTypes";
import type {
  BuildGlyphRunsInput, BuildGlyphRunsOutput, ConnectionDecision, ConnectionWarning,
  GlyphRun, BoundaryTier, GlyphDiagnostics,
} from "../../data/glyphConnectionTypes";
import { decideConnection, validateConnectionGrammar } from "./connectionGrammar";
import { getArchEndpoints } from "./connectorGeometry";

function detectBoundaryTier(from: BeatUnit, to: BeatUnit): BoundaryTier {
  if (to.sectionId !== from.sectionId) return "section";
  if (to.phraseId !== from.phraseId) return "phrase";
  if (to.barId !== from.barId) return "bar";
  return null;
}

const WARNING_REASONS = new Set(["distanceExceeded", "baselineDeltaExceeded", "collisionDetected", "layoutBoundary"]);

function startRun(pulse: BeatUnit, glyphByBeatId: Map<string, GeneratedGlyphInstance>): GlyphRun {
  const instance = glyphByBeatId.get(pulse.id);
  return {
    id: `run-${pulse.id}`,
    sectionId: pulse.sectionId,
    phraseId: pulse.phraseId,
    barIds: [pulse.barId],
    pulseIds: [pulse.id],
    glyphInstanceIds: instance ? [instance.id] : [],
    connectionDecisions: [],
    startBeat: pulse.startBeat,
    endBeat: pulse.startBeat + pulse.durationBeats,
  };
}

function extendRun(run: GlyphRun, pulse: BeatUnit, glyphByBeatId: Map<string, GeneratedGlyphInstance>): void {
  const instance = glyphByBeatId.get(pulse.id);
  run.pulseIds.push(pulse.id);
  if (instance) run.glyphInstanceIds.push(instance.id);
  if (!run.barIds.includes(pulse.barId)) run.barIds.push(pulse.barId);
  run.endBeat = pulse.startBeat + pulse.durationBeats;
}

export function buildGlyphRuns(input: BuildGlyphRunsInput): BuildGlyphRunsOutput {
  const grammar = validateConnectionGrammar(input.grammar);
  const glyphByBeatId = new Map(input.glyphs.map((g) => [g.beatUnitId, g]));

  // §25 "Reject missing pulse-to-glyph mappings" / "Reject unsorted pulse
  // input" — pulses without a matching generated glyph are excluded (a
  // defensive case only; the current pipeline always generates one
  // instance per beat) and the remainder is sorted chronologically before
  // anything else runs, regardless of input order.
  const pulses = input.pulses
    .filter((p) => glyphByBeatId.has(p.id))
    .slice()
    .sort((a, b) => a.startBeat - b.startBeat);

  const overrideByPair = new Map(input.overrides.map((o) => [`${o.fromPulseId}->${o.toPulseId}`, o]));

  const decisions: ConnectionDecision[] = [];
  const warnings: ConnectionWarning[] = [];

  for (let i = 0; i < pulses.length - 1; i++) {
    const fromPulse = pulses[i];
    const toPulse = pulses[i + 1];
    const fromInstance = glyphByBeatId.get(fromPulse.id)!;
    const toInstance = glyphByBeatId.get(toPulse.id)!;

    const boundaryTier = detectBoundaryTier(fromPulse, toPulse);
    // Confirmed beats are contiguous (beatUnitDerivation.ts sets
    // startBeat=index, durationBeats=1 with no gaps), so there is no empty
    // "room" strictly between fromPulse's end and toPulse's start for a
    // SilenceUnit to occupy — instead, detect any silence whose own
    // interval overlaps the pair's combined span
    // [fromPulse.startBeat, toPulse.startBeat).
    const hasSilenceBetween = input.silences.some(
      (s) => s.startBeat < toPulse.startBeat && s.startBeat + s.durationBeats > fromPulse.startBeat,
    );

    const fromEndpoints = getArchEndpoints(fromInstance.parameters);
    const toEndpoints = getArchEndpoints(toInstance.parameters);
    const basePulseWidth = (fromInstance.parameters.width + toInstance.parameters.width) / 2;
    const localGlyphHeight = (fromInstance.parameters.height + toInstance.parameters.height) / 2;
    const override = overrideByPair.get(`${fromPulse.id}->${toPulse.id}`);

    let decision: ConnectionDecision;
    try {
      decision = decideConnection({
        fromPulse, toPulse,
        fromGlyphInstanceId: fromInstance.id, toGlyphInstanceId: toInstance.id,
        fromEndpoints, toEndpoints, basePulseWidth, localGlyphHeight,
        boundaryTier, hasSilenceBetween, grammar, override,
        layoutConstraints: input.layoutConstraints, createdAt: input.createdAt,
      });
    } catch {
      // §25 "Never allow one failed connector to abort the whole
      // composition" — one unexpected exception degrades to a break for
      // this pair only; every other pair is unaffected.
      decision = {
        id: `conn-${fromPulse.id}-${toPulse.id}`,
        fromPulseId: fromPulse.id, toPulseId: toPulse.id,
        fromGlyphInstanceId: fromInstance.id, toGlyphInstanceId: toInstance.id,
        result: "broken", reason: "renderFallback", createdAt: input.createdAt,
      };
    }

    decisions.push(decision);

    if (WARNING_REASONS.has(decision.reason)) {
      warnings.push({ type: decision.reason as "distanceExceeded" | "baselineDeltaExceeded" | "collisionDetected" | "layoutBoundary", fromPulseId: fromPulse.id, toPulseId: toPulse.id });
    }
    if (override?.action === "forceConnect" && decision.result !== "connected") {
      warnings.push({ type: "manualOverrideRejected", fromPulseId: fromPulse.id, toPulseId: toPulse.id, reason: decision.reason });
    }
  }

  const runs: GlyphRun[] = [];
  if (pulses.length > 0) {
    let current = startRun(pulses[0], glyphByBeatId);
    for (let i = 0; i < pulses.length - 1; i++) {
      const decision = decisions[i];
      current.connectionDecisions.push(decision);
      // Only a genuine break closes a run — punctuation (dot/gap/etc) still
      // represents one continuous passage (§7.4 "may punctuate without
      // forcing complete disconnection").
      if (decision.result === "broken") {
        runs.push(current);
        current = startRun(pulses[i + 1], glyphByBeatId);
      } else {
        extendRun(current, pulses[i + 1], glyphByBeatId);
      }
    }
    runs.push(current);
  }

  return { runs, decisions, warnings };
}

export function summarizeGlyphRuns(
  pulses: BeatUnit[],
  glyphs: GeneratedGlyphInstance[],
  output: BuildGlyphRunsOutput,
  layout?: LayoutDocument,
): GlyphDiagnostics {
  return {
    sourcePulses: pulses.length,
    generatedArches: glyphs.length,
    connectionCandidates: output.decisions.length,
    connectedPairs: output.decisions.filter((d) => d.result === "connected").length,
    brokenPairs: output.decisions.filter((d) => d.result === "broken").length,
    punctuatedBoundaries: output.decisions.filter((d) => d.result === "punctuated").length,
    runs: output.runs.length,
    rows: layout ? new Set(layout.placedGlyphs.map((g) => g.rowIndex)).size : 0,
    pages: layout ? 1 : 0, // multi-page pagination is not built this slice
    visiblePulses: layout ? layout.placedGlyphs.length : glyphs.length,
  };
}

// §25 "User-Facing Errors" — a short, plain-language summary when one or
// more pairs fell back to a break because their connector path could not be
// constructed. Returns null when nothing needs surfacing.
export function describeConnectionFallbacks(decisions: ConnectionDecision[]): string | null {
  const count = decisions.filter((d) => d.reason === "renderFallback").length;
  if (count === 0) return null;
  return `Connection grammar could not be applied to ${count} pulse pair${count === 1 ? "" : "s"}. Those pairs were rendered as breaks.`;
}
