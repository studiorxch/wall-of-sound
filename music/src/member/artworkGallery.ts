import type { Artwork, ArtworkType } from "@studiorich/member-identity";

/**
 * Member V1A -- My Artwork gallery presentation logic. Pure functions only;
 * no persistence, no second Artwork repository. `listOwnedArtwork` already
 * returns the full owned set (sorted oldest-first for hydration purposes);
 * the gallery needs most-recently-updated-first, so that reordering happens
 * here at the presentation layer instead of changing the shared repository's
 * existing sort (other callers depend on its current order).
 */

export function sortArtworksByRecency(artworks: readonly Artwork[]): Artwork[] {
  return [...artworks].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

/**
 * ARTWORK V2 -- `Artwork.title` is now real, persisted presentation
 * metadata (empty string means "no title" -- true legacy documents from
 * before this field existed, or a caller like Blackbook that never
 * displays it). "Untitled Artwork" is kept ONLY as that legacy fallback --
 * every NEW V2 Artwork is created with a real title already resolved
 * client-side (custom, or the date-based default from
 * `resolveDefaultArtworkTitle` below), so this function almost never needs
 * to invent anything for a V2-created document.
 */
export function deriveArtworkTitle(artwork: Artwork): string {
  return artwork.title.trim() || "Untitled Artwork";
}

const ARTWORK_TYPE_LABELS: Readonly<Record<ArtworkType, string>> = Object.freeze({
  map: "Map",
  blank: "Blank",
});

export function deriveArtworkTypeLabel(artworkType: ArtworkType): string {
  return ARTWORK_TYPE_LABELS[artworkType] ?? artworkType;
}

const SURFACE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  "map:new-york": "Subway — New York",
  "blank:default": "Blank Canvas",
});

/** Falls back to the raw surfaceId for any surface not yet given a human label, rather than hiding the context entirely. */
export function deriveArtworkSurfaceLabel(surfaceId: string): string {
  return SURFACE_LABELS[surfaceId] ?? surfaceId;
}

/**
 * ARTWORK V2 -- centralized default-title resolver. `MMDD` (e.g. "0923"),
 * never "Untitled Artwork", for a newly-created V2 Artwork -- that fallback
 * exists only for legacy/title-less documents (see `deriveArtworkTitle`).
 *
 * Collision-safe: inspects the ALREADY-LOADED `sessionArtworkLibrary`
 * projection (passed in as `existingArtworks`) rather than issuing a
 * second Firestore read -- that library is already the authoritative live
 * set of everything owned (Member V1B's own invariant). Numbering is
 * max-existing-suffix + 1, not a plain count, so deleting `0923-2` and
 * creating another Artwork the same day never reissues an already-used
 * title (a `0923-4` sibling, if it existed, would still push the next
 * generated name to `0923-5`, not back to a reused `0923-2`).
 *
 * Deliberately factored out as one small, swappable function: a future
 * Map-specific contextual name (e.g. "Bay Ridge", "Bay Ridge 02") can
 * replace this implementation's body without touching any caller -- no
 * location lookup/reverse geocoding/AI naming is implemented here.
 */
export function resolveDefaultArtworkTitle(existingArtworks: readonly Artwork[], now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const base = `${month}${day}`;

  const pattern = new RegExp(`^${base}(?:-(\\d+))?$`);
  let maxSuffix = 0;
  let baseTaken = false;
  for (const artwork of existingArtworks) {
    const match = pattern.exec(artwork.title.trim());
    if (!match) continue;
    if (match[1] === undefined) baseTaken = true;
    else maxSuffix = Math.max(maxSuffix, Number(match[1]));
  }
  if (!baseTaken && maxSuffix === 0) return base;
  return `${base}-${Math.max(maxSuffix, 1) + 1}`;
}

export function formatArtworkUpdatedAt(updatedAt: Date): string {
  return updatedAt.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatMemberSince(createdAt: Date): string {
  return createdAt.toLocaleDateString(undefined, { year: "numeric", month: "long" });
}
