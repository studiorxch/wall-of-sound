(function initShapeSystem(global) {
  var SBE = (global.SBE = global.SBE || {});
  var shapeId = 0;
  var segmentId = 0;

  function nextShapeId() {
    shapeId += 1;
    return "shape-" + shapeId;
  }

  function nextSegmentId() {
    segmentId += 1;
    return "seg-" + segmentId;
  }

  // ── Create ──────────────────────────────────────────────

  function createSegment(x1, y1, x2, y2, settings) {
    return {
      id: nextSegmentId(),
      type: "line",
      x1: x1,
      y1: y1,
      x2: x2,
      y2: y2,
      color: settings.color || "#ff4b4b",
      thickness: settings.thickness || 5,
      note: settings.note || 60,
      midiChannel: settings.midiChannel || 1,
      velocityRange: settings.velocityRange
        ? [settings.velocityRange[0], settings.velocityRange[1]]
        : [48, 110],
      behavior: {
        type: (settings.behavior && settings.behavior.type) || "normal",
        strength:
          settings.behavior && typeof settings.behavior.strength === "number"
            ? settings.behavior.strength
            : 1.4,
      },
      life: typeof settings.life === "number" ? settings.life : 9999,
      lastHitAt: 0,
    };
  }

  function createShape(kind, position, segments) {
    var bounds = computeSegmentsBounds(segments);

    return {
      id: nextShapeId(),
      kind: kind || "freehand",
      position: { x: position.x, y: position.y },
      rotation: 0,
      scale: 1,
      segments: segments,
      isExpanded: false,
      bounds: bounds,
    };
  }

  function createShapeFromPoints(kind, pointArrays, position, settings) {
    var segments = [];

    pointArrays.forEach(function (points) {
      for (var i = 0; i < points.length - 1; i += 1) {
        var length = Math.hypot(
          points[i + 1].x - points[i].x,
          points[i + 1].y - points[i].y,
        );
        if (length < 2) {
          continue;
        }
        segments.push(
          createSegment(
            points[i].x,
            points[i].y,
            points[i + 1].x,
            points[i + 1].y,
            settings,
          ),
        );
      }
    });

    if (!segments.length) {
      return null;
    }

    return createShape(kind, position, segments);
  }

  // ── Bounds ──────────────────────────────────────────────

  function computeSegmentsBounds(segments) {
    if (!segments.length) {
      return {
        minX: 0,
        minY: 0,
        maxX: 0,
        maxY: 0,
        width: 0,
        height: 0,
        cx: 0,
        cy: 0,
      };
    }

    var minX = Infinity;
    var minY = Infinity;
    var maxX = -Infinity;
    var maxY = -Infinity;

    segments.forEach(function (seg) {
      minX = Math.min(minX, seg.x1, seg.x2);
      minY = Math.min(minY, seg.y1, seg.y2);
      maxX = Math.max(maxX, seg.x1, seg.x2);
      maxY = Math.max(maxY, seg.y1, seg.y2);
    });

    return {
      minX: minX,
      minY: minY,
      maxX: maxX,
      maxY: maxY,
      width: maxX - minX,
      height: maxY - minY,
      cx: (minX + maxX) * 0.5,
      cy: (minY + maxY) * 0.5,
    };
  }

  function refreshBounds(shape) {
    shape.bounds = computeSegmentsBounds(shape.segments);
    return shape;
  }

  // ── Transform ───────────────────────────────────────────

  function translateShape(shape, dx, dy) {
    shape.position.x += dx;
    shape.position.y += dy;

    shape.segments.forEach(function (seg) {
      seg.x1 += dx;
      seg.y1 += dy;
      seg.x2 += dx;
      seg.y2 += dy;
    });

    refreshBounds(shape);
    return shape;
  }

  // ── Hit Testing ─────────────────────────────────────────

  function hitTestShape(shape, point, threshold) {
    var th = typeof threshold === "number" ? threshold : 18;

    // Quick bounds check with padding
    var b = shape.bounds;
    if (!b) {
      return false;
    }
    if (
      point.x < b.minX - th ||
      point.x > b.maxX + th ||
      point.y < b.minY - th ||
      point.y > b.maxY + th
    ) {
      return false;
    }

    // Per-segment distance check
    for (var i = 0; i < shape.segments.length; i += 1) {
      if (
        distanceToSegment(point, shape.segments[i]) <=
        th + shape.segments[i].thickness * 0.5
      ) {
        return true;
      }
    }

    return false;
  }

  function findShapeAtPoint(shapes, point, threshold) {
    // Search back to front (top-most first)
    for (var i = shapes.length - 1; i >= 0; i -= 1) {
      if (hitTestShape(shapes[i], point, threshold)) {
        return shapes[i];
      }
    }
    return null;
  }

  function findSegmentAtPoint(shape, point, threshold) {
    var th = typeof threshold === "number" ? threshold : 12;
    var closest = null;
    var closestDist = th;

    shape.segments.forEach(function (seg) {
      var d = distanceToSegment(point, seg) - seg.thickness * 0.5;
      if (d <= closestDist) {
        closestDist = d;
        closest = seg;
      }
    });

    return closest;
  }

  function distanceToSegment(point, seg) {
    var dx = seg.x2 - seg.x1;
    var dy = seg.y2 - seg.y1;
    var lengthSq = dx * dx + dy * dy || 1;
    var t = Math.max(
      0,
      Math.min(
        1,
        ((point.x - seg.x1) * dx + (point.y - seg.y1) * dy) / lengthSq,
      ),
    );
    var px = seg.x1 + dx * t;
    var py = seg.y1 + dy * t;
    return Math.hypot(point.x - px, point.y - py);
  }

  // ── Duplicate ───────────────────────────────────────────

  function duplicateShape(shape, offset) {
    var off = offset || 24;
    var newSegments = shape.segments.map(function (seg) {
      return {
        id: nextSegmentId(),
        type: seg.type,
        x1: seg.x1 + off,
        y1: seg.y1 + off,
        x2: seg.x2 + off,
        y2: seg.y2 + off,
        color: seg.color,
        thickness: seg.thickness,
        note: seg.note,
        midiChannel: seg.midiChannel,
        velocityRange: [seg.velocityRange[0], seg.velocityRange[1]],
        behavior: { type: seg.behavior.type, strength: seg.behavior.strength },
        life: seg.life,
        lastHitAt: 0,
      };
    });

    return createShape(
      shape.kind,
      {
        x: shape.position.x + off,
        y: shape.position.y + off,
      },
      newSegments,
    );
  }

  // ── Serialization ───────────────────────────────────────

  function serializeShape(shape) {
    return {
      id: shape.id,
      kind: shape.kind,
      position: { x: shape.position.x, y: shape.position.y },
      rotation: shape.rotation,
      scale: shape.scale,
      isExpanded: shape.isExpanded,
      segments: shape.segments.map(function (seg) {
        return {
          id: seg.id,
          type: seg.type,
          x1: seg.x1,
          y1: seg.y1,
          x2: seg.x2,
          y2: seg.y2,
          color: seg.color,
          thickness: seg.thickness,
          note: seg.note,
          midiChannel: seg.midiChannel,
          velocityRange: [seg.velocityRange[0], seg.velocityRange[1]],
          behavior: {
            type: seg.behavior.type,
            strength: seg.behavior.strength,
          },
          life: seg.life,
        };
      }),
    };
  }

  function hydrateShape(raw) {
    if (typeof raw.id === "string") {
      var match = raw.id.match(/^shape-(\d+)$/);
      if (match) {
        shapeId = Math.max(shapeId, Number(match[1]));
      }
    }

    var segments = (raw.segments || []).map(function (seg) {
      if (typeof seg.id === "string") {
        var segMatch = seg.id.match(/^seg-(\d+)$/);
        if (segMatch) {
          segmentId = Math.max(segmentId, Number(segMatch[1]));
        }
      }

      return {
        id: seg.id || nextSegmentId(),
        type: seg.type || "line",
        x1: seg.x1,
        y1: seg.y1,
        x2: seg.x2,
        y2: seg.y2,
        color: seg.color || "#ff4b4b",
        thickness: seg.thickness || 5,
        note: seg.note || 60,
        midiChannel: seg.midiChannel || 1,
        velocityRange: Array.isArray(seg.velocityRange)
          ? [seg.velocityRange[0], seg.velocityRange[1]]
          : [48, 110],
        behavior: {
          type: (seg.behavior && seg.behavior.type) || "normal",
          strength:
            seg.behavior && typeof seg.behavior.strength === "number"
              ? seg.behavior.strength
              : 1.4,
        },
        life: typeof seg.life === "number" ? seg.life : 9999,
        lastHitAt: 0,
      };
    });

    var shape = {
      id: raw.id || nextShapeId(),
      kind: raw.kind || "freehand",
      position: raw.position
        ? { x: raw.position.x, y: raw.position.y }
        : { x: 0, y: 0 },
      rotation: raw.rotation || 0,
      scale: raw.scale || 1,
      segments: segments,
      isExpanded: !!raw.isExpanded,
    };

    shape.bounds = computeSegmentsBounds(segments);
    return shape;
  }

  // ── Collision lines (for physics integration) ───────────

  function getCollisionSegments(shapes) {
    var result = [];

    shapes.forEach(function (shape) {
      shape.segments.forEach(function (seg) {
        var proxy = {
          id: seg.id,
          x1: seg.x1,
          y1: seg.y1,
          x2: seg.x2,
          y2: seg.y2,
          color: seg.color,
          thickness: seg.thickness,
          midiChannel: seg.midiChannel,
          note: seg.note,
          velocityRange: seg.velocityRange,
          life: seg.life,
          behavior: seg.behavior,
          interaction: { highlightColor: "#ffffff", duration: 140 },
          _shapeId: shape.id,
          _segment: seg,
        };

        // lastHitAt writes through to the real segment
        Object.defineProperty(proxy, "lastHitAt", {
          get: function () {
            return seg.lastHitAt || 0;
          },
          set: function (v) {
            seg.lastHitAt = v;
          },
          enumerable: true,
        });

        result.push(proxy);
      });
    });

    return result;
  }

  function markSegmentHit(seg, now) {
    if (seg._segment) {
      seg._segment.lastHitAt = now;
    }
    seg.lastHitAt = now;
  }

  // ── Export ──────────────────────────────────────────────

  SBE.ShapeSystem = {
    createSegment: createSegment,
    createShape: createShape,
    createShapeFromPoints: createShapeFromPoints,
    computeSegmentsBounds: computeSegmentsBounds,
    refreshBounds: refreshBounds,
    translateShape: translateShape,
    hitTestShape: hitTestShape,
    findShapeAtPoint: findShapeAtPoint,
    findSegmentAtPoint: findSegmentAtPoint,
    duplicateShape: duplicateShape,
    serializeShape: serializeShape,
    hydrateShape: hydrateShape,
    getCollisionSegments: getCollisionSegments,
    markSegmentHit: markSegmentHit,
  };
})(window);
