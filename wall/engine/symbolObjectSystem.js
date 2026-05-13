// 0513_WOS_SymbolObjectSystem_v1.0.0
// Lightweight runtime instances referencing SymbolSet slots.
// Attaches to SBE.SymbolObjectSystem.
//
// SymbolObjects are world-space scene entities:
//   • stored in world coordinates (x, y)
//   • rendered inside the camera transform in renderFrame()
//   • serialized by setId + slotKey only — never embed stroke geometry
//   • hit-tested via world coords from getCanvasCoordsLocal()
//
// This module owns: factory, bounds, hit-test, serialize/hydrate, duplicate.
// It is stateless — no object list here; state.symbolObjects lives in main.js.

(function initSymbolObjectSystem(global) {
  "use strict";

  var SBE = (global.SBE = global.SBE || {});

  // Base size in world pixels at scale 1.0.
  // This is the cell size passed to SymbolRenderer.renderGlyph().
  var BASE_SIZE = 64;

  var _counter = 1;

  function _uuid() {
    return "sym-" + Date.now().toString(36) + "-" + (_counter++);
  }

  // ── Factory ───────────────────────────────────────────────────────────────

  function createSymbolObject(setId, slotKey, x, y, options) {
    options = options || {};
    return {
      id:              _uuid(),
      type:            "symbol",

      // Slot reference — no geometry embedded
      setId:           setId,
      slotKey:         slotKey || "A",

      // World-space transform
      x:               x || 0,
      y:               y || 0,
      rotation:        options.rotation    !== undefined ? options.rotation   : 0,
      scale:           options.scale       !== undefined ? options.scale      : 1,

      // Appearance
      opacity:         options.opacity     !== undefined ? options.opacity    : 1,
      visible:         options.visible     !== undefined ? options.visible    : true,

      // Overrides (null = use SymbolSet's own palette)
      colorOverride:   options.colorOverride  || null,
      paletteOverride: options.paletteOverride || null,

      // Z-ordering (higher = drawn later = on top)
      zIndex:          options.zIndex || 0,

      // Behavior flags (Phase 3+ — kept false for now)
      collision:       false,
      soundEnabled:    false,

      // Interaction
      locked:          false,
    };
  }

  // ── Geometry ──────────────────────────────────────────────────────────────

  function getWorldSize(obj) {
    return BASE_SIZE * (obj.scale || 1);
  }

  // Axis-aligned bounding box in world coords.
  // (Used for hit-testing and selection rect rendering.)
  function getBounds(obj) {
    var s = getWorldSize(obj) / 2;
    return {
      minX: obj.x - s,
      minY: obj.y - s,
      maxX: obj.x + s,
      maxY: obj.y + s,
      w:    s * 2,
      h:    s * 2,
    };
  }

  // ── Hit test ──────────────────────────────────────────────────────────────

  // Returns the topmost visible, unlocked object whose AABB contains (wx, wy).
  // Pass objects in draw order; searches in reverse (last drawn = on top).
  function hitTest(objects, wx, wy) {
    for (var i = objects.length - 1; i >= 0; i--) {
      var obj = objects[i];
      if (!obj.visible || obj.locked) continue;
      var b = getBounds(obj);
      if (wx >= b.minX && wx <= b.maxX && wy >= b.minY && wy <= b.maxY) {
        return obj;
      }
    }
    return null;
  }

  // ── Serialization ─────────────────────────────────────────────────────────

  // Serialize to JSON-safe object.
  // CRITICAL: no stroke geometry. Only references + transforms + overrides.
  function serialize(obj) {
    return {
      id:              obj.id,
      type:            "symbol",
      setId:           obj.setId,
      slotKey:         obj.slotKey,
      x:               obj.x,
      y:               obj.y,
      rotation:        obj.rotation,
      scale:           obj.scale,
      opacity:         obj.opacity,
      visible:         obj.visible,
      colorOverride:   obj.colorOverride  || null,
      paletteOverride: obj.paletteOverride || null,
      zIndex:          obj.zIndex || 0,
      collision:       !!obj.collision,
      soundEnabled:    !!obj.soundEnabled,
      locked:          !!obj.locked,
    };
  }

  // Hydrate from stored JSON. Merges with factory defaults.
  function hydrate(data) {
    if (!data || data.type !== "symbol") return null;
    var obj = createSymbolObject(data.setId, data.slotKey, data.x, data.y, data);
    obj.id = data.id || obj.id;  // Preserve stored id
    return obj;
  }

  // ── Duplicate ─────────────────────────────────────────────────────────────

  // Returns a new object with a fresh id, offset by half a BASE_SIZE.
  function duplicate(obj) {
    var offset = BASE_SIZE * 0.5;
    return createSymbolObject(obj.setId, obj.slotKey, obj.x + offset, obj.y + offset, {
      rotation:        obj.rotation,
      scale:           obj.scale,
      opacity:         obj.opacity,
      visible:         obj.visible,
      colorOverride:   obj.colorOverride,
      paletteOverride: obj.paletteOverride,
      zIndex:          obj.zIndex,
      collision:       obj.collision,
      soundEnabled:    obj.soundEnabled,
      locked:          obj.locked,
    });
  }

  // ── Resolve palette for rendering ─────────────────────────────────────────

  // Returns the effective palette for a given object and its parent set.
  // Priority: paletteOverride > colorOverride applied over set.palette > set.palette > null.
  function resolvePalette(obj, set) {
    var base = (set && set.palette) || null;
    if (obj.paletteOverride) {
      return Object.assign({}, base || {}, obj.paletteOverride);
    }
    if (obj.colorOverride && base) {
      return Object.assign({}, base, { strokeColor: obj.colorOverride, fillColor: obj.colorOverride });
    }
    if (obj.colorOverride) {
      return { strokeColor: obj.colorOverride, fillColor: obj.colorOverride, mode: "stroke", strokeWeight: 1.5, opacity: 1 };
    }
    return base;
  }

  // ── Sort by z-index ───────────────────────────────────────────────────────

  function sortByZIndex(objects) {
    return objects.slice().sort(function (a, b) {
      return (a.zIndex || 0) - (b.zIndex || 0);
    });
  }

  // ── Public API ────────────────────────────────────────────────────────────

  SBE.SymbolObjectSystem = {
    BASE_SIZE:           BASE_SIZE,
    createSymbolObject:  createSymbolObject,
    getWorldSize:        getWorldSize,
    getBounds:           getBounds,
    hitTest:             hitTest,
    serialize:           serialize,
    hydrate:             hydrate,
    duplicate:           duplicate,
    resolvePalette:      resolvePalette,
    sortByZIndex:        sortByZIndex,
  };

  console.log("[WOS SymbolObjectSystem] Loaded — v1.0.0");
})(window);
