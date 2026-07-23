// 0722A_RADIOOS_Loopchain_Player_Web_Demo §2.3 — hybrid bar-vs-seconds
// transition resolver. Pure — no DOM, no Node. LOAD-BEARING RULE: an
// untrusted grid can never produce alignment:"bar_aligned" or a
// bar-derived duration, regardless of what was explicitly requested — a
// "bars" request against an untrusted pair is REJECTED outright, never
// honored under a "manual override" label. Manual override never bypasses
// grid trust; it can only select among values that are legitimately
// achievable given the actual trust state.
//
// Confidence gate: reuses the app's existing canonical beat-grid trust
// decision (isBeatMapTrustedForAnalysis -> TRUST_THRESHOLD, already used
// elsewhere) rather than inventing a second number specific to loopchains.
// A junction is bar-capable only when BOTH sides' MusicalGrid.trust is
// exactly "trusted".
//
// Silence-aware nudge (documented simplification): the nudge treats
// TrackPlaybackBounds.leadingSilenceSeconds/trailingSilenceSeconds as
// directly applying at the BLOCK'S OWN cycle boundary — correct when the
// block's section genuinely sits at the track's head/tail (the case this
// matters most for — intro/outro-adjacent handoffs), not a general
// mid-track silence detector. It only ever EXTENDS the resolved duration
// (moving the fade-out/fade-in start earlier so it clears the detected
// silence — the only lever the scheduling engine actually exposes; there
// is no independent "shift the handoff without changing duration"
// mechanism in buildLoopchainSchedule today), never shrinks it below what
// the request/auto path already computed, and is capped so it can never
// consume an entire cycle on either side.

import type {
  LoopchainTransitionRequest, LoopchainTransitionAlignment, LoopchainResolvedTransitionDecision,
} from "../../data/radioLoopchainTypes";
import type { MusicalGrid } from "../../data/loopTypes";
import type { TrackPlaybackBounds } from "../../data/playbackBoundsTypes";

// Mirrors musicalGrid.ts's own hardcoded 4/4 assumption — not exported
// there, so restated here rather than reached into a private constant.
const BEATS_PER_BAR = 4;
const DEFAULT_AUTO_BARS = 2;

export interface JunctionGridInput {
  grid: MusicalGrid | null;
  playbackBounds: TrackPlaybackBounds | null;
  cycleDurationSeconds: number;
}

interface RawResult {
  durationSeconds: number;
  alignment: "bar_aligned" | "time_aligned";
  confidence: number;
  reasonBase: string;
}

function computeBarResult(outgoing: JunctionGridInput, incoming: JunctionGridInput, bars: number): RawResult {
  const bpm = outgoing.grid!.bpm;
  const barDurationSeconds = (60 / bpm) * BEATS_PER_BAR;
  const durationSeconds = bars * barDurationSeconds;
  const confidence = Math.min(outgoing.grid!.confidence, incoming.grid!.confidence);
  return {
    durationSeconds,
    alignment: "bar_aligned",
    confidence,
    reasonBase: `${bars} bar(s) at ${bpm.toFixed(1)} BPM (outgoing track) — both sides grid-trusted (confidence ${confidence.toFixed(2)})`,
  };
}

function computeSecondsResult(seconds: number, bothTrusted: boolean): RawResult {
  return {
    durationSeconds: seconds,
    alignment: "time_aligned",
    confidence: 0,
    reasonBase: bothTrusted ? `${seconds}s requested directly` : `${seconds}s fallback — grid not trusted on one or both sides`,
  };
}

// Only ever lengthens the duration (see file header for why); never
// shrinks below what the request/auto path already resolved.
function applySilenceNudge(durationSeconds: number, outgoing: JunctionGridInput, incoming: JunctionGridInput): number {
  let d = durationSeconds;

  if (outgoing.playbackBounds && outgoing.playbackBounds.trailingSilenceSeconds > 0) {
    const fadeStartLocal = outgoing.cycleDurationSeconds - d;
    const audibleEndLocal = outgoing.cycleDurationSeconds - outgoing.playbackBounds.trailingSilenceSeconds;
    if (fadeStartLocal >= audibleEndLocal) {
      d = Math.max(d, outgoing.cycleDurationSeconds - audibleEndLocal);
    }
  }
  if (incoming.playbackBounds && incoming.playbackBounds.leadingSilenceSeconds > 0) {
    const audibleStartLocal = incoming.playbackBounds.leadingSilenceSeconds;
    if (d <= audibleStartLocal) {
      d = Math.max(d, audibleStartLocal);
    }
  }

  const ceiling = Math.max(0, Math.min(outgoing.cycleDurationSeconds, incoming.cycleDurationSeconds) - 0.01);
  return Math.min(d, ceiling);
}

// `fallbackSeconds` is what a plain {kind:"auto"} request resolves to when
// the grid isn't bar-capable — pass the junction's own existing
// crossfadeDurationSeconds so a pre-0722A junction (transitionRequest
// absent => {kind:"auto"}) resolves to EXACTLY the seconds value it always
// used, unchanged.
export function resolveTransitionTiming(
  outgoing: JunctionGridInput,
  incoming: JunctionGridInput,
  request: LoopchainTransitionRequest,
  junctionId: string,
  fallbackSeconds: number,
  now: string = new Date().toISOString(),
): LoopchainResolvedTransitionDecision {
  const bothTrusted = outgoing.grid?.trust === "trusted" && incoming.grid?.trust === "trusted";

  const autoRaw = bothTrusted ? computeBarResult(outgoing, incoming, DEFAULT_AUTO_BARS) : computeSecondsResult(fallbackSeconds, bothTrusted);
  const autoDuration = applySilenceNudge(autoRaw.durationSeconds, outgoing, incoming);

  let raw: RawResult;
  let rejectedBarsOnUntrusted = false;

  if (request.kind === "bars") {
    if (bothTrusted) {
      raw = computeBarResult(outgoing, incoming, request.bars);
    } else {
      raw = computeSecondsResult(fallbackSeconds, bothTrusted);
      rejectedBarsOnUntrusted = true;
    }
  } else if (request.kind === "seconds") {
    raw = computeSecondsResult(request.seconds, bothTrusted);
  } else {
    raw = autoRaw;
  }

  const computedDurationSeconds = applySilenceNudge(raw.durationSeconds, outgoing, incoming);

  const isLegitimateExplicitRequest = request.kind !== "auto" && !rejectedBarsOnUntrusted;
  const divergesFromAuto = Math.abs(computedDurationSeconds - autoDuration) > 1e-9;
  const alignment: LoopchainTransitionAlignment =
    isLegitimateExplicitRequest && divergesFromAuto ? "manual_override" : raw.alignment;

  const reason = rejectedBarsOnUntrusted
    ? `requested ${request.kind === "bars" ? request.bars : ""} bars but grid not trusted on ${outgoing.grid?.trust !== "trusted" ? "the outgoing" : "the incoming"} side — used ${computedDurationSeconds.toFixed(1)}s fallback instead, never bar-aligned`
    : raw.reasonBase;

  return {
    junctionId,
    request,
    alignment,
    computedDurationSeconds,
    // Confidence describes whether bar math actually underlies the
    // duration, independent of the display label — a legitimate
    // manual-override of a trusted-bar value still carries real
    // confidence; a rejected/seconds-fallback path never does.
    confidence: raw.alignment === "bar_aligned" ? raw.confidence : 0,
    reason,
    resolvedAt: now,
  };
}
