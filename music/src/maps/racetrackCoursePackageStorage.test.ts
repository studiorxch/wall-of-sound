import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  isImmutablePackageOverwriteAttempt,
  saveRacetrackCoursePackageToDB,
  loadRacetrackCoursePackageFromDB,
} from "./racetrackCoursePackageStorage";
import type { RacetrackCoursePackage } from "../data/racetrackCoursePackageTypes";

// This codebase deliberately has no fake-indexeddb infrastructure — every
// other *StorageToDB module's actual IDB plumbing is live-verification-only
// (see the comment atop racetrackCoursePackageStorage.ts). The §5 retention
// invariant ("an older published package stays readable after a newer one
// is saved under a DIFFERENT id") is specifically a cross-key storage
// behavior, so unlike isImmutablePackageOverwriteAttempt it can't be
// extracted into a pure function — it has to go through real save/load
// calls. This minimal in-memory stub exists ONLY for that one test below;
// it is not a shared testing utility and should not be extended.
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
  const rows = new Map<string, RacetrackCoursePackage>();
  const objectStore = {
    put: (record: RacetrackCoursePackage) => {
      const req = new FakeIDBRequest<undefined>();
      rows.set(record.id, record);
      req._resolve(undefined);
      return req;
    },
    get: (id: string) => {
      const req = new FakeIDBRequest<RacetrackCoursePackage | undefined>();
      req._resolve(rows.get(id));
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

function makePackage(overrides: Partial<RacetrackCoursePackage> = {}): RacetrackCoursePackage {
  return {
    id: "pkg1", slug: "test", name: "Test Course", version: 1,
    sourceRaceCourseId: "race1", sourceRaceCourseFingerprint: "fp1",
    route: { type: "LineString", coordinates: [[-74, 40.7], [-74.01, 40.71]] },
    progressSamples: [], previewRoute: [],
    start: { distanceMeters: 0, coordinate: [-74, 40.7], headingDeg: 0 },
    finish: { distanceMeters: 100, coordinate: [-74.01, 40.71], headingDeg: 0 },
    checkpoints: [],
    routePresentation: { lineColor: "#ff6a3d", lineWidthPx: 3, previewMode: "guide" },
    cameraAnchors: [],
    presentationReady: true, runtimeReady: true, warnings: [],
    providerSource: "mapbox",
    createdAt: 0, publishedAt: 0,
    ...overrides,
  };
}

describe("isImmutablePackageOverwriteAttempt", () => {
  it("is never an overwrite attempt when no existing record exists (a real first-time insert)", () => {
    expect(isImmutablePackageOverwriteAttempt(null, makePackage())).toBe(false);
  });

  it("is NOT an overwrite attempt when the incoming record is byte-identical to the existing one (a harmless re-save)", () => {
    const existing = makePackage();
    const incoming = makePackage(); // structurally identical, different object reference
    expect(isImmutablePackageOverwriteAttempt(existing, incoming)).toBe(false);
  });

  it("IS an overwrite attempt when the incoming record differs from the existing one under the SAME id", () => {
    const existing = makePackage({ version: 1 });
    const incoming = makePackage({ version: 2 }); // same id, different content
    expect(isImmutablePackageOverwriteAttempt(existing, incoming)).toBe(true);
  });

  it("flags even a tiny field difference (e.g. a mutated route coordinate) as an overwrite attempt", () => {
    const existing = makePackage();
    const incoming = makePackage({ route: { type: "LineString", coordinates: [[-74, 40.7], [-74.02, 40.72]] } });
    expect(isImmutablePackageOverwriteAttempt(existing, incoming)).toBe(true);
  });
});

describe("published package retention (0805G §5)", () => {
  let restoreIndexedDB: (() => void) | null = null;

  beforeEach(() => {
    restoreIndexedDB = installFakeIndexedDB();
  });

  afterEach(() => {
    restoreIndexedDB?.();
    restoreIndexedDB = null;
  });

  it("keeps an older published package readable by id after a newer, different-id version is saved", async () => {
    const packageA = makePackage({ id: "pkg-a", version: 1, sourceRaceCourseFingerprint: "fp-a" });
    await saveRacetrackCoursePackageToDB(packageA);

    const packageB = makePackage({ id: "pkg-b", version: 2, sourceRaceCourseFingerprint: "fp-b" });
    await saveRacetrackCoursePackageToDB(packageB);

    const reloadedA = await loadRacetrackCoursePackageFromDB("pkg-a");
    expect(reloadedA).toEqual(packageA);

    const reloadedB = await loadRacetrackCoursePackageFromDB("pkg-b");
    expect(reloadedB).toEqual(packageB);
  });
});
