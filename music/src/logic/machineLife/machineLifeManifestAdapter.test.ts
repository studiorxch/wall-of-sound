import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  computeMachineLifeCollectionId,
  isSupportedManifestSchema,
  parseMachineLifeManifestText,
  stageMachineLifeManifestImport,
  commitMachineLifeManifestImport,
  validateMachineLifeManifest,
} from "./machineLifeManifestAdapter";
import type { MachineLifeCollection } from "../../data/machineLifeTypes";

// Real evidence, not fixtures: reads the actual WOS Share Pre-Life manifest
// mirrored from Machine Life Stage 0 research (0811_MACHINE-LIFE_MUSIC-
// Research-Workspace-Handoff_v1.0.0 acceptance tests 1-4, 15-16).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REAL_MANIFEST_PATH = path.resolve(
  __dirname,
  "../../../../WOS-share/MACHINE_LIFE/REFERENCE/MANIFESTS/stage-00-pre-life-manifest.json",
);
const REAL_MANIFEST_TEXT = readFileSync(REAL_MANIFEST_PATH, "utf-8");

describe("machineLifeManifestAdapter — real stage-00-pre-life-manifest.json", () => {
  it("parses and confirms the supported schema", () => {
    const parsed = parseMachineLifeManifestText(REAL_MANIFEST_TEXT);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(isSupportedManifestSchema(parsed.raw)).toBe(true);
    expect(parsed.raw.schema).toBe("machine-life-stage-00-pre-life-manifest-v1");
  });

  it("validates all fields and produces exactly 25 stable, unique recording IDs", () => {
    const parsed = parseMachineLifeManifestText(REAL_MANIFEST_TEXT);
    if (!parsed.ok) throw new Error("expected parse ok");
    const result = validateMachineLifeManifest(parsed.raw);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.recordings).toHaveLength(25);
    const ids = result.recordings.map((r) => r.id);
    expect(new Set(ids).size).toBe(25);
    expect(ids).toContain("ml-prelife-0001");
    expect(ids).toContain("ml-prelife-0025");
  });

  it("confirms the required category distribution", () => {
    const parsed = parseMachineLifeManifestText(REAL_MANIFEST_TEXT);
    if (!parsed.ok) throw new Error("expected parse ok");
    const result = validateMachineLifeManifest(parsed.raw);
    const counts: Record<string, number> = {};
    for (const r of result.recordings) counts[r.category] = (counts[r.category] ?? 0) + 1;
    expect(counts).toEqual({
      signal: 3, pulse: 4, texture: 4, environment: 3, gesture: 3, collision: 3, structure: 3, "free-dream": 2,
    });
  });

  it("preserves seed, duration, canonical checksum, and direct source uses exactly as manifested", () => {
    const parsed = parseMachineLifeManifestText(REAL_MANIFEST_TEXT);
    if (!parsed.ok) throw new Error("expected parse ok");
    const result = validateMachineLifeManifest(parsed.raw);
    const rec0001 = result.recordings.find((r) => r.id === "ml-prelife-0001")!;
    expect(rec0001.seed).toBe(8001);
    expect(rec0001.durationSeconds).toBe(12);
    expect(rec0001.canonicalFilename).toBe("ml-prelife-0001-signal-seed-8001.wav");
    expect(rec0001.canonicalChecksumSha256).toBe("aeb619b40c3a6686f105f472f2f3ff5d0ff3044637534a2a258ba2584b8b53c2");
    expect(rec0001.sourceUses).toHaveLength(3);
    expect(rec0001.sourceUses[0]).toEqual({
      filename: "ml-src-0013-square-c3.wav",
      collection: "primitive",
      sha256: "6df5ba3a7898e34a6639c5d0ea94a3c88b2d50b6443f3091e7a0305052aa766b",
      startSeconds: 7.393749,
    });
  });

  it("produces 8 raw sources from source_inventory", () => {
    const parsed = parseMachineLifeManifestText(REAL_MANIFEST_TEXT);
    if (!parsed.ok) throw new Error("expected parse ok");
    const result = validateMachineLifeManifest(parsed.raw);
    expect(result.rawSources).toHaveLength(8);
    expect(result.rawSources.map((s) => s.filename)).toContain("ml-sr-0001-drone-hypnotic-engine.wav");
  });

  it("computes a stable collection id across repeated parses of the same manifest", () => {
    const p1 = parseMachineLifeManifestText(REAL_MANIFEST_TEXT);
    const p2 = parseMachineLifeManifestText(REAL_MANIFEST_TEXT);
    if (!p1.ok || !p2.ok) throw new Error("expected parse ok");
    const v1 = validateMachineLifeManifest(p1.raw);
    const v2 = validateMachineLifeManifest(p2.raw);
    expect(computeMachineLifeCollectionId(p1.raw, v1.recordings)).toBe(computeMachineLifeCollectionId(p2.raw, v2.recordings));
  });

  it("stages the real manifest successfully with no existing collections", () => {
    const result = stageMachineLifeManifestImport(
      REAL_MANIFEST_TEXT,
      "WOS-share/MACHINE_LIFE/REFERENCE/MANIFESTS/stage-00-pre-life-manifest.json",
      [],
      "2026-08-11T00:00:00.000Z",
    );
    expect(result.status).toBe("staged");
    if (result.status !== "staged") return;
    expect(result.collection.recordings).toHaveLength(25);
    expect(result.collection.rawSources).toHaveLength(8);
  });

  it("rejects an unsupported schema without partial commit", () => {
    const badManifest = JSON.stringify({ ...JSON.parse(REAL_MANIFEST_TEXT), schema: "some-other-schema-v9" });
    const result = stageMachineLifeManifestImport(badManifest, "irrelevant.json", [], "2026-08-11T00:00:00.000Z");
    expect(result.status).toBe("rejected_schema");
  });

  it("rejects malformed JSON without throwing", () => {
    const result = stageMachineLifeManifestImport("{not valid json", "irrelevant.json", [], "2026-08-11T00:00:00.000Z");
    expect(result.status).toBe("rejected_schema");
  });

  it("rejects a manifest missing required fields, reporting errors, without producing a collection", () => {
    const broken = JSON.parse(REAL_MANIFEST_TEXT);
    delete broken.recordings[0].seed;
    const result = stageMachineLifeManifestImport(JSON.stringify(broken), "irrelevant.json", [], "2026-08-11T00:00:00.000Z");
    expect(result.status).toBe("rejected_invalid");
    if (result.status !== "rejected_invalid") return;
    expect(result.errors.some((e) => e.includes("seed"))).toBe(true);
  });

  it("detects a duplicate collection/version import and does not create a duplicate record", () => {
    const first = stageMachineLifeManifestImport(REAL_MANIFEST_TEXT, "irrelevant.json", [], "2026-08-11T00:00:00.000Z");
    if (first.status !== "staged") throw new Error("expected staged");
    const committed: MachineLifeCollection[] = commitMachineLifeManifestImport([], first.collection);
    expect(committed).toHaveLength(1);

    const second = stageMachineLifeManifestImport(REAL_MANIFEST_TEXT, "irrelevant.json", committed, "2026-08-11T01:00:00.000Z");
    expect(second.status).toBe("duplicate");
    if (second.status !== "duplicate") return;
    expect(second.existingCollectionId).toBe(first.collection.id);
    // commitMachineLifeManifestImport is itself idempotent by id — even a
    // caller that ignores the "duplicate" status and commits anyway must not
    // end up with two records for the same collection.
    const recommitted = commitMachineLifeManifestImport(committed, first.collection);
    expect(recommitted.filter((c) => c.id === first.collection.id)).toHaveLength(1);
    expect(recommitted).toHaveLength(1);
  });
});
