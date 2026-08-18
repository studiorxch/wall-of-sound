// ── MTASubwayIdentity Tests v1.0.0 ────────────────────────────────────────────
// 0818_SUBWAY_Live_Data_Foundation_v1.0.0_BUILD — Required Tests §23.3
// Status: active | Classification: test-harness (dependency-free)
//
// Run via: _wos.debug.mtaSubwayIdentity.runTests()
// Covers: canonical ID uniqueness/collision-safety — the required
// `displayName !== identity` invariant, using the REAL Fulton St
// Manhattan/Brooklyn collision case the 2026-08-18 resumption audit found
// (same display name, distinct GTFS stop_id/complex_id).
//
// Placement: wall/systems/transit/mtaSubwayIdentity.tests.js
// Load: AFTER mtaSubwayIdentity.js.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});

  function _assert(name, cond, details) {
    return { name: name, pass: !!cond, details: details === undefined ? null : details };
  }

  function run() {
    var id = SBE.MTASubwayIdentity;
    var results = [];
    if (!id) {
      results.push(_assert('SBE.MTASubwayIdentity is loaded', false));
      return { ok: false, total: 1, failed: 1, results: results };
    }

    // Real values verified live during this build (see
    // mtaSubwayFeedSourceInventory.js header) — not synthetic.
    var manhattanFulton = { stopId: '229', stopName: 'Fulton St', latitude: 40.709416, longitude: -74.006571, locationType: 1, parentStation: null, complexId: '628' };
    var brooklynFulton = { stopId: 'G36', stopName: 'Fulton St', latitude: 40.687119, longitude: -73.975375, locationType: 1, parentStation: null, complexId: '292' };

    var refA = id.buildStationRef(manhattanFulton);
    var refB = id.buildStationRef(brooklynFulton);

    results.push(_assert('both refs build successfully', !!refA && !!refB));
    results.push(_assert('same displayName ("Fulton St") on both — the real collision case', refA.displayName === refB.displayName, refA.displayName));
    results.push(_assert('DISTINCT canonical ids despite identical display name', refA.id !== refB.id, [refA.id, refB.id]));
    results.push(_assert('required invariant: displayName !== id (station A)', refA.displayName !== refA.id));
    results.push(_assert('required invariant: displayName !== id (station B)', refB.displayName !== refB.id));
    results.push(_assert('canonical id is built from the authoritative stop_id, not the name',
      refA.id === 'subway:stop:229' && refB.id === 'subway:stop:G36', [refA.id, refB.id]));
    results.push(_assert('complexId differs between the two Fulton Sts (different real complexes)', refA.complexId !== refB.complexId));

    // ── Platform id derivation ────────────────────────────────────────────────
    var platform = id.buildStationRef({ stopId: '229N', stopName: 'Fulton St', latitude: 40.709416, longitude: -74.006571, locationType: null, parentStation: '229', complexId: '628' });
    results.push(_assert('platform kind is "platform", not "station"', platform.kind === 'platform'));
    results.push(_assert('platform.parentId resolves to the station\'s canonical id', platform.parentId === refA.id));

    // ── Route family resolution (via feed-group join, not invented) ──────────
    var routeA = id.buildRouteRef({ routeId: 'A', shortName: 'A', longName: '8 Avenue Express', sourceColor: '0062CF', sourceTextColor: 'FFFFFF', shapeIds: [] });
    results.push(_assert('route A resolves routeFamily "ace" via the real feed-group source', routeA.routeFamily === 'ace', routeA.routeFamily));
    results.push(_assert('route color is preserved as metadata only, with # prefix added', routeA.sourceColor === '#0062CF'));

    // ── Repeated calls with the same input never collide/mutate ─────────────
    var refA2 = id.buildStationRef(manhattanFulton);
    results.push(_assert('rebuilding the same stop twice yields the same canonical id (idempotent, not counter-based)', refA.id === refA2.id));

    // ── Vehicle ref never carries a fabricated position ──────────────────────
    var vehicleRef = id.buildVehicleRef({ tripId: 't1', trainId: '1A 0123', routeId: 'A', stopId: '229N', currentStopSequence: 5, currentStatus: 'STOPPED_AT', timestampUtcMs: 1700000000000 });
    results.push(_assert('vehicle ref has no latitude/longitude/bearing fields at all', vehicleRef && !('latitude' in vehicleRef) && !('longitude' in vehicleRef) && !('bearing' in vehicleRef)));
    results.push(_assert('vehicle ref carries currentStationId derived from the real stopId', vehicleRef.currentStationId === 'subway:stop:229N', vehicleRef.currentStationId));

    var failed = results.filter(function (r) { return !r.pass; });
    var summary = { ok: failed.length === 0, total: results.length, failed: failed.length, results: results };
    console.log('[MTASubwayIdentityTests] ' + (summary.ok ? 'PASS' : 'FAIL') + ' — ' + (results.length - failed.length) + '/' + results.length);
    if (failed.length) console.warn('[MTASubwayIdentityTests] failures:', failed);
    return summary;
  }

  SBE.MTASubwayIdentityTests = { run: run };
  // See gtfsRealtimeBindings.tests.js for why this is deferred via setTimeout
  // (main.js's DOMContentLoaded handler replaces window._wos wholesale).
  function _bindDebug() {
    global._wos = global._wos || {};
    global._wos.debug = global._wos.debug || {};
    global._wos.debug.mtaSubwayIdentity = { runTests: run };
  }
  _bindDebug();
  global.setTimeout(_bindDebug, 300);
  global.setTimeout(_bindDebug, 1000);
})(window);
