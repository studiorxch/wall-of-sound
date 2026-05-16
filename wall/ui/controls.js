(function initControls(global) {
  const SBE = (global.SBE = global.SBE || {});

  function createControls() {
    const elements = {
      // Transport / tempo
      bpmInput: byId("bpm-input"),
      barCount: byId("bar-count"),
      quantizeEnabled: byId("quantize-enabled"),
      quantizeDivision: byId("quantize-division"),
      togglePlayback: byId("toggle-playback"),
      recordLoop: byId("record-loop"),
      stopLoop: byId("stop-loop"),
      clearScene: byId("clear-scene"),
      exportLoop: byId("export-loop"),
      retakeLoop: byId("retake-loop"),
      loadExample: byId("load-example"),
      saveScene: byId("save-scene"),
      sceneFile: byId("scene-file"),
      textFontFile: byId("text-font-file"),
      backgroundFile: byId("background-file"),
      transparentBg: byId("transparent-bg"),
      frameSelect: byId("frame-select"),
      textFontStatus: byId("text-font-status"),
      engineStatus: byId("engine-status"),
      sceneStats: byId("scene-stats"),

      // Inspector fields
      activeNote: byId("active-note"),
      lineColor: byId("line-color"),
      lineThickness: byId("line-thickness"),
      lineThicknessValue: byId("line-thickness-value"),
      strokeWidth: byId("stroke-width"),
      strokeWidthValue: byId("stroke-width-value"),
      strokeWidthField: byId("stroke-width-field"),
      lineMechanic: byId("line-mechanic"),
      lineBehavior: byId("line-behavior"),
      lineStrength: byId("line-strength"),
      lineStrengthValue: byId("line-strength-value"),

      // Text fields
      textContent: byId("text-content"),
      textSize: byId("text-size"),
      textSizeValue: byId("text-size-value"),
      textX: byId("text-x"),
      textY: byId("text-y"),
      textScale: byId("text-scale"),
      textScaleValue: byId("text-scale-value"),
      textRotation: byId("text-rotation"),
      textRotationValue: byId("text-rotation-value"),
      centerText: byId("center-text"),

      // Text inspector block (for show/hide)
      textInspectorBlock: byId("text-inspector-block"),

      // Actions
      duplicateSelection: byId("duplicate-selection"),
      deleteSelection: byId("delete-selection"),
      undoAction: byId("undo-action"),
      duplicatePattern: byId("duplicate-pattern"),
      gridCols: byId("grid-cols"),
      gridRows: byId("grid-rows"),
      gridSpacingX: byId("grid-spacing-x"),
      gridSpacingY: byId("grid-spacing-y"),

      // Ball
      ballCount: byId("ball-count"),
      ballCountValue: byId("ball-count-value"),
      ballSpeed: byId("ball-speed"),
      ballSpeedValue: byId("ball-speed-value"),
      ballSpread: byId("ball-spread"),
      ballSpreadValue: byId("ball-spread-value"),

      // Particle
      particleShape: byId("particle-shape"),
      particleTrail: byId("particle-trail"),

      // Behavior emitter fields
      behaviorEmitterFields: byId("behavior-emitter-fields"),
      // FLOW
      behaviorEmitterRate: byId("behavior-emitter-rate"),
      behaviorEmitterRateValue: byId("behavior-emitter-rate-value"),
      behaviorEmitterDensity: byId("behavior-emitter-density"),
      behaviorEmitterDensityValue: byId("behavior-emitter-density-value"),
      // MOTION
      behaviorEmitterDirection: byId("behavior-emitter-direction"),
      behaviorEmitterDirectionValue: byId("behavior-emitter-direction-value"),
      behaviorEmitterSpread: byId("behavior-emitter-spread"),
      behaviorEmitterSpreadValue: byId("behavior-emitter-spread-value"),
      behaviorEmitterSpeed: byId("behavior-emitter-speed"),
      behaviorEmitterSpeedValue: byId("behavior-emitter-speed-value"),
      // FORM
      behaviorEmitterSize: byId("behavior-emitter-size"),
      behaviorEmitterSizeValue: byId("behavior-emitter-size-value"),
      behaviorEmitterLife: byId("behavior-emitter-life"),
      behaviorEmitterLifeValue: byId("behavior-emitter-life-value"),
      behaviorEmitterStyle: byId("behavior-emitter-style"),

      // Motion
      motionInspectorBlock: byId("motion-inspector-block"),
      motionEnabled: byId("motion-enabled"),
      motionVx: byId("motion-vx"),
      motionVxValue: byId("motion-vx-value"),
      motionVy: byId("motion-vy"),
      motionVyValue: byId("motion-vy-value"),
      motionRot: byId("motion-rot"),
      motionRotValue: byId("motion-rot-value"),
      motionLoop: byId("motion-loop"),

      // World
      worldMode: byId("world-mode"),
      worldStrength: byId("world-strength"),
      worldStrengthValue: byId("world-strength-value"),
      toggleHitCount: byId("toggle-hit-count"),

      // Grid Layer
      gridBankSelect: byId("grid-bank-select"),
      generateBauhausGrid: byId("generate-bauhaus-grid"),
      clearGridLayers: byId("clear-grid-layers"),
      gridLayerList: byId("grid-layer-list"),
      layerControlsList: byId("layer-controls-list"),

      // Button collections
      shapeButtons: Array.from(document.querySelectorAll(".shape-button")),
      toolButtons: Array.from(document.querySelectorAll(".tool")),
      noteCells: Array.from(document.querySelectorAll(".note-cell")),
      colorSwatches: Array.from(
        document.querySelectorAll(".swatch-grid .swatch"),
      ),

      // Shortcuts
      closeShortcuts: byId("close-shortcuts"),
      shortcutHud: byId("shortcut-hud"),

      // Tabs
      inspectorTabs: Array.from(
        document.querySelectorAll(".inspector-tabs .tab"),
      ),
      tabContents: Array.from(document.querySelectorAll(".tab-content")),
    };

    const noteElements = window.noteElements || (window.noteElements = {});
    elements.noteCells.forEach(function (slot) {
      const note = Number(slot.dataset.noteClass || 0) + 60;
      noteElements[note] = slot;
    });

    // Bind range → output sync
    bindRange(elements.textSize, elements.textSizeValue, 0);
    bindRange(elements.textScale, elements.textScaleValue, 1);
    bindRange(elements.textRotation, elements.textRotationValue, 0);
    bindRange(elements.lineThickness, elements.lineThicknessValue, 0);
    bindRange(elements.strokeWidth, elements.strokeWidthValue, 0);
    bindRange(elements.lineStrength, elements.lineStrengthValue, 1);
    bindRange(elements.ballCount, elements.ballCountValue, 0);
    bindRange(elements.ballSpeed, elements.ballSpeedValue, 1);
    bindRange(elements.ballSpread, elements.ballSpreadValue, 2);
    bindRange(elements.motionVx, elements.motionVxValue, 0);
    bindRange(elements.motionVy, elements.motionVyValue, 0);
    bindRange(elements.motionRot, elements.motionRotValue, 1);
    bindRange(elements.worldStrength, elements.worldStrengthValue, 1);
    bindRange(
      elements.behaviorEmitterRate,
      elements.behaviorEmitterRateValue,
      0,
    );
    bindRange(
      elements.behaviorEmitterDensity,
      elements.behaviorEmitterDensityValue,
      0,
    );
    bindRange(
      elements.behaviorEmitterDirection,
      elements.behaviorEmitterDirectionValue,
      0,
    );
    bindRange(
      elements.behaviorEmitterSpread,
      elements.behaviorEmitterSpreadValue,
      0,
    );
    bindRange(
      elements.behaviorEmitterSpeed,
      elements.behaviorEmitterSpeedValue,
      0,
    );
    bindRange(
      elements.behaviorEmitterSize,
      elements.behaviorEmitterSizeValue,
      1,
    );
    bindRange(
      elements.behaviorEmitterLife,
      elements.behaviorEmitterLifeValue,
      1,
    );

    // Tab switching — scoped to right panel, hard inline style for reliability
    bindInspectorTabs();

    function bindInspectorTabs() {
      var panel = document.getElementById("right-panel");
      if (!panel) return;

      var tabs = Array.from(
        panel.querySelectorAll(".inspector-tabs .tab[data-tab]"),
      );
      var contents = Array.from(
        panel.querySelectorAll(".tab-content[data-tab-content]"),
      );

      function activateInspectorTab(target) {
        tabs.forEach(function (tab) {
          tab.classList.toggle("active", tab.dataset.tab === target);
        });

        contents.forEach(function (content) {
          var isActive = content.dataset.tabContent === target;
          content.classList.toggle("active", isActive);
          content.style.display = isActive ? "block" : "none";
          content.style.visibility = isActive ? "visible" : "";
        });

        var activeContent = panel.querySelector(
          '.tab-content[data-tab-content="' + target + '"]',
        );

        if (!activeContent) {
          console.warn("[INSPECTOR TAB FAIL] Missing content for:", target);
          return;
        }

        if (activeContent.children.length === 0) {
          console.warn("[INSPECTOR TAB FAIL] Empty content for:", target);
        }
      }

      tabs.forEach(function (tab) {
        tab.addEventListener("click", function (event) {
          event.preventDefault();
          event.stopPropagation();
          activateInspectorTab(tab.dataset.tab);
        });
      });

      window._wos = window._wos || {};
      window._wos.activateInspectorTab = activateInspectorTab;
      window._wos.auditInspectorTabs = function auditInspectorTabs() {
        var report = {
          rightPanelChildren: Array.from(panel.children).map(function (el) {
            return {
              tag: el.tagName,
              id: el.id || "",
              className: el.className || "",
              tabContent: el.dataset ? el.dataset.tabContent || "" : "",
              text: el.textContent.trim().slice(0, 80),
            };
          }),
          tabs: tabs.map(function (tab) {
            return {
              tab: tab.dataset.tab,
              active: tab.classList.contains("active"),
              text: tab.textContent.trim(),
            };
          }),
          contents: contents.map(function (content) {
            var styles = getComputedStyle(content);
            return {
              tabContent: content.dataset.tabContent,
              active: content.classList.contains("active"),
              childCount: content.children.length,
              display: styles.display,
              height: content.getBoundingClientRect().height,
              text: content.textContent.trim().slice(0, 120),
            };
          }),
        };
        console.table(report.contents);
        return report;
      };

      // Set initial state — activate whichever tab has active class, or first tab
      var initialTab =
        tabs.find(function (t) {
          return t.classList.contains("active");
        }) || tabs[0];
      if (initialTab) activateInspectorTab(initialTab.dataset.tab);
    }

    // ── Grid Layer Controls ────────────────────────────────────────────────
    bindGridLayerControls();

    // ── Route World Controls ───────────────────────────────────────────────
    bindRouteWorldControls();
    bindDirectorControls();
    bindGeoControls();
    bindBasemapControls();
    bindLauncherControls();

    function bindLauncherControls() {
      var launcherButtons = document.querySelectorAll(".launcher-btn");
      if (!launcherButtons.length) return;

      // Delegate all open/close/state-sync/ESC/outside-click logic to DrawerSystem.
      // drawerSystem.js owns the centralized input handling — nothing extra here.
      launcherButtons.forEach(function (button) {
        button.addEventListener("click", function () {
          var workbenchId = button.dataset.workbench;
          if (workbenchId) {
            _toggleWorkbench(button, workbenchId);
            return;
          }
          var DS = window.SBE && window.SBE.DrawerSystem;
          if (!DS) return;
          var drawerId = button.dataset.drawer;
          if (DS.getActiveId() === drawerId) {
            DS.closeDrawer();
          } else {
            DS.openDrawer(drawerId);
          }
        });
      });
    }

    function _toggleWorkbench(button, id) {
      var wb     = document.getElementById("symbol-workbench");
      var wbc    = document.getElementById("symbol-workbench-content");
      var handle = document.getElementById("split-handle");
      if (!wb || !wbc) return;

      var isOpen = !wb.hidden;

      if (isOpen) {
        // Close
        var SD = window.SBE && window.SBE.SymbolDrawer;
        if (SD) SD.unmount(wbc);
        wb.hidden = true;
        if (handle) handle.hidden = true;
        button.classList.remove("workbench-active");
        document.body.classList.remove("workbench-open");
      } else {
        // Open
        wb.hidden = false;
        if (handle) handle.hidden = false;
        button.classList.add("workbench-active");
        document.body.classList.add("workbench-open");
        var SD = window.SBE && window.SBE.SymbolDrawer;
        if (SD) SD.mount(wbc);
        // Apply persisted split height if available
        var VS = window.SBE && window.SBE.ViewportSystem;
        if (VS) VS.applySplit();
      }
    }

    function bindGridLayerControls() {
      var el = elements;

      if (el.generateBauhausGrid) {
        el.generateBauhausGrid.addEventListener("click", function () {
          if (window._wos && window._wos.generateBauhausGrid) {
            var bankId = el.gridBankSelect ? el.gridBankSelect.value : null;
            window._wos.generateBauhausGrid(bankId || undefined);
            syncGridLayerList();
          }
        });
      }

      if (el.clearGridLayers) {
        el.clearGridLayers.addEventListener("click", function () {
          if (window._wos && window._wos.clearGridLayers) {
            window._wos.clearGridLayers();
            syncGridLayerList();
          }
        });
      }

      // Sync grid bank select when state changes (called by syncState / syncGridUI)
      el._syncGridBankSelect = function (appState) {
        if (!el.gridBankSelect) return;
        var cartridges = appState.midiCartridges || [];
        var current = el.gridBankSelect.value;
        el.gridBankSelect.innerHTML = cartridges.length
          ? cartridges
              .map(function (c) {
                var noteCount = c.notes ? c.notes.length : 0;
                var label =
                  (c.name || c.id) +
                  (noteCount ? " — " + noteCount + " notes" : "");
                return '<option value="' + c.id + '">' + label + "</option>";
              })
              .join("")
          : '<option value="">— no bank loaded —</option>';
        if (
          current &&
          cartridges.find(function (c) {
            return c.id === current;
          })
        ) {
          el.gridBankSelect.value = current;
        } else if (appState.activeMidiBankId) {
          var activeBank = (appState.midiBanks || []).find(function (b) {
            return b.id === appState.activeMidiBankId;
          });
          if (activeBank)
            el.gridBankSelect.value = activeBank.cartridgeId || activeBank.id;
        }
      };
    }

    function bindRouteWorldControls() {
      var fileInput = byId("route-geojson-file");
      var fitBtn = byId("route-fit-canvas");
      var startBtn = byId("route-start-btn");
      var stopBtn = byId("route-stop-btn");
      var statusEl = byId("route-world-status");

      function getOpts() {
        var startLabel = (byId("route-start-label") || {}).value || "Home";
        var endLabel = (byId("route-end-label") || {}).value || "Destination";
        var durationMin = parseFloat(
          (byId("route-duration-min") || {}).value || "120",
        );
        return {
          startLabel: startLabel,
          endLabel: endLabel,
          durationSec: Math.round(durationMin * 60),
        };
      }

      function updateStatus() {
        if (!statusEl) return;
        var rw = window._wos && window._wos.routeWorld;
        if (!rw) {
          statusEl.textContent = "RouteWorld API not ready";
          return;
        }
        var s = rw.state();
        if (!s.world) {
          statusEl.textContent = "No route loaded";
          return;
        }
        var stats = rw.routeStats();
        if (stats) {
          statusEl.textContent =
            stats.name +
            " · " +
            stats.distanceMiles +
            "mi · " +
            stats.durationLabel +
            " · " +
            stats.pointCount +
            " pts";
        } else {
          statusEl.textContent = s.active ? "Active" : "Stopped";
        }
      }

      // Camera mode dropdown
      var cameraModeSelect = byId("route-camera-mode");
      if (cameraModeSelect) {
        cameraModeSelect.addEventListener("change", function () {
          var rw = window._wos && window._wos.routeWorld;
          if (rw) rw.setCameraMode(cameraModeSelect.value);
        });
      }

      // Camera option toggles
      function bindCameraOpt(id, key) {
        var el = byId(id);
        if (!el) return;
        el.addEventListener("change", function () {
          var rw = window._wos && window._wos.routeWorld;
          if (rw) rw.setCameraOption(key, el.checked);
        });
      }
      bindCameraOpt("route-opt-dynzoom", "dynamicZoom");
      bindCameraOpt("route-opt-trail", "showTrail");
      bindCameraOpt("route-opt-headlight", "showHeadlight");
      bindCameraOpt("route-opt-flow", "showFlowIndicators");

      // Sync camera mode select from state
      function syncCameraModeUI() {
        if (!cameraModeSelect) return;
        var rw = window._wos && window._wos.routeWorld;
        if (!rw) return;
        var s = rw.state();
        var cam = s.world && window._wos.state.routeWorld.camera;
        if (cam) cameraModeSelect.value = cam.mode || "follow";
      }

      if (fileInput) {
        fileInput.addEventListener("change", function () {
          var file = fileInput.files && fileInput.files[0];
          if (!file) return;
          var reader = new FileReader();
          reader.onload = function () {
            try {
              var geojson = JSON.parse(reader.result);
              var rw = window._wos && window._wos.routeWorld;
              if (!rw) {
                console.warn("[RouteWorldUI] _wos.routeWorld not ready");
                return;
              }
              rw.reset();
              var route = rw.importGeoJSONRoute(geojson, getOpts());
              if (!route) {
                statusEl &&
                  (statusEl.textContent = "Import failed — check console");
                return;
              }
              rw.addHeroCar();
              rw.setCameraMode("overview");
              syncCameraModeUI();
              updateStatus();
            } catch (e) {
              console.error("[RouteWorldUI] GeoJSON parse error:", e);
              statusEl && (statusEl.textContent = "Parse error: " + e.message);
            }
            // Reset input so same file can be re-imported
            fileInput.value = "";
          };
          reader.readAsText(file);
        });
      }

      if (fitBtn) {
        fitBtn.addEventListener("click", function () {
          var rw = window._wos && window._wos.routeWorld;
          if (!rw) return;
          rw.fitRouteToCanvas(null, { padding: 120 });
          updateStatus();
        });
      }

      if (startBtn) {
        startBtn.addEventListener("click", function () {
          var rw = window._wos && window._wos.routeWorld;
          if (!rw) return;
          if (!rw.state().world) {
            statusEl &&
              (statusEl.textContent = "No route — import GeoJSON first");
            return;
          }
          if (!rw.state().heroActor) rw.addHeroCar();
          rw.start();
          updateStatus();
        });
      }

      if (stopBtn) {
        stopBtn.addEventListener("click", function () {
          var rw = window._wos && window._wos.routeWorld;
          if (rw) rw.stop();
          updateStatus();
        });
      }

      // Expose for external callers
      window._wos = window._wos || {};
      window._wos.syncRouteWorldStatus = updateStatus;
    }

    // ── Director Mode Controls ─────────────────────────────────────────────────
    function bindDirectorControls() {
      function director() {
        var rw =
          window._wos && window._wos.state && window._wos.state.routeWorld;
        return rw && rw.director;
      }
      function DM() {
        return window.SBE && window.SBE.DirectorMode;
      }

      // Mode select
      var modeSelect = byId("director-mode");
      if (modeSelect) {
        modeSelect.addEventListener("change", function () {
          var d = director();
          var dm = DM();
          if (!d) return;
          if (dm) dm.setMode(d, modeSelect.value);
          else d.mode = modeSelect.value;
        });
      }

      // Pause / Resume
      var pauseBtn = byId("director-pause-btn");
      var resumeBtn = byId("director-resume-btn");
      if (pauseBtn)
        pauseBtn.addEventListener("click", function () {
          var d = director(),
            dm = DM();
          if (d && dm) dm.pause(d);
          else if (d) d.simulation.paused = true;
        });
      if (resumeBtn)
        resumeBtn.addEventListener("click", function () {
          var d = director(),
            dm = DM();
          if (d && dm) dm.resume(d);
          else if (d) d.simulation.paused = false;
        });

      // Speed slider
      var speedSlider = byId("director-speed");
      var speedOutput = byId("director-speed-value");
      if (speedSlider) {
        speedSlider.addEventListener("input", function () {
          var v = parseFloat(speedSlider.value);
          if (speedOutput) speedOutput.textContent = v.toFixed(1) + "×";
          var d = director(),
            dm = DM();
          if (d && dm) dm.setSpeed(d, v);
          else if (d) d.simulation.speed = v;
        });
      }

      // Progress scrubber
      var progressSlider = byId("director-progress");
      var progressOutput = byId("director-progress-value");
      var progressLive = byId("director-progress-live");
      var _progressDragging = false;

      if (progressSlider) {
        progressSlider.addEventListener("mousedown", function () {
          _progressDragging = true;
        });
        progressSlider.addEventListener("touchstart", function () {
          _progressDragging = true;
        });
        progressSlider.addEventListener("input", function () {
          var v = parseFloat(progressSlider.value);
          if (progressOutput)
            progressOutput.textContent = Math.round(v * 100) + "%";
          // Uncheck live when user scrubs
          if (progressLive) progressLive.checked = false;
          var d = director(),
            dm = DM();
          if (d && dm) dm.setRouteProgress(d, v);
          else if (d) d.simulation.routeProgressOverride = v;
        });
        progressSlider.addEventListener("change", function () {
          _progressDragging = false;
        });
      }
      if (progressLive) {
        progressLive.addEventListener("change", function () {
          if (progressLive.checked) {
            // Return to live
            var d = director(),
              dm = DM();
            if (d && dm) dm.setRouteProgress(d, null);
            else if (d) d.simulation.routeProgressOverride = null;
          }
        });
      }

      // Time slider
      var timeSlider = byId("director-time");
      var timeOutput = byId("director-time-value");
      function fmtHour(h) {
        var hh = Math.floor(h);
        var mm = Math.floor((h - hh) * 60);
        return (hh < 10 ? "0" : "") + hh + ":" + (mm < 10 ? "0" : "") + mm;
      }
      if (timeSlider) {
        timeSlider.addEventListener("input", function () {
          var v = parseFloat(timeSlider.value);
          if (timeOutput) timeOutput.textContent = fmtHour(v);
          var d = director();
          if (d) {
            d.reality.timeHour = v;
            d.reality.useOverrides = true;
            var overCk = byId("director-overrides-active");
            if (overCk) overCk.checked = true;
          }
        });
      }

      // Weather select
      var weatherSelect = byId("director-weather");
      if (weatherSelect) {
        weatherSelect.addEventListener("change", function () {
          var d = director();
          if (!d) return;
          d.reality.weatherType = weatherSelect.value;
          d.reality.useOverrides = true;
          var overCk = byId("director-overrides-active");
          if (overCk) overCk.checked = true;
        });
      }

      // Season select
      var seasonSelect = byId("director-season");
      if (seasonSelect) {
        seasonSelect.addEventListener("change", function () {
          var d = director();
          if (!d) return;
          d.reality.season = seasonSelect.value;
          d.reality.useOverrides = true;
          var overCk = byId("director-overrides-active");
          if (overCk) overCk.checked = true;
        });
      }

      // Overrides active checkbox
      var overridesChk = byId("director-overrides-active");
      if (overridesChk) {
        overridesChk.addEventListener("change", function () {
          var d = director();
          if (d) d.reality.useOverrides = overridesChk.checked;
        });
      }

      // Periodically sync progress slider from simulation (when live)
      setInterval(function () {
        var d = director();
        if (!d || _progressDragging) return;
        var rw =
          window._wos && window._wos.state && window._wos.state.routeWorld;
        // Sync progress slider from hero actor
        if (
          progressLive &&
          progressLive.checked &&
          rw &&
          rw.actors &&
          rw.actors.length > 0
        ) {
          var hero = rw.actors[0];
          var t = hero ? hero.t || 0 : 0;
          if (progressSlider) progressSlider.value = t;
          if (progressOutput)
            progressOutput.textContent = Math.round(t * 100) + "%";
        }
        // Sync mode select
        if (modeSelect && d.mode !== modeSelect.value)
          modeSelect.value = d.mode;
      }, 500);
    }

    // ── Basemap Controls ───────────────────────────────────────────────────────
    function bindBasemapControls() {
      function basemap() {
        var rw =
          window._wos && window._wos.state && window._wos.state.routeWorld;
        return rw && rw.basemap;
      }
      function renderFrame() {
        window._wos && window._wos.renderFrame && window._wos.renderFrame();
      }

      // Enabled checkbox
      var enabledChk = byId("basemap-enabled");
      if (enabledChk) {
        enabledChk.addEventListener("change", function () {
          var bm = basemap();
          if (bm) {
            bm.enabled = enabledChk.checked;
            renderFrame();
          }
        });
      }

      // Opacity slider
      var opacitySlider = byId("basemap-opacity");
      var opacityOutput = byId("basemap-opacity-value");
      if (opacitySlider) {
        opacitySlider.addEventListener("input", function () {
          var v = parseFloat(opacitySlider.value);
          if (opacityOutput)
            opacityOutput.textContent = Math.round(v * 100) + "%";
          var bm = basemap();
          if (bm) {
            bm.opacity = v;
            renderFrame();
          }
        });
      }

      // Style select
      var styleSelect = byId("basemap-style");
      if (styleSelect) {
        styleSelect.addEventListener("change", function () {
          var bm = basemap();
          if (bm) {
            bm.style = styleSelect.value;
            renderFrame();
          }
        });
      }

      // Zoom slider
      var zoomSlider = byId("basemap-zoom");
      var zoomOutput = byId("basemap-zoom-value");
      if (zoomSlider) {
        zoomSlider.addEventListener("input", function () {
          var v = parseInt(zoomSlider.value, 10);
          if (zoomOutput) zoomOutput.textContent = v;
          var bm = basemap();
          if (bm) {
            bm.zoom = v;
            renderFrame();
          }
        });
      }

      // Zoom lock
      var zoomLocked = byId("basemap-zoom-locked");
      if (zoomLocked) {
        zoomLocked.addEventListener("change", function () {
          var bm = basemap();
          if (bm) {
            bm.zoomLocked = zoomLocked.checked;
            renderFrame();
          }
        });
      }

      // Tile debug
      var tileDebug = byId("basemap-tile-debug");
      if (tileDebug) {
        tileDebug.addEventListener("change", function () {
          var rw =
            window._wos && window._wos.state && window._wos.state.routeWorld;
          if (rw && rw.world && rw.world.layers) {
            rw.world.layers.debug = tileDebug.checked;
            renderFrame();
          }
        });
      }

      // Status readout (update periodically)
      var statusEl = byId("basemap-status");
      setInterval(function () {
        if (!statusEl) return;
        var bm = basemap();
        if (!bm) {
          statusEl.textContent = "—";
          return;
        }
        if (!bm.enabled) {
          statusEl.textContent = "disabled";
          return;
        }
        var BM = window.SBE && window.SBE.BasemapRenderer;
        var stats = BM ? BM.cacheStats() : null;
        statusEl.textContent =
          "Z" +
          (bm._lastZ || "—") +
          " · drawn " +
          (bm._lastDrawn || 0) +
          (bm._lastPending ? " · loading " + bm._lastPending : "") +
          (stats ? " · cache " + stats.loaded + "/" + stats.maxCache : "");

        // Auto-update zoom slider if not locked
        if (zoomSlider && !bm.zoomLocked && bm._lastZ != null) {
          zoomSlider.value = bm._lastZ;
          if (zoomOutput) zoomOutput.textContent = bm._lastZ;
        }
      }, 1000);
    }

    // ── Reference Geography Controls ───────────────────────────────────────────
    function bindGeoControls() {
      function geo() {
        var rw =
          window._wos && window._wos.state && window._wos.state.routeWorld;
        return rw && rw.referenceGeography;
      }
      function RGL() {
        return window.SBE && window.SBE.ReferenceGeographyLayer;
      }
      function renderFrame() {
        window._wos && window._wos.renderFrame && window._wos.renderFrame();
      }

      // Enabled checkbox
      var enabledChk = byId("geo-enabled");
      if (enabledChk) {
        enabledChk.addEventListener("change", function () {
          var g = geo();
          if (g) {
            g.enabled = enabledChk.checked;
            renderFrame();
          }
        });
      }

      // Style select
      var styleSelect = byId("geo-style");
      if (styleSelect) {
        styleSelect.addEventListener("change", function () {
          var g = geo(),
            r = RGL();
          if (g && r) r.setStyle(g, styleSelect.value);
          else if (g) g.style = styleSelect.value;
          renderFrame();
        });
      }

      // Opacity slider
      var opacitySlider = byId("geo-opacity");
      var opacityOutput = byId("geo-opacity-value");
      if (opacitySlider) {
        opacitySlider.addEventListener("input", function () {
          var v = parseFloat(opacitySlider.value);
          if (opacityOutput)
            opacityOutput.textContent = Math.round(v * 100) + "%";
          var g = geo(),
            r = RGL();
          if (g && r) r.setOpacity(g, v);
          else if (g) g.opacity = v;
          renderFrame();
        });
      }

      // Sub-layer checkboxes
      var GEO_LAYERS = ["water", "roads", "bridges", "parks", "districts"];
      GEO_LAYERS.forEach(function (layer) {
        var chk = byId("geo-layer-" + layer);
        if (!chk) return;
        chk.addEventListener("change", function () {
          var g = geo(),
            r = RGL();
          if (g && r) r.setLayerVisible(g, layer, chk.checked);
          else if (g && g.layers) g.layers[layer] = chk.checked;
          renderFrame();
        });
      });
    }

    var LAYER_CONTROL_IDS = [
      "atmosphere",
      "terrain",
      "signals",
      "walkers",
      "midi",
      "ecology",
      "debug",
    ];

    function syncLayerControlsUI(appState) {
      var container = elements.layerControlsList;
      if (!container) return;
      var lc = appState && appState.layerControls;
      if (!lc) return;

      container.innerHTML = LAYER_CONTROL_IDS.map(function (id) {
        var ctrl = lc[id] || { visible: true, opacity: 1.0, solo: false };
        var soloActive = LAYER_CONTROL_IDS.some(function (k) {
          return lc[k] && lc[k].solo;
        });
        var isVisible = soloActive ? !!ctrl.solo : ctrl.visible !== false;
        var eyeColor = isVisible ? "#e0e0e0" : "#555";
        var soloColor = ctrl.solo ? "#ffd040" : "#555";
        return (
          '<div style="display:flex;align-items:center;gap:6px;padding:2px 0;font-size:11px;">' +
          '<span style="color:#888;width:70px;flex-shrink:0;">' +
          id +
          "</span>" +
          '<button data-layer-toggle="' +
          id +
          '" title="toggle visibility" style="background:none;border:none;cursor:pointer;padding:0;color:' +
          eyeColor +
          ';font-size:13px;">◉</button>' +
          '<input type="range" min="0" max="1" step="0.01" value="' +
          (ctrl.opacity != null ? ctrl.opacity : 1) +
          '" data-layer-opacity="' +
          id +
          '" style="flex:1;height:3px;accent-color:#aaa;">' +
          '<button data-layer-solo="' +
          id +
          '" title="solo" style="background:none;border:none;cursor:pointer;padding:0;color:' +
          soloColor +
          ';font-size:10px;font-weight:700;">S</button>' +
          "</div>"
        );
      }).join("");

      // Bind toggle buttons
      container.querySelectorAll("[data-layer-toggle]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var id = btn.getAttribute("data-layer-toggle");
          if (window._wos && window._wos.layers) {
            var ctrl = appState.layerControls[id];
            if (ctrl.visible) window._wos.layers.hide(id);
            else window._wos.layers.show(id);
            syncLayerControlsUI(appState);
          }
        });
      });

      // Bind opacity sliders
      container
        .querySelectorAll("[data-layer-opacity]")
        .forEach(function (slider) {
          slider.addEventListener("input", function () {
            var id = slider.getAttribute("data-layer-opacity");
            if (window._wos && window._wos.layers) {
              window._wos.layers.setOpacity(id, parseFloat(slider.value));
            }
          });
        });

      // Bind solo buttons
      container.querySelectorAll("[data-layer-solo]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var id = btn.getAttribute("data-layer-solo");
          if (window._wos && window._wos.layers) {
            var ctrl = appState.layerControls[id];
            if (ctrl.solo) window._wos.layers.clearSolo();
            else window._wos.layers.solo(id);
            syncLayerControlsUI(appState);
          }
        });
      });
    }

    function syncGridLayerList() {
      var el = elements;
      if (!el.gridLayerList) return;
      var layers =
        window._wos && window._wos.debugGridLayers
          ? window._wos.debugGridLayers()
          : [];
      el.gridLayerList.innerHTML = layers.length
        ? layers
            .map(function (l) {
              var blockCount = l.blocks ? l.blocks.length : 0;
              var bankId = l.source && l.source.bankId;
              return (
                '<div style="font-size:11px;color:#aaa;padding:3px 0;">' +
                (l.visible ? "●" : "○") +
                " " +
                "<span style='color:#ccc;font-weight:600;'>" +
                (l.label || l.name) +
                "</span>" +
                "<br><span style='padding-left:10px;'>" +
                blockCount +
                " tiles" +
                (bankId ? " · " + bankId.slice(0, 12) + "…" : "") +
                "</span></div>"
              );
            })
            .join("")
        : '<div style="font-size:10px;color:#666;padding:4px 0;">No grid layers</div>';
    }

    return {
      elements: elements,
      syncState: function syncState(appState) {
        elements.bpmInput.value = Number(appState.bpm).toFixed(1);
        elements.barCount.value = String(appState.loop.bars);
        elements.quantizeEnabled.checked = !!appState.quantize.enabled;
        elements.quantizeDivision.value = String(appState.quantize.division);
        if (elements.transparentBg) {
          elements.transparentBg.checked = !!appState.ui.transparentBackground;
        }
        elements.engineStatus.textContent = appState.loop.recording
          ? "REC"
          : appState.loop.armed
            ? "ARM"
            : appState.loop.playing
              ? "LOOP"
              : appState.running
                ? "RUN"
                : "STOP";
        elements.sceneStats.textContent =
          appState.lines.length +
          "L " +
          appState.textObjects.length +
          "T " +
          appState.balls.length +
          "B";
        elements.exportLoop.classList.toggle("hidden", !appState.loop.hasLoop);
        elements.retakeLoop.classList.toggle("hidden", !appState.loop.hasLoop);
        elements.ballCount.value = String(appState.ballTool.count);
        elements.ballCountValue.textContent = String(appState.ballTool.count);
        elements.ballSpeed.value = String(appState.ballTool.speed);
        elements.ballSpeedValue.textContent = Number(
          appState.ballTool.speed,
        ).toFixed(1);
        elements.ballSpread.value = String(appState.ballTool.spread);
        elements.ballSpreadValue.textContent = Number(
          appState.ballTool.spread,
        ).toFixed(2);
      },
      syncTool: function syncTool(tool) {
        elements.toolButtons.forEach(function (button) {
          button.classList.toggle("active", button.dataset.tool === tool);
        });
      },
      syncShapeSelection: function syncShapeSelection(shapeId) {
        elements.shapeButtons.forEach(function (button) {
          button.classList.toggle("active", button.dataset.shape === shapeId);
        });
      },
      syncSelection: function syncSelection(selection, activeNoteClass) {
        // ── Inspector State System (spec 0426_WOS_InspectorStateSystem_v1.0.0) ──
        var inspectorState = getInspectorState(selection);
        renderInspector(inspectorState, elements);
        console.log(
          "[Inspector]",
          selection ? selection.type : "none",
          inspectorState,
        );

        // ── Field population (only when selection has content) ──
        if (!selection) return;

        function safeNum(v, fallback) {
          return typeof v === "number" && isFinite(v) ? v : fallback || 0;
        }

        // Note field — all selectable types that carry a note
        var note = selection.midi ? selection.midi.note : selection.note;
        if (
          typeof note !== "number" &&
          selection.segments &&
          selection.segments.length
        ) {
          note = selection.segments[0].note;
        }
        if (typeof note === "number" && elements.activeNote) {
          elements.activeNote.value = String(note);
        }

        // Mechanic / behavior / style fields — strokes, lines, shapes
        if (elements.lineMechanic) {
          var mechVal = selection.mechanicType;
          if (!mechVal && selection.segments && selection.segments.length) {
            mechVal = selection.segments[0].mechanicType;
          }
          elements.lineMechanic.value = mechVal || "none";
        }
        var selStyle = selection.style;
        var selBehavior = selection.behavior;
        if (!selStyle && selection.segments && selection.segments.length) {
          selStyle = { thickness: selection.segments[0].thickness };
        }
        if (!selBehavior && selection.segments && selection.segments.length) {
          selBehavior = selection.segments[0].behavior;
        }
        if (elements.lineThickness && selStyle) {
          elements.lineThickness.value = String(safeNum(selStyle.thickness, 3));
        }
        if (elements.lineThicknessValue && selStyle) {
          elements.lineThicknessValue.textContent = String(
            safeNum(selStyle.thickness, 3),
          );
        }
        if (elements.lineBehavior && selBehavior) {
          elements.lineBehavior.value =
            selBehavior.type === "normal" ? "none" : selBehavior.type || "none";
        }
        if (elements.lineStrength && selBehavior) {
          elements.lineStrength.value = String(
            safeNum(selBehavior.strength, 1),
          );
        }
        if (elements.lineStrengthValue && selBehavior) {
          elements.lineStrengthValue.textContent = safeNum(
            selBehavior.strength,
            1,
          ).toFixed(1);
        }

        // Text fields — only when type is text
        if (selection.type === "text" && selection.transform) {
          if (elements.textContent)
            elements.textContent.value = selection.value || "";
          if (elements.textSize)
            elements.textSize.value = String(
              safeNum(selection.font && selection.font.size, 16),
            );
          if (elements.textSizeValue)
            elements.textSizeValue.textContent = String(
              safeNum(selection.font && selection.font.size, 16),
            );
          if (elements.textX)
            elements.textX.value = String(
              Math.round(safeNum(selection.transform.x)),
            );
          if (elements.textY)
            elements.textY.value = String(
              Math.round(safeNum(selection.transform.y)),
            );
          if (elements.textScale)
            elements.textScale.value = String(
              safeNum(selection.transform.scale, 1),
            );
          if (elements.textScaleValue)
            elements.textScaleValue.textContent = safeNum(
              selection.transform.scale,
              1,
            ).toFixed(1);
          if (elements.textRotation)
            elements.textRotation.value = String(
              safeNum(selection.transform.rotation),
            );
          if (elements.textRotationValue)
            elements.textRotationValue.textContent = safeNum(
              selection.transform.rotation,
            ).toFixed(0);
        }
      },
      syncShortcutVisibility: function syncShortcutVisibility(visible) {
        if (elements.shortcutHud) {
          elements.shortcutHud.classList.toggle("hidden", !visible);
        }
      },
      syncGridUI: function syncGridUI(appState) {
        if (elements._syncGridBankSelect)
          elements._syncGridBankSelect(appState);
        syncGridLayerList();
        syncLayerControlsUI(appState);
      },
    };
  }

  function bindRange(input, output, decimals) {
    if (!input || !output) {
      return;
    }
    var sync = function sync() {
      output.textContent = Number(input.value).toFixed(decimals);
    };
    input.addEventListener("input", sync);
    sync();
  }

  function byId(id) {
    return document.getElementById(id);
  }

  // ── Inspector State System ─────────────────────────────────────────────────
  // Maps selection type → which panels should be visible.
  // Real panel IDs used (mapped from spec):
  //   outline   → color-section
  //   behavior  → behavior-section
  //   mechanic  → mechanic-section
  //   text      → text-inspector-block
  //   motion    → motion-inspector-block (legacy object transform — NOT shown for strokes)
  //   emitter   → behavior-emitter-fields
  // Strokes switch to the Motion Brush tab ([data-tab="motion"]) instead of motion-inspector-block.

  function getInspectorState(selection) {
    if (!selection) {
      return {
        mode: "none",
        show: {
          outline: false,
          behavior: false,
          mechanic: false,
          motion: false,
          emitter: false,
          text: false,
        },
      };
    }

    switch (selection.type) {
      case "stroke":
        return {
          mode: "stroke",
          show: {
            outline: true,
            // legacy panels hidden — behavior-panel (new system) replaces them for strokes
            behavior: false,
            mechanic: false,
            motion: false,
            emitter: false,
            text: false,
            behaviorPanel: true,
          },
        };

      case "group":
        return {
          mode: "group",
          show: {
            outline: true, // color/width/visibility controls shown for groups
            behavior: false, // legacy behavior panel hidden for groups
            mechanic: false,
            motion: false, // legacy motion (VX/VY) hidden for groups
            emitter: false,
            text: false,
            behaviorPanel: false,
            groupPanel: true,
          },
        };

      case "text":
        return {
          mode: "text",
          show: {
            outline: false,
            behavior: false,
            mechanic: false,
            motion: true,
            emitter: false,
            text: true,
            behaviorPanel: false,
          },
        };

      default:
        // Lines, shapes, balls — show everything except text
        return {
          mode: selection.type || "unknown",
          show: {
            outline: true,
            behavior: true,
            mechanic: true,
            motion: true,
            emitter: true,
            text: false,
            behaviorPanel: false,
          },
        };
    }
  }

  function renderInspector(state, elements) {
    togglePanel("color-section", state.show.outline);
    togglePanel("behavior-section", state.show.behavior);
    togglePanel("mechanic-section", state.show.mechanic);
    togglePanel("text-inspector-block", state.show.text);
    togglePanel("motion-inspector-block", state.show.motion);
    togglePanel("behavior-emitter-fields", state.show.emitter);
    togglePanel("behavior-panel", !!state.show.behaviorPanel);
  }

  function togglePanel(id, show) {
    var el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle("hidden", !show);
  }

  SBE.Controls = {
    createControls: createControls,
  };
})(window);
