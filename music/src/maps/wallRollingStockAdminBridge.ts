// ── wallRollingStockAdminBridge ───────────────────────────────────────────────
// 0818_SUBWAY_Car_Surface_Artwork_Placement_v1.0.0 — MAPS admin inspection (§24)
//
// The narrow bridge between the centralized Library's MAPS interface and
// Wall's live rolling-stock/surface/artwork/placement authorities
// (window.SBE.SubwayLogicalRollingStockAuthority etc.). Wall remains the
// sole authority — this module never stores a record itself, same contract
// as wallStationLibraryBridge.ts. Also owns starting/stopping THIS origin's
// own realtime poll (see index.html's script-loading comment for why a
// second, independent poll of the public MTA feed is the correct choice
// here rather than trying to share wall's :5500-origin state).

import type {
  LogicalTrain, LogicalConsist, LogicalCar, TrainPositionState,
  CarSurface, Artwork, ArtworkPlacement, ArtworkCreatorType, PlacementTargetType,
  RollingStockDiagnostics, SurfacePlacementDiagnostics,
} from "../data/subwayRollingStockAdminTypes";

type MutationResult<T> = { ok: boolean; reason?: string; data?: T };

type RollingStockGlobal = {
  reconcile: (opts?: { now?: number }) => { ok: boolean };
  getAllLogicalTrains: () => LogicalTrain[];
  getActiveLogicalTrains: () => LogicalTrain[];
  getLogicalTrain: (id: string) => LogicalTrain | null;
  getLogicalConsist: (id: string) => LogicalConsist | null;
  getLogicalCarsForConsist: (consistId: string) => LogicalCar[];
  getPositionState: (logicalTrainId: string) => TrainPositionState | null;
  getDiagnostics: () => RollingStockDiagnostics;
  subscribe: (fn: () => void) => () => void;
};
type CarSurfaceGlobal = {
  ensureSurfacesForCar: (logicalCarId: string) => MutationResult<CarSurface[]> & { surfaces?: CarSurface[]; created?: number };
  getSurfacesForCar: (logicalCarId: string) => CarSurface[];
  getDiagnostics: () => { surfaceCount: number; surfaceCollisionCount: number };
  subscribe: (fn: () => void) => () => void;
};
type ArtworkGlobal = {
  createArtwork: (input: { creatorType: ArtworkCreatorType; title?: string; sourceType?: string; metadata?: Record<string, unknown> }) => MutationResult<Artwork>;
  getArtwork: (id: string) => Artwork | null;
  getAllArtworks: () => Artwork[];
  getDiagnostics: () => { artworkCount: number };
  subscribe: (fn: () => void) => () => void;
};
type PlacementGlobal = {
  createPlacement: (input: { artworkId: string; surfaceId: string; targetType: PlacementTargetType; targetId: string }) => MutationResult<ArtworkPlacement> & { covered?: string | null };
  retirePlacement: (id: string) => MutationResult<ArtworkPlacement>;
  getActivePlacementForSurface: (surfaceId: string) => ArtworkPlacement | null;
  getPlacementHistoryForSurface: (surfaceId: string) => ArtworkPlacement[];
  getDiagnostics: () => SurfacePlacementDiagnostics;
  subscribe: (fn: () => void) => () => void;
};
type PollingRuntimeGlobal = { start: (opts: { groupIds: string[] }) => boolean; stop: () => boolean; isRunning: () => boolean };
type TransitStoreGlobal = { loadStatic: () => Promise<{ ok: boolean }>; getDiagnostics: () => { staticLoaded: boolean } };
type FeedSourceInventoryGlobal = { getRealtimeSources: () => Array<{ id: string }> };

declare global {
  interface WallSBE {
    SubwayLogicalRollingStockAuthority?: RollingStockGlobal;
    SubwayCarSurfaceAuthority?: CarSurfaceGlobal;
    SubwayArtworkAuthority?: ArtworkGlobal;
    SubwayArtworkPlacementAuthority?: PlacementGlobal;
    MTASubwayPollingRuntime?: PollingRuntimeGlobal;
    MTASubwayTransitStore?: TransitStoreGlobal;
    MTASubwayFeedSourceInventory?: FeedSourceInventoryGlobal;
  }
}

export type BridgeResult<T> = { ok: true; data: T } | { ok: false; error: string };

function rollingStock(): RollingStockGlobal | null { return window.SBE?.SubwayLogicalRollingStockAuthority ?? null; }
function surfaces(): CarSurfaceGlobal | null { return window.SBE?.SubwayCarSurfaceAuthority ?? null; }
function artwork(): ArtworkGlobal | null { return window.SBE?.SubwayArtworkAuthority ?? null; }
function placements(): PlacementGlobal | null { return window.SBE?.SubwayArtworkPlacementAuthority ?? null; }
function pollingRuntime(): PollingRuntimeGlobal | null { return window.SBE?.MTASubwayPollingRuntime ?? null; }
function transitStore(): TransitStoreGlobal | null { return window.SBE?.MTASubwayTransitStore ?? null; }
function feedInventory(): FeedSourceInventoryGlobal | null { return window.SBE?.MTASubwayFeedSourceInventory ?? null; }

export function isBridgeAvailable(): boolean {
  return rollingStock() != null && surfaces() != null && artwork() != null && placements() != null;
}

// Starts this origin's own independent live poll (all real realtime groups)
// so the admin panel has genuine live logical trains to browse — idempotent,
// safe to call on every mount. See index.html's comment for why this is a
// deliberate second consumer of the public feed, not a bug.
export async function ensureLiveTracking(): Promise<BridgeResult<true>> {
  const store = transitStore();
  const poll = pollingRuntime();
  const inv = feedInventory();
  if (!store || !poll || !inv) return { ok: false, error: "authority_unavailable" };
  if (!store.getDiagnostics().staticLoaded) {
    const result = await store.loadStatic();
    if (!result.ok) return { ok: false, error: "static_load_failed" };
  }
  if (!poll.isRunning()) {
    const groupIds = inv.getRealtimeSources().map((s) => s.id.replace("mta_subway_gtfs_rt_", ""));
    poll.start({ groupIds });
  }
  return { ok: true, data: true };
}

export function stopLiveTracking(): void {
  pollingRuntime()?.stop();
}

export function reconcile(): void {
  rollingStock()?.reconcile();
}

export function listActiveTrains(): BridgeResult<LogicalTrain[]> {
  const rs = rollingStock();
  if (!rs) return { ok: false, error: "authority_unavailable" };
  return { ok: true, data: rs.getActiveLogicalTrains() };
}

export function getTrain(id: string): BridgeResult<LogicalTrain> {
  const rs = rollingStock();
  if (!rs) return { ok: false, error: "authority_unavailable" };
  const t = rs.getLogicalTrain(id);
  if (!t) return { ok: false, error: "not_found" };
  return { ok: true, data: t };
}

export function getConsist(id: string): BridgeResult<LogicalConsist> {
  const rs = rollingStock();
  if (!rs) return { ok: false, error: "authority_unavailable" };
  const c = rs.getLogicalConsist(id);
  if (!c) return { ok: false, error: "not_found" };
  return { ok: true, data: c };
}

export function getCarsForConsist(consistId: string): BridgeResult<LogicalCar[]> {
  const rs = rollingStock();
  if (!rs) return { ok: false, error: "authority_unavailable" };
  return { ok: true, data: rs.getLogicalCarsForConsist(consistId) };
}

export function getPositionState(logicalTrainId: string): BridgeResult<TrainPositionState | null> {
  const rs = rollingStock();
  if (!rs) return { ok: false, error: "authority_unavailable" };
  return { ok: true, data: rs.getPositionState(logicalTrainId) };
}

export function ensureSurfacesForCar(logicalCarId: string): BridgeResult<CarSurface[]> {
  const sf = surfaces();
  if (!sf) return { ok: false, error: "authority_unavailable" };
  const result = sf.ensureSurfacesForCar(logicalCarId);
  if (!result.ok) return { ok: false, error: result.reason ?? "ensure_failed" };
  return { ok: true, data: result.surfaces ?? [] };
}

export function getSurfacesForCar(logicalCarId: string): BridgeResult<CarSurface[]> {
  const sf = surfaces();
  if (!sf) return { ok: false, error: "authority_unavailable" };
  return { ok: true, data: sf.getSurfacesForCar(logicalCarId) };
}

export function listArtworks(): BridgeResult<Artwork[]> {
  const a = artwork();
  if (!a) return { ok: false, error: "authority_unavailable" };
  return { ok: true, data: a.getAllArtworks() };
}

export function createSeedArtwork(title: string): BridgeResult<Artwork> {
  const a = artwork();
  if (!a) return { ok: false, error: "authority_unavailable" };
  const result = a.createArtwork({ creatorType: "system", title, sourceType: "seed" });
  if (!result.ok || !result.data) return { ok: false, error: result.reason ?? "create_failed" };
  return { ok: true, data: result.data };
}

export function placeArtwork(input: { artworkId: string; surfaceId: string; targetType: PlacementTargetType; targetId: string }): BridgeResult<ArtworkPlacement & { covered?: string | null }> {
  const p = placements();
  if (!p) return { ok: false, error: "authority_unavailable" };
  const result = p.createPlacement(input);
  if (!result.ok || !result.data) return { ok: false, error: result.reason ?? "placement_failed" };
  return { ok: true, data: { ...result.data, covered: result.covered ?? null } };
}

export function retirePlacement(id: string): BridgeResult<ArtworkPlacement> {
  const p = placements();
  if (!p) return { ok: false, error: "authority_unavailable" };
  const result = p.retirePlacement(id);
  if (!result.ok || !result.data) return { ok: false, error: result.reason ?? "retire_failed" };
  return { ok: true, data: result.data };
}

export function getActivePlacementForSurface(surfaceId: string): BridgeResult<ArtworkPlacement | null> {
  const p = placements();
  if (!p) return { ok: false, error: "authority_unavailable" };
  return { ok: true, data: p.getActivePlacementForSurface(surfaceId) };
}

export function getPlacementHistoryForSurface(surfaceId: string): BridgeResult<ArtworkPlacement[]> {
  const p = placements();
  if (!p) return { ok: false, error: "authority_unavailable" };
  return { ok: true, data: p.getPlacementHistoryForSurface(surfaceId) };
}

export function subscribe(fn: () => void): () => void {
  const rs = rollingStock(), sf = surfaces(), a = artwork(), p = placements();
  const unsubs = [rs?.subscribe(fn), sf?.subscribe(fn), a?.subscribe(fn), p?.subscribe(fn)].filter((u): u is () => void => !!u);
  return () => unsubs.forEach((u) => u());
}
