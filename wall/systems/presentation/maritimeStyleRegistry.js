// ── MaritimeStyleRegistry v1.0.1 ─────────────────────────────────────────────
// 0525B_WOS_MaritimeStyleRegistry_v1.0.1
// Status: active
// Classification: bounded-maritime-symbolic-presentation-registry
//
// Authoritative maritime symbolic style registry for WOS harbor and vessel
// rendering. Defines vessel-class visual differentiation, far-light atmospheric
// behavior, wake visual presentation, motion presentation styling, hover-card
// visual treatment, harbor readability tiers, and maritime density response.
//
// Authority boundaries (constitutional):
//   MaritimeStyleRegistry OWNS: vessel-class style definitions, vessel symbolic
//     color palettes, compact/detailed scale tuning, far-light intensity/halo/
//     twinkle, wake visual alpha, hover-card visual treatment, class-specific
//     readability, density-response styling modifiers, maritime fallback behavior.
//
//   MaritimeStyleRegistry MAY OBSERVE: vessel class taxonomy outputs,
//     PopulationHierarchy tier outputs, AtmosphericReadability visibilityClass,
//     ContinuityDensity clutter pressure, WakeAuthority renderable descriptors,
//     MapStyleAuthority active manifest (palette-contextual only).
//
//   MaritimeStyleRegistry MAY NOT MUTATE: AIS state, vessel position/heading/
//     speed, wake buffers, wake lifetime, visibilityClass, population tier,
//     clutter pressure, camera target selection, hover-card semantic content,
//     overlay hierarchy, narrative ranking, urgency signaling.
//
// Core doctrine:
//   2D owns truth.
//   2.5D owns presentation.
//   Maritime style expresses continuity; it does not create continuity.
//   Far vessels are atmospheric harbor infrastructure.
//   Far lights should be alive but not loud.
//   Density suppression may reduce clutter but may not prioritize narrative
//   significance.
//   Far-light animation may not encode urgency semantics.
//
// Integration path:
//   MaritimeStyleRegistry → MapStyleAuthority → MapStyleManifest → MarineRenderer
//
// Placement: wall/systems/presentation/maritimeStyleRegistry.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  // ── Version ──────────────────────────────────────────────────────────────────
  var VERSION = '1.0.1';

  // ── System Constants ─────────────────────────────────────────────────────────
  // Implementation baselines — tunable presentation values, not eternal doctrine.

  var MARITIME_STYLE_VERSION                    = VERSION;
  var CANONICAL_VESSEL_CLASS_COUNT              = 11;
  var REQUIRED_STYLE_KEY_COUNT                  = 12;   // 11 classes + default
  var DEFAULT_VISUAL_EASING_MS                  = 450;
  var DEFAULT_FAR_LIGHT_ALPHA                   = 0.50;
  var DEFAULT_FAR_LIGHT_HALO_PX                 = 12;
  var DEFAULT_TWINKLE_STRENGTH                  = 0.40;
  var DEFAULT_TWINKLE_RATE_HZ                   = 0.18; // ~1 cycle / 5.5s — intentionally slow
  var DEFAULT_WAKE_ALPHA_MULTIPLIER             = 0.50;
  var DEFAULT_HOVER_HOLD_MS                     = 1400;
  var MAX_HOVER_HOLD_MS                         = 3200;
  var DEFAULT_DENSITY_SUPPRESSION_STRENGTH      = 0.50;
  var DEFAULT_LABEL_VISUAL_SUPPRESSION_STRENGTH = 0.75; // labels suppressed earlier than hull

  // ── CUBIC_GLIDE interpolation ─────────────────────────────────────────────────
  // Cubic ease-in-out: heavy, continuous, gliding. Non-mechanical cadence.
  // Used as the default maritime interpolation curve.
  // Linear may be used for diagnostics only.
  function cubicGlide(t) {
    return t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  // ── Default VesselStyle ───────────────────────────────────────────────────────

  function _makeDefaultVesselStyle() {
    return {
      symbolic: {
        hullColorHex:            '#3fb950',
        deckColorHex:            '#0d1117',
        accentColorHex:          '#58a6ff',
        strokeWidthPx:           1.5,
        compactScaleMultiplier:  0.75,
        detailedScaleMultiplier: 1.0,
        silhouetteWeight:        0.75,
        markerRadiusPx:          2.5,
      },

      lighting: {
        farLightAlpha:        DEFAULT_FAR_LIGHT_ALPHA,
        farLightHaloPx:       DEFAULT_FAR_LIGHT_HALO_PX,
        twinkleStrength:      DEFAULT_TWINKLE_STRENGTH,
        twinkleRateHz:        DEFAULT_TWINKLE_RATE_HZ,
        lowVisibilityDamping: 0.65,
        classTintStrength:    0.45,
      },

      wakePresentation: {
        visualAlphaMultiplier:    DEFAULT_WAKE_ALPHA_MULTIPLIER,
        edgeSoftnessScalar:       0.30,
        classTintStrength:        0.20,
        densitySuppressionStrength: DEFAULT_DENSITY_SUPPRESSION_STRENGTH,
      },

      motionPresentation: {
        headingVisualSmoothing: 0.80,
        interpolationCurve:     'CUBIC_GLIDE',
        visualEasingMs:         DEFAULT_VISUAL_EASING_MS,
      },

      hoverCardPresentation: {
        backgroundAlpha:       0.78,
        borderAlpha:           0.45,
        borderRadiusPx:        10,
        classAccentStrength:   0.70,
        glowStrength:          0.35,
        fadeInMs:              120,
        holdMs:                DEFAULT_HOVER_HOLD_MS,
        fadeOutMs:             420,
        maxWidthPx:            280,
      },

      densityResponse: {
        clutterSuppressionStrength:      DEFAULT_DENSITY_SUPPRESSION_STRENGTH,
        farLightSuppressionStrength:     0.35,
        wakeSuppressionStrength:         0.60,
        labelVisualSuppressionStrength:  DEFAULT_LABEL_VISUAL_SUPPRESSION_STRENGTH,
      },
    };
  }

  // ── Shallow merge helper ─────────────────────────────────────────────────────
  // Produces a new VesselStyle from the default with per-section overrides.
  // Each section is merged shallowly — only the specified keys change.

  function _vessel(symbolicOvr, lightingOvr, wakeOvr, motionOvr, hoverOvr, densityOvr) {
    var def = _makeDefaultVesselStyle();
    return Object.freeze({
      symbolic: Object.freeze(Object.assign({}, def.symbolic, symbolicOvr || {})),
      lighting: Object.freeze(Object.assign({}, def.lighting, lightingOvr || {})),
      wakePresentation: Object.freeze(Object.assign({}, def.wakePresentation, wakeOvr || {})),
      motionPresentation: Object.freeze(Object.assign({}, def.motionPresentation, motionOvr || {})),
      hoverCardPresentation: Object.freeze(Object.assign({}, def.hoverCardPresentation, hoverOvr || {})),
      densityResponse: Object.freeze(Object.assign({}, def.densityResponse, densityOvr || {})),
    });
  }

  // ── Registry Compilation ──────────────────────────────────────────────────────
  // Each vessel class is built via _vessel() to minimize repetition.
  // Sections with no overrides pass undefined → defaults apply.

  function _compileRegistry() {
    return Object.freeze({

      // ── CARGO ─────────────────────────────────────────────────────────────
      // Visual role: harbor mass. Stable, heavy, infrastructural, slow.
      cargo: _vessel(
        /* symbolic  */ {},
        /* lighting  */ {},
        /* wake      */ {},
        /* motion    */ {},
        /* hover     */ {},
        /* density   */ {}
      ),

      // ── TANKER ────────────────────────────────────────────────────────────
      // Visual role: dangerous mass under restraint. Weighty, muted hazard.
      // Styling may express weight and caution; NOT active danger or urgency.
      tanker: _vessel(
        { hullColorHex: '#f97583', accentColorHex: '#ea4a5a',
          compactScaleMultiplier: 0.82, detailedScaleMultiplier: 1.15 },
        { farLightAlpha: 0.44, classTintStrength: 0.38 }
      ),

      // ── FERRY ─────────────────────────────────────────────────────────────
      // Visual role: public harbor pulse. Civic, rhythmic, familiar.
      ferry: _vessel(
        { hullColorHex: '#79b8ff', accentColorHex: '#c8e1ff',
          detailedScaleMultiplier: 1.10 },
        { farLightAlpha: 0.60, twinkleStrength: 0.32 }
      ),

      // ── SERVICE ───────────────────────────────────────────────────────────
      // Visual role: maintenance signal. Utility support, active but subdued.
      service: _vessel(
        { hullColorHex: '#d2a8ff', accentColorHex: '#bc8cff',
          compactScaleMultiplier: 0.70 }
      ),

      // ── RECREATIONAL ──────────────────────────────────────────────────────
      // Visual role: small human presence. Light, fragile, flickering.
      recreational: _vessel(
        { hullColorHex: '#a5d6ff', accentColorHex: '#79c0ff',
          compactScaleMultiplier: 0.58, detailedScaleMultiplier: 0.78,
          markerRadiusPx: 2.0 },
        { farLightAlpha: 0.38, farLightHaloPx: 8, twinkleStrength: 0.55 }
      ),

      // ── FISHING ───────────────────────────────────────────────────────────
      // Visual role: working harbor craft. Local, workmanlike, warm.
      fishing: _vessel(
        { hullColorHex: '#f2cc60', accentColorHex: '#d29922',
          compactScaleMultiplier: 0.68 }
      ),

      // ── PASSENGER ─────────────────────────────────────────────────────────
      // Visual role: human movement corridor. Civic, route-oriented.
      passenger: _vessel(
        { hullColorHex: '#58a6ff', accentColorHex: '#a5d6ff',
          detailedScaleMultiplier: 1.10 },
        /* lighting  */ undefined,
        /* wake      */ undefined,
        /* motion    */ undefined,
        { holdMs: 1700, classAccentStrength: 0.82 }
      ),

      // ── TUG ───────────────────────────────────────────────────────────────
      // Visual role: small force multiplier. Compact, dense, directional.
      tug: _vessel(
        { hullColorHex: '#ffa657', accentColorHex: '#f0883e',
          compactScaleMultiplier: 0.66, silhouetteWeight: 0.90 },
        /* lighting  */ undefined,
        /* wake      */ undefined,
        { headingVisualSmoothing: 0.72, visualEasingMs: 380 }
      ),

      // ── MILITARY ──────────────────────────────────────────────────────────
      // Visual role: quiet authority. Restrained, low-emission, gray.
      // Styling may NOT imply threat, aggression, urgency, or gameplay target.
      military: _vessel(
        { hullColorHex: '#8b949e', accentColorHex: '#6e7681',
          detailedScaleMultiplier: 1.05 },
        { farLightAlpha: 0.30, twinkleStrength: 0.18, classTintStrength: 0.22 },
        /* wake      */ undefined,
        /* motion    */ undefined,
        { backgroundAlpha: 0.84, glowStrength: 0.18 }
      ),

      // ── INDUSTRIAL ────────────────────────────────────────────────────────
      // Visual role: floating machinery. Work-platform-like, mechanical.
      industrial: _vessel(
        { hullColorHex: '#db6d28', accentColorHex: '#f0883e',
          compactScaleMultiplier: 0.78, detailedScaleMultiplier: 1.05 }
      ),

      // ── UNKNOWN ───────────────────────────────────────────────────────────
      // Visual role: classification uncertainty. Neutral, low-priority.
      // Not semantically equivalent to 'default' — this is a recognized class.
      unknown: _vessel(
        { hullColorHex: '#6e7681', accentColorHex: '#8b949e',
          compactScaleMultiplier: 0.62, detailedScaleMultiplier: 0.82 },
        { farLightAlpha: 0.34, twinkleStrength: 0.25, classTintStrength: 0.18 },
        /* wake      */ undefined,
        /* motion    */ undefined,
        { classAccentStrength: 0.30 }
      ),

      // ── DEFAULT ───────────────────────────────────────────────────────────
      // Defensive fallback — for invalid, missing, future, or unmapped class keys.
      // Canonical distinction: unknown = recognized taxonomy; default = defensive.
      'default': _vessel(),
    });
  }

  // ── Internal mutable state ────────────────────────────────────────────────────
  var _registry = _compileRegistry();

  // ── Class normalization ───────────────────────────────────────────────────────

  var _CANONICAL_CLASSES = [
    'cargo','tanker','ferry','service','recreational',
    'fishing','passenger','tug','military','industrial',
    'unknown','default',
  ];

  function normalizeVesselClass(rawClass) {
    if (!rawClass) return 'default';
    var normalized = String(rawClass).trim().toLowerCase();
    if (_registry[normalized] !== undefined) return normalized;
    return 'default';
  }

  // ── Core resolution functions ─────────────────────────────────────────────────

  /**
   * resolveVesselStyle(rawClass)
   *
   * Resolve a ClassStyleResolutionResult for any input class key.
   * Always succeeds — unknown keys fall back to 'default'.
   *
   * @param  {string|null|undefined} rawClass
   * @return {ClassStyleResolutionResult}
   */
  function resolveVesselStyle(rawClass) {
    var resolvedClass = normalizeVesselClass(rawClass);
    var usedFallback  = (resolvedClass === 'default') && (rawClass !== 'default');
    return Object.freeze({
      requestedClass: rawClass != null ? rawClass : null,
      resolvedClass:  resolvedClass,
      usedFallback:   usedFallback,
      vesselStyle:    _registry[resolvedClass],
    });
  }

  /**
   * applyVisibilityClassToStyle(vesselStyle, visibilityClass)
   *
   * Return a new VesselStyle constrained to the given visibilityClass.
   * MaritimeStyleRegistry consumes visibilityClass; it does NOT assign it.
   * May only suppress or reduce — never elevate.
   *
   * @param  {VesselStyle}    vesselStyle
   * @param  {string}         visibilityClass
   * @return {VesselStyle}
   */
  function applyVisibilityClassToStyle(vesselStyle, visibilityClass) {
    switch (visibilityClass) {
      case 'FULL':
        return vesselStyle;

      case 'REDUCED':
        // Soften silhouette + marker; suppress wake.
        return Object.freeze(Object.assign({}, vesselStyle, {
          symbolic: Object.freeze(Object.assign({}, vesselStyle.symbolic, {
            strokeWidthPx:  vesselStyle.symbolic.strokeWidthPx  * 0.85,
            markerRadiusPx: vesselStyle.symbolic.markerRadiusPx * 0.85,
          })),
          wakePresentation: Object.freeze(Object.assign({}, vesselStyle.wakePresentation, {
            visualAlphaMultiplier: vesselStyle.wakePresentation.visualAlphaMultiplier * 0.65,
          })),
        }));

      case 'SILHOUETTE':
        // Dim far-light; suppress wake entirely.
        return Object.freeze(Object.assign({}, vesselStyle, {
          lighting: Object.freeze(Object.assign({}, vesselStyle.lighting, {
            farLightAlpha: vesselStyle.lighting.farLightAlpha * 0.75,
          })),
          wakePresentation: Object.freeze(Object.assign({}, vesselStyle.wakePresentation, {
            visualAlphaMultiplier: 0.0,
          })),
        }));

      case 'MARKER_ONLY':
        // Kill detailed hull; kill wake. Compact marker only.
        return Object.freeze(Object.assign({}, vesselStyle, {
          symbolic: Object.freeze(Object.assign({}, vesselStyle.symbolic, {
            detailedScaleMultiplier: 0.0,
          })),
          wakePresentation: Object.freeze(Object.assign({}, vesselStyle.wakePresentation, {
            visualAlphaMultiplier: 0.0,
          })),
        }));

      case 'LIGHT_ONLY':
        // Kill hull entirely; far-light point only.
        return Object.freeze(Object.assign({}, vesselStyle, {
          symbolic: Object.freeze(Object.assign({}, vesselStyle.symbolic, {
            compactScaleMultiplier:  0.0,
            detailedScaleMultiplier: 0.0,
          })),
          wakePresentation: Object.freeze(Object.assign({}, vesselStyle.wakePresentation, {
            visualAlphaMultiplier: 0.0,
          })),
        }));

      case 'ATMOSPHERIC_HIDDEN':
        // Full suppression — nothing rendered.
        return Object.freeze(Object.assign({}, vesselStyle, {
          symbolic: Object.freeze(Object.assign({}, vesselStyle.symbolic, {
            compactScaleMultiplier:  0.0,
            detailedScaleMultiplier: 0.0,
            markerRadiusPx:          0.0,
          })),
          lighting: Object.freeze(Object.assign({}, vesselStyle.lighting, {
            farLightAlpha:   0.0,
            farLightHaloPx:  0.0,
            twinkleStrength: 0.0,
          })),
          wakePresentation: Object.freeze(Object.assign({}, vesselStyle.wakePresentation, {
            visualAlphaMultiplier: 0.0,
          })),
        }));

      default:
        return vesselStyle;
    }
  }

  /**
   * applyDensityPressureToStyle(vesselStyle, clutterPressure)
   *
   * Return a new VesselStyle with visual load suppressed proportionally to
   * clutter pressure. Suppression is visual-only; it may NOT prioritize
   * narrative significance.
   *
   * @param  {VesselStyle} vesselStyle
   * @param  {number}      clutterPressure  — clamped to [0, 1]
   * @return {VesselStyle}
   */
  function applyDensityPressureToStyle(vesselStyle, clutterPressure) {
    var p = Math.max(0, Math.min(1, clutterPressure || 0));
    if (p === 0) return vesselStyle;  // fast path

    var dr = vesselStyle.densityResponse;
    return Object.freeze(Object.assign({}, vesselStyle, {
      lighting: Object.freeze(Object.assign({}, vesselStyle.lighting, {
        farLightAlpha: vesselStyle.lighting.farLightAlpha *
          (1 - p * dr.farLightSuppressionStrength),
      })),
      wakePresentation: Object.freeze(Object.assign({}, vesselStyle.wakePresentation, {
        visualAlphaMultiplier: vesselStyle.wakePresentation.visualAlphaMultiplier *
          (1 - p * dr.wakeSuppressionStrength),
      })),
      hoverCardPresentation: Object.freeze(Object.assign({}, vesselStyle.hoverCardPresentation, {
        glowStrength: vesselStyle.hoverCardPresentation.glowStrength *
          (1 - p * dr.clutterSuppressionStrength),
      })),
    }));
  }

  // ── Registry validation ───────────────────────────────────────────────────────

  var _REQUIRED_SYMBOLIC_FIELDS  = ['hullColorHex','deckColorHex','accentColorHex',
                                     'strokeWidthPx','compactScaleMultiplier',
                                     'detailedScaleMultiplier','silhouetteWeight',
                                     'markerRadiusPx'];
  var _REQUIRED_LIGHTING_FIELDS  = ['farLightAlpha','farLightHaloPx','twinkleStrength',
                                     'twinkleRateHz','lowVisibilityDamping','classTintStrength'];
  var _REQUIRED_WAKE_FIELDS      = ['visualAlphaMultiplier','edgeSoftnessScalar',
                                     'classTintStrength','densitySuppressionStrength'];
  var _REQUIRED_MOTION_FIELDS    = ['headingVisualSmoothing','interpolationCurve','visualEasingMs'];
  var _REQUIRED_HOVER_FIELDS     = ['backgroundAlpha','borderAlpha','borderRadiusPx',
                                     'classAccentStrength','glowStrength',
                                     'fadeInMs','holdMs','fadeOutMs','maxWidthPx'];
  var _REQUIRED_DENSITY_FIELDS   = ['clutterSuppressionStrength','farLightSuppressionStrength',
                                     'wakeSuppressionStrength','labelVisualSuppressionStrength'];

  function _checkFields(obj, fields, prefix, errors) {
    for (var i = 0; i < fields.length; i++) {
      if (obj[fields[i]] === undefined) {
        errors.push(prefix + '.' + fields[i] + ' is missing');
      }
    }
  }

  /**
   * validateRegistry()
   *
   * Verify structural integrity of the compiled registry.
   * Returns { pass, errors, classCount }.
   *
   * @return {{ pass: boolean, errors: string[], classCount: number }}
   */
  function validateRegistry() {
    var errors = [];
    var classes = Object.keys(_registry);

    if (classes.length < REQUIRED_STYLE_KEY_COUNT) {
      errors.push('registry has ' + classes.length + ' keys; expected ' +
        REQUIRED_STYLE_KEY_COUNT);
    }

    var canonical = _CANONICAL_CLASSES;
    for (var i = 0; i < canonical.length; i++) {
      if (!_registry[canonical[i]]) {
        errors.push('missing vessel class: ' + canonical[i]);
      }
    }

    for (var j = 0; j < classes.length; j++) {
      var cls = classes[j];
      var v   = _registry[cls];
      if (!v) { errors.push(cls + ': null/undefined'); continue; }

      _checkFields(v.symbolic,            _REQUIRED_SYMBOLIC_FIELDS,  cls + '.symbolic',     errors);
      _checkFields(v.lighting,            _REQUIRED_LIGHTING_FIELDS,  cls + '.lighting',     errors);
      _checkFields(v.wakePresentation,    _REQUIRED_WAKE_FIELDS,      cls + '.wake',         errors);
      _checkFields(v.motionPresentation,  _REQUIRED_MOTION_FIELDS,    cls + '.motion',       errors);
      _checkFields(v.hoverCardPresentation, _REQUIRED_HOVER_FIELDS,   cls + '.hoverCard',    errors);
      _checkFields(v.densityResponse,     _REQUIRED_DENSITY_FIELDS,   cls + '.density',      errors);

      // Governance checks
      if (v.hoverCardPresentation && v.hoverCardPresentation.holdMs > MAX_HOVER_HOLD_MS) {
        errors.push(cls + '.hoverCard.holdMs exceeds MAX_HOVER_HOLD_MS (' +
          MAX_HOVER_HOLD_MS + ')');
      }
      if (v.lighting && v.lighting.twinkleRateHz > 1.0) {
        errors.push(cls + '.lighting.twinkleRateHz > 1.0 Hz — risks urgency coding');
      }
    }

    var pass = errors.length === 0;
    return { pass: pass, errors: errors, classCount: classes.length };
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  /**
   * getRegistry()
   *
   * Return the compiled, frozen MaritimeStyleRegistry.
   * For use by MapStyleAuthority when building MapStyleManifest.
   *
   * @return {MaritimeStyleRegistry}
   */
  function getRegistry() {
    return _registry;
  }

  /**
   * reset()
   *
   * Recompile the registry from spec defaults.
   * For use during surface transitions or development resets.
   */
  function reset() {
    _registry = _compileRegistry();
  }

  // ── Export ────────────────────────────────────────────────────────────────────

  SBE.MaritimeStyleRegistry = Object.freeze({
    // Core resolution (primary public interface)
    resolveVesselStyle:           resolveVesselStyle,
    normalizeVesselClass:         normalizeVesselClass,
    applyVisibilityClassToStyle:  applyVisibilityClassToStyle,
    applyDensityPressureToStyle:  applyDensityPressureToStyle,

    // Registry access (for MapStyleAuthority / diagnostics)
    getRegistry:       getRegistry,
    validateRegistry:  validateRegistry,
    reset:             reset,

    // Interpolation utility
    cubicGlide: cubicGlide,

    // System constants
    CONSTANTS: Object.freeze({
      VERSION:                              VERSION,
      MARITIME_STYLE_VERSION:               MARITIME_STYLE_VERSION,
      CANONICAL_VESSEL_CLASS_COUNT:         CANONICAL_VESSEL_CLASS_COUNT,
      REQUIRED_STYLE_KEY_COUNT:             REQUIRED_STYLE_KEY_COUNT,
      DEFAULT_VISUAL_EASING_MS:             DEFAULT_VISUAL_EASING_MS,
      DEFAULT_FAR_LIGHT_ALPHA:              DEFAULT_FAR_LIGHT_ALPHA,
      DEFAULT_FAR_LIGHT_HALO_PX:            DEFAULT_FAR_LIGHT_HALO_PX,
      DEFAULT_TWINKLE_STRENGTH:             DEFAULT_TWINKLE_STRENGTH,
      DEFAULT_TWINKLE_RATE_HZ:              DEFAULT_TWINKLE_RATE_HZ,
      DEFAULT_WAKE_ALPHA_MULTIPLIER:        DEFAULT_WAKE_ALPHA_MULTIPLIER,
      DEFAULT_HOVER_HOLD_MS:                DEFAULT_HOVER_HOLD_MS,
      MAX_HOVER_HOLD_MS:                    MAX_HOVER_HOLD_MS,
      DEFAULT_DENSITY_SUPPRESSION_STRENGTH: DEFAULT_DENSITY_SUPPRESSION_STRENGTH,
      DEFAULT_LABEL_VISUAL_SUPPRESSION_STRENGTH: DEFAULT_LABEL_VISUAL_SUPPRESSION_STRENGTH,
      CANONICAL_CLASSES:                    Object.freeze(_CANONICAL_CLASSES.slice()),
    }),
  });

})(window);
