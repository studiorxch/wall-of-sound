// ── BroadcastMinimalStyle v1.0.0 ─────────────────────────────────────────────
// 0709_WOS_Mapbox_Style_Isolation_v1.0.0_BUILD
//
// Deterministic minimal Mapbox style for broadcast-safe OBS output.
// No glow, blur, pattern, raster, casing, atmosphere, texture, or scanlines.
// Uses only mapbox-streets-v8 vector tiles — no remote custom style JSON.
//
// Placement: wall/runtimes/broadcastMinimalStyle.js
// Load: before broadcastMapIsolation.js
// ─────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  function createBroadcastMinimalStyle() {
    return {
      version: 8,
      name: 'WOS Broadcast Minimal',
      sprite: 'mapbox://sprites/mapbox/dark-v11',
      glyphs: 'mapbox://fonts/mapbox/{fontstack}/{range}.pbf',
      sources: {
        composite: {
          type: 'vector',
          url: 'mapbox://mapbox.mapbox-streets-v8',
        },
      },
      layers: [
        // ── Background ───────────────────────────────────────────────────────
        {
          id: 'background',
          type: 'background',
          paint: { 'background-color': '#081418' },
        },
        // ── Water ────────────────────────────────────────────────────────────
        {
          id: 'water',
          type: 'fill',
          source: 'composite',
          'source-layer': 'water',
          paint: { 'fill-color': '#061014', 'fill-opacity': 1 },
        },
        // ── Landuse (parks, industrial, etc.) ────────────────────────────────
        {
          id: 'landuse',
          type: 'fill',
          source: 'composite',
          'source-layer': 'landuse',
          paint: { 'fill-color': '#0a1619', 'fill-opacity': 1 },
        },
        // ── All roads — thin, single layer, no glow/casing/blur ──────────────
        {
          id: 'roads-simple',
          type: 'line',
          source: 'composite',
          'source-layer': 'road',
          paint: {
            'line-color': '#1e6878',
            'line-blur': 0,
            'line-opacity': 0.65,
            'line-width': [
              'interpolate', ['linear'], ['zoom'],
              8, 0.3,
              12, 0.6,
              16, 1.2,
            ],
          },
        },
        // ── Major roads — slightly brighter, single pass ──────────────────────
        {
          id: 'roads-major',
          type: 'line',
          source: 'composite',
          'source-layer': 'road',
          filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary']]],
          paint: {
            'line-color': '#2f8fa2',
            'line-blur': 0,
            'line-opacity': 0.80,
            'line-width': [
              'interpolate', ['linear'], ['zoom'],
              8, 0.6,
              12, 1.2,
              16, 2.4,
            ],
          },
        },
      ],
    };
  }

  SBE.BroadcastMinimalStyle = Object.freeze({
    create: createBroadcastMinimalStyle,
  });

  console.log('[BroadcastMinimalStyle] v1.0.0 loaded');

})(window);
