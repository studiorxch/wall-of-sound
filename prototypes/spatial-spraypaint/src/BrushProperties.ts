import { PLUME_MAX_ANGLE_DEGREES, resolveShapedStampGeometry, type ShapedStampGeometry } from "./SprayBrushEngine";
import { type SprayCapPreset } from "./SprayCapPresets";

/**
 * The PRESET DEFAULT -> SESSION/USER MODIFICATION -> EFFECTIVE VALUE model for
 * Spray brushes, in V1's curated editable surface: Size, Coverage, Fill mode,
 * Spray Angle. Everything else (shape/paint/motion) is exposed read-only via
 * `getSprayPropertyGroups` below — real runtime authority, just not a second
 * stateful override surface in this pass (see checkpoint doc for why).
 *
 * `sprayAngle` is a generic per-brush property (available on every cap, same
 * as Size/Coverage/Fill), degrees, 0-`PLUME_MAX_ANGLE_DEGREES`. It is Mouse
 * V1's input into the input-neutral `SprayInputState` canonical shape (see
 * `SprayBrushEngine.resolveMouseSprayInput`) — only a `depositionShape:
 * "plume"` cap (currently Pink Dot Fat) actually responds to it; every other
 * cap accepts the value but it has no visible effect, exactly like Fill mode
 * being shown for every cap regardless of whether it changes anything.
 */
export interface SprayPropertyOverride {
  size?: number;
  coverage?: number;
  fillMode?: boolean;
  sprayAngle?: number;
}

export type SprayPropertyKey = keyof SprayPropertyOverride;

/** Per-brush override storage, keyed by cap id (built-in or custom). Never mutates SPRAY_CAP_PRESETS. */
export type SprayOverrideStore = Readonly<Record<string, SprayPropertyOverride>>;

export const EMPTY_SPRAY_OVERRIDES: SprayOverrideStore = {};

export function getSprayOverride(store: SprayOverrideStore, capId: string): SprayPropertyOverride {
  return store[capId] ?? {};
}

/** Pure: returns a NEW store. The entry for every other capId is untouched (same object references). */
export function setSprayOverride(
  store: SprayOverrideStore,
  capId: string,
  patch: SprayPropertyOverride,
): SprayOverrideStore {
  return { ...store, [capId]: { ...getSprayOverride(store, capId), ...patch } };
}

/** Clears one property back to the brush's preset default; drops the entry entirely once empty. */
export function resetSprayProperty(
  store: SprayOverrideStore,
  capId: string,
  key: SprayPropertyKey,
): SprayOverrideStore {
  const current = getSprayOverride(store, capId);
  if (!(key in current)) return store;
  const { [key]: _removed, ...remaining } = current;
  if (Object.keys(remaining).length === 0) {
    const { [capId]: _droppedEntry, ...rest } = store;
    return rest;
  }
  return { ...store, [capId]: remaining };
}

/** Clears every property override for one brush at once ("Reset brush"). */
export function resetSprayBrush(store: SprayOverrideStore, capId: string): SprayOverrideStore {
  if (!(capId in store)) return store;
  const { [capId]: _dropped, ...rest } = store;
  return rest;
}

export interface EffectiveSprayStyle {
  size: number;
  coverage: number;
  fillMode: boolean;
  /** Degrees, 0-`PLUME_MAX_ANGLE_DEGREES`. 0 (straight-on) is every cap's default — no preset field opts a cap into a non-zero default. */
  sprayAngle: number;
}

/** PRESET DEFAULT merged with SESSION/USER MODIFICATION -> the value actually fed to the renderer. */
export function resolveEffectiveSprayStyle(
  preset: SprayCapPreset,
  override: SprayPropertyOverride,
): EffectiveSprayStyle {
  return {
    size: override.size ?? preset.baseRadius,
    coverage: override.coverage ?? 1,
    fillMode: override.fillMode ?? preset.defaultFillMode,
    sprayAngle: Math.max(0, Math.min(PLUME_MAX_ANGLE_DEGREES, override.sprayAngle ?? 0)),
  };
}

export function isSprayPropertyModified(override: SprayPropertyOverride, key: SprayPropertyKey): boolean {
  return override[key] !== undefined;
}

export function isSprayBrushModified(override: SprayPropertyOverride): boolean {
  return Object.keys(override).length > 0;
}

// ---------------------------------------------------------------------------
// Read-only SHAPE / PAINT / MOTION property groups — real preset fields, no
// second override surface. "Exposed" here means surfaced to the user, not
// necessarily made independently editable in V1.

export type SprayPropertyRowKind = "editable-number" | "editable-boolean" | "readonly";

export interface SprayPropertyRow {
  key: string;
  label: string;
  kind: SprayPropertyRowKind;
  value: number | string | boolean;
  unit?: string;
  modified?: boolean;
}

export interface SprayPropertyGroups {
  general: SprayPropertyRow[];
  shape: SprayPropertyRow[];
  paint: SprayPropertyRow[];
  motion: SprayPropertyRow[];
}

function roundedFor(key: string): number {
  return key === "wiggleFrequency" ? 1000 : 100;
}

function number(key: string, label: string, value: number, unit?: string): SprayPropertyRow {
  const precision = roundedFor(key);
  return { key, label, kind: "readonly", value: Math.round(value * precision) / precision, unit };
}

export function getSprayPropertyGroups(
  preset: SprayCapPreset,
  effective: EffectiveSprayStyle,
  override: SprayPropertyOverride,
): SprayPropertyGroups {
  const general: SprayPropertyRow[] = [
    { key: "size", label: "Size", kind: "editable-number", value: effective.size, unit: "wall units", modified: isSprayPropertyModified(override, "size") },
    { key: "coverage", label: "Coverage", kind: "editable-number", value: Math.round(effective.coverage * 100), unit: "%", modified: isSprayPropertyModified(override, "coverage") },
    { key: "fillMode", label: "Fill mode", kind: "editable-boolean", value: effective.fillMode, modified: isSprayPropertyModified(override, "fillMode") },
    { key: "sprayAngle", label: "Spray Angle", kind: "editable-number", value: Math.round(effective.sprayAngle), unit: "°", modified: isSprayPropertyModified(override, "sprayAngle") },
  ];

  const geometry: ShapedStampGeometry | null = resolveShapedStampGeometry(preset.depositionShape, effective.size);
  const shape: SprayPropertyRow[] = [
    { key: "depositionShape", label: "Shape", kind: "readonly", value: preset.depositionShape },
    { key: "orientationAngle", label: "Orientation", kind: "readonly", value: preset.anisotropy < 1 ? "fixed axis" : "symmetric" },
  ];
  if (geometry) {
    shape.push(number("aspectRatio", "Aspect ratio", geometry.halfLength / geometry.halfWidth, ":1"));
  } else {
    shape.push(number("aspectRatio", "Aspect ratio", preset.anisotropy < 1 ? 1 / preset.anisotropy : 1, ":1"));
  }

  const paint: SprayPropertyRow[] = [
    number("coreDensity", "Core density", preset.coreDensity),
    number("coreOpacity", "Core opacity", preset.coreOpacity),
    number("edgeFalloff", "Edge softness", preset.edgeFalloff),
    number("particleCount", "Overspray amount", preset.particleCount),
    number("particleSpread", "Overspray spread", preset.particleSpread),
    number("haloRadius", "Halo radius", preset.haloRadius),
    number("haloOpacity", "Halo opacity", preset.haloOpacity),
  ];
  // Pink Dot Fat's unified plume dials — only meaningful (and only shown) on
  // a cap that actually uses the plume mechanism. Read-only diagnostics,
  // same as every other Shape/Paint/Motion row; the live-adjustable controls
  // that drive their visible effect are Size (distance gain) and Spray
  // Angle (flare), both already live-previewed above. See
  // SprayCapPresets.ts's `plume*` field docs.
  if (preset.depositionShape === "plume") {
    paint.push(
      number("plumeRingRadius", "Ring radius", preset.plumeRingRadius),
      number("plumeRingThickness", "Ring thickness", preset.plumeRingThickness),
      number("plumeRingOpacity", "Ring opacity", preset.plumeRingOpacity),
      number("plumeMistRadius", "Mist radius", preset.plumeMistRadius),
      number("plumeMistOpacity", "Mist opacity", preset.plumeMistOpacity),
      number("plumeDistanceGain", "Plume distance gain", preset.plumeDistanceGain),
      number("plumeFlareStrength", "Plume flare strength", preset.plumeFlareStrength),
      number("plumeDabSpacing", "Plume dab spacing", preset.plumeDabSpacing),
    );
  }

  const motion: SprayPropertyRow[] = [
    number("velocityResponse", "Velocity response", preset.velocityResponse),
    number("wiggleAmplitude", "Wiggle amplitude", preset.wiggleAmplitude),
    number("wiggleFrequency", "Wiggle frequency", preset.wiggleFrequency, "rad/ms"),
  ];

  return { general, shape, paint, motion };
}
