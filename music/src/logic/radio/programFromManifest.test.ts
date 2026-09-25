import { describe, it, expect } from "vitest";
import { normalizePackageBaseUrl, deriveCreateRadioProgramInputFromManifest, findExistingProgramForPackage } from "./programFromManifest";
import { RADIO_WEB_BUNDLE_SCHEMA_VERSION } from "../../data/radioWebBundleTypes";

function validManifest(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: RADIO_WEB_BUNDLE_SCHEMA_VERSION,
    stationId: "radplaylist_mrpzn8z9_x51i6d",
    bundleVersion: 1,
    title: "Soft Motion Radio",
    artworkUrl: "artwork/cover.jpeg",
    entries: [
      { radioTrackId: "rtrack_000019", packageVersion: 1, audioUrl: "audio/rtrack_000019-v1.opus", durationSeconds: 106.6, byteSize: 2152787, sha256: "abc", title: "Above the Loop", artist: "StudioRich" },
    ],
    totalDurationSeconds: 1546.6397708333334,
    totalByteSize: 12345,
    createdAt: "2026-07-24T00:35:54.257Z",
    performanceAssets: [],
    ...overrides,
  };
}

describe("normalizePackageBaseUrl", () => {
  it("accepts an ordinary https URL and adds a single trailing slash", () => {
    expect(normalizePackageBaseUrl("https://radio.studiorich.tv/radio/soft-motion-radio/v1")).toBe(
      "https://radio.studiorich.tv/radio/soft-motion-radio/v1/",
    );
  });

  it("leaves an already-trailing-slash URL with exactly one slash", () => {
    expect(normalizePackageBaseUrl("https://radio.studiorich.tv/radio/soft-motion-radio/v1/")).toBe(
      "https://radio.studiorich.tv/radio/soft-motion-radio/v1/",
    );
  });

  it("collapses multiple trailing slashes to one", () => {
    expect(normalizePackageBaseUrl("https://radio.studiorich.tv/radio/soft-motion-radio/v1///")).toBe(
      "https://radio.studiorich.tv/radio/soft-motion-radio/v1/",
    );
  });

  it("trims surrounding whitespace from operator input", () => {
    expect(normalizePackageBaseUrl("  https://radio.studiorich.tv/radio/soft-motion-radio/v1/  ")).toBe(
      "https://radio.studiorich.tv/radio/soft-motion-radio/v1/",
    );
  });

  it("rejects a non-HTTPS (http) URL", () => {
    expect(normalizePackageBaseUrl("http://radio.studiorich.tv/radio/soft-motion-radio/v1/")).toBeNull();
  });

  it("rejects a relative/dev-only path (no origin at all)", () => {
    expect(normalizePackageBaseUrl("/radio-web-export/soft-motion-radio/v1/")).toBeNull();
  });

  it("rejects an empty string", () => {
    expect(normalizePackageBaseUrl("")).toBeNull();
    expect(normalizePackageBaseUrl("   ")).toBeNull();
  });

  it("rejects a malformed URL", () => {
    expect(normalizePackageBaseUrl("not a url at all")).toBeNull();
  });

  it("is deterministic for the same input", () => {
    const a = normalizePackageBaseUrl("https://radio.studiorich.tv/radio/x/v2");
    const b = normalizePackageBaseUrl("https://radio.studiorich.tv/radio/x/v2");
    expect(a).toBe(b);
  });
});

describe("deriveCreateRadioProgramInputFromManifest", () => {
  const url = "https://radio.studiorich.tv/radio/soft-motion-radio/v1/";

  it("derives the exact CreateRadioProgramInput shape for a valid manifest", () => {
    const result = deriveCreateRadioProgramInputFromManifest(validManifest(), url);
    expect(result.status).toBe("valid");
    if (result.status !== "valid") return;
    expect(result.input.title).toBe("Soft Motion Radio");
    expect(result.input.manifestBaseUrl).toBe(url);
    expect(result.input.trackCount).toBe(1);
    expect(result.input.totalDurationSeconds).toBe(1546.6397708333334);
    expect(result.input.stationId).toBe("radplaylist_mrpzn8z9_x51i6d");
    expect(result.input.bundleVersion).toBe(1);
  });

  it("never recalculates totalDurationSeconds from entries -- uses the manifest's own precomputed field verbatim", () => {
    // entries sum to 106.6, but the manifest's own totalDurationSeconds is
    // the much larger real station total -- the derivation must use THAT,
    // not sum the (possibly partial) entries array itself.
    const result = deriveCreateRadioProgramInputFromManifest(validManifest(), url);
    expect(result.status).toBe("valid");
    if (result.status !== "valid") return;
    expect(result.input.totalDurationSeconds).not.toBe(106.6);
    expect(result.input.totalDurationSeconds).toBe(1546.6397708333334);
  });

  it("rejects a non-HTTPS manifestBaseUrl even if the manifest itself is valid", () => {
    const result = deriveCreateRadioProgramInputFromManifest(validManifest(), "http://radio.studiorich.tv/radio/x/v1/");
    expect(result).toEqual({ status: "invalid", reason: "invalid_url_not_https" });
  });

  it("rejects a manifestBaseUrl missing a trailing slash (caller must pre-normalize)", () => {
    const result = deriveCreateRadioProgramInputFromManifest(validManifest(), "https://radio.studiorich.tv/radio/x/v1");
    expect(result).toEqual({ status: "invalid", reason: "invalid_url_not_https" });
  });

  it("rejects a non-object manifest", () => {
    expect(deriveCreateRadioProgramInputFromManifest(null, url)).toEqual({ status: "invalid", reason: "invalid_manifest_not_object" });
    expect(deriveCreateRadioProgramInputFromManifest("a string", url)).toEqual({ status: "invalid", reason: "invalid_manifest_not_object" });
    expect(deriveCreateRadioProgramInputFromManifest(42, url)).toEqual({ status: "invalid", reason: "invalid_manifest_not_object" });
  });

  it("rejects an unsupported/missing schemaVersion", () => {
    const result = deriveCreateRadioProgramInputFromManifest(validManifest({ schemaVersion: "0.0.1" }), url);
    expect(result).toEqual({ status: "invalid", reason: "invalid_manifest_schema_version" });
  });

  it("rejects a missing/empty stationId", () => {
    expect(deriveCreateRadioProgramInputFromManifest(validManifest({ stationId: "" }), url)).toEqual({ status: "invalid", reason: "invalid_manifest_missing_station_id" });
    expect(deriveCreateRadioProgramInputFromManifest(validManifest({ stationId: undefined }), url)).toEqual({ status: "invalid", reason: "invalid_manifest_missing_station_id" });
  });

  it("rejects a missing/empty title", () => {
    expect(deriveCreateRadioProgramInputFromManifest(validManifest({ title: "" }), url)).toEqual({ status: "invalid", reason: "invalid_manifest_missing_title" });
  });

  it("rejects an invalid bundleVersion (zero, negative, or non-integer)", () => {
    expect(deriveCreateRadioProgramInputFromManifest(validManifest({ bundleVersion: 0 }), url)).toEqual({ status: "invalid", reason: "invalid_manifest_invalid_bundle_version" });
    expect(deriveCreateRadioProgramInputFromManifest(validManifest({ bundleVersion: -1 }), url)).toEqual({ status: "invalid", reason: "invalid_manifest_invalid_bundle_version" });
    expect(deriveCreateRadioProgramInputFromManifest(validManifest({ bundleVersion: 1.5 }), url)).toEqual({ status: "invalid", reason: "invalid_manifest_invalid_bundle_version" });
  });

  it("rejects empty entries", () => {
    expect(deriveCreateRadioProgramInputFromManifest(validManifest({ entries: [] }), url)).toEqual({ status: "invalid", reason: "invalid_manifest_empty_entries" });
    expect(deriveCreateRadioProgramInputFromManifest(validManifest({ entries: "not-an-array" }), url)).toEqual({ status: "invalid", reason: "invalid_manifest_empty_entries" });
  });

  it("rejects an invalid totalDurationSeconds (zero, negative, non-finite, or missing)", () => {
    expect(deriveCreateRadioProgramInputFromManifest(validManifest({ totalDurationSeconds: 0 }), url)).toEqual({ status: "invalid", reason: "invalid_manifest_invalid_duration" });
    expect(deriveCreateRadioProgramInputFromManifest(validManifest({ totalDurationSeconds: -5 }), url)).toEqual({ status: "invalid", reason: "invalid_manifest_invalid_duration" });
    expect(deriveCreateRadioProgramInputFromManifest(validManifest({ totalDurationSeconds: Infinity }), url)).toEqual({ status: "invalid", reason: "invalid_manifest_invalid_duration" });
    expect(deriveCreateRadioProgramInputFromManifest(validManifest({ totalDurationSeconds: undefined }), url)).toEqual({ status: "invalid", reason: "invalid_manifest_invalid_duration" });
  });
});

describe("findExistingProgramForPackage (duplicate guard)", () => {
  const existing = [
    { id: "radprogram_a", title: "Old Mix", stationId: "radplaylist_aaa", bundleVersion: 1 },
    { id: "radprogram_b", title: "Soft Motion Radio", stationId: "radplaylist_mrpzn8z9_x51i6d", bundleVersion: 1 },
  ];

  it("finds an existing Program for a matching stationId+bundleVersion pair", () => {
    const found = findExistingProgramForPackage(existing, "radplaylist_mrpzn8z9_x51i6d", 1);
    expect(found).not.toBeNull();
    expect(found?.id).toBe("radprogram_b");
    expect(found?.title).toBe("Soft Motion Radio");
  });

  it("returns null when no existing Program matches the package", () => {
    expect(findExistingProgramForPackage(existing, "radplaylist_new_package", 1)).toBeNull();
  });

  it("treats a different bundleVersion of the same stationId as a distinct package (no false positive)", () => {
    expect(findExistingProgramForPackage(existing, "radplaylist_mrpzn8z9_x51i6d", 2)).toBeNull();
  });

  it("returns null against an empty catalog", () => {
    expect(findExistingProgramForPackage([], "radplaylist_mrpzn8z9_x51i6d", 1)).toBeNull();
  });

  it("ignores a legacy Program with no stationId/bundleVersion at all (never a false match)", () => {
    const legacyOnly = [{ id: "radprogram_legacy", title: "Legacy Program" }];
    expect(findExistingProgramForPackage(legacyOnly, "radplaylist_mrpzn8z9_x51i6d", 1)).toBeNull();
  });
});
