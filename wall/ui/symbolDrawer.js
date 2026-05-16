// 0513_WOS_SymbolDrawer_v2.3.0
// SymbolLab — symbolic authoring drawer with live preview system.
// Registers itself with SBE.DrawerSystem as id:"symbols".
// Depends on: SBE.SymbolSystem, WOS.SymbolRenderer, WOS.SymbolPreviewRenderer, SBE.Events.
//
// Mount pattern: render-inject (generates fresh HTML on each open).
// Drawer state (active family, preview mode) is module-level —
// survives close/reopen without needing persistent:true DOM movement.
//
// Preview modes: glyph | word | poem | pattern | world
// All modes route through WOS.SymbolPreviewRenderer (except glyph → direct SR call).
// State lives in global._wos.state.symbolPreview — persisted with scene.

(function initSymbolDrawer(global) {
  "use strict";

  var SBE = (global.SBE = global.SBE || {});
  var GLYPHLABURL = "http://localhost:5173";

  // Semantic display names for extended slot keys (F2 — slot label system)
  var SLOT_LABELS = {
    "@icon:0":"home",   "@icon:1":"person", "@icon:2":"signal", "@icon:3":"star",
    "@icon:4":"heart",  "@icon:5":"warn",   "@icon:6":"camera", "@icon:7":"phone",
    "@music:0":"kick",  "@music:1":"snare", "@music:2":"hat",   "@music:3":"loop",
    "@music:4":"rest",  "@music:5":"accent","@music:6":"tempo", "@music:7":"pulse",
    "@transport:0":"north","@transport:1":"south","@transport:2":"east","@transport:3":"west",
    "@transport:4":"turn-l","@transport:5":"turn-r","@transport:6":"merge","@transport:7":"stop",
    "@transport:8":"exit","@transport:9":"stn",
    "@mark:0":"zone",   "@mark:1":"wall",   "@mark:2":"gate",   "@mark:3":"core",
    "@mark:4":"field",  "@mark:5":"edge",   "@mark:6":"block",  "@mark:7":"sector",
    "@proc:0":"spawn",  "@proc:1":"mirror", "@proc:2":"stack",  "@proc:3":"shift",
    "@proc:4":"repeat", "@proc:5":"cut",    "@proc:6":"link",   "@proc:7":"noise",
    "@proc:8":"flow",   "@proc:9":"seed",   "@proc:10":"gate",  "@proc:11":"pulse",
  };

  // ── Module-level state (survives drawer close/reopen) ─────────────────────
  // Slot key lives in state.symbols.activeSlotKey — not here.
  var _activeFamily  = "typographic";
  var _previewMode   = "glyph";         // synced to state.symbolPreview.mode on mount
  var _mounted       = false;

  // ── Glyph Construction state (module-level, survives close/reopen) ─────────
  var _cState        = null;   // WOS.GlyphConstructor.createState() — lazy init
  var _cDrag         = null;   // active drag: { phase, tool, sx, sy, ex, ey, objId, preview }
  var _cHover        = null;   // id of hovered object (erase/select hover highlight)
  var _rafPending    = false;  // RAF throttle flag
  var _liveCanvas    = null;   // secondary live-preview canvas (GLYPH mode only)
  var _liveMode      = "word"; // which context to show in live preview
  var _clipboard     = null;   // copy/paste buffer: array of object clones

  // RAF handle for world preview animation
  var _worldRAF      = null;
  var _worldT        = 0;               // accumulated time in seconds
  var _worldLastMs   = 0;              // timestamp of last frame

  // Workbench-mode secondary preview (column 3)
  var _wbPreviewCanvas   = null;
  var _wbModeControls    = null;
  var _wbPreviewMode     = "word";  // current mode shown in workbench preview column
  var _wbWorldRAF        = null;
  var _wbWorldT          = 0;
  var _wbWorldLastMs     = 0;

  // Mounted DOM refs (cleared on unmount)
  var _previewCanvas = null;
  var _modeControls  = null;
  var _slotGrid      = null;
  var _setSelect     = null;

  // ── System refs ───────────────────────────────────────────────────────────

  function _SS()  { return SBE.SymbolSystem;                         }
  function _SR()  { return global.WOS && global.WOS.SymbolRenderer;  }
  function _SPR() { return global.WOS && global.WOS.SymbolPreviewRenderer; }

  // ── State accessors ───────────────────────────────────────────────────────

  function _wosState() {
    return global._wos && global._wos.state;
  }

  function _activeSlotKey() {
    var st = _wosState();
    return (st && st.symbols && st.symbols.activeSlotKey) || "A";
  }

  function _activeSet() {
    return _SS() ? _SS().getActiveSet() : null;
  }

  // Read preview sub-state, with fallback defaults.
  function _pvState(mode) {
    var st  = _wosState();
    var pv  = st && st.symbolPreview;
    if (!pv) return {};
    return pv[mode] || {};
  }

  function _pvMode() {
    var st = _wosState();
    return (st && st.symbolPreview && st.symbolPreview.mode) || _previewMode;
  }

  function _setPvMode(mode) {
    _previewMode = mode;
    var st = _wosState();
    if (st && st.symbolPreview) st.symbolPreview.mode = mode;
  }

  function _setPvField(mode, key, value) {
    var st = _wosState();
    if (!st || !st.symbolPreview || !st.symbolPreview[mode]) return;
    st.symbolPreview[mode][key] = value;
  }

  // ── Active slot write ─────────────────────────────────────────────────────

  function _setActiveSlotKey(key, container) {
    var st = _wosState();
    if (st && st.symbols) st.symbols.activeSlotKey = key;
    // Clear selection when switching slots
    if (_cState) _cState.selection = [];
    _syncSlotActive();
    _updatePlaceBtn(container);
    _buildModeControls(container);
    _renderActivePreview();
  }

  function _updatePlaceBtn(container) {
    var btn = container && container.querySelector(".slab-btn-place");
    if (!btn) return;
    var key = _activeSlotKey();
    btn.textContent = "↓ Place “" + (key === " " ? "SPACE" : key) + "”";
  }

  // ── Preview rendering ─────────────────────────────────────────────────────

  function _clearPreview(ctx) {
    if (!ctx) return;
    var cv = ctx.canvas;
    ctx.clearRect(0, 0, cv.width, cv.height);
    // Subtle background
    ctx.fillStyle = "rgba(255,255,255,0.03)";
    ctx.fillRect(0, 0, cv.width, cv.height);
  }

  function _renderActivePreview() {
    if (!_previewCanvas) return;
    _stopWorldAnim();

    var ctx  = _previewCanvas.getContext("2d");
    var mode = _previewMode;
    _clearPreview(ctx);

    var set = _activeSet();
    if (!set) {
      _renderEmpty(ctx, "no set");
      _renderWbPreview();
      return;
    }

    if (mode === "glyph") {
      _renderGlyphMode(ctx, set);
    } else if (mode === "word") {
      _renderWordMode(ctx, set);
    } else if (mode === "poem") {
      _renderPoemMode(ctx, set);
    } else if (mode === "pattern") {
      _renderPatternMode(ctx, set);
    } else if (mode === "world") {
      _startWorldAnim(set);
    }

    // Keep workbench preview column in sync
    _renderWbPreview();
  }

  function _renderEmpty(ctx, label) {
    var cw = ctx.canvas.width, ch = ctx.canvas.height;
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth   = 1;
    ctx.setLineDash([3, 4]);
    ctx.strokeRect(8, 8, cw - 16, ch - 16);
    ctx.setLineDash([]);
    ctx.fillStyle    = "rgba(255,255,255,0.2)";
    ctx.font         = "10px monospace";
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label || "empty", cw / 2, ch / 2);
  }

  // ── GLYPH mode — construction canvas ─────────────────────────────────────

  function _gcState() {
    var GC = global.WOS && global.WOS.GlyphConstructor;
    if (!GC) return null;
    if (!_cState) _cState = GC.createState();
    return _cState;
  }

  function _gcObjects() {
    var set = _activeSet();
    if (!set) return null;
    var key = _activeSlotKey();
    if (!set.glyphs[key]) set.glyphs[key] = { strokes: [], objects: [] };
    if (!set.glyphs[key].objects) set.glyphs[key].objects = [];
    return set.glyphs[key].objects;
  }

  function _renderGlyphMode(ctx, set) {
    _renderConstruction();
  }

  // ── HiDPI canvas setup ───────────────────────────────────────────────────

  function _resizeHiDPI(canvas) {
    if (!canvas) return 1;
    var rect = canvas.getBoundingClientRect();
    var dpr  = window.devicePixelRatio || 1;
    var w    = Math.round(rect.width  * dpr);
    var h    = Math.round(rect.height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width  = w;
      canvas.height = h;
    }
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    return dpr;
  }

  // Logical size (CSS px) of the construction canvas.
  function _cLogicalSize() {
    if (!_previewCanvas) return 240;
    return _previewCanvas.getBoundingClientRect().width || 240;
  }

  // ── Transform handle geometry ────────────────────────────────────────────

  var _HANDLE_IDS = ["nw","n","ne","e","se","s","sw","w","rot"];

  function _getHandles(sb, lsz) {
    var x = sb.x, y = sb.y, w = sb.w, h = sb.h;
    var ROT_GAP = 18 / lsz;  // normalized distance above top for rotation nub
    return [
      { id:"nw",  nx: x,         ny: y,         cursor:"nw-resize" },
      { id:"n",   nx: x + w/2,   ny: y,         cursor:"n-resize"  },
      { id:"ne",  nx: x + w,     ny: y,         cursor:"ne-resize" },
      { id:"e",   nx: x + w,     ny: y + h/2,   cursor:"e-resize"  },
      { id:"se",  nx: x + w,     ny: y + h,     cursor:"se-resize" },
      { id:"s",   nx: x + w/2,   ny: y + h,     cursor:"s-resize"  },
      { id:"sw",  nx: x,         ny: y + h,     cursor:"sw-resize" },
      { id:"w",   nx: x,         ny: y + h/2,   cursor:"w-resize"  },
      { id:"rot", nx: x + w/2,   ny: y - ROT_GAP, cursor:"grab"    },
    ].map(function(h) { return Object.assign(h, { px: h.nx * lsz, py: h.ny * lsz }); });
  }

  function _hitHandle(handles, nx, ny, lsz) {
    var thresh = 10 / lsz;
    for (var i = 0; i < handles.length; i++) {
      if (Math.hypot(nx - handles[i].nx, ny - handles[i].ny) < thresh) return handles[i];
    }
    return null;
  }

  // ── Construction canvas render ────────────────────────────────────────────

  // Full render: grid + objects + overlays. Always call this, never raw ctx.
  function _renderConstruction() {
    if (!_previewCanvas) return;
    var dpr  = _resizeHiDPI(_previewCanvas);
    var cs   = _gcState();
    var objs = _gcObjects();
    if (!cs || !objs) return;

    var ctx = _previewCanvas.getContext("2d");
    var lsz = _cLogicalSize(); // CSS px = logical coordinate space

    ctx.clearRect(0, 0, lsz, lsz);
    ctx.fillStyle = "rgba(255,255,255,0.03)";
    ctx.fillRect(0, 0, lsz, lsz);

    // Dot grid
    var divs = cs.gridDivisions || 16;
    var step = lsz / divs;
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    for (var gx = 0; gx <= divs; gx++) {
      for (var gy = 0; gy <= divs; gy++) {
        ctx.beginPath();
        ctx.arc(gx * step, gy * step, 1 / dpr + 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    var SR  = _SR();
    var set = _activeSet();
    var pal = set ? set.palette : null;

    // Hover glow (erase/select mode)
    if (_cHover && (cs.tool === "erase" || cs.tool === "select")) {
      var hObj = _findObj(objs, _cHover);
      if (hObj) {
        var GCh = global.WOS && global.WOS.GlyphConstructor;
        var hb  = GCh ? GCh.objBounds(hObj) : null;
        if (hb) {
          ctx.save();
          ctx.shadowColor  = cs.tool === "erase" ? "rgba(255,80,80,0.9)" : "rgba(80,200,255,0.7)";
          ctx.shadowBlur   = 12;
          ctx.strokeStyle  = cs.tool === "erase" ? "rgba(255,80,80,0.5)" : "rgba(80,200,255,0.4)";
          ctx.lineWidth    = 1;
          ctx.strokeRect(hb.x * lsz - 4, hb.y * lsz - 4,
                         hb.w * lsz + 8, hb.h * lsz + 8);
          ctx.restore();
        }
      }
    }

    // All objects
    if (SR && objs.length) SR.renderGlyphObjects(ctx, objs, 0, 0, lsz, pal);

    // Preview object during draw
    if (_cDrag && _cDrag.phase === "draw" && _cDrag.preview) {
      if (SR) SR.renderGlyphObject(ctx, _cDrag.preview, 0, 0, lsz, pal);
    }

    // Marquee
    if (_cDrag && _cDrag.phase === "marquee") {
      var mr = _marqueeRect(_cDrag);
      ctx.save();
      ctx.fillStyle   = "rgba(80,160,255,0.08)";
      ctx.strokeStyle = "rgba(80,160,255,0.7)";
      ctx.lineWidth   = 1;
      ctx.setLineDash([3, 3]);
      ctx.fillRect  (mr.x * lsz, mr.y * lsz, mr.w * lsz, mr.h * lsz);
      ctx.strokeRect(mr.x * lsz, mr.y * lsz, mr.w * lsz, mr.h * lsz);
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Selection outlines + transform handles
    var GCs = global.WOS && global.WOS.GlyphConstructor;
    if (cs.selection.length && GCs) {
      // Per-object dashed outline
      cs.selection.forEach(function (id) {
        var obj = _findObj(objs, id);
        if (!obj) return;
        var b   = GCs.objBounds(obj);
        var pad = 2;
        ctx.save();
        ctx.strokeStyle = "rgba(80,200,255,0.5)";
        ctx.lineWidth   = 1;
        ctx.setLineDash([2, 2]);
        ctx.strokeRect(b.x * lsz - pad, b.y * lsz - pad,
                       b.w * lsz + pad * 2, b.h * lsz + pad * 2);
        ctx.setLineDash([]);
        ctx.restore();
      });

      // Combined selection bounds + transform handles (select tool only)
      if (cs.tool === "select") {
        var sb = GCs.selectionBounds(objs, cs.selection);
        if (sb) {
          var PAD = 4;
          ctx.save();
          ctx.strokeStyle = "rgba(80,200,255,0.9)";
          ctx.lineWidth   = 1;
          ctx.setLineDash([4, 3]);
          ctx.strokeRect(sb.x * lsz - PAD, sb.y * lsz - PAD,
                         sb.w * lsz + PAD * 2, sb.h * lsz + PAD * 2);
          ctx.setLineDash([]);

          // Rotation nub stem
          var midX = (sb.x + sb.w / 2) * lsz, topY = sb.y * lsz - PAD;
          var rotY  = topY - 14;
          ctx.strokeStyle = "rgba(80,200,255,0.5)";
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(midX, topY); ctx.lineTo(midX, rotY); ctx.stroke();

          // Handles
          var hls = _getHandles({ x: sb.x - PAD/lsz, y: sb.y - PAD/lsz,
                                   w: sb.w + PAD*2/lsz, h: sb.h + PAD*2/lsz }, lsz);
          hls.forEach(function (h) {
            ctx.fillStyle   = "rgba(255,255,255,0.9)";
            ctx.strokeStyle = "rgba(80,200,255,0.9)";
            ctx.lineWidth   = 1;
            if (h.id === "rot") {
              ctx.beginPath();
              ctx.arc(h.px, h.py, 4, 0, Math.PI * 2);
              ctx.fill(); ctx.stroke();
            } else {
              ctx.fillRect(h.px - 3, h.py - 3, 6, 6);
              ctx.strokeRect(h.px - 3, h.py - 3, 6, 6);
            }
          });
          ctx.restore();
        }
      }
    }

    _rafPending = false;
    _refreshLivePreview();
  }

  function _scheduleRender() {
    if (_rafPending) return;
    _rafPending = true;
    requestAnimationFrame(_renderConstruction);
  }

  function _findObj(objs, id) {
    for (var i = 0; i < objs.length; i++) {
      if (objs[i].id === id) return objs[i];
    }
    return null;
  }

  // ── Undo ─────────────────────────────────────────────────────────────────

  function _pushHistory() {
    var cs   = _gcState();
    var objs = _gcObjects();
    if (!cs || !objs) return;
    var snapshot = JSON.parse(JSON.stringify(objs));
    // Trim forward history if we branched
    cs.history = cs.history.slice(0, cs.historyIndex + 1);
    cs.history.push(snapshot);
    if (cs.history.length > 50) cs.history.shift();
    cs.historyIndex = cs.history.length - 1;
  }

  function _undo() {
    var cs  = _gcState();
    var set = _activeSet();
    if (!cs || !set) return;
    if (cs.historyIndex < 0) return;
    var prev = cs.history[cs.historyIndex];
    cs.historyIndex--;
    var key  = _activeSlotKey();
    if (!set.glyphs[key]) set.glyphs[key] = { strokes: [], objects: [] };
    set.glyphs[key].objects = JSON.parse(JSON.stringify(prev));
    cs.selection = [];
    _cSave();
    _renderConstruction();
  }

  // ── Coordinate utilities ─────────────────────────────────────────────────

  function _normPt(e, canvas) {
    var r = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (e.clientY - r.top)  / r.height)),
    };
  }

  function _marqueeRect(drag) {
    return {
      x: Math.min(drag.sx, drag.ex),  y: Math.min(drag.sy, drag.ey),
      w: Math.abs(drag.ex - drag.sx), h: Math.abs(drag.ey - drag.sy),
    };
  }

  // ── Preview object builder ────────────────────────────────────────────────

  function _buildPreview(drag, cs) {
    var GC = global.WOS && global.WOS.GlyphConstructor;
    if (!GC) return null;
    var sx = drag.sx, sy = drag.sy, ex = drag.ex, ey = drag.ey;
    var props;
    var shiftHeld = drag.shiftHeld;

    if (drag.tool === "line") {
      if (shiftHeld) {
        // Constrain to 45° increments
        var adx = ex - sx, ady = ey - sy;
        var ang = Math.round(Math.atan2(ady, adx) / (Math.PI / 4)) * (Math.PI / 4);
        var len = Math.hypot(adx, ady);
        ex = sx + Math.cos(ang) * len;
        ey = sy + Math.sin(ang) * len;
      }
      props = { x1: sx, y1: sy, x2: ex, y2: ey };
    } else if (drag.tool === "rect") {
      var rw = Math.abs(ex - sx), rh = Math.abs(ey - sy);
      if (shiftHeld) { var sq = Math.min(rw, rh); rw = sq; rh = sq; }
      props = { x: Math.min(sx, ex), y: Math.min(sy, ey), w: rw, h: rh,
                cornerRadius: cs.cornerRadius || 0 };
    } else if (drag.tool === "circle") {
      // Corner-to-corner bounding box → ellipse; Shift = perfect circle
      var ecx = (sx + ex) / 2, ecy = (sy + ey) / 2;
      var erx = Math.abs(ex - sx) / 2, ery = Math.abs(ey - sy) / 2;
      if (shiftHeld) { var er = Math.min(erx, ery); erx = er; ery = er; }
      if (erx < 0.005) erx = 0.005; if (ery < 0.005) ery = 0.005;
      props = { cx: ecx, cy: ecy, rx: erx, ry: ery, r: Math.max(erx, ery) };
    } else if (drag.tool === "corner") {
      // Default: horizontal arm first (p1 at ex,sy); Shift: vertical arm first (p1 at sx,ey)
      var cornerP1x = shiftHeld ? sx : ex;
      var cornerP1y = shiftHeld ? ey : sy;
      props = { p0x: sx, p0y: sy, p1x: cornerP1x, p1y: cornerP1y,
                p2x: ex, p2y: ey, radius: cs.cornerRadius || 0.08 };
    }
    if (!props) return null;
    return GC.createObject(drag.tool, props, cs);
  }

  // ── Event handlers ────────────────────────────────────────────────────────

  function _attachConstructionEvents(canvas) {
    canvas.addEventListener("pointerdown",  _onCDown);
    canvas.addEventListener("pointermove",  _onCMove);
    canvas.addEventListener("pointerup",    _onCUp);
    canvas.addEventListener("pointerleave", _onCLeave);
  }

  function _detachConstructionEvents(canvas) {
    canvas.removeEventListener("pointerdown",  _onCDown);
    canvas.removeEventListener("pointermove",  _onCMove);
    canvas.removeEventListener("pointerup",    _onCUp);
    canvas.removeEventListener("pointerleave", _onCLeave);
  }

  function _onCDown(e) {
    if (_previewMode !== "glyph") return;
    var cs   = _gcState();
    var objs = _gcObjects();
    if (!cs || !objs) return;
    var GC   = global.WOS && global.WOS.GlyphConstructor;
    if (!GC) return;

    var raw = _normPt(e, this);
    var pt  = GC.snapPt(raw.x, raw.y, cs);

    if (cs.tool === "erase") {
      var hit = GC.hitTest(objs, raw.x, raw.y);
      if (hit) {
        _pushHistory();
        var set = _activeSet();
        var key = _activeSlotKey();
        set.glyphs[key].objects = GC.removeObjects(objs, [hit]);
        cs.selection = [];
        _cHover = null;
        _cSave();
        _renderConstruction();
      }
      return;
    }

    if (cs.tool === "select") {
      // Check transform handles first when there's a selection
      if (cs.selection.length) {
        var lsz2 = _cLogicalSize();
        var sb2  = GC.selectionBounds(objs, cs.selection);
        if (sb2) {
          var PAD2 = 4;
          var hls2 = _getHandles({ x: sb2.x - PAD2/lsz2, y: sb2.y - PAD2/lsz2,
                                    w: sb2.w + PAD2*2/lsz2, h: sb2.h + PAD2*2/lsz2 }, lsz2);
          var hitH = _hitHandle(hls2, raw.x, raw.y, lsz2);
          if (hitH) {
            _pushHistory();
            var startObjsSnap = JSON.parse(JSON.stringify(
              objs.filter(function(o) { return cs.selection.indexOf(o.id) >= 0; })
            ));
            _cDrag = {
              phase:       hitH.id === "rot" ? "rotate" : "scale",
              handle:      hitH.id,
              sx: raw.x,   sy: raw.y,
              startBounds: Object.assign({}, sb2, { x: sb2.x - PAD2/lsz2, y: sb2.y - PAD2/lsz2,
                                                    w: sb2.w + PAD2*2/lsz2, h: sb2.h + PAD2*2/lsz2 }),
              startObjs:   startObjsSnap,
            };
            this.setPointerCapture(e.pointerId);
            _scheduleRender();
            return;
          }
        }
      }

      var selHit = GC.hitTest(objs, raw.x, raw.y);
      if (selHit) {
        if (!e.shiftKey) {
          if (cs.selection.indexOf(selHit) < 0) cs.selection = [selHit];
        } else {
          var idx = cs.selection.indexOf(selHit);
          if (idx < 0) cs.selection = cs.selection.concat([selHit]);
          else cs.selection = cs.selection.filter(function (id) { return id !== selHit; });
        }
        _pushHistory();
        _cDrag = { phase: "move", sx: raw.x, sy: raw.y, lastX: raw.x, lastY: raw.y };
      } else {
        if (!e.shiftKey) cs.selection = [];
        _cDrag = { phase: "marquee", sx: raw.x, sy: raw.y, ex: raw.x, ey: raw.y };
      }
    } else {
      _cDrag = { phase: "draw", tool: cs.tool, sx: pt.x, sy: pt.y, ex: pt.x, ey: pt.y,
                 shiftHeld: e.shiftKey, preview: null };
    }

    this.setPointerCapture(e.pointerId);
    _scheduleRender();
  }

  function _onCMove(e) {
    if (!_previewCanvas || _previewMode !== "glyph") return;
    var cs  = _gcState();
    var GC  = global.WOS && global.WOS.GlyphConstructor;
    if (!cs || !GC) return;
    var objs = _gcObjects();
    var raw  = _normPt(e, _previewCanvas);

    // Hover tracking (no drag required)
    if (!_cDrag) {
      var hovered = (cs.tool === "erase" || cs.tool === "select")
        ? GC.hitTest(objs, raw.x, raw.y) : null;
      if (hovered !== _cHover) { _cHover = hovered; _scheduleRender(); }
      return;
    }

    if (_cDrag.phase === "draw") {
      var pt = GC.snapPt(raw.x, raw.y, cs);
      _cDrag.ex = pt.x; _cDrag.ey = pt.y;
      _cDrag.shiftHeld = e.shiftKey;
      _cDrag.preview   = _buildPreview(_cDrag, cs);
    } else if (_cDrag.phase === "move") {
      var dx = raw.x - _cDrag.lastX;
      var dy = raw.y - _cDrag.lastY;
      _cDrag.lastX = raw.x; _cDrag.lastY = raw.y;
      GC.moveObjects(objs, cs.selection, dx, dy);
    } else if (_cDrag.phase === "marquee") {
      _cDrag.ex = raw.x; _cDrag.ey = raw.y;

    } else if (_cDrag.phase === "scale") {
      var ob  = _cDrag.startBounds;
      var hdl = _cDrag.handle;
      var ddx = raw.x - _cDrag.sx, ddy = raw.y - _cDrag.sy;
      var newX = ob.x, newY = ob.y, newW = ob.w, newH = ob.h;
      if (hdl.indexOf("w") >= 0) { newX = ob.x + ddx; newW = Math.max(0.02, ob.w - ddx); }
      if (hdl.indexOf("e") >= 0) { newW = Math.max(0.02, ob.w + ddx); }
      if (hdl.indexOf("n") >= 0) { newY = ob.y + ddy; newH = Math.max(0.02, ob.h - ddy); }
      if (hdl.indexOf("s") >= 0) { newH = Math.max(0.02, ob.h + ddy); }
      var originX = hdl.indexOf("w") >= 0 ? ob.x + ob.w : ob.x;
      var originY = hdl.indexOf("n") >= 0 ? ob.y + ob.h : ob.y;
      var scX = newW / ob.w, scY = newH / ob.h;
      // Restore originals then apply scale
      _cDrag.startObjs.forEach(function(orig) {
        var curr = _findObj(objs, orig.id);
        if (curr) Object.assign(curr, JSON.parse(JSON.stringify(orig)));
      });
      GC.scaleObjects(objs, cs.selection, scX, scY, originX, originY);

    } else if (_cDrag.phase === "rotate") {
      var rsb = _cDrag.startBounds;
      var rcx = rsb.x + rsb.w / 2, rcy = rsb.y + rsb.h / 2;
      var startAngle = Math.atan2(_cDrag.sy - rcy, _cDrag.sx - rcx);
      var currAngle  = Math.atan2(raw.y - rcy, raw.x - rcx);
      var delta = currAngle - startAngle;
      _cDrag.startObjs.forEach(function(orig) {
        var curr = _findObj(objs, orig.id);
        if (curr) Object.assign(curr, JSON.parse(JSON.stringify(orig)));
      });
      GC.rotateObjectsArbitrary(objs, cs.selection, delta, rcx, rcy);
    }

    _scheduleRender();
  }

  function _onCUp(e) {
    if (!_cDrag || !_previewCanvas) return;
    var cs   = _gcState();
    var GC   = global.WOS && global.WOS.GlyphConstructor;
    if (!cs || !GC) return;
    var objs = _gcObjects();

    if (_cDrag.phase === "draw") {
      var preview = _buildPreview(_cDrag, cs);
      if (preview) {
        _pushHistory();
        objs.push(preview);
        _cSave();
      }
    } else if (_cDrag.phase === "marquee") {
      var mr = _marqueeRect(_cDrag);
      if (mr.w > 0.01 || mr.h > 0.01) {
        var hits = GC.hitTestMarquee(objs, mr);
        cs.selection = e.shiftKey
          ? cs.selection.concat(hits.filter(function (id) { return cs.selection.indexOf(id) < 0; }))
          : hits;
      }
    } else if (_cDrag.phase === "move") {
      _cSave();
    } else if (_cDrag.phase === "scale" || _cDrag.phase === "rotate") {
      _cSave();
    }

    _cDrag = null;
    _scheduleRender();
  }

  function _onCLeave() {
    if (_cHover) { _cHover = null; _scheduleRender(); }
    if (_cDrag && _cDrag.phase !== "move") _cDrag = null;
  }

  // ── Live secondary preview ────────────────────────────────────────────────

  function _refreshLivePreview() {
    if (!_liveCanvas) return;
    var set = _activeSet();
    var SPR = _SPR();
    if (!set || !SPR) return;
    var dpr = _resizeHiDPI(_liveCanvas);
    var lw  = _liveCanvas.getBoundingClientRect().width  || 200;
    var lh  = _liveCanvas.getBoundingClientRect().height || 60;
    var ctx = _liveCanvas.getContext("2d");
    ctx.clearRect(0, 0, lw, lh);
    ctx.fillStyle = "rgba(255,255,255,0.02)";
    ctx.fillRect(0, 0, lw, lh);
    var pv = _pvState(_liveMode);
    if (_liveMode === "word") {
      var liveCtx = { canvas: { width: lw, height: lh } };
      _liveCanvas._fakeCtx = ctx;
      SPR.renderWordPreview(ctx, pv.text || "SOHO", {
        setId: set.id, scale: Math.round(lh * 0.65), tracking: 4,
      });
    } else if (_liveMode === "pattern") {
      SPR.renderPatternPreview(ctx, {
        setId: set.id, columns: 8, rows: 3, spacing: 4,
        jitter: 0, randomRotation: 0, randomScale: 0,
      });
    }
  }

  // ── Persist + refresh ─────────────────────────────────────────────────────

  function _cSave() {
    var SS  = _SS();
    var set = _activeSet();
    if (!SS || !set) return;
    SS.registerSet(set);
    _refreshAllThumbs();
  }

  function _rebuildConstructionToolbar() {
    if (!_modeControls) return;
    _buildGlyphControls(null);
    _renderConstruction();
  }

  // ── WORD mode ─────────────────────────────────────────────────────────────

  function _renderWordMode(ctx, set) {
    var SPR = _SPR();
    if (!SPR) return;
    var pv = _pvState("word");
    SPR.renderWordPreview(ctx, pv.text || "SOHO", {
      setId:    set.id,
      scale:    pv.scale    !== undefined ? pv.scale    : 56,
      tracking: pv.tracking !== undefined ? pv.tracking : 8,
    });
  }

  // ── POEM mode ─────────────────────────────────────────────────────────────

  function _renderPoemMode(ctx, set) {
    var SPR = _SPR();
    if (!SPR) return;
    var pv = _pvState("poem");
    SPR.renderParagraphPreview(ctx, pv.text || "", {
      setId:      set.id,
      fontSize:   pv.fontSize   !== undefined ? pv.fontSize   : 26,
      lineHeight: pv.lineHeight !== undefined ? pv.lineHeight : 1.6,
      tracking:   pv.tracking   !== undefined ? pv.tracking   : 3,
      wrapWidth:  pv.wrapWidth  !== undefined ? pv.wrapWidth  : Math.floor(ctx.canvas.width * 0.9),
      align:      pv.align      || "left",
    });
  }

  // ── PATTERN mode ──────────────────────────────────────────────────────────

  function _renderPatternMode(ctx, set) {
    var SPR = _SPR();
    if (!SPR) return;
    var pv = _pvState("pattern");
    SPR.renderPatternPreview(ctx, {
      setId:          set.id,
      columns:        pv.columns       !== undefined ? pv.columns       : 6,
      rows:           pv.rows          !== undefined ? pv.rows          : 6,
      spacing:        pv.spacing       !== undefined ? pv.spacing       : 8,
      jitter:         pv.jitter        !== undefined ? pv.jitter        : 0,
      randomRotation: pv.randomRotation !== undefined ? pv.randomRotation : 0,
      randomScale:    pv.randomScale   !== undefined ? pv.randomScale   : 0,
    });
  }

  // ── WORLD mode (animated) ─────────────────────────────────────────────────

  function _startWorldAnim(set) {
    var SPR = _SPR();
    if (!SPR || !_previewCanvas) return;

    _worldLastMs = performance.now();

    function _frame(now) {
      if (!_previewCanvas) return; // unmounted
      var dt   = Math.min((now - _worldLastMs) / 1000, 0.1); // cap dt at 100ms
      _worldLastMs = now;
      _worldT += dt;

      var ctx = _previewCanvas.getContext("2d");
      _clearPreview(ctx);
      var pv = _pvState("world");
      SPR.renderWorldPreview(ctx, {
        setId:   set.id,
        density: pv.density !== undefined ? pv.density : 40,
        drift:   pv.drift   !== undefined ? pv.drift   : 0.2,
        t:       _worldT,
      });
      _worldRAF = requestAnimationFrame(_frame);
    }

    _worldRAF = requestAnimationFrame(_frame);
  }

  function _stopWorldAnim() {
    if (_worldRAF) {
      cancelAnimationFrame(_worldRAF);
      _worldRAF = null;
    }
  }

  // ── Workbench preview (column 3) — separate canvas from construction ──────

  function _stopWbWorldAnim() {
    if (_wbWorldRAF) {
      cancelAnimationFrame(_wbWorldRAF);
      _wbWorldRAF = null;
    }
  }

  function _startWbWorldAnim(set) {
    var SPR = _SPR();
    if (!SPR || !_wbPreviewCanvas) return;
    _wbWorldLastMs = performance.now();
    function _frame(now) {
      if (!_wbPreviewCanvas) return;
      var dt = Math.min((now - _wbWorldLastMs) / 1000, 0.1);
      _wbWorldLastMs = now;
      _wbWorldT += dt;
      var ctx = _wbPreviewCanvas.getContext("2d");
      _clearPreview(ctx);
      var pv = _pvState("world");
      SPR.renderWorldPreview(ctx, {
        setId:   set.id,
        density: pv.density !== undefined ? pv.density : 40,
        drift:   pv.drift   !== undefined ? pv.drift   : 0.2,
        t:       _wbWorldT,
      });
      _wbWorldRAF = requestAnimationFrame(_frame);
    }
    _wbWorldRAF = requestAnimationFrame(_frame);
  }

  function _renderWbPreview() {
    if (!_wbPreviewCanvas) return;
    _stopWbWorldAnim();
    var dpr = _resizeHiDPI(_wbPreviewCanvas);
    var ctx = _wbPreviewCanvas.getContext("2d");
    _clearPreview(ctx);
    var set = _activeSet();
    if (!set) { _renderEmpty(ctx, "no set"); return; }
    if (_wbPreviewMode === "word")    { _renderWordMode(ctx, set);    }
    if (_wbPreviewMode === "poem")    { _renderPoemMode(ctx, set);    }
    if (_wbPreviewMode === "pattern") { _renderPatternMode(ctx, set); }
    if (_wbPreviewMode === "world")   { _startWbWorldAnim(set);       }
  }

  function _buildWbPreviewControls() {
    if (!_wbModeControls) return;
    // Temporarily redirect _modeControls so existing builder functions write to wb panel
    var savedMC = _modeControls;
    _modeControls = _wbModeControls;
    if (_wbPreviewMode === "word")    { _buildWordControls();    }
    if (_wbPreviewMode === "poem")    { _buildPoemControls();    }
    if (_wbPreviewMode === "pattern") { _buildPatternControls(); }
    if (_wbPreviewMode === "world")   { _buildWorldControls();   }
    _modeControls = savedMC;
  }

  // ── Slot thumbnails ───────────────────────────────────────────────────────

  function _renderSlotThumb(canvas, glyph, palette) {
    if (!canvas) return;
    var dpr  = window.devicePixelRatio || 1;
    var css  = 36; // CSS px
    canvas.width  = Math.round(css * dpr);
    canvas.height = Math.round(css * dpr);
    canvas.style.width  = css + "px";
    canvas.style.height = css + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;

    var SR = _SR();
    ctx.clearRect(0, 0, css, css);

    // Procedural / legacy Bauhaus glyphs: delegate to GlyphRenderer
    if (glyph && glyph._bauhaus) {
      var GR = global.WOS && global.WOS.GlyphRenderer;
      if (GR) {
        if (palette && palette.bgColor) {
          ctx.fillStyle = palette.bgColor;
          ctx.fillRect(0, 0, css, css);
        }
        var pad2 = Math.round(css * 0.06);
        GR.renderGlyph(ctx, glyph._bauhaus.note, pad2, pad2, css - pad2 * 2, {});
      }
      return;
    }

    var hasStrokes  = glyph && glyph.strokes  && glyph.strokes.length;
    var hasObjects  = glyph && glyph.objects  && glyph.objects.length;
    if (!hasStrokes && !hasObjects) {
      ctx.fillStyle = "rgba(255,255,255,0.03)";
      ctx.fillRect(0, 0, css, css);
      return;
    }
    if (palette && palette.bgColor) {
      ctx.fillStyle = palette.bgColor;
      ctx.fillRect(0, 0, css, css);
    }
    if (SR) {
      var pad = Math.round(css * 0.08);
      SR.renderGlyph(ctx, glyph, pad, pad, css - pad * 2, palette, {});
    }
  }

  // ── Slot grid ─────────────────────────────────────────────────────────────

  function _buildSlotGrid(container) {
    if (!container) return;
    container.innerHTML = "";
    var SS    = _SS();
    if (!SS) return;
    var slots = SS.getSlotsForFamily(_activeFamily);
    var set   = _activeSet();

    slots.forEach(function (key) {
      var btn = document.createElement("button");
      btn.className  = "slab-slot-btn" + (key === _activeSlotKey() ? " active" : "");
      btn.dataset.slot = key;
      btn.title      = key;

      var canvas = document.createElement("canvas");
      canvas.width  = 36;
      canvas.height = 36;
      canvas.className = "slab-slot-thumb";
      btn.appendChild(canvas);

      var label = document.createElement("span");
      label.className   = "slab-slot-key";
      var display = SLOT_LABELS[key] || (key.startsWith("@") ? key.split(":")[1] : key);
      label.textContent = display === " " ? "·" : display;
      btn.appendChild(label);

      var glyph = set ? (set.glyphs[key] || null) : null;
      _renderSlotThumb(canvas, glyph, set ? set.palette : null);
      container.appendChild(btn);
    });
  }

  function _refreshAllThumbs() {
    if (!_slotGrid) return;
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

  // ── Set selector ──────────────────────────────────────────────────────────

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

  // ── Compact parameter capsule (F14) ──────────────────────────────────────

  function _compactParam(label, key, value, min, max) {
    return [
      '<label class="slab-gc-cparam">',
        '<span class="slab-gc-cparam-lbl">' + label + '</span>',
        '<input type="range" class="slab-gc-cparam-range" min="' + min + '" max="' + max + '"',
          ' value="' + value + '" data-pkey="' + key + '">',
        '<span class="slab-gc-cparam-val" data-pval="' + key + '">' + value + '</span>',
      '</label>',
    ].join("");
  }

  // ── Line style section ────────────────────────────────────────────────────

  function _buildLineStyleSection(cs) {
    var ls      = cs.lineStyle || "solid";
    var dlVal   = Math.round((cs.dashLength     || 0.15) * 100);
    var glVal   = Math.round((cs.gapLength      || 0.08) * 100);
    var drVal   = Math.round((cs.dotRadius      || 0.025) * 100);
    var spVal   = Math.round((cs.patternSpacing || 0.10) * 100);

    var btns = ["solid","dashed","dotted"].map(function (id) {
      var label = id === "solid" ? "—" : id === "dashed" ? "– –" : "···";
      return '<button class="slab-gc-lsbtn' + (ls === id ? " active" : "") + '" data-ls="' + id + '" title="' + id + '">' + label + '</button>';
    }).join("");

    var dashParams = [
      _rangeRow("Dash", "gc.dashLength", dlVal, 3, 40, 1, "%"),
      _rangeRow("Gap",  "gc.gapLength",  glVal, 2, 30, 1, "%"),
    ].join("");

    var dotParams = [
      _rangeRow("Dot",  "gc.dotRadius",      drVal, 1, 10, 1, "%"),
      _rangeRow("Spc",  "gc.patternSpacing", spVal, 3, 40, 1, "%"),
    ].join("");

    return [
      '<div class="slab-gc-linestyle">',
        '<div class="slab-gc-ls-row">',
          '<span class="slab-gc-ls-label">Line</span>',
          '<div class="slab-gc-lsbtns">', btns, '</div>',
        '</div>',
        '<div class="slab-gc-ls-params slab-gc-ls-dash"' + (ls === "dashed" ? "" : ' style="display:none"') + '>',
          dashParams,
        '</div>',
        '<div class="slab-gc-ls-params slab-gc-ls-dot"' + (ls === "dotted" ? "" : ' style="display:none"') + '>',
          dotParams,
        '</div>',
      '</div>',
    ].join("");
  }

  // ── Mode controls ─────────────────────────────────────────────────────────
  // Injects mode-specific controls into _modeControls container.

  function _buildModeControls(container) {
    if (!_modeControls) return;
    _modeControls.innerHTML = "";
    var mode = _previewMode;

    if (mode === "glyph") {
      _buildGlyphControls(container);
    } else if (mode === "word") {
      _buildWordControls(container);
    } else if (mode === "poem") {
      _buildPoemControls(container);
    } else if (mode === "pattern") {
      _buildPatternControls(container);
    } else if (mode === "world") {
      _buildWorldControls(container);
    }
  }

  function _buildGlyphControls(container) {
    var cs = _gcState();
    if (!cs) return;

    var TOOLS = [
      { id: "select",  label: "▲",  title: "Select / Transform"       },
      { id: "line",    label: "/",  title: "Line (Shift=constrain 45°)"},
      { id: "rect",    label: "□",  title: "Rect (Shift=square)"      },
      { id: "circle",  label: "○",  title: "Circle (Shift=perfect)"   },
      { id: "corner",  label: "⌐",  title: "Corner (Shift=flip bend)" },
      { id: "erase",   label: "del",title: "Delete Object"            },
    ];

    var gridOpts = [16, 24, 32].map(function (n) {
      return '<option value="' + n + '"' + (cs.gridDivisions === n ? " selected" : "") + '">' + n + '</option>';
    }).join("");

    var crVal = Math.round((cs.cornerRadius || 0) * 100);

    _modeControls.innerHTML = [
      '<div class="slab-gc-toolbar">',
        '<span class="slab-gc-section-lbl">Tools</span>',
        '<div class="slab-gc-tools">',
          TOOLS.map(function (t) {
            return '<button class="slab-gc-tool' + (cs.tool === t.id ? " active" : "") + '"' +
              ' data-gctool="' + t.id + '" title="' + t.title + '">' + t.label + '</button>';
          }).join(""),
        '</div>',
        '<span class="slab-gc-section-lbl">Actions</span>',
        '<div class="slab-gc-actions">',
          '<button class="slab-gc-act" data-gcact="mirror-h" title="Mirror H (selection)">↔</button>',
          '<button class="slab-gc-act" data-gcact="mirror-v" title="Mirror V (selection)">↕</button>',
          '<button class="slab-gc-act" data-gcact="duplicate" title="Duplicate (⌘D)">⧉</button>',
          '<button class="slab-gc-act slab-gc-act--del" data-gcact="delete" title="Delete selection">×</button>',
          '<button class="slab-gc-act slab-gc-act--clr" data-gcact="clear-all" title="Clear slot (undoable)">⊘</button>',
        '</div>',
      '</div>',

      '<div class="slab-gc-style">',
        '<div class="slab-gc-style-row">',
          '<label class="slab-gc-style-item" title="Stroke enabled">',
            '<input type="checkbox" class="slab-gc-stroke-toggle"' + (cs.strokeEnabled !== false ? " checked" : "") + '>',
            '<span>S</span>',
            '<input type="color" class="slab-gc-color" data-gccolor="stroke" value="' + cs.strokeColor + '"' + (cs.strokeEnabled !== false ? "" : " disabled") + '>',
          '</label>',
          '<label class="slab-gc-style-item" title="Fill enabled">',
            '<input type="checkbox" class="slab-gc-fill-toggle"' + (cs.fillEnabled ? " checked" : "") + '>',
            '<span>F</span>',
            '<input type="color" class="slab-gc-color" data-gccolor="fill" value="' + cs.fillColor + '"' + (cs.fillEnabled ? "" : " disabled") + '>',
          '</label>',
          '<label class="slab-gc-style-item" title="Snap to grid">',
            '<input type="checkbox" class="slab-gc-snap"' + (cs.snapEnabled ? " checked" : "") + '>',
            '<span>Snap</span>',
          '</label>',
          '<label class="slab-gc-style-item" title="Grid divisions">',
            '<span>Grid</span>',
            '<select class="slab-gc-grid-sel">' + gridOpts + '</select>',
          '</label>',
        '</div>',
        '<div class="slab-gc-compact-params">',
          _compactParam("WT", "gc.strokeWidth", Math.round(cs.strokeWidth * 100), 1, 20),
          _compactParam("RD", "gc.cornerRadius", crVal, 0, 30),
        '</div>',
        _buildLineStyleSection(cs),
      '</div>',

      // Secondary live preview strip
      '<div class="slab-gc-live">',
        '<div class="slab-gc-live-tabs">',
          ['word','pattern'].map(function (m) {
            return '<button class="slab-gc-live-tab' + (_liveMode === m ? " active" : "") +
              '" data-livemode="' + m + '">' + m.toUpperCase() + '</button>';
          }).join(""),
        '</div>',
        '<canvas class="slab-gc-live-canvas"></canvas>',
      '</div>',
    ].join("");

    // Tool buttons
    _modeControls.querySelectorAll(".slab-gc-tool").forEach(function (btn) {
      btn.addEventListener("click", function () {
        cs.tool  = this.dataset.gctool;
        _cHover  = null;
        _modeControls.querySelectorAll(".slab-gc-tool").forEach(function (b) {
          b.classList.toggle("active", b.dataset.gctool === cs.tool);
        });
        // Cursor
        if (_previewCanvas) {
          _previewCanvas.style.cursor = cs.tool === "erase"  ? "not-allowed"
                                      : cs.tool === "select" ? "default" : "crosshair";
        }
      });
    });

    // Action buttons — transforms require a selection; clear-all is undoable (no confirm)
    _modeControls.querySelectorAll(".slab-gc-act").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var act  = this.dataset.gcact;
        var GC   = global.WOS && global.WOS.GlyphConstructor;
        var objs = _gcObjects();
        if (!GC || !objs) return;
        var sel  = cs.selection;  // only act on selection — never fall back to all

        if (act === "mirror-h" || act === "mirror-v" ||
            act === "duplicate" || act === "delete" || act === "clear-all") {
          _pushHistory();
        }
        if (act === "mirror-h" && sel.length) { GC.mirrorObjects(objs, sel, "h");  _cSave(); }
        if (act === "mirror-v" && sel.length) { GC.mirrorObjects(objs, sel, "v");  _cSave(); }
        if (act === "duplicate" && sel.length) {
          var copies = GC.duplicateObjects(objs, sel);
          copies.forEach(function (c) { objs.push(c); });
          cs.selection = copies.map(function (c) { return c.id; });
          _cSave();
        }
        if (act === "delete" && sel.length) {
          var dset = _activeSet(), dkey = _activeSlotKey();
          if (!dset) return;
          dset.glyphs[dkey].objects = GC.removeObjects(objs, sel);
          cs.selection = [];
          _cSave();
        }
        if (act === "clear-all") {
          // No confirm — push history first so Cmd+Z recovers
          var cset = _activeSet(), ckey = _activeSlotKey();
          if (cset && cset.glyphs[ckey]) cset.glyphs[ckey].objects = [];
          cs.selection = [];
          _cSave();
        }
        _renderConstruction();
      });
    });

    // Stroke toggle + color
    var strokeToggle = _modeControls.querySelector(".slab-gc-stroke-toggle");
    var strokeColor  = _modeControls.querySelector('[data-gccolor="stroke"]');
    strokeToggle.addEventListener("change", function () {
      cs.strokeEnabled = this.checked;
      strokeColor.disabled = !this.checked;
    });
    strokeColor.addEventListener("input", function () { cs.strokeColor = this.value; });

    // Fill toggle + color
    var fillToggle = _modeControls.querySelector(".slab-gc-fill-toggle");
    var fillColor  = _modeControls.querySelector('[data-gccolor="fill"]');
    fillToggle.addEventListener("change", function () {
      cs.fillEnabled = this.checked;
      fillColor.disabled = !this.checked;
    });
    fillColor.addEventListener("input", function () { cs.fillColor = this.value; });

    // Compact params: Weight + Radius
    function _cpWire(key, prop, scale) {
      var sl = _modeControls.querySelector('[data-pkey="' + key + '"]');
      var vl = _modeControls.querySelector('[data-pval="' + key + '"]');
      if (!sl) return;
      sl.addEventListener("input", function () {
        var v = parseInt(this.value, 10);
        cs[prop] = v / scale;
        if (vl) vl.textContent = v;
      });
    }
    _cpWire("gc.strokeWidth",  "strokeWidth",  100);
    _cpWire("gc.cornerRadius", "cornerRadius", 100);

    // Line style segmented buttons
    _modeControls.querySelectorAll(".slab-gc-lsbtn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        cs.lineStyle = this.dataset.ls;
        _modeControls.querySelectorAll(".slab-gc-lsbtn").forEach(function (b) {
          b.classList.toggle("active", b.dataset.ls === cs.lineStyle);
        });
        var dashPanel = _modeControls.querySelector(".slab-gc-ls-dash");
        var dotPanel  = _modeControls.querySelector(".slab-gc-ls-dot");
        if (dashPanel) dashPanel.style.display = cs.lineStyle === "dashed" ? "" : "none";
        if (dotPanel)  dotPanel.style.display  = cs.lineStyle === "dotted" ? "" : "none";
      });
    });

    // Dash/gap sliders
    function _lsSlider(key, prop, scale) {
      var sl = _modeControls.querySelector('[data-pkey="' + key + '"]');
      var vl = _modeControls.querySelector('[data-pval="' + key + '"]');
      if (!sl) return;
      sl.addEventListener("input", function () {
        var v = parseFloat(this.value);
        cs[prop] = v / scale;
        if (vl) vl.textContent = v + "%";
      });
    }
    _lsSlider("gc.dashLength",     "dashLength",     100);
    _lsSlider("gc.gapLength",      "gapLength",      100);
    _lsSlider("gc.dotRadius",      "dotRadius",      100);
    _lsSlider("gc.patternSpacing", "patternSpacing", 100);

    // Snap
    _modeControls.querySelector(".slab-gc-snap").addEventListener("change", function () {
      cs.snapEnabled = this.checked;
    });

    // Grid selector
    var gridSel = _modeControls.querySelector(".slab-gc-grid-sel");
    if (gridSel) {
      gridSel.addEventListener("change", function () {
        cs.gridDivisions = parseInt(this.value, 10);
        _renderConstruction();
      });
    }

    // Live preview canvas + tabs
    _liveCanvas = _modeControls.querySelector(".slab-gc-live-canvas");
    _modeControls.querySelectorAll(".slab-gc-live-tab").forEach(function (btn) {
      btn.addEventListener("click", function () {
        _liveMode = this.dataset.livemode;
        _modeControls.querySelectorAll(".slab-gc-live-tab").forEach(function (b) {
          b.classList.toggle("active", b.dataset.livemode === _liveMode);
        });
        _refreshLivePreview();
      });
    });
    _refreshLivePreview();
  }

  function _buildWordControls(container) {
    var pv  = _pvState("word");
    var txt = pv.text     !== undefined ? pv.text     : "SOHO";
    var sc  = pv.scale    !== undefined ? pv.scale    : 56;
    var tr  = pv.tracking !== undefined ? pv.tracking : 8;

    _modeControls.innerHTML = [
      '<div class="slab-mc slab-mc-word">',
        '<label class="slab-mc-label slab-mc-label--full">Text',
          '<input class="slab-mc-text" type="text" maxlength="20"',
            ' value="' + _escAttr(txt) + '" placeholder="SOHO" spellcheck="false">',
        '</label>',
        _rangeRow("Scale",   "word.scale",    sc,  16, 96, 4,  "px"),
        _rangeRow("Tracking","word.tracking", tr,   0, 40, 2,  "px"),
      '</div>',
    ].join("");

    // Text input
    _modeControls.querySelector(".slab-mc-text").addEventListener("input", function () {
      _setPvField("word", "text", this.value);
      _renderActivePreview();
    });
    _wireRanges(_modeControls);
  }

  function _buildPoemControls(container) {
    var pv  = _pvState("poem");
    var txt = pv.text       !== undefined ? pv.text       : "";
    var fs  = pv.fontSize   !== undefined ? pv.fontSize   : 26;
    var lh  = pv.lineHeight !== undefined ? pv.lineHeight : 1.6;
    var tr  = pv.tracking   !== undefined ? pv.tracking   : 3;
    var al  = pv.align      || "left";

    var PRESETS = [
      { id: "subway",  label: "SUBWAY",  text: "DOWNTOWN EXPRESS\nNO STANDING\nCLOSING DOORS" },
      { id: "poetry",  label: "POETRY",  text: "soft little goblin\nsleeping on my chair\nacting like they pay the rent" },
      { id: "signage", label: "SIGNAGE", text: "CAUTION\nWET FLOOR\nEXIT ONLY" },
      { id: "warning", label: "WARNING", text: "DANGER\nHIGH VOLTAGE\nDO NOT ENTER" },
      { id: "ritual",  label: "RITUAL",  text: "the mark\nbefore the mark\nbefore the mark" },
    ];

    _modeControls.innerHTML = [
      '<div class="slab-mc slab-mc-poem">',
        '<div class="slab-poem-presets">',
          PRESETS.map(function (p) {
            return '<button class="slab-preset-btn" data-preset="' + p.id + '">' + p.label + '</button>';
          }).join(""),
        '</div>',
        '<textarea class="slab-poem-textarea" rows="4" spellcheck="false">' + _escHTML(txt) + '</textarea>',
        _rangeRow("Size",    "poem.fontSize",   fs,  8,  56, 2,  "px"),
        _rangeRow("Line Ht", "poem.lineHeight", lh,  1.0, 3.0, 0.1, "×", 1),
        _rangeRow("Tracking","poem.tracking",   tr,  0,  16, 1,  "px"),
        '<div class="slab-align-row">',
          '<span class="slab-mc-label-text">Align</span>',
          '<button class="slab-align-btn' + (al === "left"   ? " active" : "") + '" data-align="left">Left</button>',
          '<button class="slab-align-btn' + (al === "center" ? " active" : "") + '" data-align="center">Center</button>',
        '</div>',
      '</div>',
    ].join("");

    // Preset buttons
    _modeControls.querySelectorAll(".slab-preset-btn").forEach(function (btn) {
      var pid   = btn.dataset.preset;
      var found = PRESETS.filter(function (p) { return p.id === pid; })[0];
      if (!found) return;
      btn.addEventListener("click", function () {
        _setPvField("poem", "text", found.text);
        _modeControls.querySelector(".slab-poem-textarea").value = found.text;
        _renderActivePreview();
      });
    });

    // Textarea
    _modeControls.querySelector(".slab-poem-textarea").addEventListener("input", function () {
      _setPvField("poem", "text", this.value);
      _renderActivePreview();
    });

    // Align buttons
    _modeControls.querySelectorAll(".slab-align-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var al = this.dataset.align;
        _setPvField("poem", "align", al);
        _modeControls.querySelectorAll(".slab-align-btn").forEach(function (b) {
          b.classList.toggle("active", b.dataset.align === al);
        });
        _renderActivePreview();
      });
    });

    _wireRanges(_modeControls);
  }

  function _buildPatternControls(container) {
    var pv = _pvState("pattern");
    _modeControls.innerHTML = [
      '<div class="slab-mc slab-mc-pattern">',
        _rangeRow("Columns", "pattern.columns",       pv.columns       || 6,  2, 14, 1,  ""),
        _rangeRow("Rows",    "pattern.rows",          pv.rows          || 6,  2, 14, 1,  ""),
        _rangeRow("Spacing", "pattern.spacing",       pv.spacing       !== undefined ? pv.spacing : 8,  0, 32, 2, "px"),
        _rangeRow("Jitter",  "pattern.jitter",        pv.jitter        || 0,  0, 24, 2,  "px"),
        _rangeRow("Rnd Rot", "pattern.randomRotation",pv.randomRotation || 0,  0, 180, 5, "°"),
        _rangeRow("Rnd Sc",  "pattern.randomScale",   pv.randomScale   || 0,  0, 1, 0.05, "", 2),
      '</div>',
    ].join("");
    _wireRanges(_modeControls);
  }

  function _buildWorldControls(container) {
    var pv = _pvState("world");
    _modeControls.innerHTML = [
      '<div class="slab-mc slab-mc-world">',
        _rangeRow("Density", "world.density", pv.density !== undefined ? pv.density : 40, 4, 120, 4, ""),
        _rangeRow("Drift",   "world.drift",   pv.drift   !== undefined ? pv.drift   : 0.2, 0, 2, 0.05, "×", 2),
      '</div>',
    ].join("");
    _wireRanges(_modeControls);
  }

  // Generate a labelled range row.
  // key = "section.field" — wired by _wireRanges().
  function _rangeRow(label, key, value, min, max, step, unit, decimals) {
    var d   = decimals !== undefined ? decimals : 0;
    var disp = Number(value).toFixed(d) + (unit || "");
    return [
      '<label class="slab-mc-label">',
        '<span class="slab-mc-label-text">' + label + '</span>',
        '<input class="slab-mc-range" type="range"',
          ' data-pkey="' + key + '"',
          ' min="' + min + '" max="' + max + '" step="' + step + '"',
          ' value="' + value + '">',
        '<span class="slab-mc-val" data-pval="' + key + '">' + disp + '</span>',
      '</label>',
    ].join("");
  }

  // Wire all .slab-mc-range inputs in a container to state + re-render.
  function _wireRanges(container) {
    container.querySelectorAll(".slab-mc-range").forEach(function (input) {
      var pkey = input.dataset.pkey;                     // e.g. "poem.fontSize"
      var parts = pkey ? pkey.split(".") : [];
      if (parts.length !== 2) return;
      var section = parts[0], field = parts[1];

      var valSpan = container.querySelector('[data-pval="' + pkey + '"]');

      input.addEventListener("input", function () {
        var v = parseFloat(this.value);
        _setPvField(section, field, v);
        if (valSpan) {
          // Detect display format
          var unit = valSpan.textContent.replace(/[\d.\-]/g, "");
          var dec  = (String(this.step).split(".")[1] || "").length;
          valSpan.textContent = v.toFixed(dec) + unit;
        }
        _renderActivePreview();
      });
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
      alert("No GlyphLab data found in localStorage. Open GlyphLab, make changes, then sync.");
      return;
    }
    var imported = SS.importFromGlyphLab(raw, {
      sourceFile: (set.meta && set.meta.sourceFile) || set.name,
      name:       set.name,
      family:     set.family,
    });
    if (imported) {
      if (imported.id !== set.id) {
        SS.setActiveSet(imported.id);
        _buildSetOptions();
      }
      _buildSlotGrid(_slotGrid);
      _renderActivePreview();
    }
  }

  // ── Set context menu ──────────────────────────────────────────────────────

  function _showSetMenu(anchor) {
    var existing = document.querySelector(".slab-context-menu");
    if (existing) existing.remove();
    var SS  = _SS();
    var set = _activeSet();
    if (!SS) return;

    var menu = document.createElement("div");
    menu.className = "slab-context-menu";

    var items = [
      { label: "Rename…",        action: "rename"    },
      { label: "Duplicate",           action: "duplicate" },
      { label: "Export JSON",         action: "export-json" },
      { label: "Export PNG sheet",    action: "export-png"  },
      { label: "Delete",              action: "delete", disabled: !set || (set.meta && set.meta.pinned) },
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
    menu.style.left = r.left   + "px";

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
      if (name) { SS.renameSet(set.id, name); _buildSetOptions(); }

    } else if (action === "duplicate") {
      if (!set) return;
      var copy = SS.duplicateSet(set.id);
      if (copy) {
        SS.setActiveSet(copy.id);
        _buildSetOptions();
        _buildSlotGrid(_slotGrid);
        _renderActivePreview();
      }

    } else if (action === "export-json") {
      if (!set) return;
      var json = SS.exportSet(set.id);
      if (!json) return;
      var blob = new Blob([json], { type: "application/json" });
      var url  = URL.createObjectURL(blob);
      var a    = document.createElement("a");
      a.href = url; a.download = (set.name || "symbol-set") + ".json";
      a.click(); URL.revokeObjectURL(url);

    } else if (action === "export-png") {
      if (!set) return;
      SS.exportSetPNG(set.id, 64, function (blob) {
        if (!blob) return;
        var url = URL.createObjectURL(blob);
        var a   = document.createElement("a");
        a.href = url; a.download = (set.name || "symbol-set") + "-sheet.png";
        a.click(); URL.revokeObjectURL(url);
      });

    } else if (action === "delete") {
      if (!set) return;
      if (!confirm('Delete "' + set.name + '"? This cannot be undone.')) return;
      var prevId = set.id;
      SS.deleteSet(prevId);
      var remaining = SS.getAllSets();
      SS.setActiveSet(remaining.length ? remaining[0].id : null);
      _buildSetOptions();
      _buildSlotGrid(_slotGrid);
      _renderActivePreview();
    }
  }

  // ── Build full drawer UI ──────────────────────────────────────────────────

  function _buildUI(container) {
    var SS = _SS();
    if (!SS) {
      container.innerHTML = '<div class="slab-error">SymbolSystem not loaded.</div>';
      return;
    }

    // Restore preview mode from state
    var st = _wosState();
    if (st && st.symbolPreview && st.symbolPreview.mode) {
      _previewMode = st.symbolPreview.mode;
    }

    var PRESET_NAMES = SS.getPalettePresetNames();
    var FAMILY_TABS  = [
      { id: "typographic", label: "ABC", title: "Typographic" },
      { id: "iconic",      label: "✶",  title: "Iconic"       },
      { id: "musical",     label: "♩",  title: "Musical"      },
      { id: "transport",   label: "⬡",  title: "Transport"    },
      { id: "territorial", label: "✗",  title: "Territorial"  },
      { id: "procedural",  label: "◈",  title: "Procedural"   },
    ];
    var PREVIEW_TABS = [
      { id: "glyph",   label: "GLYPH"   },
      { id: "word",    label: "WORD"    },
      { id: "poem",    label: "POEM"    },
      { id: "pattern", label: "PATTERN" },
      { id: "world",   label: "WORLD"   },
    ];

    var set        = _activeSet();
    var curPalette = (set && set.palette) ? set.palette : SS.getPalettePreset("braun");

    container.innerHTML = [
      '<div class="slab-root">',

        // ── Set toolbar ───────────────────────────────────────────────────
        '<div class="slab-set-bar">',
          '<select class="slab-set-select" title="Active symbol set"></select>',
          '<button class="slab-btn slab-btn-new"    title="Create new set">+ New</button>',
          '<button class="slab-btn slab-btn-import" title="Import from file">↑ Import</button>',
          '<input type="file" class="slab-import-input" accept="application/json" style="display:none">',
          '<button class="slab-btn slab-btn-menu"   title="Set options">≡</button>',
        '</div>',

        // ── Preview mode tabs ─────────────────────────────────────────────
        '<div class="slab-preview-tabs">',
          PREVIEW_TABS.map(function (t) {
            return '<button class="slab-ptab' + (_previewMode === t.id ? " active" : "") +
              '" data-mode="' + t.id + '">' + t.label + '</button>';
          }).join(""),
        '</div>',

        // ── Body: slot column + preview column ────────────────────────────
        '<div class="slab-body">',

          // Left: family tabs + slot grid
          '<div class="slab-slot-col">',
            '<div class="slab-family-tabs">',
              FAMILY_TABS.map(function (t) {
                return '<button class="slab-tab' + (_activeFamily === t.id ? " active" : "") +
                  '" data-family="' + t.id + '" title="' + t.title + '">' + t.label + '</button>';
              }).join(""),
            '</div>',
            '<div class="slab-slot-grid"></div>',
          '</div>',

          // Right: live preview canvas + mode controls
          '<div class="slab-preview-col">',
            '<canvas class="slab-preview-canvas" width="240" height="240"></canvas>',
            '<div class="slab-mode-controls"></div>',
          '</div>',

        '</div>', // .slab-body

        // ── GlyphLab bridge (LEGACY) ──────────────────────────────────────
        '<div class="slab-bridge-bar">',
          '<span class="slab-section-label slab-legacy-label" title="GlyphLab bridge is superseded by the construction system above">LEGACY</span>',
          '<button class="slab-btn slab-btn-open-gl slab-btn-legacy" title="Legacy: use the construction canvas above instead" disabled>Open in GlyphLab ↗</button>',
          '<button class="slab-btn slab-btn-sync-gl slab-btn-legacy" title="Legacy: use the construction canvas above instead" disabled>Sync from GlyphLab</button>',
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
            '<input type="color" class="slab-color-stroke" value="' + (curPalette.strokeColor || "#ffffff") + '">',
          '</label>',
          '<label class="slab-color-label" title="Fill color">',
            '<span>F</span>',
            '<input type="color" class="slab-color-fill" value="' + (curPalette.fillColor || "#ffffff") + '">',
          '</label>',
          '<select class="slab-mode-select" title="Render mode">',
            ["stroke","fill","fill+stroke","inverse"].map(function (m) {
              return '<option value="' + m + '"' + (curPalette.mode === m ? " selected" : "") + '>' + m + '</option>';
            }).join(""),
          '</select>',
        '</div>',

        // ── Place / Brush bar ─────────────────────────────────────────────
        '<div class="slab-place-bar">',
          '<span class="slab-section-label">Place</span>',
          '<div class="slab-place-actions">',
            '<button class="slab-btn slab-btn-place" title="Arm slot for single-click placement">',
              '↓ Place “' + (_activeSlotKey() === " " ? "SPACE" : _activeSlotKey()) + '”',
            '</button>',
            '<button class="slab-btn slab-btn-brush" title="Arm slot for brush-stamp mode">',
              '⌖ Brush',
            '</button>',
          '</div>',
          '<div class="slab-brush-params">',
            '<label class="slab-brush-label">Spacing',
              '<input class="slab-brush-input" type="range" data-brush="spacing"',
                ' min="8" max="128" step="4" value="32">',
              '<span class="slab-brush-val" data-brushval="spacing">32</span>',
            '</label>',
            '<label class="slab-brush-label">Rnd Rot',
              '<input class="slab-brush-input" type="range" data-brush="randomRotation"',
                ' min="0" max="180" step="5" value="0">',
              '<span class="slab-brush-val" data-brushval="randomRotation">0°</span>',
            '</label>',
            '<label class="slab-brush-label">Rnd Scale',
              '<input class="slab-brush-input" type="range" data-brush="randomScale"',
                ' min="0" max="100" step="5" value="0">',
              '<span class="slab-brush-val" data-brushval="randomScale">0%</span>',
            '</label>',
          '</div>',
        '</div>',

      '</div>', // .slab-root
    ].join("");

    // Wire up DOM refs
    _previewCanvas = container.querySelector(".slab-preview-canvas");
    _modeControls  = container.querySelector(".slab-mode-controls");
    _slotGrid      = container.querySelector(".slab-slot-grid");
    _setSelect     = container.querySelector(".slab-set-select");

    // Make construction canvas interactive
    _previewCanvas.tabIndex = 0;
    _attachConstructionEvents(_previewCanvas);
    // Init HiDPI after layout settles
    requestAnimationFrame(function () { _resizeHiDPI(_previewCanvas); });

    // Populate
    _buildSetOptions();
    _buildSlotGrid(_slotGrid);
    _buildModeControls(container);
    _renderActivePreview();

    // ── Events ────────────────────────────────────────────────────────────

    // Preview mode tabs (drawer mode only — workbench uses .swb-ptabs)
    var _ptabsEl = container.querySelector(".slab-preview-tabs");
    if (_ptabsEl) {
      _ptabsEl.addEventListener("click", function (e) {
        var btn = e.target.closest(".slab-ptab");
        if (!btn) return;
        var mode = btn.dataset.mode;
        _stopWorldAnim();
        _setPvMode(mode);
        container.querySelectorAll(".slab-ptab").forEach(function (b) {
          b.classList.toggle("active", b.dataset.mode === mode);
        });
        _buildModeControls(container);
        _renderActivePreview();
      });
    }

    // Set selector
    _setSelect.addEventListener("change", function () {
      if (_SS()) _SS().setActiveSet(this.value || null);
      _buildSetOptions();
      _buildSlotGrid(_slotGrid);
      _syncSlotActive();
      _renderActivePreview();
    });

    // New set
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
      _renderActivePreview();
    });

    // Import
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
        _renderActivePreview();
      });
      this.value = "";
    });

    // Set menu
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

    // Slot grid
    _slotGrid.addEventListener("click", function (e) {
      var btn = e.target.closest(".slab-slot-btn");
      if (!btn) return;
      _setActiveSlotKey(btn.dataset.slot, container);
    });

    // GlyphLab
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
      container.querySelector(".slab-color-stroke").value = preset.strokeColor || "#ffffff";
      container.querySelector(".slab-color-fill").value   = preset.fillColor   || "#ffffff";
      container.querySelector(".slab-mode-select").value  = preset.mode        || "stroke";
      _refreshAllThumbs();
      _renderActivePreview();
    });

    // Stroke color
    container.querySelector(".slab-color-stroke").addEventListener("input", function () {
      var set = _activeSet();
      if (!set) return;
      set.palette.strokeColor = this.value;
      var SS = _SS();
      if (SS) SS.registerSet(set);
      _refreshAllThumbs();
      _renderActivePreview();
    });

    // Fill color
    container.querySelector(".slab-color-fill").addEventListener("input", function () {
      var set = _activeSet();
      if (!set) return;
      set.palette.fillColor = this.value;
      var SS = _SS();
      if (SS) SS.registerSet(set);
      _refreshAllThumbs();
      _renderActivePreview();
    });

    // Mode
    container.querySelector(".slab-mode-select").addEventListener("change", function () {
      var set = _activeSet();
      if (!set) return;
      set.palette.mode = this.value;
      var SS = _SS();
      if (SS) SS.registerSet(set);
      _refreshAllThumbs();
      _renderActivePreview();
    });

    // Place button
    container.querySelector(".slab-btn-place").addEventListener("click", function () {
      var SS  = _SS();
      var set = _activeSet();
      if (!SS || !set) return;
      var wos = global._wos;
      if (!wos || !wos.state) return;
      var slotKey = _activeSlotKey();
      wos.state.symbols.activeSetId   = set.id;
      wos.state.symbols.activeSlotKey = slotKey;
      wos.state.tool = "symbol-place";
      if (typeof wos.syncUI === "function") wos.syncUI();
      setTimeout(function () {
        if (SBE.DrawerSystem) SBE.DrawerSystem.closeDrawer();
      }, 0);
    });

    // Brush button
    container.querySelector(".slab-btn-brush").addEventListener("click", function () {
      var SS  = _SS();
      var set = _activeSet();
      if (!SS || !set) return;
      var wos = global._wos;
      if (!wos || !wos.state) return;
      var slotKey = _activeSlotKey();
      wos.state.symbols.activeSetId   = set.id;
      wos.state.symbols.activeSlotKey = slotKey;
      wos.state.tool = "symbol-brush";
      if (typeof wos.syncUI === "function") wos.syncUI();
      setTimeout(function () {
        if (SBE.DrawerSystem) SBE.DrawerSystem.closeDrawer();
      }, 0);
    });

    // Brush sliders
    container.querySelectorAll(".slab-brush-input").forEach(function (input) {
      var key     = input.getAttribute("data-brush");
      var valSpan = container.querySelector('[data-brushval="' + key + '"]');
      var wos     = global._wos;
      if (wos && wos.state && wos.state.symbolBrush && wos.state.symbolBrush[key] !== undefined) {
        input.value = wos.state.symbolBrush[key];
        if (valSpan) valSpan.textContent = _brushValLabel(key, wos.state.symbolBrush[key]);
      }
      input.addEventListener("input", function () {
        var v   = parseFloat(this.value);
        var wos = global._wos;
        if (wos && wos.state && wos.state.symbolBrush) wos.state.symbolBrush[key] = v;
        if (valSpan) valSpan.textContent = _brushValLabel(key, v);
      });
    });

    // Construction keyboard shortcuts
    container.addEventListener("keydown", function (e) {
      if (_previewMode !== "glyph") return;
      var cs  = _gcState();
      var GC  = global.WOS && global.WOS.GlyphConstructor;
      if (!cs || !GC) return;
      var meta = e.metaKey || e.ctrlKey;

      if (e.key === "Escape") {
        cs.tool = "select"; _cHover = null;
        _rebuildConstructionToolbar();
        e.preventDefault();

      } else if ((e.key === "Delete" || e.key === "Backspace") && cs.selection.length) {
        var dset = _activeSet(), dkey = _activeSlotKey();
        if (dset && dset.glyphs[dkey]) {
          _pushHistory();
          dset.glyphs[dkey].objects = GC.removeObjects(dset.glyphs[dkey].objects, cs.selection);
          cs.selection = [];
          _cSave(); _renderConstruction();
        }
        e.preventDefault();

      } else if (meta && e.key === "z") {
        _undo(); e.preventDefault();

      } else if (meta && e.key === "d") {
        var dobjs = _gcObjects();
        if (!dobjs || !cs.selection.length) return;
        _pushHistory();
        var copies = GC.duplicateObjects(dobjs, cs.selection);
        copies.forEach(function (c) { dobjs.push(c); });
        cs.selection = copies.map(function (c) { return c.id; });
        _cSave(); _renderConstruction();
        e.preventDefault();

      } else if (meta && e.key === "c") {
        var cobjs = _gcObjects();
        if (!cobjs) return;
        var src = cs.selection.length
          ? cobjs.filter(function (o) { return cs.selection.indexOf(o.id) >= 0; })
          : cobjs;
        _clipboard = JSON.parse(JSON.stringify(src));
        e.preventDefault();

      } else if (meta && e.key === "v") {
        if (!_clipboard || !_clipboard.length) return;
        var pobjs = _gcObjects();
        if (!pobjs) return;
        _pushHistory();
        var pasted = _clipboard.map(function (o) {
          var c = Object.assign({}, o, { id: "obj_" + Math.random().toString(36).slice(2, 9) });
          c.x1 !== undefined && (c.x1 += 0.04, c.x2 += 0.04);
          c.x  !== undefined && (c.x  += 0.04);
          c.cx !== undefined && (c.cx += 0.04);
          c.y1 !== undefined && (c.y1 += 0.04, c.y2 += 0.04);
          c.y  !== undefined && (c.y  += 0.04);
          c.cy !== undefined && (c.cy += 0.04);
          return c;
        });
        pasted.forEach(function (c) { pobjs.push(c); });
        cs.selection = pasted.map(function (c) { return c.id; });
        _cSave(); _renderConstruction();
        e.preventDefault();
      }
    });

    // External events
    if (SBE.Events) {
      SBE.Events.on("symbols:import-complete", _onImportComplete);
      SBE.Events.on("symbols:set-activated",   _onSetActivated);
      SBE.Events.on("symbols:glyph-changed",   _onGlyphChanged);
    }
  }

  // ── Workbench UI ──────────────────────────────────────────────────────────

  function _buildWorkbenchUI(container) {
    var SS = _SS();
    if (!SS) {
      container.innerHTML = '<div class="slab-error">SymbolSystem not loaded.</div>';
      return;
    }

    var PRESET_NAMES = SS.getPalettePresetNames();
    var FAMILY_TABS  = [
      { id: "typographic", label: "ABC", title: "Typographic" },
      { id: "iconic",      label: "✶",  title: "Iconic"       },
      { id: "musical",     label: "♩",  title: "Musical"      },
      { id: "transport",   label: "⬡",  title: "Transport"    },
      { id: "territorial", label: "✗",  title: "Territorial"  },
      { id: "procedural",  label: "◈",  title: "Procedural"   },
    ];
    var WB_PREV_TABS = [
      { id: "word",    label: "WORD"    },
      { id: "poem",    label: "POEM"    },
      { id: "pattern", label: "PATTERN" },
      { id: "world",   label: "WORLD"   },
    ];

    var set        = _activeSet();
    var curPalette = (set && set.palette) ? set.palette : SS.getPalettePreset("braun");

    container.innerHTML = [
      '<div class="slab-workbench">',

        // ── Header (set selector) ─────────────────────────────────────────
        '<div class="swb-header">',
          '<select class="slab-set-select" title="Active symbol set"></select>',
          '<button class="slab-btn slab-btn-new"    title="Create new set">+ New</button>',
          '<button class="slab-btn slab-btn-import" title="Import from file">↑ Import</button>',
          '<input type="file" class="slab-import-input" accept="application/json" style="display:none">',
          '<button class="slab-btn slab-btn-menu"   title="Set options">≡</button>',
        '</div>',

        // ── 4-column body ─────────────────────────────────────────────────
        '<div class="swb-body">',

          // Col 1 — Slot library
          '<div class="swb-slot-col">',
            '<div class="slab-family-tabs">',
              FAMILY_TABS.map(function (t) {
                return '<button class="slab-tab' + (_activeFamily === t.id ? " active" : "") +
                  '" data-family="' + t.id + '" title="' + t.title + '">' + t.label + '</button>';
              }).join(""),
            '</div>',
            '<div class="slab-slot-grid"></div>',
          '</div>',

          // Col 2 — Construction editor
          '<div class="swb-editor-col">',
            '<canvas class="slab-preview-canvas" width="300" height="300"></canvas>',
            '<div class="slab-mode-controls"></div>',
          '</div>',

          // Col 3 — Contextual output: preview + palette + deploy
          '<div class="swb-output-col">',
            // Preview mode tabs
            '<div class="swb-ptabs">',
              WB_PREV_TABS.map(function (t) {
                return '<button class="swb-ptab' + (_wbPreviewMode === t.id ? " active" : "") +
                  '" data-wbmode="' + t.id + '">' + t.label + '</button>';
              }).join(""),
            '</div>',
            // Preview canvas
            '<canvas class="swb-preview-canvas" width="380" height="380"></canvas>',
            // Mode-specific controls (word text, poem textarea, etc.)
            '<div class="swb-preview-controls"></div>',
            // Palette
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
                '<input type="color" class="slab-color-stroke" value="' + (curPalette.strokeColor || "#ffffff") + '">',
              '</label>',
              '<label class="slab-color-label" title="Fill color">',
                '<span>F</span>',
                '<input type="color" class="slab-color-fill" value="' + (curPalette.fillColor || "#ffffff") + '">',
              '</label>',
              '<select class="slab-mode-select" title="Render mode">',
                ["stroke","fill","fill+stroke","inverse"].map(function (m) {
                  return '<option value="' + m + '"' + (curPalette.mode === m ? " selected" : "") + '>' + m + '</option>';
                }).join(""),
              '</select>',
            '</div>',
            // Deploy: place + brush
            '<div class="slab-place-bar">',
              '<span class="slab-section-label">Deploy</span>',
              '<div class="slab-place-actions">',
                '<button class="slab-btn slab-btn-place" title="Arm slot for single-click placement">',
                  '↓ Place "' + (_activeSlotKey() === " " ? "SPACE" : _activeSlotKey()) + '"',
                '</button>',
                '<button class="slab-btn slab-btn-brush" title="Arm slot for brush-stamp mode">',
                  '⌖ Brush',
                '</button>',
              '</div>',
              '<div class="slab-brush-params">',
                '<label class="slab-brush-label">Spacing',
                  '<input class="slab-brush-input" type="range" data-brush="spacing"',
                    ' min="8" max="128" step="4" value="32">',
                  '<span class="slab-brush-val" data-brushval="spacing">32</span>',
                '</label>',
                '<label class="slab-brush-label">Rnd Rot',
                  '<input class="slab-brush-input" type="range" data-brush="randomRotation"',
                    ' min="0" max="180" step="5" value="0">',
                  '<span class="slab-brush-val" data-brushval="randomRotation">0°</span>',
                '</label>',
                '<label class="slab-brush-label">Rnd Scale',
                  '<input class="slab-brush-input" type="range" data-brush="randomScale"',
                    ' min="0" max="100" step="5" value="0">',
                  '<span class="slab-brush-val" data-brushval="randomScale">0%</span>',
                '</label>',
              '</div>',
            '</div>',
            // Bridge (legacy)
            '<div class="slab-bridge-bar">',
              '<span class="slab-section-label slab-legacy-label">LEGACY</span>',
              '<button class="slab-btn slab-btn-open-gl slab-btn-legacy" disabled>Open in GlyphLab ↗</button>',
              '<button class="slab-btn slab-btn-sync-gl slab-btn-legacy" disabled>Sync from GlyphLab</button>',
            '</div>',
          '</div>',

        '</div>', // .swb-body
      '</div>',  // .slab-workbench
    ].join("");

    // ── Wire refs ─────────────────────────────────────────────────────────
    _previewCanvas   = container.querySelector(".slab-preview-canvas");
    _wbPreviewCanvas = container.querySelector(".swb-preview-canvas");
    _wbModeControls  = container.querySelector(".swb-preview-controls");
    _modeControls    = container.querySelector(".slab-mode-controls");
    _slotGrid        = container.querySelector(".slab-slot-grid");
    _setSelect       = container.querySelector(".slab-set-select");

    // Construction canvas always in glyph mode
    _previewMode = "glyph";
    _previewCanvas.tabIndex = 0;
    _attachConstructionEvents(_previewCanvas);
    requestAnimationFrame(function () {
      _resizeHiDPI(_previewCanvas);
      requestAnimationFrame(function () { _resizeHiDPI(_wbPreviewCanvas); });
    });

    // ── Populate ──────────────────────────────────────────────────────────
    _buildSetOptions();
    _buildSlotGrid(_slotGrid);
    _buildModeControls(container);  // glyph tools → _modeControls (col 2)
    _buildWbPreviewControls();       // preview controls → _wbModeControls (col 3)
    _renderConstruction();
    _renderWbPreview();

    // ── Events ────────────────────────────────────────────────────────────

    // Workbench preview tabs (output col — switches _wbPreviewMode only)
    container.querySelector(".swb-ptabs").addEventListener("click", function (e) {
      var btn = e.target.closest(".swb-ptab");
      if (!btn) return;
      _wbPreviewMode = btn.dataset.wbmode;
      container.querySelectorAll(".swb-ptab").forEach(function (b) {
        b.classList.toggle("active", b.dataset.wbmode === _wbPreviewMode);
      });
      _buildWbPreviewControls();
      _renderWbPreview();
    });

    // Set selector
    _setSelect.addEventListener("change", function () {
      if (_SS()) _SS().setActiveSet(this.value || null);
      _buildSetOptions();
      _buildSlotGrid(_slotGrid);
      _syncSlotActive();
      _renderActivePreview();
    });

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
      _renderActivePreview();
    });

    var importInput = container.querySelector(".slab-import-input");
    container.querySelector(".slab-btn-import").addEventListener("click", function () { importInput.click(); });
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
        _renderActivePreview();
      });
      this.value = "";
    });

    container.querySelector(".slab-btn-menu").addEventListener("click", function () { _showSetMenu(this); });

    container.querySelector(".slab-family-tabs").addEventListener("click", function (e) {
      var btn = e.target.closest(".slab-tab");
      if (!btn) return;
      _activeFamily = btn.dataset.family;
      container.querySelectorAll(".slab-tab").forEach(function (t) {
        t.classList.toggle("active", t.dataset.family === _activeFamily);
      });
      _buildSlotGrid(_slotGrid);
    });

    _slotGrid.addEventListener("click", function (e) {
      var btn = e.target.closest(".slab-slot-btn");
      if (!btn) return;
      _setActiveSlotKey(btn.dataset.slot, container);
    });

    container.querySelector(".slab-btn-open-gl").addEventListener("click", _openInGlyphLab);
    container.querySelector(".slab-btn-sync-gl").addEventListener("click", _syncFromGlyphLab);

    container.querySelector(".slab-palette-preset").addEventListener("change", function () {
      var SS = _SS(); var set = _activeSet();
      if (!SS || !set) return;
      var preset = SS.getPalettePreset(this.value);
      if (!preset) return;
      preset._preset = this.value;
      set.palette = preset;
      SS.registerSet(set);
      container.querySelector(".slab-color-stroke").value = preset.strokeColor || "#ffffff";
      container.querySelector(".slab-color-fill").value   = preset.fillColor   || "#ffffff";
      container.querySelector(".slab-mode-select").value  = preset.mode        || "stroke";
      _refreshAllThumbs();
      _renderActivePreview();
    });

    container.querySelector(".slab-color-stroke").addEventListener("input", function () {
      var set = _activeSet(); if (!set) return;
      set.palette.strokeColor = this.value;
      var SS = _SS(); if (SS) SS.registerSet(set);
      _refreshAllThumbs(); _renderActivePreview();
    });

    container.querySelector(".slab-color-fill").addEventListener("input", function () {
      var set = _activeSet(); if (!set) return;
      set.palette.fillColor = this.value;
      var SS = _SS(); if (SS) SS.registerSet(set);
      _refreshAllThumbs(); _renderActivePreview();
    });

    container.querySelector(".slab-mode-select").addEventListener("change", function () {
      var set = _activeSet(); if (!set) return;
      set.palette.mode = this.value;
      var SS = _SS(); if (SS) SS.registerSet(set);
      _refreshAllThumbs(); _renderActivePreview();
    });

    container.querySelector(".slab-btn-place").addEventListener("click", function () {
      var SS = _SS(); var set = _activeSet();
      if (!SS || !set) return;
      var wos = global._wos;
      if (!wos || !wos.state) return;
      var slotKey = _activeSlotKey();
      wos.state.symbols.activeSetId   = set.id;
      wos.state.symbols.activeSlotKey = slotKey;
      wos.state.tool = "symbol-place";
      if (typeof wos.syncUI === "function") wos.syncUI();
    });

    container.querySelector(".slab-btn-brush").addEventListener("click", function () {
      var SS = _SS(); var set = _activeSet();
      if (!SS || !set) return;
      var wos = global._wos;
      if (!wos || !wos.state) return;
      var slotKey = _activeSlotKey();
      wos.state.symbols.activeSetId   = set.id;
      wos.state.symbols.activeSlotKey = slotKey;
      wos.state.tool = "symbol-brush";
      if (typeof wos.syncUI === "function") wos.syncUI();
    });

    container.querySelectorAll(".slab-brush-input").forEach(function (input) {
      var key = input.getAttribute("data-brush");
      var valSpan = container.querySelector('[data-brushval="' + key + '"]');
      var wos = global._wos;
      if (wos && wos.state && wos.state.symbolBrush && wos.state.symbolBrush[key] !== undefined) {
        input.value = wos.state.symbolBrush[key];
        if (valSpan) valSpan.textContent = _brushValLabel(key, wos.state.symbolBrush[key]);
      }
      input.addEventListener("input", function () {
        var v = parseFloat(this.value);
        var wos = global._wos;
        if (wos && wos.state && wos.state.symbolBrush) wos.state.symbolBrush[key] = v;
        if (valSpan) valSpan.textContent = _brushValLabel(key, v);
      });
    });

    container.addEventListener("keydown", function (e) {
      var cs  = _gcState();
      var GC  = global.WOS && global.WOS.GlyphConstructor;
      if (!cs || !GC) return;
      var meta = e.metaKey || e.ctrlKey;

      if (e.key === "Escape") {
        cs.tool = "select"; _cHover = null;
        _rebuildConstructionToolbar();
        e.preventDefault();
      } else if ((e.key === "Delete" || e.key === "Backspace") && cs.selection.length) {
        var dset = _activeSet(), dkey = _activeSlotKey();
        if (dset && dset.glyphs[dkey]) {
          _pushHistory();
          dset.glyphs[dkey].objects = GC.removeObjects(dset.glyphs[dkey].objects, cs.selection);
          cs.selection = [];
          _cSave(); _renderConstruction();
        }
        e.preventDefault();
      } else if (meta && e.key === "z") {
        _undo(); e.preventDefault();
      } else if (meta && e.key === "d") {
        var dobjs = _gcObjects();
        if (!dobjs || !cs.selection.length) return;
        _pushHistory();
        var copies = GC.duplicateObjects(dobjs, cs.selection);
        copies.forEach(function (c) { dobjs.push(c); });
        cs.selection = copies.map(function (c) { return c.id; });
        _cSave(); _renderConstruction();
        e.preventDefault();
      } else if (meta && e.key === "c") {
        var cobjs = _gcObjects();
        if (!cobjs) return;
        var src = cs.selection.length
          ? cobjs.filter(function (o) { return cs.selection.indexOf(o.id) >= 0; })
          : cobjs;
        _clipboard = JSON.parse(JSON.stringify(src));
        e.preventDefault();
      } else if (meta && e.key === "v") {
        if (!_clipboard || !_clipboard.length) return;
        var pobjs = _gcObjects();
        if (!pobjs) return;
        _pushHistory();
        var pasted = _clipboard.map(function (o) {
          var c = Object.assign({}, o, { id: "obj_" + Math.random().toString(36).slice(2, 9) });
          c.x1 !== undefined && (c.x1 += 0.04, c.x2 += 0.04);
          c.x  !== undefined && (c.x  += 0.04);
          c.cx !== undefined && (c.cx += 0.04);
          c.y1 !== undefined && (c.y1 += 0.04, c.y2 += 0.04);
          c.y  !== undefined && (c.y  += 0.04);
          c.cy !== undefined && (c.cy += 0.04);
          return c;
        });
        pasted.forEach(function (c) { pobjs.push(c); });
        cs.selection = pasted.map(function (c) { return c.id; });
        _cSave(); _renderConstruction();
        e.preventDefault();
      }
    });

    if (SBE.Events) {
      SBE.Events.on("symbols:import-complete", _onImportComplete);
      SBE.Events.on("symbols:set-activated",   _onSetActivated);
      SBE.Events.on("symbols:glyph-changed",   _onGlyphChanged);
    }
  }

  function mountWorkbench(container) {
    _mounted      = true;
    _worldT       = 0;
    _worldLastMs  = 0;
    _wbWorldT     = 0;
    _wbWorldLastMs = 0;
    _buildWorkbenchUI(container);
    if (global._wos && global._wos.shortcuts) {
      global._wos.shortcuts.suspend();
    }
    console.log("[SymbolDrawer] mounted (workbench)");
  }

  function _brushValLabel(key, v) {
    if (key === "randomRotation") return Math.round(v) + "°";
    if (key === "randomScale")    return Math.round(v) + "%";
    return Math.round(v);
  }

  // ── External event handlers ───────────────────────────────────────────────

  function _onImportComplete() {
    _buildSetOptions();
    _buildSlotGrid(_slotGrid);
    _renderActivePreview();
  }

  function _onSetActivated() {
    _buildSetOptions();
    _buildSlotGrid(_slotGrid);
    _renderActivePreview();
  }

  function _onGlyphChanged(payload) {
    if (payload && payload.slotKey === _activeSlotKey()) _renderActivePreview();
    _refreshAllThumbs();
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  function _escAttr(s) {
    return String(s || "").replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;");
  }

  function _escHTML(s) {
    return String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  }

  // ── Mount / Unmount ───────────────────────────────────────────────────────

  function mount(container) {
    _mounted    = true;
    _worldT     = 0;
    _worldLastMs = 0;
    _buildUI(container);
    if (global._wos && global._wos.shortcuts) {
      global._wos.shortcuts.suspend();
    }
    console.log("[SymbolDrawer] mounted");
  }

  function unmount(container) {
    _mounted = false;
    _stopWorldAnim();
    _stopWbWorldAnim();
    _cDrag           = null;
    _cHover          = null;
    _liveCanvas      = null;
    _wbPreviewCanvas = null;
    _wbModeControls  = null;
    if (_previewCanvas) _detachConstructionEvents(_previewCanvas);

    if (SBE.Events) {
      SBE.Events.off("symbols:import-complete", _onImportComplete);
      SBE.Events.off("symbols:set-activated",   _onSetActivated);
      SBE.Events.off("symbols:glyph-changed",   _onGlyphChanged);
    }

    _previewCanvas   = null;
    _modeControls    = null;
    _slotGrid        = null;
    _setSelect       = null;
    _wbPreviewCanvas = null;
    _wbModeControls  = null;
    container.innerHTML = "";

    if (global._wos && global._wos.shortcuts) {
      global._wos.shortcuts.resume();
    }
    console.log("[SymbolDrawer] unmounted");
  }

  // ── Registration ──────────────────────────────────────────────────────────

  function _register() {
    if (!SBE.DrawerSystem) {
      console.warn("[SymbolDrawer] DrawerSystem not found — registration skipped");
      return;
    }
    SBE.DrawerSystem.registerDrawer({
      id:                  "symbols",
      title:               "SymbolLab",
      side:                "right",
      width:               "wide",   // 560px
      closeOnOutsideClick: false,
      takesFocus:          true,
      capturesWheel:       true,
      mount:               mount,
      unmount:             unmount,
    });
    console.log("[SymbolDrawer] registered with DrawerSystem");
  }

  _register();

  // Public API for workbench mounting (called by controls.js WorkbenchSystem)
  SBE.SymbolDrawer = {
    mount:   mountWorkbench,
    unmount: unmount,
  };

  console.log("[WOS SymbolDrawer] Loaded — v2.3.0");
})(window);
