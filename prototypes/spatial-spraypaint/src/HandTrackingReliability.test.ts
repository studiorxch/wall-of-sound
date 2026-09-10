import { describe, expect, it } from "vitest";
import {
  HAND_SAMPLE_BRIDGE_MS,
  HandTrackingReliabilityMonitor,
  shouldBridgeMissingHandSample,
  shouldResumeHandDrawingAfterPan,
} from "./HandTrackingReliability";

describe("hand tracking reliability monitor", () => {
  it("separates frame, result, landmark, and point-delivery cadence", () => {
    const monitor = new HandTrackingReliabilityMonitor();
    monitor.recordFrame(100);
    monitor.recordFrame(116);
    monitor.recordResult(118, true);
    monitor.recordLandmark(118, { x: 0.2, y: 0.3 }, true);
    monitor.recordResult(151, true);
    const snapshot = monitor.recordLandmark(151, { x: 0.5, y: 0.7 }, true);

    expect(snapshot.frameIntervalMs).toBe(16);
    expect(snapshot.resultIntervalMs).toBe(33);
    expect(snapshot.landmarkIntervalMs).toBe(33);
    expect(snapshot.pointIntervalMs).toBe(33);
    expect(snapshot.pointDistance).toBeCloseTo(0.5);
  });

  it("counts missing-hand frames separately from pinch-state transitions", () => {
    const monitor = new HandTrackingReliabilityMonitor();
    monitor.recordResult(100, true);
    monitor.recordLandmark(100, { x: 0.1, y: 0.1 }, true);
    monitor.recordResult(133, false);
    monitor.recordResult(166, false);
    monitor.recordResult(199, true);
    const snapshot = monitor.recordLandmark(199, { x: 0.2, y: 0.1 }, false);

    expect(snapshot.missingHandFrames).toBe(2);
    expect(snapshot.consecutiveMissingHandFrames).toBe(0);
    expect(snapshot.pinchTransitions).toBe(1);
    expect(snapshot.pinchActive).toBe(false);
  });

  it("bridges only a short missing sample during an active pinch outside navigation", () => {
    const base = { wasPinching: true, lastPinchingAt: 100, navigationActive: false };
    expect(shouldBridgeMissingHandSample({ ...base, now: 100 + HAND_SAMPLE_BRIDGE_MS })).toBe(true);
    expect(shouldBridgeMissingHandSample({ ...base, now: 101 + HAND_SAMPLE_BRIDGE_MS })).toBe(false);
    expect(shouldBridgeMissingHandSample({ ...base, now: 130, navigationActive: true })).toBe(false);
    expect(shouldBridgeMissingHandSample({ ...base, now: 130, wasPinching: false })).toBe(false);
  });

  it("resumes Hand drawing after Pan only from a fresh active pinch", () => {
    const ready = { isHandMode: true, isPinching: true, sampleAgeMs: 40, panGestureActive: false };
    expect(shouldResumeHandDrawingAfterPan(ready)).toBe(true);
    expect(shouldResumeHandDrawingAfterPan({ ...ready, panGestureActive: true })).toBe(false);
    expect(shouldResumeHandDrawingAfterPan({ ...ready, sampleAgeMs: 121 })).toBe(false);
    expect(shouldResumeHandDrawingAfterPan({ ...ready, isHandMode: false })).toBe(false);
  });
});
