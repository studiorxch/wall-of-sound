// 0513_WOS_SymbolDrawer_v1.0.0
// SymbolLab — the symbolic authoring drawer for WOS.
// Registers itself with SBE.DrawerSystem as id:"symbols".
// Depends on: SBE.SymbolSystem, WOS.SymbolRenderer, SBE.Events.
//
// Mount pattern: render-inject (generates fresh HTML on each open).
// Drawer state (selected slot, active family tab) is module-level —
// survives close/reopen without needing persistent:true DOM movement.

(function initSymbolDrawer(global) {
  "use strict";

  var SBE = (global.SBE = global.SBE || {});
  var GLYPHLABURL = "http://localhost:5173";

  // ── Module-level state (survives drawer close/reopen) ─────────────────────
  // NOTE: active slot is NOT stored here — it lives in state.symbols.activeSlotKey.
  // Everything derives from that single authoritative source.
  var _activeFamily  = "typographic";
  var _mounted       = false;

  // Weak refs to mounted DOM nodes (cleared on unmount)
  var _previewCanvas = null;
  var _slotGrid      = null;
  var _setSelect     = null;

  // ── Helpers ───────────────────────────────────────────────────────────────

  function _SS()  { return SBE.SymbolSystem;  }
  function _SR()  { return global.WOS && global.WOS.SymbolRenderer; }

  // Single authoritative slot — reads from global state, falls back to "A".
  function _activeSlotKey() {
    return (global._wos && global._wos.state && global._wos.state.symbols &&
            global._wos.state.symbols.activeSlotKey) || "A";
  }

  // Write active slot to global state and refresh all dependent UI.
  function _setActiveSlotKey(key, container) {
    if (global._wos && global._wos.state && global._wos.state.symbols) {
      global._wos.state.symbols.activeSlotKey = key;
    }
    _syncSlotActive();
    // Update slot label
    var lbl = container && container.querySelector(".slab-slot-key-label");
    if (lbl) lbl.textContent = key === " " ? "SPACE" : key;
    // Update Place button label
    _updatePlaceBtn(container);
    _renderPreview();
  }

  function _updatePlaceBtn(container) {
    var btn = container && container.querySelector(".slab-btn-place");
    if (!btn) return;
    var key = _activeSlotKey();
    btn.textContent = '↓ Place “' + (key === " " ? "SPACE" : key) + '”';
  }

  function _activeSet() {
    return _SS() ? _SS().getActiveSet() : null;
  }

  // ── Preview canvas ────────────────────────────────────────────────────────

  function _renderPreview() {
    if (!_previewCanvas) return;
    var ctx  = _previewCanvas.getContext("2d");
    var size = _previewCanvas.width; // 128
    var SR   = _SR();
    var SS   = _SS();
    var set  = _activeSet();

    ctx.clearRect(0, 0, size, size);

    if (!set || !SR) {
      ctx.fillStyle = "rgba(255,255,255,0.04)";
      ctx.fillRect(0, 0, size, size);
      return;
    }

    var glyph = set.glyphs[_activeSlotKey()];
    var pal   = set.palette;

    // Background from palette
    if (pal.bgColor) {
      ctx.fillStyle = pal.bgColor;
      ctx.fillRect(0, 0, size, size);
    } else {
      ctx.fillStyle = "rgba(255,255,255,0.04)";
      ctx.fillRect(0, 0, size, size);
    }

    if (glyph && glyph.strokes && glyph.strokes.length > 0) {
      // Pad slightly inside cell
      var pad = size * 0.1;
      SR.renderGlyph(ctx, glyph, pad, pad, size - pad * 2, pal, { grid: true });
    } else {
      // Empty slot indicator
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth   = 1;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(4, 4, size - 8, size - 8);
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      ctx.font      = "11px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("empty", size / 2, size / 2);
    }
  }

  // ── Slot thumbnails ───────────────────────────────────────────────────────

  function _renderSlotThumb(canvas, glyph, palette) {
    if (!canvas) return;
    var ctx  = canvas.getContext("2d");
    var size = canvas.width;
    var SR   = _SR();
    ctx.clearRect(0, 0, size, size);

    if (!glyph || !glyph.strokes || !glyph.strokes.length) {
      ctx.fillStyle = "rgba(255,255,255,0.03)";
      ctx.fillRect(0, 0, size, size);
      return;
    }

    if (palette && palette.bgColor) {
      ctx.fillStyle = palette.bgColor;
      ctx.fillRect(0, 0, size, size);
    }

    if (SR) {
      var pad = size * 0.08;
      SR.renderGlyph(ctx, glyph, pad, pad, size - pad * 2, palette, {});
    }
  }

  // ── Slot grid rebuild ─────────────────────────────────────────────────────

  function _buildSlotGrid(container) {
    if (!container) return;
    container.innerHTML = "";

    var SS    = _SS();
    if (!SS) return;

    var slots = SS.getSlotsForFamily(_activeFamily);
    var set   = _activeSet();

    slots.forEach(function (key) {
      var btn  = document.createElement("button");
      btn.className = "slab-slot-btn" + (key === _activeSlotKey() ? " active" : "");
      btn.dataset.slot = key;
      btn.title = key;

      // Thumbnail canvas
      var canvas = document.createElement("canvas");
      canvas.width  = 36;
      canvas.height = 36;
      canvas.className = "slab-slot-thumb";
      btn.appendChild(canvas);

      // Label
      var label = document.createElement("span");
      label.className = "slab-slot-key";
      // Display the readable label: for typographic slots show char, for extended show index
      var display = key.startsWith("@") ? key.split(":")[1] : key;
      label.textContent = display === " " ? "·" : display;
      btn.appendChild(label);

      // Render thumb
      var glyph = set ? (set.glyphs[key] || null) : null;
      _renderSlotThumb(canvas, glyph, set ? set.palette : null);

      container.appendChild(btn);
    });
  }

  function _refreshAllThumbs() {
    if (!_slotGrid) return;
    var SS  = _SS();
    var set = _activeSet();
    _slotGrid.querySelectorAll(".slab-slot-btn").forEach(function (btn) {
      var key    = btn.dataset.slot;
      var canvas = btn.querySelector("canvas");
      var glyph  = set ? (set.glyphs[key] || null) : null;
      _renderSlotThumb(canvas, glyph, set ? set.palette : null);
    });
  }

  function _syncSlotActive() {
    if (!_slotGrid) return;
    _slotGrid.querySelectorAll(".slab-slot-btn").forEach(function (btn) {
      btn.classList.toggle("active", btn.dataset.slot === _activeSlotKey());
    });
  }

  // ── Set selector sync ─────────────────────────────────────────────────────

  function _buildSetOptions() {
    if (!_setSelect) return;
    var SS   = _SS();
    var sets = SS ? SS.getAllSets() : [];
    var cur  = _activeSet();
    _setSelect.innerHTML = "";
    if (!sets.length) {
      var opt = document.createElement("option");
      opt.textContent = "(no sets)";
      opt.value = "";
      _setSelect.appendChild(opt);
      return;
    }
    sets.forEach(function (set) {
      var opt = document.createElement("option");
      opt.value = set.id;
      opt.textContent = set.name + (set.meta && set.meta.pinned ? " ★" : "");
      if (cur && set.id === cur.id) opt.selected = true;
      _setSelect.appendChild(opt);
    });
  }

  // ── GlyphLab bridge ───────────────────────────────────────────────────────

  function _openInGlyphLab() {
    var SS  = _SS();
    var set = _activeSet();
    if (!SS || !set) return;
    var json = SS.exportSet(set.id);
    if (!json) return;
    localStorage.setItem("glyphlab-project", json);
    window.open(GLYPHLABURL, "_blank");
  }

  function _syncFromGlyphLab() {
    var SS  = _SS();
    var set = _activeSet();
    if (!SS || !set) return;
    var raw = localStorage.getItem("glyphlab-project");
    if (!raw) {
      alert("No GlyphLab data found in localStorage. Open GlyphLab, make changes, then come back and sync.");
      return;
    }
    var imported = SS.importFromGlyphLab(raw, {
      sourceFile: (set.meta && set.meta.sourceFile) || set.name,
      name: set.name,
      family: set.family,
    });
    if (imported) {
      // If the import created a new set (different id), activate it
      if (imported.id !== set.id) {
        SS.setActiveSet(imported.id);
        _buildSetOptions();
      }
      _buildSlotGrid(_slotGrid);
      _renderPreview();
    }
  }

  // ── Full drawer HTML ──────────────────────────────────────────────────────

  function _buildUI(container) {
    var SS = _SS();
    if (!SS) {
      container.innerHTML = '<div class="slab-error">SymbolSystem not loaded.</div>';
      return;
    }

    var PRESET_NAMES    = SS.getPalettePresetNames();
    var FAMILY_TABS     = [
      { id: "typographic", label: "ABC",  title: "Typographic" },
      { id: "iconic",      label: "✦",    title: "Iconic" },
      { id: "musical",     label: "♩",    title: "Musical" },
      { id: "transport",   label: "⬡",    title: "Transport" },
      { id: "territorial", label: "✗",    title: "Territorial" },
      { id: "procedural",  label: "◈",    title: "Procedural" },
    ];
    var set = _activeSet();
    var curPalette = (set && set.palette) ? set.palette : SS.getPalettePreset("braun");

    container.innerHTML = [
      '<div class="slab-root">',

        // ── Set toolbar ───────────────────────────────────────────────────
        '<div class="slab-set-bar">',
          '<select class="slab-set-select" title="Active symbol set"></select>',
          '<button class="slab-btn slab-btn-new" title="Create new set">+ New</button>',
          '<button class="slab-btn slab-btn-import" title="Import from file">↑ Import</button>',
          '<input type="file" class="slab-import-input" accept="application/json" style="display:none">',
          '<button class="slab-btn slab-btn-menu" title="Set options">≡</button>',
        '</div>',

        // ── Body: preview + slot grid ─────────────────────────────────────
        '<div class="slab-body">',

          // Preview column
          '<div class="slab-preview-col">',
            '<div class="slab-preview-wrap">',
              '<canvas class="slab-preview-canvas" width="128" height="128"></canvas>',
            '</div>',
            '<div class="slab-slot-label">',
              '<span class="slab-slot-key-label">', _activeSlotKey() === " " ? "SPACE" : _activeSlotKey(), '</span>',
            '</div>',
          '</div>',

          // Slot grid column
          '<div class="slab-slot-col">',
            // Family tabs
            '<div class="slab-family-tabs">',
              FAMILY_TABS.map(function (t) {
                return '<button class="slab-tab' + (_activeFamily === t.id ? " active" : "") +
                  '" data-family="' + t.id + '" title="' + t.title + '">' + t.label + '</button>';
              }).join(""),
            '</div>',
            // Slot grid (populated by _buildSlotGrid)
            '<div class="slab-slot-grid"></div>',
          '</div>',

        '</div>', // .slab-body

        // ── GlyphLab bridge ───────────────────────────────────────────────
        '<div class="slab-bridge-bar">',
          '<span class="slab-section-label">Edit</span>',
          '<button class="slab-btn slab-btn-open-gl">Open in GlyphLab ↗</button>',
          '<button class="slab-btn slab-btn-sync-gl">Sync from GlyphLab</button>',
        '</div>',

        // ── Palette ───────────────────────────────────────────────────────
        '<div class="slab-palette-bar">',
          '<span class="slab-section-label">Palette</span>',
          '<select class="slab-palette-preset" title="Palette preset">',
            PRESET_NAMES.map(function (n) {
              return '<option value="' + n + '"' +
                (set && set.palette && set.palette._preset === n ? " selected" : "") +
                '>' + n + '</option>';
            }).join(""),
          '</select>',
          '<label class="slab-color-label" title="Stroke color">',
            '<span>S</span>',
            '<input type="color" class="slab-color-stroke" value="' + (curPalette.strokeColor || "#000000") + '">',
          '</label>',
          '<label class="slab-color-label" title="Fill color">',
            '<span>F</span>',
            '<input type="color" class="slab-color-fill" value="' + (curPalette.fillColor || "#000000") + '">',
          '</label>',
          '<select class="slab-mode-select" title="Render mode">',
            ['stroke','fill','fill+stroke','inverse'].map(function (m) {
              return '<option value="' + m + '"' + (curPalette.mode === m ? " selected" : "") + '>' + m + '</option>';
            }).join(""),
          '</select>',
        '</div>',

        // ── Place toolbar ─────────────────────────────────────────────────
        '<div class="slab-place-bar">',
          '<span class="slab-section-label">Place</span>',
          '<button class="slab-btn slab-btn-place" title="Arm slot for world placement — then click canvas">',
            '↓ Place "', _activeSlotKey() === " " ? "SPACE" : _activeSlotKey(), '"',
          '</button>',
        '</div>',

      '</div>', // .slab-root
    ].join("");

    // Wire up DOM references
    _previewCanvas = container.querySelector(".slab-preview-canvas");
    _slotGrid      = container.querySelector(".slab-slot-grid");
    _setSelect     = container.querySelector(".slab-set-select");

    // Populate set options + slot grid
    _buildSetOptions();
    _buildSlotGrid(_slotGrid);
    _renderPreview();

    // ── Event delegation ──────────────────────────────────────────────────

    // Set selector change
    _setSelect.addEventListener("change", function () {
      var SS = _SS();
      if (SS) SS.setActiveSet(this.value || null);
      _buildSetOptions();
      _buildSlotGrid(_slotGrid);
      _syncSlotActive();
      _renderPreview();
    });

    // New set button
    container.querySelector(".slab-btn-new").addEventListener("click", function () {
      var SS = _SS();
      if (!SS) return;
      var name = prompt("New symbol set name:", "Untitled Set");
      if (!name) return;
      var family = prompt("Family (typographic / iconic / musical / transport / territorial / procedural):", "typographic");
      if (!family) family = "typographic";
      var created = SS.createSet({ name: name, family: family });
      SS.setActiveSet(created.id);
      _buildSetOptions();
      _buildSlotGrid(_slotGrid);
      _renderPreview();
    });

    // Import file
    var importInput = container.querySelector(".slab-import-input");
    container.querySelector(".slab-btn-import").addEventListener("click", function () {
      importInput.click();
    });
    importInput.addEventListener("change", function () {
      var file = this.files && this.files[0];
      if (!file) return;
      var SS = _SS();
      if (!SS) return;
      SS.importFromFile(file, function (set) {
        if (!set) { alert("Import failed — check console."); return; }
        SS.setActiveSet(set.id);
        _buildSetOptions();
        _buildSlotGrid(_slotGrid);
        _renderPreview();
      });
      this.value = "";
    });

    // Set menu (≡)
    container.querySelector(".slab-btn-menu").addEventListener("click", function () {
      _showSetMenu(this);
    });

    // Family tabs
    container.querySelector(".slab-family-tabs").addEventListener("click", function (e) {
      var btn = e.target.closest(".slab-tab");
      if (!btn) return;
      _activeFamily = btn.dataset.family;
      container.querySelectorAll(".slab-tab").forEach(function (t) {
        t.classList.toggle("active", t.dataset.family === _activeFamily);
      });
      _buildSlotGrid(_slotGrid);
    });

    // Slot grid clicks (delegated)
    // Writing to state.symbols.activeSlotKey keeps preview, label, and Place button in sync.
    _slotGrid.addEventListener("click", function (e) {
      var btn = e.target.closest(".slab-slot-btn");
      if (!btn) return;
      _setActiveSlotKey(btn.dataset.slot, container);
    });

    // GlyphLab bridge buttons
    container.querySelector(".slab-btn-open-gl").addEventListener("click", _openInGlyphLab);
    container.querySelector(".slab-btn-sync-gl").addEventListener("click", _syncFromGlyphLab);

    // Palette preset
    container.querySelector(".slab-palette-preset").addEventListener("change", function () {
      var SS  = _SS();
      var set = _activeSet();
      if (!SS || !set) return;
      var preset = SS.getPalettePreset(this.value);
      if (!preset) return;
      preset._preset = this.value;
      set.palette = preset;
      SS.registerSet(set);
      // Sync color inputs
      container.querySelector(".slab-color-stroke").value = preset.strokeColor || "#000000";
      container.querySelector(".slab-color-fill").value   = preset.fillColor || "#000000";
      container.querySelector(".slab-mode-select").value  = preset.mode || "stroke";
      _refreshAllThumbs();
      _renderPreview();
    });

    // Stroke color
    container.querySelector(".slab-color-stroke").addEventListener("input", function () {
      var set = _activeSet();
      if (!set) return;
      set.palette.strokeColor = this.value;
      var SS = _SS();
      if (SS) SS.registerSet(set);
      _refreshAllThumbs();
      _renderPreview();
    });

    // Fill color
    container.querySelector(".slab-color-fill").addEventListener("input", function () {
      var set = _activeSet();
      if (!set) return;
      set.palette.fillColor = this.value;
      var SS = _SS();
      if (SS) SS.registerSet(set);
      _refreshAllThumbs();
      _renderPreview();
    });

    // Mode
    container.querySelector(".slab-mode-select").addEventListener("change", function () {
      var set = _activeSet();
      if (!set) return;
      set.palette.mode = this.value;
      var SS = _SS();
      if (SS) SS.registerSet(set);
      _refreshAllThumbs();
      _renderPreview();
    });

    // Place button — arms placement mode on the canvas
    container.querySelector(".slab-btn-place").addEventListener("click", function () {
      var SS  = _SS();
      var set = _activeSet();
      if (!SS || !set) return;
      var wos = global._wos;
      if (!wos || !wos.state) return;

      // Commit active slot to global authoritative state
      var slotKey = _activeSlotKey();
      wos.state.symbols.activeSetId  = set.id;
      wos.state.symbols.activeSlotKey = slotKey;

      // Switch to symbol-place tool
      wos.state.tool = "symbol-place";
      if (typeof wos.syncUI === "function") wos.syncUI();

      // Defer closeDrawer so the click event fully completes before the container
      // is torn down. Prevents mid-event DOM destruction.
      setTimeout(function () {
        if (SBE.DrawerSystem) SBE.DrawerSystem.closeDrawer();
      }, 0);
    });

    // Listen for external SymbolSystem events (import, activation)
    if (SBE.Events) {
      SBE.Events.on("symbols:import-complete", _onImportComplete);
      SBE.Events.on("symbols:set-activated",   _onSetActivated);
      SBE.Events.on("symbols:glyph-changed",   _onGlyphChanged);
    }
  }

  // ── Set menu ──────────────────────────────────────────────────────────────

  function _showSetMenu(anchor) {
    // Remove any existing menu
    var existing = document.querySelector(".slab-context-menu");
    if (existing) existing.remove();

    var SS  = _SS();
    var set = _activeSet();
    if (!SS) return;

    var menu = document.createElement("div");
    menu.className = "slab-context-menu";

    var items = [
      { label: "Rename…",     action: "rename"    },
      { label: "Duplicate",   action: "duplicate" },
      { label: "Export JSON", action: "export-json" },
      { label: "Export PNG sheet", action: "export-png" },
      { label: "Delete",      action: "delete",  disabled: !set || (set.meta && set.meta.pinned) },
    ];

    items.forEach(function (item) {
      var btn = document.createElement("button");
      btn.className = "slab-cmenu-item" + (item.disabled ? " disabled" : "");
      btn.textContent = item.label;
      if (!item.disabled) {
        btn.addEventListener("click", function () {
          menu.remove();
          _handleMenuAction(item.action);
        });
      }
      menu.appendChild(btn);
    });

    document.body.appendChild(menu);
    var r = anchor.getBoundingClientRect();
    menu.style.top  = r.bottom + 4 + "px";
    menu.style.left = r.left + "px";

    // Close on outside click
    setTimeout(function () {
      document.addEventListener("pointerdown", function dismiss(e) {
        if (!menu.contains(e.target)) {
          menu.remove();
          document.removeEventListener("pointerdown", dismiss);
        }
      });
    }, 0);
  }

  function _handleMenuAction(action) {
    var SS  = _SS();
    var set = _activeSet();
    if (!SS) return;

    if (action === "rename") {
      if (!set) return;
      var name = prompt("Rename set:", set.name);
      if (name) {
        SS.renameSet(set.id, name);
        _buildSetOptions();
      }

    } else if (action === "duplicate") {
      if (!set) return;
      var copy = SS.duplicateSet(set.id);
      if (copy) {
        SS.setActiveSet(copy.id);
        _buildSetOptions();
        _buildSlotGrid(_slotGrid);
        _renderPreview();
      }

    } else if (action === "export-json") {
      if (!set) return;
      var json = SS.exportSet(set.id);
      if (!json) return;
      var blob = new Blob([json], { type: "application/json" });
      var url  = URL.createObjectURL(blob);
      var a    = document.createElement("a");
      a.href      = url;
      a.download  = (set.name || "symbol-set") + ".json";
      a.click();
      URL.revokeObjectURL(url);

    } else if (action === "export-png") {
      if (!set) return;
      SS.exportSetPNG(set.id, 64, function (blob) {
        if (!blob) return;
        var url = URL.createObjectURL(blob);
        var a   = document.createElement("a");
        a.href  = url;
        a.download = (set.name || "symbol-set") + "-sheet.png";
        a.click();
        URL.revokeObjectURL(url);
      });

    } else if (action === "delete") {
      if (!set) return;
      if (!confirm('Delete "' + set.name + '"? This cannot be undone.')) return;
      var prevId = set.id;
      SS.deleteSet(prevId);
      // Activate another set
      var remaining = SS.getAllSets();
      if (remaining.length) {
        SS.setActiveSet(remaining[0].id);
      } else {
        SS.setActiveSet(null);
      }
      _buildSetOptions();
      _buildSlotGrid(_slotGrid);
      _renderPreview();
    }
  }

  // ── Event handlers ────────────────────────────────────────────────────────

  function _onImportComplete(payload) {
    _buildSetOptions();
    _buildSlotGrid(_slotGrid);
    _renderPreview();
  }

  function _onSetActivated(payload) {
    _buildSetOptions();
    _buildSlotGrid(_slotGrid);
    _renderPreview();
  }

  function _onGlyphChanged(payload) {
    if (payload.slotKey === _activeSlotKey()) _renderPreview();
    _refreshAllThumbs();
  }

  // ── Mount / Unmount ───────────────────────────────────────────────────────

  function mount(container) {
    _mounted = true;
    _buildUI(container);

    // Suspend WOS shortcuts while SymbolLab has focus
    if (global._wos && global._wos.shortcuts) {
      global._wos.shortcuts.suspend();
    }
    console.log("[SymbolDrawer] mounted");
  }

  function unmount(container) {
    _mounted = false;

    // Remove event listeners
    if (SBE.Events) {
      SBE.Events.off("symbols:import-complete", _onImportComplete);
      SBE.Events.off("symbols:set-activated",   _onSetActivated);
      SBE.Events.off("symbols:glyph-changed",   _onGlyphChanged);
    }

    // Clear DOM refs
    _previewCanvas = null;
    _slotGrid      = null;
    _setSelect     = null;

    container.innerHTML = "";

    // Resume WOS shortcuts
    if (global._wos && global._wos.shortcuts) {
      global._wos.shortcuts.resume();
    }
    console.log("[SymbolDrawer] unmounted");
  }

  // ── Registration ──────────────────────────────────────────────────────────

  // Register once DrawerSystem is available — it loads before us.
  function _register() {
    if (!SBE.DrawerSystem) {
      console.warn("[SymbolDrawer] DrawerSystem not found — registration skipped");
      return;
    }
    SBE.DrawerSystem.registerDrawer({
      id:                 "symbols",
      title:              "SymbolLab",
      side:               "right",
      width:              "wide",        // 560px
      closeOnOutsideClick: false,
      takesFocus:         true,
      capturesWheel:      true,
      mount:              mount,
      unmount:            unmount,
    });
    console.log("[SymbolDrawer] registered with DrawerSystem");
  }

  _register();

  console.log("[WOS SymbolDrawer] Loaded — v1.0.0");
})(window);
