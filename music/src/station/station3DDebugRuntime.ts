// ── Station 3D Debug — dev-only inspection tool ─────────────────────────────────
// STATION-14 (0918_WOS_Subway_First_Visual_3D_Station_Renderer_v1.0.0)
//
// Development/debug tooling ONLY -- reached via its own isolated
// station-3d-debug.html, never wired into MAP, the Mezzanine Drawer, or
// Platform (same "isolated page route, no product navigation coupling"
// convention stationTopologyDebugRuntime.ts (STATION-07) already
// established). Lets a human switch between the real R42 station (via the
// unmodified stationGeometryRegistry.ts) and the required generic
// structural fixtures, and visually confirm projectStationStructure3D()/
// renderStationStructure3D() produce a correct, distinct 3D scene for
// each -- it is not a product surface and never will be.
//
// This runtime contains NO archetype-specific or station-specific
// rendering logic of its own -- it only chooses WHICH already-built
// StationGeometryData-shaped object to project and render; the
// projection/renderer themselves never see which fixture key was
// selected (same discipline STATION-07's own debug runtime established).
import { instantiateStationArchetype } from "../logic/maps/stationArchetypeInstantiate";
import { UG_SIDE_2TRACK_ARCHETYPE_ID, UG_SIDE_4TRACK_ARCHETYPE_ID, UG_ISLAND_2TRACK_ARCHETYPE_ID } from "../data/stationArchetypeTypes";
import {
  FOUR_TRACK_ISLAND_CONTRACT_PLATFORMS,
  FOUR_TRACK_ISLAND_CONTRACT_TRACK_CENTERLINES,
  FOUR_TRACK_ISLAND_CONTRACT_WALL_SURFACES,
} from "../logic/maps/stationGeometryFourTrackIslandContractFixture";
import { resolveKnownStationGeometry } from "../logic/maps/stationGeometryRegistry";
import { makeStationGeometryId, type StationGeometryData } from "../data/stationGeometryTypes";
import { projectStationStructure3D } from "../logic/maps/stationStructuralProjection3D";
import { renderStationStructure3D, type StationStructure3DHandle } from "../logic/maps/stationStructure3DRenderer";
import type { StationStructure3DPickedSubject } from "../logic/maps/stationStructure3DScene";

const FIXED_ORIGIN = { longitude: -74, latitude: 40.7, orientationDeg: 0 };
const FIXED_NOW = "2026-09-13T00:00:00.000Z";

type FixtureKey = "R42" | "SIDE_2" | "ISLAND_2" | "SIDE_4" | "ISLAND_4_TEST";

const FIXTURE_LABELS: Readonly<Record<FixtureKey, string>> = {
  R42: "R42 — Bay Ridge Av (real, via stationGeometryRegistry.ts)",
  SIDE_2: "SIDE_2 — UG_SIDE_2TRACK",
  ISLAND_2: "ISLAND_2 — UG_ISLAND_2TRACK",
  SIDE_4: "SIDE_4 — UG_SIDE_4TRACK",
  ISLAND_4_TEST: "ISLAND_4_TEST — synthetic contract fixture (not a production archetype)",
};

function buildFixtureGeometry(key: FixtureKey): StationGeometryData | null {
  switch (key) {
    case "R42":
      // The exact, unmodified STATION-08 registry lookup -- never a second R42 record.
      return resolveKnownStationGeometry("R42");
    case "SIDE_2":
      return instantiateStationArchetype({ archetypeId: UG_SIDE_2TRACK_ARCHETYPE_ID, stationRef: { gtfsStopId: "DEBUG-SIDE2", routeIds: [] }, origin: FIXED_ORIGIN, now: FIXED_NOW });
    case "ISLAND_2":
      return instantiateStationArchetype({ archetypeId: UG_ISLAND_2TRACK_ARCHETYPE_ID, stationRef: { gtfsStopId: "DEBUG-ISLAND2", routeIds: [] }, origin: FIXED_ORIGIN, now: FIXED_NOW });
    case "SIDE_4":
      return instantiateStationArchetype({ archetypeId: UG_SIDE_4TRACK_ARCHETYPE_ID, stationRef: { gtfsStopId: "DEBUG-SIDE4", routeIds: [] }, origin: FIXED_ORIGIN, now: FIXED_NOW });
    case "ISLAND_4_TEST":
      // Test/demo-only, reused verbatim from stationGeometryFourTrackIslandContractFixture.ts.
      return {
        id: makeStationGeometryId("DEBUG-ISLAND4"),
        stationRef: { gtfsStopId: "DEBUG-ISLAND4", routeIds: [] },
        version: 1,
        createdAt: FIXED_NOW,
        updatedAt: FIXED_NOW,
        origin: { longitude: FIXED_ORIGIN.longitude, latitude: FIXED_ORIGIN.latitude, altitudeM: 0, orientationDeg: FIXED_ORIGIN.orientationDeg, provenance: { source: "heuristic" } },
        levels: [{ id: "level:DEBUG-ISLAND4:platform", kind: "platform", label: "Platform level", provenance: { source: "authored" } }],
        platforms: [...FOUR_TRACK_ISLAND_CONTRACT_PLATFORMS],
        trackCenterlines: [...FOUR_TRACK_ISLAND_CONTRACT_TRACK_CENTERLINES],
        connections: [],
        platformLinks: [],
        evidenceConflicts: [],
        entrances: [],
        wallSurfaces: [...FOUR_TRACK_ISLAND_CONTRACT_WALL_SURFACES],
      };
  }
}

let activeHandle: StationStructure3DHandle | null = null;

function renderPicked(subject: StationStructure3DPickedSubject | null): void {
  const host = document.querySelector<HTMLElement>("#station-3d-picked");
  if (!host) return;
  if (!subject) {
    host.innerHTML = `<span class="station-3d-picked-empty">Click a structural element</span>`;
    return;
  }
  host.innerHTML = [
    `<div><span class="station-3d-picked-type">${subject.type.toUpperCase()}</span></div>`,
    `<div>${subject.id}</div>`,
    subject.levelId ? `<div>${subject.levelId}</div>` : "",
  ].join("");
}

function renderSummary(geometry: StationGeometryData | null): void {
  const host = document.querySelector<HTMLElement>("#station-3d-summary");
  if (!host) return;
  if (!geometry) {
    host.innerHTML = `<div>No canonical geometry available for this station yet.</div>`;
    return;
  }
  const wallsResolved = geometry.wallSurfaces.filter((w) => w.localPolygon !== undefined).length;
  const connectionsResolved = geometry.connections.filter((c) => c.localPath !== undefined).length;
  host.innerHTML = [
    `<div>${geometry.stationRef.gtfsStopId}</div>`,
    `<div>Levels: ${geometry.levels.length}</div>`,
    `<div>Platforms: ${geometry.platforms.length}</div>`,
    `<div>Tracks: ${geometry.trackCenterlines.length}</div>`,
    `<div>Walls: ${wallsResolved} / ${geometry.wallSurfaces.length} geometrically resolved</div>`,
    `<div>Connections: ${connectionsResolved} / ${geometry.connections.length} spatially resolved</div>`,
  ].join("");
}

function render(key: FixtureKey): void {
  const canvasHost = document.querySelector<HTMLElement>("#station-3d-canvas-host");
  if (!canvasHost) throw new Error("station_3d_debug_element_missing");

  activeHandle?.dispose();
  activeHandle = null;
  canvasHost.innerHTML = "";
  renderPicked(null);

  const geometry = buildFixtureGeometry(key);
  renderSummary(geometry);
  if (!geometry) return; // honest: no fabricated scene for a station with no real geometry.

  const projection = projectStationStructure3D(geometry);
  activeHandle = renderStationStructure3D(canvasHost, projection, { onSelect: renderPicked });
}

function boot(): void {
  const select = document.querySelector<HTMLSelectElement>("#station-3d-fixture");
  const resetButton = document.querySelector<HTMLButtonElement>("#station-3d-reset-camera");
  if (!select || !resetButton) throw new Error("station_3d_debug_element_missing");

  select.innerHTML = (Object.keys(FIXTURE_LABELS) as FixtureKey[])
    .map((key) => `<option value="${key}">${FIXTURE_LABELS[key]}</option>`)
    .join("");
  select.addEventListener("change", () => render(select.value as FixtureKey));
  resetButton.addEventListener("click", () => activeHandle?.resetCamera());
  render("R42");
}

boot();
