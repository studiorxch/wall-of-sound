// ── ObjectProfileRegistry v1.0.0 ─────────────────────────────────────────────
// 0528I_WOS_ObjectCustomizationAndGenerationDoctrine_v1.0.0
// Status: active
// Classification: registry — shared data contract
//
// Purpose:
//   Single source of truth for WOS object profiles across all object categories.
//   A profile describes the visual language, geometry mode, material slots, LOD
//   expectations, and runtime hints for one object class.
//
//   This registry does NOT drive rendering directly — it supplies normalized
//   profile data consumed by renderers and presentation systems.
//
// System role: Object Generator side-car data contract.
//   Object Generator = form factory (geometry, LOD, silhouette)
//   Color Lab        = color/material/style authority
//   WOS Runtime      = placement, motion, atmosphere, behavior
//
// Public API:
//   SBE.ObjectProfileRegistry.getProfile(id)       → profile | null
//   SBE.ObjectProfileRegistry.getProfileForClass(category, classKey) → profile | null
//   SBE.ObjectProfileRegistry.listCategory(category) → profile[]
//   SBE.ObjectProfileRegistry.getAircraftPalette(classKey, paletteRef) → { fill, stroke, glass, accent, light }
//   SBE.ObjectProfileRegistry.getState()           → state snapshot
//
// Placement: wall/registries/objectProfileRegistry.js
// Load: BEFORE aircraftRenderer.js, marineRenderer.js, vesselVisualProfile.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  var VERSION = '1.0.0';

  // ── Object categories ─────────────────────────────────────────────────────────

  var CAT_MARITIME    = 'maritime';
  var CAT_AVIATION    = 'aviation';
  var CAT_AIRPORT_GND = 'airport_ground';
  var CAT_ROAD        = 'road';
  var CAT_RAIL        = 'rail';
  var CAT_INFRA       = 'infrastructure';
  var CAT_ARCADE      = 'arcade';
  var CAT_ORBITAL     = 'orbital';
  var CAT_CROWD       = 'crowd';

  // ── Geometry modes ────────────────────────────────────────────────────────────

  var GEO_ICON_CANVAS      = 'icon_canvas';      // 2D canvas-drawn icon (current aircraft/vessel)
  var GEO_SPRITE_TOP       = 'sprite_top';       // flat top-down sprite
  var GEO_LOW_POLY_MESH    = 'low_poly_mesh';    // future .glb low-poly mesh
  var GEO_PROCEDURAL_HULL  = 'procedural_hull';  // procedurally generated hull polygon

  // ── LOD keys ─────────────────────────────────────────────────────────────────

  var LOD_FAR   = 'far';   // point or silhouette dot
  var LOD_MID   = 'mid';   // simplified shape
  var LOD_NEAR  = 'near';  // full low-poly representation
  var LOD_HERO  = 'hero';  // close camera, maximum detail

  // ── Visual language tags ──────────────────────────────────────────────────────

  var VL_WOS_CANVAS_ICON   = 'wos_canvas_icon';    // current flat 2D icon system
  var VL_WOS_LOW_POLY      = 'wos_low_poly_massing'; // target low-poly 3D-style massing

  // ── Material slot keys ────────────────────────────────────────────────────────
  // Canonical slot names for all WOS objects. Not all slots apply to all objects.

  var MAT_BODY       = 'body';       // primary hull / fuselage / chassis fill
  var MAT_SECONDARY  = 'secondary';  // secondary hull, under-surface, belly
  var MAT_GLASS      = 'glass';      // windows, cockpit glass
  var MAT_ACCENT     = 'accent';     // livery accent, stripe, trim
  var MAT_LIGHT      = 'light';      // navigation lights, beacons
  var MAT_DECK       = 'deck';       // deck, superstructure (maritime)
  var MAT_STROKE     = 'stroke';     // outline / edge line

  // ── Aircraft palettes ─────────────────────────────────────────────────────────
  //
  // Palette doctrine (aviation):
  //   Atmospheric, cinema-blue. Cool sky tones dominate. No photorealism.
  //   Light bodies read against dark water / dark terrain at altitude.
  //   Palette names reference the lighting condition at typical use (e.g.
  //   airport_dawn = warm morning departure light).
  //
  //   White must NOT be the primary body fill. White is reserved for:
  //   hover, selection, debug, emergency.

  var _AIRCRAFT_PALETTES = {

    // ── airport_dawn ─────────────────────────────────────────────────────────
    // Morning departure atmosphere. Warm blue-gray body, cool sky stroke.
    airport_dawn: {
      REGIONAL_JET: {
        body:   '#C8E8FF',   // pale blue-white — wide-body sky tone
        stroke: '#78BAEE',   // medium sky blue
        glass:  'rgba(30,60,90,0.70)',
        accent: '#4A9FD8',
        light:  '#FFE080',   // warm nav beacon
      },
      NARROWBODY: {
        body:   '#DAEEFF',
        stroke: '#96CBFF',
        glass:  'rgba(30,60,90,0.70)',
        accent: '#5BB2E8',
        light:  '#FFE080',
      },
      WIDEBODY: {
        body:   '#EAF4FF',
        stroke: '#AADCFF',
        glass:  'rgba(30,60,90,0.65)',
        accent: '#6EC0F2',
        light:  '#FFE080',
      },
      HELICOPTER: {
        body:   '#FFE8B0',   // warm utility yellow
        stroke: '#FFC850',
        glass:  'rgba(40,30,20,0.60)',
        accent: '#FFB030',
        light:  '#80E8FF',
      },
      CARGO_PLANE: {
        body:   '#8AAABB',   // dull freight gray
        stroke: '#5A8899',
        glass:  'rgba(20,40,55,0.65)',
        accent: '#6BA0B2',
        light:  '#FFE080',
      },
      PROP_COMMUTER: {
        body:   '#B8D4E8',
        stroke: '#6EA0C0',
        glass:  'rgba(30,55,80,0.65)',
        accent: '#5090B8',
        light:  '#FFE080',
      },
      unknown: {
        body:   '#CCDDE8',
        stroke: '#88AACC',
        glass:  'rgba(20,40,60,0.55)',
        accent: '#70A0C0',
        light:  '#FFE0A0',
      },
    },

    // ── harbor_fog ────────────────────────────────────────────────────────────
    // Low-visibility, desaturated. Overcast coastal departure / arrival.
    harbor_fog: {
      REGIONAL_JET: {
        body:   '#B0C8D8',
        stroke: '#6A90A8',
        glass:  'rgba(20,40,58,0.65)',
        accent: '#4878A0',
        light:  '#FFEEAA',
      },
      unknown: {
        body:   '#A8BECE',
        stroke: '#6888A0',
        glass:  'rgba(20,35,55,0.55)',
        accent: '#4070A0',
        light:  '#FFEEAD',
      },
    },

    // ── night_approach ────────────────────────────────────────────────────────
    // Night descent. Dark muted bodies, brighter nav light accents.
    night_approach: {
      REGIONAL_JET: {
        body:   '#2A3D50',   // very dark slate — barely visible at night
        stroke: 'rgba(100,160,210,0.50)',
        glass:  'rgba(10,20,35,0.80)',
        accent: '#1E6090',
        light:  '#FFD060',   // bright warm beacon
      },
      unknown: {
        body:   '#202E3C',
        stroke: 'rgba(80,120,160,0.45)',
        glass:  'rgba(10,20,35,0.75)',
        accent: '#184870',
        light:  '#FFCC50',
      },
    },
  };

  // ── Object profile definitions ────────────────────────────────────────────────
  //
  // One entry per concrete WOS object class.
  // id format: wos_object_{category}_{classKey_lower}_{sequence}

  var _PROFILES = [

    // ── aviation ──────────────────────────────────────────────────────────────

    {
      id:             'wos_object_aviation_regional_jet_001',
      category:       CAT_AVIATION,
      classKey:       'REGIONAL_JET',
      displayName:    'Regional Jet',
      geometryMode:   GEO_ICON_CANVAS,         // current draw mode
      visualLanguage: VL_WOS_CANVAS_ICON,
      paletteRef:     'airport_dawn',
      materialSlots: {
        body:     MAT_BODY,
        stroke:   MAT_STROKE,
        glass:    MAT_GLASS,
        accent:   MAT_ACCENT,
        light:    MAT_LIGHT,
      },
      lod: {
        far:  LOD_FAR,
        mid:  LOD_MID,
        near: LOD_NEAR,
        hero: LOD_HERO,
      },
      scale: {
        lengthMeters: 36,
        widthMeters:  29,
        heightMeters: 11,
      },
      runtimeHints: {
        supportsAltitudeScaling:  true,
        supportsNavigationLights: true,
        supportsShadow:           true,
        supportsAtmosphereTint:   true,
      },
    },

    {
      id:             'wos_object_aviation_narrowbody_001',
      category:       CAT_AVIATION,
      classKey:       'NARROWBODY',
      displayName:    'Narrowbody Jet',
      geometryMode:   GEO_ICON_CANVAS,
      visualLanguage: VL_WOS_CANVAS_ICON,
      paletteRef:     'airport_dawn',
      materialSlots: {
        body: MAT_BODY, stroke: MAT_STROKE, glass: MAT_GLASS,
        accent: MAT_ACCENT, light: MAT_LIGHT,
      },
      lod: { far: LOD_FAR, mid: LOD_MID, near: LOD_NEAR, hero: LOD_HERO },
      scale: { lengthMeters: 46, widthMeters: 35, heightMeters: 13 },
      runtimeHints: {
        supportsAltitudeScaling: true, supportsNavigationLights: true,
        supportsShadow: true, supportsAtmosphereTint: true,
      },
    },

    {
      id:             'wos_object_aviation_widebody_001',
      category:       CAT_AVIATION,
      classKey:       'WIDEBODY',
      displayName:    'Widebody Jet',
      geometryMode:   GEO_ICON_CANVAS,
      visualLanguage: VL_WOS_CANVAS_ICON,
      paletteRef:     'airport_dawn',
      materialSlots: {
        body: MAT_BODY, stroke: MAT_STROKE, glass: MAT_GLASS,
        accent: MAT_ACCENT, light: MAT_LIGHT,
      },
      lod: { far: LOD_FAR, mid: LOD_MID, near: LOD_NEAR, hero: LOD_HERO },
      scale: { lengthMeters: 64, widthMeters: 60, heightMeters: 18 },
      runtimeHints: {
        supportsAltitudeScaling: true, supportsNavigationLights: true,
        supportsShadow: true, supportsAtmosphereTint: true,
      },
    },

    {
      id:             'wos_object_aviation_helicopter_001',
      category:       CAT_AVIATION,
      classKey:       'HELICOPTER',
      displayName:    'Helicopter',
      geometryMode:   GEO_ICON_CANVAS,
      visualLanguage: VL_WOS_CANVAS_ICON,
      paletteRef:     'airport_dawn',
      materialSlots: {
        body: MAT_BODY, stroke: MAT_STROKE, glass: MAT_GLASS,
        accent: MAT_ACCENT, light: MAT_LIGHT,
      },
      lod: { far: LOD_FAR, mid: LOD_MID, near: LOD_NEAR, hero: LOD_HERO },
      scale: { lengthMeters: 14, widthMeters: 13, heightMeters: 4 },
      runtimeHints: {
        supportsAltitudeScaling: true, supportsNavigationLights: true,
        supportsShadow: true, supportsAtmosphereTint: false,
      },
    },

    {
      id:             'wos_object_aviation_cargo_plane_001',
      category:       CAT_AVIATION,
      classKey:       'CARGO_PLANE',
      displayName:    'Cargo Plane',
      geometryMode:   GEO_ICON_CANVAS,
      visualLanguage: VL_WOS_CANVAS_ICON,
      paletteRef:     'airport_dawn',
      materialSlots: {
        body: MAT_BODY, stroke: MAT_STROKE, glass: MAT_GLASS,
        accent: MAT_ACCENT, light: MAT_LIGHT,
      },
      lod: { far: LOD_FAR, mid: LOD_MID, near: LOD_NEAR, hero: LOD_HERO },
      scale: { lengthMeters: 76, widthMeters: 60, heightMeters: 19 },
      runtimeHints: {
        supportsAltitudeScaling: true, supportsNavigationLights: true,
        supportsShadow: true, supportsAtmosphereTint: true,
      },
    },

  ];

  // ── Index builds ──────────────────────────────────────────────────────────────

  var _byId = {};
  var _byClass = {};  // 'category:classKey' → profile

  function _buildIndexes() {
    for (var i = 0; i < _PROFILES.length; i++) {
      var p = _PROFILES[i];
      _byId[p.id] = p;
      _byClass[p.category + ':' + p.classKey] = p;
    }
  }

  _buildIndexes();

  // ── Public API ────────────────────────────────────────────────────────────────

  function getProfile(id) {
    return _byId[id] || null;
  }

  function getProfileForClass(category, classKey) {
    return _byClass[category + ':' + classKey] || null;
  }

  function listCategory(category) {
    return _PROFILES.filter(function (p) { return p.category === category; });
  }

  // Resolve fill/stroke/glass/accent/light colors for an aircraft.
  // Falls back: classKey → 'unknown' within paletteRef → first available palette.
  function getAircraftPalette(classKey, paletteRef) {
    var ref = paletteRef || 'airport_dawn';
    var palette = _AIRCRAFT_PALETTES[ref] || _AIRCRAFT_PALETTES.airport_dawn;
    return palette[classKey] || palette.unknown || _AIRCRAFT_PALETTES.airport_dawn.unknown;
  }

  function getState() {
    return {
      version:       VERSION,
      profileCount:  _PROFILES.length,
      categories:    Object.keys(
        _PROFILES.reduce(function (a, p) { a[p.category] = 1; return a; }, {})
      ),
    };
  }

  // ── Exports ───────────────────────────────────────────────────────────────────

  SBE.ObjectProfileRegistry = {
    getProfile:          getProfile,
    getProfileForClass:  getProfileForClass,
    listCategory:        listCategory,
    getAircraftPalette:  getAircraftPalette,
    getState:            getState,

    // constants exposed for renderer use
    CAT: {
      MARITIME: CAT_MARITIME, AVIATION: CAT_AVIATION,
      AIRPORT_GND: CAT_AIRPORT_GND, ROAD: CAT_ROAD,
      RAIL: CAT_RAIL, INFRA: CAT_INFRA, ARCADE: CAT_ARCADE,
      ORBITAL: CAT_ORBITAL, CROWD: CAT_CROWD,
    },
    GEO: {
      ICON_CANVAS: GEO_ICON_CANVAS, SPRITE_TOP: GEO_SPRITE_TOP,
      LOW_POLY_MESH: GEO_LOW_POLY_MESH, PROCEDURAL_HULL: GEO_PROCEDURAL_HULL,
    },
    LOD: { FAR: LOD_FAR, MID: LOD_MID, NEAR: LOD_NEAR, HERO: LOD_HERO },
    MAT: {
      BODY: MAT_BODY, SECONDARY: MAT_SECONDARY, GLASS: MAT_GLASS,
      ACCENT: MAT_ACCENT, LIGHT: MAT_LIGHT, DECK: MAT_DECK, STROKE: MAT_STROKE,
    },
  };

  if (typeof console !== 'undefined' && console.log) {
    console.log(
      '[ObjectProfileRegistry v' + VERSION + '] ' +
      _PROFILES.length + ' profiles registered across ' +
      SBE.ObjectProfileRegistry.getState().categories.length + ' categories.'
    );
  }

}(typeof window !== 'undefined' ? window : this));
