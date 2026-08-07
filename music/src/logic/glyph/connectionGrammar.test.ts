import { describe, it, expect } from "vitest";
import { decideConnection, DEFAULT_CONNECTION_GRAMMAR, validateConnectionGrammar } from "./connectionGrammar";
import type { BeatUnit } from "../../data/glyphAudioTypes";
import type { ConnectionGrammar, DecideConnectionInput, GlyphEndpoints, ConnectionOverride } from "../../data/glyphConnectionTypes";

function beat(id: string, index: number, overrides: Partial<BeatUnit> = {}): BeatUnit {
  return {
    id, sectionId: "s0", phraseId: null, barId: "bar-0", index, indexWithinBar: index,
    startSeconds: index * 0.5, durationSeconds: 0.375, startBeat: index, durationBeats: 1,
    energy: 0.5, attackSharpness: 0.5, onsetDensity: 0, sustain: 0.5,
    pitchMovement: null, spectralBrightness: null, accentStrength: 0,
    confidence: { value: 0.9, source: "analysis" },
    ...overrides,
  };
}

const closeEndpoints: GlyphEndpoints = { start: { x: 0, y: 0 }, end: { x: 10, y: 0 } };
const nearNextEndpoints: GlyphEndpoints = { start: { x: 12, y: 0 }, end: { x: 22, y: 0 } };
// Same span (10) as closeEndpoints, just placed further along — geometry
// checks compare each glyph's own LOCAL span/baseline (see
// connectionGrammar.ts's header comment), never a cross-frame x position,
// so this is NOT expected to trigger distanceExceeded on its own.
const farButSameSpanEndpoints: GlyphEndpoints = { start: { x: 500, y: 0 }, end: { x: 510, y: 0 } };
// A genuinely much wider neighbor (span 40 vs. 10) — a real size mismatch.
const muchWiderEndpoints: GlyphEndpoints = { start: { x: 0, y: 0 }, end: { x: 40, y: 0 } };

function baseInput(overrides: Partial<DecideConnectionInput> = {}): DecideConnectionInput {
  return {
    fromPulse: beat("b0", 0),
    toPulse: beat("b1", 1),
    fromGlyphInstanceId: "g0",
    toGlyphInstanceId: "g1",
    fromEndpoints: closeEndpoints,
    toEndpoints: nearNextEndpoints,
    basePulseWidth: 10,
    localGlyphHeight: 10,
    boundaryTier: null,
    hasSilenceBetween: false,
    grammar: DEFAULT_CONNECTION_GRAMMAR,
    createdAt: "2026-08-04T00:00:00Z",
    ...overrides,
  };
}

describe("decideConnection — chronology guard", () => {
  it("breaks when toPulse starts before fromPulse (not chronologically adjacent)", () => {
    const d = decideConnection(baseInput({ fromPulse: beat("b1", 1), toPulse: beat("b0", 0) }));
    expect(d.result).toBe("broken");
    expect(d.reason).toBe("chronologyMismatch");
  });
});

describe("decideConnection — connection modes", () => {
  it("never: even same-bar adjacent pulses stay separate", () => {
    const d = decideConnection(baseInput({ grammar: { ...DEFAULT_CONNECTION_GRAMMAR, connectionMode: "never" } }));
    expect(d.result).toBe("broken");
    expect(d.reason).toBe("connectionModeDenied");
  });

  it("withinBar: same-bar pulses connect", () => {
    const d = decideConnection(baseInput({ grammar: { ...DEFAULT_CONNECTION_GRAMMAR, connectionMode: "withinBar" } }));
    expect(d.result).toBe("connected");
  });

  it("withinBar: a bar-crossing pair cannot stay connected even if barBoundaryBehavior is keepConnected", () => {
    const grammar: ConnectionGrammar = { ...DEFAULT_CONNECTION_GRAMMAR, connectionMode: "withinBar", barBoundaryBehavior: "keepConnected" };
    const d = decideConnection(baseInput({ grammar, boundaryTier: "bar" }));
    expect(d.result).toBe("broken");
    expect(d.reason).toBe("connectionModeDenied");
  });

  it("withinSection: a bar crossing still applies barBoundaryBehavior (dot) rather than forcing a hard break", () => {
    const d = decideConnection(baseInput({ grammar: DEFAULT_CONNECTION_GRAMMAR, boundaryTier: "bar" }));
    expect(d.result).toBe("punctuated");
    expect(d.reason).toBe("barBoundary");
    expect(d.punctuation).toBe("dot");
  });

  it("withinSection: a phrase crossing still applies phraseBoundaryBehavior (gap)", () => {
    const d = decideConnection(baseInput({ grammar: DEFAULT_CONNECTION_GRAMMAR, boundaryTier: "phrase" }));
    expect(d.result).toBe("punctuated");
    expect(d.reason).toBe("phraseBoundary");
    expect(d.punctuation).toBe("gap");
  });

  it("withinSection: a section crossing breaks by default", () => {
    const d = decideConnection(baseInput({ grammar: DEFAULT_CONNECTION_GRAMMAR, boundaryTier: "section" }));
    expect(d.result).toBe("broken");
    expect(d.reason).toBe("sectionBoundary");
  });

  it("always: a section crossing with a non-break sectionBoundaryBehavior is not hard-broken by mode", () => {
    const grammar: ConnectionGrammar = { ...DEFAULT_CONNECTION_GRAMMAR, connectionMode: "always", sectionBoundaryBehavior: "largeGap" };
    const d = decideConnection(baseInput({ grammar, boundaryTier: "section" }));
    // largeGap resolves to punctuated, not connected/broken — mode "always"
    // does not upgrade a configured gap into a hard connection.
    expect(d.result).toBe("punctuated");
    expect(d.reason).toBe("sectionBoundary");
  });

  it("always: a break-flavored section boundary behavior still breaks (§14 guard order)", () => {
    const grammar: ConnectionGrammar = { ...DEFAULT_CONNECTION_GRAMMAR, connectionMode: "always" };
    const d = decideConnection(baseInput({ grammar, boundaryTier: "section" }));
    expect(d.result).toBe("broken");
    expect(d.reason).toBe("sectionBoundary");
  });
});

describe("decideConnection — silence boundary", () => {
  it("applies silenceBoundaryBehavior (extendedGap -> punctuated/gap) regardless of tier", () => {
    const d = decideConnection(baseInput({ hasSilenceBetween: true }));
    expect(d.result).toBe("punctuated");
    expect(d.reason).toBe("silenceBoundary");
    expect(d.punctuation).toBe("gap");
  });

  it("silence can break even under always mode, per §7.5", () => {
    const grammar: ConnectionGrammar = { ...DEFAULT_CONNECTION_GRAMMAR, connectionMode: "always", silenceBoundaryBehavior: "break" };
    const d = decideConnection(baseInput({ grammar, hasSilenceBetween: true }));
    expect(d.result).toBe("broken");
    expect(d.reason).toBe("silenceBoundary");
  });
});

describe("decideConnection — manual overrides", () => {
  const override = (action: ConnectionOverride["action"]): ConnectionOverride => ({
    id: "o1", fromPulseId: "b0", toPulseId: "b1", action, createdAt: "2026-08-04T00:00:00Z", updatedAt: "2026-08-04T00:00:00Z",
  });

  it("forceBreak always breaks, even inside the same bar", () => {
    const d = decideConnection(baseInput({ override: override("forceBreak") }));
    expect(d.result).toBe("broken");
    expect(d.reason).toBe("manualOverride");
  });

  it("forceDot produces a punctuated dot", () => {
    const d = decideConnection(baseInput({ override: override("forceDot") }));
    expect(d.result).toBe("punctuated");
    expect(d.punctuation).toBe("dot");
  });

  it("forceGap produces a punctuated gap", () => {
    const d = decideConnection(baseInput({ override: override("forceGap") }));
    expect(d.result).toBe("punctuated");
    expect(d.punctuation).toBe("gap");
  });

  it("forceNewRow breaks (layout consumers treat this as a hard row split)", () => {
    const d = decideConnection(baseInput({ override: override("forceNewRow") }));
    expect(d.result).toBe("broken");
  });

  it("forceConnect overrides a section break when geometry is safe", () => {
    const d = decideConnection(baseInput({ grammar: DEFAULT_CONNECTION_GRAMMAR, boundaryTier: "section", override: override("forceConnect") }));
    expect(d.result).toBe("connected");
    expect(d.reason).toBe("manualOverride");
  });

  it("forceConnect does NOT override an impossible geometry/layout boundary", () => {
    const d = decideConnection(baseInput({ override: override("forceConnect"), toEndpoints: muchWiderEndpoints }));
    expect(d.result).toBe("broken");
    expect(d.reason).toBe("distanceExceeded");
  });

  it("forceConnect does not override a layout row/page crossing", () => {
    const d = decideConnection(baseInput({ override: override("forceConnect"), layoutConstraints: { crossesRow: true } }));
    expect(d.result).toBe("broken");
    expect(d.reason).toBe("layoutBoundary");
  });
});

describe("decideConnection — geometry guards", () => {
  it("does not break just because the neighbor's local endpoints sit at a different x offset (independent coordinate frames)", () => {
    const d = decideConnection(baseInput({ toEndpoints: farButSameSpanEndpoints }));
    expect(d.result).toBe("connected");
  });

  it("breaks when the neighbor's own local span is much wider (a real size mismatch)", () => {
    const d = decideConnection(baseInput({ toEndpoints: muchWiderEndpoints }));
    expect(d.result).toBe("broken");
    expect(d.reason).toBe("distanceExceeded");
  });

  it("breaks when baseline delta exceeds the threshold", () => {
    const highEndpoints: GlyphEndpoints = { start: { x: 12, y: -10 }, end: { x: 22, y: -10 } };
    const d = decideConnection(baseInput({ toEndpoints: highEndpoints }));
    expect(d.result).toBe("broken");
    expect(d.reason).toBe("baselineDeltaExceeded");
  });

  it("breaks on non-finite endpoints (geometryIncompatible)", () => {
    const bad: GlyphEndpoints = { start: { x: NaN, y: 0 }, end: { x: 10, y: 0 } };
    const d = decideConnection(baseInput({ toEndpoints: bad }));
    expect(d.result).toBe("broken");
    expect(d.reason).toBe("geometryIncompatible");
  });

  it("breaks on a degenerate (zero-span) glyph", () => {
    const degenerate: GlyphEndpoints = { start: { x: 5, y: 0 }, end: { x: 5, y: 0 } };
    const d = decideConnection(baseInput({ toEndpoints: degenerate }));
    expect(d.result).toBe("broken");
    expect(d.reason).toBe("geometryIncompatible");
  });

  it("breaks on a moderate baseline mismatch when minor crossings are disallowed (collision)", () => {
    const grammar: ConnectionGrammar = { ...DEFAULT_CONNECTION_GRAMMAR, allowMinorCrossings: false };
    // maxBaselineDelta = localGlyphHeight(10) * 0.6 = 6; this sits above the
    // 0.5x tolerance (3) but below the hard max (6).
    const moderate: GlyphEndpoints = { start: { x: 12, y: -4 }, end: { x: 22, y: -4 } };
    const d = decideConnection(baseInput({ grammar, toEndpoints: moderate }));
    expect(d.result).toBe("broken");
    expect(d.reason).toBe("collisionDetected");
  });

  it("allows the same moderate baseline mismatch when minor crossings are enabled", () => {
    const grammar: ConnectionGrammar = { ...DEFAULT_CONNECTION_GRAMMAR, allowMinorCrossings: true };
    const moderate: GlyphEndpoints = { start: { x: 12, y: -4 }, end: { x: 22, y: -4 } };
    const d = decideConnection(baseInput({ grammar, toEndpoints: moderate }));
    expect(d.result).toBe("connected");
  });

  it("connects and attaches connectorMode + connectorPathData on success", () => {
    const d = decideConnection(baseInput());
    expect(d.result).toBe("connected");
    expect(d.reason).toBe("sameRun");
    expect(d.connectorMode).toBe(DEFAULT_CONNECTION_GRAMMAR.connectorMode);
    expect(d.connectorPathData).toBeTruthy();
  });
});

describe("decideConnection — determinism", () => {
  it("produces byte-identical decisions for identical input", () => {
    const a = decideConnection(baseInput());
    const b = decideConnection(baseInput());
    expect(a).toEqual(b);
  });
});

describe("validateConnectionGrammar", () => {
  it("clamps negative thresholds to zero", () => {
    const dirty: ConnectionGrammar = { ...DEFAULT_CONNECTION_GRAMMAR, connectorDistanceMultiplier: -5, punctuationGapSize: -1 };
    const clean = validateConnectionGrammar(dirty);
    expect(clean.connectorDistanceMultiplier).toBe(0);
    expect(clean.punctuationGapSize).toBe(0);
  });

  it("clamps tension/smoothing into [0,1]", () => {
    const dirty: ConnectionGrammar = { ...DEFAULT_CONNECTION_GRAMMAR, connectorTension: 5, connectorSmoothing: -2 };
    const clean = validateConnectionGrammar(dirty);
    expect(clean.connectorTension).toBe(1);
    expect(clean.connectorSmoothing).toBe(0);
  });

  it("leaves an already-valid grammar unchanged", () => {
    expect(validateConnectionGrammar(DEFAULT_CONNECTION_GRAMMAR)).toEqual(DEFAULT_CONNECTION_GRAMMAR);
  });
});
