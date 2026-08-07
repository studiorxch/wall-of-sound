// ── ItineraryRunController v1.2.0 ─────────────────────────────────────────────
// 0730D_MAPS_Itinerary_Runner_and_Active_Orb_Traversal
// 0730E_MAPS_RunPresentationControls_VisibilityFix_AbsoluteClock
// 0805A_MAPS_Itinerary_Presentation_Foundation_Repairs
// Status: active | Classification: runtime / itinerary-run-controller
//
// The animation engine: owns the RAF loop, stage timing, route sampling (via
// ItineraryRouteSampler), automatic stage progression, and completion. Never
// reads MAPS_ITINERARY_DB directly — only ever animates the already-resolved,
// immutable ItineraryRunPayload it's given.
//
// Runs ONLY inside canonical LIVE MAP (wall/index.html) — this file is never
// loaded in music/index.html.
//
// v1.2.0 changes (0805A):
//   - Presentation-only actor smoothing: _currentEntity stays the exact
//     authoritative sample (derived from the absolute-time clock, unchanged —
//     getSnapshot() still reports it verbatim). A SEPARATE _smoothedEntity
//     eases toward _currentEntity every real tick via the same exponential-
//     decay lerp already proven in heroVehicleRuntime.js (_expFactor,
//     shortest-arc heading lerp) — only _smoothedEntity is ever pushed to
//     HeroVehicleRenderer.update(). getPresentationEntity() exposes it
//     read-only for the camera-follow loop (itineraryRunAuthority.js) to
//     target, so the camera and the visible hero move in lockstep instead of
//     the camera leading a laggier or jerkier visible actor. Snaps exactly to
//     _currentEntity on pause()/completion (exponential decay never exactly
//     reaches its target on its own); clears on stop()/restart(); reseeds
//     (no spring-in pop) on start().
//   - HeroVehicleRenderer.update() is now called with {allowFallback:false}
//     — itinerary presentation never substitutes the legacy Hero Car for a
//     failed/unhealthy Orb. The renderer's return value ({visible,kind}) is
//     read each tick into visibleHeroKind/presentationWarning, both in
//     getSnapshot(), so a real "Orb unavailable" state is explicit rather
//     than silently swapped for a different actor.
//   - heroVisualLiftPixels: a second, independent presentation offset
//     (default 0, separate from heroAltitudeMeters) — copied straight onto
//     the entity each tick, never lerped (it's a direct slider value, not
//     motion), applied only by the renderer (orbProfileRenderer.js).
//
// Placement: wall/systems/runtime/itineraryRunController.js
// Load: AFTER itineraryRouteSampler.js. BEFORE itineraryRunAuthority.js.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.2.0';

  var DISCONTINUITY_WARN_M = 25;

  var HERO_ALTITUDE_MIN_M    = 0;
  var HERO_ALTITUDE_MAX_M    = 400;
  var HERO_VISUAL_LIFT_MIN_PX = 0;
  var HERO_VISUAL_LIFT_MAX_PX = 200;
  var PLAYBACK_RATE_MIN   = 0.1;
  var PLAYBACK_RATE_MAX   = 60;

  // Exponential-decay smoothing constants — same shape/magnitude as the
  // proven values in heroVehicleRuntime.js (Drive mode): POS k=7 (half-life
  // ≈0.099s), HDG k=5 (half-life ≈0.139s). Real (unscaled) dt — see
  // _advanceSmoothing()'s rationale below.
  var ACTOR_POS_SMOOTH_K = 7;
  var ACTOR_HDG_SMOOTH_K = 5;

  var _status           = 'idle';
  var _payload           = null;
  var _lastPayload       = null;
  var _speedMultiplier    = 1;
  var _heroAltitudeMeters = 0;
  var _heroVisualLiftPixels = 0;
  var _runId              = null;

  var _stageIndex      = 0;
  var _stagePoints      = null;
  var _stageSegments    = null;

  // ── Absolute-time clock state (0730E) ─────────────────────────────────────
  // _baseElapsedMs/_stageBaseElapsedMs are eagerly updated on every tick from
  // a real-wall-clock delta — never lazily derived at read time. This is what
  // makes a throttled/hidden tab's NEXT tick correct: the delta since
  // _checkpointRealMs is computed in full (no 0.1s clamp like the old
  // RAF-delta model), so no elapsed time is silently lost.
  var _baseElapsedMs      = 0;
  var _stageBaseElapsedMs  = 0;
  var _checkpointRealMs    = 0;

  var _totalDistanceTraveledM = 0;
  var _stageDistanceTraveledM = 0;
  var _totalItineraryDistanceM = 0;
  var _totalItineraryDurationS = 0;

  // _currentEntity: authoritative (drives getSnapshot()). _smoothedEntity:
  // presentation-only, eased toward _currentEntity — see _advanceSmoothing().
  var _currentEntity   = null;
  var _smoothedEntity  = null;
  var _lastSmoothMs    = 0;

  var _visibleHeroKind      = 'none'; // 'orb' | 'none' — from HeroVehicleRenderer.update()'s return value
  var _presentationWarning  = null;   // 'orb_unavailable' | null

  var _startedAt = null, _pausedAt = null, _completedAt = null;
  var _errorCode = null, _errorMessage = null;

  var _rafId = null;

  function _now() { return Date.now(); }

  function _sampler() { return global.SBE && SBE.ItineraryRouteSampler; }

  function _clearActorPosition() {
    var vla = global.SBE && SBE.ViewportLocationAuthority;
    if (vla && typeof vla.clearActorPosition === 'function') { try { vla.clearActorPosition(); } catch (e) {} }
  }

  function _stopRenderer() {
    var renderer = global.SBE && SBE.HeroVehicleRenderer;
    if (renderer && typeof renderer.stop === 'function') { try { renderer.stop(); } catch (e) {} }
  }

  function _clampAltitude(m) {
    var n = (typeof m === 'number' && isFinite(m)) ? m : 0;
    if (n < HERO_ALTITUDE_MIN_M) return HERO_ALTITUDE_MIN_M;
    if (n > HERO_ALTITUDE_MAX_M) return HERO_ALTITUDE_MAX_M;
    return n;
  }

  function _clampVisualLift(px) {
    var n = (typeof px === 'number' && isFinite(px)) ? px : 0;
    if (n < HERO_VISUAL_LIFT_MIN_PX) return HERO_VISUAL_LIFT_MIN_PX;
    if (n > HERO_VISUAL_LIFT_MAX_PX) return HERO_VISUAL_LIFT_MAX_PX;
    return n;
  }

  function _clampRate(r) {
    var n = (typeof r === 'number' && isFinite(r) && r > 0) ? r : 1;
    if (n < PLAYBACK_RATE_MIN) return PLAYBACK_RATE_MIN;
    if (n > PLAYBACK_RATE_MAX) return PLAYBACK_RATE_MAX;
    return n;
  }

  function _stopRaf() {
    if (_rafId != null) { try { global.cancelAnimationFrame(_rafId); } catch (e) {} }
    _rafId = null;
  }

  function _resetRunState() {
    _payload = null;
    _stageIndex = 0;
    _stagePoints = null;
    _stageSegments = null;
    _baseElapsedMs = 0; _stageBaseElapsedMs = 0; _checkpointRealMs = 0;
    _totalDistanceTraveledM = 0; _stageDistanceTraveledM = 0;
    _totalItineraryDistanceM = 0; _totalItineraryDurationS = 0;
    _currentEntity = null;
    _smoothedEntity = null;
    _lastSmoothMs = 0;
    _visibleHeroKind = 'none';
    _presentationWarning = null;
    _startedAt = null; _pausedAt = null; _completedAt = null;
    _errorCode = null; _errorMessage = null;
    _runId = null;
    // _speedMultiplier / _heroAltitudeMeters / _heroVisualLiftPixels
    // deliberately NOT reset here — start() always sets them explicitly.
  }

  function _loadStageGeometry() {
    var sampler = _sampler();
    var stage = _payload.stages[_stageIndex];
    var points = sampler.toPoints(stage.geometry.coordinates);
    if (points.length < 2) {
      _status = 'error';
      _errorCode = 'invalid_geometry';
      _errorMessage = 'stage ' + stage.stageId + ' has invalid or degenerate geometry';
      _stopRaf();
      return false;
    }
    if (_stageIndex > 0) {
      var prevStage = _payload.stages[_stageIndex - 1];
      var prevPoints = sampler.toPoints(prevStage.geometry.coordinates);
      var prevEnd = prevPoints[prevPoints.length - 1];
      var newStart = points[0];
      var gap = sampler.haversineM(prevEnd.lat, prevEnd.lng, newStart.lat, newStart.lng);
      if (gap > DISCONTINUITY_WARN_M) {
        console.warn('[ItineraryRunController] stage discontinuity: ' + Math.round(gap) +
          'm gap between stage end and next stage origin — snapping, not inventing connecting geometry.');
      }
    }
    _stagePoints = points;
    _stageSegments = sampler.buildSegments(points);
    return true;
  }

  // Full entity shape at a given stage progress — shared by the initial
  // entity built in start() and every per-tick sample, so the first frame and
  // every subsequent frame use identical heading/altitude/lift derivation.
  function _computeEntityAt(stage, stageProgress01) {
    var sampler = _sampler();
    var pos = sampler.interpolate(_stagePoints, _stageSegments, stageProgress01);
    var nominalSpeedMs = (stage.distanceMeters / Math.max(1, stage.durationSeconds)) * _speedMultiplier;
    var heading = sampler.lookaheadBearing(_stagePoints, _stageSegments, stageProgress01, nominalSpeedMs);
    return {
      lat: pos.lat, lng: pos.lng, headingDeg: heading,
      altitudeMeters: _heroAltitudeMeters,
      heroVisualLiftPixels: _heroVisualLiftPixels,
    };
  }

  function _cloneEntity(e) {
    return {
      lat: e.lat, lng: e.lng, headingDeg: e.headingDeg,
      altitudeMeters: e.altitudeMeters, heroVisualLiftPixels: e.heroVisualLiftPixels,
    };
  }

  // Pushes the current _smoothedEntity (falling back to _currentEntity if
  // smoothing hasn't been seeded yet) to the renderer with itinerary's
  // allowFallback:false — no Hero Car substitute for a failed/unhealthy Orb.
  // ViewportLocationAuthority always receives the AUTHORITATIVE position
  // (_currentEntity), never the presentation-lagged one — weather/locality
  // targeting must stay exact even while the visible hero eases toward it.
  function _pushRenderSmoothed() {
    var entity = _smoothedEntity || _currentEntity;
    if (!entity) return;
    var renderer = global.SBE && SBE.HeroVehicleRenderer;
    var result = null;
    if (renderer && typeof renderer.update === 'function') {
      try { result = renderer.update(entity, { allowFallback: false }); } catch (e) {}
    }
    if (result && typeof result === 'object') {
      _visibleHeroKind = result.kind === 'orb' ? 'orb' : 'none';
      _presentationWarning = _visibleHeroKind === 'none' ? 'orb_unavailable' : null;
    }
    var vla = global.SBE && SBE.ViewportLocationAuthority;
    if (vla && typeof vla.setActorPosition === 'function' && _currentEntity) {
      vla.setActorPosition(_currentEntity.lat, _currentEntity.lng, 'itineraryRun');
    }
  }

  function _expFactor(k, dt) { return 1 - Math.exp(-k * dt); }

  // Eases _smoothedEntity toward _currentEntity. Uses REAL (unscaled by
  // playbackRate) dt by default — the smoothing represents a constant
  // real-world visual response time damping RAF-timing jitter and uneven
  // route-segment geometry, not a deliberate slow-motion effect; it must
  // still converge fast enough to look continuous at both 1x and 5x. Pass an
  // explicit dtOverride (test-only) to drive the lerp deterministically
  // without depending on real Date.now() deltas.
  function _advanceSmoothing(dtOverride) {
    if (!_currentEntity) return;
    var dt;
    if (typeof dtOverride === 'number') {
      dt = dtOverride;
    } else {
      var real = _now();
      dt = (_lastSmoothMs > 0) ? Math.min((real - _lastSmoothMs) / 1000, 0.1) : 0.016;
      _lastSmoothMs = real;
    }
    if (!_smoothedEntity) { _smoothedEntity = _cloneEntity(_currentEntity); return; }
    var pf = _expFactor(ACTOR_POS_SMOOTH_K, dt);
    _smoothedEntity.lat += (_currentEntity.lat - _smoothedEntity.lat) * pf;
    _smoothedEntity.lng += (_currentEntity.lng - _smoothedEntity.lng) * pf;
    // Shortest-arc heading lerp — never spins the long way at wraparound.
    var delta = (((_currentEntity.headingDeg - _smoothedEntity.headingDeg) + 540) % 360) - 180;
    var hf = _expFactor(ACTOR_HDG_SMOOTH_K, dt);
    _smoothedEntity.headingDeg = (_smoothedEntity.headingDeg + delta * hf + 360) % 360;
    // Presentation sliders are direct values, not motion — copied, never lerped.
    _smoothedEntity.altitudeMeters = _currentEntity.altitudeMeters;
    _smoothedEntity.heroVisualLiftPixels = _currentEntity.heroVisualLiftPixels;
  }

  // Read-only accessor for the presentation-smoothed entity — the SAME
  // target the camera-follow loop (itineraryRunAuthority.js) must damp
  // toward, so the camera and the visible hero move in lockstep. Deliberately
  // separate from getSnapshot(), which stays fully authoritative.
  function getPresentationEntity() {
    var e = _smoothedEntity || _currentEntity;
    return e ? _cloneEntity(e) : null;
  }

  function _sampleEntity(stage, stageProgress01) {
    _currentEntity = _computeEntityAt(stage, stageProgress01);
    _stageDistanceTraveledM = stageProgress01 * stage.distanceMeters;
  }

  function _complete() {
    _status = 'completed';
    _completedAt = new Date().toISOString();
    _stopRaf();
    // Deliberately NOT calling _clearActorPosition() or stopping the
    // renderer here — the final position must stay visible on completion,
    // per explicit correction. Snap smoothing exactly to the final
    // authoritative point and push once, so completion visibly settles
    // immediately rather than asymptotically approaching it.
    if (_currentEntity) {
      _smoothedEntity = _cloneEntity(_currentEntity);
      _pushRenderSmoothed();
    }
    console.log('[ItineraryRunController] itinerary run complete');
  }

  // Stage-boundary catch-up: loops (rather than checking once) so a single
  // tick after a long gap can cross several stages, carrying the overshoot
  // beyond each finished stage's duration forward into the next stage's
  // elapsed clock instead of discarding it.
  function _advanceAndSample() {
    if (!_payload) return;
    var stage = _payload.stages[_stageIndex];
    var stageDurationMs = Math.max(1, stage.durationSeconds * 1000);

    while (_stageBaseElapsedMs >= stageDurationMs) {
      var overshootMs = _stageBaseElapsedMs - stageDurationMs;
      _totalDistanceTraveledM += stage.distanceMeters;

      if (_stageIndex >= _payload.stages.length - 1) {
        _stageBaseElapsedMs = stageDurationMs;
        _sampleEntity(stage, 1);
        _complete();
        return;
      }

      _stageIndex += 1;
      _stageBaseElapsedMs = overshootMs; // carried forward, not reset to 0
      _stageDistanceTraveledM = 0;
      if (!_loadStageGeometry()) return; // may have set status='error'
      stage = _payload.stages[_stageIndex];
      stageDurationMs = Math.max(1, stage.durationSeconds * 1000);
    }

    var stageProgress01 = Math.min(1, _stageBaseElapsedMs / stageDurationMs);
    _sampleEntity(stage, stageProgress01);
  }

  // Applies a REAL (unscaled) millisecond delta — scales by the current
  // playback rate internally, banks it into both elapsed ledgers, then
  // re-checks stage boundaries. Shared by _settleClock() (real RAF ticks)
  // and __test.step() (deterministic manual advance).
  function _advanceByRealMs(deltaMs) {
    if (!_payload || deltaMs <= 0) return;
    var scaledMs = deltaMs * _speedMultiplier;
    _baseElapsedMs += scaledMs;
    _stageBaseElapsedMs += scaledMs;
    _advanceAndSample();
  }

  // Banks whatever real time has passed since the last checkpoint at the
  // CURRENT rate, then resets the checkpoint to now. Called on every RAF
  // tick, and explicitly before pause()/setPlaybackRate() so a rate change
  // never retroactively rescales time that already elapsed under the old
  // rate — this is what preserves exact position/elapsed on a live rate
  // change.
  function _settleClock() {
    if (_status !== 'running') return;
    var real = _now();
    var deltaMs = real - _checkpointRealMs;
    _checkpointRealMs = real;
    if (deltaMs > 0) _advanceByRealMs(deltaMs);
  }

  function _frame() {
    if (_status !== 'running') { _rafId = null; return; }
    _rafId = global.requestAnimationFrame(_frame);
    _settleClock();
    // _settleClock() may have completed the run mid-tick (_complete() already
    // did its own snap+push) — skip the redundant smoothing/render pass.
    if (_status === 'running') { _advanceSmoothing(); _pushRenderSmoothed(); }
  }

  // ── Public: lifecycle ──────────────────────────────────────────────────────
  function start(payload, speedMultiplier, heroAltitudeMeters, heroVisualLiftPixels) {
    if (!payload || !Array.isArray(payload.stages) || payload.stages.length === 0) {
      return { ok: false, reason: 'invalid_run_payload' };
    }
    // Ensure no other module is also driving HeroVehicleRenderer this frame —
    // confirmed safe/synchronous (heroVehicleRuntime.js's stop() cancels its
    // own RAF and clears _active before returning).
    var hvrt = global.SBE && SBE.HeroVehicleRuntime;
    if (hvrt && typeof hvrt.stop === 'function') { try { hvrt.stop(); } catch (e) {} }

    _resetRunState();
    _payload = payload;
    _lastPayload = payload;
    _speedMultiplier = _clampRate(speedMultiplier || 1);
    _heroAltitudeMeters = _clampAltitude(heroAltitudeMeters);
    _heroVisualLiftPixels = _clampVisualLift(heroVisualLiftPixels);
    _runId = 'run-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
    _startedAt = new Date().toISOString();
    _totalItineraryDistanceM = payload.stages.reduce(function (sum, s) { return sum + s.distanceMeters; }, 0);
    _totalItineraryDurationS = payload.stages.reduce(function (sum, s) { return sum + s.durationSeconds; }, 0);

    if (!_loadStageGeometry()) return { ok: false, reason: _errorCode || 'invalid_geometry' };

    // Build the full initial entity BEFORE activating the renderer, so the
    // very first frame already carries correct heading/altitude/lift instead
    // of snapping into place a frame later. Seed _smoothedEntity to the SAME
    // value — no spring-in pop from a stale/zero state.
    var stage0 = _payload.stages[_stageIndex];
    var initialEntity = _computeEntityAt(stage0, 0);
    _currentEntity = initialEntity;
    _smoothedEntity = _cloneEntity(initialEntity);
    _lastSmoothMs = 0;

    // ROOT FIX (0730E): activate the renderer. allowFallback:false (0805A) —
    // itinerary presentation never substitutes the legacy Hero Car.
    // 0805B — capture the real {visible,kind} result synchronously so
    // visibleHeroKind/presentationWarning are correct on the very first
    // snapshot, not stale defaults until the first RAF tick calls
    // _pushRenderSmoothed() a frame later (a real bug: a snapshot read
    // immediately after start() — exactly what the wall-side test harness
    // does — previously always saw 'none'/null regardless of Orb health).
    var renderer = global.SBE && SBE.HeroVehicleRenderer;
    if (renderer && typeof renderer.start === 'function') {
      try {
        var startResult = renderer.start(initialEntity, { allowFallback: false });
        if (startResult && typeof startResult === 'object') {
          _visibleHeroKind = startResult.kind === 'orb' ? 'orb' : 'none';
          _presentationWarning = _visibleHeroKind === 'none' ? 'orb_unavailable' : null;
        }
      } catch (e) {}
    }

    _status = 'running';
    _checkpointRealMs = _now();
    _rafId = global.requestAnimationFrame(_frame);
    console.log('[ItineraryRunController] started', _runId, '—', payload.stages.length, 'stages');
    return { ok: true, runId: _runId };
  }

  function pause() {
    if (_status !== 'running') return { ok: false, reason: 'not_running' };
    _settleClock();
    _status = 'paused';
    _pausedAt = new Date().toISOString();
    _stopRaf();
    // Settle presentation exactly on the paused position — exponential decay
    // never fully reaches its target on its own, so an explicit snap is
    // required for "settle cleanly and remain still."
    if (_currentEntity) {
      _smoothedEntity = _cloneEntity(_currentEntity);
      _pushRenderSmoothed();
    }
    return { ok: true };
  }

  function resume() {
    if (_status !== 'paused') return { ok: false, reason: 'not_paused' };
    _status = 'running';
    _pausedAt = null;
    _checkpointRealMs = _now(); // avoid crediting the paused interval as elapsed
    _lastSmoothMs = 0;          // avoid a smoothing dt spike from the paused interval
    _rafId = global.requestAnimationFrame(_frame);
    return { ok: true };
  }

  function stop() {
    _stopRaf();
    _status = 'idle';
    _resetRunState();
    _clearActorPosition();
    _stopRenderer();
    return { ok: true };
  }

  function restart() {
    if (!_lastPayload) return { ok: false, reason: 'invalid_run_payload' };
    var speed = _speedMultiplier;
    var altitude = _heroAltitudeMeters;
    var lift = _heroVisualLiftPixels;
    stop(); // clears actor position + deactivates renderer + resets state
    return start(_lastPayload, speed, altitude, lift);
  }

  // Full teardown (tab/lock release) — same effect as stop() for this module.
  function teardown() { return stop(); }

  function getStatus() { return _status; }

  // Live setter: rate is settled at the OLD value before changing, so
  // current position/accumulated elapsed time are preserved exactly — only
  // subsequent advancement uses the new rate.
  function setPlaybackRate(rate) {
    if (_status !== 'running' && _status !== 'paused') return { ok: false, reason: 'not_active' };
    _settleClock(); // no-op if paused (elapsed is already fixed as-of pause())
    _speedMultiplier = _clampRate(rate);
    return { ok: true, playbackRate: _speedMultiplier };
  }

  // Live setter: presentation-only, never touches distance/duration/progress/
  // heading. Pushes an immediate render update (even while paused) so a
  // slider drag is visible without requiring Resume.
  function setHeroAltitude(meters) {
    if (_status !== 'running' && _status !== 'paused') return { ok: false, reason: 'not_active' };
    _heroAltitudeMeters = _clampAltitude(meters);
    if (_currentEntity) {
      _currentEntity.altitudeMeters = _heroAltitudeMeters;
      if (_smoothedEntity) _smoothedEntity.altitudeMeters = _heroAltitudeMeters;
      _pushRenderSmoothed();
    }
    return { ok: true, heroAltitudeMeters: _heroAltitudeMeters };
  }

  // Live setter: a SEPARATE presentation-only offset from heroAltitudeMeters
  // (0805A diagnostic bridge) — never touches route geometry/progress/
  // duration/distance/heading/actor coordinates, applied only by the
  // renderer.
  function setHeroVisualLift(pixels) {
    if (_status !== 'running' && _status !== 'paused') return { ok: false, reason: 'not_active' };
    _heroVisualLiftPixels = _clampVisualLift(pixels);
    if (_currentEntity) {
      _currentEntity.heroVisualLiftPixels = _heroVisualLiftPixels;
      if (_smoothedEntity) _smoothedEntity.heroVisualLiftPixels = _heroVisualLiftPixels;
      _pushRenderSmoothed();
    }
    return { ok: true, heroVisualLiftPixels: _heroVisualLiftPixels };
  }

  function getSnapshot() {
    var stage = _payload ? _payload.stages[_stageIndex] : null;
    var stageDurationS = stage ? stage.durationSeconds : null;
    var stageProgress01 = stage ? Math.min(1, _stageBaseElapsedMs / Math.max(1, stageDurationS * 1000)) : 0;
    var distanceTraveled = _totalDistanceTraveledM + (stage ? _stageDistanceTraveledM : 0);
    var distanceRemaining = _payload ? Math.max(0, _totalItineraryDistanceM - distanceTraveled) : null;
    var itineraryProgress01 = _totalItineraryDistanceM > 0 ? Math.min(1, distanceTraveled / _totalItineraryDistanceM) : 0;
    var estimatedRemainingSeconds = _payload
      ? Math.max(0, _totalItineraryDurationS - _baseElapsedMs / 1000)
      : null;

    return {
      runId: _runId,
      itineraryId: _payload ? _payload.itineraryId : null,
      status: _status,
      stageId: stage ? stage.stageId : null,
      stageIndex: _stageIndex,
      stageCount: _payload ? _payload.stages.length : 0,
      stageProgress01: stageProgress01,
      itineraryProgress01: itineraryProgress01,
      elapsedSeconds: _baseElapsedMs / 1000,
      stageElapsedSeconds: _stageBaseElapsedMs / 1000,
      distanceTraveledMeters: distanceTraveled,
      distanceRemainingMeters: distanceRemaining,
      estimatedRemainingSeconds: estimatedRemainingSeconds,
      longitude: _currentEntity ? _currentEntity.lng : null,
      latitude: _currentEntity ? _currentEntity.lat : null,
      headingDeg: _currentEntity ? _currentEntity.headingDeg : null,
      altitudeMeters: _heroAltitudeMeters,
      heroVisualLiftPixels: _heroVisualLiftPixels,
      playbackRate: _speedMultiplier,
      visibleHeroKind: _visibleHeroKind,
      presentationWarning: _presentationWarning,
      startedAt: _startedAt,
      pausedAt: _pausedAt,
      completedAt: _completedAt,
      errorCode: _errorCode,
      errorMessage: _errorMessage,
    };
  }

  SBE.ItineraryRunController = Object.freeze({
    VERSION: VERSION,
    start: start,
    pause: pause,
    resume: resume,
    stop: stop,
    restart: restart,
    teardown: teardown,
    getStatus: getStatus,
    getSnapshot: getSnapshot,
    getPresentationEntity: getPresentationEntity,
    setPlaybackRate: setPlaybackRate,
    setHeroAltitude: setHeroAltitude,
    setHeroVisualLift: setHeroVisualLift,
    HERO_ALTITUDE_MIN_M: HERO_ALTITUDE_MIN_M,
    HERO_ALTITUDE_MAX_M: HERO_ALTITUDE_MAX_M,
    HERO_VISUAL_LIFT_MIN_PX: HERO_VISUAL_LIFT_MIN_PX,
    HERO_VISUAL_LIFT_MAX_PX: HERO_VISUAL_LIFT_MAX_PX,
    PLAYBACK_RATE_MIN: PLAYBACK_RATE_MIN,
    PLAYBACK_RATE_MAX: PLAYBACK_RATE_MAX,
    // Test-only — never used by the real RAF-driven path. Lets automated/
    // manual verification advance the simulation deterministically in
    // environments where requestAnimationFrame is throttled (e.g. a
    // backgrounded browser tab), without changing any production behavior.
    // Goes through the exact same _advanceByRealMs()/_advanceAndSample() path
    // real ticks use, so stage-boundary catch-up/overshoot-carry behavior is
    // identical, not a separate simulation. advanceSmoothing() drives the
    // presentation lerp with an EXPLICIT dt (bypassing real Date.now()
    // deltas), so smoothing convergence is deterministically testable.
    __test: {
      step: function (dtSeconds) {
        if (_status !== 'running') return;
        _advanceByRealMs(dtSeconds * 1000);
        _checkpointRealMs = _now();
        if (_status === 'running') { _advanceSmoothing(); _pushRenderSmoothed(); }
      },
      advanceSmoothing: function (dtSeconds) {
        _advanceSmoothing(dtSeconds);
        _pushRenderSmoothed();
      },
    },
  });

  console.log('[ItineraryRunController] v' + VERSION + ' loaded');

})(window);
