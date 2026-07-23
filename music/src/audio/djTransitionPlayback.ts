// DJ Transition Engine (0722D) — the adapter from an authorized
// DjTransitionPlan to the existing canonical transport. Split top/bottom
// like every other engine in this codebase: `compileDjTransition` is pure
// and tested (no I/O, no AudioNode access); `executeCompiledDjTransition`
// is the thin, live-verified-only glue that actually calls the ONE
// existing DualDeckPlaybackEngine — never a second engine, scheduler, or
// deck-state model.
//
// Compilation happens BEFORE any audio-graph mutation (§4 atomic
// fallback): if a plan can't be compiled, nothing about the engine or its
// decks has been touched, and the caller (usePreparedPlaybackController.ts)
// falls straight through to the existing, unmodified legacy transition
// path.

import type { DjTransitionPlan } from "../data/djTransitionTypes";
import type { DualDeckPlaybackEngine } from "./DualDeckPlaybackEngine";
import type { HardCutExecutionResult } from "./dualDeckTypes";

// §5 — the only strategy this build can compile. Every other family
// (phrase/short-rhythmic blends, loop-assisted, stem-assisted, effect,
// reset/bridge, free-time, do-not-place-adjacent) has no real execution
// path in this engine yet and must fail compilation explicitly rather than
// silently falling back to *some* behavior that isn't what the plan says.
export type DjTransitionExecutionStrategy = "clean_cut_hard_cut";

export interface CompiledDjTransitionExecution {
  djPlanId: string;
  strategy: DjTransitionExecutionStrategy;
}

export interface DjTransitionCompilationFailure {
  compiled: false;
  reason: string;
}

export type DjTransitionCompilationResult = ({ compiled: true } & CompiledDjTransitionExecution) | DjTransitionCompilationFailure;

export function compileDjTransition(plan: DjTransitionPlan): DjTransitionCompilationResult {
  if (plan.family !== "clean_cut") {
    return { compiled: false, reason: `No implemented execution strategy for family "${plan.family}" yet.` };
  }
  // Clean Cut compiles to exactly one existing engine primitive
  // (executeHardCut) — there is nothing else to assemble: no EQ curve, no
  // bass-transfer point, no gain envelope beyond what a hard cut already
  // is. Anything the plan carries beyond this (warnings, explanation) is
  // diagnostic-only and never affects the compiled strategy.
  return { compiled: true, djPlanId: plan.id, strategy: "clean_cut_hard_cut" };
}

export interface DjTransitionExecutionOutcome {
  executed: boolean;
  strategy: DjTransitionExecutionStrategy;
  reason?: string;
}

// Live-verified only (drives the real engine/AudioContext — see
// dualDeckPlayback.test.ts's header comment for this repo's established
// convention on why engine-class-driving code has no colocated unit test).
export async function executeCompiledDjTransition(
  engine: DualDeckPlaybackEngine,
  compiled: CompiledDjTransitionExecution,
  outgoingDeckId: "A" | "B",
  incomingDeckId: "A" | "B",
  trigger: "scheduled" | "media_ended",
): Promise<DjTransitionExecutionOutcome> {
  // Clean Cut never uses EQ — explicit bypass here is defense in depth on
  // top of "never call engageDeckEq for this family," so a future bug
  // upstream can't accidentally leave a chain engaged across a Clean Cut.
  engine.bypassDeckEq(outgoingDeckId);
  engine.bypassDeckEq(incomingDeckId);

  const result: HardCutExecutionResult = await engine.executeHardCut(compiled.djPlanId, outgoingDeckId, incomingDeckId, trigger);
  if (result.executed) return { executed: true, strategy: compiled.strategy };
  if (result.reason === "already_promoted") return { executed: true, strategy: compiled.strategy, reason: "already_promoted" };
  return { executed: false, strategy: compiled.strategy, reason: result.reason };
}
