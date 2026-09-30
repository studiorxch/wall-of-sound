import { describe, it, expect } from "vitest";
import { selectStationArrivalRows } from "./stationArrivalPresentation";
import type { StationArrival } from "./stationArrivalPresentation";

function arrival(overrides: Partial<StationArrival> = {}): StationArrival {
  return { routeId: "R", direction: "N", etaSeconds: 120, dueSoon: false, ...overrides };
}

describe("selectStationArrivalRows -- STATION-02", () => {
  it("caps a single service at exactly two rows, nearest first, even when more exist", () => {
    const arrivals = [
      arrival({ etaSeconds: 120 }),
      arrival({ etaSeconds: 540 }),
      arrival({ etaSeconds: 1020 }),
      arrival({ etaSeconds: 1440 }),
    ];
    const rows = selectStationArrivalRows(arrivals, "N");
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.etaSeconds)).toEqual([120, 540]);
  });

  it("multi-service stations keep two rows PER service, not two rows total", () => {
    const arrivals = [
      arrival({ routeId: "R", etaSeconds: 120 }),
      arrival({ routeId: "R", etaSeconds: 540 }),
      arrival({ routeId: "N", etaSeconds: 240 }),
      arrival({ routeId: "N", etaSeconds: 660 }),
    ];
    const rows = selectStationArrivalRows(arrivals, "N");
    expect(rows).toHaveLength(4);
    expect(rows.filter((r) => r.routeId === "R")).toHaveLength(2);
    expect(rows.filter((r) => r.routeId === "N")).toHaveLength(2);
  });

  it("sorts the final result across services by actual eta, not by service grouping", () => {
    const arrivals = [
      arrival({ routeId: "R", etaSeconds: 900 }),
      arrival({ routeId: "N", etaSeconds: 120 }),
    ];
    const rows = selectStationArrivalRows(arrivals, "N");
    expect(rows.map((r) => r.routeId)).toEqual(["N", "R"]);
  });

  it("only returns arrivals for the requested direction", () => {
    const arrivals = [arrival({ direction: "N", etaSeconds: 120 }), arrival({ direction: "S", etaSeconds: 60 })];
    expect(selectStationArrivalRows(arrivals, "N")).toHaveLength(1);
    expect(selectStationArrivalRows(arrivals, "S")).toHaveLength(1);
    expect(selectStationArrivalRows(arrivals, "N")[0]!.etaSeconds).toBe(120);
  });

  it("selects strictly by eta ordering, never by the caller's own array order", () => {
    const arrivals = [arrival({ etaSeconds: 1020 }), arrival({ etaSeconds: 120 }), arrival({ etaSeconds: 540 })];
    const rows = selectStationArrivalRows(arrivals, "N");
    expect(rows.map((r) => r.etaSeconds)).toEqual([120, 540]); // the two nearest, not the first two in array order
  });

  it("formats a due arrival as 'Due', matching the existing subwayStationHud.js convention", () => {
    const rows = selectStationArrivalRows([arrival({ dueSoon: true, etaSeconds: 15 })], "N");
    expect(rows[0]!.label).toBe("Due");
  });

  it("formats a non-due arrival in whole minutes, rounded, minimum 1", () => {
    expect(selectStationArrivalRows([arrival({ etaSeconds: 90 })], "N")[0]!.label).toBe("2 min");
    expect(selectStationArrivalRows([arrival({ etaSeconds: 20, dueSoon: false })], "N")[0]!.label).toBe("1 min");
  });

  it("returns an empty list for no arrivals at all -- never fabricates a placeholder row", () => {
    expect(selectStationArrivalRows([], "N")).toEqual([]);
  });

  it("does not assume Bay Ridge Av's single-service case is universal -- three simultaneous services all keep their own capped rows", () => {
    const arrivals = [
      arrival({ routeId: "R", etaSeconds: 100 }),
      arrival({ routeId: "N", etaSeconds: 200 }),
      arrival({ routeId: "W", etaSeconds: 300 }),
    ];
    const rows = selectStationArrivalRows(arrivals, "N");
    expect(new Set(rows.map((r) => r.routeId))).toEqual(new Set(["R", "N", "W"]));
  });
});
