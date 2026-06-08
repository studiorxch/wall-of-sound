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
    'marine.truth-blue':    P('marine.truth-blue',    { body: 0x1f6f8b, roof: 0xd9f2ff, side: 0x13485f, glass: 0x0b1f2a, accent: 0x52e0ff, light: 0xffffff, stroke: 0x06202c }),
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
    // ── 0603X Marine asset palette pack — role-distinct harbor colours ────────
    'marine.workboat.orange':  P('marine.workboat.orange',  { body: 0xf28c28, roof: 0xf7c95f, side: 0x8f4a18, glass: 0x10202a, accent: 0xffd34d, light: 0xffffff, stroke: 0x241308 }),
    'marine.service.yellow':   P('marine.service.yellow',   { body: 0xf4c430, roof: 0xffe38a, side: 0x9b6d00, glass: 0x111b20, accent: 0xff7a00, light: 0xffffff, stroke: 0x241b00 }),
    'marine.police.blue-white':P('marine.police.blue-white',{ body: 0xeff7ff, roof: 0xffffff, side: 0x184f9c, glass: 0x071523, accent: 0x2aa8ff, light: 0xffffff, stroke: 0x061426 }),
    'marine.fire.red-white':   P('marine.fire.red-white',   { body: 0xd92d20, roof: 0xffffff, side: 0x7a120d, glass: 0x160b0b, accent: 0xffd34d, light: 0xffffff, stroke: 0x260606 }),
    'marine.cargo.rust':       P('marine.cargo.rust',       { body: 0x9a4b22, roof: 0xd9b08c, side: 0x4f2815, glass: 0x111820, accent: 0xf0a04b, light: 0xffffff, stroke: 0x1f0e08 }),
    'marine.container.dark':   P('marine.container.dark',   { body: 0x2c3e50, roof: 0x5d6d7e, side: 0x17202a, glass: 0x08131d, accent: 0xe67e22, light: 0xffffff, stroke: 0x061018 }),
    'marine.tanker.black-red': P('marine.tanker.black-red', { body: 0x1f1f1f, roof: 0x5a5a5a, side: 0x0d0d0d, glass: 0x101820, accent: 0xb3261e, light: 0xffffff, stroke: 0x000000 }),
    'marine.barge.gray':       P('marine.barge.gray',       { body: 0x6f7478, roof: 0x9ea5aa, side: 0x3c4246, glass: 0x111820, accent: 0xd6b15f, light: 0xffffff, stroke: 0x171a1d }),
    'marine.ferry.blue-white': P('marine.ferry.blue-white', { body: 0xf3f8ff, roof: 0xffffff, side: 0x1f6fba, glass: 0x081827, accent: 0x4dd8ff, light: 0xffffff, stroke: 0x061a2b }),
    'marine.cruise.white':     P('marine.cruise.white',     { body: 0xf8fbff, roof: 0xffffff, side: 0xbfd2e2, glass: 0x0d2538, accent: 0x79d8ff, light: 0xffffff, stroke: 0x4f6170 }),
    'marine.yacht.white':      P('marine.yacht.white',      { body: 0xfafafa, roof: 0xffffff, side: 0xcfd8dc, glass: 0x0a2233, accent: 0x58d8ff, light: 0xffffff, stroke: 0x68777f }),
    'marine.sailboat.white':   P('marine.sailboat.white',   { body: 0xf8f8f2, roof: 0xffffff, side: 0xd9d9cf, glass: 0x102838, accent: 0xfff2b8, light: 0xffffff, stroke: 0x6f6f64 }),
    'marine.fishing.green-white': P('marine.fishing.green-white', { body: 0x2e7d5b, roof: 0xf2fff8, side: 0x164d37, glass: 0x0c1e18, accent: 0xffd166, light: 0xffffff, stroke: 0x062014 }),
    'marine.unknown.gray':     P('marine.unknown.gray',     { body: 0x7c858b, roof: 0xaeb7bd, side: 0x4c555b, glass: 0x111820, accent: 0x9aa0a6, light: 0xffffff, stroke: 0x22282c, opacity: 0.85 }),
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
