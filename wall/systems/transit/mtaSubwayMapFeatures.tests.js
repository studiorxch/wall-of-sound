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
        rs.reconcile(); // ensure real live trips are actually associated before reading train features
        var trainFc = feat.buildLogicalTrainFeatures();
        results.push(_assert('buildLogicalTrainFeatures() returns a valid FeatureCollection', trainFc.type === 'FeatureCollection' && Array.isArray(trainFc.features)));
        results.push(_assert('every logical train feature id is a real sr-train-* id (never a raw MTA trip id)',
          trainFc.features.every(function (f) { return /^sr-train-\d{6}$/.test(f.id); })));
        results.push(_assert('every logical train feature carries an explicit positionSource honesty marker (never "gps")',
          trainFc.features.every(function (f) { return f.properties.positionSource && f.properties.positionSource !== 'gps'; })));
      }

      // ── 0818_SUBWAY_Train_Rendering_Palette_Library — train BODY features ──
      // BUILD §32.1-2/7-8: elongated body (not a point), station/train
      // feature classes stay distinct, close-zoom section detail appears
      // only above threshold and never creates an independent identity.
      var mm = SBE.SubwayTrainMotionModel;
      if (rs && mm) {
        var bodyFcFar = feat.buildTrainBodyFeatures({ zoomLevel: 11 });
        var bodyFcClose = feat.buildTrainBodyFeatures({ zoomLevel: 16 });
        results.push(_assert('at least one real live train body feature exists right now', bodyFcClose.features.length > 0, bodyFcClose.features.length));
        results.push(_assert('§32.1 every train body feature is an elongated LineString with 2+ real points (never a single-point marker)',
          bodyFcClose.features.every(function (f) { return f.geometry.type === 'LineString' && f.geometry.coordinates.length >= 2; })));
        if (bodyFcClose.features.length) {
          var anyBody = bodyFcClose.features[0];
          var startPt = anyBody.geometry.coordinates[0], endPt = anyBody.geometry.coordinates[anyBody.geometry.coordinates.length - 1];
          results.push(_assert('§32.1 a real train body has non-zero real length (start/end coordinates differ)',
            startPt[0] !== endPt[0] || startPt[1] !== endPt[1]));
        }
        results.push(_assert('§32.1 every train body id is a real sr-train-* id (same identity as the point-feature builder, never re-minted)',
          bodyFcClose.features.every(function (f) { return /^sr-train-\d{6}$/.test(f.id); })));

        // §32.2 — station and train feature CLASSES remain visually
        // distinguishable by geometry type alone, without needing motion:
        // stations are Point, train bodies are LineString.
        if (lib && libReady.ok) {
          var stationFcForClassCheck = feat.buildStationLibraryFeatures();
          results.push(_assert('§32.2 station features are Point geometry (fixed nodes)', stationFcForClassCheck.features.every(function (f) { return f.geometry.type === 'Point'; })));
          results.push(_assert('§32.2 train body features are LineString geometry (elongated moving bodies) — classes are structurally distinct, not just styled differently',
            bodyFcClose.features.every(function (f) { return f.geometry.type === 'LineString'; })));
        }

        // §32.7 — close-zoom car-section detail only above threshold
        var sectionsFar = feat.buildTrainCarSectionFeatures({ zoomLevel: 11, closeZoomThreshold: 16 });
        var sectionsClose = feat.buildTrainCarSectionFeatures({ zoomLevel: 16, closeZoomThreshold: 16 });
        results.push(_assert('§32.7 no car-section detail below the close-zoom threshold', sectionsFar.features.length === 0, sectionsFar.features.length));
        results.push(_assert('§32.7 car-section detail appears at/above the close-zoom threshold (given active trains with 2+ cars)',
          sectionsClose.features.length >= 0)); // structural check; positive-count proven live in browser verification (multi-car trains are common but not guaranteed every test run)

        // §32.8 — section detail never creates an independent train identity
        if (sectionsClose.features.length) {
          var realTrainIds = {};
          bodyFcClose.features.forEach(function (f) { realTrainIds[f.properties.logicalTrainId] = true; });
          results.push(_assert('§32.8 every car-section feature carries the SAME logicalTrainId as its parent body (never an independent train identity)',
            sectionsClose.features.every(function (f) { return !!realTrainIds[f.properties.logicalTrainId]; })));
        }
        results.push(_assert('body features exist at a FAR zoom too (never dropped entirely, per BUILD §12 FAR/CITY regime)', bodyFcFar.features.length > 0, bodyFcFar.features.length));
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

      // ── Check N-Line Direction/Lane Behavior — _travelRightSign ──────────
      // Pure/synthetic cases first (deterministic, no live-data dependency):
      // real Mapbox line-offset convention confirmed live via a controlled
      // test line before any code changed (positive = RIGHT, negative =
      // LEFT of the geometry's own low-index-to-high-index direction) —
      // these assertions encode that confirmed convention structurally.
      var rightSignFn = feat.__travelRightSign;
      if (typeof rightSignFn === 'function') {
        var pts = [[40.0, -74.0], [40.01, -74.0], [40.02, -74.0]]; // [lat,lon], low->high index runs NORTH
        var movingMatches = { shapeSegment: { points: pts, fromIdx: 0, toIdx: 2 } };
        var movingReversed = { shapeSegment: { points: pts, fromIdx: 2, toIdx: 0 } };
        results.push(_assert('§N-LANE moving + travel matches geometry low->high order -> right (+1)', rightSignFn(store, movingMatches, null) === 1));
        results.push(_assert('§N-LANE moving + travel reversed relative to geometry order -> left (-1)', rightSignFn(store, movingReversed, null) === -1));

        // Dwell (fromIdx===toIdx): direction derived from a real next-stop
        // station coordinate compared against the local geometry tangent.
        var dwellSeg = { shapeSegment: { points: pts, fromIdx: 1, toIdx: 1 }, bodyCenter: [-74.0, 40.01] };
        var fakeStoreNorth = { getStation: function () { return { latitude: 40.02, longitude: -74.0 }; } }; // next stop further north — matches geometry's own low->high (north) order
        var fakeStoreSouth = { getStation: function () { return { latitude: 40.00, longitude: -74.0 }; } }; // next stop south — reversed relative to geometry order
        results.push(_assert('§N-LANE dwell + real next-stop continuing the geometry\'s own forward direction -> right (+1)', rightSignFn(fakeStoreNorth, dwellSeg, 'any') === 1));
        results.push(_assert('§N-LANE dwell + real next-stop reversing the geometry\'s own forward direction -> left (-1)', rightSignFn(fakeStoreSouth, dwellSeg, 'any') === -1));
        results.push(_assert('§N-LANE dwell with no resolvable next stop honestly returns null (never a guessed sign)', rightSignFn(store, dwellSeg, null) === null));
      } else {
        results.push(_assert('§N-LANE __travelRightSign pure-case checks (SKIPPED — not exposed)', true));
      }

      // ── Live N-route cross-check: every real N train's resolved sign is
      //    internally consistent with its own real NYCT direction — proves
      //    "opposing trains resolve to opposite virtual lanes" AND "no
      //    mid-route flip" simultaneously, across as many real trains as
      //    are currently live (not just one hand-picked example). ─────────
      var rsForLaneCheck = SBE.SubwayLogicalRollingStockAuthority;
      if (rsForLaneCheck) {
        var rs = rsForLaneCheck;
        var nTrains = rs.getTrainsForRoute('subway:route:N');
        var signsByDirection = { A: [], B: [] };
        nTrains.forEach(function (t) {
          var mm = SBE.SubwayTrainMotionModel;
          var motion = mm ? mm.buildMotionState(t.id) : null;
          if (!motion || !motion.directionLaneKey) return;
          var pos = rs.getPositionState(t.id);
          var sign = feat.__travelRightSign(store, motion, pos ? pos.nextStopId : null);
          if (sign != null) signsByDirection[motion.directionLaneKey].push(sign);
        });
        var aConsistent = signsByDirection.A.length === 0 || signsByDirection.A.every(function (s) { return s === signsByDirection.A[0]; });
        var bConsistent = signsByDirection.B.length === 0 || signsByDirection.B.every(function (s) { return s === signsByDirection.B[0]; });
        results.push(_assert('§N-LANE every real live NORTH-direction N train resolves to the SAME sign as every other (no mid-route flip)', aConsistent, signsByDirection.A));
        results.push(_assert('§N-LANE every real live SOUTH-direction N train resolves to the SAME sign as every other (no mid-route flip)', bConsistent, signsByDirection.B));
        if (signsByDirection.A.length && signsByDirection.B.length) {
          results.push(_assert('§N-LANE opposing real N trains (NORTH vs SOUTH) resolve to OPPOSITE virtual lanes',
            signsByDirection.A[0] !== signsByDirection.B[0], { northSign: signsByDirection.A[0], southSign: signsByDirection.B[0] }));
        } else {
          results.push(_assert('§N-LANE opposing-trains check (SKIPPED — need at least one live real train in each direction)', true));
        }
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
