// Suno Library Parity Repair — the same click-to-cycle sort PATTERN
// Catalog/External/Sounds use (librarySorting.ts's cycleSingleColumnSort),
// reimplemented small and generic here because the underlying record type
// genuinely differs (SunoCanonicalRecording vs. Track) — reusing the
// PATTERN, not duplicating Track-specific value-extraction logic. Single
// active sort key only (not Catalog's multi-column array) — a deliberate,
// narrower scope for this repair; nothing in the UI needs multi-column
// sort today.

export type SunoSortDirection = "asc" | "desc";

export interface SunoSortKey {
  columnId: string;
  direction: SunoSortDirection;
}

// Click cycle: none → asc → desc → none, same as Catalog's single-column cycle.
export function cycleSunoSort(current: SunoSortKey | null, columnId: string): SunoSortKey | null {
  if (!current || current.columnId !== columnId) return { columnId, direction: "asc" };
  if (current.direction === "asc") return { columnId, direction: "desc" };
  return null;
}

// Generic stable sort — caller supplies how to extract a comparable value
// for the active column (string | number | boolean | null) per record type.
export function applySunoSort<T>(records: T[], sortKey: SunoSortKey | null, getValue: (record: T, columnId: string) => string | number | boolean | null): T[] {
  if (!sortKey) return records;
  const { columnId, direction } = sortKey;
  const withIndex = records.map((r, i) => ({ r, i }));
  withIndex.sort((a, b) => {
    const av = getValue(a.r, columnId);
    const bv = getValue(b.r, columnId);
    const aNull = av == null;
    const bNull = bv == null;
    if (aNull && bNull) return a.i - b.i;
    if (aNull) return 1; // nulls always last, regardless of direction
    if (bNull) return -1;
    let cmp = 0;
    if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
    else cmp = String(av).localeCompare(String(bv));
    if (cmp === 0) return a.i - b.i; // stable
    return direction === "asc" ? cmp : -cmp;
  });
  return withIndex.map((x) => x.r);
}
