// Glyph Notes — connection decision function
// (docs/glyph-audio/0804_GLYPH_NOTES_Connection_Grammar_Spec_v0.1.0.md §6, §14).
//
// Reconciling §7 (mode prose) with §14 (the literal guard list): §7.5
// ("always" mode) reads as if section boundaries never block it, but §14's
// guard list puts "section boundary behavior is break/newRow/newPage ->
// break" ahead of the mode check, with "earlier rules override later rules"
// (§6). This implementation follows §14 literally: a break-flavored section
// boundary behavior always breaks the run, even under "always" mode, unless
// a manual forceConnect + safe geometry (also earlier in the guard list)
// overrides it. This is the smallest, most literal reading of the spec's
// own priority-ordered guard list and is documented here for a future spec
// revision to confirm or correct.
//
// A second reconciliation: §7 also describes "mode" and "boundary
// behavior" as two independent axes — mode says whether a CONNECTOR is
// allowed to span a given structural tier at all; boundary behavior says
// what happens at that tier's edge (dot/gap/break/etc) independent of mode,
// as long as mode doesn't forbid it entirely. Implemented as: resolve the
// boundary's own configured behavior first, then apply the connection
// mode only as a ceiling that can downgrade an already-"connected" outcome
// to "broken" (never upgrade a configured break/punctuation into a
// connection) — this is what makes §7.4's "Bar and phrase boundaries may
// punctuate without forcing complete disconnection" true even though
// withinSection mode still lets bar/phrase crossings through.

import type {
  ConnectionGrammar, ConnectionResult, ConnectionReason, ConnectionDecision,
  DecideConnectionInput, BoundaryTier, PunctuationType,
} from "../../data/glyphConnectionTypes";
import { buildConnectorPath } from "./connectorGeometry";

export const DEFAULT_CONNECTION_GRAMMAR: ConnectionGrammar = {
  id: "connection-within-section-v1",
  schemaVersion: 1,
  name: "Connected Sections",

  connectionMode: "withinSection",

  barBoundaryBehavior: "dot",
  phraseBoundaryBehavior: "gap",
  sectionBoundaryBehavior: "break",
  silenceBoundaryBehavior: "extendedGap",

  connectorMode: "softSag",

  connectorDistanceMultiplier: 1.75,
  maxBaselineDeltaMultiplier: 0.6,
  allowMinorCrossings: true,
  allowConnectorOverrun: false,

  connectorSagAmount: 0.18,
  connectorRiseAmount: 0,
  connectorTension: 0.5,
  connectorSmoothing: 0.65,

  punctuationDotSize: 1,
  punctuationGapSize: 1.5,
  sectionGapMultiplier: 2.5,
  restMarkScale: 1,

  createdAt: "",
  updatedAt: "",
};

// §25 "Reject invalid grammar ranges / negative connector thresholds" —
// clamped defensively rather than thrown, so one malformed saved grammar
// (e.g. loaded from an older/hand-edited record) can never abort a whole
// composition's regeneration.
export function validateConnectionGrammar(grammar: ConnectionGrammar): ConnectionGrammar {
  return {
    ...grammar,
    connectorDistanceMultiplier: Math.max(0, grammar.connectorDistanceMultiplier),
    maxBaselineDeltaMultiplier: Math.max(0, grammar.maxBaselineDeltaMultiplier),
    connectorSagAmount: Math.max(0, grammar.connectorSagAmount),
    connectorRiseAmount: Math.max(0, grammar.connectorRiseAmount),
    connectorTension: Math.max(0, Math.min(1, grammar.connectorTension)),
    connectorSmoothing: Math.max(0, Math.min(1, grammar.connectorSmoothing)),
    punctuationDotSize: Math.max(0, grammar.punctuationDotSize),
    punctuationGapSize: Math.max(0, grammar.punctuationGapSize),
    sectionGapMultiplier: Math.max(0, grammar.sectionGapMultiplier),
    restMarkScale: Math.max(0, grammar.restMarkScale),
  };
}

function resolveBoundaryBehavior(behavior: string): { result: ConnectionResult; punctuation?: PunctuationType } {
  switch (behavior) {
    case "keepConnected": return { result: "connected" };
    case "dot": return { result: "punctuated", punctuation: "dot" };
    case "smallGap": return { result: "punctuated", punctuation: "gap" };
    case "gap": return { result: "punctuated", punctuation: "gap" };
    case "break": return { result: "broken" };
    case "dotAndGap": return { result: "punctuated", punctuation: "dot" };
    case "dotCluster": return { result: "punctuated", punctuation: "dotCluster" };
    case "breakAndDot": return { result: "broken", punctuation: "dot" };
    case "breakAndDotCluster": return { result: "broken", punctuation: "dotCluster" };
    case "largeGap": return { result: "punctuated", punctuation: "gap" };
    case "newRow": return { result: "broken" };
    case "newOrbit": return { result: "broken" };
    case "newPage": return { result: "broken" };
    case "extendedGap": return { result: "punctuated", punctuation: "gap" };
    case "restMark": return { result: "punctuated", punctuation: "restMark" };
    // §25 "Reject unsupported boundary behavior" — safe fallback, never a crash.
    default: return { result: "broken" };
  }
}

function behaviorForTier(tier: "bar" | "phrase" | "section", grammar: ConnectionGrammar): string {
  if (tier === "bar") return grammar.barBoundaryBehavior;
  if (tier === "phrase") return grammar.phraseBoundaryBehavior;
  return grammar.sectionBoundaryBehavior;
}

function reasonForTier(tier: "bar" | "phrase" | "section"): ConnectionReason {
  if (tier === "bar") return "barBoundary";
  if (tier === "phrase") return "phraseBoundary";
  return "sectionBoundary";
}

// Whether this connection mode can EVER let a connector span the given
// tier (null = same bar, no boundary at all). Used only as a ceiling on an
// already-"connected" tentative outcome — see file header.
function modeCeilingAllows(mode: ConnectionGrammar["connectionMode"], tier: BoundaryTier): boolean {
  switch (mode) {
    case "never": return false;
    case "withinBar": return tier === null;
    case "withinPhrase": return tier === null || tier === "bar";
    case "withinSection": return tier === null || tier === "bar" || tier === "phrase";
    case "always": return true;
  }
}

function isFiniteXY(p: { x: number; y: number }): boolean {
  return Number.isFinite(p.x) && Number.isFinite(p.y);
}

export function decideConnection(input: DecideConnectionInput): ConnectionDecision {
  const {
    fromPulse, toPulse, fromGlyphInstanceId, toGlyphInstanceId,
    fromEndpoints, toEndpoints, basePulseWidth, localGlyphHeight,
    boundaryTier, hasSilenceBetween, grammar, override, layoutConstraints, createdAt,
  } = input;

  function decision(
    result: ConnectionResult,
    reason: ConnectionReason,
    extra?: Partial<Pick<ConnectionDecision, "connectorMode" | "punctuation" | "connectorPathData">>,
  ): ConnectionDecision {
    return {
      id: `conn-${fromPulse.id}-${toPulse.id}`,
      fromPulseId: fromPulse.id,
      toPulseId: toPulse.id,
      fromGlyphInstanceId,
      toGlyphInstanceId,
      result,
      reason,
      createdAt,
      ...extra,
    };
  }

  // Step 1 — chronological adjacency guard.
  if (toPulse.startBeat < fromPulse.startBeat) {
    return decision("broken", "chronologyMismatch");
  }

  // Step 2 — manual override (takes precedence over every automatic rule, §8.5).
  if (override) {
    if (override.action === "forceBreak") return decision("broken", "manualOverride");
    if (override.action === "forceDot") return decision("punctuated", "manualOverride", { punctuation: "dot" });
    if (override.action === "forceGap") return decision("punctuated", "manualOverride", { punctuation: "gap" });
    if (override.action === "forceNewRow") return decision("broken", "manualOverride");
    // forceConnect falls through to the geometry chain below (still subject
    // to it — "must not override impossible layout or page boundaries").
  }
  const forced = override?.action === "forceConnect";

  let tentativeResult: ConnectionResult;
  let tentativeReason: ConnectionReason;
  let punctuation: PunctuationType | undefined;

  if (forced) {
    tentativeResult = "connected";
    tentativeReason = "manualOverride";
  } else if (hasSilenceBetween) {
    const resolved = resolveBoundaryBehavior(grammar.silenceBoundaryBehavior);
    tentativeResult = resolved.result;
    tentativeReason = "silenceBoundary";
    punctuation = resolved.punctuation;
  } else if (boundaryTier !== null) {
    const resolved = resolveBoundaryBehavior(behaviorForTier(boundaryTier, grammar));
    tentativeResult = resolved.result;
    tentativeReason = reasonForTier(boundaryTier);
    punctuation = resolved.punctuation;

    if (tentativeResult === "connected" && !modeCeilingAllows(grammar.connectionMode, boundaryTier)) {
      tentativeResult = "broken";
      tentativeReason = "connectionModeDenied";
      punctuation = undefined;
    }
  } else if (grammar.connectionMode === "never") {
    tentativeResult = "broken";
    tentativeReason = "connectionModeDenied";
  } else {
    tentativeResult = "connected";
    tentativeReason = "sameRun";
  }

  if (tentativeResult !== "connected") {
    return decision(tentativeResult, tentativeReason, { punctuation });
  }

  // Steps 6-8 — geometry compatibility. fromEndpoints and toEndpoints come
  // from TWO DIFFERENT glyphs, each expressed in its own independent local
  // coordinate frame (run formation happens before manuscript layout
  // assigns real placed positions — see glyphConnectionTypes.ts's
  // ConnectionDecision.connectorPathData comment) — there is no shared
  // coordinate space yet, so a raw x/y difference between fromEndpoints.end
  // and toEndpoints.start is NOT a real physical gap and must never be
  // treated as one. What IS meaningful pre-layout:
  //   - each glyph's own local span (its end.x - start.x, entirely within
  //     its own frame) — comparing two neighbors' spans measures shape/size
  //     compatibility, a legitimate proxy for "would a connector between
  //     these two look visually coherent";
  //   - baseline y (measured relative to each glyph's own nominal baseline
  //     at 0) — legitimately comparable across frames, since it reflects
  //     each glyph's own mapped baselineOffset, not an x-position.
  if (!isFiniteXY(fromEndpoints.start) || !isFiniteXY(fromEndpoints.end)
    || !isFiniteXY(toEndpoints.start) || !isFiniteXY(toEndpoints.end)) {
    return decision("broken", "geometryIncompatible");
  }

  if (layoutConstraints?.crossesRow || layoutConstraints?.crossesPage) {
    return decision("broken", "layoutBoundary");
  }

  const fromSpan = fromEndpoints.end.x - fromEndpoints.start.x;
  const toSpan = toEndpoints.end.x - toEndpoints.start.x;
  if (fromSpan <= 0 || toSpan <= 0) {
    return decision("broken", "geometryIncompatible");
  }

  const sizeMismatch = Math.abs(fromSpan - toSpan);
  const maxConnectorDistance = basePulseWidth * grammar.connectorDistanceMultiplier;
  if (!grammar.allowConnectorOverrun && sizeMismatch > maxConnectorDistance) {
    return decision("broken", "distanceExceeded");
  }

  const baselineDelta = Math.abs(fromEndpoints.end.y - toEndpoints.start.y);
  const maxBaselineDelta = localGlyphHeight * grammar.maxBaselineDeltaMultiplier;
  if (baselineDelta > maxBaselineDelta) {
    return decision("broken", "baselineDeltaExceeded");
  }

  // Collision heuristic (§12.4): a moderate baseline mismatch (above half
  // the hard maximum, but not enough to have already failed the check
  // above) reads as natural handmade overlap when allowMinorCrossings is
  // true, and as a genuine collision risk when it is false.
  const minorCrossingTolerance = maxBaselineDelta * 0.5;
  if (!grammar.allowMinorCrossings && baselineDelta > minorCrossingTolerance) {
    return decision("broken", "collisionDetected");
  }

  const path = buildConnectorPath(fromEndpoints, toEndpoints, grammar);
  if (!path) {
    return decision("broken", "renderFallback");
  }

  return decision("connected", tentativeReason, { connectorMode: grammar.connectorMode, connectorPathData: path });
}
