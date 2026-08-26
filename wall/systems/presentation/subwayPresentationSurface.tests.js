// ── SubwayPresentationSurface Tests v1.0.0 ────────────────────────────────────
// 0819_SUBWAY_Public_HUD_Line_Ribbon_v1.0.0_BUILD — Required Tests §24 (1,2,20,24)
// Run via: SBE.SubwayPresentationSurfaceTests.run()
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
    var surface = SBE.SubwayPresentationSurface;
    var layer = SBE.MTASubwayMapLayer;
    var results = [];
    if (!surface || !layer) {
      results.push(_assert('SBE.SubwayPresentationSurface/MTASubwayMapLayer are loaded', false));
      return { ok: false, total: 1, failed: 1, results: results };
    }

    var wasActive = layer.isActive();
    try {
      // ── §24.1/§24.2 DRIVE HUD hidden in SUBWAY, preserved elsewhere ──────
      layer.deactivate();
      surface.__test.applyNow();
      results.push(_assert('subway-presentation class absent when SUBWAY is inactive', !global.document.body.classList.contains(surface.PRESENTATION_CLASS)));

      var driveHud = global.document.getElementById('wos-hud');
      var travelDeck = global.document.getElementById('wos-nav');
      var legacyTransport = global.document.querySelector('.transport-bar');
      // Baseline computed-display BEFORE subway activates — whatever
      // TraversalHUD/TraversalControlDeck's own independent visibility
      // logic currently has them at, unrelated to this module's rule.
      var driveHudBaseline = _computedDisplay(driveHud);

      layer.activate();
      surface.__test.applyNow();
      results.push(_assert('subway-presentation class present once SUBWAY is active', global.document.body.classList.contains(surface.PRESENTATION_CLASS)));

      if (driveHud) {
        results.push(_assert('§24.1 DRIVE HUD (#wos-hud) is force-hidden while SUBWAY is active', _computedDisplay(driveHud) === 'none'));
      } else {
        results.push(_assert('§24.1 DRIVE HUD hidden (SKIPPED — #wos-hud not present in this DOM)', true));
      }
      if (travelDeck) {
        results.push(_assert('travel control deck (#wos-nav) is force-hidden while SUBWAY is active', _computedDisplay(travelDeck) === 'none'));
      } else {
        results.push(_assert('travel control deck hidden (SKIPPED — #wos-nav not present in this DOM)', true));
      }
      if (legacyTransport) {
        results.push(_assert('§24.20 legacy canvas transport (.transport-bar) is force-hidden while SUBWAY is active', _computedDisplay(legacyTransport) === 'none'));
      } else {
        results.push(_assert('§24.20 legacy canvas transport hidden (SKIPPED — .transport-bar not present in this DOM)', true));
      }

      layer.deactivate();
      surface.__test.applyNow();
      results.push(_assert('subway-presentation class removed once SUBWAY deactivates', !global.document.body.classList.contains(surface.PRESENTATION_CLASS)));
      if (driveHud) {
        results.push(_assert('§24.2 DRIVE HUD returns to its own pre-subway visibility state once SUBWAY deactivates (control returns to DRIVE/RACETRACK\'s own logic, not forced by this module either way)',
          _computedDisplay(driveHud) === driveHudBaseline, { baseline: driveHudBaseline, after: _computedDisplay(driveHud) }));
      }

      // ── §24.24 RACETRACK structural independence ─────────────────────────
      var racetrack = SBE.RacetrackPresentationSurface;
      if (racetrack) {
        results.push(_assert('RacetrackPresentationSurface and SubwayPresentationSurface use distinct body classes (no shared/colliding class)', racetrack.PRESENTATION_CLASS !== surface.PRESENTATION_CLASS));
      } else {
        results.push(_assert('RACETRACK class-distinctness check (SKIPPED — RacetrackPresentationSurface not loaded)', true));
      }
    } finally {
      if (wasActive) { layer.activate(); } else { layer.deactivate(); }
      surface.__test.applyNow();
    }

    var failed = results.filter(function (r) { return !r.pass; });
    var summary = { ok: failed.length === 0, total: results.length, failed: failed.length, results: results };
    console.log('[SubwayPresentationSurfaceTests] ' + (summary.ok ? 'PASS' : 'FAIL') + ' — ' + (results.length - failed.length) + '/' + results.length);
    if (failed.length) console.warn('[SubwayPresentationSurfaceTests] failures:', failed);
    return summary;
  }

  SBE.SubwayPresentationSurfaceTests = { run: run };
  function _bindDebug() {
    global._wos = global._wos || {};
    global._wos.debug = global._wos.debug || {};
    global._wos.debug.subwayPresentationSurfaceTests = { runTests: run };
  }
  _bindDebug();
  global.setTimeout(_bindDebug, 300);
  global.setTimeout(_bindDebug, 1000);
})(window);
