(function (global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  // ── SurfaceModel (0518G_WOS_SurfaceSpatialModel_v1.0.0) ───────────────────
  // Canonical spatial model constants and factories for WOS surfaces.
  //
  // Coordinate hierarchy:
  //   Geographic  — longitude / latitude / altitude  (real-world anchoring)
  //   Surface     — 0→1 normalized space             (resolution-independent)
  //   Runtime     — simulation / actor / physics      (behavior space)
  //   Viewport    — screen pixels                     (never persisted)
  //   Presentation — cinematic interpretation         (audience-facing)

  // ── Surface types ──────────────────────────────────────────────────────────
  var TYPES = ["route", "world", "soundscape", "media", "overlay", "simulation"];

  // ── Anchor types ───────────────────────────────────────────────────────────
  var ANCHOR_TYPES = {
    GEO:    "geo",      // fixed real-world location
    ROUTE:  "route",    // attached to route geometry
    ENTITY: "entity",   // attached to moving runtime entity
    SCREEN: "screen",   // viewport-fixed
    FREE:   "free",     // detached floating surface
  };

  // ── Projection modes ───────────────────────────────────────────────────────
  var PROJECTION = {
    FLAT:         "flat",         // simple planar media
    GEO:          "geo",          // map-aligned projection
    ROUTE_FOLLOW: "route-follow", // conforms to route geometry
    CURVED:       "curved",       // wraps curved surfaces
    BILLBOARD:    "billboard",    // camera-facing
    SCREEN:       "screen",       // viewport overlay
  };

  // ── Factories ──────────────────────────────────────────────────────────────
  function createAnchor(type, opts) {
    opts = opts || {};
    return {
      type:        type        || ANCHOR_TYPES.FREE,
      referenceId: opts.referenceId || null,
      coordinates: opts.coordinates
        ? { longitude: opts.coordinates.longitude, latitude: opts.coordinates.latitude,
            altitude:  opts.coordinates.altitude  || 0 }
        : null,
      rotation: opts.rotation !== undefined ? opts.rotation : 0,
      scale:    opts.scale    !== undefined ? opts.scale    : 1,
    };
  }

  function createTransform(opts) {
    opts = opts || {};
    return {
      x:        opts.x        !== undefined ? opts.x        : 0,
      y:        opts.y        !== undefined ? opts.y        : 0,
      width:    opts.width    !== undefined ? opts.width    : 1,
      height:   opts.height   !== undefined ? opts.height   : 1,
      rotation: opts.rotation !== undefined ? opts.rotation : 0,
      scaleX:   opts.scaleX   !== undefined ? opts.scaleX   : 1,
      scaleY:   opts.scaleY   !== undefined ? opts.scaleY   : 1,
    };
  }

  // Default anchor for a given surface type
  function defaultAnchor(surfaceType) {
    if (surfaceType === "route") return createAnchor(ANCHOR_TYPES.GEO);
    if (surfaceType === "world") return createAnchor(ANCHOR_TYPES.GEO);
    return createAnchor(ANCHOR_TYPES.FREE);
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  SBE.SurfaceModel = {
    TYPES:        TYPES,
    ANCHOR_TYPES: ANCHOR_TYPES,
    PROJECTION:   PROJECTION,
    createAnchor:    createAnchor,
    createTransform: createTransform,
    defaultAnchor:   defaultAnchor,
  };

})(window);
