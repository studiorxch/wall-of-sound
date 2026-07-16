import type { Track } from "../data/trackTypes";
import type { DuplicatePreferredVariant } from "../data/playProjectTypes";

const VARIANT_TOKENS = new Set([
  "s01", "s02", "s03", "v1", "v2", "v3",
  "alt", "alternate", "mix", "remix", "edit",
  "extended", "short", "instrumental", "inst",
  "remaster", "remastered", "loop", "demo", "draft",
  "take", "version", "final", "vocal", "acapella",
  "dub", "radio", "club", "original",
]);

const S01_TOKENS = new Set(["s01", "s02", "s03", "demo", "draft", "take"]);

/**
 * Returns a normalized family key for a track.
 * Tracks with the same key are considered duplicate variants.
 */
export function getDuplicateFamilyKey(track: Track): string {
  const raw = track.title ?? track.trackId;
  return raw
    .toLowerCase()
    // Remove parenthetical and bracketed suffixes
    .replace(/[\(\[][^\)\]]*[\)\]]/g, " ")
    // Remove dash-separated suffixes that are variant tokens
    .replace(/-[^-]+$/, (m) => {
      const token = m.slice(1).trim().toLowerCase().replace(/\s+/g, "");
      return VARIANT_TOKENS.has(token) ? "" : m;
    })
    // Remove standalone variant tokens
    .split(/[\s\-_]+/)
    .filter((token) => !VARIANT_TOKENS.has(token.replace(/[^a-z0-9]/g, "")))
    .join(" ")
    .trim()
    // Remove trailing punctuation
    .replace(/[^a-z0-9]+$/, "")
    .trim() || track.trackId;
}

/** Returns true if the track looks like an S01/draft variant. */
function isS01Variant(track: Track): boolean {
  const title = (track.title ?? "").toLowerCase();
  return Array.from(S01_TOKENS).some((token) => {
    const re = new RegExp(`\\b${token}\\b`);
    return re.test(title);
  });
}

/**
 * Returns a sort score for the track relative to preferredVariant.
 * Lower = more preferred.
 */
export function rankDuplicateVariant(
  track: Track,
  preferredVariant: DuplicatePreferredVariant,
): number {
  switch (preferredVariant) {
    case "non_s01":
      return isS01Variant(track) ? 1 : 0;
    case "highest_rating":
      return -(track.rating ?? 0);
    case "longest":
      return -(track.durationSeconds ?? 0);
    case "shortest":
      return track.durationSeconds ?? 0;
    case "newest":
      // Track has no createdAt/updatedAt field — analysisUpdatedAt/audioLastScannedAt
      // are the closest legitimate "most recently touched" timestamps available.
      return -(new Date(track.analysisUpdatedAt ?? track.audioLastScannedAt ?? 0).getTime());
    case "none":
    default:
      return 0;
  }
}
