// ── MapStyleAuthorityDebug v1.0.1 ─────────────────────────────────────────────
// 0525A_WOS_MapStyleAuthority_v1.0.1 — development companion
// Status: active
// Classification: debug-tooling (non-production critical path)
//
// Development-time diagnostics for MapStyleAuthority.
//
// All functions are console-oriented and read-only with respect to runtime truth.
// This module is load-order safe — it may be loaded before or after the main
// MapStyleAuthority module as long as it is used after DOMContentLoaded.
//
// Authority constraints (inherited from MapStyleAuthority):
//   DEBUG tooling MAY: read manifests, read registries, read override state,
//     log to console, generate comparison tables, validate manifest integrity.
//   DEBUG tooling MAY NOT: mutate AIS runtime truth, mutate continuity state,
//     mutate wake buffers, mutate camera state, bypass visibilityClass authority.
//
// Usage (browser console):
//   _wos.styleAuthority.snapshot()        — log a full manifest snapshot
//   _wos.styleAuthority.vesselPalette()   — print vessel class color table
//   _wos.styleAuthority.validateManifest(manifest) — integrity check
//   _wos.styleAuthority.diffOverride()    — compare base vs active override
//   _wos.styleAuthority.setOverride(...)  — apply a debug override
//   _wos.styleAuthority.clearOverride()   — remove active override
//   _wos.styleAuthority.constants()       — log system constants
//
// Placement: wall/systems/presentation/mapStyleAuthorityDebug.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  // ── Deferred init — runs after DOMContentLoaded so SBE is fully populated ───
  function _init() {
    var SBE = global.SBE;
    var MSA = SBE && SBE.MapStyleAuthority;

    if (!MSA) {
      console.warn('[MapStyleAuthorityDebug] SBE.MapStyleAuthority not found — load mapStyleAuthority.js first');
      return;
    }

    // Ensure _wos debug namespace exists
    global._wos = global._wos || {};

    // ── Snapshot ──────────────────────────────────────────────────────────────
    /**
     * _wos.styleAuthority.snapshot(visibilityClass?)
     *
     * Generate and log a full MapStyleManifest snapshot.
     * Uses simulation time = 0 unless a running simulation provides it.
     */
    function snapshot(visibilityClass) {
      var simTime = 0;
      try {
        // Try to read live simulation time if available
        if (global._wos && global._wos.state && global._wos.state.time) {
          simTime = global._wos.state.time || 0;
        }
      } catch(e) {}

      var manifest = MSA.generateManifest(simTime, visibilityClass || null);
      console.group('[MapStyleAuthority] Manifest snapshot — ' + manifest.manifestId);
      console.log('version:          ', manifest.version);
      console.log('simulationTimeMs: ', manifest.simulationTimeMs);
      console.log('createdAtMs:      ', manifest.createdAtMs);
      console.log('visibilityClass:  ', manifest.visibilityClass);
      console.log('activeOverrides:  ', manifest.activeOverrides.length);
      console.group('mapStyle');
      var layers = Object.keys(manifest.mapStyle);
      for (var i = 0; i < layers.length; i++) {
        console.log(layers[i] + ':', manifest.mapStyle[layers[i]]);
      }
      console.groupEnd();
      console.group('maritimeStyle (vessel class count: ' + Object.keys(manifest.maritimeStyle).length + ')');
      console.table(
        Object.keys(manifest.maritimeStyle).reduce(function(acc, cls) {
          var v = manifest.maritimeStyle[cls];
          acc[cls] = {
            hullColor:  v.symbolic.hullColorHex,
            accentColor: v.symbolic.accentColorHex,
            compact:    v.symbolic.compactScaleMultiplier,
            detailed:   v.symbolic.detailedScaleMultiplier,
            farAlpha:   v.lighting.farLightAlpha,
            twinkle:    v.lighting.twinkleStrength,
          };
          return acc;
        }, {})
      );
      console.groupEnd();
      console.groupEnd();
      return manifest;
    }

    // ── Vessel Palette ────────────────────────────────────────────────────────
    /**
     * _wos.styleAuthority.vesselPalette()
     *
     * Print a console.table of all vessel class colors and scales.
     */
    function vesselPalette() {
      var registry = MSA.getMaritimeStyleRegistry();
      var classes  = Object.keys(registry);
      var rows = {};
      for (var i = 0; i < classes.length; i++) {
        var cls = classes[i];
        var s   = registry[cls].symbolic;
        var l   = registry[cls].lighting;
        rows[cls] = {
          hull:              s.hullColorHex,
          deck:              s.deckColorHex,
          accent:            s.accentColorHex,
          strokePx:          s.strokeWidthPx,
          compactScale:      s.compactScaleMultiplier,
          detailedScale:     s.detailedScaleMultiplier,
          farLightAlpha:     l.farLightAlpha,
          farLightHaloPx:    l.farLightHaloPx,
          twinkleStrength:   l.twinkleStrength,
        };
      }
      console.log('[MapStyleAuthority] Vessel palette (' + classes.length + ' classes):');
      console.table(rows);
      return rows;
    }

    // ── Manifest Integrity Validator ──────────────────────────────────────────
    /**
     * _wos.styleAuthority.validateManifest(manifest)
     *
     * Check manifest structural integrity. Returns pass/fail summary.
     */
    function validateManifest(manifest) {
      var errors = [];

      if (!manifest) { errors.push('manifest is null/undefined'); }
      else {
        if (typeof manifest.manifestId !== 'string')      errors.push('missing manifestId');
        if (manifest.version !== '1.0.1')                  errors.push('unexpected version: ' + manifest.version);
        if (typeof manifest.simulationTimeMs !== 'number') errors.push('missing simulationTimeMs');
        if (typeof manifest.createdAtMs !== 'number')      errors.push('missing createdAtMs');
        if (!manifest.mapStyle)                            errors.push('missing mapStyle');
        if (!manifest.maritimeStyle)                       errors.push('missing maritimeStyle');
        if (!Array.isArray(manifest.activeOverrides))      errors.push('activeOverrides is not an array');

        var requiredLayers = ['water', 'land', 'roads', 'labels', 'atmosphere', 'overlays'];
        for (var i = 0; i < requiredLayers.length; i++) {
          if (!manifest.mapStyle || !manifest.mapStyle[requiredLayers[i]]) {
            errors.push('missing mapStyle layer: ' + requiredLayers[i]);
          }
        }

        var requiredClasses = ['cargo','tanker','ferry','service','recreational',
                               'fishing','passenger','tug','military','industrial',
                               'unknown','default'];
        for (var j = 0; j < requiredClasses.length; j++) {
          if (!manifest.maritimeStyle || !manifest.maritimeStyle[requiredClasses[j]]) {
            errors.push('missing maritimeStyle class: ' + requiredClasses[j]);
          }
        }

        if (manifest.activeOverrides && manifest.activeOverrides.length > 1) {
          errors.push('GOVERNANCE VIOLATION: more than one active override (' +
            manifest.activeOverrides.length + ')');
        }
      }

      var pass = errors.length === 0;
      if (pass) {
        console.log('[MapStyleAuthority] validateManifest: PASS ✓');
      } else {
        console.error('[MapStyleAuthority] validateManifest: FAIL ✗', errors);
      }
      return { pass: pass, errors: errors };
    }

    // ── Override Diff ─────────────────────────────────────────────────────────
    /**
     * _wos.styleAuthority.diffOverride()
     *
     * Compare base registry values against the active override.
     * No-op if no override is active.
     */
    function diffOverride() {
      var override = MSA.getActiveLiveOverride();
      if (!override) {
        console.log('[MapStyleAuthority] diffOverride: no active override');
        return null;
      }

      var base = MSA.getMapStyleRegistry();
      var layer = override.targetLayer;
      var baseLayer = base[layer] || {};
      var overrideKeys = Object.keys(override.values);
      var diff = {};

      for (var i = 0; i < overrideKeys.length; i++) {
        var k = overrideKeys[i];
        diff[k] = { base: baseLayer[k], override: override.values[k] };
      }

      console.group('[MapStyleAuthority] Active override diff — layer: ' + layer +
        ' | id: ' + override.overrideId +
        ' | provenance: ' + override.provenance);
      console.table(diff);
      if (override.expiresAtMs !== null) {
        var remaining = override.expiresAtMs - Date.now();
        console.log('expires in:', remaining > 0 ? (remaining / 1000).toFixed(1) + 's' : 'EXPIRED');
      } else {
        console.log('expires: never (ephemeral until cleared or surface transition)');
      }
      console.groupEnd();
      return { layer: layer, diff: diff, override: override };
    }

    // ── Debug Override Helpers ────────────────────────────────────────────────
    /**
     * _wos.styleAuthority.setOverride(targetLayer, values, expiresInMs?)
     *
     * Apply a DEBUG_TOOL override for development tuning.
     * Automatically generates an overrideId.
     *
     * @param {string} targetLayer    — 'water'|'land'|'roads'|'labels'|'atmosphere'|'overlays'
     * @param {object} values         — partial layer values to override
     * @param {number} [expiresInMs]  — ms from now until override expires (null = no expiry)
     *
     * Example:
     *   _wos.styleAuthority.setOverride('water', { shimmerStrength: 0.5 })
     *   _wos.styleAuthority.setOverride('atmosphere', { fogAlpha: 0.4 }, 5000)
     */
    function setOverride(targetLayer, values, expiresInMs) {
      var override = {
        overrideId:   'debug::' + targetLayer + '::' + Date.now(),
        targetLayer:  targetLayer,
        values:       values || {},
        expiresAtMs:  (typeof expiresInMs === 'number') ? (Date.now() + expiresInMs) : null,
        provenance:   'DEBUG_TOOL',
      };
      MSA.setSingleLiveOverride(override);
      console.log('[MapStyleAuthority] Override applied:', override.overrideId);
      diffOverride();
      return override;
    }

    /**
     * _wos.styleAuthority.clearOverride()
     *
     * Remove the active live override and return to base registry.
     */
    function clearOverride() {
      MSA.clearLiveOverride();
      console.log('[MapStyleAuthority] Override cleared — base registry restored');
    }

    // ── Constants Log ─────────────────────────────────────────────────────────
    /**
     * _wos.styleAuthority.constants()
     *
     * Log all system constants.
     */
    function constants() {
      console.log('[MapStyleAuthority] System constants:');
      console.table(MSA.CONSTANTS);
      return MSA.CONSTANTS;
    }

    // ── Layer Inspector ───────────────────────────────────────────────────────
    /**
     * _wos.styleAuthority.inspectLayer(layerKey)
     *
     * Inspect a single map style layer in detail.
     *
     * @param {string} layerKey — 'water'|'land'|'roads'|'labels'|'atmosphere'|'overlays'
     */
    function inspectLayer(layerKey) {
      var registry = MSA.getMapStyleRegistry();
      var layer = registry[layerKey];
      if (!layer) {
        console.warn('[MapStyleAuthority] inspectLayer: unknown layer key "' + layerKey + '"');
        console.log('Valid keys:', MSA.CONSTANTS.VALID_LAYER_KEYS);
        return null;
      }
      console.group('[MapStyleAuthority] Layer: ' + layerKey);
      var keys = Object.keys(layer);
      for (var i = 0; i < keys.length; i++) {
        console.log('  ' + keys[i] + ':', layer[keys[i]]);
      }
      console.groupEnd();
      return layer;
    }

    // ── Atmosphere Envelope Check ─────────────────────────────────────────────
    /**
     * _wos.styleAuthority.checkEnvelope(visibilityClass)
     *
     * Show what happens to the manifest under a given visibilityClass.
     * Useful for verifying ATMOSPHERIC_HIDDEN clamp behavior.
     *
     * @param {string} visibilityClass — e.g. 'ATMOSPHERIC_HIDDEN', 'SILHOUETTE', 'FULL'
     */
    function checkEnvelope(visibilityClass) {
      var manifest = MSA.generateManifest(0, visibilityClass);
      console.group('[MapStyleAuthority] checkEnvelope: ' + visibilityClass);
      console.log('fog alpha:     ', manifest.mapStyle.atmosphere.fogAlpha,
        '(base: ' + MSA.getMapStyleRegistry().atmosphere.fogAlpha + ')');
      console.log('label opacity: ', manifest.mapStyle.labels.opacity,
        '(base: ' + MSA.getMapStyleRegistry().labels.opacity + ')');
      console.log('label suppression:', manifest.mapStyle.labels.suppressionStrength,
        '(base: ' + MSA.getMapStyleRegistry().labels.suppressionStrength + ')');
      console.groupEnd();
      return manifest;
    }

    // ── Export onto _wos.styleAuthority ──────────────────────────────────────
    global._wos.styleAuthority = Object.freeze({
      snapshot:         snapshot,
      vesselPalette:    vesselPalette,
      validateManifest: validateManifest,
      diffOverride:     diffOverride,
      setOverride:      setOverride,
      clearOverride:    clearOverride,
      constants:        constants,
      inspectLayer:     inspectLayer,
      checkEnvelope:    checkEnvelope,

      // Direct pass-throughs for convenience
      generateManifest:     MSA.generateManifest,
      getVesselStyle:       MSA.getVesselStyle,
    });

    console.log('[MapStyleAuthorityDebug] v' + (MSA.CONSTANTS.VERSION) +
      ' loaded — _wos.styleAuthority ready');
  }

  // ── Boot ──────────────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init(); // already past DOMContentLoaded (e.g. loaded dynamically)
  }

})(window);
