// 0513_WOS_PathSampler_v1.0.0
// Sample evenly spaced points along geometric paths.
// Used by SymbolRenderer for procedural dotted line rendering.
// All inputs/outputs in canvas pixel space.
// Attaches to WOS.PathSampler.

(function initPathSampler(global) {
  "use strict";

  var WOS = (global.WOS = global.WOS || {});

  // Evenly spaced points along a line segment, centered in the segment.
  function sampleLine(ax, ay, bx, by, spacing) {
    var len = Math.hypot(bx - ax, by - ay);
    if (len < 1) return [{ x: (ax + bx) / 2, y: (ay + by) / 2 }];
    var pts = [];
    var nx = (bx - ax) / len, ny = (by - ay) / len;
    var offset = (len % spacing) / 2;  // center the dot run
    for (var d = offset + spacing * 0.5; d <= len; d += spacing) {
      pts.push({ x: ax + nx * d, y: ay + ny * d });
    }
    return pts;
  }

  // Evenly spaced points along all 4 edges of a rect.
  function sampleRect(x, y, w, h, spacing) {
    var edges = [
      [x,     y,     x + w, y    ],
      [x + w, y,     x + w, y + h],
      [x + w, y + h, x,     y + h],
      [x,     y + h, x,     y    ],
    ];
    var pts = [];
    for (var i = 0; i < edges.length; i++) {
      var e = edges[i];
      var seg = sampleLine(e[0], e[1], e[2], e[3], spacing);
      for (var j = 0; j < seg.length; j++) pts.push(seg[j]);
    }
    return pts;
  }

  // Evenly spaced points along a full circle circumference.
  function sampleCircle(cx, cy, r, spacing) {
    var circumference = 2 * Math.PI * r;
    if (circumference < 1) return [];
    var count = Math.max(1, Math.round(circumference / spacing));
    var pts = [];
    for (var i = 0; i < count; i++) {
      var angle = (i / count) * 2 * Math.PI;
      pts.push({ x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });
    }
    return pts;
  }

  // Evenly spaced points along a partial arc.
  function sampleArc(cx, cy, r, startAngle, endAngle, spacing) {
    var span = Math.abs(endAngle - startAngle);
    var arcLen = r * span;
    if (arcLen < 1) return [];
    var count = Math.max(1, Math.round(arcLen / spacing));
    var pts = [];
    for (var i = 0; i < count; i++) {
      var angle = startAngle + (i / count) * (endAngle - startAngle);
      pts.push({ x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });
    }
    return pts;
  }

  // Evenly spaced points along a corner path: p0 → [rounded bend at p1] → p2.
  // Approximated as two line segments for sampling (radius affects render, not sampling).
  function sampleCorner(p0x, p0y, p1x, p1y, p2x, p2y, spacing) {
    var seg1 = sampleLine(p0x, p0y, p1x, p1y, spacing);
    var seg2 = sampleLine(p1x, p1y, p2x, p2y, spacing);
    return seg1.concat(seg2);
  }

  WOS.PathSampler = {
    sampleLine:   sampleLine,
    sampleRect:   sampleRect,
    sampleCircle: sampleCircle,
    sampleArc:    sampleArc,
    sampleCorner: sampleCorner,
  };

  console.log("[WOS PathSampler] Loaded — v1.0.0");
})(window);
