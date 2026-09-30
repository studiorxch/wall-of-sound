import { describe, it, expect } from "vitest";
import { deriveStationCoverDisplay, hexToRgba } from "./stationCoverPresentation";
import type { StationTruth } from "./stationTruth";

const BAY_RIDGE_AV: StationTruth = {
  gtfsStopId: "R42",
  complexId: "36",
  name: "Bay Ridge Av",
  borough: "Bk",
  routes: [{ routeId: "R", shortName: "R", longName: "Broadway Local", color: "F6BC26", textColor: "000000" }],
  latitude: 40.634967,
  longitude: -74.023377,
};

describe("deriveStationCoverDisplay -- STATION-01", () => {
  it("renders loading while truth is still being fetched (undefined, distinct from null)", () => {
    expect(deriveStationCoverDisplay("R42", undefined)).toEqual({ kind: "loading" });
  });

  it("fails safely for an unknown/unresolved station instead of fabricating a name", () => {
    const result = deriveStationCoverDisplay("NOPE99", null);
    expect(result).toEqual({ kind: "unknown-station", stationId: "NOPE99" });
  });

  it("renders the resolved station's real name and route identity from canonical truth", () => {
    const result = deriveStationCoverDisplay("R42", BAY_RIDGE_AV);
    expect(result.kind).toBe("resolved");
    if (result.kind !== "resolved") throw new Error("unreachable");
    expect(result.name).toBe("Bay Ridge Av");
    expect(result.routes).toEqual([{ routeId: "R", label: "R", color: "#F6BC26", textColor: "#000000", tintBackground: "rgba(246, 188, 38, 0.1)" }]);
  });

  it("expands a recognized borough code to its full name", () => {
    const result = deriveStationCoverDisplay("R42", BAY_RIDGE_AV);
    if (result.kind !== "resolved") throw new Error("unreachable");
    expect(result.boroughLabel).toBe("Brooklyn");
  });

  it("falls back to the raw borough code when it isn't a recognized one, rather than hiding it", () => {
    const truth: StationTruth = { ...BAY_RIDGE_AV, borough: "XX" };
    const result = deriveStationCoverDisplay("R42", truth);
    if (result.kind !== "resolved") throw new Error("unreachable");
    expect(result.boroughLabel).toBe("XX");
  });

  it("omits the borough label entirely (never a fabricated placeholder) when canonical truth supplied none", () => {
    const truth: StationTruth = { ...BAY_RIDGE_AV, borough: "" };
    const result = deriveStationCoverDisplay("R42", truth);
    if (result.kind !== "resolved") throw new Error("unreachable");
    expect(result.boroughLabel).toBeNull();
  });

  it("never renders an underground/elevated classification -- no field exists to render one from", () => {
    const result = deriveStationCoverDisplay("R42", BAY_RIDGE_AV);
    expect(result).not.toHaveProperty("classification");
    expect(result).not.toHaveProperty("structure");
  });

  it("falls back to a safe route color when the snapshot's own color isn't valid hex", () => {
    const truth: StationTruth = { ...BAY_RIDGE_AV, routes: [{ routeId: "R", shortName: "R", longName: "Broadway Local", color: "not-a-color", textColor: "also-not" }] };
    const result = deriveStationCoverDisplay("R42", truth);
    if (result.kind !== "resolved") throw new Error("unreachable");
    expect(result.routes[0]!.color).toBe("#333333");
    expect(result.routes[0]!.textColor).toBe("#ffffff");
  });

  it("STATION-02: the route badge's tint background is derived from the SAME real route color, never a second color", () => {
    const result = deriveStationCoverDisplay("R42", BAY_RIDGE_AV);
    if (result.kind !== "resolved") throw new Error("unreachable");
    expect(result.routes[0]!.tintBackground).toBe(hexToRgba(result.routes[0]!.color, 0.1));
  });
});

describe("hexToRgba -- STATION-02", () => {
  it("converts a real hex route color to a low-alpha rgba string", () => {
    expect(hexToRgba("#F6BC26", 0.1)).toBe("rgba(246, 188, 38, 0.1)");
  });

  it("falls back safely for an invalid hex string rather than throwing", () => {
    expect(hexToRgba("not-a-color", 0.1)).toBe("rgba(51, 51, 51, 0.1)");
  });
});
