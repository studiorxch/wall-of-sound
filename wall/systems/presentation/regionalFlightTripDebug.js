// ── RegionalFlightTripDebug v1.4.0 ────────────────────────────────────────────
// 0528K_WOS_RegionalFlightTripRuntime_v1.0.0 — debug companion
// 0528N_WOS_RegionalFlightPresencePass_v1.0.0 — presence commands added
// 0528O_WOS_RegionalFlightPlanner_v1.0.0 — planner commands added
// 0528P_WOS_RegionalFlightCameraSmoothing_v1.0.0 — camera rig commands added
// 0528T_WOS_SurfaceGlideWatchabilityProfile_v1.0.0 — surfaceGlide(), profile() extended
// Status: active
// Classification: debug-companion — do NOT load in production
//
// Binds _wos.debug.regionalFlight with:
//   start(presetId?)  — start a regional flight trip
//   stop()            — stop and remove trip aircraft
//   pause()           — pause trip progression
//   resume()          — resume from pause
//   reset()           — stop and restart from beginning
//   speed(mult)       — set time acceleration (e.g. 60 = 2 hrs in 2 min)
//   status()          — compact status line
//   camera(bool)      — enable/disable camera follow
//   preset(id)        — switch and start a preset
//   jump(progress)    — jump to normalized progress 0–1 (e.g. 0.5 = mid-cruise)
//   audit()           — full system state report
//   presence(bool)    — toggle atmospheric presence halo
//   contrails(bool)   — toggle geographic contrail
//   lights(bool)      — toggle distance nav light blink
//   visibility()      — print presence state snapshot
//
// Traversal profiles (0528T):
//   profile('surface_glide') — low-altitude surface skim (50m, street/water level)
//   profile('regional')      — standard airport arc (climb/cruise/descent)
//   surfaceGlide(bool)       — shorthand toggle for surface_glide profile
//
// Planner commands (0528O):
//   planner()         — print planner state
//   airports()        — list available airports
//   origin(id)        — set origin airport
//   destination(id)   — set destination airport
//   pin(lat,lng,lbl)  — pin a coordinate destination
//   profile(id)       — set route profile (direct | scenic_coastal | skyline_approach)
//   plan()            — generate route from origin → destination
//   preview()         — show route preview overlay
//   clearPreview()    — remove route preview
//   startPlan()       — start the generated trip
//
// Placement: wall/systems/presentation/regionalFlightTripDebug.js
// Load: AFTER main.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  global._wos       = global._wos       || {};
  global._wos.debug = global._wos.debug || {};

  var VERSION = '1.4.0';

  function _rt()  { return global.SBE && global.SBE.RegionalFlightTripRuntime; }
  function _art() { return global.SBE && global.SBE.AircraftRuntime; }

  function _pad(s, w) {
    s = String(s);
    while (s.length < w) s += ' ';
    return s;
  }

  // ── start(presetId?) ──────────────────────────────────────────────────────────

  function start(presetId) {
    var rt = _rt();
    if (!rt) { console.warn('[RegionalFlightTripDebug] RegionalFlightTripRuntime not loaded'); return; }
    var ok = rt.start(presetId);
    if (ok) {
      console.log('[RegionalFlightTripDebug] trip started — use .speed(60) to test in ~2 min');
      console.log('  .speed(60)  .jump(0.5)  .camera(true)  .status()  .audit()');
    }
    return ok;
  }

  // ── stop() ────────────────────────────────────────────────────────────────────

  function stop() {
    var rt = _rt();
    if (!rt) { console.warn('[RegionalFlightTripDebug] RegionalFlightTripRuntime not loaded'); return; }
    rt.stop();
  }

  // ── pause() ───────────────────────────────────────────────────────────────────

  function pause() {
    var rt = _rt();
    if (!rt) return;
    rt.pause();
  }

  // ── resume() ──────────────────────────────────────────────────────────────────

  function resume() {
    var rt = _rt();
    if (!rt) return;
    rt.resume();
  }

  // ── reset() ───────────────────────────────────────────────────────────────────

  function reset() {
    var rt = _rt();
    if (!rt) return;
    rt.reset();
    console.log('[RegionalFlightTripDebug] trip reset to beginning');
  }

  // ── speed(multiplier) ─────────────────────────────────────────────────────────
  // 1.0 = real time (2 hours)
  // 60  = 2 hours in 2 minutes
  // 120 = 2 hours in 1 minute

  function speed(mult) {
    var rt = _rt();
    if (!rt) return;
    if (mult === undefined) {
      var s = rt.getState();
      console.log('[RegionalFlightTripDebug] speed:', s.speedMultiplier + 'x',
        '(options: .speed(1) = realtime · .speed(60) = 2min · .speed(120) = 1min)');
      return s.speedMultiplier;
    }
    rt.setSpeed(mult);
  }

  // ── status() ──────────────────────────────────────────────────────────────────

  function status() {
    var rt = _rt();
    if (!rt) { console.warn('[RegionalFlightTripDebug] RegionalFlightTripRuntime not loaded'); return; }
    var s = rt.getState();

    var bar = '';
    var barLen = 40;
    var filled = Math.round(s.progress * barLen);
    for (var i = 0; i < barLen; i++) bar += i < filled ? '█' : '░';

    console.group('[RegionalFlightTripDebug] status()');
    console.log('preset   :', s.presetId || '—');
    console.log('active   :', s.active, s.paused ? '(PAUSED)' : '');
    console.log('phase    :', s.tripPhase);
    console.log('progress :', '[' + bar + '] ' + s.progressPct + '%');
    console.log('elapsed  :', Math.round(s.elapsedMs / 1000) + 's / ' +
                              Math.round(s.durationMs / 60000) + 'min');
    console.log('speed    :', s.speedMultiplier + 'x');
    console.log('camera   :', s.cameraFollowEnabled ? 'ON' : 'OFF');
    if (s.current) {
      console.log('position :', s.current.lat + ', ' + s.current.lng +
                               ' hdg ' + s.current.headingDeg + '°');
      console.log('altitude :', s.current.altitudeFt + 'ft  (' +
                               (s.current.altitudeScalar * 100).toFixed(1) + '%)');
      console.log('speed    :', s.current.groundSpeedKts + 'kts · ' +
                               s.current.lifecycleState);
    }
    console.groupEnd();
    return s;
  }

  // ── camera(bool) ──────────────────────────────────────────────────────────────

  function camera(enabled) {
    var rt = _rt();
    if (!rt) return;
    if (enabled === undefined) {
      var s = rt.getState();
      console.log('[RegionalFlightTripDebug] camera follow:', s.cameraFollowEnabled ? 'ON' : 'OFF');
      return s.cameraFollowEnabled;
    }
    rt.setCamera(!!enabled);
    return !!enabled;
  }

  // ── preset(id) ────────────────────────────────────────────────────────────────

  function preset(id) {
    var rt = _rt();
    if (!rt) return;
    if (!id) {
      var presets = rt.PRESETS;
      console.group('[RegionalFlightTripDebug] available presets');
      Object.keys(presets).forEach(function (k) {
        console.log(k, '→', presets[k].label,
          '(' + Math.round(presets[k].durationMs / 60000) + 'min)');
      });
      console.groupEnd();
      return;
    }
    rt.setPreset(id);
  }

  // ── jump(progress) ────────────────────────────────────────────────────────────
  // Jump to normalized progress 0–1.
  // Key reference points:
  //   0.00 = PREPARE (origin)
  //   0.09 = TAKEOFF begin
  //   0.24 = CRUISE begin
  //   0.50 = mid-cruise
  //   0.76 = DESCENT begin
  //   0.94 = ARRIVAL begin
  //   1.00 = destination

  function jump(progress) {
    var rt = _rt();
    if (!rt) return;
    if (progress === undefined) {
      console.log('[RegionalFlightTripDebug] jump(p) — jump to normalized progress 0–1');
      console.log('  0.00 = PREPARE  |  0.09 = TAKEOFF  |  0.24 = CRUISE');
      console.log('  0.50 = mid-cruise  |  0.76 = DESCENT  |  0.94 = ARRIVAL');
      return;
    }
    rt.jump(Number(progress));
  }

  // ── presence(bool) ────────────────────────────────────────────────────────────

  function presence(val) {
    var ar = global.SBE && global.SBE.AircraftRenderer;
    if (!ar) { console.warn('[RegionalFlightTripDebug] AircraftRenderer not loaded'); return; }
    if (val === undefined) {
      console.log('[RegionalFlightTripDebug] presence:', ar.getPresence() ? 'ON' : 'OFF');
      return ar.getPresence();
    }
    ar.setPresence(!!val);
    return !!val;
  }

  // ── contrails(bool) ───────────────────────────────────────────────────────────

  function contrails(val) {
    var ar = global.SBE && global.SBE.AircraftRenderer;
    if (!ar) { console.warn('[RegionalFlightTripDebug] AircraftRenderer not loaded'); return; }
    if (val === undefined) {
      console.log('[RegionalFlightTripDebug] contrails:', ar.getContrails() ? 'ON' : 'OFF');
      return ar.getContrails();
    }
    ar.setContrails(!!val);
    return !!val;
  }

  // ── lights(bool) ──────────────────────────────────────────────────────────────

  function lights(val) {
    var ar = global.SBE && global.SBE.AircraftRenderer;
    if (!ar) { console.warn('[RegionalFlightTripDebug] AircraftRenderer not loaded'); return; }
    if (val === undefined) {
      console.log('[RegionalFlightTripDebug] lights:', ar.getLights() ? 'ON' : 'OFF');
      return ar.getLights();
    }
    ar.setLights(!!val);
    return !!val;
  }

  // ── visibility() ──────────────────────────────────────────────────────────────

  function visibility() {
    var ar = global.SBE && global.SBE.AircraftRenderer;
    if (!ar) { console.warn('[RegionalFlightTripDebug] AircraftRenderer not loaded'); return; }
    return ar.getPresenceSnapshot();
  }

  // ── audit() ───────────────────────────────────────────────────────────────────

  function audit() {
    var rt  = _rt();
    var art = _art();

    console.group('[RegionalFlightTripDebug] audit()');

    console.log('── Runtime ────────────────────────────────────────');
    console.log('RegionalFlightTripRuntime:', !!rt, rt ? 'v' + rt.VERSION : '');
    console.log('AircraftRuntime          :', !!art, art ? 'v' + art.VERSION : '');
    console.log('AircraftRenderer         :', !!(global.SBE && global.SBE.AircraftRenderer));
    console.log('CloudAtmosphereLayer     :', !!(global.SBE && global.SBE.CloudAtmosphereLayer));
    console.log('AltitudeAwareWorldRenderer:', !!(global.SBE && global.SBE.AltitudeAwareWorldRenderer));

    if (!rt) { console.groupEnd(); return; }

    var s = rt.getState();
    console.log('');
    console.log('── Trip State ─────────────────────────────────────');
    console.log('preset          :', s.presetId || '—');
    console.log('active          :', s.active);
    console.log('paused          :', s.paused);
    console.log('tripPhase       :', s.tripPhase);
    console.log('progress        :', s.progressPct + '%');
    console.log('elapsed         :', Math.round(s.elapsedMs / 1000) + 's of ' +
                                     Math.round(s.durationMs / 60000) + 'min');
    console.log('speedMultiplier :', s.speedMultiplier + 'x');
    console.log('cameraFollow    :', s.cameraFollowEnabled);

    if (s.current) {
      console.log('');
      console.log('── Aircraft ───────────────────────────────────────');
      console.log('id              :', s.aircraftId);
      console.log('lifecycleState  :', s.current.lifecycleState);
      console.log('altitudeFt      :', s.current.altitudeFt + 'ft');
      console.log('altitudeScalar  :', s.current.altitudeScalar);
      console.log('groundSpeedKts  :', s.current.groundSpeedKts + 'kts');
      console.log('heading         :', s.current.headingDeg + '°');
      console.log('lat / lng       :', s.current.lat + ' / ' + s.current.lng);
    }

    // Altitude world renderer
    var awr = global.SBE && global.SBE.AltitudeAwareWorldRenderer;
    if (awr) {
      console.log('');
      console.log('── Altitude World ─────────────────────────────────');
      var lead = awr.getLeadAircraft();
      console.log('lead aircraft   :', lead ? lead.callsign + ' (' + lead.lifecycleState + ')' : 'none');
      if (lead) console.log('altitude band   :', awr.resolveAltitudeBand(lead));
    }

    // Cloud state
    var cloud = global.SBE && global.SBE.CloudAtmosphereLayer;
    if (cloud) {
      console.log('');
      console.log('── Cloud ──────────────────────────────────────────');
      var cs = cloud.getState();
      console.log('enabled         :', cs.enabled);
      console.log('preset          :', cs.presetId);
    }

    console.groupEnd();
  }

  // ── Camera rig helpers ────────────────────────────────────────────────────────

  function _rig() { return global.SBE && global.SBE.RegionalFlightCameraRig; }

  // ── cameraRig(bool) ───────────────────────────────────────────────────────────

  function cameraRig(val) {
    var rig = _rig();
    if (!rig) { console.warn('[RegionalFlightTripDebug] RegionalFlightCameraRig not loaded'); return; }
    if (val === undefined) {
      var on = rig.getEnabled();
      console.log('[RegionalFlightTripDebug] cameraRig:', on ? 'ON' : 'OFF');
      return on;
    }
    rig.setEnabled(!!val);
    return !!val;
  }

  // ── cameraRigState() ──────────────────────────────────────────────────────────

  function cameraRigState() {
    var rig = _rig();
    if (!rig) { console.warn('[RegionalFlightTripDebug] RegionalFlightCameraRig not loaded'); return; }
    var s = rig.getState();
    console.group('[RegionalFlightTripDebug] cameraRigState()');
    console.log('enabled       :', s.enabled);
    console.log('profile       :', s.profile);
    console.log('smoothingMult :', s.smoothingMult + 'x');
    console.log('');
    console.log('desired');
    console.log('  phase       :', s.desired.phase, '  alt:', (s.desired.altScalar * 100).toFixed(1) + '%');
    console.log('  center      :', s.desired.lat + ', ' + s.desired.lng);
    console.log('  zoom        :', s.desired.zoom);
    console.log('  pitch       :', s.desired.pitch + '°');
    console.log('  bearing     :', s.desired.bearing + '°');
    console.log('');
    console.log('smoothed');
    console.log('  center      :', s.smoothed.lat + ', ' + s.smoothed.lng);
    console.log('  zoom        :', s.smoothed.zoom);
    console.log('  pitch       :', s.smoothed.pitch + '°');
    console.log('  bearing     :', s.smoothed.bearing + '°');
    console.log('');
    console.log('lag');
    console.log('  zoom diff   :', s.lag.zoomDiff);
    console.log('  pitch diff  :', s.lag.pitchDiff + '°');
    console.groupEnd();
    return s;
  }

  // ── cameraSmooth(mult) ────────────────────────────────────────────────────────
  // mult < 1 = dreamier/slower, mult > 1 = snappier

  function cameraSmooth(mult) {
    var rig = _rig();
    if (!rig) { console.warn('[RegionalFlightTripDebug] RegionalFlightCameraRig not loaded'); return; }
    if (mult === undefined) {
      console.log('[RegionalFlightTripDebug] cameraSmooth:', rig.getSmoothing() + 'x',
        '(0.5 = dreamier · 1.0 = default · 2.0 = snappier)');
      return rig.getSmoothing();
    }
    rig.setSmoothing(Number(mult));
  }

  // ── cameraSnap() ──────────────────────────────────────────────────────────────

  function cameraSnap() {
    var rig = _rig();
    if (!rig) { console.warn('[RegionalFlightTripDebug] RegionalFlightCameraRig not loaded'); return; }
    rig.snapToCurrent();
  }

  // ── Planner helpers ───────────────────────────────────────────────────────────

  function _planner() {
    return global.SBE && global.SBE.RegionalFlightPlanner;
  }

  // ── planner() ─────────────────────────────────────────────────────────────────

  function planner() {
    var p = _planner();
    if (!p) { console.warn('[RegionalFlightTripDebug] RegionalFlightPlanner not loaded'); return; }
    var s = p.getState();
    console.group('[RegionalFlightTripDebug] planner()');
    console.log('origin      :', s.origin        || '(none)');
    console.log('destination :', s.destination   || '(none)');
    console.log('profile     :', s.profile);
    console.log('plan        :', s.planGenerated ? s.planLabel : '(none)');
    if (s.planGenerated) {
      console.log('  distance  :', s.planDistKm + 'km');
      console.log('  duration  :', s.planDurationMin + 'min');
      console.log('  altitude  :', s.planAltFt + 'ft');
    }
    console.log('preview     :', s.previewVisible ? 'ON' : 'OFF');
    console.log('');
    console.log('Quick flow: .origin("JFK") → .destination("BOS") → .plan() → .preview() → .startPlan()');
    console.groupEnd();
    return s;
  }

  // ── airports() ────────────────────────────────────────────────────────────────

  function airports() {
    var p = _planner();
    if (!p) { console.warn('[RegionalFlightTripDebug] RegionalFlightPlanner not loaded'); return; }
    var list = p.listAirports();
    console.group('[RegionalFlightTripDebug] airports() — ' + list.length + ' available');
    list.forEach(function (ap) {
      console.log(_pad(ap.id, 5), ap.label, '  ' + ap.city);
    });
    console.groupEnd();
    return list;
  }

  // ── origin(id) ────────────────────────────────────────────────────────────────

  function origin(id) {
    var p = _planner();
    if (!p) { console.warn('[RegionalFlightTripDebug] RegionalFlightPlanner not loaded'); return; }
    if (!id) {
      var cur = p.getOriginAirport();
      console.log('[RegionalFlightTripDebug] origin:', cur ? cur.id + ' (' + cur.label + ')' : '(none)');
      return cur;
    }
    return p.setOriginAirport(id);
  }

  // ── destination(id) ───────────────────────────────────────────────────────────

  function destination(id) {
    var p = _planner();
    if (!p) { console.warn('[RegionalFlightTripDebug] RegionalFlightPlanner not loaded'); return; }
    if (!id) {
      var cur = p.getDestination();
      console.log('[RegionalFlightTripDebug] destination:', cur ? (cur.id || cur.label) : '(none)');
      return cur;
    }
    var ap = p.getAirport(id);
    if (!ap) {
      console.warn('[RegionalFlightTripDebug] unknown airport:', id, '— use .airports() to list');
      return false;
    }
    p.pinDestination(ap);
    return true;
  }

  // ── pin(lat, lng, label) ──────────────────────────────────────────────────────

  function pin(lat, lng, label) {
    var p = _planner();
    if (!p) { console.warn('[RegionalFlightTripDebug] RegionalFlightPlanner not loaded'); return; }
    return p.pinDestination({ lat: lat, lng: lng, label: label });
  }

  // ── _TRAVERSAL_PROFILE_IDS ────────────────────────────────────────────────────
  // Traversal profiles live on the TripRuntime; route profiles live on the Planner.
  // profile(id) routes to the right system based on which ID is passed.

  var _TRAVERSAL_PROFILE_IDS = { regional: true, surface_glide: true };

  // ── _applyTraversalProfile(id) ────────────────────────────────────────────────

  function _applyTraversalProfile(id) {
    var rt  = _rt();
    var rig = _rig();
    if (!rt) { console.warn('[RegionalFlightTripDebug] RegionalFlightTripRuntime not loaded'); return false; }

    var ok = rt.setTraversalProfile(id);
    if (!ok) return false;

    // Mirror camera profile on rig
    if (rig) {
      rig.setProfile(id === 'surface_glide' ? 'surface_glide' : 'regional_observer_smooth');
    }

    // In surface_glide: turn contrails off (altScalar ~0.05 — below 0.62 eligibility anyway,
    // but make it explicit so the debug state is unambiguous)
    var rdr = global.SBE && global.SBE.AircraftSkyResidueRenderer;
    if (rdr) {
      rdr.setContrails(id !== 'surface_glide');
      console.log('[RegionalFlightTripDebug] contrails', id === 'surface_glide' ? 'OFF (surface_glide)' : 'restored');
    }

    return true;
  }

  // ── profile(id) ───────────────────────────────────────────────────────────────
  // Routes to traversal profile (surface_glide | regional) or planner route profile.

  function profile(id) {
    // No arg: print both traversal and planner profiles
    if (!id) {
      var rt = _rt();
      if (rt) {
        var cur = rt.getTraversalProfile();
        var tps = rt.TRAVERSAL_PROFILES || {};
        console.group('[RegionalFlightTripDebug] traversal profiles');
        Object.keys(tps).forEach(function (k) {
          console.log((k === cur ? '▶ ' : '  ') + _pad(k, 16), tps[k].label);
        });
        console.groupEnd();
      }
      var p = _planner();
      if (p) {
        var pcur = p.getProfile();
        var prs  = p.PROFILES;
        console.group('[RegionalFlightTripDebug] route profiles (planner)');
        Object.keys(prs).forEach(function (k) {
          console.log((k === pcur ? '▶ ' : '  ') + _pad(k, 22), prs[k].description);
        });
        console.groupEnd();
      }
      return;
    }

    // Traversal profile — route to TripRuntime
    if (_TRAVERSAL_PROFILE_IDS[id]) {
      return _applyTraversalProfile(id);
    }

    // Route profile — route to Planner
    var p = _planner();
    if (!p) { console.warn('[RegionalFlightTripDebug] RegionalFlightPlanner not loaded'); return; }
    p.setProfile(id);
  }

  // ── surfaceGlide(bool?) ───────────────────────────────────────────────────────
  // Shorthand toggle. surfaceGlide(true) sets surface_glide profile + recommended settings.
  // surfaceGlide(false) restores regional profile.
  // surfaceGlide() — read current state.

  function surfaceGlide(val) {
    var rt = _rt();
    if (!rt) { console.warn('[RegionalFlightTripDebug] RegionalFlightTripRuntime not loaded'); return; }

    if (val === undefined) {
      var cur = rt.getTraversalProfile();
      console.log('[RegionalFlightTripDebug] surfaceGlide:', cur === 'surface_glide' ? 'ON' : 'OFF',
        '— current traversal profile:', cur);
      return cur === 'surface_glide';
    }

    var targetId = !!val ? 'surface_glide' : 'regional';
    var ok = _applyTraversalProfile(targetId);

    if (ok && !!val) {
      console.log('[RegionalFlightTripDebug] surface glide ON');
      console.log('  Recommended: .speed(1)  .cameraRig(true)');
      console.log('  Camera: zoom ~16.8  pitch ~68°  lookahead 120m');
      console.log('  Altitude: 200ft (~60m)  altScalar: 0.05');
      console.log('  Contrails: OFF (below eligibility threshold)');
    } else if (ok) {
      console.log('[RegionalFlightTripDebug] surface glide OFF — regional arc restored');
    }

    return !!val;
  }

  // ── plan() ────────────────────────────────────────────────────────────────────

  function plan() {
    var p = _planner();
    if (!p) { console.warn('[RegionalFlightTripDebug] RegionalFlightPlanner not loaded'); return; }
    var generated = p.generatePlan();
    if (generated) {
      console.log('[RegionalFlightTripDebug] plan ready — use .preview() to visualize, .startPlan() to fly');
    }
    return generated;
  }

  // ── preview() ────────────────────────────────────────────────────────────────

  function preview() {
    var p = _planner();
    if (!p) { console.warn('[RegionalFlightTripDebug] RegionalFlightPlanner not loaded'); return; }
    p.previewPlan();
  }

  // ── clearPreview() ────────────────────────────────────────────────────────────

  function clearPreview() {
    var p = _planner();
    if (!p) { console.warn('[RegionalFlightTripDebug] RegionalFlightPlanner not loaded'); return; }
    p.clearPreview();
    console.log('[RegionalFlightTripDebug] preview cleared');
  }

  // ── startPlan() ───────────────────────────────────────────────────────────────

  function startPlan() {
    var p = _planner();
    if (!p) { console.warn('[RegionalFlightTripDebug] RegionalFlightPlanner not loaded'); return; }
    var ok = p.startPlan();
    if (ok) {
      console.log('[RegionalFlightTripDebug] plan started — use .speed(60) .camera(true) .jump(0.5)');
    }
    return ok;
  }

  // ── motion() — live motion diagnostic ────────────────────────────────────────
  // Returns the current motion state of the trip: active, progress rate, phase,
  // loop flag, and whether the camera is following.
  // If progress is stuck (lastProgressDelta ≈ 0 while active), speed is the cause.

  function motion() {
    var rt = global.SBE && SBE.RegionalFlightTripRuntime;
    if (!rt) {
      console.warn('[RegionalFlightTripDebug] RegionalFlightTripRuntime not loaded');
      return {};
    }
    var s = rt.getState();
    var pm = s.presetMeta || {};

    // Theoretical progress per second at current speed
    var progressPerSec = s.durationMs > 0
      ? (s.speedMultiplier / s.durationMs) * 1000
      : 0;
    var etaMinutes = progressPerSec > 0
      ? Math.round((1 - s.progress) / progressPerSec / 60 * 10) / 10
      : null;

    var result = {
      active:             s.active,
      paused:             s.paused,
      progress:           s.progress,
      progressPct:        s.progressPct,
      speedMultiplier:    s.speedMultiplier,
      phase:              s.tripPhase,
      lastProgressDelta:  s.lastProgressDelta,
      loop:               !!pm.loop,
      cameraFollowEnabled: s.cameraFollowEnabled,
      cameraMode:         pm.cameraMode || null,
    };

    console.group('[RegionalFlightTripDebug] motion()');
    console.log('active        :', result.active);
    console.log('paused        :', result.paused);
    console.log('progress      :', (result.progressPct || 0).toFixed(2) + '%');
    console.log('speedMult     :', result.speedMultiplier + 'x');
    console.log('phase         :', result.phase);
    console.log('δprogress/tick:', result.lastProgressDelta
      ? (result.lastProgressDelta * 1e6).toFixed(3) + ' × 10⁻⁶'
      : '0 (stopped?)');
    console.log('loop          :', result.loop);
    console.log('cameraMode    :', result.cameraMode || '—');
    console.log('cam following :', result.cameraFollowEnabled);
    if (etaMinutes !== null && !result.loop) {
      console.log('ETA complete  :', etaMinutes + ' min');
    }
    if (result.active && Math.abs(result.lastProgressDelta || 0) < 1e-9) {
      console.warn('⚠️  No progress detected — trip may be frozen');
      console.warn('   Try: _wos.debug.regionalFlight.speed(30)');
    }
    console.groupEnd();
    return result;
  }

  // ── subject() — subject lock camera debug ─────────────────────────────────────
  // Reports the current subject lock state from the camera rig.
  // Only meaningful when cameraMode = 'subject_lock'.

  function subject() {
    var rig = global.SBE && SBE.RegionalFlightCameraRig;
    if (!rig) {
      console.warn('[RegionalFlightTripDebug] RegionalFlightCameraRig not loaded');
      return {};
    }
    var rs  = rig.getState();
    var sl  = rs.subjectLock || {};
    var rt  = global.SBE && SBE.RegionalFlightTripRuntime;
    var rts = rt ? rt.getState() : {};
    var pm  = rts.presetMeta || {};

    console.group('[RegionalFlightTripDebug] subject()');
    console.log('cameraMode  :', pm.cameraMode || '—');
    console.log('subjectId   :', sl.subjectId  || '—');
    console.log('active      :', sl.active);
    console.log('bearingDeg  :', sl.bearingDeg != null ? sl.bearingDeg + '°' : '—');
    console.log('distM       :', sl.distM      != null ? sl.distM + 'm'     : '—');
    if (!sl.active && pm.cameraMode === 'subject_lock') {
      console.warn('⚠️  subject_lock cameraMode set but no subject active');
      console.warn('   Check SUBJECTS[subjectId] in RegionalFlightCameraRig');
    }
    console.groupEnd();
    return sl;
  }

  // ── camera() — camera authority diagnostic (0530D) ────────────────────────────
  // Reports who owns the camera and the actual zoom/pitch on the live map vs
  // the deck-requested target. Resolves the "altitude step ignored" question.

  function camera() {
    var rig = global.SBE && SBE.RegionalFlightCameraRig;
    var mvr = global.SBE && SBE.MapboxViewportRuntime;
    var rt  = global.SBE && SBE.RegionalFlightTripRuntime;
    var map = mvr && typeof mvr.getMap === 'function' ? mvr.getMap() : null;

    var rigOn   = rig && typeof rig.getEnabled === 'function' && rig.getEnabled();
    var profile = rig && typeof rig.getCameraProfile === 'function' ? rig.getCameraProfile() : null;
    var owner   = rigOn ? 'rig' : (rt && rt.getState && rt.getState().active ? 'runtime' : 'none');

    var result = {
      owner:        owner,
      rigEnabled:   !!rigOn,
      zoomTarget:   profile ? profile.zoom  : null,
      pitchTarget:  profile ? profile.pitch : null,
      actualZoom:   map ? Math.round(map.getZoom()  * 100) / 100 : null,
      actualPitch:  map ? Math.round(map.getPitch() * 10)  / 10  : null,
      actualBearing: map ? Math.round(((map.getBearing() % 360) + 360) % 360) : null,
    };

    console.group('[RegionalFlightTripDebug] camera()');
    console.log('owner        :', result.owner);
    console.log('rigEnabled   :', result.rigEnabled);
    console.log('zoomTarget   :', result.zoomTarget != null ? result.zoomTarget : '—');
    console.log('pitchTarget  :', result.pitchTarget != null ? result.pitchTarget + '°' : '—');
    console.log('actualZoom   :', result.actualZoom);
    console.log('actualPitch  :', result.actualPitch + '°');
    console.log('actualBearing:', result.actualBearing + '°');
    if (result.zoomTarget != null && result.actualZoom != null) {
      var delta = Math.abs(result.actualZoom - result.zoomTarget);
      if (delta > 0.5) {
        console.warn('⚠ zoom drift:', delta.toFixed(2), '— target not being honored');
      }
    }
    console.groupEnd();
    return result;
  }

  // ── buildings() — building visibility diagnostics (0530E) ────────────────────
  // Returns whether building extrusion layers are present and visible.
  // Purpose: determine if building loss is style, zoom, traversal, or config.

  function buildings() {
    var mvr = global.SBE && SBE.MapboxViewportRuntime;
    var map = mvr && typeof mvr.getMap === 'function' ? mvr.getMap() : null;
    var nav = global._wos && global._wos.nav;

    var result = {
      enabled:       null,
      sourcePresent: null,
      layerPresent:  null,
      layerIds:      [],
      currentZoom:   null,
      altitudeStep:  null,
    };

    if (!map) {
      console.warn('[RegionalFlightTripDebug] buildings(): map not ready');
      return result;
    }

    try { result.currentZoom = Math.round(map.getZoom() * 100) / 100; } catch (e) {}

    try {
      var style = map.getStyle();
      if (style) {
        var srcKeys = Object.keys(style.sources || {});
        result.sourcePresent = srcKeys.some(function (s) {
          return s === 'composite' || s.indexOf('building') !== -1;
        });

        var bldgLayers = (style.layers || []).filter(function (l) {
          return l.type === 'fill-extrusion' ||
                 (l.id && l.id.indexOf('building') !== -1) ||
                 (l.id && l.id.indexOf('extrusion') !== -1) ||
                 (l['source-layer'] && l['source-layer'].indexOf('building') !== -1);
        });

        result.layerPresent = bldgLayers.length > 0;
        result.layerIds     = bldgLayers.map(function (l) { return l.id; });

        if (bldgLayers.length > 0) {
          var vis;
          try { vis = map.getLayoutProperty(bldgLayers[0].id, 'visibility'); } catch (e) {}
          result.enabled = vis !== 'none';
        } else {
          result.enabled = false;
        }
      }
    } catch (e) {
      result.enabled = false;
    }

    result.altitudeStep = nav && nav.altStep ? nav.altStep.id : null;

    console.group('[RegionalFlightTripDebug] buildings()');
    console.log('enabled      :', result.enabled);
    console.log('sourcePresent:', result.sourcePresent);
    console.log('layerPresent :', result.layerPresent);
    if (result.layerIds.length) console.log('layerIds     :', result.layerIds.join(', '));
    console.log('currentZoom  :', result.currentZoom);
    console.log('altitudeStep :', result.altitudeStep);
    if (result.currentZoom != null && result.currentZoom < 14) {
      console.warn('⚠ Fill-extrusion typically visible at zoom ≥ 14 — currently at', result.currentZoom);
    }
    if (!result.layerPresent) {
      console.warn('⚠ No building/extrusion layers found in active style');
    }
    console.groupEnd();
    return result;
  }

  // ── Bind ──────────────────────────────────────────────────────────────────────

  function _bind() {
    global._wos       = global._wos       || {};
    global._wos.debug = global._wos.debug || {};
    global._wos.debug.regionalFlight = {
      start:      start,
      stop:       stop,
      pause:      pause,
      resume:     resume,
      reset:      reset,
      speed:      speed,
      status:     status,
      camera:     camera,
      preset:     preset,
      jump:       jump,
      audit:      audit,
      // 0528P camera rig
      cameraRig:      cameraRig,
      cameraRigState: cameraRigState,
      cameraSmooth:   cameraSmooth,
      cameraSnap:     cameraSnap,
      // 0528N presence
      presence:     presence,
      contrails:    contrails,
      lights:       lights,
      visibility:   visibility,
      // 0528T traversal profiles
      profile:      profile,
      surfaceGlide: surfaceGlide,
      // 0528AH motion diagnostic
      motion:       motion,
      // 0528AI subject lock
      subject:      subject,
      // 0530D camera authority audit
      camera:       camera,
      // 0530E building visibility diagnostics
      buildings:    buildings,
      // 0528O planner
      planner:      planner,
      airports:     airports,
      origin:       origin,
      destination:  destination,
      pin:          pin,
      plan:         plan,
      preview:      preview,
      clearPreview: clearPreview,
      startPlan:    startPlan,
    };
    console.log('[RegionalFlightTripDebug] v' + VERSION + ' ready — _wos.debug.regionalFlight bound');
    console.log('  Quick start:  .start() → .speed(60) → .cameraRig(true) → .jump(0.5)');
    console.log('  Surface skim: .start() → .profile("surface_glide") → .speed(1) → .cameraRig(true)');
    console.log('  Presence:     .presence()  .contrails()  .lights()  .visibility()');
    console.log('  Planner:      .airports() → .origin("JFK") → .destination("BOS") → .plan() → .startPlan()');
  }

  _bind();

  var _attempts = 0;
  var _timer = global.setInterval(function () {
    _attempts++;
    if (!global._wos || !global._wos.debug || !global._wos.debug.regionalFlight) _bind();
    if (_attempts >= 20) global.clearInterval(_timer);
  }, 250);

})(window);
