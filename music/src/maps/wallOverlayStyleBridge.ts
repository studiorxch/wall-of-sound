// ── wallOverlayStyleBridge ─────────────────────────────────────────────────────
// 0729D_MAPS_Vehicle_Overlay_Libraries_Foundation
//
// Thin bridge to Wall's Overlay Style authority (window.SBE.OverlayStyleAuthority).
// Same record-centered shape as wallVehicleStyleBridge — overlayStyleRegistry.js
// already groups fields under their owning record. Wall remains the sole
// authority: this module never stores an overlay record itself.
//
// Records vary in shape: Atmosphere Composite (1 boolean field) and
// Environmental Telemetry HUD (4 color fields) are editable; Now Playing HUD
// and Flight Data HUD are real records with zero fields (editable: false) —
// callers must render those as read-only, not as an empty/broken editor.
//
// Now Playing HUD/Flight Data HUD are STATIC records — real regardless of
// whether their own source module (nowPlayingHud.js/traversalHUD.js) is
// actually loaded in this document (deliberately not, in MUSIC's own page —
// see overlayStyleRegistry.js). `runtimeActive` reports whether the module
// is genuinely running HERE; the record itself is always present.

export type OverlayFieldValueKind = "color" | "boolean";

export type OverlayFieldRecord = {
  propId: string;
  roleLabel: string;
  valueKind: OverlayFieldValueKind;
  currentValue: string;
  sourceObject: string;
  sourceProperty: string;
};

export type OverlayCategory =
  | "HUD" | "Atmosphere" | "Captions" | "Markers" | "Paper Texture"
  | "Scanlines" | "Vignette" | "Noise/Grain" | "Glow" | "Route Presentation";

export type OverlayRecord = {
  id: string;
  label: string;
  category: OverlayCategory;
  sourceObject: string;
  sourceLocation: string;
  editable: boolean;
  runtimeActive: boolean;
  fields: OverlayFieldRecord[];
};

type MutationResult = { ok: boolean; reason?: string };

type OverlayStyleAuthorityGlobal = {
  VERSION: string;
  init: () => { ok: boolean };
  isInitialized: () => boolean;
  getRegistry: () => OverlayRecord[];
  setPropertyValue: (propId: string, value: string) => MutationResult;
  subscribe: (fn: () => void) => () => void;
};

declare global {
  interface WallSBE {
    OverlayStyleAuthority?: OverlayStyleAuthorityGlobal;
    OverlayStyleRegistry?: unknown;
    OverlayStyleApplyAdapters?: unknown;
  }
}

export type BridgeResult<T> = { ok: true; data: T } | { ok: false; error: string };

function authority(): OverlayStyleAuthorityGlobal | null {
  return window.SBE?.OverlayStyleAuthority ?? null;
}

export function isBridgeAvailable(): boolean {
  return authority() != null;
}

export function listOverlays(): BridgeResult<OverlayRecord[]> {
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

export function subscribe(fn: () => void): () => void {
  const a = authority();
  if (!a) return () => {};
  return a.subscribe(fn);
}
