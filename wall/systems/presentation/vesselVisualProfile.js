// ── VesselVisualProfile v1.0.0 ────────────────────────────────────────────────
// 0528H_WOS_VesselVisualUnificationPass_v1.0.0
// Status: active
// Classification: presentation authority — visual identity, not truth
//
// Purpose:
//   Single source of truth for vessel color identity.
//   Both the geo-projected hull path (pitch >= 28°) and the screen-space
//   sprite path (pitch < 28°) must consume identical class-based colors.
//   White is reserved for hover/selection/emergency/debug only.
//
// Palette: cinematic_harbor (default)
//   Colors derived from real harbor photography — muted steel, weathered
//   rust, salt-bleached hull paint. Saturated enough to read on dark water,
//   desaturated enough to not compete with Mapbox labels.
//
// Public API:
//   SBE.VesselVisualProfile.resolveProfile(vessel, camera, options) → profile
//   SBE.VesselVisualProfile.getPalette()         → paletteName
//   SBE.VesselVisualProfile.setPalette(name)     → bool
//   SBE.VesselVisualProfile.getState()           → state snapshot
//
// Placement: wall/systems/presentation/vesselVisualProfile.js
// Load: AFTER vesselClassPresentation.js, BEFORE maritimeOccupancyRenderer.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  var VERSION = '1.0.0';

  // ── Active palette ────────────────────────────────────────────────────────────

  var _activePalette = 'cinematic_harbor';

  // ── Palette registry ──────────────────────────────────────────────────────────
  // Each palette entry: { hull, stroke, deck, accent }
  //   hull   — primary fill for geo hull polygon and sprite body
  //   stroke — outline / edge line
  //   deck   — superstructure / deck block detail (geo hull detail pass)
  //   accent — centerline stripe or running-light accent
  //
  // White (#fff / rgba(255,255,255,...)) must NOT appear in any hull/stroke/deck.
  // White is reserved: hover highlight, selection ring, emergency pulse, debug text.

  var _PALETTES = {

    // ── cinematic_harbor ──────────────────────────────────────────────────────
    // Derived from harbor photography color grading. Muted, nautically authentic.
    cinematic_harbor: {
      CARGO: {
        hull:   '#3d5a6b',   // weathered navy-slate
        stroke: 'rgba(90,140,160,0.55)',
        deck:   '#2a3f4a',   // dark superstructure
        accent: 'rgba(100,170,190,0.40)',
      },
      TANKER: {
        hull:   '#6b3a2a',   // oxide red / rust
        stroke: 'rgba(160,90,65,0.55)',
        deck:   '#4a2318',
        accent: 'rgba(200,110,70,0.40)',
      },
      FERRY: {
        hull:   '#3a6e78',   // ocean cyan-teal
        stroke: 'rgba(80,160,175,0.55)',
        deck:   '#2a5059',
        accent: 'rgba(100,200,215,0.45)',
      },
      PASSENGER: {
        hull:   '#2d5f6e',   // deep harbor teal
        stroke: 'rgba(70,150,165,0.55)',
        deck:   '#1e4550',
        accent: 'rgba(90,185,205,0.45)',
      },
      FISHING: {
        hull:   '#5c6b3a',   // weathered olive / working boat
        stroke: 'rgba(120,140,75,0.50)',
        deck:   '#404c28',
        accent: 'rgba(145,170,85,0.40)',
      },
      TUG: {
        hull:   '#7a4a1a',   // burnt sienna / work-boat orange-brown
        stroke: 'rgba(170,110,50,0.55)',
        deck:   '#5a3210',
        accent: 'rgba(210,140,65,0.45)',
      },
      SERVICE: {
        hull:   '#3a5c6e',   // harbour authority blue
        stroke: 'rgba(80,140,165,0.50)',
        deck:   '#273e4a',
        accent: 'rgba(100,165,190,0.40)',
      },
      PILOT: {
        hull:   '#1e4d72',   // deep pilot-boat blue
        stroke: 'rgba(55,120,175,0.55)',
        deck:   '#12344f',
        accent: 'rgba(75,150,210,0.50)',
      },
      MILITARY: {
        hull:   '#3d4a3a',   // naval grey-green
        stroke: 'rgba(85,105,80,0.50)',
        deck:   '#2a3428',
        accent: 'rgba(110,135,105,0.40)',
      },
      RECREATIONAL: {
        hull:   '#4a6b55',   // sea-green / leisure boat
        stroke: 'rgba(100,150,115,0.50)',
        deck:   '#334a3c',
        accent: 'rgba(125,185,140,0.40)',
      },
      INDUSTRIAL: {
        hull:   '#5a4a2a',   // sand / dredger yellow-brown
        stroke: 'rgba(130,110,60,0.50)',
        deck:   '#3e3318',
        accent: 'rgba(165,140,75,0.40)',
      },
      UNKNOWN: {
        hull:   '#3d4a55',   // neutral blue-grey
        stroke: 'rgba(90,110,125,0.45)',
        deck:   '#2a3440',
        accent: 'rgba(110,135,155,0.35)',
      },
    },

    // ── high_contrast ─────────────────────────────────────────────────────────
    // Debug / accessibility palette. More saturated, easier to distinguish.
    high_contrast: {
      CARGO:       { hull: '#4477aa', stroke: 'rgba(100,160,220,0.65)', deck: '#2d5580', accent: 'rgba(130,195,255,0.50)' },
      TANKER:      { hull: '#cc4422', stroke: 'rgba(220,100,70,0.65)',  deck: '#992210', accent: 'rgba(255,130,90,0.50)'  },
      FERRY:       { hull: '#22aaaa', stroke: 'rgba(60,200,200,0.65)',  deck: '#107a7a', accent: 'rgba(90,240,240,0.50)'  },
      PASSENGER:   { hull: '#1188cc', stroke: 'rgba(50,170,230,0.65)',  deck: '#0d6699', accent: 'rgba(80,200,255,0.50)'  },
      FISHING:     { hull: '#88aa22', stroke: 'rgba(165,205,55,0.60)',  deck: '#607a10', accent: 'rgba(200,240,65,0.45)'  },
      TUG:         { hull: '#cc7722', stroke: 'rgba(220,155,60,0.60)',  deck: '#995511', accent: 'rgba(255,185,75,0.50)'  },
      SERVICE:     { hull: '#4488cc', stroke: 'rgba(100,170,225,0.60)', deck: '#2d6099', accent: 'rgba(130,200,255,0.45)' },
      PILOT:       { hull: '#2255cc', stroke: 'rgba(70,120,230,0.65)',  deck: '#163399', accent: 'rgba(90,155,255,0.55)'  },
      MILITARY:    { hull: '#557744', stroke: 'rgba(115,155,95,0.55)',  deck: '#3d5530', accent: 'rgba(145,190,120,0.45)' },
      RECREATIONAL:{ hull: '#44aa66', stroke: 'rgba(95,200,130,0.55)',  deck: '#2d7748', accent: 'rgba(120,235,160,0.45)' },
      INDUSTRIAL:  { hull: '#aa8822', stroke: 'rgba(200,170,55,0.55)',  deck: '#776010', accent: 'rgba(240,205,65,0.45)'  },
      UNKNOWN:     { hull: '#667788', stroke: 'rgba(130,150,170,0.50)', deck: '#445566', accent: 'rgba(160,185,205,0.40)' },
    },

  };

  // ── Class key normalisation ───────────────────────────────────────────────────
  // MOR/MarineRenderer use uppercase class strings; AIS runtime may vary.

  var _CLASS_MAP = {
    cargo:        'CARGO',
    tanker:       'TANKER',
    ferry:        'FERRY',
    passenger:    'PASSENGER',
    fishing:      'FISHING',
    tug:          'TUG',
    service:      'SERVICE',
    pilot:        'PILOT',
    military:     'MILITARY',
    naval:        'MILITARY',
    recreational: 'RECREATIONAL',
    pleasure:     'RECREATIONAL',
    industrial:   'INDUSTRIAL',
    dredger:      'INDUSTRIAL',
    barge:        'INDUSTRIAL',
    unknown:      'UNKNOWN',
  };

  function _normaliseClass(raw) {
    if (!raw) return 'UNKNOWN';
    var k = String(raw).toLowerCase().trim();
    return _CLASS_MAP[k] || String(raw).toUpperCase().trim() || 'UNKNOWN';
  }

  // ── Profile cache ─────────────────────────────────────────────────────────────
  // One entry per (mmsi, paletteName). Cleared on palette change.

  var _profileCache = {};
  var _profileCacheVersion = 0;

  function _cacheKey(mmsi, classKey) {
    return _activePalette + ':' + classKey + ':' + (mmsi || 'anon');
  }

  // ── resolveProfile ────────────────────────────────────────────────────────────
  //
  // Returns a plain object with stable color identity for the vessel.
  //
  // options: {
  //   classKey    : string  — vessel class, uppercase preferred  (CARGO, TANKER…)
  //   lod         : string  — 'dot' | 'sprite' | 'chevron'
  //   source      : string  — 'ais' | 'synthetic' | 'seed'
  //   hovered     : bool
  //   isStatic    : bool
  //   isLightOnly : bool
  //   isEmergency : bool
  //   lenPxHint   : number  — projected hull length in pixels (for detail tier)
  // }
  //
  // Returns: {
  //   hullColor    : string  — fill colour for hull body
  //   strokeColor  : string  — outline
  //   deckColor    : string  — deck / superstructure
  //   accentColor  : string  — centerline / running-light accent
  //   detailTier   : 0|1|2   — 0=none, 1=centerline (≥10px), 2=deck block (≥24px)
  //   classKey     : string  — normalised class key used
  //   paletteUsed  : string  — active palette name
  //   fromCache    : bool
  // }

  function resolveProfile(vessel, camera, options) {
    options = options || {};

    var rawClass = options.classKey || (vessel && vessel.vesselClass) || 'UNKNOWN';
    var classKey = _normaliseClass(rawClass);
    var lenPx    = options.lenPxHint || 0;

    var ck = _cacheKey(vessel && vessel.mmsi, classKey);
    if (_profileCache[ck] && _profileCache[ck]._ver === _profileCacheVersion) {
      // Update detail tier (depends on current zoom) and return
      var cached = _profileCache[ck];
      cached.detailTier = _detailTier(lenPx);
      cached.fromCache  = true;
      return cached;
    }

    var pal   = _PALETTES[_activePalette] || _PALETTES.cinematic_harbor;
    var entry = pal[classKey] || pal.UNKNOWN;

    var profile = {
      hullColor:   entry.hull,
      strokeColor: entry.stroke,
      deckColor:   entry.deck,
      accentColor: entry.accent,
      detailTier:  _detailTier(lenPx),
      classKey:    classKey,
      paletteUsed: _activePalette,
      fromCache:   false,
      _ver:        _profileCacheVersion,
    };

    _profileCache[ck] = profile;
    return profile;
  }

  function _detailTier(lenPx) {
    if (lenPx >= 24) return 2; // deck block + centerline
    if (lenPx >= 10) return 1; // centerline only
    return 0;
  }

  // ── Palette management ────────────────────────────────────────────────────────

  function getPalette() { return _activePalette; }

  function setPalette(name) {
    if (!_PALETTES[name]) {
      console.warn('[VesselVisualProfile] Unknown palette:', name,
                   '— available:', Object.keys(_PALETTES).join(', '));
      return false;
    }
    _activePalette = name;
    _profileCacheVersion++;
    _profileCache  = {};
    console.log('[VesselVisualProfile] Palette →', name);
    return true;
  }

  function listPalettes() { return Object.keys(_PALETTES); }

  // ── State snapshot ────────────────────────────────────────────────────────────

  function getState() {
    return {
      version:        VERSION,
      activePalette:  _activePalette,
      availablePalettes: Object.keys(_PALETTES),
      cacheSize:      Object.keys(_profileCache).length,
      cacheVersion:   _profileCacheVersion,
    };
  }

  // ── Export ────────────────────────────────────────────────────────────────────

  SBE.VesselVisualProfile = {
    resolveProfile:  resolveProfile,
    getPalette:      getPalette,
    setPalette:      setPalette,
    listPalettes:    listPalettes,
    getState:        getState,
    // expose normaliser for testing
    normaliseClass:  _normaliseClass,
  };

})(window);
