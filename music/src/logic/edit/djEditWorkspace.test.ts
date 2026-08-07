import { describe, expect, it } from "vitest";
import type { CompleteSongAnalysis } from "../../data/songAnalysisTypes";
import type { Track } from "../../data/trackTypes";
import { appendPreparationGridRevision, buildDjPreparationCue, deriveDjPhraseGrid, setPreparationPhraseGrid } from "./djTrackPreparation";
import { buildDjEditWorkspaceModel, DJ_PREPARATION_FAILURE_LABELS } from "./djEditWorkspace";
import type { MusicalGrid } from "../../data/loopTypes";

const now = "2026-08-07T12:00:00.000Z";
const track = { trackId: "t1", title: "Track", bpm: 120, cuePoints: [{ id: "generic", timeSeconds: 2 }] } as Track;
const analysis = {
  id: "a1", sourceTrackId: "t1", sourceMediaFingerprint: "fp", decodedFrameCount: 16_000, sampleRate: 1_000,
  analyzerVersion: "v1", configurationVersion: "c1", status: "READY_PROVISIONAL",
  sections: [{ id: "s1", sourceTrackId: "t1", structuralType: "intro", displayLabel: "Intro", startFrame: 0, endFrame: 16_000, confidence: .8, verification: "reviewed", origin: "analyzer" }],
  sectionRevisions: [], createdAt: now, updatedAt: now,
} as CompleteSongAnalysis;
const grid: MusicalGrid = {
  bpm: 120, meterNumerator: 4, meterDenominator: 4, originSeconds: 0, originFrame: 0,
  originSource: "manual", trust: "manual", confidence: 1,
  beatFrames: Array.from({ length: 32 }, (_, index) => index * 500),
  barFrames: Array.from({ length: 8 }, (_, index) => index * 2_000), sourceFingerprint: "fp", updatedAt: now,
};

describe("DJ Edit workspace read model", () => {
  it("fails closed for old projects without song analysis or preparation", () => {
    const missing = buildDjEditWorkspaceModel(track, null, now);
    expect(missing.preparationStatus).toBe("not_prepared");
    expect(missing.validation).toEqual({ valid: false, reason: "missing_preparation" });
  });

  it("projects the one persisted active grid and derives visibly inferred phrase boundaries", () => {
    const prepared = appendPreparationGridRevision(analysis, grid, "manual_origin", "r1", "p1", now);
    const model = buildDjEditWorkspaceModel(track, prepared, now);
    expect(model.activeGrid?.revisionId).toBe("r1");
    expect(model.activeGrid?.grid).toEqual(grid);
    expect(model.phraseGridPersisted).toBe(false);
    expect(model.phraseGrid?.boundaries.every((boundary) => boundary.provenance === "inferred")).toBe(true);
    expect(model.sections[0]).toMatchObject({ label: "intro", confidence: "high" });
  });

  it("projects persisted manually-confirmed phrase truth instead of regenerating it", () => {
    const prepared = appendPreparationGridRevision(analysis, grid, "manual_origin", "r1", "p1", now);
    const active = { grid, revisionId: "r1" };
    const phrase = deriveDjPhraseGrid(active, 1, [4, 8, 16, 32], "manually_confirmed", now);
    const saved = setPreparationPhraseGrid(prepared, phrase, "p1", now);
    const model = buildDjEditWorkspaceModel(track, saved, now);
    expect(model.phraseGridPersisted).toBe(true);
    expect(model.phraseGrid?.originBarIndex).toBe(1);
    expect(model.phraseGrid?.boundaries[0].provenance).toBe("manually_confirmed");
  });

  it("constructs bounded frame-authoritative cues with grid indexes", () => {
    const cue = buildDjPreparationCue("MIX_OUT", 99_999, analysis, { grid, revisionId: "r1" }, "cue1", now);
    expect(cue.frame).toBe(15_999);
    expect(cue.basisGridRevisionId).toBe("r1");
    expect(cue.beatIndex).toBe(31);
    expect(cue.barIndex).toBe(7);
    expect(cue.provenance).toBe("manually_confirmed");
  });

  it("has an exact operator label for every fail-closed prerequisite", () => {
    expect(Object.keys(DJ_PREPARATION_FAILURE_LABELS)).toHaveLength(11);
    expect(DJ_PREPARATION_FAILURE_LABELS.cue_order_invalid).toContain("FULL_ENTRY");
  });
});
