// 0709_PLAY_BroadcastOverlayToggleRegistry_v1.0.0
// Centralized registry of named broadcast visual overlays.
// All compression-hostile overlays default to disabled.

export type BroadcastOverlayId =
  | "paper_texture"
  | "scanlines"
  | "noise"
  | "vignette"
  | "grid"
  | "glow"
  | "atmosphere"
  | "route_trails"
  | "debug_hud";

export type BroadcastOverlayConfig = {
  id: BroadcastOverlayId;
  label: string;
  description: string;
  defaultEnabled: boolean;
  compressionRisk: "low" | "medium" | "high";
};

export const BROADCAST_OVERLAYS: BroadcastOverlayConfig[] = [
  {
    id: "paper_texture",
    label: "Paper Texture",
    description: "Retro paper / print texture overlay. Disabled by default for OBS clarity.",
    defaultEnabled: false,
    compressionRisk: "high",
  },
  {
    id: "scanlines",
    label: "Scanlines",
    description: "CRT-style horizontal line overlay. Disabled by default for OBS clarity.",
    defaultEnabled: false,
    compressionRisk: "high",
  },
  {
    id: "noise",
    label: "Noise",
    description: "Film grain / digital noise overlay. Disabled by default for OBS clarity.",
    defaultEnabled: false,
    compressionRisk: "high",
  },
  {
    id: "vignette",
    label: "Vignette",
    description: "Dark edge treatment. Disabled by default in broadcast-safe mode.",
    defaultEnabled: false,
    compressionRisk: "medium",
  },
  {
    id: "grid",
    label: "Grid",
    description: "Optional visual grid overlay.",
    defaultEnabled: false,
    compressionRisk: "medium",
  },
  {
    id: "glow",
    label: "Glow",
    description: "Soft glow / bloom styling. Disabled by default for sharper map output.",
    defaultEnabled: false,
    compressionRisk: "high",
  },
  {
    id: "atmosphere",
    label: "Atmosphere",
    description: "Atmospheric haze / blur overlay. Disabled by default for OBS clarity.",
    defaultEnabled: false,
    compressionRisk: "high",
  },
  {
    id: "route_trails",
    label: "Route Trails",
    description: "Route motion / trail visuals from the WOS map.",
    defaultEnabled: true,
    compressionRisk: "medium",
  },
  {
    id: "debug_hud",
    label: "Debug HUD",
    description: "Diagnostic HUD overlays.",
    defaultEnabled: false,
    compressionRisk: "low",
  },
];

export type BroadcastOverlayState = Record<BroadcastOverlayId, boolean>;

export function createDefaultBroadcastOverlayState(): BroadcastOverlayState {
  return BROADCAST_OVERLAYS.reduce(
    (state, overlay) => { state[overlay.id] = overlay.defaultEnabled; return state; },
    {} as BroadcastOverlayState,
  );
}

export function getBroadcastOverlayClassNames(overlays: BroadcastOverlayState): string {
  return (Object.entries(overlays) as [BroadcastOverlayId, boolean][])
    .filter(([, enabled]) => enabled)
    .map(([id]) => `broadcast-overlay--${id}`)
    .join(" ");
}
