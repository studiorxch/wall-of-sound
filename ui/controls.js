(function initControls(global) {
  const SBE = (global.SBE = global.SBE || {});

  function createControls() {
    const elements = {
      bpmInput: byId("bpm-input"),
      barCount: byId("bar-count"),
      quantizeEnabled: byId("quantize-enabled"),
      quantizeDivision: byId("quantize-division"),
      recordLoop: byId("record-loop"),
      stopLoop: byId("stop-loop"),
      clearScene: byId("clear-scene"),
      exportLoop: byId("export-loop"),
      retakeLoop: byId("retake-loop"),
      loadExample: byId("load-example"),
      saveScene: byId("save-scene"),
      sceneFile: byId("scene-file"),
      textFontFile: byId("text-font-file"),
      backgroundFile: byId("background-file"),
      transparentBg: byId("transparent-bg"),
      textFontStatus: byId("text-font-status"),
      engineStatus: byId("engine-status"),
      sceneStats: byId("scene-stats"),

      // Inspector
      inspector: byId("inspector"),
      textInspectorBlock: byId("text-inspector-block"),

      // Inspector fields
      activeNote: byId("active-note"),
      lineColor: byId("line-color"),
      lineThickness: byId("line-thickness"),
      lineThicknessValue: byId("line-thickness-value"),
      lineBehavior: byId("line-behavior"),
      lineStrength: byId("line-strength"),
      lineStrengthValue: byId("line-strength-value"),

      // Text fields
      textContent: byId("text-content"),
      textSize: byId("text-size"),
      textSizeValue: byId("text-size-value"),
      textX: byId("text-x"),
      textY: byId("text-y"),
      textScale: byId("text-scale"),
      textScaleValue: byId("text-scale-value"),
      textRotation: byId("text-rotation"),
      textRotationValue: byId("text-rotation-value"),
      centerText: byId("center-text"),

      // Actions
      duplicateSelection: byId("duplicate-selection"),
      deleteSelection: byId("delete-selection"),
      undoAction: byId("undo-action"),

      // Ball
      ballCount: byId("ball-count"),
      ballCountValue: byId("ball-count-value"),
      ballSpeed: byId("ball-speed"),
      ballSpeedValue: byId("ball-speed-value"),
      ballSpread: byId("ball-spread"),
      ballSpreadValue: byId("ball-spread-value"),

      // Shape panel
      shapePanel: byId("shape-panel"),
      ballPanel: byId("ball-panel"),

      // Buttons — match current index.html classes
      shapeButtons: Array.from(document.querySelectorAll(".shape-button")),
      toolButtons: Array.from(document.querySelectorAll(".tool")),
      noteCells: Array.from(document.querySelectorAll(".note-cell")),
      colorSwatches: Array.from(
        document.querySelectorAll(".swatch-grid .swatch"),
      ),

      // Shortcuts
      closeShortcuts: byId("close-shortcuts"),
      shortcutHud: byId("shortcut-hud"),
    };

    bindRange(elements.textSize, elements.textSizeValue, 0);
    bindRange(elements.textScale, elements.textScaleValue, 1);
    bindRange(elements.textRotation, elements.textRotationValue, 0);
    bindRange(elements.lineThickness, elements.lineThicknessValue, 0);
    bindRange(elements.lineStrength, elements.lineStrengthValue, 1);
    bindRange(elements.ballCount, elements.ballCountValue, 0);
    bindRange(elements.ballSpeed, elements.ballSpeedValue, 1);
    bindRange(elements.ballSpread, elements.ballSpreadValue, 2);

    return {
      elements,
      syncState: function syncState(appState) {
        elements.bpmInput.value = Number(appState.bpm).toFixed(1);
        elements.barCount.value = String(appState.loop.bars);
        elements.quantizeEnabled.checked = !!appState.quantize.enabled;
        elements.quantizeDivision.value = String(appState.quantize.division);
        elements.transparentBg.checked = !!appState.ui.transparentBackground;
        elements.engineStatus.textContent = appState.loop.recording
          ? "REC"
          : appState.loop.armed
            ? "ARM"
            : appState.loop.playing
              ? "LOOP"
              : appState.running
                ? "RUN"
                : "STOP";
        elements.sceneStats.textContent =
          appState.lines.length +
          (appState.shapes ? appState.shapes.length : 0) +
          "L " +
          appState.textObjects.length +
          "T " +
          appState.balls.length +
          "B";
        elements.exportLoop.classList.toggle("hidden", !appState.loop.hasLoop);
        elements.retakeLoop.classList.toggle("hidden", !appState.loop.hasLoop);
        elements.ballCount.value = String(appState.ballTool.count);
        elements.ballCountValue.textContent = String(appState.ballTool.count);
        elements.ballSpeed.value = String(appState.ballTool.speed);
        elements.ballSpeedValue.textContent = Number(
          appState.ballTool.speed,
        ).toFixed(1);
        elements.ballSpread.value = String(appState.ballTool.spread);
        elements.ballSpreadValue.textContent = Number(
          appState.ballTool.spread,
        ).toFixed(2);
      },
      syncTool: function syncTool(tool) {
        elements.toolButtons.forEach(function (button) {
          button.classList.toggle("active", button.dataset.tool === tool);
        });
        if (elements.shapePanel) {
          elements.shapePanel.classList.toggle("hidden", tool !== "shape");
        }
        if (elements.ballPanel) {
          elements.ballPanel.classList.toggle("hidden", tool !== "ball");
        }
      },
      syncShapeSelection: function syncShapeSelection(shapeId) {
        elements.shapeButtons.forEach(function (button) {
          button.classList.toggle("active", button.dataset.shape === shapeId);
        });
      },
      syncSelection: function syncSelection(selection, activeNoteClass) {
        var hasSelection =
          !!selection &&
          (selection.type === "line" || selection.type === "text");

        if (elements.inspector) {
          elements.inspector.classList.toggle("hidden", !hasSelection);
        }
        if (elements.textInspectorBlock) {
          elements.textInspectorBlock.classList.toggle(
            "hidden",
            !selection || selection.type !== "text",
          );
        }

        if (!hasSelection) {
          return;
        }

        elements.activeNote.value = String(selection.midi.note);
        elements.lineThickness.value = String(selection.style.thickness);
        elements.lineThicknessValue.textContent = String(
          selection.style.thickness,
        );
        elements.lineBehavior.value =
          selection.behavior.type === "normal"
            ? "none"
            : selection.behavior.type;
        elements.lineStrength.value = String(selection.behavior.strength);
        elements.lineStrengthValue.textContent =
          selection.behavior.strength.toFixed(1);

        if (selection.type === "text") {
          elements.textContent.value = selection.value;
          elements.textSize.value = String(selection.font.size);
          elements.textSizeValue.textContent = String(selection.font.size);
          elements.textX.value = String(Math.round(selection.transform.x));
          elements.textY.value = String(Math.round(selection.transform.y));
          elements.textScale.value = String(selection.transform.scale);
          elements.textScaleValue.textContent = Number(
            selection.transform.scale,
          ).toFixed(1);
          elements.textRotation.value = String(selection.transform.rotation);
          elements.textRotationValue.textContent = Number(
            selection.transform.rotation,
          ).toFixed(0);
        }
      },
      syncShortcutVisibility: function syncShortcutVisibility(visible) {
        if (elements.shortcutHud) {
          elements.shortcutHud.classList.toggle("hidden", !visible);
        }
      },
    };
  }

  function bindRange(input, output, decimals) {
    if (!input || !output) {
      return;
    }
    var sync = function sync() {
      output.textContent = Number(input.value).toFixed(decimals);
    };
    input.addEventListener("input", sync);
    sync();
  }

  function byId(id) {
    return document.getElementById(id);
  }

  SBE.Controls = {
    createControls,
  };
})(window);
