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

  // ── Multi-select helpers ──────────────────────────────────────────────────

  // Returns the combined AABB of all selected objects. Returns null if nothing selected.
  function getMultiBounds(objects, selectedIds) {
    if (!selectedIds || !selectedIds.size) return null;
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    var found = false;
    objects.forEach(function (obj) {
      if (!selectedIds.has(obj.id)) return;
      var b = getBounds(obj);
      if (b.minX < minX) minX = b.minX;
      if (b.minY < minY) minY = b.minY;
      if (b.maxX > maxX) maxX = b.maxX;
      if (b.maxY > maxY) maxY = b.maxY;
      found = true;
    });
    if (!found) return null;
    return { minX: minX, minY: minY, maxX: maxX, maxY: maxY, w: maxX - minX, h: maxY - minY,
             cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
  }

  // Returns selected objects in z-order.
  function getSelectedObjects(objects, selectedIds) {
    if (!selectedIds || !selectedIds.size) return [];
    return sortByZIndex(objects.filter(function (o) { return selectedIds.has(o.id); }));
  }

  // Returns all objects whose AABB intersects the given rect {x1,y1,x2,y2} (any order).
  function objectsInRect(objects, x1, y1, x2, y2) {
    var rx1 = Math.min(x1, x2), ry1 = Math.min(y1, y2);
    var rx2 = Math.max(x1, x2), ry2 = Math.max(y1, y2);
    return objects.filter(function (obj) {
      var b = getBounds(obj);
      return b.maxX >= rx1 && b.minX <= rx2 && b.maxY >= ry1 && b.minY <= ry2;
    });
  }

  // ── Group transforms ──────────────────────────────────────────────────────

  // Move all selected objects by (dx, dy).
  function moveGroup(objects, selectedIds, dx, dy) {
    objects.forEach(function (obj) {
      if (!selectedIds.has(obj.id) || obj.locked) return;
      obj.x += dx;
      obj.y += dy;
    });
  }

  // Rotate all selected objects by dr radians around the given center (cx, cy).
  function rotateGroup(objects, selectedIds, dr, cx, cy) {
    var cos = Math.cos(dr), sin = Math.sin(dr);
    objects.forEach(function (obj) {
      if (!selectedIds.has(obj.id) || obj.locked) return;
      var ox = obj.x - cx, oy = obj.y - cy;
      obj.x  = cx + ox * cos - oy * sin;
      obj.y  = cy + ox * sin + oy * cos;
      obj.rotation = (obj.rotation || 0) + dr;
    });
  }

  // Scale all selected objects by ds around the given center (cx, cy).
  function scaleGroup(objects, selectedIds, ds, cx, cy) {
    objects.forEach(function (obj) {
      if (!selectedIds.has(obj.id) || obj.locked) return;
      obj.x     = cx + (obj.x - cx) * ds;
      obj.y     = cy + (obj.y - cy) * ds;
      obj.scale = Math.max(0.05, (obj.scale || 1) * ds);
    });
  }

  // ── Z-order ───────────────────────────────────────────────────────────────

  function _getZRange(objects) {
    var zs = objects.map(function (o) { return o.zIndex || 0; });
    return { min: Math.min.apply(null, zs), max: Math.max.apply(null, zs) };
  }

  function bringForward(objects, id) {
    var obj = objects.find(function (o) { return o.id === id; });
    if (obj) obj.zIndex = (obj.zIndex || 0) + 1;
  }

  function sendBackward(objects, id) {
    var obj = objects.find(function (o) { return o.id === id; });
    if (obj) obj.zIndex = (obj.zIndex || 0) - 1;
  }

  function bringToFront(objects, id) {
    var obj = objects.find(function (o) { return o.id === id; });
    if (!obj || objects.length < 2) return;
    var r = _getZRange(objects);
    obj.zIndex = r.max + 1;
  }

  function sendToBack(objects, id) {
    var obj = objects.find(function (o) { return o.id === id; });
    if (!obj || objects.length < 2) return;
    var r = _getZRange(objects);
    obj.zIndex = r.min - 1;
  }

  // ── Snap helpers ──────────────────────────────────────────────────────────

  // Snap a value to the nearest multiple of gridSize. No-op if gridSize <= 0.
  function snapToGrid(v, gridSize) {
    if (!gridSize || gridSize <= 0) return v;
    return Math.round(v / gridSize) * gridSize;
  }

  // Snap an angle (radians) to the nearest multiple of snapDeg degrees.
  var SNAP_DEG = 15;
  function snapAngle(r, snapDeg) {
    snapDeg = snapDeg || SNAP_DEG;
    var snapRad = snapDeg * Math.PI / 180;
    return Math.round(r / snapRad) * snapRad;
  }

  // Snap a point to grid if enabled.
  function snapPoint(pt, gridEnabled, gridSize) {
    if (!gridEnabled || !gridSize) return pt;
    return { x: snapToGrid(pt.x, gridSize), y: snapToGrid(pt.y, gridSize) };
  }

  // ── Public API ────────────────────────────────────────────────────────────

  SBE.SymbolObjectSystem = {
    BASE_SIZE:           BASE_SIZE,
    // Core
    createSymbolObject:  createSymbolObject,
    getWorldSize:        getWorldSize,
    getBounds:           getBounds,
    hitTest:             hitTest,
    serialize:           serialize,
    hydrate:             hydrate,
    duplicate:           duplicate,
    resolvePalette:      resolvePalette,
    sortByZIndex:        sortByZIndex,
    // Multi-select
    getMultiBounds:      getMultiBounds,
    getSelectedObjects:  getSelectedObjects,
    objectsInRect:       objectsInRect,
    // Group transforms
    moveGroup:           moveGroup,
    rotateGroup:         rotateGroup,
    scaleGroup:          scaleGroup,
    // Z-order
    bringForward:        bringForward,
    sendBackward:        sendBackward,
    bringToFront:        bringToFront,
    sendToBack:          sendToBack,
    // Snap
    snapToGrid:          snapToGrid,
    snapAngle:           snapAngle,
    snapPoint:           snapPoint,
  };

  console.log("[WOS SymbolObjectSystem] Loaded — v1.0.0");
})(window);
