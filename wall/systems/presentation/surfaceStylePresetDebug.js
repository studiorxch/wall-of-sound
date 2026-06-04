// ── SurfaceStylePresetDebug v1.0.1 ───────────────────────────────────────────
// 0525D_WOS_SurfaceStylePresets_v1.0.1 — development companion
// Status: active
// Classification: debug-tooling (non-production critical path)
//
// Development-time diagnostics for SurfaceStylePresetRuntime.
//
// All functions are console-oriented and read-only with respect to runtime truth.
// Load-order safe — may be loaded before or after the main preset module as long
// as it is called after DOMContentLoaded.
//
// Usage (browser console):
//   _wos.presets.catalog()                      — table of all registered presets
//   _wos.presets.inspect("QUIET_HARBOR")        — deep inspect one preset
//   _wos.presets.diff("QUIET_HARBOR","SIGNAL_DRIFT") — side-by-side field diff
//   _wos.presets.activatePreset("MIDNIGHT_FREIGHT")  — set active preset
//   _wos.presets.clearPreset()                  — clear active preset
//   _wos.presets.activePreset()                 — show active preset
//   _wos.presets.resolveManifest(simMs?)        — resolve full presentation manifest
//   _wos.presets.maritimeModifierPreview("SIGNAL_DRIFT","ferry") — modifier effect
//   _wos.presets.validateAll()                  — run integrity check on all presets
//   _wos.presets.constants()                    — show system constants
//
// Placement: wall/systems/presentation/surfaceStylePresetDebug.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  function _init() {
    var SBE  = global.SBE;
    var SSPR = SBE && SBE.SurfaceStylePresetRuntime;

    if (!SSPR) {
      console.warn('[SurfaceStylePresetDebug] SBE.SurfaceStylePresetRuntime not found' +
        ' — load surfaceStylePresetRuntime.js first');
      return;
    }

    global._wos = global._wos || {};

    var C = SSPR.CONSTANTS;

    // ── Catalog ───────────────────────────────────────────────────────────────
    /**
     * _wos.presets.catalog()
     *
     * Print a console.table of all registered presets with key metadata.
     * Includes: category, displayName, provenance, protected, mapLayers, modifiers, tags, active.
     */
    function catalog() {
      var all    = SSPR.getAllPresets();
      var ids    = Object.keys(all);
      var active = SSPR.getActivePreset();
      var rows   = {};

      for (var i = 0; i < ids.length; i++) {
        var p = all[ids[i]];
        rows[p.presetId] = {
          category:    p.category,
          displayName: p.displayName,
          provenance:  p.provenance,
          protected:   p.protected ? '🔒' : '',
          mapLayers:   Object.keys(p.mapStyle).join(', ') || '(none)',
          modifiers:   Object.keys(p.maritimeModifiers).length,
          tags:        (p.tags && p.tags.length) ? p.tags.join(', ') : '',
          active:      active && active.presetId === p.presetId ? '◉ ACTIVE' : '',
        };
      }

      console.log('[SurfaceStylePresetRuntime] Preset catalog (' + ids.length + ' entries)' +
        (active ? ' — active: ' + active.presetId : ' — no active preset') + ':');
      console.table(rows);
      return rows;
    }

    // ── Inspect ───────────────────────────────────────────────────────────────
    /**
     * _wos.presets.inspect(presetId)
     *
     * Deep inspect all sections of a named preset.
     *
     * @param {string} presetId
     */
    function inspect(presetId) {
      var p = SSPR.getPreset(presetId);
      if (!p) {
        console.warn('[SurfaceStylePresetRuntime] inspect: unknown presetId:', presetId);
        return null;
      }

      console.group('[SurfaceStylePresetRuntime] Preset: ' + p.presetId +
        ' (' + p.category + ')' + (p.protected ? ' 🔒 protected' : ''));
      console.log('displayName: ', p.displayName);
      console.log('description: ', p.description);
      console.log('provenance:  ', p.provenance);
      console.log('protected:   ', p.protected);
      console.log('version:     ', p.version);
      console.log('author:      ', p.author || '(unset)');
      console.log('createdAtMs: ', p.createdAtMs || '(unset)');
      console.log('tags:        ', p.tags && p.tags.length ? p.tags.join(', ') : '(none)');

      // metadata
      if (p.metadata && Object.keys(p.metadata).length > 0) {
        console.group('metadata');
        var metaKeys = Object.keys(p.metadata);
        for (var m = 0; m < metaKeys.length; m++) {
          var mv = p.metadata[metaKeys[m]];
          console.log('  ' + metaKeys[m] + ':', Array.isArray(mv) ? '[' + mv.join(', ') + ']' : mv);
        }
        console.groupEnd();
      }

      // mapStyle
      console.group('mapStyle overrides');
      var layerKeys = Object.keys(p.mapStyle);
      if (layerKeys.length === 0) {
        console.log('  (none)');
      } else {
        for (var i = 0; i < layerKeys.length; i++) {
          console.group(layerKeys[i]);
          var layer = p.mapStyle[layerKeys[i]];
          var fkeys = Object.keys(layer);
          for (var j = 0; j < fkeys.length; j++) {
            console.log('  ' + fkeys[j] + ':', layer[fkeys[j]]);
          }
          console.groupEnd();
        }
      }
      console.groupEnd();

      // maritimeModifiers
      console.group('maritimeModifiers');
      var modKeys = Object.keys(p.maritimeModifiers);
      if (modKeys.length === 0) {
        console.log('  (none)');
      } else {
        for (var k = 0; k < modKeys.length; k++) {
          console.log('  ' + modKeys[k] + ':', p.maritimeModifiers[modKeys[k]]);
        }
      }
      console.groupEnd();

      console.groupEnd();
      return p;
    }

    // ── Diff ─────────────────────────────────────────────────────────────────
    /**
     * _wos.presets.diff(presetIdA, presetIdB)
     *
     * Side-by-side comparison of two presets across maritime modifiers,
     * metadata bias fields, and common map layer fields.
     *
     * @param {string} presetIdA
     * @param {string} presetIdB
     */
    function diff(presetIdA, presetIdB) {
      var a = SSPR.getPreset(presetIdA);
      var b = SSPR.getPreset(presetIdB);
      if (!a) { console.warn('[SurfaceStylePresetRuntime] diff: unknown preset:', presetIdA); return null; }
      if (!b) { console.warn('[SurfaceStylePresetRuntime] diff: unknown preset:', presetIdB); return null; }

      var rows = {};

      // Identity
      rows['provenance']  = {};
      rows['provenance'][presetIdA] = a.provenance;
      rows['provenance'][presetIdB] = b.provenance;
      rows['protected']   = {};
      rows['protected'][presetIdA]  = a.protected ? '🔒' : '';
      rows['protected'][presetIdB]  = b.protected ? '🔒' : '';

      // Metadata bias fields
      var biasFields = ['cinematicBias', 'readabilityBias', 'densityBias'];
      for (var bf = 0; bf < biasFields.length; bf++) {
        var bk = 'meta: ' + biasFields[bf];
        rows[bk] = {};
        rows[bk][presetIdA] = a.metadata && a.metadata[biasFields[bf]] !== undefined ? a.metadata[biasFields[bf]] : '—';
        rows[bk][presetIdB] = b.metadata && b.metadata[biasFields[bf]] !== undefined ? b.metadata[biasFields[bf]] : '—';
      }

      // Maritime modifiers
      var allModKeys = C.VALID_MARITIME_MODIFIER_KEYS;
      for (var i = 0; i < allModKeys.length; i++) {
        var mk = allModKeys[i];
        var va = a.maritimeModifiers[mk];
        var vb = b.maritimeModifiers[mk];
        rows['mod: ' + mk] = {};
        rows['mod: ' + mk][presetIdA] = va !== undefined ? va : '—';
        rows['mod: ' + mk][presetIdB] = vb !== undefined ? vb : '—';
      }

      // Map layer field spot-checks
      var spotChecks = {
        'water.shimmerStrength':      ['water', 'shimmerStrength'],
        'water.reflectionOpacity':    ['water', 'reflectionOpacity'],
        'water.harborDarkness':       ['water', 'harborDarkness'],
        'atmosphere.fogAlpha':        ['atmosphere', 'fogAlpha'],
        'atmosphere.hazeStrength':    ['atmosphere', 'hazeStrength'],
        'atmosphere.grainOpacity':    ['atmosphere', 'grainOpacity'],
        'labels.opacity':             ['labels', 'opacity'],
        'labels.suppressionStrength': ['labels', 'suppressionStrength'],
        'roads.arterialOpacity':      ['roads', 'arterialOpacity'],
        'overlays.hudOpacity':        ['overlays', 'hudOpacity'],
      };

      var spotKeys = Object.keys(spotChecks);
      for (var s = 0; s < spotKeys.length; s++) {
        var label  = spotKeys[s];
        var path   = spotChecks[label];
        var layerA = a.mapStyle[path[0]];
        var layerB = b.mapStyle[path[0]];
        var fieldA = layerA ? layerA[path[1]] : undefined;
        var fieldB = layerB ? layerB[path[1]] : undefined;
        rows[label] = {};
        rows[label][presetIdA] = fieldA !== undefined ? fieldA : '(base)';
        rows[label][presetIdB] = fieldB !== undefined ? fieldB : '(base)';
      }

      console.log('[SurfaceStylePresetRuntime] diff: ' + presetIdA + ' vs ' + presetIdB);
      console.table(rows);
      return rows;
    }

    // ── Activate preset ───────────────────────────────────────────────────────
    /**
     * _wos.presets.activatePreset(presetId)
     *
     * Set the active preset by ID.
     *
     * @param {string} presetId
     */
    function activatePreset(presetId) {
      SSPR.setActivePreset(presetId);
      var p = SSPR.getActivePreset();
      return p;
    }

    // ── Clear preset ─────────────────────────────────────────────────────────
    /**
     * _wos.presets.clearPreset()
     *
     * Clear the active preset (returns to base registry).
     */
    function clearPreset() {
      SSPR.clearActivePreset();
      console.log('[SurfaceStylePresetRuntime] Active preset cleared — base registry active');
    }

    // ── Active preset ─────────────────────────────────────────────────────────
    /**
     * _wos.presets.activePreset()
     *
     * Report the current active preset, or null.
     */
    function activePreset() {
      var p = SSPR.getActivePreset();
      if (!p) {
        console.log('[SurfaceStylePresetRuntime] No active preset (base registry)');
      } else {
        console.log('[SurfaceStylePresetRuntime] Active preset: ' +
          p.presetId + ' — "' + p.displayName + '" (' + p.category + ')' +
          (p.protected ? ' 🔒' : ''));
      }
      return p;
    }

    // ── Resolve manifest ──────────────────────────────────────────────────────
    /**
     * _wos.presets.resolveManifest(simulationTimeMs?)
     *
     * Resolve and log a full PresentationManifest snapshot.
     * Uses performance.now() as simulationTimeMs if omitted.
     *
     * @param {number} [simulationTimeMs]
     */
    function resolveManifest(simulationTimeMs) {
      var simMs = typeof simulationTimeMs === 'number' ? simulationTimeMs : performance.now();
      var manifest;
      try {
        manifest = SSPR.resolvePresentationManifest(simMs, null, Date.now());
      } catch (e) {
        console.error('[SurfaceStylePresetRuntime] resolveManifest error:', e.message);
        return null;
      }

      console.group('[SurfaceStylePresetRuntime] PresentationManifest snapshot');
      console.log('presentationManifestId:', manifest.presentationManifestId);
      console.log('presetId:              ', manifest.presetId || '(none)');
      console.log('presetCategory:        ', manifest.presetCategory || '(none)');
      console.log('presetDisplayName:     ', manifest.presetDisplayName || '(none)');
      console.log('visibilityClass:       ', manifest.visibilityClass || '(none)');
      console.log('createdAtMs:           ', manifest.createdAtMs);
      console.log('sspr_version:          ', manifest.sspr_version);

      console.group('mapStyle');
      var msLayers = Object.keys(manifest.mapStyle);
      for (var i = 0; i < msLayers.length; i++) {
        console.log(msLayers[i] + ':', manifest.mapStyle[msLayers[i]]);
      }
      console.groupEnd();

      var maritimeKeys = Object.keys(manifest.maritimeStyle || {});
      console.log('maritimeStyle classes:', maritimeKeys.join(', '));
      console.groupEnd();

      return manifest;
    }

    // ── Maritime modifier preview ─────────────────────────────────────────────
    /**
     * _wos.presets.maritimeModifierPreview(presetId, vesselClass)
     *
     * Show how a preset's maritimeModifiers affect a specific vessel class,
     * comparing base MSR values to post-modifier values.
     *
     * @param {string} presetId
     * @param {string} vesselClass
     */
    function maritimeModifierPreview(presetId, vesselClass) {
      var p = SSPR.getPreset(presetId);
      if (!p) {
        console.warn('[SurfaceStylePresetRuntime] maritimeModifierPreview: unknown preset:', presetId);
        return null;
      }

      var MSR = global.SBE && global.SBE.MaritimeStyleRegistry;
      var MSA = global.SBE && global.SBE.MapStyleAuthority;

      var baseVStyle;
      if (MSR) {
        baseVStyle = MSR.resolveVesselStyle(vesselClass).vesselStyle;
      } else if (MSA) {
        baseVStyle = MSA.getVesselStyle(vesselClass);
      } else {
        console.warn('[SurfaceStylePresetRuntime] maritimeModifierPreview: ' +
          'neither MaritimeStyleRegistry nor MapStyleAuthority found');
        return null;
      }

      var mods    = p.maritimeModifiers;
      var modKeys = Object.keys(mods);
      if (modKeys.length === 0) {
        console.log('[SurfaceStylePresetRuntime] maritimeModifierPreview: ' +
          presetId + ' has no maritimeModifiers');
        return null;
      }

      var rows = {};
      var l    = baseVStyle.lighting             || {};
      var w    = baseVStyle.wakePresentation     || {};
      var h    = baseVStyle.hoverCardPresentation || {};
      var d    = baseVStyle.densityResponse      || {};

      if (mods.farLightAlphaScale !== undefined) {
        rows['lighting.farLightAlpha'] = {
          base:   l.farLightAlpha,
          scale:  mods.farLightAlphaScale,
          result: (l.farLightAlpha * mods.farLightAlphaScale).toFixed(4),
        };
      }
      if (mods.twinkleStrengthScale !== undefined) {
        rows['lighting.twinkleStrength'] = {
          base:   l.twinkleStrength,
          scale:  mods.twinkleStrengthScale,
          result: (l.twinkleStrength * mods.twinkleStrengthScale).toFixed(4),
        };
      }
      if (mods.wakeAlphaScale !== undefined && w.visualAlphaMultiplier !== undefined) {
        rows['wake.visualAlphaMultiplier'] = {
          base:   w.visualAlphaMultiplier,
          scale:  mods.wakeAlphaScale,
          result: (w.visualAlphaMultiplier * mods.wakeAlphaScale).toFixed(4),
        };
      }
      if (mods.hoverCardAlphaScale !== undefined && h.backgroundAlpha !== undefined) {
        rows['hover.backgroundAlpha'] = {
          base:   h.backgroundAlpha,
          scale:  mods.hoverCardAlphaScale,
          result: (h.backgroundAlpha * mods.hoverCardAlphaScale).toFixed(4),
        };
        rows['hover.glowStrength'] = {
          base:   h.glowStrength,
          scale:  mods.hoverCardAlphaScale,
          result: (h.glowStrength * mods.hoverCardAlphaScale).toFixed(4),
        };
      }
      if (mods.densitySuppressionScale !== undefined &&
          d.clutterSuppressionStrength !== undefined) {
        rows['density.clutterSuppressionStrength'] = {
          base:   d.clutterSuppressionStrength,
          scale:  mods.densitySuppressionScale,
          result: Math.min(1.0,
            d.clutterSuppressionStrength * mods.densitySuppressionScale).toFixed(4),
        };
      }

      console.log('[SurfaceStylePresetRuntime] maritimeModifierPreview: ' +
        presetId + ' × "' + (vesselClass || 'default') + '"');
      console.table(rows);
      return rows;
    }

    // ── Validate all ─────────────────────────────────────────────────────────
    /**
     * _wos.presets.validateAll()
     *
     * Integrity check across all registered presets.
     * Flags: unknown modifier keys, out-of-range values, unknown layer keys,
     *        unknown metadata keys, invalid tags, bad bias values.
     */
    function validateAll() {
      var all    = SSPR.getAllPresets();
      var ids    = Object.keys(all);
      var errors = [];

      for (var i = 0; i < ids.length; i++) {
        var p = all[ids[i]];

        // mapStyle layer keys
        var layerKeys = Object.keys(p.mapStyle);
        for (var j = 0; j < layerKeys.length; j++) {
          if (C.VALID_MAP_LAYER_KEYS.indexOf(layerKeys[j]) === -1) {
            errors.push(p.presetId + ': unknown mapStyle layer "' + layerKeys[j] + '"');
          }
        }

        // maritimeModifier keys and ranges
        var modKeys = Object.keys(p.maritimeModifiers);
        for (var k = 0; k < modKeys.length; k++) {
          if (C.VALID_MARITIME_MODIFIER_KEYS.indexOf(modKeys[k]) === -1) {
            errors.push(p.presetId + ': unknown maritimeModifier "' + modKeys[k] + '"');
          } else {
            var v = p.maritimeModifiers[modKeys[k]];
            if (typeof v !== 'number' || v < 0.0 || v > 1.0) {
              errors.push(p.presetId + ': modifier "' + modKeys[k] + '" = ' + v + ' out of [0,1]');
            }
          }
        }

        // metadata keys
        if (p.metadata) {
          var metaKeys = Object.keys(p.metadata);
          for (var m = 0; m < metaKeys.length; m++) {
            if (C.VALID_METADATA_KEYS.indexOf(metaKeys[m]) === -1) {
              errors.push(p.presetId + ': unknown metadata key "' + metaKeys[m] + '"');
            }
          }
          var biases = ['cinematicBias', 'readabilityBias', 'densityBias'];
          for (var b = 0; b < biases.length; b++) {
            var bv = p.metadata[biases[b]];
            if (bv !== undefined && (typeof bv !== 'number' || bv < 0.0 || bv > 1.0)) {
              errors.push(p.presetId + ': metadata.' + biases[b] + ' = ' + bv + ' out of [0,1]');
            }
          }
        }

        // tags
        if (p.tags) {
          for (var t = 0; t < p.tags.length; t++) {
            if (typeof p.tags[t] !== 'string') {
              errors.push(p.presetId + ': tags[' + t + '] is not a string');
            }
          }
        }

        // protected built-ins must have provenance BUILT_IN
        if (p.protected && p.provenance !== 'BUILT_IN') {
          errors.push(p.presetId + ': protected:true but provenance is ' + p.provenance);
        }
      }

      if (errors.length === 0) {
        console.log('[SurfaceStylePresetRuntime] validateAll: PASS ✓ (' +
          ids.length + ' presets)');
      } else {
        console.error('[SurfaceStylePresetRuntime] validateAll: FAIL ✗ (' +
          errors.length + ' errors across ' + ids.length + ' presets)');
        for (var e = 0; e < errors.length; e++) {
          console.error('  ✗', errors[e]);
        }
      }
      return { pass: errors.length === 0, count: ids.length, errors: errors };
    }

    // ── Constants ─────────────────────────────────────────────────────────────
    /**
     * _wos.presets.constants()
     *
     * Print system constants.
     */
    function constants() {
      console.log('[SurfaceStylePresetRuntime] CONSTANTS:');
      console.log('  VERSION:                     ', C.VERSION);
      console.log('  MAX_REGISTERED_PRESETS:      ', C.MAX_REGISTERED_PRESETS);
      console.log('  MAX_PRESET_ID_LENGTH:        ', C.MAX_PRESET_ID_LENGTH);
      console.log('  MAX_DISPLAY_NAME_LENGTH:     ', C.MAX_DISPLAY_NAME_LENGTH);
      console.log('  MAX_DESCRIPTION_LENGTH:      ', C.MAX_DESCRIPTION_LENGTH);
      console.log('  MAX_AUTHOR_LENGTH:           ', C.MAX_AUTHOR_LENGTH);
      console.log('  MAX_TAG_COUNT:               ', C.MAX_TAG_COUNT);
      console.log('  VALID_CATEGORIES:            ', C.VALID_CATEGORIES.join(', '));
      console.log('  VALID_PROVENANCE:            ', C.VALID_PROVENANCE.join(', '));
      console.log('  VALID_MAP_LAYER_KEYS:        ', C.VALID_MAP_LAYER_KEYS.join(', '));
      console.log('  VALID_MARITIME_MODIFIER_KEYS:', C.VALID_MARITIME_MODIFIER_KEYS.join(', '));
      console.log('  VALID_METADATA_KEYS:         ', C.VALID_METADATA_KEYS.join(', '));
      return C;
    }

    // ── Export onto _wos.presets ──────────────────────────────────────────────
    global._wos.presets = Object.freeze({
      catalog:                 catalog,
      inspect:                 inspect,
      diff:                    diff,
      activatePreset:          activatePreset,
      clearPreset:             clearPreset,
      activePreset:            activePreset,
      resolveManifest:         resolveManifest,
      maritimeModifierPreview: maritimeModifierPreview,
      validateAll:             validateAll,
      constants:               constants,

      // Direct pass-throughs
      registerPreset:              SSPR.registerPreset,
      getPreset:                   SSPR.getPreset,
      getAllPresets:                SSPR.getAllPresets,
      setActivePreset:             SSPR.setActivePreset,
      clearActivePreset:           SSPR.clearActivePreset,
      getActivePreset:             SSPR.getActivePreset,
      resolvePresentationManifest: SSPR.resolvePresentationManifest,
    });

    console.log('[SurfaceStylePresetDebug] v' + C.VERSION +
      ' loaded — _wos.presets ready (' +
      Object.keys(SSPR.getAllPresets()).length + ' presets, ' +
      Object.keys(SSPR.getAllPresets()).filter(function(id) {
        return SSPR.getPreset(id).protected;
      }).length + ' protected)');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }

})(window);
