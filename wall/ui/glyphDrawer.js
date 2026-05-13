// 0512_WOS_GlyphDrawerEmbedding_v1.0.0
// GlyphLab Drawer — Phase 1: embedded subsystem foundation.
// Vanilla IIFE. Registers with SBE.DrawerSystem.
// Load order: glyphRenderer.js → drawerSystem.js → glyphDrawer.js
//
// Rendering: ALL glyph rendering uses WOS.GlyphRenderer.renderGlyph().
// State: reads/writes window._wos.state.glyphs + state.glyphLibrary.
// Persistence: state.glyphLibrary.saved → localStorage key wos_glyph_library_v1.
// Focus: calls _wos.shortcuts.suspend() on mount, .resume() on unmount.

(function initGlyphDrawer(global) {
  "use strict";

  const SBE = (global.SBE = global.SBE || {});

  var LIBRARY_KEY = "wos_glyph_library_v1";
  var _initialized = false;

  // ── One-time initialization ───────────────────────────────────────────────
  // Loads persisted library from localStorage into state.glyphLibrary.saved.
  // Called once on first mount, guarded by _initialized flag.

  function _initialize() {
    if (_initialized) return;
    _initialized = true;

    var state = global._wos && global._wos.state;
    if (!state) return;

    try {
      var raw = localStorage.getItem(LIBRARY_KEY);
      if (!raw) return;
      var data = JSON.parse(raw);
      if (data.version === 1 && Array.isArray(data.saved)) {
        state.glyphLibrary.saved = data.saved;
        console.log("[GlyphDrawer] loaded", data.saved.length, "saved glyphs from localStorage");
      }
    } catch (e) {
      console.warn("[GlyphDrawer] localStorage load failed:", e);
    }
  }

  // ── Persistence ───────────────────────────────────────────────────────────

  function _saveLibrary(state) {
    try {
      localStorage.setItem(LIBRARY_KEY, JSON.stringify({
        version: 1,
        saved: state.glyphLibrary.saved,
      }));
    } catch (e) {
      console.warn("[GlyphDrawer] localStorage save failed:", e);
    }
  }

  // ── DOM helpers ───────────────────────────────────────────────────────────

  function _makeLibraryCard(entry, onSelect, onDelete) {
    var GR = global.WOS && global.WOS.GlyphRenderer;

    var card = document.createElement("div");
    card.className = "glyph-lib-card";
    card.dataset.entryId = entry.id;
    card.title = entry.note + " · " + entry.renderer + " · " + entry.colorMode;

    var cvs = document.createElement("canvas");
    cvs.className = "glyph-lib-thumb";
    cvs.width = cvs.height = 48;
    if (GR) {
      GR.renderGlyph(cvs.getContext("2d"), entry.note, 0, 0, 48, {
        renderer:  entry.renderer,
        colorMode: entry.colorMode,
      });
    }

    var lbl = document.createElement("div");
    lbl.className = "glyph-lib-label";
    lbl.textContent = entry.note;

    var del = document.createElement("button");
    del.className = "glyph-lib-del";
    del.textContent = "×";
    del.title = "Remove";
    del.addEventListener("click", function (e) {
      e.stopPropagation();
      onDelete(entry.id);
    });

    card.addEventListener("click", function () { onSelect(entry); });
    card.appendChild(cvs);
    card.appendChild(lbl);
    card.appendChild(del);
    return card;
  }

  function _makeRecentThumb(entry, onSelect) {
    var GR = global.WOS && global.WOS.GlyphRenderer;

    var cvs = document.createElement("canvas");
    cvs.className = "glyph-recent-thumb";
    cvs.width = cvs.height = 36;
    cvs.title = entry.note + " · " + entry.renderer + " · " + entry.colorMode;

    if (GR) {
      GR.renderGlyph(cvs.getContext("2d"), entry.note, 0, 0, 36, {
        renderer:  entry.renderer,
        colorMode: entry.colorMode,
      });
    }

    cvs.addEventListener("click", function () { onSelect(entry); });
    return cvs;
  }

  // ── Mount ─────────────────────────────────────────────────────────────────

  function mount(container) {
    _initialize();

    var state = global._wos && global._wos.state;
    var GR    = global.WOS  && global.WOS.GlyphRenderer;

    if (!state || !GR) {
      container.innerHTML = [
        '<div class="drawer-view">',
        '<div class="drawer-view__body">',
        '<p class="drawer-hint" style="opacity:.4;">',
        'GlyphRenderer not ready. Check load order.',
        '</p>',
        '</div></div>',
      ].join("");
      return;
    }

    var gs         = state.glyphs;
    var noteOrder  = GR.getNoteOrder();
    var noteColors = GR.getNoteColors();

    // ── Build HTML ───────────────────────────────────────────────────────────

    var noteStripHtml = noteOrder.map(function (note) {
      var active = note === gs.activeNote ? " active" : "";
      var color  = noteColors[note] || "transparent";
      return (
        '<button class="glyph-note-btn' + active + '" ' +
        'data-note="' + note + '" ' +
        'style="--note-color:' + color + '" ' +
        'title="' + note + '">' +
        note +
        "</button>"
      );
    }).join("");

    container.innerHTML = [
      '<div class="drawer-view glyph-drawer">',

      // ── Header ─────────────────────────────────────────────────────────
      '<div class="drawer-view__header">',
      '  <span class="drawer-view__title">GlyphLab</span>',
      '  <div class="glyph-header-actions">',
      '    <button id="glyph-export-png" class="glyph-header-btn" title="Export current glyph as PNG">↓ PNG</button>',
      '  </div>',
      '</div>',

      // ── Body ───────────────────────────────────────────────────────────
      '<div class="drawer-view__body">',

      // Preview + controls
      '<div class="glyph-editor-row">',
      '  <div class="glyph-preview-wrap">',
      '    <canvas id="glyph-preview-canvas" width="128" height="128"></canvas>',
      '  </div>',
      '  <div class="glyph-controls">',
      '    <label class="glyph-label" for="glyph-renderer-select">Renderer</label>',
      '    <select id="glyph-renderer-select">',
      '      <option value="square">Square</option>',
      '      <option value="triangle">Triangle</option>',
      '      <option value="circle">Circle</option>',
      '      <option value="mixed">Mixed</option>',
      '    </select>',
      '    <label class="glyph-label" for="glyph-color-select">Color Mode</label>',
      '    <select id="glyph-color-select">',
      '      <option value="duotone">Duotone</option>',
      '      <option value="monotone">Monotone</option>',
      '      <option value="neutral">Neutral</option>',
      '    </select>',
      '    <label class="glyph-label" for="glyph-size-range">',
      '      Export Size — <span id="glyph-size-val">' + gs.size + '</span>px',
      '    </label>',
      '    <input type="range" id="glyph-size-range" min="64" max="512" step="64" value="' + gs.size + '" />',
      '  </div>',
      '</div>',

      // Note strip
      '<div class="glyph-note-strip" id="glyph-note-strip">',
      noteStripHtml,
      '</div>',

      // Library section
      '<div class="glyph-section-header">',
      '  <span>Library</span>',
      '  <button id="glyph-save-btn" class="glyph-section-btn" title="Save current glyph to library">+ Save</button>',
      '</div>',
      '<div class="glyph-library-grid" id="glyph-library-grid"></div>',

      // Recent section
      '<div class="glyph-section-header" id="glyph-recent-header">',
      '  <span>Recent</span>',
      '</div>',
      '<div class="glyph-recent-row" id="glyph-recent-row"></div>',

      '</div>', // drawer-view__body
      '</div>', // glyph-drawer
    ].join("\n");

    // ── Element references ───────────────────────────────────────────────────

    var previewCanvas    = container.querySelector("#glyph-preview-canvas");
    var rendererSelect   = container.querySelector("#glyph-renderer-select");
    var colorSelect      = container.querySelector("#glyph-color-select");
    var sizeRange        = container.querySelector("#glyph-size-range");
    var sizeVal          = container.querySelector("#glyph-size-val");
    var noteStrip        = container.querySelector("#glyph-note-strip");
    var saveBtn          = container.querySelector("#glyph-save-btn");
    var exportBtn        = container.querySelector("#glyph-export-png");
    var libraryGrid      = container.querySelector("#glyph-library-grid");
    var recentRow        = container.querySelector("#glyph-recent-row");
    var recentHeader     = container.querySelector("#glyph-recent-header");

    // ── Restore controls from state ──────────────────────────────────────────

    rendererSelect.value = gs.renderer;
    colorSelect.value    = gs.colorMode;
    sizeRange.value      = gs.size;

    // ── Render functions ─────────────────────────────────────────────────────

    function renderPreview() {
      var ctx  = previewCanvas.getContext("2d");
      var size = previewCanvas.width;
      ctx.clearRect(0, 0, size, size);
      GR.renderGlyph(ctx, state.glyphs.activeNote, 0, 0, size, {
        renderer:  state.glyphs.renderer,
        colorMode: state.glyphs.colorMode,
        grid:      true,
      });
    }

    function renderLibrary() {
      libraryGrid.innerHTML = "";
      var saved = state.glyphLibrary.saved;

      if (!saved.length) {
        var hint = document.createElement("p");
        hint.className = "drawer-hint";
        hint.style.cssText = "grid-column:1/-1;opacity:.3;margin:4px 0;";
        hint.textContent = "No saved glyphs. Click + Save to add one.";
        libraryGrid.appendChild(hint);
        return;
      }

      saved.forEach(function (entry) {
        var card = _makeLibraryCard(
          entry,
          function onSelect(e) {
            // Load entry into active state
            state.glyphs.activeNote = e.note;
            state.glyphs.renderer   = e.renderer;
            state.glyphs.colorMode  = e.colorMode;
            // Sync controls
            rendererSelect.value = e.renderer;
            colorSelect.value    = e.colorMode;
            // Sync note strip
            noteStrip.querySelectorAll(".glyph-note-btn").forEach(function (b) {
              b.classList.toggle("active", b.dataset.note === e.note);
            });
            // Re-render preview
            renderPreview();
            // Highlight selected card
            libraryGrid.querySelectorAll(".glyph-lib-card").forEach(function (c) {
              c.classList.toggle("selected", c.dataset.entryId === e.id);
            });
          },
          function onDelete(id) {
            state.glyphLibrary.saved = state.glyphLibrary.saved.filter(function (e) {
              return e.id !== id;
            });
            _saveLibrary(state);
            renderLibrary();
          }
        );
        // Mark if matches current state
        if (
          entry.note      === state.glyphs.activeNote &&
          entry.renderer  === state.glyphs.renderer   &&
          entry.colorMode === state.glyphs.colorMode
        ) {
          card.classList.add("selected");
        }
        libraryGrid.appendChild(card);
      });
    }

    function renderRecent() {
      recentRow.innerHTML = "";
      var recent = state.glyphLibrary.recent;

      if (!recent.length) {
        recentHeader.style.display = "none";
        return;
      }
      recentHeader.style.display = "";

      recent.forEach(function (entry) {
        var thumb = _makeRecentThumb(entry, function onSelect(e) {
          state.glyphs.activeNote = e.note;
          state.glyphs.renderer   = e.renderer;
          state.glyphs.colorMode  = e.colorMode;
          rendererSelect.value = e.renderer;
          colorSelect.value    = e.colorMode;
          noteStrip.querySelectorAll(".glyph-note-btn").forEach(function (b) {
            b.classList.toggle("active", b.dataset.note === e.note);
          });
          renderPreview();
        });
        recentRow.appendChild(thumb);
      });
    }

    function pushToRecent(note, renderer, colorMode) {
      var recent = state.glyphLibrary.recent;
      // Deduplicate
      recent = recent.filter(function (e) {
        return !(e.note === note && e.renderer === renderer && e.colorMode === colorMode);
      });
      recent.unshift({ note: note, renderer: renderer, colorMode: colorMode });
      if (recent.length > 12) recent = recent.slice(0, 12);
      state.glyphLibrary.recent = recent;
      renderRecent();
    }

    // ── Event bindings ───────────────────────────────────────────────────────

    rendererSelect.addEventListener("change", function () {
      state.glyphs.renderer = rendererSelect.value;
      renderPreview();
    });

    colorSelect.addEventListener("change", function () {
      state.glyphs.colorMode = colorSelect.value;
      renderPreview();
    });

    sizeRange.addEventListener("input", function () {
      var v = Number(sizeRange.value);
      state.glyphs.size = v;
      if (sizeVal) sizeVal.textContent = v;
      // Preview always renders at canvas native size — size is export resolution
    });

    // Note strip — single delegated listener on the strip container
    noteStrip.addEventListener("click", function (e) {
      var btn = e.target.closest(".glyph-note-btn");
      if (!btn) return;
      var note = btn.dataset.note;
      state.glyphs.activeNote = note;
      noteStrip.querySelectorAll(".glyph-note-btn").forEach(function (b) {
        b.classList.toggle("active", b.dataset.note === note);
      });
      pushToRecent(note, state.glyphs.renderer, state.glyphs.colorMode);
      renderPreview();
    });

    saveBtn.addEventListener("click", function () {
      var gs2 = state.glyphs;
      var entry = {
        id:        "glyph_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
        note:      gs2.activeNote,
        renderer:  gs2.renderer,
        colorMode: gs2.colorMode,
        label:     "",
        tags:      [],
        createdAt: Date.now(),
      };
      state.glyphLibrary.saved.push(entry);
      _saveLibrary(state);
      renderLibrary();
    });

    exportBtn.addEventListener("click", function () {
      _exportPng(state.glyphs, GR);
    });

    // ── Initial renders ──────────────────────────────────────────────────────

    renderPreview();
    renderLibrary();
    renderRecent();

    // ── Suspend WOS shortcuts (takesFocus: true) ─────────────────────────────

    if (global._wos && global._wos.shortcuts) {
      global._wos.shortcuts.suspend();
    }
  }

  // ── Unmount ───────────────────────────────────────────────────────────────

  function unmount(container) {
    // Resume WOS keyboard shortcuts
    if (global._wos && global._wos.shortcuts) {
      global._wos.shortcuts.resume();
    }
    // State (state.glyphs, state.glyphLibrary) stays in main.js — survives unmount.
    // Container cleared to release DOM event listeners.
    container.innerHTML = "";
  }

  // ── Destroy ───────────────────────────────────────────────────────────────

  function destroy() {
    var state = global._wos && global._wos.state;
    if (state) _saveLibrary(state);
  }

  // ── PNG Export ────────────────────────────────────────────────────────────

  function _exportPng(gs, GR) {
    var size = gs.size || 256;
    var cvs  = document.createElement("canvas");
    cvs.width = cvs.height = size;
    GR.renderGlyph(cvs.getContext("2d"), gs.activeNote, 0, 0, size, {
      renderer:  gs.renderer,
      colorMode: gs.colorMode,
      grid:      false,
    });
    var link      = document.createElement("a");
    var noteName  = gs.activeNote.replace("#", "s");
    link.download = "wos-glyph-" + noteName + "-" + gs.renderer + "-" + gs.colorMode + ".png";
    link.href     = cvs.toDataURL("image/png");
    link.click();
  }

  // ── Registration ──────────────────────────────────────────────────────────

  SBE.DrawerSystem.registerDrawer({
    id:    "glyph",
    title: "GlyphLab",
    icon:  "✒",

    type:  "workspace",
    side:  "right",
    width: "wide",           // 560px — resolved by DrawerSystem width profiles

    persistent:          true,   // state.glyphs survives close/reopen
    closeOnOutsideClick: false,   // workspace: never close accidentally
    closeOnEscape:       true,

    takesFocus:    true,   // suspend WOS shortcuts while editor active
    capturesWheel: true,   // intent declared — DrawerSystem v2 enforcement
    capturesMidi:  false,

    mount:   mount,
    unmount: unmount,
    destroy: destroy,
  });

})(window);
