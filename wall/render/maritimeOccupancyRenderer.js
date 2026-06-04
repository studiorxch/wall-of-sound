// ── MaritimeOccupancyRenderer v1.6.0 ─────────────────────────────────────────
// 0524L_WOS_MaritimePresencePolish_v1.0.0
// Supersedes: v1.5.0
//
// Patch changes (v1.5.0 → v1.6.0):
//   §0524L-1  Water corridor guard — _drawValidationFarDot gains vesselSeed param;
//             validation fast path computes MMSI-derived phase seed before call.
//   §0524L-2  Far light behaviour — halo capped 1.8px (was 2.5px); core 1px max;
//             alpha clamped 0.25–0.55; deterministic per-vessel twinkle via
//             sin(seed + performance.now() * 0.001). No hulls, no blobs.
//   §0524L-3  Motion readability — compact sprite path (zoom 11.2–13.2) draws a
//             reduced-alpha sprite wake when zoom ≥ 11.8.
//   §0524L-4  Class differentiation — _spriteCargo: deck rect at simple LOD;
//             _spriteTanker: centreline stripe at simple LOD (tank domes detailed
//             only). _drawBoatSprite switch adds SERVICE, RECREATIONAL, SAILING,
//             FISHING cases dispatching to _spriteService, _spriteRecreational,
//             _spriteFishing (new). All use muted maritime palette.
//   §0524L-5  Hover card linger — _drawHoverLabel gains optional externalAlpha.
//             Linger state (_lingerVesselId/Pt/Vessel/Class/SpeedKts/StartMs)
//             keeps card visible 1100ms after hover exits, quadratic ease-out.
//             hoverCardLingerMs exposed in _spriteTel for debug reads.
//
// 0523J_WOS_MaritimeBoatSpriteRenderer_v1.0.0
// Supersedes: v1.4.0
//
// Patch changes (v1.4.0 → v1.5.0):
//   §J1  Labels OFF by default — shown only when showMaritimeDebugLabels flag
//        is true or the vessel is hovered. Seed label behaviour unchanged.
//   §J2  Class-specific hull sprites (CARGO / TANKER / FERRY / PASSENGER /
//        TUG / MILITARY / default) drawn in local vessel space; bow = -Y.
//        Sprite LOD resolver:
//          zoom < 12         → 'chevron'   (existing chevron path)
//          12 ≤ zoom < 14    → 'simple'    (hull fill only)
//          zoom ≥ 14 + pitch < 20° → 'detailed' (hull + deck features)
//          pitch ≥ 20°       → 'symbolic'  (chevron, pitch-safe)
//   §J3  V-shape sprite wake replaces speed tail in sprite LOD paths.
//        Speed tail preserved in chevron/symbolic paths.
//   §J4  Nav lights in sprite path only at zoom ≥ 13 or night/dusk.
//        Standard night boost (×1.28) retained.
//   §J5  Hover hit detection via window mousemove (canvas pointer-events:none
//        preserved to not block Mapbox pan/zoom). Hover shows rich label card.
//   §J6  Per-frame sprite telemetry: _spriteTel {spriteRendered,
//        tacticalRendered}. Exposed via debugBoatSpriteRenderer().
//   §J7  _wos.debugBoatSpriteRenderer() wired in init().
//
// Preserved from v1.4.0:
//   - All §I–§VII AIS projection renderer logic
//   - All v1.3.0 motion presence primitives
//   - Read-only: no mutation of AIS/wake/population/ecology/atmosphere
//
// Core doctrine:
//   MotionPresence may make motion readable.
//   MotionPresence may never fabricate maritime truth.
//
// Placement: wall/render/maritimeOccupancyRenderer.js
// ─────────────────────────────────────────────────────────────────────────────
// 0523I_WOS_MaritimeAISProjectionRenderer_v1.0.0
// Supersedes: v1.3.0
//
// Patch changes (v1.3.0 → v1.4.0):
//   §I   Render mode resolver — frame-level decision between two modes:
//          'tactical-symbol': chevron + tail + nav lights (default; pitch-safe)
//          'hull-proxy': silhouette hull allowed (only when pitch < 20° AND zoom ≥ 14)
//        Prevents "fridge ship" appearance under any map tilt.
//   §II  AISRuntime field compatibility:
//          _isUnderway: now reads vessel.speedKnots (AISRuntime field name)
//          speedKts: reads speedKnots ∥ speedKts ∥ sog
//          _vesselPx: uses vessel.lengthMeters/widthMeters when available
//            (AISRuntime merges actual dims from packet.dimensions)
//   §III Tactical-symbol size bounds: underway chevrons capped at 24×12px.
//        Hull-proxy size bounds: lenPx ≤ 60px, aspect ≤ 3:1 (anti-fridge).
//   §IV  SILHOUETTE branch: in tactical-symbol mode the hull capsule is replaced
//        with a pitch-safe chevron; suppressedHullProxyCount incremented.
//   §V   Validation vessel label preservation: AIS vessels with MMSI in the
//        validation namespace (999001001–999001035) receive labelOk=true so
//        names render without requiring HERO/MID tier assignment.
//   §VI  Per-frame projection telemetry: _projTel (renderMode, mapPitch,
//        mapZoom, hullProxyRendered, tacticalSymbolsRendered,
//        suppressedHullProxyCount). Exposed via debugAISProjectionRenderer().
//   §VII _wos.debugAISProjectionRenderer() wired in init().
//
// Preserved from v1.3.0:
//   - maritimeValidationVisibility, showSeedVesselLabels, seed tint palette
//   - _seedFrameStats per-frame counters, debugVisibleSeedVessels()
//   - All radius caps and showMaritimeDebugFields flag
//   - Mini directional chevron (≥8×4px) at LOD dot
//   - 8 water-safe corridor seed groups (35 vessels), _SEED_CORRIDORS
//   - showSeedWaterDebug() corridor diagnostic
//   - Canvas lifecycle, rAF loop, DPR handling
//   - Read-only: no mutation of AIS/wake/population/ecology/atmosphere
//
// Core doctrine:
//   MotionPresence may make motion readable.
//   MotionPresence may never fabricate maritime truth.
//
// Placement: wall/render/maritimeOccupancyRenderer.js
// ─────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  var VERSION = '1.6.0';

  // ── Canvas / loop state ───────────────────────────────────────────────────

  var _canvas      = null;
  var _ctx         = null;
  var _rafId       = null;
  var _enabled     = false;
  var _initialized = false;
  var _lastFrameMs = 0;
  var _parentSel   = '.canvas-area';

  // ── LOD breakpoints (meters per pixel) ───────────────────────────────────

  var LOD_DOT_MPX     = 15;
  var LOD_CAPSULE_MPX = 4;

  // ── Class-aware physical size table (meters) ──────────────────────────────

  var _classSize = {
    CARGO:        { len: 200, wid: 32 },
    TANKER:       { len: 180, wid: 30 },
    PASSENGER:    { len: 250, wid: 35 },
    FERRY:        { len:  80, wid: 20 },
    TUG:          { len:  30, wid: 10 },
    SERVICE:      { len:  35, wid: 10 },
    FISHING:      { len:  25, wid:  7 },
    RECREATIONAL: { len:  15, wid:  5 },
    MILITARY:     { len: 120, wid: 16 },
    INDUSTRIAL:   { len: 100, wid: 22 },
    UNKNOWN:      { len:  40, wid: 10 },
  };

  // ── Tier scale ────────────────────────────────────────────────────────────

  var _tierScale = { HERO: 1.10, MID: 0.85, BACKGROUND: 0.65, GHOST: 0.40 };

  // ── Color palette ─────────────────────────────────────────────────────────

  var _PAL = {
    // AIS vessel tier colors (warm, bright)
    HERO:              '#f5e8b0',
    MID:               '#c4d8ee',
    BACKGROUND:        '#8fa8ba',
    GHOST:             '#4a5f70',
    stroke_HERO:       '#ffffff',
    stroke_MID:        'rgba(210,228,248,0.85)',
    stroke_BACKGROUND: 'rgba(160,185,200,0.50)',
    stroke_GHOST:      'rgba(90,115,130,0.28)',
    // Synthetic vessels — cooler, dimmer
    syn_HERO:          '#a8c8e0',
    syn_MID:           '#7898b0',
    syn_BACKGROUND:    '#526878',
    syn_GHOST:         '#2e3e4a',
    syn_stroke:        'rgba(130,165,188,0.50)',
    SYNTHETIC_ALPHA:   0.62,
    // Glow / halo
    glow_HERO:         'rgba(255,240,180,0.28)',
    glow_MID:          'rgba(180,215,245,0.18)',
    // Navigation lights (§6)
    nav_port:          '#ff4b4b',   // red — port (left)
    nav_starboard:     '#4bff8a',   // green — starboard (right)
    nav_stern:         '#dcecff',   // white-blue — aft
    nav_mast:          '#ffe8a0',   // amber — masthead
    // Speed tail
    tail_AIS:          'rgba(200,225,245,0.55)',
    tail_SYN:          'rgba(140,175,200,0.35)',
    // Wake
    wake_AIS:          '#b0ccdf',
    wake_SYNTHETIC:    '#7898a8',
    wake_glow:         '#9ec8e8',   // glow pass color
    // Special states
    emergency:         '#ff3820',   // red pulse
    emergency_glow:    'rgba(255,56,32,0.30)',
    restricted:        '#d4a843',   // amber caution
    anchor_ring:       'rgba(160,190,210,0.70)',
    anchor_swing:      'rgba(120,160,190,0.12)', // faint swing radius
    stale:             '#667788',
    // Light-only
    lightOnly:         '#ffe8a0',
    lightOnly_syn:     '#90b8d0',
    // §J — Sprite hull colors (muted maritime palette for dark map)
    sprite_CARGO_hull:      '#4d6e7e',
    sprite_CARGO_deck:      '#2a3a48',
    sprite_CARGO_box:       '#b86e30',
    sprite_TANKER_hull:     '#3d5e6e',
    sprite_TANKER_tank:     '#2a4050',
    sprite_FERRY_hull:      '#5a7e94',
    sprite_FERRY_cabin:     '#8ab8cc',
    sprite_PASSENGER_hull:  '#6090a8',
    sprite_PASSENGER_cabin: '#b8d8e8',
    sprite_TUG_hull:        '#3f5060',
    sprite_TUG_wheel:       '#28394a',
    sprite_MIL_hull:        '#404f3a',
    sprite_DEF_hull:        '#506070',
    sprite_stroke:          'rgba(220,235,245,0.40)',
    sprite_hover:           '#ffd84a',
    // Labels
    label_name:        'rgba(230,242,252,0.96)',
    label_class:       'rgba(170,200,220,0.80)',
    label_bg:          'rgba(8,18,28,0.68)',
    label_bg_hero:     'rgba(12,24,40,0.78)',
    // Corridor hints
    corridor:          'rgba(140,185,210,0.06)',
    // Seed vessel validation tint — §3 warm maritime, not debug-neon.
    // Distinct from AIS palette so seeds are identifiable during audit.
    seed_HERO:         '#f2d055',               // warm amber-gold
    seed_MID:          '#5bb8e8',               // clear maritime blue
    seed_BACKGROUND:   '#6ab4cc',               // medium harbour blue
    seed_GHOST:        '#4d8fa0',               // muted steel blue
    seed_stroke:       'rgba(255,230,150,0.72)', // warm amber stroke
  };

  // ── Combined telemetry ────────────────────────────────────────────────────

  var _tel = {
    // Frame
    framesRendered:       0,
    aisRendered:          0,
    syntheticRendered:    0,
    wakesRendered:        0,
    atmosphericHidden:    0,
    labelsRendered:       0,
    seedRendered:         0,
    // Motion presence (0523G-2)
    navLightsRendered:    0,
    speedTailsRendered:   0,
    wakeGlowSegments:     0,
    anchoredPinsRendered: 0,
    lightOnlyVessels:     0,
    ferryEmphasisCount:   0,
    corridorHintsRendered:0,
  };

  // ── Per-vessel glyph state — renderer-local alpha smoothing ──────────────
  // Must never be used as runtime truth. Visually discardable.

  var _glyphState = {}; // vesselId → { alpha: number }

  // ── Per-frame seed visibility stats — §4, for debugVisibleSeedVessels() ──
  // Reset at frame start. Renderer-local; never used as runtime truth.

  var _seedFrameStats = {
    projected:   0,  // seeds with non-null screen projection
    skippedProj: 0,  // seeds that failed projection (off-viewport)
    hiddenAtmo:  0,  // seeds hidden by atmospheric readability
    rendered:    0,  // seeds that completed draw pass
    alphaSum:    0,  // running sum for averageAlpha
    glyphPxSum:  0,  // running sum for averageGlyphPx
    atDotLOD:    0,  // seeds that drew at dot LOD
  };

  // ── Seed vessel store ─────────────────────────────────────────────────────

  var _seedVessels = [];
  var _seedEnabled  = false;

  // ── §I Projection render mode — set once per frame, read by _renderVessel ──
  // 'tactical-symbol': chevron + tail + lights. Always pitch-safe. Default.
  // 'hull-proxy':      silhouette hull allowed. Only at low pitch + close zoom.
  // Set by _renderFrame via _resolveRenderMode(). Never written by _renderVessel.

  var _currentRenderMode = 'tactical-symbol'; // module-level frame cache

  var _projTel = {
    renderMode:               'tactical-symbol',
    mapPitch:                 0,
    mapZoom:                  12,
    hullProxyRendered:        0, // _drawSilhouette calls that completed
    tacticalSymbolsRendered:  0, // chevron draws (FULL/REDUCED + suppressed hulls)
    suppressedHullProxyCount: 0, // silhouettes replaced by chevron due to pitch
  };

  // ── §I Render mode constants ─────────────────────────────────────────────
  var PITCH_HULL_SAFE = 20;  // degrees — below this pitch hull shapes are acceptable
  var ZOOM_HULL_SAFE  = 14;  // hull shapes only usable when zoom ≥ this

  // ── §J Sprite LOD + hover state ───────────────────────────────────────────
  // _currentSpriteLOD: frame-level decision, resolved once in _renderFrame.
  // _hoverHitList:     accumulated per vessel during render; consumed at frame end.
  // _hoveredVesselId:  last frame's hover result; read by _renderVessel for glyph.
  // _frameCamera:      module-level copy of camera (set in _renderFrame so
  //                    _renderVessel can read zoom without an extra argument).

  var _currentSpriteLOD = 'chevron';
  var _spriteTel = {
    spriteRendered:           0,
    tacticalRendered:         0,
    // §0524B — body draw telemetry (split from hover hit detection)
    projectedAISCount:        0,  // AIS vessels with non-null screen projection this frame
    hoverHitCount:            0,  // hover hit regions registered this frame
    bodyDrawAttemptCount:     0,  // draw dispatch entered for any vessel
    bodyDrawSuccessCount:     0,  // draw dispatch reached a paint call
    validationFallbackDrawn:  0,  // validation vessels rescued by fallback primitive
    bodySkippedReasonCounts:  {}, // reason → count for skipped body draws (keyed string)
    // §0524C — validation LOD enforcement
    validationDotSuppressed:  0,  // dot LOD overridden to sprite route for validation vessel
    validationSpriteForced:   0,  // spriteLOD forced to 'simple' at zoom 10.8–12 for validation
    // §0524E — per-draw-call counters (increment AT the function call site, not at branch entry)
    validationSilhouettePromoted:    0,  // visClass SILHOUETTE→REDUCED before SILHOUETTE branch
    validationSymbolicOverridden:    0,  // sl 'symbolic'/'chevron' → 'simple' in sprite dispatch
    validationSimpleSpriteDrawn:     0,  // _drawBoatSprite called for a validation vessel
    validationChevronDrawn:          0,  // _drawChevron called for a validation vessel
    validationDotDrawn:              0,  // _drawFaintDot called for a validation vessel
    validationSpriteBranchEntered:   0,  // else-branch (FULL/REDUCED) entered for validation vessel
    validationSpriteBranchSkippedReason: {}, // reason → count when else-branch is NOT entered
    validationGhostTierPromoted:     0,  // §0524F GHOST tier promoted to BACKGROUND for render
    // §0524H — validation LOD fast path counters
    compactSpriteRendered:          0,  // _drawCompactBoatSprite called (zoom 11.2–13.2)
    farDotRendered:                 0,  // tiny signal dot at zoom < 11.2
    chevronSuppressedForValidation: 0,  // chevron/triangle path skipped for validation vessel
    tinyLightDotRendered:           0,  // _drawValidationFarDot: tiny star-like signal
    oversizedFarDotPrevented:       0,  // compact path taken, large blob prevented
    // §0524L
    hoverCardLingerMs:              1100, // hover card visible this long after mouse leaves
  };
  var _hoverHitList    = []; // { vesselId, x, y, r, vessel, vesselClass, speedKts }
  var _hoveredVesselId = null;
  // §0524L — hover card linger state
  var _lingerVesselId   = null;
  var _lingerPt         = null;
  var _lingerVessel     = null;
  var _lingerClass      = null;
  var _lingerSpeedKts   = 0;
  var _lingerStartMs    = 0;
  // §0524G — heading convention debug sample (updated each frame from last drawn sprite)
  var _dbgSampleHeadingDeg      = 0;
  var _dbgSampleSpriteRotRad    = 0;
  var _dbgSampleMotionBearingDeg = 0;
  var _mouseX          = -1;
  var _mouseY          = -1;
  var _mouseInCanvas   = false;
  var _mouseListenerAttached = false;
  var _frameCam        = { pitch: 0, zoom: 12 }; // updated once per frame

  // ── §V Validation MMSI namespace — for label preservation ───────────────
  // MaritimeValidationFeed injects vessels with MMSI 999001001–999001060 (catalog up to 60 entries).
  // Renderer preserves labels for these regardless of tier assignment.
  var VALIDATION_MMSI_MIN = 999001001;
  var VALIDATION_MMSI_MAX = 999001060; // catalog expanded to 51+ vessels; keep headroom

  // ── Projection helpers ────────────────────────────────────────────────────

  function _project(lat, lng) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    var mvr = SBE.MapboxViewportRuntime;
    if (!mvr || !mvr.project) return null;
    return mvr.project([lng, lat]);
  }

  // ── Geographic bearing offset ─────────────────────────────────────────────
  // Returns {lat, lng} displaced from (lat, lng) by bearingDeg and distM meters.
  // Used to compute hull corners in geo-space so map.project() bakes in pitch.

  function _geoBearingOffset(lat, lng, bearingDeg, distM) {
    var R    = 6371000;
    var brg  = bearingDeg * Math.PI / 180;
    var latR = lat * Math.PI / 180;
    var dR   = distM / R;
    var lat2 = Math.asin(
      Math.sin(latR) * Math.cos(dR) +
      Math.cos(latR) * Math.sin(dR) * Math.cos(brg)
    );
    var lng2 = (lng * Math.PI / 180) + Math.atan2(
      Math.sin(brg) * Math.sin(dR) * Math.cos(latR),
      Math.cos(dR) - Math.sin(latR) * Math.sin(lat2)
    );
    return { lat: lat2 * 180 / Math.PI, lng: lng2 * 180 / Math.PI };
  }

  // ── Grounded hull draw ────────────────────────────────────────────────────
  // Projects each hull corner through map.project() so the current pitch/tilt
  // is baked into the polygon. Vessel lies on the water plane, not standing upright.
  // Heading is rotated in geographic space before projection — no ctx.rotate().

  function _drawMORGroundedHull(ctx, lat, lng, hdg, lenM, widM, fillStyle, strokeStyle, alpha) {
    var halfLen = lenM * 0.5;
    var halfWid = widM * 0.5;
    var bowExt  = halfLen * 0.35;

    var fwdCenter  = _geoBearingOffset(lat, lng, hdg,        halfLen * 0.25);
    var aftCenter  = _geoBearingOffset(lat, lng, hdg + 180,  halfLen);

    var bowTip     = _geoBearingOffset(lat, lng,              hdg,       halfLen + bowExt);
    var bowPort    = _geoBearingOffset(fwdCenter.lat, fwdCenter.lng, hdg - 90,  halfWid);
    var bowStbd    = _geoBearingOffset(fwdCenter.lat, fwdCenter.lng, hdg + 90,  halfWid);
    var sternPort  = _geoBearingOffset(aftCenter.lat, aftCenter.lng, hdg - 90,  halfWid);
    var sternStbd  = _geoBearingOffset(aftCenter.lat, aftCenter.lng, hdg + 90,  halfWid);

    var pBow       = _project(bowTip.lat,    bowTip.lng);
    var pBowPort   = _project(bowPort.lat,   bowPort.lng);
    var pBowStbd   = _project(bowStbd.lat,   bowStbd.lng);
    var pSternPort = _project(sternPort.lat, sternPort.lng);
    var pSternStbd = _project(sternStbd.lat, sternStbd.lng);

    if (!pBow || !pBowPort || !pBowStbd || !pSternPort || !pSternStbd) return false;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle   = fillStyle;
    ctx.strokeStyle = strokeStyle || 'rgba(90,120,140,0.55)';
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.moveTo(pBow.x,       pBow.y);
    ctx.lineTo(pBowPort.x,   pBowPort.y);
    ctx.lineTo(pSternPort.x, pSternPort.y);
    ctx.lineTo(pSternStbd.x, pSternStbd.y);
    ctx.lineTo(pBowStbd.x,   pBowStbd.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    return true;
  }

  // _drawMORGroundedHullWithDetail — hull polygon + optional geo-space detail pass
  // profile: VesselVisualProfile.resolveProfile() result (may be null → no detail)
  // lenPx:   projected hull length in pixels (determines detailTier)
  function _drawMORGroundedHullWithDetail(ctx, lat, lng, hdg, lenM, widM, fillStyle, strokeStyle, alpha, profile, lenPx) {
    var ok = _drawMORGroundedHull(ctx, lat, lng, hdg, lenM, widM, fillStyle, strokeStyle, alpha);
    if (!ok || !profile) return ok;

    var tier = profile.detailTier;
    // Override detail tier with current lenPx (VVP cached a stale value at resolve time)
    if (lenPx >= 24) tier = 2;
    else if (lenPx >= 10) tier = 1;
    else tier = 0;
    if (tier === 0) return ok;

    var halfLen = lenM * 0.5;
    var halfWid = widM * 0.5;

    // Tier 1 — centerline stripe (bow to stern)
    var clBow  = _geoBearingOffset(lat, lng, hdg,       halfLen * 0.85);
    var clStern= _geoBearingOffset(lat, lng, hdg + 180, halfLen * 0.75);
    var pClBow  = _project(clBow.lat,   clBow.lng);
    var pClStern= _project(clStern.lat, clStern.lng);
    if (pClBow && pClStern) {
      ctx.save();
      ctx.globalAlpha = alpha * 0.55;
      ctx.strokeStyle = profile.accentColor || 'rgba(120,170,190,0.50)';
      ctx.lineWidth   = 1.0;
      ctx.beginPath();
      ctx.moveTo(pClBow.x,   pClBow.y);
      ctx.lineTo(pClStern.x, pClStern.y);
      ctx.stroke();
      ctx.restore();
    }

    if (tier < 2) return ok;

    // Tier 2 — deck / superstructure block (midships rectangle, 30% of length, 55% of width)
    var deckHalfLen = halfLen * 0.15;
    var deckHalfWid = halfWid * 0.55;
    var deckFwd  = _geoBearingOffset(lat, lng, hdg,       deckHalfLen);
    var deckAft  = _geoBearingOffset(lat, lng, hdg + 180, deckHalfLen);
    var dFwdPort = _geoBearingOffset(deckFwd.lat, deckFwd.lng, hdg - 90, deckHalfWid);
    var dFwdStbd = _geoBearingOffset(deckFwd.lat, deckFwd.lng, hdg + 90, deckHalfWid);
    var dAftPort = _geoBearingOffset(deckAft.lat, deckAft.lng, hdg - 90, deckHalfWid);
    var dAftStbd = _geoBearingOffset(deckAft.lat, deckAft.lng, hdg + 90, deckHalfWid);
    var pDFP = _project(dFwdPort.lat, dFwdPort.lng);
    var pDFS = _project(dFwdStbd.lat, dFwdStbd.lng);
    var pDAP = _project(dAftPort.lat, dAftPort.lng);
    var pDAS = _project(dAftStbd.lat, dAftStbd.lng);
    if (pDFP && pDFS && pDAP && pDAS) {
      ctx.save();
      ctx.globalAlpha = alpha * 0.70;
      ctx.fillStyle   = profile.deckColor || 'rgba(30,50,65,0.80)';
      ctx.beginPath();
      ctx.moveTo(pDFP.x, pDFP.y);
      ctx.lineTo(pDFS.x, pDFS.y);
      ctx.lineTo(pDAS.x, pDAS.y);
      ctx.lineTo(pDAP.x, pDAP.y);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    return ok;
  }


  // Per-vessel render branch log — read by getMORRenderBranches() / visibleRenderer()
  var _lastMORBranches = {};

  function _metersPerPixel() {
    var mvr  = SBE.MapboxViewportRuntime;
    if (!mvr) return 10;
    var cam  = mvr.getCamera ? mvr.getCamera() : null;
    var zoom = cam ? cam.zoom : 12;
    var mpp  = 156543.03392 * Math.cos(40.7 * Math.PI / 180) / Math.pow(2, zoom);
    return Math.max(0.1, mpp);
  }

  // ── §I Camera state + render mode resolution ─────────────────────────────

  function _getMapCamera() {
    var mvr = SBE.MapboxViewportRuntime;
    var cam = mvr && mvr.getCamera ? mvr.getCamera() : null;
    return {
      pitch: (cam && cam.pitch != null) ? cam.pitch : 0,
      zoom:  (cam && cam.zoom  != null) ? cam.zoom  : 12,
    };
  }

  // Tactical-symbol is always safe: chevron/tail/lights render correctly under
  // any map pitch because they are drawn in screen space from a single projected
  // point.
  //
  // Hull-proxy allows _drawSilhouette (elongated capsule). This is only safe
  // when the map is near top-down (pitch < PITCH_HULL_SAFE) and the zoom is
  // close enough that hull scale is meaningful (zoom ≥ ZOOM_HULL_SAFE).
  // At any other pitch the capsule skews or stands upright ("fridge ship").

  function _resolveRenderMode(cam) {
    if (cam.pitch < PITCH_HULL_SAFE && cam.zoom >= ZOOM_HULL_SAFE) return 'hull-proxy';
    return 'tactical-symbol';
  }

  // §J — Sprite LOD resolver.
  // chevron:  zoom < 12, or pitch ≥ 20° (symbolic, pitch-safe, existing chevron).
  // simple:   zoom 12–14. Hull fill, no deck detail.
  // detailed: zoom ≥ 14 AND pitch < 20°. Full class-specific deck features.
  // symbolic: pitch ≥ 20° at any zoom ≥ 12. Same as chevron — avoids fridge ship.

  function _resolveSpriteLOD(cam) {
    if (cam.zoom < 12)                                    return 'chevron';
    if (cam.pitch >= PITCH_HULL_SAFE)                     return 'symbolic';
    if (cam.zoom >= ZOOM_HULL_SAFE && cam.pitch < PITCH_HULL_SAFE) return 'detailed';
    return 'simple'; // 12 ≤ zoom < 14
  }

  // ── Atmospheric context ───────────────────────────────────────────────────

  function _buildAtmosphericContext(aisCount, syntheticCount) {
    var simClock = SBE.SimulationClock;
    var nowMs    = simClock && simClock.now ? simClock.now() : Date.now();
    var hourF    = (nowMs % 86400000) / 3600000;
    var timeOfDay;
    if      (hourF >= 5.5  && hourF < 7.5)  timeOfDay = 'DAWN';
    else if (hourF >= 7.5  && hourF < 12.0) timeOfDay = 'MORNING';
    else if (hourF >= 12.0 && hourF < 17.0) timeOfDay = 'MIDDAY';
    else if (hourF >= 17.0 && hourF < 19.5) timeOfDay = 'DUSK';
    else                                     timeOfDay = 'NIGHT';

    var flags        = (SBE.runtimeFlags || {});
    var weatherState = flags.weatherState || 'CLEAR';
    var total        = (aisCount || 0) + (syntheticCount || 0);

    return {
      simulationTimeMs:     nowMs,
      timeOfDay:            timeOfDay,
      weatherState:         weatherState,
      visibilityMeters:     null,
      viewportScale:        1.0,
      cameraDistanceMeters: null,
      clutterPressure:      Math.min(1.0, total / 80),
    };
  }

  // ── Vessel state helpers ──────────────────────────────────────────────────

  function _isUnderway(vessel) {
    if (!vessel) return false;
    if (vessel.state === 'STATUS_UNDERWAY') return true;
    // §II: AISRuntime stores speed as vessel.speedKnots; seed/synthetic use speedKts or sog
    var spd = vessel.speedKnots || vessel.speedKts || vessel.sog || 0;
    return spd > 0.5;
  }

  function _isStatic(vessel) {
    if (!vessel) return false;
    var s = vessel.state || '';
    return s === 'STATUS_ANCHORED' || s === 'STATUS_MOORED' ||
           s.indexOf('ANCHOR') !== -1 || s.indexOf('MOOR') !== -1;
  }

  function _isFerryClass(vc) {
    return vc === 'FERRY' || vc === 'PASSENGER';
  }

  // ── Runtime flag helpers ──────────────────────────────────────────────────

  function _flag(name, defaultVal) {
    var f = SBE.runtimeFlags;
    if (!f) return defaultVal;
    return (f[name] !== undefined) ? f[name] : defaultVal;
  }

  // ── Vessel class resolution ───────────────────────────────────────────────
  // AISRuntime does not copy telemetry.shipType onto the vessel object — only
  // lat/lng/speed/heading/state/dimensions survive the ingest pipeline. This
  // means any vessel that comes through AISRuntime (including validation feed
  // vessels) has no shipType/vesselClass on the object itself.
  //
  // Fallback chain:
  //   1. AIS ship-type code on the vessel object (live AIS path)
  //   2. vesselClass string on the vessel object (synthetic ecology path)
  //   3. MaritimeValidationFeed.getVesselClass(mmsi) for validation MMSI namespace
  //   4. 'UNKNOWN' sentinel

  function _resolveVesselClass(vessel) {
    var mtp = SBE.MaritimeTaxonomyProfiles;
    // (1) AIS ship-type code
    var code = vessel.shipType || vessel.type_and_cargo || vessel.aisTypeCode || null;
    if (code != null && Number.isFinite(code) && mtp) {
      return mtp.resolveVesselClassFromAIS(code) || 'UNKNOWN';
    }
    // (2) Explicit class string (synthetic ecology vessels carry this)
    if (vessel.vesselClass) return vessel.vesselClass;
    // (3) Validation feed lookup — AISRuntime strips telemetry.shipType from the
    //     vessel object, so validation vessels would always resolve as UNKNOWN without
    //     this fallback. Querying the feed by MMSI restores the correct class.
    if (vessel.mmsi >= VALIDATION_MMSI_MIN && vessel.mmsi <= VALIDATION_MMSI_MAX) {
      var mvf = SBE.MaritimeValidationFeed;
      if (mvf && mvf.getVesselClass) {
        var cls = mvf.getVesselClass(vessel.mmsi);
        if (cls) return cls;
      }
    }
    return 'UNKNOWN';
  }

  // ── LOD ───────────────────────────────────────────────────────────────────

  function _classifyLOD(mpx) {
    if (mpx > LOD_DOT_MPX)     return 'dot';
    if (mpx > LOD_CAPSULE_MPX) return 'chevron';
    return 'full';
  }

  // ── Vessel pixel size ─────────────────────────────────────────────────────
  // §II: vessel param is optional. When provided and has actual dimensions from
  // AISRuntime (packet.dimensions.lengthMeters/widthMeters), those take priority
  // over the class-based size table. AISRuntime merges dims on ingest.

  function _vesselPx(vesselClass, tier, mpx, vessel) {
    var sz;
    if (vessel && vessel.lengthMeters > 0 && vessel.widthMeters > 0) {
      sz = { len: vessel.lengthMeters, wid: vessel.widthMeters };
    } else {
      sz = _classSize[vesselClass] || _classSize.UNKNOWN;
    }
    var scale = _tierScale[tier] || 0.65;
    return {
      lenPx: Math.max(4, sz.len * scale / mpx),
      widPx: Math.max(2, sz.wid * scale / mpx),
    };
  }

  // ── Visual smoothing helper ───────────────────────────────────────────────
  // Renderer-local glyph alpha easing. Never used as runtime truth.

  function _smoothAlpha(vesselId, targetAlpha, dt) {
    var gs = _glyphState[vesselId];
    if (!gs) {
      gs = { alpha: targetAlpha * 0.01 }; // start faint to fade in
      _glyphState[vesselId] = gs;
    }
    var rate = Math.min(1, dt * 3.5); // ~285ms approach
    gs.alpha += (targetAlpha - gs.alpha) * rate;
    return gs.alpha;
  }

  // ── Nav-light condition ───────────────────────────────────────────────────
  // Nav lights appear for FULL/REDUCED/LIGHT_ONLY, and always at DUSK/NIGHT/FOG.

  function _shouldShowNavLights(visClass, atmoCtx) {
    if (!_flag('showMaritimeNavLights', true)) return false;
    if (visClass === 'ATMOSPHERIC_HIDDEN') return false;
    if (visClass === 'FULL' || visClass === 'REDUCED' || visClass === 'LIGHT_ONLY') return true;
    var tod = atmoCtx.timeOfDay;
    var wx  = atmoCtx.weatherState;
    return tod === 'DUSK' || tod === 'NIGHT' ||
           wx === 'FOG'   || wx === 'HAZE'   || wx === 'RAIN';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DRAW PRIMITIVES
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Glow ring — HERO, with slow breathing ─────────────────────────────────

  function _drawGlowRing(ctx, pt, r, color, alpha) {
    var breath   = 0.85 + 0.15 * Math.sin(performance.now() * 0.0017); // ~3.7s cycle
    var debugFld = _flag('showMaritimeDebugFields', false);
    // §2 — cap outer radii; §1 — relax caps when debug fields enabled
    var outer1   = debugFld ? r * 2.2 : Math.min(12, r * 2.2);
    var outer2   = debugFld ? r * 3.8 : Math.min(18, r * 3.8);
    ctx.save();
    ctx.fillStyle   = color;
    ctx.globalAlpha = alpha * 0.55 * breath;
    ctx.beginPath(); ctx.arc(pt.x, pt.y, outer1, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = alpha * 0.28 * breath;
    ctx.beginPath(); ctx.arc(pt.x, pt.y, outer2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // ── Halo — MID, with breathing ───────────────────────────────────────────

  function _drawHalo(ctx, pt, r, color, alpha) {
    var breath   = 0.80 + 0.20 * Math.sin(performance.now() * 0.0013); // ~4.8s cycle
    var debugFld = _flag('showMaritimeDebugFields', false);
    // §2 — halo ring capped at 10px; §1 — relax when debug fields enabled
    var ringR    = debugFld ? r + 3 : Math.min(10, r + 3);
    ctx.save();
    ctx.globalAlpha = alpha * 0.22 * breath;
    ctx.strokeStyle = color;
    ctx.lineWidth   = 1.5;
    ctx.beginPath(); ctx.arc(pt.x, pt.y, ringR, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  // ── Navigation lights ─────────────────────────────────────────────────────
  // Port = red (left/port), Starboard = green (right), Stern = white-blue, Mast = amber.
  // Positions derived from heading-rotated vessel space; no AIS truth is mutated.

  function _drawNavigationLights(ctx, pt, headingDeg, lenPx, widPx, tier, vesselClass, alpha, isLightOnly) {
    var isFerry   = _isFerryClass(vesselClass);
    var ferryBoost = isFerry ? 1.28 : 1.0;
    var baseAlpha  = alpha * (isLightOnly ? 1.0 : 0.88);
    var shimmer    = 0.88 + 0.12 * Math.sin(performance.now() * 0.00197); // ~3.2s shimmer
    var r          = isLightOnly ? 3.8 : Math.max(1.5, widPx * 0.13);
    var rMast      = isLightOnly ? 5.0 : Math.max(2.2, widPx * 0.20);

    // Convert vessel-local coords to screen offsets.
    // Vessel local frame: bow = (0, −lenPx/2), stern = (0, +lenPx/2),
    //   port (left) = (−widPx/2, 0), starboard (right) = (+widPx/2, 0).
    // Canvas rotation: rad = (headingDeg − 90) × π/180
    var rad = (headingDeg - 90) * Math.PI / 180;
    var cs  = Math.cos(rad);
    var sn  = Math.sin(rad);

    function _toScreen(lx, ly) {
      return { x: pt.x + cs * lx - sn * ly, y: pt.y + sn * lx + cs * ly };
    }

    var portPt  = _toScreen(-widPx * 0.60, -lenPx * 0.18);
    var stbdPt  = _toScreen( widPx * 0.60, -lenPx * 0.18);
    var sternPt = _toScreen( 0,             lenPx * 0.52);
    var mastPt  = _toScreen( 0,            -lenPx * 0.32);

    ctx.save();

    function _light(lpt, color, lr, la) {
      // Glow halo — §2 cap at 8px
      var glowR = Math.min(8, lr * 3.0);
      ctx.globalAlpha = la * 0.28 * shimmer;
      ctx.fillStyle   = color;
      ctx.beginPath(); ctx.arc(lpt.x, lpt.y, glowR, 0, Math.PI * 2); ctx.fill();
      // Core
      ctx.globalAlpha = la * shimmer;
      ctx.fillStyle   = color;
      ctx.beginPath(); ctx.arc(lpt.x, lpt.y, lr, 0, Math.PI * 2); ctx.fill();
    }

    _light(portPt,  _PAL.nav_port,      r,     baseAlpha * ferryBoost);
    _light(stbdPt,  _PAL.nav_starboard, r,     baseAlpha * ferryBoost);
    _light(sternPt, _PAL.nav_stern,     r,     baseAlpha * 0.65);
    if (isLightOnly || tier === 'HERO' || tier === 'MID') {
      _light(mastPt, _PAL.nav_mast,     rMast, baseAlpha * 0.82 * ferryBoost);
    }

    ctx.restore();

    if (isFerry) _tel.ferryEmphasisCount++;
    _tel.navLightsRendered++;
  }

  // ── Speed tail — §7 spec formula ─────────────────────────────────────────
  // tailLenPx = clamp(speedKts × 1.8, 4, 48) × tierScale
  // Extends opposite vessel heading (stern direction).

  function _drawSpeedTail(ctx, pt, headingDeg, speedKts, tier, isSynthetic, alpha, clutterPressure) {
    if (!_flag('showMaritimeSpeedTails', true)) return;
    if ((speedKts || 0) <= 1.0) return;

    var tierSc  = _tierScale[tier] || 0.65;
    var synMult = isSynthetic ? 0.55 : 1.0;
    // Clutter shortens tails slightly
    var clutterMult = clutterPressure > 0.5 ? 0.72 : 1.0;

    var tailLen = Math.min(48, Math.max(4, speedKts * 1.8)) * tierSc * synMult * clutterMult;
    if (tailLen < 3) return;

    // Tail points in reverse heading direction (stern)
    var rad = ((headingDeg + 180) - 90) * Math.PI / 180;
    var ex  = pt.x + Math.cos(rad) * tailLen;
    var ey  = pt.y + Math.sin(rad) * tailLen;

    ctx.save();
    ctx.globalAlpha = alpha * (isSynthetic ? 0.42 : 0.62);
    ctx.strokeStyle = isSynthetic ? _PAL.tail_SYN : _PAL.tail_AIS;
    ctx.lineWidth   = Math.max(1.0, tailLen * 0.04);
    ctx.lineCap     = 'round';
    ctx.beginPath();
    ctx.moveTo(pt.x, pt.y);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.restore();

    _tel.speedTailsRendered++;
  }

  // ── Anchor pin with swing radius ──────────────────────────────────────────

  function _drawAnchorPin(ctx, pt, sizePx, color, alpha) {
    var r = Math.max(3, sizePx * 0.38);
    ctx.save();
    // §1 — swing radius only in debug field mode; §2 — capped at 48px even then
    if (_flag('showMaritimeDebugFields', false)) {
      ctx.globalAlpha = alpha * 0.18;
      ctx.fillStyle   = _PAL.anchor_swing;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, Math.min(48, r * 3.5), 0, Math.PI * 2); ctx.fill();
    }
    // Outer ring — §2 capped at 14px
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = _PAL.anchor_ring;
    ctx.lineWidth   = 1.5;
    ctx.beginPath(); ctx.arc(pt.x, pt.y, Math.min(14, r + 2), 0, Math.PI * 2); ctx.stroke();
    // Core dot
    ctx.globalAlpha = alpha * 0.85;
    ctx.fillStyle   = color;
    ctx.beginPath(); ctx.arc(pt.x, pt.y, r * 0.52, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    _tel.anchoredPinsRendered++;
  }

  // ── Emergency pulse — STATUS_EMERGENCY ────────────────────────────────────

  function _drawEmergencyPulse(ctx, pt, sizePx, alpha) {
    var pulse = 0.5 + 0.5 * Math.abs(Math.sin(performance.now() * 0.006)); // ~1.7s
    var r     = Math.max(5, sizePx * 0.55);
    ctx.save();
    ctx.globalAlpha = alpha * 0.55 * pulse;
    ctx.fillStyle   = _PAL.emergency_glow;
    ctx.beginPath(); ctx.arc(pt.x, pt.y, r * 3, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = alpha * pulse;
    ctx.fillStyle   = _PAL.emergency;
    ctx.beginPath(); ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = alpha * 0.9;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  // ── Restricted ring — STATUS_RESTRICTED ───────────────────────────────────

  function _drawRestrictedRing(ctx, pt, sizePx, color, alpha) {
    var r = Math.max(4, sizePx * 0.45);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = _PAL.restricted;
    ctx.lineWidth   = 2;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.arc(pt.x, pt.y, r + 3, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = alpha * 0.75;
    ctx.fillStyle   = color;
    ctx.beginPath(); ctx.arc(pt.x, pt.y, r * 0.55, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // ── Stale marker — STATUS_STALE (no speed tail) ───────────────────────────

  function _drawStaleMarker(ctx, pt, sizePx, alpha) {
    var r = Math.max(2, sizePx * 0.35);
    ctx.save();
    ctx.globalAlpha = alpha * 0.50;
    ctx.fillStyle   = _PAL.stale;
    ctx.beginPath(); ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(100,120,135,0.40)';
    ctx.lineWidth   = 1;
    ctx.stroke();
    ctx.restore();
  }

  // ── Light only ────────────────────────────────────────────────────────────

  function _drawLightOnly(ctx, pt, tier, isSynthetic, alpha) {
    var r     = tier === 'HERO' ? 5 : tier === 'MID' ? 4 : 3;
    var color = isSynthetic ? _PAL.lightOnly_syn : _PAL.lightOnly;
    ctx.save();
    ctx.globalAlpha = alpha * 0.28;
    ctx.fillStyle   = color;
    ctx.beginPath(); ctx.arc(pt.x, pt.y, r * 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = alpha;
    ctx.fillStyle   = color;
    ctx.beginPath(); ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    _tel.lightOnlyVessels++;
  }

  // ── Faint dot — GHOST / MARKER_ONLY ──────────────────────────────────────

  function _drawFaintDot(ctx, pt, r, color, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle   = color;
    ctx.beginPath(); ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // ── Directional chevron ───────────────────────────────────────────────────

  function _drawChevron(ctx, pt, headingDeg, lenPx, widPx, color, strokeColor, alpha) {
    var rad   = (headingDeg - 90) * Math.PI / 180;
    var tipY  = -lenPx * 0.55;
    var baseY =  lenPx * 0.35;
    var halfW =  widPx * 0.50;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(pt.x, pt.y); ctx.rotate(rad);
    ctx.beginPath();
    ctx.moveTo(0, tipY);
    ctx.lineTo(-halfW, baseY);
    ctx.lineTo(0, baseY * 0.25);
    ctx.lineTo( halfW, baseY);
    ctx.closePath();
    ctx.fillStyle   = color;   ctx.fill();
    ctx.strokeStyle = strokeColor || 'rgba(255,255,255,0.45)';
    ctx.lineWidth   = 1.2;     ctx.stroke();
    ctx.restore();
  }

  // ── Silhouette outline ────────────────────────────────────────────────────

  function _drawSilhouette(ctx, pt, headingDeg, lenPx, widPx, strokeColor, alpha) {
    var rad = (headingDeg - 90) * Math.PI / 180;
    var hw  = widPx * 0.45;
    var hl  = lenPx * 0.50;
    var r   = hw * 0.6;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(pt.x, pt.y); ctx.rotate(rad);
    ctx.beginPath();
    ctx.moveTo(-hw,  hl - r);
    ctx.arcTo( -hw, -hl,  0, -hl - r, r);
    ctx.arcTo(  hw, -hl, hw,  hl - r, r);
    ctx.arcTo(  hw,  hl, -hw, hl, r);
    ctx.arcTo( -hw,  hl, -hw, hl - r, r);
    ctx.closePath();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth   = 1.5; ctx.stroke();
    ctx.restore();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // §J BOAT SPRITE PRIMITIVES
  // All sprite functions draw in LOCAL vessel space.
  // Caller _drawBoatSprite sets translate(pt.x, pt.y) + rotate(rad) before calling.
  // Local frame: bow = (0, −L/2), stern = (0, +L/2).
  // ═══════════════════════════════════════════════════════════════════════════

  // ── §PVT  ProceduralVesselTopology integration ────────────────────────────
  //
  // _pvtStyleForClass(vesselClass)
  //   Maps uppercase renderer vessel class → { hull, deck, accent, shadow, light, stroke }
  //   using the existing _PAL sprite palette.
  //
  // _drawTopologyPlan(ctx, primitives, L, W, style)
  //   Iterates emitted geometry-plan primitives and draws each in renderer local frame.
  //   Coordinate mapping (blueprint → renderer local):
  //     render_y  = (xNorm - 0.5) * L     (bow = -L/2, stern = +L/2)
  //     render_x  = (yNorm - 0.5) * W     (port = -W/2, starboard = +W/2)
  //     prim_beam = hNorm * W              (hNorm spans beam axis)
  //     prim_len  = wNorm * L              (wNorm spans length axis)

  function _pvtStyleForClass(vesselClass) {
    switch ((vesselClass || '').toUpperCase()) {
      case 'CARGO':
        return { hull: _PAL.sprite_CARGO_hull,      deck: _PAL.sprite_CARGO_deck,
                 accent: _PAL.sprite_CARGO_box,     shadow: _PAL.sprite_CARGO_deck,
                 light: '#cce0f0',                  stroke: _PAL.sprite_stroke };
      case 'TANKER':
        return { hull: _PAL.sprite_TANKER_hull,     deck: _PAL.sprite_TANKER_tank,
                 accent: '#8ab0c8',                 shadow: _PAL.sprite_TANKER_tank,
                 light: '#aecce0',                  stroke: _PAL.sprite_stroke };
      case 'FERRY':
        return { hull: _PAL.sprite_FERRY_hull,      deck: '#3a6070',
                 accent: _PAL.sprite_FERRY_cabin,   shadow: '#2a4050',
                 light: '#d8eef8',                  stroke: _PAL.sprite_stroke };
      case 'PASSENGER':
        return { hull: _PAL.sprite_PASSENGER_hull,  deck: '#3a5870',
                 accent: _PAL.sprite_PASSENGER_cabin,shadow: '#2a3a50',
                 light: '#e0f0fc',                  stroke: _PAL.sprite_stroke };
      case 'TUG':
        return { hull: _PAL.sprite_TUG_hull,        deck: _PAL.sprite_TUG_wheel,
                 accent: '#c87830',                 shadow: '#1e2c38',
                 light: '#a0c0d8',                  stroke: _PAL.sprite_stroke };
      case 'MILITARY':
        return { hull: _PAL.sprite_MIL_hull,        deck: '#303c2c',
                 accent: '#586848',                 shadow: '#202c1c',
                 light: '#788868',                  stroke: 'rgba(160,175,150,0.35)' };
      case 'FISHING':
        return { hull: '#4a5e58',                   deck: '#2e3e38',
                 accent: '#b08040',                 shadow: '#1e2e28',
                 light: '#90b8a0',                  stroke: _PAL.sprite_stroke };
      case 'RECREATIONAL':
      case 'SAILING':
        return { hull: '#5e7888',                   deck: '#3c5060',
                 accent: '#c0d8e8',                 shadow: '#283848',
                 light: '#e8f4fc',                  stroke: _PAL.sprite_stroke };
      case 'SERVICE':
      case 'PILOT':
      case 'COAST_GUARD':
      case 'SAR':
        return { hull: '#4a6870',                   deck: '#2e4850',
                 accent: '#f0a030',                 shadow: '#1e3038',
                 light: '#a8d0e0',                  stroke: _PAL.sprite_stroke };
      case 'INDUSTRIAL':
        return { hull: '#4e5860',                   deck: '#303a42',
                 accent: '#c09848',                 shadow: '#202830',
                 light: '#88a0b0',                  stroke: _PAL.sprite_stroke };
      default:
        return { hull: _PAL.sprite_DEF_hull,        deck: '#304050',
                 accent: '#789ab0',                 shadow: '#1e2e3e',
                 light: '#a0c0d8',                  stroke: _PAL.sprite_stroke };
    }
  }

  function _drawTopologyPlan(ctx, primitives, L, W, style) {
    if (!primitives || !primitives.length) return;

    var stroke = style.stroke || 'rgba(220,235,245,0.40)';

    for (var i = 0; i < primitives.length; i++) {
      var p = primitives[i];

      // Blueprint → renderer local frame
      // render_y = (xNorm-0.5)*L  (bow=-L/2, stern=+L/2)
      // render_x = (yNorm-0.5)*W  (port=-W/2, stbd=+W/2)
      var ry = (p.xNorm - 0.5) * L;
      var rx = (p.yNorm - 0.5) * W;
      var pw = p.hNorm * W;  // beam extent
      var ph = p.wNorm * L;  // length extent

      var fill = style[p.fillRole] || style.deck || '#334455';
      ctx.fillStyle   = fill;
      ctx.strokeStyle = stroke;

      switch (p.type) {

        case 'polygon':
          // Hull polygon — uses bowShoulderFrac / sternWidthFrac if present
          var bsf = (p.bowShoulderFrac !== undefined) ? p.bowShoulderFrac : 0.22;
          var swf = (p.sternWidthFrac  !== undefined) ? p.sternWidthFrac  : 0.60;
          _hullPath(ctx, ph, pw, bsf, swf);
          ctx.fill();
          ctx.lineWidth = 0.8;
          ctx.stroke();
          break;

        case 'rect':
          ctx.fillRect(rx - pw * 0.5, ry - ph * 0.5, pw, ph);
          break;

        case 'roundedRect': {
          var rr = Math.min(pw, ph) * 0.25;
          var x0 = rx - pw * 0.5; var y0 = ry - ph * 0.5;
          ctx.beginPath();
          ctx.moveTo(x0 + rr, y0);
          ctx.lineTo(x0 + pw - rr, y0);
          ctx.arcTo(x0 + pw, y0, x0 + pw, y0 + rr, rr);
          ctx.lineTo(x0 + pw, y0 + ph - rr);
          ctx.arcTo(x0 + pw, y0 + ph, x0 + pw - rr, y0 + ph, rr);
          ctx.lineTo(x0 + rr, y0 + ph);
          ctx.arcTo(x0, y0 + ph, x0, y0 + ph - rr, rr);
          ctx.lineTo(x0, y0 + rr);
          ctx.arcTo(x0, y0, x0 + rr, y0, rr);
          ctx.closePath();
          ctx.fill();
          break;
        }

        case 'circle': {
          var cr = Math.min(pw, ph) * 0.5;
          ctx.beginPath();
          ctx.arc(rx, ry, cr, 0, Math.PI * 2);
          ctx.fill();
          break;
        }

        case 'band':
          // Thin longitudinal stripe — full length, narrow beam
          ctx.fillRect(rx - pw * 0.5, ry - ph * 0.5, pw, ph);
          break;

        case 'line':
          ctx.beginPath();
          ctx.moveTo(rx, ry - ph * 0.5);
          ctx.lineTo(rx, ry + ph * 0.5);
          ctx.lineWidth = Math.max(0.8, pw);
          ctx.strokeStyle = fill;
          ctx.stroke();
          break;

        case 'stack':
          // Treat as rect (stacking handled by draw order)
          ctx.fillRect(rx - pw * 0.5, ry - ph * 0.5, pw, ph);
          break;

        default:
          ctx.fillRect(rx - pw * 0.5, ry - ph * 0.5, pw, ph);
          break;
      }
    }
  }

  // ── Shared hull outline ───────────────────────────────────────────────────
  // bowShoulderFrac: fraction of half-length where the bow shoulder widens (0..1)
  // sternWidthFrac:  stern beam as fraction of full beam (0..1)

  function _hullPath(ctx, L, W, bowShoulderFrac, sternWidthFrac) {
    var hw          = W * 0.5;
    var hl          = L * 0.5;
    var bowShoulder = -hl + L * bowShoulderFrac;
    var sternHW     = hw * sternWidthFrac;
    ctx.beginPath();
    ctx.moveTo(0,       -hl);          // bow tip
    ctx.lineTo( hw,     bowShoulder);  // starboard shoulder
    ctx.lineTo( hw,     hl * 0.60);    // starboard mid-stern
    ctx.lineTo( sternHW, hl);          // starboard stern corner
    ctx.lineTo(-sternHW, hl);          // port stern corner
    ctx.lineTo(-hw,     hl * 0.60);    // port mid-stern
    ctx.lineTo(-hw,     bowShoulder);  // port shoulder
    ctx.closePath();
  }

  // ── CARGO — container ship ────────────────────────────────────────────────

  function _spriteCargo(ctx, L, W, lod) {
    ctx.fillStyle = _PAL.sprite_CARGO_hull;
    _hullPath(ctx, L, W, 0.22, 0.55);
    ctx.fill();
    ctx.strokeStyle = _PAL.sprite_stroke;
    ctx.lineWidth   = 0.8;
    ctx.stroke();
    var hw = W * 0.5; var hl = L * 0.5;
    // Deck rectangle — visible at simple + detailed (key differentiator)
    ctx.fillStyle = _PAL.sprite_CARGO_deck;
    ctx.fillRect(-hw * 0.68, -hl * 0.50, W * 0.68, L * 0.62);
    if (lod !== 'detailed') return;
    // Container rows (2 columns × 3 rows) — detailed only
    ctx.fillStyle = _PAL.sprite_CARGO_box;
    var bw = W * 0.20; var bh = L * 0.11;
    for (var i = 0; i < 3; i++) {
      var by = -hl * 0.40 + i * (bh + L * 0.025);
      ctx.fillRect(-W * 0.30, by, bw, bh);
      ctx.fillRect( W * 0.08, by, bw, bh);
    }
  }

  // ── TANKER — liquid bulk carrier ──────────────────────────────────────────

  function _spriteTanker(ctx, L, W, lod) {
    ctx.fillStyle = _PAL.sprite_TANKER_hull;
    _hullPath(ctx, L, W, 0.25, 0.60);
    ctx.fill();
    ctx.strokeStyle = _PAL.sprite_stroke;
    ctx.lineWidth   = 0.8;
    ctx.stroke();
    var hl = L * 0.5;
    var tr = W * 0.22;
    // Centreline stripe — visible at simple + detailed (key differentiator vs cargo)
    ctx.fillStyle = _PAL.sprite_TANKER_tank;
    ctx.fillRect(-tr * 0.38, -hl * 0.42, tr * 0.76, L * 0.68);
    if (lod !== 'detailed') return;
    // Tank dome circles — detailed only
    var tankY = [-hl * 0.35, -hl * 0.05, hl * 0.26];
    for (var i = 0; i < tankY.length; i++) {
      ctx.beginPath(); ctx.arc(0, tankY[i], tr, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = _PAL.sprite_stroke; ctx.lineWidth = 0.5; ctx.stroke();
    }
  }

  // ── FERRY / PASSENGER — wide beam, prominent cabin ────────────────────────

  function _spriteFerry(ctx, L, W, lod, isPassenger) {
    ctx.fillStyle = isPassenger ? _PAL.sprite_PASSENGER_hull : _PAL.sprite_FERRY_hull;
    _hullPath(ctx, L, W, 0.18, 0.72);
    ctx.fill();
    ctx.strokeStyle = _PAL.sprite_stroke;
    ctx.lineWidth   = 0.8;
    ctx.stroke();
    if (lod !== 'detailed') return;
    // Cabin superstructure
    var hw = W * 0.5; var hl = L * 0.5;
    ctx.fillStyle = isPassenger ? _PAL.sprite_PASSENGER_cabin : _PAL.sprite_FERRY_cabin;
    var cabW = W * 0.62;
    ctx.fillRect(-cabW * 0.5, -hl * 0.22, cabW, L * 0.48);
    // Cabin window strip
    ctx.fillStyle = 'rgba(220,245,255,0.18)';
    ctx.fillRect(-cabW * 0.48, -hl * 0.14, cabW * 0.96, L * 0.06);
  }

  // ── TUG — short, high-powered work boat ───────────────────────────────────

  function _spriteTug(ctx, L, W, lod) {
    ctx.fillStyle = _PAL.sprite_TUG_hull;
    _hullPath(ctx, L, W, 0.30, 0.68);
    ctx.fill();
    ctx.strokeStyle = _PAL.sprite_stroke;
    ctx.lineWidth   = 0.8;
    ctx.stroke();
    if (lod !== 'detailed') return;
    var hl = L * 0.5;
    ctx.fillStyle = _PAL.sprite_TUG_wheel;
    var wh = W * 0.46;
    ctx.fillRect(-wh * 0.5, -hl * 0.24, wh, L * 0.32);
  }

  // ── MILITARY — angular, low profile ──────────────────────────────────────

  function _spriteMilitary(ctx, L, W, lod) {
    ctx.fillStyle = _PAL.sprite_MIL_hull;
    _hullPath(ctx, L, W, 0.20, 0.40);
    ctx.fill();
    ctx.strokeStyle = 'rgba(100,120,90,0.50)';
    ctx.lineWidth   = 0.8;
    ctx.stroke();
  }

  // ── Default — generic vessel ──────────────────────────────────────────────

  function _spriteDefault(ctx, L, W, lod) {
    ctx.fillStyle = _PAL.sprite_DEF_hull;
    _hullPath(ctx, L, W, 0.22, 0.58);
    ctx.fill();
    ctx.strokeStyle = _PAL.sprite_stroke;
    ctx.lineWidth   = 0.8;
    ctx.stroke();
  }

  // ── §0524L SERVICE — compact utility hull, visible antenna/mast ──────────

  function _spriteService(ctx, L, W, lod) {
    ctx.fillStyle = '#4a6878';
    _hullPath(ctx, L * 0.88, W * 0.78, 0.20, 0.62);
    ctx.fill();
    ctx.strokeStyle = 'rgba(185,225,242,0.65)';
    ctx.lineWidth   = 0.8;
    ctx.stroke();
    if (lod !== 'detailed') return;
    // Mast / antenna dot amidships
    var hl = L * 0.5;
    ctx.fillStyle = 'rgba(210,240,255,0.70)';
    ctx.beginPath(); ctx.arc(0, -hl * 0.10, W * 0.12, 0, Math.PI * 2); ctx.fill();
    // Utility stripe — narrow band forward of midship
    ctx.fillStyle = 'rgba(160,210,230,0.28)';
    ctx.fillRect(-W * 0.30, -hl * 0.30, W * 0.60, L * 0.18);
  }

  // ── §0524L RECREATIONAL / SAILING — narrow, pointed, minimal beam ────────

  function _spriteRecreational(ctx, L, W, lod) {
    ctx.fillStyle = '#586858';
    _hullPath(ctx, L, W * 0.55, 0.10, 0.42);
    ctx.fill();
    ctx.strokeStyle = 'rgba(185,220,185,0.70)';
    ctx.lineWidth   = 0.8;
    ctx.stroke();
    if (lod !== 'detailed') return;
    // Mast line — single vertical stroke along centreline
    var hl = L * 0.5;
    ctx.strokeStyle = 'rgba(210,240,210,0.60)';
    ctx.lineWidth   = 0.9;
    ctx.beginPath(); ctx.moveTo(0, -hl * 0.55); ctx.lineTo(0, hl * 0.18); ctx.stroke();
  }

  // ── §0524L FISHING — mid-length, wide stern, trawl-gear cue ─────────────

  function _spriteFishing(ctx, L, W, lod) {
    ctx.fillStyle = '#506258';
    _hullPath(ctx, L, W * 0.80, 0.24, 0.72);
    ctx.fill();
    ctx.strokeStyle = 'rgba(185,215,195,0.65)';
    ctx.lineWidth   = 0.8;
    ctx.stroke();
    if (lod !== 'detailed') return;
    // Trawl boom cue — horizontal bar at stern
    var hl = L * 0.5;
    ctx.strokeStyle = 'rgba(200,225,205,0.55)';
    ctx.lineWidth   = 1.0;
    ctx.beginPath(); ctx.moveTo(-W * 0.40, hl * 0.55); ctx.lineTo(W * 0.40, hl * 0.55); ctx.stroke();
    // Wheelhouse block forward
    ctx.fillStyle = 'rgba(185,215,195,0.30)';
    ctx.fillRect(-W * 0.28, -hl * 0.25, W * 0.56, L * 0.24);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // §0524H COMPACT BOAT SPRITE — zoom 10.5–13
  // Simplified hull silhouettes that read as boats, not triangles.
  // Same rotation convention as _drawBoatSprite: bow = (0, -L/2) = -Y,
  // caller sets ctx.rotate(headingDeg * Math.PI / 180).
  //
  // Per-class distinguishing shapes:
  //  CARGO       long narrow hull + dark bow stripe
  //  TANKER      long full-beam hull + light centreline stripe
  //  FERRY       wide flat-stern hull + light cabin band
  //  PASSENGER   wider ferry with additional cabin height cue
  //  TUG         short squat hull, wide stern
  //  SERVICE     compact mid-beam
  //  RECREATIONAL narrow pointed, minimal width
  //  default     medium hull
  // ═══════════════════════════════════════════════════════════════════════════

  function _compactHull(ctx, L, W, bowFrac, sternFrac) {
    // bowFrac  — fraction of half-length at bow shoulder (0 = tip, 1 = mid)
    // sternFrac — stern beam as fraction of full half-beam
    var hw = W * 0.5; var hl = L * 0.5;
    var shoulderY = -hl + L * bowFrac;
    var sHW = hw * sternFrac;
    ctx.beginPath();
    ctx.moveTo(0,     -hl);
    ctx.lineTo( hw,   shoulderY);
    ctx.lineTo( hw,   hl * 0.55);
    ctx.lineTo( sHW,  hl);
    ctx.lineTo(-sHW,  hl);
    ctx.lineTo(-hw,   hl * 0.55);
    ctx.lineTo(-hw,   shoulderY);
    ctx.closePath();
  }

  function _drawCompactBoatSprite(ctx, x, y, headingDeg, vesselClass, alpha, lenPx, widPx) {
    var L = Math.max(lenPx, 14);
    var W = Math.max(widPx, 6);
    var rad = headingDeg * Math.PI / 180; // §0524G: correct convention
    ctx.save();
    ctx.globalAlpha = Math.max(alpha, 0.82);
    ctx.translate(x, y);
    ctx.rotate(rad);

    switch (vesselClass) {

      case 'CARGO':
        // Long narrow hull (bowFrac 0.18, sternFrac 0.52) + dark bow band
        ctx.fillStyle = _PAL.sprite_CARGO_hull || '#4a6070';
        _compactHull(ctx, L, W * 0.82, 0.18, 0.52);
        ctx.fill();
        ctx.strokeStyle = _PAL.sprite_stroke || 'rgba(200,220,230,0.55)';
        ctx.lineWidth = 0.9; ctx.stroke();
        // Bow accent band
        ctx.fillStyle = _PAL.sprite_CARGO_deck || '#2d3f4a';
        ctx.fillRect(-W * 0.36, -L * 0.44, W * 0.72, L * 0.14);
        break;

      case 'TANKER':
        // Long full-beam hull + centreline stripe
        ctx.fillStyle = _PAL.sprite_TANKER_hull || '#3d5560';
        _compactHull(ctx, L, W * 0.90, 0.22, 0.58);
        ctx.fill();
        ctx.strokeStyle = _PAL.sprite_stroke || 'rgba(200,220,230,0.55)';
        ctx.lineWidth = 0.9; ctx.stroke();
        // Centreline stripe (tank cue)
        ctx.fillStyle = _PAL.sprite_TANKER_tank || 'rgba(180,210,220,0.30)';
        ctx.fillRect(-W * 0.09, -L * 0.35, W * 0.18, L * 0.60);
        break;

      case 'FERRY':
        // Wide hull, flat stern, cabin stripe
        ctx.fillStyle = _PAL.sprite_FERRY_hull || '#4e6a80';
        _compactHull(ctx, L, W * 1.05, 0.15, 0.78);
        ctx.fill();
        ctx.strokeStyle = _PAL.sprite_stroke || 'rgba(200,220,230,0.55)';
        ctx.lineWidth = 0.9; ctx.stroke();
        // Cabin stripe
        ctx.fillStyle = _PAL.sprite_FERRY_cabin || 'rgba(210,235,248,0.22)';
        ctx.fillRect(-W * 0.44, -L * 0.18, W * 0.88, L * 0.28);
        break;

      case 'PASSENGER':
        // Even wider, longer cabin band
        ctx.fillStyle = _PAL.sprite_PASSENGER_hull || '#5a7898';
        _compactHull(ctx, L, W * 1.12, 0.14, 0.80);
        ctx.fill();
        ctx.strokeStyle = _PAL.sprite_stroke || 'rgba(200,220,230,0.55)';
        ctx.lineWidth = 0.9; ctx.stroke();
        // Wide bright cabin
        ctx.fillStyle = _PAL.sprite_PASSENGER_cabin || 'rgba(220,240,255,0.28)';
        ctx.fillRect(-W * 0.50, -L * 0.22, W * 1.00, L * 0.36);
        break;

      case 'TUG':
        // Short squat, wide stern, boxy midship
        ctx.fillStyle = _PAL.sprite_TUG_hull || '#5c4f38';
        _compactHull(ctx, L * 0.80, W * 1.10, 0.28, 0.80);
        ctx.fill();
        ctx.strokeStyle = _PAL.sprite_stroke || 'rgba(200,220,230,0.55)';
        ctx.lineWidth = 0.9; ctx.stroke();
        // Wheelhouse block
        ctx.fillStyle = _PAL.sprite_TUG_wheel || '#8a7250';
        ctx.fillRect(-W * 0.32, -L * 0.28, W * 0.64, L * 0.28);
        break;

      case 'SERVICE':
      case 'PILOT':
      case 'COAST_GUARD':
      case 'SAR':
        // Compact utility hull
        ctx.fillStyle = '#4e6878';
        _compactHull(ctx, L * 0.88, W * 0.88, 0.20, 0.65);
        ctx.fill();
        ctx.strokeStyle = 'rgba(180,220,240,0.60)';
        ctx.lineWidth = 0.9; ctx.stroke();
        break;

      case 'RECREATIONAL':
      case 'SAILING':
        // Narrow pointed bow, minimal beam
        ctx.fillStyle = '#607060';
        _compactHull(ctx, L, W * 0.62, 0.10, 0.45);
        ctx.fill();
        ctx.strokeStyle = 'rgba(180,215,180,0.65)';
        ctx.lineWidth = 0.8; ctx.stroke();
        break;

      default:
        ctx.fillStyle = _PAL.sprite_DEF_hull || '#4a6070';
        _compactHull(ctx, L, W * 0.85, 0.20, 0.58);
        ctx.fill();
        ctx.strokeStyle = _PAL.sprite_stroke || 'rgba(200,220,230,0.55)';
        ctx.lineWidth = 0.9; ctx.stroke();
        break;
    }

    // Bow direction accent — small triangle tip, reinforces heading
    ctx.globalAlpha = Math.max(alpha, 0.82) * 0.65;
    ctx.fillStyle = 'rgba(210,235,248,0.70)';
    ctx.beginPath();
    ctx.moveTo(0,        -L * 0.50);
    ctx.lineTo( W * 0.22, -L * 0.28);
    ctx.lineTo(-W * 0.22, -L * 0.28);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  // ── §0524H Distant vessel light — zoom < 11.2 ───────────────────────────
  // Renders like a harbour light or star at range: 1 px bright core + faint
  // bloom halo. No filled disk, no target ring, no size cue.
  // Color is class-tinted so vessels read as warm/cool points of light.

  var _FAR_DOT_TINT = {
    CARGO:        'rgba(200,220,235,VAL)',  // cool grey-blue
    TANKER:       'rgba(210,200,180,VAL)',  // warm amber-grey
    FERRY:        'rgba(220,235,255,VAL)',  // bright cool white
    PASSENGER:    'rgba(230,240,255,VAL)',  // brightest white-blue
    TUG:          'rgba(205,195,175,VAL)',  // warm ochre
    SERVICE:      'rgba(190,215,220,VAL)',  // muted teal
    FISHING:      'rgba(200,210,190,VAL)',  // greenish
    RECREATIONAL: 'rgba(210,225,200,VAL)',  // soft green-white
    MILITARY:     'rgba(180,195,180,VAL)',  // olive
  };

  function _farDotColor(vesselClass, aStr) {
    var tpl = _FAR_DOT_TINT[vesselClass];
    if (tpl) return tpl.replace('VAL', aStr);
    return 'rgba(200,218,230,' + aStr + ')'; // default: neutral blue-grey
  }

  // §0524L — vesselSeed: deterministic phase offset per vessel (MMSI-derived).
  // Twinkle formula: alpha *= 0.75 + 0.25 * sin(seed + time * 0.001)
  // This gives each vessel its own slow (~6.3s) brightness cycle.
  function _drawValidationFarDot(ctx, pt, vesselClass, alpha, vesselSeed) {
    var coreR = 1.0;   // hard 1px max — a single harbour light point
    var haloR = 1.8;   // tight bloom, no large glow ball
    // Deterministic twinkle — slow sinusoidal brightness variation per vessel
    var seed    = vesselSeed || 0;
    var twinkle = 0.75 + 0.25 * Math.sin(seed + performance.now() * 0.001);
    // Alpha clamped to harbour-light range: 0.25–0.55 (never bright, never invisible)
    var aC = Math.min(0.55, Math.max(0.25, alpha * 0.72 * twinkle));
    var aH = Math.min(0.16, alpha * 0.14 * twinkle);
    ctx.save();
    ctx.fillStyle = _farDotColor(vesselClass, '1');
    // Halo — faint scatter only
    ctx.globalAlpha = aH;
    ctx.beginPath(); ctx.arc(pt.x, pt.y, haloR, 0, Math.PI * 2); ctx.fill();
    // Core — single bright point
    ctx.globalAlpha = aC;
    ctx.beginPath(); ctx.arc(pt.x, pt.y, coreR, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // ── §J5 Sprite dispatcher — sets up transform, dispatches by class ────────
  // Hover highlight drawn as amber ellipse ring around hull before body render.

  // ── §0524B Validation fallback boat ──────────────────────────────────────
  // Guaranteed-visible top-down glyph for validation vessels when the normal
  // sprite/chevron dispatch fails to paint (unexpected state or visClass).
  // Draws: muted hull fill · bright outline · bow triangle · tiny wake line.
  // No cyan debug circle. Uses its own fixed size so it is always legible.

  function _drawValidationFallbackBoat(ctx, x, y, headingDeg, vesselClass, alpha) {
    // §0524G — local frame: bow = (0, -L/2) = -Y.
    // Correct rotation: rad = headingDeg * π/180.
    // AIS convention: 0°=north=up, 90°=east=right.
    // Canvas: after ctx.rotate(rad), local -Y lands at screen (L·sin(rad), -L·cos(rad)).
    // headingDeg=0 → rad=0 → screen offset (0, -L) = up = north ✓
    // The former (headingDeg-90) formula yielded west for heading=0.
    var rad = headingDeg * Math.PI / 180;
    var L   = 18; // fixed fallback length px — always legible
    var W   = 8;  // fixed fallback width px

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rad);

    // Hull fill — muted maritime blue-slate matching validation vessel palette
    ctx.globalAlpha = Math.max(alpha, 0.85);
    ctx.fillStyle   = '#5f8796'; // matches isValidationVessel color floor
    ctx.beginPath();
    ctx.moveTo(0, -L * 0.50);          // bow tip
    ctx.lineTo( W * 0.50,  L * 0.28); // starboard midship
    ctx.lineTo( W * 0.38,  L * 0.50); // starboard stern corner
    ctx.lineTo(-W * 0.38,  L * 0.50); // port stern corner
    ctx.lineTo(-W * 0.50,  L * 0.28); // port midship
    ctx.closePath();
    ctx.fill();

    // Stroke — muted near-white, matches validation vessel strokeColor
    ctx.strokeStyle = 'rgba(220,238,242,0.88)';
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    // Bow triangle accent — reinforces directionality
    ctx.globalAlpha = Math.max(alpha, 0.85) * 0.70;
    ctx.fillStyle   = 'rgba(180,230,252,0.80)';
    ctx.beginPath();
    ctx.moveTo(0,        -L * 0.50);
    ctx.lineTo( W * 0.28, -L * 0.10);
    ctx.lineTo(-W * 0.28, -L * 0.10);
    ctx.closePath();
    ctx.fill();

    // Wake line behind stern — tiny V so it reads as moving
    ctx.globalAlpha = Math.max(alpha, 0.85) * 0.55;
    ctx.strokeStyle = 'rgba(160,215,240,0.70)';
    ctx.lineWidth   = 1.2;
    ctx.lineCap     = 'round';
    var wakeLen = 10;
    ctx.beginPath(); ctx.moveTo( W * 0.22, L * 0.50); ctx.lineTo( W * 0.34, L * 0.50 + wakeLen); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-W * 0.22, L * 0.50); ctx.lineTo(-W * 0.34, L * 0.50 + wakeLen); ctx.stroke();

    ctx.restore();
  }

  function _drawBoatSprite(ctx, pt, headingDeg, lenPx, widPx, vesselClass, alpha, spriteLOD, isHovered) {
    // §0524G — local frame: bow = (0, -L/2) = -Y (see §J comment block above).
    // Correct rotation: rad = headingDeg * π/180.
    // Proof: local (0, -L) → screen (L·sin(rad), -L·cos(rad)).
    //   heading=0   (N): rad=0      → (0, -L)    = up      ✓
    //   heading=90  (E): rad=π/2    → (L,  0)    = right   ✓
    //   heading=180 (S): rad=π      → (0,  L)    = down    ✓
    //   heading=270 (W): rad=3π/2   → (-L, 0)    = left    ✓
    // Former (headingDeg-90) formula shifted all headings 90° CCW (heading=0 → west).
    var rad = headingDeg * Math.PI / 180;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(pt.x, pt.y);
    ctx.rotate(rad);

    // Hover highlight ring
    if (isHovered) {
      ctx.save();
      ctx.globalAlpha = alpha * 0.38;
      ctx.strokeStyle = _PAL.sprite_hover;
      ctx.lineWidth   = 2.5;
      ctx.beginPath();
      ctx.ellipse(0, 0, Math.max(4, widPx * 0.68), Math.max(6, lenPx * 0.64), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    var L = lenPx; var W = widPx;

    // §PVT — ProceduralVesselTopology rendering path.
    // Active when SBE.ProceduralVesselTopology is loaded and spriteLOD is
    // 'simple' or 'detailed'.  Emits a geometry plan and draws it via
    // _drawTopologyPlan.  Falls through to legacy sprite switch if PVT
    // is unavailable (graceful degradation).
    var _pvt = global.SBE && global.SBE.ProceduralVesselTopology;
    if (_pvt && (spriteLOD === 'simple' || spriteLOD === 'detailed')) {
      var _pvtClass  = vesselClass ? vesselClass.toLowerCase() : 'unknown';
      var _pvtZoom   = (spriteLOD === 'detailed') ? 14.0 : 12.5;
      var _pvtTier   = (spriteLOD === 'detailed') ? 'HERO' : 'MID';
      var _pvtInst   = _pvt.createTopologyInstance({
        classKey:        _pvtClass,
        vesselSeed:      0,
        visibilityClass: 'FULL',
        zoom:            _pvtZoom,
        populationTier:  _pvtTier,
        lenPx:           L,
        beamPx:          W,
      });
      var _pvtPlan   = _pvt.emitGeometryPlan(_pvtInst);
      var _pvtStyle  = _pvtStyleForClass(vesselClass);
      _drawTopologyPlan(ctx, _pvtPlan, L, W, _pvtStyle);
      ctx.restore();
      return;
    }

    switch (vesselClass) {
      case 'CARGO':        _spriteCargo       (ctx, L, W, spriteLOD); break;
      case 'TANKER':       _spriteTanker      (ctx, L, W, spriteLOD); break;
      case 'FERRY':        _spriteFerry       (ctx, L, W, spriteLOD, false); break;
      case 'PASSENGER':    _spriteFerry       (ctx, L, W, spriteLOD, true);  break;
      case 'TUG':          _spriteTug         (ctx, L, W, spriteLOD); break;
      case 'MILITARY':     _spriteMilitary    (ctx, L, W, spriteLOD); break;
      case 'SERVICE':
      case 'PILOT':
      case 'COAST_GUARD':
      case 'SAR':          _spriteService     (ctx, L, W, spriteLOD); break;
      case 'RECREATIONAL':
      case 'SAILING':      _spriteRecreational(ctx, L, W, spriteLOD); break;
      case 'FISHING':      _spriteFishing     (ctx, L, W, spriteLOD); break;
      default:             _spriteDefault     (ctx, L, W, spriteLOD); break;
    }

    ctx.restore();
  }

  // ── §J3 Sprite wake — V-shape gradient lines behind stern ─────────────────
  // §0526A — delegates to MaritimeWakeSignature when loaded for class-distinct
  // wake identity. Falls back to a generic split-V if the system is absent.
  //
  // Signature: _drawSpriteWake(ctx, pt, headingDeg, speedKts, tier, alpha,
  //                             vesselClass?, zoom?, seed?)

  function _drawSpriteWake(ctx, pt, headingDeg, speedKts, tier, alpha,
                            vesselClass, zoom, seed) {
    if ((speedKts || 0) < 1.0) return;

    // §0526A — MaritimeWakeSignature primary path
    var _mws = global.SBE && global.SBE.MaritimeWakeSignature;
    if (_mws && _flag('showMaritimeWakeSignatures', true)) {
      _mws.drawWakeSignature(ctx, pt, headingDeg, speedKts, vesselClass, alpha, {
        zoom:          zoom  || (_frameCam && _frameCam.zoom) || 12.0,
        tier:          tier,
        seed:          seed  || 0,
        showGlow:      _flag('showMaritimeWakeGlow',        true),
        showTurb:      _flag('showMaritimeWakeTurbulence',  true),
        paletteColor:  _PAL.wake_AIS,
      });
      return;
    }

    // §J3 Legacy fallback — generic split-V (preserved as-is)
    var wakeLen     = Math.min(64, Math.max(12, speedKts * 2.8));
    var spreadAngle = 12 * Math.PI / 180;
    var sternRad    = ((headingDeg + 180) - 90) * Math.PI / 180;
    var lineW       = Math.max(1.0, speedKts * 0.09);

    ctx.save();
    ctx.lineCap = 'round';

    function _wakeLine(offset) {
      var a  = sternRad + offset;
      var ex = pt.x + Math.cos(a) * wakeLen;
      var ey = pt.y + Math.sin(a) * wakeLen;
      var g  = ctx.createLinearGradient(pt.x, pt.y, ex, ey);
      g.addColorStop(0, 'rgba(160,205,232,' + (alpha * 0.55).toFixed(2) + ')');
      g.addColorStop(1, 'rgba(120,170,200,0)');
      ctx.globalAlpha = 1;
      ctx.strokeStyle = g;
      ctx.lineWidth   = lineW;
      ctx.beginPath(); ctx.moveTo(pt.x, pt.y); ctx.lineTo(ex, ey); ctx.stroke();
    }

    _wakeLine(-spreadAngle);
    _wakeLine( spreadAngle);
    ctx.restore();
  }

  // ── §0524G Heading debug overlay ─────────────────────────────────────────
  // Activated by SBE.runtimeFlags.showMaritimeHeadingDebug = true.
  // Draws in world/screen space (no ctx.rotate). Uses the correct navigation
  // bearing→canvas formula: dx = sin(deg*π/180), dy = -cos(deg*π/180).
  // Green = bow direction, Red = stern direction, Blue = motion bearing (COG).

  function _drawHeadingDebug(ctx, pt, headingDeg, speedKts, cogDeg) {
    var bowRad   = headingDeg * Math.PI / 180;
    var sternRad = (headingDeg + 180) * Math.PI / 180;
    var cogRad   = (cogDeg != null ? cogDeg : headingDeg) * Math.PI / 180;
    var armBow   = 28;
    var armStern = 16;
    var armCog   = 22;

    // World-space bearing → canvas: dx = sin(rad), dy = -cos(rad)
    function _bx(r, arm) { return pt.x + Math.sin(r) * arm; }
    function _by(r, arm) { return pt.y - Math.cos(r) * arm; }

    ctx.save();
    ctx.globalAlpha = 1.0;
    ctx.lineWidth   = 2;
    ctx.lineCap     = 'round';

    // Green bow line
    ctx.strokeStyle = '#00e85a';
    ctx.beginPath(); ctx.moveTo(pt.x, pt.y); ctx.lineTo(_bx(bowRad, armBow), _by(bowRad, armBow)); ctx.stroke();
    // Arrowhead tip
    ctx.beginPath(); ctx.arc(_bx(bowRad, armBow), _by(bowRad, armBow), 3, 0, Math.PI * 2); ctx.fillStyle = '#00e85a'; ctx.fill();

    // Red stern line
    ctx.strokeStyle = '#ff3344';
    ctx.beginPath(); ctx.moveTo(pt.x, pt.y); ctx.lineTo(_bx(sternRad, armStern), _by(sternRad, armStern)); ctx.stroke();

    // Blue COG line (dashed) — motion direction
    if ((speedKts || 0) >= 0.5) {
      ctx.strokeStyle = '#4488ff';
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(pt.x, pt.y); ctx.lineTo(_bx(cogRad, armCog), _by(cogRad, armCog)); ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();
  }

  // ── §J5 Hover label card ──────────────────────────────────────────────────
  // Rich label shown when a vessel is hovered. Appears offset from sprite.
  // Does NOT call _drawLabel — uses its own layout for hover-specific styling.

  // §0524L — externalAlpha: 0–1 multiplier for linger fade. Omit (or pass 1) for full opacity.
  function _drawHoverLabel(ctx, pt, vessel, vesselClass, speedKts, externalAlpha) {
    var ea = (externalAlpha !== undefined && externalAlpha < 1) ? externalAlpha : 1.0;
    var name  = vessel.vesselName || vessel.name || (_classDisplayName[vesselClass] || vesselClass);
    var cls   = _classDisplayName[vesselClass] || vesselClass;
    var spd   = (speedKts || 0) > 0.5 ? cls + ' · ' + speedKts.toFixed(1) + ' kn' : cls;
    var state = (vessel.state || '').replace('STATUS_', '');
    var lines = state ? [name, spd, state] : [name, spd];

    ctx.save();
    ctx.font = 'bold 11px sans-serif';
    var maxW = 0;
    for (var i = 0; i < lines.length; i++) {
      ctx.font = i === 0 ? 'bold 11px sans-serif' : '10px sans-serif';
      var w = ctx.measureText(lines[i]).width;
      if (w > maxW) maxW = w;
    }
    var boxW = maxW + 10;
    var boxH = lines.length * 13 + 6;
    var ox   = pt.x + 14;
    var oy   = pt.y - boxH - 4;
    // Prevent overflow right — flip to left of sprite
    var canvasW = _canvas ? (_canvas.width / (window.devicePixelRatio || 1)) : 600;
    if (ox + boxW > canvasW - 4) ox = pt.x - boxW - 14;
    if (oy < 4) oy = pt.y + 8;

    ctx.globalAlpha = 0.93 * ea;
    ctx.fillStyle   = 'rgba(6,14,24,0.90)';
    if (ctx.roundRect) ctx.roundRect(ox, oy, boxW, boxH, 4);
    else               ctx.rect(ox, oy, boxW, boxH);
    ctx.fill();

    for (var j = 0; j < lines.length; j++) {
      ctx.globalAlpha = ea;
      ctx.font        = j === 0 ? 'bold 11px sans-serif' : '10px sans-serif';
      ctx.fillStyle   = j === 0 ? _PAL.sprite_hover : (j === lines.length - 1 && state ? 'rgba(150,185,205,0.80)' : 'rgba(190,215,235,0.92)');
      ctx.fillText(lines[j], ox + 5, oy + 13 + j * 13);
    }
    ctx.restore();
    _tel.labelsRendered++;
  }

  // ── §J5 Mouse tracking helpers ────────────────────────────────────────────
  // Canvas stays pointer-events:none; we track on the document and translate.

  function _onMouseMove(e) {
    if (!_canvas) { _mouseInCanvas = false; return; }
    var rect   = _canvas.getBoundingClientRect();
    _mouseX    = e.clientX - rect.left;
    _mouseY    = e.clientY - rect.top;
    _mouseInCanvas = (_mouseX >= 0 && _mouseY >= 0 &&
                      _mouseX <= rect.width && _mouseY <= rect.height);
  }

  function _attachMouseListeners() {
    if (_mouseListenerAttached) return;
    document.addEventListener('mousemove', _onMouseMove, { passive: true });
    _mouseListenerAttached = true;
  }

  function _detachMouseListeners() {
    if (!_mouseListenerAttached) return;
    document.removeEventListener('mousemove', _onMouseMove);
    _mouseListenerAttached = false;
    _mouseInCanvas = false;
  }

  // ── Validation alpha floor — §1 ──────────────────────────────────────────
  // Returns minimum alpha for seed vessels when maritimeValidationVisibility=true.
  // Returns 0 when flag is off (no-op caller pattern).

  function _validationAlphaFloor(tier, isSynthetic) {
    if (!_flag('maritimeValidationVisibility', false)) return 0;
    if (isSynthetic) return 0.45;
    switch (tier) {
      case 'HERO':       return 0.95;
      case 'MID':        return 0.82;
      case 'BACKGROUND': return 0.62;
      case 'GHOST':      return 0.38;
      default:           return 0.40;
    }
  }

  // ── Label ─────────────────────────────────────────────────────────────────

  // §2 — compact class labels for showSeedVesselLabels mode
  var _seedLabelCompact = {
    CARGO:'CARGO', TANKER:'TANKER', PASSENGER:'CRUISE', FERRY:'FERRY',
    TUG:'TUG', SERVICE:'SVC', FISHING:'FISH',
    RECREATIONAL:'REC', MILITARY:'MIL', INDUSTRIAL:'IND', UNKNOWN:'—',
  };

  var _classDisplayName = {
    CARGO:'CARGO', TANKER:'TANKER', PASSENGER:'CRUISE', FERRY:'FERRY',
    TUG:'TUG', SERVICE:'SERVICE', FISHING:'FISHING',
    RECREATIONAL:'RECR', MILITARY:'MILITARY', INDUSTRIAL:'INDUSTRIAL', UNKNOWN:'',
  };

  function _drawLabel(ctx, pt, vessel, vesselId, vesselClass, tier, alpha, isSeed, clutterPressure) {
    var flags       = SBE.runtimeFlags || {};
    var showMMSI    = !!(flags.showMaritimeDebugLabels);
    var isHeroMid   = tier === 'HERO' || tier === 'MID';
    var isBg        = tier === 'BACKGROUND';
    // §2 — compact seed labels bypass all tier gates and clutter suppression
    var seedLabels  = isSeed && !!(flags.showSeedVesselLabels);

    // Suppress background labels under clutter (bypass for seed label mode)
    if (isBg && clutterPressure > 0.65 && !seedLabels) return;

    var primary = '';
    var secondary = '';

    if (seedLabels) {
      // Compact class label for ALL seed tiers — name if available, else class short-name
      var seedName = vessel.vesselName || vessel.name || null;
      primary = seedName || (_seedLabelCompact[vesselClass] || vesselClass);
    } else if (isHeroMid) {
      var name = vessel.vesselName || vessel.name || null;
      primary = name || (_classDisplayName[vesselClass] || vesselClass);
      if (showMMSI && vessel.mmsi) secondary = String(vessel.mmsi);
    } else if (isBg) {
      primary = _classDisplayName[vesselClass] || '';
      if (!primary) return;
    } else {
      return; // GHOST: no label (unless seedLabels handled above)
    }
    if (!primary && !secondary) return;

    ctx.save();
    ctx.font = (tier === 'HERO') ? 'bold 11px sans-serif' : '10px sans-serif';

    var pw   = ctx.measureText(primary).width;
    var sw   = secondary ? ctx.measureText(secondary).width : 0;
    var boxW = Math.max(pw, sw) + 8;
    var boxH = secondary ? 26 : 15;
    var ox   = pt.x + 10;
    var oy   = pt.y - 8;

    ctx.globalAlpha = alpha * 0.88;
    ctx.fillStyle   = (tier === 'HERO') ? _PAL.label_bg_hero : _PAL.label_bg;
    if (ctx.roundRect) ctx.roundRect(ox, oy, boxW, boxH, 3);
    else               ctx.rect(ox, oy, boxW, boxH);
    ctx.fill();

    ctx.globalAlpha = alpha;
    ctx.fillStyle   = _PAL.label_name;
    ctx.fillText(primary, ox + 4, oy + 11);

    if (secondary) {
      ctx.font        = '9px monospace';
      ctx.fillStyle   = _PAL.label_class;
      ctx.globalAlpha = alpha * 0.72;
      ctx.fillText(secondary, ox + 4, oy + 22);
    }
    ctx.restore();
    _tel.labelsRendered++;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VESSEL RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  function _renderVessel(ctx, vessel, vesselId, vesselClass, provenance, atmoCtx, mpx, lod, isSeed, dt) {
    var pt = _project(vessel.lat, vessel.lng);
    if (!pt) {
      if (isSeed) _seedFrameStats.skippedProj++;
      else        _spriteTel.bodySkippedReasonCounts['no_projection'] = (_spriteTel.bodySkippedReasonCounts['no_projection'] || 0) + 1;
      return false;
    }
    if (isSeed) _seedFrameStats.projected++;
    // §0524B — count projected AIS (non-seed, non-synthetic) vessels for telemetry
    else if (provenance === 'AIS_VESSEL') _spriteTel.projectedAISCount++;

    var isSynthetic = provenance === 'SYNTHETIC_ECOLOGY';
    var isFerry     = _isFerryClass(vesselClass);

    // Tier — §0524: try/catch so a PopulationHierarchy fault cannot abort the draw loop.
    // Hard requirement: if PH fails, default to BACKGROUND and still render.
    var ph  = SBE.MaritimePopulationHierarchy;
    var tier;
    try {
      tier = isSeed
        ? (vessel.tier || 'BACKGROUND')
        : ((ph && ph.getVesselTierString(vesselId)) || 'BACKGROUND');
    } catch (e) {
      tier = 'BACKGROUND';
    }

    // Taxonomy — §0524: defensive field access. If F keys or vec entries are
    // missing/undefined, fall back to neutral values (0.5/0.5/0.4). Never let
    // a missing taxonomy field propagate NaN into atmospheric readability.
    var mtp     = SBE.MaritimeTaxonomyProfiles;
    var profile = null;
    try { profile = mtp && mtp.getTaxonomyProfile(vesselClass); } catch (e) { profile = null; }
    var F       = mtp && mtp.F;
    var taxRes  = (profile && F && F.ATMOSPHERIC_RESISTANCE != null)
                    ? (+profile.vec[F.ATMOSPHERIC_RESISTANCE] || 0.5) : 0.5;
    var taxProj = (profile && F && F.PROJECTION_WEIGHT != null)
                    ? (+profile.vec[F.PROJECTION_WEIGHT]      || 0.5) : 0.5;
    var taxLbl  = (profile && F && F.LABEL_PRIORITY    != null)
                    ? (+profile.vec[F.LABEL_PRIORITY]         || 0.4) : 0.4;

    // Atmospheric readability — §0524: wrap entire arInput construction and
    // resolveVesselReadability call in try/catch. If either throws (e.g., ph.getUpdateAdvisory
    // for an unknown vesselId, or an authority internal error), default to FULL so
    // a single broken authority cannot suppress ALL vessels in the frame.
    var ar = SBE.MaritimeAtmosphericReadability;
    var arResult = null;
    try {
      var arInput = {
        vesselId:                      vesselId,
        vesselClass:                   vesselClass,
        provenance:                    provenance,
        populationTier:                tier,
        distanceMeters:                500,
        taxonomyAtmosphericResistance: taxRes,
        taxonomyProjectionWeight:      taxProj,
        taxonomyLabelPriority:         taxLbl,
        updateAdvisory:               (ph && !isSeed && ph.getUpdateAdvisory && ph.getUpdateAdvisory(vesselId)) || 'UPDATE_STANDARD',
      };
      arResult = ar ? ar.resolveVesselReadability(arInput, atmoCtx) : null;
    } catch (e) {
      arResult = null; // → visClass = 'FULL', alpha = 1.0 below
    }
    var visClass  = arResult ? arResult.visibilityClass            : 'FULL';
    var alpha     = arResult ? arResult.atmosphericAlphaMultiplier  : 1.0;
    var labelOk   = arResult ? arResult.labelReadable               : isHeroMidTier(tier);

    function isHeroMidTier(t) { return t === 'HERO' || t === 'MID'; }

    // §V — validation feed vessels always receive labels regardless of tier.
    // MMSI range 999001001–999001035 is the MaritimeValidationFeed namespace.
    // This is renderer-local only; no authority state is mutated.
    var isValidationVessel = !isSeed &&
      vessel.mmsi >= VALIDATION_MMSI_MIN && vessel.mmsi <= VALIDATION_MMSI_MAX;
    if (isValidationVessel) labelOk = true;

    // §0524F — render-only tier.
    // Validation MMSIs are unknown to PopulationHierarchy, which returns GHOST for
    // any unregistered vesselId. GHOST routes to the dot/faint-dot branch before any
    // LOD or sprite override can apply, making validation vessels invisible as dots.
    // Promote to BACKGROUND locally for all draw-dispatch decisions.
    // The raw `tier` variable is preserved and still passed to AR (line above), so no
    // authority state is mutated.
    var renderTier = tier;
    if (isValidationVessel && renderTier === 'GHOST') {
      renderTier = 'BACKGROUND';
      _spriteTel.validationGhostTierPromoted++;
    }

    // §0524C — validation LOD override.
    // Dot LOD reduces all vessels to tiny markers regardless of class/tier.
    // Validation vessels must always show as boat-shaped glyphs.
    // Override: if zoom >= 10.8, reroute from 'dot' to the FULL/REDUCED sprite dispatch.
    //           if zoom <  10.8, reroute to 'chevron' (compact directional arrow, still shaped).
    // In both cases lod is no longer 'dot', so the dot/GHOST/MARKER_ONLY branch is skipped.
    if (isValidationVessel && lod === 'dot') {
      lod = 'chevron'; // routes to FULL/REDUCED else branch (sprite or shaped chevron)
      _spriteTel.validationDotSuppressed++;
    }

    if (!isSeed) {
      var budget = (ph && ph.getAlphaBudget(vesselId)) || 1.0;
      alpha = Math.min(alpha, budget);
    }
    if (isSynthetic) alpha *= _PAL.SYNTHETIC_ALPHA;

    // Atmospheric hidden — skip draw
    // §1 validation mode: override to SILHOUETTE so seed vessels remain auditable
    // §K / §0524 validation AIS override: validation feed vessels (MMSI 999001xxx)
    //    must never be fully suppressed. If AR returns ATMOSPHERIC_HIDDEN, promote
    //    to REDUCED. Renderer-local only; no authority state is mutated.
    if (visClass === 'ATMOSPHERIC_HIDDEN') {
      _tel.atmosphericHidden++;
      if (isSeed) _seedFrameStats.hiddenAtmo++;
      if (isSeed && _flag('maritimeValidationVisibility', false)) {
        visClass = 'SILHOUETTE';
      } else if (isValidationVessel) {
        visClass = 'REDUCED';
        alpha    = Math.max(alpha, 0.35);
      } else {
        return false;
      }
    }

    // §0524 hard requirement — unconditional validation vessel floor.
    // Applied AFTER all AR processing so no AR output (including unexpected visClass
    // values beyond ATMOSPHERIC_HIDDEN) can result in near-zero alpha for validation
    // vessels. "If vessel projection succeeds, draw something."
    if (isValidationVessel) {
      if (visClass === 'ATMOSPHERIC_HIDDEN') visClass = 'REDUCED'; // belt-and-suspenders
      // §0524D — pitch ≥ 20 causes AR to return SILHOUETTE (tactical-symbol mode).
      // The SILHOUETTE branch draws a chevron, not a boat sprite, at any pitch.
      // At zoom ≥ 10.8 validation vessels must show as boat glyphs; promote to REDUCED
      // so they fall through to the sprite dispatch (else branch), where sl='symbolic'
      // is then overridden to 'simple' by the validationSpriteForced check.
      // Also promote MARKER_ONLY — same consequence (dot marker instead of glyph).
      if (_frameCam.zoom >= 10.8 &&
          (visClass === 'SILHOUETTE' || visClass === 'MARKER_ONLY')) {
        visClass = 'REDUCED';
        _spriteTel.validationDotSuppressed++;
        _spriteTel.validationSilhouettePromoted++; // §0524E proof: intercept happened
      }
      alpha = Math.max(alpha, 0.35);
    }

    // Renderer-local alpha smoothing (visual only, not truth)
    var smoothAlpha = _smoothAlpha(vesselId, alpha, dt || (1/60));
    // §1 — validation floor applied before fade-in culling so seeds are never
    // culled during the first few frames of animation.
    if (isSeed && _flag('maritimeValidationVisibility', false)) {
      smoothAlpha = Math.max(smoothAlpha, _validationAlphaFloor(tier, isSynthetic));
    }
    // §0524 — validation AIS vessels also get a smoothAlpha floor so fade-in cannot
    // cull them on the first frame (glyphState starts at targetAlpha * 0.01).
    if (isValidationVessel) smoothAlpha = Math.max(smoothAlpha, 0.10);
    if (smoothAlpha < 0.01) return false;
    alpha = smoothAlpha;

    // Pixel dimensions
    // §II: pass vessel so actual AISRuntime dimensions are preferred over class table
    var px      = _vesselPx(vesselClass, renderTier, mpx, vessel);
    var lenPx   = px.lenPx;
    var widPx   = px.widPx;
    var sizePx  = (lenPx + widPx) * 0.5;

    var heading  = vessel.trueHeading || vessel.headingDeg || vessel.heading || 0;
    // §II: AISRuntime stores speed as vessel.speedKnots; seed/synthetic use speedKts or sog
    var speedKts = vessel.speedKnots  || vessel.speedKts   || vessel.sog    || 0;
    var state    = vessel.state || '';
    var clutter  = atmoCtx.clutterPressure || 0;

    // Colors — §3 seed tint in validation mode (warm maritime, not debug-neon)
    var isValSeed   = isSeed && _flag('maritimeValidationVisibility', false);
    var baseKey     = isSynthetic ? ('syn_' + renderTier) : (isValSeed ? ('seed_' + renderTier) : renderTier);
    var color       = _PAL[baseKey] || _PAL.BACKGROUND;
    var strokeColor = isSynthetic ? _PAL.syn_stroke
                    : isValSeed   ? _PAL.seed_stroke
                    : (_PAL['stroke_' + renderTier] || 'rgba(180,200,220,0.4)');

    var underway = _isUnderway(vessel);
    var isStatic = _isStatic(vessel);
    var isLightOnly = visClass === 'LIGHT_ONLY';

    // ── VesselVisualProfile — class-based color identity ─────────────────────
    // Resolve once per vessel. Both geo hull (pitch >= 28°) and sprite dispatch
    // (pitch < 28°) consume identical class-identity colours from the shared
    // VVP authority. White defaults are replaced; white is reserved for
    // hover/selection/emergency/debug only.
    // Excluded: validation vessels (get forced maritime grey at line ~2044),
    //           seed vessels (carry their own seed_stroke palette tint),
    //           lightOnly (point lights have no hull colour).
    var _vvp = global.SBE && global.SBE.VesselVisualProfile;
    var _vesselProfile = null;
    if (_vvp && !isValidationVessel && !isSeed && !isLightOnly) {
      try {
        _vesselProfile = _vvp.resolveProfile(vessel, _frameCam, {
          classKey:    vesselClass,
          lod:         lod,
          source:      isSynthetic ? 'synthetic' : 'ais',
          hovered:     isHovered,
          isStatic:    isStatic,
          isLightOnly: isLightOnly,
          isEmergency: state === 'STATUS_EMERGENCY',
          lenPxHint:   lenPx,
        });
        color       = _vesselProfile.hullColor;
        strokeColor = _vesselProfile.strokeColor;
      } catch (e) {
        _vesselProfile = null;
        // colour falls back to PAL-based values assigned above
      }
    }

    // §5 — enforce minimum directional glyph size for underway vessels so
    // they read as ticks along corridors rather than point-cluster dots.
    if (underway) {
      lenPx  = Math.max(8, lenPx);
      widPx  = Math.max(4, widPx);
      sizePx = (lenPx + widPx) * 0.5;
    }
    // §1 validation — boosted minimums for seed vessel audit pass.
    // Underway: 14×6px minimum; static: sizePx≥14 → anchor pin r≥5.
    if (isSeed && _flag('maritimeValidationVisibility', false)) {
      if (underway) {
        lenPx  = Math.max(14, lenPx);
        widPx  = Math.max(6,  widPx);
        sizePx = (lenPx + widPx) * 0.5;
      } else {
        sizePx = Math.max(14, sizePx); // anchor pin r = max(3, sizePx*0.38) → r≥5
      }
    }

    // §III — Render mode size bounds.
    // tactical-symbol: cap underway chevrons at 24×12px — pitch-stable symbol.
    //   The chevron is already screen-space; the cap prevents it reading as a
    //   scaled hull at close zoom, which would skew under pitch.
    // hull-proxy: allow larger sizes but cap lenPx ≤ 60px and enforce 3:1
    //   aspect ratio max so the capsule cannot become an unrealistic "fridge ship"
    //   (occurs when lenPx >> widPx on a nearly-vertical heading at any tilt).
    var rm = _currentRenderMode;
    if (underway) {
      if (rm === 'tactical-symbol') {
        lenPx  = Math.min(24, lenPx);
        widPx  = Math.min(12, widPx);
        sizePx = (lenPx + widPx) * 0.5;
      } else {
        // hull-proxy — prevent exaggerated hull elongation
        lenPx  = Math.min(60, lenPx);
        widPx  = Math.min(lenPx / 3, widPx); // cap aspect ratio at 3:1
        sizePx = (lenPx + widPx) * 0.5;
      }
    }

    // §0524 / §0524C — validation vessel hard floors applied after all LOD/mode caps.
    // Size floors ensure glyphs are always legible. Colors are muted maritime, not debug-neon.
    if (isValidationVessel) {
      alpha  = Math.max(alpha, 0.85);
      lenPx  = Math.max(lenPx, 22);
      widPx  = Math.max(widPx, 9);
      sizePx = Math.max((lenPx + widPx) * 0.5, 16);
      // Muted maritime palette — hull grey-blue, near-white stroke, no cyan Christmas lights
      color       = '#5f8796';                  // muted maritime blue-grey
      strokeColor = 'rgba(220,238,242,0.88)';   // soft near-white stroke
    }

    // ── Emergency override ─────────────────────────────────────────────────
    if (state === 'STATUS_EMERGENCY') {
      _drawEmergencyPulse(ctx, pt, sizePx, alpha);
      return true;
    }

    // ── Hard pitch gate — geo-projected hull at pitch >= 28° ─────────────
    // At pitch >= 28° ALL physical vessel bodies must use geo-projected hull
    // geometry regardless of motion state. Moored/anchored/stopped ships are
    // just as long and just as incorrectly oriented when drawn as screen-space
    // ovals or anchor pins — a 300m cruise ship lying broadside to the dock
    // reads as a round blob, not a ship.
    //
    // The fix: compute hull corners in geographic space (_geoBearingOffset),
    // then project each corner through Mapbox.project(). The resulting polygon
    // lies flat on the water plane because the pitch/tilt is baked in by
    // Mapbox's own projection, not by canvas transform.
    //
    // Inside the gate:
    //   projected hull length >= 4px → geo hull polygon  (geoHull)
    //   projected hull length  < 4px → orientation-agnostic far dot  (farDot)
    //   No _drawChevron(), no ctx.rotate(), no anchor pin at pitch >= 28°.
    //
    // Heading for static vessels:
    //   Use vessel.trueHeading / headingDeg / heading if non-zero.
    //   Fall back to 0 (north-aligned) — a flat north-aligned hull is still
    //   correct in 3D space; it only looks misaligned if the vessel is docked
    //   at an angle, which is rare and preferable to an upright blob.
    //
    // Sole exemption: lightOnly — point lights are orientation-agnostic.
    // Emergency pulse is dispatched before this gate (returns early above).
    var _morPitch   = _frameCam.pitch || 0;
    var _morMmsiKey = String(vessel.mmsi || vesselId);

    if (_morPitch >= 28 && !isLightOnly) {
      // Resolve meter dimensions — prefer AISRuntime actual dims, fall back to class table
      var _geoLenM = (vessel.lengthMeters > 0 ? vessel.lengthMeters : (_classSize[vesselClass] || _classSize.UNKNOWN).len);
      var _geoWidM = (vessel.widthMeters  > 0 ? vessel.widthMeters  : (_classSize[vesselClass] || _classSize.UNKNOWN).wid);
      // Class-specific L/W multipliers — same table as MarineRenderer for consistency
      switch ((vesselClass || '').toUpperCase()) {
        case 'CARGO':
        case 'MILITARY':   _geoLenM *= 1.35; _geoWidM *= 0.70; break;
        case 'TANKER':     _geoLenM *= 1.35; _geoWidM *= 0.70; break;
        case 'FERRY':
        case 'PASSENGER':  _geoLenM *= 1.05; _geoWidM *= 1.15; break;
        case 'TUG':
        case 'SERVICE':
        case 'PILOT':      _geoLenM *= 0.80; _geoWidM *= 0.90; break;
        case 'INDUSTRIAL': _geoLenM *= 1.60; _geoWidM *= 0.45; break;
        // FISHING/RECREATIONAL/UNKNOWN — use dimensions as-is
      }

      // Heading for geo hull:
      //   underway  → `heading` already resolved above (trueHeading || headingDeg || cog || 0)
      //   static    → prefer trueHeading if non-zero; fall back to 0 (north-aligned flat hull)
      //               A north-aligned hull on a tilted plane is always more correct than an
      //               upright oval/anchor pin that ignores the water plane entirely.
      var _geoHdg = heading; // already computed: vessel.trueHeading || headingDeg || heading || 0
      if (isStatic && _geoHdg === 0) {
        // Try additional heading fields that static AIS vessels sometimes carry
        _geoHdg = vessel.heading || vessel.cog || vessel.courseOverGround || 0;
      }

      // Check projected hull length: geo polygon vs orientation-agnostic dot
      var _morMpx   = _metersPerPixel();
      var _geoLenPx = _geoLenM / Math.max(0.001, _morMpx);

      if (_geoLenPx >= 4) {
        // Geo-projected hull — pitch already baked in by Mapbox.project()
        // Pass _vesselProfile for optional centerline/deck detail at lenPx >= 10/24.
        _drawMORGroundedHullWithDetail(ctx, vessel.lat, vessel.lng, _geoHdg, _geoLenM, _geoWidM, color, strokeColor, alpha, _vesselProfile, _geoLenPx);
        _lastMORBranches[_morMmsiKey] = { mmsi: vessel.mmsi || vesselId, lod: lod, pitch: _morPitch, branch: 'geoHull' };
      } else {
        // Too far for a readable hull — orientation-agnostic far dot.
        // No chevron, no anchor pin, no directional marker at pitch >= 28°.
        var _farDotR = renderTier === 'HERO' ? 3.5 : renderTier === 'MID' ? 2.5 : 1.8;
        _drawFaintDot(ctx, pt, _farDotR, color, alpha);
        _lastMORBranches[_morMmsiKey] = { mmsi: vessel.mmsi || vesselId, lod: lod, pitch: _morPitch, branch: 'farDot' };
      }

      _spriteTel.bodyDrawSuccessCount++;
      _tel.aisRendered++;
      return true;
    }

    // Record branch for vessels at low pitch (standard dispatch below).
    // staticPin / lightOnly / sprite are orientation-safe at pitch < 28°.
    var _morFallBranch = isStatic ? 'staticPin' : isLightOnly ? 'lightOnly' : (lod === 'dot' ? 'dot' : 'sprite');
    _lastMORBranches[_morMmsiKey] = { mmsi: vessel.mmsi || vesselId, lod: lod, pitch: _morPitch, branch: _morFallBranch };

    // ── §0526E  Distance Atmosphere Envelope ───────────────────────────────
    // Resolved once per vessel per frame. Provides per-band alpha multipliers,
    // LOD hints, and allow-flags for wake/labels/hover/lights.
    // Validation vessels are excluded — they have hard floors that must not be
    // further suppressed by distance compression.
    var _mda = global.SBE && global.SBE.MaritimeDistanceAtmosphere;
    var _distEnv = null;
    if (_mda && !isValidationVessel) {
      try {
        var _canvas = (typeof document !== 'undefined')
          ? (document.getElementById('mapOverlay') || document.getElementsByTagName('canvas')[0])
          : null;
        _distEnv = _mda.resolveDistanceEnvelope({
          vesselId:        vesselId,
          vesselClass:     (vesselClass || 'unknown').toLowerCase(),
          populationTier:  renderTier,
          screenX:         pt.x,
          screenY:         pt.y,
          viewportWidth:   (_canvas ? _canvas.width  : (typeof window !== 'undefined' ? window.innerWidth  : 800)),
          viewportHeight:  (_canvas ? _canvas.height : (typeof window !== 'undefined' ? window.innerHeight : 600)),
          zoom:            _frameCam.zoom,
          visibilityClass: visClass || null,
          fogAlpha:        atmoCtx ? (atmoCtx.fogAlpha      || 0) : 0,
          hazeAlpha:       atmoCtx ? (atmoCtx.hazeAlpha     || 0) : 0,
          densityPressure: atmoCtx ? (atmoCtx.clutterPressure || 0) : 0,
        });
        // Apply vesselAlpha as a further reduction (distance may only suppress)
        alpha = alpha * _distEnv.vesselAlpha;
      } catch (e) {
        _distEnv = null; // envelope failure must never break vessel render
      }
    }
    // If envelope was not resolved, use neutral pass-through values
    var _dWakeAlpha   = _distEnv ? _distEnv.wakeAlpha   : 1.0;
    var _dAllowWake   = _distEnv ? _distEnv.allowWake    : true;
    var _dAllowLabel  = _distEnv ? _distEnv.allowLabel   : true;
    var _dAllowHover  = _distEnv ? _distEnv.allowHover   : true;
    var _dNavLights   = _distEnv ? _distEnv.allowNavLights : true;
    var _dFarLight    = _distEnv ? _distEnv.allowFarLight : true;
    // Re-check alpha floor after distance reduction
    if (!isValidationVessel && alpha < 0.02) return false;

    // ── §0526F  Light Authority Envelope ──────────────────────────────────
    // Resolved once per vessel per frame alongside the distance envelope.
    // Provides deterministic pulse/shimmer, class-specific nav alpha, bloom,
    // far-glint, and allow-flags. Advisory only — renderer drives draw calls.
    var _mla       = global.SBE && global.SBE.MaritimeLightAuthority;
    var _lightEnv  = null;
    if (_mla && !isValidationVessel) {
      try {
        _lightEnv = _mla.resolveLightEnvelope({
          vesselId:        vesselId,
          mmsi:            vessel.mmsi || null,
          vesselClass:     vesselClass || 'unknown',
          vesselState:     state || null,
          headingDeg:      heading,
          speedKts:        speedKts,
          zoom:            _frameCam.zoom,
          nowMs:           (typeof performance !== 'undefined' && performance.now)
                             ? performance.now() : Date.now(),
          visibilityClass: visClass || null,
          distanceEnvelope:_distEnv,
          fogAlpha:        atmoCtx ? (atmoCtx.fogAlpha      || 0) : 0,
          hazeAlpha:       atmoCtx ? (atmoCtx.hazeAlpha     || 0) : 0,
          densityPressure: atmoCtx ? (atmoCtx.clutterPressure || 0) : 0,
          timeOfDay:       atmoCtx ? (atmoCtx.timeOfDay      || null) : null,
        });
      } catch (e) {
        _lightEnv = null; // light authority failure must never break vessel render
      }
    }
    // ── §0526H  Silhouette Differentiation Profile ─────────────────────────
    // Resolved once per vessel per frame. Provides class-specific readability
    // weights: wakeReadabilityScale multiplies wake alpha; other fields are
    // advisory hints for future topology/light integration.
    // Validation vessels receive immune bypass profile (full readability, no degradation).
    var _msil     = global.SBE && global.SBE.MaritimeSilhouetteDifferentiation;
    var _silProf  = null;
    if (_msil) {
      try {
        _silProf = _msil.resolveSilhouetteProfile({
          vesselId:          vesselId,
          vesselClass:       (vesselClass || 'unknown').toLowerCase(),
          vesselState:       state || null,
          speedKts:          speedKts,
          headingDeg:        heading,
          distanceBand:      _distBand || 'MID',
          visibilityClass:   visClass  || 'FULL',
          isValidationEntity:isValidationVessel === true,
        });
      } catch (e) {
        _silProf = null; // profile failure must never break vessel render
      }
    }
    // Wake readability scale — multiplied with distance wake alpha
    var _silWakeScale = _silProf ? _silProf.wakeReadabilityScale : 1.0;

    // Light authority allow-flags — neutral pass-through when envelope not resolved
    var _lAllowNavPair  = _lightEnv ? _lightEnv.allowNavPair  : true;
    var _lAllowMast     = _lightEnv ? _lightEnv.allowMastLight : true;
    var _lAllowFarGlint = _lightEnv ? _lightEnv.allowFarGlint  : true;
    var _lAllowBloom    = _lightEnv ? _lightEnv.allowBloom     : false;
    var _lNavAlpha      = _lightEnv ? _lightEnv.navAlpha       : null; // null = use existing calc
    var _lFarAlpha      = _lightEnv ? _lightEnv.farAlpha       : null;
    var _lPulseValue    = _lightEnv ? _lightEnv.pulseValue     : 1.0;

    // ── §0526G  Visual Tuning Pass ─────────────────────────────────────────
    // Change 1: reduce hull/body alpha at FAR and ATMOSPHERIC bands.
    //   Lights are not reduced here — they carry their own alpha from _lightEnv.
    //   Validation vessels bypass all tuning reductions.
    // Change 2: at FAR/ATMOSPHERIC, prefer light/marker presentation over
    //   detailed sprites. _forceLightPresentation gates the sprite dispatch.
    var _distBand = _distEnv ? _distEnv.band : null;
    if (!isValidationVessel && _distBand) {
      if (_distBand === 'FAR')         alpha = alpha * 0.70;
      else if (_distBand === 'ATMOSPHERIC') alpha = alpha * 0.35;
    }
    // LIGHT_ONLY hull alpha collapses to zero naturally via isLightOnly dispatch,
    // but explicitly guard here so any stray hull path draws nothing.
    if (isLightOnly && !isValidationVessel) alpha = Math.min(alpha, 0.0);
    // Re-check floor (allow zero — light-only vessels still render via _drawLightOnly)
    if (!isValidationVessel && !isLightOnly && alpha < 0.02) return false;

    // Force marker/light presentation for FAR and ATMOSPHERIC bands.
    // Preserves allowFarGlint. Does not mutate AIS/runtime state.
    var _forceLightPresentation = !isValidationVessel &&
      (_distBand === 'FAR' || _distBand === 'ATMOSPHERIC');

    // ── Glow / halo rings (below chevron) ──────────────────────────────────
    if (lod === 'full' && !isSynthetic) {
      if (renderTier === 'HERO') _drawGlowRing(ctx, pt, sizePx * 0.5, _PAL.glow_HERO, alpha);
      else if (renderTier === 'MID') _drawHalo(ctx, pt, sizePx * 0.5, _PAL.glow_MID, alpha);
    }

    // Hoist isHovered so both the validation fast path and standard dispatch can use it.
    var isHovered = (vesselId === _hoveredVesselId);

    // ── State visual dispatch ──────────────────────────────────────────────
    // §0524B — track whether the dispatch branch actually painted something.
    // bodyDrawn = false means the vessel passed all gates but no paint call fired.
    // Validation vessels that remain false after dispatch get the fallback primitive.
    _spriteTel.bodyDrawAttemptCount++;
    var bodyDrawn = false;

    // §0524H — Validation vessel LOD fast path.
    // Replaces the entire standard dispatch chain for validation MMSIs on the body draw.
    // Standard dispatch leaks validation vessels into triangle/chevron paths via:
    //   lod==='dot' branch (zoom out → LOD_DOT_MPX), SILHOUETTE branch (pitch≥20°),
    //   and the FULL/REDUCED chevron sub-branch (_currentSpriteLOD 'chevron'/'symbolic').
    // Policy:
    //   zoom ≥ 13.2  → full/simple class boat sprite (_drawBoatSprite)
    //   zoom 11.2–13.2 → compact class boat sprite (_drawCompactBoatSprite)
    //   zoom < 11.2  → tiny signal dot, no direction marker, no triangle
    // Status overrides (RESTRICTED, STALE, DORMANT, FORCED_COAST, EMERGENCY) are
    // intentionally excluded so they still flow through the standard branches.
    if (isValidationVessel && !isLightOnly &&
        state !== 'STATUS_RESTRICTED' && state !== 'STATUS_STALE' &&
        state !== 'STATUS_DORMANT'    && state !== 'STATUS_FORCED_COAST') {

      var vZoom = _frameCam.zoom;

      if (vZoom >= 13.2) {
        // Full sprite — same path as standard dispatch, but guaranteed (no chevron escape)
        var vSL = (_currentSpriteLOD === 'detailed') ? 'detailed' : 'simple';
        if (underway) _drawSpriteWake(ctx, pt, heading, speedKts, renderTier, alpha, vesselClass, vZoom);
        _drawBoatSprite(ctx, pt, heading, lenPx, widPx, vesselClass, alpha, vSL, isHovered);
        _spriteTel.spriteRendered++;
        _spriteTel.validationSimpleSpriteDrawn++;
        _spriteTel.validationSpriteBranchEntered++;
        // §0524G heading debug
        _dbgSampleHeadingDeg       = heading;
        _dbgSampleSpriteRotRad     = heading * Math.PI / 180;
        _dbgSampleMotionBearingDeg = vessel.cog || vessel.courseOverGround || heading;
        if (_flag('showMaritimeHeadingDebug', false)) {
          _drawHeadingDebug(ctx, pt, heading, speedKts, _dbgSampleMotionBearingDeg);
        }

      } else if (vZoom >= 11.2) {
        // Compact sprite — clamped to small readable size, class-silhouette hull, no triangle
        // §0524H size clamp: compact sprites must not scale up to fill the screen.
        var cLen = Math.min(Math.max(lenPx, 8),  18); // 8–18 px
        var cWid = Math.min(Math.max(widPx, 3),   7); // 3–7 px
        // §0524L — small wake streak only at zoom ≥ 11.8 where motion reads clearly
        if (underway && vZoom >= 11.8) {
          _drawSpriteWake(ctx, pt, heading, speedKts, renderTier, alpha * 0.55, vesselClass, vZoom);
        }
        _drawCompactBoatSprite(ctx, pt.x, pt.y, heading, vesselClass, alpha, cLen, cWid);
        _spriteTel.compactSpriteRendered++;
        _spriteTel.chevronSuppressedForValidation++;
        _spriteTel.oversizedFarDotPrevented++;

      } else {
        // Tiny signal dot — zoom < 11.2, harbour-light twinkle, no hull, no direction marker
        // §0524L — deterministic per-vessel seed from MMSI so each vessel has its own twinkle phase
        var vSeed = ((vessel.mmsi || 0) % 97) * (Math.PI * 2 / 97);
        _drawValidationFarDot(ctx, pt, vesselClass, alpha, vSeed);
        _spriteTel.farDotRendered++;
        _spriteTel.tinyLightDotRendered++;
        _spriteTel.chevronSuppressedForValidation++;
      }

      bodyDrawn = true;
    }

    if (!bodyDrawn) { // standard dispatch for non-validation vessels and status overrides

    if (isLightOnly) {
      // §0526F — scale light-only alpha by light authority farAlpha * pulseValue
      var _lightOnlyAlpha = (_lFarAlpha !== null)
        ? Math.min(alpha, _lFarAlpha * _lPulseValue * 1.15)
        : alpha;
      _drawLightOnly(ctx, pt, tier, isSynthetic, _lightOnlyAlpha);
      if (_lAllowNavPair && _shouldShowNavLights(visClass, atmoCtx) && underway) {
        var _loNavA = (_lNavAlpha !== null) ? Math.min(alpha, _lNavAlpha * _lPulseValue) : alpha;
        _drawNavigationLights(ctx, pt, heading, lenPx, widPx, tier, vesselClass, _loNavA, true);
      }
      bodyDrawn = true;

    } else if (state === 'STATUS_RESTRICTED') {
      _drawRestrictedRing(ctx, pt, sizePx, color, alpha);
      bodyDrawn = true;

    } else if (state === 'STATUS_STALE' || state === 'STATUS_DORMANT') {
      _drawStaleMarker(ctx, pt, sizePx, state === 'STATUS_DORMANT' ? alpha * 0.45 : alpha);
      bodyDrawn = true;

    } else if (state === 'STATUS_FORCED_COAST') {
      // Fading appearance — treat like light only
      _drawLightOnly(ctx, pt, tier, isSynthetic, alpha * 0.60);
      bodyDrawn = true;

    } else if (lod === 'dot' || visClass === 'MARKER_ONLY' || renderTier === 'GHOST') {
      // §5 — underway non-GHOST vessels get a mini directional chevron even at
      // city zoom-out, so they read as corridor ticks rather than colored blobs.
      // §0524F — validation vessels use renderTier (GHOST promoted to BACKGROUND above),
      // so renderTier === 'GHOST' is never true for validation vessels.
      if (isValidationVessel) {
        // §0524E — validation vessel reached dot/GHOST/MARKER_ONLY branch; log reason
        // After §0524F, tier_GHOST should never appear here for validation vessels.
        var _vBranchSkip = (lod === 'dot') ? 'lod_dot'
                         : (visClass === 'MARKER_ONLY') ? 'visClass_MARKER_ONLY'
                         : 'renderTier_GHOST_unexpected';
        _spriteTel.validationSpriteBranchSkippedReason[_vBranchSkip] =
          (_spriteTel.validationSpriteBranchSkippedReason[_vBranchSkip] || 0) + 1;
      }
      if (underway && renderTier !== 'GHOST' && visClass !== 'MARKER_ONLY') {
        _drawChevron(ctx, pt, heading, lenPx, widPx, color, strokeColor, alpha * 0.85);
        if (isValidationVessel) _spriteTel.validationChevronDrawn++; // §0524E
      } else {
        var dotR = renderTier === 'HERO' ? 4 : renderTier === 'MID' ? 3 : renderTier === 'BACKGROUND' ? 2.5 : 1.8;
        // §1 validation — GHOST min dot radius 3px
        if (isSeed && _flag('maritimeValidationVisibility', false)) dotR = Math.max(3, dotR);
        _drawFaintDot(ctx, pt, dotR, color, alpha * (renderTier === 'GHOST' ? 0.42 : 1.0));
        if (isValidationVessel) _spriteTel.validationDotDrawn++; // §0524E
      }
      bodyDrawn = true;

    } else if (isStatic) {
      _drawAnchorPin(ctx, pt, sizePx, color, alpha);
      // §C — minimal anchor/mooring light at dusk/night (spec §5: "docked pin + minimal light")
      // Traditional: white 360° anchor light centred above the pin. Not underway, not colored.
      if (_flag('showMaritimeNavLights', true)) {
        var sTod = atmoCtx.timeOfDay;
        if (sTod === 'NIGHT' || sTod === 'DUSK') {
          var anchorGlowR = Math.min(6, sizePx * 0.22);
          var anchorLightAlpha = alpha * (sTod === 'NIGHT' ? 0.72 : 0.48);
          var anchorLightPt = { x: pt.x, y: pt.y - Math.max(4, sizePx * 0.30) };
          // Soft glow halo
          ctx.save();
          ctx.globalAlpha = anchorLightAlpha * 0.28;
          ctx.fillStyle   = _PAL.nav_stern; // white-blue anchor light
          ctx.beginPath(); ctx.arc(anchorLightPt.x, anchorLightPt.y, anchorGlowR * 2.8, 0, Math.PI * 2); ctx.fill();
          // Core point
          ctx.globalAlpha = anchorLightAlpha;
          ctx.beginPath(); ctx.arc(anchorLightPt.x, anchorLightPt.y, anchorGlowR, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
          _tel.navLightsRendered++;
        }
      }
      bodyDrawn = true;

    } else if (visClass === 'SILHOUETTE') {
      // §IV — In hull-proxy mode the elongated capsule is acceptable (pitch < 20°,
      // zoom ≥ 14). In tactical-symbol mode the capsule is replaced with a
      // pitch-safe chevron to prevent "fridge ship" skew under any map tilt.
      // §0524E — if a validation vessel reaches this branch, the §0524D promotion
      // did not fire (zoom < 10.8, or SILHOUETTE was set after the override).
      // Count it so the instrumentation log reveals the escape path.
      if (isValidationVessel) {
        _spriteTel.validationSpriteBranchSkippedReason['reached_SILHOUETTE_branch'] =
          (_spriteTel.validationSpriteBranchSkippedReason['reached_SILHOUETTE_branch'] || 0) + 1;
      }
      if (rm === 'hull-proxy') {
        _drawSilhouette(ctx, pt, heading, lenPx, widPx, strokeColor, alpha * 0.82);
        _projTel.hullProxyRendered++;
      } else {
        // tactical-symbol: replace silhouette with chevron
        _drawChevron(ctx, pt, heading, lenPx, widPx, color, strokeColor, alpha * 0.75);
        if (isValidationVessel) _spriteTel.validationChevronDrawn++; // §0524E
        _projTel.suppressedHullProxyCount++;
        _projTel.tacticalSymbolsRendered++;
      }
      if (_shouldShowNavLights(visClass, atmoCtx) && underway) {
        _drawNavigationLights(ctx, pt, heading, lenPx, widPx, tier, vesselClass, alpha * 0.55, false);
      }
      bodyDrawn = true;

    } else if (_forceLightPresentation) {
      // §0526G Change 2 — FAR/ATMOSPHERIC: lights read before hulls.
      // Suppress detailed sprite, prefer far-glint / light-only presentation.
      // allowFarGlint preserved through _lAllowFarGlint.
      if (underway && _lAllowFarGlint) {
        // Tiny far-light twinkle — seeded from vessel MMSI
        var _fgSeed = ((vessel.mmsi || 0) % 97) * (Math.PI * 2 / 97);
        _drawValidationFarDot(ctx, pt, vesselClass, alpha * (_lFarAlpha !== null ? _lFarAlpha : 0.5), _fgSeed);
      }
      bodyDrawn = true;

    } else {
      // FULL or REDUCED — §J sprite or chevron dispatch based on spriteLOD
      _projTel.tacticalSymbolsRendered++;
      if (isValidationVessel) _spriteTel.validationSpriteBranchEntered++; // §0524E
      var sl        = _currentSpriteLOD;
      // §0524C/D — validation vessels must show boat sprites (not chevron/symbolic) at zoom >= 10.8.
      // 'chevron': zoom 10.8–12 (low mpx), _currentSpriteLOD resolves to V-arrow.
      // 'symbolic': pitch >= 20°, _currentSpriteLOD resolves to tactical symbol regardless of zoom.
      // Both cases: override sl to 'simple' so _drawBoatSprite fires.
      if (isValidationVessel && _frameCam.zoom >= 10.8 &&
          (sl === 'chevron' || sl === 'symbolic')) {
        sl = 'simple';
        _spriteTel.validationSpriteForced++;
        _spriteTel.validationSymbolicOverridden++; // §0524E proof: override happened
      }
      // isHovered hoisted above dispatch chain

      if (sl === 'simple' || sl === 'detailed') {
        // ── §J Sprite path ─────────────────────────────────────────────────
        // Size caps for sprite mode: larger than tactical-symbol caps, capped
        // aspect ratio so no class produces an unrealistic pencil shape.
        if (underway) {
          lenPx  = Math.min(48, lenPx);
          widPx  = Math.min(lenPx / 2.5, Math.max(lenPx / 5, widPx));
          sizePx = (lenPx + widPx) * 0.5;
        }
        // V-shape wake behind sprite (replaces speed tail in sprite paths)
        // §0526E — gate on distance envelope allowWake; scale by wakeAlpha
        if (underway && _dAllowWake) _drawSpriteWake(ctx, pt, heading, speedKts, tier, alpha * _dWakeAlpha * _silWakeScale, vesselClass, _frameCam && _frameCam.zoom);

        _drawBoatSprite(ctx, pt, heading, lenPx, widPx, vesselClass, alpha, sl, isHovered);
        _spriteTel.spriteRendered++;
        if (isValidationVessel) _spriteTel.validationSimpleSpriteDrawn++; // §0524E proof: _drawBoatSprite called

        // §0524G — heading convention debug sample + optional overlay
        _dbgSampleHeadingDeg       = heading;
        _dbgSampleSpriteRotRad     = heading * Math.PI / 180;
        _dbgSampleMotionBearingDeg = vessel.cog || vessel.courseOverGround || heading;
        if (_flag('showMaritimeHeadingDebug', false)) {
          _drawHeadingDebug(ctx, pt, heading, speedKts, _dbgSampleMotionBearingDeg);
        }

        // §J4 — nav lights only at zoom ≥ 13 or night/dusk in sprite path
        // §0526E — gate on distance envelope allowNavLights
        // §0526F — gate on light authority allowNavPair; scale by navAlpha * pulseValue
        var isNightSprite = atmoCtx.timeOfDay === 'NIGHT' || atmoCtx.timeOfDay === 'DUSK';
        if (_dNavLights && _lAllowNavPair && (_frameCam.zoom >= 13 || isNightSprite) && _shouldShowNavLights(visClass, atmoCtx) && underway) {
          var nightBoostS = isNightSprite ? 1.28 : 1.0;
          var lightAlphaS = Math.min(1.0, (visClass === 'REDUCED' ? alpha * 0.65 : alpha * 0.88) * nightBoostS);
          if (_lNavAlpha !== null) lightAlphaS = Math.min(lightAlphaS, _lNavAlpha * _lPulseValue * nightBoostS);
          _drawNavigationLights(ctx, pt, heading, lenPx, widPx, tier, vesselClass, lightAlphaS, false);
        }

      } else {
        // ── Chevron / symbolic path (zoom < 12 or pitch ≥ 20°) ────────────
        _spriteTel.tacticalRendered++;
        if (isValidationVessel) _spriteTel.validationChevronDrawn++; // §0524E — validation hit chevron path
        // §A — tails at chevron LOD too (spec §7 has no LOD restriction)
        if (lod !== 'dot' && underway && _flag('showMaritimeSpeedTails', true)) {
          _drawSpeedTail(ctx, pt, heading, speedKts, tier, isSynthetic, alpha, clutter);
        }
        _drawChevron(ctx, pt, heading, lenPx, widPx, color, strokeColor, alpha);

        // Navigation lights — standard path with night boost §B
        // §0526E — gate on distance envelope allowNavLights
        // §0526F — gate on light authority allowNavPair; scale by navAlpha * pulseValue
        if (_dNavLights && _lAllowNavPair && _shouldShowNavLights(visClass, atmoCtx) && underway) {
          var isNightC    = atmoCtx.timeOfDay === 'NIGHT' || atmoCtx.timeOfDay === 'DUSK';
          var nightBoostC = isNightC ? 1.28 : 1.0;
          var lightAlphaC = Math.min(1.0, (visClass === 'REDUCED' ? alpha * 0.65 : alpha * 0.90) * nightBoostC);
          if (_lNavAlpha !== null) lightAlphaC = Math.min(lightAlphaC, _lNavAlpha * _lPulseValue * nightBoostC);
          _drawNavigationLights(ctx, pt, heading, lenPx, widPx, tier, vesselClass, lightAlphaC, false);
        }
      }
      bodyDrawn = true;
    }
    } // end if (!bodyDrawn) standard dispatch

    // §0524B — body draw outcome accounting.
    if (bodyDrawn) {
      _spriteTel.bodyDrawSuccessCount++;
    } else if (isValidationVessel) {
      // Safety net: if no branch fired (unexpected state/visClass combination),
      // draw the fallback boat so validation vessels are never invisible after projection.
      _drawValidationFallbackBoat(ctx, pt.x, pt.y, heading, vesselClass, alpha);
      _spriteTel.validationFallbackDrawn++;
      bodyDrawn = true;
      _spriteTel.bodyDrawSuccessCount++;
    } else {
      var _skipReason = state || 'unknown';
      _spriteTel.bodySkippedReasonCounts[_skipReason] = (_spriteTel.bodySkippedReasonCounts[_skipReason] || 0) + 1;
    }

    // ── Label ──────────────────────────────────────────────────────────────
    // §J1 — labels off by default. Show only when: debug flag active, vessel is
    // hovered (rich hover card rendered later), or seed label flag is set.
    // The isHovered case shows _drawHoverLabel after the vessel pass, not here.
    // §0526E — additionally gate on distance envelope allowLabel.
    var chevronAtDotLod = lod === 'dot' && underway && renderTier !== 'GHOST';
    var labelGate = _flag('showMaritimeDebugLabels', false) ||
                    (isSeed && _flag('showSeedVesselLabels', false));
    var distLabelOk = isValidationVessel || _dAllowLabel; // validation vessels always allowed
    if ((lod !== 'dot' || chevronAtDotLod) && labelGate && distLabelOk && (labelOk || isSeed)) {
      _drawLabel(ctx, pt, vessel, vesselId, vesselClass, renderTier, Math.min(alpha, 0.90), isSeed, clutter);
    }

    // §J5 — register hit region for hover detection in _renderFrame
    // §0526E — suppress hover registration for atmospheric-band vessels; they
    //          should not produce hover cards at distance.
    if (isValidationVessel || _dAllowHover || isHovered) {
      _hoverHitList.push({
        vesselId:    vesselId,
        x:           pt.x,
        y:           pt.y,
        r:           Math.max(12, sizePx * 0.72),
        vessel:      vessel,
        vesselClass: vesselClass,
        speedKts:    speedKts,
      });
    }

    // §4 — track per-frame seed quality metrics for debugVisibleSeedVessels()
    if (isSeed) {
      _seedFrameStats.rendered++;
      _seedFrameStats.alphaSum   += alpha;
      _seedFrameStats.glyphPxSum += sizePx;
      if (lod === 'dot') _seedFrameStats.atDotLOD++;
    }

    return true;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WAKE RENDERING — with optional glow pass
  // ═══════════════════════════════════════════════════════════════════════════

  function _renderWakes(ctx, atmoCtx) {
    var wa = SBE.WakeAuthority;
    if (!wa) return;

    var segs = wa.getAllActiveSegments();
    if (!segs || segs.length === 0) return;

    var ar         = SBE.MaritimeAtmosphericReadability;
    var showGlow   = _flag('showMaritimeWakeGlow', true);

    ctx.save();
    ctx.lineCap  = 'round';
    ctx.lineJoin = 'round';

    for (var i = 0; i < segs.length; i++) {
      var seg = segs[i];
      if (!seg) continue;

      var pa = _project(seg.start.lat, seg.start.lng);
      var pb = _project(seg.end.lat,   seg.end.lng);
      if (!pa || !pb) continue;

      var waInput = {
        wakeId:                   seg.wakeId,
        vesselId:                 seg.vesselId,
        provenance:               seg.provenance,
        intensityRaw:             seg.intensityRaw,
        turbulenceRaw:            seg.turbulenceRaw,
        ageRatio:                 0,
        populationTierAtEmission: seg.populationTierAtEmission,
      };
      var wakeAR    = ar ? ar.resolveWakeReadability(waInput, atmoCtx) : null;
      if (wakeAR && !wakeAR.wakeReadable) continue;

      var wakeScore = wakeAR ? wakeAR.readabilityScore : seg.intensityRaw;
      var isAIS     = seg.provenance === 'AIS_VESSEL';
      // Ferry/passenger wake emphasis (§8) — presentation only
      var ferryBoost = _isFerryClass(seg.vesselClass || '') ? 1.20 : 1.0;

      var baseAlpha = isAIS
        ? wakeScore * 0.70 * ferryBoost
        : wakeScore * 0.42;
      if (seg.parentEvicted) baseAlpha *= 0.4;
      if (baseAlpha < 0.02) continue;
      baseAlpha = Math.min(1.0, baseAlpha);

      var wakeColor = isAIS ? _PAL.wake_AIS : _PAL.wake_SYNTHETIC;
      var widthPx   = Math.max(1.0, seg.widthMeters * 0.015 * (1 + seg.intensityRaw));

      // ── Glow pass — AIS wakes only, shadowBlur ──────────────────────────
      if (showGlow && isAIS && seg.intensityRaw > 0.25) {
        ctx.globalAlpha = baseAlpha * 0.40;
        ctx.shadowColor = _PAL.wake_glow;
        ctx.shadowBlur  = 3 + seg.intensityRaw * 7;
        ctx.strokeStyle = _PAL.wake_glow;
        ctx.lineWidth   = widthPx * 0.6;
        ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
        ctx.shadowBlur  = 0;
        _tel.wakeGlowSegments++;
      }

      // ── Base wake pass ───────────────────────────────────────────────────
      ctx.globalAlpha = baseAlpha;
      ctx.strokeStyle = wakeColor;
      ctx.lineWidth   = widthPx;
      ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
      _tel.wakesRendered++;
    }

    ctx.restore();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CORRIDOR HINTS — §10, flag-gated (off by default)
  // Faint directional lane smears from aligned underway vessels.
  // Reads only from renderer queue — does not create route truth.
  // ═══════════════════════════════════════════════════════════════════════════

  function _renderCorridorHints(ctx, queue) {
    if (!_flag('showMaritimeCorridorHints', false)) return;

    // Group underway vessels by heading octant (each 45°)
    var octants = [{}, {}, {}, {}, {}, {}, {}, {}];
    for (var qi = 0; qi < queue.length; qi++) {
      var e = queue[qi];
      if (!_isUnderway(e.vessel)) continue;
      var hdg = e.vessel.trueHeading || e.vessel.headingDeg || e.vessel.heading || 0;
      var oct = Math.floor(((hdg % 360) + 360) % 360 / 45) % 8;
      var key = e.vesselId;
      octants[oct][key] = e;
    }

    ctx.save();
    ctx.strokeStyle = _PAL.corridor;
    ctx.lineWidth   = 6;
    ctx.lineCap     = 'round';
    var hintCount   = 0;

    for (var o = 0; o < 8; o++) {
      var group = Object.values ? Object.values(octants[o]) : _objVals(octants[o]);
      if (group.length < 3) continue; // need at least 3 aligned vessels

      // Draw faint smears between nearest pairs
      for (var gi = 0; gi < group.length - 1 && hintCount < 20; gi++) {
        var va = group[gi].vessel;
        var vb = group[gi + 1].vessel;
        var pa = _project(va.lat, va.lng);
        var pb = _project(vb.lat, vb.lng);
        if (!pa || !pb) continue;
        ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
        hintCount++;
        _tel.corridorHintsRendered++;
      }
    }
    ctx.restore();
  }

  function _objVals(obj) {
    var arr = [];
    for (var k in obj) { if (Object.prototype.hasOwnProperty.call(obj, k)) arr.push(obj[k]); }
    return arr;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN RENDER FRAME
  // ═══════════════════════════════════════════════════════════════════════════

  function _renderFrame(ctx, dt) {
    // §4 — reset seed frame stats
    _seedFrameStats.projected   = 0;
    _seedFrameStats.skippedProj = 0;
    _seedFrameStats.hiddenAtmo  = 0;
    _seedFrameStats.rendered    = 0;
    _seedFrameStats.alphaSum    = 0;
    _seedFrameStats.glyphPxSum  = 0;
    _seedFrameStats.atDotLOD    = 0;

    _tel.aisRendered          = 0;
    _tel.syntheticRendered    = 0;
    _tel.wakesRendered        = 0;
    _tel.atmosphericHidden    = 0;
    _tel.labelsRendered       = 0;
    _tel.seedRendered         = 0;
    _tel.navLightsRendered    = 0;
    _tel.speedTailsRendered   = 0;
    _tel.wakeGlowSegments     = 0;
    _tel.anchoredPinsRendered = 0;
    _tel.lightOnlyVessels     = 0;
    _tel.ferryEmphasisCount   = 0;
    _tel.corridorHintsRendered = 0;
    _tel.framesRendered++;

    // §K — geographic activation gate (0523K).
    // When the camera has moved outside the maritime corridor bounds, set
    // SBE.runtimeFlags.maritimeGeoActive = false from main.js. Returning here
    // keeps the rAF loop alive (so the gate is re-evaluated next frame) but
    // skips all rendering, letting the GPU and JS overhead drop to near-zero.
    // The canvas was already cleared by _frame() before _renderFrame() is called.
    if (!_flag('maritimeGeoActive', true)) return;

    // §I — resolve render mode once per frame from current camera state.
    // §J — also resolve sprite LOD and reset sprite telemetry + hover hit list.
    // Both stored in module-level vars so _renderVessel can read without extra args.
    _frameCam = _getMapCamera();
    _currentRenderMode                  = _resolveRenderMode(_frameCam);
    _currentSpriteLOD                   = _resolveSpriteLOD(_frameCam);
    _spriteTel.spriteRendered           = 0;
    _spriteTel.tacticalRendered         = 0;
    _spriteTel.projectedAISCount        = 0;
    _spriteTel.hoverHitCount            = 0;
    _spriteTel.bodyDrawAttemptCount     = 0;
    _spriteTel.bodyDrawSuccessCount     = 0;
    _spriteTel.validationFallbackDrawn  = 0;
    _spriteTel.bodySkippedReasonCounts  = {};
    _spriteTel.validationDotSuppressed  = 0;
    _spriteTel.validationSpriteForced   = 0;
    _spriteTel.validationSilhouettePromoted    = 0;
    _spriteTel.validationSymbolicOverridden    = 0;
    _spriteTel.validationSimpleSpriteDrawn     = 0;
    _spriteTel.validationChevronDrawn          = 0;
    _spriteTel.validationDotDrawn              = 0;
    _spriteTel.validationSpriteBranchEntered   = 0;
    _spriteTel.validationSpriteBranchSkippedReason = {};
    _spriteTel.validationGhostTierPromoted     = 0;
    _spriteTel.compactSpriteRendered          = 0;
    _spriteTel.farDotRendered                 = 0;
    _spriteTel.chevronSuppressedForValidation = 0;
    _spriteTel.tinyLightDotRendered           = 0;
    _spriteTel.oversizedFarDotPrevented       = 0;
    _hoverHitList.length                = 0; // clear without re-allocating
    _projTel.renderMode                 = _currentRenderMode;
    _projTel.mapPitch                   = _frameCam.pitch;
    _projTel.mapZoom                    = _frameCam.zoom;
    _projTel.hullProxyRendered          = 0;
    _projTel.tacticalSymbolsRendered    = 0;
    _projTel.suppressedHullProxyCount   = 0;

    var ais = SBE.AISRuntime;
    var mse = SBE.MaritimeSpawnEcology;

    var aisVessels       = (ais && ais.getActiveVessels())          || [];
    var syntheticVessels = (mse && mse.getActiveSyntheticVessels()) || [];
    var seedCount        = _seedEnabled ? _seedVessels.length : 0;
    var atmoCtx          = _buildAtmosphericContext(aisVessels.length + seedCount, syntheticVessels.length);
    var mpx              = _metersPerPixel();
    var lod              = _classifyLOD(mpx);

    // §0526B — MaritimeWaterMemory (experimental, hard-disabled by default).
    // Only runs when SBE.runtimeFlags.showMaritimeWaterMemory === true (strict).
    // updateWaterMemory / renderWaterMemory / notifyViewportChanged are never
    // called at runtime unless the flag has been explicitly enabled.
    var _mwmRender = global.SBE && global.SBE.MaritimeWaterMemory;
    if (_mwmRender &&
        global.SBE.runtimeFlags &&
        global.SBE.runtimeFlags.showMaritimeWaterMemory === true) {
      _mwmRender.notifyViewportChanged({
        width:  _canvas ? _canvas.width  : 0,
        height: _canvas ? _canvas.height : 0,
        dpr:    (typeof window !== 'undefined' && window.devicePixelRatio) || 1,
      });
      _mwmRender.updateWaterMemory(dt || 16, undefined);
      _mwmRender.renderWaterMemory(ctx, {
        zoom:                    _frameCam.zoom,
        globalAlphaModifier:     atmoCtx ? (1.0 - (atmoCtx.clutterPressure || 0) * 0.4) : 1.0,
        clutterPressure:         atmoCtx ? (atmoCtx.clutterPressure || 0) : 0,
        isAtmosphericSuppressed: atmoCtx ? (atmoCtx.suppressAll || false) : false,
        showLanes:               _flag('showMaritimeWaterMemoryLanes', true),
        showChurn:               _flag('showMaritimeWaterMemoryChurn', true),
      });
    }

    // Wake pass — below vessels
    _renderWakes(ctx, atmoCtx);

    // Build render queue
    var ph        = SBE.MaritimePopulationHierarchy;
    var tierOrder = { HERO: 3, MID: 2, BACKGROUND: 1, GHOST: 0 };
    var queue     = [];

    // ── Source toggles ────────────────────────────────────────────────────
    // Each source can be independently enabled/disabled via runtimeFlags:
    //   showAISVessels       — default true  (falsy = off)
    //   showSyntheticVessels — default false (truthy = on)
    //   showSeedVessels      — default false (truthy = on)
    // Use _wos.debug.maritime25d.source('ais'|'synthetic'|'seed', bool) to toggle.
    var _rf         = SBE.runtimeFlags || {};
    var _showAIS    = _rf.showAISVessels       !== false;  // default ON
    var _showSyn    = _rf.showSyntheticVessels === true;   // default OFF
    var _showSeed   = _rf.showSeedVessels      === true;   // default OFF

    if (_showAIS) {
      for (var ai = 0; ai < aisVessels.length; ai++) {
        var v   = aisVessels[ai];
        var vid = String(v.mmsi || v.vesselId || ai);
        var vc  = _resolveVesselClass(v);
        var tr  = (ph && ph.getVesselTierString(vid)) || 'BACKGROUND';
        queue.push({ vessel: v, vesselId: vid, vesselClass: vc,
                     provenance: 'AIS_VESSEL', tierOrder: tierOrder[tr] || 1, isSeed: false });
      }
    }

    if (_showSyn) {
      for (var si = 0; si < syntheticVessels.length; si++) {
        var sv = syntheticVessels[si];
        if (!sv.lat || !sv.lng) continue;
        var svid = sv.syntheticId;
        var tr2  = (ph && ph.getVesselTierString(svid)) || 'BACKGROUND';
        queue.push({ vessel: sv, vesselId: svid, vesselClass: sv.vesselClass || 'UNKNOWN',
                     provenance: 'SYNTHETIC_ECOLOGY', tierOrder: tierOrder[tr2] || 1, isSeed: false });
      }
    }

    if (_seedEnabled && _showSeed) {
      for (var ki = 0; ki < _seedVessels.length; ki++) {
        var sv2 = _seedVessels[ki];
        queue.push({ vessel: sv2, vesselId: sv2.id, vesselClass: sv2.vesselClass,
                     provenance: 'AIS_VESSEL', tierOrder: tierOrder[sv2.tier || 'BACKGROUND'] || 1, isSeed: true });
      }
    }

    // GHOST first → HERO last (draws on top)
    queue.sort(function (a, b) { return a.tierOrder - b.tierOrder; });

    // Corridor hints (behind vessels, before vessel pass)
    _renderCorridorHints(ctx, queue);

    // Vessel pass
    for (var qi = 0; qi < queue.length; qi++) {
      var e     = queue[qi];
      var drawn = _renderVessel(ctx, e.vessel, e.vesselId, e.vesselClass,
                                e.provenance, atmoCtx, mpx, lod, e.isSeed, dt);
      if (!drawn) continue;
      if (e.isSeed)                           _tel.seedRendered++;
      else if (e.provenance === 'AIS_VESSEL') _tel.aisRendered++;
      else                                    _tel.syntheticRendered++;
    }

    // §J5 / §0524B — hover detection. Iterate hit list back-to-front (top draw order last).
    // _spriteTel.hoverHitCount = registered hit regions this frame (independent of whether
    // the mouse is over any of them — proves hover and body draw paths both executed).
    _spriteTel.hoverHitCount = _hoverHitList.length;
    _hoveredVesselId = null;
    var _hitThisFrame = false;
    if (_mouseInCanvas && _hoverHitList.length > 0) {
      for (var hi = _hoverHitList.length - 1; hi >= 0; hi--) {
        var h  = _hoverHitList[hi];
        var hx = _mouseX - h.x;
        var hy = _mouseY - h.y;
        if (hx * hx + hy * hy <= h.r * h.r) {
          _hoveredVesselId = h.vesselId;
          _hitThisFrame    = true;
          // Update linger state so the card stays visible after mouse leaves
          _lingerVesselId  = h.vesselId;
          _lingerPt        = { x: h.x, y: h.y };
          _lingerVessel    = h.vessel;
          _lingerClass     = h.vesselClass;
          _lingerSpeedKts  = h.speedKts;
          _lingerStartMs   = 0; // 0 = actively hovered, linger timer not yet running
          _drawHoverLabel(ctx, _lingerPt, _lingerVessel, _lingerClass, _lingerSpeedKts);
          break;
        }
      }
    }
    // §0524L — hover card linger: draw faded card for up to hoverCardLingerMs after hover ends
    if (!_hitThisFrame && _lingerVesselId) {
      var _lingerMs = _spriteTel.hoverCardLingerMs;
      if (_lingerStartMs === 0) {
        // First frame with no active hit — start the linger timer
        _lingerStartMs = performance.now();
      }
      var _elapsed = performance.now() - _lingerStartMs;
      if (_elapsed < _lingerMs) {
        // Smooth ease-out: quadratic falloff (1 → 0 over lingerMs)
        var _frac = 1 - (_elapsed / _lingerMs);
        var _lingerAlpha = _frac * _frac;
        _drawHoverLabel(ctx, _lingerPt, _lingerVessel, _lingerClass, _lingerSpeedKts, _lingerAlpha);
      } else {
        // Linger expired — clear state
        _lingerVesselId = null;
        _lingerPt       = null;
        _lingerVessel   = null;
      }
    }

    // Prune glyph state for vessels no longer in queue (memory hygiene)
    if (_tel.framesRendered % 300 === 0) {
      var activeIds = {};
      for (var pi = 0; pi < queue.length; pi++) activeIds[queue[pi].vesselId] = 1;
      for (var gid in _glyphState) {
        if (!activeIds[gid]) delete _glyphState[gid];
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SEED DATA — deterministic, renderer-local debug only
  // Does NOT enter AISRuntime, WakeAuthority, PopulationHierarchy, or any authority.
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Water-safe corridor seed data ────────────────────────────────────────
  // All coordinates verified on navigable water. No Math.random().
  // Grouped by corridor; heading matches real channel direction.
  // Spacing readable at zoom 11–14.
  //
  // Coordinate safety rules (all WGS-84):
  //
  //   Upper Bay main ship channel
  //     Waterway: wide bay between Brooklyn and Staten Island, N-S axis
  //     Visual role: show inbound/outbound deep-draft traffic
  //     Safe logic: longitude −74.028…−74.042 keeps vessels away from both
  //     shores; south of Governor's Island (40.690°N) and clear of Red Hook
  //     (40.668°N minimum) and Battery landmass (40.700°N).
  //
  //   Staten Island Ferry Lane
  //     Waterway: diagonal crossing Upper Bay, bearing ~42°/222°
  //     Visual role: show high-speed ferry runs between St George and Whitehall
  //     Safe logic: route interpolated from St George (40.6437°N, −74.0733°W) to
  //     Whitehall (40.7013°N, −74.0132°W); all points in open bay water.
  //
  //   East River
  //     Waterway: tidal strait east of Manhattan, roughly N-S with NE bend
  //     Visual role: show ferry and barge traffic between harbor and upper East Side
  //     Safe logic: Manhattan's east shore runs from ~−73.998°W at 40.702°N to
  //     ~−73.974°W at 40.714°N (Two Bridges/FDR Drive). Brooklyn/Queens west
  //     shore: ~−73.988°W at 40.702°N to ~−73.963°W at 40.715°N.
  //     Mid-channel longitude = average of both shores at each latitude.
  //     CRITICAL: do not use lngs more negative than −73.975 above lat 40.710.
  //
  //   Hudson River mid-channel
  //     Waterway: wide tidal river west of Manhattan
  //     Visual role: show passenger and tanker traffic on the main N-S axis
  //     Safe logic: Manhattan west shore piers at ~−74.003…−74.022°W (varies by
  //     latitude); NJ/Hoboken shore at ~−74.025…−74.032°W. Use lng −74.012…−74.026
  //     to stay well clear of both shores. Battery Park City piers extend to
  //     ~−74.022°W at 40.708°N.
  //
  //   Kill Van Kull
  //     Waterway: E-W channel between Staten Island (S) and NJ/Bayonne (N)
  //     Visual role: show tanker and industrial barge traffic
  //     Safe logic: SI north shore at ~40.632°N; NJ south shore at ~40.639°N.
  //     Use lat 40.637 for all KVK seeds = safe mid-channel at every longitude.
  //     Longitude range −74.073…−74.119 keeps vessels in the named waterway.
  //
  //   Verrazzano / Ambrose Channel
  //     Waterway: Ambrose Channel inbound/outbound through the Narrows
  //     Visual role: show deep-draft ocean traffic approaching harbor
  //     Safe logic: Narrows center at ~−74.044°W under the bridge (40.607°N);
  //     south of the bridge in open Lower Bay. All positions well away from
  //     the Brooklyn and SI shorelines.
  //
  //   Red Hook / BCT Basin
  //     Waterway: Gowanus Bay / Atlantic Basin open water west of Red Hook
  //     Visual role: show cruise terminal berth and basin service traffic
  //     Safe logic: BCT pier deck at ~−74.012°W; Red Hook land at ~−74.009°W.
  //     Use lng −74.018…−74.022 to place vessels clearly off the pier face
  //     in open basin water.
  //
  //   Lower Bay Anchorage
  //     Waterway: open Lower Bay south of the Narrows
  //     Visual role: show waiting anchorage (vessels at rest)
  //     Safe logic: entirely open water. Sandy Hook at 40.462°N; our seeds
  //     at 40.558…40.587°N are well north of Sandy Hook and clear of all land.

  var _SEED_DATA = [

    // ── Upper Bay — Main Ship Channel ─────────────────────────────────────
    // Approximate waterway: wide open bay, main N-S deep-draft lane
    // Visual role: inbound/outbound cargo and tanker traffic
    // Safe logic: lng −74.028…−74.042 = mid-channel, clear of both shores
    { id:'seed::001', vesselClass:'CARGO',   lat:40.6112, lng:-74.0418, headingDeg:355, speedKts:10, state:'STATUS_UNDERWAY', vesselName:'MSC ADRIANA',   tier:'MID'       },
    { id:'seed::002', vesselClass:'TANKER',  lat:40.6298, lng:-74.0385, headingDeg:175, speedKts: 8, state:'STATUS_UNDERWAY', vesselName:null,             tier:'BACKGROUND' },
    { id:'seed::003', vesselClass:'CARGO',   lat:40.6480, lng:-74.0322, headingDeg:355, speedKts: 9, state:'STATUS_UNDERWAY', vesselName:null,             tier:'BACKGROUND' },
    { id:'seed::004', vesselClass:'TUG',     lat:40.6558, lng:-74.0290, headingDeg:355, speedKts: 6, state:'STATUS_UNDERWAY', vesselName:'CAROL ANN',      tier:'BACKGROUND' },
    { id:'seed::005', vesselClass:'TANKER',  lat:40.6420, lng:-74.0352, headingDeg:  0, speedKts: 0, state:'STATUS_ANCHORED', vesselName:null,             tier:'BACKGROUND' },

    // ── Staten Island Ferry Lane ──────────────────────────────────────────
    // Approximate waterway: diagonal crossing Upper Bay, bearing ~42°/222°
    // Visual role: high-speed ferry runs between St George and Whitehall
    // Safe logic: all points in open bay; interpolated along real route bearing
    { id:'seed::006', vesselClass:'FERRY',   lat:40.6530, lng:-74.0618, headingDeg: 42, speedKts:16, state:'STATUS_UNDERWAY', vesselName:'STATEN ISLAND FERRY', tier:'MID'  },
    { id:'seed::007', vesselClass:'FERRY',   lat:40.6680, lng:-74.0462, headingDeg:222, speedKts:15, state:'STATUS_UNDERWAY', vesselName:'STATEN ISLAND FERRY', tier:'MID'  },
    { id:'seed::008', vesselClass:'FERRY',   lat:40.6605, lng:-74.0540, headingDeg: 42, speedKts:14, state:'STATUS_UNDERWAY', vesselName:null,                  tier:'BACKGROUND' },
    { id:'seed::009', vesselClass:'SERVICE', lat:40.6748, lng:-74.0385, headingDeg:222, speedKts: 7, state:'STATUS_UNDERWAY', vesselName:null,                  tier:'BACKGROUND' },

    // ── East River ────────────────────────────────────────────────────────
    // Approximate waterway: tidal strait east of Manhattan, N-S with NE bend
    // Visual role: NYC Ferry routes and barge traffic
    // Safe logic: positions use computed mid-channel at each latitude.
    //   40.702°N: Manhattan shore ~−73.998, Brooklyn ~−73.988, center −73.993
    //   40.709°N: Manhattan shore ~−73.990, Brooklyn ~−73.981, center −73.986
    //   40.715°N: Manhattan shore ~−73.974, Brooklyn ~−73.963, center −73.969
    //   40.723°N: Manhattan shore ~−73.978, Brooklyn ~−73.966, center −73.972
    //   40.736°N: Manhattan shore ~−73.975, Brooklyn ~−73.963, center −73.969
    //   40.748°N: Manhattan shore ~−73.970, Brooklyn ~−73.957, center −73.963
    { id:'seed::010', vesselClass:'FERRY',        lat:40.7025, lng:-73.9932, headingDeg: 15, speedKts:12, state:'STATUS_UNDERWAY', vesselName:'NYC FERRY',  tier:'MID'       },
    { id:'seed::011', vesselClass:'FERRY',        lat:40.7148, lng:-73.9682, headingDeg:195, speedKts:11, state:'STATUS_UNDERWAY', vesselName:'NYC FERRY',  tier:'MID'       },
    { id:'seed::012', vesselClass:'TUG',          lat:40.7088, lng:-73.9858, headingDeg: 15, speedKts: 6, state:'STATUS_UNDERWAY', vesselName:'HUNTER',     tier:'BACKGROUND' },
    { id:'seed::013', vesselClass:'CARGO',        lat:40.7228, lng:-73.9718, headingDeg: 18, speedKts: 7, state:'STATUS_UNDERWAY', vesselName:null,          tier:'BACKGROUND' },
    { id:'seed::014', vesselClass:'SERVICE',      lat:40.7358, lng:-73.9688, headingDeg:195, speedKts: 4, state:'STATUS_UNDERWAY', vesselName:null,          tier:'BACKGROUND' },
    { id:'seed::015', vesselClass:'RECREATIONAL', lat:40.7482, lng:-73.9632, headingDeg: 20, speedKts: 5, state:'STATUS_UNDERWAY', vesselName:null,          tier:'GHOST'     },

    // ── Hudson River — West Side Lane ─────────────────────────────────────
    // Approximate waterway: wide tidal river west of Manhattan piers
    // Visual role: passenger, tanker, and tug traffic on N-S axis
    // Safe logic: Manhattan west piers at ~−74.003…−74.022°W by latitude;
    //   NJ/Hoboken at ~−74.025…−74.032°W. Use lng −74.012…−74.026 (mid-channel).
    //   40.708°N: BPC piers extend to ~−74.022; NJ ~−74.030; center −74.026
    //   40.722°N: piers ~−74.016; NJ ~−74.027; center −74.021
    //   40.736°N: piers ~−74.008; NJ ~−74.021; center −74.015
    //   40.749°N: piers ~−74.004; NJ ~−74.018; center −74.011
    //   40.762°N: piers ~−74.002; NJ ~−74.016; center −74.009
    { id:'seed::016', vesselClass:'PASSENGER',   lat:40.7082, lng:-74.0252, headingDeg:355, speedKts:10, state:'STATUS_UNDERWAY', vesselName:'SPIRIT OF NY',  tier:'HERO'      },
    { id:'seed::017', vesselClass:'FERRY',        lat:40.7215, lng:-74.0210, headingDeg:175, speedKts:14, state:'STATUS_UNDERWAY', vesselName:'NY WATERWAY',   tier:'MID'       },
    { id:'seed::018', vesselClass:'TUG',          lat:40.7355, lng:-74.0148, headingDeg:355, speedKts: 5, state:'STATUS_UNDERWAY', vesselName:null,             tier:'BACKGROUND' },
    { id:'seed::019', vesselClass:'CARGO',        lat:40.7488, lng:-74.0112, headingDeg:175, speedKts: 8, state:'STATUS_UNDERWAY', vesselName:null,             tier:'BACKGROUND' },
    { id:'seed::020', vesselClass:'TANKER',       lat:40.7622, lng:-74.0092, headingDeg:355, speedKts: 6, state:'STATUS_UNDERWAY', vesselName:null,             tier:'BACKGROUND' },

    // ── Kill Van Kull — Industrial Lane ──────────────────────────────────
    // Approximate waterway: E-W channel between SI and NJ (Bayonne)
    // Visual role: tanker and industrial barge traffic
    // Safe logic: SI north shore at ~40.632°N, NJ south shore at ~40.639°N.
    //   lat 40.637 = verified mid-channel at all KVK longitudes.
    //   lng −74.073…−74.119 stays within the named waterway.
    { id:'seed::021', vesselClass:'TANKER',    lat:40.6372, lng:-74.1185, headingDeg: 90, speedKts: 7, state:'STATUS_UNDERWAY', vesselName:null,           tier:'BACKGROUND' },
    { id:'seed::022', vesselClass:'CARGO',     lat:40.6368, lng:-74.1025, headingDeg:270, speedKts: 6, state:'STATUS_UNDERWAY', vesselName:null,           tier:'BACKGROUND' },
    { id:'seed::023', vesselClass:'TUG',       lat:40.6372, lng:-74.0872, headingDeg: 90, speedKts: 4, state:'STATUS_UNDERWAY', vesselName:null,           tier:'BACKGROUND' },
    { id:'seed::024', vesselClass:'INDUSTRIAL',lat:40.6368, lng:-74.0728, headingDeg: 90, speedKts: 3, state:'STATUS_UNDERWAY', vesselName:null,           tier:'BACKGROUND' },
    { id:'seed::025', vesselClass:'TANKER',    lat:40.6372, lng:-74.0948, headingDeg:  0, speedKts: 0, state:'STATUS_ANCHORED', vesselName:null,           tier:'BACKGROUND' },

    // ── Verrazzano Approach — Ambrose Channel ─────────────────────────────
    // Approximate waterway: Narrows + Ambrose Channel (S approach to harbor)
    // Visual role: ocean-going deep-draft traffic approaching/departing
    // Safe logic: channel center at ~−74.044°W under bridge (40.607°N);
    //   all seeds in open water, clear of both Staten Island and Brooklyn shores.
    { id:'seed::026', vesselClass:'CARGO',   lat:40.6068, lng:-74.0442, headingDeg:355, speedKts:10, state:'STATUS_UNDERWAY', vesselName:'COSCO SHIPPING', tier:'MID'       },
    { id:'seed::027', vesselClass:'TANKER',  lat:40.5942, lng:-74.0468, headingDeg:175, speedKts: 8, state:'STATUS_UNDERWAY', vesselName:null,              tier:'BACKGROUND' },
    { id:'seed::028', vesselClass:'CARGO',   lat:40.5818, lng:-74.0495, headingDeg:355, speedKts:11, state:'STATUS_UNDERWAY', vesselName:null,              tier:'BACKGROUND' },

    // ── Red Hook / Brooklyn Cruise Terminal Basin ─────────────────────────
    // Approximate waterway: Gowanus Bay / Atlantic Basin open water
    // Visual role: cruise terminal berth and harbour service traffic
    // Safe logic: BCT pier face at ~−74.012°W; Red Hook land at ~−74.008°W.
    //   Use lng −74.018…−74.022 to sit clearly in open basin water off the
    //   pier face, clear of any pier deck or Red Hook landmass.
    { id:'seed::029', vesselClass:'PASSENGER',lat:40.6782, lng:-74.0205, headingDeg:  0, speedKts: 0, state:'STATUS_MOORED',   vesselName:'CARNIVAL SUNRISE', tier:'HERO'      },
    { id:'seed::030', vesselClass:'TUG',      lat:40.6758, lng:-74.0178, headingDeg:170, speedKts: 3, state:'STATUS_UNDERWAY', vesselName:null,               tier:'BACKGROUND' },
    { id:'seed::031', vesselClass:'SERVICE',  lat:40.6732, lng:-74.0198, headingDeg:270, speedKts: 4, state:'STATUS_UNDERWAY', vesselName:null,               tier:'BACKGROUND' },

    // ── Lower Bay Anchorage ───────────────────────────────────────────────
    // Approximate waterway: open Lower Bay south of the Narrows
    // Visual role: deep anchorage holding area for waiting vessels
    // Safe logic: fully open water at lat 40.558…40.587°N, lng −74.033…−74.055°W.
    //   Sandy Hook at 40.462°N; Coney Island at 40.574°N, −73.989°W (east).
    //   Our seeds are safely west of Coney Island and north of Sandy Hook.
    { id:'seed::032', vesselClass:'CARGO',  lat:40.5688, lng:-74.0382, headingDeg:  0, speedKts: 0, state:'STATUS_ANCHORED', vesselName:null, tier:'BACKGROUND' },
    { id:'seed::033', vesselClass:'TANKER', lat:40.5755, lng:-74.0552, headingDeg:  0, speedKts: 0, state:'STATUS_ANCHORED', vesselName:null, tier:'BACKGROUND' },
    { id:'seed::034', vesselClass:'CARGO',  lat:40.5598, lng:-74.0318, headingDeg:  0, speedKts: 0, state:'STATUS_ANCHORED', vesselName:null, tier:'BACKGROUND' },
    { id:'seed::035', vesselClass:'CARGO',  lat:40.5868, lng:-74.0428, headingDeg:355, speedKts: 7, state:'STATUS_UNDERWAY', vesselName:null, tier:'BACKGROUND' },

  ];

  // ── Corridor lookup — keyed by seed id ───────────────────────────────────
  // Used by showSeedWaterDebug(). Must mirror _SEED_DATA groupings exactly.

  var _SEED_CORRIDORS = {
    'seed::001': 'Upper Bay',     'seed::002': 'Upper Bay',     'seed::003': 'Upper Bay',
    'seed::004': 'Upper Bay',     'seed::005': 'Upper Bay',
    'seed::006': 'SI Ferry Lane', 'seed::007': 'SI Ferry Lane', 'seed::008': 'SI Ferry Lane',
    'seed::009': 'SI Ferry Lane',
    'seed::010': 'East River',    'seed::011': 'East River',    'seed::012': 'East River',
    'seed::013': 'East River',    'seed::014': 'East River',    'seed::015': 'East River',
    'seed::016': 'Hudson River',  'seed::017': 'Hudson River',  'seed::018': 'Hudson River',
    'seed::019': 'Hudson River',  'seed::020': 'Hudson River',
    'seed::021': 'Kill Van Kull', 'seed::022': 'Kill Van Kull', 'seed::023': 'Kill Van Kull',
    'seed::024': 'Kill Van Kull', 'seed::025': 'Kill Van Kull',
    'seed::026': 'Verrazzano',    'seed::027': 'Verrazzano',    'seed::028': 'Verrazzano',
    'seed::029': 'Red Hook/BCT',  'seed::030': 'Red Hook/BCT',  'seed::031': 'Red Hook/BCT',
    'seed::032': 'Lower Bay',     'seed::033': 'Lower Bay',     'seed::034': 'Lower Bay',
    'seed::035': 'Lower Bay',
  };

  // ── debugVisibleSeedVessels — §5 visibility audit helper ─────────────────
  // Returns count and quality metrics from the most recently completed render
  // frame. Call after at least one frame has rendered with seeds active.
  //
  // Fields:
  //   totalSeedVessels    — total in _seedVessels (injected count)
  //   projectedInViewport — seeds with a valid screen projection
  //   renderedThisFrame   — seeds that completed the draw pass
  //   hiddenByAtmosphere  — seeds suppressed by atmospheric readability
  //   skippedByProjection — seeds outside viewport (null projection)
  //   skippedByLOD        — seeds that drew at dot LOD (smallest glyph tier)
  //   averageAlpha        — mean alpha of rendered seeds
  //   averageGlyphPx      — mean sizePx of rendered seeds

  function debugVisibleSeedVessels() {
    var r = _seedFrameStats.rendered;
    return {
      totalSeedVessels:    _seedVessels.length,
      projectedInViewport: _seedFrameStats.projected,
      renderedThisFrame:   r,
      hiddenByAtmosphere:  _seedFrameStats.hiddenAtmo,
      skippedByProjection: _seedFrameStats.skippedProj,
      skippedByLOD:        _seedFrameStats.atDotLOD,
      averageAlpha:        r > 0 ? +(_seedFrameStats.alphaSum  / r).toFixed(3) : 0,
      averageGlyphPx:      r > 0 ? +(_seedFrameStats.glyphPxSum / r).toFixed(1) : 0,
    };
  }

  // ── seedWaterCorridors — preferred seed helper ────────────────────────────
  // Injects all 35 corridor-placed seed vessels into the renderer.
  // Deterministic — no Math.random(). Renderer-local only; never touches
  // AISRuntime, WakeAuthority, PopulationHierarchy, or any authority.
  //
  // Corridor coverage:
  //   [01-05] Upper Bay Main Ship Channel
  //   [06-09] Staten Island Ferry Lane
  //   [10-15] East River Ferry Lane
  //   [16-20] Hudson River West Lane
  //   [21-25] Kill Van Kull Industrial Lane
  //   [26-28] Verrazzano / Ambrose Channel
  //   [29-31] Red Hook / BCT Basin
  //   [32-35] Lower Bay Anchorage

  function seedWaterCorridors() {
    _seedVessels = _SEED_DATA.slice();
    _seedEnabled = true;
    console.log('[MaritimeOccupancyRenderer] seedWaterCorridors — ' + _seedVessels.length + ' vessels across 8 water corridors');
    return _seedVessels.length;
  }

  // seedDenseHarbor — legacy name, delegates to seedWaterCorridors
  function seedDenseHarbor() {
    return seedWaterCorridors();
  }

  function clearSeedVessels() {
    _seedVessels = [];
    _seedEnabled = false;
    console.log('[MaritimeOccupancyRenderer] seed vessels cleared');
  }

  // ── showSeedWaterDebug — §6 diagnostic helper ────────────────────────────
  // Returns (and console.table's) all seed vessels with corridor/waterway label.
  // Allows quick visual audit of seed placement without opening devtools map.
  //
  // Each row:
  //   id, name, lat, lng, corridor, waterway, state, class, tier, speedKts

  function showSeedWaterDebug() {
    var rows = _SEED_DATA.map(function (v) {
      var corridor = _SEED_CORRIDORS[v.id] || '?';
      return {
        id:       v.id,
        name:     v.vesselName || '—',
        lat:      v.lat,
        lng:      v.lng,
        corridor: corridor,
        waterway: corridor,
        state:    (v.state || '').replace('STATUS_', ''),
        class:    v.vesselClass,
        tier:     v.tier,
        speedKts: v.speedKts,
      };
    });
    console.table(rows);
    return rows;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CANVAS LIFECYCLE — unchanged
  // ═══════════════════════════════════════════════════════════════════════════

  function _createCanvas() {
    var parent = document.querySelector(_parentSel);
    if (!parent) { console.warn('[MaritimeOccupancyRenderer] parent not found:', _parentSel); return false; }
    var existing = document.getElementById('maritime-occupancy-canvas');
    if (existing) existing.parentNode.removeChild(existing);
    var dpr = window.devicePixelRatio || 1;
    _canvas        = document.createElement('canvas');
    _canvas.id     = 'maritime-occupancy-canvas';
    _canvas.width  = Math.round(parent.clientWidth  * dpr);
    _canvas.height = Math.round(parent.clientHeight * dpr);
    _canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:999999;pointer-events:none';
    parent.style.position = 'relative';
    parent.appendChild(_canvas);
    _ctx = _canvas.getContext('2d');
    _attachMouseListeners(); // §J5 — window mousemove for hover detection
    console.log('[MaritimeOccupancyRenderer] canvas created', _canvas.width, '×', _canvas.height, '@' + dpr + 'x');
    return true;
  }

  function _resizeIfNeeded() {
    if (!_canvas) return;
    var parent = document.querySelector(_parentSel);
    if (!parent) return;
    var dpr = window.devicePixelRatio || 1;
    var tw  = Math.round(parent.clientWidth  * dpr);
    var th  = Math.round(parent.clientHeight * dpr);
    if (_canvas.width !== tw || _canvas.height !== th) { _canvas.width = tw; _canvas.height = th; }
  }

  function _frame(now) {
    if (!_enabled) { _rafId = null; return; }
    _rafId = requestAnimationFrame(_frame);
    if (!_ctx) return;
    _resizeIfNeeded();
    var dpr = window.devicePixelRatio || 1;
    var cw  = _canvas.width  / dpr;
    var ch  = _canvas.height / dpr;
    var dt  = _lastFrameMs ? Math.min(0.1, (now - _lastFrameMs) / 1000) : 1 / 60;
    _lastFrameMs = now;
    _ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    _ctx.globalAlpha              = 1;
    _ctx.globalCompositeOperation = 'source-over';
    _ctx.clearRect(0, 0, cw, ch);
    _renderFrame(_ctx, dt);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════════

  function init(options) {
    if (_initialized) return;
    _initialized = true;
    if (options && options.parentSelector) _parentSel = options.parentSelector;
    // Wire debug helpers to _wos if already set up
    if (global._wos) {
      global._wos.seedWaterCorridors      = seedWaterCorridors;
      global._wos.seedDenseHarbor         = seedDenseHarbor;
      global._wos.clearSeedVessels        = clearSeedVessels;
      global._wos.showSeedWaterDebug           = showSeedWaterDebug;
      global._wos.debugVisibleSeedVessels      = debugVisibleSeedVessels;
      global._wos.debugMotionPresence          = debugMotionPresence;
      global._wos.debugAISProjectionRenderer   = debugAISProjectionRenderer;
      global._wos.debugBoatSpriteRenderer      = debugBoatSpriteRenderer;
      global._wos.debugMaritimeRuntimePath     = debugMaritimeRuntimePath;
    }
    console.log('[MaritimeOccupancyRenderer v' + VERSION + '] initialized');
    console.log('  Flags: showMaritimeNavLights | showMaritimeSpeedTails | showMaritimeWakeGlow | showMaritimeCorridorHints');
    console.log('  Validation: maritimeValidationVisibility | showSeedVesselLabels');
    console.log('  Debug: _wos.debugAISProjectionRenderer() | _wos.seedWaterCorridors() | _wos.debugOccupancy()');
  }

  function enable(on) {
    on = (on !== false);
    if (on === _enabled) return;
    _enabled = on;
    if (_enabled) {
      if (!_createCanvas()) { _enabled = false; return; }
      _lastFrameMs = 0;
      _rafId = requestAnimationFrame(_frame);
      console.log('[MaritimeOccupancyRenderer] enabled');
    } else {
      if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
      _detachMouseListeners(); // §J5 — remove hover tracking
      if (_canvas && _canvas.parentNode) _canvas.parentNode.removeChild(_canvas);
      _canvas = null; _ctx = null;
      console.log('[MaritimeOccupancyRenderer] disabled');
    }
  }

  function destroy() { enable(false); _initialized = false; }
  function isEnabled() { return _enabled; }
  function isReady()   { return _initialized && _enabled && !!_canvas; }

  function getDebugSnapshot() {
    return {
      version:     VERSION,
      enabled:     _enabled,
      initialized: _initialized,
      seedEnabled: _seedEnabled,
      seedCount:   _seedVessels.length,
      telemetry:   Object.assign({}, _tel),
    };
  }

  // §17 — motion presence debug helper
  function debugMotionPresence() {
    return {
      navLightsRendered:     _tel.navLightsRendered,
      speedTailsRendered:    _tel.speedTailsRendered,
      wakeGlowSegments:      _tel.wakeGlowSegments,
      anchoredPinsRendered:  _tel.anchoredPinsRendered,
      lightOnlyVessels:      _tel.lightOnlyVessels,
      ferryEmphasisCount:    _tel.ferryEmphasisCount,
      corridorHintsRendered: _tel.corridorHintsRendered,
    };
  }

  // §VI — AIS projection renderer debug helper
  // Returns the frame-level projection state and per-mode draw counts.
  // Workflow:
  //   _wos.clearSeedVessels()
  //   _wos.enableMaritimeValidationFeed(true)
  //   _wos.debugAISProjectionRenderer()   ← this
  //   _wos.debugOccupancy()

  function debugAISProjectionRenderer() {
    var result = {
      renderMode:               _projTel.renderMode,
      mapPitch:                 +_projTel.mapPitch.toFixed(1),
      mapZoom:                  +_projTel.mapZoom.toFixed(2),
      aisRendered:              _tel.aisRendered,
      hullProxyRendered:        _projTel.hullProxyRendered,
      tacticalSymbolsRendered:  _projTel.tacticalSymbolsRendered,
      suppressedHullProxyCount: _projTel.suppressedHullProxyCount,
    };
    console.group('[MaritimeOccupancyRenderer v' + VERSION + '] AIS Projection Renderer');
    console.log('  renderMode:              ', result.renderMode,
      '(hull-proxy needs pitch <', PITCH_HULL_SAFE + '° AND zoom ≥', ZOOM_HULL_SAFE + ')');
    console.log('  mapPitch:                ', result.mapPitch + '°');
    console.log('  mapZoom:                 ', result.mapZoom);
    console.log('  aisRendered:             ', result.aisRendered);
    console.log('  tacticalSymbolsRendered: ', result.tacticalSymbolsRendered);
    console.log('  hullProxyRendered:       ', result.hullProxyRendered);
    console.log('  suppressedHullProxy:     ', result.suppressedHullProxyCount,
      '(silhouettes → chevrons due to pitch)');
    console.groupEnd();
    return result;
  }

  // ── debugMaritimeRuntimePath — full pipeline diagnostic ──────────────────
  // Traces the path: ValidationFeed → AISRuntime bucket → Renderer frame.
  // Returns a structured snapshot so regressions can be isolated by layer.
  //
  // Workflow:
  //   _wos.debugMaritimeRuntimePath()
  //   Check: validationFeedEnabled, aisActiveCount, validationMMSIsActive,
  //          rendererAISCount. If any layer shows 0, the bug is upstream of it.

  function debugMaritimeRuntimePath() {
    var mvf = SBE.MaritimeValidationFeed;
    var ais = SBE.AISRuntime;

    // ValidationFeed layer
    var feedEnabled  = !!(mvf && mvf.debug && mvf.debug().enabled);
    var catalogSize  = mvf ? (mvf.CATALOG_SIZE || 0) : 0;

    // AISRuntime layer
    var allActive    = ais ? ais.getActiveVessels() : [];
    var aisCount     = allActive.length;
    var valMin       = VALIDATION_MMSI_MIN;
    var valMax       = VALIDATION_MMSI_MAX;
    var valVessels   = allActive.filter(function (v) {
      return v.mmsi >= valMin && v.mmsi <= valMax;
    });
    var valCount     = valVessels.length;
    var firstAIS     = allActive[0] ? {
      mmsi:        allActive[0].mmsi,
      state:       allActive[0].state,
      lat:         allActive[0].lat,
      lng:         allActive[0].lng,
      speedKnots:  allActive[0].speedKnots,
    } : null;
    var firstVal     = valVessels[0] ? {
      mmsi:        valVessels[0].mmsi,
      class:       mvf && mvf.getVesselClass ? mvf.getVesselClass(valVessels[0].mmsi) : '?',
      state:       valVessels[0].state,
      lat:         valVessels[0].lat,
      lng:         valVessels[0].lng,
      speedKnots:  valVessels[0].speedKnots,
    } : null;

    // Renderer layer (last-frame telemetry)
    var rendererAISCount = _tel.aisRendered;
    var atmoHidden       = _tel.atmosphericHidden;

    var result = {
      validationFeedEnabled:    feedEnabled,
      validationCatalogSize:    catalogSize,
      aisRuntimeActiveCount:    aisCount,
      validationMMSIsActive:    valCount,
      rendererAISCount:         rendererAISCount,
      rendererAtmoHidden:       atmoHidden,
      firstActiveAISVessel:     firstAIS,
      firstValidationVessel:    firstVal,
    };

    var ok = '✓'; var bad = '✗';
    console.group('[MaritimeOccupancyRenderer v' + VERSION + '] Runtime Path Diagnostic');
    console.log('  [Feed ]', feedEnabled   ? ok : bad, 'validationFeed enabled:', feedEnabled,
      '| catalog:', catalogSize);
    console.log('  [AIS  ]', aisCount > 0  ? ok : bad, 'AISRuntime active vessels:', aisCount,
      '| validation MMSIs:', valCount, '/ ' + catalogSize);
    console.log('  [Rend ]', rendererAISCount > 0 ? ok : bad,
      'renderer aisRendered:', rendererAISCount,
      '| atmoHidden:', atmoHidden);
    if (firstVal) {
      console.log('  [Sample] MMSI', firstVal.mmsi,
        '| class:', firstVal.class,
        '| state:', firstVal.state,
        '| pos:', firstVal.lat && firstVal.lat.toFixed(4), firstVal.lng && firstVal.lng.toFixed(4));
    } else {
      console.warn('  [Sample] No validation vessels in AISRuntime — feed may not have ticked yet');
    }
    // Diagnosis hints
    if (!feedEnabled) {
      console.warn('  → Feed is OFF. Call _wos.enableMaritimeValidationFeed(true)');
    } else if (valCount === 0) {
      console.warn('  → Feed ON but 0 validation vessels in AISRuntime. Packet shape mismatch or AISRuntime not initialized.');
    } else if (rendererAISCount === 0 && atmoHidden > 0) {
      console.warn('  → Vessels in AISRuntime but all hidden by atmosphere. Check vessel class resolution and atmospheric resistance.');
    } else if (rendererAISCount === 0) {
      console.warn('  → Vessels in AISRuntime but renderer shows 0. Check map viewport / projection.');
    }
    console.groupEnd();
    return result;
  }

  // §J6 — Boat sprite renderer debug helper
  // Returns frame-level sprite LOD, draw counts, and hover state.
  // Workflow:
  //   _wos.enableMaritimeValidationFeed(true)
  //   _wos.debugBoatSpriteRenderer()   ← this
  //   _wos.debugAISProjectionRenderer()

  function debugBoatSpriteRenderer() {
    var result = {
      // Existing fields
      spriteLOD:               _currentSpriteLOD,
      spriteRendered:          _spriteTel.spriteRendered,
      tacticalRendered:        _spriteTel.tacticalRendered,
      hoveredVesselId:         _hoveredVesselId,
      labelsRendered:          _tel.labelsRendered,
      mapZoom:                 +_frameCam.zoom.toFixed(2),
      mapPitch:                +_frameCam.pitch.toFixed(1),
      // §0524B — split hover from draw success
      projectedAISCount:       _spriteTel.projectedAISCount,
      hoverHitCount:           _spriteTel.hoverHitCount,
      bodyDrawAttemptCount:    _spriteTel.bodyDrawAttemptCount,
      bodyDrawSuccessCount:    _spriteTel.bodyDrawSuccessCount,
      validationFallbackDrawn:  _spriteTel.validationFallbackDrawn,
      bodySkippedReasonCounts:  Object.assign({}, _spriteTel.bodySkippedReasonCounts),
      // §0524C
      validationDotSuppressed:  _spriteTel.validationDotSuppressed,
      validationSpriteForced:   _spriteTel.validationSpriteForced,
      // §0524E — per-draw-call proof counters
      validationSilhouettePromoted:        _spriteTel.validationSilhouettePromoted,
      validationSymbolicOverridden:        _spriteTel.validationSymbolicOverridden,
      validationSimpleSpriteDrawn:         _spriteTel.validationSimpleSpriteDrawn,
      validationChevronDrawn:              _spriteTel.validationChevronDrawn,
      validationDotDrawn:                  _spriteTel.validationDotDrawn,
      validationSpriteBranchEntered:       _spriteTel.validationSpriteBranchEntered,
      validationSpriteBranchSkippedReason: Object.assign({}, _spriteTel.validationSpriteBranchSkippedReason),
      validationGhostTierPromoted:         _spriteTel.validationGhostTierPromoted,
      // §0524H — validation LOD fast path
      compactSpriteRendered:          _spriteTel.compactSpriteRendered,
      farDotRendered:                 _spriteTel.farDotRendered,
      chevronSuppressedForValidation: _spriteTel.chevronSuppressedForValidation,
      tinyLightDotRendered:           _spriteTel.tinyLightDotRendered,
      oversizedFarDotPrevented:       _spriteTel.oversizedFarDotPrevented,
      // §0524G — heading convention proof
      headingConvention:        'local_bow_neg_y__ais_0_north',
      sampleHeadingDeg:         +_dbgSampleHeadingDeg.toFixed(1),
      sampleSpriteRotationRad:  +_dbgSampleSpriteRotRad.toFixed(4),
      sampleMotionBearingDeg:   +_dbgSampleMotionBearingDeg.toFixed(1),
      headingDebugOverlay:      !!_flag('showMaritimeHeadingDebug', false),
    };
    var ok = '✓'; var bad = '✗';
    console.group('[MaritimeOccupancyRenderer v' + VERSION + '] Boat Sprite Renderer');
    console.log('  spriteLOD:               ', result.spriteLOD,
      '(zoom<12→chevron, 12-14→simple, ≥14+pitch<20°→detailed, pitch≥20°→symbolic)');
    console.log('  mapZoom:                 ', result.mapZoom,
      '  mapPitch:', result.mapPitch + '°');
    console.log('  projectedAISCount:       ', result.projectedAISCount,
      '← AIS vessels with valid screen projection');
    console.log('  hoverHitCount:           ', result.hoverHitCount,
      '← hit regions registered (= vessels past projection + alpha gate)');
    console.log('  bodyDrawAttemptCount:    ', result.bodyDrawAttemptCount,
      '← vessels entering draw dispatch');
    console.log('  bodyDrawSuccessCount:    ', result.bodyDrawSuccessCount,
      result.bodyDrawSuccessCount > 0 ? ok : bad, '← vessels with ≥1 paint call');
    console.log('  validationFallbackDrawn: ', result.validationFallbackDrawn,
      result.validationFallbackDrawn > 0 ? '(fallback path active)' : '(normal path used)');
    console.log('  spriteRendered:          ', result.spriteRendered);
    console.log('  tacticalRendered:        ', result.tacticalRendered);
    console.log('  hoveredVesselId:         ', result.hoveredVesselId || '—');
    console.log('  validationDotSuppressed: ', result.validationDotSuppressed,
      '← validation vessels rerouted from dot LOD or SILHOUETTE/MARKER_ONLY');
    console.log('  validationSpriteForced:  ', result.validationSpriteForced,
      '← spriteLOD elevated from chevron/symbolic→simple');
    console.group('  §0524E draw-call proof (per-frame, count at actual paint site)');
    console.log('  headingConvention:            ', result.headingConvention);
    console.log('  sampleHeadingDeg:             ', result.sampleHeadingDeg,
      '→ rotationRad', result.sampleSpriteRotationRad.toFixed(4),
      '  motionBearing', result.sampleMotionBearingDeg + '°');
    console.log('  headingDebugOverlay:          ', result.headingDebugOverlay,
      '  (set SBE.runtimeFlags.showMaritimeHeadingDebug=true to enable green/red/blue arrows)');
    console.log('  compactSpriteRendered:        ', result.compactSpriteRendered,
      '← _drawCompactBoatSprite (zoom 11.2–13.2, clamped 8–18 × 3–7 px)');
    console.log('  farDotRendered:               ', result.farDotRendered,
      '← tiny signal dot (zoom < 11.2, no triangle)');
    console.log('  tinyLightDotRendered:         ', result.tinyLightDotRendered,
      '← core 1.5 px / halo 3.5 px star signal');
    console.log('  oversizedFarDotPrevented:     ', result.oversizedFarDotPrevented,
      '← compact path taken instead of large glyph');
    console.log('  chevronSuppressedForValidation:', result.chevronSuppressedForValidation,
      '← triangle/chevron paths bypassed for validation vessel');
    console.log('  validationGhostTierPromoted:  ', result.validationGhostTierPromoted,
      result.validationGhostTierPromoted > 0 ? ok : '—',
      '← GHOST→BACKGROUND promotion (PH returns GHOST for unknown validation MMSIs)');
    console.log('  validationSilhouettePromoted: ', result.validationSilhouettePromoted,
      result.validationSilhouettePromoted > 0 ? ok : bad,
      '← visClass SILHOUETTE/MARKER_ONLY intercepted before SILHOUETTE branch');
    console.log('  validationSpriteBranchEntered:', result.validationSpriteBranchEntered,
      result.validationSpriteBranchEntered > 0 ? ok : bad,
      '← FULL/REDUCED else-branch reached for validation vessel');
    console.log('  validationSymbolicOverridden: ', result.validationSymbolicOverridden,
      result.validationSymbolicOverridden > 0 ? ok : bad,
      '← sl symbolic/chevron → simple override fired');
    console.log('  validationSimpleSpriteDrawn:  ', result.validationSimpleSpriteDrawn,
      result.validationSimpleSpriteDrawn > 0 ? ok : bad,
      '← _drawBoatSprite() called for validation vessel');
    console.log('  validationChevronDrawn:       ', result.validationChevronDrawn,
      result.validationChevronDrawn === 0 ? ok : bad,
      '← _drawChevron() called for validation vessel (should be 0 at zoom≥10.8)');
    console.log('  validationDotDrawn:           ', result.validationDotDrawn,
      result.validationDotDrawn === 0 ? ok : bad,
      '← _drawFaintDot() called for validation vessel (should always be 0)');
    if (Object.keys(result.validationSpriteBranchSkippedReason).length > 0) {
      console.warn('  validationSpriteBranchSkippedReason:', result.validationSpriteBranchSkippedReason,
        '← validation vessels bypassed sprite dispatch (non-empty = routing leak)');
    }
    console.groupEnd();
    if (Object.keys(result.bodySkippedReasonCounts).length > 0) {
      console.warn('  bodySkippedReasonCounts: ', result.bodySkippedReasonCounts);
    }
    console.groupEnd();
    return result;
  }

  // ── Export ────────────────────────────────────────────────────────────────

  SBE.MaritimeOccupancyRenderer = {
    init,
    enable,
    destroy,
    isEnabled,
    isReady,
    getDebugSnapshot,
    debugMotionPresence,
    debugAISProjectionRenderer,
    debugBoatSpriteRenderer,
    debugMaritimeRuntimePath,
    seedWaterCorridors,
    seedDenseHarbor,
    clearSeedVessels,
    showSeedWaterDebug,
    debugVisibleSeedVessels,
    VERSION,

    // Returns last-frame render branch log for every vessel MOR drew.
    // Each entry: { mmsi, lod, pitch, branch: 'geoHull'|'sprite'|'dot' }
    // Read by _wos.debug.maritime25d.visibleRenderer().
    getMORRenderBranches: function () {
      var out  = [];
      var keys = Object.keys(_lastMORBranches);
      for (var ki = 0; ki < keys.length; ki++) {
        out.push(_lastMORBranches[keys[ki]]);
      }
      return out;
    },
  };

  console.log('[MaritimeOccupancyRenderer v' + VERSION + '] loaded — 0524 defensive validation pipeline');

})(window);
