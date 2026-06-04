// ── PresentationAuthorityAudit v1.0.0 ─────────────────────────────────────────
// 0601F_WOS_PresentationAuthorityAudit_v1.0.0
// Status: active
// Classification: debug-tooling / presentation-authority
//
// Single authoritative audit layer that explains WHY the world looks the way it
// looks. Reports, diffs, restores, resets, and attributes ownership of the active
// presentation state across map style, surface presets, altitude rendering,
// harbor overlays, navigation suppression, and Mapbox style layers.
//
// Doctrine: Before tuning presentation, identify presentation ownership.
//
// Authority:
//   READS:  all presentation subsystems' public state APIs (guarded)
//   WRITES: only by DELEGATING to MapSurfaceRecovery / SurfaceStylePresetRuntime
//   MUST NOT: mutate vehicle/route/camera/runtime state, remove layers/sources,
//             reload the page, or throw into RAF.
//
// Binds: _wos.debug.presentation.{state,owners,diff,restore,reset,classify}
//
// Placement: wall/systems/presentation/presentationAuthorityAudit.js
// Load: AFTER mapSurfaceRecovery.js (delegates to it)
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  // Last-known owner snapshot ring (lightweight event log)
  var _ownerEvents = [];
  var MAX_EVENTS   = 40;
  var _lastRestoreAt = null;
  var _lastResetAt   = null;

  function recordOwnerEvent(owner, action, target, value) {
    _ownerEvents.push({ owner: owner, action: action, target: target, value: value, timestamp: Date.now() });
    if (_ownerEvents.length > MAX_EVENTS) _ownerEvents.shift();
  }
  // Expose so other modules may push events
  SBE._presentationOwnerEvent = recordOwnerEvent;

  // ── Subsystem accessors (all guarded) ──────────────────────────────────────────

  function _map() {
    var mvr = SBE.MapboxViewportRuntime;
    var m   = mvr && typeof mvr.getMap === 'function' ? mvr.getMap() : null;
    if (!m && SBE.map) m = SBE.map;
    return m;
  }
  function _styleLoaded(m) { try { return !!(m && m.isStyleLoaded()); } catch (e) { return false; } }
  function _u(v) { return v == null ? 'unknown' : v; }

  function _altitudeProfile() {
    var nav = global._wos && global._wos.nav;
    if (nav && nav.altStep && nav.altStep.label) return nav.altStep.label;
    var awr = SBE.AltitudeAwareWorldRenderer;
    if (awr && typeof awr.getState === 'function') {
      var s = awr.getState();
      if (s && s.mode) return s.mode;
    }
    return 'unknown';
  }

  function _activeSurfacePreset() {
    var ssr = SBE.SurfaceStylePresetRuntime;
    if (ssr && typeof ssr.getActivePreset === 'function') {
      var p = ssr.getActivePreset();
      return p ? (p.presetId || p.displayName || 'active') : null;
    }
    return 'unknown';
  }

  function _mapStyleMode() {
    var mvr = SBE.MapboxViewportRuntime;
    if (mvr && typeof mvr.isPresentationMode === 'function') {
      try { return mvr.isPresentationMode() ? 'presentation' : 'standard'; } catch (e) {}
    }
    return 'unknown';
  }

  function _mapStyleUrl(m) {
    try {
      var s = m.getStyle();
      return (s && (s.sprite || s.name)) ? (s.name || s.sprite) : 'unknown';
    } catch (e) { return 'unknown'; }
  }

  function _harborOverlayEnabled() {
    var hr = SBE.HarborGeometryRuntimeRenderer;
    if (hr && typeof hr.isEnabled === 'function') { try { return hr.isEnabled(); } catch (e) {} }
    return 'unknown';
  }

  // ── presentation.state() ────────────────────────────────────────────────────────

  function state() {
    var m = _map();
    var loaded = _styleLoaded(m);
    var audit = null;
    var recovery = SBE.MapSurfaceRecovery;
    if (recovery && typeof recovery.surfaceAudit === 'function') {
      try { audit = recovery.surfaceAudit(); } catch (e) {}
    }

    var out = {
      ok:            !!m,
      styleLoaded:   loaded,
      mapboxStyleUrl: m ? _mapStyleUrl(m) : 'unknown',
      projection:    'unknown',
      zoom:          null, pitch: null, bearing: null,
      altitudeProfile:        _altitudeProfile(),
      activeSurfacePreset:    _activeSurfacePreset(),
      activePresentationMode: _mapStyleMode(),
      activeMapStyleMode:     _mapStyleMode(),
      harborOverlayEnabled:   _harborOverlayEnabled(),
      harborPresentationSafe: (_harborOverlayEnabled() === false),
      recoveryLastRun:        _lastRestoreAt || _lastResetAt || null,
      suspiciousLayerCounts:  audit ? {
        suspicious:      audit.suspiciousLayers.length,
        visibleDebug:    audit.visibleDebugLayers.length,
        cyanLine:        audit.cyanLineLayers.length,
        blackFill:       audit.blackFillLayers.length,
        transparentLand: audit.transparentFillLayers.length,
      } : 'unknown',
      baseLayerSummary: audit ? {
        protectedBaseLayers: audit.protectedBaseLayers.length,
        harborLayers:        audit.harborLayers.length,
        terrainLayers:       audit.terrainLayers.length,
      } : 'unknown',
      ownerSummary: null,
    };
    if (m) {
      try { out.projection = m.getProjection ? m.getProjection().name : 'unknown'; } catch (e) {}
      try { out.zoom = Math.round(m.getZoom() * 10) / 10; } catch (e) {}
      try { out.pitch = Math.round(m.getPitch() * 10) / 10; } catch (e) {}
      try { out.bearing = Math.round(m.getBearing()); } catch (e) {}
    }
    out.ownerSummary = _ownersBrief();

    console.group('[presentation] state() — ' + classify());
    console.log('styleLoaded   :', out.styleLoaded, '| mode:', out.activeMapStyleMode);
    console.log('mapboxStyle   :', out.mapboxStyleUrl);
    console.log('altitude      :', out.altitudeProfile);
    console.log('surfacePreset :', _u(out.activeSurfacePreset));
    console.log('harborOverlay :', out.harborOverlayEnabled, '| presentationSafe:', out.harborPresentationSafe);
    console.log('suspicious    :', JSON.stringify(out.suspiciousLayerCounts));
    console.log('baseLayers    :', JSON.stringify(out.baseLayerSummary));
    console.log('classification:', classify());
    console.log('→ next: _wos.debug.presentation.owners() / .diff() / .restore()');
    console.groupEnd();
    return out;
  }

  // ── presentation.owners() ────────────────────────────────────────────────────────

  function _ownersBrief() {
    var preset = _activeSurfacePreset();
    var presetOwns = preset && preset !== 'unknown' && preset !== null;
    return {
      surfacePreset: presetOwns ? preset : 'none',
      mapStyleMode:  _mapStyleMode(),
      altitude:      _altitudeProfile(),
      harborOverlay: _harborOverlayEnabled(),
    };
  }

  function owners() {
    var m = _map();
    var preset    = _activeSurfacePreset();
    var presetOwns = preset && preset !== 'unknown' && preset !== null;
    var styleMode = _mapStyleMode();
    var harborOn  = _harborOverlayEnabled();

    // Read live base-layer colours from the style for value reporting
    function _layerColorById(matcher) {
      if (!m) return { value: 'unknown', layerId: null };
      var style = null; try { style = m.getStyle(); } catch (e) {}
      var layers = (style && style.layers) ? style.layers : [];
      for (var i = 0; i < layers.length; i++) {
        var l = layers[i];
        if (l.type === 'custom') continue;
        if (String(l.id).toLowerCase().indexOf(matcher) === -1) continue;
        var p = l.paint || {};
        var c = p['fill-color'] || p['line-color'] || p['background-color'] || p['fill-extrusion-color'];
        if (c != null) return { value: (typeof c === 'string' ? c : '[expr]'), layerId: l.id };
      }
      return { value: 'unknown', layerId: null };
    }

    // Owner attribution: a surface preset, when active, is the highest-confidence
    // claimant on base colours (it rewrites the Mapbox style). Mapbox presentation
    // mode is the next claimant. Live overrides from MapStyleAuthority raise confidence.
    var msaOverride = null;
    var msa = SBE.MapStyleAuthority;
    if (msa && typeof msa.getActiveLiveOverride === 'function') {
      try { msaOverride = msa.getActiveLiveOverride(); } catch (e) {}
    }

    function _surfaceOwner(matcher) {
      var lc = _layerColorById(matcher);
      var owner = presetOwns ? ('SurfaceStylePreset:' + preset)
                : (styleMode === 'presentation') ? 'MapboxPresentationStyle'
                : (styleMode === 'standard') ? 'MapboxStandardStyle' : 'unknown';
      var confidence = presetOwns ? 'high'
                     : (styleMode !== 'unknown') ? 'medium' : 'low';
      if (msaOverride) confidence = 'high';
      return { owner: owner, value: lc.value, layerId: lc.layerId, confidence: confidence };
    }

    var debugAudit = null;
    var recovery = SBE.MapSurfaceRecovery;
    if (recovery && typeof recovery.surfaceAudit === 'function') {
      try { debugAudit = recovery.surfaceAudit(); } catch (e) {}
    }
    var debugVisible = debugAudit ? debugAudit.visibleDebugLayers.length : 0;

    var result = {
      land:      _surfaceOwner('land'),
      water:     _surfaceOwner('water'),
      roads:     _surfaceOwner('road'),
      buildings: (function () {
        var lc = _layerColorById('building');
        return { owner: presetOwns ? ('SurfaceStylePreset:' + preset) : 'MapboxStyle',
                 value: lc.value, layerId: lc.layerId,
                 confidence: lc.layerId ? (presetOwns ? 'high' : 'medium') : 'unknown' };
      }()),
      harbor: {
        owner: 'HarborGeometryRuntimeRenderer',
        value: harborOn === true ? 'overlay-enabled' : harborOn === false ? 'overlay-hidden' : 'unknown',
        confidence: harborOn === 'unknown' ? 'unknown' : 'high',
      },
      debugOverlays: {
        owner: debugVisible > 0 ? 'mixed-debug-modules' : 'none-visible',
        value: debugVisible + ' visible',
        confidence: debugAudit ? 'high' : 'low',
      },
      altitude: {
        owner: 'AltitudeAwareWorldRenderer',
        value: _altitudeProfile(),
        confidence: _altitudeProfile() === 'unknown' ? 'unknown' : 'medium',
      },
      symbolSuppression: {
        owner: 'NavigationSymbolSuppressor',
        value: (SBE.NavigationSymbolSuppressor && typeof SBE.NavigationSymbolSuppressor.getState === 'function')
          ? (SBE.NavigationSymbolSuppressor.getState().active ? 'active' : 'inactive') : 'unknown',
        confidence: SBE.NavigationSymbolSuppressor ? 'high' : 'unknown',
      },
    };

    console.group('[presentation] owners()');
    ['land','water','roads','buildings','harbor','debugOverlays','altitude','symbolSuppression'].forEach(function (k) {
      var o = result[k];
      console.log((k + '           ').slice(0, 18), '→', o.owner,
        '| value:', o.value, '| confidence:', o.confidence);
    });
    console.groupEnd();
    return result;
  }

  // ── presentation.classify() ──────────────────────────────────────────────────────

  function classify() {
    var m = _map();
    if (!m) return 'map_unavailable';
    if (!_styleLoaded(m)) return 'style_not_loaded';

    var recovery = SBE.MapSurfaceRecovery;
    var audit = null;
    if (recovery && typeof recovery.surfaceAudit === 'function') {
      try { audit = recovery.surfaceAudit(); } catch (e) {}
    }
    if (audit && audit.visibleDebugLayers.length > 0) return 'debug_overlay_leak';
    if (_harborOverlayEnabled() === true && audit && audit.cyanLineLayers.length === 0) {
      // harbor canvas on but no cyan style lines → harbor overlay is the leak
      return 'harbor_overlay_leak';
    }
    var preset = _activeSurfacePreset();
    if (preset && preset !== 'unknown' && preset !== null) return 'surface_preset_active';

    // base layers missing?
    if (recovery && typeof recovery.validateSurface === 'function') {
      try {
        var v = recovery.validateSurface();
        if (v && v.failures && v.failures.some(function (f) { return /missing/.test(f); })) {
          return 'base_layer_missing';
        }
      } catch (e) {}
    }
    if (_mapStyleMode() === 'presentation') return 'mapbox_style_transfer_mismatch';
    return 'unknown_presentation_owner';
  }

  // ── presentation.diff() — against production_readable baseline ──────────────────

  function diff() {
    var m = _map();
    var result = {
      matchesBaseline: false, differences: [], riskyLayers: [],
      missingBaseLayers: [], unexpectedVisibleLayers: [], unexpectedPaintValues: [],
    };
    if (!m) { result.differences.push('map_unavailable'); console.warn('[presentation] diff: map_unavailable'); return result; }
    if (!_styleLoaded(m)) { result.differences.push('style_not_loaded'); console.warn('[presentation] diff: style_not_loaded'); return result; }

    var recovery = SBE.MapSurfaceRecovery;
    var audit = recovery && recovery.surfaceAudit ? recovery.surfaceAudit() : null;
    var validate = recovery && recovery.validateSurface ? recovery.validateSurface() : null;

    // production_readable baseline: land/water/roads/buildings visible, debug hidden,
    // harbor canvas hidden, no cyan grid, no black land takeover.
    if (validate) {
      validate.failures.forEach(function (f) {
        if (/missing/.test(f)) result.missingBaseLayers.push(f);
        result.differences.push(f);
      });
    }
    if (audit) {
      audit.visibleDebugLayers.forEach(function (l) {
        result.unexpectedVisibleLayers.push(l.id);
        result.differences.push('debug layer visible: ' + l.id);
      });
      audit.cyanLineLayers.forEach(function (l) {
        result.riskyLayers.push(l.id);
        result.unexpectedPaintValues.push({ id: l.id, color: l.color, reason: 'cyan' });
      });
      audit.blackFillLayers.forEach(function (l) {
        result.riskyLayers.push(l.id);
        result.unexpectedPaintValues.push({ id: l.id, color: l.color, reason: 'black_fill' });
      });
    }
    if (_harborOverlayEnabled() === true) {
      result.differences.push('harbor diagnostic canvas enabled');
      result.riskyLayers.push('HarborGeometryRuntimeRenderer(canvas)');
    }
    var preset = _activeSurfacePreset();
    if (preset && preset !== 'unknown' && preset !== null) {
      result.differences.push('active surface preset: ' + preset + ' (may impose neon look)');
    }

    result.matchesBaseline = (result.differences.length === 0);

    console.group('[presentation] diff() — ' + (result.matchesBaseline ? 'MATCHES baseline' : 'DIFFERS from production_readable'));
    result.differences.forEach(function (d) { console.warn('  ✗', d); });
    if (result.riskyLayers.length) console.log('  riskyLayers:', result.riskyLayers.join(', '));
    if (result.missingBaseLayers.length) console.log('  missingBase:', result.missingBaseLayers.join(', '));
    console.groupEnd();
    return result;
  }

  // ── presentation.restore() — delegate to recovery, no runtime mutation ───────────

  function restore() {
    var report = { applied: false, restoredPreset: null, hiddenLayers: [], restoredLayers: [],
                   paintResetLayers: [], warnings: [] };
    var m = _map();
    if (!m) { report.warnings.push('map_unavailable'); console.warn('[presentation] restore: map_unavailable'); return report; }
    if (!_styleLoaded(m)) { report.warnings.push('style_not_loaded'); console.warn('[presentation] restore: style_not_loaded'); return report; }

    var recovery = SBE.MapSurfaceRecovery;

    // 1-3. Hide debug + harbor canvas, restore base layers (delegated)
    if (recovery && typeof recovery.recoverSurface === 'function') {
      var rec = recovery.recoverSurface();
      report.hiddenLayers   = rec.hiddenLayers   || [];
      report.restoredLayers = rec.restoredLayers || [];
      (rec.warnings || []).forEach(function (w) { report.warnings.push(w); });
    } else {
      report.warnings.push('MapSurfaceRecovery_unavailable');
    }

    // 2. Ensure harbor presentation-safe (overlay hidden)
    if (recovery && typeof recovery.harborPresentationSafe === 'function') {
      try { recovery.harborPresentationSafe(false); } catch (e) { report.warnings.push('harbor_safe_failed'); }
    }

    // 4. Reapply safe production preset (no page reload)
    if (recovery && typeof recovery.resetToPresentationBase === 'function') {
      var pr = recovery.resetToPresentationBase();
      if (pr && pr.applied) report.restoredPreset = pr.preset;
      else (pr && pr.warnings || []).forEach(function (w) { report.warnings.push(w); });
    }

    // 5-6. Vehicle layer / route / runtime / camera are NEVER touched here.
    report.applied = true;
    _lastRestoreAt = Date.now();
    recordOwnerEvent('PresentationAuthorityAudit', 'restore', 'surface', report.restoredPreset || 'recovered');

    console.group('[presentation] restore()');
    console.log('hidden  :', report.hiddenLayers.length ? report.hiddenLayers.join(', ') : '(none)');
    console.log('restored:', report.restoredLayers.length ? report.restoredLayers.join(', ') : '(none)');
    console.log('preset  :', report.restoredPreset || '(none reapplied)');
    if (report.warnings.length) report.warnings.forEach(function (w) { console.warn('  ⚠', w); });
    console.log('→ next: _wos.debug.presentation.state() to confirm readable baseline');
    console.groupEnd();
    return report;
  }

  // ── presentation.reset() — harder, still no reload/runtime restart ──────────────

  function reset() {
    var report = { applied: false, steps: [], warnings: [] };
    var m = _map();
    if (!m) { report.warnings.push('map_unavailable'); console.warn('[presentation] reset: map_unavailable'); return report; }
    if (!_styleLoaded(m)) { report.warnings.push('style_not_loaded'); console.warn('[presentation] reset: style_not_loaded'); return report; }

    // Clear presentation-only debug overrides from MapStyleAuthority
    var msa = SBE.MapStyleAuthority;
    if (msa && typeof msa.clearLiveOverride === 'function') {
      try { msa.clearLiveOverride(); report.steps.push('cleared_live_override'); }
      catch (e) { report.warnings.push('clear_override_failed'); }
    }

    // Run full restore (debug hide + base restore + preset reapply + harbor safe)
    var r = restore();
    report.steps.push('restore_applied');
    (r.warnings || []).forEach(function (w) { report.warnings.push(w); });

    // Disable navigation symbol suppressor's debug-driven state? No — leave production
    // suppression intact (arrows). Only ensure no debug overlays remain.
    var recovery = SBE.MapSurfaceRecovery;
    if (recovery && typeof recovery.validateSurface === 'function') {
      try {
        var v = recovery.validateSurface();
        if (!v.valid) report.warnings.push('post_reset_still_invalid:' + v.failures.join('|'));
      } catch (e) {}
    }

    report.applied = true;
    _lastResetAt = Date.now();
    recordOwnerEvent('PresentationAuthorityAudit', 'reset', 'presentation', 'production_readable');

    console.group('[presentation] reset()');
    console.log('steps   :', report.steps.join(' → '));
    if (report.warnings.length) report.warnings.forEach(function (w) { console.warn('  ⚠', w); });
    console.log('NOTE: no page reload, no route restart, no actor clearing performed.');
    console.groupEnd();
    return report;
  }

  // ── Bind namespace ──────────────────────────────────────────────────────────────

  function _bind() {
    global._wos       = global._wos       || {};
    global._wos.debug = global._wos.debug || {};
    global._wos.debug.presentation = {
      state:    state,
      owners:   owners,
      diff:     diff,
      restore:  restore,
      reset:    reset,
      classify: classify,
      events:   function () { console.table ? console.table(_ownerEvents) : console.log(_ownerEvents); return _ownerEvents.slice(); },
    };
  }
  _bind();
  global.setTimeout(_bind, 500);
  global.setTimeout(_bind, 1500);
  global.setTimeout(_bind, 3000);

  SBE.PresentationAuthorityAudit = Object.freeze({
    VERSION:  VERSION,
    state:    state,
    owners:   owners,
    diff:     diff,
    restore:  restore,
    reset:    reset,
    classify: classify,
  });

  console.log('[PresentationAuthorityAudit] v' + VERSION + ' loaded — _wos.debug.presentation.state()');

})(window);
