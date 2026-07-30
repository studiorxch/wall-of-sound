import { describe, it, expect } from "vitest";
import { buildGeographicTargets, sortTargetsByCategory } from "./geographicTargets";
import type { RegistryRecord } from "../../maps/wallPaletteBridge";

function rec(
  partial: Partial<Omit<RegistryRecord, "currentValue">> & Pick<RegistryRecord, "id" | "group" | "source"> & { currentValue?: unknown },
): RegistryRecord {
  return {
    label: partial.id,
    sourceObject: "",
    sourceProperty: "",
    currentValue: "#000000",
    ...partial,
  } as RegistryRecord;
}

describe("buildGeographicTargets", () => {
  it("consolidates fill+outline into one target, not two rows", () => {
    const registry = [
      rec({ id: "mapbox.national-park.fill-color", group: "Land", source: "mapbox-style", sourceObject: "national-park", sourceProperty: "fill-color" }),
      rec({ id: "mapbox.national-park.fill-outline-color", group: "Land", source: "mapbox-style", sourceObject: "national-park", sourceProperty: "fill-outline-color" }),
    ];
    const values = { "mapbox.national-park.fill-color": "#4A4326", "mapbox.national-park.fill-outline-color": "#6B6238" };
    const targets = buildGeographicTargets(registry, values, null);
    expect(targets).toHaveLength(1);
    expect(targets[0].name).toBe("National Park");
    expect(targets[0].colorFields.map((f) => f.roleLabel)).toEqual(["Fill", "Outline"]);
    expect(targets[0].colorFields.map((f) => f.value)).toEqual(["#4A4326", "#6B6238"]);
  });

  it("infers layerType from the property suffix", () => {
    const registry = [rec({ id: "mapbox.water-depth.fill-color", group: "Water", source: "mapbox-style", sourceObject: "water-depth", sourceProperty: "fill-color" })];
    const targets = buildGeographicTargets(registry, { "mapbox.water-depth.fill-color": "#081820" }, null);
    expect(targets[0].layerType).toBe("fill");
  });

  it("flags non-hex/rgba values as expressions", () => {
    const registry = [rec({ id: "mapbox.hillshade.fill-color", group: "Base Map", source: "mapbox-style", sourceObject: "hillshade", sourceProperty: "fill-color", currentValue: ["match"] })];
    const targets = buildGeographicTargets(registry, {}, null); // no override -> falls back to currentValue (array, non-string)
    expect(targets[0].colorFields[0].isExpression).toBe(true);
    expect(targets[0].hasExpression).toBe(true);
  });

  it("consolidates route/vehicle/hud into one target each, not one per sub-property", () => {
    const registry = [
      rec({ id: "route.line.default-color", group: "Route", source: "route", sourceProperty: "routeLine", label: "Route Line" }),
      rec({ id: "route.selection.color", group: "Route", source: "route", sourceProperty: "selection", label: "Route Selection" }),
      rec({ id: "vehicle.hero.body", group: "Vehicles", source: "vehicle", sourceProperty: "body" }),
      rec({ id: "vehicle.hero.roof", group: "Vehicles", source: "vehicle", sourceProperty: "roof" }),
      rec({ id: "hud.environmental.live", group: "HUD", source: "hud", sourceProperty: "live" }),
    ];
    const values = {
      "route.line.default-color": "#ff6a3d", "route.selection.color": "#ffffff",
      "vehicle.hero.body": "#c8352e", "vehicle.hero.roof": "#a02820",
      "hud.environmental.live": "rgba(120,220,120,0.7)",
    };
    const targets = buildGeographicTargets(registry, values, null);
    expect(targets.map((t) => t.name).sort()).toEqual(["HUD", "Hero Vehicle", "Route"]);
    const route = targets.find((t) => t.name === "Route")!;
    expect(route.colorFields).toHaveLength(2);
    const vehicle = targets.find((t) => t.name === "Hero Vehicle")!;
    expect(vehicle.colorFields).toHaveLength(2);
  });

  it("marks a target customized only when its value differs from Default's for the same property", () => {
    const registry = [rec({ id: "mapbox.landuse.fill-color", group: "Land", source: "mapbox-style", sourceObject: "landuse", sourceProperty: "fill-color" })];
    const defaults = { "mapbox.landuse.fill-color": "#161b1d" };
    const same = buildGeographicTargets(registry, { "mapbox.landuse.fill-color": "#161b1d" }, defaults);
    expect(same[0].isCustomized).toBe(false);
    const changed = buildGeographicTargets(registry, { "mapbox.landuse.fill-color": "#ccff00" }, defaults);
    expect(changed[0].isCustomized).toBe(true);
  });

  it("never marks anything customized when defaultValues is null (viewing Default itself)", () => {
    const registry = [rec({ id: "mapbox.landuse.fill-color", group: "Land", source: "mapbox-style", sourceObject: "landuse", sourceProperty: "fill-color" })];
    const targets = buildGeographicTargets(registry, { "mapbox.landuse.fill-color": "#161b1d" }, null);
    expect(targets[0].isCustomized).toBe(false);
  });
});

describe("sortTargetsByCategory", () => {
  it("orders by the canonical category list, then name within category", () => {
    const targets = [
      { targetId: "b", name: "Zeta", category: "Land", sourceType: "mapbox-style" as const, layerType: undefined, colorFields: [], hasExpression: false, isCustomized: false },
      { targetId: "a", name: "Alpha", category: "Land", sourceType: "mapbox-style" as const, layerType: undefined, colorFields: [], hasExpression: false, isCustomized: false },
      { targetId: "c", name: "Anything", category: "Water", sourceType: "mapbox-style" as const, layerType: undefined, colorFields: [], hasExpression: false, isCustomized: false },
    ];
    const sorted = sortTargetsByCategory(targets);
    expect(sorted.map((t) => t.targetId)).toEqual(["c", "a", "b"]); // Water before Land; Alpha before Zeta within Land
  });
});
