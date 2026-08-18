import { useEffect, useRef } from "react";
import type { Stroke } from "../../graffiti/graffitiTypes";
import { sizeCanvasForDPR, renderStroke } from "../../graffiti/graffitiCanvasRenderer";

type Props = {
  strokes: Stroke[];
  canvasWidth: number;
  canvasHeight: number;
  cssWidth: number;
  cssHeight: number;
  backgroundImageSrc?: string;
};

// A read-only render of an already-generated stroke set — reuses the exact
// same renderStroke()/BRUSH_REGISTRY the live Drawing App and Resident
// generator both produce data for (BUILD §32: preview through the existing
// renderer, never a second rendering path). Renders once per strokes
// change; no pointer handling at all (this is inspection-only).
export function GraffitiPreviewCanvas({ strokes, canvasWidth, canvasHeight, cssWidth, cssHeight, backgroundImageSrc }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dpr = typeof window !== "undefined" ? (window.devicePixelRatio || 1) : 1;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    sizeCanvasForDPR(canvas, cssWidth, cssHeight, dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function draw() {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      strokes.forEach((s) => renderStroke(ctx, s, canvas.width, canvas.height));
    }

    if (backgroundImageSrc) {
      const img = new Image();
      img.onload = () => { ctx.drawImage(img, 0, 0, canvas.width, canvas.height); draw(); };
      img.src = backgroundImageSrc;
    } else {
      draw();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes, cssWidth, cssHeight, dpr, backgroundImageSrc]);

  return <canvas ref={canvasRef} className="graffiti-preview-canvas" style={{ width: cssWidth, height: cssHeight }} />;
}
