import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { stageMachineLifeManifestImport } from "./machineLifeManifestAdapter";
import {
  filterMachineLifeRecordings,
  findMachineLifeReview,
  preLifeProxyAvailable,
  repeatedDirectAncestorWarnings,
  reviewCompleteness,
  summarizeMachineLifeCollection,
} from "./machineLifeSelectors";
import { createEmptyMachineLifeReview } from "../../data/machineLifeTypes";
import type { MachineLifeCollection, MachineLifeProxyLibrary, MachineLifeRecordingReview } from "../../data/machineLifeTypes";

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

describe("machineLifeSelectors — real collection", () => {
  it("reviewCompleteness distinguishes unreviewed/partial/complete", () => {
    expect(reviewCompleteness(undefined)).toBe("unreviewed");
    const empty = createEmptyMachineLifeReview("ml-prelife-0001");
    expect(reviewCompleteness(empty)).toBe("unreviewed");
    const partial: MachineLifeRecordingReview = { ...empty, lifeScore: 2, replay: false };
    expect(reviewCompleteness(partial)).toBe("partial");
    const complete: MachineLifeRecordingReview = {
      ...empty,
      firstImage: "carnival",
      lifeScore: 2,
      replay: false,
      immediateNote: "note",
      usefulSourceRelationship: "rel",
      behaviorDiscovered: "behavior",
      disposition: "preserve",
      nextAction: "next",
    };
    expect(reviewCompleteness(complete)).toBe("complete");
  });

  it("Life 2 + Replay no is valid, and Life 1 + Replay yes is valid (independent fields)", () => {
    const a: MachineLifeRecordingReview = { ...createEmptyMachineLifeReview("ml-prelife-0002"), lifeScore: 2, replay: false };
    const b: MachineLifeRecordingReview = { ...createEmptyMachineLifeReview("ml-prelife-0004"), lifeScore: 1, replay: true };
    expect(a.lifeScore).toBe(2);
    expect(a.replay).toBe(false);
    expect(b.lifeScore).toBe(1);
    expect(b.replay).toBe(true);
    const found = findMachineLifeReview([a, b], "ml-prelife-0002");
    expect(found?.replay).toBe(false);
  });

  it("summarizes the real 25-recording collection with the expected category distribution", () => {
    const collection = realCollection();
    const summary = summarizeMachineLifeCollection(collection, [], undefined);
    expect(summary.recordingCount).toBe(25);
    expect(summary.categoryDistribution).toEqual({
      signal: 3, pulse: 4, texture: 4, environment: 3, gesture: 3, collision: 3, structure: 3, "free-dream": 2,
    });
    expect(summary.lifeDistribution.unreviewed).toBe(25);
    expect(summary.preLifeProxiesExpected).toBe(25);
    expect(summary.rawProxiesExpected).toBe(8);
    expect(summary.preLifeProxiesAvailable).toBe(0);
    expect(summary.validationWarnings.length).toBeGreaterThan(0);
  });

  it("never excludes Life 0 or dormant recordings from filtering — they remain visible and reviewable", () => {
    const collection = realCollection();
    const reviews: MachineLifeRecordingReview[] = [
      { ...createEmptyMachineLifeReview("ml-prelife-0001"), lifeScore: 0, disposition: "dormant" },
    ];
    const all = filterMachineLifeRecordings(collection.recordings, reviews, undefined, {});
    expect(all.some((r) => r.id === "ml-prelife-0001")).toBe(true);
    const life0 = filterMachineLifeRecordings(collection.recordings, reviews, undefined, { life: 0 });
    expect(life0.map((r) => r.id)).toEqual(["ml-prelife-0001"]);
    const dormant = filterMachineLifeRecordings(collection.recordings, reviews, undefined, { disposition: "dormant" });
    expect(dormant.map((r) => r.id)).toEqual(["ml-prelife-0001"]);
  });

  it("filters by category, mode, and reviewed/unreviewed status", () => {
    const collection = realCollection();
    const signals = filterMachineLifeRecordings(collection.recordings, [], undefined, { category: "signal" });
    expect(signals).toHaveLength(3);
    const layers = filterMachineLifeRecordings(collection.recordings, [], undefined, { mode: "layer" });
    expect(layers).toHaveLength(12);
    const reviewed = filterMachineLifeRecordings(
      collection.recordings,
      [{ ...createEmptyMachineLifeReview("ml-prelife-0001"), lifeScore: 2 }],
      undefined,
      { reviewStatus: "reviewed" },
    );
    expect(reviewed.map((r) => r.id)).toEqual(["ml-prelife-0001"]);
  });

  it("reports audio availability honestly — false when no proxy library is loaded, true only for stems actually present", () => {
    const collection = realCollection();
    const rec = collection.recordings.find((r) => r.id === "ml-prelife-0001")!;
    expect(preLifeProxyAvailable(rec, undefined)).toBe(false);

    const proxyLibrary: MachineLifeProxyLibrary = {
      collectionId: collection.id,
      proxies: [
        { kind: "pre-life", stem: "ml-prelife-0001-signal-seed-8001", proxyFileName: "ml-prelife-0001-signal-seed-8001.mp3", audioRelPath: "machine-life/pre-life/ml-prelife-0001-signal-seed-8001.mp3", importedAt: "2026-08-11T00:00:00.000Z", durationSeconds: 12 },
      ],
      issues: [],
    };
    expect(preLifeProxyAvailable(rec, proxyLibrary)).toBe(true);
    const rec2 = collection.recordings.find((r) => r.id === "ml-prelife-0002")!;
    expect(preLifeProxyAvailable(rec2, proxyLibrary)).toBe(false);
  });

  it("flags repeated direct ancestors provably from source_uses alone (e.g. shared siren/drone lineage)", () => {
    const collection = realCollection();
    const warnings = repeatedDirectAncestorWarnings(collection);
    expect(warnings.length).toBeGreaterThan(0);
    // Every flagged filename must actually be referenced by 2+ distinct
    // recordings — no expanded/inferred ancestry claimed.
    for (const w of warnings) {
      expect(w.recordingIds.length).toBeGreaterThan(1);
      const actualReferrers = collection.recordings.filter((r) => r.sourceUses.some((u) => u.filename === w.sourceFilename));
      expect(actualReferrers.map((r) => r.id).sort()).toEqual(w.recordingIds);
    }
  });
});
