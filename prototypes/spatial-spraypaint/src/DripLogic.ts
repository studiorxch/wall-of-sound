export interface DripObservation {
  x: number;
  y: number;
  radius: number;
  timestamp: number;
  dripTendency: number;
  enabled: boolean;
  /**
   * An upper bound on how opaque a drip triggered from this spot may be,
   * standing in for "how much ink this cap actually lays down per
   * exposure" (a cap's own `coreOpacity`, not a real per-pixel canvas
   * readback — see the caller). Optional and undefined by default, which
   * preserves every existing cap's drip opacity exactly as before; only
   * callers that pass it get a drip clamped to it. A drip must not gain
   * paint from nowhere: `drip load <= source accumulated wet load`.
   */
  sourceOpacityCeiling?: number;
  /**
   * Brush-profile-driven drip shape overrides (see `BrushProfile.ts`'s
   * `dripBodyWidthRatio`/`taperAmount`/`terminalBeadRatio`). All optional
   * and undefined by default, which preserves the prior built-in formula
   * exactly for any caller that doesn't pass them.
   */
  bodyWidthRatio?: number;
  taperAmount?: number;
  terminalBeadRatio?: number;
}

export interface DripSeed {
  x: number;
  y: number;
  width: number;
  length: number;
  opacity: number;
  bend?: number;
  kink?: number;
  kinkAt?: number;
  /**
   * A second, independent wobble point, purely additive to `kink`/`kinkAt`
   * and defaulting to no contribution when unset — existing callers (every
   * Spray cap, which never sets either kink field) are byte-identical.
   * Two staggered kinks at different points along the run read as a small
   * gravity-driven correction partway down and another lower, rather than
   * one single bump — closer to how a real drip's path wanders.
   */
  kink2?: number;
  kinkAt2?: number;
  /**
   * A single, gentle low-frequency S-curve across the WHOLE run (see
   * `resolveDripStripSection`'s own doc) -- `wanderRatio` is the amplitude
   * as a fraction of `length` (default 0.03, deliberately small: gravity
   * must still visibly dominate), `wanderSeed` phase-shifts it per drip
   * (0-2π) so neighboring drips don't wander in lockstep.
   */
  wanderRatio?: number;
  wanderSeed?: number;
  durationMs?: number;
  tipWidthRatio?: number;
  originPoolRadius?: number;
  terminalBulbRatio?: number;
  renderAsOverlay?: boolean;
  attachmentUnderlap?: number;
  /** Same meaning as `DripObservation.sourceOpacityCeiling` — carried through so the renderer can also taper toward it rather than a fixed peak. */
  sourceOpacityCeiling?: number;
}

export interface DripStripSection {
  progress: number;
  center: { x: number; y: number };
  left: { x: number; y: number };
  right: { x: number; y: number };
  width: number;
}

/** Smoothstep, clamped to [0, 1] input. */
function smooth01(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return clamped * clamped * (3 - clamped * 2);
}

/**
 * The drip's width as a single continuous function of progress -- root
 * shoulder, neck, body, and terminal bead are all ONE curve, never
 * independent primitives (no stamped root circle/rectangle, no separate
 * terminal circle drawn on top -- see `resolveDripStripSection`'s own doc
 * and, for the renderers, `renderContinuousDripSilhouette`).
 *
 * Shape, low to high progress:
 * - [0, shoulderSpan]: an already-pooled origin (Mop's `originPoolRadius`)
 *   blends smoothly (smoothstep, C1-continuous, no flat plateau) down into
 *   the body's own near-full width -- liquid sagging out of the stroke,
 *   not a shape stamped on top of it.
 * - (shoulderSpan, ~0.86): the body holds close to full width, narrowing
 *   only mildly and late (`progress**3` easing keeps almost all of the
 *   loss in the final stretch) -- a liquid column, not a triangle.
 * - (~0.86, 1]: instead of continuing to the point a stamped bead used to
 *   cover up, the width itself smoothly WIDENS back out toward
 *   `terminalBulbRatio * drip.width` -- the accumulated terminal bead
 *   emerges from the same curve, no separate circle.
 */
function resolveDripWidth(drip: DripSeed, safeProgress: number): number {
  const tipWidthRatio = drip.tipWidthRatio ?? 0.58;
  const taperAmount = 1 - tipWidthRatio;
  // Narrowing arrives late -- a cubic ease keeps the body within a few
  // percent of full width through roughly the first 70-80% of the run.
  const taperEase = safeProgress ** 3;
  const narrowedWidth = drip.width * (1 - taperAmount * taperEase);

  // Terminal bead: the last stretch smoothly widens back out toward
  // `terminalBulbRatio * drip.width` instead of narrowing all the way to
  // a point -- the bead emerges from this same curve, never a separate
  // circle. `terminalBulbRatio` at/under 0 (a caller that never sets it)
  // leaves this stage a no-op, same as before.
  const terminalBulbRatio = drip.terminalBulbRatio ?? 0;
  let stemWidth = narrowedWidth;
  if (terminalBulbRatio > 0) {
    const beadZoneStart = 0.86;
    const beadBlend = smooth01((safeProgress - beadZoneStart) / (1 - beadZoneStart));
    const beadTargetWidth = drip.width * terminalBulbRatio;
    stemWidth = narrowedWidth + (beadTargetWidth - narrowedWidth) * beadBlend;
  }

  // Root shoulder: independent of the bead stage above -- applies at the
  // OTHER end of the run (low progress) regardless of whether this drip
  // has a terminal bead at all.
  const shoulderWidth = drip.renderAsOverlay && drip.originPoolRadius
    ? Math.max(stemWidth, drip.originPoolRadius * 2)
    : stemWidth;
  const shoulderSpan = 0.22;
  const neckBlend = 1 - smooth01(safeProgress / shoulderSpan);
  return Math.max(0.8, stemWidth + (shoulderWidth - stemWidth) * neckBlend);
}

export function resolveDripStripSection(
  drip: DripSeed,
  progress: number,
): DripStripSection {
  const safeProgress = Math.min(1, Math.max(0, progress));
  const bend = drip.bend ?? 0;
  const kinkOffset = (offset: number | undefined, at: number | undefined, localProgress: number) => {
    if (!offset) return 0;
    const kinkAt = at ?? 0.55;
    const kinkRadius = 0.3;
    const kinkDistance = Math.abs(localProgress - kinkAt) / kinkRadius;
    const kinkEnvelope = kinkDistance < 1
      ? 0.5 + Math.cos(Math.PI * kinkDistance) * 0.5
      : 0;
    return offset * kinkEnvelope;
  };
  // A real drip's gravity path isn't a perfectly straight vertical strip --
  // it wanders slightly. One gentle low-frequency S-curve (never a zigzag:
  // a single sine period across the WHOLE run, tiny amplitude relative to
  // `length`) layered under the existing bend/kink system, so gravity
  // still visibly dominates the overall direction.
  const wanderAmplitude = (drip.wanderRatio ?? 0.03) * drip.length;
  const wanderPhase = drip.wanderSeed ?? 0;
  const wander = (localProgress: number) =>
    Math.sin(localProgress * Math.PI + wanderPhase) * wanderAmplitude * localProgress;
  const resolveCenter = (value: number) => {
    const localProgress = Math.min(1, Math.max(0, value));
    const localEased = localProgress * localProgress;
    return {
      x: drip.x + bend * localEased
        + wander(localProgress)
        + kinkOffset(drip.kink, drip.kinkAt, localProgress)
        + kinkOffset(drip.kink2, drip.kinkAt2, localProgress),
      y: drip.y + drip.length * localEased,
    };
  };
  const center = resolveCenter(safeProgress);
  const tangentStep = 0.001;
  const tangentStart = resolveCenter(Math.max(0, safeProgress - tangentStep));
  const tangentEnd = resolveCenter(Math.min(1, safeProgress + tangentStep));
  const tangentX = tangentEnd.x - tangentStart.x;
  const tangentY = tangentEnd.y - tangentStart.y;
  const tangentLength = Math.max(0.0001, Math.hypot(tangentX, tangentY));
  const normal = { x: -tangentY / tangentLength, y: tangentX / tangentLength };
  const width = resolveDripWidth(drip, safeProgress);
  return {
    progress: safeProgress,
    center,
    left: { x: center.x + normal.x * width * 0.5, y: center.y + normal.y * width * 0.5 },
    right: { x: center.x - normal.x * width * 0.5, y: center.y - normal.y * width * 0.5 },
    width,
  };
}

/**
 * Traces ONE continuous silhouette for a drip strip -- root, body, and
 * terminal bead are all part of the SAME path and the SAME `fill()` call,
 * capped at both ends by a true rounded arc (not a separate circle drawn
 * afterward, and not a flat mechanical crossbar). The width field itself
 * already carries the bead bulge (see `resolveDripWidth`); this function's
 * only job is to close that shape off smoothly at both ends instead of
 * with a straight line.
 *
 * Callers (`WetDripEngine`, `SprayBrushEngine`) call this in place of their
 * old separate `fillStrip` + `fillRoundedTip` pair.
 */
export function traceDripSilhouettePath(
  ctx: CanvasRenderingContext2D,
  sections: readonly DripStripSection[],
): void {
  if (sections.length < 2) return;
  const angleOf = (point: { x: number; y: number }, center: { x: number; y: number }) =>
    Math.atan2(point.y - center.y, point.x - center.x);

  ctx.beginPath();
  const root = sections[0];
  ctx.moveTo(root.left.x, root.left.y);
  for (const section of sections.slice(1)) ctx.lineTo(section.left.x, section.left.y);

  const tip = sections[sections.length - 1];
  const tipRadius = tip.width * 0.5;
  if (tipRadius > 0.4) {
    // Sweeps from the tip's left point, through the forward (downward)
    // tangent direction, to its right point -- a true rounded cap fused
    // into the same path, not a circle stamped on afterward.
    ctx.arc(tip.center.x, tip.center.y, tipRadius, angleOf(tip.left, tip.center), angleOf(tip.right, tip.center), true);
  } else {
    ctx.lineTo(tip.right.x, tip.right.y);
  }

  for (let i = sections.length - 2; i >= 0; i -= 1) ctx.lineTo(sections[i].right.x, sections[i].right.y);

  const rootRadius = root.width * 0.5;
  if (rootRadius > 0.4) {
    // Same technique at the root, swept the other way so the cap bulges
    // backward (away from the body) instead of biting into it.
    ctx.arc(root.center.x, root.center.y, rootRadius, angleOf(root.right, root.center), angleOf(root.left, root.center), true);
  }
  ctx.closePath();
  ctx.fill();
}

export function buildContinuousDripStrip(
  drip: DripSeed,
  segmentCount = 12,
  endProgress = 1,
): DripStripSection[] {
  const count = Math.max(2, Math.floor(segmentCount));
  const safeEndProgress = Math.min(1, Math.max(0, endProgress));
  return Array.from({ length: count + 1 }, (_, index) =>
    resolveDripStripSection(drip, (index / count) * safeEndProgress));
}

export class DripAccumulator {
  private anchor: { x: number; y: number } | null = null;
  private lastTimestamp = 0;
  private dwellMilliseconds = 0;
  private lastDripTimestamp = -Infinity;

  public observe(observation: DripObservation): DripSeed | null {
    if (!observation.enabled || observation.dripTendency <= 0) {
      this.reset();
      return null;
    }

    const now = observation.timestamp;
    const dwellRadius = Math.max(5, observation.radius * 0.22);
    if (!this.anchor) {
      this.anchor = { x: observation.x, y: observation.y };
      this.lastTimestamp = now;
      return null;
    }

    const delta = Math.max(0, Math.min(100, now - this.lastTimestamp));
    const distance = Math.hypot(observation.x - this.anchor.x, observation.y - this.anchor.y);
    this.lastTimestamp = now;

    if (distance > dwellRadius) {
      this.anchor = { x: observation.x, y: observation.y };
      this.dwellMilliseconds = 0;
      return null;
    }

    this.dwellMilliseconds += delta;
    const tendency = Math.min(1, observation.dripTendency);
    const threshold = 1050 - tendency * 520;
    if (
      this.dwellMilliseconds < threshold ||
      now - this.lastDripTimestamp < 1250
    ) {
      return null;
    }

    this.lastDripTimestamp = now;
    this.dwellMilliseconds = threshold * 0.28;
    const nominalOpacity = 0.48 + tendency * 0.3;
    const opacity = observation.sourceOpacityCeiling !== undefined
      ? Math.min(nominalOpacity, observation.sourceOpacityCeiling)
      : nominalOpacity;
    const length = observation.radius * (0.9 + tendency * 2.2);
    return {
      x: this.anchor.x,
      y: this.anchor.y + observation.radius * 0.35,
      // Widened substantially (from ~0.045-0.08x radius, which read as
      // hair-thin threads) so a Spray drip reads as a real body of liquid,
      // not a line. `tipWidthRatio` close to 1 (rather than the wet-strip
      // default of 0.58) keeps the body MOSTLY STABLE width, narrowing only
      // moderately toward the tip -- no strong triangular/icicle taper --
      // and `terminalBulbRatio` restores a small rounded bead at the very
      // end, formed from the load remaining in the run rather than a
      // stamped shape (the same width-interpolation + rounded-tip strip
      // renderer Mop already uses, via `resolveDripStripSection`'s own
      // `taperEase = progress**4`, which keeps almost all of the narrowing
      // in the final stretch).
      width: Math.max(2.4, observation.radius * (observation.bodyWidthRatio ?? (0.11 + tendency * 0.05))),
      length,
      opacity,
      sourceOpacityCeiling: observation.sourceOpacityCeiling,
      tipWidthRatio: 1 - (observation.taperAmount ?? 0.28),
      terminalBulbRatio: observation.terminalBeadRatio ?? 1.15,
      // Gravity dominates a real drip -- only a small, restrained lateral
      // lean from surface irregularity, never a large diagonal launch. Kept
      // well below the strip renderer's own quadratic easing (which is
      // already tangent-to-vertical at the root), so even the eventual
      // total lateral drift by the tip stays subtle.
      bend: (Math.random() - 0.5) * length * 0.05,
      wanderSeed: Math.random() * Math.PI * 2,
    };
  }

  public reset(): void {
    this.anchor = null;
    this.lastTimestamp = 0;
    this.dwellMilliseconds = 0;
  }
}
