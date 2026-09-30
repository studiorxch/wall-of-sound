// ── Station topology SVG renderer — DRAWING ONLY ───────────────────────────────
// STATION-07 (0913_WOS_Subway_Generic_Station_Topology_Renderer_Proof_v1.0.0)
//
// The visual renderer layer: Station Base Truth -> topology projection
// (stationTopologyProjection.ts, INTERPRETATION) -> visual renderer (THIS
// FILE, DRAWING ONLY). This module reads nothing but a StationTopologyModel
// -- no StationGeometryData, no archetype identity, no provenance. It cannot
// contain archetype-specific dispatch because it has no access to anything
// that would let it: a TopologyLane's own `kind`/`config`/`physicalRole`/
// `hasPlatform` fields are the only things this file ever branches on.
//
// Deliberately minimal, neutral, engineering-visualization styling -- per
// this batch's own explicit instruction, NOT final product design. One row
// per lane, in the model's own already-sorted order. No station
// environment, no textures, no perspective, no passengers/trains, no
// animation, no 3D.
import type { PlatformLane, StationTopologyModel, TopologyLane, TrackLane, WallLane } from "./stationTopologyProjection";

const LANE_HEIGHT = 44;
const LANE_GAP = 4;
const CONTENT_WIDTH = 440;
const MARGIN_X = 20;
const MARGIN_Y = 16;

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

const PLATFORM_COLOR_BY_CONFIG: Readonly<Record<PlatformLane["config"], string>> = {
  side: "#4a7fd6",
  island: "#3fae7a",
  unknown: "#8a8177",
};

function renderPlatformLane(lane: PlatformLane, y: number): string {
  const color = PLATFORM_COLOR_BY_CONFIG[lane.config];
  return [
    `<rect x="${MARGIN_X}" y="${y}" width="${CONTENT_WIDTH}" height="${LANE_HEIGHT}" rx="4" fill="${color}" fill-opacity="0.18" stroke="${color}" stroke-width="1.5" data-lane-kind="platform" data-lane-id="${escapeXml(lane.id)}" data-platform-config="${lane.config}"/>`,
    `<text x="${MARGIN_X + 10}" y="${y + LANE_HEIGHT / 2 + 4}" font-size="12" font-family="monospace" fill="${color}">${escapeXml(lane.label)}</text>`,
  ].join("");
}

function renderTrackLane(lane: TrackLane, y: number): string {
  const color = lane.hasPlatform ? "#cfcac2" : "#6b6357";
  const midY = y + LANE_HEIGHT / 2;
  const dash = lane.hasPlatform ? "" : ' stroke-dasharray="7,5"';
  return [
    `<line x1="${MARGIN_X}" y1="${midY}" x2="${MARGIN_X + CONTENT_WIDTH}" y2="${midY}" stroke="${color}" stroke-width="3"${dash} data-lane-kind="track" data-lane-id="${escapeXml(lane.id)}" data-has-platform="${lane.hasPlatform}"/>`,
    `<text x="${MARGIN_X + 10}" y="${y + LANE_HEIGHT - 6}" font-size="11" font-family="monospace" fill="${color}">${escapeXml(lane.label)}</text>`,
  ].join("");
}

function renderWallLane(lane: WallLane, y: number): string {
  const color = "#3a352e";
  return [
    `<rect x="${MARGIN_X}" y="${y}" width="${CONTENT_WIDTH}" height="${LANE_HEIGHT}" rx="2" fill="${color}" fill-opacity="0.5" stroke="#6b6357" stroke-width="1" stroke-dasharray="3,3" data-lane-kind="wall" data-lane-id="${escapeXml(lane.id)}" data-adjacent-track-id="${escapeXml(lane.adjacentTrackId ?? "")}"/>`,
    `<text x="${MARGIN_X + 10}" y="${y + LANE_HEIGHT / 2 + 4}" font-size="12" font-family="monospace" fill="#a39a8d">${escapeXml(lane.label)}</text>`,
  ].join("");
}

function renderLane(lane: TopologyLane, y: number): string {
  if (lane.kind === "platform") return renderPlatformLane(lane, y);
  if (lane.kind === "track") return renderTrackLane(lane, y);
  return renderWallLane(lane, y);
}

/**
 * Pure. Renders a full, self-contained `<svg>` document string from a
 * StationTopologyModel -- no DOM, no side effects. The caller (a debug page
 * runtime) is responsible for inserting this into the document.
 */
export function renderStationTopologySvg(model: StationTopologyModel): string {
  const width = MARGIN_X * 2 + CONTENT_WIDTH;
  const height = MARGIN_Y * 2 + model.lanes.length * (LANE_HEIGHT + LANE_GAP);
  const rows = model.lanes
    .map((lane, index) => renderLane(lane, MARGIN_Y + index * (LANE_HEIGHT + LANE_GAP)))
    .join("");
  return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Station topology schematic">` +
    `<rect x="0" y="0" width="${width}" height="${height}" fill="#0e0d0b"/>` +
    rows +
    `</svg>`;
}
