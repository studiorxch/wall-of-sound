// ── WOSBootSequencer v1.0.0 ───────────────────────────────────────────────────
// Boot stage tracker, deferred system queue, and console audit tool.
//
// Stages tracked (each stamped with performance.now()):
//   script_start        — this file executed
//   dom_ready           — DOMContentLoaded fired
//   map_container_ready — #mapbox-viewport inserted (WorkspaceUI.init)
//   map_style_loaded    — map.on('style.load') fired
//   first_visible_frame — body.wos-runtime-ready applied
//   map_tiles_loaded    — map.on('load') fired (post-reveal)
//   geometry_loaded     — HarborGeometryRegistry finished loading
//   overlays_ready      — all deferred overlay systems have inited
//
// Deferred system queue:
//   Systems registered via SBE.WOSBootSequencer.defer(label, fn, delayMs)
//   are called after first_visible_frame + delayMs.
//   Deferred inits run AFTER the user sees the map, keeping the reveal fast.
//
// API:
//   SBE.WOSBootSequencer.mark(stageName)
//   SBE.WOSBootSequencer.defer(label, fn, delayMs)
//   SBE.WOSBootSequencer.getStages()
//   SBE.WOSBootSequencer.getState()
//   _wos.debug.boot.audit()
//
// Placement: wall/systems/boot/wosBootSequencer.js
// Load: FIRST script in <head> section of index.html (or as early as possible
//        before main.js) so script_start timestamp is accurate.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  var VERSION = '1.0.0';

  // ── Stage registry ────────────────────────────────────────────────────────────

  var KNOWN_STAGES = [
    'script_start',
    'dom_ready',
    'map_container_ready',
    'map_style_loaded',
    'first_visible_frame',
    'map_tiles_loaded',
    'geometry_loaded',
    'overlays_ready',
  ];

  // { stageName: { t: performance.now(), wallMs: Date.now() } }
  var _stages = {};

  // ── Deferred queue ────────────────────────────────────────────────────────────

  // { label, fn, delayMs, status: 'pending'|'fired'|'error', firedAt: null|ms }
  var _deferredQueue = [];
  var _firstVisibleFrameT = null;

  // ── Internal helpers ──────────────────────────────────────────────────────────

  function _stamp(stageName) {
    if (_stages[stageName]) return; // idempotent
    _stages[stageName] = {
      t:      performance.now(),
      wallMs: Date.now(),
    };
  }

  function _runDeferred(entry) {
    if (entry.status !== 'pending') return;
    entry.status = 'fired';
    entry.firedAt = performance.now();
    try {
      entry.fn();
    } catch (e) {
      entry.status = 'error';
      entry.error  = e && e.message ? e.message : String(e);
      console.error('[WOSBootSequencer] deferred "' + entry.label + '" threw:', e);
    }
  }

  function _fireDeferred(delayMs) {
    // Fire all entries whose delayMs has elapsed since first_visible_frame
    for (var i = 0; i < _deferredQueue.length; i++) {
      var entry = _deferredQueue[i];
      if (entry.status !== 'pending') continue;
      var targetT = (_firstVisibleFrameT || 0) + entry.delayMs;
      if (performance.now() >= targetT) {
        _runDeferred(entry);
      }
    }
    // Check if any pending remain
    var anyPending = false;
    for (var j = 0; j < _deferredQueue.length; j++) {
      if (_deferredQueue[j].status === 'pending') { anyPending = true; break; }
    }
    if (anyPending) {
      // Poll at 100ms — lightweight, stops itself when all fired
      global.setTimeout(function () { _fireDeferred(); }, 100);
    } else {
      _stamp('overlays_ready');
      console.log('[WOSBootSequencer] all deferred systems ready (' + Math.round(performance.now()) + 'ms)');
    }
  }

  // ── Public _onFirstVisibleFrame (called by main.js _markRuntimeReady) ────────

  function _onFirstVisibleFrame() {
    _stamp('first_visible_frame');
    _firstVisibleFrameT = _stages.first_visible_frame.t;
    // Schedule deferred queue drain
    global.setTimeout(function () { _fireDeferred(); }, 0);
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  function mark(stageName) {
    _stamp(stageName);
    if (KNOWN_STAGES.indexOf(stageName) < 0) {
      console.log('[WOSBootSequencer] custom stage:', stageName, '(' + Math.round(_stages[stageName].t) + 'ms)');
    } else {
      console.log('[WOSBootSequencer] ✓ ' + stageName + ' (' + Math.round(_stages[stageName].t) + 'ms)');
    }
  }

  function defer(label, fn, delayMs) {
    if (typeof fn !== 'function') {
      console.warn('[WOSBootSequencer] defer: fn must be a function');
      return;
    }
    var entry = {
      label:   label || 'unnamed',
      fn:      fn,
      delayMs: typeof delayMs === 'number' ? delayMs : 500,
      status:  'pending',
      firedAt: null,
      error:   null,
    };
    _deferredQueue.push(entry);

    // If first_visible_frame already happened, schedule immediately
    if (_firstVisibleFrameT !== null) {
      var remaining = Math.max(0, (_firstVisibleFrameT + entry.delayMs) - performance.now());
      global.setTimeout(function () { _runDeferred(entry); }, remaining);
    }
  }

  function getStages() {
    var out = {};
    for (var k in _stages) {
      out[k] = { t: _stages[k].t, wallMs: _stages[k].wallMs };
    }
    return out;
  }

  function getState() {
    return {
      stages:        getStages(),
      deferredCount: _deferredQueue.length,
      pendingCount:  _deferredQueue.filter(function (e) { return e.status === 'pending'; }).length,
      firedCount:    _deferredQueue.filter(function (e) { return e.status === 'fired'; }).length,
      errorCount:    _deferredQueue.filter(function (e) { return e.status === 'error'; }).length,
    };
  }

  // ── Wire DOMContentLoaded stage ───────────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      mark('dom_ready');
    });
  } else {
    mark('dom_ready');
  }

  // ── Wire map_container_ready via MutationObserver ─────────────────────────────
  // Watches for #mapbox-viewport to be inserted into the DOM.

  (function _watchMapContainer() {
    if (document.getElementById('mapbox-viewport')) {
      mark('map_container_ready');
      return;
    }
    var observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var added = mutations[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var node = added[j];
          if (node.id === 'mapbox-viewport' ||
              (node.querySelector && node.querySelector('#mapbox-viewport'))) {
            observer.disconnect();
            mark('map_container_ready');
            return;
          }
        }
      }
    });
    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree:   true,
    });
  })();

  // ── Wire map_style_loaded + map_tiles_loaded via MapboxViewportRuntime ────────
  // MVR may not exist yet — poll until it appears, then hook.

  (function _watchMVR() {
    var _mvr = global.SBE && SBE.MapboxViewportRuntime;
    if (_mvr) {
      _hookMVR(_mvr);
      return;
    }
    var _attempts = 0;
    var _timer = global.setInterval(function () {
      _attempts++;
      var mvr = global.SBE && SBE.MapboxViewportRuntime;
      if (mvr) {
        global.clearInterval(_timer);
        _hookMVR(mvr);
      }
      if (_attempts >= 100) global.clearInterval(_timer); // 10s timeout
    }, 100);
  })();

  function _hookMVR(mvr) {
    if (mvr.onStyleLoad) {
      mvr.onStyleLoad(function () { mark('map_style_loaded'); });
    }
    if (mvr.onReady) {
      mvr.onReady(function () { mark('map_tiles_loaded'); });
    }
  }

  // ── Wire geometry_loaded via HarborGeometryRegistry poll ─────────────────────

  (function _watchGeometryRegistry() {
    var _attempts = 0;
    var _timer = global.setInterval(function () {
      _attempts++;
      var reg = global.SBE && SBE.HarborGeometryRegistry;
      if (reg && reg.isLoaded()) {
        global.clearInterval(_timer);
        mark('geometry_loaded');
      }
      if (_attempts >= 200) global.clearInterval(_timer); // 20s timeout
    }, 100);
  })();

  // ── Register ──────────────────────────────────────────────────────────────────

  _stamp('script_start');

  SBE.WOSBootSequencer = Object.freeze({
    VERSION:              VERSION,
    mark:                 mark,
    defer:                defer,
    getStages:            getStages,
    getState:             getState,
    _onFirstVisibleFrame: _onFirstVisibleFrame,  // called by main.js
  });

  console.log('[WOSBootSequencer] v' + VERSION + ' loaded — script_start at ' + Math.round(_stages.script_start.t) + 'ms');

})(window);
