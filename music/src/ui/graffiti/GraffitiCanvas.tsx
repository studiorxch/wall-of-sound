import { useEffect, useRef } from "react";
import type { ArtworkCreationSession, BrushId, Stroke, StrokePoint } from "../../graffiti/graffitiTypes";
import { normalizePointerEvent, computeVelocity, rectFromElement } from "../../graffiti/graffitiInputController";
import { startStroke, addPointToStroke, commitStroke } from "../../graffiti/graffitiStrokeStore";
import { sizeCanvasForDPR, renderStroke } from "../../graffiti/graffitiCanvasRenderer";
import { recordAddStroke } from "../../graffiti/graffitiHistory";
import type { HistoryState } from "../../graffiti/graffitiTypes";

// 0818_SUBWAY_Artwork_Creation_Drawing_App_v1.0.0 — BUILD §7, §36
//
// Two-layer canvas, same architecture the archived mop-engine reference
// used (WOS-share/SUBWAY/ARCHIVE/REFERENCE/Drip_Brush) for the same reason:
// a STATIC layer holds the background template + every already-committed
// stroke and is redrawn only when the committed set actually changes
// (stroke commit, undo/redo/clear); an ACTIVE layer holds only the
// in-progress stroke and is redrawn on every pointermove — bounded to one
// stroke's cost, never a full-session redraw per pointer event (BUILD §36).
//
// Pointer Events is the ONE input path (BUILD §7) — mouse/touch/pen all
// flow through the same onPointerDown/Move/Up/Cancel handlers via
// event.pointerType, with pointer capture so a drag that leaves the
// element's bounds still delivers move/up events (no separate touch
// handlers exist anywhere in this file).

type Props = {
  session: ArtworkCreationSession;
  onSessionChange: (session: ArtworkCreationSession) => void;
  history: HistoryState;
  onHistoryChange: (history: HistoryState) => void;
  activeTool: BrushId;
  activeColor: string;
  activeWidth: number;
  backgroundImageSrc?: string;
  cssWidth: number;
  cssHeight: number;
};

export function GraffitiCanvas({ session, onSessionChange, history, onHistoryChange, activeTool, activeColor, activeWidth, backgroundImageSrc, cssWidth, cssHeight }: Props) {
  const staticCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const backgroundImageRef = useRef<HTMLImageElement | null>(null);
  const activeStrokeRef = useRef<Stroke | null>(null);
  const lastPointRef = useRef<StrokePoint | null>(null);
  const dpr = typeof window !== "undefined" ? (window.devicePixelRatio || 1) : 1;

  function redrawStatic() {
    const canvas = staticCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const bg = backgroundImageRef.current;
    if (bg && bg.complete) ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);
    // Draws each stroke directly (never graffitiCanvasRenderer's
    // renderSession(), which clears the canvas itself — that would wipe
    // out the background template image just drawn above).
    session.strokes.forEach((stroke) => renderStroke(ctx, stroke, canvas.width, canvas.height));
  }

  // Size both canvases for the current CSS box + DPR, and load the
  // background template image exactly once per src change.
  useEffect(() => {
    [staticCanvasRef.current, activeCanvasRef.current].forEach((c) => {
      if (c) sizeCanvasForDPR(c, cssWidth, cssHeight, dpr);
    });
    if (backgroundImageSrc) {
      const img = new Image();
      img.onload = () => { backgroundImageRef.current = img; redrawStatic(); };
      img.src = backgroundImageSrc;
    } else {
      backgroundImageRef.current = null;
    }
    redrawStatic();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cssWidth, cssHeight, dpr, backgroundImageSrc]);

  // Redraw the static layer whenever the committed stroke set changes
  // (new commit, undo, redo, clear) — never on every pointermove.
  useEffect(() => {
    redrawStatic();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.strokes]);

  function clearActiveLayer() {
    const canvas = activeCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = activeCanvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    const rect = rectFromElement(canvas);
    const point = normalizePointerEvent(e.nativeEvent, rect);
    const stroke = startStroke(activeTool, activeColor, activeWidth, point, Date.now());
    activeStrokeRef.current = stroke;
    lastPointRef.current = point;
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const stroke = activeStrokeRef.current;
    const canvas = activeCanvasRef.current;
    if (!stroke || !canvas) return;
    // Palm/touch conflict protection (BUILD §7): while a pen stroke is
    // active, ignore concurrent touch pointer events entirely rather than
    // starting a second stroke from the same gesture.
    if (stroke.points[0].pointerType === "pen" && e.pointerType === "touch") return;

    const rect = rectFromElement(canvas);
    const point = normalizePointerEvent(e.nativeEvent, rect);
    if (lastPointRef.current) point.velocity = computeVelocity(lastPointRef.current, point);
    lastPointRef.current = point;
    activeStrokeRef.current = addPointToStroke(stroke, point);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    renderStroke(ctx, activeStrokeRef.current, canvas.width, canvas.height);
  }

  function finishStroke() {
    const stroke = activeStrokeRef.current;
    if (!stroke) return;
    activeStrokeRef.current = null;
    lastPointRef.current = null;
    clearActiveLayer();
    const now = Date.now();
    onSessionChange(commitStroke(session, stroke, now));
    onHistoryChange(recordAddStroke(history, stroke));
  }

  function handlePointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    activeCanvasRef.current?.releasePointerCapture(e.pointerId);
    finishStroke();
  }

  function handlePointerCancel() {
    // A genuine cancel (BUILD §7) — e.g. the OS intercepts the gesture for
    // a system edge swipe mid-stroke. Discard the in-progress stroke
    // rather than committing a truncated one.
    activeStrokeRef.current = null;
    lastPointRef.current = null;
    clearActiveLayer();
  }

  return (
    <div className="graffiti-canvas-stack" style={{ width: cssWidth, height: cssHeight }}>
      <canvas ref={staticCanvasRef} className="graffiti-canvas-layer" />
      <canvas
        ref={activeCanvasRef}
        className="graffiti-canvas-layer graffiti-canvas-active"
        style={{ touchAction: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      />
    </div>
  );
}
