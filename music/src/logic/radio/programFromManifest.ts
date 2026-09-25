// Batch 03B.6 -- the package->Program bootstrap/recovery boundary. Turns an
// already-published, already-immutable RadioWebManifest (fetched from its
// own public package URL, e.g. https://radio.studiorich.tv/radio/<slug>/v<n>/)
// into a CreateRadioProgramInput, with NO dependency on MUSIC's local
// IndexedDB, RadioPlaylist, or RadioWebExportRecord -- see this batch's own
// recon (03B.5) for why that dependency existed and why it's wrong for a
// bootstrap/recovery path.
//
// Deliberately narrow: this is the SAME four package-identity/catalog
// fields (title/manifestBaseUrl/trackCount/totalDurationSeconds) plus the
// SAME two package-identity fields (stationId/bundleVersion) the MUSIC
// Publish panel's own handleCreateProgram already sends -- not a second,
// competing Program-construction path, just a second SOURCE for the same
// shape. `totalDurationSeconds` is read verbatim from the manifest's own
// precomputed field (RadioWebManifest.totalDurationSeconds), never re-summed
// from entries -- the manifest's own writer is the one authority for that
// number.
import type { RadioWebManifest } from "../../data/radioWebBundleTypes";
import { RADIO_WEB_BUNDLE_SCHEMA_VERSION } from "../../data/radioWebBundleTypes";
import type { CreateRadioProgramInput } from "@studiorich/member-identity";

export type ProgramFromManifestInvalidReason =
  | "invalid_url_not_https"
  | "invalid_manifest_not_object"
  | "invalid_manifest_schema_version"
  | "invalid_manifest_missing_station_id"
  | "invalid_manifest_missing_title"
  | "invalid_manifest_invalid_bundle_version"
  | "invalid_manifest_empty_entries"
  | "invalid_manifest_invalid_duration";

export type ProgramFromManifestResult =
  | { readonly status: "valid"; readonly input: CreateRadioProgramInput }
  | { readonly status: "invalid"; readonly reason: ProgramFromManifestInvalidReason };

/**
 * Normalizes an operator-supplied package base URL to the canonical form
 * every other RADIO surface expects: absolute HTTPS, exactly one trailing
 * slash. Returns null (not a thrown error) for anything that isn't even a
 * well-formed absolute HTTPS URL -- the caller decides how to surface that.
 */
export function normalizePackageBaseUrl(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  const withoutTrailingSlashes = parsed.href.replace(/\/+$/, "");
  return `${withoutTrailingSlashes}/`;
}

/**
 * Validates a fetched manifest body (parsed JSON, still `unknown` at this
 * boundary -- it came from a network fetch, never trusted) and, together
 * with an already-normalized package base URL, derives the exact
 * CreateRadioProgramInput the existing createRadioProgram() repository call
 * expects. `programId` is intentionally NOT included here -- see
 * generateRadioProgramId()'s own doc on why Program identity is generated
 * at the call site, never derived from package identity.
 */
export function deriveCreateRadioProgramInputFromManifest(
  manifest: unknown,
  normalizedManifestBaseUrl: string,
): ProgramFromManifestResult {
  if (!normalizedManifestBaseUrl.startsWith("https://") || !normalizedManifestBaseUrl.endsWith("/")) {
    return { status: "invalid", reason: "invalid_url_not_https" };
  }
  if (typeof manifest !== "object" || manifest === null) {
    return { status: "invalid", reason: "invalid_manifest_not_object" };
  }
  const candidate = manifest as Partial<RadioWebManifest>;

  if (candidate.schemaVersion !== RADIO_WEB_BUNDLE_SCHEMA_VERSION) {
    return { status: "invalid", reason: "invalid_manifest_schema_version" };
  }
  if (typeof candidate.stationId !== "string" || candidate.stationId.length === 0) {
    return { status: "invalid", reason: "invalid_manifest_missing_station_id" };
  }
  if (typeof candidate.title !== "string" || candidate.title.length === 0) {
    return { status: "invalid", reason: "invalid_manifest_missing_title" };
  }
  if (!Number.isInteger(candidate.bundleVersion) || (candidate.bundleVersion as number) <= 0) {
    return { status: "invalid", reason: "invalid_manifest_invalid_bundle_version" };
  }
  if (!Array.isArray(candidate.entries) || candidate.entries.length === 0) {
    return { status: "invalid", reason: "invalid_manifest_empty_entries" };
  }
  if (typeof candidate.totalDurationSeconds !== "number" || !Number.isFinite(candidate.totalDurationSeconds) || candidate.totalDurationSeconds <= 0) {
    return { status: "invalid", reason: "invalid_manifest_invalid_duration" };
  }

  return {
    status: "valid",
    input: {
      programId: "", // filled in by the caller via generateRadioProgramId() at write time
      title: candidate.title,
      manifestBaseUrl: normalizedManifestBaseUrl,
      trackCount: candidate.entries.length,
      totalDurationSeconds: candidate.totalDurationSeconds,
      stationId: candidate.stationId,
      bundleVersion: candidate.bundleVersion as number,
    },
  };
}

/**
 * Duplicate-package guard (Batch 03B.6 §3): a package already represented
 * by SOME Program in the existing catalog must not silently get a second
 * one. This is a CREATION GUARD only -- it never redefines Program identity
 * around package identity (programId stays independent, per Batch 02I).
 * Pure and testable against any already-fetched RadioProgramSummary[] --
 * no repository call here.
 */
export function findExistingProgramForPackage<T extends { readonly id: string; readonly title: string; readonly stationId?: string; readonly bundleVersion?: number }>(
  existingPrograms: readonly T[],
  stationId: string,
  bundleVersion: number,
): T | null {
  return existingPrograms.find((p) => p.stationId === stationId && p.bundleVersion === bundleVersion) ?? null;
}
