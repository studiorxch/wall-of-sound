// ── wallGeographicStyleBridge ─────────────────────────────────────────────────
// 0729_STUDIORICH_Centralized_Library_MAPS_Integration; renamed from
// wallPaletteBridge by 0729D_MAPS_Vehicle_Overlay_Libraries_Foundation's
// terminology-migration gate.
//
// The one narrow bridge between the centralized Library's MAPS interface and
// Wall's Geographic Style authority (window.SBE.MapsGeographicStyleAuthority).
// Wall remains the sole authority: this module never stores a Geographic
// Style record itself — it only forwards to window.SBE and reports explicit
// errors instead of falling back to stale data, per spec §9.1.
//
// window.SBE is populated by plain <script> tags in index.html, loaded from
// wall/systems/presentation/ through the /wall-app proxy (vite.config.ts).
// If those scripts failed to load (Wall's dev server unreachable), every
// function below returns { ok: false, error: 'authority_unavailable' }
// rather than throwing or silently rendering empty.

export type GeographicStyleRecord = {
  id: string;
  title: string;
  values: Record<string, string>;
  createdAt: number;
  updatedAt: number;
};

export type RegistryRecord = {
  id: string;
  label: string;
  group: string;
  source: string;
  // Always present on every real record (confirmed against the live
  // registry) — declared explicitly so consumers like geographicTargets.ts
  // don't have to work through `unknown` from the index signature below.
  sourceObject: string;
  sourceProperty: string;
  currentValue: string;
  // "opacity"/"boolean" added by 0729_MAPS_Visual_Property_Authority_Audit —
  // still just a string in the style's values dict either way (numeric
  // "0.55" or "true"/"false"), never a second value type.
  valueKind: "solid" | "expression" | "derived" | "opacity" | "boolean";
  [key: string]: unknown;
};

type MutationResult = { ok: boolean; reason?: string; noop?: boolean };

type MapsGeographicStyleAuthorityGlobal = {
  VERSION: string;
  init: (map: unknown) => { ok: boolean; wiredCount?: number; activeId?: string };
  isInitialized: () => boolean;
  getRegistry: () => RegistryRecord[];
  listGeographicStyles: () => GeographicStyleRecord[];
  getGeographicStyle: (id: string) => GeographicStyleRecord | null;
  createGeographicStyle: (title?: string) => GeographicStyleRecord;
  duplicateGeographicStyle: (sourceId: string) => GeographicStyleRecord | null;
  renameGeographicStyle: (id: string, title: string) => MutationResult;
  setPropertyValue: (styleId: string, propId: string, value: string) => MutationResult;
  activateGeographicStyle: (id: string) => MutationResult;
  previewGeographicStyle: (id: string) => MutationResult;
  endPreview: () => MutationResult;
  getActiveId: () => string;
  getPreviewId: () => string | null;
  subscribe: (fn: () => void) => () => void;
  DEFAULT_GEOGRAPHIC_STYLE_ID: string;
};

// WallSBE is a plain named interface, not an inline object literal, so every
// wall*Bridge.ts file can separately `declare global { interface WallSBE {...} }`
// to add its own properties — TypeScript merges named-interface declarations
// across files cleanly. An inline `SBE?: { ... }` object-literal augmentation
// per file (the pattern this replaces) does NOT merge safely once 3+ files
// each redeclare `Window.SBE` with a different literal shape — confirmed via
// `tsc -p tsconfig.app.json` (the project's real typecheck entry point; the
// bare `tsc --noEmit` at the repo root is a no-op against this project's
// `"files": []` + references tsconfig and silently reports success either way).
declare global {
  interface WallSBE {
    MapsGeographicStyleAuthority?: MapsGeographicStyleAuthorityGlobal;
    MapsGeographicStyleRegistry?: unknown;
    MapsGeographicStyleApplyAdapters?: unknown;
    MapsGeographicStyleSeeds?: unknown;
  }
  interface Window {
    SBE?: WallSBE;
  }
}

export type BridgeResult<T> = { ok: true; data: T } | { ok: false; error: string };

function authority(): MapsGeographicStyleAuthorityGlobal | null {
  return window.SBE?.MapsGeographicStyleAuthority ?? null;
}

export function isBridgeAvailable(): boolean {
  return authority() != null;
}

export function isAuthorityInitialized(): boolean {
  return authority()?.isInitialized() ?? false;
}

// Idempotent — safe to call every time a live map becomes available; a
// second call is a no-op once the authority has already initialized.
export function ensureInitialized(map: unknown): BridgeResult<{ wiredCount: number; activeId: string }> {
  const a = authority();
  if (!a) return { ok: false, error: "authority_unavailable" };
  if (a.isInitialized()) {
    return { ok: true, data: { wiredCount: a.getRegistry().length, activeId: a.getActiveId() } };
  }
  const result = a.init(map);
  if (!result.ok) return { ok: false, error: "authority_init_failed" };
  return { ok: true, data: { wiredCount: result.wiredCount ?? 0, activeId: result.activeId ?? a.getActiveId() } };
}

export function listGeographicStyles(): BridgeResult<GeographicStyleRecord[]> {
  const a = authority();
  if (!a) return { ok: false, error: "authority_unavailable" };
  if (!a.isInitialized()) return { ok: false, error: "authority_not_initialized" };
  return { ok: true, data: a.listGeographicStyles() };
}

export function getGeographicStyle(id: string): BridgeResult<GeographicStyleRecord> {
  const a = authority();
  if (!a) return { ok: false, error: "authority_unavailable" };
  if (!a.isInitialized()) return { ok: false, error: "authority_not_initialized" };
  const p = a.getGeographicStyle(id);
  if (!p) return { ok: false, error: "not_found" };
  return { ok: true, data: p };
}

export function getRegistry(): BridgeResult<RegistryRecord[]> {
  const a = authority();
  if (!a) return { ok: false, error: "authority_unavailable" };
  if (!a.isInitialized()) return { ok: false, error: "authority_not_initialized" };
  return { ok: true, data: a.getRegistry() };
}

// Duplicate always inherits the complete current schema — the authority's
// duplicateGeographicStyle() does this by construction (deep-copies the
// source's full values object), never a hand-picked subset.
export function duplicateGeographicStyle(sourceId: string, title?: string): BridgeResult<GeographicStyleRecord> {
  const a = authority();
  if (!a) return { ok: false, error: "authority_unavailable" };
  const p = a.duplicateGeographicStyle(sourceId);
  if (!p) return { ok: false, error: "duplicate_source_not_found" };
  if (title && title.trim()) a.renameGeographicStyle(p.id, title.trim());
  return { ok: true, data: a.getGeographicStyle(p.id) ?? p };
}

export function renameGeographicStyle(id: string, title: string): BridgeResult<true> {
  const a = authority();
  if (!a) return { ok: false, error: "authority_unavailable" };
  const result = a.renameGeographicStyle(id, title);
  if (!result.ok) return { ok: false, error: result.reason ?? "rename_failed" };
  return { ok: true, data: true };
}

export function setPropertyValue(styleId: string, propId: string, value: string): BridgeResult<true> {
  const a = authority();
  if (!a) return { ok: false, error: "authority_unavailable" };
  const result = a.setPropertyValue(styleId, propId, value);
  if (!result.ok) return { ok: false, error: result.reason ?? "set_property_failed" };
  return { ok: true, data: true };
}

// Preview never activates and never persists — it is real-time-only against
// whichever map this tab's authority was init()'d with (spec §9.1/§11).
export function previewGeographicStyle(id: string): BridgeResult<true> {
  const a = authority();
  if (!a) return { ok: false, error: "authority_unavailable" };
  const result = a.previewGeographicStyle(id);
  if (!result.ok) return { ok: false, error: result.reason ?? "preview_failed" };
  return { ok: true, data: true };
}

export function endPreview(): BridgeResult<true> {
  const a = authority();
  if (!a) return { ok: false, error: "authority_unavailable" };
  const result = a.endPreview();
  if (!result.ok) return { ok: false, error: result.reason ?? "end_preview_failed" };
  return { ok: true, data: true };
}

export function activateGeographicStyle(id: string): BridgeResult<true> {
  const a = authority();
  if (!a) return { ok: false, error: "authority_unavailable" };
  const result = a.activateGeographicStyle(id);
  if (!result.ok) return { ok: false, error: result.reason ?? "activate_failed" };
  return { ok: true, data: true };
}

export function getActiveId(): string | null {
  return authority()?.getActiveId() ?? null;
}

export function getPreviewId(): string | null {
  return authority()?.getPreviewId() ?? null;
}

// Same-tab reactivity — fires after any local mutation or cross-tab
// 'storage' sync (see mapsGeographicStyleAuthority.js's subscribe()). Returns
// a no-op unsubscribe if the authority isn't loaded at all, so callers can
// always treat the return value as safe to invoke on cleanup.
export function subscribe(fn: () => void): () => void {
  const a = authority();
  if (!a) return () => {};
  return a.subscribe(fn);
}

export const DEFAULT_GEOGRAPHIC_STYLE_ID = "default";
