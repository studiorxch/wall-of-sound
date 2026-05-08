(function initMaterialSystem(global) {
  var SBE = (global.SBE = global.SBE || {});

  var DEFAULTS = {
    rigid: {
      type: "rigid",
      waveEnergy: 0,
      wavePhase: 0,
      oscillationAmplitude: 18,
      oscillationFrequency: 3.5,
      propagationDecay: 0.97,
      angle: 0,
      angularVelocity: 0,
      gravityInfluence: 0,
      damping: 0.98,
      tension: 0,
      recoilPhase: 0,
      elasticity: 0,
      elasticDamping: 0.9,
    },
    oscillating: {
      type: "oscillating",
      waveEnergy: 0,
      wavePhase: 0,
      oscillationAmplitude: 52,   // exaggerated for visual verification
      oscillationFrequency: 3.2,
      propagationDecay: 0.992,    // slow decay — stays visible longer
      angle: 0,
      angularVelocity: 0,
      gravityInfluence: 0,
      damping: 0.98,
      tension: 0,
      recoilPhase: 0,
      elasticity: 0,
      elasticDamping: 0.9,
    },
    pendulum: {
      type: "pendulum",
      waveEnergy: 0,
      wavePhase: 0,
      oscillationAmplitude: 0,
      oscillationFrequency: 0,
      propagationDecay: 0.98,
      angle: 0,
      angularVelocity: 0,
      gravityInfluence: 0.75,     // stronger gravity swing
      damping: 0.997,             // very slow damping — swings a long time
      tension: 0,
      recoilPhase: 0,
      elasticity: 0,
      elasticDamping: 0.9,
    },
    elastic: {
      type: "elastic",
      waveEnergy: 0,
      wavePhase: 0,
      oscillationAmplitude: 0,
      oscillationFrequency: 0,
      propagationDecay: 0.98,
      angle: 0,
      angularVelocity: 0,
      gravityInfluence: 0,
      damping: 0.98,
      tension: 0,
      recoilPhase: 0,
      elasticity: 0.6,
      elasticDamping: 0.91,       // slower decay — recoil stays visible
    },
  };

  function hydrateMaterial(line) {
    if (line.material && typeof line.material === "object") {
      var type = line.material.type || "rigid";
      var base = DEFAULTS[type] || DEFAULTS.rigid;
      line.material = Object.assign({}, base, line.material);
    } else {
      line.material = Object.assign({}, DEFAULTS.rigid);
    }
    return line;
  }

  function setMaterialType(line, type) {
    var base = DEFAULTS[type] || DEFAULTS.rigid;
    var reset = {
      waveEnergy: 0,
      wavePhase: 0,
      angle: 0,
      angularVelocity: 0,
      tension: 0,
      recoilPhase: 0,
    };
    // Give pendulums an immediate kick so the swing is visible right away
    if (type === "pendulum") {
      reset.angle = 0.22;
      reset.angularVelocity = 0.4;
    }
    line.material = Object.assign({}, base, reset);
  }

  function updateAll(lines, dt) {
    if (!lines || !lines.length) return;
    lines.forEach(function (line) {
      if (!line.material || line._isDerived) return;
      var m = line.material;
      switch (m.type) {
        case "oscillating":
          updateOscillating(m, dt);
          break;
        case "pendulum":
          updatePendulum(line, m, dt);
          break;
        case "elastic":
          updateElastic(m, dt);
          break;
      }
    });
  }

  function updateOscillating(m, dt) {
    if (m.waveEnergy < 0.002) {
      m.waveEnergy = 0;
      return;
    }
    m.wavePhase += m.oscillationFrequency * dt * Math.PI * 2;
    m.waveEnergy *= Math.pow(m.propagationDecay, dt * 60);
  }

  function updatePendulum(line, m, dt) {
    var L = Math.hypot(line.x2 - line.x1, line.y2 - line.y1);
    if (L < 1) return;
    // g in canvas-space px/s²
    var g = 600 * m.gravityInfluence;
    var angularAccel = -(g / L) * Math.sin(m.angle);
    m.angularVelocity += angularAccel * dt;
    m.angularVelocity *= Math.pow(m.damping, dt * 60);
    m.angle += m.angularVelocity * dt;
    m.angle = Math.max(-Math.PI * 0.4, Math.min(Math.PI * 0.4, m.angle));

    // Idle drift toward rest
    if (Math.abs(m.angularVelocity) < 0.0005 && Math.abs(m.angle) > 0.001) {
      m.angle *= 0.995;
    }
  }

  function updateElastic(m, dt) {
    if (m.tension < 0.002 && m.recoilPhase < 0.002) {
      m.tension = 0;
      m.recoilPhase = 0;
      return;
    }
    m.tension *= Math.pow(m.elasticDamping, dt * 60);
    m.recoilPhase *= Math.pow(0.88, dt * 60);
  }

  function injectCollisionEnergy(line, collision) {
    if (!line.material || line.material.type === "rigid") return;
    var m = line.material;

    console.log("[MATERIAL HIT]", m.type, line.id);

    var speed = collision.ball
      ? Math.hypot(collision.ball.vx || 0, collision.ball.vy || 0)
      : 300;
    // Exaggerated injection — multiply by 4 for debug visibility
    var force = Math.max(0.4, Math.min(1.0, (speed / 200) * 4));

    switch (m.type) {
      case "oscillating": {
        m.waveEnergy = Math.min(1, m.waveEnergy + force * 0.75);
        // Set wave phase to start at collision impact point
        if (collision.closestPoint) {
          var dx = line.x2 - line.x1;
          var dy = line.y2 - line.y1;
          var L2 = Math.hypot(dx, dy) || 1;
          var t =
            ((collision.closestPoint.x - line.x1) * dx +
              (collision.closestPoint.y - line.y1) * dy) /
            (L2 * L2);
          m.wavePhase = t * Math.PI * 2 - Math.PI * 0.5;
        }
        break;
      }
      case "pendulum": {
        var kick = (Math.random() < 0.5 ? 1 : -1) * force * 2.2;
        m.angularVelocity += kick;
        break;
      }
      case "elastic": {
        m.tension = Math.min(1, m.tension + force * 0.65);
        m.recoilPhase = Math.min(1, m.recoilPhase + force * 0.85);
        break;
      }
    }
  }

  // Returns an array of {x,y} points for displaced line rendering.
  // Returns null when no active displacement (renderer falls back to straight line).
  function getDisplacementPoints(line, segCount) {
    var m = line.material;
    if (!m || m.type === "rigid") return null;

    var dx = line.x2 - line.x1;
    var dy = line.y2 - line.y1;
    var len = Math.hypot(dx, dy) || 1;

    // Perpendicular normal (left of direction)
    var nx = -dy / len;
    var ny = dx / len;

    if (m.type === "oscillating") {
      if (m.waveEnergy < 0.002) return null;
      var amplitude = m.oscillationAmplitude * m.waveEnergy;
      var pts = [];
      for (var i = 0; i <= segCount; i++) {
        var t = i / segCount;
        var bx = line.x1 + dx * t;
        var by = line.y1 + dy * t;
        // Two harmonics for richer wave shape
        var wave =
          Math.sin(t * Math.PI * 2 * 1.5 + m.wavePhase) +
          0.35 * Math.sin(t * Math.PI * 2 * 3.2 + m.wavePhase * 1.6);
        wave /= 1.35;
        // Envelope: fade at endpoints for anchored feel
        var envelope = Math.sin(t * Math.PI);
        pts.push({
          x: bx + nx * wave * amplitude * envelope,
          y: by + ny * wave * amplitude * envelope,
        });
      }
      return pts;
    }

    if (m.type === "pendulum") {
      if (Math.abs(m.angle) < 0.001 && Math.abs(m.angularVelocity) < 0.001)
        return null;
      var restAngle = Math.atan2(dy, dx);
      var displayAngle = restAngle + m.angle;
      var rx2 = line.x1 + Math.cos(displayAngle) * len;
      var ry2 = line.y1 + Math.sin(displayAngle) * len;

      // Catenary-ish sag via quadratic bezier
      var sagAmount = Math.abs(Math.sin(m.angle)) * 0.28;
      var midX = (line.x1 + rx2) * 0.5;
      var midY = (line.y1 + ry2) * 0.5 + len * sagAmount;

      var ppts = [];
      for (var j = 0; j <= segCount; j++) {
        var s = j / segCount;
        var om = 1 - s;
        ppts.push({
          x: om * om * line.x1 + 2 * om * s * midX + s * s * rx2,
          y: om * om * line.y1 + 2 * om * s * midY + s * s * ry2,
        });
      }
      return ppts;
    }

    if (m.type === "elastic") {
      if (m.recoilPhase < 0.002) return null;
      var bowAmp = m.tension * 44 * Math.sin(m.recoilPhase * Math.PI);
      var epts = [];
      for (var k = 0; k <= segCount; k++) {
        var u = k / segCount;
        epts.push({
          x: line.x1 + dx * u + nx * Math.sin(u * Math.PI) * bowAmp,
          y: line.y1 + dy * u + ny * Math.sin(u * Math.PI) * bowAmp,
        });
      }
      return epts;
    }

    return null;
  }

  SBE.MaterialSystem = {
    DEFAULTS: DEFAULTS,
    hydrateMaterial: hydrateMaterial,
    setMaterialType: setMaterialType,
    updateAll: updateAll,
    injectCollisionEnergy: injectCollisionEnergy,
    getDisplacementPoints: getDisplacementPoints,
  };
})(window);
