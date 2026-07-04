// ── WOS Palette (shared) ──────────────────────────────────────────────────────
// 0614_WOS_3DCanvasLabPhase7BuildingSurfaceMaterialOverrides_v1.0.0_BUILD
// Shared between Studio (authoring) and Wall (runtime).
// Wall imports this directly. Studio imports this directly.
// Neither imports from the other's path.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var WOS_PALETTE = {
    concrete:    { color: '#8C8C88', materialClass: 'lambert',  roughness: null, metalness: null },
    glass:       { color: '#A8C8D8', materialClass: 'standard', roughness: 0.05, metalness: 0.1  },
    steel:       { color: '#7A8A96', materialClass: 'standard', roughness: 0.3,  metalness: 0.8  },
    terracotta:  { color: '#C17A5A', materialClass: 'lambert',  roughness: null, metalness: null },
    stone:       { color: '#A09880', materialClass: 'lambert',  roughness: null, metalness: null },
    copper:      { color: '#8C6040', materialClass: 'standard', roughness: 0.4,  metalness: 0.9  },
    matte_white: { color: '#E8E6E0', materialClass: 'lambert',  roughness: null, metalness: null },
    matte_black: { color: '#2A2A2A', materialClass: 'lambert',  roughness: null, metalness: null },
  };

  function resolvePaletteEntry(paletteRef) {
    return WOS_PALETTE[paletteRef] || null;
  }

  global.WOSPalette        = WOS_PALETTE;
  global.WOSPaletteResolve = resolvePaletteEntry;
  console.log('[WOSPalette] ready (shared) — ' + Object.keys(WOS_PALETTE).length + ' entries');
})(window);
