(function initMotionSystem(global) {
  var SBE = (global.SBE = global.SBE || {});

  function wrap(value, max) {
    if (value < 0) return value + max;
    if (value > max) return value - max;
    return value;
  }

  function updateShapeMotion(shape, dt, bounds) {
    var m = shape.motion;
    if (!m || !m.enabled) return;
    if (!SBE.ShapeSystem) return;

    // Translation via ShapeSystem (moves position + segments + bounds)
    var dx = m.vx * dt;
    var dy = m.vy * dt;
    if (dx !== 0 || dy !== 0) {
      SBE.ShapeSystem.translateShape(shape, dx, dy);
    }

    // Rotation via ShapeSystem (rotates segments around center + updates bounds)
    if (m.angularVelocity) {
      SBE.ShapeSystem.rotateShape(shape, m.angularVelocity * dt);
    }

    // Loop wrapping
    if (m.loop && bounds) {
      var ox = shape.position.x;
      var oy = shape.position.y;
      var nx = wrap(ox, bounds.width);
      var ny = wrap(oy, bounds.height);
      var wdx = nx - ox;
      var wdy = ny - oy;
      if (wdx !== 0 || wdy !== 0) {
        SBE.ShapeSystem.translateShape(shape, wdx, wdy);
      }
    }
  }

  function updateAll(shapes, dt, bounds) {
    for (var i = 0; i < shapes.length; i += 1) {
      updateShapeMotion(shapes[i], dt, bounds);
    }
  }

  SBE.MotionSystem = {
    updateAll: updateAll,
  };
})(window);
