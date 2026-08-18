// ── MTASubwayMapFeatures Tests v1.0.0 ─────────────────────────────────────────
// 0818_SUBWAY_Live_Data_Foundation_v1.0.0_BUILD — Required Tests §23.11
// Status: active | Classification: test-harness (dependency-free)
//
// Run via: _wos.debug.mtaSubwayMapFeatures.runTests()
// Covers: stable feature IDs (re-running the builder twice yields identical
// ids, not array-index-based ones) and the "no fake movement" honesty
// invariant — every vehicle-presence feature must carry
// positionSource:'nearest_verified_stop' and sit exactly on a real station's
// coordinate, never an interpolated/fabricated point.
//
// Placement: wall/systems/transit/mtaSubwayMapFeatures.tests.js
// Load: AFTER mtaSubwayMapFeatures.js.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});

  function _assert(name, cond, details) {
    return { name: name, pass: !!cond, details: details === undefined ? null : details };
  }

  function run() {
    var store = SBE.MTASubwayTransitStore;
    var rt = SBE.MTASubwayRealtimeAdapter;
    var feat = SBE.MTASubwayMapFeatures;
    var results = [];
    if (!store || !rt || !feat) {
      results.push(_assert('SBE.MTASubwayTransitStore/MTASubwayRealtimeAdapter/MTASubwayMapFeatures are loaded', false));
      return Promise.resolve({ ok: false, total: 1, failed: 1, results: results });
    }

    return store.loadStatic().then(function () {
      return rt.fetchGroup('ace');
    }).then(function () {
      store.applyRealtimeUpdate(rt.getTripUpdates(), rt.getVehicles(), ['ace']);

      // ── Stable feature IDs across repeated builds ────────────────────────
      var stationFc1 = feat.buildStationFeatures({ routeId: 'subway:route:A' });
      var stationFc2 = feat.buildStationFeatures({ routeId: 'subway:route:A' });
      results.push(_assert('buildStationFeatures returns a non-empty FeatureCollection for route A', stationFc1.features.length > 0, stationFc1.features.length));
      results.push(_assert('re-running buildStationFeatures yields the identical ordered id list (stable, not index-based)',
        JSON.stringify(stationFc1.features.map(function (f) { return f.id; })) === JSON.stringify(stationFc2.features.map(function (f) { return f.id; }))));
      results.push(_assert('every station feature id equals its properties.id (no synthetic array-index id)',
        stationFc1.features.every(function (f) { return f.id === f.properties.id; })));

      var routeFc = feat.buildRouteFeatures('subway:route:A');
      results.push(_assert('buildRouteFeatures returns real LineString geometry for route A', routeFc.features.length > 0 && routeFc.features[0].geometry.type === 'LineString'));
      results.push(_assert('every route feature has at least 2 coordinate points (rejects degenerate geometry)',
        routeFc.features.every(function (f) { return f.geometry.coordinates.length >= 2; })));

      // ── Honesty invariant: vehicle presence is never a fabricated position ──
      var vehicleFc = feat.buildVehiclePresenceFeatures('subway:route:A');
      results.push(_assert('at least one real live vehicle-presence feature exists for route A right now', vehicleFc.features.length > 0, vehicleFc.features.length));
      results.push(_assert('EVERY vehicle-presence feature is tagged positionSource:"nearest_verified_stop" (never "gps")',
        vehicleFc.features.every(function (f) { return f.properties.positionSource === 'nearest_verified_stop'; })));

      if (vehicleFc.features.length) {
        var vf = vehicleFc.features[0];
        var station = store.getStation(vf.properties.currentStationId);
        results.push(_assert('the vehicle-presence feature\'s coordinate exactly matches its real station\'s coordinate (no interpolation)',
          !!station && vf.geometry.coordinates[0] === station.longitude && vf.geometry.coordinates[1] === station.latitude));
      }

      // ── 0818_SUBWAY_Full_Live_Map_Integration — full-network assertions ────
      var lib = SBE.MTASubwayStationLibrary;
      var pa = SBE.MTASubwayPaletteAuthority;
      var libReady = lib ? lib.importFromStaticModel() : { ok: false };

      var allRoutesFc = feat.buildAllRouteFeatures();
      var allRouteCount = store.getAllRoutes().length;
      results.push(_assert('buildAllRouteFeatures() covers every real route (not just one)',
        allRoutesFc.features.length > routeFc.features.length, { all: allRoutesFc.features.length, single: routeFc.features.length }));

      // §25.2 / §25.15: deterministic, collision-safe route feature IDs
      var routeIds1 = allRoutesFc.features.map(function (f) { return f.id; });
      var routeIds2 = feat.buildAllRouteFeatures().features.map(function (f) { return f.id; });
      results.push(_assert('route feature IDs are deterministic across repeated builds', JSON.stringify(routeIds1) === JSON.stringify(routeIds2)));
      var uniqueRouteIds = {}; var routeDupes = 0;
      routeIds1.forEach(function (id) { if (uniqueRouteIds[id]) routeDupes++; uniqueRouteIds[id] = true; });
      results.push(_assert('zero duplicate route feature IDs across the full network', routeDupes === 0, routeDupes));

      if (lib && libReady.ok) {
        var stationLibFc = feat.buildStationLibraryFeatures();
        results.push(_assert('buildStationLibraryFeatures() returns one feature per real Station Library record',
          stationLibFc.features.length === lib.getAllRecords().length, stationLibFc.features.length));
        results.push(_assert('every station feature id is a real stlib-* id (Station Library identity, not raw GTFS)',
          stationLibFc.features.every(function (f) { return /^stlib-\d{6}$/.test(f.id); })));
        var uniqueStationIds = {}; var stationDupes = 0;
        stationLibFc.features.forEach(function (f) { if (uniqueStationIds[f.id]) stationDupes++; uniqueStationIds[f.id] = true; });
        results.push(_assert('zero duplicate station feature IDs across the full network', stationDupes === 0, stationDupes));

        // §25.14: full-network feature counts collected in one call
        var full = feat.buildFullNetworkFeatureCollections();
        results.push(_assert('buildFullNetworkFeatureCollections() returns routes/stations/live_operational_state/logical_trains',
          !!full.routes && !!full.stations && !!full.live_operational_state && !!full.logical_trains));
        results.push(_assert('full-network routes count matches buildAllRouteFeatures()', full.routes.features.length === allRoutesFc.features.length));
        results.push(_assert('full-network stations count matches the real Station Library size', full.stations.features.length === lib.getAllRecords().length));
      }

      // ── 0818_SUBWAY_Logical_Rolling_Stock — buildLogicalTrainFeatures() ────
      var rs = SBE.SubwayLogicalRollingStockAuthority;
      if (rs) {
        var trainFc = feat.buildLogicalTrainFeatures();
        results.push(_assert('buildLogicalTrainFeatures() returns a valid FeatureCollection', trainFc.type === 'FeatureCollection' && Array.isArray(trainFc.features)));
        results.push(_assert('every logical train feature id is a real sr-train-* id (never a raw MTA trip id)',
          trainFc.features.every(function (f) { return /^sr-train-\d{6}$/.test(f.id); })));
        results.push(_assert('every logical train feature carries an explicit positionSource honesty marker (never "gps")',
          trainFc.features.every(function (f) { return f.properties.positionSource && f.properties.positionSource !== 'gps'; })));
      }

      // §25.6: palette-resolved route color changes, routeId never does
      if (pa) {
        var before = pa.getActivePaletteId();
        pa.setActivePalette('fashion_subway');
        var colorFashion = feat.buildRouteFeatures('subway:route:A').features[0].properties.resolvedColor;
        var idFashion = feat.buildRouteFeatures('subway:route:A').features[0].properties.routeId;
        pa.setActivePalette('mta_reference');
        var colorMta = feat.buildRouteFeatures('subway:route:A').features[0].properties.resolvedColor;
        var idMta = feat.buildRouteFeatures('subway:route:A').features[0].properties.routeId;
        pa.setActivePalette(before);
        results.push(_assert('switching palettes changes the resolved display color', colorFashion !== colorMta, [colorFashion, colorMta]));
        results.push(_assert('switching palettes NEVER changes route identity (routeId)', idFashion === idMta && idFashion === 'subway:route:A'));
      }

      var failed = results.filter(function (r) { return !r.pass; });
      var summary = { ok: failed.length === 0, total: results.length, failed: failed.length, results: results };
      console.log('[MTASubwayMapFeaturesTests] ' + (summary.ok ? 'PASS' : 'FAIL') + ' — ' + (results.length - failed.length) + '/' + results.length);
      if (failed.length) console.warn('[MTASubwayMapFeaturesTests] failures:', failed);
      return summary;
    });
  }

  SBE.MTASubwayMapFeaturesTests = { run: run };
  // See gtfsRealtimeBindings.tests.js for why this is deferred via setTimeout
  // (main.js's DOMContentLoaded handler replaces window._wos wholesale).
  function _bindDebug() {
    global._wos = global._wos || {};
    global._wos.debug = global._wos.debug || {};
    global._wos.debug.mtaSubwayMapFeatures = { runTests: run };
  }
  _bindDebug();
  global.setTimeout(_bindDebug, 300);
  global.setTimeout(_bindDebug, 1000);
})(window);
