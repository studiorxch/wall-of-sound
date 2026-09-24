export interface GeographicArtworkPoint {
  readonly longitude: number;
  readonly latitude: number;
}
export interface LocalArtworkPoint {
  readonly x: number;
  readonly y: number;
}
export interface GeographicBounds { readonly west: number; readonly south: number; readonly east: number; readonly north: number }
export interface LocalBounds { readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number }
export type ArtworkBounds = GeographicBounds | LocalBounds;
import type { ArtMaterialId, MarkMaterialIdentity } from "./artSupplyTypes.js";

export interface GeographicArtworkStroke {
  readonly id: string;
  readonly points: readonly GeographicArtworkPoint[];
  readonly style: {
    readonly color: string;
    readonly width: number;
    readonly opacity: number;
  };
}
/** `authoredZoom`: the Mapbox camera zoom when this geographic Mark's gesture began (Map Art Supplies Calibration V1 Revision 7 -- see mapZoomScale.ts in music/src/member/). Geographic-only: a Blackbook/local-2d Mark has no camera zoom concept and never carries this field. Optional so legacy Marks (authored before this revision) remain valid -- render-time falls back to a shared reference zoom for those. */
export interface GeographicStrokeMark { readonly id: string; readonly type: "stroke"; readonly createdAt: Date; readonly geometry: { readonly format: "geographic-stroke-v1"; readonly points: readonly GeographicArtworkPoint[] }; readonly style: GeographicArtworkStroke["style"]; readonly material?: MarkMaterialIdentity; readonly authoredZoom?: number }
export interface LocalStrokeMark { readonly id: string; readonly type: "stroke"; readonly createdAt: Date; readonly geometry: { readonly format: "local-2d-stroke-v1"; readonly points: readonly LocalArtworkPoint[] }; readonly style: GeographicArtworkStroke["style"]; readonly material?: MarkMaterialIdentity }
export type StrokeMark = GeographicStrokeMark | LocalStrokeMark;
export interface LocalMaterialErasureMark { readonly id: string; readonly type: "material-erasure"; readonly createdAt: Date; readonly geometry: { readonly format: "local-2d-erasure-v1"; readonly points: readonly LocalArtworkPoint[] }; readonly targetMaterialId: ArtMaterialId; readonly width: number }
/** See GeographicStrokeMark.authoredZoom's doc -- same semantics for the geographic Eraser Mark. */
export interface GeographicMaterialErasureMark { readonly id: string; readonly type: "material-erasure"; readonly createdAt: Date; readonly geometry: { readonly format: "geographic-erasure-v1"; readonly points: readonly GeographicArtworkPoint[] }; readonly targetMaterialId: ArtMaterialId; readonly width: number; readonly authoredZoom?: number }
export type MaterialErasureMark = LocalMaterialErasureMark | GeographicMaterialErasureMark;
export type ArtworkMark = StrokeMark | MaterialErasureMark;

/**
 * ARTWORK V2 -- an explicit, durable discriminator. Deliberately NOT the
 * same concept as coordinate system: "map" today means geographic
 * coordinates and "blank" means local Cartesian coordinates, but a future
 * Artwork type is not required to keep that 1:1 mapping (see
 * artworkTypes' own module doc in the V2 recon -- this field says WHAT the
 * Artwork is, not HOW its Marks are positioned).
 */
export type ArtworkType = "map" | "blank";

/**
 * Blackbook Spatial Workspace V1 -- the authored, content-INDEPENDENT
 * Blackbook page/composition frame, in Artwork-local document coordinates.
 * Deliberately NOT `composition.bounds` (that field is content-derived --
 * the bounding box of whatever Marks currently exist, also used for
 * proximity-based gallery matching and thumbnail fitting; a page frame must
 * exist even on an empty page and never changes as content is drawn on or
 * off it). Optional: only Blackbook sets one today; Map and Blank Artworks
 * have no page frame and are unaffected. `x`/`y` are the frame's top-left
 * corner -- not assumed to be the workspace origin, so a future multi-Surface
 * workspace can place more than one frame at different positions without a
 * schema change.
 */
export interface PageFrame {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Artwork {
  readonly id: string;
  readonly creatorId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly surfaceId: string;
  /** ARTWORK V2 -- immutable after creation (rules-enforced, mirroring surfaceId's own immutability). */
  readonly artworkType: ArtworkType;
  /**
   * ARTWORK V2 -- presentation metadata, never Artwork identity (the
   * Firestore document id remains canonical). Empty string means "no
   * meaningful title" -- both true legacy documents (created before this
   * field existed) and any caller that doesn't supply one (e.g. Blackbook,
   * which has its own separate gallery and never displays this field)
   * decode to `""`, not `null`, so callers never need a null-check just to
   * render a fallback. The Member-facing "Untitled Artwork"/date-based
   * fallback lives entirely in `music/src/member/artworkGallery.ts` -- this
   * type never invents a default itself.
   */
  readonly title: string;
  readonly composition: { readonly bounds: ArtworkBounds; readonly startedAt: Date; readonly lastEditedAt: Date };
  readonly marks: readonly ArtworkMark[];
  readonly state: "draft" | "archived";
  readonly visibility: "private";
  /** Blackbook Spatial Workspace V1 -- see `PageFrame`'s own doc. Absent for Map/Blank Artworks. Immutable after creation (rules-enforced). */
  readonly pageFrame?: PageFrame;
}
export type MapArtwork = Artwork;

export interface CreateArtworkInput {
  readonly creatorId: string;
  readonly surfaceId: string;
  readonly mark: ArtworkMark;
  /** Optional so existing callers (e.g. Blackbook's bridge) keep compiling unchanged -- the repository defaults this to `"map"` when omitted. */
  readonly artworkType?: ArtworkType;
  /** Optional; defaults to `""` (no title) when omitted. */
  readonly title?: string;
  /** Optional; only a Blackbook-style bounded-page caller supplies this. */
  readonly pageFrame?: PageFrame;
}
export type CreateMapArtworkInput = CreateArtworkInput;

export interface ArtworkRepository {
  createArtwork?(input: CreateArtworkInput): Promise<Artwork>;
  listOwnedArtwork?(creatorId: string): Promise<readonly Artwork[]>;
  appendOwnedArtworkMark(artworkId: string, creatorId: string, mark: ArtworkMark): Promise<Artwork>;
  removeOwnedArtworkMark(artworkId: string, creatorId: string, markId: string): Promise<Artwork | null>;
  deleteOwnedArtwork(artworkId: string, creatorId: string): Promise<void>;
  /** ARTWORK V2 -- renames an owned Artwork. Never changes the Artwork id; updates `updatedAt`. */
  renameOwnedArtwork(artworkId: string, creatorId: string, title: string): Promise<Artwork>;
  /** Backward-compatible Map aliases. */
  createMapArtwork(input: CreateMapArtworkInput): Promise<MapArtwork>;
  listOwnedMapArtwork(creatorId: string): Promise<readonly MapArtwork[]>;
}
