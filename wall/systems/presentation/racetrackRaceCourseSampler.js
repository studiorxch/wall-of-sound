// ── RacetrackRaceCourseSampler v1.0.0 ─────────────────────────────────────────
// 0806C_RACETRACK_Multi_Racer_Runtime_Foundation
// Status: active | Classification: presentation / racetrack-race-course-sampler
//
// Pure course-geometry helpers for the race runtime — no DOM, no THREE, no
// runtime state. Two responsibilities:
//
//   sampleCourseAtProgress(coursePackage, progress01)
//     Maps a progress fraction to an interpolated point on the course's own
//     frozen sampled geometry. Modeled on
//     music/src/logic/maps/raceLaneSampling.ts's binary-search approach —
//     that file is TS/MUSIC-side and not reachable from wall/, so this is a
//     new port operating on RacetrackCoursePackage.progressSamples (which
//     already carries index/distanceMeters/progress01/coordinate/headingDeg
//     per point — headingDeg does NOT need to be re-derived here).
//
//   projectCourseToWorld(coursePackage)
//     Returns a project([lng,lat]) -> {x,z} closure, bounding-box-fit into a
//     fixed world extent. Course samples are stored as raw geographic
//     lng/lat with no existing projected form anywhere in the codebase (the
//     Selection route SVG's own project() is a private, non-exported closure
//     doing the analogous thing for a 2D viewBox) — this is the 3D XZ
//     equivalent, shared by the route line and every racer marker so they
//     stay in one consistent coordinate space.
//
// Always samples against progressSamples (the full-resolution, never-
// decimated authority) — never previewRoute (decimated, rendering-only).
//
// Load: after racetrackCoursePackageRuntime.js, before racetrackRaceScene.js
// and racetrackRaceRuntime.js.
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  function _clamp01(v) {
    if (typeof v !== 'number' || !isFinite(v)) return 0;
    return Math.max(0, Math.min(1, v));
  }

  // Shortest-arc lerp for a heading in degrees (wraps across the 0/360
  // boundary the short way, e.g. 350 -> 10 interpolates through 360/0, not
  // backwards through 180).
  function _lerpHeadingDeg(a, b, t) {
    var diff = ((b - a + 540) % 360) - 180;
    return a + diff * t;
  }

  function _lerp(a, b, t) {
    return a + (b - a) * t;
  }

  // Binary search over progressSamples (sorted ascending by progress01) for
  // the bracket [lo, lo+1] such that samples[lo].progress01 <= progress01.
  function _findBracket(samples, progress01) {
    var lo = 0;
    var hi = samples.length - 1;
    while (lo < hi - 1) {
      var mid = (lo + hi) >> 1;
      if (samples[mid].progress01 <= progress01) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    return lo;
  }

  // opts: coursePackage.progressSamples — full-resolution samples, each
  // {index, distanceMeters, progress01, coordinate:[lng,lat], headingDeg}.
  // Returns {coordinate:[lng,lat], headingDeg, distanceMeters}. progress01
  // is clamped to [0,1]; a degenerate/too-short sample list returns the
  // single available sample (or a zeroed fallback if truly empty).
  function sampleCourseAtProgress(coursePackage, progress01) {
    var samples = coursePackage && coursePackage.progressSamples;
    var p = _clamp01(progress01);

    if (!Array.isArray(samples) || samples.length === 0) {
      return { coordinate: [0, 0], headingDeg: 0, distanceMeters: 0 };
    }
    if (samples.length === 1) {
      var only = samples[0];
      return { coordinate: only.coordinate.slice(), headingDeg: only.headingDeg, distanceMeters: only.distanceMeters };
    }

    if (p <= samples[0].progress01) {
      var first = samples[0];
      return { coordinate: first.coordinate.slice(), headingDeg: first.headingDeg, distanceMeters: first.distanceMeters };
    }
    var lastIdx = samples.length - 1;
    if (p >= samples[lastIdx].progress01) {
      var last = samples[lastIdx];
      return { coordinate: last.coordinate.slice(), headingDeg: last.headingDeg, distanceMeters: last.distanceMeters };
    }

    var i = _findBracket(samples, p);
    var s0 = samples[i];
    var s1 = samples[i + 1];
    var span = s1.progress01 - s0.progress01;
    var t = span > 1e-12 ? (p - s0.progress01) / span : 0;

    return {
      coordinate: [_lerp(s0.coordinate[0], s1.coordinate[0], t), _lerp(s0.coordinate[1], s1.coordinate[1], t)],
      headingDeg: _lerpHeadingDeg(s0.headingDeg, s1.headingDeg, t),
      distanceMeters: _lerp(s0.distanceMeters, s1.distanceMeters, t),
    };
  }

  var WORLD_EXTENT = 18; // world units spanning the longer of the course's lng/lat extents

  // Returns project([lng,lat]) -> {x,z}, a bounding-box-fit orthographic
  // projection (no real map projection, matching the same simplification
  // RacetrackRouteVisual's private SVG project() already uses) centered on
  // the course's own bounding box. Degenerate (single-point/zero-extent)
  // courses get a safe non-zero scale fallback.
  function projectCourseToWorld(coursePackage) {
    var samples = (coursePackage && coursePackage.progressSamples) || [];
    if (samples.length === 0) {
      return function () { return { x: 0, z: 0 }; };
    }

    var minLng = samples[0].coordinate[0], maxLng = minLng;
    var minLat = samples[0].coordinate[1], maxLat = minLat;
    for (var i = 1; i < samples.length; i++) {
      var c = samples[i].coordinate;
      if (c[0] < minLng) minLng = c[0];
      if (c[0] > maxLng) maxLng = c[0];
      if (c[1] < minLat) minLat = c[1];
      if (c[1] > maxLat) maxLat = c[1];
    }

    var lngSpan = Math.max(1e-9, maxLng - minLng);
    var latSpan = Math.max(1e-9, maxLat - minLat);
    var scale = WORLD_EXTENT / Math.max(lngSpan, latSpan);
    var midLng = (minLng + maxLng) / 2;
    var midLat = (minLat + maxLat) / 2;

    return function project(coordinate) {
      return {
        x: (coordinate[0] - midLng) * scale,
        z: -(coordinate[1] - midLat) * scale,
      };
    };
  }

  SBE.RacetrackRaceCourseSampler = Object.freeze({
    VERSION: VERSION,
    sampleCourseAtProgress: sampleCourseAtProgress,
    projectCourseToWorld: projectCourseToWorld,
  });

  console.log('[RacetrackRaceCourseSampler] v' + VERSION + ' loaded');

})(window);
