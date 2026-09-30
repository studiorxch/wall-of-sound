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
  /** The real route color, used for the outline and glyph -- never the fill. */
  readonly color: string;
  readonly textColor: string;
  /** STATION-02 -- the same route color at ~10% opacity, for the restrained "tinted glass" interior fill (never a heavy solid bullet). Derived, not a second color a designer would need to keep in sync. */
  readonly tintBackground: string;
}

/**
 * `#RRGGBB` -> `rgba(r, g, b, alpha)`. Pure, exported for its own
 * deterministic test coverage -- this is the one piece of "does the
 * route-color-derived symbol actually derive from canonical color data"
 * logic worth testing directly.
 */
export function hexToRgba(hex: string, alpha: number): string {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!match) return `rgba(51, 51, 51, ${alpha})`; // same #333333 fallback toRouteBadge already uses
  const value = match[1]!;
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** ~10% opacity -- "very subtle tinted glass," never a solid fill. */
const ROUTE_TINT_ALPHA = 0.1;

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
  const color = /^[0-9a-fA-F]{6}$/.test(route.color) ? `#${route.color}` : "#333333";
  return {
    routeId: route.routeId,
    label: route.shortName || route.routeId,
    color,
    textColor: /^[0-9a-fA-F]{6}$/.test(route.textColor) ? `#${route.textColor}` : "#ffffff",
    tintBackground: hexToRgba(color, ROUTE_TINT_ALPHA),
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
