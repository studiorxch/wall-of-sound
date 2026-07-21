import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { reserveRadioLoopId, releaseReservation, findReservation, withRadioIdLock } from "./radioIdAssigner";
import { writeJsonAtomic } from "./radioFsUtils";
import type { RadioCatalogManifest } from "../../src/data/radioLoopTypes";

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "radio-id-assigner-"));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("reserveRadioLoopId", () => {
  it("allocates rloop_000001 v1 for the first-ever source", async () => {
    const alloc = await reserveRadioLoopId(root, "op1", "track_a", "loop_a");
    expect(alloc).toEqual({ radioLoopId: "rloop_000001", packageVersion: 1 });
  });

  it("allocates a distinct sequential id for a different source", async () => {
    await reserveRadioLoopId(root, "op1", "track_a", "loop_a");
    const alloc2 = await reserveRadioLoopId(root, "op2", "track_b", "loop_b");
    expect(alloc2).toEqual({ radioLoopId: "rloop_000002", packageVersion: 1 });
  });

  it("reuses the same radioLoopId and bumps version on re-promotion of the same source", async () => {
    const first = await reserveRadioLoopId(root, "op1", "track_a", "loop_a");
    const second = await reserveRadioLoopId(root, "op2", "track_a", "loop_a");
    expect(second.radioLoopId).toBe(first.radioLoopId);
    expect(second.packageVersion).toBe(first.packageVersion + 1);
  });

  it("picks up the next id after an existing manifest entry", async () => {
    const manifest: RadioCatalogManifest = {
      schemaVersion: "1.0.0",
      generatedAt: new Date().toISOString(),
      entries: [
        { radioLoopId: "rloop_000005", packageVersion: 2, status: "RADIO_READY", source: { trackId: "track_x", loopId: "loop_x" }, relativePackagePath: "packages/rloop_000005/v2" },
      ],
    };
    writeJsonAtomic(path.join(root, "catalog", "local-manifest.json"), manifest);

    const alloc = await reserveRadioLoopId(root, "op1", "track_new", "loop_new");
    expect(alloc).toEqual({ radioLoopId: "rloop_000006", packageVersion: 1 });

    const reReleased = await reserveRadioLoopId(root, "op2", "track_x", "loop_x");
    expect(reReleased).toEqual({ radioLoopId: "rloop_000005", packageVersion: 3 });
  });

  it("never allocates the same id to two concurrent different-source requests", async () => {
    const [a, b] = await Promise.all([
      reserveRadioLoopId(root, "op1", "track_a", "loop_a"),
      reserveRadioLoopId(root, "op2", "track_b", "loop_b"),
    ]);
    expect(a.radioLoopId).not.toBe(b.radioLoopId);
    expect(new Set([a.radioLoopId, b.radioLoopId]).size).toBe(2);
  });

  it("never allocates the same version to two concurrent same-source requests", async () => {
    const [a, b] = await Promise.all([
      reserveRadioLoopId(root, "op1", "track_a", "loop_a"),
      reserveRadioLoopId(root, "op2", "track_a", "loop_a"),
    ]);
    expect(a.radioLoopId).toBe(b.radioLoopId);
    expect(new Set([a.packageVersion, b.packageVersion]).size).toBe(2);
  });

  it("serializes many concurrent allocations for the same source with zero collisions", async () => {
    const ops = Array.from({ length: 12 }, (_, i) => `op${i}`);
    const results = await Promise.all(ops.map((opId) => reserveRadioLoopId(root, opId, "track_a", "loop_a")));
    const versions = results.map((r) => r.packageVersion).sort((x, y) => x - y);
    expect(versions).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    expect(new Set(results.map((r) => r.radioLoopId)).size).toBe(1);
  });
});

describe("reserveRadioLoopId (0717A — disk-authoritative fallback)", () => {
  it("finds an existing RadioLoop ID on disk even when absent from the manifest", async () => {
    // Simulates 0717A's manifest-builder suppression: a package exists on
    // disk for (track_a, loop_a) but the manifest has no entry for it.
    writeJsonAtomic(path.join(root, "packages", "rloop_000005", "v1", "metadata.json"), {
      schemaVersion: "1.0.0", radioLoopId: "rloop_000005", packageVersion: 1, status: "RETIRED",
      source: { trackId: "track_a", loopId: "loop_a" },
      audio: { primary: { codec: "opus", container: "ogg", mimeType: "audio/ogg; codecs=opus", relativePath: "core.opus", bitrateKbps: 128, channels: 2, durationSeconds: 1 }, variants: [] },
      musical: {}, arrangement: { roles: [], familyIds: [] }, approval: { publicUseApproved: true, approvedAt: new Date().toISOString() },
    });

    const alloc = await reserveRadioLoopId(root, "op1", "track_a", "loop_a");
    expect(alloc.radioLoopId).toBe("rloop_000005");
    expect(alloc.packageVersion).toBe(2);
  });

  it("never allocates a version number that already exists on disk, even when the manifest lags", async () => {
    writeJsonAtomic(path.join(root, "packages", "rloop_000001", "v1", "metadata.json"), {
      schemaVersion: "1.0.0", radioLoopId: "rloop_000001", packageVersion: 1, status: "RADIO_READY",
      source: { trackId: "track_a", loopId: "loop_a" },
      audio: { primary: { codec: "opus", container: "ogg", mimeType: "audio/ogg; codecs=opus", relativePath: "core.opus", bitrateKbps: 128, channels: 2, durationSeconds: 1 }, variants: [] },
      musical: {}, arrangement: { roles: [], familyIds: [] }, approval: { publicUseApproved: true, approvedAt: new Date().toISOString() },
    });
    writeJsonAtomic(path.join(root, "packages", "rloop_000001", "v2", "metadata.json"), {
      schemaVersion: "1.0.0", radioLoopId: "rloop_000001", packageVersion: 2, status: "RADIO_READY",
      source: { trackId: "track_a", loopId: "loop_a" },
      audio: { primary: { codec: "opus", container: "ogg", mimeType: "audio/ogg; codecs=opus", relativePath: "core.opus", bitrateKbps: 128, channels: 2, durationSeconds: 1 }, variants: [] },
      musical: {}, arrangement: { roles: [], familyIds: [] }, approval: { publicUseApproved: true, approvedAt: new Date().toISOString() },
    });
    // Manifest only knows about v1 — stale relative to disk.
    const manifest: RadioCatalogManifest = {
      schemaVersion: "1.0.0", generatedAt: new Date().toISOString(),
      entries: [{ radioLoopId: "rloop_000001", packageVersion: 1, status: "RADIO_READY", source: { trackId: "track_a", loopId: "loop_a" }, relativePackagePath: "packages/rloop_000001/v1" }],
    };
    writeJsonAtomic(path.join(root, "catalog", "local-manifest.json"), manifest);

    const alloc = await reserveRadioLoopId(root, "op1", "track_a", "loop_a");
    expect(alloc.packageVersion).toBe(3);
  });
});

describe("releaseReservation / findReservation", () => {
  it("removes exactly the matching reservation", async () => {
    await reserveRadioLoopId(root, "op1", "track_a", "loop_a");
    await reserveRadioLoopId(root, "op2", "track_b", "loop_b");
    await releaseReservation(root, "op1");
    expect(findReservation(root, "op1")).toBeNull();
    expect(findReservation(root, "op2")).not.toBeNull();
  });
});

describe("withRadioIdLock", () => {
  it("runs queued work strictly in FIFO order", async () => {
    const order: number[] = [];
    const tasks = [1, 2, 3, 4, 5].map((n) =>
      withRadioIdLock(async () => {
        await new Promise((r) => setTimeout(r, Math.random() * 5));
        order.push(n);
      }),
    );
    await Promise.all(tasks);
    expect(order).toEqual([1, 2, 3, 4, 5]);
  });
});
