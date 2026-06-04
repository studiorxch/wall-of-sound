// ── AircraftRenderer v2.1.0 ───────────────────────────────────────────────────
// 0528A_WOS_AirflightRuntimeBootstrap_v1.0.0
// 0528I_WOS_ObjectCustomizationAndGenerationDoctrine_v1.0.0
// 0528J_WOS_LowPolyAircraftVisualPass_v1.0.0
// 0528N_WOS_RegionalFlightPresencePass_v1.0.0
// Status: active
// Classification: renderer
//
// Purpose:
//   Draws aircraft on a self-managed canvas overlay above the Mapbox map.
//   v2.0.0 replaces the simple icon path with a procedural low-poly regional
//   jet renderer driven by ObjectProfileRegistry material slots and altitude-
//   aware detail tiers.
//
//   Visual modes:
//     auto    — low-poly for REGIONAL_JET; icon fallback for other classes
//     lowpoly — force low-poly draw path for all classes that support it
//     icon    — force legacy icon renderer for all classes
//
//   Detail tiers (resolved per-frame from rendered pixel size + altitude):
//     far    — fuselage silhouette + wing blob
//     mid    — swept wings + tailplane
//     near   — + cockpit glass + engine pods + accent stripe
//     hero   — + wing accent lines + nav light dots
//
// Authority:
//   READS: AircraftRuntime, MapboxViewportRuntime, ObjectProfileRegistry,
//          AltitudeWorldState, AirspaceInfluenceRenderer
//   WRITES: overlay canvas pixels only
//   MUST NOT MUTATE: aircraft entity state, AIS truth, map style,
//                    ObjectProfileRegistry data, Color Lab data
//
// Placement: wall/render/aircraftRenderer.js
// Load: AFTER objectProfileRegistry.js, airspaceInfluenceRenderer.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  var VERSION = '2.1.0';

  // ── Canvas state ──────────────────────────────────────────────────────────────

  var _canvas       = null;
  var _ctx          = null;
  var _rafId        = null;
  var _lastFrameTs  = 0;
  var _initialized  = false;
  var _enabled      = true;
  var _debugVisible = false;

  // ── Scale / size constants ────────────────────────────────────────────────────

  var BASE_SIZE_PX       = 11;   // base icon footprint — larger for terminal readability
  var SHADOW_FADE_SCALAR = 0.30;

  var _iconScaleMultiplier = 1.0;
  var _routeTraceEnabled   = true;

  // ── Presence layer flags ──────────────────────────────────────────────────────
  // All presence effects are presentation-only; no route truth is mutated.

  var _presenceEnabled  = true;   // atmospheric halo
  var _contrailsEnabled = true;   // geographic vapor trail
  var _lightsEnabled    = true;   // distance nav light blink

  // ── Atmospheric fog density by cloud preset ───────────────────────────────────
  // Mirrors CloudAtmosphereLayer preset names. Used to modulate presence alpha.

  var FOG_DENSITY = Object.freeze({
    clear:       0.00,
    thin:        0.12,
    harbor_fog:  0.40,
    storm_shelf: 0.72,
  });

  // ── Visual mode + palette override ───────────────────────────────────────────

  var _visualMode    = 'auto';   // 'auto' | 'lowpoly' | 'icon'
  var _paletteOverride = null;   // null | palette name string

  // ── Class key normalization ───────────────────────────────────────────────────
  // AircraftRuntime lowercase class → ObjectProfileRegistry UPPER_SNAKE classKey.

  var _CLASS_KEY_MAP = {
    regional:   'REGIONAL_JET',
    narrowbody: 'NARROWBODY',
    widebody:   'WIDEBODY',
    helicopter: 'HELICOPTER',
    cargo:      'CARGO_PLANE',
    prop:       'PROP_COMMUTER',
    unknown:    'unknown',
  };

  function _resolveClassKey(aircraftClass) {
    return _CLASS_KEY_MAP[aircraftClass] || 'unknown';
  }

  // ── Palette resolution ────────────────────────────────────────────────────────
  // Returns full { body, fill, stroke, glass, accent, light } palette entry.
  // Delegates to ObjectProfileRegistry when available; safe inline fallback.

  function _resolveAircraftPalette(aircraftClass) {
    var paletteRef = _paletteOverride || 'airport_dawn';
    var opr = global.SBE && SBE.ObjectProfileRegistry;
    if (opr && typeof opr.getAircraftPalette === 'function') {
      var e = opr.getAircraftPalette(_resolveClassKey(aircraftClass), paletteRef);
      return {
        body:   e.body,
        fill:   e.body,                            // backward-compat alias
        stroke: e.stroke,
        glass:  e.glass  || 'rgba(20,45,70,0.70)',
        accent: e.accent || e.stroke,
        light:  e.light  || '#FFE080',
      };
    }
    // Inline fallback — values match ObjectProfileRegistry airport_dawn defaults.
    var _FB = {
      regional:   { body:'#C8E8FF', stroke:'#78BAEE', glass:'rgba(25,55,85,0.70)', accent:'#4A9FD8', light:'#FFE080' },
      narrowbody: { body:'#DAEEFF', stroke:'#96CBFF', glass:'rgba(25,55,85,0.70)', accent:'#5BB2E8', light:'#FFE080' },
      widebody:   { body:'#EAF4FF', stroke:'#AADCFF', glass:'rgba(25,55,85,0.65)', accent:'#6EC0F2', light:'#FFE080' },
      helicopter: { body:'#FFE8B0', stroke:'#FFC850', glass:'rgba(35,28,18,0.65)', accent:'#FFB030', light:'#80E8FF' },
      unknown:    { body:'#CCDDE8', stroke:'#88AACC', glass:'rgba(20,40,60,0.55)', accent:'#70A0C0', light:'#FFE0A0' },
    };
    var fb = _FB[aircraftClass] || _FB.unknown;
    return { body: fb.body, fill: fb.body, stroke: fb.stroke,
             glass: fb.glass, accent: fb.accent, light: fb.light };
  }

  // ── Detail tier resolution ────────────────────────────────────────────────────
  // Tier drives how much procedural geometry is drawn per aircraft per frame.

  function _resolveAircraftDetailTier(sizePx, altitudeScalar) {
    if (sizePx >= 18 && altitudeScalar < 0.45) return 'hero';
    if (sizePx >= 11)                           return 'near';
    if (sizePx >= 6)                            return 'mid';   // 0528N: 7→6 for better cruise readability
    return 'far';
  }

  // ── Canvas setup ──────────────────────────────────────────────────────────────

  function _ensureCanvas() {
    if (_canvas && _canvas.parentElement) return true;

    var container = document.querySelector('.mapboxgl-canvas-container') ||
                    document.getElementById('map') ||
                    document.body;

    _canvas    = document.createElement('canvas');
    _canvas.id = 'wos-aircraft-canvas';
    _canvas.setAttribute('aria-hidden', 'true');
    _canvas.style.cssText = [
      'position:absolute', 'top:0', 'left:0',
      'width:100%', 'height:100%',
      'pointer-events:none', 'z-index:8',
    ].join(';');

    if (container !== document.body) {
      if (!container.style.position || container.style.position === 'static') {
        container.style.position = 'relative';
      }
    }
    container.appendChild(_canvas);
    _ctx = _canvas.getContext('2d');

    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(_resizeCanvas).observe(container);
    } else {
      global.addEventListener('resize', _resizeCanvas);
    }
    _resizeCanvas();
    return true;
  }

  function _resizeCanvas() {
    if (!_canvas || !_canvas.parentElement) return;
    var p = _canvas.parentElement;
    var w = p.clientWidth  || global.innerWidth;
    var h = p.clientHeight || global.innerHeight;
    if (_canvas.width !== w || _canvas.height !== h) {
      _canvas.width  = w;
      _canvas.height = h;
    }
  }

  // ── Projection / rotation helpers ─────────────────────────────────────────────

  function _project(lat, lng) {
    var mvr = global.SBE && SBE.MapboxViewportRuntime;
    if (!mvr || !mvr.project) return null;
    try { return mvr.project([lng, lat]); } catch (e) { return null; }
  }

  // Compass bearing (0=N, 90=E) → canvas rotation. Nose drawn at local -Y.
  function _headingToCanvas(deg) {
    var r = deg * Math.PI / 180;
    return Math.atan2(-Math.cos(r), Math.sin(r));
  }

  // ── Altitude-aware scale ──────────────────────────────────────────────────────
  // Non-linear curve: large at airport → stable minimum at cruise.
  //   scalar 0.00→0.08  (ground / takeoff roll) : 1.30→1.22
  //   scalar 0.08→0.50  (climb)                 : 1.22→0.58
  //   scalar 0.50→1.00  (cruise)                : 0.58→0.46

  function _resolveIconScale(altitudeScalar) {
    var s;
    if (altitudeScalar < 0.08) {
      s = 1.30 - altitudeScalar * 1.0;
    } else if (altitudeScalar < 0.50) {
      var t = (altitudeScalar - 0.08) / 0.42;
      s = 1.22 - t * (1.22 - 0.58);
    } else {
      var t2 = (altitudeScalar - 0.50) / 0.50;
      s = 0.58 - t2 * 0.12;
    }
    return Math.max(0.50, s) * _iconScaleMultiplier;   // 0528N: floor 0.44→0.50
  }

  // ── Shadow offset ─────────────────────────────────────────────────────────────

  function _shadowOffset(altitudeScalar, scale) {
    var mvr     = global.SBE && SBE.MapboxViewportRuntime;
    var cam     = (mvr && mvr.getCamera) ? mvr.getCamera() : { bearing: 0 };
    var bearRad = ((cam && cam.bearing) || 0) * Math.PI / 180;
    var mag     = altitudeScalar * scale * BASE_SIZE_PX * 2.8;
    return { dx: Math.sin(bearRad) * mag, dy: Math.cos(bearRad) * mag };
  }

  // ── Geo offset (great-circle bearing) ────────────────────────────────────────
  // Returns { lat, lng } offset from origin by distM meters along bearingDeg.
  // Used by contrail to compute trail direction independently of map bearing.

  function _geoOffset(lat, lng, bearingDeg, distM) {
    var d  = distM / 6371000;
    var b  = bearingDeg * Math.PI / 180;
    var φ1 = lat  * Math.PI / 180;
    var λ1 = lng  * Math.PI / 180;
    var φ2 = Math.asin(
      Math.sin(φ1) * Math.cos(d) +
      Math.cos(φ1) * Math.sin(d) * Math.cos(b)
    );
    var λ2 = λ1 + Math.atan2(
      Math.sin(b) * Math.sin(d) * Math.cos(φ1),
      Math.cos(d) - Math.sin(φ1) * Math.sin(φ2)
    );
    return { lat: φ2 * 180 / Math.PI, lng: λ2 * 180 / Math.PI };
  }

  // ── Presence state ────────────────────────────────────────────────────────────
  // Derives presentation scalars from aircraft entity + cloud state.
  // Returns pure data — no canvas side-effects.
  //
  //   fogDensity         — 0..1, from active CloudAtmosphereLayer preset
  //   visibilityScalar   — 1.0 = fully visible; drops under dense cloud
  //   silhouetteScalar   — drives halo radius (altitudeScalar-aware)
  //   lightVisibilityScalar — nav light contrast vs fog
  //   atmosphericScalar  — blended tint/fade for halo colour

  function _resolvePresenceState(e) {
    // Cloud fog density
    var cloud      = global.SBE && SBE.CloudAtmosphereLayer;
    var presetId   = (cloud && cloud.getPreset) ? cloud.getPreset() : 'clear';
    var fog        = FOG_DENSITY[presetId] !== undefined ? FOG_DENSITY[presetId] : 0;

    // Altitude attenuates visibility: cruise fog is more obscuring than ground fog
    var fogAtAlt   = fog * Math.max(0, Math.min(1, e.altitudeScalar * 1.4));

    var visScalar  = Math.max(0.18, 1.0 - fogAtAlt * 0.72);

    // Silhouette scalar — larger during climb/cruise to ensure sky readability
    // Peak at mid-altitude (altScalar ~0.5), slight compression at full cruise
    var altPeak    = Math.sin(Math.min(1, e.altitudeScalar * 1.6) * Math.PI);
    var sil        = 0.40 + altPeak * 0.60;                     // 0.40–1.00

    // Nav light contrast: brighter in fog / at night (no time-of-day here so
    // use fog density as ambient light proxy — more fog = dimmer ambient = higher
    // contrast for blinking lights)
    var lightVis   = Math.max(0.25, Math.min(1, 0.45 + fog * 0.85));

    // Atmospheric blend scalar (used for halo colour warmth / chill)
    var atmoScalar = Math.max(0, Math.min(1, e.altitudeScalar));

    return {
      fogDensity:           fog,
      visibilityScalar:     visScalar,
      silhouetteScalar:     sil,
      lightVisibilityScalar: lightVis,
      atmosphericScalar:    atmoScalar,
      presetId:             presetId,
    };
  }

  // ── Atmospheric presence halo ─────────────────────────────────────────────────
  // Soft radial glow drawn below the aircraft body. Communicates altitude and
  // atmospheric mood without overpowering the body silhouette.
  // Only drawn when aircraft is airborne (altScalar > 0.04).

  function _drawAtmosphericPresence(ctx, x, y, scale, presence, altitudeScalar) {
    if (altitudeScalar < 0.04) return;

    var s       = BASE_SIZE_PX * scale;
    var radius  = s * (1.8 + presence.silhouetteScalar * 1.6);
    var alpha   = presence.visibilityScalar *
                  Math.min(0.28, 0.06 + altitudeScalar * 0.26);

    if (alpha < 0.015) return;

    // Colour: warm (amber-white) near ground to cool (blue-white) at altitude
    var warm = 'rgba(210,228,255,' + (alpha * (1 - presence.atmosphericScalar * 0.35)).toFixed(3) + ')';
    var cool = 'rgba(180,210,255,' + (alpha).toFixed(3) + ')';
    var mid  = presence.atmosphericScalar > 0.5 ? cool : warm;

    var grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
    grad.addColorStop(0,    mid);
    grad.addColorStop(0.45, mid);
    grad.addColorStop(1,    'rgba(160,200,255,0)');

    ctx.save();
    ctx.globalAlpha  = 1;
    ctx.fillStyle    = grad;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ── Geographic contrail ───────────────────────────────────────────────────────
  // Draws a faint vapor trail behind the aircraft using the heading bearing to
  // compute real geographic direction. Only visible at high altitude (≥ 0.68).
  // Length and opacity scale with altitude and fog state.

  function _drawContrail(ctx, pt, e, scale, presence) {
    if (e.altitudeScalar < 0.68) return;
    if (!e.lat || !e.lng || !e.headingDeg) return;

    // Compute trail end point geo-offset backward from current position
    // (opposite heading = heading + 180)
    var trailDistM  = 900 + (e.altitudeScalar - 0.68) * 2500;  // 900–1450m at cruise
    var backBearing = (e.headingDeg + 180) % 360;
    var tailGeo     = _geoOffset(e.lat, e.lng, backBearing, trailDistM);
    var tailPt      = _project(tailGeo.lat, tailGeo.lng);
    if (!tailPt) return;

    // Contrail fades more in fog (moisture scatters the trail)
    var alpha = (0.08 + (e.altitudeScalar - 0.68) * 0.22) *
                presence.visibilityScalar *
                (1 - presence.fogDensity * 0.55);

    if (alpha < 0.012) return;

    var grad = ctx.createLinearGradient(pt.x, pt.y, tailPt.x, tailPt.y);
    grad.addColorStop(0,    'rgba(220,235,255,' + (alpha * 0.80).toFixed(3) + ')');
    grad.addColorStop(0.15, 'rgba(220,235,255,' + (alpha).toFixed(3) + ')');
    grad.addColorStop(1,    'rgba(220,235,255,0)');

    var s  = BASE_SIZE_PX * scale;
    var lw = Math.max(0.5, s * 0.12);

    ctx.save();
    ctx.globalAlpha  = 1;
    ctx.strokeStyle  = grad;
    ctx.lineWidth    = lw;
    ctx.lineCap      = 'round';
    ctx.beginPath();
    ctx.moveTo(pt.x, pt.y);
    ctx.lineTo(tailPt.x, tailPt.y);
    ctx.stroke();
    ctx.restore();
  }

  // ── Distance navigation light blink ──────────────────────────────────────────
  // Strobing beacon dot drawn at far/mid tiers so the aircraft is readable when
  // it is too small for body geometry. Blinks on a 1.2s cycle.
  // Near/hero tiers already have nav light dots in the body draw path.

  var _NAV_BLINK_PERIOD = 1200;   // ms

  function _drawDistanceNavLight(ctx, x, y, scale, altScalar, tier, presence) {
    if (altScalar < 0.12) return;                    // not visible near ground
    if (tier !== 'far' && tier !== 'mid') return;    // near/hero handled in body

    // 1.2s blink cycle: ON for first 35% of period
    var phase  = (Date.now() % _NAV_BLINK_PERIOD) / _NAV_BLINK_PERIOD;
    var on     = phase < 0.35;
    if (!on) return;

    // Pulse ease-in-out within ON window
    var t      = phase / 0.35;
    var pulse  = Math.sin(t * Math.PI);              // 0→1→0 within ON window

    var s      = BASE_SIZE_PX * scale;
    var r      = Math.max(1.2, s * 0.18) * (0.6 + pulse * 0.4);
    var alpha  = presence.lightVisibilityScalar * (0.55 + pulse * 0.45) *
                 presence.visibilityScalar;

    if (alpha < 0.08) return;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle   = '#FFE8A0';
    ctx.shadowColor = '#FFE080';
    ctx.shadowBlur  = r * 2.2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ── Route trace ───────────────────────────────────────────────────────────────

  function _drawRouteTrace(ctx, e, pt) {
    if (!_routeTraceEnabled) return;
    if (e.lifecycleState !== 'TAKEOFF_ROLL' && e.lifecycleState !== 'CLIMB') return;

    var art = global.SBE && SBE.AircraftRuntime;
    if (!art || !art.getAnchor) return;
    var anchor = art.getAnchor(e.originAirportId);
    if (!anchor) return;
    var originPt = _project(anchor.lat, anchor.lng);
    if (!originPt) return;

    var traceAlpha = Math.max(0, 0.55 - e.altitudeScalar * 1.20);
    var aws = global.SBE && SBE.AltitudeWorldState;
    if (aws && typeof aws.routeTraceOpacity === 'number') traceAlpha *= aws.routeTraceOpacity;
    if (traceAlpha < 0.02) return;

    var pal = _resolveAircraftPalette(e.aircraftClass);
    ctx.save();
    ctx.globalAlpha    = traceAlpha;
    ctx.strokeStyle    = pal.stroke;
    ctx.lineWidth      = 1.0;
    ctx.setLineDash([4, 7]);
    ctx.lineDashOffset = -(Date.now() / 80) % 11;
    ctx.beginPath();
    ctx.moveTo(originPt.x, originPt.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // ── Legacy icon shadow (far / mid tiers) ──────────────────────────────────────

  function _drawShadow(ctx, x, y, heading, scale, altitudeScalar) {
    var shadowAlpha = Math.max(0, 0.55 * (1 - altitudeScalar / SHADOW_FADE_SCALAR));
    if (shadowAlpha < 0.02) return;

    var off = _shadowOffset(altitudeScalar, scale);
    var s   = BASE_SIZE_PX * scale * 1.08;

    ctx.save();
    ctx.translate(x + off.dx, y + off.dy);
    ctx.rotate(_headingToCanvas(heading));
    ctx.globalAlpha = shadowAlpha;
    ctx.fillStyle   = 'rgba(0,12,35,0.60)';

    ctx.beginPath();
    ctx.moveTo(0,          -s * 1.45);
    ctx.lineTo( s * 0.16,  -s * 0.70);
    ctx.lineTo( s * 0.16,   s * 0.55);
    ctx.lineTo( 0,          s * 0.90);
    ctx.lineTo(-s * 0.16,   s * 0.55);
    ctx.lineTo(-s * 0.16,  -s * 0.70);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(-s * 0.16, -s * 0.22);
    ctx.lineTo(-s * 1.20, -s * 0.06);
    ctx.lineTo(-s * 0.90,  s * 0.26);
    ctx.lineTo(-s * 0.16,  s * 0.14);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo( s * 0.16, -s * 0.22);
    ctx.lineTo( s * 1.20, -s * 0.06);
    ctx.lineTo( s * 0.90,  s * 0.26);
    ctx.lineTo( s * 0.16,  s * 0.14);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  // ── Low-poly shadow (near / hero tiers) ───────────────────────────────────────
  // Uses the same silhouette envelope as the low-poly jet body for consistent
  // shadow shape at close camera distances.

  function _drawLowPolyShadow(ctx, x, y, heading, scale, altitudeScalar) {
    var shadowAlpha = Math.max(0, 0.55 * (1 - altitudeScalar / SHADOW_FADE_SCALAR));
    if (shadowAlpha < 0.02) return;

    var off = _shadowOffset(altitudeScalar, scale);
    var s   = BASE_SIZE_PX * scale * 1.04;

    ctx.save();
    ctx.translate(x + off.dx, y + off.dy);
    ctx.rotate(_headingToCanvas(heading));
    ctx.globalAlpha = shadowAlpha;
    ctx.fillStyle   = 'rgba(0,12,35,0.55)';

    // Port wing
    ctx.beginPath();
    ctx.moveTo(-s * 0.17, -s * 0.18);
    ctx.lineTo(-s * 1.18,  s * 0.12);
    ctx.lineTo(-s * 0.92,  s * 0.32);
    ctx.lineTo(-s * 0.17,  s * 0.14);
    ctx.closePath();
    ctx.fill();

    // Starboard wing
    ctx.beginPath();
    ctx.moveTo( s * 0.17, -s * 0.18);
    ctx.lineTo( s * 1.18,  s * 0.12);
    ctx.lineTo( s * 0.92,  s * 0.32);
    ctx.lineTo( s * 0.17,  s * 0.14);
    ctx.closePath();
    ctx.fill();

    // Fuselage
    ctx.beginPath();
    ctx.moveTo( 0,          -s * 1.45);
    ctx.lineTo( s * 0.12,   -s * 1.10);
    ctx.lineTo( s * 0.17,   -s * 0.65);
    ctx.lineTo( s * 0.17,    s * 0.20);
    ctx.lineTo( s * 0.10,    s * 0.72);
    ctx.lineTo( 0,           s * 1.05);
    ctx.lineTo(-s * 0.10,    s * 0.72);
    ctx.lineTo(-s * 0.17,    s * 0.20);
    ctx.lineTo(-s * 0.17,   -s * 0.65);
    ctx.lineTo(-s * 0.12,   -s * 1.10);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  // ── Legacy icon renderer ──────────────────────────────────────────────────────
  // Kept as-is for non-REGIONAL_JET classes and icon-force mode.

  function _drawIcon(ctx, x, y, heading, scale, alpha, cls) {
    var pal = _resolveAircraftPalette(cls);
    var s   = BASE_SIZE_PX * scale;
    var lw  = Math.max(0.5, s * 0.065);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(_headingToCanvas(heading));
    ctx.globalAlpha  = alpha;
    ctx.fillStyle    = pal.body;
    ctx.strokeStyle  = pal.stroke;
    ctx.lineWidth    = lw;

    // Fuselage
    ctx.beginPath();
    ctx.moveTo( 0,          -s * 1.45);
    ctx.lineTo( s * 0.16,   -s * 0.70);
    ctx.lineTo( s * 0.16,    s * 0.55);
    ctx.lineTo( 0,           s * 0.90);
    ctx.lineTo(-s * 0.16,    s * 0.55);
    ctx.lineTo(-s * 0.16,   -s * 0.70);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Port wing
    ctx.beginPath();
    ctx.moveTo(-s * 0.16, -s * 0.22);
    ctx.lineTo(-s * 1.20, -s * 0.06);
    ctx.lineTo(-s * 0.90,  s * 0.26);
    ctx.lineTo(-s * 0.16,  s * 0.14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Starboard wing
    ctx.beginPath();
    ctx.moveTo( s * 0.16, -s * 0.22);
    ctx.lineTo( s * 1.20, -s * 0.06);
    ctx.lineTo( s * 0.90,  s * 0.26);
    ctx.lineTo( s * 0.16,  s * 0.14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    if (s >= 5) {
      ctx.beginPath();
      ctx.moveTo(-s * 0.16, s * 0.55);
      ctx.lineTo(-s * 0.52, s * 0.82);
      ctx.lineTo(-s * 0.16, s * 0.82);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo( s * 0.16, s * 0.55);
      ctx.lineTo( s * 0.52, s * 0.82);
      ctx.lineTo( s * 0.16, s * 0.82);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    ctx.restore();
  }

  // ── Low-poly regional jet ─────────────────────────────────────────────────────
  // Procedural canvas draw path for REGIONAL_JET class.
  // Geometry normalized to BASE_SIZE_PX * scale unit (s).
  // Nose points toward local -Y.
  //
  // GEOM reference (spec 0528J §Geometry Language):
  //   fuselageLength 2.90  wingSpan 2.35   tailSpan 0.88
  //   wingRootY -0.18      engineOffsetX 0.58   engineRadius 0.11

  function _drawLowPolyRegionalJet(ctx, x, y, heading, scale, alpha, pal, tier) {
    var s  = BASE_SIZE_PX * scale;
    var lw = Math.max(0.4, s * 0.055);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(_headingToCanvas(heading));
    ctx.globalAlpha = alpha;
    ctx.lineJoin    = 'round';
    ctx.lineCap     = 'round';

    // ── Wings (drawn first — beneath fuselage) ──────────────────────────────
    ctx.fillStyle   = pal.body;
    ctx.strokeStyle = pal.stroke;
    ctx.lineWidth   = lw;

    // Port wing — swept, wider span than legacy icon
    ctx.beginPath();
    ctx.moveTo(-s * 0.17, -s * 0.18);   // root leading edge
    ctx.lineTo(-s * 1.18,  s * 0.12);   // tip leading edge
    ctx.lineTo(-s * 0.92,  s * 0.32);   // tip trailing edge
    ctx.lineTo(-s * 0.17,  s * 0.14);   // root trailing edge
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Starboard wing
    ctx.beginPath();
    ctx.moveTo( s * 0.17, -s * 0.18);
    ctx.lineTo( s * 1.18,  s * 0.12);
    ctx.lineTo( s * 0.92,  s * 0.32);
    ctx.lineTo( s * 0.17,  s * 0.14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // ── Tailplane / horizontal stabilizer (mid, near, hero) ─────────────────
    if (tier !== 'far') {
      ctx.beginPath();
      ctx.moveTo(-s * 0.10,  s * 0.70);   // root LE
      ctx.lineTo(-s * 0.44,  s * 0.84);   // tip LE
      ctx.lineTo(-s * 0.36,  s * 0.96);   // tip TE
      ctx.lineTo(-s * 0.10,  s * 0.88);   // root TE
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo( s * 0.10,  s * 0.70);
      ctx.lineTo( s * 0.44,  s * 0.84);
      ctx.lineTo( s * 0.36,  s * 0.96);
      ctx.lineTo( s * 0.10,  s * 0.88);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // ── Fuselage ─────────────────────────────────────────────────────────────
    ctx.fillStyle   = pal.body;
    ctx.strokeStyle = pal.stroke;
    ctx.lineWidth   = lw;

    ctx.beginPath();
    ctx.moveTo( 0,           -s * 1.45);   // nose tip
    ctx.lineTo( s * 0.12,    -s * 1.10);   // nose shoulder
    ctx.lineTo( s * 0.17,    -s * 0.65);   // body shoulder (widen)
    ctx.lineTo( s * 0.17,     s * 0.20);   // body mid (parallel)
    ctx.lineTo( s * 0.10,     s * 0.72);   // tail taper
    ctx.lineTo( 0,            s * 1.05);   // tail tip
    ctx.lineTo(-s * 0.10,     s * 0.72);
    ctx.lineTo(-s * 0.17,     s * 0.20);
    ctx.lineTo(-s * 0.17,    -s * 0.65);
    ctx.lineTo(-s * 0.12,    -s * 1.10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // ── Cockpit glass band (near, hero) ──────────────────────────────────────
    if (tier === 'near' || tier === 'hero') {
      ctx.fillStyle   = pal.glass;
      ctx.strokeStyle = 'transparent';
      ctx.beginPath();
      ctx.moveTo( s * 0.11,  -s * 1.08);
      ctx.lineTo( s * 0.16,  -s * 0.84);
      ctx.lineTo(-s * 0.16,  -s * 0.84);
      ctx.lineTo(-s * 0.11,  -s * 1.08);
      ctx.closePath();
      ctx.fill();
    }

    // ── Engine pods (near, hero) ──────────────────────────────────────────────
    if (tier === 'near' || tier === 'hero') {
      ctx.fillStyle   = pal.accent;
      ctx.strokeStyle = pal.stroke;
      ctx.lineWidth   = lw * 0.65;

      // Port engine
      ctx.beginPath();
      ctx.ellipse(-s * 0.58, s * 0.06, s * 0.08, s * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Starboard engine
      ctx.beginPath();
      ctx.ellipse( s * 0.58, s * 0.06, s * 0.08, s * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // ── Accent / belly stripe (near, hero) ───────────────────────────────────
    if (tier === 'near' || tier === 'hero') {
      ctx.strokeStyle = pal.accent;
      ctx.lineWidth   = Math.max(0.5, s * 0.035);
      ctx.globalAlpha = alpha * 0.50;
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.58);
      ctx.lineTo(0,  s * 0.28);
      ctx.stroke();
      ctx.globalAlpha = alpha;
    }

    // ── Wing leading-edge accent lines (hero only) ────────────────────────────
    if (tier === 'hero') {
      ctx.strokeStyle = pal.accent;
      ctx.lineWidth   = Math.max(0.4, s * 0.028);
      ctx.globalAlpha = alpha * 0.38;

      ctx.beginPath();
      ctx.moveTo(-s * 0.17, -s * 0.18);
      ctx.lineTo(-s * 1.05,  s * 0.09);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo( s * 0.17, -s * 0.18);
      ctx.lineTo( s * 1.05,  s * 0.09);
      ctx.stroke();

      ctx.globalAlpha = alpha;
    }

    // ── Navigation light dots (hero only) ────────────────────────────────────
    if (tier === 'hero') {
      ctx.fillStyle   = pal.light;
      ctx.globalAlpha = alpha * 0.82;
      var dotR        = Math.max(1.0, s * 0.05);

      // Port wingtip
      ctx.beginPath();
      ctx.arc(-s * 1.18, s * 0.12, dotR, 0, Math.PI * 2);
      ctx.fill();

      // Starboard wingtip
      ctx.beginPath();
      ctx.arc( s * 1.18, s * 0.12, dotR, 0, Math.PI * 2);
      ctx.fill();

      // Tail beacon
      ctx.beginPath();
      ctx.arc(0, s * 1.05, dotR * 0.85, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = alpha;
    }

    ctx.restore();
  }

  // ── Debug label ───────────────────────────────────────────────────────────────

  function _drawDebugLabel(ctx, x, y, e) {
    ctx.save();
    ctx.font         = '9px monospace';
    ctx.strokeStyle  = 'rgba(0,0,0,0.85)';
    ctx.lineWidth    = 2.5;
    ctx.fillStyle    = '#C8E8FF';
    var label = e.callsign + ' ' +
                e.lifecycleState.replace(/_/g, ' ') + ' ' +
                Math.round(e.altitudeFt) + 'ft ' +
                Math.round(e.altitudeScalar * 100) + '%';
    ctx.strokeText(label, x + 12, y - 4);
    ctx.fillText(label,   x + 12, y - 4);
    ctx.restore();
  }

  // ── Main render frame ─────────────────────────────────────────────────────────

  function _frame(ts) {
    _rafId = global.requestAnimationFrame(_frame);

    if (!_ensureCanvas()) return;
    _resizeCanvas();

    _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
    if (!_enabled) return;

    // Influence field (below aircraft)
    var infRend = global.SBE && SBE.AirspaceInfluenceRenderer;
    if (infRend && infRend.render) infRend.render(_ctx);

    var art = global.SBE && SBE.AircraftRuntime;
    if (!art) return;

    var aircraft = art.getActiveAircraft();
    var cW = _canvas.width;
    var cH = _canvas.height;

    for (var i = 0; i < aircraft.length; i++) {
      var e = aircraft[i];

      if (e.lifecycleState === 'PARKED' && !_debugVisible) continue;

      var pt = _project(e.lat, e.lng);
      if (!pt) continue;
      if (pt.x < -300 || pt.x > cW + 300 ||
          pt.y < -300 || pt.y > cH + 300) continue;

      // Resolve per-aircraft visual state
      var classKey = _resolveClassKey(e.aircraftClass);
      var scale    = _resolveIconScale(e.altitudeScalar);
      var sizePx   = BASE_SIZE_PX * scale;
      var tier     = _resolveAircraftDetailTier(sizePx, e.altitudeScalar);
      var pal      = _resolveAircraftPalette(e.aircraftClass);
      var presence = _resolvePresenceState(e);

      // Decide draw path
      var useLP = (_visualMode === 'lowpoly') ||
                  (_visualMode === 'auto' && classKey === 'REGIONAL_JET');

      // Alpha: high near ground, fades slightly at altitude; modulated by fog
      var alpha = Math.max(0.42, Math.min(0.90, 0.90 - e.altitudeScalar * 0.26));
      alpha *= presence.visibilityScalar;

      // 1. Presence halo (below everything)
      if (_presenceEnabled) {
        _drawAtmosphericPresence(_ctx, pt.x, pt.y, scale, presence, e.altitudeScalar);
      }

      // 2. Contrail (behind aircraft, above halo)
      if (_contrailsEnabled) {
        _drawContrail(_ctx, pt, e, scale, presence);
      }

      // 3. Route trace (TAKEOFF_ROLL / early CLIMB only)
      _drawRouteTrace(_ctx, e, pt);

      // 4. Shadow — low-poly envelope at near/hero, legacy outline at far/mid
      if (useLP && (tier === 'near' || tier === 'hero')) {
        _drawLowPolyShadow(_ctx, pt.x, pt.y, e.headingDeg, scale, e.altitudeScalar);
      } else {
        _drawShadow(_ctx, pt.x, pt.y, e.headingDeg, scale, e.altitudeScalar);
      }

      // 5. Aircraft body
      if (useLP) {
        _drawLowPolyRegionalJet(_ctx, pt.x, pt.y, e.headingDeg, scale, alpha, pal, tier);
      } else {
        _drawIcon(_ctx, pt.x, pt.y, e.headingDeg, scale, alpha, e.aircraftClass);
      }

      // 6. Distance nav light (far/mid only — near/hero have body nav lights)
      if (_lightsEnabled) {
        _drawDistanceNavLight(_ctx, pt.x, pt.y, scale, e.altitudeScalar, tier, presence);
      }

      // 7. Debug label
      if (_debugVisible) {
        _drawDebugLabel(_ctx, pt.x, pt.y, e);
      }
    }

    _lastFrameTs = ts;
  }

  // ── Visual debug snapshot ─────────────────────────────────────────────────────

  function getVisualDebugSnapshot() {
    var art      = global.SBE && SBE.AircraftRuntime;
    var aircraft = (art && art.getActiveAircraft) ? art.getActiveAircraft() : [];

    var entries = aircraft.map(function (e) {
      var classKey = _resolveClassKey(e.aircraftClass);
      var scale    = _resolveIconScale(e.altitudeScalar);
      var sizePx   = BASE_SIZE_PX * scale;
      var tier     = _resolveAircraftDetailTier(sizePx, e.altitudeScalar);
      var useLP    = (_visualMode === 'lowpoly') ||
                     (_visualMode === 'auto' && classKey === 'REGIONAL_JET');
      return {
        callsign:    e.callsign,
        class:       e.aircraftClass,
        classKey:    classKey,
        palette:     _resolveAircraftPalette(e.aircraftClass),
        detailTier:  tier,
        sizePx:      Math.round(sizePx * 10) / 10,
        altScalar:   Math.round(e.altitudeScalar * 100) / 100,
        lowPolyPath: useLP,
      };
    });

    var lpCount   = entries.filter(function (e) { return e.lowPolyPath; }).length;
    var iconCount = entries.length - lpCount;

    console.group('[AircraftRenderer v' + VERSION + '] visual()');
    console.log('visualMode      :', _visualMode);
    console.log('paletteOverride :', _paletteOverride || '(none — airport_dawn)');
    console.log('aircraft        :', entries.length, '  lowpoly:', lpCount, '  icon fallback:', iconCount);

    if (entries.length === 0) {
      console.log('(no active aircraft — spawn one with _wos.debug.aircraft.spawn("JFK"))');
    } else {
      entries.forEach(function (entry) {
        console.group(entry.callsign + ' · ' + entry.classKey);
        console.log(
          'tier:',    entry.detailTier,
          '  size:', entry.sizePx + 'px',
          '  alt:',  Math.round(entry.altScalar * 100) + '%',
          '  lowpoly:', entry.lowPolyPath
        );
        console.log('palette:', JSON.stringify(entry.palette));
        console.groupEnd();
      });
    }
    console.groupEnd();

    return entries;
  }

  // ── Presence debug snapshot ───────────────────────────────────────────────────

  function getPresenceSnapshot() {
    var art      = global.SBE && SBE.AircraftRuntime;
    var aircraft = (art && art.getActiveAircraft) ? art.getActiveAircraft() : [];

    var cloud    = global.SBE && SBE.CloudAtmosphereLayer;
    var presetId = (cloud && cloud.getPreset) ? cloud.getPreset() : 'clear';

    console.group('[AircraftRenderer v' + VERSION + '] visibility()');
    console.log('presenceEnabled  :', _presenceEnabled);
    console.log('contrailsEnabled :', _contrailsEnabled);
    console.log('lightsEnabled    :', _lightsEnabled);
    console.log('cloudPreset      :', presetId);
    console.log('fogDensity       :', FOG_DENSITY[presetId] || 0);
    console.log('');

    if (aircraft.length === 0) {
      console.log('(no active aircraft)');
    } else {
      aircraft.forEach(function (e) {
        var p = _resolvePresenceState(e);
        console.group(e.callsign + ' · ' + e.lifecycleState);
        console.log('visibilityScalar    :', p.visibilityScalar.toFixed(3));
        console.log('silhouetteScalar    :', p.silhouetteScalar.toFixed(3));
        console.log('lightVisibility     :', p.lightVisibilityScalar.toFixed(3));
        console.log('atmosphericScalar   :', p.atmosphericScalar.toFixed(3));
        console.log('altitudeScalar      :', e.altitudeScalar.toFixed(3));
        console.log('contrailActive      :', e.altitudeScalar >= 0.68);
        console.groupEnd();
      });
    }
    console.groupEnd();

    return {
      presenceEnabled:  _presenceEnabled,
      contrailsEnabled: _contrailsEnabled,
      lightsEnabled:    _lightsEnabled,
      cloudPreset:      presetId,
      fogDensity:       FOG_DENSITY[presetId] || 0,
    };
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  function init() {
    if (_initialized) return;
    _initialized = true;
    _rafId = global.requestAnimationFrame(_frame);
    console.log('[AircraftRenderer] v' + VERSION + ' started');
  }

  function setEnabled(val)       { _enabled = !!val; }
  function setDebugVisible(val)  { _debugVisible = !!val; }
  function setIconScale(mult)    { _iconScaleMultiplier = Math.max(0.1, Math.min(8.0, Number(mult) || 1.0)); }
  function getIconScale()        { return _iconScaleMultiplier; }
  function setRouteTrace(val)    { _routeTraceEnabled = !!val; }

  function setVisualMode(mode) {
    if (mode !== 'auto' && mode !== 'lowpoly' && mode !== 'icon') {
      console.warn('[AircraftRenderer] unknown visualMode:', mode, '— must be auto | lowpoly | icon');
      return;
    }
    _visualMode = mode;
    console.log('[AircraftRenderer] visualMode →', mode);
  }

  function getVisualMode() { return _visualMode; }

  function setPaletteOverride(name) {
    _paletteOverride = name || null;
    console.log('[AircraftRenderer] paletteOverride →', _paletteOverride || '(cleared)');
  }

  function getPaletteOverride() { return _paletteOverride; }

  // ── Presence toggles ──────────────────────────────────────────────────────────

  function setPresence(val) {
    _presenceEnabled = !!val;
    console.log('[AircraftRenderer] presence →', _presenceEnabled);
  }
  function getPresence()   { return _presenceEnabled; }

  function setContrails(val) {
    _contrailsEnabled = !!val;
    console.log('[AircraftRenderer] contrails →', _contrailsEnabled);
  }
  function getContrails()  { return _contrailsEnabled; }

  function setLights(val) {
    _lightsEnabled = !!val;
    console.log('[AircraftRenderer] lights →', _lightsEnabled);
  }
  function getLights()     { return _lightsEnabled; }

  SBE.AircraftRenderer = Object.freeze({
    VERSION:               VERSION,
    init:                  init,
    setEnabled:            setEnabled,
    setDebugVisible:       setDebugVisible,
    setIconScale:          setIconScale,
    getIconScale:          getIconScale,
    setRouteTrace:         setRouteTrace,
    setVisualMode:         setVisualMode,
    getVisualMode:         getVisualMode,
    getVisualDebugSnapshot: getVisualDebugSnapshot,
    setPaletteOverride:    setPaletteOverride,
    getPaletteOverride:    getPaletteOverride,
    // 0528N presence layer
    setPresence:           setPresence,
    getPresence:           getPresence,
    setContrails:          setContrails,
    getContrails:          getContrails,
    setLights:             setLights,
    getLights:             getLights,
    getPresenceSnapshot:   getPresenceSnapshot,
  });

  // ── Auto-init ─────────────────────────────────────────────────────────────────

  function _scheduleInit() {
    var bs = global.SBE && SBE.WOSBootSequencer;
    if (bs && typeof bs.defer === 'function') {
      bs.defer('aircraftRenderer.init', init, 600);
    } else {
      global.setTimeout(init, 200);
    }
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    global.setTimeout(_scheduleInit, 0);
  } else {
    document.addEventListener('DOMContentLoaded', _scheduleInit);
  }

  console.log('[AircraftRenderer] v' + VERSION + ' loaded — presence layer active');

})(window);
