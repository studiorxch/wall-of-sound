// RadioLoop Library Foundation — stable RadioLoop ID + package version
// allocation (build spec §4.4). Node-only.
//
// Correction #3 (plan review): two simultaneous promotions must never be
// allocated the same ID or version. Since `vite dev` is a single Node
// process, an in-process async mutex (withRadioIdLock) fully serializes
// allocation across concurrent HTTP requests; a persisted reservation file
// (catalog/id-reservations.json, written atomically) makes an in-flight
// allocation visible to the NEXT request even while the current operation
// is still encoding/finalizing — the manifest alone isn't enough, because
// an operation's package doesn't land in the manifest until it finalizes,
// possibly minutes after its ID was allocated.

import path from "node:path";
import { readJsonSafe, writeJsonAtomic, listSubdirNames } from "./radioFsUtils";
import { walkPackageVersions } from "./radioPackageDirectoryWalker";
import {
  formatRadioLoopId,
  parseRadioLoopIdSequence,
  type RadioCatalogManifest,
  type RadioLoopId,
  type RadioPackageVersion,
} from "../../src/data/radioLoopTypes";

export interface RadioIdReservation {
  operationId: string;
  radioLoopId: RadioLoopId;
  packageVersion: RadioPackageVersion;
  sourceTrackId: string;
  sourceLoopId: string;
  reservedAt: string;
}

export interface RadioIdAllocation {
  radioLoopId: RadioLoopId;
  packageVersion: RadioPackageVersion;
}

function manifestPath(radioLibraryRoot: string): string {
  return path.join(radioLibraryRoot, "catalog", "local-manifest.json");
}

function reservationsPath(radioLibraryRoot: string): string {
  return path.join(radioLibraryRoot, "catalog", "id-reservations.json");
}

function packagesDir(radioLibraryRoot: string): string {
  return path.join(radioLibraryRoot, "packages");
}

export function readReservations(radioLibraryRoot: string): RadioIdReservation[] {
  return readJsonSafe<RadioIdReservation[]>(reservationsPath(radioLibraryRoot)) ?? [];
}

function writeReservations(radioLibraryRoot: string, reservations: RadioIdReservation[]): void {
  writeJsonAtomic(reservationsPath(radioLibraryRoot), reservations);
}

// Fallback source of truth when the manifest is missing or fails to parse
// — a valid package directory always exists on disk even if manifest
// generation previously failed (build spec §4.4: "never derive identity
// solely from a filename," but a directory NAME under packages/ is exactly
// the stable radioLoopId itself, not a derived guess).
function scanPackageIdsFromDisk(radioLibraryRoot: string): RadioLoopId[] {
  return listSubdirNames(packagesDir(radioLibraryRoot));
}

function highestKnownSequence(radioLibraryRoot: string, manifest: RadioCatalogManifest | null, reservations: RadioIdReservation[]): number {
  const ids: string[] = [
    ...(manifest?.entries.map((e) => e.radioLoopId) ?? []),
    ...reservations.map((r) => r.radioLoopId),
    ...scanPackageIdsFromDisk(radioLibraryRoot),
  ];
  let highest = 0;
  for (const id of ids) {
    const seq = parseRadioLoopIdSequence(id);
    if (seq != null && seq > highest) highest = seq;
  }
  return highest;
}

// 0717A — also consults disk (walkPackageVersions), not just the manifest
// and reservations. Necessary because of 0717A's own manifest-builder
// change (radioManifestBuilder.ts): once a RadioLoop's highest version is
// RETIRED, the ENTIRE RadioLoop is suppressed from the manifest, so the
// manifest alone can no longer be trusted to reflect the true highest
// version on disk for a loop being cloned forward again (metadata revision
// or a — currently unsupported — second retirement attempt). Disk is the
// ultimate source of truth for what package versions actually exist.
function highestKnownVersionForId(radioLibraryRoot: string, radioLoopId: RadioLoopId, manifest: RadioCatalogManifest | null, reservations: RadioIdReservation[]): number {
  let highest = 0;
  for (const entry of manifest?.entries ?? []) {
    if (entry.radioLoopId === radioLoopId && entry.packageVersion > highest) highest = entry.packageVersion;
  }
  for (const r of reservations) {
    if (r.radioLoopId === radioLoopId && r.packageVersion > highest) highest = r.packageVersion;
  }
  for (const v of walkPackageVersions(radioLibraryRoot, radioLoopId)) {
    if (v.packageVersion > highest) highest = v.packageVersion;
  }
  return highest;
}

function findExistingRadioLoopId(radioLibraryRoot: string, sourceTrackId: string, sourceLoopId: string, manifest: RadioCatalogManifest | null, reservations: RadioIdReservation[]): RadioLoopId | null {
  const fromManifest = manifest?.entries.find((e) => e.source.trackId === sourceTrackId && e.source.loopId === sourceLoopId);
  if (fromManifest) return fromManifest.radioLoopId;
  const fromReservation = reservations.find((r) => r.sourceTrackId === sourceTrackId && r.sourceLoopId === sourceLoopId);
  if (fromReservation) return fromReservation.radioLoopId;
  const fromDisk = walkPackageVersions(radioLibraryRoot).find((v) => v.metadata.source.trackId === sourceTrackId && v.metadata.source.loopId === sourceLoopId);
  return fromDisk ? fromDisk.radioLoopId : null;
}

// Single-process FIFO mutex — see module doc comment. Exported so tests can
// drive concurrent allocation directly without spinning up real HTTP
// requests.
let mutexQueue: Promise<unknown> = Promise.resolve();
export function withRadioIdLock<T>(fn: () => Promise<T> | T): Promise<T> {
  const run = mutexQueue.then(fn, fn);
  mutexQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

// The allocation entry point. Must only ever be called from inside
// withRadioIdLock (radioStagingFs.createStagingOperation wraps this for
// callers) — exported separately so a test can assert the lock is what
// prevents collisions, not incidental ordering.
export function allocateRadioId(
  radioLibraryRoot: string,
  operationId: string,
  sourceTrackId: string,
  sourceLoopId: string,
): RadioIdAllocation {
  const manifest = readJsonSafe<RadioCatalogManifest>(manifestPath(radioLibraryRoot));
  const reservations = readReservations(radioLibraryRoot);

  const existingId = findExistingRadioLoopId(radioLibraryRoot, sourceTrackId, sourceLoopId, manifest, reservations);
  const radioLoopId = existingId ?? formatRadioLoopId(highestKnownSequence(radioLibraryRoot, manifest, reservations) + 1);
  const packageVersion = highestKnownVersionForId(radioLibraryRoot, radioLoopId, manifest, reservations) + 1;

  const reservation: RadioIdReservation = {
    operationId,
    radioLoopId,
    packageVersion,
    sourceTrackId,
    sourceLoopId,
    reservedAt: new Date().toISOString(),
  };
  writeReservations(radioLibraryRoot, [...reservations, reservation]);

  return { radioLoopId, packageVersion };
}

// Reserve under the lock — the function callers actually use.
export function reserveRadioLoopId(
  radioLibraryRoot: string,
  operationId: string,
  sourceTrackId: string,
  sourceLoopId: string,
): Promise<RadioIdAllocation> {
  return withRadioIdLock(() => allocateRadioId(radioLibraryRoot, operationId, sourceTrackId, sourceLoopId));
}

// Releases a reservation (finalize success, finalize rollback-and-retry
// keeps it — see radioPackageWriter.ts — or explicit cleanup). Also
// serialized so it never races a concurrent allocation read.
export function releaseReservation(radioLibraryRoot: string, operationId: string): Promise<void> {
  return withRadioIdLock(() => {
    const reservations = readReservations(radioLibraryRoot);
    writeReservations(radioLibraryRoot, reservations.filter((r) => r.operationId !== operationId));
  });
}

export function findReservation(radioLibraryRoot: string, operationId: string): RadioIdReservation | null {
  return readReservations(radioLibraryRoot).find((r) => r.operationId === operationId) ?? null;
}
