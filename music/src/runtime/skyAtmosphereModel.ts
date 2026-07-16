// Sky/Atmosphere Model — parameter authority for Three.js Sky integration.
//
// Feasibility audit (0625D):
//   Three.js present in WOS: YES — global.THREE via CDN (wallRuntimeGlbRenderLayer.js,
//     worldSpaceVehicleLayer.js, heroVehicleRenderer.js). Used for buildings/vehicles.
//   Existing renderer: cloudAtmosphereRenderer.js (canvas-based cloud sheets) — NOT Three.js Sky.
//   Existing custom layer support: Mapbox CustomLayerInterface used for vehicle/GLB layers.
//   Sky shader feasible in WOS now: BLOCKED — requires WOS-side changes (cross-origin from PLAY).
//   Sky shader feasible in PLAY now: BLOCKED — PLAY-side canvas would overlay WOS iframe,
//     conflicting with WOS's own cloudAtmosphereRenderer.js. Integration path requires
//     Three.js Sky shader added as a WOS Mapbox custom layer (WOS-side work).
//
// Current renderer: "sky-bridge" — PLAY-side parameter authority only (no shader output).
// Next step: add threeSkyLayer.js in WOS as a Mapbox CustomLayerInterface using global.THREE.Sky.

export type SkyPhase = "night" | "dawn" | "morning" | "midday" | "afternoon" | "sunset" | "late_night";

export type SkyAtmosphereParams = {
  skyEnabled: boolean;
  phase: SkyPhase;
  phaseLabel: string;
  sunElevation: number;    // degrees above horizon (neg = below)
  sunAzimuth: number;      // degrees (0=N, 90=E, 180=S, 270=W)
  turbidity: number;       // 2–20 (haze/aerosol loading)
  rayleigh: number;        // 0–4 (sky-blue scattering)
  mieCoefficient: number;  // 0.005–0.1 (particle scattering)
  mieDirectionalG: number; // 0.7–0.999 (forward-scatter intensity)
  exposure: number;        // 0.08–1.0 (overall brightness)
  cloudCoverage: number;   // 0–1
  cloudDensity: number;    // 0–1
  cloudElevation: number;  // 0–1 (normalized height)
  renderer: "sky-bridge" | "three-sky" | "unavailable";
  rendererBlockReason?: string;
};

const SKY_BRIDGE_BLOCK = "THREE CANVAS BLOCKED — sky canvas would cover WOS iframe; integration requires WOS-side threeSkyLayer.js (Mapbox CustomLayerInterface)";

const SKY_PHASES: Record<SkyPhase, SkyAtmosphereParams> = {
  night: {
    skyEnabled: true, phase: "night", phaseLabel: "NIGHT",
    sunElevation: -20, sunAzimuth: 0,
    turbidity: 2,  rayleigh: 1.0, mieCoefficient: 0.005, mieDirectionalG: 0.80,
    exposure: 0.10, cloudCoverage: 0.20, cloudDensity: 0.30, cloudElevation: 0.65,
    renderer: "sky-bridge", rendererBlockReason: SKY_BRIDGE_BLOCK,
  },
  dawn: {
    skyEnabled: true, phase: "dawn", phaseLabel: "DAWN",
    sunElevation: 2, sunAzimuth: 90,
    turbidity: 4,  rayleigh: 2.5, mieCoefficient: 0.020, mieDirectionalG: 0.85,
    exposure: 0.35, cloudCoverage: 0.30, cloudDensity: 0.35, cloudElevation: 0.60,
    renderer: "sky-bridge", rendererBlockReason: SKY_BRIDGE_BLOCK,
  },
  morning: {
    skyEnabled: true, phase: "morning", phaseLabel: "MORNING",
    sunElevation: 25, sunAzimuth: 110,
    turbidity: 5,  rayleigh: 2.0, mieCoefficient: 0.015, mieDirectionalG: 0.88,
    exposure: 0.65, cloudCoverage: 0.25, cloudDensity: 0.30, cloudElevation: 0.62,
    renderer: "sky-bridge", rendererBlockReason: SKY_BRIDGE_BLOCK,
  },
  midday: {
    skyEnabled: true, phase: "midday", phaseLabel: "MIDDAY",
    sunElevation: 70, sunAzimuth: 180,
    turbidity: 6,  rayleigh: 1.5, mieCoefficient: 0.010, mieDirectionalG: 0.90,
    exposure: 1.00, cloudCoverage: 0.20, cloudDensity: 0.25, cloudElevation: 0.65,
    renderer: "sky-bridge", rendererBlockReason: SKY_BRIDGE_BLOCK,
  },
  afternoon: {
    skyEnabled: true, phase: "afternoon", phaseLabel: "AFTERNOON",
    sunElevation: 40, sunAzimuth: 220,
    turbidity: 6,  rayleigh: 1.8, mieCoefficient: 0.012, mieDirectionalG: 0.88,
    exposure: 0.85, cloudCoverage: 0.30, cloudDensity: 0.35, cloudElevation: 0.62,
    renderer: "sky-bridge", rendererBlockReason: SKY_BRIDGE_BLOCK,
  },
  sunset: {
    skyEnabled: true, phase: "sunset", phaseLabel: "SUNSET",
    sunElevation: 5, sunAzimuth: 270,
    turbidity: 10, rayleigh: 3.5, mieCoefficient: 0.040, mieDirectionalG: 0.92,
    exposure: 0.45, cloudCoverage: 0.40, cloudDensity: 0.45, cloudElevation: 0.58,
    renderer: "sky-bridge", rendererBlockReason: SKY_BRIDGE_BLOCK,
  },
  late_night: {
    skyEnabled: true, phase: "late_night", phaseLabel: "LATE NIGHT",
    sunElevation: -25, sunAzimuth: 0,
    turbidity: 2,  rayleigh: 0.8, mieCoefficient: 0.005, mieDirectionalG: 0.80,
    exposure: 0.08, cloudCoverage: 0.20, cloudDensity: 0.25, cloudElevation: 0.65,
    renderer: "sky-bridge", rendererBlockReason: SKY_BRIDGE_BLOCK,
  },
};

export function getSkyPhaseFromHour(hour: number): SkyPhase {
  if (hour >= 0  && hour < 4)  return "night";
  if (hour >= 4  && hour < 6)  return "dawn";
  if (hour >= 6  && hour < 12) return "morning";
  if (hour >= 12 && hour < 14) return "midday";
  if (hour >= 14 && hour < 18) return "afternoon";
  if (hour >= 18 && hour < 21) return "sunset";
  return "late_night";
}

export function getSkyParams(hour: number): SkyAtmosphereParams {
  return SKY_PHASES[getSkyPhaseFromHour(hour)];
}
