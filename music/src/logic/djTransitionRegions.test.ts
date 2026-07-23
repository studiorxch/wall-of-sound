import { describe, it, expect } from "vitest";
import type { TrackPlaybackBounds } from "../data/playbackBoundsTypes";
import type { DjTransitionTrackEvidence, TransitionSectionEvidence } from "./djTransitionEvidence";
import { selectDjTransitionRegions } from "./djTransitionRegions";

function missing(): { value: null; confidence: 0; source: "missing"; claim: "proposed"; analyzedAt: null } {
  return { value: null, confidence: 0, source: "missing", claim: "proposed", analyzedAt: null };
}

function makeSection(overrides: Partial<TransitionSectionEvidence> = {}): TransitionSectionEvidence {
  return {
    id: "sec-1", structuralType: "breakdown", startSeconds: 200, endSeconds: 216,
    confidence: 0.9, verification: "verified",
    ...overrides,
  };
}

function makeEvidence(overrides: Partial<DjTransitionTrackEvidence> = {}): DjTransitionTrackEvidence {
  return {
    trackId: "track-a",
    sourceFingerprint: "fp-a",
    durationSeconds: { value: 240, confidence: 1, source: "decoded_analysis", claim: "observed", analyzedAt: null },
    bpm: missing(),
    tempoStability: missing(),
    beatTimesSeconds: missing(),
    beatTrusted: false,
    downbeatConfidenceRaw: 0,
    barGridConfidenceRaw: 0,
    barStartTimesSeconds: missing(),
    firstDownbeatSeconds: missing(),
    barTrusted: false,
    phraseBoundarySeconds: missing(),
    phraseTrusted: false,
    verifiedSections: [],
    key: missing(),
    energyProfile: missing(),
    bassWeightProfile: missing(),
    densityProfile: missing(),
    brightnessProfile: missing(),
    currentStemRoles: missing(),
    ...overrides,
  } as DjTransitionTrackEvidence;
}

function makeBounds(overrides: Partial<TrackPlaybackBounds> = {}): TrackPlaybackBounds {
  return {
    version: "1.0", sourceDurationSeconds: 240,
    audibleStartSeconds: 0.2, preferredStartSeconds: 0.2,
    preferredEndSeconds: 238, audibleEndSeconds: 239,
    leadingSilenceSeconds: 0.2, trailingSilenceSeconds: 1,
    effectiveDurationSeconds: 238.8,
    startClassification: "musical_intro", endClassification: "musical_outro",
    startConfidence: 0.9, endConfidence: 0.9, overallConfidence: 0.9,
    source: "detected", detectorVersion: "playback-bounds-v1", analyzedAt: "2026-01-01T00:00:00Z",
    warnings: [],
    ...overrides,
  };
}

describe("selectDjTransitionRegions", () => {
  it("returns no candidates when duration is unknown — never guesses region bounds", () => {
    const regions = selectDjTransitionRegions({ side: "outgoing", evidence: makeEvidence({ durationSeconds: missing() }), playbackBounds: makeBounds() });
    expect(regions).toEqual([]);
  });

  it("always produces a fallback candidate from playback bounds alone", () => {
    const outgoing = selectDjTransitionRegions({ side: "outgoing", evidence: makeEvidence(), playbackBounds: makeBounds() });
    expect(outgoing.some((r) => r.role === "hard_ending_handoff")).toBe(true);

    const incoming = selectDjTransitionRegions({ side: "incoming", evidence: makeEvidence(), playbackBounds: makeBounds() });
    expect(incoming.some((r) => r.role === "clean_intro")).toBe(true);
  });

  it("keeps every region inside decoded/audible bounds even when a section spills past them", () => {
    const evidence = makeEvidence({
      verifiedSections: [makeSection({ structuralType: "outro", startSeconds: 250, endSeconds: 260 })], // past audibleEnd=239
    });
    const regions = selectDjTransitionRegions({ side: "outgoing", evidence, playbackBounds: makeBounds() });
    for (const r of regions) {
      expect(r.startSeconds).toBeGreaterThanOrEqual(0.2);
      expect(r.endSeconds).toBeLessThanOrEqual(239);
    }
  });

  it("maps verified structural sections to the correct outgoing/incoming roles", () => {
    const outgoingEvidence = makeEvidence({
      verifiedSections: [
        makeSection({ id: "s1", structuralType: "breakdown", startSeconds: 180, endSeconds: 196 }),
        makeSection({ id: "s2", structuralType: "outro", startSeconds: 220, endSeconds: 236 }),
      ],
    });
    const outgoing = selectDjTransitionRegions({ side: "outgoing", evidence: outgoingEvidence, playbackBounds: makeBounds() });
    expect(outgoing.some((r) => r.role === "breakdown_exit")).toBe(true);
    expect(outgoing.some((r) => r.role === "ambient_tail")).toBe(true);

    const incomingEvidence = makeEvidence({
      verifiedSections: [
        makeSection({ id: "s3", structuralType: "intro", startSeconds: 0, endSeconds: 16 }),
        makeSection({ id: "s4", structuralType: "verse", startSeconds: 16, endSeconds: 32 }),
      ],
    });
    const incoming = selectDjTransitionRegions({ side: "incoming", evidence: incomingEvidence, playbackBounds: makeBounds() });
    expect(incoming.some((r) => r.role === "clean_intro")).toBe(true);
    expect(incoming.some((r) => r.role === "melodic_entrance")).toBe(true);
  });

  it("never emits vocal_pickup without a CURRENT vocals stem actually available", () => {
    const withoutStem = selectDjTransitionRegions({ side: "incoming", evidence: makeEvidence(), playbackBounds: makeBounds() });
    expect(withoutStem.some((r) => r.role === "vocal_pickup")).toBe(false);

    const withStem = selectDjTransitionRegions({
      side: "incoming",
      evidence: makeEvidence({ currentStemRoles: { value: ["vocals"], confidence: 1, source: "decoded_analysis", claim: "observed", analyzedAt: null } }),
      playbackBounds: makeBounds(),
    });
    expect(withStem.some((r) => r.role === "vocal_pickup")).toBe(true);
  });

  it("only assigns rhythmicTrust:trusted_rhythmic when a phrase actually falls inside the region", () => {
    const evidence = makeEvidence({
      phraseTrusted: true,
      phraseBoundarySeconds: { value: [64, 128, 192], confidence: 0.8, source: "derived", claim: "inferred", analyzedAt: null },
    });
    const outgoing = selectDjTransitionRegions({ side: "outgoing", evidence, playbackBounds: makeBounds() });
    const finalPhrase = outgoing.find((r) => r.role === "final_phrase");
    expect(finalPhrase).toBeDefined();
    expect(finalPhrase!.rhythmicTrust).toBe("trusted_rhythmic");
  });

  it("only reports loopSuitability when bars divide evenly into a phrase length", () => {
    const evidence = makeEvidence({
      barTrusted: true,
      barStartTimesSeconds: { value: Array.from({ length: 32 }, (_, i) => i * 2), confidence: 0.9, source: "decoded_analysis", claim: "observed", analyzedAt: null },
      verifiedSections: [makeSection({ structuralType: "body", startSeconds: 0, endSeconds: 64 })],
    });
    const outgoing = selectDjTransitionRegions({ side: "outgoing", evidence, playbackBounds: makeBounds({ audibleStartSeconds: 0, preferredStartSeconds: 0 }) });
    const bodyExit = outgoing.find((r) => r.role === "loopable_body_exit");
    expect(bodyExit).toBeDefined();
    expect(bodyExit!.loopSuitability).not.toBeNull();
  });
});
