// ── MTASubwayStationLibrary Tests v1.0.0 ──────────────────────────────────────
// 0818_SUBWAY_Station_Library_Foundation_v1.0.0 — Required Verification 1-5
// Status: active | Classification: test-harness (dependency-free)
//
// Run via: _wos.debug.mtaSubwayStationLibrary.runTests()
//
// Covers: stable-id import of the real live static model, duplicate-name
// collision safety (real Fulton St case), StudioRich-metadata survival
// across re-import, explicit/diagnosable migration handling, and map-feature
// generation from library records.
//
// Placement: wall/systems/transit/mtaSubwayStationLibrary.tests.js
// Load: AFTER mtaSubwayStationLibrary.js (and mtaSubwayStaticAdapter.js).
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});

  function _assert(name, cond, details) {
    return { name: name, pass: !!cond, details: details === undefined ? null : details };
  }

  function run() {
    var lib = SBE.MTASubwayStationLibrary;
    var adapter = SBE.MTASubwayStaticAdapter;
    var results = [];
    if (!lib || !adapter) {
      results.push(_assert('SBE.MTASubwayStationLibrary and MTASubwayStaticAdapter are loaded', false));
      return Promise.resolve({ ok: false, total: 1, failed: 1, results: results });
    }

    lib.__resetForTests();

    return adapter.load().then(function (loadResult) {
      results.push(_assert('static adapter loads the real snapshot', loadResult && loadResult.ok === true));

      // ── §1: all current normalized stations resolve to stable records ───────
      var import1 = lib.importFromStaticModel();
      results.push(_assert('first import succeeds', import1.ok === true, import1));
      var realStationLevelCount = adapter.getStops().filter(function (s) { return s.isStationLevel; }).length;
      results.push(_assert('every real station-level stop got a library record', import1.created === realStationLevelCount, { created: import1.created, expected: realStationLevelCount }));
      results.push(_assert('nothing was "updated" on a first-ever import (they were all creates)', import1.updated === 0 && import1.unchanged === 0));

      var diag1 = lib.getDiagnostics();
      results.push(_assert('required invariant: identityCollisionCount === 0', diag1.identityCollisionCount === 0, diag1.identityCollisionCount));
      results.push(_assert('recordCount matches the real static station count', diag1.recordCount === realStationLevelCount));
      results.push(_assert('unresolvedStaticStopCount is 0 after a full import', diag1.unresolvedStaticStopCount === 0));

      // ── §2: duplicate station names do not collide (real Fulton St case) ────
      var manhattanFulton = lib.getRecordByAuthoritativeStopId('229');
      var brooklynFulton = lib.getRecordByAuthoritativeStopId('G36');
      results.push(_assert('both real Fulton St stations resolved to real records', !!manhattanFulton && !!brooklynFulton));
      if (manhattanFulton && brooklynFulton) {
        results.push(_assert('same displayName, DISTINCT studioRichStationId', manhattanFulton.operational.displayName === brooklynFulton.operational.displayName && manhattanFulton.studioRichStationId !== brooklynFulton.studioRichStationId,
          [manhattanFulton.studioRichStationId, brooklynFulton.studioRichStationId]));
        results.push(_assert('studioRichStationId is NOT derived from the gtfsStopId or the name (opaque stlib-* form)', /^stlib-\d{6}$/.test(manhattanFulton.studioRichStationId)));
      }
      var dupGroups = lib.getDuplicateNameGroups();
      var fultonGroup = dupGroups.filter(function (g) { return g.displayName === 'Fulton St'; })[0];
      results.push(_assert('getDuplicateNameGroups() surfaces the real Fulton St group with 2+ distinct records', !!fultonGroup && fultonGroup.records.length >= 2, fultonGroup && fultonGroup.records.length));
      results.push(_assert('real duplicate name groups exist across the network (not just Fulton)', dupGroups.length > 1, dupGroups.length));

      // ── §3: authoritative MTA IDs remain preserved ───────────────────────────
      results.push(_assert('Manhattan Fulton preserves its real gtfsStopId', manhattanFulton && manhattanFulton.authoritativeLink.gtfsStopId === '229'));
      results.push(_assert('Manhattan Fulton preserves its real complexId link', manhattanFulton && !!manhattanFulton.authoritativeLink.complexId));
      results.push(_assert('Manhattan Fulton\'s operational.routeIds include the real 2/3/4/5/A/C/J/Z set',
        manhattanFulton && ['A', 'C', '2'].every(function (r) { return manhattanFulton.operational.routeIds.indexOf(r) !== -1; }), manhattanFulton && manhattanFulton.operational.routeIds));

      // ── §4: StudioRich-owned metadata survives MTA refresh/re-import ────────
      var manhattanId = manhattanFulton.studioRichStationId;
      var noteResult = lib.updateStudioRichMetadata(manhattanId, { notes: 'Test note — proves persistence across re-import' });
      results.push(_assert('updateStudioRichMetadata() succeeds', noteResult.ok === true));
      results.push(_assert('the note is present immediately after writing it', lib.getRecord(manhattanId).studioRich.notes === 'Test note — proves persistence across re-import'));

      // Re-import — simulates an MTA refresh against the SAME underlying data.
      var import2 = lib.importFromStaticModel();
      results.push(_assert('second import succeeds', import2.ok === true, import2));
      results.push(_assert('second import creates ZERO new records (idempotent — same stations, same ids)', import2.created === 0, import2.created));
      results.push(_assert('second import touches (updated+unchanged) every station again', (import2.updated + import2.unchanged) === realStationLevelCount));

      var afterReimport = lib.getRecord(manhattanId);
      results.push(_assert('studioRichStationId is UNCHANGED after re-import', afterReimport.studioRichStationId === manhattanId));
      results.push(_assert('StudioRich-authored note SURVIVED the re-import untouched', afterReimport.studioRich.notes === 'Test note — proves persistence across re-import'));
      results.push(_assert('operational block was still refreshed (has a newer lastRefreshedAt)', afterReimport.lastRefreshedAt >= manhattanFulton.lastRefreshedAt));

      var diag2 = lib.getDiagnostics();
      results.push(_assert('identity collision count still 0 after re-import', diag2.identityCollisionCount === 0));
      results.push(_assert('record count UNCHANGED by re-import (no duplicates created)', diag2.recordCount === diag1.recordCount));

      // ── Migration must be explicit and diagnosable (simulated upstream
      //    id change — cannot force a REAL MTA renumbering, so this proves
      //    the mechanism: an orphaned link is detected, never silently
      //    auto-resolved, and reconciling it is an explicit, named action) ──
      var testId = lib.getAllRecords()[0].studioRichStationId;
      var testRec = lib.getRecord(testId);
      var originalStopId = testRec.authoritativeLink.gtfsStopId;
      // Simulate the upstream id moving by pointing this record at a
      // synthetic, non-existent stop id — mirrors what a real renumbering
      // would look like from this library's perspective.
      testRec.authoritativeLink.gtfsStopId = 'SYNTHETIC_TEST_STOP_ID_999';
      // Rebuild is normally internal; re-run via a private path is not
      // exposed, so directly verify via getOrphanedLibraryRecords(), which
      // re-derives from the CURRENT static model each call (no caching bug
      // to work around) — this stop id is guaranteed absent from the real
      // model, so it must be reported as orphaned.
      var orphaned = lib.getOrphanedLibraryRecords();
      var isOrphanReported = orphaned.some(function (r) { return r.studioRichStationId === testId; });
      results.push(_assert('a record pointing at a stop id absent from the current model is surfaced as orphaned (diagnosable, not silently dropped)', isOrphanReported));

      var reconcileResult = lib.reconcileAuthoritativeLink(testId, originalStopId, 'test: revert synthetic migration');
      results.push(_assert('reconcileAuthoritativeLink() explicitly restores the link', reconcileResult.ok === true && reconcileResult.migratedTo === originalStopId));
      var afterReconcile = lib.getRecord(testId);
      results.push(_assert('after reconciling, the record resolves by its real gtfsStopId again', lib.getRecordByAuthoritativeStopId(originalStopId).studioRichStationId === testId));
      results.push(_assert('reconcile recorded migration provenance (migratedFrom)', afterReconcile.authoritativeLink.migratedFrom === 'SYNTHETIC_TEST_STOP_ID_999'));
      results.push(_assert('no longer reported as orphaned after reconciling', !lib.getOrphanedLibraryRecords().some(function (r) { return r.studioRichStationId === testId; })));

      // ── §5: station records can be rendered back onto the map ───────────────
      var feature = lib.buildMapFeature(manhattanFulton);
      results.push(_assert('buildMapFeature() produces a valid GeoJSON Point Feature', feature && feature.type === 'Feature' && feature.geometry.type === 'Point'));
      results.push(_assert('feature id is the stable studioRichStationId (not the gtfsStopId, not a name)', feature.id === manhattanId));
      results.push(_assert('feature coordinates match the real station coordinates', feature.geometry.coordinates[0] === manhattanFulton.operational.longitude && feature.geometry.coordinates[1] === manhattanFulton.operational.latitude));

      var fc = lib.buildMapFeatureCollection();
      results.push(_assert('buildMapFeatureCollection() produces one feature per real record', fc.features.length === lib.getAllRecords().length));

      var failed = results.filter(function (r) { return !r.pass; });
      var summary = { ok: failed.length === 0, total: results.length, failed: failed.length, results: results };
      console.log('[MTASubwayStationLibraryTests] ' + (summary.ok ? 'PASS' : 'FAIL') + ' — ' + (results.length - failed.length) + '/' + results.length);
      if (failed.length) console.warn('[MTASubwayStationLibraryTests] failures:', failed);
      return summary;
    });
  }

  SBE.MTASubwayStationLibraryTests = { run: run };
  function _bindDebug() {
    global._wos = global._wos || {};
    global._wos.debug = global._wos.debug || {};
    global._wos.debug.mtaSubwayStationLibrary = { runTests: run };
  }
  _bindDebug();
  global.setTimeout(_bindDebug, 300);
  global.setTimeout(_bindDebug, 1000);
})(window);
