// ── ObservabilityCamera v1.1.2 ────────────────────────────────────────────
// 0521C_WOS_ObservabilityCamera_v1.1.2
// Status: canonical-draft
// Classification: interpretation-layer
//
// Governs continuity-aware spatial framing for WOS broadcast systems.
// Owns: camera framing interpretation, continuity-aware traversal,
//       atmospheric pacing, symbolic spatial focus, macro continuity movement,
//       observability-driven framing, Camera Authority During Isolation.
//
// Does NOT own: runtime coordinates, continuity state authority,
//               simulation scheduling, renderer shaders, telemetry truth.
//
// Execution flow:
//   Runtime State Resolution → Continuity Propagation
//   → Observability Weight Resolution → Camera Framing Evaluation
//   → Atmospheric Pacing Pass → Camera Drift Resolution
//   → Renderer Observation
//
// Reads from:  AISRuntime, (future) ContinuityStateRegistry, CameraInputConstraints
// Writes to:   ObservabilityCameraState
// Observed by: MarineRenderer, BroadcastSurfaceRenderer, OverlayGrammar
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  // ── System constants ──────────────────────────────────────────────────────
  // Tunable pacing infrastructure baselines — NOT immutable doctrine.

  var CAMERA_DRIFT_SOFTNESS      = 0.12;  // convergence rate fraction per tick
  var MAX_CAMERA_ACCELERATION    = 0.08;  // prevents jump-cut intercept violations
  var LOW_LIGHT_PACING_FACTOR    = 0.65;  // nighttime pacing reduction
  var OBSERVABILITY_SETTLE_TICKS = 32;    // settle window at normalized sim cadence

  // ── Camera modes ──────────────────────────────────────────────────────────
  // Interpretive framing presets — NOT simulation authority systems.
  // Mode activation resolves through CameraInputConstraints.

  var MODE_HARBOR_DRIFT   = 'harbor-drift';    // drifting across harbor density
  var MODE_CORRIDOR_GLIDE = 'corridor-glide';  // tracking along a corridor
  var MODE_GRID_ANCHOR    = 'grid-anchor';     // anchored to fixed grid reference
  var MODE_AMBIENT_SURVEY = 'ambient-survey';  // broad atmospheric sweep
  var MODE_ATMOSPHERIC_HOLD = 'atmospheric-hold'; // still — environmental anchor

  // ── Isolation decay phases ────────────────────────────────────────────────
  // Three-phase lifecycle for Camera Authority During Isolation.
  // Phase transitions are upstream-driven — NOT independently mutated here.

  var PHASE_RETROSPECTIVE_EASE = 'retrospective-ease';    // 0–30s: linger, retain
  var PHASE_CINEMATIC_DRIFT    = 'cinematic-drift';       // 30–90s: gentle drift
  var PHASE_STATIC_SUBSTRATE   = 'static-substrate-anchor'; // 90s+: environmental anchor

  // ── Target registries ─────────────────────────────────────────────────────
  var REGISTRY_MARITIME       = 'maritime';
  var REGISTRY_TRANSIT        = 'transit';
  var REGISTRY_INFRASTRUCTURE = 'infrastructure';

  // ── Evaluation cadence ────────────────────────────────────────────────────
  // Atmospheric cadence — patient, not reactive.

  var EVAL_INTERVAL_MS = 2000; // 0.5Hz

  // ── Observable camera state ───────────────────────────────────────────────
  // ObservabilityCameraState per spec data model.
  // Represents interpretive framing state — NOT simulation truth.

  var _state = {
    id:                  'observability-camera-primary',
    mode:                MODE_HARBOR_DRIFT,
    continuityAlpha:     1.0,
    observabilityWeight: 1.0,
    pacingFactor:        1.0,
    driftFactor:         0.0,
    targetRegistry:      REGISTRY_MARITIME,
    sourceAuthority:     'AISRuntime',
  };

  // ── Internal camera motion state ──────────────────────────────────────────
  // These are interpretation-layer internal values — not runtime authority.

  var _currentLat   = 40.680;  // NYC harbor default
  var _currentLng   = -73.990;
  var _targetLat    = 40.680;
  var _targetLng    = -73.990;
  var _velocityLat  = 0;
  var _velocityLng  = 0;

  // Isolation tracking
  var _isolationPhase      = PHASE_RETROSPECTIVE_EASE;
  var _isolationTickCount  = 0;
  var _settleTicksRemaining= OBSERVABILITY_SETTLE_TICKS;

  var _lastEvalMs    = 0;
  var _drivesMapbox  = false;  // opt-in: ObservabilityCamera applies to Mapbox viewport
  var _evalTimer     = null;
  var _initialized   = false;

  // ── Geo utilities (local, interpretation-only) ────────────────────────────

  function _distanceMeters(lat1, lng1, lat2, lng2) {
    var R    = 6371000;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLng = (lng2 - lng1) * Math.PI / 180;
    var a    = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
               Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
               Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // ── resolveObservabilityWeight ────────────────────────────────────────────
  // Upstream-sourced. ObservabilityCamera MUST NEVER fabricate attention
  // hierarchy or compute world importance independently.

  function resolveObservabilityWeight() {
    // Priority: ContinuityStateRegistry → CameraInputConstraints → AISRuntime derived
    if (global.SBE && SBE.ContinuityStateRegistry && SBE.ContinuityStateRegistry.getCameraWeight) {
      return SBE.ContinuityStateRegistry.getCameraWeight();
    }
    if (global.SBE && SBE.CameraInputConstraints && SBE.CameraInputConstraints.getObservabilityWeight) {
      return SBE.CameraInputConstraints.getObservabilityWeight();
    }

    // Derived from AISRuntime continuity scalars — read-only
    var ais = global.SBE && SBE.AISRuntime;
    if (!ais) return 0.5;

    var vessels = ais.getActiveVessels();
    if (!vessels.length) return 0.2;

    var totalWeight = 0;
    for (var i = 0; i < vessels.length; i++) {
      var v  = vessels[i];
      var c  = v.continuity || {};
      var sc = typeof c.signalConfidence === 'number' ? c.signalConfidence : 0;
      var ca = typeof c.continuityAlpha  === 'number' ? c.continuityAlpha  : 0;
      var w  = sc * 0.4 + ca * 0.4 +
               (v.isProtected  ? 0.15 : 0) +
               (v.isPersistent ? 0.05 : 0);
      totalWeight += Math.min(1, w);
    }

    return Math.min(1, totalWeight / vessels.length);
  }

  // ── Attention geography rules ─────────────────────────────────────────────
  // low-density linger, shared geographic intersection, jump-cut intercept.

  // Returns a target {lat, lng} biased toward shared geographic intersections
  // when multiple underway vessels are converging within proximity threshold.
  function _resolveIntersectionBias(underwayVessels) {
    if (underwayVessels.length < 2) return null;

    var PROXIMITY_M     = 5000; // vessels within 5km qualify as intersecting
    var bestScore       = 0;
    var bestLat         = null;
    var bestLng         = null;

    for (var i = 0; i < underwayVessels.length; i++) {
      for (var j = i + 1; j < underwayVessels.length; j++) {
        var a    = underwayVessels[i];
        var b    = underwayVessels[j];
        var dist = _distanceMeters(a.lat, a.lng, b.lat, b.lng);

        if (dist < PROXIMITY_M) {
          // Score: inverse distance × combined continuityAlpha
          var ca_a  = (a.continuity && a.continuity.continuityAlpha) || 0.5;
          var ca_b  = (b.continuity && b.continuity.continuityAlpha) || 0.5;
          var score = (1 - dist / PROXIMITY_M) * (ca_a + ca_b) * 0.5;

          if (score > bestScore) {
            bestScore = score;
            bestLat   = (a.lat + b.lat) * 0.5;
            bestLng   = (a.lng + b.lng) * 0.5;
          }
        }
      }
    }

    return bestLat !== null ? { lat: bestLat, lng: bestLng, score: bestScore } : null;
  }

  // ── evaluateCameraFraming ─────────────────────────────────────────────────
  // Determines target position and framing mode from upstream state.
  // Read-only. MUST NOT mutate runtime truth.

  function evaluateCameraFraming() {
    var ais     = global.SBE && SBE.AISRuntime;
    if (!ais) return;

    var vessels   = ais.getActiveVessels();
    var underway  = [];
    var protected_= [];
    var stationary= [];

    for (var i = 0; i < vessels.length; i++) {
      var v = vessels[i];
      if (v.isProtected)                  protected_.push(v);
      if (v.state === 'STATUS_UNDERWAY')   underway.push(v);
      if (v.state === 'STATUS_MOORED' ||
          v.state === 'STATUS_ANCHORED')   stationary.push(v);
    }

    // ── Target resolution: attention geography rules ──────────────────────

    var newTarget = null;

    // 1. Protected vessels: highest attention — camera follows
    if (protected_.length > 0) {
      _state.mode           = MODE_HARBOR_DRIFT;
      _state.targetRegistry = REGISTRY_MARITIME;

      // Weighted centroid by continuityAlpha
      var pLatSum = 0, pLngSum = 0, pWSum = 0;
      for (var p = 0; p < protected_.length; p++) {
        var ca  = (protected_[p].continuity && protected_[p].continuity.continuityAlpha) || 0.5;
        pLatSum += protected_[p].lat * ca;
        pLngSum += protected_[p].lng * ca;
        pWSum   += ca;
      }
      newTarget = { lat: pLatSum / pWSum, lng: pLngSum / pWSum };

    // 2. Shared geographic intersection: converging vessels attract camera
    } else if (underway.length >= 2) {
      var bias = _resolveIntersectionBias(underway);
      if (bias && bias.score > 0.25) {
        _state.mode     = MODE_HARBOR_DRIFT;
        newTarget       = { lat: bias.lat, lng: bias.lng };
      } else {
        // Ambient survey: weighted centroid of underway vessels
        _state.mode           = MODE_AMBIENT_SURVEY;
        _state.targetRegistry = REGISTRY_MARITIME;

        var wLatSum = 0, wLngSum = 0, wSum = 0;
        for (var u = 0; u < underway.length; u++) {
          var w = (underway[u].continuity && underway[u].continuity.continuityAlpha) || 0.5;
          wLatSum += underway[u].lat * w;
          wLngSum += underway[u].lng * w;
          wSum    += w;
        }
        if (wSum > 0) newTarget = { lat: wLatSum / wSum, lng: wLngSum / wSum };
      }

    } else if (underway.length === 1) {
      _state.mode = MODE_CORRIDOR_GLIDE;
      newTarget   = { lat: underway[0].lat, lng: underway[0].lng };

    } else if (stationary.length > 0) {
      // Grid anchor on stationary cluster
      _state.mode           = MODE_GRID_ANCHOR;
      _state.targetRegistry = REGISTRY_MARITIME;

      var sLatSum = 0, sLngSum = 0;
      for (var s = 0; s < stationary.length; s++) {
        sLatSum += stationary[s].lat;
        sLngSum += stationary[s].lng;
      }
      newTarget = { lat: sLatSum / stationary.length, lng: sLngSum / stationary.length };

    } else {
      // No active vessels — atmospheric hold
      _state.mode = MODE_ATMOSPHERIC_HOLD;
    }

    if (newTarget) {
      _targetLat = newTarget.lat;
      _targetLng = newTarget.lng;
    }

    _state.observabilityWeight = resolveObservabilityWeight();
    _state.sourceAuthority     = _resolveSourceAuthority();
  }

  // ── applyAtmosphericPacing ────────────────────────────────────────────────
  // Movement restraint and drift softness.
  // LOW_LIGHT_PACING_FACTOR applied during nighttime hours.
  // pacingFactor: normalized [0.0–1.0].

  function applyAtmosphericPacing() {
    var baseP = 1.0;

    // Low-light pacing (atmospheric darkness preservation)
    var hour       = new Date().getHours();
    var isLowLight = (hour < 7 || hour > 21);
    if (isLowLight) baseP *= LOW_LIGHT_PACING_FACTOR;

    // Mode-specific restraint
    switch (_state.mode) {
      case MODE_ATMOSPHERIC_HOLD:  baseP *= 0.08; break;
      case MODE_GRID_ANCHOR:       baseP *= 0.25; break;
      case MODE_HARBOR_DRIFT:      baseP *= 0.55; break;
      case MODE_CORRIDOR_GLIDE:    baseP *= 0.70; break;
      case MODE_AMBIENT_SURVEY:    baseP *= 0.80; break;
    }

    // Observability weight modulates pacing — more signal → more active following
    baseP *= 0.4 + _state.observabilityWeight * 0.6;

    // Settle window: reduced pacing while stabilizing after mode change
    if (_settleTicksRemaining > 0) {
      var settleFrac    = _settleTicksRemaining / OBSERVABILITY_SETTLE_TICKS;
      baseP            *= (1 - settleFrac * 0.6);
      _settleTicksRemaining = Math.max(0, _settleTicksRemaining - 1);
    }

    _state.pacingFactor = Math.max(0, Math.min(1, baseP));

    // Update continuityAlpha: average of active fleet continuity
    var ais = global.SBE && SBE.AISRuntime;
    if (ais) {
      var vessels = ais.getActiveVessels();
      if (vessels.length > 0) {
        var caSum = 0;
        for (var i = 0; i < vessels.length; i++) {
          caSum += (vessels[i].continuity && vessels[i].continuity.continuityAlpha) || 0;
        }
        _state.continuityAlpha = caSum / vessels.length;
      } else {
        _state.continuityAlpha = 0.3; // degrade with no fleet signal
      }
    }
  }

  // ── resolveCameraDrift ────────────────────────────────────────────────────
  // Continuous-time drift from current position toward framing target.
  // CAMERA_DRIFT_SOFTNESS: convergence rate.
  // MAX_CAMERA_ACCELERATION: jump-cut intercept — prevents abrupt jumps.
  // Formula: value = 1 - Math.exp(-dt / halfLife) style approach.

  function resolveCameraDrift(dtSec) {
    if (dtSec <= 0 || dtSec > 10) return; // guard against stale ticks

    var dLat = _targetLat - _currentLat;
    var dLng = _targetLng - _currentLng;

    // Desired velocity scaled by pacing and drift softness
    var desiredVLat = dLat * CAMERA_DRIFT_SOFTNESS * _state.pacingFactor;
    var desiredVLng = dLng * CAMERA_DRIFT_SOFTNESS * _state.pacingFactor;

    // Acceleration clamping — jump-cut intercept rule
    var aLat = desiredVLat - _velocityLat;
    var aLng = desiredVLng - _velocityLng;
    var aMag = Math.sqrt(aLat * aLat + aLng * aLng);
    if (aMag > MAX_CAMERA_ACCELERATION) {
      var aScale = MAX_CAMERA_ACCELERATION / aMag;
      aLat *= aScale;
      aLng *= aScale;
    }

    _velocityLat += aLat;
    _velocityLng += aLng;

    _currentLat += _velocityLat * dtSec;
    _currentLng += _velocityLng * dtSec;

    // driftFactor: normalized speed relative to max expected drift
    var speed      = Math.sqrt(_velocityLat * _velocityLat + _velocityLng * _velocityLng);
    _state.driftFactor = Math.min(1, speed / Math.max(0.0001, CAMERA_DRIFT_SOFTNESS));
  }

  // ── evaluateContinuityTranslation ─────────────────────────────────────────
  // Interprets isolation phase — three-phase decay lifecycle.
  // Phase progression driven by upstream gate state — NOT independently mutated.
  // low-density linger: fewer active vessels → extended settle before drift.

  function evaluateContinuityTranslation() {
    var ais      = global.SBE && SBE.AISRuntime;
    var vessels  = ais ? ais.getActiveVessels() : [];
    var activeN  = 0;
    for (var i = 0; i < vessels.length; i++) {
      var st = vessels[i].state;
      if (st === 'STATUS_UNDERWAY' || st === 'STATUS_RESTRICTED' ||
          st === 'STATUS_EMERGENCY') activeN++;
    }

    if (activeN > 0) {
      // Active signal received — reset isolation phase
      _isolationPhase     = PHASE_RETROSPECTIVE_EASE;
      _isolationTickCount = 0;
    } else {
      _isolationTickCount++;

      // Low-density linger: settle window extends proportionally to vessel scarcity
      // This implements the low-density linger attention geography rule.
      var lingerBonus = Math.round(OBSERVABILITY_SETTLE_TICKS * (1 - Math.min(1, vessels.length / 5)));

      var ease_threshold  = 15 + lingerBonus;  // ticks before cinematic drift
      var drift_threshold = 45 + lingerBonus;  // ticks before static anchor

      if (_isolationTickCount < ease_threshold) {
        _isolationPhase = PHASE_RETROSPECTIVE_EASE;
        // Lingering — minimal mode change, hold last framing
      } else if (_isolationTickCount < drift_threshold) {
        if (_isolationPhase !== PHASE_CINEMATIC_DRIFT) {
          _isolationPhase = PHASE_CINEMATIC_DRIFT;
          _state.mode     = MODE_HARBOR_DRIFT;
          _settleTicksRemaining = Math.round(OBSERVABILITY_SETTLE_TICKS * 0.5);
        }
      } else {
        if (_isolationPhase !== PHASE_STATIC_SUBSTRATE) {
          _isolationPhase = PHASE_STATIC_SUBSTRATE;
          _state.mode     = MODE_ATMOSPHERIC_HOLD;
          _settleTicksRemaining = OBSERVABILITY_SETTLE_TICKS;
        }
      }
    }

    return _isolationPhase;
  }

  // ── Viewport context propagation ──────────────────────────────────────────
  // Provides AISRuntime with camera center for camera protection computation.
  // Camera is always centered on screen — center is always (width/2, height/2).

  function _updateViewportContext() {
    var ais = global.SBE && SBE.AISRuntime;
    if (!ais || !ais.setViewportContext) return;
    var w    = global.innerWidth  || 1920;
    var h    = global.innerHeight || 1080;
    var diag = Math.sqrt(w * w + h * h);
    ais.setViewportContext(diag, w * 0.5, h * 0.5);
  }

  // ── Mapbox camera application ─────────────────────────────────────────────
  // Optional. When _drivesMapbox is enabled, applies resolved framing to
  // the Mapbox viewport. This is interpretation applied to presentation —
  // NOT a claim to simulation authority.

  function _applyToMapbox() {
    if (!_drivesMapbox) return;
    var mapInstance = global.map || (global.SBE && SBE._mapInstance);
    if (!mapInstance || typeof mapInstance.easeTo !== 'function') return;

    // Duration derived from pacing: calm camera → longer ease
    var durationMs = Math.round(1800 / Math.max(0.05, _state.pacingFactor));
    durationMs     = Math.min(6000, Math.max(400, durationMs));

    mapInstance.easeTo({
      center:   [_currentLng, _currentLat],
      duration: durationMs,
      easing:   function (t) { return 1 - Math.exp(-t * 3); }, // continuous-time softness
    });
  }

  // ── Source authority resolution ───────────────────────────────────────────

  function _resolveSourceAuthority() {
    if (global.SBE && SBE.ContinuityStateRegistry) return 'ContinuityStateRegistry';
    if (global.SBE && SBE.CameraInputConstraints)  return 'CameraInputConstraints';
    return 'AISRuntime';
  }

  // ── Evaluation tick ───────────────────────────────────────────────────────

  function _evalTick() {
    var now   = performance.now();
    var dtSec = _lastEvalMs > 0
      ? (now - _lastEvalMs) / 1000
      : EVAL_INTERVAL_MS / 1000;
    _lastEvalMs = now;

    // Execution flow per spec
    evaluateContinuityTranslation(); // phase + isolation
    evaluateCameraFraming();          // mode + target
    applyAtmosphericPacing();         // pacingFactor + continuityAlpha
    resolveCameraDrift(dtSec);        // position + velocity
    _updateViewportContext();          // AISRuntime camera protection
    _applyToMapbox();                  // optional viewport application
  }

  // ── Public API ────────────────────────────────────────────────────────────

  function init() {
    if (_initialized) return;
    _initialized = true;

    // Seed position from current map center if available
    var mapInstance = global.map || (global.SBE && SBE._mapInstance);
    if (mapInstance && typeof mapInstance.getCenter === 'function') {
      var center  = mapInstance.getCenter();
      _currentLat = center.lat;
      _currentLng = center.lng;
      _targetLat  = center.lat;
      _targetLng  = center.lng;
    }

    _evalTimer = setInterval(_evalTick, EVAL_INTERVAL_MS);
    console.log('[ObservabilityCamera v1.1.2] initialized — mode:', _state.mode);
  }

  function destroy() {
    if (_evalTimer) { clearInterval(_evalTimer); _evalTimer = null; }
    _initialized = false;
  }

  // getState returns ObservabilityCameraState — interpretive output only
  function getState() {
    return {
      id:                  _state.id,
      mode:                _state.mode,
      continuityAlpha:     _state.continuityAlpha,
      observabilityWeight: _state.observabilityWeight,
      pacingFactor:        _state.pacingFactor,
      driftFactor:         _state.driftFactor,
      targetRegistry:      _state.targetRegistry,
      sourceAuthority:     _state.sourceAuthority,
      // Internal diagnostics — not part of canonical contract
      _internal: {
        currentLat:           _currentLat,
        currentLng:           _currentLng,
        targetLat:            _targetLat,
        targetLng:            _targetLng,
        velocityLat:          _velocityLat,
        velocityLng:          _velocityLng,
        isolationPhase:       _isolationPhase,
        isolationTickCount:   _isolationTickCount,
        settleTicksRemaining: _settleTicksRemaining,
        drivesMapbox:         _drivesMapbox,
      },
    };
  }

  // Override mode manually — resets settle window
  function setMode(mode) {
    var VALID = [
      MODE_HARBOR_DRIFT, MODE_CORRIDOR_GLIDE, MODE_GRID_ANCHOR,
      MODE_AMBIENT_SURVEY, MODE_ATMOSPHERIC_HOLD,
    ];
    if (VALID.indexOf(mode) === -1) {
      console.warn('[ObservabilityCamera] Unknown mode:', mode, '— valid:', VALID.join(', '));
      return;
    }
    _state.mode           = mode;
    _settleTicksRemaining = OBSERVABILITY_SETTLE_TICKS;
  }

  // Override framing target — resets settle window
  function setTarget(lat, lng) {
    _targetLat            = lat;
    _targetLng            = lng;
    _settleTicksRemaining = OBSERVABILITY_SETTLE_TICKS;
  }

  // Enable/disable Mapbox viewport application
  // When enabled: ObservabilityCamera drives the Mapbox map easeTo()
  function enableMapboxDrive(enabled) {
    _drivesMapbox = !!enabled;
    if (_drivesMapbox) {
      console.log('[ObservabilityCamera] Mapbox drive ENABLED — camera will move viewport');
    } else {
      console.log('[ObservabilityCamera] Mapbox drive DISABLED — state-only mode');
    }
  }

  // Force an immediate evaluation (useful for debug, after seed vessel injection)
  function forceEval() {
    _evalTick();
  }

  // ── Exports ───────────────────────────────────────────────────────────────

  SBE.ObservabilityCamera = {
    init,
    destroy,
    getState,
    setMode,
    setTarget,
    forceEval,
    enableMapboxDrive,

    // Core functions per spec — exposed for validation and debug tooling
    resolveObservabilityWeight,
    evaluateCameraFraming,
    applyAtmosphericPacing,
    resolveCameraDrift,
    evaluateContinuityTranslation,

    // Mode constants
    MODE_HARBOR_DRIFT,
    MODE_CORRIDOR_GLIDE,
    MODE_GRID_ANCHOR,
    MODE_AMBIENT_SURVEY,
    MODE_ATMOSPHERIC_HOLD,

    // Isolation phase constants
    PHASE_RETROSPECTIVE_EASE,
    PHASE_CINEMATIC_DRIFT,
    PHASE_STATIC_SUBSTRATE,

    // Registry constants
    REGISTRY_MARITIME,
    REGISTRY_TRANSIT,
    REGISTRY_INFRASTRUCTURE,

    // System constants
    CAMERA_DRIFT_SOFTNESS,
    MAX_CAMERA_ACCELERATION,
    LOW_LIGHT_PACING_FACTOR,
    OBSERVABILITY_SETTLE_TICKS,
  };

})(window);
