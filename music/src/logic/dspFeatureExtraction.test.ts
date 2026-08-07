import { describe, it, expect } from "vitest";
import {
  reviewBpmField, needsBpmKeyReview, resolveAuthoritativeBpm, getBpmReviewStatus,
  buildAcceptedBpmPatch, normalizeBpmPrecision, reviewKeyField,
} from "./dspFeatureExtraction";
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

// 0804_MUSIC_BPM_Authority_Repair — §9 required tests. Numbered comments
// map each test back to the spec's own numbered list.
describe("resolveAuthoritativeBpm (0804F)", () => {
  it("[test 3] returns the accepted/manual BPM, never a stale DSP candidate sitting alongside it", () => {
    const t = track({
      trackId: "t1", bpm: 126.05, bpmSource: "manual",
      audioAnalysis: { bpmCandidate: 63.02 } as Track["audioAnalysis"],
    });
    expect(resolveAuthoritativeBpm(t)).toBe(126.05);
  });

  it("[test 12] preserves existing CSV/manual precedence — both trusted sources resolve directly", () => {
    expect(resolveAuthoritativeBpm(track({ trackId: "t1", bpm: 128, bpmSource: "manual" }))).toBe(128);
    expect(resolveAuthoritativeBpm(track({ trackId: "t1", bpm: 128, bpmSource: "csv_metadata" }))).toBe(128);
    expect(resolveAuthoritativeBpm(track({ trackId: "t1", bpm: 128, bpmSource: "embedded_metadata" }))).toBe(128);
  });

  it("returns the canonical value once a detector-promoted BPM has been accepted onto track.bpm", () => {
    expect(resolveAuthoritativeBpm(track({ trackId: "t1", bpm: 128, bpmSource: "detected" }))).toBe(128);
  });

  it("[test 10] returns null once an accepted BPM is removed and only an un-promoted candidate remains", () => {
    const t = track({
      trackId: "t1", bpm: undefined, bpmSource: undefined,
      audioAnalysis: { bpmCandidate: 117.45 } as Track["audioAnalysis"],
    });
    expect(resolveAuthoritativeBpm(t)).toBeNull();
  });

  it("never treats an un-promoted review-only candidate as authoritative", () => {
    const t = track({ trackId: "t1", audioAnalysis: { bpmCandidate: 117.45 } as Track["audioAnalysis"] });
    expect(resolveAuthoritativeBpm(t)).toBeNull();
  });
});

describe("getBpmReviewStatus (0804F)", () => {
  it("[test 5] is 'resolved' after a candidate is accepted", () => {
    const t = track({ trackId: "t1", bpm: 126.05, bpmSource: "manual" });
    expect(getBpmReviewStatus(t)).toBe("resolved");
  });

  it("[test 11] distinguishes 'no_confident_result' (analyzed, nothing retained) from a never-analyzed track", () => {
    const analyzedNoResult = track({
      trackId: "t1",
      audioAnalysis: { bpmWarningCodes: ["BPM_DETECTION_LOW_CONFIDENCE"] } as Track["audioAnalysis"],
    });
    const neverAnalyzed = track({ trackId: "t2" });
    expect(getBpmReviewStatus(analyzedNoResult)).toBe("needs_review");
    expect(getBpmReviewStatus(neverAnalyzed)).toBe("not_analyzed");
  });

  it("[test 10] falls back to 'needs_review' once an accepted BPM is removed but a candidate still exists", () => {
    const t = track({
      trackId: "t1", bpm: undefined, bpmSource: undefined,
      audioAnalysis: { bpmCandidate: 117.45 } as Track["audioAnalysis"],
    });
    expect(getBpmReviewStatus(t)).toBe("needs_review");
  });

  it("is 'needs_review' (not 'resolved') for a resolved-but-tempo-family-flagged value", () => {
    const t = track({ trackId: "t1", bpm: 172, bpmSource: "detected" });
    expect(getBpmReviewStatus(t)).toBe("needs_review");
  });

  it("folds pending/failed analysis into 'needs_review', never 'not_analyzed' or 'resolved'", () => {
    expect(getBpmReviewStatus(track({ trackId: "t1", analysisStatus: "analyzing" }))).toBe("needs_review");
    expect(getBpmReviewStatus(track({ trackId: "t1", analysisStatus: "failed" }))).toBe("needs_review");
  });
});

describe("normalizeBpmPrecision (0804F)", () => {
  it("rounds to the 2-decimal policy already used elsewhere in this codebase", () => {
    expect(normalizeBpmPrecision(126.0499)).toBe(126.05);
    expect(normalizeBpmPrecision(63.024)).toBe(63.02);
    expect(normalizeBpmPrecision(128)).toBe(128);
  });
});

describe("buildAcceptedBpmPatch (0804F)", () => {
  it("[test 1, 2] persists the chosen BPM stamped with manual/user authority", () => {
    expect(buildAcceptedBpmPatch(126.05)).toEqual({ bpm: 126.05, bpmSource: "manual" });
  });

  it("normalizes precision through the same policy as normalizeBpmPrecision", () => {
    expect(buildAcceptedBpmPatch(63.024)).toEqual({ bpm: 63.02, bpmSource: "manual" });
  });

  it("[test 7] rejects non-finite, zero, negative, and out-of-range candidates", () => {
    expect(buildAcceptedBpmPatch(NaN)).toBeNull();
    expect(buildAcceptedBpmPatch(Infinity)).toBeNull();
    expect(buildAcceptedBpmPatch(0)).toBeNull();
    expect(buildAcceptedBpmPatch(-63.02)).toBeNull();
    expect(buildAcceptedBpmPatch(35)).toBeNull(); // below isValidBpm's 40 floor
    expect(buildAcceptedBpmPatch(241)).toBeNull(); // above isValidBpm's 240 ceiling
  });

  it("[test 6] the accepted patch never touches key fields — key review state is unaffected by a BPM accept", () => {
    const patch = buildAcceptedBpmPatch(126.05)!;
    expect(patch).not.toHaveProperty("camelotKey");
    expect(patch).not.toHaveProperty("keySource");
    const before = track({ trackId: "t1", bpm: undefined, camelotKey: "8B", keySource: "detected" });
    const after = { ...before, ...patch };
    expect(reviewKeyField(after)).toEqual(reviewKeyField(before));
  });
});
