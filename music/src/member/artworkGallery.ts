import type { Artwork } from "@studiorich/member-identity";

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

/** No `title` field exists on the Artwork schema (Member V1A adds none) -- this is a UI fallback label only, never persisted. */
export function deriveArtworkTitle(_artwork: Artwork): string {
  return "Untitled Artwork";
}

const SURFACE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  "map:new-york": "Subway — New York",
});

/** Falls back to the raw surfaceId for any surface not yet given a human label, rather than hiding the context entirely. */
export function deriveArtworkSurfaceLabel(surfaceId: string): string {
  return SURFACE_LABELS[surfaceId] ?? surfaceId;
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
