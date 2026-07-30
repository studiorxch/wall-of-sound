// ── wallMapPreview ────────────────────────────────────────────────────────────
// 0729_STUDIORICH_Centralized_Library_MAPS_Integration
//
// One shared, dockable Mapbox preview instance for the centralized Library's
// MAPS interface — ported from wall/maps/palettesGallery.js's proven
// _ensurePreviewMap/dock/undock/retry pattern (that file is the migration
// reference this build is required to preserve, §4). This is NOT a second
// map runtime: it reads the same WOS style and the same
// window.SBE.MapsPaletteAuthority/Registry that drive the live Broadcast
// map, and there is exactly one instance shared by every card thumbnail and
// the detail view's live preview — never one map per card.
//
// Mapbox GL JS/CSS and the access token are loaded lazily, from Wall's own
// files via the /wall-app proxy (vite.config.ts) — nothing is duplicated or
// re-hosted; MUSIC's core app never depends on any of this being present.

import { ensureInitialized } from "./wallPaletteBridge";

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
