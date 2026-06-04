// ── MapSurfaceRecovery v1.0.0 ─────────────────────────────────────────────────
// 0601E_WOS_MapSurfaceStyleRecovery_v1.0.0
// Status: active
// Classification: debug-tooling / presentation-recovery
//
// Recovers readable Mapbox surface rendering after style/overlay corruption.
// Operates ONLY through:
//   map.setLayoutProperty(id, 'visibility', 'none'|'visible')
//   map.setPaintProperty(id, prop, value)
// Never removes layers or sources. Never reloads the style. Never touches
// 'custom' layers (the world-space vehicle layer). Never throws into RAF.
//
// Authority:
//   READS:  active Mapbox style via MapboxViewportRuntime.getMap()
//   WRITES: layer visibility / paint only, on debug-classified layers
//   MUST NOT: alter actor/camera/route/vehicle state, remove layers/sources
//
// Binds:
//   _wos.debug.mapStyle.surfaceAudit()
//   _wos.debug.mapStyle.recoverSurface()
//   _wos.debug.mapStyle.resetToPresentationBase()
//   _wos.debug.presets.validateSurface()
//   _wos.debug.harborGeometry.presentationSafe(bool)   (added if absent)
//
// Placement: wall/systems/presentation/mapSurfaceRecovery.js
// Load: AFTER mapStyleAuthority.js + harbor/preset runtimes (debug companion)
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  // ── Layer family classifiers ──────────────────────────────────────────────────
  var PROTECTED = [
    'land', 'water', 'road', 'bridge', 'tunnel', 'building', 'park',
    'poi-label', 'road-label', 'waterway-label', 'place-label',
    'background', 'landuse', 'landcover', 'hillshade', 'coastline',
    'admin', 'boundary', 'ferry', 'rail', 'transit', 'pier',
  ];
  var DEBUG_FAMILIES = [
    'debug', 'diagnostic', 'wire', 'grid-debug', 'harbor-debug',
    'geometry-debug', 'tile-debug', 'validation-debug', 'probe', 'test',
    'wireframe', '-grid', 'overlay-debug',
  ];

  function _getMap() {
    var mvr = SBE.MapboxViewportRuntime;
    var m   = mvr && typeof mvr.getMap === 'function' ? mvr.getMap() : null;
    if (!m && SBE.map) m = SBE.map;
    return m;
  }

  function _styleLoaded(map) {
    if (!map) return false;
    try { return map.isStyleLoaded(); } catch (e) { return false; }
  }

  function _matchAny(str, keywords) {
    if (!str) return false;
    var s = String(str).toLowerCase();
    for (var i = 0; i < keywords.length; i++) {
      if (s.indexOf(keywords[i]) !== -1) return true;
    }
    return false;
  }

  function _isProtected(layer) {
    return _matchAny(layer.id, PROTECTED) || _matchAny(layer['source-layer'], PROTECTED);
  }
  function _isDebug(layer) {
    return _matchAny(layer.id, DEBUG_FAMILIES) ||
           _matchAny(layer.source, DEBUG_FAMILIES) ||
           _matchAny(layer['source-layer'], DEBUG_FAMILIES);
  }

  // Parse a paint colour string → {r,g,b} 0–255, or null for expressions/unknown.
  function _parseColor(c) {
    if (typeof c !== 'string') return null;   // skip expression arrays/objects
    c = c.trim().toLowerCase();
    if (c[0] === '#') {
      var hex = c.slice(1);
      if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
      if (hex.length < 6) return null;
      return { r: parseInt(hex.slice(0,2),16), g: parseInt(hex.slice(2,4),16), b: parseInt(hex.slice(4,6),16) };
    }
    var m = c.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
    if (m) return { r: +m[1], g: +m[2], b: +m[3] };
    return null;   // hsl / named colours not parsed (conservative)
  }

  function _isCyan(rgb) {
    if (!rgb) return false;
    // cyan / electric-blue: strong green+blue, weak red
    return (rgb.g > 140 && rgb.b > 140 && rgb.r < 120) ||
           (rgb.b > 185 && rgb.r < 100 && rgb.g < 170);
  }
  function _isBlack(rgb) {
    if (!rgb) return false;
    return rgb.r < 28 && rgb.g < 28 && rgb.b < 28;
  }

  function _layerColor(layer) {
    var p = layer.paint || {};
    if (layer.type === 'fill')   return p['fill-color'];
    if (layer.type === 'line')   return p['line-color'];
    if (layer.type === 'background') return p['background-color'];
    if (layer.type === 'fill-extrusion') return p['fill-extrusion-color'];
    return null;
  }

  // ── surfaceAudit ──────────────────────────────────────────────────────────────

  function surfaceAudit() {
    var map = _getMap();
    var out = {
      styleLoaded: _styleLoaded(map),
      projection:  null, zoom: null, pitch: null, bearing: null,
      cameraProfile: (global._wos && global._wos.nav && global._wos.nav.altStep)
        ? global._wos.nav.altStep.label : null,
      suspiciousLayers: [], visibleDebugLayers: [], transparentFillLayers: [],
      blackFillLayers: [], cyanLineLayers: [], harborLayers: [],
      terrainLayers: [], protectedBaseLayers: [],
    };
    if (!map || !out.styleLoaded) {
      console.warn('[mapStyle] surfaceAudit: style_not_loaded');
      return out;
    }
    try { out.projection = map.getProjection ? map.getProjection().name : null; } catch (e) {}
    try { out.zoom = Math.round(map.getZoom() * 10) / 10; } catch (e) {}
    try { out.pitch = Math.round(map.getPitch() * 10) / 10; } catch (e) {}
    try { out.bearing = Math.round(map.getBearing()); } catch (e) {}

    var style = null;
    try { style = map.getStyle(); } catch (e) {}
    var layers = (style && style.layers) ? style.layers : [];

    function _vis(id) { try { return map.getLayoutProperty(id, 'visibility') || 'visible'; } catch (e) { return 'visible'; } }
    function _entry(l) {
      var p = l.paint || {};
      return {
        id: l.id, type: l.type, source: l.source || null,
        sourceLayer: l['source-layer'] || null,
        visibility: _vis(l.id),
        minzoom: l.minzoom != null ? l.minzoom : null,
        maxzoom: l.maxzoom != null ? l.maxzoom : null,
        color: _layerColor(l) || null,
        fillOpacity: p['fill-opacity'] != null ? p['fill-opacity'] : null,
        lineWidth: p['line-width'] != null ? p['line-width'] : null,
      };
    }

    layers.forEach(function (l) {
      if (l.type === 'custom') return;   // never touch vehicle/custom layers
      var vis = _vis(l.id);
      var rgb = _parseColor(_layerColor(l));
      var p   = l.paint || {};
      var isLandlike = _matchAny(l.id, ['land', 'water', 'landuse', 'landcover']);

      if (_isProtected(l)) out.protectedBaseLayers.push(l.id);
      if (_matchAny(l.id, ['harbor']) || _matchAny(l.source, ['harbor'])) out.harborLayers.push(_entry(l));
      if (_matchAny(l.id, ['terrain', 'hillshade', '3d-terrain'])) out.terrainLayers.push(_entry(l));

      if (vis !== 'none' && _isDebug(l)) out.visibleDebugLayers.push(_entry(l));

      // suspicious — cyan
      if (rgb && _isCyan(rgb) && !_isProtected(l)) {
        if (l.type === 'line') out.cyanLineLayers.push(_entry(l));
        out.suspiciousLayers.push(Object.assign(_entry(l), { reason: 'cyan_color' }));
      }
      // suspicious — black fill, high opacity
      if (l.type === 'fill' && rgb && _isBlack(rgb)) {
        var fo = p['fill-opacity'];
        if (fo == null || (typeof fo === 'number' && fo >= 0.8)) {
          out.blackFillLayers.push(_entry(l));
          if (!_isProtected(l)) out.suspiciousLayers.push(Object.assign(_entry(l), { reason: 'black_fill_high_opacity' }));
        }
      }
      // suspicious — transparent landlike fill
      if (l.type === 'fill' && isLandlike && typeof p['fill-opacity'] === 'number' && p['fill-opacity'] < 0.25) {
        out.transparentFillLayers.push(_entry(l));
        out.suspiciousLayers.push(Object.assign(_entry(l), { reason: 'land_fill_too_transparent' }));
      }
      // suspicious — fat non-road diagnostic line
      if (l.type === 'line' && typeof p['line-width'] === 'number' && p['line-width'] > 8 &&
          !_matchAny(l.id, ['road', 'bridge', 'tunnel', 'motorway'])) {
        out.suspiciousLayers.push(Object.assign(_entry(l), { reason: 'fat_diagnostic_line' }));
      }
    });

    console.group('[mapStyle] surfaceAudit()');
    console.log('styleLoaded:', out.styleLoaded, '| zoom:', out.zoom, '| pitch:', out.pitch,
      '| profile:', out.cameraProfile || '—');
    console.log('suspicious:', out.suspiciousLayers.length,
      '| visibleDebug:', out.visibleDebugLayers.length,
      '| cyanLine:', out.cyanLineLayers.length,
      '| blackFill:', out.blackFillLayers.length,
      '| transparentLand:', out.transparentFillLayers.length);
    if (out.suspiciousLayers.length) {
      out.suspiciousLayers.forEach(function (s) { console.warn('  ⚠', s.id, '—', s.reason, '|', s.color || ''); });
    }
    // Harbor canvas overlay (not a style layer) — report separately
    var hr = SBE.HarborGeometryRuntimeRenderer;
    if (hr && typeof hr.isEnabled === 'function' && hr.isEnabled()) {
      console.warn('  ⚠ HarborGeometryRuntimeRenderer canvas overlay is ENABLED (possible cyan grid). '
        + 'Use _wos.debug.harborGeometry.presentationSafe(false) to hide.');
    }
    console.groupEnd();
    return out;
  }

  // ── recoverSurface ──────────────────────────────────────────────────────────────

  function recoverSurface() {
    var report = { applied: false, hiddenLayers: [], restoredLayers: [], skippedLayers: [], warnings: [] };
    var map = _getMap();
    if (!map || !_styleLoaded(map)) {
      report.warnings.push('style_not_loaded');
      console.warn('[mapStyle] recoverSurface: style_not_loaded');
      return report;
    }

    var audit = surfaceAudit();

    // 1. Hide visible debug-only layers
    audit.visibleDebugLayers.forEach(function (l) {
      try { map.setLayoutProperty(l.id, 'visibility', 'none'); report.hiddenLayers.push(l.id); }
      catch (e) { report.warnings.push('hide_failed:' + l.id + ':' + (e && e.message)); }
    });

    // 2. Hide cyan diagnostic lines that are NOT protected
    audit.cyanLineLayers.forEach(function (l) {
      if (_matchAny(l.id, PROTECTED)) { report.skippedLayers.push(l.id + ' (protected)'); return; }
      try { map.setLayoutProperty(l.id, 'visibility', 'none'); report.hiddenLayers.push(l.id); }
      catch (e) { report.warnings.push('hide_failed:' + l.id); }
    });

    // 3. Restore protected base layers that were hidden
    var style = null; try { style = map.getStyle(); } catch (e) {}
    var layers = (style && style.layers) ? style.layers : [];
    layers.forEach(function (l) {
      if (l.type === 'custom') return;
      if (!_isProtected(l)) return;
      var vis = 'visible';
      try { vis = map.getLayoutProperty(l.id, 'visibility') || 'visible'; } catch (e) {}
      if (vis === 'none') {
        try { map.setLayoutProperty(l.id, 'visibility', 'visible'); report.restoredLayers.push(l.id); }
        catch (e) { report.warnings.push('restore_failed:' + l.id); }
      }
    });

    // 4. Black non-debug fills that aren't protected: report only (don't silently mutate base)
    audit.blackFillLayers.forEach(function (l) {
      if (!_isProtected(l) && !_isDebug(l)) {
        report.warnings.push('black_fill_present:' + l.id + ' (left intact — verify manually)');
      }
    });

    // 5. Disable harbor canvas overlay if it's producing the cyan grid
    var hr = SBE.HarborGeometryRuntimeRenderer;
    if (hr && typeof hr.isEnabled === 'function' && hr.isEnabled() && typeof hr.setEnabled === 'function') {
      try { hr.setEnabled(false); report.hiddenLayers.push('HarborGeometryRuntimeRenderer(canvas)'); }
      catch (e) { report.warnings.push('harbor_overlay_disable_failed'); }
    }

    report.applied = true;
    console.group('[mapStyle] recoverSurface()');
    console.log('hidden  :', report.hiddenLayers.length ? report.hiddenLayers.join(', ') : '(none)');
    console.log('restored:', report.restoredLayers.length ? report.restoredLayers.join(', ') : '(none)');
    console.log('skipped :', report.skippedLayers.length ? report.skippedLayers.join(', ') : '(none)');
    if (report.warnings.length) report.warnings.forEach(function (w) { console.warn('  ⚠', w); });
    console.groupEnd();
    return report;
  }

  // ── resetToPresentationBase ───────────────────────────────────────────────────

  function resetToPresentationBase() {
    var ssr = SBE.SurfaceStylePresetRuntime;
    if (!ssr || typeof ssr.getActivePreset !== 'function') {
      console.warn('[mapStyle] resetToPresentationBase: SurfaceStylePresetRuntime unavailable');
      return { applied: false, warnings: ['preset_runtime_unavailable'] };
    }
    var active = ssr.getActivePreset();
    if (!active) {
      console.warn('[mapStyle] resetToPresentationBase: no active preset');
      return { applied: false, warnings: ['no_active_preset'] };
    }
    // Re-set the active preset id to re-resolve its manifest (no page reload).
    var ok = false;
    try {
      if (typeof ssr.setActivePreset === 'function') { ssr.setActivePreset(active.presetId); ok = true; }
    } catch (e) {
      console.warn('[mapStyle] resetToPresentationBase failed:', e && e.message);
      return { applied: false, warnings: ['reapply_failed:' + (e && e.message)] };
    }
    console.log('[mapStyle] resetToPresentationBase → reapplied preset:', active.presetId);
    return { applied: ok, preset: active.presetId, warnings: [] };
  }

  // ── presets.validateSurface ───────────────────────────────────────────────────

  function validateSurface() {
    var map = _getMap();
    var ssr = SBE.SurfaceStylePresetRuntime;
    var active = ssr && typeof ssr.getActivePreset === 'function' ? ssr.getActivePreset() : null;
    var result = { preset: active ? active.presetId : null, valid: true, failures: [], warnings: [] };

    if (!map || !_styleLoaded(map)) {
      result.valid = false; result.failures.push('style_not_loaded');
      console.warn('[presets] validateSurface: style_not_loaded');
      return result;
    }
    var style = null; try { style = map.getStyle(); } catch (e) {}
    var layers = (style && style.layers) ? style.layers : [];

    function _visibleAny(keyword) {
      return layers.some(function (l) {
        if (l.type === 'custom') return false;
        if (!_matchAny(l.id, [keyword])) return false;
        var vis = 'visible';
        try { vis = map.getLayoutProperty(l.id, 'visibility') || 'visible'; } catch (e) {}
        return vis !== 'none';
      });
    }

    if (!_visibleAny('land') && !_visibleAny('background') && !_visibleAny('landuse')) result.failures.push('land missing');
    if (!_visibleAny('water'))    result.failures.push('water missing');
    if (!_visibleAny('road'))     result.failures.push('roads missing');
    if (!_visibleAny('building')) result.warnings.push('buildings missing');

    // Count debug / cyan / black still visible
    var cyanCount = 0, blackCount = 0, debugVisible = 0;
    layers.forEach(function (l) {
      if (l.type === 'custom') return;
      var vis = 'visible';
      try { vis = map.getLayoutProperty(l.id, 'visibility') || 'visible'; } catch (e) {}
      if (vis === 'none') return;
      var rgb = _parseColor(_layerColor(l));
      if (rgb && _isCyan(rgb) && !_isProtected(l)) cyanCount++;
      if (l.type === 'fill' && rgb && _isBlack(rgb) && !_isProtected(l)) blackCount++;
      if (_isDebug(l)) debugVisible++;
    });
    if (debugVisible > 0) result.failures.push('debug overlays visible (' + debugVisible + ')');
    if (cyanCount > 2)    result.failures.push('excessive cyan layers (' + cyanCount + ')');
    if (blackCount > 2)   result.failures.push('excessive black fill layers (' + blackCount + ')');

    var hr = SBE.HarborGeometryRuntimeRenderer;
    if (hr && typeof hr.isEnabled === 'function' && hr.isEnabled()) {
      result.warnings.push('harbor canvas overlay enabled');
    }

    result.valid = result.failures.length === 0;
    console.group('[presets] validateSurface() — ' + (result.valid ? 'VALID' : 'INVALID'));
    console.log('preset:', result.preset || '—');
    if (result.failures.length) result.failures.forEach(function (f) { console.warn('  ✗', f); });
    if (result.warnings.length) result.warnings.forEach(function (w) { console.log('  ⚠', w); });
    console.groupEnd();
    return result;
  }

  // ── harbor presentation-safe toggle ───────────────────────────────────────────
  // false = hide diagnostic grid/mesh overlay; true = allow full debug overlay.
  function harborPresentationSafe(safe) {
    var hr = SBE.HarborGeometryRuntimeRenderer;
    if (!hr || typeof hr.setEnabled !== 'function') {
      console.warn('[harborGeometry] presentationSafe: renderer unavailable'); return false;
    }
    // safe === false → hide overlay (presentation-safe). safe === true → show debug overlay.
    var enable = (safe === true);   // presentationSafe(false) hides; (true) shows debug
    hr.setEnabled(enable);
    console.log('[harborGeometry] presentationSafe(' + safe + ') → overlay',
      enable ? 'VISIBLE (debug)' : 'HIDDEN (production-safe)');
    return enable;
  }

  // ── Bind debug namespaces ──────────────────────────────────────────────────────

  function _bind() {
    global._wos       = global._wos       || {};
    global._wos.debug = global._wos.debug || {};

    global._wos.debug.mapStyle = global._wos.debug.mapStyle || {};
    global._wos.debug.mapStyle.surfaceAudit            = surfaceAudit;
    global._wos.debug.mapStyle.recoverSurface          = recoverSurface;
    global._wos.debug.mapStyle.resetToPresentationBase = resetToPresentationBase;

    global._wos.debug.presets = global._wos.debug.presets || {};
    global._wos.debug.presets.validateSurface = validateSurface;

    // Add presentationSafe to harborGeometry namespace without clobbering existing cmds
    global._wos.debug.harborGeometry = global._wos.debug.harborGeometry || {};
    if (typeof global._wos.debug.harborGeometry.presentationSafe !== 'function') {
      global._wos.debug.harborGeometry.presentationSafe = harborPresentationSafe;
    }
  }
  _bind();
  global.setTimeout(_bind, 500);
  global.setTimeout(_bind, 1500);
  global.setTimeout(_bind, 3000);

  SBE.MapSurfaceRecovery = Object.freeze({
    VERSION:                 VERSION,
    surfaceAudit:            surfaceAudit,
    recoverSurface:          recoverSurface,
    resetToPresentationBase: resetToPresentationBase,
    validateSurface:         validateSurface,
    harborPresentationSafe:  harborPresentationSafe,
  });

  console.log('[MapSurfaceRecovery] v' + VERSION + ' loaded — _wos.debug.mapStyle.recoverSurface()');

})(window);
