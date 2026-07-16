// 0715F_MUSIC_Sample_Accurate_Loop_Audition_And_Playhead_Synchronization —
// pure frame/seconds/clock arithmetic for the Web Audio audition engine.
// No AudioContext/AudioNode access here so every formula is independently
// testable. §8 — always convert using the DECODED source's own sample
// rate, never a UI-rounded fallback. §9 — the exact playhead formula.

export function secondsToFrame(seconds: number, sampleRate: number): number {
  return Math.round(seconds * sampleRate);
}

export function frameToSeconds(frame: number, sampleRate: number): number {
  return frame / sampleRate;
}

export function loopDurationFrames(loopStartFrame: number, loopEndFrame: number): number {
  return loopEndFrame - loopStartFrame;
}

export function loopDurationSeconds(loopStartFrame: number, loopEndFrame: number, sampleRate: number): number {
  return loopDurationFrames(loopStartFrame, loopEndFrame) / sampleRate;
}

// Wraps an arbitrary (possibly out-of-range) frame into [loopStartFrame,
// loopEndFrame). A loop of zero/negative length has no valid wrap target —
// callers must treat that as INVALID_LOOP_RANGE before reaching here.
export function wrapFrame(frame: number, loopStartFrame: number, loopEndFrame: number): number {
  const len = loopDurationFrames(loopStartFrame, loopEndFrame);
  if (len <= 0) return loopStartFrame;
  const relative = frame - loopStartFrame;
  const wrapped = ((relative % len) + len) % len;
  return loopStartFrame + wrapped;
}

// §9 — sourceFrame = loopStartFrame + floor((currentTime - startedAt) * sampleRate),
// wrapped by the exact loop-frame length. This is the SOLE playhead-position
// authority; never timeupdate, never a React interval, never formatted seconds.
export function frameFromAudioClock(
  currentAudioTime: number,
  startedAtAudioTime: number,
  loopStartFrame: number,
  loopEndFrame: number,
  sampleRate: number,
): number {
  const elapsedFrames = Math.floor((currentAudioTime - startedAtAudioTime) * sampleRate);
  return wrapFrame(loopStartFrame + elapsedFrames, loopStartFrame, loopEndFrame);
}

// §10 Pause — the exact frame to freeze the playhead at and to resume from
// later. Same formula as the live playhead, named separately since it's a
// distinct call site/contract (captured once, at the moment of pause).
export function pausedFrameFromClock(
  currentAudioTime: number,
  startedAtAudioTime: number,
  loopStartFrame: number,
  loopEndFrame: number,
  sampleRate: number,
): number {
  return frameFromAudioClock(currentAudioTime, startedAtAudioTime, loopStartFrame, loopEndFrame, sampleRate);
}

// §10 Resume — the buffer-offset (seconds) a brand-new AudioBufferSourceNode
// must be started at to continue from the paused frame with no audible/
// visual jump. `pausedFrame` is an absolute frame within the decoded buffer.
export function resumeOffsetSeconds(pausedFrame: number, sampleRate: number): number {
  return pausedFrame / sampleRate;
}

// §6 — the Nth expected wrap's audio-clock time, for comparison against
// when the UI thread actually observes crossing it (see loopWrapDiagnostics.ts).
// wrapIndex is 1-based (the first wrap is wrapIndex=1).
export function expectedWrapAudioTime(
  startedAtAudioTime: number,
  loopDurationSecondsValue: number,
  wrapIndex: number,
): number {
  return startedAtAudioTime + loopDurationSecondsValue * wrapIndex;
}
