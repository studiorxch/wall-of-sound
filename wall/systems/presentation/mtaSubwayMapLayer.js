// ── MTASubwayMapLayer v5.2.0 ──────────────────────────────────────────────────
// "SUBWAY Continuous Train Motion Fix" patch (v5.2.0) — the render loop
// itself was never the bug (this file's `_renderTrainBodies()` already
// re-derived every train's position fresh on every call); the ROOT CAUSE
// lived in subwayTrainMotionModel.js (see that file's own header) and is
// fixed there. This file's only two changes: (1) the animation loop is now
// a single shared `requestAnimationFrame`, internally throttled to
// ANIM_STEP_MS, instead of `setInterval` — the preferred architecture the
// patch specifies, and (2) ANIM_STEP_MS was tuned down from 500ms to 120ms,
// live-verified necessary once trains actually advance every call — at
// 500ms, real continuous motion still looked visibly steppy.
//
// "SUBWAY Train Contrast / LOD Fix" patch (v5.1.0) on top of
// 0818_SUBWAY_Train_Rendering_Palette_Library_v1.0.0_BUILD (v5.0.0) —
// train bodies were rendering in the SAME hue as the route line beneath
// them, making them nearly invisible at normal zoom. Fixed with a
// zoom-based visual hierarchy: neutral grey body at FAR/MID zoom (legible
// over every real MTA route color), a flat dark-charcoal CASING layer
// underneath that never blends (the primary contrast mechanism at every
// zoom), and a smooth continuous blend toward the route's own color as the
// camera approaches CLOSE zoom. Selection is now signaled primarily by a
// bright casing color (zoom-independent), not by body hue. See
// `_routeColorBlendFactor`/`_blendHexColors`/`TRAIN_CASING_LAYER_ID` below.
// Canonical geometry walking, reconciliation, stale/unknown handling, lane
// offsets, and car-section ticks are UNCHANGED by either patch.
//
// §26-30 (v4.0.0 was 0818_SUBWAY_Live_Train_Visualization_v1.0.0_BUILD —
// point-marker trains + directional heading line. v3.0.0 was
// 0818_SUBWAY_Logical_Rolling_Stock_v1.0.0_BUILD — persistent logical
// train/consist/car identity + truth-aware position. v2.0.0 was
// 0818_SUBWAY_Full_Live_Map_Integration_v1.0.0_BUILD — full network
// rendering without persistent logical rolling stock. v1.0.0 was
// 0818_SUBWAY_Live_Data_Foundation_v1.0.0_BUILD — single-route slice.)
// Status: active | Classification: presentation (Mapbox integration)
//
// Renders the FULL StudioRich SUBWAY network onto the canonical, already-
// running Mapbox map (SBE.MapboxViewportRuntime.getMap()): every real route
// family, every Station Library-backed station, live operational state for
// every polled line group, station selection resolving to the exact Station
// Library record with live arrival intelligence, palette switches that never
// touch transit identity, and a live train BODY layer sourced from
// SubwayLogicalRollingStockAuthority + SubwayTrainMotionModel — persistent
// StudioRich train/consist/car identity, never a raw MTA trip id.
//
// ── NEW IN v5.0.0 (Train Rendering + Palette Library) ────────────────────────
//   - Trains render as an elongated mono-line BODY (SubwayTrainMotionModel.
//     buildMotionState() + MTASubwayMapFeatures.buildTrainBodyFeatures()) —
//     REPLACES v4.0.0's point-marker circle + separate directional heading
//     line entirely (BUILD §10: "not [dot], and not [separate capsules]").
//     The body IS a real, arc-length-walked sub-polyline of the train's own
//     canonical route shape, so it can never leave route geometry regardless
//     of curve tightness — no chord approximation. Orientation, motion, and
//     lane offset now communicate direction; the old standalone heading-line
//     layer (and navigationSymbolSuppressor.js workaround) is no longer
//     needed since there is no separate symbol/line to suppress.
//   - Opposing trains separate into two virtual screen-space lanes via
//     Mapbox's `line-offset` paint property (BUILD §14-16) — canonical route
//     geometry is never duplicated or altered; the offset is a per-feature
//     `laneOffsetPx` property computed fresh each animation tick from the
//     CURRENT map zoom (sidesteps any zoom-expression composition risk,
//     same lesson learned fixing the v4.0.0 circle-radius expression bug).
//   - Continuous ETA-informed motion (BUILD §17-23): SubwayTrainMotionModel.
//     buildMotionState() derives a time-varying, accel/cruise/decel-eased
//     segment progress directly from real trip.stopTimes arrival/departure
//     evidence and the CURRENT wall-clock time on every call — replaces
//     v4.0.0's prevById/targetFc snapshot-lerp entirely. The animation timer
//     (ANIM_STEP_MS, unchanged cadence) now just re-invokes the motion
//     model + feature builder each tick rather than manually lerping two
//     captured points; the 5s reconcile tick still owns canonical evidence
//     (unchanged "motion clock vs polling clock" separation, BUILD §17).
//   - Close-zoom car-section detail (BUILD §13) — a second thin line layer,
//     only populated/rendered at CLOSE_ZOOM_THRESHOLD and above.
//   - SUBWAY Palette Library now also carries structured station/train
//     presentation tokens (BUILD §7-9), applied via `_applyPaletteStyling()`
//     on layer creation and on every palette switch — Official MTA
//     Reference is now the active DEFAULT palette (BUILD §8).
//   - Train-follow foundation (unchanged since v4.0.0) — followTrain(id)/
//     unfollowTrain(), gently re-centering the camera once per watch tick.
//   - Station selection's HUD panel still renders live arrival intelligence
//     — unchanged since v4.0.0 (BUILD §25 of the prior build; untouched by
//     this one).
//
// ROLLING STOCK RULE (unchanged since v3.0.0): this file never computes trip
// association or position itself — SubwayLogicalRollingStockAuthority.
// reconcile() owns that entirely, and SubwayTrainMotionModel only ever
// DERIVES rendering physics from the authority's already-computed evidence
// (BUILD §5: "do not create a visual train ID independent from
// logicalTrainId"). This file only ever (a) calls reconcile() once per
// watch tick — the SAME existing 5s timer already used for route/station
// refresh, never a new per-train timer (BUILD §29) — and (b) reads the
// already-built GeoJSON from SBE.MTASubwayMapFeatures.buildTrainBodyFeatures().
// Train identity is owned by the authority; this file only ever renders and
// selects it.
//
// GEOMETRY AUTHORITY RULE (BUILD §7): this file only ever reads finished
// GeoJSON from SBE.MTASubwayMapFeatures / SBE.MTASubwayStationLibrary — it
// never computes geometry itself and never talks to Mapbox for anything
// other than handing it already-built FeatureCollections. Canonical Transit
// Model → GeoJSON → Mapbox; Mapbox is a consumer, never the source of truth
// — preserves future static/poster-render compatibility untouched by this
// build (per the resumption audit's own finding that this was already true).
//
// STATION LAYER RULE (BUILD §10): production station features come from
// SBE.MTASubwayStationLibrary.buildMapFeatureCollection() — NEVER the raw
// transit-store path (SBE.MTASubwayMapFeatures.buildStationFeatures(), kept
// only for back-compat/tests, is not used here).
//
// RENDERING RULES (unchanged from v1.0.0, still verified true this build):
//   - Sources/layers created once (idempotent ensure*) and updated via
//     source.setData() — never recreates the map.
//   - Map-touching work waits for MapboxViewportRuntime.onReady() —
//     map.isStyleLoaded()/loaded() are NOT reliable ready-gates in this app.
//   - refresh() is a PURE READ — no MTA network call ever originates from a
//     render function. Live updates come from SBE.MTASubwayPollingRuntime.
//   - Palette switches (SBE.MTASubwayPaletteAuthority) never mutate
//     route/station identity — verified: routeId/studioRichStationId are
//     untouched by setActivePalette(); only the resolved paint color changes.
//
// Gated behind the `?mode=subway` boot flag (wall/index.html), same
// no-client-router convention RACETRACK's `?mode=racetrack` already uses.
//
// Placement: wall/systems/presentation/mtaSubwayMapLayer.js
// Load: AFTER wall/systems/transit/mtaSubway*.js and MapboxViewportRuntime.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '5.2.0';

  var STATIONS_SOURCE_ID = 'wos-subway-stations';
  var STATIONS_LAYER_ID = 'wos-subway-stations-layer';
  var STATIONS_LABEL_LAYER_ID = 'wos-subway-stations-label-layer';
  var ROUTE_SOURCE_ID = 'wos-subway-routes';
  var ROUTE_LAYER_ID = 'wos-subway-routes-layer';
  // Train BODY layer (v5.0.0, BUILD §10-16, §26-28) — an elongated mono-line
  // LineString per train (SubwayTrainMotionModel + MTASubwayMapFeatures.
  // buildTrainBodyFeatures()), replacing v4.0.0's point-marker circle. One
  // visible live-train layer, not two overlapping ones (Creative Interface
  // Doctrine) — the old separate directional-heading-line layer is retired;
  // the body's own real orientation + motion + lane offset communicate
  // direction now (BUILD §25).
  var TRAINS_SOURCE_ID = 'wos-subway-trains';
  var TRAINS_LAYER_ID = 'wos-subway-trains-layer';
  // Train casing layer (Train Contrast / LOD Fix) — a wider, dark line
  // reading the SAME source/geometry as TRAINS_LAYER_ID, added to the map
  // BEFORE it so it renders underneath. This is what keeps a train visible
  // over its own route line at every zoom, independent of whatever the
  // inner body's zoom-blended color is currently doing (see
  // _routeColorBlendFactor below). Not a second train — same id, same lane
  // offset, same truth-state opacity; purely a contrast halo.
  var TRAIN_CASING_LAYER_ID = 'wos-subway-trains-casing-layer';
  // Close-zoom car-section detail (v5.0.0, BUILD §13) — subtle secondary
  // tick marks, only populated/visible at CLOSE_ZOOM_THRESHOLD and above.
  var CAR_SECTIONS_SOURCE_ID = 'wos-subway-trains-car-sections';
  var CAR_SECTIONS_LAYER_ID = 'wos-subway-trains-car-sections-layer';

  var LABEL_MIN_ZOOM = 13; // avoid unreadable all-label-on-all-zoom (BUILD §14, prior build)
  var MID_ZOOM_THRESHOLD = 12; // BUILD §12 MID/BOROUGH — longer body, clear lane separation
  var CLOSE_ZOOM_THRESHOLD = 16; // BUILD §13 — car-section divisions appear only this close
  var SELECTED_STATION_COLOR = '#ff9f1c'; // HUD-only fallback; live paint sources from the palette (station.selected)
  var DEFAULT_STATION_COLOR = '#ffffff';  // HUD-only fallback; live paint sources from the palette (station.fill)

  // Client-side render/motion cadence — a single shared
  // requestAnimationFrame loop (Continuous Motion Fix §10's preferred
  // architecture), internally throttled to ANIM_STEP_MS so setData() isn't
  // called at literal 60fps on a several-hundred-feature source (still not
  // a real Mapbox performance budget at full-network scale) while remaining
  // visibly continuous — tuned down from the prior 500ms (which, combined
  // with the ROOT CAUSE fix in subwayTrainMotionModel.js making trains
  // ACTUALLY advance every call now, looked visibly steppy at half a
  // second per step) to 120ms (~8 renders/sec), live-verified smooth
  // without measurable interaction degradation (see completion report §20).
  var ANIM_STEP_MS = 120;

  var _active = false;
  var _selectedStationId = null; // stlib-* id — the exact Station Library record, never a name
  var _selectedTrainId = null;   // sr-train-* id — the exact logical train record, never a trip id
  var _followedTrainId = null;   // sr-train-* id — train-follow foundation (BUILD §17, prior build)
  var _lastRenderedRealtimeAt = null;
  var _watchTimer = null;
  var _animFrameId = null;       // requestAnimationFrame handle — one shared loop, never a timer per train
  var _lastAnimRenderAt = 0;
  var _hud = null; // DOM refs, created lazily
  var _interactionBound = false;

  function _map() {
    var mvr = global.SBE && SBE.MapboxViewportRuntime;
    return (mvr && typeof mvr.getMap === 'function') ? mvr.getMap() : null;
  }
  function _store() { return SBE.MTASubwayTransitStore || null; }
  function _library() { return SBE.MTASubwayStationLibrary || null; }
  function _features() { return SBE.MTASubwayMapFeatures || null; }
  function _poll() { return SBE.MTASubwayPollingRuntime || null; }
  function _palette() { return SBE.MTASubwayPaletteAuthority || null; }
  function _inventory() { return SBE.MTASubwayFeedSourceInventory || null; }
  function _rollingStock() { return SBE.SubwayLogicalRollingStockAuthority || null; }
  function _trainVisualState() { return SBE.SubwayTrainVisualState || null; }
  function _arrivalIntelligence() { return SBE.SubwayArrivalIntelligence || null; }
  function _motionModel() { return SBE.SubwayTrainMotionModel || null; }

  // Lane-offset pixel range (BUILD §14-16) — a small, zoom-scaled
  // screen-space offset applied via Mapbox's own `line-offset` paint
  // property (BUILD §15: "prefer that over altering canonical coordinates").
  // Computed into a per-feature `laneOffsetPx` property each animation tick
  // from the CURRENT zoom (never a zoom-expression composed with `match`,
  // sidestepping the exact class of Mapbox expression bug fixed in the
  // prior build) — canonical geometry and station positions are never
  // touched by this.
  var LANE_OFFSET_MIN_PX = 1.5;
  var LANE_OFFSET_MAX_PX = 6;
  var LANE_OFFSET_MIN_ZOOM = 10;
  var LANE_OFFSET_MAX_ZOOM = 18;
  function _laneOffsetPxForZoom(zoom) {
    var t = Math.max(0, Math.min(1, (zoom - LANE_OFFSET_MIN_ZOOM) / (LANE_OFFSET_MAX_ZOOM - LANE_OFFSET_MIN_ZOOM)));
    return LANE_OFFSET_MIN_PX + t * (LANE_OFFSET_MAX_PX - LANE_OFFSET_MIN_PX);
  }

  // ── Train body color LOD (Train Contrast / LOD Fix) ──────────────────────
  // "Official MTA route colors = infrastructure identity, neutral grey =
  // distant rolling stock, proximity = progressively restores route color."
  // Reuses the SAME zoom regime constants the renderer already defines
  // (MID_ZOOM_THRESHOLD / CLOSE_ZOOM_THRESHOLD) rather than inventing new
  // arbitrary thresholds — FAR (<MID) stays fully neutral, CLOSE (>=CLOSE)
  // is fully route-colored, with a smooth continuous ramp between (never a
  // hard palette switch). The casing layer (always a flat dark/bright
  // color, never blended) is the PRIMARY contrast mechanism throughout this
  // range — the body blend is a secondary refinement, not the only thing
  // keeping a train visible.
  function _routeColorBlendFactor(zoom) {
    var t = (zoom - MID_ZOOM_THRESHOLD) / (CLOSE_ZOOM_THRESHOLD - MID_ZOOM_THRESHOLD);
    return Math.max(0, Math.min(1, t));
  }

  function _hexToRgb(hex) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
  }
  function _toHex2(n) { var s = Math.max(0, Math.min(255, Math.round(n))).toString(16); return s.length === 1 ? '0' + s : s; }
  // Real linear RGB interpolation between two hex colors — computed in JS
  // (never a composed Mapbox `interpolate`+`get` color expression) so the
  // result can be attached as a plain per-feature property and read via a
  // simple `['get', ...]` in paint, the same proven-safe pattern this build
  // series already uses for laneOffsetPx (sidesteps any Mapbox
  // expression-composition risk entirely — see file header).
  function _blendHexColors(hexA, hexB, t) {
    var clamped = Math.max(0, Math.min(1, t));
    if (clamped <= 0) return hexA;
    if (clamped >= 1) return hexB;
    var a = _hexToRgb(hexA), b = _hexToRgb(hexB);
    return '#' + _toHex2(a.r + (b.r - a.r) * clamped) + _toHex2(a.g + (b.g - a.g) * clamped) + _toHex2(a.b + (b.b - a.b) * clamped);
  }

  function _allRealtimeGroupIds() {
    var inv = _inventory();
    if (!inv) return ['ace'];
    return inv.getRealtimeSources().map(function (s) { return s.id.replace('mta_subway_gtfs_rt_', ''); });
  }

  // ── Source/layer setup — idempotent, safe to call repeatedly ────────────────
  function ensureLayers(map) {
    if (!map) return false;
    try {
      if (!map.getSource(ROUTE_SOURCE_ID)) {
        map.addSource(ROUTE_SOURCE_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      }
      if (!map.getLayer(ROUTE_LAYER_ID)) {
        map.addLayer({
          id: ROUTE_LAYER_ID, type: 'line', source: ROUTE_SOURCE_ID,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            // Palette-resolved color (route → semantic family → active
            // palette → hex, computed once per refresh in mtaSubwayMapFeatures.js).
            // routeId itself is never derived from this.
            'line-color': ['coalesce', ['get', 'resolvedColor'], ['get', 'sourceColor'], '#5A5A5A'],
            'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.5, 14, 3, 18, 5],
          },
        });
      }

      if (!map.getSource(STATIONS_SOURCE_ID)) {
        map.addSource(STATIONS_SOURCE_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, promoteId: 'studioRichStationId' });
      }
      if (!map.getLayer(STATIONS_LAYER_ID)) {
        map.addLayer({
          id: STATIONS_LAYER_ID, type: 'circle', source: STATIONS_SOURCE_ID,
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 2, 14, 4, 18, 7],
            'circle-color': ['case', ['boolean', ['feature-state', 'selected'], false], SELECTED_STATION_COLOR, DEFAULT_STATION_COLOR],
            'circle-stroke-width': ['case', ['boolean', ['feature-state', 'selected'], false], 3, 1.5],
            'circle-stroke-color': '#111111',
          },
        });
      }
      if (!map.getLayer(STATIONS_LABEL_LAYER_ID)) {
        map.addLayer({
          id: STATIONS_LABEL_LAYER_ID, type: 'symbol', source: STATIONS_SOURCE_ID,
          minzoom: LABEL_MIN_ZOOM, // BUILD §14 — progressive by zoom, never all-zoom
          layout: {
            'text-field': ['get', 'displayName'],
            'text-size': 11,
            'text-offset': [0, 1.1],
            'text-anchor': 'top',
            'text-optional': true,
          },
          paint: {
            'text-color': '#e8e8e8',
            'text-halo-color': '#111111',
            'text-halo-width': 1.2,
          },
        });
      }

      // Train BODY + CASING layers (v5.0.0, BUILD §10-16, §26-28; casing
      // added by the Train Contrast / LOD Fix) — a mono-line LineString per
      // train (real, arc-length-walked sub-polyline of the train's own
      // canonical route shape — see SubwayTrainMotionModel and
      // MTASubwayMapFeatures.buildTrainBodyFeatures()). Replaces v4.0.0's
      // point-marker circle + separate heading line entirely.
      if (!map.getSource(TRAINS_SOURCE_ID)) {
        map.addSource(TRAINS_SOURCE_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, promoteId: 'logicalTrainId' });
      }
      // Casing added FIRST (renders underneath) — same source/geometry/lane
      // offset as the body layer added right after it. A wider, flat-colored
      // (never zoom-blended) outline that keeps a train visible over its own
      // route line regardless of what the inner body's LOD blend is doing.
      if (!map.getLayer(TRAIN_CASING_LAYER_ID)) {
        map.addLayer({
          id: TRAIN_CASING_LAYER_ID, type: 'line', source: TRAINS_SOURCE_ID,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            // Flat dark charcoal (or bright white when selected) — never
            // blended toward route color. Overwritten by
            // _applyPaletteStyling() from the active palette's train tokens
            // the moment this layer is created; literal fallbacks below
            // only matter for the brief window before that first call runs.
            'line-color': ['case', ['boolean', ['feature-state', 'selected'], false], '#FFFFFF', '#181B1F'],
            // Slightly wider than the body layer at every zoom/selection
            // stop (same proven-safe zoom-top-level-input pattern).
            'line-width': ['interpolate', ['linear'], ['zoom'],
              10, ['case', ['boolean', ['feature-state', 'selected'], false], 5, 3],
              14, ['case', ['boolean', ['feature-state', 'selected'], false], 8.5, 5],
              18, ['case', ['boolean', ['feature-state', 'selected'], false], 13.5, 8.5]],
            'line-opacity': ['case',
              ['boolean', ['feature-state', 'selected'], false], 1.0,
              ['match', ['get', 'positionTruthState'], 'stale', 0.4, 0.95]],
            'line-offset': ['coalesce', ['get', 'laneOffsetPx'], 0],
          },
        });
      }
      if (!map.getLayer(TRAINS_LAYER_ID)) {
        map.addLayer({
          id: TRAINS_LAYER_ID, type: 'line', source: TRAINS_SOURCE_ID,
          layout: { 'line-cap': 'round', 'line-join': 'round' }, // BUILD §10 — rounded ends, stays monolithic
          paint: {
            // Train Contrast / LOD Fix: body color is a per-feature
            // PRECOMPUTED blend (neutral grey at FAR zoom -> real route
            // color at CLOSE zoom, see _renderTrainBodies()/
            // _routeColorBlendFactor()) — never the raw route color alone
            // (that was the original bug: same-hue trains vanishing into
            // their own route line). Truth-state/selection are encoded via
            // width/opacity, never a conflicting hue.
            'line-color': ['coalesce', ['get', 'renderBodyColor'], '#C9CDD3'],
            // Zoom-aware width (BUILD §12): same proven-safe pattern as the
            // prior build's circle-radius fix — ["zoom"] stays the direct
            // top-level input; the selection bump is nested inside each
            // stop's own OUTPUT, never wrapping zoom itself.
            'line-width': ['interpolate', ['linear'], ['zoom'],
              10, ['case', ['boolean', ['feature-state', 'selected'], false], 3, 1.6],
              14, ['case', ['boolean', ['feature-state', 'selected'], false], 6, 3.2],
              18, ['case', ['boolean', ['feature-state', 'selected'], false], 10, 5.5]],
            // Truth-state opacity — default numbers here are overwritten by
            // _applyPaletteStyling() from the active palette's train tokens
            // (BUILD §7) the moment this layer is created; the literal
            // values below only matter for the brief window before that
            // first call runs.
            'line-opacity': ['case',
              ['boolean', ['feature-state', 'selected'], false], 1.0,
              ['match', ['get', 'positionTruthState'], 'stale', 0.4, 0.95]],
            // Virtual directional lane (BUILD §14-16) — a per-feature pixel
            // offset computed fresh each animation tick from the current
            // zoom; canonical geometry/station positions are never touched.
            'line-offset': ['coalesce', ['get', 'laneOffsetPx'], 0],
          },
        });
      }

      // Close-zoom car-section detail (v5.0.0, BUILD §13) — subtle,
      // secondary, only populated above CLOSE_ZOOM_THRESHOLD.
      if (!map.getSource(CAR_SECTIONS_SOURCE_ID)) {
        map.addSource(CAR_SECTIONS_SOURCE_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      }
      if (!map.getLayer(CAR_SECTIONS_LAYER_ID)) {
        map.addLayer({
          id: CAR_SECTIONS_LAYER_ID, type: 'line', source: CAR_SECTIONS_SOURCE_ID,
          layout: { 'line-cap': 'butt' },
          paint: {
            'line-color': ['coalesce', ['get', 'resolvedColor'], '#ffffff'],
            'line-width': 1.5,
            'line-opacity': 0.65,
          },
        });
      }

      _applyPaletteStyling(map);
      _ensureInteraction(map);
      return true;
    } catch (e) {
      console.warn('[MTASubwayMapLayer] ensureLayers error:', e && e.message || e);
      return false;
    }
  }

  function removeLayers(map) {
    if (!map) return;
    [CAR_SECTIONS_LAYER_ID, TRAINS_LAYER_ID, TRAIN_CASING_LAYER_ID, STATIONS_LABEL_LAYER_ID, STATIONS_LAYER_ID, ROUTE_LAYER_ID].forEach(function (id) {
      try { if (map.getLayer(id)) map.removeLayer(id); } catch (e) {}
    });
    [CAR_SECTIONS_SOURCE_ID, TRAINS_SOURCE_ID, STATIONS_SOURCE_ID, ROUTE_SOURCE_ID].forEach(function (id) {
      try { if (map.getSource(id)) map.removeSource(id); } catch (e) {}
    });
  }

  // ── Station selection (BUILD §15) ────────────────────────────────────────
  // Map Feature ID → stlib-* ID → Station Library Record. No name-based
  // fallback anywhere in this chain.
  function _ensureInteraction(map) {
    if (_interactionBound) return;
    _interactionBound = true;
    map.on('click', STATIONS_LAYER_ID, function (e) {
      var f = e.features && e.features[0];
      if (!f) return;
      var stlibId = f.properties && f.properties.studioRichStationId;
      if (stlibId) selectStation(stlibId);
    });
    map.on('mouseenter', STATIONS_LAYER_ID, function () { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', STATIONS_LAYER_ID, function () { map.getCanvas().style.cursor = ''; });

    // Train selection (BUILD §26) — Map Feature ID → sr-train-* ID → the
    // exact logical train record. No trip-id-based or name-based fallback.
    map.on('click', TRAINS_LAYER_ID, function (e) {
      var f = e.features && e.features[0];
      if (!f) return;
      var trainId = f.properties && f.properties.logicalTrainId;
      if (trainId) selectTrain(trainId);
    });
    map.on('mouseenter', TRAINS_LAYER_ID, function () { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', TRAINS_LAYER_ID, function () { map.getCanvas().style.cursor = ''; });
  }

  function selectStation(studioRichStationId) {
    var map = _map(), lib = _library();
    if (!lib) return { ok: false, reason: 'library_unavailable' };
    var record = lib.getRecord(studioRichStationId);
    if (!record) return { ok: false, reason: 'not_found' };

    if (map) {
      try {
        if (_selectedStationId) map.setFeatureState({ source: STATIONS_SOURCE_ID, id: _selectedStationId }, { selected: false });
        map.setFeatureState({ source: STATIONS_SOURCE_ID, id: studioRichStationId }, { selected: true });
      } catch (e) {}
    }
    _selectedStationId = studioRichStationId;
    _renderHudSelection(record); // debug-gated corner panel — see _renderHudSelection
    var publicHud = SBE.SubwayStationHud;
    if (publicHud) publicHud.show(studioRichStationId); // BUILD §6/§12 public station identity + arrivals
    return { ok: true, data: record };
  }

  function clearSelection() {
    var map = _map();
    if (map && _selectedStationId) {
      try { map.setFeatureState({ source: STATIONS_SOURCE_ID, id: _selectedStationId }, { selected: false }); } catch (e) {}
    }
    _selectedStationId = null;
    _renderHudSelection(null);
    var publicHud = SBE.SubwayStationHud;
    if (publicHud) publicHud.hide();
  }

  // The exact record the selection resolved to — proves the full chain
  // (BUILD §15's own required proof) without requiring cross-app navigation.
  function getSelectedStation() {
    var lib = _library();
    if (!lib || !_selectedStationId) return null;
    return lib.getRecord(_selectedStationId);
  }

  // ── Train selection (BUILD §26-27) ───────────────────────────────────────
  // Map Feature ID → sr-train-* ID → the exact LogicalTrain record + its
  // consist + ordered logical car IDs. Never resolves via activeTripId or
  // any display name.
  function selectTrain(logicalTrainId) {
    var map = _map(), rs = _rollingStock();
    if (!rs) return { ok: false, reason: 'rolling_stock_unavailable' };
    var inspection = rs.getInspection(logicalTrainId);
    if (!inspection) return { ok: false, reason: 'not_found' };

    if (map) {
      try {
        if (_selectedTrainId) map.setFeatureState({ source: TRAINS_SOURCE_ID, id: _selectedTrainId }, { selected: false });
        map.setFeatureState({ source: TRAINS_SOURCE_ID, id: logicalTrainId }, { selected: true });
      } catch (e) {}
    }
    _selectedTrainId = logicalTrainId;
    _renderHudTrainSelection(inspection); // debug-gated corner panel — see _renderHudTrainSelection
    var ribbon = SBE.SubwayLineRibbon;
    if (ribbon) ribbon.showRideMode(logicalTrainId); // BUILD §19 Ride Mode foundation
    return { ok: true, data: inspection };
  }

  function clearTrainSelection() {
    var map = _map();
    if (map && _selectedTrainId) {
      try { map.setFeatureState({ source: TRAINS_SOURCE_ID, id: _selectedTrainId }, { selected: false }); } catch (e) {}
    }
    _selectedTrainId = null;
    _renderHudTrainSelection(null);
    var ribbon = SBE.SubwayLineRibbon;
    if (ribbon) ribbon.collapse();
  }

  function getSelectedTrain() {
    var rs = _rollingStock();
    if (!rs || !_selectedTrainId) return null;
    return rs.getInspection(_selectedTrainId);
  }

  // ── refresh() — pure read from the store/library/rolling-stock authority;
  //    never fetches ─────────────────────────────────────────────────────────
  // Stations/routes apply immediately (they don't move between ticks); train
  // bodies are painted via _renderTrainBodies(), the SAME function the
  // animation timer calls every ANIM_STEP_MS (§17).
  function refresh() {
    var map = _map(), feat = _features();
    if (!map || !feat) return false;
    var stationsSrc = map.getSource(STATIONS_SOURCE_ID);
    var routeSrc = map.getSource(ROUTE_SOURCE_ID);
    var trainsSrc = map.getSource(TRAINS_SOURCE_ID);
    if (!stationsSrc || !routeSrc || !trainsSrc) return false;

    try {
      var full = feat.buildFullNetworkFeatureCollections();
      routeSrc.setData(full.routes);
      stationsSrc.setData(full.stations);
      _renderTrainBodies(); // paint immediately rather than waiting up to ANIM_STEP_MS
      _renderHudDiagnostics();
      if (_selectedTrainId) _renderHudTrainSelection(getSelectedTrain());
      if (_selectedStationId) _renderHudSelection(getSelectedStation());
      if (_followedTrainId) _followCamera();
      return true;
    } catch (e) {
      console.warn('[MTASubwayMapLayer] refresh setData error:', e && e.message || e);
      return false;
    }
  }

  // ── Train body rendering (v5.0.0, BUILD §17-23, §26-28) ──────────────────
  // SubwayTrainMotionModel.buildMotionState() is a pure function of the
  // rolling-stock authority's evidence + the CURRENT wall-clock time — every
  // call (whether from refresh()'s 5s reconcile tick or the ANIM_STEP_MS
  // timer below) recomputes a fresh, continuously-advancing eased position
  // directly from real trip.stopTimes timing evidence. This REPLACES
  // v4.0.0's manual prevById/targetFc snapshot-lerp entirely — there is no
  // separate "animation target" state to track any more; the motion model
  // itself is the single source of continuous truth, and this function is
  // called at BOTH cadences without needing to know which one triggered it
  // (BUILD §17 "motion clock vs polling clock" separation is preserved by
  // WHERE reconcile() is called — the 5s watch tick, unchanged — not by
  // anything in this rendering function).
  function _renderTrainBodies() {
    var map = _map(), feat = _features();
    var trainsSrc = map ? map.getSource(TRAINS_SOURCE_ID) : null;
    var carSrc = map ? map.getSource(CAR_SECTIONS_SOURCE_ID) : null;
    if (!map || !feat || !trainsSrc) return;

    var zoom = map.getZoom();
    var bodyFc = feat.buildTrainBodyFeatures({ zoomLevel: zoom });
    var offsetPx = _laneOffsetPxForZoom(zoom);
    // Train Contrast / LOD Fix: precompute each train's blended body color
    // here (real JS RGB interpolation, not a composed Mapbox expression —
    // see _blendHexColors()'s header) from the active palette's neutral/
    // selected body tokens and the route's own resolved color, using the
    // CURRENT zoom's blend factor. Selection is read from the plain
    // `_selectedTrainId` this module already tracks (the same variable the
    // Mapbox feature-state selection calls use) — no new selection
    // mechanism, just a second consumer of the existing one.
    var pa = _palette();
    var trainTokens = pa ? pa.resolveTrainTokens() : null;
    var blendT = _routeColorBlendFactor(zoom);
    var withOffset = {
      type: 'FeatureCollection',
      features: bodyFc.features.map(function (f) {
        // N-Line Direction/Lane Fix — travelRightSign (MTASubwayMapFeatures'
        // real forward-travel-derived sign, see its own header) is used
        // whenever it resolved; directionLaneKey is now only a last-resort
        // fallback for the rare case neither a moving segment nor a
        // resolvable next-stop tangent was available (see
        // _travelRightSign's own dwell branch) — never the primary signal,
        // since a fixed NORTH/SOUTH->side mapping was proven live to put
        // trains on their real LEFT-hand side of travel instead of their
        // right on the N route's actual shape.
        var sign = f.properties.travelRightSign != null ? f.properties.travelRightSign
          : (f.properties.directionLaneKey === 'A' ? -1 : (f.properties.directionLaneKey === 'B' ? 1 : 0));
        var selected = f.properties.logicalTrainId === _selectedTrainId;
        var baseBody = trainTokens ? (selected ? trainTokens.selectedBody : trainTokens.neutralBody) : (selected ? '#FF9F1C' : '#C9CDD3');
        var routeColor = f.properties.resolvedColor || baseBody;
        var renderBodyColor = _blendHexColors(baseBody, routeColor, blendT);
        return Object.assign({}, f, { properties: Object.assign({}, f.properties, { laneOffsetPx: sign * offsetPx, renderBodyColor: renderBodyColor }) });
      }),
    };
    try { trainsSrc.setData(withOffset); } catch (e) {}

    if (carSrc) {
      // BUILD §13/§43 — populated only at CLOSE zoom, cleared cleanly
      // (empty FeatureCollection) below it so sections disappear on zoom-out.
      var carFc = zoom >= CLOSE_ZOOM_THRESHOLD
        ? feat.buildTrainCarSectionFeatures({ zoomLevel: zoom, closeZoomThreshold: CLOSE_ZOOM_THRESHOLD })
        : { type: 'FeatureCollection', features: [] };
      try { carSrc.setData(carFc); } catch (e) {}
    }
  }

  // One shared requestAnimationFrame loop (Continuous Motion Fix §10) —
  // never a timer per train, never a network call or storage write inside
  // the loop. Internally throttled to ANIM_STEP_MS via a timestamp check so
  // Mapbox setData() runs at a tuned cadence, not literal per-frame.
  function _animFrame(ts) {
    if (!_active) { _animFrameId = null; return; }
    if (ts - _lastAnimRenderAt >= ANIM_STEP_MS) {
      _lastAnimRenderAt = ts;
      _renderTrainBodies();
    }
    _animFrameId = global.requestAnimationFrame(_animFrame);
  }
  function _startAnimationTimer() {
    if (_animFrameId) return;
    _lastAnimRenderAt = 0;
    _animFrameId = global.requestAnimationFrame(_animFrame);
  }
  function _stopAnimationTimer() {
    if (_animFrameId) { global.cancelAnimationFrame(_animFrameId); _animFrameId = null; }
  }

  // ── Train-follow foundation (v4.0.0, BUILD §17) ──────────────────────────
  // Gentle re-centering once per watch tick (never per animation frame —
  // this is a foundation for a future camera, not a cinematic system).
  function followTrain(logicalTrainId) {
    var rs = _rollingStock();
    if (!rs || !rs.getLogicalTrain(logicalTrainId)) return { ok: false, reason: 'not_found' };
    _followedTrainId = logicalTrainId;
    _followCamera();
    return { ok: true };
  }
  function unfollowTrain() { _followedTrainId = null; return { ok: true }; }
  function getFollowedTrainId() { return _followedTrainId; }

  function _followCamera() {
    // Sunroof Camera Ride Test (0819) — an explicit, narrow ownership guard:
    // this coarse 5s/800ms foundation must never fight the Sunroof
    // controller's own continuous per-frame camera updates while it's
    // attached to a train. See subwayCameraSunroof.js's file header for the
    // full camera-ownership investigation.
    if (global.SBE && SBE.SunroofCameraController && SBE.SunroofCameraController.isActive()) return;
    var map = _map(), rs = _rollingStock();
    if (!map || !rs || !_followedTrainId) return;
    var pos = rs.getPositionState(_followedTrainId);
    if (!pos || !pos.position) return;
    try { map.easeTo({ center: pos.position, duration: 800 }); } catch (e) {}
  }

  // Cheap watch loop (BUILD §29 — the ONE centralized scheduling point, never
  // a per-train timer). Every tick: reconcile the logical rolling-stock
  // authority against the store's current realtime state (cheap — a single
  // pass over the store's own trip/vehicle lists; this is also what ages
  // temporarily_missing → stale → ended on real wall-clock time even between
  // realtime polls), then always refresh the visible layers — inexpensive at
  // full-network scale (~500 stations, ~300 route segments, a few hundred
  // trains) and necessary since train freshness/staleness visibly changes
  // between polls, not only when the store's realtimeLastUpdatedAt changes.
  function _watchTick() {
    var store = _store();
    if (!store || !_active) return;
    var diag = store.getDiagnostics();
    if (diag.realtimeLastUpdatedAt && diag.realtimeLastUpdatedAt !== _lastRenderedRealtimeAt) _lastRenderedRealtimeAt = diag.realtimeLastUpdatedAt;
    var rs = _rollingStock();
    if (rs) rs.reconcile();
    // Self-healing (found live during the v4.0.0 build's own verification):
    // _bootMapWork()'s one-time ensureLayers() call can partially fail if it
    // runs before Mapbox's style is FULLY settled ("Style is not done
    // loading") — everything created before the failure point stays, but a
    // source/layer added later in the function can be silently skipped
    // forever since ensureLayers was never called again. Every
    // ensureLayers() block is already idempotent (`if
    // (!map.getSource/getLayer(id))`), so re-running it here on the SAME
    // existing 5s timer (no new timer, BUILD §29) is cheap and simply
    // finishes any layer creation the first attempt didn't complete.
    var map = _map();
    if (map) ensureLayers(map);
    refresh();
  }

  // ── activate/deactivate ──────────────────────────────────────────────────
  function _bootMapWork() {
    var map = _map();
    if (!map) return;
    ensureLayers(map);
    refresh();
  }

  function activate(opts) {
    var groupIds = (opts && opts.groupIds) || _allRealtimeGroupIds();
    _active = true;

    var mvr = global.SBE && SBE.MapboxViewportRuntime;
    if (mvr && typeof mvr.onReady === 'function') mvr.onReady(_bootMapWork);
    else if (mvr && typeof mvr.onStyleLoad === 'function') mvr.onStyleLoad(_bootMapWork);
    else global.setTimeout(_bootMapWork, 1000); // defensive fallback only

    var store = _store(), lib = _library();
    var ensureData = function () {
      var p = (store && !store.getDiagnostics().staticLoaded) ? store.loadStatic() : Promise.resolve({ ok: true });
      return p.then(function () {
        if (lib) lib.importFromStaticModel(); // Station Library must be populated before stations can render (BUILD §10)
        if (_active) _bootMapWork();
      });
    };
    ensureData();

    var poll = _poll();
    if (poll && !poll.isRunning()) poll.start({ groupIds: groupIds });

    _ensureHud();
    if (!_watchTimer) _watchTimer = global.setInterval(_watchTick, 5000);
    _startAnimationTimer();
    console.log('[MTASubwayMapLayer] activated — full network, groups', JSON.stringify(groupIds));
    return true;
  }

  function deactivate() {
    _active = false;
    var poll = _poll();
    if (poll) poll.stop();
    if (_watchTimer) { global.clearInterval(_watchTimer); _watchTimer = null; }
    _stopAnimationTimer();
    var map = _map();
    if (map) removeLayers(map);
    _selectedTrainId = null;
    _followedTrainId = null;
    _removeHud();
    return true;
  }

  function isActive() { return _active; }

  // ── Palette-driven paint (v5.0.0, BUILD §7-9, §18-21) ────────────────────
  // Station fill/stroke/selected and train stale-opacity live in the
  // palette registry now, not hardcoded module constants. Applied once at
  // layer creation and again on every palette switch — never touches
  // route/station/train IDENTITY (setPaintProperty only ever changes a
  // paint value, never a feature id/property).
  function _applyPaletteStyling(map) {
    var pa = _palette();
    if (!pa || !map) return;
    var station = pa.resolveStationTokens();
    var train = pa.resolveTrainTokens();
    try {
      if (station && map.getLayer(STATIONS_LAYER_ID)) {
        map.setPaintProperty(STATIONS_LAYER_ID, 'circle-color',
          ['case', ['boolean', ['feature-state', 'selected'], false], station.selected, station.fill]);
        map.setPaintProperty(STATIONS_LAYER_ID, 'circle-stroke-color', station.stroke);
      }
      if (train && map.getLayer(TRAINS_LAYER_ID)) {
        map.setPaintProperty(TRAINS_LAYER_ID, 'line-opacity', ['case',
          ['boolean', ['feature-state', 'selected'], false], 1.0,
          ['match', ['get', 'positionTruthState'], 'stale', train.staleOpacity, 0.95]]);
      }
      if (train && map.getLayer(TRAIN_CASING_LAYER_ID)) {
        // Train Contrast / LOD Fix — casing color is flat (never zoom-
        // blended); selection reads `selectedCasing` (a bright, obvious
        // outline independent of the inner body's route-color blend).
        map.setPaintProperty(TRAIN_CASING_LAYER_ID, 'line-color',
          ['case', ['boolean', ['feature-state', 'selected'], false], train.selectedCasing, train.casing]);
        map.setPaintProperty(TRAIN_CASING_LAYER_ID, 'line-opacity', ['case',
          ['boolean', ['feature-state', 'selected'], false], 1.0,
          ['match', ['get', 'positionTruthState'], 'stale', train.staleOpacity, 0.95]]);
      }
    } catch (e) { console.warn('[MTASubwayMapLayer] _applyPaletteStyling error:', e && e.message || e); }
  }

  // ── Palette switching (BUILD §21, prior build; §9/§18-21 this build) ─────
  function setPalette(paletteId) {
    var pa = _palette();
    if (!pa) return { ok: false, reason: 'palette_unavailable' };
    var result = pa.setActivePalette(paletteId);
    if (result.ok) {
      var map = _map();
      if (map) _applyPaletteStyling(map);
      refresh(); // re-resolve display colors only — routeId/stlib ids untouched
    }
    _renderHudDiagnostics();
    return result;
  }

  // ── Diagnostics (BUILD §24 / 0818_Logical_Rolling_Stock §35 snapshot) ────
  function getDiagnostics() {
    var store = _store(), poll = _poll(), inv = _inventory(), lib = _library(), pa = _palette(), rs = _rollingStock();
    var mm = _motionModel();
    var storeDiag = store ? store.getDiagnostics() : {};
    var libDiag = lib ? lib.getDiagnostics() : {};
    var pollState = poll ? poll.getState() : {};
    var rsDiag = rs ? rs.getDiagnostics() : {};
    var mmDiag = mm ? mm.getDiagnostics() : {};
    return {
      version: VERSION,
      active: _active,
      routeCount: storeDiag.routeCount || 0,
      routeFamilyCount: 10,
      routeFeatureCount: (_features() && _store()) ? _features().buildAllRouteFeatures().features.length : 0,
      stationLibraryRecordCount: libDiag.recordCount || 0,
      stationFeatureCount: libDiag.recordCount || 0,
      complexCount: storeDiag.complexCount || 0,
      duplicateNameGroupCount: libDiag.duplicateDisplayNameGroupCount || 0,
      identityCollisionCount: (storeDiag.identityCollisionCount || 0) + (libDiag.identityCollisionCount || 0) +
        (rsDiag.logicalTrainIdentityCollisionCount || 0) + (rsDiag.logicalCarIdentityCollisionCount || 0), // required invariant: must be 0
      selectedStationId: _selectedStationId,
      selectedTrainId: _selectedTrainId,
      followedTrainId: _followedTrainId,
      activeRealtimeTripCount: storeDiag.tripCount || 0,
      activeRealtimeVehicleCount: storeDiag.vehicleCount || 0,
      alertCount: storeDiag.alertCount || 0,
      unresolvedRealtimeJoinCount: libDiag.unresolvedStaticStopCount || 0,
      lastSuccessfulRealtimePoll: pollState.lastSuccessAt || null,
      staleState: pollState.stale ? 'stale' : (pollState.lastSuccessAt ? 'live' : 'unavailable'),
      activeSubwayPalette: pa ? pa.getActivePaletteId() : null,
      // carried from v1.0.0 diagnostics shape, still exposed for continuity
      staticSource: inv ? inv.getStaticSource().endpoint : null,
      realtimeSources: inv ? inv.getRealtimeSources().map(function (s) { return s.endpoint; }) : [],
      pollCount: pollState.pollCount || 0,
      pollFailureCount: pollState.failureCount || 0,
      pollOverlapSkipCount: pollState.overlapSkipCount || 0,
      // 0818_SUBWAY_Logical_Rolling_Stock_v1.0.0_BUILD §35 required fields
      activeLogicalTrainCount: rsDiag.activeLogicalTrainCount || 0,
      logicalConsistCount: rsDiag.logicalConsistCount || 0,
      logicalCarCount: rsDiag.logicalCarCount || 0,
      routePoolCount: rsDiag.routePoolCount || 0,
      observedStopPositionCount: rsDiag.observedStopPositionCount || 0,
      inferredSegmentPositionCount: rsDiag.inferredSegmentPositionCount || 0,
      staleTrainCount: rsDiag.staleTrainCount || 0,
      unknownPositionTrainCount: rsDiag.unknownPositionTrainCount || 0,
      unresolvedTripAssociationCount: rsDiag.unresolvedTripAssociationCount || 0,
      tripReassociationCount: rsDiag.tripReassociationCount || 0,
      newLogicalTrainsCreated: rsDiag.newLogicalTrainsCreated || 0,
      // 0818_SUBWAY_Train_Rendering_Palette_Library_v1.0.0_BUILD — train
      // body/motion diagnostics
      trainBodyByMotionPhase: mmDiag.byMotionPhase || {},
      trainBodyByEvidenceTier: mmDiag.byEvidenceTier || {},
      activeTrainJourneyCount: mmDiag.activeJourneyCount || 0,
      logicalTrainsReused: rsDiag.logicalTrainsReused || 0,
      lastReconcileAt: rsDiag.lastReconcileAt || null,
    };
  }

  // ── Debug/operator HUD — palette switcher + raw diagnostics + internal-id
  //    selection detail. BUILD §5/§13 (0819_SUBWAY_Public_HUD_Line_Ribbon):
  //    this panel is no longer the public-facing surface (see
  //    subwayStationHud.js/subwayLineRibbon.js for that) — route/station/
  //    train counts, freshness, poll state, palette diagnostics, and
  //    internal stlib-*/trip/car ids are debug/operator information only.
  //    Gated behind SBE.runtimeFlags.showSubwayDebugHud, the SAME existing
  //    internal mechanism this codebase already uses for its other debug
  //    overlays (e.g. showHarborSectorDebug) — never rendered publicly by
  //    default, always still queryable via getDiagnostics()/
  //    _wos.debug.subway.diagnostics() regardless of the flag. ───────────
  function _debugHudEnabled() {
    return !!(global.SBE && SBE.runtimeFlags && SBE.runtimeFlags.showSubwayDebugHud);
  }

  function _ensureHud() {
    if (_hud || !global.document) return;
    var root = global.document.createElement('div');
    root.id = 'wos-subway-hud';
    root.style.cssText = 'position:fixed;bottom:12px;left:12px;z-index:9999;background:rgba(17,17,17,0.88);' +
      'color:#e8e8e8;font:11px/1.4 -apple-system,sans-serif;padding:8px 10px;border-radius:8px;' +
      'max-width:280px;pointer-events:auto;box-shadow:0 2px 12px rgba(0,0,0,0.4);';

    var diagEl = global.document.createElement('div');
    diagEl.id = 'wos-subway-hud-diag';
    root.appendChild(diagEl);

    var paletteRow = global.document.createElement('div');
    paletteRow.style.cssText = 'margin-top:6px;display:flex;gap:6px;';
    var pa = _palette();
    (pa ? pa.listPalettes() : []).forEach(function (p) {
      var btn = global.document.createElement('button');
      btn.textContent = p.label;
      btn.dataset.paletteId = p.id;
      btn.style.cssText = 'font-size:10px;padding:3px 7px;border-radius:4px;border:1px solid #444;background:#222;color:#ddd;cursor:pointer;';
      btn.onclick = function () { setPalette(p.id); };
      paletteRow.appendChild(btn);
    });
    root.appendChild(paletteRow);

    var selEl = global.document.createElement('div');
    selEl.id = 'wos-subway-hud-selection';
    selEl.style.cssText = 'margin-top:6px;border-top:1px solid #333;padding-top:6px;';
    root.appendChild(selEl);

    var trainSelEl = global.document.createElement('div');
    trainSelEl.id = 'wos-subway-hud-train-selection';
    trainSelEl.style.cssText = 'margin-top:6px;border-top:1px solid #333;padding-top:6px;';
    root.appendChild(trainSelEl);

    global.document.body.appendChild(root);
    _hud = { root: root, diagEl: diagEl, selEl: selEl, trainSelEl: trainSelEl };
    _renderHudDiagnostics();
    _renderHudSelection(null);
    _renderHudTrainSelection(null);
  }

  function _removeHud() {
    if (_hud && _hud.root && _hud.root.parentNode) _hud.root.parentNode.removeChild(_hud.root);
    _hud = null;
  }

  function _renderHudDiagnostics() {
    if (!_hud) return;
    _hud.root.style.display = _debugHudEnabled() ? '' : 'none';
    if (!_debugHudEnabled()) return; // cheap early-out — never renders (or leaks internal ids into) an invisible panel
    var d = getDiagnostics();
    var activePalette = _palette() ? _palette().getActivePalette() : null;
    _hud.diagEl.innerHTML =
      '<strong>SUBWAY</strong> — ' + d.routeCount + ' routes · ' + d.stationLibraryRecordCount + ' stations · ' +
      d.activeRealtimeVehicleCount + ' live<br>' +
      'freshness: <span style="color:' + (d.staleState === 'live' ? '#7CFF9C' : '#FF9C7C') + '">' + d.staleState + '</span> · ' +
      'collisions: ' + d.identityCollisionCount + ' · palette: ' + (activePalette ? activePalette.label : '—');
    (_hud.root.querySelectorAll('button[data-palette-id]') || []).forEach(function (btn) {
      btn.style.outline = btn.dataset.paletteId === d.activeSubwayPalette ? '2px solid ' + SELECTED_STATION_COLOR : 'none';
    });
  }

  // v4.0.0 (BUILD §25) — the same selection panel now also shows live
  // arrival intelligence for the exact selected Station Library record. No
  // second panel; existing exact-station selection behavior above is
  // unchanged.
  function _renderHudSelection(record) {
    if (!_hud || !_debugHudEnabled()) return;
    if (!record) { _hud.selEl.innerHTML = '<em style="color:#888">Click a station to select it</em>'; return; }
    var op = record.operational;
    var html =
      '<strong>' + (op.displayName || '(unnamed)') + '</strong><br>' +
      op.borough + ' · ' + (op.routeIds.length ? op.routeIds.join(' ') : '—') + '<br>' +
      '<span style="color:#888">' + record.studioRichStationId + ' · stop ' + record.authoritativeLink.gtfsStopId + '</span>';

    var ai = _arrivalIntelligence();
    if (ai) {
      var result = ai.getArrivalsForStation(record.studioRichStationId);
      if (result.ok) {
        var freshColor = { live: '#7CFF9C', aging: '#FFD37C', unavailable: '#FF9C7C' }[result.data.freshnessState] || '#888';
        html += '<div style="margin-top:6px;border-top:1px solid #333;padding-top:6px;">' +
          '<span style="color:' + freshColor + '">arrivals: ' + result.data.freshnessState + '</span>';
        if (!result.data.directions.length) {
          html += '<br><em style="color:#888">no upcoming arrivals from live data</em>';
        } else {
          result.data.directions.forEach(function (dir) {
            html += '<br><strong>' + dir.friendlyLabel + '</strong>';
            if (!dir.arrivals.length) { html += '<br><span style="color:#888">—</span>'; return; }
            dir.arrivals.forEach(function (a) {
              var etaLabel = a.dueSoon ? 'Due' : (Math.round(a.etaSeconds / 60) + ' min');
              html += '<br>' + a.routeId.replace('subway:route:', '') + ' — ' + etaLabel;
            });
          });
        }
        html += '</div>';
      }
    }
    _hud.selEl.innerHTML = html;
  }

  // Minimum inspection data required by BUILD §26-27: logical train ID,
  // route, route family, active MTA trip ID, logical consist ID, logical
  // car count (+ first/last car id), position truth state, current/last
  // stop, next stop, freshness. No car-detail editing (§26 explicit).
  function _renderHudTrainSelection(inspection) {
    if (!_hud || !_debugHudEnabled()) return;
    if (!inspection || !inspection.train) { _hud.trainSelEl.innerHTML = '<em style="color:#888">Click a train to select it</em>'; return; }
    var t = inspection.train, pos = inspection.position, cars = inspection.cars || [];
    var freshnessMs = pos && pos.observedTimestamp ? (Date.now() - pos.observedTimestamp) : null;
    var truthColor = { observed_stop: '#7CFF9C', inferred_segment: '#9CC7FF', stale: '#FF9C7C', unknown: '#888' }[pos ? pos.truthState : 'unknown'] || '#888';
    _hud.trainSelEl.innerHTML =
      '<strong>' + t.id + '</strong> · ' + (t.routeId || '—').replace('subway:route:', '') + '<br>' +
      'trip: <span style="color:#888">' + (t.activeTripId ? t.activeTripId.replace('subway:trip:', '') : '—') + '</span> · ' +
      'consist: <span style="color:#888">' + t.consistId + '</span> (' + cars.length + ' cars)<br>' +
      'position: <span style="color:' + truthColor + '">' + (pos ? pos.truthState : 'unknown') + '</span>' +
      (pos && pos.observedStopId ? ' · from ' + pos.observedStopId.replace('subway:stop:', '') : '') +
      (pos && pos.nextStopId ? ' · to ' + pos.nextStopId.replace('subway:stop:', '') : '') + '<br>' +
      '<span style="color:#888">freshness: ' + (freshnessMs != null ? Math.round(freshnessMs / 1000) + 's ago' : '—') +
      ' · cars ' + (cars[0] ? cars[0].id : '—') + '…' + (cars[cars.length - 1] ? cars[cars.length - 1].id : '—') + '</span>';
  }

  SBE.MTASubwayMapLayer = Object.freeze({
    VERSION: VERSION,
    STATIONS_SOURCE_ID: STATIONS_SOURCE_ID,
    ROUTE_SOURCE_ID: ROUTE_SOURCE_ID,
    TRAINS_SOURCE_ID: TRAINS_SOURCE_ID,
    ensureLayers: ensureLayers,
    removeLayers: removeLayers,
    refresh: refresh,
    activate: activate,
    deactivate: deactivate,
    isActive: isActive,
    selectStation: selectStation,
    clearSelection: clearSelection,
    getSelectedStation: getSelectedStation,
    selectTrain: selectTrain,
    clearTrainSelection: clearTrainSelection,
    getSelectedTrain: getSelectedTrain,
    followTrain: followTrain,
    unfollowTrain: unfollowTrain,
    getFollowedTrainId: getFollowedTrainId,
    setPalette: setPalette,
    getDiagnostics: getDiagnostics,
    __laneOffsetPxForZoom: _laneOffsetPxForZoom,
    __routeColorBlendFactor: _routeColorBlendFactor,
    __blendHexColors: _blendHexColors,
  });

  // main.js's DOMContentLoaded handler replaces window._wos wholesale and
  // only restores top-level keys not already present on its own object —
  // nested _wos.debug.* entries registered before that point are silently
  // dropped. worldSpaceVehicleDebug.js works around this with setTimeout;
  // same fix here (verified live in the prior build — without it,
  // _wos.debug.subway never survives to page-ready).
  function _bindDebug() {
    global._wos = global._wos || {};
    global._wos.debug = global._wos.debug || {};
    global._wos.debug.subway = {
      activate: activate,
      deactivate: deactivate,
      refresh: refresh,
      diagnostics: getDiagnostics,
      selectStation: selectStation,
      clearSelection: clearSelection,
      getSelectedStation: getSelectedStation,
      selectTrain: selectTrain,
      clearTrainSelection: clearTrainSelection,
      getSelectedTrain: getSelectedTrain,
      followTrain: followTrain,
      unfollowTrain: unfollowTrain,
      getFollowedTrainId: getFollowedTrainId,
      setPalette: setPalette,
    };
  }
  _bindDebug();
  global.setTimeout(_bindDebug, 300);
  global.setTimeout(_bindDebug, 1000);

  console.log('[MTASubwayMapLayer] v' + VERSION + ' loaded (full network — call activate() or ?mode=subway)');
})(window);
