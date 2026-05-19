(function initCameraCuriosityRenderer(global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  // ── Camera Curiosity Renderer (CameraCuriosity v1.0.0 / Passenger v1.0.0) ────
  //
  // DEBUG VISUALIZATION ONLY — gated on state.world.cameraCuriosity.debugDraw.
  //
  // Renders in WORLD SPACE (ctx pre-transformed by caller).
  //
  // Layers (draw order):
  //   1. Cooldown rings       — faded grey outlines for recently visited targets
  //   2. Camera trail         — last 60 positions (gated on cfg.debugCameraTrail)
  //   3. Node rings           — curiosity candidates, colored by score
  //   4. Heat falloff rings   — influence halo around current target
  //   5. Linger timer arc     — shows remaining observe time
  //   6. Target vector arrow  — camera position → current target
  //   7. Idle drift indicator — wander point cross/circle
  //   8. State label panel    — state, mode, score, velocity HUD

  // ── Score color  (cold blue → teal → warm gold) ───────────────────────────────
  function _scoreColor(score, a) {
    var r, g, b;
    if (score < 0.5) {
      var t = score * 2;
      r = Math.round(60  + t * (80  - 60));
      g = Math.round(140 + t * (220 - 140));
      b = Math.round(220 + t * (200 - 220));
    } else {
      var t = (score - 0.5) * 2;
      r = Math.round(80  + t * (255 - 80));
      g = Math.round(220 + t * (200 - 220));
      b = Math.round(200 + t * (60  - 200));
    }
    return "rgba(" + r + "," + g + "," + b + "," + a + ")";
  }

  var _STATE_COLOR = {
    idle:        "rgba(140,160,200,0.70)",
    curious:     "rgba(120,220,180,0.80)",
    investigate: "rgba(255,200,60,0.90)",
    observe:     "rgba(255,120,220,0.90)",
    release:     "rgba(200,200,255,0.60)",
  };

  var _MODE_COLOR = {
    wander:      "rgba(120,220,180,0.85)",
    documentary: "rgba(200,200,255,0.85)",
    hunter:      "rgba(255,140,60,0.90)",
    zen:         "rgba(140,220,200,0.80)",
  };

  // ── Main entry ────────────────────────────────────────────────────────────────
  function render(ctx, state, now) {
    var cfg = state.world && state.world.cameraCuriosity;
    if (!cfg || !cfg.debugDraw) return;

    var cam  = state.camera || { x: 0, y: 0, zoom: 1 };
    var t    = now * 0.001;
    var nodes = cfg._lastNodes || [];

    ctx.save();

    // ── 1. Cooldown rings ─────────────────────────────────────────────────────
    _drawCooldownRings(ctx, cfg, now, t);

    // ── 2. Camera trail ───────────────────────────────────────────────────────
    if (cfg.debugCameraTrail && cfg._cameraTrail && cfg._cameraTrail.length > 1) {
      _drawCameraTrail(ctx, cfg._cameraTrail, now);
    }

    // ── 3. Node rings ─────────────────────────────────────────────────────────
    nodes.forEach(function (node) {
      _drawNodeRing(ctx, node, cfg, t);
    });

    // ── 4 & 5. Heat falloff + linger arc (current target) ────────────────────
    if (cfg.currentTarget && cfg.state !== "idle" && cfg.state !== "release") {
      _drawHeatFalloff(ctx, cfg.currentTarget, cfg.state, t);
    }
    if (cfg.currentTarget && cfg.state === "observe" && cfg.lingerUntil) {
      _drawLingerArc(ctx, cfg.currentTarget, cfg, now);
    }

    // ── 6. Target vector arrow ────────────────────────────────────────────────
    if (cfg.currentTarget && cfg.state !== "idle") {
      _drawTargetArrow(ctx, cam, cfg.currentTarget, cfg.state);
    }

    // ── 7. Idle drift indicator ───────────────────────────────────────────────
    if ((cfg.state === "idle" || cfg.state === "release") && cfg._driftTarget) {
      _drawDriftTarget(ctx, cfg._driftTarget, t);
    }

    // ── 8. State label ────────────────────────────────────────────────────────
    _drawStateLabel(ctx, cam, cfg, now, t);

    ctx.restore();
  }

  // ── Cooldown rings (recent targets, fading as cooldown expires) ───────────────
  function _drawCooldownRings(ctx, cfg, now, t) {
    var recent = cfg.recentTargets;
    if (!recent || !recent.length) return;

    ctx.save();
    recent.forEach(function (r) {
      var totalCd = r.cooldownUntil - r.releasedAt;
      if (totalCd <= 0) return;
      var remaining = Math.max(0, r.cooldownUntil - now);
      var frac      = remaining / totalCd;  // 1 → 0 as cooldown expires
      if (frac <= 0) return;

      var ringR = 240 + frac * 80;
      var alpha = frac * 0.28;
      var pulse = 0.5 + 0.5 * Math.sin(t * 0.6 + r.x * 0.001);

      // Faded grey dashed ring
      ctx.strokeStyle = "rgba(160,160,180," + (alpha + pulse * 0.05) + ")";
      ctx.lineWidth   = 1;
      ctx.setLineDash([8, 20]);
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(r.x, r.y, ringR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Small decay label
      ctx.fillStyle    = "rgba(160,160,180," + (alpha * 2) + ")";
      ctx.font         = "9px monospace";
      ctx.textAlign    = "center";
      ctx.textBaseline = "top";
      ctx.fillText("cd " + Math.ceil(remaining / 1000) + "s", r.x, r.y - ringR - 12);
    });
    ctx.restore();
  }

  // ── Camera trail ──────────────────────────────────────────────────────────────
  function _drawCameraTrail(ctx, trail, now) {
    if (trail.length < 2) return;
    ctx.save();

    // Draw as connected polyline, fading toward tail
    for (var i = 1; i < trail.length; i++) {
      var prev  = trail[i - 1];
      var curr  = trail[i];
      var frac  = i / trail.length;  // 0 = oldest, 1 = newest
      var age   = now - curr.t;
      var ageFade = Math.max(0, 1 - age / 3000); // fade over 3s

      ctx.strokeStyle = "rgba(180,200,255," + (frac * 0.40 * ageFade) + ")";
      ctx.lineWidth   = 1 + frac * 1.5;
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(curr.x, curr.y);
      ctx.stroke();
    }

    // Endpoint dot (current position)
    var last = trail[trail.length - 1];
    ctx.fillStyle   = "rgba(180,200,255,0.70)";
    ctx.globalAlpha = 0.80;
    ctx.beginPath();
    ctx.arc(last.x, last.y, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // ── Node ring ──────────────────────────────────────────────────────────────────
  function _drawNodeRing(ctx, node, cfg, t) {
    var isTarget = cfg.currentTarget && cfg.currentTarget.id === node.id;
    var isCD     = node._inCooldown;
    var pulse    = 0.5 + 0.5 * Math.sin(t * 1.5 + node.x * 0.0008);
    var ringR    = node.radius * (isTarget ? (0.92 + pulse * 0.08) : 0.88);

    ctx.save();

    if (isCD) {
      // Cooldown-penalized nodes: thin grey dashes only
      ctx.strokeStyle = "rgba(120,120,140,0.25)";
      ctx.lineWidth   = 1;
      ctx.setLineDash([6, 16]);
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(node.x, node.y, ringR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      return;
    }

    // Soft radial fill
    var grad = ctx.createRadialGradient(node.x, node.y, ringR * 0.4, node.x, node.y, ringR);
    grad.addColorStop(0,   _scoreColor(node.score, 0));
    grad.addColorStop(0.7, _scoreColor(node.score, node.score * 0.06));
    grad.addColorStop(1,   _scoreColor(node.score, 0));
    ctx.fillStyle   = grad;
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(node.x, node.y, ringR, 0, Math.PI * 2);
    ctx.fill();

    // Ring stroke
    var strokeA = isTarget ? (0.55 + pulse * 0.20) : (0.18 + node.score * 0.25);
    ctx.strokeStyle = _scoreColor(node.score, strokeA);
    ctx.lineWidth   = isTarget ? 2 : 1;
    ctx.setLineDash(isTarget ? [] : [12, 18]);
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(node.x, node.y, ringR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Center dot
    ctx.fillStyle   = _scoreColor(node.score, 0.65 + node.score * 0.25);
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(node.x, node.y, 4 + node.score * 6, 0, Math.PI * 2);
    ctx.fill();

    // Score + type label
    ctx.fillStyle    = _scoreColor(node.score, 0.90);
    ctx.font         = "11px monospace";
    ctx.textAlign    = "center";
    ctx.textBaseline = "top";
    ctx.globalAlpha  = 0.85;
    var typeLabel  = node.eventType || node.type;
    var scoreLabel = Math.round(node.score * 100) + "%";
    if (node.persistence > 1) scoreLabel += " ×" + node.persistence;
    ctx.fillText(typeLabel + "  " + scoreLabel, node.x, node.y - ringR - 16);

    ctx.restore();
  }

  // ── Heat falloff ring (current target's emotional influence radius) ────────────
  function _drawHeatFalloff(ctx, target, camState, t) {
    var pulse  = 0.5 + 0.5 * Math.sin(t * 0.9);
    var heatR  = (target.radius || 300) * (1.30 + pulse * 0.12);
    var heatR2 = heatR * 1.80;

    ctx.save();

    // Outer glow gradient
    var grad = ctx.createRadialGradient(target.x, target.y, heatR * 0.6, target.x, target.y, heatR2);
    var stateA = camState === "observe" ? 0.12 : 0.07;
    grad.addColorStop(0,   _scoreColor(target.score, 0));
    grad.addColorStop(0.5, _scoreColor(target.score, stateA));
    grad.addColorStop(1,   _scoreColor(target.score, 0));
    ctx.fillStyle   = grad;
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(target.x, target.y, heatR2, 0, Math.PI * 2);
    ctx.fill();

    // Inner falloff ring
    ctx.strokeStyle = _scoreColor(target.score, 0.25 + pulse * 0.12);
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([20, 15]);
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(target.x, target.y, heatR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.restore();
  }

  // ── Linger arc ────────────────────────────────────────────────────────────────
  function _drawLingerArc(ctx, node, cfg, now) {
    var remaining = Math.max(0, cfg.lingerUntil - now);
    var entered   = cfg._stateEnteredAt || now;
    var total     = cfg.lingerUntil - entered;
    if (total <= 0) return;
    var frac  = remaining / total;
    var ringR = node.radius * 0.92 + 10;
    var start = -Math.PI / 2;
    var end   = start + Math.PI * 2 * frac;

    ctx.save();
    ctx.strokeStyle = "rgba(255,180,255,0.72)";
    ctx.lineWidth   = 3;
    ctx.globalAlpha = 0.82;
    ctx.beginPath();
    ctx.arc(node.x, node.y, ringR, start, end, false);
    ctx.stroke();

    ctx.fillStyle    = "rgba(255,180,255,0.85)";
    ctx.font         = "10px monospace";
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";
    ctx.globalAlpha  = 0.80;
    ctx.fillText(Math.ceil(remaining / 1000) + "s", node.x, node.y + ringR + 18);
    ctx.restore();
  }

  // ── Target vector arrow ───────────────────────────────────────────────────────
  function _drawTargetArrow(ctx, cam, target, camState) {
    var color = _STATE_COLOR[camState] || "rgba(255,255,255,0.60)";
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth   = 1.5;
    ctx.globalAlpha = 0.50;
    ctx.setLineDash([8, 12]);
    ctx.beginPath();
    ctx.moveTo(cam.x, cam.y);
    ctx.lineTo(target.x, target.y);
    ctx.stroke();
    ctx.setLineDash([]);

    var dx  = target.x - cam.x;
    var dy  = target.y - cam.y;
    var len = Math.hypot(dx, dy);
    if (len < 20) { ctx.restore(); return; }
    var nx   = dx / len;
    var ny   = dy / len;
    var tip  = { x: target.x - nx * 22, y: target.y - ny * 22 };
    var perp = 8;
    ctx.globalAlpha = 0.72;
    ctx.fillStyle   = color;
    ctx.beginPath();
    ctx.moveTo(target.x, target.y);
    ctx.lineTo(tip.x - ny * perp, tip.y + nx * perp);
    ctx.lineTo(tip.x + ny * perp, tip.y - nx * perp);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // ── Idle drift indicator ──────────────────────────────────────────────────────
  function _drawDriftTarget(ctx, driftTarget, t) {
    var pulse = 0.5 + 0.5 * Math.sin(t * 0.75);
    ctx.save();
    ctx.strokeStyle = "rgba(140,160,220,0.40)";
    ctx.lineWidth   = 1;
    ctx.setLineDash([6, 14]);
    ctx.globalAlpha = 0.40 + pulse * 0.15;
    ctx.beginPath();
    ctx.arc(driftTarget.x, driftTarget.y, 38 + pulse * 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    var cs = 12;
    ctx.strokeStyle = "rgba(140,160,220,0.45)";
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(driftTarget.x - cs, driftTarget.y);
    ctx.lineTo(driftTarget.x + cs, driftTarget.y);
    ctx.moveTo(driftTarget.x, driftTarget.y - cs);
    ctx.lineTo(driftTarget.x, driftTarget.y + cs);
    ctx.stroke();
    ctx.restore();
  }

  // ── State label panel ─────────────────────────────────────────────────────────
  function _drawStateLabel(ctx, cam, cfg, now, t) {
    var stateColor  = _STATE_COLOR[cfg.state]   || "rgba(200,200,200,0.70)";
    var modeColor   = _MODE_COLOR[cfg.passengerMode] || "rgba(200,200,200,0.70)";
    var elapsed     = cfg.metrics && cfg.metrics.stateTime || 0;
    var zoom        = cam.zoom || 1;

    // Position: below camera center in world space
    var panelW  = 340;
    var panelH  = 54;
    var lx      = cam.x - panelW * 0.5;
    var ly      = cam.y + (480 / zoom);

    ctx.save();

    // Panel background
    ctx.fillStyle   = "rgba(0,0,0,0.55)";
    ctx.globalAlpha = 0.92;
    ctx.fillRect(lx - 4, ly - 16, panelW, panelH);

    ctx.font         = "12px monospace";
    ctx.textAlign    = "left";
    ctx.textBaseline = "top";
    ctx.globalAlpha  = 1;

    // Row 1: state + time + mode
    ctx.fillStyle = stateColor;
    var stateStr  = cfg.state.toUpperCase().padEnd(13) + elapsed.toFixed(1) + "s";
    ctx.fillText(stateStr, lx, ly - 13);

    ctx.fillStyle = modeColor;
    ctx.textAlign = "right";
    ctx.fillText((cfg.passengerMode || "documentary").toUpperCase(), lx + panelW - 8, ly - 13);
    ctx.textAlign = "left";

    // Row 2: nodes, score, velocity, cooldowns
    ctx.fillStyle = "rgba(200,200,220,0.80)";
    var score  = ((cfg.currentScore || 0) * 100).toFixed(0);
    var vel    = (cfg.metrics && cfg.metrics.cameraVelocity || 0).toFixed(1);
    var cds    = (cfg.recentTargets || []).length;
    var drive  = cfg.drivingCamera ? "ON" : "off";
    ctx.fillText(
      "nodes:" + (cfg.metrics && cfg.metrics.nodes || 0) +
      "  score:" + score + "%" +
      "  vel:" + vel +
      "  cd:" + cds +
      "  drive:" + drive,
      lx, ly + 2
    );

    // Row 3: observe linger (only during observe)
    if (cfg.state === "observe" && cfg.lingerUntil) {
      var remaining = Math.max(0, cfg.lingerUntil - now) / 1000;
      ctx.fillStyle = "rgba(255,180,255,0.75)";
      ctx.fillText("  linger: " + remaining.toFixed(1) + "s remaining", lx, ly + 17);
    }

    ctx.restore();
  }

  // ── Public API ────────────────────────────────────────────────────────────────
  SBE.CameraCuriosityRenderer = {
    render: render,
  };

})(window);
