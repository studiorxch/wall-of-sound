// ── VesselClassPresentation v1.0.0 ───────────────────────────────────────────
// 0527C_WOS_VesselReplacementPass_v1.0.0
// Status: active
// Classification: interpretation-layer
//
// Core Doctrine:
//   2D owns truth. 2.5D owns presentation.
//   Presentation interprets vessel class. It does not define it.
//   AIS runtime truth is never mutated by this system.
//
// Authority:
//   OWNS: vessel class resolution, class silhouette profiles, class palette,
//         render tier selection, class-specific draw functions.
//   OBSERVES: vessel MMSI, state, speed, heading, size, zoom.
//   MUST NOT MUTATE: AISRuntime, vessel position, vessel heading, vessel speed,
//                    vessel lifecycle, map style, atmosphere, wake state.
//
// Placement: wall/systems/presentation/vesselClassPresentation.js
// Load: BEFORE marineRenderer.js and maritimeOccupancyRenderer.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  var VERSION = '1.0.0';

  // ── System constants ──────────────────────────────────────────────────────────

  var VESSEL_TIER_ZOOM = Object.freeze({
    farDotMaxZoom:        10.5,
    farDashMaxZoom:       11.8,
    midSilhouetteMaxZoom: 13.2,
    nearTopologyMaxZoom:  15.4,
  });

  var VESSEL_SIZE_LIMITS = Object.freeze({
    minDotRadiusPx:  1.5,
    maxDotRadiusPx:  4.0,
    minDashLengthPx: 5,
    maxDashLengthPx: 18,
    maxHeroLengthPx: 72,
  });

  // Validation vessel MMSI range
  var VALIDATION_MMSI_BASE = 999001001;
  var VALIDATION_MMSI_MAX  = 999001100;

  // ── Class palette (§ CLASS PALETTE) ──────────────────────────────────────────

  var CLASS_PALETTE = Object.freeze({
    barge:       { fill: '#8B6F47', stroke: '#F0D7A0' },
    cargo:       { fill: '#5E8BA6', stroke: '#B7E3F5' },
    tanker:      { fill: '#A65A4A', stroke: '#FFD0BF' },
    ferry:       { fill: '#E8E1C7', stroke: '#FFFFFF'  },
    tug:         { fill: '#F2B84B', stroke: '#FFE7A3' },
    passenger:   { fill: '#D6E6F2', stroke: '#FFFFFF'  },
    cruise:      { fill: '#F4F2EA', stroke: '#FFFFFF'  },
    pilot:       { fill: '#FF7A45', stroke: '#FFD1B8' },
    sailing:     { fill: '#D7F7FF', stroke: '#FFFFFF'  },
    yacht:       { fill: '#FFFFFF', stroke: '#CFEFFF'  },
    recreational:{ fill: '#BEE8FF', stroke: '#FFFFFF'  },
    unknown:     { fill: '#6D86A8', stroke: '#B6C8E8' },
  });

  // Alias map: upstream class strings → palette keys
  var _CLASS_ALIAS = {
    'BARGE':        'barge',
    'CARGO':        'cargo',
    'TANKER':       'tanker',
    'FERRY':        'ferry',
    'TUG':          'tug',
    'PASSENGER':    'passenger',
    'CRUISE':       'cruise',
    'PILOT':        'pilot',
    'SAILING':      'sailing',
    'YACHT':        'yacht',
    'RECREATIONAL': 'recreational',
    'SERVICE':      'tug',      // service vessels render like tugs (compact workboat)
    'FISHING':      'tug',      // fishing vessels: compact, workboat feel
    'MILITARY':     'cargo',    // military: long hull, darker
    'INDUSTRIAL':   'barge',    // industrial/dredger: flat barge-like
    'UNKNOWN':      'unknown',
  };

  // ── Name-pattern heuristics (inferred, not confirmed) ────────────────────────
  // Applied when neither validation lookup nor AIS type code provides a class.
  // Returns lowercase class key or null.

  var _NAME_PATTERNS = [
    // Barge / industrial
    [/\bBARGE\b/i,    'barge'],
    [/\bHOPPER\b/i,   'barge'],
    [/\bDREDG/i,      'barge'],
    [/\bSCOW\b/i,     'barge'],
    // Ferry / transit
    [/\bFERRY\b/i,    'ferry'],
    [/STATEN ISLAND/i,'ferry'],
    [/\bWATER TAXI/i, 'ferry'],
    // Tug / workboat
    [/\bTUG\b/i,      'tug'],
    [/\bMORAN\b/i,    'tug'],
    [/\bMCALLISTER/i, 'tug'],
    [/\bBOUCHARD/i,   'tug'],
    [/\bVANE\b/i,     'tug'],
    [/\bSEAHORSE/i,   'tug'],
    // Tanker
    [/\bTANKER\b/i,   'tanker'],
    // Cargo
    [/\bCARGO\b/i,    'cargo'],
    [/\bCONTAINER/i,  'cargo'],
    [/\bFREIGHT/i,    'cargo'],
    // Passenger / cruise
    [/\bCRUISE\b/i,   'cruise'],
    [/\bPASSENGER/i,  'passenger'],
    [/CARNIVAL\b/i,   'cruise'],
    [/\bNCL\b/i,      'cruise'],
    // Pilot
    [/\bPILOT\b/i,    'pilot'],
    // Sailing / recreational
    [/\bSAILING\b/i,  'sailing'],
    [/\bYACHT\b/i,    'yacht'],
    [/\bSAILBOAT/i,   'sailing'],
  ];

  // ── Size heuristics (inferred) ────────────────────────────────────────────────
  // Very rough classification by length and aspect ratio.

  function _classFromSize(lenM, widM) {
    if (!lenM) return null;
    var aspect = widM > 0 ? lenM / widM : 0;
    if (lenM >= 200)              return 'cargo';
    if (lenM >= 100 && aspect > 7) return 'tanker';
    if (lenM >= 100)              return 'cargo';
    if (lenM >= 60  && aspect < 4) return 'ferry';
    if (lenM >= 60)               return 'cargo';
    if (lenM >= 25  && aspect < 3) return 'tug';
    if (lenM >= 25)               return 'tug';
    return 'recreational';
  }

  // ── resolveVesselClass(vessel) ────────────────────────────────────────────────
  // Returns { resolvedClass, confidence, reason }
  // resolvedClass: palette key (lowercase)
  // confidence: 'confirmed' | 'inferred' | 'fallback'

  function resolveVesselClass(vessel) {
    if (!vessel) {
      return { resolvedClass: 'unknown', confidence: 'fallback', reason: 'null vessel' };
    }

    var mmsi = Number(vessel.mmsi) || 0;

    // 1. Validation vessel lookup (most reliable — we control the catalog)
    if (mmsi >= VALIDATION_MMSI_BASE && mmsi <= VALIDATION_MMSI_MAX) {
      var mvf = global.SBE && SBE.MaritimeValidationFeed;
      if (mvf && mvf.getVesselClass) {
        var catalogClass = mvf.getVesselClass(mmsi);
        if (catalogClass) {
          var mapped = _CLASS_ALIAS[catalogClass.toUpperCase()] || 'unknown';
          return { resolvedClass: mapped, confidence: 'confirmed',
                   reason: 'validation-catalog:' + catalogClass };
        }
      }
    }

    // 2. Vessel name patterns (inferred)
    var name = String(vessel.vesselName || '').trim();
    if (name) {
      for (var pi = 0; pi < _NAME_PATTERNS.length; pi++) {
        if (_NAME_PATTERNS[pi][0].test(name)) {
          return { resolvedClass: _NAME_PATTERNS[pi][1], confidence: 'inferred',
                   reason: 'name-pattern:' + name };
        }
      }
    }

    // 3. Size heuristic (inferred)
    var lenM = vessel.lengthMeters || 0;
    var widM = vessel.widthMeters  || 0;
    if (lenM > 0) {
      var sizeClass = _classFromSize(lenM, widM);
      if (sizeClass) {
        return { resolvedClass: sizeClass, confidence: 'inferred',
                 reason: 'size-heuristic:' + lenM + 'x' + widM + 'm' };
      }
    }

    // 4. Fallback
    return { resolvedClass: 'unknown', confidence: 'fallback', reason: 'no-signal' };
  }

  // ── resolveVesselRenderTier(vessel, zoom) ─────────────────────────────────────
  // Returns: 'far_dot' | 'far_dash' | 'mid_silhouette' | 'near_topology' | 'hero_topology'

  function resolveVesselRenderTier(vessel, zoom) {
    var z = zoom || 0;
    if (z <= VESSEL_TIER_ZOOM.farDotMaxZoom)        return 'far_dot';
    if (z <= VESSEL_TIER_ZOOM.farDashMaxZoom)       return 'far_dash';
    if (z <= VESSEL_TIER_ZOOM.midSilhouetteMaxZoom) return 'mid_silhouette';
    if (z <= VESSEL_TIER_ZOOM.nearTopologyMaxZoom)  return 'near_topology';
    return 'hero_topology';
  }

  // ── resolveVesselRenderProfile(vessel, zoom) ──────────────────────────────────
  // Assembles the full render profile for a vessel at a given zoom.

  function resolveVesselRenderProfile(vessel, zoom) {
    var cr      = resolveVesselClass(vessel);
    var tier    = resolveVesselRenderTier(vessel, zoom);
    var pal     = CLASS_PALETTE[cr.resolvedClass] || CLASS_PALETTE.unknown;
    var lenM    = vessel ? (vessel.lengthMeters || 60) : 60;
    var widM    = vessel ? (vessel.widthMeters  || 12) : 12;

    return {
      vesselId:      vessel ? String(vessel.mmsi || '') : '',
      resolvedClass: cr.resolvedClass,
      confidence:    cr.confidence,
      reason:        cr.reason,
      tier:          tier,
      color:         pal.fill,
      strokeColor:   pal.stroke,
      lengthM:       lenM,
      widthM:        widM,
      showDeckCue:   tier === 'near_topology' || tier === 'hero_topology',
      showHeadingCue:tier !== 'far_dot',
    };
  }

  // ── Canvas rotation helper ────────────────────────────────────────────────────
  // Converts compass bearing (0=N, 90=E) to canvas rotation angle.
  // Bow of vessel points in the direction of travel in screen space.

  function _compassToCanvas(headingDeg) {
    var r = headingDeg * Math.PI / 180;
    return Math.atan2(-Math.cos(r), Math.sin(r));
  }

  // ── draw helpers ─────────────────────────────────────────────────────────────

  function _applyStyle(ctx, fill, stroke, alpha) {
    ctx.fillStyle   = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth   = 1.2;
    ctx.globalAlpha = alpha;
  }

  // Subtle waterline: 1px screen-down shadow under hull body, no blur, no glow.
  function _setWaterlineShadow(ctx) {
    ctx.shadowColor   = 'rgba(0,0,0,0.42)';
    ctx.shadowBlur    = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 1;
  }
  function _clearShadow(ctx) {
    ctx.shadowColor   = 'transparent';
    ctx.shadowBlur    = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }

  // Draw a rounded rectangle. cx/cy=center, w/h=full dims, r=corner radius.
  function _roundRect(ctx, cx, cy, w, h, r) {
    r = Math.min(r, w * 0.45, h * 0.45);
    var x = cx - w * 0.5, y = cy - h * 0.5;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  // Tapered bow hull: stern at +lenPx/2, bow tip at -lenPx/2 (pointing up in rotated space).
  // bowWidth: width at bow shoulder as fraction of widPx.
  function _bowTaper(ctx, lenPx, widPx, bowWidth) {
    var hL = lenPx * 0.5;
    var hW = widPx * 0.5;
    var bW = widPx * (bowWidth || 0.35) * 0.5;
    ctx.beginPath();
    ctx.moveTo(0, -hL);                // bow tip
    ctx.lineTo( bW, -hL * 0.6);       // bow port shoulder
    ctx.lineTo( hW, -hL * 0.1);       // mid port
    ctx.lineTo( hW,  hL * 0.7);       // stern port
    ctx.lineTo(-hW,  hL * 0.7);       // stern stbd
    ctx.lineTo(-hW, -hL * 0.1);       // mid stbd
    ctx.lineTo(-bW, -hL * 0.6);       // bow stbd shoulder
    ctx.closePath();
  }

  // ── drawBarge: long flat rectangle, slightly squared bow ─────────────────────
  function drawBarge(ctx, pt, headingDeg, lenPx, widPx, alpha, fill, stroke) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(pt.x, pt.y);
    ctx.rotate(_compassToCanvas(headingDeg));

    var hL = lenPx * 0.5;
    var hW = widPx * 0.5;

    // Main flat hull body — nearly full length rectangle with very slight bow taper
    ctx.beginPath();
    ctx.moveTo(0, -hL);               // bow center
    ctx.lineTo( hW * 0.8, -hL * 0.8);
    ctx.lineTo( hW,        -hL * 0.5);
    ctx.lineTo( hW,         hL * 0.8);
    ctx.lineTo(-hW,         hL * 0.8);
    ctx.lineTo(-hW,        -hL * 0.5);
    ctx.lineTo(-hW * 0.8,  -hL * 0.8);
    ctx.closePath();
    ctx.fillStyle   = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth   = 0.8;
    _setWaterlineShadow(ctx);
    ctx.fill();
    _clearShadow(ctx);
    ctx.stroke();

    // Low deck line — horizontal stripe, forward third
    if (lenPx > 14) {
      ctx.beginPath();
      ctx.rect(-hW * 0.85, -hL * 0.6, hW * 1.7, lenPx * 0.05);
      ctx.fillStyle = stroke;
      ctx.globalAlpha = alpha * 0.4;
      ctx.fill();
    }

    ctx.restore();
  }

  // ── drawFerry: wide rectangular body, upper-deck block ───────────────────────
  function drawFerry(ctx, pt, headingDeg, lenPx, widPx, alpha, fill, stroke) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(pt.x, pt.y);
    ctx.rotate(_compassToCanvas(headingDeg));

    var hL = lenPx * 0.5;
    var hW = widPx * 0.5;

    // Wide squared hull
    ctx.beginPath();
    ctx.moveTo( hW * 0.6, -hL);
    ctx.lineTo( hW,       -hL * 0.7);
    ctx.lineTo( hW,        hL * 0.7);
    ctx.lineTo( hW * 0.6,  hL);
    ctx.lineTo(-hW * 0.6,  hL);
    ctx.lineTo(-hW,        hL * 0.7);
    ctx.lineTo(-hW,       -hL * 0.7);
    ctx.lineTo(-hW * 0.6, -hL);
    ctx.closePath();
    ctx.fillStyle   = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth   = 1.0;
    _setWaterlineShadow(ctx);
    ctx.fill();
    _clearShadow(ctx);
    ctx.stroke();

    // Upper deck block (superstructure) — bright rectangle amidships
    if (lenPx > 12) {
      var dkH = lenPx * 0.28;
      var dkW = widPx * 0.55;
      ctx.beginPath();
      ctx.rect(-dkW * 0.5, -dkH * 0.6, dkW, dkH);
      ctx.fillStyle   = stroke;
      ctx.globalAlpha = alpha * 0.65;
      ctx.fill();
    }

    ctx.restore();
  }

  // ── drawTug: compact block, wide-for-length workboat ─────────────────────────
  function drawTug(ctx, pt, headingDeg, lenPx, widPx, alpha, fill, stroke) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(pt.x, pt.y);
    ctx.rotate(_compassToCanvas(headingDeg));

    var hL = lenPx * 0.5;
    var hW = widPx * 0.5;

    // Compact rounded hull
    _roundRect(ctx, 0, 0, widPx, lenPx, hW * 0.45);
    ctx.fillStyle   = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth   = 1.0;
    _setWaterlineShadow(ctx);
    ctx.fill();
    _clearShadow(ctx);
    ctx.stroke();

    // Wheelhouse bump — forward square block
    if (lenPx > 8) {
      var whH = lenPx * 0.22;
      var whW = widPx * 0.50;
      _roundRect(ctx, 0, -hL * 0.25, whW, whH, whW * 0.2);
      ctx.fillStyle   = stroke;
      ctx.globalAlpha = alpha * 0.75;
      ctx.fill();
    }

    ctx.restore();
  }

  // ── drawTanker: long hull, rounded bow, central tank mass ────────────────────
  function drawTanker(ctx, pt, headingDeg, lenPx, widPx, alpha, fill, stroke) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(pt.x, pt.y);
    ctx.rotate(_compassToCanvas(headingDeg));

    var hL = lenPx * 0.5;
    var hW = widPx * 0.5;

    // Long rounded hull
    _bowTaper(ctx, lenPx, widPx, 0.25);
    ctx.fillStyle   = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth   = 1.0;
    _setWaterlineShadow(ctx);
    ctx.fill();
    _clearShadow(ctx);
    ctx.stroke();

    // Central cylindrical tank mass — wide oval amidships
    if (lenPx > 16) {
      ctx.beginPath();
      ctx.ellipse(0, -hL * 0.05, hW * 0.7, lenPx * 0.22, 0, 0, Math.PI * 2);
      ctx.fillStyle   = stroke;
      ctx.globalAlpha = alpha * 0.45;
      ctx.fill();
    }

    // Stern block
    if (lenPx > 20) {
      ctx.beginPath();
      ctx.rect(-hW * 0.5, hL * 0.55, hW, lenPx * 0.12);
      ctx.fillStyle   = stroke;
      ctx.globalAlpha = alpha * 0.35;
      ctx.fill();
    }

    ctx.restore();
  }

  // ── drawCargo: long hull, stacked container deck cues ────────────────────────
  function drawCargo(ctx, pt, headingDeg, lenPx, widPx, alpha, fill, stroke) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(pt.x, pt.y);
    ctx.rotate(_compassToCanvas(headingDeg));

    var hL = lenPx * 0.5;
    var hW = widPx * 0.5;

    // Hull with angled bow
    _bowTaper(ctx, lenPx, widPx, 0.30);
    ctx.fillStyle   = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth   = 1.0;
    _setWaterlineShadow(ctx);
    ctx.fill();
    _clearShadow(ctx);
    ctx.stroke();

    // Container stack suggestion — two deck blocks amidships
    if (lenPx > 18) {
      var blkH = lenPx * 0.15;
      var blkW = widPx * 0.65;
      // Forward block
      ctx.beginPath();
      ctx.rect(-blkW * 0.5, -hL * 0.40, blkW, blkH);
      ctx.fillStyle   = stroke;
      ctx.globalAlpha = alpha * 0.5;
      ctx.fill();
      // Aft block
      ctx.beginPath();
      ctx.rect(-blkW * 0.5, -hL * 0.10, blkW, blkH);
      ctx.fillStyle   = stroke;
      ctx.globalAlpha = alpha * 0.35;
      ctx.fill();
    }

    ctx.restore();
  }

  // ── drawPassenger: large body, tiered upper profile ──────────────────────────
  function drawPassenger(ctx, pt, headingDeg, lenPx, widPx, alpha, fill, stroke) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(pt.x, pt.y);
    ctx.rotate(_compassToCanvas(headingDeg));

    var hL = lenPx * 0.5;
    var hW = widPx * 0.5;

    // Wide full hull
    _roundRect(ctx, 0, 0, widPx * 1.1, lenPx, hW * 0.15);
    ctx.fillStyle   = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth   = 1.0;
    _setWaterlineShadow(ctx);
    ctx.fill();
    _clearShadow(ctx);
    ctx.stroke();

    // Lower deck tier
    if (lenPx > 14) {
      ctx.beginPath();
      ctx.rect(-hW * 0.95, -hL * 0.55, widPx * 0.95, lenPx * 0.55);
      ctx.fillStyle   = stroke;
      ctx.globalAlpha = alpha * 0.30;
      ctx.fill();
    }

    // Upper deck tier — narrower, brighter
    if (lenPx > 18) {
      ctx.beginPath();
      ctx.rect(-hW * 0.65, -hL * 0.50, widPx * 0.65, lenPx * 0.42);
      ctx.fillStyle   = stroke;
      ctx.globalAlpha = alpha * 0.55;
      ctx.fill();
    }

    ctx.restore();
  }

  // ── drawRecreational: small hull, pointed bow ─────────────────────────────────
  function drawRecreational(ctx, pt, headingDeg, lenPx, widPx, alpha, fill, stroke) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(pt.x, pt.y);
    ctx.rotate(_compassToCanvas(headingDeg));

    var hL = lenPx * 0.5;
    var hW = widPx * 0.5;

    // Narrow pointed bow hull
    ctx.beginPath();
    ctx.moveTo(0,  -hL);            // bow tip (pointed)
    ctx.lineTo( hW * 0.6, -hL * 0.4);
    ctx.lineTo( hW,        hL * 0.5);
    ctx.lineTo( hW * 0.4,  hL);
    ctx.lineTo(-hW * 0.4,  hL);
    ctx.lineTo(-hW,        hL * 0.5);
    ctx.lineTo(-hW * 0.6, -hL * 0.4);
    ctx.closePath();
    ctx.fillStyle   = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth   = 0.8;
    _setWaterlineShadow(ctx);
    ctx.fill();
    _clearShadow(ctx);
    ctx.stroke();

    ctx.restore();
  }

  // ── drawUnknownVessel: muted capsule ─────────────────────────────────────────
  function drawUnknownVessel(ctx, pt, headingDeg, lenPx, widPx, alpha, fill, stroke) {
    ctx.save();
    ctx.globalAlpha = alpha * 0.75;
    ctx.translate(pt.x, pt.y);
    ctx.rotate(_compassToCanvas(headingDeg));

    var hW = Math.max(1, widPx * 0.5);
    _roundRect(ctx, 0, 0, widPx, lenPx, hW);
    ctx.fillStyle   = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth   = 0.8;
    _setWaterlineShadow(ctx);
    ctx.fill();
    _clearShadow(ctx);
    ctx.stroke();

    ctx.restore();
  }

  // ── drawFarDash ───────────────────────────────────────────────────────────────
  // Heading-aligned dash, class-colored, used at far_dash tier.

  function drawFarDash(ctx, pt, headingDeg, lenPx, alpha, fill) {
    var dashLen = Math.max(VESSEL_SIZE_LIMITS.minDashLengthPx,
                           Math.min(VESSEL_SIZE_LIMITS.maxDashLengthPx, lenPx));
    var r = headingDeg * Math.PI / 180;
    var canvasAngle = Math.atan2(-Math.cos(r), Math.sin(r));
    var dx = Math.sin(canvasAngle) * dashLen * 0.5;
    var dy = -Math.cos(canvasAngle) * dashLen * 0.5;

    ctx.save();
    ctx.globalAlpha = alpha * 0.75;
    ctx.strokeStyle = fill;
    ctx.lineWidth   = 2;
    ctx.lineCap     = 'round';
    ctx.beginPath();
    ctx.moveTo(pt.x - dx, pt.y - dy);
    ctx.lineTo(pt.x + dx, pt.y + dy);
    ctx.stroke();
    ctx.restore();
  }

  // ── drawVesselByClass ─────────────────────────────────────────────────────────
  // Main dispatcher. Calls the appropriate class draw function.
  // profile: from resolveVesselRenderProfile()
  // pt:      screen-space {x, y}
  // headingDeg, lenPx, widPx, alpha: geometry from caller

  function drawVesselByClass(ctx, profile, pt, headingDeg, lenPx, widPx, alpha) {
    var cls    = profile ? profile.resolvedClass : 'unknown';
    var fill   = profile ? profile.color        : CLASS_PALETTE.unknown.fill;
    var stroke = profile ? profile.strokeColor  : CLASS_PALETTE.unknown.stroke;
    var tier   = profile ? profile.tier         : 'mid_silhouette';

    // Clamp sizes
    lenPx = Math.max(4, Math.min(VESSEL_SIZE_LIMITS.maxHeroLengthPx, lenPx));
    widPx = Math.max(2, widPx);

    // ── Tier-based length exaggeration for industrial hulls ───────────────────
    // Barges, cargo, tankers read as long infrastructure against compact tugs/ferries.
    // Exaggeration applied before far_dash check so dashes also get proportional length.
    var _isIndustrial = (cls === 'barge' || cls === 'industrial' ||
                         cls === 'cargo' || cls === 'military'   ||
                         cls === 'tanker');
    if (_isIndustrial) {
      if (tier === 'mid_silhouette') {
        lenPx = Math.min(VESSEL_SIZE_LIMITS.maxHeroLengthPx, lenPx * 1.35);
      } else if (tier === 'near_topology' || tier === 'hero_topology') {
        lenPx = Math.min(VESSEL_SIZE_LIMITS.maxHeroLengthPx, lenPx * 1.15);
      }
    }

    // Far dash uses its own draw path (no exaggeration beyond what's already applied)
    if (tier === 'far_dash') {
      drawFarDash(ctx, pt, headingDeg, lenPx, alpha, fill);
      return;
    }

    // Dot — tiny class-colored circle, no topology
    if (tier === 'far_dot') {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle   = fill;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y,
        Math.max(VESSEL_SIZE_LIMITS.minDotRadiusPx,
                 Math.min(VESSEL_SIZE_LIMITS.maxDotRadiusPx, lenPx * 0.5)),
        0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    // ── Class-specific aspect ratio adjustments ───────────────────────────────
    // Barges: reduce width to accentuate extreme L/W industrial silhouette.
    // Ferries: widen slightly to read as boxy public-transit vessel.
    // Tug/pilot: no change — compact is correct.
    var drawWidPx = widPx;
    if      (cls === 'barge' || cls === 'industrial') drawWidPx = widPx * 0.62;
    else if (cls === 'tanker')                        drawWidPx = widPx * 0.75;
    else if (cls === 'cargo'  || cls === 'military')  drawWidPx = widPx * 0.80;
    else if (cls === 'ferry')                         drawWidPx = widPx * 1.18;

    // Silhouette and topology tiers → class-specific shapes
    switch (cls) {
      case 'barge':
      case 'industrial':
        drawBarge(ctx, pt, headingDeg, lenPx, drawWidPx, alpha, fill, stroke);
        break;
      case 'ferry':
        drawFerry(ctx, pt, headingDeg, lenPx, drawWidPx, alpha, fill, stroke);
        break;
      case 'tug':
      case 'service':
      case 'fishing':
        drawTug(ctx, pt, headingDeg, lenPx, widPx, alpha, fill, stroke);
        break;
      case 'tanker':
        drawTanker(ctx, pt, headingDeg, lenPx, drawWidPx, alpha, fill, stroke);
        break;
      case 'cargo':
      case 'military':
        drawCargo(ctx, pt, headingDeg, lenPx, drawWidPx, alpha, fill, stroke);
        break;
      case 'passenger':
      case 'cruise':
        drawPassenger(ctx, pt, headingDeg, lenPx, widPx, alpha, fill, stroke);
        break;
      case 'pilot':
        drawTug(ctx, pt, headingDeg, lenPx, widPx * 0.85, alpha, fill, stroke);
        break;
      case 'sailing':
      case 'yacht':
      case 'recreational':
        drawRecreational(ctx, pt, headingDeg, lenPx, widPx, alpha, fill, stroke);
        break;
      default:
        drawUnknownVessel(ctx, pt, headingDeg, lenPx, widPx, alpha, fill, stroke);
        break;
    }
  }

  // ── getClassColor(resolvedClass) ──────────────────────────────────────────────
  // Returns { fill, stroke } for a resolved class key.

  function getClassColor(resolvedClass) {
    return CLASS_PALETTE[resolvedClass] || CLASS_PALETTE.unknown;
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  SBE.VesselClassPresentation = Object.freeze({
    VERSION: VERSION,

    // Resolution
    resolveVesselClass:        resolveVesselClass,
    resolveVesselRenderTier:   resolveVesselRenderTier,
    resolveVesselRenderProfile: resolveVesselRenderProfile,
    getClassColor:             getClassColor,

    // Draw functions
    drawVesselByClass:  drawVesselByClass,
    drawBarge:          drawBarge,
    drawFerry:          drawFerry,
    drawTug:            drawTug,
    drawTanker:         drawTanker,
    drawCargo:          drawCargo,
    drawPassenger:      drawPassenger,
    drawRecreational:   drawRecreational,
    drawUnknownVessel:  drawUnknownVessel,
    drawFarDash:        drawFarDash,

    // Constants
    CLASS_PALETTE:      CLASS_PALETTE,
    VESSEL_TIER_ZOOM:   VESSEL_TIER_ZOOM,
    VESSEL_SIZE_LIMITS: VESSEL_SIZE_LIMITS,
  });

  console.log('[VesselClassPresentation] v' + VERSION +
    ' loaded — ' + Object.keys(CLASS_PALETTE).length + ' vessel classes ready');

})(window);
