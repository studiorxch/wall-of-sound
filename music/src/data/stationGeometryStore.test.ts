import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  saveStationGeometryToDB,
  loadStationGeometryFromDB,
  listStationGeometriesFromDB,
  isPlausibleStationGeometryData,
} from "./stationGeometryStore";
import { buildBayRidgeAvStationGeometrySeed } from "../logic/maps/stationGeometryBayRidgeAvSeed";
import type { StationGeometryData } from "./stationGeometryTypes";

// This codebase deliberately has no fake-indexeddb infrastructure — see
// maps/racetrackCoursePackageStorage.test.ts's own comment. Same minimal,
// single-purpose in-memory stub pattern reused here (not a shared testing
// utility), scoped to exactly what this file's round-trip tests need.
class FakeIDBRequest<T = unknown> {
  onsuccess: ((e: { target: FakeIDBRequest<T> }) => void) | null = null;
  onerror: ((e: { target: FakeIDBRequest<T> }) => void) | null = null;
  result: T | undefined;
  error: unknown = null;
  _resolve(result: T): void {
    this.result = result;
    queueMicrotask(() => this.onsuccess?.({ target: this }));
  }
}

function installFakeIndexedDB(): () => void {
  const previous = (globalThis as { indexedDB?: unknown }).indexedDB;
  const rows = new Map<string, StationGeometryData>();
  const objectStore = {
    put: (record: StationGeometryData) => {
      const req = new FakeIDBRequest<undefined>();
      rows.set(record.id, record);
      req._resolve(undefined);
      return req;
    },
    get: (id: string) => {
      const req = new FakeIDBRequest<StationGeometryData | undefined>();
      req._resolve(rows.get(id));
      return req;
    },
    getAll: () => {
      const req = new FakeIDBRequest<StationGeometryData[]>();
      req._resolve([...rows.values()]);
      return req;
    },
    delete: (id: string) => {
      const req = new FakeIDBRequest<undefined>();
      rows.delete(id);
      req._resolve(undefined);
      return req;
    },
  };
  const fakeDb = {
    objectStoreNames: { contains: () => true },
    createObjectStore: () => objectStore,
    onclose: null,
    transaction: () => ({ objectStore: () => objectStore }),
  };
  (globalThis as { indexedDB?: unknown }).indexedDB = {
    open: () => {
      const req = new FakeIDBRequest<typeof fakeDb>();
      req._resolve(fakeDb);
      return req;
    },
  };
  return () => {
    (globalThis as { indexedDB?: unknown }).indexedDB = previous;
  };
}

describe("isPlausibleStationGeometryData", () => {
  it("accepts a real Bay Ridge Av seed record", () => {
    expect(isPlausibleStationGeometryData(buildBayRidgeAvStationGeometrySeed())).toBe(true);
  });

  it("rejects null, non-objects, and objects missing required array fields", () => {
    expect(isPlausibleStationGeometryData(null)).toBe(false);
    expect(isPlausibleStationGeometryData("stationGeometry:R42")).toBe(false);
    expect(isPlausibleStationGeometryData({ id: "stationGeometry:R42" })).toBe(false);
  });

  it("rejects an id that doesn't use the canonical stationGeometry: namespace", () => {
    const seed = buildBayRidgeAvStationGeometrySeed();
    expect(isPlausibleStationGeometryData({ ...seed, id: "not-canonical" })).toBe(false);
  });

  it("rejects a record missing evidenceConflicts", () => {
    const { evidenceConflicts: _omitted, ...withoutConflicts } = buildBayRidgeAvStationGeometrySeed();
    expect(isPlausibleStationGeometryData(withoutConflicts)).toBe(false);
  });
});

describe("station geometry persistence round trip (save -> reload)", () => {
  let restoreIndexedDB: (() => void) | null = null;

  beforeEach(() => {
    restoreIndexedDB = installFakeIndexedDB();
  });

  afterEach(() => {
    restoreIndexedDB?.();
    restoreIndexedDB = null;
  });

  it("reloads the exact same topology and provenance after a save, for the real Bay Ridge Av seed", async () => {
    const seed = buildBayRidgeAvStationGeometrySeed("2026-09-08T00:00:00.000Z");
    await saveStationGeometryToDB(seed);

    const reloaded = await loadStationGeometryFromDB(seed.id);
    expect(reloaded).not.toBeNull();
    // updatedAt is intentionally stamped fresh on save — compare everything else exactly.
    const { updatedAt: _seedUpdatedAt, ...seedRest } = seed;
    const { updatedAt: _reloadedUpdatedAt, ...reloadedRest } = reloaded!;
    expect(reloadedRest).toEqual(seedRest);
    expect(reloaded!.platforms).toEqual(seed.platforms);
    expect(reloaded!.trackCenterlines).toEqual(seed.trackCenterlines);
    expect(reloaded!.platformLinks).toEqual(seed.platformLinks);
  });

  it("preserves the platform-width evidence conflict — status, every conflicting evidence ref, and note — through a save/reload cycle", async () => {
    const seed = buildBayRidgeAvStationGeometrySeed("2026-09-08T00:00:00.000Z");
    await saveStationGeometryToDB(seed);

    const reloaded = await loadStationGeometryFromDB(seed.id);
    expect(reloaded!.evidenceConflicts).toEqual(seed.evidenceConflicts);
    expect(reloaded!.evidenceConflicts).toHaveLength(1);
    expect(reloaded!.evidenceConflicts[0].status).toBe(seed.evidenceConflicts[0].status);
    expect(reloaded!.evidenceConflicts[0].conflictingEvidence.length).toBeGreaterThanOrEqual(2);
  });

  it("preserves both side-specific stair connections — relatedPlatformId and each side's distinct circulation note — through a save/reload cycle", async () => {
    const seed = buildBayRidgeAvStationGeometrySeed("2026-09-09T00:00:00.000Z");
    const northboundPlatformId = seed.platforms.find((p) => p.id.includes("northbound"))!.id;
    const southboundPlatformId = seed.platforms.find((p) => p.id.includes("southbound"))!.id;
    await saveStationGeometryToDB(seed);

    const reloaded = await loadStationGeometryFromDB(seed.id);
    expect(reloaded!.connections).toEqual(seed.connections);
    const stairConnections = reloaded!.connections.filter((c) => c.kind === "stairs");
    expect(stairConnections).toHaveLength(2);
    const reloadedNorthbound = stairConnections.find((c) => c.relatedPlatformId === northboundPlatformId)!;
    const reloadedSouthbound = stairConnections.find((c) => c.relatedPlatformId === southboundPlatformId)!;
    expect(reloadedNorthbound).toBeDefined();
    expect(reloadedSouthbound).toBeDefined();
    expect(reloadedNorthbound.provenance.note).toMatch(/preserving two circulation lanes/);
    expect(reloadedSouthbound.provenance.note).toMatch(/one main circulation lane/);
  });

  it("preserves an editor-authored override of one platform's footprint, and an explicit clear-to-undefined on the other, through a save/reload cycle", async () => {
    // As of checkpoint 5 (Calibration Pass 01) the seed itself already ships
    // real, OSM-sourced footprints for both platforms — so the meaningful
    // round-trip case is no longer "undefined -> real polygon" on a bare
    // seed, but a real editor session: overriding one platform's OSM
    // footprint with a user-drawn polygon, and explicitly clearing the
    // other (the editor's own "Clear" button) back to genuinely unauthored.
    const seed = buildBayRidgeAvStationGeometrySeed("2026-09-08T00:00:00.000Z");
    expect(seed.platforms[0].footprint).toBeDefined(); // sanity: seed really does ship a default now
    const authored: StationGeometryData = {
      ...seed,
      platforms: seed.platforms.map((p, i) =>
        i === 0
          ? { ...p, footprint: [{ x: -50, y: 3 }, { x: 50, y: 3 }, { x: 50, y: 6 }, { x: -50, y: 6 }] }
          : { ...p, footprint: undefined },
      ),
    };
    await saveStationGeometryToDB(authored);

    const reloaded = await loadStationGeometryFromDB(authored.id);
    expect(reloaded!.platforms[0].footprint).toEqual([
      { x: -50, y: 3 },
      { x: 50, y: 3 },
      { x: 50, y: 6 },
      { x: -50, y: 6 },
    ]);
    // The explicitly-cleared platform must reload as genuinely unauthored, not [].
    expect(reloaded!.platforms[1].footprint).toBeUndefined();
    // A field this test never touched at all stays exactly as the seed shipped it.
    expect(reloaded!.connections[0].localPath).toBeUndefined();
  });

  it("returns null for an id that was never saved", async () => {
    expect(await loadStationGeometryFromDB("stationGeometry:doesNotExist")).toBeNull();
  });

  it("lists every saved record", async () => {
    const seed = buildBayRidgeAvStationGeometrySeed("2026-09-08T00:00:00.000Z");
    await saveStationGeometryToDB(seed);
    const all = await listStationGeometriesFromDB();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(seed.id);
  });
});
