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

export function resolveDripStripSection(
  drip: DripSeed,
  progress: number,
): DripStripSection {
  const safeProgress = Math.min(1, Math.max(0, progress));
  const eased = safeProgress * safeProgress;
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
  const resolveCenter = (value: number) => {
    const localProgress = Math.min(1, Math.max(0, value));
    const localEased = localProgress * localProgress;
    return {
      x: drip.x + bend * localEased
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
  const tipWidthRatio = drip.tipWidthRatio ?? 0.58;
  const stemWidth = drip.width * (1 - (1 - tipWidthRatio) * safeProgress);
  const shoulderWidth = drip.renderAsOverlay && drip.originPoolRadius
    ? Math.max(stemWidth, drip.originPoolRadius * 2)
    : stemWidth;
  // The root's shape comes ENTIRELY from width interpolation along the
  // strip -- never a separate circle primitive layered on top (an earlier
  // pass added one; removed -- see WetDripEngine.ts). A short, smooth
  // (C1-continuous, no flat plateau and no hard corners) ease from the
  // pooled shoulder width down to the ordinary body/stem width over a
  // compact span reads as a short "neck" pulling out of the pool, without
  // the flat-topped wedge a longer or asymmetric-holding curve produces.
  const shoulderSpan = 0.14;
  const shoulderProgress = Math.min(1, safeProgress / shoulderSpan);
  const neckBlend = 1 - shoulderProgress * shoulderProgress * (3 - shoulderProgress * 2);
  const width = Math.max(0.8, stemWidth + (shoulderWidth - stemWidth) * neckBlend);
  return {
    progress: safeProgress,
    center,
    left: { x: center.x + normal.x * width * 0.5, y: center.y + normal.y * width * 0.5 },
    right: { x: center.x - normal.x * width * 0.5, y: center.y - normal.y * width * 0.5 },
    width,
  };
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
    return {
      x: this.anchor.x,
      y: this.anchor.y + observation.radius * 0.35,
      width: Math.max(1.2, observation.radius * (0.045 + tendency * 0.035)),
      length: observation.radius * (0.9 + tendency * 2.2),
      opacity,
      sourceOpacityCeiling: observation.sourceOpacityCeiling,
    };
  }

  public reset(): void {
    this.anchor = null;
    this.lastTimestamp = 0;
    this.dwellMilliseconds = 0;
  }
}
