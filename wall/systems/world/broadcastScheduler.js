(function (global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  // ── BroadcastScheduler (0520C_WOS_BroadcastScheduler_v1.1.0) ─────────────
  //
  // Broadcast intent orchestration infrastructure.
  //
  // SurfaceRegistry owns identity.
  // TransitionRuntime owns continuity.
  // BroadcastScheduler owns intent.
  //
  // Determines: what the world should emotionally emphasize next.
  // Does NOT: activate Surfaces directly, mutate atmosphere, crossfade audio,
  //           interpolate transitions, manipulate overlays, own camera authority.
  //
  // External world events become HEURISTIC SCORING INPUTS — never direct mutations.
  // BroadcastScheduler retains absolute orchestration authority.
  //
  // Emits (broadcast: namespace):
  //   broadcast:blockStarted          { blockId, type, durationMs, continuityBias }
  //   broadcast:blockEnded            { blockId, type, reason }
  //   broadcast:scheduleAdvanced      { nextBlockId, fatigueScore, pacingDensity }
  //   broadcast:transitionRequested   { fromSurfaceId, toSurfaceId, budgetMs, curve, reason }
  //   broadcast:specialEventTriggered { eventId, blockId }
  //   broadcast:fatigueUpdated        { score, threshold, state }

  // ── Constants ─────────────────────────────────────────────────────────────
  var TICK_MS             = 500;       // scheduling evaluation cadence
  var FATIGUE_DECAY_RATE  = 0.018;     // per-minute passive decay
  var FATIGUE_HEALTHY     = 0.30;
  var FATIGUE_CRITICAL    = 0.75;
  var MAX_RECENT_SURFACES = 6;         // recency window for repetition suppression
  var MAX_RECENT_OVERLAYS = 8;
  var CANDIDATE_RARITY_CHANCE = 0.08; // probability of boosting a rare block per evaluation

  // ── Continuity bias semantics ─────────────────────────────────────────────
  // 1.0 = absolute lock, 0.75 = strong, 0.5 = balanced, 0.25 = aggressive, 0.0 = immediate
  var CONTINUITY_DEFAULTS = { atmosphere: 0.7, soundtrack: 0.5, overlay: 0.3 };

  // ── Block registry ────────────────────────────────────────────────────────
  var _blocks = {};   // id → block descriptor

  // ── Heuristic inputs — updated by incoming world events (never mutations) ──
  var _heuristics = {
    currentMood:     "neutral",
    isNight:         false,
    driftLabel:      "Morning",
    soundtrackEnergy: 0.4,
    ambientIntensity: 0.5,
    districtId:      null,
    fatigueModifier: 1.0,   // external fatigue pressure (subway escalation etc.)
  };

  // ── Core state ────────────────────────────────────────────────────────────
  var _state = {
    active:       false,
    executionStack: [],   // [{ blockId, type, startedAt, durationMs, remainingMs, pausedAt }]
    startedAt:    0,
    elapsedMs:    0,
    fatigueScore: 0,
    pacingDensity: 0,
    queue:        [],     // pending block IDs
    recentSurfaces: [],
    recentDistricts: [],
    recentOverlays:  [],
    candidateScores: {},
    schedulerTime: { hour: 0, minute: 0 },
  };

  var _lastTick  = 0;
  var _lastFatigueBroadcast = 0;
  var FATIGUE_BROADCAST_MS  = 5000;

  // ── Helpers ───────────────────────────────────────────────────────────────
  function _lerp(a, b, t) { return a + (b - a) * t; }
  function _clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function _rand() { return Math.random(); }
  function _bus() { return SBE.WorkspaceEventBus; }
  function _emit(event, payload) { var b = _bus(); b && b.emit(event, payload); }

  // ── Broadcast time ────────────────────────────────────────────────────────
  // Syncs from WorldDriftManager when available; governs scheduling heuristics.
  function _syncBroadcastTime() {
    var drift = SBE.WorldDriftManager && SBE.WorldDriftManager.getState();
    if (drift) {
      var h = drift.hour;
      _state.schedulerTime.hour   = Math.floor(h);
      _state.schedulerTime.minute = Math.floor((h % 1) * 60);
    }
  }

  // ── Execution stack helpers ───────────────────────────────────────────────
  function _stackTop() {
    return _state.executionStack.length > 0
      ? _state.executionStack[_state.executionStack.length - 1]
      : null;
  }

  function _pushStack(entry) { _state.executionStack.push(entry); }

  function _popStack() {
    var popped = _state.executionStack.pop();
    // Resume paused entry beneath if it was suspended
    var below = _stackTop();
    if (below && below.pausedAt !== null) {
      below.pausedAt = null;   // resume
    }
    return popped;
  }

  // ── Fatigue model ─────────────────────────────────────────────────────────
  // Fatigue = (ActiveTime × DensityMultiplier) - (CooldownTime × DecayRate)
  // Normalized 0–1. Healthy ≤ 0.3. Critical ≥ 0.75.
  function _updateFatigue(dtMs) {
    var dtMin  = dtMs / 60000;
    var top    = _stackTop();
    var block  = top && _blocks[top.blockId];
    var rate   = block ? (block.fatigueContributionRate || 0.1) : 0;

    // Accumulate from active block
    _state.fatigueScore += rate * dtMin * _heuristics.fatigueModifier;

    // Passive decay always applies
    _state.fatigueScore -= FATIGUE_DECAY_RATE * dtMin;

    _state.fatigueScore = _clamp(_state.fatigueScore, 0, 1);

    // Broadcast fatigue state periodically
    var now = performance.now();
    if (now - _lastFatigueBroadcast > FATIGUE_BROADCAST_MS) {
      _lastFatigueBroadcast = now;
      var fatigueState = _state.fatigueScore >= FATIGUE_CRITICAL ? "critical"
                       : _state.fatigueScore >= FATIGUE_HEALTHY  ? "elevated"
                       : "healthy";
      _emit("broadcast:fatigueUpdated", {
        score:     _state.fatigueScore,
        threshold: { healthy: FATIGUE_HEALTHY, critical: FATIGUE_CRITICAL },
        state:     fatigueState,
      });
    }
  }

  // ── Pacing density ────────────────────────────────────────────────────────
  // Reflects how dense the recent broadcast programming has been.
  function _updatePacingDensity() {
    var top   = _stackTop();
    var block = top && _blocks[top.blockId];
    var rate  = block ? (block.fatigueContributionRate || 0.1) : 0;
    // Smooth toward block's rate — pacing density is a lagged indicator
    _state.pacingDensity = _lerp(_state.pacingDensity, rate, 0.02);
  }

  // ── Candidate scoring ─────────────────────────────────────────────────────
  // BroadcastScheduler scores all eligible blocks using heuristic inputs.
  // External events modulate these inputs — they NEVER mutate scores directly.
  function _scoreCandidate(block) {
    var score = 0;
    var h     = _state.schedulerTime.hour;
    var mood  = _heuristics.currentMood;

    // ── Time compatibility ──────────────────────────────────────────────
    var c = block.constraints || {};
    if (c.minHour !== undefined && c.maxHour !== undefined) {
      var inTimeWindow = h >= c.minHour && h <= c.maxHour;
      score += inTimeWindow ? 0.25 : -0.20;
    }

    // ── Weather compatibility ───────────────────────────────────────────
    if (c.weather && c.weather.length) {
      var weatherMatch = c.weather.some(function (w) { return mood.includes(w); });
      score += weatherMatch ? 0.30 : -0.05;
    }

    // ── Fatigue relief ──────────────────────────────────────────────────
    // Prefer low-fatigue blocks when fatigue is elevated
    if (_state.fatigueScore > FATIGUE_HEALTHY) {
      var relief = 1 - (block.fatigueContributionRate || 0.1);
      score += relief * _state.fatigueScore * 0.30;
    }

    // ── Rarity bias — occasional probabilistic boost ────────────────────
    var rarity = block.rarity || 0;
    if (_rand() < CANDIDATE_RARITY_CHANCE) {
      score += rarity * 0.45;
    }

    // ── Recency penalty — suppress repetition ──────────────────────────
    var surfaceId = block.surfaceId;
    if (surfaceId && _state.recentSurfaces.indexOf(surfaceId) !== -1) {
      score -= 0.30;
    }
    if (_state.recentSurfaces.indexOf(block.id) !== -1) {
      score -= 0.15;
    }

    // ── Night bias ──────────────────────────────────────────────────────
    if (_heuristics.isNight && c.minHour !== undefined && c.minHour >= 20) {
      score += 0.12;
    }

    // ── Soundtrack continuity ───────────────────────────────────────────
    // Low soundtrack energy favors slow, silence-weighted blocks
    var energy = _heuristics.soundtrackEnergy;
    var cb     = block.continuityBias || CONTINUITY_DEFAULTS;
    if (energy < 0.3 && (cb.soundtrack || 0) > 0.5) {
      score += 0.10;
    }

    // ── Ambient intensity alignment ─────────────────────────────────────
    // High ambient (night) boosts blocks that declare strong atmosphere continuity
    if (_heuristics.ambientIntensity > 0.7 && (cb.atmosphere || 0) >= 0.8) {
      score += 0.15;
    }

    // ── Block enabled guard ─────────────────────────────────────────────
    if (block.enabled === false) score = -999;

    return score;
  }

  function _evaluateCandidates() {
    var scores = {};
    Object.keys(_blocks).forEach(function (id) {
      scores[id] = _scoreCandidate(_blocks[id]);
    });
    _state.candidateScores = scores;
    return scores;
  }

  function _pickBestCandidate() {
    var scores  = _evaluateCandidates();
    var bestId  = null;
    var bestScore = -Infinity;
    Object.keys(scores).forEach(function (id) {
      if (scores[id] > bestScore) { bestScore = scores[id]; bestId = id; }
    });
    return bestId;
  }

  // ── Request transition through SurfaceRegistry ────────────────────────────
  function _requestTransition(toSurfaceId, opts) {
    opts = opts || {};
    var sr   = SBE.SurfaceRegistry;
    if (!sr) return;

    var fromSurfaceId = sr.getState().activeSurfaceId;

    _emit("broadcast:transitionRequested", {
      fromSurfaceId: fromSurfaceId,
      toSurfaceId:   toSurfaceId,
      budgetMs:      opts.budgetMs || 1200,
      curve:         opts.curve    || "cinematic",
      reason:        opts.reason   || "scheduler",
    });

    // Delegate to SurfaceRegistry — it calls transition() → TransitionRuntime
    sr.activate(toSurfaceId, { budgetMs: opts.budgetMs, channelId: opts.channelId });
  }

  // ── Start a block ─────────────────────────────────────────────────────────
  function _startBlock(blockId, interruptType) {
    var block = _blocks[blockId];
    if (!block) return false;

    var type = interruptType || block.type || "base_programming";
    var now  = performance.now();

    // If interrupt: suspend current top
    if (type === "interrupt") {
      var top = _stackTop();
      if (top) {
        var elapsed = now - (top.pausedAt !== null ? top.pausedAt : top.startedAt);
        top.remainingMs = Math.max(0, top.remainingMs - elapsed);
        top.pausedAt    = now;
      }
    }

    var entry = {
      blockId:    blockId,
      type:       type,
      startedAt:  now,
      durationMs: block.durationMs || 60000,
      remainingMs: block.durationMs || 60000,
      pausedAt:   null,
    };

    _pushStack(entry);

    // Track surface recency
    if (block.surfaceId) {
      _state.recentSurfaces.unshift(block.surfaceId);
      if (_state.recentSurfaces.length > MAX_RECENT_SURFACES) {
        _state.recentSurfaces.pop();
      }
    }

    _emit("broadcast:blockStarted", {
      blockId:       blockId,
      type:          type,
      durationMs:    entry.durationMs,
      continuityBias: block.continuityBias || CONTINUITY_DEFAULTS,
      surfaceId:     block.surfaceId,
    });

    // Request transition to surface if block specifies one
    if (block.surfaceId && SBE.SurfaceRegistry) {
      var tp = block.transitionPolicy || {};
      _requestTransition(block.surfaceId, {
        budgetMs:  tp.budgetMs  || 1200,
        curve:     tp.curve     || "cinematic",
        channelId: block.channelId,
        reason:    "block-start:" + blockId,
      });
    }

    _emit("broadcast:scheduleAdvanced", {
      nextBlockId:   blockId,
      fatigueScore:  _state.fatigueScore,
      pacingDensity: _state.pacingDensity,
    });

    console.log("[BroadcastScheduler] block started:", blockId, "type:", type,
      "duration:", Math.round(entry.durationMs / 1000) + "s");

    return true;
  }

  // ── Advance block — check expiry, dequeue next ────────────────────────────
  function _advance(now) {
    var top = _stackTop();
    if (!top) {
      // Nothing active — pick from queue or evaluate candidates
      var nextId = _state.queue.length > 0
        ? _state.queue.shift()
        : _pickBestCandidate();
      if (nextId) _startBlock(nextId);
      return;
    }

    // Update remaining time (skip if paused)
    if (top.pausedAt === null) {
      var elapsed = now - top.startedAt;
      top.remainingMs = Math.max(0, top.durationMs - elapsed);
    }

    if (top.remainingMs <= 0) {
      // Block expired — pop and signal end
      var expired = _popStack();
      _emit("broadcast:blockEnded", {
        blockId: expired.blockId,
        type:    expired.type,
        reason:  "expired",
      });
      console.log("[BroadcastScheduler] block ended:", expired.blockId);

      // Resume or pick next
      var resume = _stackTop();
      if (!resume) {
        var next = _state.queue.length > 0
          ? _state.queue.shift()
          : _pickBestCandidate();
        if (next) _startBlock(next);
      }
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  function registerBlock(descriptor) {
    if (!descriptor || !descriptor.id) {
      console.warn("[BroadcastScheduler] registerBlock: descriptor must have an id");
      return;
    }
    _blocks[descriptor.id] = Object.assign({
      enabled:               true,
      type:                  "base_programming",
      durationMs:            120000,
      fatigueContributionRate: 0.1,
      rarity:                0.3,
      transitionPolicy:      { curve: "cinematic", budgetMs: 1200 },
      continuityBias:        Object.assign({}, CONTINUITY_DEFAULTS),
      constraints:           {},
    }, descriptor);
    console.log("[BroadcastScheduler] block registered:", descriptor.id);
  }

  function unregisterBlock(id) {
    delete _blocks[id];
  }

  function queueBlock(blockId, opts) {
    if (!_blocks[blockId]) {
      console.warn("[BroadcastScheduler] queueBlock: block not registered:", blockId);
      return;
    }
    opts = opts || {};
    if (opts.interrupt) {
      _startBlock(blockId, "interrupt");
    } else {
      _state.queue.push(blockId);
    }
  }

  function start() {
    if (_state.active) return;
    _state.active     = true;
    _state.startedAt  = performance.now();
    _state.elapsedMs  = 0;
    _state.fatigueScore = 0;
    console.log("[BroadcastScheduler] started");

    // Evaluate and start first block if queue is empty
    if (_state.queue.length === 0) {
      var first = _pickBestCandidate();
      if (first) _startBlock(first);
    } else {
      _startBlock(_state.queue.shift());
    }
  }

  function stop() {
    _state.active = false;
    var top = _stackTop();
    if (top) {
      _emit("broadcast:blockEnded", { blockId: top.blockId, type: top.type, reason: "stopped" });
    }
    _state.executionStack = [];
    console.log("[BroadcastScheduler] stopped");
  }

  function getState() { return _state; }
  function getBlocks() { return Object.assign({}, _blocks); }

  // ── RAF tick ──────────────────────────────────────────────────────────────
  function _tick(ts) {
    global.requestAnimationFrame(_tick);
    if (ts - _lastTick < TICK_MS) return;
    var dtMs = ts - _lastTick;
    _lastTick = ts;

    if (!_state.active) return;

    _state.elapsedMs += dtMs;
    _syncBroadcastTime();
    _updateFatigue(dtMs);
    _updatePacingDensity();
    _advance(ts);
  }

  // ── External event handlers — become heuristic inputs, never direct mutations
  function _onAtmosphere(evt) {
    if (!evt || !evt.state) return;
    _heuristics.currentMood      = evt.state.mood      || "neutral";
    _heuristics.isNight          = !!evt.state.isNight;
    _heuristics.ambientIntensity = evt.state.ambientIntensity || 0.5;
  }

  function _onDriftChanged(evt) {
    if (!evt || !evt.state) return;
    _heuristics.driftLabel       = evt.state.driftLabel      || "Morning";
    _heuristics.soundtrackEnergy = evt.state.soundtrackEnergy || 0.4;
    _heuristics.ambientIntensity = evt.state.ambientIntensity || 0.5;
  }

  function _onTransitionResolved(evt) {
    // Resolved transitions confirm world state — no direct mutation needed,
    // just note for future cooldown management.
    if (evt && evt.toId) {
      _state.recentSurfaces.unshift(evt.toId);
      if (_state.recentSurfaces.length > MAX_RECENT_SURFACES) _state.recentSurfaces.pop();
    }
  }

  // ── init ──────────────────────────────────────────────────────────────────
  function init() {
    var bus = _bus();
    if (bus) {
      bus.on("world:atmosphereChanged",     _onAtmosphere);
      bus.on("world:driftChanged",          _onDriftChanged);
      bus.on("broadcast:transitionResolved", _onTransitionResolved);
    }

    // Seed heuristics from current world state
    var atm   = SBE.WorldAtmosphere   && SBE.WorldAtmosphere.getState();
    var drift = SBE.WorldDriftManager && SBE.WorldDriftManager.getState();
    if (atm)   _onAtmosphere({ state: atm });
    if (drift) _onDriftChanged({ state: drift });

    global.requestAnimationFrame(_tick);

    console.log("[BroadcastScheduler] initialized — heuristics seeded",
      "mood:", _heuristics.currentMood,
      "driftLabel:", _heuristics.driftLabel);
  }

  SBE.BroadcastScheduler = {
    init:             init,
    registerBlock:    registerBlock,
    unregisterBlock:  unregisterBlock,
    start:            start,
    stop:             stop,
    queueBlock:       queueBlock,
    getState:         getState,
    getBlocks:        getBlocks,
  };

})(window);
