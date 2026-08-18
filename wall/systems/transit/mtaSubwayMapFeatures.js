// ── MTASubwayMapFeatures v1.0.0 ───────────────────────────────────────────────
// 0818_SUBWAY_Live_Data_Foundation_v1.0.0_BUILD — Logic Layer §13
// Status: active | Classification: pure (no Mapbox, no fetch, no DOM)
//
// Converts SBE.MTASubwayTransitStore's canonical state into plain GeoJSON
// FeatureCollections. Deliberately independent of Mapbox — this module could
// feed any renderer (or a future poster/print pipeline; see
// 0818_SUBWAY_Resumption_Audit §13 on poster compatibility). The Mapbox
// integration (mtaSubwayMapLayer.js) only ever reads these FeatureCollections
// and hands them to a Mapbox GeoJSON source — it never touches the store or
// raw protobuf/GTFS rows directly (Store Rule, BUILD §11).
//
// ── NO FAKE MOVEMENT (BUILD §13, hard requirement) ───────────────────────────
// Verified during this build (see mtaSubwayFeedSourceInventory.js /
// mtaSubwayRealtimeAdapter.js headers): current MTA subway VehiclePosition
// entities NEVER carry a `position` (latitude/longitude) field — checked
// across every line group, always null. There is therefore NO literal train
// GPS coordinate to render, and this module never invents one.
//
// What IS genuinely available and IS rendered: a train's real, verified
// `currentStationId` (the canonical station its current_stop_sequence/
// current_status/stop_id fields identify) and `currentStatus`
// (STOPPED_AT / IN_TRANSIT_TO / INCOMING_AT). buildVehiclePresenceFeatures()
// places a marker at that STATION's real, static-GTFS-verified coordinate —
// never an interpolated/smoothed point between stops — and tags every such
// feature `positionSource: 'nearest_verified_stop'` (never `'gps'`) so no
// downstream consumer can mistake it for continuous vehicle telemetry. This
// is the honest "strongest verified realtime state without simulation" the
// BUILD requires when direct coordinates aren't available.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  function _store() { return SBE.MTASubwayTransitStore || null; }
  function _stationLibrary() { return SBE.MTASubwayStationLibrary || null; }
  function _semanticFamily() { return SBE.MTASubwaySemanticFamily || null; }
  function _paletteAuthority() { return SBE.MTASubwayPaletteAuthority || null; }

  // Resolves a route's semantic family + active-palette display color.
  // Never mutates the route ref; a pure lookup. Returns nulls (not a
  // fabricated default) if either module isn't loaded or the route's real
  // MTA color isn't one of the 10 known values (see mtaSubwaySemanticFamily.js).
  function _resolveDisplayColor(route) {
    var sf = _semanticFamily(), pa = _paletteAuthority();
    var semanticFamily = sf ? sf.familyForRoute(route) : null;
    var resolvedColor = (pa && semanticFamily) ? pa.resolveFamilyColor(semanticFamily) : null;
    return { semanticFamily: semanticFamily, resolvedColor: resolvedColor };
  }

  function _stationFeature(station) {
    return {
      type: 'Feature',
      id: station.id,   // stable — the canonical subway:stop:* id, not an array index
      geometry: { type: 'Point', coordinates: [station.longitude, station.latitude] },
      properties: {
        id: station.id,
        gtfsStopId: station.authoritativeIds.gtfsStopId,
        displayName: station.displayName,
        kind: station.kind,
        complexId: station.complexId,
        parentId: station.parentId,
        routeIds: station.routeIds,
      },
    };
  }

  // Station point features — one per GTFS stop (station-level AND platform),
  // real static-GTFS coordinates. `onlyStationLevel` (default true) excludes
  // directional-platform sub-points, which is what a first-pass commuter map
  // wants (one dot per station, not one per platform direction).
  function buildStationFeatures(opts) {
    var store = _store();
    if (!store) return { type: 'FeatureCollection', features: [] };
    var onlyStationLevel = !opts || opts.onlyStationLevel !== false;
    var routeFilter = opts && opts.routeId ? opts.routeId : null;

    var stations = store.getAllStations().filter(function (s) {
      if (onlyStationLevel && s.kind !== 'station') return false;
      if (routeFilter && s.routeIds.indexOf(routeFilter) === -1) return false;
      return true;
    });

    return { type: 'FeatureCollection', features: stations.map(_stationFeature) };
  }

  // Route line features — one LineString per shape actually referenced by the
  // route (a route usually has several: different branches/directions).
  // Real static-GTFS shapes.txt geometry, unmodified.
  function buildRouteFeatures(routeId) {
    var store = _store();
    if (!store) return { type: 'FeatureCollection', features: [] };
    var route = store.getRoute(routeId);
    if (!route) return { type: 'FeatureCollection', features: [] };

    var display = _resolveDisplayColor(route);
    var features = [];
    route.shapeIds.forEach(function (shapeId) {
      var points = store.getShapePoints(shapeId);
      if (!points || points.length < 2) return; // reject degenerate geometry, don't invent points
      features.push({
        type: 'Feature',
        id: route.id + ':' + shapeId,
        geometry: { type: 'LineString', coordinates: points.map(function (p) { return [p[1], p[0]]; }) }, // [lat,lon] -> [lon,lat]
        properties: {
          routeId: route.id,
          shapeId: shapeId,
          displayName: route.displayName,
          realtimeFeedGroup: route.routeFamily, // e.g. "ace" — NOT the color family; see semanticFamily below
          // Raw MTA-supplied metadata, preserved unmodified.
          sourceColor: route.sourceColor,
          sourceTextColor: route.sourceTextColor,
          // Palette-resolved display color — route identity (routeId) is
          // NEVER derived from this; switching the active palette changes
          // only this field, never routeId/semanticFamily.
          semanticFamily: display.semanticFamily,
          resolvedColor: display.resolvedColor,
        },
      });
    });
    return { type: 'FeatureCollection', features: features };
  }

  // Full-network route lines — one call, every real route, palette-resolved.
  function buildAllRouteFeatures() {
    var store = _store();
    if (!store) return { type: 'FeatureCollection', features: [] };
    var allFeatures = [];
    store.getAllRoutes().forEach(function (route) {
      var fc = buildRouteFeatures(route.id);
      allFeatures = allFeatures.concat(fc.features);
    });
    return { type: 'FeatureCollection', features: allFeatures };
  }

  // Production station layer — sourced from the Station Library, NOT raw
  // GTFS/transit-store data (BUILD §10: "Do not render the production
  // station layer directly from raw GTFS records when a Station Library
  // record exists"). Thin delegation to the Library's own builder — kept
  // here too so map-layer code has one place to import full-network
  // collections from.
  function buildStationLibraryFeatures() {
    var lib = _stationLibrary();
    if (!lib) return { type: 'FeatureCollection', features: [] };
    return lib.buildMapFeatureCollection();
  }

  // One call for the 3 required full-network collections (BUILD §12).
  function buildFullNetworkFeatureCollections() {
    return {
      routes: buildAllRouteFeatures(),
      stations: buildStationLibraryFeatures(),
      live_operational_state: buildVehiclePresenceFeatures(),
    };
  }

  // "Vehicle presence" — see header. NEVER a literal GPS position.
  function buildVehiclePresenceFeatures(routeId) {
    var store = _store();
    if (!store) return { type: 'FeatureCollection', features: [] };
    var vehicles = routeId ? store.getVehiclesForRoute(routeId) : store.getAllVehicles();

    var features = [];
    vehicles.forEach(function (v) {
      if (!v.currentStationId) return; // no verified station reference — nothing honest to plot
      var station = store.getStation(v.currentStationId);
      if (!station) return;
      features.push({
        type: 'Feature',
        id: v.id,
        geometry: { type: 'Point', coordinates: [station.longitude, station.latitude] },
        properties: {
          id: v.id,
          tripId: v.tripId,
          routeId: v.routeId,
          trainId: v.authoritativeId,
          currentStationId: v.currentStationId,
          currentStationDisplayName: station.displayName,
          currentStatus: v.currentStatus,          // STOPPED_AT | IN_TRANSIT_TO | INCOMING_AT
          currentStopSequence: v.currentStopSequence,
          timestampUtcMs: v.timestampUtcMs,
          // Explicit, load-bearing honesty marker — never 'gps'.
          positionSource: 'nearest_verified_stop',
        },
      });
    });
    return { type: 'FeatureCollection', features: features };
  }

  // Alert-informed station/route ids, for a UI to highlight — not a geometry.
  function getAlertedRouteIds() {
    var store = _store();
    if (!store) return [];
    var ids = {};
    store.getAlerts().forEach(function (a) { (a.routeIds || []).forEach(function (r) { ids[r] = true; }); });
    return Object.keys(ids);
  }

  SBE.MTASubwayMapFeatures = Object.freeze({
    VERSION: VERSION,
    buildStationFeatures: buildStationFeatures, // legacy/raw-store path — kept for back-compat, NOT the production station layer (see buildStationLibraryFeatures)
    buildRouteFeatures: buildRouteFeatures,
    buildAllRouteFeatures: buildAllRouteFeatures,
    buildStationLibraryFeatures: buildStationLibraryFeatures,
    buildFullNetworkFeatureCollections: buildFullNetworkFeatureCollections,
    buildVehiclePresenceFeatures: buildVehiclePresenceFeatures,
    getAlertedRouteIds: getAlertedRouteIds,
  });

  console.log('[MTASubwayMapFeatures] v' + VERSION + ' loaded (pure GeoJSON builder — no Mapbox dependency)');
})(window);
