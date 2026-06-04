// ── AircraftDebug v1.1.0 ──────────────────────────────────────────────────────
// 0528A_WOS_AirflightRuntimeBootstrap_v1.0.0 | 0528J_WOS_LowPolyAircraftVisualPass_v1.0.0
// Status: active
// Classification: debug-companion — do NOT load in production
//
// Binds _wos.debug.aircraft with:
//   spawn(airportId)         — spawn an aircraft from the given airport
//   list()                   — tabular report of all active aircraft
//   clear()                  — remove all active aircraft
//   follow(id)               — camera follow a specific aircraft by id
//   followFirst()            — camera follow the first active aircraft
//   influence(bool)          — toggle airspace influence field
//   anchors()                — print airport anchor table
//   audit()                  — full system state report
//   visual()                 — visual debug snapshot (v2.0 renderer)
//   visualMode(mode)         — 'auto' | 'lowpoly' | 'icon'
//   palette(name)            — 'airport_dawn' | 'harbor_fog' | 'night_approach'
//
// Placement: wall/systems/presentation/aircraftDebug.js
// Load: AFTER main.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  global._wos       = global._wos       || {};
  global._wos.debug = global._wos.debug || {};

  var VERSION = '1.1.0';

  function _art()  { return global.SBE && global.SBE.AircraftRuntime; }
  function _inf()  { return global.SBE && global.SBE.AirspaceInfluenceField; }
  function _rend() { return global.SBE && global.SBE.AircraftRenderer; }

  function _pad(s, w) {
    s = String(s);
    while (s.length < w) s += ' ';
    return s;
  }

  // ── spawn(airportId) ──────────────────────────────────────────────────────────

  function spawn(airportId) {
    var art = _art();
    if (!art) { console.warn('[AircraftDebug] AircraftRuntime not loaded'); return null; }
    var id = String(airportId || 'JFK').toUpperCase();
    var e  = art.spawnFromAirport(id);
    if (e) {
      console.log('[AircraftDebug] spawned', e.callsign, '(' + e.aircraftClass + ') from', id, '— id:', e.id);
    }
    return e;
  }

  // ── list() ────────────────────────────────────────────────────────────────────

  function list() {
    var art = _art();
    if (!art) { console.warn('[AircraftDebug] AircraftRuntime not loaded'); return []; }

    var aircraft = art.getActiveAircraft();

    console.group('[AircraftDebug] list() — ' + aircraft.length + ' active aircraft');
    console.log(
      _pad('ID', 10) + _pad('CALLSIGN', 10) + _pad('CLASS', 12) +
      _pad('ORIGIN', 6) + _pad('STATE', 16) + _pad('ALT FT', 9) +
      _pad('SCALAR', 8) + _pad('SPEED KT', 10) + 'LAT / LNG'
    );
    console.log('─'.repeat(100));

    for (var i = 0; i < aircraft.length; i++) {
      var e = aircraft[i];
      console.log(
        _pad(e.id,                       10) +
        _pad(e.callsign,                 10) +
        _pad(e.aircraftClass,            12) +
        _pad(e.originAirportId,           6) +
        _pad(e.lifecycleState,           16) +
        _pad(Math.round(e.altitudeFt),    9) +
        _pad(e.altitudeScalar.toFixed(3), 8) +
        _pad(Math.round(e.groundSpeedKts),10) +
        e.lat.toFixed(4) + ' / ' + e.lng.toFixed(4)
      );
    }
    console.groupEnd();
    return aircraft;
  }

  // ── clear() ───────────────────────────────────────────────────────────────────

  function clear() {
    var art = _art();
    if (!art) { console.warn('[AircraftDebug] AircraftRuntime not loaded'); return; }
    art.clearAll();
    var inf = _inf();
    if (inf && inf.clearSamples) inf.clearSamples();
    console.log('[AircraftDebug] all aircraft cleared');
  }

  // ── follow(id) ────────────────────────────────────────────────────────────────

  function follow(id) {
    var art = _art();
    if (!art) { console.warn('[AircraftDebug] AircraftRuntime not loaded'); return; }
    if (id === null || id === undefined || id === false) {
      art.setCameraFollow(null);
      console.log('[AircraftDebug] camera follow disabled');
    } else {
      art.setCameraFollow(String(id));
    }
  }

  // ── followFirst() ─────────────────────────────────────────────────────────────

  function followFirst() {
    var art = _art();
    if (!art) { console.warn('[AircraftDebug] AircraftRuntime not loaded'); return; }
    var aircraft = art.getActiveAircraft();
    if (!aircraft.length) {
      console.log('[AircraftDebug] no active aircraft — spawning from JFK first');
      var e = art.spawnFromAirport('JFK');
      if (e) art.setCameraFollow(e.id);
      return;
    }
    art.setCameraFollow(aircraft[0].id);
    console.log('[AircraftDebug] following', aircraft[0].callsign, '(' + aircraft[0].id + ')');
  }

  // ── influence(bool) ───────────────────────────────────────────────────────────

  function influence(enabled) {
    var inf  = _inf();
    var rend = _rend();
    if (!inf) { console.warn('[AircraftDebug] AirspaceInfluenceField not loaded'); return; }

    if (enabled === undefined) enabled = !inf.isEnabled();
    inf.setEnabled(!!enabled);

    console.log('[AircraftDebug] influence field:', enabled ? 'ON' : 'OFF');
    if (!enabled) {
      console.log('  Re-enable: _wos.debug.aircraft.influence(true)');
    }
    return !!enabled;
  }

  // ── icons(scale) ──────────────────────────────────────────────────────────────
  // Set the icon scale multiplier on AircraftRenderer.
  // 1.0 = default altitude-aware sizing.  2.0 = double all icons.
  // Called without args: print current value and scale table.

  function icons(scale) {
    var rend = _rend();
    if (!rend) { console.warn('[AircraftDebug] AircraftRenderer not loaded'); return; }

    if (scale === undefined) {
      var cur = rend.getIconScale ? rend.getIconScale() : 1.0;
      console.group('[AircraftDebug] icons() — current multiplier: ' + cur.toFixed(2) + 'x');
      console.log('Altitude-aware base scale (multiplier 1.0):');
      console.log('  scalar 0.00  (ground)   → ×1.30  — big, clear over airport terminals');
      console.log('  scalar 0.08  (takeoff)  → ×1.22  — large with terminal context');
      console.log('  scalar 0.30  (climb)    → ×0.90  — readable mid-air');
      console.log('  scalar 0.50  (high clmb)→ ×0.58  — clearly smaller than low aircraft');
      console.log('  scalar 1.00  (cruise)   → ×0.46  — stable visible mark');
      console.log('Usage: _wos.debug.aircraft.icons(2.0)  → double  |  icons(1.0)  → reset');
      console.groupEnd();
      return cur;
    }

    var s = Math.max(0.1, Math.min(8.0, Number(scale)));
    rend.setIconScale(s);
    console.log('[AircraftDebug] icon scale multiplier →', s.toFixed(2) + 'x',
      s < 1 ? '(smaller)' : s > 1 ? '(larger)' : '(default)');
    return s;
  }

  // ── anchors() ─────────────────────────────────────────────────────────────────

  function anchors() {
    var art = _art();
    if (!art) { console.warn('[AircraftDebug] AircraftRuntime not loaded'); return []; }

    var list_ = art.getAllAnchors();

    console.group('[AircraftDebug] anchors() — ' + list_.length + ' registered');
    console.log(_pad('ID', 6) + _pad('LABEL', 46) + _pad('LAT', 10) + _pad('LNG', 12) +
                _pad('HDG', 6) + _pad('RADIUS_M', 10) + 'ENABLED');
    console.log('─'.repeat(98));
    for (var i = 0; i < list_.length; i++) {
      var a = list_[i];
      console.log(
        _pad(a.id,                             6) +
        _pad(a.label,                         46) +
        _pad(a.lat.toFixed(4),                10) +
        _pad(a.lng.toFixed(4),                12) +
        _pad(a.defaultTakeoffHeadingDeg + '°', 6) +
        _pad(a.localAirspaceRadiusM,          10) +
        (a.enabled ? 'yes' : 'no')
      );
    }
    console.groupEnd();
    return list_;
  }

  // ── audit() ───────────────────────────────────────────────────────────────────

  function audit() {
    var art = _art();
    var inf = _inf();

    console.group('[AircraftDebug] audit()');

    // System state
    console.log('── System ─────────────────────────────────────────');
    console.log('AircraftRuntime loaded    :', !!art);
    console.log('AirspaceInfluenceField    :', !!inf);
    console.log('AircraftRenderer          :', !!_rend());
    console.log('AirspaceInfluenceRenderer :', !!(global.SBE && global.SBE.AirspaceInfluenceRenderer));

    if (!art) { console.groupEnd(); return; }

    // Aircraft summary
    var aircraft = art.getActiveAircraft();
    var byState  = {};
    for (var i = 0; i < aircraft.length; i++) {
      var s = aircraft[i].lifecycleState;
      byState[s] = (byState[s] || 0) + 1;
    }

    console.log('');
    console.log('── Aircraft ───────────────────────────────────────');
    console.log('active                    :', aircraft.length, '/', art.MAX_ACTIVE);
    var states = Object.keys(byState);
    for (var si = 0; si < states.length; si++) {
      console.log('  ' + _pad(states[si], 20), ':', byState[states[si]]);
    }

    if (aircraft.length > 0) {
      var e0 = aircraft[0];
      console.log('');
      console.log('── Lead aircraft ──────────────────────────────────');
      console.log('id                        :', e0.id);
      console.log('callsign                  :', e0.callsign);
      console.log('class                     :', e0.aircraftClass);
      console.log('origin                    :', e0.originAirportId);
      console.log('state                     :', e0.lifecycleState);
      console.log('altitudeFt                :', Math.round(e0.altitudeFt));
      console.log('altitudeScalar            :', e0.altitudeScalar.toFixed(4));
      console.log('groundSpeedKts            :', Math.round(e0.groundSpeedKts));
      console.log('heading                   :', Math.round(e0.headingDeg) + '°');
      console.log('lat / lng                 :', e0.lat.toFixed(5) + ' / ' + e0.lng.toFixed(5));
    }

    // Influence field
    console.log('');
    console.log('── Influence Field ────────────────────────────────');
    if (inf) {
      var samples = inf.getActiveSamples();
      console.log('enabled                   :', inf.isEnabled());
      console.log('active samples            :', samples.length);
      if (samples.length > 0) {
        var s0 = samples[0];
        console.log('sample[0] radiusM         :', Math.round(s0.radiusM));
        console.log('sample[0] intensity       :', s0.intensity.toFixed(3));
        console.log('sample[0] altScalar       :', s0.altitudeScalar.toFixed(3));
      }
    } else {
      console.log('AirspaceInfluenceField not loaded');
    }

    // Airport anchors
    console.log('');
    console.log('── Airport Anchors ────────────────────────────────');
    var anchorList = art.getAllAnchors();
    for (var ai = 0; ai < anchorList.length; ai++) {
      var a = anchorList[ai];
      console.log('  ' + a.id + ' — ' + a.label +
                  ' hdg:' + a.defaultTakeoffHeadingDeg + '°' +
                  (a.enabled ? '' : ' [DISABLED]'));
    }

    console.groupEnd();
  }

  // ── visual() ──────────────────────────────────────────────────────────────────
  // Print visual debug snapshot: per-aircraft classKey, palette slots, detail tier,
  // draw path (lowpoly vs icon).

  function visual() {
    var rend = _rend();
    if (!rend) { console.warn('[AircraftDebug] AircraftRenderer not loaded'); return; }
    if (typeof rend.getVisualDebugSnapshot !== 'function') {
      console.warn('[AircraftDebug] AircraftRenderer does not expose getVisualDebugSnapshot — is v2.0.0 loaded?');
      return;
    }
    return rend.getVisualDebugSnapshot();
  }

  // ── visualMode(mode) ──────────────────────────────────────────────────────────
  // Switch renderer draw path.
  //   auto    — low-poly for REGIONAL_JET, icon fallback for others (default)
  //   lowpoly — force low-poly for all supported classes
  //   icon    — force legacy icon for all

  function visualMode(mode) {
    var rend = _rend();
    if (!rend) { console.warn('[AircraftDebug] AircraftRenderer not loaded'); return; }
    if (mode === undefined) {
      var cur = rend.getVisualMode ? rend.getVisualMode() : 'unknown';
      console.log('[AircraftDebug] current visualMode:', cur, '— options: auto | lowpoly | icon');
      return cur;
    }
    if (typeof rend.setVisualMode === 'function') rend.setVisualMode(mode);
    return mode;
  }

  // ── palette(name) ─────────────────────────────────────────────────────────────
  // Override the active aircraft palette for visual testing.
  //   airport_dawn    — warm morning departure (default)
  //   harbor_fog      — low-vis overcast coastal
  //   night_approach  — dark descent, bright nav lights
  //   (omit or pass null/undefined) — clear override

  function palette(name) {
    var rend = _rend();
    if (!rend) { console.warn('[AircraftDebug] AircraftRenderer not loaded'); return; }
    if (name === undefined) {
      var cur = rend.getPaletteOverride ? rend.getPaletteOverride() : null;
      console.log('[AircraftDebug] current paletteOverride:', cur || '(none — airport_dawn)',
        '— options: airport_dawn | harbor_fog | night_approach | null');
      return cur;
    }
    if (typeof rend.setPaletteOverride === 'function') rend.setPaletteOverride(name || null);
    return name || null;
  }

  // ── Bind ──────────────────────────────────────────────────────────────────────

  function _bind() {
    global._wos       = global._wos       || {};
    global._wos.debug = global._wos.debug || {};
    global._wos.debug.aircraft = {
      spawn:       spawn,
      list:        list,
      clear:       clear,
      follow:      follow,
      followFirst: followFirst,
      influence:   influence,
      icons:       icons,
      anchors:     anchors,
      audit:       audit,
      visual:      visual,
      visualMode:  visualMode,
      palette:     palette,
    };
    console.log('[AircraftDebug] v' + VERSION + ' ready — _wos.debug.aircraft bound');
    console.log('  Commands: .spawn("JFK") · .list() · .clear() · .followFirst() · .follow(null) · .influence(bool) · .icons(scale) · .anchors() · .audit()');
    console.log('  Visual:   .visual() · .visualMode("auto"|"lowpoly"|"icon") · .palette("airport_dawn"|"harbor_fog"|"night_approach")');
  }

  _bind();

  // Retry-safe — main.js may overwrite _wos after this script loads
  var _attempts = 0;
  var _timer = global.setInterval(function () {
    _attempts++;
    if (!global._wos || !global._wos.debug || !global._wos.debug.aircraft) {
      _bind();
    }
    if (_attempts >= 20) global.clearInterval(_timer);
  }, 250);

})(window);
