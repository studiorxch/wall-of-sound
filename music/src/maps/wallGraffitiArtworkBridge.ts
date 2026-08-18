// ── wallGraffitiArtworkBridge ─────────────────────────────────────────────────
// 0818_SUBWAY_Artwork_Creation_Drawing_App_v1.0.0 — BUILD §9, §25
//
// The Drawing App's ONLY path to persistence — reuses
// window.SBE.SubwayArtworkAuthority / SubwayArtworkPlacementAuthority
// exactly as declared in wallRollingStockAdminBridge.ts (same WallSBE
// interface merge, no duplicate global declared here). No parallel
// placement system exists in this file or anywhere under music/src/graffiti/
// (BUILD §30 explicit requirement) — save/place are thin, validated calls
// into the already-proven authorities from the prior build.

import type { SerializedArtworkPayload } from "../graffiti/graffitiTypes";
import type { Artwork, ArtworkPlacement, PlacementTargetType } from "../data/subwayRollingStockAdminTypes";

type MutationResult<T> = { ok: boolean; reason?: string; data?: T };
type ArtworkGlobal = {
  createArtwork: (input: { creatorType: "system" | "user" | "resident" | "invited_artist" | "unknown"; title?: string; sourceType?: string; sourceRef?: string; metadata?: Record<string, unknown> }) => MutationResult<Artwork>;
};
type PlacementGlobal = {
  createPlacement: (input: { artworkId: string; surfaceId: string; targetType: PlacementTargetType; targetId: string }) => MutationResult<ArtworkPlacement> & { covered?: string | null };
};

declare global {
  interface WallSBE {
    SubwayArtworkAuthority?: ArtworkGlobal;
    SubwayArtworkPlacementAuthority?: PlacementGlobal;
  }
}

export type BridgeResult<T> = { ok: true; data: T } | { ok: false; error: string };

function artworkAuthority(): ArtworkGlobal | null { return window.SBE?.SubwayArtworkAuthority ?? null; }
function placementAuthority(): PlacementGlobal | null { return window.SBE?.SubwayArtworkPlacementAuthority ?? null; }

// Save Artwork (BUILD §25 "Save Artwork" — creates sr-art-*, never
// sr-placement-*). `rasterPreviewDataUrl` is optional (BUILD §9: "an
// optional raster preview/export where practical") — stored as
// Artwork.sourceRef, an opaque pointer this bridge never interprets.
export function saveDrawingAsArtwork(input: {
  payload: SerializedArtworkPayload;
  rasterPreviewDataUrl?: string;
  title?: string;
  sourceType: "drawing" | "sticker" | "upload";
}): BridgeResult<Artwork> {
  const authority = artworkAuthority();
  if (!authority) return { ok: false, error: "authority_unavailable" };
  const result = authority.createArtwork({
    creatorType: "user",
    title: input.title,
    sourceType: input.sourceType,
    sourceRef: input.rasterPreviewDataUrl,
    metadata: { strokes: input.payload.strokes, canvasWidth: input.payload.canvasWidth, canvasHeight: input.payload.canvasHeight, targetMode: input.payload.targetMode },
  });
  if (!result.ok || !result.data) return { ok: false, error: result.reason ?? "save_failed" };
  return { ok: true, data: result.data };
}

// Import mode (BUILD §20) — creates an Artwork from an already-existing
// asset (e.g. an uploaded image data URL) rather than structured stroke
// data. Never overwrites an existing artwork — always mints a new sr-art-*.
export function importAssetAsArtwork(input: { assetDataUrl: string; title?: string; sourceMetadata?: Record<string, unknown> }): BridgeResult<Artwork> {
  const authority = artworkAuthority();
  if (!authority) return { ok: false, error: "authority_unavailable" };
  const result = authority.createArtwork({
    creatorType: "user",
    title: input.title,
    sourceType: "upload",
    sourceRef: input.assetDataUrl,
    metadata: input.sourceMetadata ?? {},
  });
  if (!result.ok || !result.data) return { ok: false, error: result.reason ?? "import_failed" };
  return { ok: true, data: result.data };
}

// Place Artwork (BUILD §25 "Place Artwork" — creates sr-placement-*
// against sr-surface-*). Reuses the exact same createPlacement() the
// Rolling Stock admin panel's dev "seed artwork" action already calls —
// no separate code path.
export function placeArtworkOnSurface(input: { artworkId: string; surfaceId: string }): BridgeResult<ArtworkPlacement & { covered?: string | null }> {
  const authority = placementAuthority();
  if (!authority) return { ok: false, error: "authority_unavailable" };
  const result = authority.createPlacement({ artworkId: input.artworkId, surfaceId: input.surfaceId, targetType: "surface", targetId: input.surfaceId });
  if (!result.ok || !result.data) return { ok: false, error: result.reason ?? "placement_failed" };
  return { ok: true, data: { ...result.data, covered: result.covered ?? null } };
}
