// ── HarborSectorAuthorityDebug v1.0.0 ────────────────────────────────────────
// 0528D_WOS_HarborSectorAuthority_v1.0.0 — debug companion
// Status: active
// Classification: debug-companion — do NOT load in production
//
// Binds _wos.debug.harborSector with:
//   sector()           — print full sector descriptor
//   bounds()           — print sector bounding box
//   anchors()          — tabular anchor zone report
//   ferries()          — ferry corridor points and render hints
//   lod()              — current camera zoom, altitude band, resolved LOD
//   near(lat,lng,radM) — anchors within radius of a point
//   focus()            — current sector focus score
//   audit()            — full system state report
//
// Placement: wall/systems/geography/harborSectorAuthorityDebug.js
// Load: AFTER main.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  global._wos       = global._wos       || {};
  global._wos.debug = global._wos.debug || {};

  var VERSION = '1.0.0';

  function _hsa()  { return global.SBE && global.SBE.HarborSectorAuthority; }
  function _cam()  {
    var mvr = global.SBE && global.SBE.MapboxViewportRuntime;
    return (mvr && mvr.getCamera) ? mvr.getCamera() : null;
  }
  function _aws()  { return global.SBE && global.SBE.AltitudeWorldState; }

  function _pad(s, w) {
    s = String(s);
    while (s.length < w) s += ' ';
    return s;
  }

  // ── sector() ──────────────────────────────────────────────────────────────────

  function sector() {
    var hsa = _hsa();
    if (!hsa) { console.warn('[HarborSectorDebug] HarborSectorAuthority not loaded'); return null; }

    var s = hsa.getActiveSector();
    console.group('[HarborSectorDebug] sector() — ' + s.id);
    console.log('id          :', s.id);
    console.log('label       :', s.label);
    console.log('description :', s.description);
    console.log('bounds      :', JSON.stringify(s.bounds));
    console.log('anchors     :', s.anchorZones.length);
    console.log('corridors   :', s.ferryCorridors.length);
    console.log('heroTargets :', s.heroGeometryTargets.length);
    console.log('lodRules    :', s.lodRules.length);
    console.groupEnd();
    return s;
  }

  // ── bounds() ──────────────────────────────────────────────────────────────────

  function bounds() {
    var hsa = _hsa();
    if (!hsa) { console.warn('[HarborSectorDebug] HarborSectorAuthority not loaded'); return null; }

    var b = hsa.getSectorBounds();
    console.group('[HarborSectorDebug] bounds()');
    console.log('west  :', b.west,  ' (lng)');
    console.log('east  :', b.east,  ' (lng)');
    console.log('south :', b.south, ' (lat)');
    console.log('north :', b.north, ' (lat)');
    var spanLat = (b.north - b.south) * 111000;
    var spanLng = (b.east  - b.west)  * 111000 * Math.cos(((b.north + b.south) / 2) * Math.PI / 180);
    console.log('span  :', Math.round(spanLng / 1000) + ' km W→E  ×  ' + Math.round(spanLat / 1000) + ' km S→N');
    console.groupEnd();
    return b;
  }

  // ── anchors() ─────────────────────────────────────────────────────────────────

  function anchors() {
    var hsa = _hsa();
    if (!hsa) { console.warn('[HarborSectorDebug] HarborSectorAuthority not loaded'); return []; }

    var zones = hsa.getAnchorZones();
    console.group('[HarborSectorDebug] anchors() — ' + zones.length + ' registered');
    console.log(
      _pad('ID', 32) +
      _pad('CATEGORY', 24) +
      _pad('PRI', 5) +
      _pad('WEIGHT', 8) +
      _pad('RADIUS_M', 10) +
      'LAT / LNG'
    );
    console.log('─'.repeat(100));
    for (var i = 0; i < zones.length; i++) {
      var z = zones[i];
      console.log(
        _pad(z.id,               32) +
        _pad(z.category,         24) +
        _pad(z.priority,          5) +
        _pad(z.cinematicWeight.toFixed(2), 8) +
        _pad(z.radiusM,          10) +
        z.lat.toFixed(4) + ' / ' + z.lng.toFixed(4)
      );
    }
    console.groupEnd();
    return zones;
  }

  // ── ferries() ─────────────────────────────────────────────────────────────────

  function ferries() {
    var hsa = _hsa();
    if (!hsa) { console.warn('[HarborSectorDebug] HarborSectorAuthority not loaded'); return []; }

    var corridors = hsa.getFerryCorridors();
    console.group('[HarborSectorDebug] ferries() — ' + corridors.length + ' corridors');
    for (var i = 0; i < corridors.length; i++) {
      var c = corridors[i];
      console.group(c.id + ' [' + c.renderHint + '] priority:' + c.priority);
      console.log('label   :', c.label);
      console.log('vessels :', c.expectedVesselClasses.join(', '));
      console.log('points  :');
      for (var pi = 0; pi < c.points.length; pi++) {
        var p = c.points[pi];
        var arrow = pi === 0 ? 'START' : pi === c.points.length - 1 ? 'END  ' : 'MID  ';
        console.log('  ' + arrow + ' ' + p.lat.toFixed(4) + ' / ' + p.lng.toFixed(4));
      }
      console.groupEnd();
    }
    console.groupEnd();
    return corridors;
  }

  // ── lod() ─────────────────────────────────────────────────────────────────────

  function lod() {
    var hsa = _hsa();
    if (!hsa) { console.warn('[HarborSectorDebug] HarborSectorAuthority not loaded'); return null; }

    var camera = _cam();
    var aws    = _aws();
    var resolved = hsa.resolveSectorLOD(camera, aws);

    console.group('[HarborSectorDebug] lod()');
    console.log('camera.zoom       :', camera ? camera.zoom.toFixed(2) : 'n/a');
    console.log('altitudeBand      :', aws ? aws.band : 'n/a (no AltitudeWorldState)');
    console.log('');
    console.log('── Resolved LOD ───────────────────────────────────');
    console.log('zoomRange         :', resolved.zoomMin + ' → ' + resolved.zoomMax);
    console.log('cameraBand        :', resolved.cameraBand);
    console.log('shorelineDetail   :', resolved.shorelineDetail);
    console.log('landmarkDetail    :', resolved.landmarkDetail);
    console.log('ferryCorridorDetail:', resolved.ferryCorridorDetail);
    console.log('buildingDetail    :', resolved.buildingDetail);
    console.groupEnd();
    return resolved;
  }

  // ── near(lat, lng, radiusM) ───────────────────────────────────────────────────

  function near(lat, lng, radiusM) {
    var hsa = _hsa();
    if (!hsa) { console.warn('[HarborSectorDebug] HarborSectorAuthority not loaded'); return []; }

    radiusM = radiusM || 5000;
    var zones = hsa.resolveNearbyAnchorZones(lat, lng, radiusM);

    console.group('[HarborSectorDebug] near(' + lat + ', ' + lng + ', ' + radiusM + 'm) — ' + zones.length + ' found');
    for (var i = 0; i < zones.length; i++) {
      var z = zones[i];
      console.log(z.id + '  [' + z.category + ']  pri:' + z.priority + '  wt:' + z.cinematicWeight.toFixed(2));
    }
    console.groupEnd();
    return zones;
  }

  // ── focus() ───────────────────────────────────────────────────────────────────

  function focus() {
    var hsa = _hsa();
    if (!hsa) { console.warn('[HarborSectorDebug] HarborSectorAuthority not loaded'); return 0; }

    var camera = _cam();
    var score  = hsa.resolveSectorFocusScore(camera);

    console.log('[HarborSectorDebug] focus() score:', score.toFixed(4),
      score > 0.7 ? '▲ HIGH — sector is cinematically active' :
      score > 0.4 ? '◆ MED — sector is in view' :
      '▼ LOW — camera outside sector influence');
    return score;
  }

  // ── audit() ──────────────────────────────────────────────────────────────────

  function audit() {
    var hsa = _hsa();

    console.group('[HarborSectorDebug] audit()');

    console.log('── System ─────────────────────────────────────────');
    console.log('HarborSectorAuthority :', !!hsa);
    console.log('HarborSectorState     :', !!(global.SBE && global.SBE.HarborSectorState));
    console.log('AltitudeWorldState    :', !!(global.SBE && global.SBE.AltitudeWorldState));
    console.log('MapboxViewportRuntime :', !!(global.SBE && global.SBE.MapboxViewportRuntime));

    if (!hsa) { console.groupEnd(); return; }

    var s      = hsa.getActiveSector();
    var camera = _cam();
    var aws    = _aws();
    var lod_   = hsa.resolveSectorLOD(camera, aws);
    var score  = hsa.resolveSectorFocusScore(camera);

    console.log('');
    console.log('── Sector ─────────────────────────────────────────');
    console.log('id              :', s.id);
    console.log('anchors         :', s.anchorZones.length);
    console.log('corridors       :', s.ferryCorridors.length);
    console.log('heroTargets     :', s.heroGeometryTargets.length);
    console.log('deferredTargets :', s.deferredBakedGeometry.length);

    console.log('');
    console.log('── Bounds ─────────────────────────────────────────');
    var b = hsa.getSectorBounds();
    console.log('W/E :', b.west + ' → ' + b.east);
    console.log('S/N :', b.south + ' → ' + b.north);

    console.log('');
    console.log('── Camera ─────────────────────────────────────────');
    if (camera) {
      console.log('zoom            :', camera.zoom.toFixed(2));
      console.log('pitch           :', (camera.pitch || 0).toFixed(1) + '°');
      console.log('bearing         :', (camera.bearing || 0).toFixed(1) + '°');
      var insideSector = hsa.isPointInsideSector(
        camera.lat || (camera.center && camera.center[1]) || 0,
        camera.lng || (camera.center && camera.center[0]) || 0
      );
      console.log('insideSector    :', insideSector);
    } else {
      console.log('(MapboxViewportRuntime not available)');
    }

    console.log('');
    console.log('── Focus ──────────────────────────────────────────');
    console.log('focusScore      :', score.toFixed(4));
    console.log('altitudeBand    :', aws ? aws.band : 'n/a');

    console.log('');
    console.log('── Resolved LOD ───────────────────────────────────');
    console.log('zoomRange       :', lod_.zoomMin + ' → ' + lod_.zoomMax);
    console.log('cameraBand      :', lod_.cameraBand);
    console.log('shorelineDetail :', lod_.shorelineDetail);
    console.log('landmarkDetail  :', lod_.landmarkDetail);
    console.log('ferryCorridorDetail:', lod_.ferryCorridorDetail);
    console.log('buildingDetail  :', lod_.buildingDetail);

    console.log('');
    console.log('── Anchor Zones (priority ≥ 4) ────────────────────');
    var zones = hsa.getAnchorZones();
    for (var i = 0; i < zones.length; i++) {
      if (zones[i].priority >= 4) {
        console.log(' ', zones[i].id, '  wt:' + zones[i].cinematicWeight.toFixed(2), '  ' + zones[i].lat.toFixed(4) + ' / ' + zones[i].lng.toFixed(4));
      }
    }

    console.log('');
    console.log('── Debug Renderer ─────────────────────────────────');
    var flags = global.SBE && global.SBE.runtimeFlags;
    console.log('showHarborSectorDebug :', flags ? !!flags.showHarborSectorDebug : 'SBE.runtimeFlags not set');
    console.log('  Enable: SBE.runtimeFlags.showHarborSectorDebug = true');

    console.groupEnd();
  }

  // ── Bind ──────────────────────────────────────────────────────────────────────

  function _bind() {
    global._wos       = global._wos       || {};
    global._wos.debug = global._wos.debug || {};
    global._wos.debug.harborSector = {
      sector:  sector,
      bounds:  bounds,
      anchors: anchors,
      ferries: ferries,
      lod:     lod,
      near:    near,
      focus:   focus,
      audit:   audit,
    };
    console.log('[HarborSectorAuthorityDebug] v' + VERSION + ' ready — _wos.debug.harborSector bound');
    console.log('  Commands: .sector() · .bounds() · .anchors() · .ferries() · .lod() · .near(lat,lng,radM) · .focus() · .audit()');
  }

  _bind();

  var _attempts = 0;
  var _timer = global.setInterval(function () {
    _attempts++;
    if (!global._wos || !global._wos.debug || !global._wos.debug.harborSector) {
      _bind();
    }
    if (_attempts >= 20) global.clearInterval(_timer);
  }, 250);

})(window);
