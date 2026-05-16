(function initCollision(global) {
  const SBE = (global.SBE = global.SBE || {});

  // ── Projectile walkers — world-space collision (ProjectileWalkerMigration v1.0.0) ──
  function _getProjectileBalls(state) {
    var pw = state.projectileWalkers;
    if (!pw || !pw.length) return [];
    return pw.map(function (w) {
      var ph = w.physics || {};
      return {
        id: w.id,
        _walkerRef: w,
        x: w.x,
        y: w.y,
        vx: ph.vx || 0,
        vy: ph.vy || 0,
        radius: ph.collisionRadius || 8,
        collisionRadius: ph.collisionRadius || 8,
        renderRadius: (ph.collisionRadius || 8) * 1.5,
        energy: 1,
        spawnTime: w._spawnTime || 0,
        collisionDelay: 0,
        _isProjectileWalker: true,
        _dead: false,
      };
    });
  }

  // ── Avatar colliders — lightweight circle collision for walker avatars ──────
  // Returns synthetic line segments tangent to each avatar's collider circle,
  // approximated as 4 short axial segments so the existing line-vs-ball resolver
  // handles them without modification.  Only walkers with avatar.collider.enabled
  // and avatar.enabled participate.
  function getAvatarCollisionSegments(walkers) {
    if (!walkers || !walkers.length) return [];
    var segs = [];
    walkers.forEach(function(w) {
      // Avatar collision is automatic when avatar.enabled — no separate collider.enabled needed.
      // The avatar IS the physical body; inspector controls radius/offset only.
      if (!w.avatar || !w.avatar.enabled) return;
      var col = w.avatar.collider;
      // Scale-aware radius: explicit inspector value × scale, or 20 × scale as default
      var _scale = (w.avatar.scale || 1);
      var r = (col && col.radius) ? col.radius * _scale : 20 * _scale;
      var cx = w.x + (col.offsetX || 0);
      var cy = w.y + (col.offsetY || 0);
      // Four cardinal tangent segments — approximates a circle for reflection purposes
      var half = r * 0.92; // slightly inside the true circle for stable depenetration
      var seg = function(x1, y1, x2, y2) {
        return {
          id:              "av-" + w.id + "-" + x1 + "-" + y1,
          x1: x1, y1: y1, x2: x2, y2: y2,
          thickness:       r * 0.5,
          life:            9999,
          sourceType:      "avatar",
          _avatarWalkerId: w.id,
          _avatarRef:      w,
          // Prevent collision memory from muting audio indefinitely per unique key
          collisionGroupId: "av-" + w.id,
          behavior: { type: "normal", strength: 1 },
          style:    { color: w.color || "#3dd8c5", thickness: 1 },
          color:    w.color || "#3dd8c5",
          midi: { note: 60, channel: 1 },
          interaction: { highlightColor: "#ffffff", duration: 100 },
        };
      };
      // Top, Bottom, Left, Right tangents
      segs.push(seg(cx - half, cy - r, cx + half, cy - r));
      segs.push(seg(cx - half, cy + r, cx + half, cy + r));
      segs.push(seg(cx - r, cy - half, cx - r, cy + half));
      segs.push(seg(cx + r, cy - half, cx + r, cy + half));
    });
    return segs;
  }

  function detectCollisions(state, now) {
    const collisions = [];
    const lineSystem = SBE.LineSystem;
    const physics = SBE.EnginePhysics;
    // Gather all walkers (path walkers + projectile walkers) for avatar collision
    var allWalkers = (state.walkers || []).concat(state.projectileWalkers || []);
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
      )
      .concat(getAvatarCollisionSegments(allWalkers));

    // Legacy balls (canvas-px space) + projectile walkers (world space)
    const allCollidables = state.balls.concat(_getProjectileBalls(state));

    allCollidables.forEach((ball) => {
      const lineCollisions = new Map();

      // ── Wall bounce — CANVAS-SPACE ONLY ────────────────────────────────────
      // resolveWallBounce uses state.canvas pixel dimensions (0 → width/height).
      // Projectile walkers live in WORLD SPACE (origin at screen center, negative
      // coords valid on left/upper half).  Feeding world coords into a canvas-px
      // bounds check corrupts the proxy position BEFORE line detection runs,
      // causing the entire frame's line collision to use the wrong position
      // (the "lower-right quadrant" bug, teleportation, mirrored bounces).
      //
      // World-space entities get their out-of-bounds culling from tick() instead.
      if (!ball._isProjectileWalker) {
        const wallCollision = physics.resolveWallBounce(ball, state.canvas);
        if (wallCollision) {
          collisions.push(wallCollision);
        }
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

      // Self-collision guard — projectile walker must not collide with its own avatar
      if (line._avatarWalkerId && ball._walkerRef &&
          line._avatarWalkerId === ball._walkerRef.id) {
        return;
      }
      // Path walkers (proxy) must not collide with their own avatar either
      if (line._avatarWalkerId && ball.id === line._avatarWalkerId) {
        return;
      }

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

      // Write velocity back to walker.physics for projectile walkers
      if (ball._isProjectileWalker && ball._walkerRef) {
        var _wref = ball._walkerRef;
        var _wph = _wref.physics || (_wref.physics = {});
        _wph.vx = ball.vx;
        _wph.vy = ball.vy;
        // Also update world position (depenetration was applied to ball proxy)
        _wref.x = ball.x;
        _wref.y = ball.y;
      }

      if (collision.canTriggerSound) {
        state.collisionMemory.set(collision.key, now);
        markCollisionTarget(line, now);

        soundSources.push({
          ball: ball,
          line: line,
          // closestPoint passed in world-space for event position accuracy
          closestPoint: collision.closestPoint,
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
