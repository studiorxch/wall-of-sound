import { describe, it, expect } from "vitest";
import { navigationItems } from "./topBarNavigation";

describe("navigationItems — Broadcast RACETRACK entry (0805F)", () => {
  const broadcast = navigationItems.find((item) => item.id === "broadcast");

  it("Broadcast dropdown exists", () => {
    expect(broadcast).toBeTruthy();
  });

  it("RACETRACK appears under Broadcast as an action link", () => {
    const racetrack = broadcast?.children.find((link) => link.label === "RACETRACK");
    expect(racetrack).toBeTruthy();
    expect(racetrack?.kind).toBe("action");
    if (racetrack?.kind === "action") {
      expect(racetrack.action).toBe("openRacetrack");
    }
  });

  it("RACETRACK is not a plain external href — it must dispatch to the named-window bridge, never a generic new-tab link", () => {
    const racetrack = broadcast?.children.find((link) => link.label === "RACETRACK");
    expect(racetrack?.kind).not.toBe("external");
  });
});

describe("navigationItems — Broadcast SUBWAY entry (0818_SUBWAY_Logical_Rolling_Stock)", () => {
  const broadcast = navigationItems.find((item) => item.id === "broadcast");

  it("SUBWAY appears under Broadcast, labeled exactly \"SUBWAY\", as an action link", () => {
    const subway = broadcast?.children.find((link) => link.label === "SUBWAY");
    expect(subway).toBeTruthy();
    expect(subway?.kind).toBe("action");
    if (subway?.kind === "action") {
      expect(subway.action).toBe("openSubway");
    }
  });

  it("SUBWAY is not a plain external href — same named-window bridge pattern as RACETRACK, never a generic new-tab link", () => {
    const subway = broadcast?.children.find((link) => link.label === "SUBWAY");
    expect(subway?.kind).not.toBe("external");
  });

  it("existing Broadcast destinations (RADIO, LIVE MAP, RACETRACK) are preserved alongside the new SUBWAY entry", () => {
    const labels = broadcast?.children.map((link) => link.label);
    expect(labels).toEqual(["RADIO", "LIVE MAP", "RACETRACK", "SUBWAY"]);
  });
});
