(function initPassengerDemo(global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  // ── Passenger Demo Controller (FirstPassengerDemo v1.0.0) ─────────────────────
  //
  // Orchestrates the five-phase WOS Passenger Mode demonstration.
  // Does NOT add new systems — it configures and sequences what already exists.
  //
  // Phases:
  //   calm        → 2–4 min  — wide drift, low pressure, no events
  //   emergence   → 2–5 min  — primary event injected, ecology signals rise
  //   investigation → 3–6 min — camera commits, optional secondary event
  //   peak        → 2–4 min  — full convergence, long linger
  //   release     → 2–4 min  — event decays, camera drifts away, city breathes
  //
  // Usage:
  //   SBE.PassengerDemo.init(state, performance.now())
  //   SBE.PassengerDemo.tick(state, dt, now)   — per-frame, in ecology block
  //   SBE.PassengerDemo.getStatus(state)        — current phase + timing

  // ── Phase definitions ─────────────────────────────────────────────────────────
  var PHASES = ["calm", "emergence", "investigation", "peak", "release"];

  // Minimum real milliseconds before a phase can advance
  var PHASE_MIN_DURATION_MS = {
    calm:          3 * 60 * 1000,   // 3 minutes
    emergence:     2 * 60 * 1000,   // 2 minutes
    investigation: 3 * 60 * 1000,   // 3 minutes
    peak:          2 * 60 * 1000,   // 2 minutes
    release:       2.5 * 60 * 1000, // 2.5 minutes
  };

  // Target phase durations (ideal midpoint — system breathes around these)
  var PHASE_TARGET_DURATION_MS = {
    calm:          3.5 * 60 * 1000,
    emergence:     3.5 * 60 * 1000,
    investigation: 4.5 * 60 * 1000,
    peak:          3.0 * 60 * 1000,
    release:       3.0 * 60 * 1000,
  };

  // ── Primary event — streetPerformance, Bushwick ────────────────────────────────
  var PRIMARY_EVENT = {
    type:       "streetPerformance",
    x:          1900,     // Bushwick center
    y:          320,
    districtId: "bushwick",
    maxStrength: 0.90,
  };

  // ── Secondary event — injected mid-investigation ───────────────────────────────
  // Nightlife spill nearby but offset from primary
  var SECONDARY_EVENT = {
    type:       "nightlifeSpill",
    x:          1620,
    y:          180,
    districtId: "bushwick",
    maxStrength: 0.78,
  };

  // ── Config accessor ────────────────────────────────────────────────────────────
  function _cfg(state) {
    return state.world && state.world.passengerDemo;
  }

  // ── Camera anchor finder ───────────────────────────────────────────────────────
  // Returns the best world-space point to frame on init.
  // Priority: highest-energy district → corridor midpoint → first district → hardcoded.
  function _findAnchor(state) {
    var DP  = global.SBE && SBE.DistrictPressure;
    var eco = state.world && state.world.ecology;

    // Priority 1: highest-energy district
    if (DP && eco && eco.pressure && eco.pressure.districts) {
      var best = null, bestE = -1;
      Object.values(DP.DISTRICTS).forEach(function (d) {
        var dp = eco.pressure.districts[d.id];
        var e  = dp ? dp.energy : 0;
        if (e > bestE) { bestE = e; best = d; }
      });
      if (best && bestE > 0.05) {
        console.log("[PassengerDemo] anchor → highest-energy district:", best.id, "energy:", bestE.toFixed(2));
        return { x: best.x, y: best.y };
      }
    }

    // Priority 2: corridor midpoint (williamsburg ↔ bushwick)
    if (DP) {
      var ds = Object.values(DP.DISTRICTS);
      var wburg  = DP.DISTRICTS.williamsburg;
      var bwick  = DP.DISTRICTS.bushwick;
      if (wburg && bwick) {
        console.log("[PassengerDemo] anchor → corridor midpoint (williamsburg–bushwick)");
        return { x: (wburg.x + bwick.x) / 2, y: (wburg.y + bwick.y) / 2 };
      }
      if (ds.length >= 2) {
        console.log("[PassengerDemo] anchor → generic corridor midpoint");
        return { x: (ds[0].x + ds[1].x) / 2, y: (ds[0].y + ds[1].y) / 2 };
      }
    }

    // Priority 3: first valid district
    if (DP) {
      var first = Object.values(DP.DISTRICTS)[0];
      if (first) {
        console.log("[PassengerDemo] anchor → first district:", first.id);
        return { x: first.x, y: first.y };
      }
    }

    // Priority 4: hardcoded safe staging (Bushwick)
    console.log("[PassengerDemo] anchor → hardcoded fallback (Bushwick area)");
    return { x: 1900, y: 320 };
  }

  // ── Init: configure world for demo ───────────────────────────────────────────
  function init(state, now) {
    console.log("[PassengerDemo] init() called — state:", state, "  state.world:", state && state.world);

    if (!state) {
      console.warn("[PassengerDemo] init failed: state is undefined or null");
      return;
    }
    if (!state.world) {
      console.warn("[PassengerDemo] init failed: state.world is undefined (got:", state.world, ")");
      return;
    }

    // ── Dependency presence report ────────────────────────────────────────────
    console.log("[PassengerDemo] dependency check:",
      "rhythm:",       !!state.world.rhythm,
      "cameraCuriosity:", !!state.world.cameraCuriosity,
      "clusterEvents:", !!state.world.clusterEvents,
      "actors:",       !!state.world.actors,
      "ecology:",      !!state.world.ecology,
      "camera:",       !!state.camera,
      "passengerDemo:", !!state.world.passengerDemo
    );

    // ── Time: dusk → night transition
    if (state.world.rhythm) {
      state.world.rhythm.currentTime = 19.5;
      state.world.rhythm.currentHour = 19.5;
    } else {
      console.warn("[PassengerDemo] init: state.world.rhythm missing — time not set");
    }

    // ── Camera bootstrap anchor: frame visible world content immediately ─────────
    // Priority: highest-energy district → corridor midpoint → first district → hardcoded
    var anchor = _findAnchor(state);
    var cam = state.camera;
    if (cam) {
      cam.x          = anchor.x;
      cam.y          = anchor.y;
      cam.targetX    = anchor.x;
      cam.targetY    = anchor.y;
      cam.zoom       = 0.18;
      cam.targetZoom = 0.18;
      console.log("[PassengerDemo] camera anchored to:", anchor);
    } else {
      console.warn("[PassengerDemo] init: state.camera missing — bootstrap anchor skipped");
    }

    // ── Camera curiosity: documentary passenger mode
    var cc = state.world.cameraCuriosity;
    if (!cc) {
      console.warn("[PassengerDemo] init: state.world.cameraCuriosity missing — passenger camera not configured");
    }
    if (cc) {
      cc.drivingCamera              = true;
      cc.passengerMode              = "documentary";
      cc.maxCameraVelocity          = 12;
      cc.zoomDeadzone               = 0.08;
      cc.targetPersistenceMultiplier = 1.40;
      cc.observeDriftRadius          = 28;
      cc.observeDriftSpeed           = 0.025;
      cc.releaseBlendTime            = 7.0;
      cc.debugDraw                   = true;
      cc.debugCameraTrail            = true;
      // Clear any prior state
      cc.state          = "idle";
      cc.currentTarget  = null;
      cc.currentScore   = 0;
      cc.recentTargets  = [];
      cc.reevaluateAt   = 0;
    }

    // ── Demo state
    var demo = _cfg(state);
    if (!demo) {
      console.warn("[PassengerDemo] init failed: state.world.passengerDemo is undefined (got:",
        state.world.passengerDemo, ") — was it initialized in main.js state?");
      return;
    }
    console.log("[PassengerDemo] demo block found — setting enabled=true");
    demo.enabled           = true;
    demo.phase             = "calm";
    demo.startedAt         = now;
    demo.phaseStartedAt    = now;
    demo._primaryInjected  = false;
    demo._secondaryInjected = false;
    demo._primaryEventId   = null;
    demo._phaseLabel       = "WOS — Passenger Mode";
    demo._phaseLabelAt     = now;
    demo.log               = [];
    demo.metrics           = { phase: "calm", phaseElapsed: 0, demoElapsed: 0 };

    _log(demo, now, "Demo initialized — calm drift phase beginning");
  }

  // ── Logging ────────────────────────────────────────────────────────────────────
  function _log(demo, now, msg) {
    var elapsed = now - (demo.startedAt || now);
    var mm = Math.floor(elapsed / 60000);
    var ss = Math.floor((elapsed % 60000) / 1000);
    demo.log.push({
      t: now,
      elapsed: elapsed,
      label: mm + ":" + (ss < 10 ? "0" + ss : ss) + "  " + msg,
    });
    // Keep last 100 entries
    if (demo.log.length > 100) demo.log.shift();
  }

  // ── Phase transition ───────────────────────────────────────────────────────────
  function _advancePhase(demo, state, now) {
    var idx = PHASES.indexOf(demo.phase);
    if (idx < 0 || idx >= PHASES.length - 1) {
      // After release: return to calm for looping
      demo.phase          = "calm";
      demo.phaseStartedAt = now;
      demo._primaryInjected   = false;
      demo._secondaryInjected = false;
      demo._primaryEventId    = null;
      _log(demo, now, "Loop: returning to calm drift");
      return;
    }
    var next = PHASES[idx + 1];
    demo.phase          = next;
    demo.phaseStartedAt = now;
    demo._phaseLabel    = _phaseLabel(next);
    demo._phaseLabelAt  = now;
    _log(demo, now, "Phase → " + next);
  }

  function _phaseLabel(phase) {
    var labels = {
      calm:          "",                      // calm has no on-screen label — silence is intentional
      emergence:     "",                      // barely perceptible
      investigation: "",
      peak:          "",
      release:       "",
    };
    return labels[phase] || "";
  }

  // ── Phase elapsed ──────────────────────────────────────────────────────────────
  function _phaseElapsed(demo, now) {
    return now - (demo.phaseStartedAt || now);
  }

  // ── Read ecology signals ───────────────────────────────────────────────────────
  function _ecoSignals(state) {
    var eco = state.world && state.world.ecology;
    var me  = eco && eco.musicEcology;
    var cc  = state.world && state.world.cameraCuriosity;
    return {
      cityEnergy:    (state.world.rhythm && state.world.rhythm.metrics && state.world.rhythm.metrics.cityEnergy) || 0,
      clusterEnergy: (me && me._clusterEnergy)  || 0,
      cameraState:   cc ? cc.state : "idle",
      activePeak:    _anyPeakEvent(state),
      activeEvents:  _countActiveEvents(state),
    };
  }

  function _anyPeakEvent(state) {
    var events = (state.world.clusterEvents && state.world.clusterEvents.events) || [];
    return events.some(function (ev) { return ev.state === "peak"; });
  }

  function _countActiveEvents(state) {
    var events = (state.world.clusterEvents && state.world.clusterEvents.events) || [];
    return events.filter(function (ev) { return ev.state !== "dissolve"; }).length;
  }

  function _primaryEventAlive(demo, state) {
    if (!demo._primaryEventId) return false;
    var events = (state.world.clusterEvents && state.world.clusterEvents.events) || [];
    return events.some(function (ev) {
      return ev.id === demo._primaryEventId && ev.state !== "dissolve";
    });
  }

  // ── Inject primary event ───────────────────────────────────────────────────────
  function _injectPrimary(demo, state, now) {
    if (!SBE.ClusterEvents) return;
    var ev = SBE.ClusterEvents.spawn(
      PRIMARY_EVENT.type,
      {
        x:           PRIMARY_EVENT.x,
        y:           PRIMARY_EVENT.y,
        districtId:  PRIMARY_EVENT.districtId,
        maxStrength: PRIMARY_EVENT.maxStrength,
      },
      now
    );
    if (!ev) return;
    state.world.clusterEvents.events.push(ev);
    demo._primaryEventId  = ev.id;
    demo._primaryInjected = true;
    _log(demo, now, "Primary event injected: " + PRIMARY_EVENT.type + " @ Bushwick");
  }

  // ── Inject secondary event ─────────────────────────────────────────────────────
  function _injectSecondary(demo, state, now) {
    if (!SBE.ClusterEvents) return;
    var ev = SBE.ClusterEvents.spawn(
      SECONDARY_EVENT.type,
      {
        x:           SECONDARY_EVENT.x,
        y:           SECONDARY_EVENT.y,
        districtId:  SECONDARY_EVENT.districtId,
        maxStrength: SECONDARY_EVENT.maxStrength,
      },
      now
    );
    if (!ev) return;
    state.world.clusterEvents.events.push(ev);
    demo._secondaryInjected = true;
    _log(demo, now, "Secondary event injected: " + SECONDARY_EVENT.type);
  }

  // ── Main tick ─────────────────────────────────────────────────────────────────
  function tick(state, dt, now) {
    var demo = _cfg(state);
    if (!demo || !demo.enabled) return;

    var elapsed = _phaseElapsed(demo, now);
    var min     = PHASE_MIN_DURATION_MS[demo.phase] || 60000;
    var target  = PHASE_TARGET_DURATION_MS[demo.phase] || 180000;
    var sig     = _ecoSignals(state);

    if (!demo.metrics) demo.metrics = { phase: "calm", phaseElapsed: 0, demoElapsed: 0 };
    demo.metrics.phase        = demo.phase;
    demo.metrics.phaseElapsed = elapsed / 1000;
    demo.metrics.demoElapsed  = (now - demo.startedAt) / 1000;

    switch (demo.phase) {

      // ── Phase 1: Calm — wide drift, no events, let the world breathe ─────────
      case "calm":
        // Advance to emergence after minimum time
        if (elapsed >= min) {
          _advancePhase(demo, state, now);
        }
        break;

      // ── Phase 2: Emergence — inject primary event, camera begins to notice ───
      case "emergence":
        // Inject primary event at the start of this phase
        if (!demo._primaryInjected) {
          _injectPrimary(demo, state, now);
        }
        // Advance to investigation when:
        // - minimum time passed AND
        // - camera has noticed something (curious or investigate state)
        var cameraNoticed = sig.cameraState === "curious" ||
                            sig.cameraState === "investigate" ||
                            sig.cameraState === "observe";
        if (elapsed >= min && cameraNoticed) {
          _advancePhase(demo, state, now);
        } else if (elapsed >= target * 1.5) {
          // Hard advance if camera hasn't noticed — event may need more time
          _advancePhase(demo, state, now);
        }
        break;

      // ── Phase 3: Investigation — camera commits; optional secondary injection ─
      case "investigation":
        // Inject secondary after camera is observing AND 90s have passed
        if (!demo._secondaryInjected && elapsed >= 90000 &&
            (sig.cameraState === "observe" || sig.cameraState === "investigate")) {
          _injectSecondary(demo, state, now);
        }
        // Advance to peak when an event reaches peak state
        if (elapsed >= min && sig.activePeak) {
          _advancePhase(demo, state, now);
        } else if (elapsed >= target * 1.4) {
          _advancePhase(demo, state, now);
        }
        break;

      // ── Phase 4: Peak — maximum convergence, long camera linger ──────────────
      case "peak":
        // Stay in peak while any event is at peak and within target duration
        if (elapsed >= min && !sig.activePeak) {
          _advancePhase(demo, state, now);
        } else if (elapsed >= target * 1.5) {
          _advancePhase(demo, state, now);
        }
        break;

      // ── Phase 5: Release — events decay, camera drifts, city breathes ────────
      case "release":
        // Advance when primary event is gone and minimum time passed
        var primaryGone = !_primaryEventAlive(demo, state);
        if (elapsed >= min && primaryGone) {
          _advancePhase(demo, state, now);
        } else if (elapsed >= target * 1.4) {
          _advancePhase(demo, state, now);
        }
        break;
    }
  }

  // ── Status API ────────────────────────────────────────────────────────────────
  function getStatus(state) {
    var demo = _cfg(state);
    if (!demo) return { enabled: false };
    return {
      enabled:        demo.enabled,
      phase:          demo.phase,
      phaseElapsed:   demo.metrics.phaseElapsed,
      demoElapsed:    demo.metrics.demoElapsed,
      primaryLive:    _primaryEventAlive(demo, state),
      secondaryDone:  demo._secondaryInjected,
      recentLog:      (demo.log || []).slice(-10).map(function (e) { return e.label; }),
    };
  }

  // ── Public API ────────────────────────────────────────────────────────────────
  SBE.PassengerDemo = {
    init:      init,
    tick:      tick,
    getStatus: getStatus,
    PHASES:    PHASES,
  };

})(window);
