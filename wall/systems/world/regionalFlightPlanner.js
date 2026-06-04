// ── RegionalFlightPlanner v1.0.0 ─────────────────────────────────────────────
// 0528O_WOS_RegionalFlightPlanner_v1.0.0
// Status: active
// Classification: planner-runtime
//
// Purpose:
//   Replaces hardcoded route dependency with planner-driven airport selection,
//   destination pinning, and generated route presets.
//
//   Three destination modes:
//     airport     — planAirportToAirport('JFK', 'BOS')
//     coordinate  — planToCoordinate('JFK', { lat, lng, label })
//     pin         — pinDestination({ lat, lng, label })
//
//   Three route profiles:
//     direct          — origin → midpoint → destination
//     scenic_coastal  — adds coastal bend points for East Coast atmosphere
//     skyline_approach — low approach corridor near destination
//
// Authority:
//   OWNS: airport registry, destination registry, pinned destination,
//         generated route objects, planner state
//   READS: RegionalFlightTripRuntime, MapboxViewportRuntime
//   MUST NOT MUTATE: AircraftRuntime, AircraftRenderer, map style,
//                    cloud rendering truth, ObjectProfileRegistry,
//                    RegionalFlightTripRuntime canonical PRESETS
//
// Placement: wall/systems/world/regionalFlightPlanner.js
// Load: AFTER regionalFlightTripRuntime.js, BEFORE regionalFlightTripDebug.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  var VERSION = '1.0.0';

  // ── Airport registry ──────────────────────────────────────────────────────────

  var AIRPORTS = Object.freeze({
    JFK: { id:'JFK', label:'John F. Kennedy International Airport', city:'New York',  region:'NYC', lat:40.6413,  lng:-73.7781,  defaultDepartureHeadingDeg:310, defaultArrivalHeadingDeg:130, enabled:true },
    LGA: { id:'LGA', label:'LaGuardia Airport',                     city:'New York',  region:'NYC', lat:40.7772,  lng:-73.8726,  defaultDepartureHeadingDeg:040, defaultArrivalHeadingDeg:220, enabled:true },
    EWR: { id:'EWR', label:'Newark Liberty International Airport',  city:'Newark',    region:'NYC', lat:40.6895,  lng:-74.1745,  defaultDepartureHeadingDeg:040, defaultArrivalHeadingDeg:220, enabled:true },
    BOS: { id:'BOS', label:'Boston Logan International Airport',    city:'Boston',    region:'BOS', lat:42.3656,  lng:-71.0096,  defaultDepartureHeadingDeg:150, defaultArrivalHeadingDeg:330, enabled:true },
    PHL: { id:'PHL', label:'Philadelphia International Airport',    city:'Philadelphia',region:'PHL',lat:39.8744,  lng:-75.2424,  defaultDepartureHeadingDeg:270, defaultArrivalHeadingDeg:090, enabled:true },
    DCA: { id:'DCA', label:'Ronald Reagan Washington National',     city:'Washington', region:'DCA', lat:38.8521,  lng:-77.0377,  defaultDepartureHeadingDeg:020, defaultArrivalHeadingDeg:200, enabled:true },
    IAD: { id:'IAD', label:'Washington Dulles International',       city:'Dulles',    region:'DCA', lat:38.9531,  lng:-77.4565,  defaultDepartureHeadingDeg:110, defaultArrivalHeadingDeg:290, enabled:true },
    BDL: { id:'BDL', label:'Bradley International Airport',         city:'Windsor Locks',region:'BDL',lat:41.9389,lng:-72.6832,  defaultDepartureHeadingDeg:060, defaultArrivalHeadingDeg:240, enabled:true },
    ALB: { id:'ALB', label:'Albany International Airport',          city:'Albany',    region:'ALB', lat:42.7483,  lng:-73.8017,  defaultDepartureHeadingDeg:010, defaultArrivalHeadingDeg:190, enabled:true },
    YUL: { id:'YUL', label:'Montréal–Trudeau International',        city:'Montréal',  region:'YUL', lat:45.4706,  lng:-73.7408,  defaultDepartureHeadingDeg:060, defaultArrivalHeadingDeg:240, enabled:true },
  });

  // ── Route profiles ─────────────────────────────────────────────────────────────

  var PROFILES = Object.freeze({
    direct: {
      id:         'direct',
      label:      'Direct',
      description:'Fastest path — origin midpoint destination',
      scenicBias: 0,
    },
    scenic_coastal: {
      id:         'scenic_coastal',
      label:      'Scenic Coastal',
      description:'East Coast / harbor atmosphere with coastal bend points',
      scenicBias: 0.7,
    },
    skyline_approach: {
      id:         'skyline_approach',
      label:      'Skyline Approach',
      description:'Cinematic low corridor approach toward destination skyline',
      scenicBias: 0.5,
    },
  });

  // ── Geo utilities ─────────────────────────────────────────────────────────────

  function _haversineKm(lat1, lng1, lat2, lng2) {
    var R    = 6371;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLng = (lng2 - lng1) * Math.PI / 180;
    var a    = Math.sin(dLat/2) * Math.sin(dLat/2) +
               Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
               Math.sin(dLng/2) * Math.sin(dLng/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // Offset (lat, lng) by distKm along bearingDeg.
  function _offsetKm(lat, lng, bearingDeg, distKm) {
    var d  = distKm / 6371;
    var b  = bearingDeg * Math.PI / 180;
    var φ1 = lat * Math.PI / 180;
    var λ1 = lng * Math.PI / 180;
    var φ2 = Math.asin(Math.sin(φ1)*Math.cos(d) + Math.cos(φ1)*Math.sin(d)*Math.cos(b));
    var λ2 = λ1 + Math.atan2(Math.sin(b)*Math.sin(d)*Math.cos(φ1),
                              Math.cos(d) - Math.sin(φ1)*Math.sin(φ2));
    return { lat: φ2 * 180 / Math.PI, lng: λ2 * 180 / Math.PI };
  }

  // Midpoint between two lat/lng pairs.
  function _midpoint(p1, p2) {
    return { lat: (p1.lat + p2.lat) / 2, lng: (p1.lng + p2.lng) / 2 };
  }

  // Validate lat/lng.
  function _validLatLng(lat, lng) {
    return typeof lat === 'number' && isFinite(lat) && lat >= -90  && lat <= 90 &&
           typeof lng === 'number' && isFinite(lng) && lng >= -180 && lng <= 180;
  }

  // ── Altitude selection by distance ────────────────────────────────────────────

  function _cruiseAltFt(distanceKm) {
    if (distanceKm < 80)  return 9000;
    if (distanceKm < 250) return 18000;
    return 28000;
  }

  // ── Duration estimation ────────────────────────────────────────────────────────
  // 420 kts ≈ 12.96 km/min. Clamped 20–180 min.

  var CRUISE_KM_PER_MIN = 12.96;

  function _estimateDurationMs(distanceKm) {
    var minutes = distanceKm / CRUISE_KM_PER_MIN;
    minutes = Math.max(20, Math.min(180, minutes));
    return Math.round(minutes * 60 * 1000);
  }

  // ── Suggested atmospheric state (advisory meta, not executed) ─────────────────

  function _suggestAtmosphere(distanceKm, profileId) {
    if (profileId === 'skyline_approach') return { timeOfDay: 'dusk',  weather: 'thin' };
    if (profileId === 'scenic_coastal')   return { timeOfDay: 'day',   weather: 'harbor_fog' };
    if (distanceKm > 250)                 return { timeOfDay: 'day',   weather: 'thin' };
    return                                       { timeOfDay: 'day',   weather: 'clear' };
  }

  // ── Route shape generation ─────────────────────────────────────────────────────
  // Returns an array of { lat, lng, label } waypoints.

  function _generateWaypoints(origin, destination, profileId, distanceKm) {
    var mid = _midpoint(origin, destination);
    var waypoints;

    if (profileId === 'direct') {
      waypoints = [
        { lat: origin.lat,      lng: origin.lng,      label: origin.label      || 'Origin'      },
        { lat: mid.lat,         lng: mid.lng,          label: 'Cruise midpoint'                  },
        { lat: destination.lat, lng: destination.lng,  label: destination.label || 'Destination' },
      ];
    }

    else if (profileId === 'scenic_coastal') {
      // Bend midpoint eastward (toward Atlantic coast) by ~12% of total distance
      var bendDist  = distanceKm * 0.12;
      var bentMid   = _offsetKm(mid.lat, mid.lng, 90, bendDist);   // east

      // A second bend 65% of the way, slightly south-east for coastal sweep
      var p65 = {
        lat: origin.lat + (destination.lat - origin.lat) * 0.65,
        lng: origin.lng + (destination.lng - origin.lng) * 0.65,
      };
      var bent65 = _offsetKm(p65.lat, p65.lng, 110, bendDist * 0.7);

      waypoints = [
        { lat: origin.lat,      lng: origin.lng,      label: origin.label      || 'Origin'      },
        { lat: bentMid.lat,     lng: bentMid.lng,      label: 'Coastal crossing'                 },
        { lat: bent65.lat,      lng: bent65.lng,       label: 'Coastal approach'                 },
        { lat: destination.lat, lng: destination.lng,  label: destination.label || 'Destination' },
      ];
    }

    else if (profileId === 'skyline_approach') {
      // Midpoint: slightly elevated angle toward destination
      // Pre-approach: 35km out from destination, offset west for sweeping arrival
      var preApproach = _offsetKm(destination.lat, destination.lng, 270, 35);

      waypoints = [
        { lat: origin.lat,       lng: origin.lng,       label: origin.label      || 'Origin'      },
        { lat: mid.lat,          lng: mid.lng,           label: 'Cruise approach'                  },
        { lat: preApproach.lat,  lng: preApproach.lng,   label: 'Skyline corridor'                 },
        { lat: destination.lat,  lng: destination.lng,   label: destination.label || 'Destination' },
      ];
    }

    else {
      // Fallback: direct
      waypoints = [
        { lat: origin.lat,      lng: origin.lng,      label: origin.label      || 'Origin'      },
        { lat: mid.lat,         lng: mid.lng,          label: 'Midpoint'                         },
        { lat: destination.lat, lng: destination.lng,  label: destination.label || 'Destination' },
      ];
    }

    return waypoints;
  }

  // ── Plan builder ──────────────────────────────────────────────────────────────
  // Constructs a full generated preset compatible with RegionalFlightTripRuntime.

  function _buildPlan(origin, destination, profileId) {
    profileId = profileId || 'direct';

    var distKm      = _haversineKm(origin.lat, origin.lng, destination.lat, destination.lng);
    var altFt       = _cruiseAltFt(distKm);
    var durationMs  = _estimateDurationMs(distKm);
    var atmo        = _suggestAtmosphere(distKm, profileId);
    var waypoints   = _generateWaypoints(origin, destination, profileId, distKm);
    var now         = Date.now();
    var id          = 'generated_' + origin.id + '_to_' + (destination.id || 'pin') + '_' + now;

    var departureDeg = origin.defaultDepartureHeadingDeg || 0;

    return {
      id:                   id,
      label:                (origin.label || origin.id || 'Origin') + ' → ' +
                            (destination.label || destination.id || 'Destination'),
      originAirportId:      origin.id     || null,
      destinationAirportId: destination.id || null,
      durationMs:           durationMs,
      aircraftClass:        'regional',
      cruiseAltitudeFt:     altFt,
      cruiseSpeedKts:       420,
      cameraProfile:        'regional_observer',
      departureDeg:         departureDeg,
      route:                waypoints,
      plannerMeta: {
        profileId:             profileId,
        generatedAtMs:         now,
        distanceKm:            Math.round(distKm * 10) / 10,
        routeMode:             profileId,
        scenicBias:            PROFILES[profileId] ? PROFILES[profileId].scenicBias : 0,
        suggestedTimeOfDay:    atmo.timeOfDay,
        suggestedWeather:      atmo.weather,
      },
    };
  }

  // ── Planner state ─────────────────────────────────────────────────────────────

  var _origin      = null;     // airport record from AIRPORTS
  var _destination = null;     // { lat, lng, label, id? } — airport or pinned coord
  var _profileId   = 'direct';
  var _lastPlan    = null;     // most recently generated plan object
  var _previewVisible = false;

  // ── Validation ────────────────────────────────────────────────────────────────

  function _validatePlan(plan) {
    var errs = [];
    if (!plan)                                        errs.push('plan is null');
    if (!plan.route || plan.route.length < 2)         errs.push('route must have ≥ 2 waypoints');
    if (!isFinite(plan.durationMs) || plan.durationMs <= 0) errs.push('durationMs invalid');
    if (!isFinite(plan.cruiseAltitudeFt))             errs.push('cruiseAltitudeFt invalid');
    if (!plan.aircraftClass)                          errs.push('aircraftClass missing');
    return errs;
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  function listAirports() {
    return Object.keys(AIRPORTS).map(function (k) { return AIRPORTS[k]; });
  }

  function getAirport(id) {
    return AIRPORTS[id] || null;
  }

  function setOriginAirport(id) {
    var ap = AIRPORTS[id];
    if (!ap) {
      console.warn('[RegionalFlightPlanner] unknown airport:', id,
        '— use .airports() to list available');
      return false;
    }
    _origin = ap;
    console.log('[RegionalFlightPlanner] origin →', id, '(' + ap.label + ')');
    return true;
  }

  function getOriginAirport() { return _origin; }

  function pinDestination(opts) {
    if (!opts || !_validLatLng(opts.lat, opts.lng)) {
      console.warn('[RegionalFlightPlanner] pinDestination requires { lat, lng }');
      return false;
    }
    _destination = {
      lat:   opts.lat,
      lng:   opts.lng,
      label: opts.label || ('Pin ' + opts.lat.toFixed(3) + ', ' + opts.lng.toFixed(3)),
      id:    null,      // not an airport
    };
    console.log('[RegionalFlightPlanner] destination pinned —', _destination.label,
      '@', _destination.lat + ', ' + _destination.lng);
    return true;
  }

  function clearDestination() {
    _destination = null;
    _lastPlan    = null;
    console.log('[RegionalFlightPlanner] destination cleared');
  }

  function getDestination() { return _destination; }

  function planAirportToAirport(originId, destId) {
    var orig = AIRPORTS[originId];
    var dest = AIRPORTS[destId];
    if (!orig) { console.warn('[RegionalFlightPlanner] unknown origin airport:', originId); return null; }
    if (!dest) { console.warn('[RegionalFlightPlanner] unknown dest airport:', destId);   return null; }

    _origin      = orig;
    _destination = dest;

    var plan = _buildPlan(orig, dest, _profileId);
    _lastPlan = plan;

    console.log('[RegionalFlightPlanner] plan —', plan.label,
      '| ' + plan.plannerMeta.distanceKm + 'km',
      '| ' + Math.round(plan.durationMs / 60000) + 'min',
      '| ' + plan.cruiseAltitudeFt + 'ft',
      '| profile:', _profileId);

    return plan;
  }

  function planToCoordinate(originId, dest) {
    var orig = AIRPORTS[originId];
    if (!orig)                               { console.warn('[RegionalFlightPlanner] unknown origin airport:', originId); return null; }
    if (!dest || !_validLatLng(dest.lat, dest.lng)) { console.warn('[RegionalFlightPlanner] planToCoordinate requires valid { lat, lng }'); return null; }

    _origin      = orig;
    _destination = { lat: dest.lat, lng: dest.lng, label: dest.label || 'Coordinate destination', id: null };

    var plan = _buildPlan(orig, _destination, _profileId);
    _lastPlan = plan;

    console.log('[RegionalFlightPlanner] plan —', plan.label,
      '| ' + plan.plannerMeta.distanceKm + 'km',
      '| ' + Math.round(plan.durationMs / 60000) + 'min',
      '| ' + plan.cruiseAltitudeFt + 'ft',
      '| profile:', _profileId);

    return plan;
  }

  function setProfile(id) {
    if (!PROFILES[id]) {
      console.warn('[RegionalFlightPlanner] unknown profile:', id,
        '— available:', Object.keys(PROFILES).join(', '));
      return;
    }
    _profileId = id;
    console.log('[RegionalFlightPlanner] profile →', id, '(' + PROFILES[id].label + ')');
  }

  function getProfile() { return _profileId; }

  function generatePlan() {
    if (!_origin) {
      console.warn('[RegionalFlightPlanner] no origin set — use setOriginAirport(id)');
      return null;
    }
    if (!_destination) {
      console.warn('[RegionalFlightPlanner] no destination set — use pinDestination() or setDestinationAirport()');
      return null;
    }

    var plan = _buildPlan(_origin, _destination, _profileId);
    _lastPlan = plan;

    console.log('[RegionalFlightPlanner] plan generated —', plan.label,
      '| ' + plan.plannerMeta.distanceKm + 'km',
      '| ' + Math.round(plan.durationMs / 60000) + 'min',
      '| ' + plan.cruiseAltitudeFt + 'ft',
      '| profile:', _profileId);

    return plan;
  }

  function startPlan(plan) {
    var p = plan || _lastPlan;
    if (!p) {
      console.warn('[RegionalFlightPlanner] no plan available — call generatePlan() first');
      return false;
    }

    var errs = _validatePlan(p);
    if (errs.length) {
      console.error('[RegionalFlightPlanner] plan validation failed:', errs.join('; '));
      return false;
    }

    var rt = global.SBE && SBE.RegionalFlightTripRuntime;
    if (!rt) {
      console.error('[RegionalFlightPlanner] RegionalFlightTripRuntime not loaded');
      return false;
    }

    if (!rt.startGeneratedTrip) {
      console.error('[RegionalFlightPlanner] RegionalFlightTripRuntime does not support startGeneratedTrip()');
      return false;
    }

    clearPreview();
    return rt.startGeneratedTrip(p);
  }

  // ── Route preview ─────────────────────────────────────────────────────────────
  // Draws route line + origin/destination markers via a lightweight canvas overlay.
  // Preview is dev/debug only — visually subtle, non-authoritative.

  var _previewCanvas = null;
  var _previewCtx    = null;
  var _previewRafId  = null;

  function _ensurePreviewCanvas() {
    if (_previewCanvas && _previewCanvas.parentElement) return true;
    var container = document.querySelector('.mapboxgl-canvas-container') ||
                    document.getElementById('map') ||
                    document.body;
    _previewCanvas    = document.createElement('canvas');
    _previewCanvas.id = 'wos-planner-preview-canvas';
    _previewCanvas.setAttribute('aria-hidden', 'true');
    _previewCanvas.style.cssText = [
      'position:absolute', 'top:0', 'left:0',
      'width:100%', 'height:100%',
      'pointer-events:none', 'z-index:7',   // below aircraft canvas (z-index:8)
    ].join(';');
    if (container !== document.body && (!container.style.position || container.style.position === 'static')) {
      container.style.position = 'relative';
    }
    container.appendChild(_previewCanvas);
    _previewCtx = _previewCanvas.getContext('2d');
    return true;
  }

  function _resizePreviewCanvas() {
    if (!_previewCanvas || !_previewCanvas.parentElement) return;
    var p = _previewCanvas.parentElement;
    var w = p.clientWidth  || global.innerWidth;
    var h = p.clientHeight || global.innerHeight;
    if (_previewCanvas.width !== w || _previewCanvas.height !== h) {
      _previewCanvas.width  = w;
      _previewCanvas.height = h;
    }
  }

  function _project(lat, lng) {
    var mvr = global.SBE && SBE.MapboxViewportRuntime;
    if (!mvr || !mvr.project) return null;
    try { return mvr.project([lng, lat]); } catch (e) { return null; }
  }

  function _drawPreviewFrame() {
    _previewRafId = global.requestAnimationFrame(_drawPreviewFrame);
    if (!_ensurePreviewCanvas()) return;
    _resizePreviewCanvas();

    _previewCtx.clearRect(0, 0, _previewCanvas.width, _previewCanvas.height);
    if (!_previewVisible || !_lastPlan) return;

    var route = _lastPlan.route;
    if (!route || route.length < 2) return;

    var pts = [];
    for (var i = 0; i < route.length; i++) {
      var pt = _project(route[i].lat, route[i].lng);
      if (pt) pts.push({ pt: pt, label: route[i].label });
    }
    if (pts.length < 2) return;

    var ctx = _previewCtx;

    // Route line
    ctx.save();
    ctx.globalAlpha  = 0.38;
    ctx.strokeStyle  = '#88CCFF';
    ctx.lineWidth    = 1.5;
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.moveTo(pts[0].pt.x, pts[0].pt.y);
    for (var j = 1; j < pts.length; j++) ctx.lineTo(pts[j].pt.x, pts[j].pt.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Waypoint dots
    for (var k = 0; k < pts.length; k++) {
      var isEndpoint = k === 0 || k === pts.length - 1;
      ctx.save();
      ctx.globalAlpha = isEndpoint ? 0.75 : 0.45;
      ctx.fillStyle   = isEndpoint ? '#66BBFF' : '#88BBDD';
      ctx.beginPath();
      ctx.arc(pts[k].pt.x, pts[k].pt.y, isEndpoint ? 5 : 3, 0, Math.PI * 2);
      ctx.fill();

      // Label
      ctx.font         = '9px monospace';
      ctx.fillStyle    = '#AADDFF';
      ctx.strokeStyle  = 'rgba(0,0,0,0.75)';
      ctx.lineWidth    = 2;
      ctx.globalAlpha  = isEndpoint ? 0.85 : 0.55;
      var lx = pts[k].pt.x + 8;
      var ly = pts[k].pt.y - 4;
      ctx.strokeText(pts[k].label, lx, ly);
      ctx.fillText(pts[k].label,   lx, ly);
      ctx.restore();
    }
  }

  function previewPlan() {
    if (!_lastPlan) {
      console.warn('[RegionalFlightPlanner] no plan to preview — call generatePlan() first');
      return;
    }
    _previewVisible = true;
    if (!_previewRafId) _drawPreviewFrame();
    console.log('[RegionalFlightPlanner] preview ON —', _lastPlan.label);
  }

  function clearPreview() {
    _previewVisible = false;
    if (_previewCanvas) {
      _previewCtx && _previewCtx.clearRect(0, 0, _previewCanvas.width, _previewCanvas.height);
    }
    if (_previewRafId) {
      global.cancelAnimationFrame(_previewRafId);
      _previewRafId = null;
    }
  }

  // ── State snapshot ────────────────────────────────────────────────────────────

  function getState() {
    return {
      version:        VERSION,
      origin:         _origin ? _origin.id : null,
      destination:    _destination ? (_destination.id || _destination.label) : null,
      profile:        _profileId,
      planGenerated:  !!_lastPlan,
      planLabel:      _lastPlan ? _lastPlan.label : null,
      planDistKm:     _lastPlan ? _lastPlan.plannerMeta.distanceKm : null,
      planDurationMin: _lastPlan ? Math.round(_lastPlan.durationMs / 60000) : null,
      planAltFt:      _lastPlan ? _lastPlan.cruiseAltitudeFt : null,
      previewVisible: _previewVisible,
    };
  }

  // ── Exports ───────────────────────────────────────────────────────────────────

  SBE.RegionalFlightPlanner = Object.freeze({
    VERSION:             VERSION,
    AIRPORTS:            AIRPORTS,
    PROFILES:            PROFILES,
    listAirports:        listAirports,
    getAirport:          getAirport,
    setOriginAirport:    setOriginAirport,
    getOriginAirport:    getOriginAirport,
    pinDestination:      pinDestination,
    clearDestination:    clearDestination,
    getDestination:      getDestination,
    planAirportToAirport: planAirportToAirport,
    planToCoordinate:    planToCoordinate,
    setProfile:          setProfile,
    getProfile:          getProfile,
    generatePlan:        generatePlan,
    startPlan:           startPlan,
    previewPlan:         previewPlan,
    clearPreview:        clearPreview,
    getState:            getState,
  });

  console.log('[RegionalFlightPlanner] v' + VERSION + ' loaded — 10 airports, 3 profiles');

})(window);
