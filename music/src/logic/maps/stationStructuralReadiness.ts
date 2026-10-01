// ── Station structural readiness evaluator ────────────────────────────────────
// STATION-12 (0916_WOS_Subway_Bay_Ridge_Av_3D_Readiness_v1.0.0)
//
// A programmatic, readable readiness evaluation of a station's canonical
// StationGeometryData against the minimum representation-independent 3D
// structural contract (see docs/architecture/subway/README.md's own
// "STATION-12" section for the full contract). This module does NOT render
// anything, does NOT build a Three.js/renderer contract, and is completely
// generic: it reads only real StationGeometryData fields, never a station
// id, an archetype id, or any other station-specific branch. The exact same
// function call works for Bay Ridge Av, any archetype-generated geometry,
// or any future real station — see this file's own test suite for proof.
//
// Core principle this module exists to enforce, never violate: known
// EXISTENCE/IDENTITY must never be read as known GEOMETRY. A wall with a
// real id and a real adjacentPlatformId relationship, but no localPolygon,
// is reported as geometrically UNKNOWN here — this module never upgrades a
// status merely because a record exists, only because real geometry (or a
// real topological relationship, for the connectivity requirement) exists.
import type {
  Provenance,
  StationConnection,
  StationGeometryData,
  StationGeometryId,
  StationLevel,
  StationPlatform,
  StationTrackCenterline,
  StationWallSurface,
} from "../../data/stationGeometryTypes";

export type StationStructuralReadinessStatus = "READY" | "PARTIAL" | "UNKNOWN";

export interface StationStructuralReadinessItem {
  readonly requirement: string;
  readonly status: StationStructuralReadinessStatus;
  readonly note: string;
}

export interface StationStructuralReadinessReport {
  readonly stationGeometryId: StationGeometryId;
  readonly items: readonly StationStructuralReadinessItem[];
}

/**
 * Below this, a present value is real but not strong enough to call
 * "measured-grade" — matches the confidence band this codebase's own real
 * seeds already use for OSM-estimated geometry (0.35-0.48), well under
 * this threshold; a real GPS/authority-sourced value (no `confidence`
 * field at all, or `source: "authority"`) always counts as strong.
 */
const STRONG_CONFIDENCE_THRESHOLD = 0.8;

function isStrongProvenance(provenance: Provenance): boolean {
  if (provenance.source === "authority") return true;
  if (typeof provenance.confidence === "number") return provenance.confidence >= STRONG_CONFIDENCE_THRESHOLD;
  return false;
}

interface CollectionAssessment {
  readonly status: StationStructuralReadinessStatus;
  readonly totalCount: number;
  readonly presentCount: number;
  readonly strongCount: number;
}

/** Generic: assesses any collection of records that each may-or-may-not carry real geometry. */
function assessCollection<T>(
  items: readonly T[],
  hasGeometry: (item: T) => boolean,
  provenanceOf: (item: T) => Provenance,
): CollectionAssessment {
  if (items.length === 0) return { status: "UNKNOWN", totalCount: 0, presentCount: 0, strongCount: 0 };
  const present = items.filter(hasGeometry);
  if (present.length === 0) {
    return { status: "UNKNOWN", totalCount: items.length, presentCount: 0, strongCount: 0 };
  }
  const strong = present.filter((item) => isStrongProvenance(provenanceOf(item)));
  const status: StationStructuralReadinessStatus = strong.length === items.length ? "READY" : "PARTIAL";
  return { status, totalCount: items.length, presentCount: present.length, strongCount: strong.length };
}

function evaluateLevels(levels: readonly StationLevel[], connections: readonly StationConnection[]): StationStructuralReadinessItem {
  if (levels.length === 0) {
    return { requirement: "levels", status: "UNKNOWN", note: "No StationLevel records exist — the station stack itself is unmodeled." };
  }
  const levelIds = new Set(levels.map((l) => l.id));
  const connectedLevelIds = new Set<string>();
  for (const c of connections) {
    if (levelIds.has(c.fromLevelId)) connectedLevelIds.add(c.fromLevelId);
    if (levelIds.has(c.toLevelId)) connectedLevelIds.add(c.toLevelId);
  }
  const unconnected = levels.filter((l) => !connectedLevelIds.has(l.id));
  const elevationKnownCount = levels.filter((l) => typeof l.elevationM === "number").length;
  const elevationNote = `${elevationKnownCount}/${levels.length} level(s) have a real elevationM magnitude (optional enrichment — relative order via connections is what this requirement actually needs).`;
  if (unconnected.length === 0) {
    return {
      requirement: "levels",
      status: "READY",
      note: `All ${levels.length} level(s) are topologically connected to at least one other level — relative order is fully known. ${elevationNote}`,
    };
  }
  return {
    requirement: "levels",
    status: levels.length > unconnected.length ? "PARTIAL" : "UNKNOWN",
    note: `${unconnected.length}/${levels.length} level(s) (${unconnected.map((l) => l.id).join(", ")}) have no connection to any other level — relative order is not fully established. ${elevationNote}`,
  };
}

function evaluatePlatformFootprints(platforms: readonly StationPlatform[]): StationStructuralReadinessItem {
  const assessment = assessCollection(platforms, (p) => p.footprint !== undefined, (p) => p.provenance);
  return {
    requirement: "platformFootprints",
    status: assessment.status,
    note: `${assessment.presentCount}/${assessment.totalCount} platform(s) have an authored footprint; ${assessment.strongCount}/${assessment.totalCount} at strong (authority-grade or ≥${STRONG_CONFIDENCE_THRESHOLD} confidence) provenance.`,
  };
}

function evaluateTrackCenterlines(tracks: readonly StationTrackCenterline[]): StationStructuralReadinessItem {
  const assessment = assessCollection(tracks, (t) => t.localPoints !== undefined, (t) => t.provenance);
  return {
    requirement: "trackCenterlines",
    status: assessment.status,
    note: `${assessment.presentCount}/${assessment.totalCount} track(s) have authored localPoints; ${assessment.strongCount}/${assessment.totalCount} at strong provenance.`,
  };
}

function evaluateWallSurfaces(walls: readonly StationWallSurface[]): StationStructuralReadinessItem {
  if (walls.length === 0) {
    return { requirement: "wallSurfaces", status: "UNKNOWN", note: "No StationWallSurface records exist for this station." };
  }
  const assessment = assessCollection(walls, (w) => w.localPolygon !== undefined, (w) => w.provenance);
  const identityNote = `${walls.length} wall record(s) exist with real identity/relationship (adjacentTrackId/adjacentPlatformId) — known existence is never read as known geometry.`;
  return {
    requirement: "wallSurfaces",
    status: assessment.status,
    note: `${assessment.presentCount}/${assessment.totalCount} wall(s) have an authored polygon. ${identityNote}`,
  };
}

function evaluateMezzanineFootprint(levels: readonly StationLevel[]): StationStructuralReadinessItem {
  const mezzanine = levels.find((l) => l.kind === "mezzanine");
  if (!mezzanine) {
    return { requirement: "mezzanineFootprint", status: "UNKNOWN", note: "No mezzanine-kind level exists for this station." };
  }
  if (mezzanine.footprint !== undefined) {
    return {
      requirement: "mezzanineFootprint",
      status: isStrongProvenance(mezzanine.provenance) ? "READY" : "PARTIAL",
      note: "The mezzanine level has an authored footprint.",
    };
  }
  return { requirement: "mezzanineFootprint", status: "UNKNOWN", note: "The mezzanine level exists but has no authored footprint." };
}

function evaluateConnections(levels: readonly StationLevel[], connections: readonly StationConnection[]): StationStructuralReadinessItem {
  if (connections.length === 0) {
    return { requirement: "connections", status: "UNKNOWN", note: "No StationConnection records exist — level-to-level circulation is entirely unmodeled." };
  }
  const levelIds = new Set(levels.map((l) => l.id));
  const connectedLevelIds = new Set<string>();
  for (const c of connections) {
    if (levelIds.has(c.fromLevelId)) connectedLevelIds.add(c.fromLevelId);
    if (levelIds.has(c.toLevelId)) connectedLevelIds.add(c.toLevelId);
  }
  const pathCount = connections.filter((c) => c.localPath !== undefined).length;
  const pathNote = `${pathCount}/${connections.length} connection(s) have authored spatial path (localPath) geometry — optional enrichment, not required for a first structural pass.`;
  if (connectedLevelIds.size === levelIds.size && levelIds.size > 0) {
    return {
      requirement: "connections",
      status: "READY",
      note: `Every level is reachable via at least one real connection — circulation topology is fully known. ${pathNote}`,
    };
  }
  return {
    requirement: "connections",
    status: connectedLevelIds.size > 0 ? "PARTIAL" : "UNKNOWN",
    note: `Only ${connectedLevelIds.size}/${levelIds.size} level(s) are reachable via a real connection. ${pathNote}`,
  };
}

function evaluateColumns(): StationStructuralReadinessItem {
  return {
    requirement: "columns",
    status: "UNKNOWN",
    note: "No structural column/pillar primitive exists in Station Truth today (deliberately, per STATION-11/STATION-12 — no real position/spacing evidence has ever justified adding one). This requirement is UNKNOWN for every station, not specifically this one, until a primitive exists and is populated.",
  };
}

/**
 * Pure. Evaluates one StationGeometryData record against the minimum 3D
 * structural contract (docs/architecture/subway/README.md's own
 * "STATION-12" section). Never reads the real GTFS stop id anywhere to
 * branch behavior — see this file's own test suite for a direct proof that
 * archetype-generated and real-seed geometry are evaluated identically.
 */
export function evaluateStationStructuralReadiness(geometry: StationGeometryData): StationStructuralReadinessReport {
  return {
    stationGeometryId: geometry.id,
    items: [
      evaluateLevels(geometry.levels, geometry.connections),
      evaluatePlatformFootprints(geometry.platforms),
      evaluateTrackCenterlines(geometry.trackCenterlines),
      evaluateWallSurfaces(geometry.wallSurfaces),
      evaluateMezzanineFootprint(geometry.levels),
      evaluateConnections(geometry.levels, geometry.connections),
      evaluateColumns(),
    ],
  };
}
