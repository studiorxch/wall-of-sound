import { getSprayCapPreset, type SprayCapPreset } from "./SprayCapPresets";
import { getMarkerVariant, type MarkerVariantDefinition } from "./PaintMarkerEngine";
import { getWetPaintProfile, isWetMarkerVariant, type WetMarkerVariantId } from "./WetPaintModel";
import { type DrawingToolId, type MarkerVariantId } from "./DrawingTool";

/**
 * The single centralized brush-property model every drawing tool resolves
 * from — Spray caps, Round Marker, Chisel Marker, and Mop. Before this
 * module, each tool read its own scattered shape: Spray from
 * `SprayCapPreset`, Round/Chisel from `MarkerVariantDefinition`, Mop from
 * `WetVariantProfile`, each with its own field names and no shared surface
 * a UI (picker, Brush Studio, preview) could treat uniformly. This module
 * does not replace those underlying per-tool data sources (Spray's particle
 * physics, Mop's pool-reservoir tuning, etc. stay exactly as they are, and
 * this pass does not touch their calibrated values) — it is the read layer
 * every tool, and every piece of shared UI, now goes through to ask "what
 * are this brush's core properties," so the answer is structurally the same
 * shape (and the same resolver function) for all four families.
 *
 * `resolveBrushProfile` is the one entry point. Everything else in this file
 * is either the shared interface it returns or the per-family mapping
 * functions it dispatches to.
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

/**
 * The properties every brush family owns, regardless of tool. Required on
 * every profile -- a picker, a preview, or Brush Studio can read these for
 * ANY brush without a tool-specific branch.
 */
export interface BrushCoreProperties {
  /** Nominal stroke radius/width, wall units. */
  size: number;
  /** Peak/core opacity this brush's own mark reaches at full load -- the same ceiling drips must never exceed. */
  opacity: number;
  /** 0-1: how readily this brush forms drips at all. */
  dripTendency: number;
  /** Drip body width as a fraction of the brush's own `size` -- "thicker initial body" scales from here. */
  dripBodyWidthRatio: number;
  /** 0-1: how much a drip narrows from root to tip. Lower = gentler taper, more liquid mass held through the run. */
  taperAmount: number;
  /** Relative size of the rounded terminal bead, as a multiple of the drip's own tip width. 0 disables the bead. */
  terminalBeadRatio: number;
  /** Relative size of the rounded root/origin pooling, as a multiple of the drip's own body width. 0 disables pooling. */
  originPoolingRatio: number;
  /** The real filled shape a preview should stamp for this brush -- never an outline. */
  previewFootprint: BrushFootprintDescriptor;
}

/** Wet-only properties: present and editable only for a wet-capable brush (Mop today). Never shown/edited for a dry brush. */
export interface BrushWetProperties {
  flow: "low" | "balanced" | "high";
  viscosity: "thick" | "balanced" | "runny";
  /** How strongly Squeeze raises deposition for this brush -- 1 = no response (the dry-brush default when this block is absent entirely). */
  squeezeResponse: number;
}

export type BrushFamily = "spray" | "round" | "chisel" | "mop";

export interface BrushProfile extends BrushCoreProperties {
  family: BrushFamily;
  id: string;
  name: string;
  /** Present only for a wet-capable brush -- see `BrushWetProperties`. Absence IS the "hide/disable wet-only controls" signal for the UI. */
  wet?: BrushWetProperties;
}

const MOP_SQUEEZE_RESPONSE = 2.6;

function spraySoftness(preset: SprayCapPreset): number {
  // Edge falloff already runs "hard -> soft" in the same direction as our
  // 0-1 softness scale; no separate mapping table needed.
  return Math.max(0, Math.min(1, preset.edgeFalloff));
}

function resolveSprayProfile(capId: string): BrushProfile {
  const preset = getSprayCapPreset(capId);
  return {
    family: "spray",
    id: preset.id,
    name: preset.name,
    size: preset.baseRadius,
    opacity: preset.coreOpacity,
    dripTendency: preset.dripTendency,
    // Matches the width formula DripAccumulator.observe now derives a
    // Spray drip's own body width from (see DripLogic.ts) -- expressed
    // here as size-relative so it reads on the same axis as every other
    // family's dripBodyWidthRatio.
    dripBodyWidthRatio: 0.11 + preset.dripTendency * 0.05,
    taperAmount: 0.28,
    terminalBeadRatio: 1.15,
    originPoolingRatio: 0,
    previewFootprint: {
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

function resolveDryMarkerProfile(variant: MarkerVariantDefinition): BrushProfile {
  const family: BrushFamily = variant.id === "round" ? "round" : "chisel";
  return {
    family,
    id: variant.id,
    name: variant.name,
    size: variant.defaultSize,
    // Dry markers lay down a dense, near-opaque mark -- there is no
    // per-variant opacity dial for them today (see MarkerVariantDefinition),
    // so this is the same ceiling `DripAccumulator` already treats a
    // tendency-driven nominal opacity against for every non-Spray-preset
    // caller (no `sourceOpacityCeiling` supplied -- see main.ts).
    opacity: 0.95,
    dripTendency: variant.dripTendency,
    dripBodyWidthRatio: 0.11 + variant.dripTendency * 0.05,
    taperAmount: 0.28,
    terminalBeadRatio: variant.dripTendency > 0 ? 1.15 : 0,
    originPoolingRatio: 0,
    previewFootprint: resolveMarkerFootprint(variant.id),
  };
}

function resolveWetMarkerProfile(variant: MarkerVariantDefinition, variantId: WetMarkerVariantId): BrushProfile {
  const pool = getWetPaintProfile(variantId);
  return {
    family: "mop",
    id: variant.id,
    name: variant.name,
    size: variant.defaultSize,
    opacity: 0.95,
    dripTendency: variant.dripTendency,
    // Mop's own pool model already owns real, hard-won width/taper/pooling
    // tuning (`stemWidthBaseRatio`/`tipWidthRatio`/`originPoolRatio` -- see
    // WetPaintModel.ts) -- this profile surfaces those exact values rather
    // than re-deriving new ones, so Brush Studio and any preview read the
    // SAME numbers the live pool-channel renderer actually uses.
    dripBodyWidthRatio: pool.stemWidthBaseRatio,
    taperAmount: 1 - pool.tipWidthRatio,
    terminalBeadRatio: 1.15,
    originPoolingRatio: pool.originPoolRatio,
    previewFootprint: resolveMarkerFootprint(variant.id),
    wet: {
      flow: "balanced",
      viscosity: "balanced",
      squeezeResponse: MOP_SQUEEZE_RESPONSE,
    },
  };
}

function resolveMarkerProfile(variantId: MarkerVariantId): BrushProfile {
  const variant = getMarkerVariant(variantId);
  if (isWetMarkerVariant(variantId)) return resolveWetMarkerProfile(variant, variantId);
  return resolveDryMarkerProfile(variant);
}

/**
 * The one resolver every tool, and every piece of shared brush UI, calls.
 * `toolId` selects which underlying family to resolve `id` against --
 * "spray-can" reads Spray cap presets, "paint-marker" reads marker variants
 * (dispatching internally to the wet or dry shape depending on the variant).
 */
export function resolveBrushProfile(toolId: DrawingToolId, id: string): BrushProfile {
  if (toolId === "spray-can") return resolveSprayProfile(id);
  return resolveMarkerProfile(id as MarkerVariantId);
}

export function isWetBrushProfile(profile: BrushProfile): boolean {
  return profile.wet !== undefined;
}
