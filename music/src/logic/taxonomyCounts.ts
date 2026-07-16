import type { Track } from "../data/trackTypes";
import { normalizeTrackGenreIndexTokens } from "./genreTaxonomy";

export type TaxonomyField = "mood" | "genre";
export type TaxonomySortMode = "count_desc" | "alpha_asc";

export type TaxonomyCount = {
  label: string;
  count: number;
  selected: boolean;
};

/**
 * Normalize taxonomy values from a Track for a given field.
 * Adapts to the actual field names used in this project:
 *   mood  → moodTags (string[])
 *   genre → genre/genres, split, canonicalized, and Genre-index-filtered via genreTaxonomy
 */
export function normalizeTaxonomyValues(track: Track, field: TaxonomyField): string[] {
  if (field === "mood") {
    const raw: string[] = [];
    for (const v of track.moodTags ?? []) {
      if (typeof v === "string" && v.trim()) raw.push(v.trim());
    }
    return Array.from(new Set(raw));
  }

  return normalizeTrackGenreIndexTokens(track);
}

export function buildTaxonomyCounts(
  tracks: Track[],
  field: TaxonomyField,
  selectedValues: string[],
  sortMode: TaxonomySortMode,
): TaxonomyCount[] {
  const selectedSet = new Set(selectedValues.map((v) => v.toLowerCase()));
  const counts = new Map<string, number>();

  for (const track of tracks) {
    for (const value of normalizeTaxonomyValues(track, field)) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }

  const items = Array.from(counts.entries()).map(([label, count]) => ({
    label,
    count,
    selected: selectedSet.has(label.toLowerCase()),
  }));

  return items.sort((a, b) => {
    if (sortMode === "alpha_asc") {
      return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
    }
    if (b.count !== a.count) return b.count - a.count;
    return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
  });
}

export function filterTaxonomyCounts(
  items: TaxonomyCount[],
  query: string,
): TaxonomyCount[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) => item.label.toLowerCase().includes(q));
}
