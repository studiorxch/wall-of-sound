export type SprayCapId =
  | "new-york-fat"
  | "pink-dot-fat"
  | "astro-fat"
  | "german-fat"
  | "lego-thin"
  | "universal-thin"
  | "level-1"
  | "new-york-thin"
  | "calligraphy"
  | "needle"
  | "soft-fade";

export type SprayCapFamily = "fat" | "thin" | "specialty";
export type EndpointBehavior = "settled" | "tapered" | "punchy" | "raw";

export interface SprayCapPreset {
  id: SprayCapId;
  name: string;
  family: SprayCapFamily;
  baseRadius: number;
  coreDensity: number;
  coreOpacity: number;
  edgeFalloff: number;
  particleCount: number;
  particleSpread: number;
  particleSize: number;
  particleOpacity: number;
  flowRate: number;
  accumulationRate: number;
  velocityResponse: number;
  jitter: number;
  endpointBehavior: EndpointBehavior;
  splatterProbability: number;
  dripTendency: number;
  anisotropy: number;
}

export interface ResolvedSprayDynamics {
  radius: number;
  densityMultiplier: number;
  corePasses: number;
  coreOpacity: number;
  particleCount: number;
  particleSpread: number;
  particleSize: number;
  particleOpacity: number;
  jitter: number;
  anisotropy: number;
  splatterProbability: number;
}

export const SPRAY_CAP_PRESETS: readonly SprayCapPreset[] = [
  { id: "new-york-fat", name: "New York Fat", family: "fat", baseRadius: 32, coreDensity: 1.14, coreOpacity: 0.29, edgeFalloff: 0.7, particleCount: 18, particleSpread: 1.08, particleSize: 0.65, particleOpacity: 0.25, flowRate: 1.2, accumulationRate: 1.16, velocityResponse: 0.58, jitter: 0.08, endpointBehavior: "settled", splatterProbability: 0.08, dripTendency: 0.48, anisotropy: 1 },
  { id: "pink-dot-fat", name: "Pink Dot Fat", family: "fat", baseRadius: 42, coreDensity: 1.46, coreOpacity: 0.34, edgeFalloff: 0.76, particleCount: 26, particleSpread: 1.2, particleSize: 0.72, particleOpacity: 0.29, flowRate: 1.48, accumulationRate: 1.38, velocityResponse: 0.42, jitter: 0.06, endpointBehavior: "punchy", splatterProbability: 0.14, dripTendency: 0.72, anisotropy: 1 },
  { id: "astro-fat", name: "Astro Fat", family: "fat", baseRadius: 62, coreDensity: 1.28, coreOpacity: 0.3, edgeFalloff: 0.64, particleCount: 38, particleSpread: 1.34, particleSize: 0.8, particleOpacity: 0.27, flowRate: 1.56, accumulationRate: 1.3, velocityResponse: 0.36, jitter: 0.1, endpointBehavior: "settled", splatterProbability: 0.18, dripTendency: 0.66, anisotropy: 1 },
  { id: "german-fat", name: "German / Hardcore Fat", family: "fat", baseRadius: 38, coreDensity: 1.06, coreOpacity: 0.27, edgeFalloff: 0.54, particleCount: 32, particleSpread: 1.42, particleSize: 0.62, particleOpacity: 0.24, flowRate: 1.18, accumulationRate: 1.08, velocityResponse: 0.68, jitter: 0.18, endpointBehavior: "raw", splatterProbability: 0.28, dripTendency: 0.5, anisotropy: 1 },
  { id: "lego-thin", name: "Lego Thin", family: "thin", baseRadius: 14, coreDensity: 1.08, coreOpacity: 0.35, edgeFalloff: 0.84, particleCount: 8, particleSpread: 0.8, particleSize: 0.4, particleOpacity: 0.22, flowRate: 0.88, accumulationRate: 0.9, velocityResponse: 0.92, jitter: 0.04, endpointBehavior: "settled", splatterProbability: 0.03, dripTendency: 0.18, anisotropy: 1 },
  { id: "universal-thin", name: "Universal Thin", family: "thin", baseRadius: 11, coreDensity: 0.92, coreOpacity: 0.32, edgeFalloff: 0.78, particleCount: 7, particleSpread: 0.88, particleSize: 0.38, particleOpacity: 0.2, flowRate: 0.8, accumulationRate: 0.84, velocityResponse: 1, jitter: 0.07, endpointBehavior: "tapered", splatterProbability: 0.05, dripTendency: 0.12, anisotropy: 1 },
  { id: "level-1", name: "Level 1 / Skinny Cream", family: "thin", baseRadius: 6, coreDensity: 0.84, coreOpacity: 0.3, edgeFalloff: 0.88, particleCount: 4, particleSpread: 0.68, particleSize: 0.3, particleOpacity: 0.18, flowRate: 0.64, accumulationRate: 0.72, velocityResponse: 1, jitter: 0.03, endpointBehavior: "tapered", splatterProbability: 0.01, dripTendency: 0.06, anisotropy: 1 },
  { id: "new-york-thin", name: "New York Thin", family: "thin", baseRadius: 9, coreDensity: 1.2, coreOpacity: 0.38, edgeFalloff: 0.82, particleCount: 6, particleSpread: 0.76, particleSize: 0.34, particleOpacity: 0.2, flowRate: 0.82, accumulationRate: 0.92, velocityResponse: 0.86, jitter: 0.04, endpointBehavior: "punchy", splatterProbability: 0.04, dripTendency: 0.16, anisotropy: 1 },
  { id: "calligraphy", name: "Calligraphy / Transversal", family: "specialty", baseRadius: 25, coreDensity: 1.02, coreOpacity: 0.33, edgeFalloff: 0.74, particleCount: 10, particleSpread: 0.82, particleSize: 0.42, particleOpacity: 0.2, flowRate: 0.96, accumulationRate: 0.94, velocityResponse: 0.72, jitter: 0.04, endpointBehavior: "tapered", splatterProbability: 0.04, dripTendency: 0.22, anisotropy: 0.32 },
  { id: "needle", name: "Needle", family: "specialty", baseRadius: 5, coreDensity: 1.58, coreOpacity: 0.42, edgeFalloff: 0.92, particleCount: 15, particleSpread: 2.05, particleSize: 0.26, particleOpacity: 0.3, flowRate: 1.12, accumulationRate: 1.6, velocityResponse: 0.9, jitter: 0.12, endpointBehavior: "raw", splatterProbability: 0.24, dripTendency: 0.94, anisotropy: 1 },
  { id: "soft-fade", name: "Soft / Fade", family: "specialty", baseRadius: 50, coreDensity: 0.36, coreOpacity: 0.13, edgeFalloff: 0.28, particleCount: 42, particleSpread: 1.6, particleSize: 0.38, particleOpacity: 0.14, flowRate: 0.68, accumulationRate: 0.52, velocityResponse: 0.82, jitter: 0.2, endpointBehavior: "settled", splatterProbability: 0.12, dripTendency: 0.04, anisotropy: 1 },
] as const;

const LEGACY_CAP_ALIASES: Record<string, SprayCapId> = {
  fat: "new-york-fat",
  skinny: "universal-thin",
  soft: "soft-fade",
  "high-pressure": "pink-dot-fat",
  "dust-fog": "soft-fade",
};

export function getSprayCapPreset(id: string): SprayCapPreset {
  const canonicalId = LEGACY_CAP_ALIASES[id] ?? id;
  return SPRAY_CAP_PRESETS.find((preset) => preset.id === canonicalId) ?? SPRAY_CAP_PRESETS[0];
}

export function mapVelocityToDensity(velocity: number, velocityResponse: number): number {
  const normalizedVelocity = Math.min(1, Math.max(0, velocity) / 1.5);
  const response = Math.min(1, Math.max(0, velocityResponse));
  return Math.min(1.48, Math.max(0.58, 1 + (0.44 - normalizedVelocity * 0.72) * response));
}

export function resolveSprayDynamics(preset: SprayCapPreset, velocity: number, radius: number): ResolvedSprayDynamics {
  const densityMultiplier = mapVelocityToDensity(velocity, preset.velocityResponse);
  const safeRadius = Math.max(1, radius);
  return {
    radius: safeRadius,
    densityMultiplier,
    corePasses: Math.max(1, Math.min(5, Math.round(preset.coreDensity * preset.flowRate * densityMultiplier * 1.65))),
    coreOpacity: Math.min(0.72, preset.coreOpacity * preset.accumulationRate * densityMultiplier),
    particleCount: Math.max(0, Math.round(preset.particleCount * preset.flowRate * (0.72 + densityMultiplier * 0.28))),
    particleSpread: safeRadius * preset.particleSpread * (1 + Math.min(0.3, Math.max(0, velocity) * 0.12 * preset.velocityResponse)),
    particleSize: preset.particleSize * (0.88 + Math.min(0.32, Math.max(0, velocity) * 0.08)),
    particleOpacity: Math.min(0.62, preset.particleOpacity * densityMultiplier),
    jitter: safeRadius * preset.jitter,
    anisotropy: preset.anisotropy,
    splatterProbability: preset.splatterProbability,
  };
}
