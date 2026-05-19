(function initTrafficFlowField(global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  // ── Traffic Flow Field (TrafficFlowField v1.0.0) ───────────────────────────
  //
  // Lightweight collective behavior for realized ecology vehicles.
  // Operates ONLY on realized walker objects — never touches abstract vehicles.
  //
  // Per-frame steering influences (gentle biases — routes still dominate):
  //   Alignment   — softly align heading with nearby traffic flow
  //   Cohesion    — drift toward local centroid (stream formation)
  //   Separation  — prevent over-collapse at same position
  //   Congestion  — high local density reduces velocity magnitude
  //
  // Pressure (0–1) accumulates from neighbor density and drives:
  //   • rendering glow / route thickness
  //   • music ecology energy contribution
  //   • future event / personality triggers

  // ── Config accessor ────────────────────────────────────────────────────────
  function _cfg(state) {
    return (state.world && state.world.flow) || _DEFAULTS;
  }

  var _DEFAULTS = {
    enabled:            true,
    influenceRadius:    120,
    congestionRadius:   80,
    alignmentStrength:  0.015,
    cohesionStrength:   0.010,
    separationStrength: 0.025,
    congestionSlowdown: 0.65,
    maxNeighbors:       8,
    debugDraw:          false,
    metrics: { activeClusters: 0, avgPressure: 0, maxPressure: 0 },
  };

  // ── Collect realized walker objects ───────────────────────────────────────
  function _collectWalkers(state) {
    var entities = state.world && state.world.realizedEntities;
    if (!entities || !entities.size) return [];
    var walkers  = state.projectileWalkers || [];
    var out      = [];
    entities.forEach(function (entry) {
      var w = walkers.find(function (w) { return w.id === entry.walkerId; });
      if (w) out.push(w);
    });
    return out;
  }

  // ── Ensure flow runtime block on walker ───────────────────────────────────
  function _ensureFlow(walker) {
    if (!walker.flow) {
      walker.flow = {
        pressure:     0,
        localDensity: 0,
        alignmentX:   0,
        alignmentY:   0,
        clusterId:    -1,
      };
    }
    return walker.flow;
  }

  // ── Main tick ──────────────────────────────────────────────────────────────
  // Called every frame after LocalRealization.tick().
  // dt in seconds (real elapsed time).
  function tick(state, dt) {
    var cfg = _cfg(state);
    if (!cfg.enabled) return;

    var walkers = _collectWalkers(state);
    if (walkers.length < 2) {
      // Clear pressure on lone walker
      walkers.forEach(function (w) { _ensureFlow(w).pressure = 0; });
      _updateMetrics(state, cfg, walkers);
      return;
    }

    var influenceR   = cfg.influenceRadius    || 120;
    var congestionR  = cfg.congestionRadius   || 80;
    var alignStr     = cfg.alignmentStrength  || 0.015;
    var cohesionStr  = cfg.cohesionStrength   || 0.010;
    var sepStr       = cfg.separationStrength || 0.025;
    var slowdown     = cfg.congestionSlowdown || 0.65;
    var maxN         = cfg.maxNeighbors       || 8;
    var influenceR2  = influenceR  * influenceR;
    var congestionR2 = congestionR * congestionR;

    // ── Step 1: Neighbor sampling + influence accumulation ────────────────────
    for (var i = 0; i < walkers.length; i++) {
      var wi  = walkers[i];
      var phi = wi.physics || {};
      var fi  = _ensureFlow(wi);

      // Accumulators
      var alignX = 0, alignY = 0;       // alignment: average heading of neighbors
      var cenX   = 0, cenY   = 0;       // cohesion: centroid of neighbors
      var sepX   = 0, sepY   = 0;       // separation: push from too-close neighbors
      var neighborCount  = 0;
      var congestionCount = 0;

      for (var j = 0; j < walkers.length; j++) {
        if (i === j) continue;
        var wj  = walkers[j];
        var dx  = wj.x - wi.x;
        var dy  = wj.y - wi.y;
        var d2  = dx * dx + dy * dy;

        if (d2 > influenceR2) continue;
        if (neighborCount >= maxN) break;

        // Alignment: accumulate neighbor velocity
        var phj = wj.physics || {};
        alignX += phj.vx || 0;
        alignY += phj.vy || 0;

        // Cohesion: accumulate positions
        cenX += wj.x;
        cenY += wj.y;

        neighborCount++;

        // Separation: repel from very close neighbors
        if (d2 < congestionR2 && d2 > 0) {
          var dist = Math.sqrt(d2);
          var force = (congestionR - dist) / congestionR;
          sepX -= (dx / dist) * force;
          sepY -= (dy / dist) * force;
          congestionCount++;
        }
      }

      // ── Step 2: Apply influences ──────────────────────────────────────────
      if (neighborCount > 0) {
        // Alignment — steer toward average neighbor heading
        var avgAlignX = alignX / neighborCount;
        var avgAlignY = alignY / neighborCount;
        phi.vx = (phi.vx || 0) + avgAlignX * alignStr * dt * 60;
        phi.vy = (phi.vy || 0) + avgAlignY * alignStr * dt * 60;

        // Cohesion — steer toward centroid
        var cDx = (cenX / neighborCount) - wi.x;
        var cDy = (cenY / neighborCount) - wi.y;
        phi.vx += cDx * cohesionStr * dt * 60;
        phi.vy += cDy * cohesionStr * dt * 60;

        // Separation — push away from over-dense neighbors
        if (congestionCount > 0) {
          phi.vx += sepX * sepStr * dt * 60;
          phi.vy += sepY * sepStr * dt * 60;
        }

        // Congestion slowdown — high density compresses speed
        var pressure = Math.min(1, neighborCount / maxN);
        if (pressure > 0.4) {
          var speedFactor = 1 - (pressure - 0.4) * (1 - slowdown) / 0.6;
          var curSpd = Math.hypot(phi.vx || 0, phi.vy || 0);
          if (curSpd > 0) {
            var targetSpd = curSpd * speedFactor;
            var ratio     = targetSpd / curSpd;
            phi.vx *= ratio;
            phi.vy *= ratio;
          }
        }

        // Clamp to walker maxSpeed
        var maxSpd = phi.maxSpeed || 400;
        var spd    = Math.hypot(phi.vx || 0, phi.vy || 0);
        if (spd > maxSpd) {
          phi.vx = (phi.vx / spd) * maxSpd;
          phi.vy = (phi.vy / spd) * maxSpd;
        }

        // Write flow runtime state
        fi.localDensity = neighborCount;
        fi.pressure     = Math.min(1, neighborCount / maxN);
        fi.alignmentX   = avgAlignX;
        fi.alignmentY   = avgAlignY;
      } else {
        // Isolated — no influence
        fi.localDensity = 0;
        fi.pressure     = 0;
        fi.alignmentX   = 0;
        fi.alignmentY   = 0;
      }
    }

    // ── Step 3: Cluster labeling (simple connected-component pass) ────────────
    // O(n) greedy labeling — walkers in same dense group share a cluster id.
    _labelClusters(walkers, congestionR2);

    // ── Step 4: Update aggregate metrics ─────────────────────────────────────
    _updateMetrics(state, cfg, walkers);

    // ── Step 5: Contribute to music ecology ───────────────────────────────────
    _contributeMusicEcology(state, cfg);
  }

  // ── Greedy cluster labeling ────────────────────────────────────────────────
  // Simple O(n²) pass — fine under 120 realized entities.
  function _labelClusters(walkers, clusterR2) {
    var nextId = 0;
    for (var i = 0; i < walkers.length; i++) {
      _ensureFlow(walkers[i]).clusterId = -1;
    }
    for (var i = 0; i < walkers.length; i++) {
      var fi = _ensureFlow(walkers[i]);
      if (fi.clusterId !== -1) continue;
      fi.clusterId = nextId;
      // Flood-fill neighbors into same cluster
      for (var j = i + 1; j < walkers.length; j++) {
        var fj = _ensureFlow(walkers[j]);
        if (fj.clusterId !== -1) continue;
        var dx = walkers[j].x - walkers[i].x;
        var dy = walkers[j].y - walkers[i].y;
        if (dx * dx + dy * dy <= clusterR2) {
          fj.clusterId = nextId;
        }
      }
      nextId++;
    }
  }

  // ── Aggregate metrics ──────────────────────────────────────────────────────
  function _updateMetrics(state, cfg, walkers) {
    if (!state.world || !state.world.flow) return;
    var metrics = state.world.flow.metrics;
    if (!metrics) return;

    if (!walkers.length) {
      metrics.activeClusters = 0;
      metrics.avgPressure    = 0;
      metrics.maxPressure    = 0;
      return;
    }

    var sumP   = 0;
    var maxP   = 0;
    var clusterSet = {};
    walkers.forEach(function (w) {
      var f = w.flow;
      if (!f) return;
      sumP += f.pressure;
      if (f.pressure > maxP) maxP = f.pressure;
      if (f.clusterId >= 0) clusterSet[f.clusterId] = true;
    });

    metrics.avgPressure    = walkers.length ? sumP / walkers.length : 0;
    metrics.maxPressure    = maxP;
    metrics.activeClusters = Object.keys(clusterSet).length;
  }

  // ── Music ecology contribution ─────────────────────────────────────────────
  // Flow pressure and cluster activity bias the ecology energy signal.
  // Blended gently so ecology remains smooth.
  function _contributeMusicEcology(state, cfg) {
    var eco = state.world && state.world.ecology;
    if (!eco || !eco.musicEcology || !eco.musicEcology.enabled) return;

    var metrics = state.world.flow && state.world.flow.metrics;
    if (!metrics) return;

    // Write flow energy into ecology output so MusicEcology.tick() picks it up
    // via the district pressure path on next abstract tick.
    // (We write a hint field; musicEcology reads it if present.)
    eco.musicEcology._flowEnergy   = metrics.avgPressure;
    eco.musicEcology._flowClusters = metrics.activeClusters;
  }

  // ── Query helpers ──────────────────────────────────────────────────────────
  // Returns the current aggregate flow metrics.
  function getMetrics(state) {
    return (state.world && state.world.flow && state.world.flow.metrics) || {
      activeClusters: 0,
      avgPressure:    0,
      maxPressure:    0,
    };
  }

  // Returns pressure for a specific realized walker (by walkerId).
  function getWalkerPressure(state, walkerId) {
    var walker = (state.projectileWalkers || []).find(function (w) {
      return w.id === walkerId;
    });
    return walker && walker.flow ? walker.flow.pressure : 0;
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  SBE.TrafficFlowField = {
    tick:               tick,
    getMetrics:         getMetrics,
    getWalkerPressure:  getWalkerPressure,
  };

})(window);
