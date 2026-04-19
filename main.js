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

  const SCALE_MAPS = {
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
    pentatonic: [0, 2, 4, 7, 9],
  };

  const CHORDS = {
    major: [0, 4, 7],
    minor: [0, 3, 7],
    seventh: [0, 4, 7, 10],
  };

  function quantizeToScale(note, root, scaleType) {
    const scale = SCALE_MAPS[scaleType];
    if (!scale) return note;
    const offset = (((note - root) % 12) + 12) % 12;
    const octave = Math.floor((note - root) / 12) * 12;
    let closest = scale[0];
    let minDist = Math.abs(offset - scale[0]);
    for (let i = 1; i < scale.length; i++) {
      const dist = Math.abs(offset - scale[i]);
      if (dist < minDist) {
        minDist = dist;
        closest = scale[i];
      }
    }
    return root + octave + closest;
  }
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
  // ── Sample System ─────────────────────────────

  const sampleMap = {
    0: [], // C
    1: [], // C#
    2: [],
    3: [],
    4: [],
    5: [],
    6: [],
    7: [],
    8: [],
    9: [],
    10: [],
    11: [],
  };
  const noteIndexMap = {};
  const noteActivity = {};
  const noteVelocity = {};

  function saveSamples() {
    const data = {};

    Object.keys(sampleMap).forEach((k) => {
      data[k] = sampleMap[k].map((b) => b.duration); // placeholder metadata
    });

    localStorage.setItem("sampleMap", JSON.stringify(data));
  }

  function getSampleForNote(noteClass) {
    var samples = sampleMap[noteClass];
    if (!samples || samples.length === 0) return null;
    var bankState = (state &&
      state.sampleBanks &&
      state.sampleBanks[noteClass]) || { mode: "single", index: 0 };
    switch (bankState.mode) {
      case "roundRobin": {
        var s = samples[bankState.index % samples.length];
        bankState.index++;
        return s;
      }
      case "random":
        return samples[Math.floor(Math.random() * samples.length)];
      case "stack":
        return samples; // returns array — caller handles multi-play
      case "single":
      default:
        return samples[0];
    }
  }

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
    window._wos = {
      get state() {
        return state;
      },
      get controls() {
        return controls;
      },
      spawnWalkerOnSelected: function () {
        var sel = state.multiSelection[0];
        if (!sel || sel.type !== "stroke") {
          console.warn(
            "[walker] Select a stroke first (type must be 'stroke')",
          );
          return;
        }
        var stroke = state.strokes.find(function (s) {
          return s.id === sel.id;
        });
        var w = createWalkerFromStroke(stroke);
        if (w) {
          state.walkers.push(w);
          console.log("[walker] Spawned:", w.id);
        }
      },
      spawnWalkerOnStroke: function (stroke) {
        var w = createWalkerFromStroke(stroke);
        if (w) {
          state.walkers.push(w);
          console.log("[walker] Spawned:", w.id);
        }
        return w;
      },
      clearWalkers: function () {
        state.walkers = [];
        console.log("[walker] Cleared");
      },
    };
    window.noteElements = {};

    // ── Drag-and-Drop Overlay System ──
    var dropOverlay = document.getElementById("drop-overlay");
    var dragCounter = 0;

    function showDropOverlay() {
      if (dropOverlay) dropOverlay.classList.remove("hidden");
    }

    function hideDropOverlay() {
      if (dropOverlay) dropOverlay.classList.add("hidden");
    }

    function showToast(message) {
      var toast = document.getElementById("drop-toast");
      if (!toast) {
        toast = document.createElement("div");
        toast.id = "drop-toast";
        toast.style.cssText =
          "position:fixed;bottom:80px;left:50%;transform:translateX(-50%);" +
          "font:600 12px monospace;color:#3dd8c5;background:rgba(12,14,18,0.92);" +
          "padding:8px 16px;border-radius:8px;border:1px solid rgba(61,216,197,0.3);" +
          "z-index:10000;pointer-events:none;transition:opacity 0.3s";
        document.body.appendChild(toast);
      }
      toast.textContent = message;
      toast.style.opacity = "1";
      clearTimeout(toast._timer);
      toast._timer = setTimeout(function () {
        toast.style.opacity = "0";
      }, 2500);
    }

    document.getElementById("clear-balls").onclick = () => {
      clearBalls(state);
    };

    global.addEventListener("dragenter", function onDragEnter(e) {
      e.preventDefault();
      dragCounter++;
      if (dragCounter === 1) showDropOverlay();
    });

    global.addEventListener("dragover", function onDragOver(e) {
      e.preventDefault();
    });

    global.addEventListener("dragleave", function onDragLeave(e) {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        hideDropOverlay();
      }
    });

    global.addEventListener("drop", async function onDrop(e) {
      e.preventDefault();
      dragCounter = 0;
      hideDropOverlay();

      var files = Array.prototype.slice
        .call(e.dataTransfer.files)
        .filter(function (f) {
          return f.type.includes("audio");
        });
      if (!files.length) return;

      // Priority: hovered sampler row → clicked sampler row → selected object color
      var noteClass = hoveredNoteClass;
      if (noteClass == null) noteClass = state.sampler.activeNote;
      if (noteClass == null) {
        var selectedObj = getSelectedObject ? getSelectedObject() : null;
        var objColor = getObjectColor(selectedObj);
        if (objColor) noteClass = getNoteFromColor(objColor);
      }
      if (noteClass == null || isNaN(noteClass)) {
        showToast("Select a sampler key or object to set the target note");
        console.warn("[sampler] Drop ignored — no target note resolved");
        return;
      }

      var loaded = 0;
      await Promise.all(
        files.map(async function (file) {
          var ok = await loadSampleToNote(file, noteClass);
          if (ok) loaded++;
        }),
      );

      if (loaded > 0) {
        saveSamples();
        syncSamplerTab();
        highlightActiveRow(noteClass);
        showToast("Loaded " + loaded + " sample(s) → " + NOTE_NAMES[noteClass]);
        console.log(
          "[sampler] Assigned",
          loaded,
          "sample(s) to noteClass",
          noteClass,
          NOTE_NAMES[noteClass],
        );
      }
    });

    document.querySelectorAll("[data-note-class]").forEach((el) => {
      el.dataset.note = String(Number(el.dataset.noteClass) % 12);
    });

    document.querySelectorAll("[data-note]").forEach((el) => {
      const n = Number(el.dataset.note) % 12;
      window.noteElements[n] = el;
    });

    let textEditor = null;
    let textUpdateTimer = 0;

    // ── Event Bus ────────────────────────────────────────
    const eventBus = new SBE.EventBus();

    // ── Oscillator Output ────────────────────────────────
    const oscillatorOutput = {
      enabled: true,
      handle: function handleOscillator(type, sourceObject) {
        const context = state.audio.context;
        if (!context || context.state !== "running") return;

        let note = sourceObject.sound?.midi?.note || 60;

        // Scale quantization — applied before sampleMap lookup and pitch shift
        if (state.audio.scale?.enabled) {
          note = quantizeToScale(
            note,
            state.audio.scale.root,
            state.audio.scale.type,
          );
        }

        const noteClass = note % 12;

        // Solo note class gate
        if (
          state.audio.soloNoteClass !== null &&
          noteClass !== state.audio.soloNoteClass
        )
          return;

        // Resolve bank with fallback
        let resolvedClass = noteClass;
        let result = getSampleForNote(noteClass);
        if (result === null) {
          const fallbackMode = state.audio.fallbackMode || "nearest";
          if (fallbackMode === "strict") return;
          for (let offset = 1; offset <= 6; offset++) {
            const lo = (noteClass - offset + 12) % 12;
            const hi = (noteClass + offset) % 12;
            if (sampleMap[lo] && sampleMap[lo].length > 0) {
              resolvedClass = lo;
              result = getSampleForNote(lo);
              break;
            }
            if (sampleMap[hi] && sampleMap[hi].length > 0) {
              resolvedClass = hi;
              result = getSampleForNote(hi);
              break;
            }
          }
        }
        if (result === null) return;

        const velocity = sourceObject.sound?.midi?.velocity || 80;
        const root = sourceObject.sound?.rootNote ?? 60;
        const pitch = Math.pow(2, (note - root) / 12);
        noteActivity[noteClass] = performance.now();
        noteVelocity[noteClass] = velocity / 127;

        // playSampleBuffer — plays one AudioBuffer
        function playSampleBuffer(buffer) {
          if (!buffer) return;
          const source = context.createBufferSource();
          const gainNode = context.createGain();
          source.buffer = buffer;
          source.playbackRate.value = pitch * (0.96 + Math.random() * 0.08);
          gainNode.gain.value = 0.8;
          source.connect(gainNode);
          gainNode.connect(state.audio.masterGain || context.destination);
          source.start();
        }

        // stack mode returns array; all others return single buffer
        if (Array.isArray(result)) {
          result.forEach(playSampleBuffer);
        } else {
          playSampleBuffer(result);
        }
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
        const rawNote =
          typeof sound.midi.note === "number" ? sound.midi.note : 60;
        const density = getDensityLevel(state.collisionCount || 0);
        let note = rawNote;
        if (state.soundResponse && state.soundResponse.densityHarmonics) {
          if (density === "mid") note = rawNote + 7;
          if (density === "high") note = rawNote + 12;
        }

        let velocity =
          typeof sound.midi.velocity === "number" ? sound.midi.velocity : 80;
        if (
          state.soundResponse &&
          state.soundResponse.velocityDynamics &&
          sourceObject
        ) {
          var speed = Math.hypot(sourceObject.vx || 0, sourceObject.vy || 0);
          var sens =
            (state.soundResponse && state.soundResponse.sensitivity) || 1.0;
          var scaled = speed * 20 * sens;
          velocity = Math.min(127, Math.max(40, Math.round(scaled)));
        }

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
      audioQueue: [],
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
        particleShape: "circle",
        trailEnabled: false,
      },
      balls: [],
      lines: [],
      shapes: [],
      textObjects: [],
      backgroundDataUrl: null,
      backgroundImage: null,
      collisionMemory: new Map(),
      tool: "select",
      selectedShape: "straight",
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
        debugHUD: false,
        selectedNoteClass: 0,
      },
      sampler: {
        activeNote: null,
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
        fallbackMode: "nearest",
        soloNoteClass: null,
        scale: {
          root: 60,
          type: "major",
          enabled: true,
        },
      },
      sampleBanks: (function () {
        var banks = {};
        for (var i = 0; i < 12; i++) {
          banks[i] = { mode: "single", index: 0 };
        }
        return banks;
      })(),
      physics: {
        gravity: { x: 0, y: 3.0 },
        damping: 0.996,
        maxSpeed: 20,
      },
      world: {
        mode: "gravity",
        strength: 3,
        direction: { x: 0, y: 1 },
      },
      soundResponse: {
        densityHarmonics: true,
        velocityDynamics: true,
        sensitivity: 1.0,
      },
      feedback: {
        showHitCount: false,
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
      lineTool: {
        step: 0,
        startPoint: null,
        previewEnd: null,
        lengthInput: "",
        isTyping: false,
      },
      strokes: [],
      walkers: [],
      walker: {
        enabled: true,
        baseNote: 60,
        speed: 0.0025,
        triggerStep: 0.02,
      },
      music: {
        enabled: true,
        bpm: 120,
        stepsPerBar: 16,
        currentStep: 0,
        lastStepTime: 0,
        scale: {
          root: 60,
          type: "pentatonic",
        },
      },
      harmony: {
        enabled: true,
        root: 60,
        chordType: "minor",
      },
      progression: {
        enabled: true,
        steps: [
          { chord: "minor", rootOffset: 0 },
          { chord: "minor", rootOffset: 5 },
          { chord: "major", rootOffset: 7 },
          { chord: "minor", rootOffset: 0 },
        ],
      },
      mopTool: {
        activeStrokeId: null,
        streamline: 0.65,
        persistSpecks: false,
      },
    };

    var heldKeys = new Set();

    normalizeSwarmConfig();
    renderer.resize(state.canvas.width, state.canvas.height);

    // Surface stamp buffer — persistent ink accumulation
    var surfaceCanvas = document.createElement("canvas");
    surfaceCanvas.width = canvas.width;
    surfaceCanvas.height = canvas.height;
    var surfaceCtx = surfaceCanvas.getContext("2d");

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
      async function initAudioOnGesture() {
        const ctx = ensureAudioContext();
        if (!ctx) return;

        if (ctx.state !== "running") {
          await ctx.resume();
          console.log("🔊 AudioContext:", ctx.state);
        }

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.frequency.value = 440;
        gain.gain.value = 0.05;

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start();
        osc.stop(ctx.currentTime + 0.05);
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

    // ── Emitter Tool + Selection (capture phase) ──
    canvas.addEventListener(
      "pointerdown",
      function onEmitterDown(e) {
        var pt = getCanvasCoordsLocal(e);

        // Select tool disabled for emitter (tool removed)
        // Emitters now only exist as line behaviors
      },
      true,
    );

    // ── Mop Tool (capture phase) ──
    canvas.addEventListener(
      "pointerdown",
      function onMopDown(e) {
        if (state.tool !== "mop") return;
        var pt = getCanvasCoordsLocal(e);
        pushHistory();
        var stroke = createStrokeObject(pt.x, pt.y);
        state.strokes.push(stroke);
        state.mopTool.activeStrokeId = stroke.id;
        canvas.setPointerCapture(e.pointerId);
        e.stopPropagation();
        renderFrame();
      },
      true,
    );

    canvas.addEventListener(
      "pointermove",
      function onMopMove(e) {
        if (state.tool !== "mop") return;
        if (!state.mopTool.activeStrokeId) return;
        var stroke = state.strokes.find(function (s) {
          return s.id === state.mopTool.activeStrokeId;
        });
        if (!stroke) return;
        var rawPt = getCanvasCoordsLocal(e);

        var last = stroke.points[stroke.points.length - 1];

        // Skip tiny segments — removes micro-jitter
        if (last) {
          var dx = rawPt.x - last.x;
          var dy = rawPt.y - last.y;
          var dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 1.5) return;

          // Change 2 — pass speed to drip spawner
          attemptDripSpawn(stroke, dist);
        }

        // Change 1 — factor = 1 - streamline (0.65 → factor 0.35 = smooth)
        var factor = 1 - state.mopTool.streamline;
        var smoothed = last ? smoothPoint(last, rawPt, factor) : rawPt;
        stroke.points.push(smoothed);

        renderFrame();
      },
      true,
    );

    canvas.addEventListener(
      "pointerup",
      function onMopUp(e) {
        if (state.tool !== "mop") return;
        if (!state.mopTool.activeStrokeId) return;
        var stroke = state.strokes.find(function (s) {
          return s.id === state.mopTool.activeStrokeId;
        });
        // Change 2 — flick drip burst on stroke end
        if (stroke && stroke.points.length > 2) {
          var pts = stroke.points;
          var last = pts[pts.length - 1];
          var prev = pts[pts.length - 2];
          var fdx = last.x - prev.x;
          var fdy = last.y - prev.y;
          var flickSpeed = Math.sqrt(fdx * fdx + fdy * fdy);
          if (flickSpeed > 2.5 && stroke.drips.length < MAX_DRIPS_PER_STROKE) {
            var flickCount = Math.min(
              3,
              MAX_DRIPS_PER_STROKE - stroke.drips.length,
            );
            for (var fi = 0; fi < flickCount; fi++) {
              stroke.drips.push({
                x: last.x + (Math.random() - 0.5) * 4,
                y: last.y + Math.random() * 6,
                vx:
                  (fdx / flickSpeed) * (1 + Math.random()) +
                  (Math.random() - 0.5) * 0.8,
                vy:
                  (fdy / flickSpeed) * (1 + Math.random()) +
                  Math.random() * 1.5,
                radius: 3 + Math.random() * 3,
                color: stroke.color,
                life: 2 + Math.random() * 2,
              });
            }
          }
        }
        state.mopTool.activeStrokeId = null;

        // Analyze geometry before walker attaches
        if (stroke) analyzeStroke(stroke);

        // Auto-attach walker if enabled
        if (stroke && state.walker.enabled) {
          var w = createWalkerFromStroke(stroke);
          if (w) state.walkers.push(w);
        }

        renderFrame();
      },
      true,
    );

    // ── Line Tool (two-click, capture phase) ──
    var SNAP_ANGLE = Math.PI / 12;
    var FINE_SNAP_ANGLE = Math.PI / 36;

    function getSnappedPoint(start, current) {
      var dx = current.x - start.x;
      var dy = current.y - start.y;
      var angle = Math.atan2(dy, dx);
      var length = Math.hypot(dx, dy);
      var inc = heldKeys.has("alt") ? FINE_SNAP_ANGLE : SNAP_ANGLE;
      var snapped = Math.round(angle / inc) * inc;
      return {
        x: start.x + Math.cos(snapped) * length,
        y: start.y + Math.sin(snapped) * length,
      };
    }

    function applyLengthConstraint(start, current, lengthValue) {
      var dx = current.x - start.x;
      var dy = current.y - start.y;
      var angle = Math.atan2(dy, dx);
      return {
        x: start.x + Math.cos(angle) * lengthValue,
        y: start.y + Math.sin(angle) * lengthValue,
      };
    }

    function getLineFinalPoint(start, current) {
      var pt = current;
      if (heldKeys.has("shift")) {
        pt = getSnappedPoint(start, pt);
      }
      var tool = state.lineTool;
      if (tool.isTyping && tool.lengthInput) {
        var len = parseFloat(tool.lengthInput);
        if (!isNaN(len) && len > 0) {
          pt = applyLengthConstraint(start, pt, len);
        }
      }
      return pt;
    }

    function finalizeLineTool(endPoint) {
      var tool = state.lineTool;
      if (!tool.startPoint) return;
      var final = getLineFinalPoint(tool.startPoint, endPoint);
      var dx = final.x - tool.startPoint.x;
      var dy = final.y - tool.startPoint.y;
      if (Math.hypot(dx, dy) < 4) return;

      pushHistory();
      var settings = createLineSettingsFromInspector();
      var raw = SBE.LineSystem.createLine(
        {
          x1: tool.startPoint.x,
          y1: tool.startPoint.y,
          x2: final.x,
          y2: final.y,
        },
        settings,
      );
      var line = normalizeLineObject(raw);
      state.lines.push(line);
      selectObject("line", line.id);
      syncUI();
      renderFrame();

      tool.step = 0;
      tool.startPoint = null;
      tool.previewEnd = null;
      tool.lengthInput = "";
      tool.isTyping = false;
    }

    canvas.addEventListener(
      "pointerdown",
      function onLineToolDown(e) {
        if (state.tool !== "line") return;
        var pt = getCanvasCoordsLocal(e);
        var tool = state.lineTool;

        if (tool.step === 0) {
          tool.startPoint = pt;
          tool.step = 1;
          tool.previewEnd = pt;
          e.stopPropagation();
          return;
        }

        if (tool.step === 1) {
          finalizeLineTool(pt);
          e.stopPropagation();
        }
      },
      true,
    );

    canvas.addEventListener(
      "pointermove",
      function onLineToolMove(e) {
        if (state.tool !== "line" || state.lineTool.step !== 1) return;
        state.lineTool.previewEnd = getCanvasCoordsLocal(e);
        renderFrame();
      },
      true,
    );

    // ── Mop / Stroke System ──────────────────────────────

    function createStrokeId() {
      return "stroke-" + Math.random().toString(36).slice(2, 8);
    }

    // Change 1 — streamline helper
    function smoothPoint(prev, current, factor) {
      return {
        x: prev.x + (current.x - prev.x) * factor,
        y: prev.y + (current.y - prev.y) * factor,
      };
    }

    function createStrokeObject(x, y) {
      return {
        id: createStrokeId(),
        type: "stroke",
        points: [{ x: x, y: y }],
        width: 18,
        color: normalizeColor(noteToColor(state.defaults.note)),
        drips: [],
        specks: [],
        inkBudget: 1.0,
        isCommitted: false,
        renderMode: "ribbon",
        sound: { enabled: false, note: null },
        behavior: { isMuted: true },
        mode: "annotation",
        harmony: { role: 0 },
        meta: { length: 1, curvature: 0, complexity: 0 },
      };
    }

    // Change 4
    var MAX_DRIPS_PER_STROKE = 40;

    function stampDrip(drip) {
      surfaceCtx.save();
      surfaceCtx.globalAlpha = 0.4;
      surfaceCtx.beginPath();
      surfaceCtx.arc(drip.x, drip.y, drip.radius, 0, Math.PI * 2);
      surfaceCtx.fillStyle = drip.color;
      surfaceCtx.fill();
      surfaceCtx.restore();
    }

    function stampSpeck(speck) {
      surfaceCtx.save();
      surfaceCtx.globalAlpha = 0.15;
      surfaceCtx.beginPath();
      surfaceCtx.arc(speck.x, speck.y, speck.size, 0, Math.PI * 2);
      surfaceCtx.fillStyle = speck.color;
      surfaceCtx.fill();
      surfaceCtx.restore();
    }

    function attemptDripSpawn(stroke, speed) {
      var pts = stroke.points;
      if (!pts.length) return;
      var anchor = pts[pts.length - 1];

      // Change 2 — capped, visibility-boosted drip chance; speed-triggered
      if (stroke.drips.length < MAX_DRIPS_PER_STROKE) {
        var dripChance = Math.min(0.25, stroke.width * 0.03);
        var speedThreshold = 1.2;
        if ((speed || 0) > speedThreshold && Math.random() < dripChance) {
          stroke.drips.push({
            x: anchor.x + (Math.random() - 0.5) * 2,
            y: anchor.y + Math.random() * 4,
            vx: (Math.random() - 0.5) * 0.6,
            vy: 1.2 + Math.random() * 1.0,
            radius: 3 + Math.random() * 3,
            color: stroke.color,
            life: 2 + Math.random() * 2,
          });
        }
      }

      // Change 2 — stamp specks immediately, no particle lifecycle needed
      if (Math.random() < 0.2) {
        var speck = {
          x: anchor.x + (Math.random() - 0.5) * 8,
          y: anchor.y + (Math.random() - 0.5) * 8,
          size: 2 + Math.random() * 3,
          color: stroke.color,
        };
        stampSpeck(speck);
      }
    }

    function updateStrokes(dt) {
      var safeDt = dt || 1 / 60;
      (state.strokes || []).forEach(function (stroke) {
        // Change 3 — drip physics: gravity + drag
        stroke.drips.forEach(function (d) {
          d.vy += 0.25;
          d.vx *= 0.98;
          d.x += d.vx;
          d.y += d.vy;
          d.life -= safeDt;
          // Change 1 — stamp on floor impact
          if (d.y >= canvas.height - 2) {
            stampDrip(d);
            d.life = 0;
          }
        });
        // Change 5 — drip lifecycle cleanup
        stroke.drips = stroke.drips.filter(function (d) {
          return d.life > 0;
        });

        // Mark committed when no active drawing and drips settled
        if (
          !state.mopTool.activeStrokeId ||
          state.mopTool.activeStrokeId !== stroke.id
        ) {
          if (stroke.drips.length === 0) {
            stroke.isCommitted = true;
          }
        }
      });
    }

    function renderStrokes(ctx) {
      (state.strokes || []).forEach(function (stroke) {
        var pts = stroke.points;

        // Draw base stroke path — Change 5: quadratic smoothing
        if (pts.length >= 2) {
          ctx.save();
          ctx.strokeStyle = stroke.color;
          ctx.lineWidth = stroke.width;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.globalAlpha = 0.82;
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (var i = 1; i < pts.length - 1; i++) {
            var midX = (pts[i].x + pts[i + 1].x) / 2;
            var midY = (pts[i].y + pts[i + 1].y) / 2;
            ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
          }
          // Draw last segment to final point
          var last = pts[pts.length - 1];
          ctx.lineTo(last.x, last.y);
          ctx.stroke();
          ctx.restore();
        }

        // Change 8 — drip rendering
        stroke.drips.forEach(function (d) {
          ctx.save();
          ctx.globalAlpha = Math.max(0, d.life * 0.7);
          ctx.fillStyle = d.color;
          ctx.beginPath();
          ctx.arc(d.x, d.y, d.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        });
        // Specks now stamped immediately via stampSpeck — no particle rendering needed
      });
    }

    // ── PathWalker System ────────────────────────────────

    // ── Music Clock ──────────────────────────────────────

    function updateClock(time) {
      var msPerBeat = 60000 / (state.music.bpm || 120);
      var msPerStep = msPerBeat / ((state.music.stepsPerBar || 16) / 4);
      if (time - state.music.lastStepTime > msPerStep) {
        state.music.lastStepTime = time;
        state.music.currentStep =
          (state.music.currentStep + 1) % (state.music.stepsPerBar || 16);
      }
    }

    function getCurrentChord() {
      var step = state.music.currentStep;
      var steps = state.progression.steps;
      var index = Math.floor(step / 4) % steps.length;
      var prog = steps[index];
      return {
        chord: CHORDS[prog.chord] || CHORDS.minor,
        root: state.harmony.root + prog.rootOffset,
      };
    }

    function analyzeStroke(stroke) {
      var pts = stroke.points;
      var curvature = 0;
      for (var i = 1; i < pts.length - 1; i++) {
        var p0 = pts[i - 1];
        var p1 = pts[i];
        var p2 = pts[i + 1];
        curvature += Math.abs(p2.x - p1.x - (p1.x - p0.x));
      }
      var len = Math.max(1, pts.length);
      stroke.meta = {
        length: len,
        curvature: curvature,
        complexity: curvature / len,
      };
    }

    function mapWalkerToNote(w) {
      var chordData = getCurrentChord();
      var chord = chordData.chord;
      var root = chordData.root;
      var role =
        w.stroke.harmony && w.stroke.harmony.role != null
          ? w.stroke.harmony.role
          : 0;
      var tone = chord[role % chord.length];
      var note = root + tone;
      // Geometry influence — complex strokes add variation
      var complexity = (w.stroke.meta && w.stroke.meta.complexity) || 0;
      if (complexity > 0.5) {
        note += Math.floor(Math.random() * 3);
      }
      if (w.music.voice === "bass") note -= 24;
      if (w.music.voice === "lead") note += 12;
      note += (w.music.octave || 0) * 12;
      return note;
    }

    function shouldTrigger(w) {
      var complexity = (w.stroke.meta && w.stroke.meta.complexity) || 0;
      var chance = Math.min(1, complexity * 2);
      return (
        Math.random() <
        chance * (w.music.density != null ? w.music.density : 0.7)
      );
    }

    function updateWalkerMusic() {
      var step = state.music.currentStep;
      state.walkers.forEach(function (w) {
        if (!state.music.enabled) return;
        if (!w.music || w.music.mute) return;
        if (w.music.lastStep === step) return;
        w.music.lastStep = step;

        if (!shouldTrigger(w)) return;

        // Percussion mode
        if (w.music.voice === "perc") {
          playNote(36 + Math.floor(Math.random() * 4), 0.8);
          return;
        }

        var note = mapWalkerToNote(w);
        var velocity = 0.5 + Math.random() * 0.3;
        playNote(note, velocity);
      });
    }

    function createWalkerFromStroke(stroke) {
      if (!stroke || !stroke.points || stroke.points.length < 2) return null;
      return {
        id: "w_" + Math.random().toString(36).slice(2),
        stroke: stroke,
        t: 0,
        dir: 1,
        speed: state.walker.speed,
        lastTriggerT: -1,
        noteOffset: Math.floor(Math.random() * 12),
        music: {
          voice: "lead",
          density: 0.7,
          octave: 0,
          mute: false,
          lastStep: -1,
          mode: "pingpong",
        },
      };
    }

    function getStrokePoint(stroke, t) {
      var pts = stroke.points;
      var maxIdx = pts.length - 1;
      var f = Math.max(0, Math.min(1, t)) * maxIdx;
      var i = Math.floor(f);
      var j = Math.min(i + 1, maxIdx);
      var localT = f - i;
      return {
        x: pts[i].x + (pts[j].x - pts[i].x) * localT,
        y: pts[i].y + (pts[j].y - pts[i].y) * localT,
      };
    }

    // playNote — thin wrapper over dispatchCollisionEvent
    function playNote(note, velocity) {
      var quantized =
        state.audio && state.audio.scale && state.audio.scale.enabled
          ? quantizeToScale(
              note,
              state.audio.scale.root,
              state.audio.scale.type,
            )
          : note;
      var sourceObject = {
        sound: buildSoundConfig(quantized, state.defaults.midiChannel || 1),
      };
      sourceObject.sound.midi.velocity = Math.round((velocity || 0.6) * 127);
      dispatchCollisionEvent(sourceObject);
    }

    function updateWalkerMovement(w, dt) {
      switch (w.music.mode) {
        case "follow":
          w.t += w.speed * dt * 60;
          w.t = Math.max(0, Math.min(1, w.t));
          break;
        case "random":
          w.t += (Math.random() - 0.5) * 0.05;
          w.t = Math.max(0, Math.min(1, w.t));
          break;
        case "drift":
          w.t += 0.01 * dt * 60 + Math.sin(performance.now() * 0.001) * 0.005;
          if (w.t > 1) w.t -= 1;
          if (w.t < 0) w.t += 1;
          break;
        case "pingpong":
        default:
          w.t += w.dir * w.speed * dt * 60;
          if (w.t >= 1 || w.t <= 0) {
            w.dir *= -1;
            w.t = Math.max(0, Math.min(1, w.t));
          }
          break;
      }
    }

    function updateWalkers(dt) {
      if (!state.walker.enabled) return;
      state.walkers.forEach(function (w) {
        updateWalkerMovement(w, dt);
      });
    }

    function drawWalkers(ctx) {
      state.walkers.forEach(function (w) {
        var p = getStrokePoint(w.stroke, w.t);
        ctx.save();
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.globalAlpha = 0.9;
        ctx.fill();
        // Direction indicator dot
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = w.stroke.color || "#3dd8c5";
        ctx.globalAlpha = 1;
        ctx.fill();
        ctx.restore();
      });
    }

    // ── End PathWalker System ────────────────────────────

    // ── End Mop / Stroke System ──────────────────────────

    function drawLinePreview() {
      var tool = state.lineTool;
      if (
        state.tool !== "line" ||
        tool.step !== 1 ||
        !tool.startPoint ||
        !tool.previewEnd
      )
        return;

      var end = getLineFinalPoint(tool.startPoint, tool.previewEnd);
      var ctx = canvas.getContext("2d");
      ctx.save();

      // Preview line
      ctx.beginPath();
      ctx.moveTo(tool.startPoint.x, tool.startPoint.y);
      ctx.lineTo(end.x, end.y);
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Start dot
      ctx.beginPath();
      ctx.arc(tool.startPoint.x, tool.startPoint.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#3dd8c5";
      ctx.fill();

      // Length + angle label
      var dx = end.x - tool.startPoint.x;
      var dy = end.y - tool.startPoint.y;
      var len = Math.hypot(dx, dy);
      var angle = Math.atan2(dy, dx) * (180 / Math.PI);
      var label = Math.round(len) + "px  " + angle.toFixed(1) + "°";
      if (tool.isTyping && tool.lengthInput) {
        label = tool.lengthInput + "px (typing)";
      }
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.font = "20px monospace";
      ctx.fillText(
        label,
        (tool.startPoint.x + end.x) / 2 + 10,
        (tool.startPoint.y + end.y) / 2 - 10,
      );

      ctx.restore();
    }

    bindControls();
    await applyExampleScene();
    state.lines[2].y1 += 100;
    state.lines[2].y2 += 100;
    updateCanvasAspect();
    setViewClasses();
    syncUI();
    updatePanels(state.tool);
    renderFrame();

    function bindControls() {
      const elements = controls.elements;

      if (elements.togglePlayback) {
        elements.togglePlayback.addEventListener("click", function () {
          togglePlayback();
          if (elements.togglePlayback) {
            elements.togglePlayback.innerHTML = isPlaying
              ? "&#9646;&#9646;"
              : "&#9654;";
          }
        });
      }

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
          // Show/hide emitter fields
          if (elements.behaviorEmitterFields) {
            elements.behaviorEmitterFields.classList.toggle(
              "hidden",
              elements.lineBehavior.value !== "emitter",
            );
          }
        },
      );

      // Behavior emitter field listeners
      if (elements.behaviorEmitterRate) {
        elements.behaviorEmitterRate.addEventListener("input", function () {
          applyBehaviorEmitterFields();
        });
      }
      if (elements.behaviorEmitterDirection) {
        elements.behaviorEmitterDirection.addEventListener(
          "input",
          function () {
            applyBehaviorEmitterFields();
          },
        );
      }
      if (elements.behaviorEmitterStrength) {
        elements.behaviorEmitterStrength.addEventListener("input", function () {
          applyBehaviorEmitterFields();
        });
      }
      if (elements.behaviorEmitterSilent) {
        elements.behaviorEmitterSilent.addEventListener("change", function () {
          applyBehaviorEmitterFields();
        });
      }
      if (elements.behaviorEmitterQuantize) {
        elements.behaviorEmitterQuantize.addEventListener(
          "change",
          function () {
            applyBehaviorEmitterFields();
          },
        );
      }
      if (elements.behaviorEmitterQuantizeDiv) {
        elements.behaviorEmitterQuantizeDiv.addEventListener(
          "input",
          function () {
            applyBehaviorEmitterFields();
          },
        );
      }

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

      // Particle controls
      if (elements.particleShape) {
        elements.particleShape.addEventListener("change", function () {
          state.swarm.particleShape = this.value;
        });
      }
      if (elements.particleTrail) {
        elements.particleTrail.addEventListener("change", function () {
          state.swarm.trailEnabled = this.checked;
          state.balls.forEach(function (ball) {
            ball.trailEnabled = state.swarm.trailEnabled;
            if (!ball.trailEnabled) ball.trail = [];
          });
        });
      }

      elements.closeShortcuts.addEventListener(
        "click",
        function closeShortcuts() {
          toggleShortcuts(false);
        },
      );

      // Sound response bindings
      if (elements.densityHarmonicsToggle) {
        elements.densityHarmonicsToggle.addEventListener("change", function () {
          state.soundResponse.densityHarmonics = this.checked;
        });
      }
      if (elements.velocityDynamicsToggle) {
        elements.velocityDynamicsToggle.addEventListener("change", function () {
          state.soundResponse.velocityDynamics = this.checked;
        });
      }
      if (elements.soundSensitivity) {
        elements.soundSensitivity.addEventListener("input", function () {
          state.soundResponse.sensitivity = Number(this.value);
        });
      }
      if (elements.toggleHitCount) {
        elements.toggleHitCount.addEventListener("change", function () {
          state.feedback.showHitCount = this.checked;
        });
      }

      // World mode bindings
      if (elements.worldMode) {
        elements.worldMode.addEventListener("change", function () {
          var newMode = this.value;
          state.world.mode = newMode;
          // Gentle velocity adjustment on switch
          state.balls.forEach(function (ball) {
            var spd = Math.hypot(ball.vx, ball.vy) || 1;
            if (newMode === "planar") {
              ball.vx = (Math.random() - 0.5) * 2 * spd;
              ball.vy = (Math.random() - 0.5) * 2 * spd;
            } else if (newMode === "zero-g") {
              ball.vx *= 0.7;
              ball.vy *= 0.7;
            } else if (newMode === "gravity") {
              ball.vy += (0.5 + Math.random()) * 1;
            }
          });
          renderFrame();
        });
      }
      if (elements.worldStrength) {
        elements.worldStrength.addEventListener("input", function () {
          state.world.strength = Number(this.value);
        });
      }

      // Sampler tab bindings
      var samplerFallbackSelect = document.getElementById(
        "sampler-fallback-select",
      );
      if (samplerFallbackSelect) {
        samplerFallbackSelect.addEventListener("change", function () {
          state.audio.fallbackMode = this.value;
          syncSamplerTab();
        });
      }

      // Music tab bindings
      var musicEnabled = document.getElementById("music-enabled");
      if (musicEnabled) {
        musicEnabled.addEventListener("change", function () {
          state.music.enabled = this.checked;
        });
      }
      var musicBpm = document.getElementById("music-bpm");
      if (musicBpm) {
        musicBpm.addEventListener("input", function () {
          state.music.bpm = Math.max(
            40,
            Math.min(240, Number(this.value) || 120),
          );
        });
      }
      var musicSteps = document.getElementById("music-steps");
      if (musicSteps) {
        musicSteps.addEventListener("change", function () {
          state.music.stepsPerBar = Number(this.value) || 16;
          state.music.currentStep = 0;
        });
      }
      var musicRoot = document.getElementById("music-root");
      if (musicRoot) {
        musicRoot.addEventListener("change", function () {
          state.music.scale.root = Number(this.value);
        });
      }
      var musicScale = document.getElementById("music-scale");
      if (musicScale) {
        musicScale.addEventListener("change", function () {
          state.music.scale.type = this.value;
        });
      }

      // Walker voice panel bindings
      var walkerDensity = document.getElementById("walker-density");
      if (walkerDensity) {
        walkerDensity.addEventListener("input", function () {
          var w = getSelectedWalker();
          if (w) {
            w.music.density = Number(this.value);
            document.getElementById("walker-density-value").textContent =
              this.value;
          }
        });
      }
      var walkerMute = document.getElementById("walker-mute");
      if (walkerMute) {
        walkerMute.addEventListener("change", function () {
          var w = getSelectedWalker();
          if (w) w.music.mute = this.checked;
        });
      }
      document.querySelectorAll("[data-voice]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var w = getSelectedWalker();
          if (!w) return;
          w.music.voice = btn.dataset.voice;
          document.querySelectorAll("[data-voice]").forEach(function (b) {
            b.classList.toggle("active", b.dataset.voice === w.music.voice);
          });
        });
      });
      document.querySelectorAll("[data-octave]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var w = getSelectedWalker();
          if (!w) return;
          w.music.octave = Number(btn.dataset.octave);
          document.querySelectorAll("[data-octave]").forEach(function (b) {
            b.classList.toggle(
              "active",
              Number(b.dataset.octave) === w.music.octave,
            );
          });
        });
      });

      // Motion inspector bindings
      function getMotionShape() {
        if (!state.selectedShapeId) return null;
        return (
          (state.shapes || []).find(function (s) {
            return s.id === state.selectedShapeId;
          }) || null
        );
      }

      function ensureMotion(shape) {
        if (!shape.motion) {
          shape.motion = {
            enabled: false,
            vx: 0,
            vy: 0,
            angularVelocity: 0,
            loop: true,
          };
        }
      }

      if (elements.motionEnabled) {
        elements.motionEnabled.addEventListener("change", function () {
          var shape = getMotionShape();
          if (!shape) return;
          ensureMotion(shape);
          shape.motion.enabled = this.checked;
        });
      }
      if (elements.motionVx) {
        elements.motionVx.addEventListener("input", function () {
          var shape = getMotionShape();
          if (!shape) return;
          ensureMotion(shape);
          shape.motion.vx = Number(this.value);
        });
      }
      if (elements.motionVy) {
        elements.motionVy.addEventListener("input", function () {
          var shape = getMotionShape();
          if (!shape) return;
          ensureMotion(shape);
          shape.motion.vy = Number(this.value);
        });
      }
      if (elements.motionRot) {
        elements.motionRot.addEventListener("input", function () {
          var shape = getMotionShape();
          if (!shape) return;
          ensureMotion(shape);
          shape.motion.angularVelocity = Number(this.value);
        });
      }
      if (elements.motionLoop) {
        elements.motionLoop.addEventListener("change", function () {
          var shape = getMotionShape();
          if (!shape) return;
          ensureMotion(shape);
          shape.motion.loop = this.checked;
        });
      }

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

        if (event.key === " ") {
          event.preventDefault();
          togglePlayback();
          syncUI();
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
        if (event.key.toLowerCase() === "m") {
          state.tool = "mop";
          syncUI();
          return;
        }
        if (event.key.toLowerCase() === "l") {
          state.tool = "line";
          state.lineTool.step = 0;
          state.lineTool.startPoint = null;
          state.lineTool.previewEnd = null;
          state.lineTool.lengthInput = "";
          state.lineTool.isTyping = false;
          syncUI();
          return;
        }

        // Line tool length input
        if (state.tool === "line" && state.lineTool.step === 1) {
          if (!isNaN(event.key) && event.key !== " ") {
            event.preventDefault();
            state.lineTool.isTyping = true;
            state.lineTool.lengthInput += event.key;
            renderFrame();
            return;
          }
          if (event.key === ".") {
            event.preventDefault();
            state.lineTool.lengthInput += ".";
            renderFrame();
            return;
          }
          if (event.key === "Backspace") {
            event.preventDefault();
            state.lineTool.lengthInput = state.lineTool.lengthInput.slice(
              0,
              -1,
            );
            if (!state.lineTool.lengthInput) state.lineTool.isTyping = false;
            renderFrame();
            return;
          }
          if (event.key === "Enter" && state.lineTool.previewEnd) {
            event.preventDefault();
            finalizeLineTool(state.lineTool.previewEnd);
            return;
          }
          if (event.key === "Escape") {
            event.preventDefault();
            state.lineTool.step = 0;
            state.lineTool.startPoint = null;
            state.lineTool.previewEnd = null;
            state.lineTool.lengthInput = "";
            state.lineTool.isTyping = false;
            renderFrame();
            return;
          }
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

      // Emitters removed — now only exist as line behaviors

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
      // Emitters removed from scene format — now only exist as line behaviors
      state.backgroundImage = state.backgroundDataUrl
        ? await loadImage(state.backgroundDataUrl)
        : null;
      renderer.resize(state.canvas.width, state.canvas.height);
      updateCanvasAspect();
      rebuildAudioBindings();
      clearSelection();
      clearLoop();
      resetTransportClock();
      syncUI();
      renderFrame();
    }

    function rebuildAudioBindings() {
      // Lines: ensure note/midiChannel + rebuild sound
      state.lines.forEach(function (line) {
        if (line.note == null) line.note = 60;
        if (line.midiChannel == null) line.midiChannel = 1;
        if (line.midi) {
          if (line.midi.note == null) line.midi.note = line.note;
          if (line.midi.channel == null) line.midi.channel = line.midiChannel;
        }
        line.sound = buildSoundConfig(
          line.midi ? line.midi.note : line.note,
          line.midi ? line.midi.channel : line.midiChannel,
        );
      });

      // Shapes: ensure note/midiChannel on every segment + rebuild sound
      (state.shapes || []).forEach(function (shape) {
        shape.segments.forEach(function (seg) {
          if (seg.note == null) seg.note = 60;
          if (seg.midiChannel == null) seg.midiChannel = 1;
          seg.sound = buildSoundConfig(seg.note, seg.midiChannel);
        });
      });

      // Text objects: ensure note/midiChannel + rebuild sound
      (state.textObjects || []).forEach(function (text) {
        if (text.note == null) text.note = 60;
        if (text.midiChannel == null) text.midiChannel = 1;
        if (text.midi) {
          if (text.midi.note == null) text.midi.note = text.note;
          if (text.midi.channel == null) text.midi.channel = text.midiChannel;
        }
        text.sound = buildSoundConfig(
          text.midi ? text.midi.note : text.note,
          text.midi ? text.midi.channel : text.midiChannel,
        );
      });
    }

    function updateCanvasAspect() {
      canvasWrap.style.aspectRatio =
        state.canvas.width + " / " + state.canvas.height;
    }

    function getSampleCount(noteClass) {
      var bank = sampleMap[noteClass];
      return bank ? bank.length : 0;
    }

    // ── Sampler Targeting ────────────────────────────────
    var hoveredNoteClass = null;

    function highlightActiveRow(noteClass) {
      var container = document.getElementById("sampler-key-list");
      if (!container) return;
      container.querySelectorAll(".sampler-key").forEach(function (row) {
        var nc = Number(row.dataset.noteClass);
        row.classList.toggle("sampler-key--active", nc === noteClass);
      });
    }

    function updateColorSwatch(color) {
      if (!color) return;
      var input = controls && controls.elements && controls.elements.lineColor;
      if (!input) return;
      input.value = color;
    }

    function highlightNoteCell(noteClass) {
      document
        .querySelectorAll(".note-cell[data-note-class]")
        .forEach(function (cell) {
          var nc = Number(cell.dataset.noteClass);
          cell.classList.toggle("active", nc === noteClass);
        });
    }

    async function loadSampleToNote(file, noteClass) {
      if (noteClass === null || isNaN(noteClass)) {
        console.warn("[sampler] No valid target note — drop ignored");
        return false;
      }
      var context = ensureAudioContext();
      if (!context) return false;
      if (context.state !== "running") {
        await context.resume().catch(function () {});
      }
      try {
        var buf = await file.arrayBuffer();
        var decoded = await context.decodeAudioData(buf);
        if (!sampleMap[noteClass]) sampleMap[noteClass] = [];
        if (sampleMap[noteClass].length >= 3) sampleMap[noteClass].shift();
        sampleMap[noteClass].push(decoded);
        if (state.sampleBanks && state.sampleBanks[noteClass]) {
          state.sampleBanks[noteClass].index = 0;
        }
        return true;
      } catch (err) {
        console.warn("[sampler] Failed to decode:", file.name, err);
        return false;
      }
    }

    function syncSamplerTab() {
      var container = document.getElementById("sampler-key-list");
      if (!container) return;
      var solo = state.audio.soloNoteClass;
      var html = "";
      for (var i = 0; i < 12; i++) {
        var count = getSampleCount(i);
        var isSolo = solo === i;
        var dimmed = solo !== null && !isSolo;
        var bankMode =
          (state.sampleBanks[i] && state.sampleBanks[i].mode) || "single";
        html +=
          '<div class="sampler-key' +
          (isSolo ? " sampler-key--solo" : "") +
          (dimmed ? " sampler-key--dim" : "") +
          '" data-note-class="' +
          i +
          '">' +
          '<span class="sampler-key__name">' +
          NOTE_NAMES[i] +
          "</span>" +
          '<span class="sampler-key__count">(' +
          count +
          ")</span>" +
          (count > 1
            ? '<select class="sampler-key__mode" data-nc="' +
              i +
              '" onclick="event.stopPropagation()">' +
              ["single", "roundRobin", "random", "stack"]
                .map(function (m) {
                  return (
                    '<option value="' +
                    m +
                    '"' +
                    (bankMode === m ? " selected" : "") +
                    ">" +
                    m +
                    "</option>"
                  );
                })
                .join("") +
              "</select>"
            : "") +
          "</div>";
      }
      container.innerHTML = html;

      // Per-row bindings — click, hover, drag, drop
      container.querySelectorAll(".sampler-key").forEach(function (el) {
        var nc = Number(el.dataset.noteClass);

        // Step 2 — click sets activeNote + highlights
        el.addEventListener("click", function () {
          state.sampler.activeNote = nc;
          highlightActiveRow(nc);
        });

        // Double-click toggles solo
        el.addEventListener("dblclick", function (e) {
          e.stopPropagation();
          state.audio.soloNoteClass =
            state.audio.soloNoteClass === nc ? null : nc;
          syncSamplerTab();
        });

        // Step 3 — hover tracks drop target
        el.addEventListener("mouseenter", function () {
          hoveredNoteClass = nc;
        });
        el.addEventListener("mouseleave", function () {
          hoveredNoteClass = null;
        });

        // Dragover/dragleave visual feedback
        el.addEventListener("dragover", function (e) {
          e.preventDefault();
          e.stopPropagation();
          hoveredNoteClass = nc;
          el.classList.add("sampler-key--drag-over");
        });
        el.addEventListener("dragleave", function () {
          hoveredNoteClass = null;
          el.classList.remove("sampler-key--drag-over");
        });

        // Step 5 — per-row drop: explicit note, no fallback to 0
        el.addEventListener("drop", async function (e) {
          e.preventDefault();
          e.stopPropagation();
          el.classList.remove("sampler-key--drag-over");
          hoveredNoteClass = null;

          var files = Array.prototype.slice
            .call(e.dataTransfer.files)
            .filter(function (f) {
              return f.type.includes("audio");
            });
          if (!files.length) return;

          var loaded = 0;
          await Promise.all(
            files.map(async function (file) {
              var ok = await loadSampleToNote(file, nc);
              if (ok) loaded++;
            }),
          );

          if (loaded > 0) {
            saveSamples();
            syncSamplerTab();
            state.sampler.activeNote = nc;
            highlightActiveRow(nc);
            showToast("Loaded " + loaded + " sample(s) → " + NOTE_NAMES[nc]);
          }
        });
      });

      // Mode select binding
      container.querySelectorAll(".sampler-key__mode").forEach(function (sel) {
        sel.addEventListener("change", function () {
          var nc = Number(sel.dataset.nc);
          state.sampleBanks[nc].mode = sel.value;
          state.sampleBanks[nc].index = 0;
        });
      });

      // Fallback mode display
      var fallbackEl = document.getElementById("sampler-fallback-mode");
      if (fallbackEl)
        fallbackEl.textContent = state.audio.fallbackMode || "nearest";
    }

    function syncUI() {
      controls.syncState(state);
      controls.syncTool(state.tool);
      controls.syncShapeSelection(state.selectedShape);
      syncSelectionPanel();
      controls.syncShortcutVisibility(state.ui.shortcutsVisible);
      syncSamplerTab();
      if (controls.elements.togglePlayback) {
        controls.elements.togglePlayback.innerHTML = isPlaying
          ? "&#9646;&#9646;"
          : "&#9654;";
      }
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
      syncInspectorToObject(selection);

      // Behavior emitter fields visibility + sync
      var showEmitterFields = false;
      if (selection) {
        var bType = null;
        if (selection.behavior) bType = selection.behavior.type;
        if (!bType && selection.segments && selection.segments.length) {
          bType = selection.segments[0].behavior
            ? selection.segments[0].behavior.type
            : null;
        }
        showEmitterFields = bType === "emitter";
      }
      if (controls.elements.behaviorEmitterFields) {
        controls.elements.behaviorEmitterFields.classList.toggle(
          "hidden",
          !showEmitterFields,
        );
      }
      if (showEmitterFields && selection) {
        var cfg =
          selection.behavior && selection.behavior.type === "emitter"
            ? selection.behavior.emitterConfig
            : null;
        if (!cfg && selection.segments && selection.segments.length) {
          var seg = selection.segments[0];
          cfg =
            seg.behavior && seg.behavior.type === "emitter"
              ? seg.behavior.emitterConfig
              : null;
        }
        cfg = cfg || {
          rate: 400,
          direction: (270 * Math.PI) / 180,
          strength: 6,
          isMuted: false,
          quantize: false,
          quantizeDivision: 16,
        };

        // Backward compat: convert old emitterVx/Vy to direction+strength
        if (cfg.direction == null) {
          var oldVx = selection.behavior
            ? selection.behavior.emitterVx || 0
            : 0;
          var oldVy = selection.behavior
            ? selection.behavior.emitterVy || 0
            : 0;
          cfg.direction = Math.atan2(oldVy, oldVx);
          cfg.strength = Math.hypot(oldVx, oldVy) || 6;
        }

        if (controls.elements.behaviorEmitterRate) {
          controls.elements.behaviorEmitterRate.value = String(cfg.rate || 400);
          if (controls.elements.behaviorEmitterRateValue) {
            controls.elements.behaviorEmitterRateValue.textContent = String(
              cfg.rate || 400,
            );
          }
        }
        if (controls.elements.behaviorEmitterDirection) {
          var deg = Math.round(((cfg.direction || 0) * 180) / Math.PI);
          controls.elements.behaviorEmitterDirection.value = String(
            ((deg % 360) + 360) % 360,
          );
          if (controls.elements.behaviorEmitterDirectionValue) {
            controls.elements.behaviorEmitterDirectionValue.textContent =
              String(((deg % 360) + 360) % 360);
          }
        }
        if (controls.elements.behaviorEmitterStrength) {
          controls.elements.behaviorEmitterStrength.value = String(
            cfg.strength != null ? cfg.strength : 6,
          );
          if (controls.elements.behaviorEmitterStrengthValue) {
            controls.elements.behaviorEmitterStrengthValue.textContent = Number(
              cfg.strength != null ? cfg.strength : 6,
            ).toFixed(1);
          }
        }
        if (controls.elements.behaviorEmitterSilent) {
          controls.elements.behaviorEmitterSilent.checked =
            cfg.isMuted || false;
        }
        if (controls.elements.behaviorEmitterQuantize) {
          controls.elements.behaviorEmitterQuantize.checked =
            cfg.quantize || false;
        }
        if (controls.elements.behaviorEmitterQuantizeDiv) {
          controls.elements.behaviorEmitterQuantizeDiv.value = String(
            cfg.quantizeDivision || 16,
          );
        }
      }

      // Motion panel visibility + sync
      var isShape =
        state.multiSelection.length === 1 &&
        state.multiSelection[0].type === "shape";
      if (controls.elements.motionInspectorBlock) {
        controls.elements.motionInspectorBlock.classList.toggle(
          "hidden",
          !isShape,
        );
      }
      if (isShape && selection) {
        var m = selection.motion || {
          enabled: false,
          vx: 0,
          vy: 0,
          angularVelocity: 0,
          loop: true,
        };
        if (controls.elements.motionEnabled) {
          controls.elements.motionEnabled.checked = m.enabled;
        }
        if (controls.elements.motionVx) {
          controls.elements.motionVx.value = String(m.vx);
          if (controls.elements.motionVxValue) {
            controls.elements.motionVxValue.textContent = String(m.vx);
          }
        }
        if (controls.elements.motionVy) {
          controls.elements.motionVy.value = String(m.vy);
          if (controls.elements.motionVyValue) {
            controls.elements.motionVyValue.textContent = String(m.vy);
          }
        }
        if (controls.elements.motionRot) {
          controls.elements.motionRot.value = String(m.angularVelocity);
          if (controls.elements.motionRotValue) {
            controls.elements.motionRotValue.textContent = Number(
              m.angularVelocity,
            ).toFixed(1);
          }
        }
        if (controls.elements.motionLoop) {
          controls.elements.motionLoop.checked = m.loop;
        }
      }
    }

    function syncInspectorToObject(obj) {
      if (!obj) return;

      var color = getObjectColor(obj);

      // Resolve note — prefer explicit midi/note, fall back to color mapping
      var note =
        obj.midi && typeof obj.midi.note === "number"
          ? obj.midi.note
          : typeof obj.note === "number"
            ? obj.note
            : null;

      var noteClass = null;
      if (note != null) {
        noteClass = ((note % 12) + 12) % 12;
      } else if (color) {
        noteClass = getNoteFromColor(color);
        if (noteClass != null) note = 48 + noteClass;
      }

      if (note != null) {
        state.defaults.note = note;
        state.ui.selectedNoteClass = ((note % 12) + 12) % 12;
        controls.elements.activeNote.value = String(note);
      }

      // Step 4 — swatch always shows canonical hex color
      updateColorSwatch(color || (note != null ? noteToColor(note) : null));

      if (noteClass != null) {
        state.sampler.activeNote = noteClass;
        highlightActiveRow(noteClass);
        highlightNoteCell(noteClass);
      }

      state.ui.isMuted = !!(obj.behavior && obj.behavior.isMuted);
    }

    function applyBehaviorEmitterFields() {
      if (!state.multiSelection.length) return;

      var rateEl =
        controls.elements.behaviorEmitterRate ||
        document.getElementById("behavior-emitter-rate");
      var dirEl =
        controls.elements.behaviorEmitterDirection ||
        document.getElementById("behavior-emitter-direction");
      var strengthEl =
        controls.elements.behaviorEmitterStrength ||
        document.getElementById("behavior-emitter-strength");
      var muteEl =
        controls.elements.behaviorEmitterSilent ||
        document.getElementById("behavior-emitter-mute");
      var quantizeEl =
        controls.elements.behaviorEmitterQuantize ||
        document.getElementById("behavior-emitter-quantize");
      var quantizeDivEl =
        controls.elements.behaviorEmitterQuantizeDiv ||
        document.getElementById("behavior-emitter-quantize-div");

      var rate = rateEl ? Math.max(100, Number(rateEl.value) || 400) : 400;
      var dirDeg = dirEl ? Number(dirEl.value) : 270;
      var direction = (dirDeg * Math.PI) / 180;
      var strength = strengthEl ? Math.max(0, Number(strengthEl.value)) : 6;
      var isMuted = muteEl ? muteEl.checked : false;
      var quantize = quantizeEl ? quantizeEl.checked : false;
      var quantizeDivision = quantizeDivEl
        ? Number(quantizeDivEl.value) || 16
        : 16;

      function applyToConfig(obj, cfg) {
        cfg.rate = rate;
        cfg.direction = direction;
        cfg.strength = strength;
        cfg.isMuted = isMuted;
        cfg.quantize = quantize;
        cfg.quantizeDivision = quantizeDivision;
        // Also write to the object directly for collision gate
        obj.isMuted = isMuted;
      }

      state.multiSelection.forEach(function (entry) {
        if (entry.type === "line") {
          var line = state.lines.find(function (l) {
            return l.id === entry.id;
          });
          if (!line || !line.behavior) return;
          if (!line.behavior.emitterConfig)
            line.behavior.emitterConfig = { lastSpawn: 0 };
          applyToConfig(line, line.behavior.emitterConfig);
        }
        if (entry.type === "shape") {
          var shape = (state.shapes || []).find(function (s) {
            return s.id === entry.id;
          });
          if (!shape) return;
          shape.segments.forEach(function (seg) {
            if (!seg.behavior) return;
            if (!seg.behavior.emitterConfig)
              seg.behavior.emitterConfig = { lastSpawn: 0 };
            applyToConfig(seg, seg.behavior.emitterConfig);
          });
        }
      });
      renderFrame();
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

    function getSelectedWalker() {
      // Walker is selected if the active stroke has a walker attached
      var sel = state.multiSelection[0];
      if (!sel || sel.type !== "stroke") return null;
      return (
        state.walkers.find(function (w) {
          return w.stroke && w.stroke.id === sel.id;
        }) || null
      );
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
      if (state.ui.presentation || state.balls.length >= 800) {
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

      if (entry.type === "emitter") {
        var em = state.emitters.find(function (e) {
          return e.id === entry.id;
        });
        if (em) {
          em.x += dx;
          em.y += dy;
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
        copy.segments.forEach(function (seg, i) {
          rebuildSoundConfig(seg);
          // Preserve emitterConfig from source segment
          var srcSeg = src.segments[i];
          if (srcSeg && srcSeg.behavior && srcSeg.behavior.emitterConfig) {
            if (!seg.behavior) seg.behavior = {};
            seg.behavior.emitterConfig = clone(srcSeg.behavior.emitterConfig);
            seg.behavior.emitterConfig.lastSpawn = 0;
            seg.behavior.emitterVx = srcSeg.behavior.emitterVx;
            seg.behavior.emitterVy = srcSeg.behavior.emitterVy;
          }
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
        // Restore emitterConfig lost through hydrateLine
        if (raw.behavior && raw.behavior.emitterConfig) {
          line.behavior.emitterConfig = clone(raw.behavior.emitterConfig);
          line.behavior.emitterConfig.lastSpawn = 0;
          line.behavior.emitterVx = raw.behavior.emitterVx;
          line.behavior.emitterVy = raw.behavior.emitterVy;
        }
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
        strokes: state.strokes.map(function (s) {
          return {
            id: s.id,
            type: s.type,
            points: s.points.slice(),
            width: s.width,
            color: s.color,
            renderMode: s.renderMode,
            mode: s.mode,
            sound: clone(s.sound),
            behavior: clone(s.behavior),
            specks: [],
            drips: [],
          };
        }),
        // Emitters removed — now only exist as line behaviors
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
            // Initialize emitterConfig when behavior is set to emitter
            if (
              patch.behaviorType === "emitter" &&
              !seg.behavior.emitterConfig
            ) {
              seg.behavior.emitterConfig = {
                rate: 400,
                direction: (270 * Math.PI) / 180,
                strength: 6,
                isMuted: false,
                quantize: false,
                quantizeDivision: 16,
                lastSpawn: 0,
              };
            }
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
          // Initialize emitterConfig when behavior is set to emitter
          if (
            patch.behaviorType === "emitter" &&
            !object.behavior.emitterConfig
          ) {
            object.behavior.emitterConfig = {
              rate: 400,
              direction: (270 * Math.PI) / 180,
              strength: 6,
              isMuted: false,
              quantize: false,
              quantizeDivision: 16,
              lastSpawn: 0,
            };
          }
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
      state.ui.selectedNoteClass = ((noteClass % 12) + 12) % 12;
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
        rootNote: 60,
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
      if (!sourceObject?.sound?.midi) return;
      if (isMuted(sourceObject)) return;
      if (sourceObject.type === "text" && sourceObject.mode === "annotation")
        return;
      if (sourceObject.behavior?.emitterConfig?.isMuted) return;
      if (sourceObject.behavior?.emitterConfig?.mute) return;

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

    // Queue an audio event from inside the physics loop — drains after physics
    function queueAudioEvent(type, sourceObject) {
      state.audioQueue.push({ type: type, sourceObject: sourceObject });
    }

    function processAudioQueue() {
      var queue = state.audioQueue;
      if (!queue.length) return;
      state.audioQueue = [];
      for (var i = 0; i < queue.length; i++) {
        var evt = queue[i];
        if (evt.type === "wall") {
          eventBus.triggerEvent("wall", evt.sourceObject);
        } else {
          dispatchCollisionEvent(evt.sourceObject);
        }
      }
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
      state.strokes = [];
      state.walkers = [];
      state.mopTool.activeStrokeId = null;
      surfaceCtx.clearRect(0, 0, surfaceCanvas.width, surfaceCanvas.height);
      state.emitters = [];
      clearLoop();
      clearSelection();
      state.swarm.count = 0;
      drawTools.finishPath();
      sendAllNotesOff();
      renderFrame();
      syncUI();
    }

    function clearBalls() {
      state.balls = [];
      state.swarm.count = 0;
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

      const dt = delta / 1000; // real elapsed time
      tick(dt, frameTime);

      renderFrame();
      loopId = global.requestAnimationFrame(loop);
    }

    function updateBehaviorEmitters(now) {
      if (!state.lines || !state.lines.length) return;
      if (state.balls.length >= 800) return;

      state.lines.forEach(function (line) {
        if (!line.behavior || line.behavior.type !== "emitter") return;

        if (!line.behavior.emitterConfig) {
          line.behavior.emitterConfig = {
            rate: 400,
            direction: (270 * Math.PI) / 180,
            strength: 6,
            isMuted: false,
            quantize: false,
            quantizeDivision: 16,
            lastSpawn: 0,
            blueprint: {
              note: 60,
              velocityBase: 70,
              velocityRange: [60, 120],
              pitchDrift: 0.02,
              retriggerMode: "energy",
            },
          };
        }
        var cfg = line.behavior.emitterConfig;

        // Backward compat
        if (cfg.direction == null) {
          cfg.direction = Math.atan2(
            line.behavior.emitterVy || 0,
            line.behavior.emitterVx || 0,
          );
          cfg.strength =
            Math.hypot(
              line.behavior.emitterVx || 0,
              line.behavior.emitterVy || 0,
            ) || 6;
        }

        var intervalMs = cfg.quantize
          ? (60000 / (state.bpm || 120)) * (4 / (cfg.quantizeDivision || 16))
          : Math.max(100, cfg.rate || 400);

        if (now - cfg.lastSpawn < intervalMs) return;
        cfg.lastSpawn = now - ((now - cfg.lastSpawn) % intervalMs);

        var direction =
          cfg.direction != null ? cfg.direction : (270 * Math.PI) / 180;
        var strength = cfg.strength != null ? cfg.strength : 6;
        var dirX = Math.cos(direction);
        var dirY = Math.sin(direction);

        // Edge spawn: random point along line + offset to correct side
        var dx = line.x2 - line.x1;
        var dy = line.y2 - line.y1;
        var len = Math.hypot(dx, dy) || 1;
        var nx = -dy / len;
        var ny = dx / len;
        var dot = nx * dirX + ny * dirY;
        var side = dot >= 0 ? 1 : -1;
        var t = Math.random();
        var spawnX = line.x1 + dx * t + nx * 8 * side;
        var spawnY = line.y1 + dy * t + ny * 8 * side;

        var ball = SBE.Swarm.createBall(state.canvas, state.swarm, false);
        // Offset along direction to clear geometry before collision window opens
        ball.x = spawnX + dirX * 12;
        ball.y = spawnY + dirY * 12;
        ball.vx = dirX * strength;
        ball.vy = dirY * strength;
        ball = normalizeBall(ball);
        ball.sourceId = line.id;
        ball.sourceType = "emitter";
        ball.behavior = clone(line.behavior || {});
        if (!line.sound) {
          console.warn("[emitter] Missing sound on line", line.id);
          return;
        }
        ball.sound = clone(line.sound);
        ball._played = false;
        var sourceNote =
          (line && line.midi && typeof line.midi.note === "number"
            ? line.midi.note
            : null) ??
          (line &&
          line.sound &&
          line.sound.midi &&
          typeof line.sound.midi.note === "number"
            ? line.sound.midi.note
            : null) ??
          (line && typeof line.note === "number" ? line.note : null) ??
          60;
        ball.blueprint = clone(
          cfg.blueprint || {
            note: sourceNote,
            velocityBase: 70,
            velocityRange: [60, 120],
            pitchDrift: 0.02,
            retriggerMode: "energy",
          },
        );
        state.balls.push(ball);
        state.swarm.count = state.balls.length;
      });
    }

    function getShapeCenter(shape) {
      if (!shape.segments || !shape.segments.length) {
        return { x: shape.position.x, y: shape.position.y };
      }
      var sx = 0,
        sy = 0,
        count = 0;
      shape.segments.forEach(function (seg) {
        sx += seg.x1 + seg.x2;
        sy += seg.y1 + seg.y2;
        count += 2;
      });
      return { x: sx / count, y: sy / count };
    }

    function getLineCenter(line) {
      return {
        x: (line.x1 + line.x2) * 0.5,
        y: (line.y1 + line.y2) * 0.5,
      };
    }

    function updateShapeEmitters(now) {
      if (state.balls.length >= 800) return;

      (state.shapes || []).forEach(function (shape) {
        shape.segments.forEach(function (seg) {
          if (!seg.behavior || seg.behavior.type !== "emitter") return;

          if (!seg.behavior.emitterConfig) {
            seg.behavior.emitterConfig = {
              rate: 400,
              direction: (270 * Math.PI) / 180,
              strength: 6,
              isMuted: false,
              quantize: false,
              quantizeDivision: 16,
              lastSpawn: 0,
              blueprint: {
                note: 60,
                velocityBase: 70,
                velocityRange: [60, 120],
                pitchDrift: 0.02,
                retriggerMode: "energy",
              },
            };
          }
          var cfg = seg.behavior.emitterConfig;

          // Backward compat
          if (cfg.direction == null) {
            cfg.direction = Math.atan2(
              seg.behavior.emitterVy || 0,
              seg.behavior.emitterVx || 0,
            );
            cfg.strength =
              Math.hypot(
                seg.behavior.emitterVx || 0,
                seg.behavior.emitterVy || 0,
              ) || 6;
          }

          var intervalMs = cfg.quantize
            ? (60000 / (state.bpm || 120)) * (4 / (cfg.quantizeDivision || 16))
            : Math.max(100, cfg.rate || 400);

          if (now - cfg.lastSpawn < intervalMs) return;
          cfg.lastSpawn = now - ((now - cfg.lastSpawn) % intervalMs);

          var direction =
            cfg.direction != null ? cfg.direction : (270 * Math.PI) / 180;
          var strength = cfg.strength != null ? cfg.strength : 6;
          var dirX = Math.cos(direction);
          var dirY = Math.sin(direction);

          // Edge spawn from shape bounds
          var bounds =
            shape.bounds ||
            (function () {
              var xs = [seg.x1, seg.x2],
                ys = [seg.y1, seg.y2];
              shape.segments.forEach(function (s) {
                xs.push(s.x1, s.x2);
                ys.push(s.y1, s.y2);
              });
              return {
                minX: Math.min.apply(null, xs),
                maxX: Math.max.apply(null, xs),
                minY: Math.min.apply(null, ys),
                maxY: Math.max.apply(null, ys),
              };
            })();

          var spawnX, spawnY;
          if (Math.abs(dirX) > Math.abs(dirY)) {
            spawnX = dirX > 0 ? bounds.maxX : bounds.minX;
            spawnY = bounds.minY + Math.random() * (bounds.maxY - bounds.minY);
          } else {
            spawnX = bounds.minX + Math.random() * (bounds.maxX - bounds.minX);
            spawnY = dirY > 0 ? bounds.maxY : bounds.minY;
          }

          var ball = SBE.Swarm.createBall(state.canvas, state.swarm, false);
          // Offset along direction to clear geometry before collision window opens
          ball.x = spawnX + dirX * 12;
          ball.y = spawnY + dirY * 12;
          ball.vx = dirX * strength;
          ball.vy = dirY * strength;
          ball = normalizeBall(ball);
          ball.sourceId = seg.id;
          ball.sourceType = "emitter";
          ball.behavior = clone(seg.behavior || {});
          if (!seg.sound) {
            console.warn("[emitter] Missing sound on segment", seg.id);
            return;
          }
          ball.sound = clone(seg.sound);
          ball._played = false;
          var sourceNote =
            (seg && seg.midi && typeof seg.midi.note === "number"
              ? seg.midi.note
              : null) ??
            (seg &&
            seg.sound &&
            seg.sound.midi &&
            typeof seg.sound.midi.note === "number"
              ? seg.sound.midi.note
              : null) ??
            (seg && typeof seg.note === "number" ? seg.note : null) ??
            60;
          ball.blueprint = clone(
            cfg.blueprint || {
              note: sourceNote,
              velocityBase: 70,
              velocityRange: [60, 120],
              pitchDrift: 0.02,
              retriggerMode: "energy",
            },
          );
          state.balls.push(ball);
          state.swarm.count = state.balls.length;
        });
      });
    }

    function getLoopDurationMs(bpm, bars) {
      var beatsPerBar = 4;
      var totalBeats = bars * beatsPerBar;
      var beatDurationMs = 60000 / bpm;
      return totalBeats * beatDurationMs;
    }

    function getLoopPhase(timeMs, loopDurationMs) {
      if (!loopDurationMs || loopDurationMs <= 0) return 0;
      return (timeMs % loopDurationMs) / loopDurationMs;
    }

    function getDensityLevel(count) {
      if (count < 3) return "low";
      if (count < 10) return "mid";
      return "high";
    }

    function modulateNoteByPhase(note, phase) {
      if (phase < 0.25) return note - 12;
      if (phase < 0.75) return note;
      return note + 12;
    }

    function tick(dt, now) {
      if (!isPlaying) {
        return;
      }

      // Compute loop phase
      var bpm = state.bpm || 120;
      var bars = (state.loop && state.loop.bars) || 8;
      var loopMs = getLoopDurationMs(bpm, bars);
      var transportTimeSec = getTransportTime();
      var transportTimeMs = transportTimeSec * 1000;
      state.loopPhase = getLoopPhase(transportTimeMs, loopMs);

      var worldMode =
        typeof state.world === "string"
          ? state.world
          : state.world && state.world.mode
            ? state.world.mode
            : "gravity";

      var damp = state.physics.damping;
      var maxSpd = state.physics.maxSpeed;
      var scale = dt * 60;
      var MOTION_SCALE = 60;

      if (worldMode === "gravity" || worldMode === "flow") {
        var worldDirection =
          state.world && state.world.direction
            ? state.world.direction
            : state.physics.gravity;
        var worldStrength =
          state.world && Number.isFinite(state.world.strength)
            ? state.world.strength
            : Math.hypot(state.physics.gravity.x, state.physics.gravity.y);

        state.balls.forEach(function (ball) {
          ball.vx += worldDirection.x * worldStrength * scale;
          ball.vy += worldDirection.y * worldStrength * scale;
          ball.vx *= damp;
          ball.vy *= damp;

          var spd = Math.hypot(ball.vx, ball.vy);
          if (spd > maxSpd) {
            var s = maxSpd / spd;
            ball.vx *= s;
            ball.vy *= s;
          }

          ball.x += ball.vx * dt * MOTION_SCALE;
          ball.y += ball.vy * dt * MOTION_SCALE;

          var FLOOR_Y = state.canvas.height * 0.92;
          if (ball.y > FLOOR_Y) {
            ball._dead = true;
          }
        });
        // Dead ball cleanup now handled globally after collision pass
      }

      if (worldMode === "planar") {
        state.balls.forEach(function (ball) {
          ball.vx *= damp;
          ball.vy *= damp;

          var spd = Math.hypot(ball.vx, ball.vy);
          if (spd > maxSpd) {
            var s = maxSpd / spd;
            ball.vx *= s;
            ball.vy *= s;
          }

          ball.x += ball.vx * dt * MOTION_SCALE;
          ball.y += ball.vy * dt * MOTION_SCALE;

          // Bounce at canvas edges
          var r = ball.radius || 6;
          if (ball.x < r) {
            ball.x = r;
            ball.vx = Math.abs(ball.vx);
          }
          if (ball.x > state.canvas.width - r) {
            ball.x = state.canvas.width - r;
            ball.vx = -Math.abs(ball.vx);
          }
          if (ball.y < r) {
            ball.y = r;
            ball.vy = Math.abs(ball.vy);
          }
          if (ball.y > state.canvas.height - r) {
            ball.y = state.canvas.height - r;
            ball.vy = -Math.abs(ball.vy);
          }
        });
      }

      if (worldMode === "zero-g") {
        var noise = 0.02;
        state.balls.forEach(function (ball) {
          ball.vx += (Math.random() - 0.5) * noise;
          ball.vy += (Math.random() - 0.5) * noise;
          ball.vx *= damp;
          ball.vy *= damp;

          var spd = Math.hypot(ball.vx, ball.vy);
          if (spd > maxSpd) {
            var s = maxSpd / spd;
            ball.vx *= s;
            ball.vy *= s;
          }

          ball.x += ball.vx * dt * MOTION_SCALE;
          ball.y += ball.vy * dt * MOTION_SCALE;

          // Wrap at edges
          if (ball.x < 0) ball.x += state.canvas.width;
          if (ball.x > state.canvas.width) ball.x -= state.canvas.width;
          if (ball.y < 0) ball.y += state.canvas.height;
          if (ball.y > state.canvas.height) ball.y -= state.canvas.height;
        });
      }

      if (worldMode === "swarm") {
        var activeForceLines = state.lines
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
      }

      // Behavior emitters (lines with behavior.type === "emitter")
      updateBehaviorEmitters(now);

      // Shape-based emitters (behavior type === "emitter")
      updateShapeEmitters(now);

      // Shape motion
      if (SBE.MotionSystem && state.shapes && state.shapes.length) {
        SBE.MotionSystem.updateAll(state.shapes, dt, {
          width: state.canvas.width,
          height: state.canvas.height,
        });
      }

      // Mop stroke drip physics
      updateStrokes(dt);

      // PathWalker update
      updateClock(now);
      updateWalkers(dt);
      updateWalkerMusic();

      // Drain audio queue — all physics/emitter/collision events batched here
      processAudioQueue();

      // Motion-driven sound expression with blueprint inheritance
      state.balls.forEach(function (ball) {
        if (!ball.sound || !ball.blueprint) return;
        if (isMuted(ball)) return;

        var speed = Math.hypot(ball.vx, ball.vy);

        if (speed > 2.5 && !ball._played) {
          var bp = ball.blueprint || {};
          var base = bp.velocityBase || 70;
          var range = bp.velocityRange || [60, 120];
          var velocityBoost = clampInt(
            base + (ball.hitCount || 0) * 20,
            range[0],
            range[1],
          );

          if (ball.sound.midi) {
            ball.sound.midi.velocity = velocityBoost;
          }

          if (ball._baseFrequency) {
            var driftAmount =
              (bp.pitchDrift != null ? bp.pitchDrift : 0.02) * 2;
            var drift = 1 + (Math.random() - 0.5) * driftAmount;
            ball.sound.frequency = ball._baseFrequency * drift;
          }

          if (
            ball.sound &&
            ball.sound.midi &&
            ball.blueprint &&
            ball.blueprint.note !== undefined
          ) {
            ball.sound.midi.note = ball.blueprint.note;
          }

          queueAudioEvent("collision", ball);
          ball._played = true;
        }

        if (speed < 1.2) {
          ball._played = false;
        }
      });

      // Temporarily hide spawn-immune balls from collision detection
      const allBalls = state.balls;
      state.balls = allBalls.filter(function (b) {
        return now - b.spawnTime >= b.collisionDelay;
      });

      const collisions = SBE.Collision.detectCollisions(state, now);
      state.collisionCount = collisions.length;
      const soundSources = SBE.Collision.resolveCollisions(
        state,
        collisions,
        now,
      );

      // Restore all balls (immune + eligible)
      state.balls = allBalls;

      // Kill balls on collision — skip spawn-immune balls
      collisions.forEach(function (collision) {
        if (!collision.ball) return;
        var b = collision.ball;
        b.hitCount = (b.hitCount || 0) + 1;
        if (b._dead) return;
        if (now - b.spawnTime < b.collisionDelay) return;
        if (b.hitCount > 1) {
          b._dead = true;
        }
      });

      // Wall bounce events
      collisions.forEach(function (collision) {
        if (collision.type === "wall") {
          queueAudioEvent("wall", wallSoundSource);
        }
      });

      // Collision sound — triggered by the hit object (line/segment), not the ball
      soundSources.forEach(function (source) {
        if (!source.line || !source.line.sound) return;
        if (isMuted(source.line)) return;
        if (
          source.line.sourceType === "text" &&
          source.line.mode === "annotation"
        )
          return;
        console.log("COLLISION SOUND SOURCE", {
          note: source.line.sound?.midi?.note,
          color: source.line.color,
          type: "line",
        });
        queueAudioEvent("collision", source.line);
      });

      // Cleanup dead balls — runs every frame regardless of world mode
      state.balls = state.balls.filter(function (b) {
        return !b._dead;
      });
      state.swarm.count = state.balls.length;

      stabilizeBalls(collisions);
    }

    function renderFrame() {
      renderer.render(state, drawTools.getOverlays());
      var ctx = canvas.getContext("2d");
      // Change 3 — draw surface stamp layer first (persistent ink)
      ctx.drawImage(surfaceCanvas, 0, 0);
      renderStrokes(ctx);
      drawWalkers(ctx);
      drawParticleOverlays();
      drawDebugHUD();
      drawMutedOverlays();
      drawShapeIndicators();
      drawLinePreview();

      if (!window.noteElements) return;

      Object.keys(window.noteElements).forEach((n) => {
        updateNoteVisual(Number(n), window.noteElements[n]);
      });
    }

    function drawMutedOverlays() {
      var ctx = canvas.getContext("2d");

      // Muted lines — draw dark stroke on top of renderer output
      (state.lines || []).forEach(function (line) {
        if (
          !isMuted(line) &&
          !(
            line.behavior &&
            line.behavior.emitterConfig &&
            line.behavior.emitterConfig.isMuted
          )
        )
          return;
        var t = line.thickness || 3;
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = "rgba(0,0,0,0.6)";
        ctx.lineWidth = t + 4;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(line.x1, line.y1);
        ctx.lineTo(line.x2, line.y2);
        ctx.stroke();
        ctx.restore();
      });

      // Muted shape segments
      (state.shapes || []).forEach(function (shape) {
        (shape.segments || []).forEach(function (seg) {
          if (
            !isMuted(seg) &&
            !(
              seg.behavior &&
              seg.behavior.emitterConfig &&
              seg.behavior.emitterConfig.isMuted
            )
          )
            return;
          var t = seg.thickness || 3;
          ctx.save();
          ctx.globalAlpha = 0.3;
          ctx.strokeStyle = "rgba(0,0,0,0.6)";
          ctx.lineWidth = t + 4;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(seg.x1, seg.y1);
          ctx.lineTo(seg.x2, seg.y2);
          ctx.stroke();
          ctx.restore();
        });
      });
    }

    function updateNoteVisual(noteClass, element) {
      const last = noteActivity[noteClass];
      if (!last) return;

      const now = performance.now();
      const elapsed = now - last;

      const FLASH_MS = 120;

      if (elapsed < FLASH_MS) {
        const NOTE_KEYS = [
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
        const color = NOTE_COLORS[NOTE_KEYS[noteClass]];
        const velocity = noteVelocity[noteClass] || 0.5;
        const fade = 1 - elapsed / FLASH_MS;

        element.style.background = color;
        element.style.opacity = Math.max(0.25, velocity * fade);
      } else {
        element.style.background = "";
        element.style.opacity = "";
      }
    }

    function drawSoundHUD() {
      if (state.ui.cleanOutput || state.ui.presentation || !isPlaying) {
        return;
      }
      var ctx = canvas.getContext("2d");
      var density = getDensityLevel(state.collisionCount || 0);
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.font = "24px monospace";
      ctx.fillText("Density: " + density.toUpperCase(), 20, 50);
      const hasSamples = Object.values(sampleMap).some(
        (bank) => bank && bank.length > 0,
      );

      const status = hasSamples ? "Samples: READY" : "Samples: EMPTY";

      ctx.fillText(status, 20, 80);
      ctx.restore();
    }

    function drawParticleOverlays() {
      if (!state.balls.length) return;
      var ctx = canvas.getContext("2d");
      var color = state.swarm.color || "#f3f2ef";

      state.balls.forEach(function (ball) {
        // Draw trail
        if (ball.trailEnabled && ball.trail && ball.trail.length > 1) {
          ctx.save();
          ctx.strokeStyle = color;
          ctx.lineWidth = 1;
          ctx.lineCap = "round";
          for (var t = 1; t < ball.trail.length; t += 1) {
            ctx.globalAlpha = (t / ball.trail.length) * 0.3;
            ctx.beginPath();
            ctx.moveTo(ball.trail[t - 1].x, ball.trail[t - 1].y);
            ctx.lineTo(ball.trail[t].x, ball.trail[t].y);
            ctx.stroke();
          }
          ctx.restore();
        }

        // Draw shape overlay for non-circle shapes
        if (
          ball.shapeId &&
          ball.shapeId !== "circle" &&
          SHAPE_LIBRARY[ball.shapeId]
        ) {
          var segments = SHAPE_LIBRARY[ball.shapeId](
            { x: 0, y: 0 },
            ball.renderRadius * 2,
          );

          ctx.save();
          ctx.translate(ball.x, ball.y);
          ctx.rotate(ball.rotation || 0);
          ctx.strokeStyle = color;
          ctx.lineWidth = Math.max(
            1.5,
            ball.renderRadius - ball.collisionRadius,
          );
          ctx.globalAlpha = 0.72 + ball.energy * 0.14;

          segments.forEach(function (pts) {
            ctx.beginPath();
            pts.forEach(function (pt, i) {
              if (i === 0) ctx.moveTo(pt.x, pt.y);
              else ctx.lineTo(pt.x, pt.y);
            });
            ctx.stroke();
          });

          ctx.restore();
        }

        // Hit count overlay
        if (state.feedback && state.feedback.showHitCount) {
          ctx.save();
          ctx.fillStyle = "white";
          ctx.font = "10px monospace";
          ctx.textAlign = "center";
          ctx.fillText(
            ball.hitCount || 0,
            ball.x,
            ball.y - (ball.renderRadius + 6),
          );
          ctx.restore();
        }
      });
    }

    function drawDebugHUD() {
      if (!state.ui.debugHUD) return;
      if (!state.balls || !state.balls.length) return;
      var ctx = canvas.getContext("2d");
      ctx.save();
      ctx.font = "10px monospace";
      ctx.textAlign = "center";
      state.balls.forEach(function (ball) {
        if (!ball || !ball.sound || !ball.blueprint) return;
        var note =
          ball.sound.midi && ball.sound.midi.note != null
            ? ball.sound.midi.note
            : null;
        var noteName =
          note != null ? NOTE_NAMES[((note % 12) + 12) % 12] || "?" : "--";
        var bpNote = ball.blueprint.note != null ? ball.blueprint.note : null;
        var bpName =
          bpNote != null ? NOTE_NAMES[((bpNote % 12) + 12) % 12] || "?" : "--";
        var speed = Math.hypot(ball.vx || 0, ball.vy || 0).toFixed(1);
        var played = ball._played ? "1" : "0";
        var text = noteName + "/" + bpName + " v:" + speed + " p:" + played;
        // Color: green = note matches blueprint, red = mismatch
        ctx.fillStyle =
          note === bpNote ? "rgba(100,255,180,0.9)" : "rgba(255,80,80,0.95)";
        ctx.fillText(text, ball.x, ball.y - (ball.renderRadius + 10));
      });
      ctx.restore();
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

    function shouldTriggerOnBeat(windowSize = 0.02, swing = 0.1) {
      const beat = getTransportTime() / getBeatDuration();
      let phase = beat % 1;

      const isOffBeat = Math.floor(beat) % 2 === 1;
      if (isOffBeat) {
        phase = (phase + swing) % 1;
      }

      return phase < windowSize;
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

      var AudioCtor = global.AudioContext || global.webkitAudioContext;
      state.audio.context = new AudioCtor();

      // Master gain node (~-12dB) to prevent clipping
      state.audio.masterGain = state.audio.context.createGain();
      state.audio.masterGain.gain.value = 0.25;
      state.audio.masterGain.connect(state.audio.context.destination);

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
      ball.hitCount = 0;
      ball._dead = false;
      ball._played = false;
      ball.spawnTime = performance.now();
      ball.collisionDelay = 120;
      if (ball.sound && typeof ball.sound.frequency === "number") {
        ball._baseFrequency = ball.sound.frequency;
      }
      // Shape particle fields
      ball.shapeId = ball.shapeId || state.swarm.particleShape || "circle";
      ball.rotation = ball.rotation || 0;
      ball.angularVelocity = ball.angularVelocity || 0;
      ball.alignToVelocity = ball.alignToVelocity || false;
      ball.trail = ball.trail || [];
      ball.trailEnabled =
        ball.trailEnabled != null
          ? ball.trailEnabled
          : state.swarm.trailEnabled || false;
      ball.trailLength = ball.trailLength || 10;
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

        // Rotation update
        if (ball.alignToVelocity) {
          ball.rotation = Math.atan2(ball.vy, ball.vx);
        } else if (ball.angularVelocity) {
          ball.rotation = (ball.rotation || 0) + ball.angularVelocity * 0.016;
        }

        // Trail update
        if (ball.trailEnabled && ball.trail) {
          ball.trail.push({ x: ball.x, y: ball.y });
          if (ball.trail.length > (ball.trailLength || 10)) {
            ball.trail.shift();
          }
        }

        var worldMode =
          typeof state.world === "string"
            ? state.world
            : state.world && state.world.mode
              ? state.world.mode
              : "gravity";
        if (worldMode !== "gravity" && ball.collisionCount > 3) {
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
        midiChannel: line.midiChannel != null ? line.midiChannel : 1,
        note: line.note != null ? line.note : 60,
        velocityRange: [48, 110],
        life: line.life,
        behavior: {
          type: line.behavior.type,
          strength: line.behavior.strength,
          velocityMultiplier: 1,
          emitterConfig: line.behavior.emitterConfig
            ? clone(line.behavior.emitterConfig)
            : null,
          emitterVx: line.behavior.emitterVx,
          emitterVy: line.behavior.emitterVy,
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

  function getNoteFromColor(color) {
    if (!color) return null;
    var result = findClosestNoteForColor(color);
    return result != null ? ((result % 12) + 12) % 12 : null;
  }

  function normalizeColor(color) {
    if (!color) return null;
    if (color.startsWith("#")) return color.toLowerCase();
    var match = color.match(/\d+/g);
    if (!match) return color.toLowerCase();
    var r = Number(match[0]);
    var g = Number(match[1]);
    var b = Number(match[2]);
    return (
      "#" +
      [r, g, b]
        .map(function (v) {
          return v.toString(16).padStart(2, "0");
        })
        .join("")
    );
  }

  function getObjectColor(obj) {
    if (!obj) return null;
    var color =
      obj.color ||
      obj.strokeColor ||
      (obj.style && (obj.style.color || obj.style.stroke)) ||
      null;
    return normalizeColor(color);
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

  function isMuted(obj) {
    return !!(obj?.behavior?.isMuted || obj?.sound?.enabled === false);
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

  function getDensityNorm(count) {
    return Math.min(1, count / 12); // normalize (tweak later)
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
