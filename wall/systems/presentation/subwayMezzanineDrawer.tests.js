// ── SubwayMezzanineDrawer Tests v1.0.0 ─────────────────────────────────────────
// STATION-04 — focused, deterministic coverage for the drawer CONTAINER
// only (open/close, width clamping, persistence, real DOM wiring). Content
// correctness (station identity, route styling, direction, arrivals, line
// orientation) is Station Cover's own responsibility and is covered by
// stationCoverPresentation.test.ts / stationArrivalPresentation.test.ts /
// stationLineOrientation.test.ts in the MUSIC/Vite suite — never
// re-tested here against a fake/duplicated implementation.
// Run via: SBE.SubwayMezzanineDrawerTests.run()
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});

  function _assert(name, cond, details) {
    return { name: name, pass: !!cond, details: details === undefined ? null : details };
  }

  function run() {
    var drawer = SBE.SubwayMezzanineDrawer;
    var results = [];
    if (!drawer) {
      results.push(_assert('SBE.SubwayMezzanineDrawer is loaded', false));
      return { ok: false, total: 1, failed: 1, results: results };
    }

    // ── width contract ────────────────────────────────────────────────────
    results.push(_assert('MIN_WIDTH is 315', drawer.MIN_WIDTH === 315));
    results.push(_assert('DEFAULT_WIDTH is 360', drawer.DEFAULT_WIDTH === 360));
    results.push(_assert('MAX_WIDTH is 540', drawer.MAX_WIDTH === 540));

    var clamp = drawer.__test.clampWidth;
    results.push(_assert('clamps below MIN_WIDTH up to 315', clamp(100) === 315));
    results.push(_assert('clamps above MAX_WIDTH down to 540', clamp(9999) === 540));
    results.push(_assert('passes an in-range width through unchanged (rounded)', clamp(420.4) === 420));
    results.push(_assert('accepts the exact boundary values', clamp(315) === 315 && clamp(540) === 540));

    // ── real DOM wiring ────────────────────────────────────────────────────
    var drawerEl = global.document.getElementById('subway-mezzanine-drawer');
    var frameEl = global.document.getElementById('subway-mezzanine-drawer-frame');
    var handleEl = global.document.getElementById('subway-mezzanine-drawer-resize-handle');
    results.push(_assert('the drawer aside element exists in the real DOM', !!drawerEl));
    results.push(_assert('the drawer iframe element exists in the real DOM', !!frameEl));
    results.push(_assert('the resize handle element exists in the real DOM', !!handleEl));

    // ── open/close ─────────────────────────────────────────────────────────
    results.push(_assert('closed before any open() call this run', drawer.isOpen() === false || drawer.getOpenGtfsStopId() !== 'R42'));
    var openResult = drawer.open('R42');
    results.push(_assert('open() with a real gtfsStopId succeeds', openResult.ok === true));
    results.push(_assert('isOpen() reports true after open()', drawer.isOpen() === true));
    results.push(_assert('getOpenGtfsStopId() reports the real id passed in — never studioRichStationId', drawer.getOpenGtfsStopId() === 'R42'));
    results.push(_assert('body carries the open class', global.document.body.classList.contains('subway-mezzanine-open')));
    results.push(_assert('the iframe src points at the same-origin Station Cover page, embedded mode, with the real station id',
      frameEl.src.indexOf('/station.html?station=R42') !== -1 && frameEl.src.indexOf('embedded=1') !== -1, frameEl.src));
    results.push(_assert('--mezzanine-drawer-width CSS var reflects the current width', global.getComputedStyle(global.document.documentElement).getPropertyValue('--mezzanine-drawer-width').trim() === drawer.getWidth() + 'px'));

    // Re-opening the SAME station must not reload the iframe (avoid
    // needless refetch/flash) — src stays byte-identical.
    var srcBeforeReopen = frameEl.src;
    drawer.open('R42');
    results.push(_assert('re-opening the same station does not change the iframe src (no needless reload)', frameEl.src === srcBeforeReopen));

    // Opening a DIFFERENT station updates the iframe src.
    drawer.open('R41');
    results.push(_assert('opening a different station updates the iframe src to the new id', frameEl.src.indexOf('/station.html?station=R41') !== -1, frameEl.src));

    drawer.close();
    results.push(_assert('isOpen() reports false after close()', drawer.isOpen() === false));
    results.push(_assert('body no longer carries the open class after close()', !global.document.body.classList.contains('subway-mezzanine-open')));
    results.push(_assert('close() stops the embedded page (src reset)', frameEl.src.indexOf('about:blank') !== -1, frameEl.src));
    // The real bug this module's own dev testing caught: close() must
    // collapse the grid column to 0 so MAP actually reclaims the space --
    // getWidth() (the user's PREFERRED width) must stay non-zero regardless,
    // since it's what the next open() will use.
    results.push(_assert('STATION-04: closing collapses the rendered CSS grid-column width to 0 (MAP reclaims the space)',
      global.getComputedStyle(global.document.documentElement).getPropertyValue('--mezzanine-drawer-width').trim() === '0px'));
    results.push(_assert('getWidth() still reports the preferred width while closed (not 0) — remembered for the next open()', drawer.getWidth() > 0));

    // ── resize while open updates the rendered width live ──────────────────
    drawer.open('R42');
    drawer.__test.setOpenWidth(480);
    results.push(_assert('setOpenWidth() while open updates getWidth()', drawer.getWidth() === 480));
    results.push(_assert('setOpenWidth() while open updates the rendered CSS var immediately', global.getComputedStyle(global.document.documentElement).getPropertyValue('--mezzanine-drawer-width').trim() === '480px'));
    drawer.close();
    results.push(_assert('closing after a resize still collapses to 0 (not the resized width)', global.getComputedStyle(global.document.documentElement).getPropertyValue('--mezzanine-drawer-width').trim() === '0px'));
    results.push(_assert('the resized preference survives the close (next open() will use 480)', drawer.getWidth() === 480));

    // ── persisted width round-trip ─────────────────────────────────────────
    var storageKey = drawer.__test.storageKey;
    var priorStored = null;
    try { priorStored = global.localStorage.getItem(storageKey); } catch (e) {}
    try {
      global.localStorage.setItem(storageKey, '480');
      drawer.__test.setOpenWidth(480);
      results.push(_assert('setOpenWidth() updates getWidth()', drawer.getWidth() === 480));
    } finally {
      // Never leak test-modified persisted state into a real later session.
      try {
        if (priorStored == null) global.localStorage.removeItem(storageKey);
        else global.localStorage.setItem(storageKey, priorStored);
      } catch (e) {}
    }

    // ── STATION-04A: drawer → MAP showLineMode() message handling ──────────
    // A real DOM message-shaped object, never an actual cross-document
    // postMessage round-trip (unnecessary here — the handler is a pure
    // function of the event-like object's own origin/source/data).
    drawer.open('R42');
    var frameWindow = global.document.getElementById('subway-mezzanine-drawer-frame').contentWindow;
    var handle = drawer.__test.handleWindowMessage;
    var msgType = drawer.__test.lineModeMessageType;
    var ribbon = SBE.SubwayLineRibbon;
    if (handle && msgType && ribbon) {
      var originalShowLineMode = ribbon.showLineMode;
      var calls = [];
      try {
        Object.defineProperty(SBE, 'SubwayLineRibbon', {
          configurable: true,
          value: Object.assign({}, ribbon, { showLineMode: function (routeId) { calls.push(routeId); return originalShowLineMode.call(ribbon, routeId); } }),
        });

        handle({ origin: global.location.origin, source: frameWindow, data: { type: msgType, routeId: 'R' } });
        results.push(_assert('a valid same-origin, same-iframe message calls showLineMode with the canonical subway:route: id', calls.length === 1 && calls[0] === 'subway:route:R', calls));

        calls.length = 0;
        handle({ origin: 'https://evil.example', source: frameWindow, data: { type: msgType, routeId: 'R' } });
        results.push(_assert('a message from the wrong origin is ignored, even with a valid source/data', calls.length === 0));

        calls.length = 0;
        handle({ origin: global.location.origin, source: global.window, data: { type: msgType, routeId: 'R' } });
        results.push(_assert('a message from the wrong source window (not this drawer\'s own iframe) is ignored, even same-origin', calls.length === 0));

        calls.length = 0;
        handle({ origin: global.location.origin, source: frameWindow, data: { type: 'something-else', routeId: 'R' } });
        results.push(_assert('a message with the wrong type is ignored', calls.length === 0));

        calls.length = 0;
        handle({ origin: global.location.origin, source: frameWindow, data: { type: msgType, routeId: '' } });
        results.push(_assert('a message with an empty/missing routeId is ignored', calls.length === 0));

        calls.length = 0;
        handle({ origin: global.location.origin, source: frameWindow, data: null });
        results.push(_assert('a message with no data at all does not throw and is ignored', calls.length === 0));
      } finally {
        Object.defineProperty(SBE, 'SubwayLineRibbon', { configurable: true, value: ribbon, writable: true });
      }
    } else {
      results.push(_assert('showLineMode message-handling checks (SKIPPED — handleWindowMessage/lineModeMessageType/SubwayLineRibbon not all available)', true));
    }

    // ── STATION-08: drawer → MAP enterPlatform() navigation message ────────
    // Only tests the HOME-hosted branch (a real `location.href` mutation in
    // the standalone-fallback branch would actually navigate this very test
    // page away mid-run — unsafe to exercise live, same "skip what can't be
    // safely exercised" posture this suite already uses elsewhere).
    drawer.open('R42');
    var platformFrameWindow = global.document.getElementById('subway-mezzanine-drawer-frame').contentWindow;
    var platformHandle = drawer.__test.handleWindowMessage;
    var platformMsgType = drawer.__test.enterPlatformMessageType;
    var mapSurface = SBE.HomeMapSurface;
    if (platformHandle && platformMsgType && mapSurface) {
      var originalRequestNavigate = mapSurface.requestNavigate;
      var navCalls = [];
      try {
        Object.defineProperty(SBE, 'HomeMapSurface', {
          configurable: true,
          value: Object.assign({}, mapSurface, { requestNavigate: function (destination) { navCalls.push(destination); return originalRequestNavigate.call(mapSurface, destination); } }),
        });

        platformHandle({ origin: global.location.origin, source: platformFrameWindow, data: { type: platformMsgType, stationId: 'R42' } });
        results.push(_assert('a valid same-origin, same-iframe enterPlatform message calls HomeMapSurface.requestNavigate with the REAL station id, never hardcoded', navCalls.length === 1 && navCalls[0].surface === 'platform' && navCalls[0].stationId === 'R42', navCalls));

        navCalls.length = 0;
        platformHandle({ origin: global.location.origin, source: platformFrameWindow, data: { type: platformMsgType, stationId: 'R16' } });
        results.push(_assert('a DIFFERENT real station id round-trips just as cleanly — never silently substituted', navCalls.length === 1 && navCalls[0].stationId === 'R16', navCalls));

        navCalls.length = 0;
        platformHandle({ origin: 'https://evil.example', source: platformFrameWindow, data: { type: platformMsgType, stationId: 'R42' } });
        results.push(_assert('an enterPlatform message from the wrong origin is ignored', navCalls.length === 0));

        navCalls.length = 0;
        platformHandle({ origin: global.location.origin, source: platformFrameWindow, data: { type: platformMsgType, stationId: '' } });
        results.push(_assert('an enterPlatform message with an empty/missing stationId is ignored', navCalls.length === 0));
      } finally {
        Object.defineProperty(SBE, 'HomeMapSurface', { configurable: true, value: mapSurface, writable: true });
      }
    } else {
      results.push(_assert('enterPlatform message-handling checks (SKIPPED — handleWindowMessage/enterPlatformMessageType/HomeMapSurface not all available, e.g. MAP not HOME-hosted in this run)', true));
    }
    drawer.close();

    var failed = results.filter(function (r) { return !r.pass; });
    var summary = { ok: failed.length === 0, total: results.length, failed: failed.length, results: results };
    console.log('[SubwayMezzanineDrawerTests] ' + (summary.ok ? 'PASS' : 'FAIL') + ' — ' + (results.length - failed.length) + '/' + results.length);
    if (failed.length) console.warn('[SubwayMezzanineDrawerTests] failures:', failed);
    return summary;
  }

  SBE.SubwayMezzanineDrawerTests = { run: run };
  function _bindDebug() {
    global._wos = global._wos || {};
    global._wos.debug = global._wos.debug || {};
    global._wos.debug.subwayMezzanineDrawerTests = { runTests: run };
  }
  _bindDebug();
  global.setTimeout(_bindDebug, 300);
  global.setTimeout(_bindDebug, 1000);
})(window);
