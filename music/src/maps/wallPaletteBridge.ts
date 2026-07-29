// ── wallPaletteBridge ─────────────────────────────────────────────────────────
// 0729_STUDIORICH_Centralized_Library_MAPS_Integration
//
// The one narrow bridge between the centralized Library's MAPS interface and
// Wall's palette authority (window.SBE.MapsPaletteAuthority). Wall remains
// the sole authority: this module never stores a palette record itself — it
// only forwards to window.SBE and reports explicit errors instead of falling
// back to stale data, per spec §9.1.
//
// window.SBE is populated by plain <script> tags in index.html, loaded from
// wall/systems/presentation/ through the /wall-app proxy (vite.config.ts).
// If those scripts failed to load (Wall's dev server unreachable), every
// function below returns { ok: false, error: 'authority_unavailable' }
// rather than throwing or silently rendering empty.

export type PaletteRecord = {
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
  currentValue: string;
  [key: string]: unknown;
};

type MutationResult = { ok: boolean; reason?: string; noop?: boolean };

type MapsPaletteAuthorityGlobal = {
  VERSION: string;
  init: (map: unknown) => { ok: boolean; wiredCount?: number; activeId?: string };
  isInitialized: () => boolean;
  getRegistry: () => RegistryRecord[];
  listPalettes: () => PaletteRecord[];
  getPalette: (id: string) => PaletteRecord | null;
  createPalette: (title?: string) => PaletteRecord;
  duplicatePalette: (sourceId: string) => PaletteRecord | null;
  renamePalette: (id: string, title: string) => MutationResult;
  setPropertyValue: (paletteId: string, propId: string, value: string) => MutationResult;
  activatePalette: (id: string) => MutationResult;
  previewPalette: (id: string) => MutationResult;
  endPreview: () => MutationResult;
  getActiveId: () => string;
  getPreviewId: () => string | null;
  subscribe: (fn: () => void) => () => void;
  DEFAULT_PALETTE_ID: string;
};

declare global {
  interface Window {
    SBE?: {
      MapsPaletteAuthority?: MapsPaletteAuthorityGlobal;
      MapsPaletteRegistry?: unknown;
      MapsPaletteApplyAdapters?: unknown;
      MapsPaletteSeeds?: unknown;
    };
  }
}

export type BridgeResult<T> = { ok: true; data: T } | { ok: false; error: string };

function authority(): MapsPaletteAuthorityGlobal | null {
  return window.SBE?.MapsPaletteAuthority ?? null;
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

export function listPalettes(): BridgeResult<PaletteRecord[]> {
  const a = authority();
  if (!a) return { ok: false, error: "authority_unavailable" };
  if (!a.isInitialized()) return { ok: false, error: "authority_not_initialized" };
  return { ok: true, data: a.listPalettes() };
}

export function getPalette(id: string): BridgeResult<PaletteRecord> {
  const a = authority();
  if (!a) return { ok: false, error: "authority_unavailable" };
  if (!a.isInitialized()) return { ok: false, error: "authority_not_initialized" };
  const p = a.getPalette(id);
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
// duplicatePalette() does this by construction (deep-copies the source's
// full values object), never a hand-picked subset.
export function duplicatePalette(sourceId: string, title?: string): BridgeResult<PaletteRecord> {
  const a = authority();
  if (!a) return { ok: false, error: "authority_unavailable" };
  const p = a.duplicatePalette(sourceId);
  if (!p) return { ok: false, error: "duplicate_source_not_found" };
  if (title && title.trim()) a.renamePalette(p.id, title.trim());
  return { ok: true, data: a.getPalette(p.id) ?? p };
}

export function renamePalette(id: string, title: string): BridgeResult<true> {
  const a = authority();
  if (!a) return { ok: false, error: "authority_unavailable" };
  const result = a.renamePalette(id, title);
  if (!result.ok) return { ok: false, error: result.reason ?? "rename_failed" };
  return { ok: true, data: true };
}

export function setPropertyValue(paletteId: string, propId: string, value: string): BridgeResult<true> {
  const a = authority();
  if (!a) return { ok: false, error: "authority_unavailable" };
  const result = a.setPropertyValue(paletteId, propId, value);
  if (!result.ok) return { ok: false, error: result.reason ?? "set_property_failed" };
  return { ok: true, data: true };
}

// Preview never activates and never persists — it is real-time-only against
// whichever map this tab's authority was init()'d with (spec §9.1/§11).
export function previewPalette(id: string): BridgeResult<true> {
  const a = authority();
  if (!a) return { ok: false, error: "authority_unavailable" };
  const result = a.previewPalette(id);
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

export function activatePalette(id: string): BridgeResult<true> {
  const a = authority();
  if (!a) return { ok: false, error: "authority_unavailable" };
  const result = a.activatePalette(id);
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
// 'storage' sync (see mapsPaletteAuthority.js's subscribe()). Returns a
// no-op unsubscribe if the authority isn't loaded at all, so callers can
// always treat the return value as safe to invoke on cleanup.
export function subscribe(fn: () => void): () => void {
  const a = authority();
  if (!a) return () => {};
  return a.subscribe(fn);
}

export const DEFAULT_PALETTE_ID = "default";
