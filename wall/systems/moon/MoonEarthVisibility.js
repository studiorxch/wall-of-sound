(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});

  // ── MoonEarthVisibility — near-side / far-side Earth visibility logic ──────────
  //
  // On the near side of the Moon, Earth appears roughly fixed in the sky.
  // On the far side, Earth is not visible.
  // Dramatic Earthrise occurs during orbital movement, not default surface standing.
  //
  // Lunar longitude: 0° = sub-Earth point (center near-side)
  //                ±90° = limb
  //                ±180° / 180° = far-side center (Earth never visible)
  //
  // The near-side / far-side boundary is approximately ±90° longitude.

  var NEAR_SIDE_LIMIT_DEG = 90;   // |lng| < 90 → Earth potentially visible
  var LIMB_FADE_DEG       = 10;   // smooth fade zone near ±90°

  // ── isEarthVisible ────────────────────────────────────────────────────────────
  // lunarLngDeg: longitude on Moon surface, -180 to 180
  // Returns boolean (strict rule)

  function isEarthVisible(lunarLngDeg) {
    return Math.abs(lunarLngDeg) < NEAR_SIDE_LIMIT_DEG;
  }

  // ── earthVisibilityAlpha ──────────────────────────────────────────────────────
  // Returns opacity [0..1] for Earth in sky — fades near ±90° limb, 0 on far side

  function earthVisibilityAlpha(lunarLngDeg) {
    var abs = Math.abs(lunarLngDeg);
    if (abs >= NEAR_SIDE_LIMIT_DEG) return 0;
    var fadeStart = NEAR_SIDE_LIMIT_DEG - LIMB_FADE_DEG;
    if (abs <= fadeStart) return 1;
    return 1 - (abs - fadeStart) / LIMB_FADE_DEG;
  }

  // ── earthSkyPosition ─────────────────────────────────────────────────────────
  // Returns the angular position of Earth in the lunar sky for a given surface point.
  // On the near side, Earth hovers near the zenith at the sub-Earth point (lng 0, lat 0).
  // Returns { azimuthDeg, elevationDeg } or null if not visible.

  function earthSkyPosition(lunarLngDeg, lunarLatDeg) {
    if (!isEarthVisible(lunarLngDeg)) return null;
    // Earth's azimuth roughly tracks lunar longitude offset from sub-Earth meridian
    var azimuth   = -lunarLngDeg * 0.8;    // simplified
    // Elevation: near sub-Earth point (lng≈0, lat≈0), Earth is near overhead
    var elevation = 90 - Math.sqrt(lunarLngDeg * lunarLngDeg + lunarLatDeg * lunarLatDeg) * 0.6;
    return {
      azimuthDeg:   Math.max(-180, Math.min(180, azimuth)),
      elevationDeg: Math.max(0, Math.min(90, elevation))
    };
  }

  // ── getSurfaceView ────────────────────────────────────────────────────────────
  // Returns the MoonObjectRegistry VIEW token for the given surface position

  function getSurfaceView(lunarLngDeg, lunarLatDeg, isOrbiting) {
    var reg = SBE.MoonObjectRegistry;
    if (!reg) return 'near_side';
    if (isOrbiting) return reg.VIEWS.EARTHRISE;
    if (!isEarthVisible(lunarLngDeg)) return reg.VIEWS.FAR_SIDE;
    // Earth-view orientation: if looking generally toward Earth (elevation > 45°)
    var pos = earthSkyPosition(lunarLngDeg, lunarLatDeg);
    if (pos && pos.elevationDeg > 45 && Math.abs(lunarLngDeg) < 30) {
      return reg.VIEWS.EARTH_VIEW;
    }
    return reg.VIEWS.NEAR_SIDE;
  }

  SBE.MoonEarthVisibility = Object.freeze({
    NEAR_SIDE_LIMIT_DEG:  NEAR_SIDE_LIMIT_DEG,
    LIMB_FADE_DEG:        LIMB_FADE_DEG,
    isEarthVisible:       isEarthVisible,
    earthVisibilityAlpha: earthVisibilityAlpha,
    earthSkyPosition:     earthSkyPosition,
    getSurfaceView:       getSurfaceView
  });

})(window);
