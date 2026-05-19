(function initStageLightingRenderer(global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  // ── Stage Lighting + Spatial Ecology Density (v2.0.0) ────────────────────────
  //
  // The complete world-atmosphere renderer.
  // Transforms WOS into a living nighttime urban organism.
  //
  // Draw order (all world-space):
  //   1.  Depth haze            — edge vignette, distance atmosphere
  //   2.  Contrast floor        — ambient lift, prevents pure-black void
  //   3.  District mass fields  — 3-layer organic city bodies (outer/mid/inner)
  //   4.  Secondary corridors   — peripheral movement structure, connective tissue
  //   5.  Corridor glow         — dual-layer route spine (atmospheric + core)
  //   6.  Traffic traces        — animated flow streaks along routes
  //   7.  Drift particles       — ambient micro-motion near districts
  //   8.  Event presence wash   — regional social contagion from cluster events
  //   9.  Event breathing       — near-field atmospheric pulse per event
  //  10.  Activity flicker      — organic brightness animation in hot zones

  // ── Module-level animation state ─────────────────────────────────────────────
  var _lastNow    = 0;
  var _traces     = null;    // traffic trace pool (lazy-init)
  var _drifts     = null;    // drift particle pool (lazy-init)

  // ── Phase tint palette ────────────────────────────────────────────────────────
  var PHASE_TINTS = {
    dawn:     { r:  80, g: 120, b: 200 },
    day:      { r: 155, g: 150, b: 175 },
    dusk:     { r: 200, g:  95, b:  75 },
    night:    { r:  55, g:  28, b: 138 },
    lateNight:{ r:  42, g:  18, b:  95 },
  };

  function _tint(phase, a) {
    var c = PHASE_TINTS[phase] || PHASE_TINTS.night;
    return "rgba(" + c.r + "," + c.g + "," + c.b + "," + a + ")";
  }

  // Event type color
  var _EV_COLORS = {
    rooftop:           { r: 220, g:  80, b: 200 },
    vendor:            { r: 255, g: 200, b:  60 },
    transitDelay:      { r: 255, g: 130, b:  40 },
    rainShelter:       { r: 100, g: 180, b: 255 },
    streetPerformance: { r: 120, g: 255, b: 160 },
    nightlifeSpill:    { r: 160, g:  80, b: 255 },
  };
  function _evCol(type, a) {
    var c = _EV_COLORS[type] || { r: 200, g: 200, b: 200 };
    return "rgba(" + c.r + "," + c.g + "," + c.b + "," + a + ")";
  }

  // ── Route world-space position at parameter t (0–1) ──────────────────────────
  function _routePos(wps, t) {
    var n   = wps.length - 1;
    var st  = Math.max(0, Math.min(0.9999, t)) * n;
    var idx = Math.floor(st);
    var f   = st - idx;
    var p0  = wps[idx], p1 = wps[Math.min(idx + 1, n)];
    return {
      x:  p0.x + (p1.x - p0.x) * f,
      y:  p0.y + (p1.y - p0.y) * f,
      dx: p1.x - p0.x,
      dy: p1.y - p0.y,
    };
  }

  // ── Main entry ────────────────────────────────────────────────────────────────
  function render(ctx, state, now) {
    var DP = global.SBE && SBE.DistrictPressure;
    if (!DP) return;

    var cam    = state.camera || { x: 0, y: 0, zoom: 1 };
    var zoom   = cam.zoom || 1;
    var rhythm = state.world && state.world.rhythm;
    var phase  = (rhythm && rhythm.phase) || "night";
    var eco    = state.world && state.world.ecology;
    var evCfg  = state.world && state.world.clusterEvents;
    var events = (evCfg && evCfg.events) || [];
    var t      = now * 0.001;

    var dt = _lastNow ? Math.min((now - _lastNow) / 1000, 0.05) : 0.016;
    _lastNow = now;

    ctx.save();

    // ── 1. Depth haze — edge vignette ────────────────────────────────────────
    _drawDepthHaze(ctx, cam, phase, t, zoom);

    // ── 2. Contrast floor ────────────────────────────────────────────────────
    _drawContrastFloor(ctx, cam, phase, t, zoom);

    // ── 3. District mass fields (3-layer) ────────────────────────────────────
    _drawDistrictMassFields(ctx, DP, eco, events, phase, t);

    // ── 4. Secondary corridors ───────────────────────────────────────────────
    _drawSecondaryCorridors(ctx, eco, events, phase, t);

    // ── 5. Corridor glow (dual-layer spine) ──────────────────────────────────
    _drawCorridorGlow(ctx, eco, events, phase, t);

    // ── 6. Traffic traces ────────────────────────────────────────────────────
    _drawTrafficTraces(ctx, eco, events, phase, t, dt);

    // ── 7. Drift particles ───────────────────────────────────────────────────
    _drawDriftParticles(ctx, DP, eco, cam, phase, t, dt);

    // ── 8. Event presence wash (regional) ────────────────────────────────────
    _drawEventPresenceWash(ctx, events, phase, t);

    // ── 9. Event breathing (near-field) ──────────────────────────────────────
    _drawEventBreathing(ctx, events, t);

    // ── 10. Activity flicker ─────────────────────────────────────────────────
    _drawActivityFlicker(ctx, DP, eco, phase, t);

    ctx.restore();
  }

  // ── 1. Depth haze ─────────────────────────────────────────────────────────────
  // Edge vignette that frames the view — denser toward the periphery.
  // Creates depth continuity and prevents hard canvas edge cutoff.
  function _drawDepthHaze(ctx, cam, phase, t, zoom) {
    var innerR = 1400 / zoom;
    var outerR = 3600 / zoom;
    var pulse  = 0.5 + 0.5 * Math.sin(t * 0.04);   // ~2.5-min cycle

    var grad = ctx.createRadialGradient(cam.x, cam.y, innerR, cam.x, cam.y, outerR);
    grad.addColorStop(0,    _tint(phase, 0));
    grad.addColorStop(0.55, _tint(phase, 0.012 + pulse * 0.004));
    grad.addColorStop(1,    _tint(phase, 0.038 + pulse * 0.008));

    ctx.fillStyle   = grad;
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(cam.x, cam.y, outerR, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── 2. Contrast floor ─────────────────────────────────────────────────────────
  // Ambient lift — prevents pure-black void, creates atmospheric base.
  function _drawContrastFloor(ctx, cam, phase, t, zoom) {
    var pulse  = 0.5 + 0.5 * Math.sin(t * 0.07);
    var floorR = 3200 / zoom;

    var grad = ctx.createRadialGradient(cam.x, cam.y, 0, cam.x, cam.y, floorR);
    var a0   = 0.028 + pulse * 0.008;
    grad.addColorStop(0,    _tint(phase, a0));
    grad.addColorStop(0.45, _tint(phase, a0 * 0.5));
    grad.addColorStop(1,    _tint(phase, 0));

    ctx.fillStyle   = grad;
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(cam.x, cam.y, floorR, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── 3. District mass fields ───────────────────────────────────────────────────
  // Three concentric atmospheric layers per district.
  // Outer: city-scale mass. Mid: regional activity. Inner: attention gravity.
  // Each layer drifts independently to break perfect symmetry.
  function _drawDistrictMassFields(ctx, DP, eco, events, phase, t) {
    // Event energy bonus per district
    var evBonus = {};
    events.forEach(function (ev) {
      if (ev.state === "dissolve" || ev.strength < 0.05) return;
      var b = evBonus[ev.districtId] || 0;
      evBonus[ev.districtId] = Math.min(1, b + ev.strength * 0.35);
    });

    Object.values(DP.DISTRICTS).forEach(function (d) {
      var dp      = eco && eco.pressure && eco.pressure.districts[d.id];
      var energy  = dp ? dp.energy    : 0.22;
      var nightl  = dp ? dp.nightlife : 0.18;
      var traffic = dp ? dp.traffic   : 0.18;
      var evB     = evBonus[d.id] || 0;

      // Independent drift offsets per district
      var driftX = Math.sin(t * 0.038 + d.x * 0.0014) * d.radius * 0.10;
      var driftY = Math.cos(t * 0.029 + d.y * 0.0017) * d.radius * 0.08;
      var cx     = d.x + driftX;
      var cy     = d.y + driftY;

      // ── Outer layer: city-scale atmospheric mass ──────────────────────────
      var outerPulse = 0.5 + 0.5 * Math.sin(t * 0.055 + d.x * 0.001);
      var outerR     = d.radius * (3.20 + outerPulse * 0.30);
      var outerAlpha = (energy * 0.018 + nightl * 0.012) * (0.9 + outerPulse * 0.1);
      outerAlpha     = Math.max(0.006, Math.min(0.028, outerAlpha));
      ctx.save();
      var g1 = ctx.createRadialGradient(cx, cy, outerR * 0.08, cx, cy, outerR);
      g1.addColorStop(0,    _tint(phase, outerAlpha * 0.5));
      g1.addColorStop(0.35, _tint(phase, outerAlpha));
      g1.addColorStop(0.72, _tint(phase, outerAlpha * 0.6));
      g1.addColorStop(1,    _tint(phase, 0));
      ctx.fillStyle = g1; ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(cx, cy, outerR, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      // ── Mid layer: regional activity field ───────────────────────────────
      var midPulse = 0.5 + 0.5 * Math.sin(t * 0.11 + d.y * 0.0013);
      var midR     = d.radius * (1.65 + midPulse * 0.20);
      var midAlpha = energy * 0.038 + nightl * 0.048 + traffic * 0.018 + evB * 0.022;
      midAlpha     = Math.max(0.012, Math.min(0.080, midAlpha));
      // Slight drift offset for asymmetry
      var mx = cx + Math.cos(t * 0.047 + d.x) * d.radius * 0.06;
      var my = cy + Math.sin(t * 0.033 + d.y) * d.radius * 0.05;
      ctx.save();
      var g2 = ctx.createRadialGradient(mx, my, midR * 0.06, mx, my, midR);
      g2.addColorStop(0,    _tint(phase, midAlpha * 0.6));
      g2.addColorStop(0.42, _tint(phase, midAlpha));
      g2.addColorStop(0.78, _tint(phase, midAlpha * 0.4));
      g2.addColorStop(1,    _tint(phase, 0));
      ctx.fillStyle = g2; ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(mx, my, midR, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      // ── Inner layer: localized density / attention gravity ────────────────
      var inPulse = 0.5 + 0.5 * Math.sin(t * 0.19 + d.x * 0.002);
      var inR     = d.radius * (0.72 + inPulse * 0.18 + evB * 0.25);
      var inAlpha = energy * 0.065 + nightl * 0.082 + evB * 0.055;
      inAlpha     = Math.max(0.018, Math.min(0.120, inAlpha));
      // Slight inner drift
      var ix = d.x + Math.sin(t * 0.081 + d.y * 0.002) * d.radius * 0.08;
      var iy = d.y + Math.cos(t * 0.067 + d.x * 0.002) * d.radius * 0.07;
      ctx.save();
      var g3 = ctx.createRadialGradient(ix, iy, 0, ix, iy, inR);
      g3.addColorStop(0,    _tint(phase, inAlpha * 1.2));
      g3.addColorStop(0.50, _tint(phase, inAlpha));
      g3.addColorStop(0.85, _tint(phase, inAlpha * 0.3));
      g3.addColorStop(1,    _tint(phase, 0));
      ctx.fillStyle = g3; ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(ix, iy, inR, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });
  }

  // ── 4. Secondary corridors ────────────────────────────────────────────────────
  // Perpendicular offsets of main routes create connective tissue feeling.
  // Very faint — implied circulation, not literal roads.
  function _drawSecondaryCorridors(ctx, eco, events, phase, t) {
    var TE = global.SBE && SBE.TrafficEcology;
    if (!TE || !TE.ROUTES) return;

    var routes = Object.values(TE.ROUTES);
    var pulse  = 0.5 + 0.5 * Math.sin(t * 0.14);

    // Event amplification on nearby routes
    function _routeEventBoost(route) {
      var boost = 0;
      events.forEach(function (ev) {
        if (ev.strength < 0.1) return;
        var mid = route.waypoints[Math.floor(route.waypoints.length / 2)];
        var d   = Math.hypot(mid.x - ev.x, mid.y - ev.y);
        if (d < 1200) boost += ev.strength * (1 - d / 1200) * 0.4;
      });
      return Math.min(0.6, boost);
    }

    routes.forEach(function (route) {
      var wps    = route.waypoints;
      if (!wps || wps.length < 2) return;
      var boost  = _routeEventBoost(route);
      var alpha  = 0.018 + boost * 0.024 + pulse * 0.006;

      // Draw two offset copies (one each side)
      [-90, 110].forEach(function (offsetDist) {
        ctx.save();
        ctx.strokeStyle = _tint(phase, alpha);
        ctx.lineWidth   = 4;
        ctx.lineCap     = "round";
        ctx.lineJoin    = "round";
        ctx.setLineDash([30, 60]);
        ctx.globalAlpha = 1;
        ctx.beginPath();

        for (var i = 0; i < wps.length; i++) {
          // Perpendicular normal at this point
          var i0 = Math.max(0, i - 1);
          var i1 = Math.min(wps.length - 1, i + 1);
          var ddx = wps[i1].x - wps[i0].x;
          var ddy = wps[i1].y - wps[i0].y;
          var len = Math.hypot(ddx, ddy) || 1;
          var px  = -ddy / len * offsetDist;
          var py  =  ddx / len * offsetDist;
          if (i === 0) ctx.moveTo(wps[i].x + px, wps[i].y + py);
          else         ctx.lineTo(wps[i].x + px, wps[i].y + py);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      });
    });
  }

  // ── 5. Corridor glow ──────────────────────────────────────────────────────────
  // Three-pass route rendering: outer glow → mid glow → bright spine.
  function _drawCorridorGlow(ctx, eco, events, phase, t) {
    var TE = global.SBE && SBE.TrafficEcology;
    if (!TE || !TE.ROUTES) return;

    var routes = Object.values(TE.ROUTES);
    var pulse  = 0.5 + 0.5 * Math.sin(t * 0.22);
    var c      = PHASE_TINTS[phase] || PHASE_TINTS.night;

    function _routePressure(route) {
      if (!eco || !eco.pressure) return 0.35;
      var sum = 0, count = 0;
      (route.districts || []).forEach(function (did) {
        var dp = eco.pressure.districts[did];
        if (dp) { sum += dp.traffic; count++; }
      });
      return count ? sum / count : 0.35;
    }

    routes.forEach(function (route) {
      var wps      = route.waypoints;
      if (!wps || wps.length < 2) return;
      var pressure = _routePressure(route);

      ctx.save();

      // A: wide outer glow
      ctx.strokeStyle = _tint(phase, 0.030 + pressure * 0.038 + pulse * 0.010);
      ctx.lineWidth   = 55 + pressure * 32;
      ctx.lineCap = ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(wps[0].x, wps[0].y);
      for (var i = 1; i < wps.length; i++) ctx.lineTo(wps[i].x, wps[i].y);
      ctx.stroke();

      // B: mid glow
      ctx.strokeStyle = _tint(phase, 0.058 + pressure * 0.062 + pulse * 0.014);
      ctx.lineWidth   = 18 + pressure * 14;
      ctx.beginPath();
      ctx.moveTo(wps[0].x, wps[0].y);
      for (var i = 1; i < wps.length; i++) ctx.lineTo(wps[i].x, wps[i].y);
      ctx.stroke();

      // C: bright spine
      var sr = Math.min(255, c.r + 65), sg = Math.min(255, c.g + 65), sb = Math.min(255, c.b + 85);
      ctx.strokeStyle = "rgba(" + sr + "," + sg + "," + sb + "," + (0.20 + pressure * 0.24 + pulse * 0.06) + ")";
      ctx.lineWidth   = 2 + pressure * 1.8;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(wps[0].x, wps[0].y);
      for (var i = 1; i < wps.length; i++) ctx.lineTo(wps[i].x, wps[i].y);
      ctx.stroke();

      ctx.restore();
    });
  }

  // ── 6. Traffic traces ─────────────────────────────────────────────────────────
  // Animated directional streaks moving along route geometry.
  // Pool-based: 160 traces maintained in module state, updated per-frame.
  function _ensureTraces(routes) {
    if (_traces) return;
    _traces = [];
    var rarr = Object.values(routes);
    for (var i = 0; i < 160; i++) {
      var route = rarr[i % rarr.length];
      _traces.push({
        routeId: route.id,
        wps:     route.waypoints,
        t:       Math.random(),
        speed:   0.012 + Math.random() * 0.028,
        alpha:   0.040 + Math.random() * 0.060,
        width:   0.8 + Math.random() * 1.8,
        len:     0.018 + Math.random() * 0.032,   // trace tail length in t-space
      });
    }
  }

  function _drawTrafficTraces(ctx, eco, events, phase, t, dt) {
    var TE = global.SBE && SBE.TrafficEcology;
    if (!TE || !TE.ROUTES) return;
    _ensureTraces(TE.ROUTES);

    // Pressure and event boost
    function _routePressure(wps) {
      if (!eco || !eco.pressure) return 0.35;
      // Approximate: use average of all district pressures
      var vals = Object.values(eco.pressure.districts || {});
      if (!vals.length) return 0.35;
      return vals.reduce(function (s, d) { return s + d.traffic; }, 0) / vals.length;
    }

    var globalPressure = _routePressure(null);
    var evBoost = 0;
    events.forEach(function (ev) {
      if (ev.state !== "dissolve") evBoost = Math.min(0.6, evBoost + ev.strength * 0.12);
    });

    var speedMult  = 0.7 + globalPressure * 1.0 + evBoost * 0.5;
    var alphaMult  = 0.5 + globalPressure * 1.0 + evBoost * 0.4;
    var c          = PHASE_TINTS[phase] || PHASE_TINTS.night;
    var sr = Math.min(255, c.r + 80);
    var sg = Math.min(255, c.g + 80);
    var sb = Math.min(255, c.b + 100);

    ctx.save();

    for (var i = 0; i < _traces.length; i++) {
      var tr = _traces[i];

      // Advance trace position
      tr.t += tr.speed * speedMult * dt;
      if (tr.t > 1.0) tr.t -= 1.0;   // wrap

      var head  = _routePos(tr.wps, tr.t);
      var tailT = Math.max(0, tr.t - tr.len);
      var tail  = _routePos(tr.wps, tailT);

      var alpha = tr.alpha * alphaMult;
      if (alpha < 0.005) continue;

      ctx.strokeStyle = "rgba(" + sr + "," + sg + "," + sb + "," + Math.min(0.22, alpha) + ")";
      ctx.lineWidth   = tr.width;
      ctx.lineCap     = "round";
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.moveTo(tail.x, tail.y);
      ctx.lineTo(head.x, head.y);
      ctx.stroke();
    }

    ctx.restore();
  }

  // ── 7. Drift particles ────────────────────────────────────────────────────────
  // Ambient micro-motion near districts.
  // 100 particles in module state, updated per-frame.
  function _ensureDrifts(DP, eco) {
    if (_drifts) return;
    _drifts = [];
    var districts = Object.values(DP.DISTRICTS);
    for (var i = 0; i < 100; i++) {
      var d     = districts[i % districts.length];
      var angle = Math.random() * Math.PI * 2;
      var r     = d.radius * (0.20 + Math.random() * 0.90);
      _drifts.push({
        x:     d.x + Math.cos(angle) * r,
        y:     d.y + Math.sin(angle) * r,
        homeX: d.x,
        homeY: d.y,
        homeR: d.radius,
        vx:    (Math.random() - 0.5) * 0.6,
        vy:    (Math.random() - 0.5) * 0.6,
        life:  Math.random(),
        size:  1.0 + Math.random() * 2.5,
        alpha: 0.08 + Math.random() * 0.12,
      });
    }
  }

  function _drawDriftParticles(ctx, DP, eco, cam, phase, t, dt) {
    _ensureDrifts(DP, eco);

    var c  = PHASE_TINTS[phase] || PHASE_TINTS.night;
    var sr = Math.min(255, c.r + 100);
    var sg = Math.min(255, c.g + 100);
    var sb = Math.min(255, c.b + 120);

    ctx.save();

    for (var i = 0; i < _drifts.length; i++) {
      var p = _drifts[i];

      // Advance life
      p.life += dt * (0.040 + Math.random() * 0.020);
      if (p.life >= 1.0) {
        // Respawn near home district
        var angle = Math.random() * Math.PI * 2;
        var r     = p.homeR * (0.15 + Math.random() * 0.85);
        p.x    = p.homeX + Math.cos(angle) * r;
        p.y    = p.homeY + Math.sin(angle) * r;
        p.vx   = (Math.random() - 0.5) * 0.7;
        p.vy   = (Math.random() - 0.5) * 0.7;
        p.life = 0;
        continue;
      }

      // Move
      p.x += p.vx * dt * 28;
      p.y += p.vy * dt * 28;

      // Fade curve: in (0–0.2), full (0.2–0.75), out (0.75–1)
      var fade;
      if (p.life < 0.2)      fade = p.life / 0.2;
      else if (p.life < 0.75) fade = 1.0;
      else                    fade = 1.0 - (p.life - 0.75) / 0.25;
      fade = Math.max(0, Math.min(1, fade));

      var alpha = p.alpha * fade;
      if (alpha < 0.005) continue;

      ctx.fillStyle   = "rgba(" + sr + "," + sg + "," + sb + "," + alpha + ")";
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * fade, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  // ── 8. Event presence wash ────────────────────────────────────────────────────
  // Regional social contagion — events tint surrounding city atmosphere.
  // A strong nightlifeSpill should brighten neighboring corridors.
  function _drawEventPresenceWash(ctx, events, phase, t) {
    events.forEach(function (ev) {
      if (ev.state === "dissolve" || ev.strength < 0.12) return;

      var stateM = ev.state === "peak"  ? 1.0
                 : ev.state === "grow"  ? 0.70
                 : ev.state === "decay" ? 0.40 : 0.08;

      var pulse  = 0.5 + 0.5 * Math.sin(t * 0.18 + ev.x * 0.0005);
      var washR  = ev.radius * (5.5 + pulse * 1.2);
      var alpha  = ev.strength * stateM * (0.022 + pulse * 0.010);

      ctx.save();
      var grad = ctx.createRadialGradient(ev.x, ev.y, ev.radius * 0.8, ev.x, ev.y, washR);
      grad.addColorStop(0,    _evCol(ev.type, 0));
      grad.addColorStop(0.30, _evCol(ev.type, alpha * 0.4));
      grad.addColorStop(0.60, _evCol(ev.type, alpha));
      grad.addColorStop(1,    _evCol(ev.type, 0));
      ctx.fillStyle   = grad;
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(ev.x, ev.y, washR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  // ── 9. Event breathing ────────────────────────────────────────────────────────
  // Near-field atmospheric pulse per event — emotionally communicates presence.
  function _drawEventBreathing(ctx, events, t) {
    events.forEach(function (ev) {
      if (ev.state === "dissolve" || ev.strength < 0.04) return;

      var pFreq = 0.25 + ev.strength * 0.35;
      var pulse = 0.5 + 0.5 * Math.sin(t * pFreq + ev.x * 0.0007);
      var stateM = ev.state === "peak"  ? 1.00
                 : ev.state === "grow"  ? 0.72
                 : ev.state === "decay" ? 0.45 : 0.12;

      var breathR  = ev.radius * (1.6 + pulse * 0.65);
      var breathR2 = breathR * 2.2;
      var alpha    = ev.strength * stateM * (0.048 + pulse * 0.032);

      ctx.save();
      var grad = ctx.createRadialGradient(ev.x, ev.y, breathR * 0.3, ev.x, ev.y, breathR2);
      grad.addColorStop(0,    _evCol(ev.type, 0));
      grad.addColorStop(0.35, _evCol(ev.type, alpha * 0.6));
      grad.addColorStop(0.65, _evCol(ev.type, alpha));
      grad.addColorStop(1,    _evCol(ev.type, 0));
      ctx.fillStyle   = grad;
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(ev.x, ev.y, breathR2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  // ── 10. Activity flicker ──────────────────────────────────────────────────────
  // Multi-frequency organic brightness animation in high-energy districts.
  function _drawActivityFlicker(ctx, DP, eco, phase, t) {
    Object.values(DP.DISTRICTS).forEach(function (d) {
      var dp = eco && eco.pressure && eco.pressure.districts[d.id];
      if (!dp || dp.energy < 0.50) return;

      var flicker = Math.sin(t * 2.3  + d.x * 0.002) *
                    Math.sin(t * 3.71 + d.y * 0.003) *
                    Math.sin(t * 1.17);
      flicker = (flicker + 1) * 0.5;

      var intensity = (dp.energy - 0.50) / 0.50;
      var alpha     = intensity * flicker * 0.038;
      if (alpha < 0.005) return;

      var flickR = d.radius * (0.55 + flicker * 0.28);
      ctx.save();
      var grad = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, flickR);
      grad.addColorStop(0,   _tint(phase, alpha));
      grad.addColorStop(0.6, _tint(phase, alpha * 0.4));
      grad.addColorStop(1,   _tint(phase, 0));
      ctx.fillStyle   = grad;
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(d.x, d.y, flickR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  // ── Public API ────────────────────────────────────────────────────────────────
  SBE.StageLightingRenderer = {
    render: render,
  };

})(window);
