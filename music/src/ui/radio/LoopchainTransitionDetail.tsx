// 0722A_RADIOOS_Loopchain_Player_Web_Demo §1.3 — two-source transition
// detail for the SELECTED junction only (one centralized panel — junction
// selection drives this, never a mini-control per timeline block). Canvas
// only (user-confirmed), same cached/no-per-frame-redraw rule as the
// overview: this view has no live-moving playhead of its own, so it simply
// redraws whenever its props change (junction selection, resolved
// decision, or peaks), never on a timer/rAF loop.
//
// Alignment badge: per the resolver's own load-bearing rule, `decision.
// alignment` can NEVER read "bar_aligned" for an untrusted-grid junction —
// this component just displays whatever the resolver honestly produced,
// it never re-derives or overrides it.

import { useEffect, useRef } from "react";
import type { WaveformPeak } from "../../data/loopTypes";
import type { GainEnvelope } from "../../audio/dualDeckTypes";
import { gainAtContextTime } from "../../audio/loopchainPlaybackEngine";
import type { LoopchainResolvedTransitionDecision } from "../../data/radioLoopchainTypes";

const CANVAS_HEIGHT = 96;

const ALIGNMENT_LABEL: Record<LoopchainResolvedTransitionDecision["alignment"], string> = {
  bar_aligned: "Bar aligned",
  time_aligned: "Time aligned",
  manual_override: "Manual override",
};

interface Props {
  outgoingLabel: string;
  incomingLabel: string;
  windowStartChainSeconds: number;
  windowEndChainSeconds: number;
  overlapStartChainSeconds: number;
  overlapEndChainSeconds: number;
  // Outgoing peaks span [windowStartChainSeconds, overlapEndChainSeconds];
  // incoming peaks span [overlapStartChainSeconds, windowEndChainSeconds] —
  // the two arrays legitimately overlap in chain-time, drawn together with
  // real per-pixel gain-derived alpha in the shared region.
  outgoingPeaks: WaveformPeak[] | undefined;
  incomingPeaks: WaveformPeak[] | undefined;
  fadeOut?: GainEnvelope;
  fadeIn?: GainEnvelope;
  // Optional silence/audible-bounds markers, already resolved to
  // chain-relative seconds by the caller (via
  // occurrenceSourceTimeToChainTime) — this component only draws them.
  outgoingAudibleEndChainSeconds?: number;
  incomingAudibleStartChainSeconds?: number;
  decision: LoopchainResolvedTransitionDecision;
}

export function LoopchainTransitionDetail(props: Props) {
  const {
    outgoingLabel, incomingLabel, windowStartChainSeconds, windowEndChainSeconds,
    overlapStartChainSeconds, overlapEndChainSeconds, outgoingPeaks, incomingPeaks,
    fadeOut, fadeIn, outgoingAudibleEndChainSeconds, incomingAudibleStartChainSeconds, decision,
  } = props;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const width = container.clientWidth;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.round(CANVAS_HEIGHT * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${CANVAS_HEIGHT}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, CANVAS_HEIGHT);

    const total = windowEndChainSeconds - windowStartChainSeconds;
    if (total <= 0 || width <= 0) return;
    const midY = CANVAS_HEIGHT / 2;
    const xFor = (chainSeconds: number) => ((chainSeconds - windowStartChainSeconds) / total) * width;

    // Overlap region shading — the actual crossfade window.
    const overlapX0 = xFor(overlapStartChainSeconds);
    const overlapX1 = xFor(overlapEndChainSeconds);
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(overlapX0, 0, Math.max(0, overlapX1 - overlapX0), CANVAS_HEIGHT);

    function drawPeaks(context: CanvasRenderingContext2D, peaks: WaveformPeak[] | undefined, spanStart: number, spanEnd: number, color: string, envelope: GainEnvelope | undefined) {
      if (!peaks || peaks.length === 0) return;
      const x0 = xFor(spanStart);
      const x1 = xFor(spanEnd);
      const spanWidth = Math.max(1, x1 - x0);
      const binWidth = spanWidth / peaks.length;
      const spanSeconds = spanEnd - spanStart;
      for (let i = 0; i < peaks.length; i++) {
        const x = x0 + i * binWidth;
        const chainSecondsAtBin = spanStart + (i / peaks.length) * spanSeconds;
        const gain = envelope ? gainAtContextTime(envelope, chainSecondsAtBin) : 1;
        const { min, max } = peaks[i];
        const yMax = midY - max * midY;
        const yMin = midY - min * midY;
        context.globalAlpha = Math.min(1, Math.max(0.08, gain));
        context.fillStyle = color;
        context.fillRect(x, yMax, Math.max(1, binWidth), Math.max(1, yMin - yMax));
      }
      context.globalAlpha = 1;
    }

    drawPeaks(ctx, outgoingPeaks, windowStartChainSeconds, overlapEndChainSeconds, "#5b9cf6", fadeOut);
    drawPeaks(ctx, incomingPeaks, overlapStartChainSeconds, windowEndChainSeconds, "#f6b85b", fadeIn);

    // Fade curve overlays — real gain, not a decorative shape.
    function drawCurve(context: CanvasRenderingContext2D, envelope: GainEnvelope | undefined, color: string) {
      if (!envelope) return;
      context.strokeStyle = color;
      context.lineWidth = 1.5;
      context.beginPath();
      const steps = 40;
      for (let i = 0; i <= steps; i++) {
        const t = windowStartChainSeconds + (i / steps) * total;
        const g = gainAtContextTime(envelope, t);
        const x = xFor(t);
        const y = CANVAS_HEIGHT - g * (CANVAS_HEIGHT - 4) - 2;
        if (i === 0) context.moveTo(x, y); else context.lineTo(x, y);
      }
      context.stroke();
    }
    drawCurve(ctx, fadeOut, "rgba(91,156,246,0.9)");
    drawCurve(ctx, fadeIn, "rgba(246,184,91,0.9)");

    // Handoff marker.
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(overlapX0, 0);
    ctx.lineTo(overlapX0, CANVAS_HEIGHT);
    ctx.stroke();
    ctx.setLineDash([]);

    // Optional detected silence / audible-bounds markers.
    if (outgoingAudibleEndChainSeconds != null) {
      const x = xFor(outgoingAudibleEndChainSeconds);
      ctx.strokeStyle = "rgba(255,120,120,0.6)";
      ctx.setLineDash([2, 4]);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_HEIGHT); ctx.stroke();
      ctx.setLineDash([]);
    }
    if (incomingAudibleStartChainSeconds != null) {
      const x = xFor(incomingAudibleStartChainSeconds);
      ctx.strokeStyle = "rgba(255,120,120,0.6)";
      ctx.setLineDash([2, 4]);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_HEIGHT); ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [
    windowStartChainSeconds, windowEndChainSeconds, overlapStartChainSeconds, overlapEndChainSeconds,
    outgoingPeaks, incomingPeaks, fadeOut, fadeIn, outgoingAudibleEndChainSeconds, incomingAudibleStartChainSeconds,
  ]);

  return (
    <div className="loopchain-transition-detail">
      <div className="loopchain-transition-detail-header">
        <span className="loopchain-transition-source loopchain-transition-source--out">{outgoingLabel}</span>
        <span className={`loopchain-transition-alignment loopchain-transition-alignment--${decision.alignment}`}>
          {ALIGNMENT_LABEL[decision.alignment]}
        </span>
        <span className="loopchain-transition-source loopchain-transition-source--in">{incomingLabel}</span>
      </div>
      <div ref={containerRef} className="loopchain-transition-canvas-wrap">
        <canvas ref={canvasRef} className="loopchain-transition-canvas" />
      </div>
      <div className="loopchain-transition-reason">{decision.reason}</div>
    </div>
  );
}
