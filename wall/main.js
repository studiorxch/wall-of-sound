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
      // ── MIDI Bank / Graph API ───────────────────────────────────────────
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
        if (midiFiles.length === allFiles.length) return;
      }
      // ── End MIDI drop ─────────────────────────────────────────────────────

      var files = allFiles.filter(function (f) {
        return f.type.includes("audio");
      });
      if (!files.length) return;

      // Priority 1: selected stroke → assign to object (new per-stroke instrument path)
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
        showToast("Select a sampler key or stroke to assign sound");
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

      // Resolve stroke FIRST — merge its sound identity with event note/velocity
      var stroke = state.strokes.find(function (s) {
        return s.id === event.sourceId;
      });
      if (!stroke) {
        console.error(
          "[FATAL AUDIO] No stroke resolved for sourceId:",
          event.sourceId,
        );
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
        id: event.sourceId,
        sourceId: event.sourceId,
        vx: 0,
        vy: 0,
        wosChannel: event.channel, // string key for CHANNEL_PROFILES lookup
        useScale: event.useScale, // per-stroke chromatic freedom flag
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
      selection: {
        strokeId: null, // single primary selection (for handles, inspector)
        strokeIds: new Set(), // multi-select set for grouping + deletion
        groupId: null, // selected group (if stroke belongs to group)
      },
      groups: {}, // id → GroupNode (wrapper layer over strokes)
      particles: [], // emitter particles { x, y, vx, vy, life, color }
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
        strokeWidth: 18,
        behaviorType: "normal",
        behaviorStrength: 1.4,
        textValue: "SWARM",
        textSize: 160,
        textScale: 1,
        textRotation: 0,
        autoWalker: false,
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
      createPreset: {
        withWalker: true, // new strokes get a walker by default
        walkerAudioSelf: true, // walker self-sound on by default
        triggerOthers: true, // walker always triggers other strokes (non-negotiable default)
      },
      midiCartridges: [], // loaded MIDI cartridges — { id, name, bpm, notes, length }
      midiBanks: [], // bank wrappers { id, cartridgeId, graphId, samples, repeat, consumed }
      midiPoints: [], // projected note points { id, graphId, bankId, strokeId, t, note, ... }
      graphs: {}, // graphId → { id, strokeIds, bankId, mode, closed }
      activeMidiBankId: null, // most recently loaded bank
      debug: {
        walkers: false,
        paths: false,
        info: false,
        audioLogs: false, // gates per-frame audio spam logs
        visualMode: "clean", // "clean" = low stroke alpha, no segment flash | "full" = original
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
    // Direct exposure — sampleMap is closure-scoped, state is now defined
    window._wos = window._wos || {};
    window._wos.sampleMap = sampleMap;
    window._wos.state = state;
    window._wos.audioState = state.audio;
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
      // Apply current WOS note + color (spec item 5)
      if (window.WOS) {
        stroke.note = WOS.currentNote;
        stroke.color = noteToColor(WOS.currentNote);
      }
      pushHistory();
      state.strokes.push(stroke);
      state.penTool.currentStroke = null;
      state.penTool.isDrawing = false;
      state.penTool.previewPoint = null;
      analyzeStroke(stroke);
      strokeToLines(stroke); // bridge to collision/sound pipeline
      if (state.createPreset.withWalker) {
        var w = createWalkerFromStroke(stroke);
        if (w) {
          w.audioSelf = !!state.createPreset.walkerAudioSelf;
          w.triggerOthers = state.createPreset.triggerOthers !== false;
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
      // Apply current WOS note + color (spec item 5)
      if (window.WOS) {
        stroke.note = WOS.currentNote;
        stroke.color = noteToColor(WOS.currentNote);
      }
      pushHistory();
      state.strokes.push(stroke);
      state.penTool.currentStroke = null;
      state.penTool.isDrawing = false;
      state.penTool.previewPoint = null;
      analyzeStroke(stroke);
      strokeToLines(stroke); // bridge to collision/sound pipeline
      if (state.createPreset.withWalker) {
        var w = createWalkerFromStroke(stroke);
        if (w) {
          w.audioSelf = !!state.createPreset.walkerAudioSelf;
          w.triggerOthers = state.createPreset.triggerOthers !== false;
          state.walkers.push(w);
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
        if (state.tool !== "pen") return;
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

        // No hit — clear stroke selection
        if (state.selection.strokeId) {
          state.selection.strokeId = null;
          state.selection.strokeIds.clear();
          state.selection.groupId = null;
          state.multiSelection = state.multiSelection.filter(function (e) {
            return e.type !== "stroke";
          });
          syncSelectionPanel();
        }

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
        if (state.tool !== "pen") return;

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
        if (state.tool !== "pen") return;

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
        // Apply current WOS note + color (spec item 5)
        if (stroke && window.WOS) {
          stroke.note = WOS.currentNote;
          stroke.color = noteToColor(WOS.currentNote);
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
        if (stroke && state.createPreset.withWalker) {
          var w = createWalkerFromStroke(stroke);
          if (w) {
            w.audioSelf = !!state.createPreset.walkerAudioSelf;
            w.triggerOthers = state.createPreset.triggerOthers !== false;
            initWalkerGraph(w, stroke); // inherit graphId/bankId if stroke has one
            state.walkers.push(w);
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
      base.sound = { enabled: false, note: null };
      base.behavior = { isMuted: true };
      base.mode = "annotation";
      base.harmony = { role: 0 };
      base.meta = { length: 1, curvature: 0, complexity: 0 };
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
      (state.strokes || []).forEach(function (stroke) {
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
        // During active drawing: always show ghost preview so artist sees the path
        var isActivelyDrawing = stroke.id === state.penTool.activeStrokeId;
        if (isActivelyDrawing && rm !== "visible") {
          // Temporary draw-phase ghost — not tied to renderMode, input feedback only
          if (pts.length >= 2) {
            ctx.save();
            ctx.strokeStyle = stroke.color || "#ffffff";
            ctx.lineWidth = stroke.width || 18;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.globalAlpha = 0.35;
            ctx.setLineDash([6, 6]);
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (var di = 1; di < pts.length - 1; di++) {
              var dMidX = (pts[di].x + pts[di + 1].x) / 2;
              var dMidY = (pts[di].y + pts[di + 1].y) / 2;
              ctx.quadraticCurveTo(pts[di].x, pts[di].y, dMidX, dMidY);
            }
            ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
          }
          return; // skip normal render passes for this stroke while drawing
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
          if (rm === "visible") {
            ctx.save();
            ctx.strokeStyle = stroke.color;
            ctx.lineWidth = stroke.width;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            // Clean visual mode: stroke is structure only, low alpha
            var cleanMode = state.debug && state.debug.visualMode === "clean";
            ctx.globalAlpha = cleanMode
              ? 0.3
              : (stroke.opacity != null ? stroke.opacity : 1) * 0.82;
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (var i = 1; i < pts.length - 1; i++) {
              var midX = (pts[i].x + pts[i + 1].x) / 2;
              var midY = (pts[i].y + pts[i + 1].y) / 2;
              ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
            }
            var last = pts[pts.length - 1];
            ctx.lineTo(last.x, last.y);
            ctx.stroke();
            ctx.restore();
          }
          // rm === "hidden" → no stroke draw, walker and selection halo still active
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
        SBE.ParticleSystem.update(dt, bounds);
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
      return {
        id: "w_" + Math.random().toString(36).slice(2),
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
        motionMode: motionMode,
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

      // Store position — resolved here, not at render time
      var pos;
      if (w.path) {
        pos = samplePath(w.path, w.t);
      } else {
        pos = getStrokePoint(w.stroke, w.t);
      }
      w.x = pos.x;
      w.y = pos.y;

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
              // Fallback always fires — confirms timing even without samples
              playFallbackInstrument(note.note, safeVelocity);
              // Also route through sampler if stroke has samples
              if (stroke.samples && stroke.samples.length > 0) {
                emitEvent({
                  type: "midi",
                  sourceId: stroke.id,
                  energy: safeVelocity / 127,
                  channel: "melodic",
                  useScale: false,
                  data: {
                    note: note.note,
                    velocity: safeVelocity,
                    source: "midiCartridge",
                  },
                });
              }
              if (state.debug && state.debug.audioLogs) {
                console.log("[MIDI NOTE FIRE]", {
                  fullNote: note.note,
                  noteClass: note.note % 12,
                  velocity: safeVelocity,
                  strokeId: stroke.id,
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

        // Tunnel mode: emit aligned to path tangent, narrow spread, flow feel
        var isTunnel = w.motionMode === "tunnel";

        w._emitAcc += dt * fxRate;
        while (w._emitAcc >= 1) {
          w._emitAcc -= 1;
          var tang = sampleTangent(w.path, w.t);
          var angle, ox, oy;
          if (isTunnel) {
            // Tangent-aligned: particles flow forward along path
            angle = Math.atan2(tang.y, tang.x);
            angle += (Math.random() - 0.5) * 0.15; // minimal spread — stays inside
            // Normal offset for "inside tube" feel
            var norm = { x: -tang.y, y: tang.x };
            ox = norm.x * (Math.random() - 0.5) * 4;
            oy = norm.y * (Math.random() - 0.5) * 4;
          } else {
            angle = Math.atan2(tang.y, tang.x);
            angle += (Math.random() - 0.5) * fxSpread;
            ox = 0;
            oy = 0;
          }
          spawnParticleUnified(
            {
              x: w.x + ox,
              y: w.y + oy,
              vx: Math.cos(angle) * fxSpeed,
              vy: Math.sin(angle) * fxSpeed,
              size: fxSize,
              life: fxLife,
              color: fxColor,
              type: fxType,
            },
            dt,
          );
        }
      }
    }

    function updateWalkers(dt) {
      if (!state.walker.enabled) return;
      state.walkers.forEach(function (w) {
        updateWalkerMovement(w, dt);
      });
    }

    function drawWalkers(ctx) {
      var cleanMode = state.debug && state.debug.visualMode === "clean";
      // Always draw walker dot — debug flags only add extra overlays
      state.walkers.forEach(function (w) {
        var px = w.x != null ? w.x : 0;
        var py = w.y != null ? w.y : 0;

        // Walker dot — always visible, larger and red for MIDI-attached walkers
        (function () {
          var hasMidi = !!(
            w.strokeId &&
            (function () {
              var s = state.strokes.find(function (s) {
                return s.id === w.strokeId;
              });
              return s && s.midiCartridge;
            })()
          );
          var r = hasMidi ? 7 : 5;
          var innerColor = hasMidi
            ? "#ff4d4d"
            : w.color || (w.stroke && w.stroke.color) || "#3dd8c5";
          ctx.save();
          ctx.beginPath();
          ctx.arc(px, py, r, 0, Math.PI * 2);
          ctx.fillStyle = "#ffffff";
          ctx.globalAlpha = 0.9;
          ctx.fill();
          ctx.beginPath();
          ctx.arc(px, py, r - 2.5, 0, Math.PI * 2);
          ctx.fillStyle = innerColor;
          ctx.globalAlpha = 1;
          ctx.fill();
          ctx.restore();
        })();

        // Path outline — shown when debug.paths is on
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

        // Info text — shown when debug.info is on
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
      });
    }

    // ── End PathWalker System ────────────────────────────

    // ── End Mop / Stroke System ──────────────────────────

    function drawLinePreview() {
      // Line tool disabled — mop is the primary drawing system
    }

    bindControls();

    // ── Creation Preset UI ───────────────────────────────────────────────────
    (function createPresetUI() {
      if (document.getElementById("wos-preset-ui")) return;
      var panel = document.createElement("div");
      panel.id = "wos-preset-ui";
      panel.style.cssText =
        "position:fixed;bottom:12px;right:12px;background:rgba(0,0,0,0.82);color:#eff2f6;padding:10px 14px;font:600 12px monospace;border-radius:8px;border:1px solid rgba(255,255,255,0.1);z-index:9999;line-height:1.8";
      panel.innerHTML =
        "<div style='margin-bottom:6px;color:#3dd8c5'>Creation Preset</div>" +
        "<label style='display:block'><input type='checkbox' id='preset-walker'> Add Walker on Draw</label>" +
        "<label style='display:block'><input type='checkbox' id='preset-self'> Walker Self Sound</label>";
      document.body.appendChild(panel);

      var walkerToggle = document.getElementById("preset-walker");
      var selfToggle = document.getElementById("preset-self");
      walkerToggle.checked = state.createPreset.withWalker;
      selfToggle.checked = state.createPreset.walkerAudioSelf;

      walkerToggle.addEventListener("change", function () {
        state.createPreset.withWalker = walkerToggle.checked;
        console.log("[PRESET] withWalker:", state.createPreset.withWalker);
      });
      selfToggle.addEventListener("change", function () {
        state.createPreset.walkerAudioSelf = selfToggle.checked;
        console.log(
          "[PRESET] walkerAudioSelf:",
          state.createPreset.walkerAudioSelf,
        );
      });
    })();
    // ── End Creation Preset UI ───────────────────────────────────────────────

    await applyExampleScene();
    state.lines[2].y1 += 100;
    state.lines[2].y2 += 100;
    updateCanvasAspect();
    setViewClasses();
    syncUI();
    updatePanels(state.tool);
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

    function behaviorLoop(now) {
      var dt = behaviorLastTime
        ? Math.min(40, now - behaviorLastTime) / 1000
        : 0.016;
      behaviorLastTime = now;
      processBehaviors(now);
      updateParticles(dt);
      // Drive render when stopped — playback loop handles it when playing
      if (!isPlaying && state.particles.length > 0) renderFrame();
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
      if (state.createPreset.withWalker) {
        var w = createWalkerFromStroke(stroke);
        if (w) {
          w.audioSelf = !!state.createPreset.walkerAudioSelf;
          w.triggerOthers = state.createPreset.triggerOthers !== false;
          state.walkers.push(w);
        }
      }

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
      gain.connect(state.audio.masterGain || ctx.destination);
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
            playFallbackInstrument(
              p.note,
              p.velocity != null ? p.velocity : 100,
            );
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
            playFallbackInstrument(
              p.note,
              p.velocity != null ? p.velocity : 100,
            );
            p.consumed = true;
            triggered = true;
            if (state.debug && state.debug.audioLogs)
              console.log(
                "[MIDI POINT] graph hit",
                p.note,
                "t:",
                p.t.toFixed(3),
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

      elements.lineColor.addEventListener("input", function syncDisplayColor() {
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

      global.addEventListener("keydown", async function onKeyDown(event) {
        heldKeys.add(event.key.toLowerCase());
        if (event.key === "Shift") input.shift = true;

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
            if (
              state.selection.groupId &&
              state.groups[state.selection.groupId]
            ) {
              duplicateGroupSelection(state.selection.groupId);
            } else {
              await duplicateSelectedObject();
            }
            return;
          }
          // D key now activates mop (primary drawing tool)
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
        if (event.key === "Shift") input.shift = false;
      });
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
      if (!state.balls.length) {
        SBE.Swarm.syncSwarmCount(state, true);
        state.balls = state.balls.map(normalizeBall);
      }
      state.backgroundDataUrl = scene.background || null;
      // Emitters removed from scene format — now only exist as line behaviors
      state.backgroundImage = state.backgroundDataUrl
        ? await loadImage(state.backgroundDataUrl)
        : null;

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
      syncShapeLibraryTab();
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
      // Guard — state.selection may not be initialized
      if (!state.selection) return;
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
      if (!state.multiSelection.length || state.ui.presentation) return;
      var dx = lastDuplicateDelta.x;
      var dy = lastDuplicateDelta.y;
      pushHistory();
      var newSelection = [];
      // Group selection routes to dedicated function that updates selection correctly
      if (state.selection.groupId && state.groups[state.selection.groupId]) {
        duplicateGroupSelection(state.selection.groupId);
        return;
      } else {
        state.multiSelection.forEach(function (entry) {
          var result = duplicateOneEntry(entry, dx, dy);
          if (result) newSelection.push(result);
        });
      }
      state.multiSelection = newSelection;
      syncLegacySelection();
      // Set strokeId for stroke duplicates so Object inspector shows the new stroke
      var firstNew = newSelection[0];
      if (firstNew && firstNew.type === "stroke") {
        state.selection.strokeId = firstNew.id;
        state.selection.strokeIds = state.selection.strokeIds || new Set();
        state.selection.strokeIds.clear();
        state.selection.strokeIds.add(firstNew.id);
        state.selection.groupId = null;
      }
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
          };
        }),
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

        // Walker audio control — applies ONLY to walker proxies, never to real balls
        if (source.ball && source.ball._isWalkerProxy) {
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

      stabilizeBalls(collisions);
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
      renderer.render(renderState, drawTools.getOverlays());
      var ctx = canvas.getContext("2d");
      // Grid — drawn before all stroke/walker content
      drawGrid(ctx, canvas.width, canvas.height);
      // Surface stamp layer (persistent ink)
      ctx.drawImage(surfaceCanvas, 0, 0);
      renderStrokes(ctx);
      renderMidiPoints(ctx);
      drawWalkers(ctx);
      renderParticles(ctx);
      drawHitFeedback(ctx);
      drawParticleOverlays();
      drawDebugHUD();
      drawMutedOverlays();
      drawShapeIndicators();
      drawLinePreview();

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
