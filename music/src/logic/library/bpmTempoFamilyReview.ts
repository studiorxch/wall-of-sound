// 0728F_MUSIC_BPM_Tempo_Family_Review — a review-only heuristic layer on top
// of the existing candidate-preservation system (0728D). Flags a BPM value
// (canonical or a retained low-confidence candidate) as suspicious purely by
// numeric range, computes the plain-arithmetic half/double partner the spec
// explicitly asks for (deliberately simpler than the detector's own
// autocorrelation-derived halfTimeCandidate/doubleTimeCandidate — this is a
// human-facing "does this look like an octave error" prompt, not a second
// detector), and ranks that partner's plausibility against genre as a SOFT
// prior only. Nothing here ever mutates a track — canonical BPM changes only
// when a person clicks an accept action in the review dialog, same as 0728D.

export type TempoFamilyConcern = "none" | "suspicious_low" | "suspicious_high";
export type TempoFamilyGenrePlausibility = "fast_plausible" | "slow_suspicious" | "unknown";

export interface TempoFamilyReview {
  concern: TempoFamilyConcern;
  /** Plain-arithmetic half (high concern) or double (low concern) partner. */
  candidateBpm: number | null;
  genre: string | null;
  genrePlausibility: TempoFamilyGenrePlausibility;
}

export const SUSPICIOUS_LOW_THRESHOLD = 50;
export const SUSPICIOUS_HIGH_THRESHOLD = 150;

// Explicit, closed lists per spec — StudioRich's actual catalog does not
// include hardcore techno/gabber/happy hardcore/speedcore/thrash metal, so
// none of those are ever inferred as "fast justifies a high BPM" even if a
// genre string happened to contain a related word. Matching is substring-
// based on the normalized token so "Drum & Bass" / "drum and bass" / "DnB"
// all resolve the same way as the spec's own spellings.
const FAST_PLAUSIBLE_GENRE_TOKENS = ["jungle", "drum and bass", "drum & bass", "dnb", "d&b", "breakcore", "breakbeat"];
const SLOW_SUSPICIOUS_GENRE_TOKENS = ["ambient", "cinematic", "lo-fi", "lofi", "downtempo", "dream pop", "soft electronic"];

function classifyGenrePlausibility(genre: string | null): TempoFamilyGenrePlausibility {
  if (!genre || !genre.trim()) return "unknown";
  const g = genre.toLowerCase().trim();
  if (FAST_PLAUSIBLE_GENRE_TOKENS.some((t) => g.includes(t))) return "fast_plausible";
  if (SLOW_SUSPICIOUS_GENRE_TOKENS.some((t) => g.includes(t))) return "slow_suspicious";
  return "unknown";
}

/**
 * Classify a single BPM value's tempo-family concern. `bpm` should be
 * whatever value is currently under review — the canonical value for a
 * resolved track, or the retained low-confidence candidate for an
 * unresolved one. `genre` is the track's primary genre token (e.g. from
 * normalizeTrackGenreTokens(track)[0]), a soft prior only — never sole
 * authority (§ "Genre as a soft prior").
 */
export function classifyTempoFamily(bpm: number | null | undefined, genre: string | null | undefined): TempoFamilyReview {
  const genrePlausibility = classifyGenrePlausibility(genre ?? null);
  if (bpm == null || !Number.isFinite(bpm) || bpm <= 0) {
    return { concern: "none", candidateBpm: null, genre: genre ?? null, genrePlausibility };
  }
  if (bpm < SUSPICIOUS_LOW_THRESHOLD) {
    return { concern: "suspicious_low", candidateBpm: +(bpm * 2).toFixed(2), genre: genre ?? null, genrePlausibility };
  }
  if (bpm > SUSPICIOUS_HIGH_THRESHOLD) {
    return { concern: "suspicious_high", candidateBpm: +(bpm / 2).toFixed(2), genre: genre ?? null, genrePlausibility };
  }
  return { concern: "none", candidateBpm: null, genre: genre ?? null, genrePlausibility };
}
