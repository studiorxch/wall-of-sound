// ── Station topology projection — the Base-Truth → renderer bridge ────────────
// STATION-07 (0913_WOS_Subway_Generic_Station_Topology_Renderer_Proof_v1.0.0)
//
// This is the ONE layer that interprets canonical Station Base Truth
// (StationGeometryData's own platforms/trackCenterlines/wallSurfaces) into a
// small, generic, renderer-agnostic model of "lanes" ordered across the
// station's own local Y axis. It is the bridge this batch exists to prove:
//
//   Station Base Truth -> topology projection (interpretation, HERE) ->
//   visual renderer (drawing only, stationTopologySvgRenderer.ts)
//
// This module owns INTERPRETATION: reading real geometry/relationship facts
// (platformId, platformSide, physicalRole/role, config, adjacentTrackId) and
// deciding what a lane IS and where it sits. It never draws anything (no SVG,
// no DOM, no coordinates-to-pixels math) -- that is the renderer's own job,
// entirely downstream of this module's plain-data output.
//
// ── The core architectural requirement, verified by construction ───────────
// This module's own public input type, StationTopologyInput, has NO
// archetypeId field, and nothing in this file imports UG_SIDE_2TRACK_ARCHETYPE_ID,
// UG_SIDE_4TRACK_ARCHETYPE_ID, UG_ISLAND_2TRACK_ARCHETYPE_ID, or any other
// archetype identity from stationArchetypeTypes.ts. There is no
// `if (archetypeId === ...)` anywhere here, or anywhere downstream --
// projectStationTopology() derives every lane purely from the real fields a
// StationGeometryData record already carries (platforms[].config,
// trackCenterlines[].platformId/platformSide/physicalRole/role,
// wallSurfaces[].adjacentTrackId, and each record's own footprint/localPoints/
// localPolygon), whether that record came from an archetype
// (heuristic provenance), a real calibrated seed (reference/authority
// provenance), or a future hand-authored station (authored provenance) --
// provenance itself is never read here at all. See
// stationTopologyProjection.test.ts's own "archetype-blind" describe block,
// which asserts this both by type-shape (no archetypeId in the input) and by
// behavior (identical structural input produces identical output regardless
// of which archetype -- or no archetype at all -- produced it).
//
// Reuses stationGeometryTypes.ts's own field shapes directly -- no parallel
// geometry vocabulary. Does NOT use stationGeometryCoordinates.ts: that
// module's own job is geographic <-> station-local-meter conversion, and this
// proof operates entirely within the station-local frame a StationGeometryData
// record is already expressed in (see that module's own header) -- there is
// no geographic coordinate anywhere in this pipeline, so pulling in a
// geo-projection dependency here would be new, unnecessary coupling, not
// reuse. LocalPoint2D/LocalPoint3D themselves ARE reused directly (imported,
// never redefined).
import type {
  LocalPoint2D,
  PlatformConfig,
  PlatformSide,
  StationPlatform,
  StationTrackCenterline,
  StationWallSurface,
  TrackPhysicalRole,
  TrackRole,
} from "../../data/stationGeometryTypes";

/**
 * The renderer's real input contract: exactly the three StationGeometryData
 * fields a 2D topology plan needs. Deliberately NOT the full
 * StationGeometryData record (this proof has no use for levels/connections/
 * platformLinks/evidenceConflicts/entrances) and deliberately NOT
 * `Pick<StationGeometryData, ...>` re-exported under a new name -- a plain
 * structural type keeps the "no archetypeId" guarantee visible at the type
 * level without relying on a reader also checking StationGeometryData's own
 * shape elsewhere.
 */
export interface StationTopologyInput {
  readonly platforms: readonly StationPlatform[];
  readonly trackCenterlines: readonly StationTrackCenterline[];
  readonly wallSurfaces: readonly StationWallSurface[];
}

export type TopologyLaneKind = "platform" | "track" | "wall";

interface TopologyLaneBase {
  readonly kind: TopologyLaneKind;
  readonly id: string;
  /** Representative lateral (station-local Y) position -- the ONLY thing lane ORDER is derived from. */
  readonly y: number;
  readonly label: string;
}

export interface PlatformLane extends TopologyLaneBase {
  readonly kind: "platform";
  readonly config: PlatformConfig;
  /** Every track (by id) whose platformId points at this platform -- an island platform has 2+; a side platform typically has exactly 1. */
  readonly servedByTrackIds: readonly string[];
}

export interface TrackLane extends TopologyLaneBase {
  readonly kind: "track";
  readonly role?: TrackRole;
  readonly physicalRole?: TrackPhysicalRole;
  readonly platformId: string | null;
  readonly platformSide?: PlatformSide;
  /** Derived, never authored directly: platformId !== null. The one real fact a future door-side/stopping system would branch on. */
  readonly hasPlatform: boolean;
}

export interface WallLane extends TopologyLaneBase {
  readonly kind: "wall";
  readonly adjacentTrackId?: string;
  readonly suitableForArt: boolean;
}

export type TopologyLane = PlatformLane | TrackLane | WallLane;

export interface StationTopologyModel {
  /** Sorted ascending by `y` -- outer-to-inner across the station's own cross-section, the same convention every real seed/archetype in this codebase already uses (negative Y first). */
  readonly lanes: readonly TopologyLane[];
}

function meanY(points: readonly LocalPoint2D[] | undefined): number | null {
  if (!points || points.length === 0) return null;
  return points.reduce((sum, p) => sum + p.y, 0) / points.length;
}

function platformLabel(platform: StationPlatform): string {
  return `${platform.config.toUpperCase()} PLATFORM (${platform.id})`;
}

function trackLabel(track: StationTrackCenterline): string {
  const role = track.physicalRole ?? track.role ?? "TRACK";
  const suffix = track.platformId == null ? " — no platform" : "";
  return `${String(role).toUpperCase()} (${track.id})${suffix}`;
}

function wallLabel(wall: StationWallSurface): string {
  const facing = wall.adjacentTrackId ? ` → ${wall.adjacentTrackId}` : "";
  return `WALL (${wall.id})${facing}`;
}

/**
 * Pure. Derives a StationTopologyModel purely from real Base Truth fields --
 * see this file's own header for the "no archetype dispatch" guarantee. A
 * platform/track/wall with no positional evidence at all (both `footprint`/
 * `localPoints`/`localPolygon` omitted -- a genuinely unauthored record) is
 * skipped rather than plotted at a guessed position; this mirrors
 * stationGeometryTypes.ts's own "omission, not a fabricated default" rule.
 */
export function projectStationTopology(input: StationTopologyInput): StationTopologyModel {
  const platformLanes: PlatformLane[] = [];
  for (const platform of input.platforms) {
    const y = meanY(platform.footprint);
    if (y == null) continue;
    const servedByTrackIds = input.trackCenterlines.filter((t) => t.platformId === platform.id).map((t) => t.id);
    platformLanes.push({ kind: "platform", id: platform.id, y, label: platformLabel(platform), config: platform.config, servedByTrackIds });
  }

  const trackLanes: TrackLane[] = [];
  for (const track of input.trackCenterlines) {
    const y = meanY(track.localPoints);
    if (y == null) continue;
    trackLanes.push({
      kind: "track",
      id: track.id,
      y,
      label: trackLabel(track),
      role: track.role,
      physicalRole: track.physicalRole,
      platformId: track.platformId,
      platformSide: track.platformSide,
      hasPlatform: track.platformId != null,
    });
  }

  const wallLanes: WallLane[] = [];
  for (const wall of input.wallSurfaces) {
    const y = meanY(wall.localPolygon);
    if (y == null) continue;
    wallLanes.push({ kind: "wall", id: wall.id, y, label: wallLabel(wall), adjacentTrackId: wall.adjacentTrackId, suitableForArt: wall.suitableForArt });
  }

  const lanes: TopologyLane[] = [...platformLanes, ...trackLanes, ...wallLanes].sort((a, b) => a.y - b.y);
  return { lanes };
}
