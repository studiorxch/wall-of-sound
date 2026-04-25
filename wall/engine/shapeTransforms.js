(function patchShapeTransforms(global) {
  var SBE = global.SBE;
  if (!SBE || !SBE.ShapeSystem) {
    return;
  }

  var SS = SBE.ShapeSystem;

  function getShapeCenter(shape) {
    var segs = shape.segments;
    if (!segs || !segs.length) {
      return { x: shape.position.x, y: shape.position.y };
    }

    var sumX = 0;
    var sumY = 0;
    var count = 0;

    segs.forEach(function (seg) {
      sumX += seg.x1 + seg.x2;
      sumY += seg.y1 + seg.y2;
      count += 2;
    });

    return {
      x: sumX / count,
      y: sumY / count,
    };
  }

  function rotateShape(shape, angle) {
    var center = getShapeCenter(shape);
    var cos = Math.cos(angle);
    var sin = Math.sin(angle);

    shape.segments.forEach(function (seg) {
      var dx1 = seg.x1 - center.x;
      var dy1 = seg.y1 - center.y;
      seg.x1 = center.x + dx1 * cos - dy1 * sin;
      seg.y1 = center.y + dx1 * sin + dy1 * cos;

      var dx2 = seg.x2 - center.x;
      var dy2 = seg.y2 - center.y;
      seg.x2 = center.x + dx2 * cos - dy2 * sin;
      seg.y2 = center.y + dx2 * sin + dy2 * cos;
    });

    shape.rotation = (shape.rotation || 0) + angle;
    SS.refreshBounds(shape);
    return shape;
  }

  function scaleShape(shape, factor) {
    var center = getShapeCenter(shape);

    shape.segments.forEach(function (seg) {
      seg.x1 = center.x + (seg.x1 - center.x) * factor;
      seg.y1 = center.y + (seg.y1 - center.y) * factor;
      seg.x2 = center.x + (seg.x2 - center.x) * factor;
      seg.y2 = center.y + (seg.y2 - center.y) * factor;
    });

    shape.scale = (shape.scale || 1) * factor;
    SS.refreshBounds(shape);
    return shape;
  }

  SS.getShapeCenter = getShapeCenter;
  SS.rotateShape = rotateShape;
  SS.scaleShape = scaleShape;

  // FIX 1: Override duplicateShape — preserve mechanicType + explicit sound copy
  var originalDuplicate = SS.duplicateShape;
  SS.duplicateShape = function duplicateShapePatched(shape, offset) {
    var copy = originalDuplicate(shape, offset);
    for (var i = 0; i < copy.segments.length; i += 1) {
      var src = shape.segments[i];
      var dst = copy.segments[i];
      if (src && dst) {
        dst.mechanicType = src.mechanicType || null;
        if (src.sound) {
          dst.sound = {
            enabled: src.sound.enabled,
            event: src.sound.event,
            frequency: src.sound.frequency,
            volume: src.sound.volume,
            duration: src.sound.duration,
            cooldownMs: src.sound.cooldownMs,
            midi: src.sound.midi
              ? {
                  channel: src.sound.midi.channel,
                  note: src.sound.midi.note,
                  velocity: src.sound.midi.velocity,
                }
              : null,
          };
        }
      }
    }
    return copy;
  };

  // FIX 3: Override getCollisionSegments — add .sound and .mechanicType to proxies
  var originalGetCollision = SS.getCollisionSegments;
  SS.getCollisionSegments = function getCollisionSegmentsPatched(shapes) {
    var proxies = originalGetCollision(shapes);
    proxies.forEach(function (proxy) {
      if (proxy._segment && proxy._segment.sound) {
        proxy.sound = proxy._segment.sound;
      }
      if (proxy._segment && proxy._segment.mechanicType) {
        proxy.mechanicType = proxy._segment.mechanicType;
      }
    });
    return proxies;
  };

  // Patch hydrateShape to ensure note/midiChannel defaults on every segment
  var originalHydrate = SS.hydrateShape;
  SS.hydrateShape = function hydrateShapePatched(raw) {
    var shape = originalHydrate(raw);
    shape.segments.forEach(function (seg) {
      if (seg.note == null) seg.note = 60;
      if (seg.midiChannel == null) seg.midiChannel = 1;
    });
    return shape;
  };
})(window);
