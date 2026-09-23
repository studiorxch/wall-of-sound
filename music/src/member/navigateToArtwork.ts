import type { Artwork, ArtworkBounds } from "@studiorich/member-identity";

/**
 * Member V1A -- the canonical Artwork reopen/navigation primitive.
 *
 * No new document format, no re-import, no Mark duplication: this only
 * converts an EXISTING Artwork's already-persisted `composition.bounds`
 * into a camera target. The Artwork document remains the sole authority for
 * its own composition; this module never touches Marks.
 */

export type LngLatBoundsBox = readonly [readonly [number, number], readonly [number, number]];

/** Only geographic bounds are navigable on a map camera; local/Blackbook bounds have no camera concept. */
export function artworkBoundsToLngLatBox(bounds: ArtworkBounds): LngLatBoundsBox | null {
  if (!("west" in bounds)) return null;
  const { west, south, east, north } = bounds;
  if (![west, south, east, north].every(Number.isFinite)) return null;
  if (west === east || south === north) return null;
  return [
    [west, south],
    [east, north],
  ];
}

export interface MapCameraTarget {
  readonly fitBounds: (bounds: LngLatBoundsBox, options?: Record<string, unknown>) => void;
}

export interface NavigateToArtworkOptions {
  /** Only navigate when the Artwork actually belongs to this surface -- prevents silently panning the Subway camera for a Blackbook (non-geographic) Artwork. */
  readonly expectedSurfaceId: string;
  readonly padding?: number;
}

/**
 * Returns true if navigation was actually performed. Returns false (without
 * throwing) for a non-matching surface or non-navigable bounds -- the caller
 * decides how to surface that (e.g. "this Artwork has no map location").
 */
export function navigateToArtwork(
  camera: MapCameraTarget,
  artwork: Artwork,
  { expectedSurfaceId, padding = 80 }: NavigateToArtworkOptions,
): boolean {
  if (artwork.surfaceId !== expectedSurfaceId) return false;
  const box = artworkBoundsToLngLatBox(artwork.composition.bounds);
  if (!box) return false;
  camera.fitBounds(box, { padding });
  return true;
}
