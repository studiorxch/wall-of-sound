import { getSprayCapPreset, type SprayCapPreset } from "./SprayCapPresets";
import { getMarkerVariant, type MarkerVariantDefinition } from "./PaintMarkerEngine";
import { getWetPaintProfile, isWetMarkerVariant, type WetMarkerVariantId } from "./WetPaintModel";
import { type DrawingToolId, type MarkerVariantId } from "./DrawingTool";
import { type WetPaintFlow, type WetPaintViscosity } from "./WetPaintControls";

/**
 * The single canonical brush-property schema every drawing tool resolves
 * from and every edit writes through — Spray caps, Round Marker, Chisel
 * Marker, and Mop. `resolveBrushProfile(toolId, id, overrides?)` is the one
 * authority function: it reads each family's underlying calibrated data
 * (Spray's `SprayCapPreset` particle physics, Mop's `WetVariantProfile`
 * pool-reservoir tuning, etc. — none of that per-family data is duplicated
 * or re-derived, it stays the single source for ITS OWN calibrated values)
 * and merges any live user edit from a `BrushProfileOverrideStore` on top,
 * producing the ONE effective profile every renderer, Brush Studio panel,
 * and preview reads. An edit updates the store; the very next resolve call
 * (which every render path makes fresh, not from a cached copy) reflects
 * it — there is no second, independently-writable settings surface for any
 * field this schema owns.
 *
 * V0.10.16: `paint.flow`/`paint.viscosity` moved from a Mop-only
 * `WetPaintControlState` island into this universal schema -- EVERY brush
 * now has a value for them (a capability/applicability question, not a
 * second architecture), even though today only the wet-marker rendering
 * path (`WetPaintAccumulator`) actually consumes them for its physics; a
 * dry brush's flow/viscosity are descriptive/centralized but not yet wired
 * into a dry-ink physics model of their own. `squeeze.supported` is the
 * capability flag the UI uses to show/hide the Squeeze Response control,
 * replacing the old "wet is null" pattern for that one property.
 */

export type BrushFootprintShape = "round" | "chisel" | "mop" | "spray";

/** A stamp-shape descriptor a preview renderer can draw without knowing which tool it came from. */
export interface BrushFootprintDescriptor {
  shape: BrushFootprintShape;
  /** Relative width:height of the footprint's own silhouette (1 = circular/square). */
  aspectRatio: number;
  /** 0-1 softness of the footprint's edge -- 0 hard-edged, 1 fully diffuse. */
  softness: number;
}

export interface BrushDripProperties {
  /** 0-1: how readily this brush forms drips at all. */
  tendency: number;
  /**
   * V0.10.17 width-authority trace (per the pass's own explicit questions
   * -- answered here once, not re-derived per call site):
   *
   * - "Relative to what?" -- the SOURCE STROKE's own width at the exact
   *   point/node the drip spawns from (`point.width` for Spray/Round/
   *   Chisel's `DripAccumulator`; `size`/`point.width` for Mop's pool
   *   channel -- both are the live stroke geometry, never a fixed
   *   constant).
   * - "Where converted to wall/canvas width?" -- at the SPAWN SITE only
   *   (`DripAccumulator.observe` in DripLogic.ts; `spawnPoolChannel` in
   *   WetPaintModel.ts). Both compute `resolvedBodyWidth = sourceStrokeWidth
   *   * this.bodyWidth` and put the RESULT directly into `DripSeed.width`.
   *   Nothing downstream re-derives it from a ratio again.
   * - "What modifies it afterward?" -- `DripLogic.ts`'s
   *   `resolveDripWidth` treats `DripSeed.width` as the fixed reference
   *   (region B, "the column") for the rest of the drip's life. Taper
   *   (region B's own deviation) and the terminal bead (region C) are
   *   both DEVIATIONS computed relative to that same fixed reference, not
   *   redefinitions of it -- see `resolveDripWidth`'s own doc.
   * - "Does origin pooling modify it?" -- NO. Origin pooling (region A,
   *   the attachment) is capped at 1.7x `resolvedBodyWidth` and blended
   *   away entirely by 18% progress; it never changes what `resolvedBodyWidth`
   *   itself is.
   * - "Does taper modify it?" -- taper narrows the COLUMN away from
   *   `resolvedBodyWidth` (floored at 55% of it), it does not change the
   *   reference value taper is measured against.
   * - "Does terminal bead modify it?" -- no, same reasoning: the bead
   *   target is `(column width at the bead zone's own start) * terminalBead`,
   *   never a multiple of a DIFFERENT quantity.
   * - "Does source stroke width modify it?" -- yes, by definition
   *   (`resolvedBodyWidth = sourceStrokeWidth * bodyWidth`) -- this is the
   *   ONE place stroke width enters the drip system.
   * - "Does Squeeze indirectly modify it?" -- for Mop, yes: Squeeze raises
   *   the pool node's accumulated load, which raises `loadFactor` in
   *   `spawnPoolChannel`, which adds up to `stemWidthLoadRatio` on top of
   *   `stemWidthBaseRatio` before that sum is multiplied by the source
   *   stroke width -- a real, intentional "heavier pooling under Squeeze"
   *   effect (see WetPaintModel.ts), not a bug, but worth naming here so
   *   it isn't mistaken for `bodyWidth` itself drifting unpredictably. A
   *   per-drip `widthVarianceLow/High` random multiplier ALSO applies at
   *   the Mop spawn site; V0.10.17 tightened its range from a 2.5x spread
   *   (0.85-2.1) to a narrow 0.92-1.12 specifically so `bodyWidth`
   *   settings stay visually predictable rather than being swamped by
   *   per-drip randomness.
   * - "Do different renderers interpret it differently?" -- no: both
   *   `WetDripEngine` (Mop) and `SprayBrushEngine` (Spray/Round/Chisel)
   *   call the exact same `resolveDripStripSection`/`resolveDripWidth`
   *   from DripLogic.ts. One geometry function, two callers.
   *
   * `bodyWidth` itself is expressed as a fraction of the brush's own
   * `size` at the BrushProfile level (for display/editing purposes); the
   * actual `resolvedBodyWidth` used at runtime is this ratio times the
   * LIVE source stroke width at the drip's spawn point, which can differ
   * slightly from the brush's nominal `size` (pressure/geometry variation
   * along a real stroke).
   */
  bodyWidth: number;
  /** 0-1: how much a drip narrows from root to tip, DEVIATING from resolvedBodyWidth -- never redefining it. Lower = gentler taper, more liquid mass held through the run. Floored at runtime so even the strongest taper never converges to a needle. */
  taper: number;
  /**
   * Subtle terminal accumulation (region C), as a multiple of the
   * column's own width at the moment the bead zone begins -- NOT the
   * drip's full base width, and never a large multiple. 1 = NONE (no
   * intentional enlargement; the column just ends in its own natural
   * rounded cap). Recommended range when enabled: ~1.03-1.08 (LOW),
   * ~1.08-1.18 (MEDIUM), ~1.18-1.35 (HIGH) -- clamped to [1, 1.35] at
   * runtime regardless of what a caller passes, so a bead can never
   * become 2-4x the column (the "match head"/"thermometer" defect).
   */
  terminalBead: number;
  /** Relative size of the rounded root/origin pooling (region A, the attachment), as a multiple of the drip's own resolvedBodyWidth -- capped at runtime so a wide pooled reservoir can never balloon into a shape wider than the column it feeds. 0 disables pooling (the attachment then reads as the column's own natural start). */
  originPooling: number;
  /** Hard invariant: no drip spawned from this brush may render more opaque than this. Always <= the brush's own `opacity`. */
  sourceOpacityCeiling: number;
}

/** Deposition/paint properties every brush owns a value for -- not just wet markers. */
export interface BrushPaintProperties {
  flow: WetPaintFlow;
  viscosity: WetPaintViscosity;
}

/** Input-response capability: whether Squeeze applies to this brush, and how strongly. */
export interface BrushSqueezeProperties {
  supported: boolean;
  /** How strongly Squeeze raises deposition for this brush -- 1 = no response (the value when `supported` is false). */
  response: number;
}

export type BrushFamily = "spray" | "round" | "chisel" | "mop";

export interface BrushProfile {
  family: BrushFamily;
  id: string;
  name: string;
  size: number;
  /** Peak/core opacity this brush's own mark reaches at full load. */
  opacity: number;
  paint: BrushPaintProperties;
  drip: BrushDripProperties;
  squeeze: BrushSqueezeProperties;
  footprint: BrushFootprintDescriptor;
}

// ---------------------------------------------------------------------------
// The single writable truth. Every live edit to a shared property (Size,
// Opacity, Flow, Viscosity, Drip tendency, Drip body width, Taper, Terminal
// bead, Origin pooling) goes through this store, keyed by `${toolId}:${id}`
// -- never a second, per-family override state for any of these fields.

export interface BrushProfilePropertyOverride {
  size?: number;
  opacity?: number;
  flow?: WetPaintFlow;
  viscosity?: WetPaintViscosity;
  dripTendency?: number;
  dripBodyWidth?: number;
  dripTaper?: number;
  dripTerminalBead?: number;
  dripOriginPooling?: number;
}

export type BrushProfileOverrideStore = Readonly<Record<string, BrushProfilePropertyOverride>>;

export const EMPTY_BRUSH_PROFILE_OVERRIDES: BrushProfileOverrideStore = {};

function overrideKey(toolId: DrawingToolId, id: string): string {
  return `${toolId}:${id}`;
}

export function getBrushProfileOverride(
  store: BrushProfileOverrideStore,
  toolId: DrawingToolId,
  id: string,
): BrushProfilePropertyOverride {
  return store[overrideKey(toolId, id)] ?? {};
}

/** Pure: returns a NEW store. Every other brush's entry is untouched (same object references). */
export function setBrushProfileOverride(
  store: BrushProfileOverrideStore,
  toolId: DrawingToolId,
  id: string,
  patch: BrushProfilePropertyOverride,
): BrushProfileOverrideStore {
  const key = overrideKey(toolId, id);
  return { ...store, [key]: { ...(store[key] ?? {}), ...patch } };
}

const MOP_SQUEEZE_RESPONSE = 2.6;

function spraySoftness(preset: SprayCapPreset): number {
  // Edge falloff already runs "hard -> soft" in the same direction as our
  // 0-1 softness scale; no separate mapping table needed.
  return Math.max(0, Math.min(1, preset.edgeFalloff));
}

function resolveSprayProfile(capId: string, override: BrushProfilePropertyOverride): BrushProfile {
  const preset = getSprayCapPreset(capId);
  const opacity = clamp01(override.opacity ?? preset.coreOpacity);
  const tendency = clamp01(override.dripTendency ?? preset.dripTendency);
  return {
    family: "spray",
    id: preset.id,
    name: preset.name,
    size: override.size ?? preset.baseRadius,
    opacity,
    // Spray has no per-cap flow/viscosity physics model of its own -- "cap
    // output" reads as a high, fairly runny aerosol by default, distinct
    // from the flat "balanced" placeholder a dry marker gets.
    paint: {
      flow: override.flow ?? "high",
      viscosity: override.viscosity ?? "runny",
    },
    drip: {
      tendency,
      // Matches the width formula DripAccumulator.observe derives a Spray
      // drip's own body width from (see DripLogic.ts) -- expressed here as
      // size-relative so it reads on the same axis as every other family's
      // dripBodyWidth.
      bodyWidth: override.dripBodyWidth ?? (0.11 + tendency * 0.05),
      taper: override.dripTaper ?? 0.28,
      terminalBead: override.dripTerminalBead ?? 1.08,
      originPooling: override.dripOriginPooling ?? 0,
      // A drip must never read as more opaque than the wash that produced
      // it -- Spray's own coreOpacity IS the ceiling, tracking any live
      // opacity edit rather than the unedited preset default.
      sourceOpacityCeiling: opacity,
    },
    squeeze: { supported: false, response: 1 },
    footprint: {
      shape: "spray",
      aspectRatio: preset.anisotropy < 1 ? 1 / preset.anisotropy : 1,
      softness: spraySoftness(preset),
    },
  };
}

function resolveMarkerFootprint(variantId: MarkerVariantId): BrushFootprintDescriptor {
  if (variantId === "round") return { shape: "round", aspectRatio: 1, softness: 0.15 };
  if (variantId === "mop" || variantId === "drip-mop") {
    return { shape: "mop", aspectRatio: 1, softness: 0.55 };
  }
  // Every chisel variant (chisel / clean-chisel / drippy-chisel).
  return { shape: "chisel", aspectRatio: 2.4, softness: 0.1 };
}

function resolveDryMarkerProfile(
  variant: MarkerVariantDefinition,
  override: BrushProfilePropertyOverride,
): BrushProfile {
  const family: BrushFamily = variant.id === "round" ? "round" : "chisel";
  // Dry markers lay down a dense mark rendered fully opaque today (see
  // PaintMarkerEngine's `ctx.fillStyle = color`, no alpha channel) -- 1 is
  // the true structural ceiling; 0.95 is the profile's own editable
  // DEFAULT peak, deliberately just under that hard ceiling.
  const opacity = clamp01(override.opacity ?? 0.95);
  const tendency = clamp01(override.dripTendency ?? variant.dripTendency);
  return {
    family,
    id: variant.id,
    name: variant.name,
    size: override.size ?? variant.defaultSize,
    opacity,
    // A dry marker's own "ink chemistry" defaults: lower flow, thicker
    // than Mop's runny wash -- centralized here even though no dry-ink
    // physics model reads them yet (see this file's own module doc).
    paint: {
      flow: override.flow ?? "low",
      viscosity: override.viscosity ?? "thick",
    },
    drip: {
      tendency,
      bodyWidth: override.dripBodyWidth ?? (0.11 + tendency * 0.05),
      taper: override.dripTaper ?? 0.28,
      terminalBead: override.dripTerminalBead ?? (tendency > 0 ? 1.08 : 1),
      originPooling: override.dripOriginPooling ?? 0,
      sourceOpacityCeiling: opacity,
    },
    squeeze: { supported: false, response: 1 },
    footprint: resolveMarkerFootprint(variant.id),
  };
}

function resolveWetMarkerProfile(
  variant: MarkerVariantDefinition,
  variantId: WetMarkerVariantId,
  override: BrushProfilePropertyOverride,
): BrushProfile {
  const pool = getWetPaintProfile(variantId);
  const opacity = clamp01(override.opacity ?? 0.95);
  const tendency = clamp01(override.dripTendency ?? variant.dripTendency);
  return {
    family: "mop",
    id: variant.id,
    name: variant.name,
    size: override.size ?? variant.defaultSize,
    opacity,
    paint: {
      flow: override.flow ?? "high",
      viscosity: override.viscosity ?? "runny",
    },
    drip: {
      tendency,
      // Mop's own pool model already owns real, hard-won width/taper/
      // pooling tuning (`stemWidthBaseRatio`/`tipWidthRatio`/
      // `originPoolRatio` -- see WetPaintModel.ts) -- this profile
      // surfaces those exact values rather than re-deriving new ones, so
      // Brush Studio and any preview read the SAME numbers the live
      // pool-channel renderer actually uses.
      bodyWidth: override.dripBodyWidth ?? pool.stemWidthBaseRatio,
      taper: override.dripTaper ?? (1 - pool.tipWidthRatio),
      terminalBead: override.dripTerminalBead ?? 1.08,
      originPooling: override.dripOriginPooling ?? pool.originPoolRatio,
      sourceOpacityCeiling: opacity,
    },
    squeeze: { supported: true, response: MOP_SQUEEZE_RESPONSE },
    footprint: resolveMarkerFootprint(variant.id),
  };
}

function resolveMarkerProfile(variantId: MarkerVariantId, override: BrushProfilePropertyOverride): BrushProfile {
  const variant = getMarkerVariant(variantId);
  if (isWetMarkerVariant(variantId)) return resolveWetMarkerProfile(variant, variantId, override);
  return resolveDryMarkerProfile(variant, override);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * The one resolver every tool, and every piece of shared brush UI, calls.
 * `toolId` selects which underlying family to resolve `id` against --
 * "spray-can" reads Spray cap presets, "paint-marker" reads marker variants
 * (dispatching internally to the wet or dry shape depending on the
 * variant). `overrides`, when supplied, is merged on top of that family's
 * computed defaults for every shared property a user can edit -- this is
 * what makes the profile the live, editable authority rather than a
 * read-only snapshot.
 */
export function resolveBrushProfile(
  toolId: DrawingToolId,
  id: string,
  overrides: BrushProfileOverrideStore = EMPTY_BRUSH_PROFILE_OVERRIDES,
): BrushProfile {
  const override = getBrushProfileOverride(overrides, toolId, id);
  if (toolId === "spray-can") return resolveSprayProfile(id, override);
  return resolveMarkerProfile(id as MarkerVariantId, override);
}

export function isWetBrushProfile(profile: BrushProfile): boolean {
  return profile.squeeze.supported;
}
