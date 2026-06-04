// ── CloudAtmosphereDebug v1.0.0 ───────────────────────────────────────────────
// 0528C_WOS_CloudAtmosphereLayer_v1.0.0 — debug companion
// Status: active
// Classification: debug-companion — do NOT load in production
//
// Binds _wos.debug.clouds with:
//   enabled(bool)          — toggle cloud renderer on/off
//   preset(id)             — set preset: clear | thin | harbor_fog | storm_shelf
//   density(mult)          — cloud density multiplier (0–3)
//   speed(mult)            — drift speed multiplier (0–4)
//   shadows(bool)          — toggle shadow pass
//   profile()              — print current cloud profile
//   audit()                — full system state report
//
// Placement: wall/systems/presentation/cloudAtmosphereDebug.js
// Load: AFTER main.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  global._wos       = global._wos       || {};
  global._wos.debug = global._wos.debug || {};

  var VERSION = '1.0.0';

  function _cal()  { return global.SBE && global.SBE.CloudAtmosphereLayer; }
  function _car()  { return global.SBE && global.SBE.CloudAtmosphereRenderer; }

  function _pad(s, w) {
    s = String(s);
    while (s.length < w) s += ' ';
    return s;
  }

  // ── enabled(bool) ─────────────────────────────────────────────────────────────

  function enabled(val) {
    var cal = _cal();
    var car = _car();
    if (!cal) { console.warn('[CloudDebug] CloudAtmosphereLayer not loaded'); return; }

    if (val === undefined) {
      console.log('[CloudDebug] enabled:', cal.isEnabled());
      console.log('  Toggle: _wos.debug.clouds.enabled(true|false)');
      return cal.isEnabled();
    }
    cal.setEnabled(!!val);
    if (car) car.setEnabled(!!val);
    return !!val;
  }

  // ── preset(id) ────────────────────────────────────────────────────────────────

  function preset(id) {
    var cal = _cal();
    if (!cal) { console.warn('[CloudDebug] CloudAtmosphereLayer not loaded'); return; }

    if (id === undefined) {
      console.log('[CloudDebug] current preset:', cal.getPreset());
      console.log('  Available: clear | thin | harbor_fog | storm_shelf');
      return cal.getPreset();
    }
    cal.setPreset(String(id));
    return String(id);
  }

  // ── density(mult) ─────────────────────────────────────────────────────────────

  function density(mult) {
    var cal = _cal();
    if (!cal) { console.warn('[CloudDebug] CloudAtmosphereLayer not loaded'); return; }

    if (mult === undefined) {
      var st = cal.getState();
      console.log('[CloudDebug] density multiplier:', st.densityMult.toFixed(2), '×');
      console.log('  Set: _wos.debug.clouds.density(1.5)  — range 0.0–3.0');
      return st.densityMult;
    }
    var m = Math.max(0, Math.min(3, Number(mult)));
    cal.setDensity(m);
    console.log('[CloudDebug] density →', m.toFixed(2) + '×');
    return m;
  }

  // ── speed(mult) ───────────────────────────────────────────────────────────────

  function speed(mult) {
    var cal = _cal();
    if (!cal) { console.warn('[CloudDebug] CloudAtmosphereLayer not loaded'); return; }

    if (mult === undefined) {
      var st = cal.getState();
      console.log('[CloudDebug] speed multiplier:', st.speedMult.toFixed(2), '×');
      console.log('  Set: _wos.debug.clouds.speed(2.0)  — range 0.0–4.0');
      return st.speedMult;
    }
    var m = Math.max(0, Math.min(4, Number(mult)));
    cal.setSpeed(m);
    console.log('[CloudDebug] speed →', m.toFixed(2) + '×');
    return m;
  }

  // ── shadows(bool) ─────────────────────────────────────────────────────────────

  function shadows(val) {
    var cal = _cal();
    if (!cal) { console.warn('[CloudDebug] CloudAtmosphereLayer not loaded'); return; }

    if (val === undefined) {
      console.log('[CloudDebug] shadows:', cal.shadowsEnabled());
      return cal.shadowsEnabled();
    }
    cal.setShadows(!!val);
    console.log('[CloudDebug] shadows →', !!val);
    return !!val;
  }

  // ── profile() ─────────────────────────────────────────────────────────────────

  function profile() {
    var cal = _cal();
    if (!cal) { console.warn('[CloudDebug] CloudAtmosphereLayer not loaded'); return null; }

    var p = cal.getProfile();

    console.group('[CloudDebug] profile() — preset: ' + p.preset + ' band: ' + p.altitudeBand);
    console.log('cloudOpacity          :', p.cloudOpacity.toFixed(4));
    console.log('shadowOpacity         :', p.shadowOpacity.toFixed(4));
    console.log('horizonOpacity        :', p.horizonOpacity.toFixed(4));
    console.log('driftSpeedPxPerSec    :', p.driftSpeedPxPerSec.toFixed(1));
    console.log('scale                 :', p.scale.toFixed(3));
    console.log('contrast              :', p.contrast.toFixed(3));
    console.log('warmth                :', p.warmth.toFixed(3));
    console.log('yBias                 :', p.yBias.toFixed(3), '  (0=top 1=bottom)');
    console.log('ySpread               :', p.ySpread.toFixed(3));
    console.groupEnd();
    return p;
  }

  // ── audit() ──────────────────────────────────────────────────────────────────

  function audit() {
    var cal = _cal();
    var car = _car();

    console.group('[CloudDebug] audit()');

    // System
    console.log('── System ─────────────────────────────────────────');
    console.log('CloudAtmosphereLayer    :', !!cal);
    console.log('CloudAtmosphereRenderer :', !!car);
    console.log('CloudAtmosphereState    :', !!(global.SBE && global.SBE.CloudAtmosphereState));
    console.log('AltitudeWorldState      :', !!(global.SBE && global.SBE.AltitudeWorldState));

    if (!cal) { console.groupEnd(); return; }

    // Layer state
    var st = cal.getState();
    console.log('');
    console.log('── Layer State ────────────────────────────────────');
    console.log('enabled               :', st.enabled);
    console.log('preset                :', st.preset);
    console.log('altitudeBand          :', st.altitudeBand);
    console.log('densityMult           :', st.densityMult.toFixed(2) + '×');
    console.log('speedMult             :', st.speedMult.toFixed(2) + '×');
    console.log('shadowsOn             :', st.shadowsOn);
    console.log('bandLerpT             :', st.bandLerpT.toFixed(3));
    console.log('activeSheetCount      :', st.activeSheetCount);
    console.log('cloudOpacity          :', st.cloudOpacity.toFixed(4));
    console.log('shadowOpacity         :', st.shadowOpacity.toFixed(4));

    // Altitude world
    var aws = global.SBE && global.SBE.AltitudeWorldState;
    console.log('');
    console.log('── AltitudeWorldState ─────────────────────────────');
    if (aws) {
      console.log('band                  :', aws.band);
      console.log('aerialHaze            :', aws.aerialHaze.toFixed(3));
      console.log('horizonLift           :', aws.horizonLift.toFixed(3));
      console.log('influenceFieldOpacity :', aws.influenceFieldOpacity.toFixed(3));
    } else {
      console.log('(not available — no aircraft active or renderer disabled)');
    }

    // Sheets
    var sheets = cal.getSheets();
    console.log('');
    console.log('── Sheets ─────────────────────────────────────────');
    console.log(_pad('ID', 6) + _pad('OPACITY', 10) + _pad('SHADOW_OP', 12) + _pad('WEIGHT', 9) + _pad('Y_FRAC', 9) + 'DRIFT_X');
    console.log('─'.repeat(60));
    for (var si = 0; si < sheets.length; si++) {
      var s = sheets[si];
      console.log(
        _pad(s.id,                        6) +
        _pad(s.opacity.toFixed(4),       10) +
        _pad(s.shadowOpacity.toFixed(4), 12) +
        _pad(s.weight.toFixed(3),         9) +
        _pad(s.yFrac.toFixed(3),          9) +
        s.driftX.toFixed(1) + 'px'
      );
    }

    // Presets reference
    console.log('');
    console.log('── Presets ────────────────────────────────────────');
    console.log(_pad('PRESET', 14) + _pad('OPACITY', 10) + _pad('SHADOW', 9) + _pad('HORIZON', 10) + _pad('SPEED', 8) + 'WARMTH');
    console.log('─'.repeat(60));
    var presets = cal.PRESETS;
    var pids = ['clear', 'thin', 'harbor_fog', 'storm_shelf'];
    for (var pi = 0; pi < pids.length; pi++) {
      var p = presets[pids[pi]];
      var mark = (pids[pi] === st.preset) ? ' ◀' : '';
      console.log(
        _pad(pids[pi],                          14) +
        _pad(p.cloudOpacity.toFixed(3),         10) +
        _pad(p.shadowOpacity.toFixed(3),         9) +
        _pad(p.horizonOpacity.toFixed(3),       10) +
        _pad(p.driftSpeedPxPerSec + 'px/s',     8) +
        p.warmth.toFixed(2) + mark
      );
    }

    console.groupEnd();
  }

  // ── Bind ──────────────────────────────────────────────────────────────────────

  function _bind() {
    global._wos       = global._wos       || {};
    global._wos.debug = global._wos.debug || {};
    global._wos.debug.clouds = {
      enabled: enabled,
      preset:  preset,
      density: density,
      speed:   speed,
      shadows: shadows,
      profile: profile,
      audit:   audit,
    };
    console.log('[CloudAtmosphereDebug] v' + VERSION + ' ready — _wos.debug.clouds bound');
    console.log('  Commands: .enabled(bool) · .preset("thin"|"harbor_fog"|"storm_shelf"|"clear") · .density(1.0) · .speed(1.0) · .shadows(bool) · .profile() · .audit()');
  }

  _bind();

  // Retry-safe — main.js may overwrite _wos after this script loads
  var _attempts = 0;
  var _timer = global.setInterval(function () {
    _attempts++;
    if (!global._wos || !global._wos.debug || !global._wos.debug.clouds) {
      _bind();
    }
    if (_attempts >= 20) global.clearInterval(_timer);
  }, 250);

})(window);
