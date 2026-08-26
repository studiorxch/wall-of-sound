// ── MTASubwayPaletteAuthority Tests v1.0.0 ────────────────────────────────────
// 0818_SUBWAY_Full_Live_Map_Integration_v1.0.0_BUILD — Required Tests §25.4-6
// Run via: _wos.debug.mtaSubwayPaletteAuthority.runTests()
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});

  function _assert(name, cond, details) {
    return { name: name, pass: !!cond, details: details === undefined ? null : details };
  }

  function run() {
    var pa = SBE.MTASubwayPaletteAuthority;
    var sf = SBE.MTASubwaySemanticFamily;
    var results = [];
    if (!pa) {
      results.push(_assert('SBE.MTASubwayPaletteAuthority is loaded', false));
      return { ok: false, total: 1, failed: 1, results: results };
    }

    var originalActive = pa.getActivePaletteId();

    try {
      results.push(_assert('exactly 2 palettes exist', pa.listPalettes().length === 2, pa.listPalettes().map(function (p) { return p.id; })));
      // 0818_SUBWAY_Train_Rendering_Palette_Library_v1.0.0_BUILD §8/§35.3:
      // Official MTA Reference is now the active default (was fashion_subway).
      results.push(_assert('default palette is mta_reference (Official MTA Reference)', pa.DEFAULT_PALETTE_ID === 'mta_reference'));
      results.push(_assert('"Official MTA Reference" palette exists', pa.getPalette('mta_reference') && pa.getPalette('mta_reference').label === 'Official MTA Reference'));
      results.push(_assert('"StudioRich Fashion Subway" palette exists', pa.getPalette('fashion_subway') && pa.getPalette('fashion_subway').label === 'StudioRich Fashion Subway'));

      // ── §25.4: StudioRich Fashion palette resolution ────────────────────
      var ok = pa.setActivePalette('fashion_subway');
      results.push(_assert('setActivePalette("fashion_subway") succeeds', ok.ok === true));
      results.push(_assert('Fashion Subway red_family resolves to real Carmine #8B2E2E', pa.resolveFamilyColor('red_family') === '#8B2E2E'));
      results.push(_assert('Fashion Subway blue_family resolves to real Indigo #2E3A87', pa.resolveFamilyColor('blue_family') === '#2E3A87'));
      results.push(_assert('Fashion Subway mood metadata is preserved', pa.resolveFamilyEntry('red_family').mood === 'Heat, emotion, soulful loops, late-train energy'));
      if (sf) {
        sf.SEMANTIC_FAMILIES.forEach(function (fam) {
          results.push(_assert('Fashion Subway resolves every required family (' + fam + ')', typeof pa.resolveFamilyColor(fam) === 'string' && /^#[0-9A-Fa-f]{6}$/.test(pa.resolveFamilyColor(fam))));
        });
      }

      // ── §25.5: MTA reference palette resolution ──────────────────────────
      var ok2 = pa.setActivePalette('mta_reference');
      results.push(_assert('setActivePalette("mta_reference") succeeds', ok2.ok === true));
      results.push(_assert('MTA Reference blue_family resolves to the real verified MTA hex #0062CF (route A/C/E)', pa.resolveFamilyColor('blue_family') === '#0062CF'));
      results.push(_assert('MTA Reference red_family resolves to the real verified MTA hex #D82233 (route 1/2/3)', pa.resolveFamilyColor('red_family') === '#D82233'));
      if (sf) {
        sf.SEMANTIC_FAMILIES.forEach(function (fam) {
          results.push(_assert('MTA Reference resolves every required family (' + fam + ')', typeof pa.resolveFamilyColor(fam) === 'string' && /^#[0-9A-Fa-f]{6}$/.test(pa.resolveFamilyColor(fam))));
        });
      }

      // ── §25.6: switching never mutates identity ──────────────────────────
      // Palette authority itself has no reference to any route/station id —
      // this is a structural guarantee, not just a runtime observation:
      results.push(_assert('palette records carry no route/station id fields at all', Object.keys(pa.getPalette('fashion_subway').colors.red_family).every(function (k) { return ['hex', 'name', 'mood'].indexOf(k) !== -1; })));

      results.push(_assert('unknown palette id is rejected, not silently defaulted', pa.setActivePalette('does_not_exist').ok === false));
      results.push(_assert('active palette id persists correctly through get/set cycle', pa.getActivePaletteId() === 'mta_reference'));

      // ── 0818_SUBWAY_Train_Rendering_Palette_Library_v1.0.0_BUILD §7/§35 —
      //    structured non-route-color presentation tokens ──────────────────
      var stationTokens = pa.resolveStationTokens();
      results.push(_assert('station style resolves through active palette', !!stationTokens && /^#[0-9A-Fa-f]{6}$/.test(stationTokens.fill) && /^#[0-9A-Fa-f]{6}$/.test(stationTokens.stroke) && /^#[0-9A-Fa-f]{6}$/.test(stationTokens.selected)));
      var trainTokens = pa.resolveTrainTokens();
      results.push(_assert('train LOD color tokens resolve through active palette (neutralBody/casing/selectedBody/selectedCasing)',
        !!trainTokens && /^#[0-9A-Fa-f]{6}$/.test(trainTokens.neutralBody) && /^#[0-9A-Fa-f]{6}$/.test(trainTokens.casing) &&
        /^#[0-9A-Fa-f]{6}$/.test(trainTokens.selectedBody) && /^#[0-9A-Fa-f]{6}$/.test(trainTokens.selectedCasing)));
      results.push(_assert('train opacity tokens resolve through active palette', typeof trainTokens.staleOpacity === 'number' && typeof trainTokens.unknownOpacity === 'number'));
      results.push(_assert('unknownOpacity is lower than staleOpacity (progressively less confident)', trainTokens.unknownOpacity < trainTokens.staleOpacity));
      results.push(_assert('casing is a distinct color from neutralBody (Train Contrast/LOD Fix — casing must not blend into the body)', trainTokens.casing !== trainTokens.neutralBody));
      results.push(_assert('selectedCasing is a distinct color from casing (selection must remain visible regardless of zoom)', trainTokens.selectedCasing !== trainTokens.casing));

      var failed = results.filter(function (r) { return !r.pass; });
      var summary = { ok: failed.length === 0, total: results.length, failed: failed.length, results: results };
      console.log('[MTASubwayPaletteAuthorityTests] ' + (summary.ok ? 'PASS' : 'FAIL') + ' — ' + (results.length - failed.length) + '/' + results.length);
      if (failed.length) console.warn('[MTASubwayPaletteAuthorityTests] failures:', failed);
      return summary;
    } finally {
      pa.setActivePalette(originalActive); // never leave global state dirty for other tests
    }
  }

  SBE.MTASubwayPaletteAuthorityTests = { run: run };
  function _bindDebug() {
    global._wos = global._wos || {};
    global._wos.debug = global._wos.debug || {};
    global._wos.debug.mtaSubwayPaletteAuthority = { runTests: run };
  }
  _bindDebug();
  global.setTimeout(_bindDebug, 300);
  global.setTimeout(_bindDebug, 1000);
})(window);
