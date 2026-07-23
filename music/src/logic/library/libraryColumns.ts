// Shared Library data-grid column registry, defaults, and defensive
// preference reconciliation. Pure — no DOM, no Node. The registry is the
// single source of truth for which columns exist, their width bounds, and
// whether they're hideable/sortable — used identically by Catalog,
// External, and Sounds; the interface layer never hardcodes a column list
// of its own. Per-library defaults (which columns start hidden, and in
// what order) are expressed via `LIBRARY_DEFAULT_HIDDEN_COLUMNS` below,
// keyed by `LibrarySourceKey` — everything in the registry remains
// reachable through the Columns panel regardless of a library's defaults.

import type {
  LibraryColumnId, LibraryColumnPreference, LibraryGridPreferences, LibrarySortKey, LibrarySourceKey,
} from "../../data/libraryGridTypes";
import { LIBRARY_GRID_PREFERENCES_VERSION } from "../../data/libraryGridTypes";

export interface LibraryColumnDef {
  id: LibraryColumnId;
  label: string;
  minWidth: number;
  maxWidth: number;
  defaultWidth: number;
  // Mood/Suggested/Mechanical are tag-list cells with no single canonical
  // ordering value — sortable is false for those.
  sortable: boolean;
  // The selection column and the primary identity column (title) are
  // enforced elsewhere as always-visible/always-first; every entry in this
  // registry is independently hideable.
}

// Order here is the canonical DEFAULT column order — restoring defaults
// resets to exactly this sequence. Shared by every library: the Track type
// (and therefore every field below) is identical regardless of sourceOwner.
export const LIBRARY_COLUMN_REGISTRY: LibraryColumnDef[] = [
  { id: "title", label: "Title", minWidth: 120, maxWidth: 420, defaultWidth: 220, sortable: true },
  { id: "artist", label: "Artist", minWidth: 90, maxWidth: 320, defaultWidth: 160, sortable: true },
  { id: "mood", label: "Mood", minWidth: 80, maxWidth: 260, defaultWidth: 140, sortable: false },
  { id: "suggested", label: "Suggested", minWidth: 80, maxWidth: 260, defaultWidth: 120, sortable: false },
  { id: "mechanical", label: "Mech.", minWidth: 70, maxWidth: 220, defaultWidth: 110, sortable: false },
  { id: "grouping", label: "Grouping", minWidth: 70, maxWidth: 220, defaultWidth: 110, sortable: true },
  { id: "genre", label: "Genre", minWidth: 70, maxWidth: 220, defaultWidth: 110, sortable: true },
  { id: "bpm", label: "BPM", minWidth: 50, maxWidth: 100, defaultWidth: 64, sortable: true },
  { id: "key", label: "Key", minWidth: 50, maxWidth: 100, defaultWidth: 60, sortable: true },
  { id: "energy", label: "E", minWidth: 40, maxWidth: 90, defaultWidth: 56, sortable: true },
  { id: "duration", label: "Dur", minWidth: 50, maxWidth: 100, defaultWidth: 64, sortable: true },
  { id: "rating", label: "Rating", minWidth: 90, maxWidth: 160, defaultWidth: 110, sortable: true },
  { id: "plays", label: "×", minWidth: 40, maxWidth: 80, defaultWidth: 48, sortable: true },
  { id: "lastPlayed", label: "Last", minWidth: 70, maxWidth: 160, defaultWidth: 90, sortable: true },
  { id: "status", label: "Status", minWidth: 70, maxWidth: 160, defaultWidth: 90, sortable: true },
  { id: "comments", label: "Comments", minWidth: 120, maxWidth: 480, defaultWidth: 220, sortable: true },
];

const REGISTRY_BY_ID = new Map(LIBRARY_COLUMN_REGISTRY.map((c) => [c.id, c]));

export function getLibraryColumnDef(id: LibraryColumnId): LibraryColumnDef | undefined {
  return REGISTRY_BY_ID.get(id);
}

// "title" is the required, always-visible, always-first primary identity
// column (alongside the structural "select" column the interface layer
// renders separately) — never hideable, never reordered out of the lead
// data-column position, which is what makes freezing it deterministic.
export const REQUIRED_COLUMN_ID: LibraryColumnId = "title";

// Sounds/reference clips are one-shot audio, not full songs — BPM/Key/
// Suggested-mood/Mechanical-role are rarely meaningful there, so they start
// hidden (never removed from the registry, always reachable via Columns…).
// Catalog and External start with every column visible, matching their
// existing legacy-table column set exactly.
const LIBRARY_DEFAULT_HIDDEN_COLUMNS: Record<LibrarySourceKey, LibraryColumnId[]> = {
  studiorich: [],
  external: [],
  reference: ["bpm", "key", "suggested", "mechanical"],
};

export function clampColumnWidth(id: LibraryColumnId, width: number): number {
  const def = getLibraryColumnDef(id);
  if (!def) return width;
  return Math.min(def.maxWidth, Math.max(def.minWidth, Math.round(width)));
}

export function defaultLibraryGridPreferences(sourceKey: LibrarySourceKey, now: string = new Date().toISOString()): LibraryGridPreferences {
  const hidden = new Set(LIBRARY_DEFAULT_HIDDEN_COLUMNS[sourceKey] ?? []);
  return {
    version: LIBRARY_GRID_PREFERENCES_VERSION,
    columnOrder: LIBRARY_COLUMN_REGISTRY.map((c) => c.id),
    columns: LIBRARY_COLUMN_REGISTRY.map((c) => ({ id: c.id, visible: !hidden.has(c.id), width: c.defaultWidth })),
    sort: [],
    density: "comfortable",
    updatedAt: now,
  };
}

// Defensive reconciliation: unknown/removed/duplicated column ids never
// crash or discard the rest of a valid preference record; a newly-added
// registry column that has no stored preference yet appears visible
// (unless this library's own defaults hide it), at its default width,
// appended after the known columns. A structurally invalid stored value
// falls back wholesale to this library's defaults.
export function reconcileLibraryGridPreferences(
  stored: unknown,
  sourceKey: LibrarySourceKey,
  now: string = new Date().toISOString(),
): LibraryGridPreferences {
  if (!stored || typeof stored !== "object") return defaultLibraryGridPreferences(sourceKey, now);
  const raw = stored as Partial<LibraryGridPreferences>;
  const hiddenByDefault = new Set(LIBRARY_DEFAULT_HIDDEN_COLUMNS[sourceKey] ?? []);

  const validIds = new Set(LIBRARY_COLUMN_REGISTRY.map((c) => c.id));
  const seenColumnIds = new Set<LibraryColumnId>();
  const storedColumnsById = new Map<LibraryColumnId, LibraryColumnPreference>();
  if (Array.isArray(raw.columns)) {
    for (const col of raw.columns) {
      if (!col || typeof col !== "object") continue;
      const id = col.id as LibraryColumnId;
      if (!validIds.has(id) || storedColumnsById.has(id)) continue; // drop unknown/duplicate
      storedColumnsById.set(id, {
        id,
        visible: id === REQUIRED_COLUMN_ID ? true : Boolean(col.visible),
        width: clampColumnWidth(id, typeof col.width === "number" && col.width > 0 ? col.width : getLibraryColumnDef(id)!.defaultWidth),
      });
    }
  }

  // Build the reconciled order: known-valid stored order first (deduped),
  // then any registry columns missing from the stored order (new columns,
  // or a corrupt order array) appended in registry order.
  const reconciledOrder: LibraryColumnId[] = [];
  if (Array.isArray(raw.columnOrder)) {
    for (const id of raw.columnOrder as LibraryColumnId[]) {
      if (validIds.has(id) && !seenColumnIds.has(id)) {
        reconciledOrder.push(id);
        seenColumnIds.add(id);
      }
    }
  }
  for (const c of LIBRARY_COLUMN_REGISTRY) {
    if (!seenColumnIds.has(c.id)) {
      reconciledOrder.push(c.id);
      seenColumnIds.add(c.id);
    }
  }
  // The required identity column is always first among data columns.
  const withoutRequired = reconciledOrder.filter((id) => id !== REQUIRED_COLUMN_ID);
  const finalOrder = [REQUIRED_COLUMN_ID, ...withoutRequired];

  const reconciledColumns: LibraryColumnPreference[] = finalOrder.map((id) => {
    const found = storedColumnsById.get(id);
    if (found) return found;
    // A column this library's stored record has never seen before (new to
    // the registry, or new to this library's persisted layout) falls back
    // to this library's own default visibility — never silently hidden
    // just because it's unfamiliar, and never forced visible against an
    // explicit per-library default either.
    const def = getLibraryColumnDef(id)!;
    return { id, visible: !hiddenByDefault.has(id), width: def.defaultWidth };
  });

  const sort: LibrarySortKey[] = Array.isArray(raw.sort)
    ? raw.sort.filter((k): k is LibrarySortKey =>
        !!k && typeof k === "object" && validIds.has((k as LibrarySortKey).columnId) &&
        ((k as LibrarySortKey).direction === "asc" || (k as LibrarySortKey).direction === "desc"))
    : [];

  const density = raw.density === "compact" ? "compact" : "comfortable";

  return {
    version: LIBRARY_GRID_PREFERENCES_VERSION,
    columnOrder: finalOrder,
    columns: reconciledColumns,
    sort,
    density,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : now,
  };
}

export function restoreDefaultLibraryGridPreferences(sourceKey: LibrarySourceKey, now: string = new Date().toISOString()): LibraryGridPreferences {
  return defaultLibraryGridPreferences(sourceKey, now);
}

// Pure auto-fit computation — the interface layer supplies a real
// canvas-measureText-backed `measureTextWidth`; kept injectable so this
// stays testable without a DOM/canvas.
export function computeAutoFitWidth(
  id: LibraryColumnId,
  headerText: string,
  cellTexts: string[],
  measureTextWidth: (text: string) => number,
  padding = 24,
): number {
  const def = getLibraryColumnDef(id);
  if (!def) return 100;
  const widest = Math.max(measureTextWidth(headerText), ...cellTexts.map((t) => measureTextWidth(t)), 0);
  return clampColumnWidth(id, widest + padding);
}
