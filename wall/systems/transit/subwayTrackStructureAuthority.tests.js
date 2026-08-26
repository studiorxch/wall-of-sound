// ── SubwayTrackStructureAuthority Tests v1.0.0 ───────────────────────────────
// Status: active | Classification: test-harness (dependency-free)
// Truth-only authority — these tests never touch altitude, visibility/LOD,
// motion, itinerary, Sunroof, or audio. Real snapshot structural checks use
// the actual generated wall/data/subway/mtaSubwayTrackStructureSnapshot.json
// (injected via __setSnapshotForTests, never a live fetch) so this stays a
// dependency-free, no-network browser-console harness like every other
// .tests.js file in this codebase.
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  function _assert(name, cond, details) {
    return { name: name, pass: !!cond, details: details === undefined ? null : details };
  }

  function _fixtureSnapshot() {
    return {
      schemaVersion: '1.0.0',
      generatedAt: '2026-08-26T00:00:00.000Z',
      sourceDataset: { name: 'NYC Subway Lines (ROW_TYPE)', crs: 'EPSG:4326' },
      rowTypeNames: {
        '1': 'Subterranean', '2': 'Elevated', '3': 'Surface', '4': 'Hidden',
        '5': 'Open Cut Depression', '6': 'Embankment', '7': 'Viaduct', '8': 'Subterranean Coincident with Boundary',
      },
      normalizedMap: {
        '1': 'underground', '2': 'elevated', '3': 'at_grade', '4': 'underground',
        '5': 'open_cut', '6': 'embankment', '7': 'elevated', '8': 'underground',
      },
      stats: { totalPoints: 100, matched: 90, unmatched: 10 },
      segments: [
        { shapeId: 'FIX1', fromIdx: 0, toIdx: 49, structureType: 'underground', sourceRowType: '1', sourceRowTypeName: 'Subterranean', fromLevelCode: 1, toLevelCode: 1, line: 'TEST LINE', route: '1', division: '1', confidence: 'high', avgDistM: 2.5, ambiguous: false, transitionBoundary: false },
        { shapeId: 'FIX1', fromIdx: 50, toIdx: 99, structureType: 'elevated', sourceRowType: '2', sourceRowTypeName: 'Elevated', fromLevelCode: 21, toLevelCode: 21, line: 'TEST LINE', route: '1', division: '1', confidence: 'high', avgDistM: 1.8, ambiguous: false, transitionBoundary: true },
        { shapeId: 'FIX2', fromIdx: 0, toIdx: 19, structureType: 'at_grade', sourceRowType: '3', sourceRowTypeName: 'Surface', fromLevelCode: 13, toLevelCode: 13, line: 'FIX2 LINE', route: '2', division: '1', confidence: 'high', avgDistM: 0.5, ambiguous: false, transitionBoundary: false },
      ],
    };
  }

  function run() {
    var authority = SBE.SubwayTrackStructureAuthority;
    var results = [];

    if (!authority || !authority.classifyForShapeSegment) {
      results.push(_assert('SBE.SubwayTrackStructureAuthority.classifyForShapeSegment is available', false));
      console.log('[SubwayTrackStructureAuthorityTests] FAIL — module not available');
      return { ok: false, total: 1, failed: 1, results: results };
    }

    // ── Not-loaded behavior ────────────────────────────────────────────────
    (function () {
      authority.__resetForTests();
      var r = authority.classifyForShapeSegment('FIX1', 0, 10);
      results.push(_assert('classifyForShapeSegment before load returns unknown, source not_loaded',
        r.structureType === 'unknown' && r.source === 'not_loaded', r));
      var p = authority.classifyPosition(-73.99, 40.73);
      results.push(_assert('classifyPosition before load returns unknown, source not_loaded',
        p.structureType === 'unknown' && p.source === 'not_loaded', p));
      results.push(_assert('isLoaded() is false before load', authority.isLoaded() === false));
    })();

    // ── Exact and overlap-based classifyForShapeSegment behavior ────────────
    (function () {
      authority.__setSnapshotForTests(_fixtureSnapshot());
      results.push(_assert('isLoaded() is true after __setSnapshotForTests', authority.isLoaded() === true));

      var exact = authority.classifyForShapeSegment('FIX1', 0, 49);
      results.push(_assert('exact-range query returns the matching underground segment',
        exact.structureType === 'underground' && exact.sourceRowType === '1' && exact.sourceRowTypeName === 'Subterranean', exact));

      var partial = authority.classifyForShapeSegment('FIX1', 30, 45);
      results.push(_assert('fully-contained sub-range query still resolves to the covering segment',
        partial.structureType === 'underground', partial));

      // Query spans the real transition (idx 0..99, i.e. both stored segments) —
      // greatest-overlap wins, never silently averaged or first-wins.
      var spanning = authority.classifyForShapeSegment('FIX1', 0, 79);
      results.push(_assert('a query spanning a real structure transition resolves to the GREATEST-overlap segment (underground, 50 pts, not elevated, 30 pts)',
        spanning.structureType === 'underground', spanning));

      var reversedArgs = authority.classifyForShapeSegment('FIX1', 79, 0); // fromIdx > toIdx — must not break
      results.push(_assert('fromIdx > toIdx (reversed args) is handled without throwing, same result as forward order',
        reversedArgs.structureType === 'underground', reversedArgs));

      var elevatedQuery = authority.classifyForShapeSegment('FIX1', 60, 90);
      results.push(_assert('query entirely within the second stored segment returns elevated',
        elevatedQuery.structureType === 'elevated' && elevatedQuery.transitionBoundary === true, elevatedQuery));

      var otherShape = authority.classifyForShapeSegment('FIX2', 0, 19);
      results.push(_assert('a different shapeId resolves independently (at_grade)',
        otherShape.structureType === 'at_grade', otherShape));

      var unknownShape = authority.classifyForShapeSegment('NOT_A_REAL_SHAPE', 0, 10);
      results.push(_assert('an unrecognized shapeId returns unknown, source shape_not_in_snapshot',
        unknownShape.structureType === 'unknown' && unknownShape.source === 'shape_not_in_snapshot', unknownShape));

      var noOverlap = authority.classifyForShapeSegment('FIX2', 500, 510);
      results.push(_assert('a range with no overlapping stored segment returns unknown, source no_overlapping_segment',
        noOverlap.structureType === 'unknown' && noOverlap.source === 'no_overlapping_segment', noOverlap));

      var badArgs = authority.classifyForShapeSegment(null, 0, 10);
      results.push(_assert('a null shapeId returns unknown without throwing',
        badArgs.structureType === 'unknown', badArgs));
    })();

    // ── classifyPosition (secondary, coordinate-based) ──────────────────────
    (function () {
      var savedAdapter = SBE.MTASubwayStaticAdapter;
      // Stub: FIX1's shape is a straight line running north along lon=-74.000;
      // FIX2's shape sits far away. A query point right on FIX1's underground
      // stretch (idx < 50) should resolve to 'underground'.
      SBE.MTASubwayStaticAdapter = {
        getShapePoints: function (shapeId) {
          if (shapeId === 'FIX1') {
            var pts = [];
            for (var i = 0; i < 100; i++) pts.push([40.700 + i * 0.0001, -74.000]); // [lat, lon]
            return pts;
          }
          if (shapeId === 'FIX2') {
            var pts2 = [];
            for (var j = 0; j < 20; j++) pts2.push([40.900 + j * 0.0001, -73.800]);
            return pts2;
          }
          return null;
        },
      };
      try {
        var nearUnderground = authority.classifyPosition(-74.000, 40.7005); // idx ~5, within the underground run
        results.push(_assert('classifyPosition near the underground stretch resolves to underground',
          nearUnderground.structureType === 'underground' && nearUnderground.source === 'position', nearUnderground));

        var nearElevated = authority.classifyPosition(-74.000, 40.7080); // idx ~80, within the elevated run
        results.push(_assert('classifyPosition near the elevated stretch resolves to elevated',
          nearElevated.structureType === 'elevated', nearElevated));

        var farAway = authority.classifyPosition(-72.000, 41.500); // nowhere near any fixture shape
        results.push(_assert('classifyPosition far from all shapes returns unknown, never a low-confidence guess',
          farAway.structureType === 'unknown' && farAway.source === 'no_match_within_range', farAway));

        SBE.MTASubwayStaticAdapter = null;
        var noAdapter = authority.classifyPosition(-74.000, 40.7005);
        results.push(_assert('classifyPosition with no static adapter available returns unknown, source static_adapter_unavailable',
          noAdapter.structureType === 'unknown' && noAdapter.source === 'static_adapter_unavailable', noAdapter));
      } finally {
        SBE.MTASubwayStaticAdapter = savedAdapter;
      }
    })();

    // ── Taxonomy / normalized-type exposure ─────────────────────────────────
    (function () {
      var taxonomy = authority.getRowTypeTaxonomy();
      var expectedKeys = ['1', '2', '3', '4', '5', '6', '7', '8'];
      results.push(_assert('getRowTypeTaxonomy() preserves all 8 official ROW_TYPE values, never collapsed',
        taxonomy && expectedKeys.every(function (k) { return typeof taxonomy[k] === 'string'; }), taxonomy));
      results.push(_assert('getRowTypeTaxonomy() code 5 is literally "Open Cut Depression" (not folded into another category)',
        taxonomy && taxonomy['5'] === 'Open Cut Depression', taxonomy));
      results.push(_assert('getRowTypeTaxonomy() code 6 is literally "Embankment" (not folded into another category)',
        taxonomy && taxonomy['6'] === 'Embankment', taxonomy));

      var normalized = authority.getNormalizedStructureTypes();
      var expectedNormalized = ['underground', 'elevated', 'at_grade', 'open_cut', 'embankment', 'unknown'];
      results.push(_assert('getNormalizedStructureTypes() returns exactly the approved 6-value StudioRich taxonomy',
        JSON.stringify(normalized.slice().sort()) === JSON.stringify(expectedNormalized.slice().sort()), normalized));
    })();

    // ── Diagnostics ──────────────────────────────────────────────────────────
    (function () {
      var diag = authority.getDiagnostics();
      results.push(_assert('getDiagnostics() reports loaded true and the fixture segment/shape counts',
        diag.loaded === true && diag.segmentCount === 3 && diag.shapeCount === 2, diag));
    })();

    // ── Real generated snapshot — structural sanity only (not a re-run of the
    // acquisition script's own join numbers, which were reported separately) ──
    if (global.SBE.__realTrackStructureSnapshotForTests) {
      (function () {
        var real = global.SBE.__realTrackStructureSnapshotForTests;
        authority.__setSnapshotForTests(real);
        var diag = authority.getDiagnostics();
        results.push(_assert('real snapshot: segment count is non-trivial (real join produced thousands of shape-points worth of segments)',
          diag.segmentCount > 1000, diag.segmentCount));
        var taxonomy = authority.getRowTypeTaxonomy();
        results.push(_assert('real snapshot: all 8 official ROW_TYPE values present in the taxonomy',
          taxonomy && Object.keys(taxonomy).length === 8, taxonomy));
        var typesSeen = {};
        real.segments.forEach(function (s) { typesSeen[s.structureType] = true; });
        results.push(_assert('real snapshot: every normalized structure type except possibly "unknown" is represented by at least one real segment',
          ['underground', 'elevated', 'at_grade', 'open_cut', 'embankment'].every(function (t) { return typesSeen[t]; }), typesSeen));
      })();
    }

    var failed = results.filter(function (r) { return !r.pass; });
    var summary = { ok: failed.length === 0, total: results.length, failed: failed.length, results: results };

    console.log('[SubwayTrackStructureAuthorityTests] ' + (summary.ok ? 'PASS' : 'FAIL') +
      ' — ' + (results.length - failed.length) + '/' + results.length + ' assertions passed');
    if (failed.length) console.warn('[SubwayTrackStructureAuthorityTests] failures:', failed);

    authority.__resetForTests();
    return summary;
  }

  SBE.SubwayTrackStructureAuthorityTests = { run: run };

  global._wos = global._wos || {};
  global._wos.debug = global._wos.debug || {};
  global._wos.debug.subwayTrackStructure = global._wos.debug.subwayTrackStructure || {};
  global._wos.debug.subwayTrackStructure.runTests = run;
})(window);
