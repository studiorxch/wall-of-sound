(function initRenderer(global) {
  const SBE = (global.SBE = global.SBE || {});

  function CanvasRenderer(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
  }

  CanvasRenderer.prototype.resize = function resize(width, height) {
    this.canvas.width = width;
    this.canvas.height = height;
  };

  CanvasRenderer.prototype.render = function render(state, overlays) {
    const context = this.context;
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);

    drawBackground(context, state);
    drawTextObjects(
      context,
      state.textObjects || [],
      state.selectedTextId,
      isClean(state),
    );
    drawLines(context, state.lines, state.selectedLineId, isClean(state));
    drawShapes(context, state, isClean(state));
    drawBalls(
      context,
      state.balls,
      state.swarm.color,
      state.selectedBallId,
      isClean(state),
    );
    drawDraft(context, overlays, isClean(state));
  };

  function drawTextObjects(context, textObjects, selectedTextId, cleanOutput) {
    const now = performance.now();

    textObjects.forEach((textObject) => {
      if (!textObject.geometry || !textObject.geometry.bounds) {
        return;
      }

      context.save();
      applyTextTransform(context, textObject);

      textObject.geometry.letters.forEach((letter) => {
        if (!letter.path2d) {
          return;
        }

        let fillColor = textObject.color;
        let strokeColor = textObject.color;
        let alpha = 0.8;
        let strokeWidth = Math.max(1, textObject.thickness * 0.35);
        let shadowBlur = 0;
        const highlightAt =
          textObject.interaction.mode === "letter"
            ? letter.lastHitAt
            : textObject.lastHitAt;

        if (highlightAt) {
          const elapsed = now - highlightAt;
          if (elapsed < 180) {
            const t = 1 - elapsed / 180;
            fillColor = "#ffffff";
            strokeColor = "#ffffff";
            alpha = Math.max(alpha, 0.55 + t * 0.4);
            strokeWidth += t * 2.5;
            shadowBlur = 2 + t * 4;
          }
        }

        context.save();
        context.fillStyle = fillColor;
        context.strokeStyle = strokeColor;
        context.globalAlpha = alpha;
        context.lineWidth = strokeWidth;
        if (shadowBlur > 0) {
          context.shadowColor = strokeColor;
          context.shadowBlur = shadowBlur;
        }
        context.fill(letter.path2d);
        context.stroke(letter.path2d);
        context.restore();
      });

      if (textObject.id === selectedTextId && !cleanOutput) {
        const bounds = textObject.geometry.bounds;
        context.save();
        context.strokeStyle = "rgba(255,255,255,0.72)";
        context.lineWidth = 2;
        context.setLineDash([10, 8]);
        context.strokeRect(
          bounds.minX,
          bounds.minY,
          bounds.width || 1,
          bounds.height || 1,
        );
        context.restore();
      }

      context.restore();
    });
  }

  function drawBackground(context, state) {
    if (!state.ui || !state.ui.transparentBackground) {
      context.fillStyle = "#090a0c";
      context.fillRect(0, 0, state.canvas.width, state.canvas.height);
    }

    if (state.backgroundImage) {
      context.save();
      context.globalAlpha = 0.32;
      context.drawImage(
        state.backgroundImage,
        0,
        0,
        state.canvas.width,
        state.canvas.height,
      );
      context.restore();
    }

    if (!isClean(state)) {
      const gradient = context.createLinearGradient(
        0,
        0,
        0,
        state.canvas.height,
      );
      gradient.addColorStop(0, "rgba(255,255,255,0.04)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      context.fillStyle = gradient;
      context.fillRect(0, 0, state.canvas.width, state.canvas.height);
    }
  }

  function drawLines(context, lines, selectedLineId, cleanOutput) {
    const now = performance.now();

    lines.forEach((line) => {
      context.save();
      context.lineCap = "round";

      // --- BASE STYLE ---
      let strokeColor = line.color;
      let alpha = line.life > 0 ? 0.9 : 0.25;
      let thickness = line.thickness;
      let shadowBlur = 0;

      // --- 🔥 HIGHLIGHT LOGIC ---
      if (line.lastHitAt) {
        const duration = (line.interaction && line.interaction.duration) || 140;
        const highlightColor =
          (line.interaction && line.interaction.highlightColor) || "#ffffff";

        const elapsed = now - line.lastHitAt;

        if (elapsed < duration) {
          const t = 1 - elapsed / duration;

          strokeColor = highlightColor;
          alpha = Math.max(alpha, t * 0.95);

          // optional visual punch
          thickness = line.thickness + t * 3;
          shadowBlur = 0;
        }
      }

      context.lineWidth = thickness;
      context.strokeStyle = strokeColor;
      context.globalAlpha = alpha;

      if (shadowBlur > 0) {
        context.shadowColor = strokeColor;
        context.shadowBlur = shadowBlur;
      }

      context.beginPath();
      context.moveTo(line.x1, line.y1);
      context.lineTo(line.x2, line.y2);
      context.stroke();

      // --- selection overlay ---
      if (line.id === selectedLineId && !cleanOutput) {
        context.strokeStyle = "rgba(255,255,255,0.9)";
        context.lineWidth = thickness + 4;
        context.globalAlpha = 0.25;
        context.stroke();
      }

      context.restore();
    });
  }

  function drawShapes(context, state, cleanOutput) {
    var shapes = state.shapes;
    if (!shapes || !shapes.length) {
      return;
    }

    var now = performance.now();
    var selectedShapeIds =
      state.selectedShapeIds && state.selectedShapeIds.size
        ? state.selectedShapeIds
        : null;
    var selectedSegmentId = state.selectedSegmentId || null;

    shapes.forEach(function (shape) {
      if (!shape.segments || !shape.segments.length) {
        return;
      }

      var isSelected = selectedShapeIds && selectedShapeIds.has(shape.id);

      // ── Draw segments ──────────────────────────────────
      shape.segments.forEach(function (seg) {
        context.save();
        context.lineCap = "round";
        context.lineJoin = "round";

        var strokeColor = seg.color || "#ff4b4b";
        var alpha = typeof seg.life === "number" && seg.life > 0 ? 0.9 : 0.25;
        var thickness = seg.thickness || 5;

        // ── Collision highlight ──────────────────────────
        if (seg.lastHitAt && seg.lastHitAt > 0) {
          var elapsed = now - seg.lastHitAt;
          if (elapsed < 160) {
            var t = 1 - elapsed / 160;
            strokeColor = "#ffffff";
            alpha = 0.55 + t * 0.45;
            thickness += t * 4;
          }
        }

        context.lineWidth = thickness;
        context.strokeStyle = strokeColor;
        context.globalAlpha = alpha;
        context.beginPath();
        context.moveTo(seg.x1, seg.y1);
        context.lineTo(seg.x2, seg.y2);
        context.stroke();

        // ── Segment selection highlight (edit mode) ──────
        if (
          !cleanOutput &&
          isSelected &&
          shape.isExpanded &&
          selectedSegmentId &&
          seg.id === selectedSegmentId
        ) {
          context.globalAlpha = 0.35;
          context.strokeStyle = "rgba(255,200,60,1)";
          context.lineWidth = thickness + 4;
          context.beginPath();
          context.moveTo(seg.x1, seg.y1);
          context.lineTo(seg.x2, seg.y2);
          context.stroke();
        }

        context.restore();
      });

      // ── Shape bounding box ─────────────────────────────
      if (isSelected && !cleanOutput && shape.bounds) {
        var b = shape.bounds;
        if (b.width > 0 || b.height > 0) {
          var pad = 12;
          context.save();
          context.globalAlpha = 1;
          context.strokeStyle = shape.isExpanded
            ? "rgba(255,200,60,0.72)"
            : "rgba(255,255,255,0.72)";
          context.lineWidth = 2;
          context.setLineDash(shape.isExpanded ? [6, 4] : [10, 8]);
          context.strokeRect(
            b.minX - pad,
            b.minY - pad,
            b.width + pad * 2,
            b.height + pad * 2,
          );
          context.restore();
        }
      }
    });
  }

  function drawBalls(context, balls, color, selectedBallId, cleanOutput) {
    balls.forEach((ball) => {
      const renderRadius = ball.renderRadius || ball.radius;
      const collisionRadius = ball.collisionRadius || ball.radius;
      const alpha = 0.72 + ball.energy * 0.14;

      context.save();

      if (ball.style === "solid") {
        context.fillStyle = color;
        context.globalAlpha = alpha;
        context.beginPath();
        context.arc(ball.x, ball.y, renderRadius, 0, Math.PI * 2);
        context.fill();
      } else {
        context.strokeStyle = color;
        context.globalAlpha = alpha;
        context.lineWidth = Math.max(1.5, renderRadius - collisionRadius);
        context.beginPath();
        context.arc(
          ball.x,
          ball.y,
          Math.max(collisionRadius, renderRadius - context.lineWidth * 0.5),
          0,
          Math.PI * 2,
        );
        context.stroke();
        context.fillStyle = color;
        context.globalAlpha = 0.92;
        context.beginPath();
        context.arc(
          ball.x,
          ball.y,
          Math.max(1.5, collisionRadius * 0.6),
          0,
          Math.PI * 2,
        );
        context.fill();
      }

      if (ball.id === selectedBallId && !cleanOutput) {
        context.strokeStyle = "rgba(255,255,255,0.8)";
        context.lineWidth = 2;
        context.setLineDash([8, 6]);
        context.beginPath();
        context.arc(ball.x, ball.y, renderRadius + 6, 0, Math.PI * 2);
        context.stroke();
      }

      context.restore();
    });
  }

  function drawDraft(context, overlays, cleanOutput) {
    if (cleanOutput) {
      return;
    }

    if (
      overlays &&
      overlays.previewStroke &&
      overlays.previewStroke.length > 1
    ) {
      context.save();
      context.lineWidth = 3;
      context.strokeStyle = "#ffffff";
      context.globalAlpha = 0.85;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.beginPath();
      context.moveTo(overlays.previewStroke[0].x, overlays.previewStroke[0].y);
      for (let index = 1; index < overlays.previewStroke.length; index += 1) {
        context.lineTo(
          overlays.previewStroke[index].x,
          overlays.previewStroke[index].y,
        );
      }
      context.stroke();
      context.restore();
    }

    if (overlays && overlays.ballVector) {
      context.save();
      context.strokeStyle = "rgba(255,255,255,0.72)";
      context.lineWidth = 2;
      context.setLineDash([8, 6]);
      context.beginPath();
      context.moveTo(overlays.ballVector.x1, overlays.ballVector.y1);
      context.lineTo(overlays.ballVector.x2, overlays.ballVector.y2);
      context.stroke();
      context.restore();
    }
  }

  function applyTextTransform(context, textObject) {
    context.translate(textObject.transform.x, textObject.transform.y);
    context.rotate((textObject.transform.rotation * Math.PI) / 180);
    context.scale(textObject.transform.scale, textObject.transform.scale);
    context.translate(
      -textObject.geometry.bounds.centerX,
      -textObject.geometry.bounds.centerY,
    );
  }

  SBE.CanvasRenderer = CanvasRenderer;

  function isClean(state) {
    return !!(
      state &&
      state.ui &&
      (state.ui.cleanOutput || state.ui.presentation)
    );
  }
})(window);
