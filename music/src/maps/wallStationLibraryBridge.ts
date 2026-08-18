// ── wallStationLibraryBridge ──────────────────────────────────────────────────
// 0818_SUBWAY_Station_Library_Foundation_v1.0.0
//
// The one narrow bridge between the centralized Library's MAPS interface and
// Wall's Station Library authority (window.SBE.MTASubwayStationLibrary). Wall
// remains the sole authority: this module never stores a station record
// itself — it only forwards to window.SBE and reports explicit errors
// instead of falling back to stale data, same contract as
// wallOrbProfileBridge.ts / wallGeographicStyleBridge.ts.
//
// window.SBE is populated by plain <script> tags in index.html, loaded from
// wall/systems/transit/ through the /wall-app proxy (vite.config.ts). If
// those scripts failed to load, every function below returns
// { ok: false, error: 'authority_unavailable' } rather than throwing.

import type {
  StationLibraryRecord,
  StationLibraryDuplicateNameGroup,
  StationLibraryDiagnostics,
  StationMapFeature,
  StationStudioRichMetadata,
} from "../data/subwayStationLibraryTypes";

type MutationResult<T = true> = { ok: boolean; reason?: string; data?: T };

type MTASubwayStationLibraryGlobal = {
  VERSION: string;
  importFromStaticModel: () => { ok: boolean; reason?: string; created?: number; updated?: number; unchanged?: number; total?: number };
  getRecord: (id: string) => StationLibraryRecord | null;
  getRecordByAuthoritativeStopId: (gtfsStopId: string) => StationLibraryRecord | null;
  getAllRecords: () => StationLibraryRecord[];
  searchRecords: (query: string) => StationLibraryRecord[];
  getDuplicateNameGroups: () => StationLibraryDuplicateNameGroup[];
  updateStudioRichMetadata: (id: string, partial: Partial<StationStudioRichMetadata>) => MutationResult<StationLibraryRecord>;
  reconcileAuthoritativeLink: (id: string, newGtfsStopId: string, reason?: string) => MutationResult;
  getUnresolvedStaticStops: () => string[];
  getOrphanedLibraryRecords: () => StationLibraryRecord[];
  buildMapFeature: (record: StationLibraryRecord) => StationMapFeature | null;
  buildMapFeatureCollection: (records?: StationLibraryRecord[]) => { type: "FeatureCollection"; features: StationMapFeature[] };
  getDiagnostics: () => StationLibraryDiagnostics;
  subscribe: (fn: () => void) => () => void;
};

type MTASubwayStaticAdapterGlobal = {
  load: () => Promise<{ ok: boolean; reason?: string }>;
  getState: () => { loaded: boolean; loading: boolean };
};

// WallSBE is the shared named interface every wall*Bridge.ts extends — see
// wallGeographicStyleBridge.ts for the base `interface Window { SBE?: WallSBE }`
// declaration (declared once there; never redeclared here).
declare global {
  interface WallSBE {
    MTASubwayStationLibrary?: MTASubwayStationLibraryGlobal;
    MTASubwayStaticAdapter?: MTASubwayStaticAdapterGlobal;
  }
}

export type BridgeResult<T> = { ok: true; data: T } | { ok: false; error: string };

function authority(): MTASubwayStationLibraryGlobal | null {
  return window.SBE?.MTASubwayStationLibrary ?? null;
}

function staticAdapter(): MTASubwayStaticAdapterGlobal | null {
  return window.SBE?.MTASubwayStaticAdapter ?? null;
}

export function isBridgeAvailable(): boolean {
  return authority() != null;
}

// Ensures the underlying static model is loaded, then imports/links it into
// the Station Library. Idempotent — safe to call on every mount; re-running
// against unchanged data creates zero new records (see mtaSubwayStationLibrary.js).
export async function ensureStationsImported(): Promise<BridgeResult<{ created: number; updated: number; unchanged: number; total: number }>> {
  const adapter = staticAdapter();
  const a = authority();
  if (!adapter || !a) return { ok: false, error: "authority_unavailable" };
  if (!adapter.getState().loaded) {
    const loadResult = await adapter.load();
    if (!loadResult.ok) return { ok: false, error: loadResult.reason ?? "static_load_failed" };
  }
  const result = a.importFromStaticModel();
  if (!result.ok) return { ok: false, error: result.reason ?? "import_failed" };
  return { ok: true, data: { created: result.created ?? 0, updated: result.updated ?? 0, unchanged: result.unchanged ?? 0, total: result.total ?? 0 } };
}

export function listStations(): BridgeResult<StationLibraryRecord[]> {
  const a = authority();
  if (!a) return { ok: false, error: "authority_unavailable" };
  return { ok: true, data: a.getAllRecords() };
}

export function getStation(id: string): BridgeResult<StationLibraryRecord> {
  const a = authority();
  if (!a) return { ok: false, error: "authority_unavailable" };
  const rec = a.getRecord(id);
  if (!rec) return { ok: false, error: "not_found" };
  return { ok: true, data: rec };
}

export function searchStations(query: string): BridgeResult<StationLibraryRecord[]> {
  const a = authority();
  if (!a) return { ok: false, error: "authority_unavailable" };
  return { ok: true, data: a.searchRecords(query) };
}

export function getDuplicateNameGroups(): BridgeResult<StationLibraryDuplicateNameGroup[]> {
  const a = authority();
  if (!a) return { ok: false, error: "authority_unavailable" };
  return { ok: true, data: a.getDuplicateNameGroups() };
}

export function updateStudioRichMetadata(id: string, partial: Partial<StationStudioRichMetadata>): BridgeResult<StationLibraryRecord> {
  const a = authority();
  if (!a) return { ok: false, error: "authority_unavailable" };
  const result = a.updateStudioRichMetadata(id, partial);
  if (!result.ok || !result.data) return { ok: false, error: result.reason ?? "update_failed" };
  return { ok: true, data: result.data };
}

export function getDiagnostics(): BridgeResult<StationLibraryDiagnostics> {
  const a = authority();
  if (!a) return { ok: false, error: "authority_unavailable" };
  return { ok: true, data: a.getDiagnostics() };
}

export function buildMapFeature(record: StationLibraryRecord): BridgeResult<StationMapFeature> {
  const a = authority();
  if (!a) return { ok: false, error: "authority_unavailable" };
  const feature = a.buildMapFeature(record);
  if (!feature) return { ok: false, error: "build_failed" };
  return { ok: true, data: feature };
}

export function subscribe(fn: () => void): () => void {
  const a = authority();
  if (!a) return () => {};
  return a.subscribe(fn);
}
