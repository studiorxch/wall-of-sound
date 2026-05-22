(function (global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  // ── TransitionRuntime (0520D_WOS_MinimalTransitionRuntime_v1.1.0) ─────────
  //
  // Canonical continuity progression infrastructure.
  //
  // SurfaceRegistry owns identity.
  // TransitionRuntime owns continuity.
  // BroadcastScheduler owns intent.
  //
  // The world never stops. Only the interpretation changes.
  //
  // CONTINUITY CLOCK DOCTRINE:
  //   TransitionRuntime publishes canonical continuity progression.
  //   Downstream systems interpolate independently and consume via pull.
  //   This system NEVER renders, composites, mixes audio, or moves cameras.
  //
  // WEIGHT FORMULA:
  //   weight = clamp(easedProgress / continuityBias, 0, 1)
  //   bias=1.0 → full-duration convergence
  //   bias=0.5 → reaches 1.0 at progress=0.5
  //   bias=0.0 → immediate snap
  //
  // DUAL ACCESS:
  //   Push: broadcast:transitionProgress (throttled ≤15hz) — diagnostics/scheduler
  //   Pull: getState() — always synchronous for render/audio/overlay systems
  //
  // INTERRUPTION:
  //   Only ONE active transition at a time.
  //   Interruption captures interruptedBridgeState from current weights.
  //   Next transition inherits that bridge state, not the original baseline.
  //
  // Emits (broadcast: namespace):
  //   broadcast:transitionStarted    { transitionId, fromId, toId, durationMs, curve }
  //   broadcast:transitionProgress   { progress, easedProgress, weights }  [≤15hz]
  //   broadcast:transitionResolved   { transitionId, fromId, toId, interrupted:false }
  //   broadcast:transitionInterrupted { transitionId }

  // ── Easing curves ─────────────────────────────────────────────────────────
  var _curves = {
    linear:     function (t) { return t; },
    smooth:     function (t) { return t * t * (3 - 2 * t); },
    // easeOutCubic — slow start, fast middle, eases into resolution
    cinematic:  function (t) { return 1 - Math.pow(1 - t, 3); },
  };

  function _applyCurve(t, curve) {
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    var fn = _curves[curve] || _curves.cinematic;
    return fn(t);
  }

  // ── Weight formula ────────────────────────────────────────────────────────
  // weight = clamp(easedProgress / bias, 0, 1)
  // bias=0 → immediate snap (weight=1 always)
  function _weight(eased, bias) {
    if (bias <= 0) return 1;
    var w = eased / bias;
    return w < 0 ? 0 : w > 1 ? 1 : w;
  }

  // ── Defaults ──────────────────────────────────────────────────────────────
  var DEFAULT_BIAS = { atmosphere: 0.7, soundtrack: 0.5, overlay: 0.3 };
  var _idCounter   = 0;
  function _newId() { return "tr-" + (++_idCounter); }

  // ── Progress event throttle — ≤15hz ──────────────────────────────────────
  var PROGRESS_THROTTLE_MS = 67;   // ~15hz
  var _lastProgressEmit    = 0;

  // ── Core state ────────────────────────────────────────────────────────────
  var _state = {
    active:        false,
    transitionId:  null,
    fromSurfaceId: null,
    toSurfaceId:   null,
    startedAt:     0,
    durationMs:    0,
    progress:      0,       // raw linear 0–1
    easedProgress: 0,       // curve-applied
    fromState:     null,    // reserved for future source capture
    toState:       null,    // reserved for future target snapshot
    interruptedBridgeState: null,   // weights captured at interruption point
    curve:         "cinematic",
    continuityBias: Object.assign({}, DEFAULT_BIAS),
    weights: { atmosphere: 0, soundtrack: 0, overlay: 0 },
    interrupted:   false,
  };

  // ── Pending bias cache ────────────────────────────────────────────────────
  // Updated from broadcast:blockStarted; consumed by next transition().
  var _pendingBias    = null;
  // Re-entry guard: TransitionRuntime emits broadcast:transitionStarted itself;
  // _onSRTransitionStarted must not respond to its own emissions.
  var _inTransition   = false;

  function _bus() { return SBE.WorkspaceEventBus; }
  function _emit(event, payload) { var b = _bus(); b && b.emit(event, payload); }

  // ── updateWeights ─────────────────────────────────────────────────────────
  function _updateWeights(eased) {
    var bias          = _state.continuityBias;
    var bridge        = _state.interruptedBridgeState;

    // If an interrupted bridge state exists, blend FROM it rather than from 0.
    // This prevents visual popping when a transition is interrupted mid-flight.
    var atmBase  = bridge ? bridge.atmosphere : 0;
    var sndBase  = bridge ? bridge.soundtrack : 0;
    var ovlBase  = bridge ? bridge.overlay    : 0;

    // Apply weight formula, lerping from bridge baseline to 1.0
    var atmW = _weight(eased, bias.atmosphere || 0.7);
    var sndW = _weight(eased, bias.soundtrack || 0.5);
    var ovlW = _weight(eased, bias.overlay    || 0.3);

    // Bridge blend: new weight starts from where the interrupted transition left off
    _state.weights.atmosphere = atmBase + (1 - atmBase) * atmW;
    _state.weights.soundtrack = sndBase + (1 - sndBase) * sndW;
    _state.weights.overlay    = ovlBase + (1 - ovlBase) * ovlW;
  }

  // ── resolveTransition ─────────────────────────────────────────────────────
  function _resolveTransition() {
    _state.weights.atmosphere     = 1;
    _state.weights.soundtrack     = 1;
    _state.weights.overlay        = 1;
    _state.progress               = 1;
    _state.easedProgress          = 1;
    _state.active                 = false;
    _state.interruptedBridgeState = null;

    var id   = _state.transitionId;
    var from = _state.fromSurfaceId;
    var to   = _state.toSurfaceId;

    _emit("broadcast:transitionResolved", {
      transitionId: id,
      fromId:       from,
      toId:         to,
      interrupted:  false,
    });

    console.log("[TransitionRuntime] transition resolved:", from, "→", to);
  }

  // ── RAF tick ──────────────────────────────────────────────────────────────
  function _tick(ts) {
    global.requestAnimationFrame(_tick);
    if (!_state.active) return;

    var elapsed = ts - _state.startedAt;
    var rawT    = elapsed / _state.durationMs;
    rawT        = rawT < 0 ? 0 : rawT > 1 ? 1 : rawT;
    var eased   = _applyCurve(rawT, _state.curve);

    _state.progress      = rawT;
    _state.easedProgress = eased;

    _updateWeights(eased);

    // Throttled push — diagnostics/scheduler only
    if (ts - _lastProgressEmit >= PROGRESS_THROTTLE_MS) {
      _lastProgressEmit = ts;
      _emit("broadcast:transitionProgress", {
        progress:      rawT,
        easedProgress: eased,
        weights:       Object.assign({}, _state.weights),
      });
    }

    if (rawT >= 1) {
      _resolveTransition();
    }
  }

  // ── transition — begin or interrupt ───────────────────────────────────────
  // CANONICAL TIMING RULE: startedAt is bound HERE, not in tick().
  function transition(opts) {
    opts = opts || {};
    var fromId     = opts.fromId     || null;
    var toId       = opts.toId       || null;
    var durationMs = opts.durationMs || opts.budgetMs || 800;
    var curve      = opts.curve      || "cinematic";
    var bias       = opts.continuityBias || _pendingBias || DEFAULT_BIAS;

    // ── Interruption handling ─────────────────────────────────────────────
    if (_state.active) {
      // Capture current blend state as bridge before resetting
      _state.interruptedBridgeState = {
        atmosphere: _state.weights.atmosphere,
        soundtrack: _state.weights.soundtrack,
        overlay:    _state.weights.overlay,
      };
      _state.interrupted = true;

      _emit("broadcast:transitionInterrupted", { transitionId: _state.transitionId });
      console.log("[TransitionRuntime] transition interrupted:", _state.fromSurfaceId, "→", _state.toSurfaceId);
    } else {
      _state.interruptedBridgeState = null;
      _state.interrupted = false;
    }

    var id = _newId();

    _state.active         = true;
    _state.transitionId   = id;
    _state.fromSurfaceId  = fromId;
    _state.toSurfaceId    = toId;
    _state.startedAt      = performance.now();   // bound NOW — never in tick()
    _state.durationMs     = durationMs;
    _state.progress       = 0;
    _state.easedProgress  = 0;
    _state.curve          = curve;
    _state.continuityBias = Object.assign({}, DEFAULT_BIAS, bias);

    // Reset weights to bridge state baseline (or zero if clean start)
    var br = _state.interruptedBridgeState;
    _state.weights.atmosphere = br ? br.atmosphere : 0;
    _state.weights.soundtrack = br ? br.soundtrack : 0;
    _state.weights.overlay    = br ? br.overlay    : 0;

    _pendingBias = null;   // consumed

    _inTransition = true;
    _emit("broadcast:transitionStarted", {
      transitionId: id,
      fromId:       fromId,
      toId:         toId,
      durationMs:   durationMs,
      curve:        curve,
    });
    _inTransition = false;

    console.log("[TransitionRuntime] transition started:", fromId, "→", toId,
      durationMs + "ms", curve);
  }

  // ── interrupt — force-complete current transition ─────────────────────────
  function interrupt() {
    if (!_state.active) return;
    _emit("broadcast:transitionInterrupted", { transitionId: _state.transitionId });
    _state.active         = false;
    _state.interrupted    = true;
    console.log("[TransitionRuntime] transition interrupted (forced):", _state.fromSurfaceId);
  }

  // ── cancelTransition — alias for interrupt ────────────────────────────────
  function cancelTransition() { interrupt(); }

  // ── SurfaceRegistry integration ───────────────────────────────────────────
  // Receives broadcast:transitionStarted from SurfaceRegistry.
  // Uses pending bias from most-recent broadcast:blockStarted.
  function _onSRTransitionStarted(evt) {
    if (_inTransition) return;   // ignore our own broadcast:transitionStarted emissions
    if (!evt) return;
    transition({
      fromId:        evt.fromId,
      toId:          evt.toId,
      durationMs:    evt.budgetMs,
      curve:         evt.curve || "cinematic",
      continuityBias: _pendingBias || DEFAULT_BIAS,
    });
  }

  // Cache continuityBias from scheduler block starts for next transition
  function _onBlockStarted(evt) {
    if (evt && evt.continuityBias) {
      _pendingBias = Object.assign({}, DEFAULT_BIAS, evt.continuityBias);
    }
  }

  function getState() { return _state; }

  // ── init ──────────────────────────────────────────────────────────────────
  function init() {
    var bus = _bus();
    if (bus) {
      bus.on("broadcast:transitionStarted", _onSRTransitionStarted);
      bus.on("broadcast:blockStarted",      _onBlockStarted);
    }

    global.requestAnimationFrame(_tick);

    console.log("[TransitionRuntime] initialized v1.1.0 — dual-access, interruption-safe");
  }

  SBE.TransitionRuntime = {
    init:            init,
    transition:      transition,
    interrupt:       interrupt,
    cancelTransition: cancelTransition,
    getState:        getState,
  };

})(window);
