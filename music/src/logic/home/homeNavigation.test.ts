import { describe, expect, it } from "vitest";
import { createHomeNavigation } from "./homeNavigation";
import { expectedSurfaceIdentity, homeRouteKey, matchesSurfaceIdentity, parseHomeSearch, serializeHomeRoute, validateHomeRoute } from "./homeRoutes";
import type { HomeRoute, HomeSurfaceIdentity } from "../../data/homeRouteTypes";

function fixture() {
  const history: { mode: string; route: HomeRoute }[] = [];
  const mounts: { route: HomeRoute; identity: HomeSurfaceIdentity }[] = [];
  let leaves = 0;
  const nav = createHomeNavigation("parent-session", {
    writeHistory: (mode, route) => { history.push({ mode, route }); },
    mount: (route, identity) => { mounts.push({ route, identity }); },
    leave: () => { leaves++; }, render: () => {},
  });
  const ready = () => nav.ready(nav.getExpectedIdentity());
  return { nav, history, mounts, ready, leaves: () => leaves };
}

describe("HOST-01 route boundary", () => {
  it.each(["", "?surface=map", "?surface=blackbook", "?surface=blackbook&artwork=A%26B%3F%23"])('roundtrips local route %s', search => {
    const route = parseHomeSearch(search)!;
    expect(route).not.toBeNull();
    expect(parseHomeSearch(serializeHomeRoute(route))).toEqual(route);
  });
  it.each(["?surface=radio", "?surface=map&artwork=A", "?surface=blackbook&artwork=", "?surface=map&surface=blackbook", "?surface=blackbook&artwork=A&artwork=B", "?url=https://example.com", "?surface=blackbook&artwork=a%2Fb", "?surface=blackbook&artwork=%00"])("rejects invalid local URL %s", search => {
    expect(parseHomeSearch(search)).toBeNull();
  });
  it.each([null, [], "map", "/wall-app/", "https://example.com", { surface: "map", url: "/unsafe" }, { surface: "blackbook", artworkId: 4 }, { surface: "map", artworkId: "A" }, { surface: "blackbook", artworkId: " A" }])("rejects non-route destinations %#", value => {
    expect(validateHomeRoute(value)).toBeNull();
  });
  it("copies and freezes destination data so a child cannot mutate parent state", () => {
    const input = { surface: "blackbook", artworkId: "A" };
    const route = validateHomeRoute(input)!; input.artworkId = "B";
    expect(route).toEqual({ surface: "blackbook", artworkId: "A" });
    expect(Object.isFrozen(route)).toBe(true);
  });
  it("calculates expected identity independently of transport URL", () => {
    const identity = expectedSurfaceIdentity("session", 9, { surface: "blackbook", artworkId: "A" });
    expect(identity).toEqual({ runtimeId: "session", navigationId: 9, routeKey: "surface=blackbook&artwork=A" });
    expect(matchesSurfaceIdentity(identity, { ...identity })).toBe(true);
    for (const mismatch of [{ ...identity, runtimeId: "other" }, { ...identity, navigationId: 8 }, { ...identity, routeKey: "surface=map" }, null]) {
      expect(matchesSurfaceIdentity(identity, mismatch)).toBe(false);
    }
  });
});

describe("HOST-01 parent navigation authority", () => {
  it("bootstraps by replacement and pushes only changed routes", () => {
    const f = fixture(); f.nav.restore("", true); f.ready();
    f.nav.requestNavigate({ surface: "map" });
    f.nav.requestNavigate({ surface: "blackbook" });
    expect(f.history.map(x => x.mode)).toEqual(["replace", "push"]);
    expect(f.mounts).toHaveLength(2);
  });
  it("Back/Forward restore from URL without a new history entry", () => {
    const f = fixture(); f.nav.restore("", true);
    f.nav.requestNavigate({ surface: "blackbook" });
    f.nav.requestNavigate({ surface: "map" });
    f.nav.restore("?surface=blackbook"); f.ready();
    expect(f.nav.getState().route).toEqual({ surface: "blackbook" });
    f.nav.restore("?surface=map"); f.ready();
    expect(f.history.map(x => x.mode)).toEqual(["replace", "push", "push"]);
    expect(f.nav.getState().route).toEqual({ surface: "map" });
  });
  it("artwork replacement does not push and identical selections are no-ops", () => {
    const f = fixture(); f.nav.restore("?surface=blackbook", true);
    f.nav.replaceArtwork("A"); f.nav.replaceArtwork("B"); f.nav.replaceArtwork("B");
    expect(f.history.map(x => x.mode)).toEqual(["replace", "replace", "replace"]);
    expect(f.mounts).toHaveLength(3);
    expect(homeRouteKey(f.nav.getState().route!)).toBe("surface=blackbook&artwork=B");
    f.nav.replaceArtwork(null);
    expect(f.nav.getState().route).toEqual({ surface: "blackbook" });
  });
  it("rejects invalid requests without history/mount mutation", () => {
    const f = fixture(); f.nav.restore("", true); f.ready();
    expect(f.nav.requestNavigate("/wall-app/")).toBe(false);
    expect(f.nav.replaceArtwork("A")).toBe(false);
    expect(f.history).toHaveLength(1); expect(f.mounts).toHaveLength(1);
    expect(f.nav.getState().phase).toBe("active");
  });
  it("invalid URL fails closed rather than mounting a default surface", () => {
    const f = fixture(); expect(f.nav.restore("?surface=missing", true)).toBe(false);
    expect(f.nav.getState()).toMatchObject({ route: null, phase: "failed", diagnostic: "invalid_route_url" });
    expect(f.history).toHaveLength(0); expect(f.mounts).toHaveLength(0);
  });
  it("valid readiness activates without duplicate navigation on repeated readiness", () => {
    const f = fixture(); f.nav.restore("", true);
    const before = f.nav.getState();
    expect(f.ready()).toBe(true); expect(f.ready()).toBe(true);
    expect(f.nav.getState()).toMatchObject({ phase: "active", navigationId: before.navigationId, mounts: 1 });
    expect(f.history).toHaveLength(1); expect(f.mounts).toHaveLength(1);
  });
  it("mismatch fails deterministically, never auto-navigates; manual retry gets new identity", () => {
    const f = fixture(); f.nav.restore("", true);
    const old = f.nav.getExpectedIdentity()!;
    expect(f.nav.ready({ ...old, routeKey: "wrong" })).toBe(false);
    expect(f.nav.getState()).toMatchObject({ phase: "failed", diagnostic: "surface_identity_mismatch" });
    expect(f.nav.ready(old)).toBe(false);
    expect(f.mounts).toHaveLength(1); expect(f.history).toHaveLength(1);
    f.nav.retry(); expect(f.nav.getExpectedIdentity()).not.toEqual(old); expect(f.ready()).toBe(true);
    expect(f.history).toHaveLength(1); expect(f.mounts).toHaveLength(2);
  });
  it("stale timeout cannot fail a newer navigation", () => {
    const f = fixture(); f.nav.restore("", true); const old = f.nav.getState().navigationId;
    f.nav.requestNavigate({ surface: "blackbook" }); f.ready(); f.nav.fail(old, "timeout");
    expect(f.nav.getState().phase).toBe("active");
  });
  it("session identity survives replacements and each replacement leaves exactly once", () => {
    const f = fixture(); f.nav.restore("", true); f.ready();
    for (const surface of ["blackbook", "map", "blackbook", "map"] as const) { f.nav.requestNavigate({ surface }); f.ready(); }
    expect(new Set(f.mounts.map(x => x.identity.runtimeId))).toEqual(new Set(["parent-session"]));
    expect(f.leaves()).toBe(4);
    expect(f.nav.getState()).toMatchObject({ runtimeId: "parent-session", mounts: 5, leaves: 4 });
  });
});
