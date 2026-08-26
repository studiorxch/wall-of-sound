// ── MTASubwayPaletteAuthority v2.1.0 ──────────────────────────────────────────
// 0818_SUBWAY_Full_Live_Map_Integration_v1.0.0_BUILD — Data Layer §9
// Extended by 0818_SUBWAY_Train_Rendering_Palette_Library_v1.0.0_BUILD §7-9:
// each palette now also carries structured, non-route-color presentation
// tokens (station fill/stroke/selected, train presentation, route line width
// baseline) beyond the existing per-family route/train color resolution —
// moved OUT of hardcoded constants in mtaSubwayMapLayer.js so palette data
// stays centralized (BUILD §7: "rather than hardcoding train/station colors
// inside rendering code"). The existing route-family color resolution
// (colors/resolveFamilyColor/resolveFamilyEntry) is completely unchanged —
// this only ADDS the `train`/`station` sections and flips DEFAULT_PALETTE_ID
// to mta_reference (BUILD §8: "Official MTA Reference ... as the active
// default for this build").
//
// Extended again by the "SUBWAY Train Contrast / LOD Fix" patch: `train`
// tokens changed from a plain white outline to a distance-aware visual
// hierarchy (BUILD doctrine: "Official MTA route colors = infrastructure
// identity, neutral grey = distant rolling stock, proximity = progressively
// restores route color") — `neutralBody`/`casing` replace the flat
// `outline`, `selectedBody`/`selectedCasing` replace `selectedOutline`. The
// zoom-based grey→route blend math itself lives in mtaSubwayMapLayer.js
// (a rendering/LOD concern); this authority only owns the reusable color
// VALUES the blend interpolates between.
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
  var VERSION = '2.1.0';

  var STORAGE_KEY = 'wos:subwayPalette:activeId';

  // Non-route-color structured presentation tokens (BUILD §7's own
  // conceptual SubwayPalette shape: station.fill/stroke/selected, train
  // presentation). Both seed palettes currently share the same neutral
  // station/train chrome — only the route-family hues differ between them;
  // a future palette (Night/Monochrome/Broadcast, per the Data Architecture
  // doc §2.E) can diverge these independently since they're already a
  // distinct, per-palette field.
  var NEUTRAL_STATION = Object.freeze({
    fill: '#ffffff', stroke: '#111111', selected: '#ff9f1c',
  });
  // Train Contrast / LOD Fix — a train's BODY color is never a flat
  // constant; mtaSubwayMapLayer.js blends between `neutralBody` (distant)
  // and the route's own resolved color (close) based on zoom, using these
  // as the two blend endpoints. `casing`/`selectedCasing` are flat (no
  // blend) — the casing's job is to stay a constant, reliable outline no
  // matter what the inner body color is doing, which is what keeps a
  // close-zoom, fully route-colored train visually distinct from the route
  // line beneath it. Selection is signaled primarily by `selectedCasing`
  // (a bright outline, zoom-independent) rather than by body hue alone, per
  // the patch's own "do not rely purely on route color for selection" rule.
  var NEUTRAL_TRAIN = Object.freeze({
    neutralBody: '#C9CDD3',    // light steel grey — legible over every real MTA route hue
    casing: '#181B1F',         // dark charcoal — the primary distant-zoom contrast mechanism
    selectedBody: '#FF9F1C',   // reuses this app's existing "selected" accent (stations/HUD)
    selectedCasing: '#FFFFFF', // bright white outer ring — obvious regardless of zoom or body color
    staleOpacity: 0.4, unknownOpacity: 0.15,
  });

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
    station: NEUTRAL_STATION,
    train: NEUTRAL_TRAIN,
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
    station: NEUTRAL_STATION,
    train: NEUTRAL_TRAIN,
  });

  var PALETTES = Object.freeze({ fashion_subway: FASHION_SUBWAY, mta_reference: MTA_REFERENCE });
  // 0818_SUBWAY_Train_Rendering_Palette_Library_v1.0.0_BUILD §8: "Set
  // official_mta_reference as the active default for this build." Was
  // fashion_subway (Full Live Map / Live Train Visualization builds).
  var DEFAULT_PALETTE_ID = 'mta_reference';

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

  // Structured, non-route-color presentation tokens (BUILD §7). Pure
  // lookups through the active palette, same as resolveFamilyColor — never
  // touch route/station/train identity.
  function resolveStationTokens() { _load(); var p = PALETTES[_activeId]; return p ? p.station : null; }
  function resolveTrainTokens() { _load(); var p = PALETTES[_activeId]; return p ? p.train : null; }

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
    resolveStationTokens: resolveStationTokens,
    resolveTrainTokens: resolveTrainTokens,
    subscribe: subscribe,
  });

  console.log('[MTASubwayPaletteAuthority] v' + VERSION + ' loaded — 2 palettes (mta_reference default, LOD train tokens)');
})(window);
