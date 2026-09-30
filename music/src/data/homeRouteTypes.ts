/** HOME route identity is domain state, never an iframe URL. HOST-01 has test surfaces only. */
export type HomeRoute =
  | { readonly surface: "map" }
  | { readonly surface: "blackbook"; readonly artworkId?: string }
  /**
   * STATION-01 -- `stationId` is the real, station-level GTFS stop id
   * (e.g. "R42" for Bay Ridge Av) -- the same identity
   * `StationGeometryStationRef.gtfsStopId` and this codebase's existing
   * `stationGeometry:<gtfsStopId>` convention already use. Never a second
   * station id scheme.
   */
  | { readonly surface: "station"; readonly stationId: string }
  /**
   * STATION-08 -- the Platform surface, reached via the Mezzanine
   * Drawer's ENTER PLATFORM action (or directly via this route for
   * debugging). Same `stationId` identity as "station" above -- never a
   * second scheme, never hardcoded to Bay Ridge Av in the route contract
   * itself (STATION-08's own real seed coverage is a data-availability
   * fact Platform's own runtime handles honestly, not a routing
   * constraint).
   */
  | { readonly surface: "platform"; readonly stationId: string };

export interface HomeSurfaceIdentity {
  readonly runtimeId: string;
  readonly navigationId: number;
  readonly routeKey: string;
}

export interface HomeNavigationState {
  readonly runtimeId: string;
  readonly route: HomeRoute | null;
  readonly navigationId: number;
  readonly phase: "idle" | "mounting" | "active" | "failed";
  readonly diagnostic: string | null;
  readonly mounts: number;
  readonly leaves: number;
}
