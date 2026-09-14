export interface DrawingSurfaceLayer {
  canvas: Pick<HTMLCanvasElement, "width" | "height">;
  context: CanvasRenderingContext2D;
}

export interface ClearableDrawingRenderer {
  clear(): void;
}

export function clearDrawingSurfaceState(
  layers: readonly DrawingSurfaceLayer[],
  renderer: ClearableDrawingRenderer,
): void {
  for (const { canvas, context } of layers) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
  }
  renderer.clear();
}
