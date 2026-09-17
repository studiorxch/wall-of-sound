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
   * V0.10.17: the explicit gravity vector this drip falls along -- NOT a
   * hardcoded vertical line with lateral offsets bolted on. Defaults to
   * `{ x: 0, y: 1 }` (straight down a flat upright wall) when unset, which
   * is byte-identical to every prior caller's behavior. `bend`/`kink`/
   * `kink2`/`wander` are all perturbations measured perpendicular to THIS
   * vector, not raw x-offsets -- so a future non-vertical gravity (wall
   * tilt, a substrate groove/channel) rotates the whole drip's lateral
   * wobble along with it instead of fighting it. Does not need to be
   * pre-normalized; every consumer normalizes it.
   */
  gravity?: { x: number; y: number };
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
 * V0.10.17: the drip's width as a single continuous function of progress,
 * built from THREE independently-understood regions that a caller sets
 * independently -- never one region's parameter silently redefining
 * another's:
 *
 * A. ATTACHMENT (`drip.originPoolRadius`, [0, attachmentSpan]): the neck
 *    emerging from the wet source. Capped at `attachmentCapRatio` (1.7x)
 *    of `drip.width` regardless of how large `originPoolRadius` itself is
 *    -- a wide pooled reservoir must not balloon the drip's own visible
 *    root into a "match head"/"ear spoon"; most of a real pool's mass
 *    reads through the SOURCE MARK it sits on top of (see
 *    `attachmentUnderlap`, which tucks the seam under that mark), not
 *    through this drip's own silhouette.
 * B. COLUMN (`drip.width`, the resolvedBodyWidth every caller computes as
 *    `sourceStrokeWidth * profile.drip.bodyWidth` -- see BrushProfile.ts
 *    and DripAccumulator/WetPaintModel's own spawn sites): the stable
 *    reference width for the falling liquid. `drip.tipWidthRatio` is a
 *    DEVIATION from this reference (floored at 0.55 -- even the strongest
 *    taper never converges to a needle), not a redefinition of it.
 * C. TERMINATION (`drip.terminalBulbRatio`, the final ~8% of progress):
 *    SUBTLE terminal accumulation relative to the column width AT THAT
 *    POINT, not the drip's full base width -- 1.0 (the default) means
 *    "no intentional enlargement, just the natural rounded cap every drip
 *    already gets from `traceDripSilhouettePath`'s own arc," and even the
 *    top of the allowed range (1.35) is a subtle bead, never 2-4x wider
 *    than the column next to it (the "match head"/"thermometer" defect).
 */
const BEAD_ZONE_START = 0.92;

function resolveDripWidth(drip: DripSeed, safeProgress: number): number {
  const resolvedBodyWidth = drip.width;
  const tipWidthRatio = Math.min(1, Math.max(0.55, drip.tipWidthRatio ?? 1));
  const taperAmount = 1 - tipWidthRatio;
  // Narrowing arrives late -- a cubic ease keeps the column within a few
  // percent of full width through roughly the first 70-80% of the run.
  const taperEase = (p: number) => p ** 3;
  const columnWidthAt = (p: number) => resolvedBodyWidth * (1 - taperAmount * taperEase(p));
  const columnWidth = columnWidthAt(safeProgress);

  // C. Termination -- a SMALL late-stage modulation relative to the
  // column's OWN width at the moment the bead zone begins (frozen, not
  // still-declining), so the bead reads as genuine accumulation on top of
  // wherever the taper had gotten to -- not a race between two competing
  // downward/upward curves that can net out to no visible bump at all.
  // 1.0 (or undefined) is a true no-op: the column's own natural rounded
  // cap is the only "termination" a caller gets by default.
  const terminalBulbRatio = Math.min(1.35, Math.max(1, drip.terminalBulbRatio ?? 1));
  let width = columnWidth;
  if (terminalBulbRatio > 1 && safeProgress > BEAD_ZONE_START) {
    const beadBlend = smooth01((safeProgress - BEAD_ZONE_START) / (1 - BEAD_ZONE_START));
    const columnAtBeadStart = columnWidthAt(BEAD_ZONE_START);
    const beadTarget = columnAtBeadStart * terminalBulbRatio;
    width = columnAtBeadStart + (beadTarget - columnAtBeadStart) * beadBlend;
  }

  // A. Attachment -- capped relative to the column's own reference width,
  // regardless of how the caller computed `originPoolRadius`.
  const attachmentCapRatio = 1.7;
  const shoulderWidth = drip.renderAsOverlay && drip.originPoolRadius
    ? Math.min(Math.max(width, drip.originPoolRadius * 2), resolvedBodyWidth * attachmentCapRatio)
    : width;
  const attachmentSpan = 0.18;
  const neckBlend = 1 - smooth01(safeProgress / attachmentSpan);
  return Math.max(0.8, width + (shoulderWidth - width) * neckBlend);
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
  // The explicit gravity vector this drip falls along (see `DripSeed.gravity`'s
  // own doc) -- `bend`/`kink`/`wander` are all lateral perturbations
  // measured along `gravityNormal` (perpendicular to gravity), not raw
  // x-offsets, so the whole drip rotates consistently with gravity instead
  // of assuming a vertical wall.
  const rawGravity = drip.gravity ?? { x: 0, y: 1 };
  const gravityMagnitude = Math.max(0.0001, Math.hypot(rawGravity.x, rawGravity.y));
  const gravity = { x: rawGravity.x / gravityMagnitude, y: rawGravity.y / gravityMagnitude };
  // Rotated so the default `gravity = (0, 1)` reproduces the exact prior
  // behavior (lateral offset added straight onto x) byte-for-byte.
  const gravityNormal = { x: gravity.y, y: -gravity.x };
  const resolveCenter = (value: number) => {
    const localProgress = Math.min(1, Math.max(0, value));
    const localEased = localProgress * localProgress;
    const lateral = bend * localEased
      + wander(localProgress)
      + kinkOffset(drip.kink, drip.kinkAt, localProgress)
      + kinkOffset(drip.kink2, drip.kinkAt2, localProgress);
    return {
      x: drip.x + gravity.x * drip.length * localEased + gravityNormal.x * lateral,
      y: drip.y + gravity.y * drip.length * localEased + gravityNormal.y * lateral,
    };
  };
  const center = resolveCenter(safeProgress);
  const tangentStep = 0.001;
  const tangentStart = resolveCenter(Math.max(0, safeProgress - tangentStep));
  const tangentEnd = resolveCenter(Math.min(1, safeProgress + tangentStep));
  const tangentX = tangentEnd.x - tangentStart.x;
  const tangentY = tangentEnd.y - tangentStart.y;
  const tangentLength = Math.max(0.0001, Math.hypot(tangentX, tangentY));
  const naturalNormal = { x: -tangentY / tangentLength, y: tangentX / tangentLength };
  // V0.10.18: `gravity`'s own eased motion (`localEased = localProgress**2`)
  // has a ~zero derivative right at progress 0, so the finite-differenced
  // tangent there is dominated by whatever small `wander`/`kink` derivative
  // exists at that instant instead -- which can rotate the root's own
  // cross-section noticeably away from perpendicular-to-gravity. Physically
  // a drip must leave the source mark travelling straight along gravity
  // before any lateral wander has had room to act, so the cross-section's
  // normal is blended toward `gravityNormal` near progress 0 and released
  // back to the natural curve-following normal by ~10% progress -- well
  // inside the existing attachment span, so this only touches the root seam
  // and does not alter the column/taper/termination curve itself.
  const rootNormalBlend = 1 - smooth01(safeProgress / 0.1);
  let normal = naturalNormal;
  if (rootNormalBlend > 0) {
    const blendedX = gravityNormal.x * rootNormalBlend + naturalNormal.x * (1 - rootNormalBlend);
    const blendedY = gravityNormal.y * rootNormalBlend + naturalNormal.y * (1 - rootNormalBlend);
    const blendedLength = Math.max(0.0001, Math.hypot(blendedX, blendedY));
    normal = { x: blendedX / blendedLength, y: blendedY / blendedLength };
  }
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

  // V0.10.18: no root cap of any kind (no arc/circle/bulb) -- the root is
  // meant to sit UNDER the source mark and be masked by it (see
  // `attachmentUnderlap`), never rendered as its own visible rounded/flat
  // shoulder shape. A rounded root cap here was one contributor to the
  // "match head"/seam-glitch defects this and the prior pass removed; a
  // plain closed edge is invisible once tucked under the source paint and
  // reads correctly on the rare occasion the underlap isn't deep enough to
  // fully hide it (a straight edge, not an extra bulge, is the safer
  // failure mode).
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
