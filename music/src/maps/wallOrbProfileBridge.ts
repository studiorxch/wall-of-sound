// ── wallOrbProfileBridge ──────────────────────────────────────────────────────
// 0730C_MAPS_Orb_Profiles_Library_and_Active_Hero_Runtime
//
// The one narrow bridge between the centralized Library's MAPS interface and
// Wall's Orb Profile authority (window.SBE.OrbProfileAuthority). Wall remains
// the sole authority: this module never stores an Orb Profile record itself
// — it only forwards to window.SBE and reports explicit errors instead of
// falling back to stale data, same contract as wallGeographicStyleBridge.ts.
//
// Record-centered surface (mirrors wallGeographicStyleBridge.ts's fuller
// CRUD/Active/Preview shape) — NOT wallVehicleStyleBridge.ts's narrower one,
// since each Orb Profile is a full independent record, not a flat values-blob
// for one shared external object.
//
// window.SBE is populated by plain <script> tags in index.html, loaded from
// wall/systems/presentation/ and wall/systems/render/ through the /wall-app
// proxy (vite.config.ts). If those scripts failed to load, every function
// below returns { ok: false, error: 'authority_unavailable' } rather than
// throwing or silently rendering empty.

import type { OrbProfile } from "../data/orbProfileTypes";

export type OrbFieldRecord = {
  propId: string;
  roleLabel: string;
  valueKind: "solid" | "opacity" | "boolean" | "number" | "select";
  currentValue: string;
  sourceObject: string;
  sourceProperty: string;
  // Only present for valueKind "number".
  min?: number;
  max?: number;
  step?: number;
  // Only present for valueKind "select".
  options?: { value: string; label: string }[];
};

type MutationResult = { ok: boolean; reason?: string };

type OrbProfileAuthorityGlobal = {
  VERSION: string;
  init: (map: unknown) => { ok: boolean; profileCount?: number; activeId?: string | null };
  isInitialized: () => boolean;
  listOrbProfiles: () => OrbProfile[];
  getOrbProfile: (id: string) => OrbProfile | null;
  createOrbProfile: (archetype?: string, name?: string) => OrbProfile | null;
  duplicateOrbProfile: (sourceId: string) => OrbProfile | null;
  renameOrbProfile: (id: string, name: string) => MutationResult;
  setPropertyValue: (id: string, propId: string, value: string) => MutationResult;
  deleteOrbProfile: (id: string) => MutationResult;
  activateOrbProfile: (id: string) => MutationResult;
  previewOrbProfile: (id: string) => MutationResult;
  endPreview: () => MutationResult;
  getActiveId: () => string | null;
  getPreviewId: () => string | null;
  subscribe: (fn: () => void) => () => void;
};

type OrbProfileRegistryGlobal = {
  VERSION: string;
  fieldsForProfile: (profile: OrbProfile) => OrbFieldRecord[];
};

// WallSBE is the shared named interface every wall*Bridge.ts extends — see
// wallGeographicStyleBridge.ts for the base `interface Window { SBE?: WallSBE }`
// declaration (declared once there; never redeclared here).
declare global {
  interface WallSBE {
    OrbProfileAuthority?: OrbProfileAuthorityGlobal;
    OrbProfileRegistry?: OrbProfileRegistryGlobal;
    OrbProfileApplyAdapters?: unknown;
    OrbObjectFactory?: unknown;
    OrbProfileSeeds?: unknown;
  }
}

export type BridgeResult<T> = { ok: true; data: T } | { ok: false; error: string };

function authority(): OrbProfileAuthorityGlobal | null {
  return window.SBE?.OrbProfileAuthority ?? null;
}

function registry(): OrbProfileRegistryGlobal | null {
  return window.SBE?.OrbProfileRegistry ?? null;
}

export function isBridgeAvailable(): boolean {
  return authority() != null;
}

export function listOrbProfiles(): BridgeResult<OrbProfile[]> {
  const a = authority();
  if (!a) return { ok: false, error: "authority_unavailable" };
  return { ok: true, data: a.listOrbProfiles() };
}

export function getOrbProfile(id: string): BridgeResult<OrbProfile> {
  const a = authority();
  if (!a) return { ok: false, error: "authority_unavailable" };
  const p = a.getOrbProfile(id);
  if (!p) return { ok: false, error: "not_found" };
  return { ok: true, data: p };
}

// Fields are computed from static per-archetype schema × the profile's own
// live nested values — there is no external live object to introspect for
// Orbs (unlike Geographic/Vehicles), so this always succeeds once the
// registry script has loaded, independent of map/authority readiness.
export function getFieldsForProfile(profile: OrbProfile): BridgeResult<OrbFieldRecord[]> {
  const r = registry();
  if (!r) return { ok: false, error: "registry_unavailable" };
  return { ok: true, data: r.fieldsForProfile(profile) };
}

export function createOrbProfile(archetype?: string, name?: string): BridgeResult<OrbProfile> {
  const a = authority();
  if (!a) return { ok: false, error: "authority_unavailable" };
  const p = a.createOrbProfile(archetype, name);
  if (!p) return { ok: false, error: "create_failed" };
  return { ok: true, data: p };
}

export function duplicateOrbProfile(sourceId: string): BridgeResult<OrbProfile> {
  const a = authority();
  if (!a) return { ok: false, error: "authority_unavailable" };
  const p = a.duplicateOrbProfile(sourceId);
  if (!p) return { ok: false, error: "duplicate_source_not_found" };
  return { ok: true, data: p };
}

export function renameOrbProfile(id: string, name: string): BridgeResult<true> {
  const a = authority();
  if (!a) return { ok: false, error: "authority_unavailable" };
  const result = a.renameOrbProfile(id, name);
  if (!result.ok) return { ok: false, error: result.reason ?? "rename_failed" };
  return { ok: true, data: true };
}

export function setPropertyValue(id: string, propId: string, value: string): BridgeResult<true> {
  const a = authority();
  if (!a) return { ok: false, error: "authority_unavailable" };
  const result = a.setPropertyValue(id, propId, value);
  if (!result.ok) return { ok: false, error: result.reason ?? "set_property_failed" };
  return { ok: true, data: true };
}

export function deleteOrbProfile(id: string): BridgeResult<true> {
  const a = authority();
  if (!a) return { ok: false, error: "authority_unavailable" };
  const result = a.deleteOrbProfile(id);
  if (!result.ok) return { ok: false, error: result.reason ?? "delete_failed" };
  return { ok: true, data: true };
}

export function activateOrbProfile(id: string): BridgeResult<true> {
  const a = authority();
  if (!a) return { ok: false, error: "authority_unavailable" };
  const result = a.activateOrbProfile(id);
  if (!result.ok) return { ok: false, error: result.reason ?? "activate_failed" };
  return { ok: true, data: true };
}

// Preview never persists — real-time-only against canonical LIVE MAP's Orb
// renderer, exactly like wallGeographicStyleBridge.ts's previewGeographicStyle.
export function previewOrbProfile(id: string): BridgeResult<true> {
  const a = authority();
  if (!a) return { ok: false, error: "authority_unavailable" };
  const result = a.previewOrbProfile(id);
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

export function getActiveId(): string | null {
  return authority()?.getActiveId() ?? null;
}

export function getPreviewId(): string | null {
  return authority()?.getPreviewId() ?? null;
}

export function subscribe(fn: () => void): () => void {
  const a = authority();
  if (!a) return () => {};
  return a.subscribe(fn);
}
