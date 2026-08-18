// ── MTASubwayPaletteAuthority v1.0.0 ──────────────────────────────────────────
// 0818_SUBWAY_Full_Live_Map_Integration_v1.0.0_BUILD — Data Layer §9
// Status: active | Classification: runtime-authority (persistent — localStorage)
//
// A dedicated SUBWAY palette authority — NOT an extension of
// mapsGeographicStyleAuthority.js. That authority's records are shaped
// `{values: Record<mapboxPropId, hex>}`, auto-discovered from an actual live
// Mapbox style's paint properties — it has no semantic-token concept and
// nothing to discover for SUBWAY's route-family tokens (route families are
// StudioRich-defined identity, not Mapbox paint properties). Extending it
// would mean bolting 10 fake "discovered" properties onto an unrelated
// system. This is the "create a dedicated authority" path the BUILD
// document itself offers as the primary option.
//
// Does NOT revive wall/maps/palettesGallery.js / paletteDetail.js — those
// are confirmed dead code calling methods that no longer exist anywhere
// (see the 2026-08-18 resumption audit §5).
//
// Resolution model:
//   route → semantic family (mtaSubwaySemanticFamily.js) → ACTIVE palette
//   → resolved display hex
// Switching the active palette NEVER touches route/station identity — this
// module has no write access to mtaSubwayIdentity.js/mtaSubwayStationLibrary.js
// and never will.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  var STORAGE_KEY = 'wos:subwayPalette:activeId';

  // StudioRich Fashion Subway — per 0818_SUBWAY_Current_State_v1.0.0.md §9.
  var FASHION_SUBWAY = Object.freeze({
    id: 'fashion_subway',
    label: 'StudioRich Fashion Subway',
    colors: Object.freeze({
      red_family: Object.freeze({ hex: '#8B2E2E', name: 'Carmine', mood: 'Heat, emotion, soulful loops, late-train energy' }),
      amber_family: Object.freeze({ hex: '#D98E04', name: 'Amber Ochre', mood: 'Optimism, movement, jazzy tones' }),
      gold_family: Object.freeze({ hex: '#C9A635', name: 'Gold', mood: 'Prestige, luxury drops, premium collections' }),
      green_family: Object.freeze({ hex: '#4F7942', name: 'Sage', mood: 'Calm, lo-fi focus, organic ambience' }),
      blue_family: Object.freeze({ hex: '#2E3A87', name: 'Indigo', mood: 'Nightline, deep city introspection' }),
      purple_family: Object.freeze({ hex: '#5A2A6D', name: 'Plum', mood: 'Dreamy, intimate, nostalgic loops' }),
      brown_family: Object.freeze({ hex: '#4B3621', name: 'Bronze', mood: 'Grit, vinyl warmth, underground flavor' }),
      mint_family: Object.freeze({ hex: '#93C572', name: 'Mint', mood: 'Freshness, experimental, emerging sound' }),
      teal_family: Object.freeze({ hex: '#43B3AE', name: 'Patina', mood: 'Reflective, oceanic, ambient travel' }),
      gray_family: Object.freeze({ hex: '#5A5A5A', name: 'Steel', mood: 'Neutral base, interline connective tissue' }),
    }),
  });

  // Official MTA Reference — the real, current route_color values verified
  // live from the real GTFS static feed during this build (see
  // mtaSubwaySemanticFamily.js header for the full derivation/evidence).
  // NOT assumed from memory or legacy documentation.
  var MTA_REFERENCE = Object.freeze({
    id: 'mta_reference',
    label: 'Official MTA Reference',
    colors: Object.freeze({
      red_family: Object.freeze({ hex: '#D82233', name: 'MTA Red', mood: null }),
      green_family: Object.freeze({ hex: '#009952', name: 'MTA Green', mood: null }),
      purple_family: Object.freeze({ hex: '#9A38A1', name: 'MTA Purple', mood: null }),
      blue_family: Object.freeze({ hex: '#0062CF', name: 'MTA Blue', mood: null }),
      amber_family: Object.freeze({ hex: '#EB6800', name: 'MTA Orange', mood: null }),
      mint_family: Object.freeze({ hex: '#799534', name: 'MTA Crosstown Green', mood: null }),
      brown_family: Object.freeze({ hex: '#8E5C33', name: 'MTA Brown', mood: null }),
      gold_family: Object.freeze({ hex: '#F6BC26', name: 'MTA Yellow', mood: null }),
      gray_family: Object.freeze({ hex: '#7C858C', name: 'MTA Gray', mood: null }),
      teal_family: Object.freeze({ hex: '#08179C', name: 'MTA Navy (SIR)', mood: null }),
    }),
  });

  var PALETTES = Object.freeze({ fashion_subway: FASHION_SUBWAY, mta_reference: MTA_REFERENCE });
  var DEFAULT_PALETTE_ID = 'fashion_subway';

  var _activeId = DEFAULT_PALETTE_ID;
  var _listeners = [];
  var _loaded = false;

  function _ls() { try { return global.localStorage || null; } catch (e) { return null; } }
  function _notify() { _listeners.forEach(function (fn) { try { fn(); } catch (e) {} }); }
  function subscribe(fn) { _listeners.push(fn); return function () { _listeners = _listeners.filter(function (f) { return f !== fn; }); }; }

  function _load() {
    if (_loaded) return;
    _loaded = true;
    var ls = _ls(); if (!ls) return;
    try {
      var stored = ls.getItem(STORAGE_KEY);
      if (stored && PALETTES[stored]) _activeId = stored;
    } catch (e) {}
  }

  function listPalettes() { return Object.keys(PALETTES).map(function (id) { return PALETTES[id]; }); }
  function getPalette(id) { return PALETTES[id] || null; }
  function getActivePaletteId() { _load(); return _activeId; }
  function getActivePalette() { _load(); return PALETTES[_activeId]; }

  function setActivePalette(id) {
    if (!PALETTES[id]) return { ok: false, reason: 'unknown_palette' };
    _activeId = id;
    var ls = _ls();
    if (ls) { try { ls.setItem(STORAGE_KEY, id); } catch (e) {} }
    _notify();
    return { ok: true };
  }

  // The one function route/station rendering code should call — resolves a
  // semantic family through whichever palette is currently active. Never
  // mutates route/station identity; purely a display lookup.
  function resolveFamilyColor(familyId) {
    _load();
    var palette = PALETTES[_activeId];
    if (!palette || !familyId) return null;
    var entry = palette.colors[familyId];
    return entry ? entry.hex : null;
  }

  function resolveFamilyEntry(familyId) {
    _load();
    var palette = PALETTES[_activeId];
    if (!palette || !familyId) return null;
    return palette.colors[familyId] || null;
  }

  SBE.MTASubwayPaletteAuthority = Object.freeze({
    VERSION: VERSION,
    DEFAULT_PALETTE_ID: DEFAULT_PALETTE_ID,
    listPalettes: listPalettes,
    getPalette: getPalette,
    getActivePaletteId: getActivePaletteId,
    getActivePalette: getActivePalette,
    setActivePalette: setActivePalette,
    resolveFamilyColor: resolveFamilyColor,
    resolveFamilyEntry: resolveFamilyEntry,
    subscribe: subscribe,
  });

  console.log('[MTASubwayPaletteAuthority] v' + VERSION + ' loaded — 2 palettes (fashion_subway default)');
})(window);
