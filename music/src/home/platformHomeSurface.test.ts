import { afterEach, describe, expect, it, vi } from "vitest";
import { createPlatformHomeSurface } from "./platformHomeSurface";
import type { HomeSurfaceHost } from "./homeSurfaceContract";

/**
 * STATION-08 -- same context-detection discipline
 * `stationHomeSurface.test.ts` already covers for Station Cover: explicit
 * query + live `parent.StudioRichHome`, never bare `window.self !==
 * window.top`; standalone no-op; readiness report (once, idempotent);
 * delegated Platform -> MAP navigation, carrying no station-id-specific
 * navigation of its own (Platform has nowhere further to navigate TO in
 * this batch -- only back).
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

describe("createPlatformHomeSurface -- context detection", () => {
  it("is not HOME when there is no parent frame (standalone)", () => {
    fixture("?host=home&homeRuntime=r1&homeNavigation=1&station=R42");
    expect(createPlatformHomeSurface().isHome).toBe(false);
  });

  it("still parses stationId from the query in standalone mode -- the real station id this page was loaded for, never defaulted to R42", () => {
    fixture("?station=R16");
    const surface = createPlatformHomeSurface();
    expect(surface.isHome).toBe(false);
    expect(surface.stationId).toBe("R16");
  });

  it("is not HOME without the exact host=home query param", () => {
    const parentWin = { StudioRichHome: fakeHost(), location: { origin: "http://local" } } as unknown as Window;
    fixture("?homeRuntime=r1&homeNavigation=1&station=R42", parentWin);
    expect(createPlatformHomeSurface().isHome).toBe(false);
  });

  it("is not HOME without a stationId in the query -- Platform must fail honestly, never silently substitute Bay Ridge Av", () => {
    const parentWin = { StudioRichHome: fakeHost(), location: { origin: "http://local" } } as unknown as Window;
    fixture("?host=home&homeRuntime=r1&homeNavigation=1", parentWin);
    const surface = createPlatformHomeSurface();
    expect(surface.isHome).toBe(false);
    expect(surface.stationId).toBeNull();
  });

  it("is not HOME when parent.StudioRichHome is absent or the wrong version", () => {
    const parentWin = { StudioRichHome: undefined, location: { origin: "http://local" } } as unknown as Window;
    fixture("?host=home&homeRuntime=r1&homeNavigation=1&station=R42", parentWin);
    expect(createPlatformHomeSurface().isHome).toBe(false);
  });

  it("is HOME with a complete, valid hosted identity, carrying the REAL requested station id", () => {
    const parentWin = { StudioRichHome: fakeHost(), location: { origin: "http://local" } } as unknown as Window;
    fixture("?host=home&homeRuntime=r1&homeNavigation=1&station=R16", parentWin);
    const surface = createPlatformHomeSurface();
    expect(surface.isHome).toBe(true);
    expect(surface.stationId).toBe("R16");
  });
});

describe("createPlatformHomeSurface -- reportReady", () => {
  it("reports readiness exactly once (idempotent)", () => {
    const host = fakeHost();
    const parentWin = { StudioRichHome: host, location: { origin: "http://local" } } as unknown as Window;
    const { dataset } = fixture("?host=home&homeRuntime=r1&homeNavigation=1&station=R42", parentWin);
    const surface = createPlatformHomeSurface();
    surface.reportReady();
    surface.reportReady();
    expect(host.ready).toHaveBeenCalledOnce();
    expect(dataset.homeReady).toBeTruthy();
  });

  it("is a no-op in standalone mode", () => {
    fixture("?station=R42");
    expect(() => createPlatformHomeSurface().reportReady()).not.toThrow();
  });
});

describe("createPlatformHomeSurface -- requestNavigateToMap (the return path)", () => {
  it("delegates to host.requestNavigate({surface:'map'}) when hosted", () => {
    const host = fakeHost();
    const parentWin = { StudioRichHome: host, location: { origin: "http://local" } } as unknown as Window;
    fixture("?host=home&homeRuntime=r1&homeNavigation=1&station=R42", parentWin);
    const surface = createPlatformHomeSurface();
    expect(surface.requestNavigateToMap()).toBe(true);
    expect(host.requestNavigate).toHaveBeenCalledWith(expect.anything(), expect.anything(), { surface: "map" });
  });

  it("returns false (never throws) in standalone mode", () => {
    fixture("?station=R42");
    expect(createPlatformHomeSurface().requestNavigateToMap()).toBe(false);
  });
});
