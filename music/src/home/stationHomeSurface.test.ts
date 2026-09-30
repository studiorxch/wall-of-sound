import { afterEach, describe, expect, it, vi } from "vitest";
import { createStationHomeSurface } from "./stationHomeSurface";
import type { HomeSurfaceHost } from "./homeSurfaceContract";

/**
 * STATION-01 -- same context-detection discipline
 * `blackbookHomeSurface.test.ts` already covers for BLACKBOOK: explicit
 * query + live `parent.StudioRichHome`, never bare `window.self !==
 * window.top`; standalone no-op; readiness report (once, idempotent);
 * delegated Station -> MAP navigation.
 */
function fixture(search: string, parent?: unknown) {
  const dataset: Record<string, string> = {};
  vi.stubGlobal("location", { search, origin: "http://local" } as unknown as Location);
  vi.stubGlobal("document", { documentElement: { dataset } } as unknown as Document);
  const win = { parent: undefined } as unknown as Window & typeof globalThis;
  win.parent = (parent ?? win) as Window;
  vi.stubGlobal("window", win);
  return { dataset };
}

afterEach(() => vi.unstubAllGlobals());

function fakeHost(overrides: Partial<HomeSurfaceHost> = {}): HomeSurfaceHost {
  return {
    version: 1,
    ready: vi.fn(() => true),
    requestNavigate: vi.fn(() => true),
    replaceArtwork: vi.fn(() => true),
    syncArtworkRoute: vi.fn(() => true),
    requestGoogleCredential: vi.fn(() => Promise.resolve({ ok: true as const, credential: {} })),
    getRadioSession: vi.fn(() => null),
    getMemberIdentity: vi.fn(() => null),
    ...overrides,
  };
}

describe("createStationHomeSurface -- context detection", () => {
  it("is not HOME when there is no parent frame (standalone)", () => {
    fixture("?host=home&homeRuntime=r1&homeNavigation=1&station=R42");
    const surface = createStationHomeSurface();
    expect(surface.isHome).toBe(false);
  });

  it("still parses stationId from the query in standalone mode", () => {
    fixture("?station=R42");
    const surface = createStationHomeSurface();
    expect(surface.isHome).toBe(false);
    expect(surface.stationId).toBe("R42");
  });

  it("is not HOME without the exact host=home query param", () => {
    const parentWin = { StudioRichHome: fakeHost(), location: { origin: "http://local" } } as unknown as Window;
    fixture("?homeRuntime=r1&homeNavigation=1&station=R42", parentWin);
    expect(createStationHomeSurface().isHome).toBe(false);
  });

  it("is not HOME without a stationId in the query", () => {
    const parentWin = { StudioRichHome: fakeHost(), location: { origin: "http://local" } } as unknown as Window;
    fixture("?host=home&homeRuntime=r1&homeNavigation=1", parentWin);
    expect(createStationHomeSurface().isHome).toBe(false);
  });

  it("is not HOME when parent.StudioRichHome is absent or the wrong version", () => {
    const parentWin = { StudioRichHome: undefined, location: { origin: "http://local" } } as unknown as Window;
    fixture("?host=home&homeRuntime=r1&homeNavigation=1&station=R42", parentWin);
    expect(createStationHomeSurface().isHome).toBe(false);
  });

  it("is HOME with a complete, valid hosted identity", () => {
    const parentWin = { StudioRichHome: fakeHost(), location: { origin: "http://local" } } as unknown as Window;
    fixture("?host=home&homeRuntime=r1&homeNavigation=1&station=R42", parentWin);
    const surface = createStationHomeSurface();
    expect(surface.isHome).toBe(true);
    expect(surface.stationId).toBe("R42");
  });
});

describe("createStationHomeSurface -- reportReady", () => {
  it("reports readiness exactly once (idempotent)", () => {
    const host = fakeHost();
    const parentWin = { StudioRichHome: host, location: { origin: "http://local" } } as unknown as Window;
    const { dataset } = fixture("?host=home&homeRuntime=r1&homeNavigation=1&station=R42", parentWin);
    const surface = createStationHomeSurface();
    surface.reportReady();
    surface.reportReady();
    expect(host.ready).toHaveBeenCalledOnce();
    expect(dataset.homeReady).toBeTruthy();
  });

  it("is a no-op in standalone mode", () => {
    fixture("?station=R42");
    expect(() => createStationHomeSurface().reportReady()).not.toThrow();
  });
});

describe("createStationHomeSurface -- requestNavigateToMap", () => {
  it("delegates to host.requestNavigate({surface:'map'}) when hosted", () => {
    const host = fakeHost();
    const parentWin = { StudioRichHome: host, location: { origin: "http://local" } } as unknown as Window;
    fixture("?host=home&homeRuntime=r1&homeNavigation=1&station=R42", parentWin);
    const surface = createStationHomeSurface();
    expect(surface.requestNavigateToMap()).toBe(true);
    expect(host.requestNavigate).toHaveBeenCalledWith(expect.anything(), expect.anything(), { surface: "map" });
  });

  it("returns false (never throws) in standalone mode", () => {
    fixture("?station=R42");
    expect(createStationHomeSurface().requestNavigateToMap()).toBe(false);
  });
});
