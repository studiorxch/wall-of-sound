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
  | { readonly surface: "station"; readonly stationId: string };

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
