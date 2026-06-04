// ── MapStyleRecoveryAuthority v1.0.0 ──────────────────────────────────────────
// 0603H_WOS_MapStyleRecoveryAuthority_v1.0.0
// Status: active | Classification: presentation-authority (base-map health)
//
// Audits the active Mapbox style, classifies layers into WOS categories, flags
// missing critical categories, and applies a SAFE paint/layout readability patch
// that survives reloads/publishes/setStyle. PRESENTATION ONLY — never mutates
// sources, geometries, actor truth, runtimes, hero, camera, or render transforms.
//
//   Mapbox owns geographic substrate → WOS owns atmospheric interpretation →
//   MapStyleRecovery keeps the substrate visually coherent.
// Load AFTER MapboxViewportRuntime.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  var STYLE_RECOVERY_DEBOUNCE_MS = 750;
  var CRITICAL_CATEGORIES  = ['water', 'land', 'road', 'building'];
  var IMPORTANT_CATEGORIES = ['bridge', 'tunnel', 'park', 'transit', 'label'];

  var _enabled = true, _debug = false, _patchEnabled = true, _active = false;
  var _map = null, _bound = false, _recoverTimer = null;
  var _stats = {
    lastAuditAt: 0, lastRecoverAt: 0, lastStyleLoadAt: 0, styledataCount: 0,
    recoverScheduledCount: 0, recoverAppliedCount: 0,
    lastAppliedPatchId: null, appliedRuleCount: 0, skippedRuleCount: 0, lastError: null,
  };
  var _patchState = { applied: 0, skipped: 0, lastToken: null };

  function _getMap() {
    if (_map) return _map;
    try { var mvr = SBE.MapboxViewportRuntime; _map = mvr && typeof mvr.getMap === 'function' ? mvr.getMap() : null; }
    catch (e) { _map = null; }
    return _map;
  }
  function _log() { if (_debug) console.log.apply(console, ['[MapStyleRecovery]'].concat([].slice.call(arguments))); }

  // ── Layer classification ────────────────────────────────────────────────────
  function _classify(layer) {
    if (!layer) return 'unknown';
    var id = (layer.id || '').toLowerCase();
    var type = (layer.type || '').toLowerCase();
    var sl = (layer['source-layer'] || '').toLowerCase();
    var s = id + ' ' + sl;
    if (/water|ocean|\bsea\b|river|bay|canal/.test(s)) return 'water';
    if (/park|grass|wood|forest|pitch|cemetery|golf|garden|scrub/.test(s)) return 'park';
    if (type === 'fill-extrusion' || /building/.test(s)) return 'building';
    if (/bridge/.test(s)) return 'bridge';
    if (/tunnel/.test(s)) return 'tunnel';
    if (/transit|\brail\b|subway|ferry|aeroway/.test(s)) return 'transit';
    if (/road|street|highway|motorway|trunk|primary|secondary|tertiary|transportation|path|pedestrian/.test(s)) return 'road';
    if (/boundary|admin/.test(s)) return 'boundary';
    if (type === 'symbol' || /label|place|poi|text/.test(s)) return 'label';
    if (type === 'background' || /\bland\b|landuse|landcover|earth/.test(s)) return 'land';
    return 'unknown';
  }

  // ── Audit ───────────────────────────────────────────────────────────────────
  function audit() {
    var map = _getMap();
    var out = {
      version: VERSION, active: _active, enabled: _enabled,
      mapReady: !!map, styleLoaded: false, styleName: null,
      sourceCount: 0, layerCount: 0,
      categories: { water: 0, land: 0, park: 0, road: 0, bridge: 0, tunnel: 0,
                    building: 0, label: 0, transit: 0, boundary: 0, unknown: 0 },
      missingCritical: [], importantMissing: [], visibleLayers: [], hiddenLayers: [],
      patchState: { applied: _patchState.applied, skipped: _patchState.skipped },
      lastError: _stats.lastError,
    };
    if (!map) { out.lastError = 'map_missing'; _stats.lastAuditAt = Date.now(); return out; }
    var style = null;
    try { style = map.getStyle && map.getStyle(); } catch (e) { out.lastError = 'getStyle_failed:' + (e && e.message ? e.message : e); }
    try { out.styleLoaded = !!(map.isStyleLoaded ? map.isStyleLoaded() : style); } catch (e) {}
    if (!style || !style.layers) { _stats.lastAuditAt = Date.now(); return out; }

    out.styleName  = style.name || null;
    out.sourceCount = style.sources ? Object.keys(style.sources).length : 0;
    out.layerCount  = style.layers.length;

    style.layers.forEach(function (layer) {
      var cat = _classify(layer);
      if (out.categories[cat] == null) out.categories[cat] = 0;
      out.categories[cat]++;
      var vis = 'visible';
      try { vis = (layer.layout && layer.layout.visibility) || 'visible'; } catch (e) {}
      if (vis === 'none') out.hiddenLayers.push(layer.id); else out.visibleLayers.push(layer.id);
    });

    CRITICAL_CATEGORIES.forEach(function (c) { if (!out.categories[c]) out.missingCritical.push(c); });
    IMPORTANT_CATEGORIES.forEach(function (c) { if (!out.categories[c]) out.importantMissing.push(c); });

    _stats.lastAuditAt = Date.now();
    return out;
  }

  // ── Default recovery patch ──────────────────────────────────────────────────
  var WOS_BASEMAP_RECOVERY_PATCH = {
    id: 'WOS_BASEMAP_RECOVERY_PATCH',
    label: 'WOS Base-map Readability Recovery',
    enabled: true,
    rules: [
      { match: { category: 'water' },    paint: { 'fill-color': '#081820', 'fill-opacity': 0.92 } },
      { match: { category: 'land' },     paint: { 'background-color': '#101214' } },
      { match: { category: 'road' },     paint: { 'line-opacity': 0.55 } },
      { match: { category: 'bridge' },   paint: { 'line-opacity': 0.75 } },
      { match: { category: 'tunnel' },   paint: { 'line-opacity': 0.35 } },
      { match: { category: 'building' }, paint: { 'fill-extrusion-opacity': 0.55 } },
    ],
  };

  // paint property → the layer type that supports it (safety gate).
  function _paintPropLayerType(prop) {
    if (prop.indexOf('fill-extrusion-') === 0) return 'fill-extrusion';
    if (prop.indexOf('fill-') === 0)       return 'fill';
    if (prop.indexOf('line-') === 0)       return 'line';
    if (prop.indexOf('background-') === 0) return 'background';
    if (prop.indexOf('circle-') === 0)     return 'circle';
    if (prop.indexOf('text-') === 0 || prop.indexOf('icon-') === 0 || prop.indexOf('symbol-') === 0) return 'symbol';
    return null;
  }

  function _ruleMatches(rule, layer, category) {
    var m = rule.match || {};
    if (m.category && m.category !== category) return false;
    if (m.type && m.type !== layer.type) return false;
    if (m.layerIdIncludes && m.layerIdIncludes.length) {
      var id = (layer.id || '').toLowerCase();
      var any = false;
      for (var i = 0; i < m.layerIdIncludes.length; i++) { if (id.indexOf(String(m.layerIdIncludes[i]).toLowerCase()) !== -1) { any = true; break; } }
      if (!any) return false;
    }
    return true;
  }

  // ── applyPatch — safe paint/layout only; never throws ───────────────────────
  function applyPatch(patch) {
    patch = patch || WOS_BASEMAP_RECOVERY_PATCH;
    var map = _getMap();
    var result = { applied: 0, skipped: 0, patchId: patch.id };
    if (!map) { _stats.lastError = 'map_missing'; return result; }
    if (patch.enabled === false || !_patchEnabled) { _stats.lastError = 'patch_disabled'; return result; }
    var style = null;
    try { style = map.getStyle && map.getStyle(); } catch (e) { _stats.lastError = 'getStyle_failed'; return result; }
    if (!style || !style.layers) { _stats.lastError = 'no_style'; return result; }

    style.layers.forEach(function (layer) {
      var category = _classify(layer);
      (patch.rules || []).forEach(function (rule) {
        if (!_ruleMatches(rule, layer, category)) return;
        // Paint properties (type-checked).
        if (rule.paint) {
          Object.keys(rule.paint).forEach(function (prop) {
            var needType = _paintPropLayerType(prop);
            if (needType && layer.type !== needType) { result.skipped++; return; }
            try { map.setPaintProperty(layer.id, prop, rule.paint[prop]); result.applied++; }
            catch (e) { result.skipped++; }
          });
        }
        // Layout properties (visibility etc.).
        if (rule.layout) {
          Object.keys(rule.layout).forEach(function (prop) {
            try { map.setLayoutProperty(layer.id, prop, rule.layout[prop]); result.applied++; }
            catch (e) { result.skipped++; }
          });
        }
      });
    });

    _patchState.applied = result.applied;
    _patchState.skipped = result.skipped;
    _stats.lastAppliedPatchId = patch.id;
    _stats.appliedRuleCount = result.applied;
    _stats.skippedRuleCount = result.skipped;
    _stats.recoverAppliedCount++;
    _stats.lastRecoverAt = Date.now();
    if (!result.applied && !result.skipped) _stats.lastError = 'no_matching_layers';
    else _stats.lastError = null;
    return result;
  }

  function clearPatch() {
    // v1 cannot restore original paint without a baseline snapshot; clearing only
    // disables further reapplication and resets local patch accounting.
    _patchEnabled = false;
    _patchState = { applied: 0, skipped: 0, lastToken: null };
    console.log('[MapStyleRecovery] patch cleared (reapplication disabled)');
    return true;
  }

  // ── Recover ─────────────────────────────────────────────────────────────────
  function recover() {
    if (!_enabled) { _stats.lastError = 'disabled'; return { applied: 0, skipped: 0 }; }
    var r = applyPatch(WOS_BASEMAP_RECOVERY_PATCH);
    var a = audit();
    _patchState.lastToken = (a.styleName || '') + ':' + a.layerCount;
    return r;
  }

  // ── Style reload binding (debounced, state-driven) ──────────────────────────
  function _scheduleRecover(reason) {
    if (!_enabled || !_patchEnabled) return;
    _stats.recoverScheduledCount++;
    if (_recoverTimer) global.clearTimeout(_recoverTimer);
    _recoverTimer = global.setTimeout(function () {
      _recoverTimer = null;
      var a = audit();
      var token = (a.styleName || '') + ':' + a.layerCount;
      // Only (re)apply when the style token changed or the patch hasn't applied.
      if (token !== _patchState.lastToken || _patchState.applied === 0) {
        var r = applyPatch(WOS_BASEMAP_RECOVERY_PATCH);
        _patchState.lastToken = token;
        _log('recover(' + reason + ') applied', r.applied, 'skipped', r.skipped);
      }
    }, STYLE_RECOVERY_DEBOUNCE_MS);
  }

  function _bind() {
    if (_bound) return true;
    var map = _getMap();
    if (!map || typeof map.on !== 'function') return false;
    map.on('style.load', function () { _stats.lastStyleLoadAt = Date.now(); _scheduleRecover('style.load'); });
    map.on('styledata', function () { _stats.styledataCount++; _scheduleRecover('styledata'); });
    _bound = true;
    _log('bound to map style events');
    return true;
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────
  function start() {
    _active = true;
    if (!_bind()) {
      // Map not ready yet — retry a few times without tight-looping.
      var tries = 0;
      var iv = global.setInterval(function () {
        tries++;
        if (_bind() || tries > 20) { global.clearInterval(iv); if (_bound) _scheduleRecover('startup'); }
      }, 500);
    } else {
      _scheduleRecover('startup');
    }
    console.log('[MapStyleRecovery] v' + VERSION + ' started');
    return true;
  }
  function stop() {
    _active = false;
    if (_recoverTimer) { global.clearTimeout(_recoverTimer); _recoverTimer = null; }
    console.log('[MapStyleRecovery] stopped');
    return true;
  }

  function setEnabled(on) { _enabled = on !== false; return _enabled; }
  function setDebug(on) { _debug = on !== false; return _debug; }

  function getState() {
    return {
      version: VERSION, active: _active, enabled: _enabled, debug: _debug,
      patchEnabled: _patchEnabled,
      lastAuditAt: _stats.lastAuditAt, lastRecoverAt: _stats.lastRecoverAt,
      lastStyleLoadAt: _stats.lastStyleLoadAt, styledataCount: _stats.styledataCount,
      recoverScheduledCount: _stats.recoverScheduledCount, recoverAppliedCount: _stats.recoverAppliedCount,
      lastAppliedPatchId: _stats.lastAppliedPatchId,
      appliedRuleCount: _stats.appliedRuleCount, skippedRuleCount: _stats.skippedRuleCount,
      lastError: _stats.lastError,
    };
  }

  SBE.MapStyleRecoveryAuthority = Object.freeze({
    VERSION:    VERSION,
    start:      start,
    stop:       stop,
    audit:      audit,
    recover:    recover,
    applyPatch: applyPatch,
    clearPatch: clearPatch,
    getState:   getState,
    setEnabled: setEnabled,
    setDebug:   setDebug,
  });

  // ── Debug namespace ───────────────────────────────────────────────────────────
  function _bindDebug() {
    global._wos = global._wos || {};
    global._wos.debug = global._wos.debug || {};
    global._wos.debug.mapStyleRecovery = {
      state: function () { var s = getState(); console.log('[MapStyleRecovery] state', s); return s; },
      audit: function () {
        var a = audit();
        var c = a.categories;
        console.group('[MapStyleRecovery] audit');
        console.log('styleLoaded   :', a.styleLoaded, '| styleName:', a.styleName);
        console.log('layerCount    :', a.layerCount, '| sourceCount:', a.sourceCount);
        console.log('categories    : water ' + c.water + ' | land ' + c.land + ' | road ' + c.road +
          ' | bridge ' + c.bridge + ' | tunnel ' + c.tunnel + ' | building ' + c.building +
          ' | transit ' + c.transit + ' | label ' + c.label + ' | unknown ' + c.unknown);
        console.log('missingCritical:', a.missingCritical);
        console.log('importantMissing:', a.importantMissing);
        console.log('patchEnabled  :', _patchEnabled, '| applied:', a.patchState.applied, '| skipped:', a.patchState.skipped);
        if (a.lastError) console.warn('lastError     :', a.lastError);
        console.groupEnd();
        return a;
      },
      recover: function () {
        var r = recover();
        console.group('[MapStyleRecovery] recover');
        console.log('applied   :', r.applied);
        console.log('skipped   :', r.skipped);
        console.log('lastError :', _stats.lastError || '-');
        console.groupEnd();
        return r;
      },
      enable: function (on) { return setEnabled(on); },
      debug: function (on) { return setDebug(on); },
      clearPatch: function () { return clearPatch(); },
    };
  }
  _bindDebug();
  global.setTimeout(_bindDebug, 500);
  global.setTimeout(_bindDebug, 2000);

  // Auto-start (guarded; never blocks Drive). Binds when the map becomes ready.
  try { start(); } catch (e) { _stats.lastError = 'start_failed:' + (e && e.message ? e.message : e); }

  console.log('[MapStyleRecoveryAuthority] v' + VERSION + ' loaded');
})(window);
