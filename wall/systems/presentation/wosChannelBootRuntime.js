// ── WosChannelBootRuntime v1.4.0 ─────────────────────────────────────────────
// 0629A_WOS_PLAY_MainProjectBoundaryFixes_v1.0.0
// 0629B_WOS_FlightHoldMotionSmoothing_v1.0.0
// Status: active
// Classification: boot-utility
//
// Reads URL params and auto-starts a named flight preset when the map is ready.
// Hooks into MapboxViewportRuntime.onReady() — fires immediately if the map is
// already loaded, or queues until map:load completes. No polling required.
//
// `channel` is intentionally NOT handled here — reserved for future WOS Channel
// Runtime. This file handles simple flight/route preset boot only.
//
// ── Two flight modes ─────────────────────────────────────────────────────────
//
//   Flight Route (origin + destination both present):
//     Travels from origin airport to destination airport.
//     ?from=JFK&to=MIA    or    ?origin=New%20York&destination=Miami
//
//   Flight Hold (destination + hold=1, OR preset= directly):
//     Ambient loop near a single location (post-arrival or idle).
//     ?destination=Miami&hold=1    or    ?preset=miami-flight-hold
//
// ── Supported params ─────────────────────────────────────────────────────────
//   ?mode=flight                — required to trigger any flight boot
//   ?from=<code|city>           — route origin (airport code or city)
//   ?origin=<code|city>         — alias for from=
//   ?to=<code|city>             — route destination
//   ?destination=<code|city>    — alias for to= (also used for hold= mode)
//   ?hold=1                     — with destination=, launch a hold loop
//   ?preset=<id>                — directly name a preset (overrides route/hold)
//   ?speed=<n>                  — flight speed multiplier (default: 1)
//   ?altitude=cruise            — jump to cruise phase on start
//   ?obs=1                      — handled by inline CSS gate (hides chrome, keeps HUD)
//   ?hud=minimal                — reserved
//   ?clouds=1                   — reserved
//
// ── Example URLs ─────────────────────────────────────────────────────────────
//   Route:  http://localhost:5500/?mode=flight&from=JFK&to=MIA&speed=1&altitude=cruise&hud=minimal&clouds=1&obs=1
//   Hold:   http://localhost:5500/?mode=flight&destination=Miami&hold=1&speed=1&altitude=cruise&hud=minimal&clouds=1&obs=1
//   Direct: http://localhost:5500/?mode=flight&preset=miami_flight_hold_001&speed=1&altitude=cruise&obs=1
//
// Authority:
//   READS: MapboxViewportRuntime.onReady(), RegionalFlightTripRuntime,
//          RegionalFlightCameraRig, URL params
//   DOES NOT: create a map, mount a controller, or depend on WOS Channel Runtime
//
// Placement: wall/systems/presentation/wosChannelBootRuntime.js
// Load: AFTER all runtime scripts (near end of index.html body)
// ─────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.4.0';

  // ── Location alias normalization ──────────────────────────────────────────────
  // Maps airport codes and city names → canonical location key.
  // Route lookup uses these keys: 'jfk:mia', 'jfk:bos', etc.

  var LOCATION_ALIASES = {
    'jfk': 'jfk', 'lga': 'jfk', 'ewr': 'jfk',
    'new york': 'jfk', 'new york city': 'jfk', 'nyc': 'jfk', 'ny': 'jfk',

    'mia': 'mia', 'fll': 'mia',
    'miami': 'mia', 'miami beach': 'mia',

    'bos': 'bos',
    'boston': 'bos',
  };

  // ── Route preset registry (from:to → preset ID) ───────────────────────────────

  var ROUTE_PRESETS = {
    'jfk:mia': { presetId: 'jfk_to_mia_001',          label: 'JFK → Miami' },
    'jfk:bos': { presetId: 'nyc_to_boston_regional_001', label: 'JFK → Boston' },
  };

  // ── Hold preset registry (destination → preset ID) ───────────────────────────

  var HOLD_PRESETS = {
    'mia':    { presetId: 'miami_flight_hold_001', label: 'Miami — Biscayne Bay Hold' },
    'miami':  { presetId: 'miami_flight_hold_001', label: 'Miami — Biscayne Bay Hold' },
  };

  // ── Progress points ───────────────────────────────────────────────────────────
  // SEG.CLIMB_END = 0.24 — start of cruise phase (aircraft at cruise altitude)
  // 0.45 — mid-cruise (used for hold loops to enter an established orbit)

  var CRUISE_JUMP_ROUTE = 0.24;   // start of cruise: skip taxi/takeoff/climb
  var CRUISE_JUMP_HOLD  = 0.45;   // mid-orbit: hold loops already established

  // ── Parse params ──────────────────────────────────────────────────────────────

  var _p    = new URLSearchParams(global.location && global.location.search);
  var _mode = (_p.get('mode') || '').toLowerCase();

  var _rawFrom   = (_p.get('from')   || _p.get('origin')      || '').toLowerCase().trim();
  var _rawTo     = (_p.get('to')     || _p.get('destination')  || '').toLowerCase().trim();
  var _hold      = (_p.get('hold')   || '').trim();
  var _presetId  = (_p.get('preset') || '').trim();
  var _speed     = parseFloat(_p.get('speed')) || 1;
  var _altitude  = (_p.get('altitude') || '').toLowerCase();

  // ── Location normalization ────────────────────────────────────────────────────

  function _normalize(raw) {
    if (!raw) return '';
    var k = raw.toLowerCase().trim();
    return LOCATION_ALIASES[k] || k;
  }

  // ── Flight launch ─────────────────────────────────────────────────────────────

  function _launch(cfg, cruiseJump) {
    var rftr = SBE.RegionalFlightTripRuntime;
    if (!rftr || typeof rftr.start !== 'function') {
      console.warn('[WosBootRuntime] RegionalFlightTripRuntime not available at map-ready — aborting boot');
      return;
    }

    var ok = rftr.start(cfg.presetId);
    if (!ok) {
      console.warn('[WosBootRuntime] start("' + cfg.presetId + '") returned false — preset may not exist');
      return;
    }

    if (typeof rftr.setSpeed === 'function') rftr.setSpeed(_speed);

    if (_altitude === 'cruise' && typeof rftr.jump === 'function') {
      // Jump synchronously — _buildRouteSegments() ran inside start(), segments ready now.
      // Must happen BEFORE rig.start() so the rig snaps to the correct cruise position
      // on its first frame rather than sliding in from the departure origin.
      rftr.jump(cruiseJump);
      console.log('[WosBootRuntime] → cruise jump complete (', (cruiseJump * 100).toFixed(0) + '%)');
    }

    // Start the camera rig to replace the trip runtime's 1.2s flyTo fallback.
    // The rig runs at 60fps with exponential smoothing, eliminating snap/jump behavior
    // at any speed multiplier. Snaps to current aircraft position on first frame,
    // then glides continuously.
    var rig = SBE.RegionalFlightCameraRig;
    if (rig && typeof rig.start === 'function') {
      rig.start();
      console.log('[WosBootRuntime] → camera rig started — 60fps smooth follow active');
    }

    console.info('[WosBootRuntime] ✓ flight launched —', cfg.label,
      '| preset:', cfg.presetId,
      '| speed:', _speed + 'x',
      '| altitude:', _altitude || 'default');
  }

  // ── Boot ──────────────────────────────────────────────────────────────────────

  function _boot() {
    if (_mode !== 'flight') return;

    var cfg         = null;
    var cruiseJump  = CRUISE_JUMP_ROUTE;
    var dispatchLog = '';

    // ── 1. Direct preset= override ────────────────────────────────────────────
    if (_presetId) {
      cfg        = { presetId: _presetId, label: _presetId };
      cruiseJump = CRUISE_JUMP_HOLD;
      dispatchLog = 'direct preset: ' + _presetId;

    // ── 2. Route: from= + to= both present ───────────────────────────────────
    } else if (_rawFrom && _rawTo) {
      var fromKey  = _normalize(_rawFrom);
      var toKey    = _normalize(_rawTo);
      var routeKey = fromKey + ':' + toKey;
      cfg          = ROUTE_PRESETS[routeKey];
      cruiseJump   = CRUISE_JUMP_ROUTE;
      dispatchLog  = 'route: ' + routeKey;

      if (!cfg) {
        console.warn('[WosBootRuntime] unknown route:', routeKey,
          '— known:', Object.keys(ROUTE_PRESETS).join(', '));
        return;
      }

    // ── 3. Hold: destination= + hold=1 ───────────────────────────────────────
    } else if (_rawTo && _hold === '1') {
      var holdKey = _normalize(_rawTo);
      cfg         = HOLD_PRESETS[holdKey] || HOLD_PRESETS[_rawTo];
      cruiseJump  = CRUISE_JUMP_HOLD;
      dispatchLog = 'hold: ' + holdKey;

      if (!cfg) {
        console.warn('[WosBootRuntime] unknown hold destination:', JSON.stringify(_rawTo),
          '— known:', Object.keys(HOLD_PRESETS).join(', '));
        return;
      }

    // ── 4. destination= alone (no from=, no hold=1) — not a valid route ──────
    } else if (_rawTo) {
      console.warn('[WosBootRuntime] destination= present but no from= or hold=1.',
        'To fly a route: add from=<origin>. To hold: add hold=1.',
        '— destination:', JSON.stringify(_rawTo));
      return;

    } else {
      console.warn('[WosBootRuntime] mode=flight but no from/to or destination+hold params found');
      return;
    }

    console.log('[WosBootRuntime] dispatch →', dispatchLog);

    var mvr = SBE.MapboxViewportRuntime;
    if (!mvr || typeof mvr.onReady !== 'function') {
      console.warn('[WosBootRuntime] MapboxViewportRuntime not found at parse time — using window.load fallback');
      global.addEventListener('load', function () {
        global.setTimeout(function () { _launch(cfg, cruiseJump); }, 800);
      });
      return;
    }

    mvr.onReady(function () {
      global.setTimeout(function () { _launch(cfg, cruiseJump); }, 100);
    });

    console.log('[WosBootRuntime] waiting for map:ready → will launch', cfg.label);
  }

  _boot();   // run at parse time — onReady handles all timing

  // ── Public ────────────────────────────────────────────────────────────────────

  SBE.WosBootRuntime = Object.freeze({
    VERSION:       VERSION,
    ROUTE_PRESETS: ROUTE_PRESETS,
    HOLD_PRESETS:  HOLD_PRESETS,
    LOCATION_ALIASES: LOCATION_ALIASES,
  });

  console.log('[WosBootRuntime] v' + VERSION + ' — mode:', _mode || '(none)',
    '| from:', _rawFrom || '(none)',
    '| to:', _rawTo || '(none)',
    '| hold:', _hold || '(none)');

})(window);
