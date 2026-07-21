import { describe, it, expect } from "vitest";
import { buildExportRecord, runWebBundleExport } from "./radioWebBundleExportOrchestrator";
import type { RadioWebBundleExportRequest, RadioWebBundleExportResponse } from "../../data/radioWebBundleTypes";

function makeRequest(overrides: Partial<RadioWebBundleExportRequest> = {}): RadioWebBundleExportRequest {
  return { stationId: "radplaylist_1", title: "My Mix", slug: "my-mix", entries: [{ radioTrackId: "rtrack_000001", packageVersion: 1 }], ...overrides };
}

function makeSuccessResponse(overrides: Partial<RadioWebBundleExportResponse> = {}): RadioWebBundleExportResponse {
  return {
    ok: true, bundleVersion: 1, slug: "my-mix", exportPath: "/library/music/RadioWebExports/my-mix/v1",
    contentSignature: "sig1", totalByteSize: 4_200_000, totalDurationSeconds: 210, entryCount: 1,
    validation: { ok: true, checkedAt: "2026-07-20T00:00:00.000Z", fileCount: 5, issues: [] },
    issues: [],
    ...overrides,
  };
}

describe("buildExportRecord", () => {
  it("builds a full record from a successful, fully validated response", () => {
    const record = buildExportRecord(makeSuccessResponse(), "radplaylist_1", "2026-07-20T00:00:00.000Z");
    expect(record).toMatchObject({
      radioPlaylistId: "radplaylist_1", slug: "my-mix", bundleVersion: 1, exportedAt: "2026-07-20T00:00:00.000Z",
      contentSignature: "sig1", totalByteSize: 4_200_000, totalDurationSeconds: 210, entryCount: 1,
      validation: { ok: true, checkedAt: "2026-07-20T00:00:00.000Z" },
      exportPath: "/library/music/RadioWebExports/my-mix/v1",
    });
    expect(record?.id).toBeTruthy();
  });

  it("returns undefined for an unchanged (no-op) export — nothing new to record", () => {
    expect(buildExportRecord(makeSuccessResponse({ unchanged: true, existingVersion: 1 }), "radplaylist_1")).toBeUndefined();
  });

  it("returns undefined for a failed export", () => {
    expect(buildExportRecord(makeSuccessResponse({ ok: false }), "radplaylist_1")).toBeUndefined();
  });

  it("returns undefined when the server-side self-validation did not pass — never records an unvalidated bundle", () => {
    const response = makeSuccessResponse({ validation: { ok: false, checkedAt: "2026-07-20T00:00:00.000Z", fileCount: 5, issues: [{ code: "RADIO_WEB_BUNDLE_HASH_MISMATCH", message: "bad", severity: "error" }] } });
    expect(buildExportRecord(response, "radplaylist_1")).toBeUndefined();
  });

  it("returns undefined when required fields are missing from an otherwise-ok response", () => {
    const response = makeSuccessResponse();
    delete response.exportPath;
    expect(buildExportRecord(response, "radplaylist_1")).toBeUndefined();
  });
});

describe("runWebBundleExport", () => {
  it("returns ok:true with a record on a successful validated export", async () => {
    const result = await runWebBundleExport(makeRequest(), "radplaylist_1", { exportBundle: async () => makeSuccessResponse() });
    expect(result.ok).toBe(true);
    expect(result.unchanged).toBe(false);
    expect(result.record).toBeDefined();
  });

  it("returns ok:false and unchanged:true with no record when the server detects a no-op re-export", async () => {
    const result = await runWebBundleExport(makeRequest(), "radplaylist_1", { exportBundle: async () => makeSuccessResponse({ unchanged: true, existingVersion: 1 }) });
    expect(result.ok).toBe(false);
    expect(result.unchanged).toBe(true);
    expect(result.record).toBeUndefined();
  });

  it("returns ok:false with no record when the export request fails", async () => {
    const failure: RadioWebBundleExportResponse = { ok: false, issues: [{ code: "RADIO_WEB_BUNDLE_MISSING_FIELDS", message: "bad request", severity: "error" }] };
    const result = await runWebBundleExport(makeRequest(), "radplaylist_1", { exportBundle: async () => failure });
    expect(result.ok).toBe(false);
    expect(result.record).toBeUndefined();
    expect(result.response).toBe(failure);
  });
});
