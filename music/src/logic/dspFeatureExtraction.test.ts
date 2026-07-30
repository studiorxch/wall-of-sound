import { describe, it, expect } from "vitest";
import { reviewBpmField, needsBpmKeyReview } from "./dspFeatureExtraction";
import type { Track } from "../data/trackTypes";

function track(overrides: Partial<Track> & { trackId: string }): Track {
  return {
    title: "T", artist: "A", durationSeconds: 100, energy: 0.5, energySource: "manual",
    sourceOwner: "studiorich",
    ...overrides,
  } as Track;
}

describe("reviewBpmField — tempo-family review (0728F)", () => {
  it("flags a resolved-but-suspiciously-low canonical BPM even though the field is otherwise 'resolved'", () => {
    const t = track({ trackId: "t1", bpm: 42.02, bpmSource: "detected" });
    const review = reviewBpmField(t);
    expect(review.state).toBe("resolved");
    expect(review.tempoFamily.concern).toBe("suspicious_low");
    expect(review.tempoFamily.candidateBpm).toBe(84.04);
  });

  it("flags a resolved-but-suspiciously-high canonical BPM and ranks genre plausibility", () => {
    const t = track({ trackId: "t1", bpm: 172, bpmSource: "detected", genre: "ambient" });
    const review = reviewBpmField(t);
    expect(review.tempoFamily.concern).toBe("suspicious_high");
    expect(review.tempoFamily.candidateBpm).toBe(86);
    expect(review.tempoFamily.genrePlausibility).toBe("slow_suspicious");
  });

  it("does NOT flag a resolved suspicious BPM whose source is already manual — a human-vetted value is never re-flagged", () => {
    const t = track({ trackId: "t1", bpm: 42.02, bpmSource: "manual" });
    const review = reviewBpmField(t);
    expect(review.state).toBe("resolved");
    expect(review.tempoFamily.concern).toBe("none");
  });

  it("does NOT flag a resolved suspicious BPM whose source is embedded_metadata or csv_metadata (same trust tier)", () => {
    expect(reviewBpmField(track({ trackId: "t1", bpm: 172, bpmSource: "embedded_metadata" })).tempoFamily.concern).toBe("none");
    expect(reviewBpmField(track({ trackId: "t1", bpm: 172, bpmSource: "csv_metadata" })).tempoFamily.concern).toBe("none");
  });

  it("does not flag a resolved, in-range canonical BPM", () => {
    const t = track({ trackId: "t1", bpm: 128, bpmSource: "detected" });
    expect(reviewBpmField(t).tempoFamily.concern).toBe("none");
  });

  it("flags a retained low-confidence candidate that is itself suspicious (unresolved case)", () => {
    const t = track({
      trackId: "t1",
      audioAnalysis: { bpmCandidate: 40.06, bpmWarningCodes: ["BPM_DETECTION_LOW_CONFIDENCE"] } as Track["audioAnalysis"],
    });
    const review = reviewBpmField(t);
    expect(review.state).toBe("low_confidence_estimate");
    expect(review.tempoFamily.concern).toBe("suspicious_low");
    expect(review.tempoFamily.candidateBpm).toBe(80.12);
  });
});

describe("needsBpmKeyReview — suspicious-but-resolved inclusion (0728F)", () => {
  it("is true for a resolved track whose BPM is suspiciously low, even with a resolved key", () => {
    const t = track({ trackId: "t1", bpm: 42.02, bpmSource: "detected", camelotKey: "8B", keySource: "detected" });
    expect(needsBpmKeyReview(t)).toBe(true);
  });

  it("is false for a resolved, in-range, trusted track with a resolved key — unchanged prior behavior", () => {
    const t = track({ trackId: "t1", bpm: 128, bpmSource: "manual", camelotKey: "8B", keySource: "manual" });
    expect(needsBpmKeyReview(t)).toBe(false);
  });

  it("is false for a manually-confirmed suspicious BPM — clicking Keep/Use must permanently resolve review status", () => {
    const t = track({ trackId: "t1", bpm: 42.02, bpmSource: "manual", camelotKey: "8B", keySource: "manual" });
    expect(needsBpmKeyReview(t)).toBe(false);
  });
});
