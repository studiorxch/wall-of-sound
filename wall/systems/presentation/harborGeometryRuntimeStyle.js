// ── HarborGeometryRuntimeStyle v1.0.0 ────────────────────────────────────────
// 0528G_WOS_HarborGeometryRuntimeRenderer_v1.0.0 — style authority
// Status: active
// Classification: presentation-style — safe for production
//
// Purpose:
//   Owns production style profiles for baked harbor geometry layers.
//   This module owns data only — no pixel rendering.
//
// API:
//   SBE.HarborGeometryRuntimeStyle.getPreset(id)
//   SBE.HarborGeometryRuntimeStyle.setPreset(id)
//   SBE.HarborGeometryRuntimeStyle.getLayerStyle(layerName)
//   SBE.HarborGeometryRuntimeStyle.getLayerOpacity(layerName)
//   SBE.HarborGeometryRuntimeStyle.getStyleState()
//   SBE.HarborGeometryRuntimeStyle.PRESETS
//
// Placement: wall/systems/presentation/harborGeometryRuntimeStyle.js
// Load: AFTER harborGeometryRegistry.js, BEFORE harborGeometryRuntimeRenderer.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  var VERSION = '1.0.0';

  // ── Layer draw types ──────────────────────────────────────────────────────────
  // type: 'line' | 'fill+line' | 'point'

  // ── Preset definitions ────────────────────────────────────────────────────────
  // Each preset defines per-layer overrides. Unspecified layers use defaults.
  // All opacities are 0–1 and serve as BASE values before multipliers.

  var PRESETS = Object.freeze({

    // ── minimal ─────────────────────────────────────────────────────────────────
    // Clean map baseline: geometry present but whisper-quiet.
    minimal: Object.freeze({
      shoreline: Object.freeze({
        type: 'line',
        stroke: 'rgba(160,200,240,0.45)',
        lineWidth: 1.0,
        lineDash: [],
        opacity: 0.45,
      }),
      pier: Object.freeze({
        type: 'line',
        stroke: 'rgba(210,160,80,0.30)',
        lineWidth: 1.0,
        lineDash: [],
        opacity: 0.30,
      }),
      ferry_slip: Object.freeze({
        type: 'fill+line',
        fill: 'rgba(60,200,240,0.06)',
        stroke: 'rgba(60,200,240,0.28)',
        lineWidth: 1.0,
        lineDash: [],
        opacity: 0.28,
      }),
      island: Object.freeze({
        type: 'fill+line',
        fill: 'rgba(80,180,100,0.08)',
        stroke: 'rgba(80,180,100,0.40)',
        lineWidth: 1.0,
        lineDash: [],
        opacity: 0.40,
      }),
      bridge_context: Object.freeze({
        type: 'line',
        stroke: 'rgba(200,190,120,0.22)',
        lineWidth: 1.0,
        lineDash: [6, 5],
        opacity: 0.22,
      }),
      waterfront_block: Object.freeze({
        type: 'fill+line',
        fill: 'rgba(180,120,60,0.00)',
        stroke: 'rgba(180,120,60,0.00)',
        lineWidth: 0,
        lineDash: [],
        opacity: 0.00,
      }),
      harbor_channel: Object.freeze({
        type: 'line',
        stroke: 'rgba(70,130,210,0.15)',
        lineWidth: 1.5,
        lineDash: [10, 8],
        opacity: 0.15,
      }),
      hero_landmark: Object.freeze({
        type: 'point',
        fill: 'rgba(255,255,255,0.40)',
        stroke: 'rgba(255,255,255,0.55)',
        lineWidth: 1.0,
        lineDash: [],
        opacity: 0.55,
      }),
    }),

    // ── cinematic ────────────────────────────────────────────────────────────────
    // Default preset — visually rich but not dominant.
    cinematic: Object.freeze({
      shoreline: Object.freeze({
        type: 'line',
        stroke: 'rgba(175,215,255,0.72)',
        lineWidth: 1.5,
        lineDash: [],
        opacity: 0.72,
      }),
      pier: Object.freeze({
        type: 'fill+line',
        fill: 'rgba(220,160,70,0.12)',
        stroke: 'rgba(220,160,70,0.68)',
        lineWidth: 1.5,
        lineDash: [],
        opacity: 0.68,
      }),
      ferry_slip: Object.freeze({
        type: 'fill+line',
        fill: 'rgba(55,200,245,0.14)',
        stroke: 'rgba(55,200,245,0.72)',
        lineWidth: 1.5,
        lineDash: [],
        opacity: 0.72,
      }),
      island: Object.freeze({
        type: 'fill+line',
        fill: 'rgba(80,185,105,0.14)',
        stroke: 'rgba(80,185,105,0.70)',
        lineWidth: 1.5,
        lineDash: [],
        opacity: 0.70,
      }),
      bridge_context: Object.freeze({
        type: 'line',
        stroke: 'rgba(230,215,100,0.60)',
        lineWidth: 1.5,
        lineDash: [8, 5],
        opacity: 0.60,
      }),
      waterfront_block: Object.freeze({
        type: 'fill+line',
        fill: 'rgba(195,125,55,0.10)',
        stroke: 'rgba(195,125,55,0.35)',
        lineWidth: 1.0,
        lineDash: [3, 4],
        opacity: 0.35,
      }),
      harbor_channel: Object.freeze({
        type: 'line',
        stroke: 'rgba(75,145,225,0.42)',
        lineWidth: 2.0,
        lineDash: [12, 6],
        opacity: 0.42,
      }),
      hero_landmark: Object.freeze({
        type: 'point',
        fill: 'rgba(255,255,255,0.22)',
        stroke: 'rgba(255,255,255,0.88)',
        lineWidth: 1.5,
        lineDash: [],
        opacity: 0.88,
      }),
    }),

    // ── survey ───────────────────────────────────────────────────────────────────
    // Analytical/map-comparison: higher contrast, channels clear, labels optional.
    survey: Object.freeze({
      shoreline: Object.freeze({
        type: 'line',
        stroke: 'rgba(100,170,255,0.90)',
        lineWidth: 2.0,
        lineDash: [],
        opacity: 0.90,
      }),
      pier: Object.freeze({
        type: 'fill+line',
        fill: 'rgba(255,170,60,0.20)',
        stroke: 'rgba(255,170,60,0.90)',
        lineWidth: 2.0,
        lineDash: [],
        opacity: 0.90,
      }),
      ferry_slip: Object.freeze({
        type: 'fill+line',
        fill: 'rgba(40,215,255,0.25)',
        stroke: 'rgba(40,215,255,0.95)',
        lineWidth: 2.0,
        lineDash: [],
        opacity: 0.95,
      }),
      island: Object.freeze({
        type: 'fill+line',
        fill: 'rgba(60,200,90,0.22)',
        stroke: 'rgba(60,200,90,0.90)',
        lineWidth: 2.0,
        lineDash: [],
        opacity: 0.90,
      }),
      bridge_context: Object.freeze({
        type: 'line',
        stroke: 'rgba(255,230,80,0.90)',
        lineWidth: 2.0,
        lineDash: [8, 4],
        opacity: 0.90,
      }),
      waterfront_block: Object.freeze({
        type: 'fill+line',
        fill: 'rgba(220,140,60,0.22)',
        stroke: 'rgba(220,140,60,0.75)',
        lineWidth: 1.5,
        lineDash: [3, 3],
        opacity: 0.75,
      }),
      harbor_channel: Object.freeze({
        type: 'line',
        stroke: 'rgba(60,130,255,0.80)',
        lineWidth: 2.5,
        lineDash: [14, 5],
        opacity: 0.80,
      }),
      hero_landmark: Object.freeze({
        type: 'point',
        fill: 'rgba(255,255,255,0.35)',
        stroke: 'rgba(255,255,255,1.00)',
        lineWidth: 2.0,
        lineDash: [],
        opacity: 1.00,
      }),
    }),

    // ── night_signal ─────────────────────────────────────────────────────────────
    // Stylised infrastructure/night: channels luminous, piers amber, shoreline cool.
    night_signal: Object.freeze({
      shoreline: Object.freeze({
        type: 'line',
        stroke: 'rgba(120,185,255,0.65)',
        lineWidth: 1.5,
        lineDash: [],
        opacity: 0.65,
      }),
      pier: Object.freeze({
        type: 'fill+line',
        fill: 'rgba(255,155,40,0.14)',
        stroke: 'rgba(255,155,40,0.78)',
        lineWidth: 1.5,
        lineDash: [],
        opacity: 0.78,
      }),
      ferry_slip: Object.freeze({
        type: 'fill+line',
        fill: 'rgba(40,215,255,0.18)',
        stroke: 'rgba(40,215,255,0.85)',
        lineWidth: 1.5,
        lineDash: [],
        opacity: 0.85,
      }),
      island: Object.freeze({
        type: 'fill+line',
        fill: 'rgba(55,120,80,0.20)',
        stroke: 'rgba(80,160,105,0.60)',
        lineWidth: 1.5,
        lineDash: [],
        opacity: 0.60,
      }),
      bridge_context: Object.freeze({
        type: 'line',
        stroke: 'rgba(200,185,100,0.50)',
        lineWidth: 1.5,
        lineDash: [8, 5],
        opacity: 0.50,
      }),
      waterfront_block: Object.freeze({
        type: 'fill+line',
        fill: 'rgba(180,100,40,0.12)',
        stroke: 'rgba(180,100,40,0.30)',
        lineWidth: 1.0,
        lineDash: [3, 4],
        opacity: 0.30,
      }),
      harbor_channel: Object.freeze({
        type: 'line',
        stroke: 'rgba(80,165,255,0.62)',
        lineWidth: 2.5,
        lineDash: [14, 5],
        opacity: 0.62,
      }),
      hero_landmark: Object.freeze({
        type: 'point',
        fill: 'rgba(230,240,255,0.18)',
        stroke: 'rgba(230,240,255,0.72)',
        lineWidth: 1.5,
        lineDash: [],
        opacity: 0.72,
      }),
    }),
  });

  // ── LOD opacity multipliers ───────────────────────────────────────────────────
  // Per-layer opacity multiplier based on active LOD.
  // Layers not listed get 1.0.

  var LOD_OPACITY = Object.freeze({
    high_cruise: Object.freeze({
      shoreline:        0.55,
      pier:             0.00,
      ferry_slip:       0.00,
      island:           1.00,
      bridge_context:   0.80,
      waterfront_block: 0.00,
      harbor_channel:   1.00,
      hero_landmark:    1.00,
    }),
    mid_climb: Object.freeze({
      shoreline:        0.80,
      pier:             0.55,
      ferry_slip:       0.70,
      island:           1.00,
      bridge_context:   0.90,
      waterfront_block: 0.20,
      harbor_channel:   1.00,
      hero_landmark:    1.00,
    }),
    low_climb: Object.freeze({
      shoreline:        1.00,
      pier:             0.90,
      ferry_slip:       1.00,
      island:           1.00,
      bridge_context:   1.00,
      waterfront_block: 0.70,
      harbor_channel:   0.85,
      hero_landmark:    1.00,
    }),
    ground: Object.freeze({
      shoreline:        1.00,
      pier:             1.00,
      ferry_slip:       1.00,
      island:           1.00,
      bridge_context:   1.00,
      waterfront_block: 1.00,
      harbor_channel:   0.65,
      hero_landmark:    1.00,
    }),
  });

  // ── Altitude band draw multipliers ───────────────────────────────────────────
  // Per-band additional opacity multiplier applied after LOD.

  var ALTITUDE_OPACITY = Object.freeze({
    ground: Object.freeze({
      shoreline: 1.00, pier: 1.00, ferry_slip: 1.00, island: 1.00,
      bridge_context: 0.75, waterfront_block: 1.00,
      harbor_channel: 0.55, hero_landmark: 1.00,
    }),
    low_climb: Object.freeze({
      shoreline: 0.90, pier: 0.85, ferry_slip: 0.85, island: 1.00,
      bridge_context: 0.85, waterfront_block: 0.75,
      harbor_channel: 0.80, hero_landmark: 1.00,
    }),
    mid_climb: Object.freeze({
      shoreline: 0.75, pier: 0.55, ferry_slip: 0.55, island: 1.00,
      bridge_context: 0.95, waterfront_block: 0.45,
      harbor_channel: 1.00, hero_landmark: 1.00,
    }),
    high_cruise: Object.freeze({
      shoreline: 0.55, pier: 0.20, ferry_slip: 0.15, island: 0.90,
      bridge_context: 0.80, waterfront_block: 0.10,
      harbor_channel: 1.00, hero_landmark: 0.90,
    }),
  });

  // ── Internal state ────────────────────────────────────────────────────────────

  var _currentPresetId = 'cinematic';

  // ── API ───────────────────────────────────────────────────────────────────────

  function getPreset(id) {
    return PRESETS[id] || null;
  }

  function setPreset(id) {
    if (!PRESETS[id]) {
      console.warn('[HarborGeometryRuntimeStyle] unknown preset:', id,
        '— valid:', Object.keys(PRESETS).join(', '));
      return false;
    }
    _currentPresetId = id;
    return true;
  }

  function getLayerStyle(layerName, presetIdOverride) {
    var pid = presetIdOverride || _currentPresetId;
    var preset = PRESETS[pid];
    if (!preset) return null;
    return preset[layerName] || null;
  }

  function getLayerOpacity(layerName, lodKey, altitudeBand, presetIdOverride) {
    var style = getLayerStyle(layerName, presetIdOverride);
    if (!style) return 0;
    var base = style.opacity !== undefined ? style.opacity : 1.0;

    var lodMult = 1.0;
    if (lodKey && LOD_OPACITY[lodKey]) {
      var v = LOD_OPACITY[lodKey][layerName];
      if (v !== undefined) lodMult = v;
    }

    var altMult = 1.0;
    // Normalise altitude band name
    var band = altitudeBand || 'ground';
    if (band === 'low') band = 'low_climb';
    if (band === 'mid') band = 'mid_climb';
    if (band === 'high') band = 'high_cruise';
    if (ALTITUDE_OPACITY[band]) {
      var av = ALTITUDE_OPACITY[band][layerName];
      if (av !== undefined) altMult = av;
    }

    return base * lodMult * altMult;
  }

  function getStyleState() {
    return {
      preset:     _currentPresetId,
      presetKeys: Object.keys(PRESETS),
    };
  }

  SBE.HarborGeometryRuntimeStyle = Object.freeze({
    VERSION:         VERSION,
    getPreset:       getPreset,
    setPreset:       setPreset,
    getLayerStyle:   getLayerStyle,
    getLayerOpacity: getLayerOpacity,
    getStyleState:   getStyleState,
    PRESETS:         PRESETS,
    LOD_OPACITY:     LOD_OPACITY,
    ALTITUDE_OPACITY: ALTITUDE_OPACITY,
  });

  console.log('[HarborGeometryRuntimeStyle] v' + VERSION + ' loaded — preset: ' + _currentPresetId);

})(window);
