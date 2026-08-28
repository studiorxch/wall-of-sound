import { describe, expect, it } from "vitest";
import {
  createAnalysisRecord,
  getAnalysisRecord,
  markAnalysisQueued,
  markAnalysisAnalyzing,
  applyAnalysisResult,
  applyAnalysisFailure,
  resetOrphanedSunoAnalysis,
} from "./analysisRecords";

const CANON_A = "canon-aaa";
const CANON_B = "canon-bbb";
const SNAPSHOT = "suno-snapshot-2026-08-11-full";
const NOW = "2026-08-26T12:00:00.000Z";

const RESULT = {
  analysisStatus: "analyzed" as const,
  bpm: 122,
  camelotKey: "8A",
  energy: 0.6,
  moodTags: ["Warm"],
  moodSuggestions: ["Nostalgic"],
  mechanicalMoodTags: ["opener"] as any,
  analysisWarnings: [],
};

describe("createAnalysisRecord", () => {
  it("seeds a neutral, not-yet-analyzed record", () => {
    const rec = createAnalysisRecord(CANON_A, SNAPSHOT);
    expect(rec.analysisStatus).toBe("not_analyzed");
    expect(rec.bpm).toBeNull();
    expect(rec.moodTags).toEqual([]);
  });
});

describe("markAnalysisQueued / markAnalysisAnalyzing", () => {
  it("seeds a fresh record and stamps queued, then analyzing, preserving canonicalRecordingId across both", () => {
    let records = markAnalysisQueued([], CANON_A, SNAPSHOT, NOW);
    expect(records).toHaveLength(1);
    expect(records[0].analysisStatus).toBe("queued");

    records = markAnalysisAnalyzing(records, CANON_A, SNAPSHOT, NOW);
    expect(records).toHaveLength(1);
    expect(records[0].analysisStatus).toBe("analyzing");
    expect(records[0].canonicalRecordingId).toBe(CANON_A);
  });

  it("does not disturb an existing, unrelated record for a different recording", () => {
    const seeded = [createAnalysisRecord(CANON_B, SNAPSHOT)];
    const next = markAnalysisQueued(seeded, CANON_A, SNAPSHOT, NOW);
    expect(next).toHaveLength(2);
    expect(getAnalysisRecord(next, CANON_B)?.analysisStatus).toBe("not_analyzed");
  });
});

describe("applyAnalysisResult", () => {
  it("writes the real analyzer output onto the record and stamps analysisUpdatedAt", () => {
    let records = markAnalysisAnalyzing([], CANON_A, SNAPSHOT, NOW);
    records = applyAnalysisResult(records, CANON_A, SNAPSHOT, RESULT, NOW);
    const rec = getAnalysisRecord(records, CANON_A)!;
    expect(rec.analysisStatus).toBe("analyzed");
    expect(rec.bpm).toBe(122);
    expect(rec.camelotKey).toBe("8A");
    expect(rec.moodSuggestions).toEqual(["Nostalgic"]);
    expect(rec.analysisUpdatedAt).toBe(NOW);
  });

  it("carries beatMap through when present, via the existing object-spread — no logic change needed (0828 plumbing fix)", () => {
    const beatMap = {
      version: "v1", bpm: 122, beatTimesSeconds: [0, 0.5], barStartTimesSeconds: [0],
      tempoStable: true, tempoStabilityScore: 0.9, tempoSegments: [], confidence: 0.9,
      source: "detected", detectorVersion: "v1",
    } as any;
    let records = markAnalysisAnalyzing([], CANON_A, SNAPSHOT, NOW);
    records = applyAnalysisResult(records, CANON_A, SNAPSHOT, { ...RESULT, beatMap }, NOW);
    expect(getAnalysisRecord(records, CANON_A)!.beatMap).toEqual(beatMap);
  });

  it("leaves beatMap absent when the result carries none", () => {
    let records = markAnalysisAnalyzing([], CANON_A, SNAPSHOT, NOW);
    records = applyAnalysisResult(records, CANON_A, SNAPSHOT, RESULT, NOW);
    expect(getAnalysisRecord(records, CANON_A)!.beatMap).toBeUndefined();
  });
});

describe("applyAnalysisFailure", () => {
  it("marks the record failed and preserves the failure warnings, without touching any other Suno metadata shape", () => {
    let records = markAnalysisAnalyzing([], CANON_A, SNAPSHOT, NOW);
    records = applyAnalysisFailure(records, CANON_A, SNAPSHOT, ["No materialized audio available."], NOW);
    const rec = getAnalysisRecord(records, CANON_A)!;
    expect(rec.analysisStatus).toBe("failed");
    expect(rec.analysisWarnings).toEqual(["No materialized audio available."]);
  });
});

describe("resetOrphanedSunoAnalysis — MUSIC P0 Step C recovery semantics reused verbatim", () => {
  it("resets a record stuck in 'queued' or 'analyzing' back to 'not_analyzed'", () => {
    const records = [
      { ...createAnalysisRecord(CANON_A, SNAPSHOT), analysisStatus: "queued" as const },
      { ...createAnalysisRecord(CANON_B, SNAPSHOT), analysisStatus: "analyzing" as const },
    ];
    const next = resetOrphanedSunoAnalysis(records);
    expect(next[0].analysisStatus).toBe("not_analyzed");
    expect(next[1].analysisStatus).toBe("not_analyzed");
  });

  it("does not touch a genuinely completed 'analyzed'/'failed' record", () => {
    const records = [
      { ...createAnalysisRecord(CANON_A, SNAPSHOT), analysisStatus: "analyzed" as const },
      { ...createAnalysisRecord(CANON_B, SNAPSHOT), analysisStatus: "failed" as const },
    ];
    const next = resetOrphanedSunoAnalysis(records);
    expect(next).toBe(records); // same reference — no-op when nothing changed
  });

  it("does not touch a genuinely not_analyzed record (never-attempted)", () => {
    const records = [createAnalysisRecord(CANON_A, SNAPSHOT)];
    const next = resetOrphanedSunoAnalysis(records);
    expect(next).toBe(records);
  });
});
