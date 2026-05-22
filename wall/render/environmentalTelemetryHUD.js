(function (global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  // ── EnvironmentalTelemetryHUD (0520O_WOS_EnvironmentalTelemetryHUD_v1.0.0) ─
  //
  // Renders live environmental truth into the world telemetry HUD.
  // Subscribes to broadcast:realityStateUpdated from RealitySyncRuntime.
  // Does NOT fetch APIs — only presents resolved data.
  //
  // MODIFICATIONS TO EXISTING HUD:
  //   .wt-weather-label  ← overwritten with real condition label + glyph
  //   .wt-temp           ← overwritten with real °F temperature
  //
  // APPENDED BLOCK:
  //   .wt-reality        ← injected after .wt-conditions
  //     .wt-reality-row  (humidity, precipitation, wind)
  //     .wt-reality-status (LIVE / STALE / OFFLINE indicator)
  //
  // STATUS SEMANTICS:
  //   LIVE    — data < 20 minutes old  (green dot)
  //   STALE   — data 20–60 min old     (amber dot)
  //   OFFLINE — no data                (dim dot)
  //
  // AESTHETIC:
  //   Matches existing monospace HUD — uppercase labels, tight tracking,
  //   muted palette. No color that fights the map.

  // ── CSS injection ─────────────────────────────────────────────────────────
  var _CSS = [
    ".wt-reality {",
    "  margin-top: 6px;",
    "  padding-top: 5px;",
    "  border-top: 1px solid rgba(255,255,255,0.10);",
    "  display: flex;",
    "  flex-direction: column;",
    "  gap: 2px;",
    "}",
    ".wt-reality-row {",
    "  display: flex;",
    "  gap: 10px;",
    "  font-size: 9px;",
    "  letter-spacing: 0.08em;",
    "  color: rgba(255,255,255,0.45);",
    "  text-transform: uppercase;",
    "  font-family: inherit;",
    "}",
    ".wt-reality-row span {",
    "  white-space: nowrap;",
    "}",
    ".wt-reality-status {",
    "  display: flex;",
    "  align-items: center;",
    "  gap: 5px;",
    "  margin-top: 3px;",
    "  font-size: 8px;",
    "  letter-spacing: 0.12em;",
    "  color: rgba(255,255,255,0.28);",
    "  text-transform: uppercase;",
    "  font-family: inherit;",
    "}",
    ".wt-reality-dot {",
    "  width: 5px;",
    "  height: 5px;",
    "  border-radius: 50%;",
    "  flex-shrink: 0;",
    "  background: rgba(255,255,255,0.20);",
    "  transition: background 1.2s ease;",
    "}",
    ".wt-reality-dot.live   { background: rgba(120,220,120,0.70); }",
    ".wt-reality-dot.stale  { background: rgba(220,180,80,0.60); }",
    ".wt-reality-dot.offline{ background: rgba(255,255,255,0.15); }",
  ].join("\n");

  function _injectCSS() {
    if (global.document.getElementById("wt-reality-styles")) return;
    var style = global.document.createElement("style");
    style.id = "wt-reality-styles";
    style.textContent = _CSS;
    global.document.head.appendChild(style);
  }

  // ── DOM helpers ───────────────────────────────────────────────────────────
  function _qs(sel, root) { return (root || global.document).querySelector(sel); }

  function _ensureRealityBlock(hud) {
    var existing = hud.querySelector(".wt-reality");
    if (existing) return existing;

    var block = global.document.createElement("div");
    block.className = "wt-reality";
    block.innerHTML = [
      '<div class="wt-reality-row">',
      '  <span class="wt-r-humidity">—</span>',
      '  <span class="wt-r-precip">—</span>',
      '  <span class="wt-r-wind">—</span>',
      '</div>',
      '<div class="wt-reality-status">',
      '  <div class="wt-reality-dot offline"></div>',
      '  <span class="wt-r-status-label">OFFLINE</span>',
      '</div>',
    ].join("");

    // Insert after .wt-conditions if present, else append
    var conditions = hud.querySelector(".wt-conditions");
    if (conditions && conditions.nextSibling) {
      hud.insertBefore(block, conditions.nextSibling);
    } else {
      hud.appendChild(block);
    }
    return block;
  }

  // ── Update HUD from resolved state ────────────────────────────────────────
  function _applyState(resolved, status) {
    var hud = _qs("#world-telemetry-hud");
    if (!hud) return;

    // ── Override procedural weather label ────────────────────────────────
    var weatherLabel = hud.querySelector(".wt-weather-label");
    if (weatherLabel && resolved) {
      weatherLabel.textContent = resolved.glyph + " " + resolved.label;
    }

    // ── Override procedural temperature ──────────────────────────────────
    var tempEl = hud.querySelector(".wt-temp");
    if (tempEl && resolved && resolved.temperatureF != null) {
      tempEl.textContent = Math.round(resolved.temperatureF) + "°";
    }

    // ── Reality block ─────────────────────────────────────────────────────
    var block = _ensureRealityBlock(hud);

    var humidityEl = block.querySelector(".wt-r-humidity");
    var precipEl   = block.querySelector(".wt-r-precip");
    var windEl     = block.querySelector(".wt-r-wind");
    var dot        = block.querySelector(".wt-reality-dot");
    var statusLbl  = block.querySelector(".wt-r-status-label");

    if (resolved) {
      if (humidityEl) humidityEl.textContent = "HUM " + Math.round(resolved.humidity * 100) + "%";
      if (precipEl)   precipEl.textContent   = "PRECIP " + resolved.precipMmPerHr.toFixed(1) + "mm/h";
      if (windEl)     windEl.textContent     = "WIND " + resolved.windMph + "mph";
    } else {
      if (humidityEl) humidityEl.textContent = "HUM —";
      if (precipEl)   precipEl.textContent   = "PRECIP —";
      if (windEl)     windEl.textContent     = "WIND —";
    }

    // Status dot
    if (dot) {
      dot.className = "wt-reality-dot " + (status || "offline");
    }
    if (statusLbl) {
      statusLbl.textContent = (status || "offline").toUpperCase();
    }
  }

  // ── Subscription ──────────────────────────────────────────────────────────
  function _subscribe() {
    var bus = SBE.WorkspaceEventBus;
    if (!bus) {
      console.warn("[EnvironmentalTelemetryHUD] WorkspaceEventBus not available");
      return;
    }
    bus.on("broadcast:realityStateUpdated", function (payload) {
      _applyState(payload.state, payload.status);
    });
  }

  // ── init ──────────────────────────────────────────────────────────────────
  function init() {
    _injectCSS();
    _subscribe();

    // Seed from current state if RealitySyncRuntime already has data
    var rsr = SBE.RealitySyncRuntime;
    if (rsr) {
      var st = rsr.getState();
      if (st && st.resolved) {
        _applyState(st.resolved, st.status);
      }
    }

    console.log("[EnvironmentalTelemetryHUD] initialized v1.0.0 — subscribed to reality truth pipeline");
  }

  SBE.EnvironmentalTelemetryHUD = { init: init };

})(window);
