import { afterEach, describe, expect, it, vi } from "vitest";
import { createBlackbookHomeSurface } from "./blackbookHomeSurface";
import type { HomeSurfaceHost } from "./homeSurfaceContract";

/**
 * HOST-03 -- BLACKBOOK's own narrow HOME adapter. Covers: HOME-context
 * detection (query + live parent.StudioRichHome, never bare
 * `window.self !== window.top`), standalone/non-HOME no-op, readiness
 * report (once, idempotent), artwork-route sync (never a remount request --
 * `syncArtworkRoute`, distinct from the HOST-01 fixture's `replaceArtwork`),
 * and delegated BLACKBOOK -> MAP navigation.
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
    ...overrides,
  };
}

describe("createBlackbookHomeSurface -- context detection", () => {
  it("is not HOME when there is no parent frame (standalone)", () => {
    fixture("?host=home&homeRuntime=s&homeNavigation=4");
    expect(createBlackbookHomeSurface().isHome).toBe(false);
  });
  it.each([
    "", // no query at all -- plain embed or direct load
    "?host=home", // missing identity
    "?host=home&homeRuntime=s&homeNavigation=0", // navigationId must be >= 1
    "?host=home&homeRuntime=s&homeNavigation=NaN",
    "?homeRuntime=s&homeNavigation=4", // missing host=home
  ])("rejects incomplete/absent identity %s even inside a real frame", (search) => {
    fixture(search, { location: { origin: "http://local" }, StudioRichHome: fakeHost() });
    expect(createBlackbookHomeSurface().isHome).toBe(false);
  });
  it("rejects a parent StudioRichHome with the wrong version", () => {
    fixture("?host=home&homeRuntime=s&homeNavigation=4", {
      location: { origin: "http://local" },
      StudioRichHome: { ...fakeHost(), version: 2 },
    });
    expect(createBlackbookHomeSurface().isHome).toBe(false);
  });
  it("rejects a cross-origin parent", () => {
    fixture("?host=home&homeRuntime=s&homeNavigation=4", {
      location: { origin: "http://other" },
      StudioRichHome: fakeHost(),
    });
    expect(createBlackbookHomeSurface().isHome).toBe(false);
  });
  it("is HOME only with a validated same-origin identity and a live host", () => {
    fixture("?host=home&homeRuntime=s&homeNavigation=4", { location: { origin: "http://local" }, StudioRichHome: fakeHost() });
    expect(createBlackbookHomeSurface().isHome).toBe(true);
  });
});

describe("createBlackbookHomeSurface -- standalone/non-HOME is a safe no-op", () => {
  it("reportReady/reportArtworkChange/requestNavigateToMap never touch anything", () => {
    fixture("");
    const surface = createBlackbookHomeSurface();
    expect(surface.isHome).toBe(false);
    expect(() => surface.reportReady()).not.toThrow();
    expect(surface.reportArtworkChange("A")).toBe(false);
    expect(surface.requestNavigateToMap()).toBe(false);
  });
});

describe("createBlackbookHomeSurface -- HOME-hosted readiness and artwork sync", () => {
  it("reports readiness exactly once with the mounted (bare) identity", () => {
    const host = fakeHost();
    const { dataset } = fixture("?host=home&homeRuntime=session&homeNavigation=4", { location: { origin: "http://local" }, StudioRichHome: host });
    const surface = createBlackbookHomeSurface();
    surface.reportReady(); surface.reportReady();
    expect(host.ready).toHaveBeenCalledExactlyOnceWith(document, { runtimeId: "session", navigationId: 4, routeKey: "surface=blackbook" });
    expect(JSON.parse(dataset.homeReady!)).toEqual({ runtimeId: "session", navigationId: 4, routeKey: "surface=blackbook" });
  });
  it("seeds the initial identity from a forwarded ?artwork= param (HOME reload/restore of a specific Artwork)", () => {
    const host = fakeHost();
    fixture("?host=home&homeRuntime=session&homeNavigation=4&artwork=A", { location: { origin: "http://local" }, StudioRichHome: host });
    createBlackbookHomeSurface().reportReady();
    expect(host.ready).toHaveBeenCalledExactlyOnceWith(document, { runtimeId: "session", navigationId: 4, routeKey: "surface=blackbook&artwork=A" });
  });
  it("reports its own already-resolved artwork identity via syncArtworkRoute, never replaceArtwork (no remount request)", () => {
    const host = fakeHost();
    fixture("?host=home&homeRuntime=session&homeNavigation=4", { location: { origin: "http://local" }, StudioRichHome: host });
    const surface = createBlackbookHomeSurface();
    expect(surface.reportArtworkChange("A")).toBe(true);
    expect(host.syncArtworkRoute).toHaveBeenCalledExactlyOnceWith(document, { runtimeId: "session", navigationId: 4, routeKey: "surface=blackbook" }, "A");
    expect(host.replaceArtwork).not.toHaveBeenCalled();
  });
  it("tracks its own route forward so the NEXT call's identity reflects the previously accepted change", () => {
    const host = fakeHost();
    fixture("?host=home&homeRuntime=session&homeNavigation=4", { location: { origin: "http://local" }, StudioRichHome: host });
    const surface = createBlackbookHomeSurface();
    surface.reportArtworkChange("A");
    surface.reportArtworkChange("B");
    expect(host.syncArtworkRoute).toHaveBeenNthCalledWith(2, document, { runtimeId: "session", navigationId: 4, routeKey: "surface=blackbook&artwork=A" }, "B");
  });
  it("does NOT advance its own tracked route when HOME rejects the change", () => {
    const host = fakeHost({ syncArtworkRoute: vi.fn(() => false) });
    fixture("?host=home&homeRuntime=session&homeNavigation=4", { location: { origin: "http://local" }, StudioRichHome: host });
    const surface = createBlackbookHomeSurface();
    surface.reportArtworkChange("A");
    surface.reportArtworkChange("B");
    expect(host.syncArtworkRoute).toHaveBeenNthCalledWith(2, document, { runtimeId: "session", navigationId: 4, routeKey: "surface=blackbook" }, "B");
  });
  it("delegates BLACKBOOK -> MAP navigation through HOME's requestNavigate", () => {
    const host = fakeHost();
    fixture("?host=home&homeRuntime=session&homeNavigation=4", { location: { origin: "http://local" }, StudioRichHome: host });
    const surface = createBlackbookHomeSurface();
    expect(surface.requestNavigateToMap()).toBe(true);
    expect(host.requestNavigate).toHaveBeenCalledExactlyOnceWith(document, { runtimeId: "session", navigationId: 4, routeKey: "surface=blackbook" }, { surface: "map" });
  });
});
