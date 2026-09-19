// Focused browser regressions for public Subway Paint-on-Map integration.
(function (global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});
  function assertion(name, pass, details) { return { name: name, pass: !!pass, details: details || null }; }

  function run() {
    var results = [];
    var ui = SBE.SubwayMapPaintSurface;
    var drawing = SBE.SurfaceDrawingRuntime;
    var workspace = SBE.Workspace;
    var mapRuntime = SBE.MapboxViewportRuntime;
    var surface = workspace && workspace.getActiveSurface();
    if (!ui || !drawing || !workspace || !surface) {
      return { ok: false, total: 1, failed: 1, results: [assertion("paint authorities loaded", false)] };
    }

    var originalMode = workspace.getInteractionMode();
    var originalObjects = (surface.overlayObjects || []).slice();
    try {
      surface.overlayObjects = [];
      results.push(assertion("public Subway lockdown remains active", global.document.body.classList.contains("subway-public")));
      results.push(assertion("Paint mode is enterable", ui.enterPaint() && ui.getMode() === "draw"));
      var overlay = global.document.getElementById("surface-overlay");
      results.push(assertion("Paint mode gives the drawing overlay pointer authority", !!overlay && global.getComputedStyle(overlay).pointerEvents !== "none"));

      var rect = overlay && overlay.getBoundingClientRect();
      var point = rect && drawing.__test.capturePoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      results.push(assertion("captured artwork point has geographic coordinates", point && Number.isFinite(point.longitude) && Number.isFinite(point.latitude), point));

      if (point) {
        var second = Object.assign({}, point, { x: point.x + 12, longitude: point.longitude + 0.0001 });
        drawing.__test.commitPoints([point, second]);
      }
      var strokes = drawing.getStrokes();
      results.push(assertion("committed stroke declares map surface identity", strokes.length === 1 && strokes[0].surface && strokes[0].surface.type === "map", strokes[0]));
      var projected = point && mapRuntime && mapRuntime.project([point.longitude, point.latitude]);
      results.push(assertion("geographic point reprojects through the canonical map authority", projected && Number.isFinite(projected.x) && Number.isFinite(projected.y), projected));

      results.push(assertion("Pan mode restores navigation", ui.enterPan() && ui.getMode() === "navigate"));
      results.push(assertion("Pan mode returns pointer authority to Mapbox", !!overlay && global.getComputedStyle(overlay).pointerEvents === "none"));
      var countBeforePan = drawing.getStrokes().length;
      overlay && overlay.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 91, clientX: 10, clientY: 10 }));
      overlay && overlay.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 91, clientX: 20, clientY: 20 }));
      results.push(assertion("Pan mode does not create strokes", drawing.getStrokes().length === countBeforePan));
      results.push(assertion("Undo removes the newest map stroke", !!ui.undo() && drawing.getStrokes().length === 0));
    } finally {
      surface.overlayObjects = originalObjects;
      workspace.setInteractionMode(originalMode);
      drawing.renderOverlay();
      ui.__test.renderNow();
    }
    var failed = results.filter(function (result) { return !result.pass; });
    var summary = { ok: failed.length === 0, total: results.length, failed: failed.length, results: results };
    console.log("[SubwayMapPaintSurfaceTests] " + (summary.ok ? "PASS" : "FAIL") + " — " + (results.length - failed.length) + "/" + results.length);
    if (failed.length) console.warn("[SubwayMapPaintSurfaceTests] failures:", failed);
    return summary;
  }
  SBE.SubwayMapPaintSurfaceTests = { run: run };
  // DOM event bridge keeps this classic-script suite runnable by browser
  // automation without exposing production mutation controls.
  global.document.addEventListener("subway-map-paint:run-tests", function () {
    var result = run();
    global.document.documentElement.setAttribute("data-subway-map-paint-test-result", JSON.stringify(result));
  });
})(window);
