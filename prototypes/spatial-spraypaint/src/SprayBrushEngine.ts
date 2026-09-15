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
const TRANSVERSAL_AXIS_ANGLE = (-25 * Math.PI) / 180;

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
    const cellKey = fillMode ? this.fillCellKey((start.x + point.x) / 2, (start.y + point.y) / 2, cellSize) : null;

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
      ctx.strokeStyle = this.hexToRgba(colorHex, drawnAlpha);
      ctx.lineWidth = Math.max(0.7, dynamics.radius * 2 * directionalAnisotropy * edgeExpansion * endpointScale);
      ctx.beginPath();
      ctx.moveTo(start.x + jitterX, start.y + jitterY);
      ctx.lineTo(point.x + jitterX, point.y + jitterY);
      ctx.stroke();
    }

    ctx.restore();
    this.renderOverspray(ctx, start, point, colorHex, dynamics, angle, distance, random, coverageFactor);
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
