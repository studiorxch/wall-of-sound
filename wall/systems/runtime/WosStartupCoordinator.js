(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});

  // ── WosStartupCoordinator — map visual readiness gate for WOS boot ────────────

  var _state = {
    mapReady:          false,
    mapStyleLoaded:    false,
    orbitalActive:     false,
    selectedTransport: 'flight',
    booted:            false,
    readyAt:           null,
    loggedOnce:        false
  };

  var _pendingOrbital   = false;
  var _readyCallbacks   = [];

  // ── restoreMapStartupVisualState — synchronous, safe to call any time ─────────
  // Removes any stuck orbital/travel state left over from a previous session
  // or a failed transition. Called on module load, DOMContentLoaded, and before
  // readiness evaluation.

  function restoreMapStartupVisualState() {
    // 1. Remove stuck body classes (all Orbital + Moon + transition classes)
    document.body.classList.remove('wos-orbital-active');
    document.body.classList.remove('wos-travel-state');
    document.body.classList.remove('wos-orbital-earth-active');
    document.body.classList.remove('wos-moon-surface-active');
    document.body.classList.remove('wos-moon-orbit-active');
    document.body.classList.remove('wos-moon-active');
    document.body.classList.remove('wos-transition-active');
    document.body.classList.remove('wos-map-dimmed');

    // 2. Hide orbital canvas
    var orbCanvas = document.getElementById('orbital-mode-canvas');
    if (orbCanvas) {
      orbCanvas.style.display    = 'none';
      orbCanvas.style.visibility = 'hidden';
    }

    // 3. Restore map opacity / filter
    var mapEl = document.querySelector('.mapboxgl-map');
    if (mapEl) {
      mapEl.style.opacity    = '';
      mapEl.style.filter     = '';
      mapEl.style.visibility = '';
    }
    var vp = document.getElementById('mapbox-viewport');
    if (vp) {
      vp.style.opacity    = '';
      vp.style.filter     = '';
      vp.style.visibility = '';
    }

    // 4. Clear transition overlays
    var ov = document.getElementById('wos-transition-overlay');
    if (ov) { ov.style.display = 'none'; ov.style.background = 'rgba(2,6,14,0)'; }
    var atm = document.getElementById('wos-atm-bridge');
    if (atm) { atm.style.display = 'none'; atm.style.opacity = '0'; }

    // 5. Hide orbital FX button
    var fxBtn = document.getElementById('nav-orbital-fx');
    if (fxBtn) fxBtn.style.display = 'none';
  }

  // ── getMapVisualReadinessReport — detailed per-check diagnostic ───────────────

  function getMapVisualReadinessReport() {
    var failures = [];

    // Map container
    var vp = document.getElementById('mapbox-viewport') ||
             document.querySelector('.canvas-area');
    if (!vp) {
      failures.push('map-container-missing');
    } else {
      var r = vp.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) failures.push('map-container-zero-size');
    }

    // Shell must not be in booting state (wos-booting hides the legacy-editor shell)
    if (document.body.classList.contains('wos-booting')) failures.push('body-wos-booting-class');

    // Mapbox canvas
    var canvas = document.querySelector('.mapboxgl-canvas');
    if (!canvas) failures.push('mapbox-canvas-missing');

    // Map object + style
    var mvr = SBE.MapboxViewportRuntime;
    var map = mvr && (mvr.map || (mvr.getMap && mvr.getMap()));
    var styleLoaded = false;
    if (!map) {
      failures.push('map-object-missing');
    } else {
      try { styleLoaded = map.isStyleLoaded(); }
      catch (e) { styleLoaded = false; }
      if (!styleLoaded) failures.push('style-not-loaded');
    }

    // Map opacity / filter must be default (not stuck from orbital)
    var mapEl = document.querySelector('.mapboxgl-map');
    var mapOpacity = mapEl ? (mapEl.style.opacity || '1') : 'n/a';
    var mapFilter  = mapEl ? (mapEl.style.filter  || '')  : 'n/a';
    if (mapOpacity !== '' && mapOpacity !== '1') failures.push('map-opacity-not-1:' + mapOpacity);
    if (mapFilter !== '' && mapFilter !== 'none') failures.push('map-filter-stuck:' + mapFilter);

    // Orbital canvas hidden
    var orbCanvas = document.getElementById('orbital-mode-canvas');
    var orbHidden = !orbCanvas || orbCanvas.style.display === 'none';
    if (!orbHidden) failures.push('orbital-canvas-visible');

    // Body classes — check for any stuck Orbital/Moon classes
    var bodyClasses = document.body.className;
    if (document.body.classList.contains('wos-orbital-active'))       failures.push('body-orbital-active-class');
    if (document.body.classList.contains('wos-travel-state'))         failures.push('body-travel-state-class');
    if (document.body.classList.contains('wos-orbital-earth-active')) failures.push('body-orbital-earth-active-class');
    if (document.body.classList.contains('wos-moon-active'))          failures.push('body-moon-active-class');
    if (document.body.classList.contains('wos-moon-surface-active'))  failures.push('body-moon-surface-active-class');
    if (document.body.classList.contains('wos-moon-orbit-active'))    failures.push('body-moon-orbit-active-class');

    var ready = failures.length === 0;
    return {
      ready:               ready,
      failures:            failures,
      mapContainerFound:   !!vp,
      mapCanvasFound:      !!canvas,
      mapStyleLoaded:      styleLoaded,
      mapOpacity:          mapOpacity,
      mapFilter:           mapFilter,
      orbitalCanvasHidden: orbHidden,
      bodyClasses:         bodyClasses
    };
  }

  // ── isMapVisuallyReady — fast boolean from the report ─────────────────────────

  function isMapVisuallyReady() {
    return getMapVisualReadinessReport().ready;
  }

  // ── waitForMapVisualReady ─────────────────────────────────────────────────────

  function waitForMapVisualReady(opts) {
    opts = opts || {};
    var timeoutMs = opts.timeoutMs || 5000;
    var onReady   = opts.onReady   || null;
    var onTimeout = opts.onTimeout || null;
    var started   = performance.now();

    // Always restore before checking
    restoreMapStartupVisualState();

    if (isMapVisuallyReady()) {
      _onMapReady();
      if (onReady) onReady();
      return;
    }

    var interval = setInterval(function () {
      restoreMapStartupVisualState(); // ensure CSS stuck state is always cleared
      if (isMapVisuallyReady()) {
        clearInterval(interval);
        _onMapReady();
        if (onReady) onReady();
        return;
      }
      if (performance.now() - started > timeoutMs) {
        clearInterval(interval);
        var report = getMapVisualReadinessReport();
        console.warn('[WOS Startup] Map visual readiness failed', report);
        if (onTimeout) onTimeout(report);
      }
    }, 200);
  }

  // ── Internal ─────────────────────────────────────────────────────────────────

  function _onMapReady() {
    if (_state.mapReady) return;
    _state.mapReady       = true;
    _state.mapStyleLoaded = true;
    _state.readyAt        = performance.now();

    // Ensure map is at the expected default camera position and is properly sized
    _resetMapCamera();

    _logStartupDiagnostic();
    if (_pendingOrbital) { _pendingOrbital = false; _enterOrbital(); }
    _readyCallbacks.forEach(function (fn) { try { fn(); } catch (e) {} });
    _readyCallbacks = [];
  }

  function _resetMapCamera() {
    var mvr = SBE.MapboxViewportRuntime;
    if (!mvr) return;
    var map = mvr.map || (mvr.getMap && mvr.getMap());
    if (!map) return;
    try {
      // Only reset if the camera is wildly outside expected range
      // (zoom < 5 or zoom > 20 means something set it wrong)
      var z = map.getZoom();
      if (z < 5 || z > 20) {
        if (mvr.setCamera) {
          mvr.setCamera({ center: [-74.0165, 40.7015], zoom: 12.8, bearing: -12, pitch: 30 });
        } else {
          map.jumpTo({ center: [-74.0165, 40.7015], zoom: 12.8, bearing: -12, pitch: 30 });
        }
      }
      // Trigger resize to ensure canvas dimensions are correct
      map.resize();
      map.triggerRepaint();
    } catch (e) {}
  }

  function _logStartupDiagnostic() {
    if (_state.loggedOnce) return;
    _state.loggedOnce = true;
    var report = getMapVisualReadinessReport();
    var endpointRole = (SBE.WosEndpointRole && SBE.WosEndpointRole.role) || 'unknown';
    var mvr = SBE.MapboxViewportRuntime;
    var map = mvr && (mvr.map || (mvr.getMap && mvr.getMap()));
    var cam = null;
    try { cam = map ? { zoom: map.getZoom().toFixed(1), pitch: map.getPitch().toFixed(0), bearing: map.getBearing().toFixed(0) } : null; }
    catch (e) {}
    console.info('[WOS Runtime] startup state', {
      mode:             'MAP',
      mapReady:         _state.mapReady,
      mapStyleLoaded:   _state.mapStyleLoaded,
      orbitalActive:    !!(SBE.OrbitalMode && SBE.OrbitalMode.isActive && SBE.OrbitalMode.isActive()),
      selectedTransport: _state.selectedTransport,
      endpointRole:     endpointRole,
      camera:           cam,
      readyAt:          _state.readyAt ? Math.round(_state.readyAt) + 'ms' : null,
      visualReadiness:  report
    });
  }

  // ── Public: orbital gate ──────────────────────────────────────────────────────

  function requestOrbitalEntry() {
    var report = getMapVisualReadinessReport();
    if (!report.ready) {
      console.warn('[WOS Transition] Orbital blocked: map is not visually ready', report.failures);
      return false;
    }
    _enterOrbital();
    return true;
  }

  function _enterOrbital() {
    var tc = SBE.WosModeTransitionController;
    if (tc && tc.transitionToOrbital) tc.transitionToOrbital();
    else if (SBE.OrbitalMode && SBE.OrbitalMode.enter) SBE.OrbitalMode.enter();
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  function markMapReady()    { _onMapReady(); }
  function markOrbitalReady() { /* orbital built but not entered */ }

  function onReady(fn) {
    if (_state.mapReady) { try { fn(); } catch (e) {} }
    else _readyCallbacks.push(fn);
  }

  function getState() {
    return Object.assign({}, _state, {
      mapVisuallyReady: isMapVisuallyReady(),
      pendingOrbital:   _pendingOrbital
    });
  }

  function boot() {
    if (_state.booted) return;
    _state.booted = true;

    // Immediate cleanup — synchronous, safe even before DOM is ready
    restoreMapStartupVisualState();

    // Hook 1 — wos-runtime-ready body class (main.js _markRuntimeReady)
    if (typeof MutationObserver !== 'undefined') {
      var obs = new MutationObserver(function () {
        if (document.body.classList.contains('wos-runtime-ready') && !_state.mapReady) {
          restoreMapStartupVisualState();
          _onMapReady();
          obs.disconnect();
        }
      });
      obs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }

    // Hook 2 — WOSBootSequencer deferred after first_visible_frame
    var seq = SBE.WOSBootSequencer;
    if (seq && seq.defer) {
      seq.defer('WosStartupCoordinator.visualCheck', function () {
        restoreMapStartupVisualState();
        if (!_state.mapReady) waitForMapVisualReady({ timeoutMs: 4000 });
      }, 0);
    }

    // Hook 3 — polling fallback (2 s delay to let Mapbox style.load fire first)
    global.setTimeout(function () {
      restoreMapStartupVisualState();
      if (!_state.mapReady) waitForMapVisualReady({ timeoutMs: 6000 });
    }, 2000);
  }

  SBE.WosStartupCoordinator = Object.freeze({
    boot:                      boot,
    markMapReady:              markMapReady,
    markOrbitalReady:          markOrbitalReady,
    requestOrbitalEntry:       requestOrbitalEntry,
    isMapVisuallyReady:        isMapVisuallyReady,
    waitForMapVisualReady:     waitForMapVisualReady,
    getMapVisualReadinessReport: getMapVisualReadinessReport,
    restoreMapStartupVisualState: restoreMapStartupVisualState,
    onReady:                   onReady,
    getState:                  getState
  });

  // ── Auto-boot — synchronous on script load, then on DOMContentLoaded ─────────
  restoreMapStartupVisualState(); // synchronous — clears stuck state immediately

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      restoreMapStartupVisualState();
      boot();
    });
  } else {
    boot();
  }

})(window);
