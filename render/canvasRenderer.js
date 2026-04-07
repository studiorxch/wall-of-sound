(function initCanvasRenderer(global) {
  const SBE = (global.SBE = global.SBE || {});

  class CanvasRenderer {
    constructor(canvas) {
      if (!canvas) {
        throw new Error("CanvasRenderer requires a canvas element");
      }

      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.width = canvas.width;
      this.height = canvas.height;
    }

    resize(width, height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.width = width;
      this.height = height;
    }

    clear(state) {
      const ctx = this.ctx;

      if (state?.ui?.transparentBackground) {
        ctx.clearRect(0, 0, this.width, this.height);
      } else {
        ctx.fillStyle = "#090a0c";
        ctx.fillRect(0, 0, this.width, this.height);
      }
    }

    drawLines(lines) {
      const ctx = this.ctx;

      lines.forEach((line) => {
        if (!line) return;

        const color = line.style?.color || line.color || "#ffffff";
        const thickness = line.style?.thickness || line.thickness || 2;

        // FIX: ensure visibility even if life missing
        const life = typeof line.life === "number" ? line.life : 9999;
        const alpha = life > 0 ? 0.9 : 0.25;

        ctx.globalAlpha = alpha;
        ctx.strokeStyle = color;
        ctx.lineWidth = thickness;

        ctx.beginPath();
        ctx.moveTo(line.x1, line.y1);
        ctx.lineTo(line.x2, line.y2);
        ctx.stroke();
      });

      ctx.globalAlpha = 1;
    }

    drawBalls(balls) {
      const ctx = this.ctx;

      balls.forEach((ball) => {
        if (!ball) return;

        ctx.fillStyle = ball.color || "#f3f2ef";

        ctx.beginPath();
        ctx.arc(ball.x, ball.y, ball.renderRadius || 6, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    drawOverlay(overlays) {
      const ctx = this.ctx;

      if (!overlays) return;

      // preview stroke
      if (overlays.previewStroke?.length) {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.5;

        ctx.beginPath();
        overlays.previewStroke.forEach((p, i) => {
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    render(state, overlays) {
      if (!this.ctx) return;

      this.clear(state);

      if (state.backgroundImage) {
        this.ctx.drawImage(
          state.backgroundImage,
          0,
          0,
          this.width,
          this.height,
        );
      }

      this.drawLines(state.lines || []);
      this.drawBalls(state.balls || []);
      this.drawOverlay(overlays);
    }
  }

  // ✅ THIS is the critical line you were missing/breaking
  SBE.CanvasRenderer = CanvasRenderer;
})(window);
