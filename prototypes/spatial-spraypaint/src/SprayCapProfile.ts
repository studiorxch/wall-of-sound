import {
  getSprayCapPreset,
  type SprayCapId,
  type SprayCapPreset,
} from "./SprayCapPresets";

export interface NominalWidthRange {
  minimum: number;
  maximum: number;
  unit: "wall-units-digital-baseline";
}

export interface SprayCursorFootprint {
  shape: "circle" | "ellipse";
  coverageScale: number;
  aspectRatio: number;
  orientationBehavior: SprayCapProfile["orientationBehavior"];
}

export interface SprayCapProfile {
  id: SprayCapId;
  name: string;
  family: SprayCapPreset["family"];
  nominalWidthRange: NominalWidthRange;
  coneShape: "round" | "fan" | "needle" | "diffuse" | "annular" | "banded";
  edgeCharacter: "hard" | "balanced" | "soft" | "raw";
  oversprayCharacter: "restrained" | "balanced" | "wide" | "splattery";
  outputVolume: "low" | "medium" | "high" | "very-high";
  flareBehavior: "restrained" | "moderate" | "pronounced";
  fadeBehavior: "dense" | "balanced" | "soft-fade";
  distanceResponse: "digital-baseline-pending-physical-calibration";
  speedResponse: "low" | "medium" | "high";
  stationaryDotBehavior: "tight" | "settled" | "loaded" | "raw";
  orientationBehavior: "symmetric" | "fixed-transversal";
  cursorFootprint: SprayCursorFootprint;
  calibrationStatus: "digital-baseline-not-physical-reference";
  calibrationNotes: string;
  deposition: SprayCapPreset;
}

type ProfileDetails = Omit<SprayCapProfile, "id" | "name" | "family" | "deposition" | "cursorFootprint">;

const units = "wall-units-digital-baseline" as const;
const pending = "digital-baseline-pending-physical-calibration" as const;
const baseline = "digital-baseline-not-physical-reference" as const;

const CAP_PROFILE_DETAILS: Record<SprayCapId, ProfileDetails> = {
  "new-york-fat": profile(24, 42, "round", "balanced", "balanced", "high", "moderate", "dense", "medium", "settled", "symmetric", "Baseline fat-cap reference; physical width, distance, and paint-brand trials remain pending."),
  "pink-dot-fat": profile(34, 54, "round", "balanced", "wide", "very-high", "pronounced", "dense", "low", "loaded", "symmetric", "Corrected: the halo previously read as a constant glow/bloom regardless of size or movement, unlike the distance-sensitive loaded-dot cap shown in reference footage. Now distance-sensitive (small resolved size -> clean hot dot/line, large resolved size -> pronounced center+ring bloom, via the live Size control), oblique-flared (elongates into an ellipse at higher travel velocity, circular at rest), dab-spaced (a moving stroke deposits discrete overlapping dabs instead of one smeared bar), and ring-biased (a soft moat-then-peak gradient reads as a genuine center+ring, not a single glow). Core/overspray physics untouched. Still digital-baseline, not physically verified — magnitude was set by reference-footage judgment, not measurement."),
  "track-marks": profile(34, 54, "round", "balanced", "wide", "very-high", "pronounced", "dense", "low", "loaded", "symmetric", "TEMPORARY preservation cap: an exact numeric duplicate of Pink Dot Fat, kept only so the prior swept-offset-rail stationary look isn't lost while Pink Dot Fat's own stationary rendering moves to the new organic aerosol deposition field. Not a distinct physical reference — expect this cap to be removed once the new field is confirmed against real footage."),
  "astro-fat": profile(48, 78, "round", "soft", "wide", "very-high", "pronounced", "balanced", "low", "loaded", "symmetric", "Corrected V2: previously resolved to a core opacity only ~9% denser than New York Fat's despite ~2x the radius, reading as \"New York Fat scaled up\" rather than a distinct personality. coreDensity/coreOpacity/flowRate/accumulationRate raised together (resolved core now ~1.5x New York Fat's), edgeFalloff lowered (softer bloom via overspray/core character, no halo or ring field — never duplicates Pink Dot Fat or Ring/Donut), particleCount/particleSpread/particleOpacity raised, endpointBehavior settled->punchy. Still digital-baseline, not physically verified; not yet matched to a physical Astro cap at measured distance."),
  "german-fat": profile(28, 50, "round", "raw", "splattery", "high", "moderate", "balanced", "high", "raw", "symmetric", "Raw-edge fat baseline; splatter and output volume require controlled reference samples."),
  "lego-thin": profile(10, 19, "round", "hard", "restrained", "medium", "restrained", "dense", "high", "tight", "symmetric", "Controlled thin baseline pending measured line and dot references."),
  "universal-thin": profile(8, 16, "round", "balanced", "restrained", "low", "restrained", "balanced", "high", "tight", "symmetric", "General thin baseline; distance sensitivity remains descriptive only."),
  "level-1": profile(4, 9, "round", "hard", "restrained", "low", "restrained", "dense", "high", "tight", "symmetric", "Skinny baseline pending pressure/output comparison across paint systems."),
  "new-york-thin": profile(6, 14, "round", "hard", "restrained", "medium", "moderate", "dense", "high", "loaded", "symmetric", "Punchier thin baseline pending real cap and stationary-dot comparison."),
  calligraphy: profile(14, 34, "fan", "balanced", "restrained", "medium", "moderate", "balanced", "medium", "settled", "fixed-transversal", "Shaped aerosol plume (genuine oval stamp, not a width-modulated line), physically distinct from a contacting Chisel marker nib. Softer/smoother sibling of Rectangular Transversal; still digital-baseline, not physically verified."),
  "transversal-slot": profile(14, 34, "fan", "hard", "restrained", "medium", "moderate", "balanced", "medium", "settled", "fixed-transversal", "Rectangular/slot-stamped aerosol plume — stronger side definition and a more pronounced wide/narrow contrast than Oval Calligraphy, reading closer to a spray chisel nozzle. Shares Oval Calligraphy's baseRadius/scale family but a harder edgeFalloff and tighter overspray squash. Digital baseline, not physically verified."),
  needle: profile(3, 10, "needle", "hard", "restrained", "medium", "restrained", "dense", "high", "loaded", "symmetric", "Corrected V2: a concentrated pinline jet — hot dense core, sharply reduced overspray spread/count/opacity versus the prior fuzzy baseline. Still digital-baseline; edge breakup and stationary load remain unverified against a real Needle reference."),
  "wiggly-needle": profile(3, 10, "needle", "hard", "restrained", "medium", "restrained", "dense", "high", "loaded", "symmetric", "Specialty oscillating variant of the corrected Needle above — deposition identical to Needle (both corrected together), plus a bounded deterministic lateral wander. Digital effect cap, not a physical-cap target; future Waveformer audio-modulation candidate."),
  "soft-fade": profile(34, 68, "diffuse", "soft", "wide", "low", "restrained", "soft-fade", "high", "settled", "symmetric", "Diffuse fade baseline pending measured distance and paint-opacity references."),
  "fuzz-fat": profile(28, 50, "round", "raw", "splattery", "high", "moderate", "balanced", "high", "raw", "symmetric", "StudioRich effect cap. A permanent fork of the pre-calibration \"German / Hardcore Fat\" digital behavior, preserved for its fuzzy/hairy/dry-brush texture. Not a physical-cap target and not intended to be recalibrated against real German/Hardcore Fat references."),
  "ring-donut": profile(36, 62, "annular", "soft", "balanced", "high", "pronounced", "balanced", "medium", "loaded", "symmetric", "StudioRich digital output archetype — a genuine annular (ring/donut) structure, not a physical-cap target and not assigned to any real cap identity. Center opacity deliberately below ring-band opacity; magnitude chosen by screenshot judgment, unverified against any reference."),
  "dry-streak": profile(28, 48, "banded", "raw", "restrained", "medium", "moderate", "balanced", "medium", "raw", "symmetric", "StudioRich digital output archetype — deterministic multi-lane directional gaps/ribbing, not a physical-cap target and not assigned to any real cap identity. Distinct from Fuzz Fat's random-jitter raggedness: the gap pattern is pure position-derived trig, replays identically, and is unverified against any reference."),
};

export function getSprayCapProfile(id: string): SprayCapProfile {
  const deposition = getSprayCapPreset(id);
  const details = CAP_PROFILE_DETAILS[deposition.id];
  return {
    id: deposition.id,
    name: deposition.name,
    family: deposition.family,
    ...details,
    cursorFootprint: {
      shape: deposition.anisotropy < 0.98 ? "ellipse" : "circle",
      coverageScale: Math.max(1, deposition.particleSpread),
      aspectRatio: deposition.anisotropy,
      orientationBehavior: details.orientationBehavior,
    },
    deposition,
  };
}

function profile(
  minimum: number,
  maximum: number,
  coneShape: SprayCapProfile["coneShape"],
  edgeCharacter: SprayCapProfile["edgeCharacter"],
  oversprayCharacter: SprayCapProfile["oversprayCharacter"],
  outputVolume: SprayCapProfile["outputVolume"],
  flareBehavior: SprayCapProfile["flareBehavior"],
  fadeBehavior: SprayCapProfile["fadeBehavior"],
  speedResponse: SprayCapProfile["speedResponse"],
  stationaryDotBehavior: SprayCapProfile["stationaryDotBehavior"],
  orientationBehavior: SprayCapProfile["orientationBehavior"],
  calibrationNotes: string,
): ProfileDetails {
  return {
    nominalWidthRange: { minimum, maximum, unit: units },
    coneShape,
    edgeCharacter,
    oversprayCharacter,
    outputVolume,
    flareBehavior,
    fadeBehavior,
    distanceResponse: pending,
    speedResponse,
    stationaryDotBehavior,
    orientationBehavior,
    calibrationStatus: baseline,
    calibrationNotes,
  };
}
