// ── AtmosphericContinuityRuntime v1.0.0 ──────────────────────────────────────
// 0528Q_WOS_CloudAtmosphereTransitionSmoothing_v1.0.0
// Status: active
// Classification: environmental-presentation-runtime
//
// Purpose:
//   Transforms atmosphere from preset-switching weather into continuous
//   energetic environmental behavior.  Three layers of effect:
//
//   1. Preset blending — intercepts CloudAtmosphereLayer.setPreset() by
//      replacing SBE.CloudAtmosphereLayer with a thin proxy. Hard switches
//      become smooth fade-out → switch-at-midpoint → fade-in curves driven
//      through CloudAtmosphereLayer.setDensity().
//
//   2. Pressure cycle — atmosphere slowly accumulates pressure over time,
//      can bloom into electrical/thermal/resonance events, then recovers
//      through a quiet silence state before recharging.
//
//   3. Canvas overlay — own canvas (z-index 6) adds haze, fog lift, bloom
//      flash, and thermal shimmer that CloudAtmosphereLayer doesn't cover.
//
// Authority:
//   OWNS: smoothed atmosphere state, overlay canvas, pressure/bloom/recovery
//   READS: CloudAtmosphereLayer, RegionalFlightTripRuntime, AltitudeWorldState
//   MUST NOT MUTATE: aircraft entity, route truth, planner state, map style,
//                    CloudAtmosphereLayer frozen object internals
//
// Intercept mechanic:
//   SBE.CloudAtmosphereLayer is re-assigned to a proxy wrapper (SBE itself
//   is not frozen).  The proxy forwards all methods to the real layer except
//   setPreset(), which is routed through _queuePreset() instead.
//   The original layer object remains accessible as _cloud.
//
// Placement: wall/systems/presentation/atmosphericContinuityRuntime.js
// Load: AFTER cloudAtmosphereLayer.js, AFTER regionalFlightCameraRig.js,
//       BEFORE regionalFlightTripDebug.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  var VERSION = '1.0.0';

  // ── Preset palette — values we blend between ──────────────────────────────────
  // cloudDensity: master cloud opacity target (mirrors CloudAtmosphereLayer.PRESETS)
  // hazeDensity:  full-screen atmospheric haze overlay
  // fogDensity:   bottom-of-screen fog lift overlay
  // skylineVis:   1 = fully clear, 0 = fully obscured
  // warmth:       -1 = cold, 0 = neutral, +1 = warm (amber)

  var PRESET_PALETTE = Object.freeze({
    clear:       Object.freeze({ cloudDensity:0.05, hazeDensity:0.00, fogDensity:0.00, skylineVis:1.00, warmth: 0.00 }),
    thin:        Object.freeze({ cloudDensity:0.28, hazeDensity:0.06, fogDensity:0.08, skylineVis:0.88, warmth: 0.00 }),
    harbor_fog:  Object.freeze({ cloudDensity:0.46, hazeDensity:0.22, fogDensity:0.28, skylineVis:0.58, warmth: 0.38 }),
    storm_shelf: Object.freeze({ cloudDensity:0.72, hazeDensity:0.42, fogDensity:0.50, skylineVis:0.28, warmth:-0.18 }),
  });

  // ── Bloom event definitions ───────────────────────────────────────────────────

  var BLOOM_TYPES = Object.freeze({
    electrical: { electricSpike:0.92, thermalSpike:0.10, pressureDrop:0.70, decaySec:8,  label:'Electrical bloom' },
    thermal:    { electricSpike:0.18, thermalSpike:0.85, pressureDrop:0.60, decaySec:12, label:'Thermal bloom'     },
    pressure:   { electricSpike:0.25, thermalSpike:0.30, pressureDrop:0.80, decaySec:15, label:'Pressure bloom'    },
    resonance:  { electricSpike:0.45, thermalSpike:0.20, pressureDrop:0.55, decaySec:10, label:'Resonance bloom'   },
  });

  // ── Blend timing ──────────────────────────────────────────────────────────────

  var BLEND_DURATION_MS = 9000;   // full fade-out → switch → fade-in in 9s

  // ── Original cloud layer reference ───────────────────────────────────────────

  var _cloud = null;   // set in _intercept()

  // ── Blend state ───────────────────────────────────────────────────────────────

  var _fromPreset  = 'clear';
  var _toPreset    = 'clear';
  var _blendT      = 1.0;    // 0 = start of blend, 1 = fully arrived
  var _blending    = false;

  // ── Active atmosphere state ───────────────────────────────────────────────────
  // Interpolated values that drive the overlay canvas.

  var _atmo = {
    cloudDensity:     0.05,
    hazeDensity:      0.00,
    fogDensity:       0.00,
    skylineVis:       1.00,
    warmth:           0.00,
    thermalDistortion:0.00,
    electricalActivity:0.00,
    resonanceScalar:  0.00,
    silenceScalar:    0.00,
    pressureScalar:   0.00,
    recoveryScalar:   0.00,
    lastTransitionMs: 0,
  };

  // ── Pressure accumulation ─────────────────────────────────────────────────────
  // Pressure auto-builds when a trip is active.  Rate: 0.0008/sec ≈ ~21 min
  // to reach 1.0 at real speed; ~21 sec at speed(60).

  var PRESSURE_RATE        = 0.0008;
  var PRESSURE_BLOOM_THRESHOLD = 0.85;

  var _autoPressure    = true;   // auto-accumulation enabled
  var _inBloom         = false;
  var _bloomType       = null;
  var _bloomElapsedSec = 0;
  var _inRecovery      = false;
  var _recoveryElapsedSec = 0;
  var RECOVERY_DURATION_SEC = 18;

  // ── Canvas overlay ────────────────────────────────────────────────────────────

  var _canvas  = null;
  var _ctx     = null;
  var _rafId   = null;
  var _lastFrameMs = 0;
  var _enabled = true;

  function _ensureCanvas() {
    if (_canvas && _canvas.parentElement) return true;
    var container = document.querySelector('.mapboxgl-canvas-container') ||
                    document.getElementById('map') ||
                    document.body;
    _canvas     = document.createElement('canvas');
    _canvas.id  = 'wos-atmo-continuity-canvas';
    _canvas.setAttribute('aria-hidden', 'true');
    _canvas.style.cssText = [
      'position:absolute','top:0','left:0',
      'width:100%','height:100%',
      'pointer-events:none','z-index:6',   // below planner:7, aircraft:8
    ].join(';');
    if (container !== document.body &&
        (!container.style.position || container.style.position === 'static')) {
      container.style.position = 'relative';
    }
    container.appendChild(_canvas);
    _ctx = _canvas.getContext('2d');
    return true;
  }

  function _resizeCanvas() {
    if (!_canvas || !_canvas.parentElement) return;
    var p = _canvas.parentElement;
    var w = p.clientWidth  || global.innerWidth;
    var h = p.clientHeight || global.innerHeight;
    if (_canvas.width !== w || _canvas.height !== h) {
      _canvas.width  = w;
      _canvas.height = h;
    }
  }

  // ── Blend helpers ─────────────────────────────────────────────────────────────

  function _lerp(a, b, t) { return a + (b - a) * Math.max(0, Math.min(1, t)); }

  // Blend a DensityMult curve from the active preset through the transition.
  // Phase 1 (t 0→0.5): fade cloud density OUT (from 1.0 → 0.05)
  // Phase 2 (t 0.5→1): fade cloud density IN (from 0.05 → 1.0)
  // This creates a cloud-parting-and-filling visual rather than a hard cut.
  function _blendDensityMult(t) {
    if (t < 0.5) return _lerp(1.0, 0.05, t / 0.5);
    return _lerp(0.05, 1.0, (t - 0.5) / 0.5);
  }

  // Smooth easing for atmospheric value blending
  function _ease(t) { return t * t * (3 - 2 * t); }

  // ── Preset blend state resolution ────────────────────────────────────────────
  // Returns interpolated palette values between fromPreset and toPreset at t.

  function _blendPalette(t) {
    var from = PRESET_PALETTE[_fromPreset] || PRESET_PALETTE.clear;
    var to   = PRESET_PALETTE[_toPreset]   || PRESET_PALETTE.clear;
    var e    = _ease(t);
    return {
      cloudDensity: _lerp(from.cloudDensity, to.cloudDensity, e),
      hazeDensity:  _lerp(from.hazeDensity,  to.hazeDensity,  e),
      fogDensity:   _lerp(from.fogDensity,   to.fogDensity,   e),
      skylineVis:   _lerp(from.skylineVis,   to.skylineVis,   e),
      warmth:       _lerp(from.warmth,       to.warmth,       e),
    };
  }

  // ── Update blend ──────────────────────────────────────────────────────────────

  function _updateBlend(dtMs) {
    if (!_blending) return;

    var prev = _blendT;
    _blendT += dtMs / BLEND_DURATION_MS;

    // At midpoint (t=0.5): flip the real cloud layer preset
    if (prev < 0.5 && _blendT >= 0.5 && _cloud) {
      _cloud.setPreset(_toPreset);
    }

    if (_blendT >= 1.0) {
      _blendT   = 1.0;
      _blending = false;
      if (_cloud) {
        _cloud.setPreset(_toPreset);
        _cloud.setDensity(1.0);   // restore full density
      }
      _fromPreset = _toPreset;
      _atmo.lastTransitionMs = Date.now();
    } else if (_cloud) {
      // Drive density curve for fade-out → fade-in feel
      _cloud.setDensity(_blendDensityMult(_blendT));
    }
  }

  // ── Update atmospheric scalars ────────────────────────────────────────────────

  function _updateActiveAtmosphere(dtMs) {
    var dtSec = dtMs / 1000;

    // Palette blend
    var palette = _blendPalette(_blendT);
    _atmo.cloudDensity = palette.cloudDensity;
    _atmo.hazeDensity  = palette.hazeDensity;
    _atmo.fogDensity   = palette.fogDensity;
    _atmo.skylineVis   = palette.skylineVis;
    _atmo.warmth       = palette.warmth;

    // Pressure accumulation — only when trip is active
    var rt = global.SBE && SBE.RegionalFlightTripRuntime;
    var tripActive = rt && rt.getState && rt.getState().active;
    if (_autoPressure && tripActive && !_inBloom && !_inRecovery) {
      _atmo.pressureScalar = Math.min(1.0, _atmo.pressureScalar + PRESSURE_RATE * dtSec);
    }

    // Bloom decay
    if (_inBloom) {
      _bloomElapsedSec += dtSec;
      var bt  = BLOOM_TYPES[_bloomType];
      var decaySec = bt ? bt.decaySec : 10;
      var bloomT   = Math.min(1, _bloomElapsedSec / decaySec);
      var fadeOut  = 1 - _ease(bloomT);

      _atmo.electricalActivity = (bt ? bt.electricSpike : 0.5) * fadeOut;
      _atmo.thermalDistortion  = (bt ? bt.thermalSpike  : 0.3) * fadeOut;
      _atmo.resonanceScalar    = _bloomType === 'resonance' ? fadeOut * 0.9 : fadeOut * 0.3;

      if (bloomT >= 1.0) {
        _inBloom = false;
        _bloomElapsedSec = 0;
        _triggerRecovery();
      }
    }

    // Recovery decay
    if (_inRecovery) {
      _recoveryElapsedSec += dtSec;
      var recovT = Math.min(1, _recoveryElapsedSec / RECOVERY_DURATION_SEC);
      // Silence rises then fades back
      _atmo.silenceScalar  = recovT < 0.4
        ? _ease(recovT / 0.4) * 0.75
        : (1 - _ease((recovT - 0.4) / 0.6)) * 0.75;
      _atmo.recoveryScalar = recovT;

      // Gentle fog lift during silence
      _atmo.fogDensity = Math.max(_atmo.fogDensity,
        _atmo.silenceScalar * 0.12 + palette.fogDensity);

      if (recovT >= 1.0) {
        _inRecovery         = false;
        _recoveryElapsedSec = 0;
        _atmo.silenceScalar = 0;
        _atmo.recoveryScalar= 0;
        _atmo.pressureScalar= 0.08;   // small residual — not fully empty
      }
    }

    // Electrical activity fades on its own even outside bloom
    if (!_inBloom) {
      _atmo.electricalActivity = Math.max(0, _atmo.electricalActivity - dtSec * 0.25);
      _atmo.thermalDistortion  = Math.max(0, _atmo.thermalDistortion  - dtSec * 0.18);
    }

    // Resonance decays unless manually sustained
    _atmo.resonanceScalar = Math.max(0, _atmo.resonanceScalar - dtSec * 0.12);
  }

  // ── Canvas overlay rendering ──────────────────────────────────────────────────
  // Layer order: haze → fog lift → bloom flash → thermal shimmer edge

  function _renderOverlay() {
    if (!_ctx || !_canvas || !_enabled) return;
    var cW = _canvas.width;
    var cH = _canvas.height;
    _ctx.clearRect(0, 0, cW, cH);

    var a = _atmo;

    // ── 1. Full-screen atmospheric haze ──────────────────────────────────────
    if (a.hazeDensity > 0.01) {
      var warmth  = a.warmth;
      // Cool atmosphere: rgba(180,205,240,...), warm: rgba(255,215,160,...)
      var r = Math.round(_lerp(180, 255, Math.max(0, warmth)));
      var g = Math.round(_lerp(205, 215, Math.max(0, warmth)));
      var b = Math.round(_lerp(240, 160, Math.max(0, warmth)));
      // Cold tint if warmth < 0
      if (warmth < 0) {
        r = Math.round(_lerp(180, 200, Math.min(1, -warmth)));
        g = Math.round(_lerp(205, 220, Math.min(1, -warmth)));
        b = Math.round(_lerp(240, 255, Math.min(1, -warmth)));
      }
      var hazeAlpha = a.hazeDensity * 0.18 * (1 - a.silenceScalar * 0.3);

      _ctx.save();
      _ctx.globalAlpha = hazeAlpha;
      _ctx.fillStyle   = 'rgb(' + r + ',' + g + ',' + b + ')';
      _ctx.fillRect(0, 0, cW, cH);
      _ctx.restore();
    }

    // ── 2. Fog lift (bottom gradient) ─────────────────────────────────────────
    if (a.fogDensity > 0.01) {
      var fogAlpha  = a.fogDensity * 0.32;
      var fogR = Math.round(_lerp(200, 240, Math.max(0, a.warmth)));
      var fogG = Math.round(_lerp(215, 225, Math.max(0, a.warmth)));
      var fogB = Math.round(_lerp(230, 190, Math.max(0, a.warmth)));

      var fogGrad = _ctx.createLinearGradient(0, cH * 0.55, 0, cH);
      fogGrad.addColorStop(0, 'rgba(' + fogR + ',' + fogG + ',' + fogB + ',0)');
      fogGrad.addColorStop(1, 'rgba(' + fogR + ',' + fogG + ',' + fogB + ',' +
                              fogAlpha.toFixed(3) + ')');
      _ctx.save();
      _ctx.fillStyle   = fogGrad;
      _ctx.fillRect(0, 0, cW, cH);
      _ctx.restore();
    }

    // ── 3. Electrical bloom flash ─────────────────────────────────────────────
    if (a.electricalActivity > 0.04) {
      // Cool blue-white radial that pulses outward from center-top
      var eAlpha = a.electricalActivity * 0.22;
      var eGrad  = _ctx.createRadialGradient(
        cW * 0.5, cH * 0.08,  0,
        cW * 0.5, cH * 0.08,  cW * 0.65
      );
      eGrad.addColorStop(0,   'rgba(200,220,255,' + (eAlpha * 0.9).toFixed(3) + ')');
      eGrad.addColorStop(0.4, 'rgba(180,210,255,' + (eAlpha * 0.4).toFixed(3) + ')');
      eGrad.addColorStop(1,   'rgba(160,200,255,0)');

      _ctx.save();
      _ctx.fillStyle   = eGrad;
      _ctx.fillRect(0, 0, cW, cH);
      _ctx.restore();
    }

    // ── 4. Thermal distortion edge (subtle vignette shimmer) ─────────────────
    if (a.thermalDistortion > 0.06) {
      // Distortion is approximated as a very faint warm vignette bloom
      // from the bottom 30% — heat rises effect
      var tAlpha = a.thermalDistortion * 0.12;
      var tGrad  = _ctx.createLinearGradient(0, cH * 0.7, 0, cH);
      tGrad.addColorStop(0, 'rgba(255,200,140,0)');
      tGrad.addColorStop(1, 'rgba(255,200,140,' + tAlpha.toFixed(3) + ')');

      _ctx.save();
      _ctx.fillStyle   = tGrad;
      _ctx.fillRect(0, 0, cW, cH);
      _ctx.restore();
    }

    // ── 5. Pressure indicator (subtle vignette at screen edge when high) ─────
    if (a.pressureScalar > 0.6) {
      var pStrength = (a.pressureScalar - 0.6) / 0.4;   // 0→1 above threshold
      var pAlpha    = pStrength * 0.06;
      var pGrad     = _ctx.createRadialGradient(
        cW * 0.5, cH * 0.5, cW * 0.35,
        cW * 0.5, cH * 0.5, cW * 0.72
      );
      pGrad.addColorStop(0, 'rgba(160,190,220,0)');
      pGrad.addColorStop(1, 'rgba(160,190,220,' + pAlpha.toFixed(3) + ')');

      _ctx.save();
      _ctx.fillStyle   = pGrad;
      _ctx.fillRect(0, 0, cW, cH);
      _ctx.restore();
    }
  }

  // ── rAF loop ──────────────────────────────────────────────────────────────────

  function _frame(ts) {
    _rafId = global.requestAnimationFrame(_frame);

    if (!_ensureCanvas()) return;
    _resizeCanvas();

    var dt          = _lastFrameMs > 0 ? Math.min(ts - _lastFrameMs, 100) : 16.667;
    _lastFrameMs    = ts;

    _updateBlend(dt);
    _updateActiveAtmosphere(dt);
    _renderOverlay();
  }

  // ── Preset intercept ──────────────────────────────────────────────────────────
  // Wraps SBE.CloudAtmosphereLayer by re-assigning SBE.CloudAtmosphereLayer to a
  // proxy that routes setPreset() through _queuePreset().  All other methods
  // pass through to the original frozen object.

  function _intercept() {
    var real = global.SBE && SBE.CloudAtmosphereLayer;
    if (!real) {
      console.warn('[AtmosphericContinuityRuntime] CloudAtmosphereLayer not found — intercept skipped');
      return;
    }
    _cloud       = real;
    _fromPreset  = real.getPreset() || 'clear';
    _toPreset    = _fromPreset;
    _blendT      = 1.0;
    _blending    = false;

    // Build proxy — all keys forwarded except setPreset
    var proxy = {};
    var keys  = Object.keys(real);
    for (var i = 0; i < keys.length; i++) {
      (function (k) {
        proxy[k] = typeof real[k] === 'function'
          ? function () { return real[k].apply(real, arguments); }
          : real[k];
      })(keys[i]);
    }
    // Intercept setPreset
    proxy.setPreset = _queuePreset;

    SBE.CloudAtmosphereLayer = proxy;
    console.log('[AtmosphericContinuityRuntime] CloudAtmosphereLayer.setPreset() intercepted');
  }

  // ── Queue preset change ───────────────────────────────────────────────────────

  function _queuePreset(id) {
    if (!_cloud || !_cloud.setPreset) { return; }
    if (!PRESET_PALETTE[id]) {
      console.warn('[AtmosphericContinuityRuntime] unknown preset:', id);
      _cloud.setPreset(id);    // passthrough unknown presets
      return;
    }
    if (id === _toPreset) return;   // no change needed

    _fromPreset = _cloud.getPreset() || _fromPreset;
    _toPreset   = id;
    _blendT     = 0;
    _blending   = true;
    console.log('[AtmosphericContinuityRuntime] blending', _fromPreset, '→', _toPreset,
      '(' + Math.round(BLEND_DURATION_MS / 1000) + 's)');
  }

  // ── Bloom / recovery ──────────────────────────────────────────────────────────

  function _triggerRecovery() {
    _inRecovery         = true;
    _recoveryElapsedSec = 0;
    console.log('[AtmosphericContinuityRuntime] recovery begins — silence for',
      RECOVERY_DURATION_SEC + 's');
  }

  function triggerBloom(type) {
    type = type || 'pressure';
    if (!BLOOM_TYPES[type]) {
      console.warn('[AtmosphericContinuityRuntime] unknown bloom type:', type,
        '— use: electrical | thermal | pressure | resonance');
      return;
    }
    if (_inBloom) {
      console.log('[AtmosphericContinuityRuntime] bloom already active (' + _bloomType + ')');
      return;
    }
    _inBloom         = true;
    _bloomType       = type;
    _bloomElapsedSec = 0;

    var bt = BLOOM_TYPES[type];
    _atmo.pressureScalar = Math.max(0, _atmo.pressureScalar - bt.pressureDrop);

    console.log('[AtmosphericContinuityRuntime]', bt.label, '— electrical:',
      bt.electricSpike.toFixed(2), 'thermal:', bt.thermalSpike.toFixed(2),
      'decay:', bt.decaySec + 's');
  }

  function triggerRecovery() {
    _triggerRecovery();
    _atmo.pressureScalar = 0;
    _atmo.electricalActivity = 0;
    _atmo.thermalDistortion  = 0;
  }

  // ── Public setters ────────────────────────────────────────────────────────────

  function setPressure(v) {
    _atmo.pressureScalar = Math.max(0, Math.min(1, Number(v) || 0));
    console.log('[AtmosphericContinuityRuntime] pressure →', _atmo.pressureScalar.toFixed(3));
  }

  function setSilence(v) {
    _atmo.silenceScalar = Math.max(0, Math.min(1, Number(v) || 0));
    console.log('[AtmosphericContinuityRuntime] silence →', _atmo.silenceScalar.toFixed(3));
  }

  function setResonance(v) {
    _atmo.resonanceScalar = Math.max(0, Math.min(1, Number(v) || 0));
    console.log('[AtmosphericContinuityRuntime] resonance →', _atmo.resonanceScalar.toFixed(3));
  }

  function setEnabled(val) {
    _enabled = !!val;
    if (!_enabled && _ctx && _canvas) {
      _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
    }
  }

  function getEnabled() { return _enabled; }

  // ── Start / stop ──────────────────────────────────────────────────────────────

  function start() {
    if (_rafId) return;
    _lastFrameMs = 0;
    _rafId       = global.requestAnimationFrame(_frame);
    console.log('[AtmosphericContinuityRuntime] v' + VERSION + ' started');
  }

  function stop() {
    if (_rafId) { global.cancelAnimationFrame(_rafId); _rafId = null; }
    if (_ctx && _canvas) _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
    console.log('[AtmosphericContinuityRuntime] stopped');
  }

  // ── State snapshot ────────────────────────────────────────────────────────────

  function getState() {
    return {
      version:         VERSION,
      enabled:         _enabled,
      blending:        _blending,
      fromPreset:      _fromPreset,
      toPreset:        _toPreset,
      blendT:          Math.round(_blendT * 1000) / 1000,
      blendPct:        Math.round(_blendT * 100),
      inBloom:         _inBloom,
      bloomType:       _bloomType,
      inRecovery:      _inRecovery,
      atmosphere: {
        cloudDensity:      Math.round(_atmo.cloudDensity      * 100) / 100,
        hazeDensity:       Math.round(_atmo.hazeDensity       * 100) / 100,
        fogDensity:        Math.round(_atmo.fogDensity        * 100) / 100,
        skylineVis:        Math.round(_atmo.skylineVis        * 100) / 100,
        warmth:            Math.round(_atmo.warmth            * 100) / 100,
        thermalDistortion: Math.round(_atmo.thermalDistortion * 100) / 100,
        electricalActivity:Math.round(_atmo.electricalActivity* 100) / 100,
        resonanceScalar:   Math.round(_atmo.resonanceScalar   * 100) / 100,
        silenceScalar:     Math.round(_atmo.silenceScalar     * 100) / 100,
        pressureScalar:    Math.round(_atmo.pressureScalar    * 100) / 100,
        recoveryScalar:    Math.round(_atmo.recoveryScalar    * 100) / 100,
      },
    };
  }

  // ── Exports ───────────────────────────────────────────────────────────────────

  SBE.AtmosphericContinuityRuntime = Object.freeze({
    VERSION:        VERSION,
    start:          start,
    stop:           stop,
    setEnabled:     setEnabled,
    getEnabled:     getEnabled,
    setPressure:    setPressure,
    setSilence:     setSilence,
    triggerBloom:   triggerBloom,
    triggerRecovery: triggerRecovery,
    setResonance:   setResonance,
    getState:       getState,
    queuePreset:    _queuePreset,   // direct access for external callers
    BLOOM_TYPES:    BLOOM_TYPES,
    PRESET_PALETTE: PRESET_PALETTE,
  });

  // ── Auto-start after DOM + intercept cloud layer ──────────────────────────────

  function _scheduleStart() {
    _intercept();
    start();
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    global.setTimeout(_scheduleStart, 0);
  } else {
    document.addEventListener('DOMContentLoaded', _scheduleStart);
  }

  console.log('[AtmosphericContinuityRuntime] v' + VERSION + ' loaded');

})(window);
