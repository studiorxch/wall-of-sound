# 0608_WOS_MapBuildingStylizationTreatment_v0.1.0_BUILD

**Status:** [BUILD]  
**Project:** WOS / Map Lab / Visual Treatment System  
**Target:** Claude / Codex implementation  
**Primary Goal:** Add a reusable stylization treatment layer for Mapbox 3D buildings that creates global outlines, world-locked surface textures, controlled color differentiation, and day/night visual behavior without breaking motion readability.

---

## 1. Purpose

WOS needs a map visual treatment that moves away from raw Mapbox realism and toward an illustrated, organic, print-textured world. The treatment should support a Moebius-adjacent look without copying it directly.

The system should begin with **buildings on the map**, then be structured so the same treatment stack can later expand to roads, props, terrain, water, vehicles, and event spaces.

This build should prove:

```text
Mapbox 3D buildings
→ global outline pass
→ organic surface texture variation
→ controlled color palette assignment
→ day/night visual modes
→ stable motion during fly-throughs and driving previews
```

---

## 2. Environmental Assumptions

- Existing WOS Studio uses a web-based map environment.
- Map rendering is currently Mapbox-based or Mapbox-compatible.
- Building geometry is already visible in 3D.
- The system is likely implemented in TypeScript.
- The current priority is visual treatment, not full asset replacement.
- This build should not require rewriting the core map system.
- The treatment must remain performant enough for preview videos and future live-stream environments.
- The treatment must be modular so it can be toggled on/off.

---

## 3. Non-Negotiable Visual Requirements

### 3.1 Global Outlines

Outlines should appear across the board, especially on:

- Building silhouettes
- Major vertical edges
- Roof boundaries
- Strong depth transitions
- Intersections between buildings and ground plane

The outline system should feel graphic, not purely technical.

Avoid:

- Perfectly sterile CAD-style wireframes
- Excessive comic-book thickness
- Flickering outlines during camera motion
- Outlines that only work from one camera angle

Target feeling:

```text
clean illustrated city
with slightly imperfect drawn edges
```

---

### 3.2 Organic Surface Texture

Buildings should not remain flat solid blocks.

Each building should receive subtle surface breakup using world-locked procedural texture.

The texture should resemble:

- map-country border shapes
- erosion patches
- concrete variation
- faded paint zones
- screen-print irregularity
- hand-painted surface islands

Avoid:

- random TV noise
- animated noise
- screen-space texture swimming
- overly realistic dirt/grunge
- photographic brick textures
- high-contrast stains that distract from map readability

Texture must be **world-locked**, meaning it sticks to the building/map position and does not crawl as the camera moves.

---

### 3.3 Color Differentiation

The map needs color logic that differentiates areas without becoming chaotic.

Color should help the viewer read:

- neighborhoods
- districts
- building groups
- landmarks
- zoning-like areas
- special event areas

Color assignment should be deterministic and stable.

The same building should keep the same palette choice between sessions unless the seed or style profile changes.

---

### 3.4 Day/Night Support

The treatment should support at least two visual modes:

1. **Day Mode**
2. **Night Mode**

Day mode should prioritize:

- warm building colors
- readable outlines
- subtle paper/concrete texture
- clear sunlight response

Night mode should prioritize:

- darker building bases
- stronger silhouettes
- glowing windows or light pools where available
- reduced color brightness
- increased importance of local light contrast

---

## 4. Scope

### 4.1 In Scope

Build a first-pass stylization system for Mapbox buildings:

- Global outline treatment
- Building surface color palette system
- Organic procedural patch texture
- Day/night style profile switching
- Config-driven visual controls
- Safe fallback behavior
- Minimal debug controls for tuning

---

### 4.2 Out of Scope

Do not build these in this pass:

- Full road texture system
- Full terrain stylization
- Water shader redesign
- Vehicle styling
- Character/actor styling
- Asset replacement workflow
- Save/load user style presets
- In-map painting tools
- OBS overlay export
- Final production art direction lock

---

## 5. Desired Architecture

Follow this build order:

```text
Data layer
→ Logic layer
→ Interface layer
```

---

## 6. Data Layer

Create a config-driven style system.

Recommended file:

```text
src/map-style/mapTreatmentConfig.ts
```

Export typed style profiles.

```ts
export type MapTreatmentMode = "day" | "night";

export type MapTreatmentConfig = {
  enabled: boolean;
  mode: MapTreatmentMode;
  outline: OutlineTreatmentConfig;
  color: BuildingColorTreatmentConfig;
  texture: BuildingTextureTreatmentConfig;
};

export type OutlineTreatmentConfig = {
  enabled: boolean;
  color: string;
  opacity: number;
  baseWidth: number;
  depthSensitivity: number;
  normalSensitivity: number;
  wobbleAmount: number;
};

export type BuildingColorTreatmentConfig = {
  enabled: boolean;
  seed: number;
  palette: string[];
  districtPalette?: Record<string, string[]>;
  brightnessVariance: number;
  saturationVariance: number;
};

export type BuildingTextureTreatmentConfig = {
  enabled: boolean;
  seed: number;
  opacity: number;
  scale: number;
  patchContrast: number;
  edgeSoftness: number;
  worldLocked: boolean;
};
```

Include default profiles:

```ts
export const dayMapTreatmentConfig: MapTreatmentConfig = {
  enabled: true,
  mode: "day",
  outline: {
    enabled: true,
    color: "#1d1a16",
    opacity: 0.72,
    baseWidth: 1.25,
    depthSensitivity: 0.65,
    normalSensitivity: 0.55,
    wobbleAmount: 0.12,
  },
  color: {
    enabled: true,
    seed: 108,
    palette: ["#d8b98c", "#cfa66e", "#b98d64", "#e1c7a0", "#a8a77d"],
    brightnessVariance: 0.08,
    saturationVariance: 0.06,
  },
  texture: {
    enabled: true,
    seed: 208,
    opacity: 0.18,
    scale: 0.85,
    patchContrast: 0.22,
    edgeSoftness: 0.35,
    worldLocked: true,
  },
};

export const nightMapTreatmentConfig: MapTreatmentConfig = {
  enabled: true,
  mode: "night",
  outline: {
    enabled: true,
    color: "#080706",
    opacity: 0.88,
    baseWidth: 1.45,
    depthSensitivity: 0.72,
    normalSensitivity: 0.62,
    wobbleAmount: 0.08,
  },
  color: {
    enabled: true,
    seed: 109,
    palette: ["#2c2f38", "#353038", "#25323a", "#3a302b", "#1f2831"],
    brightnessVariance: 0.05,
    saturationVariance: 0.04,
  },
  texture: {
    enabled: true,
    seed: 209,
    opacity: 0.24,
    scale: 0.95,
    patchContrast: 0.28,
    edgeSoftness: 0.42,
    worldLocked: true,
  },
};
```

---

## 7. Logic Layer

Recommended file:

```text
src/map-style/buildingTreatment.ts
```

Create small single-purpose utilities.

### 7.1 Stable Building Color Assignment

Each building needs a stable palette index.

Preferred inputs, in order:

1. Mapbox feature ID
2. Building footprint centroid
3. Tile coordinate + feature index fallback

Create deterministic hash utilities.

```ts
export function hashStringToNumber(value: string, seed: number): number {
  let hash = seed;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

export function getStablePaletteColor(
  stableId: string,
  palette: string[],
  seed: number
): string {
  if (palette.length === 0) {
    return "#c8b28d";
  }

  const hash = hashStringToNumber(stableId, seed);
  return palette[hash % palette.length];
}
```

### 7.2 Organic Patch Generation

Use procedural noise or Voronoi/Worley-style patterning.

Requirements:

- Must be deterministic.
- Must use world/map coordinates.
- Must not use screen-space coordinates.
- Must remain stable during camera movement.
- Must be subtle by default.

If shader-level implementation is available, prefer shader uniforms.

If only Mapbox layer styling is available, fake the first pass by applying:

- color variation by feature
- opacity/brightness variation by feature
- optional overlay canvas layer later

### 7.3 Outline Pass

Preferred outline methods, in order:

1. Post-process edge detection using depth + normals, if available.
2. Custom Three.js / deck.gl overlay outline pass, if compatible.
3. Mapbox line/edge approximation using extruded building boundaries.
4. Fallback: darker building side/roof contrast plus footprint outline.

The implementation should expose a single function:

```ts
export function applyMapTreatment(
  map: mapboxgl.Map,
  config: MapTreatmentConfig
): void {
  if (!config.enabled) {
    return;
  }

  applyBuildingColorTreatment(map, config);
  applyBuildingTextureTreatment(map, config);
  applyOutlineTreatment(map, config);
}
```

Each treatment should be isolated.

```ts
function applyBuildingColorTreatment(
  map: mapboxgl.Map,
  config: MapTreatmentConfig
): void {
  if (!config.color.enabled) {
    return;
  }

  // Implementation depends on current Mapbox layer structure.
}

function applyBuildingTextureTreatment(
  map: mapboxgl.Map,
  config: MapTreatmentConfig
): void {
  if (!config.texture.enabled) {
    return;
  }

  // First pass may be feature-level color variation.
  // Shader or overlay pass can be added after base proof works.
}

function applyOutlineTreatment(
  map: mapboxgl.Map,
  config: MapTreatmentConfig
): void {
  if (!config.outline.enabled) {
    return;
  }

  // Use best available outline strategy.
}
```

---

## 8. Interface Layer

Recommended file:

```text
src/map-style/MapTreatmentControls.tsx
```

Add minimal debug controls only.

Controls:

- Enable / disable treatment
- Day / night mode
- Outline opacity
- Outline width
- Texture opacity
- Texture scale
- Color palette seed

Do not overbuild a full style editor.

This panel is for tuning the treatment during development.

---

## 9. Visual Style Profiles

### 9.1 Day Profile

Target:

```text
illustrated map
warm concrete
soft sun
thin dark outlines
subtle surface patches
```

Suggested palette:

```text
sand
ochre
faded orange
muted clay
warm gray
desaturated green
```

---

### 9.2 Night Profile

Target:

```text
dark illustrated city
strong silhouettes
muted surfaces
light pools
visible window rhythm
```

Suggested palette:

```text
blue-gray
charcoal
deep brown
dark muted purple
lamp amber accents
```

---

## 10. Map Color Differentiation Strategy

Use a layered approach.

### 10.1 Base Building Color

Every building gets a stable base color from the active palette.

### 10.2 District-Level Tint

If district/neighborhood data exists later, buildings can inherit a subtle tint.

Example:

```text
industrial district → rust / gray
residential district → cream / tan
commercial district → warm gray / faded blue
park-adjacent → muted green / stone
waterfront → blue-gray / concrete
```

### 10.3 Landmark Override

Special buildings can eventually receive explicit art-directed colors.

Example:

```ts
export type LandmarkColorOverride = {
  stableId: string;
  color: string;
  reason: string;
};
```

Do not implement full landmark overrides unless current building IDs are stable and accessible.

---

## 11. Motion Safety Rules

This treatment must work during camera movement.

### 11.1 Required

- Textures must be locked to world/map coordinates.
- Outlines must not flicker excessively.
- Grain must be subtle.
- Color variation must not create visual noise at distance.
- Treatment must remain readable from both overhead and driving views.

### 11.2 Avoid

- Screen-space animated noise
- High-frequency texture
- Heavy grain
- Flashing outlines
- Overly bright district color changes
- Thin outlines that shimmer at distance

---

## 12. Performance Requirements

The first pass should remain lightweight.

Targets:

- No major frame-rate drop in normal map preview.
- Style toggle should apply without reloading the full application.
- Treatment config updates should be debounced.
- Expensive shader or post-process passes should be optional.
- Fallback rendering must still work if advanced outline/texture passes are unavailable.

---

## 13. Error Handling

Add guard clauses for:

- Missing Mapbox map instance
- Missing building layer
- Empty palette
- Invalid mode
- Unsupported outline method
- Failed style update
- Layer already exists
- Layer does not exist yet because map style has not loaded

Recommended pattern:

```ts
export function safeApplyMapTreatment(
  map: mapboxgl.Map | null,
  config: MapTreatmentConfig
): void {
  if (!map) {
    console.warn("[MapTreatment] Missing map instance.");
    return;
  }

  if (!map.isStyleLoaded()) {
    map.once("style.load", () => applyMapTreatment(map, config));
    return;
  }

  try {
    applyMapTreatment(map, config);
  } catch (error) {
    console.error("[MapTreatment] Failed to apply treatment.", error);
  }
}
```

---

## 14. Acceptance Criteria

This build is successful when:

- Buildings visibly shift away from default Mapbox styling.
- Buildings have stable differentiated colors.
- A global outline effect is visible or approximated.
- Surface texture variation is visible but subtle.
- Treatment works in day mode.
- Treatment works in night mode.
- The system can be toggled off.
- Camera movement does not cause texture swimming.
- Code is modular and does not damage existing Map Lab behavior.
- The implementation can be extended later to roads, terrain, props, and vehicles.

---

## 15. Suggested File Structure

```text
src/
  map-style/
    mapTreatmentConfig.ts
    buildingTreatment.ts
    treatmentHash.ts
    MapTreatmentControls.tsx
```

Optional later:

```text
src/
  map-style/
    shaders/
      outlinePass.glsl
      organicPatch.glsl
    palettes/
      dayPalette.ts
      nightPalette.ts
```

---

## 16. Build Notes for Claude / Codex

Implement the safest possible version first.

Priority order:

1. Stable color variation on buildings
2. Day/night config switching
3. Outline approximation
4. Texture approximation
5. Shader-level refinement only if current architecture supports it cleanly

Do not force a complex shader system if the current map stack is not ready.

The first working build should prove the visual direction without destabilizing Map Lab.

---

## 17. Implementation Guide

- **Where:** Add `src/map-style/mapTreatmentConfig.ts`, `src/map-style/treatmentHash.ts`, `src/map-style/buildingTreatment.ts`, and optional `src/map-style/MapTreatmentControls.tsx`. Wire `safeApplyMapTreatment()` into the existing Map Lab map initialization after the Mapbox style has loaded.

- **What:** Run the existing project install/build commands, then run the dev server. If using npm: `npm install && npm run dev`. If using pnpm: `pnpm install && pnpm dev`.

- **Expect:** The Map Lab view should show stylized 3D buildings with differentiated colors, visible outline treatment or fallback edge contrast, subtle texture breakup, and a working day/night treatment switch without breaking building selection or camera movement.
