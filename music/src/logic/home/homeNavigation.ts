import type { HomeNavigationState, HomeRoute, HomeSurfaceIdentity } from "../../data/homeRouteTypes";
import { expectedSurfaceIdentity, homeRouteKey, isArtworkId, matchesSurfaceIdentity, parseHomeSearch, validateHomeRoute } from "./homeRoutes";

export interface HomeNavigationPorts {
  writeHistory(mode: "push" | "replace", route: HomeRoute): void;
  mount(route: HomeRoute, identity: HomeSurfaceIdentity): void;
  leave(): void;
  render(state: HomeNavigationState): void;
}

/** One parent-owned authority. Browser mechanics are ports; no Firebase, audio, or surface domain logic. */
export function createHomeNavigation(runtimeId: string, ports: HomeNavigationPorts) {
  let state: HomeNavigationState = Object.freeze({ runtimeId, route: null, navigationId: 0, phase: "idle", diagnostic: null, mounts: 0, leaves: 0 });
  function update(patch: Partial<HomeNavigationState>): void {
    state = Object.freeze({ ...state, ...patch });
    ports.render(state);
  }
  function identity(): HomeSurfaceIdentity | null {
    return state.route ? expectedSurfaceIdentity(runtimeId, state.navigationId, state.route) : null;
  }
  function fail(navigationId: number, reason: string): void {
    if (navigationId === state.navigationId) update({ phase: "failed", diagnostic: reason });
  }
  function mount(route: HomeRoute, historyMode?: "push" | "replace"): void {
    if (state.route) ports.leave();
    if (historyMode) ports.writeHistory(historyMode, route);
    update({ route, navigationId: state.navigationId + 1, phase: "mounting", diagnostic: null,
      mounts: state.mounts + 1, leaves: state.leaves + (state.route ? 1 : 0) });
    ports.mount(route, identity()!);
  }
  function requestNavigate(destination: unknown): boolean {
    const route = validateHomeRoute(destination);
    if (!route) { update({ diagnostic: "invalid_destination" }); return false; }
    if (state.route && homeRouteKey(route) === homeRouteKey(state.route)) return true;
    mount(route, "push");
    return true;
  }
  function restore(search: string, bootstrap = false): boolean {
    const route = parseHomeSearch(search);
    if (!route) {
      if (state.route) ports.leave();
      update({ route: null, navigationId: state.navigationId + 1, phase: "failed", diagnostic: "invalid_route_url",
        leaves: state.leaves + (state.route ? 1 : 0) });
      return false;
    }
    mount(route, bootstrap ? "replace" : undefined);
    return true;
  }
  return {
    getState: () => state,
    getExpectedIdentity: identity,
    requestNavigate,
    restore,
    replaceArtwork(value: unknown): boolean {
      if (state.route?.surface !== "blackbook" || (value !== null && !isArtworkId(value))) {
        update({ diagnostic: "invalid_artwork_replacement" }); return false;
      }
      const route: HomeRoute = value === null ? { surface: "blackbook" } : { surface: "blackbook", artworkId: value as string };
      if (homeRouteKey(route) === homeRouteKey(state.route)) return true;
      // HOST-01 fixtures remount on route-local changes -- kept as-is for that contract.
      mount(Object.freeze(route), "replace");
      return true;
    },
    /**
     * HOST-03 -- the real BLACKBOOK reports an artwork identity it already
     * switched to itself (its existing no-reload PAGES/openArtwork path).
     * Only the URL/route state updates; navigationId, mounts and the
     * mounted document are untouched, so this can never remount/reload the
     * surface the way `replaceArtwork` (above) deliberately does for the
     * HOST-01 fixture's own host-driven contract.
     */
    syncArtworkRoute(value: unknown): boolean {
      if (state.route?.surface !== "blackbook" || (value !== null && !isArtworkId(value))) {
        update({ diagnostic: "invalid_artwork_replacement" }); return false;
      }
      const route: HomeRoute = value === null ? { surface: "blackbook" } : { surface: "blackbook", artworkId: value as string };
      if (homeRouteKey(route) === homeRouteKey(state.route)) return true;
      ports.writeHistory("replace", route);
      update({ route: Object.freeze(route) });
      return true;
    },
    ready(report: unknown): boolean {
      const expected = identity();
      if (!expected || state.phase === "failed") return false;
      if (!matchesSurfaceIdentity(expected, report)) { fail(state.navigationId, "surface_identity_mismatch"); return false; }
      if (state.phase !== "active") update({ phase: "active", diagnostic: null });
      return true; // Duplicate readiness never writes history or mounts again.
    },
    fail,
    retry(): void { if (state.route) mount(state.route); },
  };
}
