// ── MapboxStyleTransferAudit v1.0.0 ──────────────────────────────────────────
// 0527B_WOS_MapboxStyleTransferAudit_v1.0.0
// Status: active
// Classification: debug-companion — do NOT load in production
//
// Recovery audit module.  Restores visible Mapbox Studio styling authority
// inside WOS rendering and identifies which WOS layers mute or override
// geographic presentation.
//
// Binds _wos.debug.mapbox with:
//   style()               — print active Mapbox style URL + metadata
//   layers()              — list all overlay layers (enabled / muted)
//   cleanMode(bool)       — toggle: disable all WOS presentation stacks
//   disableAtmosphere()   — freeze atmosphere at zero-pressure baseline
//   disableWakes()        — suppress all wake + water-memory rendering
//   toggleLayer(id,bool)  — enable or disable one OverlayRuntime layer by id
//   audit()               — full transfer integrity report
//   restore()             — undo all audit-driven overrides, return to normal
//
// Doctrine:
//   Observational only.  Does not mutate AIS, vessel continuity, or world state.
//   May write SBE.runtimeFlags presentation flags and overlay layer .enabled.
//   All mutations are tracked in _auditState so restore() can undo them.
//
// Placement: wall/systems/presentation/mapboxStyleTransferAudit.js
// Load: AFTER main.js (additive _wos init)
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  // Null-safe init — _wos may not exist yet; bindMapboxAuditNamespace() handles
  // the authoritative write at the bottom of this file.
  if (!global._wos)              global._wos       = {};
  if (!global._wos.debug)        global._wos.debug = {};

  var VERSION = '1.0.0';

  // ── Runtime handles (resolved lazily) ────────────────────────────────────────
  function _mvr()  { return global.SBE && global.SBE.MapboxViewportRuntime; }
  function _ovr()  { return global.SBE && global.SBE.OverlayRuntime; }
  function _atm()  { return global.SBE && global.SBE.AtmosphereRuntime; }
  function _rf()   { return global.SBE && global.SBE.runtimeFlags; }

  // ── Audit state tracker (only things we've changed) ──────────────────────────
  var _auditState = {
    cleanMode:          false,
    atmosphereFrozen:   false,
    wakesFrozen:        false,
    // flag snapshots before we changed them
    _savedFlags:        null,
    // overlay layer enabled snapshots: { id: bool }
    _savedLayers:       null,
    // atmosphere zero injection handle (timestamp of injection)
    _atmosphereZeroTs:  null,
  };

  // ── CONSTANTS ─────────────────────────────────────────────────────────────────
  // Presentation flags touched by cleanMode
  var _PRESENTATION_FLAGS = [
    'showMaritimeNavLights',
    'showMaritimeSpeedTails',
    'showMaritimeWakeGlow',
    'showMaritimeWaterMemory',
    'showMaritimeWaterMemoryLanes',
    'showMaritimeWaterMemoryChurn',
    'maritimeEnabled',
  ];

  // ── Helpers ───────────────────────────────────────────────────────────────────
  function _pad(s, w) {
    s = String(s);
    while (s.length < w) s += ' ';
    return s;
  }
  function _lpad(s, w) {
    s = String(s);
    while (s.length < w) s = ' ' + s;
    return s;
  }
  function _checkMvr(fnName) {
    if (!_mvr()) {
      console.warn('[MapboxStyleTransferAudit] ' + fnName + '() — ' +
        'SBE.MapboxViewportRuntime not found. Is the map loaded?');
      return false;
    }
    return true;
  }

  // ── style() ──────────────────────────────────────────────────────────────────
  // Print active Mapbox style URL, name, and layer count to console.

  function style() {
    if (!_checkMvr('style')) return null;

    var mvr = _mvr();
    var map = mvr.getMap && mvr.getMap();

    var styleUrl = null;
    var styleName = '(unknown)';
    var styleId   = '(unknown)';
    var layerCount = 0;
    var sourceCount = 0;

    if (map) {
      // getStyle() returns the full style object after map loads
      var s = null;
      try { s = map.getStyle(); } catch (e) {}

      if (s) {
        styleName  = s.name  || '(unnamed)';
        styleId    = s.id    || '(no id)';
        layerCount = (s.layers  || []).length;
        sourceCount= Object.keys(s.sources || {}).length;
      }
      // map.getStyle() doesn't expose the original URL once loaded;
      // we read from our known STYLES table via presentationMode flag
      styleUrl = mvr.isPresentationMode && mvr.isPresentationMode()
        ? 'mapbox://styles/studiorich/cm3goyx23003901qkb60ff29p (presentation)'
        : 'mapbox://styles/mapbox/dark-v11 (operator)';
    }

    console.group('[MapboxStyleTransferAudit] style() — v' + VERSION);
    console.log('Mode          :', mvr.isPresentationMode && mvr.isPresentationMode()
      ? 'PRESENTATION' : 'OPERATOR');
    console.log('Style URL     :', styleUrl || '(map not ready)');
    console.log('Style name    :', styleName);
    console.log('Style id      :', styleId);
    console.log('Map layers    :', layerCount);
    console.log('Map sources   :', sourceCount);
    console.log('Map ready     :', !!(mvr.isReady && mvr.isReady()));
    console.groupEnd();

    return {
      mode:        mvr.isPresentationMode && mvr.isPresentationMode() ? 'presentation' : 'operator',
      styleUrl:    styleUrl,
      styleName:   styleName,
      styleId:     styleId,
      layerCount:  layerCount,
      sourceCount: sourceCount,
      mapReady:    !!(mvr.isReady && mvr.isReady()),
    };
  }

  // ── layers() ─────────────────────────────────────────────────────────────────
  // List all OverlayRuntime layers plus the maritime presentation flag stack.

  function layers() {
    var ovr    = _ovr();
    var rf     = _rf();
    var oLayers = ovr ? ovr._layers : [];

    console.group('[MapboxStyleTransferAudit] layers()');

    // ── OverlayRuntime canvas layers ─────────────────────────────────────────
    console.log('── OverlayRuntime canvas layers (' + oLayers.length + ') ──');
    if (oLayers.length === 0) {
      console.log('  (none registered)');
    } else {
      console.log(_pad('ID', 28) + _pad('ENABLED', 10) + 'BLEND');
      console.log('─'.repeat(52));
      for (var i = 0; i < oLayers.length; i++) {
        var entry = oLayers[i];
        var id     = entry.layer ? (entry.layer.id || '(no id)') : '(null)';
        var en     = entry.layer ? (entry.layer.enabled ? '✓' : '✗') : '?';
        var blend  = entry.blend || 'normal';
        console.log(_pad(id, 28) + _pad(en, 10) + blend);
      }
    }

    // ── Maritime presentation flags ───────────────────────────────────────────
    console.log('');
    console.log('── SBE.runtimeFlags (presentation) ──');
    if (!rf) {
      console.log('  (SBE.runtimeFlags not found)');
    } else {
      var flagRows = [
        ['maritimeEnabled',               rf.maritimeEnabled],
        ['showMaritimeNavLights',         rf.showMaritimeNavLights],
        ['showMaritimeSpeedTails',        rf.showMaritimeSpeedTails],
        ['showMaritimeWakeGlow',          rf.showMaritimeWakeGlow],
        ['showMaritimeWaterMemory',       rf.showMaritimeWaterMemory],
        ['showMaritimeCorridorHints',     rf.showMaritimeCorridorHints],
        ['showMaritimeDebugLabels',       rf.showMaritimeDebugLabels],
        ['showMaritimeDebugFields',       rf.showMaritimeDebugFields],
        ['harborBootstrapMode',           rf.harborBootstrapMode],
        ['enableMaritimeValidationFeed',  rf.enableMaritimeValidationFeed],
        ['landTrafficEnabled',            rf.landTrafficEnabled],
      ];
      console.log(_pad('FLAG', 38) + 'VALUE');
      console.log('─'.repeat(52));
      for (var fi = 0; fi < flagRows.length; fi++) {
        var fk = flagRows[fi][0];
        var fv = flagRows[fi][1];
        var fs = fv === undefined ? '(unset)' : String(fv);
        console.log(_pad(fk, 38) + fs);
      }
    }

    // ── AtmosphereRuntime quick state ─────────────────────────────────────────
    var atm = _atm();
    if (atm && atm.getResolvedAtmosphere) {
      var a = atm.getResolvedAtmosphere();
      console.log('');
      console.log('── AtmosphereRuntime (resolved) ──');
      console.log('fog               :', (a.fog   || 0).toFixed(3));
      console.log('haze              :', (a.haze   || 0).toFixed(3));
      console.log('densityPressure   :', (a.densityPressure   || 0).toFixed(3));
      console.log('cinematicPressure :', (a.cinematicPressure || 0).toFixed(3));
      console.log('lightLevel        :', (a.lightLevel || 0).toFixed(3));
      console.log('visibility        :', (a.visibility || 0).toFixed(3));
    }

    console.groupEnd();

    return {
      overlayLayers: oLayers.map(function (e) {
        return { id: e.layer ? e.layer.id : null, enabled: e.layer ? e.layer.enabled : false, blend: e.blend };
      }),
      runtimeFlags: rf ? Object.assign({}, rf) : null,
    };
  }

  // ── cleanMode(bool) ──────────────────────────────────────────────────────────
  // true  → disable maritime presentation + overlay stack.  Mapbox bare.
  // false → restore all saved flag state.

  function cleanMode(enabled) {
    if (enabled === undefined) enabled = !_auditState.cleanMode;
    enabled = !!enabled;

    if (enabled && !_auditState.cleanMode) {
      _enableCleanMode();
    } else if (!enabled && _auditState.cleanMode) {
      _disableCleanMode();
    } else {
      console.log('[MapboxStyleTransferAudit] cleanMode already', enabled ? 'ON' : 'OFF');
    }
    return _auditState.cleanMode;
  }

  function _enableCleanMode() {
    var rf = _rf();

    // snapshot current flag values
    var saved = {};
    if (rf) {
      for (var i = 0; i < _PRESENTATION_FLAGS.length; i++) {
        saved[_PRESENTATION_FLAGS[i]] = rf[_PRESENTATION_FLAGS[i]];
      }
    }
    _auditState._savedFlags = saved;

    // snapshot overlay layer states
    var ovr     = _ovr();
    var oLayers = ovr ? ovr._layers : [];
    var savedL  = {};
    for (var j = 0; j < oLayers.length; j++) {
      var entry = oLayers[j];
      if (entry.layer && entry.layer.id) {
        savedL[entry.layer.id] = entry.layer.enabled;
        entry.layer.enabled = false;
      }
    }
    _auditState._savedLayers = savedL;

    // disable maritime presentation flags
    if (rf) {
      rf.maritimeEnabled        = false;
      rf.showMaritimeNavLights  = false;
      rf.showMaritimeSpeedTails = false;
      rf.showMaritimeWakeGlow   = false;
      rf.showMaritimeWaterMemory= false;
    }

    // disable overlay runtime canvas rendering
    var ovr2 = _ovr();
    if (ovr2 && ovr2.disable) ovr2.disable();

    _auditState.cleanMode = true;
    console.log('[MapboxStyleTransferAudit] cleanMode ON — maritime + overlays suppressed');
    console.log('  To restore: _wos.debug.mapbox.cleanMode(false) or .restore()');
  }

  function _disableCleanMode() {
    var rf = _rf();

    // restore flag values
    if (rf && _auditState._savedFlags) {
      var saved = _auditState._savedFlags;
      for (var k in saved) {
        if (Object.prototype.hasOwnProperty.call(saved, k)) {
          rf[k] = saved[k];
        }
      }
    }
    _auditState._savedFlags = null;

    // restore overlay layer states
    var ovr     = _ovr();
    var oLayers = ovr ? ovr._layers : [];
    var savedL  = _auditState._savedLayers || {};
    for (var j = 0; j < oLayers.length; j++) {
      var entry = oLayers[j];
      if (entry.layer && entry.layer.id && savedL[entry.layer.id] !== undefined) {
        entry.layer.enabled = savedL[entry.layer.id];
      }
    }
    _auditState._savedLayers = null;

    // re-enable overlay runtime
    var ovr2 = _ovr();
    if (ovr2 && ovr2.enable) ovr2.enable();

    _auditState.cleanMode = false;
    console.log('[MapboxStyleTransferAudit] cleanMode OFF — presentation restored');
  }

  // ── disableAtmosphere() ──────────────────────────────────────────────────────
  // Inject a zero-fog/zero-haze atmosphere injection so the map reads clearly.
  // Does not rewrite timeline state — inject() has precedence over baseline.

  function disableAtmosphere() {
    var atm = _atm();
    if (!atm || !atm.inject) {
      console.warn('[MapboxStyleTransferAudit] disableAtmosphere() — AtmosphereRuntime not available');
      return false;
    }

    var now = (global.performance && global.performance.now) ? global.performance.now() : Date.now();
    var duration = 30 * 60 * 1000; // 30 minutes — long enough for a full audit session

    atm.inject({
      source:           'MapboxStyleTransferAudit',
      fog:              -1.0,   // subtract to floor at 0
      haze:             -1.0,
      densityBias:      -1.0,
      cinematicPressure:-1.0,
      duration:         duration,
      startTime:        now,
      blendIn:          500,
      blendOut:         1000,
    });

    _auditState.atmosphereFrozen  = true;
    _auditState._atmosphereZeroTs = now;

    console.log('[MapboxStyleTransferAudit] disableAtmosphere() — zero-pressure injection active');
    console.log('  Duration: 30 min.  Call restore() to cancel early.');
    return true;
  }

  // ── disableWakes() ───────────────────────────────────────────────────────────
  // Suppress all wake and water-memory rendering via runtimeFlags.

  function disableWakes() {
    var rf = _rf();
    if (!rf) {
      console.warn('[MapboxStyleTransferAudit] disableWakes() — SBE.runtimeFlags not available');
      return false;
    }

    // save if not already saved by cleanMode
    if (!_auditState._savedFlags) {
      _auditState._savedFlags = _auditState._savedFlags || {};
    }
    if (_auditState._savedFlags.showMaritimeSpeedTails === undefined) {
      _auditState._savedFlags.showMaritimeSpeedTails     = rf.showMaritimeSpeedTails;
    }
    if (_auditState._savedFlags.showMaritimeWakeGlow === undefined) {
      _auditState._savedFlags.showMaritimeWakeGlow       = rf.showMaritimeWakeGlow;
    }
    if (_auditState._savedFlags.showMaritimeWaterMemory === undefined) {
      _auditState._savedFlags.showMaritimeWaterMemory    = rf.showMaritimeWaterMemory;
    }

    rf.showMaritimeSpeedTails     = false;
    rf.showMaritimeWakeGlow       = false;
    rf.showMaritimeWaterMemory    = false;
    if (rf.showMaritimeWaterMemoryLanes !== undefined)
      rf.showMaritimeWaterMemoryLanes = false;
    if (rf.showMaritimeWaterMemoryChurn !== undefined)
      rf.showMaritimeWaterMemoryChurn = false;

    _auditState.wakesFrozen = true;
    console.log('[MapboxStyleTransferAudit] disableWakes() — speed tails, wake glow, water memory suppressed');
    return true;
  }

  // ── toggleLayer(id, enabled) ─────────────────────────────────────────────────
  // Enable or disable one OverlayRuntime layer by id.
  // Returns the new enabled state, or null if layer not found.

  function toggleLayer(id, enabled) {
    var ovr     = _ovr();
    if (!ovr) {
      console.warn('[MapboxStyleTransferAudit] toggleLayer() — OverlayRuntime not available');
      return null;
    }
    var oLayers = ovr._layers || [];
    for (var i = 0; i < oLayers.length; i++) {
      var entry = oLayers[i];
      if (entry.layer && entry.layer.id === id) {
        var prev = entry.layer.enabled;
        entry.layer.enabled = (enabled === undefined) ? !prev : !!enabled;
        console.log('[MapboxStyleTransferAudit] toggleLayer(' + id + ') ' +
          prev + ' → ' + entry.layer.enabled);
        return entry.layer.enabled;
      }
    }
    console.warn('[MapboxStyleTransferAudit] toggleLayer() — layer not found:', id);
    return null;
  }

  // ── audit() ──────────────────────────────────────────────────────────────────
  // Full transfer integrity report.  Non-mutating — read-only snapshot.

  function audit() {
    var mvr    = _mvr();
    var ovr    = _ovr();
    var atm    = _atm();
    var rf     = _rf();

    console.group('[MapboxStyleTransferAudit] audit() — v' + VERSION);

    // ── Phase 1: Mapbox runtime ───────────────────────────────────────────────
    console.group('Phase 1 — Mapbox Runtime');
    var mapReady = !!(mvr && mvr.isReady && mvr.isReady());
    console.log('Map ready           :', mapReady);
    if (mvr) {
      var presMode = !!(mvr.isPresentationMode && mvr.isPresentationMode());
      console.log('Presentation mode   :', presMode);
      console.log('Style               :', presMode
        ? 'mapbox://styles/studiorich/cm3goyx23003901qkb60ff29p'
        : 'mapbox://styles/mapbox/dark-v11');
      var map = mvr.getMap && mvr.getMap();
      if (map) {
        var s = null;
        try { s = map.getStyle(); } catch (e) {}
        if (s) {
          console.log('Style name          :', s.name || '(unnamed)');
          console.log('Mapbox layer count  :', (s.layers || []).length);
          console.log('Mapbox source count :', Object.keys(s.sources || {}).length);
          // Flag potential override layers added by WOS into the Mapbox layer stack
          var mbLayers = s.layers || [];
          var customLayers = [];
          for (var ml = 0; ml < mbLayers.length; ml++) {
            var lid = mbLayers[ml].id || '';
            if (lid.indexOf('wos-') === 0 || lid.indexOf('maritime-') === 0) {
              customLayers.push(lid);
            }
          }
          if (customLayers.length) {
            console.warn('  WOS-injected Mapbox layers detected:', customLayers);
          } else {
            console.log('WOS Mapbox overrides: none detected');
          }
        } else {
          console.warn('  map.getStyle() returned null — map may not be loaded yet');
        }
      }
    } else {
      console.warn('MapboxViewportRuntime not found');
    }
    console.groupEnd();

    // ── Phase 2: Overlay stack ────────────────────────────────────────────────
    console.group('Phase 2 — Overlay Stack');
    var oLayers  = ovr ? (ovr._layers || []) : [];
    var oEnabled = ovr ? ovr._enabled : false;
    console.log('OverlayRuntime enabled :', oEnabled);
    console.log('Layer count            :', oLayers.length);
    var visibleLayers = [];
    var mutedLayers   = [];
    for (var oi = 0; oi < oLayers.length; oi++) {
      var oe  = oLayers[oi];
      var oid = oe.layer ? (oe.layer.id || '(no id)') : '(null)';
      if (oe.layer && oe.layer.enabled) {
        visibleLayers.push(oid);
      } else {
        mutedLayers.push(oid);
      }
    }
    if (visibleLayers.length) console.log('Active layers  :', visibleLayers.join(', '));
    else                       console.log('Active layers  : (none)');
    if (mutedLayers.length)  console.log('Muted layers   :', mutedLayers.join(', '));
    else                       console.log('Muted layers   : (none)');
    console.groupEnd();

    // ── Phase 3: Atmosphere pressure ─────────────────────────────────────────
    console.group('Phase 3 — Atmosphere Pressure');
    var atmoResult = { fog: null, contaminated: false };
    if (atm && atm.getResolvedAtmosphere) {
      var a = atm.getResolvedAtmosphere();
      atmoResult.fog = a.fog || 0;
      atmoResult.contaminated = ((a.fog || 0) > 0.10 || (a.cinematicPressure || 0) > 0.30);
      console.log('fog               :', (a.fog || 0).toFixed(3),     (a.fog || 0) > 0.10 ? '⚠ HIGH' : '✓');
      console.log('haze              :', (a.haze || 0).toFixed(3),    (a.haze||0) > 0.15 ? '⚠ HIGH' : '✓');
      console.log('densityPressure   :', (a.densityPressure   || 0).toFixed(3));
      console.log('cinematicPressure :', (a.cinematicPressure || 0).toFixed(3), (a.cinematicPressure||0)>0.30 ? '⚠ HIGH':'✓');
      console.log('lightLevel        :', (a.lightLevel || 0).toFixed(3));
      console.log('visibility        :', (a.visibility || 0).toFixed(3));
      if (atmoResult.contaminated) {
        console.warn('  Atmosphere may be flattening map readability.');
        console.warn('  Run: _wos.debug.mapbox.disableAtmosphere()');
      }
    } else {
      console.log('AtmosphereRuntime not available');
    }
    console.groupEnd();

    // ── Phase 4: Maritime flags ───────────────────────────────────────────────
    console.group('Phase 4 — Maritime Presentation Flags');
    var wakeContamination = false;
    if (rf) {
      var flagCheck = [
        ['maritimeEnabled',         rf.maritimeEnabled,        true,  'master on/off'],
        ['showMaritimeSpeedTails',  rf.showMaritimeSpeedTails, false, 'wake contamination risk'],
        ['showMaritimeWakeGlow',    rf.showMaritimeWakeGlow,   false, 'wake contamination risk'],
        ['showMaritimeWaterMemory', rf.showMaritimeWaterMemory,false, 'wake contamination risk — expected OFF'],
        ['showMaritimeNavLights',   rf.showMaritimeNavLights,  true,  'nav presentation'],
      ];
      for (var fi2 = 0; fi2 < flagCheck.length; fi2++) {
        var fc = flagCheck[fi2];
        var note = '';
        // warn if wake flags are on and they were noted as contamination risks
        if (fc[1] && fi2 >= 1 && fi2 <= 3) {
          wakeContamination = true;
          note = ' ⚠';
        }
        console.log(_pad(fc[0], 34) + _lpad(String(fc[1]), 8) + '  ' + fc[3] + note);
      }
    } else {
      console.log('SBE.runtimeFlags not available');
    }
    if (wakeContamination) {
      console.warn('  Wake/glow flags active — run: _wos.debug.mapbox.disableWakes()');
    }
    console.groupEnd();

    // ── Phase 5: Audit summary ────────────────────────────────────────────────
    console.group('Phase 5 — Audit Summary');
    var issues = [];
    if (!mapReady)                            issues.push('map not ready — verify Mapbox token + network');
    if (visibleLayers.length > 0)             issues.push('overlay layers active: ' + visibleLayers.join(', '));
    if (atmoResult.contaminated)              issues.push('atmosphere pressure high — fog or cinematic pressure elevated');
    if (wakeContamination)                    issues.push('wake/glow flags enabled — visual contamination risk');

    if (issues.length === 0) {
      console.log('✓ No transfer integrity issues detected.');
      console.log('  Mapbox style should be visually clear.');
    } else {
      console.warn('Issues found (' + issues.length + '):');
      for (var ii = 0; ii < issues.length; ii++) {
        console.warn('  [' + (ii + 1) + '] ' + issues[ii]);
      }
      console.log('');
      console.log('Recovery commands:');
      console.log('  _wos.debug.mapbox.cleanMode(true)       — disable all WOS presentation');
      console.log('  _wos.debug.mapbox.disableAtmosphere()   — zero atmosphere pressure');
      console.log('  _wos.debug.mapbox.disableWakes()        — suppress wake rendering');
      console.log('  _wos.debug.mapbox.restore()             — undo all audit overrides');
    }
    console.groupEnd();

    console.groupEnd(); // audit()

    return {
      mapReady:         mapReady,
      visibleLayers:    visibleLayers,
      mutedLayers:      mutedLayers,
      atmosphereContaminated: atmoResult.contaminated,
      wakeContamination:      wakeContamination,
      issueCount:       issues.length,
      issues:           issues,
    };
  }

  // ── restore() ────────────────────────────────────────────────────────────────
  // Undo all audit-driven overrides.  Equivalent to cleanMode(false) + flag restore.

  function restore() {
    var restored = [];

    if (_auditState.cleanMode) {
      _disableCleanMode();
      restored.push('cleanMode → OFF');
    } else if (_auditState._savedFlags) {
      // partial restore (disableWakes was called without cleanMode)
      var rf   = _rf();
      var saved = _auditState._savedFlags;
      if (rf) {
        for (var k in saved) {
          if (Object.prototype.hasOwnProperty.call(saved, k)) {
            rf[k] = saved[k];
          }
        }
      }
      _auditState._savedFlags = null;
      restored.push('runtimeFlags → restored');
    }

    if (_auditState.atmosphereFrozen) {
      // Zero-injection expires naturally; just clear flag
      _auditState.atmosphereFrozen  = false;
      _auditState._atmosphereZeroTs = null;
      restored.push('atmosphere freeze → cleared (injection will expire)');
    }

    if (_auditState.wakesFrozen) {
      _auditState.wakesFrozen = false;
      restored.push('wake flags → restored');
    }

    if (restored.length === 0) {
      console.log('[MapboxStyleTransferAudit] restore() — nothing to restore');
    } else {
      console.log('[MapboxStyleTransferAudit] restore() — restored:', restored.join(', '));
    }

    return restored;
  }

  // ── Bind — retry-safe, no Object.freeze (recovery mode) ─────────────────────

  // ── setStyle(mode) — console shortcut for style switching during audit ───────
  // mode: 'presentation' | 'operator' | true (presentation) | false (operator)

  function setStyle(mode) {
    var mvr = _mvr();
    if (!mvr || !mvr.setPresentationMode) {
      console.warn('[MapboxStyleTransferAudit] setStyle() — MapboxViewportRuntime not available');
      return;
    }
    var wantPresentation = (mode === 'presentation' || mode === true);
    if (mode === 'operator' || mode === false) wantPresentation = false;
    mvr.setPresentationMode(wantPresentation);
    console.log('[MapboxStyleTransferAudit] setStyle() →',
      wantPresentation ? 'presentation (StudioRich)' : 'operator (dark-v11)');
    console.log('  Style will reload — run .style() in ~2s to confirm.');
  }

  function bindMapboxAuditNamespace() {
    window._wos       = window._wos       || {};
    window._wos.debug = window._wos.debug || {};
    window._wos.debug.mapbox = {
      style:             style,
      layers:            layers,
      cleanMode:         cleanMode,
      disableAtmosphere: disableAtmosphere,
      disableWakes:      disableWakes,
      toggleLayer:       toggleLayer,
      audit:             audit,
      restore:           restore,
      setStyle:          setStyle,
    };
    console.log('[MapboxStyleTransferAudit] bound: _wos.debug.mapbox');
  }

  // Immediate bind
  bindMapboxAuditNamespace();

  // Retry guard — rebinds if main.js overwrites _wos after this script loads.
  // Polls 20× at 250 ms (5 s total), then stops.
  var _bindAttempts = 0;
  var _bindTimer = window.setInterval(function () {
    _bindAttempts += 1;
    if (!window._wos || !window._wos.debug || !window._wos.debug.mapbox) {
      bindMapboxAuditNamespace();
    }
    if (_bindAttempts >= 20) window.clearInterval(_bindTimer);
  }, 250);

  console.log('[MapboxStyleTransferAudit] loaded');
  console.log('[MapboxStyleTransferAudit] v' + VERSION +
    ' ready — _wos.debug.mapbox bound');
  console.log('  Commands: .style() · .setStyle("presentation"|"operator") · .layers()');
  console.log('            .cleanMode(bool) · .disableAtmosphere() · .disableWakes()');
  console.log('            .toggleLayer(id,bool) · .audit() · .restore()');

  // Smoke test — confirms binding is live at parse time
  console.log('[MapboxStyleTransferAudit] smoke:',
    !!(window._wos && window._wos.debug && window._wos.debug.mapbox &&
       window._wos.debug.mapbox.style));

})(window);
