import type { Artwork, ArtworkBounds } from "@studiorich/member-identity";
import { traceSmoothedPath } from "./strokeSmoothing";

/**
 * Member V1A -- derived, disposable Artwork gallery thumbnails.
 *
 * No Firebase Storage, no persisted thumbnail field: every preview is
 * rendered client-side, on demand, straight from the existing structured
 * composition (`Artwork.marks` + `Artwork.composition.bounds`). Nothing here
 * is written back to Firestore.
 *
 * Reuse, not a second renderer: `traceSmoothedPath` is the exact same
 * quadratic-midpoint path smoother the live Wall/Blackbook stroke renderers
 * use (strokeSmoothing.ts). What this module deliberately does NOT reuse is
 * the live per-material texture engines (Mop dab placement, Spray particle
 * scatter) -- those are driven by the live drawing gesture and Mapbox camera
 * zoom, not by a static persisted composition, so reproducing their exact
 * per-dab jitter here would mean a second, visually-divergent implementation
 * of the same material, which is exactly what this pass was told to avoid.
 * Instead every stroke mark (regardless of material) previews as a smoothed,
 * colored line at its authored width/opacity -- a lightweight, honest
 * silhouette of the composition, not a materially-accurate repaint. A
 * material-erasure mark or any mark whose geometry cannot be projected is
 * skipped, never thrown -- one bad Mark must not blank the whole preview.
 */

export interface ThumbnailSize {
  readonly width: number;
  readonly height: number;
}

interface PlanarPoint {
  readonly x: number;
  readonly y: number;
}

interface PlanarBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

function toPlanarBounds(bounds: ArtworkBounds): { planar: PlanarBounds; isGeographic: boolean } {
  if ("west" in bounds) {
    return { planar: { minX: bounds.west, minY: bounds.south, maxX: bounds.east, maxY: bounds.north }, isGeographic: true };
  }
  return { planar: { minX: bounds.minX, minY: bounds.minY, maxX: bounds.maxX, maxY: bounds.maxY }, isGeographic: false };
}

function toPlanarPoint(point: unknown): PlanarPoint | null {
  if (!point || typeof point !== "object") return null;
  const candidate = point as Record<string, unknown>;
  if (Number.isFinite(candidate.longitude) && Number.isFinite(candidate.latitude)) {
    return { x: candidate.longitude as number, y: candidate.latitude as number };
  }
  if (Number.isFinite(candidate.x) && Number.isFinite(candidate.y)) {
    return { x: candidate.x as number, y: candidate.y as number };
  }
  return null;
}

export interface ArtworkThumbnailProjector {
  readonly project: (point: unknown) => PlanarPoint | null;
  /** Composition-units-to-pixels scale, so callers can scale stroke width consistently with position. */
  readonly scale: number;
}

/**
 * Fits `bounds` into `size` (preserving aspect ratio, centered, with
 * `padding` pixels of margin) and returns a point projector. Returns `null`
 * for degenerate bounds (zero-area, non-finite) or a non-positive target
 * size -- callers must fail gracefully rather than divide by zero.
 *
 * Geographic bounds are flipped vertically (latitude increases northward =
 * up on a map, but canvas y increases downward); local/Blackbook bounds are
 * already canvas-oriented and are not flipped.
 */
export function createArtworkThumbnailProjector(
  bounds: ArtworkBounds,
  size: ThumbnailSize,
  padding = 6,
): ArtworkThumbnailProjector | null {
  if (!(size.width > 0) || !(size.height > 0)) return null;
  const { planar, isGeographic } = toPlanarBounds(bounds);
  const spanX = planar.maxX - planar.minX;
  const spanY = planar.maxY - planar.minY;
  if (!Number.isFinite(spanX) || !Number.isFinite(spanY) || spanX <= 0 || spanY <= 0) return null;

  const innerWidth = Math.max(0, size.width - padding * 2);
  const innerHeight = Math.max(0, size.height - padding * 2);
  if (innerWidth <= 0 || innerHeight <= 0) return null;

  const scale = Math.min(innerWidth / spanX, innerHeight / spanY);
  const drawWidth = spanX * scale;
  const drawHeight = spanY * scale;
  const offsetX = padding + (innerWidth - drawWidth) / 2;
  const offsetY = padding + (innerHeight - drawHeight) / 2;

  return {
    scale,
    project(point: unknown): PlanarPoint | null {
      const planarPoint = toPlanarPoint(point);
      if (!planarPoint) return null;
      const normalizedX = (planarPoint.x - planar.minX) / spanX;
      const normalizedYRaw = (planarPoint.y - planar.minY) / spanY;
      const normalizedY = isGeographic ? 1 - normalizedYRaw : normalizedYRaw;
      const x = offsetX + normalizedX * drawWidth;
      const y = offsetY + normalizedY * drawHeight;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      return { x, y };
    },
  };
}

export interface ThumbnailDrawResult {
  readonly ok: boolean;
  readonly drawnMarkCount: number;
  readonly skippedMarkCount: number;
}

const MIN_LINE_WIDTH_PX = 1;

/**
 * Draws a lightweight preview of `artwork` into `ctx` at `size`. Never
 * throws: any mark that cannot be projected/rendered is counted as skipped
 * and drawing continues. `ok` is true only if at least one mark actually
 * drew (an all-skipped or degenerate-bounds Artwork still returns a result,
 * letting the caller show a neutral placeholder instead of a blank canvas).
 */
export function drawArtworkThumbnail(
  ctx: CanvasRenderingContext2D,
  artwork: Artwork,
  size: ThumbnailSize,
): ThumbnailDrawResult {
  const projector = createArtworkThumbnailProjector(artwork.composition.bounds, size);
  if (!projector) return { ok: false, drawnMarkCount: 0, skippedMarkCount: artwork.marks.length };

  let drawnMarkCount = 0;
  let skippedMarkCount = 0;

  for (const mark of artwork.marks) {
    if (mark.type !== "stroke") {
      skippedMarkCount += 1;
      continue;
    }
    try {
      const points = mark.geometry.points
        .map((point) => projector.project(point))
        .filter((point): point is PlanarPoint => point !== null);
      if (points.length < 2) {
        skippedMarkCount += 1;
        continue;
      }
      ctx.save();
      ctx.globalAlpha = Math.min(1, Math.max(0, mark.style.opacity));
      ctx.strokeStyle = mark.style.color;
      ctx.lineWidth = Math.max(MIN_LINE_WIDTH_PX, mark.style.width * projector.scale);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      traceSmoothedPath(ctx, points);
      ctx.stroke();
      ctx.restore();
      drawnMarkCount += 1;
    } catch {
      skippedMarkCount += 1;
    }
  }

  return { ok: drawnMarkCount > 0, drawnMarkCount, skippedMarkCount };
}
