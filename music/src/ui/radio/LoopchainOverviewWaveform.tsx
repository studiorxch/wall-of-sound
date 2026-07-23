// 0722A_RADIOOS_Loopchain_Player_Web_Demo §1.2 — whole-chain overview
// waveform. Canvas-only (user-confirmed): the static waveform (peaks,
// block-color regions, intro/outro markers) is drawn to a <canvas> and
// cached — redrawn ONLY when [schedule, peaks, activeOccurrenceId, width]
// change, never on a playhead tick. The live-moving playhead is a
// SEPARATE absolutely-positioned DOM/CSS overlay line, moved imperatively
// via a ref on every requestAnimationFrame tick by reading
// getPlayheadSeconds() directly — never through React state, and never by
// touching the canvas. This decouples 60fps visual smoothness entirely
// from React re-renders; the parent's own playheadSeconds state (used only
// for the Now Playing text readouts) can stay throttled independently.

import { useEffect, useRef } from "react";
import type { LoopchainSchedule, ScheduledOccurrence } from "../../audio/loopchainPlaybackEngine";
import type { WaveformPeak } from "../../data/loopTypes";

const CANVAS_HEIGHT = 72;

interface Props {
  schedule: LoopchainSchedule | null;
  isPlaying: boolean;
  getPlayheadSeconds: () => number;
  activeOccurrenceId: string | undefined;
  peaksForOccurrence: (occurrence: ScheduledOccurrence) => WaveformPeak[] | undefined;
  colorForBlock: (blockId: string) => string;
  isIntroOrOutroOccurrence: (occurrence: ScheduledOccurrence) => boolean;
  labelForDrag: (chainTimeSeconds: number) => string;
  onSeek: (chainTimeSeconds: number) => void;
}

export function LoopchainOverviewWaveform(props: Props) {
  const { schedule, isPlaying, getPlayheadSeconds, activeOccurrenceId, peaksForOccurrence, colorForBlock, isIntroOrOutroOccurrence, labelForDrag, onSeek } = props;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const playheadRef = useRef<HTMLDivElement | null>(null);
  const dragLabelRef = useRef<HTMLDivElement | null>(null);
  const widthRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const draggingRef = useRef(false);

  // Static draw — peaks/block regions/intro-outro markers. Redrawn only
  // when the underlying data or container width changes, never per frame.
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    function draw() {
      const width = container!.clientWidth;
      widthRef.current = width;
      const dpr = window.devicePixelRatio || 1;
      canvas!.width = Math.max(1, Math.round(width * dpr));
      canvas!.height = Math.round(CANVAS_HEIGHT * dpr);
      canvas!.style.width = `${width}px`;
      canvas!.style.height = `${CANVAS_HEIGHT}px`;
      const ctx = canvas!.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, CANVAS_HEIGHT);

      if (!schedule || schedule.totalChainDurationSeconds <= 0 || width <= 0) return;
      const total = schedule.totalChainDurationSeconds;
      const midY = CANVAS_HEIGHT / 2;

      for (const occ of schedule.occurrences) {
        const xStart = (occ.chainStartSeconds / total) * width;
        const xEnd = (occ.chainEndSeconds / total) * width;
        const occWidth = Math.max(1, xEnd - xStart);
        const peaks = peaksForOccurrence(occ);
        const isActive = occ.occurrenceId === activeOccurrenceId;
        const introOutro = isIntroOrOutroOccurrence(occ);

        ctx.fillStyle = isActive ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.02)";
        ctx.fillRect(xStart, 0, occWidth, CANVAS_HEIGHT);

        const baseColor = colorForBlock(occ.blockId);
        ctx.strokeStyle = introOutro ? "rgba(255,255,255,0.5)" : baseColor;
        ctx.fillStyle = baseColor;
        ctx.globalAlpha = isActive ? 1 : 0.7;

        if (peaks && peaks.length > 0) {
          const binWidth = occWidth / peaks.length;
          for (let i = 0; i < peaks.length; i++) {
            const x = xStart + i * binWidth;
            const { min, max } = peaks[i];
            const yMax = midY - max * midY;
            const yMin = midY - min * midY;
            ctx.fillRect(x, yMax, Math.max(1, binWidth), Math.max(1, yMin - yMax));
          }
        } else {
          // Peaks not decoded/cached yet — a quiet flat placeholder, never
          // a fabricated waveform shape.
          ctx.fillRect(xStart, midY - 1, occWidth, 2);
        }
        ctx.globalAlpha = 1;

        // Block boundary divider.
        ctx.strokeStyle = "rgba(0,0,0,0.4)";
        ctx.beginPath();
        ctx.moveTo(xStart, 0);
        ctx.lineTo(xStart, CANVAS_HEIGHT);
        ctx.stroke();

        if (introOutro) {
          ctx.fillStyle = "rgba(255,255,255,0.85)";
          ctx.fillRect(xStart, 0, 3, CANVAS_HEIGHT);
        }
      }
    }

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(container);
    return () => ro.disconnect();
  }, [schedule, peaksForOccurrence, activeOccurrenceId, colorForBlock, isIntroOrOutroOccurrence]);

  // Live playhead — DOM/CSS overlay only, moved via rAF, never touches the
  // canvas and never writes React state.
  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }
    function tick() {
      const el = playheadRef.current;
      const total = schedule?.totalChainDurationSeconds ?? 0;
      if (el && total > 0 && widthRef.current > 0) {
        const seconds = getPlayheadSeconds();
        const x = (seconds / total) * widthRef.current;
        el.style.transform = `translateX(${x}px)`;
        el.style.opacity = "1";
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [isPlaying, schedule, getPlayheadSeconds]);

  function chainTimeFromClientX(clientX: number): number | null {
    const container = containerRef.current;
    if (!container || !schedule || schedule.totalChainDurationSeconds <= 0) return null;
    const rect = container.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return ratio * schedule.totalChainDurationSeconds;
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    const t = chainTimeFromClientX(e.clientX);
    if (t == null) return;
    const label = dragLabelRef.current;
    if (label) {
      label.style.display = "block";
      label.style.left = `${(t / schedule!.totalChainDurationSeconds) * widthRef.current}px`;
      label.textContent = labelForDrag(t);
    }
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    draggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    handlePointerMove(e);
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (dragLabelRef.current) dragLabelRef.current.style.display = "none";
    const t = chainTimeFromClientX(e.clientX);
    if (t != null) onSeek(t);
  }

  return (
    <div
      ref={containerRef}
      className="loopchain-overview-waveform"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={() => { draggingRef.current = false; if (dragLabelRef.current) dragLabelRef.current.style.display = "none"; }}
    >
      <canvas ref={canvasRef} className="loopchain-overview-canvas" />
      <div ref={playheadRef} className="loopchain-overview-playhead" style={{ opacity: 0 }} />
      <div ref={dragLabelRef} className="loopchain-overview-drag-label" style={{ display: "none" }} />
    </div>
  );
}
