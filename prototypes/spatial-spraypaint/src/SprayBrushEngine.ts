import {
  buildContinuousDripStrip,
  resolveDripStripSection,
  type DripSeed,
  type DripStripSection,
} from "./DripLogic";
import { resolveSprayDynamics, type SprayCapPreset } from "./SprayCapPresets";
import { type StrokePoint } from "./types";

interface ActiveDrip extends DripSeed {
  color: string;
  startedAt: number;
  lastProgress: number;
  bend: number;
  durationMs: number;
  poolRendered: boolean;
}

/**
 * Fixed physical orientation for the one currently-defined "fixed-transversal"
 * cap (Calligraphy / Transversal). Matches the Marker Chisel's own nib angle so
 * both tool families share one StudioRich transversal convention. A real
 * transversal nozzle keeps this axis constant regardless of travel direction —
 * unlike overspray's anisotropy, which stays travel-relative and is untouched
 * here.
 */
export const TRANSVERSAL_AXIS_ANGLE = (-25 * Math.PI) / 180;

/**
 * Fill mode's per-stroke core-opacity ceiling. A single continuous stroke's
 * own densely-overlapping segments asymptote toward this value instead of
 * ~100%, leaving real headroom for a physically separate stroke (mouse/pen
 * lifted and pressed again) to build further coverage on top via ordinary
 * canvas compositing — which is untouched and already does this correctly.
 * Only applies when the caller opts in per-stroke; normal Spray behavior
 * (fillMode falsy) is completely unaffected.
 */
const FILL_MODE_CORE_CEILING = 0.45;

/**
 * Fill mode's local-saturation grid cell size is derived from the cap's own
 * radius (see usage below) rather than a single fixed constant, so the
 * granularity scales sensibly across thin and fat caps. This factor sets that
 * relationship: smaller than the radius so a fat cap's sweep still spans
 * several cells along its travel direction.
 */
const FILL_MODE_CELL_SIZE_RATIO = 0.6;

/**
 * The angle used to orient a cap's anisotropic squash (core width AND
 * overspray plume shape alike). A directional/"fixed-transversal" cap
 * (anisotropy < 1, currently only Calligraphy) keeps this at its fixed
 * physical axis regardless of travel direction — a real transversal nozzle's
 * orientation doesn't rotate as the hand moves. Every other cap keeps using
 * travel direction, which is a no-op for symmetric caps (anisotropy === 1).
 * Exported as a pure function so the "no wiggle/no rotating ribbon"
 * requirement is directly unit-testable without recording particle draws.
 */
export function resolveOverspraySquashAngle(anisotropy: number, travelAngle: number): number {
  return anisotropy < 1 ? TRANSVERSAL_AXIS_ANGLE : travelAngle;
}

/**
 * Elongation ratios (relative to the resolved deposition radius) for the two
 * shaped-stamp deposition modes. Slot is deliberately MORE elongated than
 * oval (bigger length:width aspect ratio) — "more obvious wide/narrow
 * contrast" than Oval Calligraphy, per the physical-reference brief.
 */
const OVAL_STAMP_LENGTH_RATIO = 1.3;
const OVAL_STAMP_WIDTH_RATIO = 0.55;
const SLOT_STAMP_LENGTH_RATIO = 1.55;
const SLOT_STAMP_WIDTH_RATIO = 0.4;
/** Slot corner radius as a fraction of the stamp's own half-width — enough to soften the rectangle for aerosol realism without reading as an oval. */
const SLOT_STAMP_CORNER_RATIO = 0.22;

export interface ShapedStampGeometry {
  shape: "oval" | "slot";
  halfLength: number;
  halfWidth: number;
  rotation: number;
  cornerRadius: number;
}

/**
 * Pure geometry for one shaped core stamp. Notably takes NO travel-direction
 * input at all — the shape's dimensions and rotation are fixed regardless of
 * how the path moves, which is the actual fix for "must not rotate with the
 * stroke tangent": there is nothing here for travel direction to influence.
 * Returns null for "line" caps, which keep the original stroked-line path.
 */
export function resolveShapedStampGeometry(
  depositionShape: SprayCapPreset["depositionShape"],
  scale: number,
): ShapedStampGeometry | null {
  if (depositionShape === "line") return null;
  const lengthRatio = depositionShape === "oval" ? OVAL_STAMP_LENGTH_RATIO : SLOT_STAMP_LENGTH_RATIO;
  const widthRatio = depositionShape === "oval" ? OVAL_STAMP_WIDTH_RATIO : SLOT_STAMP_WIDTH_RATIO;
  const halfWidth = scale * widthRatio;
  return {
    shape: depositionShape,
    halfLength: scale * lengthRatio,
    halfWidth,
    rotation: TRANSVERSAL_AXIS_ANGLE,
    cornerRadius: depositionShape === "slot" ? halfWidth * SLOT_STAMP_CORNER_RATIO : 0,
  };
}

/**
 * The apparent stroke width a fixed-rotation shaped stamp produces when swept
 * along a given travel direction — the standard "support width" of an
 * ellipse/rounded-rect in the direction perpendicular to travel. This is a
 * pure consequence of the stamp's own fixed geometry, not a separate
 * width-modulation rule: travel parallel to the shape's long axis yields
 * ~2*halfWidth (narrow); travel perpendicular yields ~2*halfLength (wide).
 */
export function shapedStampWidthAlongTravel(geometry: ShapedStampGeometry, travelAngle: number): number {
  const perpendicular = travelAngle + Math.PI / 2;
  const local = perpendicular - geometry.rotation;
  return 2 * Math.sqrt(
    (geometry.halfLength * Math.cos(local)) ** 2 + (geometry.halfWidth * Math.sin(local)) ** 2,
  );
}

export function createStrokeRandom(seed: number): () => number {
  let state = (seed || 1) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export class SprayBrushEngine {
  private activeDrips: ActiveDrip[] = [];
  /**
   * Uncapped virtual saturation [0,1] a given map cell would reach with
   * standard compositing, tracked only while fillMode is active and keyed by
   * a coarse grid cell so saturation is LOCAL to painted space, not global to
   * the whole gesture — a cell a stroke has never visited starts at 0 even
   * deep into a long continuous sweep, and revisiting the same cell (a
   * back-and-forth pass with no pointer release) keeps accumulating there
   * specifically. Reset at the start of every stroke (live or replayed), so
   * a new stroke always starts every cell fresh and composites normally on
   * top of whatever a prior stroke already deposited.
   */
  private fillLocalSaturation = new Map<string, number>();

  public resize(_width: number, _height: number): void {
    // The brush deposits directly into the persistent paint canvas.
  }

  public clear(): void {
    this.activeDrips = [];
  }

  public beginStroke(): void {
    this.fillLocalSaturation.clear();
  }

  private fillCellKey(x: number, y: number, cellSize: number): string {
    return `${Math.round(x / cellSize)},${Math.round(y / cellSize)}`;
  }

  public renderSegment(
    ctx: CanvasRenderingContext2D,
    previous: StrokePoint | null,
    point: StrokePoint,
    colorHex: string,
    cap: SprayCapPreset,
    random: () => number = Math.random,
    coverage: number = 1,
    fillMode: boolean = false,
  ): void {
    const dynamics = resolveSprayDynamics(cap, point.velocity, point.width);
    const coverageFactor = Math.max(0, Math.min(1, coverage));
    const start = previous ?? point;
    const dx = point.x - start.x;
    const dy = point.y - start.y;
    const distance = Math.hypot(dx, dy);
    const angle = distance > 0 ? Math.atan2(dy, dx) : 0;
    const passOpacity = (dynamics.coreOpacity * point.opacity * coverageFactor) / Math.sqrt(dynamics.corePasses);
    // A directional/"fixed-transversal" cap (anisotropy < 1, currently only
    // Calligraphy) should read wide or thin depending on travel direction
    // relative to its fixed physical axis — not just uniformly thinner in
    // every direction, which is all the raw anisotropy factor alone gives.
    const directionalBroadening = Math.abs(Math.sin(angle - TRANSVERSAL_AXIS_ANGLE));
    const directionalAnisotropy = dynamics.anisotropy < 1
      ? dynamics.anisotropy + (1 - dynamics.anisotropy) * directionalBroadening
      : dynamics.anisotropy;

    // Wiggly Needle's bounded deterministic wander: a smooth lateral offset
    // driven by each point's own recorded timestamp (not Math.random), so it
    // reproduces identically on replay. Perpendicular to true travel — the
    // dynamics/velocity math above still uses the real path, only the drawn
    // ink wanders. Every other cap has wiggleAmplitude 0 and is unaffected.
    const wiggleAmplitude = dynamics.radius * cap.wiggleAmplitude;
    const drawStart: StrokePoint = { ...start };
    const drawPoint: StrokePoint = { ...point };
    if (wiggleAmplitude > 0) {
      const perpAngle = angle + Math.PI / 2;
      const perpX = Math.cos(perpAngle);
      const perpY = Math.sin(perpAngle);
      const startOffset = Math.sin(start.timestamp * cap.wiggleFrequency) * wiggleAmplitude;
      const pointOffset = Math.sin(point.timestamp * cap.wiggleFrequency) * wiggleAmplitude;
      drawStart.x += perpX * startOffset;
      drawStart.y += perpY * startOffset;
      drawPoint.x += perpX * pointOffset;
      drawPoint.y += perpY * pointOffset;
    }

    this.renderHalo(ctx, drawStart, drawPoint, colorHex, cap, dynamics, coverageFactor);

    ctx.save();
    ctx.lineCap = cap.endpointBehavior === "raw" ? "butt" : "round";
    ctx.lineJoin = "round";

    // Fill mode's saturation ceiling must be LOCAL to where paint is actually
    // landing, not global to the whole gesture — otherwise a long sweep fades
    // to nothing by its own end, and a fresh area painted later in the same
    // continuous stroke wrongly inherits an already-spent budget from
    // wherever the stroke has been before. Segments are short relative to a
    // cap's own radius, so the segment's midpoint is a good stand-in for the
    // whole segment; the cell size scales with cap radius so thin and fat
    // caps both get sensible granularity.
    const cellSize = Math.max(1, dynamics.radius * FILL_MODE_CELL_SIZE_RATIO);
    const cellKey = fillMode
      ? this.fillCellKey((drawStart.x + drawPoint.x) / 2, (drawStart.y + drawPoint.y) / 2, cellSize)
      : null;

    for (let pass = dynamics.corePasses - 1; pass >= 0; pass -= 1) {
      const passRatio = dynamics.corePasses === 1 ? 0 : pass / (dynamics.corePasses - 1);
      const edgeExpansion = 1 + passRatio * (1 - cap.edgeFalloff) * 0.72;
      const jitterX = (random() - 0.5) * dynamics.jitter;
      const jitterY = (random() - 0.5) * dynamics.jitter;
      const endpointScale = previous ? 1 : cap.endpointBehavior === "punchy" ? 0.82 : 0.68;
      const nominalPassAlpha = passOpacity * (1 - passRatio * 0.48);
      // Cap this LOCATION's own cumulative core opacity, without touching how
      // a physically separate stroke composites on top of it. Tracked per
      // actual draw call (every corePasses sub-layer counts, not just once
      // per segment) so the true composited result — corePasses stack on
      // each other too — asymptotes to the ceiling, not just the segment-
      // level estimate. Track what this draw's coverage would be under
      // ordinary compositing (`nextVirtual`), remap into the ceiling band,
      // then solve for the alpha this draw must actually use so the canvas
      // moves from the previous remapped coverage to the next one exactly —
      // the definition of standard "source-over" compositing, just aimed at
      // a lower asymptote.
      let drawnAlpha = nominalPassAlpha;
      if (fillMode && cellKey !== null) {
        const priorVirtual = this.fillLocalSaturation.get(cellKey) ?? 0;
        const nextVirtual = 1 - (1 - priorVirtual) * (1 - nominalPassAlpha);
        const priorVisible = FILL_MODE_CORE_CEILING * priorVirtual;
        const nextVisible = FILL_MODE_CORE_CEILING * nextVirtual;
        drawnAlpha = priorVisible >= 1 ? 0 : (nextVisible - priorVisible) / (1 - priorVisible);
        this.fillLocalSaturation.set(cellKey, nextVirtual);
      }
      const stampGeometry = resolveShapedStampGeometry(cap.depositionShape, dynamics.radius * edgeExpansion * endpointScale);
      if (stampGeometry) {
        // A genuinely elongated, fixed-orientation stamp — not a width trick.
        // Stamped at both segment endpoints (like renderHalo above) so fine
        // interpolation spacing tiles into a continuous swept band; the
        // wide/narrow response is a pure consequence of this fixed shape's
        // own geometry as it's swept through different travel directions.
        const fillStyle = this.hexToRgba(colorHex, drawnAlpha);
        this.drawShapedStamp(ctx, drawStart.x + jitterX, drawStart.y + jitterY, stampGeometry, fillStyle);
        if (drawStart.x !== drawPoint.x || drawStart.y !== drawPoint.y) {
          this.drawShapedStamp(ctx, drawPoint.x + jitterX, drawPoint.y + jitterY, stampGeometry, fillStyle);
        }
      } else {
        ctx.strokeStyle = this.hexToRgba(colorHex, drawnAlpha);
        ctx.lineWidth = Math.max(0.7, dynamics.radius * 2 * directionalAnisotropy * edgeExpansion * endpointScale);
        ctx.beginPath();
        ctx.moveTo(drawStart.x + jitterX, drawStart.y + jitterY);
        ctx.lineTo(drawPoint.x + jitterX, drawPoint.y + jitterY);
        ctx.stroke();
      }
    }

    ctx.restore();
    const oversprayAngle = resolveOverspraySquashAngle(dynamics.anisotropy, angle);
    this.renderOverspray(ctx, drawStart, drawPoint, colorHex, dynamics, oversprayAngle, distance, random, coverageFactor);
  }

  /**
   * Soft outer "halo" ring beneath the core — a continuous radial field
   * (not speckled particles like overspray), so a "loaded dot" cap reads as
   * a recognizable dense-center/soft-ring bloom rather than a blurred fat
   * dot. Drawn at both segment endpoints so a moving stroke gets a continuous
   * halo tube, and a stationary dwell (repeated near-zero-distance segments
   * at the same point) naturally strengthens the center through ordinary
   * source-over compositing — no separate dwell/time tracking needed.
   */
  private renderHalo(
    ctx: CanvasRenderingContext2D,
    start: { x: number; y: number },
    point: { x: number; y: number },
    colorHex: string,
    cap: SprayCapPreset,
    dynamics: ReturnType<typeof resolveSprayDynamics>,
    coverageFactor: number,
  ): void {
    if (cap.haloRadius <= 0 || cap.haloOpacity <= 0) return;
    const haloRadius = dynamics.radius * cap.haloRadius;
    if (haloRadius <= 0) return;
    const alpha = cap.haloOpacity * coverageFactor;
    if (alpha <= 0) return;
    const drawHaloAt = (x: number, y: number) => {
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, haloRadius);
      gradient.addColorStop(0, this.hexToRgba(colorHex, alpha));
      gradient.addColorStop(1, this.hexToRgba(colorHex, 0));
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, haloRadius, 0, Math.PI * 2);
      ctx.fill();
    };
    drawHaloAt(start.x, start.y);
    if (start.x !== point.x || start.y !== point.y) drawHaloAt(point.x, point.y);
  }

  /**
   * Draws one fixed-orientation shaped core stamp (oval or rounded slot),
   * centered at (cx, cy). This is the actual "genuinely elongated deposition"
   * mechanism — an ellipse or rotated rounded-rectangle path, not a stroked
   * line with a width trick. See `resolveShapedStampGeometry` for why the
   * fixed rotation alone (no travel-direction input) is what keeps this from
   * rotating with the stroke tangent.
   */
  private drawShapedStamp(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    geometry: ShapedStampGeometry,
    fillStyle: string,
  ): void {
    ctx.fillStyle = fillStyle;
    if (geometry.shape === "oval") {
      ctx.beginPath();
      ctx.ellipse(cx, cy, geometry.halfLength, geometry.halfWidth, geometry.rotation, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    const { halfLength: hl, halfWidth: hw, rotation, cornerRadius } = geometry;
    const r = Math.max(0, Math.min(cornerRadius, hl, hw));
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.beginPath();
    ctx.moveTo(-hl + r, -hw);
    ctx.lineTo(hl - r, -hw);
    ctx.arcTo(hl, -hw, hl, -hw + r, r);
    ctx.lineTo(hl, hw - r);
    ctx.arcTo(hl, hw, hl - r, hw, r);
    ctx.lineTo(-hl + r, hw);
    ctx.arcTo(-hl, hw, -hl, hw - r, r);
    ctx.lineTo(-hl, -hw + r);
    ctx.arcTo(-hl, -hw, -hl + r, -hw, r);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  public startDrip(seed: DripSeed, color: string, now = performance.now()): void {
    this.activeDrips.push({
      ...seed,
      color,
      startedAt: now,
      lastProgress: 0,
      bend: seed.bend ?? (Math.random() - 0.5) * seed.length * 0.12,
      durationMs: seed.durationMs ?? 1200,
      poolRendered: false,
    });
  }

  public advanceDrips(ctx: CanvasRenderingContext2D, now = performance.now()): void {
    this.activeDrips = this.activeDrips.filter((drip) => {
      const progress = Math.min(1, Math.max(0, (now - drip.startedAt) / drip.durationMs));
      if (progress <= drip.lastProgress) return progress < 1;

      const easedPrevious = drip.lastProgress * drip.lastProgress;
      const easedCurrent = progress * progress;
      const startX = drip.x + drip.bend * easedPrevious;
      const startY = drip.y + drip.length * easedPrevious;
      const endX = drip.x + drip.bend * easedCurrent;
      const endY = drip.y + drip.length * easedCurrent;

      ctx.save();
      ctx.lineCap = "round";
      if (!drip.poolRendered && drip.originPoolRadius) {
        ctx.fillStyle = this.hexToRgba(drip.color, Math.min(0.94, drip.opacity));
        ctx.beginPath();
        ctx.arc(drip.x, drip.y, drip.originPoolRadius, 0, Math.PI * 2);
        ctx.fill();
        drip.poolRendered = true;
      }
      if (drip.tipWidthRatio !== undefined) {
        // A stable alpha prevents visible bands where progressive wet-strip
        // sections meet on the persistent paint layer.
        ctx.fillStyle = this.hexToRgba(drip.color, drip.opacity * 0.82);
        this.fillDripStrip(ctx, [
          resolveDripStripSection(drip, drip.lastProgress),
          resolveDripStripSection(drip, progress),
        ]);
        if (progress === 1 && drip.terminalBulbRatio) {
          ctx.beginPath();
          ctx.arc(endX, endY, Math.max(0.7, drip.width * drip.terminalBulbRatio * 0.5), 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.strokeStyle = this.hexToRgba(drip.color, drip.opacity * (1 - progress * 0.24));
        ctx.lineWidth = Math.max(0.8, drip.width * (1 - progress * 0.42));
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
      }
      ctx.restore();

      drip.lastProgress = progress;
      return progress < 1;
    });
  }

  public renderCompletedDrip(
    ctx: CanvasRenderingContext2D,
    drip: DripSeed,
    color: string,
  ): void {
    ctx.save();
    ctx.lineCap = "round";
    ctx.strokeStyle = this.hexToRgba(color, drip.opacity * 0.76);
    if (drip.originPoolRadius) {
      ctx.fillStyle = this.hexToRgba(color, Math.min(0.94, drip.opacity));
      ctx.beginPath();
      ctx.arc(drip.x, drip.y, drip.originPoolRadius, 0, Math.PI * 2);
      ctx.fill();
    }
    if (drip.tipWidthRatio !== undefined) {
      ctx.fillStyle = this.hexToRgba(color, drip.opacity * 0.82);
      const strip = buildContinuousDripStrip(drip);
      this.fillDripStrip(ctx, strip);
      if (drip.terminalBulbRatio) {
        const tip = strip[strip.length - 1];
        ctx.beginPath();
        ctx.arc(
          tip.center.x,
          tip.center.y,
          Math.max(0.7, drip.width * drip.terminalBulbRatio * 0.5),
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    } else {
      ctx.lineWidth = Math.max(0.8, drip.width * 0.72);
      ctx.beginPath();
      ctx.moveTo(drip.x, drip.y);
      ctx.lineTo(drip.x + (drip.bend ?? 0), drip.y + drip.length);
      ctx.stroke();
    }
    ctx.restore();
  }

  private fillDripStrip(
    ctx: CanvasRenderingContext2D,
    sections: readonly DripStripSection[],
  ): void {
    if (sections.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(sections[0].left.x, sections[0].left.y);
    for (const section of sections.slice(1)) ctx.lineTo(section.left.x, section.left.y);
    for (const section of [...sections].reverse()) ctx.lineTo(section.right.x, section.right.y);
    ctx.closePath();
    ctx.fill();
  }

  private renderOverspray(
    ctx: CanvasRenderingContext2D,
    start: StrokePoint,
    point: StrokePoint,
    color: string,
    dynamics: ReturnType<typeof resolveSprayDynamics>,
    angle: number,
    distance: number,
    random: () => number,
    coverageFactor: number = 1,
  ): void {
    const segmentFactor = Math.max(0.3, Math.min(1.6, distance / Math.max(1, dynamics.radius) + 0.32));
    const count = Math.round(dynamics.particleCount * segmentFactor);
    ctx.fillStyle = this.hexToRgba(color, dynamics.particleOpacity * point.opacity * coverageFactor);

    for (let index = 0; index < count; index += 1) {
      const along = random();
      const centerX = start.x + (point.x - start.x) * along;
      const centerY = start.y + (point.y - start.y) * along;
      const spreadAngle = random() * Math.PI * 2;
      const spread = Math.pow(random(), 1.55) * dynamics.particleSpread;
      const directionalX = Math.cos(spreadAngle) * spread;
      const directionalY = Math.sin(spreadAngle) * spread;
      const anisotropicX = directionalX * Math.cos(angle) - directionalY * dynamics.anisotropy * Math.sin(angle);
      const anisotropicY = directionalX * Math.sin(angle) + directionalY * dynamics.anisotropy * Math.cos(angle);
      const splatter = random() < dynamics.splatterProbability ? 1.8 + random() * 1.8 : 1;
      const particleSize = Math.max(0.18, dynamics.particleSize * splatter * (0.45 + random() * 0.9));

      ctx.beginPath();
      ctx.arc(centerX + anisotropicX, centerY + anisotropicY, particleSize, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private hexToRgba(hex: string, alpha: number): string {
    let value = hex.replace("#", "");
    if (value.length === 3) value = value.split("").map((channel) => channel + channel).join("");
    const numeric = Number.parseInt(value, 16);
    const red = (numeric >> 16) & 255;
    const green = (numeric >> 8) & 255;
    const blue = numeric & 255;
    return `rgba(${red}, ${green}, ${blue}, ${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
  }
}
