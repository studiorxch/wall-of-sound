// Playlist Analyzer Review — creative translation (spec §9).
// Deterministic phrase assembly grounded in the computed identity/arc/section
// findings — this is "Interpreted" language (spec §7) built from "Measured"/
// "Inferred" layers, never presented as fact on its own.

import type { PlaylistArcSummary, PlaylistCreativeExport, PlaylistIdentitySummary, PlaylistSectionReview } from "../../data/playlistAnalyzerTypes";

const MOTION_BY_MOVEMENT: Record<string, string[]> = {
  "static, held steady": ["stillness", "suspended drift"],
  "gradual drift": ["slow parallax", "gentle drift"],
  "dynamic, actively moving": ["cutting momentum", "active motion"],
};

const MATERIALS_BY_TEXTURE: Record<string, string[]> = {
  "smooth, soft transients": ["haze", "glass", "soft light"],
  "balanced texture": ["muted grain", "layered fabric"],
  "rough, dense transients": ["static", "grit", "torn edges"],
};

const COLOR_BY_TEMPERATURE: Record<string, string[]> = {
  cool: ["cool", "low contrast", "faded"],
  neutral: ["muted", "balanced tone"],
  warm: ["warm", "saturated", "golden"],
};

export function buildCreativeExport(
  identity: PlaylistIdentitySummary,
  arc: PlaylistArcSummary,
  sections: PlaylistSectionReview[],
): PlaylistCreativeExport {
  const primary = identity.primaryMoods[0];
  const secondary = identity.primaryMoods.slice(1).join(" and ");
  const temperature = identity.emotionalTemperature ?? "neutral";

  const sectionNote = sections.length > 0 ? ` across ${sections.length} named section${sections.length === 1 ? "" : "s"}` : "";
  const themeSummary = primary
    ? `A ${temperature} playlist centered on ${primary}${secondary ? `, moving through ${secondary}` : ""}${sectionNote}.`
    : "A playlist with insufficient analyzed identity to summarize confidently.";

  const openingPhase = arc.phases.find((p) => p.phase === "opening");
  const peakPhase = arc.phases.find((p) => p.phase === "peak");
  const closerPhase = arc.phases.find((p) => p.phase === "closer");

  const descriptionDraft = [
    themeSummary,
    identity.movement ? `The sequence is ${identity.movement}.` : undefined,
    openingPhase?.dominantMoods.length ? `It opens ${openingPhase.dominantMoods.join(", ").toLowerCase()}` : undefined,
    peakPhase?.dominantMoods.length ? `builds toward a passage carrying ${peakPhase.dominantMoods.join(", ").toLowerCase()}` : undefined,
    closerPhase && identity.resolution ? `and ${identity.resolution === "resolved" ? "settles" : "leaves things unresolved"} by the close.` : undefined,
  ].filter(Boolean).join(" ");

  const visualConcept = identity.texture && identity.brightness
    ? `${identity.brightness} tones with ${identity.texture} — a ${temperature} palette that mirrors the playlist's ${identity.movement ?? "movement"}.`
    : "Insufficient identity data for a confident visual concept — treat as a rough starting point.";

  const motionDirection = identity.movement ? (MOTION_BY_MOVEMENT[identity.movement] ?? ["undefined motion"]) : [];
  const materials = identity.texture ? (MATERIALS_BY_TEXTURE[identity.texture] ?? []) : [];
  const colorCharacter = COLOR_BY_TEMPERATURE[temperature] ?? [];
  const spatialCharacter = identity.density
    ? [identity.density]
    : [];

  const avoid: string[] = [];
  if (temperature === "cool") avoid.push("saturated warmth", "energetic cuts");
  if (identity.texture === "smooth, soft transients") avoid.push("dense collage", "hard edges");
  if (identity.movement === "dynamic, actively moving") avoid.push("static, motionless imagery");

  const imagePromptDraft = [
    primary ? `${primary} atmosphere` : "undefined atmosphere",
    identity.brightness,
    identity.texture,
    colorCharacter.join(", "),
    materials.length ? `materials: ${materials.join(", ")}` : undefined,
  ].filter(Boolean).join(", ");

  const confidenceInputs = [identity.confidence, ...arc.phases.map((p) => p.confidence)];
  const confidence = confidenceInputs.length ? Math.min(...confidenceInputs) : 0;

  return {
    themeSummary,
    descriptionDraft: descriptionDraft || "Not enough analyzed data to draft a description with confidence.",
    visualConcept,
    motionDirection,
    materials,
    colorCharacter,
    spatialCharacter,
    avoid,
    imagePromptDraft,
    confidence: +confidence.toFixed(3),
  };
}
