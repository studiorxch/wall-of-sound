import { describe, it, expect } from "vitest";
import type { Track } from "../data/trackTypes";
import type { StemRole } from "../data/trackStemTypes";
import type { TrackSlot } from "../data/playlistTypes";
import type { DjTransitionPlan, TransitionEvidenceValue } from "../data/djTransitionTypes";
import type { DjTransitionTrackEvidence, DjTransitionPairEvidence } from "./djTransitionEvidence";
import type { TransitionRegionCandidate } from "./djTransitionRegions";
import { resolveDjTransition } from "./djTransitionResolver";

let idCounter = 0;
function nextId() {
  return `dj-${idCounter++}`;
}

function ev<T>(value: T | null, confidence = 0.9, claim: TransitionEvidenceValue<T>["claim"] = "observed"): TransitionEvidenceValue<T> {
  return { value, confidence, source: value == null ? "missing" : "decoded_analysis", claim, analyzedAt: null };
}

function makeTrackEvidence(overrides: Partial<DjTransitionTrackEvidence> = {}): DjTransitionTrackEvidence {
  return {
    trackId: "track-x",
    sourceFingerprint: "fp-x",
    durationSeconds: ev<number>(240),
    bpm: ev<number>(null),
    tempoStability: ev<number>(null),
    beatTimesSeconds: ev<number[]>(null),
    beatTrusted: false,
    downbeatConfidenceRaw: 0,
    barGridConfidenceRaw: 0,
    barStartTimesSeconds: ev<number[]>(null),
    firstDownbeatSeconds: ev<number>(null),
    barTrusted: false,
    phraseBoundarySeconds: ev<number[]>(null),
    phraseTrusted: false,
    verifiedSections: [],
    key: ev<string>(null),
    energyProfile: ev<number[]>(null),
    bassWeightProfile: ev<number[]>(null),
    densityProfile: ev<number[]>(null),
    brightnessProfile: ev<number[]>(null),
    currentStemRoles: ev<StemRole[]>(null),
    ...overrides,
  };
}

function makeRegion(overrides: Partial<TransitionRegionCandidate> = {}): TransitionRegionCandidate {
  return {
    regionId: "region-x",
    role: "hard_ending_handoff",
    startSeconds: 200,
    endSeconds: 240,
    availableBeatsSeconds: [],
    availableBarsSeconds: [],
    availablePhrasesSeconds: [],
    rhythmicTrust: "free_time_or_incompatible",
    bassActivitySummary: 0.2,
    foregroundActivitySummary: 0.2,
    localLoudness: 0.5,
    localEnergy: 0.5,
    loopSuitability: null,
    sourceExplanation: "test fixture",
    ...overrides,
  };
}

function makeTrack(id: string): Track {
  return { trackId: id, title: id, artist: "Artist", durationSeconds: 240, energy: 0.5, sourceOwner: "studiorich", genres: [], moodTags: [], moodSuggestions: [], sourcePoolIds: [], grouping: "", albumArtist: "", archiveStatus: "library" } as unknown as Track;
}

function makeSlot(id: string, index: number, trackId: string): TrackSlot {
  return { slotId: id, slotIndex: index, startTimeSeconds: index * 240, targetEnergy: 0.5, targetBpm: 120, assignedTrackId: trackId, warningLevel: "none", warningMessages: [] };
}

function baseInput(overrides: Partial<Parameters<typeof resolveDjTransition>[0]> = {}) {
  const outgoingEvidence = makeTrackEvidence({ trackId: "track-a", sourceFingerprint: "fp-a" });
  const incomingEvidence = makeTrackEvidence({ trackId: "track-b", sourceFingerprint: "fp-b" });
  const evidence: DjTransitionPairEvidence = { outgoing: outgoingEvidence, incoming: incomingEvidence };
  return {
    playlistId: "pl-1",
    outgoingSlot: makeSlot("slot-a", 0, "track-a"),
    incomingSlot: makeSlot("slot-b", 1, "track-b"),
    outgoingTrack: makeTrack("track-a"),
    incomingTrack: makeTrack("track-b"),
    evidence,
    outgoingRegions: [makeRegion({ regionId: "out-1" })],
    incomingRegions: [makeRegion({ regionId: "in-1", startSeconds: 0, endSeconds: 20 })],
    analysisRevisionKey: "rev-1",
    stemTransportImplemented: false,
    nowIso: "2026-07-22T00:00:00Z",
    idFactory: nextId,
    ...overrides,
  };
}

function trustedRhythmicPairFixture() {
  const barsOut = Array.from({ length: 40 }, (_, i) => 160 + i * 2); // bars 160..238
  const barsIn = Array.from({ length: 40 }, (_, i) => i * 2); // bars 0..78
  const phrasesOut = [160, 192, 224];
  const phrasesIn = [0, 32, 64];
  const outgoingEvidence = makeTrackEvidence({
    trackId: "track-a", sourceFingerprint: "fp-a",
    beatTrusted: true, barTrusted: true, phraseTrusted: true,
    bpm: ev(128), barStartTimesSeconds: ev(barsOut), phraseBoundarySeconds: ev(phrasesOut),
  });
  const incomingEvidence = makeTrackEvidence({
    trackId: "track-b", sourceFingerprint: "fp-b",
    beatTrusted: true, barTrusted: true, phraseTrusted: true,
    bpm: ev(128), barStartTimesSeconds: ev(barsIn), phraseBoundarySeconds: ev(phrasesIn),
  });
  const outgoingRegion = makeRegion({
    regionId: "out-final-phrase", role: "final_phrase", startSeconds: 160, endSeconds: 240,
    availableBarsSeconds: barsOut, availablePhrasesSeconds: phrasesOut, rhythmicTrust: "trusted_rhythmic",
    bassActivitySummary: 0.2, foregroundActivitySummary: 0.2,
  });
  const incomingRegion = makeRegion({
    regionId: "in-clean-intro", role: "clean_intro", startSeconds: 0, endSeconds: 80,
    availableBarsSeconds: barsIn, availablePhrasesSeconds: phrasesIn, rhythmicTrust: "trusted_rhythmic",
    bassActivitySummary: 0.2, foregroundActivitySummary: 0.2,
  });
  return { outgoingEvidence, incomingEvidence, outgoingRegion, incomingRegion };
}

describe("resolveDjTransition", () => {
  it("1. trusted phrase grids on both sides produce phrase alignment", () => {
    const f = trustedRhythmicPairFixture();
    const result = resolveDjTransition(baseInput({
      evidence: { outgoing: f.outgoingEvidence, incoming: f.incomingEvidence },
      outgoingRegions: [f.outgoingRegion],
      incomingRegions: [f.incomingRegion],
    }));
    expect(result.recommended.timeBasis).toBe("phrase");
    expect(result.recommended.family).toBe("phrase_eq_blend");
    expect(result.recommended.trust).toBe("trusted_rhythmic");
  });

  it("4. a region with 32+ available bars on both sides may produce a 32-bar EQ blend", () => {
    const f = trustedRhythmicPairFixture();
    const result = resolveDjTransition(baseInput({
      evidence: { outgoing: f.outgoingEvidence, incoming: f.incomingEvidence },
      outgoingRegions: [f.outgoingRegion],
      incomingRegions: [f.incomingRegion],
    }));
    expect(result.recommended.overlapBars).toBe(32);
  });

  it("2. a beat grid without trusted downbeats cannot produce bar alignment", () => {
    const outgoingEvidence = makeTrackEvidence({ trackId: "track-a", sourceFingerprint: "fp-a", beatTrusted: true, barTrusted: false, bpm: ev(128) });
    const incomingEvidence = makeTrackEvidence({ trackId: "track-b", sourceFingerprint: "fp-b", beatTrusted: true, barTrusted: false, bpm: ev(128) });
    const region = makeRegion({ availableBeatsSeconds: [1, 2, 3], rhythmicTrust: "partially_trusted" });
    const result = resolveDjTransition(baseInput({
      evidence: { outgoing: outgoingEvidence, incoming: incomingEvidence },
      outgoingRegions: [region],
      incomingRegions: [region],
    }));
    expect(result.recommended.timeBasis).not.toBe("bar");
  });

  it("3. BPM without beat positions falls back to seconds", () => {
    const outgoingEvidence = makeTrackEvidence({ trackId: "track-a", sourceFingerprint: "fp-a", bpm: ev(128), beatTrusted: false });
    const incomingEvidence = makeTrackEvidence({ trackId: "track-b", sourceFingerprint: "fp-b", bpm: ev(128), beatTrusted: false });
    const result = resolveDjTransition(baseInput({ evidence: { outgoing: outgoingEvidence, incoming: incomingEvidence } }));
    expect(result.recommended.timeBasis).toBe("seconds");
  });

  it("5/6. foreground and bass collision shortens overlap and still carries a managed bass transfer", () => {
    const f = trustedRhythmicPairFixture();
    const collidingOut = { ...f.outgoingRegion, bassActivitySummary: 0.9, foregroundActivitySummary: 0.9 };
    const collidingIn = { ...f.incomingRegion, bassActivitySummary: 0.9, foregroundActivitySummary: 0.9 };
    const result = resolveDjTransition(baseInput({
      evidence: { outgoing: f.outgoingEvidence, incoming: f.incomingEvidence },
      outgoingRegions: [collidingOut],
      incomingRegions: [collidingIn],
    }));
    expect(result.recommended.family).toBe("short_rhythmic_blend");
    expect(result.recommended.overlapBars).toBe(4);
    expect(result.recommended.automation.bassTransferProgress).not.toBeNull();
    expect(result.recommended.warnings).toEqual(expect.arrayContaining(["bass_collision", "foreground_collision"]));
  });

  it("7. 170 -> 85 is recognized as a candidate half/double-time relationship", () => {
    const outgoingEvidence = makeTrackEvidence({ trackId: "track-a", sourceFingerprint: "fp-a", beatTrusted: true, bpm: ev(170) });
    const incomingEvidence = makeTrackEvidence({ trackId: "track-b", sourceFingerprint: "fp-b", beatTrusted: true, bpm: ev(85) });
    const result = resolveDjTransition(baseInput({ evidence: { outgoing: outgoingEvidence, incoming: incomingEvidence } }));
    expect(result.recommended.pulseRatio).not.toBeNull();
  });

  it("8. a half-time pulse relationship does not override conflicting foreground collision evidence", () => {
    const f = trustedRhythmicPairFixture();
    f.outgoingEvidence.bpm = ev(170);
    f.incomingEvidence.bpm = ev(85);
    const collidingOut = { ...f.outgoingRegion, bassActivitySummary: 0.9, foregroundActivitySummary: 0.9 };
    const collidingIn = { ...f.incomingRegion, bassActivitySummary: 0.9, foregroundActivitySummary: 0.9 };
    const result = resolveDjTransition(baseInput({
      evidence: { outgoing: f.outgoingEvidence, incoming: f.incomingEvidence },
      outgoingRegions: [collidingOut],
      incomingRegions: [collidingIn],
    }));
    // Even with a recognized pulse relationship, collision evidence still wins over a full phrase blend.
    expect(result.recommended.family).not.toBe("phrase_eq_blend");
  });

  it("9. 120 -> 80 avoids forcing rhythmic layering rather than stretching tempo excessively", () => {
    const outgoingEvidence = makeTrackEvidence({ trackId: "track-a", sourceFingerprint: "fp-a", beatTrusted: true, bpm: ev(120) });
    const incomingEvidence = makeTrackEvidence({ trackId: "track-b", sourceFingerprint: "fp-b", beatTrusted: true, bpm: ev(80) });
    const result = resolveDjTransition(baseInput({ evidence: { outgoing: outgoingEvidence, incoming: incomingEvidence } }));
    expect(result.recommended.family).not.toBe("phrase_eq_blend");
    expect(result.recommended.family).not.toBe("short_rhythmic_blend");
    expect(Math.abs(result.recommended.tempoAdjustmentPercentA)).toBeLessThanOrEqual(3);
  });

  it("10. harmonic/key evidence alone never forces do_not_place_adjacent", () => {
    const outgoingEvidence = makeTrackEvidence({ trackId: "track-a", sourceFingerprint: "fp-a", key: ev("C major") });
    const incomingEvidence = makeTrackEvidence({ trackId: "track-b", sourceFingerprint: "fp-b", key: ev("F# major") }); // maximally distant key
    const result = resolveDjTransition(baseInput({ evidence: { outgoing: outgoingEvidence, incoming: incomingEvidence } }));
    expect(result.recommended.family).not.toBe("do_not_place_adjacent");
  });

  it("11. Do Not Layer may still yield a clean cut", () => {
    const outgoingEvidence = makeTrackEvidence({ trackId: "track-a", sourceFingerprint: "fp-a", beatTrusted: true, bpm: ev(120) });
    const incomingEvidence = makeTrackEvidence({ trackId: "track-b", sourceFingerprint: "fp-b", beatTrusted: true, bpm: ev(80) });
    const result = resolveDjTransition(baseInput({ evidence: { outgoing: outgoingEvidence, incoming: incomingEvidence } }));
    expect(result.recommended.family).toBe("clean_cut");
    expect(result.recommended.doNotLayer).toBe(true);
  });

  it("12. an approved, non-stale manual plan wins outright", () => {
    const manualPlan: DjTransitionPlan = {
      id: "manual-1", playlistId: "pl-1", outgoingSlotId: "slot-a", incomingSlotId: "slot-b",
      outgoingTrackId: "track-a", incomingTrackId: "track-b",
      outgoingSourceFingerprint: "fp-a", incomingSourceFingerprint: "fp-b", analysisRevisionKey: "rev-1",
      family: "effect_handoff", trust: "manually_authored", timeBasis: "seconds",
      outgoingCue: { seconds: 200, beatIndex: null, barIndex: null, phraseIndex: null, regionId: null, manuallyAdjusted: true },
      incomingCue: { seconds: 0, beatIndex: null, barIndex: null, phraseIndex: null, regionId: null, manuallyAdjusted: true },
      overlapBars: null, overlapSeconds: 6, tempoAdjustmentPercentA: 0, tempoAdjustmentPercentB: 0, pulseRatio: null,
      automation: { outgoingGain: [], incomingGain: [], outgoingEq: [], incomingEq: [], bassTransferProgress: null },
      doNotLayer: false, warnings: [], explanation: ["Operator-authored effect handoff."],
      origin: "manual", evidenceState: "approved", rehearsals: [], listeningContext: null,
      activeStemSetId: null, activeStemRoles: [], approvedAt: "2026-07-22T00:00:00Z",
      createdAt: "2026-07-22T00:00:00Z", updatedAt: "2026-07-22T00:00:00Z",
    };
    const result = resolveDjTransition(baseInput({ existingManualPlan: manualPlan, existingManualPlanIsStale: false }));
    expect(result.recommended).toBe(manualPlan);
    expect(result.alternatives).toEqual([]);
  });

  it("does not reuse a manual plan flagged stale by the caller — resolves fresh instead", () => {
    const manualPlan: DjTransitionPlan = {
      id: "manual-1", playlistId: "pl-1", outgoingSlotId: "slot-a", incomingSlotId: "slot-b",
      outgoingTrackId: "track-a", incomingTrackId: "track-b",
      outgoingSourceFingerprint: "fp-a", incomingSourceFingerprint: "fp-b", analysisRevisionKey: "rev-1",
      family: "effect_handoff", trust: "manually_authored", timeBasis: "seconds",
      outgoingCue: { seconds: 200, beatIndex: null, barIndex: null, phraseIndex: null, regionId: null, manuallyAdjusted: true },
      incomingCue: { seconds: 0, beatIndex: null, barIndex: null, phraseIndex: null, regionId: null, manuallyAdjusted: true },
      overlapBars: null, overlapSeconds: 6, tempoAdjustmentPercentA: 0, tempoAdjustmentPercentB: 0, pulseRatio: null,
      automation: { outgoingGain: [], incomingGain: [], outgoingEq: [], incomingEq: [], bassTransferProgress: null },
      doNotLayer: false, warnings: [], explanation: [],
      origin: "manual", evidenceState: "approved", rehearsals: [], listeningContext: null,
      activeStemSetId: null, activeStemRoles: [], approvedAt: "2026-07-22T00:00:00Z",
      createdAt: "2026-07-22T00:00:00Z", updatedAt: "2026-07-22T00:00:00Z",
    };
    const result = resolveDjTransition(baseInput({ existingManualPlan: manualPlan, existingManualPlanIsStale: true }));
    expect(result.recommended).not.toBe(manualPlan);
  });

  it("15. alternatives differ meaningfully by family from the recommendation", () => {
    const f = trustedRhythmicPairFixture();
    const result = resolveDjTransition(baseInput({
      evidence: { outgoing: f.outgoingEvidence, incoming: f.incomingEvidence },
      outgoingRegions: [f.outgoingRegion],
      incomingRegions: [f.incomingRegion],
    }));
    expect(result.recommended.family).toBe("phrase_eq_blend");
    expect(result.alternatives.length).toBeGreaterThan(0);
    expect(result.alternatives.every((alt) => alt.family !== result.recommended.family)).toBe(true);
  });

  it("never auto-recommends loop_assisted_handoff or effect_handoff — honestly records them as rejected instead", () => {
    const outgoingEvidence = makeTrackEvidence({ trackId: "track-a", sourceFingerprint: "fp-a", beatTrusted: true, bpm: ev(120) });
    const incomingEvidence = makeTrackEvidence({ trackId: "track-b", sourceFingerprint: "fp-b", beatTrusted: true, bpm: ev(80) });
    const result = resolveDjTransition(baseInput({ evidence: { outgoing: outgoingEvidence, incoming: incomingEvidence } }));
    expect(result.recommended.family).not.toBe("loop_assisted_handoff");
    expect(result.recommended.family).not.toBe("effect_handoff");
    expect(result.rejectedCandidates.some((r) => r.family === "effect_handoff")).toBe(true);
    expect(result.rejectedCandidates.some((r) => r.family === "loop_assisted_handoff")).toBe(true);
  });

  it("never auto-recommends stem_assisted_transition unless stemTransportImplemented is asserted true by the caller", () => {
    const outgoingEvidence = makeTrackEvidence({ trackId: "track-a", sourceFingerprint: "fp-a", currentStemRoles: ev(["vocals", "drums"]) });
    const incomingEvidence = makeTrackEvidence({ trackId: "track-b", sourceFingerprint: "fp-b", currentStemRoles: ev(["vocals", "drums"]) });
    const result = resolveDjTransition(baseInput({ evidence: { outgoing: outgoingEvidence, incoming: incomingEvidence }, stemTransportImplemented: false }));
    expect(result.recommended.family).not.toBe("stem_assisted_transition");
    expect(result.rejectedCandidates.some((r) => r.family === "stem_assisted_transition")).toBe(true);
  });

  it("resolves to do_not_place_adjacent only when there is genuinely no usable evidence at all", () => {
    const outgoingEvidence = makeTrackEvidence({ trackId: "track-a", sourceFingerprint: "fp-a", durationSeconds: ev<number>(null) });
    const incomingEvidence = makeTrackEvidence({ trackId: "track-b", sourceFingerprint: "fp-b", durationSeconds: ev<number>(null) });
    const result = resolveDjTransition(baseInput({ evidence: { outgoing: outgoingEvidence, incoming: incomingEvidence } }));
    expect(result.recommended.family).toBe("do_not_place_adjacent");
    expect(result.recommended.doNotLayer).toBe(true);
  });
});
