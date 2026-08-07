// ── wallMapPreview ────────────────────────────────────────────────────────────
// 0729_STUDIORICH_Centralized_Library_MAPS_Integration
//
// One shared, dockable Mapbox preview instance for the centralized Library's
// MAPS interface — ported from wall/maps/palettesGallery.js's proven
// _ensurePreviewMap/dock/undock/retry pattern (that file is the migration
// reference this build is required to preserve, §4). This is NOT a second
// map runtime: it reads the same WOS style and the same
// window.SBE.MapsGeographicStyleAuthority/Registry that drive the live
// Broadcast map, and there is exactly one instance shared by every card
// thumbnail and the detail view's live preview — never one map per card.
//
// Mapbox GL JS/CSS and the access token are loaded lazily, from Wall's own
// files via the /wall-app proxy (vite.config.ts) — nothing is duplicated or
// re-hosted; MUSIC's core app never depends on any of this being present.

import { ensureInitialized } from "./wallGeographicStyleBridge";

const WOS_STYLE = "mapbox://styles/studiorich/cm3goyx23003901qkb60ff29p";
const PREVIEW_CENTER: [number, number] = [-74.0165, 40.7015];
const PREVIEW_ZOOM = 12.8;
const PREVIEW_BEARING = -12;
const PREVIEW_PITCH = 30;
const MAP_LOAD_TIMEOUT_MS = 15000;

type MapboxMap = {
  on: (event: string, fn: (e?: unknown) => void) => void;
  once: (event: string, fn: (e?: unknown) => void) => void;
  remove: () => void;
  resize: () => void;
  getCanvas: () => HTMLCanvasElement;
  getLayer: (id: string) => unknown;
  getLayoutProperty: (id: string, prop: string) => unknown;
  getPaintProperty: (id: string, prop: string) => unknown;
  getSource: (id: string) => { setData: (data: unknown) => void } | undefined;
  addSource: (id: string, source: unknown) => void;
  addLayer: (layer: unknown, beforeId?: string) => void;
  removeLayer: (id: string) => void;
  removeSource: (id: string) => void;
  fitBounds: (bounds: [[number, number], [number, number]], options?: Record<string, unknown>) => void;
};

type ReadyState = "idle" | "loading" | "ready" | "unavailable";

let _map: MapboxMap | null = null;
let _mapEl: HTMLDivElement | null = null;
let _offscreenHolder: HTMLDivElement | null = null;
let _pendingReady: Array<(map: MapboxMap | null) => void> = [];
let _state: ReadyState = "idle";
let _runtimeLoadPromise: Promise<boolean> | null = null;
const _thumbCache: Record<string, string> = {};
const _stateListeners: Array<(s: ReadyState) => void> = [];

function _setState(next: ReadyState) {
  _state = next;
  _stateListeners.slice().forEach((fn) => {
    try { fn(next); } catch { /* listener error is not this module's concern */ }
  });
}

export function getPreviewState(): ReadyState {
  return _state;
}

export function subscribePreviewState(fn: (s: ReadyState) => void): () => void {
  _stateListeners.push(fn);
  return () => {
    const i = _stateListeners.indexOf(fn);
    if (i >= 0) _stateListeners.splice(i, 1);
  };
}

function _injectScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) { resolve(); return; }
    const el = document.createElement("script");
    el.src = src;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(el);
  });
}

function _injectStylesheet(href: string): void {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const el = document.createElement("link");
  el.rel = "stylesheet";
  el.href = href;
  document.head.appendChild(el);
}

// Loads Mapbox GL JS + CSS (CDN, same version wall/ uses) and the token
// bridge (proxied from wall/mapbox-env.js — a public pk. token, the same one
// already shipped to the browser on the live map). Idempotent.
async function _loadMapboxRuntime(): Promise<boolean> {
  if (_runtimeLoadPromise) return _runtimeLoadPromise;
  _runtimeLoadPromise = (async () => {
    try {
      _injectStylesheet("https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.css");
      await _injectScript("https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.js");
      await _injectScript("/wall-app/mapbox-env.js");
      return true;
    } catch {
      return false;
    }
  })();
  return _runtimeLoadPromise;
}

function _flushReady(map: MapboxMap | null) {
  const cbs = _pendingReady;
  _pendingReady = [];
  cbs.forEach((fn) => { try { fn(map); } catch { /* subscriber error is not this module's concern */ } });
}

// Tears down a stuck/incomplete instance so the next ensurePreviewMap() call
// creates a genuinely new one instead of re-awaiting the same stalled Map.
export function discardStuckPreviewMap(): void {
  if (_map) { try { _map.remove(); } catch { /* already gone */ } }
  _map = null;
  if (_offscreenHolder?.parentNode) _offscreenHolder.parentNode.removeChild(_offscreenHolder);
  _offscreenHolder = null;
  _mapEl = null;
  _setState("idle");
}

export function ensurePreviewMap(onReady: (map: MapboxMap | null) => void): void {
  if (_state === "ready" && _map) { onReady(_map); return; }
  if (_state === "unavailable") { onReady(null); return; }
  _pendingReady.push(onReady);
  if (_state === "loading") return;
  _setState("loading");

  void (async () => {
    const runtimeOk = await _loadMapboxRuntime();
    const mapboxgl = (window as unknown as { mapboxgl?: {
      accessToken: string;
      Map: new (opts: Record<string, unknown>) => MapboxMap;
    } }).mapboxgl;
    const token = (window as unknown as { SBE?: { MapboxToken?: string }; MAPBOX_TOKEN?: string }).SBE?.MapboxToken
      ?? (window as unknown as { MAPBOX_TOKEN?: string }).MAPBOX_TOKEN
      ?? "";

    if (!runtimeOk || !mapboxgl || !token) {
      _setState("unavailable");
      _flushReady(null);
      return;
    }
    mapboxgl.accessToken = token;

    _offscreenHolder = document.createElement("div");
    _offscreenHolder.className = "maps-preview-offscreen-holder";
    _offscreenHolder.style.cssText = "position:fixed; left:-9999px; top:0; width:480px; height:320px;";
    document.body.appendChild(_offscreenHolder);

    _mapEl = document.createElement("div");
    _mapEl.style.cssText = "width:100%; height:100%;";
    _offscreenHolder.appendChild(_mapEl);

    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      _setState("unavailable");
      _flushReady(null);
    }, MAP_LOAD_TIMEOUT_MS);

    try {
      _map = new mapboxgl.Map({
        container: _mapEl,
        style: WOS_STYLE,
        center: PREVIEW_CENTER,
        zoom: PREVIEW_ZOOM,
        bearing: PREVIEW_BEARING,
        pitch: PREVIEW_PITCH,
        attributionControl: false,
        preserveDrawingBuffer: true,
      });
    } catch {
      window.clearTimeout(timeout);
      _setState("unavailable");
      _flushReady(null);
      return;
    }

    _map.on("error", () => { /* surfaced via timeout/unavailable state, not thrown */ });

    // style.load, not the full load/tile-decode event — the registry only
    // ever calls getStyle()/getLayer()/setPaintProperty(), none of which
    // need tiles to have arrived.
    _map.once("style.load", () => {
      if (timedOut) return;
      window.clearTimeout(timeout);
      ensureInitialized(_map);
      _setState("ready");
      _flushReady(_map);
    });
  })();
}

export function dockPreviewMap(containerEl: HTMLElement): void {
  ensurePreviewMap((map) => {
    if (!map || !_mapEl) return;
    containerEl.appendChild(_mapEl);
    map.resize();
  });
}

export function undockPreviewMap(): void {
  if (_mapEl && _offscreenHolder && _mapEl.parentNode !== _offscreenHolder) {
    _offscreenHolder.appendChild(_mapEl);
    if (_map) _map.resize();
  }
}

export function invalidateThumbnail(paletteId: string): void {
  delete _thumbCache[paletteId];
}

// Real, live-read visibility for a Mapbox layer — 'visible' unless the
// style explicitly sets 'none' (Mapbox's own default when unset is
// 'visible'). Read-only: there is no write path from the palette system,
// so this is display/filtering data only, never presented as editable.
export function getLayerVisibility(layerId: string): "visible" | "none" | undefined {
  if (!_map || _state !== "ready") return undefined;
  if (!_map.getLayer(layerId)) return undefined;
  const layout = _map.getLayoutProperty(layerId, "visibility");
  return layout === "none" ? "none" : "visible";
}

// Same real-but-read-only principle as getLayerVisibility above — opacity
// and pattern are genuine live Mapbox paint properties, just not wired for
// editing through the palette system yet.
export function getLayerPaintInfo(layerId: string, layerType: string | undefined): { opacity?: unknown; pattern?: unknown } {
  if (!_map || _state !== "ready" || !layerType) return {};
  if (!_map.getLayer(layerId)) return {};
  const opacityProp = layerType === "fill" ? "fill-opacity" : layerType === "line" ? "line-opacity" : layerType === "circle" ? "circle-opacity" : layerType === "symbol" ? "icon-opacity" : undefined;
  const patternProp = layerType === "fill" ? "fill-pattern" : layerType === "line" ? "line-pattern" : undefined;
  return {
    opacity: opacityProp ? _map.getPaintProperty(layerId, opacityProp) : undefined,
    pattern: patternProp ? _map.getPaintProperty(layerId, patternProp) : undefined,
  };
}

// ── Itinerary overlay (0729E) ─────────────────────────────────────────────────
// Strictly static: numbered stop pins + the selected route's geometry as a
// plain GeoJSON LineString. No animation beyond one instant (non-animated)
// fitBounds when the stop list changes, no vehicle/playhead rendering, no
// route-alternative cards, no cinematic presentation. Since this is the ONE
// shared preview map instance (also used by Geographic/Vehicles/Overlays),
// clearItineraryOverlay() must be called on the editor's unmount so these
// layers never linger into an unrelated detail view.

const PINS_SOURCE_ID = "itinerary-stops";
const PINS_CIRCLE_LAYER_ID = "itinerary-stops-circle";
const PINS_LABEL_LAYER_ID = "itinerary-stops-label";
const ROUTE_SOURCE_ID = "itinerary-route";
const ROUTE_LAYER_ID = "itinerary-route-line";

export type ItineraryPin = { id: string; longitude: number; latitude: number; label: string };

function pinsGeoJSON(pins: ItineraryPin[]) {
  return {
    type: "FeatureCollection",
    features: pins.map((p) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.longitude, p.latitude] },
      properties: { label: p.label },
    })),
  };
}

export function setItineraryPins(pins: ItineraryPin[]): void {
  if (!_map || _state !== "ready") return;
  const data = pinsGeoJSON(pins);
  const existing = _map.getSource(PINS_SOURCE_ID);
  if (existing) {
    existing.setData(data);
  } else {
    _map.addSource(PINS_SOURCE_ID, { type: "geojson", data });
    _map.addLayer({
      id: PINS_CIRCLE_LAYER_ID,
      type: "circle",
      source: PINS_SOURCE_ID,
      paint: { "circle-radius": 10, "circle-color": "#ff6a3d", "circle-stroke-width": 2, "circle-stroke-color": "#ffffff" },
    });
    _map.addLayer({
      id: PINS_LABEL_LAYER_ID,
      type: "symbol",
      source: PINS_SOURCE_ID,
      layout: { "text-field": ["get", "label"], "text-size": 11, "text-allow-overlap": true },
      paint: { "text-color": "#ffffff" },
    });
  }

  if (pins.length > 0) {
    let minLng = pins[0].longitude, maxLng = pins[0].longitude;
    let minLat = pins[0].latitude, maxLat = pins[0].latitude;
    for (const p of pins) {
      minLng = Math.min(minLng, p.longitude); maxLng = Math.max(maxLng, p.longitude);
      minLat = Math.min(minLat, p.latitude); maxLat = Math.max(maxLat, p.latitude);
    }
    try {
      _map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 48, animate: false, maxZoom: 14 });
    } catch { /* fitBounds on a degenerate (single-point) bounds box is non-fatal */ }
  }
}

// One LineString per stage's SELECTED route (a real itinerary may have
// several legs) — never a synthetic single line spanning stages that were
// never actually routed together. An empty array clears the layer's data
// without removing it.
export function setItineraryRouteLines(geometries: Array<{ type: "LineString"; coordinates: [number, number][] }>): void {
  if (!_map || _state !== "ready") return;
  const data = {
    type: "FeatureCollection",
    features: geometries.map((g) => ({ type: "Feature", properties: {}, geometry: g })),
  };
  const existing = _map.getSource(ROUTE_SOURCE_ID);
  if (existing) {
    existing.setData(data);
  } else {
    _map.addSource(ROUTE_SOURCE_ID, { type: "geojson", data });
    // Insert below the pins circle layer (if it already exists) so pins
    // always render on top of the route line, regardless of add order.
    const beforeId = _map.getLayer(PINS_CIRCLE_LAYER_ID) ? PINS_CIRCLE_LAYER_ID : undefined;
    _map.addLayer({
      id: ROUTE_LAYER_ID,
      type: "line",
      source: ROUTE_SOURCE_ID,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#ff6a3d", "line-width": 3 },
    }, beforeId);
  }
}

export function clearItineraryOverlay(): void {
  if (!_map || _state !== "ready") return;
  for (const layerId of [PINS_CIRCLE_LAYER_ID, PINS_LABEL_LAYER_ID, ROUTE_LAYER_ID]) {
    if (_map.getLayer(layerId)) { try { _map.removeLayer(layerId); } catch { /* already gone */ } }
  }
  for (const sourceId of [PINS_SOURCE_ID, ROUTE_SOURCE_ID]) {
    if (_map.getSource(sourceId)) { try { _map.removeSource(sourceId); } catch { /* already gone */ } }
  }
}

// ── Race Lane overlay (0805D) ─────────────────────────────────────────────────
// Own source/layer ids (race-lane-*) — deliberately separate from the
// itinerary-* overlay above so the two overlay kinds can never collide.
// Rendered ADDITIVELY on top of the course's own start/checkpoints/finish/
// centerline overlay (MapsRaceCourseDetail.tsx keeps that effect running
// unchanged) — the lane's own smoothed geometry becomes the visually
// dominant layer without requiring a second map runtime or a hard swap.
//
// Callers MUST feed the DECIMATED preview point set from
// raceLanePreviewGeometry.ts — never the full-resolution stored
// sampledCenterline (raceLaneTypes.ts) — this module has no opinion on that,
// it only draws whatever GeoJSON it is given.
//
// Preview modes (decided by the caller, not here):
//   invisible -> pins only, empty lines/trackPolygon
//   guide     -> centerline + lane-divider lines + start-grid/finish pins, no track fill
//   track     -> same as guide, PLUS a real translucent filled polygon band

const LANE_PINS_SOURCE_ID = "race-lane-markers";
const LANE_PINS_CIRCLE_LAYER_ID = "race-lane-markers-circle";
const LANE_PINS_LABEL_LAYER_ID = "race-lane-markers-label";
const LANE_LINES_SOURCE_ID = "race-lane-lines";
const LANE_LINES_LAYER_ID = "race-lane-lines-line";
const LANE_TRACK_SOURCE_ID = "race-lane-track";
const LANE_TRACK_FILL_LAYER_ID = "race-lane-track-fill";

export type RaceLaneOverlayLine = { type: "LineString"; coordinates: [number, number][] };
export type RaceLaneOverlayPolygon = { type: "Polygon"; coordinates: [number, number][][] } | null;

export interface RaceLaneOverlayInput {
  pins: ItineraryPin[];
  lines: RaceLaneOverlayLine[];
  trackPolygon: RaceLaneOverlayPolygon;
}

export function setRaceLaneOverlay({ pins, lines, trackPolygon }: RaceLaneOverlayInput): void {
  if (!_map || _state !== "ready") return;

  const pinsData = pinsGeoJSON(pins);
  const existingPins = _map.getSource(LANE_PINS_SOURCE_ID);
  if (existingPins) {
    existingPins.setData(pinsData);
  } else {
    _map.addSource(LANE_PINS_SOURCE_ID, { type: "geojson", data: pinsData });
    _map.addLayer({
      id: LANE_PINS_CIRCLE_LAYER_ID,
      type: "circle",
      source: LANE_PINS_SOURCE_ID,
      paint: { "circle-radius": 7, "circle-color": "#3d8bff", "circle-stroke-width": 2, "circle-stroke-color": "#ffffff" },
    });
    _map.addLayer({
      id: LANE_PINS_LABEL_LAYER_ID,
      type: "symbol",
      source: LANE_PINS_SOURCE_ID,
      layout: { "text-field": ["get", "label"], "text-size": 10, "text-allow-overlap": true, "text-offset": [0, 1.2] },
      paint: { "text-color": "#3d8bff" },
    });
  }

  const linesData = {
    type: "FeatureCollection",
    features: lines.map((g) => ({ type: "Feature", properties: {}, geometry: g })),
  };
  const existingLines = _map.getSource(LANE_LINES_SOURCE_ID);
  if (existingLines) {
    existingLines.setData(linesData);
  } else {
    _map.addSource(LANE_LINES_SOURCE_ID, { type: "geojson", data: linesData });
    _map.addLayer({
      id: LANE_LINES_LAYER_ID,
      type: "line",
      source: LANE_LINES_SOURCE_ID,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#3d8bff", "line-width": 1.5 },
    });
  }

  const trackData = {
    type: "FeatureCollection",
    features: trackPolygon ? [{ type: "Feature", properties: {}, geometry: trackPolygon }] : [],
  };
  const existingTrack = _map.getSource(LANE_TRACK_SOURCE_ID);
  if (existingTrack) {
    existingTrack.setData(trackData);
  } else {
    _map.addSource(LANE_TRACK_SOURCE_ID, { type: "geojson", data: trackData });
    // Inserted below the lines layer (if present) so the fill never obscures
    // the divider lines / centerline drawn on top of it.
    const beforeId = _map.getLayer(LANE_LINES_LAYER_ID) ? LANE_LINES_LAYER_ID : undefined;
    _map.addLayer({
      id: LANE_TRACK_FILL_LAYER_ID,
      type: "fill",
      source: LANE_TRACK_SOURCE_ID,
      paint: { "fill-color": "#3d8bff", "fill-opacity": 0.22 },
    }, beforeId);
  }
}

export function clearRaceLaneOverlay(): void {
  if (!_map || _state !== "ready") return;
  for (const layerId of [LANE_PINS_CIRCLE_LAYER_ID, LANE_PINS_LABEL_LAYER_ID, LANE_LINES_LAYER_ID, LANE_TRACK_FILL_LAYER_ID]) {
    if (_map.getLayer(layerId)) { try { _map.removeLayer(layerId); } catch { /* already gone */ } }
  }
  for (const sourceId of [LANE_PINS_SOURCE_ID, LANE_LINES_SOURCE_ID, LANE_TRACK_SOURCE_ID]) {
    if (_map.getSource(sourceId)) { try { _map.removeSource(sourceId); } catch { /* already gone */ } }
  }
}
