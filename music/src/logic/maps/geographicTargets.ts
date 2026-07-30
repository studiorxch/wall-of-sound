// ── geographicTargets ─────────────────────────────────────────────────────────
// 0729_MAPS_Geographic_Catalog_Dual_View
//
// Pure, testable consolidation logic: groups the flat registry (one row per
// Mapbox paint property, e.g. "national-park.fill-color" and
// "national-park.fill-outline-color" as two separate records) into one
// GeographicTarget per real object — "National Park" with Fill/Outline
// sub-fields — matching the spec's product model. Route/Vehicle/HUD each
// consolidate into a single target the same way, since their sub-properties
// are all facets of one conceptual object, not independent records.
//
// 0729_MAPS_Visual_Property_Authority_Audit extended this to a fourth source
// type, "overlay" (runtime canvas on/off toggles like AtmosphereComposite —
// not a Mapbox paint property at all), and to non-color field kinds
// (opacity, boolean) alongside the original color fields — see
// GeographicField.valueKind.
//
// Reads only what the existing registry/bridge already expose — no new Wall
// authority capability, no fabricated fields. "Customized" is computed by
// comparing each field's current value against Default's value for the same
// property id — real, derived data, not invented.

import type { RegistryRecord } from "../../maps/wallPaletteBridge";

export type GeographicFieldKind = "color" | "opacity" | "boolean";

export type GeographicField = {
  propId: string;
  roleLabel: string;
  value: string;
  isExpression: boolean;
  valueKind: GeographicFieldKind;
};

export type GeographicLayerType = "fill" | "line" | "circle" | "symbol" | "background" | undefined;

export type GeographicTarget = {
  targetId: string;
  name: string;
  category: string;
  sourceType: "mapbox-style" | "route" | "vehicle" | "hud" | "overlay";
  layerType: GeographicLayerType;
  colorFields: GeographicField[];
  hasExpression: boolean;
  isCustomized: boolean;
};

function isExpressionValue(value: unknown): boolean {
  return typeof value !== "string";
}

function toFieldKind(registryValueKind: RegistryRecord["valueKind"]): GeographicFieldKind {
  if (registryValueKind === "opacity") return "opacity";
  if (registryValueKind === "boolean") return "boolean";
  return "color";
}

const FILL_SUFFIX_ROLE: Record<string, string> = {
  "fill-color": "Fill",
  "fill-outline-color": "Outline",
  "fill-opacity": "Opacity",
  "line-color": "Color",
  "line-opacity": "Opacity",
  "circle-color": "Fill",
  "circle-stroke-color": "Stroke",
  "circle-opacity": "Opacity",
  "text-color": "Text",
  "text-halo-color": "Halo",
  "icon-color": "Icon",
  "background-color": "Color",
};

function inferLayerType(sourceProperty: string): GeographicLayerType {
  if (sourceProperty.startsWith("fill-")) return "fill";
  if (sourceProperty.startsWith("line-")) return "line";
  if (sourceProperty.startsWith("circle-")) return "circle";
  if (sourceProperty.startsWith("text-") || sourceProperty === "icon-color") return "symbol";
  if (sourceProperty === "background-color") return "background";
  return undefined;
}

function titleCase(s: string): string {
  return s.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}

// "AtmosphereComposite" -> "Atmosphere Composite" — overlay sourceObjects
// are PascalCase module names (SBE.AtmosphereComposite), not hyphenated
// layer ids, so titleCase() alone (which only splits on -/_) leaves them
// unchanged; this inserts the missing word boundaries first.
function pascalToTitleCase(s: string): string {
  return titleCase(s.replace(/([a-z0-9])([A-Z])/g, "$1 $2"));
}

export function buildGeographicTargets(
  registry: RegistryRecord[],
  currentValues: Record<string, string>,
  defaultValues: Record<string, string> | null,
): GeographicTarget[] {
  const mapboxByObject = new Map<string, RegistryRecord[]>();
  const bySource: Record<"route" | "vehicle" | "hud" | "overlay", RegistryRecord[]> = {
    route: [], vehicle: [], hud: [], overlay: [],
  };

  for (const rec of registry) {
    if (rec.source === "mapbox-style") {
      const key = rec.sourceObject ?? rec.id;
      if (!mapboxByObject.has(key)) mapboxByObject.set(key, []);
      mapboxByObject.get(key)!.push(rec);
    } else if (rec.source === "route" || rec.source === "vehicle" || rec.source === "hud" || rec.source === "overlay") {
      bySource[rec.source].push(rec);
    }
  }

  const targets: GeographicTarget[] = [];

  function fieldsFor(records: RegistryRecord[], roleFor: (rec: RegistryRecord) => string): GeographicField[] {
    return records.map((rec) => {
      // currentValues is typed Record<string,string>, but a property whose
      // Mapbox paint value is an expression (e.g. hillshade's zoom-stop
      // match array) genuinely carries a non-string array/object at
      // runtime — never coerce it to a string here, or the real
      // "Expression" warning (below) silently disappears.
      const raw = Object.prototype.hasOwnProperty.call(currentValues, rec.id) ? currentValues[rec.id] : rec.currentValue;
      const value = raw as unknown as string;
      return {
        propId: rec.id,
        roleLabel: roleFor(rec),
        value,
        isExpression: isExpressionValue(value),
        valueKind: toFieldKind(rec.valueKind),
      };
    });
  }

  for (const [layerId, records] of mapboxByObject) {
    const colorFields = fieldsFor(records, (rec) => FILL_SUFFIX_ROLE[rec.sourceProperty] ?? titleCase(rec.sourceProperty));
    const hasExpression = colorFields.some((f) => f.isExpression);
    const isCustomized = defaultValues != null && colorFields.some((f) => defaultValues[f.propId] !== f.value);
    targets.push({
      targetId: `mapbox:${layerId}`,
      name: titleCase(layerId),
      category: records[0].group,
      sourceType: "mapbox-style",
      layerType: inferLayerType(records[0].sourceProperty),
      colorFields,
      hasExpression,
      isCustomized,
    });
  }

  if (bySource.route.length) {
    const colorFields = fieldsFor(bySource.route, (rec) => rec.label);
    targets.push({
      targetId: "route",
      name: "Route",
      category: bySource.route[0].group,
      sourceType: "route",
      layerType: undefined,
      colorFields,
      hasExpression: colorFields.some((f) => f.isExpression),
      isCustomized: defaultValues != null && colorFields.some((f) => defaultValues[f.propId] !== f.value),
    });
  }

  if (bySource.vehicle.length) {
    const colorFields = fieldsFor(bySource.vehicle, (rec) => titleCase(rec.sourceProperty));
    targets.push({
      targetId: "vehicle",
      name: "Hero Vehicle",
      category: bySource.vehicle[0].group,
      sourceType: "vehicle",
      layerType: undefined,
      colorFields,
      hasExpression: colorFields.some((f) => f.isExpression),
      isCustomized: defaultValues != null && colorFields.some((f) => defaultValues[f.propId] !== f.value),
    });
  }

  if (bySource.hud.length) {
    const colorFields = fieldsFor(bySource.hud, (rec) => titleCase(rec.sourceProperty));
    targets.push({
      targetId: "hud",
      name: "HUD",
      category: bySource.hud[0].group,
      sourceType: "hud",
      layerType: undefined,
      colorFields,
      hasExpression: colorFields.some((f) => f.isExpression),
      isCustomized: defaultValues != null && colorFields.some((f) => defaultValues[f.propId] !== f.value),
    });
  }

  // One target per overlay object (currently just AtmosphereComposite) —
  // grouped by sourceObject like mapbox layers, since a future second
  // overlay toggle shouldn't collapse into the same target.
  const overlayByObject = new Map<string, RegistryRecord[]>();
  for (const rec of bySource.overlay) {
    const key = rec.sourceObject ?? rec.id;
    if (!overlayByObject.has(key)) overlayByObject.set(key, []);
    overlayByObject.get(key)!.push(rec);
  }
  for (const [objectId, records] of overlayByObject) {
    const colorFields = fieldsFor(records, (rec) => titleCase(rec.sourceProperty));
    targets.push({
      targetId: `overlay:${objectId}`,
      name: pascalToTitleCase(objectId),
      category: records[0].group,
      sourceType: "overlay",
      layerType: undefined,
      colorFields,
      hasExpression: false,
      isCustomized: defaultValues != null && colorFields.some((f) => defaultValues[f.propId] !== f.value),
    });
  }

  return targets;
}

export const GEOGRAPHIC_CATEGORY_ORDER = [
  "Water", "Land", "Roads", "Labels", "Boundaries", "Base Map", "Route", "Vehicles", "HUD", "Overlay",
];

export function sortTargetsByCategory(targets: GeographicTarget[]): GeographicTarget[] {
  return [...targets].sort((a, b) => {
    const ai = GEOGRAPHIC_CATEGORY_ORDER.indexOf(a.category);
    const bi = GEOGRAPHIC_CATEGORY_ORDER.indexOf(b.category);
    if (ai !== bi) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    return a.name.localeCompare(b.name);
  });
}
