/**
 * Genre index normalization — read/index-boundary only.
 * Splits compound comma/semicolon-delimited genre strings into individually
 * filterable canonical tokens and collapses known spelling/punctuation variants,
 * without ever rewriting persisted track records.
 */

import type { Track } from "../data/trackTypes";

export type RawGenreValue = string | readonly string[] | null | undefined;

// Approved malformed-token repairs — exact match keys only, conservative.
const MALFORMED_REPAIRS: Record<string, string[]> = {
  "lo-fi-fi": ["lo-fi"],
  "lo-filo-fi": ["lo-fi"],
  "lo-fiambient": ["lo-fi", "ambient"],
  "urban. ambient. hip-hop": ["urban", "ambient", "hip-hop"],
};

// Exact canonical tokens excluded from Genre-index surfaces (counts, cards,
// filters, search options) — non-genre roles that happen to live in the same
// raw field. Does not affect normalizeGenreTokens()'s own output; other,
// non-index consumers may still see the token if they need lossless values.
const GENRE_INDEX_EXCLUDED = new Set<string>(["closing"]);

// Approved canonical aliases — exact match keys only.
const CANONICAL_ALIASES: Record<string, string> = {
  "lofi": "lo-fi",
  "lo fi": "lo-fi",
  "lo-fi": "lo-fi",
  "dnb": "drum & bass",
  "d&b": "drum & bass",
  "drum and bass": "drum & bass",
  "drum & bass": "drum & bass",
  "electronica": "electronic",
  "electronic": "electronic",
  "rnb": "r&b",
  "r and b": "r&b",
  "r&b": "r&b",
  "synth pop": "synthpop",
  "synth-pop": "synthpop",
  "synthpop": "synthpop",
};

function makeMatchKey(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .toLowerCase();
}

/**
 * Normalize a raw genre value (scalar, comma/semicolon-delimited string, or
 * string array) into deduplicated, first-seen-order canonical display tokens.
 * Pure and deterministic — does not read or write persisted data.
 */
export function normalizeGenreTokens(value: RawGenreValue): string[] {
  if (value == null) return [];

  const sources: string[] = typeof value === "string" ? [value] : [...value];

  const tokens: string[] = [];
  const seen = new Set<string>();

  for (const source of sources) {
    if (typeof source !== "string") continue;
    for (const piece of source.split(/[,;]/)) {
      const trimmed = piece.trim().replace(/\s+/g, " ");
      if (!trimmed) continue;

      const matchKey = makeMatchKey(trimmed);
      const repaired = MALFORMED_REPAIRS[matchKey];
      const candidates = repaired ?? [trimmed];

      for (const candidate of candidates) {
        const candidateKey = makeMatchKey(candidate);
        const canonical = (CANONICAL_ALIASES[candidateKey] ?? candidate).toLowerCase();
        if (seen.has(canonical)) continue;
        seen.add(canonical);
        tokens.push(canonical);
      }
    }
  }

  return tokens;
}

/**
 * Convenience wrapper: normalize and merge a track's `genre` and `genres`
 * fields into one deduplicated canonical token list (first-seen order,
 * `genre` before `genres`).
 */
export function normalizeTrackGenreTokens(
  track: Pick<Track, "genre" | "genres">,
): string[] {
  return normalizeGenreTokens([
    ...(track.genre ? [track.genre] : []),
    ...(track.genres ?? []),
  ]);
}

/**
 * Shared Genre-index eligibility rule. A canonical token that is an exact
 * match for a known non-genre role (e.g. "closing") is excluded from Genre
 * taxonomy counts, cards, filters, and search options — but the token itself
 * is never altered or hidden from non-index consumers that need lossless
 * values. Exact match only: "closing-time jazz" is unaffected.
 */
export function isGenreIndexToken(token: string): boolean {
  return !GENRE_INDEX_EXCLUDED.has(token.toLowerCase());
}

/**
 * Convenience wrapper: normalizeTrackGenreTokens() filtered through the
 * shared Genre-index eligibility rule. Use this (not normalizeTrackGenreTokens)
 * for any Genre-index surface — aggregation, cards, filters, search options.
 */
export function normalizeTrackGenreIndexTokens(
  track: Pick<Track, "genre" | "genres">,
): string[] {
  return normalizeTrackGenreTokens(track).filter(isGenreIndexToken);
}
