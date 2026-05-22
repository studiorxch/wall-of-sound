(function (global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  // ── SurfaceRegistry (0520A_WOS_SurfaceRegistry_v1.0.0) ───────────────────
  //
  // Runtime identity orchestration infrastructure for WOS Surfaces.
  //
  // Surfaces are broadcast personas.
  // Channels are runtime behavioral profiles.
  // Geography remains canonical.
  // Continuity outranks hard switching.
  //
  // This system does NOT:
  //   render visuals, control cameras, simulate atmosphere, mutate world state.
  //
  // Emits (broadcast: namespace — distinct from surface: SSM events):
  //   broadcast:surfaceRegistered    { surfaceId }
  //   broadcast:activationStarted    { surfaceId, prevSurfaceId, continuity }
  //   broadcast:activated            { surfaceId, channelId }
  //   broadcast:deactivated          { surfaceId }
  //   broadcast:transitionStarted    { fromId, toId, budgetMs }
  //   broadcast:transitionProgress   { fromId, toId, progress }
  //   broadcast:transitionComplete   { toId }
  //   broadcast:channelChanged       { surfaceId, channelId }
  //
  // Hook registration:
  //   SurfaceRegistry.onBeforeActivate(fn)
  //   SurfaceRegistry.onAfterActivate(fn)
  //   SurfaceRegistry.onTransitionStart(fn)
  //   SurfaceRegistry.onTransitionEnd(fn)

  // ── Tick cadence ──────────────────────────────────────────────────────────
  var TICK_MS = 250;
  var _lastTick = 0;

  // ── Core state ────────────────────────────────────────────────────────────
  var _state = {
    registered: {}, // id → surface descriptor

    activeSurfaceId: null,
    activeChannelId: null,

    pendingTransition: null, // { fromId, toId, budgetMs, opts }

    transitionState: {
      active: false,
      startedAt: 0,
      progress: 0, // 0–1
    },

    continuity: {
      inheritedAtmosphere: null, // snapshot from departing surface
      inheritedDrift: null, // WorldDriftManager state at handoff
    },
  };

  // ── Lifecycle hooks ───────────────────────────────────────────────────────
  var _hooks = {
    beforeActivate: [],
    afterActivate: [],
    transitionStart: [],
    transitionEnd: [],
  };

  function _callHooks(name, payload) {
    (_hooks[name] || []).forEach(function (fn) {
      try {
        fn(payload);
      } catch (e) {
        console.warn("[SurfaceRegistry] hook error in", name, e);
      }
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function _bus() {
    return SBE.WorkspaceEventBus;
  }

  function _emit(event, payload) {
    var bus = _bus();
    bus && bus.emit(event, payload);
  }

  // ── Continuity snapshot ───────────────────────────────────────────────────
  // Capture current world state at the moment of surface departure so it can
  // be inherited by the arriving surface during transition.
  function _captureContinuity() {
    var atm = SBE.WorldAtmosphere && SBE.WorldAtmosphere.getState();
    var drift = SBE.WorldDriftManager && SBE.WorldDriftManager.getState();

    _state.continuity.inheritedAtmosphere = atm
      ? { mood: atm.mood, isNight: atm.isNight, lightTemp: atm.lightTemp }
      : null;

    _state.continuity.inheritedDrift = drift
      ? {
          hour: drift.hour,
          ambientIntensity: drift.ambientIntensity,
          driftLabel: drift.driftLabel,
          soundtrackEnergy: drift.soundtrackEnergy,
        }
      : null;
  }

  // ── register ──────────────────────────────────────────────────────────────
  function register(descriptor) {
    if (!descriptor || !descriptor.id) {
      console.warn("[SurfaceRegistry] register: descriptor must have an id");
      return;
    }

    var id = descriptor.id;

    // Merge with any existing registration (allows incremental extension)
    _state.registered[id] = Object.assign(
      {},
      _state.registered[id] || {},
      descriptor,
    );

    _emit("broadcast:surfaceRegistered", { surfaceId: id });

    console.log(
      "[SurfaceRegistry] registered:",
      id,
      "— tone:",
      (descriptor.identity && descriptor.identity.broadcastTone) || "—",
    );

    return _state.registered[id];
  }

  // ── unregister ────────────────────────────────────────────────────────────
  function unregister(id) {
    if (!_state.registered[id]) return;

    if (_state.activeSurfaceId === id) {
      deactivate(id);
    }

    delete _state.registered[id];
    console.log("[SurfaceRegistry] unregistered:", id);
  }

  // ── activate ──────────────────────────────────────────────────────────────
  // Begins continuity negotiation — NOT a hard switch.
  // Calls beforeActivate hooks → starts transition → resolves.
  // The actual camera/atmosphere transition is delegated to hook receivers
  // (TransitionRuntime, AtmosphereRuntime — future systems).
  function activate(surfaceId, opts) {
    opts = opts || {};

    var descriptor = _state.registered[surfaceId];
    if (!descriptor) {
      console.warn(
        "[SurfaceRegistry] activate: surface not registered:",
        surfaceId,
      );
      return;
    }

    var prevId = _state.activeSurfaceId;

    // Capture world continuity state before any surface changes
    _captureContinuity();

    // ── beforeActivate hooks ────────────────────────────────────────────
    _callHooks("beforeActivate", {
      surfaceId: surfaceId,
      prevSurfaceId: prevId,
      descriptor: descriptor,
      continuity: _state.continuity,
    });

    _emit("broadcast:activationStarted", {
      surfaceId: surfaceId,
      prevSurfaceId: prevId,
      continuity: _state.continuity,
    });

    // ── Transition budget ───────────────────────────────────────────────
    var budgetMs =
      opts.budgetMs ||
      (descriptor.continuity &&
        descriptor.continuity.transitionLatencyBudgetMs) ||
      0;

    if (budgetMs > 0 && prevId && prevId !== surfaceId) {
      transition(prevId, surfaceId, { budgetMs: budgetMs, opts: opts });
    } else {
      // Immediate activation — no transition budget
      _completeActivation(surfaceId, opts);
    }
  }

  // ── _completeActivation — finalize surface as active ─────────────────────
  function _completeActivation(surfaceId, opts) {
    _state.activeSurfaceId = surfaceId;

    // Resolve initial channel from runtimeProfile or opts
    var descriptor = _state.registered[surfaceId];
    var channelId = (opts && opts.channelId) || null;
    _state.activeChannelId = channelId;

    // ── afterActivate hooks ─────────────────────────────────────────────
    _callHooks("afterActivate", {
      surfaceId: surfaceId,
      channelId: channelId,
      descriptor: descriptor,
      continuity: _state.continuity,
    });

    _emit("broadcast:activated", {
      surfaceId: surfaceId,
      channelId: channelId,
      runtimeProfile: descriptor && descriptor.runtimeProfile,
    });

    // ── ViewportAuthority note ──────────────────────────────────────────
    // SurfaceRegistry notes the requested cameraAuthority but does NOT
    // claim it directly. The appropriate camera system reads this event
    // and decides whether to claim authority.
    var camAuth =
      descriptor &&
      descriptor.runtimeProfile &&
      descriptor.runtimeProfile.cameraAuthority;
    if (camAuth) {
      _emit("broadcast:cameraAuthorityRequested", {
        surfaceId: surfaceId,
        cameraAuthority: camAuth,
      });
    }

    console.log(
      "[SurfaceRegistry] activated:",
      surfaceId,
      "channel:",
      channelId || "—",
      "camAuth:",
      camAuth || "—",
    );
  }

  // ── deactivate ────────────────────────────────────────────────────────────
  function deactivate(surfaceId) {
    if (_state.activeSurfaceId !== surfaceId) return;
    _state.activeSurfaceId = null;
    _state.activeChannelId = null;
    _emit("broadcast:deactivated", { surfaceId: surfaceId });
    console.log("[SurfaceRegistry] deactivated:", surfaceId);
  }

  // ── transition ────────────────────────────────────────────────────────────
  // Records pending transition state and fires transitionStart hooks.
  // Full transition logic lives in TransitionRuntime (future spec).
  function transition(fromId, toId, params) {
    params = params || {};
    var budgetMs = params.budgetMs || 800;

    _state.pendingTransition = {
      fromId: fromId,
      toId: toId,
      budgetMs: budgetMs,
      opts: params.opts,
    };

    _state.transitionState.active = true;
    _state.transitionState.startedAt = performance.now();
    _state.transitionState.progress = 0;

    _callHooks("transitionStart", {
      fromId: fromId,
      toId: toId,
      budgetMs: budgetMs,
    });

    _emit("broadcast:transitionStarted", {
      fromId: fromId,
      toId: toId,
      budgetMs: budgetMs,
    });

    console.log(
      "[SurfaceRegistry] transition:",
      fromId,
      "→",
      toId,
      "budget:",
      budgetMs + "ms",
    );
  }

  // ── setChannel ────────────────────────────────────────────────────────────
  function setChannel(channelId) {
    if (!_state.activeSurfaceId) return;
    _state.activeChannelId = channelId;
    _emit("broadcast:channelChanged", {
      surfaceId: _state.activeSurfaceId,
      channelId: channelId,
    });
  }

  // ── Getters ───────────────────────────────────────────────────────────────
  function getCurrent() {
    return _state.activeSurfaceId
      ? _state.registered[_state.activeSurfaceId] || null
      : null;
  }

  function getSurface(id) {
    return _state.registered[id] || null;
  }

  function getAll() {
    return Object.assign({}, _state.registered);
  }

  function getState() {
    return _state;
  }

  // ── tick ─────────────────────────────────────────────────────────────────
  // Advances transition progress; fires transitionComplete when done.
  function tick(ts) {
    global.requestAnimationFrame(function (t) {
      tick(t);
    });
    if (ts - _lastTick < TICK_MS) return;
    _lastTick = ts;

    if (!_state.transitionState.active) return;

    var pt = _state.pendingTransition;
    if (!pt) {
      _state.transitionState.active = false;
      return;
    }

    var elapsed = ts - _state.transitionState.startedAt;
    var progress = Math.min(elapsed / pt.budgetMs, 1);

    _state.transitionState.progress = progress;

    _emit("broadcast:transitionProgress", {
      fromId: pt.fromId,
      toId: pt.toId,
      progress: progress,
    });

    if (progress >= 1) {
      // Transition complete — finalize activation
      _state.transitionState.active = false;
      _state.pendingTransition = null;
      _state.transitionState.progress = 1;

      _callHooks("transitionEnd", { toId: pt.toId });
      _emit("broadcast:transitionComplete", { toId: pt.toId });

      _completeActivation(pt.toId, pt.opts || {});
    }
  }

  // ── Hook registration (public) ────────────────────────────────────────────
  function onBeforeActivate(fn) {
    _hooks.beforeActivate.push(fn);
  }
  function onAfterActivate(fn) {
    _hooks.afterActivate.push(fn);
  }
  function onTransitionStart(fn) {
    _hooks.transitionStart.push(fn);
  }
  function onTransitionEnd(fn) {
    _hooks.transitionEnd.push(fn);
  }

  // ── init ──────────────────────────────────────────────────────────────────
  function init() {
    global.requestAnimationFrame(function (ts) {
      tick(ts);
    });
    console.log("[SurfaceRegistry] initialized");
  }

  SBE.SurfaceRegistry = {
    init: init,
    tick: tick,

    register: register,
    unregister: unregister,

    activate: activate,
    deactivate: deactivate,
    transition: transition,

    getCurrent: getCurrent,
    getSurface: getSurface,
    getAll: getAll,
    getState: getState,

    setChannel: setChannel,

    onBeforeActivate: onBeforeActivate,
    onAfterActivate: onAfterActivate,
    onTransitionStart: onTransitionStart,
    onTransitionEnd: onTransitionEnd,
  };
})(window);
