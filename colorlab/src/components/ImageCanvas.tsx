import React, { useCallback, useEffect, useRef } from 'react';
import type { ColorSelector } from '../types/palette';
import { sampleColorAtPosition } from '../lib/colorExtraction';

interface Props {
  image: HTMLImageElement;
  selectors: ColorSelector[];
  onSelectorsChange: (selectors: ColorSelector[]) => void;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

const SELECTOR_RADIUS = 12;

export default function ImageCanvas({ image, selectors, onSelectorsChange, canvasRef }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);

  // Draw image onto canvas whenever image or canvas changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  }, [image, canvasRef]);

  // Resize canvas to fit container while preserving aspect ratio
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const maxW = container.clientWidth;
    const maxH = container.clientHeight || 520;
    const aspect = image.naturalWidth / image.naturalHeight;
    let w = maxW;
    let h = Math.round(maxW / aspect);
    if (h > maxH) { h = maxH; w = Math.round(maxH * aspect); }
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext('2d');
    if (ctx) ctx.drawImage(image, 0, 0, w, h);
  }, [image, canvasRef]);

  const getNormPos = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
    };
  }, [canvasRef]);

  const onMouseDown = useCallback((e: React.MouseEvent, selectorId: string) => {
    e.stopPropagation();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sel = selectors.find(s => s.id === selectorId);
    if (!sel) return;
    draggingRef.current = {
      id: selectorId,
      offsetX: e.clientX - rect.left - sel.x * rect.width,
      offsetY: e.clientY - rect.top - sel.y * rect.height,
    };
  }, [selectors, canvasRef]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!draggingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const nx = Math.max(0, Math.min(1, (e.clientX - rect.left - draggingRef.current.offsetX) / rect.width));
    const ny = Math.max(0, Math.min(1, (e.clientY - rect.top - draggingRef.current.offsetY) / rect.height));
    const color = sampleColorAtPosition(canvas, nx, ny);
    onSelectorsChange(selectors.map(s =>
      s.id === draggingRef.current!.id ? { ...s, x: nx, y: ny, color } : s
    ));
  }, [selectors, onSelectorsChange, canvasRef]);

  const onMouseUp = useCallback(() => { draggingRef.current = null; }, []);

  const onTouchStart = useCallback((e: React.TouchEvent, selectorId: string) => {
    e.stopPropagation();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const sel = selectors.find(s => s.id === selectorId);
    if (!sel) return;
    draggingRef.current = {
      id: selectorId,
      offsetX: touch.clientX - rect.left - sel.x * rect.width,
      offsetY: touch.clientY - rect.top - sel.y * rect.height,
    };
  }, [selectors, canvasRef]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!draggingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const nx = Math.max(0, Math.min(1, (touch.clientX - rect.left - draggingRef.current.offsetX) / rect.width));
    const ny = Math.max(0, Math.min(1, (touch.clientY - rect.top - draggingRef.current.offsetY) / rect.height));
    const color = sampleColorAtPosition(canvas, nx, ny);
    onSelectorsChange(selectors.map(s =>
      s.id === draggingRef.current!.id ? { ...s, x: nx, y: ny, color } : s
    ));
  }, [selectors, onSelectorsChange, canvasRef]);

  return (
    <div
      ref={containerRef}
      className="canvas-container"
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onTouchMove={onTouchMove}
      onTouchEnd={onMouseUp}
    >
      <canvas ref={canvasRef} className="image-canvas" />
      {selectors.map(sel => {
        const canvas = canvasRef.current;
        const rect = canvas?.getBoundingClientRect();
        const cw = canvas?.clientWidth ?? 0;
        const ch = canvas?.clientHeight ?? 0;
        const px = sel.x * cw;
        const py = sel.y * ch;
        const isDark = (sel.color.r * 0.299 + sel.color.g * 0.587 + sel.color.b * 0.114) < 128;
        return (
          <div
            key={sel.id}
            className="color-pin"
            style={{
              left: px,
              top: py,
              background: `rgb(${sel.color.r},${sel.color.g},${sel.color.b})`,
              borderColor: isDark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.55)',
            }}
            onMouseDown={e => onMouseDown(e, sel.id)}
            onTouchStart={e => onTouchStart(e, sel.id)}
          />
        );
      })}
    </div>
  );
}
