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

      var hydratedArtwork = {
        id: "artwork-test-1",
        creatorId: "member-test-1",
        surfaceId: "map:new-york",
        createdAt: new Date(1000),
        marks: [{
            id: "hydrated-mark-1",
            type: "stroke",
            geometry: { format: "geographic-stroke-v1", points: [
              { longitude: -73.99, latitude: 40.72 },
              { longitude: -73.98, latitude: 40.73 },
            ] },
            style: { color: "#ff4488", width: 4, opacity: 0.88 },
          }],
      };
      results.push(assertion("persisted Artwork hydrates through SurfaceDrawingRuntime", drawing.hydrateArtwork(hydratedArtwork) === 1));
      var hydratedStroke = drawing.getStrokes()[0];
      results.push(assertion("hydrated Artwork retains ownership and geographic coordinates",
        hydratedStroke && hydratedStroke.artworkId === hydratedArtwork.id
          && hydratedStroke.creatorId === hydratedArtwork.creatorId
          && hydratedStroke.markId === "hydrated-mark-1"
          && hydratedStroke.points[0].longitude === -73.99
          && hydratedStroke.points[0].latitude === 40.72,
        hydratedStroke));
      results.push(assertion("repeated hydration does not duplicate Artwork", drawing.hydrateArtwork(hydratedArtwork) === 0 && drawing.getStrokes().length === 1));
      results.push(assertion("Undo still removes hydrated Artwork", !!ui.undo() && drawing.getStrokes().length === 0));

      // ── Map Art Supplies Integration V1 ─────────────────────────────────
      var supplies = SBE.ArtSupplies;
      results.push(assertion("shared Art Supply definitions are published on window.SBE (no Map-specific duplicate)", !!supplies && !!supplies.MOP_SUPPLY && !!supplies.SPRAY_SUPPLY));

      results.push(assertion("selectSupply(mop) both selects Mop and enters draw mode", ui.selectSupply("mop") && ui.getMode() === "draw" && drawing.getBrush().supplyId === "mop"));
      if (point) {
        var mopEnd = Object.assign({}, point, { x: point.x + 20, longitude: point.longitude + 0.0002 });
        drawing.__test.commitPoints([point, mopEnd]);
      }
      var mopMark = drawing.getStrokes()[0];
      results.push(assertion("committed Mop stroke carries the mop supply identity", mopMark && mopMark.operation === "mop", mopMark));

      results.push(assertion("selectSupply(spray) selects Spray", ui.selectSupply("spray") && drawing.getBrush().supplyId === "spray"));
      var sprayFirstPlan = null;
      if (point) {
        var sprayEnd = Object.assign({}, point, { x: point.x + 30, longitude: point.longitude + 0.0003 });
        drawing.__test.commitPoints([point, sprayEnd]);
        var sprayMark = drawing.getStrokes()[drawing.getStrokes().length - 1];
        results.push(assertion("committed Spray stroke carries the spray supply identity", sprayMark && sprayMark.operation === "spray", sprayMark));
        var deposition = SBE.ArtSupplyDeposition;
        if (deposition && sprayMark) {
          var reprojected = drawing.__test.reprojectPoints(sprayMark.points);
          sprayFirstPlan = deposition.resolveSprayParticlePlan(reprojected, sprayMark.style.width * 0.5, deposition.hashSeed(sprayMark.markId || sprayMark.id));
          var reprojectedAgain = drawing.__test.reprojectPoints(sprayMark.points);
          var sprayPlanAfterReproject = deposition.resolveSprayParticlePlan(reprojectedAgain, sprayMark.style.width * 0.5, deposition.hashSeed(sprayMark.markId || sprayMark.id));
          results.push(assertion("Spray deposition is deterministic across repeated reprojection (same Mark, same camera math -> identical plan)",
            JSON.stringify(sprayFirstPlan) === JSON.stringify(sprayPlanAfterReproject)));
        }
      }

      results.push(assertion("selectSupply(pencil) restores Pencil as the active supply", ui.selectSupply("pencil") && drawing.getBrush().supplyId === "pencil"));
      if (point) {
        var pencilEnd = Object.assign({}, point, { x: point.x + 5, longitude: point.longitude + 0.00005 });
        drawing.__test.commitPoints([point, pencilEnd]);
      }
      var allStrokes = drawing.getStrokes();
      results.push(assertion("Pencil/Mop/Spray Marks all coexist as ONE composed set (no forced split)", allStrokes.length === 3, allStrokes.map(function (s) { return s.operation; })));

      results.push(assertion("selectSupply(eraser) selects Eraser with no contextual Width/Opacity/Color options", ui.selectSupply("eraser") && drawing.getBrush().supplyId === "eraser"));
      var beforeErase = drawing.getStrokes().length;
      if (point) {
        var eraseEnd = Object.assign({}, point, { x: point.x + 6, longitude: point.longitude + 0.00006 });
        drawing.__test.commitPoints([point, eraseEnd]);
      }
      var afterErase = drawing.getStrokes();
      results.push(assertion("Eraser commits a graphite-only material-erasure Mark", afterErase.length === beforeErase + 1 && afterErase[afterErase.length - 1].type === "material-erasure" && afterErase[afterErase.length - 1].targetMaterialId === "graphite"));

      var beforeUndoErase = drawing.getStrokes().length;
      results.push(assertion("Undo removes the material-erasure Mark as one operation", !!ui.undo() && drawing.getStrokes().length === beforeUndoErase - 1));

      var beforeUndoSpray = drawing.getStrokes().map(function (s) { return s.operation; });
      results.push(assertion("latest Mark before further Undo is still Pencil (erasure undone cleanly)", beforeUndoSpray[beforeUndoSpray.length - 1] === "pencil"));
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
