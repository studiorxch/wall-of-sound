export type SprayCapId = "fat" | "skinny" | "soft" | "high-pressure" | "dust-fog";

export interface SprayCapPreset {
  id: SprayCapId;
  name: string;
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
}

export const SPRAY_CAP_PRESETS: readonly SprayCapPreset[] = [
  {
    id: "fat",
    name: "Fat Cap",
    baseRadius: 38,
    coreDensity: 1.2,
    coreOpacity: 0.34,
    edgeFalloff: 0.66,
    particleCount: 28,
    particleSpread: 1.18,
    particleSize: 0.72,
    particleOpacity: 0.3,
    flowRate: 1.15,
    accumulationRate: 1.2,
    velocityResponse: 0.72,
  },
  {
    id: "skinny",
    name: "Skinny Cap",
    baseRadius: 12,
    coreDensity: 0.84,
    coreOpacity: 0.36,
    edgeFalloff: 0.8,
    particleCount: 9,
    particleSpread: 0.82,
    particleSize: 0.42,
    particleOpacity: 0.26,
    flowRate: 0.76,
    accumulationRate: 0.86,
    velocityResponse: 1,
  },
  {
    id: "soft",
    name: "Soft Cap",
    baseRadius: 46,
    coreDensity: 0.46,
    coreOpacity: 0.18,
    edgeFalloff: 0.3,
    particleCount: 34,
    particleSpread: 1.42,
    particleSize: 0.5,
    particleOpacity: 0.16,
    flowRate: 0.72,
    accumulationRate: 0.62,
    velocityResponse: 0.52,
  },
  {
    id: "high-pressure",
    name: "High Pressure",
    baseRadius: 34,
    coreDensity: 1.55,
    coreOpacity: 0.4,
    edgeFalloff: 0.7,
    particleCount: 40,
    particleSpread: 1.34,
    particleSize: 0.68,
    particleOpacity: 0.34,
    flowRate: 1.48,
    accumulationRate: 1.45,
    velocityResponse: 0.42,
  },
  {
    id: "dust-fog",
    name: "Dust / Fog",
    baseRadius: 54,
    coreDensity: 0.24,
    coreOpacity: 0.14,
    edgeFalloff: 0.18,
    particleCount: 58,
    particleSpread: 1.68,
    particleSize: 0.4,
    particleOpacity: 0.18,
    flowRate: 0.72,
    accumulationRate: 0.54,
    velocityResponse: 0.84,
  },
] as const;

export function getSprayCapPreset(id: string): SprayCapPreset {
  return SPRAY_CAP_PRESETS.find((preset) => preset.id === id) ?? SPRAY_CAP_PRESETS[0];
}

export function mapVelocityToDensity(
  velocity: number,
  velocityResponse: number,
): number {
  const normalizedVelocity = Math.min(1, Math.max(0, velocity) / 1.5);
  const response = Math.min(1, Math.max(0, velocityResponse));
  return Math.min(1.45, Math.max(0.55, 1 + (0.42 - normalizedVelocity * 0.72) * response));
}

export function resolveSprayDynamics(
  preset: SprayCapPreset,
  velocity: number,
  radius: number,
): ResolvedSprayDynamics {
  const densityMultiplier = mapVelocityToDensity(velocity, preset.velocityResponse);
  const safeRadius = Math.max(1, radius);
  const corePasses = Math.max(
    1,
    Math.min(4, Math.round(preset.coreDensity * preset.flowRate * densityMultiplier * 1.8)),
  );
  const speedSpread = 1 + Math.min(0.28, Math.max(0, velocity) * 0.12 * preset.velocityResponse);

  return {
    radius: safeRadius,
    densityMultiplier,
    corePasses,
    coreOpacity: Math.min(
      0.68,
      preset.coreOpacity * preset.accumulationRate * densityMultiplier,
    ),
    particleCount: Math.max(
      0,
      Math.round(preset.particleCount * preset.flowRate * (0.72 + densityMultiplier * 0.28)),
    ),
    particleSpread: safeRadius * preset.particleSpread * speedSpread,
    particleSize: preset.particleSize * (0.88 + Math.min(0.35, Math.max(0, velocity) * 0.08)),
    particleOpacity: Math.min(0.6, preset.particleOpacity * densityMultiplier),
  };
}
