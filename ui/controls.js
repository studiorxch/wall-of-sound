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
      inspector: byId("inspector"),
      ballPanel: byId("ball-panel"),
      shapePanel: byId("shape-panel"),
      textInspectorBlock: byId("text-inspector-block"),
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
      activeNote: byId("active-note"),
      noteCells: Array.from(document.querySelectorAll(".note-cell")),
      lineColor: byId("line-color"),
      colorSwatches: Array.from(document.querySelectorAll(".swatch")),
      lineThickness: byId("line-thickness"),
      lineThicknessValue: byId("line-thickness-value"),
      lineBehavior: byId("line-behavior"),
      lineStrength: byId("line-strength"),
      lineStrengthValue: byId("line-strength-value"),
      duplicateSelection: byId("duplicate-selection"),
      deleteSelection: byId("delete-selection"),
      undoAction: byId("undo-action"),
      ballCount: byId("ball-count"),
      ballCountValue: byId("ball-count-value"),
      ballSpeed: byId("ball-speed"),
      ballSpeedValue: byId("ball-speed-value"),
      ballSpread: byId("ball-spread"),
      ballSpreadValue: byId("ball-spread-value"),
      shapeButtons: Array.from(document.querySelectorAll(".shape-button")),
      closeShortcuts: byId("close-shortcuts"),
      shortcutHud: byId("shortcut-hud"),
      toolButtons: Array.from(document.querySelectorAll("[data-tool]")),
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
          ? "Recording"
          : appState.loop.armed
            ? "Armed"
            : appState.loop.playing
              ? "Looping"
              : appState.running
                ? "Running"
                : "Stopped";
        elements.sceneStats.textContent =
          appState.lines.length +
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
        elements.ballSpeedValue.textContent = Number(appState.ballTool.speed).toFixed(1);
        elements.ballSpread.value = String(appState.ballTool.spread);
        elements.ballSpreadValue.textContent = Number(appState.ballTool.spread).toFixed(2);
      },
      syncTool: function syncTool(tool) {
        elements.toolButtons.forEach((button) => {
          button.classList.toggle("active", button.dataset.tool === tool);
        });
        elements.ballPanel.classList.toggle("hidden", tool !== "ball");
        elements.shapePanel.classList.toggle("hidden", tool !== "shape");
      },
      syncShapeSelection: function syncShapeSelection(shapeId) {
        elements.shapeButtons.forEach((button) => {
          button.classList.toggle("active", button.dataset.shape === shapeId);
        });
      },
      syncSelection: function syncSelection(selection, activeNoteClass) {
        const shouldShowInspector =
          !!selection && (selection.type === "line" || selection.type === "text");
        elements.inspector.classList.toggle("hidden", !shouldShowInspector);
        elements.textInspectorBlock.classList.toggle(
          "hidden",
          !selection || selection.type !== "text",
        );

        elements.noteCells.forEach((button) => {
          button.classList.toggle(
            "active",
            Number(button.dataset.noteClass) === activeNoteClass,
          );
        });

        if (!shouldShowInspector) {
          return;
        }

        elements.activeNote.value = String(selection.midi.note);
        elements.lineColor.value = selection.style.color;
        elements.lineThickness.value = String(selection.style.thickness);
        elements.lineThicknessValue.textContent = String(selection.style.thickness);
        elements.lineBehavior.value =
          selection.behavior.type === "normal" ? "none" : selection.behavior.type;
        elements.lineStrength.value = String(selection.behavior.strength);
        elements.lineStrengthValue.textContent = selection.behavior.strength.toFixed(1);

        if (selection.type === "text") {
          elements.textContent.value = selection.value;
          elements.textSize.value = String(selection.font.size);
          elements.textSizeValue.textContent = String(selection.font.size);
          elements.textX.value = String(Math.round(selection.transform.x));
          elements.textY.value = String(Math.round(selection.transform.y));
          elements.textScale.value = String(selection.transform.scale);
          elements.textScaleValue.textContent = Number(selection.transform.scale).toFixed(1);
          elements.textRotation.value = String(selection.transform.rotation);
          elements.textRotationValue.textContent = Number(selection.transform.rotation).toFixed(0);
        }
      },
      syncShortcutVisibility: function syncShortcutVisibility(visible) {
        elements.shortcutHud.classList.toggle("hidden", !visible);
      },
    };
  }

  function bindRange(input, output, decimals) {
    const sync = function sync() {
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
