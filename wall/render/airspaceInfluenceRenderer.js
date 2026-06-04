// ── AirspaceInfluenceRenderer v1.0.0 ─────────────────────────────────────────
// 0528A_WOS_AirflightRuntimeBootstrap_v1.0.0
// Status: active
// Classification: renderer
//
// Purpose:
//   Renders the airspace influence field onto an existing canvas context.
//   Called by AircraftRenderer before drawing aircraft icons — influence field
//   appears underneath aircraft silhouettes.
//
//   Each influence sample becomes a radial gradient circle: opaque at center,
//   transparent at edge.  Samples are blended onto the canvas in screen mode
//   for a soft additive glow that respects underlying map color.
//
// Authority:
//   READS: AirspaceInfluenceField.getActiveSamples(), MapboxViewportRuntime
//   WRITES: pixels on provided canvas context only
//   MUST NOT MUTATE: AircraftRuntime, influence field state, map style
//
// Placement: wall/render/airspaceInfluenceRenderer.js
// Load: AFTER airspaceInfluenceField.js, called from aircraftRenderer.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  var VERSION = '1.0.0';

  // ── Projection ─────────────────────────────────────────────────────────────────

  function _project(lat, lng) {
    var mvr = global.SBE && SBE.MapboxViewportRuntime;
    if (!mvr || !mvr.project) return null;
    try { return mvr.project([lng, lat]); } catch (e) { return null; }
  }

  function _metersPerPixel(lat, zoom) {
    return (40075016.686 * Math.cos(lat * Math.PI / 180)) /
           (256 * Math.pow(2, zoom || 12));
  }

  // ── render(ctx) ──────────────────────────────────────────────────────────────
  // Called each frame by AircraftRenderer before drawing aircraft icons.

  function render(ctx) {
    var inf = global.SBE && SBE.AirspaceInfluenceField;
    if (!inf || !inf.isEnabled || !inf.isEnabled()) return;

    var samples = inf.getActiveSamples();
    if (!samples.length) return;

    var mvr  = global.SBE && SBE.MapboxViewportRuntime;
    var cam  = (mvr && mvr.getCamera) ? mvr.getCamera() : { zoom: 12 };
    var zoom = (cam && typeof cam.zoom === 'number') ? cam.zoom : 12;

    var cW = ctx.canvas.width;
    var cH = ctx.canvas.height;

    for (var i = 0; i < samples.length; i++) {
      var s  = samples[i];
      var pt = _project(s.lat, s.lng);
      if (!pt) continue;

      // Convert radius from meters to pixels
      var mpx      = _metersPerPixel(s.lat, zoom);
      var radiusPx = s.radiusM / mpx;

      if (radiusPx < 4) continue;

      // Cull if entirely off-screen
      if (pt.x + radiusPx < 0 || pt.x - radiusPx > cW ||
          pt.y + radiusPx < 0 || pt.y - radiusPx > cH) continue;

      // Center alpha = peak × intensity; edge = 0
      var centerAlpha = s.peakAlpha * s.intensity;
      // Scale by AltitudeWorldState if available
      var _aws = global.SBE && SBE.AltitudeWorldState;
      if (_aws && typeof _aws.influenceFieldOpacity === 'number') {
        centerAlpha = centerAlpha * _aws.influenceFieldOpacity;
      }
      var midAlpha    = centerAlpha * 0.35;

      try {
        var grad = ctx.createRadialGradient(
          pt.x, pt.y, 0,
          pt.x, pt.y, radiusPx
        );
        var r = s.r, g = s.g, b = s.b;
        grad.addColorStop(0,    'rgba(' + r + ',' + g + ',' + b + ',' + centerAlpha.toFixed(3) + ')');
        grad.addColorStop(0.45, 'rgba(' + r + ',' + g + ',' + b + ',' + midAlpha.toFixed(3) + ')');
        grad.addColorStop(1,    'rgba(' + r + ',' + g + ',' + b + ',0)');

        ctx.save();
        // 'screen' compositing: influence fields lighten the world without
        // overpowering dark map backgrounds.
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, radiusPx, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } catch (ex) {
        // Off-screen gradient can throw; skip silently
      }
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  SBE.AirspaceInfluenceRenderer = Object.freeze({
    VERSION: VERSION,
    render:  render,
  });

  console.log('[AirspaceInfluenceRenderer] v' + VERSION + ' loaded');

})(window);
