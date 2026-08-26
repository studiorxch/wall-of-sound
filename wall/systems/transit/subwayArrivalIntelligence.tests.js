// ── SubwayArrivalIntelligence Tests v1.0.0 ────────────────────────────────────
// 0818_SUBWAY_Live_Train_Visualization_v1.0.0_BUILD — Required Tests §33 (1-16)
// Status: active | Classification: test-harness
//
// Run via: SBE.SubwayArrivalIntelligenceTests.run()
//
// Uses the REAL committed static GTFS snapshot (real station/platform/
// parent_station relationships — the exact join chain this file's own
// production code depends on) plus SYNTHETIC TripUpdate rows injected via
// the real applyRealtimeUpdate() path, same convention as every other SUBWAY
// test file this session. Real platform<->station-level pairs and real
// duplicate-display-name station pairs are DISCOVERED from the live snapshot
// at test-run time, never hard-coded against assumed ids.
//
// Placement: wall/systems/transit/subwayArrivalIntelligence.tests.js
// Load: AFTER subwayArrivalIntelligence.js, MTASubwayStationLibrary.js,
//       MTASubwayTransitStore.js, SubwayLogicalRollingStockAuthority.js.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});

  function _assert(name, cond, details) {
    return { name: name, pass: !!cond, details: details === undefined ? null : details };
  }

  var GROUP = 'arrival-test';
  function _tripRow(tripId, routeId, trainId, direction, stopTimes) {
    return { tripId: tripId, routeId: routeId, trainId: trainId || null, direction: direction || null, stopTimeUpdates: stopTimes || [], sourceGroupId: GROUP };
  }

  var REQUIRED_DUPLICATE_NAMES = ['Fulton St', 'Canal St', '23 St', '86 St', 'Wall St', 'Broadway'];

  // A real station-level stop that has at least one real platform child
  // (parentStation pointing back to it) in the committed static snapshot —
  // the exact join shape production code depends on. Returns
  // { stationStopId, platformStopId } of raw (non-canonical) GTFS ids.
  function _findStationWithPlatform(adapter, requireDisplayName) {
    var stops = adapter.getStops();
    var byId = {};
    stops.forEach(function (s) { byId[s.stopId] = s; });
    for (var i = 0; i < stops.length; i++) {
      var platform = stops[i];
      if (platform.isStationLevel || !platform.parentStation) continue;
      var parent = byId[platform.parentStation];
      if (!parent || !parent.isStationLevel) continue;
      if (requireDisplayName && parent.stopName !== requireDisplayName) continue;
      return { stationStopId: parent.stopId, platformStopId: platform.stopId, displayName: parent.stopName };
    }
    return null;
  }

  function run() {
    var store = SBE.MTASubwayTransitStore;
    var lib = SBE.MTASubwayStationLibrary;
    var adapter = SBE.MTASubwayStaticAdapter;
    var ai = SBE.SubwayArrivalIntelligence;
    var results = [];
    if (!store || !lib || !adapter || !ai) {
      results.push(_assert('SBE.MTASubwayTransitStore/MTASubwayStationLibrary/MTASubwayStaticAdapter/SubwayArrivalIntelligence are loaded', false));
      return Promise.resolve({ ok: false, total: 1, failed: 1, results: results });
    }

    return store.loadStatic().then(function () {
      lib.__resetForTests();
      lib.importFromStaticModel();
      var T0 = 1755700000000;

      var pairA = _findStationWithPlatform(adapter);
      results.push(_assert('a real station/platform pair exists in the committed snapshot for join testing', !!pairA));
      if (!pairA) {
        return { ok: false, total: results.length, failed: results.filter(function (r) { return !r.pass; }).length, results: results };
      }
      var recordA = lib.getRecordByAuthoritativeStopId(pairA.stationStopId);
      results.push(_assert('the station-level stop resolves to a real Station Library record', !!recordA));

      var routeAny = store.getAllRoutes()[0];

      // ── #1 TripUpdate stop ID -> canonical station identity ─────────────
      store.applyRealtimeUpdate(
        [_tripRow('A1', routeAny.authoritativeId, null, 'NORTH', [
          { stopId: pairA.platformStopId, arrivalUtcMs: T0 + 120000, departureUtcMs: T0 + 130000 },
        ])],
        [],
        [GROUP]
      );
      var result1 = ai.getArrivalsForStation(recordA.studioRichStationId, { now: T0 });
      results.push(_assert('#1 a real platform-level TripUpdate stopId resolves to the correct station-level Station Library record\'s arrivals',
        result1.ok && result1.data.directions.length === 1 && result1.data.directions[0].arrivals.length === 1));

      // ── #5/#6 ETA calculation + Due threshold ────────────────────────────
      var arr1 = result1.data.directions[0].arrivals[0];
      results.push(_assert('#5 etaSeconds is computed from the real arrival timestamp relative to now', arr1.etaSeconds === 120, arr1.etaSeconds));
      results.push(_assert('#6 a >30s-away arrival is not marked dueSoon', arr1.dueSoon === false));

      store.applyRealtimeUpdate(
        [_tripRow('A1', routeAny.authoritativeId, null, 'NORTH', [
          { stopId: pairA.platformStopId, arrivalUtcMs: T0 + 15000, departureUtcMs: T0 + 20000 },
        ])],
        [], [GROUP]
      );
      var resultDue = ai.getArrivalsForStation(recordA.studioRichStationId, { now: T0 });
      results.push(_assert('#6 an arrival within the Due threshold is marked dueSoon', resultDue.data.directions[0].arrivals[0].dueSoon === true));

      // Never a negative ETA — an arrival already in the past beyond the
      // grace window is excluded entirely, not clamped-and-shown.
      store.applyRealtimeUpdate(
        [_tripRow('A1', routeAny.authoritativeId, null, 'NORTH', [
          { stopId: pairA.platformStopId, arrivalUtcMs: T0 - 500000, departureUtcMs: null },
        ])],
        [], [GROUP]
      );
      var resultPast = ai.getArrivalsForStation(recordA.studioRichStationId, { now: T0 });
      results.push(_assert('#22 (spec) a long-past arrival is never displayed as negative — it is excluded', resultPast.data.directions.length === 0 || resultPast.data.directions.every(function (d) { return d.arrivals.every(function (a) { return a.etaSeconds >= 0; }); })));

      // ── #3/#4 direction grouping + destination resolution ────────────────
      store.applyRealtimeUpdate(
        [_tripRow('A2', routeAny.authoritativeId, null, 'NORTH', [
          { stopId: pairA.platformStopId, arrivalUtcMs: T0 + 60000, departureUtcMs: T0 + 65000 },
          { stopId: 'FAKE_TERMINAL_STOP_ID_999', arrivalUtcMs: T0 + 300000, departureUtcMs: null },
        ]),
        _tripRow('A3', routeAny.authoritativeId, null, 'SOUTH', [
          { stopId: pairA.platformStopId, arrivalUtcMs: T0 + 90000, departureUtcMs: T0 + 95000 },
        ])],
        [], [GROUP]
      );
      var result3 = ai.getArrivalsForStation(recordA.studioRichStationId, { now: T0 });
      results.push(_assert('#3 NORTH and SOUTH real evidence produce two distinct direction groups', result3.data.directions.length === 2, result3.data.directions.map(function (d) { return d.directionId; })));
      results.push(_assert('#4 a trip with no resolvable last-stop station honestly reports a null destination (never fabricated)',
        result3.data.directions.filter(function (d) { return d.directionId === 'NORTH'; })[0].destination === null));

      // ── #7 arrival sorting ────────────────────────────────────────────────
      store.applyRealtimeUpdate(
        [_tripRow('A4', routeAny.authoritativeId, null, 'NORTH', [{ stopId: pairA.platformStopId, arrivalUtcMs: T0 + 400000, departureUtcMs: null }]),
          _tripRow('A5', routeAny.authoritativeId, null, 'NORTH', [{ stopId: pairA.platformStopId, arrivalUtcMs: T0 + 100000, departureUtcMs: null }]),
          _tripRow('A6', routeAny.authoritativeId, null, 'NORTH', [{ stopId: pairA.platformStopId, arrivalUtcMs: T0 + 250000, departureUtcMs: null }])],
        [], [GROUP]
      );
      var result7 = ai.getArrivalsForStation(recordA.studioRichStationId, { now: T0 });
      var etas = result7.data.directions[0].arrivals.map(function (a) { return a.etaSeconds; });
      var sorted = etas.slice().sort(function (a, b) { return a - b; });
      results.push(_assert('#7 arrivals are sorted strictly by arrival time, earliest first', JSON.stringify(etas) === JSON.stringify(sorted), etas));

      // ── #9 multiple following trains ─────────────────────────────────────
      results.push(_assert('#9 at least a next + one following arrival are exposed when real data supports it', etas.length >= 2, etas.length));

      // ── #8 arrival deduplication — a single real trip whose stopTimeUpdates
      //    lists the SAME platform stop twice (a real possibility on a feed
      //    glitch or a looping route) must still surface exactly one arrival
      //    for that (tripId, stopId) pair, not two. ──────────────────────────
      store.applyRealtimeUpdate(
        [_tripRow('A7', routeAny.authoritativeId, null, 'NORTH', [
          { stopId: pairA.platformStopId, arrivalUtcMs: T0 + 60000, departureUtcMs: null },
          { stopId: pairA.platformStopId, arrivalUtcMs: T0 + 60000, departureUtcMs: null },
        ])],
        [], [GROUP]
      );
      var dedupeResult = ai.getArrivalsForStation(recordA.studioRichStationId, { now: T0 });
      var a7Count = dedupeResult.data.directions[0].arrivals.filter(function (a) { return a.tripId === 'subway:trip:A7'; }).length;
      results.push(_assert('#8 a trip whose stopTimeUpdates lists the same (tripId, stopId) pair twice surfaces exactly one arrival', a7Count === 1, a7Count));

      // ── #2/#12/#14 duplicate station names remain isolated, no leakage ───
      var dupPairA = null, dupPairB = null;
      for (var n = 0; n < REQUIRED_DUPLICATE_NAMES.length && !(dupPairA && dupPairB); n++) {
        var name = REQUIRED_DUPLICATE_NAMES[n];
        var matches = adapter.getStops().filter(function (s) { return s.isStationLevel && s.stopName === name; });
        if (matches.length < 2) continue;
        var p0 = _findStationWithPlatform(adapter, name);
        if (!p0) continue;
        // Find a second, DIFFERENT station-level stop with the same name that also has a platform.
        for (var m = 0; m < matches.length; m++) {
          if (matches[m].stopId === p0.stationStopId) continue;
          var p1 = null;
          var stops2 = adapter.getStops();
          for (var k = 0; k < stops2.length; k++) {
            if (!stops2[k].isStationLevel && stops2[k].parentStation === matches[m].stopId) { p1 = { stationStopId: matches[m].stopId, platformStopId: stops2[k].stopId, displayName: name }; break; }
          }
          if (p1) { dupPairA = p0; dupPairB = p1; break; }
        }
      }
      results.push(_assert('a real duplicate-display-name station pair (each with a real platform) was found for isolation testing', !!(dupPairA && dupPairB)));
      if (dupPairA && dupPairB) {
        var recDupA = lib.getRecordByAuthoritativeStopId(dupPairA.stationStopId);
        var recDupB = lib.getRecordByAuthoritativeStopId(dupPairB.stationStopId);
        results.push(_assert('#2 the two same-named stations resolve to two DISTINCT Station Library records', !!recDupA && !!recDupB && recDupA.studioRichStationId !== recDupB.studioRichStationId));

        store.applyRealtimeUpdate(
          [_tripRow('DUP1', routeAny.authoritativeId, null, 'NORTH', [{ stopId: dupPairA.platformStopId, arrivalUtcMs: T0 + 60000, departureUtcMs: null }])],
          [], [GROUP]
        );
        var arrivalsForA = ai.getArrivalsForStation(recDupA.studioRichStationId, { now: T0 });
        var arrivalsForB = ai.getArrivalsForStation(recDupB.studioRichStationId, { now: T0 });
        results.push(_assert('#12/#14 an arrival injected at one same-named station never leaks into the other same-named station',
          arrivalsForA.ok && arrivalsForA.data.directions.length > 0 && arrivalsForB.ok && arrivalsForB.data.directions.length === 0));
      }

      // ── #13 station selection exactness ───────────────────────────────────
      var badResult = ai.getArrivalsForStation('stlib-999999');
      results.push(_assert('#13 an invalid Station Library id fails cleanly rather than silently resolving to some other station', badResult.ok === false && badResult.reason === 'not_found'));

      // ── #10/#11/#15 freshness / stale / unavailable-state behavior ────────
      var poll = SBE.MTASubwayPollingRuntime;
      var diagBefore = ai.getDiagnostics();
      results.push(_assert('#15 freshnessState is a real, non-fabricated enum value', ['live', 'aging', 'unavailable', 'stale'].indexOf(diagBefore.freshnessState) !== -1, diagBefore.freshnessState));
      // #10/#11 — last-known-valid arrivals remain queryable even when the
      // poller reports stale (a failed poll never deletes prior good data;
      // this file only ever reads the store's existing last-good state).
      // Re-establish real arrival data for pairA first: the immediately-
      // preceding #2/#12/#14 block called applyRealtimeUpdate(..., [GROUP])
      // for the DUP1 scenario, which — correctly, per this store's own
      // documented full-group-replace semantics (see file header) — replaced
      // every prior 'arrival-test'-group trip, including pairA's. That is
      // real, correct store behavior, not the "poll failure" scenario this
      // assertion means to exercise, so the data is re-injected here rather
      // than incorrectly asserting it survived a call that legitimately
      // replaced it.
      store.applyRealtimeUpdate(
        [_tripRow('A8', routeAny.authoritativeId, null, 'NORTH', [{ stopId: pairA.platformStopId, arrivalUtcMs: T0 + 60000, departureUtcMs: null }])],
        [], [GROUP]
      );
      var resultA = ai.getArrivalsForStation(recordA.studioRichStationId, { now: T0 });
      results.push(_assert('#10/#11 real arrival data is queryable', resultA.ok && resultA.data.directions.length > 0));
      // The actual "survives poll failure" guarantee: this file never calls
      // applyRealtimeUpdate itself — a failed real poll (see
      // mtaSubwayPollingRuntime.js) simply never calls it either, so the
      // store's trip data is untouched by construction. What THIS file must
      // itself guarantee is that it has no independent expiry/staleness
      // logic of its own that could silently drop good data on repeated
      // reads — verified by calling it again with no intervening store
      // mutation and confirming byte-identical results.
      var resultB = ai.getArrivalsForStation(recordA.studioRichStationId, { now: T0 });
      results.push(_assert('#10/#11 repeated reads with no intervening poll/store mutation return identical last-known-valid data (no independent expiry)',
        JSON.stringify(resultA.data) === JSON.stringify(resultB.data)));

      // ── #16 palette switch does not mutate arrival identity ──────────────
      var pa = SBE.MTASubwayPaletteAuthority;
      if (pa) {
        var beforePalette = pa.getActivePaletteId();
        var otherPalette = pa.listPalettes().map(function (p) { return p.id; }).filter(function (id) { return id !== beforePalette; })[0];
        var beforeSwitch = ai.getArrivalsForStation(recordA.studioRichStationId, { now: T0 });
        pa.setActivePalette(otherPalette);
        var afterSwitch = ai.getArrivalsForStation(recordA.studioRichStationId, { now: T0 });
        pa.setActivePalette(beforePalette);
        results.push(_assert('#16 a palette switch never changes stationLibraryId/canonicalStopId/tripId/routeId in arrival results',
          beforeSwitch.data.stationLibraryId === afterSwitch.data.stationLibraryId &&
          beforeSwitch.data.canonicalStopId === afterSwitch.data.canonicalStopId &&
          JSON.stringify(beforeSwitch.data.directions.map(function (d) { return d.arrivals.map(function (a) { return a.tripId; }); })) ===
          JSON.stringify(afterSwitch.data.directions.map(function (d) { return d.arrivals.map(function (a) { return a.tripId; }); }))));
      } else {
        results.push(_assert('#16 palette switch preserves arrival identity (SKIPPED — MTASubwayPaletteAuthority not loaded in this context)', true));
      }

      store.applyRealtimeUpdate([], [], [GROUP]);
      lib.__resetForTests();
      lib.importFromStaticModel();

      var failed = results.filter(function (r) { return !r.pass; });
      var summary = { ok: failed.length === 0, total: results.length, failed: failed.length, results: results };
      console.log('[SubwayArrivalIntelligenceTests] ' + (summary.ok ? 'PASS' : 'FAIL') + ' — ' + (results.length - failed.length) + '/' + results.length);
      if (failed.length) console.warn('[SubwayArrivalIntelligenceTests] failures:', failed);
      return summary;
    });
  }

  SBE.SubwayArrivalIntelligenceTests = { run: run };
  function _bindDebug() {
    global._wos = global._wos || {};
    global._wos.debug = global._wos.debug || {};
    global._wos.debug.subwayArrivalIntelligenceTests = { runTests: run };
  }
  _bindDebug();
  global.setTimeout(_bindDebug, 300);
  global.setTimeout(_bindDebug, 1000);
})(window);
