(function initControls(global) {
  const SBE = (global.SBE = global.SBE || {});

  function createControls() {
    const elements = {
      // Transport / tempo
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

      // Inspector fields
      activeNote: byId("active-note"),
      lineColor: byId("line-color"),
      lineThickness: byId("line-thickness"),
      lineThicknessValue: byId("line-thickness-value"),
      lineMechanic: byId("line-mechanic"),
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

      // Text inspector block (for show/hide)
      textInspectorBlock: byId("text-inspector-block"),

      // Actions
      duplicateSelection: byId("duplicate-selection"),
      deleteSelection: byId("delete-selection"),
      undoAction: byId("undo-action"),
      duplicatePattern: byId("duplicate-pattern"),
      gridCols: byId("grid-cols"),
      gridRows: byId("grid-rows"),
      gridSpacingX: byId("grid-spacing-x"),
      gridSpacingY: byId("grid-spacing-y"),

      // Ball
      ballCount: byId("ball-count"),
      ballCountValue: byId("ball-count-value"),
      ballSpeed: byId("ball-speed"),
      ballSpeedValue: byId("ball-speed-value"),
      ballSpread: byId("ball-spread"),
      ballSpreadValue: byId("ball-spread-value"),

      // Emitter
      emitterInspectorBlock: byId("emitter-inspector-block"),
      emitterRate: byId("emitter-rate"),
      emitterRateValue: byId("emitter-rate-value"),
      emitterVx: byId("emitter-vx"),
      emitterVxValue: byId("emitter-vx-value"),
      emitterVy: byId("emitter-vy"),
      emitterVyValue: byId("emitter-vy-value"),

      // Motion
      motionInspectorBlock: byId("motion-inspector-block"),
      motionEnabled: byId("motion-enabled"),
      motionVx: byId("motion-vx"),
      motionVxValue: byId("motion-vx-value"),
      motionVy: byId("motion-vy"),
      motionVyValue: byId("motion-vy-value"),
      motionRot: byId("motion-rot"),
      motionRotValue: byId("motion-rot-value"),
      motionLoop: byId("motion-loop"),

      // Button collections
      shapeButtons: Array.from(document.querySelectorAll(".shape-button")),
      toolButtons: Array.from(document.querySelectorAll(".tool")),
      noteCells: Array.from(document.querySelectorAll(".note-cell")),
      colorSwatches: Array.from(
        document.querySelectorAll(".swatch-grid .swatch"),
      ),

      // Shortcuts
      closeShortcuts: byId("close-shortcuts"),
      shortcutHud: byId("shortcut-hud"),

      // Tabs
      inspectorTabs: Array.from(
        document.querySelectorAll(".inspector-tabs .tab"),
      ),
      tabContents: Array.from(document.querySelectorAll(".tab-content")),
    };

    const noteElements = window.noteElements || (window.noteElements = {});
    elements.noteCells.forEach(function (slot) {
      const note = Number(slot.dataset.noteClass || 0) + 60;
      noteElements[note] = slot;
    });

    // Bind range → output sync
    bindRange(elements.textSize, elements.textSizeValue, 0);
    bindRange(elements.textScale, elements.textScaleValue, 1);
    bindRange(elements.textRotation, elements.textRotationValue, 0);
    bindRange(elements.lineThickness, elements.lineThicknessValue, 0);
    bindRange(elements.lineStrength, elements.lineStrengthValue, 1);
    bindRange(elements.ballCount, elements.ballCountValue, 0);
    bindRange(elements.ballSpeed, elements.ballSpeedValue, 1);
    bindRange(elements.ballSpread, elements.ballSpreadValue, 2);
    bindRange(elements.emitterRate, elements.emitterRateValue, 0);
    bindRange(elements.emitterVx, elements.emitterVxValue, 1);
    bindRange(elements.emitterVy, elements.emitterVyValue, 1);
    bindRange(elements.motionVx, elements.motionVxValue, 0);
    bindRange(elements.motionVy, elements.motionVyValue, 0);
    bindRange(elements.motionRot, elements.motionRotValue, 1);

    // Tab switching
    elements.inspectorTabs.forEach(function (tab) {
      tab.addEventListener("click", function onTabClick() {
        var tabId = tab.dataset.tab;
        elements.inspectorTabs.forEach(function (t) {
          t.classList.toggle("active", t.dataset.tab === tabId);
        });
        elements.tabContents.forEach(function (tc) {
          tc.classList.toggle("active", tc.dataset.tabContent === tabId);
        });
      });
    });

    return {
      elements: elements,
      syncState: function syncState(appState) {
        elements.bpmInput.value = Number(appState.bpm).toFixed(1);
        elements.barCount.value = String(appState.loop.bars);
        elements.quantizeEnabled.checked = !!appState.quantize.enabled;
        elements.quantizeDivision.value = String(appState.quantize.division);
        if (elements.transparentBg) {
          elements.transparentBg.checked = !!appState.ui.transparentBackground;
        }
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
      },
      syncShapeSelection: function syncShapeSelection(shapeId) {
        elements.shapeButtons.forEach(function (button) {
          button.classList.toggle("active", button.dataset.shape === shapeId);
        });
      },
      syncSelection: function syncSelection(selection, activeNoteClass) {
        var hasSelection = !!selection;

        // Show/hide text section
        if (elements.textInspectorBlock) {
          elements.textInspectorBlock.classList.toggle(
            "hidden",
            !selection || selection.type !== "text",
          );
        }

        if (!hasSelection) {
          return;
        }

        var note = selection.midi ? selection.midi.note : selection.note;
        if (
          typeof note !== "number" &&
          selection.segments &&
          selection.segments.length
        ) {
          note = selection.segments[0].note;
        }
        if (typeof note === "number") {
          elements.activeNote.value = String(note);
        }
        if (elements.lineMechanic) {
          var mechVal = selection.mechanicType;
          if (!mechVal && selection.segments && selection.segments.length) {
            mechVal = selection.segments[0].mechanicType;
          }
          elements.lineMechanic.value = mechVal || "none";
        }
        var selStyle = selection.style;
        var selBehavior = selection.behavior;
        if (!selStyle && selection.segments && selection.segments.length) {
          selStyle = { thickness: selection.segments[0].thickness };
        }
        if (!selBehavior && selection.segments && selection.segments.length) {
          selBehavior = selection.segments[0].behavior;
        }
        if (elements.lineThickness && selStyle) {
          elements.lineThickness.value = String(selStyle.thickness);
        }
        if (elements.lineThicknessValue && selStyle) {
          elements.lineThicknessValue.textContent = String(selStyle.thickness);
        }
        if (elements.lineBehavior && selBehavior) {
          elements.lineBehavior.value =
            selBehavior.type === "normal" ? "none" : selBehavior.type;
        }
        if (elements.lineStrength && selBehavior) {
          elements.lineStrength.value = String(selBehavior.strength);
        }
        if (elements.lineStrengthValue && selBehavior) {
          elements.lineStrengthValue.textContent =
            selBehavior.strength.toFixed(1);
        }

        if (selection.type === "text") {
          elements.textContent.value = selection.value;
          elements.textSize.value = String(selection.font.size);
          if (elements.textSizeValue) {
            elements.textSizeValue.textContent = String(selection.font.size);
          }
          elements.textX.value = String(Math.round(selection.transform.x));
          elements.textY.value = String(Math.round(selection.transform.y));
          elements.textScale.value = String(selection.transform.scale);
          if (elements.textScaleValue) {
            elements.textScaleValue.textContent = Number(
              selection.transform.scale,
            ).toFixed(1);
          }
          elements.textRotation.value = String(selection.transform.rotation);
          if (elements.textRotationValue) {
            elements.textRotationValue.textContent = Number(
              selection.transform.rotation,
            ).toFixed(0);
          }
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
    createControls: createControls,
  };
})(window);
