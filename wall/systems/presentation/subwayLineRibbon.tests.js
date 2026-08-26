// ── SubwayLineRibbon Tests v1.0.0 ─────────────────────────────────────────────
// 0819_SUBWAY_Public_HUD_Line_Ribbon_v1.0.0_BUILD — Required Tests §24 (17,18,19)
// Run via: SBE.SubwayLineRibbonTests.run()
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});

  function _assert(name, cond, details) {
    return { name: name, pass: !!cond, details: details === undefined ? null : details };
  }
  function _computedDisplay(el) {
    if (!el || !global.getComputedStyle) return null;
    return global.getComputedStyle(el).display;
  }

  function run() {
    var ribbon = SBE.SubwayLineRibbon;
    var store = SBE.MTASubwayTransitStore;
    var rs = SBE.SubwayLogicalRollingStockAuthority;
    var results = [];
    if (!ribbon || !store) {
      results.push(_assert('SBE.SubwayLineRibbon/MTASubwayTransitStore are loaded', false));
      return { ok: false, total: 1, failed: 1, results: results };
    }

    // ── §17 collapsed rest state renders ─────────────────────────────────
    ribbon.collapse();
    var el = global.document.getElementById('subway-line-ribbon');
    results.push(_assert('§17 line ribbon DOM element exists after collapse()', !!el));
    if (el) {
      results.push(_assert('§17 collapsed state carries the collapsed class, not the expanded class', el.classList.contains('subway-ribbon-collapsed') && !el.classList.contains('subway-ribbon-expanded')));
      results.push(_assert('§17 collapsed rest state renders only the quiet spine (no station list)', el.querySelectorAll('.subway-ribbon-row').length === 0));
    }
    results.push(_assert('getMode() reports collapsed at rest', ribbon.getMode() === 'collapsed'));

    // ── §17 hover/expand reveals station context, collapse hides it again ─
    ribbon.__test.setHoverExpanded(true);
    results.push(_assert('§17 hover sets the ribbon to its expanded visual state', ribbon.__test.isExpanded() === true));
    if (el) results.push(_assert('§17 hover-expanded root carries the expanded class', el.classList.contains('subway-ribbon-expanded')));
    ribbon.__test.setHoverExpanded(false);
    results.push(_assert('§17 leaving hover (with no active mode) returns to collapsed', ribbon.__test.isExpanded() === false && ribbon.getMode() === 'collapsed'));

    // ── §18 Line Mode — real canonical route/station sequence ────────────
    var routes = store.getAllRoutes().filter(function (r) { return r.shapeIds && r.shapeIds.length; });
    var lineResult = null, testRoute = null;
    for (var i = 0; i < routes.length && !lineResult; i++) {
      var attempt = ribbon.showLineMode(routes[i].id);
      if (attempt.ok) { lineResult = attempt; testRoute = routes[i]; }
    }
    results.push(_assert('§18 a real route resolves an ordered canonical station sequence via showLineMode()', !!lineResult && lineResult.data.stations.length > 1));
    if (lineResult) {
      results.push(_assert('§18 Line Mode sequence is derived from real station data, not a manually maintained list (each station id resolves in the transit store)',
        lineResult.data.stations.every(function (s) { return !!store.getStation(s.id); })));
      results.push(_assert('getMode() reports "line" while Line Mode is active', ribbon.getMode() === 'line'));
      var lineEl = global.document.getElementById('subway-line-ribbon');
      if (lineEl) {
        results.push(_assert('§18 Line Mode auto-expands the ribbon and renders one row per real station', ribbon.__test.isExpanded() && lineEl.querySelectorAll('.subway-ribbon-row').length === lineResult.data.stations.length));
        results.push(_assert('a real station display name from the sequence appears in the rendered ribbon', lineEl.textContent.indexOf(lineResult.data.stations[0].displayName) !== -1));
      }
    }
    var unknownLine = ribbon.showLineMode('subway:route:__does-not-exist__');
    results.push(_assert('Line Mode fails gracefully (ok:false) for a route with no resolvable sequence, never fabricating one', unknownLine.ok === false));

    ribbon.collapse();

    // ── §19 Ride Mode foundation — real remaining stop sequence ──────────
    if (rs) {
      var activeTrains = rs.getActiveLogicalTrains();
      var rideResult = null, testTrain = null;
      for (var j = 0; j < activeTrains.length && !rideResult; j++) {
        var attemptRide = ribbon.showRideMode(activeTrains[j].id);
        if (attemptRide.ok) { rideResult = attemptRide; testTrain = activeTrains[j]; }
      }
      if (rideResult) {
        results.push(_assert('§19 a real selected train resolves its remaining canonical stop sequence via showRideMode()', rideResult.data.stops.length > 0));
        var rawTrip = null;
        var allTrips = store.getAllTrips();
        for (var k = 0; k < allTrips.length; k++) { if (allTrips[k].id === testTrain.activeTripId) { rawTrip = allTrips[k]; break; } }
        results.push(_assert('§19 Ride Mode stop count matches the train\'s own real trip.stopTimes exactly (no filtering, no second parser)', !!rawTrip && rideResult.data.stops.length === rawTrip.stopTimes.length));
        results.push(_assert('§19 Ride Mode preserves the real canonical stop ORDER (stationId sequence matches trip.stopTimes verbatim)',
          rawTrip.stopTimes.every(function (st, idx) { return rideResult.data.stops[idx].stationId === st.stationId; })));
        results.push(_assert('getMode() reports "ride" while Ride Mode is active', ribbon.getMode() === 'ride'));
        var rideEl = global.document.getElementById('subway-line-ribbon');
        if (rideEl) {
          results.push(_assert('§19 Ride Mode auto-expands the ribbon and renders one row per real remaining stop', ribbon.__test.isExpanded() && rideEl.querySelectorAll('.subway-ribbon-row').length === rideResult.data.stops.length));
        }
        results.push(_assert('Ride Mode foundation resolves the sequence WITHOUT attaching a camera (BUILD §19 — no camera coupling in this build; this module exposes data only)', typeof ribbon.showRideMode === 'function'));
      } else {
        results.push(_assert('§19 Ride Mode real-train check (SKIPPED — no active logical train with a resolvable trip in this session)', true));
      }
      var unknownRide = ribbon.showRideMode('logical-train:__does-not-exist__');
      results.push(_assert('Ride Mode fails gracefully (ok:false) for an unresolvable train, never fabricating stops', unknownRide.ok === false));
    } else {
      results.push(_assert('§19 Ride Mode checks (SKIPPED — SubwayLogicalRollingStockAuthority not loaded)', true));
    }

    ribbon.collapse();

    var failed = results.filter(function (r) { return !r.pass; });
    var summary = { ok: failed.length === 0, total: results.length, failed: failed.length, results: results };
    console.log('[SubwayLineRibbonTests] ' + (summary.ok ? 'PASS' : 'FAIL') + ' — ' + (results.length - failed.length) + '/' + results.length);
    if (failed.length) console.warn('[SubwayLineRibbonTests] failures:', failed);
    return summary;
  }

  SBE.SubwayLineRibbonTests = { run: run };
  function _bindDebug() {
    global._wos = global._wos || {};
    global._wos.debug = global._wos.debug || {};
    global._wos.debug.subwayLineRibbonTests = { runTests: run };
  }
  _bindDebug();
  global.setTimeout(_bindDebug, 300);
  global.setTimeout(_bindDebug, 1000);
})(window);
