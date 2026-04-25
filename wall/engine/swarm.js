(function initSwarm(global) {
  const SBE = global.SBE = global.SBE || {};
  let ballId = 0;

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function createBall(bounds, config, centerBias) {
    const angle = Math.random() * Math.PI * 2;
    const speed = randomBetween(90, 220) * config.speed;
    const widthSpan = centerBias ? bounds.width * 0.25 : bounds.width * 0.8;
    const heightSpan = centerBias ? bounds.height * 0.18 : bounds.height * 0.8;

    const collisionRadius = config.collisionRadius || config.radius || 6;
    const renderRadius = config.renderRadius || collisionRadius * 2.3;

    return {
      id: "ball-" + (++ballId),
      x: bounds.width * 0.5 + randomBetween(-widthSpan, widthSpan) * 0.5,
      y: bounds.height * 0.5 + randomBetween(-heightSpan, heightSpan) * 0.5,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: collisionRadius,
      collisionRadius,
      renderRadius,
      style: config.ballStyle || "core",
      energy: 1
    };
  }

  function syncSwarmCount(state, centerBias) {
    const target = state.swarm.count;
    const current = state.balls.length;
    const bounds = state.canvas;

    if (current < target) {
      for (let index = current; index < target; index += 1) {
        state.balls.push(createBall(bounds, state.swarm, centerBias));
      }
    } else if (current > target) {
      state.balls.length = target;
    }

    state.balls.forEach((ball) => {
      const collisionRadius = state.swarm.collisionRadius || state.swarm.radius || 6;
      ball.radius = collisionRadius;
      ball.collisionRadius = collisionRadius;
      ball.renderRadius = state.swarm.renderRadius || collisionRadius * 2.3;
      ball.style = state.swarm.ballStyle || "core";
    });
  }

  function reseedSwarm(state, centerBias) {
    state.balls = [];
    syncSwarmCount(state, centerBias);
  }

  function burstSwarm(state) {
    const physics = SBE.EnginePhysics;

    state.balls.forEach((ball) => {
      const direction = physics.normalize(ball.x - state.canvas.width * 0.5, ball.y - state.canvas.height * 0.5);
      const boost = randomBetween(80, 220);
      ball.vx += direction.x * boost;
      ball.vy += direction.y * boost;
    });
  }

  function spawnBall(bounds, config, startPoint, endPoint) {
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const magnitude = Math.hypot(dx, dy) || 1;
    const speed = Math.min(420, Math.max(60, magnitude * 3));

    const collisionRadius = config.collisionRadius || config.radius || 6;
    const renderRadius = config.renderRadius || collisionRadius * 2.3;

    return {
      id: "ball-" + (++ballId),
      x: startPoint.x,
      y: startPoint.y,
      vx: (dx / magnitude) * speed,
      vy: (dy / magnitude) * speed,
      radius: collisionRadius,
      collisionRadius,
      renderRadius,
      style: config.ballStyle || "core",
      energy: 1,
    };
  }

  SBE.Swarm = {
    burstSwarm,
    createBall,
    reseedSwarm,
    spawnBall,
    syncSwarmCount
  };
})(window);
