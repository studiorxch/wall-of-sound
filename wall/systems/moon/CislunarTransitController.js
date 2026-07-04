(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});

  // ── CislunarTransitController — Earth-orbit → Moon staged transit ─────────────
  //
  // Purpose: stage the feeling of crossing Earth–Moon distance.
  // Does not render 3D geometry directly — drives progress state
  // consumed by MoonModeController and the HUD.
  //
  // Transit phases:
  //   departure    Earth atmosphere recedes, Moon becomes visible
  //   midpoint     sparse; Earth behind, Moon ahead
  //   approach     Moon fills view, Earth shrinks behind
  //   arrival      enters Lunar Orbit or Surface

  var PHASES = Object.freeze({
    DEPARTURE:  'departure',   // 0 → 0.20
    MIDPOINT:   'midpoint',    // 0.20 → 0.75
    APPROACH:   'approach',    // 0.75 → 0.95
    ARRIVAL:    'arrival'      // 0.95 → 1.0
  });

  var PHASE_RANGES = [
    { phase: PHASES.DEPARTURE, from: 0,    to: 0.20 },
    { phase: PHASES.MIDPOINT,  from: 0.20, to: 0.75 },
    { phase: PHASES.APPROACH,  from: 0.75, to: 0.95 },
    { phase: PHASES.ARRIVAL,   from: 0.95, to: 1.00 }
  ];

  function CislunarTransitController(opts) {
    opts           = opts || {};
    this._progress = 0;          // [0..1] — 0 = at Earth, 1 = at Moon
    this._active   = false;
    this._onUpdate = opts.onUpdate || null;   // callback({ progress, phase, distanceKm, camera })
    this._onArrive = opts.onArrive || null;   // callback() — triggers Lunar Orbit/Surface entry
    this._speed    = opts.speed || 0.001;     // progress units per ms (auto-transit speed)
    this._autoPlay = false;
    this._rafId    = null;
    this._lastTs   = 0;
    this._authenticity = opts.authenticity || 'authentic';
  }

  CislunarTransitController.prototype.start = function (fromProgress) {
    this._progress = fromProgress || 0;
    this._active   = true;
    this._autoPlay = false;
  };

  CislunarTransitController.prototype.autoPlay = function (opts) {
    opts           = opts || {};
    this._speed    = opts.speed || 0.0005;   // slow cinematic by default
    this._autoPlay = true;
    this._active   = true;
    var self = this;
    this._lastTs = performance.now();
    function tick(ts) {
      if (!self._autoPlay || !self._active) return;
      var delta = Math.min(ts - self._lastTs, 100);
      self._lastTs = ts;
      self.advance(delta);
      self._rafId = global.requestAnimationFrame(tick);
    }
    this._rafId = global.requestAnimationFrame(tick);
  };

  CislunarTransitController.prototype.advance = function (deltaMs) {
    if (!this._active) return;
    this._progress = Math.min(1, this._progress + this._speed * deltaMs);
    this._emit();
    if (this._progress >= 1) {
      this._active   = false;
      this._autoPlay = false;
      if (this._rafId) { global.cancelAnimationFrame(this._rafId); this._rafId = null; }
      if (this._onArrive) try { this._onArrive(); } catch (e) {}
    }
  };

  CislunarTransitController.prototype.setProgress = function (p) {
    this._progress = Math.max(0, Math.min(1, p));
    this._emit();
  };

  CislunarTransitController.prototype.getState = function () {
    var sm = SBE.MoonScaleModel;
    var phase = PHASES.MIDPOINT;
    for (var i = 0; i < PHASE_RANGES.length; i++) {
      var r = PHASE_RANGES[i];
      if (this._progress >= r.from && this._progress <= r.to) { phase = r.phase; break; }
    }
    var camera = sm ? sm.transitCameraPosition(this._progress, this._authenticity) : null;
    var distKm = sm ? sm.transitDistanceKm(this._progress) : null;
    return {
      progress:    this._progress,
      phase:       phase,
      distanceKm:  distKm,
      remainingKm: distKm !== null ? (sm.REAL.EARTH_MOON_DISTANCE_KM - distKm) : null,
      camera:      camera,
      active:      this._active
    };
  };

  CislunarTransitController.prototype.stop = function () {
    this._active   = false;
    this._autoPlay = false;
    if (this._rafId) { global.cancelAnimationFrame(this._rafId); this._rafId = null; }
  };

  CislunarTransitController.prototype.dispose = function () { this.stop(); };

  CislunarTransitController.prototype._emit = function () {
    if (this._onUpdate) try { this._onUpdate(this.getState()); } catch (e) {}
  };

  SBE.CislunarTransitController = CislunarTransitController;
  SBE.CislunarTransitPhases = PHASES;

})(window);
