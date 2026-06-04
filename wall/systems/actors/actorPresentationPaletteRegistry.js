// ── ActorPresentationPaletteRegistry v1.0.0 ───────────────────────────────────
// 0603J_WOS_Actor2_5DPresentationPass_v1.0.0
// Status: active | Classification: presentation (palette token resolution)
//
// Resolves identity paletteRef tokens (e.g. "mta.bus.blue-white") into numeric
// Three.js hex colour sets the 2.5D mesh builders consume. No geometry, no truth,
// no Mapbox. Unknown refs return "actor.generic". Never throws.
// Load BEFORE the WorldSpaceVehicleLayer 2.5D builders use it.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  function P(key, p) {
    return {
      key: key,
      body:   p.body,   roof: p.roof != null ? p.roof : p.body,
      side:   p.side != null ? p.side : p.body,
      glass:  p.glass != null ? p.glass : 0x101820,
      accent: p.accent != null ? p.accent : 0xffffff,
      light:  p.light != null ? p.light : 0xffffff,
      shadow: p.shadow != null ? p.shadow : 0x000000,
      stroke: p.stroke != null ? p.stroke : 0x000000,
      opacity: p.opacity != null ? p.opacity : 1.0,
    };
  }

  var _palettes = {
    'citibike.cyan':        P('citibike.cyan',        { body: 0x20c7d8, roof: 0x55e6f2, side: 0x128c9a, glass: 0x063840, accent: 0xffffff, light: 0x7fffff }),
    'mta.bus.blue-white':   P('mta.bus.blue-white',   { body: 0x1f5fa8, roof: 0xf4f7fb, side: 0x174073, glass: 0x101820, accent: 0xffffff, light: 0xfff4c2 }),
    'dot.yellow-orange':    P('dot.yellow-orange',    { body: 0xf5b21b, roof: 0xffd35a, side: 0xa86400, glass: 0x1c1c1c, accent: 0xff6a00, light: 0xffc400 }),
    'synthetic.muted-road': P('synthetic.muted-road', { body: 0x45515c, roof: 0x66717b, side: 0x252d34, glass: 0x111820, accent: 0x9aa8b4, light: 0xbddcff }),
    'marine.truth-blue':    P('marine.truth-blue',    { body: 0x2a78a8, roof: 0xe9f2f7, side: 0x15445f, glass: 0x0b1c24, accent: 0x8fdcff, light: 0xffffff }),
    'nyc.ferry.blue-white': P('nyc.ferry.blue-white', { body: 0x1c5fb0, roof: 0xf2f7fb, side: 0x123f73, glass: 0x0b1c24, accent: 0xffffff, light: 0xffffff }),
    'aircraft.cool-white':  P('aircraft.cool-white',  { body: 0xdfe8ef, roof: 0xf4f8fb, side: 0xb6c4cf, glass: 0x223040, accent: 0xbfe0ff, light: 0xe8f6ff, opacity: 0.92 }),
    'mta.subway.line-color':P('mta.subway.line-color',{ body: 0x8a8d90, roof: 0xc8ccd0, side: 0x55585b, glass: 0x101418, accent: 0xff8c1a, light: 0xfff0c2 }),
    'traffic.generic':      P('traffic.generic',      { body: 0x5a6470, roof: 0x788390, side: 0x333b43, glass: 0x111820, accent: 0xb0bcc8, light: 0xbddcff }),
    'civic.generic':        P('civic.generic',        { body: 0xc99a2e, roof: 0xe2c062, side: 0x7a5c12, glass: 0x1c1c1c, accent: 0xffb84d, light: 0xffd24d }),
    'actor.generic':        P('actor.generic',        { body: 0x9aa0a6, roof: 0xc2c8ce, side: 0x6b7177, glass: 0x141a20, accent: 0xffffff, light: 0xffffff }),
    'station.generic':      P('station.generic',      { body: 0x37d67a, roof: 0x5be39a, side: 0x1f8a4d, glass: 0x06281a, accent: 0xffffff, light: 0xa8ffd0 }),
    'micro.generic':        P('micro.generic',        { body: 0x20c7d8, roof: 0x55e6f2, side: 0x128c9a, glass: 0x063840, accent: 0xffffff, light: 0x7fffff }),
    'marine.generic':       P('marine.generic',       { body: 0x2a78a8, roof: 0xe9f2f7, side: 0x15445f, glass: 0x0b1c24, accent: 0x8fdcff, light: 0xffffff }),
    'aircraft.generic':     P('aircraft.generic',     { body: 0xdfe8ef, roof: 0xf4f8fb, side: 0xb6c4cf, glass: 0x223040, accent: 0xbfe0ff, light: 0xe8f6ff, opacity: 0.92 }),
    'transit.generic':      P('transit.generic',      { body: 0x3a6ea5, roof: 0xeef3f8, side: 0x244766, glass: 0x101820, accent: 0xffffff, light: 0xfff4c2 }),
    'civic.alert':          P('civic.alert',          { body: 0xff4d4d, roof: 0xff8080, side: 0xa11f1f, glass: 0x1c1010, accent: 0xffd24d, light: 0xff5050 }),
    'world.generic':        P('world.generic',        { body: 0x808890, roof: 0xa0a8b0, side: 0x565c63, glass: 0x141a20, accent: 0xffffff, light: 0xffffff }),
  };

  var _stats = { resolved: 0, fallback: 0, lastRef: null };

  function resolvePalette(ref) {
    _stats.lastRef = ref;
    var p = _palettes[ref];
    if (p) { _stats.resolved++; return p; }
    _stats.fallback++;
    return _palettes['actor.generic'];
  }
  function registerPalette(key, colors) {
    if (!key || !colors) return false;
    _palettes[key] = P(key, colors);
    return true;
  }
  function listPalettes() { return Object.keys(_palettes).map(function (k) { return _palettes[k]; }); }
  function getState() {
    return { version: VERSION, paletteCount: Object.keys(_palettes).length,
             resolved: _stats.resolved, fallback: _stats.fallback, lastRef: _stats.lastRef };
  }

  SBE.ActorPresentationPaletteRegistry = Object.freeze({
    VERSION:         VERSION,
    resolvePalette:  resolvePalette,
    registerPalette: registerPalette,
    listPalettes:    listPalettes,
    getState:        getState,
  });

  console.log('[ActorPresentationPaletteRegistry] v' + VERSION + ' loaded — ' + Object.keys(_palettes).length + ' palettes');
})(window);
