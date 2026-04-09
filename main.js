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
        const context = ensureAudioContext();
        if (!context) {
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
      textObjects: [],
      backgroundDataUrl: null,
      backgroundImage: null,
      collisionMemory: new Map(),
      tool: "select",
      selectedShape: "circle",
      selectedLineId: null,
      selectedTextId: null,
      selectedBallId: null,
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

    document.querySelectorAll(".tool-panel").forEach(makePanelDraggable);

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
      onClearSelection: function onClearSelection() {
        clearSelection();
      },
      onOverlayChange: function onOverlayChange() {
        renderFrame();
      },
    });

    bindControls();
    await applyExampleScene();
    updateCanvasAspect();
    setViewClasses();
    syncUI();
    updatePanels(state.tool);
    renderFrame();
    event.key === "Delete";

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

    function updatePanels(tool) {
      const panels = document.querySelectorAll(".tool-panel");

      panels.forEach((p) => (p.style.display = "none"));

      const map = {
        draw: "#draw-panel",
        shape: "#shape-panel",
        text: "#text-panel",
      };

      if (map[tool]) {
        const el = document.querySelector(map[tool]);
        if (el) el.style.display = "block";
      }
    }

    function makePanelDraggable(el) {
      let isDragging = false;
      let offsetX = 0;
      let offsetY = 0;

      el.style.position = "absolute";

      el.addEventListener("pointerdown", (e) => {
        isDragging = true;
        offsetX = e.clientX - el.offsetLeft;
        offsetY = e.clientY - el.offsetTop;
        el.setPointerCapture(e.pointerId);
      });

      el.addEventListener("pointermove", (e) => {
        if (!isDragging) return;

        el.style.left = e.clientX - offsetX + "px";
        el.style.top = e.clientY - offsetY + "px";
      });

      el.addEventListener("pointerup", () => {
        isDragging = false;
      });
    }

    function syncSelectionPanel() {
      const selection = getSelectedObject();
      const activeNote = selection ? selection.midi.note : state.defaults.note;
      controls.syncSelection(selection, ((activeNote % 12) + 12) % 12);
    }

    function getSelectedObject() {
      if (state.selectedBallId) {
        return (
          state.balls.find((ball) => ball.id === state.selectedBallId) || null
        );
      }

      if (state.selectedLineId) {
        return (
          state.lines.find((line) => line.id === state.selectedLineId) || null
        );
      }

      if (state.selectedTextId) {
        return (
          state.textObjects.find(
            (textObject) => textObject.id === state.selectedTextId,
          ) || null
        );
      }

      return null;
    }

    function selectObject(type, id) {
      state.selectedBallId = type === "ball" ? id : null;
      state.selectedLineId = type === "line" ? id : null;
      state.selectedTextId = type === "text" ? id : null;
      const selected = getSelectedObject();
      if (selected && selected.midi) {
        state.defaults.note = selected.midi.note;
      }
      syncSelectionPanel();
      renderFrame();
    }

    function clearSelection() {
      state.selectedBallId = null;
      state.selectedLineId = null;
      state.selectedTextId = null;
      syncSelectionPanel();
      renderFrame();
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

      const shapeFactory =
        SHAPE_LIBRARY[state.selectedShape] || SHAPE_LIBRARY.circle;
      const paths = shapeFactory(point, 240);
      const segments = [];

      paths.forEach((path) => {
        pointsToSegments(smoothStroke(path, 1)).forEach((segment) => {
          segments.push(segment);
        });
      });

      if (segments.length) {
        createSegmentsBatch(segments);
      }
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
      const selected = getSelectedObject();
      if (!selected || state.ui.presentation) {
        return;
      }

      if (selected.type === "ball") {
        selected.x += dx;
        selected.y += dy;
        renderFrame();
        return;
      }

      if (selected.type === "line") {
        selected.x1 += dx;
        selected.y1 += dy;
        selected.x2 += dx;
        selected.y2 += dy;
        renderFrame();
        return;
      }

      SBE.TextSystem.applyTransform(
        selected,
        {
          x: selected.transform.x + dx,
          y: selected.transform.y + dy,
        },
        state.canvas,
        22,
      );
      syncUI();
      renderFrame();
    }

    function deleteSelectionObject() {
      const selected = getSelectedObject();
      if (!selected || state.ui.presentation) {
        return;
      }

      pushHistory();
      if (selected.type === "ball") {
        state.balls = state.balls.filter((ball) => ball.id !== selected.id);
        state.swarm.count = state.balls.length;
      } else if (selected.type === "line") {
        state.lines = state.lines.filter((line) => line.id !== selected.id);
      } else {
        state.textObjects = state.textObjects.filter(
          (text) => text.id !== selected.id,
        );
      }
      clearSelection();
      syncUI();
    }

    async function duplicateSelectedObject() {
      const selected = getSelectedObject();
      if (!selected || state.ui.presentation) {
        return;
      }

      pushHistory();
      if (selected.type === "ball") {
        const copy = normalizeBall(clone(selected));
        copy.id = createBallId();
        copy.x += 20;
        copy.y += 20;
        state.balls.push(copy);
        selectObject("ball", copy.id);
      } else if (selected.type === "line") {
        const raw = serializeLineObject(selected);
        raw.id = undefined;
        raw.x1 += 20;
        raw.y1 += 20;
        raw.x2 += 20;
        raw.y2 += 20;
        const line = normalizeLineObject(SBE.LineSystem.hydrateLine(raw));
        state.lines.push(line);
        selectObject("line", line.id);
      } else {
        const rawText = SBE.TextSystem.serializeTextObject(selected);
        rawText.id = undefined;
        rawText.transform.x += 20;
        rawText.transform.y += 20;
        const text = normalizeTextObject(
          await SBE.TextSystem.hydrateTextObject(rawText),
        );
        state.textObjects.push(text);
        selectObject("text", text.id);
      }
      syncUI();
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
      const selected = getSelectedObject();
      if (!selected || selected.type === "ball") {
        state.defaults = readInspectorDefaults();
        syncUI();
        return;
      }

      if (pushToHistory !== false) {
        pushHistory();
      }

      const patch = readInspectorPatch();
      applyPatchToObject(selected, patch);
      syncUI();
      renderFrame();
    }

    function readInspectorPatch() {
      return {
        note: clampInt(Number(controls.elements.activeNote.value), 0, 127),
        thickness: clampInt(
          Number(controls.elements.lineThickness.value),
          1,
          24,
        ),
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

    function applyPatchToObject(object, patch) {
      object.midi.note = patch.note;
      object.note = patch.note;
      object.midiChannel = object.midi.channel;
      object.style.color = noteToColor(patch.note);
      object.color = object.style.color;
      object.style.thickness = patch.thickness;
      object.thickness = patch.thickness;
      object.behavior.type = patch.behaviorType;
      object.behavior.strength = patch.behaviorStrength;

      // Sync sound config from updated note
      rebuildSoundConfig(object);
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

      const activeForceLines = state.lines.concat(
        SBE.TextSystem
          ? SBE.TextSystem.getCollisionLines(state.textObjects || [])
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

    async function exportAllOutputs() {
      if (state.loop.exportBusy) {
        return;
      }

      state.loop.exportBusy = true;
      controls.elements.engineStatus.textContent = "Exporting";

      try {
        SBE.SceneManager.downloadScene(state, "sbe-loop");
        await exportImage();
        if (state.loop.hasLoop) {
          await exportVideo();
          await exportAudio();
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

    async function exportVideo() {
      if (!canvas.captureStream || !global.MediaRecorder) {
        return;
      }

      const stream = canvas.captureStream(60);
      const recorder = new MediaRecorder(stream, {
        mimeType: "video/webm",
      });
      const chunks = [];
      recorder.addEventListener("dataavailable", function onData(event) {
        if (event.data && event.data.size) {
          chunks.push(event.data);
        }
      });

      const done = new Promise((resolve) => {
        recorder.addEventListener("stop", function onStop() {
          resolve();
        });
      });

      recorder.start();
      await wait(state.loop.duration * 1000 || 2000);
      recorder.stop();
      await done;
      stream.getTracks().forEach((track) => track.stop());

      if (chunks.length) {
        downloadBlob(new Blob(chunks, { type: "video/webm" }), "sbe-loop.webm");
      }
    }

    async function exportAudio() {
      if (
        !state.loop.hasLoop ||
        !state.loop.events.length ||
        !global.OfflineAudioContext
      ) {
        return;
      }

      const sampleRate = 48000;
      const offline = new OfflineAudioContext(
        2,
        Math.ceil(sampleRate * state.loop.duration),
        sampleRate,
      );

      state.loop.events.forEach(function (event) {
        const sound = event.sound;
        if (!sound || !sound.enabled) {
          return;
        }

        const freq =
          typeof sound.frequency === "number" ? sound.frequency : 220;
        const volume = typeof sound.volume === "number" ? sound.volume : 0.1;
        const duration =
          typeof sound.duration === "number" ? sound.duration : 0.18;

        const oscillator = offline.createOscillator();
        const gain = offline.createGain();

        oscillator.type = "triangle";
        oscillator.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, event.time);
        gain.gain.exponentialRampToValueAtTime(
          Math.max(0.0008, volume),
          event.time + 0.008,
        );
        gain.gain.exponentialRampToValueAtTime(0.0001, event.time + duration);

        oscillator.connect(gain);
        gain.connect(offline.destination);
        oscillator.start(event.time);
        oscillator.stop(event.time + duration + 0.02);
      });

      const buffer = await offline.startRendering();
      downloadBlob(encodeWav(buffer), "sbe-loop.wav");
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
