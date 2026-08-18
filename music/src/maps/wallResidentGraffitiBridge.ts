// ── wallResidentGraffitiBridge ────────────────────────────────────────────────
// 0818_SUBWAY_Resident_Graffiti_Artists_v1.0.0_BUILD — §5, §23, §26-28
//
// The bridge into wall/'s SubwayResidentGraffitiArtistAuthority (identity,
// style profiles, eligible-surface resolution, history), plus the full
// create-and-place ORCHESTRATION (BUILD §23): generate → preview → save →
// resolve surface → place → record history. Every persistence step reuses
// the exact same canonical calls the human Drawing App already uses
// (wallGraffitiArtworkBridge.ts) — this file adds zero parallel
// save/placement logic (BUILD §30).

import { generateArtworkIntent, generateStrokesFromIntent } from "../graffiti/residentArtworkGenerator";
import { saveDrawingAsArtwork, placeArtworkOnSurface, markArtworkDraft } from "./wallGraffitiArtworkBridge";
import type { ResidentArtworkIntent, SerializedArtworkPayload, Stroke } from "../graffiti/graffitiTypes";
import type {
  ResidentGraffitiArtist, GraffitiStyleProfile, EligibleSurfaceResolution, ResidentAuthorityDiagnostics,
  ResidentArtworkHistoryEntry, ResidentPlacementHistoryEntry,
} from "../data/subwayResidentGraffitiTypes";

type MutationResult<T> = { ok: boolean; reason?: string; data?: T };
type ResidentGlobal = {
  ensureSeeded: () => { ok: boolean; residentCount: number };
  getResident: (id: string) => ResidentGraffitiArtist | null;
  getAllResidents: () => ResidentGraffitiArtist[];
  getStyleProfile: (id: string) => GraffitiStyleProfile | null;
  getAllStyleProfiles: () => GraffitiStyleProfile[];
  getArtworkHistory: (residentId: string) => ResidentArtworkHistoryEntry[];
  getPlacementHistory: (residentId: string) => ResidentPlacementHistoryEntry[];
  resolveEligibleSurface: (residentId: string, opts?: { now?: number; rand?: () => number }) => EligibleSurfaceResolution;
  recordArtworkCreated: (residentId: string, entry: Record<string, unknown>) => MutationResult<true>;
  recordPlacementCreated: (residentId: string, entry: Record<string, unknown>) => MutationResult<true>;
  getDiagnostics: () => ResidentAuthorityDiagnostics;
  subscribe: (fn: () => void) => () => void;
};

declare global {
  interface WallSBE {
    SubwayResidentGraffitiArtistAuthority?: ResidentGlobal;
  }
}

export type BridgeResult<T> = { ok: true; data: T } | { ok: false; error: string };

function authority(): ResidentGlobal | null { return window.SBE?.SubwayResidentGraffitiArtistAuthority ?? null; }

export function isBridgeAvailable(): boolean { return authority() != null; }

export function ensureResidentsSeeded(): BridgeResult<{ residentCount: number }> {
  const a = authority();
  if (!a) return { ok: false, error: "authority_unavailable" };
  return { ok: true, data: a.ensureSeeded() };
}

export function listResidents(): BridgeResult<ResidentGraffitiArtist[]> {
  const a = authority();
  if (!a) return { ok: false, error: "authority_unavailable" };
  return { ok: true, data: a.getAllResidents() };
}

export function getResident(id: string): BridgeResult<ResidentGraffitiArtist> {
  const a = authority();
  if (!a) return { ok: false, error: "authority_unavailable" };
  const r = a.getResident(id);
  if (!r) return { ok: false, error: "not_found" };
  return { ok: true, data: r };
}

export function getStyleProfile(id: string): BridgeResult<GraffitiStyleProfile> {
  const a = authority();
  if (!a) return { ok: false, error: "authority_unavailable" };
  const s = a.getStyleProfile(id);
  if (!s) return { ok: false, error: "not_found" };
  return { ok: true, data: s };
}

export function getArtworkHistory(residentId: string): BridgeResult<ResidentArtworkHistoryEntry[]> {
  const a = authority();
  if (!a) return { ok: false, error: "authority_unavailable" };
  return { ok: true, data: a.getArtworkHistory(residentId) };
}

export function getPlacementHistory(residentId: string): BridgeResult<ResidentPlacementHistoryEntry[]> {
  const a = authority();
  if (!a) return { ok: false, error: "authority_unavailable" };
  return { ok: true, data: a.getPlacementHistory(residentId) };
}

export function getResidentDiagnostics(): BridgeResult<ResidentAuthorityDiagnostics> {
  const a = authority();
  if (!a) return { ok: false, error: "authority_unavailable" };
  return { ok: true, data: a.getDiagnostics() };
}

export function subscribe(fn: () => void): () => void {
  const a = authority();
  if (!a) return () => {};
  return a.subscribe(fn);
}

// ── Preview generation (BUILD §12, §32 "prefer generating preview before
//    persistent save") — pure, no side effects, nothing saved yet. ────────
export interface ResidentPreview {
  intent: ResidentArtworkIntent;
  strokes: Stroke[];
  resident: ResidentGraffitiArtist;
  style: GraffitiStyleProfile;
}

export function generateResidentPreview(residentId: string, seed: number, canvasWidth: number, canvasHeight: number): BridgeResult<ResidentPreview> {
  const a = authority();
  if (!a) return { ok: false, error: "authority_unavailable" };
  const resident = a.getResident(residentId);
  if (!resident) return { ok: false, error: "resident_not_found" };
  const style = a.getStyleProfile(resident.styleProfileId);
  if (!style) return { ok: false, error: "style_profile_not_found" };

  const intent = generateArtworkIntent(resident, style, seed, Date.now());
  intent.compositionBounds = { width: canvasWidth, height: canvasHeight };
  const strokes = generateStrokesFromIntent(intent, style);
  return { ok: true, data: { intent, strokes, resident, style } };
}

// ── Full create-and-place flow (BUILD §23) ────────────────────────────────
// select Resident → resolve style → create artwork intent → generate
// structured strokes [already done by generateResidentPreview above] →
// save canonical Artwork → resolve eligible surface → create canonical
// Placement → update Resident history references. Never bypasses
// save/placement authority (BUILD §23 explicit requirement).
export interface ResidentPlacementOutcome {
  artworkId: string;
  placed: boolean;
  placementId?: string;
  covered?: string | null;
  surfaceId?: string;
  reason?: string; // present when placed === false — a safe, explicit failure (BUILD §25), artwork still saved (marked draft)
}

export function createAndPlaceResidentArtwork(preview: ResidentPreview, canvasWidth: number, canvasHeight: number): BridgeResult<ResidentPlacementOutcome> {
  const a = authority();
  if (!a) return { ok: false, error: "authority_unavailable" };

  const payload: SerializedArtworkPayload = {
    version: 1, canvasWidth, canvasHeight, strokes: preview.strokes,
    targetMode: { kind: "sticker" }, // Resident pieces aren't tied to a drawing-session target mode; the real target is the resolved surface below
  };
  const saveResult = saveDrawingAsArtwork({
    payload, sourceType: "drawing",
    creatorType: "resident", creatorId: preview.resident.id,
    title: `${preview.resident.tagName} — ${preview.style.label}`,
  });
  if (!saveResult.ok) return { ok: false, error: saveResult.error };
  const artwork = saveResult.data;

  const now = Date.now();
  a.recordArtworkCreated(preview.resident.id, {
    artworkId: artwork.id, createdAt: now, status: artwork.status,
    styleProfileId: preview.style.id, generationSeed: preview.intent.seed,
    toolSequence: preview.intent.toolSequence, palette: preview.intent.palette,
  });

  const surfaceResolution = a.resolveEligibleSurface(preview.resident.id, { now });
  if (!surfaceResolution.ok || !surfaceResolution.surface) {
    // BUILD §25 — safe failure: never fabricate a target, never leave an
    // orphan Placement (none was ever attempted). The real saved Artwork
    // is preserved, explicitly marked draft/unplaced.
    markArtworkDraft(artwork.id);
    return { ok: true, data: { artworkId: artwork.id, placed: false, reason: surfaceResolution.reason ?? "no_eligible_surface" } };
  }

  const placeResult = placeArtworkOnSurface({ artworkId: artwork.id, surfaceId: surfaceResolution.surface.id });
  if (!placeResult.ok) {
    markArtworkDraft(artwork.id);
    return { ok: true, data: { artworkId: artwork.id, placed: false, reason: placeResult.error } };
  }

  a.recordPlacementCreated(preview.resident.id, {
    placementId: placeResult.data.id, artworkId: artwork.id, surfaceId: surfaceResolution.surface.id,
    routeId: surfaceResolution.surface.routeId, logicalCarId: surfaceResolution.surface.logicalCarId, startedAt: now,
  });

  return { ok: true, data: { artworkId: artwork.id, placed: true, placementId: placeResult.data.id, covered: placeResult.data.covered ?? null, surfaceId: surfaceResolution.surface.id } };
}
