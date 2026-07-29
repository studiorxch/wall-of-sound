import { describe, it, expect } from "vitest";
import { navigationItems } from "./topBarNavigation";

// 0722_MUSIC_Global_Navigation_Dropdowns §10.
// 0729_STUDIORICH_Navigation_Consolidation — Library and Broadcast became
// dropdowns (MUSIC/MAPS, RADIO/LIVE MAP); the standalone :5500 Wall server
// is no longer linked anywhere in normal navigation.
// Note: the repo's test stack (vitest, no @testing-library/react or jsdom)
// has no component-rendering harness, so these are structural/data-layer
// checks only — see the completion report for what's covered by manual
// verification instead (open/close, outside click, Escape, ARIA state).

function childrenOf(id: "studio" | "library" | "broadcast") {
  return navigationItems.find((item) => item.id === id)?.children ?? [];
}

describe("topBarNavigation — global nav data", () => {
  it("top-level order is Studio, Library, Broadcast — all dropdowns", () => {
    expect(navigationItems.map((item) => item.label)).toEqual(["Studio", "Library", "Broadcast"]);
    expect(navigationItems.every((item) => Array.isArray(item.children))).toBe(true);
  });

  it("Studio contains Scheduler followed by Promoter", () => {
    expect(childrenOf("studio").map((c) => c.label)).toEqual(["Scheduler", "Promoter"]);
  });

  it("Library contains MUSIC followed by MAPS", () => {
    expect(childrenOf("library").map((c) => c.label)).toEqual(["MUSIC", "MAPS"]);
  });

  it("Broadcast contains RADIO followed by LIVE MAP", () => {
    expect(childrenOf("broadcast").map((c) => c.label)).toEqual(["RADIO", "LIVE MAP"]);
  });

  it("MUSIC and MAPS are internal workspace-mode links", () => {
    const [music, maps] = childrenOf("library");
    expect(music.kind).toBe("internal");
    expect(music.kind === "internal" ? music.mode : null).toBe("flow_curve");
    expect(maps.kind).toBe("internal");
    expect(maps.kind === "internal" ? maps.mode : null).toBe("maps");
  });

  it("Promoter uses the exact approved external URL", () => {
    const promoter = childrenOf("studio").find((c) => c.label === "Promoter");
    expect(promoter?.kind).toBe("external");
    expect(promoter && promoter.kind === "external" ? promoter.href : null).toBe(
      "https://studiorich-promoter.studiorich.chatgpt.site/",
    );
  });

  it("RADIO uses the exact approved external URL", () => {
    const radio = childrenOf("broadcast").find((c) => c.label === "RADIO");
    expect(radio?.kind).toBe("external");
    expect(radio && radio.kind === "external" ? radio.href : null).toBe("https://radio.studiorich.tv/");
  });

  it("LIVE MAP opens the same-origin /wall-app/ runtime at the canonical localhost:5176 entry point, in a new tab", () => {
    const liveMap = childrenOf("broadcast").find((c) => c.label === "LIVE MAP");
    expect(liveMap?.kind).toBe("external");
    expect(liveMap && liveMap.kind === "external" ? liveMap.href : null).toBe("http://localhost:5176/wall-app/");
    expect(liveMap && liveMap.kind === "external" ? liveMap.newTab : null).toBe(true);
  });

  it("Scheduler retains its pre-change internal workspace-mode destination", () => {
    const scheduler = childrenOf("studio").find((c) => c.label === "Scheduler");
    expect(scheduler?.kind).toBe("internal");
    expect(scheduler && scheduler.kind === "internal" ? scheduler.mode : null).toBe("scheduler");
  });

  it("no navigation entry points at the standalone :5500 Wall server", () => {
    const allHrefs = navigationItems.flatMap((item) =>
      item.children.filter((c) => c.kind === "external").map((c) => (c as { href: string }).href),
    );
    expect(allHrefs.some((href) => href.includes(":5500"))).toBe(false);
  });
});
