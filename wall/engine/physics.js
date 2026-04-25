(function initPhysics(global) {
  const SBE = global.SBE = global.SBE || {};

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function length(x, y) {
    return Math.hypot(x, y);
  }

  function normalize(x, y) {
    const magnitude = length(x, y) || 1;
    return { x: x / magnitude, y: y / magnitude };
  }

  function rotate(x, y, radians) {
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    return {
      x: x * cosine - y * sine,
      y: x * sine + y * cosine
    };
  }

  function applyForces(balls, lines, config, dt) {
    const randomness = config.randomness * 18;
    const lineSystem = SBE.LineSystem;

    balls.forEach((ball) => {
      let fx = 0;
      let fy = 0;

      lines.forEach((line) => {
        const force = lineSystem.calculateBehaviorForce(ball, line);
        fx += force.x;
        fy += force.y;
      });

      fx += (Math.random() - 0.5) * randomness;
      fy += (Math.random() - 0.5) * randomness;

      ball.vx += fx * dt;
      ball.vy += fy * dt;

      const speed = length(ball.vx, ball.vy);
      const minSpeed = 40 * config.speed;
      const maxSpeed = 620 * config.speed;

      if (speed > maxSpeed) {
        const direction = normalize(ball.vx, ball.vy);
        ball.vx = direction.x * maxSpeed;
        ball.vy = direction.y * maxSpeed;
      } else if (speed < minSpeed) {
        const direction = normalize(ball.vx || 1, ball.vy || 0);
        ball.vx = direction.x * minSpeed;
        ball.vy = direction.y * minSpeed;
      }

      ball.energy = clamp(speed / maxSpeed, 0, 1);
    });
  }

  function updateSwarm(balls, dt) {
    balls.forEach((ball) => {
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
    });
  }

  function resolveWallBounce(ball, bounds) {
    let collided = false;
    let normalX = 0;
    let normalY = 0;

    if (ball.x - ball.radius <= 0) {
      ball.x = ball.radius;
      normalX = 1;
      collided = true;
    } else if (ball.x + ball.radius >= bounds.width) {
      ball.x = bounds.width - ball.radius;
      normalX = -1;
      collided = true;
    }

    if (ball.y - ball.radius <= 0) {
      ball.y = ball.radius;
      normalY = 1;
      collided = true;
    } else if (ball.y + ball.radius >= bounds.height) {
      ball.y = bounds.height - ball.radius;
      normalY = -1;
      collided = true;
    }

    if (!collided) {
      return null;
    }

    const normal = normalize(normalX, normalY);
    reflectVelocity(ball, normal.x, normal.y, 0.94);

    return {
      type: "wall",
      ballId: ball.id,
      velocity: length(ball.vx, ball.vy),
      normalX: normal.x,
      normalY: normal.y
    };
  }

  function reflectVelocity(ball, normalX, normalY, elasticity) {
    const dot = ball.vx * normalX + ball.vy * normalY;
    ball.vx = (ball.vx - 2 * dot * normalX) * elasticity;
    ball.vy = (ball.vy - 2 * dot * normalY) * elasticity;

    const wobble = rotate(ball.vx, ball.vy, (Math.random() - 0.5) * 0.18);
    ball.vx = wobble.x;
    ball.vy = wobble.y;
  }

  SBE.EnginePhysics = {
    applyForces,
    clamp,
    length,
    normalize,
    reflectVelocity,
    resolveWallBounce,
    rotate,
    updateSwarm
  };
})(window);
