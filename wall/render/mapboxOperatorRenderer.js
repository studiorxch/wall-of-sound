(function (global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  // ── MapboxOperatorRenderer (0518I_WOS_RouteAuthoringInteraction_v1.0.0) ───
  // Draws operator-mode overlays: route spine, waypoint handles, direction
  // arrows, segment hover highlighting, insertion preview, metrics HUD.
  // Receives ephemeral interaction state from RoutePlannerRuntime.
  //
  // All positions are CSS-pixel coordinates from mbr.project().

  function render(ctx, options, interaction) {
    if (!ctx) return;
    var mbr = SBE.MapboxViewportRuntime;
    if (!mbr || !mbr.isReady()) return;

    var ws  = SBE.Workspace;
    var doc = ws && ws.getActiveSurface();
    if (!doc || doc.type !== "route") return;

    var rt = doc.runtime;
    if (!rt || !rt.routes) return;

    var ix = interaction || {};

    // RouteInputSystem routes (generated via form) — primary source
    var risRoutes = SBE.RouteInputSystem ? SBE.RouteInputSystem.getRoutes() : [];
    risRoutes.forEach(function (route) {
      if (!route.visible) return;
      var coords = route.geometry && route.geometry.coordinates;
      if (!coords || coords.length < 2) return;
      var pts = coords.map(function (c) {
        return mbr.project([c.longitude, c.latitude]);
      });
      ctx.save();
      ctx.strokeStyle = "#4a9eff";
      ctx.lineWidth   = 3;
      ctx.lineJoin    = "round";
      ctx.lineCap     = "round";
      ctx.globalAlpha = route.locked ? 0.75 : 0.95;
      ctx.beginPath();
      pts.forEach(function (p, i) { i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y); });
      ctx.stroke();
      // Origin dot
      ctx.fillStyle = "#4a9eff";
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, 5, 0, Math.PI * 2);
      ctx.fill();
      // Destination dot
      ctx.beginPath();
      ctx.arc(pts[pts.length - 1].x, pts[pts.length - 1].y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // RoutePlannerRuntime waypoint-based routes (legacy / route-edit mode)
    var routes        = rt.routes;
    var activeRouteId = rt.activeRouteId || (routes[0] && routes[0].id);

    routes.forEach(function (route) {
      var isActive = route.id === activeRouteId;
      var wps      = route.waypoints;
      if (wps.length < 1) return;

      var pts = wps.map(function (wp) {
        return mbr.project([wp.longitude, wp.latitude]);
      });

      // ── Route spine ───────────────────────────────────────────────────────
      if (pts.length > 1) {
        ctx.save();

        // Inactive routes: subdued dashed
        if (!isActive) {
          ctx.strokeStyle = route.style.color;
          ctx.lineWidth   = route.style.width;
          ctx.globalAlpha = 0.25;
          ctx.lineJoin    = "round";
          ctx.lineCap     = "round";
          ctx.setLineDash([6, 5]);
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
          ctx.stroke();
          ctx.restore();
        } else {
          // Active route: draw each segment, highlighting hovered one
          ctx.lineJoin = "round";
          ctx.lineCap  = "round";

          for (var s = 0; s < pts.length - 1; s++) {
            var isHovSeg = (ix.hoveredSegmentIdx === s);
            ctx.save();
            ctx.strokeStyle = route.style.color;
            ctx.lineWidth   = isHovSeg ? route.style.width + 2 : route.style.width;
            ctx.globalAlpha = isHovSeg ? 1.0 : route.style.opacity;
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(pts[s].x, pts[s].y);
            ctx.lineTo(pts[s + 1].x, pts[s + 1].y);
            ctx.stroke();
            ctx.restore();
          }

          // Glow pass for active route
          ctx.save();
          ctx.strokeStyle = route.style.color;
          ctx.lineWidth   = route.style.width + 8;
          ctx.globalAlpha = 0.12;
          ctx.lineJoin    = "round";
          ctx.lineCap     = "round";
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (var g = 1; g < pts.length; g++) ctx.lineTo(pts[g].x, pts[g].y);
          ctx.stroke();
          ctx.restore();
        }
      }

      // ── Direction arrows (active route only) ──────────────────────────────
      if (isActive && pts.length > 1) {
        ctx.save();
        ctx.fillStyle   = route.style.color;
        ctx.globalAlpha = 0.7;
        for (var j = 1; j < pts.length; j++) {
          var ax  = (pts[j - 1].x + pts[j].x) / 2;
          var ay  = (pts[j - 1].y + pts[j].y) / 2;
          var ang = Math.atan2(pts[j].y - pts[j - 1].y, pts[j].x - pts[j - 1].x);
          var segLen = Math.hypot(pts[j].x - pts[j - 1].x, pts[j].y - pts[j - 1].y);
          if (segLen < 40) continue; // skip very short segments
          ctx.save();
          ctx.translate(ax, ay);
          ctx.rotate(ang);
          ctx.beginPath();
          ctx.moveTo( 7, 0);
          ctx.lineTo(-5,  4);
          ctx.lineTo(-5, -4);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
        ctx.restore();
      }

      // ── Waypoint handles ──────────────────────────────────────────────────
      wps.forEach(function (wp, idx) {
        var pt         = pts[idx];
        var isEndpoint = (idx === 0 || idx === wps.length - 1);
        var isSelected = (ix.selectedWaypointId === wp.id);
        var isHovered  = (ix.hoveredWaypointId  === wp.id);
        var isDragged  = (ix.draggedWaypointId  === wp.id);

        var isScenic  = (wp.type === "scenic");
        var radius = isEndpoint ? 8 : isScenic ? 6 : 5;
        if (isSelected || isDragged) radius += 3;
        if (isHovered) radius += 2;

        ctx.save();

        // Selection ring
        if (isSelected || isDragged) {
          ctx.strokeStyle = "#fff";
          ctx.lineWidth   = 2.5;
          ctx.globalAlpha = 0.9;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, radius + 4, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Handle fill
        ctx.fillStyle   = isDragged  ? "#ffffff"
                        : isSelected ? "#ffffff"
                        : isActive   ? route.style.color
                        : "rgba(255,255,255,0.2)";
        ctx.strokeStyle = isEndpoint ? "#fff" : "rgba(255,255,255,0.55)";
        ctx.lineWidth   = isEndpoint ? 2 : 1.5;
        ctx.globalAlpha = isActive ? 1 : 0.4;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // Scenic marker ring (active route)
        if (isActive && isScenic) {
          ctx.save();
          ctx.strokeStyle = route.style.color;
          ctx.lineWidth   = 1;
          ctx.globalAlpha = 0.45;
          ctx.setLineDash([2, 3]);
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, radius + 6, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        // Waypoint label (active route + endpoint, scenic, or named)
        if (isActive && (wp.label || isEndpoint || isScenic)) {
          ctx.save();
          ctx.fillStyle   = "rgba(255,255,255,0.9)";
          ctx.font        = "11px monospace";
          ctx.shadowColor = "rgba(0,0,0,0.8)";
          ctx.shadowBlur  = 4;
          var labelText = wp.label || (idx === 0 ? "origin" : "dest");
          ctx.fillText(labelText, pt.x + radius + 4, pt.y - 4);
          ctx.restore();
        }
      });

      // ── Insertion preview (segment hover) ─────────────────────────────────
      if (isActive && ix.insertionPreview) {
        var ip = ix.insertionPreview;
        ctx.save();
        ctx.strokeStyle = route.style.color;
        ctx.fillStyle   = "#fff";
        ctx.lineWidth   = 1.5;
        ctx.globalAlpha = 0.75;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(ip.x, ip.y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      // ── Metrics HUD (active route only) ───────────────────────────────────
      if (isActive) {
        var m = route.metrics;
        var hudX = 12, hudY = 12, hudW = 220, hudH = 78;

        ctx.save();
        ctx.fillStyle   = "rgba(0,0,0,0.65)";
        ctx.beginPath();
        ctx.roundRect(hudX, hudY, hudW, hudH, 4);
        ctx.fill();

        // Route name
        ctx.fillStyle = route.style.color;
        ctx.font      = "10px monospace";
        ctx.fillText(route.name, hudX + 10, hudY + 18);

        // Metrics lines
        ctx.fillStyle = "rgba(255,255,255,0.75)";
        ctx.font      = "10px monospace";
        ctx.fillText(
          m.distanceKm + " km  ·  ~" + m.estimatedMinutes + " min",
          hudX + 10, hudY + 34);
        ctx.fillText(
          m.waypointCount + " waypoints  ·  avg seg " + m.avgSegmentLength + " m",
          hudX + 10, hudY + 48);

        // Camera mode
        ctx.fillStyle = "rgba(255,255,255,0.4)";
        ctx.font      = "9px monospace";
        ctx.fillText(
          "cam " + (route.camera.mode || "observe") + "  ·  zoom " +
          (route.camera.zoomMin || "—") + "–" + (route.camera.zoomMax || "—"),
          hudX + 10, hudY + 64);

        ctx.restore();
      }
    });

    // No empty-state guidance — routes come from the Routes panel form.
  }

  SBE.MapboxOperatorRenderer = { render: render };

})(window);
