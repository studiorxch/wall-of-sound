// ── TilePreloadDebug v1.2.0 ───────────────────────────────────────────────────
// 0528Z / 0528AA — debug companion
// Status: active
// Classification: debug-companion — do NOT load in production
//
// Binds _wos.debug.tilePreload with:
//   audit()          — full state report (includes preflight)
//   preflight(opts)  — manually trigger preflightWarmRoute
//   fog(mode)        — apply Mapbox traversal fog
//   extrusions()     — apply fill-extrusion opacity transitions
//   start()          — start the preload runtime
//   stop()           — stop the preload runtime
//   preloadAhead()   — trigger immediate queue refresh + step
//   state()          — compact state line
//
// Placement: wall/systems/presentation/tilePreloadDebug.js
// Load: AFTER predictiveTilePreloadRuntime.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  global._wos       = global._wos       || {};
  global._wos.debug = global._wos.debug || {};

  var VERSION = '1.2.0';

  function _ptpr() { return global.SBE && global.SBE.PredictiveTilePreloadRuntime; }

  function _bar(scalar, len) {
    len = len || 20;
    var filled = Math.round(Math.max(0, Math.min(1, scalar)) * len);
    var bar = '';
    for (var i = 0; i < len; i++) bar += i < filled ? '█' : '░';
    return bar;
  }

  // ── audit() ──────────────────────────────────────────────────────────────────

  function audit() {
    var p = _ptpr();
    if (!p) { console.warn('[TilePreload Debug] PredictiveTilePreloadRuntime not loaded'); return; }

    var s = p.getState();

    console.group('[PredictiveTilePreloadRuntime] audit()');

    console.log('── System ──────────────────────────────────────────');
    console.log('version         :', s.version);
    console.log('enabled         :', s.enabled);
    console.log('running         :', s.running);
    console.log('profile         :', s.traversalProfile || 'n/a');

    console.log('');
    console.log('── Hidden Map ──────────────────────────────────────');
    console.log('mapReady        :', s.mapReady);
    console.log('mapZoom         :', s.mapZoom !== null ? s.mapZoom : 'n/a');
    console.log('zoomLock        :', s.zoomLock !== null ? s.zoomLock + ' (surface_glide)' : 'off (follows visible)');
    console.log('mapCenter       :', s.mapCenter ? (s.mapCenter.lat.toFixed(5) + ', ' + s.mapCenter.lng.toFixed(5)) : 'n/a');

    console.log('');
    console.log('── Lookahead ───────────────────────────────────────');
    console.log('offsets         :', s.lookaheadOffsets ? s.lookaheadOffsets.join(', ') : 'n/a');
    if (s.queue && s.queue.length) {
      s.queue.forEach(function (q, i) {
        var active = i === s.stepIndex ? '▶' : ' ';
        console.log(active + ' [' + i + ']',
          'T=' + q.progressT,
          '| lat', q.lat, 'lng', q.lng,
          '| hdg', q.bearing + '°');
      });
    }

    console.log('');
    console.log('── Queue ───────────────────────────────────────────');
    console.log('queueLength     :', s.queueLength);
    console.log('stepIndex       :', s.stepIndex);
    var warmFill = Math.min(1, (s.warmedCount || 0) / 80);
    console.log('warmedCount     : [' + _bar(warmFill) + '] ' + s.warmedCount + '/80');

    console.log('');
    console.log('── Progress ────────────────────────────────────────');
    console.log('routeProgress   :', s.routeProgress !== null ? (s.routeProgress * 100).toFixed(1) + '%' : 'n/a');
    console.log('lastStepMs      :', s.lastStepMs ? (Date.now() - s.lastStepMs) + 'ms ago' : 'never');
    console.log('idleTimeouts    :', s.idleTimeouts);

    if (s.recentWarmed && s.recentWarmed.length) {
      console.log('');
      console.log('── Recent warmed ───────────────────────────────────');
      s.recentWarmed.forEach(function (w) {
        console.log('  T=' + w.progressT, '| lat', w.lat, 'lng', w.lng, '|', w.agoMs + 'ms ago');
      });
    }

    if (s.preflight) {
      var pf = s.preflight;
      console.log('');
      console.log('── Preflight ───────────────────────────────────────');
      console.log('active          :', pf.active);
      console.log('targetDistM     :', pf.targetDistM + 'm  stepM: ' + pf.stepM + 'm');
      console.log('warmedCount     :', pf.warmedCount);
      if (pf.active) {
        console.log('elapsedMs       :', pf.elapsedMs + 'ms');
      } else if (pf.lastResult) {
        var lr = pf.lastResult;
        var icon = lr.timedOut ? '⏱' : lr.ok ? '✓' : '✗';
        console.log('lastResult      :', icon,
          lr.ok ? 'OK' : (lr.timedOut ? 'TIMEOUT' : 'FAILED'),
          '| warmed', lr.warmedCount,
          '| elapsed', lr.elapsedMs + 'ms');
      }
    }

    console.log('');
    console.log('  .preflight()  .fog("thin")  .extrusions()');
    console.log('  .preinit()  .start()  .stop()  .preloadAhead()  .state()');

    console.groupEnd();
    return s;
  }

  // ── preinit() ─────────────────────────────────────────────────────────────────

  function preinit() {
    var p = _ptpr();
    if (!p) { console.warn('[TilePreload Debug] not loaded'); return; }
    p.preinit();
    console.log('[TilePreload Debug] preinit triggered');
  }

  // ── start() ──────────────────────────────────────────────────────────────────

  function start() {
    var p = _ptpr();
    if (!p) { console.warn('[TilePreload Debug] not loaded'); return; }
    p.start();
    console.log('[TilePreload Debug] started');
  }

  // ── stop() ───────────────────────────────────────────────────────────────────

  function stop() {
    var p = _ptpr();
    if (!p) { console.warn('[TilePreload Debug] not loaded'); return; }
    p.stop();
    console.log('[TilePreload Debug] stopped');
  }

  // ── preloadAhead() ───────────────────────────────────────────────────────────

  function preloadAhead() {
    var p = _ptpr();
    if (!p) { console.warn('[TilePreload Debug] not loaded'); return; }
    p.preloadAhead();
    console.log('[TilePreload Debug] preloadAhead() triggered');
  }

  // ── state() ──────────────────────────────────────────────────────────────────

  function state() {
    var p = _ptpr();
    if (!p) { console.warn('[TilePreload Debug] not loaded'); return; }
    var s = p.getState();
    var icon = s.running ? '🟢' : s.enabled ? '🟡' : '⚫';
    var pfIcon = s.preflight && s.preflight.active ? ' 🔥WARMING' : '';
    console.log('[TilePreload Debug] state:',
      icon,
      'enabled', s.enabled,
      '| running', s.running,
      '| mapReady', s.mapReady,
      '| queue', s.queueLength,
      '| warmed', s.warmedCount,
      '| step', s.stepIndex,
      '| profile', s.traversalProfile,
      '| fog', s.fogActive,
      pfIcon);
    return s;
  }

  // ── preflight(opts) ──────────────────────────────────────────────────────────

  function preflight(opts) {
    var p = _ptpr();
    if (!p) { console.warn('[TilePreload Debug] not loaded'); return; }
    if (typeof p.preflightWarmRoute !== 'function') {
      console.warn('[TilePreload Debug] preflightWarmRoute not available');
      return;
    }
    console.log('[TilePreload Debug] preflightWarmRoute starting…', opts || '(defaults)');
    return p.preflightWarmRoute(opts).then(function (result) {
      var icon = result.timedOut ? '⏱' : result.ok ? '✓' : '✗';
      console.log('[TilePreload Debug] preflight done', icon,
        '| warmed', result.warmedCount,
        '| elapsed', result.elapsedMs + 'ms',
        '| timedOut:', result.timedOut);
      return result;
    });
  }

  // ── fog(mode) ─────────────────────────────────────────────────────────────────

  function fog(mode) {
    var p = _ptpr();
    if (!p) { console.warn('[TilePreload Debug] not loaded'); return; }
    if (mode === false || mode === null || mode === 'clear' || mode === 'off') {
      if (typeof p.clearMapboxTraversalFog === 'function') p.clearMapboxTraversalFog();
      console.log('[TilePreload Debug] fog cleared');
      return;
    }
    if (typeof p.applyMapboxTraversalFog !== 'function') {
      console.warn('[TilePreload Debug] applyMapboxTraversalFog not available');
      return;
    }
    var ok = p.applyMapboxTraversalFog(mode || 'thin');
    console.log('[TilePreload Debug] fog applied — mode:', mode || 'thin', '| ok:', ok);
  }

  // ── extrusions() ─────────────────────────────────────────────────────────────

  function extrusions(durationMs) {
    var p = _ptpr();
    if (!p) { console.warn('[TilePreload Debug] not loaded'); return; }
    if (typeof p.applyExtrusionTransitions !== 'function') {
      console.warn('[TilePreload Debug] applyExtrusionTransitions not available');
      return;
    }
    var count = p.applyExtrusionTransitions(durationMs || 500);
    console.log('[TilePreload Debug] extrusion transitions applied to', count, 'layers');
    return count;
  }

  // ── Bind ─────────────────────────────────────────────────────────────────────

  function _bind() {
    global._wos.debug.tilePreload = {
      audit:         audit,
      preflight:     preflight,
      fog:           fog,
      extrusions:    extrusions,
      preinit:       preinit,
      start:         start,
      stop:          stop,
      preloadAhead:  preloadAhead,
      state:         state,
    };
    console.log('[TilePreloadDebug] v' + VERSION + ' ready — _wos.debug.tilePreload bound');
    console.log('  .audit()  .preflight({distanceAheadM:3000})  .fog("thin"|"harbor"|"storm")');
    console.log('  .extrusions()  .preinit()  .start()  .stop()  .preloadAhead()  .state()');
  }

  _bind();

  var _attempts = 0;
  var _timer = global.setInterval(function () {
    _attempts++;
    if (!global._wos || !global._wos.debug || !global._wos.debug.tilePreload) _bind();
    if (_attempts >= 20) global.clearInterval(_timer);
  }, 250);

})(window);
