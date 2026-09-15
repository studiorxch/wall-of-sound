import { type SprayCapId, type SprayCapPreset } from "./SprayCapPresets";

/**
 * Brush provenance — distinct from the Visual Audit's calibration confidence
 * axis (VERIFIED/PROVISIONAL/etc). This is about where a brush came from:
 * a real physical cap category, an intentional StudioRich digital effect, or
 * something a user built in Brush Studio. Never conflate a custom/digital
 * brush with a physical-reference one.
 */
export type BrushProvenance = "physical-reference" | "digital-effect" | "custom-studio-brush";

/**
 * Every built-in cap's provenance, matching the classification already
 * established in the Spray Cap Visual Audit's "physical vs. digital" field
 * per cap. Kept as a plain lookup (not a field on SprayCapPreset) so the
 * closed preset union and its consumers stay untouched by this addition.
 */
const BUILT_IN_PROVENANCE: Record<SprayCapId, BrushProvenance> = {
  "new-york-fat": "physical-reference",
  "pink-dot-fat": "physical-reference",
  "astro-fat": "physical-reference",
  "german-fat": "physical-reference",
  "lego-thin": "physical-reference",
  "universal-thin": "physical-reference",
  "level-1": "physical-reference",
  "new-york-thin": "physical-reference",
  calligraphy: "physical-reference",
  "transversal-slot": "physical-reference",
  needle: "physical-reference",
  "wiggly-needle": "digital-effect",
  "soft-fade": "physical-reference",
  "fuzz-fat": "digital-effect",
};

export function classifyBuiltInSprayCap(id: SprayCapId): BrushProvenance {
  return BUILT_IN_PROVENANCE[id];
}

/** Custom brush ids always carry this prefix, so provenance is derivable from the id alone. */
export const CUSTOM_SPRAY_ID_PREFIX = "custom:spray:";

export function isCustomSprayCapId(id: string): boolean {
  return id.startsWith(CUSTOM_SPRAY_ID_PREFIX);
}

/** Works for both built-in and custom ids — the one place callers should ask "what is this brush?" */
export function classifySprayCapId(id: string): BrushProvenance {
  if (isCustomSprayCapId(id)) return "custom-studio-brush";
  return BUILT_IN_PROVENANCE[id as SprayCapId] ?? "physical-reference";
}

export interface CustomSprayBrush {
  /**
   * Structurally a full SprayCapPreset (every field the render engine reads),
   * but NOT a member of `SPRAY_CAP_PRESETS` and not typed with the closed
   * `SprayCapId` union — it lives in a separate, session-local registry.
   */
  preset: Omit<SprayCapPreset, "id"> & { id: string };
  sourceId: SprayCapId | string;
  createdAt: number;
}

let customSprayCounter = 0;

/** Deterministic-enough for a session; uniqueness only needs to hold within one running app instance. */
export function createCustomSprayBrushId(): string {
  customSprayCounter += 1;
  return `${CUSTOM_SPRAY_ID_PREFIX}${Date.now().toString(36)}:${customSprayCounter}`;
}

/**
 * Duplicates a Spray brush (built-in or custom) into a new custom identity.
 * Pure with respect to `source` — always returns a shallow copy, so the
 * physical/reference preset it came from is never mutated, whether that
 * source is a canonical `SprayCapPreset` or another custom brush's preset.
 */
export function duplicateSprayBrush(
  source: SprayCapPreset | CustomSprayBrush["preset"],
  name: string,
  id: string = createCustomSprayBrushId(),
): CustomSprayBrush {
  return {
    preset: { ...source, id, name },
    sourceId: source.id,
    createdAt: Date.now(),
  };
}

export function renameCustomSprayBrush(brush: CustomSprayBrush, name: string): CustomSprayBrush {
  return { ...brush, preset: { ...brush.preset, name } };
}

/** Session-local, in-memory only — see checkpoint doc for the persistence prerequisite this defers. */
export type CustomSprayBrushRegistry = readonly CustomSprayBrush[];

export const EMPTY_CUSTOM_SPRAY_REGISTRY: CustomSprayBrushRegistry = [];

export function addCustomSprayBrush(
  registry: CustomSprayBrushRegistry,
  brush: CustomSprayBrush,
): CustomSprayBrushRegistry {
  return [...registry, brush];
}

export function updateCustomSprayBrush(
  registry: CustomSprayBrushRegistry,
  id: string,
  next: CustomSprayBrush,
): CustomSprayBrushRegistry {
  return registry.map((brush) => (brush.preset.id === id ? next : brush));
}

export function findCustomSprayBrush(
  registry: CustomSprayBrushRegistry,
  id: string,
): CustomSprayBrush | undefined {
  return registry.find((brush) => brush.preset.id === id);
}
