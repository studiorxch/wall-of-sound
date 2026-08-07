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
