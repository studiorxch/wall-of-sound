// ── BroadcastMapIsolation v1.0.0 ─────────────────────────────────────────────
// 0709_WOS_Mapbox_Style_Isolation_v1.0.0_BUILD
//
// Hard isolation switch for the broadcast map. Three explicit modes:
//   normal  — custom StudioRich Mapbox style, untouched
//   cleaned — custom style + BroadcastStyleCleanup.apply()
//   minimal — deterministic local minimal style (bypasses remote style entirely)
//
// Defaults:
//   broadcast/embed/OBS context → minimal
//   standalone WOS              → normal
//
// Override before load: window.__WOS_BROADCAST_MAP_MODE__ = "normal"|"cleaned"|"minimal"
//
// Console API:
//   _wos.debug.broadcast.mapMode.get() / .set(mode) / .status()
//   _wos.debug.broadcast.patternTest.disableEverything() / .restore()
//
// Placement: wall/runtimes/broadcastMapIsolation.js
// Load: after mapboxViewportRuntime.js, broadcastMinimalStyle.js, broadcastStyleCleanup.js
// ─────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  var VERSION = '1.0.0';
  var MODES = ['normal', 'cleaned', 'minimal'];
  var STUDIO_STYLE = 'mapbox://styles/studiorich/cm3goyx23003901qkb60ff29p';

  var _mode        = null;   // resolved on first _resolveMode()
  var _appliedMode = null;   // last mode actually applied to the map
  var _lastError   = null;

  // ── Map access ────────────────────────────────────────────────────────────────

  function _getMap() {
    var mvr = SBE.MapboxViewportRuntime;
    if (mvr && typeof mvr.getMap === 'function') return mvr.getMap();
    return null;
  }

  // ── Context detection (same rules as broadcastStyleCleanup) ──────────────────

  function _context() {
    var html  = global.document && global.document.documentElement;
    var body  = global.document && global.document.body;
    return {
      embed:              !!(html && html.classList.contains('wos-embed')),
      obs:                !!(html && html.classList.contains('wos-obs')),
      playControlsHidden: !!(body && body.classList.contains('play-controls-hidden')),
      iframe:             global.self !== global.top,
      forced:             global.__WOS_BROADCAST_SAFE__ === true,
    };
  }

  function _isBroadcastContext() {
    var c = _context();
    return c.embed || c.obs || c.playControlsHidden || c.iframe || c.forced;
  }

  // ── Persistence ───────────────────────────────────────────────────────────────

  var STORAGE_KEY = 'wos.broadcast.mapMode';

  function _readSavedMode() {
    try {
      var saved = global.localStorage.getItem(STORAGE_KEY);
      if (saved && MODES.indexOf(saved) !== -1) return saved;
    } catch (e) {}
    return null;
  }

  function _persistMode(mode) {
    try { global.localStorage.setItem(STORAGE_KEY, mode); } catch (e) {}
  }

  function _resolveMode() {
    // 1. Valid saved mode wins
    var saved = _readSavedMode();
    if (saved) return saved;
    // 2. Explicit global override
    var override = global.__WOS_BROADCAST_MAP_MODE__;
    if (override && MODES.indexOf(override) !== -1) return override;
    // 3. Context default
    return _isBroadcastContext() ? 'minimal' : 'normal';
  }

  // ── Apply a mode to the live map ──────────────────────────────────────────────

  function _applyMode(mode) {
    var map = _getMap();
    if (!map) {
      _lastError = 'map not ready';
      console.warn('[BroadcastMapIsolation] applyMode(' + mode + '): map not ready');
      return false;
    }

    try {
      if (mode === 'minimal') {
        if (!SBE.BroadcastMinimalStyle) {
          _lastError = 'BroadcastMinimalStyle not loaded';
          console.warn('[BroadcastMapIsolation] minimal style module missing');
          return false;
        }
        map.setStyle(SBE.BroadcastMinimalStyle.create());
      } else {
        // normal + cleaned both start from the StudioRich style
        map.setStyle(STUDIO_STYLE);
        if (mode === 'cleaned') {
          map.once('style.load', function () {
            if (SBE.BroadcastStyleCleanup) SBE.BroadcastStyleCleanup.apply();
          });
        }
      }
      _appliedMode = mode;
      _lastError = null;
      console.log('[BroadcastMapIsolation] mode applied →', mode);
      return true;
    } catch (e) {
      _lastError = String(e && e.message || e);
      console.warn('[BroadcastMapIsolation] applyMode failed:', _lastError);
      return false;
    }
  }

  // ── Public mode API ───────────────────────────────────────────────────────────

  function getMode() {
    if (_mode === null) _mode = _resolveMode();
    return _mode;
  }

  function setMode(mode, options) {
    options = options || {};
    if (MODES.indexOf(mode) === -1) {
      console.warn('[BroadcastMapIsolation] invalid mode:', mode, '— use', MODES.join(' | '));
      return false;
    }
    _mode = mode;
    global.__WOS_BROADCAST_MAP_MODE__ = mode;
    if (options.persist !== false) _persistMode(mode);
    var ok = _applyMode(mode);
    syncUi();
    return ok;
  }

  // syncUi — broadcasts the current mode to the parent frame (PLAY) so its
  // MAP STYLE toggle reflects reality. WOS itself has no local toggle UI.
  function syncUi() {
    if (global.parent === global) return;
    try {
      global.parent.postMessage({
        type: 'wall:map-mode',
        payload: { mode: getMode(), appliedMode: _appliedMode },
      }, '*');
    } catch (e) {}
  }

  function status() {
    return {
      version:     VERSION,
      mode:        getMode(),
      appliedMode: _appliedMode,
      context:     _context(),
      isBroadcast: _isBroadcastContext(),
      minimalStyleLoaded: !!SBE.BroadcastMinimalStyle,
      cleanupLoaded:      !!SBE.BroadcastStyleCleanup,
      lastError:   _lastError,
    };
  }

  // ── Pattern isolation test — nukes all shell CSS effects ─────────────────────

  var PATTERN_TEST_CLASS = 'wos-pattern-test-clean';
  var PATTERN_TEST_STYLE_ID = 'wos-pattern-test-style';

  function patternTestDisableEverything() {
    var doc = global.document;
    if (!doc) return;

    if (!doc.getElementById(PATTERN_TEST_STYLE_ID)) {
      var el = doc.createElement('style');
      el.id = PATTERN_TEST_STYLE_ID;
      el.textContent = [
        '.' + PATTERN_TEST_CLASS + ' *,',
        '.' + PATTERN_TEST_CLASS + ' *::before,',
        '.' + PATTERN_TEST_CLASS + ' *::after {',
        '  background-image: none !important;',
        '  filter: none !important;',
        '  backdrop-filter: none !important;',
        '  box-shadow: none !important;',
        '  text-shadow: none !important;',
        '  mix-blend-mode: normal !important;',
        '}',
        '.' + PATTERN_TEST_CLASS + ' *::before,',
        '.' + PATTERN_TEST_CLASS + ' *::after {',
        '  content: none !important;',
        '  display: none !important;',
        '}',
      ].join('\n');
      doc.head.appendChild(el);
    }
    doc.documentElement.classList.add(PATTERN_TEST_CLASS);
    console.log('[BroadcastMapIsolation] patternTest ON — all shell effects disabled.',
      'If the pattern is GONE, the source is shell CSS / pseudo-elements.',
      'If it REMAINS, the source is the map canvas / style / custom renderer.');
  }

  function patternTestRestore() {
    var doc = global.document;
    if (!doc) return;
    doc.documentElement.classList.remove(PATTERN_TEST_CLASS);
    var el = doc.getElementById(PATTERN_TEST_STYLE_ID);
    if (el && el.parentNode) el.parentNode.removeChild(el);
    console.log('[BroadcastMapIsolation] patternTest restored — shell effects re-enabled');
  }

  // ── Boot: enforce default mode when the map style first loads ─────────────────
  //
  // The map boots with the StudioRich style (mapboxViewportRuntime default).
  // If the resolved mode is minimal or cleaned, we act on style.load:
  //   minimal → swap style entirely
  //   cleaned → BroadcastStyleCleanup already auto-applies (its own hook); no-op here

  function _hookBoot() {
    var mvr = SBE.MapboxViewportRuntime;
    if (!mvr || typeof mvr.onStyleLoad !== 'function') return;

    mvr.onStyleLoad(function () {
      var mode = getMode();
      if (mode === 'minimal' && _appliedMode !== 'minimal') {
        // Defer so boot-sequencer style.load callbacks finish first
        global.setTimeout(function () { _applyMode('minimal'); }, 50);
      } else if (mode !== 'minimal') {
        _appliedMode = mode; // normal/cleaned: boot style already correct
      }
      syncUi();
    });
  }

  global.setTimeout(_hookBoot, 0);

  // ── PLAY bridge — parent frame can set/query the mode via postMessage ─────────
  //   play:set-map-mode  { mode }  → setMode(mode) (persists)
  //   play:get-map-mode            → replies wall:map-mode

  global.addEventListener('message', function (e) {
    if (!e.data || typeof e.data.type !== 'string') return;
    if (e.data.type === 'play:set-map-mode') {
      var m = e.data.mode || (e.data.payload && e.data.payload.mode);
      if (m) setMode(m);
    } else if (e.data.type === 'play:get-map-mode') {
      syncUi();
    }
  });

  // ── Public API ────────────────────────────────────────────────────────────────

  SBE.BroadcastMapIsolation = Object.freeze({
    get:    getMode,
    set:    setMode,
    status: status,
    syncUi: syncUi,
  });

  // Debug namespace — bound now AND re-bound after window load, because
  // main.js reassigns window._wos during boot and clobbers earlier bindings.
  function _bindDebug() {
    if (!global._wos)                 global._wos       = {};
    if (!global._wos.debug)           global._wos.debug = {};
    if (!global._wos.debug.broadcast) global._wos.debug.broadcast = {};
    global._wos.debug.broadcast.mapMode = {
      get:    getMode,
      set:    setMode,
      status: status,
      syncUi: syncUi,
    };
    global._wos.debug.broadcast.patternTest = {
      disableEverything: patternTestDisableEverything,
      restore:           patternTestRestore,
    };
  }
  _bindDebug();
  global.addEventListener('load', function () { global.setTimeout(_bindDebug, 500); });

  console.log('[BroadcastMapIsolation] v' + VERSION + ' loaded | mode:', getMode(),
    '| _wos.debug.broadcast.mapMode.set("minimal")');

})(window);
