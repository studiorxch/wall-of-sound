// 0722A_RADIOOS_Loopchain_Player_Web_Demo §3 — pure builders for listener
// feedback (Save / Less like this / Comment), mirroring
// radioLoopchainObservations.ts's one-builder-per-kind shape. See
// loopchainFeedbackTypes.ts's own doc comment for why this is a separate
// concept from that operator-only observation log. Pure — no DOM, no Node.

import type { LoopchainFeedbackTarget, LoopchainListenerFeedback } from "../../data/loopchainFeedbackTypes";
import type { LoopchainResolvedTransitionDecision } from "../../data/radioLoopchainTypes";

function genFeedbackId(): string {
  return `loopchainfb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function recordSave(
  chainId: string,
  chainVersion: string,
  sessionId: string,
  playbackTimeSeconds?: number,
  now: string = new Date().toISOString(),
): LoopchainListenerFeedback {
  return {
    id: genFeedbackId(),
    kind: "save",
    target: { scope: "overall_chain" },
    chainId,
    chainVersion,
    playbackTimeSeconds,
    sessionId,
    recordedAt: now,
  };
}

export function recordLessLikeThis(
  chainId: string,
  chainVersion: string,
  sessionId: string,
  target: LoopchainFeedbackTarget,
  resolvedTransitionSettings?: LoopchainResolvedTransitionDecision,
  playbackTimeSeconds?: number,
  now: string = new Date().toISOString(),
): LoopchainListenerFeedback {
  return {
    id: genFeedbackId(),
    kind: "less_like_this",
    target,
    chainId,
    chainVersion,
    playbackTimeSeconds,
    resolvedTransitionSettings: target.scope === "transition" ? resolvedTransitionSettings : undefined,
    sessionId,
    recordedAt: now,
  };
}

export function recordComment(
  chainId: string,
  chainVersion: string,
  sessionId: string,
  commentText: string,
  target: LoopchainFeedbackTarget = { scope: "overall_chain" },
  playbackTimeSeconds?: number,
  now: string = new Date().toISOString(),
): LoopchainListenerFeedback {
  return {
    id: genFeedbackId(),
    kind: "comment",
    target,
    chainId,
    chainVersion,
    playbackTimeSeconds,
    commentText,
    sessionId,
    recordedAt: now,
  };
}
