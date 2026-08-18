// ── MTASubwayMapLayer v3.0.0 ──────────────────────────────────────────────────
// 0818_SUBWAY_Logical_Rolling_Stock_v1.0.0_BUILD — Interface Layer §23-27
// (v2.0.0 was 0818_SUBWAY_Full_Live_Map_Integration_v1.0.0_BUILD — full
// network rendering without persistent logical rolling stock. v1.0.0 was
// 0818_SUBWAY_Live_Data_Foundation_v1.0.0_BUILD — single-route slice.)
// Status: active | Classification: presentation (Mapbox integration)
//
// Renders the FULL StudioRich SUBWAY network onto the canonical, already-
// running Mapbox map (SBE.MapboxViewportRuntime.getMap()): every real route
// family, every Station Library-backed station, live operational state for
// every polled line group, station selection resolving to the exact Station
// Library record, a visible StudioRich Fashion Subway ⇄ MTA Reference
// palette switch that never touches transit identity, and (new in v3.0.0) a
// live logical-train layer sourced from SubwayLogicalRollingStockAuthority —
// persistent StudioRich train/consist/car identity, never a raw MTA trip id.
//
// ROLLING STOCK RULE (new in v3.0.0): this file never computes trip
// association or position itself — SubwayLogicalRollingStockAuthority.
// reconcile() owns that entirely. This file only ever (a) calls reconcile()
// once per watch tick — the SAME existing 5s timer already used for
// route/station refresh, never a new per-train timer (BUILD §29) — and (b)
// reads the already-built logical_trains GeoJSON from
// SBE.MTASubwayMapFeatures.buildLogicalTrainFeatures(). Train identity is
// owned by the authority; this file only ever renders and selects it.
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
  var VERSION = '3.0.0';

  var STATIONS_SOURCE_ID = 'wos-subway-stations';
  var STATIONS_LAYER_ID = 'wos-subway-stations-layer';
  var STATIONS_LABEL_LAYER_ID = 'wos-subway-stations-label-layer';
  var ROUTE_SOURCE_ID = 'wos-subway-routes';
  var ROUTE_LAYER_ID = 'wos-subway-routes-layer';
  // Logical train layer (v3.0.0) — replaces the plain v2.0.0 "vehicle
  // presence" dot layer as the visible map marker (Creative Interface
  // Doctrine: one live-train marker layer, not two overlapping ones).
  // mtaSubwayMapFeatures.buildVehiclePresenceFeatures() itself is untouched
  // and still exported/tested — this only changes what the map DRAWS.
  var TRAINS_SOURCE_ID = 'wos-subway-trains';
  var TRAINS_LAYER_ID = 'wos-subway-trains-layer';

  var LABEL_MIN_ZOOM = 13; // avoid unreadable all-label-on-all-zoom (BUILD §14)
  var SELECTED_STATION_COLOR = '#ff9f1c';
  var DEFAULT_STATION_COLOR = '#ffffff';
  var SELECTED_TRAIN_STROKE = '#ff9f1c';

  var _active = false;
  var _selectedStationId = null; // stlib-* id — the exact Station Library record, never a name
  var _selectedTrainId = null;   // sr-train-* id — the exact logical train record, never a trip id
  var _lastRenderedRealtimeAt = null;
  var _watchTimer = null;
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

      if (!map.getSource(TRAINS_SOURCE_ID)) {
        map.addSource(TRAINS_SOURCE_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, promoteId: 'logicalTrainId' });
      }
      if (!map.getLayer(TRAINS_LAYER_ID)) {
        map.addLayer({
          id: TRAINS_LAYER_ID, type: 'circle', source: TRAINS_SOURCE_ID,
          paint: {
            // Route-family color remains primary identity (BUILD §25) —
            // observed/inferred/stale is encoded ONLY via secondary
            // properties (radius/opacity/stroke), never a conflicting hue.
            'circle-radius': ['case', ['boolean', ['feature-state', 'selected'], false], 8,
              ['match', ['get', 'positionTruthState'], 'inferred_segment', 5, 'stale', 5, 6]],
            'circle-color': ['coalesce', ['get', 'resolvedColor'], '#ff9f1c'],
            'circle-opacity': ['match', ['get', 'positionTruthState'], 'stale', 0.4, 'inferred_segment', 0.85, 0.95],
            'circle-stroke-width': ['case', ['boolean', ['feature-state', 'selected'], false], 3, 2],
            'circle-stroke-color': ['case', ['boolean', ['feature-state', 'selected'], false], SELECTED_TRAIN_STROKE, '#ffffff'],
          },
        });
      }

      _ensureInteraction(map);
      return true;
    } catch (e) {
      console.warn('[MTASubwayMapLayer] ensureLayers error:', e && e.message || e);
      return false;
    }
  }

  function removeLayers(map) {
    if (!map) return;
    [TRAINS_LAYER_ID, STATIONS_LABEL_LAYER_ID, STATIONS_LAYER_ID, ROUTE_LAYER_ID].forEach(function (id) {
      try { if (map.getLayer(id)) map.removeLayer(id); } catch (e) {}
    });
    [TRAINS_SOURCE_ID, STATIONS_SOURCE_ID, ROUTE_SOURCE_ID].forEach(function (id) {
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
    _renderHudSelection(record);
    return { ok: true, data: record };
  }

  function clearSelection() {
    var map = _map();
    if (map && _selectedStationId) {
      try { map.setFeatureState({ source: STATIONS_SOURCE_ID, id: _selectedStationId }, { selected: false }); } catch (e) {}
    }
    _selectedStationId = null;
    _renderHudSelection(null);
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
    _renderHudTrainSelection(inspection);
    return { ok: true, data: inspection };
  }

  function clearTrainSelection() {
    var map = _map();
    if (map && _selectedTrainId) {
      try { map.setFeatureState({ source: TRAINS_SOURCE_ID, id: _selectedTrainId }, { selected: false }); } catch (e) {}
    }
    _selectedTrainId = null;
    _renderHudTrainSelection(null);
  }

  function getSelectedTrain() {
    var rs = _rollingStock();
    if (!rs || !_selectedTrainId) return null;
    return rs.getInspection(_selectedTrainId);
  }

  // ── refresh() — pure read from the store/library/rolling-stock authority;
  //    never fetches ─────────────────────────────────────────────────────────
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
      trainsSrc.setData(full.logical_trains);
      _renderHudDiagnostics();
      if (_selectedTrainId) _renderHudTrainSelection(getSelectedTrain());
      return true;
    } catch (e) {
      console.warn('[MTASubwayMapLayer] refresh setData error:', e && e.message || e);
      return false;
    }
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
    console.log('[MTASubwayMapLayer] activated — full network, groups', JSON.stringify(groupIds));
    return true;
  }

  function deactivate() {
    _active = false;
    var poll = _poll();
    if (poll) poll.stop();
    if (_watchTimer) { global.clearInterval(_watchTimer); _watchTimer = null; }
    var map = _map();
    if (map) removeLayers(map);
    _selectedTrainId = null;
    _removeHud();
    return true;
  }

  function isActive() { return _active; }

  // ── Palette switching (BUILD §21) — visible, admin-facing control ────────
  function setPalette(paletteId) {
    var pa = _palette();
    if (!pa) return { ok: false, reason: 'palette_unavailable' };
    var result = pa.setActivePalette(paletteId);
    if (result.ok) refresh(); // re-resolve display colors only — routeId/stlib ids untouched
    _renderHudDiagnostics();
    return result;
  }

  // ── Diagnostics (BUILD §24 / 0818_Logical_Rolling_Stock §35 snapshot) ────
  function getDiagnostics() {
    var store = _store(), poll = _poll(), inv = _inventory(), lib = _library(), pa = _palette(), rs = _rollingStock();
    var storeDiag = store ? store.getDiagnostics() : {};
    var libDiag = lib ? lib.getDiagnostics() : {};
    var pollState = poll ? poll.getState() : {};
    var rsDiag = rs ? rs.getDiagnostics() : {};
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
      logicalTrainsReused: rsDiag.logicalTrainsReused || 0,
      lastReconcileAt: rsDiag.lastReconcileAt || null,
    };
  }

  // ── Minimal visible HUD — palette switcher + diagnostics + selection panel.
  //    Injected only while active(); Creative Interface Doctrine: quiet by
  //    default (small corner card), never blocks map interaction, no
  //    fixture/test-only affordances. ─────────────────────────────────────
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

  function _renderHudSelection(record) {
    if (!_hud) return;
    if (!record) { _hud.selEl.innerHTML = '<em style="color:#888">Click a station to select it</em>'; return; }
    var op = record.operational;
    _hud.selEl.innerHTML =
      '<strong>' + (op.displayName || '(unnamed)') + '</strong><br>' +
      op.borough + ' · ' + (op.routeIds.length ? op.routeIds.join(' ') : '—') + '<br>' +
      '<span style="color:#888">' + record.studioRichStationId + ' · stop ' + record.authoritativeLink.gtfsStopId + '</span>';
  }

  // Minimum inspection data required by BUILD §26-27: logical train ID,
  // route, route family, active MTA trip ID, logical consist ID, logical
  // car count (+ first/last car id), position truth state, current/last
  // stop, next stop, freshness. No car-detail editing (§26 explicit).
  function _renderHudTrainSelection(inspection) {
    if (!_hud) return;
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
    setPalette: setPalette,
    getDiagnostics: getDiagnostics,
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
      setPalette: setPalette,
    };
  }
  _bindDebug();
  global.setTimeout(_bindDebug, 300);
  global.setTimeout(_bindDebug, 1000);

  console.log('[MTASubwayMapLayer] v' + VERSION + ' loaded (full network — call activate() or ?mode=subway)');
})(window);
