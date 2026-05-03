// 0502_MIDI_Importer_v1.0.0
// Converts .mid → WOS MIDI Cartridge
// Vanilla IIFE — no ES modules. Attaches to global SBE.MidiImporter.
// Requires @tonejs/midi loaded from CDN before this file.

(function (global) {
  var SBE = (global.SBE = global.SBE || {});

  // ── Note color (hue from note class — matches WOS NOTE_COLORS identity) ──
  function noteToColor(note) {
    var hue = ((note % 12) / 12) * 360;
    return "hsl(" + hue + ", 80%, 60%)";
  }

  // ── Normalize one note from @tonejs/midi ─────────────────────────────────
  // time and duration converted sec → beats using cartridge BPM
  function normalizeNote(n, bpm) {
    var b = bpm || 120;
    return {
      time: (n.time * b) / 60, // beats
      note: n.midi, // MIDI note number 0–127
      velocity: Math.round(n.velocity * 127), // 0–127
      duration: (n.duration * b) / 60, // beats
      color: noteToColor(n.midi),
    };
  }

  // ── Flatten all tracks → single sorted sequence ───────────────────────────
  function extractNotes(midi, bpm) {
    var notes = [];
    midi.tracks.forEach(function (track) {
      track.notes.forEach(function (n) {
        notes.push(normalizeNote(n, bpm));
      });
    });
    notes.sort(function (a, b) {
      return a.time - b.time;
    });
    return notes;
  }

  // ── Build cartridge ───────────────────────────────────────────────────────
  function createMidiCartridge(arrayBuffer) {
    if (!global.Midi) {
      console.error(
        "[MIDI IMPORT] @tonejs/midi not loaded — Midi global missing",
      );
      return null;
    }
    var midi;
    try {
      midi = new global.Midi(arrayBuffer);
    } catch (err) {
      console.error("[MIDI IMPORT] Parse failed:", err);
      return null;
    }

    var bpm =
      midi.header.tempos && midi.header.tempos[0]
        ? midi.header.tempos[0].bpm
        : 120;

    var notes = extractNotes(midi, bpm); // notes.time/duration now in BEATS
    var length = notes.length
      ? Math.max.apply(
          null,
          notes.map(function (n) {
            return n.time + n.duration;
          }),
        )
      : 0; // total beats

    var cartridge = {
      id: "midi_" + Date.now(),
      name: midi.name || "Imported MIDI",
      bpm: bpm,
      notes: notes,
      length: length,
      meta: {
        trackCount: midi.tracks.length,
        noteCount: notes.length,
      },
    };

    console.log(
      "[MIDI IMPORT] Cartridge built:",
      cartridge.name,
      notes.length +
        " notes, length=" +
        length.toFixed(2) +
        " beats, bpm=" +
        bpm,
    );
    return cartridge;
  }

  // ── File → cartridge (async, used by drop handler) ───────────────────────
  async function loadMidiFile(file) {
    var buf = await file.arrayBuffer();
    return createMidiCartridge(buf);
  }

  // ── Attach cartridge to stroke ────────────────────────────────────────────
  function attachMidiToStroke(stroke, cartridge) {
    if (!stroke || !cartridge) return;
    stroke.midiCartridge = {
      cartridgeId: cartridge.id,
      cursor: 0, // index into cartridge.notes for walker playback
      startTime: null, // transport time when walker first activates this stroke
      speed: 1.0, // playback rate multiplier
    };
    console.log("[MIDI ATTACH]", cartridge.id, "→ stroke", stroke.id);
  }

  // ── Walker cartridge playback tick ────────────────────────────────────────
  // Called from walker update if stroke has a midiCartridge.
  // transportTime = getTransportTime() — monotonic seconds, transport is the MIDI clock.
  // No speed scaling, no offset compression. Transport IS time.
  // transportTime: seconds from getTransportTime().
  // Internally converted to beats using cartridge.bpm.
  // notes.time is in beats (set at import). localTime is in beats.
  function tickCartridgeForWalker(
    walker,
    stroke,
    transportTime,
    state,
    emitFn,
  ) {
    var mc = stroke.midiCartridge;
    if (!mc) return;

    var cartridges = state.midiCartridges || [];
    var cartridge = null;
    for (var i = 0; i < cartridges.length; i++) {
      if (cartridges[i].id === mc.cartridgeId) {
        cartridge = cartridges[i];
        break;
      }
    }
    if (!cartridge || !cartridge.notes.length) return;

    var bpm = cartridge.bpm || 120;
    var len = cartridge.length || 1; // total beats

    // Transport-based playback with pingpong — MIDI time is source of truth
    var beatTime = (transportTime * bpm) / 60;
    var cycle = Math.floor(beatTime / len);
    var phase = beatTime % len;
    var forward = cycle % 2 === 0;
    var localTime = forward ? phase : len - phase;

    // Reset cursor on direction change or wrap
    if (mc.lastForward === undefined) mc.lastForward = forward;
    var dirChanged = forward !== mc.lastForward;
    mc.lastForward = forward;
    if (mc.lastLocalTime === undefined) mc.lastLocalTime = localTime;

    // Wrap/reverse detection
    var wrapped =
      (forward && localTime < mc.lastLocalTime - 0.5) ||
      (!forward && localTime > mc.lastLocalTime + 0.5) ||
      dirChanged;
    mc.lastLocalTime = localTime;
    if (wrapped) {
      // Jump cursor to correct position for new direction
      mc.cursor = 0;
      var notes = cartridge.notes;
      if (!forward) {
        // Start from end for reverse pass
        mc.cursor = notes.length;
      } else {
        // Scan forward to localTime
        while (mc.cursor < notes.length && notes[mc.cursor].time < localTime)
          mc.cursor++;
      }
    }

    // Fire notes — direction-aware
    var notes = cartridge.notes;
    if (forward) {
      while (mc.cursor < notes.length && notes[mc.cursor].time <= localTime) {
        var note = notes[mc.cursor];
        mc.cursor++;
        if (emitFn) emitFn(stroke, note);
      }
    } else {
      // Reverse: fire notes whose time >= localTime, scanning backward
      mc.cursor = Math.min(mc.cursor, notes.length);
      while (mc.cursor > 0 && notes[mc.cursor - 1].time >= localTime) {
        mc.cursor--;
        if (emitFn) emitFn(stroke, notes[mc.cursor]);
      }
    }
  }

  // ── Create bank wrapper from cartridge ───────────────────────────────────
  function createMidiBank(cartridge) {
    if (!cartridge) return null;
    return {
      id: "bank_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
      type: "midiBank",
      name: cartridge.name || "Imported MIDI",
      cartridgeId: cartridge.id,
      samples: [],
      repeat: true,
      consumed: false,
      graphId: null,
      color:
        cartridge.notes && cartridge.notes[0]
          ? cartridge.notes[0].color
          : "#ffffff",
      createdAt: Date.now(),
    };
  }

  // ── Public API ────────────────────────────────────────────────────────────
  SBE.MidiImporter = {
    createMidiCartridge: createMidiCartridge,
    createMidiBank: createMidiBank,
    loadMidiFile: loadMidiFile,
    attachMidiToStroke: attachMidiToStroke,
    tickCartridgeForWalker: tickCartridgeForWalker,
  };
})(window);
