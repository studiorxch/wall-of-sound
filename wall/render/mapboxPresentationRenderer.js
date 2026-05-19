(function (global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  // ── MapboxPresentationRenderer (0518I_WOS_RouteAuthoringInteraction_v1.0.0)
  // Cinematic/audience-facing canvas overlays. No handles, labels, or editing
  // UI. Routes render as glowing atmospheric paths.
  //
  // VIEW Rendering Rules (0518I):
  //   Allowed:  glow passes, atmospheric diffusion, route pulse, tinting
  //   Forbidden: handles, labels, drag nodes, operator overlays, metric clutter

  function render(ctx, options) {
    if (!ctx) return;
    var mbr = SBE.MapboxViewportRuntime;
    if (!mbr || !mbr.isReady()) return;

    var ws  = SBE.Workspace;
    var doc = ws && ws.getActiveSurface();
    if (!doc || doc.type !== "route") return;

    var rt = doc.runtime;
    if (!rt || !rt.routes) return;

    var activeRouteId = rt.activeRouteId || (rt.routes[0] && rt.routes[0].id);

    rt.routes.forEach(function (route) {
      if (!route.visible || route.waypoints.length < 2) return;
      var isActive = route.id === activeRouteId;

      var pts = route.waypoints.map(function (wp) {
        return mbr.project([wp.longitude, wp.latitude]);
      });

      // Three-pass glow: outer haze, inner glow, crisp core
      var passes = isActive
        ? [{ width: 16, alpha: 0.08 }, { width: 7, alpha: 0.20 }, { width: 2.5, alpha: 0.80 }]
        : [{ width:  8, alpha: 0.04 }, { width: 4, alpha: 0.10 }, { width: 1.5, alpha: 0.40 }];

      passes.forEach(function (pass) {
        ctx.save();
        ctx.strokeStyle = route.style.color;
        ctx.lineWidth   = pass.width;
        ctx.globalAlpha = pass.alpha;
        ctx.lineJoin    = "round";
        ctx.lineCap     = "round";
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
        ctx.restore();
      });

      // Origin / destination — minimal glowing dots, no labels
      if (isActive) {
        [pts[0], pts[pts.length - 1]].forEach(function (pt, i) {
          ctx.save();
          ctx.fillStyle   = route.style.color;
          ctx.globalAlpha = 0.9;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, i === 0 ? 5 : 4, 0, Math.PI * 2);
          ctx.fill();
          // Glow ring
          ctx.strokeStyle = route.style.color;
          ctx.lineWidth   = 1.5;
          ctx.globalAlpha = 0.3;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 10, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        });
      }
    });
  }

  SBE.MapboxPresentationRenderer = { render: render };

})(window);
