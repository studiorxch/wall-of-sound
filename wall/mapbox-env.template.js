// ── Mapbox token bridge — WALL / Studio runtime ───────────────────────────
// Copy this file to wall/mapbox-env.js (gitignored) and fill in your token.
// wall/mapbox-env.js is loaded by wall/index.html and studio/index.html
// BEFORE any Mapbox runtime script, so the token is available globally.
//
// Get your public token at: https://account.mapbox.com/
// Required variable in wall-of-sound/.env.local: VITE_MAPBOX_TOKEN=pk.eyJ...
//
// Setup:
//   cp wall/mapbox-env.template.js wall/mapbox-env.js
//   # then edit wall/mapbox-env.js and paste your pk. token below
//
// NEVER commit wall/mapbox-env.js or any pk./sk. token to git.
// ─────────────────────────────────────────────────────────────────────────
(function () {
  var token = ""; // ← paste your VITE_MAPBOX_TOKEN value here (pk.eyJ...)
  window.SBE = window.SBE || {};
  window.SBE.MapboxToken = token;
  window.MAPBOX_TOKEN = token;
  if (!token) {
    console.warn(
      "[WOS] Mapbox token missing — set VITE_MAPBOX_TOKEN in wall-of-sound/.env.local " +
      "and copy wall/mapbox-env.template.js → wall/mapbox-env.js"
    );
  }
})();
