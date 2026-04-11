(function initMain(global) {
  const SBE = (global.SBE = global.SBE || {});
  const NOTE_NAMES = [
    "C",
    "C#",
    "D",
    "D#",
    "E",
    "F",
    "F#",
    "G",
    "G#",
    "A",
    "A#",
    "B",
  ];
  const NOTE_COLORS = {
    C: "#ff4b4b",
    "C#": "#ff6d39",
    D: "#ff9b1f",
    "D#": "#ffbf2f",
    E: "#e5df45",
    F: "#b9e54f",
    "F#": "#35cb68",
    G: "#26d3a6",
    "G#": "#2cc7dc",
    A: "#498cff",
    "A#": "#7a62ff",
    B: "#ff59cb",
  };
  const SHAPE_LIBRARY = {
    circle: function circle(center, size) {
      return [
        ellipsePoints(center.x, center.y, size * 0.5, size * 0.5, 20, true),
      ];
    },
    square: function square(center, size) {
      const half = size * 0.5;
      return [
        [
          { x: center.x - half, y: center.y - half },
          { x: center.x + half, y: center.y - half },
          { x: center.x + half, y: center.y + half },
          { x: center.x - half, y: center.y + half },
          { x: center.x - half, y: center.y - half },
        ],
      ];
    },
    triangle: function triangle(center, size) {
      const half = size * 0.55;
      return [
        [
          { x: center.x, y: center.y - half },
          { x: center.x + half, y: center.y + half },
          { x: center.x - half, y: center.y + half },
          { x: center.x, y: center.y - half },
        ],
      ];
    },
    "rounded-loop": function roundedLoop(center, size) {
      return [
        ellipsePoints(center.x, center.y, size * 0.58, size * 0.42, 18, true),
      ];
    },
    "zig-zag": function zigZag(center, size) {
      const width = size * 1.2;
      const height = size * 0.55;
      const points = [];
      for (let index = 0; index < 7; index += 1) {
        const t = index / 6;
        points.push({
          x: center.x - width * 0.5 + width * t,
          y: center.y + (index % 2 === 0 ? -height * 0.5 : height * 0.5),
        });
      }
      return [points];
    },
    sine: function sine(center, size) {
      const width = size * 1.35;
      const amplitude = size * 0.25;
      const points = [];
      for (let index = 0; index <= 18; index += 1) {
        const t = index / 18;
        points.push({
          x: center.x - width * 0.5 + width * t,
          y: center.y + Math.sin(t * Math.PI * 2) * amplitude,
        });
      }
      return [points];
    },
    straight: function straight(center, size) {
      return [
        [
          { x: center.x - size * 0.65, y: center.y },
          { x: center.x + size * 0.65, y: center.y },
        ],
      ];
    },
    "x-form": function xForm(center, size) {
      const half = size * 0.52;
      return [
        [
          { x: center.x - half, y: center.y - half },
          { x: center.x + half, y: center.y + half },
        ],
        [
          { x: center.x + half, y: center.y - half },
          { x: center.x - half, y: center.y + half },
        ],
      ];
    },
    "v-form": function vForm(center, size) {
      const half = size * 0.55;
      return [
        [
          { x: center.x - half, y: center.y - half },
          { x: center.x, y: center.y + half },
          { x: center.x + half, y: center.y - half },
        ],
      ];
    },
    "l-form": function lForm(center, size) {
      const half = size * 0.55;
      return [
        [
          { x: center.x - half, y: center.y - half },
          { x: center.x - half, y: center.y + half },
          { x: center.x + half, y: center.y + half },
        ],
      ];
    },
    "m-form": function mForm(center, size) {
      const half = size * 0.58;
      return [
        [
          { x: center.x - half, y: center.y + half },
          { x: center.x - half, y: center.y - half },
          { x: center.x, y: center.y + half * 0.1 },
          { x: center.x + half, y: center.y - half },
          { x: center.x + half, y: center.y + half },
        ],
      ];
    },
    "c-form": function cForm(center, size) {
      const points = [];
      const radius = size * 0.52;
      for (let index = 2; index <= 14; index += 1) {
        const angle = (index / 16) * Math.PI * 2;
        points.push({
          x: center.x + Math.cos(angle) * radius,
          y: center.y + Math.sin(angle) * radius,
        });
      }
      return [points];
    },
  };

  global.addEventListener("DOMContentLoaded", async function onReady() {
    let isPlaying = false;
    let loopId = null;
    let lastFrameTime = 0;
    let frameAccumulator = 0;
    const canvas = document.getElementById("engine-canvas");
    const canvasWrap = document.getElementById("canvas-wrap");
    canvas.width = 1080;
    canvas.height = 1920;
    const renderer = new SBE.CanvasRenderer(canvas);
    const midiOut = new SBE.MidiOut();
    const controls = SBE.Controls.createControls();
    let textEditor = null;
    let textUpdateTimer = 0;

    // ── Event Bus ────────────────────────────────────────
    const eventBus = new SBE.EventBus();

    // ── Oscillator Output ────────────────────────────────
    const oscillatorOutput = {
      enabled: true,
      handle: function handleOscillator(type, sourceObject) {
        var context = state.audio.context;
        if (!context) {
          return;
        }
        if (context.state === "suspended") {
          context.resume().catch(function () {});
          return;
        }

        const sound = sourceObject.sound;
        const freq =
          typeof sound.frequency === "number" ? sound.frequency : 220;
        const volume = typeof sound.volume === "number" ? sound.volume : 0.1;
        const duration =
          typeof sound.duration === "number" ? sound.duration : 0.05;
        const now = context.currentTime;

        const oscillator = context.createOscillator();
        const gain = context.createGain();

        oscillator.type = "triangle";
        oscillator.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(
          Math.max(0.0008, volume),
          now + 0.008,
        );
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(now);
        oscillator.stop(now + duration + 0.02);
      },
    };

    // ── MIDI Output ──────────────────────────────────────
    const midiOutput = {
      enabled: true,
      handle: function handleMidi(type, sourceObject) {
        const sound = sourceObject.sound;

        if (!sound.midi) {
          return;
        }

        const channel =
          typeof sound.midi.channel === "number" ? sound.midi.channel : 1;
        const note = typeof sound.midi.note === "number" ? sound.midi.note : 60;
        const velocity =
          typeof sound.midi.velocity === "number" ? sound.midi.velocity : 80;

        midiOut.sendNote(channel, note, velocity);
      },
    };

    eventBus.registerOutput(oscillatorOutput);
    eventBus.registerOutput(midiOutput);

    // ── Wall Sound Source ────────────────────────────────
    const wallSoundSource = {
      sound: {
        enabled: true,
        event: "wall",
        frequency: 120,
        volume: 0.04,
        duration: 0.03,
        cooldownMs: 30,
        midi: null,
      },
    };

    const state = {
      running: false,
      bpm: 120,
      quantize: {
        enabled: false,
        division: 0.25,
      },
      quantizeQueue: [],
      canvas: { width: 1080, height: 1920 },
      swarm: {
        count: 24,
        speed: 1.4,
        randomness: 0.22,
        collisionRadius: 6,
        renderRadius: 14,
        ballStyle: "core",
        radius: 6,
        color: "#f3f2ef",
      },
      balls: [],
      lines: [],
      shapes: [],
      textObjects: [],
      backgroundDataUrl: null,
      backgroundImage: null,
      collisionMemory: new Map(),
      tool: "select",
      selectedShape: "circle",
      selectedLineId: null,
      selectedTextId: null,
      selectedBallId: null,
      selectedShapeId: null,
      selectedSegmentId: null,
      multiSelection: [],
      ui: {
        cleanOutput: false,
        presentation:
          new URLSearchParams(global.location.search).get("mode") === "present",
        shortcutsVisible: false,
        transparentBackground: false,
      },
      ballTool: {
        count: 1,
        speed: 1,
        spread: 0.15,
      },
      loop: {
        bars: 8,
        armed: false,
        recording: false,
        hasLoop: false,
        playing: false,
        startTime: 0,
        endTime: 0,
        duration: 0,
        events: [],
        cycleStartTime: 0,
        lastPlaybackPosition: 0,
        exportBusy: false,
      },
      transport: {
        elapsedBeforeRun: 0,
        startedAt: 0,
      },
      history: [],
      textDraft: {
        fontFile: "",
        fontName: "",
      },
      audio: {
        context: null,
      },
      defaults: {
        midiChannel: 1,
        note: 60,
        color: noteToColor(60),
        thickness: 5,
        behaviorType: "normal",
        behaviorStrength: 1.4,
        textValue: "SWARM",
        textSize: 160,
        textScale: 1,
        textRotation: 0,
      },
    };

    var heldKeys = new Set();

    normalizeSwarmConfig();
    renderer.resize(state.canvas.width, state.canvas.height);

    const drawTools = SBE.DrawTools.createDrawTools(canvas, state, {
      onTranslateSelection: function onTranslateSelection(dx, dy) {
        translateSelection(dx, dy);
      },
      onEraseBall: function (ball) {
        state.balls = state.balls.filter((b) => b.id !== ball.id);
        renderFrame();
      },
      getDraftColor: function getDraftColor() {
        return noteToColor(state.defaults.note);
      },
      getDraftThickness: function getDraftThickness() {
        return state.defaults.thickness;
      },
      onCreateFreehand: function onCreateFreehand(points) {
        createFreehandStroke(points);
        renderFrame();
      },
      onCreateShapeAt: function onCreateShapeAt(point) {
        createShapeAt(point);
      },
      onCreateTextAt: function onCreateTextAt(point) {
        beginCanvasTextInput(point);
      },
      onSpawnBall: function onSpawnBall(startPoint, endPoint) {
        spawnBallBurst(startPoint, endPoint);
      },
      onSelectLine: function onSelectLine(line) {
        selectObject("line", line.id);
      },
      onSelectText: function onSelectText(textObject) {
        selectObject("text", textObject.id);
      },
      onSelectBall: function onSelectBall(ball) {
        selectObject("ball", ball.id);
      },
      onSelectShape: function onSelectShape(shape) {
        selectObject("shape", shape.id);
      },
      onSelectSegment: function onSelectSegment(shape, segment) {
        state.multiSelection = [
          { type: "shape", id: shape.id, segmentId: segment.id },
        ];
        syncLegacySelection();
        syncSelectionPanel();
        renderFrame();
      },
      onDoubleClickShape: function onDoubleClickShape(shape) {
        shape.isExpanded = !shape.isExpanded;
        renderFrame();
      },
      onClearSelection: function onClearSelection() {
        clearSelection();
      },
      onOverlayChange: function onOverlayChange() {
        renderFrame();
      },
    });

    global.addEventListener(
      "pointerdown",
      function initAudioOnGesture() {
        ensureAudioContext();
      },
      { once: true },
    );

    // ── Handle Interaction (capture phase, runs before drawTools) ──
    var handleDragMode = null;
    var handleLastPoint = null;

    function getCanvasCoordsLocal(e) {
      var rect = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) * (canvas.width / rect.width),
        y: (e.clientY - rect.top) * (canvas.height / rect.height),
      };
    }

    function getSelectedShapeForHandle() {
      if (!state.selectedShapeId || state.selectedSegmentId) {
        return null;
      }
      var shape = (state.shapes || []).find(function (s) {
        return s.id === state.selectedShapeId;
      });
      return shape && shape.bounds ? shape : null;
    }

    function getHandlePositions(shape) {
      var b = shape.bounds;
      var pad = 14;
      var x = b.minX - pad;
      var y = b.minY - pad;
      var w = b.width + pad * 2;
      var h = b.height + pad * 2;
      return {
        corners: [
          [x, y],
          [x + w, y],
          [x, y + h],
          [x + w, y + h],
        ],
        rotate: [x + w * 0.5, y - 18],
      };
    }

    canvas.addEventListener(
      "pointerdown",
      function onHandleDown(e) {
        if (state.tool !== "select") {
          return;
        }

        var shape = getSelectedShapeForHandle();
        if (!shape) {
          return;
        }

        var pt = getCanvasCoordsLocal(e);
        var handles = getHandlePositions(shape);
        var hitRadius = 20;

        // Check rotate handle
        var rd = Math.hypot(pt.x - handles.rotate[0], pt.y - handles.rotate[1]);
        if (rd <= hitRadius) {
          handleDragMode = "rotate";
          handleLastPoint = pt;
          canvas.setPointerCapture(e.pointerId);
          e.stopPropagation();
          return;
        }

        // Check corner handles
        for (var i = 0; i < handles.corners.length; i += 1) {
          var cd = Math.hypot(
            pt.x - handles.corners[i][0],
            pt.y - handles.corners[i][1],
          );
          if (cd <= hitRadius) {
            handleDragMode = "scale";
            handleLastPoint = pt;
            canvas.setPointerCapture(e.pointerId);
            e.stopPropagation();
            return;
          }
        }
      },
      true,
    );

    canvas.addEventListener(
      "pointermove",
      function onHandleMove(e) {
        if (!handleDragMode || !handleLastPoint) {
          return;
        }

        var shape = getSelectedShapeForHandle();
        if (!shape) {
          handleDragMode = null;
          return;
        }

        var pt = getCanvasCoordsLocal(e);
        var dx = pt.x - handleLastPoint.x;
        handleLastPoint = pt;

        if (handleDragMode === "rotate") {
          SBE.ShapeSystem.rotateShape(shape, dx * 0.01);
        } else if (handleDragMode === "scale") {
          SBE.ShapeSystem.scaleShape(shape, 1 + dx * 0.01);
        }

        renderFrame();
        e.stopPropagation();
      },
      true,
    );

    canvas.addEventListener(
      "pointerup",
      function onHandleUp(e) {
        if (handleDragMode) {
          handleDragMode = null;
          handleLastPoint = null;
          e.stopPropagation();
        }
      },
      true,
    );

    bindControls();
    await applyExampleScene();
    updateCanvasAspect();
    setViewClasses();
    syncUI();
    updatePanels(state.tool);
    renderFrame();

    function bindControls() {
      const elements = controls.elements;

      elements.recordLoop.addEventListener("click", function recordLoop() {
        ensureAudioContext();
        armLoopRecording();
      });

      elements.stopLoop.addEventListener("click", function stopLoop() {
        cancelLoopRecording();
      });

      elements.clearScene.addEventListener("click", function clearSceneClick() {
        clearScene();
      });

      elements.exportLoop.addEventListener(
        "click",
        async function exportLoop() {
          await exportAllOutputs();
        },
      );

      elements.retakeLoop.addEventListener("click", function retakeLoop() {
        clearLoop();
        armLoopRecording();
      });

      elements.loadExample.addEventListener(
        "click",
        async function loadExample() {
          await applyExampleScene();
        },
      );

      elements.bpmInput.addEventListener("input", function updateBpm() {
        state.bpm = clampBpm(Number(elements.bpmInput.value));
        syncUI();
      });

      elements.barCount.addEventListener("change", function updateBars() {
        state.loop.bars = clampInt(Number(elements.barCount.value), 8, 32);
        syncUI();
      });

      elements.quantizeEnabled.addEventListener(
        "change",
        function toggleQuantize() {
          const wasEnabled = state.quantize.enabled;
          state.quantize.enabled = elements.quantizeEnabled.checked;
          if (wasEnabled && !state.quantize.enabled) {
            flushQuantizeQueue();
          }
        },
      );

      elements.quantizeDivision.addEventListener(
        "change",
        function updateQuantizeDivision() {
          state.quantize.division =
            Number(elements.quantizeDivision.value) || 0.25;
        },
      );

      elements.transparentBg.addEventListener(
        "change",
        function toggleTransparentBackground() {
          state.ui.transparentBackground = elements.transparentBg.checked;
          renderFrame();
        },
      );

      elements.saveScene.addEventListener("click", function saveScene() {
        SBE.SceneManager.downloadScene(state, "sbe-scene");
      });

      elements.sceneFile.addEventListener(
        "change",
        async function openScene(event) {
          const file = event.target.files && event.target.files[0];
          event.target.value = "";
          if (!file) {
            return;
          }

          try {
            pushHistory();
            await applyScene(await SBE.SceneManager.loadFromFile(file));
          } catch (error) {
            controls.elements.engineStatus.textContent = "Open failed";
          }
        },
      );

      elements.textFontFile.addEventListener(
        "change",
        async function loadFont(event) {
          const file = event.target.files && event.target.files[0];
          event.target.value = "";
          if (!file) {
            return;
          }

          try {
            state.textDraft.fontFile = await readFileAsDataUrl(file);
            state.textDraft.fontName = file.name;
            elements.textFontStatus.textContent = "Loaded font: " + file.name;
          } catch (error) {
            controls.elements.engineStatus.textContent = "Font failed";
          }
        },
      );

      elements.backgroundFile.addEventListener(
        "change",
        async function loadBackground(event) {
          const file = event.target.files && event.target.files[0];
          event.target.value = "";
          if (!file) {
            return;
          }

          try {
            pushHistory();
            state.backgroundDataUrl = await readFileAsDataUrl(file);
            state.backgroundImage = await loadImage(state.backgroundDataUrl);
            renderFrame();
          } catch (error) {
            controls.elements.engineStatus.textContent = "BG failed";
          }
        },
      );

      elements.toolButtons.forEach((button) => {
        button.addEventListener("click", function chooseTool() {
          if (state.ui.presentation) {
            return;
          }
          state.tool = button.dataset.tool;
          controls.syncTool(state.tool);
          updatePanels(state.tool);

          if (state.tool !== "text") {
            removeCanvasTextInput(false);
          }
        });
      });

      elements.shapeButtons.forEach((button) => {
        button.addEventListener("click", function chooseShape() {
          state.selectedShape = button.dataset.shape;
          controls.syncShapeSelection(state.selectedShape);
        });
      });

      elements.noteCells.forEach((cell) => {
        cell.addEventListener("click", function chooseNoteClass() {
          applyNoteClass(Number(cell.dataset.noteClass));
        });
      });

      elements.lineBehavior.addEventListener(
        "change",
        function updateBehaviorType() {
          applyInspectorMetadata();
        },
      );

      if (elements.lineMechanic) {
        elements.lineMechanic.addEventListener(
          "change",
          function updateMechanicType() {
            applyInspectorMetadata();
          },
        );
      }

      elements.lineStrength.addEventListener(
        "input",
        function updateBehaviorStrength() {
          applyInspectorMetadata(false);
        },
      );

      elements.lineThickness.addEventListener(
        "input",
        function updateThickness() {
          applyInspectorMetadata(false);
        },
      );

      elements.lineColor.addEventListener("input", function syncDisplayColor() {
        const nextNote = findClosestNoteForColor(elements.lineColor.value);
        if (nextNote !== null) {
          applyNoteClass(nextNote % 12, Math.floor(state.defaults.note / 12));
        }
      });

      elements.colorSwatches.forEach((swatch) => {
        swatch.addEventListener("click", function syncSwatchColor() {
          const nextNote = findClosestNoteForColor(swatch.dataset.color);
          if (nextNote !== null) {
            applyNoteClass(nextNote % 12, Math.floor(state.defaults.note / 12));
          }
        });
      });

      elements.textContent.addEventListener(
        "input",
        function updateTextContent() {
          state.defaults.textValue = elements.textContent.value;
          scheduleSelectedTextRefresh();
        },
      );

      elements.textSize.addEventListener("input", function updateTextSize() {
        state.defaults.textSize = clampInt(
          Number(elements.textSize.value),
          24,
          420,
        );
        scheduleSelectedTextRefresh();
      });

      elements.textX.addEventListener("input", function updateTextX() {
        applySelectedTextTransform({ x: Number(elements.textX.value) });
      });

      elements.textY.addEventListener("input", function updateTextY() {
        applySelectedTextTransform({ y: Number(elements.textY.value) });
      });

      elements.textScale.addEventListener("input", function updateTextScale() {
        applySelectedTextTransform({ scale: Number(elements.textScale.value) });
      });

      elements.textRotation.addEventListener(
        "input",
        function updateTextRotation() {
          applySelectedTextTransform({
            rotation: Number(elements.textRotation.value),
          });
        },
      );

      elements.centerText.addEventListener("click", function centerText() {
        centerSelectedText();
      });

      elements.duplicateSelection.addEventListener(
        "click",
        async function duplicateSelection() {
          await duplicateSelectedObject();
        },
      );

      elements.deleteSelection.addEventListener(
        "click",
        function deleteSelection() {
          deleteSelectionObject();
        },
      );

      elements.undoAction.addEventListener(
        "click",
        async function undoAction() {
          await undo();
        },
      );

      if (elements.duplicatePattern) {
        elements.duplicatePattern.addEventListener(
          "click",
          async function onDuplicatePattern() {
            await duplicatePatternGrid();
          },
        );
      }

      elements.ballCount.addEventListener("input", function updateBallCount() {
        state.ballTool.count = clampInt(Number(elements.ballCount.value), 1, 8);
      });

      elements.ballSpeed.addEventListener("input", function updateBallSpeed() {
        state.ballTool.speed = clamp(Number(elements.ballSpeed.value), 0.4, 3);
      });

      elements.ballSpread.addEventListener(
        "input",
        function updateBallSpread() {
          state.ballTool.spread = clamp(
            Number(elements.ballSpread.value),
            0,
            1,
          );
        },
      );

      elements.closeShortcuts.addEventListener(
        "click",
        function closeShortcuts() {
          toggleShortcuts(false);
        },
      );

      global.addEventListener("keydown", async function onKeyDown(event) {
        heldKeys.add(event.key.toLowerCase());

        if (textEditor && event.key === "Escape") {
          event.preventDefault();
          removeCanvasTextInput(false);
          return;
        }

        if (isTypingTarget(event.target)) {
          return;
        }

        if (event.key === "Tab") {
          event.preventDefault();
          togglePresentationMode();
          return;
        }

        if (event.key === "?") {
          event.preventDefault();
          toggleShortcuts();
          return;
        }

        if (event.key.toLowerCase() === "v") {
          state.tool = "select";
          syncUI();
          return;
        }
        if (event.key.toLowerCase() === "d") {
          if (event.metaKey || event.ctrlKey) {
            event.preventDefault();
            await duplicateSelectedObject();
            return;
          }
          state.tool = "draw";
          syncUI();
          updatePanels(state.tool);
          return;
        }
        if (
          event.key.toLowerCase() === "s" &&
          !(event.metaKey || event.ctrlKey)
        ) {
          state.tool = "shape";
          syncUI();
          updatePanels(state.tool);
          return;
        }
        if (event.key.toLowerCase() === "t") {
          state.tool = "text";
          syncUI();
          updatePanels(state.tool);
          return;
        }
        if (event.key.toLowerCase() === "b") {
          state.tool = "ball";
          syncUI();
          return;
        }

        if (event.key === "Delete" || event.key === "Backspace") {
          event.preventDefault();
          deleteSelectionObject();
          return;
        }

        const modifier = event.metaKey || event.ctrlKey;
        if (!modifier) {
          return;
        }

        if (event.key.toLowerCase() === "z") {
          event.preventDefault();
          await undo();
        }

        if (event.key.toLowerCase() === "a") {
          event.preventDefault();
          selectAllObjects();
        }
      });

      global.addEventListener("keyup", function onKeyUp(event) {
        heldKeys.delete(event.key.toLowerCase());
      });
    }

    function selectAllObjects() {
      if (state.ui.presentation) return;

      state.multiSelection = [];

      (state.shapes || []).forEach(function (s) {
        state.multiSelection.push({ type: "shape", id: s.id });
      });

      (state.balls || []).forEach(function (b) {
        state.multiSelection.push({ type: "ball", id: b.id });
      });

      (state.lines || []).forEach(function (l) {
        state.multiSelection.push({ type: "line", id: l.id });
      });

      syncLegacySelection();
      syncSelectionPanel();
      renderFrame();
    }

    async function applyExampleScene() {
      await applyScene(SBE.ExampleScene);
      resetTransportClock();
      setRunning(true);
      syncUI();
    }

    async function applyScene(scene) {
      const lines = (scene.lines || []).map((line) =>
        normalizeLineObject(SBE.LineSystem.hydrateLine(line)),
      );
      const texts = await SBE.TextSystem.hydrateTextObjects(
        scene.textObjects || [],
      );
      state.lines = lines;
      state.textObjects = texts.map(normalizeTextObject);
      state.shapes =
        SBE.ShapeSystem && Array.isArray(scene.shapes)
          ? scene.shapes.map(SBE.ShapeSystem.hydrateShape)
          : [];
      state.canvas.width = 1080;
      state.canvas.height = 1920;
      state.swarm = Object.assign({}, state.swarm, scene.swarm || {});
      normalizeSwarmConfig();
      state.balls = Array.isArray(scene.balls)
        ? scene.balls.map(normalizeBall)
        : [];
      if (!state.balls.length) {
        SBE.Swarm.syncSwarmCount(state, true);
        state.balls = state.balls.map(normalizeBall);
      }
      state.backgroundDataUrl = scene.background || null;
      state.backgroundImage = state.backgroundDataUrl
        ? await loadImage(state.backgroundDataUrl)
        : null;
      renderer.resize(state.canvas.width, state.canvas.height);
      updateCanvasAspect();
      clearSelection();
      clearLoop();
      resetTransportClock();
      syncUI();
      renderFrame();
    }

    function updateCanvasAspect() {
      canvasWrap.style.aspectRatio =
        state.canvas.width + " / " + state.canvas.height;
    }

    function syncUI() {
      controls.syncState(state);
      controls.syncTool(state.tool);
      controls.syncShapeSelection(state.selectedShape);
      syncSelectionPanel();
      controls.syncShortcutVisibility(state.ui.shortcutsVisible);
    }

    function updatePanels() {
      // Panel visibility is now handled by the fixed layout — no-op
    }

    function syncSelectionPanel() {
      const selection = getSelectedObject();
      const activeNote = selection
        ? (selection.midi ? selection.midi.note : selection.note) ||
          state.defaults.note
        : state.defaults.note;
      controls.syncSelection(selection, ((activeNote % 12) + 12) % 12);
    }

    function getSelectedObject() {
      if (state.multiSelection.length === 1) {
        return resolveSelectionEntry(state.multiSelection[0]);
      }
      if (state.multiSelection.length > 1) {
        return resolveSelectionEntry(state.multiSelection[0]);
      }
      return null;
    }

    function resolveSelectionEntry(entry) {
      if (!entry) return null;
      if (entry.type === "ball") {
        return (
          state.balls.find(function (b) {
            return b.id === entry.id;
          }) || null
        );
      }
      if (entry.type === "shape") {
        var shape = (state.shapes || []).find(function (s) {
          return s.id === entry.id;
        });
        if (!shape) return null;
        if (entry.segmentId) {
          var seg = shape.segments.find(function (s) {
            return s.id === entry.segmentId;
          });
          return seg || shape;
        }
        return shape;
      }
      if (entry.type === "line") {
        return (
          state.lines.find(function (l) {
            return l.id === entry.id;
          }) || null
        );
      }
      if (entry.type === "text") {
        return (
          state.textObjects.find(function (t) {
            return t.id === entry.id;
          }) || null
        );
      }
      return null;
    }

    function getSelectedObjects() {
      var results = [];
      state.multiSelection.forEach(function (entry) {
        var obj = resolveSelectionEntry(entry);
        if (obj) results.push({ entry: entry, object: obj });
      });
      return results;
    }

    function isInSelection(type, id) {
      return state.multiSelection.some(function (e) {
        return e.type === type && e.id === id;
      });
    }

    function syncLegacySelection() {
      var first = state.multiSelection[0];
      state.selectedBallId = first && first.type === "ball" ? first.id : null;
      state.selectedLineId = first && first.type === "line" ? first.id : null;
      state.selectedTextId = first && first.type === "text" ? first.id : null;
      state.selectedShapeId = first && first.type === "shape" ? first.id : null;
      state.selectedSegmentId =
        first && first.segmentId ? first.segmentId : null;
      syncShapeIdSet();
    }

    function selectObject(type, id) {
      var isShift = heldKeys.has("shift");

      if (isShift) {
        var existingIndex = state.multiSelection.findIndex(function (e) {
          return e.type === type && e.id === id;
        });
        if (existingIndex >= 0) {
          state.multiSelection.splice(existingIndex, 1);
        } else {
          state.multiSelection.push({ type: type, id: id });
        }
      } else {
        if (!isInSelection(type, id)) {
          state.multiSelection = [{ type: type, id: id }];
        }
      }

      syncLegacySelection();

      var selected = getSelectedObject();
      if (selected && selected.midi) {
        state.defaults.note = selected.midi.note;
      }
      syncSelectionPanel();
      renderFrame();
    }

    function clearSelection() {
      state.multiSelection = [];
      syncLegacySelection();
      syncSelectionPanel();
      renderFrame();
    }

    function syncShapeIdSet() {
      var shapeIds = state.multiSelection
        .filter(function (e) {
          return e.type === "shape";
        })
        .map(function (e) {
          return e.id;
        });
      if (shapeIds.length) {
        state.selectedShapeIds = new Set(shapeIds);
      } else {
        state.selectedShapeIds = null;
      }
    }

    function createFreehandStroke(points) {
      if (state.ui.presentation) {
        return;
      }

      const simplified = simplifyPoints(points, 4);
      const smoothed = smoothStroke(simplified, 2);
      const segments = pointsToSegments(smoothed);
      if (!segments.length) {
        return;
      }

      createSegmentsBatch(segments);
    }

    function createShapeAt(point) {
      if (state.ui.presentation) {
        return;
      }

      if (!SBE.ShapeSystem) {
        return;
      }

      pushHistory();
      const shapeFactory =
        SHAPE_LIBRARY[state.selectedShape] || SHAPE_LIBRARY.circle;
      const paths = shapeFactory(point, 240);
      const smoothedPaths = paths.map(function (path) {
        return smoothStroke(path, 1);
      });
      const settings = createLineSettingsFromInspector();
      var shape = SBE.ShapeSystem.createShapeFromPoints(
        state.selectedShape,
        smoothedPaths,
        point,
        settings,
      );

      if (shape) {
        shape.segments.forEach(function (seg) {
          seg.sound = buildSoundConfig(seg.note, seg.midiChannel);
        });
        state.shapes.push(shape);
        selectObject("shape", shape.id);
      }

      syncUI();
      renderFrame();
    }

    function createSegmentsBatch(segments) {
      pushHistory();
      const settings = createLineSettingsFromInspector();
      let lastId = null;

      segments.forEach((segment) => {
        const length = Math.hypot(
          segment.x2 - segment.x1,
          segment.y2 - segment.y1,
        );

        if (length < 2) return;

        const line = normalizeLineObject(
          SBE.LineSystem.createLine(segment, settings),
        );

        state.lines.push(line);
        lastId = line.id;
      });

      if (lastId) {
        selectObject("line", lastId);
      }

      syncUI();
      renderFrame();
    }

    function beginCanvasTextInput(point) {
      if (state.ui.presentation) {
        return;
      }

      if (!state.textDraft.fontFile) {
        controls.elements.engineStatus.textContent = "Load font first";
        return;
      }

      removeCanvasTextInput(false);
      const rect = canvas.getBoundingClientRect();
      const elAspect = rect.width / rect.height;
      const cvAspect = canvas.width / canvas.height;
      let cLeft, cTop, cWidth, cHeight;
      if (cvAspect > elAspect) {
        cWidth = rect.width;
        cHeight = rect.width / cvAspect;
        cLeft = rect.left;
        cTop = rect.top + (rect.height - cHeight) * 0.5;
      } else {
        cHeight = rect.height;
        cWidth = rect.height * cvAspect;
        cLeft = rect.left + (rect.width - cWidth) * 0.5;
        cTop = rect.top;
      }
      const input = document.createElement("input");
      input.type = "text";
      input.value = state.defaults.textValue || "";
      input.placeholder = "Type";
      input.className = "canvas-text-input";
      input.style.position = "fixed";
      input.style.left = cLeft + (point.x / canvas.width) * cWidth - 10 + "px";
      input.style.top = cTop + (point.y / canvas.height) * cHeight - 18 + "px";
      input.style.zIndex = "60";
      input.style.minWidth = "180px";
      input.style.padding = "10px 12px";
      input.style.borderRadius = "12px";
      input.style.border = "1px solid rgba(255,255,255,0.14)";
      input.style.background = "rgba(12,14,18,0.92)";
      input.style.color = "#eff2f6";
      input.style.font =
        '600 18px Inter, "Helvetica Neue", Helvetica, Arial, sans-serif';

      input.addEventListener("keydown", function onInputKeyDown(event) {
        if (event.key === "Enter") {
          event.preventDefault();
          removeCanvasTextInput(true, point);
        }
        if (event.key === "Escape") {
          event.preventDefault();
          removeCanvasTextInput(false);
        }
      });

      input.addEventListener("blur", function onBlur() {
        removeCanvasTextInput(true, point);
      });

      document.body.appendChild(input);
      input.focus();
      input.select();
      textEditor = {
        element: input,
        point,
      };
    }

    async function removeCanvasTextInput(commit, fallbackPoint) {
      if (!textEditor) {
        return;
      }

      const editor = textEditor;
      textEditor = null;
      const value = editor.element.value.trim();
      editor.element.remove();

      if (commit && value) {
        await createTextAt(fallbackPoint || editor.point, value);
      }
    }

    async function createTextAt(point, value) {
      if (state.ui.presentation) {
        return;
      }

      pushHistory();
      state.defaults.textValue = value;
      const textSettings = createTextSettings(point, value);
      const textObject = normalizeTextObject(
        await SBE.TextSystem.createTextObject(
          textSettings,
          createLineSettingsFromInspector(),
        ),
      );
      state.textObjects.push(textObject);
      selectObject("text", textObject.id);
      syncUI();
    }

    async function updateSelectedText() {
      const selected = getSelectedObject();
      if (!selected || selected.type !== "text") {
        return;
      }

      await SBE.TextSystem.updateTextObject(
        selected,
        createTextSettings(
          { x: selected.transform.x, y: selected.transform.y },
          controls.elements.textContent.value,
        ),
        createLineSettingsFromInspector(),
      );
      normalizeTextObject(selected);
      syncUI();
      renderFrame();
    }

    function scheduleSelectedTextRefresh() {
      if (textUpdateTimer) {
        global.clearTimeout(textUpdateTimer);
      }

      textUpdateTimer = global.setTimeout(function flushTextUpdate() {
        textUpdateTimer = 0;
        updateSelectedText().catch(function ignoreUpdateError() {});
      }, 120);
    }

    function centerSelectedText() {
      const selected = getSelectedObject();
      if (!selected || selected.type !== "text") {
        return;
      }

      pushHistory();
      SBE.TextSystem.centerTextObject(selected, state.canvas);
      syncUI();
      renderFrame();
    }

    function applySelectedTextTransform(patch) {
      const selected = getSelectedObject();
      if (!selected || selected.type !== "text") {
        return;
      }

      SBE.TextSystem.applyTransform(selected, patch, state.canvas, 22);
      syncUI();
      renderFrame();
    }

    function spawnBallBurst(startPoint, endPoint) {
      if (state.ui.presentation) {
        return;
      }

      pushHistory();
      const balls = createSpawnBurst(startPoint, endPoint);
      state.balls.push.apply(state.balls, balls);
      state.swarm.count = state.balls.length;
      if (balls[balls.length - 1]) {
        selectObject("ball", balls[balls.length - 1].id);
      }
      syncUI();
    }

    function translateSelection(dx, dy) {
      if (state.ui.presentation || !state.multiSelection.length) {
        return;
      }

      state.multiSelection.forEach(function (entry) {
        translateOneEntry(entry, dx, dy);
      });
      renderFrame();
    }

    function translateOneEntry(entry, dx, dy) {
      if (entry.type === "ball") {
        var ball = state.balls.find(function (b) {
          return b.id === entry.id;
        });
        if (ball) {
          ball.x += dx;
          ball.y += dy;
        }
        return;
      }

      if (entry.type === "shape" && SBE.ShapeSystem) {
        var shape = (state.shapes || []).find(function (s) {
          return s.id === entry.id;
        });
        if (!shape) return;
        if (entry.segmentId) {
          var seg = shape.segments.find(function (s) {
            return s.id === entry.segmentId;
          });
          if (seg) {
            seg.x1 += dx;
            seg.y1 += dy;
            seg.x2 += dx;
            seg.y2 += dy;
          }
        } else if (heldKeys.has("r")) {
          SBE.ShapeSystem.rotateShape(shape, dx * 0.01);
        } else if (heldKeys.has("s")) {
          SBE.ShapeSystem.scaleShape(shape, 1 + dx * 0.01);
        } else {
          SBE.ShapeSystem.translateShape(shape, dx, dy);
        }
        return;
      }

      if (entry.type === "line") {
        var line = state.lines.find(function (l) {
          return l.id === entry.id;
        });
        if (line) {
          line.x1 += dx;
          line.y1 += dy;
          line.x2 += dx;
          line.y2 += dy;
        }
        return;
      }

      if (entry.type === "text") {
        var text = state.textObjects.find(function (t) {
          return t.id === entry.id;
        });
        if (text && text.transform) {
          SBE.TextSystem.applyTransform(
            text,
            { x: text.transform.x + dx, y: text.transform.y + dy },
            state.canvas,
            22,
          );
        }
      }
    }

    function deleteSelectionObject() {
      if (!state.multiSelection.length || state.ui.presentation) {
        return;
      }

      pushHistory();
      var ballIds = new Set();
      var shapeIds = new Set();
      var lineIds = new Set();
      var textIds = new Set();

      state.multiSelection.forEach(function (entry) {
        if (entry.type === "ball") ballIds.add(entry.id);
        else if (entry.type === "shape") shapeIds.add(entry.id);
        else if (entry.type === "line") lineIds.add(entry.id);
        else if (entry.type === "text") textIds.add(entry.id);
      });

      if (ballIds.size) {
        state.balls = state.balls.filter(function (b) {
          return !ballIds.has(b.id);
        });
        state.swarm.count = state.balls.length;
      }
      if (shapeIds.size) {
        state.shapes = state.shapes.filter(function (s) {
          return !shapeIds.has(s.id);
        });
      }
      if (lineIds.size) {
        state.lines = state.lines.filter(function (l) {
          return !lineIds.has(l.id);
        });
      }
      if (textIds.size) {
        state.textObjects = state.textObjects.filter(function (t) {
          return !textIds.has(t.id);
        });
      }

      clearSelection();
      syncUI();
    }

    var lastDuplicateDelta = { x: 20, y: 20 };

    function duplicateOneEntry(entry, dx, dy) {
      if (entry.type === "ball") {
        var src = state.balls.find(function (b) {
          return b.id === entry.id;
        });
        if (!src) return null;
        var copy = normalizeBall(clone(src));
        copy.id = createBallId();
        copy.x += dx;
        copy.y += dy;
        state.balls.push(copy);
        return { type: "ball", id: copy.id };
      }
      if (entry.type === "shape" && SBE.ShapeSystem) {
        var src = (state.shapes || []).find(function (s) {
          return s.id === entry.id;
        });
        if (!src) return null;
        var copy = SBE.ShapeSystem.duplicateShape(src, 0);
        SBE.ShapeSystem.translateShape(copy, dx, dy);
        copy.segments.forEach(function (seg) {
          rebuildSoundConfig(seg);
        });
        state.shapes.push(copy);
        return { type: "shape", id: copy.id };
      }
      if (entry.type === "line") {
        var src = state.lines.find(function (l) {
          return l.id === entry.id;
        });
        if (!src) return null;
        var raw = serializeLineObject(src);
        raw.id = undefined;
        raw.x1 += dx;
        raw.y1 += dy;
        raw.x2 += dx;
        raw.y2 += dy;
        var line = normalizeLineObject(SBE.LineSystem.hydrateLine(raw));
        state.lines.push(line);
        return { type: "line", id: line.id };
      }
      return null;
    }

    async function duplicateSelectedObject() {
      if (!state.multiSelection.length || state.ui.presentation) return;
      var dx = lastDuplicateDelta.x;
      var dy = lastDuplicateDelta.y;
      pushHistory();
      var newSelection = [];
      state.multiSelection.forEach(function (entry) {
        var result = duplicateOneEntry(entry, dx, dy);
        if (result) newSelection.push(result);
      });
      state.multiSelection = newSelection;
      syncLegacySelection();
      lastDuplicateDelta = { x: dx, y: dy };
      state.swarm.count = state.balls.length;
      syncSelectionPanel();
      renderFrame();
      syncUI();
    }

    function getSelectionBounds() {
      var minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      state.multiSelection.forEach(function (entry) {
        var obj = resolveSelectionEntry(entry);
        if (!obj) return;
        if (obj.bounds) {
          minX = Math.min(minX, obj.bounds.minX);
          minY = Math.min(minY, obj.bounds.minY);
          maxX = Math.max(maxX, obj.bounds.maxX);
          maxY = Math.max(maxY, obj.bounds.maxY);
        } else if (typeof obj.x === "number") {
          var r = obj.renderRadius || obj.radius || 10;
          minX = Math.min(minX, obj.x - r);
          minY = Math.min(minY, obj.y - r);
          maxX = Math.max(maxX, obj.x + r);
          maxY = Math.max(maxY, obj.y + r);
        } else if (typeof obj.x1 === "number") {
          minX = Math.min(minX, obj.x1, obj.x2);
          minY = Math.min(minY, obj.y1, obj.y2);
          maxX = Math.max(maxX, obj.x1, obj.x2);
          maxY = Math.max(maxY, obj.y1, obj.y2);
        }
      });
      return {
        minX: minX,
        minY: minY,
        width: maxX - minX,
        height: maxY - minY,
      };
    }

    async function duplicatePatternGrid() {
      if (!state.multiSelection.length || state.ui.presentation) return;
      var cols = clampInt(Number(controls.elements.gridCols.value), 1, 20);
      var rows = clampInt(Number(controls.elements.gridRows.value), 1, 20);
      var gapX = Number(controls.elements.gridSpacingX.value) || 120;
      var gapY = Number(controls.elements.gridSpacingY.value) || 120;
      var bounds = getSelectionBounds();
      var stepX = bounds.width + gapX;
      var stepY = bounds.height + gapY;
      pushHistory();
      var entries = state.multiSelection.slice();
      for (var gy = 0; gy < rows; gy += 1) {
        for (var gx = 0; gx < cols; gx += 1) {
          if (gx === 0 && gy === 0) continue;
          entries.forEach(function (entry) {
            duplicateOneEntry(entry, gx * stepX, gy * stepY);
          });
        }
      }
      state.swarm.count = state.balls.length;
      syncUI();
      renderFrame();
    }

    async function undo() {
      const snapshot = state.history.pop();
      if (!snapshot) {
        return;
      }
      await applyScene(snapshot);
    }

    function pushHistory() {
      state.history.push({
        lines: state.lines.map(serializeLineObject),
        textObjects: state.textObjects.map(SBE.TextSystem.serializeTextObject),
        shapes: SBE.ShapeSystem
          ? state.shapes.map(SBE.ShapeSystem.serializeShape)
          : [],
        balls: clone(state.balls),
        canvas: clone(state.canvas),
        swarm: clone(state.swarm),
        background: state.backgroundDataUrl,
      });
      if (state.history.length > 40) {
        state.history.shift();
      }
    }

    function applyInspectorMetadata(pushToHistory) {
      if (!state.multiSelection.length) {
        state.defaults = readInspectorDefaults();
        syncUI();
        return;
      }

      var hasEditable = state.multiSelection.some(function (e) {
        return e.type !== "ball";
      });
      if (!hasEditable) {
        state.defaults = readInspectorDefaults();
        syncUI();
        return;
      }

      if (pushToHistory !== false) {
        pushHistory();
      }

      var patch = readInspectorPatch();

      state.multiSelection.forEach(function (entry) {
        var obj = resolveSelectionEntry(entry);
        if (obj) applyPatchToOneEntry(entry, obj, patch);
      });

      syncUI();
      renderFrame();
    }

    function readInspectorPatch() {
      var mechanicValue = controls.elements.lineMechanic
        ? controls.elements.lineMechanic.value
        : "none";
      return {
        note: clampInt(Number(controls.elements.activeNote.value), 0, 127),
        thickness: clampInt(
          Number(controls.elements.lineThickness.value),
          1,
          24,
        ),
        mechanicType: mechanicValue === "none" ? null : mechanicValue,
        behaviorType:
          controls.elements.lineBehavior.value === "none"
            ? "normal"
            : controls.elements.lineBehavior.value,
        behaviorStrength: Number(controls.elements.lineStrength.value),
      };
    }

    function readInspectorDefaults() {
      const patch = readInspectorPatch();
      return {
        midiChannel: state.defaults.midiChannel,
        note: patch.note,
        color: noteToColor(patch.note),
        thickness: patch.thickness,
        behaviorType: patch.behaviorType,
        behaviorStrength: patch.behaviorStrength,
        textValue: controls.elements.textContent.value,
        textSize: clampInt(Number(controls.elements.textSize.value), 24, 420),
        textScale: Number(controls.elements.textScale.value),
        textRotation: Number(controls.elements.textRotation.value),
      };
    }

    function applyPatchToOneEntry(entry, object, patch) {
      var newColor = noteToColor(patch.note);

      if (entry.type === "shape") {
        var shape = (state.shapes || []).find(function (s) {
          return s.id === entry.id;
        });
        if (shape) {
          shape.segments.forEach(function (seg) {
            seg.note = patch.note;
            seg.color = newColor;
            seg.thickness = patch.thickness;
            seg.behavior.type = patch.behaviorType;
            seg.behavior.strength = patch.behaviorStrength;
            seg.mechanicType = patch.mechanicType;
            rebuildSoundConfig(seg);
          });
          shape.mechanicType = patch.mechanicType;
        }
        return;
      }

      if (entry.type === "line") {
        if (object.midi) {
          object.midi.note = patch.note;
          object.midiChannel = object.midi.channel;
        }
        object.note = patch.note;
        if (object.style) {
          object.style.color = newColor;
          object.style.thickness = patch.thickness;
        }
        object.color = newColor;
        object.thickness = patch.thickness;
        if (object.behavior) {
          object.behavior.type = patch.behaviorType;
          object.behavior.strength = patch.behaviorStrength;
        }
        object.mechanicType = patch.mechanicType;
        rebuildSoundConfig(object);
        return;
      }

      if (entry.type === "ball") {
        object.color = newColor;
        return;
      }
    }

    function applyNoteClass(noteClass, octaveHint) {
      const selected = getSelectedObject();
      const baseNote =
        selected && selected.midi ? selected.midi.note : state.defaults.note;
      const octave =
        typeof octaveHint === "number" ? octaveHint : Math.floor(baseNote / 12);
      const note = clampInt(octave * 12 + noteClass, 0, 127);
      state.defaults.note = note;
      controls.elements.activeNote.value = String(note);
      controls.elements.lineColor.value = noteToColor(note);
      applyInspectorMetadata();
    }

    // ── Sound Config Builder ─────────────────────────────

    function buildSoundConfig(note, midiChannel) {
      return {
        enabled: true,
        event: "collision",
        frequency: 440 * Math.pow(2, (note - 69) / 12),
        volume: 0.1,
        duration: 0.18,
        cooldownMs: 72,
        midi: {
          channel: midiChannel,
          note: note,
          velocity: 80,
        },
      };
    }

    function rebuildSoundConfig(object) {
      const note = object.midi ? object.midi.note : object.note || 60;
      const channel = object.midi
        ? object.midi.channel
        : object.midiChannel || 1;
      object.sound = buildSoundConfig(note, channel);
    }

    // ── Event Dispatch ───────────────────────────────────

    function dispatchCollisionEvent(sourceObject) {
      if (!isPlaying) {
        return;
      }

      const currentTime = getTransportTime();

      if (!state.quantize.enabled) {
        eventBus.triggerEvent("collision", sourceObject);
        recordLoopEvent(sourceObject, currentTime);
        return;
      }

      const gridTime = getQuantizeGridTime();
      const nextTime = Math.ceil(currentTime / gridTime) * gridTime;
      state.quantizeQueue.push({
        time: nextTime,
        sourceObject: sourceObject,
      });
    }

    function processQuantizeQueue() {
      if (!isPlaying) {
        return;
      }

      if (!state.quantizeQueue.length) {
        return;
      }

      const now = getTransportTime();
      const remaining = [];
      state.quantizeQueue.forEach((entry) => {
        if (entry.time <= now) {
          eventBus.triggerEvent("collision", entry.sourceObject);
          recordLoopEvent(entry.sourceObject, entry.time);
          return;
        }
        remaining.push(entry);
      });
      state.quantizeQueue = remaining;
    }

    function flushQuantizeQueue() {
      state.quantizeQueue = [];
    }

    // ── Loop Recording / Playback ────────────────────────

    function recordLoopEvent(sourceObject, scheduledTime) {
      if (!state.loop.recording) {
        return;
      }

      const relativeTime = scheduledTime - state.loop.startTime;
      if (relativeTime < 0 || relativeTime > state.loop.duration) {
        return;
      }

      // Store a snapshot of the sound config for replay
      state.loop.events.push({
        time: relativeTime,
        sound: clone(sourceObject.sound),
      });
    }

    function processLoopPlayback(nowSeconds) {
      if (!state.loop.playing || !state.loop.hasLoop || !state.loop.duration) {
        return;
      }

      const elapsed = nowSeconds - state.loop.cycleStartTime;
      if (elapsed < 0) {
        return;
      }

      const previous = state.loop.lastPlaybackPosition;
      const current = mod(elapsed, state.loop.duration);
      const wrapped = elapsed >= state.loop.duration && current < previous;

      state.loop.events.forEach((event) => {
        let shouldPlay = false;

        if (wrapped) {
          shouldPlay = event.time >= previous || event.time < current;
        } else {
          shouldPlay = event.time >= previous && event.time < current;
        }

        if (shouldPlay) {
          // Replay through the event bus using the stored sound snapshot
          const replaySource = { sound: event.sound };
          eventBus.triggerEvent(event.sound.event, replaySource);
        }
      });

      state.loop.lastPlaybackPosition = current;
    }

    function armLoopRecording() {
      if (!state.running) {
        setRunning(true);
      }

      clearLoopEvents();
      const beatDuration = getBeatDuration();
      const currentBeat = getTransportTime() / beatDuration;
      const startBeat = Math.floor(currentBeat / 4 + 1) * 4;
      state.loop.duration = state.loop.bars * 4 * beatDuration;
      state.loop.startTime = startBeat * beatDuration;
      state.loop.endTime = state.loop.startTime + state.loop.duration;
      state.loop.armed = true;
      state.loop.recording = false;
      state.loop.playing = false;
      state.loop.hasLoop = false;
      state.loop.lastPlaybackPosition = 0;
      syncUI();
    }

    function cancelLoopRecording() {
      state.loop.armed = false;
      state.loop.recording = false;
      state.loop.playing = false;
      state.quantizeQueue = [];
      stopPlayback();
      syncUI();
    }

    function clearScene() {
      state.lines = [];
      state.shapes = [];
      state.textObjects = [];
      state.balls = [];
      clearLoop();
      clearSelection();
      state.swarm.count = 0;
      drawTools.finishPath();
      sendAllNotesOff();
      renderFrame();
      syncUI();
    }

    function clearLoop() {
      clearLoopEvents();
      state.loop.armed = false;
      state.loop.recording = false;
      state.loop.playing = false;
      state.loop.hasLoop = false;
      state.loop.duration = 0;
      state.loop.lastPlaybackPosition = 0;
      syncUI();
    }

    function clearLoopEvents() {
      state.loop.events = [];
      state.loop.cycleStartTime = 0;
    }

    function updateLoopLifecycle(nowSeconds) {
      if (state.loop.armed && nowSeconds >= state.loop.startTime) {
        state.loop.armed = false;
        state.loop.recording = true;
        state.loop.events = [];
        syncUI();
      }

      if (state.loop.recording && nowSeconds >= state.loop.endTime) {
        state.loop.recording = false;
        state.loop.hasLoop = state.loop.events.length > 0;
        state.loop.playing = state.loop.hasLoop;
        state.loop.cycleStartTime = state.loop.endTime;
        state.loop.lastPlaybackPosition = 0;
        syncUI();
      }
    }

    function createLineSettingsFromInspector() {
      const defaults = readInspectorDefaults();
      return {
        midiChannel: defaults.midiChannel,
        note: defaults.note,
        velocityRange: [48, 110],
        life: 9999,
        behavior: {
          type: defaults.behaviorType,
          strength: defaults.behaviorStrength,
          velocityMultiplier: 1,
        },
        color: noteToColor(defaults.note),
        thickness: defaults.thickness,
        style: {
          color: noteToColor(defaults.note),
          colorMode: "auto",
          thickness: defaults.thickness,
        },
        gravity: {
          enabled: false,
          direction: "down",
          strength: 0,
        },
      };
    }

    function createTextSettings(point, value) {
      return {
        value: value || state.defaults.textValue,
        font: {
          file: state.textDraft.fontFile,
          name: state.textDraft.fontName || "Uploaded font",
          size: clampInt(Number(controls.elements.textSize.value), 24, 420),
        },
        transform: {
          x: point.x,
          y: point.y,
          scale: Number(controls.elements.textScale.value),
          rotation: Number(controls.elements.textRotation.value),
        },
        interaction: {
          mode: "letter",
        },
      };
    }

    function togglePlayback() {
      if (isPlaying) {
        stopPlayback();
      } else {
        startPlayback();
      }
    }

    function startPlayback() {
      if (isPlaying) {
        return;
      }

      ensureAudioContext();
      isPlaying = true;
      state.running = true;
      state.transport.startedAt = performance.now();
      lastFrameTime = 0;
      frameAccumulator = 0;
      loop();
      syncUI();
    }

    function stopPlayback() {
      if (!isPlaying && !loopId) {
        sendAllNotesOff();
        state.running = false;
        state.transport.startedAt = 0;
        state.quantizeQueue = [];
        renderFrame();
        syncUI();
        return;
      }

      state.transport.elapsedBeforeRun = getTransportTime();
      isPlaying = false;
      state.running = false;
      state.transport.startedAt = 0;
      state.quantizeQueue = [];

      if (loopId) {
        global.cancelAnimationFrame(loopId);
        loopId = null;
      }

      sendAllNotesOff();
      renderFrame();
      syncUI();
    }

    function sendAllNotesOff() {
      midiOut.sendAllNotesOff();
    }

    function loop(now) {
      if (!isPlaying) {
        return;
      }

      const frameTime = typeof now === "number" ? now : performance.now();
      if (!lastFrameTime) {
        lastFrameTime = frameTime;
      }

      const delta = Math.min(40, frameTime - lastFrameTime);
      lastFrameTime = frameTime;
      frameAccumulator += delta;
      const stepMs = 1000 / 60;
      const transportTime = getTransportTime();
      updateLoopLifecycle(transportTime);
      processQuantizeQueue();
      processLoopPlayback(transportTime);

      while (frameAccumulator >= stepMs) {
        tick((stepMs / 1000) * (state.bpm / 120), frameTime);
        frameAccumulator -= stepMs;
      }

      renderFrame();
      loopId = global.requestAnimationFrame(loop);
    }

    function tick(dt, now) {
      if (!isPlaying) {
        return;
      }

      const activeForceLines = state.lines
        .concat(
          SBE.TextSystem
            ? SBE.TextSystem.getCollisionLines(state.textObjects || [])
            : [],
        )
        .concat(
          SBE.ShapeSystem && state.shapes
            ? SBE.ShapeSystem.getCollisionSegments(state.shapes)
            : [],
        );
      SBE.EnginePhysics.applyForces(
        state.balls,
        activeForceLines,
        state.swarm,
        dt,
      );
      SBE.EnginePhysics.updateSwarm(state.balls, dt);

      const collisions = SBE.Collision.detectCollisions(state, now);
      const soundSources = SBE.Collision.resolveCollisions(
        state,
        collisions,
        now,
      );

      // Wall bounce events
      collisions.forEach(function (collision) {
        if (collision.type === "wall") {
          eventBus.triggerEvent("wall", wallSoundSource);
        }
      });

      // Collision events — dispatch through event bus
      soundSources.forEach(function (source) {
        if (source.line && source.line.sound) {
          dispatchCollisionEvent(source.line);
        }
      });

      stabilizeBalls(collisions);
    }

    function renderFrame() {
      renderer.render(state, drawTools.getOverlays());
      drawShapeIndicators();
    }

    function drawShapeIndicators() {
      if (
        !state.selectedShapeId ||
        state.ui.cleanOutput ||
        state.ui.presentation
      ) {
        return;
      }

      var shape = (state.shapes || []).find(function (s) {
        return s.id === state.selectedShapeId;
      });
      if (!shape || !shape.bounds) {
        return;
      }

      var b = shape.bounds;
      if (b.width <= 0 && b.height <= 0) {
        return;
      }

      var ctx = canvas.getContext("2d");
      var pad = 14;
      var x = b.minX - pad;
      var y = b.minY - pad;
      var w = b.width + pad * 2;
      var h = b.height + pad * 2;

      // Corner dots
      ctx.save();
      ctx.fillStyle = "#ffffff";
      ctx.globalAlpha = 0.9;
      var corners = [
        [x, y],
        [x + w, y],
        [x, y + h],
        [x + w, y + h],
      ];
      corners.forEach(function (c) {
        ctx.beginPath();
        ctx.arc(c[0], c[1], 4, 0, Math.PI * 2);
        ctx.fill();
      });

      // Rotation handle (top center)
      var handleX = x + w * 0.5;
      var handleY = y - 18;
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(handleX, y);
      ctx.lineTo(handleX, handleY);
      ctx.stroke();
      ctx.fillStyle = "#3dd8c5";
      ctx.beginPath();
      ctx.arc(handleX, handleY, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    function setRunning(nextRunning) {
      if (!!isPlaying === !!nextRunning) {
        return;
      }
      if (nextRunning) {
        startPlayback();
      } else {
        stopPlayback();
      }
    }

    function resetTransportClock() {
      state.transport.elapsedBeforeRun = 0;
      state.transport.startedAt = isPlaying ? performance.now() : 0;
      state.quantizeQueue = [];
    }

    function getTransportTime() {
      if (!isPlaying || !state.transport.startedAt) {
        return state.transport.elapsedBeforeRun;
      }

      return (
        state.transport.elapsedBeforeRun +
        (performance.now() - state.transport.startedAt) / 1000
      );
    }

    function getBeatDuration() {
      return 60 / Math.max(1, state.bpm);
    }

    function getQuantizeGridTime() {
      return getBeatDuration() * 4 * state.quantize.division;
    }

    function ensureAudioContext() {
      if (state.audio.context) {
        if (state.audio.context.state === "suspended") {
          state.audio.context.resume().catch(function ignoreResumeError() {});
        }
        return state.audio.context;
      }

      if (!global.AudioContext && !global.webkitAudioContext) {
        return null;
      }

      const AudioCtor = global.AudioContext || global.webkitAudioContext;
      state.audio.context = new AudioCtor();
      return state.audio.context;
    }

    function getExportDurationSec() {
      return ((state.loop.bars * 60) / Math.max(1, state.bpm)) * 4;
    }

    async function exportAllOutputs() {
      if (state.loop.exportBusy) {
        return;
      }

      state.loop.exportBusy = true;
      controls.elements.engineStatus.textContent = "Exporting";

      var durationSec = getExportDurationSec();
      console.log("Export duration (expected):", durationSec.toFixed(3) + "s");

      try {
        SBE.SceneManager.downloadScene(state, "sbe-loop");
        await exportImage();
        if (state.loop.hasLoop) {
          await exportVideo(durationSec);
          await exportAudio(durationSec);
        }
      } finally {
        state.loop.exportBusy = false;
        syncUI();
      }
    }

    async function exportImage() {
      const blob = await new Promise((resolve) => {
        canvas.toBlob(resolve, "image/png");
      });
      if (!blob) {
        return;
      }
      downloadBlob(blob, "sbe-frame.png");
    }

    async function exportVideo(durationSec) {
      if (!canvas.captureStream || !global.MediaRecorder) {
        return;
      }

      var TARGET_FPS = 30;
      var FRAME_DURATION = 1000 / TARGET_FPS;
      var durationMs = durationSec * 1000;

      var stream = canvas.captureStream(TARGET_FPS);

      var mimeType = "video/webm;codecs=vp9";
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = "video/webm";
      }

      var recorder = new MediaRecorder(stream, {
        mimeType: mimeType,
        videoBitsPerSecond: 5000000,
      });
      var chunks = [];
      recorder.addEventListener("dataavailable", function onData(event) {
        if (event.data && event.data.size) {
          chunks.push(event.data);
        }
      });

      var done = new Promise(function (resolve) {
        recorder.addEventListener("stop", function onStop() {
          resolve();
        });
      });

      recorder.start();

      var startTime = performance.now();

      await new Promise(function (resolve) {
        var lastFrame = startTime;

        function captureLoop(now) {
          if (now - startTime >= durationMs) {
            recorder.stop();
            resolve();
            return;
          }

          if (now - lastFrame >= FRAME_DURATION) {
            renderFrame();
            lastFrame = now;
          }

          global.requestAnimationFrame(captureLoop);
        }

        global.requestAnimationFrame(captureLoop);
      });

      await done;
      stream.getTracks().forEach(function (track) {
        track.stop();
      });

      if (chunks.length) {
        var blob = new Blob(chunks, { type: mimeType });
        downloadBlob(blob, "sbe-loop.webm");

        // Debug: log actual video duration
        var url = URL.createObjectURL(blob);
        var video = document.createElement("video");
        video.preload = "metadata";
        video.onloadedmetadata = function () {
          console.log(
            "Video duration (actual):",
            video.duration.toFixed(3) + "s",
          );
          URL.revokeObjectURL(url);
        };
        video.src = url;
      }
    }

    async function exportAudio(durationSec) {
      if (
        !state.loop.hasLoop ||
        !state.loop.events.length ||
        !global.OfflineAudioContext
      ) {
        return;
      }

      var sampleRate = 48000;
      var totalSamples = Math.ceil(sampleRate * durationSec);
      var offline = new OfflineAudioContext(2, totalSamples, sampleRate);

      state.loop.events.forEach(function (event) {
        var sound = event.sound;
        if (!sound || !sound.enabled) {
          return;
        }

        var freq = typeof sound.frequency === "number" ? sound.frequency : 220;
        var volume = typeof sound.volume === "number" ? sound.volume : 0.1;
        var dur = typeof sound.duration === "number" ? sound.duration : 0.18;

        if (event.time >= durationSec) {
          return;
        }

        var oscillator = offline.createOscillator();
        var gain = offline.createGain();

        oscillator.type = "triangle";
        oscillator.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, event.time);
        gain.gain.exponentialRampToValueAtTime(
          Math.max(0.0008, volume),
          event.time + 0.008,
        );
        gain.gain.exponentialRampToValueAtTime(0.0001, event.time + dur);

        oscillator.connect(gain);
        gain.connect(offline.destination);
        oscillator.start(event.time);
        oscillator.stop(event.time + dur + 0.02);
      });

      var buffer = await offline.startRendering();
      downloadBlob(encodeWav(buffer), "sbe-loop.wav");
      console.log("Audio duration (actual):", buffer.duration.toFixed(3) + "s");
    }

    function normalizeSwarmConfig() {
      state.swarm.collisionRadius = clamp(
        Number(state.swarm.collisionRadius || state.swarm.radius || 6),
        2,
        18,
      );
      state.swarm.renderRadius = clamp(
        Number(
          state.swarm.renderRadius || state.swarm.collisionRadius * 2.3 || 14,
        ),
        state.swarm.collisionRadius,
        28,
      );
      state.swarm.ballStyle = state.swarm.ballStyle || "core";
      state.swarm.radius = state.swarm.collisionRadius;
    }

    function normalizeBall(ball) {
      ball.id = ball.id || createBallId();
      ball.collisionRadius = clamp(
        Number(
          ball.collisionRadius ||
            ball.radius ||
            state.swarm.collisionRadius ||
            6,
        ),
        2,
        18,
      );
      ball.renderRadius = clamp(
        Number(ball.renderRadius || ball.collisionRadius * 2.3),
        ball.collisionRadius,
        28,
      );
      ball.radius = ball.collisionRadius;
      ball.style = ball.style || state.swarm.ballStyle || "core";
      ball.energy = Number.isFinite(ball.energy) ? ball.energy : 1;
      ball.collisionCount = 0;
      return ball;
    }

    function createSpawnBurst(startPoint, endPoint) {
      const count = clampInt(state.ballTool.count, 1, 8);
      const dx = endPoint.x - startPoint.x;
      const dy = endPoint.y - startPoint.y;
      const baseAngle = Math.atan2(dy, dx || 0.0001);
      const magnitude = Math.hypot(dx, dy);
      const baseSpeed = Math.min(
        420,
        Math.max(60, magnitude * 3 * state.ballTool.speed),
      );
      const spawnDistance = baseSpeed / 3;
      const balls = [];

      for (let index = 0; index < count; index += 1) {
        const spreadOffset =
          count === 1
            ? 0
            : ((index / (count - 1)) * 2 - 1) * state.ballTool.spread;
        const angle = baseAngle + spreadOffset;
        const ball = SBE.Swarm.spawnBall(
          state.canvas,
          state.swarm,
          startPoint,
          {
            x: startPoint.x + Math.cos(angle) * spawnDistance,
            y: startPoint.y + Math.sin(angle) * spawnDistance,
          },
        );
        balls.push(normalizeBall(ball));
      }

      return balls;
    }

    function stabilizeBalls(collisions) {
      const counts = new Map();
      collisions.forEach((collision) => {
        if (collision && collision.ball) {
          counts.set(
            collision.ball.id,
            (counts.get(collision.ball.id) || 0) + 1,
          );
        }
      });

      state.balls.forEach((ball) => {
        ball.radius = ball.collisionRadius;
        ball.vx = clamp(ball.vx, -720, 720);
        ball.vy = clamp(ball.vy, -720, 720);
        ball.collisionCount = counts.get(ball.id) || 0;

        if (ball.collisionCount > 3) {
          ball.vx += (Math.random() - 0.5) * 18;
          ball.vy += (Math.random() - 0.5) * 18;
        }
      });
    }

    function setViewClasses() {
      document.body.classList.toggle("presentation", state.ui.presentation);
    }

    function togglePresentationMode() {
      state.ui.presentation = !state.ui.presentation;
      setViewClasses();
      syncUI();
      renderFrame();
    }

    function toggleShortcuts(force) {
      state.ui.shortcutsVisible =
        typeof force === "boolean" ? force : !state.ui.shortcutsVisible;
      controls.syncShortcutVisibility(state.ui.shortcutsVisible);
    }

    function normalizeLineObject(line) {
      if (!line.x1 && line.segment) {
        line.x1 = Number(line.x1);
        line.y1 = Number(line.y1);
        line.x2 = Number(line.x2);
        line.y2 = Number(line.y2);
      }
      line.type = "line";
      line.style = line.style || {};
      line.midi = line.midi || {};
      line.behavior = line.behavior || {};
      line.gravity = line.gravity || {};
      line.midi.note =
        typeof line.midi.note === "number" ? line.midi.note : line.note || 60;
      line.midi.channel =
        typeof line.midi.channel === "number"
          ? line.midi.channel
          : line.midiChannel || 1;
      line.style.color = line.color || noteToColor(line.midi.note);
      line.style.thickness = line.thickness || 5;
      line.behavior.type = line.behavior.type || "normal";
      line.behavior.strength =
        typeof line.behavior.strength === "number"
          ? line.behavior.strength
          : 1.4;
      line.color = line.style.color;
      line.thickness = line.style.thickness;
      line.note = line.midi.note;
      line.midiChannel = line.midi.channel;
      line.mechanicType = line.mechanicType || null;
      if (!line.interaction) {
        line.interaction = {
          highlightColor: "#ffffff",
          duration: 140,
        };
      }

      // Build sound config from note/channel
      line.sound = buildSoundConfig(line.midi.note, line.midi.channel);

      return line;
    }

    function normalizeTextObject(textObject) {
      textObject.type = "text";
      textObject.style = textObject.style || {};
      textObject.midi = textObject.midi || {};
      textObject.behavior = textObject.behavior || {};
      textObject.gravity = textObject.gravity || {};
      textObject.midi.note =
        typeof textObject.midi.note === "number"
          ? textObject.midi.note
          : textObject.note || 60;
      textObject.midi.channel =
        typeof textObject.midi.channel === "number"
          ? textObject.midi.channel
          : textObject.midiChannel || 1;
      textObject.style.color =
        textObject.color || noteToColor(textObject.midi.note);
      textObject.style.thickness = textObject.thickness || 5;
      textObject.color = textObject.style.color;
      textObject.thickness = textObject.style.thickness;
      textObject.note = textObject.midi.note;
      textObject.midiChannel = textObject.midi.channel;
      textObject.behavior.type = textObject.behavior.type || "normal";
      textObject.behavior.strength =
        typeof textObject.behavior.strength === "number"
          ? textObject.behavior.strength
          : 1.4;

      // Build sound config from note/channel
      textObject.sound = buildSoundConfig(
        textObject.midi.note,
        textObject.midi.channel,
      );

      return textObject;
    }

    function serializeLineObject(line) {
      return {
        id: line.id,
        x1: line.x1,
        y1: line.y1,
        x2: line.x2,
        y2: line.y2,
        color: line.color,
        thickness: line.thickness,
        midiChannel: line.midiChannel,
        note: line.note,
        velocityRange: [48, 110],
        life: line.life,
        behavior: {
          type: line.behavior.type,
          strength: line.behavior.strength,
          velocityMultiplier: 1,
        },
        style: clone(line.style),
        midi: clone(line.midi),
        gravity: clone(line.gravity),
        mechanicType: line.mechanicType || null,
      };
    }
  });

  function simplifyPoints(points, threshold) {
    if (points.length <= 2) {
      return points.slice();
    }

    const result = [points[0]];
    let last = points[0];
    for (let index = 1; index < points.length - 1; index += 1) {
      if (
        Math.hypot(points[index].x - last.x, points[index].y - last.y) >=
        threshold
      ) {
        result.push(points[index]);
        last = points[index];
      }
    }
    result.push(points[points.length - 1]);
    return result;
  }

  function smoothStroke(points, iterations) {
    let current = points.slice();
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      if (current.length < 3) {
        return current;
      }

      const next = [current[0]];
      for (let index = 0; index < current.length - 1; index += 1) {
        const p0 = current[index];
        const p1 = current[index + 1];
        next.push({
          x: p0.x * 0.75 + p1.x * 0.25,
          y: p0.y * 0.75 + p1.y * 0.25,
        });
        next.push({
          x: p0.x * 0.25 + p1.x * 0.75,
          y: p0.y * 0.25 + p1.y * 0.75,
        });
      }
      next.push(current[current.length - 1]);
      current = next;
    }
    return current;
  }

  function pointsToSegments(points) {
    const segments = [];
    for (let index = 0; index < points.length - 1; index += 1) {
      segments.push({
        x1: points[index].x,
        y1: points[index].y,
        x2: points[index + 1].x,
        y2: points[index + 1].y,
      });
    }
    return segments;
  }

  function ellipsePoints(cx, cy, rx, ry, steps, closed) {
    const points = [];
    const total = closed ? steps : steps - 1;
    for (let index = 0; index <= total; index += 1) {
      const angle = (index / steps) * Math.PI * 2;
      points.push({
        x: cx + Math.cos(angle) * rx,
        y: cy + Math.sin(angle) * ry,
      });
    }
    return points;
  }

  function encodeWav(audioBuffer) {
    const channels = [];
    for (
      let channel = 0;
      channel < audioBuffer.numberOfChannels;
      channel += 1
    ) {
      channels.push(audioBuffer.getChannelData(channel));
    }

    const interleaved = interleave(channels);
    const buffer = new ArrayBuffer(44 + interleaved.length * 2);
    const view = new DataView(buffer);
    writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + interleaved.length * 2, true);
    writeString(view, 8, "WAVE");
    writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, audioBuffer.numberOfChannels, true);
    view.setUint32(24, audioBuffer.sampleRate, true);
    view.setUint32(
      28,
      audioBuffer.sampleRate * audioBuffer.numberOfChannels * 2,
      true,
    );
    view.setUint16(32, audioBuffer.numberOfChannels * 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, "data");
    view.setUint32(40, interleaved.length * 2, true);

    let offset = 44;
    for (let index = 0; index < interleaved.length; index += 1) {
      const sample = Math.max(-1, Math.min(1, interleaved[index]));
      view.setInt16(
        offset,
        sample < 0 ? sample * 0x8000 : sample * 0x7fff,
        true,
      );
      offset += 2;
    }

    return new Blob([buffer], { type: "audio/wav" });
  }

  function interleave(channels) {
    if (channels.length === 1) {
      return channels[0];
    }

    const length = channels[0].length * channels.length;
    const result = new Float32Array(length);
    let offset = 0;

    for (let index = 0; index < channels[0].length; index += 1) {
      for (let channel = 0; channel < channels.length; channel += 1) {
        result[offset] = channels[channel][index];
        offset += 1;
      }
    }

    return result;
  }

  function writeString(view, offset, value) {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  }

  function noteToColor(note) {
    return NOTE_COLORS[NOTE_NAMES[((note % 12) + 12) % 12]];
  }

  function findClosestNoteForColor(color) {
    const normalized = String(color || "").toLowerCase();
    for (let index = 0; index < NOTE_NAMES.length; index += 1) {
      if (NOTE_COLORS[NOTE_NAMES[index]].toLowerCase() === normalized) {
        return 60 - (60 % 12) + index;
      }
    }
    return null;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function clampInt(value, min, max) {
    if (!Number.isFinite(value)) {
      return min;
    }
    return Math.round(clamp(value, min, max));
  }

  function clampBpm(value) {
    if (!Number.isFinite(value)) {
      return 120;
    }
    return clamp(Math.round(value * 10) / 10, 60, 180);
  }

  function mod(value, divisor) {
    return ((value % divisor) + divisor) % divisor;
  }

  function createBallId() {
    return "ball-" + Math.random().toString(36).slice(2, 10);
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function isTypingTarget(target) {
    const tagName =
      target && target.tagName ? target.tagName.toLowerCase() : "";
    return (
      tagName === "input" || tagName === "textarea" || tagName === "select"
    );
  }

  function wait(milliseconds) {
    return new Promise((resolve) => {
      global.setTimeout(resolve, milliseconds);
    });
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = function onLoad() {
        resolve(String(reader.result));
      };
      reader.onerror = function onError() {
        reject(reader.error);
      };
      reader.readAsDataURL(file);
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = function onLoad() {
        resolve(image);
      };
      image.onerror = reject;
      image.src = src;
    });
  }
})(window);
