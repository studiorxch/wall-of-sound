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
  // broadcast    — clean flight panel for streaming/recording (default)
  // diagnostics  — broadcast + raw debug rows (zoom, pitch, actor, rig, etc.)
  // hidden       — hides the traversal overlay entirely
  // Legacy aliases accepted: 'full' → diagnostics, 'cinematic' → broadcast
  var _displayMode = 'broadcast';

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

      // ══════════════════════════════════════════════════════════════════════
      // HOLOGRAPHIC FLIGHT OVERLAY
      // Philosophy: distributed text projection, not a UI widget.
      //   - No panel, no border-radius, no card chrome
      //   - Corner-bracket scan zone for the NEAR cluster
      //   - Thin vector guide lines as structural markers
      //   - Translucent scan fields (2-4% white) as illuminated zones
      //   - Text-shadow stack makes type readable over any terrain/tile
      //   - All decorative geometry drawn with CSS borders, no images
      // ══════════════════════════════════════════════════════════════════════

      // ── Root container — open area, no backing ────────────────────────────
      '#wos-hud {',
      '  position: fixed;',
      '  bottom: 30px; right: 22px;',
      '  z-index: 950;',
      '  width: 224px;',
      '  padding: 0;',
      '  background: none;',
      '  border: none;',
      '  border-radius: 0;',
      '  box-shadow: none;',
      '  font-family: "SF Mono","Fira Mono",ui-monospace,monospace;',
      '  font-size: 10px;',
      '  line-height: 1.0;',
      '  color: rgba(255,255,255,0.82);',
      '  pointer-events: none;',
      '  user-select: none;',
      '}',
      '#wos-hud.hud-hidden { display: none; }',

      // Corner-vignette wash: dark radial gradient emanating from bottom-right.
      // Gives the text a dark surface to read against without a visible box.
      '#wos-hud::before {',
      '  content: "";',
      '  position: absolute;',
      '  inset: -32px -22px -30px -56px;',
      '  background: radial-gradient(',
      '    ellipse 110% 110% at 102% 102%,',
      '    rgba(0,0,2,0.45) 0%,',
      '    rgba(0,0,2,0.18) 45%,',
      '    transparent 72%);',
      '  pointer-events: none;',
      '  z-index: -1;',
      '}',

      // Text-shadow stack — applied to all child text.
      // Three layers: sharp dark core / soft halo / wide diffuse bloom.
      // Keeps type readable over bright terrain, ocean, or clouds.
      '#wos-hud * {',
      '  text-shadow:',
      '    0 1px 2px rgba(0,0,0,1.0),',
      '    0 0  10px rgba(0,0,0,0.85),',
      '    0 0  26px rgba(0,0,0,0.50);',
      '}',

      // ── Header strip ──────────────────────────────────────────────────────
      // Transport label left / guide line / route right.
      // The guide line is a pure vector element — thin, very dim, structural.
      '.hud-header {',
      '  display: flex;',
      '  align-items: center;',
      '  gap: 0;',
      '  margin-bottom: 16px;',
      '}',
      '.hud-h-transport {',
      '  font-size: 7.5px;',
      '  font-weight: 700;',
      '  letter-spacing: 0.20em;',
      '  text-transform: uppercase;',
      '  color: rgba(255,255,255,0.30);',
      '  flex-shrink: 0;',
      '  padding-right: 8px;',
      '}',
      '.hud-h-transport.flight { color: rgba(160,215,255,0.48); }',
      '.hud-h-transport.drive  { color: rgba(160,245,170,0.45); }',
      // The guide line: a thin line that fills the gap between label and route
      '.hud-h-rule {',
      '  flex: 1;',
      '  height: 1px;',
      '  background: rgba(255,255,255,0.13);',
      '  position: relative;',
      '  top: 0px;',
      '}',
      '.hud-h-route {',
      '  font-size: 10.5px;',
      '  font-weight: 500;',
      '  color: rgba(255,255,255,0.80);',
      '  letter-spacing: 0.04em;',
      '  padding-left: 10px;',
      '  white-space: nowrap;',
      '  overflow: hidden;',
      '  text-overflow: ellipsis;',
      '  max-width: 148px;',
      '}',
      '.hud-h-route-arrow {',
      '  color: rgba(255,255,255,0.25);',
      '  margin: 0 5px;',
      '  font-weight: 300;',
      '}',
      '.hud-h-diag {',
      '  font-size: 7px;',
      '  letter-spacing: 0.16em;',
      '  text-transform: uppercase;',
      '  color: rgba(255,200,70,0.42);',
      '  padding-left: 8px;',
      '  flex-shrink: 0;',
      '}',

      // NEAR removed from broadcast — top WorldTelemetryHUD already shows location.

      // ── Telemetry grid ────────────────────────────────────────────────────
      // No section headers. Sparse rows: small uppercase label left, value right.
      // Guide rule separates altitude block from progress block.
      '.hud-trow {',
      '  display: flex;',
      '  align-items: baseline;',
      '  justify-content: space-between;',
      '  gap: 6px;',
      '  margin-top: 7px;',
      '}',
      '.hud-tl {',
      '  font-size: 7.5px;',
      '  letter-spacing: 0.14em;',
      '  text-transform: uppercase;',
      '  color: rgba(255,255,255,0.26);',
      '  flex-shrink: 0;',
      '}',
      '.hud-tv {',
      '  font-size: 11px;',
      '  color: rgba(255,255,255,0.78);',
      '  text-align: right;',
      '  white-space: nowrap;',
      '  overflow: hidden;',
      '  text-overflow: ellipsis;',
      '}',
      '.hud-tv.b {',
      '  color: rgba(255,255,255,0.96);',
      '  font-weight: 600;',
      '  font-size: 12.5px;',
      '}',

      // Phase: pure colored text inline with ALT row, no chip/border
      '.hud-phase {',
      '  font-size: 7.5px;',
      '  font-weight: 700;',
      '  letter-spacing: 0.16em;',
      '  text-transform: uppercase;',
      '}',
      '.hud-phase.climb   { color: rgba(120,215,255,0.85); }',
      '.hud-phase.cruise  { color: rgba(130,255,185,0.80); }',
      '.hud-phase.descent { color: rgba(255,200,90,0.85); }',
      '.hud-phase.unknown { color: rgba(255,255,255,0.28); }',

      // Thin vector guide rule between telemetry clusters
      '.hud-guide {',
      '  height: 1px;',
      '  background: rgba(255,255,255,0.09);',
      '  margin: 10px 0;',
      '}',
      // Guide with tick mark at right end (avionics feel)
      '.hud-guide-tick {',
      '  height: 1px;',
      '  position: relative;',
      '  background: rgba(255,255,255,0.09);',
      '  margin: 10px 0;',
      '}',
      '.hud-guide-tick::after {',
      '  content: "";',
      '  position: absolute;',
      '  right: 0; top: -2px;',
      '  width: 1px; height: 5px;',
      '  background: rgba(255,255,255,0.22);',
      '}',

      // Progress bar: 1px vector line, no frame
      '.hud-prog-track {',
      '  height: 1px;',
      '  background: rgba(255,255,255,0.10);',
      '  margin: 5px 0 0;',
      '  position: relative;',
      '}',
      '.hud-prog-fill {',
      '  position: absolute;',
      '  left: 0; top: 0;',
      '  height: 1px;',
      '  background: rgba(255,255,255,0.55);',
      '  transition: width 0.4s linear;',
      '}',
      // Playhead dot at the fill edge
      '.hud-prog-head {',
      '  position: absolute;',
      '  top: -2px;',
      '  width: 2px; height: 5px;',
      '  background: rgba(255,255,255,0.80);',
      '  transition: left 0.4s linear;',
      '}',

      // Diagnostics block (diagnostics mode only)
      '.hud-diag {',
      '  margin-top: 14px;',
      '  padding-top: 10px;',
      '  border-top: 1px solid rgba(255,200,70,0.10);',
      '}',
      '.hud-diag-cap {',
      '  font-size: 6.5px;',
      '  letter-spacing: 0.20em;',
      '  text-transform: uppercase;',
      '  color: rgba(255,200,70,0.32);',
      '  margin-bottom: 6px;',
      '  display: block;',
      '}',
      '.hud-diag .hud-trow { margin-top: 5px; }',
      '.hud-diag .hud-tl   { color: rgba(255,200,70,0.26); }',
      '.hud-diag .hud-tv   { color: rgba(255,255,255,0.36); font-size: 9.5px; }',

      // Warnings
      '.hud-warn {',
      '  margin-top: 10px;',
      '  font-size: 8.5px;',
      '  letter-spacing: 0.04em;',
      '  color: rgba(255,165,50,0.95);',
      '}',

      // Idle (no trip active)
      '.hud-idle {',
      '  font-size: 8.5px;',
      '  letter-spacing: 0.08em;',
      '  color: rgba(255,255,255,0.16);',
      '}',

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
    var fromLabel = nav ? nav.from      : null;

    // Current location from ViewportLocationAuthority (reverse-geocoded city/region)
    var vla      = global.SBE && SBE.ViewportLocationAuthority;
    var vlaState = vla && typeof vla.getState === 'function' ? vla.getState() : null;
    var nearLabel = null;
    if (vlaState) {
      if (vlaState.label && vlaState.region) {
        nearLabel = vlaState.label + ', ' + vlaState.region;
      } else if (vlaState.label) {
        nearLabel = vlaState.label;
      } else if (vlaState.region) {
        nearLabel = vlaState.region;
      } else if (vlaState.latitude != null) {
        // Geocode not yet available — show raw coords as fallback
        nearLabel = vlaState.latitude.toFixed(3) + ', ' + vlaState.longitude.toFixed(3);
      }
    }

    var actorAltFt = (active && rtState.current && rtState.current.altitudeFt != null)
      ? rtState.current.altitudeFt
      : (altStep ? altStep.altitudeFt : null);

    return {
      active:    active,
      transport: transport,
      toLabel:   toLabel,
      fromLabel: fromLabel,
      nearLabel: nearLabel,
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

  // ── Render helpers ────────────────────────────────────────────────────────────

  function _trow(label, value, bright) {
    return '<div class="hud-trow">'
      + '<span class="hud-tl">' + label + '</span>'
      + '<span class="hud-tv' + (bright ? ' b' : '') + '">' + (value != null ? value : '—') + '</span>'
      + '</div>';
  }

  function _phaseText(phase) {
    if (!phase) return null;
    var p = phase.toLowerCase();
    var cls = p.indexOf('climb')   !== -1 ? 'climb'
            : p.indexOf('cruise')  !== -1 ? 'cruise'
            : p.indexOf('descent') !== -1 ? 'descent'
            : 'unknown';
    return '<span class="hud-phase ' + cls + '">' + phase.toUpperCase() + '</span>';
  }

  function _progTrack(pct) {
    var w = pct != null ? Math.min(100, Math.max(0, pct)) : 0;
    var wPx = (w / 100 * 224).toFixed(1);   // approx pixel offset for head
    return '<div class="hud-prog-track">'
      + '<div class="hud-prog-fill" style="width:' + w.toFixed(1) + '%"></div>'
      + '<div class="hud-prog-head" style="left:calc(' + w.toFixed(1) + '% - 1px)"></div>'
      + '</div>';
  }

  function _render() {
    if (!_el || !_visible) return;
    if (_displayMode === 'hidden') { _el.innerHTML = ''; return; }

    var d    = _gather();
    var mode = _displayMode;
    if (mode === 'full')      mode = 'diagnostics';
    if (mode === 'cinematic') mode = 'broadcast';

    if (!d.active) {
      _el.innerHTML = '<div class="hud-idle">no active trip</div>';
      return;
    }

    var transport = (d.transport || 'flight').toLowerCase();
    var isDrive   = (d.mode === 'drive');
    var html      = '';

    // ── Header: TRANSPORT ──── ROUTE ──────────────────────────────────────────
    var routeStr = (d.fromLabel && d.toLabel)
      ? d.fromLabel + '<span class="hud-h-route-arrow"> → </span>' + d.toLabel
      : (d.toLabel || '—');
    html += '<div class="hud-header">'
          + '<span class="hud-h-transport ' + transport + '">' + transport.toUpperCase() + '</span>'
          + '<span class="hud-h-rule"></span>'
          + '<span class="hud-h-route">' + routeStr + '</span>'
          + (mode === 'diagnostics' ? '<span class="hud-h-diag">DIAG</span>' : '')
          + '</div>';

    // ── Telemetry cluster A: altitude + phase ─────────────────────────────────
    // NEAR not shown in broadcast — top WorldTelemetryHUD strip already has location.
    var phaseHtml  = d.tripPhase ? _phaseText(d.tripPhase) : null;
    var altLabel   = phaseHtml ? 'Alt&nbsp;&nbsp;' + phaseHtml : 'Alt';
    html += '<div class="hud-trow">'
          + '<span class="hud-tl">' + altLabel + '</span>'
          + '<span class="hud-tv b">' + _fmtAlt(d.actorAltitudeFt) + '</span>'
          + '</div>';
    // Target altitude only when it differs from current (e.g. climbing)
    if (d.altitudeStepLabel && d.altitudeStepFt !== d.actorAltitudeFt) {
      html += _trow('Target', d.altitudeStepLabel + ' · ' + _fmtAlt(d.altitudeStepFt));
    }

    // ── Vector guide rule with tick ───────────────────────────────────────────
    html += '<div class="hud-guide-tick"></div>';

    // ── Telemetry cluster B: progress + time + distance + speed ───────────────
    // Progress row: label + bar + percentage on same visual line
    var progPct  = d.progress != null ? _fmtPct(d.progress) : '—';
    html += '<div class="hud-trow">'
          + '<span class="hud-tl">Prog</span>'
          + '<span class="hud-tv b">' + progPct + '</span>'
          + '</div>';
    html += _progTrack(d.progress);

    if (isDrive) {
      if (d.distKm   != null) html += _trow('Dist',    _fmtKm(d.distKm));
      if (d.realMs   != null) html += _trow('Elapsed', _fmtDuration(d.realMs));
    } else {
      if (d.remainMs != null) html += _trow('Remain',  _fmtDuration(d.remainMs), true);
      if (d.distKm   != null) html += _trow('Dist',    _fmtKm(d.distKm));
      html += _trow('Speed', _fmtSpeed(d.speedMult));
    }

    // ── Diagnostics block (hidden in broadcast) ───────────────────────────────
    if (mode === 'diagnostics') {
      var zm  = d.zoom    != null ? d.zoom.toFixed(1) : '—';
      var pt  = d.pitch   != null ? d.pitch.toFixed(1) + '°' : '—';
      var brg = d.bearing != null ? Math.round((d.bearing + 360) % 360) + '°' : '—';
      html += '<div class="hud-diag">';
      html += '<span class="hud-diag-cap">Diagnostics</span>';
      if (d.nearLabel) html += _trow('Near', d.nearLabel);
      html += _trow('Actor',   d.actorType   || '—');
      html += _trow('Cam',     d.cameraOwner || '—');
      html += _trow('Move',    d.moveMode    || '—');
      html += _trow('Zoom',    zm);
      html += _trow('Pitch',   pt);
      html += _trow('Bearing', brg);
      if (d.realMs != null) html += _trow('Real', _fmtDuration(d.realMs));
      if (d.simMs  != null) html += _trow('Sim',  _fmtDuration(d.simMs));
      html += '</div>';
    }

    // ── Warnings ──────────────────────────────────────────────────────────────
    if (d.stale)       html += '<div class="hud-warn">⚠ progress stalled</div>';
    if (d.cameraStuck) html += '<div class="hud-warn">⚠ camera not following</div>';

    _el.innerHTML = html;
  }

  // ── Display mode control ──────────────────────────────────────────────────────
  var _VALID_MODES = { broadcast: 1, diagnostics: 1, hidden: 1, full: 1, cinematic: 1 };

  function setDisplayMode(m) {
    if (!_VALID_MODES[m]) {
      console.warn('[TraversalHUD] unknown mode:', m, '— use: broadcast | diagnostics | hidden');
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
    console.log('  _wos.debug.hud.toggle()          — show/hide');
    console.log('  _wos.debug.hud.mode("broadcast") — broadcast panel (default)');
    console.log('  _wos.debug.hud.mode("diagnostics") — + raw debug rows');
    console.log('  _wos.debug.hud.snapshot()        — read current values');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }

})(window);
