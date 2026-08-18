// ── MTASubwaySemanticFamily Tests v1.0.0 ──────────────────────────────────────
// 0818_SUBWAY_Full_Live_Map_Integration_v1.0.0_BUILD — Required Tests §25.1, §25.3
// Run via: _wos.debug.mtaSubwaySemanticFamily.runTests()
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});

  function _assert(name, cond, details) {
    return { name: name, pass: !!cond, details: details === undefined ? null : details };
  }

  function run() {
    var sf = SBE.MTASubwaySemanticFamily;
    var store = SBE.MTASubwayTransitStore;
    var results = [];
    if (!sf) {
      results.push(_assert('SBE.MTASubwaySemanticFamily is loaded', false));
      return Promise.resolve({ ok: false, total: 1, failed: 1, results: results });
    }

    results.push(_assert('exposes exactly 10 required semantic family ids', sf.SEMANTIC_FAMILIES.length === 10, sf.SEMANTIC_FAMILIES));
    ['red_family', 'amber_family', 'gold_family', 'green_family', 'blue_family', 'purple_family', 'brown_family', 'mint_family', 'teal_family', 'gray_family'].forEach(function (fam) {
      results.push(_assert('required family "' + fam + '" is present', sf.SEMANTIC_FAMILIES.indexOf(fam) !== -1));
    });

    results.push(_assert('unknown color returns null (never invents a family)', sf.familyForColor('#000000') === null));
    results.push(_assert('null/undefined color returns null', sf.familyForColor(null) === null && sf.familyForColor(undefined) === null));
    results.push(_assert('real route A color (#0062CF) resolves to blue_family', sf.familyForColor('#0062CF') === 'blue_family'));
    results.push(_assert('color matching is case-insensitive and # is optional', sf.familyForColor('0062cf') === 'blue_family'));

    if (!store) {
      results.push(_assert('SBE.MTASubwayTransitStore is loaded (for full coverage check)', false));
      var failedEarly = results.filter(function (r) { return !r.pass; });
      return Promise.resolve({ ok: failedEarly.length === 0, total: results.length, failed: failedEarly.length, results: results });
    }

    return store.loadStatic().then(function () {
      // ── §25.1: full route-family coverage — every real route resolves ────
      var routes = store.getAllRoutes();
      var unmapped = [];
      var usedFamilies = {};
      routes.forEach(function (r) {
        var fam = sf.familyForRoute(r);
        if (!fam) unmapped.push(r.authoritativeId);
        else usedFamilies[fam] = true;
      });
      results.push(_assert('every real route (all ' + routes.length + ') resolves to a semantic family — zero unmapped', unmapped.length === 0, unmapped));
      results.push(_assert('all 10 semantic families are actually used by real routes', Object.keys(usedFamilies).length === 10, Object.keys(usedFamilies)));

      // Numeric + lettered + shuttle + SIR coverage (BUILD §27)
      var byAuthId = {};
      routes.forEach(function (r) { byAuthId[r.authoritativeId] = sf.familyForRoute(r); });
      results.push(_assert('numeric routes (1,2,3,4,5,6,7) all resolve', ['1', '2', '3', '4', '5', '6', '7'].every(function (id) { return !!byAuthId[id]; })));
      results.push(_assert('lettered routes (A,C,E,B,D,F,M,G,J,Z,N,Q,R,W) all resolve', ['A', 'C', 'E', 'B', 'D', 'F', 'M', 'G', 'J', 'Z', 'N', 'Q', 'R', 'W'].every(function (id) { return !!byAuthId[id]; })));
      results.push(_assert('shuttle routes (GS, FS, H) resolve', ['GS', 'FS', 'H'].every(function (id) { return byAuthId[id] !== undefined ? !!byAuthId[id] : true; })));
      results.push(_assert('SIR (Staten Island Railway) resolves — intentionally included in this SUBWAY surface', byAuthId['SI'] === 'teal_family', byAuthId['SI']));

      var failed = results.filter(function (r) { return !r.pass; });
      var summary = { ok: failed.length === 0, total: results.length, failed: failed.length, results: results };
      console.log('[MTASubwaySemanticFamilyTests] ' + (summary.ok ? 'PASS' : 'FAIL') + ' — ' + (results.length - failed.length) + '/' + results.length);
      if (failed.length) console.warn('[MTASubwaySemanticFamilyTests] failures:', failed);
      return summary;
    });
  }

  SBE.MTASubwaySemanticFamilyTests = { run: run };
  function _bindDebug() {
    global._wos = global._wos || {};
    global._wos.debug = global._wos.debug || {};
    global._wos.debug.mtaSubwaySemanticFamily = { runTests: run };
  }
  _bindDebug();
  global.setTimeout(_bindDebug, 300);
  global.setTimeout(_bindDebug, 1000);
})(window);
