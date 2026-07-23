import { describe, it, expect } from "vitest";
import { navigationItems } from "./topBarNavigation";

// 0722_MUSIC_Global_Navigation_Dropdowns §10.
// Note: the repo's test stack (vitest, no @testing-library/react or jsdom)
// has no component-rendering harness, so these are structural/data-layer
// checks only — see the completion report for what's covered by manual
// verification instead (open/close, outside click, Escape, ARIA state).

describe("topBarNavigation — global nav data", () => {
  it("top-level order is Studio, Library, Broadcast", () => {
    expect(navigationItems.map((item) => item.label)).toEqual(["Studio", "Library", "Broadcast"]);
  });

  it("Studio contains Scheduler followed by Promoter", () => {
    const studio = navigationItems.find((item) => "id" in item && item.id === "studio");
    expect(studio && "children" in studio ? studio.children.map((c) => c.label) : null).toEqual([
      "Scheduler",
      "Promoter",
    ]);
  });

  it("Broadcast contains Maps followed by Radio", () => {
    const broadcast = navigationItems.find((item) => "id" in item && item.id === "broadcast");
    expect(broadcast && "children" in broadcast ? broadcast.children.map((c) => c.label) : null).toEqual([
      "Maps",
      "Radio",
    ]);
  });

  it("Promoter uses the exact approved external URL", () => {
    const studio = navigationItems.find((item) => "id" in item && item.id === "studio");
    const promoter = studio && "children" in studio ? studio.children.find((c) => c.label === "Promoter") : null;
    expect(promoter?.kind).toBe("external");
    expect(promoter && promoter.kind === "external" ? promoter.href : null).toBe(
      "https://studiorich-promoter.studiorich.chatgpt.site/",
    );
  });

  it("Radio uses the exact approved external URL", () => {
    const broadcast = navigationItems.find((item) => "id" in item && item.id === "broadcast");
    const radio = broadcast && "children" in broadcast ? broadcast.children.find((c) => c.label === "Radio") : null;
    expect(radio?.kind).toBe("external");
    expect(radio && radio.kind === "external" ? radio.href : null).toBe("https://radio.studiorich.tv/");
  });

  it("Scheduler and Library retain their pre-change internal workspace-mode destinations", () => {
    const studio = navigationItems.find((item) => "id" in item && item.id === "studio");
    const scheduler = studio && "children" in studio ? studio.children.find((c) => c.label === "Scheduler") : null;
    expect(scheduler?.kind).toBe("internal");
    expect(scheduler && scheduler.kind === "internal" ? scheduler.mode : null).toBe("scheduler");

    const library = navigationItems.find((item) => item.label === "Library");
    expect(library && "kind" in library && library.kind === "internal" ? library.mode : null).toBe("flow_curve");
  });

  it("Maps preserves the existing broadcast_hud workspace mode (label-only rename)", () => {
    const broadcast = navigationItems.find((item) => "id" in item && item.id === "broadcast");
    const maps = broadcast && "children" in broadcast ? broadcast.children.find((c) => c.label === "Maps") : null;
    expect(maps?.kind).toBe("internal");
    expect(maps && maps.kind === "internal" ? maps.mode : null).toBe("broadcast_hud");
  });

  it("no top-level item besides Studio/Broadcast exposes dropdown children", () => {
    const library = navigationItems.find((item) => item.label === "Library");
    expect(library && "children" in library).toBe(false);
  });
});
