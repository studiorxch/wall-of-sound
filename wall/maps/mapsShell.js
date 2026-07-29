// ── WOSMapsShell v1.0.0 ───────────────────────────────────────────────────────
// 0729B_MAPS_Studio_Integration_Recovery
// Status: active | Classification: maps-ui (shell/router)
//
// Minimal router for the MAPS product page (wall/maps/index.html). Written
// fresh — does not reuse studio/studioShell.js. Only one destination exists
// today (Palettes); this does not invent additional nav destinations with no
// working screen behind them.
//
// Placement: wall/maps/mapsShell.js
// Load: LAST — after palettesGallery.js and paletteDetail.js.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var doc = global.document;

  function _route() {
    var hash = global.location.hash.replace(/^#\/?/, '');
    var content = doc.getElementById('maps-content');
    if (!content) return;

    // Only one route exists today — Palettes. Anything else falls back to it
    // rather than inventing a nav destination with no working screen.
    if (global.WOSMapsGallery) {
      global.WOSMapsGallery.enter(content);
    } else {
      content.innerHTML = '<div class="maps-error">MAPS gallery module not loaded.</div>';
    }
  }

  global.addEventListener('hashchange', _route);
  if (!global.location.hash) global.location.hash = '#/palettes';
  else _route();

  console.log('[WOSMapsShell] ready');

})(window);
