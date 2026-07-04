(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});

  // ── MoonScaleModel — real Earth–Moon scale constants and helpers ───────────────
  //
  // Source values are real astronomical constants.
  // Render scale is separate from truth scale — use RENDER_SCALE for scene sizing,
  // reference REAL_* for any accuracy-dependent logic.

  var REAL = Object.freeze({
    EARTH_DIAMETER_KM:     12742,
    MOON_DIAMETER_KM:       3474,
    EARTH_MOON_DISTANCE_KM: 384400,    // average
    EARTH_MOON_DISTANCE_MIN_KM: 356500, // perigee
    EARTH_MOON_DISTANCE_MAX_KM: 406700, // apogee
    EARTH_TO_MOON_RATIO:   3.67,        // Earth ≈ 3.67× wider than Moon
    MOON_ANGULAR_DIAMETER_FROM_EARTH_DEG: 0.52,
    EARTH_ANGULAR_DIAMETER_FROM_MOON_DEG: 1.90  // Earth appears ~3.7× larger than Moon does from Earth
  });

  // Scene-space scale — Earth radius = 1.0 unit
  var RENDER = Object.freeze({
    EARTH_RADIUS:          1.0,
    MOON_RADIUS:           1.0 / 3.67,               // ≈ 0.272
    // Distance in scene units — compressed but preserves "far away" feel
    // Full-scale would be 60 Earth-radii; we use a cinematic fraction for usability
    EARTH_MOON_DISTANCE:   12.0,                      // scene units (stylized but vast-feeling)
    EARTH_MOON_DISTANCE_AUTHENTIC: 60.0,              // Level A: full proportional
    TRANSIT_NEAR_EARTH:    2.5,                       // scene units — just outside Earth atmosphere
    TRANSIT_NEAR_MOON:     1.8,                       // scene units — approach zone
    LUNAR_ORBIT_ALTITUDE:  0.45,                      // above Moon surface (scene units)
    LUNAR_SURFACE_OFFSET:  0.01                       // just above surface
  });

  // ── helpers ───────────────────────────────────────────────────────────────────

  // Returns Moon's scene position along the +Z axis given current style level
  function moonPosition(authenticityLevel) {
    var d = authenticityLevel === 'authentic'
      ? RENDER.EARTH_MOON_DISTANCE_AUTHENTIC
      : RENDER.EARTH_MOON_DISTANCE;
    return { x: 0, y: 0, z: -d };
  }

  // Returns where the camera should sit for a given transit progress [0..1]
  // 0 = near Earth, 1 = near Moon
  function transitCameraPosition(progress, authenticityLevel) {
    var d = authenticityLevel === 'authentic'
      ? RENDER.EARTH_MOON_DISTANCE_AUTHENTIC
      : RENDER.EARTH_MOON_DISTANCE;
    var t  = Math.max(0, Math.min(1, progress));
    var ez = RENDER.TRANSIT_NEAR_EARTH;
    var mz = -(d - RENDER.TRANSIT_NEAR_MOON);
    return { x: 0, y: 0, z: ez + (mz - ez) * t };
  }

  // Returns approximate distance traveled in km for a given progress [0..1]
  function transitDistanceKm(progress) {
    return Math.round(REAL.EARTH_MOON_DISTANCE_KM * Math.max(0, Math.min(1, progress)));
  }

  SBE.MoonScaleModel = Object.freeze({
    REAL:                   REAL,
    RENDER:                 RENDER,
    moonPosition:           moonPosition,
    transitCameraPosition:  transitCameraPosition,
    transitDistanceKm:      transitDistanceKm
  });

})(window);
