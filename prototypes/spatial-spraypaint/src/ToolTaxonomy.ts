import { SPRAY_CAP_PRESETS, type SprayCapId } from "./SprayCapPresets";
import { getSprayCapClassification, type CalibrationClassification } from "./SprayCapCalibrationStatus";

/**
 * Tool family / lineage classification — a THIRD axis, orthogonal to two
 * fields that already use the word "family" elsewhere in this codebase:
 * `SprayCapPreset.family` ("fat"|"thin"|"specialty", physical FORM factor)
 * and `DrawingToolDefinition.family` ("aerosol"|"marker", RENDERER engine).
 * `ToolFamilyId` instead answers "what authenticity claim does this tool
 * make" — real-cap-inspired, StudioRich-native/effect, or future non-aerosol
 * expressive drawing. Distinct from `CalibrationClassification`
 * (`SprayCapCalibrationStatus.ts`), which answers "how physically verified
 * is it" — a Physical Graffiti cap can be VERIFIED, PROVISIONAL, or
 * NEEDS_CALIBRATION; an Experimental/Creative cap is always DIGITAL_EFFECT.
 */
export type ToolFamilyId = "physical-graffiti" | "experimental-creative" | "ink-gonzo-expressive";

export interface ToolFamilyDefinition {
  id: ToolFamilyId;
  name: string;
  description: string;
}

export const TOOL_FAMILIES: readonly ToolFamilyDefinition[] = [
  {
    id: "physical-graffiti",
    name: "Physical Graffiti",
    description:
      "Real-cap-inspired tools intended to approximate physical spray behavior. Membership here is a claim of INTENT, not of proof — see CalibrationClassification for how physically verified each one currently is.",
  },
  {
    id: "experimental-creative",
    name: "Experimental / Creative Caps",
    description:
      "StudioRich-native or deliberately non-physical effects, some born as useful simulation artifacts. Never presented as simulations of a real commercial cap.",
  },
  {
    id: "ink-gonzo-expressive",
    name: "Ink / Gonzo / Expressive Drawing",
    description:
      "Future-facing, non-aerosol expressive mark-making family. Seed preset names only as of this pass — no renderer exists yet.",
  },
] as const;

/**
 * Hand-maintained, like `SPRAY_CAP_CLASSIFICATION` in
 * `SprayCapCalibrationStatus.ts` — this pass is classification only, it does
 * not derive family from any other field. Every existing `SprayCapId` is
 * covered exactly once; the brief's own initial-member lists (Pocket, Pro
 * Cap, Flame Super Fine, etc.) named several Physical Graffiti caps that do
 * not exist as registry entries yet — they are not invented here, only the
 * caps already in `SPRAY_CAP_PRESETS` are classified.
 */
const SPRAY_CAP_TOOL_FAMILY: Record<SprayCapId, ToolFamilyId> = {
  "new-york-fat": "physical-graffiti",
  "pink-dot-fat": "physical-graffiti",
  "astro-fat": "physical-graffiti",
  "german-fat": "physical-graffiti",
  "lego-thin": "physical-graffiti",
  "universal-thin": "physical-graffiti",
  "level-1": "physical-graffiti",
  "new-york-thin": "physical-graffiti",
  calligraphy: "physical-graffiti",
  "transversal-slot": "physical-graffiti",
  needle: "physical-graffiti",
  "soft-fade": "physical-graffiti",
  "track-marks": "experimental-creative",
  "fuzz-fat": "experimental-creative",
  "ring-donut": "experimental-creative",
  "dry-streak": "experimental-creative",
  "wiggly-needle": "experimental-creative",
};

export function getToolFamily(id: SprayCapId): ToolFamilyId {
  return SPRAY_CAP_TOOL_FAMILY[id];
}

export interface ToolTaxonomyEntry {
  id: SprayCapId;
  name: string;
  toolFamily: ToolFamilyId;
  calibration: CalibrationClassification;
}

/** The registry the desired-output "table showing each current spray cap's family/classification" refers to. Derived, never hand-duplicated. */
export const SPRAY_CAP_TOOL_TAXONOMY: readonly ToolTaxonomyEntry[] = SPRAY_CAP_PRESETS.map((preset) => ({
  id: preset.id,
  name: preset.name,
  toolFamily: SPRAY_CAP_TOOL_FAMILY[preset.id],
  calibration: getSprayCapClassification(preset.id),
}));

/**
 * Flair is not a cap and not a medium — it is an expressive modulation layer
 * sitting between raw input and the canonical tool state (see
 * `CanonicalSprayState` below). `classification` mirrors the brief's own
 * distinction: `wall`/`blackbook` are physical-surface interpretations,
 * `wild` is explicitly expressive/digital and must never be presented as a
 * physical simulation, `off` is neutral (no modulation beyond the tool's
 * normal behavior).
 */
export type FlairModeId = "off" | "wall" | "blackbook" | "wild";

export interface FlairModeDefinition {
  id: FlairModeId;
  name: string;
  description: string;
  classification: "physical" | "expressive-digital" | "neutral";
}

export const FLAIR_MODES: readonly FlairModeDefinition[] = [
  {
    id: "off",
    name: "Off",
    description: "No flair modulation beyond the tool's normal behavior.",
    classification: "neutral",
  },
  {
    id: "wall",
    name: "Wall",
    description:
      "Physical, large-surface interpretation: stronger distance-to-surface relationship, broader flare envelope, slower/more physical transitions. Appropriate for hand-tracking or mouse Z-distance simulation.",
    classification: "physical",
  },
  {
    id: "blackbook",
    name: "Blackbook",
    description:
      "Small-surface / page interpretation: tighter flare envelope, quicker response, less implied body-scale distance, more controlled calligraphic behavior.",
    classification: "physical",
  },
  {
    id: "wild",
    name: "Wild",
    description:
      "Extended digital interpretation: permits exaggerated thick/thin transitions that may exceed realistic spray-can behavior. Must be clearly classified as expressive/digital, not physical simulation.",
    classification: "expressive-digital",
  },
] as const;

/**
 * Metadata/routing authority only, per the brief: does not hard-code
 * "higher on screen = farther from wall," and does not drive cap physics
 * directly. Distinct from `FlairModeId`: a surface context describes WHERE
 * the artist is working; a flair mode describes HOW input is expressively
 * mapped once there. The two will compose later (e.g. `wall` surface +
 * `wall` flair), but nothing in this pass wires that composition up.
 */
export type SurfaceContextId = "wall" | "blackbook" | "neutral";

export interface SurfaceContextDefinition {
  id: SurfaceContextId;
  name: string;
  description: string;
}

export const SURFACE_CONTEXTS: readonly SurfaceContextDefinition[] = [
  {
    id: "wall",
    name: "Wall",
    description: "Large-surface, body-scale context. Routing authority only in this pass.",
  },
  {
    id: "blackbook",
    name: "Blackbook",
    description: "Small-surface / page context. Routing authority only in this pass.",
  },
  {
    id: "neutral",
    name: "Neutral",
    description: "No surface-context claim; input mapping falls back to current default behavior.",
  },
] as const;

/**
 * The architecture this pass moves toward, documented explicitly per the
 * brief's own diagram:
 *
 *   Input
 *   -> Surface Context
 *   -> Flair / Expressive Mapping
 *   -> Canonical Tool State
 *   -> Tool / Cap Renderer
 *
 * A cap must never know whether input came from mouse, Pencil, hand
 * tracking, or future hardware — only fields on this canonical state should
 * ever reach a renderer. SCHEMA/DOCUMENTATION ONLY as of this pass:
 * `SprayBrushEngine`/`main.ts` do not construct or consume this type yet,
 * and defining it changes no runtime behavior. Field names deliberately
 * mirror the brief's own `position(t), sprayDistance(t), sprayAngle(t),
 * sprayOutput(t)` plus velocity/dwell already used by Flare V1's live
 * `baseRadius`/drip-dwell mechanisms.
 */
export interface CanonicalSprayState {
  x: number;
  y: number;
  distance: number;
  angle: number;
  output: number;
  velocity: number;
  dwell: number;
}

/**
 * Semantic parameter groups for future pro controls — schema/UI metadata
 * only, per the brief ("do not build a large new UI in this pass"). Group
 * keys are descriptive labels over EXISTING fields (see each description),
 * not new engine state.
 */
export interface ParameterGroupDefinition<Key extends string> {
  key: Key;
  label: string;
  description: string;
}

export type SprayParameterGroupKey = "size" | "coverage" | "flair" | "texture" | "drip";

export const SPRAY_PARAMETER_GROUPS: readonly ParameterGroupDefinition<SprayParameterGroupKey>[] = [
  { key: "size", label: "Size", description: "Resolved deposition radius — the existing live Size control / baseRadius pipeline." },
  { key: "coverage", label: "Coverage", description: "Fill-mode local-saturation ceiling and related density controls." },
  { key: "flair", label: "Flair", description: "The expressive modulation layer (see FlairModeId) between input and canonical tool state." },
  { key: "texture", label: "Texture", description: "Overspray/particle/edge character — particleSpread, particleOpacity, edgeFalloff, jitter, wiggle." },
  { key: "drip", label: "Drip", description: "Drip authority and taper — dripTendency, sourceOpacityCeiling." },
] as const;

export type InkParameterGroupKey = "nibWidth" | "dryness" | "jitter" | "splatter" | "taper";

export const INK_PARAMETER_GROUPS: readonly ParameterGroupDefinition<InkParameterGroupKey>[] = [
  { key: "nibWidth", label: "Nib Width", description: "Ink/Gonzo nib contact width — not yet wired to any renderer." },
  { key: "dryness", label: "Dryness", description: "Ink/Gonzo dry-brush/streak character — not yet wired to any renderer." },
  { key: "jitter", label: "Jitter", description: "Ink/Gonzo positional noise — not yet wired to any renderer." },
  { key: "splatter", label: "Splatter", description: "Ink/Gonzo splatter probability — not yet wired to any renderer." },
  { key: "taper", label: "Taper", description: "Ink/Gonzo stroke taper — not yet wired to any renderer." },
] as const;

/**
 * Ink / Gonzo / Expressive Drawing — SEED NAMES ONLY, per the brief
 * ("Do not implement their renderers yet"). Deliberately NOT a `SprayCapId`
 * member, NOT added to `SPRAY_CAP_PRESETS`, and NOT resolvable through
 * `getSprayCapPreset` — this registry is fully isolated from the live Spray
 * renderer so a future implementation pass cannot accidentally paint with an
 * un-built preset.
 */
export type InkGonzoPresetId = "scratch-pen" | "savage-brush" | "splatter-nib" | "gonzo-letterer";

export interface InkGonzoPresetSeed {
  id: InkGonzoPresetId;
  name: string;
  toolFamily: "ink-gonzo-expressive";
  status: "seed-name-only";
}

export const INK_GONZO_PRESET_SEEDS: readonly InkGonzoPresetSeed[] = [
  { id: "scratch-pen", name: "Scratch Pen", toolFamily: "ink-gonzo-expressive", status: "seed-name-only" },
  { id: "savage-brush", name: "Savage Brush", toolFamily: "ink-gonzo-expressive", status: "seed-name-only" },
  { id: "splatter-nib", name: "Splatter Nib", toolFamily: "ink-gonzo-expressive", status: "seed-name-only" },
  { id: "gonzo-letterer", name: "Gonzo Letterer", toolFamily: "ink-gonzo-expressive", status: "seed-name-only" },
] as const;
