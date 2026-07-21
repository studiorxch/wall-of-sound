// 0718B — RadioTrack ID/version allocation: shared-mutex concurrency
// safety (spec test 4) and same-source identity reuse.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { reserveRadioTrackId, releaseTrackReservation, readTrackReservations, findExistingRadioTrackId } from "./radioTrackIdAssigner";

let trackLib: string;

beforeEach(() => {
  trackLib = fs.mkdtempSync(path.join(os.tmpdir(), "radio-track-id-"));
});

afterEach(() => {
  fs.rmSync(trackLib, { recursive: true, force: true });
});

describe("reserveRadioTrackId — concurrency", () => {
  it("concurrent reservations for DIFFERENT source tracks never collide on an ID", async () => {
    const allocations = await Promise.all(
      Array.from({ length: 8 }, (_, i) => reserveRadioTrackId(trackLib, `op-${i}`, `track_${i}`)),
    );
    const ids = allocations.map((a) => a.radioTrackId);
    expect(new Set(ids).size).toBe(8);
    expect(allocations.every((a) => a.packageVersion === 1)).toBe(true);
  });

  it("concurrent reservations for the SAME source track share one ID with distinct versions", async () => {
    const allocations = await Promise.all(
      Array.from({ length: 5 }, (_, i) => reserveRadioTrackId(trackLib, `op-${i}`, "track_same")),
    );
    const ids = new Set(allocations.map((a) => a.radioTrackId));
    expect(ids.size).toBe(1);
    const versions = allocations.map((a) => a.packageVersion).sort((a, b) => a - b);
    expect(versions).toEqual([1, 2, 3, 4, 5]);
  });

  it("releaseTrackReservation removes exactly one operation's reservation", async () => {
    await reserveRadioTrackId(trackLib, "op-a", "track_a");
    await reserveRadioTrackId(trackLib, "op-b", "track_b");
    await releaseTrackReservation(trackLib, "op-a");
    const remaining = readTrackReservations(trackLib);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].operationId).toBe("op-b");
  });

  it("findExistingRadioTrackId sees in-flight reservations before any package lands", async () => {
    const first = await reserveRadioTrackId(trackLib, "op-a", "track_a");
    expect(findExistingRadioTrackId(trackLib, "track_a")).toBe(first.radioTrackId);
    expect(findExistingRadioTrackId(trackLib, "track_unknown")).toBeNull();
  });
});
