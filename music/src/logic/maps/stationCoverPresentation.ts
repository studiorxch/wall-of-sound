// STATION-01 -- pure state->display mapping for Station Cover, same
// "logic vs. DOM adapter" split every other HOME-adjacent module already
// uses (homeNavigation.ts, memberAvatarPresentation.ts). No fetch, no
// DOM -- a straight, deterministic function of an already-resolved
// `StationTruth | null`.
//
// Deliberately renders NO underground/elevated badge: no station
// (including Bay Ridge Av) has a hand-authored classification record
// today (see stationTruth.ts's own doc) -- this module has nothing
// uncertain to expose, by construction, rather than by an ad hoc check
// here.
import type { StationTruth, StationTruthRoute } from "./stationTruth";

/** MTA's own fixed two-letter borough-code vocabulary -- a universal lookup table, not station-specific fact data. */
const BOROUGH_NAMES: Readonly<Record<string, string>> = {
  Mn: "Manhattan",
  Bk: "Brooklyn",
  Bx: "The Bronx",
  Q: "Queens",
  SI: "Staten Island",
};

export interface StationCoverRouteBadge {
  readonly routeId: string;
  readonly label: string;
  readonly color: string;
  readonly textColor: string;
}

export type StationCoverDisplay =
  | { readonly kind: "loading" }
  | { readonly kind: "unknown-station"; readonly stationId: string }
  | {
      readonly kind: "resolved";
      readonly stationId: string;
      readonly name: string;
      /** Full borough name when the code is recognized, the raw code as a fallback, `null` only if canonical truth supplied none at all. */
      readonly boroughLabel: string | null;
      readonly routes: readonly StationCoverRouteBadge[];
    };

function toRouteBadge(route: StationTruthRoute): StationCoverRouteBadge {
  return {
    routeId: route.routeId,
    label: route.shortName || route.routeId,
    color: /^[0-9a-fA-F]{6}$/.test(route.color) ? `#${route.color}` : "#333333",
    textColor: /^[0-9a-fA-F]{6}$/.test(route.textColor) ? `#${route.textColor}` : "#ffffff",
  };
}

export function deriveStationCoverDisplay(stationId: string, truth: StationTruth | null | undefined): StationCoverDisplay {
  if (truth === undefined) return { kind: "loading" };
  if (truth === null) return { kind: "unknown-station", stationId };
  return {
    kind: "resolved",
    stationId: truth.gtfsStopId,
    name: truth.name,
    boroughLabel: truth.borough ? (BOROUGH_NAMES[truth.borough] ?? truth.borough) : null,
    routes: truth.routes.map(toRouteBadge),
  };
}
