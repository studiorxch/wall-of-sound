// ── MTASubwayMapLayer Tests v1.0.0 ────────────────────────────────────────────
// 0818_SUBWAY_Full_Live_Map_Integration_v1.0.0_BUILD — Required Tests §25.8-9, §16
// Status: active | Classification: test-harness (dependency-free)
//
// Run via: _wos.debug.mtaSubwayMapLayer.runTests()
//
// Covers: the full selection chain (Map Feature ID → stlib-* ID → exact
// Station Library Record, no name-based fallback anywhere) and duplicate-
// name disambiguation for every name the BUILD requires testing: Fulton St,
// Canal St, 23 St, 86 St, Wall St, Broadway. Runs whether or not a real
// Mapbox map is present — selectStation()/getSelectedStation() are pure
// state + Station Library lookups; feature-state calls are best-effort and
// map-optional by design (see mtaSubwayMapLayer.js).
//
// Placement: wall/systems/presentation/mtaSubwayMapLayer.tests.js
// Load: AFTER mtaSubwayMapLayer.js.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});

  function _assert(name, cond, details) {
    return { name: name, pass: !!cond, details: details === undefined ? null : details };
  }

  var REQUIRED_DUPLICATE_NAMES = ['Fulton St', 'Canal St', '23 St', '86 St', 'Wall St', 'Broadway'];

  function run() {
    var layer = SBE.MTASubwayMapLayer;
    var lib = SBE.MTASubwayStationLibrary;
    var store = SBE.MTASubwayTransitStore;
    var results = [];
    if (!layer || !lib || !store) {
      results.push(_assert('SBE.MTASubwayMapLayer/MTASubwayStationLibrary/MTASubwayTransitStore are loaded', false));
      return Promise.resolve({ ok: false, total: 1, failed: 1, results: results });
    }

    return store.loadStatic().then(function () {
      lib.importFromStaticModel();

      // ── §15: Map Feature ID → stlib-* ID → exact Station Library Record ──
      var allRecords = lib.getAllRecords();
      results.push(_assert('real Station Library records exist to select from', allRecords.length > 0, allRecords.length));

      var sample = allRecords[0];
      var selectResult = layer.selectStation(sample.studioRichStationId);
      results.push(_assert('selectStation() with a real stlib-* id succeeds', selectResult.ok === true));
      results.push(_assert('selectStation() resolves to the EXACT record (same object identity fields)',
        selectResult.data.studioRichStationId === sample.studioRichStationId &&
        selectResult.data.authoritativeLink.gtfsStopId === sample.authoritativeLink.gtfsStopId));

      var current = layer.getSelectedStation();
      results.push(_assert('getSelectedStation() returns the exact selected record after selection', !!current && current.studioRichStationId === sample.studioRichStationId));

      layer.clearSelection();
      results.push(_assert('clearSelection() clears the selection', layer.getSelectedStation() === null));

      // ── No name-based fallback: an invalid id must fail cleanly, never
      //    silently resolve to "some station with a similar name" ──────────
      var badResult = layer.selectStation('stlib-999999');
      results.push(_assert('selecting an id with no matching record fails explicitly (not_found), never falls back to a name match', badResult.ok === false && badResult.reason === 'not_found'));
      var badByName = layer.selectStation(sample.operational.displayName); // a display name is NOT a valid id
      results.push(_assert('passing a display NAME instead of a stlib-* id is rejected, not silently treated as an id', badByName.ok === false));

      // ── §16 / §25.8-9: duplicate-name disambiguation for every required name ─
      REQUIRED_DUPLICATE_NAMES.forEach(function (name) {
        var group = allRecords.filter(function (r) { return r.operational.displayName === name; });
        results.push(_assert('"' + name + '" has 2+ real distinct Station Library records (a genuine duplicate-name case)', group.length >= 2, group.length));

        if (group.length >= 2) {
          // Select each one in turn; each selection must resolve to ITS OWN
          // distinct record — never conflated with a sibling of the same name.
          var resolvedIds = group.map(function (r) {
            var res = layer.selectStation(r.studioRichStationId);
            return res.ok ? res.data.studioRichStationId : null;
          });
          var allDistinct = new Set(resolvedIds).size === resolvedIds.length && resolvedIds.every(Boolean);
          results.push(_assert('every "' + name + '" record selects to its OWN distinct id (no collision across duplicates)', allDistinct, resolvedIds));

          var allMatchInput = group.every(function (r, i) { return resolvedIds[i] === r.studioRichStationId; });
          results.push(_assert('every "' + name + '" selection resolves to exactly the record that was selected (1:1, no cross-talk)', allMatchInput));
        }
      });
      layer.clearSelection();

      // ── Map feature IDs actually used for selection match Station Library
      //    feature IDs (the real map-click path uses this exact property) ───
      var feat = SBE.MTASubwayMapFeatures;
      if (feat) {
        var stationFc = feat.buildStationLibraryFeatures();
        var sampleFeature = stationFc.features[0];
        results.push(_assert('a real map feature\'s id/properties.studioRichStationId round-trips through selectStation()',
          sampleFeature.id === sampleFeature.properties.studioRichStationId &&
          layer.selectStation(sampleFeature.properties.studioRichStationId).ok === true));
        layer.clearSelection();
      }

      // ── v4.0.0 (0818_SUBWAY_Live_Train_Visualization_v1.0.0_BUILD §17, §32
      //    #9, #12) — train-follow foundation + diagnostics field. Runs
      //    whether or not a real Mapbox map is present (followTrain()/
      //    unfollowTrain() are map-optional, same convention as selection). ──
      var rs = SBE.SubwayLogicalRollingStockAuthority;
      if (rs) {
        var anyTrain = rs.getAllLogicalTrains()[0];
        if (anyTrain) {
          var followResult = layer.followTrain(anyTrain.id);
          results.push(_assert('followTrain() with a real logical train id succeeds', followResult.ok === true));
          results.push(_assert('getFollowedTrainId() reflects the exact followed train', layer.getFollowedTrainId() === anyTrain.id));
          results.push(_assert('diagnostics.followedTrainId reflects the followed train', layer.getDiagnostics().followedTrainId === anyTrain.id));
          layer.unfollowTrain();
          results.push(_assert('unfollowTrain() clears the followed train', layer.getFollowedTrainId() === null));
        } else {
          results.push(_assert('train-follow foundation (SKIPPED — no active logical train in this test context)', true));
        }
        var badFollow = layer.followTrain('sr-train-999999');
        results.push(_assert('followTrain() with an invalid id fails explicitly, never silently follows nothing', badFollow.ok === false && badFollow.reason === 'not_found'));
      }

      // ── v5.0.0 (0818_SUBWAY_Train_Rendering_Palette_Library_v1.0.0_BUILD
      //    §26-30, §35) — diagnostics field + lane-offset scaling. Map-optional,
      //    same convention as the rest of this file. ──────────────────────────
      var diag = layer.getDiagnostics();
      results.push(_assert('diagnostics.trainBodyByMotionPhase is present (BUILD §17-24 motion-phase breakdown)', typeof diag.trainBodyByMotionPhase === 'object' && diag.trainBodyByMotionPhase !== null));
      results.push(_assert('§35.3 Official MTA Reference is the active default palette', diag.activeSubwayPalette === 'mta_reference'));
      var offFar = layer.__laneOffsetPxForZoom(10);
      var offClose = layer.__laneOffsetPxForZoom(18);
      results.push(_assert('§33.6 lane offset scales with zoom (larger, more separable at closer zoom)', offClose > offFar, [offFar, offClose]));

      // ── "SUBWAY Train Contrast / LOD Fix" — zoom-based grey->route color
      //    blend + casing layer. Map-optional pure-function checks. ─────────
      results.push(_assert('LOD blend is fully neutral (0) at/below the FAR/MID boundary', layer.__routeColorBlendFactor(10) === 0 && layer.__routeColorBlendFactor(12) === 0));
      results.push(_assert('LOD blend is fully route-colored (1) at/above the CLOSE threshold', layer.__routeColorBlendFactor(16) === 1 && layer.__routeColorBlendFactor(20) === 1));
      var midBlend = layer.__routeColorBlendFactor(14);
      results.push(_assert('LOD blend is a partial, continuous value strictly between 0 and 1 mid-way through the NEAR range (never a hard switch)', midBlend > 0 && midBlend < 1, midBlend));
      var blendMono = true, prevBlend = -1;
      for (var z = 10; z <= 18; z += 0.5) { var b = layer.__routeColorBlendFactor(z); if (b < prevBlend - 1e-9) blendMono = false; prevBlend = b; }
      results.push(_assert('LOD blend factor is monotonic across the full zoom range (no jumps backward)', blendMono));

      results.push(_assert('__blendHexColors(a,b,0) returns color A exactly (fully neutral)', layer.__blendHexColors('#C9CDD3', '#D82233', 0) === '#C9CDD3'));
      results.push(_assert('__blendHexColors(a,b,1) returns color B exactly (fully route-colored)', layer.__blendHexColors('#C9CDD3', '#D82233', 1) === '#D82233'));
      var midColor = layer.__blendHexColors('#000000', '#FFFFFF', 0.5);
      results.push(_assert('__blendHexColors(a,b,0.5) returns a real midpoint blend (black/white -> mid grey)', midColor === '#808080', midColor));

      var diagCasing = layer.getDiagnostics();
      results.push(_assert('activeSubwayPalette still resolves after LOD fix (palette wiring intact)', typeof diagCasing.activeSubwayPalette === 'string'));

      var failed = results.filter(function (r) { return !r.pass; });
      var summary = { ok: failed.length === 0, total: results.length, failed: failed.length, results: results };
      console.log('[MTASubwayMapLayerTests] ' + (summary.ok ? 'PASS' : 'FAIL') + ' — ' + (results.length - failed.length) + '/' + results.length);
      if (failed.length) console.warn('[MTASubwayMapLayerTests] failures:', failed);
      return summary;
    });
  }

  SBE.MTASubwayMapLayerTests = { run: run };
  function _bindDebug() {
    global._wos = global._wos || {};
    global._wos.debug = global._wos.debug || {};
    global._wos.debug.mtaSubwayMapLayerTests = { runTests: run }; // named "...Tests" to avoid colliding with mtaSubwayMapLayer.js's own _wos.debug.subway namespace
  }
  _bindDebug();
  global.setTimeout(_bindDebug, 300);
  global.setTimeout(_bindDebug, 1000);
})(window);
