// ── ActorRenderAuthority v1.0.0 ───────────────────────────────────────────────
// 0603G_WOS_ActorRenderAuthority_v1.0.0
// Status: active | Classification: render-pipeline authority
//
// Translates Actor Truth + Visual Profile + LOD Policy into ONE canonical render
// payload before WorldSpaceVehicleLayer receives the actor. This keeps WSL free
// of actor-specific (feed/LOD/variant/state) decision logic.
//
//   TruthActorRuntime → ActorVisualRegistry → TruthActorVisualLODPolicy →
//   ActorRenderAuthority → WorldSpaceVehicleLayer
//
// PRESENTATION ONLY — never mutates truth, identity, metadata, feeds, or style.
// Load AFTER actorVisualRegistry.js + truthActorVisualLODPolicy.js; before/with
// truthActorRuntime.js.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  var _variants = {};   // actorType → resolver(actor, visual, lodTier) → renderVariant string
  var _stats = { resolved: 0, suppressed: 0, lastType: null, lastError: null };

  // Concrete WSL mesh actorType from a visual shape (presentation only).
  function _wslActorType(visual) {
    var s = visual && (visual.wslShape || visual.shape);
    if (s === 'box_truck') return 'box_truck';
    if (s === 'traffic_car') return 'traffic_car';
    return 'traffic_car';   // prop / unknown → small marker fallback
  }

  // ── Default variant resolvers ───────────────────────────────────────────────
  // Citi Bike (and any bike.station): tier → station_dot / station_node / station_icon.
  function _stationVariant(actor, visual, lodTier) {
    if (lodTier === 'dot') return 'station_dot';
    if (lodTier === 'icon' || lodTier === 'model') return 'station_icon';
    return 'station_node';
  }
  // Everything else keeps its colour variant from the visual profile.
  function _defaultVariant(actor, visual /*, lodTier */) {
    return (visual && visual.variant) || 'sedan_dark';
  }

  function registerVariant(type, resolver) {
    if (!type || typeof resolver !== 'function') return false;
    _variants[type] = resolver;
    return true;
  }
  function getVariant(type) { return _variants[type] || null; }

  // Resolve the visual profile for an actor (station gets per-station state).
  function _resolveVisual(actor) {
    var type = actor && actor.actorType;
    if (type === 'bike.station') {
      var vp = SBE.CitiBikeStationVisualProfile;
      if (vp && typeof vp.resolveStationVisual === 'function') {
        try {
          var v = vp.resolveStationVisual({ actorType: 'bike.station', metadata: actor.metadata });
          if (v) return v;
        } catch (e) {}
      }
      // Fallback (visual profile missing) — no throw.
      return { state: 'unknown', shape: 'station_node', variant: 'station_node', scale: 0.72,
               opacity: 1, paletteRef: null, glyphRef: null, priority: 0 };
    }
    var reg = SBE.ActorVisualRegistry;
    if (reg && typeof reg.getVisualProfile === 'function') {
      try { return reg.getVisualProfile(actor) || {}; } catch (e2) {}
    }
    return actor.visualProfile || {};
  }

  // ── Main entry ──────────────────────────────────────────────────────────────
  // Returns a canonical render payload, or null when the actor should not render.
  // Sets actor._visual and actor._presentation for downstream reporting.
  function resolveRenderPayload(actor) {
    if (!actor || actor.lat == null || actor.lng == null) { _stats.lastError = 'invalid_actor'; return null; }
    var type = actor.actorType || 'unknown';
    _stats.lastType = type;

    var visual = _resolveVisual(actor);
    actor._visual = visual;

    // LOD presentation gate (safe if policy absent → render at 'node').
    var policy = SBE.TruthActorVisualLODPolicy;
    var presentation = null;
    if (policy && typeof policy.resolvePresentation === 'function') {
      try { presentation = policy.resolvePresentation(actor, visual); } catch (e) {}
    }
    actor._presentation = presentation;

    if (presentation && (presentation.render === false || presentation.lodTier === 'hidden')) {
      _stats.suppressed++;
      return null;   // hidden → no payload
    }

    var lodTier = presentation ? presentation.lodTier : 'node';
    var resolver = _variants[type] || _defaultVariant;
    var renderVariant = resolver(actor, visual, lodTier) || _defaultVariant(actor, visual);

    var scale = (visual.scale != null ? visual.scale : 1) * (presentation ? (presentation.scaleMultiplier || 1) : 1);
    var opacity = (visual.opacity != null ? visual.opacity : 1) * (presentation ? (presentation.opacityMultiplier || 1) : 1);

    _stats.resolved++;
    var payload = {
      actorId:        actor.actorId,
      // WSL mesh dispatch type: stations keep 'bike.station'; vehicles map to shape.
      actorType:      (type === 'bike.station') ? 'bike.station' : _wslActorType(visual),
      renderVariant:  renderVariant,
      variant:        renderVariant,            // WSL reads `variant`
      lodTier:        lodTier,
      scale:          scale,
      opacity:        opacity,
      paletteRef:     visual.paletteRef || null,
      glyphRef:       visual.glyphRef || null,
      visualState:    visual.state || null,
      renderPriority: presentation ? presentation.priority : 0,
      // live placement + WSL contract fields
      lat:            actor.lat,
      lng:            actor.lng,
      headingDeg:     actor.headingDeg || 0,
      visible:        true,
      source:         actor.sourceId,
      label:          actor.label,
      metadata:       actor.metadata || {},
    };

    // 0603I — enrich with canonical visual identity (silhouette/palette/glyph/…).
    // Presentation-only; never overrides existing fields except palette/glyph refs.
    var avia = SBE.ActorVisualIdentityAuthority;
    if (avia && typeof avia.resolveIdentity === 'function') {
      try {
        var identity = avia.resolveIdentity(actor, payload);
        if (identity) {
          payload.visualIdentityKey = identity.visualIdentityKey;
          payload.silhouetteClass   = identity.silhouetteClass;
          payload.paletteRef        = identity.paletteRef || payload.paletteRef;
          payload.glyphRef          = identity.glyphRef || payload.glyphRef;
          payload.accentRef         = identity.accentRef;
          payload.materialClass     = identity.materialClass;
          payload.lightClass        = identity.lightClass;
          payload.decalClass        = identity.decalClass;
          payload.scaleClass        = identity.scaleClass;
          payload.priorityClass     = identity.priorityClass;
          payload.readableName      = identity.readableName;
          payload.identityTags      = identity.tags;
        }
      } catch (e) {}
    }

    // 0603O — resolve the reusable asset (variant/LOD/palette/glyph/metadata).
    // Presentation-only; only fills/overrides asset-owned fields, never truth.
    var ala = SBE.ActorAssetLibraryAuthority;
    if (ala && typeof ala.resolveAsset === 'function') {
      try {
        var asset = ala.resolveAsset(actor, payload);
        if (asset) {
          payload.assetId        = asset.assetId;
          payload.assetKey       = asset.assetKey;
          payload.assetCategory  = asset.assetCategory;
          payload.assetLabel     = asset.assetLabel;
          payload.assetEditable  = asset.assetEditable;
          payload.renderVariant   = asset.renderVariant || payload.renderVariant;
          payload.silhouetteClass = asset.silhouetteClass || payload.silhouetteClass;
          payload.paletteRef      = asset.paletteRef || payload.paletteRef;
          payload.glyphRef        = asset.glyphRef || payload.glyphRef;
          payload.materialClass   = asset.materialClass || payload.materialClass;
          payload.lightClass      = asset.lightClass || payload.lightClass;
          payload.scaleClass      = asset.scaleClass || payload.scaleClass;
          payload.priorityClass   = asset.priorityClass || payload.priorityClass;
          payload.assetTags       = asset.tags;
          payload.assetMetadata   = asset.metadata;
        }
      } catch (e2) {}
    }
    return payload;
  }

  function getState() {
    return {
      version: VERSION,
      registeredVariants: Object.keys(_variants),
      resolved: _stats.resolved,
      suppressed: _stats.suppressed,
      lastType: _stats.lastType,
      lastError: _stats.lastError,
    };
  }

  // Built-in registrations.
  registerVariant('bike.station', _stationVariant);

  SBE.ActorRenderAuthority = Object.freeze({
    VERSION:             VERSION,
    resolveRenderPayload: resolveRenderPayload,
    registerVariant:     registerVariant,
    getVariant:          getVariant,
    getState:            getState,
  });

  console.log('[ActorRenderAuthority] v' + VERSION + ' loaded');
})(window);
