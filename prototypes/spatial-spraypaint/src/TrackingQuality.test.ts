import { describe, expect, it } from "vitest";
import {
  TRACKING_WARNING_DELAY_MS,
  TRACKING_WARNING_RECOVERY_MS,
  TrackingQualityMonitor,
  deriveTrackingQuality,
  type TrackingQualitySample,
} from "./TrackingQuality";

const GOOD_SAMPLE: TrackingQualitySample = {
  confidence: 0.92,
  resultIntervalMs: 34,
  landmarkIntervalMs: 34,
  consecutiveMissingHandFrames: 0,
  pinchTransitions: 2,
};

describe("tracking quality", () => {
  it("classifies healthy tracking as GOOD", () => {
    expect(deriveTrackingQuality(GOOD_SAMPLE)).toEqual({ quality: "good", evidence: [] });
  });

  it("classifies sustained misses or weaker confidence as DEGRADED", () => {
    expect(deriveTrackingQuality({
      ...GOOD_SAMPLE,
      confidence: 0.58,
      consecutiveMissingHandFrames: 2,
    })).toMatchObject({ quality: "degraded", evidence: ["MISSED HANDS", "LOW CONFIDENCE"] });
  });

  it("classifies long gaps or repeated misses as POOR", () => {
    expect(deriveTrackingQuality({
      ...GOOD_SAMPLE,
      resultIntervalMs: 280,
      landmarkIntervalMs: 300,
      consecutiveMissingHandFrames: 6,
    }).quality).toBe("poor");
  });

  it("debounces the user-facing warning", () => {
    const monitor = new TrackingQualityMonitor();
    const degraded = { ...GOOD_SAMPLE, consecutiveMissingHandFrames: 3 };
    expect(monitor.update(degraded, 0).warningVisible).toBe(false);
    expect(monitor.update(degraded, TRACKING_WARNING_DELAY_MS - 1).warningVisible).toBe(false);
    expect(monitor.update(degraded, TRACKING_WARNING_DELAY_MS).warningVisible).toBe(true);
  });

  it("automatically hides the warning after stable recovery", () => {
    const monitor = new TrackingQualityMonitor();
    const degraded = { ...GOOD_SAMPLE, consecutiveMissingHandFrames: 3 };
    monitor.update(degraded, 0);
    expect(monitor.update(degraded, TRACKING_WARNING_DELAY_MS).warningVisible).toBe(true);
    expect(monitor.update(GOOD_SAMPLE, TRACKING_WARNING_DELAY_MS + 50).warningVisible).toBe(true);
    expect(monitor.update(
      GOOD_SAMPLE,
      TRACKING_WARNING_DELAY_MS + 50 + TRACKING_WARNING_RECOVERY_MS,
    ).warningVisible).toBe(false);
  });
});
