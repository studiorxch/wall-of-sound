(function initMain(global) {
  const SBE = (global.SBE = global.SBE || {});

  // ── Boot configuration ────────────────────────────────────────────────────
  // Change WOS_BOOT_MODE to switch startup behavior without touching runtime code.
  //   "normal"            — full WOS experience (traffic, routes, world systems)
  //                         Maritime auto-starts as a first-class world subsystem.
  //   "harbor-validation" — marine-only isolation: traffic hidden, debug vessel
  //                         injected, harbor framing, tilt active on first frame.
  //                         Retained as a developer debug mode; not the runtime default.
  const WOS_BOOT_MODE = 'normal';

  const BOOT_HARBOR_VALIDATION = WOS_BOOT_MODE === 'harbor-validation';

  // ── Runtime flags — global mode gates ────────────────────────────────────
  // Subsystems check SBE.runtimeFlags before rendering/ticking.
  // Preserve any flags already on SBE.runtimeFlags (e.g. set by other scripts).
  SBE.runtimeFlags = Object.assign(
    {
      harborBootstrapMode:    BOOT_HARBOR_VALIDATION,
      // Console telemetry flags — false by default to keep DevTools quiet.
      // Set true at runtime to restore verbose output:
      //   SBE.runtimeFlags.showAISTelemetryLogs = true
      //   SBE.runtimeFlags.showMarineDebugLogs  = true
      showAISTelemetryLogs:   false,
      showMarineDebugLogs:    false,
      // Maritime occupancy renderer — motion presence flags (0523G-2).
      // Nav lights, speed tails, and wake glow are on by default.
      // Corridor hints and debug labels are off by default.
      //   SBE.runtimeFlags.showMaritimeNavLights     = false
      //   SBE.runtimeFlags.showMaritimeSpeedTails    = false
      //   SBE.runtimeFlags.showMaritimeWakeGlow      = false
      //   SBE.runtimeFlags.showMaritimeCorridorHints = true
      //   SBE.runtimeFlags.showMaritimeDebugLabels   = true
      showMaritimeNavLights:      true,
      showMaritimeSpeedTails:     true,
      showMaritimeWakeGlow:       true,
      showMaritimeCorridorHints:  false,
      showMaritimeDebugLabels:    false,    // §J1 — off by default; hover shows labels
      // Maritime runtime state flags (0523K).
      // maritimeEnabled:       master on/off for the maritime subsystem.
      // maritimeGeoActive:     set by geo-bounds check; false outside harbor region.
      // The remaining debug/validation flags default to OFF for clean runtime mode.
      maritimeEnabled:                    true,
      maritimeGeoActive:                  true,
      maritimeValidationVisibility:       false,  // validation overlay — debug only
      showSeedVesselLabels:               false,  // seed vessel label overlay — debug only
      showMaritimeDebugFields:            false,  // radius rings / debug circles — debug only
      // Maritime Validation Feed (0523H) — AIS-backed synthetic vessel ecology.
      // enableMaritimeValidationFeed: runtime toggle (UI-bindable).
      // maritimeValidationFeedAutostart: true → feed starts automatically at boot.
      // showMaritimeValidationFeedLogs: verbose per-tick console output.
      enableMaritimeValidationFeed:      true,
      maritimeValidationFeedAutostart:   true,
      showMaritimeValidationFeedLogs:    false,
      // Land traffic (0523K regression patch).
      // Off by default so cars don't appear during maritime runtime.
      // Set true (or call _wos.enableLandTraffic(true)) to restore.
      landTrafficEnabled:    false,
      landTrafficAutostart:  false,
    },
    SBE.runtimeFlags || {}
  );

  // ── System registry — 0523K ─────────────────────────────────────────────
  // SBE.systems is the first-class runtime catalogue of world subsystems.
  // Each entry describes capability, enabled state, and feed sources.
  // Subsystems check SBE.systems.<name>.enabled before self-initializing.
  // Future-proof: swap validationFeed → liveAIS without renderer rewrites.

  SBE.systems = SBE.systems || {};
  SBE.systems.maritime = {
    enabled:        true,   // master switch — controls renderer + feed lifecycle
    validationFeed: true,   // synthetic ecology source (MaritimeValidationFeed)
    liveAIS:        false,  // live AIS ingestion (future)
    renderer:       true,   // MaritimeOccupancyRenderer sprite/hover rendering
    runtime:        true,   // AISRuntime vessel lifecycle + dead reckoning
    geoGated:       true,   // renderer sleeps when camera exits maritime bounds
  };

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
  // Note/color/midi helpers
  function noteClassToColor(nc) {
    return NOTE_COLORS[NOTE_NAMES[((nc % 12) + 12) % 12]] || "#888888";
  }
  function noteToMidi(noteClass, octave) {
    return (
      (octave != null ? octave : 4) * 12 + ((((noteClass || 0) % 12) + 12) % 12)
    );
  }

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

  function flashNote(noteClass, velocity) {
    const el = window.noteElements[noteClass % 12];
    if (!el) return;

    const noteName = NOTE_NAMES[noteClass % 12];
    const color = NOTE_COLORS[noteName] || "#3dd8c5";

    el.style.setProperty("--note-color", color);

    // optional velocity scaling
    const intensity = Math.max(0.35, velocity || 1);

    el.style.opacity = intensity;
    el.classList.add("active");

    clearTimeout(el._flashTimer);

    el._flashTimer = setTimeout(() => {
      el.classList.remove("active");
      el.style.opacity = 0;
    }, 120);
  }

  function saveSamples() {
    const data = {};

    Object.keys(sampleMap).forEach((k) => {
      data[k] = sampleMap[k].map((b) => b.duration); // placeholder metadata
    });

    localStorage.setItem("sampleMap", JSON.stringify(data));
  }

  function getSampleForNote(state, noteClass) {
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
    let lastDt = 1 / 60;
    let frameAccumulator = 0;
    const canvas = document.getElementById("engine-canvas");
    const canvasWrap = document.getElementById("canvas-wrap");
    canvas.width = 1080;
    canvas.height = 1920;
    const renderer = new SBE.CanvasRenderer(canvas);
    const midiOut = new SBE.MidiOut();
    const controls = SBE.Controls.createControls();
    // ── §WOS-DEBUG-NS — preserve any pre-existing _wos debug namespaces ──────
    // Debug helper scripts (maritimeStyleRegistryDebug, mapStyleAuthorityDebug,
    // surfaceStylePresetDebug, liveStylePanel) register on _wos before main.js
    // runs in some load orders. Capture them so the object literal below does
    // not wipe them. Restored immediately after the closing }; below.
    var _wos_prior = window._wos || {};
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
      clearParticles: function () {
        state.particles = [];
        if (window.SBE && SBE.ParticleSystem)
          SBE.ParticleSystem.particles = state.particles;
        console.log("[particles] Cleared");
      },
      clearDuplicationDelta: function () {
        clearDuplicationDelta();
        console.log("[dup] Delta cleared");
      },
      getDuplicationDelta: function () {
        return state.duplication;
      },
      debugSelection: function debugSelection() {
        var strokeIds =
          state.selection && state.selection.strokeIds
            ? Array.from(state.selection.strokeIds)
            : [];
        var refs =
          typeof getSelectedObjectRefs === "function"
            ? getSelectedObjectRefs()
            : [];
        var primary =
          typeof getPrimarySelectedObjectRef === "function"
            ? getPrimarySelectedObjectRef()
            : null;
        return {
          tool: state.tool,
          activeElement:
            document.activeElement && document.activeElement.tagName
              ? document.activeElement.tagName.toLowerCase()
              : null,
          multiSelection: state.multiSelection || [],
          selection: {
            strokeId: state.selection && state.selection.strokeId,
            strokeIds: strokeIds,
            groupId: state.selection && state.selection.groupId,
          },
          legacy: {
            selectedShapeId: state.selectedShapeId,
            selectedBallId: state.selectedBallId,
            selectedLineId: state.selectedLineId,
            selectedTextId: state.selectedTextId,
          },
          resolved: { primary: primary, refs: refs },
          counts: {
            strokes: state.strokes.length,
            walkers: state.walkers.length,
            lines: state.lines.length,
            balls: state.balls.length,
            shapes: state.shapes.length,
            textObjects: state.textObjects.length,
            groups: Object.keys(state.groups || {}).length,
          },
        };
      },
      testDelete: function () {
        return deleteSelectedObject();
      },
      testDuplicate: function () {
        return duplicateSelectedObject();
      },
      forceDeleteFirstSelectedStroke:
        function forceDeleteFirstSelectedStroke() {
          var id =
            (state.selection && state.selection.strokeId) ||
            (state.selection &&
              state.selection.strokeIds &&
              Array.from(state.selection.strokeIds)[0]) ||
            (state.multiSelection &&
              state.multiSelection.find(function (x) {
                return x.type === "stroke";
              }) &&
              state.multiSelection.find(function (x) {
                return x.type === "stroke";
              }).id);
          console.log("[FORCE DELETE STROKE] id:", id);
          if (!id) {
            console.warn("[FORCE DELETE STROKE] no stroke id found");
            return false;
          }
          var before = {
            strokes: state.strokes.length,
            walkers: state.walkers.length,
            lines: state.lines.length,
          };
          state.strokes = state.strokes.filter(function (s) {
            return s.id !== id;
          });
          state.walkers = state.walkers.filter(function (w) {
            return w.strokeId !== id && !(w.stroke && w.stroke.id === id);
          });
          state.lines = state.lines.filter(function (l) {
            return l._strokeId !== id && l.strokeId !== id;
          });
          clearSelection();
          renderFrame();
          syncUI();
          var after = {
            strokes: state.strokes.length,
            walkers: state.walkers.length,
            lines: state.lines.length,
          };
          console.log("[FORCE DELETE STROKE]", {
            before: before,
            after: after,
          });
          return true;
        },
      forceDuplicateFirstSelectedStroke:
        function forceDuplicateFirstSelectedStroke() {
          var id =
            (state.selection && state.selection.strokeId) ||
            (state.selection &&
              state.selection.strokeIds &&
              Array.from(state.selection.strokeIds)[0]) ||
            (state.multiSelection &&
              state.multiSelection.find(function (x) {
                return x.type === "stroke";
              }) &&
              state.multiSelection.find(function (x) {
                return x.type === "stroke";
              }).id);
          console.log("[FORCE DUPLICATE STROKE] id:", id);
          if (!id) {
            console.warn("[FORCE DUPLICATE STROKE] no stroke id found");
            return null;
          }
          var source = state.strokes.find(function (s) {
            return s.id === id;
          });
          if (!source) {
            console.warn("[FORCE DUPLICATE STROKE] source missing:", id);
            return null;
          }
          pushHistory();
          var copy = JSON.parse(JSON.stringify(source));
          copy.id =
            "stroke-" +
            Date.now() +
            "-" +
            Math.random().toString(36).slice(2, 7);
          copy.points = (copy.points || []).map(function (p) {
            return { x: p.x + 20, y: p.y + 20 };
          });
          copy.drips = [];
          copy.specks = [];
          delete copy._groupId;
          state.strokes.push(copy);
          if (typeof strokeToLines === "function") strokeToLines(copy);
          var srcWalker = state.walkers.find(function (w) {
            return (
              w.strokeId === source.id ||
              (w.stroke && w.stroke.id === source.id)
            );
          });
          if (srcWalker && typeof createWalkerFromStroke === "function") {
            var walker = createWalkerFromStroke(copy);
            if (walker) state.walkers.push(walker);
          }
          clearSelection();
          state.selection.strokeId = copy.id;
          state.selection.strokeIds = new Set([copy.id]);
          state.selection.groupId = null;
          state.multiSelection = [{ type: "stroke", id: copy.id }];
          syncLegacySelection();
          syncSelectionPanel();
          renderFrame();
          syncUI();
          console.log("[FORCE DUPLICATE STROKE] duplicated:", copy.id);
          return copy;
        },
      // Path factories (light integration — spec 0426)
      createLinePath: function (a, b, opts) {
        return createLinePath(a, b, opts);
      },
      createCirclePath: function (cx, cy, radius) {
        return createCirclePath(cx, cy, radius);
      },
      spawnWalkerOnPath: function (path, opts) {
        var w = createWalkerOnPath(path, opts);
        state.walkers.push(w);
        console.log("[walker] Spawned on path:", w.id, path.type);
        return w;
      },
      // Shape library
      saveSelectedShape: function () {
        saveSelectedShape();
      },
      // ── Camera API ──────────────────────────────────────────────────────
      camera: {
        followWalker: function (walkerId) {
          var id = walkerId || (state.walkers[0] && state.walkers[0].id);
          if (!id) {
            console.warn("[CAMERA] No walker to follow");
            return;
          }
          state.camera.mode = "follow";
          state.camera.follow.walkerId = id;
          console.log("[CAMERA] Following walker:", id);
        },
        free: function () {
          state.camera.mode = "free";
          state.camera.follow.walkerId = null;
          console.log("[CAMERA] Free mode");
        },
        zoomTo: function (zoom) {
          state.camera.targetZoom = clamp(
            zoom,
            state.camera.zoomLimits.min,
            state.camera.zoomLimits.max,
          );
        },
        reset: function () {
          state.camera.targetX = 0;
          state.camera.targetY = 0;
          state.camera.targetZoom = 1;
          state.camera.mode = "free";
        },
        fitToStroke: function (strokeId) {
          var s = getStrokeById(strokeId) || getSelectedStroke();
          if (!s || !s.points || !s.points.length) return;
          var xs = s.points.map(function (p) {
            return p.x;
          });
          var ys = s.points.map(function (p) {
            return p.y;
          });
          var minX = Math.min.apply(null, xs),
            maxX = Math.max.apply(null, xs);
          var minY = Math.min.apply(null, ys),
            maxY = Math.max.apply(null, ys);
          var cx = (minX + maxX) / 2,
            cy = (minY + maxY) / 2;
          var w = maxX - minX || 100,
            h = maxY - minY || 100;
          var zoom = Math.min(canvas.width / w, canvas.height / h) * 0.75;
          state.camera.targetX = cx;
          state.camera.targetY = cy;
          state.camera.targetZoom = clamp(
            zoom,
            state.camera.zoomLimits.min,
            state.camera.zoomLimits.max,
          );
          state.camera.mode = "free";
        },
      },
      // ── End Camera API ──────────────────────────────────────────────────
      // ── Inspector API ────────────────────────────────────────────────────
      banks: {
        list: function () {
          return state.banks;
        },
        active: function () {
          return getActiveBank();
        },
        select: function (idOrIndex) {
          var b =
            typeof idOrIndex === "number"
              ? state.banks[idOrIndex]
              : state.banks.find(function (b) {
                  return b.id === idOrIndex;
                });
          if (b) {
            state.activeBankId = b.id;
            renderBankGrid();
          }
        },
        colorToMidi: function (color) {
          return colorToMidi(color);
        },
      },
      inspector: {
        updateSelected: function (path, value) {
          updateSelected(path, value);
        },
        getSelectedObjects: function () {
          return getSelectedObjectsNorm();
        },
        setDeep: function (obj, path, value) {
          setDeep(obj, path, value);
        },
        getDeep: function (obj, path) {
          return getDeep(obj, path);
        },
        sync: function () {
          renderInspector();
        },
      },
      // ── End Inspector API ────────────────────────────────────────────────
      preview: {
        play: function (opts) {
          var note = opts && opts.note != null ? opts.note : 60;
          var velocity = opts && opts.velocity != null ? opts.velocity : 100;
          var channel = opts && opts.channel != null ? opts.channel : 1;
          try {
            playFallbackInstrument(note, velocity);
          } catch (e) {
            console.warn("[PREVIEW ERROR]", e);
          }
        },
      },
      labels: {
        list: function () {
          return state.labels;
        },
        clear: function () {
          state.labels = [];
          state.activeLabelId = null;
          state.textEditing = false;
          renderFrame();
        },
        remove: function (id) {
          removeLabel(id);
          renderFrame();
        },
        add: function (x, y, text) {
          var l = createLabelAt(x || 0, y || 0);
          if (text) l.text = text;
          renderFrame();
          return l;
        },
      },
      midi: {
        cartridges: function () {
          return state.midiCartridges;
        },
        banks: function () {
          return state.midiBanks;
        },
        points: function () {
          return state.midiPoints;
        },
        graphs: function () {
          return state.graphs;
        },
        projectSelected: function () {
          var stroke = getSelectedStroke();
          if (!stroke) {
            console.warn("[MIDI] Select a stroke first");
            return;
          }
          var bank = getMidiBank(state.activeMidiBankId);
          if (!bank) {
            console.warn("[MIDI] No active bank — drop a .mid file first");
            return;
          }
          var graph = buildGraphFromStroke(stroke);
          assignBankToGraph(bank.id, graph.id);
          projectMidiToGraph(bank.id, graph.id);
          renderFrame();
          console.log("[MIDI] Projected bank", bank.id, "→ graph", graph.id);
        },
        setRepeat: function (bankId, value) {
          var bank = getMidiBank(bankId);
          if (bank) {
            bank.repeat = !!value;
            console.log("[MIDI] repeat=", bank.repeat, bankId);
          }
        },
      },
      midiPoints: {
        list: function () {
          return state.midiPoints;
        },
        clearBank: function (bankId) {
          state.midiPoints = state.midiPoints.filter(function (p) {
            return p.bankId !== bankId;
          });
          renderFrame();
        },
        resetBank: function (bankId) {
          state.midiPoints.forEach(function (p) {
            if (p.bankId === bankId) p.consumed = false;
          });
          var bank = getMidiBank(bankId);
          if (bank) bank.consumed = false;
          renderFrame();
        },
      },
      // ── End MIDI API ─────────────────────────────────────────────────────
      // ── Test / Debug API ──────────────────────────────────────────────
      test: {
        playStroke: function (id) {
          emitEvent({
            type: "test",
            sourceId: id,
            energy: 1,
            channel: "default",
            data: { note: 60 },
          });
          console.log("[test] emitEvent for stroke:", id);
        },
        listStrokes: function () {
          return state.strokes.map(function (s) {
            return {
              id: s.id,
              samples: (s.samples && s.samples.length) || 0,
              note: s.note,
              channel: s.channel,
            };
          });
        },
        audioState: function () {
          return {
            context: state.audio.context && state.audio.context.state,
            masterGain:
              state.audio.masterGain && state.audio.masterGain.gain.value,
            activeVoices: state.audio.activeVoices
              ? state.audio.activeVoices.size
              : 0,
          };
        },
        listStrokeSamples: function () {
          return state.strokes.map(function (s) {
            return {
              id: s.id,
              samples: s.samples ? s.samples.length : 0,
            };
          });
        },
        activeNotes: function () {
          return Object.keys(sampleMap).map(function (k) {
            return { note: k, count: sampleMap[k].length };
          });
        },
        forcePlay: function () {
          var ctx = state.audio.context;
          if (!ctx) {
            console.warn("[TEST FAIL] No audio context");
            return;
          }
          var buffer = sampleMap[0] && sampleMap[0][0];
          if (!buffer) {
            console.warn("[TEST FAIL] No sample in sampleMap[0]");
            return;
          }
          var source = ctx.createBufferSource();
          var gain = ctx.createGain();
          source.buffer = buffer;
          gain.gain.value = 0.5;
          source.connect(gain);
          gain.connect(ctx.destination);
          source.start();
          console.log("[TEST] forced playback");
        },
      },
      sound: {
        testFallback: function (note) {
          playFallbackInstrument(note != null ? note : 60, 80);
        },
        test: function (note, velocity) {
          playFallbackInstrument(
            note != null ? note : 60,
            velocity != null ? velocity : 100,
          );
        },
      },
      testSound: function (note, velocity) {
        playTestTone(note, velocity);
      },
      audioEngine: {
        unlock: function () {
          AudioEngine.unlock();
        },
        state: function () {
          return AudioEngine.getState();
        },
        test: function (note, vel) {
          playTestTone(note || 60, vel || 100);
        },
      },
      debug: {
        setAudioLogs: function (enabled) {
          state.debug = state.debug || {};
          state.debug.audioLogs = !!enabled;
          console.log("[DEBUG] audioLogs:", state.debug.audioLogs);
        },
        getMidiState: function () {
          return {
            cartridges: state.midiCartridges.length,
            banks: state.midiBanks.length,
            points: state.midiPoints.length,
            graphs: Object.keys(state.graphs).length,
            activeBankId: state.activeMidiBankId,
          };
        },
        injectTestPoint: function () {
          state._midiDebugPoint = true;
          renderFrame();
          console.log("[DEBUG] test point will appear on next render");
        },
        setVisualMode: function (mode) {
          state.debug.visualMode = mode === "full" ? "full" : "clean";
          console.log("[DEBUG] visualMode:", state.debug.visualMode);
          renderFrame();
        },
      },
      loadShapes: function () {
        return loadShapes();
      },
      createShapeInstance: function (shape, position) {
        return createShapeInstance(shape, position);
      },
      saveShapeFromStroke: function (stroke, name) {
        return saveShapeFromStroke(stroke, name);
      },
      getSelectedStroke: function () {
        return getSelectedStroke();
      },
      // Grouping system
      createGroup: function (strokeIds) {
        return createGroup(strokeIds);
      },
      dissolveGroup: function (groupId) {
        dissolveGroup(groupId);
      },
      translateGroup: function (groupId, dx, dy) {
        translateGroup(groupId, dx, dy);
        renderFrame();
      },
      scaleGroup: function (groupId, factor) {
        scaleGroup(groupId, factor);
        renderFrame();
      },
      rotateGroup: function (groupId, dAngle) {
        rotateGroup(groupId, dAngle);
        renderFrame();
      },
      getGroupForStroke: function (stroke) {
        return getGroupForStroke(stroke);
      },
      groupSelected: function () {
        var ids = Array.from(state.selection.strokeIds);
        if (ids.length < 2) {
          console.warn(
            "[group] Shift+click 2+ strokes first, then call groupSelected()",
          );
          return null;
        }
        var g = createGroup(ids);
        state.selection.groupId = g.id;
        state.selection.strokeIds.clear();
        renderFrame();
        return g;
      },
      // Behavior pipeline
      processBehaviors: function (now) {
        return processBehaviors(now != null ? now : performance.now());
      },
      setBehavior: function (strokeOrId, behavior) {
        var s =
          typeof strokeOrId === "string"
            ? getStrokeById(strokeOrId)
            : strokeOrId;
        if (s) {
          s.behavior = behavior;
          console.log("[emitter] created on stroke", s.id, behavior);
        }
      },
      setGroupBehavior: function (groupId, behavior) {
        var g = state.groups[groupId];
        if (g) {
          g.behavior = behavior;
          console.log("[emitter] created on group", groupId, behavior);
        }
      },
      // Particle profile API
      spawnProfile: function (name, x, y, color, dir) {
        if (window.SBE && SBE.ParticleSystem)
          SBE.ParticleSystem.spawnProfile(name, x, y, color, dir);
      },
      particleProfiles: function () {
        return window.SBE && SBE.ParticleSystem
          ? SBE.ParticleSystem.profiles
          : {};
      },
      // Object system bridge
      strokeToLines: function (stroke) {
        strokeToLines(stroke);
      },
      rebuildLines: function () {
        // Re-bridge all existing strokes (call after loading a scene)
        state.lines = state.lines.filter(function (l) {
          return !l._strokeId;
        });
        state.strokes.forEach(function (s) {
          strokeToLines(s);
        });
        console.log(
          "[bridge] rebuilt",
          state.strokes.length,
          "strokes → state.lines",
        );
      },
    };
    // ── §WOS-DEBUG-NS — restore debug namespaces after _wos re-init ──────────
    // Any namespace already registered on _wos_prior (e.g. maritimeStyle,
    // styleAuthority, presets, liveStyle) that main.js does NOT own is merged
    // back non-destructively. main.js-owned keys always win.
    (function _restoreDebugNamespaces() {
      var ks = Object.keys(_wos_prior);
      for (var _i = 0; _i < ks.length; _i++) {
        var _k = ks[_i];
        if (!(_k in window._wos)) {
          window._wos[_k] = _wos_prior[_k];
        }
      }
    })();
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

      var allFiles = Array.prototype.slice.call(e.dataTransfer.files);

      // ── MIDI drop — handle .mid files before audio filter ─────────────────
      var midiFiles = allFiles.filter(function (f) {
        return (
          f.name.toLowerCase().endsWith(".mid") ||
          f.name.toLowerCase().endsWith(".midi") ||
          f.type === "audio/midi" ||
          f.type === "audio/x-midi"
        );
      });
      if (midiFiles.length && window.SBE && SBE.MidiImporter) {
        for (var mi = 0; mi < midiFiles.length; mi++) {
          var cartridge = await SBE.MidiImporter.loadMidiFile(midiFiles[mi]);
          if (cartridge) {
            state.midiCartridges.push(cartridge);
            // Create bank wrapper
            var bank = SBE.MidiImporter.createMidiBank(cartridge);
            state.midiBanks.push(bank);
            state.activeMidiBankId = bank.id;
            showToast(
              "MIDI bank loaded: " +
                bank.name +
                " (" +
                cartridge.notes.length +
                " notes)",
            );
            console.log(
              "[MIDI DROP] cartridge:",
              cartridge.id,
              "bank:",
              bank.id,
            );
            // If a stroke is selected → build graph, project visuals, AND attach cartridge for time-based playback
            var sel = getSelectedStroke();
            if (sel) {
              var graph = buildGraphFromStroke(sel);
              assignBankToGraph(bank.id, graph.id);
              projectMidiToGraph(bank.id, graph.id);
              // Attach cartridge to each stroke in the graph for tickCartridgeForWalker
              graph.strokeIds.forEach(function (sid) {
                var gs = getStrokeById(sid);
                if (!gs) return;
                SBE.MidiImporter.attachMidiToStroke(gs, cartridge);
                // speed = 1.0 (default) — transport time IS MIDI time, no compression
              });
              showToast("MIDI projected → graph_" + graph.id.slice(-6));
              renderFrame();
            }
          }
        }
        if (controls.syncGridUI) controls.syncGridUI(state);
        if (midiFiles.length === allFiles.length) return;
      }
      // ── End MIDI drop ─────────────────────────────────────────────────────

      var files = allFiles.filter(function (f) {
        return f.type.includes("audio");
      });
      if (!files.length) return;

      // Priority 1: selected stroke → assign to object (new per-stroke instrument path)
      // Priority 0: active bank (v2 system — always wins if set)
      if (state.activeBankId) {
        var bankLoaded = 0;
        await Promise.all(
          files.map(async function (file) {
            var ok = await loadSampleToActiveBank(file);
            if (ok) bankLoaded++;
          }),
        );
        if (bankLoaded > 0) {
          renderBankGrid();
          showToast(
            "Loaded " + bankLoaded + " sample(s) → " + state.activeBankId,
          );
        }
        return;
      }

      // Priority 1: selected stroke
      // Priority 2: hovered sampler row → note-based (classic sampler path)
      // Priority 3: active sampler note → note-based fallback
      var selectedStroke =
        typeof getSelectedStroke === "function" ? getSelectedStroke() : null;

      if (selectedStroke && hoveredNoteClass == null) {
        // Object sampler path — drop goes to the selected stroke
        console.log(
          "[DROP ROUTE] → stroke path, strokeId:",
          selectedStroke.id,
          "(deselect stroke or hover sampler row to load into sampleMap)",
        );
        var loaded = 0;
        await Promise.all(
          files.map(async function (file) {
            var ok = await loadSampleToStroke(file, selectedStroke.id);
            if (ok) loaded++;
          }),
        );
        if (loaded > 0) {
          showToast("Loaded " + loaded + " sample(s) → stroke");
        }
        return;
      }

      // Classic note-based sampler path
      var noteClass = hoveredNoteClass;
      if (noteClass == null) noteClass = state.sampler.activeNote;
      if (noteClass == null) {
        var selectedObj = getSelectedObject ? getSelectedObject() : null;
        var objColor = getObjectColor(selectedObj);
        if (objColor) noteClass = getNoteFromColor(objColor);
      }
      console.log(
        "[DROP ROUTE] noteClass:",
        noteClass,
        "hoveredNoteClass:",
        hoveredNoteClass,
        "activeNote:",
        state.sampler.activeNote,
      );
      if (noteClass == null || isNaN(noteClass)) {
        showToast("Select a bank or object to assign sound");
        console.warn(
          "[sampler] Drop ignored — no target note or stroke resolved",
        );
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

    // ── WOS Event System v1.0.0 ─────────────────────────────────────────────
    // Canonical channel map — routes events to MIDI channels
    var CHANNEL_MAP = {
      default: { midiChannel: 1 },
      percussion: { midiChannel: 2 },
      fx: { midiChannel: 3 },
      melodic: { midiChannel: 4 },
      ambient: { midiChannel: 5 },
      midi: { midiChannel: 6 },
      particle: { midiChannel: 4 }, // particle interactions → melodic channel
    };

    // Per-channel voicing profiles — shape how each channel sounds post-emission.
    // Voicing is applied after event emission, not in the event system itself.
    var CHANNEL_PROFILES = {
      default: {
        gainScale: 1.0, // neutral
        velocityCurve: 1.5, // perceptual standard
        allowStack: true, // multi-layer playback allowed
        densitySensitivity: 1.0, // normal density response
      },
      percussion: {
        gainScale: 1.2, // punchy — percussion needs presence
        velocityCurve: 1.2, // more linear — transients should feel direct
        allowStack: false, // prevent stacking; percussion clutters fast
        densitySensitivity: 1.4, // pulls back harder in dense scenes
      },
      melodic: {
        gainScale: 0.9, // slightly softer — sits under percussion
        velocityCurve: 1.6, // more compressed — wider expressive range
        allowStack: true,
        densitySensitivity: 0.8, // more resilient in dense scenes
      },
      ambient: {
        gainScale: 0.6, // soft background layer
        velocityCurve: 2.0, // heavily compressed — stays quiet, feels wide
        allowStack: true,
        densitySensitivity: 0.5, // barely affected by density
      },
      fx: {
        gainScale: 0.8,
        velocityCurve: 1.5,
        allowStack: true,
        densitySensitivity: 0.7,
      },
    };

    // Energy normalization: raw value → 0–1
    function normalizeEnergy(raw, max) {
      if (max == null) max = 10;
      return Math.max(0, Math.min(1, raw / max));
    }

    // Frame-based deduplication (clears every frame via state.frame)
    var _recentEvents = new Set();
    var _recentEventsFrame = 0;

    function shouldDedupe(event) {
      if (event.frame !== _recentEventsFrame) {
        _recentEvents.clear();
        _recentEventsFrame = event.frame;
      }
      var key =
        (event.sourceId || "") +
        "-" +
        (event.targetId || "") +
        "-" +
        event.frame;
      if (_recentEvents.has(key)) return true;
      _recentEvents.add(key);
      return false;
    }

    // Normalize and fill defaults on an event object
    function normalizeWOSEvent(e) {
      return {
        id: e.id || "ev_" + Math.random().toString(36).slice(2, 8),
        type: e.type || "unknown",
        channel: e.channel || "default",
        time: e.time != null ? e.time : performance.now(),
        frame: e.frame != null ? e.frame : state.frame || 0,
        position: e.position || { x: 0, y: 0 },
        energy: e.energy != null ? Math.max(0, Math.min(1, e.energy)) : 0,
        sourceId: e.sourceId || null,
        targetId: e.targetId || null,
        tags: e.tags || [],
        data: e.data || {},
        useScale: e.useScale !== false, // default true; false = chromatic freedom
      };
    }

    // Main emit entry point — normalizes, dedupes, then routes
    function getFallbackBridgeNote(type) {
      switch (type) {
        case "collision":
          return 60;
        case "walker":
          return 72;
        case "emit":
          return 67;
        default:
          return 60;
      }
    }

    // ── Event → Stroke resolver ───────────────────────────────────────────
    // Emitting objects (balls, walkers, lines) are not strokes — resolve ownership.
    function resolveEventStroke(event) {
      if (!event || !event.sourceId) return null;

      // 1. Direct stroke match (fast path — sourceId IS a stroke id)
      var direct = state.strokes.find(function (s) {
        return s.id === event.sourceId;
      });
      if (direct) return direct;

      // 2. Ball → strokeId bridge
      var ball = state.balls.find(function (b) {
        return b.id === event.sourceId;
      });
      if (ball && ball.strokeId) {
        var bs = state.strokes.find(function (s) {
          return s.id === ball.strokeId;
        });
        if (bs) return bs;
      }

      // 3. Walker → strokeId bridge
      var walker = state.walkers.find(function (w) {
        return w.id === event.sourceId;
      });
      if (walker && walker.strokeId) {
        var ws = state.strokes.find(function (s) {
          return s.id === walker.strokeId;
        });
        if (ws) return ws;
      }

      // 4. Line → _strokeId bridge (derived collision segments)
      var line = state.lines.find(function (l) {
        return l.id === event.sourceId;
      });
      if (line && line._strokeId) {
        var ls = state.strokes.find(function (s) {
          return s.id === line._strokeId;
        });
        if (ls) return ls;
      }

      // 5. targetId fallback (for collision events that name the struck object)
      if (event.targetId) {
        var ts = state.strokes.find(function (s) {
          return s.id === event.targetId;
        });
        if (ts) return ts;
      }

      return null;
    }
    // ── End event stroke resolver ─────────────────────────────────────────

    function emitEvent(e) {
      if (!e.sourceId) {
        console.error("[EVENT ERROR] Missing sourceId", e);
        return;
      }
      var event = normalizeWOSEvent(e);
      if (shouldDedupe(event)) return;

      if (state.debug && state.debug.audioLogs)
        console.log("[EVENT SOURCE]", event.sourceId);

      // Debug log
      if (state.debug && state.debug.info) {
        console.log(
          "[EVENT]",
          event.type,
          event.channel,
          event.data && event.data.note,
          event.energy.toFixed(2),
        );
      }

      // 🔥 Bridge into existing EventBus — non-breaking, preserves all existing triggerEvent calls
      var velocity =
        event.data && typeof event.data.velocity === "number"
          ? event.data.velocity
          : Math.floor(event.energy * 127);
      if (event.type === "midi") velocity = normalizeMidiVelocity(velocity);
      var route =
        CHANNEL_MAP[event.channel] ||
        CHANNEL_MAP[event.type] ||
        CHANNEL_MAP["default"];

      // Resolve bridge note: prefer stroke-authored note from event.data, else type fallback
      var bridgeNote =
        event.data && typeof event.data.note === "number"
          ? event.data.note
          : getFallbackBridgeNote(event.type);

      // Resolve stroke — emitter (ball/walker/line) → owning stroke → sound
      var stroke = resolveEventStroke(event);
      if (!stroke) {
        if (state.debug && state.debug.audioLogs) {
          console.warn("[AUDIO ROUTE FAIL] No stroke resolved", {
            sourceId: event.sourceId,
            targetId: event.targetId,
            type: event.type,
          });
        }
        return;
      }
      var mergedSound = Object.assign(
        {},
        stroke && stroke.sound ? stroke.sound : {},
        {
          enabled: true, // eventBus gate: sound.enabled must be true
          event: event.type, // eventBus gate: sound.event must match triggerEvent type
          midi: {
            note: bridgeNote,
            velocity: velocity,
            channel: route.midiChannel,
          },
        },
      );

      eventBus.triggerEvent(event.type, {
        id: stroke.id, // resolved stroke id — not emitter id
        sourceId: stroke.id,
        vx: 0,
        vy: 0,
        wosChannel: event.channel,
        useScale: event.useScale,
        sound: mergedSound,
      });
    }

    // ── WOS Canonical Collision Emitter ──────────────────────────────────────
    // Call this alongside eventBus.triggerEvent to layer in the new event system
    function emitCollisionEvent(a, b, impact, point) {
      // Prefer stroke-authored channel/note if source is a stroke-backed object
      var strokeSrc =
        a && a.strokeId
          ? state.strokes.find(function (s) {
              return s.id === a.strokeId;
            })
          : null;
      emitEvent({
        type: "collision",
        channel:
          (strokeSrc && strokeSrc.channel) || (a && a.channel) || "default",
        energy: normalizeEnergy(impact != null ? impact : 5),
        sourceId: (a && a.strokeId) || (a && a.id),
        targetId: b && b.id,
        position: point || { x: 0, y: 0 },
        useScale: strokeSrc ? strokeSrc.useScale !== false : true,
        data: {
          note: (strokeSrc && strokeSrc.note) || (a && a.note) || 60,
        },
      });
    }

    function emitWalkerEvent(walker) {
      // Walker audio gate: keep walkers moving visually but silence them when disabled
      if (state.walker && state.walker.audioEnabled === false) return;

      // Debug force: override with guaranteed full-energy test event
      if (state.walker && state.walker.debugForceSound) {
        emitEvent({
          type: "walker",
          channel: "default",
          energy: 1,
          sourceId: walker && walker.id,
          data: { note: 60 },
        });
        return;
      }

      var wSrc =
        walker && walker.strokeId
          ? state.strokes.find(function (s) {
              return s.id === walker.strokeId;
            })
          : null;
      emitEvent({
        type: "walker",
        channel:
          (wSrc && wSrc.channel) || (walker && walker.channel) || "default",
        energy: 0.3,
        sourceId: (walker && walker.strokeId) || (walker && walker.id),
        position: {
          x: (walker && walker.x) || 0,
          y: (walker && walker.y) || 0,
        },
        useScale: wSrc ? wSrc.useScale !== false : true,
        data: {
          note: (wSrc && wSrc.note) || (walker && walker.note) || 72,
        },
      });
    }
    // ── End WOS Event System ─────────────────────────────────────────────────

    // ── Audio: Voice Lifecycle ───────────────────────────────
    // Fades and stops all active voices for an object/stroke, then removes from registry.
    // fadeMs defaults to 80ms — fast enough to feel immediate, soft enough to avoid clicks.
    function stopVoicesForObject(objectId, fadeMs) {
      if (!state.audio || !state.audio.activeVoices) return;
      var voices = state.audio.activeVoices.get(objectId);
      if (!voices || !voices.length) return;
      var ctx = state.audio.context;
      if (!ctx) return;
      var now = ctx.currentTime;
      var fadeSeconds = (fadeMs != null ? fadeMs : 80) / 1000;
      voices.forEach(function (voice) {
        try {
          voice.gain.gain.cancelScheduledValues(now);
          voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
          voice.gain.gain.linearRampToValueAtTime(0.0001, now + fadeSeconds);
          voice.source.stop(now + fadeSeconds);
        } catch (err) {
          // Voice already ended — safe to ignore
        }
      });
      state.audio.activeVoices.delete(objectId);
    }

    // ── Audio: Density ───────────────────────────────────
    // Computes the density attenuation factor for a given density level + channel profile.
    // Isolated so the math is testable and reusable without touching the sampler.
    function computeDensityFactor(densityLevel, profile) {
      var weight =
        densityLevel === "high" ? 0.3 : densityLevel === "mid" ? 0.15 : 0;
      return 1 - weight * (profile.densitySensitivity || 1.0);
    }

    // ── Audio: Velocity ───────────────────────────────────
    // Computes final playback gain from velocity, channel profile, and scene density.
    // All gain decisions live here — handle() just calls this.
    function computeVelocityGain(velocity, profile, densityLevel) {
      var normalized = velocity / 127;
      // Power curve: profile drives compression shape per channel role
      var shaped = Math.pow(normalized, profile.velocityCurve);
      // Soft-knee floor: prevents quiet hits from vanishing entirely
      var boosted = normalized * 0.25;
      var curved = Math.max(shaped, boosted);
      var densityFactor = computeDensityFactor(densityLevel, profile);
      // Chain: curve → channel scale → density → hard clamp
      return Math.min(
        1.0,
        (0.2 + curved * 0.8) * profile.gainScale * densityFactor,
      );
    }

    // ── Audio: Sampling ───────────────────────────────────
    // Resolves the note, resolved noteClass, and sample buffer(s) from sourceObject.
    // Encapsulates: scale quantization, bank fallback, intelligent tier selection.
    // Returns null if nothing playable was found.
    function resolveNoteAndSample(sourceObject) {
      if (state.debug && state.debug.audioLogs)
        console.log("[RESOLVE INPUT]", {
          sourceId: sourceObject && sourceObject.id,
          note:
            sourceObject &&
            sourceObject.sound &&
            sourceObject.sound.midi &&
            sourceObject.sound.midi.note,
          hasStroke: !!(sourceObject && sourceObject.id),
        });
      var note =
        (sourceObject.sound &&
          sourceObject.sound.midi &&
          sourceObject.sound.midi.note) ||
        60;

      // Scale quantization — gated per stroke via useScale flag (default: true)
      // stroke.useScale = false → chromatic freedom; omitted or true → snap to scale
      var useScale = sourceObject.useScale !== false;
      if (useScale && state.audio.scale && state.audio.scale.enabled) {
        note = quantizeToScale(
          note,
          state.audio.scale.root,
          state.audio.scale.type,
        );
      }

      var noteClass = note % 12;

      // Solo gate
      if (
        state.audio.soloNoteClass !== null &&
        noteClass !== state.audio.soloNoteClass
      ) {
        return null;
      }

      // Object sampler: prefer stroke.samples if the source has its own buffers.
      // Fallback to global sampleMap if stroke has no samples loaded.
      var resolvedClass = noteClass;
      var result = null;

      // Walker → stroke resolution: checks direct stroke match first, then walker.strokeId
      function resolveSourceStroke(obj) {
        if (!obj || !obj.id) return null;
        var stroke = state.strokes.find(function (s) {
          return s.id === obj.id;
        });
        if (stroke) return stroke;
        var walker = state.walkers.find(function (w) {
          return w.id === obj.id;
        });
        if (walker && walker.strokeId) {
          return state.strokes.find(function (s) {
            return s.id === walker.strokeId;
          });
        }
        return null;
      }
      var srcStroke = resolveSourceStroke(sourceObject);
      if (state.debug && state.debug.audioLogs) {
        console.log("[RESOLVED STROKE]", {
          inputId: sourceObject && sourceObject.id,
          strokeId: srcStroke && srcStroke.id,
          samples:
            srcStroke && srcStroke.samples ? srcStroke.samples.length : 0,
        });
        console.log("[AUDIO CHECK]", {
          sourceId: sourceObject.id,
          hasStrokeSamples:
            srcStroke && srcStroke.samples && srcStroke.samples.length,
          hasSound: !!sourceObject.sound,
          midi: sourceObject.sound && sourceObject.sound.midi,
        });
        console.log("[MIDI SAMPLE ROUTE]", {
          fullNote:
            sourceObject.sound &&
            sourceObject.sound.midi &&
            sourceObject.sound.midi.note,
          noteClass: noteClass,
          hasStrokeSamples: !!(
            srcStroke &&
            srcStroke.samples &&
            srcStroke.samples.length
          ),
          globalSampleCount: sampleMap[noteClass]
            ? sampleMap[noteClass].length
            : 0,
        });
      }

      if (srcStroke && srcStroke.samples && srcStroke.samples.length > 0) {
        // Per-stroke instrument: pick a sample (random within the stroke's bank)
        var idx = Math.floor(Math.random() * srcStroke.samples.length);
        result = srcStroke.samples[idx];
      } else {
        // Classic note-based fallback
        result = getSampleForNote(state, noteClass);
        if (result === null) {
          var fallbackMode = state.audio.fallbackMode || "nearest";
          if (fallbackMode === "strict") return null;
          for (var offset = 1; offset <= 6; offset++) {
            var lo = (noteClass - offset + 12) % 12;
            var hi = (noteClass + offset) % 12;
            if (sampleMap[lo] && sampleMap[lo].length > 0) {
              resolvedClass = lo;
              result = getSampleForNote(state, lo);
              break;
            }
            if (sampleMap[hi] && sampleMap[hi].length > 0) {
              resolvedClass = hi;
              result = getSampleForNote(state, hi);
              break;
            }
          }
        }
      }
      if (result === null) {
        if (state.debug && state.debug.audioLogs)
          console.warn("[AUDIO FAIL] No sample resolved", {
            noteClass: noteClass,
            sampleMap: sampleMap[noteClass],
            sourceId: sourceObject && sourceObject.id,
          });
        return null;
      }

      // Intelligent tier-based sample selection (opt-in via state.audio.intelligentSampling)
      // LOW  < 40  → first sample only (stable, unobtrusive)
      // MID  < 90  → round-robin (controlled variation)
      // HIGH ≥ 90  → bank mode drives selection (raw expression)
      var velocity =
        (sourceObject.sound &&
          sourceObject.sound.midi &&
          sourceObject.sound.midi.velocity) ||
        80;
      if (state.audio && state.audio.intelligentSampling) {
        var bankSamples = sampleMap[resolvedClass];
        if (bankSamples && bankSamples.length > 1) {
          var bankSt = (state.sampleBanks &&
            state.sampleBanks[resolvedClass]) || { index: 0 };
          if (velocity < 40) {
            result = bankSamples[0];
          } else if (velocity < 90) {
            result = bankSamples[bankSt.index % bankSamples.length];
            bankSt.index = (bankSt.index || 0) + 1;
            if (state.sampleBanks) state.sampleBanks[resolvedClass] = bankSt;
          }
        }
      }

      return {
        note: note,
        noteClass: noteClass,
        resolvedClass: resolvedClass,
        result: result,
      };
    }

    // ── Oscillator Output ─────────────────────────────────
    // handle() is an orchestrator — it calls the audio modules above and plays.
    // No gain math, no bank logic, no density calculation lives here.
    const oscillatorOutput = {
      enabled: true,
      handle: function handleOscillator(type, sourceObject) {
        const context = ensureAudioContext();
        if (!context) return;
        if (context.state !== "running") {
          context.resume().catch(function () {}); // attempt resume; bail if still not running
          if (context.state !== "running") return;
        }

        // Hard guard — reject objects without a valid identity and midi note
        if (
          !sourceObject ||
          !sourceObject.id ||
          !sourceObject.sound ||
          !sourceObject.sound.midi ||
          typeof sourceObject.sound.midi.note !== "number"
        ) {
          if (state.debug && state.debug.audioLogs)
            console.warn(
              "[AUDIO SKIP] Invalid playable sourceObject",
              sourceObject,
            );
          return;
        }

        // Resolve note + sample (returns null if nothing to play)
        var resolved = resolveNoteAndSample(sourceObject);
        if (!resolved) return;

        var note = resolved.note;
        var noteClass = resolved.noteClass;
        var resolvedClass = resolved.resolvedClass;
        var result = resolved.result;

        const velocity =
          (sourceObject.sound &&
            sourceObject.sound.midi &&
            sourceObject.sound.midi.velocity) ||
          80;
        const root =
          (sourceObject.sound && sourceObject.sound.rootNote) != null
            ? sourceObject.sound.rootNote
            : 60;
        const pitch = Math.pow(2, (note - root) / 12);

        noteActivity[noteClass] = performance.now();
        noteVelocity[noteClass] = velocity / 127;
        flashNote(noteClass, velocity / 127);

        if (state.debug && state.debug.info) {
          console.log("[AUDIO FLOW]", {
            sourceId: sourceObject && sourceObject.id,
            resolvedNote: note,
            noteClass: noteClass,
            resolvedClass: resolvedClass,
            hasSample: !!result,
            isArray: Array.isArray(result),
          });
        }

        // Resolve channel voicing profile
        var wosChannel = sourceObject.wosChannel || "default";
        var profile =
          CHANNEL_PROFILES[wosChannel] || CHANNEL_PROFILES["default"];
        var densityLevel = getDensityLevel(state.collisionCount || 0);

        // Compute gain via dedicated module
        var velocityGain = computeVelocityGain(velocity, profile, densityLevel);

        if (state.debug && state.debug.info) {
          console.log(
            "[SAMPLER]",
            "ch:" + wosChannel,
            "noteClass:" + resolvedClass,
            "vel:" + velocity,
            "gain:" + velocityGain.toFixed(2),
            "curve:" + profile.velocityCurve,
          );
          console.log(
            "[DENSITY]",
            densityLevel,
            "count:" + (state.collisionCount || 0),
            "factor:" + computeDensityFactor(densityLevel, profile).toFixed(2),
          );
        }

        // Play — stack gated by profile and density
        function playSampleBuffer(buffer) {
          if (!buffer) {
            if (state.debug && state.debug.info)
              if (state.debug && state.debug.audioLogs)
                console.warn("[AUDIO FAIL] buffer missing");
            return;
          }
          try {
            const source = context.createBufferSource();
            const gainNode = context.createGain();
            source.buffer = buffer;
            source.playbackRate.value = pitch * (0.96 + Math.random() * 0.08);
            gainNode.gain.value = velocityGain;
            source.connect(gainNode);
            gainNode.connect(state.audio.masterGain || context.destination);

            // Voice registry: track active voices by owner so they can be stopped on delete
            var ownerId = (sourceObject && sourceObject.id) || "global";
            if (!state.audio.activeVoices) state.audio.activeVoices = new Map();
            if (!state.audio.activeVoices.has(ownerId)) {
              state.audio.activeVoices.set(ownerId, []);
            }
            var voiceEntry = { source: source, gain: gainNode };
            state.audio.activeVoices.get(ownerId).push(voiceEntry);

            source.onended = function () {
              var voices =
                state.audio.activeVoices &&
                state.audio.activeVoices.get(ownerId);
              if (voices) {
                var idx = voices.indexOf(voiceEntry);
                if (idx !== -1) voices.splice(idx, 1);
                if (voices.length === 0)
                  state.audio.activeVoices.delete(ownerId);
              }
            };

            source.start();
          } catch (err) {
            console.error("[AUDIO ERROR]", err);
          }
        }

        if (Array.isArray(result)) {
          if (!profile.allowStack || densityLevel === "high") {
            playSampleBuffer(result[0]);
          } else {
            result.forEach(playSampleBuffer);
          }
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
        count: 0,
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
        activeDrawer: null,
      },
      sampler: {
        activeNote: null,
        activeNoteClass: 0, // 0–11 (C–B)
        activeOctave: 4, // default octave 4
      },
      // ── GlyphLab (legacy — kept for glyphDrawer.js compatibility) ──────────
      glyphs: {
        activeNote: "C",
        renderer: "square",
        colorMode: "duotone",
        size: 64,
        insertReady: false,
        insertNote: null,
        insertScale: 1.0,
        tool: "select",
      },
      glyphLibrary: {
        saved: [],
        recent: [],
      },
      // ── SymbolSystem ──────────────────────────────────────────────────────
      symbols: {
        activeSetId: null, // String | null — managed by SBE.SymbolSystem
        activeSlotKey: "A", // SINGLE authoritative slot — preview, placement, export all derive from this
        placementSize: 48, // px
        placementPalette: null, // SymbolPalette override | null = use set default
      },
      // ── SymbolObjects — world-space placed symbol instances ───────────────
      symbolObjects: [], // SymbolObject[]
      selectedSymbolObjectIds: new Set(), // Set<String> — multi-select model
      // symbolPreview — preview mode state (persisted with scene)
      symbolPreview: {
        mode: "glyph", // "glyph" | "word" | "poem" | "pattern" | "world"
        word: {
          text: "SOHO",
          scale: 56,
          tracking: 8,
        },
        poem: {
          text: "soft little goblin\nsleeping on my chair\nacting like they pay the rent",
          fontSize: 26,
          lineHeight: 1.6,
          tracking: 3,
          wrapWidth: 220,
          align: "left",
        },
        pattern: {
          columns: 6,
          rows: 6,
          spacing: 8,
          jitter: 0,
          randomRotation: 0,
          randomScale: 0,
        },
        world: {
          density: 40,
          drift: 0.2,
        },
      },

      // symbolBrush — stamp/brush placement parameters
      symbolBrush: {
        spacing: 32, // min world-px between brush stamps
        randomRotation: 0, // 0–1: fraction of 2π applied randomly per stamp
        randomScale: 0, // 0–1: ±50% scale variation applied randomly
        followStroke: true, // orient stamp along drag direction
      },
      selection: {
        strokeId: null, // single primary selection (for handles, inspector)
        strokeIds: new Set(), // multi-select set for grouping + deletion
        groupId: null, // selected group (if stroke belongs to group)
      },
      selectMarquee: null, // { x1, y1, x2, y2, shift } — live drag rect for marquee select
      groups: {}, // id → GroupNode (wrapper layer over strokes)
      particles: [], // emitter particles { x, y, vx, vy, life, color }
      projectileTool: {
        // ProjectileWalkerMigration v1.0.0 — walkers are now default
        useWalkers: true, // projectile walkers are authoritative; legacy balls are legacy
        bounce: 0.82,
        gravityScale: 1.0,
        radius: 8,
        showPhysics: false,
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
        activeVoices: null, // Map<ownerId, [{source, gain}]> — initialized on first use
      },
      sampleBanks: (function () {
        var banks = {};
        for (var i = 0; i < 12; i++) {
          banks[i] = { mode: "single", index: 0 };
        }
        return banks;
      })(),
      // ── Generic 16-slot bank system (v2) ──────────────────────────────
      banks: (function () {
        return Array.from({ length: 16 }, function (_, i) {
          return { id: "bank_" + (i + 1), samples: [], color: null, label: "" };
        });
      })(),
      viewportMode: "portrait", // "portrait" | "landscape"
      // ── Layer System (SubjectAndLayerSystem v1.0.0) ─────────────────────
      layers: (function () {
        return [
          {
            id: "layer-1",
            name: "Layer 1",
            visible: true,
            locked: false,
            opacity: 1.0,
            blendMode: "normal",
          },
        ];
      })(),
      activeLayerId: "layer-1",
      layersEditingId: null, // id of layer currently being renamed
      physics: {
        gravity: { x: 0, y: 3.0 },
        damping: 0.996,
        maxSpeed: 20,
      },
      world: {
        mode: "gravity",
        strength: 3,
        direction: { x: 0, y: 1 },
        layers: [], // WorldLayer[] — grid and future layer types
        // ── Field visualization (FieldVisualizationSystem v1.0.0) ─────────
        fieldViz: {
          enabled: false,
          opacity: 0.35,
          mode: "heatmap", // vector|flow|heatmap(density)|territory|particles|trails — "density" kept as compat alias
          blur: 24,
          decay: 0.985,
          accumulation: 0.04,
          palette: "infra",
        },
        // ── Dual-plane physics (DualPlanePhysics v1.0.0) ─────────────────
        physics: {
          mode: "side", // "side" | "topdown"
          screen: {
            gravityX: 0,
            gravityY: 1,
            strength: 1,
          },
          world: {
            fieldType: "none", // "none" | "flow" | "vector" | "orbital"
            vectorX: 0,
            vectorY: 0,
            strength: 0,
          },
          // ── Flow field walker drift (FlowFieldWalkerDrift v1.0.0) ───────
          flow: {
            enabled: false,
            strength: 0.015, // field force per frame (0..0.1)
            damping: 0.985, // velocity damping (0.9..1.0)
            turbulence: 0.0, // reserved — future curl noise
            curl: 0.0, // reserved — future curl field
            orbitalMode: "tangential", // "radial" | "tangential" | "hybrid"
          },
        },
        // ── Corridor Ecology (LocalRealization v1.0.0) ───────────────────────
      // Lazy-initialized by initEcology(). Stored under state.world.ecology.
      // Realization config lives alongside so it serializes naturally.
      realization: {
        enabled:         true,
        radius:          1800,
        maxActive:       120,
        despawnPadding:  300,
        visualizeRadius: true,
      },
      // ── Cluster Events (ClusterEvents v1.0.0) ────────────────────────────────
      clusterEvents: {
        enabled:   true,
        events:    [],
        maxEvents: 12,
        debugDraw: false,
        metrics:   { active: 0, peak: 0, avgStrength: 0 },
      },
      // ── Passenger Demo (FirstPassengerDemo v1.0.0) ──────────────────────────────
      passengerDemo: {
        enabled:          false,   // activate via SBE.PassengerDemo.init(state, now)
        phase:            "calm",
        startedAt:        0,
        phaseStartedAt:   0,
        _primaryInjected: false,
        _secondaryInjected: false,
        _primaryEventId:  null,
        _phaseLabel:      "",
        _phaseLabelAt:    0,
        log:              [],
        metrics:          { phase: "calm", phaseElapsed: 0, demoElapsed: 0 },
      },
      // ── Camera Curiosity (CameraCuriosity v1.0.0 / Passenger v1.0.0) ──────────
      cameraCuriosity: {
        enabled:                    true,
        state:                      "idle",
        passengerMode:              "documentary",  // wander|documentary|hunter|zen
        currentTarget:              null,
        currentScore:               0,
        lingerUntil:                0,
        reevaluateAt:               0,
        drivingCamera:              false,
        debugDraw:                  false,
        debugCameraTrail:           false,
        // Validation parameters
        targetPersistenceMultiplier: 1.35,
        maxCameraVelocity:           14,    // world units / frame (velocity clamp)
        zoomDeadzone:                0.08,  // skip zoom update if diff < this
        observeDriftRadius:          24,    // handheld micro-drift radius (wu)
        observeDriftSpeed:           0.03,  // drift speed (time scale)
        releaseBlendTime:            6.0,   // seconds for release smoothing
        recentTargets:               [],    // cooldown memory
        // Audio awareness hook (future)
        audioAwareness: {
          enabled:       false,
          rhythmWeight:  0.0,
          densityWeight: 0.0,
          harmonyWeight: 0.0,
        },
        metrics: { nodes: 0, strongest: 0, stateTime: 0, cameraVelocity: 0, zoom: 1 },
      },
      // ── Actor Ecology (ActorEcology v1.0.0) ──────────────────────────────────
      actors: {
        enabled:            true,
        maxAbstractActors:  4000,
        maxRealizedActors:  140,
        realizationRadius:  1200,
        spawnRate:          1.0,
        debugDraw:          false,
        metrics: { abstractCount: 0, realizedCount: 0, commuters: 0, nightlife: 0, delivery: 0, wanderers: 0, ghosts: 0 },
      },
      // ── City Rhythm (CityRhythm v1.0.0) ─────────────────────────────────────
      rhythm: {
        enabled:          true,
        dayLengthMinutes: 120,     // 2 real hours = 1 full WOS day
        currentTime:      10.5,   // start at mid-morning (10:30)
        currentHour:      10.5,
        phase:            "day",
        debugDraw:        false,
        weatherBias:      0,
        rhythmScale:      1.0,
        metrics: { cityEnergy: 0.5, nightlifeBias: 0, trafficBias: 0.4, deliveryBias: 0.3 },
      },
      // ── Traffic Flow Field (TrafficFlowField v1.0.0) ────────────────────────
      flow: {
        enabled:            true,
        influenceRadius:    120,
        congestionRadius:   80,
        alignmentStrength:  0.015,
        cohesionStrength:   0.010,
        separationStrength: 0.025,
        congestionSlowdown: 0.65,
        maxNeighbors:       8,
        debugDraw:          false,
        metrics: { activeClusters: 0, avgPressure: 0, maxPressure: 0 },
      },
      // ── world closes here ─────────────────────────────────────────────────
      },
      // ── Field visualizer (FieldVisualizer v1.0.0) ────────────────────────
      fieldVisualizer: {
        enabled: false,
        mode: "vectors", // vectors|drift|particles|trails|heatmap
        palette: "infra",
        opacity: 0.5,
        gridStep: 48, // px between vector grid arrows
        arrowLen: 16, // px arrow length
        trailDecay: 0.97, // trail persistence (0.9..1.0)
      },
      gridBanks: {}, // cartridgeId → extended bank with typed events
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
        strokeWidth: 18,
        behaviorType: "normal",
        behaviorStrength: 1.4,
        textValue: "SWARM",
        textSize: 160,
        textScale: 1,
        textRotation: 0,
        autoWalker: false,
      },
      // ── Canvas Tool Sub-Bar state (creation defaults, not object properties) ──
      tools: {
        brush: {
          fill: noteToColor(60),
          stroke: noteToColor(60),
          strokeWidth: 18,
          walkerEnabled: true, // new strokes get a walker by default
          trailEnabled: false,
          soundSource: "synth", // "off" | "synth" | "sample"
          soundRole: "drum", // "drum" | "bass" | "lead" | "pad"
          sound: { trigger: "continuous" }, // engine-canonical trigger state
        },
        ball: {
          fill: "#f3f2ef",
          stroke: "#222222",
          radius: 8,
          velocity: 2,
          bounciness: 0.9,
        },
        text: {
          fill: "#ffffff",
          fontSize: 14,
          multiline: true,
        },
        walker: {
          mode: "pingpong",
          speed: 1,
          trailStyle: "off",
          selfSoundEnabled: false,
        },
      },
      transform: {
        active: false,
        type: "move", // "move" | "scale" | "rotate"
        start: null,
        targetId: null,
        origin: null, // centroid for rotate, anchor corner for scale
        startBounds: null, // bounding box at drag start for scale
        startAngle: null, // angle at drag start for rotate
        startWidth: null, // stroke.width at drag start for scale
        originPt: null, // cursor position at drag start (for delta capture)
        rotationAccum: 0, // accumulated rotation angle during current drag
      },
      duplication: {
        dx: 0,
        dy: 0,
        rotation: 0,
        scale: 1,
        valid: false,
      },
      cursor: { x: 0, y: 0 }, // live canvas cursor position for overlays
      frame: 0, // monotonically increasing render frame counter
      lineTool: {
        step: 0,
        startPoint: null,
        previewEnd: null,
        lengthInput: "",
        isTyping: false,
      },
      strokes: [],
      walkers: [],
      projectileWalkers: [], // motionMode:"projectile" — ProjectileWalkerMigration v1.0.0
      walker: {
        enabled: true,
        baseNote: 60,
        speed: 0.0025,
        triggerStep: 0.02,
        audioEnabled: false, // false → walkers silent by default; collision-driven audio controlled by triggerOthers
        collisionEnabled: false, // future-safe flag: walker↔object collisions (not yet implemented)
        triggerOthers: true, // true → walker hitting OTHER strokes produces sound even when audioEnabled=false
        debugForceSound: false, // true → walker always emits at full energy for audio testing
      },

      camera: {
        x: 0,
        y: 0,
        zoom: 1,
        targetX: 0,
        targetY: 0,
        targetZoom: 1,
        mode: "free", // "free" | "follow"
        follow: { walkerId: null, lerp: 0.08 },
        zoomLimits: { min: 0.2, max: 8 },
      },
      labels: [], // world-space text labels
      activeLabelId: null, // id of label currently being edited
      textEditing: false, // true while label keyboard capture is active
      view: {
        showPaths: true, // toggle stroke line visibility (walkers/particles always shown)
      },
      midiCartridges: [], // loaded MIDI cartridges — { id, name, bpm, notes, length }
      midiBanks: [], // bank wrappers { id, cartridgeId, graphId, samples, repeat, consumed }
      midiPoints: [], // projected note points { id, graphId, bankId, strokeId, t, note, ... }
      graphs: {}, // graphId → { id, strokeIds, bankId, mode, closed }
      activeMidiBankId: null, // most recently loaded bank
      midiPlayback: {
        enabled: true,
        source: "activeBank",
        lastBeat: 0,
        lastTransportRunId: 0,
        firedNoteKeys: new Set(),
        activeNotes: [],
        lastTriggeredNotes: [],
        debug: false,
        legacyWalkerAudioEnabled: false,
        playheadEventIndex: null,
        playheadEventId: null,
        playheadBeat: 0,
      },
      signalActivity: {
        active: new Map(), // cellId → { energy, activatedAt, decayMs, velocity, sourceId }
        pending: [], // [{ cellId, energy, meta, fireAt }]
      },
      demo: {
        enabled: false,
        autoStart: false,
      },
      layerControls: {
        atmosphere: { visible: true, opacity: 1.0, solo: false },
        terrain: { visible: true, opacity: 1.0, solo: false },
        signals: { visible: true, opacity: 1.0, solo: false },
        walkers: { visible: true, opacity: 1.0, solo: false },
        midi: { visible: true, opacity: 1.0, solo: false },
        ecology: { visible: true, opacity: 1.0, solo: false },
        debug: { visible: false, opacity: 1.0, solo: false },
      },
      infiniteWorld: {
        enabled: false,
        autoStart: false,
        density: 0.35,
        energy: 0.45,
        tickMs: 180,
        maxEvents: 260,
        beatCursor: 0,
        sourceIndex: 0,
        mode: "sparseField",
        simulatedAudio: true,
        terrainBankId: null,
        terrainLayerId: null,
        probeId: null,
      },
      routeWorld: {
        active: false,
        world: null,
        routes: [],
        segments: [],
        actors: [],
        eventZones: [],
        skins: [],
        cameraRigs: [],
        surfaceAnchors: [],
        camera: null, // initialised on first use via SBE.RouteCamera.makeCamera()
        // Foundation Protocols — Human Aquarium v1.0.0
        clock: null, // initialised on first use via SBE.UniversalClock.makeClock()
        env: null, // initialised on first use via SBE.EnvironmentState.makeEnvironment()
        comms: null, // initialised on first use via SBE.CommsSystem.makeCommsStore()
        // Spatial Infrastructure v1.1.0
        spatial: null, // initialised on first use or via buildPhase1World()
        // Director Mode v1.0.0
        director: null, // initialised on first use via SBE.DirectorMode.makeDirectorState()
        tripPlan: null, // placeholder itinerary model (future spec)
        // Reference Geography Layer v1.0.0
        referenceGeography: null, // initialised on first use via SBE.ReferenceGeographyLayer.makeDefaultState()
        // Basemap Foundation v1.0.0
        basemap: null, // initialised on first use via SBE.BasemapRenderer.makeDefaultState()
        // Presentation mode — "portrait" | "landscape" | "dual"
        presentationMode: "portrait",
        runtime: {
          elapsedSec: 0,
          activeRouteId: null,
          activeActorId: null,
          activeSegmentId: null,
          triggeredEventIds: new Set(),
        },
      },
      debug: {
        walkers: false,
        paths: false,
        info: false,
        audioLogs: false, // gates per-frame audio spam logs
        visualMode: "clean", // "clean" = low stroke alpha, no segment flash | "full" = original
        driftOverlay: false, // white=path pos, red=post-drift pos
      },
      motion: {
        enabled: true,
        autoBake: false,
        showPath: false,
        mode: "pingpong",
        rate: 40,
        spread: 0.3,
        particleSpeed: 120,
        size: 3,
        life: 1.0,
        type: "dot",
        color: "#ffffff",
        colorSource: "note",
      },
      // motionBrush = creation-time preset only (spec 0428_WOS_MotionBrush_Decoupling)
      // state.motion is kept as inert legacy — motionBrush is the live write target
      motionBrush: {
        enabled: false,
        mode: "pingpong",
        rate: 40,
        spread: 0.3,
        particleSpeed: 120,
        size: 3,
        life: 1.0,
        type: "dot",
        colorSource: "note",
        color: "#ffffff",
      },
      defaultRenderMode: "visible", // applied to newly drawn strokes
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
      penTool: {
        mode: "freehand", // "freehand" | "shape" | "line" | "place-shape"
        selectedLibraryShape: null, // active library shape for place-shape mode
        isDrawing: false,
        currentStroke: null, // in-flight buffer { points: [] }
        previewPoint: null,
        dragThreshold: 8,
        shapeCloseThreshold: 20,
        lastPointer: null,
        // freehand-specific
        activeStrokeId: null,
        streamline: 0.65,
        persistSpecks: false,
      },
      grid: {
        enabled: false,
        size: 20,
        snap: true,
      },
    };

    var heldKeys = new Set();
    // ── Bootstrap validation log ──────────────────────────────────────────────
    console.log("[STATE BOOTSTRAP] state.world keys:", Object.keys(state.world || {}));
    console.log("[STATE BOOTSTRAP] ecology keys present:",
      "rhythm:",          !!(state.world && state.world.rhythm),
      "clusterEvents:",   !!(state.world && state.world.clusterEvents),
      "actors:",          !!(state.world && state.world.actors),
      "cameraCuriosity:", !!(state.world && state.world.cameraCuriosity),
      "passengerDemo:",   !!(state.world && state.world.passengerDemo),
      "flow:",            !!(state.world && state.world.flow),
      "realization:",     !!(state.world && state.world.realization)
    );

    // Direct exposure — sampleMap is closure-scoped, state is now defined
    window._wos = window._wos || {};
    window._wos.sampleMap = sampleMap;
    window._wos.state = state;
    window._wos.audioState = state.audio;
    window._wos.renderFrame = renderFrame; // exposed for UI controls

    // ── Workspace ────────────────────────────────────────────────────────────
    if (SBE.Workspace) {
      SBE.Workspace.initDefault();
      window._wos.workspace = SBE.Workspace;
    }
    if (SBE.WorkspaceUI) {
      SBE.WorkspaceUI.init();
    }
    if (SBE.SurfaceStateManager) {
      SBE.SurfaceStateManager.init();
    }
    if (SBE.SurfacePresenceManager) {
      SBE.SurfacePresenceManager.init();
    }
    if (SBE.WorldDriftManager) {
      SBE.WorldDriftManager.init();
    }
    if (SBE.SurfaceRegistry) {
      SBE.SurfaceRegistry.init();
    }
    if (SBE.TransitionRuntime) {
      SBE.TransitionRuntime.init();
    }
    if (SBE.BroadcastScheduler) {
      SBE.BroadcastScheduler.init();
    }
    if (SBE.AttentionGeography) {
      SBE.AttentionGeography.init();
    }
    if (SBE.ScenicPersistence) {
      SBE.ScenicPersistence.init();
    }
    if (SBE.PassengerMode) {
      SBE.PassengerMode.init();
    }
    if (SBE.SubwayTopologyRuntime) {
      SBE.SubwayTopologyRuntime.init();
    }
    if (SBE.AtmosphereRuntime) {
      SBE.AtmosphereRuntime.init();
    }
    if (SBE.GridRuntime) {
      SBE.GridRuntime.init();
    }
    if (SBE.RoadTopologyAlignment) {
      SBE.RoadTopologyAlignment.init();
    }
    if (SBE.AISRuntime) {
      SBE.AISRuntime.init();
    }
    if (SBE.OverlayGrammar) {
      SBE.OverlayGrammar.init();
    }
    if (SBE.ObservabilityCamera) {
      SBE.ObservabilityCamera.init();
    }
    if (SBE.TiltProjectionRuntime) {
      // Pass the Mapbox map instance so tilt can drive setPitch()
      SBE.TiltProjectionRuntime.init(typeof map !== 'undefined' ? map : null);
    }
    if (SBE.MarineRenderer) {
      SBE.MarineRenderer.init();
    }
    if (SBE.MarineOverlayCanvasRuntime) {
      SBE.MarineOverlayCanvasRuntime.init({
        parentSelector: '.canvas-area',
        getState: function () { return state; },
      });
    }
    if (SBE.MaritimeOccupancyRenderer) {
      SBE.MaritimeOccupancyRenderer.init({ parentSelector: '.canvas-area' });
    }

    // ── Maritime system auto-start — 0523K ────────────────────────────────
    // Maritime is now a first-class world subsystem. It starts automatically
    // when SBE.systems.maritime.enabled = true. No console commands required.
    //
    // Phase offset: each page load advances the validation feed by a random
    // 0–12 minute head-start so vessels begin at staggered positions along
    // their DR legs — the harbor looks naturally occupied, not freshly spawned.
    //
    // Geographic gate: _maritimeGeoBoundsCheck() runs every 8s and sets
    // SBE.runtimeFlags.maritimeGeoActive. The renderer reads this flag at the
    // top of each frame and returns early (sleeps) if false. The feed continues
    // at 1Hz (lightweight) so AISRuntime state stays live when returning to view.
    (function _maritimeAutoStart() {
      if (!SBE.systems || !SBE.systems.maritime || !SBE.systems.maritime.enabled) return;

      // ── Deferred start — maritime renderer and validation feed are non-essential
      // at first paint. Defer 1500ms after first visible frame so they don't
      // compete with Mapbox tile fetches and the initial style.load reveal.
      function _doStart() {
        var _mor = SBE.MaritimeOccupancyRenderer;
        var _mvf = SBE.MaritimeValidationFeed;

        // Enable the renderer (creates canvas, starts rAF loop)
        if (_mor && SBE.systems.maritime.renderer && !_mor.isEnabled()) {
          _mor.enable(true);
        }

        // Start the validation feed
        if (_mvf && SBE.systems.maritime.validationFeed && SBE.runtimeFlags.enableMaritimeValidationFeed) {
          _mvf.enable(true);
          // Phase-offset: advance 0–12 min so vessels start mid-route.
          // Math.random() is acceptable here — this is startup stagger, not AIS truth.
          var _phaseOffsetMs = Math.floor(Math.random() * 720) * 1000;
          if (_phaseOffsetMs > 0) {
            _mvf.tick(performance.now() + _phaseOffsetMs);
          }
        }

        // Geographic activation gate — evaluated every 8 seconds.
        // NYC harbor corridor bounds: lat 40.55–40.80, lng -74.15 to -73.93.
        // When camera center is outside these bounds the renderer skips frames
        // (maritimeGeoActive = false) and the canvas stays clear.
        // When it re-enters the bounds maritimeGeoActive is restored to true.
        var _MARITIME_GEO = { latMin: 40.55, latMax: 40.80, lngMin: -74.15, lngMax: -73.93 };

        function _maritimeGeoBoundsCheck() {
          var mvr = SBE.MapboxViewportRuntime;
          var cam = mvr && mvr.getCamera ? mvr.getCamera() : null;
          if (!cam) return; // can't determine position — leave current state
          var lat = cam.lat != null ? cam.lat : (cam.center && cam.center[1]);
          var lng = cam.lng != null ? cam.lng : (cam.center && cam.center[0]);
          if (lat == null || lng == null) return;
          var inBounds = lat >= _MARITIME_GEO.latMin && lat <= _MARITIME_GEO.latMax &&
                         lng >= _MARITIME_GEO.lngMin && lng <= _MARITIME_GEO.lngMax;
          if (SBE.runtimeFlags.maritimeGeoActive !== inBounds) {
            SBE.runtimeFlags.maritimeGeoActive = inBounds;
            if (!inBounds) {
              console.log('[WOS] Maritime: camera outside harbor bounds — renderer sleeping');
            } else {
              console.log('[WOS] Maritime: camera re-entered harbor bounds — renderer active');
            }
          }
        }

        if (SBE.systems.maritime.geoGated) {
          // Immediate check, then poll every 8 seconds
          setTimeout(_maritimeGeoBoundsCheck, 0);
          setInterval(_maritimeGeoBoundsCheck, 8000);
        }

        var _morRef = SBE.MaritimeOccupancyRenderer;
        var _mvfRef = SBE.MaritimeValidationFeed;
        console.log('[WOS] Maritime system AUTO-STARTED (0523K)');
        console.log('  renderer:       ' + (_morRef && _morRef.isEnabled() ? 'ON' : 'unavailable'));
        console.log('  validationFeed: ' + (_mvfRef ? 'ON' : 'unavailable'));
        console.log('  geoGated:       ' + SBE.systems.maritime.geoGated);

        // ── Boot diagnostic — deferred 1500ms to allow AISRuntime first flush ──
        setTimeout(function _maritimeBootDiag() {
          var _diagAIS = SBE.AISRuntime;
          var _diagMOR = SBE.MaritimeOccupancyRenderer;
          var _diagMVF = SBE.MaritimeValidationFeed;
          var _diagRF  = SBE.runtimeFlags || {};

          var _allActive   = _diagAIS ? _diagAIS.getActiveVessels() : [];
          var _valActive   = _allActive.filter(function (v) {
            return v.mmsi >= 999001001 && v.mmsi <= 999001035;
          }).length;
          var _snap = _diagMOR ? _diagMOR.getDebugSnapshot() : null;

          console.log('[WOS Maritime Boot]', {
            feedEnabled:        !!(_diagMVF && _diagMVF.isEnabled && _diagMVF.isEnabled()),
            aisActive:          _allActive.length,
            validationActive:   _valActive,
            rendererAIS:        _snap ? _snap.telemetry.aisRendered       : 0,
            hiddenByAtmosphere: _snap ? _snap.telemetry.atmosphericHidden  : 0,
            geoActive:          _diagRF.maritimeGeoActive !== false,
            carsEnabled:        !!_diagRF.landTrafficEnabled,
          });
        }, 1500);
      } // end _doStart

      // Defer maritime start until 1500ms after first visible frame.
      // This prevents validation feed XHR and renderer canvas allocation
      // from competing with Mapbox tile fetches during the boot reveal window.
      var _bs = SBE.WOSBootSequencer;
      if (_bs && typeof _bs.defer === 'function') {
        _bs.defer('maritimeAutoStart', _doStart, 1500);
      } else {
        // Fallback: 2s delay from DOMContentLoaded (original behavior was immediate)
        setTimeout(_doStart, 2000);
      }
    })();

    if (SBE.TrafficFlowRuntime && SBE.runtimeFlags.landTrafficEnabled) {
      SBE.TrafficFlowRuntime.init();
    }
    if (SBE.OverlayRuntime) {
      SBE.OverlayRuntime.init();
    }
    if (SBE.TrafficRenderer) {
      SBE.TrafficRenderer.init();
      // Disable unless land traffic is explicitly enabled.
      // This covers both the maritime default (landTrafficEnabled=false)
      // and the legacy harborBootstrapMode path.
      if (!SBE.runtimeFlags.landTrafficEnabled || SBE.runtimeFlags.harborBootstrapMode) {
        SBE.TrafficRenderer.disable();
      }
    }
    if (SBE.RealitySyncRuntime) {
      SBE.RealitySyncRuntime.init();
    }
    if (SBE.EnvironmentalTelemetryHUD) {
      SBE.EnvironmentalTelemetryHUD.init();
    }

    // ── SubwayTopologyRuntime observability ───────────────────────────────
    // 0520E_WOS_DebugInfrastructure_v1.1.0
    // Read-only, allocation-conscious, GC-safe. Never throws.
    function buildInfrastructureDebugSnapshot(runtime) {
      var s  = runtime.getState();
      var ps = s.pulseState;
      var tt = s.topologyTime;
      var now = performance.now();

      // ── Phase ────────────────────────────────────────────────────────
      var phaseLabels = {
        deep_night:    "Deep Night",    early_morning: "Early Morning",
        morning_rush:  "Morning Rush",  midmorning:    "Midmorning",
        midday:        "Midday",        afternoon:     "Afternoon",
        evening_rush:  "Evening Rush",  early_evening: "Early Evening",
        late_evening:  "Late Evening",  late_night:    "Late Night",
      };
      var phase = {
        id:    tt.phase,
        hour:  Math.round(tt.hour * 100) / 100,
        label: phaseLabels[tt.phase] || tt.phase,
      };

      // ── Clock ────────────────────────────────────────────────────────
      var h = tt.hour | 0;
      var clock = {
        hour:          h,
        minute:        Math.round((tt.hour - h) * 60),
        normalizedDay: Math.round((tt.hour / 24) * 1000) / 1000,
      };

      // ── Pulse ────────────────────────────────────────────────────────
      // Derive transferPressure as average of top transfer node weights
      var tIds = Object.keys(s.transferNodes);
      var tSum = 0;
      for (var ti = 0; ti < tIds.length; ti++) {
        tSum += (s.transferNodes[tIds[ti]].weight || 0);
      }
      var transferPressure = tIds.length ? Math.round((tSum / tIds.length) * ps.intensity * 100) / 100 : 0;

      var pulse = {
        intensity:        Math.round(ps.intensity    * 1000) / 1000,
        silenceBias:      Math.round(ps.silenceBias  * 1000) / 1000,
        rushPressure:     Math.round(ps.rushPressure * 1000) / 1000,
        transferPressure: Math.min(1, transferPressure),
      };

      // ── Districts — top 5 by pressure, bounded loop ──────────────────
      var dKeys     = Object.keys(s.districtPulse);
      var dArr      = [];
      var moodTable = [
        [0.80, "urgent"],
        [0.60, "active"],
        [0.40, "ambient"],
        [0.20, "quiet"],
        [0.00, "dormant"],
      ];
      function _mood(w) {
        for (var mi = 0; mi < moodTable.length; mi++) {
          if (w >= moodTable[mi][0]) return moodTable[mi][1];
        }
        return "dormant";
      }
      for (var di = 0; di < dKeys.length; di++) {
        var dw = s.districtPulse[dKeys[di]];
        dArr.push({ id: dKeys[di], label: dKeys[di].replace(/_/g, " "), weight: Math.round(dw * 1000) / 1000, mood: _mood(dw) });
      }
      // In-place insertion sort — avoids .sort() GC churn on small arrays
      for (var si = 1; si < dArr.length; si++) {
        var cur = dArr[si]; var sj = si - 1;
        while (sj >= 0 && dArr[sj].weight < cur.weight) { dArr[sj + 1] = dArr[sj]; sj--; }
        dArr[sj + 1] = cur;
      }
      var districts = dArr.length > 5 ? dArr.slice(0, 5) : dArr;

      // ── Transfers ─────────────────────────────────────────────────────
      var transfers = [];
      for (var tti = 0; tti < tIds.length; tti++) {
        var tn  = s.transferNodes[tIds[tti]];
        var st  = s.stations[tIds[tti]];
        transfers.push({
          id:             tIds[tti],
          connectedLines: (tn.connectedLines || []).join(", "),
          pressure:       Math.round(tn.weight * ps.intensity * 100) / 100,
        });
      }

      // ── Lines ─────────────────────────────────────────────────────────
      var lKeys = Object.keys(s.lines);
      var lines = [];
      for (var li = 0; li < lKeys.length; li++) {
        var ln  = s.lines[lKeys[li]];
        var rp  = ln.rhythmProfile || {};
        var act = ps.rushPressure > 0.8
          ? (rp.daytimeIntensity || 0.5) * (rp.rushAmplification || 1)
          : ps.intensity < 0.3
            ? (rp.nighttimeIntensity || 0.2)
            : (rp.daytimeIntensity || 0.5);
        lines.push({
          id:       lKeys[li],
          stations: (ln.districts || []).length + " districts",
          activity: Math.round(Math.min(1, act * ps.intensity) * 100) / 100,
        });
      }

      // ── Diagnostics ───────────────────────────────────────────────────
      var diagnostics = {
        runtimeActive:    true,
        lineCount:        lKeys.length,
        stationCount:     Object.keys(s.stations).length,
        districtCount:    dKeys.length,
        transferCount:    tIds.length,
        msSinceLastUpdate: Math.round(now),  // proxy — STR has no lastUpdatedAt yet
      };

      return Object.freeze({
        __version:   "1.1.0",
        phase:       phase,
        clock:       clock,
        pulse:       pulse,
        districts:   districts,
        transfers:   transfers,
        lines:       lines,
        diagnostics: diagnostics,
      });
    }

    window._wos.debugInfrastructure = function debugInfrastructure() {
      var runtime = window.SBE && SBE.SubwayTopologyRuntime;
      if (!runtime) {
        console.warn("[WOS] SubwayTopologyRuntime unavailable");
        return { error: "SubwayTopologyRuntime unavailable" };
      }
      try {
        var snap = buildInfrastructureDebugSnapshot(runtime);
        console.groupCollapsed("[WOS] Infrastructure Debug — " + snap.phase.label + " · h" + snap.clock.hour + ":" + (snap.clock.minute < 10 ? "0" : "") + snap.clock.minute);
        console.log("Phase",       snap.phase);
        console.log("Clock",       snap.clock);
        console.log("Pulse",       snap.pulse);
        console.table(snap.districts);
        console.table(snap.transfers);
        console.table(snap.lines);
        console.log("Diagnostics", snap.diagnostics);
        console.groupEnd();
        return snap;
      } catch (e) {
        console.warn("[WOS] debugInfrastructure error:", e);
        return { error: String(e) };
      }
    };

    // ── Traffic debug helpers ──────────────────────────────────────────────

    // _wos.debugTrafficSamples()
    // Displays arc-length sample topology: node count, segment spacing,
    // elevation markers, total length per corridor.
    window._wos.debugTrafficSamples = function debugTrafficSamples(corridorId) {
      var tfr = window.SBE && SBE.TrafficFlowRuntime;
      if (!tfr) { console.warn("[WOS] TrafficFlowRuntime unavailable"); return; }
      var corridors = tfr.getCorridors();
      var ids = corridorId ? [corridorId] : Object.keys(corridors);
      var rows = [];
      for (var ci = 0; ci < ids.length; ci++) {
        var c = corridors[ids[ci]];
        if (!c || !c.samples) continue;
        var samples = c.samples;
        var cum     = c.cumulativeDistances;
        var n       = samples.length;
        // Compute segment spacing stats
        var minSeg = Infinity, maxSeg = 0, totalSeg = 0;
        for (var si = 1; si < n; si++) {
          var seg = cum[si] - cum[si - 1];
          if (seg < minSeg) minSeg = seg;
          if (seg > maxSeg) maxSeg = seg;
          totalSeg += seg;
        }
        var avgSeg = n > 1 ? totalSeg / (n - 1) : 0;
        // Bridge elevation range
        var minZ = Infinity, maxZ = -Infinity;
        for (var zi = 0; zi < n; zi++) {
          if (samples[zi].z < minZ) minZ = samples[zi].z;
          if (samples[zi].z > maxZ) maxZ = samples[zi].z;
        }
        rows.push({
          corridorId:   c.id,
          samples:      n,
          totalM:       Math.round(c.totalLength),
          avgSegM:      avgSeg.toFixed(2),
          minSegM:      minSeg.toFixed(2),
          maxSegM:      maxSeg.toFixed(2),
          isBridge:     c.isBridge,
          elevMin:      minZ === Infinity ? 0 : minZ.toFixed(1),
          elevMax:      maxZ === -Infinity ? 0 : maxZ.toFixed(1),
          waypoints:    c.rawWaypoints ? c.rawWaypoints.length : 0,
        });
      }
      console.groupCollapsed("[WOS] Traffic Arc-Length Samples — " + rows.length + " corridors");
      console.table(rows);
      console.groupEnd();
      return rows;
    };

    // _wos.debugTrafficViolations()
    // Highlights vehicles deviating from legal corridor space.
    // Reports: distance from nearest corridor sample, bridge vehicles at z=0,
    // virtual vehicles with stale positions, heading discontinuities.
    window._wos.debugTrafficViolations = function debugTrafficViolations() {
      var tfr = window.SBE && SBE.TrafficFlowRuntime;
      if (!tfr) { console.warn("[WOS] TrafficFlowRuntime unavailable"); return; }
      var vehicles  = tfr.getVehicles();
      var corridors = tfr.getCorridors();
      if (!vehicles || vehicles.length === 0) {
        console.log("[WOS] debugTrafficViolations: no active vehicles");
        return [];
      }
      var violations = [];
      for (var vi = 0; vi < vehicles.length; vi++) {
        var v  = vehicles[vi];
        var c  = corridors[v.corridorId];
        if (!c || !c.samples) continue;
        // Find nearest sample
        var bestD2 = Infinity;
        var samples = c.samples;
        for (var si = 0; si < samples.length; si++) {
          var dx = samples[si].x - v.headlights[0].x;
          var dy = samples[si].y - v.headlights[0].y;
          var d2 = dx * dx + dy * dy;
          if (d2 < bestD2) bestD2 = d2;
        }
        var offRoadM  = Math.sqrt(bestD2);
        var bridgeErr = c.isBridge && v.headlights[0] && offRoadM > 10;
        var isViolation = offRoadM > 15 || bridgeErr;
        if (isViolation) {
          violations.push({
            vehicleId:  v.vehicleId,
            corridorId: v.corridorId,
            offRoadM:   offRoadM.toFixed(1),
            isBridge:   c.isBridge,
            physical:   v.physical,
            distanceM:  v.distanceM ? v.distanceM.toFixed(0) : "—",
          });
        }
      }
      var label = violations.length === 0
        ? "[WOS] Traffic Violations: NONE — all vehicles within corridor bounds"
        : "[WOS] Traffic Violations: " + violations.length + " out of " + vehicles.length;
      if (violations.length === 0) {
        console.log(label);
      } else {
        console.groupCollapsed(label);
        console.table(violations);
        console.groupEnd();
      }
      return violations;
    };

    // _wos.debugRoadProjection()
    // Dumps projected centerlines, lane offsets, bridge segments, intersection joins.
    window._wos.debugRoadProjection = function debugRoadProjection() {
      var rta = window.SBE && SBE.RoadTopologyAlignment;
      if (!rta) { console.warn("[WOS] RoadTopologyAlignment unavailable"); return; }
      var ids = rta.getSegmentIds();
      var nodes = rta.getNodes();
      var stats = rta.getSpatialStats();
      console.group("[WOS] RoadTopologyAlignment — " + ids.length + " segments, " + nodes.length + " intersection nodes");
      console.log("Spatial hash stats:", stats);
      var rows = ids.map(function(id) {
        var seg = rta.getSegment(id);
        if (!seg) return { id: id, error: "not found" };
        var row = {
          id: id,
          totalLengthM: seg.totalLength ? seg.totalLength.toFixed(1) : "?",
          arcSamples: seg.arcSamples ? seg.arcSamples.length : "?",
          lanes: seg.lanes || 1,
          laneWidthM: seg.laneWidth || "?",
          isBridge: !!seg.isBridge,
          waterExclusion: !!seg.waterExclusion,
        };
        // elevation range from arc samples
        if (seg.arcSamples && seg.arcSamples.length) {
          var minZ = Infinity, maxZ = -Infinity;
          seg.arcSamples.forEach(function(s) {
            if (s.z < minZ) minZ = s.z;
            if (s.z > maxZ) maxZ = s.z;
          });
          row.minElevM = minZ.toFixed(1);
          row.maxElevM = maxZ.toFixed(1);
        }
        return row;
      });
      if (console.table) {
        console.table(rows);
      } else {
        rows.forEach(function(r) { console.log(JSON.stringify(r)); });
      }
      // Intersection node summary
      if (nodes.length) {
        console.group("Intersection nodes (" + nodes.length + ")");
        nodes.slice(0, 20).forEach(function(n) {
          console.log(n.id, "x=" + n.x.toFixed(1) + " y=" + n.y.toFixed(1) + " segs=[" + (n.segmentIds || []).join(",") + "]");
        });
        if (nodes.length > 20) console.log("… +" + (nodes.length - 20) + " more");
        console.groupEnd();
      }
      console.groupEnd();
      return rows;
    };

    // _wos.debugRoadViolations()
    // Returns segments/vehicles with water leaks, off-road drift, projection discontinuities.
    window._wos.debugRoadViolations = function debugRoadViolations() {
      var rta = window.SBE && SBE.RoadTopologyAlignment;
      var tfr = window.SBE && SBE.TrafficFlowRuntime;
      var violations = [];

      // 1. Projection discontinuities — consecutive arc samples with implausible jumps
      if (rta) {
        var ids = rta.getSegmentIds();
        ids.forEach(function(id) {
          var seg = rta.getSegment(id);
          if (!seg || !seg.arcSamples || seg.arcSamples.length < 2) return;
          var prev = seg.arcSamples[0];
          for (var i = 1; i < seg.arcSamples.length; i++) {
            var cur = seg.arcSamples[i];
            var dx = cur.x - prev.x, dy = cur.y - prev.y;
            var dist = Math.sqrt(dx*dx + dy*dy);
            if (dist > 20) { // >20m jump between 3m samples = discontinuity
              violations.push({ type: "projection_discontinuity", segId: id, sampleIndex: i, jumpM: dist.toFixed(1) });
            }
            prev = cur;
          }
        });
      }

      // 2. Vehicles off-road (>15m from nearest corridor sample)
      if (tfr) {
        var vehicles = tfr.getVehicles ? tfr.getVehicles() : [];
        vehicles.forEach(function(v) {
          if (!rta) return;
          var nearest = rta.findNearestRoad(v.x, v.y);
          if (!nearest) {
            violations.push({ type: "no_road_found", vehicleId: v.id, x: v.x && v.x.toFixed(1), y: v.y && v.y.toFixed(1) });
          } else if (nearest.distanceM > 15) {
            violations.push({ type: "off_road", vehicleId: v.id, corridorId: v.corridorId, distanceM: nearest.distanceM.toFixed(1), nearestSegId: nearest.segId });
          }
          // 3. Bridge water exclusion — vehicles on bridge corridor with z near 0
          if (v.isBridge && v.z !== undefined && v.z < 2) {
            violations.push({ type: "bridge_elevation_leak", vehicleId: v.id, corridorId: v.corridorId, z: v.z });
          }
        });
      }

      var label = violations.length === 0
        ? "[WOS] Road Violations: NONE"
        : "[WOS] Road Violations: " + violations.length + " found";
      if (violations.length === 0) {
        console.log(label);
      } else {
        console.groupCollapsed(label);
        if (console.table) { console.table(violations); }
        else { violations.forEach(function(v) { console.log(JSON.stringify(v)); }); }
        console.groupEnd();
      }
      return violations;
    };

    // ── AIS debug helpers ──────────────────────────────────────────────────

    // _wos.debugAIS()
    // Snapshot of all active vessels, feed state, and bucket counts.
    window._wos.debugAIS = function debugAIS() {
      var ais = window.SBE && SBE.AISRuntime;
      if (!ais) { console.warn("[WOS] AISRuntime unavailable"); return; }
      var stats   = ais.getStats();
      var vessels = ais.getActiveVessels();
      console.group("[WOS] AISRuntime — feed:" + stats.feedState +
        "  active:" + stats.active +
        "  dormant:" + stats.dormant +
        "  protected-dormant:" + stats.protectedDormant);
      var rows = vessels.map(function(v) {
        return {
          mmsi:        v.mmsi,
          name:        v.vesselName || "—",
          state:       v.state,
          lat:         v.lat.toFixed(5),
          lng:         v.lng.toFixed(5),
          speedKts:    v.speedKnots.toFixed(1),
          hdg:         Math.round(v.trueHeading),
          protected:   v.isProtected,
          persistent:  v.isPersistent,
          isBridge:    !!(v.mooringReference || v.anchoringReference),
          impWt:       v.importanceWeight.toFixed(2),
          visWt:       v.visibilityWeight.toFixed(2),
          ageSec:      Math.round((performance.now() - v.lastUpdateMs) / 1000),
        };
      });
      if (console.table) { console.table(rows); }
      else { rows.forEach(function(r) { console.log(JSON.stringify(r)); }); }
      console.groupEnd();
      return rows;
    };

    // _wos.debugAISVessel(mmsi)
    // Full state dump for a single vessel.
    window._wos.debugAISVessel = function debugAISVessel(mmsi) {
      var ais = window.SBE && SBE.AISRuntime;
      if (!ais) { console.warn("[WOS] AISRuntime unavailable"); return; }
      var v = ais.getVessel(mmsi);
      if (!v) { console.warn("[WOS] Vessel not found in active bucket:", mmsi); return null; }
      console.log("[WOS] Vessel", mmsi, v);
      return v;
    };

    // _wos.injectAISPacket(packet)
    // Inject a pre-normalized AIS packet for testing (bypasses WebSocket feed).
    window._wos.injectAISPacket = function injectAISPacket(packet) {
      var bridge = window.SBE && SBE.AISIngestBridge;
      if (!bridge) { console.warn("[WOS] AISIngestBridge unavailable"); return false; }
      return bridge.injectPacket(packet);
    };

    // _wos.seedAISHarbor()
    // Inject a representative set of NYC harbor vessels for visual validation.
    window._wos.seedAISHarbor = function seedAISHarbor() {
      var bridge = window.SBE && SBE.AISIngestBridge;
      if (!bridge) { console.warn("[WOS] AISIngestBridge unavailable"); return; }
      bridge.injectSeedVessels([
        // Staten Island Ferry — Arthur Kill run
        { mmsi: 366123001, vesselName: "STATEN ISLAND FERRY", callsign: "WDF7411",
          state: "STATUS_UNDERWAY", lat: 40.6425, lng: -74.0165,
          speedKnots: 16.5, courseOverGround: 350, trueHeading: 352,
          lengthMeters: 171, widthMeters: 21 },
        // Container ship at anchor, lower bay
        { mmsi: 477123456, vesselName: "MSC ADRIATIC",
          state: "STATUS_ANCHORED", lat: 40.5520, lng: -74.0730,
          speedKnots: 0, courseOverGround: 0, trueHeading: 270,
          lengthMeters: 366, widthMeters: 48 },
        // Tug pushing barge, Kill Van Kull
        { mmsi: 366987654, vesselName: "PATRICIA ANN", callsign: "WYA2019",
          state: "STATUS_UNDERWAY", lat: 40.6372, lng: -74.1258,
          speedKnots: 6.2, courseOverGround: 75, trueHeading: 76,
          lengthMeters: 34, widthMeters: 9 },
        // Cruise ship moored at Brooklyn Cruise Terminal
        { mmsi: 310123789, vesselName: "NORWEGIAN DAWN",
          state: "STATUS_MOORED", lat: 40.6695, lng: -74.0175,
          speedKnots: 0, courseOverGround: 0, trueHeading: 310,
          lengthMeters: 294, widthMeters: 32 },
        // Coast Guard cutter, underway near Verrazano
        { mmsi: 338123456, vesselName: "USCGC DEPENDABLE", callsign: "NIAG",
          state: "STATUS_UNDERWAY", lat: 40.6030, lng: -74.0440,
          speedKnots: 12.0, courseOverGround: 45, trueHeading: 44,
          lengthMeters: 82, widthMeters: 13 },
        // Research vessel, restricted
        { mmsi: 367654321, vesselName: "PIONEER",
          state: "STATUS_RESTRICTED", lat: 40.7095, lng: -74.0230,
          speedKnots: 3.1, courseOverGround: 185, trueHeading: 185,
          lengthMeters: 55, widthMeters: 12 },
        // Water taxi, East River
        { mmsi: 366543219, vesselName: "NY WATER TAXI 8",
          state: "STATUS_UNDERWAY", lat: 40.7015, lng: -74.0145,
          speedKnots: 18.0, courseOverGround: 20, trueHeading: 20,
          lengthMeters: 24, widthMeters: 6 },
        // Tanker, Gravesend Bay
        { mmsi: 205123456, vesselName: "IVER INNOVATION",
          state: "STATUS_ANCHORED", lat: 40.5810, lng: -74.0040,
          speedKnots: 0, courseOverGround: 0, trueHeading: 180,
          lengthMeters: 183, widthMeters: 28 },
      ]);
      console.log("[WOS] Seeded 8 harbor vessels. Call _wos.debugAIS() to inspect.");
    };

    // _wos.promotePersistentVessel(mmsi, metadata)
    // Mark a vessel as persistent identity (bypasses LRU eviction, 24h dormant TTL).
    window._wos.promotePersistentVessel = function promotePersistentVessel(mmsi, metadata) {
      var ais = window.SBE && SBE.AISRuntime;
      if (!ais) { console.warn("[WOS] AISRuntime unavailable"); return; }
      ais.promotePersistentVessel(mmsi, metadata || {});
      console.log("[WOS] Vessel", mmsi, "promoted to persistent identity");
    };

    // _wos.demotePersistentVessel(mmsi)
    window._wos.demotePersistentVessel = function demotePersistentVessel(mmsi) {
      var ais = window.SBE && SBE.AISRuntime;
      if (!ais) { console.warn("[WOS] AISRuntime unavailable"); return; }
      ais.demotePersistentVessel(mmsi);
      console.log("[WOS] Vessel", mmsi, "demoted from persistent identity");
    };

    // ── MarineRenderer debug APIs (§16 MarineRenderer v1.0.4) ─────────────

    // _wos.debugMarineScalars(enabled)
    // Overlay continuity scalars (sc/ca/dr/iw/st/coast) on each rendered vessel.
    window._wos.debugMarineScalars = function debugMarineScalars(enabled) {
      var mr = window.SBE && SBE.MarineRenderer;
      if (!mr) { console.warn("[WOS] MarineRenderer unavailable"); return; }
      var on = enabled !== false;
      mr.setDebugScalars(on);
      console.log("[WOS] MarineRenderer scalar overlay:", on ? "ON" : "OFF");
    };

    // _wos.debugMarineInterpolation(enabled)
    // Overlay interpolation delta lines — shows gap between render position
    // and runtime truth, revealing smoothing aggressiveness.
    window._wos.debugMarineInterpolation = function debugMarineInterpolation(enabled) {
      var mr = window.SBE && SBE.MarineRenderer;
      if (!mr) { console.warn("[WOS] MarineRenderer unavailable"); return; }
      var on = enabled !== false;
      mr.setDebugInterpolation(on);
      console.log("[WOS] MarineRenderer interpolation overlay:", on ? "ON" : "OFF");
    };

    // _wos.debugMarineLifecycle(enabled)
    // Overlay lifecycle state abbreviation on each vessel (UNDE / ANCH / MOOR / etc).
    window._wos.debugMarineLifecycle = function debugMarineLifecycle(enabled) {
      var mr = window.SBE && SBE.MarineRenderer;
      if (!mr) { console.warn("[WOS] MarineRenderer unavailable"); return; }
      var on = enabled !== false;
      mr.setDebugLifecycle(on);
      console.log("[WOS] MarineRenderer lifecycle overlay:", on ? "ON" : "OFF");
    };

    // _wos.debugMarineSnapshot()
    // Returns full runtime + render state snapshot for all active vessels.
    // Useful for governance parity verification: compare continuity fields
    // between runtime truth and what the renderer is currently presenting.
    window._wos.debugMarineSnapshot = function debugMarineSnapshot() {
      var mr = window.SBE && SBE.MarineRenderer;
      if (!mr) { console.warn("[WOS] MarineRenderer unavailable"); return; }
      var snap = mr.getDebugSnapshot();
      var vessels = snap.vessels || snap; // compat: handle both new {vessels:[]} and old [] form
      console.group("[WOS] MarineRenderer snapshot — " + vessels.length + " active vessels" +
        " | renderState:" + snap.renderStateCount + " | lastRender:" + (snap.msSinceRender != null ? snap.msSinceRender + 'ms ago' : 'never'));
      vessels.forEach(function(s) {
        var lag = "";
        if (s.runtime && s.render) {
          var dLat = Math.abs(s.runtime.lat - s.render.lat) * 111320;
          var dLng = Math.abs(s.runtime.lng - s.render.lng) * 111320;
          lag = " lag≈" + Math.round(Math.sqrt(dLat*dLat + dLng*dLng)) + "m";
        }
        console.log(
          s.mmsi, s.state + lag,
          "sc:" + (s.continuity && s.continuity.signalConfidence || 0).toFixed(2),
          "ca:" + (s.continuity && s.continuity.continuityAlpha  || 0).toFixed(2),
          "iw:" + (s.continuity && s.continuity.interpolationWeight || 0).toFixed(2)
        );
      });
      console.groupEnd();
      return snap;
    };

    // ── OverlayGrammar debug helpers ───────────────────────────────────────

    // _wos.debugOverlayGrammar()
    // Snapshot of all active OverlayProjectionRecords.
    // Shows projectionOpacity, projectionScale, reductionState, sourceAuthority.
    // Use alongside _wos.debugMarineSnapshot() to verify renderer/grammar parity.
    window._wos.debugOverlayGrammar = function debugOverlayGrammar() {
      var og = window.SBE && SBE.OverlayGrammar;
      if (!og) { console.warn("[WOS] OverlayGrammar unavailable"); return; }
      var state = og.getProjectionState();
      var records = Object.values(state);
      console.group("[WOS] OverlayGrammar — " + records.length + " projection records");
      var rows = records.map(function(r) {
        return {
          entityId:   r.entityId,
          state:      r._rawState,
          reduction:  r.reductionState,
          opacity:    r.projectionOpacity.toFixed(3),
          scale:      r.projectionScale.toFixed(3),
          factor:     r.reductionFactor.toFixed(3),
          obsWt:      r.observabilityWeight.toFixed(3),
          ca:         r.continuityAlpha.toFixed(3),
          authority:  r.sourceAuthority,
        };
      });
      if (console.table) { console.table(rows); }
      else { rows.forEach(function(r) { console.log(JSON.stringify(r)); }); }
      console.groupEnd();
      return records;
    };

    // _wos.debugOverlayRecord(mmsi)
    // Full record for a single entity — continuity inputs + projection outputs.
    window._wos.debugOverlayRecord = function debugOverlayRecord(mmsi) {
      var og = window.SBE && SBE.OverlayGrammar;
      if (!og) { console.warn("[WOS] OverlayGrammar unavailable"); return; }
      var r = og.getRecord(mmsi);
      if (!r) { console.warn("[WOS] No overlay record for entity:", mmsi); return null; }
      console.group("[WOS] OverlayRecord " + mmsi + " (" + r._rawState + ")");
      console.log("reduction:   ", r.reductionState, "×" + r.reductionFactor.toFixed(3));
      console.log("opacity:     ", r.projectionOpacity.toFixed(3));
      console.log("scale:       ", r.projectionScale.toFixed(3));
      console.log("obsWeight:   ", r.observabilityWeight.toFixed(3));
      console.log("authority:   ", r.sourceAuthority);
      console.log("continuity:  ", r._rawContinuity);
      console.groupEnd();
      return r;
    };

    // _wos.validateOverlayAuthority()
    // Governance check — verifies OverlayGrammar is NOT mutating AISRuntime state.
    // Compares vessel count before/after a forced projectOverlayState() call.
    window._wos.validateOverlayAuthority = function validateOverlayAuthority() {
      var og  = window.SBE && SBE.OverlayGrammar;
      var ais = window.SBE && SBE.AISRuntime;
      if (!og || !ais) { console.warn("[WOS] OverlayGrammar or AISRuntime unavailable"); return; }
      var beforeVessels = ais.getActiveVessels().map(function(v) {
        return { mmsi: v.mmsi, state: v.state, lat: v.lat, lng: v.lng };
      });
      og.projectOverlayState(); // force evaluation
      var afterVessels  = ais.getActiveVessels().map(function(v) {
        return { mmsi: v.mmsi, state: v.state, lat: v.lat, lng: v.lng };
      });
      var mutations = [];
      beforeVessels.forEach(function(b) {
        var a = afterVessels.find(function(v) { return v.mmsi === b.mmsi; });
        if (!a) { mutations.push({ mmsi: b.mmsi, type: "EVICTED by overlay" }); return; }
        if (a.state !== b.state) mutations.push({ mmsi: b.mmsi, type: "STATE_MUTATED", before: b.state, after: a.state });
        if (Math.abs(a.lat - b.lat) > 1e-8) mutations.push({ mmsi: b.mmsi, type: "POSITION_MUTATED" });
      });
      if (mutations.length === 0) {
        console.log("[WOS] validateOverlayAuthority: PASS — no runtime mutations detected");
      } else {
        console.error("[WOS] validateOverlayAuthority: FAIL — runtime mutations detected!", mutations);
      }
      return mutations;
    };

    // ── ObservabilityCamera debug helpers ──────────────────────────────────

    // _wos.debugCamera()
    // Full ObservabilityCameraState snapshot — mode, pacing, drift, isolation phase,
    // current vs target position, whether Mapbox drive is enabled.
    window._wos.debugCamera = function debugCamera() {
      var oc = window.SBE && SBE.ObservabilityCamera;
      if (!oc) { console.warn("[WOS] ObservabilityCamera unavailable"); return; }
      var s = oc.getState();
      var i = s._internal;
      console.group("[WOS] ObservabilityCamera — mode:" + s.mode +
        "  phase:" + (i && i.isolationPhase) + "  drive:" + (i && i.drivesMapbox));
      console.log("pacing:    ", s.pacingFactor.toFixed(3));
      console.log("drift:     ", s.driftFactor.toFixed(3));
      console.log("obsWeight: ", s.observabilityWeight.toFixed(3));
      console.log("contAlpha: ", s.continuityAlpha.toFixed(3));
      console.log("authority: ", s.sourceAuthority);
      if (i) {
        console.log("current:  ", i.currentLat.toFixed(5), i.currentLng.toFixed(5));
        console.log("target:   ", i.targetLat.toFixed(5),  i.targetLng.toFixed(5));
        var dLat = Math.abs(i.targetLat - i.currentLat) * 111320;
        var dLng = Math.abs(i.targetLng - i.currentLng) * 111320;
        console.log("lagM:     ", Math.round(Math.sqrt(dLat*dLat + dLng*dLng)) + "m");
        console.log("isolTick: ", i.isolationTickCount);
        console.log("settle:   ", i.settleTicksRemaining, "ticks remaining");
      }
      console.groupEnd();
      return s;
    };

    // _wos.cameraMode(mode)
    // Set camera mode. Valid: harbor-drift, corridor-glide, grid-anchor,
    //   ambient-survey, atmospheric-hold
    window._wos.cameraMode = function cameraMode(mode) {
      var oc = window.SBE && SBE.ObservabilityCamera;
      if (!oc) { console.warn("[WOS] ObservabilityCamera unavailable"); return; }
      oc.setMode(mode);
      console.log("[WOS] Camera mode →", mode);
    };

    // _wos.cameraTarget(lat, lng)
    // Override camera framing target. Camera drifts toward this position.
    window._wos.cameraTarget = function cameraTarget(lat, lng) {
      var oc = window.SBE && SBE.ObservabilityCamera;
      if (!oc) { console.warn("[WOS] ObservabilityCamera unavailable"); return; }
      oc.setTarget(lat, lng);
      console.log("[WOS] Camera target →", lat, lng);
    };

    // _wos.enableCameraDrive(bool)
    // Enable/disable Mapbox viewport application.
    // When enabled: ObservabilityCamera drives the map's easeTo() on each tick.
    // Use with caution — this moves the actual viewport.
    window._wos.enableCameraDrive = function enableCameraDrive(enabled) {
      var oc = window.SBE && SBE.ObservabilityCamera;
      if (!oc) { console.warn("[WOS] ObservabilityCamera unavailable"); return; }
      oc.enableMapboxDrive(enabled !== false);
    };

    // _wos.debugCameraAuthority()
    // Governance check — verifies ObservabilityCamera is NOT mutating runtime truth.
    // Compares AISRuntime vessel states before and after a forced camera evaluation.
    window._wos.debugCameraAuthority = function debugCameraAuthority() {
      var oc  = window.SBE && SBE.ObservabilityCamera;
      var ais = window.SBE && SBE.AISRuntime;
      if (!oc || !ais) { console.warn("[WOS] ObservabilityCamera or AISRuntime unavailable"); return; }
      var before = ais.getActiveVessels().map(function(v) {
        return { mmsi: v.mmsi, state: v.state, lat: v.lat, lng: v.lng };
      });
      oc.forceEval();
      var after = ais.getActiveVessels().map(function(v) {
        return { mmsi: v.mmsi, state: v.state, lat: v.lat, lng: v.lng };
      });
      var mutations = [];
      before.forEach(function(b) {
        var a = after.find(function(v) { return v.mmsi === b.mmsi; });
        if (!a)                         mutations.push({ mmsi: b.mmsi, type: "EVICTED_BY_CAMERA" });
        else if (a.state !== b.state)   mutations.push({ mmsi: b.mmsi, type: "STATE_MUTATED", before: b.state, after: a.state });
        else if (Math.abs(a.lat - b.lat) > 1e-8) mutations.push({ mmsi: b.mmsi, type: "POSITION_MUTATED" });
      });
      if (mutations.length === 0) {
        console.log("[WOS] debugCameraAuthority: PASS — no runtime mutations detected");
      } else {
        console.error("[WOS] debugCameraAuthority: FAIL", mutations);
      }
      return mutations;
    };

    // ── Harbor bootstrap & tilt debug APIs (0522) ─────────────────────────

    // _wos.debugMarine()
    // Audit the full marine render pipeline — separates ingestion failure from
    // render failure. Reports counts at each pipeline stage.
    window._wos.debugMarine = function debugMarine() {
      var ais = window.SBE && SBE.AISRuntime;
      var og  = window.SBE && SBE.OverlayGrammar;
      var mr  = window.SBE && SBE.MarineRenderer;

      var hydrated  = ais ? ais.getActiveVessels() : [];
      var stale     = hydrated.filter(function(v) { return v.state === 'STATUS_STALE' || v.state === 'STATUS_OFFLINE'; });
      var protected_ = hydrated.filter(function(v) { return v.isProtected; });

      var projected  = og ? Object.values(og.getProjectionState()) : [];
      var snap       = mr ? mr.getDebugSnapshot() : { initialized: false, renderStateCount: 0, wakeCount: 0, lastRenderMs: 0, msSinceRender: null, vessels: [] };
      var feedState  = ais ? ais.getFeedState() : 'UNKNOWN';

      console.group('[WOS] debugMarine — harbor pipeline audit');
      console.log('feed state:      ', feedState);
      console.log('hydrated:        ', hydrated.length,          '(AISRuntime active bucket)');
      console.log('  stale/offline: ', stale.length);
      console.log('  protected:     ', protected_.length);
      console.log('projected:       ', projected.length,         '(OverlayGrammar records)');
      console.log('mr.initialized:  ', snap.initialized);
      console.log('renderStateCount:', snap.renderStateCount,    '(per-vessel interp state)');
      console.log('wakeCount:       ', snap.wakeCount);
      console.log('lastRenderMs:    ', snap.lastRenderMs > 0 ? snap.msSinceRender + 'ms ago' : 'never');
      if (hydrated.length === 0 && feedState === 'FEED_OFFLINE') {
        console.warn('  → No vessels hydrated. Feed is offline. Try: _wos.injectDebugVessel()');
      } else if (hydrated.length > 0 && projected.length === 0) {
        console.warn('  → Vessels hydrated but OverlayGrammar produced no records. Check OverlayGrammar.init()');
      } else if (projected.length > 0 && snap.renderStateCount === 0 && snap.lastRenderMs === 0) {
        console.warn('  → Projection records exist but MarineRenderer.render() has never been called. Check renderFrame() wiring.');
      } else if (projected.length > 0 && snap.renderStateCount === 0) {
        console.warn('  → render() called but no renderState built. All vessels may be below alpha threshold.');
      } else if (snap.renderStateCount > 0) {
        console.log('  → Pipeline healthy. Vessels flowing through all stages.');
      }
      console.groupEnd();
      return {
        feedState:        feedState,
        hydrated:         hydrated.length,
        stale:            stale.length,
        protected:        protected_.length,
        projected:        projected.length,
        renderStateCount: snap.renderStateCount,
        lastRenderMs:     snap.lastRenderMs,
        msSinceRender:    snap.msSinceRender,
      };
    };

    // _wos.injectDebugVessel(enable)
    // Inject (or remove) a continuously-moving debug vessel on the Upper Bay
    // → East River route. Bypasses feed/suppression floors. Persists until removed.
    window._wos.injectDebugVessel = function injectDebugVessel(enable) {
      var ais = window.SBE && SBE.AISRuntime;
      if (!ais) { console.warn('[WOS] AISRuntime unavailable'); return; }
      var active = ais.injectDebugVessel(enable);
      console.log('[WOS] debug vessel:', active ? 'ACTIVE' : 'REMOVED');
      return active;
    };

    // _wos.enableTilt(bool)
    // Master tilt switch. false → pitch=0 (flat map).
    window._wos.enableTilt = function enableTilt(enabled) {
      var tpr = window.SBE && SBE.TiltProjectionRuntime;
      if (!tpr) { console.warn('[WOS] TiltProjectionRuntime unavailable'); return; }
      tpr.setEnabled(enabled !== false);
    };

    // _wos.setTiltMode(mode)
    // Set tilt mode: 'disabled' | 'harbor' | 'cinematic'
    // 'harbor' is the default cinematic harbor state (pitch 28–38°).
    // 'cinematic' is reserved for deep immersion (pitch 45–60°).
    window._wos.setTiltMode = function setTiltMode(mode) {
      var tpr = window.SBE && SBE.TiltProjectionRuntime;
      if (!tpr) { console.warn('[WOS] TiltProjectionRuntime unavailable'); return; }
      tpr.setMode(mode);
      console.log('[WOS] tilt mode →', mode);
    };

    // _wos.debugTilt()
    // TiltProjectionRuntime state snapshot.
    window._wos.debugTilt = function debugTilt() {
      var tpr = window.SBE && SBE.TiltProjectionRuntime;
      if (!tpr) { console.warn('[WOS] TiltProjectionRuntime unavailable'); return; }
      var s = tpr.getState();
      console.group('[WOS] TiltProjectionRuntime — mode:' + s.mode);
      console.log('enabled:      ', s.enabled);
      console.log('currentPitch: ', s.currentPitch.toFixed(2) + '°');
      console.log('targetPitch:  ', s.targetPitch.toFixed(2) + '°');
      console.log('delta:        ', (s.targetPitch - s.currentPitch).toFixed(2) + '°');
      console.groupEnd();
      return s;
    };

    // _wos.forceMarineRender()
    // Execute a single MarineRenderer render pass immediately on the engine canvas.
    // Separates data failure / projection failure / render-loop wiring failure / styling failure.
    window._wos.forceMarineRender = function forceMarineRender() {
      var mr     = window.SBE && SBE.MarineRenderer;
      var canvas = document.getElementById('engine-canvas');
      if (!mr) { console.warn('[WOS] MarineRenderer unavailable'); return false; }
      if (!canvas) { console.warn('[WOS] engine-canvas not found'); return false; }
      var ctx = canvas.getContext('2d');
      mr.render(ctx, window._wos && window._wos.state, 1 / 60);
      console.log('[WOS] forceMarineRender — render pass executed');
      var snap = mr.getDebugSnapshot();
      console.log('  renderStateCount:', snap.renderStateCount, '  lastRenderMs:', snap.lastRenderMs);
      return true;
    };

    // _wos.debugMarineVisibility()
    // Full pipeline + geometry visibility audit.
    // Run this when boats are not visible to isolate the failure stage.
    window._wos.debugMarineVisibility = function debugMarineVisibility() {
      var ais = window.SBE && SBE.AISRuntime;
      var mr  = window.SBE && SBE.MarineRenderer;
      var mvr = window.SBE && SBE.MapboxViewportRuntime;

      var harborMode   = !!(window.SBE && SBE.runtimeFlags && SBE.runtimeFlags.harborBootstrapMode);
      var vessels      = ais ? ais.getActiveVessels() : [];
      var debugVessel  = vessels.find(function(v) { return String(v.mmsi) === '999000001'; });
      var snap         = mr ? mr.getDebugSnapshot() : {};
      var cam          = mvr && mvr.getCamera ? mvr.getCamera() : null;
      var canvas       = document.getElementById('engine-canvas');
      var cw           = canvas ? canvas.width  : null;
      var ch           = canvas ? canvas.height : null;

      // Project the debug vessel position if it exists
      var projected    = null;
      var inBounds     = null;
      if (debugVessel && mvr && mvr.project) {
        projected = mvr.project([debugVessel.lng, debugVessel.lat]);
        if (projected && cw && ch) {
          inBounds = projected.x >= 0 && projected.x <= cw &&
                     projected.y >= 0 && projected.y <= ch;
        }
      }

      console.group('[WOS] debugMarineVisibility — marine render isolation');
      console.log('harborBootstrapMode: ', harborMode);
      console.log('AIS vessel count:    ', vessels.length);
      console.log('debug vessel (999000001):', debugVessel
        ? { lat: debugVessel.lat.toFixed(5), lng: debugVessel.lng.toFixed(5), state: debugVessel.state }
        : 'NOT FOUND');
      console.log('projected screen pos:', projected
        ? { x: Math.round(projected.x), y: Math.round(projected.y) }
        : null);
      console.log('canvas size:         ', cw + ' × ' + ch);
      console.log('projected in bounds: ', inBounds);
      console.log('MR initialized:      ', snap.initialized);
      console.log('MR renderStateCount: ', snap.renderStateCount);
      console.log('MR lastRenderMs:     ', snap.msSinceRender != null ? snap.msSinceRender + 'ms ago' : 'never');
      if (cam) {
        console.log('map center:          ', cam.center);
        console.log('map zoom:            ', typeof cam.zoom   === 'number' ? cam.zoom.toFixed(2)    : cam.zoom);
        console.log('map pitch:           ', typeof cam.pitch  === 'number' ? cam.pitch.toFixed(1) + '°' : cam.pitch);
        console.log('map bearing:         ', typeof cam.bearing=== 'number' ? cam.bearing.toFixed(1)+ '°' : cam.bearing);
      } else {
        console.warn('  map camera unavailable');
      }

      // Diagnosis hints
      if (!harborMode)               console.warn('  → harborBootstrapMode is OFF — run _wos.enableHarborValidationMode()');
      if (vessels.length === 0)      console.warn('  → No vessels — run _wos.injectDebugVessel()');
      if (!debugVessel)              console.warn('  → Debug vessel not found in active bucket');
      if (inBounds === false)        console.warn('  → Vessel projected OUTSIDE canvas bounds — camera not over vessel');
      if (snap.renderStateCount === 0 && vessels.length > 0)
                                     console.warn('  → render() called but no renderState — vessels may be below alpha threshold');
      if (snap.msSinceRender === null) console.warn('  → MarineRenderer.render() has NEVER been called — check renderFrame() wiring');

      console.groupEnd();
      return {
        harborMode:       harborMode,
        vesselCount:      vessels.length,
        debugVesselFound: !!debugVessel,
        projected:        projected,
        inBounds:         inBounds,
        canvasSize:       { w: cw, h: ch },
        initialized:      snap.initialized,
        renderStateCount: snap.renderStateCount,
        msSinceRender:    snap.msSinceRender,
        camera:           cam,
      };
    };

    // _wos.enableHarborValidationMode(bool)
    // One-command cinematic harbor validation:
    //   • disables land traffic rendering
    //   • injects the debug vessel (Upper Bay → East River route)
    //   • centers to harbor framing
    //   • enables tilt HARBOR mode
    //   • enables ObservabilityCamera Mapbox drive
    //   • sets harborBootstrapMode runtime flag
    window._wos.enableHarborValidationMode = function enableHarborValidationMode(enable) {
      var on  = (enable !== false);
      var ais = window.SBE && SBE.AISRuntime;
      var tpr = window.SBE && SBE.TiltProjectionRuntime;
      var oc  = window.SBE && SBE.ObservabilityCamera;
      var mvr = window.SBE && SBE.MapboxViewportRuntime;
      var tr  = window.SBE && SBE.TrafficRenderer;

      // Toggle runtime flag
      SBE.runtimeFlags = SBE.runtimeFlags || {};
      SBE.runtimeFlags.harborBootstrapMode = on;

      if (on) {
        // Suppress land traffic
        if (tr) { tr.disable(); }

        // Inject continuously-moving debug vessel
        if (ais) { ais.injectDebugVessel(true); }

        // Harbor viewport framing
        if (mvr) {
          mvr.flyTo({
            center:  [-74.0165, 40.7015],
            zoom:    12.8,
            bearing: -12,
            pitch:   30,
            duration: 1800,
          });
        }

        // Tilt — harbor mode
        if (tpr) { tpr.setEnabled(true); tpr.setMode('harbor'); }

        // Camera drive — ObservabilityCamera steers the Mapbox viewport
        if (oc) { oc.enableMapboxDrive(true); }

        // Marine overlay canvas — dedicated rendering pipeline
        var mocr = window.SBE && SBE.MarineOverlayCanvasRuntime;
        if (mocr) { mocr.enable(true); }

        // Maritime occupancy renderer — 0523 chain harbor occupancy layer
        var mor = window.SBE && SBE.MaritimeOccupancyRenderer;
        if (mor) { mor.enable(true); }

        console.log('[WOS] Harbor Validation Mode: ENABLED');
        console.log('  land traffic: suppressed');
        console.log('  debug vessel: injected');
        console.log('  framing:      Lower Manhattan harbor');
        console.log('  tilt:         HARBOR (28–38°)');
        console.log('  camera drive: ON');
        console.log('  marine canvas: ON');
        console.log('  occupancy renderer: ON');
        console.log('  run _wos.debugMarine() or _wos.debugOccupancy() to audit pipeline');
      } else {
        // Restore land traffic
        if (tr) { tr.enable(); }

        // Remove debug vessel
        if (ais) { ais.injectDebugVessel(false); }

        // Disable tilt
        if (tpr) { tpr.setEnabled(false); }

        // Disable camera drive
        if (oc) { oc.enableMapboxDrive(false); }

        // Marine overlay canvas — shut down dedicated pipeline
        var mocr = window.SBE && SBE.MarineOverlayCanvasRuntime;
        if (mocr) { mocr.enable(false); }

        // Maritime occupancy renderer — shut down
        var mor = window.SBE && SBE.MaritimeOccupancyRenderer;
        if (mor) { mor.enable(false); }

        console.log('[WOS] Harbor Validation Mode: DISABLED');
      }

      return SBE.runtimeFlags.harborBootstrapMode;
    };

    // _wos.enableMarineDOMDebug(bool)
    // DOM-based vessel marker that bypasses the canvas pipeline entirely.
    // Projects debug vessel through MapboxViewportRuntime.project() and
    // positions an absolutely-placed div at those screen coordinates.
    //
    // If DOM marker appears → AIS + projection + Mapbox are all fine.
    //                         The problem is canvas layer/render order.
    // If DOM marker does not appear → coordinate or container mismatch.
    //
    // Parent: .canvas-area (same container that holds #mapbox-viewport + canvas)
    // z-index: 999999 — above all canvas and Mapbox layers.
    (function() {
      var _domDebugEl    = null;
      var _domDebugTimer = null;

      function _updateDOMMarker() {
        var ais = window.SBE && SBE.AISRuntime;
        var mvr = window.SBE && SBE.MapboxViewportRuntime;
        if (!ais || !mvr || !mvr.project) return;

        var vessels = ais.getActiveVessels();
        var dbgV    = vessels.find(function(v) { return String(v.mmsi) === '999000001'; });
        if (!dbgV) return;

        if (!Number.isFinite(dbgV.lng) || !Number.isFinite(dbgV.lat)) return;
        var pt = mvr.project([dbgV.lng, dbgV.lat]);
        if (!pt) return;

        // Coordinates from project() are relative to the map container element.
        // The map container is #mapbox-viewport inside .canvas-area.
        // We need to offset by the canvas-area's own bounding rect so the
        // absolute-positioned marker lands at the right screen location.
        var container = document.querySelector('.canvas-area');
        if (!container) return;
        var rect = container.getBoundingClientRect();

        // project() returns CSS-pixel coords relative to the map canvas, which
        // is the same coordinate space as the engine canvas (both fill .canvas-area).
        _domDebugEl.style.left = Math.round(pt.x) + 'px';
        _domDebugEl.style.top  = Math.round(pt.y) + 'px';

        // Update label with live position
        var label = _domDebugEl.querySelector('.marine-dom-label');
        if (label) {
          label.textContent = 'WOS-DEBUG-01\n' +
            dbgV.lat.toFixed(4) + ', ' + dbgV.lng.toFixed(4) + '\n' +
            'px(' + Math.round(pt.x) + ',' + Math.round(pt.y) + ')';
        }
      }

      window._wos.enableMarineDOMDebug = function enableMarineDOMDebug(enable) {
        if (enable === false) {
          if (_domDebugEl && _domDebugEl.parentNode) _domDebugEl.parentNode.removeChild(_domDebugEl);
          if (_domDebugTimer) { clearInterval(_domDebugTimer); _domDebugTimer = null; }
          _domDebugEl = null;
          console.log('[WOS] DOM debug marker removed');
          return;
        }

        var container = document.querySelector('.canvas-area');
        if (!container) { console.warn('[WOS] .canvas-area not found'); return; }

        // Remove existing if any
        var existing = document.getElementById('wos-marine-dom-debug');
        if (existing) existing.parentNode.removeChild(existing);

        // Create marker
        _domDebugEl = document.createElement('div');
        _domDebugEl.id = 'wos-marine-dom-debug';
        _domDebugEl.style.cssText = [
          'position:absolute',
          'width:32px',
          'height:32px',
          'border-radius:50%',
          'background:#00ffff',
          'border:3px solid white',
          'z-index:999999',
          'pointer-events:none',
          'transform:translate(-50%,-50%)',
          'box-shadow:0 0 20px #00ffff,0 0 40px rgba(0,255,255,0.5)',
          'transition:left 0.2s,top 0.2s',
        ].join(';');

        var label = document.createElement('div');
        label.className = 'marine-dom-label';
        label.style.cssText = [
          'position:absolute',
          'top:36px',
          'left:50%',
          'transform:translateX(-50%)',
          'white-space:pre',
          'text-align:center',
          'font:bold 10px monospace',
          'color:#00ffff',
          'text-shadow:0 0 4px #000,0 1px 0 #000',
          'background:rgba(0,0,0,0.6)',
          'padding:2px 5px',
          'border-radius:3px',
        ].join(';');
        label.textContent = 'WOS-DEBUG-01';
        _domDebugEl.appendChild(label);

        container.style.position = 'relative'; // ensure absolute children work
        container.appendChild(_domDebugEl);

        _updateDOMMarker();
        _domDebugTimer = setInterval(_updateDOMMarker, 250);

        console.log('[WOS] DOM debug marker enabled — watching MMSI 999000001');
        console.log('  If marker appears: canvas layer is the problem');
        console.log('  If marker absent:  projection or container mismatch');
      };
    })();

    // _wos.enableMarineCanvasDebug(bool)
    // Creates a dedicated marine overlay canvas inside .canvas-area, independent
    // of #engine-canvas. Drives MarineRenderer on its own rAF loop.
    //
    // If magenta/cyan appear on this canvas but NOT on #engine-canvas:
    //   → #engine-canvas is behind Mapbox or has a CSS layering issue.
    //   → Marine should be permanently migrated to a dedicated overlay layer.
    //
    // z-index: 999998 (below DOM debug marker at 999999, above everything else)
    (function() {
      var _marineCanvas    = null;
      var _marineCtx       = null;
      var _marineRafId     = null;
      var _marineLastMs    = 0;

      function _marineFrame(now) {
        _marineRafId = requestAnimationFrame(_marineFrame);

        var mr  = window.SBE && SBE.MarineRenderer;
        if (!mr || !_marineCtx) return;

        var container = document.querySelector('.canvas-area');
        if (!container) return;

        var dpr = window.devicePixelRatio || 1;
        var cw  = container.clientWidth;
        var ch  = container.clientHeight;

        // Resize backing buffer if container changed
        if (_marineCanvas.width  !== Math.round(cw * dpr) ||
            _marineCanvas.height !== Math.round(ch * dpr)) {
          _marineCanvas.width  = Math.round(cw * dpr);
          _marineCanvas.height = Math.round(ch * dpr);
          _marineCanvas.style.width  = cw + 'px';
          _marineCanvas.style.height = ch + 'px';
        }

        var dt = _marineLastMs ? Math.min(0.1, (now - _marineLastMs) / 1000) : 1 / 60;
        _marineLastMs = now;

        // Hard-reset context state before every frame
        _marineCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        _marineCtx.globalAlpha = 1;
        _marineCtx.globalCompositeOperation = 'source-over';
        _marineCtx.clearRect(0, 0, cw, ch);

        mr.render(_marineCtx, window._wos && window._wos.state, dt);
      }

      window._wos.enableMarineCanvasDebug = function enableMarineCanvasDebug(enable) {
        if (enable === false) {
          if (_marineRafId) { cancelAnimationFrame(_marineRafId); _marineRafId = null; }
          if (_marineCanvas && _marineCanvas.parentNode) {
            _marineCanvas.parentNode.removeChild(_marineCanvas);
          }
          _marineCanvas = null;
          _marineCtx    = null;
          _marineLastMs = 0;
          console.log('[WOS] marine canvas debug: removed');
          return;
        }

        var container = document.querySelector('.canvas-area');
        if (!container) { console.warn('[WOS] .canvas-area not found'); return; }

        // Remove any existing instance
        var existing = document.getElementById('marine-debug-canvas');
        if (existing) existing.parentNode.removeChild(existing);

        var dpr = window.devicePixelRatio || 1;
        var cw  = container.clientWidth;
        var ch  = container.clientHeight;

        _marineCanvas        = document.createElement('canvas');
        _marineCanvas.id     = 'marine-debug-canvas';
        _marineCanvas.width  = Math.round(cw * dpr);
        _marineCanvas.height = Math.round(ch * dpr);
        _marineCanvas.style.cssText = [
          'position:absolute',
          'inset:0',
          'width:100%',
          'height:100%',
          'z-index:999998',
          'pointer-events:none',
        ].join(';');

        container.style.position = 'relative';
        container.appendChild(_marineCanvas);

        _marineCtx = _marineCanvas.getContext('2d');
        _marineLastMs = 0;
        _marineRafId = requestAnimationFrame(_marineFrame);

        console.log('[WOS] marine canvas debug: enabled');
        console.log('  canvas size:', _marineCanvas.width, '×', _marineCanvas.height, '@', dpr + 'x');
        console.log('  If magenta/cyan appear here but not on #engine-canvas:');
        console.log('    → #engine-canvas has a CSS/z-index layering issue');
        console.log('    → Migrate MarineRenderer permanently to dedicated overlay');
      };
    })();

    // _wos.enableMarineOverlayCanvas(bool)
    // Direct on/off control for the permanent MarineOverlayCanvasRuntime.
    // In normal use, this is called automatically by enableHarborValidationMode().
    // Useful for manually toggling the dedicated marine canvas without changing
    // any other harbor-mode state (traffic, tilt, camera, etc.).
    window._wos.enableMarineOverlayCanvas = function enableMarineOverlayCanvas(enable) {
      var mocr = window.SBE && SBE.MarineOverlayCanvasRuntime;
      if (!mocr) { console.warn('[WOS] MarineOverlayCanvasRuntime not available'); return; }
      mocr.enable(enable !== false);
      console.log('[WOS] MarineOverlayCanvasRuntime:', mocr.isEnabled() ? 'ENABLED' : 'DISABLED');
      return mocr.isEnabled();
    };

    // _wos.debugMarineOverlayCanvas()
    // Full snapshot of MarineOverlayCanvasRuntime + quick health assessment.
    window._wos.debugMarineOverlayCanvas = function debugMarineOverlayCanvas() {
      var mocr = window.SBE && SBE.MarineOverlayCanvasRuntime;
      if (!mocr) { console.warn('[WOS] MarineOverlayCanvasRuntime not available'); return null; }

      var snap = mocr.getDebugSnapshot();
      console.group('[WOS] debugMarineOverlayCanvas');
      console.log('  enabled:          ', snap.enabled);
      console.log('  initialized:      ', snap.initialized);
      console.log('  canvasExists:     ', snap.canvasExists);
      console.log('  parentSelector:   ', snap.parentSelector);
      console.log('  parentSize:       ', snap.parentSize ? (snap.parentSize.w + ' × ' + snap.parentSize.h) : 'N/A');
      console.log('  canvasSize:       ', snap.canvasSize ? (snap.canvasSize.w + ' × ' + snap.canvasSize.h) : 'N/A');
      console.log('  dpr:              ', snap.dpr);
      console.log('  lastFrameMs:      ', snap.lastFrameMs);
      console.log('  msSinceFrame:     ', snap.msSinceFrame !== null ? snap.msSinceFrame + 'ms' : 'never');
      console.log('  vesselCount:      ', snap.vesselCount);
      console.log('  renderStateCount: ', snap.renderStateCount);

      // Health assessment
      if (!snap.enabled)      console.warn('  → RUNTIME NOT ENABLED — call _wos.enableMarineOverlayCanvas(true)');
      if (!snap.canvasExists) console.warn('  → CANVAS NOT CREATED — enable() may have failed');
      if (!snap.parentSize)   console.warn('  → PARENT CONTAINER NOT FOUND — check .canvas-area selector');
      if (snap.msSinceFrame !== null && snap.msSinceFrame > 200)
                              console.warn('  → STALE FRAME — last render was ' + snap.msSinceFrame + 'ms ago');
      if (snap.vesselCount === 0)
                              console.warn('  → NO VESSELS — run _wos.injectDebugVessel(true)');
      if (snap.enabled && snap.canvasExists && snap.msSinceFrame !== null && snap.msSinceFrame < 100)
                              console.log('  ✓ rendering live');

      console.groupEnd();
      return snap;
    };

    // _wos.setMarineDebugScale(value)
    // Adjust the visual size multiplier for harbor debug vessels.
    //   1.0 = true-to-life (default), 2.0 = double, up to 3.0
    //   0.5 = minimum (half size for dense-traffic testing)
    // Applies immediately on the next frame — no restart needed.
    window._wos.setMarineDebugScale = function setMarineDebugScale(value) {
      var mr = window.SBE && SBE.MarineRenderer;
      if (!mr) { console.warn('[WOS] MarineRenderer not available'); return; }
      mr.setMarineDebugScale(value);
      console.log('[WOS] marine debug scale set to', Math.max(0.5, Math.min(3.0, Number(value) || 1.0)));
    };

    // _wos.setMarineDebugVisible(bool)
    // Toggle cyan debug styling in harbor mode.
    //   true  (default) — cyan hull + dot + heading ray
    //   false           — hull drawn with production vessel colors (grounded hull still active)
    window._wos.setMarineDebugVisible = function setMarineDebugVisible(on) {
      var mr = window.SBE && SBE.MarineRenderer;
      if (!mr) { console.warn('[WOS] MarineRenderer not available'); return; }
      mr.setMarineDebugVisible(on !== false);
      console.log('[WOS] marine debug visible:', on !== false);
    };

    // _wos.debugTaxonomy(vesselClass?)
    // Dump compiled taxonomy profile for a vessel class (or all classes).
    // Example: _wos.debugTaxonomy('FERRY')
    window._wos.debugTaxonomy = function debugTaxonomy(vesselClass) {
      var mtp = window.SBE && SBE.MaritimeTaxonomyProfiles;
      if (!mtp) { console.warn('[WOS] MaritimeTaxonomyProfiles not available'); return; }
      var snap = mtp.getDebugSnapshot();
      if (vesselClass) {
        var profile = mtp.getTaxonomyProfile(vesselClass.toUpperCase());
        console.group('[WOS] Taxonomy: ' + (vesselClass || 'ALL'));
        console.log(profile);
        console.groupEnd();
        return profile;
      }
      console.group('[WOS] MaritimeTaxonomyProfiles');
      console.log('  version:    ', snap.version);
      console.log('  initialized:', snap.initialized);
      console.log('  classes:    ', snap.classes.join(', '));
      console.log('  vectorSize: ', snap.constants.COMPILED_VECTOR_SIZE);
      console.groupEnd();
      return snap;
    };

    // _wos.resolveVesselClass(aisTypeCode)
    // Quick AIS type code → vessel class lookup for console testing.
    window._wos.resolveVesselClass = function resolveVesselClass(aisTypeCode) {
      var mtp = window.SBE && SBE.MaritimeTaxonomyProfiles;
      if (!mtp) { console.warn('[WOS] MaritimeTaxonomyProfiles not available'); return null; }
      var vc = mtp.resolveVesselClassFromAIS(Number(aisTypeCode), null);
      console.log('[WOS] AIS', aisTypeCode, '→', vc);
      return vc;
    };

    // ── 0523B Population Hierarchy APIs ───────────────────────────────────────

    // _wos.debugPopulation()
    // Print a full snapshot of the population hierarchy — tier breakdown, zone
    // summaries, budget utilization, and score thresholds.
    window._wos.debugPopulation = function debugPopulation() {
      var mph = window.SBE && SBE.MaritimePopulationHierarchy;
      if (!mph) { console.warn('[WOS] MaritimePopulationHierarchy not available'); return null; }
      var snap = mph.getDebugSnapshot();
      console.log('[WOS] Population Hierarchy v' + mph.VERSION);
      console.log('  Total vessels registered:', snap.vesselCount);
      console.log('  Tier breakdown:',
        'HERO=' + snap.tierBreakdown.HERO,
        'MID=' + snap.tierBreakdown.MID,
        'BACKGROUND=' + snap.tierBreakdown.BACKGROUND,
        'GHOST=' + snap.tierBreakdown.GHOST
      );
      var zones = Object.keys(snap.zoneSummaries);
      zones.forEach(function (z) {
        var zs = snap.zoneSummaries[z];
        console.log('  Zone "' + z + '":', JSON.stringify(zs.counts),
          '/ budgets:', JSON.stringify(zs.budgets));
      });
      console.log('  Score thresholds:', JSON.stringify(snap.scoreThresholds));
      return snap;
    };

    // _wos.getVesselTier(vesselId)
    // Look up a vessel's current population tier record by MMSI or internal id.
    window._wos.getVesselTier = function getVesselTier(vesselId) {
      var mph = window.SBE && SBE.MaritimePopulationHierarchy;
      if (!mph) { console.warn('[WOS] MaritimePopulationHierarchy not available'); return null; }
      var id  = String(vesselId);
      var rec = mph.getVesselTier(id);
      if (!rec) { console.log('[WOS] vessel', id, 'not registered in population hierarchy'); return null; }
      console.log('[WOS] vessel', id, '→ tier:', rec.tier, '| score:', rec.score.toFixed(3),
        '| zone:', rec.zone, '| promoted:', rec.promotionExpiry > 0 ? rec.promotionReason : 'none');
      return rec;
    };

    // _wos.promoteVessel(vesselId, tier)
    // Temporarily promote a vessel to HERO or MID for PROMOTION_TTL_MS (30s).
    // Example: _wos.promoteVessel('123456789', 'HERO')
    window._wos.promoteVessel = function promoteVessel(vesselId, tier) {
      var mph = window.SBE && SBE.MaritimePopulationHierarchy;
      if (!mph) { console.warn('[WOS] MaritimePopulationHierarchy not available'); return; }
      var id = String(vesselId);
      mph.promoteVessel(id, tier, mph.PROMOTION_REASON.MANUAL);
      var rec = mph.getVesselTier(id);
      if (rec) {
        console.log('[WOS] vessel', id, 'promoted → tier:', rec.tier,
          '| expires in 30s');
      } else {
        console.warn('[WOS] vessel', id, 'not found — register it first via assignPopulationTier');
      }
    };

    // _wos.assignVesselPopulation(vesselId, vesselClass, zone?)
    // Register or re-classify a vessel in the population hierarchy.
    // Useful for testing new vessel class tier assignments from the console.
    // Example: _wos.assignVesselPopulation('999', 'FERRY', 'inner-harbor')
    window._wos.assignVesselPopulation = function assignVesselPopulation(vesselId, vesselClass, zone) {
      var mph = window.SBE && SBE.MaritimePopulationHierarchy;
      if (!mph) { console.warn('[WOS] MaritimePopulationHierarchy not available'); return; }
      var id  = String(vesselId);
      var vc  = String(vesselClass || 'UNKNOWN');
      var z   = zone ? String(zone) : 'default';
      var rec = mph.assignPopulationTier(id, vc, z, null);
      console.log('[WOS] vessel', id, 'class', vc, '→ tier:', rec.tier,
        '| score:', rec.score.toFixed(3), '| zone:', z);
      return rec;
    };

    // ── 0523C Spawn Ecology APIs ───────────────────────────────────────────────

    // _wos.debugSpawnEcology()
    // Full snapshot: enabled state, synthetic counts, per-zone ecology scores,
    // spawn interval timings, budget state, active synthetic vessels.
    window._wos.debugSpawnEcology = function debugSpawnEcology() {
      var mse = window.SBE && SBE.MaritimeSpawnEcology;
      if (!mse) { console.warn('[WOS] MaritimeSpawnEcology not available'); return null; }
      var snap = mse.getDebugSnapshot();
      console.log('[WOS] SpawnEcology v' + snap.version,
        '| enabled:', snap.enabled,
        '| harborMode:', snap.syntheticHarborMode,
        '| synthetic:', snap.globalSyntheticCount + '/' + snap.globalMaxSynthetic);
      snap.zones.forEach(function (z) {
        console.log('  zone:', z.zoneId,
          '| score:', z.ecologyScore,
          '| interval:', Math.round(z.spawnIntervalMs / 1000) + 's',
          '| nextIn:', Math.round(z.nextSpawnInMs / 1000) + 's',
          '| bounds:', z.hasBounds,
          '| synthetic ceiling:', z.syntheticCeiling);
      });
      console.log('  telemetry:', JSON.stringify(snap.telemetry));
      return snap;
    };

    // _wos.debugEcologicalZones()
    // Show zone registry status, bounds registration, and grid index size.
    window._wos.debugEcologicalZones = function debugEcologicalZones() {
      var mez = window.SBE && SBE.MaritimeEcologicalZones;
      if (!mez) { console.warn('[WOS] MaritimeEcologicalZones not available'); return null; }
      var snap = mez.getDebugSnapshot();
      console.log('[WOS] EcologicalZones v' + snap.version,
        '| zones:', snap.zoneCount,
        '| with bounds:', snap.registeredBoundsCount,
        '| grid cells:', snap.gridCellCount);
      snap.zones.forEach(function (z) {
        console.log(' ', z.hasBounds ? '✓' : '○', z.zoneId,
          '(' + z.zoneType + ')',
          '| target:', z.densityRange.target,
          '| max:', z.densityRange.max,
          '| synthCeil:', z.syntheticCeiling);
      });
      return snap;
    };

    // _wos.registerZoneBounds(zoneId, bounds)
    // Register geographic bounds for an ecological zone so coordinate lookup works.
    // bounds: { minLat, maxLat, minLng, maxLng }  — OR  { lat, lng, radiusDeg }
    // Example: _wos.registerZoneBounds('ferry_transit_corridor_primary',
    //            { lat: 40.645, lng: -74.015, radiusDeg: 0.05 })
    window._wos.registerZoneBounds = function registerZoneBounds(zoneId, bounds) {
      var mez = window.SBE && SBE.MaritimeEcologicalZones;
      if (!mez) { console.warn('[WOS] MaritimeEcologicalZones not available'); return false; }
      var ok = mez.registerZoneBounds(zoneId, bounds);
      if (ok) console.log('[WOS] zone bounds registered:', zoneId, JSON.stringify(bounds));
      return ok;
    };

    // _wos.enableSyntheticHarborMode(bool)
    // Enable/disable SYNTHETIC_HARBOR_MODE — AIS-independent synthetic presence.
    // Must not be used in live AIS sessions. For development/replay/demo only.
    window._wos.enableSyntheticHarborMode = function enableSyntheticHarborMode(on) {
      var mse = window.SBE && SBE.MaritimeSpawnEcology;
      if (!mse) { console.warn('[WOS] MaritimeSpawnEcology not available'); return; }
      mse.enableSyntheticHarborMode(on !== false);
    };

    // _wos.enableSpawnEcology(bool)
    // Master switch for spawn ecology. Disabled by default — must be explicitly enabled.
    window._wos.enableSpawnEcology = function enableSpawnEcology(on) {
      var mse = window.SBE && SBE.MaritimeSpawnEcology;
      if (!mse) { console.warn('[WOS] MaritimeSpawnEcology not available'); return; }
      mse.enable(on !== false);
      console.log('[WOS] SpawnEcology enabled:', mse.isEnabled());
    };

    // _wos.getSpawnCandidates(zoneId, count?)
    // Manually request spawn candidates for a zone. Uses current simulation time.
    // Returns candidate request objects — does not instantiate vessels.
    // Example: _wos.getSpawnCandidates('ferry_transit_corridor_primary', 3)
    window._wos.getSpawnCandidates = function getSpawnCandidates(zoneId, count) {
      var mse = window.SBE && SBE.MaritimeSpawnEcology;
      if (!mse) { console.warn('[WOS] MaritimeSpawnEcology not available'); return []; }
      var ctx = {
        simulationTimeMs:     performance.now(),
        weatherState:         null,
        liveAISCountInZone:   0,
        syntheticCountInZone: 0,
        ecologySilenceActive: false,
      };
      var candidates = mse.getSpawnCandidates(String(zoneId), Number(count) || 1, ctx);
      console.log('[WOS] spawn candidates for', zoneId, ':', candidates.length);
      candidates.forEach(function (c) {
        console.log('  ', c.syntheticId, '| class:', c.vesselClass,
          '| pos:', c.initialPosition.lat.toFixed(5), c.initialPosition.lng.toFixed(5),
          '| hdg:', c.initialHeadingDeg + '°',
          '| spd:', c.initialSpeedKts + 'kts',
          '| lifetime:', Math.round(c.requestedLifetimeMs / 60000) + 'min',
          '| reason:', c.spawnReason);
      });
      return candidates;
    };

    // _wos.debugTemporalEcology(simulationTimeMs?)
    // Show current time window, affinities, and per-zone time multipliers.
    window._wos.debugTemporalEcology = function debugTemporalEcology(simulationTimeMs) {
      var mte = window.SBE && SBE.MaritimeTemporalEcology;
      if (!mte) { console.warn('[WOS] MaritimeTemporalEcology not available'); return null; }
      var t    = simulationTimeMs != null ? Number(simulationTimeMs) : performance.now();
      var snap = mte.getDebugSnapshot(t);
      console.log('[WOS] TemporalEcology | hour:', snap.simulationHour,
        '| window:', snap.activeWindow);
      var mez  = window.SBE && SBE.MaritimeEcologicalZones;
      var zones = mez ? mez.getAllZones() : [];
      zones.forEach(function (z) {
        var aff = mte.getTimeWindowAffinity(z.zoneType, t);
        console.log('  ', z.zoneId.split('_').slice(0, 3).join('_'),
          '| timeAffinity:', aff.toFixed(3));
      });
      return snap;
    };

    // ── 0523D Wake Authority APIs ──────────────────────────────────────────────

    // _wos.debugWake()
    // Full WakeRegistry snapshot: segment counts, budget pressure, telemetry,
    // top vessels by segment count, per-zone counts.
    window._wos.debugWake = function debugWake() {
      var wa = window.SBE && SBE.WakeAuthority;
      if (!wa) { console.warn('[WOS] WakeAuthority not available'); return null; }
      var snap = wa.getDebugSnapshot();
      console.log('[WOS] WakeAuthority v' + snap.version,
        '| active:', snap.activeSegments + '/' + snap.budgets.globalMax,
        '| synthetic:', snap.syntheticSegments,
        '| pressure:', (snap.budgets.globalPressure * 100).toFixed(1) + '%');
      if (snap.topVessels.length) {
        console.log('  top vessels by wake count:');
        snap.topVessels.forEach(function (v) {
          console.log('   ', v.vesselId, '→', v.count, 'segments');
        });
      }
      if (Object.keys(snap.zoneCounts).length) {
        console.log('  zone counts:', JSON.stringify(snap.zoneCounts));
      }
      console.log('  telemetry:', JSON.stringify(snap.telemetry));
      return snap;
    };

    // _wos.testWakeEmission(vesselId, vesselClass, tier, lat, lng, speedKts)
    // Manually fire one wake emission for testing. Uses performance.now() as sim time.
    // Does NOT integrate with AISRuntime — purely for console validation.
    // Example: _wos.testWakeEmission('123456789', 'FERRY', 'HERO', 40.644, -74.017, 12)
    window._wos.testWakeEmission = function testWakeEmission(vesselId, vesselClass, tier, lat, lng, speedKts) {
      var wa = window.SBE && SBE.WakeAuthority;
      if (!wa) { console.warn('[WOS] WakeAuthority not available'); return null; }
      var id   = String(vesselId);
      var vc   = String(vesselClass  || 'FERRY');
      var t    = String(tier         || 'MID');
      var spd  = Number(speedKts)    || 8;
      var simMs = performance.now();

      var emitter = wa.resolveWakeEligibility(id, vc, t, spd, 'AIS_VESSEL');
      console.log('[WOS] emitter state:', JSON.stringify(emitter));

      if (!emitter.eligible) {
        console.warn('[WOS] vessel not eligible for wake emission');
        return null;
      }

      var vessel = {
        vesselId:              id,
        lat:                   Number(lat)  || 40.644,
        lng:                   Number(lng)  || -74.017,
        trueHeading:           90,
        speedKts:              spd,
        vesselClass:           vc,
        continuityConfidence:  1.0,
        zoneId:                null,
      };

      var seg = wa.emitWakeSegment(emitter, vessel, null, simMs);
      if (seg) {
        console.log('[WOS] wake segment emitted:', seg.wakeId,
          '| intensity:', seg.intensityRaw.toFixed(3),
          '| width:', seg.widthMeters.toFixed(1) + 'm',
          '| turbulence:', seg.turbulenceRaw.toFixed(3),
          '| expires in:', Math.round((seg.expiresAtMs - simMs) / 60000) + 'min');
      } else {
        console.log('[WOS] wake emission suppressed (budget/interval/distance gate)');
      }
      return seg;
    };

    // _wos.getVesselWake(vesselId)
    // Return all active wake segments for a vessel.
    window._wos.getVesselWake = function getVesselWake(vesselId) {
      var wa = window.SBE && SBE.WakeAuthority;
      if (!wa) { console.warn('[WOS] WakeAuthority not available'); return []; }
      var segs = wa.getWakeSegmentsForVessel(String(vesselId));
      console.log('[WOS] vessel', vesselId, '—', segs.length, 'wake segments');
      segs.forEach(function (s) {
        console.log('  ', s.wakeId,
          '| tier:', s.populationTierAtEmission,
          '| intensity:', s.intensityRaw.toFixed(3),
          '| evicted:', s.parentEvicted,
          '| start:', s.start.lat.toFixed(5), s.start.lng.toFixed(5),
          '→ end:', s.end.lat.toFixed(5), s.end.lng.toFixed(5));
      });
      return segs;
    };

    // _wos.decayWake()
    // Manually trigger a wake decay sweep using current performance.now() as sim time.
    // In production this is driven by the continuity engine on its tick.
    window._wos.decayWake = function decayWake() {
      var wa = window.SBE && SBE.WakeAuthority;
      if (!wa) { console.warn('[WOS] WakeAuthority not available'); return null; }
      var result = wa.decayWakeSegments(performance.now());
      console.log('[WOS] wake decay —',
        'decayed:', result.decayedCount,
        '| remaining:', result.remainingSegments,
        '| pressure:', result.budgetPressureActive);
      return result;
    };

    // _wos.resolveWakeClass(vesselClass)
    // Taxonomy-side bridge: maps a vessel class string to WakeAuthority's
    // 4-value wake class enum (NONE/MINIMAL/STANDARD/HEAVY).
    // Resolves ISSUE-0523A-001.
    // Example: _wos.resolveWakeClass('CARGO') → 'STANDARD'
    window._wos.resolveWakeClass = function resolveWakeClass(vesselClass) {
      var mtp = SBE.MaritimeTaxonomyProfiles;
      if (!mtp || !mtp.resolveWakeAuthorityClass) {
        console.warn('[WOS] MaritimeTaxonomyProfiles not available');
        return null;
      }
      var result = mtp.resolveWakeAuthorityClass(vesselClass);
      console.log('[WOS] resolveWakeClass(' + vesselClass + ') →', result);
      return result;
    };

    // ── 0523E Atmospheric Readability APIs ────────────────────────────────────

    // _wos.debugAtmosphere()
    // Returns AtmosphericReadability telemetry snapshot.
    window._wos.debugAtmosphere = function debugAtmosphere() {
      var ar = SBE.MaritimeAtmosphericReadability;
      if (!ar) { console.warn('[WOS] MaritimeAtmosphericReadability not available'); return null; }
      var snap = ar.getDebugSnapshot();
      console.log('[WOS] atmosphere snapshot —',
        'vessels:', snap.evaluatedVessels,
        '| wakes:', snap.evaluatedWakes,
        '| hidden:', snap.hiddenByAtmosphere,
        '| silhouette:', snap.silhouetteCount,
        '| lightOnly:', snap.lightOnlyCount,
        '| labelSuppressed:', snap.labelSuppressed,
        '| avgScore:', snap.averageReadabilityScore.toFixed(3));
      return snap;
    };

    // _wos.testVesselReadability(vesselId, vesselClass, tier, distM, weather, timeOfDay, provenance?)
    // Manual readability probe. Defaults: provenance='AIS_VESSEL', clutterPressure=0.2
    // Example: _wos.testVesselReadability('123', 'FERRY', 'HERO', 800, 'FOG', 'NIGHT')
    window._wos.testVesselReadability = function testVesselReadability(
      vesselId, vesselClass, tier, distM, weather, timeOfDay, provenance
    ) {
      var ar = SBE.MaritimeAtmosphericReadability;
      if (!ar) { console.warn('[WOS] MaritimeAtmosphericReadability not available'); return null; }
      var mtp = SBE.MaritimeTaxonomyProfiles;
      var taxResistance = 0.5, taxProjection = 0.5, taxLabel = 0.5;
      if (mtp) {
        var prof = mtp.getTaxonomyProfile(vesselClass);
        if (prof && prof.vec) {
          taxResistance = prof.vec[mtp.F.ATMOSPHERIC_RESISTANCE] || 0.5;
          taxProjection = prof.vec[mtp.F.PROJECTION_WEIGHT]      || 0.5;
          taxLabel      = prof.vec[mtp.F.LABEL_PRIORITY]         || 0.5;
        }
      }
      var input = {
        vesselId:                    vesselId || 'test-vessel',
        vesselClass:                 vesselClass || 'CARGO',
        provenance:                  provenance || 'AIS_VESSEL',
        populationTier:              tier || 'MID',
        distanceMeters:              distM != null ? distM : 1000,
        taxonomyAtmosphericResistance: taxResistance,
        taxonomyProjectionWeight:    taxProjection,
        taxonomyLabelPriority:       taxLabel,
        updateAdvisory:              'UPDATE_STANDARD',
      };
      var context = {
        simulationTimeMs: 0,
        timeOfDay:        timeOfDay  || 'MIDDAY',
        weatherState:     weather    || 'CLEAR',
        visibilityMeters: null,
        viewportScale:    1.0,
        cameraDistanceMeters: null,
        clutterPressure:  0.2,
      };
      var result = ar.resolveVesselReadability(input, context);
      console.log('[WOS] vessel readability —',
        vesselClass, tier, weather, timeOfDay, distM + 'm',
        '| class:', result.visibilityClass,
        '| score:', result.readabilityScore.toFixed(3),
        '| label:', result.labelReadable,
        '| reasons:', result.reasonCodes.join(',') || 'none');
      return result;
    };

    // _wos.testWakeReadability(wakeId, provenance, intensityRaw, ageRatio, weather, timeOfDay)
    // Example: _wos.testWakeReadability('wake::123::1000', 'AIS_VESSEL', 0.8, 0.3, 'FOG', 'DUSK')
    window._wos.testWakeReadability = function testWakeReadability(
      wakeId, provenance, intensityRaw, ageRatio, weather, timeOfDay
    ) {
      var ar = SBE.MaritimeAtmosphericReadability;
      if (!ar) { console.warn('[WOS] MaritimeAtmosphericReadability not available'); return null; }
      var input = {
        wakeId:                  wakeId      || 'wake::test::0',
        vesselId:                'test-vessel',
        provenance:              provenance  || 'AIS_VESSEL',
        intensityRaw:            intensityRaw != null ? intensityRaw : 0.8,
        turbulenceRaw:           0.4,
        ageRatio:                ageRatio    != null ? ageRatio : 0.0,
        populationTierAtEmission:'MID',
      };
      var context = {
        simulationTimeMs: 0,
        timeOfDay:        timeOfDay || 'MIDDAY',
        weatherState:     weather  || 'CLEAR',
        visibilityMeters: null,
        viewportScale:    1.0,
        cameraDistanceMeters: null,
        clutterPressure:  0.2,
      };
      var result = ar.resolveWakeReadability(input, context);
      console.log('[WOS] wake readability —',
        wakeId, weather, timeOfDay,
        '| class:', result.visibilityClass,
        '| score:', result.readabilityScore.toFixed(3),
        '| wakeReadable:', result.wakeReadable,
        '| reasons:', result.reasonCodes.join(',') || 'none');
      return result;
    };

    // ── 0523G Occupancy Renderer APIs ─────────────────────────────────────────

    // _wos.debugOccupancy()
    // Full debug snapshot: renderer state, frame telemetry, system availability.
    window._wos.debugOccupancy = function debugOccupancy() {
      var mor = SBE.MaritimeOccupancyRenderer;
      if (!mor) { console.warn('[WOS] MaritimeOccupancyRenderer not available'); return null; }
      var snap = mor.getDebugSnapshot();
      var tel  = snap.telemetry || {};
      console.group('[WOS] MaritimeOccupancyRenderer v' + snap.version);
      console.log('  enabled:', snap.enabled, '| ready:', mor.isReady());
      console.log('  frames rendered:', tel.framesRendered);
      console.log('  AIS vessels:    ', tel.aisRendered, '| synthetic:', tel.syntheticRendered);
      console.log('  wakes:          ', tel.wakesRendered, '| labels:', tel.labelsRendered);
      console.log('  atmo hidden:    ', tel.atmosphericHidden);
      console.group('Dependencies');
      console.log('  AISRuntime:                   ', !!(SBE.AISRuntime));
      console.log('  MaritimePopulationHierarchy:  ', !!(SBE.MaritimePopulationHierarchy));
      console.log('  MaritimeSpawnEcology:         ', !!(SBE.MaritimeSpawnEcology));
      console.log('  WakeAuthority:                ', !!(SBE.WakeAuthority));
      console.log('  MaritimeAtmosphericReadability:', !!(SBE.MaritimeAtmosphericReadability));
      console.log('  MaritimeTaxonomyProfiles:     ', !!(SBE.MaritimeTaxonomyProfiles));
      console.log('  MapboxViewportRuntime:        ', !!(SBE.MapboxViewportRuntime));
      console.groupEnd();
      console.groupEnd();
      return snap;
    };

    // _wos.enableOccupancyRenderer(bool)
    // Toggle occupancy renderer on/off without full harbor mode toggle.
    window._wos.enableOccupancyRenderer = function enableOccupancyRenderer(on) {
      var mor = SBE.MaritimeOccupancyRenderer;
      if (!mor) { console.warn('[WOS] MaritimeOccupancyRenderer not available'); return; }
      mor.enable(on !== false);
      console.log('[WOS] MaritimeOccupancyRenderer:', mor.isEnabled() ? 'ENABLED' : 'DISABLED');
    };

    // _wos.seedWaterCorridors()
    // Inject 35 deterministic seed vessels placed on verified navigable water,
    // organized into 8 named harbor corridors (Upper Bay, SI Ferry, East River,
    // Hudson, Kill Van Kull, Verrazzano, Red Hook/BCT, Lower Bay Anchorage).
    // Renderer-local only — does NOT enter AISRuntime or any authority system.
    window._wos.seedWaterCorridors = function seedWaterCorridors() {
      var mor = SBE.MaritimeOccupancyRenderer;
      if (!mor || !mor.seedWaterCorridors) { console.warn('[WOS] MaritimeOccupancyRenderer.seedWaterCorridors not available'); return; }
      var count = mor.seedWaterCorridors();
      console.log('[WOS] seedWaterCorridors — ' + count + ' vessels in water lanes active | call _wos.clearSeedVessels() to remove');
    };

    // _wos.seedDenseHarbor()
    // Legacy alias for seedWaterCorridors().
    window._wos.seedDenseHarbor = function seedDenseHarbor() {
      var mor = SBE.MaritimeOccupancyRenderer;
      if (!mor || !mor.seedWaterCorridors) { console.warn('[WOS] MaritimeOccupancyRenderer.seedWaterCorridors not available'); return; }
      var count = mor.seedWaterCorridors();
      console.log('[WOS] seedDenseHarbor (→ seedWaterCorridors) — ' + count + ' seed vessels active | call _wos.clearSeedVessels() to remove');
    };

    // _wos.clearSeedVessels()
    // Remove all renderer-local seed vessels injected by seedDenseHarbor().
    // Visual-only — does not affect AISRuntime-backed validation vessels.
    window._wos.clearSeedVessels = function clearSeedVessels() {
      var mor = SBE.MaritimeOccupancyRenderer;
      if (!mor || !mor.clearSeedVessels) { console.warn('[WOS] MaritimeOccupancyRenderer.clearSeedVessels not available'); return; }
      mor.clearSeedVessels();
    };

    // _wos.enableMaritimeValidationFeed(bool)
    // Start or stop the AIS-backed maritime validation feed (0523H).
    // When enabled, 35 deterministic vessels are injected through AISRuntime.ingestPacket()
    // at 1Hz — the same path live AIS data will use. Does not require seedWaterCorridors().
    //   _wos.enableMaritimeValidationFeed(true)   → start feed
    //   _wos.enableMaritimeValidationFeed(false)  → stop feed (vessels remain in AISRuntime until dormant)
    window._wos.enableMaritimeValidationFeed = function enableMaritimeValidationFeed(on) {
      var mvf = SBE.MaritimeValidationFeed;
      if (!mvf) { console.warn('[WOS] MaritimeValidationFeed not available'); return; }
      mvf.enable(on !== false);
      SBE.runtimeFlags = SBE.runtimeFlags || {};
      SBE.runtimeFlags.enableMaritimeValidationFeed = mvf && on !== false;
      console.log('[WOS] MaritimeValidationFeed:', (on !== false) ? 'ENABLED' : 'DISABLED',
        '— call _wos.debugAIS() to inspect active vessels');
    };

    // _wos.resetMaritimeValidationFeed()
    // Stop the feed, clear telemetry counters, and reset DR state.
    // AISRuntime-backed vessels will naturally age to STALE → dormant after ~5 min silence.
    window._wos.resetMaritimeValidationFeed = function resetMaritimeValidationFeed() {
      var mvf = SBE.MaritimeValidationFeed;
      if (!mvf) { console.warn('[WOS] MaritimeValidationFeed not available'); return; }
      mvf.reset();
    };

    // _wos.debugMaritimeValidationFeed()
    // Print feed status: enabled state, ticks emitted, packets injected, active vessels in AISRuntime.
    window._wos.debugMaritimeValidationFeed = function debugMaritimeValidationFeed() {
      var mvf = SBE.MaritimeValidationFeed;
      if (!mvf) { console.warn('[WOS] MaritimeValidationFeed not available'); return null; }
      return mvf.debug();
    };

    // _wos.debugBoatSpriteRenderer()
    // Returns frame-level sprite LOD, draw counts, hover state.
    // Wired directly in MaritimeOccupancyRenderer.init() — this stub ensures the
    // helper is callable even if the renderer initialises after main.js runs.
    window._wos.debugBoatSpriteRenderer = window._wos.debugBoatSpriteRenderer || function debugBoatSpriteRenderer() {
      var mor = SBE.MaritimeOccupancyRenderer;
      if (!mor || !mor.debugBoatSpriteRenderer) {
        console.warn('[WOS] MaritimeOccupancyRenderer.debugBoatSpriteRenderer not available');
        return null;
      }
      return mor.debugBoatSpriteRenderer();
    };

    // _wos.debugMaritimeRuntimePath()
    // Full pipeline diagnostic: ValidationFeed → AISRuntime bucket → Renderer frame.
    // Identifies which layer the vessels are lost in.
    //   validationFeedEnabled   — is the feed active?
    //   aisRuntimeActiveCount   — how many vessels in AISRuntime bucket?
    //   validationMMSIsActive   — how many are validation MMSIs?
    //   rendererAISCount        — how many did the renderer draw last frame?
    //   firstValidationVessel   — sample vessel with class, state, position
    window._wos.debugMaritimeRuntimePath = function debugMaritimeRuntimePath() {
      var mor = SBE.MaritimeOccupancyRenderer;
      if (!mor || !mor.debugMaritimeRuntimePath) {
        console.warn('[WOS] MaritimeOccupancyRenderer.debugMaritimeRuntimePath not available');
        return null;
      }
      return mor.debugMaritimeRuntimePath();
    };

    // _wos.setBootHarborMode(bool)
    // Quick escape hatch: toggle harbor isolation without a full restart.
    //   _wos.setBootHarborMode(false) → show route/cars again (normal mode)
    //   _wos.setBootHarborMode(true)  → hide route/cars, marine only
    window._wos.setBootHarborMode = function setBootHarborMode(enabled) {
      SBE.runtimeFlags = SBE.runtimeFlags || {};
      SBE.runtimeFlags.harborBootstrapMode = (enabled !== false);
      var tr = window.SBE && SBE.TrafficRenderer;
      if (tr) {
        if (SBE.runtimeFlags.harborBootstrapMode && tr.disable) tr.disable();
        else if (!SBE.runtimeFlags.harborBootstrapMode && tr.enable) tr.enable();
      }
      console.log('[WOS] harborBootstrapMode:', SBE.runtimeFlags.harborBootstrapMode);
      renderFrame();
      return SBE.runtimeFlags.harborBootstrapMode;
    };

    // _wos.enableLandTraffic(bool)
    // Enables or disables land traffic (TrafficRenderer + TrafficFlowRuntime).
    // Cars are off by default in maritime runtime (landTrafficEnabled=false).
    //   _wos.enableLandTraffic(true)  → cars appear immediately
    //   _wos.enableLandTraffic(false) → cars removed immediately
    window._wos.enableLandTraffic = function enableLandTraffic(on) {
      on = (on !== false);
      SBE.runtimeFlags = SBE.runtimeFlags || {};
      SBE.runtimeFlags.landTrafficEnabled = on;
      var tr  = window.SBE && SBE.TrafficRenderer;
      var tfr = window.SBE && SBE.TrafficFlowRuntime;
      if (on) {
        if (tfr && tfr.init && !tfr._initialized) tfr.init();
        if (tr)  { if (tr.init && !tr._initialized) tr.init(); tr.enable(); }
        // Update UI checkbox if present
        var el = document.getElementById('land-traffic-enabled');
        if (el) el.checked = true;
        console.log('[WOS] Land traffic: ENABLED');
      } else {
        if (tr && tr.disable) tr.disable();
        var el2 = document.getElementById('land-traffic-enabled');
        if (el2) el2.checked = false;
        console.log('[WOS] Land traffic: DISABLED');
      }
      return on;
    };

    // ── Harbor boot auto-run ───────────────────────────────────────────────
    // 0523K: Maritime now auto-starts as a first-class subsystem (see
    // _maritimeAutoStart() in the init sequence above). Harbor Validation Mode
    // is retained as a developer debug harness only — it applies camera framing,
    // tilt, traffic suppression, and debug vessel injection on top of normal
    // maritime operation. Not run by default in 'normal' boot mode.
    if (BOOT_HARBOR_VALIDATION) {
      window._wos.enableHarborValidationMode(true);
    }

    // ── Grid debug helpers ─────────────────────────────────────────────────
    window._wos.debugRuntimeState = function debugRuntimeState() {
      var ws  = window.SBE && SBE.Workspace;
      var rvr = window.SBE && SBE.RuntimeViewportRouter;
      var surf = ws ? ws.getActiveSurface() : null;
      var rt   = surf && surf.runtime;
      var allSurfs = ws ? ws.getAllSurfaces() : [];
      var routeCount = 0;
      if (rt && Array.isArray(rt.routes)) routeCount = rt.routes.length;
      else if (rt && typeof rt.getRoutes === "function") routeCount = rt.getRoutes().length;
      var out = {
        activeSurface:   surf ? { id: surf.id, name: surf.name, type: surf.type } : null,
        activeRuntime:   rt   ? { name: rt.name || rt.type || "?", active: rt.active } : null,
        viewportMode:    rvr  ? rvr.getMode() : "—",
        projection:      surf && surf.anchor ? surf.anchor.type : "free",
        geoMode:         !!(surf && (surf.type === "route" || surf.type === "world")),
        activeRouteCount: routeCount,
        surfaceCount:    allSurfs.length,
        surfaces:        allSurfs.map(function(s) {
          return { id: s.id, name: s.name, type: s.type, hasRuntime: !!s.runtime };
        }),
      };
      console.table ? console.table(out) : console.log("[_wos.debugRuntimeState]", out);
      return out;
    };

    window._wos.debugRegistry = function debugRegistry() {
      return window.SBE && window.SBE.Registry ? window.SBE.Registry : null;
    };
    window._wos.listRegistryStatus = function listRegistryStatus() {
      var registry = window.SBE && window.SBE.Registry;
      if (!registry) return null;
      var output = {};
      Object.keys(registry).forEach(function (key) {
        if (key === "statuses" || key === "validate") return;
        var group = registry[key];
        if (!group || typeof group !== "object") return;
        output[key] = Object.keys(group).map(function (id) {
          var item = group[id];
          return {
            id: item.id,
            label: item.label,
            status: item.status,
            visibleIn: item.visibleIn || [],
          };
        });
      });
      return output;
    };
    window._wos.validateRegistry = function validateRegistry() {
      var registry = window.SBE && window.SBE.Registry;
      if (!registry || !registry.validate) return null;
      return registry.validate();
    };

    window._wos.debugSchemas = function debugSchemas() {
      return window.SBE && window.SBE.Schemas ? window.SBE.Schemas : null;
    };

    window._wos.validateSchemas = function validateSchemas() {
      var schemas = window.SBE && window.SBE.Schemas;
      var registry = window.SBE && window.SBE.Registry;
      var errors = [];
      var warnings = [];

      if (!schemas) {
        errors.push("SBE.Schemas is missing");
        return { errors: errors, warnings: warnings };
      }

      function checkField(schemaName, fieldName, descriptor) {
        if (!descriptor || typeof descriptor !== "object") {
          errors.push(
            schemaName + "." + fieldName + " is not a field descriptor",
          );
          return;
        }

        if (typeof descriptor.persistent !== "boolean") {
          warnings.push(
            schemaName + "." + fieldName + " missing persistent boolean",
          );
        }

        if (typeof descriptor.runtime !== "boolean") {
          warnings.push(
            schemaName + "." + fieldName + " missing runtime boolean",
          );
        }

        if (descriptor.persistent === true && descriptor.runtime === true) {
          errors.push(
            schemaName +
              "." +
              fieldName +
              " cannot be both persistent and runtime",
          );
        }
      }

      function walkSchema(schemaName, schema) {
        if (!schema || typeof schema !== "object") {
          errors.push(schemaName + " is not an object");
          return;
        }

        Object.keys(schema).forEach(function (key) {
          var value = schema[key];

          if (
            value &&
            typeof value === "object" &&
            Object.prototype.hasOwnProperty.call(value, "default")
          ) {
            checkField(schemaName, key, value);
            return;
          }

          if (value && typeof value === "object") {
            walkSchema(schemaName + "." + key, value);
          }
        });
      }

      Object.keys(schemas).forEach(function (schemaName) {
        walkSchema(schemaName, schemas[schemaName]);
      });

      if (
        registry &&
        registry.statuses &&
        schemas.Layer &&
        schemas.Layer.status
      ) {
        var defaultStatus = schemas.Layer.status.default;
        if (!registry.statuses[defaultStatus]) {
          errors.push(
            "Layer.status default is not a registered status: " + defaultStatus,
          );
        }
      }

      return { errors: errors, warnings: warnings };
    };

    window._wos.debugGridLayers = function () {
      return (state.world.layers || []).filter(function (l) {
        return l.type === "grid";
      });
    };
    window._wos.debugGridBlocks = function (layerId) {
      var layer = (state.world.layers || []).find(function (l) {
        return l.id === layerId;
      });
      return layer ? layer.blocks : [];
    };
    // Legacy helpers — still available for DevTools use
    window._wos.addBankToGridLayer = function (cartridgeId, options) {
      var cid = cartridgeId || state.activeMidiBankId;
      if (!cid) {
        console.warn("[WOS GRID] No active MIDI bank");
        return null;
      }
      var layer = addBankToGridLayer(cid, options);
      if (layer) renderFrame();
      return layer;
    };
    window._wos.regenerateFirstGridLayer = function () {
      var layer = (state.world.layers || []).find(function (l) {
        return l.type === "grid";
      });
      if (!layer) {
        console.warn("[WOS GRID] No grid layer found");
        return null;
      }
      var result = regenerateGridLayer(layer.id);
      if (result) renderFrame();
      return result;
    };
    window._wos.regenerateGridLayer = function (layerId, overrides) {
      var result = regenerateGridLayer(layerId, overrides);
      if (result) renderFrame();
      return result;
    };
    // Canonical Bauhaus path
    window._wos.generateBauhausGrid = function (bankId) {
      var layer = generateBauhausGrid(bankId);
      if (layer) renderFrame();
      return layer;
    };
    window._wos.clearGridLayers = function () {
      var removed = clearGridLayers();
      renderFrame();
      return removed;
    };
    window._wos.debugGridStats = function () {
      return (state.world.layers || [])
        .filter(function (l) {
          return l.type === "grid";
        })
        .map(function (layer) {
          var g = layer.grid;
          var blocks = layer.blocks || [];
          var sourceRef =
            layer.source && (layer.source.cartridgeId || layer.source.bankId);
          var resolved = resolveMidiBankAndCartridge(sourceRef);
          var sourceNotes =
            resolved.cartridge && resolved.cartridge.notes
              ? resolved.cartridge.notes.length
              : 0;
          var playbackEvents = getMidiPlaybackEventsForResolvedSource(
            resolved.bank,
            resolved.cartridge,
          ).length;

          var vp = layer.renderer && layer.renderer.viewport;
          var vpEnabled = !!(vp && vp.enabled && vp.mode !== "full");
          var mp = state.midiPlayback;
          var phIdx = mp ? mp.playheadEventIndex : null;
          var phId = mp ? mp.playheadEventId : null;
          var phBlock =
            phIdx != null || phId != null
              ? blocks.find(function (b) {
                  return (
                    (phIdx != null && b.sourceIndex === phIdx) ||
                    (phId != null && b.sourceEventId === phId)
                  );
                })
              : null;
          var vpCols = vp ? vp.cols || 7 : null;
          var vpRows = vp ? vp.rows || 11 : null;
          var vpSC = vp ? vp.startCol || 0 : null;
          var vpSR = vp ? vp.startRow || 0 : null;
          var visibleBlocks = blocks.length;
          if (vpEnabled && g) {
            visibleBlocks = blocks.filter(function (b) {
              return (
                b.col >= vpSC &&
                b.col < vpSC + vpCols &&
                b.row >= vpSR &&
                b.row < vpSR + vpRows
              );
            }).length;
          }

          return {
            layerId: layer.id,
            label: layer.label || layer.name,
            rendererId: layer.renderer ? layer.renderer.id : null,
            paletteId: layer.renderer ? layer.renderer.paletteId : null,
            finishId: layer.renderer ? layer.renderer.finishId : null,
            visualLanguage: g ? g.visualLanguage : null,
            visualVersion: g ? g.visualVersion : null,
            sourceBankId: resolved.bankId,
            sourceCartridgeId: resolved.cartridgeId,
            sourceNotes: sourceNotes,
            playbackEvents: playbackEvents,
            totalBlocks: blocks.length,
            gridBlocks: blocks.length,
            visibleBlocks: visibleBlocks,
            activeBlocks: blocks.filter(function (b) {
              return b.active;
            }).length,
            viewportEnabled: vpEnabled,
            viewportMode: vp ? vp.mode || "full" : "full",
            viewportFollowPlayback: vp ? !!vp.followPlayback : false,
            followTarget: vp ? vp.followTarget || "timeline" : null,
            followSmoothing:
              vp && vp.followSmoothing != null ? vp.followSmoothing : 0.08,
            followTargetUpdateMs:
              vp && vp.followTargetUpdateMs != null
                ? vp.followTargetUpdateMs
                : 120,
            timelineProgress: vp
              ? vp._timelineProgress != null
                ? vp._timelineProgress
                : null
              : null,
            timelineIndex: vp
              ? vp._timelineIndex != null
                ? vp._timelineIndex
                : null
              : null,
            targetStartCol: vp
              ? vp.targetStartCol != null
                ? vp.targetStartCol
                : null
              : null,
            targetStartRow: vp
              ? vp.targetStartRow != null
                ? vp.targetStartRow
                : null
              : null,
            smoothStartCol: vp
              ? vp._smoothCol != null
                ? vp._smoothCol
                : null
              : null,
            smoothStartRow: vp
              ? vp._smoothRow != null
                ? vp._smoothRow
                : null
              : null,
            viewportCols: vpCols,
            viewportRows: vpRows,
            viewportStartCol: vpSC,
            viewportStartRow: vpSR,
            playheadEventIndex: phIdx,
            playheadBlockCol: phBlock ? phBlock.col : null,
            playheadBlockRow: phBlock ? phBlock.row : null,
            columns: g ? g.columns : null,
            rows: g ? g.rows : null,
            cellSize: g ? g.cellSize : null,
            gap: g ? g.gap : null,
            fitMode: g ? g.fitMode : null,
            placementMode: g ? g.placementMode : null,
            countMatch: blocks.length === sourceNotes,
            patternVocabularyVersion: (function () {
              var GS = getGridSystem();
              return GS ? GS.BAUHAUS_PATTERN_VOCABULARY_VERSION : null;
            })(),
            patternCount: (function () {
              var GS = getGridSystem();
              return GS ? GS.BAUHAUS_PATTERN_IDS.length : null;
            })(),
            reactivityMode:
              layer.renderer && layer.renderer.reactivity
                ? layer.renderer.reactivity.enabled
                  ? layer.renderer.reactivity.mode
                  : "off"
                : "off",
            reactivityEnabled: !!(
              layer.renderer &&
              layer.renderer.reactivity &&
              layer.renderer.reactivity.enabled
            ),
            tileStyleId:
              layer.renderer && layer.renderer.tileStyle
                ? layer.renderer.tileStyle.id || null
                : null,
            tileStyle: layer.renderer ? layer.renderer.tileStyle || null : null,
            notePatternOverrides: layer.renderer
              ? layer.renderer.notePatternOverrides || {}
              : {},
            patternFamilies: (function () {
              var GS = getGridSystem();
              return GS ? Object.keys(GS.BAUHAUS_FAMILY_PATTERNS) : [];
            })(),
          };
        });
    };
    // ── _wos.bauhaus — palette + finish debug API ──────────────────────────────
    window._wos.bauhaus = (function () {
      function getBauhausLayer() {
        return (
          (state.world.layers || []).find(function (l) {
            return (
              l.type === "grid" &&
              l.renderer &&
              l.renderer.id === "bauhausMinimal"
            );
          }) || null
        );
      }
      function getAllBauhausLayers() {
        return (state.world.layers || []).filter(function (l) {
          return (
            l.type === "grid" &&
            l.renderer &&
            l.renderer.id === "bauhausMinimal"
          );
        });
      }

      return {
        listPalettes: function () {
          var GS = getGridSystem();
          if (!GS) return [];
          return Object.values(GS.BAUHAUS_PALETTES).map(function (p) {
            return {
              id: p.id,
              name: p.name,
              colors: p.colors,
              background: p.background,
            };
          });
        },
        setPalette: function (paletteId) {
          var GS = getGridSystem();
          if (!GS || !GS.BAUHAUS_PALETTES[paletteId]) {
            console.warn(
              "[BAUHAUS] Unknown palette:",
              paletteId,
              "— available:",
              Object.keys(GS ? GS.BAUHAUS_PALETTES : {}),
            );
            return false;
          }
          getAllBauhausLayers().forEach(function (l) {
            l.renderer.paletteId = paletteId;
          });
          renderFrame();
          return paletteId;
        },
        getPalette: function () {
          var l = getBauhausLayer();
          return l ? l.renderer.paletteId || "exhibition1923" : null;
        },

        listFinishes: function () {
          var GS = getGridSystem();
          if (!GS) return [];
          return Object.values(GS.BAUHAUS_FINISHES).map(function (f) {
            return { id: f.id, name: f.name };
          });
        },
        setFinish: function (finishId) {
          var GS = getGridSystem();
          if (!GS || !GS.BAUHAUS_FINISHES[finishId]) {
            console.warn(
              "[BAUHAUS] Unknown finish:",
              finishId,
              "— available:",
              Object.keys(GS ? GS.BAUHAUS_FINISHES : {}),
            );
            return false;
          }
          getAllBauhausLayers().forEach(function (l) {
            l.renderer.finishId = finishId;
          });
          renderFrame();
          return finishId;
        },
        getFinish: function () {
          var l = getBauhausLayer();
          return l ? l.renderer.finishId || "paperSoft" : null;
        },

        getState: function () {
          var l = getBauhausLayer();
          if (!l) return null;
          return {
            paletteId: l.renderer.paletteId || "exhibition1923",
            finishId: l.renderer.finishId || "paperSoft",
            rendererId: l.renderer.id,
            visualLanguage: l.grid && l.grid.visualLanguage,
            visualVersion: l.grid && l.grid.visualVersion,
            gridBlocks: l.blocks ? l.blocks.length : 0,
            activeBlocks: l.blocks
              ? l.blocks.filter(function (b) {
                  return b.active;
                }).length
              : 0,
          };
        },

        regenerate: function () {
          var l = window._wos.generateBauhausGrid();
          return l ? { gridBlocks: l.blocks.length } : null;
        },

        // ── Viewport ────────────────────────────────────────────────────────
        getViewport: function () {
          var l = getBauhausLayer();
          if (!l || !l.renderer.viewport) return null;
          var vp = l.renderer.viewport;
          var mp = state.midiPlayback;
          return Object.assign({}, vp, {
            followTarget: vp.followTarget || "timeline",
            followSmoothing:
              vp.followSmoothing != null ? vp.followSmoothing : 0.08,
            followTargetUpdateMs:
              vp.followTargetUpdateMs != null ? vp.followTargetUpdateMs : 120,
            timelineProgress:
              vp._timelineProgress != null ? vp._timelineProgress : null,
            timelineIndex: vp._timelineIndex != null ? vp._timelineIndex : null,
            targetStartCol:
              vp.targetStartCol != null ? vp.targetStartCol : vp.startCol,
            targetStartRow:
              vp.targetStartRow != null ? vp.targetStartRow : vp.startRow,
            smoothStartCol: vp._smoothCol != null ? vp._smoothCol : null,
            smoothStartRow: vp._smoothRow != null ? vp._smoothRow : null,
            playheadEventIndex: mp ? mp.playheadEventIndex : null,
            playheadEventId: mp ? mp.playheadEventId : null,
            playheadBeat: mp ? mp.playheadBeat : 0,
          });
        },

        setViewportMode: function (mode) {
          var MODES = { full: true, portraitStudy: true, landscapeStudy: true };
          if (!MODES[mode]) {
            console.warn(
              "[BAUHAUS] Unknown viewport mode:",
              mode,
              "— use: full | portraitStudy | landscapeStudy",
            );
            return false;
          }
          getAllBauhausLayers().forEach(function (l) {
            if (!l.renderer.viewport) l.renderer.viewport = {};
            var vp = l.renderer.viewport;
            vp.mode = mode;
            if (mode === "full") {
              vp.enabled = false;
            } else {
              vp.enabled = true;
              if (mode === "portraitStudy" && !vp._userSet) {
                vp.cols = 7;
                vp.rows = 11;
              }
              if (mode === "landscapeStudy" && !vp._userSet) {
                vp.cols = 12;
                vp.rows = 6;
              }
            }
          });
          renderFrame();
          return mode;
        },

        setViewport: function (cols, rows, startCol, startRow) {
          getAllBauhausLayers().forEach(function (l) {
            if (!l.renderer.viewport) l.renderer.viewport = {};
            var vp = l.renderer.viewport;
            var g = l.grid;
            vp.cols = Math.max(1, Math.min(cols || 7, g.columns));
            vp.rows = Math.max(1, Math.min(rows || 11, g.rows));
            vp.startCol = Math.max(
              0,
              Math.min(startCol || 0, Math.max(0, g.columns - vp.cols)),
            );
            vp.startRow = Math.max(
              0,
              Math.min(startRow || 0, Math.max(0, g.rows - vp.rows)),
            );
            vp.enabled = true;
            vp._userSet = true;
            if (!vp.mode || vp.mode === "full") vp.mode = "portraitStudy";
          });
          renderFrame();
          return this.getViewport();
        },

        nudgeViewport: function (dx, dy) {
          getAllBauhausLayers().forEach(function (l) {
            if (!l.renderer.viewport || !l.renderer.viewport.enabled) return;
            var vp = l.renderer.viewport;
            var g = l.grid;
            vp.startCol = Math.max(
              0,
              Math.min(
                (vp.startCol || 0) + (dx || 0),
                Math.max(0, g.columns - (vp.cols || 7)),
              ),
            );
            vp.startRow = Math.max(
              0,
              Math.min(
                (vp.startRow || 0) + (dy || 0),
                Math.max(0, g.rows - (vp.rows || 11)),
              ),
            );
          });
          renderFrame();
          return this.getViewport();
        },

        resetViewport: function () {
          getAllBauhausLayers().forEach(function (l) {
            var GS = getGridSystem();
            l.renderer.viewport = GS
              ? Object.assign({}, GS.DEFAULT_VIEWPORT)
              : {
                  enabled: false,
                  mode: "full",
                  cols: 7,
                  rows: 11,
                  startCol: 0,
                  startRow: 0,
                  followPlayback: false,
                  padding: 24,
                };
          });
          renderFrame();
          return this.getViewport();
        },

        setViewportFollowPlayback: function (enabled) {
          getAllBauhausLayers().forEach(function (l) {
            if (!l.renderer.viewport) l.renderer.viewport = {};
            l.renderer.viewport.followPlayback = !!enabled;
          });
          return !!enabled;
        },

        listPatterns: function () {
          var GS = getGridSystem();
          return GS ? GS.BAUHAUS_PATTERN_IDS.slice() : [];
        },

        setReactivity: function (mode) {
          var valid = { off: true, playhead: true, noteClass: true };
          if (!valid[mode]) {
            console.warn(
              "[BAUHAUS] Unknown reactivity mode:",
              mode,
              "— use: off | playhead | noteClass",
            );
            return false;
          }
          getAllBauhausLayers().forEach(function (l) {
            if (!l.renderer.reactivity) l.renderer.reactivity = {};
            l.renderer.reactivity.mode = mode;
            l.renderer.reactivity.enabled = mode !== "off";
          });
          renderFrame();
          return mode;
        },

        getReactivity: function () {
          var l = getBauhausLayer();
          if (!l || !l.renderer.reactivity) return "off";
          var rx = l.renderer.reactivity;
          return rx.enabled && rx.mode ? rx.mode : "off";
        },

        setViewportFollowTarget: function (target) {
          var valid = { timeline: true, event: true };
          if (!valid[target]) {
            console.warn(
              "[BAUHAUS] Unknown followTarget:",
              target,
              "— use: timeline | event",
            );
            return false;
          }
          getAllBauhausLayers().forEach(function (l) {
            if (!l.renderer.viewport) l.renderer.viewport = {};
            l.renderer.viewport.followTarget = target;
            l.renderer.viewport._smoothCol = null;
            l.renderer.viewport._smoothRow = null;
          });
          return target;
        },

        // ── Tile style API ──────────────────────────────────────────────────
        listTileStyles: function () {
          var GS = getGridSystem();
          if (!GS) return [];
          return Object.keys(GS.BAUHAUS_TILE_STYLES).map(function (id) {
            var ts = GS.BAUHAUS_TILE_STYLES[id];
            return { id: id, name: ts.name, shapeScale: ts.shapeScale };
          });
        },

        setTileStyle: function (id) {
          var GS = getGridSystem();
          if (!GS) return false;
          var ts = GS.BAUHAUS_TILE_STYLES[id];
          if (!ts) {
            console.warn(
              "[BAUHAUS] Unknown tile style:",
              id,
              "— use:",
              Object.keys(GS.BAUHAUS_TILE_STYLES).join(" | "),
            );
            return false;
          }
          getAllBauhausLayers().forEach(function (l) {
            l.renderer.tileStyle = Object.assign({}, ts);
          });
          renderFrame();
          return id;
        },

        getTileStyle: function () {
          var l = getBauhausLayer();
          if (!l || !l.renderer.tileStyle) return null;
          return Object.assign({}, l.renderer.tileStyle);
        },

        // ── Note→pattern map API ────────────────────────────────────────────
        getNotePatternMap: function () {
          var GS = getGridSystem();
          var l = getBauhausLayer();
          if (!GS || !l) return null;
          return GS.getBauhausNotePatternMap(l);
        },

        setNotePatternFamily: function (noteClass, family) {
          var GS = getGridSystem();
          if (!GS) return false;
          if (!GS.BAUHAUS_FAMILY_PATTERNS[family]) {
            console.warn(
              "[BAUHAUS] Unknown family:",
              family,
              "— use:",
              Object.keys(GS.BAUHAUS_FAMILY_PATTERNS).join(" | "),
            );
            return false;
          }
          var nc = parseInt(noteClass, 10);
          if (isNaN(nc) || nc < 0 || nc > 11) {
            console.warn("[BAUHAUS] noteClass must be 0-11");
            return false;
          }
          getAllBauhausLayers().forEach(function (l) {
            if (!l.renderer.notePatternOverrides)
              l.renderer.notePatternOverrides = {};
            l.renderer.notePatternOverrides[nc] = family;
          });
          // Sync to GS module-level overrides
          var l = getBauhausLayer();
          GS.setActiveNotePatternOverrides(
            l ? l.renderer.notePatternOverrides || {} : {},
          );
          // Bust per-block pattern cache so blocks re-resolve on next frame
          getAllBauhausLayers().forEach(function (l) {
            (l.blocks || []).forEach(function (b) {
              b.patternId = null;
            });
          });
          renderFrame();
          return { noteClass: nc, family: family };
        },

        clearNotePatternOverrides: function () {
          var GS = getGridSystem();
          if (!GS) return false;
          getAllBauhausLayers().forEach(function (l) {
            l.renderer.notePatternOverrides = {};
            (l.blocks || []).forEach(function (b) {
              b.patternId = null;
            });
          });
          GS.setActiveNotePatternOverrides({});
          renderFrame();
          return true;
        },
      };
    })();

    // ── Layer governance helpers ───────────────────────────────────────────────
    var LAYER_CONTROL_IDS = [
      "atmosphere",
      "terrain",
      "signals",
      "walkers",
      "midi",
      "ecology",
      "debug",
    ];

    function isLayerVisible(id) {
      var lc = state.layerControls;
      if (!lc || !lc[id]) return true;
      var hasSolo = LAYER_CONTROL_IDS.some(function (k) {
        return lc[k] && lc[k].solo;
      });
      if (hasSolo) return !!lc[id].solo;
      return lc[id].visible !== false;
    }

    function getLayerOpacity(id) {
      var lc = state.layerControls;
      if (!lc || !lc[id]) return 1.0;
      return lc[id].opacity != null ? lc[id].opacity : 1.0;
    }

    // ── _wos.routeWorld — route world console API ────────────────────────────
    window._wos.routeWorld = (function () {
      function rw() {
        return state.routeWorld;
      }

      return {
        createManualRoute: function (name, points, options) {
          var opts = options || {};
          var routeId = makeId("route");
          var worldId = makeId("rworld");

          // Build cumulative distances
          var dist = computePolylineDistances(points);
          var route = {
            id: routeId,
            name: name || "Route",
            start: {
              label: opts.startLabel || "Home",
              lat: null,
              lng: null,
              x: points[0] ? points[0].x : 0,
              y: points[0] ? points[0].y : 0,
            },
            end: {
              label: opts.endLabel || "Destination",
              lat: null,
              lng: null,
              x: points[points.length - 1] ? points[points.length - 1].x : 0,
              y: points[points.length - 1] ? points[points.length - 1].y : 0,
            },
            distanceMeters: dist.total,
            durationSec: opts.durationSec || 7200,
            points: points.slice(),
            segments: [],
            metadata: opts.metadata || {},
            _totalPixelLength: dist.total,
            _cumulativeDistances: dist.cumulative,
            _skinSeed: Math.floor(Math.random() * 1e8),
          };

          // Auto-generate route segments proportionally
          var segTypes = [
            "local",
            "road",
            "highway",
            "road",
            "waterfront",
            "road",
          ];
          var skinHints = [
            "residential",
            "suburban",
            "suburban",
            "suburban",
            "waterfront",
            "suburban",
          ];
          var segCount = Math.max(2, Math.floor(points.length / 2));
          var segments = [];
          for (var si = 0; si < segCount; si++) {
            var st = si / segCount;
            var et = (si + 1) / segCount;
            var seg = {
              id: makeId("seg"),
              routeId: routeId,
              index: si,
              type: segTypes[si % segTypes.length],
              startT: st,
              endT: et,
              startDistanceMeters: st * dist.total,
              endDistanceMeters: et * dist.total,
              speedLimitKph: 50,
              mood: "neutral",
              density: 0.35,
              cameraHint: "follow",
              skinHint: skinHints[si % skinHints.length],
              eventPoolIds: [],
            };
            segments.push(seg);
            route.segments.push(seg.id);
          }

          // Create world
          var world = {
            id: worldId,
            name: opts.worldName || name || "Route World",
            version: "1.0.0",
            provider: { type: "manual", sourceId: null, attribution: "" },
            routeId: routeId,
            activeCameraId: "route-follow",
            durationSec: opts.durationSec || 7200,
            loopMode: opts.loopMode || "destination",
            mood: opts.mood || "night-drive",
            timeOfDay: opts.timeOfDay || "night",
            weather: opts.weather || "clear",
            layers: {
              map: true,
              skin: true,
              traffic: true,
              ecology: true,
              events: true,
              surfaces: true,
              subway: false,
            },
          };

          // Default skin
          var skin = {
            id: makeId("skin"),
            routeWorldId: worldId,
            style: opts.skinStyle || "wos-map",
            buildingDensity:
              opts.buildingDensity != null ? opts.buildingDensity : 0.35,
            waterDensity: opts.waterDensity != null ? opts.waterDensity : 0.15,
            greenDensity: opts.greenDensity != null ? opts.greenDensity : 0.2,
            roadRenderMode: "signal-line",
            buildingRenderMode: "grid-symbol",
            waterRenderMode: "organic-void",
            paletteId: "nightMap",
            glyphSystemId: "bauhaus",
          };

          // Default camera rig
          var rig = {
            id: "route-follow",
            mode: "follow",
            targetActorId: "hero-car",
            zoom: 1.8,
            targetZoom: 1.8,
            lookAhead: 0.035,
            smoothing: 0.08,
            drift: 0.15,
            viewLayout: "single",
          };

          var w = rw();
          w.world = world;
          w.routes.push(route);
          segments.forEach(function (s) {
            w.segments.push(s);
          });
          w.skins.push(skin);
          w.cameraRigs.push(rig);
          w.runtime.activeRouteId = routeId;

          console.log(
            "[RouteWorld] manual route created:",
            routeId,
            points.length,
            "points,",
            segments.length,
            "segments,",
            dist.total.toFixed(0),
            "px total length",
          );
          return route;
        },

        addHeroCar: function (routeId) {
          var w = rw();
          var rid = routeId || (w.runtime && w.runtime.activeRouteId);
          // Remove existing hero-car if present
          w.actors = w.actors.filter(function (a) {
            return a.id !== "hero-car";
          });
          var AN_init = SBE && SBE.AgentNeeds;
          var actor = {
            id: "hero-car",
            type: "vehicle",
            role: "driver",
            routeId: rid,
            t: 0,
            speed: 1,
            x: 0,
            y: 0,
            heading: 0,
            visual: { color: "#f6d36b", radius: 8, trail: true, halo: true },
            audio: { enabled: false, role: "traffic" },
            needs: AN_init ? AN_init.makeNeeds() : null,
          };
          w.actors.push(actor);
          w.runtime.activeActorId = "hero-car";
          // Prime starting position
          var route = w.routes.find(function (r) {
            return r.id === rid;
          });
          if (route) {
            var pos = sampleRoutePolyline(route, 0);
            actor.x = pos.x;
            actor.y = pos.y;
            actor.heading = pos.heading;
            var cam = _rwEnsureCamera(w);
            cam.x = pos.x;
            cam.y = pos.y;
            cam.targetX = pos.x;
            cam.targetY = pos.y;
          }
          console.log("[RouteWorld] hero-car added, route:", rid);
          return actor;
        },

        addEventZone: function (routeId, t, config) {
          var w = rw();
          var cfg = config || {};
          var zone = {
            id: cfg.id || makeId("zone"),
            label: cfg.label || "Event Zone",
            routeId: routeId || w.runtime.activeRouteId,
            t: t != null ? t : 0.5,
            radiusMeters: cfg.radiusMeters || 100,
            type: cfg.type || "ambient",
            rarity: cfg.rarity != null ? cfg.rarity : 1,
            cooldownSec: cfg.cooldownSec || 300,
            conditions: {
              weather: (cfg.conditions && cfg.conditions.weather) || [],
              timeOfDay: (cfg.conditions && cfg.conditions.timeOfDay) || [],
              segmentTypes:
                (cfg.conditions && cfg.conditions.segmentTypes) || [],
            },
            actions: cfg.actions || [],
            lastTriggeredAt: 0,
          };
          w.eventZones.push(zone);
          console.log("[RouteWorld] event zone added:", zone.id, "at t=", t);
          return zone;
        },

        setCameraMode: function (mode) {
          var valid = ["overview", "follow", "cinematic", "dual"];
          if (!valid.includes(mode)) {
            console.warn(
              "[RouteWorld] unknown camera mode:",
              mode,
              "— use:",
              valid.join(" | "),
            );
            return;
          }
          var w = rw();
          var cam = _rwEnsureCamera(w);
          var RC = SBE && SBE.RouteCamera;
          if (RC) {
            RC.setMode(cam, mode); // all mode changes must go through setMode() — never assign cam.mode directly
          } else {
            cam.mode = mode; // fallback if RouteCamera not loaded
          }
          if (mode === "dual") {
            console.warn(
              "[RouteWorld] dual camera: not fully rendered in v1, storing mode",
            );
          }
          var rig = w.cameraRigs.find(function (c) {
            return c.id === "route-follow";
          });
          if (rig) rig.mode = mode;
          renderFrame();
          console.log("[RouteWorld] camera mode:", mode);
          return mode;
        },

        setCameraOption: function (key, value) {
          var cam = _rwEnsureCamera(rw());
          if (!(key in cam)) {
            console.warn("[RouteWorld] unknown camera option:", key);
            return;
          }
          cam[key] = value;
          renderFrame();
          return cam[key];
        },

        setSkin: function (style) {
          var w = rw();
          var skin = w.skins[0];
          if (!skin) {
            console.warn("[RouteWorld] no skin to update");
            return;
          }
          skin.style = style;
          renderFrame();
          console.log("[RouteWorld] skin style:", style);
          return skin;
        },

        start: function () {
          var w = rw();
          _rwEnsureSpatialBootstrap(w); // guarantee world + route + actor exist
          if (!w.world) {
            console.warn(
              "[RouteWorld] no world — call createManualRoute first",
            );
            return;
          }
          w.active = true;
          w.runtime.elapsedSec = 0;
          w.runtime.triggeredEventIds = new Set();
          // Reset actor progress
          w.actors.forEach(function (a) {
            a.t = 0;
          });
          renderFrame();
          console.log("[RouteWorld] started");
          return w.world;
        },

        stop: function () {
          rw().active = false;
          renderFrame();
          console.log("[RouteWorld] stopped");
        },

        reset: function () {
          var w = rw();
          w.active = false;
          w.world = null;
          w.routes = [];
          w.actors = [];
          w.eventZones = [];
          w.skins = [];
          w.cameraRigs = [];
          w.surfaceAnchors = [];
          w.segments = [];
          w.camera = null; // will be re-created fresh on next use
          w.runtime = {
            elapsedSec: 0,
            activeRouteId: null,
            activeActorId: null,
            activeSegmentId: null,
            triggeredEventIds: new Set(),
          };
          renderFrame();
          console.log("[RouteWorld] reset");
        },

        state: function () {
          var w = rw();
          return {
            active: w.active,
            world: w.world,
            routeCount: w.routes.length,
            actorCount: w.actors.length,
            segmentCount: (w.segments || []).length,
            eventZoneCount: w.eventZones.length,
            skinCount: w.skins.length,
            cameraRigCount: w.cameraRigs.length,
            runtime: Object.assign({}, w.runtime, {
              triggeredEventIds: Array.from(w.runtime.triggeredEventIds || []),
            }),
            heroActor:
              w.actors.find(function (a) {
                return a.id === "hero-car";
              }) || null,
          };
        },

        // ── Ingestion methods ──────────────────────────────────────────────

        importGeoJSONRoute: function (geojson, options) {
          var RI = SBE.RouteIngestion;
          if (!RI) {
            console.error("[RouteWorld] SBE.RouteIngestion not loaded");
            return null;
          }
          var result = RI.importGeoJSON(geojson, state.canvas, options);
          if (!result) return null;
          return _rwIngestResult(result, options);
        },

        importEncodedPolyline: function (encoded, options) {
          var RI = SBE.RouteIngestion;
          if (!RI) {
            console.error("[RouteWorld] SBE.RouteIngestion not loaded");
            return null;
          }
          var result = RI.importEncodedPolyline(encoded, state.canvas, options);
          if (!result) return null;
          return _rwIngestResult(result, options);
        },

        normalizeGeoRoute: function (points, options) {
          var RI = SBE.RouteIngestion;
          if (!RI) {
            console.error("[RouteWorld] SBE.RouteIngestion not loaded");
            return null;
          }
          return RI.normalizeRoutePoints(points);
        },

        fitRouteToCanvas: function (routeId, options) {
          var RI = SBE.RouteIngestion;
          if (!RI) {
            console.error("[RouteWorld] SBE.RouteIngestion not loaded");
            return null;
          }
          var w = rw();
          _rwEnsureSpatialBootstrap(w); // guarantee route exists before lookup
          var route = w.routes.find(function (r) {
            return r.id === (routeId || w.runtime.activeRouteId);
          });
          if (!route) {
            console.warn(
              "[RouteWorld] fitRouteToCanvas: route not found:",
              routeId,
            );
            return null;
          }
          var pad = options && options.padding != null ? options.padding : 120;
          RI.fitRouteToCanvas(route, state.canvas, pad);
          // Reset camera to new start position
          var cam2 = _rwEnsureCamera(w);
          if (route.points && route.points[0]) {
            cam2.x = route.points[0].x;
            cam2.y = route.points[0].y;
            cam2.targetX = cam2.x;
            cam2.targetY = cam2.y;
            cam2._overviewFitted = false;
          }
          renderFrame();
          console.log("[RouteWorld] route re-fitted to canvas:", route.id);
          return route;
        },

        routeStats: function (routeId) {
          var RI = SBE.RouteIngestion;
          if (!RI) {
            console.error("[RouteWorld] SBE.RouteIngestion not loaded");
            return null;
          }
          var w = rw();
          var route = w.routes.find(function (r) {
            return r.id === (routeId || w.runtime.activeRouteId);
          });
          if (!route) {
            console.warn("[RouteWorld] routeStats: no route found");
            return null;
          }
          return RI.routeStats(route);
        },
      };
    })();

    // ── Shared ingestion helper (used by importGeoJSONRoute + importEncodedPolyline) ──
    function _rwIngestResult(result, options) {
      var w = state.routeWorld;
      var route = result.route;
      var segments = result.segments;

      // Ensure world record exists
      if (!w.world) {
        w.world = {
          id: makeId("rworld"),
          name: (options && options.worldName) || route.name || "Route World",
          version: "1.0.0",
          provider: {
            type: (route.metadata && route.metadata.providerType) || "geojson",
            sourceId: null,
            attribution: "",
          },
          routeId: route.id,
          activeCameraId: "route-follow",
          durationSec: route.durationSec,
          loopMode: (options && options.loopMode) || "destination",
          mood: (options && options.mood) || "night-drive",
          timeOfDay: (options && options.timeOfDay) || "night",
          weather: (options && options.weather) || "clear",
          layers: {
            map: true,
            skin: true,
            traffic: true,
            ecology: true,
            events: true,
            surfaces: true,
            subway: false,
            // Corridor Renderer v1.0.0 layer toggles
            terrain: true, // route spine + district bands
            signals: true, // POIs + scenic moments
            walkers: true, // actor markers + camera reticle
            debug: false, // labels + spatial diagnostics
            atmosphere: true, // future: weather overlays
          },
        };
      } else {
        w.world.routeId = route.id;
        w.world.durationSec = route.durationSec;
        w.world.provider.type =
          (route.metadata && route.metadata.providerType) || "geojson";
      }

      // Default skin if none
      if (!w.skins.length) {
        w.skins.push({
          id: makeId("skin"),
          routeWorldId: w.world.id,
          style: "wos-map",
          buildingDensity: 0.35,
          waterDensity: 0.15,
          greenDensity: 0.2,
          roadRenderMode: "signal-line",
          buildingRenderMode: "grid-symbol",
          waterRenderMode: "organic-void",
          paletteId: "nightMap",
          glyphSystemId: "bauhaus",
        });
      }

      // Default camera rig if none
      if (!w.cameraRigs.length) {
        w.cameraRigs.push({
          id: "route-follow",
          mode: "follow",
          targetActorId: "hero-car",
          zoom: 1.8,
          targetZoom: 1.8,
          lookAhead: 0.035,
          smoothing: 0.08,
          drift: 0.15,
          viewLayout: "single",
        });
      }

      w.routes.push(route);
      segments.forEach(function (s) {
        w.segments.push(s);
      });
      w.runtime.activeRouteId = route.id;

      console.log(
        "[RouteWorld] route ingested:",
        route.id,
        route.points.length + " pts,",
        segments.length + " segs,",
        Math.round(route.distanceMeters) + "m,",
        route.durationSec + "s",
      );
      return route;
    }

    // ── _wos.layers — layer governance console API ─────────────────────────────
    window._wos.layers = {
      list: function () {
        var lc = state.layerControls;
        return LAYER_CONTROL_IDS.map(function (id) {
          var ctrl = lc[id] || { visible: true, opacity: 1.0, solo: false };
          return {
            id: id,
            visible: ctrl.visible,
            opacity: ctrl.opacity,
            solo: ctrl.solo,
            computed: isLayerVisible(id),
          };
        });
      },
      show: function (id) {
        if (!state.layerControls[id]) {
          console.warn("[layers] unknown id:", id);
          return;
        }
        state.layerControls[id].visible = true;
        renderFrame();
      },
      hide: function (id) {
        if (!state.layerControls[id]) {
          console.warn("[layers] unknown id:", id);
          return;
        }
        state.layerControls[id].visible = false;
        renderFrame();
      },
      setOpacity: function (id, v) {
        if (!state.layerControls[id]) {
          console.warn("[layers] unknown id:", id);
          return;
        }
        state.layerControls[id].opacity = Math.max(0, Math.min(1, v));
        renderFrame();
      },
      solo: function (id) {
        if (!state.layerControls[id]) {
          console.warn("[layers] unknown id:", id);
          return;
        }
        LAYER_CONTROL_IDS.forEach(function (k) {
          state.layerControls[k].solo = k === id;
        });
        renderFrame();
      },
      clearSolo: function () {
        LAYER_CONTROL_IDS.forEach(function (k) {
          state.layerControls[k].solo = false;
        });
        renderFrame();
      },
    };

    // ── _wos.spatial — spatial infrastructure debug console API ──────────────
    window._wos.spatial = {
      // Print a compact summary of the loaded spatial world
      summary: function () {
        var rw = state.routeWorld;
        _rwEnsureSpatialBootstrap(rw);
        var SI = SBE && SBE.SpatialInfrastructure;
        var spatial = rw && rw.spatial;
        if (!spatial) {
          console.log("[spatial] no spatial world loaded");
          return null;
        }
        var s = SI ? SI.summary(spatial) : null;
        console.log("[spatial] summary:", s);
        console.log(
          "[spatial] routes:",
          rw.routes.length,
          "· activeRouteId:",
          rw.runtime && rw.runtime.activeRouteId,
        );
        return s;
      },
      // Snapshot the current world inspector state
      inspector: function () {
        var rw = state.routeWorld;
        var WI = SBE && SBE.WorldInspector;
        if (!WI) {
          console.log("[spatial] WorldInspector not loaded");
          return null;
        }
        var snap = WI.snapshot(rw, rw.clock, rw.env, rw.comms);
        console.log("[spatial] inspector:", snap);
        return snap;
      },
      // Toggle debug labels on/off
      debug: function (on) {
        var rw = state.routeWorld;
        if (rw && rw.world && rw.world.layers) {
          rw.world.layers.debug = on !== false;
          renderFrame();
          console.log(
            "[spatial] debug labels:",
            rw.world.layers.debug ? "ON" : "OFF",
          );
        }
      },
      // Toggle a specific corridor layer (terrain|signals|walkers|atmosphere)
      layer: function (name, on) {
        var rw = state.routeWorld;
        if (rw && rw.world && rw.world.layers) {
          rw.world.layers[name] = on !== false;
          renderFrame();
          console.log(
            "[spatial] layer",
            name,
            ":",
            rw.world.layers[name] ? "ON" : "OFF",
          );
        }
      },
      // Score spatial interest at current camera position
      interest: function () {
        var rw = state.routeWorld;
        var SI = SBE && SBE.SpatialInfrastructure;
        if (!SI || !rw || !rw.spatial || !rw.camera) {
          console.log("[spatial] not ready");
          return;
        }
        var cam = rw.camera;
        var score = SI.spatialInterest(
          rw.spatial,
          { x: cam.x, y: cam.y },
          rw.env,
          rw.clock,
        );
        console.log(
          "[spatial] interest at camera (" +
            Math.round(cam.x) +
            "," +
            Math.round(cam.y) +
            "):",
          score.toFixed(3),
        );
        return score;
      },
    };

    // ── _wos.director — Director Mode console API ────────────────────────────
    window._wos.director = {
      // Get/print current director snapshot
      snapshot: function () {
        var rw = state.routeWorld;
        var DM = SBE && SBE.DirectorMode;
        var d = rw && rw.director;
        if (!d) {
          console.log("[director] not initialised");
          return null;
        }
        var snap = DM ? DM.snapshotDirector(d) : d;
        console.log("[director]", snap);
        return snap;
      },
      // Switch director mode: "survey" | "follow" | "cinema" | "god"
      mode: function (m) {
        var rw = state.routeWorld;
        var DM = SBE && SBE.DirectorMode;
        var d = _rwEnsureDirector(rw);
        if (DM) DM.setMode(d, m);
        else d.mode = m;
        console.log("[director] mode →", d.mode);
        if (window._wos.syncRouteWorldStatus)
          window._wos.syncRouteWorldStatus();
      },
      // Pause simulation
      pause: function () {
        var rw = state.routeWorld;
        var DM = SBE && SBE.DirectorMode;
        var d = _rwEnsureDirector(rw);
        if (DM) DM.pause(d);
        else d.simulation.paused = true;
        console.log("[director] paused");
      },
      // Resume simulation
      resume: function () {
        var rw = state.routeWorld;
        var DM = SBE && SBE.DirectorMode;
        var d = _rwEnsureDirector(rw);
        if (DM) DM.resume(d);
        else d.simulation.paused = false;
        console.log("[director] resumed");
      },
      // Set simulation speed multiplier (0.1 – 8)
      speed: function (s) {
        var rw = state.routeWorld;
        var DM = SBE && SBE.DirectorMode;
        var d = _rwEnsureDirector(rw);
        if (DM) DM.setSpeed(d, s);
        else d.simulation.speed = s;
        console.log("[director] speed →", d.simulation.speed);
      },
      // Scrub route progress (0–1). Pass null to return to live.
      progress: function (t) {
        var rw = state.routeWorld;
        var DM = SBE && SBE.DirectorMode;
        var d = _rwEnsureDirector(rw);
        if (DM) DM.setRouteProgress(d, t);
        else
          d.simulation.routeProgressOverride =
            t == null ? null : Math.max(0, Math.min(1, t));
        console.log(
          "[director] progress →",
          d.simulation.routeProgressOverride,
        );
      },
      // Set world hour (0–23.99). Activates reality overrides.
      time: function (h) {
        var rw = state.routeWorld;
        var d = _rwEnsureDirector(rw);
        d.reality.useOverrides = true;
        d.reality.timeHour = ((h % 24) + 24) % 24;
        console.log("[director] timeHour →", d.reality.timeHour.toFixed(2));
      },
      // Set weather archetype. Activates reality overrides.
      weather: function (w) {
        var rw = state.routeWorld;
        var d = _rwEnsureDirector(rw);
        d.reality.useOverrides = true;
        d.reality.weatherType = w;
        console.log("[director] weather →", w);
      },
      // Set season. Activates reality overrides.
      season: function (s) {
        var rw = state.routeWorld;
        var d = _rwEnsureDirector(rw);
        d.reality.useOverrides = true;
        d.reality.season = s;
        console.log("[director] season →", s);
      },
      // Fit route and reset manual camera to overview
      fit: function () {
        var rw = state.routeWorld;
        var DM = SBE && SBE.DirectorMode;
        var d = _rwEnsureDirector(rw);
        if (d.manualCamera) d.manualCamera._primed = false; // forces re-prime on next render
        window._wos.routeWorld &&
          window._wos.routeWorld.fitRouteToCanvas(null, { padding: 120 });
        console.log("[director] fit — manual camera will re-prime");
      },
      // Reset to survey mode at current camera position
      resetView: function () {
        var rw = state.routeWorld;
        var DM = SBE && SBE.DirectorMode;
        var d = _rwEnsureDirector(rw);
        if (DM) DM.setMode(d, "survey");
        if (d.manualCamera) d.manualCamera._primed = false;
        console.log("[director] reset to survey");
      },
      // Disable reality overrides (return to live simulation)
      liveMode: function () {
        var rw = state.routeWorld;
        var d = _rwEnsureDirector(rw);
        d.reality.useOverrides = false;
        console.log("[director] live mode — overrides disabled");
      },
    };

    // ── _wos.geo — Reference Geography Layer console API ─────────────────────
    window._wos.geo = {
      // Toggle a geographic sub-layer: "water" | "roads" | "bridges" | "parks" | "districts"
      toggle: function (layer) {
        var rw = state.routeWorld;
        var rg = _rwEnsureReferenceGeo(rw);
        var current = rg.layers[layer] !== false;
        var RGL = SBE && SBE.ReferenceGeographyLayer;
        if (RGL) RGL.setLayerVisible(rg, layer, !current);
        else rg.layers[layer] = !current;
        renderFrame();
        console.log("[geo] layer", layer, "→", rg.layers[layer] ? "ON" : "OFF");
      },
      // Set visual style: "muted" | "wireframe" | "cinematic"
      style: function (mode) {
        var rw = state.routeWorld;
        var rg = _rwEnsureReferenceGeo(rw);
        var RGL = SBE && SBE.ReferenceGeographyLayer;
        if (RGL) RGL.setStyle(rg, mode);
        else rg.style = mode;
        renderFrame();
        console.log("[geo] style →", rg.style);
      },
      // Set master opacity (0–1)
      opacity: function (v) {
        var rw = state.routeWorld;
        var rg = _rwEnsureReferenceGeo(rw);
        var RGL = SBE && SBE.ReferenceGeographyLayer;
        if (RGL) RGL.setOpacity(rg, v);
        else rg.opacity = Math.max(0, Math.min(1, v));
        renderFrame();
        console.log("[geo] opacity →", rg.opacity.toFixed(2));
      },
      // Enable / disable the entire layer
      enable: function (on) {
        var rw = state.routeWorld;
        var rg = _rwEnsureReferenceGeo(rw);
        rg.enabled = on !== false;
        renderFrame();
        console.log("[geo] enabled →", rg.enabled);
      },
      // Print current state snapshot
      snapshot: function () {
        var rw = state.routeWorld;
        var rg = _rwEnsureReferenceGeo(rw);
        var snap = {
          enabled: rg.enabled,
          style: rg.style,
          opacity: rg.opacity,
          layers: Object.assign({}, rg.layers),
        };
        console.log("[geo]", snap);
        return snap;
      },
    };

    // ── _wos.map — Basemap console API ────────────────────────────────────────
    window._wos.map = {
      // Enable / disable basemap
      enable: function (on) {
        var rw = state.routeWorld;
        var bm = _rwEnsureBasemap(rw);
        bm.enabled = on !== false;
        renderFrame();
        console.log("[map] enabled →", bm.enabled);
      },
      // Set master opacity (0–1)
      opacity: function (v) {
        var rw = state.routeWorld;
        var bm = _rwEnsureBasemap(rw);
        bm.opacity = Math.max(0, Math.min(1, v));
        renderFrame();
        console.log("[map] opacity →", bm.opacity.toFixed(2));
      },
      // Set style: "dark" | "muted" | "blueprint" | "wireframe"
      style: function (s) {
        var rw = state.routeWorld;
        var bm = _rwEnsureBasemap(rw);
        bm.style = s;
        renderFrame();
        console.log("[map] style →", bm.style);
      },
      // Set tile zoom level (enables zoom lock)
      zoom: function (z) {
        var rw = state.routeWorld;
        var bm = _rwEnsureBasemap(rw);
        bm.zoom = Math.max(8, Math.min(17, Math.round(z)));
        bm.zoomLocked = true;
        renderFrame();
        console.log("[map] zoom locked →", bm.zoom);
      },
      // Release zoom lock (auto-zoom based on camera scale)
      autoZoom: function () {
        var rw = state.routeWorld;
        var bm = _rwEnsureBasemap(rw);
        bm.zoomLocked = false;
        renderFrame();
        console.log("[map] zoom → auto");
      },
      // Enable tile debug overlay
      debug: function (on) {
        var rw = state.routeWorld;
        if (rw && rw.world && rw.world.layers) {
          rw.world.layers.debug = on !== false;
          renderFrame();
          console.log("[map] debug →", rw.world.layers.debug);
        }
      },
      // Print tile cache stats
      cache: function () {
        var BM = SBE && SBE.BasemapRenderer;
        var stats = BM ? BM.cacheStats() : null;
        console.log("[map] cache:", stats);
        return stats;
      },
      // Clear tile cache
      clearCache: function () {
        var BM = SBE && SBE.BasemapRenderer;
        if (BM) BM.clearCache();
        renderFrame();
      },
      // List currently visible tile keys
      visibleTiles: function () {
        var rw = state.routeWorld;
        var bm = rw && rw.basemap;
        var tiles = bm && bm.visibleTiles ? bm.visibleTiles : [];
        console.log(
          "[map] visible tiles (Z=" + (bm && bm._lastZ) + "):",
          tiles,
        );
        console.log(
          "[map] drawn:",
          bm && bm._lastDrawn,
          " pending:",
          bm && bm._lastPending,
        );
        return tiles.slice();
      },
      // Print full basemap state snapshot
      snapshot: function () {
        var rw = state.routeWorld;
        var bm = _rwEnsureBasemap(rw);
        var snap = {
          enabled: bm.enabled,
          opacity: bm.opacity,
          style: bm.style,
          zoom: bm.zoom,
          zoomLocked: bm.zoomLocked,
          lastZ: bm._lastZ,
          drawn: bm._lastDrawn,
          pending: bm._lastPending,
          presentationMode: rw.presentationMode,
        };
        console.log("[map]", snap);
        return snap;
      },
    };

    // ── _wos.demo — demo mode console API ─────────────────────────────────────
    window._wos.demo = {
      state: function () {
        return Object.assign({}, state.demo);
      },
      enable: function () {
        state.demo.enabled = true;
        console.log("[demo] enabled");
      },
      disable: function () {
        state.demo.enabled = false;
        console.log("[demo] disabled");
      },
      toggle: function () {
        state.demo.enabled = !state.demo.enabled;
        console.log("[demo]", state.demo.enabled ? "enabled" : "disabled");
        return state.demo.enabled;
      },
    };

    // ── _wos inspector console API ────────────────────────────────────────────
    window._wos.showObjectInspector = function() {
      showObjectInspector();
      console.log('[inspector] shown (forced)');
    };
    window._wos.hideObjectInspector = function() {
      _inspectorPinned = false;
      SBE.runtimeFlags.objectInspectorPinned = false;
      SBE.runtimeFlags.showObjectInspectorWhenEmpty = false;
      document.body.classList.add('inspector-hidden');
      var pinBtn = document.getElementById('inspector-pin-btn');
      if (pinBtn) pinBtn.classList.remove('pinned');
      _scheduleViewportSync();
      console.log('[inspector] hidden (forced)');
    };
    window._wos.pinObjectInspector = function(on) { pinObjectInspector(on); };
    window._wos.debugObjectInspector = function() {
      var snap = {
        bodyHasInspectorHidden: document.body.classList.contains('inspector-hidden'),
        pinned: _inspectorPinned,
        showWhenEmpty: SBE.runtimeFlags.showObjectInspectorWhenEmpty,
        rightPanelWidth: (document.getElementById('right-panel') || {}).offsetWidth,
        emptyStateHidden: (document.getElementById('inspector-empty-state') || {}).hidden,
      };
      console.table([snap]);
      return snap;
    };

    // ── _wos.auditHiddenArtifacts ──────────────────────────────────────────────
    window._wos.auditHiddenArtifacts = function auditHiddenArtifacts() {
      var result = {
        autoRunning: [],
        hiddenState: [],
        orphanedRefs: [],
        staleFields: [],
      };

      // Check IW auto-start
      if (state.infiniteWorld && state.infiniteWorld.autoStart) {
        result.autoRunning.push({
          id: "infiniteWorld.autoStart",
          value: true,
          note: "will auto-start IW on load",
        });
      }
      if (state.demo && state.demo.autoStart) {
        result.autoRunning.push({
          id: "demo.autoStart",
          value: true,
          note: "will auto-start demo on load",
        });
      }

      // Check for orphaned _signalEnergy refs on blocks
      var oldEnergyBlocks = 0;
      (state.world.layers || []).forEach(function (layer) {
        if (layer.type !== "grid") return;
        (layer.blocks || []).forEach(function (b) {
          if (b._signalEnergy != null) oldEnergyBlocks++;
        });
      });
      if (oldEnergyBlocks > 0)
        result.staleFields.push({
          id: "_signalEnergy",
          count: oldEnergyBlocks,
          note: "legacy flat field — use block._signal.energy",
        });

      // Check for walkers without trail/idHash infrastructure
      var legacyWalkers = (state.walkers || []).filter(function (w) {
        return !w._idHash;
      });
      if (legacyWalkers.length)
        result.orphanedRefs.push({
          id: "walker._idHash",
          count: legacyWalkers.length,
          note: "walkers missing trail/idHash — created before PlayheadReadability spec",
        });

      // Report layerControls state
      result.layerControls = LAYER_CONTROL_IDS.map(function (id) {
        return {
          id: id,
          visible: isLayerVisible(id),
          opacity: getLayerOpacity(id),
        };
      });

      console.table &&
        console.table(
          result.autoRunning
            .concat(result.staleFields)
            .concat(result.orphanedRefs),
        );
      return result;
    };

    console.log("[WOS DEBUG] sampleMap:", sampleMap);
    console.log("[WOS DEBUG] audioState:", state.audio);
    var input = { shift: false }; // reliable modifier state for non-event contexts

    normalizeSwarmConfig();
    // Step 5 — state.objects is a non-breaking alias for state.strokes
    // DO NOT replace state.lines / state.shapes / state.balls / state.textObjects
    Object.defineProperty(state, "objects", {
      get: function () {
        return state.strokes;
      },
      set: function (v) {
        state.strokes = v;
      },
      enumerable: false,
    });
    // StyleState — named alias to state.defaults (spec: single source of truth for drawing style)
    var StyleState = state.defaults;

    // ── WOS Mode System ───────────────────────────────────────────────────────
    // Controls whether key input assigns notes or triggers emitters
    window.WOS = window.WOS || {};
    WOS.mode = "assign"; // "assign" | "play"
    WOS.currentNote = state.defaults.note || 60;
    if (!state.defaults.channel) state.defaults.channel = "default";

    WOS.setMode = function (m) {
      WOS.mode = m;
      console.log("[WOS] mode →", m);
    };
    WOS.setNote = function (note) {
      WOS.currentNote = note;
      state.defaults.note = note;
      state.defaults.color = noteToColor(note);
      syncUI();
    };
    // ── End WOS Mode System ───────────────────────────────────────────────────

    // Share state.particles with SBE.ParticleSystem so both systems read the same array
    if (window.SBE && SBE.ParticleSystem) {
      SBE.ParticleSystem.particles = state.particles;
    }

    // Temporary: verify state.particles reference never replaced
    (function () {
      var last = state.particles;
      setInterval(function () {
        if (state.particles !== last) {
          console.warn("[particles] ARRAY REPLACED — reference broken");
          last = state.particles;
        }
      }, 500);
    })();
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
      // Raw canvas pixel position
      var sx = (e.clientX - rect.left) * (canvas.width / rect.width);
      var sy = (e.clientY - rect.top) * (canvas.height / rect.height);
      // Unproject through camera: screen → world
      var cam = state.camera;
      var wx = (sx - canvas.width / 2) / cam.zoom + cam.x;
      var wy = (sy - canvas.height / 2) / cam.zoom + cam.y;
      return { x: wx, y: wy };
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

    // ── Symbol Interaction System ─────────────────────────────────────────────
    // Handles: placement (symbol-place), brush (symbol-brush), and select-mode
    // interaction for SymbolObjects: single/multi/marquee select, move, rotate,
    // scale, z-order. Multi-select uses state.selectedSymbolObjectIds (Set).

    var _symDragLast = null; // last world point during drag
    var _symHandleMode = null; // "move"|"rotate"|"scale"|"marquee"|"brush" for active gesture
    var _symMarquee = null; // { x1, y1, x2, y2 } while marquee drag is live
    var _symBrushLast = null; // last stamp world point for brush spacing check

    // ── Helper: place one symbol at world point pt ────────────────────────────
    function _symPlace(pt, shiftAdd) {
      var SS = global.SBE && global.SBE.SymbolSystem;
      var SOS = global.SBE && global.SBE.SymbolObjectSystem;
      var sym = state.symbols;
      if (!SS || !SOS || !sym.activeSlotKey || !sym.activeSetId) return null;

      // Snap to grid
      var snapped = snapPoint(pt);
      var brushRotation = 0;
      var brushScale = 1;
      if (state.tool === "symbol-brush") {
        var br = state.symbolBrush;
        brushRotation = br.randomRotation * (Math.random() * Math.PI * 2);
        brushScale = 1 + br.randomScale * (Math.random() * 1.0 - 0.5);
      }
      var obj = SOS.createSymbolObject(
        sym.activeSetId,
        sym.activeSlotKey,
        snapped.x,
        snapped.y,
        {
          scale: Math.max(0.05, brushScale),
          rotation: brushRotation,
          paletteOverride: sym.placementPalette || null,
        },
      );
      state.symbolObjects.push(obj);
      if (!shiftAdd) state.selectedSymbolObjectIds = new Set([obj.id]);
      else state.selectedSymbolObjectIds.add(obj.id);
      return obj;
    }

    // ── Helper: get selection handles for current selection ───────────────────
    function _symGetHandles() {
      var SOS = global.SBE && global.SBE.SymbolObjectSystem;
      if (!SOS || !state.selectedSymbolObjectIds.size) return null;
      var b = SOS.getMultiBounds(
        state.symbolObjects,
        state.selectedSymbolObjectIds,
      );
      if (!b) return null;
      var pad = 10;
      return {
        b: b,
        pad: pad,
        corners: [
          [b.minX - pad, b.minY - pad],
          [b.maxX + pad, b.minY - pad],
          [b.minX - pad, b.maxY + pad],
          [b.maxX + pad, b.maxY + pad],
        ],
        rotate: [b.cx, b.minY - pad - 18],
      };
    }

    // ── pointermove ───────────────────────────────────────────────────────────
    canvas.addEventListener("pointermove", function onSymbolMove(e) {
      var SOS = global.SBE && global.SBE.SymbolObjectSystem;
      var pt = getCanvasCoordsLocal(e);

      // Ghost preview for placement modes
      if (state.tool === "symbol-place" || state.tool === "symbol-brush") {
        _symGhost.visible = true;
        _symGhost.wx = pt.x;
        _symGhost.wy = pt.y;
        renderFrame();
        if (!_symHandleMode) return;
      } else {
        _symGhost.visible = false;
      }

      if (!_symHandleMode || !_symDragLast) return;

      var dx = pt.x - _symDragLast.x;
      var dy = pt.y - _symDragLast.y;

      if (_symHandleMode === "brush") {
        // ── Brush stroke — stamp when spacing threshold crossed ─────────────
        var dist = Math.hypot(
          pt.x - (_symBrushLast ? _symBrushLast.x : pt.x),
          pt.y - (_symBrushLast ? _symBrushLast.y : pt.y),
        );
        if (dist >= (state.symbolBrush.spacing || 32)) {
          _symPlace(pt, true);
          _symBrushLast = pt;
          renderFrame();
        }
        _symDragLast = pt;
        return;
      }

      if (_symHandleMode === "marquee") {
        // ── Marquee drag ────────────────────────────────────────────────────
        _symMarquee.x2 = pt.x;
        _symMarquee.y2 = pt.y;
        renderFrame();
        _symDragLast = pt;
        return;
      }

      if (!SOS || !state.selectedSymbolObjectIds.size) return;
      var mb = SOS.getMultiBounds(
        state.symbolObjects,
        state.selectedSymbolObjectIds,
      );
      if (!mb) return;

      if (_symHandleMode === "move") {
        // Grid snap: apply to the whole group delta
        var snappedPt = snapPoint(pt);
        var snappedLast = snapPoint(_symDragLast);
        var sdx = snappedPt.x - snappedLast.x;
        var sdy = snappedPt.y - snappedLast.y;
        SOS.moveGroup(
          state.symbolObjects,
          state.selectedSymbolObjectIds,
          sdx,
          sdy,
        );
      } else if (_symHandleMode === "rotate") {
        var dr = dx * 0.022;
        if (e.shiftKey)
          dr =
            SOS.snapAngle((state._symRotAccum || 0) + dr) -
            (state._symRotAccum || 0);
        state._symRotAccum = (state._symRotAccum || 0) + dr;
        SOS.rotateGroup(
          state.symbolObjects,
          state.selectedSymbolObjectIds,
          dr,
          mb.cx,
          mb.cy,
        );
      } else if (_symHandleMode === "scale") {
        var ds = 1 + dx * 0.012;
        SOS.scaleGroup(
          state.symbolObjects,
          state.selectedSymbolObjectIds,
          ds,
          mb.cx,
          mb.cy,
        );
      }

      _symDragLast = pt;
      renderFrame();
    });

    // ── pointerdown ───────────────────────────────────────────────────────────
    canvas.addEventListener(
      "pointerdown",
      function onSymbolDown(e) {
        var SS = global.SBE && global.SBE.SymbolSystem;
        var SOS = global.SBE && global.SBE.SymbolObjectSystem;
        if (!SS || !SOS) return;

        var pt = getCanvasCoordsLocal(e);

        // ── Placement mode: stamp once, stay in placement mode ─────────────────
        if (state.tool === "symbol-place") {
          if (!state.symbols.activeSlotKey || !state.symbols.activeSetId)
            return;
          _symPlace(pt, false);
          state.tool = "select";
          _symGhost.visible = false;
          syncUI();
          renderFrame();
          e.stopPropagation();
          return;
        }

        // ── Brush mode: begin brush stroke ─────────────────────────────────────
        if (state.tool === "symbol-brush") {
          if (!state.symbols.activeSlotKey || !state.symbols.activeSetId)
            return;
          state.selectedSymbolObjectIds.clear();
          _symPlace(pt, false);
          _symBrushLast = pt;
          _symHandleMode = "brush";
          _symDragLast = pt;
          canvas.setPointerCapture(e.pointerId);
          renderFrame();
          e.stopPropagation();
          return;
        }

        // ── Select mode ────────────────────────────────────────────────────────
        if (state.tool !== "select") return;

        // Handle hit test — check multi-selection handles first
        var handles = _symGetHandles();
        if (handles) {
          var hr = 12;
          // Rotate handle
          if (
            Math.hypot(pt.x - handles.rotate[0], pt.y - handles.rotate[1]) <= hr
          ) {
            _symHandleMode = "rotate";
            _symDragLast = pt;
            state._symRotAccum = 0;
            canvas.setPointerCapture(e.pointerId);
            e.stopPropagation();
            return;
          }
          // Corner scale handles
          for (var ci = 0; ci < handles.corners.length; ci++) {
            if (
              Math.hypot(
                pt.x - handles.corners[ci][0],
                pt.y - handles.corners[ci][1],
              ) <= hr
            ) {
              _symHandleMode = "scale";
              _symDragLast = pt;
              canvas.setPointerCapture(e.pointerId);
              e.stopPropagation();
              return;
            }
          }
        }

        // Object hit test
        var hit = SOS.hitTest(state.symbolObjects, pt.x, pt.y);
        if (hit) {
          if (e.shiftKey) {
            // Shift: toggle additive selection
            if (state.selectedSymbolObjectIds.has(hit.id)) {
              state.selectedSymbolObjectIds.delete(hit.id);
            } else {
              state.selectedSymbolObjectIds.add(hit.id);
            }
          } else if (!state.selectedSymbolObjectIds.has(hit.id)) {
            // Click non-selected: select only this one
            state.selectedSymbolObjectIds = new Set([hit.id]);
          }
          // (clicking already-selected starts move drag)
          _symHandleMode = "move";
          _symDragLast = pt;
          canvas.setPointerCapture(e.pointerId);
          renderFrame();
          e.stopPropagation();
          return;
        }

        // Miss — begin marquee (or clear selection)
        if (!e.shiftKey) state.selectedSymbolObjectIds.clear();
        _symMarquee = { x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y };
        _symHandleMode = "marquee";
        _symDragLast = pt;
        canvas.setPointerCapture(e.pointerId);
        renderFrame();
        // Don't stopPropagation — allows other select handlers to co-exist
      },
      /* capture */ true,
    );

    // ── pointerup ─────────────────────────────────────────────────────────────
    canvas.addEventListener(
      "pointerup",
      function onSymbolUp(e) {
        var SOS = global.SBE && global.SBE.SymbolObjectSystem;

        if (_symHandleMode === "marquee" && _symMarquee && SOS) {
          // Commit marquee selection
          var inRect = SOS.objectsInRect(
            state.symbolObjects,
            _symMarquee.x1,
            _symMarquee.y1,
            _symMarquee.x2,
            _symMarquee.y2,
          );
          if (e.shiftKey) {
            inRect.forEach(function (o) {
              state.selectedSymbolObjectIds.add(o.id);
            });
          } else {
            state.selectedSymbolObjectIds = new Set(
              inRect.map(function (o) {
                return o.id;
              }),
            );
          }
          _symMarquee = null;
        }

        if (_symHandleMode) {
          _symHandleMode = null;
          _symDragLast = null;
          state._symRotAccum = 0;
          renderFrame();
        }
      },
      /* capture */ true,
    );

    canvas.addEventListener("pointerleave", function () {
      if (state.tool === "symbol-place" || state.tool === "symbol-brush") {
        _symGhost.visible = false;
        renderFrame();
      }
    });

    // ── Mop Tool (capture phase) ──

    // Snap to 8 directions (45° increments) when Shift held
    function constrainAngle(start, current) {
      var dx = current.x - start.x;
      var dy = current.y - start.y;
      var angle = Math.atan2(dy, dx);
      var snap = Math.PI / 4;
      var snapped = Math.round(angle / snap) * snap;
      var dist = Math.hypot(dx, dy);
      return {
        x: start.x + Math.cos(snapped) * dist,
        y: start.y + Math.sin(snapped) * dist,
      };
    }

    // ALT — axis lock (horizontal or vertical from start)
    function axisLock(start, current) {
      var dx = current.x - start.x;
      var dy = current.y - start.y;
      if (Math.abs(dx) > Math.abs(dy)) {
        return { x: current.x, y: start.y }; // horizontal
      }
      return { x: start.x, y: current.y }; // vertical
    }

    // Snap angle to nearest increment (default 15° = π/12)
    function snapAngle(angle, increment) {
      if (increment == null) increment = Math.PI / 12;
      return Math.round(angle / increment) * increment;
    }

    // Unified constrain helper (spec: getConstrainedPoint)
    // mode "angle" = 45° snap, mode "axis" = H/V lock
    function getConstrainedPoint(prev, current, mode) {
      if (mode === "axis") return axisLock(prev, current);
      return constrainAngle(prev, current); // default: 45° angle snap
    }

    function ensureSingleWalker(strokeId) {
      var matching = state.walkers.filter(function (w) {
        return w.strokeId === strokeId;
      });
      if (matching.length <= 1) return;
      // Keep the first, remove the rest
      var kept = false;
      state.walkers = state.walkers.filter(function (w) {
        if (w.strokeId !== strokeId) return true;
        if (!kept) {
          kept = true;
          return true;
        }
        return false;
      });
    }

    function invalidateStrokeRuntime(strokeId) {
      // Force walkers to resample on next frame — path reference refreshed in update loop
      state.walkers.forEach(function (w) {
        if (w.strokeId === strokeId) {
          w.t = w.t % 1;
          if (w.t < 0) w.t += 1;
        }
      });
    }

    function moveStroke(stroke, dx, dy) {
      stroke.points = stroke.points.map(function (p) {
        return { x: p.x + dx, y: p.y + dy };
      });
      removeLinesForStroke(stroke.id);
      strokeToLines(stroke);
      invalidateStrokeRuntime(stroke.id);
    }

    function getStrokeBounds(stroke) {
      var pts = stroke.points;
      var minX = pts[0].x,
        maxX = pts[0].x;
      var minY = pts[0].y,
        maxY = pts[0].y;
      for (var i = 1; i < pts.length; i++) {
        if (pts[i].x < minX) minX = pts[i].x;
        if (pts[i].x > maxX) maxX = pts[i].x;
        if (pts[i].y < minY) minY = pts[i].y;
        if (pts[i].y > maxY) maxY = pts[i].y;
      }
      return {
        minX: minX,
        minY: minY,
        maxX: maxX,
        maxY: maxY,
        w: maxX - minX || 1,
        h: maxY - minY || 1,
      };
    }

    function getStrokeCentroid(stroke) {
      var pts = stroke.points;
      var sx = 0,
        sy = 0;
      for (var i = 0; i < pts.length; i++) {
        sx += pts[i].x;
        sy += pts[i].y;
      }
      return { x: sx / pts.length, y: sy / pts.length };
    }

    var HANDLE_R = 7; // hit radius px

    // Returns handle descriptors for a selected stroke
    function getTransformHandles(stroke) {
      var b = getStrokeBounds(stroke);
      var pad = 18;
      var l = b.minX - pad,
        r = b.maxX + pad;
      var t = b.minY - pad,
        bot = b.maxY + pad;
      var cx = (l + r) / 2;
      return {
        // 4 scale corners
        nw: { x: l, y: t, type: "scale", anchor: { x: r, y: bot } },
        ne: { x: r, y: t, type: "scale", anchor: { x: l, y: bot } },
        sw: { x: l, y: bot, type: "scale", anchor: { x: r, y: t } },
        se: { x: r, y: bot, type: "scale", anchor: { x: l, y: t } },
        // rotate handle above top-center
        rotate: { x: cx, y: t - 28, type: "rotate" },
      };
    }

    function hitTestHandles(pt, stroke) {
      var handles = getTransformHandles(stroke);
      var keys = Object.keys(handles);
      for (var i = 0; i < keys.length; i++) {
        var h = handles[keys[i]];
        if (Math.hypot(pt.x - h.x, pt.y - h.y) <= HANDLE_R + 4) {
          return h;
        }
      }
      return null;
    }

    // Scale all points from anchor — width derived from baseWidth * scale (non-destructive)
    function scaleStroke(stroke, anchor, scaleFactor) {
      stroke.points = stroke.points.map(function (p) {
        return {
          x: anchor.x + (p.x - anchor.x) * scaleFactor,
          y: anchor.y + (p.y - anchor.y) * scaleFactor,
        };
      });
      // Task 1+2 — accumulate scale, derive width from baseWidth to prevent drift
      if (!stroke.baseWidth) stroke.baseWidth = stroke.width || 18;
      if (!stroke.scale) stroke.scale = 1;
      stroke.scale *= scaleFactor;
      stroke.width = stroke.baseWidth * stroke.scale;
      // Task 5 — clamp
      stroke.width = Math.max(0.5, Math.min(stroke.width, 100));
      removeLinesForStroke(stroke.id);
      strokeToLines(stroke);
      invalidateStrokeRuntime(stroke.id);
    }

    // Rotate all points around centroid by delta angle
    function rotateStroke(stroke, cx, cy, dAngle) {
      var cos = Math.cos(dAngle);
      var sin = Math.sin(dAngle);
      stroke.points = stroke.points.map(function (p) {
        var dx = p.x - cx;
        var dy = p.y - cy;
        return {
          x: cx + dx * cos - dy * sin,
          y: cy + dx * sin + dy * cos,
        };
      });
      removeLinesForStroke(stroke.id);
      strokeToLines(stroke);
      invalidateStrokeRuntime(stroke.id);
    }

    function commitShapeStroke(closed) {
      var cs = state.penTool.currentStroke;
      if (!cs || cs.points.length < 2) {
        state.penTool.currentStroke = null;
        state.penTool.isDrawing = false;
        state.penTool.previewPoint = null;
        renderFrame();
        return;
      }
      if (closed) {
        cs.points.push({ x: cs.points[0].x, y: cs.points[0].y });
      }
      // Build full stroke object from in-flight buffer
      var stroke = createStrokeObject(cs.points[0].x, cs.points[0].y);
      stroke.points = cs.points.slice();
      // Keep note in sync but DO NOT override color — brush fill is source of truth
      if (window.WOS) {
        stroke.note = WOS.currentNote;
      }
      pushHistory();
      state.strokes.push(stroke);
      state.penTool.currentStroke = null;
      state.penTool.isDrawing = false;
      state.penTool.previewPoint = null;
      analyzeStroke(stroke);
      strokeToLines(stroke); // bridge to collision/sound pipeline
      if (state.tools.brush.walkerEnabled) {
        var w = createWalkerFromStroke(stroke);
        if (w) {
          applyTrail(w, stroke);
          state.walkers.push(w);
        }
      }
      renderFrame();
    }

    // Line mode commit — creates a 2-point stroke
    function commitLineStroke(start, end) {
      var stroke = createStrokeObject(start.x, start.y);
      stroke.points = [
        { x: start.x, y: start.y },
        { x: end.x, y: end.y },
      ];
      if (window.WOS) {
        stroke.note = WOS.currentNote;
      }
      pushHistory();
      state.strokes.push(stroke);
      state.penTool.currentStroke = null;
      state.penTool.isDrawing = false;
      state.penTool.previewPoint = null;
      analyzeStroke(stroke);
      strokeToLines(stroke); // bridge to collision/sound pipeline
      if (state.tools.brush.walkerEnabled) {
        var wl = createWalkerFromStroke(stroke);
        if (wl) {
          applyTrail(wl, stroke);
          state.walkers.push(wl);
        }
      }
      renderFrame();
    }

    // Track pointer-down position for drag-vs-click detection
    var mopDownPt = null;
    var mopDidDrag = false;

    canvas.addEventListener(
      "pointerdown",
      function onMopDown(e) {
        if (state.tool !== "pen" && state.tool !== "select") return;
        // Layer rename isolation — all canvas interaction paused while editing layer name (P5)
        if (state.layersEditingId) return;
        var rawPt = getCanvasCoordsLocal(e);
        var pt = snapPoint(rawPt);
        mopDownPt = rawPt;
        mopDidDrag = false;

        // Handle hit-test — multi-select handles first
        if (
          state.selection.strokeIds &&
          state.selection.strokeIds.size > 1 &&
          !state.selection.groupId
        ) {
          var mIds2 = Array.from(state.selection.strokeIds);
          var mb2 = computeStrokeSetBounds(mIds2);
          if (mb2) {
            var mPad2 = 14,
              HR2 = HANDLE_R || 5;
            var mL2 = mb2.minX - mPad2,
              mR2 = mb2.maxX + mPad2;
            var mT2 = mb2.minY - mPad2,
              mBot2 = mb2.maxY + mPad2;
            var mCx2 = (mL2 + mR2) / 2;
            var mPivot = { x: mCx2, y: (mT2 + mBot2) / 2 };
            var mRotY2 = mT2 - 22;
            var mHandles = [
              { x: mL2, y: mT2, type: "scale", anchor: { x: mR2, y: mBot2 } },
              { x: mR2, y: mT2, type: "scale", anchor: { x: mL2, y: mBot2 } },
              { x: mL2, y: mBot2, type: "scale", anchor: { x: mR2, y: mT2 } },
              { x: mR2, y: mBot2, type: "scale", anchor: { x: mL2, y: mT2 } },
              { x: mCx2, y: mRotY2, type: "rotate" },
            ];
            for (var mi = 0; mi < mHandles.length; mi++) {
              var mh = mHandles[mi];
              if (Math.hypot(rawPt.x - mh.x, rawPt.y - mh.y) <= HR2 + 6) {
                state.transform.active = true;
                state.transform.type = mh.type;
                state.transform.start = rawPt;
                state.transform.targetId = "__multi__";
                state.transform.origin =
                  mh.type === "rotate" ? mPivot : mh.anchor;
                canvas.setPointerCapture(e.pointerId);
                e.stopPropagation();
                return;
              }
            }
          }
        }

        // Handle hit-test — check group handles first, then single-stroke handles
        if (state.selection.groupId) {
          var gb = computeGroupBounds(state.selection.groupId);
          if (gb) {
            var pad = 22;
            var gL = gb.minX - pad,
              gR = gb.maxX + pad;
            var gT = gb.minY - pad,
              gBot = gb.maxY + pad;
            var gCx = (gL + gR) / 2,
              gRotY = gT - 28;
            var gPivot = computePivot(state.groups[state.selection.groupId]);

            var gHandles = [
              { x: gL, y: gT, type: "scale", anchor: { x: gR, y: gBot } },
              { x: gR, y: gT, type: "scale", anchor: { x: gL, y: gBot } },
              { x: gL, y: gBot, type: "scale", anchor: { x: gR, y: gT } },
              { x: gR, y: gBot, type: "scale", anchor: { x: gL, y: gT } },
              { x: gCx, y: gRotY, type: "rotate" },
            ];

            for (var gi = 0; gi < gHandles.length; gi++) {
              var gh = gHandles[gi];
              if (Math.hypot(rawPt.x - gh.x, rawPt.y - gh.y) <= HANDLE_R + 6) {
                state.transform.active = true;
                state.transform.type = gh.type;
                state.transform.start = rawPt;
                state.transform.targetId = state.selection.groupId; // group id
                state.transform.origin =
                  gh.type === "rotate" ? gPivot : gh.anchor;
                state.transform.startAngle = Math.atan2(
                  rawPt.y - gPivot.y,
                  rawPt.x - gPivot.x,
                );
                canvas.setPointerCapture(e.pointerId);
                e.stopPropagation();
                return;
              }
            }
          }
        }

        // Handle hit-test — check scale/rotate handles on selected stroke
        var selectedStroke = state.selection.strokeId
          ? state.strokes.find(function (s) {
              return s.id === state.selection.strokeId;
            })
          : null;
        if (selectedStroke) {
          var handle = hitTestHandles(rawPt, selectedStroke);
          if (handle) {
            var cen = getStrokeCentroid(selectedStroke);
            state.transform.active = true;
            state.transform.type = handle.type;
            state.transform.start = rawPt;
            state.transform.originPt = rawPt;
            state.transform.rotationAccum = 0; // reset on every new transform
            state.transform.targetId = selectedStroke.id;
            state.transform.origin =
              handle.type === "rotate" ? cen : handle.anchor;
            state.transform.startBounds = getStrokeBounds(selectedStroke);
            state.transform.startAngle = Math.atan2(
              rawPt.y - cen.y,
              rawPt.x - cen.x,
            );
            state.transform.startWidth = selectedStroke.width;
            canvas.setPointerCapture(e.pointerId);
            e.stopPropagation();
            return;
          }
        }

        // Selection + transform always take priority — use raw coords for transform precision
        // getStrokeAtPoint() already rejects locked/hidden layer strokes
        var hit = getStrokeAtPoint(rawPt);
        if (hit) {
          state.penTool.isDrawing = false;

          if (e.shiftKey) {
            // Force exit group mode — group+stroke hybrid is never valid
            if (state.selection.groupId) {
              state.selection.groupId = null;
              state.selection.strokeIds.clear();
            }
            // Toggle stroke into multi-select set
            if (state.selection.strokeIds.has(hit.id)) {
              state.selection.strokeIds.delete(hit.id);
            } else {
              state.selection.strokeIds.add(hit.id);
            }
            state.selection.strokeId = hit.id;
            state.selection.groupId = null; // redundant safety — belt and suspenders
            // Sync multiSelection array
            state.multiSelection = Array.from(state.selection.strokeIds).map(
              function (id) {
                return { type: "stroke", id: id };
              },
            );
            syncLegacySelection();
            syncSelectionPanel();
            renderFrame();
            return;
          }

          // If clicking inside an existing multi-select, preserve it and start move
          var isAlreadyMultiSelected =
            state.selection.strokeIds &&
            state.selection.strokeIds.size > 1 &&
            state.selection.strokeIds.has(hit.id);

          if (isAlreadyMultiSelected) {
            // Keep all selected strokes — just activate transform
            state.selection.strokeId = hit.id;
            state.selection.groupId = null;
            state.transform.active = true;
            state.transform.start = rawPt;
            state.transform.targetId = hit.id;
            canvas.setPointerCapture(e.pointerId);
            e.stopPropagation();
            renderFrame();
            return;
          }

          // Normal click — resolve group membership first
          var grp = getGroupForStroke(hit);

          if (grp) {
            // Hard group-only selection — never leak strokeId when group is active
            selectGroupOnly(grp.id);
            state.transform.active = true;
            state.transform.type = "move";
            state.transform.start = rawPt;
            state.transform.originPt = rawPt;
            state.transform.targetId = grp.id;
            canvas.setPointerCapture(e.pointerId);
            e.stopPropagation();
            renderFrame();
            return;
          }

          // Non-group stroke
          selectStrokesOnly([hit.id]);
          state.transform.active = true;
          state.transform.type = "move";
          state.transform.start = rawPt;
          state.transform.originPt = rawPt;
          state.transform.targetId = hit.id;
          canvas.setPointerCapture(e.pointerId);
          e.stopPropagation();
          renderFrame();
          return;
        }

        // No hit — marquee (select tool) or clear (pen tool)
        if (state.tool === "select") {
          // Shift preserves existing selection; plain click clears it
          if (!e.shiftKey) {
            state.selection.strokeId = null;
            state.selection.strokeIds.clear();
            state.selection.groupId = null;
            state.multiSelection = state.multiSelection.filter(function (ev) {
              return ev.type !== "stroke";
            });
            syncSelectionPanel();
          }
          // Begin marquee drag
          state.selectMarquee = {
            x1: rawPt.x,
            y1: rawPt.y,
            x2: rawPt.x,
            y2: rawPt.y,
            shift: !!e.shiftKey,
          };
          canvas.setPointerCapture(e.pointerId);
          return;
        }

        // Pen tool — clear selection before drawing
        if (state.selection.strokeId) {
          state.selection.strokeId = null;
          state.selection.strokeIds.clear();
          state.selection.groupId = null;
          state.multiSelection = state.multiSelection.filter(function (e) {
            return e.type !== "stroke";
          });
          syncSelectionPanel();
        }

        // Select tool — no drawing. All drawing modes below are pen-only.
        if (state.tool !== "pen") return;

        // Place-shape mode — stamp library shape at click point
        if (state.penTool.mode === "place-shape") {
          var libShape = state.penTool.selectedLibraryShape;
          if (libShape) {
            createShapeInstance(libShape, pt);
          }
          e.stopPropagation();
          return;
        }
        if (state.penTool.mode === "shape") {
          var cs = state.penTool.currentStroke;

          if (!cs) {
            state.penTool.currentStroke = { points: [{ x: pt.x, y: pt.y }] };
            state.penTool.isDrawing = true;
          } else {
            var first = cs.points[0];
            var dx = pt.x - first.x;
            var dy = pt.y - first.y;
            if (
              cs.points.length > 2 &&
              Math.sqrt(dx * dx + dy * dy) < state.penTool.shapeCloseThreshold
            ) {
              commitShapeStroke(true);
              e.stopPropagation();
              return;
            }
            var newPt = { x: pt.x, y: pt.y };
            if (e.altKey && cs.points.length > 0) {
              newPt = axisLock(cs.points[cs.points.length - 1], pt);
            } else if (e.shiftKey && cs.points.length > 0) {
              newPt = constrainAngle(cs.points[cs.points.length - 1], pt);
            }
            cs.points.push(newPt);
          }
          state.penTool.previewPoint = pt;
          e.stopPropagation();
          canvas.setPointerCapture(e.pointerId);
          renderFrame();
          return;
        }

        // Line mode — 2-click
        if (state.penTool.mode === "line") {
          var cs = state.penTool.currentStroke;
          if (!cs) {
            state.penTool.currentStroke = { points: [{ x: pt.x, y: pt.y }] };
            state.penTool.isDrawing = true;
          } else {
            var start = cs.points[0];
            var endPt = e.altKey
              ? axisLock(start, pt)
              : e.shiftKey
                ? constrainAngle(start, pt)
                : pt;
            commitLineStroke(start, endPt);
          }
          state.penTool.previewPoint = pt;
          e.stopPropagation();
          canvas.setPointerCapture(e.pointerId);
          renderFrame();
          return;
        }

        // Freehand mode — start stroke immediately
        // Layer lock guard — cannot draw into a locked layer
        if (isActiveLayerLocked()) return;
        state.penTool.isDrawing = true;
        state.penTool.constraintAnchor = { x: pt.x, y: pt.y };
        pushHistory();
        var stroke = createStrokeObject(pt.x, pt.y);
        state.strokes.push(stroke);
        state.penTool.activeStrokeId = stroke.id;
        canvas.setPointerCapture(e.pointerId);
        e.stopPropagation();
        renderFrame();
      },
      true,
    );

    canvas.addEventListener(
      "pointermove",
      function onMopMove(e) {
        if (state.tool !== "pen" && state.tool !== "select") return;
        if (state.layersEditingId) return; // layer rename isolation (P5)

        // Marquee drag — select tool only
        if (
          state.tool === "select" &&
          state.selectMarquee &&
          !state.transform.active
        ) {
          var mqCur = getCanvasCoordsLocal(e);
          state.selectMarquee.x2 = mqCur.x;
          state.selectMarquee.y2 = mqCur.y;
          renderFrame();
          return;
        }

        // Transform — move / scale / rotate selected stroke OR group
        if (state.transform.active) {
          var cur = getCanvasCoordsLocal(e);
          state.cursor.x = cur.x;
          state.cursor.y = cur.y;
          // Safety: if strokeIds is populated, group cannot win (priority rule)
          if (
            state.selection.groupId &&
            state.selection.strokeIds &&
            state.selection.strokeIds.size > 0
          ) {
            state.selection.groupId = null;
          }
          // Group transform only fires if selection still has this group active
          var isGroupTransform =
            !!state.groups[state.transform.targetId] &&
            state.selection.groupId === state.transform.targetId;

          if (isGroupTransform) {
            // Target is a group id — dispatch to group transform functions
            var gid = state.transform.targetId;
            if (state.transform.type === "move") {
              var dx = cur.x - state.transform.start.x;
              var dy = cur.y - state.transform.start.y;
              translateGroup(gid, dx, dy);
              state.transform.start = cur;
            } else if (state.transform.type === "scale") {
              var anchor = state.transform.origin;
              var d0 = Math.hypot(
                state.transform.start.x - anchor.x,
                state.transform.start.y - anchor.y,
              );
              var d1 = Math.hypot(cur.x - anchor.x, cur.y - anchor.y);
              if (d0 > 1) {
                scaleGroup(gid, d1 / d0);
                state.transform.start = cur;
              }
            } else if (state.transform.type === "rotate") {
              var cen = state.transform.origin;
              var rawA = Math.atan2(cur.y - cen.y, cur.x - cen.x);
              var prevA = Math.atan2(
                state.transform.start.y - cen.y,
                state.transform.start.x - cen.x,
              );
              if (input.shift) {
                rawA = snapAngle(rawA);
                prevA = snapAngle(prevA);
              }
              var dA = rawA - prevA;
              state.transform.rotationAccum += dA;
              rotateGroup(gid, dA);
              state.transform.start = cur;
            }
            renderFrame();
            return;
          }

          // __multi__ transform dispatch (must be before stroke lookup — targetId is not a stroke id)
          if (state.transform.targetId === "__multi__") {
            var mIds = Array.from(state.selection.strokeIds || []);
            if (state.transform.type === "move") {
              var dx = cur.x - state.transform.start.x;
              var dy = cur.y - state.transform.start.y;
              mIds.forEach(function (id) {
                var s = getStrokeById(id);
                if (s) moveStroke(s, dx, dy);
              });
              state.transform.start = cur;
            } else if (state.transform.type === "scale") {
              var anchor = state.transform.origin;
              var d0 = Math.hypot(
                state.transform.start.x - anchor.x,
                state.transform.start.y - anchor.y,
              );
              var d1 = Math.hypot(cur.x - anchor.x, cur.y - anchor.y);
              if (d0 > 1) {
                var factor = d1 / d0;
                mIds.forEach(function (id) {
                  var s = getStrokeById(id);
                  if (s) scaleStroke(s, anchor, factor);
                });
                state.transform.start = cur;
              }
            } else if (state.transform.type === "rotate") {
              var cen = state.transform.origin;
              var rawAngle = Math.atan2(cur.y - cen.y, cur.x - cen.x);
              var prevAngle = Math.atan2(
                state.transform.start.y - cen.y,
                state.transform.start.x - cen.x,
              );
              if (input.shift) {
                rawAngle = snapAngle(rawAngle);
                prevAngle = snapAngle(prevAngle);
              }
              var dAngle = rawAngle - prevAngle;
              state.transform.rotationAccum += dAngle;
              mIds.forEach(function (id) {
                var s = getStrokeById(id);
                if (s) rotateStroke(s, cen.x, cen.y, dAngle);
              });
              state.transform.start = cur;
            }
            renderFrame();
            return;
          }

          // Target is a single stroke
          var stroke = state.strokes.find(function (s) {
            return s.id === state.transform.targetId;
          });
          if (stroke) {
            // Only escalate to group transform if group is still the active selection
            var useGroupTransform = !!(
              state.selection.groupId &&
              (!state.selection.strokeIds ||
                state.selection.strokeIds.size === 0)
            );
            if (state.transform.type === "move") {
              var dx = cur.x - state.transform.start.x;
              var dy = cur.y - state.transform.start.y;
              if (useGroupTransform) {
                var grp = getGroupForStroke(stroke);
                if (grp) {
                  translateGroup(grp.id, dx, dy);
                } else {
                  moveStroke(stroke, dx, dy);
                }
              } else {
                moveStroke(stroke, dx, dy);
              }
              state.transform.start = cur;
            } else if (state.transform.type === "scale") {
              var anchor = state.transform.origin;
              var d0 = Math.hypot(
                state.transform.start.x - anchor.x,
                state.transform.start.y - anchor.y,
              );
              var d1 = Math.hypot(cur.x - anchor.x, cur.y - anchor.y);
              if (d0 > 1) {
                var factor = d1 / d0;
                if (useGroupTransform) {
                  var grp = getGroupForStroke(stroke);
                  if (grp) {
                    scaleGroup(grp.id, factor);
                  } else {
                    scaleStroke(stroke, anchor, factor);
                  }
                } else {
                  scaleStroke(stroke, anchor, factor);
                }
                state.transform.start = cur;
              }
            } else if (state.transform.type === "rotate") {
              var cen = state.transform.origin;
              var rawCurAngle = Math.atan2(cur.y - cen.y, cur.x - cen.x);
              var prevAngle = Math.atan2(
                state.transform.start.y - cen.y,
                state.transform.start.x - cen.x,
              );
              if (input.shift) {
                rawCurAngle = snapAngle(rawCurAngle);
                prevAngle = snapAngle(prevAngle);
              }
              var dAngle = rawCurAngle - prevAngle;
              state.transform.rotationAccum += dAngle;
              if (useGroupTransform) {
                var grp = getGroupForStroke(stroke);
                if (grp) {
                  rotateGroup(grp.id, dAngle);
                } else {
                  rotateStroke(stroke, cen.x, cen.y, dAngle);
                }
              } else {
                rotateStroke(stroke, cen.x, cen.y, dAngle);
              }
              state.transform.start = cur;
            }
            renderFrame();
          }
          return;
        }

        if (state.penTool.mode === "shape") {
          if (!state.penTool.isDrawing) return;
          var cur = snapPoint(getCanvasCoordsLocal(e));

          // Drag detection — if dragged past threshold, fall back to freehand for this stroke
          if (mopDownPt && !mopDidDrag) {
            var dd = Math.hypot(cur.x - mopDownPt.x, cur.y - mopDownPt.y);
            if (dd > state.penTool.dragThreshold) {
              mopDidDrag = true;
              // Promote to freehand: commit what we have so far and start a free stroke
              state.penTool.currentStroke = null;
              state.penTool.isDrawing = false;
              state.penTool.mode = "freehand";
              pushHistory();
              var stroke = createStrokeObject(mopDownPt.x, mopDownPt.y);
              state.strokes.push(stroke);
              state.penTool.activeStrokeId = stroke.id;
              // continue into freehand logic below
            }
          }

          if (state.penTool.mode === "shape") {
            // Still in shape mode — update preview point
            var cs = state.penTool.currentStroke;
            if (cs && cs.points.length > 0) {
              var last = cs.points[cs.points.length - 1];
              if (e.altKey) {
                cur = axisLock(last, cur);
              } else if (e.shiftKey) {
                cur = constrainAngle(last, cur);
              }
              state.penTool.previewPoint = cur;
            }
            renderFrame();

            // Draw shape preview overlay
            var ctx = canvas.getContext("2d");
            if (cs && cs.points.length > 0) {
              ctx.save();
              ctx.beginPath();
              var last = cs.points[cs.points.length - 1];
              ctx.moveTo(last.x, last.y);
              ctx.lineTo(cur.x, cur.y);
              ctx.strokeStyle = "rgba(255,255,255,0.4)";
              ctx.lineWidth = 1.5;
              ctx.setLineDash([4, 4]);
              ctx.stroke();
              ctx.setLineDash([]);
              // Close indicator
              var first = cs.points[0];
              var cdx = cur.x - first.x;
              var cdy = cur.y - first.y;
              if (
                cs.points.length > 2 &&
                Math.sqrt(cdx * cdx + cdy * cdy) <
                  state.penTool.shapeCloseThreshold
              ) {
                ctx.beginPath();
                ctx.arc(
                  first.x,
                  first.y,
                  state.penTool.shapeCloseThreshold,
                  0,
                  Math.PI * 2,
                );
                ctx.strokeStyle = "rgba(61,216,197,0.6)";
                ctx.lineWidth = 1.5;
                ctx.stroke();
              }
              ctx.restore();
            }
            return;
          }
          // Fell through to freehand — fall into code below
        }

        if (!state.penTool.activeStrokeId) return;
        var stroke = state.strokes.find(function (s) {
          return s.id === state.penTool.activeStrokeId;
        });
        if (!stroke) return;
        var rawPt = getCanvasCoordsLocal(e);
        state.cursor.x = rawPt.x;
        state.cursor.y = rawPt.y;
        var last = stroke.points[stroke.points.length - 1];

        // Constrained mode: anchor-based straight segment
        if (e.shiftKey || e.altKey) {
          var anchor =
            state.penTool.constraintAnchor || stroke.points[0] || last;
          var constrained = e.shiftKey
            ? constrainAngle(anchor, rawPt)
            : axisLock(anchor, rawPt);
          // Replace stroke with clean 2-point segment — no micro-points, no smoothing
          stroke.points = [
            { x: anchor.x, y: anchor.y },
            { x: constrained.x, y: constrained.y },
          ];
          renderFrame();
          return;
        }

        // Freehand: normal sampling pipeline
        if (last) {
          var dx = rawPt.x - last.x;
          var dy = rawPt.y - last.y;
          var dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 1.5) return;
        }

        var factor = 1 - state.penTool.streamline;
        var finalPt = last ? smoothPoint(last, rawPt, factor) : rawPt;
        stroke.points.push(finalPt);

        renderFrame();
      },
      true,
    );

    // Line mode preview on move (separate listener — no pointer capture needed)
    canvas.addEventListener(
      "pointermove",
      function onPenLineModeMove(e) {
        if (state.tool !== "pen") return;
        if (state.penTool.mode !== "line") return;
        if (!state.penTool.isDrawing) return;
        var cur = snapPoint(getCanvasCoordsLocal(e));
        if (e.altKey) {
          var cs = state.penTool.currentStroke;
          if (cs && cs.points.length > 0) {
            cur = axisLock(cs.points[0], cur);
          }
        } else if (e.shiftKey) {
          var cs = state.penTool.currentStroke;
          if (cs && cs.points.length > 0) {
            cur = constrainAngle(cs.points[0], cur);
          }
        }
        state.penTool.previewPoint = cur;
        renderFrame();
        // Draw line preview overlay
        var cs = state.penTool.currentStroke;
        if (cs && cs.points.length > 0) {
          var ctx = canvas.getContext("2d");
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(cs.points[0].x, cs.points[0].y);
          ctx.lineTo(cur.x, cur.y);
          ctx.strokeStyle = "rgba(255,255,255,0.4)";
          ctx.lineWidth = 1.5;
          ctx.setLineDash([6, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.arc(cs.points[0].x, cs.points[0].y, 4, 0, Math.PI * 2);
          ctx.fillStyle = "#3dd8c5";
          ctx.fill();
          ctx.restore();
        }
      },
      true,
    );

    canvas.addEventListener(
      "dblclick",
      function onMopDblClick(e) {
        if (state.tool !== "pen") return;
        if (state.penTool.mode !== "shape" || !state.penTool.isDrawing) return;
        e.stopPropagation();
        commitShapeStroke(false);
      },
      true,
    );

    canvas.addEventListener(
      "pointerup",
      function onMopUp(e) {
        if (state.tool !== "pen" && state.tool !== "select") return;

        // Commit marquee selection
        if (state.tool === "select" && state.selectMarquee) {
          var mq = state.selectMarquee;
          state.selectMarquee = null;
          var mqW = Math.abs(mq.x2 - mq.x1);
          var mqH = Math.abs(mq.y2 - mq.y1);
          if (mqW > 8 && mqH > 8) {
            var mqL = Math.min(mq.x1, mq.x2),
              mqR = Math.max(mq.x1, mq.x2);
            var mqT = Math.min(mq.y1, mq.y2),
              mqB = Math.max(mq.y1, mq.y2);
            var mqHits = state.strokes.filter(function (s) {
              // Locked or hidden layer — fully non-interactive
              if (isLayerLockedById(s.layerId)) return false;
              if (s.layerId && state.layers) {
                var _mql = state.layers.find(function (l) {
                  return l.id === s.layerId;
                });
                if (_mql && !_mql.visible) return false;
              }
              var b = getStrokeBounds(s);
              if (!b) return false;
              return (
                b.maxX >= mqL && b.minX <= mqR && b.maxY >= mqT && b.minY <= mqB
              );
            });
            if (mqHits.length) {
              if (!mq.shift) {
                state.selection.strokeIds.clear();
                state.selection.groupId = null;
              }
              mqHits.forEach(function (s) {
                state.selection.strokeIds.add(s.id);
              });
              state.selection.strokeId = mqHits[mqHits.length - 1].id;
              state.multiSelection = Array.from(state.selection.strokeIds).map(
                function (id) {
                  return { type: "stroke", id: id };
                },
              );
              syncLegacySelection();
              syncSelectionPanel();
            }
          }
          renderFrame();
          return;
        }

        // Reset transform regardless of mode
        if (state.transform.active) {
          // Record move delta for chained duplication
          if (
            state.transform.type === "move" &&
            state.transform.originPt &&
            state.transform.start
          ) {
            var endPt = state.transform.start; // start is updated to cur on every move
            var oPt = state.transform.originPt;
            var ddx = endPt.x - oPt.x;
            var ddy = endPt.y - oPt.y;
            if (Math.abs(ddx) > 1 || Math.abs(ddy) > 1) {
              state.duplication.dx = ddx;
              state.duplication.dy = ddy;
              state.duplication.rotation = 0;
              state.duplication.scale = 1;
              state.duplication.valid = true;
            }
          } else if (state.transform.type === "rotate") {
            // Record accumulated rotation for chained duplication
            var accum = state.transform.rotationAccum || 0;
            if (Math.abs(accum) > 0.01) {
              state.duplication.dx = 0;
              state.duplication.dy = 0;
              state.duplication.rotation = accum;
              state.duplication.scale = 1;
              state.duplication.valid = true;
            }
          }
          // Rebuild collision lines for moved/rotated/scaled strokes (P3 fix)
          var _tgtId = state.transform.targetId;
          if (_tgtId && _tgtId !== "__multi__") {
            var _tgtStroke = state.strokes.find(function (s) {
              return s.id === _tgtId;
            });
            if (_tgtStroke) strokeToLines(_tgtStroke);
          } else if (_tgtId === "__multi__" && state.selection.strokeIds) {
            state.selection.strokeIds.forEach(function (sid) {
              var _ms = state.strokes.find(function (s) {
                return s.id === sid;
              });
              if (_ms) strokeToLines(_ms);
            });
          }
          if (state.selection.groupId) {
            var _grp = state.groups[state.selection.groupId];
            if (_grp)
              (_grp.strokeIds || []).forEach(function (sid) {
                var _gs = state.strokes.find(function (s) {
                  return s.id === sid;
                });
                if (_gs) strokeToLines(_gs);
              });
          }
          state.transform.active = false;
          state.transform.type = "move";
          state.transform.start = null;
          state.transform.originPt = null;
          state.transform.rotationAccum = 0;
          state.transform.targetId = null;
          state.transform.origin = null;
          state.transform.startBounds = null;
          state.transform.startAngle = null;
          state.transform.startWidth = null;
          return;
        }

        // Shape mode — pointerup does not commit; only dblclick/Enter/close does
        if (state.penTool.mode === "shape") {
          mopDownPt = null;
          return;
        }

        if (!state.penTool.activeStrokeId) return;
        var stroke = state.strokes.find(function (s) {
          return s.id === state.penTool.activeStrokeId;
        });

        // Flick drip burst
        // Flick drip burst disabled — drip system paused, competes with Trail presets
        state.penTool.activeStrokeId = null;
        state.penTool.isDrawing = false;
        state.penTool.constraintAnchor = null;
        mopDownPt = null;

        if (stroke) analyzeStroke(stroke);
        if (stroke && window.WOS) {
          stroke.note = WOS.currentNote;
        }
        // Apply pre-configured render mode
        if (stroke) {
          stroke.renderMode = state.defaultRenderMode || "visible";
          stroke.outlineVisible = stroke.renderMode === "visible";
        }
        // New draw resets duplication delta
        clearDuplicationDelta();

        // ── Stamp stroke.motion.fx from motionBrush at creation time ──
        // Always copied so each stroke owns its trail config independently
        if (stroke) {
          stroke.motion = stroke.motion || {};
          stroke.motion.fx = {
            colorSource:
              (state.motionBrush && state.motionBrush.colorSource) || "note",
            color: (state.motionBrush && state.motionBrush.color) || "#ffffff",
            style: (state.motionBrush && state.motionBrush.style) || "orbit",
            rate: (state.motionBrush && state.motionBrush.rate) || 40,
            spread: (state.motionBrush && state.motionBrush.spread) || 0.3,
            speed:
              (state.motionBrush && state.motionBrush.particleSpeed) || 120,
            size: (state.motionBrush && state.motionBrush.size) || 3,
            life: (state.motionBrush && state.motionBrush.life) || 1,
            type: (state.motionBrush && state.motionBrush.type) || "dot",
          };
          if (state.motionBrush && state.motionBrush.mode) {
            stroke.motion.mode = state.motionBrush.mode;
          }
        }

        // ── Motion autoBake — walker without stored stroke ──
        if (stroke && state.motionBrush && state.motionBrush.enabled) {
          var w = createWalkerFromStroke(stroke);
          if (w) {
            state.walkers.push(w);
            // Remove stroke from state — path is baked into walker
            var si = state.strokes.indexOf(stroke);
            if (si !== -1) state.strokes.splice(si, 1);
          }
          renderFrame();
          return;
        }

        if (stroke) strokeToLines(stroke); // bridge to collision/sound pipeline
        if (stroke && state.tools.brush.walkerEnabled) {
          var wm = createWalkerFromStroke(stroke);
          if (wm) {
            applyTrail(wm, stroke);
            initWalkerGraph(wm, stroke);
            state.walkers.push(wm);
          }
        }

        // ── Auto-select newly drawn stroke → Object inspector shows Behavior panel ──
        if (stroke) {
          state.selection.strokeId = stroke.id;
          state.selection.strokeIds.clear();
          state.selection.strokeIds.add(stroke.id);
          state.selection.groupId = null;
          state.multiSelection = [{ type: "stroke", id: stroke.id }];
          syncLegacySelection();
          syncSelectionPanel();
        }

        renderFrame();
      },
      true,
    );

    // Reset drawing state on pointer leave / cancel (prevents stuck isDrawing)
    canvas.addEventListener("pointerleave", function onPenLeave() {
      if (state.tool !== "pen") return;
      if (state.penTool.mode === "freehand") {
        // Only reset freehand — shape/line keep isDrawing across moves
        if (state.penTool.activeStrokeId) {
          state.penTool.activeStrokeId = null;
          state.penTool.isDrawing = false;
        }
      }
    });

    canvas.addEventListener("pointercancel", function onPenCancel() {
      if (state.tool !== "pen") return;
      state.transform.active = false;
      state.transform.type = "move";
      state.transform.start = null;
      state.transform.targetId = null;
      state.transform.origin = null;
      state.transform.startBounds = null;
      state.transform.startAngle = null;
      state.transform.startWidth = null;
      state.penTool.activeStrokeId = null;
      state.penTool.isDrawing = false;
      state.penTool.currentStroke = null;
      state.penTool.previewPoint = null;
      mopDownPt = null;
      renderFrame();
    });

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
        // Line tool disabled — mop is the primary drawing system
        if (state.tool !== "line") return;
      },
      true,
    );

    canvas.addEventListener(
      "pointermove",
      function onLineToolMove(e) {
        // Line tool disabled
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

    // ── Unified Object Factory (compat layer) ────────────
    function createObject(opts) {
      return {
        id: "obj_" + Math.random().toString(36).slice(2),
        type: opts.type || "stroke",
        points: opts.points || [],
        note: null,
        color: null,
        behavior: null,
        physics: null,
      };
    }

    // Step 3 — note-first identity: note drives color, not the reverse
    function assignNoteToObject(obj, noteClass) {
      obj.note = noteClass;
      obj.color = NOTE_COLORS[NOTE_NAMES[((noteClass % 12) + 12) % 12]] || null;
    }

    function applyTrail(walker, stroke) {
      if (!walker.emitter) walker.emitter = { enabled: false };
      walker.emitter.enabled = !!(stroke && stroke.trailEnabled);
    }

    function createStrokeObject(x, y) {
      var noteClass = ((state.defaults.note % 12) + 12) % 12;
      var base = createObject({ type: "stroke", points: [{ x: x, y: y }] });
      base.note = state.defaults.note || 60; // full MIDI note (pitch intent)
      base.channel = state.defaults.channel || "default"; // voicing role
      base.useScale = true; // opt-out per stroke with stroke.useScale = false
      base.samples = []; // per-stroke instrument buffers (AudioBuffer[])
      // Task 5 — use drawing defaults so inspector color/width feed new strokes
      base.color =
        state.defaults.color ||
        normalizeColor(NOTE_COLORS[NOTE_NAMES[noteClass]]);
      var bw = state.defaults.strokeWidth || 18;
      base.width = bw;
      base.baseWidth = bw;
      base.scale = 1;
      base.drips = [];
      base.specks = [];
      base.inkBudget = 1.0;
      base.isCommitted = false;
      base.renderMode = state.defaultRenderMode || "visible";
      base.outlineVisible = base.renderMode !== "hidden";
      base.behavior = { isMuted: false };
      base.mode = "annotation";
      base.harmony = { role: 0 };
      base.meta = { length: 1, curvature: 0, complexity: 0 };
      base.trailEnabled = !!state.tools.brush.trailEnabled;
      // ── Actor visual layer fields (ActorVisualLayerSystem v1.0.0) ──────────
      base.pathStyle = "none"; // "none"|"solid"|"dotted"|"dashed"|"double"
      base.pathDash = 12; // dash segment length (dotted/dashed)
      base.pathGap = 8; // gap between dashes
      // ── SUBJECT system (replaces TARGET+AVATAR) ──────────────────────────
      base.subjectStyle = "none"; // "none"|"dot"|"arrow"|"glyph"|"image"|"text"
      base.subjectScale = 1.0;
      base.subjectOpacity = 1.0;
      base.subjectVisible = true;
      base.subjectGlyph = null; // "setId:slotKey"
      base.subjectText = null; // for "text" style
      base.subjectImage = null; // data URL for "image" style
      base.subjectColor = null; // tint override; null = use stroke color
      base.layerId =
        state.activeLayerId ||
        (state.layers && state.layers[0] && state.layers[0].id) ||
        null;
      base.trail = {
        enabled: !!state.tools.brush.trailEnabled,
        style: "line",
        length: 1.0,
        color: null, // null = inherit stroke color
        opacity: 0.6,
      };
      base.sound = {
        enabled: true,
        note: null,
        source: state.tools.brush.soundSource || "synth",
        role: state.tools.brush.soundRole || "drum",
        trigger:
          (state.tools.brush.sound && state.tools.brush.sound.trigger) ||
          "continuous",
        midi: {
          note: noteToMidi(
            state.sampler.activeNoteClass,
            state.sampler.activeOctave,
          ),
        },
      };
      base.noteClass = state.sampler.activeNoteClass;
      base.octave = state.sampler.activeOctave;
      base.bankId = state.activeBankId || null;
      return base;
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
          !state.penTool.activeStrokeId ||
          state.penTool.activeStrokeId !== stroke.id
        ) {
          if (stroke.drips.length === 0) {
            stroke.isCommitted = true;
          }
        }
      });
    }

    function renderStrokes(ctx) {
      if (state.view && state.view.showPaths === false) return;
      (state.strokes || []).forEach(function (stroke) {
        // Layer visibility + blend mode gate
        var _strokeLayer = null;
        if (stroke.layerId && state.layers) {
          _strokeLayer = state.layers.find(function (l) {
            return l.id === stroke.layerId;
          });
          if (_strokeLayer && !_strokeLayer.visible) return;
        }
        // Apply layer blend mode for this stroke
        if (
          _strokeLayer &&
          _strokeLayer.blendMode &&
          _strokeLayer.blendMode !== "normal"
        ) {
          ctx.globalCompositeOperation = _strokeLayer.blendMode;
        }
        var pts = stroke.points;

        // Selection highlight — primary selection OR multi-select set OR group membership
        var isSelected =
          stroke.id === state.selection.strokeId ||
          state.selection.strokeIds.has(stroke.id);
        // Also highlight all siblings of a selected group
        if (
          !isSelected &&
          state.selection.groupId &&
          stroke._groupId === state.selection.groupId
        ) {
          isSelected = true;
        }
        if (!isSelected && state.selection.strokeId && stroke._groupId) {
          var selStrokeForGroup = state.strokes.find(function (s) {
            return s.id === state.selection.strokeId;
          });
          isSelected = !!(
            selStrokeForGroup &&
            selStrokeForGroup._groupId &&
            selStrokeForGroup._groupId === stroke._groupId
          );
        }
        // renderMode: "visible" (default) | "ghost" | "hidden"
        var rm =
          stroke.renderMode ||
          (stroke.outlineVisible === false ? "hidden" : "visible");
        // ── Live draw preview (P2/P6 — PathGlyphInspectorFinalization v1.0.0) ──
        // During active drawing ALWAYS show a visible preview skeleton, even when
        // pathStyle === "none" (invisible infrastructure). This gives draw feedback
        // regardless of the final renderMode. After pointerup the final style applies.
        var isActivelyDrawing = stroke.id === state.penTool.activeStrokeId;
        if (isActivelyDrawing) {
          var _dps = stroke.pathStyle;
          var _dpw = stroke.width || 18;
          // Single-point: show a dot at pen-down position
          if (pts.length === 1) {
            ctx.save();
            ctx.fillStyle = stroke.color || "#ffffff";
            ctx.globalAlpha = 0.65;
            ctx.beginPath();
            ctx.arc(pts[0].x, pts[0].y, Math.max(2, _dpw * 0.35), 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            return;
          }
          // Multi-point: always render a preview that mirrors the chosen path style
          ctx.save();
          ctx.strokeStyle = stroke.color || "#ffffff";
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          // Build the curve path once — reused for all style variants
          function _drawPreviewCurve() {
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (var _pi = 1; _pi < pts.length - 1; _pi++) {
              var _pMx = (pts[_pi].x + pts[_pi + 1].x) / 2;
              var _pMy = (pts[_pi].y + pts[_pi + 1].y) / 2;
              ctx.quadraticCurveTo(pts[_pi].x, pts[_pi].y, _pMx, _pMy);
            }
            ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
          }
          if (_dps === "none") {
            // Infrastructure ghost — thin dashed skeleton so artist can see the route
            ctx.lineWidth = Math.max(1, _dpw * 0.12);
            ctx.globalAlpha = 0.38;
            ctx.setLineDash([5, 8]);
            _drawPreviewCurve();
            ctx.stroke();
            ctx.setLineDash([]);
          } else if (!_dps || _dps === "solid") {
            ctx.lineWidth = _dpw;
            ctx.globalAlpha = (stroke.opacity != null ? stroke.opacity : 1) * 0.82;
            _drawPreviewCurve();
            ctx.stroke();
          } else if (_dps === "dotted") {
            // Near-zero dash + round cap = circles sized by stroke width
            ctx.lineWidth = _dpw;
            ctx.globalAlpha = (stroke.opacity != null ? stroke.opacity : 1) * 0.82;
            ctx.setLineDash([0.001, _dpw * 0.8]);
            _drawPreviewCurve();
            ctx.stroke();
            ctx.setLineDash([]);
          } else if (_dps === "dashed") {
            var _dash = stroke.pathDash != null ? stroke.pathDash : _dpw;
            var _gap  = stroke.pathGap  != null ? stroke.pathGap  : _dpw * 0.8;
            ctx.lineWidth = _dpw;
            ctx.globalAlpha = (stroke.opacity != null ? stroke.opacity : 1) * 0.82;
            ctx.setLineDash([_dash, _gap]);
            _drawPreviewCurve();
            ctx.stroke();
            ctx.setLineDash([]);
          } else if (_dps === "double") {
            var _dblOff = _dpw * 0.55;
            ctx.lineWidth = Math.max(1, _dpw * 0.22);
            ctx.globalAlpha = (stroke.opacity != null ? stroke.opacity : 1) * 0.82;
            [_dblOff, -_dblOff].forEach(function(off) {
              ctx.beginPath();
              for (var _ri = 0; _ri < pts.length - 1; _ri++) {
                var _rp0 = pts[_ri], _rp1 = pts[_ri + 1];
                var _rdx = _rp1.x - _rp0.x, _rdy = _rp1.y - _rp0.y;
                var _rlen = Math.hypot(_rdx, _rdy) || 1;
                var _rpx = -_rdy / _rlen * off, _rpy = _rdx / _rlen * off;
                if (_ri === 0) ctx.moveTo(_rp0.x + _rpx, _rp0.y + _rpy);
                ctx.lineTo(_rp1.x + _rpx, _rp1.y + _rpy);
              }
              ctx.stroke();
            });
          }
          ctx.restore();
          // Don't fall through to the static render pipeline during active drawing
          // (would double-render and cause flicker). Return after preview is drawn.
          return;
        }
        if (pts.length >= 2) {
          // Selection halo — always shown for selected strokes regardless of renderMode
          if (isSelected) {
            ctx.save();
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = (stroke.width || 18) + 6;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.globalAlpha = 0.35;
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (var hi = 1; hi < pts.length - 1; hi++) {
              var hmX = (pts[hi].x + pts[hi + 1].x) / 2;
              var hmY = (pts[hi].y + pts[hi + 1].y) / 2;
              ctx.quadraticCurveTo(pts[hi].x, pts[hi].y, hmX, hmY);
            }
            ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
            ctx.stroke();
            ctx.restore();
          }
          // ── Path style rendering (ActorVisualLayerSystem v1.0.0) ────────────
          // pathStyle = undefined|"solid"  → legacy/solid render (backward compat)
          // pathStyle = "none"             → invisible; skeleton when selected
          // pathStyle = "dotted"|"dashed"  → patterned line using stroke width
          // pathStyle = "double"           → two parallel offset strokes
          var ps = stroke.pathStyle; // undefined = legacy solid
          var legacySolid = !ps || ps === "solid";

          if (rm === "visible" || (rm === "hidden" && false)) {
            if (ps === "none") {
              // None style — invisible path; selection skeleton shown above via halo
              // Show faint skeleton when selected so actor path remains identifiable
              if (isSelected) {
                ctx.save();
                ctx.strokeStyle = stroke.color || "#ffffff";
                ctx.lineWidth = Math.max(1, (stroke.width || 18) * 0.12);
                ctx.lineCap = "round";
                ctx.lineJoin = "round";
                ctx.globalAlpha = 0.28;
                ctx.setLineDash([5, 7]);
                ctx.beginPath();
                ctx.moveTo(pts[0].x, pts[0].y);
                for (var _ni = 1; _ni < pts.length - 1; _ni++) {
                  var _nmX = (pts[_ni].x + pts[_ni + 1].x) / 2;
                  var _nmY = (pts[_ni].y + pts[_ni + 1].y) / 2;
                  ctx.quadraticCurveTo(pts[_ni].x, pts[_ni].y, _nmX, _nmY);
                }
                ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.restore();
              }
            } else if (legacySolid) {
              // ── Solid / legacy render ────────────────────────────────────────
              ctx.save();
              ctx.strokeStyle = stroke.color;
              ctx.lineCap = "round";
              ctx.lineJoin = "round";
              var cleanMode = state.debug && state.debug.visualMode === "clean";
              // Apply layer opacity
              var _layerOp = 1.0;
              if (stroke.layerId && state.layers) {
                var _solLay = state.layers.find(function (l) {
                  return l.id === stroke.layerId;
                });
                if (_solLay) _layerOp = _solLay.opacity;
              }
              var baseAlpha = cleanMode
                ? 0.3
                : (stroke.opacity != null ? stroke.opacity : 1) *
                  0.82 *
                  _layerOp;
              var energy = stroke._hitEnergy || 0;
              ctx.lineWidth = (stroke.width || 18) + energy * 8;
              ctx.globalAlpha = Math.min(1, baseAlpha + energy * 0.4);
              if (energy > 0.05) {
                ctx.shadowColor = stroke.color;
                ctx.shadowBlur = energy * 18;
              }
              ctx.beginPath();
              ctx.moveTo(pts[0].x, pts[0].y);
              for (var i = 1; i < pts.length - 1; i++) {
                var midX = (pts[i].x + pts[i + 1].x) / 2;
                var midY = (pts[i].y + pts[i + 1].y) / 2;
                ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
              }
              ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
              ctx.stroke();
              ctx.shadowBlur = 0;
              ctx.restore();
            } else if (ps === "dotted" || ps === "dashed") {
              // ── Dotted / Dashed — full width authority (P7) ─────────────────
              var _w7 = stroke.width || 18;
              var _dash = stroke.pathDash != null ? stroke.pathDash : _w7;
              var _gap  = stroke.pathGap  != null ? stroke.pathGap  : _w7 * 0.8;
              // Dotted: near-zero dash + round cap = circles. Dashed: full dash length.
              var _segLen = ps === "dotted" ? 0.001 : _dash;
              ctx.save();
              ctx.strokeStyle = stroke.color;
              ctx.lineCap = "round";
              ctx.lineJoin = "round";
              ctx.lineWidth = _w7;
              ctx.globalAlpha =
                (stroke.opacity != null ? stroke.opacity : 1) * 0.82;
              ctx.setLineDash([_segLen, _gap]);
              ctx.beginPath();
              ctx.moveTo(pts[0].x, pts[0].y);
              for (var _di = 1; _di < pts.length - 1; _di++) {
                var _dmX = (pts[_di].x + pts[_di + 1].x) / 2;
                var _dmY = (pts[_di].y + pts[_di + 1].y) / 2;
                ctx.quadraticCurveTo(pts[_di].x, pts[_di].y, _dmX, _dmY);
              }
              ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
              ctx.stroke();
              ctx.setLineDash([]);
              ctx.restore();
            } else if (ps === "double") {
              // ── Double — two parallel offset strokes (rail / road / tunnel) ──
              var _dblW = stroke.width || 18;
              var _dblOff = _dblW * 0.55; // centre-to-edge separation
              ctx.save();
              ctx.strokeStyle = stroke.color;
              ctx.lineCap = "round";
              ctx.lineJoin = "round";
              ctx.lineWidth = Math.max(1, _dblW * 0.22);
              ctx.globalAlpha =
                (stroke.opacity != null ? stroke.opacity : 1) * 0.82;
              // Build path twice, offset perpendicular to tangent
              [_dblOff, -_dblOff].forEach(function (off) {
                ctx.beginPath();
                for (var _ri = 0; _ri < pts.length - 1; _ri++) {
                  var _rp0 = pts[_ri],
                    _rp1 = pts[_ri + 1];
                  var _rdx = _rp1.x - _rp0.x,
                    _rdy = _rp1.y - _rp0.y;
                  var _rlen = Math.hypot(_rdx, _rdy) || 1;
                  var _rpx = (-_rdy / _rlen) * off,
                    _rpy = (_rdx / _rlen) * off;
                  if (_ri === 0) ctx.moveTo(_rp0.x + _rpx, _rp0.y + _rpy);
                  ctx.lineTo(_rp1.x + _rpx, _rp1.y + _rpy);
                }
                ctx.stroke();
              });
              ctx.restore();
            }
          }
          // rm === "hidden" → no path draw, walker and selection halo still active
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
        // Reset blend mode after each stroke
        if (
          _strokeLayer &&
          _strokeLayer.blendMode &&
          _strokeLayer.blendMode !== "normal"
        ) {
          ctx.globalCompositeOperation = "source-over";
        }
      });

      // Draw transform handles on selected stroke (suppressed for group/multi-select)
      var selId = state.selection.strokeId;
      var shouldDrawSingleHandles =
        selId &&
        !state.selection.groupId &&
        (!state.selection.strokeIds || state.selection.strokeIds.size <= 1);
      if (shouldDrawSingleHandles) {
        var selStroke = state.strokes.find(function (s) {
          return s.id === selId;
        });
        if (selStroke && selStroke.points.length >= 2) {
          var handles = getTransformHandles(selStroke);
          var hKeys = Object.keys(handles);
          ctx.save();

          // Bounding box
          var b = getStrokeBounds(selStroke);
          var pad = 18;
          ctx.strokeStyle = "rgba(255,255,255,0.25)";
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.strokeRect(
            b.minX - pad,
            b.minY - pad,
            b.w + pad * 2,
            b.h + pad * 2,
          );
          ctx.setLineDash([]);

          // Rotate connector line
          var cx = (b.minX - pad + b.maxX + pad) / 2;
          ctx.beginPath();
          ctx.moveTo(cx, b.minY - pad);
          ctx.lineTo(cx, handles.rotate.y + HANDLE_R);
          ctx.strokeStyle = "rgba(255,255,255,0.25)";
          ctx.stroke();

          // Draw each handle
          hKeys.forEach(function (key) {
            var h = handles[key];
            var isRotate = h.type === "rotate";
            var isActive =
              state.transform.active && state.transform.targetId === selId;
            ctx.beginPath();
            if (isRotate) {
              ctx.arc(h.x, h.y, HANDLE_R, 0, Math.PI * 2);
            } else {
              ctx.rect(
                h.x - HANDLE_R,
                h.y - HANDLE_R,
                HANDLE_R * 2,
                HANDLE_R * 2,
              );
            }
            ctx.fillStyle = isRotate ? "#3dd8c5" : "#ffffff";
            ctx.globalAlpha = isActive ? 1.0 : 0.85;
            ctx.fill();
            ctx.strokeStyle = "rgba(0,0,0,0.4)";
            ctx.lineWidth = 1;
            ctx.stroke();
          });

          ctx.restore();
        }
      }

      // Draw multi-select bounding box + handles when 2+ strokes selected without a group
      if (
        state.selection.strokeIds &&
        state.selection.strokeIds.size > 1 &&
        !state.selection.groupId
      ) {
        var mIds = Array.from(state.selection.strokeIds);
        var mb = computeStrokeSetBounds(mIds);
        if (mb) {
          var mPad = 14;
          var mL = mb.minX - mPad,
            mR = mb.maxX + mPad;
          var mT = mb.minY - mPad,
            mBot = mb.maxY + mPad;
          var mCx = (mL + mR) / 2;
          ctx.save();
          // Dashed bounding box
          ctx.strokeStyle = "rgba(61,216,197,0.4)";
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 6]);
          ctx.strokeRect(mL, mT, mR - mL, mBot - mT);
          ctx.setLineDash([]);
          // Scale corner handles
          var HR = HANDLE_R || 5;
          [
            [mL, mT],
            [mR, mT],
            [mL, mBot],
            [mR, mBot],
          ].forEach(function (c) {
            ctx.beginPath();
            ctx.arc(c[0], c[1], HR, 0, Math.PI * 2);
            ctx.fillStyle = "#ffffff";
            ctx.globalAlpha = 0.85;
            ctx.fill();
            ctx.strokeStyle = "rgba(0,0,0,0.4)";
            ctx.lineWidth = 1;
            ctx.stroke();
          });
          // Rotate handle above centre
          var mRotY = mT - 22;
          ctx.beginPath();
          ctx.moveTo(mCx, mT);
          ctx.lineTo(mCx, mRotY + HR);
          ctx.strokeStyle = "rgba(61,216,197,0.4)";
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(mCx, mRotY, HR, 0, Math.PI * 2);
          ctx.fillStyle = "#3dd8c5";
          ctx.globalAlpha = 0.85;
          ctx.fill();
          ctx.strokeStyle = "rgba(0,0,0,0.4)";
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.restore();
        }
      }

      // ── Marquee select rect ────────────────────────────────────────────────
      if (state.selectMarquee) {
        var _mq = state.selectMarquee;
        var _mqL = Math.min(_mq.x1, _mq.x2),
          _mqT = Math.min(_mq.y1, _mq.y2);
        var _mqW = Math.abs(_mq.x2 - _mq.x1),
          _mqH = Math.abs(_mq.y2 - _mq.y1);
        ctx.save();
        ctx.strokeStyle = "rgba(61,216,197,0.9)";
        ctx.fillStyle = "rgba(61,216,197,0.06)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(_mqL, _mqT, _mqW, _mqH);
        ctx.fillRect(_mqL, _mqT, _mqW, _mqH);
        ctx.setLineDash([]);
        ctx.restore();
      }

      // Ghost preview of next duplicate position (when duplication delta is valid)
      if (
        state.duplication &&
        state.duplication.valid &&
        (Math.abs(state.duplication.dx) > 0.5 ||
          Math.abs(state.duplication.dy) > 0.5)
      ) {
        var ghostTargets = getSelectedStrokeTargets();
        if (ghostTargets.length > 0 && ghostTargets.length <= 8) {
          // cap for perf
          ctx.save();
          ctx.globalAlpha = 0.18;
          ctx.strokeStyle = "#3dd8c5";
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 6]);
          ghostTargets.forEach(function (gs) {
            var gpts = gs.points;
            if (!gpts || gpts.length < 2) return;
            var gdx = state.duplication.dx,
              gdy = state.duplication.dy;
            ctx.beginPath();
            ctx.moveTo(gpts[0].x + gdx, gpts[0].y + gdy);
            for (var gpi = 1; gpi < gpts.length - 1; gpi++) {
              var gmx = (gpts[gpi].x + gpts[gpi + 1].x) / 2 + gdx;
              var gmy = (gpts[gpi].y + gpts[gpi + 1].y) / 2 + gdy;
              ctx.quadraticCurveTo(
                gpts[gpi].x + gdx,
                gpts[gpi].y + gdy,
                gmx,
                gmy,
              );
            }
            ctx.lineTo(
              gpts[gpts.length - 1].x + gdx,
              gpts[gpts.length - 1].y + gdy,
            );
            ctx.stroke();
          });
          ctx.setLineDash([]);
          ctx.restore();
        }
      }

      // Draw group bounding box + handles when a group is selected
      if (state.selection.groupId) {
        var gb = computeGroupBounds(state.selection.groupId);
        if (gb) {
          var pad = 22;
          var gL = gb.minX - pad,
            gR = gb.maxX + pad;
          var gT = gb.minY - pad,
            gBot = gb.maxY + pad;
          var gCx = (gL + gR) / 2;
          ctx.save();

          // Dashed bounding box — teal for group (distinct from single-stroke white)
          ctx.strokeStyle = "rgba(61,216,197,0.5)";
          ctx.lineWidth = 1.5;
          ctx.setLineDash([6, 4]);
          ctx.strokeRect(gL, gT, gR - gL, gBot - gT);
          ctx.setLineDash([]);

          // Corner scale handles
          var gCorners = [
            { x: gL, y: gT },
            { x: gR, y: gT },
            { x: gL, y: gBot },
            { x: gR, y: gBot },
          ];
          gCorners.forEach(function (c) {
            ctx.beginPath();
            ctx.rect(
              c.x - HANDLE_R,
              c.y - HANDLE_R,
              HANDLE_R * 2,
              HANDLE_R * 2,
            );
            ctx.fillStyle = "#3dd8c5";
            ctx.globalAlpha = 0.85;
            ctx.fill();
            ctx.strokeStyle = "rgba(0,0,0,0.4)";
            ctx.lineWidth = 1;
            ctx.stroke();
          });

          // Rotate handle above top-center
          var gRotY = gT - 28;
          ctx.beginPath();
          ctx.moveTo(gCx, gT);
          ctx.lineTo(gCx, gRotY + HANDLE_R);
          ctx.strokeStyle = "rgba(61,216,197,0.35)";
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(gCx, gRotY, HANDLE_R, 0, Math.PI * 2);
          ctx.fillStyle = "#3dd8c5";
          ctx.globalAlpha = 0.85;
          ctx.fill();
          ctx.strokeStyle = "rgba(0,0,0,0.4)";
          ctx.lineWidth = 1;
          ctx.stroke();

          ctx.restore();
        }
      }

      // Render in-flight shape builder currentStroke
      var cs = state.penTool.currentStroke;
      if (cs && cs.points.length > 0) {
        var csColor = noteToColor(state.defaults.note) || "#ffffff";
        ctx.save();
        ctx.strokeStyle = csColor;
        ctx.lineWidth = 18;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.globalAlpha = 0.55;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(cs.points[0].x, cs.points[0].y);
        for (var ci = 1; ci < cs.points.length; ci++) {
          ctx.lineTo(cs.points[ci].x, cs.points[ci].y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        // Draw placed point dots
        ctx.globalAlpha = 0.9;
        cs.points.forEach(function (p, idx) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, idx === 0 ? 5 : 3, 0, Math.PI * 2);
          ctx.fillStyle = idx === 0 ? "#3dd8c5" : csColor;
          ctx.fill();
        });
        ctx.restore();
      }
    }

    // ── PathWalker System ────────────────────────────────

    // ── Music Clock ──────────────────────────────────────

    // ── Behavior Pipeline ────────────────────────────────────────────────────

    function emitParticleFromStroke(stroke, b) {
      if (!stroke.points || stroke.points.length < 2) return;
      var p = stroke.points[Math.floor(stroke.points.length / 2)];
      var vx = b.velocity ? b.velocity.x : 0;
      var vy = b.velocity ? b.velocity.y : -2;
      console.log("[emitter] firing", { x: p.x, y: p.y }, "stroke:", stroke.id);
      var cfg = {
        x: p.x + (Math.random() - 0.5) * 6,
        y: p.y,
        vx: vx + (Math.random() - 0.5) * 0.5,
        vy: vy + (Math.random() - 0.5) * 0.5,
        size: 2,
        life: 1.2,
        color: stroke.color || "#ffffff",
        type: "dot",
      };
      if (window.SBE && SBE.ParticleSystem) {
        SBE.ParticleSystem.spawn(cfg);
      } else {
        state.particles.push(
          Object.assign({ maxLife: cfg.life, _dead: false }, cfg),
        );
      }
      console.log("[particles] count", state.particles.length);
    }

    function getRandomPointOnStroke(stroke) {
      var pts = stroke.points;
      if (!pts || pts.length < 2) return (pts && pts[0]) || { x: 0, y: 0 };
      var i = Math.floor(Math.random() * (pts.length - 1));
      var a = pts[i];
      var b = pts[i + 1];
      var t = Math.random();
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }

    function processEmitter(stroke, b, now) {
      if (!SBE || !SBE.ParticleSystem || !SBE.ParticleSystem.spawn) {
        console.warn("[emitter] ParticleSystem not ready");
        return;
      }
      // Defaults per spec
      var rate = typeof b.rate === "number" ? b.rate : 16;
      var density = typeof b.density === "number" ? b.density : 4;
      var direction = typeof b.direction === "number" ? b.direction : 270;
      var spread = typeof b.spread === "number" ? b.spread : 25;
      var speed = typeof b.speed === "number" ? b.speed : 18;
      var size = typeof b.size === "number" ? b.size : 2;
      var life = typeof b.life === "number" ? b.life : 1.2;
      var style = b.particleType || b.style || "dot";

      if (!b.lastEmit) b.lastEmit = 0;
      if (now - b.lastEmit < rate) return;
      b.lastEmit = now;

      // Spawn `density` particles per emission
      for (var d = 0; d < density; d++) {
        var baseAngle = direction * (Math.PI / 180);
        var spreadRad = spread * (Math.PI / 180);
        var angle = baseAngle + (Math.random() - 0.5) * spreadRad;
        var mag = speed * (0.8 + Math.random() * 0.4);
        var vx = Math.cos(angle) * mag;
        var vy = Math.sin(angle) * mag;

        if (!stroke.points || !stroke.points.length) continue;
        var pos = getRandomPointOnStroke(stroke);

        SBE.ParticleSystem.spawn({
          x: pos.x,
          y: pos.y,
          vx: vx,
          vy: vy,
          size: size,
          life: life,
          color: stroke.color || "#ffffff",
          type: style,
        });
      }
    }

    function processGroupEmitter(group, b, now) {
      if (!b.rate) b.rate = 200;
      if (!b.lastEmit) b.lastEmit = 0;
      if (!b.velocity) b.velocity = { x: 0, y: -2 };
      if (now - b.lastEmit < b.rate) return;
      b.lastEmit = now;
      var strokeIds = getGroupChildrenDeep(group.id);
      strokeIds.forEach(function (id) {
        var stroke = getStrokeById(id);
        if (stroke) emitParticleFromStroke(stroke, b);
      });
    }

    function processBehaviors(now) {
      var emitterCount = 0;
      // Group-level behaviors
      Object.values(state.groups).forEach(function (group) {
        var b = group.behavior;
        if (!b) return;
        if (b.type === "emitter") {
          emitterCount++;
          processGroupEmitter(group, b, now);
        }
      });
      // Stroke-level behaviors
      state.strokes.forEach(function (stroke) {
        var b = stroke.behavior;
        if (!b && stroke.mechanic === "emitter") {
          stroke.behavior = {
            type: "emitter",
            rate: stroke.emit ? stroke.emit.rate : 200,
            lastEmit: 0,
            velocity: stroke.emit ? stroke.emit.velocity : { x: 0, y: -2 },
          };
          delete stroke.mechanic;
          delete stroke.emit;
          b = stroke.behavior;
        }
        if (!b) return;
        if (b.type === "emitter") {
          emitterCount++;
          processEmitter(stroke, b, now);
        }
      });
      if (emitterCount > 0) console.log("[emitter] updating", emitterCount);
    }

    function updateParticles(dt) {
      if (window.SBE && SBE.ParticleSystem) {
        var bounds = {
          minX: -100,
          minY: -100,
          maxX: state.canvas.width + 100,
          maxY: state.canvas.height + 100,
        };
        SBE.ParticleSystem.update(
          dt,
          bounds,
          state.world && state.world.physics ? state.world.physics : null,
        );
      } else {
        // Fallback — inline update (dt in seconds, life in seconds, vx/vy pre-scaled to px/frame)
        state.particles.forEach(function (p) {
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.001; // subtle gravity px/frame
          p.life -= dt; // dt in seconds matches life spawn value
        });
        for (var i = state.particles.length - 1; i >= 0; i--) {
          if (state.particles[i].life <= 0) state.particles.splice(i, 1);
        }
      }
    }

    // ── End Behavior Pipeline ────────────────────────────────────────────────

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
        w.stroke && w.stroke.harmony && w.stroke.harmony.role != null
          ? w.stroke.harmony.role
          : 0;
      var tone = chord[role % chord.length];
      var note = root + tone;
      // Geometry influence — complex strokes add variation
      var complexity =
        (w.stroke && w.stroke.meta && w.stroke.meta.complexity) || 0;
      if (complexity > 0.5) {
        note += Math.floor(Math.random() * 3);
      }
      if (w.music.voice === "bass") note -= 24;
      if (w.music.voice === "lead") note += 12;
      note += (w.music.octave || 0) * 12;
      return note;
    }

    function shouldTrigger(w) {
      var complexity =
        (w.stroke && w.stroke.meta && w.stroke.meta.complexity) || 0;
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
          playNote(36 + Math.floor(Math.random() * 4), 0.8, w.strokeId);
          return;
        }

        var note = mapWalkerToNote(w);
        var velocity = 0.5 + Math.random() * 0.3;
        playNote(note, velocity, w.strokeId);
      });
    }

    // ── FX System (spec 0428_WOS_FXSystem_Unification_v1.0.0) ─────────────────
    var FX_STYLES = {
      orbit: {
        rate: 60,
        spread: 0.1,
        speed: 100,
        size: 2,
        life: 1.5,
        type: "dot",
      },
      comet: {
        rate: 80,
        spread: 0.2,
        speed: 300,
        size: 4,
        life: 0.4,
        type: "streak",
      },
      dust: {
        rate: 120,
        spread: 1.8,
        speed: 40,
        size: 2,
        life: 2.5,
        type: "dot",
      },
      burst: {
        rate: 200,
        spread: 6.28,
        speed: 200,
        size: 5,
        life: 0.5,
        type: "dot",
      },
      ribbon: {
        rate: 30,
        spread: 0.05,
        speed: 80,
        size: 3,
        life: 3.0,
        type: "streak",
      },
    };

    // Read fx from stroke.motion, migrating flat fields if needed (backward compat)
    function getFX(stroke) {
      var m = stroke.motion || {};
      if (m.fx) return m.fx;
      // Migrate flat fields → fx
      var fx = {
        rate: m.rate != null ? m.rate : 40,
        spread: m.spread != null ? m.spread : 0.3,
        speed: m.speed != null ? m.speed : 120,
        size: m.size != null ? m.size : 3,
        life: m.life != null ? m.life : 1.0,
        type: m.type || "dot",
        colorSource: m.colorSource || "note",
        color: m.color || "#ffffff",
        style: null,
      };
      if (!stroke.motion) stroke.motion = {};
      stroke.motion.fx = fx;
      return fx;
    }

    function resolveFXColor(stroke) {
      // stroke.color is always the source of truth unless explicitly overridden with "custom"
      // and fx.color is actually set to something different.
      // If custom color matches stroke color, still shows stroke color (no conflict).
      if (!stroke.motion || !stroke.motion.fx) {
        return stroke.color || "#ffffff";
      }
      var fx = stroke.motion.fx;
      if (
        fx.colorSource === "custom" &&
        fx.color &&
        fx.color !== stroke.color
      ) {
        return fx.color;
      }
      return stroke.color || "#ffffff";
    }

    function applyFXStyle(stroke, style) {
      if (style === "off") {
        // Turn off emitter on all walkers attached to this stroke
        state.walkers.forEach(function (w) {
          if (w.strokeId === stroke.id) w.emitter.enabled = false;
        });
        if (!stroke.motion) stroke.motion = {};
        if (!stroke.motion.fx) stroke.motion.fx = {};
        stroke.motion.fx.style = "off";
        return;
      }
      var base = FX_STYLES[style];
      if (!base) return;
      if (!stroke.motion) stroke.motion = {};
      if (!stroke.motion.fx) stroke.motion.fx = {};
      Object.assign(stroke.motion.fx, base);
      stroke.motion.fx.style = style;
      // Re-enable walker emitter when a real style is chosen
      state.walkers.forEach(function (w) {
        if (w.strokeId === stroke.id) w.emitter.enabled = true;
      });
    }

    // Detect geometric closure: stroke is closed if endpoints are within threshold
    function isStrokeClosed(stroke, threshold) {
      var pts = stroke.points;
      if (!pts || pts.length < 3) return false;
      var dx = pts[0].x - pts[pts.length - 1].x;
      var dy = pts[0].y - pts[pts.length - 1].y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      return dist <= (threshold != null ? threshold : 40);
    }

    function createWalkerFromStroke(stroke) {
      if (!stroke || !stroke.points || stroke.points.length < 2) return null;
      var modeSpeed = {
        loop: 0.0012 * 60,
        pingpong: 0.0035 * 60,
        tunnel: 0.0028 * 60,
      };
      var motionMode =
        (stroke.motion && stroke.motion.mode) ||
        (state.motionBrush && state.motionBrush.mode) ||
        (isStrokeClosed(stroke) ? "loop" : "pingpong");
      var baseSpeed =
        modeSpeed[motionMode] != null
          ? modeSpeed[motionMode]
          : state.walker.speed * 60;
      var wId = "w_" + Math.random().toString(36).slice(2);
      var wIdHash = (function (s) {
        var h = 0;
        for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
        return h;
      })(wId);
      return {
        id: wId,
        _idHash: wIdHash,
        stroke: stroke,
        strokeId: stroke.id,
        color: stroke.color || "#ffffff",
        path: {
          type: "stroke",
          points: stroke.points,
          closed: isStrokeClosed(stroke),
        },
        t: 0,
        dir: 1,
        speed: baseSpeed,
        _speedNormalized: true,
        x: stroke.points[0].x,
        y: stroke.points[0].y,
        trail: [],
        _lastTrailSample: 0,
        motionMode: motionMode,
        motionPlane: "world", // top-down entity — not subject to screen gravity
        fieldInfluence: 1.0, // 0 = immune to flow, 1 = full drift, 2 = highly sensitive
        _driftVx: 0, // accumulated flow drift velocity X
        _driftVy: 0, // accumulated flow drift velocity Y
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
        emitter: (function () {
          // Resolve fx: stroke.motion.fx → getFX migration → motionBrush fallback
          var fx = stroke.motion ? getFX(stroke) : null;
          var mb = state.motionBrush;
          return {
            enabled: true,
            rate: (fx && fx.rate) || (mb && mb.rate) || 40,
            spread: (fx && fx.spread) || (mb && mb.spread) || 0.3,
            speed: (fx && fx.speed) || (mb && mb.particleSpeed) || 120,
            size: (fx && fx.size) || (mb && mb.size) || 3,
            life: (fx && fx.life) || (mb && mb.life) || 1.0,
            type: (fx && fx.type) || (mb && mb.type) || "dot",
            color: stroke.motion ? resolveFXColor(stroke) : "#ffffff",
          };
        })(),
        _emitAcc: 0,
        // ── Walker Avatar (WalkerAvatarSystem v1.0.0) ──────────────────────
        // ISOLATION: fresh object literal per walker — never a shared reference
        avatar: {
          enabled: false,
          mode: "dot", // dot | glyph | blob | pulse | ghost
          glyphId: null, // "setId:slotKey" — per-walker
          scale: 1.0,
          rotationMode: "motion", // none | motion | field
          opacity: 1.0,
          tint: null, // null = use walker color — per-walker
          trailInfluence: 1.0,
          // Physical representation — separable from glyph render
          collider: {
            type: "circle", // "circle" | "box" | "capsule"
            radius: 12, // world-space px — scaled by avatar.scale
            offsetX: 0,
            offsetY: 0,
            enabled: false, // participates in projectile collision when true
          },
        },
      };
    }

    // ── Projectile Walker (ProjectileWalkerMigration v1.0.0) ────────────────
    // Creates a free-physics walker at world position (wx, wy) with velocity (vx, vy).
    // motionMode: "projectile" — bypasses path sampling, driven by physics.
    function createProjectileWalker(wx, wy, vx, vy, opts) {
      opts = opts || {};
      var wId = "w_" + Math.random().toString(36).slice(2);
      var wIdHash = (function (s) {
        var h = 0;
        for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
        return h;
      })(wId);
      return {
        id: wId,
        _idHash: wIdHash,
        stroke: null,
        strokeId: null,
        color: opts.color || "#3dd8c5",
        path: null,
        t: 0,
        dir: 1,
        speed: 0,
        x: wx,
        y: wy,
        trail: [],
        _lastTrailSample: 0,
        motionMode: "projectile", // ← free physics, no path sampling
        motionPlane: opts.motionPlane || "world",
        fieldInfluence: opts.fieldInfluence != null ? opts.fieldInfluence : 1.0,
        _driftVx: 0,
        _driftVy: 0,
        _pathX: wx,
        _pathY: wy,
        physics: {
          vx: vx || 0,
          vy: vy || 0,
          mass: opts.mass != null ? opts.mass : 1.0,
          bounce: opts.bounce != null ? opts.bounce : 0.82,
          friction: opts.friction != null ? opts.friction : 0.992,
          gravityScale: opts.gravityScale != null ? opts.gravityScale : 1.0,
          collisionRadius:
            opts.collisionRadius != null ? opts.collisionRadius : 8,
          maxSpeed: opts.maxSpeed != null ? opts.maxSpeed : 24,
        },
        debug: {
          showPhysics: false,
        },
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
        emitter: {
          enabled: false,
          rate: 40,
          spread: 0.3,
          speed: 120,
          size: 3,
          life: 1.0,
          type: "dot",
          color: opts.color || "#3dd8c5",
        },
        _emitAcc: 0,
        avatar: {
          enabled: false,
          mode: "dot",
          glyphId: null,
          scale: 1.0,
          rotationMode: "motion",
          opacity: 1.0,
          tint: null,
          trailInfluence: 1.0,
          collider: {
            type: "circle",
            radius: 12,
            offsetX: 0,
            offsetY: 0,
            enabled: false,
          },
        },
      };
    }

    // Internal — only called by samplePath
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

    // Single source of truth for all path position sampling
    function samplePath(path, t) {
      if (path.type === "stroke") {
        if (path.closed) {
          // Wrap t for seamless looping on closed strokes
          var wt = t % 1;
          if (wt < 0) wt += 1;
          return getStrokePoint({ points: path.points }, wt);
        }
        return getStrokePoint({ points: path.points }, t);
      }
      if (path.type === "line") {
        var lt = path.closed ? t % 1 : Math.max(0, Math.min(1, t));
        return {
          x: path.a.x + (path.b.x - path.a.x) * lt,
          y: path.a.y + (path.b.y - path.a.y) * lt,
        };
      }
      if (path.type === "circle") {
        var angle = (t % 1) * Math.PI * 2;
        return {
          x: path.cx + Math.cos(angle) * path.r,
          y: path.cy + Math.sin(angle) * path.r,
        };
      }
      // Fallback — treat unknown types as stroke
      return getStrokePoint({ points: path.points }, t);
    }

    function sampleTangent(path, t) {
      var eps = 0.001;
      var p1 = samplePath(path, t);
      var p2 = samplePath(path, t + eps);
      var dx = p2.x - p1.x;
      var dy = p2.y - p1.y;
      var len = Math.sqrt(dx * dx + dy * dy) || 1;
      return { x: dx / len, y: dy / len };
    }

    function spawnParticleUnified(cfg, dt) {
      // Clamp life to sane max — guards against stale particles from old broken system
      if (cfg.life != null) cfg.life = Math.min(cfg.life, 5);
      var hasSBE = !!(
        window.SBE &&
        SBE.ParticleSystem &&
        SBE.ParticleSystem.spawn
      );
      if (hasSBE) {
        SBE.ParticleSystem.spawn(cfg);
      } else {
        var frameScale = dt || 1 / 60;
        var fallback = Object.assign({ maxLife: cfg.life, _dead: false }, cfg);
        fallback.vx = cfg.vx * frameScale;
        fallback.vy = cfg.vy * frameScale;
        state.particles.push(fallback);
      }
    }

    // Path factories — lightweight plain objects, no class
    function createLinePath(a, b, opts) {
      opts = opts || {};
      return { type: "line", a: a, b: b, closed: !!opts.closed };
    }

    function createCirclePath(cx, cy, r) {
      return { type: "circle", cx: cx, cy: cy, r: r, closed: true };
    }

    // Walker factory for non-stroke paths (line, circle)
    function createWalkerOnPath(path, opts) {
      opts = opts || {};
      var rawSpeed = opts.speed != null ? opts.speed : state.walker.speed * 60;
      var w = {
        id: "w_" + Math.random().toString(36).slice(2),
        stroke: null,
        path: path,
        t: opts.t != null ? opts.t : 0,
        dir: 1,
        speed: rawSpeed,
        _speedNormalized: true,
        x: 0,
        y: 0,
        motionMode: opts.motionMode || (path.closed ? "loop" : "pingpong"),
        motionPlane: "world",
        fieldInfluence: opts.fieldInfluence != null ? opts.fieldInfluence : 1.0,
        _driftVx: 0,
        _driftVy: 0,
        lastTriggerT: -1,
        noteOffset: Math.floor(Math.random() * 12),
        music: {
          voice: opts.voice || "lead",
          density: opts.density != null ? opts.density : 0.7,
          octave: 0,
          mute: false,
          lastStep: -1,
          mode: "pingpong",
        },
        emitter: {
          enabled: false, // off by default — enable per-stroke via motionBrush or inspector
          rate: 40,
          spread: 0.3,
          speed: 120,
          size: 3,
          life: 1.0,
        },
        _emitAcc: 0,
      };
      var pos = samplePath(path, w.t);
      w.x = pos.x;
      w.y = pos.y;
      return w;
    }

    // playNote — thin wrapper over dispatchCollisionEvent
    function playNote(note, velocity, strokeId) {
      var quantized =
        state.audio && state.audio.scale && state.audio.scale.enabled
          ? quantizeToScale(
              note,
              state.audio.scale.root,
              state.audio.scale.type,
            )
          : note;
      var resolvedId = strokeId || "playnote_" + note;
      var sourceObject = {
        id: resolvedId,
        strokeId: strokeId || null,
        sound: buildSoundConfig(quantized, state.defaults.midiChannel || 1),
      };
      sourceObject.sound.midi.velocity = Math.round((velocity || 0.6) * 127);
      if (!strokeId) {
        console.error(
          "[FATAL AUDIO] No stroke resolved for sourceId:",
          resolvedId,
        );
      }
      dispatchCollisionEvent(sourceObject);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ── Particle Interaction System ──────────────────────────────────────
    // Particles (walkers, future balls/emitters) interact with any stroke
    // by proximity, not just self-path. Sound ownership stays on strokes.
    // ═══════════════════════════════════════════════════════════════════════

    function distancePointToSegment(px, py, x1, y1, x2, y2) {
      var dx = x2 - x1,
        dy = y2 - y1;
      var lenSq = dx * dx + dy * dy;
      if (lenSq === 0) return Math.hypot(px - x1, py - y1);
      var t = Math.max(
        0,
        Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq),
      );
      return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
    }

    function isNearStroke(px, py, stroke, threshold) {
      if (!stroke || !stroke.points || stroke.points.length < 2) return false;
      var pts = stroke.points;
      for (var i = 0; i < pts.length - 1; i++) {
        if (
          distancePointToSegment(
            px,
            py,
            pts[i].x,
            pts[i].y,
            pts[i + 1].x,
            pts[i + 1].y,
          ) < threshold
        )
          return true;
      }
      return false;
    }

    // ── Synth Roles — fallback sound when no sample is loaded ────────────
    function midiToFreq(note) {
      return 440 * Math.pow(2, (note - 69) / 12);
    }

    // ── AudioEngine — single shared WebAudio context for all WOS sound ─────
    var AudioEngine = {
      ctx: null,
      masterGain: null,
      unlocked: false,

      init: function () {
        if (!this.ctx) {
          var Ctor = window.AudioContext || window.webkitAudioContext;
          if (!Ctor) {
            console.warn("[AUDIO ENGINE] WebAudio unsupported");
            return null;
          }
          this.ctx = new Ctor();
          this.masterGain = this.ctx.createGain();
          this.masterGain.gain.value = 0.85;
          this.masterGain.connect(this.ctx.destination);
          // Sync to state so existing pipeline sees the same context
          state.audio.context = this.ctx;
          state.audio.masterGain = this.masterGain;
        }
        return this.ctx;
      },

      unlock: function () {
        var engine = this;
        var ctx = this.init();
        if (!ctx) return;
        if (ctx.state === "suspended") {
          ctx
            .resume()
            .then(function () {
              engine.unlocked = ctx.state === "running";
              console.log("[AUDIO ENGINE]", ctx.state);
            })
            .catch(function (err) {
              console.warn("[AUDIO ENGINE] resume failed", err);
            });
        } else {
          this.unlocked = ctx.state === "running";
        }
      },

      output: function () {
        this.init();
        return this.masterGain || this.ctx.destination;
      },

      getState: function () {
        this.init();
        return {
          context: this.ctx ? this.ctx.state : "missing",
          unlocked: this.unlocked,
          masterGain: this.masterGain ? this.masterGain.gain.value : null,
        };
      },
    };
    // ── End AudioEngine ───────────────────────────────────────────────────

    function playDrum(note, velocity) {
      var ctx = ensureAudioContext();
      if (!ctx) return;
      var now = ctx.currentTime;
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      var vol = Math.max(0.1, velocity / 127) * 0.8;
      osc.type = "sine";
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.12);
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.connect(gain);
      gain.connect(AudioEngine.output());
      osc.start(now);
      osc.stop(now + 0.2);
    }

    function playBass(note, velocity) {
      var ctx = ensureAudioContext();
      if (!ctx) return;
      var now = ctx.currentTime;
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      var vol = Math.max(0.1, velocity / 127) * 0.6;
      osc.type = "triangle";
      osc.frequency.value = midiToFreq(Math.max(24, Math.min(note, 60)));
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc.connect(gain);
      gain.connect(AudioEngine.output());
      osc.start(now);
      osc.stop(now + 0.5);
    }

    function playLead(note, velocity) {
      var ctx = ensureAudioContext();
      if (!ctx) return;
      var now = ctx.currentTime;
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      var vol = Math.max(0.1, velocity / 127) * 0.45;
      osc.type = "sawtooth";
      osc.frequency.value = midiToFreq(note);
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
      osc.connect(gain);
      gain.connect(AudioEngine.output());
      osc.start(now);
      osc.stop(now + 0.6);
    }

    function playPad(note, velocity) {
      var ctx = ensureAudioContext();
      if (!ctx) return;
      var now = ctx.currentTime;
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      var vol = Math.max(0.05, velocity / 127) * 0.35;
      osc.type = "sine";
      osc.frequency.value = midiToFreq(note);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(vol, now + 0.4);
      gain.gain.linearRampToValueAtTime(0, now + 1.5);
      osc.connect(gain);
      gain.connect(AudioEngine.output());
      osc.start(now);
      osc.stop(now + 1.6);
    }

    function playSynth(stroke, note, velocity) {
      var role = (stroke && stroke.sound && stroke.sound.role) || "drum";
      console.log("[PLAY SYNTH]", role, note, velocity);
      switch (role) {
        case "drum":
          return playDrum(note, velocity);
        case "bass":
          return playBass(note, velocity);
        case "lead":
          return playLead(note, velocity);
        case "pad":
          return playPad(note, velocity);
        default:
          return playDrum(note, velocity); // safety fallback
      }
    }

    function resolveSound(stroke, note, velocity) {
      var src = (stroke.sound && stroke.sound.source) || "synth";
      if (src === "off") return;
      if (src === "sample") return; // event pipeline handles samples — no synth fallback
      playSynth(stroke, note, velocity);
    }
    // ── End Synth Roles ───────────────────────────────────────────────────

    function playTestTone(note, velocity) {
      var ctx = AudioEngine.init();
      if (!ctx) return;
      if (ctx.state !== "running") {
        console.warn("[TEST SOUND] AudioContext not running:", ctx.state);
        return;
      }
      var n = note != null ? note : 60;
      var v = velocity != null ? velocity : 100;
      var freq = 440 * Math.pow(2, (n - 69) / 12);
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(v / 127, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.connect(gain);
      gain.connect(AudioEngine.output());
      osc.start();
      osc.stop(ctx.currentTime + 0.45);
    }

    function exciteStroke(stroke, particle, nowMs) {
      // Rate limit: prevent stacking (90ms gap)
      if (stroke._lastFire && nowMs - stroke._lastFire < 90) return;
      stroke._lastFire = nowMs;
      if (state.debug && state.debug.audioLogs)
        console.log("[CONT]", stroke.id);
      playSound(stroke, particle);
    }

    // Impact hit — called only from processParticleInteractions impact branch
    function exciteStrokeImpact(stroke, particle, nowMs) {
      if (state.debug && state.debug.audioLogs)
        console.log("[IMPACT]", stroke.id);
      playSound(stroke, particle);
    }

    // Shared sound dispatcher — plays based on source only, no trigger branching
    function playSound(stroke, particle) {
      var sound = stroke.sound;
      if (!sound || sound.source === "off") return;
      var note =
        sound.midi && sound.midi.note != null
          ? sound.midi.note
          : stroke.note || 60;
      var velocity =
        sound.midi && sound.midi.velocity != null ? sound.midi.velocity : 100;
      if (sound.source === "synth") {
        playSynth(stroke, note, velocity);
        return;
      }
      if (sound.source === "sample") {
        // Primary: resolve from stroke's assigned bank
        var bankBuffer = resolveSampleFromBank(stroke);
        if (bankBuffer) {
          playBuffer(bankBuffer, velocity / 127);
          return;
        }
        // No bank sample — emit event for legacy sampleMap path
        emitEvent({
          type: "particle",
          sourceId: stroke.id,
          targetId: particle ? particle.strokeId || particle.id : stroke.id,
          energy: velocity / 127,
          channel: "default",
          data: { note: note, velocity: velocity },
        });
        return;
      }
    }

    function processParticleInteractions(particle) {
      var px =
        particle.x != null
          ? particle.x
          : (particle.position && particle.position.x) || 0;
      var py =
        particle.y != null
          ? particle.y
          : (particle.position && particle.position.y) || 0;
      var radius = 40;
      var nowMs = performance.now();
      var MIN_IMPACT_GAP = 120;

      if (!particle._hitCooldowns) particle._hitCooldowns = {};
      if (!particle._lastImpactTime) particle._lastImpactTime = 0;
      var cooldowns = particle._hitCooldowns;

      state.strokes.forEach(function (stroke) {
        if (!stroke || !stroke.points || stroke.points.length < 2) return;
        if (particle.strokeId && stroke.id === particle.strokeId) {
          if (particle.ignoreOwnStroke !== false) return;
        }
        if (!stroke.sound || !stroke.sound.enabled) return;

        var isNear = isNearStroke(px, py, stroke, radius);
        var wasNear = !!cooldowns[stroke.id];
        var trigger = stroke.sound.trigger || "impact";

        // Visual hit energy
        if (isNear) {
          stroke._hitEnergy = 1.0;
          stroke._hitTime = nowMs;
        }

        // ── CONTINUOUS ────────────────────────────────────────────────────
        if (trigger === "continuous") {
          if (isNear) exciteStroke(stroke, particle, nowMs);
          cooldowns[stroke.id] = !!isNear;
        }

        // ── IMPACT ────────────────────────────────────────────────────────
        else {
          if (isNear && !wasNear) {
            if (nowMs - particle._lastImpactTime > MIN_IMPACT_GAP) {
              particle._lastImpactTime = nowMs;
              cooldowns[stroke.id] = true;
              exciteStrokeImpact(stroke, particle, nowMs);
            } else {
              cooldowns[stroke.id] = true; // mark hit, skip audio (too soon)
            }
          } else if (!isNear && wasNear) {
            cooldowns[stroke.id] = false;
          }
        }
      });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ── End Particle Interaction System ─────────────────────────────────
    // ═══════════════════════════════════════════════════════════════════════

    // ── Flow field drift (FlowFieldWalkerDrift v1.0.0) ────────────────────
    // Softly displaces walker position by accumulated environmental velocity.
    // Path traversal (w.t) is authoritative — drift is purely additive & visual.
    // Called AFTER samplePath so w.x/w.y already have base path position.
    function _applyFlowDrift(w, dt) {
      var dp = state.world && state.world.physics;
      if (!dp) return;
      var flow = dp.flow;
      if (!flow || !flow.enabled) return;

      // Active in all plane modes — side worlds support wind/vector/flow fields too.
      var planeMode = dp.mode || "side";
      // (no per-mode gate — field type "none" serves as the off switch)

      // World field vector — position-dependent for orbital fields
      var wf = dp.world;
      if (!wf || wf.fieldType === "none") return;
      var fv;
      if (window.SBE && SBE.FieldVisualizer) {
        fv = SBE.FieldVisualizer.sampleFieldVector(w.x, w.y, dp);
      } else {
        // Fallback: read uniform vector directly
        var _mag = Math.hypot(wf.vectorX || 0, wf.vectorY || 0) || 1;
        fv = { x: (wf.vectorX || 0) / _mag, y: (wf.vectorY || 0) / _mag };
      }
      var fx = fv.x;
      var fy = fv.y;
      if (fx === 0 && fy === 0) return;

      // var strength  = flow.strength  != null ? flow.strength  : 0.015;
      var strength = flow.strength != null ? flow.strength : 0.5; // diagnostic default is stronger to make effect visible without tuning
      var damping = flow.damping != null ? flow.damping : 0.985;
      var influence = w.fieldInfluence != null ? w.fieldInfluence : 1.0;
      var scale = dt * 60; // normalize to 60fps baseline

      // Ensure drift velocity initialized
      if (w._driftVx == null) w._driftVx = 0;
      if (w._driftVy == null) w._driftVy = 0;

      // Accumulate drift velocity from field force
      w._driftVx += fx * strength * influence * scale;
      w._driftVy += fy * strength * influence * scale;

      // Damp — creates fluid terminal-velocity feel, prevents runaway
      w._driftVx *= damping;
      w._driftVy *= damping;

      // Hard cap: max drift speed = 3px/frame to preserve path readability
      var driftMag = Math.hypot(w._driftVx, w._driftVy);
      if (driftMag > 3.0) {
        var inv = 3.0 / driftMag;
        w._driftVx *= inv;
        w._driftVy *= inv;
      }

      // Apply drift to displayed position (additive on top of path position)
      w.x += w._driftVx;
      w.y += w._driftVy;
    }

    function updateWalkerMovement(w, dt) {
      // Refresh path geometry from live stroke — transforms replace stroke.points reference
      if (w.strokeId && w.path && w.path.type === "stroke") {
        var liveStroke = state.strokes.find(function (s) {
          return s.id === w.strokeId;
        });
        if (liveStroke && liveStroke.points !== w.path.points) {
          w.path.points = liveStroke.points;
          w.path.closed = isStrokeClosed(liveStroke);
        }
      }

      // One-time speed normalization for legacy walkers missing the flag
      if (!w._speedNormalized) {
        w.speed = w.speed * 60;
        w._speedNormalized = true;
      }

      // One-time runtime log — fires once per walker to confirm live speed + mode
      if (!w._logged) {
        console.log("[WALKER RUNTIME]", {
          id: w.id,
          strokeId: w.strokeId,
          motionMode: w.motionMode,
          speed: w.speed,
        });
        w._logged = true;
      }

      // Legacy music.mode paths — preserved, dt-normalized
      switch (w.music.mode) {
        case "follow":
          w.t += w.speed * dt;
          w.t = Math.max(0, Math.min(1, w.t));
          break;
        case "random":
          w.t += (Math.random() - 0.5) * 0.05;
          w.t = Math.max(0, Math.min(1, w.t));
          break;
        case "drift":
          w.t += 0.01 * dt + Math.sin(performance.now() * 0.001) * 0.005;
          if (w.t > 1) w.t -= 1;
          if (w.t < 0) w.t += 1;
          break;
        case "pingpong":
        default:
          // Dispatch to motionMode for spec-aligned modes
          var motionMode = w.motionMode || "pingpong";
          if (motionMode === "none") break; // Walker exists but doesn't advance
          if (motionMode === "loop") {
            if (w.path && w.path.closed) {
              w.t += w.speed * dt;
              w.t = w.t % 1;
              if (w.t < 0) w.t += 1;
            } else {
              // Open path — loop doesn't apply, fall back to pingpong
              w.motionMode = "pingpong";
              w.t += w.dir * w.speed * dt;
              if (w.t >= 1 || w.t <= 0) {
                w.dir *= -1;
                w.t = Math.max(0, Math.min(1, w.t));
              }
            }
          } else if (motionMode === "tunnel") {
            // Tunnel: continuous forward traversal, wraps at both ends regardless of closure
            w.dir = 1;
            w.t += w.speed * dt;
            w.t = w.t % 1;
            if (w.t < 0) w.t += 1;
          } else if (motionMode === "once") {
            w.t += w.dir * w.speed * dt;
            w.t = Math.max(0, Math.min(1, w.t));
          } else {
            // pingpong (default)
            w.t += w.dir * w.speed * dt;
            if (w.t >= 1 || w.t <= 0) {
              w.dir *= -1;
              w.t = Math.max(0, Math.min(1, w.t));
            }
          }
          break;
      }

      // ── Projectile walker — free physics, bypasses path sampling ────────────
      if (w.motionMode === "projectile") {
        var ph = w.physics || (w.physics = {});
        var PROJ_SCALE = 60; // matches ball MOTION_SCALE

        // Gravity (world-space — uses same physics plane logic as path walkers)
        var _dp2 = state.world && state.world.physics;
        var _pm2 = (_dp2 && _dp2.mode) || "side";
        if (_pm2 === "side" || _pm2 === "hybrid") {
          var _wDir = (state.world && state.world.direction) || { x: 0, y: 1 };
          var _wStr =
            state.world && Number.isFinite(state.world.strength)
              ? state.world.strength
              : 3;
          ph.vx +=
            _wDir.x *
            _wStr *
            (ph.gravityScale != null ? ph.gravityScale : 1.0) *
            (dt * 60);
          ph.vy +=
            _wDir.y *
            _wStr *
            (ph.gravityScale != null ? ph.gravityScale : 1.0) *
            (dt * 60);
        }

        // Field drift (re-uses _applyFlowDrift via temporary w.vx/vy swap)
        // Field influence stored into w._driftVx/Y which we add to physics vel
        var prevX = w.x,
          prevY = w.y;
        _applyFlowDrift(w, dt);
        var fieldPushX = w.x - prevX;
        var fieldPushY = w.y - prevY;
        // Undo the position mutation from _applyFlowDrift — we'll apply properly
        w.x = prevX;
        w.y = prevY;
        ph.vx += fieldPushX * PROJ_SCALE;
        ph.vy += fieldPushY * PROJ_SCALE;

        // Friction
        var _fr = ph.friction != null ? ph.friction : 0.992;
        ph.vx *= _fr;
        ph.vy *= _fr;

        // Speed cap
        var _mspd = ph.maxSpeed != null ? ph.maxSpeed : 24;
        var _spd = Math.hypot(ph.vx, ph.vy);
        if (_spd > _mspd) {
          var _inv = _mspd / _spd;
          ph.vx *= _inv;
          ph.vy *= _inv;
        }

        // Integrate
        w.x += ph.vx * dt * PROJ_SCALE;
        w.y += ph.vy * dt * PROJ_SCALE;

        w._pathX = w.x;
        w._pathY = w.y;
        return; // skip path sampling, skip drift (already applied)
      }

      // Store position — resolved here, not at render time
      var pos;
      if (w.path) {
        pos = samplePath(w.path, w.t);
      } else {
        pos = getStrokePoint(w.stroke, w.t);
      }
      // Stash direction from previous position for target orientation
      if (w.x != null && w.y != null) {
        w._lastDx = pos.x - w.x;
        w._lastDy = pos.y - w.y;
      }
      w.x = pos.x;
      w.y = pos.y;

      // Stash pure path position for drift debug overlay
      w._pathX = pos.x;
      w._pathY = pos.y;

      // ── Flow field environmental drift ────────────────────────────────────
      _applyFlowDrift(w, dt);

      // Trail sampling — time-throttled to ~80ms intervals for readable residue
      var trailNow = performance.now();
      if (!w.trail) w.trail = [];
      if (trailNow - (w._lastTrailSample || 0) >= 80) {
        w.trail.push({ x: w.x, y: w.y, t: trailNow });
        if (w.trail.length > 16) w.trail.shift();
        w._lastTrailSample = trailNow;
      }

      // ── MIDI Cartridge time-based playback (primary audio path) ───────────
      if (w.strokeId && window.SBE && SBE.MidiImporter) {
        var cartStroke = state.strokes.find(function (s) {
          return s.id === w.strokeId;
        });
        if (cartStroke && cartStroke.midiCartridge) {
          var _tNow = getTransportTime();
          if (state.debug && state.debug.audioLogs) {
            var _cart = state.midiCartridges.find(function (c) {
              return c.id === cartStroke.midiCartridge.cartridgeId;
            });
            var _bpm = _cart ? _cart.bpm || 120 : 120;
            var _beatTime = _cart ? (_tNow * _bpm) / 60 : 0;
            console.log("[MIDI DEBUG]", {
              beatTime: _beatTime.toFixed(3),
              localTime: _cart ? (_beatTime % _cart.length).toFixed(3) : "?",
              cartridgeBeats: _cart ? _cart.length.toFixed(2) : "?",
              bpm: _bpm,
              cursor: cartStroke.midiCartridge.cursor,
            });
          }
          SBE.MidiImporter.tickCartridgeForWalker(
            w,
            cartStroke,
            _tNow,
            state,
            function onCartridgeNote(stroke, note) {
              var safeVelocity = normalizeMidiVelocity(note.velocity);
              var noteClass = ((note.note % 12) + 12) % 12;

              // Visual meter stays alive regardless of audio mute state
              noteActivity[noteClass] = performance.now();
              noteVelocity[noteClass] = safeVelocity / 127;

              if (
                !state.midiPlayback ||
                state.midiPlayback.legacyWalkerAudioEnabled !== true
              ) {
                if (state.debug && state.debug.audioLogs) {
                  console.log("[MIDI LEGACY WALKER MUTED]", {
                    note: note.note,
                    velocity: safeVelocity,
                    strokeId: stroke && stroke.id,
                  });
                }
                return;
              }

              playFallbackInstrument(note.note, safeVelocity);
              if (stroke && stroke.samples && stroke.samples.length > 0) {
                emitEvent({
                  type: "midi",
                  sourceId: stroke.id,
                  energy: safeVelocity / 127,
                  channel: "melodic",
                  useScale: false,
                  data: {
                    note: note.note,
                    velocity: safeVelocity,
                    source: "legacyWalkerMidi",
                  },
                });
              }
            },
          );
          // Sync walker.t to MIDI beat position with pingpong — walker follows transport
          var mc = cartStroke.midiCartridge;
          if (mc) {
            var _syncCart = state.midiCartridges.find(function (c) {
              return c.id === mc.cartridgeId;
            });
            if (_syncCart && _syncCart.length) {
              var _bpmSync = _syncCart.bpm || 120;
              var _beatSync = (_tNow * _bpmSync) / 60;
              var _cycle = Math.floor(_beatSync / _syncCart.length);
              var _phase = _beatSync % _syncCart.length;
              var _fwd = _cycle % 2 === 0;
              var _local = _fwd ? _phase : _syncCart.length - _phase;
              w.t = _local / _syncCart.length; // 0..1, mirrors playhead direction
            }
          }
        }
      }
      // ── Spatial MIDI points — visuals + optional debug audio ──────────────
      if (state.debug && state.debug.midiPointsAudio) {
        triggerMidiPointsForWalker(w);
      }
      // ── End MIDI ──────────────────────────────────────────────────────────

      // ── Particle interactions — walker excites any nearby non-self stroke ──
      processParticleInteractions(w);
      // ── End particle interactions ─────────────────────────────────────────

      w.history = w.history || [];
      w.history.push({ x: w.x, y: w.y });
      if (w.history.length > 100) {
        w.history.shift();
      }

      if (w.emitter && w.emitter.enabled && w.path) {
        // Resolve live FX config — reads from stroke.motion.fx each frame (never cached)
        var liveStrokeForFX = w.strokeId
          ? state.strokes.find(function (s) {
              return s.id === w.strokeId;
            })
          : w.stroke;
        var liveFX =
          liveStrokeForFX && liveStrokeForFX.motion
            ? getFX(liveStrokeForFX)
            : null;
        var e = w.emitter;

        var fxRate = liveFX && liveFX.rate != null ? liveFX.rate : e.rate;
        var fxSpread =
          liveFX && liveFX.spread != null ? liveFX.spread : e.spread;
        var fxSpeed = liveFX && liveFX.speed != null ? liveFX.speed : e.speed;
        var fxSize = liveFX && liveFX.size != null ? liveFX.size : e.size;
        var fxLife = liveFX && liveFX.life != null ? liveFX.life : e.life;
        var fxType = liveFX && liveFX.type ? liveFX.type : e.type || "dot";
        var fxColor = liveStrokeForFX
          ? resolveFXColor(liveStrokeForFX)
          : e.color || "#ffffff";

        w._emitAcc += dt * 60; // fixed rate: ~60 particles/sec
        while (w._emitAcc >= 1) {
          w._emitAcc -= 1;
          var vx = w.vx || 0;
          var vy = w.vy || 0;
          spawnParticleUnified(
            {
              x: w.x - vx * 2,
              y: w.y - vy * 2,
              vx: (Math.random() - 0.5) * 20,
              vy: (Math.random() - 0.5) * 20,
              size: 3,
              life: 0.6,
              color: fxColor,
              type: "dot",
            },
            dt,
          );
        }
      }
    }

    function updateWalkers(dt) {
      if (!state.walker.enabled) return;
      // Decay stroke hit energy each frame
      var now = performance.now();
      state.strokes.forEach(function (stroke) {
        if (!stroke._hitEnergy) return;
        var elapsed = now - (stroke._hitTime || now);
        stroke._hitEnergy = Math.max(0, stroke._hitEnergy - 0.003 * elapsed);
        stroke._hitTime = now;
      });
      state.walkers.forEach(function (w) {
        updateWalkerMovement(w, dt);
      });
    }

    // ── _renderSubject — SUBJECT layer renderer (SubjectAndLayerSystem v1.0.0) ──
    // Renders the symbolic representation at the actor's current world position.
    // style: "none"|"dot"|"arrow"|"glyph"|"image"|"text"
    var _subjectImageCache = {}; // strokeId → HTMLImageElement
    function _renderSubject(
      ctx,
      style,
      scale,
      opacity,
      stroke,
      walker,
      px,
      py,
      color,
      now,
    ) {
      // subjectColor: explicit tint override. For glyphs, null = preserve glyph's own palette.
      // For dot/arrow/text, null = use stroke/walker color (passed in as `color`).
      var _tintColor =
        stroke && stroke.subjectColor ? stroke.subjectColor : null;
      // For non-glyph styles, apply tint or fall back to stroke color
      if (style !== "glyph" && _tintColor) color = _tintColor;
      // Compute orientation from motion
      var angle = 0;
      if (walker.motionMode === "projectile") {
        var _ph = walker.physics || {};
        if (_ph.vx || _ph.vy) angle = Math.atan2(_ph.vy || 0, _ph.vx || 0);
      } else if (walker._lastDx || walker._lastDy) {
        angle = Math.atan2(walker._lastDy || 0, walker._lastDx || 0);
      }

      ctx.save();
      ctx.translate(px, py);
      ctx.globalAlpha = opacity * 0.92;

      if (style === "none") {
        // Minimal placeholder — small + marker, no circles
        var _ps = 3.5 * scale;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.lineCap = "round";
        ctx.globalAlpha = opacity * 0.55;
        ctx.beginPath();
        ctx.moveTo(-_ps, 0);
        ctx.lineTo(_ps, 0);
        ctx.moveTo(0, -_ps);
        ctx.lineTo(0, _ps);
        ctx.stroke();
      } else if (style === "dot") {
        var _dr =
          walker.motionMode === "projectile"
            ? Math.max(
                3,
                (walker.physics && walker.physics.collisionRadius) || 8,
              ) * scale
            : 5 * scale;
        ctx.fillStyle = color;
        ctx.globalAlpha = opacity * 0.92;
        ctx.beginPath();
        ctx.arc(0, 0, _dr, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.globalAlpha = opacity * 0.65;
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(1.5, _dr * 0.4), 0, Math.PI * 2);
        ctx.fill();
      } else if (style === "arrow") {
        ctx.rotate(angle);
        var _ar = 7 * scale;
        ctx.fillStyle = color;
        ctx.globalAlpha = opacity * 0.9;
        ctx.beginPath();
        ctx.moveTo(_ar, 0);
        ctx.lineTo(-_ar * 0.6, -_ar * 0.55);
        ctx.lineTo(-_ar * 0.3, 0);
        ctx.lineTo(-_ar * 0.6, _ar * 0.55);
        ctx.closePath();
        ctx.fill();
      } else if (style === "glyph") {
        var SR = global.WOS && global.WOS.SymbolRenderer;
        var SS = global.SBE && global.SBE.SymbolSystem;
        if (SR && SS && stroke.subjectGlyph) {
          var _parts = stroke.subjectGlyph.split(":");
          var _glyph = SS.getGlyph && SS.getGlyph(_parts[0], _parts[1]);
          if (_glyph && (_glyph.strokes || _glyph.objects)) {
            var _gSize = 48 * scale;
            var _half = _gSize / 2;
            ctx.rotate(angle);
            // Build palette — always inject subjectOpacity so renderGlyph's internal
            // ctx.globalAlpha = p.opacity respects our opacity value (P3/P4 fix).
            var _basePal = _glyph.palette ? Object.assign({}, _glyph.palette) : {};
            var _glyphPalette = Object.assign(_basePal, { opacity: opacity });
            if (_tintColor) {
              _glyphPalette.strokeColor = _tintColor;
              _glyphPalette.fillColor   = _tintColor;
              _glyphPalette.mode        = _glyphPalette.mode || "stroke";
            }
            SR.renderGlyph(ctx, _glyph, -_half, -_half, _gSize, _glyphPalette, {});
          }
        } else {
          // Fallback to dot when no glyph set
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(0, 0, 5 * scale, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (style === "image") {
        var _cacheKey = stroke.id;
        var _img = _subjectImageCache[_cacheKey];
        if (!_img && stroke.subjectImage) {
          _img = new Image();
          _img.onload = function () {
            renderFrame();
          }; // trigger repaint once loaded
          _img.src = stroke.subjectImage;
          _subjectImageCache[_cacheKey] = _img;
        }
        if (_img && _img.complete && _img.naturalWidth) {
          var _iw = 64 * scale,
            _ih = 64 * scale;
          // Preserve aspect ratio
          var _ar = _img.naturalWidth / (_img.naturalHeight || 1);
          if (_ar > 1) {
            _ih = _iw / _ar;
          } else {
            _iw = _ih * _ar;
          }
          ctx.globalAlpha = opacity;
          ctx.drawImage(_img, -_iw / 2, -_ih / 2, _iw, _ih);
        }
      } else if (style === "text") {
        if (stroke.subjectText) {
          var _fontSize = Math.round(12 * scale);
          ctx.font = "600 " + _fontSize + "px sans-serif";
          ctx.fillStyle = color;
          ctx.globalAlpha = opacity;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(stroke.subjectText, 0, 0);
        }
      }

      ctx.restore();
    }

    function drawWalkers(ctx) {
      if (!isLayerVisible("walkers")) return;
      var walkerLayerAlpha = getLayerOpacity("walkers");
      var cleanMode = state.debug && state.debug.visualMode === "clean";
      var now = performance.now();
      var TRAIL_MAX_AGE = 1100; // ms — full trail history window

      ctx.save();
      ctx.globalAlpha = walkerLayerAlpha;
      // Path walkers + projectile walkers — unified render pipeline
      var _allWalkers = state.walkers.concat(state.projectileWalkers || []);
      _allWalkers.forEach(function (w) {
        var px = w.x != null ? w.x : 0;
        var py = w.y != null ? w.y : 0;
        var walkerColor = w.color || (w.stroke && w.stroke.color) || "#3dd8c5";
        var speedNorm = Math.min(1, (w.speed || 0) / 0.25);
        var _walkerLayer = null; // resolved below if walker has a layer

        // ── Motion Trail — architectural residue, drawn first ────────────────
        var trail = w.trail;
        if (trail && trail.length > 1) {
          ctx.save();
          for (var ti = 0; ti < trail.length; ti++) {
            var pt = trail[ti];
            var age = now - pt.t;
            if (age > TRAIL_MAX_AGE) continue;
            var frac = 1 - age / TRAIL_MAX_AGE;
            ctx.globalAlpha = 0.02 + frac * 0.2;
            ctx.fillStyle = walkerColor;
            // 2×2 square marks — segmented infrastructure aesthetic
            ctx.fillRect(pt.x - 1, pt.y - 1, 2, 2);
          }
          ctx.restore();
        }

        // ── Playhead Halo — electrical pressure, drawn before core ──────────
        (function () {
          var idHash = w._idHash || 0;
          var pulse =
            0.65 +
            Math.sin(now * 0.008 + (idHash % 1000) * 0.0063) * 0.12 +
            speedNorm * 0.22;
          var _bodyR = (w.physics && w.physics.collisionRadius) || 8;
          var haloRadius = _bodyR * 1.6 + speedNorm * _bodyR * 0.5;
          var haloAlpha = pulse * 0.18;
          try {
            var hrd = ctx.createRadialGradient(px, py, 0, px, py, haloRadius);
            hrd.addColorStop(0, walkerColor);
            hrd.addColorStop(1, "transparent");
            ctx.save();
            ctx.globalAlpha = haloAlpha;
            ctx.fillStyle = hrd;
            ctx.beginPath();
            ctx.arc(px, py, haloRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          } catch (e) {}
        })();

        // ── Walker core / avatar rendering ──────────────────────────────────
        (function () {
          var av = w.avatar;
          // avatar.style is the authoritative render field (migrated from avatar.mode)
          if (av && av.mode && !av.style) {
            av.style = av.mode;
            delete av.mode;
          }
          var avatarActive =
            av && av.enabled && av.style && av.style !== "none";

          // ── SUBJECT layer — symbolic visual representation ────────────────
          // New SUBJECT system takes priority over legacy avatar/target.
          // Falls through to legacy rendering only if subjectStyle is absent (old scenes).
          if (!avatarActive) {
            var _srcStroke = w.strokeId
              ? state.strokes.find(function (s) {
                  return s.id === w.strokeId;
                })
              : null;

            // Check layer visibility + blend mode
            if (_srcStroke && _srcStroke.layerId) {
              _walkerLayer =
                (state.layers &&
                  state.layers.find(function (l) {
                    return l.id === _srcStroke.layerId;
                  })) ||
                null;
              if (_walkerLayer && !_walkerLayer.visible) {
                return;
              }
              if (
                _walkerLayer &&
                _walkerLayer.blendMode &&
                _walkerLayer.blendMode !== "normal"
              ) {
                ctx.globalCompositeOperation = _walkerLayer.blendMode;
              }
            }

            // SUBJECT system (new) — takes priority when subjectStyle is defined
            if (_srcStroke && _srcStroke.subjectStyle !== undefined) {
              var _subStyle = _srcStroke.subjectStyle || "none";
              var _subScale =
                _srcStroke.subjectScale != null ? _srcStroke.subjectScale : 1.0;
              var _subOpacity =
                _srcStroke.subjectOpacity != null
                  ? _srcStroke.subjectOpacity
                  : 1.0;
              var _subVisible = _srcStroke.subjectVisible !== false;
              if (_subVisible) {
                _renderSubject(
                  ctx,
                  _subStyle,
                  _subScale,
                  _subOpacity,
                  _srcStroke,
                  w,
                  px,
                  py,
                  walkerColor,
                  now,
                );
              }
              return;
            }

            // Legacy TARGET / dot render (old scenes without subjectStyle)
            var _tStyle =
              (_srcStroke && _srcStroke.targetStyle) ||
              (w.motionMode === "projectile" ? "dot" : "crosshair");
            var _tScale =
              _srcStroke && _srcStroke.targetScale != null
                ? _srcStroke.targetScale
                : 1.0;
            var _tVisible = _srcStroke
              ? _srcStroke.targetVisible !== false
              : true;

            if (_tVisible && _tStyle !== "none") {
              // Compute target orientation from motion direction
              var _tAngle = 0;
              if (w.motionMode === "projectile") {
                var _ph = w.physics || {};
                if (_ph.vx || _ph.vy)
                  _tAngle = Math.atan2(_ph.vy || 0, _ph.vx || 0);
              } else if (w._lastDx || w._lastDy) {
                _tAngle = Math.atan2(w._lastDy || 0, w._lastDx || 0);
              }

              ctx.save();
              ctx.translate(px, py);
              if (_tAngle) ctx.rotate(_tAngle);
              ctx.globalAlpha = 0.88;

              if (_tStyle === "crosshair") {
                // ── Crosshair reticle — communicates targeting + orientation ──
                var _cr = 6 * _tScale,
                  _cg = 2.2 * _tScale;
                ctx.strokeStyle = walkerColor;
                ctx.lineWidth = 1.3;
                ctx.lineCap = "round";
                ctx.beginPath();
                ctx.moveTo(-_cr, 0);
                ctx.lineTo(-_cg, 0);
                ctx.moveTo(_cg, 0);
                ctx.lineTo(_cr, 0);
                ctx.moveTo(0, -_cr);
                ctx.lineTo(0, -_cg);
                ctx.moveTo(0, _cg);
                ctx.lineTo(0, _cr);
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(0, 0, _cr * 0.65, 0, Math.PI * 2);
                ctx.globalAlpha = 0.35;
                ctx.stroke();
              } else if (_tStyle === "dot") {
                // ── Simple dot — legacy / fallback ────────────────────────────
                var _dr =
                  w.motionMode === "projectile"
                    ? Math.max(
                        3,
                        (w.physics && w.physics.collisionRadius) || 8,
                      ) * _tScale
                    : 5 * _tScale;
                ctx.fillStyle = walkerColor;
                ctx.beginPath();
                ctx.arc(0, 0, _dr, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = "#ffffff";
                ctx.globalAlpha = 0.7;
                ctx.beginPath();
                ctx.arc(0, 0, Math.max(1.5, _dr * 0.4), 0, Math.PI * 2);
                ctx.fill();
              } else if (_tStyle === "ring") {
                // ── Ring — motion pulse ring ───────────────────────────────────
                var _rr = 7 * _tScale;
                ctx.strokeStyle = walkerColor;
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(0, 0, _rr, 0, Math.PI * 2);
                ctx.stroke();
                ctx.globalAlpha = 0.5;
                ctx.beginPath();
                ctx.arc(0, 0, _rr * 0.45, 0, Math.PI * 2);
                ctx.fillStyle = walkerColor;
                ctx.fill();
              } else if (_tStyle === "arrow") {
                // ── Arrow — directional indicator ─────────────────────────────
                var _ar = 7 * _tScale;
                ctx.strokeStyle = walkerColor;
                ctx.fillStyle = walkerColor;
                ctx.lineWidth = 1.3;
                ctx.beginPath();
                ctx.moveTo(_ar, 0);
                ctx.lineTo(-_ar * 0.6, -_ar * 0.55);
                ctx.lineTo(-_ar * 0.3, 0);
                ctx.lineTo(-_ar * 0.6, _ar * 0.55);
                ctx.closePath();
                ctx.fill();
              } else if (_tStyle === "locator") {
                // ── Locator — map pin with dot ────────────────────────────────
                var _lr = 5 * _tScale;
                ctx.strokeStyle = walkerColor;
                ctx.fillStyle = walkerColor;
                ctx.lineWidth = 1.3;
                ctx.beginPath();
                ctx.arc(0, 0, _lr, 0, Math.PI * 2);
                ctx.globalAlpha = 0.25;
                ctx.fill();
                ctx.globalAlpha = 0.88;
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(0, 0, _lr * 0.35, 0, Math.PI * 2);
                ctx.fill();
              }

              ctx.restore();
            }
            return;
          }

          // ── Avatar rendering ─────────────────────────────────────────────
          var avColor = av.tint || walkerColor;
          var avScale = av.scale != null ? av.scale : 1.0;
          var avOpacity =
            (av.opacity != null ? av.opacity : 1.0) * walkerLayerAlpha;

          // Rotation angle — computed before save/translate
          var avAngle = 0;
          if (av.rotationMode === "motion") {
            var dvx = w._driftVx || 0,
              dvy = w._driftVy || 0;
            var spd = w.speed || 0;
            // Prefer drift velocity (shows field influence), fall back to path direction
            if (Math.abs(dvx) > 0.01 || Math.abs(dvy) > 0.01) {
              avAngle = Math.atan2(dvy, dvx);
            } else {
              // Approximate path direction from recent trail
              var tr = w.trail;
              if (tr && tr.length >= 2) {
                var ta = tr[tr.length - 1],
                  tb = tr[tr.length - 2];
                avAngle = Math.atan2(ta.y - tb.y, ta.x - tb.x);
              }
            }
          } else if (av.rotationMode === "field") {
            var dp = state.world && state.world.physics;
            if (dp && window.SBE && SBE.FieldVisualizer) {
              var fv = SBE.FieldVisualizer.sampleFieldVector(px, py, dp);
              avAngle = Math.atan2(fv.y, fv.x);
            }
          }

          var avMode = av.style;

          // ── Dot mode — simple filled circle avatar ────────────────────────
          if (avMode === "dot") {
            var _dr2 = 5 * avScale;
            ctx.save();
            ctx.globalAlpha = avOpacity;
            ctx.beginPath();
            ctx.arc(px, py, _dr2, 0, Math.PI * 2);
            ctx.fillStyle = "#ffffff";
            ctx.fill();
            ctx.beginPath();
            ctx.arc(px, py, Math.max(1, _dr2 - 2), 0, Math.PI * 2);
            ctx.fillStyle = avColor;
            ctx.fill();
            ctx.restore();
          }

          // ── Glyph mode ───────────────────────────────────────────────────
          // Fallback chain: requested glyph → first glyph in same set
          //                 → first glyph in any set → blob → dot
          // avColor is recomputed from av.tint every frame — no caching.
          if (avMode === "glyph") {
            var SR = global.WOS && global.WOS.SymbolRenderer;
            var SS = global.SBE && global.SBE.SymbolSystem;
            if (!SR || !SS) {
              avMode = "blob";
            } else {
              var glyphRef = av.glyphId; // "setId:slotKey" — isolated to this walker
              var glyph = null;
              var _glyphFound = false;

              // 1. Requested glyph
              if (glyphRef && glyphRef.indexOf(":") !== -1) {
                var _parts = glyphRef.split(":");
                var _reqGlyph = SS.getGlyph(_parts[0], _parts[1]);
                if (
                  _reqGlyph &&
                  ((_reqGlyph.strokes && _reqGlyph.strokes.length) ||
                    (_reqGlyph.objects && _reqGlyph.objects.length))
                ) {
                  glyph = _reqGlyph;
                  _glyphFound = true;
                }
              }

              // 2. Fallback: first usable glyph in the same set (by setId)
              if (!_glyphFound && glyphRef && glyphRef.indexOf(":") !== -1) {
                var _fbSetId = glyphRef.split(":")[0];
                var _fbSet = SS.getSet ? SS.getSet(_fbSetId) : null;
                if (_fbSet && _fbSet.glyphs) {
                  var _fbKeys = Object.keys(_fbSet.glyphs);
                  for (var _fi = 0; _fi < _fbKeys.length; _fi++) {
                    var _fbG = _fbSet.glyphs[_fbKeys[_fi]];
                    if (
                      _fbG &&
                      ((_fbG.strokes && _fbG.strokes.length) ||
                        (_fbG.objects && _fbG.objects.length))
                    ) {
                      glyph = _fbG;
                      _glyphFound = true;
                      console.warn(
                        "[AVATAR GLYPH FALLBACK] slot not found in set, using first available:",
                        _fbKeys[_fi],
                      );
                      break;
                    }
                  }
                }
              }

              // 3. Fallback: first usable glyph in any loaded set
              if (!_glyphFound) {
                var _allSets = SS.getAllSets ? SS.getAllSets() : [];
                outer: for (var _si = 0; _si < _allSets.length; _si++) {
                  var _aSet = _allSets[_si];
                  if (!_aSet || !_aSet.glyphs) continue;
                  var _aKeys = Object.keys(_aSet.glyphs);
                  for (var _ai = 0; _ai < _aKeys.length; _ai++) {
                    var _aG = _aSet.glyphs[_aKeys[_ai]];
                    if (
                      _aG &&
                      ((_aG.strokes && _aG.strokes.length) ||
                        (_aG.objects && _aG.objects.length))
                    ) {
                      glyph = _aG;
                      _glyphFound = true;
                      console.warn(
                        "[AVATAR GLYPH FALLBACK] no set match, using first available glyph from any set",
                      );
                      break outer;
                    }
                  }
                }
              }

              if (glyph) {
                var glyphSize = 48 * avScale;
                var half = glyphSize / 2;
                // avColor recomputed fresh every frame — tint changes take effect immediately
                var pal = [avColor, avColor, avColor];
                ctx.save();
                ctx.globalAlpha = avOpacity;
                ctx.translate(px, py);
                if (avAngle) ctx.rotate(avAngle);
                SR.renderGlyph(ctx, glyph, -half, -half, glyphSize, pal, {});
                ctx.restore();
              } else {
                // 4. Blob — only if truly no glyph anywhere
                console.warn(
                  "[AVATAR GLYPH FALLBACK] no glyphs available — rendering blob",
                );
                avMode = "blob";
              }
            }
          }

          // ── Blob mode ────────────────────────────────────────────────────
          if (avMode === "blob") {
            var blobR = 18 * avScale;
            try {
              var bg = ctx.createRadialGradient(px, py, 0, px, py, blobR);
              bg.addColorStop(0, avColor);
              bg.addColorStop(0.5, avColor);
              bg.addColorStop(1, "transparent");
              ctx.save();
              ctx.globalAlpha = avOpacity * 0.85;
              ctx.fillStyle = bg;
              ctx.beginPath();
              ctx.arc(px, py, blobR, 0, Math.PI * 2);
              ctx.fill();
              ctx.restore();
            } catch (e) {}
          }

          // ── Pulse mode ───────────────────────────────────────────────────
          if (avMode === "pulse") {
            var pPhase =
              (now * 0.004 + (w._idHash || 0) * 0.001) % (Math.PI * 2);
            var pR = (14 + Math.sin(pPhase) * 6) * avScale;
            var pInner = pR * 0.35;
            try {
              var pg = ctx.createRadialGradient(px, py, pInner, px, py, pR);
              pg.addColorStop(0, avColor);
              pg.addColorStop(0.6, avColor);
              pg.addColorStop(1, "transparent");
              ctx.save();
              ctx.globalAlpha = avOpacity * (0.6 + Math.sin(pPhase) * 0.3);
              ctx.fillStyle = pg;
              ctx.beginPath();
              ctx.arc(px, py, pR, 0, Math.PI * 2);
              ctx.fill();
              // Hard core
              ctx.globalAlpha = avOpacity;
              ctx.fillStyle = avColor;
              ctx.beginPath();
              ctx.arc(px, py, pInner, 0, Math.PI * 2);
              ctx.fill();
              ctx.restore();
            } catch (e) {}
          }

          // ── Ghost mode ───────────────────────────────────────────────────
          if (avMode === "ghost") {
            var gR = 22 * avScale;
            try {
              var gg = ctx.createRadialGradient(px, py, 0, px, py, gR);
              gg.addColorStop(0, avColor);
              gg.addColorStop(1, "transparent");
              ctx.save();
              ctx.globalAlpha = avOpacity * 0.35;
              ctx.fillStyle = gg;
              ctx.beginPath();
              ctx.arc(px, py, gR, 0, Math.PI * 2);
              ctx.fill();
              // Faint ring
              ctx.globalAlpha = avOpacity * 0.15;
              ctx.strokeStyle = avColor;
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.arc(px, py, gR * 0.6, 0, Math.PI * 2);
              ctx.stroke();
              ctx.restore();
            } catch (e) {}
          }
        })();

        // ── Path outline — debug only ────────────────────────────────────────
        if (
          state.debug.paths &&
          w.path &&
          w.path.points &&
          w.path.points.length >= 2
        ) {
          ctx.save();
          ctx.strokeStyle = "rgba(255,255,255,0.2)";
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          var pts = w.path.points;
          ctx.moveTo(pts[0].x, pts[0].y);
          for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
          if (w.path.closed) ctx.closePath();
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
        }

        // ── Info text — debug only ───────────────────────────────────────────
        if (state.debug.info) {
          ctx.save();
          ctx.fillStyle = "#ffffff";
          ctx.globalAlpha = 0.8;
          ctx.font = "10px monospace";
          ctx.fillText(
            "t:" + w.t.toFixed(2) + " " + (w.motionMode || ""),
            px + 8,
            py + 4,
          );
          ctx.restore();
        }

        // ── Projectile physics debug overlay (Phase 9) ──────────────────────────
        if (w.motionMode === "projectile" && w.debug && w.debug.showPhysics) {
          ctx.save();
          ctx.globalAlpha = 0.9;
          var _ph = w.physics || {};
          var _cr = _ph.collisionRadius || 8;

          // True collision radius ring — yellow dashed
          ctx.strokeStyle = "#ffff00";
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.arc(px, py, _cr, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);

          // World position label — cyan, world-space coords (NOT canvas px)
          ctx.fillStyle = "#00ffff";
          ctx.font = "8px monospace";
          ctx.globalAlpha = 0.85;
          ctx.fillText(
            "W(" + w.x.toFixed(0) + "," + w.y.toFixed(0) + ")",
            px + _cr + 3,
            py + 9,
          );

          // Velocity arrow — green
          var _phVlen = Math.hypot(_ph.vx || 0, _ph.vy || 0);
          if (_phVlen > 0.1) {
            var _vscale = 4;
            ctx.strokeStyle = "#00ff88";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(
              px + (_ph.vx || 0) * _vscale,
              py + (_ph.vy || 0) * _vscale,
            );
            ctx.stroke();
            var _vang = Math.atan2(_ph.vy || 0, _ph.vx || 0);
            var _tipX = px + (_ph.vx || 0) * _vscale,
              _tipY = py + (_ph.vy || 0) * _vscale;
            ctx.beginPath();
            ctx.moveTo(_tipX, _tipY);
            ctx.lineTo(
              _tipX - Math.cos(_vang - 0.4) * 6,
              _tipY - Math.sin(_vang - 0.4) * 6,
            );
            ctx.lineTo(
              _tipX - Math.cos(_vang + 0.4) * 6,
              _tipY - Math.sin(_vang + 0.4) * 6,
            );
            ctx.closePath();
            ctx.fillStyle = "#00ff88";
            ctx.fill();
          }
          ctx.fillStyle = "#ffff88";
          ctx.font = "8px monospace";
          ctx.globalAlpha = 0.8;
          ctx.fillText(
            _phVlen.toFixed(1) + " px/f | r=" + _cr,
            px + _cr + 3,
            py - 2,
          );
          ctx.restore();
        }

        // ── Drift debug overlay ──────────────────────────────────────────────
        // White dot = path position (pre-drift). Red dot = final position (post-drift).
        // Active when state.debug.driftOverlay is true.
        if (state.debug && state.debug.driftOverlay) {
          ctx.save();
          ctx.globalAlpha = 1;

          // White dot — pure path position
          if (w._pathX != null) {
            ctx.beginPath();
            ctx.arc(w._pathX, w._pathY, 5, 0, Math.PI * 2);
            ctx.fillStyle = "#ffffff";
            ctx.fill();
          }

          // Red dot — final position (includes drift offset)
          ctx.beginPath();
          ctx.arc(px, py, 4, 0, Math.PI * 2);
          ctx.fillStyle = "#ff2222";
          ctx.fill();

          // Line connecting them when separated
          if (w._pathX != null) {
            var sep = Math.hypot(px - w._pathX, py - w._pathY);
            if (sep > 0.5) {
              ctx.beginPath();
              ctx.moveTo(w._pathX, w._pathY);
              ctx.lineTo(px, py);
              ctx.strokeStyle = "rgba(255,100,100,0.6)";
              ctx.lineWidth = 1.5;
              ctx.stroke();

              // Label separation distance
              ctx.fillStyle = "#ff8888";
              ctx.font = "bold 9px monospace";
              ctx.globalAlpha = 0.9;
              ctx.fillText(sep.toFixed(1) + "px", px + 6, py - 4);
            }
          }

          ctx.restore();
        }

        // Reset blend mode after walker render
        if (
          _walkerLayer &&
          _walkerLayer.blendMode &&
          _walkerLayer.blendMode !== "normal"
        ) {
          ctx.globalCompositeOperation = "source-over";
        }
      });
      ctx.restore();
    }

    // ── End PathWalker System ────────────────────────────

    // ── End Mop / Stroke System ──────────────────────────

    function drawLinePreview() {
      // Line tool disabled — mop is the primary drawing system
    }

    // Inspector section toggles — init before bindControls so crash there doesn't block
    document.querySelectorAll(".insp-section-header").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var body = btn
          .closest(".insp-section")
          .querySelector(".insp-section-body");
        var isOpen = btn.classList.contains("open");
        body.style.display = isOpen ? "none" : "";
        btn.classList.toggle("open", !isOpen);
        btn.querySelector(".insp-chevron").textContent = isOpen ? "▶" : "▼";
      });
    });

    bindGlobalKeyboardShortcuts();

    try {
      bindControls();
    } catch (e) {
      console.warn("[WOS] bindControls error (non-fatal):", e.message);
    }

    // ── Camera input handlers ──────────────────────────────────────────────
    (function bindCameraInput() {
      var ZOOM_FACTOR = 1.1;
      var _panning = false;
      var _spaceDown = false;

      // Zoom on wheel
      canvas.addEventListener(
        "wheel",
        function onWheel(e) {
          e.preventDefault();
          var cam = state.camera;
          var dir = e.deltaY > 0 ? 1 / ZOOM_FACTOR : ZOOM_FACTOR;
          // Zoom toward cursor position
          var rect = canvas.getBoundingClientRect();
          var sx = (e.clientX - rect.left) * (canvas.width / rect.width);
          var sy = (e.clientY - rect.top) * (canvas.height / rect.height);
          var newZoom = clamp(
            cam.targetZoom * dir,
            cam.zoomLimits.min,
            cam.zoomLimits.max,
          );
          // Adjust target so cursor stays fixed in world space
          cam.targetX += ((sx - canvas.width / 2) / cam.zoom) * (1 - dir);
          cam.targetY += ((sy - canvas.height / 2) / cam.zoom) * (1 - dir);
          cam.targetZoom = newZoom;
          renderFrame();
        },
        { passive: false },
      );

      // Pan: middle mouse button or Space+drag
      global.addEventListener("keydown", function (e) {
        if (
          e.code === "Space" &&
          !isTypingTarget() &&
          !(window._wos && window._wos._shortcutsSuspended)
        ) {
          _spaceDown = true;
        }
      });
      global.addEventListener("keyup", function (e) {
        if (e.code === "Space") {
          _spaceDown = false;
          _panning = false;
        }
      });

      canvas.addEventListener("pointerdown", function onCamDown(e) {
        if (e.button === 1 || _spaceDown) {
          _panning = true;
          canvas.setPointerCapture(e.pointerId);
          e.preventDefault();
        }
      });
      canvas.addEventListener("pointermove", function onCamMove(e) {
        if (!_panning) return;
        var cam = state.camera;
        cam.targetX -= e.movementX / cam.zoom;
        cam.targetY -= e.movementY / cam.zoom;
        renderFrame();
      });
      canvas.addEventListener("pointerup", function () {
        _panning = false;
      });
      canvas.addEventListener("pointercancel", function () {
        _panning = false;
      });
    })();
    // ── End camera input ───────────────────────────────────────────────────

    // ── Director Mode canvas pointer events (survey pan/zoom) ────────────────
    (function bindDirectorPointerEvents() {
      function isDirectorSurvey() {
        var rw = state.routeWorld;
        var d = rw && rw.director;
        return d && d.enabled && d.mode === "survey";
      }
      function getCanvasScale() {
        var rect = canvas.getBoundingClientRect();
        return rect.width ? canvas.width / rect.width : 1;
      }

      canvas.addEventListener("pointerdown", function onDirDown(e) {
        if (!isDirectorSurvey()) return;
        // Only primary mouse button for survey pan (middle is used by general cam pan)
        if (e.button !== 0) return;
        var rw = state.routeWorld;
        var DM = SBE && SBE.DirectorMode;
        var d = rw && rw.director;
        if (!d || !DM) return;
        var rect = canvas.getBoundingClientRect();
        var scl = getCanvasScale();
        var cx = (e.clientX - rect.left) * scl;
        var cy = (e.clientY - rect.top) * scl;
        DM.pointerDown(d, cx, cy);
        canvas.setPointerCapture(e.pointerId);
        e.stopPropagation();
      });

      canvas.addEventListener("pointermove", function onDirMove(e) {
        if (!isDirectorSurvey()) return;
        var rw = state.routeWorld;
        var DM = SBE && SBE.DirectorMode;
        var d = rw && rw.director;
        if (!d || !DM || !d.manualCamera.isPanning) return;
        var rect = canvas.getBoundingClientRect();
        var scl = getCanvasScale();
        var cx = (e.clientX - rect.left) * scl;
        var cy = (e.clientY - rect.top) * scl;
        DM.pointerMove(d, cx, cy, 1); // scl already folded into coords
        renderFrame();
        e.stopPropagation();
      });

      canvas.addEventListener("pointerup", function onDirUp() {
        var rw = state.routeWorld;
        var DM = SBE && SBE.DirectorMode;
        var d = rw && rw.director;
        if (d && DM) DM.pointerUp(d);
      });

      canvas.addEventListener("pointercancel", function () {
        var rw = state.routeWorld;
        var DM = SBE && SBE.DirectorMode;
        var d = rw && rw.director;
        if (d && DM) DM.pointerUp(d);
      });

      // Wheel zoom in survey mode — fires alongside existing wheel handler;
      // we short-circuit the route-world zoom first.
      canvas.addEventListener(
        "wheel",
        function onDirWheel(e) {
          if (!isDirectorSurvey()) return;
          var rw = state.routeWorld;
          var DM = SBE && SBE.DirectorMode;
          var d = rw && rw.director;
          if (!d || !DM) return;
          var rect = canvas.getBoundingClientRect();
          var scl = getCanvasScale();
          var cx = (e.clientX - rect.left) * scl;
          var cy = (e.clientY - rect.top) * scl;
          DM.wheel(d, e.deltaY, cx, cy, canvas.width, canvas.height);
          renderFrame();
          e.preventDefault();
          e.stopPropagation();
        },
        { passive: false, capture: true },
      ); // capture: true fires before the existing handler
    })();
    // ── End Director Mode canvas events ────────────────────────────────────

    // Unlock AudioEngine on first user gesture — required by browser autoplay policy
    ["pointerdown", "click", "keydown"].forEach(function (evtName) {
      window.addEventListener(
        evtName,
        function () {
          AudioEngine.unlock();
        },
        { once: true },
      );
    });

    // ── Show Paths toggle ───────────────────────────────────────────────────
    (function bindShowPaths() {
      var el = document.getElementById("show-paths");
      if (!el) return;
      el.checked = state.view.showPaths !== false;
      el.addEventListener("change", function () {
        state.view.showPaths = el.checked;
        renderFrame();
      });
    })();
    // ── End show paths ─────────────────────────────────────────────────────

    // ── Drift debug overlay toggle ─────────────────────────────────────────
    (function bindDriftOverlay() {
      var el = document.getElementById("debug-drift-overlay");
      if (!el) return;
      el.checked = !!(state.debug && state.debug.driftOverlay);
      el.addEventListener("change", function () {
        state.debug.driftOverlay = el.checked;
        if (el.checked) {
          // Exaggerate drift for proof: strength 2.0, damping 1.0 (no decay)
          if (state.world && state.world.physics && state.world.physics.flow) {
            state.world.physics.flow._savedStrength =
              state.world.physics.flow.strength;
            state.world.physics.flow._savedDamping =
              state.world.physics.flow.damping;
            state.world.physics.flow.strength = 2.0;
            state.world.physics.flow.damping = 1.0;
          }
        } else {
          // Restore original values
          if (state.world && state.world.physics && state.world.physics.flow) {
            var fl = state.world.physics.flow;
            if (fl._savedStrength != null) {
              fl.strength = fl._savedStrength;
              delete fl._savedStrength;
            }
            if (fl._savedDamping != null) {
              fl.damping = fl._savedDamping;
              delete fl._savedDamping;
            }
          }
        }
        renderFrame();
      });
    })();

    // ── Projectile walker UI bindings (ProjectileWalkerMigration v1.0.0) ─────
    // Runs after state, _wos.state, and controls are fully initialized.
    (function bindProjectileTool() {
      function pt() {
        return state.projectileTool;
      }

      var el;

      // Movement Mode select (proj-movement-mode) — "physics" = useWalkers true
      (function () {
        var selEl = document.getElementById("proj-movement-mode");
        if (selEl) {
          selEl.value = pt().useWalkers ? "physics" : "none";
          selEl.onchange = function () {
            pt().useWalkers = this.value === "physics";
            // Keep legacy hidden input in sync for serialization compat
            var legEl = document.getElementById("proj-use-walkers");
            if (legEl) legEl.value = pt().useWalkers ? "1" : "0";
          };
        }
      })();

      // Each control gets its own closure-safe block to prevent shared-variable contamination
      (function () {
        var outEl = document.getElementById("proj-bounce-value");
        var rangeEl = document.getElementById("proj-bounce");
        if (rangeEl) {
          rangeEl.value = pt().bounce;
          rangeEl.oninput = function () {
            pt().bounce = Number(this.value);
            if (outEl) outEl.value = Number(this.value).toFixed(2);
            state.projectileWalkers.forEach(function (pw) {
              if (pw.physics) pw.physics.bounce = pt().bounce;
            });
          };
        }
      })();

      (function () {
        var outEl = document.getElementById("proj-gravity-scale-value");
        var rangeEl = document.getElementById("proj-gravity-scale");
        if (rangeEl) {
          rangeEl.value = pt().gravityScale;
          rangeEl.oninput = function () {
            pt().gravityScale = Number(this.value);
            if (outEl) outEl.value = Number(this.value).toFixed(2);
            state.projectileWalkers.forEach(function (pw) {
              if (pw.physics) pw.physics.gravityScale = pt().gravityScale;
            });
          };
        }
      })();

      (function () {
        var outEl = document.getElementById("proj-radius-value");
        var rangeEl = document.getElementById("proj-radius");
        if (rangeEl) {
          rangeEl.value = pt().radius;
          rangeEl.oninput = function () {
            pt().radius = Number(this.value);
            if (outEl) outEl.value = this.value;
            state.projectileWalkers.forEach(function (pw) {
              if (pw.physics) pw.physics.collisionRadius = pt().radius;
            });
          };
        }
      })();

      el = document.getElementById("proj-show-physics");
      if (el) {
        el.checked = pt().showPhysics;
        el.onchange = function () {
          pt().showPhysics = this.checked;
          state.projectileWalkers.forEach(function (pw) {
            if (!pw.debug) pw.debug = {};
            pw.debug.showPhysics = pt().showPhysics;
          });
          renderFrame();
        };
      }

      el = document.getElementById("proj-clear");
      if (el) {
        el.onclick = function () {
          state.projectileWalkers = [];
          renderFrame();
        };
      }
    })();

    // Slider ↔ number sync for obj-strokeWidth
    (function bindSliderNum() {
      var slider = document.getElementById("obj-strokeWidth");
      var num = document.getElementById("obj-strokeWidth-num");
      if (!slider || !num) return;
      slider.addEventListener("input", function () {
        num.value = slider.value;
      });
      num.addEventListener("input", function () {
        var v = Math.max(1, Math.min(100, Number(num.value)));
        slider.value = v;
        // Also fire the bound inspector setter
        slider.dispatchEvent(new Event("input"));
      });
    })();

    // Viewport mode
    applyViewportMode();
    (function bindViewportMode() {
      var sel = document.getElementById("viewport-mode");
      if (!sel) return;
      sel.addEventListener("change", function () {
        state.viewportMode = sel.value;
        sel.blur();
        applyViewportMode();
      });
    })();
    // ── End inspector collapsibles ────────────────────────────────────────

    // ── RuntimeViewportRouter — input delegation ──────────────────────────────
    // In geo mode, events only reach the runtime when in "route-edit" mode.
    // All other events pass through the transparent canvas to Mapbox beneath.
    function _geoRouteEditActive() {
      if (!window.SBE || !SBE.Workspace) return false;
      var _surf = SBE.Workspace.getActiveSurface();
      if (!_surf || (_surf.type !== "route" && _surf.type !== "world")) return false;
      var _rt = _surf.runtime;
      return _rt && _rt.mode === "route-edit";
    }
    canvas.addEventListener("pointerdown", function (e) {
      if (window.SBE && SBE.RuntimeViewportRouter) SBE.RuntimeViewportRouter.handlePointerDown(e);
    });
    canvas.addEventListener("pointermove", function (e) {
      if (window.SBE && SBE.RuntimeViewportRouter) SBE.RuntimeViewportRouter.handlePointerMove(e);
    });
    canvas.addEventListener("pointerup", function (e) {
      if (window.SBE && SBE.RuntimeViewportRouter) SBE.RuntimeViewportRouter.handlePointerUp(e);
    });
    canvas.addEventListener("dblclick", function (e) {
      if (window.SBE && SBE.RuntimeViewportRouter) SBE.RuntimeViewportRouter.handleDblClick(e);
    });
    global.addEventListener("keydown", function (e) {
      if (window.SBE && SBE.RuntimeViewportRouter) SBE.RuntimeViewportRouter.handleKeyDown(e);
    });
    global.addEventListener("keyup", function (e) {
      if (window.SBE && SBE.RuntimeViewportRouter) SBE.RuntimeViewportRouter.handleKeyUp(e);
    });

    // ── Text Tool canvas handler ────────────────────────────────────────────
    canvas.addEventListener("pointerdown", function onTextToolDown(e) {
      if (state.tool !== "text") return;

      var rect = canvas.getBoundingClientRect();
      var sx = (e.clientX - rect.left) * (canvas.width / rect.width);
      var sy = (e.clientY - rect.top) * (canvas.height / rect.height);

      // Commit any active edit first
      if (state.textEditing && state.activeLabelId) {
        var cur = getLabelById(state.activeLabelId);
        if (cur && !cur.text) removeLabel(cur.id);
        state.textEditing = false;
      }

      // Hit-test existing labels
      var hit = getLabelAtScreen(sx, sy);
      if (hit) {
        state.activeLabelId = hit.id;
        state.textEditing = true;
        e.stopPropagation();
        renderFrame();
        return;
      }

      // Create new label at world position
      var cam = state.camera;
      var wx = (sx - canvas.width / 2) / cam.zoom + cam.x;
      var wy = (sy - canvas.height / 2) / cam.zoom + cam.y;
      var label = createLabelAt(wx, wy);
      state.activeLabelId = label.id;
      state.textEditing = true;
      e.stopPropagation();
      renderFrame();
    });
    // ── End text tool handler ───────────────────────────────────────────────

    // ── Creation Preset UI ───────────────────────────────────────────────────

    await applyScene({
      lines: [],
      strokes: [],
      balls: [],
      walkers: [],
      groups: {},
      shapes: [],
      textObjects: [],
    });
    renderBankGrid();
    updateCanvasAspect();
    // Bootstrap Phase 1 spatial corridor immediately — canvas dimensions now stable
    _rwEnsureSpatialBootstrap(state.routeWorld);
    setViewClasses();
    syncUI();
    updatePanels(state.tool);

    // ── Corridor Ecology — auto-initialize ─────────────────────────────────────
    // Bootstraps district pressure + abstract vehicle simulation on startup.
    // Disabled by default (state.world.ecology.enabled = false) — enable via
    // _wosEcology.enable() in the console or the world inspector toggle.
    if (window.SBE && SBE.DistrictPressure && SBE.TrafficEcology) {
      initEcology();
      state.world.ecology.enabled = false; // off by default; enable in inspector
    }

    // ── System HUD ────────────────────────────────────────────────────────────

    var systemHudRefreshId = null;

    // Safe counter — works for arrays, Sets, Maps, plain objects, or missing values
    function countItems(value) {
      if (!value) return 0;
      if (Array.isArray(value)) return value.length;
      if (value instanceof Set) return value.size;
      if (value instanceof Map) return value.size;
      if (typeof value === "object") return Object.keys(value).length;
      return 0;
    }

    function getRuntimeBeat() {
      if (!state || !state.transport) return 0;
      var elapsed = state.transport.elapsedBeforeRun || 0;
      if (isPlaying && state.transport.startedAt) {
        elapsed += (performance.now() - state.transport.startedAt) / 1000;
      }
      var bpm = state.bpm || 120;
      return elapsed * (bpm / 60);
    }

    function getWorldLayerCountByType(type) {
      var layers = state.world && state.world.layers ? state.world.layers : [];
      return layers.filter(function (l) {
        return l && l.type === type;
      }).length;
    }

    function countGridBlocks() {
      var layers = state.world && state.world.layers ? state.world.layers : [];
      return layers.reduce(function (total, l) {
        return total + countItems(l && l.blocks);
      }, 0);
    }

    function countSourceNotes() {
      return (state.midiCartridges || []).reduce(function (total, c) {
        return total + countItems(c && c.notes);
      }, 0);
    }

    // ── MIDI Playback Bridge ──────────────────────────────────────────────────

    function getCurrentTransportBeat() {
      return getRuntimeBeat();
    }

    function getActiveMidiPlaybackBank() {
      if (!state.activeMidiBankId) return null;
      return (
        (state.midiBanks || []).find(function (bank) {
          return bank && bank.id === state.activeMidiBankId;
        }) || null
      );
    }

    function getCartridgeForMidiBank(bank) {
      if (!bank) return null;
      if (bank.cartridgeId) {
        var byCartridgeId = (state.midiCartridges || []).find(function (cart) {
          return cart && cart.id === bank.cartridgeId;
        });
        if (byCartridgeId) return byCartridgeId;
      }
      return (
        (state.midiCartridges || []).find(function (cart) {
          return cart && cart.id === bank.id;
        }) || null
      );
    }

    function normalizeMidiPlaybackEvent(raw, index) {
      if (!raw) return null;

      var note =
        typeof raw.note === "number"
          ? raw.note
          : typeof raw.midi === "number"
            ? raw.midi
            : typeof raw.midiNote === "number"
              ? raw.midiNote
              : typeof raw.pitch === "number"
                ? raw.pitch
                : 60;

      var velocity =
        typeof raw.velocity === "number"
          ? raw.velocity
          : typeof raw.vel === "number"
            ? raw.vel
            : 90;

      if (velocity > 0 && velocity <= 1) velocity = Math.round(velocity * 127);
      velocity = Math.max(1, Math.min(127, Math.round(velocity)));

      var bpm = state.bpm || 120;
      var startBeat =
        typeof raw.startBeat === "number"
          ? raw.startBeat
          : typeof raw.beat === "number"
            ? raw.beat
            : typeof raw.timeBeats === "number"
              ? raw.timeBeats
              : typeof raw.ticks === "number" && raw.ppq
                ? raw.ticks / raw.ppq
                : typeof raw.time === "number"
                  ? raw.time * (bpm / 60)
                  : 0;

      var durationBeats =
        typeof raw.durationBeats === "number"
          ? raw.durationBeats
          : typeof raw.duration === "number"
            ? raw.duration * (bpm / 60)
            : typeof raw.durationTicks === "number" && raw.ppq
              ? raw.durationTicks / raw.ppq
              : 0.25;

      return {
        id: raw.id || "midi_note_" + index,
        index: index,
        note: note,
        velocity: velocity,
        startBeat: startBeat,
        durationBeats: Math.max(0.01, durationBeats),
        noteClass: ((note % 12) + 12) % 12,
        raw: raw,
      };
    }

    function getMidiNoteEventsForPlayback() {
      var bank = getActiveMidiPlaybackBank();
      var cartridge = getCartridgeForMidiBank(bank);

      if (bank && Array.isArray(bank.events) && bank.events.length) {
        return bank.events.map(normalizeMidiPlaybackEvent).filter(Boolean);
      }
      if (bank && Array.isArray(bank.notes) && bank.notes.length) {
        return bank.notes.map(normalizeMidiPlaybackEvent).filter(Boolean);
      }
      if (
        cartridge &&
        Array.isArray(cartridge.notes) &&
        cartridge.notes.length
      ) {
        return cartridge.notes.map(normalizeMidiPlaybackEvent).filter(Boolean);
      }
      return [];
    }

    function getMidiPlaybackLengthBeats(bank, cartridge, events) {
      if (cartridge && cartridge.length) return cartridge.length;
      if (bank && bank.length) return bank.length;
      return events.reduce(function (max, event) {
        return Math.max(max, event.startBeat + event.durationBeats);
      }, 0);
    }

    function processMidiPlayback(currentBeat, previousBeat) {
      if (!state.midiPlayback || state.midiPlayback.enabled === false) return;
      if (!isPlaying) return;

      var events = getMidiNoteEventsForPlayback();
      if (!events.length) {
        state.midiPlayback.activeNotes = [];
        state.midiPlayback.lastTriggeredNotes = [];
        return;
      }

      // Resolve active bank/cartridge for source length and repeat flag
      var resolved = resolveMidiBankAndCartridge(null);
      var sourceLengthBeats = getMidiPlaybackLengthBeats(
        resolved.bank,
        resolved.cartridge,
        events,
      );
      var shouldLoop = !!(resolved.bank && resolved.bank.repeat);
      var loopBeats = shouldLoop ? sourceLengthBeats : 0;

      var wrapped = shouldLoop && currentBeat < previousBeat;
      var triggered = [];
      var now = performance.now();

      events.forEach(function (event) {
        var eventBeat = event.startBeat;
        // Only fold into loop window when looping is active
        if (shouldLoop && loopBeats > 0) {
          eventBeat = ((eventBeat % loopBeats) + loopBeats) % loopBeats;
        }

        var crossed = wrapped
          ? eventBeat > previousBeat || eventBeat <= currentBeat
          : eventBeat > previousBeat && eventBeat <= currentBeat;
        if (!crossed) return;

        var cycle =
          shouldLoop && loopBeats > 0 ? Math.floor(currentBeat / loopBeats) : 0;
        var key = event.id + "::" + cycle;
        if (state.midiPlayback.firedNoteKeys.has(key)) return;
        state.midiPlayback.firedNoteKeys.add(key);

        playFallbackInstrument(event.note, event.velocity);
        noteActivity[event.noteClass] = now;
        noteVelocity[event.noteClass] = event.velocity / 127;

        triggered.push({
          id: event.id,
          index: event.index != null ? event.index : event.sourceIndex,
          sourceIndex: event.sourceIndex,
          note: event.note,
          velocity: event.velocity,
          startBeat: event.startBeat,
          noteClass: event.noteClass,
        });
      });

      state.midiPlayback.lastTriggeredNotes = triggered;

      // Update playhead to the latest triggered event (greatest startBeat this frame)
      if (triggered.length > 0) {
        var lastTriggered = triggered.reduce(function (best, e) {
          return e.startBeat > best.startBeat ? e : best;
        }, triggered[0]);
        state.midiPlayback.playheadEventIndex =
          lastTriggered.index != null
            ? lastTriggered.index
            : lastTriggered.sourceIndex;
        state.midiPlayback.playheadEventId = lastTriggered.id || null;
        state.midiPlayback.playheadBeat =
          lastTriggered.startBeat != null
            ? lastTriggered.startBeat
            : currentBeat;
      }

      state.midiPlayback.activeNotes = events.filter(function (event) {
        var localBeat =
          shouldLoop && loopBeats > 0
            ? ((currentBeat % loopBeats) + loopBeats) % loopBeats
            : currentBeat;
        var start =
          shouldLoop && loopBeats > 0
            ? ((event.startBeat % loopBeats) + loopBeats) % loopBeats
            : event.startBeat;
        return localBeat >= start && localBeat <= start + event.durationBeats;
      });

      if (state.midiPlayback.debug && triggered.length) {
        console.log("[MIDI PLAYBACK]", {
          currentBeat: currentBeat,
          previousBeat: previousBeat,
          triggered: triggered,
        });
      }
    }

    function getSelectedCount() {
      if (state.selection && state.selection.strokeIds)
        return countItems(state.selection.strokeIds);
      return countItems(state.multiSelection);
    }

    function getSystemHudData() {
      var registryStatus =
        window._wos && window._wos.listRegistryStatus
          ? window._wos.listRegistryStatus()
          : null;
      var registryValidation =
        window._wos && window._wos.validateRegistry
          ? window._wos.validateRegistry()
          : null;
      var schemaValidation =
        window._wos && window._wos.validateSchemas
          ? window._wos.validateSchemas()
          : null;
      var schemas = window.SBE && window.SBE.Schemas;
      var currentBeat = getRuntimeBeat();

      return {
        registryStatus: registryStatus,
        registryValidation: registryValidation,
        schemaValidation: schemaValidation,
        schemaGroups: schemas ? Object.keys(schemas) : [],
        runtime: {
          tool: state.tool || "none",
          frame: state.frame || 0,
          viewportMode: state.viewportMode || "unknown",
          playing: !!isPlaying,
          bpm: state.bpm || 120,
          loopBars: state.loop && state.loop.bars ? state.loop.bars : 0,
          currentBeat: Number(currentBeat.toFixed(2)),
          strokes: countItems(state.strokes),
          walkers: countItems(state.walkers),
          lines: countItems(state.lines),
          balls: countItems(state.balls),
          shapes: countItems(state.shapes),
          textObjects: countItems(state.textObjects),
          particles: countItems(state.particles),
          selectedCount: getSelectedCount(),
          worldLayers: countItems(state.world && state.world.layers),
          gridLayers: getWorldLayerCountByType("grid"),
          objectLayers: getWorldLayerCountByType("objectLayer"),
          interactionOverlays: getWorldLayerCountByType("interactionOverlay"),
          dataOverlays: getWorldLayerCountByType("dataOverlay"),
          devOverlays: getWorldLayerCountByType("devOverlay"),
          midiCartridges: countItems(state.midiCartridges),
          midiBanks: countItems(state.midiBanks),
          activeMidiBankId: state.activeMidiBankId || "none",
          gridBanks: countItems(state.gridBanks),
          gridBlocks: countGridBlocks(),
          sourceNotes: countSourceNotes(),
          activeVoices:
            state.audio && state.audio.activeVoices
              ? countItems(state.audio.activeVoices)
              : 0,
          midiPlaybackEnabled: !!(
            state.midiPlayback && state.midiPlayback.enabled
          ),
          midiPlaybackEvents: getMidiNoteEventsForPlayback().length,
          midiActiveNotes: countItems(
            state.midiPlayback && state.midiPlayback.activeNotes,
          ),
          midiLastTriggered: countItems(
            state.midiPlayback && state.midiPlayback.lastTriggeredNotes,
          ),
        },
      };
    }

    function escapeHudHtml(value) {
      return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    function makeHudMetric(label, value) {
      return (
        '<div class="system-hud__metric">' +
        '<span class="system-hud__metric-label">' +
        escapeHudHtml(label) +
        "</span>" +
        '<span class="system-hud__metric-value">' +
        escapeHudHtml(String(value)) +
        "</span>" +
        "</div>"
      );
    }

    // Registry status rows — value shown as badge
    function makeHudRow(label, status) {
      return (
        '<div class="system-hud__row">' +
        '<span class="system-hud__name">' +
        escapeHudHtml(label) +
        "</span>" +
        '<span class="system-hud__badge" data-status="' +
        escapeHudHtml(status || "available") +
        '">' +
        escapeHudHtml(status || "available") +
        "</span>" +
        "</div>"
      );
    }

    // Runtime / schema count rows — value shown as plain text
    function makeHudValueRow(label, value) {
      return (
        '<div class="system-hud__row system-hud__row--value">' +
        '<span class="system-hud__name">' +
        escapeHudHtml(label) +
        "</span>" +
        '<span class="system-hud__value">' +
        escapeHudHtml(String(value)) +
        "</span>" +
        "</div>"
      );
    }

    function renderSystemHud() {
      var summaryEl = document.getElementById("system-hud-summary");
      var registryEl = document.getElementById("system-hud-registry");
      var schemasEl = document.getElementById("system-hud-schemas");
      var runtimeEl = document.getElementById("system-hud-runtime");
      if (!summaryEl || !registryEl || !schemasEl || !runtimeEl) return;

      var data = getSystemHudData();
      var r = data.runtime;

      var regErrors =
        data.registryValidation && data.registryValidation.errors
          ? data.registryValidation.errors.length
          : 0;
      var schemaErrors =
        data.schemaValidation && data.schemaValidation.errors
          ? data.schemaValidation.errors.length
          : 0;
      var liveObjects =
        r.strokes +
        r.walkers +
        r.balls +
        r.shapes +
        r.textObjects +
        r.particles;

      summaryEl.innerHTML =
        makeHudMetric("Reg Errors", regErrors) +
        makeHudMetric("Schema Errors", schemaErrors) +
        makeHudMetric("Live Objects", liveObjects);

      // Registry: group summary row then item rows
      var registryHtml = "";
      if (!data.registryStatus) {
        registryHtml =
          '<div class="system-hud__validation" data-state="error">Registry helpers missing</div>';
      } else {
        Object.keys(data.registryStatus).forEach(function (groupName) {
          var items = data.registryStatus[groupName] || [];
          registryHtml += makeHudValueRow(groupName, items.length);
          items.forEach(function (item) {
            registryHtml += makeHudRow(item.label || item.id, item.status);
          });
        });
      }
      registryEl.innerHTML = registryHtml;

      // Schemas: value rows only
      var schemaState = schemaErrors ? "error" : "ok";
      var schemaWarnings =
        data.schemaValidation && data.schemaValidation.warnings
          ? data.schemaValidation.warnings.length
          : 0;
      var schemaHtml =
        '<div class="system-hud__validation" data-state="' +
        schemaState +
        '">' +
        (schemaErrors ? "Schema errors: " + schemaErrors : "Schemas OK") +
        "</div>" +
        makeHudValueRow("Top-level schemas", data.schemaGroups.length) +
        makeHudValueRow(
          "Object schemas",
          window.SBE && SBE.Schemas && SBE.Schemas.Objects
            ? Object.keys(SBE.Schemas.Objects).length - 1
            : 0,
        ) +
        makeHudValueRow(
          "Runtime groups",
          window.SBE && SBE.Schemas && SBE.Schemas.Runtime
            ? Object.keys(SBE.Schemas.Runtime).length
            : 0,
        ) +
        makeHudValueRow("Warnings", schemaWarnings);

      if (
        data.schemaValidation &&
        data.schemaValidation.errors &&
        data.schemaValidation.errors.length
      ) {
        data.schemaValidation.errors.forEach(function (err) {
          schemaHtml +=
            '<div class="system-hud__validation" data-state="error">' +
            escapeHudHtml(err) +
            "</div>";
        });
      }
      schemasEl.innerHTML = schemaHtml;

      // Runtime: all value rows
      runtimeEl.innerHTML =
        makeHudValueRow("Tool", r.tool) +
        makeHudValueRow("Playing", String(r.playing)) +
        makeHudValueRow("BPM", r.bpm) +
        makeHudValueRow("Beat", r.currentBeat) +
        makeHudValueRow("Frame", r.frame) +
        makeHudValueRow("Viewport", r.viewportMode) +
        makeHudValueRow("Strokes", r.strokes) +
        makeHudValueRow("Walkers", r.walkers) +
        makeHudValueRow("Lines", r.lines) +
        makeHudValueRow("Balls", r.balls) +
        makeHudValueRow("Shapes", r.shapes) +
        makeHudValueRow("Text", r.textObjects) +
        makeHudValueRow("Particles", r.particles) +
        makeHudValueRow("Selected", r.selectedCount) +
        makeHudValueRow("World Layers", r.worldLayers) +
        makeHudValueRow("Grid Layers", r.gridLayers) +
        makeHudValueRow("Grid Blocks", r.gridBlocks) +
        makeHudValueRow("Source Notes", r.sourceNotes) +
        makeHudValueRow("MIDI Banks", r.midiBanks) +
        makeHudValueRow("Active Bank", r.activeMidiBankId) +
        makeHudValueRow("Grid Banks", r.gridBanks) +
        makeHudValueRow("Active Voices", r.activeVoices) +
        makeHudValueRow("MIDI Playback", String(r.midiPlaybackEnabled)) +
        makeHudValueRow("MIDI Events", r.midiPlaybackEvents) +
        makeHudValueRow("MIDI Active", r.midiActiveNotes) +
        makeHudValueRow("MIDI Triggered", r.midiLastTriggered);
    }

    function toggleSystemHud(forceOpen) {
      var hud = document.getElementById("system-hud");
      var toggle = document.getElementById("system-hud-toggle");
      if (!hud || !toggle) return;

      var shouldOpen =
        typeof forceOpen === "boolean"
          ? forceOpen
          : hud.classList.contains("hidden");

      hud.classList.toggle("hidden", !shouldOpen);
      hud.setAttribute("aria-hidden", shouldOpen ? "false" : "true");
      toggle.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
      toggle.dataset.open = shouldOpen ? "true" : "false";

      if (state.ui) state.ui.systemHudVisible = shouldOpen;

      if (systemHudRefreshId) {
        clearInterval(systemHudRefreshId);
        systemHudRefreshId = null;
      }

      if (shouldOpen) {
        renderSystemHud();
        systemHudRefreshId = setInterval(renderSystemHud, 500);
      }
    }

    function bindSystemHud() {
      var toggle = document.getElementById("system-hud-toggle");
      var close = document.getElementById("system-hud-close");

      if (toggle)
        toggle.addEventListener("click", function () {
          toggleSystemHud();
        });
      if (close)
        close.addEventListener("click", function () {
          toggleSystemHud(false);
        });

      window._wos = window._wos || {};
      window._wos.renderSystemHud = renderSystemHud;
      window._wos.toggleSystemHud = toggleSystemHud;
      window._wos.getSystemHudData = getSystemHudData;
      window._wos.refreshBankGrid = renderBankGrid; // exposed for drawer mount
      window._wos.syncUI = syncUI; // exposed for symbolDrawer placement trigger

      // ── Shortcut suspension — used by takesFocus drawers ──────────────────
      // When a drawer declares takesFocus:true, it calls shortcuts.suspend()
      // on mount and shortcuts.resume() on unmount. All WOS keydown handlers
      // guard against _shortcutsSuspended before acting.
      window._wos._shortcutsSuspended = false;
      window._wos.shortcuts = {
        suspend: function () {
          window._wos._shortcutsSuspended = true;
        },
        resume: function () {
          window._wos._shortcutsSuspended = false;
        },
      };

      window._wos.midiPlayback = {
        enable: function () {
          state.midiPlayback.enabled = true;
          return state.midiPlayback;
        },
        disable: function () {
          state.midiPlayback.enabled = false;
          return state.midiPlayback;
        },
        state: function () {
          return state.midiPlayback;
        },
        events: function () {
          return getMidiNoteEventsForPlayback();
        },
        testFirst: function () {
          var events = getMidiNoteEventsForPlayback();
          if (!events.length) {
            console.warn(
              "[MIDI PLAYBACK] No events available — drop a .mid file first",
            );
            return null;
          }
          var event = events[0];
          playFallbackInstrument(event.note, event.velocity);
          return event;
        },
        debug: function (enabled) {
          state.midiPlayback.debug = !!enabled;
          return state.midiPlayback.debug;
        },
        legacyWalkerAudio: function (enabled) {
          state.midiPlayback.legacyWalkerAudioEnabled = !!enabled;
          return state.midiPlayback.legacyWalkerAudioEnabled;
        },
      };
    }

    bindSystemHud();

    // ── _wos.infiniteWorld API ────────────────────────────────────────────────
    window._wos.infiniteWorld = (function () {
      function iw() {
        return state.infiniteWorld;
      }

      return {
        start: function () {
          var w = iw();
          w.enabled = true;
          // Build terrain if missing
          var hasLayer = (state.world.layers || []).some(function (l) {
            return l._iw === true;
          });
          if (!hasLayer) {
            iwBuildTerrainLayer(w);
          }
          // Spawn probe if missing
          if (!w.probeId) {
            iwSpawnProbe(w);
          }
          _iwLastTickAt = 0; // force immediate tick
          renderFrame();
          console.log("[InfiniteWorld] started");
          return w;
        },

        stop: function () {
          iw().enabled = false;
          console.log("[InfiniteWorld] stopped");
        },

        reset: function () {
          var w = iw();
          w.enabled = false;
          // Remove IW layers
          state.world.layers = (state.world.layers || []).filter(function (l) {
            return !l._iw;
          });
          // Remove IW bank
          state.midiBanks = state.midiBanks.filter(function (b) {
            return b.id !== IW_SIMULATED_BANK_ID;
          });
          // Remove probe
          if (w.probeId) {
            state.balls = state.balls.filter(function (b) {
              return b.id !== w.probeId;
            });
            state.swarm.count = state.balls.length;
          }
          // Remove any lingering _infiniteProbe balls
          state.balls = state.balls.filter(function (b) {
            return !b._infiniteProbe;
          });
          state.swarm.count = state.balls.length;
          w.terrainBankId = null;
          w.terrainLayerId = null;
          w.probeId = null;
          w.beatCursor = 0;
          w.sourceIndex = 0;
          _iwBlockStates = {};
          _iwProbeTrail = [];
          renderFrame();
          console.log("[InfiniteWorld] reset");
        },

        state: function () {
          return Object.assign({}, iw(), {
            terrainLayerExists: (state.world.layers || []).some(function (l) {
              return l._iw;
            }),
            probeExists: !!(
              iw().probeId &&
              state.balls.find(function (b) {
                return b.id === iw().probeId;
              })
            ),
            activeBlockStates: Object.keys(_iwBlockStates).length,
            trailLength: _iwProbeTrail.length,
          });
        },

        spawnProbe: function () {
          return iwSpawnProbe(iw());
        },

        setDensity: function (val) {
          var d = Math.max(0.05, Math.min(1, parseFloat(val) || 0.35));
          iw().density = d;
          return d;
        },

        setEnergy: function (val) {
          var e = Math.max(0, Math.min(1, parseFloat(val) || 0.45));
          iw().energy = e;
          return e;
        },

        setPalette: function (id) {
          var GS = getGridSystem();
          if (!GS || !GS.BAUHAUS_PALETTES[id]) {
            console.warn(
              "[InfiniteWorld] unknown palette:",
              id,
              "— use:",
              Object.keys(GS ? GS.BAUHAUS_PALETTES : {}).join(" | "),
            );
            return false;
          }
          iw()._paletteId = id;
          var layer = (state.world.layers || []).find(function (l) {
            return l._iw;
          });
          if (layer && layer.renderer) {
            layer.renderer.paletteId = id;
            // Bust color cache so blocks re-resolve on next frame
            (layer.blocks || []).forEach(function (b) {
              b._iwColor = null;
            });
          }
          renderFrame();
          return id;
        },

        setTickMs: function (ms) {
          iw().tickMs = Math.max(50, parseInt(ms, 10) || 180);
          return iw().tickMs;
        },

        regenerate: function () {
          var w = iw();
          var bank = state.midiBanks.find(function (b) {
            return b.id === IW_SIMULATED_BANK_ID;
          });
          if (bank) bank._simNotes = [];
          w.beatCursor = 0;
          _iwBlockStates = {};
          iwBuildTerrainLayer(w);
          renderFrame();
          console.log("[InfiniteWorld] regenerated");
        },

        enableAutoStart: function (val) {
          iw().autoStart = !!val;
          console.log("[InfiniteWorld] autoStart =", iw().autoStart);
          return iw().autoStart;
        },

        toggle: function () {
          var w = iw();
          if (w.enabled) {
            w.enabled = false;
            console.log("[InfiniteWorld] toggled OFF");
          } else {
            w.enabled = true;
            var hasLayer = (state.world.layers || []).some(function (l) {
              return l._iw === true;
            });
            if (!hasLayer) {
              iwBuildTerrainLayer(w);
            }
            if (!w.probeId) {
              iwSpawnProbe(w);
            }
            _iwLastTickAt = 0;
            renderFrame();
            console.log("[InfiniteWorld] toggled ON");
          }
          return w.enabled;
        },
      };
    })();

    // ── IW Auto-start ─────────────────────────────────────────────────────────
    // If autoStart is enabled and IW has not yet been started, defer startup
    // slightly so the rest of init can complete first.
    (function () {
      var w = state.infiniteWorld;
      if (!w.autoStart) return;
      // Guard: do not start if already active or if a MIDI import is in progress
      if (w.enabled) return;
      var hasMidiImport = (state.midiBanks || []).some(function (b) {
        return !b._iw;
      });
      // Only auto-start when there are no user-imported banks (fresh load)
      if (hasMidiImport) return;
      setTimeout(function () {
        var w2 = state.infiniteWorld;
        if (!w2.autoStart || w2.enabled) return;
        var hasLayer = (state.world.layers || []).some(function (l) {
          return l._iw === true;
        });
        if (!hasLayer) {
          window._wos.infiniteWorld.start();
        }
      }, 500);
    })();

    renderFrame();

    // Behavior + particle loop — runs every frame independent of playback state
    var behaviorLastTime = 0;
    // updateEmitters — spec-compliant entry point, delegates to processBehaviors
    function updateEmitters(strokes, dt) {
      if (!strokes || !strokes.length) return;
      if (!window.SBE || !SBE.ParticleSystem || !SBE.ParticleSystem.spawn) {
        console.warn("[emitter] ParticleSystem not ready");
        return;
      }
      processBehaviors(performance.now());
    }

    // ── InfiniteWorld v1.0.0 ─────────────────────────────────────────────────

    var IW_SIMULATED_CARTRIDGE_ID = "iw_terrain_cartridge";
    var IW_SIMULATED_BANK_ID = "iw_terrain_bank";
    var IW_LAYER_LABEL = "IW Terrain";
    var IW_GRID_COLS = 18;
    var IW_GRID_ROWS = 28;
    var IW_REGION_COUNT = 6;

    // ── Region system ────────────────────────────────────────────────────────
    // 6 voronoi seeds spread across the grid (normalized 0-1 coords)
    var IW_REGION_SEEDS = [
      [0.15, 0.15],
      [0.85, 0.15],
      [0.5, 0.48],
      [0.15, 0.82],
      [0.85, 0.82],
      [0.5, 0.2],
    ];

    var _iwRegions = null;

    function iwInitRegions() {
      _iwRegions = IW_REGION_SEEDS.map(function (seed, i) {
        return {
          id: i,
          densityBias: [0.65, 0.2, 0.8, 0.4, 0.25, 0.55][i],
          energyBias: [0.5, 0.1, 0.7, 0.3, 0.15, 0.6][i],
          decayRate: [0.91, 0.97, 0.88, 0.94, 0.96, 0.9][i],
          driftSpeed: 0.00035 + i * 0.00015,
          driftPhase: (i * 1.13) % (Math.PI * 2),
          visualWeight: [0.7, 0.3, 1.0, 0.5, 0.25, 0.8][i],
        };
      });
    }

    function iwGetRegion(id) {
      if (!_iwRegions) iwInitRegions();
      return _iwRegions[id % IW_REGION_COUNT] || _iwRegions[0];
    }

    function iwBlockRegionId(col, row) {
      var nx = col / IW_GRID_COLS;
      var ny = row / IW_GRID_ROWS;
      var best = 0,
        bestDist = Infinity;
      for (var i = 0; i < IW_REGION_SEEDS.length; i++) {
        var dx = nx - IW_REGION_SEEDS[i][0];
        var dy = ny - IW_REGION_SEEDS[i][1];
        var d = dx * dx + dy * dy;
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      }
      return best;
    }

    // ── Density noise ────────────────────────────────────────────────────────
    function iwNoise2D(x, y) {
      var s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
      return s - Math.floor(s);
    }

    function iwDensityAt(col, row) {
      var n1 = iwNoise2D(col * 0.24, row * 0.17);
      var n2 = iwNoise2D(col * 0.06 + 3.1, row * 0.05 + 7.4);
      return (n1 + n2) * 0.5;
    }

    // ── Per-block render state (persists across ticks) ───────────────────────
    var _iwBlockStates = {};

    function iwGetBlockState(blockIndex, regionId) {
      if (!_iwBlockStates[blockIndex]) {
        var reg = iwGetRegion(regionId);
        _iwBlockStates[blockIndex] = {
          pulse: 0,
          glow: 0,
          driftPhase: Math.random() * Math.PI * 2,
          regionId: regionId,
          decay: reg.decayRate,
        };
      }
      return _iwBlockStates[blockIndex];
    }

    function iwDecayBlockStates(dt) {
      var keys = Object.keys(_iwBlockStates);
      for (var i = 0; i < keys.length; i++) {
        var s = _iwBlockStates[keys[i]];
        s.pulse = s.pulse * Math.pow(s.decay, dt * 60);
        s.glow = s.glow * Math.pow(0.96, dt * 60);
        if (s.pulse < 0.001) s.pulse = 0;
        if (s.glow < 0.001) s.glow = 0;
      }
    }

    // ── Probe trail ──────────────────────────────────────────────────────────
    var _iwProbeTrail = [];
    var IW_TRAIL_MAX = 28;
    var IW_TRAIL_INTERVAL_MS = 60;
    var _iwTrailLastAt = 0;

    // ── Note weights ─────────────────────────────────────────────────────────
    var IW_NOTE_WEIGHTS = [8, 2, 6, 2, 7, 5, 2, 8, 2, 6, 2, 4];
    var IW_NOTE_WEIGHT_CUM = (function () {
      var cum = [],
        t = 0;
      IW_NOTE_WEIGHTS.forEach(function (w) {
        t += w;
        cum.push(t);
      });
      return cum;
    })();
    var IW_NOTE_WEIGHT_TOTAL = IW_NOTE_WEIGHT_CUM[11];

    var IW_MOTIFS = [
      [0, 4, 7],
      [0, 3, 7],
      [0, 5, 9],
      [2, 5, 9],
      [0, 2, 4, 7],
    ];

    function iwWeightedNoteClass(regionId) {
      // Slight bias toward lower classes in ghost zones, higher in hubs
      var r = Math.random() * IW_NOTE_WEIGHT_TOTAL;
      for (var i = 0; i < IW_NOTE_WEIGHT_CUM.length; i++) {
        if (r < IW_NOTE_WEIGHT_CUM[i]) return i;
      }
      return 0;
    }

    // ── Note generation ──────────────────────────────────────────────────────
    function iwGenerateBurst(iw) {
      var density = Math.max(0.05, Math.min(1, iw.density));
      var count = Math.max(1, Math.round(density * 5));
      var notes = [];
      var useMotif = Math.random() < 0.3;
      var motif = useMotif
        ? IW_MOTIFS[Math.floor(Math.random() * IW_MOTIFS.length)]
        : null;
      for (var i = 0; i < count; i++) {
        var nc = motif ? motif[i % motif.length] : iwWeightedNoteClass();
        var oct = 2 + Math.floor(Math.random() * 4);
        var note = Math.max(24, Math.min(96, nc + oct * 12));
        notes.push({
          note: note,
          velocity: Math.round(35 + Math.random() * 75),
          time: iw.beatCursor + i * 0.25,
          duration: 0.25 + Math.random() * 0.75,
          _velNorm: (35 + Math.random() * 75) / 110,
        });
      }
      return notes;
    }

    function iwEnsureSimulatedBank(iw) {
      var GS = getGridSystem();
      if (!GS) return null;

      var existingNotes = [];
      var existingBank = state.midiBanks.find(function (b) {
        return b.id === IW_SIMULATED_BANK_ID;
      });
      if (existingBank && existingBank._simNotes)
        existingNotes = existingBank._simNotes;

      var newNotes = iwGenerateBurst(iw);
      existingNotes = existingNotes.concat(newNotes);
      if (existingNotes.length > iw.maxEvents) {
        existingNotes = existingNotes.slice(
          existingNotes.length - iw.maxEvents,
        );
      }
      iw.beatCursor += 2;

      var cartridge = {
        id: IW_SIMULATED_CARTRIDGE_ID,
        name: "IW Terrain",
        bpm: 120,
        length: iw.beatCursor,
        notes: existingNotes.map(function (n) {
          return {
            note: n.note,
            velocity: n.velocity,
            time: n.time,
            duration: n.duration,
          };
        }),
        _iw: true,
      };

      var bank = GS.createMidiBankFromCartridge(cartridge);
      if (!bank) return null;
      bank.id = IW_SIMULATED_BANK_ID;
      bank._simNotes = existingNotes;
      bank._newBurstSize = newNotes.length;
      bank._iw = true;

      state.midiBanks = state.midiBanks.filter(function (b) {
        return b.id !== IW_SIMULATED_BANK_ID;
      });
      state.midiBanks.push(bank);
      iw.terrainBankId = IW_SIMULATED_BANK_ID;
      return { bank: bank, cartridge: cartridge, newNotes: newNotes };
    }

    function iwBuildTerrainLayer(iw) {
      if (!_iwRegions) iwInitRegions();
      var GS = getGridSystem();
      if (!GS) return null;

      var banked = iwEnsureSimulatedBank(iw);
      if (!banked) return null;
      var bank = banked.bank;

      var canvasW = state.canvas.width || 1080;
      var canvasH = state.canvas.height || 1920;

      var gridSettings = {
        columns: IW_GRID_COLS,
        rows: IW_GRID_ROWS,
        cellSize: 42,
        gap: 0,
        placementMode: "packedTimeGrid",
        fitMode: "fitFrame",
        colorMode: "noteColor",
        blockStyleId: "solid_note_tile",
        framePadding: 24,
        minCellSize: 4,
        maxCellSize: 240,
        quantizeBeats: 0,
        pitchRange: { min: 24, max: 96 },
        sizeMode: "none",
        opacityMode: "none",
        wrapMode: "wrapRows",
      };

      // Remove old IW layer but preserve _iwBlockStates (keyed by index — survives rebuild)
      state.world.layers = (state.world.layers || []).filter(function (l) {
        return !l._iw;
      });

      var layer = GS.createGridLayerFromMidiBank(IW_SIMULATED_BANK_ID, {
        name: IW_LAYER_LABEL,
        grid: gridSettings,
      });
      if (!layer) return null;

      layer.label = IW_LAYER_LABEL;
      layer.status = "active";
      layer._iw = true;
      layer.renderer = {
        id: "bauhausMinimal",
        version: "1.3.1",
        paletteId: iw._paletteId || GS.DEFAULT_PALETTE_ID,
        finishId: "clean",
        viewport: Object.assign({}, GS.DEFAULT_VIEWPORT),
        reactivity: { enabled: true, mode: "noteClass" },
        tileStyle: Object.assign({}, GS.BAUHAUS_TILE_STYLES["softPrint"]),
        notePatternOverrides: {},
      };

      layer.blocks = GS.generateGridBlocksFromMidiBank(
        bank,
        gridSettings,
        layer.id,
        canvasW,
        canvasH,
      );

      // Assign region, density-based baseAlpha, and initialise block state
      var newBurstSize = bank._newBurstSize || 0;
      var totalBlocks = layer.blocks.length;
      layer.blocks.forEach(function (block, idx) {
        var regionId = iwBlockRegionId(block.col || 0, block.row || 0);
        var region = iwGetRegion(regionId);
        var density = iwDensityAt(block.col || 0, block.row || 0);

        // Sparse density field: low-density areas get low baseAlpha
        var densityBase = density * 0.5 + region.densityBias * 0.5;
        block.baseAlpha = Math.max(
          0.08,
          Math.min(0.82, densityBase * 0.88 + 0.1),
        );
        block._iwRegion = regionId;

        // Trigger pulse on freshly added blocks (last N in the array)
        var isNew = idx >= totalBlocks - newBurstSize;
        var bs = iwGetBlockState(idx, regionId);
        if (isNew && block.velocityNorm != null) {
          bs.pulse = Math.min(
            1,
            bs.pulse + block.velocityNorm * region.energyBias,
          );
          bs.glow = Math.min(
            1,
            bs.glow + block.velocityNorm * region.energyBias * 0.5,
          );
        }
      });

      layer.source = {
        type: "midiBank",
        bankId: IW_SIMULATED_BANK_ID,
        cartridgeId: IW_SIMULATED_CARTRIDGE_ID,
      };

      state.world.layers = state.world.layers || [];
      state.world.layers.push(layer);
      iw.terrainLayerId = layer.id;
      return layer;
    }

    // ── Grid offset helper (for overlay positioning) ──────────────────────────
    function iwGetGridScreenOffset() {
      var layer = (state.world.layers || []).find(function (l) {
        return l._iw;
      });
      if (!layer || !layer.grid) return { x: 0, y: 0, cellSize: 42, gap: 0 };
      var g = layer.grid;
      var GS = getGridSystem();
      var cw = state.canvas.width || 1080;
      var ch = state.canvas.height || 1920;
      var cs = GS ? GS.computeFitCellSize(g, cw, ch) : g.cellSize;
      var gw = g.columns * (cs + g.gap) - g.gap;
      var gh = g.rows * (cs + g.gap) - g.gap;
      return {
        x: Math.round((cw - gw) / 2),
        y: Math.round((ch - gh) / 2),
        cellSize: cs,
        gap: g.gap,
      };
    }

    var _iwLastTickAt = 0;
    var _iwEnergyPhase = Math.random() * Math.PI * 2;

    function updateInfiniteWorld(now, dt) {
      var iw = state.infiniteWorld;
      if (!iw || !iw.enabled) return;

      // ── Simulated audio energy (slow sine + occasional bump) ─────────────
      _iwEnergyPhase += dt * 0.35;
      var sinEnergy =
        0.22 * Math.sin(_iwEnergyPhase) + 0.08 * Math.sin(_iwEnergyPhase * 2.7);
      var bump = Math.random() < 0.008 ? 0.12 + Math.random() * 0.22 : 0;
      iw.energy = Math.max(0, Math.min(1, 0.38 + sinEnergy + bump));

      // ── Terrain tick ─────────────────────────────────────────────────────
      if (now - _iwLastTickAt >= iw.tickMs) {
        _iwLastTickAt = now;
        iwBuildTerrainLayer(iw);
      }

      // ── Per-frame block state decay + transient field injection ──────────
      iwDecayBlockStates(dt);

      var layer = (state.world.layers || []).find(function (l) {
        return l._iw;
      });
      if (layer && layer.blocks) {
        var energy = iw.energy;
        var probePx = null;
        if (iw.probeId) {
          var probe = state.balls.find(function (b) {
            return b.id === iw.probeId;
          });
          if (probe) {
            probePx = { x: probe.x, y: probe.y };
          }
        }
        var off = iwGetGridScreenOffset();

        // Cache palette color once (persists on block for overlay use)
        var GS = getGridSystem();
        var palette =
          GS &&
          GS.BAUHAUS_PALETTES[
            layer.renderer.paletteId || GS.DEFAULT_PALETTE_ID
          ];

        layer.blocks.forEach(function (block, idx) {
          var bs = iwGetBlockState(idx, block._iwRegion || 0);

          if (palette && block._iwColor == null) {
            block._iwColor = GS.getPaletteColor(block.noteClass, palette);
          }

          // Probe proximity illumination (screen-space distance)
          if (probePx) {
            var bsx = (block.x || 0) + off.x + off.cellSize * 0.5;
            var bsy = (block.y || 0) + off.y + off.cellSize * 0.5;
            var dx = bsx - probePx.x;
            var dy = bsy - probePx.y;
            var d2 = dx * dx + dy * dy;
            var illumRadius = 180;
            if (d2 < illumRadius * illumRadius) {
              var illum = (1 - Math.sqrt(d2) / illumRadius) * 0.28 * energy;
              bs.pulse = Math.min(1, bs.pulse + illum * dt * 4);
            }
          }

          // Write transient fields consumed by Bauhaus renderer
          block._pulse = Math.min(1, bs.pulse + bs.glow * 0.25);
          block._audioEnergy = energy;
          block._worldPulse = bs.pulse;
        });
      }

      // ── Probe motion (Lissajous orbit, screen-space coords) ───────────────
      if (iw.probeId) {
        var probe = state.balls.find(function (b) {
          return b.id === iw.probeId;
        });
        if (probe) {
          var t = now * 0.00022;
          var cw = state.canvas.width || 1080;
          var ch = state.canvas.height || 1920;
          probe.x = cw * 0.5 + Math.sin(t * 1.3) * cw * 0.26;
          probe.y = ch * 0.5 + Math.sin(t * 0.9 + 1.2) * ch * 0.28;
          probe.vx = 0;
          probe.vy = 0;

          // Trail capture
          if (now - _iwTrailLastAt > IW_TRAIL_INTERVAL_MS) {
            _iwTrailLastAt = now;
            _iwProbeTrail.push({ x: probe.x, y: probe.y, t: now });
            if (_iwProbeTrail.length > IW_TRAIL_MAX) {
              _iwProbeTrail.shift();
            }
          }
        } else {
          iw.probeId = null;
        }
      }
    }

    // ── renderInfiniteWorldOverlay ────────────────────────────────────────────
    function renderInfiniteWorldOverlay(ctx) {
      var iw = state.infiniteWorld;
      if (!iw || !iw.enabled) return;

      var cw = state.canvas.width || 1080;
      var ch = state.canvas.height || 1920;
      var off = iwGetGridScreenOffset();

      // ── Atmosphere: edge vignette ─────────────────────────────────────────
      var vigGrad = ctx.createRadialGradient(
        cw * 0.5,
        ch * 0.5,
        ch * 0.28,
        cw * 0.5,
        ch * 0.5,
        ch * 0.78,
      );
      vigGrad.addColorStop(0, "rgba(0,0,0,0)");
      vigGrad.addColorStop(0.6, "rgba(0,0,0,0.04)");
      vigGrad.addColorStop(1, "rgba(0,0,0,0.22)");
      ctx.fillStyle = vigGrad;
      ctx.fillRect(0, 0, cw, ch);

      // ── Atmosphere: ultra-light scanline grain (every 4 lines, very faint) ─
      if (Math.random() < 0.6) {
        // skip some frames for perf
        var scanAlpha = 0.012 + iw.energy * 0.008;
        ctx.fillStyle = "rgba(0,0,0," + scanAlpha.toFixed(3) + ")";
        var frameOffset = Math.floor(performance.now() * 0.05) % 4;
        for (var sy = frameOffset; sy < ch; sy += 4) {
          ctx.fillRect(0, sy, cw, 1);
        }
      }

      // ── Block glow halos (only high-glow blocks) ──────────────────────────
      var layer = (state.world.layers || []).find(function (l) {
        return l._iw;
      });
      if (layer && layer.blocks) {
        var cs = off.cellSize;
        layer.blocks.forEach(function (block, idx) {
          var bs = _iwBlockStates[idx];
          if (!bs || bs.glow < 0.08) return;

          var bx = (block.x || 0) + off.x + cs * 0.5;
          var by = (block.y || 0) + off.y + cs * 0.5;
          var glowR = cs * 1.2 + bs.glow * cs * 0.8;

          // Region drift: tiny oscillation on glow radius
          var reg = iwGetRegion(block._iwRegion || 0);
          var driftAmt =
            Math.sin(performance.now() * reg.driftSpeed + bs.driftPhase) * 1.5;
          glowR += driftAmt;

          var color = block._iwColor || block.color || "#aaaaaa";
          var grad = ctx.createRadialGradient(bx, by, 0, bx, by, glowR);
          grad.addColorStop(
            0,
            hexToRgba(color, bs.glow * 0.18 * reg.visualWeight),
          );
          grad.addColorStop(
            0.5,
            hexToRgba(color, bs.glow * 0.07 * reg.visualWeight),
          );
          grad.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(bx, by, glowR, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      // ── Probe trail ───────────────────────────────────────────────────────
      if (_iwProbeTrail.length > 1 && iw.probeId) {
        var now = performance.now();
        for (var i = 0; i < _iwProbeTrail.length - 1; i++) {
          var pt = _iwProbeTrail[i];
          var age = Math.max(
            0,
            1 - (now - pt.t) / (IW_TRAIL_MAX * IW_TRAIL_INTERVAL_MS),
          );
          var ta = age * age * 0.28;
          if (ta < 0.005) continue;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 2.5 + age * 2.5, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(240,190,30," + ta.toFixed(3) + ")";
          ctx.fill();
        }
      }

      // ── Probe energy ring ─────────────────────────────────────────────────
      if (iw.probeId) {
        var probe = state.balls.find(function (b) {
          return b.id === iw.probeId;
        });
        if (probe) {
          var ringT = performance.now() * 0.002;
          var ringR = 26 + Math.sin(ringT) * 5 + iw.energy * 14;
          var ringAlpha = 0.18 + iw.energy * 0.2;
          ctx.beginPath();
          ctx.arc(probe.x, probe.y, ringR, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(240,190,30," + ringAlpha.toFixed(3) + ")";
          ctx.lineWidth = 1 + iw.energy * 1.5;
          ctx.stroke();

          // Soft outer halo
          var haloGrad = ctx.createRadialGradient(
            probe.x,
            probe.y,
            ringR * 0.6,
            probe.x,
            probe.y,
            ringR * 1.8,
          );
          haloGrad.addColorStop(
            0,
            "rgba(240,190,30," + (ringAlpha * 0.3).toFixed(3) + ")",
          );
          haloGrad.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = haloGrad;
          ctx.beginPath();
          ctx.arc(probe.x, probe.y, ringR * 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Tiny helper: hex color → rgba string with alpha
    function hexToRgba(hex, alpha) {
      if (!hex || hex[0] !== "#") return "rgba(150,150,150," + alpha + ")";
      var r = parseInt(hex.slice(1, 3), 16) || 0;
      var g = parseInt(hex.slice(3, 5), 16) || 0;
      var b = parseInt(hex.slice(5, 7), 16) || 0;
      return "rgba(" + r + "," + g + "," + b + "," + alpha.toFixed(3) + ")";
    }

    function iwSpawnProbe(iw) {
      if (iw.probeId) {
        state.balls = state.balls.filter(function (b) {
          return b.id !== iw.probeId;
        });
        state.swarm.count = state.balls.length;
        iw.probeId = null;
      }
      _iwProbeTrail = [];

      var cw = state.canvas.width || 1080;
      var ch = state.canvas.height || 1920;
      var probe = normalizeBall({
        x: cw * 0.5,
        y: ch * 0.5,
        vx: 0,
        vy: 0,
        collisionRadius: 10,
        renderRadius: 18,
        color: "#f0be1e",
        style: "core",
        energy: 1,
        _infiniteProbe: true,
        sound: null,
      });
      iw.probeId = probe.id;
      state.balls.push(probe);
      state.swarm.count = state.balls.length;
      return probe;
    }

    // ── End InfiniteWorld v1.0.0 ──────────────────────────────────────────────

    // ── RouteWorld v1.0.0 ─────────────────────────────────────────────────────

    function makeId(prefix) {
      return prefix + "-" + Math.random().toString(36).slice(2, 9);
    }

    // Compute total pixel length of a polyline and cumulative distances per segment
    function computePolylineDistances(points) {
      var cumulative = [0];
      var total = 0;
      for (var i = 1; i < points.length; i++) {
        var dx = points[i].x - points[i - 1].x;
        var dy = points[i].y - points[i - 1].y;
        total += Math.hypot(dx, dy);
        cumulative.push(total);
      }
      return { total: total, cumulative: cumulative };
    }

    // Interpolate position and heading on route polyline given normalized t
    function sampleRoutePolyline(route, t) {
      var pts = route.points;
      if (!pts || pts.length === 0) return { x: 0, y: 0, heading: 0 };
      if (pts.length === 1) return { x: pts[0].x, y: pts[0].y, heading: 0 };

      var clampedT = Math.max(0, Math.min(1, t));
      var targetDist = clampedT * route._totalPixelLength;

      var cum = route._cumulativeDistances;
      // Binary search for segment
      var lo = 0,
        hi = cum.length - 2;
      while (lo < hi) {
        var mid = (lo + hi + 1) >> 1;
        if (cum[mid] <= targetDist) lo = mid;
        else hi = mid - 1;
      }
      var i = lo;
      var segLen = cum[i + 1] - cum[i];
      var segT = segLen > 0 ? (targetDist - cum[i]) / segLen : 0;

      var p0 = pts[i],
        p1 = pts[i + 1];
      var x = p0.x + (p1.x - p0.x) * segT;
      var y = p0.y + (p1.y - p0.y) * segT;
      var heading = Math.atan2(p1.y - p0.y, p1.x - p0.x);

      return { x: x, y: y, heading: heading };
    }

    // Find which segment the actor is currently on
    function findActiveSegment(rw, routeId, t) {
      var segs = rw.segments || [];
      for (var i = 0; i < segs.length; i++) {
        var s = segs[i];
        if (s.routeId === routeId && t >= s.startT && t <= s.endT) {
          return s;
        }
      }
      return null;
    }

    function checkEventZones(rw, actor, now) {
      var route = rw.routes.find(function (r) {
        return r.id === actor.routeId;
      });
      if (!route) return;
      var totalPx = route._totalPixelLength || 1;
      // Convert zone radius in meters to approx normalized t (rough px-based scale)
      // 1 meter ≈ 1 pixel in WOS canvas space for v1
      var zones = rw.eventZones || [];
      zones.forEach(function (zone) {
        if (zone.routeId !== actor.routeId) return;
        var radiusT = zone.radiusMeters / totalPx;
        if (Math.abs(actor.t - zone.t) > radiusT) return;

        var nowSec = now / 1000;
        if (nowSec - zone.lastTriggeredAt < zone.cooldownSec) return;
        if (Math.random() > zone.rarity) return;

        // Check conditions
        var worldState = rw.world || {};
        if (
          zone.conditions.weather.length > 0 &&
          !zone.conditions.weather.includes(worldState.weather)
        )
          return;
        if (
          zone.conditions.timeOfDay.length > 0 &&
          !zone.conditions.timeOfDay.includes(worldState.timeOfDay)
        )
          return;

        zone.lastTriggeredAt = nowSec;
        rw.runtime.triggeredEventIds.add(zone.id);

        (zone.actions || []).forEach(function (action) {
          if (action.type === "weatherShift" && rw.world) {
            rw.world.weather = action.weather || rw.world.weather;
          } else if (action.type === "cameraHint") {
            var cam3 = _rwEnsureCamera(rw);
            cam3.mode = action.mode || cam3.mode;
          } else if (action.type === "signalPulse") {
            // stub — future audio hook
          } else if (action.type === "spawnSwarm") {
            // stub — future swarm hook
          }
        });

        console.log(
          "[RouteWorld] event zone triggered:",
          zone.id,
          zone.label,
          zone.type,
        );
      });
    }

    function _rwEnsureCamera(rw) {
      if (!rw.camera) {
        var RC = SBE && SBE.RouteCamera;
        rw.camera = RC
          ? RC.makeCamera()
          : {
              mode: "follow",
              x: 0,
              y: 0,
              targetX: 0,
              targetY: 0,
              zoom: 1.2,
              targetZoom: 1.2,
              smoothing: 0.08,
              zoomSmoothing: 0.06,
              lookAheadDistance: 140,
              velocityInfluence: 0.35,
              deadZone: 40,
              overviewPadding: 160,
              dynamicZoom: true,
              showTrail: true,
              showHeadlight: true,
              showFlowIndicators: true,
              _speed: 0,
              _smoothSpeed: 0,
              _cinematicPhase: 0,
              _pulseT: 0,
              _overviewFitted: false,
            };
      }
      return rw.camera;
    }

    // ── Foundation Protocol lazy-init helpers ────────────────────────────────
    function _rwEnsureClock(rw) {
      if (!rw.clock) {
        var UC = SBE && SBE.UniversalClock;
        rw.clock = UC
          ? UC.makeClock()
          : {
              worldTimeScale: 60,
              worldStartSec: 8 * 3600,
              paused: false,
              _realElapsedSec: 0,
            };
      }
      return rw.clock;
    }
    function _rwEnsureEnv(rw) {
      if (!rw.env) {
        var ES = SBE && SBE.EnvironmentState;
        rw.env = ES ? ES.makeEnvironment() : { weatherType: "clear" };
      }
      return rw.env;
    }
    function _rwEnsureComms(rw) {
      if (!rw.comms) {
        var CS = SBE && SBE.CommsSystem;
        rw.comms = CS
          ? CS.makeCommsStore()
          : { messages: [], _firedTriggers: {}, _checkTimerSec: 0 };
      }
      return rw.comms;
    }
    function _rwEnsureSpatial(rw) {
      if (!rw.spatial) {
        var SI = SBE && SBE.SpatialInfrastructure;
        if (SI) {
          rw.spatial = SI.buildPhase1World(state.canvas);
        }
      }
      return rw.spatial;
    }
    function _rwEnsureBasemap(rw) {
      if (!rw.basemap) {
        var BM = SBE && SBE.BasemapRenderer;
        rw.basemap = BM
          ? BM.makeDefaultState()
          : {
              enabled: true,
              opacity: 0.35,
              zoom: 11,
              zoomLocked: false,
              style: "dark",
              tileSize: 256,
              visibleTiles: [],
              _lastZ: null,
              _lastDrawn: 0,
              _lastPending: 0,
            };
      }
      // Wire re-render callback so tile loads trigger frame updates
      if (rw.basemap && !rw.basemap._reRender) {
        rw.basemap._reRender = renderFrame;
      }
      return rw.basemap;
    }
    function _rwEnsureReferenceGeo(rw) {
      if (!rw.referenceGeography) {
        var RGL = SBE && SBE.ReferenceGeographyLayer;
        rw.referenceGeography = RGL
          ? RGL.makeDefaultState()
          : {
              enabled: true,
              layers: {
                water: true,
                roads: true,
                bridges: true,
                parks: true,
                districts: true,
              },
              opacity: 0.45,
              style: "muted",
            };
      }
      return rw.referenceGeography;
    }
    function _rwEnsureDirector(rw) {
      if (!rw.director) {
        var DM = SBE && SBE.DirectorMode;
        rw.director = DM
          ? DM.makeDirectorState()
          : {
              enabled: false,
              mode: "follow",
              manualCamera: {
                x: 0,
                y: 0,
                zoom: 1,
                isPanning: false,
                lastPointer: null,
                _primed: false,
              },
              simulation: {
                paused: false,
                speed: 1,
                routeProgressOverride: null,
              },
              reality: {
                useOverrides: false,
                timeHour: 8,
                season: "spring",
                weatherType: "clear",
                temperatureC: 9,
                daylightOverride: null,
              },
              cinema: {
                outputMode: "world",
                shotType: "overhead",
                targetActorId: null,
              },
            };
      }
      return rw.director;
    }

    // ── _corridorToRoute ──────────────────────────────────────────────────────
    // Converts a SpatialInfrastructure corridor into a full WOS route object
    // that the legacy route runtime (sampleRoutePolyline, fitRouteToCanvas, etc.)
    // can consume. Called once by _rwEnsureSpatialBootstrap.
    function _corridorToRoute(corridor) {
      var RI = SBE && SBE.RouteIngestion;
      if (!RI || !corridor || !corridor.points || corridor.points.length < 2)
        return null;
      var pts = corridor.points; // [{lat, lng, x, y, ele}] — already projected

      // Normalise: haversine distanceMeters + t (0-1)
      var normalized = RI.normalizeRoutePoints(pts);
      var totalMeters = normalized[normalized.length - 1].distanceMeters;

      // Duration from real-world km at 60 kph
      var totalKm = corridor.totalDistanceKm || totalMeters / 1000;
      var durationSec = Math.round((totalKm * 1000) / (60000 / 3600)); // 60 kph = 16.667 m/s

      // Pixel-space cumulative distances for sampleRoutePolyline()
      var pixCum = [0];
      for (var i = 1; i < pts.length; i++) {
        pixCum.push(
          pixCum[i - 1] +
            Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y),
        );
      }

      return {
        id: corridor.id,
        name: "Brooklyn → Cold Spring, NY",
        start: {
          label: "Bay Ridge, Brooklyn, NY",
          lat: pts[0].lat,
          lng: pts[0].lng,
          x: pts[0].x,
          y: pts[0].y,
        },
        end: {
          label: "Cold Spring, NY",
          lat: pts[pts.length - 1].lat,
          lng: pts[pts.length - 1].lng,
          x: pts[pts.length - 1].x,
          y: pts[pts.length - 1].y,
        },
        distanceMeters: Math.round(totalMeters),
        durationSec: durationSec,
        averageSpeedKph: 60,
        points: normalized,
        segments: [],
        metadata: {
          providerType: corridor.sourceType || "kmz",
          projection: { type: "local-bounds", scale: 1 },
        },
        _totalPixelLength: pixCum[pixCum.length - 1] || 1,
        _cumulativeDistances: pixCum,
        _skinSeed: Math.floor(Math.random() * 1e8),
      };
    }

    // ── _rwEnsureSpatialBootstrap ──────────────────────────────────────────────
    // Idempotent. Bridges the Phase 1 embedded corridor into the RouteWorld
    // runtime so the legacy route UI, camera, renderer, and simulation all work.
    // Must be called before any route or render access (even before rw.active).
    function _rwEnsureSpatialBootstrap(rw) {
      if (!rw || rw._spatialBootstrapped) return;

      var SI = SBE && SBE.SpatialInfrastructure;
      if (!SI) return;

      // Step 1: build spatial world (projection uses state.canvas)
      if (!rw.spatial) rw.spatial = SI.buildPhase1World(state.canvas);
      if (!rw.spatial || !rw.spatial.corridor) {
        console.warn(
          "[RouteWorld] spatial bootstrap: buildPhase1World returned nothing",
        );
        return;
      }
      var corridor = rw.spatial.corridor;

      // Step 2: bridge corridor into legacy route list
      if (
        !rw.routes.find(function (r) {
          return r.id === corridor.id;
        })
      ) {
        var route = _corridorToRoute(corridor);
        if (!route) {
          console.warn(
            "[RouteWorld] spatial bootstrap: _corridorToRoute failed",
          );
          return;
        }
        rw.routes.push(route);
      }

      // Step 3: runtime pointers
      rw.runtime = rw.runtime || {};
      if (!rw.runtime.activeRouteId) rw.runtime.activeRouteId = corridor.id;
      if (!rw.runtime.triggeredEventIds)
        rw.runtime.triggeredEventIds = new Set();
      if (!rw.runtime.elapsedSec) rw.runtime.elapsedSec = 0;

      // Step 4: world record (required by start())
      if (!rw.world) {
        rw.world = {
          id: makeId("rworld"),
          name: "Brooklyn → Cold Spring, NY",
          version: "1.0.0",
          provider: {
            type: "kmz",
            sourceId: "phase1-embedded",
            attribution: "",
          },
          routeId: corridor.id,
          activeCameraId: "route-follow",
          durationSec: rw.routes[rw.routes.length - 1].durationSec,
          loopMode: "destination",
          mood: "night-drive",
          timeOfDay: "morning",
          weather: "clear",
          layers: {
            map: true,
            skin: true,
            traffic: true,
            ecology: true,
            events: true,
            surfaces: true,
            subway: false,
            terrain: true,
            signals: true,
            walkers: true,
            debug: false,
            atmosphere: true,
          },
        };
      }

      // Step 5: hero-car actor at corridor start
      if (
        !rw.actors.find(function (a) {
          return a.id === "hero-car";
        })
      ) {
        var AN_bs = SBE && SBE.AgentNeeds;
        var sp = corridor.points[0] || { x: 0, y: 0, heading: 0 };
        rw.actors.push({
          id: "hero-car",
          type: "vehicle",
          role: "driver",
          routeId: corridor.id,
          t: 0,
          speed: 1,
          x: sp.x,
          y: sp.y,
          heading: 0,
          visual: { color: "#f6d36b", radius: 8, trail: true, halo: true },
          audio: { enabled: false, role: "traffic" },
          needs: AN_bs ? AN_bs.makeNeeds() : null,
        });
      }
      if (!rw.runtime.activeActorId) rw.runtime.activeActorId = "hero-car";

      // Step 6: prime camera to corridor start
      var cam_bs = _rwEnsureCamera(rw);
      var startPt = corridor.points[0];
      if (startPt && cam_bs.x === 0 && cam_bs.y === 0) {
        cam_bs.x = cam_bs.targetX = startPt.x;
        cam_bs.y = cam_bs.targetY = startPt.y;
        cam_bs._overviewFitted = false;
      }

      // Prime director manual camera to same position as route camera
      var DM_bs = SBE && SBE.DirectorMode;
      var dir_bs = _rwEnsureDirector(rw);
      if (DM_bs && dir_bs && startPt) {
        DM_bs.primeManualCamera(dir_bs, startPt.x, startPt.y, 0.5);
      }

      rw._spatialBootstrapped = true;
      console.log(
        "[RouteWorld] Phase 1 bootstrap complete — " +
          corridor.id +
          " · " +
          corridor.points.length +
          " pts · " +
          rw.spatial.districts.length +
          " districts · " +
          rw.spatial.pois.length +
          " POIs",
      );
    }

    function updateRouteWorld(now, dt) {
      var rw = state.routeWorld;
      _rwEnsureSpatialBootstrap(rw); // idempotent — runs once, safe every frame
      if (!rw || !rw.active) return;

      var rt = rw.runtime;
      var cam = _rwEnsureCamera(rw);
      var RC = SBE && SBE.RouteCamera;
      var DM = SBE && SBE.DirectorMode;

      // ── Director Mode: scale dt, honour pause ───────────────────────────
      var director = _rwEnsureDirector(rw);
      var effectiveDt = director && DM ? DM.effectiveDt(director, dt) : dt;

      rt.elapsedSec += effectiveDt;

      // ── Foundation: tick clock, environment, agent needs, comms ─────────
      var UC = SBE && SBE.UniversalClock;
      var ES = SBE && SBE.EnvironmentState;
      var AN = SBE && SBE.AgentNeeds;
      var CS = SBE && SBE.CommsSystem;
      var SI = SBE && SBE.SpatialInfrastructure;

      var clock = _rwEnsureClock(rw);
      var env = _rwEnsureEnv(rw);
      var comms = _rwEnsureComms(rw);
      var spatial = _rwEnsureSpatial(rw);

      if (UC) UC.tick(clock, effectiveDt);
      if (ES) ES.update(env, clock, effectiveDt);

      // ── Director reality overrides (applied after normal tick) ───────────
      if (
        director &&
        DM &&
        director.enabled &&
        director.reality &&
        director.reality.useOverrides
      ) {
        DM.applyRealityOverrides(director, clock, env);
      }

      // Tick agent needs (world-time delta)
      var worldDt = effectiveDt * clock.worldTimeScale;
      if (AN && rw.actors) {
        rw.actors.forEach(function (actor) {
          if (actor && actor.needs) AN.tickNeeds(actor, worldDt, env);
        });
      }

      // Comms trigger check (debounced internally)
      if (CS)
        CS.checkTriggers(comms, rw.world, env, clock, rw.actors, effectiveDt);

      var route = rw.routes.find(function (r) {
        return r.id === rt.activeRouteId;
      });
      if (!route) return;

      var duration = route.durationSec || 7200;
      var worldLoopMode = (rw.world && rw.world.loopMode) || "destination";
      var progress = rt.elapsedSec / duration;

      // ── Director progress override ────────────────────────────────────────
      var progressOverride =
        director && DM ? DM.effectiveProgress(director) : null;
      if (progressOverride != null) {
        progress = progressOverride;
        // Also seek elapsed time so resuming live feels continuous
        rt.elapsedSec = progress * duration;
      } else if (worldLoopMode === "loop") progress = progress % 1;
      else if (worldLoopMode === "destination")
        progress = Math.min(progress, 1);

      var actor = rw.actors.find(function (a) {
        return a.id === rt.activeActorId;
      });
      if (actor) {
        actor.t = progress;
        var pos = sampleRoutePolyline(route, progress);
        actor.x = pos.x;
        actor.y = pos.y;
        actor.heading = pos.heading;

        var seg = findActiveSegment(rw, route.id, progress);
        if (seg) rt.activeSegmentId = seg.id;

        // Update actor's spatial context (district, scenic moment)
        if (SI && spatial) {
          actor._district = SI.getDistrictAtActor(spatial, actor);
          actor._scenicMoment = SI.getNearestScenicMoment(spatial, actor.t);
        }

        checkEventZones(rw, actor, now);
      }

      // Camera update via RouteCamera module
      if (RC) {
        RC.update(cam, actor, route, dt, state.canvas);
      } else {
        // Fallback: simple follow
        if (actor) {
          cam.x += (actor.x - cam.x) * 0.08;
          cam.y += (actor.y - cam.y) * 0.08;
        }
      }
    }

    // ── RouteWorld cinematic renderer ────────────────────────────────────────

    function renderRouteWorldOverlay(ctx) {
      // Hard stop: this renderer uses an abstract internal coordinate system,
      // not Mapbox CSS-pixel space. It must never run when Mapbox is the substrate
      // or corridor geometry will ghost over the real map.
      if (window.SBE && SBE.Workspace &&
          SBE.Workspace.isGeographicMode && SBE.Workspace.isGeographicMode()) return;

      var rw = state.routeWorld;
      if (!rw) return;
      _rwEnsureSpatialBootstrap(rw); // idempotent — ensures corridor + route + world exist
      if (!rw.active) return;

      var route = rw.routes.find(function (r) {
        return r.id === rw.runtime.activeRouteId;
      });
      if (!route || !route.points || route.points.length < 2) return;

      var cam = _rwEnsureCamera(rw);
      var RC = SBE && SBE.RouteCamera;
      var DM_r = SBE && SBE.DirectorMode;
      var director_r = _rwEnsureDirector(rw);
      var worldLayers = (rw.world && rw.world.layers) || {};
      var canvas = state.canvas;

      // ── Get camera transform (survey uses manual camera, others use RouteCamera) ──
      var xf;
      if (
        director_r &&
        director_r.enabled &&
        director_r.mode === "survey" &&
        DM_r
      ) {
        xf = DM_r.getTransform(director_r, canvas.width, canvas.height);
        // Prime manual camera from route camera if first time in survey mode
        if (!director_r.manualCamera._primed) {
          var rxf = RC
            ? RC.getTransform(cam, canvas)
            : { tx: 0, ty: 0, scale: 1 };
          var primeX = (canvas.width / 2 - rxf.tx) / rxf.scale;
          var primeY = (canvas.height / 2 - rxf.ty) / rxf.scale;
          DM_r.primeManualCamera(director_r, primeX, primeY, rxf.scale);
          xf = DM_r.getTransform(director_r, canvas.width, canvas.height);
        }
      } else {
        xf = RC ? RC.getTransform(cam, canvas) : { tx: 0, ty: 0, scale: 1 };
      }
      var scale = xf.scale;

      ctx.save();
      ctx.translate(xf.tx, xf.ty);
      ctx.scale(scale, scale);

      // ── Layer [1]: Basemap — OSM raster tiles (drawn FIRST, beneath all) ──
      // Truth layer: geographic grounding for cinematic world development.
      var BM = SBE && SBE.BasemapRenderer;
      if (BM && rw.spatial) {
        _rwEnsureBasemap(rw);
        var debugOnBM = !!(
          worldLayers.debug ||
          (rw.world && rw.world.debugMode)
        );
        BM.render(ctx, rw, {
          transform: xf,
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
          debug: debugOnBM,
        });
      }

      // ── Layer [2]: reference geography (drawn beneath WOS corridor) ───────
      // Muted waterways, landmasses, roads, bridges, parks — geographic truth
      // scaffolding. Must render before corridor renderer to stay below.
      var RGL = SBE && SBE.ReferenceGeographyLayer;
      if (RGL && rw.spatial) {
        _rwEnsureReferenceGeo(rw);
        var debugOnR = !!(
          worldLayers.debug ||
          (rw.world && rw.world.debugMode)
        );
        RGL.render(ctx, rw, xf, { showLabels: debugOnR });
      }

      // ── Layer: route map ──────────────────────────────────────────────────
      if (worldLayers.map !== false) {
        _rwDrawRouteSkin(ctx, rw, route, scale);
        _rwDrawRouteLines(ctx, rw, route, scale);
        _rwDrawStartEndMarkers(ctx, route, scale);
      }

      // ── Layer: flow direction indicators ─────────────────────────────────
      if (worldLayers.map !== false && cam.showFlowIndicators) {
        _rwDrawFlowPulse(ctx, route, cam, scale);
      }

      // ── Layer: event zones ────────────────────────────────────────────────
      if (worldLayers.events !== false) {
        _rwDrawEventZones(ctx, rw, route, scale);
      }

      // ── Layer: corridor renderer (spatial infrastructure visualization) ───
      // Optional viz layer — draws district bands, route spine, scenic moments,
      // POIs, actor markers. Enabled by worldLayers.corridor (default true for
      // abstract surfaces; must be explicitly false to suppress).
      // Never runs in geo mode (Mapbox is substrate) — see renderRouteWorldOverlay guard.
      var CR = SBE && SBE.CorridorRenderer;
      if (CR && rw.spatial && worldLayers.corridor !== false) {
        var debugOn = !!(worldLayers.debug || (rw.world && rw.world.debugMode));
        CR.render(
          ctx,
          rw,
          {
            showRoute: worldLayers.terrain !== false,
            showDistricts: worldLayers.terrain !== false,
            showPOIs: worldLayers.signals !== false,
            showScenicMoments: worldLayers.signals !== false,
            showActors: worldLayers.walkers !== false,
            showCamera: worldLayers.walkers !== false,
            showLabels: debugOn,
            showDebug: debugOn,
          },
          scale,
          cam._pulseT || 0,
        );
      }

      // ── Layer: actor trail + headlight + actor ────────────────────────────
      // Keep existing trail/headlight rendering on top of corridor overlay.
      (rw.actors || []).forEach(function (actor) {
        if (!actor.x && !actor.y) return;
        var vis = actor.visual || {};
        var r = (vis.radius || 8) / scale;
        var col = vis.color || "#f6d36b";

        if (cam.showTrail && vis.trail) {
          _rwDrawActorTrail(ctx, actor, col, r);
        }
        if (cam.showHeadlight) {
          _rwDrawHeadlight(ctx, actor, col, r, scale);
        }
        // Actor dot drawn by CorridorRenderer when spatial is active —
        // fall back to native draw only when no spatial world loaded.
        if (!rw.spatial) {
          _rwDrawActorDot(ctx, actor, col, r);
        }
      });

      ctx.restore();

      // ── Screen-space HUD (drawn after camera restore) ─────────────────────
      _rwDrawHUD(ctx, rw, route, cam, canvas);
    }

    // ── Route lines ───────────────────────────────────────────────────────────
    function _rwDrawRouteLines(ctx, rw, route, scale) {
      var segs = rw.segments || [];
      var pts = route.points;

      if (segs.length > 0) {
        segs.forEach(function (seg) {
          if (seg.routeId !== route.id) return;
          var segPts = _rwSegmentPoints(route, seg, pts);

          var roadW =
            seg.type === "highway" ? 7 : seg.type === "local" ? 2.5 : 4;
          var col =
            seg.type === "highway"
              ? "#e0a030"
              : seg.type === "tunnel"
                ? "#556677"
                : seg.type === "bridge"
                  ? "#8899aa"
                  : seg.type === "waterfront"
                    ? "#2277aa"
                    : "#667788";

          // Shadow / glow under road
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(segPts[0].x, segPts[0].y);
          for (var j = 1; j < segPts.length; j++)
            ctx.lineTo(segPts[j].x, segPts[j].y);
          ctx.strokeStyle = col;
          ctx.lineWidth = (roadW + 6) / scale;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.globalAlpha = 0.12;
          ctx.stroke();

          // Road surface
          ctx.beginPath();
          ctx.moveTo(segPts[0].x, segPts[0].y);
          for (var k = 1; k < segPts.length; k++)
            ctx.lineTo(segPts[k].x, segPts[k].y);
          ctx.strokeStyle = col;
          ctx.lineWidth = roadW / scale;
          ctx.globalAlpha = 0.7;
          ctx.stroke();
          ctx.restore();
        });
      } else {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.strokeStyle = "#667788";
        ctx.lineWidth = 4 / scale;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.globalAlpha = 0.7;
        ctx.stroke();
        ctx.restore();
      }
    }

    function _rwSegmentPoints(route, seg, pts) {
      var cum = route._cumulativeDistances;
      var total = route._totalPixelLength || 1;
      var startDist = seg.startT * total;
      var endDist = seg.endT * total;
      var segPts = [];
      for (var i = 0; i < cum.length; i++) {
        if (cum[i] >= startDist - 1 && cum[i] <= endDist + 1)
          segPts.push(pts[i]);
      }
      segPts.unshift(sampleRoutePolyline(route, seg.startT));
      segPts.push(sampleRoutePolyline(route, seg.endT));
      return segPts;
    }

    // ── Start/end markers ─────────────────────────────────────────────────────
    function _rwDrawStartEndMarkers(ctx, route, scale) {
      var pts = route.points;
      var r = 5 / scale;
      ctx.save();

      // Start — green ring
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, r * 2.2, 0, Math.PI * 2);
      ctx.strokeStyle = "#44ff99";
      ctx.lineWidth = 1.5 / scale;
      ctx.globalAlpha = 0.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, r, 0, Math.PI * 2);
      ctx.fillStyle = "#44ff99";
      ctx.globalAlpha = 0.9;
      ctx.fill();

      // End — red ring
      ctx.beginPath();
      ctx.arc(
        pts[pts.length - 1].x,
        pts[pts.length - 1].y,
        r * 2.2,
        0,
        Math.PI * 2,
      );
      ctx.strokeStyle = "#ff4466";
      ctx.lineWidth = 1.5 / scale;
      ctx.globalAlpha = 0.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(pts[pts.length - 1].x, pts[pts.length - 1].y, r, 0, Math.PI * 2);
      ctx.fillStyle = "#ff4466";
      ctx.globalAlpha = 0.9;
      ctx.fill();

      ctx.restore();
    }

    // ── Procedural skin (buildings/water/green) ───────────────────────────────
    function _rwDrawRouteSkin(ctx, rw, route, scale) {
      var worldLayers = (rw.world && rw.world.layers) || {};
      if (worldLayers.skin === false) return;

      var skin = rw.skins[0];
      var density = (skin && skin.buildingDensity) || 0.35;
      var waterD = (skin && skin.waterDensity) || 0.15;
      var pts = route.points;
      var seed = route._skinSeed || 12345;
      var rand = (function (s) {
        return function () {
          s = (s * 16807) % 2147483647;
          return s / 2147483647;
        };
      })(seed);

      ctx.save();
      for (var si = 0; si < pts.length - 1; si++) {
        var p0 = pts[si],
          p1 = pts[si + 1];
        var mx = (p0.x + p1.x) / 2,
          my = (p0.y + p1.y) / 2;
        var nx = -(p1.y - p0.y),
          ny = p1.x - p0.x;
        var nlen = Math.hypot(nx, ny) || 1;
        nx /= nlen;
        ny /= nlen;

        var nb = Math.floor(density * 4 + 1);
        for (var bi = 0; bi < nb; bi++) {
          var side = rand() > 0.5 ? 1 : -1;
          var bx = mx + nx * side * (18 + rand() * 30) + (rand() - 0.5) * 20;
          var by = my + ny * side * (18 + rand() * 30) + (rand() - 0.5) * 20;
          var bw = 10 + rand() * 22,
            bh = 8 + rand() * 18;
          ctx.fillStyle = "rgba(60,80,100,0.28)";
          ctx.fillRect(bx - bw / 2, by - bh / 2, bw, bh);
        }
        if (si % 2 === 0) {
          var gx = mx + nx * (rand() > 0.5 ? 1 : -1) * (50 + rand() * 30);
          var gy = my + ny * (rand() > 0.5 ? 1 : -1) * (50 + rand() * 30);
          ctx.beginPath();
          ctx.arc(gx, gy, 12 + rand() * 20, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(30,90,50,0.18)";
          ctx.fill();
        }
        if (rand() < waterD) {
          var wx = mx + nx * (rand() > 0.5 ? 1 : -1) * (60 + rand() * 40);
          var wy = my + ny * (rand() > 0.5 ? 1 : -1) * (60 + rand() * 40);
          ctx.beginPath();
          ctx.ellipse(
            wx,
            wy,
            20 + rand() * 35,
            10 + rand() * 20,
            rand() * Math.PI,
            0,
            Math.PI * 2,
          );
          ctx.fillStyle = "rgba(20,60,120,0.22)";
          ctx.fill();
        }
      }
      ctx.restore();
    }

    // ── Flow direction pulse ──────────────────────────────────────────────────
    function _rwDrawFlowPulse(ctx, route, cam, scale) {
      var pulseT = cam._pulseT || 0;
      var pts = route.points;
      if (pts.length < 2) return;

      // Draw a small bright section of route centered on pulseT
      var width = 0.08; // extent of pulse in t-space
      var lo = pulseT - width / 2;
      var hi = pulseT + width / 2;

      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      // Sample a mini-polyline over the pulse range
      var steps = 8;
      ctx.beginPath();
      var started = false;
      for (var i = 0; i <= steps; i++) {
        var t = lo + (i / steps) * width;
        if (t < 0 || t > 1) continue;
        var p = sampleRoutePolyline(route, t);
        var alpha = 1 - Math.abs((t - pulseT) / (width / 2));
        if (!started) {
          ctx.moveTo(p.x, p.y);
          started = true;
        } else ctx.lineTo(p.x, p.y);
      }
      ctx.strokeStyle = "rgba(200,220,255,0.55)";
      ctx.lineWidth = 6 / scale;
      ctx.globalAlpha = 0.55;
      ctx.stroke();
      ctx.restore();
    }

    // ── Event zones ───────────────────────────────────────────────────────────
    function _rwDrawEventZones(ctx, rw, route, scale) {
      ctx.save();
      (rw.eventZones || []).forEach(function (zone) {
        if (zone.routeId !== route.id) return;
        var zp = sampleRoutePolyline(route, zone.t);
        var triggered = rw.runtime.triggeredEventIds.has(zone.id);
        ctx.beginPath();
        ctx.arc(zp.x, zp.y, 12 / scale, 0, Math.PI * 2);
        ctx.strokeStyle = triggered ? "#ffdd44" : "rgba(200,200,80,0.45)";
        ctx.lineWidth = 1.5 / scale;
        ctx.globalAlpha = 1;
        ctx.stroke();
        if (triggered) {
          ctx.beginPath();
          ctx.arc(zp.x, zp.y, 5 / scale, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255,220,60,0.5)";
          ctx.fill();
        }
      });
      ctx.restore();
    }

    // ── Actor: fading trail ───────────────────────────────────────────────────
    function _rwDrawActorTrail(ctx, actor, color, r) {
      var trail = actor._trail;
      if (!trail || trail.length < 2) return;
      ctx.save();
      ctx.lineCap = "round";
      for (var i = 1; i < trail.length; i++) {
        var alpha = (i / trail.length) * 0.45;
        var width = r * (0.4 + (i / trail.length) * 0.8);
        ctx.beginPath();
        ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
        ctx.lineTo(trail[i].x, trail[i].y);
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.globalAlpha = alpha;
        ctx.stroke();
      }
      ctx.restore();
    }

    // ── Actor: forward headlight cone ─────────────────────────────────────────
    function _rwDrawHeadlight(ctx, actor, color, r, scale) {
      var coneLen = 80 / scale;
      var coneHalf = Math.PI / 6; // 30° half-angle
      var fwd = actor.heading;

      ctx.save();
      ctx.translate(actor.x, actor.y);
      ctx.rotate(fwd);

      var grad = ctx.createRadialGradient(0, 0, r, 0, 0, coneLen);
      grad.addColorStop(0, "rgba(255,245,200,0.18)");
      grad.addColorStop(0.5, "rgba(255,245,200,0.07)");
      grad.addColorStop(1, "rgba(255,245,200,0)");

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, coneLen, -coneHalf, coneHalf);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.globalAlpha = 1;
      ctx.fill();
      ctx.restore();
    }

    // ── Actor: dot + halo ─────────────────────────────────────────────────────
    function _rwDrawActorDot(ctx, actor, color, r) {
      ctx.save();
      // Halo
      var grad = ctx.createRadialGradient(
        actor.x,
        actor.y,
        0,
        actor.x,
        actor.y,
        r * 3.5,
      );
      grad.addColorStop(0, color + "66");
      grad.addColorStop(1, "transparent");
      ctx.beginPath();
      ctx.arc(actor.x, actor.y, r * 3.5, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.globalAlpha = 1;
      ctx.fill();

      // Core dot
      ctx.beginPath();
      ctx.arc(actor.x, actor.y, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = 1;
      ctx.fill();

      // Bright centre specular
      ctx.beginPath();
      ctx.arc(actor.x - r * 0.2, actor.y - r * 0.2, r * 0.35, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.fill();
      ctx.restore();
    }

    // ── Cinematic HUD (screen space) ──────────────────────────────────────────
    function _rwDrawHUD(ctx, rw, route, cam, canvas) {
      var actor = rw.actors.find(function (a) {
        return a.id === rw.runtime.activeActorId;
      });
      var RC = SBE && SBE.RouteCamera;
      var cw = canvas.width || 1080;
      var ch = canvas.height || 1920;

      var x = 40,
        y = ch - 220;
      var lineH = 36;

      ctx.save();
      ctx.font = "600 22px/1 monospace";
      ctx.textAlign = "left";

      var speedKph = RC ? RC.getSpeedKph(cam, route) : 0;
      var distM = actor
        ? Math.round((actor.t || 0) * (route.distanceMeters || 0))
        : 0;
      var distKm = (distM / 1000).toFixed(1);

      var h = Math.floor((rw.runtime.elapsedSec || 0) / 3600);
      var m = Math.floor(((rw.runtime.elapsedSec || 0) % 3600) / 60);
      var s = Math.floor((rw.runtime.elapsedSec || 0) % 60);
      var timeLabel =
        (h > 0 ? h + ":" : "") +
        String(m).padStart(2, "0") +
        ":" +
        String(s).padStart(2, "0");

      var modeLabel = (cam.mode || "follow").toUpperCase();

      // ── Prefer WorldInspector HUD lines when spatial world is loaded ──────
      var WI = SBE && SBE.WorldInspector;
      var lines;
      if (WI && rw.spatial) {
        var snap = WI.snapshot(rw, rw.clock, rw.env, rw.comms);
        lines = [route.name || "ROUTE"].concat(WI.formatHud(snap));
      } else {
        lines = [
          route.name || "ROUTE",
          speedKph + " KPH",
          distKm + " KM",
          modeLabel,
          timeLabel,
        ];
      }

      // Subtle background pill
      ctx.fillStyle = "rgba(0,0,0,0.32)";
      ctx.globalAlpha = 1;
      var pillW = 200,
        pillH = lines.length * lineH + 24;
      ctx.beginPath();
      ctx.roundRect(x - 12, y - 8, pillW, pillH, 8);
      ctx.fill();

      lines.forEach(function (line, i) {
        var alpha = i === 0 ? 0.85 : 0.55;
        var size = i === 0 ? "600 22px" : "400 17px";
        ctx.font = size + "/1 monospace";
        ctx.fillStyle = "#e8eaed";
        ctx.globalAlpha = alpha;
        ctx.fillText(line, x, y + i * lineH + 20);
      });

      ctx.restore();
    }

    // ── End RouteWorld cinematic pass ────────────────────────────────────────

    function behaviorLoop(now) {
      var dt = behaviorLastTime
        ? Math.min(40, now - behaviorLastTime) / 1000
        : 0.016;
      behaviorLastTime = now;
      processBehaviors(now);
      updateParticles(dt);

      // InfiniteWorld runs every frame whether playing or not
      if (state.infiniteWorld && state.infiniteWorld.enabled) {
        updateInfiniteWorld(now, dt);
        renderFrame();
      }

      // RouteWorld runs every frame when active
      if (state.routeWorld && state.routeWorld.active) {
        updateRouteWorld(now, dt);
        renderFrame();
      }

      // Material simulation — runs continuously so deformation animates even when stopped
      var materialActive = false;
      if (window.SBE && SBE.MaterialSystem && !isPlaying) {
        SBE.MaterialSystem.updateAll(state.lines, dt);
        materialActive = state.lines.some(function (l) {
          if (!l.material || l.material.type === "rigid") return false;
          return (
            l.material.waveEnergy > 0.005 ||
            Math.abs(l.material.angle) > 0.005 ||
            l.material.recoilPhase > 0.005
          );
        });
      }

      // Drive render when stopped — playback loop handles it when playing
      if (!isPlaying && (state.particles.length > 0 || materialActive)) {
        renderFrame();
      }
      requestAnimationFrame(behaviorLoop);
    }
    requestAnimationFrame(behaviorLoop);

    // ── Grid System ──────────────────────────────────────

    function isPointNearSegment(p, a, b, threshold) {
      var thr = threshold != null ? threshold : 8;
      var dx = b.x - a.x;
      var dy = b.y - a.y;
      var lengthSq = dx * dx + dy * dy;
      if (lengthSq === 0) return Math.hypot(p.x - a.x, p.y - a.y) < thr;
      var t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq;
      t = Math.max(0, Math.min(1, t));
      var projX = a.x + t * dx;
      var projY = a.y + t * dy;
      return Math.hypot(p.x - projX, p.y - projY) < thr;
    }

    function getStrokeAtPoint(pt) {
      for (var i = state.strokes.length - 1; i >= 0; i--) {
        var s = state.strokes[i];
        if (!s.points || s.points.length < 2) continue;
        // Locked-layer gate — fully non-interactive
        if (isLayerLockedById(s.layerId)) continue;
        // Hidden-layer gate — invisible = non-interactive
        if (s.layerId && state.layers) {
          var _hl = state.layers.find(function (l) {
            return l.id === s.layerId;
          });
          if (_hl && !_hl.visible) continue;
        }
        for (var j = 0; j < s.points.length - 1; j++) {
          if (isPointNearSegment(pt, s.points[j], s.points[j + 1])) {
            return s;
          }
        }
      }
      return null;
    }

    function snapPoint(pt) {
      if (!state.grid.enabled || !state.grid.snap) return pt;
      var g = state.grid.size;
      return {
        x: Math.round(pt.x / g) * g,
        y: Math.round(pt.y / g) * g,
      };
    }

    function drawGrid(ctx, width, height) {
      if (!state.grid.enabled) return;
      var g = state.grid.size;
      ctx.save();
      ctx.globalAlpha = 0.08;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      for (var x = 0; x < width; x += g) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (var y = 0; y < height; y += g) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      ctx.restore();
    }

    // ── Shape Library ────────────────────────────────────

    function normalizePoints(points) {
      var minX = Math.min.apply(
        null,
        points.map(function (p) {
          return p.x;
        }),
      );
      var minY = Math.min.apply(
        null,
        points.map(function (p) {
          return p.y;
        }),
      );
      return points.map(function (p) {
        return { x: p.x - minX, y: p.y - minY };
      });
    }

    function saveShapeFromStroke(stroke, name) {
      if (!stroke || !stroke.points || stroke.points.length < 2) return null;
      var shapeName = name || "custom";
      var normalized = normalizePoints(stroke.points);
      var shape = {
        id: "shape_" + Math.random().toString(36).slice(2),
        name: shapeName,
        points: normalized,
      };
      try {
        var shapes = JSON.parse(localStorage.getItem("wos_shapes") || "[]");
        shapes.push(shape);
        localStorage.setItem("wos_shapes", JSON.stringify(shapes));
      } catch (e) {
        console.warn("[shapes] localStorage save failed:", e);
      }
      return shape;
    }

    function loadShapes() {
      try {
        return JSON.parse(localStorage.getItem("wos_shapes") || "[]");
      } catch (e) {
        return [];
      }
    }

    function createShapeInstance(shape, position) {
      if (!shape || !shape.points || shape.points.length < 2) return null;
      var pos = position || { x: 100, y: 100 };
      var pts = shape.points.map(function (p) {
        return { x: p.x + pos.x, y: p.y + pos.y };
      });
      var stroke = createStrokeObject(pts[0].x, pts[0].y);
      stroke.points = pts;
      pushHistory();
      state.strokes.push(stroke);
      analyzeStroke(stroke);
      renderFrame();
      return stroke;
    }

    function getSelectedStroke() {
      return (
        state.strokes.find(function (s) {
          return s.id === state.selection.strokeId;
        }) || null
      );
    }

    function saveSelectedShape() {
      var stroke = getSelectedStroke();
      if (!stroke) {
        showToast("Select a stroke first (Pen tool)");
        return;
      }
      var name = window.prompt("Shape name?", "custom");
      if (name === null) return; // cancelled
      var shape = saveShapeFromStroke(stroke, name || "custom");
      if (shape) showToast("Saved shape: " + shape.name);
    }

    // ── Object Grouping System (v1.1.0) ──────────────────────────────────────
    // Wrapper layer on top of state.strokes. No engine changes.

    function identityTransform() {
      return { x: 0, y: 0, rotation: 0, scale: 1 };
    }

    // Recursively collect all leaf strokeIds from a group (handles nested groups)
    function getGroupChildrenDeep(groupId) {
      var result = [];
      var stack = [groupId];
      while (stack.length) {
        var id = stack.pop();
        if (state.groups[id]) {
          var g = state.groups[id];
          // Push nested child groups onto stack
          g.children.forEach(function (cid) {
            stack.push(cid);
          });
          // Add direct stroke members
          g.strokeIds.forEach(function (sid) {
            result.push(sid);
          });
        }
      }
      return result;
    }

    // Compute pivot for a group (centroid of all member strokes, or manual)
    function computePivot(group) {
      if (group.pivot && group.pivot.mode === "manual") {
        return { x: group.pivot.x, y: group.pivot.y };
      }
      var strokeIds = getGroupChildrenDeep(group.id);
      var totalX = 0,
        totalY = 0,
        totalPts = 0;
      strokeIds.forEach(function (sid) {
        var stroke = state.strokes.find(function (s) {
          return s.id === sid;
        });
        if (!stroke) return;
        stroke.points.forEach(function (p) {
          totalX += p.x;
          totalY += p.y;
          totalPts++;
        });
      });
      if (!totalPts) return { x: 0, y: 0 };
      return { x: totalX / totalPts, y: totalY / totalPts };
    }

    function createGroup(strokeIds, childGroupIds) {
      var id =
        "group_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
      var children = (childGroupIds || []).slice();
      var group = {
        id: id,
        type: "group",
        strokeIds: strokeIds.slice(),
        parentId: null,
        children: children,
        transform: identityTransform(),
        pivot: { x: 0, y: 0, mode: "centroid" },
      };
      // Tag strokes with their group
      strokeIds.forEach(function (sid) {
        var stroke = state.strokes.find(function (s) {
          return s.id === sid;
        });
        if (stroke) stroke._groupId = id;
      });
      // Tag nested groups with their parent
      children.forEach(function (cid) {
        if (state.groups[cid]) state.groups[cid].parentId = id;
      });
      state.groups[id] = group;
      clearDuplicationDelta();
      console.log(
        "[group] Created:",
        id,
        "strokes:",
        strokeIds.length,
        "childGroups:",
        children.length,
      );
      // Immediately select the new group
      if (typeof syncLegacySelection === "function") {
        state.selection.groupId = id;
        state.selection.strokeId = null;
        if (state.selection.strokeIds) state.selection.strokeIds.clear();
        state.multiSelection = [{ type: "group", id: id }];
        syncLegacySelection();
        if (typeof syncSelectionPanel === "function") syncSelectionPanel();
        renderFrame();
      }
      return group;
    }

    function dissolveGroup(groupId) {
      var group = state.groups[groupId];
      if (!group) return;
      // Remove _groupId from direct strokes
      group.strokeIds.forEach(function (sid) {
        var stroke = state.strokes.find(function (s) {
          return s.id === sid;
        });
        if (stroke) delete stroke._groupId;
      });
      // Unparent child groups
      group.children.forEach(function (cid) {
        if (state.groups[cid]) state.groups[cid].parentId = null;
      });
      delete state.groups[groupId];
    }

    function getGroupForStroke(stroke) {
      if (!stroke._groupId) return null;
      return state.groups[stroke._groupId] || null;
    }

    function getStrokesInGroup(groupId) {
      var strokeIds = getGroupChildrenDeep(groupId);
      return strokeIds
        .map(function (sid) {
          return state.strokes.find(function (s) {
            return s.id === sid;
          });
        })
        .filter(Boolean);
    }

    // Translate: move all deep children
    function translateGroup(groupId, dx, dy) {
      var group = state.groups[groupId];
      if (!group) return;
      group.transform.x += dx;
      group.transform.y += dy;
      getStrokesInGroup(groupId).forEach(function (stroke) {
        moveStroke(stroke, dx, dy);
      });
    }

    // Scale: scale all deep children around group pivot
    function scaleGroup(groupId, factor) {
      var group = state.groups[groupId];
      if (!group) return;
      group.transform.scale *= factor;
      var pivot = computePivot(group);
      getStrokesInGroup(groupId).forEach(function (stroke) {
        scaleStroke(stroke, { x: pivot.x, y: pivot.y }, factor);
      });
    }

    // Rotate: rotate all deep children around group pivot
    function rotateGroup(groupId, dAngle) {
      var group = state.groups[groupId];
      if (!group) return;
      group.transform.rotation += dAngle;
      var pivot = computePivot(group);
      getStrokesInGroup(groupId).forEach(function (stroke) {
        rotateStroke(stroke, pivot.x, pivot.y, dAngle);
      });
    }

    // Delete a single stroke (removes from state.strokes + any group membership)
    function deleteStroke(strokeId) {
      // Fade/stop any playing samples owned by this stroke before removing it
      stopVoicesForObject(strokeId, 80);

      var stroke = state.strokes.find(function (s) {
        return s.id === strokeId;
      });
      if (stroke && stroke._groupId) {
        var group = state.groups[stroke._groupId];
        if (group) {
          group.strokeIds = group.strokeIds.filter(function (sid) {
            return sid !== strokeId;
          });
          if (group.strokeIds.length === 0 && group.children.length === 0) {
            dissolveGroup(stroke._groupId); // auto-dissolve empty groups
          }
        }
      }
      state.strokes = state.strokes.filter(function (s) {
        return s.id !== strokeId;
      });
      // Remove the bridge lines created for this stroke
      removeLinesForStroke(strokeId);
      // Also remove any walkers attached to this stroke
      state.walkers = state.walkers.filter(function (w) {
        return !w.stroke || w.stroke.id !== strokeId;
      });
    }

    // ── End Grouping System ──────────────────────────────────────────────────

    // Apply a function to all selected strokes (multi-select or single)
    function applyToSelection(fn) {
      if (state.selection.strokeIds && state.selection.strokeIds.size > 0) {
        state.selection.strokeIds.forEach(function (id) {
          var s = getStrokeById(id);
          if (s) fn(s);
        });
      } else {
        var s = getSelectedStroke();
        if (s) fn(s);
      }
    }

    function getStrokeById(id) {
      return (
        state.strokes.find(function (s) {
          return s.id === id;
        }) || null
      );
    }

    function computeGroupBounds(groupId) {
      var strokeIds = getGroupChildrenDeep(groupId);
      var minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      strokeIds.forEach(function (sid) {
        var s = getStrokeById(sid);
        if (!s) return;
        s.points.forEach(function (p) {
          if (p.x < minX) minX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.x > maxX) maxX = p.x;
          if (p.y > maxY) maxY = p.y;
        });
      });
      if (!isFinite(minX)) return null;
      return {
        minX: minX,
        minY: minY,
        maxX: maxX,
        maxY: maxY,
        w: maxX - minX || 1,
        h: maxY - minY || 1,
      };
    }

    // Apply style properties to all selected strokes (single or group)
    function applyStyleToSelection(style) {
      var targets = getSelectedStrokeTargets();
      targets.forEach(function (s) {
        Object.assign(s, style);
        // Color change: reset fx.colorSource to "note" so resolveFXColor uses stroke.color
        if (style.color !== undefined) {
          if (s.motion && s.motion.fx) {
            s.motion.fx.colorSource = "note";
            s.motion.fx.color = style.color; // keep in sync for consistency
          }
        }
        applyStrokeUpdates(s);
      });
      renderFrame();
    }

    // Hard invariant: group selection and stroke selection are mutually exclusive
    // Priority: strokeIds > strokeId > groupId
    function resolveTransformTargets() {
      if (state.selection.strokeIds && state.selection.strokeIds.size > 0) {
        return Array.from(state.selection.strokeIds)
          .map(function (id) {
            return state.strokes.find(function (s) {
              return s.id === id;
            });
          })
          .filter(Boolean);
      }
      if (state.selection.strokeId) {
        var s = state.strokes.find(function (st) {
          return st.id === state.selection.strokeId;
        });
        return s ? [s] : [];
      }
      if (state.selection.groupId) {
        return typeof getGroupChildrenDeep === "function"
          ? getGroupChildrenDeep(state.selection.groupId)
              .map(function (id) {
                return state.strokes.find(function (s) {
                  return s.id === id;
                });
              })
              .filter(Boolean)
          : [];
      }
      return [];
    }

    function clearDuplicationDelta() {
      state.duplication.valid = false;
      state.duplication.dx = 0;
      state.duplication.dy = 0;
      state.duplication.rotation = 0;
      state.duplication.scale = 1;
    }

    function enforceSelectionMode() {
      if (state.selection.groupId) {
        if (state.selection.strokeIds) state.selection.strokeIds.clear();
        state.selection.strokeId = null;
      }
    }

    function selectGroupOnly(groupId) {
      state.selection.groupId = groupId;
      state.selection.strokeId = null;
      if (state.selection.strokeIds) state.selection.strokeIds.clear();
      state.multiSelection = [{ type: "group", id: groupId }];
      syncLegacySelection();
      syncSelectionPanel();
      renderFrame();
    }

    function selectStrokesOnly(ids) {
      state.selection.groupId = null;
      state.selection.strokeId = ids.length === 1 ? ids[0] : null;
      state.selection.strokeIds = new Set(ids);
      state.multiSelection = ids.map(function (id) {
        return { type: "stroke", id: id };
      });
      syncLegacySelection();
      syncSelectionPanel();
      renderFrame();
    }

    function getSelectedStrokeTargets() {
      if (state.selection.groupId) {
        return getGroupChildrenDeep(state.selection.groupId)
          .map(getStrokeById)
          .filter(Boolean);
      }
      if (state.selection.strokeIds && state.selection.strokeIds.size > 0) {
        return Array.from(state.selection.strokeIds)
          .map(getStrokeById)
          .filter(Boolean);
      }
      if (state.selection.strokeId) {
        var s = getStrokeById(state.selection.strokeId);
        return s ? [s] : [];
      }
      return [];
    }

    function ungroupSelected() {
      var groupId = state.selection.groupId;
      if (!groupId || !state.groups[groupId]) return;
      var childIds = getGroupChildrenDeep(groupId);
      // Clear _groupId from strokes
      childIds.forEach(function (sid) {
        var s = getStrokeById(sid);
        if (s) delete s._groupId;
      });
      delete state.groups[groupId];
      selectStrokesOnly(childIds);
    }

    function computeStrokeSetBounds(ids) {
      var minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      ids.forEach(function (id) {
        var s = getStrokeById(id);
        if (!s || !s.points) return;
        s.points.forEach(function (p) {
          if (p.x < minX) minX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.x > maxX) maxX = p.x;
          if (p.y > maxY) maxY = p.y;
        });
      });
      if (!isFinite(minX)) return null;
      return {
        minX: minX,
        minY: minY,
        maxX: maxX,
        maxY: maxY,
        w: maxX - minX || 1,
        h: maxY - minY || 1,
      };
    }

    function isDerivedStrokeLine(line) {
      return !!(line && (line._isDerived || line._strokeId));
    }

    function rebuildDerivedState() {
      // Remove every stroke-derived bridge line regardless of marker version
      state.lines = (state.lines || []).filter(function (l) {
        return !isDerivedStrokeLine(l);
      });
      // Rebuild bridge lines from current strokes only
      (state.strokes || []).forEach(function (s) {
        strokeToLines(s);
      });
      // Re-tag _groupId from restored group map
      Object.values(state.groups || {}).forEach(function (group) {
        (group.strokeIds || []).forEach(function (sid) {
          var stroke = getStrokeById(sid);
          if (stroke) stroke._groupId = group.id;
        });
      });
      // Refresh walker path refs or drop orphan walkers
      (state.walkers || []).forEach(function (w) {
        if (w.strokeId && w.path && w.path.type === "stroke") {
          var stroke = getStrokeById(w.strokeId);
          if (stroke) {
            w.stroke = stroke;
            w.path.points = stroke.points;
            w.path.closed = isStrokeClosed(stroke);
          } else {
            w._dead = true;
          }
        }
      });
      state.walkers = (state.walkers || []).filter(function (w) {
        return !w._dead;
      });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ── MIDI Ink System v1.0.0 ───────────────────────────────────────────
    // ═══════════════════════════════════════════════════════════════════════

    // ── Fallback instrument — audible sine even with no samples ────────────
    // ── MIDI velocity floor — keeps soft notes audible ─────────────────────
    function normalizeMidiVelocity(velocity) {
      var v = typeof velocity === "number" ? velocity : 100;
      return Math.max(72, Math.min(127, Math.round(v)));
    }

    function playFallbackInstrument(note, velocity) {
      var ctx = ensureAudioContext();
      if (!ctx) return;
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      var freq = 440 * Math.pow(2, (note - 69) / 12);
      var now = ctx.currentTime;
      var safeVelocity = normalizeMidiVelocity(velocity);
      var peakGain = 0.3 + (safeVelocity / 127) * 0.7;
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(peakGain, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
      osc.connect(gain);
      gain.connect(AudioEngine.output());
      osc.start(now);
      osc.stop(now + 0.34);
    }

    // ── Bank helpers ───────────────────────────────────────────────────────
    function getMidiBank(id) {
      if (!id) return null;
      return (
        state.midiBanks.find(function (b) {
          return b.id === id;
        }) || null
      );
    }

    function getMidiCartridge(id) {
      if (!id) return null;
      return (
        state.midiCartridges.find(function (c) {
          return c.id === id;
        }) || null
      );
    }

    // ── Grid Layer System ──────────────────────────────────────────────────
    function getGridSystem() {
      return (window.SBE && SBE.GridSystem) || null;
    }

    function getOrCreateGridBank(cartridge) {
      if (!cartridge) return null;
      var GS = getGridSystem();
      if (!GS) return null;
      if (!state.gridBanks[cartridge.id]) {
        state.gridBanks[cartridge.id] =
          GS.createMidiBankFromCartridge(cartridge);
      }
      return state.gridBanks[cartridge.id];
    }

    function addBankToGridLayer(cartridgeId, options) {
      var GS = getGridSystem();
      if (!GS) {
        console.warn("[WOS GRID] GridSystem not loaded");
        return null;
      }
      var cartridge = getMidiCartridge(cartridgeId);
      if (!cartridge) {
        console.warn(
          "[WOS GRID] Cannot add to grid layer: cartridge not found:",
          cartridgeId,
        );
        return null;
      }
      var bank = getOrCreateGridBank(cartridge);
      if (!bank || !bank.events || !bank.events.length) {
        console.warn("[WOS GRID] Cannot generate grid: no MIDI bank events");
        return null;
      }

      // Find existing grid layer for this bank or create new one
      var layer = (state.world.layers || []).find(function (l) {
        return l.type === "grid" && l.source && l.source.bankId === bank.id;
      });

      if (!layer) {
        // Auto-number new grid layers
        var existing = (state.world.layers || []).filter(function (l) {
          return l.type === "grid";
        });
        var num = String(existing.length + 1).padStart(2, "0");
        layer = GS.createGridLayerFromMidiBank(
          bank.id,
          Object.assign({ name: "Environment Grid " + num }, options || {}),
        );
        if (!layer) return null;
        state.world.layers = state.world.layers || [];
        state.world.layers.push(layer);
      }

      // Generate blocks
      layer.blocks = GS.generateGridBlocksFromMidiBank(
        bank,
        layer.grid,
        layer.id,
        state.canvas.width,
        state.canvas.height,
      );
      console.log(
        "[WOS GRID] Layer ready:",
        layer.id,
        "blocks:",
        layer.blocks.length,
      );
      return layer;
    }

    function regenerateGridLayer(layerId, gridSettingsOverride) {
      var GS = getGridSystem();
      if (!GS) return null;
      var layer = (state.world.layers || []).find(function (l) {
        return l.id === layerId;
      });
      if (!layer || layer.type !== "grid") {
        console.warn(
          "[WOS GRID] regenerateGridLayer: layer not found:",
          layerId,
        );
        return null;
      }
      if (gridSettingsOverride) {
        Object.assign(layer.grid, gridSettingsOverride);
      }
      var cartridgeId = null;
      // bank.id === cartridge.id (from createMidiBankFromCartridge)
      var bankId = layer.source && layer.source.bankId;
      var bank = bankId ? state.gridBanks[bankId] : null;
      if (!bank) {
        // Fallback: build from cartridge matching bankId
        var cart = getMidiCartridge(bankId);
        bank = cart ? getOrCreateGridBank(cart) : null;
      }
      if (!bank) {
        console.warn(
          "[WOS GRID] regenerateGridLayer: bank not found for layer",
          layerId,
        );
        return null;
      }
      layer.blocks = GS.generateGridBlocksFromMidiBank(
        bank,
        layer.grid,
        layer.id,
        state.canvas.width,
        state.canvas.height,
      );
      return layer;
    }

    // ── Canonical Bauhaus grid generator ──────────────────────────────────────
    // ── Bank/cartridge resolver — handles bank id, cartridge id, or active id ──
    function resolveMidiBankAndCartridge(inputId) {
      var id = inputId || state.activeMidiBankId || null;
      // Last resort: first cartridge
      if (!id && state.midiCartridges && state.midiCartridges[0]) {
        id = state.midiCartridges[0].id;
      }
      var banks = state.midiBanks || [];
      var cartridges = state.midiCartridges || [];

      var bank = null;
      var cartridge = null;

      if (id) {
        bank =
          banks.find(function (b) {
            return b && b.id === id;
          }) || null;
        cartridge =
          cartridges.find(function (c) {
            return c && c.id === id;
          }) || null;
      }

      // Input was a cartridge id — find its bank
      if (cartridge && !bank) {
        bank =
          banks.find(function (b) {
            return (
              b &&
              (b.cartridgeId === cartridge.id ||
                b.sourceCartridgeId === cartridge.id)
            );
          }) || null;
      }

      // Input was a bank id — find its cartridge
      if (bank && !cartridge) {
        var cid = bank.cartridgeId || bank.sourceCartridgeId || null;
        if (cid)
          cartridge =
            cartridges.find(function (c) {
              return c && c.id === cid;
            }) || null;
      }

      // Fallback: older paths use same id for both bank and cartridge
      if (bank && !cartridge) {
        cartridge =
          cartridges.find(function (c) {
            return c && c.id === bank.id;
          }) || null;
      }

      // If we have a cartridge but no real bank, synthesize a minimal bank wrapper
      if (cartridge && !bank) {
        bank = {
          id: cartridge.id,
          cartridgeId: cartridge.id,
          name: cartridge.name || "Imported MIDI",
          events: null,
        };
      }

      return {
        inputId: id,
        bank: bank,
        cartridge: cartridge,
        bankId: bank ? bank.id : null,
        cartridgeId: cartridge ? cartridge.id : null,
      };
    }

    // ── Event source for a resolved bank/cartridge (mirrors normalizeMidiPlaybackEvent) ──
    function getMidiPlaybackEventsForResolvedSource(bank, cartridge) {
      if (bank && Array.isArray(bank.events) && bank.events.length) {
        return bank.events.map(normalizeMidiPlaybackEvent).filter(Boolean);
      }
      if (bank && Array.isArray(bank.notes) && bank.notes.length) {
        return bank.notes.map(normalizeMidiPlaybackEvent).filter(Boolean);
      }
      if (
        cartridge &&
        Array.isArray(cartridge.notes) &&
        cartridge.notes.length
      ) {
        return cartridge.notes.map(normalizeMidiPlaybackEvent).filter(Boolean);
      }
      return [];
    }

    function generateBauhausGrid(selectedBankId) {
      var GS = getGridSystem();
      if (!GS) {
        console.warn("[BAUHAUS GRID] GridSystem not loaded");
        return null;
      }

      var resolved = resolveMidiBankAndCartridge(selectedBankId);
      var bank = resolved.bank;
      var cartridge = resolved.cartridge;

      if (!bank && !cartridge) {
        console.warn("[BAUHAUS GRID] Drop a MIDI file first");
        return null;
      }
      if (!cartridge) {
        console.warn("[BAUHAUS GRID] Cartridge not found:", {
          inputId: resolved.inputId,
          bankId: resolved.bankId,
          activeMidiBankId: state.activeMidiBankId,
        });
        return null;
      }

      // Ensure grid bank (event-expanded form) exists
      var gridBank = getOrCreateGridBank(cartridge);

      // Events: prefer expanded grid bank, fall back through resolved sources
      var events = getMidiPlaybackEventsForResolvedSource(
        gridBank || bank,
        cartridge,
      );
      if (!events.length) {
        console.warn("[BAUHAUS GRID] No MIDI events found for source", {
          bankId: resolved.bankId,
          cartridgeId: resolved.cartridgeId,
        });
        return null;
      }

      var sourceBankId = (gridBank || bank).id;
      var sourceCartridgeId = cartridge.id;

      // Compute canonical dimensions from event count + frame
      var canvasW = state.canvas.width || 1080;
      var canvasH = state.canvas.height || 1920;
      var canonical = GS.CANONICAL_BAUHAUS_GRID;
      var dims = GS.computePackedGridDimensions(
        events.length,
        canvasW,
        canvasH,
      );
      var cellSize = GS.computeFitCellSize(
        {
          columns: dims.columns,
          rows: dims.rows,
          framePadding: canonical.padding,
          gap: canonical.gap,
          minCellSize: canonical.minCellSize,
          maxCellSize: canonical.maxCellSize,
        },
        canvasW,
        canvasH,
      );

      var gridSettings = {
        columns: dims.columns,
        rows: dims.rows,
        cellSize: cellSize,
        gap: canonical.gap,
        placementMode: canonical.placementMode,
        fitMode: canonical.fitMode,
        colorMode: canonical.colorMode,
        blockStyleId: canonical.blockStyleId,
        framePadding: canonical.padding,
        minCellSize: canonical.minCellSize,
        maxCellSize: canonical.maxCellSize,
        quantizeBeats: 0,
        pitchRange: { min: 36, max: 84 },
        sizeMode: "none",
        opacityMode: "none",
        wrapMode: "wrapRows",
      };

      // Preserve palette/finish/viewport/tileStyle across regeneration
      var prevGrid = (state.world.layers || []).find(function (l) {
        return (
          l.type === "grid" &&
          l.renderer &&
          l.renderer.id === canonical.rendererId
        );
      });
      var prevPaletteId = prevGrid && prevGrid.renderer.paletteId;
      var prevFinishId = prevGrid && prevGrid.renderer.finishId;
      var prevViewport =
        prevGrid && prevGrid.renderer.viewport
          ? Object.assign({}, prevGrid.renderer.viewport)
          : null;
      var prevReactivity =
        prevGrid && prevGrid.renderer.reactivity
          ? Object.assign({}, prevGrid.renderer.reactivity)
          : null;
      var prevTileStyle =
        prevGrid && prevGrid.renderer.tileStyle
          ? Object.assign({}, prevGrid.renderer.tileStyle)
          : null;
      var prevNotePatternOvr =
        prevGrid && prevGrid.renderer.notePatternOverrides
          ? Object.assign({}, prevGrid.renderer.notePatternOverrides)
          : null;

      // One canonical grid layer — replace all existing grid layers
      state.world.layers = (state.world.layers || []).filter(function (l) {
        return l.type !== "grid";
      });

      var layer = GS.createGridLayerFromMidiBank(sourceBankId, {
        name: "Bauhaus Grid",
        grid: gridSettings,
      });
      if (!layer) return null;

      layer.label = "Bauhaus Grid";
      layer.status = "active";
      var defaultTileStyle = Object.assign(
        {},
        GS.BAUHAUS_TILE_STYLES[GS.DEFAULT_TILE_STYLE_ID],
      );
      var notePatternOvr = prevNotePatternOvr || {};
      layer.renderer = {
        id: canonical.rendererId,
        version: "1.3.1",
        paletteId: prevPaletteId || GS.DEFAULT_PALETTE_ID,
        finishId: prevFinishId || GS.DEFAULT_FINISH_ID,
        viewport: prevViewport || Object.assign({}, GS.DEFAULT_VIEWPORT),
        reactivity: prevReactivity || { enabled: false, mode: "off" },
        tileStyle: prevTileStyle || defaultTileStyle,
        notePatternOverrides: notePatternOvr,
      };
      GS.setActiveNotePatternOverrides(notePatternOvr);
      layer.audio = { channelId: canonical.audioChannelId };
      layer.grid.visualLanguage = "bauhausMinimal";
      layer.grid.visualVersion = "1.3.1";
      layer.source = {
        type: "midiBank",
        bankId: sourceBankId,
        cartridgeId: sourceCartridgeId,
      };

      // Generate blocks from the same event set used for counting
      var bankForBlocks = gridBank || {
        id: sourceBankId,
        events: events.map(function (e) {
          return e.raw || e;
        }),
      };
      layer.blocks = GS.generateGridBlocksFromMidiBank(
        bankForBlocks,
        gridSettings,
        layer.id,
        canvasW,
        canvasH,
      );

      state.world.layers.push(layer);

      var playbackEvents = getMidiNoteEventsForPlayback().length;
      var sourceNotes = events.length;
      var gridBlocks = layer.blocks.length;

      if (sourceNotes !== gridBlocks) {
        console.warn("[BAUHAUS GRID] Count mismatch", {
          sourceNotes: sourceNotes,
          playbackEvents: playbackEvents,
          gridBlocks: gridBlocks,
        });
      }

      console.log("[BAUHAUS GRID] Generated", {
        bankId: sourceBankId,
        cartridgeId: sourceCartridgeId,
        sourceNotes: sourceNotes,
        playbackEvents: playbackEvents,
        gridBlocks: gridBlocks,
        columns: dims.columns,
        rows: dims.rows,
        cellSize: cellSize,
      });

      return layer;
    }

    function clearGridLayers() {
      var before = (state.world.layers || []).filter(function (l) {
        return l.type === "grid";
      }).length;
      state.world.layers = (state.world.layers || []).filter(function (l) {
        return l.type !== "grid";
      });
      return before;
    }

    function isBauhausBlockActive(block) {
      var activeNotes =
        state.midiPlayback && state.midiPlayback.activeNotes
          ? state.midiPlayback.activeNotes
          : [];
      if (
        activeNotes.some(function (n) {
          return (
            n &&
            (n.id === block.sourceEventId ||
              n.index === block.sourceIndex ||
              n.index === block.sequenceIndex)
          );
        })
      )
        return true;
      var na = noteActivity[block.noteClass];
      return !!na && performance.now() - na < 120;
    }

    function isBauhausBlockPlayhead(block) {
      var mp = state.midiPlayback;
      if (!mp) return false;
      if (
        mp.playheadEventIndex != null &&
        block.sourceIndex === mp.playheadEventIndex
      )
        return true;
      if (
        mp.playheadEventId != null &&
        block.sourceEventId === mp.playheadEventId
      )
        return true;
      return false;
    }

    function getBauhausBlockPulse(block) {
      if (!block.active) return 0;
      var last =
        typeof block.noteClass === "number"
          ? noteActivity[block.noteClass]
          : null;
      if (!last) return 1;
      var age = performance.now() - last;
      return Math.max(0, 1 - age / 160);
    }

    function renderGridLayers(ctx) {
      var GS = getGridSystem();
      if (
        !GS ||
        !state.world ||
        !state.world.layers ||
        !state.world.layers.length
      )
        return;
      var currentBeat = 0;
      var beatDuration = 60 / Math.max(1, state.bpm);
      if (isPlaying) {
        currentBeat = getTransportTime() / beatDuration;
      }

      // Decay signal activations each render frame
      var sigNow = performance.now();
      updateSignalActivity(sigNow);

      state.world.layers.forEach(function (layer) {
        if (layer.type !== "grid" || !layer.visible) return;
        // Update active flag using canonical bridge first, fallback to beat window
        if (layer.blocks) {
          layer.blocks.forEach(function (block) {
            block.active = isBauhausBlockActive(block);
            block._pulse = getBauhausBlockPulse(block);
            block.playhead = isBauhausBlockPlayhead(block);
          });
        }

        // Write per-block structured signal state from signalActivity map
        var sa = state.signalActivity;
        var totalSig = 0;
        if (layer.blocks && sa) {
          layer.blocks.forEach(function (block) {
            var sig = sa.active.get(block.id);

            if (sig) {
              var age = sigNow - sig.activatedAt;
              var velNorm = Math.min(
                1,
                Math.max(0, (sig.velocity || 64) / 127),
              );
              var attackMs = 90 + velNorm * 50; // 90–140ms, velocity-scaled
              var t = 1 - age / sig.decayMs;
              t = Math.max(0, t);
              t = t * t; // exponential ease — fast attack, smooth decay
              var energy = t * sig.energy;
              var attackProgress = Math.min(1, age / attackMs);

              // Init release tracker once per activation
              if (
                !block._signalRelease ||
                block._signalRelease.activationId !== sig.activatedAt
              ) {
                var relDuration = 300 + velNorm * 900; // 300–1200ms
                block._signalRelease = {
                  activationId: sig.activatedAt,
                  startedAt: sig.activatedAt + attackMs,
                  duration: relDuration,
                };
              }

              block._signal = {
                energy: energy,
                type: sig.type || "origin",
                velocity: velNorm,
                active: attackProgress < 1,
                attackProgress: attackProgress,
                startedAt: sig.activatedAt,
                release: 0,
              };
              totalSig += energy;
            } else {
              block._signal = null;
            }

            // Release shell — decays independently after active pulse ends
            var relTrack = block._signalRelease;
            if (relTrack) {
              var relAge = sigNow - relTrack.startedAt;
              var relT =
                relAge < 0 ? 0 : Math.max(0, 1 - relAge / relTrack.duration);
              if (relT > 0) {
                if (block._signal) {
                  block._signal.release = relT;
                } else {
                  // Only release tail remains — minimal struct for renderer
                  block._signal = {
                    energy: 0,
                    type: "origin",
                    velocity: 0,
                    active: false,
                    attackProgress: 1,
                    release: relT,
                    startedAt: 0,
                  };
                }
              } else {
                block._signalRelease = null;
              }
            }
          });
        }
        // Aggregate activity level for atmosphere (0–1), origin signals drive it
        var blockCount = layer.blocks ? layer.blocks.length : 1;
        state.signalActivityLevel = Math.min(
          1,
          totalSig / Math.max(1, blockCount * 0.04),
        );

        // Timeline follow: compute progress + target index (throttled)
        var vpConf = layer.renderer && layer.renderer.viewport;
        if (
          vpConf &&
          vpConf.enabled &&
          vpConf.followPlayback &&
          (vpConf.followTarget == null || vpConf.followTarget === "timeline") &&
          isPlaying
        ) {
          var now = performance.now();
          var updateMs =
            vpConf.followTargetUpdateMs != null
              ? vpConf.followTargetUpdateMs
              : 120;
          if (
            !vpConf._lastTargetUpdateAt ||
            now - vpConf._lastTargetUpdateAt >= updateMs
          ) {
            vpConf._lastTargetUpdateAt = now;
            var resolved = resolveMidiBankAndCartridge(null);
            var pbEvents = getMidiNoteEventsForPlayback();
            var srcLen = getMidiPlaybackLengthBeats(
              resolved.bank,
              resolved.cartridge,
              pbEvents,
            );
            var totalBlocks = layer.blocks ? layer.blocks.length : 0;
            if (srcLen > 0 && totalBlocks > 0) {
              var progress = Math.max(0, Math.min(1, currentBeat / srcLen));
              vpConf._timelineProgress = progress;
              vpConf._timelineIndex = Math.floor(
                progress * Math.max(0, totalBlocks - 1),
              );
              vpConf._totalBlocks = totalBlocks;
            }
          }
        }

        var prevBeat = layer._prevBeat != null ? layer._prevBeat : currentBeat;
        if (isPlaying) {
          processGridLayerPlayback(layer, currentBeat, prevBeat);
        }
        layer._prevBeat = currentBeat;
        GS.renderGridLayer(ctx, layer, state);
      });
    }

    // ── Signal Activity API ────────────────────────────────────────────────
    function activateGridCell(cellId, energy, meta) {
      if (!cellId || !state.signalActivity) return;
      var type = (meta && meta.type) || "origin";
      var baseDuration = (meta && meta.decayMs) || 900;
      var duration =
        type === "origin" ? baseDuration * 1.2 : baseDuration * 0.72;
      state.signalActivity.active.set(cellId, {
        energy: Math.max(0, Math.min(1, energy || 1)),
        activatedAt: performance.now(),
        decayMs: duration,
        type: type,
        velocity: (meta && meta.velocity) || 100,
        sourceId: (meta && meta.sourceId) || null,
      });
    }

    function updateSignalActivity(now) {
      if (!state.signalActivity) return;
      var sa = state.signalActivity;

      // Fire pending delayed activations
      if (sa.pending.length) {
        var stillPending = [];
        for (var pi = 0; pi < sa.pending.length; pi++) {
          var p = sa.pending[pi];
          if (now >= p.fireAt) {
            activateGridCell(p.cellId, p.energy, p.meta);
          } else {
            stillPending.push(p);
          }
        }
        sa.pending = stillPending;
      }

      // Decay expired entries
      sa.active.forEach(function (v, key) {
        if (now - v.activatedAt >= v.decayMs) {
          sa.active.delete(key);
        }
      });
    }

    function _getBlockAdjacencyMap(layer) {
      if (layer._adjacencyMap) return layer._adjacencyMap;
      var byKey = {};
      layer.blocks.forEach(function (b) {
        byKey[b.col + "," + b.row] = b;
      });
      var map = {};
      var meta = {}; // parallel to map — per-neighbor isCardinal flag
      // dirs ordered: 4 cardinal first, 4 diagonal after
      var dirs = [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ];
      layer.blocks.forEach(function (b) {
        var neighbors = [];
        var cardinalFlags = [];
        for (var di = 0; di < dirs.length; di++) {
          var d = dirs[di];
          var nb = byKey[b.col + d[0] + "," + (b.row + d[1])];
          if (nb) {
            neighbors.push(nb.id);
            cardinalFlags.push(di < 4); // first 4 are cardinal
          }
        }
        map[b.id] = neighbors;
        meta[b.id] = cardinalFlags;
      });
      layer._adjacencyMap = map;
      layer._adjacencyMeta = meta;
      return map;
    }

    function activateNeighborCells(block, layer, energy) {
      if (!layer || !layer.blocks || !layer.blocks.length) return;
      var adj = _getBlockAdjacencyMap(layer);
      var adjMeta = layer._adjacencyMeta; // includes cardinal flag per neighbor
      if (!adj[block.id] || !adj[block.id].length) return;
      var now = performance.now();
      var neighbors = adj[block.id];
      var meta = adjMeta && adjMeta[block.id] ? adjMeta[block.id] : null;
      for (var ni = 0; ni < neighbors.length; ni++) {
        var isCardinal = meta ? meta[ni] : true;
        // Cardinals carry more energy (0.14–0.24); diagonals attenuate (0.08–0.16)
        var range = isCardinal ? [0.14, 0.1] : [0.08, 0.08];
        var nEnergy = energy * (range[0] + Math.random() * range[1]);
        var delay = 20 + Math.random() * 70;
        state.signalActivity.pending.push({
          cellId: neighbors[ni],
          energy: nEnergy,
          meta: {
            decayMs: 500,
            velocity: block.velocity || 64,
            type: "neighbor",
          },
          fireAt: now + delay,
        });
      }
    }

    function processGridLayerPlayback(layer, currentBeat, previousBeat) {
      if (!layer.blocks || !layer.blocks.length) return;
      // Detect transport loop/reset: if beat jumped backward, clear fired set
      if (currentBeat < previousBeat - 0.5) {
        layer._firedEvents = null;
      }
      if (!layer._firedEvents) layer._firedEvents = new Set();
      // Cycle key: quantize to integer beat-cycle to allow loop re-firing
      var cycleBeat = Math.floor(currentBeat);
      layer.blocks.forEach(function (block) {
        // Fire when block startBeat crosses the window [previousBeat, currentBeat)
        if (block.startBeat >= previousBeat && block.startBeat < currentBeat) {
          var fireKey =
            block.sourceEventId + "@" + Math.floor(block.startBeat * 8);
          if (!layer._firedEvents.has(fireKey)) {
            layer._firedEvents.add(fireKey);
            triggerGridBlockSound(block, layer);
            var sigEnergy = Math.max(0.4, (block.velocity || 64) / 127);
            // Collision flash — crisp white inset, rendered before propagation
            block._collisionFlash = {
              energy: sigEnergy,
              startTime: performance.now(),
            };
            activateGridCell(block.id, sigEnergy, {
              decayMs: 900,
              velocity: block.velocity || 64,
            });
            activateNeighborCells(block, layer, sigEnergy);
          }
        }
      });
    }

    function triggerGridBlockSound(block, layer) {
      playFallbackInstrument(block.note, block.velocity);
    }

    // ── Graph builders ─────────────────────────────────────────────────────
    function getStrokeEndpoints(stroke) {
      var pts = stroke.points;
      if (!pts || pts.length < 2) return null;
      return { start: pts[0], end: pts[pts.length - 1] };
    }

    function isStrokeConnected(a, b, threshold) {
      var eps = getStrokeEndpoints(a);
      var epb = getStrokeEndpoints(b);
      if (!eps || !epb) return false;
      var thr = threshold != null ? threshold : 12;
      function dist(p, q) {
        return Math.hypot(p.x - q.x, p.y - q.y);
      }
      return (
        dist(eps.end, epb.start) <= thr ||
        dist(eps.end, epb.end) <= thr ||
        dist(eps.start, epb.start) <= thr ||
        dist(eps.start, epb.end) <= thr
      );
    }

    function buildGraphFromStroke(startStroke) {
      var graphId =
        "graph_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
      var visited = {};
      var order = [];
      var queue = [startStroke];
      visited[startStroke.id] = true;

      while (queue.length) {
        var current = queue.shift();
        order.push(current.id);
        // Find first unvisited neighbor by endpoint proximity
        for (var i = 0; i < state.strokes.length; i++) {
          var s = state.strokes[i];
          if (visited[s.id]) continue;
          if (isStrokeConnected(current, s)) {
            visited[s.id] = true;
            queue.push(s);
          }
        }
      }

      var graph = {
        id: graphId,
        strokeIds: order,
        bankId: null,
        mode: "deterministic",
        closed: false,
        createdAt: Date.now(),
      };
      state.graphs[graphId] = graph;
      console.log("[GRAPH] Built:", graphId, "strokes:", order.length);
      return graph;
    }

    function assignBankToGraph(bankId, graphId) {
      var graph = state.graphs[graphId];
      var bank = getMidiBank(bankId);
      if (!graph || !bank) return;
      graph.bankId = bankId;
      bank.graphId = graphId;
      graph.strokeIds.forEach(function (sid) {
        var s = getStrokeById(sid);
        if (!s) return;
        s.graphId = graphId;
        s.bankId = bankId;
      });
      console.log(
        "[MIDI] Bank",
        bankId,
        "→ graph",
        graphId,
        "strokes:",
        graph.strokeIds.length,
      );
    }

    function getGraphStrokes(graphId) {
      var graph = state.graphs[graphId];
      if (!graph) return [];
      return graph.strokeIds.map(getStrokeById).filter(Boolean);
    }

    // ── Graph geometry ─────────────────────────────────────────────────────
    function getStrokeLength(stroke) {
      var pts = stroke.points;
      var len = 0;
      for (var i = 1; i < pts.length; i++) {
        len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      }
      return len || 1;
    }

    function getGraphLength(graph) {
      return (
        graph.strokeIds.reduce(function (acc, sid) {
          var s = getStrokeById(sid);
          return acc + (s ? getStrokeLength(s) : 0);
        }, 0) || 1
      );
    }

    // Returns { strokeId, t, x, y } for a given distance along the graph
    function projectDistanceToGraph(graph, distance) {
      var remaining = distance;
      for (var i = 0; i < graph.strokeIds.length; i++) {
        var s = getStrokeById(graph.strokeIds[i]);
        if (!s) continue;
        var sl = getStrokeLength(s);
        if (remaining <= sl) {
          // Local t within this stroke
          var t = Math.max(0, Math.min(1, remaining / sl));
          var pos = getStrokePoint(s, t);
          return { strokeId: s.id, t: t, x: pos.x, y: pos.y };
        }
        remaining -= sl;
      }
      // Past end — clamp to last stroke end
      var last = getStrokeById(graph.strokeIds[graph.strokeIds.length - 1]);
      if (last) {
        var pos = getStrokePoint(last, 1);
        return { strokeId: last.id, t: 1, x: pos.x, y: pos.y };
      }
      return null;
    }

    // ── MIDI Projection ────────────────────────────────────────────────────
    function projectMidiToGraph(bankId, graphId) {
      var bank = getMidiBank(bankId);
      var graph = state.graphs[graphId];
      if (!bank || !graph) return;
      var cartridge = getMidiCartridge(bank.cartridgeId);
      if (!cartridge || !cartridge.notes.length) return;

      var graphLen = getGraphLength(graph);
      var cartLen = cartridge.length || 1;

      cartridge.notes.forEach(function (note) {
        var norm = note.time / cartLen; // 0..1 in MIDI time
        var dist = norm * graphLen; // distance along graph
        var placed = projectDistanceToGraph(graph, dist);
        if (!placed) return;

        var mp = {
          id: "mp_" + Math.random().toString(36).slice(2, 10),
          graphId: graphId,
          bankId: bankId,
          cartridgeId: cartridge.id,
          strokeId: placed.strokeId,
          t: placed.t,
          note: note.note,
          velocity: note.velocity,
          duration: note.duration,
          color: note.color || noteToColor(note.note),
          locked: true,
          selected: false,
          consumed: false,
          x: placed.x,
          y: placed.y,
        };
        state.midiPoints.push(mp);
      });

      console.log("[MIDI PROJECT]", {
        notes: cartridge.notes.length,
        cartLen: cartLen,
        graphLen: graphLen,
        pointsAdded: state.midiPoints.filter(function (p) {
          return p.graphId === graphId;
        }).length,
        graphId: graphId,
      });
    }

    // ── Bank consumption lifecycle ─────────────────────────────────────────
    function updateBankConsumption(bankId) {
      var bank = getMidiBank(bankId);
      if (!bank) return;
      var points = state.midiPoints.filter(function (p) {
        return p.bankId === bankId;
      });
      if (!points.length) return;
      var done = points.every(function (p) {
        return p.consumed;
      });
      if (!done) return;
      if (bank.repeat) {
        points.forEach(function (p) {
          p.consumed = false;
        });
        bank.consumed = false;
        if (state.debug && state.debug.audioLogs)
          console.log("[MIDI] Bank", bankId, "recycled");
      } else {
        bank.consumed = true;
        if (state.debug && state.debug.audioLogs)
          console.log("[MIDI] Bank", bankId, "consumed");
      }
    }

    // ── MIDI Point spatial trigger ─────────────────────────────────────────
    function triggerMidiPointsForWalker(walker) {
      if (!state.midiPoints.length) return;
      // Audio from MIDI points is a legacy path — muted unless explicitly enabled
      var midiPointsAudioEnabled =
        state.midiPlayback &&
        state.midiPlayback.legacyWalkerAudioEnabled === true;

      // Resolve graphId/bankId live from the stroke — handles walkers created before MIDI was attached
      var liveStroke = walker.strokeId ? getStrokeById(walker.strokeId) : null;
      var graphId =
        walker.graphId || (liveStroke && liveStroke.graphId) || null;
      var bankId = walker.bankId || (liveStroke && liveStroke.bankId) || null;
      // Update walker so future frames don't need to re-resolve
      if (graphId && !walker.graphId) walker.graphId = graphId;
      if (bankId && !walker.bankId) walker.bankId = bankId;

      var threshold = 0.02; // wider window — walker advances ~0.003 per frame at default speed
      var triggered = false;

      state.midiPoints.forEach(function (p) {
        if (p.consumed) return;

        // Path 1: same stroke — t-based match
        if (p.strokeId === walker.strokeId) {
          if (Math.abs(p.t - walker.t) < threshold) {
            if (midiPointsAudioEnabled) {
              playFallbackInstrument(
                p.note,
                p.velocity != null ? p.velocity : 100,
              );
            }
            p.consumed = true;
            triggered = true;
            if (state.debug && state.debug.audioLogs)
              console.log(
                "[MIDI POINT]",
                p.note,
                "t:",
                p.t.toFixed(3),
                "walker.t:",
                walker.t.toFixed(3),
                "audio:",
                midiPointsAudioEnabled,
              );
          }
          return;
        }

        // Path 2: same graph — XY proximity on other strokes
        if (
          graphId &&
          p.graphId === graphId &&
          (!bankId || p.bankId === bankId)
        ) {
          var dx = walker.x - p.x;
          var dy = walker.y - p.y;
          if (dx * dx + dy * dy < 49) {
            if (midiPointsAudioEnabled) {
              playFallbackInstrument(
                p.note,
                p.velocity != null ? p.velocity : 100,
              );
            }
            p.consumed = true;
            triggered = true;
            if (state.debug && state.debug.audioLogs)
              console.log(
                "[MIDI POINT] graph hit",
                p.note,
                "t:",
                p.t.toFixed(3),
                "audio:",
                midiPointsAudioEnabled,
              );
          }
        }
      });

      if (triggered && bankId) updateBankConsumption(bankId);
    }

    // ── Render MIDI Points ─────────────────────────────────────────────────
    function renderMidiPoints(ctx) {
      // Debug fallback: inject one visible test point if state is empty but strokes exist
      if (
        state.midiPoints.length === 0 &&
        state.strokes.length > 0 &&
        state._midiDebugPoint
      ) {
        var dbgStroke = state.strokes[0];
        state.midiPoints.push({
          id: "debug_mp",
          graphId: null,
          bankId: null,
          strokeId: dbgStroke.id,
          t: 0.5,
          note: 60,
          velocity: 100,
          duration: 0.25,
          color: "#ff0",
          locked: false,
          selected: false,
          consumed: false,
          x: 0,
          y: 0,
        });
        console.log("[MIDI DEBUG] Injected test point on stroke", dbgStroke.id);
        state._midiDebugPoint = false;
      }

      if (!state.midiPoints.length) return;
      state.midiPoints.forEach(function (p) {
        var stroke = getStrokeById(p.strokeId);
        if (!stroke) return;
        // Recalculate live position
        var pos = getStrokePoint(stroke, p.t);
        p.x = pos.x;
        p.y = pos.y;

        var alpha = p.consumed ? 0.15 : p.locked ? 0.7 : 1.0;
        var radius = p.consumed ? 2 : p.locked ? 5 : 6;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color || noteToColor(p.note);
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
    }

    // ── Walker setup for graph ─────────────────────────────────────────────
    function initWalkerGraph(walker, stroke) {
      if (!stroke.graphId) return;
      var graph = state.graphs[stroke.graphId];
      if (!graph) return;
      walker.graphId = stroke.graphId;
      walker.bankId = stroke.bankId || null;
      walker.connectionMode = "closed";
      walker.graphStrokeOrder = graph.strokeIds.slice();
      walker.graphStrokeIndex = graph.strokeIds.indexOf(stroke.id);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ── End MIDI Ink System ──────────────────────────────────────────────
    // ═══════════════════════════════════════════════════════════════════════

    // ═══════════════════════════════════════════════════════════════════════
    // ═══════════════════════════════════════════════════════════════════════
    // ── Canvas Tool Sub-Bar ──────────────────────────────────────────────
    // ═══════════════════════════════════════════════════════════════════════

    function _tsbField(labelText, control, root) {
      var grp = document.createElement("div");
      grp.className = "canvas-tool-subbar__group";
      var lbl = document.createElement("label");
      var sp = document.createElement("span");
      sp.textContent = labelText;
      lbl.appendChild(sp);
      lbl.appendChild(control);
      grp.appendChild(lbl);
      root.appendChild(grp);
    }

    function _tsbColor(val, onChange) {
      var el = document.createElement("input");
      el.type = "color";
      el.value = val;
      el.addEventListener("input", function () {
        onChange(el.value);
      });
      return el;
    }

    function _tsbNumber(val, onChange, opts) {
      var el = document.createElement("input");
      el.type = "number";
      el.value = val;
      if (opts) {
        if (opts.min != null) el.min = opts.min;
        if (opts.max != null) el.max = opts.max;
        if (opts.step) el.step = opts.step;
      }
      el.addEventListener("input", function () {
        var n = Number(el.value);
        if (Number.isFinite(n)) onChange(n);
      });
      return el;
    }

    function _tsbSelect(val, options, onChange) {
      var el = document.createElement("select");
      options.forEach(function (o) {
        var opt = document.createElement("option");
        opt.value = o;
        opt.textContent = o;
        el.appendChild(opt);
      });
      el.value = val;
      el.addEventListener("change", function () {
        onChange(el.value);
      });
      return el;
    }

    function _tsbCheck(val, onChange) {
      var el = document.createElement("input");
      el.type = "checkbox";
      el.checked = !!val;
      el.addEventListener("change", function () {
        onChange(el.checked);
      });
      return el;
    }

    function renderCanvasToolSubBar() {
      var root = document.getElementById("canvas-tool-subbar");
      if (!root) return;

      // In geographic navigate mode the map is the primary interface.
      // No active tool = no toolbar. Clear and exit — telemetry HUD has the stage.
      var _geoNav = window.SBE &&
                    SBE.Workspace &&
                    SBE.Workspace.isGeographicMode &&
                    SBE.Workspace.isGeographicMode() &&
                    SBE.Workspace.getInteractionMode &&
                    SBE.Workspace.getInteractionMode() === "navigate";
      if (_geoNav || state.tool === "select") {
        root.innerHTML = "";
        return;
      }

      root.innerHTML = "";

      // Tool name badge
      var badge = document.createElement("span");
      badge.className = "canvas-tool-subbar__tool-name";
      var toolName =
        {
          pen: "Brush",
          ball: "Ball",
          text: "Text",
          select: "Select",
          shape: "Shape",
          "symbol-place": "Place Symbol",
          "symbol-brush": "Brush: Symbol",
        }[state.tool] || state.tool;
      badge.textContent = toolName;
      root.appendChild(badge);

      var t = state.tools;

      if (state.tool === "pen") {
        var b = t.brush;
        _tsbField(
          "Fill",
          _tsbColor(b.fill, function (v) {
            b.fill = v;
            b.stroke = v;
            // Sync to existing defaults so stroke color reflects sub-bar
            state.defaults.color = v;
            syncUI();
          }),
          root,
        );
        _tsbField(
          "Width",
          _tsbNumber(
            b.strokeWidth,
            function (v) {
              b.strokeWidth = Math.max(1, v);
              state.defaults.strokeWidth = b.strokeWidth;
            },
            { min: 1, step: 1 },
          ),
          root,
        );
        _tsbField(
          "Walker",
          _tsbCheck(b.walkerEnabled, function (v) {
            b.walkerEnabled = v;
          }),
          root,
        );
        _tsbField(
          "Trail",
          _tsbCheck(b.trailEnabled, function (v) {
            b.trailEnabled = v;
          }),
          root,
        );
        _tsbField(
          "Source",
          _tsbSelect(b.soundSource, ["synth", "sample", "off"], function (v) {
            b.soundSource = v;
          }),
          root,
        );
        _tsbField(
          "Role",
          _tsbSelect(
            b.soundRole,
            ["drum", "bass", "lead", "pad"],
            function (v) {
              b.soundRole = v;
            },
          ),
          root,
        );
        _tsbField(
          "Trigger",
          _tsbSelect(b.sound.trigger, ["impact", "continuous"], function (v) {
            b.sound.trigger = v;
          }),
          root,
        );
        return;
      }

      if (state.tool === "ball") {
        var b = t.ball;
        _tsbField(
          "Fill",
          _tsbColor(b.fill, function (v) {
            b.fill = v;
          }),
          root,
        );
        _tsbField(
          "Radius",
          _tsbNumber(
            b.radius,
            function (v) {
              b.radius = Math.max(1, v);
              state.swarm.collisionRadius = b.radius;
              state.swarm.renderRadius = b.radius * 2.3;
            },
            { min: 1, step: 1 },
          ),
          root,
        );
        _tsbField(
          "Speed",
          _tsbNumber(
            b.velocity,
            function (v) {
              b.velocity = Math.max(0, v);
              state.ballTool.speed = b.velocity;
            },
            { min: 0, step: 0.1 },
          ),
          root,
        );
        _tsbField(
          "Bounce",
          _tsbNumber(
            b.bounciness,
            function (v) {
              b.bounciness = clamp(v, 0, 1);
            },
            { min: 0, max: 1, step: 0.05 },
          ),
          root,
        );
        return;
      }

      if (state.tool === "text") {
        var tx = t.text;
        _tsbField(
          "Color",
          _tsbColor(tx.fill, function (v) {
            tx.fill = v;
          }),
          root,
        );
        _tsbField(
          "Size",
          _tsbNumber(
            tx.fontSize,
            function (v) {
              tx.fontSize = Math.max(8, v);
              state.defaults.textSize = tx.fontSize;
            },
            { min: 8, step: 1 },
          ),
          root,
        );
        _tsbField(
          "Multiline",
          _tsbCheck(tx.multiline, function (v) {
            tx.multiline = v;
          }),
          root,
        );
        return;
      }

      if (state.tool === "walker") {
        var wk = t.walker;
        _tsbField(
          "Mode",
          _tsbSelect(
            wk.mode,
            ["pingpong", "loop", "once", "tunnel"],
            function (v) {
              wk.mode = v;
            },
          ),
          root,
        );
        _tsbField(
          "Speed",
          _tsbNumber(
            wk.speed,
            function (v) {
              wk.speed = Math.max(0, v);
              state.walker.speed = wk.speed * 0.0025;
            },
            { min: 0, step: 0.1 },
          ),
          root,
        );
        _tsbField(
          "Trail",
          _tsbSelect(
            wk.trailStyle,
            ["off", "orbit", "comet", "dust", "burst", "ribbon"],
            function (v) {
              wk.trailStyle = v;
            },
          ),
          root,
        );
        _tsbField(
          "Self Sound",
          _tsbCheck(wk.selfSoundEnabled, function (v) {
            wk.selfSoundEnabled = v;
          }),
          root,
        );
        return;
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ── End Canvas Tool Sub-Bar ──────────────────────────────────────────
    // ═══════════════════════════════════════════════════════════════════════

    // ── Label System (Text Tool) ─────────────────────────────────────────
    // ═══════════════════════════════════════════════════════════════════════

    function createLabelId() {
      return "lbl_" + Math.random().toString(36).slice(2, 9);
    }

    function getLabelById(id) {
      return (
        state.labels.find(function (l) {
          return l.id === id;
        }) || null
      );
    }

    function removeLabel(id) {
      state.labels = state.labels.filter(function (l) {
        return l.id !== id;
      });
    }

    function createLabelAt(worldX, worldY) {
      var label = {
        id: createLabelId(),
        x: worldX,
        y: worldY,
        text: "",
        style: "text", // "text" | "box"
        size: 14,
        color: "#ffffff",
        padding: 8,
        radius: 10,
        bg: "rgba(0,0,0,0.6)",
        border: "rgba(255,255,255,0.2)",
        align: "center",
        visible: true,
      };
      state.labels.push(label);
      return label;
    }

    // Hit-test: returns label whose rendered position is within radius of screen point
    function getLabelAtScreen(sx, sy) {
      var cam = state.camera;
      var hitR = 20;
      for (var i = state.labels.length - 1; i >= 0; i--) {
        var l = state.labels[i];
        if (!l.visible) continue;
        // Project world → screen
        var scx = (l.x - cam.x) * cam.zoom + canvas.width / 2;
        var scy = (l.y - cam.y) * cam.zoom + canvas.height / 2;
        if (Math.hypot(sx - scx, sy - scy) < hitR) return l;
      }
      return null;
    }

    // Rounded rect helper (also used by renderLabelBox)
    function roundRectPath(ctx, x, y, w, h, r) {
      r = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    }

    function renderMultiLineText(
      ctx,
      label,
      scx,
      scy,
      fontSize,
      lines,
      lineHeight,
    ) {
      var startY = scy - ((lines.length - 1) * lineHeight) / 2;
      ctx.fillStyle = label.color;
      lines.forEach(function (line, i) {
        ctx.fillText(line, scx, startY + i * lineHeight);
      });
      // Cursor blink when actively editing this label
      if (state.activeLabelId === label.id && state.textEditing) {
        var lastLine = lines[lines.length - 1];
        var cx =
          scx +
          (label.align === "left"
            ? ctx.measureText(lastLine).width
            : label.align === "right"
              ? -ctx.measureText(lastLine).width
              : 0);
        var cy = startY + (lines.length - 1) * lineHeight;
        if (Math.floor(performance.now() / 500) % 2 === 0) {
          ctx.beginPath();
          ctx.moveTo(
            cx +
              ctx.measureText(lastLine).width *
                (label.align === "center" ? 0.5 : 1) +
              2,
            cy - fontSize * 0.5,
          );
          ctx.lineTo(
            cx +
              ctx.measureText(lastLine).width *
                (label.align === "center" ? 0.5 : 1) +
              2,
            cy + fontSize * 0.5,
          );
          ctx.strokeStyle = label.color;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
    }

    function renderLabelBox(ctx, label, scx, scy, fontSize, lines, lineHeight) {
      var widths = lines.map(function (line) {
        return ctx.measureText(line).width;
      });
      var maxW = Math.max.apply(null, widths.concat([20]));
      var pad = label.padding;
      var boxW = maxW + pad * 2;
      var boxH = lines.length * lineHeight + pad * 2;
      var bx = scx - boxW / 2;
      var by = scy - boxH / 2;
      roundRectPath(ctx, bx, by, boxW, boxH, label.radius);
      ctx.fillStyle = label.bg;
      ctx.fill();
      ctx.strokeStyle = label.border;
      ctx.lineWidth = 1;
      ctx.stroke();
      renderMultiLineText(ctx, label, scx, scy, fontSize, lines, lineHeight);
    }

    function renderLabels(ctx) {
      if (!state.labels.length) return;
      var cam = state.camera;
      state.labels.forEach(function (label) {
        if (!label.visible) return;
        // Project world → screen (labels render in screen space for zoom-stable size)
        var scx = (label.x - cam.x) * cam.zoom + canvas.width / 2;
        var scy = (label.y - cam.y) * cam.zoom + canvas.height / 2;
        ctx.save();
        var fontSize = Math.max(10, label.size); // fixed screen size regardless of zoom
        var lineHeight = fontSize * 1.35;
        var lines = (
          label.text || (state.activeLabelId === label.id ? "" : "")
        ).split("\n");
        // Show placeholder when empty and editing
        if (label.text === "" && state.activeLabelId === label.id) lines = [""];
        ctx.font = fontSize + "px monospace";
        ctx.textAlign = label.align;
        ctx.textBaseline = "middle";
        if (label.style === "box") {
          renderLabelBox(ctx, label, scx, scy, fontSize, lines, lineHeight);
        } else {
          renderMultiLineText(
            ctx,
            label,
            scx,
            scy,
            fontSize,
            lines,
            lineHeight,
          );
        }
        // Selection ring
        if (state.activeLabelId === label.id) {
          ctx.beginPath();
          ctx.arc(scx, scy, fontSize * 0.4 + 6, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(61,216,197,0.5)";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        ctx.restore();
      });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ── End Label System ─────────────────────────────────────────────────
    // ═══════════════════════════════════════════════════════════════════════

    // ── Inspector binding — called on every selection change ─────────────
    // Only these IDs are allowed. Called AFTER renderInspector.
    function bind(id, setter) {
      var el = document.getElementById(id);
      if (!el) return;
      el.oninput = function () {
        var value = el.type === "checkbox" ? el.checked : el.value;
        setter(value);
        renderFrame();
      };
    }

    function bindInspector(obj) {
      if (!obj) return;
      if (!obj.sound)
        obj.sound = {
          source: "synth",
          role: "drum",
          trigger: "impact",
          midi: { note: 60 },
        };
      if (!obj.sound.midi) obj.sound.midi = { note: obj.note || 60 };

      // Object
      bind("obj-fill", function (v) {
        obj.color = v;
        if (!obj.visual) obj.visual = {};
        obj.visual.fill = v;
      });
      bind("obj-strokeWidth", function (v) {
        var n = Number(v);
        obj.width = n;
        obj.baseWidth = n;
        if (!obj.visual) obj.visual = {};
        obj.visual.strokeWidth = n;
        var out = document.getElementById("obj-strokeWidth-out");
        if (out) out.value = n;
      });
      bind("obj-visible", function (v) {
        obj.renderMode = v ? "visible" : "hidden";
        obj.outlineVisible = !!v;
      });

      // ── PATH layer bindings ────────────────────────────────────────────────
      bind("obj-pathStyle", function (v) {
        obj.pathStyle = v;
        var dashFields = document.getElementById("path-dash-fields");
        if (dashFields)
          dashFields.style.display =
            v === "dotted" || v === "dashed" ? "" : "none";
      });
      bind("obj-path-dash", function (v) {
        obj.pathDash = Number(v);
        var o = document.getElementById("obj-path-dash-value");
        if (o) o.value = v;
      });
      bind("obj-path-gap", function (v) {
        obj.pathGap = Number(v);
        var o = document.getElementById("obj-path-gap-value");
        if (o) o.value = v;
      });

      // ── SUBJECT layer bindings ─────────────────────────────────────────────
      bind("obj-subject-style", function (v) {
        obj.subjectStyle = v;
        var _sg = document.getElementById("sub-row-glyph");
        var _si = document.getElementById("sub-row-image");
        var _st = document.getElementById("sub-row-text");
        if (_sg) _sg.style.display = v === "glyph" ? "" : "none";
        if (_si) _si.style.display = v === "image" ? "" : "none";
        if (_st) _st.style.display = v === "text" ? "" : "none";
      });
      bind("obj-subject-scale", function (v) {
        obj.subjectScale = Number(v);
        var o = document.getElementById("obj-subject-scale-value");
        if (o) o.value = Number(v).toFixed(1);
      });
      bind("obj-subject-opacity", function (v) {
        obj.subjectOpacity = Number(v);
        var o = document.getElementById("obj-subject-opacity-value");
        if (o) o.value = Number(v).toFixed(2);
      });
      bind("obj-subject-visible", function (v) {
        obj.subjectVisible = v === true || v === "on" || v === 1;
      });
      bind("obj-subject-glyph", function (v) {
        obj.subjectGlyph = v || null;
      });
      bind("obj-subject-text", function (v) {
        obj.subjectText = v || null;
      });
      bind("obj-subject-color", function (v) {
        obj.subjectColor = v && v !== "#000000" && v !== "" ? v : null;
        // Invalidate image cache so re-tinted image reloads
        if (obj.subjectStyle === "image" && obj.id)
          delete _subjectImageCache[obj.id];
      });
      // Image file upload for subject
      (function () {
        var _imgInput = document.getElementById("obj-subject-image");
        if (!_imgInput) return;
        _imgInput.onchange = function () {
          var file = _imgInput.files && _imgInput.files[0];
          if (!file) return;
          var reader = new FileReader();
          reader.onload = function (e) {
            obj.subjectImage = e.target.result;
            renderFrame();
          };
          reader.readAsDataURL(file);
        };
      })();

      // ── TRAIL detail bindings ──────────────────────────────────────────────
      bind("obj-trail-style", function (v) {
        if (!obj.trail) obj.trail = {};
        obj.trail.style = v;
      });
      bind("obj-trail-length", function (v) {
        if (!obj.trail) obj.trail = {};
        obj.trail.length = Number(v);
        var o = document.getElementById("obj-trail-length-value");
        if (o) o.value = Number(v).toFixed(1);
      });
      bind("obj-trail-opacity", function (v) {
        if (!obj.trail) obj.trail = {};
        obj.trail.opacity = Number(v);
        var o = document.getElementById("obj-trail-opacity-value");
        if (o) o.value = Number(v).toFixed(2);
      });

      // Walker
      bind("obj-walker", function (v) {
        obj.walker = v;
        if (v) {
          var existing = state.walkers.find(function (w) {
            return w.strokeId === obj.id;
          });
          if (!existing) {
            var nw = createWalkerFromStroke(obj);
            if (nw) state.walkers.push(nw);
          }
        } else {
          state.walkers = state.walkers.filter(function (w) {
            return w.strokeId !== obj.id;
          });
        }
      });
      bind("obj-motionMode", function (v) {
        state.walkers.forEach(function (w) {
          if (w.strokeId === obj.id) w.motionMode = v;
        });
      });
      bind("obj-speed", function (v) {
        // Speed is stored normalized 0–1; walker.speed is in path-units/frame at 60fps
        // Mapping: inspector 0–1 → w.speed ~0.003–0.5 (same range as state.walker.speed * 60)
        var spd = Number(v) * 0.25; // 0.25 = max comfortable path speed
        state.walkers.forEach(function (w) {
          if (w.strokeId === obj.id) w.speed = spd;
        });
        var o = document.getElementById("obj-speed-value");
        if (o) o.value = Number(v).toFixed(2);
      });
      bind("obj-trailStyle", function (v) {
        // Handles both checkbox boolean and legacy select "on"/"off" string values
        var enabled = v === true || v === "on" || v === 1;
        obj.trailEnabled = enabled;
        if (!obj.trail) obj.trail = {};
        obj.trail.enabled = enabled;
        state.walkers.forEach(function (w) {
          if (w.strokeId !== obj.id) return;
          if (!w.emitter) w.emitter = {};
          w.emitter.enabled = enabled;
        });
        // Show/hide trail detail fields
        var _td = document.getElementById("trail-detail-fields");
        if (_td) _td.style.display = enabled ? "" : "none";
      });
      bind("obj-field-influence", function (v) {
        state.walkers.forEach(function (w) {
          if (w.strokeId === obj.id) w.fieldInfluence = Number(v);
        });
        var out = document.getElementById("obj-field-influence-value");
        if (out) out.value = Number(v).toFixed(2);
      });

      // ── Physics & Collision bindings ────────────────────────────────────
      bind("obj-collider-enabled", function (v) {
        var enabled = v === true || v === "on" || v === 1;
        state.walkers.forEach(function (w) {
          if (w.strokeId !== obj.id) return;
          var av = _ensureAvatar(w);
          av.collider.enabled = enabled;
        });
        var bodyFields = document.getElementById("physics-body-fields");
        if (bodyFields) bodyFields.style.display = enabled ? "" : "none";
      });
      bind("obj-phys-bounce", function (v) {
        state.walkers.forEach(function (w) {
          if (w.strokeId !== obj.id) return;
          if (!w.physics) w.physics = {};
          w.physics.bounce = Number(v);
        });
      });
      bind("obj-phys-gravity", function (v) {
        state.walkers.forEach(function (w) {
          if (w.strokeId !== obj.id) return;
          if (!w.physics) w.physics = {};
          w.physics.gravityScale = Number(v);
        });
      });

      // ── Avatar bindings (WalkerAvatarSystem v1.0.0) ────────────────────

      function _walkerForObj() {
        return state.walkers.find(function (w) {
          return w.strokeId === obj.id;
        });
      }
      // ISOLATION: _ensureAvatar always creates a per-walker fresh literal.
      // Never assigns a shared object or spread from a module-level default.
      function _ensureAvatar(w) {
        if (!w.avatar) {
          w.avatar = {
            enabled: false,
            style: "none",
            glyphId: null,
            scale: 1.0,
            rotationMode: "motion",
            opacity: 1.0,
            tint: null,
            trailInfluence: 1.0,
            // Collision is automatic when avatar.enabled — no collider.enabled gate.
            // radius=20 gives a ~40px collision body at scale=1, matching a typical glyph.
            collider: {
              type: "circle",
              radius: 20,
              offsetX: 0,
              offsetY: 0,
              enabled: true,
            },
          };
        }
        // Ensure collider sub-object always exists (migration for walkers created before AvatarCollisionBodies)
        if (!w.avatar.collider) {
          w.avatar.collider = {
            type: "circle",
            radius: 20,
            offsetX: 0,
            offsetY: 0,
            enabled: true,
          };
        }
        return w.avatar;
      }

      // Populate glyph picker with all sets/glyphs from SymbolSystem
      // Build glyph pickers — subject glyph picker (new) and legacy av-glyph (compat)
      (function _buildGlyphPickers() {
        var SS = global.SBE && global.SBE.SymbolSystem;
        ["obj-subject-glyph", "av-glyph"].forEach(function (selId) {
          var sel = document.getElementById(selId);
          if (!sel || !SS) return;
          sel.innerHTML = '<option value="">— none —</option>';
          var sets = SS.getAllSets ? SS.getAllSets() : [];
          sets.forEach(function (set) {
            if (!set || !set.glyphs) return;
            // Human-readable set name: prefer set.name, fall back to meta.name, then id
            var setLabel = set.name || (set.meta && set.meta.name) || set.id;
            // Trim internal hash suffixes (e.g. "ss-mp3zplok-37x7n" → "Untitled Set")
            if (!set.name && setLabel.match(/^ss-[a-z0-9]+-[a-z0-9]+$/i)) {
              setLabel = "Set";
            }
            var slots = Object.keys(set.glyphs);
            slots.forEach(function (slotKey) {
              var g = set.glyphs[slotKey];
              if (
                !g ||
                ((!g.strokes || !g.strokes.length) &&
                  (!g.objects || !g.objects.length))
              )
                return;
              var opt = document.createElement("option");
              opt.value = set.id + ":" + slotKey;
              // Glyph label: prefer g.name or g.label, else humanise slotKey
              var glyphLabel = (g.name || g.label || slotKey)
                .replace(/^[a-z0-9]{5,}-[a-z0-9]+$/i, slotKey) // strip hash IDs
                .replace(/[-_]/g, " ")
                .replace(/\b\w/g, function (c) {
                  return c.toUpperCase();
                });
              opt.textContent = setLabel + " / " + glyphLabel;
              sel.appendChild(opt);
            });
          });
        });
        // Set current values
        if (obj.subjectGlyph) {
          var _sgEl = document.getElementById("obj-subject-glyph");
          if (_sgEl) _sgEl.value = obj.subjectGlyph;
        }
        var w = _walkerForObj();
        if (w && w.avatar && w.avatar.glyphId) {
          var _agEl = document.getElementById("av-glyph");
          if (_agEl) _agEl.value = w.avatar.glyphId;
        }
      })();

      var avRowGlyph = document.getElementById("av-row-glyph");

      function _syncAvatarModeRow(mode) {
        if (avRowGlyph)
          avRowGlyph.style.display = mode === "glyph" ? "" : "none";
      }

      // Sync current values into UI
      (function _syncAvatarUI() {
        var w = _walkerForObj();
        var av = w
          ? _ensureAvatar(w)
          : {
              enabled: false,
              style: "none",
              scale: 1.0,
              rotationMode: "motion",
              opacity: 1.0,
              tint: null,
            };
        var setEl2 = function (id, val) {
          var el = document.getElementById(id);
          if (!el) return;
          if (el.type === "checkbox") el.checked = !!val;
          else el.value = val != null ? val : "";
        };
        setEl2("av-enabled", av.enabled);
        setEl2("av-mode", av.style || "none");
        setEl2("av-scale", av.scale != null ? av.scale : 1.0);
        setEl2("av-opacity", av.opacity != null ? av.opacity : 1.0);
        setEl2("av-rotation", av.rotationMode || "motion");
        if (av.tint) setEl2("av-tint", av.tint);
        var scOut = document.getElementById("av-scale-value");
        if (scOut) scOut.value = (av.scale || 1.0).toFixed(2);
        var opOut = document.getElementById("av-opacity-value");
        if (opOut)
          opOut.value = (av.opacity != null ? av.opacity : 1.0).toFixed(2);
        _syncAvatarModeRow(av.style || "none");
        // Seed collider radius — collision is automatic when avatar.enabled
        var _col = av.collider || { radius: 20 };
        var crEl = document.getElementById("av-collider-radius");
        var crOut = document.getElementById("av-collider-radius-value");
        if (crEl) {
          crEl.value = _col.radius || 20;
        }
        if (crOut) {
          crOut.value = _col.radius || 20;
        }
      })();

      // ISOLATION FIX: use .on* assignment instead of addEventListener.
      // el.addEventListener stacks listeners per bindInspector call (every selection change),
      // causing all previously-selected walkers to be mutated by later inspector changes.
      // .on* replaces the handler — exactly one handler active at all times, targeting
      // the walker captured in this bindInspector closure only.
      var _avBind = function (id, fn) {
        var el = document.getElementById(id);
        if (!el) return;
        var useChange =
          el.type === "checkbox" ||
          el.tagName === "SELECT" ||
          el.type === "color";
        var handler = function () {
          var w = _walkerForObj();
          if (!w) return;
          fn(
            _ensureAvatar(w),
            el.type === "checkbox" ? el.checked : el.value,
            w,
          );
          renderFrame();
        };
        if (useChange) {
          el.onchange = handler;
        } else {
          el.oninput = handler;
        }
      };

      _avBind("av-enabled", function (av, v) {
        av.enabled = v;
      });
      _avBind("av-mode", function (av, v) {
        av.style = v;
        _syncAvatarModeRow(v);
      });
      _avBind("av-glyph", function (av, v) {
        av.glyphId = v || null;
      });
      _avBind("av-scale", function (av, v) {
        av.scale = Number(v);
        var o = document.getElementById("av-scale-value");
        if (o) o.value = Number(v).toFixed(2);
      });
      _avBind("av-opacity", function (av, v) {
        av.opacity = Number(v);
        var o = document.getElementById("av-opacity-value");
        if (o) o.value = Number(v).toFixed(2);
      });
      _avBind("av-rotation", function (av, v) {
        av.rotationMode = v;
      });
      // Tint: avColor = av.tint || walkerColor is recomputed every render frame — no cache
      _avBind("av-tint", function (av, v) {
        av.tint = v;
      });

      // Tint clear — .onclick assignment (single handler, no leak)
      var avTintClear = document.getElementById("av-tint-clear");
      if (avTintClear) {
        avTintClear.onclick = function () {
          var w = _walkerForObj();
          if (w) {
            _ensureAvatar(w).tint = null;
            renderFrame();
          }
        };
      }

      // ── Collider controls (AvatarCollisionBodies v1.0.0) ──────────────────
      // av-collider-enabled is now a hidden input (collision is automatic).
      // Binding kept for backward compat with serialized states that reference it.
      (function () {
        var outEl = document.getElementById("av-collider-radius-value");
        var rangeEl = document.getElementById("av-collider-radius");
        if (rangeEl) {
          // Seed from current walker's collider radius
          var _wSeed = _walkerForObj();
          if (_wSeed && _wSeed.avatar) {
            var _seedCollider = _wSeed.avatar.collider || {};
            rangeEl.value = _seedCollider.radius || 20;
            if (outEl) outEl.value = rangeEl.value;
          }
          rangeEl.oninput = function () {
            var w = _walkerForObj();
            if (!w) return;
            var av = _ensureAvatar(w);
            if (!av.collider)
              av.collider = {
                type: "circle",
                radius: 20,
                offsetX: 0,
                offsetY: 0,
                enabled: true,
              };
            av.collider.radius = Number(this.value);
            if (outEl) outEl.value = this.value;
            renderFrame();
          };
        }
      })();

      // Sound — writes directly to obj.sound
      bind("obj-soundSource", function (v) {
        obj.sound.source = v;
      });
      bind("obj-soundRole", function (v) {
        obj.sound.role = v;
      });
      bind("obj-soundTrigger", function (v) {
        obj.sound.trigger = v;
      });
      bind("obj-bankId", function (v) {
        obj.bankId = v || null;
        state.activeBankId = v || null;
        renderBankGrid();
      });
      bind("obj-noteClass", function (v) {
        var nc = Number(v);
        obj.noteClass = nc;
        var color = noteClassToColor(nc);
        obj.color = color;
        if (obj.visual) obj.visual.fill = color;
        if (obj.sound && obj.sound.midi)
          obj.sound.midi.note = noteToMidi(nc, obj.octave || 4);
        renderFrame();
      });
      bind("obj-octave", function (v) {
        var oct = Math.max(0, Math.min(8, Number(v)));
        obj.octave = oct;
        if (obj.sound && obj.sound.midi)
          obj.sound.midi.note = noteToMidi(obj.noteClass || 0, oct);
      });
    }
    // ── End bindInspector ────────────────────────────────────────────────

    function bindGlobalKeyboardShortcuts() {
      if (window._wosKeyboardBound) {
        console.warn("[KEYBOARD] already bound");
        return;
      }
      window._wosKeyboardBound = true;

      global.addEventListener(
        "keydown",
        async function onKeyDown(event) {
          heldKeys.add(event.key.toLowerCase());
          if (event.key === "Shift") input.shift = true;

          if (textEditor && event.key === "Escape") {
            event.preventDefault();
            removeCanvasTextInput(false);
            return;
          }

          if (state.textEditing && state.activeLabelId) {
            var _editLabel = getLabelById(state.activeLabelId);
            if (_editLabel) {
              event.preventDefault();
              if (event.key === "Escape") {
                if (!_editLabel.text) removeLabel(_editLabel.id);
                state.textEditing = false;
                state.activeLabelId = null;
              } else if (event.key === "Backspace") {
                _editLabel.text = _editLabel.text.slice(0, -1);
              } else if (event.key === "Enter") {
                if (event.shiftKey) {
                  if (!_editLabel.text) removeLabel(_editLabel.id);
                  state.textEditing = false;
                  state.activeLabelId = null;
                } else {
                  _editLabel.text += "\n";
                }
              } else if (event.key.length === 1) {
                _editLabel.text += event.key;
              }
              renderFrame();
              return;
            }
          }

          if (isTypingTarget()) {
            return;
          }

          // ── Shortcut suspension — takesFocus drawers (e.g. GlyphLab) ─────────
          if (window._wos && window._wos._shortcutsSuspended) {
            return;
          }

          // Route World keyboard shortcuts (only when route is loaded)
          if (
            state.routeWorld &&
            state.routeWorld.routes.length > 0 &&
            !event.metaKey &&
            !event.ctrlKey
          ) {
            var rwShortcut = false;
            if (event.key === "1") {
              window._wos.routeWorld.setCameraMode("overview");
              rwShortcut = true;
            }
            if (event.key === "2") {
              window._wos.routeWorld.setCameraMode("follow");
              rwShortcut = true;
            }
            if (event.key === "3") {
              window._wos.routeWorld.setCameraMode("cinematic");
              rwShortcut = true;
            }
            if (event.key.toLowerCase() === "f" && !event.shiftKey) {
              window._wos.routeWorld.fitRouteToCanvas(null, { padding: 120 });
              rwShortcut = true;
            }
            if (rwShortcut) {
              event.preventDefault();
              return;
            }
          }

          console.log("[KEYDOWN TRACE]", {
            key: event.key,
            code: event.code,
            meta: event.metaKey,
            ctrl: event.ctrlKey,
            shift: event.shiftKey,
            activeElement:
              document.activeElement && document.activeElement.tagName
                ? document.activeElement.tagName.toLowerCase()
                : null,
          });

          // ── Symbol tool keyboard ─────────────────────────────────────────────
          // ESC — exit placement/brush mode, or clear selection
          if (event.key === "Escape") {
            if (
              state.tool === "symbol-place" ||
              state.tool === "symbol-brush"
            ) {
              event.preventDefault();
              state.tool = "select";
              _symGhost.visible = false;
              _symMarquee = null;
              syncUI();
              renderFrame();
              return;
            }
            if (
              state.selectedSymbolObjectIds &&
              state.selectedSymbolObjectIds.size
            ) {
              event.preventDefault();
              state.selectedSymbolObjectIds.clear();
              _symMarquee = null;
              renderFrame();
              return;
            }
          }

          // Symbol multi-select keyboard ops (before generic handlers)
          if (
            state.selectedSymbolObjectIds &&
            state.selectedSymbolObjectIds.size > 0
          ) {
            var _SOS = global.SBE && global.SBE.SymbolObjectSystem;

            // Cmd+D — duplicate selection
            if (
              event.key &&
              event.key.toLowerCase() === "d" &&
              (event.metaKey || event.ctrlKey)
            ) {
              event.preventDefault();
              if (_SOS) {
                var _newIds = new Set();
                var _selected = _SOS.getSelectedObjects(
                  state.symbolObjects,
                  state.selectedSymbolObjectIds,
                );
                _selected.forEach(function (src) {
                  var copy = _SOS.duplicate(src);
                  state.symbolObjects.push(copy);
                  _newIds.add(copy.id);
                });
                state.selectedSymbolObjectIds = _newIds;
                renderFrame();
              }
              return;
            }

            // Delete / Backspace — remove selected
            if (event.key === "Delete" || event.key === "Backspace") {
              event.preventDefault();
              var _delIds = state.selectedSymbolObjectIds;
              state.symbolObjects = state.symbolObjects.filter(function (o) {
                return !_delIds.has(o.id);
              });
              state.selectedSymbolObjectIds = new Set();
              renderFrame();
              return;
            }

            // Arrow keys — nudge (1px) or Shift+Arrow (10px)
            var _nudge = 0;
            if (event.key === "ArrowLeft") _nudge = event.shiftKey ? -10 : -1;
            if (event.key === "ArrowRight") _nudge = event.shiftKey ? 10 : 1;
            var _nudgeY = 0;
            if (event.key === "ArrowUp") _nudgeY = event.shiftKey ? -10 : -1;
            if (event.key === "ArrowDown") _nudgeY = event.shiftKey ? 10 : 1;
            if (_nudge !== 0 || _nudgeY !== 0) {
              event.preventDefault();
              if (_SOS)
                _SOS.moveGroup(
                  state.symbolObjects,
                  state.selectedSymbolObjectIds,
                  _nudge,
                  _nudgeY,
                );
              renderFrame();
              return;
            }

            // Z-order: ] = bring forward, [ = send backward, Shift+] = front, Shift+[ = back
            if (event.key === "]" && _SOS) {
              event.preventDefault();
              state.selectedSymbolObjectIds.forEach(function (id) {
                if (event.shiftKey) _SOS.bringToFront(state.symbolObjects, id);
                else _SOS.bringForward(state.symbolObjects, id);
              });
              renderFrame();
              return;
            }
            if (event.key === "[" && _SOS) {
              event.preventDefault();
              state.selectedSymbolObjectIds.forEach(function (id) {
                if (event.shiftKey) _SOS.sendToBack(state.symbolObjects, id);
                else _SOS.sendBackward(state.symbolObjects, id);
              });
              renderFrame();
              return;
            }
          }

          // Cmd+D — duplicate (must precede plain D)
          if (
            event.key &&
            event.key.toLowerCase() === "d" &&
            (event.metaKey || event.ctrlKey)
          ) {
            event.preventDefault();
            event.stopPropagation();
            console.log("[DUPLICATE KEY] before", window._wos.debugSelection());
            var _dupResult = await duplicateSelectedObject();
            console.log("[DUPLICATE KEY] result", _dupResult);
            return;
          }

          // Delete / Backspace
          if (event.key === "Delete" || event.key === "Backspace") {
            event.preventDefault();
            event.stopPropagation();
            console.log("[DELETE KEY] before", window._wos.debugSelection());
            var _delResult = deleteSelectedObject();
            console.log("[DELETE KEY] result", _delResult);
            return;
          }

          if (event.key === " ") {
            // In geo/navigate mode spacebar is reserved for viewport pan — not transport
            if (
              SBE.Workspace &&
              SBE.Workspace.isGeographicMode &&
              SBE.Workspace.isGeographicMode() &&
              SBE.Workspace.getInteractionMode &&
              SBE.Workspace.getInteractionMode() === "navigate"
            ) return;
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
            state.tool = "pen";
            syncUI();
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
            state.tool = "pen";
            syncUI();
            return;
          }
          if (event.key.toLowerCase() === "p") {
            state.tool = "pen";
            syncUI();
            return;
          }

          if (
            event.key.toLowerCase() === "g" &&
            (event.metaKey || event.ctrlKey) &&
            event.shiftKey
          ) {
            event.preventDefault();
            ungroupSelected();
            return;
          }
          if (
            event.key.toLowerCase() === "g" &&
            (event.metaKey || event.ctrlKey)
          ) {
            event.preventDefault();
            var strokeEntries = state.multiSelection.filter(function (e) {
              return e.type === "stroke";
            });
            if (strokeEntries.length > 1) {
              var ids = strokeEntries.map(function (e) {
                return e.id;
              });
              var grp = createGroup(ids);
              if (grp) {
                state.multiSelection = [{ type: "group", id: grp.id }];
                syncLegacySelection();
                syncSelectionPanel();
                renderFrame();
              }
            }
            return;
          }
          if (
            event.key.toLowerCase() === "g" &&
            !(event.metaKey || event.ctrlKey)
          ) {
            state.grid.enabled = !state.grid.enabled;
            renderFrame();
            return;
          }
          if (
            event.key.toLowerCase() === "k" &&
            !(event.metaKey || event.ctrlKey)
          ) {
            saveSelectedShape();
            syncShapeLibraryTab(true);
            return;
          }

          if (state.tool === "pen" && state.penTool.isDrawing) {
            if (event.key === "Escape") {
              state.penTool.currentStroke = null;
              state.penTool.isDrawing = false;
              state.penTool.previewPoint = null;
              renderFrame();
              return;
            }
            if (event.key === "Enter") {
              event.preventDefault();
              if (state.penTool.mode === "shape") commitShapeStroke(false);
              else if (
                state.penTool.mode === "line" &&
                state.penTool.currentStroke
              ) {
                var cs = state.penTool.currentStroke;
                if (state.penTool.previewPoint && cs.points.length > 0)
                  commitLineStroke(cs.points[0], state.penTool.previewPoint);
              }
              return;
            }
            if (
              event.key === "Backspace" &&
              state.penTool.mode === "shape" &&
              state.penTool.currentStroke
            ) {
              event.preventDefault();
              var cs2 = state.penTool.currentStroke;
              if (cs2.points.length > 1) cs2.points.pop();
              else {
                state.penTool.currentStroke = null;
                state.penTool.isDrawing = false;
              }
              renderFrame();
              return;
            }
          }

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

          var modifier = event.metaKey || event.ctrlKey;
          if (!modifier) return;
          if (event.key.toLowerCase() === "z") {
            event.preventDefault();
            await undo();
          }
          if (event.key.toLowerCase() === "a") {
            event.preventDefault();
            selectAllObjects();
          }
        },
        true,
      );

      global.addEventListener("keyup", function onKeyUp(event) {
        heldKeys.delete(event.key.toLowerCase());
        if (event.key === "Shift") input.shift = false;
      });

      console.log("[KEYBOARD] bound");
    }

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
        var scene = {
          version: "wos-scene-v2",
          canvas: clone(state.canvas),
          swarm: clone(state.swarm),
          balls: clone(state.balls || []),
          projectileWalkers: clone(state.projectileWalkers || []),
          shapes: clone(state.shapes || []),
          textObjects: clone(state.textObjects || []),
          background: state.backgroundDataUrl || null,
          lines: clone(
            (state.lines || []).filter(function (l) {
              return !isDerivedStrokeLine(l);
            }),
          ),
          strokes: clone(state.strokes || []),
          groups: clone(state.groups || {}),
          walkers: clone(state.walkers || []),
        };
        console.log("[save]", {
          strokes: scene.strokes.length,
          groups: Object.keys(scene.groups || {}).length,
          walkers: scene.walkers.length,
          lines: scene.lines.length,
        });
        // Own download — bypasses SceneManager which may reserialize state directly
        try {
          var json = JSON.stringify(scene, null, 2);
          var blob = new Blob([json], { type: "application/json" });
          var url = URL.createObjectURL(blob);
          var a = document.createElement("a");
          a.href = url;
          a.download = "wos-scene.json";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        } catch (err) {
          console.error("[save] failed", err);
          // Fallback to SceneManager
          SBE.SceneManager.downloadScene(scene, "wos-scene");
        }
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

      // ── Live inspector propagation functions ─────────────────────────────────

      function applyNoteColorToSelection(note) {
        var color = noteToColor(note);
        var targets =
          typeof getSelectedStrokeTargets === "function"
            ? getSelectedStrokeTargets()
            : [];
        if (targets.length > 0) {
          targets.forEach(function (s) {
            s.color = color;
            // Reset fx so renderer uses updated stroke.color
            if (s.motion && s.motion.fx) {
              s.motion.fx.colorSource = "note";
              s.motion.fx.color = color;
            }
            applyStrokeUpdates(s);
          });
          renderFrame();
          return;
        }
        // No selection — update defaults only
        state.defaults.color = color;
        renderFrame();
      }

      function applyModeToStroke(stroke) {
        if (!stroke || !stroke.motion) return;
        var mode = stroke.motion.mode;
        if (!mode) return;
        // Speed presets per mode — ensures walker actually moves at a visible rate
        var modeSpeed = {
          loop: 0.0012 * 60,
          pingpong: 0.0035 * 60,
          tunnel: 0.0028 * 60,
        };
        state.walkers.forEach(function (w) {
          if (w.strokeId === stroke.id) {
            w.motionMode = mode;
            if (modeSpeed[mode] != null) w.speed = modeSpeed[mode];
            console.log(
              "[MODE APPLY]",
              mode,
              "speed:",
              w.speed,
              "strokeId:",
              stroke.id,
              "walkerId:",
              w.id,
            );
          }
        });
      }

      function applyStrokeWidth(stroke) {
        if (!stroke) return;
        var t = stroke.width;
        stroke.thickness = t;
        if (stroke.segments) {
          stroke.segments.forEach(function (s) {
            s.thickness = t;
          });
        }
      }

      var MOTION_PRESETS = {
        drift: {
          walker: { speed: 0.0012 * 60, mode: "loop" },
          emission: { rate: 120, spread: 0.4, life: 1.8, size: 2 },
        },
        pulse: {
          walker: { speed: 0.0035 * 60, mode: "pingpong" },
          emission: { rate: 40, spread: 0.1, life: 0.4, size: 3 },
        },
        tunnel: {
          walker: { speed: 0.0028 * 60, mode: "tunnel" },
        },
      };

      function applyPresetToWalkers(stroke) {
        if (!stroke || !stroke.motionPreset) return;
        var preset = MOTION_PRESETS[stroke.motionPreset];
        if (!preset) return;
        state.walkers.forEach(function (w) {
          if (w.strokeId === stroke.id) {
            if (preset.walker) Object.assign(w, preset.walker);
            if (preset.emission && w.emitter)
              Object.assign(w.emitter, preset.emission);
          }
        });
      }

      function applyMotionPreset(stroke, id) {
        var preset = MOTION_PRESETS[id];
        if (!preset || !stroke) return;
        stroke.motionPreset = id;
        if (!stroke.motion) stroke.motion = {};
        if (preset.walker) Object.assign(stroke.motion, preset.walker);
        if (preset.emission) {
          var fx = getFX(stroke);
          Object.assign(fx, preset.emission);
        }
        applyStrokeUpdates(stroke);
      }

      function refreshStrokeBridgeLines(stroke) {
        // Sync derived state.lines color + thickness with live stroke values.
        // Keeps collision/sound data current without rebuilding the whole bridge.
        if (!stroke) return;
        state.lines.forEach(function (l) {
          if (l._strokeId === stroke.id && l._isDerived) {
            l.color = stroke.color;
            l.thickness = stroke.width;
            if (l.style) {
              l.style.color = stroke.color;
              l.style.thickness = stroke.width;
            }
          }
        });
      }

      function applyStrokeUpdates(stroke) {
        if (!stroke) return;
        applyStrokeWidth(stroke);
        applyModeToStroke(stroke);
        applyPresetToWalkers(stroke);
        refreshStrokeBridgeLines(stroke);
        invalidateStrokeRuntime(stroke.id);
        ensureSingleWalker(stroke.id);
        renderFrame();
      }

      elements.noteCells.forEach((cell) => {
        cell.addEventListener("click", function chooseNoteClass() {
          if (window.WOS && WOS.mode === "play") {
            // Play mode — note cells do NOT assign; emitters run via behaviorLoop
            return;
          }
          // Assign mode — set WOS.currentNote (full MIDI note, preserving current octave)
          var noteClass = Number(cell.dataset.noteClass);
          var octave = Math.floor(
            (WOS.currentNote || state.defaults.note || 60) / 12,
          );
          var fullNote = clampInt(octave * 12 + noteClass, 0, 127);
          WOS.currentNote = fullNote;
          applyNoteColorToSelection(fullNote);
          // Update visual selection
          elements.noteCells.forEach(function (c) {
            c.classList.toggle(
              "active",
              Number(c.dataset.noteClass) === noteClass,
            );
          });
        });
      });

      if (elements.lineBehavior)
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
      var emitterInputs = [
        "behaviorEmitterRate",
        "behaviorEmitterDensity",
        "behaviorEmitterDirection",
        "behaviorEmitterSpread",
        "behaviorEmitterSpeed",
        "behaviorEmitterSize",
        "behaviorEmitterLife",
        "behaviorEmitterStyle",
      ];
      emitterInputs.forEach(function (name) {
        if (elements[name]) {
          elements[name].addEventListener("input", function () {
            applyInspectorMetadata(false);
          });
          elements[name].addEventListener("change", function () {
            applyInspectorMetadata(false);
          });
        }
      });

      if (elements.lineMechanic) {
        elements.lineMechanic.addEventListener(
          "change",
          function updateMechanicType() {
            applyInspectorMetadata();
          },
        );
      }

      if (elements.lineStrength)
        elements.lineStrength.addEventListener(
          "input",
          function updateBehaviorStrength() {
            applyInspectorMetadata(false);
          },
        );

      if (elements.lineThickness) {
        elements.lineThickness.addEventListener(
          "input",
          function updateThickness() {
            applyInspectorMetadata(false);
          },
        );
      }

      if (elements.strokeWidth) {
        elements.strokeWidth.addEventListener(
          "input",
          function updateStrokeWidth() {
            var sw = Number(elements.strokeWidth.value);
            if (isNaN(sw) || sw < 1) return;
            var targets =
              typeof getSelectedStrokeTargets === "function"
                ? getSelectedStrokeTargets()
                : [];
            if (targets.length > 0) {
              targets.forEach(function (stroke) {
                stroke.baseWidth = sw;
                stroke.scale = 1;
                stroke.width = sw;
                applyStrokeUpdates(stroke);
              });
              renderFrame();
              return;
            }
            state.defaults.strokeWidth = sw;
            applyInspectorMetadata(false);
          },
        );
      }

      // ── Hide Outline checkbox binding ──
      (function bindRenderMode() {
        var btn = document.getElementById("toggle-visibility");
        if (!btn) return;

        function getCurrentMode() {
          var stroke = getSelectedStroke();
          return stroke
            ? stroke.renderMode || "visible"
            : state.defaultRenderMode || "visible";
        }

        function updateBtn() {
          var mode = getCurrentMode();
          btn.textContent = mode === "hidden" ? "👁‍🗨" : "👁";
          btn.title =
            mode === "hidden"
              ? "Outline hidden — click to show"
              : "Outline visible — click to hide";
        }

        btn.addEventListener("click", function () {
          var targets =
            typeof getSelectedStrokeTargets === "function"
              ? getSelectedStrokeTargets()
              : [];
          if (targets.length > 0) {
            var nextMode = targets.some(function (s) {
              return (s.renderMode || "visible") !== "hidden";
            })
              ? "hidden"
              : "visible";
            targets.forEach(function (s) {
              s.renderMode = nextMode;
              s.outlineVisible = nextMode !== "hidden";
              applyStrokeUpdates(s);
            });
            updateBtn();
            renderFrame();
            return;
          }
          state.defaultRenderMode =
            state.defaultRenderMode === "hidden" ? "visible" : "hidden";
          updateBtn();
          renderFrame();
        });

        // Sync button state when selection changes
        var orig = window._wos_syncBehaviorPanel;
        window._wos_syncBehaviorPanel = function () {
          updateBtn();
          if (orig) orig();
        };

        updateBtn();
      })();

      if (elements.lineColor)
        elements.lineColor.addEventListener(
          "input",
          function syncDisplayColor() {
            var color = elements.lineColor.value;
            var targets =
              typeof getSelectedStrokeTargets === "function"
                ? getSelectedStrokeTargets()
                : [];
            if (targets.length > 0) {
              targets.forEach(function (s) {
                s.color = color;
                // Reset fx so resolveFXColor uses the updated stroke.color
                if (s.motion && s.motion.fx) {
                  s.motion.fx.colorSource = "note";
                  s.motion.fx.color = color;
                }
                applyStrokeUpdates(s);
              });
              renderFrame();
              return;
            }
            // No selection — persist default for future strokes
            state.defaults.color = color;
            var nextNote = findClosestNoteForColor(color);
            if (nextNote !== null) {
              applyNoteClass(
                nextNote % 12,
                Math.floor(state.defaults.note / 12),
              );
            }
          },
        );

      elements.colorSwatches.forEach((swatch) => {
        swatch.addEventListener("click", function syncSwatchColor() {
          const nextNote = findClosestNoteForColor(swatch.dataset.color);
          if (nextNote !== null) {
            applyNoteClass(nextNote % 12, Math.floor(state.defaults.note / 12));
          }
        });
      });

      if (elements.textContent)
        elements.textContent.addEventListener(
          "input",
          function updateTextContent() {
            state.defaults.textValue = elements.textContent.value;
            scheduleSelectedTextRefresh();
          },
        );

      if (elements.textSize)
        elements.textSize.addEventListener("input", function updateTextSize() {
          state.defaults.textSize = clampInt(
            Number(elements.textSize.value),
            24,
            420,
          );
          scheduleSelectedTextRefresh();
        });

      if (elements.textX)
        elements.textX.addEventListener("input", function updateTextX() {
          applySelectedTextTransform({ x: Number(elements.textX.value) });
        });

      if (elements.textY)
        elements.textY.addEventListener("input", function updateTextY() {
          applySelectedTextTransform({ y: Number(elements.textY.value) });
        });

      if (elements.textScale)
        elements.textScale.addEventListener(
          "input",
          function updateTextScale() {
            applySelectedTextTransform({
              scale: Number(elements.textScale.value),
            });
          },
        );

      if (elements.textRotation)
        elements.textRotation.addEventListener(
          "input",
          function updateTextRotation() {
            applySelectedTextTransform({
              rotation: Number(elements.textRotation.value),
            });
          },
        );

      if (elements.centerText)
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
          this.blur();
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

      // ── Field Visualization bindings (FieldVisualizationSystem v1.0.0) ───

      (function bindFieldViz() {
        function fv() {
          return state.world.fieldViz;
        }

        var fvEnabled = document.getElementById("fv-enabled");
        if (fvEnabled) {
          fvEnabled.checked = fv().enabled;
          fvEnabled.addEventListener("change", function () {
            fv().enabled = this.checked;
          });
        }

        // Visible: controls whether the overlay renders (independent of Active/enabled)
        var fvVisible = document.getElementById("fv-visible");
        if (fvVisible) {
          if (fv().visible == null) fv().visible = true; // default on
          fvVisible.checked = fv().visible !== false;
          fvVisible.addEventListener("change", function () {
            fv().visible = this.checked;
          });
        }

        var fvMode = document.getElementById("fv-mode");
        if (fvMode) {
          fvMode.value = fv().mode;
          fvMode.addEventListener("change", function () {
            fv().mode = this.value;
            this.blur();
          });
        }

        var fvPalette = document.getElementById("fv-palette");
        if (fvPalette) {
          fvPalette.value = fv().palette;
          fvPalette.addEventListener("change", function () {
            fv().palette = this.value;
            this.blur();
          });
        }

        var fvOpacity = document.getElementById("fv-opacity");
        var fvOpacityOut = document.getElementById("fv-opacity-value");
        if (fvOpacity) {
          fvOpacity.value = fv().opacity;
          fvOpacity.addEventListener("input", function () {
            fv().opacity = Number(this.value);
            if (fvOpacityOut)
              fvOpacityOut.value = Number(this.value).toFixed(2);
          });
        }

        var fvBlur = document.getElementById("fv-blur");
        var fvBlurOut = document.getElementById("fv-blur-value");
        if (fvBlur) {
          fvBlur.value = fv().blur;
          fvBlur.addEventListener("input", function () {
            fv().blur = Number(this.value);
            if (fvBlurOut) fvBlurOut.value = this.value;
          });
        }

        var fvDecay = document.getElementById("fv-decay");
        var fvDecayOut = document.getElementById("fv-decay-value");
        if (fvDecay) {
          fvDecay.value = fv().decay;
          fvDecay.addEventListener("input", function () {
            fv().decay = Number(this.value);
            if (fvDecayOut) fvDecayOut.value = this.value;
          });
        }

        var fvAccum = document.getElementById("fv-accum");
        var fvAccumOut = document.getElementById("fv-accum-value");
        if (fvAccum) {
          fvAccum.value = fv().accumulation;
          fvAccum.addEventListener("input", function () {
            fv().accumulation = Number(this.value);
            if (fvAccumOut) fvAccumOut.value = Number(this.value).toFixed(3);
          });
        }

        var fvClear = document.getElementById("fv-clear-density");
        if (fvClear) {
          fvClear.addEventListener("click", function () {
            if (window.SBE && SBE.FieldRenderer)
              SBE.FieldRenderer.clearDensity();
          });
        }
      })();

      // ── Field Visualizer debug bindings (FieldVisualizer v1.0.0) ─────────
      (function () {
        function fdbg() {
          return state.fieldVisualizer;
        }

        function _syncFdbgRowVisibility(mode) {
          var rowGrid = document.getElementById("fdbg-row-gridstep");
          var rowTrail = document.getElementById("fdbg-row-traildecay");
          if (rowGrid) rowGrid.style.display = mode === "vectors" ? "" : "none";
          if (rowTrail)
            rowTrail.style.display = mode === "trails" ? "" : "none";
        }

        var el;

        el = document.getElementById("fdbg-enabled");
        if (el) {
          el.checked = fdbg().enabled;
          el.addEventListener("change", function () {
            fdbg().enabled = this.checked;
          });
        }

        el = document.getElementById("fdbg-mode");
        if (el) {
          el.value = fdbg().mode;
          _syncFdbgRowVisibility(fdbg().mode);
          el.addEventListener("change", function () {
            fdbg().mode = this.value;
            _syncFdbgRowVisibility(this.value);
            if (window.SBE && SBE.FieldVisualizer) SBE.FieldVisualizer.clear();
            this.blur();
          });
        }

        el = document.getElementById("fdbg-palette");
        if (el) {
          el.value = fdbg().palette;
          el.addEventListener("change", function () {
            fdbg().palette = this.value;
            this.blur();
          });
        }

        var opOut = document.getElementById("fdbg-opacity-value");
        el = document.getElementById("fdbg-opacity");
        if (el) {
          el.value = fdbg().opacity;
          el.addEventListener("input", function () {
            fdbg().opacity = Number(this.value);
            if (opOut) opOut.value = Number(this.value).toFixed(2);
          });
        }

        var gsOut = document.getElementById("fdbg-gridstep-value");
        el = document.getElementById("fdbg-gridstep");
        if (el) {
          el.value = fdbg().gridStep;
          el.addEventListener("input", function () {
            fdbg().gridStep = Number(this.value);
            if (gsOut) gsOut.value = this.value;
          });
        }

        var tdOut = document.getElementById("fdbg-traildecay-value");
        el = document.getElementById("fdbg-traildecay");
        if (el) {
          el.value = fdbg().trailDecay;
          el.addEventListener("input", function () {
            fdbg().trailDecay = Number(this.value);
            if (tdOut) tdOut.value = Number(this.value).toFixed(3);
          });
        }

        el = document.getElementById("fdbg-orbital-mode");
        if (el) {
          var _flow =
            state.world && state.world.physics && state.world.physics.flow;
          el.value = (_flow && _flow.orbitalMode) || "tangential";
          el.addEventListener("change", function () {
            if (
              state.world &&
              state.world.physics &&
              state.world.physics.flow
            ) {
              state.world.physics.flow.orbitalMode = this.value;
            }
            if (window.SBE && SBE.FieldVisualizer) SBE.FieldVisualizer.clear();
            this.blur();
          });
        }
      })();

      // ── Dual-plane physics bindings (DualPlanePhysics v1.0.0) ────────────

      // Plane mode segment group: Side / Topdown / Hybrid
      var planeModeGroup = document.getElementById("plane-mode-group");
      if (planeModeGroup) {
        planeModeGroup.addEventListener("click", function (e) {
          var btn = e.target.closest("[data-plane-mode]");
          if (!btn) return;
          var mode = btn.dataset.planeMode;
          if (!state.world.physics) state.world.physics = {};
          state.world.physics.mode = mode;
          // Update active button
          planeModeGroup.querySelectorAll(".insp-seg").forEach(function (b) {
            b.classList.toggle("active", b.dataset.planeMode === mode);
          });
          // Field section always visible — Side also needs wind/rain/flow/vector fields.
        });
        // Side mode still exposes field section — side worlds need wind/flow/vector fields.
        // Only the field section visibility is controlled by plane mode, not hidden entirely.
        // (No initial hide — field section always visible)
      }

      // World field type
      var worldFieldTypeEl = document.getElementById("world-field-type");
      if (worldFieldTypeEl) {
        worldFieldTypeEl.addEventListener("change", function () {
          if (!state.world.physics) state.world.physics = {};
          if (!state.world.physics.world) state.world.physics.world = {};
          state.world.physics.world.fieldType = this.value;
          // Show/hide direction row
          var rowVec = document.getElementById("row-world-vector");
          if (rowVec)
            rowVec.style.display = this.value !== "none" ? "" : "none";
          // Show/hide Orbital Mode row
          var rowOrb = document.getElementById("row-world-orbital-subtype");
          if (rowOrb)
            rowOrb.style.display = this.value === "orbital" ? "" : "none";
        });
      }

      // World orbital sub-type (Tangential / Radial / Spiral)
      // Writes to state.world.physics.flow.orbitalMode — same field as legacy fdbg-orbital-mode
      (function () {
        var orbEl = document.getElementById("world-orbital-subtype");
        if (!orbEl) return;
        // Seed from current state
        var _flow =
          state.world && state.world.physics && state.world.physics.flow;
        orbEl.value = (_flow && _flow.orbitalMode) || "tangential";
        orbEl.addEventListener("change", function () {
          if (!state.world.physics) state.world.physics = {};
          if (!state.world.physics.flow) state.world.physics.flow = {};
          state.world.physics.flow.orbitalMode = this.value;
          if (window.SBE && SBE.FieldVisualizer) SBE.FieldVisualizer.clear();
          this.blur();
        });
        // Init visibility
        var _ft =
          state.world &&
          state.world.physics &&
          state.world.physics.world &&
          state.world.physics.world.fieldType;
        var rowOrb = document.getElementById("row-world-orbital-subtype");
        if (rowOrb) rowOrb.style.display = _ft === "orbital" ? "" : "none";
      })();

      // World vector angle (degrees → normalized vector)
      var worldVectorAngleEl = document.getElementById("world-vector-angle");
      var worldVectorAngleOut = document.getElementById(
        "world-vector-angle-value",
      );
      if (worldVectorAngleEl) {
        worldVectorAngleEl.addEventListener("input", function () {
          var deg = Number(this.value);
          var rad = ((deg - 90) * Math.PI) / 180; // 0° = north (up in screen coords)
          if (!state.world.physics) state.world.physics = {};
          if (!state.world.physics.world) state.world.physics.world = {};
          state.world.physics.world.vectorX = Math.cos(rad);
          state.world.physics.world.vectorY = Math.sin(rad);
          if (worldVectorAngleOut) worldVectorAngleOut.value = deg + "°";
        });
      }

      // World field strength
      var worldFieldStrEl = document.getElementById("world-field-strength");
      var worldFieldStrOut = document.getElementById(
        "world-field-strength-value",
      );
      if (worldFieldStrEl) {
        worldFieldStrEl.addEventListener("input", function () {
          if (!state.world.physics) state.world.physics = {};
          if (!state.world.physics.world) state.world.physics.world = {};
          state.world.physics.world.strength = Number(this.value);
          if (worldFieldStrOut)
            worldFieldStrOut.value = Number(this.value).toFixed(1);
        });
      }

      // ── Flow field walker drift bindings (FlowFieldWalkerDrift v1.0.0) ──

      // Show/hide walker-drift-section when plane mode changes
      // (re-use planeModeGroup listener already bound above — also init here)
      (function syncDriftSection() {
        var driftSection = document.getElementById("walker-drift-section");
        function update() {
          // Drift is valid in ALL plane modes — side worlds support wind/flow/vector fields.
          if (driftSection) driftSection.style.display = "";
        }
        update();
        // Patch plane mode group to also call update
        var pg = document.getElementById("plane-mode-group");
        if (pg) {
          pg.addEventListener("click", function () {
            setTimeout(update, 0); // after state updated by existing handler
          });
        }
      })();

      var flowDriftEnabled = document.getElementById("flow-drift-enabled");
      if (flowDriftEnabled) {
        flowDriftEnabled.checked = state.world.physics.flow.enabled;
        flowDriftEnabled.addEventListener("change", function () {
          state.world.physics.flow.enabled = this.checked;
        });
      }

      var flowDriftStrEl = document.getElementById("flow-drift-strength");
      var flowDriftStrOut = document.getElementById(
        "flow-drift-strength-value",
      );
      if (flowDriftStrEl) {
        flowDriftStrEl.value = state.world.physics.flow.strength;
        flowDriftStrEl.addEventListener("input", function () {
          state.world.physics.flow.strength = Number(this.value);
          if (flowDriftStrOut)
            flowDriftStrOut.value = Number(this.value).toFixed(3);
        });
      }

      var flowDriftDampEl = document.getElementById("flow-drift-damping");
      var flowDriftDampOut = document.getElementById(
        "flow-drift-damping-value",
      );
      if (flowDriftDampEl) {
        flowDriftDampEl.value = state.world.physics.flow.damping;
        flowDriftDampEl.addEventListener("input", function () {
          state.world.physics.flow.damping = Number(this.value);
          if (flowDriftDampOut)
            flowDriftDampOut.value = Number(this.value).toFixed(3);
        });
      }

      // ── Maritime System bindings — 0523K ──────────────────────────────────
      // Controls in World → SYSTEMS section. Each binding writes directly to
      // SBE.runtimeFlags (read by subsystems next frame) or calls the subsystem
      // API for immediate effect. No page reload required.
      (function bindMaritimeSystems() {
        var rf  = SBE.runtimeFlags;
        var sys = SBE.systems && SBE.systems.maritime;

        // Maritime Enabled — master switch
        var maritimeEnabledEl = document.getElementById('maritime-enabled');
        if (maritimeEnabledEl) {
          maritimeEnabledEl.checked = !!(rf && rf.maritimeEnabled);
          maritimeEnabledEl.addEventListener('change', function () {
            var on = this.checked;
            if (rf) rf.maritimeEnabled = on;
            if (sys) sys.enabled = on;
            var mor = SBE.MaritimeOccupancyRenderer;
            if (mor) { if (on) mor.enable(true); else mor.enable(false); }
            var mvf = SBE.MaritimeValidationFeed;
            if (mvf) { if (on && rf.enableMaritimeValidationFeed) mvf.enable(true); else mvf.enable(false); }
          });
        }

        // Validation Feed
        var valFeedEl = document.getElementById('maritime-validation-feed');
        if (valFeedEl) {
          valFeedEl.checked = !!(rf && rf.enableMaritimeValidationFeed);
          valFeedEl.addEventListener('change', function () {
            var on = this.checked;
            if (rf) rf.enableMaritimeValidationFeed = on;
            if (sys) sys.validationFeed = on;
            var mvf = SBE.MaritimeValidationFeed;
            if (mvf) { if (on) mvf.enable(true); else mvf.enable(false); }
          });
        }

        // Show Labels
        var labelsEl = document.getElementById('maritime-show-labels');
        if (labelsEl) {
          labelsEl.checked = !!(rf && rf.showMaritimeDebugLabels);
          labelsEl.addEventListener('change', function () {
            if (rf) rf.showMaritimeDebugLabels = this.checked;
          });
        }

        // Show Wakes
        var wakesEl = document.getElementById('maritime-show-wakes');
        if (wakesEl) {
          wakesEl.checked = !!(rf && (rf.showMaritimeWakeGlow !== false));
          wakesEl.addEventListener('change', function () {
            if (rf) rf.showMaritimeWakeGlow = this.checked;
          });
        }

        // Show Nav Lights
        var navLightsEl = document.getElementById('maritime-show-nav-lights');
        if (navLightsEl) {
          navLightsEl.checked = !!(rf && (rf.showMaritimeNavLights !== false));
          navLightsEl.addEventListener('change', function () {
            if (rf) rf.showMaritimeNavLights = this.checked;
          });
        }

        // Land Traffic Enabled
        var landTrafficEl = document.getElementById('land-traffic-enabled');
        if (landTrafficEl) {
          landTrafficEl.checked = !!(rf && rf.landTrafficEnabled);
          landTrafficEl.addEventListener('change', function () {
            if (window._wos && window._wos.enableLandTraffic) {
              window._wos.enableLandTraffic(this.checked);
            }
          });
        }
      })();

      // Field influence slider — operates on selected walker(s)
      var fieldInflEl = document.getElementById("obj-field-influence");
      var fieldInflOut = document.getElementById("obj-field-influence-value");
      if (fieldInflEl) {
        fieldInflEl.addEventListener("input", function () {
          var val = Number(this.value);
          if (fieldInflOut) fieldInflOut.value = val.toFixed(2);
          // Apply to all selected walkers
          state.walkers.forEach(function (w) {
            var sel = state.multiSelection.some(function (s) {
              return s.id === w.strokeId;
            });
            if (sel) w.fieldInfluence = val;
          });
        });
      }

      // Material type binding
      var materialTypeEl = document.getElementById("material-type");
      if (materialTypeEl) {
        materialTypeEl.addEventListener("change", function () {
          var type = this.value;
          this.blur();
          if (!window.SBE || !SBE.MaterialSystem) return;
          state.multiSelection.forEach(function (sel) {
            var obj = null;
            if (sel.type === "line") {
              obj = state.lines.find(function (l) {
                return l.id === sel.id;
              });
            } else if (sel.type === "stroke") {
              obj = state.strokes.find(function (s) {
                return s.id === sel.id;
              });
            }
            if (obj) SBE.MaterialSystem.setMaterialType(obj, type);
          });
          renderFrame();
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

      // Shape Library tab bindings
      var shapeLibSave = document.getElementById("shape-lib-save");
      if (shapeLibSave) {
        shapeLibSave.addEventListener("click", function () {
          saveSelectedShape();
          syncShapeLibraryTab(true);
        });
      }
      var shapeLibRefresh = document.getElementById("shape-lib-refresh");
      if (shapeLibRefresh) {
        shapeLibRefresh.addEventListener("click", function () {
          syncShapeLibraryTab();
        });
      }
      var shapeLibClear = document.getElementById("shape-lib-clear");
      if (shapeLibClear) {
        shapeLibClear.addEventListener("click", function () {
          if (!window.confirm("Delete all saved shapes?")) return;
          try {
            localStorage.removeItem("wos_shapes");
          } catch (e) {}
          syncShapeLibraryTab();
        });
      }

      // Refresh shape library when Shapes tab is clicked
      document.querySelectorAll("[data-tab]").forEach(function (btn) {
        if (btn.dataset.tab === "shapes") {
          btn.addEventListener("click", function () {
            syncShapeLibraryTab(true); // force — tab may just have become active
          });
        }
      });

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

      // ── Motion Brush Panel bindings (state.motion) ──────────────────────────
      (function bindMotionBrushPanel() {
        // Motion Brush tab → writes to state.motionBrush (creation-time preset only)
        var PRESETS = {
          orbit: {
            rate: 60,
            spread: 0.1,
            particleSpeed: 100,
            size: 2,
            life: 1.5,
            mode: "loop",
          },
          comet: {
            rate: 80,
            spread: 0.2,
            particleSpeed: 300,
            size: 4,
            life: 0.4,
            mode: "pingpong",
          },
          dust: {
            rate: 120,
            spread: 1.8,
            particleSpeed: 40,
            size: 1.5,
            life: 2.5,
            mode: "pingpong",
          },
          burst: {
            rate: 200,
            spread: 6.28,
            particleSpeed: 200,
            size: 5,
            life: 0.5,
            mode: "pingpong",
          },
          ribbon: {
            rate: 30,
            spread: 0.05,
            particleSpeed: 80,
            size: 3,
            life: 3.0,
            mode: "loop",
          },
        };

        function byId(id) {
          return document.getElementById(id);
        }

        function syncPanelToState() {
          var m = state.motionBrush;
          var el;
          if ((el = byId("motion-brush-enabled"))) el.checked = !!m.enabled;
          if ((el = byId("motion-brush-autobake"))) el.checked = !!m.autoBake;
          if ((el = byId("motion-color-source")))
            el.value = m.colorSource || "note";
          if ((el = byId("motion-brush-mode"))) el.value = m.mode || "pingpong";
          if ((el = byId("motion-brush-color"))) {
            el.value = m.color || "#ffffff";
            el.disabled = m.colorSource !== "custom";
          }
          if ((el = byId("motion-brush-rate"))) {
            el.value = m.rate;
            if (byId("motion-brush-rate-value"))
              byId("motion-brush-rate-value").textContent = m.rate;
          }
          if ((el = byId("motion-brush-spread"))) {
            el.value = m.spread;
            if (byId("motion-brush-spread-value"))
              byId("motion-brush-spread-value").textContent = Number(
                m.spread,
              ).toFixed(2);
          }
          if ((el = byId("motion-brush-speed"))) {
            el.value = m.particleSpeed;
            if (byId("motion-brush-speed-value"))
              byId("motion-brush-speed-value").textContent = m.particleSpeed;
          }
          if ((el = byId("motion-brush-size"))) {
            el.value = m.size;
            if (byId("motion-brush-size-value"))
              byId("motion-brush-size-value").textContent = m.size;
          }
          if ((el = byId("motion-brush-life"))) {
            el.value = m.life;
            if (byId("motion-brush-life-value"))
              byId("motion-brush-life-value").textContent = Number(
                m.life,
              ).toFixed(1);
          }
        }

        function wire(id, key, transform, outputId, outputFmt) {
          var el = byId(id);
          if (!el) return;
          el.addEventListener("input", function () {
            state.motionBrush[key] = transform
              ? transform(this.value)
              : this.value;
            if (outputId) {
              var out = byId(outputId);
              if (out)
                out.textContent = outputFmt
                  ? outputFmt(state.motionBrush[key])
                  : state.motionBrush[key];
            }
          });
        }

        var enEl = byId("motion-brush-enabled");
        if (enEl)
          enEl.addEventListener("change", function () {
            state.motionBrush.enabled = this.checked;
          });

        var bakeEl = byId("motion-brush-autobake");
        if (bakeEl)
          bakeEl.addEventListener("change", function () {
            state.motionBrush.autoBake = this.checked;
          });

        // Color source select — note / stroke / custom
        var colorSourceEl = byId("motion-color-source");
        if (colorSourceEl)
          colorSourceEl.addEventListener("change", function () {
            state.motionBrush.colorSource = this.value;
            var picker = byId("motion-brush-color");
            if (picker) picker.disabled = this.value !== "custom";
          });

        var colorEl = byId("motion-brush-color");
        if (colorEl) {
          colorEl.disabled = state.motionBrush.colorSource !== "custom";
          colorEl.addEventListener("input", function () {
            state.motionBrush.color = this.value;
            state.motionBrush.colorSource = "custom";
            var src = byId("motion-color-source");
            if (src) src.value = "custom";
          });
        }

        // Swatch clicks
        var swatchCont = byId("motion-brush-swatches");
        if (swatchCont) {
          swatchCont.addEventListener("click", function (e) {
            var btn = e.target.closest("[data-color]");
            if (!btn) return;
            state.motionBrush.color = btn.dataset.color;
            state.motionBrush.colorSource = "custom";
            var picker = byId("motion-brush-color");
            if (picker) {
              picker.value = btn.dataset.color;
              picker.disabled = false;
            }
            var src = byId("motion-color-source");
            if (src) src.value = "custom";
          });
        }

        var modeEl = byId("motion-brush-mode");
        if (modeEl)
          modeEl.addEventListener("change", function () {
            state.motionBrush.mode = this.value;
          });

        wire(
          "motion-brush-rate",
          "rate",
          Number,
          "motion-brush-rate-value",
          null,
        );
        wire(
          "motion-brush-spread",
          "spread",
          Number,
          "motion-brush-spread-value",
          function (v) {
            return v.toFixed(2);
          },
        );
        wire(
          "motion-brush-speed",
          "particleSpeed",
          Number,
          "motion-brush-speed-value",
          null,
        );
        wire(
          "motion-brush-size",
          "size",
          Number,
          "motion-brush-size-value",
          null,
        );
        wire(
          "motion-brush-life",
          "life",
          Number,
          "motion-brush-life-value",
          function (v) {
            return v.toFixed(1);
          },
        );

        // Preset buttons
        document
          .querySelectorAll("[data-motion-preset]")
          .forEach(function (btn) {
            btn.addEventListener("click", function () {
              var preset = PRESETS[this.dataset.motionPreset];
              if (!preset) return;
              Object.assign(state.motionBrush, preset);
              syncPanelToState();
            });
          });

        // Initial sync
        syncPanelToState();
      })();

      // ── Behavior Panel bindings (Phase 1 — wires to state.motion) ────────────
      (function bindBehaviorPanel() {
        // Behavior Panel → writes to selected stroke's stroke.motion.fx (FX system)

        function byId(id) {
          return document.getElementById(id);
        }

        // Get or initialize stroke motion + fx — never null after this
        function getSelectedFX() {
          var stroke = getSelectedStroke();
          if (!stroke) return null;
          if (!stroke.motion) stroke.motion = { mode: "pingpong" };
          return getFX(stroke); // creates stroke.motion.fx if missing
        }

        function getSelectedMotion() {
          var stroke = getSelectedStroke();
          if (!stroke) return null;
          if (!stroke.motion) stroke.motion = { mode: "pingpong" };
          return stroke.motion;
        }

        function syncToSelection() {
          var stroke = getSelectedStroke();
          if (!stroke) return;
          var m = getSelectedMotion();
          var fx = getSelectedFX();
          var el;
          // Mode
          if ((el = byId("bp-mode"))) el.value = m.mode || "pingpong";
          // FX color
          if ((el = byId("bp-fx-color-source")))
            el.value = fx.colorSource || "note";
          if ((el = byId("bp-fx-color"))) {
            el.value = fx.color || stroke.color || "#ffffff";
            el.disabled = false; // always enabled — clicking auto-switches to custom
            el.style.opacity = fx.colorSource === "custom" ? "1" : "0.5";
          }
          // Particle type
          if ((el = byId("bp-type"))) el.value = fx.type || "dot";
          // Advanced sliders
          if ((el = byId("bp-rate"))) {
            el.value = fx.rate;
            if (byId("bp-rate-value"))
              byId("bp-rate-value").textContent = fx.rate;
          }
          if ((el = byId("bp-spread"))) {
            el.value = fx.spread;
            if (byId("bp-spread-value"))
              byId("bp-spread-value").textContent = Number(fx.spread).toFixed(
                2,
              );
          }
          if ((el = byId("bp-speed"))) {
            el.value = fx.speed;
            if (byId("bp-speed-value"))
              byId("bp-speed-value").textContent = fx.speed;
          }
          if ((el = byId("bp-size"))) {
            el.value = fx.size;
            if (byId("bp-size-value"))
              byId("bp-size-value").textContent = fx.size;
          }
          if ((el = byId("bp-life"))) {
            el.value = fx.life;
            if (byId("bp-life-value"))
              byId("bp-life-value").textContent = Number(fx.life).toFixed(1);
          }
          // Active style indicator
          document.querySelectorAll("[data-bp-style]").forEach(function (btn) {
            btn.classList.toggle("active", btn.dataset.bpStyle === fx.style);
          });
        }

        // Mode (goes on stroke.motion directly)
        var modeEl = byId("bp-mode");
        if (modeEl)
          modeEl.addEventListener("change", function () {
            var m = getSelectedMotion();
            if (m) {
              m.mode = this.value;
              console.log(
                "[MODE DROPDOWN]",
                this.value,
                "stroke:",
                getSelectedStroke() && getSelectedStroke().id,
              );
              applyStrokeUpdates(getSelectedStroke());
            }
          });

        // FX color source
        var csEl = byId("bp-fx-color-source");
        if (csEl)
          csEl.addEventListener("change", function () {
            var fx = getSelectedFX();
            if (!fx) return;
            fx.colorSource = this.value;
            var picker = byId("bp-fx-color");
            if (picker)
              picker.style.opacity = this.value === "custom" ? "1" : "0.5";
          });

        // FX color picker
        var cpEl = byId("bp-fx-color");
        if (cpEl) {
          cpEl.addEventListener("input", function () {
            var fx = getSelectedFX();
            if (!fx) return;
            fx.color = this.value;
            fx.colorSource = "custom";
            var src = byId("bp-fx-color-source");
            if (src) src.value = "custom";
            cpEl.disabled = false;
          });
        }

        // Advanced slider helper — writes to fx
        function wireFXRange(id, key, outputId, fmt) {
          var el = byId(id);
          if (!el) return;
          el.addEventListener("input", function () {
            var fx = getSelectedFX();
            if (!fx) return;
            fx[key] = Number(this.value);
            var out = byId(outputId);
            if (out) out.textContent = fmt ? fmt(fx[key]) : fx[key];
          });
        }

        function wireFXSelect(id, key) {
          var el = byId(id);
          if (!el) return;
          el.addEventListener("change", function () {
            var fx = getSelectedFX();
            if (fx) fx[key] = this.value;
          });
        }

        wireFXSelect("bp-type", "type");
        wireFXRange("bp-rate", "rate", "bp-rate-value", null);
        wireFXRange("bp-spread", "spread", "bp-spread-value", function (v) {
          return v.toFixed(2);
        });
        wireFXRange("bp-speed", "speed", "bp-speed-value", null);
        wireFXRange("bp-size", "size", "bp-size-value", null);
        wireFXRange("bp-life", "life", "bp-life-value", function (v) {
          return v.toFixed(1);
        });

        // FX Style buttons — apply preset params to fx and mark active
        document.querySelectorAll("[data-bp-style]").forEach(function (btn) {
          btn.addEventListener("click", function () {
            var stroke = getSelectedStroke();
            if (!stroke) return;
            applyFXStyle(stroke, this.dataset.bpStyle);
            syncToSelection();
          });
        });

        // Expose for selection pipeline
        window._wos_syncBehaviorPanel = syncToSelection;

        syncToSelection();
      })();

      // ── Trail Debug Panel bindings ────────────────────────────────────────────
      (function bindDebugPanel() {
        function wire(id, key) {
          var el = document.getElementById(id);
          if (!el) return;
          el.checked = state.debug[key];
          el.addEventListener("change", function () {
            state.debug[key] = this.checked;
            renderFrame();
          });
        }
        wire("debug-walkers", "walkers");
        wire("debug-paths", "paths");
        wire("debug-info", "info");
      })();

      if (!window._wosKeyboardBound) {
        global.addEventListener("keydown", async function onKeyDown(event) {
          heldKeys.add(event.key.toLowerCase());
          if (event.key === "Shift") input.shift = true;

          if (textEditor && event.key === "Escape") {
            event.preventDefault();
            removeCanvasTextInput(false);
            return;
          }

          // ── Label editing mode — captures all keys ────────────────────────
          if (state.textEditing && state.activeLabelId) {
            var _editLabel = getLabelById(state.activeLabelId);
            if (_editLabel) {
              event.preventDefault();
              if (event.key === "Escape") {
                // Cancel — remove empty label, deselect
                if (!_editLabel.text) removeLabel(_editLabel.id);
                state.textEditing = false;
                state.activeLabelId = null;
              } else if (event.key === "Backspace") {
                _editLabel.text = _editLabel.text.slice(0, -1);
              } else if (event.key === "Enter") {
                if (event.shiftKey) {
                  // Shift+Enter — commit
                  if (!_editLabel.text) removeLabel(_editLabel.id);
                  state.textEditing = false;
                  state.activeLabelId = null;
                } else {
                  _editLabel.text += "\n";
                }
              } else if (event.key.length === 1) {
                _editLabel.text += event.key;
              }
              renderFrame();
              return; // block all other shortcuts while editing
            }
          }
          // ── End label editing ─────────────────────────────────────────────

          if (isTypingTarget()) {
            return;
          }

          // ── Shortcut suspension — takesFocus drawers (e.g. GlyphLab) ─────────
          if (window._wos && window._wos._shortcutsSuspended) {
            return;
          }

          console.log("[KEYDOWN TRACE]", {
            key: event.key,
            code: event.code,
            meta: event.metaKey,
            ctrl: event.ctrlKey,
            shift: event.shiftKey,
            activeElement:
              document.activeElement && document.activeElement.tagName
                ? document.activeElement.tagName.toLowerCase()
                : null,
          });

          if (event.key === "Delete" || event.key === "Backspace") {
            event.preventDefault();
            event.stopPropagation();
            console.log("[DELETE KEY] before", window._wos.debugSelection());
            var _delResult = deleteSelectedObject();
            console.log("[DELETE KEY] result", _delResult);
            console.log("[DELETE KEY] after", window._wos.debugSelection());
            return;
          }

          if (
            event.key &&
            event.key.toLowerCase() === "d" &&
            (event.metaKey || event.ctrlKey)
          ) {
            event.preventDefault();
            event.stopPropagation();
            console.log("[DUPLICATE KEY] before", window._wos.debugSelection());
            var _dupResult = await duplicateSelectedObject();
            console.log("[DUPLICATE KEY] result", _dupResult);
            console.log("[DUPLICATE KEY] after", window._wos.debugSelection());
            return;
          }

          if (event.key === " ") {
            // In geo/navigate mode spacebar is reserved for viewport pan — not transport
            if (
              SBE.Workspace &&
              SBE.Workspace.isGeographicMode &&
              SBE.Workspace.isGeographicMode() &&
              SBE.Workspace.getInteractionMode &&
              SBE.Workspace.getInteractionMode() === "navigate"
            ) return;
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
            // D key activates mop (primary drawing tool) — Cmd+D handled above
            state.tool = "pen";
            syncUI();
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
            state.tool = "pen";
            syncUI();
            return;
          }
          if (event.key.toLowerCase() === "p") {
            state.tool = "pen";
            syncUI();
            return;
          }
          // Ctrl/Cmd+Shift+G — ungroup
          if (
            event.key.toLowerCase() === "g" &&
            (event.metaKey || event.ctrlKey) &&
            event.shiftKey
          ) {
            event.preventDefault();
            ungroupSelected();
            return;
          }

          // Ctrl/Cmd+G — group selected strokes
          if (
            event.key.toLowerCase() === "g" &&
            (event.metaKey || event.ctrlKey)
          ) {
            event.preventDefault();
            var strokeEntries = state.multiSelection.filter(function (e) {
              return e.type === "stroke";
            });
            if (strokeEntries.length > 1) {
              var ids = strokeEntries.map(function (e) {
                return e.id;
              });
              var grp = createGroup(ids);
              if (grp) {
                state.multiSelection = [{ type: "group", id: grp.id }];
                syncLegacySelection();
                syncSelectionPanel();
                renderFrame();
              }
            }
            return;
          }
          // G — toggle grid
          if (
            event.key.toLowerCase() === "g" &&
            !(event.metaKey || event.ctrlKey)
          ) {
            state.grid.enabled = !state.grid.enabled;
            renderFrame();
            return;
          }
          // K — save selected stroke as shape
          if (
            event.key.toLowerCase() === "k" &&
            !(event.metaKey || event.ctrlKey)
          ) {
            saveSelectedShape();
            syncShapeLibraryTab(true);
            return;
          }

          // Pen tool keyboard controls (shape + line modes)
          if (state.tool === "pen" && state.penTool.isDrawing) {
            // Escape — cancel in-progress stroke
            if (event.key === "Escape") {
              state.penTool.currentStroke = null;
              state.penTool.isDrawing = false;
              state.penTool.previewPoint = null;
              renderFrame();
              return;
            }
            // Enter — commit (shape = open path, line = finalize)
            if (event.key === "Enter") {
              event.preventDefault();
              if (state.penTool.mode === "shape") commitShapeStroke(false);
              else if (
                state.penTool.mode === "line" &&
                state.penTool.currentStroke
              ) {
                var cs = state.penTool.currentStroke;
                if (state.penTool.previewPoint && cs.points.length > 0) {
                  commitLineStroke(cs.points[0], state.penTool.previewPoint);
                }
              }
              return;
            }
            // Backspace — remove last placed point (shape only)
            if (
              event.key === "Backspace" &&
              state.penTool.mode === "shape" &&
              state.penTool.currentStroke
            ) {
              event.preventDefault();
              var cs = state.penTool.currentStroke;
              if (cs.points.length > 1) {
                cs.points.pop();
              } else {
                state.penTool.currentStroke = null;
                state.penTool.isDrawing = false;
              }
              renderFrame();
              return;
            }
          }

          // L key — line tool disabled, mop is primary drawing system
          // if (event.key.toLowerCase() === "l") { ... }

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
          if (event.key === "Shift") input.shift = false;
        });
      } // end if (!window._wosKeyboardBound)
    }

    function selectAllObjects() {
      if (state.ui.presentation) return;

      state.multiSelection = [];

      // Mop strokes — primary selectable objects
      (state.strokes || []).forEach(function (s) {
        state.multiSelection.push({ type: "stroke", id: s.id });
      });

      (state.shapes || []).forEach(function (s) {
        state.multiSelection.push({ type: "shape", id: s.id });
      });

      (state.balls || []).forEach(function (b) {
        state.multiSelection.push({ type: "ball", id: b.id });
      });

      // Non-derived lines only (exclude stroke bridge lines)
      (state.lines || [])
        .filter(function (l) {
          return !l._isDerived;
        })
        .forEach(function (l) {
          state.multiSelection.push({ type: "line", id: l.id });
        });

      // Set stroke selection state for the inspector
      if (
        state.multiSelection.length === 1 &&
        state.multiSelection[0].type === "stroke"
      ) {
        state.selection.strokeId = state.multiSelection[0].id;
        state.selection.strokeIds.clear();
        state.selection.strokeIds.add(state.multiSelection[0].id);
      } else if (
        state.multiSelection.some(function (e) {
          return e.type === "stroke";
        })
      ) {
        state.selection.strokeId = null;
        state.selection.strokeIds.clear();
        state.multiSelection
          .filter(function (e) {
            return e.type === "stroke";
          })
          .forEach(function (e) {
            state.selection.strokeIds.add(e.id);
          });
      }

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
      // Restore projectile walkers (ProjectileWalkerMigration v1.0.0)
      state.projectileWalkers = Array.isArray(scene.projectileWalkers)
        ? scene.projectileWalkers
        : [];
      if (!state.balls.length && state.swarm.count > 0) {
        SBE.Swarm.syncSwarmCount(state, true);
        state.balls = state.balls.map(normalizeBall);
      }
      state.backgroundDataUrl = scene.background || null;
      // Emitters removed from scene format — now only exist as line behaviors
      state.backgroundImage = state.backgroundDataUrl
        ? await loadImage(state.backgroundDataUrl)
        : null;

      // ── Layer state restore (SubjectLayerStabilityFix v1.0.0) ───────────────
      if (Array.isArray(scene.layers) && scene.layers.length) {
        state.layers = scene.layers;
        state.activeLayerId = scene.activeLayerId || scene.layers[0].id;
      } else {
        // No layer data → keep current layers (scene was created before layer system)
        _ensureDefaultLayer();
      }
      // Purge stale image cache on scene load so images reload from restored subjectImage
      _subjectImageCache = {};

      // WOS stroke + group + walker layer restoration
      state.strokes = Array.isArray(scene.strokes) ? scene.strokes : [];
      state.groups =
        scene.groups &&
        typeof scene.groups === "object" &&
        !Array.isArray(scene.groups)
          ? scene.groups
          : {};
      state.walkers = Array.isArray(scene.walkers) ? scene.walkers : [];
      console.log("[load]", {
        strokes: state.strokes.length,
        groups: Object.keys(state.groups || {}).length,
        walkers: state.walkers.length,
        lines: (state.lines || []).length,
      });
      // Re-tag _groupId on strokes from restored groups
      Object.values(state.groups).forEach(function (group) {
        (group.strokeIds || []).forEach(function (sid) {
          var stroke = state.strokes.find(function (s) {
            return s.id === sid;
          });
          if (stroke) stroke._groupId = group.id;
        });
      });
      // SymbolObjects — hydrate from scene, or reset to empty list
      var SOS_apply = global.SBE && global.SBE.SymbolObjectSystem;
      state.symbolObjects =
        SOS_apply && Array.isArray(scene.symbolObjects)
          ? scene.symbolObjects.map(SOS_apply.hydrate).filter(Boolean)
          : [];
      state.selectedSymbolObjectIds = new Set();

      // Reset placement ghost — never carry ghost state across scene loads
      if (_symGhost) {
        _symGhost.visible = false;
        _symGhost.wx = 0;
        _symGhost.wy = 0;
      }
      if (state.tool === "symbol-place" || state.tool === "symbol-brush")
        state.tool = "select";

      renderer.resize(state.canvas.width, state.canvas.height);
      updateCanvasAspect();
      rebuildAudioBindings();
      rebuildDerivedState();
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

    function applyViewportMode() {
      var isLandscape = state.viewportMode === "landscape";
      var w = isLandscape ? 1920 : 1080;
      var h = isLandscape ? 1080 : 1920;

      // 1. Real engine canvas resize
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }

      // 2. state.canvas tracks dimensions for coordinate math
      state.canvas.width = w;
      state.canvas.height = h;

      // 3. Surface (ink) canvas must match
      if (typeof surfaceCanvas !== "undefined" && surfaceCanvas) {
        surfaceCanvas.width = w;
        surfaceCanvas.height = h;
      }

      // 4. Renderer resize (recalculates projection)
      if (typeof renderer !== "undefined" && renderer && renderer.resize) {
        renderer.resize(w, h);
      }

      // 5. Wrapper class drives CSS framing
      var wrap = document.querySelector(".canvas-wrap");
      if (wrap) {
        wrap.classList.remove("viewport-portrait", "viewport-landscape");
        wrap.classList.add(
          isLandscape ? "viewport-landscape" : "viewport-portrait",
        );
      }

      // 6. Sync UI select
      var sel = document.getElementById("viewport-mode");
      if (sel) sel.value = state.viewportMode;

      // 7. Re-render at new resolution
      if (typeof renderFrame === "function") renderFrame();

      console.log(
        "[FRAME] Format:",
        isLandscape ? "16:9" : "9:16",
        w + "×" + h,
      );
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
        console.log(
          "[LOAD SAMPLE]",
          noteClass,
          decoded,
          "total in bank:",
          sampleMap[noteClass].length,
        );
        return true;
      } catch (err) {
        console.error("[LOAD FAIL]", file.name, err);
        return false;
      }
    }

    // ── Object Sampler — per-stroke sample assignment ─────────────────────────
    async function loadSampleToStroke(file, strokeId) {
      var stroke = state.strokes.find(function (s) {
        return s.id === strokeId;
      });
      if (!stroke) {
        console.warn("[sampler] Stroke not found:", strokeId);
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
        if (!stroke.samples) stroke.samples = [];
        if (stroke.samples.length >= 4) stroke.samples.shift(); // keep latest 4
        stroke.samples.push(decoded);
        console.log(
          "[sampler] Assigned sample → stroke",
          strokeId,
          "(" + stroke.samples.length + " sample(s) loaded)",
        );
        return true;
      } catch (err) {
        console.warn("[sampler] Failed to decode:", file.name, err);
        return false;
      }
    }

    // ── Shape Library UI ─────────────────────────────────

    function makeShapePreviewSVG(points, size) {
      if (!points || points.length < 2) return "";
      var sz = size || 48;
      var pad = 4;
      var xs = points.map(function (p) {
        return p.x;
      });
      var ys = points.map(function (p) {
        return p.y;
      });
      var minX = Math.min.apply(null, xs);
      var minY = Math.min.apply(null, ys);
      var maxX = Math.max.apply(null, xs);
      var maxY = Math.max.apply(null, ys);
      var w = maxX - minX || 1;
      var h = maxY - minY || 1;
      var scale = Math.min((sz - pad * 2) / w, (sz - pad * 2) / h);
      var ox = pad + (sz - pad * 2 - w * scale) / 2;
      var oy = pad + (sz - pad * 2 - h * scale) / 2;
      var d = points
        .map(function (p, i) {
          var tx = (p.x - minX) * scale + ox;
          var ty = (p.y - minY) * scale + oy;
          return (i === 0 ? "M" : "L") + tx.toFixed(1) + " " + ty.toFixed(1);
        })
        .join(" ");
      return (
        '<svg width="' +
        sz +
        '" height="' +
        sz +
        '" viewBox="0 0 ' +
        sz +
        " " +
        sz +
        '" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="' +
        d +
        '" stroke="rgba(255,255,255,0.7)" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
        "</svg>"
      );
    }

    function syncShapeLibraryTab(force) {
      var container = document.getElementById("shape-lib-list");
      var emptyMsg = document.getElementById("shape-lib-empty");
      if (!container) return;

      // Skip when tab is not visible, unless explicitly forced
      var tabContent = container.closest("[data-tab-content]");
      if (!force && tabContent && !tabContent.classList.contains("active"))
        return;

      var shapes = loadShapes();

      if (emptyMsg) emptyMsg.style.display = shapes.length ? "none" : "block";

      if (!shapes.length) {
        container.innerHTML = "";
        return;
      }

      container.innerHTML = shapes
        .map(function (shape, idx) {
          var preview = makeShapePreviewSVG(shape.points, 48);
          var pts = shape.points ? shape.points.length : 0;
          return (
            '<div class="shape-card" data-shape-id="' +
            shape.id +
            '">' +
            '<div class="shape-card__preview">' +
            preview +
            "</div>" +
            '<div class="shape-card__info">' +
            '<div class="shape-card__name">' +
            (shape.name || "shape") +
            "</div>" +
            '<div class="shape-card__meta">' +
            pts +
            " pts</div>" +
            "</div>" +
            '<div class="shape-card__actions">' +
            '<button class="shape-card__btn" data-action="place" data-idx="' +
            idx +
            '">Place</button>' +
            '<button class="shape-card__btn shape-card__btn--delete" data-action="delete" data-idx="' +
            idx +
            '">✕</button>' +
            "</div>" +
            "</div>"
          );
        })
        .join("");

      // Bind place and delete
      container.querySelectorAll("[data-action]").forEach(function (btn) {
        btn.addEventListener("click", function (e) {
          e.stopPropagation();
          var idx = Number(btn.dataset.idx);
          var shapes = loadShapes();
          if (btn.dataset.action === "place") {
            var shape = shapes[idx];
            if (shape) {
              var cx = state.canvas.width / 2 - 100 + Math.random() * 200;
              var cy = state.canvas.height / 2 - 100 + Math.random() * 200;
              createShapeInstance(shape, { x: cx, y: cy });
              showToast("Placed: " + shape.name);
            }
          } else if (btn.dataset.action === "delete") {
            shapes.splice(idx, 1);
            try {
              localStorage.setItem("wos_shapes", JSON.stringify(shapes));
            } catch (e) {}
            syncShapeLibraryTab();
          }
        });
      });
    }

    // ── Bank System v2 ────────────────────────────────────────────────────
    // Color → MIDI note (pitch layer is visual, independent of banks)
    function colorToMidi(color) {
      if (!color) return 60;
      // Hash hex color to 0-127 range
      var hex = color.replace("#", "");
      var r = parseInt(hex.substr(0, 2), 16) || 0;
      var g = parseInt(hex.substr(2, 2), 16) || 0;
      var b = parseInt(hex.substr(4, 2), 16) || 0;
      return Math.round(((r * 0.299 + g * 0.587 + b * 0.114) / 255) * 127);
    }

    function getActiveBank() {
      return (
        state.banks.find(function (b) {
          return b.id === state.activeBankId;
        }) || state.banks[0]
      );
    }

    function getBankIndex(bankId) {
      return state.banks.findIndex(function (b) {
        return b.id === bankId;
      });
    }

    function resolveSampleFromBank(stroke) {
      if (!stroke || !stroke.bankId) return null;
      var bank = state.banks.find(function (b) {
        return b.id === stroke.bankId;
      });
      if (!bank || !bank.samples.length) return null;
      return bank.samples[0]; // simple: first sample (round-robin can extend later)
    }

    function playBuffer(audioBuffer, gainValue) {
      var ctx = AudioEngine.init();
      if (!ctx) return;
      if (ctx.state !== "running") {
        ctx.resume().catch(function () {});
        return;
      }
      try {
        var source = ctx.createBufferSource();
        var gain = ctx.createGain();
        source.buffer = audioBuffer;
        gain.gain.setValueAtTime(
          Math.max(0.001, gainValue || 0.8),
          ctx.currentTime,
        );
        source.connect(gain);
        gain.connect(AudioEngine.output());
        source.start();
      } catch (e) {
        console.warn("[PLAY BUFFER]", e);
      }
    }

    function renderBankGrid() {
      var container = document.getElementById("bank-grid");
      if (!container) return;
      container.innerHTML = "";
      var selStroke =
        typeof getSelectedStroke === "function" ? getSelectedStroke() : null;
      state.banks.forEach(function (bank) {
        var isActive = bank.id === state.activeBankId;
        var isStrokeBank = selStroke && selStroke.bankId === bank.id;
        var btn = document.createElement("button");
        btn.className =
          "bank-slot" +
          (isActive ? " bank-slot--active" : "") +
          (bank.samples.length > 0 ? " bank-slot--filled" : "") +
          (isStrokeBank ? " bank-slot--stroke" : "");
        btn.title = bank.label || "Bank " + (getBankIndex(bank.id) + 1);
        btn.innerHTML =
          '<span class="bank-slot__num">' +
          (getBankIndex(bank.id) + 1) +
          "</span>" +
          (bank.samples.length
            ? '<span class="bank-slot__count">' +
              bank.samples.length +
              "</span>"
            : "");
        if (bank.color) btn.style.borderColor = bank.color;
        btn.addEventListener("click", function () {
          state.activeBankId = bank.id;
          // Reassign currently selected stroke to this bank
          var sel =
            typeof getSelectedStroke === "function"
              ? getSelectedStroke()
              : null;
          if (sel) {
            sel.bankId = bank.id;
            console.log("[BANK] Reassigned stroke", sel.id, "→", bank.id);
          }
          renderBankGrid();
          console.log(
            "[BANK] Active:",
            bank.id,
            "samples:",
            bank.samples.length,
          );
        });
        container.appendChild(btn);
      });
    }

    async function loadSampleToActiveBank(file) {
      var bank = getActiveBank();
      var context = ensureAudioContext();
      if (!context) return false;
      if (context.state !== "running")
        await context.resume().catch(function () {});
      try {
        var arrayBuffer = await file.arrayBuffer();
        var decoded = await context.decodeAudioData(arrayBuffer);
        bank.samples.push(decoded);
        // Also push to sampleMap for backwards compat with existing audio pipeline
        // Map to noteClass based on bank index
        var nc = getBankIndex(bank.id) % 12;
        if (!sampleMap[nc]) sampleMap[nc] = [];
        sampleMap[nc].push(decoded);
        renderBankGrid();
        console.log(
          "[BANK] Loaded to",
          bank.id,
          "— total:",
          bank.samples.length,
        );
        return true;
      } catch (e) {
        console.warn("[BANK] Load failed:", e);
        return false;
      }
    }
    // ── End Bank System v2 ────────────────────────────────────────────────

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
      if (controls.syncGridUI) controls.syncGridUI(state);
      syncSamplerTab();
      syncShapeLibraryTab();
      if (controls.elements.togglePlayback) {
        controls.elements.togglePlayback.innerHTML = isPlaying
          ? "&#9646;&#9646;"
          : "&#9654;";
      }
    }

    function updatePanels() {
      // Panel visibility is now handled by the fixed layout — no-op
      renderCanvasToolSubBar();
    }

    // ── Inspector binding utilities ────────────────────────────────────────
    // setDeep: write a dot-path value into an object (e.g. "visual.fill")
    function setDeep(obj, path, value) {
      if (!obj) return;
      var keys = path.split(".");
      var target = obj;
      while (keys.length > 1) {
        var k = keys.shift();
        if (target[k] == null) target[k] = {};
        target = target[k];
      }
      target[keys[0]] = value;
    }

    // getDeep: read a dot-path value from an object
    function getDeep(obj, path) {
      if (!obj) return undefined;
      var keys = path.split(".");
      var cur = obj;
      for (var i = 0; i < keys.length; i++) {
        if (cur == null) return undefined;
        cur = cur[keys[i]];
      }
      return cur;
    }

    // getSelectedObjectsNorm: normalized list of selected objects (strokes + balls + text + shapes)
    function getSelectedObjectsNorm() {
      var results = [];
      // Strokes (primary WOS objects)
      if (state.selection.strokeIds && state.selection.strokeIds.size > 0) {
        state.selection.strokeIds.forEach(function (id) {
          var s = getStrokeById(id);
          if (s) results.push(s);
        });
      } else if (state.selection.strokeId) {
        var s = getStrokeById(state.selection.strokeId);
        if (s) results.push(s);
      }
      // Legacy objects via multiSelection
      if (!results.length) {
        state.multiSelection.forEach(function (entry) {
          var obj = resolveSelectionEntry(entry);
          if (obj) results.push(obj);
        });
      }
      return results;
    }

    // updateSelected: write a dot-path value to all selected objects
    function updateSelected(path, value) {
      var objects = getSelectedObjectsNorm();
      if (!objects.length) return;

      objects.forEach(function (obj) {
        setDeep(obj, path, value);

        // Lightweight legacy field sync — keeps flat properties in sync with visual.*
        if (path === "visual.fill" || path === "color") {
          obj.color = value;
          // Sync bridge lines
          if (obj.id) {
            state.lines.forEach(function (l) {
              if (l._strokeId === obj.id && l._isDerived) {
                l.color = value;
                if (l.style) l.style.color = value;
              }
            });
          }
        }
        if (path === "visual.strokeWidth" || path === "width") {
          obj.width = value;
          obj.baseWidth = value;
          if (obj.id) {
            state.lines.forEach(function (l) {
              if (l._strokeId === obj.id && l._isDerived) {
                l.thickness = value;
                if (l.style) l.style.thickness = value;
              }
            });
          }
        }
        if (path === "visual.visible") {
          obj.renderMode = value ? "visible" : "hidden";
          obj.outlineVisible = !!value;
        }
        if (path === "music.midi.note" || path === "music.midiNote") {
          // Keep legacy note field in sync
          if (typeof value === "number") obj.note = value;
        }
      });

      renderFrame();
      renderInspector(); // keep UI in sync after every update

      // Preview note when MIDI note is changed
      if (
        (path === "music.midi.note" || path === "music.midiNote") &&
        typeof value === "number"
      ) {
        try {
          if (window._wos && _wos.preview && _wos.preview.play) {
            _wos.preview.play({ note: value, velocity: 100, channel: 1 });
          }
        } catch (e) {
          console.warn("[PREVIEW]", e);
        }
      }
    }

    // renderInspector: sync DOM controls to the primary selected object
    function renderInspector() {
      var objects = getSelectedObjectsNorm();
      var el = controls && controls.elements;
      if (!el) return;

      if (!objects.length) {
        if (el.lineColor)
          el.lineColor.value = state.defaults.color || "#ff4d4d";
        if (el.strokeWidth)
          el.strokeWidth.value = String(state.defaults.strokeWidth || 18);
        return;
      }

      var obj = objects[0];
      var isMixed = objects.length > 1;

      var fill = (obj.visual && obj.visual.fill) || obj.color || "#ff4d4d";
      var width =
        (obj.visual && obj.visual.strokeWidth) ||
        obj.baseWidth ||
        obj.width ||
        18;

      if (el.lineColor) el.lineColor.value = fill;
      if (el.strokeWidth) el.strokeWidth.value = String(Math.round(width));

      // MIDI note
      var midiNoteEl = document.getElementById("midi-note");
      if (midiNoteEl) {
        var mn =
          (obj.sound && obj.sound.midi && obj.sound.midi.note) ||
          obj.note ||
          60;
        midiNoteEl.value = isMixed ? "" : String(mn);
      }
      // Sound section (old IDs)
      var srcEl = document.getElementById("insp-sound-source");
      var roleEl = document.getElementById("insp-sound-role");
      var trigEl = document.getElementById("insp-sound-trigger");
      if (obj.sound) {
        if (srcEl) srcEl.value = obj.sound.source || "synth";
        if (roleEl) roleEl.value = obj.sound.role || "drum";
        if (trigEl) trigEl.value = obj.sound.trigger || "continuous";
      }

      // New obj-* inspector fields
      (function syncNewInspector() {
        function setEl(id, value) {
          var el = document.getElementById(id);
          if (!el) return;
          if (el.type === "checkbox") el.checked = !!value;
          else el.value = value != null ? value : "";
        }
        setEl("obj-fill", obj.color || "#ff4b4b");
        setEl("obj-strokeWidth", Math.round(obj.baseWidth || obj.width || 18));
        setEl("obj-visible", obj.renderMode !== "hidden");

        // ── PATH layer sync ────────────────────────────────────────────────
        var _ps = obj.pathStyle || "solid";
        setEl("obj-pathStyle", _ps);
        var _dashF = document.getElementById("path-dash-fields");
        if (_dashF)
          _dashF.style.display =
            _ps === "dotted" || _ps === "dashed" ? "" : "none";
        setEl("obj-path-dash", obj.pathDash != null ? obj.pathDash : 12);
        setEl("obj-path-gap", obj.pathGap != null ? obj.pathGap : 8);
        var _pd = document.getElementById("obj-path-dash-value");
        if (_pd) _pd.value = obj.pathDash != null ? obj.pathDash : 12;
        var _pg = document.getElementById("obj-path-gap-value");
        if (_pg) _pg.value = obj.pathGap != null ? obj.pathGap : 8;

        // ── SUBJECT layer sync ─────────────────────────────────────────────
        var _subSt = obj.subjectStyle != null ? obj.subjectStyle : "none";
        setEl("obj-subject-style", _subSt);
        setEl(
          "obj-subject-scale",
          obj.subjectScale != null ? obj.subjectScale : 1.0,
        );
        setEl(
          "obj-subject-opacity",
          obj.subjectOpacity != null ? obj.subjectOpacity : 1.0,
        );
        setEl("obj-subject-visible", obj.subjectVisible !== false);
        var _ssv = document.getElementById("obj-subject-scale-value");
        if (_ssv) _ssv.value = (obj.subjectScale || 1.0).toFixed(1);
        var _sov = document.getElementById("obj-subject-opacity-value");
        if (_sov) _sov.value = (obj.subjectOpacity || 1.0).toFixed(2);
        // Show/hide sub-rows based on style
        var _sg = document.getElementById("sub-row-glyph");
        if (_sg) _sg.style.display = _subSt === "glyph" ? "" : "none";
        var _si = document.getElementById("sub-row-image");
        if (_si) _si.style.display = _subSt === "image" ? "" : "none";
        var _st = document.getElementById("sub-row-text");
        if (_st) _st.style.display = _subSt === "text" ? "" : "none";
        if (obj.subjectGlyph) {
          setEl("obj-subject-glyph", obj.subjectGlyph);
        }
        if (obj.subjectText) {
          setEl("obj-subject-text", obj.subjectText);
        }
        setEl("obj-subject-color", obj.subjectColor || "");

        var walker = state.walkers.find(function (w) {
          return w.strokeId === obj.id;
        });
        setEl("obj-walker", !!walker);
        setEl(
          "obj-motionMode",
          walker ? walker.motionMode || "pingpong" : "pingpong",
        );
        // Speed: reverse map from walker.speed to 0–1 inspector range
        if (walker) {
          var _inspSpeed = Math.min(1, (walker.speed || 0) / 0.25);
          setEl("obj-speed", _inspSpeed.toFixed(2));
          var _so = document.getElementById("obj-speed-value");
          if (_so) _so.value = _inspSpeed.toFixed(2);
        }
        setEl(
          "obj-trailStyle",
          !!(
            obj.trailEnabled ||
            (walker && walker.emitter && walker.emitter.enabled)
          ),
        );
        // ── TRAIL detail sync ──────────────────────────────────────────────
        var _trailEnabled = !!(
          obj.trailEnabled ||
          (walker && walker.emitter && walker.emitter.enabled)
        );
        var _trailDetail = document.getElementById("trail-detail-fields");
        if (_trailDetail)
          _trailDetail.style.display = _trailEnabled ? "" : "none";
        if (obj.trail) {
          setEl("obj-trail-style", obj.trail.style || "line");
          setEl(
            "obj-trail-length",
            obj.trail.length != null ? obj.trail.length : 1.0,
          );
          setEl(
            "obj-trail-opacity",
            obj.trail.opacity != null ? obj.trail.opacity : 0.6,
          );
          var _tlv = document.getElementById("obj-trail-length-value");
          if (_tlv) _tlv.value = (obj.trail.length || 1.0).toFixed(1);
          var _tov = document.getElementById("obj-trail-opacity-value");
          if (_tov) _tov.value = (obj.trail.opacity || 0.6).toFixed(2);
        }
        if (obj.sound) {
          setEl("obj-soundSource", obj.sound.source || "off");
          setEl("obj-soundRole", obj.sound.role || "drum");
          setEl("obj-soundTrigger", obj.sound.trigger || "impact");
        }
        setEl("obj-bankId", obj.bankId || "");
        setEl(
          "obj-noteClass",
          obj.noteClass != null ? String(obj.noteClass) : "0",
        );
        setEl("obj-octave", obj.octave != null ? obj.octave : 4);
        var swOut = document.getElementById("obj-strokeWidth-out");
        if (swOut) swOut.value = Math.round(obj.baseWidth || obj.width || 18);

        // ── Physics & Collision state → UI sync ───────────────────────────
        var _physWalker = walker;
        var _physAv =
          _physWalker && _physWalker.avatar ? _physWalker.avatar : null;
        var _collEnabled =
          _physAv && _physAv.collider ? !!_physAv.collider.enabled : false;
        setEl("obj-collider-enabled", _collEnabled);
        var bodyFields = document.getElementById("physics-body-fields");
        if (bodyFields) bodyFields.style.display = _collEnabled ? "" : "none";
        if (_physWalker && _physWalker.physics) {
          setEl(
            "obj-phys-bounce",
            _physWalker.physics.bounce != null
              ? _physWalker.physics.bounce
              : 0.92,
          );
          setEl(
            "obj-phys-gravity",
            _physWalker.physics.gravityScale != null
              ? _physWalker.physics.gravityScale
              : 1.0,
          );
        }

        // ── Avatar state → UI sync ─────────────────────────────────────────
        if (walker && walker.avatar) {
          var av = walker.avatar;
          setEl("av-enabled", av.enabled);
          setEl("av-mode", av.style || "none");
          setEl("av-scale", av.scale != null ? av.scale : 1.0);
          setEl("av-opacity", av.opacity != null ? av.opacity : 1.0);
          setEl("av-rotation", av.rotationMode || "motion");
          if (av.tint) setEl("av-tint", av.tint);
          var _sc = document.getElementById("av-scale-value");
          if (_sc) _sc.value = (av.scale || 1.0).toFixed(2);
          var _op = document.getElementById("av-opacity-value");
          if (_op)
            _op.value = (av.opacity != null ? av.opacity : 1.0).toFixed(2);
        }
        if (walker && walker.avatar && walker.avatar.glyphId) {
          var _gsel = document.getElementById("av-glyph");
          if (_gsel) _gsel.value = walker.avatar.glyphId;
        }
      })();
    }
    // ── End inspector binding utilities ───────────────────────────────────

    // ── Layer System (SubjectAndLayerSystem v1.0.0) ──────────────────────────
    function _ensureDefaultLayer() {
      if (!state.layers || !state.layers.length) {
        state.layers = [
          {
            id: "layer-1",
            name: "Layer 1",
            visible: true,
            locked: false,
            opacity: 1.0,
            blendMode: "normal",
          },
        ];
      }
      if (!state.activeLayerId) state.activeLayerId = state.layers[0].id;
    }
    function isActiveLayerLocked() {
      var al = getActiveLayer();
      return !!(al && al.locked);
    }
    function isLayerLockedById(id) {
      if (!id || !state.layers) return false;
      var l = state.layers.find(function (l) {
        return l.id === id;
      });
      return !!(l && l.locked);
    }
    function createLayer(name) {
      _ensureDefaultLayer();
      var id = "layer-" + Date.now();
      var layer = {
        id: id,
        name: name || "Layer " + (state.layers.length + 1),
        visible: true,
        locked: false,
        opacity: 1.0,
        blendMode: "normal",
      };
      state.layers.unshift(layer); // new layers go on top
      state.activeLayerId = id;
      renderLayerPanel();
      return layer;
    }
    function setActiveLayer(id) {
      state.activeLayerId = id;
      renderLayerPanel();
    }
    function getActiveLayer() {
      _ensureDefaultLayer();
      return (
        state.layers.find(function (l) {
          return l.id === state.activeLayerId;
        }) || state.layers[0]
      );
    }
    function renderLayerPanel() {
      var list = document.getElementById("layer-list");
      if (!list) return;
      _ensureDefaultLayer();
      list.innerHTML = "";
      state.layers.forEach(function (layer, layerIndex) {
        var row = document.createElement("div");
        row.className =
          "layer-row" +
          (layer.id === state.activeLayerId ? " active" : "") +
          (layer.locked ? " locked" : "");
        row.dataset.layerId = layer.id;

        // ── Reorder buttons ▲▼ ───────────────────────────────────────────────
        var reorderCol = document.createElement("div");
        reorderCol.className = "layer-reorder";
        var upBtn = document.createElement("button");
        upBtn.className = "layer-icon-btn layer-reorder-btn";
        upBtn.title = "Move layer up";
        upBtn.textContent = "▲";
        upBtn.disabled = layerIndex === 0;
        upBtn.onclick = function (e) {
          e.stopPropagation();
          if (layerIndex === 0) return;
          var tmp = state.layers[layerIndex - 1];
          state.layers[layerIndex - 1] = state.layers[layerIndex];
          state.layers[layerIndex] = tmp;
          renderLayerPanel();
          renderFrame();
        };
        var downBtn = document.createElement("button");
        downBtn.className = "layer-icon-btn layer-reorder-btn";
        downBtn.title = "Move layer down";
        downBtn.textContent = "▼";
        downBtn.disabled = layerIndex === state.layers.length - 1;
        downBtn.onclick = function (e) {
          e.stopPropagation();
          if (layerIndex === state.layers.length - 1) return;
          var tmp = state.layers[layerIndex + 1];
          state.layers[layerIndex + 1] = state.layers[layerIndex];
          state.layers[layerIndex] = tmp;
          renderLayerPanel();
          renderFrame();
        };
        reorderCol.appendChild(upBtn);
        reorderCol.appendChild(downBtn);

        // ── Visibility button ────────────────────────────────────────────────
        var visBtn = document.createElement("button");
        visBtn.className = "layer-icon-btn" + (layer.visible ? " on" : "");
        visBtn.title = layer.visible ? "Hide layer" : "Show layer";
        visBtn.textContent = layer.visible ? "◉" : "○";
        visBtn.onclick = function (e) {
          e.stopPropagation();
          layer.visible = !layer.visible;
          renderLayerPanel();
          renderFrame();
        };

        // ── Lock button ──────────────────────────────────────────────────────
        var lockBtn = document.createElement("button");
        lockBtn.className = "layer-icon-btn" + (layer.locked ? " on" : "");
        lockBtn.title = layer.locked ? "Unlock layer" : "Lock layer";
        lockBtn.textContent = layer.locked ? "🔒" : "🔓";
        lockBtn.style.fontSize = "9px";
        lockBtn.onclick = function (e) {
          e.stopPropagation();
          layer.locked = !layer.locked;
          renderLayerPanel();
        };

        // ── Name — single click selects; double-click enters rename mode ─────
        var nameEl = document.createElement("input");
        nameEl.className = "layer-name";
        nameEl.type = "text";
        nameEl.value = layer.name;
        nameEl.readOnly = true; // read-only until double-click
        nameEl.title = "Double-click to rename";
        nameEl.onclick = function (e) {
          e.stopPropagation();
          setActiveLayer(layer.id);
        };
        nameEl.ondblclick = function (e) {
          e.stopPropagation();
          e.preventDefault();
          state.layersEditingId = layer.id;
          nameEl.readOnly = false;
          nameEl.focus();
          nameEl.select();
        };
        // While editing: capture all pointer/keyboard events so canvas never sees them
        nameEl.addEventListener("mousedown", function (e) {
          if (!nameEl.readOnly) e.stopPropagation();
        });
        nameEl.addEventListener("pointerdown", function (e) {
          if (!nameEl.readOnly) e.stopPropagation();
        });
        var _commitLayerRename = function () {
          layer.name = nameEl.value.trim() || layer.name;
          nameEl.readOnly = true;
          state.layersEditingId = null;
        };
        nameEl.onblur = _commitLayerRename;
        nameEl.onkeydown = function (e) {
          if (e.key === "Enter") {
            _commitLayerRename();
            nameEl.blur();
          }
          if (e.key === "Escape") {
            nameEl.value = layer.name;
            nameEl.readOnly = true;
            state.layersEditingId = null;
            nameEl.blur();
          }
          e.stopPropagation(); // prevent canvas shortcuts while editing
          if (!nameEl.readOnly) e.preventDefault(); // prevent accidental space/delete/etc
        };

        // ── Opacity label ────────────────────────────────────────────────────
        var opLabel = document.createElement("span");
        opLabel.className = "layer-opacity-label";
        opLabel.textContent = Math.round(layer.opacity * 100) + "%";

        row.appendChild(reorderCol);
        row.appendChild(visBtn);
        row.appendChild(lockBtn);
        row.appendChild(nameEl);
        row.appendChild(opLabel);
        row.addEventListener("click", function (e) {
          // Don't re-select when editing name — let the input handle its own interactions
          if (state.layersEditingId === layer.id) return;
          setActiveLayer(layer.id);
        });
        list.appendChild(row);
      });
      // Show active layer detail
      var detail = document.getElementById("layer-detail");
      var activeLayer = getActiveLayer();
      if (detail && activeLayer) {
        detail.style.display = "";
        var opSlider = document.getElementById("layer-opacity");
        var opOut = document.getElementById("layer-opacity-value");
        var blendSel = document.getElementById("layer-blend-mode");
        if (opSlider) opSlider.value = activeLayer.opacity;
        if (opOut) opOut.value = Math.round(activeLayer.opacity * 100) + "%";
        if (blendSel) blendSel.value = activeLayer.blendMode || "normal";
      }
    }
    // Wire layer panel controls (run once after DOM ready)
    (function initLayerControls() {
      var addBtn = document.getElementById("layer-add");
      var imgBtn = document.getElementById("layer-import-image");
      var imgInput = document.getElementById("layer-image-file");
      var opSlider = document.getElementById("layer-opacity");
      var blendSel = document.getElementById("layer-blend-mode");
      if (addBtn)
        addBtn.onclick = function () {
          createLayer();
        };
      if (imgBtn && imgInput) {
        imgBtn.onclick = function () {
          imgInput.click();
        };
        imgInput.onchange = function () {
          var file = imgInput.files && imgInput.files[0];
          if (!file) return;
          var reader = new FileReader();
          reader.onload = function (e) {
            // Create a minimal stroke carrying the image as a subject
            // Two-point path so strokeToLines/walkers can attach
            var _cx = state.canvas.width / 2;
            var _cy = state.canvas.height / 2;
            var imgStroke = createStrokeObject(_cx - 1, _cy);
            imgStroke.pathStyle = "none";
            imgStroke.subjectStyle = "image";
            imgStroke.subjectImage = e.target.result;
            imgStroke.subjectScale = 1.0;
            imgStroke.layerId = state.activeLayerId;
            // Minimal two-point invisible path at canvas center
            imgStroke.points = [
              { x: _cx - 1, y: _cy },
              { x: _cx + 1, y: _cy },
            ];
            // Pre-seed image cache so first render shows immediately
            var _preImg = new Image();
            _preImg.onload = function () {
              renderFrame();
            };
            _preImg.src = e.target.result;
            _subjectImageCache[imgStroke.id] = _preImg;
            pushHistory();
            state.strokes.push(imgStroke);
            strokeToLines(imgStroke);
            renderFrame();
          };
          reader.readAsDataURL(file);
          imgInput.value = "";
        };
      }
      if (opSlider)
        opSlider.oninput = function () {
          var layer = getActiveLayer();
          if (!layer) return;
          layer.opacity = Number(opSlider.value);
          var o = document.getElementById("layer-opacity-value");
          if (o) o.value = Math.round(layer.opacity * 100) + "%";
          // Update the opacity label in the layer row directly (no full re-render needed)
          var _activeRow =
            list &&
            list.querySelector(".layer-row.active .layer-opacity-label");
          if (_activeRow)
            _activeRow.textContent = Math.round(layer.opacity * 100) + "%";
          renderFrame();
        };
      if (blendSel)
        blendSel.onchange = function () {
          var layer = getActiveLayer();
          if (layer) {
            layer.blendMode = blendSel.value;
            renderFrame();
          }
        };
      // Initial render
      _ensureDefaultLayer();
      renderLayerPanel();
    })();

    // ── Object Inspector contextual visibility ─────────────────────────────────
    // ── Centralized workspace resize sync ─────────────────────────────────────
    // Drives all viewport-sensitive subsystems after any layout change:
    //   • browser window resize
    //   • inspector collapse / expand
    //   • drawer open / close
    //   • initial app boot
    //
    // Implementation:
    //   _scheduleViewportSync() queues one rAF-debounced call. Multiple triggers
    //   within the same frame collapse to a single sync. _doViewportSync() runs
    //   the actual resize work in the next animation frame, after the CSS grid
    //   has fully reflowed (rAF fires after style/layout).
    //
    // What gets synced:
    //   1. Mapbox map — map.resize() recalculates its GL canvas vs container
    //   2. Maritime overlay canvas — _resizeIfNeeded() already runs every frame;
    //      no explicit call needed (it reads .canvas-area clientWidth/Height)
    //   3. SurfaceDrawingRuntime — syncCanvasSize() if available
    //   4. Main canvas + renderer — only in geo mode (reads .canvas-area bounds);
    //      applyViewportMode() handles non-geo fixed-size canvases, not touched here

    var _viewportSyncPending = false;

    function _doViewportSync() {
      _viewportSyncPending = false;
      // 1. Mapbox map resize — must be called after container layout settles
      var mvr = window.SBE && SBE.MapboxViewportRuntime;
      if (mvr && typeof mvr.resize === 'function') {
        mvr.resize();
      }
      // 2. SurfaceDrawingRuntime overlay canvas
      if (window.SBE && SBE.SurfaceDrawingRuntime &&
          typeof SBE.SurfaceDrawingRuntime.syncCanvasSize === 'function') {
        SBE.SurfaceDrawingRuntime.syncCanvasSize();
      }
      // 3. Maritime canvas — self-healing via _resizeIfNeeded() in its RAF loop;
      //    no action needed here.
    }

    function _scheduleViewportSync() {
      if (_viewportSyncPending) return;
      _viewportSyncPending = true;
      requestAnimationFrame(_doViewportSync);
    }

    // Wire window resize
    window.addEventListener('resize', _scheduleViewportSync, { passive: true });

    // Wire DrawerSystem open/close
    (function _patchDrawerSystemForResize() {
      var DS = window.SBE && SBE.DrawerSystem;
      if (!DS) return;
      var _origOpen  = DS.openDrawer;
      var _origClose = DS.closeDrawer;
      if (typeof _origOpen === 'function') {
        DS.openDrawer = function() {
          var r = _origOpen.apply(this, arguments);
          _scheduleViewportSync();
          return r;
        };
      }
      if (typeof _origClose === 'function') {
        DS.closeDrawer = function() {
          var r = _origClose.apply(this, arguments);
          _scheduleViewportSync();
          return r;
        };
      }
    })();

    // Boot sync — after initial layout, once all panels are in their starting state
    _scheduleViewportSync();

    // ── Boot visibility guard ─────────────────────────────────────────────────
    // body.wos-booting is removed as soon as the Mapbox style is applied —
    // map.on('style.load') — which fires after style JSON loads but before tile
    // decode. The basemap is visually coherent at this point (water fills, land
    // fills, roads). Tile decode continues in the background after reveal.
    //
    // Staged reveal:
    //   Stage 1: map container created (WorkspaceUI.init → _buildMapboxViewport)
    //   Stage 2: style.load — basemap visible → _markRuntimeReady() fires here
    //   Stage 3: map.on('load') — tiles decoded (post-reveal, no visual gate)
    //   Stage 4: deferred systems fire 500–1500ms after stage 2
    //
    // Hard limit: if style.load has not fired within 4 seconds, reveal anyway.
    // This prevents an indefinitely black screen on network failure.
    //
    // Non-map fallback: two rAFs (layout then first engine paint).

    function _markRuntimeReady() {
      if (document.body.classList.contains('wos-runtime-ready')) return;
      _scheduleViewportSync();           // ensure map has correct dimensions on reveal
      requestAnimationFrame(function () {
        document.body.classList.remove('wos-booting');
        document.body.classList.add('wos-runtime-ready');

        // ── performance mark — first visible frame ──────────────────────────
        try { performance.mark('wos:first-visible-frame'); } catch (e) {}

        // ── notify WOSBootSequencer ─────────────────────────────────────────
        var bs = window.SBE && SBE.WOSBootSequencer;
        if (bs && bs._onFirstVisibleFrame) bs._onFirstVisibleFrame();

        console.log('[WOS boot] runtime ready — canvas revealed',
          '(' + Math.round(performance.now()) + 'ms)');
      });
    }

    // Hard-limit timer: reveal after 4 s even if style.load never fires
    var _bootHardLimitTimer = setTimeout(function () {
      console.warn('[WOS boot] hard-limit reached — forcing reveal at 4000ms');
      _markRuntimeReady();
    }, 4000);

    (function _wireBootGuard() {
      var mvr = window.SBE && SBE.MapboxViewportRuntime;
      if (mvr && typeof mvr.onStyleLoad === 'function') {
        // Geo / map path — reveal on style.load (basemap visible, pre-tile-decode)
        mvr.onStyleLoad(function () {
          clearTimeout(_bootHardLimitTimer);
          _markRuntimeReady();
        });
      } else if (mvr && typeof mvr.onReady === 'function') {
        // Fallback: older MVR without onStyleLoad
        clearTimeout(_bootHardLimitTimer);
        mvr.onReady(function() {
          requestAnimationFrame(_markRuntimeReady);
        });
      } else {
        // Non-map path — two rAFs: first = layout, second = first engine paint
        clearTimeout(_bootHardLimitTimer);
        requestAnimationFrame(function() {
          requestAnimationFrame(_markRuntimeReady);
        });
      }
    })();

    // Inspector is hidden by default (body.inspector-hidden).
    // It opens on object selection and collapses when selection is cleared
    // (unless pinned). Pin persists across selections.

    var _inspectorPinned = false;

    function _applyInspectorVisibility() {
      var hidden = !_inspectorPinned && !SBE.runtimeFlags.showObjectInspectorWhenEmpty;
      document.body.classList.toggle('inspector-hidden', hidden);
      var pinBtn = document.getElementById('inspector-pin-btn');
      if (pinBtn) pinBtn.classList.toggle('pinned', _inspectorPinned);
    }

    function showObjectInspector() {
      SBE.runtimeFlags.showObjectInspectorWhenEmpty = true;
      document.body.classList.remove('inspector-hidden');
      _scheduleViewportSync(); // grid column 3 expanded → map needs resize
    }

    function hideObjectInspectorIfUnpinned() {
      if (!_inspectorPinned) {
        SBE.runtimeFlags.showObjectInspectorWhenEmpty = false;
        document.body.classList.add('inspector-hidden');
        _scheduleViewportSync(); // grid column 3 collapsed → map needs resize
      }
    }

    function pinObjectInspector(on) {
      _inspectorPinned = (on === undefined) ? !_inspectorPinned : !!on;
      SBE.runtimeFlags.objectInspectorPinned = _inspectorPinned;
      _applyInspectorVisibility();
      _scheduleViewportSync(); // panel width may have changed
      console.log('[inspector] pin:', _inspectorPinned);
    }

    // Wire pin button
    (function _bindInspectorPin() {
      var btn = document.getElementById('inspector-pin-btn');
      if (btn) {
        btn.addEventListener('click', function() { pinObjectInspector(); });
      }
    })();

    // Wire empty-state visibility
    function _syncInspectorEmptyState(hasSelection) {
      var el = document.getElementById('inspector-empty-state');
      if (el) el.hidden = hasSelection;
    }

    // Boot: start collapsed (no selection on load)
    document.body.classList.add('inspector-hidden');
    SBE.runtimeFlags.objectInspectorPinned = false;
    SBE.runtimeFlags.showObjectInspectorWhenEmpty = false;

    function syncSelectionPanel() {
      // Guard — state.selection may not be initialized
      if (!state.selection) return;
      // Sync inspector — render then bind to selected object
      var _inspObj = getSelectedObjectsNorm()[0] || null;
      renderInspector();
      bindInspector(_inspObj);
      enforceSelectionMode(); // hard invariant: group and stroke are mutually exclusive

      // Resolve the actual target — group takes priority over single stroke
      var target = null;
      if (state.selection.groupId) {
        target = state.groups[state.selection.groupId] || null;
      } else if (state.selection.strokeId) {
        target = getStrokeById(state.selection.strokeId);
      }

      var isObjectMode = !!target;
      var hasSelection = isObjectMode || !!getSelectedObject();
      var isCanvasMode = !hasSelection;
      var el = controls.elements;

      // ── Canvas Mode (no selection) — show drawing defaults ──
      if (isCanvasMode) {
        hideObjectInspectorIfUnpinned();
        _syncInspectorEmptyState(false);
        if (el.lineColor)
          el.lineColor.value = state.defaults.color || "#ff4d4d";
        if (el.strokeWidth) {
          var dw = String(Math.round(state.defaults.strokeWidth || 18));
          el.strokeWidth.value = dw;
          if (el.strokeWidthValue) el.strokeWidthValue.textContent = dw;
        }
        // renderInspector(null) hides all object panels via hidden class
        controls.syncSelection(null, ((state.defaults.note % 12) + 12) % 12);
        syncInspectorToObject(null);
        return;
      }

      // Object selected — reveal inspector
      showObjectInspector();
      _syncInspectorEmptyState(true);

      // Pass the real selection to syncSelection — getInspectorState handles all types.
      // For legacy field population (lines/shapes/text/balls), resolve legacySelection.
      var selectionForInspector = target || getSelectedObject();
      var legacySelection =
        selectionForInspector &&
        (selectionForInspector.type === "stroke" ||
          selectionForInspector.type === "group")
          ? selectionForInspector // strokes/groups now pass through — no longer nulled
          : selectionForInspector;
      if (!target) {
        legacySelection = getSelectedObject();
      }

      var activeNote = legacySelection
        ? (legacySelection.midi
            ? legacySelection.midi.note
            : legacySelection.note) || state.defaults.note
        : state.defaults.note;
      controls.syncSelection(
        selectionForInspector,
        ((activeNote % 12) + 12) % 12,
      );
      // Sync Behavior Panel to newly selected stroke
      if (typeof window._wos_syncBehaviorPanel === "function") {
        window._wos_syncBehaviorPanel();
      }
      syncInspectorToObject(legacySelection);

      // ── Object mode — reset controls, populate from target ──
      // Panel visibility owned by renderInspector via controls.syncSelection above.
      // Task 1 — reset inspector controls before applying target state
      if (el.lineColor) el.lineColor.value = "#ff4d4d";
      if (el.strokeWidth) {
        el.strokeWidth.value = "18";
        if (el.strokeWidthValue) el.strokeWidthValue.textContent = "18";
      }
      if (el.lineBehavior) el.lineBehavior.value = "none";
      if (el.lineStrength) el.lineStrength.value = "1";
      if (el.lineStrengthValue) el.lineStrengthValue.textContent = "1";
      // Emitter reset — all to spec defaults
      var eReset = function (name, valName, def) {
        if (el[name]) {
          el[name].value = String(def);
          if (el[valName]) el[valName].textContent = String(def);
        }
      };
      eReset("behaviorEmitterRate", "behaviorEmitterRateValue", 16);
      eReset("behaviorEmitterDensity", "behaviorEmitterDensityValue", 4);
      eReset("behaviorEmitterDirection", "behaviorEmitterDirectionValue", 270);
      eReset("behaviorEmitterSpread", "behaviorEmitterSpreadValue", 25);
      eReset("behaviorEmitterSpeed", "behaviorEmitterSpeedValue", 18);
      eReset("behaviorEmitterSize", "behaviorEmitterSizeValue", 2);
      eReset("behaviorEmitterLife", "behaviorEmitterLifeValue", 1.2);
      if (el.behaviorEmitterStyle) el.behaviorEmitterStyle.value = "dot";

      // Task 2 — populate from target
      var behaviorTarget = target || legacySelection;
      if (behaviorTarget && behaviorTarget.color && el.lineColor) {
        el.lineColor.value = behaviorTarget.color;
      }
      if (target && target.type === "stroke" && el.strokeWidth) {
        var bw = target.baseWidth || target.width || 18;
        el.strokeWidth.value = String(Math.round(bw));
        if (el.strokeWidthValue)
          el.strokeWidthValue.textContent = String(Math.round(bw));
      }
      if (behaviorTarget && behaviorTarget.behavior) {
        var tb = behaviorTarget.behavior;
        if (el.lineBehavior && tb.type && tb.type !== "normal") {
          el.lineBehavior.value = tb.type;
        }
        if (tb.type === "emitter") {
          var setField = function (el, valEl, v) {
            if (el) {
              el.value = String(v);
              if (valEl) valEl.textContent = String(v);
            }
          };
          setField(
            el.behaviorEmitterRate,
            el.behaviorEmitterRateValue,
            tb.rate || 16,
          );
          setField(
            el.behaviorEmitterDensity,
            el.behaviorEmitterDensityValue,
            tb.density || 4,
          );
          setField(
            el.behaviorEmitterDirection,
            el.behaviorEmitterDirectionValue,
            tb.direction || 270,
          );
          setField(
            el.behaviorEmitterSpread,
            el.behaviorEmitterSpreadValue,
            tb.spread || 25,
          );
          setField(
            el.behaviorEmitterSpeed,
            el.behaviorEmitterSpeedValue,
            tb.speed || 18,
          );
          setField(
            el.behaviorEmitterSize,
            el.behaviorEmitterSizeValue,
            tb.size || 2,
          );
          setField(
            el.behaviorEmitterLife,
            el.behaviorEmitterLifeValue,
            tb.life || 1.2,
          );
          if (el.behaviorEmitterStyle)
            el.behaviorEmitterStyle.value = tb.style || "dot";
        }
      }

      // Show/hide strokeWidth field — true for single or multi stroke selection
      var isStrokeSelected =
        getSelectedStrokeTargets().length > 0 ||
        !!(target && target.type === "stroke") ||
        (state.selection.strokeIds && state.selection.strokeIds.size > 0);
      if (controls.elements.strokeWidthField) {
        controls.elements.strokeWidthField.style.display = isStrokeSelected
          ? ""
          : "none";
      }
      // Show outline-visible checkbox for strokes; sync its state
      // Toggle button icon synced via _wos_syncBehaviorPanel (see bindRenderMode)
      // (strokeWidth value already populated in the reset+apply block above)

      // Behavior emitter fields visibility + sync
      var showEmitterFields = false;
      if (legacySelection) {
        var bType = null;
        if (legacySelection.behavior) bType = legacySelection.behavior.type;
        if (
          !bType &&
          legacySelection.segments &&
          legacySelection.segments.length
        ) {
          bType = legacySelection.segments[0].behavior
            ? legacySelection.segments[0].behavior.type
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
      // (Legacy engine emitter sync removed — stroke emitter controls populated in Task 2 block above)

      // Motion panel visibility — owned by renderInspector via controls.syncSelection.
      // Field population still gated on isShape (object motion fields only apply to shapes).
      var isShape =
        state.multiSelection.length === 1 &&
        state.multiSelection[0].type === "shape";
      if (isShape && legacySelection) {
        var m = legacySelection.motion || {
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

      // Step 4 — note-first: prefer obj.note (unified field), then midi.note, then color fallback
      var note =
        typeof obj.note === "number"
          ? obj.note
          : obj.midi && typeof obj.midi.note === "number"
            ? obj.midi.note
            : null;

      var noteClass = null;
      if (note != null) {
        noteClass = ((note % 12) + 12) % 12;
      } else if (color) {
        // Color fallback only when no note field set (legacy objects)
        noteClass = getNoteFromColor(color);
        if (noteClass != null) note = 48 + noteClass;
      }

      if (note != null) {
        state.defaults.note = note;
        state.ui.selectedNoteClass = ((note % 12) + 12) % 12;
        controls.elements.activeNote.value = String(note);
      }

      updateColorSwatch(color || (note != null ? noteToColor(note) : null));

      // Step 6 — sampler sync when stroke selected
      if (noteClass != null) {
        state.sampler.activeNote = noteClass;
        highlightActiveRow(noteClass);
        highlightNoteCell(noteClass);
      }

      state.ui.isMuted = !!(obj.behavior && obj.behavior.isMuted);

      // Sync material type selector
      var matSel = document.getElementById("material-type");
      if (matSel && obj.material && obj.material.type) {
        matSel.value = obj.material.type;
      } else if (matSel) {
        matSel.value = "rigid";
      }
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

    function getPrimarySelectedObjectRef() {
      if (state.multiSelection && state.multiSelection.length) {
        return state.multiSelection[0];
      }
      if (state.selection) {
        if (state.selection.strokeId) {
          return { type: "stroke", id: state.selection.strokeId };
        }
        if (state.selection.strokeIds && state.selection.strokeIds.size) {
          return {
            type: "stroke",
            id: Array.from(state.selection.strokeIds)[0],
          };
        }
        if (state.selection.groupId) {
          return { type: "group", id: state.selection.groupId };
        }
      }
      if (state.selectedShapeId)
        return { type: "shape", id: state.selectedShapeId };
      if (state.selectedBallId)
        return { type: "ball", id: state.selectedBallId };
      if (state.selectedLineId)
        return { type: "line", id: state.selectedLineId };
      if (state.selectedTextId)
        return { type: "text", id: state.selectedTextId };
      return null;
    }

    function getSelectedObjectRefs() {
      var refs = [];
      if (state.multiSelection && state.multiSelection.length) {
        refs = refs.concat(state.multiSelection);
      }
      if (state.selection) {
        if (state.selection.strokeId)
          refs.push({ type: "stroke", id: state.selection.strokeId });
        if (state.selection.strokeIds && state.selection.strokeIds.size) {
          Array.from(state.selection.strokeIds).forEach(function (id) {
            refs.push({ type: "stroke", id: id });
          });
        }
        if (state.selection.groupId)
          refs.push({ type: "group", id: state.selection.groupId });
      }
      if (state.selectedShapeId)
        refs.push({ type: "shape", id: state.selectedShapeId });
      if (state.selectedBallId)
        refs.push({ type: "ball", id: state.selectedBallId });
      if (state.selectedLineId)
        refs.push({ type: "line", id: state.selectedLineId });
      if (state.selectedTextId)
        refs.push({ type: "text", id: state.selectedTextId });
      var seen = {};
      return refs.filter(function (ref) {
        var key = ref.type + ":" + ref.id;
        if (!ref.id || seen[key]) return false;
        seen[key] = true;
        return true;
      });
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
      if (entry.type === "stroke") {
        return (
          state.strokes.find(function (s) {
            return s.id === entry.id;
          }) || null
        );
      }
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
      enforceSelectionMode(); // hard invariant: group and stroke are mutually exclusive
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

    // ── Projectile Walker Spawn (ProjectileWalkerMigration v1.0.0) ─────────────
    // Spawns a projectile walker in world space — replaces ball spawning for new features.
    // startPoint / endPoint are world coords (already camera-unprojected).
    function spawnProjectileWalkerBurst(startPoint, endPoint) {
      if (state.ui.presentation) return;
      var dx = endPoint.x - startPoint.x;
      var dy = endPoint.y - startPoint.y;
      var magnitude = Math.hypot(dx, dy) || 1;
      var baseAngle = Math.atan2(dy, dx);
      var baseSpeed =
        Math.min(18, Math.max(3, magnitude * 0.06)) *
        (state.ballTool.speed || 1);
      var count = Math.min(state.ballTool.count || 1, 8);
      var spread = state.ballTool.spread || 0.3;

      for (var i = 0; i < count; i++) {
        var angle =
          baseAngle + (count > 1 ? ((i / (count - 1)) * 2 - 1) * spread : 0);
        var spd = baseSpeed * (0.85 + Math.random() * 0.3);
        var pw = createProjectileWalker(
          startPoint.x,
          startPoint.y,
          Math.cos(angle) * spd,
          Math.sin(angle) * spd,
          {
            color: state.swarm.color || "#3dd8c5",
            // projectileTool.radius is the authoritative body size for projectile walkers
            collisionRadius:
              (state.projectileTool && state.projectileTool.radius) || 8,
            bounce:
              state.projectileTool && state.projectileTool.bounce != null
                ? state.projectileTool.bounce
                : 0.82,
            gravityScale:
              state.projectileTool && state.projectileTool.gravityScale != null
                ? state.projectileTool.gravityScale
                : 1.0,
          },
        );
        pw._spawnTime = performance.now();
        state.projectileWalkers.push(pw);
      }
    }

    function spawnBallBurst(startPoint, endPoint) {
      // Route to projectile walkers when projectileTool.useWalkers is enabled
      if (state.projectileTool && state.projectileTool.useWalkers) {
        // startPoint/endPoint are canvas pixels from drawTools — unproject to world space
        var _cam = state.camera;
        function _toWorld(pt) {
          return {
            x: (pt.x - canvas.width / 2) / _cam.zoom + _cam.x,
            y: (pt.y - canvas.height / 2) / _cam.zoom + _cam.y,
          };
        }
        spawnProjectileWalkerBurst(_toWorld(startPoint), _toWorld(endPoint));
        return;
      }
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

    function deleteStrokeById(strokeId) {
      if (!strokeId) return;
      deleteStroke(strokeId);
      if (state.selection) {
        if (state.selection.strokeId === strokeId)
          state.selection.strokeId = null;
        if (state.selection.strokeIds)
          state.selection.strokeIds.delete(strokeId);
      }
      state.multiSelection = (state.multiSelection || []).filter(
        function (sel) {
          return !(sel.type === "stroke" && sel.id === strokeId);
        },
      );
    }

    function deleteObjectByRef(ref) {
      if (!ref || !ref.id) return;
      switch (ref.type) {
        case "stroke":
          deleteStrokeById(ref.id);
          break;
        case "shape":
          state.shapes = state.shapes.filter(function (s) {
            return s.id !== ref.id;
          });
          break;
        case "ball":
          state.balls = state.balls.filter(function (b) {
            return b.id !== ref.id;
          });
          state.swarm.count = state.balls.length;
          break;
        case "line":
          state.lines = state.lines.filter(function (l) {
            return l.id !== ref.id;
          });
          break;
        case "text":
          state.textObjects = state.textObjects.filter(function (t) {
            return t.id !== ref.id;
          });
          break;
        case "group":
          var grp = state.groups && state.groups[ref.id];
          if (grp) {
            var sids = grp.strokeIds || grp.children || [];
            sids.forEach(function (sid) {
              deleteStrokeById(sid);
            });
            if (typeof dissolveGroup === "function") dissolveGroup(ref.id);
            else delete state.groups[ref.id];
          }
          if (state.selection && state.selection.groupId === ref.id)
            state.selection.groupId = null;
          break;
      }
    }

    function deleteSelectedObject() {
      if (state.ui.presentation) return false;
      var refs = getSelectedObjectRefs();
      if (!refs.length) {
        console.warn("[DELETE] Nothing selected");
        return false;
      }
      pushHistory();
      refs.forEach(function (ref) {
        deleteObjectByRef(ref);
      });
      clearSelection();
      renderFrame();
      syncUI();
      console.log(
        "[DELETE] Deleted",
        refs.map(function (r) {
          return r.type + ":" + r.id;
        }),
      );
      return true;
    }

    function getDuplicateDelta() {
      if (
        state.duplication &&
        state.duplication.valid &&
        (Math.abs(state.duplication.dx) > 0.5 ||
          Math.abs(state.duplication.dy) > 0.5)
      ) {
        return { dx: state.duplication.dx, dy: state.duplication.dy };
      }
      return {
        dx: lastDuplicateDelta ? lastDuplicateDelta.x : 20,
        dy: lastDuplicateDelta ? lastDuplicateDelta.y : 20,
      };
    }

    function selectDuplicatedObject(type, id) {
      clearSelection();
      if (type === "stroke") {
        if (state.selection) {
          state.selection.strokeId = id;
          state.selection.strokeIds = new Set([id]);
        }
        state.multiSelection = [{ type: "stroke", id: id }];
        return;
      }
      if (type === "shape") {
        state.selectedShapeId = id;
        state.multiSelection = [{ type: "shape", id: id }];
        return;
      }
      if (type === "ball") {
        state.selectedBallId = id;
        state.multiSelection = [{ type: "ball", id: id }];
        return;
      }
      if (type === "line") {
        state.selectedLineId = id;
        state.multiSelection = [{ type: "line", id: id }];
        return;
      }
      if (type === "text") {
        state.selectedTextId = id;
        state.multiSelection = [{ type: "text", id: id }];
      }
    }

    function deleteSelectionObject() {
      if (state.ui.presentation) return;

      // Delete selected group (all strokes in it)
      if (state.selection.groupId) {
        pushHistory();
        var gid = state.selection.groupId;
        var strokeIdsToDelete = getGroupChildrenDeep(gid);
        strokeIdsToDelete.forEach(function (sid) {
          deleteStroke(sid);
        });
        dissolveGroup(gid);
        state.selection.groupId = null;
        state.selection.strokeId = null;
        state.selection.strokeIds.clear();
        renderFrame();
        syncUI();
        return;
      }

      // Delete individually selected strokes
      if (state.selection.strokeIds.size > 0) {
        pushHistory();
        state.selection.strokeIds.forEach(function (sid) {
          deleteStroke(sid);
        });
        state.selection.strokeIds.clear();
        state.selection.strokeId = null;
        renderFrame();
        syncUI();
        return;
      }

      // Delete single stroke (legacy path)
      if (state.selection.strokeId) {
        pushHistory();
        deleteStroke(state.selection.strokeId);
        state.selection.strokeId = null;
        renderFrame();
        syncUI();
        return;
      }

      // Fallback — delete legacy engine objects (lines, shapes, balls, text)
      if (!state.multiSelection.length) return;

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
      // If duplication delta is valid, prefer it over static lastDuplicateDelta
      if (
        state.duplication &&
        state.duplication.valid &&
        (Math.abs(state.duplication.dx) > 0.5 ||
          Math.abs(state.duplication.dy) > 0.5)
      ) {
        dx = state.duplication.dx;
        dy = state.duplication.dy;
      }
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
      if (entry.type === "stroke") {
        var src = getStrokeById(entry.id);
        if (!src) return null;

        var copy = clone(src);
        copy.id = createStrokeId();
        copy.points = src.points.map(function (p) {
          return { x: p.x + dx, y: p.y + dy };
        });
        // Apply rotation delta if present
        if (
          state.duplication.valid &&
          Math.abs(state.duplication.rotation) > 0.01
        ) {
          var cPoints = copy.points;
          var cx = 0,
            cy = 0;
          cPoints.forEach(function (p) {
            cx += p.x;
            cy += p.y;
          });
          cx /= cPoints.length;
          cy /= cPoints.length;
          var cos = Math.cos(state.duplication.rotation);
          var sin = Math.sin(state.duplication.rotation);
          copy.points = cPoints.map(function (p) {
            var rx = p.x - cx,
              ry = p.y - cy;
            return { x: cx + rx * cos - ry * sin, y: cy + rx * sin + ry * cos };
          });
        }
        copy.drips = [];
        copy.specks = [];
        copy._groupId = null;
        copy.outlineVisible = src.outlineVisible !== false;

        state.strokes.push(copy);
        strokeToLines(copy);

        // Duplicate walker if source has one
        var srcWalker = state.walkers.find(function (w) {
          return w.strokeId === src.id;
        });
        if (srcWalker) {
          var w = createWalkerFromStroke(copy);
          if (w) {
            w.t = srcWalker.t || 0;
            w.dir = srcWalker.dir || 1;
            w.motionMode = srcWalker.motionMode || w.motionMode;
            w.speed = srcWalker.speed || w.speed;
            // P2: deep copy avatar state (includes collider, glyphId, tint, scale, etc.)
            if (srcWalker.avatar) {
              w.avatar = JSON.parse(JSON.stringify(srcWalker.avatar));
            }
            state.walkers.push(w);
            ensureSingleWalker(copy.id);
          }
        }

        return { type: "stroke", id: copy.id };
      }
      if (entry.type === "group") {
        // Delegate to duplicateGroupSelection — it correctly updates selection for repeat Cmd+D
        var g = duplicateGroupSelection(entry.id);
        return g ? { type: "group", id: g.id } : null;
      }
      return null;
    }

    function duplicateGroupSelection(groupId) {
      var group = state.groups[groupId];
      if (!group) return null;
      var dx = lastDuplicateDelta.x;
      var dy = lastDuplicateDelta.y;
      pushHistory();
      var sourceIds = getGroupChildrenDeep(groupId);
      var newIds = [];
      sourceIds.forEach(function (sid) {
        var s = getStrokeById(sid);
        if (!s) return;
        var copy = clone(s);
        copy.id = createStrokeId();
        copy.points = s.points.map(function (p) {
          return { x: p.x + dx, y: p.y + dy };
        });
        // Apply rotation delta around each copy's own centroid
        if (
          state.duplication.valid &&
          Math.abs(state.duplication.rotation) > 0.01
        ) {
          var gPoints = copy.points;
          var gcx = 0,
            gcy = 0;
          gPoints.forEach(function (p) {
            gcx += p.x;
            gcy += p.y;
          });
          gcx /= gPoints.length;
          gcy /= gPoints.length;
          var gCos = Math.cos(state.duplication.rotation);
          var gSin = Math.sin(state.duplication.rotation);
          copy.points = gPoints.map(function (p) {
            var rx = p.x - gcx,
              ry = p.y - gcy;
            return {
              x: gcx + rx * gCos - ry * gSin,
              y: gcy + rx * gSin + ry * gCos,
            };
          });
        }
        copy.drips = [];
        copy.specks = [];
        delete copy._groupId;
        copy.outlineVisible = s.outlineVisible !== false;
        copy.renderMode = s.renderMode || "visible";
        state.strokes.push(copy);
        strokeToLines(copy);
        // Duplicate walker
        var srcWalker = state.walkers.find(function (w) {
          return w.strokeId === s.id;
        });
        if (srcWalker) {
          var w = createWalkerFromStroke(copy);
          if (w) {
            w.t = srcWalker.t || 0;
            w.dir = srcWalker.dir || 1;
            w.motionMode = srcWalker.motionMode || w.motionMode;
            w.speed = srcWalker.speed || w.speed;
            state.walkers.push(w);
            ensureSingleWalker(copy.id);
          }
        }
        newIds.push(copy.id);
      });
      if (!newIds.length) return null;
      var newGroup = createGroup(newIds);
      // Select the new group — repeated Cmd+D now duplicates the new one
      state.selection.groupId = newGroup.id;
      state.selection.strokeId = null;
      state.selection.strokeIds.clear();
      state.multiSelection = [{ type: "group", id: newGroup.id }];
      syncLegacySelection();
      syncSelectionPanel();
      renderFrame();
      return newGroup;
    }

    async function duplicateSelectedObject() {
      if (state.ui.presentation) return null;
      var ref = getPrimarySelectedObjectRef();
      if (!ref) {
        console.warn("[DUPLICATE] Nothing selected");
        return null;
      }
      pushHistory();
      var delta = getDuplicateDelta();
      var result = duplicateOneEntry(ref, delta.dx, delta.dy);
      if (!result) {
        console.warn("[DUPLICATE] Failed", ref);
        return null;
      }
      // Update lastDuplicateDelta for chained Cmd+D
      lastDuplicateDelta = { x: delta.dx, y: delta.dy };
      selectDuplicatedObject(result.type, result.id);
      syncLegacySelection();
      syncSelectionPanel();
      state.swarm.count = state.balls.length;
      renderFrame();
      syncUI();
      console.log(
        "[DUPLICATE]",
        ref.type + ":" + ref.id,
        "→",
        result.id,
        delta,
      );
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
        // Exclude derived stroke bridge lines — rebuilt on restore
        lines: state.lines
          .filter(function (l) {
            return !isDerivedStrokeLine(l);
          })
          .map(serializeLineObject),
        textObjects: state.textObjects.map(SBE.TextSystem.serializeTextObject),
        shapes: SBE.ShapeSystem
          ? state.shapes.map(SBE.ShapeSystem.serializeShape)
          : [],
        balls: clone(state.balls),
        projectileWalkers: clone(state.projectileWalkers || []),
        groups: clone(state.groups || {}),
        walkers: clone(state.walkers || []),
        strokes: state.strokes.map(function (s) {
          return {
            id: s.id,
            type: s.type,
            points: s.points.slice(),
            width: s.width,
            baseWidth: s.baseWidth,
            scale: s.scale,
            color: s.color,
            renderMode: s.renderMode || "visible",
            mode: s.mode,
            sound: clone(s.sound),
            behavior: clone(s.behavior),
            motion: s.motion ? clone(s.motion) : null,
            outlineVisible: s.outlineVisible !== false,
            opacity: s.opacity != null ? s.opacity : 1,
            specks: [],
            drips: [],
            // ── Subject layer (SubjectLayerStabilityFix v1.0.0) ────────────
            pathStyle: s.pathStyle || "solid",
            pathDash: s.pathDash != null ? s.pathDash : 12,
            pathGap: s.pathGap != null ? s.pathGap : 8,
            subjectStyle: s.subjectStyle != null ? s.subjectStyle : "none",
            subjectGlyph: s.subjectGlyph || null,
            subjectText: s.subjectText || null,
            subjectImage: s.subjectImage || null,
            subjectScale: s.subjectScale != null ? s.subjectScale : 1.0,
            subjectOpacity: s.subjectOpacity != null ? s.subjectOpacity : 1.0,
            subjectVisible: s.subjectVisible !== false,
            subjectColor: s.subjectColor || null,
            layerId: s.layerId || null,
            trail: s.trail ? clone(s.trail) : null,
            _groupId: s._groupId || null,
          };
        }),
        // ── Layer state ────────────────────────────────────────────────────────
        layers: clone(state.layers || []),
        activeLayerId: state.activeLayerId || null,
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

    function safeGetValue(el) {
      if (!el) return undefined;
      if (el.type === "checkbox") return el.checked;
      return el.value;
    }

    function safeGetNumber(el, fallback) {
      var v = safeGetValue(el);
      if (v === undefined) return fallback;
      var n = Number(v);
      return isNaN(n) ? fallback : n;
    }

    function readInspectorPatch() {
      var el = controls.elements;
      var mechanicValue = safeGetValue(el.lineMechanic) || "none";
      var behaviorValue = safeGetValue(el.lineBehavior) || "none";
      return {
        note: clampInt(safeGetNumber(el.activeNote, 60), 0, 127),
        thickness: clampInt(safeGetNumber(el.lineThickness, 3), 1, 24),
        mechanicType: mechanicValue === "none" ? null : mechanicValue,
        behaviorType: behaviorValue === "none" ? "normal" : behaviorValue,
        behaviorStrength: safeGetNumber(el.lineStrength, 1),
      };
    }

    function readInspectorDefaults() {
      var patch = readInspectorPatch();
      var el = controls.elements;
      var sw = safeGetNumber(el.strokeWidth, 18);
      return {
        midiChannel: state.defaults.midiChannel,
        note: patch.note,
        color: safeGetValue(el.lineColor) || noteToColor(patch.note),
        thickness: patch.thickness,
        strokeWidth: sw >= 1 ? sw : 18,
        behaviorType: patch.behaviorType,
        behaviorStrength: patch.behaviorStrength,
        textValue: safeGetValue(el.textContent) || "",
        textSize: clampInt(safeGetNumber(el.textSize, 48), 24, 420),
        textScale: safeGetNumber(el.textScale, 1),
        textRotation: safeGetNumber(el.textRotation, 0),
        autoWalker: state.defaults.autoWalker,
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

      if (entry.type === "stroke") {
        if (!object) return;

        // Task 4 — route to object (object mode) — never to state.defaults here
        // (state.defaults are updated via applyInspectorMetadata when nothing is selected)
        object.color = newColor;
        object.note = patch.note;

        // Stroke width from controls.strokeWidth — never from patch.thickness
        var sw = safeGetNumber(controls.elements.strokeWidth, null);
        if (sw !== null && sw >= 1) {
          object.baseWidth = sw;
          object.width = sw * (object.scale || 1);
          applyStrokeWidth(object);
        }

        // Behavior — never touches color/width
        var bType = patch.behaviorType === "normal" ? null : patch.behaviorType;
        if (bType === "emitter") {
          var existing =
            object.behavior && object.behavior.type === "emitter"
              ? object.behavior
              : {};
          var el = controls.elements;
          object.behavior = {
            type: "emitter",
            rate: el.behaviorEmitterRate
              ? Number(el.behaviorEmitterRate.value) || 16
              : existing.rate || 16,
            density: el.behaviorEmitterDensity
              ? Number(el.behaviorEmitterDensity.value) || 4
              : existing.density || 4,
            direction: el.behaviorEmitterDirection
              ? Number(el.behaviorEmitterDirection.value) || 270
              : existing.direction || 270,
            spread: el.behaviorEmitterSpread
              ? Number(el.behaviorEmitterSpread.value) || 25
              : existing.spread || 25,
            speed: el.behaviorEmitterSpeed
              ? Number(el.behaviorEmitterSpeed.value) || 18
              : existing.speed || 18,
            size: el.behaviorEmitterSize
              ? Number(el.behaviorEmitterSize.value) || 2
              : existing.size || 2,
            life: el.behaviorEmitterLife
              ? Number(el.behaviorEmitterLife.value) || 1.2
              : existing.life || 1.2,
            style: el.behaviorEmitterStyle
              ? el.behaviorEmitterStyle.value || "dot"
              : existing.style || "dot",
            lastEmit: existing.lastEmit || 0,
          };
          console.log(
            "[emitter] created on stroke via UI",
            object.id,
            object.behavior,
          );
        } else if (bType) {
          object.behavior = Object.assign({}, object.behavior, { type: bType });
        } else {
          object.behavior = null;
        }

        console.log(
          "[stroke update]",
          object.id,
          "width:",
          object.width,
          "behavior:",
          object.behavior,
        );
        return;
      }
    }

    // When nothing is selected, inspector changes update drawing defaults
    function applyDefaultsFromInspector() {
      var el = controls.elements;
      if (el.lineColor) state.defaults.color = el.lineColor.value;
      if (el.strokeWidth) {
        var sw = Number(el.strokeWidth.value);
        if (!isNaN(sw) && sw >= 1) state.defaults.strokeWidth = sw;
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
      state.defaults.color = noteToColor(note);
      // Keep WOS.currentNote in sync
      if (window.WOS) {
        WOS.currentNote = note;
      }
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

      // Resolve owning stroke to check trigger routing
      var ownerStroke = resolveEventStroke({
        sourceId: sourceObject.strokeId || sourceObject.id,
      });
      if (ownerStroke) {
        var trigger =
          (ownerStroke.sound && ownerStroke.sound.trigger) || "impact";
        if (trigger !== "impact") return; // collision events only fire impact strokes

        // Synth source: play role synth directly, skip event pipeline
        var src = ownerStroke.sound && ownerStroke.sound.source;
        if (src === "off") return;
        if (src === "synth") {
          var note = ownerStroke.note || sourceObject.note || 60;
          var vel =
            (sourceObject.sound &&
              sourceObject.sound.midi &&
              sourceObject.sound.midi.velocity) ||
            80;
          playSynth(ownerStroke, note, vel);
          return;
        }
        // src === "sample" or undefined → fall through to existing event pipeline
      }

      const currentTime = getTransportTime();

      if (!state.quantize.enabled) {
        var sourceId = null;
        if (sourceObject.strokeId) {
          sourceId = sourceObject.strokeId;
        } else if (sourceObject.id) {
          sourceId = sourceObject.id;
        }
        if (!sourceId) {
          console.warn(
            "[EVENT DROP] collision cannot resolve sourceId",
            sourceObject,
          );
          return;
        }
        if (state.debug && state.debug.audioLogs)
          console.log("[COLLISION RESOLVED]", {
            id: sourceObject.id,
            strokeId: sourceObject.strokeId,
            note:
              sourceObject.note ||
              (sourceObject.sound &&
                sourceObject.sound.midi &&
                sourceObject.sound.midi.note) ||
              60,
          });
        emitEvent({
          type: "collision",
          sourceId: sourceId,
          energy: 1,
          channel: sourceObject.channel || "default",
          data: {
            note:
              sourceObject.note ||
              (sourceObject.sound &&
                sourceObject.sound.midi &&
                sourceObject.sound.midi.note) ||
              60,
          },
        });
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
          if (state.debug && state.debug.audioLogs)
            console.log(
              "[AUDIO SKIP] wall event ignored by sampler path",
              evt.sourceObject,
            );
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
          var sourceId = null;
          if (entry.sourceObject.strokeId) {
            sourceId = entry.sourceObject.strokeId;
          } else if (entry.sourceObject.id) {
            sourceId = entry.sourceObject.id;
          }
          if (!sourceId) {
            console.warn(
              "[EVENT DROP] collision cannot resolve sourceId (quantize)",
              entry.sourceObject,
            );
            return;
          }
          if (state.debug && state.debug.audioLogs)
            console.log("[COLLISION RESOLVED]", {
              id: entry.sourceObject.id,
              strokeId: entry.sourceObject.strokeId,
              note:
                entry.sourceObject.note ||
                (entry.sourceObject.sound &&
                  entry.sourceObject.sound.midi &&
                  entry.sourceObject.sound.midi.note) ||
                60,
            });
          emitEvent({
            type: "collision",
            sourceId: sourceId,
            energy: 1,
            channel: entry.sourceObject.channel || "default",
            data: {
              note:
                entry.sourceObject.note ||
                (entry.sourceObject.sound &&
                  entry.sourceObject.sound.midi &&
                  entry.sourceObject.sound.midi.note) ||
                60,
            },
          });
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
      state.groups = {};
      state.particles.length = 0;
      if (window.SBE && SBE.ParticleSystem)
        SBE.ParticleSystem.particles = state.particles;
      state.selection.strokeId = null;
      state.selection.strokeIds.clear();
      state.selection.groupId = null;
      state.penTool.activeStrokeId = null;
      state.penTool.currentStroke = null;
      state.penTool.isDrawing = false;
      state.penTool.previewPoint = null;
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

    // ── strokeToLines ─────────────────────────────────────────────────────────
    // Bridge: converts a committed Mop stroke into state.lines segments so that
    // collision, sound, and MIDI operate on it — no engine changes needed.

    function strokeToLines(stroke) {
      if (!stroke || !stroke.points || stroke.points.length < 2) return;
      if (!SBE || !SBE.LineSystem) return;
      // P1/P3: visible geometry = physical geometry.
      // Hidden strokes AND "none" path-style produce no collision lines.
      // SUBJECT colliders (avatar) remain independently active via getAvatarCollisionSegments.
      if (
        stroke.outlineVisible === false ||
        stroke.hidden === true ||
        stroke.pathStyle === "none"
      ) {
        // Ensure any previously created lines are removed for this stroke
        removeLinesForStroke(stroke.id);
        return;
      }

      var pts = stroke.points;
      var settings = {
        midiChannel: state.defaults.midiChannel,
        note: stroke.note != null ? stroke.note : state.defaults.note,
        velocityRange: [48, 110],
        life: 9999,
        behavior: {
          type: state.defaults.behaviorType || "normal",
          strength: state.defaults.behaviorStrength || 1.4,
          velocityMultiplier: 1,
        },
        color: stroke.color || noteToColor(state.defaults.note),
        thickness: stroke.width || state.defaults.strokeWidth || 18,
        style: {
          color: stroke.color || noteToColor(state.defaults.note),
          colorMode: "auto",
          thickness: stroke.width || state.defaults.strokeWidth || 18,
        },
        gravity: { enabled: false, direction: "down", strength: 0 },
        // Back-reference so collision/flash can reach the stroke
        _strokeId: stroke.id,
      };

      for (var i = 0; i < pts.length - 1; i++) {
        var seg = {
          x1: pts[i].x,
          y1: pts[i].y,
          x2: pts[i + 1].x,
          y2: pts[i + 1].y,
        };
        try {
          var raw = SBE.LineSystem.createLine(seg, settings);
          var line = normalizeLineObject(raw);
          // Tag so we can remove these lines if the stroke is deleted
          line._strokeId = stroke.id;
          line.strokeId = stroke.id; // collision resolution reads strokeId (no underscore)
          line._isDerived = true; // marks as adapter-generated, not user-created
          state.lines.push(line);
        } catch (e) {
          // LineSystem unavailable — skip silently
        }
      }
    }

    // Remove all state.lines generated from a stroke (call on stroke deletion)
    function removeLinesForStroke(strokeId) {
      state.lines = state.lines.filter(function (l) {
        return l._strokeId !== strokeId;
      });
    }

    // ── End strokeToLines ─────────────────────────────────────────────────────

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
      // Reset MIDI playback so no burst fires on start
      if (state.midiPlayback) {
        state.midiPlayback.lastBeat = getCurrentTransportBeat();
        state.midiPlayback.firedNoteKeys.clear();
        state.midiPlayback.activeNotes = [];
        state.midiPlayback.lastTriggeredNotes = [];
        state.midiPlayback.playheadEventIndex = null;
        state.midiPlayback.playheadEventId = null;
        state.midiPlayback.playheadBeat = 0;
      }
      // Reset grid layer playback state so no burst fires on resume
      (state.world.layers || []).forEach(function (layer) {
        if (layer.type === "grid") {
          layer._prevBeat = null;
          layer._firedEvents = null;
        }
      });
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
      if (state.midiPlayback) {
        state.midiPlayback.activeNotes = [];
        state.midiPlayback.lastTriggeredNotes = [];
        state.midiPlayback.playheadEventIndex = null;
        state.midiPlayback.playheadEventId = null;
        state.midiPlayback.playheadBeat = 0;
      }

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

    // ── Corridor Ecology — init / enable / disable ────────────────────────────
    function initEcology() {
      if (!window.SBE || !SBE.DistrictPressure || !SBE.TrafficEcology) return;
      if (!state.world) state.world = {};

      // Ensure realization config exists (may already be set from state init)
      if (!state.world.realization) {
        state.world.realization = {
          enabled:         true,
          radius:          1800,
          maxActive:       120,
          despawnPadding:  300,
          visualizeRadius: true,
        };
      }

      // Bootstrap ecology namespace if not present
      if (!state.world.ecology) {
        state.world.ecology = {
          enabled:          true,
          time:             720,        // abstract minutes since midnight (noon default)
          timeOfDay:        0.5,
          timeScale:        10,         // 1 real sec = 10 world minutes
          weather:          { intensity: 0 },
          events:           [],
          abstractVehicles: [],
          musicEcology:     { enabled: true },
          pressure:         SBE.DistrictPressure.initPressure(),
          _lastAbstractTick: 0,
        };
      } else {
        // Re-enable if already initialized
        state.world.ecology.enabled = true;
        if (state.world.ecology.musicEcology)
          state.world.ecology.musicEcology.enabled = true;
      }

      // Ensure realizedEntities Map exists
      if (!state.world.realizedEntities) {
        state.world.realizedEntities = new Map();
      }

      // Ensure actor storage exists
      if (!state.world.abstractActors) state.world.abstractActors = [];
      if (!state.world.realizedActors) state.world.realizedActors = new Map();
    }

    function enableEcology(on) {
      if (on) {
        initEcology();
      } else if (state.world && state.world.ecology) {
        state.world.ecology.enabled = false;
        if (state.world.ecology.musicEcology)
          state.world.ecology.musicEcology.enabled = false;
      }
    }

    // Expose for console / debug inspector
    global._wosEcology = {
      init:   initEcology,
      enable: function () { enableEcology(true);  },
      disable: function () { enableEcology(false); },
      get:    function () { return state.world && state.world.ecology; },
      districts: function () {
        var eco = state.world && state.world.ecology;
        return eco && eco.pressure && eco.pressure.districts;
      },
    };

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
      lastDt = dt;
      if (window.SBE && SBE.RuntimeViewportRouter) SBE.RuntimeViewportRouter.update(dt);
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

    function updateCamera() {
      var cam = state.camera;
      // Follow mode — lock target to walker
      if (cam.mode === "follow" && cam.follow.walkerId) {
        var fw = state.walkers.find(function (w) {
          return w.id === cam.follow.walkerId;
        });
        if (fw) {
          cam.targetX = fw.x;
          cam.targetY = fw.y;
        }
      }
      // Smooth interpolation
      cam.x += (cam.targetX - cam.x) * 0.1;
      cam.y += (cam.targetY - cam.y) * 0.1;
      cam.zoom += (cam.targetZoom - cam.zoom) * 0.1;
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

      // ── Dual-plane mode ────────────────────────────────────────────────────
      // planeMode controls WHICH physics plane each entity inhabits.
      //   "side"    — screen gravity active for all balls; world field off.
      //   "topdown" — screen gravity suppressed; world vector/flow active.
      //   "hybrid"  — screen physics for screen-plane objects + world physics
      //               for world-plane objects, both simultaneously.
      var _dualPhysics =
        state.world && state.world.physics ? state.world.physics : null;
      var planeMode = (_dualPhysics && _dualPhysics.mode) || "side";
      var _worldField = _dualPhysics ? _dualPhysics.world : null;

      // Helper: apply world-plane physics (vector / flow field) to one object.
      function _applyWorldPhysics(obj, _scale) {
        if (!_worldField || _worldField.fieldType === "none") return;
        var wStr = _worldField.strength || 0;
        if (!wStr) return;
        if (
          _worldField.fieldType === "vector" ||
          _worldField.fieldType === "flow"
        ) {
          obj.vx += (_worldField.vectorX || 0) * wStr * _scale;
          obj.vy += (_worldField.vectorY || 0) * wStr * _scale;
        }
        // orbital and other field types: reserved for future extension
      }

      var damp = state.physics.damping;
      var maxSpd = state.physics.maxSpeed;
      var scale = dt * 60;
      var MOTION_SCALE = 60;

      // ── Legacy ball physics — retired. Skipped when balls array is empty.
      // state.balls preserved for scene deserialization only.
      // New spawns route entirely through state.projectileWalkers.
      if (
        state.balls.length > 0 &&
        (worldMode === "gravity" || worldMode === "flow")
      ) {
        var worldDirection =
          state.world && state.world.direction
            ? state.world.direction
            : state.physics.gravity;
        var worldStrength =
          state.world && Number.isFinite(state.world.strength)
            ? state.world.strength
            : Math.hypot(state.physics.gravity.x, state.physics.gravity.y);

        state.balls.forEach(function (ball) {
          // Screen gravity: active when planeMode is "side" or "hybrid",
          // or when the ball is explicitly bound to the screen plane.
          var isScreen = !ball.motionPlane || ball.motionPlane === "screen";
          var applyScreen =
            planeMode === "side" || (planeMode === "hybrid" && isScreen);
          if (applyScreen) {
            ball.vx += worldDirection.x * worldStrength * scale;
            ball.vy += worldDirection.y * worldStrength * scale;
          }

          // World field: active for world-plane balls in topdown / hybrid.
          if (
            planeMode === "topdown" ||
            (planeMode === "hybrid" && !isScreen)
          ) {
            _applyWorldPhysics(ball, scale);
          }

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

          // Floor death only applies to screen-gravity balls falling downward
          if (applyScreen && worldDirection.y > 0) {
            var FLOOR_Y = state.canvas.height * 0.92;
            if (ball.y > FLOOR_Y) {
              ball._dead = true;
            }
          }
        });
        // Dead ball cleanup now handled globally after collision pass
      }

      if (state.balls.length > 0 && worldMode === "planar") {
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

      if (state.balls.length > 0 && worldMode === "zero-g") {
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

      if (state.balls.length > 0 && worldMode === "swarm") {
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
      updateCamera();
      updateWalkers(dt);
      updateWalkerMusic();

      // InfiniteWorld (also called from behaviorLoop when stopped)
      updateInfiniteWorld(now, dt);

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

      // ── Projectile walker update ─────────────────────────────────────────────
      state.projectileWalkers.forEach(function (pw) {
        updateWalkerMovement(pw, dt);
      });

      // Expose projectile walkers to collision system (world-space path, not proxy)
      // collision.js reads state.projectileWalkers directly via _getProjectileBalls()

      // Cull dead / out-of-bounds projectile walkers
      var worldW = canvas.width,
        worldH = canvas.height;
      state.projectileWalkers = state.projectileWalkers.filter(function (pw) {
        if (pw._dead) return false;
        // Cull if far outside world bounds (2x canvas size margin)
        if (
          pw.x < -worldW ||
          pw.x > worldW * 2 ||
          pw.y < -worldH ||
          pw.y > worldH * 2
        )
          return false;
        return true;
      });

      // ── Stroke collision sync — ensure every stroke has live bridge lines ────
      // Covers the case where strokeToLines wasn't called (motionBrush bake path,
      // paste/undo restore, or any future stroke-creation path that bypasses pointerup).
      // A stamp on each stroke tracks whether lines were built; stale = needs rebuild.
      (function ensureStrokeCollisionLines() {
        var derivedIds = new Set();
        state.lines.forEach(function (l) {
          if (l._strokeId) derivedIds.add(l._strokeId);
        });
        state.strokes.forEach(function (s) {
          // Skip hidden strokes — visible geometry = physical geometry (P3)
          if (s.outlineVisible === false || s.hidden === true) {
            // Remove stale lines if stroke was just hidden
            if (derivedIds.has(s.id)) removeLinesForStroke(s.id);
            return;
          }
          if (!derivedIds.has(s.id)) {
            strokeToLines(s);
          }
        });
      })();

      // Temporarily hide spawn-immune balls from collision detection
      const allBalls = state.balls;
      state.balls = allBalls.filter(function (b) {
        return now - b.spawnTime >= b.collisionDelay;
      });

      // Inject walker proxies — walkers collide with lines and trigger the struck line's sound
      var walkerProxies =
        state.walker && state.walker.enabled
          ? state.walkers.map(function (w) {
              return {
                id: w.id,
                strokeId: w.strokeId,
                x: w.x,
                y: w.y,
                vx: 0,
                vy: 0,
                radius: 8,
                spawnTime: 0,
                collisionDelay: 0,
                _isWalkerProxy: true,
              };
            })
          : [];
      state.balls = state.balls.concat(walkerProxies);

      const collisions = SBE.Collision.detectCollisions(state, now);
      state.collisionCount = collisions.length;
      const soundSources = SBE.Collision.resolveCollisions(
        state,
        collisions,
        now,
      );

      // Remove walker proxies — restore balls to eligible set only
      state.balls = state.balls.filter(function (b) {
        return !b._isWalkerProxy;
      });

      // Restore all balls (immune + eligible)
      state.balls = allBalls;

      // Cache projectile collision contacts for debug overlay rendering
      // Stored on state so drawWalkers can render them in the same frame
      state._projCollisionDebug = state._projCollisionDebug || [];
      state._projCollisionDebug.length = 0;
      collisions.forEach(function (c) {
        if (
          c.type === "line" &&
          c.ball &&
          c.ball._isProjectileWalker &&
          c.closestPoint
        ) {
          state._projCollisionDebug.push({
            wx: c.ball.x,
            wy: c.ball.y,
            cx: c.closestPoint.x,
            cy: c.closestPoint.y,
            dist: c.distance,
            threshold: c.threshold,
            line: c.line,
            radius: c.ball.radius,
          });
        }
      });

      // Apply bounce coefficient to projectile walkers after collision resolution
      // (collision.js wrote raw reflected velocity; bounce scales it)
      collisions.forEach(function (collision) {
        if (!collision.ball || !collision.ball._isProjectileWalker) return;
        var _pw = collision.ball._walkerRef;
        if (!_pw || !_pw.physics) return;
        var _bnc = _pw.physics.bounce != null ? _pw.physics.bounce : 0.82;
        // Apply once per collision event (not per frame)
        _pw.physics.vx *= _bnc;
        _pw.physics.vy *= _bnc;
        // Spawn impact particles at collision point
        if (window.SBE && SBE.ParticleSystem) {
          SBE.ParticleSystem.spawnProfile(
            "burst",
            _pw.x,
            _pw.y,
            _pw.color,
            null,
            { count: 5 },
          );
        }
      });

      // Kill balls on collision — skip spawn-immune balls and walker proxies
      collisions.forEach(function (collision) {
        if (!collision.ball) return;
        var b = collision.ball;
        if (b._isWalkerProxy) return; // walkers are persistent — never killed
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
        // Tag hit time for visual flash feedback
        source.line.lastHitAt = performance.now();
        // Mechanic-aware collision particles
        if (window.SBE && SBE.ParticleSystem) {
          emitCollisionParticles(source.ball, source.line);
        }
        if (state.debug && state.debug.audioLogs)
          console.log("[COLLISION INPUT]", {
            id: source.line.id,
            strokeId: source.line.strokeId,
            note: source.line.note,
          });

        // ── Projectile walker audio — world-space event path ──────────────────
        // Bypasses dispatchCollisionEvent (which gates on trigger === "impact").
        // Most strokes default to trigger="continuous", silencing the legacy path.
        // Synth strokes → playSynth directly (handleOscillator only handles samples).
        // Sample strokes → emitCollisionEvent → emitEvent → eventBus.
        if (source.ball && source.ball._isProjectileWalker) {
          var _projContactPt = source.closestPoint || {
            x: source.ball.x,
            y: source.ball.y,
          };
          var _hitStroke = source.line.strokeId
            ? state.strokes.find(function (s) {
                return s.id === source.line.strokeId;
              })
            : null;
          if (_hitStroke && isMuted(_hitStroke)) {
            return;
          }
          var _hitSrc =
            (_hitStroke && _hitStroke.sound && _hitStroke.sound.source) ||
            "synth";
          if (_hitSrc === "off") {
            return;
          }
          if (_hitSrc === "synth") {
            // Synth path — direct synthesis, bypasses sample pipeline
            var _hitNote =
              (_hitStroke &&
                (_hitStroke.note != null
                  ? _hitStroke.note
                  : _hitStroke.sound &&
                    _hitStroke.sound.midi &&
                    _hitStroke.sound.midi.note)) ||
              60;
            playSynth(_hitStroke, _hitNote, 80);
          } else {
            // Sample path — resolve via event pipeline
            emitCollisionEvent(
              { id: source.line.strokeId, strokeId: source.line.strokeId },
              source.ball,
              1.0,
              _projContactPt,
            );
          }
          return;
        }

        // Walker audio control — applies ONLY to walker proxies, never to real balls
        if (source.ball && source.ball._isWalkerProxy) {
          // ── Avatar body hit — route to avatar owner's stroke sound ──────────
          // Avatar segments have no strokeId (they're not derived from strokes).
          // Look up the avatar owner's stroke via _avatarRef.strokeId instead.
          if (source.line.sourceType === "avatar" && source.line._avatarRef) {
            var _avWalker = source.line._avatarRef;
            var _avStroke = state.strokes.find(function (s) {
              return s.id === _avWalker.strokeId;
            });
            if (_avStroke && !isMuted(_avStroke)) {
              var _avSrc =
                (_avStroke.sound && _avStroke.sound.source) || "synth";
              if (_avSrc !== "off") {
                if (_avSrc === "synth") {
                  var _avNote =
                    _avStroke.note != null
                      ? _avStroke.note
                      : (_avStroke.sound &&
                          _avStroke.sound.midi &&
                          _avStroke.sound.midi.note) ||
                        60;
                  playSynth(_avStroke, _avNote, 80);
                } else {
                  emitCollisionEvent(
                    { id: _avStroke.id, strokeId: _avStroke.id },
                    source.ball,
                    1.0,
                    source.closestPoint || {
                      x: source.ball.x,
                      y: source.ball.y,
                    },
                  );
                }
              }
            }
            return;
          }

          var isSelfStroke =
            source.line.strokeId &&
            source.ball.strokeId === source.line.strokeId;
          // Per-walker flags take priority; fall back to global state.walker flags
          var walkerAudioSelf =
            source.ball.audioSelf != null
              ? source.ball.audioSelf
              : !!(state.walker && state.walker.audioEnabled);
          var triggerOthers =
            source.ball.triggerOthers != null
              ? source.ball.triggerOthers
              : state.walker && state.walker.triggerOthers !== false;

          var shouldPlay;
          if (isSelfStroke) {
            // Walker → own stroke: only plays when audioSelf = true
            shouldPlay = walkerAudioSelf;
          } else {
            // Walker → other stroke: ALWAYS plays (triggerOthers is non-negotiable per spec)
            shouldPlay = true;
          }

          if (!shouldPlay) {
            if (state.debug && state.debug.audioLogs)
              console.log("[WALKER FILTER] Suppressed", {
                isSelf: isSelfStroke,
                audioSelf: walkerAudioSelf,
                triggerOthers: triggerOthers,
                walkerStroke: source.ball.strokeId,
                targetStroke: source.line.strokeId,
              });
            return;
          }

          if (state.debug && state.debug.audioLogs)
            console.log("[WALKER → STROKE AUDIO]", {
              isSelf: isSelfStroke,
              walkerStroke: source.ball.strokeId,
              targetStroke: source.line.strokeId,
            });
          emitCollisionEvent(
            { id: source.line.strokeId, strokeId: source.line.strokeId },
            source.ball,
            1.0,
            source.closestPoint || { x: 0, y: 0 },
          );
          return;
        }

        // Default ball path — unchanged
        queueAudioEvent("collision", source.line);
      });

      // Cleanup dead balls — runs every frame regardless of world mode
      state.balls = state.balls.filter(function (b) {
        return !b._dead;
      });
      state.swarm.count = state.balls.length;

      if (state.balls.length > 0) stabilizeBalls(collisions);

      // Material simulation pass — inject energy then advance simulation
      if (window.SBE && SBE.MaterialSystem) {
        collisions.forEach(function (c) {
          if (c.type === "line" && c.line) {
            SBE.MaterialSystem.injectCollisionEnergy(c.line, c);
          }
        });
        SBE.MaterialSystem.updateAll(state.lines, dt);
      }

      // MIDI playback — sequence notes from active bank against transport beat
      var _currentMidiBeat = getCurrentTransportBeat();
      var _previousMidiBeat =
        state.midiPlayback && typeof state.midiPlayback.lastBeat === "number"
          ? state.midiPlayback.lastBeat
          : _currentMidiBeat;
      processMidiPlayback(_currentMidiBeat, _previousMidiBeat);
      if (state.midiPlayback) state.midiPlayback.lastBeat = _currentMidiBeat;

      // ── Corridor Ecology tick (CityRhythm v1.0.0) ────────────────────────────
      // CityRhythm runs every frame (advances city time + computes curves).
      // Abstract simulation (district pressure + traffic) throttled to ~3s.
      // LocalRealization, FlowField, and MusicEcology run every frame.
      if (window.SBE && SBE.DistrictPressure && SBE.TrafficEcology &&
          SBE.LocalRealization && SBE.MusicEcology) {
        var _eco = state.world && state.world.ecology;
        if (_eco && _eco.enabled) {

          // ── Per-frame: city rhythm advance (owns time signal) ──────────────
          if (SBE.CityRhythm) SBE.CityRhythm.tick(state, dt);

          // ── Throttled: abstract world simulation (~3s cadence) ─────────────
          var _ecoNow     = now;
          var _ecoElapsed = _ecoNow - (_eco._lastAbstractTick || 0);
          if (_ecoElapsed >= 3000) {
            var _ecoDt = Math.min(_ecoElapsed / 1000, 6); // cap at 6s
            SBE.DistrictPressure.tick(_eco, _ecoDt);
            SBE.DistrictPressure.tickEvents(_eco, _ecoDt);
            SBE.TrafficEcology.tick(_eco, _ecoDt);
            // Apply rhythm biases to freshly-computed district pressure
            if (SBE.CityRhythm) SBE.CityRhythm.applyDistrictBias(state);
            // Actor pressure contribution
            if (SBE.ActorEcology) {
              SBE.ActorEcology.contributeToDistrictPressure(
                _eco, state.world.abstractActors || []
              );
            }
            // Cluster events lifecycle + auto-spawn
            if (SBE.ClusterEvents) {
              SBE.ClusterEvents.tick(state, _ecoDt, _ecoNow);
            }
            _eco._lastAbstractTick = _ecoNow;
          }

          // ── Per-frame: realization + flow + actors + events + music ────────
          SBE.LocalRealization.tick(state, now);
          if (SBE.TrafficFlowField) SBE.TrafficFlowField.tick(state, dt);
          if (SBE.ActorEcology) {
            SBE.ActorEcology.tick(state, dt, now);
            SBE.ActorEcology.contributeMusicEcology(
              _eco, state.world.abstractActors, state.world.realizedActors
            );
          }
          if (SBE.ClusterEvents) {
            SBE.ClusterEvents.influenceActors(state);
            SBE.ClusterEvents.contributeMusicEcology(
              _eco, SBE.ClusterEvents.getActiveEvents(state)
            );
          }
          if (SBE.CameraCuriosity) {
            SBE.CameraCuriosity.tick(state, dt, now);
          }
          if (SBE.PassengerDemo) {
            SBE.PassengerDemo.tick(state, dt, now);
          }
          SBE.MusicEcology.tick(_eco, state, dt);
        }
      }
    }

    // ── SymbolObject rendering (world space, inside camera transform) ─────────
    //
    // renderSymbolObjects is called from inside renderFrame's camera-transform
    // block, so ctx is already transformed to world space.
    //
    // Rendering uses WOS.SymbolRenderer.renderGlyph exclusively.
    // If a referenced SymbolSet or glyph is missing, a fallback placeholder
    // is drawn (dashed rect) and the pipeline continues without crashing.

    var _symGhost = { visible: false, wx: 0, wy: 0 }; // placement ghost state

    function renderSymbolObjects(ctx) {
      var SR = global.WOS && global.WOS.SymbolRenderer;
      var SS = global.SBE && global.SBE.SymbolSystem;
      var SOS = global.SBE && global.SBE.SymbolObjectSystem;
      if (!SR || !SS || !SOS) return;

      var objs = state.symbolObjects;
      if (!objs || !objs.length) {
        if (state.tool === "symbol-place") _drawSymbolGhost(ctx, SR, SS, SOS);
        return;
      }

      var sorted = SOS.sortByZIndex(objs);
      var clean = !!(
        state.ui &&
        (state.ui.cleanOutput || state.ui.presentation)
      );

      sorted.forEach(function (obj) {
        if (!obj.visible) return;

        var set = SS.getSet(obj.setId);
        var glyph = set ? set.glyphs[obj.slotKey] || null : null;
        var size = SOS.getWorldSize(obj);
        var pal = SOS.resolvePalette(obj, set);

        ctx.save();
        ctx.globalAlpha = obj.opacity !== undefined ? obj.opacity : 1;

        // Apply world-space transform: translate to center, rotate, then offset to draw from top-left
        ctx.translate(obj.x, obj.y);
        if (obj.rotation) ctx.rotate(obj.rotation);

        var half = size / 2;

        if (
          glyph &&
          ((glyph.strokes && glyph.strokes.length) ||
            (glyph.objects && glyph.objects.length))
        ) {
          SR.renderGlyph(ctx, glyph, -half, -half, size, pal, {});
        } else {
          // Fallback: dashed placeholder box — indicates missing glyph, no crash
          ctx.strokeStyle = "rgba(255,255,255,0.18)";
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.strokeRect(-half, -half, size, size);
          ctx.setLineDash([]);
          // Slot key label centered
          ctx.fillStyle = "rgba(255,255,255,0.25)";
          ctx.font = Math.max(8, size * 0.18) + "px monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(obj.slotKey || "?", 0, 0);
        }

        ctx.restore();

        // Per-object selection highlight (subtle tint for each selected member)
        if (
          !clean &&
          state.selectedSymbolObjectIds &&
          state.selectedSymbolObjectIds.has(obj.id)
        ) {
          var b = SOS.getBounds(obj);
          ctx.save();
          ctx.globalAlpha = 1;
          ctx.strokeStyle = "rgba(255,255,255,0.35)";
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.strokeRect(b.minX, b.minY, b.w, b.h);
          ctx.setLineDash([]);
          ctx.restore();
        }
      });

      // ── Multi-select combined bounds + handles ────────────────────────────
      if (
        !clean &&
        state.selectedSymbolObjectIds &&
        state.selectedSymbolObjectIds.size > 0
      ) {
        var mb = SOS.getMultiBounds(
          state.symbolObjects,
          state.selectedSymbolObjectIds,
        );
        if (mb) {
          var pad = 10;
          var bx = mb.minX - pad;
          var by = mb.minY - pad;
          var bw = mb.w + pad * 2;
          var bh = mb.h + pad * 2;
          var hr = 5;

          ctx.save();
          ctx.globalAlpha = 1;

          // Dashed bounding box
          ctx.strokeStyle = "rgba(255,255,255,0.8)";
          ctx.lineWidth = 1.5;
          ctx.setLineDash([6, 4]);
          ctx.strokeRect(bx, by, bw, bh);
          ctx.setLineDash([]);

          // Corner scale handles
          var corners = [
            [bx, by],
            [bx + bw, by],
            [bx, by + bh],
            [bx + bw, by + bh],
          ];
          ctx.fillStyle = "rgba(255,255,255,0.85)";
          corners.forEach(function (c) {
            ctx.beginPath();
            ctx.arc(c[0], c[1], hr, 0, Math.PI * 2);
            ctx.fill();
          });

          // Rotate handle — above top-center
          var rx = bx + bw / 2;
          var ry = by - 18;
          ctx.beginPath();
          ctx.arc(rx, ry, hr, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(255,255,255,0.8)";
          ctx.lineWidth = 1.5;
          ctx.stroke();
          // Stem
          ctx.beginPath();
          ctx.moveTo(rx, by);
          ctx.lineTo(rx, ry + hr);
          ctx.stroke();

          ctx.restore();
        }
      }

      // ── Marquee rect overlay ──────────────────────────────────────────────
      if (!clean && _symMarquee) {
        var mx1 = Math.min(_symMarquee.x1, _symMarquee.x2);
        var my1 = Math.min(_symMarquee.y1, _symMarquee.y2);
        var mw = Math.abs(_symMarquee.x2 - _symMarquee.x1);
        var mh = Math.abs(_symMarquee.y2 - _symMarquee.y1);
        ctx.save();
        ctx.globalAlpha = 1;
        ctx.fillStyle = "rgba(255,255,255,0.04)";
        ctx.fillRect(mx1, my1, mw, mh);
        ctx.strokeStyle = "rgba(255,255,255,0.55)";
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 4]);
        ctx.strokeRect(mx1, my1, mw, mh);
        ctx.setLineDash([]);
        ctx.restore();
      }

      // Placement ghost (drawn last, on top of all placed objects)
      if (state.tool === "symbol-place") _drawSymbolGhost(ctx, SR, SS, SOS);
    }

    function _drawSymbolGhost(ctx, SR, SS, SOS) {
      // All four conditions must be true — no partial rendering, no fallback rects.
      if (state.tool !== "symbol-place") return;
      if (!_symGhost || !_symGhost.visible) return;

      var sym = state.symbols;
      if (!sym.activeSlotKey || !sym.activeSetId) return;

      var set = SS.getSet(sym.activeSetId);
      if (!set) return;

      var glyph = set.glyphs[sym.activeSlotKey] || null;
      if (
        !glyph ||
        !(
          (glyph.strokes && glyph.strokes.length) ||
          (glyph.objects && glyph.objects.length)
        )
      )
        return; // no fallback rect in ghost

      var size = SOS.BASE_SIZE;
      var pal = sym.placementPalette || set.palette || null;
      var half = size / 2;

      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.translate(_symGhost.wx, _symGhost.wy);

      SR.renderGlyph(ctx, glyph, -half, -half, size, pal, {});

      // Crosshair
      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      ctx.lineWidth = 0.5;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(-half - 4, 0);
      ctx.lineTo(half + 4, 0);
      ctx.moveTo(0, -half - 4);
      ctx.lineTo(0, half + 4);
      ctx.stroke();

      ctx.restore();
    }

    function renderFrame() {
      state.frame = (state.frame || 0) + 1;
      // Pass renderer a filtered state view — derived stroke-bridge lines are invisible
      // to the renderer (they duplicate renderStrokes) but stay in state.lines for collision
      var renderState = Object.assign({}, state, {
        lines: state.lines.filter(function (l) {
          return !l._isDerived;
        }),
      });
      // Geo mode: route/world surfaces use Mapbox as substrate.
      // Suppress stage background and old RouteWorld basemap renderer (PIP source).
      var _geoSurface = (function() {
        if (!window.SBE || !SBE.Workspace) return false;
        // isGeographicMode() is authoritative — stays true once workspace is geo-initialized,
        // even during the brief window when getActiveSurface() returns null (e.g. last surface
        // just closed and replacement hasn't been opened yet).
        if (SBE.Workspace.isGeographicMode && SBE.Workspace.isGeographicMode()) return true;
        var _d = SBE.Workspace.getActiveSurface();
        return !!(_d && (_d.type === "route" || _d.type === "world"));
      })();
      if (_geoSurface && renderState.ui) renderState.ui.transparentBackground = true;

      // In geo mode, keep canvas pixel buffer in sync with the canvas-area layout
      // so that mbr.project() CSS-pixel coordinates map directly onto canvas pixels.
      if (_geoSurface) {
        var _caRect = (document.querySelector(".canvas-area") || {}).getBoundingClientRect
          ? document.querySelector(".canvas-area").getBoundingClientRect()
          : null;
        if (_caRect && _caRect.width > 0 && _caRect.height > 0) {
          var _caw = Math.round(_caRect.width);
          var _cah = Math.round(_caRect.height);
          if (canvas.width !== _caw || canvas.height !== _cah) {
            canvas.width  = _caw;
            canvas.height = _cah;
          }
        }
      }

      renderer.render(renderState, drawTools.getOverlays());
      var ctx = canvas.getContext("2d");

      // ── Frame-space: environment grid layers — not affected by camera ────────
      if (!_geoSurface) {
        ctx.save();
        renderGridLayers(ctx);
        ctx.restore();
      }

      // ── InfiniteWorld overlay (screen space, over grid) ───────────────────
      if (state.infiniteWorld && state.infiniteWorld.enabled) {
        ctx.save();
        renderInfiniteWorldOverlay(ctx);
        ctx.restore();
      }

      // ── RouteWorld overlay — DISABLED in geo mode (Mapbox handles basemap) ──
      if (!_geoSurface && state.routeWorld && state.routeWorld.active) {
        ctx.save();
        renderRouteWorldOverlay(ctx);
        ctx.restore();
      }

      // ── Camera transform — world space draw calls ─────────────────────────
      var cam = state.camera;
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.scale(cam.zoom, cam.zoom);
      ctx.translate(-cam.x, -cam.y);

      // Grid — drawn before all stroke/walker content
      drawGrid(ctx, canvas.width, canvas.height);

      // ── Ecology renderers — suppressed in geographic surface mode ────────────
      // In geo mode the canvas is transparent over Mapbox; world-space ecology
      // content would ghost over the map. All draws below are skipped.
      if (!_geoSurface) {

        // ── Stage Lighting — atmosphere + district fog + corridor glow ─────────
        if (window.SBE && SBE.StageLightingRenderer) {
          SBE.StageLightingRenderer.render(ctx, state, performance.now());
        }

        // ── Corridor Ecology — district overlays + route visualization ─────────
        if (window.SBE && SBE.RealizationRenderer) {
          SBE.RealizationRenderer.render(ctx, state, performance.now());
        }

        // ── City Rhythm ────────────────────────────────────────────────────────
        if (window.SBE && SBE.CityRhythmRenderer) {
          SBE.CityRhythmRenderer.render(ctx, state, performance.now());
        }

        // ── Traffic Flow Field ─────────────────────────────────────────────────
        if (window.SBE && SBE.TrafficFlowRenderer) {
          SBE.TrafficFlowRenderer.render(ctx, state);
        }

        // ── Actor Ecology ──────────────────────────────────────────────────────
        if (window.SBE && SBE.ActorRenderer) {
          SBE.ActorRenderer.render(ctx, state, performance.now());
        }

        // ── Cluster Events ─────────────────────────────────────────────────────
        if (window.SBE && SBE.ClusterEventRenderer) {
          SBE.ClusterEventRenderer.render(ctx, state, performance.now());
        }

        // ── Camera Curiosity ───────────────────────────────────────────────────
        if (window.SBE && SBE.CameraCuriosityRenderer) {
          SBE.CameraCuriosityRenderer.render(ctx, state, performance.now());
        }

        // ── Passenger Demo ─────────────────────────────────────────────────────
        if (window.SBE && SBE.PassengerDemoRenderer) {
          SBE.PassengerDemoRenderer.render(ctx, state, performance.now());
        }

        // ── Field visualization layer ──────────────────────────────────────────
        var _fviz = state.world && state.world.fieldViz;
        if (window.SBE && SBE.FieldRenderer && (!_fviz || _fviz.visible !== false)) {
          SBE.FieldRenderer.render(ctx, state);
        }

        // Surface stamp layer (persistent ink)
        ctx.drawImage(surfaceCanvas, 0, 0);
        renderStrokes(ctx);
        renderSymbolObjects(ctx);
        renderMidiPoints(ctx);

        // ── Field visualizer (debug/atmospheric overlay) ────────────────────
        if (window.SBE && SBE.FieldVisualizer) {
          SBE.FieldVisualizer.render(ctx, state, lastDt);
        }

        drawWalkers(ctx);

      } // end !_geoSurface

      // ── Projectile collision contact debug overlay (world-space) ─────────────
      // Active when ANY projectile walker has showPhysics enabled.
      // Renders contact points, normals, and active test segments.
      (function drawProjectileContactDebug() {
        if (!state._projCollisionDebug || !state._projCollisionDebug.length)
          return;
        // Only render if at least one active projectile has showPhysics
        var anyDebug = (state.projectileWalkers || []).some(function (w) {
          return w.debug && w.debug.showPhysics;
        });
        if (!anyDebug) return;

        ctx.save();
        state._projCollisionDebug.forEach(function (ev) {
          // Contact point — magenta dot
          ctx.globalAlpha = 0.95;
          ctx.fillStyle = "#ff00ff";
          ctx.beginPath();
          ctx.arc(ev.cx, ev.cy, 3, 0, Math.PI * 2);
          ctx.fill();

          // Penetration line: projectile center → contact point
          ctx.strokeStyle = "rgba(255,0,255,0.6)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(ev.wx, ev.wy);
          ctx.lineTo(ev.cx, ev.cy);
          ctx.stroke();

          // Normal arrow at contact point — orange (points away from line)
          var _ndx = ev.wx - ev.cx,
            _ndy = ev.wy - ev.cy;
          var _nm = Math.hypot(_ndx, _ndy) || 1;
          var _nx = _ndx / _nm,
            _ny = _ndy / _nm;
          var _nLen = ev.radius * 1.4;
          ctx.strokeStyle = "#ff8800";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(ev.cx, ev.cy);
          ctx.lineTo(ev.cx + _nx * _nLen, ev.cy + _ny * _nLen);
          ctx.stroke();

          // Threshold ring at contact — shows live collision radius in world space
          ctx.strokeStyle = "rgba(255,255,0,0.35)";
          ctx.lineWidth = 0.5;
          ctx.setLineDash([2, 4]);
          ctx.beginPath();
          ctx.arc(ev.wx, ev.wy, ev.threshold, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);

          // Line segment being tested — dim cyan
          if (ev.line) {
            ctx.strokeStyle = "rgba(0,255,255,0.25)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(ev.line.x1, ev.line.y1);
            ctx.lineTo(ev.line.x2, ev.line.y2);
            ctx.stroke();
          }
        });
        ctx.globalAlpha = 1;
        ctx.restore();
      })();

      renderParticles(ctx);
      drawHitFeedback(ctx);
      drawMutedOverlays(ctx);
      drawShapeIndicators(ctx);
      drawLinePreview();

      ctx.restore();
      // ── End camera transform — screen space overlays follow ───────────────

      // In geo mode, clear any world-space ghost content drawn inside the camera
      // transform (e.g. from renderers that ran before the _geoSurface guard was
      // added, or debug overlays). Canvas is transparent over Mapbox — anything
      // left here would composite incorrectly on top of the map.
      if (_geoSurface) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }

      // ── Harbor Bootstrap gate ─────────────────────────────────────────────
      // When harborBootstrapMode is active, land-traffic overlays are suppressed.
      // Only marine continuity systems, Mapbox base, and atmospheric overlays run.
      var _harborMode = !!(
        window.SBE && SBE.runtimeFlags && SBE.runtimeFlags.harborBootstrapMode
      );

      // ── RuntimeViewportRouter — geographic route overlay (screen space) ───
      // Rendered AFTER camera restore: mbr.project() returns CSS-pixel map
      // coordinates which match canvas pixel space when canvas fills the area.
      // Suppressed in harbor mode — route vehicle overlays contaminate marine viewport.
      if (_harborMode && !state._harborRouterSuppressionLogged) {
        console.log('[HarborValidation] RuntimeViewportRouter suppressed from startup');
        state._harborRouterSuppressionLogged = true;
      }
      if (window.SBE && SBE.RuntimeViewportRouter && !_harborMode) {
        SBE.RuntimeViewportRouter.render(ctx);
      }

      // Labels render in screen space (zoom-stable font size)
      renderLabels(ctx);

      drawParticleOverlays();
      drawDebugHUD();

      // ── Rotation guide overlay (arc, ticks, snap indicators, degree label) ──
      if (
        state.transform.active &&
        state.transform.type === "rotate" &&
        state.transform.origin
      ) {
        var ro = state.transform.origin;
        var radius = 48;
        var rCtx = ctx;
        var isSnapping = heldKeys && heldKeys.has("shift");
        var accumDeg = (state.transform.rotationAccum * 180) / Math.PI;
        rCtx.save();

        // Arc ring
        rCtx.beginPath();
        rCtx.arc(ro.x, ro.y, radius, 0, Math.PI * 2);
        rCtx.strokeStyle = "rgba(0,255,208,0.18)";
        rCtx.lineWidth = 1;
        rCtx.stroke();

        // Tick marks every 15° (24 ticks)
        for (var ti = 0; ti < 24; ti++) {
          var ta = ti * (Math.PI / 12);
          var isCardinal = ti % 6 === 0; // 0/90/180/270
          var tickLen = isCardinal ? 8 : 4;
          rCtx.beginPath();
          rCtx.moveTo(
            ro.x + Math.cos(ta) * (radius - tickLen),
            ro.y + Math.sin(ta) * (radius - tickLen),
          );
          rCtx.lineTo(
            ro.x + Math.cos(ta) * radius,
            ro.y + Math.sin(ta) * radius,
          );
          rCtx.strokeStyle = isCardinal
            ? "rgba(0,255,208,0.45)"
            : "rgba(0,255,208,0.2)";
          rCtx.lineWidth = isCardinal ? 1.5 : 1;
          rCtx.stroke();
        }

        // Current angle indicator line from origin
        var accumRad = state.transform.rotationAccum;
        // Determine current absolute angle (start angle + accumulated)
        var startA = state.transform.startAngle || 0;
        var indicatorA = startA + accumRad;
        rCtx.beginPath();
        rCtx.moveTo(ro.x, ro.y);
        rCtx.lineTo(
          ro.x + Math.cos(indicatorA) * (radius + 10),
          ro.y + Math.sin(indicatorA) * (radius + 10),
        );
        rCtx.strokeStyle = isSnapping ? "#00ffd0" : "rgba(0,255,208,0.55)";
        rCtx.lineWidth = isSnapping ? 1.5 : 1;
        rCtx.stroke();

        // Sync isSnapping with input.shift (more reliable than heldKeys)
        isSnapping = input.shift;

        // Snap highlight: bright tick at nearest 15° when Shift held
        if (isSnapping) {
          var snappedA = snapAngle(indicatorA);
          rCtx.beginPath();
          rCtx.arc(
            ro.x + Math.cos(snappedA) * radius,
            ro.y + Math.sin(snappedA) * radius,
            3,
            0,
            Math.PI * 2,
          );
          rCtx.fillStyle = "#00ffd0";
          rCtx.globalAlpha = 0.9;
          rCtx.fill();
          rCtx.globalAlpha = 1;
        }

        // Degree label — large bold, dark background pill for contrast
        var labelSign = accumDeg >= 0 ? "+" : "";
        var labelText = labelSign + accumDeg.toFixed(1) + "°";
        var labelX = state.cursor.x + 10;
        var labelY = state.cursor.y - 10;
        rCtx.font = "bold 15px monospace";
        var labelMetrics = rCtx.measureText(labelText);
        var labelW = labelMetrics.width + 12;
        var labelH = 22;
        // Background pill
        rCtx.fillStyle = "rgba(0,0,0,0.65)";
        rCtx.beginPath();
        if (rCtx.roundRect) {
          rCtx.roundRect(labelX, labelY - labelH + 4, labelW, labelH, 4);
        } else {
          rCtx.rect(labelX, labelY - labelH + 4, labelW, labelH);
        }
        rCtx.fill();
        // Label text
        rCtx.fillStyle = "#00ffd0";
        rCtx.globalAlpha = 1;
        rCtx.fillText(labelText, labelX + 6, labelY - 1);

        rCtx.restore();
      }

      if (!window.noteElements) return;

      Object.keys(window.noteElements).forEach((n) => {
        updateNoteVisual(Number(n), window.noteElements[n]);
      });

      // ── MarineRenderer — driven by MarineOverlayCanvasRuntime, NOT #engine-canvas ──
      // Marine rendering was migrated to a dedicated overlay canvas (#marine-overlay-canvas)
      // to avoid z-index, clearRect, transform, and compositing interference from the
      // legacy WOS canvas pipeline. MarineOverlayCanvasRuntime owns its own rAF loop.
      // No marine draw call here.
    }

    // ── Collision Particle Emission (profile-based) ───────────────────────────

    var MAX_COLLISION_PARTICLES = 20;

    function emitCollisionParticles(ball, line) {
      if (!ball || !line) return;
      // Walker proxies do not emit collision smoke
      if (ball._isWalkerProxy) return;
      if (
        !window.SBE ||
        !SBE.ParticleSystem ||
        !SBE.ParticleSystem.spawnProfile
      )
        return;

      var x = ball.x;
      var y = ball.y;
      var color = line.color || "#ffffff";
      var speed = Math.hypot(ball.vx || 0, ball.vy || 0);
      var mechanic = line.mechanicType || "default";

      // Direction from ball velocity (impact angle)
      var dirDeg = Math.atan2(ball.vy || 0, ball.vx || 0) * (180 / Math.PI);

      // Smoke scale — reduce to 25% of original to avoid visual dominance
      var SMOKE = 0.25;

      switch (mechanic) {
        case "bumper-hard":
          SBE.ParticleSystem.spawnProfile("burst", x, y, color, dirDeg, {
            count: Math.max(
              1,
              Math.round(Math.min(MAX_COLLISION_PARTICLES, 16) * SMOKE),
            ),
            type: "glow",
            speed: [speed * 0.5, speed * 1.2],
          });
          break;
        case "bumper-elastic":
          SBE.ParticleSystem.spawnProfile("streak", x, y, color, dirDeg, {
            count: Math.max(
              1,
              Math.round(Math.min(MAX_COLLISION_PARTICLES, 10) * SMOKE),
            ),
            speed: [speed * 0.4, speed * 1.0],
          });
          break;
        case "ramp":
          SBE.ParticleSystem.spawnProfile("dust", x, y, color, dirDeg, {
            count: Math.max(1, Math.round(4 * SMOKE)),
            spread: 15,
            speed: [speed * 0.2, speed * 0.4],
          });
          break;
        default:
          SBE.ParticleSystem.spawnProfile("burst", x, y, color, null, {
            count: Math.max(
              1,
              Math.round(Math.min(MAX_COLLISION_PARTICLES, 6) * SMOKE),
            ),
          });
      }
    }

    // ── End Collision Particles ───────────────────────────────────────────────

    function renderParticles(ctx) {
      if (window.SBE && SBE.ParticleSystem) {
        SBE.ParticleSystem.render(ctx);
      } else if (state.particles.length) {
        ctx.save();
        state.particles.forEach(function (p) {
          ctx.globalAlpha = Math.max(0, p.life) * 0.85;
          ctx.fillStyle = p.color || "#ffffff";
          ctx.beginPath();
          ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.globalAlpha = 1;
        ctx.restore();
      }
    }

    function drawHitFeedback(ctx) {
      var now = performance.now();
      var HIT_MS = 120;

      // Flash lines on collision hit — skip derived stroke bridge lines (visual noise)
      (state.lines || []).forEach(function (line) {
        if (line._isDerived) return; // bridge lines flash as segment highlight — skip
        if (!line.lastHitAt) return;
        var dt = now - line.lastHitAt;
        if (dt >= HIT_MS) return;
        var fade = 1 - dt / HIT_MS;
        ctx.save();
        ctx.strokeStyle = line.color || "#ffffff";
        ctx.lineWidth = (line.thickness || 3) + 4;
        ctx.lineCap = "round";
        ctx.globalAlpha = fade * 0.8;
        ctx.beginPath();
        ctx.moveTo(line.x1, line.y1);
        ctx.lineTo(line.x2, line.y2);
        ctx.stroke();
        ctx.restore();
      });

      // Flash shapes (segments) on collision hit
      (state.shapes || []).forEach(function (shape) {
        (shape.segments || []).forEach(function (seg) {
          if (!seg.lastHitAt) return;
          var dt = now - seg.lastHitAt;
          if (dt >= HIT_MS) return;
          var fade = 1 - dt / HIT_MS;
          ctx.save();
          ctx.strokeStyle = seg.color || "#ffffff";
          ctx.lineWidth = (seg.thickness || 3) + 4;
          ctx.lineCap = "round";
          ctx.globalAlpha = fade * 0.8;
          ctx.beginPath();
          ctx.moveTo(seg.x1, seg.y1);
          ctx.lineTo(seg.x2, seg.y2);
          ctx.stroke();
          ctx.restore();
        });
      });
    }

    function drawMutedOverlays(passedCtx) {
      var ctx = passedCtx || canvas.getContext("2d");

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
      var ctx = canvas.getContext("2d");
      ctx.save();

      // Ball physics debug overlay
      if (state.balls && state.balls.length) {
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
          ctx.fillStyle =
            note === bpNote ? "rgba(100,255,180,0.9)" : "rgba(255,80,80,0.95)";
          ctx.fillText(text, ball.x, ball.y - (ball.renderRadius + 10));
        });
      }

      // ── Corridor Ecology debug overlay ──────────────────────────────────────
      var _eco = state.world && state.world.ecology;
      if (_eco && _eco.enabled && window.SBE && SBE.LocalRealization) {
        var _ecoMetrics = SBE.LocalRealization.getMetrics(state);
        var _ecoOut  = _eco.musicEcology && _eco.musicEcology.output;

        // City Rhythm header line
        var _rhythmLabel = "";
        if (SBE.CityRhythm) {
          _rhythmLabel = SBE.CityRhythm.getPhaseLabel(state);
        } else {
          var _ecoH = _eco.time != null ? Math.floor(_eco.time / 60) : 0;
          var _ecoM = _eco.time != null ? Math.floor(_eco.time % 60) : 0;
          _rhythmLabel = ("0" + _ecoH).slice(-2) + ":" + ("0" + _ecoM).slice(-2);
        }

        // ── Panel background ─────────────────────────────────────────────────
        var _panelH = 148;
        ctx.font = "11px monospace";
        ctx.textAlign = "left";
        ctx.fillStyle = "rgba(0,0,0,0.60)";
        ctx.fillRect(8, canvas.height - _panelH - 8, 310, _panelH);

        var _py = canvas.height - _panelH + 4;

        // Header — rhythm phase + clock
        ctx.fillStyle = "rgba(61,216,197,0.95)";
        ctx.fillText("ECOLOGY  " + _rhythmLabel, 14, _py);
        _py += 15;

        // Rhythm metrics
        if (SBE.CityRhythm && state.world.rhythm) {
          var _rm = state.world.rhythm.metrics;
          ctx.fillStyle = "rgba(220,180,255,0.80)";
          ctx.fillText(
            "en:" + (_rm.cityEnergy   || 0).toFixed(2) +
            "  nl:" + (_rm.nightlifeBias || 0).toFixed(2) +
            "  tr:" + (_rm.trafficBias   || 0).toFixed(2) +
            "  dl:" + (_rm.deliveryBias  || 0).toFixed(2),
            14, _py
          );
          _py += 14;
        }

        // Realization metrics
        ctx.fillStyle = "rgba(200,200,200,0.85)";
        ctx.fillText(
          "abstract:" + _ecoMetrics.abstract +
          "  realized:" + _ecoMetrics.realized +
          "  r:" + _ecoMetrics.radius,
          14, _py
        );
        _py += 14;

        ctx.fillStyle = "rgba(160,180,160,0.7)";
        ctx.fillText(
          "spawned:" + _ecoMetrics.spawnCount +
          "  despawned:" + _ecoMetrics.despawnCount,
          14, _py
        );
        _py += 14;

        // District pressure table
        var _dp = _eco.pressure && _eco.pressure.districts;
        if (_dp) {
          Object.keys(_dp).forEach(function (id) {
            var d = _dp[id];
            var row = id + "  nl:" + d.nightlife.toFixed(2) +
                      " tr:" + d.traffic.toFixed(2) +
                      " dl:" + d.delivery.toFixed(2) +
                      " en:" + d.energy.toFixed(2);
            ctx.fillStyle = "rgba(180,205,255,0.75)";
            ctx.fillText(row, 14, _py);
            _py += 14;
          });
        }

        // Cluster events metrics
        if (window.SBE && SBE.ClusterEvents) {
          var _cem = SBE.ClusterEvents.getMetrics(state);
          if (_cem.active > 0) {
            ctx.fillStyle = "rgba(200,160,255,0.80)";
            ctx.fillText(
              "events  active:" + _cem.active +
              "  peak:" + _cem.peak +
              "  avgS:" + (_cem.avgStrength || 0).toFixed(2),
              14, _py
            );
            _py += 14;
          }
        }

        // Actor ecology metrics
        if (window.SBE && SBE.ActorEcology) {
          var _am = SBE.ActorEcology.getMetrics(state);
          ctx.fillStyle = "rgba(180,180,230,0.75)";
          ctx.fillText(
            "actors  abs:" + _am.abstractCount +
            "  real:" + _am.realizedCount +
            "  nl:" + _am.nightlife +
            "  cm:" + _am.commuters +
            "  gh:" + _am.ghosts,
            14, _py
          );
          _py += 14;
        }

        // Flow field metrics
        if (window.SBE && SBE.TrafficFlowField) {
          var _flowM = SBE.TrafficFlowField.getMetrics(state);
          ctx.fillStyle = "rgba(140,210,195,0.75)";
          ctx.fillText(
            "flow  clusters:" + _flowM.activeClusters +
            "  avgP:" + _flowM.avgPressure.toFixed(2) +
            "  maxP:" + _flowM.maxPressure.toFixed(2),
            14, _py
          );
          _py += 14;
        }

        // Music ecology output
        if (_ecoOut) {
          ctx.fillStyle = "rgba(255,218,80,0.80)";
          ctx.fillText(
            "bpm" + (_ecoOut.bpmShift >= 0 ? "+" : "") + _ecoOut.bpmShift.toFixed(1) +
            "  dens:" + _ecoOut.density.toFixed(2) +
            "  bright:" + _ecoOut.brightness.toFixed(2) +
            "  perc:" + _ecoOut.percussion.toFixed(2),
            14, _py
          );
        }
      }

      ctx.restore();
    }

    function drawShapeIndicators(passedCtx) {
      var _siCtx = passedCtx;
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
      return AudioEngine.init();
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

      // Material system — ensure every line has a material object
      if (window.SBE && SBE.MaterialSystem) {
        SBE.MaterialSystem.hydrateMaterial(line);
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

  function isTypingTarget() {
    var el = document.activeElement;
    if (!el) return false;
    var tag = el.tagName ? el.tagName.toLowerCase() : "";
    return (
      tag === "input" ||
      tag === "textarea" ||
      tag === "select" ||
      el.isContentEditable === true
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
