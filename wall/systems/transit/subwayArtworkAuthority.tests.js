// ── SubwayArtworkAuthority Tests v1.0.0 ───────────────────────────────────────
// 0818_SUBWAY_Car_Surface_Artwork_Placement_v1.0.0_BUILD — Required Tests §31 (6-7)
// Status: active | Classification: test-harness (dependency-free)
//
// Run via: _wos.debug.subwayArtworkAuthorityTests.runTests()
// Placement: wall/systems/transit/subwayArtworkAuthority.tests.js
// Load: AFTER subwayArtworkAuthority.js.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});

  function _assert(name, cond, details) { return { name: name, pass: !!cond, details: details === undefined ? null : details }; }

  function run() {
    var art = SBE.SubwayArtworkAuthority;
    var results = [];
    if (!art) {
      results.push(_assert('SBE.SubwayArtworkAuthority is loaded', false));
      return Promise.resolve({ ok: false, total: 1, failed: 1, results: results });
    }

    art.__resetForTests();

    var r1 = art.createArtwork({ creatorType: 'system', title: 'DEV_ART_01', sourceType: 'seed', now: 1000 });
    var r2 = art.createArtwork({ creatorType: 'user', title: 'DEV_ART_02', sourceType: 'seed', now: 1000 });
    results.push(_assert('createArtwork() succeeds for a valid creatorType', r1.ok && r2.ok));

    // ── #6 artwork ID uniqueness ──────────────────────────────────────────
    results.push(_assert('#6 both artwork ids match sr-art-###### and are distinct',
      /^sr-art-\d{6}$/.test(r1.data.id) && /^sr-art-\d{6}$/.test(r2.data.id) && r1.data.id !== r2.data.id, [r1.data.id, r2.data.id]));

    var r3 = art.createArtwork({ creatorType: 'not_a_real_type' });
    results.push(_assert('an unknown creatorType is rejected explicitly, not silently coerced', r3.ok === false && r3.reason === 'invalid_creator_type'));

    // ── #7 artwork independent from placement ─────────────────────────────
    // This authority has NO knowledge of placement at all — no placement-
    // related field, function, or dependency exists anywhere in this file.
    // Structural proof: the record shape itself carries nothing placement-shaped.
    var keys = Object.keys(r1.data);
    results.push(_assert('#7 an artwork record exists and is fully valid with ZERO placements ever created for it',
      !!art.getArtwork(r1.data.id)));
    results.push(_assert('#7 artwork record has no placement-coupled field (structurally independent, not just unused)',
      keys.indexOf('placementId') === -1 && keys.indexOf('surfaceId') === -1 && keys.indexOf('logicalCarId') === -1, keys));

    var updateResult = art.updateArtworkStatus(r1.data.id, 'archived');
    results.push(_assert('updateArtworkStatus() succeeds and persists the new status', updateResult.ok && art.getArtwork(r1.data.id).status === 'archived'));

    var diag = art.getDiagnostics();
    results.push(_assert('diagnostics: zero artwork collisions', diag.artworkCollisionCount === 0 && diag.artworkCount === 2, diag));

    art.__resetForTests();

    var failed = results.filter(function (r) { return !r.pass; });
    var summary = { ok: failed.length === 0, total: results.length, failed: failed.length, results: results };
    console.log('[SubwayArtworkAuthorityTests] ' + (summary.ok ? 'PASS' : 'FAIL') + ' — ' + (results.length - failed.length) + '/' + results.length);
    if (failed.length) console.warn('[SubwayArtworkAuthorityTests] failures:', failed);
    return Promise.resolve(summary);
  }

  SBE.SubwayArtworkAuthorityTests = { run: run };
  function _bindDebug() {
    global._wos = global._wos || {};
    global._wos.debug = global._wos.debug || {};
    global._wos.debug.subwayArtworkAuthorityTests = { runTests: run };
  }
  _bindDebug();
  global.setTimeout(_bindDebug, 300);
  global.setTimeout(_bindDebug, 1000);
})(window);
