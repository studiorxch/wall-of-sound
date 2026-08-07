import { describe, expect, it } from "vitest";
import type { CompleteSongAnalysis } from "../../data/songAnalysisTypes";
import type { MusicalGrid } from "../../data/loopTypes";
import {
  appendPreparationGridRevision,
  approveDjTrackPreparation,
  buildDjPreparationCue,
  deriveDjPhraseGrid,
  resolveActivePreparationGrid,
  reviewDjTrackPreparation,
  setPreparationCue,
  setPreparationPhraseGrid,
} from "./djTrackPreparation";
import { resolveCanonicalBarAlignment, resolveCanonicalBarTarget } from "./canonicalBarCueAuthoring";

const NOW = "2026-08-07T12:00:00.000Z";
const grid: MusicalGrid = {
  bpm: 120, meterNumerator: 4, meterDenominator: 4, originSeconds: 0, originFrame: 0,
  originSource: "trusted_downbeat", trust: "trusted", confidence: 1,
  beatFrames: [0, 100, 200, 300, 400, 500, 600, 700, 800],
  barFrames: [0, 400, 800], sourceFingerprint: "source", updatedAt: NOW,
};

function analysis(): CompleteSongAnalysis {
  return {
    id: "analysis", sourceTrackId: "track", sourceMediaFingerprint: "source",
    decodedFrameCount: 1_000, sampleRate: 100, analyzerVersion: "v1", configurationVersion: "c1",
    status: "READY_PROVISIONAL", sections: [{
      id: "section", sourceTrackId: "track", structuralType: "body", displayLabel: "Body",
      startFrame: 0, endFrame: 1_000, confidence: 1, verification: "reviewed", origin: "analyzer",
    }], sectionRevisions: [], createdAt: NOW, updatedAt: NOW,
  };
}

describe("canonical bar cue authoring", () => {
  it("selects previous, nearest, and next exact canonical frames", () => {
    expect(resolveCanonicalBarTarget(610, grid, "previous")).toEqual({ barIndex: 1, frame: 400 });
    expect(resolveCanonicalBarTarget(610, grid, "nearest")).toEqual({ barIndex: 2, frame: 800 });
    expect(resolveCanonicalBarTarget(610, grid, "next")).toEqual({ barIndex: 2, frame: 800 });
  });

  it("uses the earlier bar deterministically when nearest distances tie", () => {
    expect(resolveCanonicalBarTarget(600, grid, "nearest")).toEqual({ barIndex: 1, frame: 400 });
  });

  it("handles first, last, and already-aligned boundaries", () => {
    expect(resolveCanonicalBarTarget(0, grid, "previous")).toBeNull();
    expect(resolveCanonicalBarTarget(0, grid, "nearest")).toEqual({ barIndex: 0, frame: 0 });
    expect(resolveCanonicalBarTarget(0, grid, "next")).toEqual({ barIndex: 1, frame: 400 });
    expect(resolveCanonicalBarTarget(800, grid, "previous")).toEqual({ barIndex: 1, frame: 400 });
    expect(resolveCanonicalBarTarget(800, grid, "next")).toBeNull();
  });

  it("fails closed without an active grid and detects off-grid cues", () => {
    expect(resolveCanonicalBarTarget(100, null, "nearest")).toBeNull();
    expect(resolveCanonicalBarAlignment(100, grid, [])).toBeNull();
    expect(resolveCanonicalBarAlignment(400, grid, [])).toMatchObject({ barIndex: 1, frame: 400 });
  });

  it("keeps phrase confirmation separate from exact bar alignment", () => {
    const inferred = deriveDjPhraseGrid({ grid, revisionId: "grid-1" }, 0, [4], "inferred", NOW);
    expect(resolveCanonicalBarAlignment(0, grid, inferred.boundaries)?.phraseBoundaries[0]?.provenance).toBe("inferred");
    expect(resolveCanonicalBarAlignment(400, grid, inferred.boundaries)?.phraseBoundaries).toEqual([]);
  });

  it("moves through the existing preparation command and persists the exact frame", () => {
    const withGrid = appendPreparationGridRevision(analysis(), grid, "manual_origin", "grid-1", "prep", NOW);
    const active = resolveActivePreparationGrid(withGrid.djPreparation, null)!;
    const phrase = deriveDjPhraseGrid(active, 0, [4], "manually_confirmed", NOW);
    const withPhrase = setPreparationPhraseGrid(withGrid, phrase, "prep", NOW);
    const target = resolveCanonicalBarTarget(610, active.grid, "nearest")!;
    const cue = buildDjPreparationCue("MIX_OUT", target.frame, withPhrase, active, "cue", NOW);
    const moved = setPreparationCue(withPhrase, cue, "prep", NOW);
    const reloaded = JSON.parse(JSON.stringify(moved)) as CompleteSongAnalysis;
    expect(cue.frame).toBe(active.grid.barFrames[target.barIndex]);
    expect(cue.barIndex).toBe(target.barIndex);
    expect(reloaded.djPreparation?.cues.MIX_OUT?.frame).toBe(800);
  });

  it("invalidates an approved preparation without touching generic cues", () => {
    let prepared = appendPreparationGridRevision(analysis(), grid, "manual_origin", "grid-1", "prep", NOW);
    const active = resolveActivePreparationGrid(prepared.djPreparation, null)!;
    prepared = setPreparationPhraseGrid(prepared, deriveDjPhraseGrid(active, 0, [4], "manually_confirmed", NOW), "prep", NOW);
    for (const [role, frame] of [["FULL_ENTRY", 0], ["SHORT_ENTRY", 100], ["MAIN_ENTRY", 200], ["MIX_OUT", 800]] as const) {
      prepared = setPreparationCue(prepared, buildDjPreparationCue(role, frame, prepared, active, `cue-${role}`, NOW), "prep", NOW);
    }
    const track = { trackId: "track", title: "Track", bpm: 120, bpmSource: "manual", analysisUpdatedAt: NOW, cuePoints: [{ id: "generic", timeSeconds: 1 }] } as never;
    const approved = approveDjTrackPreparation(track, reviewDjTrackPreparation(prepared, active, NOW), active, NOW);
    const moved = setPreparationCue(approved, buildDjPreparationCue("MIX_OUT", 400, approved, active, "moved", NOW), "prep", NOW);
    expect(moved.djPreparation?.status).toBe("stale");
    expect((track as { cuePoints: unknown[] }).cuePoints).toEqual([{ id: "generic", timeSeconds: 1 }]);
  });
});
