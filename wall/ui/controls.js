(function initControls(global) {
  const SBE = (global.SBE = global.SBE || {});

  function createControls() {
    const elements = {
      // Transport / tempo
      bpmInput: byId("bpm-input"),
      barCount: byId("bar-count"),
      quantizeEnabled: byId("quantize-enabled"),
      quantizeDivision: byId("quantize-division"),
      togglePlayback: byId("toggle-playback"),
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
      strokeWidth: byId("stroke-width"),
      strokeWidthValue: byId("stroke-width-value"),
      strokeWidthField: byId("stroke-width-field"),
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

      // Particle
      particleShape: byId("particle-shape"),
      particleTrail: byId("particle-trail"),

      // Behavior emitter fields
      behaviorEmitterFields: byId("behavior-emitter-fields"),
      // FLOW
      behaviorEmitterRate: byId("behavior-emitter-rate"),
      behaviorEmitterRateValue: byId("behavior-emitter-rate-value"),
      behaviorEmitterDensity: byId("behavior-emitter-density"),
      behaviorEmitterDensityValue: byId("behavior-emitter-density-value"),
      // MOTION
      behaviorEmitterDirection: byId("behavior-emitter-direction"),
      behaviorEmitterDirectionValue: byId("behavior-emitter-direction-value"),
      behaviorEmitterSpread: byId("behavior-emitter-spread"),
      behaviorEmitterSpreadValue: byId("behavior-emitter-spread-value"),
      behaviorEmitterSpeed: byId("behavior-emitter-speed"),
      behaviorEmitterSpeedValue: byId("behavior-emitter-speed-value"),
      // FORM
      behaviorEmitterSize: byId("behavior-emitter-size"),
      behaviorEmitterSizeValue: byId("behavior-emitter-size-value"),
      behaviorEmitterLife: byId("behavior-emitter-life"),
      behaviorEmitterLifeValue: byId("behavior-emitter-life-value"),
      behaviorEmitterStyle: byId("behavior-emitter-style"),

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

      // World
      worldMode: byId("world-mode"),
      worldStrength: byId("world-strength"),
      worldStrengthValue: byId("world-strength-value"),
      toggleHitCount: byId("toggle-hit-count"),

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
    bindRange(elements.strokeWidth, elements.strokeWidthValue, 0);
    bindRange(elements.lineStrength, elements.lineStrengthValue, 1);
    bindRange(elements.ballCount, elements.ballCountValue, 0);
    bindRange(elements.ballSpeed, elements.ballSpeedValue, 1);
    bindRange(elements.ballSpread, elements.ballSpreadValue, 2);
    bindRange(elements.motionVx, elements.motionVxValue, 0);
    bindRange(elements.motionVy, elements.motionVyValue, 0);
    bindRange(elements.motionRot, elements.motionRotValue, 1);
    bindRange(elements.worldStrength, elements.worldStrengthValue, 1);
    bindRange(
      elements.behaviorEmitterRate,
      elements.behaviorEmitterRateValue,
      0,
    );
    bindRange(
      elements.behaviorEmitterDensity,
      elements.behaviorEmitterDensityValue,
      0,
    );
    bindRange(
      elements.behaviorEmitterDirection,
      elements.behaviorEmitterDirectionValue,
      0,
    );
    bindRange(
      elements.behaviorEmitterSpread,
      elements.behaviorEmitterSpreadValue,
      0,
    );
    bindRange(
      elements.behaviorEmitterSpeed,
      elements.behaviorEmitterSpeedValue,
      0,
    );
    bindRange(
      elements.behaviorEmitterSize,
      elements.behaviorEmitterSizeValue,
      1,
    );
    bindRange(
      elements.behaviorEmitterLife,
      elements.behaviorEmitterLifeValue,
      1,
    );

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

        // Strokes and groups don't use the legacy inspector fields — exit safely
        if (selection.type === "stroke" || selection.type === "group") {
          return;
        }

        function safeNum(v, fallback) {
          return typeof v === "number" && isFinite(v) ? v : fallback || 0;
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
          elements.lineThickness.value = String(safeNum(selStyle.thickness, 3));
        }
        if (elements.lineThicknessValue && selStyle) {
          elements.lineThicknessValue.textContent = String(
            safeNum(selStyle.thickness, 3),
          );
        }
        if (elements.lineBehavior && selBehavior) {
          elements.lineBehavior.value =
            selBehavior.type === "normal" ? "none" : selBehavior.type || "none";
        }
        if (elements.lineStrength && selBehavior) {
          elements.lineStrength.value = String(
            safeNum(selBehavior.strength, 1),
          );
        }
        if (elements.lineStrengthValue && selBehavior) {
          elements.lineStrengthValue.textContent = safeNum(
            selBehavior.strength,
            1,
          ).toFixed(1);
        }

        if (selection.type === "text" && selection.transform) {
          if (elements.textContent)
            elements.textContent.value = selection.value || "";
          if (elements.textSize)
            elements.textSize.value = String(
              safeNum(selection.font && selection.font.size, 16),
            );
          if (elements.textSizeValue) {
            elements.textSizeValue.textContent = String(
              safeNum(selection.font && selection.font.size, 16),
            );
          }
          if (elements.textX)
            elements.textX.value = String(
              Math.round(safeNum(selection.transform.x)),
            );
          if (elements.textY)
            elements.textY.value = String(
              Math.round(safeNum(selection.transform.y)),
            );
          if (elements.textScale)
            elements.textScale.value = String(
              safeNum(selection.transform.scale, 1),
            );
          if (elements.textScaleValue) {
            elements.textScaleValue.textContent = safeNum(
              selection.transform.scale,
              1,
            ).toFixed(1);
          }
          if (elements.textRotation)
            elements.textRotation.value = String(
              safeNum(selection.transform.rotation),
            );
          if (elements.textRotationValue) {
            elements.textRotationValue.textContent = safeNum(
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
