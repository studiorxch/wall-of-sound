export interface NormalizedTrackingPoint {
  x: number;
  y: number;
}

export interface HandTrackingReliabilitySnapshot {
  frameIntervalMs: number | null;
  resultIntervalMs: number | null;
  landmarkIntervalMs: number | null;
  pointIntervalMs: number | null;
  pointDistance: number | null;
  missingHandFrames: number;
  consecutiveMissingHandFrames: number;
  pinchTransitions: number;
  pinchActive: boolean | null;
}

export const HAND_SAMPLE_BRIDGE_MS = 90;

export function shouldBridgeMissingHandSample(options: {
  wasPinching: boolean;
  lastPinchingAt: number;
  now: number;
  navigationActive: boolean;
  maxGapMs?: number;
}): boolean {
  const maxGapMs = options.maxGapMs ?? HAND_SAMPLE_BRIDGE_MS;
  return options.wasPinching
    && !options.navigationActive
    && options.now - options.lastPinchingAt <= maxGapMs;
}

export class HandTrackingReliabilityMonitor {
  private lastFrameAt: number | null = null;
  private lastResultAt: number | null = null;
  private lastLandmarkAt: number | null = null;
  private lastPoint: NormalizedTrackingPoint | null = null;
  private snapshotValue: HandTrackingReliabilitySnapshot = {
    frameIntervalMs: null,
    resultIntervalMs: null,
    landmarkIntervalMs: null,
    pointIntervalMs: null,
    pointDistance: null,
    missingHandFrames: 0,
    consecutiveMissingHandFrames: 0,
    pinchTransitions: 0,
    pinchActive: null,
  };

  public recordFrame(timestamp: number): HandTrackingReliabilitySnapshot {
    this.snapshotValue.frameIntervalMs = this.interval(this.lastFrameAt, timestamp);
    this.lastFrameAt = timestamp;
    return this.snapshot();
  }

  public recordResult(timestamp: number, hasLandmarks: boolean): HandTrackingReliabilitySnapshot {
    this.snapshotValue.resultIntervalMs = this.interval(this.lastResultAt, timestamp);
    this.lastResultAt = timestamp;
    if (hasLandmarks) {
      this.snapshotValue.consecutiveMissingHandFrames = 0;
    } else {
      this.snapshotValue.missingHandFrames += 1;
      this.snapshotValue.consecutiveMissingHandFrames += 1;
    }
    return this.snapshot();
  }

  public recordLandmark(
    timestamp: number,
    point: NormalizedTrackingPoint,
    pinchActive: boolean,
  ): HandTrackingReliabilitySnapshot {
    const interval = this.interval(this.lastLandmarkAt, timestamp);
    this.snapshotValue.landmarkIntervalMs = interval;
    this.snapshotValue.pointIntervalMs = interval;
    this.snapshotValue.pointDistance = this.lastPoint
      ? Math.hypot(point.x - this.lastPoint.x, point.y - this.lastPoint.y)
      : null;
    if (this.snapshotValue.pinchActive !== null && this.snapshotValue.pinchActive !== pinchActive) {
      this.snapshotValue.pinchTransitions += 1;
    }
    this.snapshotValue.pinchActive = pinchActive;
    this.snapshotValue.consecutiveMissingHandFrames = 0;
    this.lastLandmarkAt = timestamp;
    this.lastPoint = { ...point };
    return this.snapshot();
  }

  public reset(): void {
    this.lastFrameAt = null;
    this.lastResultAt = null;
    this.lastLandmarkAt = null;
    this.lastPoint = null;
    this.snapshotValue = {
      frameIntervalMs: null,
      resultIntervalMs: null,
      landmarkIntervalMs: null,
      pointIntervalMs: null,
      pointDistance: null,
      missingHandFrames: 0,
      consecutiveMissingHandFrames: 0,
      pinchTransitions: 0,
      pinchActive: null,
    };
  }

  public snapshot(): HandTrackingReliabilitySnapshot {
    return { ...this.snapshotValue };
  }

  private interval(previous: number | null, timestamp: number): number | null {
    return previous === null ? null : Math.max(0, timestamp - previous);
  }
}
