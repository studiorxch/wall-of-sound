// DJ Transition Engine (0722D) §8.5 — pure gain/EQ automation defaults per
// family. Separated from the resolver for isolated testability (mirrors
// transitionScheduler.ts's own envelope-building split). These are EDITABLE
// starting points, never hard-coded universal behavior — the focused editor
// (DjTransitionEditor.tsx) lets the operator move every point.
//
// Doctrine §8: exactly one source ever "owns" the low end at a time — the
// mirrored crossover shape below guarantees the outgoing and incoming low
// bands are never BOTH reduced (a bass hole) or BOTH near 0dB (a bass
// collision) at the same progress value.

import type { TransitionAutomationLane, TransitionFamily, EqPoint, GainPoint } from "../data/djTransitionTypes";

const FLOOR_DB = -60;
const MANAGED_LOW_REDUCTION_DB = -24;

function linearGain(fromDb: number, toDb: number, fromProgress = 0, toProgress = 1): GainPoint[] {
  return [
    { progress: fromProgress, gainDb: fromDb },
    { progress: toProgress, gainDb: toDb },
  ];
}

function flatEq(progress: number): EqPoint {
  return { progress, lowDb: 0, midDb: 0, highDb: 0 };
}

// Mirrored bass exchange: outgoing keeps full low end until the transfer
// point, then drops it; incoming enters with reduced low end and rises to
// full only at the transfer point. Exactly one side owns the low band at
// any given progress value.
function managedBassEq(transferProgress: number, side: "outgoing" | "incoming"): EqPoint[] {
  const EPSILON = 0.02;
  const before = Math.max(0, transferProgress - EPSILON);
  const after = Math.min(1, transferProgress + EPSILON);
  if (side === "outgoing") {
    return [
      { progress: 0, lowDb: 0, midDb: 0, highDb: 0 },
      { progress: before, lowDb: 0, midDb: 0, highDb: 0 },
      { progress: after, lowDb: MANAGED_LOW_REDUCTION_DB, midDb: 0, highDb: 0 },
      { progress: 1, lowDb: MANAGED_LOW_REDUCTION_DB, midDb: -6, highDb: -6 },
    ];
  }
  return [
    { progress: 0, lowDb: MANAGED_LOW_REDUCTION_DB, midDb: -6, highDb: -6 },
    { progress: before, lowDb: MANAGED_LOW_REDUCTION_DB, midDb: 0, highDb: 0 },
    { progress: after, lowDb: 0, midDb: 0, highDb: 0 },
    { progress: 1, lowDb: 0, midDb: 0, highDb: 0 },
  ];
}

export interface BuildAutomationDefaultsInput {
  family: TransitionFamily;
  // A trusted bar/phrase boundary's progress within the overlap [0,1], when
  // the resolver found one. Null means no rhythmic anchor exists — the
  // family branch below decides what that means (a plain unmanaged
  // crossfade for free-time material, no transfer at all for a cut).
  bassTransferProgress: number | null;
}

export function buildDjTransitionAutomationDefaults(input: BuildAutomationDefaultsInput): TransitionAutomationLane {
  const { family, bassTransferProgress } = input;

  switch (family) {
    case "phrase_eq_blend":
    case "short_rhythmic_blend":
    case "loop_assisted_handoff":
    case "stem_assisted_transition": {
      const transfer = bassTransferProgress ?? 0.5;
      return {
        outgoingGain: linearGain(0, FLOOR_DB),
        incomingGain: linearGain(FLOOR_DB, 0),
        outgoingEq: managedBassEq(transfer, "outgoing"),
        incomingEq: managedBassEq(transfer, "incoming"),
        bassTransferProgress: transfer,
      };
    }
    case "effect_handoff":
      // No real effect send/tail path exists in this build's transport yet
      // (djTransitionPlayback.ts) — the automation stays an honest plain
      // crossfade; the resolver is responsible for warning that the
      // effect routing itself is unsupported rather than this module
      // silently inventing an effect it can't actually run.
      return {
        outgoingGain: linearGain(0, FLOOR_DB),
        incomingGain: linearGain(FLOOR_DB, 0),
        outgoingEq: [flatEq(0), flatEq(1)],
        incomingEq: [flatEq(0), flatEq(1)],
        bassTransferProgress: null,
      };
    case "clean_cut":
      return {
        outgoingGain: linearGain(0, FLOOR_DB, 0, 0.05),
        incomingGain: linearGain(FLOOR_DB, 0, 0.05, 0.1),
        outgoingEq: [],
        incomingEq: [],
        bassTransferProgress: null,
      };
    case "reset_bridge":
      return {
        outgoingGain: linearGain(0, FLOOR_DB, 0, 0.4),
        incomingGain: linearGain(FLOOR_DB, 0, 0.6, 1),
        outgoingEq: [],
        incomingEq: [],
        bassTransferProgress: null,
      };
    case "free_time_perceptual_handoff":
      return {
        outgoingGain: linearGain(0, FLOOR_DB),
        incomingGain: linearGain(FLOOR_DB, 0),
        outgoingEq: [],
        incomingEq: [],
        bassTransferProgress: null,
      };
    case "do_not_place_adjacent":
    default:
      // Should never actually be scheduled for playback — a neutral,
      // silent-at-both-ends lane so nothing looks accidentally "ready" if
      // this is ever reached.
      return {
        outgoingGain: [{ progress: 0, gainDb: FLOOR_DB }, { progress: 1, gainDb: FLOOR_DB }],
        incomingGain: [{ progress: 0, gainDb: FLOOR_DB }, { progress: 1, gainDb: FLOOR_DB }],
        outgoingEq: [],
        incomingEq: [],
        bassTransferProgress: null,
      };
  }
}
