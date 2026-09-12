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
  coneShape: "round" | "fan" | "needle" | "diffuse";
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
  "pink-dot-fat": profile(34, 54, "round", "balanced", "wide", "very-high", "pronounced", "dense", "low", "loaded", "symmetric", "High-output fat baseline; requires empirical flare and coverage-rate calibration."),
  "astro-fat": profile(48, 78, "round", "soft", "wide", "very-high", "pronounced", "balanced", "low", "loaded", "symmetric", "Ultra-fat digital baseline; not yet matched to a physical Astro cap at measured distance."),
  "german-fat": profile(28, 50, "round", "raw", "splattery", "high", "moderate", "balanced", "high", "raw", "symmetric", "Raw-edge fat baseline; splatter and output volume require controlled reference samples."),
  "lego-thin": profile(10, 19, "round", "hard", "restrained", "medium", "restrained", "dense", "high", "tight", "symmetric", "Controlled thin baseline pending measured line and dot references."),
  "universal-thin": profile(8, 16, "round", "balanced", "restrained", "low", "restrained", "balanced", "high", "tight", "symmetric", "General thin baseline; distance sensitivity remains descriptive only."),
  "level-1": profile(4, 9, "round", "hard", "restrained", "low", "restrained", "dense", "high", "tight", "symmetric", "Skinny baseline pending pressure/output comparison across paint systems."),
  "new-york-thin": profile(6, 14, "round", "hard", "restrained", "medium", "moderate", "dense", "high", "loaded", "symmetric", "Punchier thin baseline pending real cap and stationary-dot comparison."),
  calligraphy: profile(14, 34, "fan", "balanced", "restrained", "medium", "moderate", "balanced", "medium", "settled", "fixed-transversal", "Shaped aerosol plume, physically distinct from a contacting Chisel marker nib."),
  needle: profile(3, 10, "needle", "raw", "splattery", "medium", "pronounced", "dense", "high", "loaded", "symmetric", "Needle cone, output, edge breakup, and stationary load need dedicated empirical calibration."),
  "soft-fade": profile(34, 68, "diffuse", "soft", "wide", "low", "restrained", "soft-fade", "high", "settled", "symmetric", "Diffuse fade baseline pending measured distance and paint-opacity references."),
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
