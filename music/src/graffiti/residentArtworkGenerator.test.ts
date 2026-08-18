import { describe, it, expect } from "vitest";
import { generateArtworkIntent, generateStrokesFromIntent } from "./residentArtworkGenerator";
import type { GraffitiStyleProfile, ResidentGraffitiArtist } from "../data/subwayResidentGraffitiTypes";

// BUILD §37 categories 6-12.

const RESIDENT: ResidentGraffitiArtist = {
  id: "sr-resident-000001", displayName: "Test Resident", tagName: "TEST",
  creatorType: "resident", creatorId: "sr-resident-000001", status: "active", homeBorough: null,
  preferredRoutes: [], preferredRouteFamilies: ["ace"], preferredSurfaceTypes: ["exterior_side_a", "exterior_side_b"],
  styleProfileId: "sr-style-000001",
  behaviorProfile: { emptySurfacePreference: 0.8, coverPermission: "never", coverProbability: 0, routeAffinity: 0.5, recencyAvoidance: 0.5, repeatCarAvoidance: 0.5, maxRecentPlacementsConsidered: 5 },
  createdAt: 0, updatedAt: 0, artworkHistory: [], placementHistory: [],
};

const MARKER_STYLE: GraffitiStyleProfile = {
  id: "sr-style-000001", label: "Test Marker Style", preferredTools: ["marker"], preferredColors: ["#ff0066", "#111111"],
  widthRange: { min: 0.01, max: 0.03 }, pressureBias: 0.6, density: 0.4, strokeCountRange: { min: 3, max: 5 },
  angularity: 0.3, curvature: 0.5, dripAffinity: 0, fatcapAffinity: 0, markerAffinity: 1, symmetryBias: 0.5,
  verticality: 0.5, horizontalStretch: 0.5, complexity: 0.4, seedSalt: 11,
};

const FATCAP_STYLE: GraffitiStyleProfile = { ...MARKER_STYLE, id: "sr-style-000002", preferredTools: ["fatcap"], markerAffinity: 0, fatcapAffinity: 1, seedSalt: 23 };
const MOP_STYLE: GraffitiStyleProfile = { ...MARKER_STYLE, id: "sr-style-000003", preferredTools: ["mop"], markerAffinity: 0, dripAffinity: 1, seedSalt: 37 };

describe("deterministic seed behavior (#6)", () => {
  it("the same (resident, style, seed) always produces the identical intent", () => {
    const a = generateArtworkIntent(RESIDENT, MARKER_STYLE, 42, 1000);
    const b = generateArtworkIntent(RESIDENT, MARKER_STYLE, 42, 1000);
    expect(a).toEqual(b);
  });

  it("the same intent always produces byte-identical strokes on repeated calls", () => {
    const intent = generateArtworkIntent(RESIDENT, MARKER_STYLE, 42, 1000);
    const strokesA = generateStrokesFromIntent(intent, MARKER_STYLE);
    const strokesB = generateStrokesFromIntent(intent, MARKER_STYLE);
    expect(strokesA).toEqual(strokesB);
  });

  it("a different seed produces a different intent/strokes (not a constant output)", () => {
    const a = generateArtworkIntent(RESIDENT, MARKER_STYLE, 42, 1000);
    const b = generateArtworkIntent(RESIDENT, MARKER_STYLE, 999, 1000);
    expect(a.strokeCount === b.strokeCount && JSON.stringify(a.toolSequence) === JSON.stringify(b.toolSequence)).toBe(false);
  });
});

describe("Resident intent generation (#7)", () => {
  it("intent is inspectable — carries residentId, styleProfileId, seed, and a real generatedAt", () => {
    const intent = generateArtworkIntent(RESIDENT, MARKER_STYLE, 7, 5000);
    expect(intent.residentId).toBe(RESIDENT.id);
    expect(intent.styleProfileId).toBe(MARKER_STYLE.id);
    expect(intent.seed).toBe(7);
    expect(intent.generatedAt).toBe(5000);
    expect(intent.strokeCount).toBeGreaterThanOrEqual(MARKER_STYLE.strokeCountRange.min);
    expect(intent.strokeCount).toBeLessThanOrEqual(MARKER_STYLE.strokeCountRange.max);
  });

  it("tool sequence is weighted toward the style's own affinity — a marker-only style never picks fatcap/mop", () => {
    const intent = generateArtworkIntent(RESIDENT, MARKER_STYLE, 3, 1000);
    expect(intent.toolSequence.every((t) => t === "marker")).toBe(true);
  });
});

describe("structured stroke output (#8)", () => {
  it("generated strokes are real Stroke objects with normalized 0..1 points, never raw pixels", () => {
    const intent = generateArtworkIntent(RESIDENT, MARKER_STYLE, 5, 1000);
    const strokes = generateStrokesFromIntent(intent, MARKER_STYLE);
    expect(strokes.length).toBe(intent.strokeCount);
    strokes.forEach((s) => {
      expect(s.points.length).toBeGreaterThan(0);
      s.points.forEach((p) => {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(1);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(1);
      });
    });
  });

  it("stroke color is always drawn from the style's real preferred palette", () => {
    const intent = generateArtworkIntent(RESIDENT, MARKER_STYLE, 9, 1000);
    const strokes = generateStrokesFromIntent(intent, MARKER_STYLE);
    strokes.forEach((s) => expect(MARKER_STYLE.preferredColors).toContain(s.color));
  });

  it("stroke width is drawn from the style's real configured width range", () => {
    const intent = generateArtworkIntent(RESIDENT, MARKER_STYLE, 9, 1000);
    const strokes = generateStrokesFromIntent(intent, MARKER_STYLE);
    strokes.forEach((s) => {
      expect(s.baseWidth).toBeGreaterThanOrEqual(MARKER_STYLE.widthRange.min);
      expect(s.baseWidth).toBeLessThanOrEqual(MARKER_STYLE.widthRange.max);
    });
  });
});

describe("marker-tool generation (#9)", () => {
  it("a marker-affinity style generates strokes with tool 'marker', renderer-compatible", () => {
    const intent = generateArtworkIntent(RESIDENT, MARKER_STYLE, 1, 1000);
    const strokes = generateStrokesFromIntent(intent, MARKER_STYLE);
    expect(strokes.every((s) => s.tool === "marker")).toBe(true);
  });
});

describe("fatcap-tool generation (#10)", () => {
  it("a fatcap-affinity style generates strokes with tool 'fatcap'", () => {
    const intent = generateArtworkIntent(RESIDENT, FATCAP_STYLE, 1, 1000);
    const strokes = generateStrokesFromIntent(intent, FATCAP_STYLE);
    expect(strokes.every((s) => s.tool === "fatcap")).toBe(true);
  });
});

describe("mop-tool generation (#11)", () => {
  it("a drip-affinity style generates strokes with tool 'mop'", () => {
    const intent = generateArtworkIntent(RESIDENT, MOP_STYLE, 1, 1000);
    const strokes = generateStrokesFromIntent(intent, MOP_STYLE);
    expect(strokes.every((s) => s.tool === "mop")).toBe(true);
  });
});

describe("generated metadata labeling (#12)", () => {
  it("every generated point is honestly tagged pointerType 'generated' — never 'mouse'/'touch'/'pen' (never claims observed human input)", () => {
    const intent = generateArtworkIntent(RESIDENT, MARKER_STYLE, 4, 1000);
    const strokes = generateStrokesFromIntent(intent, MARKER_STYLE);
    strokes.forEach((s) => s.points.forEach((p) => expect(p.pointerType).toBe("generated")));
  });

  it("synthetic pressure (when the style defines a pressureBias) is applied honestly under pointerType 'generated', never fabricated as real hardware pressure", () => {
    const intent = generateArtworkIntent(RESIDENT, MARKER_STYLE, 4, 1000);
    const strokes = generateStrokesFromIntent(intent, MARKER_STYLE);
    const anyPointWithPressure = strokes.flatMap((s) => s.points).find((p) => p.pressure != null);
    expect(anyPointWithPressure).toBeTruthy();
    expect(anyPointWithPressure?.pointerType).toBe("generated");
  });

  it("a style with no pressureBias configured never fabricates a pressure value", () => {
    const noPressureStyle: GraffitiStyleProfile = { ...MARKER_STYLE, pressureBias: null };
    const intent = generateArtworkIntent(RESIDENT, noPressureStyle, 4, 1000);
    const strokes = generateStrokesFromIntent(intent, noPressureStyle);
    strokes.forEach((s) => s.points.forEach((p) => expect(p.pressure).toBeUndefined()));
  });
});
