// ── Subway3DStationActorLayer Tests v1.0.0 ────────────────────────────────────
// 0919_WOS_Subway_Tunnel_Vision_3D_Station_Integration_v1.0.0 (STATION-15)
// Status: active | Classification: test-harness (dependency-free)
//
// Covers the pure/structural seams this module exposes without requiring a
// real Mapbox map, a real WebGL context, or a real StationStructure3DBridge:
// dev-flag reading, the known-station list, and mountStation()'s own honest
// failure behavior when the bridge/THREE are unavailable. Real Mapbox
// custom-layer mounting, THREE.js scene construction against a real
// bridge, and live geographic placement are live-browser verification
// only (STATION-15's own human acceptance), same convention
// subway3DTrainActorLayer.tests.js already established for its own file.
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  function _assert(name, cond, details) {
    return { name: name, pass: !!cond, details: details === undefined ? null : details };
  }

  function run() {
    var layer = SBE.Subway3DStationActorLayer;
    var results = [];

    if (!layer) {
      results.push(_assert('SBE.Subway3DStationActorLayer is available', false));
      console.log('[Subway3DStationActorLayerTests] FAIL — module not available');
      return { ok: false, total: 1, failed: 1, results: results };
    }

    // 1. Known station list contains the real R42 gtfsStopId, is a copy (not the live array), and is small/explicit.
    (function () {
      var ids = layer.getKnownStationGtfsStopIds();
      results.push(_assert('known station list includes R42', ids.indexOf('R42') !== -1, ids));
      var ids2 = layer.getKnownStationGtfsStopIds();
      ids2.push('MUTATED');
      results.push(_assert('getKnownStationGtfsStopIds() returns a fresh copy each call, not the live array', layer.getKnownStationGtfsStopIds().indexOf('MUTATED') === -1));
    })();

    // 2. mountStation() fails honestly (returns false, mounts nothing) when StationStructure3DBridge is unavailable -- never a fabricated/substituted station.
    (function () {
      var prevBridge = SBE.StationStructure3DBridge;
      delete SBE.StationStructure3DBridge;
      try {
        var ok = layer.__test.mountStation('R42');
        results.push(_assert('mountStation() returns false when the bridge is unavailable', ok === false));
        results.push(_assert('no station is mounted as a result', layer.getMountedStationIds().indexOf('R42') === -1));
      } finally {
        if (prevBridge) SBE.StationStructure3DBridge = prevBridge;
      }
    })();

    // 3. mountStation() fails honestly for an unresolvable station id, even with a real-shaped bridge present -- never substitutes R42 or any other station.
    (function () {
      var prevBridge = SBE.StationStructure3DBridge;
      SBE.StationStructure3DBridge = {
        resolveKnownStationGeometry: function () { return null; },
        projectStationStructure3D: function () { throw new Error('should not be called for an unresolvable station'); },
        deriveStationWorldAnchor: function () { throw new Error('should not be called'); },
        deriveLevelPresentationDepthM: function () { throw new Error('should not be called'); },
      };
      try {
        var ok = layer.__test.mountStation('NOT_A_REAL_STATION');
        results.push(_assert('mountStation() returns false for an unresolvable station id', ok === false));
      } finally {
        if (prevBridge) SBE.StationStructure3DBridge = prevBridge; else delete SBE.StationStructure3DBridge;
      }
    })();

    // 4. Dev-flag reader honors the same `?subway3d=1` URL param convention subway3DTrainActorLayer.js already established.
    (function () {
      var prevSearch = global.location.search;
      try {
        Object.defineProperty(global, 'location', { value: { search: '?subway3d=1' }, configurable: true });
      } catch (e) { /* some environments don't allow redefining location -- skip this assertion rather than fail the run */ }
      if (global.location.search === '?subway3d=1') {
        results.push(_assert('readDevFlag() returns true for ?subway3d=1', layer.__test.readDevFlag() === true));
      }
    })();

    var failed = results.filter(function (r) { return !r.pass; });
    var summary = { ok: failed.length === 0, total: results.length, failed: failed.length, results: results };

    console.log('[Subway3DStationActorLayerTests] ' + (summary.ok ? 'PASS' : 'FAIL') +
      ' — ' + (results.length - failed.length) + '/' + results.length + ' assertions passed');
    if (failed.length) console.warn('[Subway3DStationActorLayerTests] failures:', failed);

    return summary;
  }

  SBE.Subway3DStationActorLayerTests = { run: run };

  global._wos = global._wos || {};
  global._wos.debug = global._wos.debug || {};
  global._wos.debug.subway3DStationActorLayer = { runTests: run };
})(window);
