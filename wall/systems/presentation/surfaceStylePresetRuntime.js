// ── SurfaceStylePresetRuntime v1.0.1 ─────────────────────────────────────────
// 0525D_WOS_SurfaceStylePresets_v1.0.1 (supersedes v1.0.0)
// Status: active
// Classification: bounded-presentation-identity-authority
//
// Immutable atmospheric presentation presets layered between MapStyleAuthority
// and LiveStylePanel. Presets describe presentation identity. They do NOT
// create simulation truth.
//
// Canonical Precedence:
//   Base Registry (MapStyleAuthority)
//   → Surface Preset  (this module)
//   → Live Override   (LiveStylePanel → MapStyleAuthority.setSingleLiveOverride)
//   → Visibility Envelope
//   → Immutable Manifest Freeze
//
// Authority boundaries (constitutional):
//   SurfaceStylePresetRuntime OWNS: preset catalog, preset registration, active
//     preset state, presentation identity resolution, manifest contribution
//     via resolvePresentationManifest().
//
//   SurfaceStylePresetRuntime MAY OBSERVE: MapStyleAuthority base registry,
//     MaritimeStyleRegistry vessel styles, MapStyleAuthority active override
//     (read-only, for manifest merge), AtmosphericReadability visibilityClass
//     (passed by caller — not read directly).
//
//   SurfaceStylePresetRuntime MAY NOT MUTATE: AIS state, vessel positions,
//     wake buffers, continuity cadence, visibilityClass, population tier,
//     clutter pressure, camera state, urgency signals, MapStyleAuthority
//     internal registry, MaritimeStyleRegistry entries.
//
// SurfaceStylePreset schema (v1.0.1):
//   {
//     presetId:    string             — unique SCREAMING_SNAKE_CASE key
//     version:     string             — semver string
//     category:    PresetCategory     — QUIET_HARBOR | MIDNIGHT_FREIGHT |
//                                       SIGNAL_DRIFT | BROADCAST_FAILURE | CUSTOM
//     displayName: string             — human-readable label (≤ 80 chars)
//     description: string             — intent summary (≤ 160 chars)
//     provenance:  PresetProvenance   — BUILT_IN | USER | SERIALIZED | DEBUG
//     protected:   boolean            — if true, cannot be overwritten
//     tags:        string[]           — optional classification tags
//     author:      string             — optional author identifier (≤ 80 chars)
//     createdAtMs: number             — optional wall-clock creation timestamp
//     mapStyle:    partial MapStyleRegistry
//     maritimeModifiers: {
//       farLightAlphaScale?:        number [0..1]
//       twinkleStrengthScale?:      number [0..1]
//       wakeAlphaScale?:            number [0..1]
//       hoverCardAlphaScale?:       number [0..1]
//       densitySuppressionScale?:   number [0..1]
//     }
//     metadata: {
//       intendedZoomRange?:   [number, number]
//       cinematicBias?:       number [0..1]
//       readabilityBias?:     number [0..1]
//       densityBias?:         number [0..1]
//       performanceTier?:     string
//     }
//   }
//
// Maritime modifier doctrine:
//   Multipliers scale MSR class values. They do NOT replace them.
//   Presets may suppress or soften. Presets may not elevate urgency.
//
// resolvePresentationManifest merges:
//   MSA.generateManifest()  ← base + active live override
//   + active preset mapStyle overrides
//   + active preset maritimeModifiers applied per vessel class
//
// Placement: wall/systems/presentation/surfaceStylePresetRuntime.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  // ── Version ───────────────────────────────────────────────────────────────────
  var VERSION = '1.0.1';

  // ── Preset Categories ─────────────────────────────────────────────────────────
  var CATEGORY_QUIET_HARBOR      = 'QUIET_HARBOR';
  var CATEGORY_MIDNIGHT_FREIGHT  = 'MIDNIGHT_FREIGHT';
  var CATEGORY_SIGNAL_DRIFT      = 'SIGNAL_DRIFT';
  var CATEGORY_BROADCAST_FAILURE = 'BROADCAST_FAILURE';
  var CATEGORY_CUSTOM            = 'CUSTOM';

  var VALID_CATEGORIES = Object.freeze([
    CATEGORY_QUIET_HARBOR,
    CATEGORY_MIDNIGHT_FREIGHT,
    CATEGORY_SIGNAL_DRIFT,
    CATEGORY_BROADCAST_FAILURE,
    CATEGORY_CUSTOM,
  ]);

  // ── Preset Provenance ─────────────────────────────────────────────────────────
  // v1.0.1: expanded from ['BUILT_IN', 'REGISTERED']
  var VALID_PROVENANCE = Object.freeze([
    'BUILT_IN',    // canonical four — protected, immutable
    'USER',        // registered at runtime by calling code
    'SERIALIZED',  // loaded from persisted storage (0525G)
    'DEBUG',       // registered by debug tooling only
  ]);

  // ── System Constants ──────────────────────────────────────────────────────────
  var MAX_REGISTERED_PRESETS  = 32;
  var MAX_PRESET_ID_LENGTH    = 64;
  var MAX_DISPLAY_NAME_LENGTH = 80;
  var MAX_DESCRIPTION_LENGTH  = 160;
  var MAX_AUTHOR_LENGTH       = 80;
  var MAX_TAG_COUNT           = 16;
  var MAX_TAG_LENGTH          = 48;

  var VALID_MAP_LAYER_KEYS = Object.freeze([
    'water', 'land', 'roads', 'labels', 'atmosphere', 'overlays',
  ]);

  var VALID_MARITIME_MODIFIER_KEYS = Object.freeze([
    'farLightAlphaScale',
    'twinkleStrengthScale',
    'wakeAlphaScale',
    'hoverCardAlphaScale',
    'densitySuppressionScale',
  ]);

  var VALID_METADATA_KEYS = Object.freeze([
    'intendedZoomRange',
    'cinematicBias',
    'readabilityBias',
    'densityBias',
    'performanceTier',
  ]);

  // ── Preset Compiler Helpers ───────────────────────────────────────────────────

  /**
   * _preset(presetId, category, displayName, description, mapStyle,
   *         maritimeModifiers, tags, author, metadata)
   *
   * Factory for built-in preset descriptors. All built-in presets are:
   *   - provenance: 'BUILT_IN'
   *   - protected:  true
   *   - createdAtMs: 0 (static — not runtime truth)
   */
  function _preset(presetId, category, displayName, description,
                   mapStyle, maritimeModifiers, tags, author, metadata) {
    return Object.freeze({
      presetId:          presetId,
      version:           VERSION,
      category:          category,
      displayName:       displayName,
      description:       description,
      provenance:        'BUILT_IN',
      protected:         true,
      tags:              Object.freeze(tags || []),
      author:            author || 'WOS',
      createdAtMs:       0,
      mapStyle:          _freezeMapStyle(mapStyle || {}),
      maritimeModifiers: Object.freeze(maritimeModifiers || {}),
      metadata:          Object.freeze(metadata || {}),
    });
  }

  function _freezeMapStyle(mapStyle) {
    var frozen = {};
    var keys = Object.keys(mapStyle);
    for (var i = 0; i < keys.length; i++) {
      frozen[keys[i]] = Object.freeze(Object.assign({}, mapStyle[keys[i]]));
    }
    return Object.freeze(frozen);
  }

  function _deepFreezeMetadata(meta) {
    if (!meta || typeof meta !== 'object') return Object.freeze({});
    var result = {};
    var keys = Object.keys(meta);
    for (var i = 0; i < keys.length; i++) {
      var v = meta[keys[i]];
      result[keys[i]] = Array.isArray(v) ? Object.freeze(v.slice()) : v;
    }
    return Object.freeze(result);
  }

  // ── Built-in Preset Definitions ───────────────────────────────────────────────
  //
  // Each preset provides partial layer overrides (merged over the base registry)
  // and optional maritime multipliers (applied to resolved MSR values).
  //
  // Design doctrine:
  //   QUIET_HARBOR      — pre-dawn stillness; muted but present
  //   MIDNIGHT_FREIGHT  — industrial deep-night; high contrast, dim ambient
  //   SIGNAL_DRIFT      — degraded signal world; grain, fog, suppressed labels
  //   BROADCAST_FAILURE — near-collapse broadcast; maximum suppression, haze

  function _compileBuiltInPresets() {
    return [

      // ── QUIET_HARBOR ─────────────────────────────────────────────────────────
      _preset(
        'QUIET_HARBOR',
        CATEGORY_QUIET_HARBOR,
        'Quiet Harbor',
        'Pre-dawn stillness. Ambient vessel presence. Soft water reflection.',
        // mapStyle
        {
          water: {
            shimmerStrength:   0.22,
            reflectionOpacity: 0.32,
            currentBandAlpha:  0.06,
            harborDarkness:    0.82,
          },
          land: {
            districtContrast:             0.20,
            nighttimeDarkness:            0.92,
            infrastructureShadowStrength: 0.25,
          },
          roads: {
            arterialOpacity:  0.12,
            localRoadOpacity: 0.04,
            glowStrength:     0.08,
            labelSuppression: 0.80,
            nighttimeFade:    0.88,
          },
          labels: {
            density:             0.20,
            opacity:             0.40,
            suppressionStrength: 0.70,
          },
          atmosphere: {
            fogAlpha:      0.22,
            hazeStrength:  0.35,
            grainOpacity:  0.05,
            glowRadius:    8.0,
            bloomSoftness: 0.28,
          },
          overlays: {
            hudOpacity:        0.55,
            scannerStrength:   0.30,
            typographyGlow:    0.40,
            telemetrySoftness: 0.20,
            noiseSuppression:  0.65,
          },
        },
        // maritimeModifiers
        {
          farLightAlphaScale:      0.85,
          twinkleStrengthScale:    0.70,
          wakeAlphaScale:          0.55,
          hoverCardAlphaScale:     0.90,
          densitySuppressionScale: 0.80,
        },
        // tags
        ['stillness', 'pre-dawn', 'ambient', 'soft', 'low-pressure'],
        // author
        'WOS',
        // metadata
        {
          intendedZoomRange: [10.0, 14.0],
          cinematicBias:     0.75,
          readabilityBias:   0.50,
          densityBias:       0.20,
          performanceTier:   'standard',
        }
      ),

      // ── MIDNIGHT_FREIGHT ──────────────────────────────────────────────────────
      _preset(
        'MIDNIGHT_FREIGHT',
        CATEGORY_MIDNIGHT_FREIGHT,
        'Midnight Freight',
        'Industrial deep-night. High contrast harbor. Freight vessels dominant.',
        // mapStyle
        {
          water: {
            baseColor:         '#04060b',
            shimmerStrength:   0.08,
            reflectionOpacity: 0.12,
            currentBandAlpha:  0.14,
            coastlineContrast: 1.25,
            harborDarkness:    0.96,
          },
          land: {
            landColorHex:                  '#0c0e13',
            districtContrast:              0.50,
            coastlineVisibility:           0.75,
            infrastructureShadowStrength:  0.60,
            nighttimeDarkness:             0.95,
          },
          roads: {
            arterialOpacity:  0.22,
            localRoadOpacity: 0.06,
            glowStrength:     0.30,
            labelSuppression: 0.70,
            nighttimeFade:    0.90,
          },
          labels: {
            density:             0.25,
            opacity:             0.55,
            suppressionStrength: 0.60,
          },
          atmosphere: {
            fogAlpha:      0.10,
            hazeStrength:  0.15,
            grainOpacity:  0.03,
            glowRadius:    14.0,
            bloomSoftness: 0.45,
          },
          overlays: {
            hudOpacity:        0.85,
            scannerStrength:   0.60,
            typographyGlow:    0.70,
            telemetrySoftness: 0.35,
            noiseSuppression:  0.40,
          },
        },
        // maritimeModifiers
        {
          farLightAlphaScale:      1.0,
          twinkleStrengthScale:    0.55,
          wakeAlphaScale:          0.90,
          hoverCardAlphaScale:     1.0,
          densitySuppressionScale: 0.60,
        },
        // tags
        ['industrial', 'deep-night', 'freight', 'high-contrast', 'cargo'],
        // author
        'WOS',
        // metadata
        {
          intendedZoomRange: [9.0, 13.0],
          cinematicBias:     0.85,
          readabilityBias:   0.65,
          densityBias:       0.70,
          performanceTier:   'standard',
        }
      ),

      // ── SIGNAL_DRIFT ──────────────────────────────────────────────────────────
      _preset(
        'SIGNAL_DRIFT',
        CATEGORY_SIGNAL_DRIFT,
        'Signal Drift',
        'Degraded signal world. AIS thinning. Vessels uncertain. Fog creeps.',
        // mapStyle
        {
          water: {
            shimmerStrength:   0.10,
            reflectionOpacity: 0.14,
            currentBandAlpha:  0.08,
            coastlineContrast: 0.90,
            harborDarkness:    0.94,
          },
          land: {
            districtContrast:             0.18,
            coastlineVisibility:          0.35,
            infrastructureShadowStrength: 0.30,
            nighttimeDarkness:            0.90,
          },
          roads: {
            arterialOpacity:  0.08,
            localRoadOpacity: 0.03,
            glowStrength:     0.10,
            labelSuppression: 0.88,
            nighttimeFade:    0.92,
          },
          labels: {
            density:             0.10,
            opacity:             0.25,
            suppressionStrength: 0.85,
          },
          atmosphere: {
            fogAlpha:      0.38,
            hazeStrength:  0.55,
            grainOpacity:  0.09,
            glowRadius:    6.0,
            bloomSoftness: 0.18,
          },
          overlays: {
            hudOpacity:        0.40,
            scannerStrength:   0.25,
            typographyGlow:    0.20,
            telemetrySoftness: 0.50,
            noiseSuppression:  0.75,
          },
        },
        // maritimeModifiers
        {
          farLightAlphaScale:      0.55,
          twinkleStrengthScale:    1.0,
          wakeAlphaScale:          0.35,
          hoverCardAlphaScale:     0.65,
          densitySuppressionScale: 1.0,
        },
        // tags
        ['degraded', 'fog', 'uncertainty', 'signal-loss', 'suppressed'],
        // author
        'WOS',
        // metadata
        {
          intendedZoomRange: [9.0, 14.0],
          cinematicBias:     0.90,
          readabilityBias:   0.25,
          densityBias:       0.10,
          performanceTier:   'standard',
        }
      ),

      // ── BROADCAST_FAILURE ─────────────────────────────────────────────────────
      _preset(
        'BROADCAST_FAILURE',
        CATEGORY_BROADCAST_FAILURE,
        'Broadcast Failure',
        'Near-collapse broadcast. Maximum suppression. Signal nearly gone.',
        // mapStyle
        {
          water: {
            baseColor:         '#020305',
            shimmerStrength:   0.04,
            reflectionOpacity: 0.06,
            currentBandAlpha:  0.04,
            coastlineContrast: 0.70,
            harborDarkness:    0.98,
          },
          land: {
            landColorHex:                  '#080a0d',
            districtContrast:              0.08,
            coastlineVisibility:           0.15,
            infrastructureShadowStrength:  0.12,
            nighttimeDarkness:             0.98,
          },
          roads: {
            arterialOpacity:  0.03,
            localRoadOpacity: 0.01,
            glowStrength:     0.04,
            labelSuppression: 0.97,
            nighttimeFade:    0.98,
          },
          labels: {
            density:             0.04,
            opacity:             0.10,
            suppressionStrength: 0.96,
          },
          atmosphere: {
            fogAlpha:      0.62,
            hazeStrength:  0.80,
            grainOpacity:  0.14,
            glowRadius:    3.0,
            bloomSoftness: 0.08,
          },
          overlays: {
            hudOpacity:        0.18,
            scannerStrength:   0.10,
            typographyGlow:    0.08,
            telemetrySoftness: 0.75,
            noiseSuppression:  0.92,
          },
        },
        // maritimeModifiers
        {
          farLightAlphaScale:      0.22,
          twinkleStrengthScale:    1.0,
          wakeAlphaScale:          0.15,
          hoverCardAlphaScale:     0.35,
          densitySuppressionScale: 1.0,
        },
        // tags
        ['collapse', 'failure', 'maximum-suppression', 'ghost', 'minimal'],
        // author
        'WOS',
        // metadata
        {
          intendedZoomRange: [8.0, 13.0],
          cinematicBias:     1.0,
          readabilityBias:   0.05,
          densityBias:       0.05,
          performanceTier:   'standard',
        }
      ),

    ];
  }

  // ── Registry ──────────────────────────────────────────────────────────────────

  var _registry    = {};   // presetId → SurfaceStylePreset
  var _activePresetId = null;

  function _seedBuiltIns() {
    var presets = _compileBuiltInPresets();
    for (var i = 0; i < presets.length; i++) {
      _registry[presets[i].presetId] = presets[i];
    }
  }

  _seedBuiltIns();

  // ── Preset Validation ─────────────────────────────────────────────────────────

  function _validatePresetDescriptor(desc) {
    var errors = [];

    if (!desc || typeof desc !== 'object') {
      return ['descriptor must be a non-null object'];
    }

    // presetId
    if (typeof desc.presetId !== 'string' || !desc.presetId ||
        desc.presetId.length > MAX_PRESET_ID_LENGTH) {
      errors.push('presetId must be a non-empty string (max ' + MAX_PRESET_ID_LENGTH + ' chars)');
    }

    // category
    if (VALID_CATEGORIES.indexOf(desc.category) === -1) {
      errors.push('category must be one of: ' + VALID_CATEGORIES.join(', '));
    }

    // displayName
    if (typeof desc.displayName !== 'string' || !desc.displayName ||
        desc.displayName.length > MAX_DISPLAY_NAME_LENGTH) {
      errors.push('displayName must be a non-empty string (max ' + MAX_DISPLAY_NAME_LENGTH + ' chars)');
    }

    // description
    if (typeof desc.description !== 'string' ||
        desc.description.length > MAX_DESCRIPTION_LENGTH) {
      errors.push('description must be a string (max ' + MAX_DESCRIPTION_LENGTH + ' chars)');
    }

    // tags (optional)
    if (desc.tags !== undefined) {
      if (!Array.isArray(desc.tags)) {
        errors.push('tags must be an array of strings');
      } else {
        if (desc.tags.length > MAX_TAG_COUNT) {
          errors.push('tags must have at most ' + MAX_TAG_COUNT + ' entries');
        }
        for (var t = 0; t < desc.tags.length; t++) {
          if (typeof desc.tags[t] !== 'string' || desc.tags[t].length > MAX_TAG_LENGTH) {
            errors.push('tags[' + t + '] must be a string (max ' + MAX_TAG_LENGTH + ' chars)');
          }
        }
      }
    }

    // author (optional)
    if (desc.author !== undefined &&
        (typeof desc.author !== 'string' || desc.author.length > MAX_AUTHOR_LENGTH)) {
      errors.push('author must be a string (max ' + MAX_AUTHOR_LENGTH + ' chars)');
    }

    // createdAtMs (optional)
    if (desc.createdAtMs !== undefined &&
        (typeof desc.createdAtMs !== 'number' || !isFinite(desc.createdAtMs))) {
      errors.push('createdAtMs must be a finite number if provided');
    }

    // mapStyle
    if (!desc.mapStyle || typeof desc.mapStyle !== 'object') {
      errors.push('mapStyle must be a non-null object');
    } else {
      var layerKeys = Object.keys(desc.mapStyle);
      for (var i = 0; i < layerKeys.length; i++) {
        if (VALID_MAP_LAYER_KEYS.indexOf(layerKeys[i]) === -1) {
          errors.push('mapStyle contains unknown layer key: ' + layerKeys[i]);
        }
      }
    }

    // maritimeModifiers (optional)
    if (desc.maritimeModifiers) {
      if (typeof desc.maritimeModifiers !== 'object') {
        errors.push('maritimeModifiers must be an object if provided');
      } else {
        var modKeys = Object.keys(desc.maritimeModifiers);
        for (var j = 0; j < modKeys.length; j++) {
          if (VALID_MARITIME_MODIFIER_KEYS.indexOf(modKeys[j]) === -1) {
            errors.push('maritimeModifiers contains unknown key: ' + modKeys[j]);
          } else {
            var v = desc.maritimeModifiers[modKeys[j]];
            if (typeof v !== 'number' || !isFinite(v) || v < 0.0 || v > 1.0) {
              errors.push('maritimeModifiers.' + modKeys[j] +
                ' must be a finite number in [0.0, 1.0]; got: ' + v);
            }
          }
        }
      }
    }

    // metadata (optional)
    if (desc.metadata !== undefined) {
      if (typeof desc.metadata !== 'object' || desc.metadata === null) {
        errors.push('metadata must be a non-null object if provided');
      } else {
        var metaKeys = Object.keys(desc.metadata);
        for (var m = 0; m < metaKeys.length; m++) {
          if (VALID_METADATA_KEYS.indexOf(metaKeys[m]) === -1) {
            errors.push('metadata contains unknown key: ' + metaKeys[m]);
          }
        }
        // intendedZoomRange must be [number, number] if present
        if (desc.metadata.intendedZoomRange !== undefined) {
          var zr = desc.metadata.intendedZoomRange;
          if (!Array.isArray(zr) || zr.length !== 2 ||
              typeof zr[0] !== 'number' || typeof zr[1] !== 'number') {
            errors.push('metadata.intendedZoomRange must be [number, number]');
          }
        }
        // bias fields must be [0..1]
        var biasFields = ['cinematicBias', 'readabilityBias', 'densityBias'];
        for (var b = 0; b < biasFields.length; b++) {
          var bf = desc.metadata[biasFields[b]];
          if (bf !== undefined && (typeof bf !== 'number' || bf < 0.0 || bf > 1.0)) {
            errors.push('metadata.' + biasFields[b] + ' must be a number in [0.0, 1.0]');
          }
        }
        // performanceTier must be string if present
        if (desc.metadata.performanceTier !== undefined &&
            typeof desc.metadata.performanceTier !== 'string') {
          errors.push('metadata.performanceTier must be a string');
        }
      }
    }

    return errors;
  }

  // ── Maritime Modifier Application ─────────────────────────────────────────────
  //
  // Multipliers scale existing MSR class values.
  // They do NOT replace them — class identity is preserved.

  function _applyMaritimeModifiers(vesselStyle, modifiers) {
    if (!modifiers || !vesselStyle) return vesselStyle;

    var lighting = vesselStyle.lighting;
    var wake     = vesselStyle.wakePresentation;
    var hover    = vesselStyle.hoverCardPresentation;
    var density  = vesselStyle.densityResponse;

    var newLighting = lighting;
    var newWake     = wake;
    var newHover    = hover;
    var newDensity  = density;

    if (modifiers.farLightAlphaScale !== undefined ||
        modifiers.twinkleStrengthScale !== undefined) {
      newLighting = Object.freeze(Object.assign({}, lighting, {
        farLightAlpha: lighting.farLightAlpha *
          (modifiers.farLightAlphaScale !== undefined ? modifiers.farLightAlphaScale : 1.0),
        twinkleStrength: lighting.twinkleStrength *
          (modifiers.twinkleStrengthScale !== undefined ? modifiers.twinkleStrengthScale : 1.0),
      }));
    }

    if (modifiers.wakeAlphaScale !== undefined && wake) {
      newWake = Object.freeze(Object.assign({}, wake, {
        visualAlphaMultiplier: wake.visualAlphaMultiplier * modifiers.wakeAlphaScale,
      }));
    }

    if (hover && modifiers.hoverCardAlphaScale !== undefined) {
      newHover = Object.freeze(Object.assign({}, hover, {
        backgroundAlpha: hover.backgroundAlpha * modifiers.hoverCardAlphaScale,
        glowStrength:    hover.glowStrength    * modifiers.hoverCardAlphaScale,
      }));
    }

    if (density && modifiers.densitySuppressionScale !== undefined) {
      newDensity = Object.freeze(Object.assign({}, density, {
        clutterSuppressionStrength: Math.min(1.0,
          density.clutterSuppressionStrength * modifiers.densitySuppressionScale),
        wakeSuppressionStrength: Math.min(1.0,
          density.wakeSuppressionStrength * modifiers.densitySuppressionScale),
      }));
    }

    return Object.freeze(Object.assign({}, vesselStyle, {
      lighting:              newLighting,
      wakePresentation:      newWake,
      hoverCardPresentation: newHover,
      densityResponse:       newDensity,
    }));
  }

  function _applyPresetToMapStyle(baseMapStyle, presetMapStyle) {
    var result = {};
    for (var i = 0; i < VALID_MAP_LAYER_KEYS.length; i++) {
      var key  = VALID_MAP_LAYER_KEYS[i];
      var base = baseMapStyle[key] || {};
      var over = presetMapStyle[key] || {};
      result[key] = Object.freeze(Object.assign({}, base, over));
    }
    return Object.freeze(result);
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  /**
   * registerPreset(descriptor)
   *
   * Register a preset into the catalog. Validates fully before acceptance.
   * Protected preset IDs (protected:true) may not be overwritten.
   * Maximum MAX_REGISTERED_PRESETS total entries in the registry.
   *
   * Caller-registered presets receive provenance: 'USER' unless descriptor
   * specifies 'SERIALIZED' or 'DEBUG'.
   *
   * @param  {SurfaceStylePreset} descriptor
   * @throws if descriptor is invalid, protected conflict, or registry full
   */
  function registerPreset(descriptor) {
    var errors = _validatePresetDescriptor(descriptor);
    if (errors.length > 0) {
      throw new Error('[SurfaceStylePresetRuntime] Invalid preset: ' + errors.join('; '));
    }

    var existing = _registry[descriptor.presetId];
    if (existing && existing.protected) {
      throw new Error('[SurfaceStylePresetRuntime] Cannot overwrite protected preset: ' +
        descriptor.presetId);
    }

    var count = Object.keys(_registry).length;
    if (!existing && count >= MAX_REGISTERED_PRESETS) {
      throw new Error('[SurfaceStylePresetRuntime] Preset registry full (' +
        MAX_REGISTERED_PRESETS + ' max)');
    }

    // Resolve provenance — only BUILT_IN is blocked for callers
    var allowedExternalProvenance = ['USER', 'SERIALIZED', 'DEBUG'];
    var provenance = (descriptor.provenance &&
                      allowedExternalProvenance.indexOf(descriptor.provenance) !== -1)
      ? descriptor.provenance
      : 'USER';

    var frozen = Object.freeze({
      presetId:          descriptor.presetId,
      version:           descriptor.version || VERSION,
      category:          descriptor.category,
      displayName:       descriptor.displayName,
      description:       descriptor.description || '',
      provenance:        provenance,
      protected:         false,   // externally registered presets are never protected
      tags:              Object.freeze(Array.isArray(descriptor.tags) ? descriptor.tags.slice() : []),
      author:            typeof descriptor.author === 'string' ? descriptor.author : '',
      createdAtMs:       typeof descriptor.createdAtMs === 'number' ? descriptor.createdAtMs : Date.now(),
      mapStyle:          _freezeMapStyle(descriptor.mapStyle || {}),
      maritimeModifiers: Object.freeze(Object.assign({}, descriptor.maritimeModifiers || {})),
      metadata:          _deepFreezeMetadata(descriptor.metadata),
    });

    _registry[descriptor.presetId] = frozen;
    console.log('[SurfaceStylePresetRuntime] Registered preset: ' +
      descriptor.presetId + ' (' + provenance + ')');
  }

  /**
   * getPreset(presetId)
   *
   * Return an immutable SurfaceStylePreset by ID, or null.
   *
   * @param  {string} presetId
   * @return {SurfaceStylePreset|null}
   */
  function getPreset(presetId) {
    return _registry[presetId] || null;
  }

  /**
   * getAllPresets()
   *
   * Return a frozen snapshot of all registered presets, keyed by presetId.
   *
   * @return {Object.<string, SurfaceStylePreset>}
   */
  function getAllPresets() {
    var snap = {};
    var keys = Object.keys(_registry);
    for (var i = 0; i < keys.length; i++) {
      snap[keys[i]] = _registry[keys[i]];
    }
    return Object.freeze(snap);
  }

  /**
   * setActivePreset(presetId)
   *
   * Activate one preset by ID. Only one may be active at a time.
   *
   * @param  {string} presetId
   * @throws if presetId is not registered
   */
  function setActivePreset(presetId) {
    if (!_registry[presetId]) {
      throw new Error('[SurfaceStylePresetRuntime] Unknown presetId: ' + presetId);
    }
    _activePresetId = presetId;
    console.log('[SurfaceStylePresetRuntime] Active preset → ' + presetId);
  }

  /**
   * clearActivePreset()
   *
   * Remove the active preset. Returns to base registry identity.
   */
  function clearActivePreset() {
    _activePresetId = null;
  }

  /**
   * getActivePreset()
   *
   * Return the active SurfaceStylePreset, or null if none is set.
   *
   * @return {SurfaceStylePreset|null}
   */
  function getActivePreset() {
    return _activePresetId ? (_registry[_activePresetId] || null) : null;
  }

  /**
   * resolvePresentationManifest(simulationTimeMs, visibilityClass, createdAtMs?)
   *
   * Generate a full PresentationManifest:
   *   1. MSA.generateManifest()               — base + active live override
   *   2. Active preset mapStyle layer merges   — over the base
   *   3. Active preset maritimeModifiers       — scaled per vessel class
   *   4. Extension fields appended             — presetId, presetCategory, etc.
   *
   * The returned manifest is immutable. It is NOT runtime truth.
   *
   * @param  {number}      simulationTimeMs
   * @param  {string|null} visibilityClass  — from AtmosphericReadability
   * @param  {number}      [createdAtMs]
   * @return {PresentationManifest}
   */
  function resolvePresentationManifest(simulationTimeMs, visibilityClass, createdAtMs) {
    var MSA = global.SBE && global.SBE.MapStyleAuthority;
    if (!MSA) {
      throw new Error('[SurfaceStylePresetRuntime] SBE.MapStyleAuthority not found — ' +
        'load mapStyleAuthority.js before surfaceStylePresetRuntime.js');
    }

    var nowMs        = typeof createdAtMs === 'number' ? createdAtMs : Date.now();
    var baseManifest = MSA.generateManifest(simulationTimeMs, visibilityClass, nowMs);
    var activePreset = getActivePreset();

    if (!activePreset) {
      return Object.freeze(Object.assign({}, baseManifest, {
        presentationManifestId: 'presentation-manifest::' + simulationTimeMs,
        presetId:               null,
        presetCategory:         null,
        presetDisplayName:      null,
        sspr_version:           VERSION,
      }));
    }

    // ── Apply preset mapStyle overrides ───────────────────────────────────────
    var mergedMapStyle = _applyPresetToMapStyle(
      baseManifest.mapStyle,
      activePreset.mapStyle
    );

    // ── Apply preset maritimeModifiers per vessel class ───────────────────────
    var baseMaritimeStyle    = baseManifest.maritimeStyle;
    var modifiedMaritimeStyle;
    var modKeys = Object.keys(activePreset.maritimeModifiers);

    if (modKeys.length > 0) {
      var classKeys = Object.keys(baseMaritimeStyle);
      var modified  = {};
      for (var i = 0; i < classKeys.length; i++) {
        var cls   = classKeys[i];
        modified[cls] = _applyMaritimeModifiers(
          baseMaritimeStyle[cls],
          activePreset.maritimeModifiers
        );
      }
      modifiedMaritimeStyle = Object.freeze(modified);
    } else {
      modifiedMaritimeStyle = baseMaritimeStyle;
    }

    return Object.freeze(Object.assign({}, baseManifest, {
      presentationManifestId: 'presentation-manifest::' + simulationTimeMs,
      manifestId:             baseManifest.manifestId,
      mapStyle:               mergedMapStyle,
      maritimeStyle:          modifiedMaritimeStyle,
      presetId:               activePreset.presetId,
      presetCategory:         activePreset.category,
      presetDisplayName:      activePreset.displayName,
      sspr_version:           VERSION,
    }));
  }

  // ── Export ────────────────────────────────────────────────────────────────────

  SBE.SurfaceStylePresetRuntime = Object.freeze({

    // Preset catalog
    registerPreset:  registerPreset,
    getPreset:       getPreset,
    getAllPresets:    getAllPresets,

    // Active preset state
    setActivePreset:   setActivePreset,
    clearActivePreset: clearActivePreset,
    getActivePreset:   getActivePreset,

    // Primary public interface
    resolvePresentationManifest: resolvePresentationManifest,

    // System constants
    CONSTANTS: Object.freeze({
      VERSION:                     VERSION,
      MAX_REGISTERED_PRESETS:      MAX_REGISTERED_PRESETS,
      MAX_PRESET_ID_LENGTH:        MAX_PRESET_ID_LENGTH,
      MAX_DISPLAY_NAME_LENGTH:     MAX_DISPLAY_NAME_LENGTH,
      MAX_DESCRIPTION_LENGTH:      MAX_DESCRIPTION_LENGTH,
      MAX_AUTHOR_LENGTH:           MAX_AUTHOR_LENGTH,
      MAX_TAG_COUNT:               MAX_TAG_COUNT,
      MAX_TAG_LENGTH:              MAX_TAG_LENGTH,
      VALID_CATEGORIES:            VALID_CATEGORIES,
      VALID_PROVENANCE:            VALID_PROVENANCE,
      VALID_MAP_LAYER_KEYS:        VALID_MAP_LAYER_KEYS,
      VALID_MARITIME_MODIFIER_KEYS: VALID_MARITIME_MODIFIER_KEYS,
      VALID_METADATA_KEYS:         VALID_METADATA_KEYS,
      CATEGORY_QUIET_HARBOR:       CATEGORY_QUIET_HARBOR,
      CATEGORY_MIDNIGHT_FREIGHT:   CATEGORY_MIDNIGHT_FREIGHT,
      CATEGORY_SIGNAL_DRIFT:       CATEGORY_SIGNAL_DRIFT,
      CATEGORY_BROADCAST_FAILURE:  CATEGORY_BROADCAST_FAILURE,
      CATEGORY_CUSTOM:             CATEGORY_CUSTOM,
    }),
  });

})(window);
