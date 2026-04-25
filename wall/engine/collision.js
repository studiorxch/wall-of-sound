(function initCollision(global) {
  const SBE = (global.SBE = global.SBE || {});

  function detectCollisions(state, now) {
    const collisions = [];
    const lineSystem = SBE.LineSystem;
    const physics = SBE.EnginePhysics;
    const activeLines = state.lines
      .concat(
        SBE.TextSystem
          ? SBE.TextSystem.getCollisionLines(state.textObjects || [])
          : [],
      )
      .concat(
        SBE.ShapeSystem && state.shapes
          ? SBE.ShapeSystem.getCollisionSegments(state.shapes)
          : [],
      );

    state.balls.forEach((ball) => {
      const lineCollisions = new Map();
      const wallCollision = physics.resolveWallBounce(ball, state.canvas);
      if (wallCollision) {
        collisions.push(wallCollision);
      }

      activeLines.forEach((line) => {
        const closest = lineSystem.getClosestPoint(line, ball);
        const dx = ball.x - closest.x;
        const dy = ball.y - closest.y;
        const distance = Math.hypot(dx, dy);
        const threshold = ball.radius + line.thickness * 0.5;

        if (distance > threshold) {
          return;
        }

        const groupKey = line.collisionGroupId || line.id;
        const key = ball.id + ":" + groupKey;
        const previous = state.collisionMemory.get(key) || 0;

        const current = lineCollisions.get(key);
        const candidate = {
          type: "line",
          key,
          ballId: ball.id,
          lineId: line.id,
          ball,
          line,
          closestPoint: closest,
          distance,
          threshold,
          canTriggerSound: now - previous > 72,
        };

        if (!current || distance < current.distance) {
          lineCollisions.set(key, candidate);
        }
      });

      lineCollisions.forEach((collision) => {
        collisions.push(collision);
      });
    });

    return collisions;
  }

  function resolveCollisions(state, collisions, now) {
    const physics = SBE.EnginePhysics;
    const lineSystem = SBE.LineSystem;
    const soundSources = [];

    collisions.forEach((collision) => {
      if (collision.type !== "line") {
        return;
      }

      const line = collision.line;
      const ball = collision.ball;
      const normal = lineSystem.getLineNormal(line, ball);
      const overlap =
        Math.max(0, collision.threshold - collision.distance) + 0.35;

      ball.x += normal.x * overlap;
      ball.y += normal.y * overlap;

      if (line.mechanicType === "bumper-hard") {
        var dot = ball.vx * normal.x + ball.vy * normal.y;
        ball.vx = (ball.vx - 2 * dot * normal.x) * 0.95;
        ball.vy = (ball.vy - 2 * dot * normal.y) * 0.95;
        var speed = Math.hypot(ball.vx, ball.vy);
        if (speed < 120) {
          ball.vx = (ball.vx / (speed || 1)) * 120;
          ball.vy = (ball.vy / (speed || 1)) * 120;
        }
      } else if (line.mechanicType === "bumper-elastic") {
        var dotE = ball.vx * normal.x + ball.vy * normal.y;
        ball.vx = (ball.vx - 2 * dotE * normal.x) * 1.15;
        ball.vy = (ball.vy - 2 * dotE * normal.y) * 1.15;
        var speedE = Math.hypot(ball.vx, ball.vy);
        if (speedE > 620) {
          ball.vx = (ball.vx / speedE) * 620;
          ball.vy = (ball.vy / speedE) * 620;
        }
      } else if (line.mechanicType === "ramp") {
        var dx = line.x2 - line.x1;
        var dy = line.y2 - line.y1;
        var len = Math.hypot(dx, dy) || 1;
        var tx = dx / len;
        var ty = dy / len;
        var along = ball.vx * tx + ball.vy * ty;
        var inSpeed = Math.hypot(ball.vx, ball.vy);
        var outSpeed = Math.max(inSpeed * 0.9, 80);
        var sign = along >= 0 ? 1 : -1;
        ball.vx = tx * sign * outSpeed;
        ball.vy = ty * sign * outSpeed;
      } else {
        physics.reflectVelocity(ball, normal.x, normal.y, 0.92);
      }

      if (!line.sourceType && line.life > 0) {
        line.life -= 1;
      }

      if (collision.canTriggerSound) {
        state.collisionMemory.set(collision.key, now);
        markCollisionTarget(line, now);

        soundSources.push({
          ball: ball,
          line: line,
        });
      }
    });

    state.lines = state.lines.filter((line) => line.life !== 0);

    pruneMemory(state, now);

    return soundSources;
  }

  function pruneMemory(state, now) {
    state.collisionMemory.forEach((timestamp, key) => {
      if (now - timestamp > 1200) {
        state.collisionMemory.delete(key);
      }
    });
  }

  function markCollisionTarget(line, now) {
    if (line.sourceType === "text" && SBE.TextSystem) {
      SBE.TextSystem.markHit(
        line.sourceTextObject,
        line.sourceLetterIndex,
        now,
      );
      return;
    }

    line.lastHitAt = now;
  }

  SBE.Collision = {
    detectCollisions,
    resolveCollisions,
  };
})(window);
