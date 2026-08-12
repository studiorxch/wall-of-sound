import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { stageMachineLifeManifestImport } from "./machineLifeManifestAdapter";
import {
  buildMachineLifeReviewsMarkdown,
  createMachineLifeReviewExport,
  machineLifeReviewExportJson,
  machineLifeReviewsRoundTripEquals,
  parseMachineLifeReviewExport,
} from "./machineLifeExport";
import { createEmptyMachineLifeReview } from "../../data/machineLifeTypes";
import type { MachineLifeCollection, MachineLifeRecordingReview } from "../../data/machineLifeTypes";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REAL_MANIFEST_TEXT = readFileSync(
  path.resolve(__dirname, "../../../../WOS-share/MACHINE_LIFE/REFERENCE/MANIFESTS/stage-00-pre-life-manifest.json"),
  "utf-8",
);

function realCollection(): MachineLifeCollection {
  const result = stageMachineLifeManifestImport(REAL_MANIFEST_TEXT, "irrelevant.json", [], "2026-08-11T00:00:00.000Z");
  if (result.status !== "staged") throw new Error("expected staged");
  return result.collection;
}

function sampleReviews(): MachineLifeRecordingReview[] {
  return [
    {
      ...createEmptyMachineLifeReview("ml-prelife-0024"),
      firstImage: "escaping danger successfully",
      lifeScore: 2,
      replay: false,
      immediateNote: "exciting",
      usefulSourceRelationship: "sweep + FM + Gang rhythm",
      behaviorDiscovered: "coherent escape event",
      disposition: "resident-seed",
      nextAction: "preserve as Life benchmark",
      reviewedAt: "2026-08-11T00:00:00.000Z",
    },
    {
      ...createEmptyMachineLifeReview("ml-prelife-0004"),
      lifeScore: 1,
      replay: true,
    },
  ];
}

describe("machineLifeExport — deterministic JSON + Markdown, round-trip", () => {
  it("produces a deterministic export regardless of input review order", () => {
    const reviews = sampleReviews();
    const forward = createMachineLifeReviewExport("mlcoll_test", reviews, "2026-08-11T12:00:00.000Z");
    const reversed = createMachineLifeReviewExport("mlcoll_test", [...reviews].reverse(), "2026-08-11T12:00:00.000Z");
    expect(machineLifeReviewExportJson(forward)).toBe(machineLifeReviewExportJson(reversed));
  });

  it("round-trips through JSON export and re-import with equality", () => {
    const reviews = sampleReviews();
    const exported = createMachineLifeReviewExport("mlcoll_test", reviews, "2026-08-11T12:00:00.000Z");
    const json = machineLifeReviewExportJson(exported);

    const parsed = parseMachineLifeReviewExport(json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.exportData.collectionId).toBe("mlcoll_test");
    expect(machineLifeReviewsRoundTripEquals(reviews, parsed.exportData.reviews)).toBe(true);
  });

  it("rejects a malformed or wrong-kind review export file", () => {
    expect(parseMachineLifeReviewExport("{not json").ok).toBe(false);
    expect(parseMachineLifeReviewExport(JSON.stringify({ exportKind: "SOMETHING_ELSE" })).ok).toBe(false);
    expect(parseMachineLifeReviewExport(JSON.stringify({ exportKind: "MACHINE_LIFE_REVIEWS", collectionId: "x" })).ok).toBe(false);
  });

  it("builds readable Markdown covering the real collection and preserves Life 0 recordings as unreviewed, not hidden", () => {
    const collection = realCollection();
    const md = buildMachineLifeReviewsMarkdown(collection, [], "2026-08-11T12:00:00.000Z");
    expect(md).toContain("Deterministic Pre-Life recordings");
    expect(md).toContain("ml-prelife-0001");
    expect(md).toContain("ml-prelife-0025");
    expect(md).toContain("Review: unreviewed");
  });

  it("Markdown export reflects saved Life/Replay/disposition fields", () => {
    const collection = realCollection();
    const reviews = sampleReviews();
    const md = buildMachineLifeReviewsMarkdown(collection, reviews, "2026-08-11T12:00:00.000Z");
    expect(md).toContain("- Life: 2");
    expect(md).toContain("- Replay: no");
    expect(md).toContain("- Disposition: resident-seed");
  });
});
