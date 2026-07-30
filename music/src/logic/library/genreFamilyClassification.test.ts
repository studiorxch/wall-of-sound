import { describe, it, expect } from "vitest";
import {
  reviewGenreFamilyField, needsGenreFamilyReview, suggestFastBreaksTempoOption,
  NEVER_INFERRED_STYLES,
} from "./genreFamilyClassification";
import type { Track, TrackGenreClassification, TrackAudioAnalysis } from "../../data/trackTypes";

function track(overrides: Partial<Track> & { trackId: string }): Track {
  return {
    title: "T", artist: "A", durationSeconds: 100, energy: 0.5, energySource: "manual",
    sourceOwner: "studiorich",
    ...overrides,
  } as Track;
}

function audioAnalysis(overrides: Partial<TrackAudioAnalysis>): TrackAudioAnalysis {
  return { onsetDensity: 0.1, zeroCrossingRate: 0.1, ...overrides } as TrackAudioAnalysis;
}

function classification(overrides: Partial<TrackGenreClassification>): TrackGenreClassification {
  return {
    primaryGenreFamily: null, detailedGenres: [], blendTraits: [],
    source: null, confidence: null, reason: null, reviewedAt: null,
    reviewStatus: "unreviewed",
    ...overrides,
  };
}

describe("reviewGenreFamilyField — classification logic (spec §12)", () => {
  it("explicit jungle genre → fast_breaks suggested when not yet confirmed", () => {
    const t = track({ trackId: "t1", genre: "Jungle" });
    const review = reviewGenreFamilyField(t);
    expect(review.reviewStatus).toBe("suggested");
    expect(review.suggestedFamily).toBe("fast_breaks");
  });

  it("explicit jungle genre → stays confirmed (not re-suggested) once the track's own classification says so", () => {
    const t = track({ trackId: "t1", genre: "Jungle", genreClassification: classification({ primaryGenreFamily: "fast_breaks", source: "manual", reviewStatus: "confirmed" }) });
    const review = reviewGenreFamilyField(t);
    expect(review.reviewStatus).toBe("confirmed");
    expect(review.currentFamily).toBe("fast_breaks");
  });

  it("explicit drum and bass alias (dnb/d&b/drum and bass) → normalized and detected as fast_breaks evidence", () => {
    expect(reviewGenreFamilyField(track({ trackId: "t1", genre: "dnb" })).reviewStatus).toBe("suggested");
    expect(reviewGenreFamilyField(track({ trackId: "t2", genre: "D&B" })).reviewStatus).toBe("suggested");
    expect(reviewGenreFamilyField(track({ trackId: "t3", genre: "Drum and Bass" })).reviewStatus).toBe("suggested");
    expect(reviewGenreFamilyField(track({ trackId: "t4", genre: "Drum & Bass" })).reviewStatus).toBe("suggested");
  });

  it("ambient mood alone → not fast_breaks", () => {
    const t = track({ trackId: "t1", moodTags: ["Ambient"], bpm: 90, bpmSource: "detected" });
    const review = reviewGenreFamilyField(t);
    expect(review.reviewStatus).toBe("unreviewed");
    expect(review.suggestedFamily).toBeNull();
  });

  it("172 BPM alone → not automatically fast_breaks", () => {
    const t = track({ trackId: "t1", bpm: 172, bpmSource: "detected" });
    const review = reviewGenreFamilyField(t);
    expect(review.reviewStatus).toBe("unreviewed");
    expect(review.suggestedFamily).toBeNull();
  });

  it("90 BPM + explicit jungle genre → fast_breaks suggestion", () => {
    const t = track({ trackId: "t1", bpm: 90, bpmSource: "detected", genre: "Jungle" });
    const review = reviewGenreFamilyField(t);
    expect(review.reviewStatus).toBe("suggested");
    expect(review.suggestedFamily).toBe("fast_breaks");
  });

  it("90 BPM + lo-fi genre only → not fast_breaks", () => {
    const t = track({ trackId: "t1", bpm: 90, bpmSource: "detected", genre: "Lo-Fi" });
    const review = reviewGenreFamilyField(t);
    expect(review.reviewStatus).toBe("unreviewed");
    expect(review.suggestedFamily).toBeNull();
  });

  it("manual non-fast-break family overrides derived suggestion — a confirmed ambient family stays confirmed even with jungle-sounding genre text", () => {
    const t = track({
      trackId: "t1", genre: "Jungle",
      genreClassification: classification({ primaryGenreFamily: "ambient", source: "manual", reviewStatus: "confirmed" }),
    });
    const review = reviewGenreFamilyField(t);
    expect(review.reviewStatus).toBe("confirmed");
    expect(review.currentFamily).toBe("ambient");
    expect(review.suggestedFamily).toBeNull();
  });

  it("rejected suggestion does not immediately reappear when evidence is unchanged", () => {
    const t = track({
      trackId: "t1", genre: "Jungle",
      genreClassification: classification({ reviewStatus: "rejected", reason: reviewGenreFamilyField(track({ trackId: "x", genre: "Jungle" })).reason }),
    });
    expect(needsGenreFamilyReview(t)).toBe(false);
  });

  it("a rejected suggestion DOES reappear once the underlying evidence changes", () => {
    const t = track({
      trackId: "t1", genre: "Jungle", grouping: "Late Night Jungle Series",
      genreClassification: classification({ reviewStatus: "rejected", reason: "stale reason from before grouping was added" }),
    });
    expect(needsGenreFamilyReview(t)).toBe(true);
  });

  it("detailed genre survives family assignment (returned in currentDetailedGenres once confirmed)", () => {
    const t = track({
      trackId: "t1",
      genreClassification: classification({ primaryGenreFamily: "fast_breaks", detailedGenres: ["Atmospheric Jungle"], source: "manual", reviewStatus: "confirmed" }),
    });
    const review = reviewGenreFamilyField(t);
    expect(review.currentDetailedGenres).toEqual(["Atmospheric Jungle"]);
  });

  it("unsupported styles (hardcore techno/gabber/happy hardcore/speedcore/thrash metal) are never inferred as fast_breaks", () => {
    for (const style of NEVER_INFERRED_STYLES) {
      const review = reviewGenreFamilyField(track({ trackId: "t1", genre: style, bpm: 180, bpmSource: "detected" }));
      expect(review.suggestedFamily).not.toBe("fast_breaks");
    }
  });

  it("atmospheric/ambient/liquid jungle compounds (not in the shared genre normalizer's alias table) are still detected via substring match", () => {
    expect(reviewGenreFamilyField(track({ trackId: "t1", genre: "Atmospheric Jungle" })).reviewStatus).toBe("suggested");
    expect(reviewGenreFamilyField(track({ trackId: "t2", genre: "Ambient Jungle" })).reviewStatus).toBe("suggested");
    expect(reviewGenreFamilyField(track({ trackId: "t3", genre: "Liquid DnB" })).reviewStatus).toBe("suggested");
  });
});

describe("suggestFastBreaksTempoOption — §9 BPM interaction arithmetic", () => {
  it("matches the spec's own worked examples exactly", () => {
    expect(suggestFastBreaksTempoOption(90)).toEqual({ applicable: true, currentBpm: 90, alternateBpm: 180, direction: "double" });
    expect(suggestFastBreaksTempoOption(172)).toEqual({ applicable: true, currentBpm: 172, alternateBpm: 86, direction: "half" });
  });
  it("is inapplicable in the normal 100–150 zone", () => {
    expect(suggestFastBreaksTempoOption(128).applicable).toBe(false);
  });
  it("is inapplicable for null/invalid bpm", () => {
    expect(suggestFastBreaksTempoOption(null).applicable).toBe(false);
    expect(suggestFastBreaksTempoOption(undefined).applicable).toBe(false);
  });
});

describe("reviewGenreFamilyField — 0728H §2 declared + audio evidence combine rules", () => {
  it("declared + audio agree (audio high) → strongest suggestion, no conflict, reason includes both", () => {
    const t = track({
      trackId: "t1", genre: "Jungle",
      audioAnalysis: audioAnalysis({ onsetDensity: 0.9, zeroCrossingRate: 0.8 }),
    });
    const review = reviewGenreFamilyField(t);
    expect(review.reviewStatus).toBe("suggested");
    expect(review.conflict).toBe(false);
    expect(review.audioEvidence.likelihood).toBe("high");
    expect(review.confidence).toBe(Math.max(review.declaredEvidence!.confidence, review.audioEvidence.confidence));
  });

  it("audio high alone, declared absent → review candidate, no conflict", () => {
    const t = track({
      trackId: "t1",
      audioAnalysis: audioAnalysis({ onsetDensity: 0.9, zeroCrossingRate: 0.8 }),
    });
    const review = reviewGenreFamilyField(t);
    expect(review.reviewStatus).toBe("suggested");
    expect(review.declaredEvidence).toBeNull();
    expect(review.conflict).toBe(false);
  });

  it("audio medium alone, declared absent → not sufficient", () => {
    const t = track({
      trackId: "t1",
      audioAnalysis: audioAnalysis({ onsetDensity: 0.8, zeroCrossingRate: 0.2 }),
    });
    const review = reviewGenreFamilyField(t);
    expect(review.reviewStatus).toBe("unreviewed");
    expect(review.suggestedFamily).toBeNull();
  });

  it("declared present, audio measured low → review candidate WITH conflict warning, reduced confidence", () => {
    const t = track({
      trackId: "t1", genre: "Jungle",
      audioAnalysis: audioAnalysis({ onsetDensity: 0.1017, zeroCrossingRate: 0.1474 }),
    });
    const review = reviewGenreFamilyField(t);
    expect(review.reviewStatus).toBe("suggested");
    expect(review.conflict).toBe(true);
    expect(review.reason).toContain("Conflict");
    expect(review.confidence).toBeLessThan(review.declaredEvidence!.confidence);
  });

  it("declared present, audio insufficient (no DSP analysis yet) → declared-only suggestion, NOT a conflict", () => {
    const t = track({ trackId: "t1", genre: "Jungle" });
    const review = reviewGenreFamilyField(t);
    expect(review.reviewStatus).toBe("suggested");
    expect(review.audioEvidence.likelihood).toBe("insufficient");
    expect(review.conflict).toBe(false);
    expect(review.confidence).toBe(review.declaredEvidence!.confidence);
    expect(review.reason).not.toContain("Conflict");
  });
});

describe("reviewGenreFamilyField — BPM interaction does not itself change BPM", () => {
  it("confirming/suggesting fast_breaks never touches track.bpm — reviewGenreFamilyField is read-only", () => {
    const t = track({ trackId: "t1", bpm: 90, bpmSource: "detected", genre: "Jungle" });
    reviewGenreFamilyField(t);
    expect(t.bpm).toBe(90);
  });
});
