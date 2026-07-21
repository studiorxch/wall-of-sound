// 0718B_RADIO_Web_Publication_Asset_Export_Bridge — stable RadioTrack ID +
// package version allocation. Node-only. Mirrors radioIdAssigner.ts's
// proven mutex + reservation-file mechanism, sharing the SAME exported
// withRadioIdLock so RadioLoop and RadioTrack allocations can never race
// each other either (one FIFO lock across both package families is
// strictly safer than two). Reservations live under the RadioTrackLibrary
// root's own catalog/id-reservations.json.
//
// Existing-ID reuse is matched on sourceTrackId alone — a MUSIC track has
// exactly one RadioTrack identity across all its package versions.

import path from "node:path";
import { readJsonSafe, writeJsonAtomic, listSubdirNames } from "./radioFsUtils";
import { walkTrackPackageVersions } from "./radioTrackPackageWalker";
import { withRadioIdLock } from "./radioIdAssigner";
import {
  formatRadioTrackId,
  parseRadioTrackIdSequence,
  type RadioTrackCatalogManifest,
  type RadioTrackId,
} from "../../src/data/radioTrackPackageTypes";

export interface RadioTrackIdReservation {
  operationId: string;
  radioTrackId: RadioTrackId;
  packageVersion: number;
  sourceTrackId: string;
  reservedAt: string;
}

export interface RadioTrackIdAllocation {
  radioTrackId: RadioTrackId;
  packageVersion: number;
}

function manifestPath(trackLibraryRoot: string): string {
  return path.join(trackLibraryRoot, "catalog", "local-manifest.json");
}

function reservationsPath(trackLibraryRoot: string): string {
  return path.join(trackLibraryRoot, "catalog", "id-reservations.json");
}

function packagesDir(trackLibraryRoot: string): string {
  return path.join(trackLibraryRoot, "packages");
}

export function readTrackReservations(trackLibraryRoot: string): RadioTrackIdReservation[] {
  return readJsonSafe<RadioTrackIdReservation[]>(reservationsPath(trackLibraryRoot)) ?? [];
}

function writeTrackReservations(trackLibraryRoot: string, reservations: RadioTrackIdReservation[]): void {
  writeJsonAtomic(reservationsPath(trackLibraryRoot), reservations);
}

function scanTrackPackageIdsFromDisk(trackLibraryRoot: string): RadioTrackId[] {
  return listSubdirNames(packagesDir(trackLibraryRoot));
}

function highestKnownSequence(trackLibraryRoot: string, manifest: RadioTrackCatalogManifest | null, reservations: RadioTrackIdReservation[]): number {
  const ids: string[] = [
    ...(manifest?.entries.map((e) => e.radioTrackId) ?? []),
    ...reservations.map((r) => r.radioTrackId),
    ...scanTrackPackageIdsFromDisk(trackLibraryRoot),
  ];
  let highest = 0;
  for (const id of ids) {
    const seq = parseRadioTrackIdSequence(id);
    if (seq != null && seq > highest) highest = seq;
  }
  return highest;
}

// Disk is the ultimate source of truth for what versions actually exist —
// same doctrine as the loop assigner (a manifest can lag or suppress).
function highestKnownVersionForId(trackLibraryRoot: string, radioTrackId: RadioTrackId, manifest: RadioTrackCatalogManifest | null, reservations: RadioTrackIdReservation[]): number {
  let highest = 0;
  for (const entry of manifest?.entries ?? []) {
    if (entry.radioTrackId === radioTrackId && entry.packageVersion > highest) highest = entry.packageVersion;
  }
  for (const r of reservations) {
    if (r.radioTrackId === radioTrackId && r.packageVersion > highest) highest = r.packageVersion;
  }
  for (const v of walkTrackPackageVersions(trackLibraryRoot, radioTrackId)) {
    if (v.packageVersion > highest) highest = v.packageVersion;
  }
  return highest;
}

export function findExistingRadioTrackId(trackLibraryRoot: string, sourceTrackId: string): RadioTrackId | null {
  const manifest = readJsonSafe<RadioTrackCatalogManifest>(manifestPath(trackLibraryRoot));
  const fromManifest = manifest?.entries.find((e) => e.source.trackId === sourceTrackId);
  if (fromManifest) return fromManifest.radioTrackId;
  const fromReservation = readTrackReservations(trackLibraryRoot).find((r) => r.sourceTrackId === sourceTrackId);
  if (fromReservation) return fromReservation.radioTrackId;
  const fromDisk = walkTrackPackageVersions(trackLibraryRoot).find((v) => v.metadata.source.trackId === sourceTrackId);
  return fromDisk ? fromDisk.radioTrackId : null;
}

// Must only ever run inside withRadioIdLock — exported separately so a
// test can assert the lock is what prevents collisions.
export function allocateRadioTrackId(trackLibraryRoot: string, operationId: string, sourceTrackId: string): RadioTrackIdAllocation {
  const manifest = readJsonSafe<RadioTrackCatalogManifest>(manifestPath(trackLibraryRoot));
  const reservations = readTrackReservations(trackLibraryRoot);

  const existingId = findExistingRadioTrackId(trackLibraryRoot, sourceTrackId);
  const radioTrackId = existingId ?? formatRadioTrackId(highestKnownSequence(trackLibraryRoot, manifest, reservations) + 1);
  const packageVersion = highestKnownVersionForId(trackLibraryRoot, radioTrackId, manifest, reservations) + 1;

  const reservation: RadioTrackIdReservation = {
    operationId,
    radioTrackId,
    packageVersion,
    sourceTrackId,
    reservedAt: new Date().toISOString(),
  };
  writeTrackReservations(trackLibraryRoot, [...reservations, reservation]);

  return { radioTrackId, packageVersion };
}

// Reserve under the shared lock — the function callers actually use.
export function reserveRadioTrackId(trackLibraryRoot: string, operationId: string, sourceTrackId: string): Promise<RadioTrackIdAllocation> {
  return withRadioIdLock(() => allocateRadioTrackId(trackLibraryRoot, operationId, sourceTrackId));
}

export function releaseTrackReservation(trackLibraryRoot: string, operationId: string): Promise<void> {
  return withRadioIdLock(() => {
    const reservations = readTrackReservations(trackLibraryRoot);
    writeTrackReservations(trackLibraryRoot, reservations.filter((r) => r.operationId !== operationId));
  });
}

export function findTrackReservation(trackLibraryRoot: string, operationId: string): RadioTrackIdReservation | null {
  return readTrackReservations(trackLibraryRoot).find((r) => r.operationId === operationId) ?? null;
}
