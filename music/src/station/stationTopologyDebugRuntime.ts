// ── Station Topology Debug — dev-only inspection tool ──────────────────────────
// STATION-07 (0913_WOS_Subway_Generic_Station_Topology_Renderer_Proof_v1.0.0)
//
// Development/debug tooling ONLY -- reached via its own isolated
// station-topology-debug.html, never wired into MAP or the Mezzanine
// Drawer (same "isolated hash/page route, no product navigation coupling"
// convention StationGeometryEditor.tsx's own header already established for
// its Archetype Editor). This page exists purely to let a human switch
// between the required topology fixtures and visually confirm
// projectStationTopology()/renderStationTopologySvg() produce the correct
// shape for each -- it is not a product surface and never will be.
//
// Every fixture here is built from REAL canonical Base Truth -- three via
// instantiateStationArchetype() (the exact same function/dispatch STATION-06
// repaired), one (ISLAND_4_TEST) from the shared, non-production synthetic
// fixture STATION-06's own contract test already validates. This runtime
// itself contains NO archetype-specific rendering logic -- it only chooses
// WHICH already-built StationGeometryData-shaped object to pass to the one
// shared projectStationTopology()/renderStationTopologySvg() pipeline; the
// projection/renderer themselves never see which fixture key was selected.
import { projectStationTopology, type StationTopologyInput } from "../logic/maps/stationTopologyProjection";
import { renderStationTopologySvg } from "../logic/maps/stationTopologySvgRenderer";
import { instantiateStationArchetype } from "../logic/maps/stationArchetypeInstantiate";
import { UG_SIDE_2TRACK_ARCHETYPE_ID, UG_SIDE_4TRACK_ARCHETYPE_ID, UG_ISLAND_2TRACK_ARCHETYPE_ID } from "../data/stationArchetypeTypes";
import {
  FOUR_TRACK_ISLAND_CONTRACT_PLATFORMS,
  FOUR_TRACK_ISLAND_CONTRACT_TRACK_CENTERLINES,
  FOUR_TRACK_ISLAND_CONTRACT_WALL_SURFACES,
} from "../logic/maps/stationGeometryFourTrackIslandContractFixture";

const FIXED_ORIGIN = { longitude: -74, latitude: 40.7, orientationDeg: 0 };
const FIXED_NOW = "2026-09-13T00:00:00.000Z";

type FixtureKey = "SIDE_2" | "ISLAND_2" | "SIDE_4" | "ISLAND_4_TEST";

const FIXTURE_LABELS: Readonly<Record<FixtureKey, string>> = {
  SIDE_2: "SIDE_2 — UG_SIDE_2TRACK",
  ISLAND_2: "ISLAND_2 — UG_ISLAND_2TRACK",
  SIDE_4: "SIDE_4 — UG_SIDE_4TRACK",
  ISLAND_4_TEST: "ISLAND_4_TEST — synthetic contract fixture (not a production archetype)",
};

function buildFixtureInput(key: FixtureKey): StationTopologyInput {
  switch (key) {
    case "SIDE_2": {
      const geometry = instantiateStationArchetype({ archetypeId: UG_SIDE_2TRACK_ARCHETYPE_ID, stationRef: { gtfsStopId: "DEBUG-SIDE2", routeIds: [] }, origin: FIXED_ORIGIN, now: FIXED_NOW });
      return { platforms: geometry.platforms, trackCenterlines: geometry.trackCenterlines, wallSurfaces: geometry.wallSurfaces };
    }
    case "ISLAND_2": {
      const geometry = instantiateStationArchetype({ archetypeId: UG_ISLAND_2TRACK_ARCHETYPE_ID, stationRef: { gtfsStopId: "DEBUG-ISLAND2", routeIds: [] }, origin: FIXED_ORIGIN, now: FIXED_NOW });
      return { platforms: geometry.platforms, trackCenterlines: geometry.trackCenterlines, wallSurfaces: geometry.wallSurfaces };
    }
    case "SIDE_4": {
      const geometry = instantiateStationArchetype({ archetypeId: UG_SIDE_4TRACK_ARCHETYPE_ID, stationRef: { gtfsStopId: "DEBUG-SIDE4", routeIds: [] }, origin: FIXED_ORIGIN, now: FIXED_NOW });
      return { platforms: geometry.platforms, trackCenterlines: geometry.trackCenterlines, wallSurfaces: geometry.wallSurfaces };
    }
    case "ISLAND_4_TEST":
      // Test/demo-only, reused verbatim from stationGeometryFourTrackIslandContractFixture.ts
      // -- never re-authored here, never promoted to a production archetype.
      return {
        platforms: FOUR_TRACK_ISLAND_CONTRACT_PLATFORMS,
        trackCenterlines: FOUR_TRACK_ISLAND_CONTRACT_TRACK_CENTERLINES,
        wallSurfaces: FOUR_TRACK_ISLAND_CONTRACT_WALL_SURFACES,
      };
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

function render(key: FixtureKey): void {
  const svgHost = document.querySelector<HTMLElement>("#topology-debug-svg");
  const laneListHost = document.querySelector<HTMLElement>("#topology-debug-lanes");
  if (!svgHost || !laneListHost) throw new Error("station_topology_debug_element_missing");

  const input = buildFixtureInput(key);
  const model = projectStationTopology(input);
  svgHost.innerHTML = renderStationTopologySvg(model);

  laneListHost.innerHTML = model.lanes
    .map((lane, index) => `<li data-lane-kind="${lane.kind}">${index + 1}. [${lane.kind.toUpperCase()}] ${escapeHtml(lane.label)}</li>`)
    .join("");
}

function boot(): void {
  const select = document.querySelector<HTMLSelectElement>("#topology-debug-fixture");
  if (!select) throw new Error("station_topology_debug_element_missing");
  select.innerHTML = (Object.keys(FIXTURE_LABELS) as FixtureKey[])
    .map((key) => `<option value="${key}">${escapeHtml(FIXTURE_LABELS[key])}</option>`)
    .join("");
  select.addEventListener("change", () => render(select.value as FixtureKey));
  render("SIDE_2");
}

boot();
