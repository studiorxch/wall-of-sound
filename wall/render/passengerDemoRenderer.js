(function initPassengerDemoRenderer(global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  // ── Passenger Demo Renderer (FirstPassengerDemo v1.0.0) ──────────────────────
  //
  // Renders in WORLD SPACE (ctx pre-transformed by caller).
  //
  // Intentionally minimal. The city speaks — the overlay listens.
  //
  // Layers:
  //   • WOS watermark       — top-right, ~5% opacity, always present
  //   • Phase transition label — center screen, fades in/out on phase change
  //   • Demo status strip   — bottom, tiny monospace, 8% opacity
  //
  // Gated on: state.world.passengerDemo.enabled
  // No debugDraw flag — this IS the presentation layer.

  // Canvas dimensions (portrait WOS canvas)
  var CANVAS_W = 1080;
  var CANVAS_H = 1920;

  // Phase label timing
  var LABEL_FADE_IN_MS  = 1200;
  var LABEL_HOLD_MS     = 3500;
  var LABEL_FADE_OUT_MS = 2500;
  var LABEL_TOTAL_MS    = LABEL_FADE_IN_MS + LABEL_HOLD_MS + LABEL_FADE_OUT_MS;

  // ── Main entry ────────────────────────────────────────────────────────────────
  function render(ctx, state, now) {
    var demo = state.world && state.world.passengerDemo;
    if (!demo || !demo.enabled) return;

    var cam  = state.camera || { x: 0, y: 0, zoom: 1 };
    var zoom = cam.zoom || 1;

    // World-space helper: convert screen offset (px from center) to world coords
    function wx(dx) { return cam.x + dx / zoom; }
    function wy(dy) { return cam.y + dy / zoom; }

    ctx.save();

    // ── 1. WOS watermark (top-right) ─────────────────────────────────────────
    _drawWatermark(ctx, wx, wy, zoom, now);

    // ── 2. Phase transition label (center) ───────────────────────────────────
    if (demo._phaseLabel && demo._phaseLabelAt) {
      var labelAge = now - demo._phaseLabelAt;
      if (labelAge < LABEL_TOTAL_MS) {
        _drawPhaseLabel(ctx, demo._phaseLabel, labelAge, wx, wy, zoom);
      }
    }

    // ── 3. Status strip (bottom) ─────────────────────────────────────────────
    _drawStatusStrip(ctx, state, demo, cam, wx, wy, zoom, now);

    ctx.restore();
  }

  // ── WOS Watermark ─────────────────────────────────────────────────────────────
  // Very subtle. Present throughout, barely readable. More felt than seen.
  function _drawWatermark(ctx, wx, wy, zoom, now) {
    var pulse = 0.50 + 0.50 * Math.sin(now * 0.00018);   // very slow 0→1 breath
    var alpha = 0.042 + pulse * 0.012;                    // 4–5.4% — barely there

    ctx.save();
    ctx.fillStyle    = "rgba(210,220,255," + alpha + ")";
    ctx.font         = "bold " + Math.round(22 / zoom) + "px sans-serif";
    ctx.textAlign    = "right";
    ctx.textBaseline = "top";
    ctx.globalAlpha  = 1;
    ctx.fillText("WOS", wx(CANVAS_W * 0.5 - 32), wy(-CANVAS_H * 0.5 + 36));
    ctx.restore();
  }

  // ── Phase Transition Label ────────────────────────────────────────────────────
  // Appears at the vertical 38% mark — above center, away from bottom strip.
  // Short decay — leaves before it becomes wallpaper.
  function _drawPhaseLabel(ctx, label, ageMs, wx, wy, zoom) {
    if (!label) return;  // empty label = intentional silence

    var alpha;
    if (ageMs < LABEL_FADE_IN_MS) {
      alpha = ageMs / LABEL_FADE_IN_MS;
    } else if (ageMs < LABEL_FADE_IN_MS + LABEL_HOLD_MS) {
      alpha = 1.0;
    } else {
      var fadeProgress = (ageMs - LABEL_FADE_IN_MS - LABEL_HOLD_MS) / LABEL_FADE_OUT_MS;
      alpha = 1.0 - Math.min(1, fadeProgress);
    }
    alpha = Math.max(0, Math.min(1, alpha)) * 0.78;

    ctx.save();
    ctx.fillStyle    = "rgba(220,220,255," + alpha + ")";
    ctx.font         = "300 " + Math.round(52 / zoom) + "px sans-serif";
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";
    ctx.globalAlpha  = 1;
    ctx.letterSpacing = "0.22em";
    ctx.fillText(label.toUpperCase(), wx(0), wy(-CANVAS_H * 0.12));
    ctx.letterSpacing = "";
    ctx.restore();
  }

  // ── Status Strip ─────────────────────────────────────────────────────────────
  // Bottom of screen. One line. Barely legible. Presence without noise.
  function _drawStatusStrip(ctx, state, demo, cam, wx, wy, zoom, now) {
    var m  = demo.metrics || {};
    var ph = m.phase || demo.phase || "—";

    // Demo elapsed time
    var totalSec = m.demoElapsed || 0;
    var mm  = Math.floor(totalSec / 60);
    var ss  = Math.floor(totalSec % 60);
    var ts  = mm + ":" + (ss < 10 ? "0" + ss : ss);

    var mode = (state.world && state.world.cameraCuriosity &&
                state.world.cameraCuriosity.passengerMode) || "documentary";

    var label = ts + "  " + ph.toUpperCase() + "  " + mode;

    var stripY = wy(CANVAS_H * 0.5 - 44);
    var stripX = wx(0);
    var fontSize = Math.round(11 / zoom);

    ctx.save();
    ctx.fillStyle    = "rgba(180,190,220,0.08)";
    ctx.globalAlpha  = 1;
    ctx.font         = fontSize + "px monospace";
    ctx.textAlign    = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(label, stripX, stripY);
    ctx.restore();
  }

  // ── Public API ────────────────────────────────────────────────────────────────
  SBE.PassengerDemoRenderer = {
    render: render,
  };

})(window);
