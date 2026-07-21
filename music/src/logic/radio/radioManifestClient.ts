// RadioLoop Library Workspace (0717A) — manifest/index client (decision 5).
// The workspace's baseline row population source is GET /radio-library-index
// (every RadioLoop ever promoted, retired included, session-independent),
// NOT GET /radio-manifest (which excludes a whole RadioLoop once its
// highest version is retired — populating from it would make retired
// loops silently disappear across sessions, which spec §11 forbids).
// /radio-manifest is only cross-referenced to flag active/schedulable
// eligibility on each row.

import type { RadioLoopPackageManifest, RadioCatalogManifest } from "../../data/radioLoopTypes";
import type { RadioLibraryIndexEntry, RadioLoopVersionIndexEntry, RadioLoopWorkspaceIssue, RadioLoopWorkspaceRow } from "../../data/radioWorkspaceTypes";

// Pure — the manifest→row projection spec §12.1 requires unit tests for.
// Unresolved optional metadata stays undefined, never an invented default.
export function projectWorkspaceRow(metadata: RadioLoopPackageManifest, isActiveInManifest: boolean): RadioLoopWorkspaceRow {
  return {
    radioLoopId: metadata.radioLoopId,
    currentPackageVersion: metadata.packageVersion,
    // At minimum, the current version — the Inspector fetches the
    // complete history via /radio-package-versions when opened rather
    // than every row eagerly fetching it on initial load.
    availableVersions: [metadata.packageVersion],
    status: metadata.status,
    isActiveInManifest,
    workingTitle: metadata.title,
    sourceTrackId: metadata.source.trackId,
    sourceLoopId: metadata.source.loopId,
    source: { sourceTrackId: metadata.source.trackId, sourceLoopId: metadata.source.loopId, resolved: false },
    durationSeconds: metadata.audio.primary.durationSeconds,
    bpm: metadata.musical.bpm,
    key: metadata.musical.key,
    bars: metadata.musical.bars,
    roles: metadata.arrangement.roles,
    familyIds: metadata.arrangement.familyIds,
    energy: metadata.arrangement.energy,
    density: metadata.arrangement.density,
    stability: metadata.arrangement.stability,
    // metadata.json alone can't distinguish "never had stems" from
    // "stems omitted for a duration mismatch" (that distinction lives only
    // in the transient promotion report) — "missing" covers both here.
    stemStatus: metadata.stems && metadata.stems.length > 0 ? "available" : "missing",
    publicUseApproved: metadata.approval.publicUseApproved,
    deliveryCodec: metadata.audio.primary.codec,
    deliveryContainer: metadata.audio.primary.container,
    packageValidationState: "valid",
    issues: [],
  };
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    return (await resp.json()) as T;
  } catch {
    return null;
  }
}

export interface FetchWorkspaceRowsResult {
  rows: RadioLoopWorkspaceRow[];
  issues: RadioLoopWorkspaceIssue[];
}

// Network orchestration — not unit-tested (fetch-dependent), same
// documented convention as radioPromotionOrchestrator.ts. Every pure step
// it composes (projectWorkspaceRow) IS unit-tested.
export async function fetchWorkspaceRows(): Promise<FetchWorkspaceRowsResult> {
  const issues: RadioLoopWorkspaceIssue[] = [];
  const [index, manifest] = await Promise.all([
    fetchJson<{ entries: RadioLibraryIndexEntry[] }>("/radio-library-index"),
    fetchJson<RadioCatalogManifest>("/radio-manifest"),
  ]);

  if (!index) {
    issues.push({ code: "RADIO_WORKSPACE_INDEX_UNAVAILABLE", message: "Could not load the RadioLoop library index", severity: "error" });
    return { rows: [], issues };
  }

  const activeIds = new Set((manifest?.entries ?? []).map((e) => e.radioLoopId));
  const rows: RadioLoopWorkspaceRow[] = [];

  for (const entry of index.entries) {
    const metadata = await fetchJson<RadioLoopPackageManifest>(`/radio-package?radioLoopId=${encodeURIComponent(entry.radioLoopId)}&packageVersion=${entry.packageVersion}`);
    if (!metadata) {
      issues.push({ code: "RADIO_WORKSPACE_METADATA_FETCH_FAILED", message: `Failed to load metadata for ${entry.radioLoopId} v${entry.packageVersion}`, severity: "warning" });
      continue;
    }
    rows.push(projectWorkspaceRow(metadata, activeIds.has(entry.radioLoopId)));
  }

  return { rows, issues };
}

export async function fetchVersionHistory(radioLoopId: string): Promise<RadioLoopVersionIndexEntry[]> {
  const result = await fetchJson<{ versions: RadioLoopVersionIndexEntry[] }>(`/radio-package-versions?radioLoopId=${encodeURIComponent(radioLoopId)}`);
  return result?.versions ?? [];
}
