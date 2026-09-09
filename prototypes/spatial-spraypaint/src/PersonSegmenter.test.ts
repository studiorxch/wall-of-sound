import { describe, expect, it } from "vitest";
import {
  SEGMENTATION_DRAWING_INTERVAL_MS,
  SEGMENTATION_INTERVAL_MS,
  shouldRequestSegmentation,
} from "./PersonSegmenter";

describe("person segmentation scheduling", () => {
  it("runs only when ready, video-backed, idle, and cadence-bounded", () => {
    const base = {
      now: 1000,
      lastRequestAt: 1000 - SEGMENTATION_INTERVAL_MS,
      inFlight: false,
      ready: true,
      videoReady: true,
    };
    expect(shouldRequestSegmentation(base)).toBe(true);
    expect(shouldRequestSegmentation({ ...base, inFlight: true })).toBe(false);
    expect(shouldRequestSegmentation({ ...base, ready: false })).toBe(false);
    expect(shouldRequestSegmentation({ ...base, videoReady: false })).toBe(false);
    expect(shouldRequestSegmentation({ ...base, lastRequestAt: 999 })).toBe(false);
    expect(shouldRequestSegmentation({
      now: SEGMENTATION_DRAWING_INTERVAL_MS - 1,
      lastRequestAt: 0,
      inFlight: false,
      ready: true,
      videoReady: true,
      minimumIntervalMs: SEGMENTATION_DRAWING_INTERVAL_MS,
    })).toBe(false);
    expect(shouldRequestSegmentation({
      now: SEGMENTATION_DRAWING_INTERVAL_MS,
      lastRequestAt: 0,
      inFlight: false,
      ready: true,
      videoReady: true,
      minimumIntervalMs: SEGMENTATION_DRAWING_INTERVAL_MS,
    })).toBe(true);
  });
});
