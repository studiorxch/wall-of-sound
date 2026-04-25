(function initDrawTools(global) {
  const SBE = (global.SBE = global.SBE || {});

  function createDrawTools(canvas, state, callbacks) {
    const toolState = {
      drawPoints: [],
      previewStroke: null,
      ballStart: null,
      ballVector: null,
      draggingSelection: false,
      lastPoint: null,
      lastClickTime: 0,
      lastClickId: null,
    };

    canvas.addEventListener("pointerdown", function onPointerDown(event) {
      if (state.ui.presentation) {
        return;
      }

      const point = getCanvasCoords(event, canvas);
      toolState.lastPoint = point;

      if (state.tool === "draw") {
        toolState.drawPoints = [point];
        toolState.previewStroke = [point];
        callbacks.onOverlayChange();
        canvas.setPointerCapture(event.pointerId);
        return;
      }

      if (state.tool === "shape") {
        callbacks.onCreateShapeAt(point);
        callbacks.onOverlayChange();
        return;
      }

      if (state.tool === "text") {
        callbacks.onCreateTextAt(point);
        callbacks.onOverlayChange();
        return;
      }

      if (state.tool === "ball") {
        toolState.ballStart = point;
        toolState.ballVector = {
          x1: point.x,
          y1: point.y,
          x2: point.x,
          y2: point.y,
        };
        callbacks.onOverlayChange();
        canvas.setPointerCapture(event.pointerId);
        return;
      }

      if (state.tool === "select") {
        const ball = findBall(state.balls || [], point);
        if (ball) {
          toolState.draggingSelection = true;
          callbacks.onSelectBall(ball);
          canvas.setPointerCapture(event.pointerId);
          return;
        }

        const textObject =
          SBE.TextSystem &&
          SBE.TextSystem.hitTestTextObjects(state.textObjects || [], point);
        if (textObject) {
          toolState.draggingSelection = true;
          callbacks.onSelectText(textObject);
          canvas.setPointerCapture(event.pointerId);
          return;
        }

        // Shape hit testing (before lines)
        if (SBE.ShapeSystem && state.shapes && state.shapes.length) {
          var hitShape = SBE.ShapeSystem.findShapeAtPoint(
            state.shapes,
            point,
            18,
          );
          if (hitShape) {
            var isShift = !!event.shiftKey;

            // Double-click detection for edit mode (single shape only)
            var now = performance.now();
            if (
              !isShift &&
              hitShape.id === toolState.lastClickId &&
              now - toolState.lastClickTime < 400
            ) {
              if (callbacks.onDoubleClickShape) {
                callbacks.onDoubleClickShape(hitShape);
              }
              toolState.lastClickTime = 0;
              toolState.lastClickId = null;
            } else {
              toolState.lastClickTime = now;
              toolState.lastClickId = hitShape.id;
            }

            toolState.draggingSelection = true;

            // In edit mode (single shape, no shift), try segment selection
            if (!isShift && hitShape.isExpanded) {
              var hitSeg = SBE.ShapeSystem.findSegmentAtPoint(
                hitShape,
                point,
                12,
              );
              if (hitSeg && callbacks.onSelectSegment) {
                callbacks.onSelectSegment(hitShape, hitSeg);
              } else if (callbacks.onSelectShape) {
                callbacks.onSelectShape(hitShape, false);
              }
            } else if (callbacks.onSelectShape) {
              callbacks.onSelectShape(hitShape, isShift);
            }

            canvas.setPointerCapture(event.pointerId);
            return;
          }
        }

        const line = SBE.LineSystem.findNearestLine(
          state.lines || [],
          point,
          18,
        );
        if (line) {
          toolState.draggingSelection = true;
          callbacks.onSelectLine(line);
          canvas.setPointerCapture(event.pointerId);
          return;
        }

        toolState.lastClickTime = 0;
        toolState.lastClickId = null;
        callbacks.onClearSelection();
      }
    });

    canvas.addEventListener("pointermove", function onPointerMove(event) {
      const point = getCanvasCoords(event, canvas);

      if (state.tool === "draw" && toolState.drawPoints.length) {
        const previous = toolState.drawPoints[toolState.drawPoints.length - 1];

        if (!previous) return;

        const dx = point.x - previous.x;
        const dy = point.y - previous.y;
        const dist = Math.hypot(dx, dy);

        const spacing = 1.5;

        if (dist >= spacing) {
          const steps = Math.floor(dist / spacing);

          for (let i = 1; i <= steps; i++) {
            toolState.drawPoints.push({
              x: previous.x + (dx * i) / steps,
              y: previous.y + (dy * i) / steps,
            });
          }

          toolState.previewStroke = toolState.drawPoints;
          callbacks.onOverlayChange();
        }
        return;
      }

      if (state.tool === "ball" && toolState.ballStart) {
        toolState.ballVector = {
          x1: toolState.ballStart.x,
          y1: toolState.ballStart.y,
          x2: point.x,
          y2: point.y,
        };
        callbacks.onOverlayChange();
        return;
      }

      if (
        state.tool === "select" &&
        toolState.draggingSelection &&
        toolState.lastPoint
      ) {
        const dx = point.x - toolState.lastPoint.x;
        const dy = point.y - toolState.lastPoint.y;
        toolState.lastPoint = point;
        callbacks.onTranslateSelection(dx, dy);
        callbacks.onOverlayChange();
      }
    });

    canvas.addEventListener("pointerup", function onPointerUp(event) {
      const points = toolState.drawPoints;

      if (state.tool === "draw" && points && points.length >= 2) {
        callbacks.onCreateFreehand(points.slice());
      }

      if (
        state.tool === "ball" &&
        toolState.ballStart &&
        toolState.ballVector
      ) {
        callbacks.onSpawnBall(toolState.ballStart, {
          x: toolState.ballVector.x2,
          y: toolState.ballVector.y2,
        });
      }

      canvas.releasePointerCapture(event.pointerId);
      toolState.drawPoints = [];
      toolState.previewStroke = null;
      toolState.ballStart = null;
      toolState.ballVector = null;
      toolState.draggingSelection = false;
      toolState.lastPoint = null;
      callbacks.onOverlayChange();
    });

    return {
      finishPath: function finishPath() {
        toolState.drawPoints = [];
        toolState.previewStroke = null;
      },
      getOverlays: function getOverlays() {
        return {
          previewStroke: toolState.previewStroke,
          ballVector: toolState.ballVector,
        };
      },
    };
  }

  function getCanvasCoords(e, canvas) {
    const rect = canvas.getBoundingClientRect();

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  function findBall(balls, point) {
    for (let index = balls.length - 1; index >= 0; index -= 1) {
      const ball = balls[index];
      const radius =
        ball.renderRadius || ball.collisionRadius || ball.radius || 8;
      if (Math.hypot(point.x - ball.x, point.y - ball.y) <= radius + 6) {
        return ball;
      }
    }

    return null;
  }

  SBE.DrawTools = {
    createDrawTools,
  };
})(window);
