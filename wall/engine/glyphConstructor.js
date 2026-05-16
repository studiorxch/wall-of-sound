// 0513_WOS_GlyphConstructor_v1.3.0
// Construction state + operations for the Glyph Construction System.
// Attaches to WOS.GlyphConstructor.
//
// Manages ephemeral UI state (selected tool, selection) separately from
// glyph data (glyph.objects[]), which lives in the SymbolSet registry.
//
// All coordinates normalized 0..1 matching SymbolRenderer space.

(function initGlyphConstructor(global) {
  "use strict";

  var WOS = (global.WOS = global.WOS || {});

  function _uid() {
    return "obj_" + Math.random().toString(36).slice(2, 9);
  }

  // ── Construction UI state ─────────────────────────────────────────────────

  function createState() {
    return {
      tool:           "select",
      selection:      [],
      snapEnabled:    true,
      gridDivisions:  16,
      strokeColor:    "#ffffff",
      strokeEnabled:  true,
      strokeWidth:    0.04,
      fillColor:      "#ffffff",
      fillEnabled:    false,
      cornerRadius:   0,
      lineStyle:      "solid",   // "solid" | "dashed" | "dotted"
      dashLength:     0.15,
      gapLength:      0.08,
      dotRadius:      0.025,
      patternSpacing: 0.10,
      lineCap:        "round",
      history:        [],        // array of snapshots (deep-cloned objects arrays)
      historyIndex:   -1,
    };
  }

  // ── Snap ──────────────────────────────────────────────────────────────────

  function snapToGrid(v, divisions) {
    var step = 1 / (divisions || 16);
    return Math.round(v / step) * step;
  }

  function snapPt(x, y, state) {
    if (!state.snapEnabled) return { x: x, y: y };
    return { x: snapToGrid(x, state.gridDivisions),
             y: snapToGrid(y, state.gridDivisions) };
  }

  // ── Object creation ───────────────────────────────────────────────────────

  function createObject(type, props, state) {
    return Object.assign(
      { id: _uid(), type: type },
      props,
      {
        stroke:         state.strokeEnabled !== false ? state.strokeColor : null,
        strokeWidth:    state.strokeEnabled !== false ? state.strokeWidth : 0,
        fill:           state.fillEnabled ? state.fillColor : null,
        lineStyle:      state.lineStyle      || "solid",
        dashLength:     state.dashLength     || 0.15,
        gapLength:      state.gapLength      || 0.08,
        dotRadius:      state.dotRadius      || 0.025,
        patternSpacing: state.patternSpacing || 0.10,
        lineCap:        state.lineCap        || "round",
      }
    );
  }

  // ── Bounds ────────────────────────────────────────────────────────────────

  function objBounds(obj) {
    if (obj.type === "line") {
      return { x: Math.min(obj.x1, obj.x2), y: Math.min(obj.y1, obj.y2),
               w: Math.abs(obj.x2 - obj.x1) || 0.01, h: Math.abs(obj.y2 - obj.y1) || 0.01 };
    }
    if (obj.type === "rect") {
      return { x: obj.x, y: obj.y, w: Math.abs(obj.w) || 0.01, h: Math.abs(obj.h) || 0.01 };
    }
    if (obj.type === "circle" || obj.type === "dot" || obj.type === "arc") {
      var rx = obj.rx !== undefined ? obj.rx : (obj.r || 0.05);
      var ry = obj.ry !== undefined ? obj.ry : (obj.r || 0.05);
      return { x: obj.cx - rx, y: obj.cy - ry, w: rx * 2, h: ry * 2 };
    }
    if (obj.type === "triangle") {
      var xs = [obj.x1, obj.x2, obj.x3], ys = [obj.y1, obj.y2, obj.y3];
      var mx = Math.min.apply(null, xs), my = Math.min.apply(null, ys);
      return { x: mx, y: my, w: Math.max.apply(null, xs) - mx || 0.01,
                              h: Math.max.apply(null, ys) - my || 0.01 };
    }
    if (obj.type === "capsule") {
      var cr = obj.radius || 0.05;
      return { x: Math.min(obj.x1, obj.x2) - cr, y: Math.min(obj.y1, obj.y2) - cr,
               w: Math.abs(obj.x2 - obj.x1) + cr * 2 || cr * 2,
               h: Math.abs(obj.y2 - obj.y1) + cr * 2 || cr * 2 };
    }
    if (obj.type === "corner") {
      var xs2 = [obj.p0x, obj.p1x, obj.p2x], ys2 = [obj.p0y, obj.p1y, obj.p2y];
      var mnx = Math.min.apply(null, xs2), mny = Math.min.apply(null, ys2);
      return { x: mnx, y: mny,
               w: Math.max.apply(null, xs2) - mnx || 0.01,
               h: Math.max.apply(null, ys2) - mny || 0.01 };
    }
    return { x: 0, y: 0, w: 0.01, h: 0.01 };
  }

  // ── Hit testing ───────────────────────────────────────────────────────────

  function hitTest(objects, nx, ny) {
    var T = 0.06;
    for (var i = objects.length - 1; i >= 0; i--) {
      if (_hitObj(objects[i], nx, ny, T)) return objects[i].id;
    }
    return null;
  }

  function _hitObj(obj, nx, ny, t) {
    if (obj.type === "line") {
      return _distSeg(nx, ny, obj.x1, obj.y1, obj.x2, obj.y2) < t;
    }
    if (obj.type === "rect") {
      var x2 = obj.x + obj.w, y2 = obj.y + obj.h;
      return nx >= Math.min(obj.x, x2) - t && nx <= Math.max(obj.x, x2) + t &&
             ny >= Math.min(obj.y, y2) - t && ny <= Math.max(obj.y, y2) + t;
    }
    if (obj.type === "circle") {
      if (obj.rx !== undefined && obj.ry !== undefined) {
        var enx = (nx - obj.cx) / (obj.rx || 0.01), eny = (ny - obj.cy) / (obj.ry || 0.01);
        var ed = Math.sqrt(enx * enx + eny * eny);
        return obj.fill ? ed < 1 + t / Math.min(obj.rx, obj.ry)
                        : Math.abs(ed - 1) < t / Math.min(obj.rx, obj.ry);
      }
      var d = Math.hypot(nx - obj.cx, ny - obj.cy);
      return obj.fill ? d < (obj.r || 0.05) + t : Math.abs(d - (obj.r || 0.05)) < t;
    }
    if (obj.type === "dot") {
      return Math.hypot(nx - obj.cx, ny - obj.cy) < (obj.r || 0.05) + t;
    }
    if (obj.type === "arc") {
      return Math.abs(Math.hypot(nx - obj.cx, ny - obj.cy) - obj.r) < t;
    }
    if (obj.type === "triangle") {
      if (obj.fill && _ptInTriangle(nx, ny, obj.x1, obj.y1, obj.x2, obj.y2, obj.x3, obj.y3)) return true;
      return _distSeg(nx, ny, obj.x1, obj.y1, obj.x2, obj.y2) < t ||
             _distSeg(nx, ny, obj.x2, obj.y2, obj.x3, obj.y3) < t ||
             _distSeg(nx, ny, obj.x3, obj.y3, obj.x1, obj.y1) < t;
    }
    if (obj.type === "capsule") {
      return _distSeg(nx, ny, obj.x1, obj.y1, obj.x2, obj.y2) < (obj.radius || 0.05) + t;
    }
    if (obj.type === "corner") {
      return _distSeg(nx, ny, obj.p0x, obj.p0y, obj.p1x, obj.p1y) < t ||
             _distSeg(nx, ny, obj.p1x, obj.p1y, obj.p2x, obj.p2y) < t;
    }
    return false;
  }

  function _distSeg(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay;
    var len2 = dx * dx + dy * dy;
    if (len2 === 0) return Math.hypot(px - ax, py - ay);
    var t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  function _ptInTriangle(px, py, ax, ay, bx, by, cx, cy) {
    var d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
    var d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
    var d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
    var neg = (d1 < 0) || (d2 < 0) || (d3 < 0);
    var pos = (d1 > 0) || (d2 > 0) || (d3 > 0);
    return !(neg && pos);
  }

  function hitTestMarquee(objects, r) {
    var rx2 = r.x + r.w, ry2 = r.y + r.h;
    return objects.filter(function (obj) {
      var b = objBounds(obj);
      return b.x < rx2 && b.x + b.w > r.x && b.y < ry2 && b.y + b.h > r.y;
    }).map(function (obj) { return obj.id; });
  }

  // ── Transform ─────────────────────────────────────────────────────────────

  function moveObjects(objects, ids, dx, dy) {
    var set = _idSet(ids);
    objects.forEach(function (obj) {
      if (set.has(obj.id)) _translate(obj, dx, dy);
    });
  }

  function _translate(obj, dx, dy) {
    if (obj.type === "line" || obj.type === "capsule") {
      obj.x1 += dx; obj.y1 += dy; obj.x2 += dx; obj.y2 += dy;
    } else if (obj.type === "rect") {
      obj.x += dx; obj.y += dy;
    } else if (obj.type === "circle" || obj.type === "dot" || obj.type === "arc") {
      obj.cx += dx; obj.cy += dy;
    } else if (obj.type === "triangle") {
      obj.x1 += dx; obj.y1 += dy;
      obj.x2 += dx; obj.y2 += dy;
      obj.x3 += dx; obj.y3 += dy;
    } else if (obj.type === "corner") {
      obj.p0x += dx; obj.p0y += dy;
      obj.p1x += dx; obj.p1y += dy;
      obj.p2x += dx; obj.p2y += dy;
    }
  }

  function mirrorObjects(objects, ids, axis) {
    var set = _idSet(ids);
    objects.forEach(function (obj) {
      if (set.has(obj.id)) _mirror(obj, axis);
    });
  }

  function _mirror(obj, axis) {
    var fx = function (v) { return 1 - v; };
    var fy = function (v) { return 1 - v; };
    if (axis === "h") {
      if (obj.type === "line" || obj.type === "capsule") {
        obj.x1 = fx(obj.x1); obj.x2 = fx(obj.x2);
      } else if (obj.type === "rect") {
        obj.x = fx(obj.x + obj.w);
      } else if (obj.type === "circle" || obj.type === "dot" || obj.type === "arc") {
        obj.cx = fx(obj.cx);
      } else if (obj.type === "triangle") {
        obj.x1 = fx(obj.x1); obj.x2 = fx(obj.x2); obj.x3 = fx(obj.x3);
      } else if (obj.type === "corner") {
        obj.p0x = fx(obj.p0x); obj.p1x = fx(obj.p1x); obj.p2x = fx(obj.p2x);
      }
    } else {
      if (obj.type === "line" || obj.type === "capsule") {
        obj.y1 = fy(obj.y1); obj.y2 = fy(obj.y2);
      } else if (obj.type === "rect") {
        obj.y = fy(obj.y + obj.h);
      } else if (obj.type === "circle" || obj.type === "dot" || obj.type === "arc") {
        obj.cy = fy(obj.cy);
      } else if (obj.type === "triangle") {
        obj.y1 = fy(obj.y1); obj.y2 = fy(obj.y2); obj.y3 = fy(obj.y3);
      } else if (obj.type === "corner") {
        obj.p0y = fy(obj.p0y); obj.p1y = fy(obj.p1y); obj.p2y = fy(obj.p2y);
      }
    }
  }

  // Rotate 90° CW around (0.5, 0.5).
  function rotateObjects90(objects, ids) {
    var set = _idSet(ids);
    objects.forEach(function (obj) {
      if (set.has(obj.id)) _rot90(obj);
    });
  }

  function _rotPt90(x, y) {
    // (x,y) → rotate 90° CW around (0.5,0.5): new = (0.5+(y-0.5), 0.5-(x-0.5)) = (y, 1-x)
    return { x: y, y: 1 - x };
  }

  function _rot90(obj) {
    if (obj.type === "line" || obj.type === "capsule") {
      var a = _rotPt90(obj.x1, obj.y1), b = _rotPt90(obj.x2, obj.y2);
      obj.x1 = a.x; obj.y1 = a.y; obj.x2 = b.x; obj.y2 = b.y;
    } else if (obj.type === "rect") {
      var p = _rotPt90(obj.x, obj.y);
      var tmp = obj.w; obj.w = obj.h; obj.h = tmp;
      obj.x = p.x - obj.w; obj.y = p.y;
    } else if (obj.type === "circle" || obj.type === "dot" || obj.type === "arc") {
      var cp = _rotPt90(obj.cx, obj.cy);
      obj.cx = cp.x; obj.cy = cp.y;
    } else if (obj.type === "triangle") {
      var t1 = _rotPt90(obj.x1, obj.y1);
      var t2 = _rotPt90(obj.x2, obj.y2);
      var t3 = _rotPt90(obj.x3, obj.y3);
      obj.x1 = t1.x; obj.y1 = t1.y;
      obj.x2 = t2.x; obj.y2 = t2.y;
      obj.x3 = t3.x; obj.y3 = t3.y;
    } else if (obj.type === "corner") {
      var rp0 = _rotPt90(obj.p0x, obj.p0y);
      var rp1 = _rotPt90(obj.p1x, obj.p1y);
      var rp2 = _rotPt90(obj.p2x, obj.p2y);
      obj.p0x = rp0.x; obj.p0y = rp0.y;
      obj.p1x = rp1.x; obj.p1y = rp1.y;
      obj.p2x = rp2.x; obj.p2y = rp2.y;
    }
  }

  function duplicateObjects(objects, ids) {
    var set = _idSet(ids);
    var copies = [];
    objects.forEach(function (obj) {
      if (!set.has(obj.id)) return;
      var copy = Object.assign({}, obj, { id: _uid() });
      _translate(copy, 0.04, 0.04);
      copies.push(copy);
    });
    return copies;
  }

  function removeObjects(objects, ids) {
    var set = _idSet(ids);
    return objects.filter(function (obj) { return !set.has(obj.id); });
  }

  // ── Selection bounds ─────────────────────────────────────────────────────

  function selectionBounds(objects, ids) {
    if (!ids || !ids.length) return null;
    var set = _idSet(ids);
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    objects.forEach(function (obj) {
      if (!set.has(obj.id)) return;
      var b = objBounds(obj);
      if (b.x < minX) minX = b.x;
      if (b.y < minY) minY = b.y;
      if (b.x + b.w > maxX) maxX = b.x + b.w;
      if (b.y + b.h > maxY) maxY = b.y + b.h;
    });
    if (!isFinite(minX)) return null;
    return { x: minX, y: minY, w: Math.max(0.01, maxX - minX), h: Math.max(0.01, maxY - minY) };
  }

  // ── Scale ─────────────────────────────────────────────────────────────────

  function scaleObjects(objects, ids, sx, sy, ox, oy) {
    var set = _idSet(ids);
    objects.forEach(function (obj) {
      if (set.has(obj.id)) _scaleObj(obj, sx, sy, ox, oy);
    });
  }

  function _scaleObj(obj, sx, sy, ox, oy) {
    function scX(v) { return ox + (v - ox) * sx; }
    function scY(v) { return oy + (v - oy) * sy; }
    if (obj.type === "line" || obj.type === "capsule") {
      obj.x1 = scX(obj.x1); obj.y1 = scY(obj.y1);
      obj.x2 = scX(obj.x2); obj.y2 = scY(obj.y2);
    } else if (obj.type === "rect") {
      var nx2 = scX(obj.x + obj.w), ny2 = scY(obj.y + obj.h);
      obj.x = scX(obj.x); obj.y = scY(obj.y);
      obj.w = nx2 - obj.x; obj.h = ny2 - obj.y;
    } else if (obj.type === "circle") {
      obj.cx = scX(obj.cx); obj.cy = scY(obj.cy);
      if (obj.rx !== undefined) {
        obj.rx = Math.abs(obj.rx * sx); obj.ry = Math.abs(obj.ry * sy);
        obj.r  = Math.max(obj.rx, obj.ry);
      } else {
        obj.r = Math.abs(obj.r * Math.max(sx, sy));
      }
    } else if (obj.type === "dot") {
      obj.cx = scX(obj.cx); obj.cy = scY(obj.cy);
    } else if (obj.type === "arc") {
      obj.cx = scX(obj.cx); obj.cy = scY(obj.cy);
      obj.r  = Math.abs(obj.r * Math.max(sx, sy));
    } else if (obj.type === "corner") {
      obj.p0x = scX(obj.p0x); obj.p0y = scY(obj.p0y);
      obj.p1x = scX(obj.p1x); obj.p1y = scY(obj.p1y);
      obj.p2x = scX(obj.p2x); obj.p2y = scY(obj.p2y);
    } else if (obj.type === "triangle") {
      obj.x1 = scX(obj.x1); obj.y1 = scY(obj.y1);
      obj.x2 = scX(obj.x2); obj.y2 = scY(obj.y2);
      obj.x3 = scX(obj.x3); obj.y3 = scY(obj.y3);
    }
  }

  // ── Arbitrary rotation ────────────────────────────────────────────────────

  function rotateObjectsArbitrary(objects, ids, angle, cx, cy) {
    var set = _idSet(ids);
    objects.forEach(function (obj) {
      if (set.has(obj.id)) _rotArbitrary(obj, angle, cx, cy);
    });
  }

  function _rotPtAny(x, y, cos, sin, cx, cy) {
    var dx = x - cx, dy = y - cy;
    return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
  }

  function _rotArbitrary(obj, angle, cx, cy) {
    var cos = Math.cos(angle), sin = Math.sin(angle);
    function rp(x, y) { return _rotPtAny(x, y, cos, sin, cx, cy); }
    if (obj.type === "line" || obj.type === "capsule") {
      var a = rp(obj.x1, obj.y1), b = rp(obj.x2, obj.y2);
      obj.x1 = a.x; obj.y1 = a.y; obj.x2 = b.x; obj.y2 = b.y;
    } else if (obj.type === "rect") {
      // Move center — axis-aligned rect can't truly rotate, just repositions
      var rc = rp(obj.x + obj.w / 2, obj.y + obj.h / 2);
      obj.x = rc.x - obj.w / 2; obj.y = rc.y - obj.h / 2;
    } else if (obj.type === "circle" || obj.type === "dot" || obj.type === "arc") {
      var cc = rp(obj.cx, obj.cy); obj.cx = cc.x; obj.cy = cc.y;
    } else if (obj.type === "corner") {
      var p0 = rp(obj.p0x, obj.p0y), p1 = rp(obj.p1x, obj.p1y), p2 = rp(obj.p2x, obj.p2y);
      obj.p0x = p0.x; obj.p0y = p0.y; obj.p1x = p1.x; obj.p1y = p1.y; obj.p2x = p2.x; obj.p2y = p2.y;
    } else if (obj.type === "triangle") {
      var t1 = rp(obj.x1, obj.y1), t2 = rp(obj.x2, obj.y2), t3 = rp(obj.x3, obj.y3);
      obj.x1 = t1.x; obj.y1 = t1.y; obj.x2 = t2.x; obj.y2 = t2.y; obj.x3 = t3.x; obj.y3 = t3.y;
    }
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  function _idSet(ids) {
    var s = Object.create(null);
    ids.forEach(function (id) { s[id] = true; });
    s.has = function (id) { return !!this[id]; };
    return s;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  WOS.GlyphConstructor = {
    createState:              createState,
    snapPt:                   snapPt,
    snapToGrid:               snapToGrid,
    createObject:             createObject,
    objBounds:                objBounds,
    selectionBounds:          selectionBounds,
    hitTest:                  hitTest,
    hitTestMarquee:           hitTestMarquee,
    moveObjects:              moveObjects,
    mirrorObjects:            mirrorObjects,
    rotateObjects90:          rotateObjects90,
    scaleObjects:             scaleObjects,
    rotateObjectsArbitrary:   rotateObjectsArbitrary,
    duplicateObjects:         duplicateObjects,
    removeObjects:            removeObjects,
  };

  console.log("[WOS GlyphConstructor] Loaded — v1.3.0");
})(window);
