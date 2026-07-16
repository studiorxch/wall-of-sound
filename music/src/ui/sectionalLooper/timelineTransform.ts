// 0714T §39/§40 — the ONE shared time-to-pixel transform used by the
// waveform, ruler, segment timeline, candidate overlays, selected region,
// and playhead — no component calculates its own width independently.
// Frame-based conversion is authoritative; seconds are derived.

export interface TimelineTransform {
  frameToX(frame: number): number;
  xToFrame(x: number): number;
  secondsToX(seconds: number): number;
  xToSeconds(x: number): number;
  viewportStartFrame: number;
  viewportEndFrame: number;
  widthPx: number;
}

export function createTimelineTransform(
  viewportStartFrame: number, viewportEndFrame: number, widthPx: number, sampleRate: number,
): TimelineTransform {
  const span = Math.max(1, viewportEndFrame - viewportStartFrame);
  const frameToX = (frame: number) => ((frame - viewportStartFrame) / span) * widthPx;
  const xToFrame = (x: number) => viewportStartFrame + (x / widthPx) * span;
  return {
    frameToX,
    xToFrame,
    secondsToX: (seconds: number) => frameToX(seconds * sampleRate),
    xToSeconds: (x: number) => xToFrame(x) / sampleRate,
    viewportStartFrame, viewportEndFrame, widthPx,
  };
}

// §9 — zoom anchoring: recompute a new [start,end] viewport that zooms by
// `factor` (>1 = zoom in) while keeping `anchorFrame` at the same pixel
// position it currently occupies.
export function zoomViewport(
  viewportStartFrame: number, viewportEndFrame: number, factor: number, anchorFrame: number,
  minSpanFrames: number, maxSpanFrames: number,
): { start: number; end: number } {
  const span = viewportEndFrame - viewportStartFrame;
  const nextSpan = Math.min(maxSpanFrames, Math.max(minSpanFrames, span / factor));
  const anchorRatio = span > 0 ? (anchorFrame - viewportStartFrame) / span : 0.5;
  const start = anchorFrame - anchorRatio * nextSpan;
  return { start, end: start + nextSpan };
}
