// STATION-02 -- pure arrival DISPLAY logic only. This module has no
// opinion about WHERE real arrival data comes from -- it only decides
// what to show once given some. See this batch's own architecture-doc
// note (docs/architecture/subway/README.md's STATION-02 section) for why
// Station Cover cannot yet consume the real canonical
// `SubwayArrivalIntelligence` authority: that authority is a live,
// in-memory `wall/`-JS-realm object with no static/cross-document
// access path, structurally unreachable from Station Cover's own,
// separately-hosted document today. `stationCoverRuntime.ts` currently
// calls this module with an empty arrival list and an honest
// "unavailable" state -- never a fabricated one.
//
// The one real rule this module enforces, independent of where data
// eventually comes from: MAXIMUM TWO upcoming arrivals per service, per
// direction -- multiple DIFFERENT services in the same direction all
// remain valid.

export type StationArrivalDirection = "N" | "S";

export interface StationArrival {
  readonly routeId: string;
  readonly direction: StationArrivalDirection;
  /** Seconds until arrival -- always >= 0. Ordering within a service uses this, never array order. */
  readonly etaSeconds: number;
  /** True once inside the "Due" threshold -- mirrors subwayStationHud.js's own `_fmtEta` due/minutes split, same presentation vocabulary, not a second truth source. */
  readonly dueSoon: boolean;
}

export interface StationArrivalRow {
  readonly routeId: string;
  /** "Due" or "N min" -- same convention `subwayStationHud.js`'s own `_fmtEta` already uses. */
  readonly label: string;
  readonly etaSeconds: number;
}

export const MAX_ARRIVALS_PER_SERVICE_PER_DIRECTION = 2;

function formatEtaLabel(arrival: StationArrival): string {
  if (arrival.dueSoon) return "Due";
  return `${Math.max(1, Math.round(arrival.etaSeconds / 60))} min`;
}

/**
 * Pure. Groups by `routeId`, keeps only the earliest
 * `MAX_ARRIVALS_PER_SERVICE_PER_DIRECTION` per service (by `etaSeconds`,
 * never by whatever order the caller happened to supply), for the one
 * requested `direction` only. Multi-service stations naturally keep every
 * service's own capped rows, interleaved in nearest-first order across
 * services -- never truncated to one service overall.
 */
export function selectStationArrivalRows(
  arrivals: readonly StationArrival[],
  direction: StationArrivalDirection,
): readonly StationArrivalRow[] {
  const byRoute = new Map<string, StationArrival[]>();
  for (const arrival of arrivals) {
    if (arrival.direction !== direction) continue;
    const bucket = byRoute.get(arrival.routeId) ?? [];
    bucket.push(arrival);
    byRoute.set(arrival.routeId, bucket);
  }

  const rows: StationArrivalRow[] = [];
  for (const bucket of byRoute.values()) {
    bucket
      .slice()
      .sort((a, b) => a.etaSeconds - b.etaSeconds)
      .slice(0, MAX_ARRIVALS_PER_SERVICE_PER_DIRECTION)
      .forEach((arrival) => rows.push({ routeId: arrival.routeId, label: formatEtaLabel(arrival), etaSeconds: arrival.etaSeconds }));
  }

  return rows.sort((a, b) => a.etaSeconds - b.etaSeconds);
}
