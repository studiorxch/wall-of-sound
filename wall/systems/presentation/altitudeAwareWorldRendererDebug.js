// ── AltitudeAwareWorldRendererDebug v1.0.0 ───────────────────────────────────
// 0528B_WOS_AltitudeAwareWorldRenderer_v1.0.0 — debug companion
// Status: active
// Classification: debug-companion — do NOT load in production
//
// Binds _wos.debug.altitudeWorld with:
//   profile()      — print current AltitudeWorldProfile
//   mode(m)        — set render mode: auto | ground | low | mid | high | descent
//   enabled(bool)  — toggle renderer on/off
//   overlay()      — describe current overlay values
//   audit()        — full system state report
//   bands()        — print all band profile constants
//
// Placement: wall/systems/presentation/altitudeAwareWorldRendererDebug.js
// Load: AFTER main.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  global._wos       = global._wos       || {};
  global._wos.debug = global._wos.debug || {};

  var VERSION = '1.0.0';

  function _awr() { return global.SBE && global.SBE.AltitudeAwareWorldRenderer; }
  function _art() { return global.SBE && global.SBE.AircraftRuntime; }

  function _pad(s, w) {
    s = String(s);
    while (s.length < w) s += ' ';
    return s;
  }

  // ── profile() ────────────────────────────────────────────────────────────────

  function profile() {
    var awr = _awr();
    if (!awr) { console.warn('[AltitudeWorldDebug] AltitudeAwareWorldRenderer not loaded'); return null; }

    var lead    = awr.getLeadAircraft();
    var camera  = (global.SBE && global.SBE.MapboxViewportRuntime && global.SBE.MapboxViewportRuntime.getCamera)
      ? global.SBE.MapboxViewportRuntime.getCamera()
      : { zoom: 12, pitch: 0 };

    var p = awr.resolveAltitudeWorldProfile(lead, camera);

    console.group('[AltitudeWorldDebug] profile()');
    console.log('band                  :', p.band);
    console.log('detailFocus           :', p.detailFocus.toFixed(3));
    console.log('infrastructureFocus   :', p.infrastructureFocus.toFixed(3));
    console.log('aerialHaze            :', p.aerialHaze.toFixed(3));
    console.log('buildingOpacity       :', p.buildingOpacity.toFixed(3));
    console.log('buildingContrast      :', p.buildingContrast.toFixed(3));
    console.log('maritimeOpacity       :', p.maritimeOpacity.toFixed(3));
    console.log('routeTraceOpacity     :', p.routeTraceOpacity.toFixed(3));
    console.log('influenceFieldOpacity :', p.influenceFieldOpacity.toFixed(3));
    console.log('horizonLift           :', p.horizonLift.toFixed(3));
    console.log('worldTint             : rgba(' + p.worldTint.r + ',' + p.worldTint.g + ',' + p.worldTint.b + ',' + p.worldTint.a.toFixed(4) + ')');
    console.groupEnd();
    return p;
  }

  // ── mode(m) ───────────────────────────────────────────────────────────────────

  function mode(m) {
    var awr = _awr();
    if (!awr) { console.warn('[AltitudeWorldDebug] AltitudeAwareWorldRenderer not loaded'); return; }

    if (m === undefined) {
      var st = awr.getState();
      console.log('[AltitudeWorldDebug] current mode:', st.mode, '| band:', st.lastBand || 'none', '| lerpT:', st.lerpT.toFixed(3));
      console.log('  Valid modes: auto | ground | low | mid | high | descent');
      return st.mode;
    }

    awr.setMode(String(m));
    return String(m);
  }

  // ── enabled(bool) ─────────────────────────────────────────────────────────────

  function enabled(val) {
    var awr = _awr();
    if (!awr) { console.warn('[AltitudeWorldDebug] AltitudeAwareWorldRenderer not loaded'); return; }

    if (val === undefined) {
      var st = awr.getState();
      console.log('[AltitudeWorldDebug] enabled:', st.enabled);
      console.log('  Toggle: _wos.debug.altitudeWorld.enabled(true|false)');
      return st.enabled;
    }
    awr.setEnabled(!!val);
    return !!val;
  }

  // ── overlay() ─────────────────────────────────────────────────────────────────

  function overlay() {
    var state = global.SBE && global.SBE.AltitudeWorldState;
    if (!state) {
      console.log('[AltitudeWorldDebug] overlay() — no active AltitudeWorldState (renderer disabled or no aircraft)');
      return null;
    }

    console.group('[AltitudeWorldDebug] overlay() — band: ' + state.band);
    console.log('aerialHaze            :', state.aerialHaze.toFixed(3));
    console.log('horizonLift           :', state.horizonLift.toFixed(3));
    console.log('routeTraceOpacity     :', state.routeTraceOpacity.toFixed(3));
    console.log('influenceFieldOpacity :', state.influenceFieldOpacity.toFixed(3));
    console.log('maritimeOpacity       :', state.maritimeOpacity.toFixed(3));
    console.log('detailFocus           :', state.detailFocus.toFixed(3));
    console.groupEnd();
    return state;
  }

  // ── bands() ──────────────────────────────────────────────────────────────────

  function bands() {
    var awr = _awr();
    if (!awr) { console.warn('[AltitudeWorldDebug] AltitudeAwareWorldRenderer not loaded'); return; }

    var names = ['ground', 'low_climb', 'mid_climb', 'high_cruise'];
    console.group('[AltitudeWorldDebug] bands()');
    console.log(
      _pad('BAND', 14) + _pad('HAZE', 7) + _pad('TINT_A', 8) +
      _pad('H_LIFT', 8) + _pad('DETAIL', 8) + _pad('INFRA', 7) +
      _pad('MARINE', 8) + _pad('INF_FLD', 9) + 'ROUTE'
    );
    console.log('─'.repeat(80));
    var bp = awr.BAND_PROFILES;
    for (var i = 0; i < names.length; i++) {
      var p = bp[names[i]];
      console.log(
        _pad(p.band,                          14) +
        _pad(p.aerialHaze.toFixed(3),          7) +
        _pad(p.worldTint.a.toFixed(3),         8) +
        _pad(p.horizonLift.toFixed(3),         8) +
        _pad(p.detailFocus.toFixed(2),         8) +
        _pad(p.infrastructureFocus.toFixed(2), 7) +
        _pad(p.maritimeOpacity.toFixed(2),     8) +
        _pad(p.influenceFieldOpacity.toFixed(2),9) +
        p.routeTraceOpacity.toFixed(2)
      );
    }
    console.groupEnd();
    return bp;
  }

  // ── audit() ──────────────────────────────────────────────────────────────────

  function audit() {
    var awr = _awr();
    var art = _art();

    console.group('[AltitudeWorldDebug] audit()');

    // System
    console.log('── System ─────────────────────────────────────────');
    console.log('AltitudeAwareWorldRenderer:', !!awr);
    console.log('AircraftRuntime           :', !!art);
    console.log('AltitudeWorldState        :', !!(global.SBE && global.SBE.AltitudeWorldState));

    if (!awr) { console.groupEnd(); return; }

    var st = awr.getState();
    console.log('');
    console.log('── Renderer State ─────────────────────────────────');
    console.log('enabled                   :', st.enabled);
    console.log('mode                      :', st.mode);
    console.log('lastBand                  :', st.lastBand || 'none');
    console.log('lerpT                     :', st.lerpT.toFixed(3));

    // Lead aircraft
    var lead = awr.getLeadAircraft();
    console.log('');
    console.log('── Lead Aircraft ──────────────────────────────────');
    if (lead) {
      console.log('id                        :', lead.id);
      console.log('callsign                  :', lead.callsign);
      console.log('lifecycleState            :', lead.lifecycleState);
      console.log('altitudeScalar            :', lead.altitudeScalar.toFixed(4));
      console.log('altitudeFt                :', Math.round(lead.altitudeFt));
      var band = awr.resolveAltitudeBand(lead);
      console.log('resolvedBand              :', band);
    } else {
      console.log('none');
    }

    // Active profile
    var camera = (global.SBE && global.SBE.MapboxViewportRuntime && global.SBE.MapboxViewportRuntime.getCamera)
      ? global.SBE.MapboxViewportRuntime.getCamera()
      : { zoom: 12, pitch: 0 };

    console.log('');
    console.log('── Active Profile ─────────────────────────────────');
    var p = awr.resolveAltitudeWorldProfile(lead, camera);
    console.log('band                      :', p.band);
    console.log('aerialHaze                :', p.aerialHaze.toFixed(3));
    console.log('horizonLift               :', p.horizonLift.toFixed(3));
    console.log('routeTraceOpacity         :', p.routeTraceOpacity.toFixed(3));
    console.log('influenceFieldOpacity     :', p.influenceFieldOpacity.toFixed(3));
    console.log('maritimeOpacity           :', p.maritimeOpacity.toFixed(3));
    console.log('worldTint                 : rgba(' + p.worldTint.r + ',' + p.worldTint.g + ',' + p.worldTint.b + ',' + p.worldTint.a.toFixed(4) + ')');

    // Camera
    console.log('');
    console.log('── Camera ─────────────────────────────────────────');
    console.log('zoom                      :', camera.zoom ? camera.zoom.toFixed(2) : 'n/a');
    console.log('pitch                     :', camera.pitch ? camera.pitch.toFixed(1) + '°' : '0°');
    console.log('bearing                   :', camera.bearing ? camera.bearing.toFixed(1) + '°' : '0°');

    // All aircraft count
    if (art) {
      var all = art.getActiveAircraft();
      console.log('');
      console.log('── Active Aircraft ────────────────────────────────');
      console.log('count                     :', all.length, '/', art.MAX_ACTIVE);
    }

    console.groupEnd();
  }

  // ── forceBand(band) ───────────────────────────────────────────────────────────
  // Alias for mode() using band shorthand. Accepts: "ground"|"low"|"mid"|"high".
  // Resets to auto tracking with forceBand("auto") or forceBand(null).

  function forceBand(band) {
    if (band === null || band === undefined || band === 'auto') {
      return mode('auto');
    }
    // Accept both full band names and shorthand
    var aliases = { ground:'ground', low:'low', low_climb:'low', mid:'mid', mid_climb:'mid', high:'high', high_cruise:'high', descent:'descent' };
    var resolved = aliases[String(band)];
    if (!resolved) {
      console.warn('[AltitudeWorldDebug] forceBand: unknown band "' + band + '" — valid: ground | low | mid | high | auto');
      return;
    }
    console.log('[AltitudeWorldDebug] forceBand →', resolved);
    return mode(resolved);
  }

  // ── Bind ──────────────────────────────────────────────────────────────────────

  function _bind() {
    global._wos       = global._wos       || {};
    global._wos.debug = global._wos.debug || {};
    global._wos.debug.altitudeWorld = {
      profile:   profile,
      mode:      mode,
      enabled:   enabled,
      overlay:   overlay,
      bands:     bands,
      audit:     audit,
      forceBand: forceBand,
    };
    console.log('[AltitudeWorldDebug] v' + VERSION + ' ready — _wos.debug.altitudeWorld bound');
    console.log('  Commands: .profile() · .mode("auto"|"ground"|"low"|"mid"|"high") · .forceBand("ground"|"low"|"mid"|"high") · .enabled(bool) · .overlay() · .bands() · .audit()');
  }

  _bind();

  // Retry-safe — main.js may overwrite _wos after this script loads
  var _attempts = 0;
  var _timer = global.setInterval(function () {
    _attempts++;
    if (!global._wos || !global._wos.debug || !global._wos.debug.altitudeWorld) {
      _bind();
    }
    if (_attempts >= 20) global.clearInterval(_timer);
  }, 250);

})(window);
