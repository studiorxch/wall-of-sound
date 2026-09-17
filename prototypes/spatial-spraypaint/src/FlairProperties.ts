import {
  getFlairProControlMetadata,
  getFlairSizeDefaults,
  getFlairStartPositionDefault,
  type EffectiveFlairParams,
  type FlairDepthResponseId,
  type FlairStartPositionId,
} from "./FlairCurves";
import { type FlairModeId } from "./ToolTaxonomy";

/**
 * MODE DEFAULT -> SESSION MODIFICATION -> EFFECTIVE VALUE for Flair's Brush
 * Studio controls — the same override pattern `BrushProperties.ts` already
 * established for Size/Coverage/Fill/Spray Angle, generalized one level: a
 * Flair override is keyed by BOTH cap id AND mode, because the brief
 * requires "changing Wall parameters must not silently mutate Blackbook
 * defaults" — the same brush's Wall tweaks and Blackbook tweaks are
 * independent session state, not one shared bundle. `depthResponse` and
 * (Flair Stroke Envelope Stabilization build brief) `flairMinSize` /
 * `flairMaxSize` / `flairStartPosition` join the numeric scalars as
 * non-numeric or envelope-specific overridable fields — same store, same
 * reset machinery, their own dedicated controls in Brush Studio (not slider
 * rows — see `getFlairPropertyRows`, which stays purely numeric).
 *
 * `flairRange` — a relative multiplier of a mode's own curve magnitude — has
 * been REMOVED. Explicit `flairMinSize`/`flairMaxSize` are now the sole
 * size-envelope authority (see `FlairCurves.ts`'s `FlairSizeEnvelope` doc for
 * the full "why", including why keeping both would leave two controls
 * fighting over the same thing).
 */
export interface FlairParameterOverride {
  flairAmount?: number;
  flairMinSize?: number;
  flairMaxSize?: number;
  flairStartPosition?: FlairStartPositionId;
  flairSmoothing?: number;
  bloomResponse?: number;
  outputFalloff?: number;
  depthResponse?: FlairDepthResponseId;
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

/**
 * MODE DEFAULT merged with SESSION MODIFICATION -> the value actually fed to
 * `resolveFlairModulationWithParams`. `capBaseRadius` (the CAP'S OWN preset
 * `baseRadius` — e.g. `getSprayCapPreset(capId).baseRadius`, never the live/
 * overridden session size) is required to resolve the size envelope's own
 * cap-relative defaults (`getFlairSizeDefaults`) — passing the live size
 * here would reintroduce exactly the carryover bug this pass fixes.
 */
export function resolveEffectiveFlairParams(mode: FlairModeId, capBaseRadius: number, override: FlairParameterOverride): EffectiveFlairParams {
  const defaults = getFlairProControlMetadata(mode);
  const sizeDefaults = getFlairSizeDefaults(mode, capBaseRadius);
  const flairMinSize = override.flairMinSize ?? sizeDefaults.min;
  // Section 7: "no minimum-width collapse." An inverted/degenerate override
  // (Max dragged below Min) never reaches the math as a zero-or-negative
  // span — floored to at least 0.5 wall units above Min, keeping every
  // downstream lerp/normalize well-defined without silently discarding the
  // user's Min edit.
  const flairMaxSize = Math.max(flairMinSize + 0.5, override.flairMaxSize ?? sizeDefaults.max);
  return {
    flairAmount: override.flairAmount ?? defaults.flairAmount,
    flairMinSize,
    flairMaxSize,
    flairStartPosition: override.flairStartPosition ?? getFlairStartPositionDefault(mode),
    flairSmoothing: override.flairSmoothing ?? defaults.flairSmoothing,
    bloomResponse: override.bloomResponse ?? defaults.bloomResponse,
    outputFalloff: override.outputFalloff ?? defaults.outputFalloff,
    depthResponse: override.depthResponse ?? defaults.depthResponse,
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

/** The NUMERIC slider controls only — `depthResponse` and `flairStartPosition` are separate select controls in Brush Studio, not slider rows (see module doc). */
export type NumericFlairPropertyKey = Exclude<FlairPropertyKey, "depthResponse" | "flairStartPosition">;

export interface FlairPropertyRow {
  key: NumericFlairPropertyKey;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  modified: boolean;
}

/**
 * `flairMinSize`/`flairMaxSize` bounds are deliberately generous (1-200 wall
 * units) rather than cap-relative themselves — they're the SLIDER's own
 * travel range, not the envelope's defaults (those come from
 * `getFlairSizeDefaults`, already cap-relative). `flairRange` is gone — see
 * `FlairParameterOverride`'s doc for why.
 */
const FLAIR_PROPERTY_BOUNDS: ReadonlyArray<{ key: NumericFlairPropertyKey; label: string; min: number; max: number; step: number; unit?: string }> = [
  { key: "flairAmount", label: "Flair Amount", min: 0.1, max: 3, step: 0.05 },
  { key: "flairMinSize", label: "Flair Min Size", min: 1, max: 200, step: 0.5, unit: " wall units" },
  { key: "flairMaxSize", label: "Flair Max Size", min: 1, max: 200, step: 0.5, unit: " wall units" },
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
