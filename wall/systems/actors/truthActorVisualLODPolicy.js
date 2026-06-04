// ── TruthActorVisualLODPolicy v1.0.0 ──────────────────────────────────────────
// 0603F_WOS_TruthActorVisualLODPolicy_v1.0.0
// Status: active | Classification: presentation-authority
//
// Shared presentation gate for truth-backed actors: decides whether an actor
// should render and how strongly, from zoom / viewport / type density cap /
// priority. PRESENTATION ONLY — never mutates source truth, identity, metadata,
// feeds, hero, AIS, aircraft, ambient, or Mapbox style.
//
//   TruthActorRuntime stores what exists →
//   TruthActorVisualLODPolicy decides what to show →
//   WorldSpaceVehicleLayer renders only what is allowed.
// Load AFTER actorVisualRegistry.js; before/with truthActorRuntime.js.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  var DEFAULT_LOD_PROFILE = {
    'bike.station':     { minZoom: 13.0, dotZoom: 13.0, nodeZoom: 14.5, iconZoom: 16.0, maxVisible: 600, basePriority: 20, scaleMultiplier: 1.0, opacityMultiplier: 1.0, viewportPaddingPx: 240, maxTier: 'node' },
    'vehicle.bus':      { minZoom: 10.5, dotZoom: 10.5, nodeZoom: 12.5, iconZoom: 14.0, modelZoom: 15.5, maxVisible: 180, basePriority: 70, scaleMultiplier: 1.0, opacityMultiplier: 1.0, viewportPaddingPx: 320 },
    'vehicle.utility':  { minZoom: 10.0, dotZoom: 10.0, nodeZoom: 12.0, iconZoom: 14.0, modelZoom: 15.0, maxVisible: 80, basePriority: 85, scaleMultiplier: 1.1, opacityMultiplier: 1.0, viewportPaddingPx: 360 },
    'transit.train':    { minZoom: 9.5, dotZoom: 9.5, nodeZoom: 11.5, iconZoom: 13.5, modelZoom: 15.0, maxVisible: 250, basePriority: 75, scaleMultiplier: 1.0, opacityMultiplier: 1.0, viewportPaddingPx: 360 },
    'marine.vessel':    { minZoom: 8.5, dotZoom: 8.5, nodeZoom: 10.5, iconZoom: 12.0, modelZoom: 13.5, maxVisible: 300, basePriority: 80, scaleMultiplier: 1.0, opacityMultiplier: 1.0, viewportPaddingPx: 420 },
    'aircraft.plane':   { minZoom: 7.0, dotZoom: 7.0, nodeZoom: 9.0, iconZoom: 11.0, modelZoom: 12.5, maxVisible: 200, basePriority: 75, scaleMultiplier: 1.0, opacityMultiplier: 1.0, viewportPaddingPx: 500 },
    'civic.incident':   { minZoom: 8.0, dotZoom: 8.0, nodeZoom: 10.0, iconZoom: 12.0, maxVisible: 120, basePriority: 95, scaleMultiplier: 1.2, opacityMultiplier: 1.0, viewportPaddingPx: 480 },
    'world.prop':       { minZoom: 14.0, dotZoom: 14.0, nodeZoom: 15.0, iconZoom: 16.0, modelZoom: 16.5, maxVisible: 300, basePriority: 40, scaleMultiplier: 1.0, opacityMultiplier: 1.0, viewportPaddingPx: 200 },
    'vehicle.synthetic':{ minZoom: 15.0, dotZoom: 15.0, nodeZoom: 16.0, iconZoom: 17.0, maxVisible: 24, basePriority: 10, scaleMultiplier: 1.0, opacityMultiplier: 1.0, viewportPaddingPx: 160 },
  };
  var _fallbackProfile = { minZoom: 12.0, dotZoom: 12.0, nodeZoom: 14.0, iconZoom: 16.0, maxVisible: 120, basePriority: 30, scaleMultiplier: 1.0, opacityMultiplier: 1.0, viewportPaddingPx: 280 };

  var _enabled = true, _debug = false, _profileName = 'default', _lastError = null, _lastContext = null;
  var _profile = DEFAULT_LOD_PROFILE;

  // Density accounting: per-type set of currently-rendered actorIds (soft cap).
  var _renderedIds = {};   // actorType → { actorId: true }
  // Reporting counters (recomputed live from sets + last decisions).
  var _suppressionReasons = {};

  function _profileFor(type) { return _profile[type] || _fallbackProfile; }
  function _isTruthSource(sourceId) {
    return !!(SBE.ActorSourceRegistry && typeof SBE.ActorSourceRegistry.isTruthSource === 'function'
      && SBE.ActorSourceRegistry.isTruthSource(sourceId));
  }
  function _clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function _map() {
    try { var mvr = SBE.MapboxViewportRuntime; return mvr && typeof mvr.getMap === 'function' ? mvr.getMap() : null; }
    catch (e) { return null; }
  }

  // Build a safe LOD context for an actor (projects its position if possible).
  function _buildContext(actor) {
    var ctx = { zoom: null, pitch: null, bounds: null, viewportWidth: 0, viewportHeight: 0,
                screenX: null, screenY: null, inViewport: false, distanceFromCenterPx: null, mapMissing: true };
    var map = _map();
    if (!map) { _lastContext = ctx; return ctx; }
    ctx.mapMissing = false;
    try { ctx.zoom = map.getZoom(); } catch (e) {}
    try { ctx.pitch = map.getPitch(); } catch (e) {}
    try { var c = map.getCanvas(); ctx.viewportWidth = c.clientWidth; ctx.viewportHeight = c.clientHeight; } catch (e) {}
    if (actor && actor.lat != null && actor.lng != null && typeof map.project === 'function') {
      try {
        var p = map.project([actor.lng, actor.lat]);
        ctx.screenX = p.x; ctx.screenY = p.y;
        var cx = ctx.viewportWidth * 0.5, cy = ctx.viewportHeight * 0.5;
        ctx.distanceFromCenterPx = Math.sqrt((p.x - cx) * (p.x - cx) + (p.y - cy) * (p.y - cy));
        ctx.inViewport = p.x >= 0 && p.y >= 0 && p.x <= ctx.viewportWidth && p.y <= ctx.viewportHeight;
      } catch (e) {}
    }
    _lastContext = ctx;
    return ctx;
  }

  // Resolve LOD tier from zoom + profile (bike.station caps at 'node').
  function _resolveTier(prof, zoom) {
    if (zoom == null) return 'node';   // unknown zoom → modest tier
    if (zoom < prof.minZoom) return 'hidden';
    var tier = 'dot';
    if (zoom >= prof.dotZoom)  tier = 'dot';
    if (prof.nodeZoom  != null && zoom >= prof.nodeZoom)  tier = 'node';
    if (prof.iconZoom  != null && zoom >= prof.iconZoom)  tier = 'icon';
    if (prof.modelZoom != null && zoom >= prof.modelZoom) tier = 'model';
    // Cap tier when the profile forbids higher detail (stations never become models).
    if (prof.maxTier === 'node' && (tier === 'icon' || tier === 'model')) tier = 'node';
    return tier;
  }

  function _alertBoost(actor, visual) {
    var boost = 0;
    if (visual && visual.state === 'offline') boost = 20;
    var md = (actor && actor.metadata) || {};
    var blob = '';
    try { blob = JSON.stringify(md).toLowerCase(); } catch (e) {}
    if (/incident|emergency|maintenance|delay|closure/.test(blob)) boost = 20;
    return boost;
  }

  function _has(type, id) { return !!(_renderedIds[type] && _renderedIds[type][id]); }
  function _addRendered(type, id) { (_renderedIds[type] = _renderedIds[type] || {})[id] = true; }
  function _removeRendered(type, id) { if (_renderedIds[type]) delete _renderedIds[type][id]; }
  function _countRendered(type) { return _renderedIds[type] ? Object.keys(_renderedIds[type]).length : 0; }

  function _bucket(v) { return Math.round((v || 0) * 20) / 20; }   // 0.05 buckets

  // ── Main decision ─────────────────────────────────────────────────────────────
  function resolvePresentation(actor, visual, context) {
    var actorType = (actor && actor.actorType) || 'unknown';
    var sourceId = (actor && actor.sourceId) || null;
    var prof = _profileFor(actorType);
    var ctx = context || _buildContext(actor);

    function out(render, reason, tier) {
      var scaleMul = prof.scaleMultiplier != null ? prof.scaleMultiplier : 1.0;
      var opacMul  = prof.opacityMultiplier != null ? prof.opacityMultiplier : 1.0;
      var priority = prof.basePriority
        + ((visual && typeof visual.priority === 'number') ? visual.priority : 0)
        + (_isTruthSource(sourceId) ? 10 : 0)
        + _alertBoost(actor, visual)
        - _clamp((ctx.distanceFromCenterPx || 0) / 900, 0, 12);
      var decision = {
        render: render, reason: reason,
        lodTier: render ? (tier || 'node') : 'hidden',
        scaleMultiplier: render ? scaleMul : 1.0,
        opacityMultiplier: render ? opacMul : 1.0,
        priority: Math.round(priority * 100) / 100,
        maxVisibleForType: prof.maxVisible,
        presentationKey: [render ? '1' : '0', render ? (tier || 'node') : 'hidden',
                          _bucket(scaleMul), _bucket(opacMul)].join('|'),
        metadata: {
          zoom: ctx.zoom, actorType: actorType, sourceId: sourceId,
          screenX: ctx.screenX, screenY: ctx.screenY, inViewport: ctx.inViewport,
          distanceFromCenterPx: ctx.distanceFromCenterPx == null ? null : Math.round(ctx.distanceFromCenterPx),
        },
      };
      _suppressionReasons[reason] = (_suppressionReasons[reason] || 0) + 1;
      return decision;
    }

    if (!_enabled) return out(true, 'lod_disabled', _resolveTier(prof, ctx.zoom));

    // Map missing → render only sparse high-priority types.
    if (ctx.mapMissing) {
      var allow = prof.basePriority >= 75;
      if (!allow) { _removeRendered(actorType, actor && actor.actorId); return out(false, 'map_context_missing', null); }
      return out(true, 'map_context_missing', 'node');
    }

    var tier = _resolveTier(prof, ctx.zoom);
    if (tier === 'hidden') { _removeRendered(actorType, actor.actorId); return out(false, 'below_min_zoom', null); }

    // Viewport gate (with per-type padding). Never deletes truth.
    if (ctx.screenX != null) {
      var pad = prof.viewportPaddingPx || 280;
      var inPadded = ctx.screenX >= -pad && ctx.screenY >= -pad &&
                     ctx.screenX <= ctx.viewportWidth + pad && ctx.screenY <= ctx.viewportHeight + pad;
      if (!inPadded) { _removeRendered(actorType, actor.actorId); return out(false, 'outside_viewport', null); }
    }

    // Density gate (soft, first-come-within-cap; full priority sort deferred → 0603F.1).
    if (!_has(actorType, actor.actorId) && _countRendered(actorType) >= prof.maxVisible) {
      return out(false, 'density_cap', null);
    }

    _addRendered(actorType, actor.actorId);
    return out(true, 'eligible', tier);
  }

  // Called by the runtime when an actor is removed entirely (keeps sets honest).
  function notifyRemoved(actorType, actorId) { _removeRendered(actorType, actorId); }

  // ── State / config ────────────────────────────────────────────────────────────
  function getState() {
    var renderedCounts = {}, maxVisibleByType = {};
    Object.keys(_renderedIds).forEach(function (t) { renderedCounts[t] = _countRendered(t); });
    Object.keys(_profile).forEach(function (t) { maxVisibleByType[t] = _profile[t].maxVisible; });
    return {
      version: VERSION, enabled: _enabled, debug: _debug, profileName: _profileName,
      lastContext: _lastContext,
      renderedCounts: renderedCounts,
      suppressionReasons: _assign({}, _suppressionReasons),
      maxVisibleByType: maxVisibleByType,
      lastError: _lastError,
    };
  }
  function _assign(d, s) { for (var k in s) if (s.hasOwnProperty(k)) d[k] = s[k]; return d; }
  function setEnabled(on) { _enabled = on !== false; return _enabled; }
  function setDebug(on) { _debug = on !== false; return _debug; }
  function setProfile(name) { _profileName = name || 'default'; return _profileName; }   // single built-in profile for now
  function getProfile() { return JSON.parse(JSON.stringify(_profile)); }

  SBE.TruthActorVisualLODPolicy = Object.freeze({
    VERSION:             VERSION,
    resolvePresentation: resolvePresentation,
    notifyRemoved:       notifyRemoved,
    getState:            getState,
    setEnabled:          setEnabled,
    setDebug:            setDebug,
    setProfile:          setProfile,
    getProfile:          getProfile,
  });

  console.log('[TruthActorVisualLODPolicy] v' + VERSION + ' loaded');
})(window);
