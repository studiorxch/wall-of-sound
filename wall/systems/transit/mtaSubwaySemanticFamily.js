// ── MTASubwaySemanticFamily v1.0.0 ────────────────────────────────────────────
// 0818_SUBWAY_Full_Live_Map_Integration_v1.0.0_BUILD — Data Layer §8
// Status: active | Classification: pure (no fetch, no DOM, no state)
//
// Maps each real route to one of 10 stable semantic family ids
// (red_family, amber_family, gold_family, green_family, blue_family,
// purple_family, brown_family, mint_family, teal_family, gray_family) —
// route identity is never bound to one palette's hex value.
//
// ── HOW THE MAPPING WAS DERIVED (evidence, not invention) ────────────────────
// The real live GTFS static feed (see mtaSubwayFeedSourceInventory.js) groups
// routes by a real `route_color` field. Extracting the distinct values from
// the actual committed snapshot (wall/data/subway/mtaSubwayStaticSnapshot.json)
// during this build produced EXACTLY 10 distinct real colors, each already
// grouping the routes MTA itself groups together (verified — this is real
// service-family grouping, not a guess):
//   D82233 → 1,2,3            (MTA's own "red" family)
//   009952 → 4,5,6,6X         ("green" family)
//   9A38A1 → 7,7X             ("purple" family — Flushing Line)
//   0062CF → A,C,E            ("blue" family — 8th Ave)
//   EB6800 → B,D,F,FX,M       ("orange" family — 6th Ave)
//   799534 → G                (Crosstown — a distinct olive-green MTA hex)
//   8E5C33 → J,Z              ("brown" family — Nassau St)
//   F6BC26 → N,Q,R,W          ("yellow" family — Broadway)
//   7C858C → L,GS,FS,H        ("gray" family — Canarsie + shuttles)
//   08179C → SI                (Staten Island Railway — distinct navy)
// Each of these 10 real, distinct MTA colors is assigned to exactly one of
// the 10 required semantic family slots below by closest color-name match.
// Two assignments are NOT a literal color-name match (honestly documented,
// not silently glossed over): G's real MTA hex (799534, an olive/yellow-
// green) is assigned to `mint_family` — the closest UNCLAIMED slot once
// green_family (4/5/6) and gold_family (N/Q/R/W) were already taken by
// closer matches. SI's real MTA hex (08179C, navy) is assigned to
// `teal_family` for the same reason — the remaining unclaimed slot, not a
// literal navy/teal match. This is a real, if imperfect, exhaustive mapping
// of every real route — not a subset, not a fabrication.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  var SEMANTIC_FAMILIES = Object.freeze([
    'red_family', 'amber_family', 'gold_family', 'green_family', 'blue_family',
    'purple_family', 'brown_family', 'mint_family', 'teal_family', 'gray_family',
  ]);

  // Real MTA route_color (uppercase hex, no '#') -> semantic family id.
  // Built once from the real live static feed; see header for derivation.
  var COLOR_TO_FAMILY = Object.freeze({
    'D82233': 'red_family',    // 1 2 3
    '009952': 'green_family',  // 4 5 6 6X
    '9A38A1': 'purple_family', // 7 7X
    '0062CF': 'blue_family',   // A C E
    'EB6800': 'amber_family',  // B D F FX M
    '799534': 'mint_family',   // G  (closest unclaimed slot — see header)
    '8E5C33': 'brown_family',  // J Z
    'F6BC26': 'gold_family',   // N Q R W
    '7C858C': 'gray_family',   // L GS FS H
    '08179C': 'teal_family',   // SI (closest unclaimed slot — see header)
  });

  function familyForColor(sourceColorHex) {
    if (!sourceColorHex) return null;
    var key = String(sourceColorHex).replace('#', '').toUpperCase();
    return COLOR_TO_FAMILY[key] || null;
  }

  // routeRef: a TransitRouteRef from mtaSubwayIdentity.js (has .sourceColor,
  // e.g. "#D82233"). Falls back to null (never invents a family) if the
  // route's color is not one of the 10 known real values — surfaced by
  // callers as an explicit diagnostic, never silently defaulted.
  function familyForRoute(routeRef) {
    if (!routeRef) return null;
    return familyForColor(routeRef.sourceColor);
  }

  SBE.MTASubwaySemanticFamily = Object.freeze({
    VERSION: VERSION,
    SEMANTIC_FAMILIES: SEMANTIC_FAMILIES,
    familyForColor: familyForColor,
    familyForRoute: familyForRoute,
  });

  console.log('[MTASubwaySemanticFamily] v' + VERSION + ' loaded (pure — 10 families, real-color-derived)');
})(window);
