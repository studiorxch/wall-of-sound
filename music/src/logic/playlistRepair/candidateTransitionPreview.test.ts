import { describe, it, expect } from "vitest";
import type { Track } from "../../data/trackTypes";
import type { TrackBeatMap } from "../../data/beatMapTypes";
import type { TrackPlaybackBounds } from "../../data/playbackBoundsTypes";
import { previewCandidateTransition } from "./candidateTransitionPreview";

function makeTrack(id: string, opts: Partial<Track> = {}): Track {
  return {
    trackId: id, title: id, artist: "Artist",
    durationSeconds: 200, energy: 0.5,
    sourceOwner: "studiorich", genres: [], moodTags: [], moodSuggestions: [],
    sourcePoolIds: [], grouping: "", albumArtist: "", archiveStatus: "library",
    ...opts,
  } as unknown as Track;
}

function makeBeatMap(overrides: Partial<TrackBeatMap> = {}): TrackBeatMap {
  return {
    version: "1.0", beatTimesSeconds: Array.from({ length: 100 }, (_, i) => i * 0.5),
    barStartTimesSeconds: Array.from({ length: 25 }, (_, i) => i * 2),
    firstDownbeatSeconds: 0.5, tempoStable: true, tempoStabilityScore: 0.95, tempoSegments: [],
    confidence: 0.9, source: "detected", detectorVersion: "beat-map-v3", analyzedAt: "2026-01-01T00:00:00Z", warnings: [],
    confidenceComponents: {
      onsetStrength: 0.9, onsetRegularity: 0.9, beatPhaseFit: 0.9, beatCoverage: 0.9, beatContinuity: 0.9,
      downbeatRecurrence: 0.9, barAlignment: 0.9, tempoStability: 0.9, segmentConsistency: 1,
      introRegionConfidence: 0.9, outroRegionConfidence: 0.9, priorAgreement: 1, warningPenalty: 1, total: 0.9,
    },
    introRegion: { startSeconds: 2, endSeconds: 10, cleanBars: 4, confidence: 0.9, reasons: [] },
    outroRegion: { startSeconds: 180, endSeconds: 190, cleanBars: 4, confidence: 0.9, reasons: [] },
    ...overrides,
  };
}

function makeBounds(overrides: Partial<TrackPlaybackBounds> = {}): TrackPlaybackBounds {
  return {
    version: "1.0", sourceDurationSeconds: 200,
    audibleStartSeconds: 0, preferredStartSeconds: 1,
    preferredEndSeconds: 195, audibleEndSeconds: 200,
    leadingSilenceSeconds: 0, trailingSilenceSeconds: 0,
    effectiveDurationSeconds: 194,
    startClassification: "musical_intro", endClassification: "musical_outro",
    startConfidence: 0.8, endConfidence: 0.8, overallConfidence: 0.8,
    source: "detected", detectorVersion: "playback-bounds-v1", analyzedAt: "2026-01-01T00:00:00Z", warnings: [],
    ...overrides,
  };
}

const NOW = "2026-01-01T00:00:00Z";

describe("candidate transition preview", () => {
  it("computes both previous→candidate and candidate→next previews when both neighbors exist", () => {
    const prev = makeTrack("prev", { bpm: 128, bpmSource: "detected", camelotKey: "8B", keySource: "detected", beatMap: makeBeatMap(), playbackBounds: makeBounds() });
    const candidate = makeTrack("cand", { bpm: 128, bpmSource: "detected", camelotKey: "8B", keySource: "detected", beatMap: makeBeatMap(), playbackBounds: makeBounds() });
    const next = makeTrack("next", { bpm: 128, bpmSource: "detected", camelotKey: "8B", keySource: "detected", beatMap: makeBeatMap(), playbackBounds: makeBounds() });
    const tracksById = new Map([["prev", prev], ["cand", candidate], ["next", next]]);

    const preview = previewCandidateTransition("pl1", "cand", prev, next, tracksById, NOW);
    expect(preview.candidateTrackId).toBe("cand");
    expect(preview.previousSyncMode).toBeDefined();
    expect(preview.nextSyncMode).toBeDefined();
    expect(preview.previousPlanStatus).toBeDefined();
    expect(preview.nextPlanStatus).toBeDefined();
  });

  it("omits the previous side when there is no previous track (start of playlist)", () => {
    const candidate = makeTrack("cand", { beatMap: makeBeatMap(), playbackBounds: makeBounds() });
    const next = makeTrack("next", { beatMap: makeBeatMap(), playbackBounds: makeBounds() });
    const tracksById = new Map([["cand", candidate], ["next", next]]);

    const preview = previewCandidateTransition("pl1", "cand", undefined, next, tracksById, NOW);
    expect(preview.previousSyncMode).toBeUndefined();
    expect(preview.previousPlanStatus).toBeUndefined();
    expect(preview.nextSyncMode).toBeDefined();
  });

  it("does not fabricate synchronization for an untrusted candidate — falls back honestly", () => {
    const prev = makeTrack("prev", { bpm: 128, bpmSource: "detected", beatMap: makeBeatMap(), playbackBounds: makeBounds() });
    // candidate has NO beat map / bounds at all — must never be reported as beat/bar sync
    const candidate = makeTrack("cand", { bpm: 128, bpmSource: "detected" });
    const tracksById = new Map([["prev", prev], ["cand", candidate]]);

    const preview = previewCandidateTransition("pl1", "cand", prev, undefined, tracksById, NOW);
    expect(preview.previousSyncMode).not.toBe("beat_sync");
    expect(preview.previousSyncMode).not.toBe("bar_sync");
  });

  it("is purely informational — never mutates the tracksById map or the input tracks", () => {
    const prev = makeTrack("prev", { beatMap: makeBeatMap(), playbackBounds: makeBounds() });
    const candidate = makeTrack("cand", { beatMap: makeBeatMap(), playbackBounds: makeBounds() });
    const tracksById = new Map([["prev", prev], ["cand", candidate]]);
    const snapshotSize = tracksById.size;

    previewCandidateTransition("pl1", "cand", prev, undefined, tracksById, NOW);
    expect(tracksById.size).toBe(snapshotSize);
    expect(prev.beatMap).toBeDefined();
  });

  it("returns an empty preview when the candidate track cannot be resolved", () => {
    const tracksById = new Map<string, Track>();
    const preview = previewCandidateTransition("pl1", "ghost", undefined, undefined, tracksById, NOW);
    expect(preview.candidateTrackId).toBe("ghost");
    expect(preview.previousSyncMode).toBeUndefined();
    expect(preview.nextSyncMode).toBeUndefined();
    expect(preview.warningCodes).toEqual([]);
  });
});
