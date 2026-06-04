// ── TraversalHUD v1.0.0 ────────────────────────────────────────────────────────
// 0529G_WOS_TraversalTelemetryAndTransportScaffold_v1.0.0
// Status: active
// Classification: observational-telemetry
//
// Purpose:
//   Read-only live overlay showing traversal telemetry.
//   Used to observe values before making preset decisions.
//   "Measure first. Preset later."
//
//   Shows: transport, destination, trip progress, elapsed/remaining time,
//          speed multiplier, current zoom/pitch/bearing, altitude.
//
// Authority:
//   READS ONLY: RegionalFlightTripRuntime, MapboxViewportRuntime,
//               RegionalFlightCameraRig, window._wos.nav (nav bar state)
//   MUST NOT: mutate any runtime, change traversal parameters, control UI
//
// Placement: wall/systems/presentation/traversalHUD.js
// Load: AFTER traversalControlDeck.js
//
// ──────────────────────────────────────────────────────────────────────────────
//
// ── Route Capability Audit (Part 7) ──────────────────────────────────────────
//
// FLIGHT
//   Source:     startGeneratedTrip — direct lat/lng interpolation
//   Capability: Any two global coordinates — no external API required
//   Limits:     Straight-line only (Mercator projection, not great circle arc)
//   Expansion:  Add intermediate waypoints to approximate great circle paths
//
// DRIVE
//   Source:     None currently implemented
//   Required:   Mapbox Directions API (profile: mapbox/driving)
//   Input:      Origin + destination coords → polyline route response
//   Expansion:  Fetch route, convert geometry to waypoints, feed startGeneratedTrip
//   Blocker:    None technical — needs Directions API token scope
//
// WALK
//   Source:     None currently implemented
//   Required:   Mapbox Directions API (profile: mapbox/walking)
//   Characteristics: Pedestrian paths, parks, crosswalks
//   Expansion:  Same pattern as Drive with walking profile
//   Blocker:    Same as Drive
//
// BIKE
//   Source:     None currently implemented
//   Required:   Mapbox Directions API (profile: mapbox/cycling)
//   Characteristics: Bike lanes, mixed cycling paths
//   Expansion:  Same pattern as Drive with cycling profile
//   Blocker:    Same as Drive
//
// TRANSIT
//   Source:     None — significantly more complex
//   Required:   GTFS schedule data + stop-based routing engine
//               OR Mapbox Matrix API (limited)
//   Complexity: High — requires real-time or scheduled departure data
//   Recommendation: Keep disabled until a transit data source is identified
//
// Summary: Drive/Walk/Bike all use the same Mapbox Directions API pattern.
// They share the same expansion path and could be built together once the
// API integration is in place. Transit is a separate problem.
//
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  var _el       = null;
  var _timer    = null;
  var _visible  = false;
  var UPDATE_MS = 500;

  // ── Display mode ─────────────────────────────────────────────────────────────
  // cinematic  — compact: transport, location, time, weather, speed, cam preset
  // full       — all diagnostic rows (default for flight, debug for drive)
  // hidden     — hides the traversal overlay entirely
  var _displayMode = 'full';   // start full; switch via _wos.debug.hud.mode()

  // Freeze guard: track when progress last advanced. If active trip stops
  // advancing for >3s, surface a warning so user can see why nothing moves.
  var _lastProgress    = -1;
  var _lastProgressAt  = 0;
  var STALE_THRESHOLD_MS = 3000;

  // Camera-follow guard: detect when actor moves but camera doesn't follow.
  var _lastCameraLat   = null;
  var _lastCameraLng   = null;
  var _lastCameraMoveAt = 0;

  // ── CSS ───────────────────────────────────────────────────────────────────────

  function _injectCSS() {
    if (document.getElementById('wos-hud-css')) return;
    var s = document.createElement('style');
    s.id  = 'wos-hud-css';
    s.textContent = [
      '#wos-hud {',
      '  position: fixed;',
      '  top: 14px; right: 14px;',
      '  z-index: 950;',
      '  background: rgba(4,5,7,0.88);',
      '  border: 1px solid rgba(255,255,255,0.08);',
      '  border-radius: 6px;',
      '  padding: 9px 12px 10px;',
      '  font-family: "SF Mono","Fira Mono",ui-monospace,monospace;',
      '  font-size: 10px;',
      '  line-height: 1.75;',
      '  color: rgba(255,255,255,0.55);',
      '  min-width: 150px;',
      '  backdrop-filter: blur(8px);',
      '  -webkit-backdrop-filter: blur(8px);',
      '  pointer-events: none;',
      '  white-space: pre;',
      '}',
      '#wos-hud.hud-hidden { display: none; }',
      '.hud-label {',
      '  font-size: 9px; letter-spacing: 0.10em; text-transform: uppercase;',
      '  color: rgba(255,255,255,0.22);',
      '}',
      '.hud-value { color: rgba(255,255,255,0.80); }',
      '.hud-dim   { color: rgba(255,255,255,0.30); }',
      '.hud-sep   {',
      '  border: none; border-top: 1px solid rgba(255,255,255,0.06);',
      '  margin: 5px 0; display: block;',
      '}',
      '.hud-row   { display: flex; justify-content: space-between; gap: 12px; }',
      '.hud-inactive { color: rgba(255,255,255,0.18); font-style: italic; }',
      '.hud-warn { color: rgba(255,170,90,0.95); font-size: 10px; }',
    ].join('\n');
    document.head.appendChild(s);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  function _fmtDuration(ms) {
    if (ms == null || ms < 0) return '—';
    var s   = Math.round(ms / 1000);
    var m   = Math.floor(s / 60);
    var sec = s % 60;
    if (m > 0) return m + 'm ' + String(sec).padStart(2, '0') + 's';
    return sec + 's';
  }

  function _fmtPct(v) {
    return (Math.round(v * 10) / 10).toFixed(1) + '%';
  }

  function _haversineKm(lat1, lng1, lat2, lng2) {
    var R    = 6371;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLng = (lng2 - lng1) * Math.PI / 180;
    var a    = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
               Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
               Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function _fmtKm(km) {
    if (km == null) return '—';
    if (km >= 1000) return Math.round(km).toLocaleString() + ' km';
    return Math.round(km) + ' km';
  }

  // ── Drive telemetry: hero vehicle state → HUD descriptor ─────────────────────

  function _gatherDrive(hvState, nav, map) {
    var altStep = nav && nav.altStep ? nav.altStep : null;

    var zoom = null, pitch = null, bearing = null;
    if (map) {
      try { zoom    = Math.round(map.getZoom()    * 10) / 10; } catch (e) {}
      try { pitch   = Math.round(map.getPitch()   * 10) / 10; } catch (e) {}
      try { bearing = Math.round(((map.getBearing() % 360) + 360) % 360); } catch (e) {}
    }

    var distKm = (hvState.distanceRemainingMeters != null)
      ? Math.round(hvState.distanceRemainingMeters) / 1000
      : null;

    // Derive route label from source
    var routeLabel = hvState.routeSource === 'mapbox-directions' ? 'driving'
                   : hvState.routeSource ? 'fallback'
                   : null;

    return {
      active:    true,
      mode:      'drive',        // tells _render to use Drive layout
      transport: 'drive',
      toLabel:   nav ? nav.to : null,
      progress:  hvState.progressPct,
      realMs:    (nav && nav.launchRealMs) ? (Date.now() - nav.launchRealMs) : null,
      simMs:     null,
      remainMs:  null,
      durMs:     null,
      speedMult: hvState.speedMultiplier,
      tripPhase: null,
      distKm:    distKm,
      zoom:      zoom,
      pitch:     pitch,
      bearing:   bearing,
      // Actor / POV — hero vehicle has its own actorType
      actorType:           'hero_car',
      povType:             'drone_follow',
      actorAltitudeFt:     altStep ? altStep.altitudeFt : null,
      altitudeStepFt:      altStep ? altStep.altitudeFt : null,
      altitudeStepLabel:   altStep ? altStep.label      : null,
      povAltitudeOffsetFt: 0,
      routeSource:         hvState.routeSource,
      routeLabel:          routeLabel,
      stale:               false,
      cameraStuck:         false,
      cameraOwner:         'heroVehicleRuntime',
      moveMode:            'continuous',
    };
  }

  // ── Data collection ───────────────────────────────────────────────────────────

  function _gather() {
    var mvr = global.SBE && SBE.MapboxViewportRuntime;
    var nav = global._wos && global._wos.nav;  // set by traversalControlDeck on launch
    var map = mvr && typeof mvr.getMap === 'function' ? mvr.getMap() : null;

    // ── Check hero vehicle first — it wins when active ────────────────────────
    var hvrt    = global.SBE && SBE.HeroVehicleRuntime;
    var hvState = hvrt && typeof hvrt.getState === 'function' ? hvrt.getState() : null;
    var hvActive = !!(hvState && hvState.active);

    if (hvActive) {
      return _gatherDrive(hvState, nav, map);
    }

    // ── Flight path ───────────────────────────────────────────────────────────
    var rt  = global.SBE && SBE.RegionalFlightTripRuntime;
    var rtState = rt && typeof rt.getState === 'function' ? rt.getState() : null;

    // ── Trip ──────────────────────────────────────────────────────────────────
    var active    = !!(rtState && rtState.active);
    var progress  = active ? rtState.progressPct     : null;
    var simMs     = active ? rtState.elapsedMs       : null;   // SIM = simulated elapsed
    var durMs     = active ? rtState.durationMs      : null;
    var speedMult = (nav && nav.speedMult) ? nav.speedMult
                  : (active ? rtState.speedMultiplier : null);
    var tripPhase = active ? rtState.tripPhase       : null;

    // REAL = wall-clock time since launch
    var realMs = (nav && nav.launchRealMs) ? (Date.now() - nav.launchRealMs) : null;
    // REMAIN = remaining simulated time / speedMult → real time remaining
    var remainMs = (active && speedMult && durMs != null && simMs != null)
      ? (durMs - simMs) / speedMult : null;

    var curLat = active && rtState.current ? rtState.current.lat : null;
    var curLng = active && rtState.current ? rtState.current.lng : null;

    // ── Distance to destination ───────────────────────────────────────────────
    var distKm = null;
    if (curLat != null && nav && nav.toLoc) {
      distKm = _haversineKm(curLat, curLng, nav.toLoc.lat, nav.toLoc.lng);
    }

    // ── Camera ────────────────────────────────────────────────────────────────
    var zoom = null, pitch = null, bearing = null;
    if (map) {
      try { zoom    = Math.round(map.getZoom()    * 10) / 10; } catch (e) {}
      try { pitch   = Math.round(map.getPitch()   * 10) / 10; } catch (e) {}
      try { bearing = Math.round(((map.getBearing() % 360) + 360) % 360);  } catch (e) {}
    }

    // ── Freeze detection: progress not advancing on an active trip ────────────
    var now = Date.now();
    var stale = false;
    if (active && progress != null) {
      if (progress !== _lastProgress) {
        _lastProgress   = progress;
        _lastProgressAt = now;
      } else if (_lastProgressAt && (now - _lastProgressAt) > STALE_THRESHOLD_MS) {
        stale = true;
      }
    } else {
      _lastProgress   = -1;
      _lastProgressAt = 0;
    }

    // ── Camera-follow detection: map center hasn't moved for 3s while active ──
    var cameraStuck = false;
    if (active && map) {
      var c = null;
      try { c = map.getCenter(); } catch (e) {}
      if (c) {
        var moved = (_lastCameraLat == null) ||
                    Math.abs(c.lat - _lastCameraLat) > 0.0001 ||
                    Math.abs(c.lng - _lastCameraLng) > 0.0001;
        if (moved) {
          _lastCameraLat    = c.lat;
          _lastCameraLng    = c.lng;
          _lastCameraMoveAt = now;
        } else if (_lastCameraMoveAt && (now - _lastCameraMoveAt) > STALE_THRESHOLD_MS) {
          cameraStuck = true;
        }
      }
    } else {
      _lastCameraLat = null; _lastCameraLng = null; _lastCameraMoveAt = 0;
    }

    // ── Camera owner detection (Fix 4) ────────────────────────────────────────
    var rig         = global.SBE && SBE.RegionalFlightCameraRig;
    var cameraOwner = (rig && typeof rig.getEnabled === 'function' && rig.getEnabled())
                    ? 'rig' : (active ? 'runtime' : 'none');
    var moveMode    = (rtState && rtState.presetMeta) ? 'continuous' : 'phase';

    // ── Actor / POV ───────────────────────────────────────────────────────────
    // actorAltitudeFt = movement truth (live entity altitude from the runtime).
    // Falls back to the altitude-step intent when no actor entity exists.
    var altStep   = nav && nav.altStep ? nav.altStep : null;
    var transport = nav ? nav.transport : null;
    var toLabel   = nav ? nav.to        : null;
    var actorAltFt = (active && rtState.current && rtState.current.altitudeFt != null)
      ? rtState.current.altitudeFt
      : (altStep ? altStep.altitudeFt : null);

    return {
      active:    active,
      transport: transport,
      toLabel:   toLabel,
      progress:  progress,
      realMs:    realMs,      // REAL: wall-clock elapsed
      simMs:     simMs,       // SIM:  simulated elapsed
      remainMs:  remainMs,    // REMAIN: real time remaining
      durMs:     durMs,
      speedMult: speedMult,
      tripPhase: tripPhase,
      distKm:    distKm,
      zoom:      zoom,
      pitch:     pitch,
      bearing:   bearing,
      // Actor / POV
      // actorType inferred from altitude envelope — not hardcoded to 'aircraft'
      actorType:           altStep
        ? (altStep.altitudeFt <=  100 ? 'drone'
         : altStep.altitudeFt <=  500 ? 'low-flight'
         : 'aircraft')
        : 'unknown',
      povType:             active ? 'forward' : null,
      actorAltitudeFt:     actorAltFt,
      altitudeStepFt:      altStep ? altStep.altitudeFt : null,
      altitudeStepLabel:   altStep ? altStep.label      : null,
      povAltitudeOffsetFt: 0,
      stale:               stale,
      cameraStuck:         cameraStuck,
      cameraOwner:         cameraOwner,
      moveMode:            moveMode,
    };
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  function _fmtSpeed(mult) {
    if (mult == null) return '—';
    return mult < 1 ? mult.toFixed(2) + '×' : mult + '×';
  }

  function _fmtAlt(ft) {
    if (ft == null) return '—';
    return ft.toLocaleString() + ' ft';
  }

  function _row(label, value) {
    var padded = (label + '          ').slice(0, 10);
    return '<span class="hud-dim">' + padded + '</span>'
         + '<span class="hud-value">' + (value != null ? value : '—') + '</span>';
  }

  function _render() {
    if (!_el || !_visible) return;

    // hidden mode: blank the overlay
    if (_displayMode === 'hidden') {
      _el.innerHTML = '';
      return;
    }

    var d = _gather();
    var lines = [];

    if (!d.active) {
      lines.push('<span class="hud-dim">no active trip</span>');

    } else if (_displayMode === 'cinematic') {
      // ── Cinematic mode: transport › dest  speed  cam preset ─────────────────
      var tLbl  = (d.transport || 'flight').toUpperCase();
      var cDest = d.toLabel || '—';
      lines.push('<span class="hud-value">' + tLbl + '</span>'
               + '<span class="hud-dim">  › </span>'
               + '<span class="hud-value">' + cDest + '</span>');
      lines.push('<hr class="hud-sep">');
      lines.push(_row('SPEED',  _fmtSpeed(d.speedMult)));
      lines.push(_row('PROG',   d.progress != null ? _fmtPct(d.progress) : '—'));
      if (d.mode === 'drive') {
        var hvrt = global.SBE && SBE.HeroVehicleRuntime;
        var cp   = hvrt && typeof hvrt.getCameraPreset === 'function' ? hvrt.getCameraPreset() : null;
        if (cp) lines.push(_row('CAM', cp));
        if (d.routeLabel) lines.push(_row('ROUTE', d.routeLabel));
      }

    } else {
      // ── Full mode ─────────────────────────────────────────────────────────────
      // ── Transport + destination ──────────────────────────────────────────────
      var tLabel = (d.transport || 'flight').toUpperCase();
      var dest   = d.toLabel || '—';
      lines.push('<span class="hud-value">' + tLabel + '</span>'
               + '<span class="hud-dim">  › </span>'
               + '<span class="hud-value">' + dest + '</span>');

      lines.push('<hr class="hud-sep">');

      // ── Actor / POV ────────────────────────────────────────────────────────────
      // Actor = movement truth. POV = camera interpretation.
      // ALT = runtime actor altitude (movement truth, changes during climb/descent)
      // ALT SET = selected intent from altitude stepper (target)
      lines.push(_row('ACTOR',   d.actorType  || 'unknown'));
      lines.push(_row('POV',     d.povType    || 'unknown'));
      lines.push(_row('ALT',     _fmtAlt(d.actorAltitudeFt)));
      if (d.altitudeStepLabel) {
        lines.push(_row('ALT SET', d.altitudeStepLabel + ' / ' + _fmtAlt(d.altitudeStepFt)));
      }

      lines.push('<hr class="hud-sep">');

      if (d.mode === 'drive') {
        // ── Drive: ROUTE source must never be hidden ───────────────────────────
        lines.push(_row('ROUTE', d.routeLabel || '—'));
        lines.push(_row('PROG',  d.progress != null ? _fmtPct(d.progress) : '—'));
        if (d.distKm != null) lines.push(_row('DIST', _fmtKm(d.distKm)));
        lines.push(_row('REAL',  d.realMs != null ? _fmtDuration(d.realMs) : '—'));
      } else {
        // ── Flight: REAL / SIM / REMAIN / PROG ────────────────────────────────
        // REAL  = wall-clock time since Launch was pressed
        // SIM   = simulated world time elapsed (REAL × speedMult)
        // REMAIN = remaining wall-clock time at current speed
        lines.push(_row('REAL',   d.realMs   != null ? _fmtDuration(d.realMs)   : '—'));
        lines.push(_row('SIM',    d.simMs    != null ? _fmtDuration(d.simMs)    : '—'));
        lines.push(_row('REMAIN', d.remainMs != null ? _fmtDuration(d.remainMs) : '—'));
        lines.push(_row('PROG',   d.progress != null ? _fmtPct(d.progress) : '—'));
        if (d.distKm != null) lines.push(_row('DIST', _fmtKm(d.distKm)));
      }

      lines.push('<hr class="hud-sep">');

      // ── Speed + phase ──────────────────────────────────────────────────────────
      lines.push(_row('SPEED', _fmtSpeed(d.speedMult)));
      if (d.tripPhase) {
        lines.push(_row('PHASE', d.tripPhase));
      }

      lines.push('<hr class="hud-sep">');

      // ── Camera (POV presentation scale) ───────────────────────────────────────
      var zm  = d.zoom    != null ? d.zoom.toFixed(1) : '—';
      var pt  = d.pitch   != null ? d.pitch.toFixed(1) + '°' : '—';
      var brg = d.bearing != null ? Math.round((d.bearing + 360) % 360) + '°' : '—';
      lines.push(_row('ZOOM',    zm));
      lines.push(_row('PITCH',   pt));
      lines.push(_row('BEARING', brg));
      lines.push(_row('CAM OWN', d.cameraOwner || '—'));
      lines.push(_row('MOVE',    d.moveMode    || '—'));

      // ── Warnings ──────────────────────────────────────────────────────────────
      if (d.stale) {
        lines.push('<hr class="hud-sep">');
        lines.push('<span class="hud-warn">⚠ Progress not advancing &gt;3s</span>');
      }
      if (d.cameraStuck) {
        if (!d.stale) lines.push('<hr class="hud-sep">');
        lines.push('<span class="hud-warn">⚠ Camera not following actor</span>');
      }
    }   // end full mode else

    _el.innerHTML = lines.join('\n');
  }

  // ── Display mode control ──────────────────────────────────────────────────────
  function setDisplayMode(m) {
    if (m !== 'cinematic' && m !== 'full' && m !== 'hidden') {
      console.warn('[TraversalHUD] unknown mode:', m, '— use: cinematic | full | hidden');
      return;
    }
    _displayMode = m;
    console.log('[TraversalHUD] display mode →', m);
    _render();
  }

  function getDisplayMode() { return _displayMode; }

  // ── Lifecycle ─────────────────────────────────────────────────────────────────

  function _createEl() {
    if (_el && _el.parentElement) return;
    _injectCSS();
    _el = document.createElement('div');
    _el.id = 'wos-hud';
    _el.className = 'hud-hidden';
    document.body.appendChild(_el);
  }

  function show() {
    _createEl();
    _visible = true;
    _el.classList.remove('hud-hidden');
    if (!_timer) {
      _render();
      _timer = global.setInterval(_render, UPDATE_MS);
    }
    console.log('[TraversalHUD] visible');
  }

  function hide() {
    _visible = false;
    if (_el) _el.classList.add('hud-hidden');
    if (_timer) { global.clearInterval(_timer); _timer = null; }
    console.log('[TraversalHUD] hidden');
  }

  function toggle() {
    _visible ? hide() : show();
  }

  // Auto-show when a trip becomes active, hide when idle.
  function _autoWatch() {
    var rt  = global.SBE && SBE.RegionalFlightTripRuntime;
    var was = _visible;
    if (rt && typeof rt.getState === 'function') {
      var s = rt.getState();
      if (s.active && !_visible) show();
    }
    global.setTimeout(_autoWatch, 1500);
  }

  // ── Debug state snapshot ──────────────────────────────────────────────────────

  function snapshot() {
    var d = _gather();
    console.group('[TraversalHUD] snapshot()');
    console.log('active     :', d.active);
    console.log('transport  :', d.transport);
    console.log('to         :', d.toLabel);
    // Actor / POV
    console.log('actorType  :', d.actorType);
    console.log('povType    :', d.povType || 'unknown');
    console.log('actorAltFt :', d.actorAltitudeFt != null ? d.actorAltitudeFt.toLocaleString() + ' ft' : '—');
    console.log('povOffsetFt:', d.povAltitudeOffsetFt);
    // Time — REAL vs SIM make compression obvious
    console.log('REAL       :', d.realMs   != null ? _fmtDuration(d.realMs)   : '—');
    console.log('SIM        :', d.simMs    != null ? _fmtDuration(d.simMs)    : '—');
    console.log('REMAIN     :', d.remainMs != null ? _fmtDuration(d.remainMs) + ' real' : '—');
    console.log('progress   :', d.progress != null ? d.progress.toFixed(1) + '%' : '—');
    console.log('speedMult  :', d.speedMult != null ? d.speedMult + 'x' : '—');
    console.log('distKm     :', d.distKm   != null ? _fmtKm(d.distKm) : '—');
    // Camera (POV presentation scale)
    console.log('zoom       :', d.zoom);
    console.log('pitch      :', d.pitch);
    console.log('bearing    :', d.bearing);
    console.log('phase      :', d.tripPhase || '—');
    console.groupEnd();
    return d;
  }

  // ── Exports ───────────────────────────────────────────────────────────────────

  SBE.TraversalHUD = Object.freeze({
    VERSION:        VERSION,
    show:           show,
    hide:           hide,
    toggle:         toggle,
    snapshot:       snapshot,
    setDisplayMode: setDisplayMode,
    getDisplayMode: getDisplayMode,
  });

  // ── Debug binding (retry guards) ──────────────────────────────────────────────

  var _debugObj = {
    show:     show,
    hide:     hide,
    toggle:   toggle,
    snapshot: snapshot,
    mode: function (m) {
      if (m === undefined) { console.log('[TraversalHUD] current mode:', _displayMode); return _displayMode; }
      setDisplayMode(m);
    },
  };

  function _bindDebug() {
    global._wos             = global._wos             || {};
    global._wos.debug       = global._wos.debug       || {};
    global._wos.debug.hud   = _debugObj;
  }
  _bindDebug();
  global.setTimeout(_bindDebug, 300);
  global.setTimeout(_bindDebug, 1000);
  global.setTimeout(_bindDebug, 2500);

  // ── Init ──────────────────────────────────────────────────────────────────────

  function _init() {
    _createEl();
    // Auto-watch: show HUD when a trip becomes active
    global.setTimeout(_autoWatch, 2000);
    console.log('[TraversalHUD] v' + VERSION + ' loaded — auto-shows on trip start');
    console.log('  _wos.debug.hud.toggle()   — show/hide');
    console.log('  _wos.debug.hud.snapshot() — read current values');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }

})(window);
