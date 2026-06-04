// ── OverlayGrammar v1.1.1 ─────────────────────────────────────────────────
// 0521B_WOS_OverlayGrammar_v1.1.1
// Status: canonical-draft
// Classification: interpretation-layer
//
// Defines symbolic observability overlays, continuity-aware telemetry
// presentation, and atmospheric instrumentation grammar for WOS broadcast.
//
// Authority: interpretation-only. Never mutates runtime state.
// Reads from:  AISRuntime, (future) ContinuityStateRegistry,
//              CameraObservabilityState, WorldAtmosphereRuntime
// Writes to:   OverlayProjectionState (interpretive output only)
// Observed by: MarineRenderer, BroadcastSurfaceRenderer
//
// Execution flow:
//   Runtime State Resolution
//   → Continuity State Propagation
//   → Camera Observability Resolution
//   → Overlay Visibility Evaluation
//   → Symbolic Subtraction Pass
//   → Overlay Projection State Output
//   → Renderer Observation
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  // ── System constants ──────────────────────────────────────────────────────
  // Tunable observability infrastructure baselines — NOT immutable doctrine.

  var MIN_OVERLAY_OPACITY     = 0.08;
  var DORMANT_REDUCTION_ALPHA = 0.35;
  var MAX_OVERLAY_DENSITY     = 0.75;
  var LOW_LIGHT_GLOW_LIMIT    = 0.40;

  // ── Evaluation cadence ────────────────────────────────────────────────────
  // Overlay grammar evaluates slower than sim — it is atmospheric, not reactive.
  // 4Hz is sufficient for cinematic continuity reduction.

  var EVAL_INTERVAL_MS = 250;

  // ── OverlayProjectionState ────────────────────────────────────────────────
  // Output map: entityId (string) → OverlayProjectionRecord
  // This is INTERPRETIVE projection state, NOT simulation truth.

  var _projectionState = {};
  var _evalTimer       = null;
  var _initialized     = false;

  // ── evaluateOverlayReduction ──────────────────────────────────────────────
  // Determines reductionState and reductionFactor from resolved continuity.
  // Primary trigger: lifecycle state and continuity scalars.
  // Atmosphere is a SECONDARY modifier — it MUST NOT initiate reduction.

  function evaluateOverlayReduction(entity) {
    var c     = entity.continuity || {};
    var state = entity.state || 'STATUS_STALE';
    var ca    = typeof c.continuityAlpha === 'number' ? c.continuityAlpha : 0;
    var sc    = typeof c.signalConfidence === 'number' ? c.signalConfidence : 0;

    // DORMANT: should not appear in active bucket but guard defensively
    if (state === 'STATUS_DORMANT') {
      return { reductionState: 'suppressed', reductionFactor: 0 };
    }

    // EMERGENCY: always full visibility — never reduced
    if (state === 'STATUS_EMERGENCY') {
      return { reductionState: 'active', reductionFactor: 1.0 };
    }

    // FORCED_COAST: cinematic fade via coastAlpha (runtime-authoritative)
    if (state === 'STATUS_FORCED_COAST') {
      var coastAlpha = typeof c.coastAlpha === 'number' ? c.coastAlpha : 0;
      return {
        reductionState:  coastAlpha > 0.08 ? 'reduced' : 'suppressed',
        reductionFactor: coastAlpha,
      };
    }

    // OFFLINE: deep suppression — retain minimum presence
    if (state === 'STATUS_OFFLINE') {
      return { reductionState: 'suppressed', reductionFactor: MIN_OVERLAY_OPACITY };
    }

    // STALE: significant reduction, floored at DORMANT_REDUCTION_ALPHA
    if (state === 'STATUS_STALE') {
      var staleFactor = Math.max(DORMANT_REDUCTION_ALPHA, ca * 0.5 * sc);
      return { reductionState: 'reduced', reductionFactor: staleFactor };
    }

    // ACTIVE STATES (UNDERWAY / ANCHORED / MOORED / RESTRICTED):
    // Reduction driven by continuityAlpha from AISRuntime.
    var combinedWeight = ca * 0.6 + sc * 0.4;

    if (combinedWeight >= 0.7) {
      return { reductionState: 'active',     reductionFactor: 1.0 };
    } else if (combinedWeight >= 0.3) {
      return { reductionState: 'reduced',    reductionFactor: combinedWeight };
    } else {
      return {
        reductionState:  'suppressed',
        reductionFactor: Math.max(DORMANT_REDUCTION_ALPHA, combinedWeight),
      };
    }
  }

  // ── applySymbolicSubtraction ──────────────────────────────────────────────
  // Continuity-preservation mechanism. Reduces visual density during
  // dormancy/continuity degradation. Mutates the record in-place.
  //
  // Symbolic subtraction is primarily triggered by:
  //   dormancy transitions, continuity reduction, observability degradation
  // Atmosphere may soften: opacity weighting, glow persistence, reduction pacing.
  // Atmosphere MUST NOT: initiate subtraction, suppress runtime truth.

  function applySymbolicSubtraction(record) {
    var rf    = record.reductionFactor;
    var state = record._rawState;

    // EMERGENCY: bypass subtraction entirely
    if (state === 'STATUS_EMERGENCY') {
      record.projectionOpacity = 1.0;
      record.projectionScale   = 1.0;
      return record;
    }

    // Base opacity from reduction factor
    var baseOpacity = Math.max(MIN_OVERLAY_OPACITY, rf * record.observabilityWeight);

    // Apply atmospheric modifier — secondary influence only (softens up to 20%)
    var atmMod = _getAtmosphericModifier();
    baseOpacity = baseOpacity * (0.80 + atmMod * 0.20);

    // Clamp to global density budget (MAX_OVERLAY_DENSITY prevents saturation)
    record.projectionOpacity = Math.min(
      MAX_OVERLAY_DENSITY,
      Math.max(MIN_OVERLAY_OPACITY, baseOpacity)
    );

    // Projection scale: suppressed entities shrink slightly
    // This subtly communicates uncertainty without abrupt removal
    switch (record.reductionState) {
      case 'suppressed':
        record.projectionScale = 0.70 + rf * 0.30;
        break;
      case 'reduced':
        record.projectionScale = 0.85 + rf * 0.15;
        break;
      default: // active
        record.projectionScale = 1.0;
    }

    return record;
  }

  // ── resolveOverlayVisibility ──────────────────────────────────────────────
  // Final visibility resolution for a single entity.
  // Builds an OverlayProjectionRecord by combining:
  //   - runtime continuity state (AISRuntime authority)
  //   - observability weight (upstream-resolved or derived)
  //   - symbolic subtraction result

  function resolveOverlayVisibility(entity) {
    var c = entity.continuity || {};

    var reduction         = evaluateOverlayReduction(entity);
    var observabilityWt   = _resolveObservabilityWeight(entity);
    var sourceAuth        = _resolveSourceAuthority();

    var record = {
      id:                  'overlay_' + entity.mmsi,
      entityId:            String(entity.mmsi),
      continuityAlpha:     typeof c.continuityAlpha    === 'number' ? c.continuityAlpha    : 0,
      observabilityWeight: observabilityWt,
      projectionOpacity:   MIN_OVERLAY_OPACITY, // populated by applySymbolicSubtraction
      projectionScale:     1.0,                 // populated by applySymbolicSubtraction
      reductionState:      reduction.reductionState,
      reductionFactor:     reduction.reductionFactor,
      sourceAuthority:     sourceAuth,

      // Internal carrier fields — not part of public OverlayProjectionRecord contract
      _rawState:           entity.state,
      _rawContinuity:      c,
      _isProtected:        !!entity.isProtected,
      _isPersistent:       !!entity.isPersistent,
    };

    applySymbolicSubtraction(record);
    return record;
  }

  // ── projectOverlayState ───────────────────────────────────────────────────
  // Rebuilds the full OverlayProjectionState snapshot from all active entities.
  // Called each evaluation tick. Pure interpretation — no runtime mutation.

  function projectOverlayState() {
    var ais     = global.SBE && SBE.AISRuntime;
    var vessels = ais ? ais.getActiveVessels() : [];

    var newState = {};
    for (var i = 0; i < vessels.length; i++) {
      var v      = vessels[i];
      var record = resolveOverlayVisibility(v);
      newState[record.entityId] = record;
    }

    _projectionState = newState;
    return _projectionState;
  }

  // ── Atmospheric modifier ──────────────────────────────────────────────────
  // Secondary softening only. Returns a [0,1] modifier.
  // Atmosphere MUST NOT independently trigger continuity reduction.
  // It may soften: opacity weighting, glow persistence, reduction pacing.

  function _getAtmosphericModifier() {
    var rst = global.SBE && SBE.RealitySyncRuntime;
    if (!rst || !rst.getState) return 1.0;
    var s = rst.getState();
    if (!s || !s.resolved) return 1.0;

    var r   = s.resolved;
    var mod = 1.0;

    // Precipitation softens readability
    if (typeof r.precipitation === 'number' && r.precipitation > 0.5) {
      mod = Math.min(mod, 0.85);
    }
    // High wind reduces atmospheric legibility
    if (typeof r.windSpeed === 'number' && r.windSpeed > 30) {
      mod = Math.min(mod, 0.90);
    }

    return mod;
  }

  // ── Observability weight resolution ──────────────────────────────────────
  // Weight MUST originate from upstream authorities.
  // Allowed upstream sources: ContinuityStateRegistry, ObservabilityCamera
  //   (CameraObservabilityState), BroadcastAttentionRuntime (deferred),
  //   or derived from AISRuntime scalars.
  //
  // ContractGovernance §45: OverlayGrammar MUST NEVER determine narrative
  // importance, create viewer attention state, or compute pacing significance.

  function _resolveObservabilityWeight(entity) {
    var c  = entity.continuity || {};
    var sc = typeof c.signalConfidence    === 'number' ? c.signalConfidence    : 0;
    var ca = typeof c.continuityAlpha     === 'number' ? c.continuityAlpha     : 0;
    var dr = typeof c.deadReckoningWeight === 'number' ? c.deadReckoningWeight : 0;

    // Protected and persistent vessels receive observability boost
    var protectedBonus  = entity.isProtected  ? 0.15 : 0;
    var persistentBonus = entity.isPersistent ? 0.10 : 0;

    var w = sc * 0.40 + ca * 0.35 + dr * 0.25 + protectedBonus + persistentBonus;

    // ObservabilityCamera integration (§spec authority chain):
    // Camera proximity modulates overlay weight — entities near framing target
    // receive increased observability. Read-only from ObservabilityCameraState.
    var oc = global.SBE && SBE.ObservabilityCamera;
    if (oc && oc.getState) {
      var camState = oc.getState();
      var internal = camState._internal;
      if (internal && entity.lat !== undefined && entity.lng !== undefined) {
        // Distance from camera current position to entity
        var dLat  = entity.lat - internal.currentLat;
        var dLng  = entity.lng - internal.currentLng;
        // Approximate degree-to-meter for proximity check (not geo-accurate —
        // symbolic, not simulation)
        var distDeg = Math.sqrt(dLat * dLat + dLng * dLng);
        var NEAR_DEG = 0.03; // ~3km — "near camera" threshold
        if (distDeg < NEAR_DEG) {
          var proximityBonus = (1 - distDeg / NEAR_DEG) * 0.15;
          w = Math.min(1, w + proximityBonus * camState.observabilityWeight);
        }
      }
    }

    return Math.min(1.0, Math.max(0, w));
  }

  // ── Source authority resolution ───────────────────────────────────────────
  // Identifies which upstream system provided the continuity truth consumed.

  function _resolveSourceAuthority() {
    if (global.SBE && SBE.ContinuityStateRegistry) return 'ContinuityStateRegistry';
    // ObservabilityCamera exposes CameraObservabilityState
    if (global.SBE && SBE.ObservabilityCamera)     return 'CameraObservabilityState';
    if (global.SBE && SBE.CameraObservabilityState) return 'CameraObservabilityState';
    return 'AISRuntime';
  }

  // ── Evaluation tick ───────────────────────────────────────────────────────

  function _evalTick() {
    projectOverlayState();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  function init() {
    if (_initialized) return;
    _initialized = true;
    _evalTimer   = setInterval(_evalTick, EVAL_INTERVAL_MS);
    console.log('[OverlayGrammar v1.1.1] initialized');
  }

  function destroy() {
    if (_evalTimer) { clearInterval(_evalTimer); _evalTimer = null; }
    _projectionState = {};
    _initialized     = false;
  }

  // Full OverlayProjectionState snapshot — returns interpretive output map
  function getProjectionState() {
    return _projectionState;
  }

  // Single record lookup by entityId (MMSI string or number)
  function getRecord(entityId) {
    return _projectionState[String(entityId)] || null;
  }

  // ── Exports ───────────────────────────────────────────────────────────────

  SBE.OverlayGrammar = {
    init,
    destroy,
    getProjectionState,
    getRecord,

    // Core functions per spec — exposed for validation and debug tooling
    evaluateOverlayReduction,
    projectOverlayState,
    applySymbolicSubtraction,
    resolveOverlayVisibility,

    // System constants
    MIN_OVERLAY_OPACITY,
    DORMANT_REDUCTION_ALPHA,
    MAX_OVERLAY_DENSITY,
    LOW_LIGHT_GLOW_LIMIT,
  };

})(window);
