(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});

  // ── OrbitalMapContext — captures WOS map state before Orbital entry ───────────

  var WOS_DEFAULT_CENTER = { lng: -74.0165, lat: 40.7015 };

  var _lastContext = null;

  // ── capture ───────────────────────────────────────────────────────────────────

  function capture(map, transportState) {
    var ctx = {
      centerLngLat:      WOS_DEFAULT_CENTER,
      zoom:              12.8,
      bearing:           -12,
      pitch:             30,
      altitudeEstimate:  null,
      selectedTransport: (transportState && transportState.selectedTransport) || 'flight',
      fromLabel:         (transportState && transportState.fromLabel)         || null,
      toLabel:           (transportState && transportState.toLabel)           || null,
      routeActive:       (transportState && !!transportState.routeActive)     || false,
      routeGeometry:     (transportState && transportState.routeGeometry)     || null,
      mapStyleId:        null,
      capturedAt:        Date.now()
    };

    if (map) {
      try {
        var c = map.getCenter();
        ctx.centerLngLat = { lng: c.lng, lat: c.lat };
        ctx.zoom         = map.getZoom();
        ctx.bearing      = map.getBearing();
        ctx.pitch        = map.getPitch();
        ctx.mapStyleId   = map.getStyle ? (map.getStyle().name || null) : null;

        // Rough altitude estimate from zoom (1px ≈ 156543m at zoom 0)
        var metersPerPixel = 156543.03 * Math.cos(c.lat * Math.PI / 180) / Math.pow(2, ctx.zoom);
        ctx.altitudeEstimate = Math.round(metersPerPixel * (global.innerHeight / 2));
      } catch (e) {}
    }

    _lastContext = ctx;
    return ctx;
  }

  // ── getLastContext ─────────────────────────────────────────────────────────────

  function getLastContext() {
    return _lastContext ? Object.assign({}, _lastContext) : null;
  }

  // ── clear ─────────────────────────────────────────────────────────────────────

  function clear() { _lastContext = null; }

  // ── lngLatToGlobeRotation — maps a lng/lat to globe euler angles ──────────────
  // Returns { rotX, rotY } in radians so the named location faces the viewer.

  function lngLatToGlobeRotation(lng, lat) {
    // Globe Y rotation: longitude (east = positive, west = negative)
    // rotY rotates the globe so `lng` faces the +Z axis (viewer direction)
    var rotY = -(lng * Math.PI / 180);
    // Globe X rotation: latitude tilt (north = positive)
    var rotX = (lat * Math.PI / 180);
    return { rotX: rotX, rotY: rotY };
  }

  SBE.OrbitalMapContext = Object.freeze({
    capture:               capture,
    getLastContext:        getLastContext,
    clear:                 clear,
    lngLatToGlobeRotation: lngLatToGlobeRotation,
    DEFAULT_CENTER:        WOS_DEFAULT_CENTER
  });

})(window);
