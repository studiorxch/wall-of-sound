// ── orbProfileTypes ────────────────────────────────────────────────────────
// 0730C_MAPS_Orb_Profiles_Library_and_Active_Hero_Runtime
//
// Orb Profiles are reusable Three.js visual-avatar records — MAPS' 4th
// library, alongside Geographic/Vehicles/Overlays. Unlike Vehicles' single
// flat values-blob (one Hero Car, fixed fields), each Orb Profile is a full,
// independent, nested record — closer in shape to a Geographic Style, but
// describing a 3D object graph instead of map paint properties.
//
// Explicitly out of scope per the written spec (never added, even though an
// earlier mockup showed it): any audio-reactive field, toggle, or tag. Every
// field below is an ordinary, non-audio visual/behavioral control the five
// seeded archetypes actually use.

export type OrbArchetype =
  | "core-sphere"
  | "glass-shell"
  | "particle-orb"
  | "node-cluster"
  | "contained-world";

export const ORB_ARCHETYPES: OrbArchetype[] = [
  "core-sphere", "glass-shell", "particle-orb", "node-cluster", "contained-world",
];

export const ORB_ARCHETYPE_LABELS: Record<OrbArchetype, string> = {
  "core-sphere": "Core Sphere",
  "glass-shell": "Glass Shell",
  "particle-orb": "Particle Orb",
  "node-cluster": "Node Cluster",
  "contained-world": "Contained World",
};

export type OrbBinding = "maps" | "radio" | "shared";

export const ORB_BINDINGS: OrbBinding[] = ["maps", "radio", "shared"];

export const ORB_BINDING_LABELS: Record<OrbBinding, string> = {
  maps: "MAPS",
  radio: "RADIO",
  shared: "Shared",
};

export type OrbRuntimeStatus = "ready" | "unsupported" | "error";

export interface OrbGeometryConfig {
  scale: number;
  segments: number;
  deformation: number;
}

export interface OrbMaterialConfig {
  baseColor: string;
  emissiveColor: string;
  emissiveIntensity: number;
  opacity: number;
  transparent: boolean;
  roughness: number;
  metalness: number;
  transmission: number;
}

export interface OrbTextureConfig {
  enabled: boolean;
  sourceId: string | null;
  mapping: "uv" | "environment";
  scale: number;
}

export interface OrbLightingConfig {
  ambientIntensity: number;
  keyIntensity: number;
  rimIntensity: number;
}

export interface OrbMotionConfig {
  rotationSpeed: number;
  idleAmplitude: number;
  pulseAmount: number;
}

export interface OrbParticlesConfig {
  enabled: boolean;
  count: number;
  size: number;
  spread: number;
  speed: number;
}

export interface OrbNodesConfig {
  enabled: boolean;
  count: number;
  connectionDistance: number;
  lineOpacity: number;
}

export type OrbContainedPrimitive = "sphere" | "cube" | "torus" | "none";

export interface OrbContainedObjectConfig {
  enabled: boolean;
  primitive: OrbContainedPrimitive;
  scale: number;
  color: string;
}

export interface OrbProfile {
  id: string;
  name: string;
  archetype: OrbArchetype;
  binding: OrbBinding;

  geometry: OrbGeometryConfig;
  material: OrbMaterialConfig;
  texture: OrbTextureConfig;
  lighting: OrbLightingConfig;
  motion: OrbMotionConfig;

  particles?: OrbParticlesConfig;
  nodes?: OrbNodesConfig;
  containedObject?: OrbContainedObjectConfig;

  runtimeStatus: OrbRuntimeStatus;
  createdAt: number;
  updatedAt: number;
}

export type OrbProfilesById = Record<string, OrbProfile>;
