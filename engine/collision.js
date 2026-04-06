(function initCollision(global) {
  const SBE = (global.SBE = global.SBE || {});

  function detectCollisions(state, now) {
    const collisions = [];
    const lineSystem = SBE.LineSystem;
    const physics = SBE.EnginePhysics;
    const activeLines = state.lines.concat(
      SBE.TextSystem ? SBE.TextSystem.getCollisionLines(state.textObjects || []) : [],
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
          canTriggerMidi: now - previous > 72,
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
    const midiEvents = [];

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
      physics.reflectVelocity(ball, normal.x, normal.y, 0.92);

      if (!line.sourceType && line.life > 0) {
        line.life -= 1;
      }

      if (collision.canTriggerMidi) {
        state.collisionMemory.set(collision.key, now);
        markCollisionTarget(line, now);

        midiEvents.push({
          ballId: ball.id,
          lineId: line.id,
          channel: line.midiChannel,
          note: line.note,
          velocity: mapVelocity(ball, line),
          speed: Math.hypot(ball.vx, ball.vy),
        });
      }
    });

    state.lines = state.lines.filter((line) => line.life !== 0);

    pruneMemory(state, now);

    return midiEvents;
  }

  function mapVelocity(ball, line) {
    const min = Math.min(line.velocityRange[0], line.velocityRange[1]);
    const max = Math.max(line.velocityRange[0], line.velocityRange[1]);
    const speed = Math.hypot(ball.vx, ball.vy);
    const normalized = Math.min(1, speed / 460);
    return Math.max(
      1,
      Math.min(127, Math.round(min + (max - min) * normalized)),
    );
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
