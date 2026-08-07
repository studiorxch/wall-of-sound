import { describe, expect, it } from "vitest";
import type { MusicalGrid } from "../../data/loopTypes";
import type { CompleteSongAnalysis, SongSectionVerification } from "../../data/songAnalysisTypes";
import type { Track } from "../../data/trackTypes";
import type { DjPreparationCueRole } from "../../data/djTrackPreparationTypes";
import {
  DJ_PREPARATION_CUE_ORDER,
  appendPreparationGridRevision,
  approveDjTrackPreparation,
  buildDjPreparationBasis,
  createDjTrackPreparation,
  deriveDjPhraseGrid,
  resolveActivePreparationGrid,
  resolveDjTrackPreparationStatus,
  reviewDjTrackPreparation,
  setPreparationCue,
  setPreparationPhraseGrid,
  synchronizeDjTrackPreparationStaleness,
  validateDjTrackPreparation,
} from "./djTrackPreparation";

const NOW = "2026-08-07T12:00:00.000Z";

function grid(overrides: Partial<MusicalGrid> = {}): MusicalGrid {
  return {
    bpm: 120,
    meterNumerator: 4,
    meterDenominator: 4,
    originSeconds: 0,
    originFrame: 0,
    originSource: "trusted_downbeat",
    trust: "trusted",
    confidence: 0.9,
    beatFrames: Array.from({ length: 128 }, (_, index) => index * 100),
    barFrames: Array.from({ length: 32 }, (_, index) => index * 400),
    sourceFingerprint: "source-1",
    updatedAt: NOW,
    ...overrides,
  };
}

function analysis(verification: SongSectionVerification = "reviewed"): CompleteSongAnalysis {
  return {
    id: "analysis-1",
    sourceTrackId: "track-1",
    sourceMediaFingerprint: "source-1",
    decodedFrameCount: 20_000,
    sampleRate: 1000,
    analyzerVersion: "song-v1",
    configurationVersion: "config-v1",
    status: "READY_PROVISIONAL",
    sections: [{
      id: "section-1", sourceTrackId: "track-1", structuralType: "body", displayLabel: "Body",
      startFrame: 0, endFrame: 20_000, confidence: 0.8, verification, origin: "analyzer",
    }],
    sectionRevisions: [],
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function track(overrides: Partial<Track> = {}): Track {
  return {
    trackId: "track-1",
    title: "Track",
    bpm: 120,
    bpmSource: "manual",
    analysisUpdatedAt: NOW,
    beatMap: {
      version: "beat-map-v3", bpm: 120, firstDownbeatSeconds: 0,
      beatTimesSeconds: [0, 0.5, 1, 1.5], barStartTimesSeconds: [0], tempoStable: true,
      tempoStabilityScore: 1, tempoSegments: [], confidence: 0.9, source: "manual",
      detectorVersion: "beat-map-v3", analyzedAt: NOW, warnings: [],
    },
    ...overrides,
  } as Track;
}

function withGrid(base = analysis()): CompleteSongAnalysis {
  return appendPreparationGridRevision(base, grid(), "manual_origin", "grid-rev-1", "prep-1", NOW);
}

function completePreparation(base = withGrid()): CompleteSongAnalysis {
  const active = resolveActivePreparationGrid(base.djPreparation, null)!;
  let next = setPreparationPhraseGrid(base, deriveDjPhraseGrid(active, 0, [4, 8, 16, 32], "manually_confirmed", NOW), "prep-1", NOW);
  const frames = [0, 4_000, 8_000, 12_000];
  DJ_PREPARATION_CUE_ORDER.forEach((role, index) => {
    next = setPreparationCue(next, {
      id: `cue-${role}`, role, frame: frames[index], basisGridRevisionId: active.revisionId,
      origin: "manual", provenance: "manually_confirmed", confidence: 1, updatedAt: NOW,
    }, "prep-1", NOW);
  });
  return next;
}

describe("canonical preparation grid authority", () => {
  it("falls back to detector grid until an append-only persisted revision becomes active", () => {
    const detected = grid({ bpm: 118 });
    expect(resolveActivePreparationGrid(undefined, detected)).toEqual({ grid: detected, revisionId: "detected" });
    const first = appendPreparationGridRevision(analysis(), grid(), "manual_origin", "r1", "prep-1", NOW);
    const second = appendPreparationGridRevision(first, grid({ bpm: 121 }), "manual_nudge", "r2", "prep-1", "2026-08-07T12:01:00.000Z");
    expect(second.djPreparation?.gridRevisions.map((revision) => revision.id)).toEqual(["r1", "r2"]);
    expect(second.djPreparation?.gridRevisions[1].revisionOf).toBe("r1");
    expect(resolveActivePreparationGrid(second.djPreparation, detected)?.grid.bpm).toBe(121);
    expect(first.djPreparation?.gridRevisions).toHaveLength(1);
  });

  it("survives a project-style JSON persistence and reload round trip", () => {
    const saved = appendPreparationGridRevision(analysis(), grid({ originFrame: 240 }), "manual_nudge", "r1", "prep-1", NOW);
    const reloaded = JSON.parse(JSON.stringify(saved)) as CompleteSongAnalysis;
    const resolved = resolveActivePreparationGrid(reloaded.djPreparation, grid());
    expect(resolved?.revisionId).toBe("r1");
    expect(resolved?.grid.originFrame).toBe(240);
    expect(reloaded.djPreparation?.gridRevisions[0].reason).toBe("manual_nudge");
  });

  it.each(["manual_origin", "manual_nudge", "half_bpm", "double_bpm", "reset_detected"] as const)(
    "records %s as a new revision without mutating detector evidence",
    (reason) => {
      const source = analysis();
      const next = appendPreparationGridRevision(source, grid(), reason, `r-${reason}`, "prep-1", NOW);
      expect(next.djPreparation?.gridRevisions[0].reason).toBe(reason);
      expect(source.djPreparation).toBeUndefined();
    },
  );
});

describe("phrase and cue authority", () => {
  it("derives deterministic 4/8/16/32 boundaries by bar index with explicit provenance", () => {
    const active = { grid: grid(), revisionId: "r1" };
    const inferred = deriveDjPhraseGrid(active, 0, [32, 4, 16, 8], "inferred", NOW);
    expect(inferred.enabledGroupings).toEqual([4, 8, 16, 32]);
    expect(inferred.boundaries.filter((boundary) => boundary.groupingBars === 8).map((boundary) => boundary.barIndex)).toEqual([0, 8, 16, 24]);
    expect(inferred.boundaries.every((boundary) => boundary.provenance === "inferred")).toBe(true);
    expect(deriveDjPhraseGrid(active, 0, [32, 4, 16, 8], "inferred", NOW)).toEqual(inferred);
    expect(deriveDjPhraseGrid(active, 2, [4], "manually_confirmed", NOW).boundaries[0]).toMatchObject({ barIndex: 2, provenance: "manually_confirmed" });
  });

  it("keeps each semantic cue role unique and frame-authoritative", () => {
    const base = withGrid();
    const cue = (role: DjPreparationCueRole, frame: number) => ({
      id: `${role}-${frame}`, role, frame, basisGridRevisionId: "grid-rev-1",
      origin: "manual" as const, provenance: "manually_confirmed" as const, confidence: 1, updatedAt: NOW,
    });
    const first = setPreparationCue(base, cue("FULL_ENTRY", 100), "prep-1", NOW);
    const second = setPreparationCue(first, cue("FULL_ENTRY", 200), "prep-1", NOW);
    expect(Object.keys(second.djPreparation!.cues)).toEqual(["FULL_ENTRY"]);
    expect(second.djPreparation!.cues.FULL_ENTRY?.frame).toBe(200);
  });

  it("rejects missing, out-of-bounds, wrongly ordered, and stale-grid cues", () => {
    const active = resolveActivePreparationGrid(withGrid().djPreparation, null)!;
    expect(validateDjTrackPreparation(withGrid(), active)).toEqual({ valid: false, reason: "missing_phrase_grid" });
    const complete = completePreparation();
    expect(validateDjTrackPreparation(complete, active)).toEqual({ valid: true });
    expect(validateDjTrackPreparation(setPreparationCue(complete, {
      ...complete.djPreparation!.cues.MIX_OUT!, frame: 30_000,
    }, "prep-1", NOW), active)).toEqual({ valid: false, reason: "cue_out_of_bounds" });
    expect(validateDjTrackPreparation(setPreparationCue(complete, {
      ...complete.djPreparation!.cues.MAIN_ENTRY!, frame: 13_000,
    }, "prep-1", NOW), active)).toEqual({ valid: false, reason: "cue_order_invalid" });
    expect(validateDjTrackPreparation(setPreparationCue(complete, {
      ...complete.djPreparation!.cues.FULL_ENTRY!, basisGridRevisionId: "old-grid",
    }, "prep-1", NOW), active)).toEqual({ valid: false, reason: "cue_out_of_bounds" });
  });
});

describe("review, approval, and staleness", () => {
  it("fails closed until complete, reviewed section evidence exists", () => {
    const incomplete = withGrid(analysis("provisional"));
    const active = resolveActivePreparationGrid(incomplete.djPreparation, null)!;
    expect(reviewDjTrackPreparation(incomplete, active, NOW)).toBe(incomplete);
    expect(approveDjTrackPreparation(track(), incomplete, active, NOW)).toBe(incomplete);
  });

  it("approves only a reviewed complete preparation and preserves its basis", () => {
    const complete = completePreparation();
    const active = resolveActivePreparationGrid(complete.djPreparation, null)!;
    const reviewed = reviewDjTrackPreparation(complete, active, NOW);
    const approved = approveDjTrackPreparation(track(), reviewed, active, NOW);
    expect(reviewed.djPreparation?.status).toBe("reviewed");
    expect(approved.djPreparation?.status).toBe("approved");
    expect(approved.djPreparation?.approvalBasis?.activeGridRevisionId).toBe("grid-rev-1");
    expect(approved.djPreparation?.approvalRevisionKey).toBeTruthy();
  });

  it("marks edits to approved preparation stale while retaining its approval snapshot", () => {
    const complete = completePreparation();
    const active = resolveActivePreparationGrid(complete.djPreparation, null)!;
    const approved = approveDjTrackPreparation(track(), reviewDjTrackPreparation(complete, active, NOW), active, NOW);
    const edited = appendPreparationGridRevision(
      approved, grid({ originFrame: 10 }), "manual_nudge", "grid-rev-2", "prep-1", "later",
    );
    expect(edited.djPreparation?.status).toBe("stale");
    expect(edited.djPreparation?.approvalBasis).toEqual(approved.djPreparation?.approvalBasis);
    expect(edited.djPreparation?.approvalRevisionKey).toBe(approved.djPreparation?.approvalRevisionKey);
    expect(edited.djPreparation?.gridRevisions).toHaveLength(2);
  });

  it("resolves BPM, source, grid, analysis, and section basis changes as stale", () => {
    const complete = completePreparation();
    const active = resolveActivePreparationGrid(complete.djPreparation, null)!;
    const approved = approveDjTrackPreparation(track(), reviewDjTrackPreparation(complete, active, NOW), active, NOW);
    const unchangedBasis = buildDjPreparationBasis(track(), approved, active);
    expect(resolveDjTrackPreparationStatus(approved.djPreparation!, unchangedBasis)).toBe("approved");

    const changedTrackBasis = buildDjPreparationBasis(track({ bpm: 121 }), approved, active);
    expect(resolveDjTrackPreparationStatus(approved.djPreparation!, changedTrackBasis)).toBe("stale");
    expect(synchronizeDjTrackPreparationStaleness(approved, changedTrackBasis, "later").djPreparation?.status).toBe("stale");

    const changedAnalysis = { ...approved, sourceMediaFingerprint: "source-2" };
    expect(resolveDjTrackPreparationStatus(approved.djPreparation!, buildDjPreparationBasis(track(), changedAnalysis, active))).toBe("stale");
    const changedGrid = { grid: { ...active.grid, originFrame: 10 }, revisionId: "r2" };
    expect(resolveDjTrackPreparationStatus(approved.djPreparation!, buildDjPreparationBasis(track(), approved, changedGrid))).toBe("stale");
    const changedSections = { ...approved, sections: approved.sections.map((section) => ({ ...section, endFrame: section.endFrame - 1 })) };
    expect(resolveDjTrackPreparationStatus(approved.djPreparation!, buildDjPreparationBasis(track(), changedSections, active))).toBe("stale");
  });

  it("leaves old analyses without preparation backward-compatible", () => {
    const old = analysis();
    expect(old.djPreparation).toBeUndefined();
    expect(createDjTrackPreparation(old, "prep-1", NOW).status).toBe("draft");
  });
});
