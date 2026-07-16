// 0715F_MUSIC_Sample_Accurate_Loop_Audition_And_Playhead_Synchronization §6 —
// dev-only wrap-timing diagnostics. Deliberately named "observation", not
// "actual audio wrap time"/"overshoot": a native AudioBufferSourceNode loops
// inside the browser's audio thread, which JS/requestAnimationFrame cannot
// directly observe. What CAN be measured is when the UI thread first
// noticed the audio clock had crossed a predicted wrap boundary — that
// includes rAF scheduling delay and main-thread latency, not audio-thread
// loop overshoot. Claiming otherwise would require an AudioWorklet or
// offline-render measurement, which this build does not implement.

export interface LoopWrapObservation {
  expectedWrapAudioTime: number;
  observedAtAudioTime: number;
  observationDelayMs: number;

  visualFrameAtObservation: number;
  visualObservationLagMs: number;
}

export function computeObservationDelayMs(expectedWrapAudioTime: number, observedAtAudioTime: number): number {
  return Math.max(0, (observedAtAudioTime - expectedWrapAudioTime) * 1000);
}

// `expectedWrapPerfTime`/`observedAtPerfTime` are performance.now()-space
// timestamps (see useLoopAuditionController.ts's perf-anchor comment for how
// an audio-clock time is projected into performance.now() space).
export function computeVisualObservationLagMs(expectedWrapPerfTime: number, observedAtPerfTime: number): number {
  return Math.max(0, observedAtPerfTime - expectedWrapPerfTime);
}

// Bounded, immutable ring buffer — held in a ref by the engine, never in
// React state (diagnostics must not force a re-render on every rAF tick).
export function recordWrapObservation(
  ringBuffer: LoopWrapObservation[],
  entry: LoopWrapObservation,
  cap = 50,
): LoopWrapObservation[] {
  const next = [...ringBuffer, entry];
  return next.length > cap ? next.slice(next.length - cap) : next;
}

export interface LoopWrapObservationSummary {
  count: number;
  meanObservationDelayMs: number;
  maxObservationDelayMs: number;
  meanVisualObservationLagMs: number;
  maxVisualObservationLagMs: number;
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function summarizeWrapObservations(entries: LoopWrapObservation[]): LoopWrapObservationSummary {
  if (entries.length === 0) {
    return { count: 0, meanObservationDelayMs: 0, maxObservationDelayMs: 0, meanVisualObservationLagMs: 0, maxVisualObservationLagMs: 0 };
  }
  const delays = entries.map((e) => e.observationDelayMs);
  const lags = entries.map((e) => e.visualObservationLagMs);
  return {
    count: entries.length,
    meanObservationDelayMs: mean(delays),
    maxObservationDelayMs: Math.max(...delays),
    meanVisualObservationLagMs: mean(lags),
    maxVisualObservationLagMs: Math.max(...lags),
  };
}
