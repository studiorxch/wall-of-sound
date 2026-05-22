(function (global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  // ── ScenicPersistence (0521_WOS_ScenicPersistence_v1.0.0) ────────────────
  //
  // Attention Geography decided what matters.
  // Scenic Persistence decides how difficult it is to emotionally leave.
  //
  // The camera should feel like a distracted passenger:
  //   observational hesitation
  //   reluctance to depart
  //   occasional subconscious return
  //
  // Called from PassengerMode's active tick.
  // Produces: persistenceScore, scenicDrag, releaseVelocity, residue, returnGlance.
  //
  // persistenceScore = fieldWeight * proximity * silenceAffinity
  //                  * atmosphericIntensity * familiarityModifier
  //                  * motionSuppression * driftModifier * holdAffinity

  function _lerp(a, b, t) { return a + (b - a) * t; }
  function _clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function _rand() { return Math.random(); }

  // ── Runtime state ─────────────────────────────────────────────────────────
  var _state = {
    activeFieldId: null,

    persistence: {
      score:           0,
      accumulated:     0,
      releaseVelocity: 0.05,  // lerp coefficient for bearing/zoom release; lower = slower
      scenicDrag:      0,     // 0–1 resistance applied to tBearing
    },

    returnGlance: {
      eligible:      false,
      probability:   0,
      cooldownUntil: 0,
      lastFieldId:   null,
      lastBearingApprox: null,
    },

    memory: {
      residue:      0,          // 0–1 afterimage from recent significant field
      residueDecay: 0.0008,     // per-tick decay (~20 min to fully clear)
      recentFields: [],         // [{ fieldId, score, ts }] — last 5 encounters
    },
  };

  // ── Drift modifier table ──────────────────────────────────────────────────
  var DRIFT_PERSISTENCE = {
    "Deep Night":  1.40,
    "Still Dawn":  1.25,
    "Night":       1.20,
    "Evening":     1.10,
    "Golden Hour": 1.05,
    "Afternoon":   0.85,
    "Late Day":    0.90,
    "Morning":     0.75,
    "Cold Morning": 0.70,
    "Midday":      0.65,
  };

  // ── Persistence score computation ─────────────────────────────────────────
  function _computeScore(frame, topField, proximity) {
    var ag    = SBE.AttentionGeography;
    var atm   = SBE.WorldAtmosphere   && SBE.WorldAtmosphere.getState();
    var drift = SBE.WorldDriftManager && SBE.WorldDriftManager.getState();

    // Field weight (normalized from AttentionGeography computed weight)
    var fieldW = _clamp((ag.getState().weights[topField.id] || topField.weight) / 2.5, 0, 1);

    // Silence affinity from field atmospheric bias
    var ab      = topField.atmosphericBias || {};
    var silA    = ab.silenceAffinity || 1.0;

    // Atmospheric intensity — rain / fog / night all deepen persistence
    var mood    = (atm && atm.mood) || "neutral";
    var atmI    = 1.0;
    if (mood.includes("rain") || mood.includes("storm")) atmI += 0.45;
    if (mood.includes("fog"))                             atmI += 0.40;
    if (atm && atm.isNight)                              atmI += 0.30;
    atmI = _clamp(atmI, 0.8, 2.0);

    // Familiarity — repeated visits deepen attachment
    var agMem  = (ag.getState().memory[topField.id]) || {};
    var visits  = agMem.visits || 0;
    var famMod  = 1.0 + _clamp(visits * 0.06, 0, 0.45);

    // Motion suppression — faster traversal reduces persistence
    var speed   = (frame.velocity && frame.velocity.speed) || 0;
    var motionS = _clamp(1 - speed * 9000, 0.25, 1.0);

    // Drift label modifier
    var label   = (drift && drift.driftLabel) || "Morning";
    var driftM  = DRIFT_PERSISTENCE[label] || 0.85;

    // PersistenceBias from field (optional extension)
    var pb      = topField.persistenceBias || {};
    var holdAff = pb.holdAffinity || 1.0;

    return _clamp(
      (fieldW * proximity * silA * atmI * famMod * motionS * driftM * holdAff) / 2.2,
      0, 1
    );
  }

  // ── Field departure — record memory, arm return glance ────────────────────
  function _onDeparture(fieldId, score, frame) {
    var pb  = (_state._lastField && _state._lastField.persistenceBias) || {};
    var rsS = pb.residueStrength  || 1.0;
    var rgA = pb.returnGlanceAffinity || 1.0;

    // Residue: emotional afterimage — biases pacing for next 30–90s
    _state.memory.residue = _clamp(score * rsS, 0, 0.85);

    // Record encounter
    _state.memory.recentFields.push({ fieldId: fieldId, score: score, ts: performance.now() });
    if (_state.memory.recentFields.length > 5) _state.memory.recentFields.shift();

    // Return glance eligibility — only for high-persistence departures
    if (score > 0.35) {
      var atm  = SBE.WorldAtmosphere && SBE.WorldAtmosphere.getState();
      var mood = (atm && atm.mood) || "neutral";

      // Rain / Still Dawn heighten return probability
      var base = score * 0.3 * rgA;
      if (mood.includes("rain"))          base += 0.12;
      if ((SBE.WorldDriftManager && SBE.WorldDriftManager.getState().driftLabel) === "Still Dawn") base += 0.10;

      _state.returnGlance.eligible      = true;
      _state.returnGlance.probability   = _clamp(base, 0, 0.55);
      _state.returnGlance.lastFieldId   = fieldId;

      // Store approximate bearing toward departed field for the glance
      if (frame && frame.lng !== 0) {
        var ag = SBE.AttentionGeography;
        _state.returnGlance.lastBearingApprox = ag && ag.getBearingTo(fieldId, frame.lng, frame.lat);
      }
    }
  }

  // ── Return glance evaluation ──────────────────────────────────────────────
  // Returns { bearing, strength } if a glance should fire, else null.
  function evaluateReturnGlance(frame) {
    var now = performance.now();
    if (!_state.returnGlance.eligible)              return null;
    if (now < _state.returnGlance.cooldownUntil)    return null;
    if (_rand() > _state.returnGlance.probability * 0.008) return null; // per-tick chance

    var bearing = _state.returnGlance.lastBearingApprox;
    if (bearing === null || bearing === undefined)  return null;

    // Fire glance — suppress for next 25–60s
    _state.returnGlance.cooldownUntil = now + 25000 + _rand() * 35000;

    // High probability glances have slightly stronger pull, but always subtle
    var strength = 0.06 + _rand() * 0.10;   // 6–16% bearing lean

    return { bearing: bearing, strength: strength };
  }

  // ── Main tick ─────────────────────────────────────────────────────────────
  // Called by PassengerMode every PASSENGER_TICK_MS.
  // Returns influence object consumed by PassengerMode.
  function tick(frame, passengerState, topField) {
    var ag = SBE.AttentionGeography;

    // ── Decay residue continuously ──────────────────────────────────────
    _state.memory.residue = _clamp(
      _state.memory.residue - _state.memory.residueDecay,
      0, 1
    );

    // ── No field active ─────────────────────────────────────────────────
    if (!topField || !ag || frame.lng === 0) {
      _state.persistence.score           = _lerp(_state.persistence.score, 0, 0.02);
      _state.persistence.releaseVelocity = _lerp(_state.persistence.releaseVelocity, 0.05, 0.04);
      _state.persistence.scenicDrag      = _lerp(_state.persistence.scenicDrag, 0, 0.04);
      _state.activeFieldId = null;
      return _buildInfluence();
    }

    // ── Proximity ────────────────────────────────────────────────────────
    var dist      = ag.getDistanceTo(topField.id, frame.lng, frame.lat);
    var proximity = _clamp(1 - dist / (topField.radius * 6), 0, 1);

    // ── Field departure detection ─────────────────────────────────────────
    var entering  = proximity > 0.05;
    var prevId    = _state.activeFieldId;

    if (prevId && prevId !== topField.id && entering) {
      // Switched fields — record departure from previous
      _onDeparture(prevId, _state.persistence.score, frame);
    } else if (prevId && !entering) {
      // Drifted out of current field
      _onDeparture(prevId, _state.persistence.score, frame);
      _state.activeFieldId = null;
    }

    if (entering) {
      _state._lastField  = topField;
      _state.activeFieldId = topField.id;
    }

    // ── Compute persistence score ─────────────────────────────────────────
    var targetScore = entering
      ? _computeScore(frame, topField, proximity)
      : 0;

    // Score lerps slowly toward target — emotional weight doesn't spike/drop instantly
    _state.persistence.score = _lerp(_state.persistence.score, targetScore, 0.06);
    _state.persistence.accumulated += _state.persistence.score * 0.0005;

    // ── Derive release velocity and scenic drag ───────────────────────────
    // releaseVelocity: high score → glacially slow rotation/zoom release
    _state.persistence.releaseVelocity = _lerp(0.052, 0.004, _state.persistence.score);

    // scenicDrag: resistance applied to bearing target
    _state.persistence.scenicDrag = _lerp(0, 0.72, _state.persistence.score);

    return _buildInfluence();
  }

  // ── Influence object ──────────────────────────────────────────────────────
  function _buildInfluence() {
    return {
      score:           _state.persistence.score,
      releaseVelocity: _state.persistence.releaseVelocity,
      scenicDrag:      _state.persistence.scenicDrag,
      residue:         _state.memory.residue,
    };
  }

  function getState() { return _state; }

  // ── init ──────────────────────────────────────────────────────────────────
  function init() {
    console.log("[ScenicPersistence] initialized");
  }

  SBE.ScenicPersistence = {
    init:                 init,
    tick:                 tick,
    evaluateReturnGlance: evaluateReturnGlance,
    getState:             getState,
  };

})(window);
