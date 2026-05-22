(function (global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  // ── WorldDriftManager (0520B_WOS_AmbientWorldDrift_v1.0.0) ───────────────
  //
  // Long-duration environmental drift system. Creates passage of time,
  // atmospheric continuity, and autonomous world evolution.
  //
  // This system is noticed after 20 minutes, not after 2 seconds.
  //
  // Drift state:
  //   hour            — 0–24, wraps continuously
  //   ambientIntensity — 0–1 (night glow, reflectance, fog presence)
  //   soundtrackEnergy — 0.18–0.72 (activity density)
  //   pulseMultiplier  — 0.82–1.18 (SurfacePresence breathing speed)
  //   colorTemperature — 0–1 (0=cold blue, 0.5=neutral, 1=warm amber)
  //
  // Emits: world:driftChanged { state }
  // Exposes CSS vars on :root — do not aggressively consume yet.

  // ── Drift speed ───────────────────────────────────────────────────────────
  // 0.0035 hour/sec → 1 full day in ~80 min (real-time drift, not wall clock)
  var DRIFT_SPEED = 0.0035;
  var TICK_MS     = 250; // ~4fps — drift is slow, no need for 60fps

  // ── Piecewise smoothstep curve ────────────────────────────────────────────
  // keyframes: [[hour, value], ...] sorted by hour
  // Returns smoothstep-eased interpolation between surrounding keyframes.
  function _curve(kf, hour) {
    var n = kf.length;
    // Wrap hour into 0-24
    hour = ((hour % 24) + 24) % 24;
    if (hour <= kf[0][0]) return kf[0][1];
    if (hour >= kf[n - 1][0]) return kf[n - 1][1];
    for (var i = 0; i < n - 1; i++) {
      var h0 = kf[i][0],    h1 = kf[i + 1][0];
      var v0 = kf[i][1],    v1 = kf[i + 1][1];
      if (hour >= h0 && hour <= h1) {
        var t = (hour - h0) / (h1 - h0);
        t = t * t * (3 - 2 * t); // smoothstep
        return v0 + t * (v1 - v0);
      }
    }
    return kf[n - 1][1];
  }

  function _lerp(a, b, t) { return a + (b - a) * t; }

  // ── Keyframe curves ───────────────────────────────────────────────────────
  // ambientIntensity: night=1.0, day=0.22
  var KF_AMBIENT = [
    [0,    1.00], [3,    1.00], [5.5,  0.80],
    [7,    0.40], [9,    0.25], [12,   0.22],
    [15,   0.24], [17,   0.42], [18.5, 0.62],
    [20,   0.80], [21,   0.90], [22,   0.97], [24, 1.00],
  ];

  // soundtrackEnergy: 3am trough=0.18, evening peak=0.68
  var KF_ENERGY = [
    [0,    0.22], [3,    0.18], [6,    0.28],
    [8,    0.44], [10,   0.52], [13,   0.55],
    [17,   0.62], [19,   0.68], [21,   0.55],
    [22,   0.38], [24,   0.22],
  ];

  // colorTemperature: cold night=0.12, warm golden hour=0.82, neutral day=0.48
  var KF_COLORTEMP = [
    [0,    0.15], [3,    0.12], [5.5,  0.18],
    [7,    0.38], [10,   0.48], [14,   0.48],
    [17,   0.65], [18.5, 0.82], [20,   0.45],
    [22,   0.22], [24,   0.15],
  ];

  // ── Drift label language ──────────────────────────────────────────────────
  // Temporal environmental descriptors — hour-based, not raw numbers.
  // These supplement the atmospheric weather label; they describe time of day.
  var DRIFT_LABELS = [
    [0,    "Deep Night"],
    [3.5,  "Still Dawn"],
    [6.0,  "Cold Morning"],
    [8.5,  "Morning"],
    [11.0, "Midday"],
    [14.5, "Afternoon"],
    [16.5, "Late Day"],
    [18.0, "Golden Hour"],
    [19.5, "Evening"],
    [21.0, "Night"],
    [24.0, "Deep Night"],
  ];

  function _driftLabel(hour) {
    hour = ((hour % 24) + 24) % 24;
    var label = DRIFT_LABELS[0][1];
    for (var i = 0; i < DRIFT_LABELS.length - 1; i++) {
      if (hour >= DRIFT_LABELS[i][0] && hour < DRIFT_LABELS[i + 1][0]) {
        label = DRIFT_LABELS[i][1];
        break;
      }
    }
    return label;
  }

  // ── Drift state ───────────────────────────────────────────────────────────
  var _state = {
    hour:              18.0,  // start at golden hour
    ambientIntensity:  0.42,
    soundtrackEnergy:  0.35,
    pulseMultiplier:   1.0,
    colorTemperature:  0.58,
    driftLabel:        "Golden Hour",
    lastUpdate:        performance.now(),
  };

  // Lerp targets — values drift toward these, never jump
  var _target = Object.assign({}, _state);

  var _lastTick   = 0;
  var _lastCssUpd = 0;
  var CSS_UPD_MS  = 2000; // update CSS vars every 2s max

  // ── Recompute targets from current hour ───────────────────────────────────
  function _resolveTargets() {
    _target.ambientIntensity = _curve(KF_AMBIENT,   _state.hour);
    _target.soundtrackEnergy = _curve(KF_ENERGY,    _state.hour);
    _target.colorTemperature = _curve(KF_COLORTEMP, _state.hour);
    _target.pulseMultiplier  = _lerp(0.82, 1.18, _target.ambientIntensity);
    _target.driftLabel       = _driftLabel(_state.hour);
  }

  // ── CSS variables — set on :root for future consumers ─────────────────────
  function _updateCSSVars() {
    var r = global.document && global.document.documentElement;
    if (!r) return;
    r.style.setProperty("--ws-drift-ambient",     _state.ambientIntensity.toFixed(3));
    r.style.setProperty("--ws-drift-energy",      _state.soundtrackEnergy.toFixed(3));
    r.style.setProperty("--ws-drift-pulse",       _state.pulseMultiplier.toFixed(3));
    r.style.setProperty("--ws-drift-temperature", _state.colorTemperature.toFixed(3));
  }

  // ── RAF tick ──────────────────────────────────────────────────────────────
  function _tick(ts) {
    global.requestAnimationFrame(_tick);
    if (ts - _lastTick < TICK_MS) return;

    var delta   = (ts - _lastTick) / 1000; // seconds since last tick
    _lastTick   = ts;

    // Advance autonomous clock
    _state.hour = ((_state.hour + delta * DRIFT_SPEED) % 24 + 24) % 24;

    // Resolve what the targets should be at this hour
    _resolveTargets();

    // Lerp current state toward targets — LERP=0.015 → very slow, ~60s to cross half the range
    var LERP = 0.015;
    var changed = false;

    function _lerpField(key) {
      var prev = _state[key];
      _state[key] = _lerp(prev, _target[key], LERP);
      if (Math.abs(_state[key] - prev) > 0.002) changed = true;
    }

    _lerpField("ambientIntensity");
    _lerpField("soundtrackEnergy");
    _lerpField("pulseMultiplier");
    _lerpField("colorTemperature");

    // Drift label is discrete — update when the underlying hour crosses a threshold
    var newLabel = _driftLabel(_state.hour);
    if (newLabel !== _state.driftLabel) {
      _state.driftLabel = newLabel;
      changed = true;
    }

    _state.lastUpdate = ts;

    if (changed) {
      var bus = SBE.WorkspaceEventBus;
      bus && bus.emit("world:driftChanged", { state: _state });
    }

    // CSS vars — throttled, cheap
    if (ts - _lastCssUpd > CSS_UPD_MS && changed) {
      _updateCSSVars();
      _lastCssUpd = ts;
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  function getState() { return _state; }

  function setHour(h) {
    _state.hour = ((h % 24) + 24) % 24;
    _resolveTargets();
    // Snap current state to targets to avoid lerp drag after manual set
    _state.ambientIntensity = _target.ambientIntensity;
    _state.soundtrackEnergy = _target.soundtrackEnergy;
    _state.pulseMultiplier  = _target.pulseMultiplier;
    _state.colorTemperature = _target.colorTemperature;
    _state.driftLabel       = _target.driftLabel;
    _updateCSSVars();
    var bus = SBE.WorkspaceEventBus;
    bus && bus.emit("world:driftChanged", { state: _state });
  }

  function setSpeed(s) { DRIFT_SPEED = s; }

  function init() {
    // Seed hour from WorldClock if available, otherwise leave at default
    var clk = SBE.WorldClock && SBE.WorldClock.getState();
    if (clk && clk.localTime) {
      var t = clk.localTime; // "6:43 AM" format
      var parts = t.split(" ");
      var hm  = (parts[0] || "").split(":");
      var h   = parseInt(hm[0], 10) || 0;
      var m   = parseInt(hm[1], 10) || 0;
      var pm  = (parts[1] || "").toLowerCase() === "pm";
      if (pm && h !== 12) h += 12;
      if (!pm && h === 12) h = 0;
      _state.hour = h + m / 60;
    }

    _resolveTargets();
    // Snap to targets on init — no cold-start lerp drag
    _state.ambientIntensity = _target.ambientIntensity;
    _state.soundtrackEnergy = _target.soundtrackEnergy;
    _state.pulseMultiplier  = _target.pulseMultiplier;
    _state.colorTemperature = _target.colorTemperature;
    _state.driftLabel       = _target.driftLabel;
    _updateCSSVars();

    global.requestAnimationFrame(_tick);

    console.log("[WorldDriftManager] initialized — hour:", _state.hour.toFixed(2),
      "label:", _state.driftLabel,
      "ambient:", _state.ambientIntensity.toFixed(3),
      "temp:", _state.colorTemperature.toFixed(3));
  }

  SBE.WorldDriftManager = {
    init:     init,
    getState: getState,
    setHour:  setHour,
    setSpeed: setSpeed,
  };

})(window);
