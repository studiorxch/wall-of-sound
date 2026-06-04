// ── TrafficOccupancyDebug v1.0.0 ─────────────────────────────────────────────
// 0531I_WOS_TrafficOccupancy_v1.0.0
// Status: prototype
// Classification: debug-namespace
//
// Console API: _wos.debug.traffic
//   state()                     — all active traffic actors
//   spawn(n?)                   — spawn n (default 5) actors near hero
//   clear()                     — remove all traffic actors
//   setCount(n)                 — set target count
//   spawnTruck(variant?)        — spawn a single box truck by variant name
//   truckPreview()              — describe the procedural truck geometry
//
// Placement: wall/systems/presentation/trafficOccupancyDebug.js
// Load: AFTER trafficOccupancyRuntime.js + trafficOccupancyRenderer.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  function _rt()  { return global.SBE && global.SBE.TrafficOccupancyRuntime; }

  var _debugObj = {

    state: function () {
      var rt = _rt();
      if (!rt) { console.warn('[traffic] runtime not loaded'); return null; }
      var s = rt.getState();
      console.group('[traffic] state() — ' + s.count + '/' + s.maxCount + ' actors');
      s.actors.forEach(function (a) {
        console.log(a.id, '|', a.type, '|', a.variant, '| src:', a.routeSource, '| prog:', a.progressPct + '%');
      });
      console.groupEnd();
      return s;
    },

    spawn: function (n) {
      var rt = _rt();
      if (!rt) { console.warn('[traffic] runtime not loaded'); return; }
      rt.spawn(n);
    },

    clear: function () {
      var rt = _rt();
      if (!rt) { console.warn('[traffic] runtime not loaded'); return; }
      rt.clear();
    },

    setCount: function (n) {
      var rt = _rt();
      if (!rt) { console.warn('[traffic] runtime not loaded'); return; }
      rt.setCount(n);
    },

    spawnTruck: function (variant) {
      var rt = _rt();
      if (!rt) { console.warn('[traffic] runtime not loaded'); return; }
      rt.spawnTruck(variant || 'clean_white');
    },

    // Synchronous visibility test — no async, no Directions API, immediate markers
    spawnVisibleTest: function () {
      var rt = _rt();
      if (!rt) { console.warn('[traffic] runtime not loaded'); return; }
      if (typeof rt.spawnVisibleTest === 'function') {
        rt.spawnVisibleTest();
      } else {
        console.warn('[traffic] spawnVisibleTest not available in this runtime version');
      }
    },

    // Renderer visual state — DOM + world-space binding per actor
    visual: function () {
      var renderer = global.SBE && global.SBE.TrafficOccupancyRenderer;
      if (!renderer || typeof renderer.getVisualState !== 'function') {
        console.warn('[traffic] renderer visual state unavailable');
        return null;
      }
      var v = renderer.getVisualState();
      console.group('[traffic] visual() — ' + v.markerCount + ' markers, zoom ' + v.currentZoom);
      v.actors.forEach(function (a) {
        console.log(a.id,
          '|', (a.actorType || '?') + '/' + (a.variant || '?'),
          '| mode:', a.mode,
          '| dom:', a.domAttached ? (a.domVisible ? 'visible' : 'hidden') : 'detached',
          '| world:', a.worldBound ? (a.worldVisible ? 'bound+vis' : 'bound') : '—',
          '| hdg:', a.headingDeg != null ? a.headingDeg + '°' : '—',
          '| lat:', a.lat, 'lng:', a.lng,
          '| scale:', a.scale);
      });
      if (v.markerCount === 0) console.warn('[traffic] No markers registered');
      console.groupEnd();
      return v;
    },

    // world(): toggle world-space traffic binding.
    //   no arg → print status; true → bind to WSL; false → force DOM-only
    world: function (on) {
      var renderer = global.SBE && global.SBE.TrafficOccupancyRenderer;
      if (!renderer) { console.warn('[traffic] renderer not loaded'); return; }
      if (on === undefined) {
        var cur = typeof renderer.getWorldBinding === 'function' ? renderer.getWorldBinding() : null;
        console.log('[traffic] world binding:', cur);
        return cur;
      }
      if (typeof renderer.setWorldBinding !== 'function') {
        console.warn('[traffic] setWorldBinding not available'); return;
      }
      var applied = renderer.setWorldBinding(on);
      console.log('[traffic] world binding →', applied,
        applied ? '(traffic renders via WorldSpaceVehicleLayer when ready)'
                : '(DOM-only; world meshes removed)');
    },

    // worldState(): full world-space traffic binding report
    worldState: function () {
      var renderer = global.SBE && global.SBE.TrafficOccupancyRenderer;
      if (!renderer || typeof renderer.getWorldState !== 'function') {
        console.warn('[traffic] worldState unavailable'); return null;
      }
      var s = renderer.getWorldState();
      console.group('[traffic] worldState()');
      console.log('enabled          :', s.enabled);
      console.log('wslEnabled       :', s.wslEnabled);
      console.log('wslRenderReady   :', s.wslRenderReady);
      console.log('actorCount       :', s.actorCount);
      console.log('worldActorCount  :', s.worldActorCount);
      console.log('domVisibleCount  :', s.domVisibleCount);
      console.log('domFallbackCount :', s.domFallbackCount);
      console.log('lastWorldSuccess :', s.lastWorldSuccess
        ? s.lastWorldSuccess.id + ' (' + s.lastWorldSuccess.actorType + '/' + s.lastWorldSuccess.variant + ')' : '—');
      if (s.lastWorldFailure) {
        console.warn('lastWorldFailure :', s.lastWorldFailure.id, '—', s.lastWorldFailure.reason);
      }
      console.groupEnd();
      return s;
    },

    spawnOnHeroRoute: function (count) {
      var rt = _rt();
      if (!rt) { console.warn('[traffic] runtime not loaded'); return; }
      if (typeof rt.spawnOnHeroRoute === 'function') {
        rt.spawnOnHeroRoute(count);
      } else {
        console.warn('[traffic] spawnOnHeroRoute not available');
      }
    },

    truckPreview: function () {
      // Describes the procedural truck geometry without instantiating it
      var result = {
        generated:        true,
        method:           'SVG DOM marker',
        triangleEstimate: 'N/A (SVG path)',
        dimensions:       '48 × 22 px viewBox',
        sections:         ['contact-shadow', 'cargo-box', 'cab', 'windshield', 'heading-cue'],
        variants: [
          {
            name:    'clean_white',
            cargoFill: '#f4f4f4',
            graffitiLayer: false,
          },
          {
            name:      'sticker_graffiti_test',
            cargoFill: '#f4f4f4',
            graffitiLayer: true,
            marks: [
              { color: '#e63e2a', desc: 'red block top-left' },
              { color: '#2b8cde', desc: 'blue block top-right' },
              { color: '#f5c518', desc: 'yellow block middle-left' },
              { color: '#3ab56f', desc: 'green block middle-right' },
              { color: '#e63e2a', desc: 'tag line bottom' },
            ],
          },
          {
            name:    'weathered',
            cargoFill: '#d4cfc6',
            graffitiLayer: false,
          },
        ],
        note: 'Upgrade path: replace SVG with Three.js GLB when Three.js is available.',
      };
      console.group('[traffic] truckPreview()');
      console.log('method     :', result.method);
      console.log('dimensions :', result.dimensions);
      console.log('variants   :', result.variants.map(function (v) { return v.name; }).join(', '));
      result.variants.forEach(function (v) {
        console.log('  ' + v.name + (v.graffitiLayer ? ' [graffiti marks: ' + v.marks.length + ']' : ' [clean]'));
      });
      console.groupEnd();
      return result;
    },

  };

  function _bindDebug() {
    global._wos       = global._wos       || {};
    global._wos.debug = global._wos.debug || {};
    global._wos.debug.traffic = _debugObj;
  }
  _bindDebug();
  global.setTimeout(_bindDebug, 300);
  global.setTimeout(_bindDebug, 1000);
  global.setTimeout(_bindDebug, 2500);

  console.log('[TrafficOccupancyDebug] loaded — _wos.debug.traffic');

})(window);
