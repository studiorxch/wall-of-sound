// ── wallVehicleStyleBridge ─────────────────────────────────────────────────────
// 0729D_MAPS_Vehicle_Overlay_Libraries_Foundation
//
// Thin bridge to Wall's Vehicle Style authority (window.SBE.VehicleStyleAuthority).
// Unlike wallGeographicStyleBridge, there is no consolidation step on this
// side — vehicleStyleRegistry.js already returns record-shaped data (each
// real vehicle object with its own grouped fields), so this bridge exposes
// that shape directly. Wall remains the sole authority: this module never
// stores a vehicle record itself.
//
// window.SBE is populated by plain <script> tags in index.html, loaded from
// wall/systems/presentation/ (and heroVehicleRenderer.js) through the
// /wall-app proxy (vite.config.ts). If those scripts failed to load, every
// function below returns { ok: false, error: 'authority_unavailable' }
// rather than throwing or silently rendering empty.

export type VehicleFieldRecord = {
  propId: string;
  roleLabel: string;
  valueKind: "solid";
  currentValue: string;
  sourceObject: string;
  sourceProperty: string;
};

// "Orb" removed (0730C) — Orb Profiles are their own first-class MAPS
// library (wallOrbProfileBridge.ts), not a Vehicle category.
export type VehicleCategory = "Car" | "Bus" | "Boat" | "Bike" | "Plane" | "Other";

export type VehicleRecord = {
  id: string;
  label: string;
  category: VehicleCategory;
  sourceObject: string;
  fields: VehicleFieldRecord[];
};

type MutationResult = { ok: boolean; reason?: string };

type VehicleStyleAuthorityGlobal = {
  VERSION: string;
  init: () => { ok: boolean };
  isInitialized: () => boolean;
  getRegistry: () => VehicleRecord[];
  setPropertyValue: (propId: string, value: string) => MutationResult;
  subscribe: (fn: () => void) => () => void;
};

declare global {
  interface WallSBE {
    VehicleStyleAuthority?: VehicleStyleAuthorityGlobal;
    VehicleStyleRegistry?: unknown;
    VehicleStyleApplyAdapters?: unknown;
  }
}

export type BridgeResult<T> = { ok: true; data: T } | { ok: false; error: string };

function authority(): VehicleStyleAuthorityGlobal | null {
  return window.SBE?.VehicleStyleAuthority ?? null;
}

export function isBridgeAvailable(): boolean {
  return authority() != null;
}

export function listVehicles(): BridgeResult<VehicleRecord[]> {
  const a = authority();
  if (!a) return { ok: false, error: "authority_unavailable" };
  return { ok: true, data: a.getRegistry() };
}

export function setPropertyValue(propId: string, value: string): BridgeResult<true> {
  const a = authority();
  if (!a) return { ok: false, error: "authority_unavailable" };
  const result = a.setPropertyValue(propId, value);
  if (!result.ok) return { ok: false, error: result.reason ?? "set_property_failed" };
  return { ok: true, data: true };
}

// Same-tab reactivity — fires after any local mutation or cross-tab
// 'storage' sync. Returns a no-op unsubscribe if the authority isn't loaded
// at all, so callers can always treat the return value as safe on cleanup.
export function subscribe(fn: () => void): () => void {
  const a = authority();
  if (!a) return () => {};
  return a.subscribe(fn);
}
