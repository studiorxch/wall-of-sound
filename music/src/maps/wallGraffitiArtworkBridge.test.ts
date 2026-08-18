import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// BUILD §33 categories 19 (save Artwork creation), 20 (Artwork ID
// persistence — proven by asserting the real id round-trips from the
// mocked authority's return value), 21 (import Artwork creation), 22
// (place saved Artwork), 23 (cover existing placement). No jsdom in this
// codebase's vitest setup (see wallRacetrackBridge.test.ts) — a minimal
// fake `window.SBE` is stubbed directly, same convention as that file.

describe("wallGraffitiArtworkBridge", () => {
  let createArtworkMock: ReturnType<typeof vi.fn>;
  let createPlacementMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    createArtworkMock = vi.fn();
    createPlacementMock = vi.fn();
    (globalThis as unknown as { window: unknown }).window = {
      SBE: {
        SubwayArtworkAuthority: { createArtwork: createArtworkMock },
        SubwayArtworkPlacementAuthority: { createPlacement: createPlacementMock },
      },
    };
  });

  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  it("#19 saveDrawingAsArtwork calls the real Artwork Authority with structured stroke data, never a placement call", async () => {
    createArtworkMock.mockReturnValue({ ok: true, data: { id: "sr-art-000042", creatorType: "user", sourceType: "drawing" } });
    const { saveDrawingAsArtwork } = await import("./wallGraffitiArtworkBridge");
    const result = saveDrawingAsArtwork({
      payload: { version: 1, canvasWidth: 500, canvasHeight: 500, strokes: [{ id: "st1", tool: "marker", color: "#fff", baseWidth: 0.02, points: [], seed: 1, createdAt: 0 }], targetMode: { kind: "sticker" } },
      sourceType: "sticker",
      title: "My Sticker",
    });
    expect(result).toEqual({ ok: true, data: { id: "sr-art-000042", creatorType: "user", sourceType: "drawing" } });
    expect(createArtworkMock).toHaveBeenCalledTimes(1);
    expect(createPlacementMock).not.toHaveBeenCalled();
    const call = createArtworkMock.mock.calls[0][0];
    expect(call.creatorType).toBe("user");
    expect(call.metadata.strokes).toHaveLength(1);
  });

  it("#20 the real Artwork ID returned by the authority passes through unchanged (identity is never re-derived by this bridge)", async () => {
    createArtworkMock.mockReturnValue({ ok: true, data: { id: "sr-art-000777" } });
    const { saveDrawingAsArtwork } = await import("./wallGraffitiArtworkBridge");
    const result = saveDrawingAsArtwork({ payload: { version: 1, canvasWidth: 1, canvasHeight: 1, strokes: [], targetMode: { kind: "sticker" } }, sourceType: "drawing" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.id).toBe("sr-art-000777");
  });

  it("#21 importAssetAsArtwork creates a real Artwork record from an uploaded asset, sourceType 'upload'", async () => {
    createArtworkMock.mockReturnValue({ ok: true, data: { id: "sr-art-000099", sourceType: "upload" } });
    const { importAssetAsArtwork } = await import("./wallGraffitiArtworkBridge");
    const result = importAssetAsArtwork({ assetDataUrl: "data:image/png;base64,AAAA", title: "Imported piece" });
    expect(result.ok).toBe(true);
    const call = createArtworkMock.mock.calls[0][0];
    expect(call.sourceType).toBe("upload");
    expect(call.sourceRef).toBe("data:image/png;base64,AAAA");
  });

  it("#22 placeArtworkOnSurface calls the real Placement Authority targeting the surface directly", async () => {
    createPlacementMock.mockReturnValue({ ok: true, data: { id: "sr-placement-000005", artworkId: "sr-art-000042", surfaceId: "sr-surface-000001" }, covered: null });
    const { placeArtworkOnSurface } = await import("./wallGraffitiArtworkBridge");
    const result = placeArtworkOnSurface({ artworkId: "sr-art-000042", surfaceId: "sr-surface-000001" });
    expect(result.ok).toBe(true);
    expect(createPlacementMock).toHaveBeenCalledWith({ artworkId: "sr-art-000042", surfaceId: "sr-surface-000001", targetType: "surface", targetId: "sr-surface-000001" });
  });

  it("#23 placing on an already-occupied surface reports what it covered — reuses the proven cover/replace path, no parallel logic", async () => {
    createPlacementMock.mockReturnValue({ ok: true, data: { id: "sr-placement-000006" }, covered: "sr-placement-000005" });
    const { placeArtworkOnSurface } = await import("./wallGraffitiArtworkBridge");
    const result = placeArtworkOnSurface({ artworkId: "sr-art-000100", surfaceId: "sr-surface-000001" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.covered).toBe("sr-placement-000005");
  });

  it("reports authority_unavailable rather than throwing when window.SBE has no artwork authority", async () => {
    (globalThis as unknown as { window: { SBE: object } }).window = { SBE: {} };
    const { saveDrawingAsArtwork } = await import("./wallGraffitiArtworkBridge");
    const result = saveDrawingAsArtwork({ payload: { version: 1, canvasWidth: 1, canvasHeight: 1, strokes: [], targetMode: { kind: "sticker" } }, sourceType: "drawing" });
    expect(result).toEqual({ ok: false, error: "authority_unavailable" });
  });
});
