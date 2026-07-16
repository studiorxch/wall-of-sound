// 0715F_MUSIC_Sample_Accurate_Loop_Audition_And_Playhead_Synchronization —
// pure playback-state DECISIONS the engine shell calls, extracted so they're
// testable without a real AudioContext/DOM (this repo's own convention: no
// React/DOM tests anywhere).

import type { LoopAuditionSession } from "../data/loopTypes";

// §11 — boundary edit while previewing must stop audition and require an
// explicit new Preview, rather than mutating a running node's loop points.
// Only stops when the edit pertains to the SAME source the session is
// currently auditioning, and the session hasn't already stopped/errored.
export function shouldStopAuditionForBoundaryEdit(
  session: Pick<LoopAuditionSession, "sourceTrackId" | "status"> | null,
  editedSourceTrackId: string,
): boolean {
  if (!session) return false;
  if (session.status === "stopped" || session.status === "error") return false;
  return session.sourceTrackId === editedSourceTrackId;
}

// §17 — "stop the media element before starting Web Audio for the same
// audition." Only relevant when a fallback session is actually active.
export function shouldStopMediaElementBeforeWebAudioStart(
  activeSession: Pick<LoopAuditionSession, "timingAuthority" | "status"> | null,
): boolean {
  if (!activeSession) return false;
  return activeSession.timingAuthority === "media_element" && activeSession.status !== "stopped";
}

// §10 Resume — Web Audio AudioBufferSourceNodes are single-use (calling
// .start() on an already-stopped node throws), so resume must ALWAYS create
// a new node, never restart the old one. Expressed as a testable contract
// rather than only a code comment.
export interface ResumeAction {
  kind: "create_new_source_node";
  startOffsetSeconds: number;
}

export function describeResumeAction(pausedFrame: number, sampleRate: number): ResumeAction {
  return { kind: "create_new_source_node", startOffsetSeconds: pausedFrame / sampleRate };
}
