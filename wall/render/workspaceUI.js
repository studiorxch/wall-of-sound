(function initWorkspaceUI(global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  // ── Workspace UI (0518_WOS_WorkspaceArchitecture_v1.0.0) ─────────────────
  //
  // DOM manager. Injects and maintains three chrome surfaces:
  //
  //   #ws-tab-bar       — flex child, order:-1, inside .canvas-area
  //   #ws-sidebar-nav   — prepended to #left-rail, above existing buttons
  //   #ws-lower-panel   — flex child, inside .canvas-area, below canvas-wrap
  //
  // Responds to SBE.Workspace events: tabsChanged, activeDocumentChanged,
  // sidebarContextChanged. Never touches simulation state.

  // ── Sidebar nav definition (0520_WOS_WorldRuntimeArchitecture_v1.0.0) ───────
  // Sections mirror the canonical runtime hierarchy:
  //   WORLD → ZONES → SYSTEMS → VISUALIZATION → (utility)
  // Items with `section` render as non-interactive section labels.
  var NAV_ITEMS = [
    { section: "WORLD" },
    { ctx: "world",     icon: "◎", tooltip: "World" },
    { section: "ZONES" },
    { ctx: "zones",     icon: "⬡", tooltip: "Zones" },
    { section: "SYSTEMS" },
    { ctx: "routes",    icon: "⬡", tooltip: "Routes" },
    { ctx: "layers",    icon: "▤", tooltip: "Layers" },
    { ctx: "sequences", icon: "⋮⋮", tooltip: "Sequences" },
    { section: "VIZ" },
    { ctx: "assets",    icon: "◻", tooltip: "Assets" },
    { section: "—" },
    { ctx: "settings",  icon: "⚙", tooltip: "Settings" },
    { ctx: "help",      icon: "?",  tooltip: "Help" },
  ];

  // ── DOM refs ──────────────────────────────────────────────────────────────
  var _surfaceRail = null;   // replaces _tabBar
  var _sidebarNav  = null;
  var _lowerPanel  = null;
  var _navBtns     = {};   // ctx → button element

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    if (!SBE.Workspace) {
      console.warn("[WorkspaceUI] SBE.Workspace not available — skipping UI init");
      return;
    }

    // WorldRuntime is the authoritative world root — initialize before UI
    if (SBE.WorldRuntime) SBE.WorldRuntime.init();

    // World atmosphere systems — clock, weather, moon, calendar, atmosphere
    if (SBE.WorldAtmosphereSystem) SBE.WorldAtmosphereSystem.init();

    _buildMapboxViewport();
    _buildSidebarNav();
    _buildSurfaceRail();   // injected above sidebar nav in left-rail
    _buildLowerPanel();

    // Mark canvas-area for padding overrides
    var canvasArea = document.querySelector(".canvas-area");
    if (canvasArea) canvasArea.classList.add("ws-chrome-active");

    // Subscribe to workspace events via WorkspaceEventBus
    SBE.WorkspaceEventBus.on("workspace:surfacesChanged",      _onTabsChanged);
    SBE.WorkspaceEventBus.on("surface:opened",                 _onActiveDocChanged);
    SBE.WorkspaceEventBus.on("sidebar:changed",                _onSidebarContextChanged);
    SBE.WorkspaceEventBus.on("surface:saved",                  _updateLowerPanel);
    SBE.WorkspaceEventBus.on("surface:loaded",                 _updateLowerPanel);
    SBE.WorkspaceEventBus.on("workspace:interactionModeChanged", _updateLowerPanel);
    SBE.WorkspaceEventBus.on("world:zoneCreated",              _updateLowerPanel);
    SBE.WorkspaceEventBus.on("world:zoneDeleted",              _updateLowerPanel);
    SBE.WorkspaceEventBus.on("routes:changed",                 _updateLowerPanel);

    // Activate map for initial route document
    _syncMapToActiveDoc();

    // Initial render
    _onTabsChanged({ docs: SBE.Workspace.getAllSurfaces(), activeId: _getActiveId() });
    _onSidebarContextChanged({ context: SBE.Workspace.getSidebarContext() });
    _updateLowerPanel();

    console.log("[WorkspaceUI] initialized");
  }

  // ── Mapbox viewport injection ─────────────────────────────────────────────
  function _buildMapboxViewport() {
    var canvasArea = document.querySelector(".canvas-area");
    if (!canvasArea) {
      console.warn("[WorkspaceUI] .canvas-area not found — Mapbox viewport not injected");
      return;
    }
    if (document.getElementById("mapbox-viewport")) return; // idempotent

    var viewport = document.createElement("div");
    viewport.id = "mapbox-viewport";

    // Insert before canvas-wrap so canvas overlays the map
    var canvasWrap = document.getElementById("canvas-wrap");
    if (canvasWrap) {
      canvasArea.insertBefore(viewport, canvasWrap);
    } else {
      canvasArea.insertBefore(viewport, canvasArea.firstChild);
    }

    // Init Mapbox if available
    if (SBE.MapboxViewportRuntime) {
      SBE.MapboxViewportRuntime.init(viewport);
    }

    // Surface overlay canvas — drawing layer above route overlays
    _buildSurfaceOverlay(canvasArea);

    // Atmosphere compositor — fullscreen mood layer between Mapbox and canvas stack
    if (SBE.AtmosphereComposite) SBE.AtmosphereComposite.init();

    // World Telemetry HUD — cinematic environmental instrumentation (replaces WorldHUD)
    if (SBE.WorldTelemetryHUD) SBE.WorldTelemetryHUD.init();
    // WorldHUD is superseded — do not call WorldHUD.init()

    // Geo camera controls — injected once alongside the viewport
    _buildGeoCameraControls(canvasArea);
  }

  // ── Surface overlay canvas ────────────────────────────────────────────────
  function _buildSurfaceOverlay(canvasArea) {
    if (document.getElementById("surface-overlay")) return; // idempotent

    var overlay = document.createElement("canvas");
    overlay.id = "surface-overlay";

    // Size to match canvas-area; will be kept in sync via resize observer
    var rect = canvasArea.getBoundingClientRect();
    overlay.width  = rect.width  > 0 ? Math.round(rect.width)  : 1;
    overlay.height = rect.height > 0 ? Math.round(rect.height) : 1;

    canvasArea.appendChild(overlay);

    // Initialise drawing runtime
    if (SBE.SurfaceDrawingRuntime) {
      SBE.SurfaceDrawingRuntime.init(overlay);
    }

    // Keep overlay canvas sized to canvas-area on resize
    if (typeof ResizeObserver !== "undefined") {
      var ro = new ResizeObserver(function () {
        if (SBE.SurfaceDrawingRuntime) SBE.SurfaceDrawingRuntime.syncCanvasSize();
      });
      ro.observe(canvasArea);
    }

    // Sync pointer-events and mode classes with interaction mode.
    // All three mode classes are mutually exclusive and applied atomically so
    // CSS pointer-event selectors always see a consistent single-mode state.
    SBE.WorkspaceEventBus.on("workspace:interactionModeChanged", function (evt) {
      var mode   = evt.mode || "navigate";
      var isDraw = mode === "draw";
      // Surface overlay owns pointer only in draw mode; Mapbox owns in navigate.
      overlay.style.pointerEvents = isDraw ? "auto" : "none";
      canvasArea.classList.toggle("ws-navigate-mode",   mode === "navigate");
      canvasArea.classList.toggle("ws-draw-mode",        isDraw);
      canvasArea.classList.toggle("ws-route-edit-mode",  mode === "route-edit");
    });
  }

  // ── Geo camera controls overlay ───────────────────────────────────────────
  function _buildGeoCameraControls(canvasArea) {
    if (document.getElementById("ws-geo-controls")) return; // idempotent

    var bar = document.createElement("div");
    bar.id = "ws-geo-controls";

    function _btn(label, title, action) {
      var b = document.createElement("button");
      b.className = "ws-geo-btn";
      b.textContent = label;
      b.title = title;
      b.addEventListener("click", function(e) {
        e.stopPropagation();
        action();
      });
      return b;
    }

    function _map() {
      return SBE.MapboxViewportRuntime && SBE.MapboxViewportRuntime.getMap
        ? SBE.MapboxViewportRuntime.getMap() : null;
    }

    bar.appendChild(_btn("+", "Zoom in", function() {
      var m = _map(); if (m) m.zoomIn({ duration: 200 });
    }));
    bar.appendChild(_btn("−", "Zoom out", function() {
      var m = _map(); if (m) m.zoomOut({ duration: 200 });
    }));
    bar.appendChild(_btn("↑", "Reset bearing", function() {
      var m = _map(); if (m) m.resetNorth({ duration: 400 });
    }));
    bar.appendChild(_btn("⊡", "Fit active route", function() {
      // Try RouteInputSystem first, fall back to routePlanner runtime
      var routes = SBE.RouteInputSystem ? SBE.RouteInputSystem.getRoutes() : [];
      if (routes.length) {
        SBE.RouteInputSystem.fitRoute(routes[0].id);
        return;
      }
      var surf = SBE.Workspace && SBE.Workspace.getActiveSurface();
      var rt = surf && surf.runtime;
      var rtRoutes = rt && rt.routes;
      if (rtRoutes && rtRoutes.length) {
        var r = rtRoutes[0];
        var wps = r.waypoints || [];
        if (!wps.length) return;
        var m = _map();
        if (!m) return;
        var lngs = wps.map(function(w) { return w.longitude; });
        var lats = wps.map(function(w) { return w.latitude; });
        m.fitBounds([
          [Math.min.apply(null, lngs), Math.min.apply(null, lats)],
          [Math.max.apply(null, lngs), Math.max.apply(null, lats)]
        ], { padding: 80, duration: 600 });
      }
    }));

    // Draw mode toggle — switches workspace interaction mode to "draw"
    var drawBtn = _btn("✏", "Draw on map", function() {
      if (!SBE.Workspace) return;
      var next = SBE.Workspace.getInteractionMode() === "draw" ? "navigate" : "draw";
      // Exit route-edit mode on runtime before switching
      if (next === "draw") {
        var surf = SBE.Workspace.getActiveSurface();
        var rt = surf && surf.runtime;
        if (rt && rt.setMode && rt.mode !== "view") rt.setMode("view");
      }
      SBE.Workspace.setInteractionMode(next);
    });
    bar.appendChild(drawBtn);

    // Route edit mode toggle
    var editBtn = _btn("✎", "Toggle route edit mode", function() {
      var surf = SBE.Workspace && SBE.Workspace.getActiveSurface();
      var rt = surf && surf.runtime;
      if (!rt || !rt.setMode) return;
      var nextMode = (rt.mode === "view") ? "route-edit" : "view";
      rt.setMode(nextMode);
      // Sync workspace interaction mode
      if (SBE.Workspace) {
        SBE.Workspace.setInteractionMode(nextMode === "route-edit" ? "route-edit" : "navigate");
      }
    });
    bar.appendChild(editBtn);

    // Keep buttons in sync with workspace interaction mode
    if (SBE.WorkspaceEventBus) {
      SBE.WorkspaceEventBus.on("workspace:interactionModeChanged", function(evt) {
        drawBtn.classList.toggle("ws-geo-btn--active", evt.mode === "draw");
        drawBtn.title = evt.mode === "draw" ? "Exit draw mode" : "Draw on map";
        editBtn.classList.toggle("ws-geo-btn--active", evt.mode === "route-edit");
        editBtn.title = evt.mode === "route-edit" ? "Exit route edit" : "Toggle route edit mode";
      });
      SBE.WorkspaceEventBus.on("runtime:modeChanged", function(evt) {
        editBtn.classList.toggle("ws-geo-btn--active", evt.mode === "route-edit");
      });
    }

    canvasArea.appendChild(bar);
  }

  function _syncMapToActiveDoc() {
    // isGeographicMode() is the single source of geographic truth.
    // It stays true once the workspace is initialized as geographic — never drops.
    // Do NOT gate on doc.type: that check flickers false during surface transitions
    // (last surface closed, replacement not yet opened) causing the geo classes to
    // drop off for one frame, which bleeds corridor geometry through the canvas.
    var isGeo = !!(SBE.Workspace &&
                   SBE.Workspace.isGeographicMode &&
                   SBE.Workspace.isGeographicMode());
    var canvasArea = document.querySelector(".canvas-area");
    var canvas     = document.getElementById("engine-canvas");

    if (canvasArea) {
      // Geographic state — both classes always transition together as one atomic state.
      canvasArea.classList.toggle("ws-map-active", isGeo);
      canvasArea.classList.toggle("ws-geo-mode",   isGeo);

      // Interaction mode classes — mutually exclusive, applied here so they are
      // always in sync with geo state even on initial mount and surface change.
      var imode = (SBE.Workspace &&
                   SBE.Workspace.getInteractionMode &&
                   SBE.Workspace.getInteractionMode()) || "navigate";
      canvasArea.classList.toggle("ws-navigate-mode",   imode === "navigate");
      canvasArea.classList.toggle("ws-draw-mode",        imode === "draw");
      canvasArea.classList.toggle("ws-route-edit-mode",  imode === "route-edit");
    }

    // Resize canvas to fill canvas-area so canvas pixels align with map CSS pixels.
    // Must run after CSS classes are applied (layout is synchronous here).
    if (isGeo && canvas && canvasArea) {
      requestAnimationFrame(function() {
        var rect = canvasArea.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          canvas.width  = Math.round(rect.width);
          canvas.height = Math.round(rect.height);
        }
      });
    }
  }

  // ── Surface Rail (0519_WOS_SurfaceRail_Architecture_v1.0.0) ─────────────
  // Replaces the horizontal tab bar with circular world/destination nodes
  // stacked vertically in the left rail, above the sidebar nav icons.
  // Each circle = one surface/world. Click to switch. Hover for telemetry.

  // Cinematic weather labels — shared with WorldTelemetryHUD
  var _CINEMATIC_LABELS = {
    "storm-night":"Storm Front","storm-day":"Storm Front",
    "snow-night":"Snow Veil","snow-day":"Snow Veil",
    "fog-night":"Cold Fog","fog-morning":"Cold Fog",
    "rain-night":"Rain Drift","rain-day":"Rain Drift",
    "full-moon":"Full Moon","clear-night":"Clear Night",
    "golden-hour":"Golden Hour","overcast-day":"Overcast",
    "clear-day":"Daylight","neutral":"",
  };

  function _hexToRgba(hex, alpha) {
    var h = hex.replace("#", "");
    if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    var r = parseInt(h.slice(0,2), 16);
    var g = parseInt(h.slice(2,4), 16);
    var b = parseInt(h.slice(4,6), 16);
    return "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
  }

  function _surfaceAbbr(doc) {
    // "Surface 1" or "Surface 12" → "1" or "12"
    var m = doc.name && (doc.name.match(/\s(\d+)$/) || doc.name.match(/^(\d+)$/));
    if (m) return m[1];
    // Multi-word → initials: "New York" → "NY"
    var words = (doc.name || "").trim().split(/\s+/);
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
    // Single word → first 2 chars
    return ((doc.name || "—").slice(0, 2)).toUpperCase();
  }

  function _buildSurfaceRail() {
    if (document.getElementById("ws-surface-rail")) return; // idempotent
    _surfaceRail = document.createElement("div");
    _surfaceRail.id = "ws-surface-rail";
    _surfaceRail.setAttribute("aria-label", "Surface rail — world destinations");

    // ＋ add button lives at the bottom of the rail (populated in _renderSurfaceNodes)
    var leftRail = document.getElementById("left-rail");
    if (leftRail && _sidebarNav) {
      // Insert ABOVE existing sidebar nav
      leftRail.insertBefore(_surfaceRail, _sidebarNav);
    } else if (leftRail) {
      leftRail.insertBefore(_surfaceRail, leftRail.firstChild);
    } else {
      console.warn("[WorkspaceUI] #left-rail not found — surface rail not injected");
    }
  }

  function _onTabsChanged(evt) {
    var docs     = (evt && evt.docs)     || SBE.Workspace.getAllSurfaces();
    var activeId = (evt && evt.activeId) || _getActiveId();
    _renderSurfaceNodes(docs, activeId);
    _updateLowerPanel();
  }

  function _renderSurfaceNodes(docs, activeId) {
    if (!_surfaceRail) return;

    // Preserve the add button reference, then rebuild
    _surfaceRail.innerHTML = "";

    docs.forEach(function (doc) {
      _surfaceRail.appendChild(_makeSurfaceNode(doc, activeId === doc.id));
    });

    // ＋ add surface button — minimal, dashed circle
    var addBtn = document.createElement("button");
    addBtn.className = "ws-sr-add";
    addBtn.title     = "New surface";
    addBtn.textContent = "＋";
    addBtn.setAttribute("aria-label", "Add new surface");
    addBtn.addEventListener("click", _onAddDocument);
    _surfaceRail.appendChild(addBtn);
  }

  function _makeSurfaceNode(doc, isActive) {
    var node = document.createElement("div");
    node.className  = "ws-sr-node" + (isActive ? " ws-sr-node--active" : "");
    node.dataset.docId = doc.id;

    // Circle button
    var btn = document.createElement("button");
    btn.className = "ws-sr-btn";
    btn.title     = doc.name;

    var accent = doc.accent || "#3dd8c5";
    btn.style.setProperty("--sa",        accent);
    btn.style.setProperty("--sa-bg",     _hexToRgba(accent, 0.14));
    btn.style.setProperty("--sa-border", _hexToRgba(accent, 0.28));

    // Abbreviation label inside circle
    var abbr = document.createElement("span");
    abbr.className   = "ws-sr-abbr";
    abbr.textContent = _surfaceAbbr(doc);
    btn.appendChild(abbr);

    // Hover tooltip — populated lazily when shown
    var tip = document.createElement("div");
    tip.className = "ws-sr-tip";
    tip.innerHTML =
      '<div class="ws-sr-tip-name"></div>'    +
      '<div class="ws-sr-tip-time"></div>'    +
      '<div class="ws-sr-tip-weather"></div>' +
      '<div class="ws-sr-tip-temp"></div>';

    // Pointer events
    btn.addEventListener("click", function () {
      SBE.Workspace.openDocument(doc.id);
    });

    btn.addEventListener("dblclick", function (e) {
      e.preventDefault();
      _renameSurfaceNode(btn, abbr, doc);
    });

    btn.addEventListener("mouseenter", function () {
      _populateSurfaceTip(tip, doc);
      tip.classList.add("ws-sr-tip--visible");
    });
    btn.addEventListener("mouseleave", function () {
      tip.classList.remove("ws-sr-tip--visible");
    });

    node.appendChild(btn);
    node.appendChild(tip);
    return node;
  }

  function _populateSurfaceTip(tip, doc) {
    // Pull current world telemetry for the tooltip — Phase 1: all surfaces share VLA state
    var clk = SBE.WorldClock      && SBE.WorldClock.getState();
    var wx  = SBE.WorldWeather    && SBE.WorldWeather.getState();
    var atm = SBE.WorldAtmosphere && SBE.WorldAtmosphere.getState();
    var vla = SBE.ViewportLocationAuthority && SBE.ViewportLocationAuthority.getState();

    var city   = (vla && vla.city)   || "";
    var region = (vla && vla.region) || "";
    var loc    = city + (region && region !== "—" ? ", " + region : "");

    var time   = (clk && clk.localTime) || "";
    var tzAbbr = "";
    if (vla && vla.timezone && vla.timezone !== "UTC") {
      try {
        var parts = new Intl.DateTimeFormat("en-US", {
          timeZone: vla.timezone, timeZoneName: "short"
        }).formatToParts(new Date());
        for (var i = 0; i < parts.length; i++) {
          if (parts[i].type === "timeZoneName") { tzAbbr = parts[i].value; break; }
        }
      } catch (e) {}
    }

    var mood  = (atm && atm.mood) || "neutral";
    var label = _CINEMATIC_LABELS[mood] !== undefined
      ? _CINEMATIC_LABELS[mood]
      : mood.replace(/-/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); });

    var tempStr = (wx && wx.temperatureF !== null && wx.temperatureF !== undefined)
      ? wx.temperatureF + "°" : "";

    var nameEl    = tip.querySelector(".ws-sr-tip-name");
    var timeEl    = tip.querySelector(".ws-sr-tip-time");
    var weatherEl = tip.querySelector(".ws-sr-tip-weather");
    var tempEl    = tip.querySelector(".ws-sr-tip-temp");

    if (nameEl)    nameEl.textContent    = (loc || doc.name).toUpperCase();
    if (timeEl)    timeEl.textContent    = time + (tzAbbr ? " · " + tzAbbr : "");
    if (weatherEl) weatherEl.textContent = label;
    if (tempEl)    tempEl.textContent    = tempStr;
  }

  function _renameSurfaceNode(btn, abbrEl, doc) {
    var input = document.createElement("input");
    input.type      = "text";
    input.value     = doc.name;
    input.className = "ws-sr-rename";

    function commit() {
      var val = input.value.trim();
      if (val && val !== doc.name) SBE.Workspace.renameDocument(doc.id, val);
      if (input.parentNode === btn) btn.replaceChild(abbrEl, input);
      abbrEl.textContent = _surfaceAbbr({ name: val || doc.name });
    }

    btn.replaceChild(input, abbrEl);
    input.focus();
    input.select();
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter")  { e.preventDefault(); commit(); }
      if (e.key === "Escape") {
        if (input.parentNode === btn) btn.replaceChild(abbrEl, input);
      }
    });
    input.addEventListener("blur", commit);
  }

  // ── Sidebar nav ───────────────────────────────────────────────────────────
  // Renders NAV_ITEMS with section header support.
  // Items with `section` property render as non-interactive dividers.
  function _buildSidebarNav() {
    _sidebarNav = document.createElement("div");
    _sidebarNav.id = "ws-sidebar-nav";

    NAV_ITEMS.forEach(function (item) {
      if (item.section !== undefined) {
        // Section divider label
        var label = document.createElement("div");
        label.className = "ws-nav-section";
        label.textContent = item.section;
        _sidebarNav.appendChild(label);
        return;
      }
      var btn = document.createElement("button");
      btn.className = "ws-nav-btn";
      btn.dataset.ctx = item.ctx;
      btn.dataset.tooltip = item.tooltip;
      btn.title = item.tooltip;
      btn.textContent = item.icon;
      btn.addEventListener("click", function () {
        SBE.Workspace.setSidebarContext(item.ctx);
      });
      _sidebarNav.appendChild(btn);
      _navBtns[item.ctx] = btn;
    });

    var leftRail = document.getElementById("left-rail");
    if (leftRail) {
      leftRail.insertBefore(_sidebarNav, leftRail.firstChild);
    } else {
      console.warn("[WorkspaceUI] #left-rail not found — sidebar nav not injected");
    }
  }

  function _onSidebarContextChanged(evt) {
    var ctx = evt.context;
    Object.keys(_navBtns).forEach(function (key) {
      _navBtns[key].classList.toggle("ws-nav-btn--active", key === ctx);
    });
  }

  // ── Lower panel ───────────────────────────────────────────────────────────
  function _buildLowerPanel() {
    _lowerPanel = document.createElement("div");
    _lowerPanel.id = "ws-lower-panel";

    var canvasArea = document.querySelector(".canvas-area");
    if (canvasArea) {
      canvasArea.appendChild(_lowerPanel);
    } else {
      console.warn("[WorkspaceUI] .canvas-area not found — lower panel not injected");
    }
  }

  // ── Lower panel — world-centric status bar ────────────────────────────────
  // Spec (0520): Status only. NOT debug spam.
  //   active world · active tool · zones · route count · persistence · [ OP ] [ VIEW ] · [TEL]
  function _updateLowerPanel() {
    if (!_lowerPanel) return;
    _lowerPanel.innerHTML = "";

    var doc   = SBE.Workspace    ? SBE.Workspace.getActiveSurface()   : null;
    var world = SBE.WorldRuntime ? SBE.WorldRuntime.getActiveWorld()  : null;
    var imode = SBE.Workspace    ? SBE.Workspace.getInteractionMode() : "navigate";

    // ── Left: accent dot + world name ─────────────────────────────────────
    var dot = document.createElement("div");
    dot.className = "ws-lower-accent-dot";
    dot.style.setProperty("--ws-lower-accent", doc ? doc.accent : "#3dd8c5");
    _lowerPanel.appendChild(dot);

    var worldSpan = document.createElement("div");
    worldSpan.className = "ws-lower-world";
    worldSpan.textContent = world ? world.name : "—";
    worldSpan.title = world ? (world.description || world.name) : "";
    _lowerPanel.appendChild(worldSpan);

    // ── Center: status fields ──────────────────────────────────────────────
    var status = document.createElement("div");
    status.className = "ws-lower-status";

    // Active tool (interaction mode)
    _addStatusField(status, "tool", imode);

    // Zone count (world-aware)
    var zoneCount = SBE.WorldRuntime ? SBE.WorldRuntime.getZones().length : 0;
    _addStatusField(status, "zones", zoneCount > 0 ? String(zoneCount) : "—");

    // Route count
    var routeCount = SBE.RouteInputSystem ? SBE.RouteInputSystem.getRoutes().length : 0;
    _addStatusField(status, "routes", routeCount > 0 ? String(routeCount) : "—");

    // Surfaces
    var surfaceCount = SBE.Workspace ? SBE.Workspace.getAllSurfaces().length : 0;
    _addStatusField(status, "surfaces", String(surfaceCount));

    // Persistence
    if (doc) _addPersistenceIndicator(status, doc);

    // ── Right: [ OP ] [ VIEW ] mode toggle ────────────────────────────────
    if (SBE.RuntimeViewportRouter) {
      var modeToggle = document.createElement("div");
      modeToggle.className = "ws-mode-toggle";
      ["operator", "presentation"].forEach(function (m) {
        var btn = document.createElement("button");
        btn.className = "ws-mode-btn" + (SBE.RuntimeViewportRouter.getMode() === m ? " ws-mode-btn--active" : "");
        btn.textContent = m === "operator" ? "OP" : "VIEW";
        btn.title = m === "operator" ? "Operator mode" : "Presentation mode";
        btn.addEventListener("click", function () {
          SBE.RuntimeViewportRouter.setMode(m);
          _updateLowerPanel();
        });
        modeToggle.appendChild(btn);
      });
      status.appendChild(modeToggle);
    }

    // ── Telemetry toggle [TEL] ─────────────────────────────────────────────
    if (SBE.WorldRuntime) {
      var telBtn = document.createElement("button");
      var isTel  = SBE.WorldRuntime.isTelemetryEnabled();
      telBtn.className = "ws-mode-btn" + (isTel ? " ws-mode-btn--active" : "");
      telBtn.textContent = "TEL";
      telBtn.title = isTel ? "Hide telemetry" : "Show telemetry";
      telBtn.addEventListener("click", function () {
        SBE.WorldRuntime.toggleTelemetry();
        _updateLowerPanel();
      });
      status.appendChild(telBtn);
    }

    _lowerPanel.appendChild(status);
  }

  function _addPersistenceIndicator(container, doc) {
    if (!SBE.SurfacePersistence) return;
    var hasSaved = SBE.SurfacePersistence.hasSaved(doc.surfaceId || doc.id);
    var label, cls;
    if (!hasSaved) {
      label = "● LOCAL"; cls = "ws-persist--local";
    } else if (doc.modified) {
      label = "● MODIFIED"; cls = "ws-persist--modified";
    } else {
      label = "● SAVED"; cls = "ws-persist--saved";
    }

    var el = document.createElement("div");
    el.className = "ws-persist-indicator " + cls;
    el.textContent = label;
    el.title = hasSaved ? "Saved to localStorage" : "Not yet saved — click to save";
    el.style.cursor = "pointer";
    el.addEventListener("click", function () {
      if (SBE.Workspace) {
        SBE.Workspace.saveSurface(doc.id);
        _updateLowerPanel();
      }
    });
    container.appendChild(el);
  }

  function _addStatusField(container, key, value) {
    var field = document.createElement("div");
    field.className = "ws-lower-field";
    field.innerHTML = key + " <span class=\"ws-lower-value\">" + _esc(value) + "</span>";
    container.appendChild(field);
  }

  function _esc(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  // ── Event handlers ────────────────────────────────────────────────────────
  function _onActiveDocChanged() {
    _syncMapToActiveDoc();
    _updateLowerPanel();
    // Refresh surface rail active indicator when the active surface changes
    _renderSurfaceNodes(SBE.Workspace.getAllSurfaces(), _getActiveId());
  }

  function _onAddDocument() {
    // New surfaces always start as route surfaces — name defaults to "Surface N"
    var doc = SBE.Workspace.createSurface("route");
    SBE.Workspace.openSurface(doc.id);
  }

  function _getActiveId() {
    var doc = SBE.Workspace ? SBE.Workspace.getActiveSurface() : null;
    return doc ? doc.id : null;
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  SBE.WorkspaceUI = {
    init: init,
  };

})(window);
