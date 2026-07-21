// 0718B_RADIO_Web_Publication_Asset_Export_Bridge — the export flow: send
// a validated RadioWebBundlePlan to the server, then turn a successful,
// FULLY VALIDATED response into a persisted RadioWebExportRecord. An
// EXPORTED display state is only ever derived from one of these records —
// never from playlist state alone (see radioPlaylistTypes.ts).
//
// buildExportRecord is pure and unit-tested. runWebBundleExport composes
// it with an injected `exportBundle` dependency (same DI pattern as
// runTrackPreparationBatch) and is unit-tested against that injection.
// The default fetch-based `exportWebBundleViaFetch` is NOT unit-tested —
// fetch-dependent, same documented convention as radioPromotionOrchestrator.ts.

import type { RadioWebBundleExportRequest, RadioWebBundleExportResponse, RadioWebExportRecord } from "../../data/radioWebBundleTypes";

function genRadioWebExportId(): string {
  return `radweb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// Only a response that is ok, NOT unchanged, and carries a validation.ok
// result produces a record — an unvalidated or unchanged export is never
// silently recorded as a real, listable bundle version.
export function buildExportRecord(response: RadioWebBundleExportResponse, radioPlaylistId: string, now: string = new Date().toISOString()): RadioWebExportRecord | undefined {
  if (!response.ok || response.unchanged) return undefined;
  if (!response.validation?.ok) return undefined;
  if (
    response.bundleVersion == null || !response.slug || !response.exportPath ||
    response.contentSignature == null || response.totalByteSize == null ||
    response.totalDurationSeconds == null || response.entryCount == null
  ) return undefined;

  return {
    id: genRadioWebExportId(),
    radioPlaylistId,
    slug: response.slug,
    bundleVersion: response.bundleVersion,
    exportedAt: now,
    contentSignature: response.contentSignature,
    totalByteSize: response.totalByteSize,
    totalDurationSeconds: response.totalDurationSeconds,
    entryCount: response.entryCount,
    validation: { ok: true, checkedAt: response.validation.checkedAt },
    exportPath: response.exportPath,
  };
}

export interface ExportWebBundleDeps {
  exportBundle: (request: RadioWebBundleExportRequest) => Promise<RadioWebBundleExportResponse>;
}

export interface ExportWebBundleResult {
  ok: boolean; // a new, validated bundle version was created
  unchanged: boolean; // semantic match with the latest version — nothing exported, force required
  response: RadioWebBundleExportResponse;
  record?: RadioWebExportRecord;
}

export async function runWebBundleExport(request: RadioWebBundleExportRequest, radioPlaylistId: string, deps: ExportWebBundleDeps): Promise<ExportWebBundleResult> {
  const response = await deps.exportBundle(request);
  const record = buildExportRecord(response, radioPlaylistId);
  return { ok: Boolean(record), unchanged: Boolean(response.unchanged), response, record };
}

// Network orchestration — not unit-tested (fetch-dependent).
export async function exportWebBundleViaFetch(request: RadioWebBundleExportRequest): Promise<RadioWebBundleExportResponse> {
  try {
    const resp = await fetch("/radio-web-bundle-export", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request),
    });
    return (await resp.json()) as RadioWebBundleExportResponse;
  } catch (err) {
    return { ok: false, issues: [{ code: "RADIO_WEB_BUNDLE_EXPORT_UNREACHABLE", message: err instanceof Error ? err.message : "Could not reach the RADIO web bundle export route", severity: "error" }] };
  }
}
