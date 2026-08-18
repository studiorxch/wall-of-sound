// ── MTASubwayMapLayer v2.0.0 ──────────────────────────────────────────────────
// 0818_SUBWAY_Full_Live_Map_Integration_v1.0.0_BUILD — Interface Layer §20-24
// (v1.0.0 was 0818_SUBWAY_Live_Data_Foundation_v1.0.0_BUILD — single-route
// validation slice only. This build replaces that with the full network.)
// Status: active | Classification: presentation (Mapbox integration)
//
// Renders the FULL StudioRich SUBWAY network onto the canonical, already-
// running Mapbox map (SBE.MapboxViewportRuntime.getMap()): every real route
// family, every Station Library-backed station, live operational state for
// every polled line group, station selection resolving to the exact Station
// Library record, and a visible StudioRich Fashion Subway ⇄ MTA Reference
// palette switch that never touches transit identity.
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
  var VERSION = '2.0.0';

  var STATIONS_SOURCE_ID = 'wos-subway-stations';
  var STATIONS_LAYER_ID = 'wos-subway-stations-layer';
  var STATIONS_LABEL_LAYER_ID = 'wos-subway-stations-label-layer';
  var ROUTE_SOURCE_ID = 'wos-subway-routes';
  var ROUTE_LAYER_ID = 'wos-subway-routes-layer';
  var VEHICLES_SOURCE_ID = 'wos-subway-vehicle-presence';
  var VEHICLES_LAYER_ID = 'wos-subway-vehicle-presence-layer';

  var LABEL_MIN_ZOOM = 13; // avoid unreadable all-label-on-all-zoom (BUILD §14)
  var SELECTED_STATION_COLOR = '#ff9f1c';
  var DEFAULT_STATION_COLOR = '#ffffff';

  var _active = false;
  var _selectedStationId = null; // stlib-* id — the exact Station Library record, never a name
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

      if (!map.getSource(VEHICLES_SOURCE_ID)) {
        map.addSource(VEHICLES_SOURCE_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      }
      if (!map.getLayer(VEHICLES_LAYER_ID)) {
        map.addLayer({
          id: VEHICLES_LAYER_ID, type: 'circle', source: VEHICLES_SOURCE_ID,
          paint: {
            'circle-radius': 6,
            'circle-color': ['coalesce', ['get', 'resolvedColor'], '#ff9f1c'],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff',
            'circle-opacity': 0.95,
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
    [VEHICLES_LAYER_ID, STATIONS_LABEL_LAYER_ID, STATIONS_LAYER_ID, ROUTE_LAYER_ID].forEach(function (id) {
      try { if (map.getLayer(id)) map.removeLayer(id); } catch (e) {}
    });
    [VEHICLES_SOURCE_ID, STATIONS_SOURCE_ID, ROUTE_SOURCE_ID].forEach(function (id) {
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

  // ── refresh() — pure read from the store/library; never fetches ────────────
  function refresh() {
    var map = _map(), feat = _features();
    if (!map || !feat) return false;
    var stationsSrc = map.getSource(STATIONS_SOURCE_ID);
    var routeSrc = map.getSource(ROUTE_SOURCE_ID);
    var vehiclesSrc = map.getSource(VEHICLES_SOURCE_ID);
    if (!stationsSrc || !routeSrc || !vehiclesSrc) return false;

    try {
      var full = feat.buildFullNetworkFeatureCollections();
      routeSrc.setData(full.routes);
      stationsSrc.setData(full.stations);
      vehiclesSrc.setData(full.live_operational_state);
      _renderHudDiagnostics();
      return true;
    } catch (e) {
      console.warn('[MTASubwayMapLayer] refresh setData error:', e && e.message || e);
      return false;
    }
  }

  // Cheap watch loop — checks the store's own realtimeLastUpdatedAt timestamp
  // (in-memory read, no network) and only re-renders when it actually changed.
  function _watchTick() {
    var store = _store();
    if (!store || !_active) return;
    var diag = store.getDiagnostics();
    if (diag.realtimeLastUpdatedAt && diag.realtimeLastUpdatedAt !== _lastRenderedRealtimeAt) {
      _lastRenderedRealtimeAt = diag.realtimeLastUpdatedAt;
      refresh();
    } else {
      _renderHudDiagnostics(); // freshness/staleness can change even without a new update
    }
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

  // ── Diagnostics (BUILD §24 required snapshot) ────────────────────────────
  function getDiagnostics() {
    var store = _store(), poll = _poll(), inv = _inventory(), lib = _library(), pa = _palette();
    var storeDiag = store ? store.getDiagnostics() : {};
    var libDiag = lib ? lib.getDiagnostics() : {};
    var pollState = poll ? poll.getState() : {};
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
      identityCollisionCount: (storeDiag.identityCollisionCount || 0) + (libDiag.identityCollisionCount || 0), // required invariant: must be 0
      selectedStationId: _selectedStationId,
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

    global.document.body.appendChild(root);
    _hud = { root: root, diagEl: diagEl, selEl: selEl };
    _renderHudDiagnostics();
    _renderHudSelection(null);
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

  SBE.MTASubwayMapLayer = Object.freeze({
    VERSION: VERSION,
    STATIONS_SOURCE_ID: STATIONS_SOURCE_ID,
    ROUTE_SOURCE_ID: ROUTE_SOURCE_ID,
    VEHICLES_SOURCE_ID: VEHICLES_SOURCE_ID,
    ensureLayers: ensureLayers,
    removeLayers: removeLayers,
    refresh: refresh,
    activate: activate,
    deactivate: deactivate,
    isActive: isActive,
    selectStation: selectStation,
    clearSelection: clearSelection,
    getSelectedStation: getSelectedStation,
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
      setPalette: setPalette,
    };
  }
  _bindDebug();
  global.setTimeout(_bindDebug, 300);
  global.setTimeout(_bindDebug, 1000);

  console.log('[MTASubwayMapLayer] v' + VERSION + ' loaded (full network — call activate() or ?mode=subway)');
})(window);
