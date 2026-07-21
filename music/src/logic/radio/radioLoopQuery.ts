// RadioLoop Library Workspace (0717A) — pure search/filter/sort (decision
// 8.3) and legacy-role detection (decision 10). Pure, unit-tested
// exhaustively per spec §12.1.

import { isValidRadioArrangementRole } from "../../data/radioLoopTypes";
import type { RadioLoopFilterState, RadioLoopSortState, RadioLoopWorkspaceIssue, RadioLoopWorkspaceRow } from "../../data/radioWorkspaceTypes";

export function searchWorkspaceRows(rows: readonly RadioLoopWorkspaceRow[], search: string): RadioLoopWorkspaceRow[] {
  const term = search.trim().toLowerCase();
  if (!term) return [...rows];
  return rows.filter((row) => {
    const haystack = [
      row.radioLoopId,
      row.workingTitle ?? "",
      row.source.displayName ?? "",
      row.sourceTrackId,
      row.sourceLoopId,
      ...row.roles,
      // 0717C — familyIds is deprecated/legacy-read-only and never
      // surfaced anywhere, including search.
    ].join(" ").toLowerCase();
    return haystack.includes(term);
  });
}

export function filterWorkspaceRows(rows: readonly RadioLoopWorkspaceRow[], filter: RadioLoopFilterState): RadioLoopWorkspaceRow[] {
  return rows.filter((row) => {
    if (filter.role !== "all" && !row.roles.includes(filter.role)) return false;
    if (filter.status !== "all" && row.status !== filter.status) return false;
    if (filter.approval === "approved" && row.publicUseApproved !== true) return false;
    if (filter.approval === "unapproved" && row.publicUseApproved === true) return false;
    if (filter.stemStatus !== "all" && row.stemStatus !== filter.stemStatus) return false;
    return true;
  });
}

function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

// Stable sort — Array.prototype.sort is guaranteed stable per spec, but
// this is explicit/documented since sort stability is a required behavior
// (spec §12.1), not an incidental engine detail to rely on silently.
export function sortWorkspaceRows(rows: readonly RadioLoopWorkspaceRow[], sort: RadioLoopSortState): RadioLoopWorkspaceRow[] {
  const sorted = [...rows].sort((a, b) => {
    const cmp = compareValues(a[sort.key], b[sort.key]);
    return sort.direction === "asc" ? cmp : -cmp;
  });
  return sorted;
}

export function applyWorkspaceQuery(
  rows: readonly RadioLoopWorkspaceRow[],
  filter: RadioLoopFilterState,
  sort: RadioLoopSortState,
): RadioLoopWorkspaceRow[] {
  return sortWorkspaceRows(filterWorkspaceRows(searchWorkspaceRows(rows, filter.search), filter), sort);
}

// Decision 10 — never silently translate or drop a legacy (pre-0717A
// free-text) role like "atmosphere". Surfaced as a visible warning; the
// only way to clear it is an explicit metadata revision through the
// closed-vocabulary editor.
export function detectLegacyRoleIssues(row: RadioLoopWorkspaceRow): RadioLoopWorkspaceIssue[] {
  const legacyRoles = row.roles.filter((role) => !isValidRadioArrangementRole(role));
  if (legacyRoles.length === 0) return [];
  return [{
    code: "RADIO_WORKSPACE_LEGACY_ROLE",
    message: `Contains legacy role${legacyRoles.length > 1 ? "s" : ""} ${legacyRoles.map((r) => `"${r}"`).join(", ")} — not a valid RADIO role. Revise metadata to replace it.`,
    severity: "warning",
  }];
}

export function withDetectedIssues(row: RadioLoopWorkspaceRow): RadioLoopWorkspaceRow {
  return { ...row, issues: [...row.issues, ...detectLegacyRoleIssues(row)] };
}
