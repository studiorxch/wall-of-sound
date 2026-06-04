// ── AtmosphericContinuityDebug v1.0.0 ────────────────────────────────────────
// 0528Q_WOS_CloudAtmosphereTransitionSmoothing_v1.0.0 — debug companion
// Status: active
// Classification: debug-companion — do NOT load in production
//
// Binds _wos.debug.atmosphere with:
//   pressure(v)       — set pressure scalar (0–1)
//   silence(v)        — set silence scalar (0–1)
//   resonance(v)      — set resonance scalar (0–1)
//   fog(v)            — override fog density display (0–1)
//   thermal(v)        — trigger thermal distortion spike (0–1)
//   electric(v)       — trigger electrical activity spike (0–1)
//   bloom(type)       — trigger a bloom event (electrical|thermal|pressure|resonance)
//   recover()         — trigger recovery + silence cycle
//   preset(id)        — queue a preset change (smoothed)
//   audit()           — full atmosphere state report
//
// Placement: wall/systems/presentation/atmosphericContinuityDebug.js
// Load: AFTER atmosphericContinuityRuntime.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  global._wos       = global._wos       || {};
  global._wos.debug = global._wos.debug || {};

  var VERSION = '1.0.0';

  function _rt() { return global.SBE && global.SBE.AtmosphericContinuityRuntime; }

  function _pad(s, w) {
    s = String(s);
    while (s.length < w) s += ' ';
    return s;
  }

  // ── pressure(v) ───────────────────────────────────────────────────────────────

  function pressure(v) {
    var rt = _rt();
    if (!rt) { console.warn('[AtmosphericContinuityDebug] runtime not loaded'); return; }
    if (v === undefined) {
      var s = rt.getState();
      console.log('[AtmosphericContinuityDebug] pressure:', s.atmosphere.pressureScalar);
      return s.atmosphere.pressureScalar;
    }
    rt.setPressure(Number(v));
  }

  // ── silence(v) ────────────────────────────────────────────────────────────────

  function silence(v) {
    var rt = _rt();
    if (!rt) { console.warn('[AtmosphericContinuityDebug] runtime not loaded'); return; }
    if (v === undefined) {
      var s = rt.getState();
      console.log('[AtmosphericContinuityDebug] silence:', s.atmosphere.silenceScalar);
      return s.atmosphere.silenceScalar;
    }
    rt.setSilence(Number(v));
  }

  // ── resonance(v) ──────────────────────────────────────────────────────────────

  function resonance(v) {
    var rt = _rt();
    if (!rt) { console.warn('[AtmosphericContinuityDebug] runtime not loaded'); return; }
    if (v === undefined) {
      var s = rt.getState();
      console.log('[AtmosphericContinuityDebug] resonance:', s.atmosphere.resonanceScalar);
      return s.atmosphere.resonanceScalar;
    }
    rt.setResonance(Number(v));
  }

  // ── fog(v) ────────────────────────────────────────────────────────────────────
  // Drives fog via the cloud preset system (queues harbor_fog or clear).

  function fog(v) {
    var rt = _rt();
    if (!rt) { console.warn('[AtmosphericContinuityDebug] runtime not loaded'); return; }
    var val = v === undefined ? undefined : Math.max(0, Math.min(1, Number(v)));
    if (val === undefined) {
      var s = rt.getState();
      console.log('[AtmosphericContinuityDebug] fogDensity:', s.atmosphere.fogDensity,
        '  (use fog(0.8) or preset("harbor_fog") to change)');
      return;
    }
    // Map scalar to nearest preset
    var pid = val < 0.15 ? 'clear' : val < 0.35 ? 'thin' : val < 0.60 ? 'harbor_fog' : 'storm_shelf';
    rt.queuePreset(pid);
    console.log('[AtmosphericContinuityDebug] fog', val.toFixed(2), '→ queuing preset:', pid);
  }

  // ── thermal(v) ────────────────────────────────────────────────────────────────

  function thermal(v) {
    var rt = _rt();
    if (!rt) { console.warn('[AtmosphericContinuityDebug] runtime not loaded'); return; }
    if (v === undefined) {
      var s = rt.getState();
      console.log('[AtmosphericContinuityDebug] thermalDistortion:', s.atmosphere.thermalDistortion);
      return;
    }
    // Trigger a proportional thermal bloom
    rt.setPressure(Number(v));
    rt.triggerBloom('thermal');
  }

  // ── electric(v) ───────────────────────────────────────────────────────────────

  function electric(v) {
    var rt = _rt();
    if (!rt) { console.warn('[AtmosphericContinuityDebug] runtime not loaded'); return; }
    if (v === undefined) {
      var s = rt.getState();
      console.log('[AtmosphericContinuityDebug] electricalActivity:', s.atmosphere.electricalActivity);
      return;
    }
    rt.setPressure(Number(v));
    rt.triggerBloom('electrical');
  }

  // ── bloom(type) ───────────────────────────────────────────────────────────────

  function bloom(type) {
    var rt = _rt();
    if (!rt) { console.warn('[AtmosphericContinuityDebug] runtime not loaded'); return; }
    if (!type) {
      var types = rt.BLOOM_TYPES;
      console.group('[AtmosphericContinuityDebug] bloom types');
      Object.keys(types).forEach(function (k) {
        console.log(_pad(k, 12),
          'electric:', types[k].electricSpike.toFixed(2),
          ' thermal:', types[k].thermalSpike.toFixed(2),
          ' decay:', types[k].decaySec + 's');
      });
      console.groupEnd();
      return;
    }
    rt.triggerBloom(type);
  }

  // ── recover() ─────────────────────────────────────────────────────────────────

  function recover() {
    var rt = _rt();
    if (!rt) { console.warn('[AtmosphericContinuityDebug] runtime not loaded'); return; }
    rt.triggerRecovery();
  }

  // ── preset(id) ────────────────────────────────────────────────────────────────

  function preset(id) {
    var rt = _rt();
    if (!rt) { console.warn('[AtmosphericContinuityDebug] runtime not loaded'); return; }
    if (!id) {
      var palette = rt.PRESET_PALETTE;
      console.group('[AtmosphericContinuityDebug] presets');
      Object.keys(palette).forEach(function (k) {
        var p = palette[k];
        console.log(_pad(k, 14),
          'cloud:', p.cloudDensity.toFixed(2),
          ' fog:', p.fogDensity.toFixed(2),
          ' haze:', p.hazeDensity.toFixed(2),
          ' warmth:', p.warmth.toFixed(2));
      });
      console.groupEnd();
      return;
    }
    rt.queuePreset(id);
  }

  // ── audit() ───────────────────────────────────────────────────────────────────

  function audit() {
    var rt = _rt();
    if (!rt) { console.warn('[AtmosphericContinuityDebug] runtime not loaded'); return; }
    var s  = rt.getState();
    var a  = s.atmosphere;

    console.group('[AtmosphericContinuityDebug] audit()');

    console.log('── Runtime ────────────────────────────────────────');
    console.log('version          :', s.version);
    console.log('enabled          :', s.enabled);

    console.log('');
    console.log('── Blend ──────────────────────────────────────────');
    console.log('blending         :', s.blending, s.blending
      ? '(' + s.fromPreset + ' → ' + s.toPreset + ' at ' + s.blendPct + '%)' : '');
    console.log('from / to        :', s.fromPreset, '/', s.toPreset);
    console.log('blendT           :', s.blendT);

    console.log('');
    console.log('── Events ─────────────────────────────────────────');
    console.log('inBloom          :', s.inBloom, s.inBloom ? '(' + s.bloomType + ')' : '');
    console.log('inRecovery       :', s.inRecovery);

    console.log('');
    console.log('── Atmosphere ─────────────────────────────────────');
    console.log('cloudDensity     :', a.cloudDensity);
    console.log('hazeDensity      :', a.hazeDensity);
    console.log('fogDensity       :', a.fogDensity);
    console.log('skylineVis       :', a.skylineVis);
    console.log('warmth           :', a.warmth);
    console.log('thermalDistortion:', a.thermalDistortion);
    console.log('electricActivity :', a.electricalActivity);
    console.log('resonanceScalar  :', a.resonanceScalar);
    console.log('silenceScalar    :', a.silenceScalar);
    console.log('pressureScalar   :', a.pressureScalar);
    console.log('recoveryScalar   :', a.recoveryScalar);

    console.log('');
    console.log('Quick test: .bloom("electrical") → .recover() → .preset("clear")');
    console.groupEnd();

    return s;
  }

  // ── Bind ──────────────────────────────────────────────────────────────────────

  function _bind() {
    global._wos.debug.atmosphere = {
      pressure:  pressure,
      silence:   silence,
      resonance: resonance,
      fog:       fog,
      thermal:   thermal,
      electric:  electric,
      bloom:     bloom,
      recover:   recover,
      preset:    preset,
      audit:     audit,
    };
    console.log('[AtmosphericContinuityDebug] v' + VERSION + ' ready — _wos.debug.atmosphere bound');
    console.log('  .audit()  .bloom("electrical")  .pressure(0.8)  .recover()  .preset("harbor_fog")');
  }

  _bind();

  var _attempts = 0;
  var _timer    = global.setInterval(function () {
    _attempts++;
    if (!global._wos || !global._wos.debug || !global._wos.debug.atmosphere) _bind();
    if (_attempts >= 20) global.clearInterval(_timer);
  }, 250);

})(window);
