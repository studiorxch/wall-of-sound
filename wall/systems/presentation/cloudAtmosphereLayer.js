// ── CloudAtmosphereLayer v1.0.0 ───────────────────────────────────────────────
// 0528C_WOS_CloudAtmosphereLayer_v1.0.0
// Status: active
// Classification: interpretation-layer
//
// Purpose:
//   Manages cloud atmosphere state: presets, altitude-band cloud profiles,
//   procedural cloud sheet geometry, and drift animation.
//   CloudAtmosphereRenderer reads this module each frame; this module owns
//   all data but performs no pixel writes.
//
// Altitude band cloud response:
//   ground      → nearly invisible, faint haze only
//   low_climb   → visible low cloud bands near horizon
//   mid_climb   → strongest cloud traversal feeling
//   high_cruise → broad thin cloud fields / distant sheeting
//
// Authority:
//   OWNS: cloud state, sheet geometry, drift state, preset config
//   READS: SBE.AltitudeWorldState (band, aerialHaze, horizonLift) — read-only
//   MUST NOT MUTATE: AircraftRuntime, maritime systems, Mapbox style
//
// Placement: wall/systems/presentation/cloudAtmosphereLayer.js
// Load: AFTER altitudeAwareWorldRenderer.js, BEFORE main.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  var VERSION = '1.0.0';

  // ── Presets ───────────────────────────────────────────────────────────────────
  // cloudOpacity:        master cloud brightness multiplier
  // shadowOpacity:       shadow blob darkness multiplier
  // horizonOpacity:      extra haze along the bottom edge of cloud sheets
  // driftSpeedPxPerSec:  base x-drift speed in canvas pixels per second
  // scale:               cloud blob size multiplier vs base
  // contrast:            0 = soft/diffuse, 1 = crisper edges
  // warmth:              -1 = cold blue tint, 0 = neutral, +1 = warm amber

  var PRESETS = Object.freeze({
    clear: Object.freeze({
      cloudOpacity:       0.05,
      shadowOpacity:      0.00,
      horizonOpacity:     0.05,
      driftSpeedPxPerSec: 10,
      scale:              1.0,
      contrast:           0.4,
      warmth:             0.0,
    }),
    thin: Object.freeze({
      cloudOpacity:       0.28,
      shadowOpacity:      0.03,
      horizonOpacity:     0.10,
      driftSpeedPxPerSec: 18,
      scale:              1.1,
      contrast:           0.65,
      warmth:             0.0,
    }),
    harbor_fog: Object.freeze({
      cloudOpacity:       0.46,
      shadowOpacity:      0.05,
      horizonOpacity:     0.30,
      driftSpeedPxPerSec: 7,
      scale:              1.35,
      contrast:           0.40,
      warmth:             0.38,
    }),
    storm_shelf: Object.freeze({
      cloudOpacity:       0.72,
      shadowOpacity:      0.14,
      horizonOpacity:     0.24,
      driftSpeedPxPerSec: 30,
      scale:              1.45,
      contrast:           0.95,
      warmth:            -0.18,
    }),
  });

  // ── Per-band cloud modulation ─────────────────────────────────────────────────
  // opacityFactor: multiplied against preset cloudOpacity
  // yBias:         0 = top of canvas, 1 = bottom — where cloud mass is centred
  // ySpread:       how tall (as fraction of canvas) the cloud zone is

  var BAND_CLOUD = Object.freeze({
    ground:      Object.freeze({ opacityFactor: 0.04, yBias: 0.80, ySpread: 0.12 }),
    low_climb:   Object.freeze({ opacityFactor: 0.48, yBias: 0.62, ySpread: 0.26 }),
    mid_climb:   Object.freeze({ opacityFactor: 1.00, yBias: 0.42, ySpread: 0.38 }),
    high_cruise: Object.freeze({ opacityFactor: 0.68, yBias: 0.24, ySpread: 0.30 }),
  });

  // Three named layers, each biased to a different screen-Y band:
  //   low  — below aircraft approach zone
  //   mid  — main cloud traversal zone
  //   high — thin sheets near top / horizon
  var SHEET_LAYERS = Object.freeze([
    Object.freeze({ id: 'low',  yFrac: 0.70, heightFrac: 0.22, blobCount: 12, seed: 4117 }),
    Object.freeze({ id: 'mid',  yFrac: 0.42, heightFrac: 0.30, blobCount: 14, seed: 7331 }),
    Object.freeze({ id: 'high', yFrac: 0.18, heightFrac: 0.20, blobCount: 10, seed: 2903 }),
  ]);

  // ── Seeded RNG (LCG) ──────────────────────────────────────────────────────────

  function _rng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 0x100000000;
    };
  }

  // Math.imul polyfill for older browsers
  if (!Math.imul) {
    Math.imul = function (a, b) {
      var ah = (a >>> 16) & 0xffff;
      var al = a & 0xffff;
      var bh = (b >>> 16) & 0xffff;
      var bl = b & 0xffff;
      return ((al * bl) + (((ah * bl + al * bh) << 16) >>> 0)) | 0;
    };
  }

  // ── CloudBlob ─────────────────────────────────────────────────────────────────
  // Deterministically generates blob geometry for one sheet.
  // x/y are fractions within the sheet's own rect (0–1).

  function _generateBlobs(seed, count) {
    var rng    = _rng(seed);
    var blobs  = [];
    var cols   = Math.ceil(Math.sqrt(count));
    var rows   = Math.ceil(count / cols);

    for (var i = 0; i < count; i++) {
      var col    = i % cols;
      var row    = Math.floor(i / cols);
      // Grid with random jitter so coverage is even but not mechanical
      var xBase  = (col + 0.5) / cols;
      var yBase  = (row + 0.5) / rows;
      var xJit   = (rng() - 0.5) * 0.55;
      var yJit   = (rng() - 0.5) * 0.65;

      blobs.push({
        // Normalised 0–1 within sheet rect
        xFrac:   Math.max(0.02, Math.min(0.98, xBase + xJit)),
        yFrac:   Math.max(0.05, Math.min(0.95, yBase + yJit)),
        // Ellipse radii: wide horizontal blobs
        rxFrac:  0.10 + rng() * 0.22,   // fraction of sheet width
        ryFrac:  0.25 + rng() * 0.45,   // fraction of blob rx (aspect ratio 0.25–0.7)
        opacity: 0.18 + rng() * 0.44,
        // Slight per-blob drift variation
        driftVariance: 0.55 + rng() * 0.90,
      });
    }
    return blobs;
  }

  // ── State ─────────────────────────────────────────────────────────────────────

  var _preset       = 'thin';
  var _enabled      = true;
  var _densityMult  = 1.0;
  var _speedMult    = 1.0;
  var _shadowsOn    = true;

  // Drift state per sheet: accumulated x offset in canvas pixels
  var _driftOffsets = {};   // { sheetId: { x, y } }
  var _lastTickMs   = 0;

  // Pre-generated blob geometry per sheet, at unit scale
  var _sheetBlobs   = {};   // { sheetId: [blob, ...] }

  // Interpolated band params (lerped externally from AltitudeWorldState)
  var _currentBandParams = { opacityFactor: 0.04, yBias: 0.80, ySpread: 0.12 };
  var _lerpBandFrom      = null;
  var _lerpBandTo        = null;
  var _bandLerpT         = 1.0;
  var _lastBandKey       = null;

  var BAND_LERP_SPEED = 0.022;   // per frame ≈ 45 frames to cross

  // ── Init ──────────────────────────────────────────────────────────────────────

  function _initSheets() {
    for (var li = 0; li < SHEET_LAYERS.length; li++) {
      var layer = SHEET_LAYERS[li];
      _sheetBlobs[layer.id]   = _generateBlobs(layer.seed, layer.blobCount);
      _driftOffsets[layer.id] = { x: 0, y: 0 };
    }
  }

  _initSheets();

  // ── _updateBandLerp() ─────────────────────────────────────────────────────────
  // Call once per frame from renderer (or internally).

  function _updateBandLerp() {
    var aws = global.SBE && SBE.AltitudeWorldState;
    var bandKey = (aws && aws.band) ? aws.band : 'ground';

    if (bandKey !== _lastBandKey) {
      _lerpBandFrom = {
        opacityFactor: _currentBandParams.opacityFactor,
        yBias:         _currentBandParams.yBias,
        ySpread:       _currentBandParams.ySpread,
      };
      _lerpBandTo  = BAND_CLOUD[bandKey] || BAND_CLOUD.ground;
      _bandLerpT   = 0;
      _lastBandKey = bandKey;
    }

    if (_bandLerpT < 1.0) {
      _bandLerpT = Math.min(1.0, _bandLerpT + BAND_LERP_SPEED);
      var t = _bandLerpT;
      _currentBandParams = {
        opacityFactor: _lerpBandFrom.opacityFactor + (_lerpBandTo.opacityFactor - _lerpBandFrom.opacityFactor) * t,
        yBias:         _lerpBandFrom.yBias         + (_lerpBandTo.yBias         - _lerpBandFrom.yBias)         * t,
        ySpread:       _lerpBandFrom.ySpread       + (_lerpBandTo.ySpread       - _lerpBandFrom.ySpread)       * t,
      };
    } else {
      _currentBandParams = {
        opacityFactor: _lerpBandTo ? _lerpBandTo.opacityFactor : _currentBandParams.opacityFactor,
        yBias:         _lerpBandTo ? _lerpBandTo.yBias         : _currentBandParams.yBias,
        ySpread:       _lerpBandTo ? _lerpBandTo.ySpread       : _currentBandParams.ySpread,
      };
    }
  }

  // ── updateDrift(nowMs, canvasWidth, canvasHeight) ─────────────────────────────
  // Advances drift state. Called once per frame by renderer.

  function updateDrift(nowMs, canvasWidth, canvasHeight) {
    if (_lastTickMs === 0) { _lastTickMs = nowMs; return; }
    var dt  = Math.min(0.1, (nowMs - _lastTickMs) / 1000);
    _lastTickMs = nowMs;

    var preset = PRESETS[_preset] || PRESETS.thin;
    var speed  = preset.driftSpeedPxPerSec * _speedMult;

    _updateBandLerp();

    for (var li = 0; li < SHEET_LAYERS.length; li++) {
      var layer = SHEET_LAYERS[li];
      var off   = _driftOffsets[layer.id];
      // Drift mostly horizontal, slight vertical oscillation
      off.x += speed * dt;
      off.y  = Math.sin(nowMs * 0.00012 + layer.seed * 0.01) * 4.0;  // gentle vertical sway
      // Wrap: when drift exceeds canvas width, reset by one width (seamless tile)
      if (canvasWidth > 0 && off.x > canvasWidth) off.x -= canvasWidth;
    }
  }

  // ── resolveCloudProfile() ─────────────────────────────────────────────────────
  // Returns the merged CloudAtmosphereProfile for the current frame.

  function resolveCloudProfile() {
    var base   = PRESETS[_preset] || PRESETS.thin;
    var band   = _currentBandParams;
    var aws    = global.SBE && SBE.AltitudeWorldState;
    var hazeMod = (aws && typeof aws.aerialHaze === 'number') ? (1.0 + aws.aerialHaze * 0.6) : 1.0;

    return {
      preset:             _preset,
      altitudeBand:       _lastBandKey || 'ground',
      cloudOpacity:       Math.min(1, base.cloudOpacity * band.opacityFactor * _densityMult * hazeMod),
      shadowOpacity:      base.shadowOpacity * band.opacityFactor * _densityMult,
      horizonOpacity:     base.horizonOpacity * band.opacityFactor,
      driftSpeedPxPerSec: base.driftSpeedPxPerSec * _speedMult,
      scale:              base.scale,
      contrast:           base.contrast,
      warmth:             base.warmth,
      yBias:              band.yBias,
      ySpread:            band.ySpread,
    };
  }

  // ── getSheets() ───────────────────────────────────────────────────────────────
  // Returns renderable sheet descriptors for this frame.

  function getSheets() {
    var profile = resolveCloudProfile();
    var sheets  = [];

    for (var li = 0; li < SHEET_LAYERS.length; li++) {
      var layer = SHEET_LAYERS[li];
      var off   = _driftOffsets[layer.id];

      // Each layer gets an opacity weight based on its Y vs current band yBias.
      // Layers closer to the yBias get more weight.
      var layerYCenter = layer.yFrac;
      var bandCenter   = profile.yBias;
      var dist         = Math.abs(layerYCenter - bandCenter);
      var zoneRadius   = profile.ySpread + layer.heightFrac * 0.5;
      var layerWeight  = Math.max(0, 1.0 - dist / Math.max(0.01, zoneRadius));
      // Smooth: square the weight for stronger zone focus
      layerWeight      = layerWeight * layerWeight;

      sheets.push({
        id:      layer.id,
        yFrac:   layer.yFrac,
        heightFrac: layer.heightFrac,
        blobs:   _sheetBlobs[layer.id],
        driftX:  off.x,
        driftY:  off.y,
        opacity: Math.min(1, profile.cloudOpacity * layerWeight),
        shadowOpacity: Math.min(0.18, profile.shadowOpacity * layerWeight),
        scale:   profile.scale,
        contrast:profile.contrast,
        warmth:  profile.warmth,
        weight:  layerWeight,
      });
    }

    return sheets;
  }

  // ── Public setters ────────────────────────────────────────────────────────────

  function setEnabled(val)        { _enabled    = !!val; }
  function isEnabled()            { return _enabled; }
  function setPreset(id)          {
    if (!PRESETS[id]) { console.warn('[CloudAtmosphereLayer] unknown preset:', id); return; }
    _preset = id;
    console.log('[CloudAtmosphereLayer] preset →', id);
  }
  function getPreset()            { return _preset; }
  function getProfile()           { return resolveCloudProfile(); }
  function setDensity(mult)       { _densityMult = Math.max(0, Math.min(5, Number(mult) || 1)); }
  function setSpeed(mult)         { _speedMult   = Math.max(0, Math.min(8, Number(mult) || 1)); }
  function setShadows(val)        { _shadowsOn   = !!val; }
  function shadowsEnabled()       { return _shadowsOn; }

  function getState() {
    var profile = resolveCloudProfile();
    return {
      enabled:         _enabled,
      preset:          _preset,
      altitudeBand:    _lastBandKey || 'ground',
      activeSheetCount:SHEET_LAYERS.length,
      cloudOpacity:    profile.cloudOpacity,
      shadowOpacity:   profile.shadowOpacity,
      densityMult:     _densityMult,
      speedMult:       _speedMult,
      shadowsOn:       _shadowsOn,
      bandLerpT:       _bandLerpT,
    };
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  SBE.CloudAtmosphereLayer = Object.freeze({
    VERSION:          VERSION,
    setEnabled:       setEnabled,
    isEnabled:        isEnabled,
    setPreset:        setPreset,
    getPreset:        getPreset,
    getProfile:       resolveCloudProfile,
    getSheets:        getSheets,
    updateDrift:      updateDrift,
    setDensity:       setDensity,
    setSpeed:         setSpeed,
    setShadows:       setShadows,
    shadowsEnabled:   shadowsEnabled,
    getState:         getState,
    PRESETS:          PRESETS,
    BAND_CLOUD:       BAND_CLOUD,
    SHEET_LAYERS:     SHEET_LAYERS,
  });

  console.log('[CloudAtmosphereLayer] v' + VERSION + ' loaded');

})(window);
