import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ResidentPreview } from "./wallResidentGraffitiBridge";
import type { ResidentGraffitiArtist, GraffitiStyleProfile } from "../data/subwayResidentGraffitiTypes";
import type { ResidentArtworkIntent } from "../graffiti/graffitiTypes";

// BUILD §37 categories 22-23 (canonical Artwork save / canonical Placement
// creation via the Resident orchestration flow), plus the safe-failure
// draft-marking path (§25). No jsdom in this codebase's vitest setup (see
// wallRacetrackBridge.test.ts) — a minimal fake `window.SBE` is stubbed.

const RESIDENT: ResidentGraffitiArtist = {
  id: "sr-resident-000001", displayName: "Test Resident", tagName: "TEST",
  creatorType: "resident", creatorId: "sr-resident-000001", status: "active", homeBorough: null,
  preferredRoutes: [], preferredRouteFamilies: ["ace"], preferredSurfaceTypes: ["exterior_side_a"],
  styleProfileId: "sr-style-000001",
  behaviorProfile: { emptySurfacePreference: 0.8, coverPermission: "never", coverProbability: 0, routeAffinity: 0.5, recencyAvoidance: 0.5, repeatCarAvoidance: 0.5, maxRecentPlacementsConsidered: 5 },
  createdAt: 0, updatedAt: 0, artworkHistory: [], placementHistory: [],
};
const STYLE: GraffitiStyleProfile = {
  id: "sr-style-000001", label: "Test Style", preferredTools: ["marker"], preferredColors: ["#ffffff"],
  widthRange: { min: 0.01, max: 0.02 }, pressureBias: null, density: 0.3, strokeCountRange: { min: 2, max: 2 },
  angularity: 0.3, curvature: 0.3, dripAffinity: 0, fatcapAffinity: 0, markerAffinity: 1, symmetryBias: null,
  verticality: 0.5, horizontalStretch: 0.5, complexity: 0.3, seedSalt: 1,
};
const INTENT: ResidentArtworkIntent = { residentId: RESIDENT.id, styleProfileId: STYLE.id, toolSequence: ["marker", "marker"], palette: ["#ffffff"], strokeCount: 2, compositionBounds: { width: 1000, height: 1000 }, seed: 1, generatedAt: 1000 };
const PREVIEW: ResidentPreview = { intent: INTENT, strokes: [{ id: "s1", tool: "marker", color: "#ffffff", baseWidth: 0.02, points: [{ x: 0.1, y: 0.1, pointerType: "generated", timestamp: 1000 }], seed: 1, createdAt: 1000 }], resident: RESIDENT, style: STYLE };

describe("wallResidentGraffitiBridge — createAndPlaceResidentArtwork", () => {
  let createArtworkMock: ReturnType<typeof vi.fn>;
  let createPlacementMock: ReturnType<typeof vi.fn>;
  let updateArtworkStatusMock: ReturnType<typeof vi.fn>;
  let resolveEligibleSurfaceMock: ReturnType<typeof vi.fn>;
  let recordArtworkCreatedMock: ReturnType<typeof vi.fn>;
  let recordPlacementCreatedMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    createArtworkMock = vi.fn().mockReturnValue({ ok: true, data: { id: "sr-art-000010", status: "active" } });
    createPlacementMock = vi.fn().mockReturnValue({ ok: true, data: { id: "sr-placement-000010" }, covered: null });
    updateArtworkStatusMock = vi.fn().mockReturnValue({ ok: true, data: { id: "sr-art-000010", status: "draft" } });
    resolveEligibleSurfaceMock = vi.fn().mockReturnValue({ ok: true, surface: { id: "sr-surface-000010", surfaceType: "exterior_side_a", logicalCarId: "sr-car-000010", consistId: "sr-consist-000010", logicalTrainId: "sr-train-000010", routeId: "subway:route:A", routeFamily: "ace" }, coverAction: false });
    recordArtworkCreatedMock = vi.fn().mockReturnValue({ ok: true });
    recordPlacementCreatedMock = vi.fn().mockReturnValue({ ok: true });

    (globalThis as unknown as { window: unknown }).window = {
      SBE: {
        SubwayArtworkAuthority: { createArtwork: createArtworkMock, updateArtworkStatus: updateArtworkStatusMock },
        SubwayArtworkPlacementAuthority: { createPlacement: createPlacementMock },
        SubwayResidentGraffitiArtistAuthority: {
          resolveEligibleSurface: resolveEligibleSurfaceMock,
          recordArtworkCreated: recordArtworkCreatedMock,
          recordPlacementCreated: recordPlacementCreatedMock,
        },
      },
    };
  });

  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  it("#22 saves through the canonical Artwork Authority with creatorType 'resident' and the real Resident id — never a parallel store", async () => {
    const { createAndPlaceResidentArtwork } = await import("./wallResidentGraffitiBridge");
    const result = createAndPlaceResidentArtwork(PREVIEW, 1000, 1000);
    expect(result.ok).toBe(true);
    expect(createArtworkMock).toHaveBeenCalledTimes(1);
    const call = createArtworkMock.mock.calls[0][0];
    expect(call.creatorType).toBe("resident");
    expect(call.creatorId).toBe(RESIDENT.id);
    expect(call.metadata.strokes).toEqual(PREVIEW.strokes);
  });

  it("#23 creates a real canonical Placement via the same authority the human Drawing App uses, then records both histories on the Resident", async () => {
    const { createAndPlaceResidentArtwork } = await import("./wallResidentGraffitiBridge");
    const result = createAndPlaceResidentArtwork(PREVIEW, 1000, 1000);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.placed).toBe(true);
      expect(result.data.placementId).toBe("sr-placement-000010");
      expect(result.data.surfaceId).toBe("sr-surface-000010");
    }
    expect(createPlacementMock).toHaveBeenCalledWith({ artworkId: "sr-art-000010", surfaceId: "sr-surface-000010", targetType: "surface", targetId: "sr-surface-000010" });
    expect(recordArtworkCreatedMock).toHaveBeenCalledTimes(1);
    expect(recordPlacementCreatedMock).toHaveBeenCalledTimes(1);
    expect(recordPlacementCreatedMock.mock.calls[0][1].placementId).toBe("sr-placement-000010");
  });

  it("safe failure (BUILD §25): no eligible surface -> artwork stays saved but is marked draft, no placement/orphan is created", async () => {
    resolveEligibleSurfaceMock.mockReturnValue({ ok: false, reason: "no_eligible_surface" });
    const { createAndPlaceResidentArtwork } = await import("./wallResidentGraffitiBridge");
    const result = createAndPlaceResidentArtwork(PREVIEW, 1000, 1000);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.placed).toBe(false);
      expect(result.data.reason).toBe("no_eligible_surface");
    }
    expect(createPlacementMock).not.toHaveBeenCalled();
    expect(recordPlacementCreatedMock).not.toHaveBeenCalled();
    expect(updateArtworkStatusMock).toHaveBeenCalledWith("sr-art-000010", "draft");
  });
});
