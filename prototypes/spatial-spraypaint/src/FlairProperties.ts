import { getFlairProControlMetadata, type EffectiveFlairParams } from "./FlairCurves";
import { type FlairModeId } from "./ToolTaxonomy";

/**
 * MODE DEFAULT -> SESSION MODIFICATION -> EFFECTIVE VALUE for Flair's five
 * Brush Studio controls — the same override pattern `BrushProperties.ts`
 * already established for Size/Coverage/Fill/Spray Angle, generalized one
 * level: a Flair override is keyed by BOTH cap id AND mode, because the
 * brief requires "changing Wall parameters must not silently mutate
 * Blackbook defaults" — the same brush's Wall tweaks and Blackbook tweaks
 * are independent session state, not one shared bundle.
 */
export interface FlairParameterOverride {
  flairAmount?: number;
  flairRange?: number;
  flairSmoothing?: number;
  bloomResponse?: number;
  outputFalloff?: number;
}

export type FlairPropertyKey = keyof FlairParameterOverride;

/** Keyed capId -> mode -> override. Never mutates FLAIR_CURVES or any other brush's/mode's entry. */
export type FlairOverrideStore = Readonly<Record<string, Readonly<Partial<Record<FlairModeId, FlairParameterOverride>>>>>;

export const EMPTY_FLAIR_OVERRIDES: FlairOverrideStore = {};

export function getFlairOverride(store: FlairOverrideStore, capId: string, mode: FlairModeId): FlairParameterOverride {
  return store[capId]?.[mode] ?? {};
}

/** Pure: returns a NEW store. Every other (capId, mode) entry keeps the same object reference. */
export function setFlairOverride(
  store: FlairOverrideStore,
  capId: string,
  mode: FlairModeId,
  patch: FlairParameterOverride,
): FlairOverrideStore {
  const capEntry = store[capId] ?? {};
  return {
    ...store,
    [capId]: { ...capEntry, [mode]: { ...getFlairOverride(store, capId, mode), ...patch } },
  };
}

/** Clears one property back to that mode's canonical default ("Reset Property"); drops empty entries entirely. */
export function resetFlairProperty(
  store: FlairOverrideStore,
  capId: string,
  mode: FlairModeId,
  key: FlairPropertyKey,
): FlairOverrideStore {
  const current = getFlairOverride(store, capId, mode);
  if (!(key in current)) return store;
  const { [key]: _removed, ...remaining } = current;
  return writeModeEntry(store, capId, mode, Object.keys(remaining).length === 0 ? undefined : remaining);
}

/** Clears the WHOLE mode bundle (all five properties) back to that mode's canonical defaults at once ("Reset Flair"). Every other mode's overrides for this same brush are untouched. */
export function resetFlairMode(store: FlairOverrideStore, capId: string, mode: FlairModeId): FlairOverrideStore {
  if (!store[capId]?.[mode]) return store;
  return writeModeEntry(store, capId, mode, undefined);
}

function writeModeEntry(
  store: FlairOverrideStore,
  capId: string,
  mode: FlairModeId,
  value: FlairParameterOverride | undefined,
): FlairOverrideStore {
  const capEntry = { ...(store[capId] ?? {}) };
  if (value === undefined) delete capEntry[mode]; else capEntry[mode] = value;
  if (Object.keys(capEntry).length === 0) {
    const { [capId]: _dropped, ...rest } = store;
    return rest;
  }
  return { ...store, [capId]: capEntry };
}

/** MODE DEFAULT merged with SESSION MODIFICATION -> the value actually fed to `resolveFlairModulationWithParams`. */
export function resolveEffectiveFlairParams(mode: FlairModeId, override: FlairParameterOverride): EffectiveFlairParams {
  const defaults = getFlairProControlMetadata(mode);
  return {
    flairAmount: override.flairAmount ?? defaults.flairAmount,
    flairRange: override.flairRange ?? defaults.flairRange,
    flairSmoothing: override.flairSmoothing ?? defaults.flairSmoothing,
    bloomResponse: override.bloomResponse ?? defaults.bloomResponse,
    outputFalloff: override.outputFalloff ?? defaults.outputFalloff,
  };
}

export function isFlairPropertyModified(override: FlairParameterOverride, key: FlairPropertyKey): boolean {
  return override[key] !== undefined;
}

export function isFlairModeModified(override: FlairParameterOverride): boolean {
  return Object.keys(override).length > 0;
}

// ---------------------------------------------------------------------------
// Pure row descriptors for Brush Studio's FLAIR group — kept DOM-free so the
// data shape (which controls exist, their bounds, their modified state) is
// unit-testable, matching `BrushProperties.ts`'s `getSprayPropertyGroups`.

export interface FlairPropertyRow {
  key: FlairPropertyKey;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  modified: boolean;
}

const FLAIR_PROPERTY_BOUNDS: ReadonlyArray<{ key: FlairPropertyKey; label: string; min: number; max: number; step: number; unit?: string }> = [
  { key: "flairAmount", label: "Flair Amount", min: 0.1, max: 3, step: 0.05 },
  { key: "flairRange", label: "Flair Range", min: 0.1, max: 3, step: 0.05 },
  { key: "flairSmoothing", label: "Flair Smoothing", min: 0.02, max: 1, step: 0.02 },
  { key: "bloomResponse", label: "Bloom Response", min: 0, max: 2, step: 0.05 },
  { key: "outputFalloff", label: "Output Falloff", min: 0, max: 1, step: 0.02 },
];

export function getFlairPropertyRows(effective: EffectiveFlairParams, override: FlairParameterOverride): FlairPropertyRow[] {
  return FLAIR_PROPERTY_BOUNDS.map(({ key, label, min, max, step, unit }) => ({
    key,
    label,
    value: effective[key],
    min,
    max,
    step,
    unit,
    modified: isFlairPropertyModified(override, key),
  }));
}
