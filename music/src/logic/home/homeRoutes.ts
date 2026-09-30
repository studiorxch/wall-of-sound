import type { HomeRoute, HomeSurfaceIdentity } from "../../data/homeRouteTypes";

export function isArtworkId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256
    && value.trim() === value && !/[\u0000-\u001f\u007f/]/u.test(value);
}

/**
 * STATION-01 -- a real GTFS station-level stop id (e.g. "R42"), never a
 * platform-level child id. Same character-class discipline as
 * `isArtworkId` -- no path separators, no control characters, no leading/
 * trailing whitespace.
 */
export function isStationId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 64
    && value.trim() === value && !/[\u0000-\u001f\u007f/]/u.test(value);
}

/** Strict boundary: destinations are typed data, not URLs or open-ended objects. */
export function validateHomeRoute(value: unknown): HomeRoute | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const route = value as Record<string, unknown>;
  const keys = Object.keys(route);
  if (route.surface === "map" && keys.length === 1) return Object.freeze({ surface: "map" });
  if (route.surface === "station") {
    if (keys.some(key => key !== "surface" && key !== "stationId")) return null;
    if (!isStationId(route.stationId)) return null;
    return Object.freeze({ surface: "station", stationId: route.stationId as string });
  }
  if (route.surface !== "blackbook" || keys.some(key => key !== "surface" && key !== "artworkId")) return null;
  if ("artworkId" in route && !isArtworkId(route.artworkId)) return null;
  return Object.freeze(route.artworkId === undefined ? { surface: "blackbook" } : { surface: "blackbook", artworkId: route.artworkId as string });
}

/** Local HOST-01 representation only. This does not parse production MAP/BLACKBOOK URLs. */
export function parseHomeSearch(search: string): HomeRoute | null {
  const params = new URLSearchParams(search);
  if ([...params.keys()].some(key => !["surface", "artwork", "station"].includes(key) || params.getAll(key).length !== 1)) return null;
  const surface = params.get("surface") ?? "map";
  if (surface === "station") return validateHomeRoute({ surface, stationId: params.get("station") });
  return validateHomeRoute(params.has("artwork") ? { surface, artworkId: params.get("artwork") } : { surface });
}

export function serializeHomeRoute(route: HomeRoute): string {
  const params = new URLSearchParams({ surface: route.surface });
  if (route.surface === "blackbook" && route.artworkId !== undefined) params.set("artwork", route.artworkId);
  if (route.surface === "station") params.set("station", route.stationId);
  return params.toString();
}

export function homeRouteKey(route: HomeRoute): string { return serializeHomeRoute(route); }

export function expectedSurfaceIdentity(runtimeId: string, navigationId: number, route: HomeRoute): HomeSurfaceIdentity {
  return Object.freeze({ runtimeId, navigationId, routeKey: homeRouteKey(route) });
}

export function matchesSurfaceIdentity(expected: HomeSurfaceIdentity, value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const identity = value as Partial<HomeSurfaceIdentity>;
  return identity.runtimeId === expected.runtimeId && identity.navigationId === expected.navigationId && identity.routeKey === expected.routeKey;
}
