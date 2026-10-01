// ── Station structural 3D scene builder (pure) ─────────────────────────────────
// STATION-14 (0918_WOS_Subway_First_Visual_3D_Station_Renderer_v1.0.0)
//
// Builds a Three.js scene graph (plain Object3D/BufferGeometry/Material
// objects -- no canvas, no WebGLRenderer, no DOM) from a
// StationStructuralProjection3D. This is the ONLY place this batch reads
// StationStructuralProjection3D's fields; everything here is pure and
// fully unit-testable in Node, since constructing Three.js scene-graph
// objects touches no DOM API -- only actually RENDERING them (a
// WebGLRenderer, a <canvas>) does, and that lives entirely in the separate
// stationStructure3DRenderer.ts (STATION-14's own DOM-mounting lifecycle
// wrapper, which imports this module rather than duplicating it).
//
// This module consumes ONLY StationStructuralProjection3D -- never
// StationGeometryData, never a Bay Ridge seed, never an archetype id,
// never evidence/editor state (STATION-14 Phase 1's own boundary). It
// mints no new identity: every Object3D's own `userData` carries the
// EXACT canonical id STATION-13's projection already carried, never a
// renderer-generated id.
//
// ── Coordinate mapping (the ONLY place this axis swap happens) ──────────────
// Station-local convention (stationGeometryCoordinates.ts, STATION-13):
//   +X = along-track, +Y = lateral, +Z = up.
// Three.js scene convention: +X = right, +Y = up, +Z = toward the camera.
// `toSceneVector3()` below is the one function that performs this mapping;
// every other function in this file calls it rather than swapping axes
// itself. station-local Z (up) becomes scene Y (up); station-local Y
// (lateral) becomes scene Z (depth) -- this makes an oblique architectural
// camera read along-track motion as left/right and lateral platform/track
// separation as near/far depth, exactly the relationship a human standing
// on a platform actually perceives.
//
// ── Canonical vs. presentation vertical placement ───────────────────────────
// `ProjectedLevel.canonicalElevationM` (STATION-13) already uses the same
// sign convention as scene-space "up" (negative = below street level), so
// when it exists it is used directly as the level's scene Y position --
// real meters, unconverted. When absent, `presentationStackIndex` (always
// present, unitless) drives scene Y instead, scaled by
// `LEVEL_PRESENTATION_SPACING_UNITS` -- a RENDERER-OWNED presentation
// constant, deliberately far from meter-like precision (a flat
// human-legible round number), documented here as never physical truth
// and never written back anywhere. `buildLevelSceneY()` is the one place
// this choice is made.
import * as THREE from "three";
import type {
  ProjectedConnection,
  ProjectedLevel,
  ProjectedPlatform,
  ProjectedTrack,
  ProjectedWall,
  StationStructuralProjection3D,
} from "./stationStructuralProjection3D";

// ── Presentation constants — NONE of these are physical truth ───────────────
// Every constant below exists purely so the scene is legible. None is
// derived from, or ever written into, Station Truth or the projection.
export const LEVEL_PRESENTATION_SPACING_UNITS = 6;
const PLATFORM_PRESENTATION_THICKNESS_UNITS = 0.15;
const WALL_PRESENTATION_THICKNESS_UNITS = 0.1;
const TRACK_RAIL_GAUGE_PRESENTATION_UNITS = 0.45;
const LEVEL_GRID_PRESENTATION_EXTENT_UNITS = 40;
const LEVEL_GRID_PRESENTATION_DIVISIONS = 16;

const COLOR_PLATFORM = 0x6fa8f0;
const COLOR_TRACK = 0xc8c0b6;
const COLOR_TRACK_BYPASS = 0x6b6357;
const COLOR_WALL_KNOWN = 0x8a8177;
const COLOR_CONNECTION_PATH_KNOWN = 0x4fd1c5;
const COLOR_CONNECTION_TOPOLOGY_ONLY = 0xd6a24a;
const COLOR_LEVEL_GRID = 0x3a352e;
const COLOR_LEVEL_LABEL = 0xa39a8d;

export interface StationStructure3DPickedSubject {
  readonly type: "level" | "platform" | "track" | "wall" | "connection";
  readonly id: string;
  readonly levelId?: string;
}

/** The one place station-local coordinates become Three.js scene coordinates. */
function toSceneVector3(point: { x: number; y: number; z?: number }, sceneY: number): THREE.Vector3 {
  return new THREE.Vector3(point.x, sceneY + (point.z ?? 0), point.y);
}

/** The one place a level's vertical placement is decided — see this file's own header. Exported for direct unit testing. */
export function buildLevelSceneY(level: ProjectedLevel): number {
  if (level.canonicalElevationM !== undefined) return level.canonicalElevationM;
  return -level.presentationStackIndex * LEVEL_PRESENTATION_SPACING_UNITS;
}

function footprintCentroid(points: readonly { x: number; y: number }[]): { x: number; y: number } {
  const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}

/**
 * Returns `null` in a non-DOM environment (this repo's own Node/vitest
 * test runner has no jsdom configured -- see platformRuntime.test.ts's
 * own identical precedent) rather than throwing: label text is a pure
 * legibility aid, never structural content, so skipping it when no
 * canvas/document exists keeps this module callable (and fully testable)
 * in Node while still rendering real labels in the actual browser.
 */
function makeLabelSprite(text: string, color: number): THREE.Sprite | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.font = "700 28px monospace";
    ctx.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
    ctx.textBaseline = "middle";
    ctx.fillText(text, 4, 32);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(4, 1, 1);
  return sprite;
}

function buildLevelSceneYMap(levels: readonly ProjectedLevel[]): Map<string, number> {
  return new Map(levels.map((level) => [level.id, buildLevelSceneY(level)]));
}

function buildLevelGroup(level: ProjectedLevel, sceneY: number): THREE.Group {
  const group = new THREE.Group();
  group.name = `level:${level.id}`;
  group.userData = { type: "level", id: level.id } satisfies StationStructure3DPickedSubject;

  // Allowed per STATION-14 Phase 5: an abstract, clearly-representational
  // reference grid at this level's own scene height -- never an invented
  // floor/room footprint. Fixed presentation extent, NOT derived from any
  // specific platform's real dimensions.
  const grid = new THREE.GridHelper(LEVEL_GRID_PRESENTATION_EXTENT_UNITS, LEVEL_GRID_PRESENTATION_DIVISIONS, COLOR_LEVEL_GRID, COLOR_LEVEL_GRID);
  const gridMaterial = grid.material as THREE.Material & { opacity: number; transparent: boolean };
  gridMaterial.opacity = 0.12;
  gridMaterial.transparent = true;
  grid.position.y = sceneY;
  group.add(grid);

  // A real canonical footprint, when one exists, is honestly drawn as an
  // outline on this level's own grid -- never fabricated when absent.
  if (level.footprint !== undefined && level.footprint.length >= 3) {
    const points = level.footprint.map((p) => toSceneVector3(p, sceneY));
    points.push(points[0]);
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: COLOR_LEVEL_GRID }));
    group.add(line);
  }

  const label = makeLabelSprite(level.kind.toUpperCase(), COLOR_LEVEL_LABEL);
  if (label) {
    label.position.set(-LEVEL_GRID_PRESENTATION_EXTENT_UNITS / 2 + 2, sceneY + 1, -LEVEL_GRID_PRESENTATION_EXTENT_UNITS / 2 + 2);
    group.add(label);
  }

  return group;
}

function buildPlatformMesh(platform: ProjectedPlatform, sceneY: number): THREE.Object3D | null {
  if (platform.footprint === undefined || platform.footprint.length < 3) return null;

  const shape = new THREE.Shape(platform.footprint.map((p) => new THREE.Vector2(p.x, p.y)));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: PLATFORM_PRESENTATION_THICKNESS_UNITS, bevelEnabled: false });
  // ExtrudeGeometry extrudes a 2D (x,y) shape along its own local +Z; rotate
  // so that local +Z becomes scene +Y (up) and the shape's own (x,y) land
  // in the scene's (x,z) plane -- consistent with toSceneVector3() above
  // (station-local Y -> scene Z).
  geometry.rotateX(-Math.PI / 2);

  const material = new THREE.MeshBasicMaterial({ color: COLOR_PLATFORM, transparent: true, opacity: 0.22, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = sceneY;

  const outlinePoints = [...platform.footprint, platform.footprint[0]].map((p) => toSceneVector3(p, sceneY + PLATFORM_PRESENTATION_THICKNESS_UNITS));
  const outlineGeometry = new THREE.BufferGeometry().setFromPoints(outlinePoints);
  const outline = new THREE.Line(outlineGeometry, new THREE.LineBasicMaterial({ color: COLOR_PLATFORM }));

  const group = new THREE.Group();
  group.name = `platform:${platform.id}`;
  group.userData = { type: "platform", id: platform.id, levelId: platform.levelId } satisfies StationStructure3DPickedSubject;
  mesh.userData = group.userData;
  outline.userData = group.userData;
  group.add(mesh, outline);
  return group;
}

function buildTrackLine(track: ProjectedTrack, sceneY: number): THREE.Object3D | null {
  if (track.localPoints === undefined || track.localPoints.length < 2) return null;

  const color = track.platformId === null ? COLOR_TRACK_BYPASS : COLOR_TRACK;
  const group = new THREE.Group();
  group.name = `track:${track.id}`;
  group.userData = { type: "track", id: track.id, levelId: track.levelId } satisfies StationStructure3DPickedSubject;

  // A schematic two-rail presentation, offset perpendicular to the
  // centerline's own direction by a fixed, documented presentation gauge
  // -- never a claim about real rail spacing.
  const [p0, p1] = track.localPoints;
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const length = Math.hypot(dx, dy) || 1;
  const perpX = -dy / length;
  const perpY = dx / length;
  const offset = TRACK_RAIL_GAUGE_PRESENTATION_UNITS / 2;

  for (const sign of [-1, 1]) {
    const railPoints = track.localPoints.map((p) =>
      toSceneVector3({ x: p.x + perpX * offset * sign, y: p.y + perpY * offset * sign }, sceneY),
    );
    const geometry = new THREE.BufferGeometry().setFromPoints(railPoints);
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color }));
    line.userData = group.userData;
    group.add(line);
  }

  return group;
}

function buildWallMesh(wall: ProjectedWall, sceneY: number): THREE.Object3D | null {
  // geometryUnknown: per STATION-11/12/14's own partial-truth invariant,
  // no physical geometry is ever fabricated here -- the wall's existence
  // is communicated only via the debug page's own text summary, never a
  // placeholder mesh at an arbitrary position.
  if (wall.geometryState !== "geometryKnown" || wall.localPolygon === undefined || wall.localPolygon.length < 3) return null;

  const shape = new THREE.Shape(wall.localPolygon.map((p) => new THREE.Vector2(p.x, p.z ?? 0)));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: WALL_PRESENTATION_THICKNESS_UNITS, bevelEnabled: false });
  const material = new THREE.MeshBasicMaterial({ color: COLOR_WALL_KNOWN, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  // The wall's own localPolygon already carries real (x, y, z) -- place it
  // at its own first vertex's station-local Y (lateral) via the standard
  // mapping; its real Z values (already embedded in the shape above)
  // supply vertical extent directly, not this level's own sceneY.
  mesh.position.z = wall.localPolygon[0].y;
  void sceneY; // walls carry their own real Z — this level's derived Y is intentionally not applied to a geometryKnown wall.

  mesh.userData = { type: "wall", id: wall.id, levelId: wall.levelId } satisfies StationStructure3DPickedSubject;
  return mesh;
}

function buildConnectionIndicator(
  connection: ProjectedConnection,
  levelSceneYById: Map<string, number>,
  platformsById: Map<string, ProjectedPlatform>,
  anchorIndex: number,
): THREE.Object3D | null {
  const fromY = levelSceneYById.get(connection.fromLevelId);
  const toY = levelSceneYById.get(connection.toLevelId);
  if (fromY === undefined || toY === undefined) return null;

  const userData: StationStructure3DPickedSubject = { type: "connection", id: connection.id };

  if (connection.pathState === "pathKnown" && connection.localPath !== undefined && connection.localPath.length >= 2) {
    const n = connection.localPath.length;
    const points = connection.localPath.map((p, i) => toSceneVector3(p, fromY + (toY - fromY) * (i / (n - 1))));
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: COLOR_CONNECTION_PATH_KNOWN }));
    line.userData = userData;
    return line;
  }

  // topologyOnly: an explicitly abstract, dashed level-to-level indicator
  // -- communicates REAL connectivity without inventing a stair/path
  // shape or a physical position. Anchored near the related platform's
  // own footprint centroid when known (a real relationship), offset
  // deterministically by `anchorIndex` only to keep multiple indicators
  // at the same platform from fully overlapping -- never a random jitter.
  const relatedPlatform = connection.relatedPlatformId ? platformsById.get(connection.relatedPlatformId) : undefined;
  const anchor =
    relatedPlatform?.footprint !== undefined && relatedPlatform.footprint.length > 0
      ? footprintCentroid(relatedPlatform.footprint)
      : { x: 0, y: 0 };
  const anchorOffset = anchorIndex * 1.5;

  const points = [
    toSceneVector3({ x: anchor.x + anchorOffset, y: anchor.y }, fromY),
    toSceneVector3({ x: anchor.x + anchorOffset, y: anchor.y }, toY),
  ];
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const line = new THREE.Line(geometry, new THREE.LineDashedMaterial({ color: COLOR_CONNECTION_TOPOLOGY_ONLY, dashSize: 0.4, gapSize: 0.3 }));
  line.computeLineDistances();
  line.userData = userData;
  return line;
}

/**
 * Pure. Builds a Three.js Group from a StationStructuralProjection3D --
 * no canvas, no WebGLRenderer, no DOM mutation beyond the one
 * `document.createElement("canvas")` label sprites use for text
 * rasterization (the same technique any Three.js text-sprite label uses;
 * it never attaches that canvas to the page). Never mutates `projection`.
 */
export function buildStationStructure3DScene(projection: StationStructuralProjection3D): THREE.Group {
  const root = new THREE.Group();
  root.name = `station:${projection.stationGeometryId}`;

  const levelSceneYById = buildLevelSceneYMap(projection.levels);
  const platformsById = new Map(projection.platforms.map((p) => [p.id, p]));

  for (const level of projection.levels) {
    root.add(buildLevelGroup(level, levelSceneYById.get(level.id)!));
  }

  for (const platform of projection.platforms) {
    const sceneY = levelSceneYById.get(platform.levelId) ?? 0;
    const mesh = buildPlatformMesh(platform, sceneY);
    if (mesh) root.add(mesh);
  }

  // Tracks with no derivable level (a platformless bypass track) fall
  // back to the lowest-ranked "platform"-kind level's own scene height --
  // a generic, documented renderer decision (bypass tracks physically run
  // at platform height), never station-specific.
  const platformLevelSceneY = projection.levels.find((l) => l.kind === "platform");
  const fallbackTrackSceneY = platformLevelSceneY ? levelSceneYById.get(platformLevelSceneY.id)! : 0;
  for (const track of projection.tracks) {
    const sceneY = track.levelId !== undefined ? (levelSceneYById.get(track.levelId) ?? fallbackTrackSceneY) : fallbackTrackSceneY;
    const line = buildTrackLine(track, sceneY);
    if (line) root.add(line);
  }

  for (const wall of projection.walls) {
    const sceneY = levelSceneYById.get(wall.levelId) ?? 0;
    const mesh = buildWallMesh(wall, sceneY);
    if (mesh) root.add(mesh);
  }

  const anchorIndexByPlatformId = new Map<string, number>();
  for (const connection of projection.connections) {
    const key = connection.relatedPlatformId ?? "";
    const anchorIndex = anchorIndexByPlatformId.get(key) ?? 0;
    anchorIndexByPlatformId.set(key, anchorIndex + 1);
    const indicator = buildConnectionIndicator(connection, levelSceneYById, platformsById, anchorIndex);
    if (indicator) root.add(indicator);
  }

  return root;
}
