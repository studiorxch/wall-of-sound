// 0721B_MUSIC_Catalog_Data_Grid_Comments (expanded to a shared Library data
// grid) — persisted per-library grid view preferences (widths/order/
// visibility/sort/density). One canonical shape shared by Catalog,
// External, and Sounds; each library's preferences are stored under its
// own key so a layout change in one never touches another's — see
// `LibraryGridPreferencesBySource` and playProjectTypes.ts's
// `libraryGridPreferences` field.

// Structural columns (select/actions) are always present, never
// hideable/reorderable/persisted individually — only the data columns
// below are part of the configurable set. The Track type — and therefore
// the available fields — is identical across Catalog/External/Sounds, so
// one shared column-id union covers all three; what differs per library is
// default visibility/order and available actions, not the field set.
export type LibraryColumnId =
  | "title" | "artist" | "mood" | "suggested" | "mechanical" | "grouping" | "genre"
  | "bpm" | "key" | "energy" | "duration" | "rating" | "plays" | "lastPlayed" | "status"
  | "comments";

export interface LibraryColumnPreference {
  id: LibraryColumnId;
  visible: boolean;
  width: number;
}

export type LibrarySortDirection = "asc" | "desc";

export interface LibrarySortKey {
  columnId: LibraryColumnId;
  direction: LibrarySortDirection;
}

export type LibraryRowDensity = "compact" | "comfortable";

// `version` gates defensive reconciliation (see logic/library/libraryColumns.ts's
// reconcileLibraryGridPreferences) — bumped only if the column registry's
// shape itself changes in a way that requires a real migration, never used
// as a public-facing value.
export interface LibraryGridPreferences {
  version: number;
  columnOrder: LibraryColumnId[];
  columns: LibraryColumnPreference[];
  sort: LibrarySortKey[];
  density: LibraryRowDensity;
  updatedAt: string;
}

export const LIBRARY_GRID_PREFERENCES_VERSION = 1;

// The three source-locked library pages the shared grid serves. "unknown"
// and the aggregate "All Tracks" view are explicitly out of scope — they
// keep the pre-existing legacy table (see MainTrackWindow.tsx).
export type LibrarySourceKey = "studiorich" | "external" | "reference";

// One preferences record per library, independently persisted. A layout
// change in Catalog must never modify External's or Sounds' stored record —
// this map shape is what makes that a structural guarantee rather than a
// convention to remember.
export type LibraryGridPreferencesBySource = Partial<Record<LibrarySourceKey, LibraryGridPreferences>>;
