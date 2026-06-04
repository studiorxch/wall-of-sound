// ── MapStyleAuthority v1.0.2 ──────────────────────────────────────────────────
// 0525A_WOS_MapStyleAuthority_v1.0.2 (supersedes v1.0.1)
// Status: active
// Classification: bounded-presentation-governance-authority
//
// Registry-driven presentation governance authority for WOS world rendering.
//
// Authority boundaries (constitutional):
//   MapStyleAuthority OWNS: MapStyleManifest generation, global color palette,
//     land/water/road/label/atmosphere/overlay style registries, maritime
//     symbolic vessel style registries, far-light presentation tuning,
//     presentation-layer motion easing, wake visual presentation, live
//     override governance (single-writer, ephemeral).
//
//   MapStyleAuthority MAY OBSERVE: AIS vessel snapshots, AtmosphericReadability
//     outputs, PopulationHierarchy tier outputs, ContinuityDensity clutter
//     pressure, WakeAuthority renderable wake descriptors, SurfaceRuntime
//     selected preset, developer-only live override state.
//
//   MapStyleAuthority MAY NOT MUTATE: AIS truth, runtime continuity, dead
//     reckoning, continuity cadence, world coordinates, wake persistence,
//     entity lifecycle state, telemetry history, visibilityClass assignment.
//
// Core doctrine:
//   2D owns truth.
//   2.5D owns presentation.
//   Presentation systems interpret the world.
//   They do NOT create runtime truth.
//
// Override governance:
//   Only one active live override may exist at a time.
//   Overrides are ephemeral unless serialized by SurfaceRuntime tooling.
//   Renderer-local overrides are forbidden.
//
// Manifest contract:
//   MapStyleManifest is immutable for a render frame.
//   It is not runtime truth.
//   It is not persisted by this authority.
//
// Projection integrity:
//   Presentation systems may not fabricate false depth relationships.
//   Tilt, pitch, pseudo-depth, and 2.5D treatments must remain compatible
//   with 2D truth.
//
// Placement: wall/systems/presentation/mapStyleAuthority.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  // ── Version ──────────────────────────────────────────────────────────────────
  var VERSION = '1.0.2';

  // ── System Constants ─────────────────────────────────────────────────────────
  // These are implementation baselines — tunable presentation infrastructure.
  // They are NOT eternal doctrine.

  var MAX_SINGLE_OVERRIDE_COUNT     = 1;     // only one live override authority
  var DEFAULT_VISUAL_EASING_MS      = 450;
  var DEFAULT_FAR_LIGHT_ALPHA       = 0.5;
  var DEFAULT_FOG_ALPHA             = 0.15;
  var DEFAULT_HARBOR_DARKNESS       = 0.9;
  var DEFAULT_TWINKLE_STRENGTH      = 0.4;
  var DEFAULT_WAKE_ALPHA_MULTIPLIER = 0.5;

  // ── Base Registry Compiler ───────────────────────────────────────────────────

  function _compileBaseRegistry() {
    return Object.freeze({
      water: Object.freeze({
        baseColor:            '#080a0f',
        shimmerStrength:      0.15,
        reflectionOpacity:    0.20,
        currentBandAlpha:     0.10,
        coastlineContrast:    1.10,
        harborDarkness:       DEFAULT_HARBOR_DARKNESS,
      }),

      land: Object.freeze({
        landColorHex:                  '#11141a',
        districtContrast:              0.35,
        coastlineVisibility:           0.60,
        infrastructureShadowStrength:  0.40,
        nighttimeDarkness:             0.85,
      }),

      roads: Object.freeze({
        arterialOpacity:  0.30,
        localRoadOpacity: 0.10,
        glowStrength:     0.20,
        labelSuppression: 0.60,
        nighttimeFade:    0.75,
      }),

      labels: Object.freeze({
        density:              0.40,
        opacity:              0.70,
        districtPriority:     3,
        infrastructurePriority: 1,
        suppressionStrength:  0.50,
      }),

      atmosphere: Object.freeze({
        fogAlpha:            DEFAULT_FOG_ALPHA,
        hazeStrength:        0.25,
        grainOpacity:        0.04,
        glowRadius:          10.0,
        bloomSoftness:       0.35,
        visibilityFalloffKm: 12.0,
      }),

      overlays: Object.freeze({
        hudOpacity:        0.80,
        scannerStrength:   0.50,
        typographyGlow:    0.60,
        telemetrySoftness: 0.30,
        noiseSuppression:  0.50,
      }),
    });
  }

  // ── Maritime Vessel Style Compiler ───────────────────────────────────────────

  function _createDefaultVesselStyle() {
    return Object.freeze({
      symbolic: Object.freeze({
        hullColorHex:             '#3fb950',
        deckColorHex:             '#0d1117',
        accentColorHex:           '#58a6ff',
        strokeWidthPx:            1.5,
        compactScaleMultiplier:   0.75,
        detailedScaleMultiplier:  1.0,
      }),

      lighting: Object.freeze({
        farLightAlpha:    DEFAULT_FAR_LIGHT_ALPHA,
        farLightHaloPx:   12,
        twinkleStrength:  DEFAULT_TWINKLE_STRENGTH,
      }),

      wakePresentation: Object.freeze({
        visualAlphaMultiplier: DEFAULT_WAKE_ALPHA_MULTIPLIER,
        edgeSoftnessScalar:    0.30,
      }),

      motionPresentation: Object.freeze({
        headingVisualSmoothing: 0.80,
        interpolationCurve:     'CUBIC_GLIDE',
        visualEasingMs:         DEFAULT_VISUAL_EASING_MS,
      }),
    });
  }

  function _vesselStyle(symbolicOverrides) {
    var base = _createDefaultVesselStyle();
    return Object.freeze({
      symbolic: Object.freeze(
        Object.assign({}, base.symbolic, symbolicOverrides || {})
      ),
      lighting:          base.lighting,
      wakePresentation:  base.wakePresentation,
      motionPresentation: base.motionPresentation,
    });
  }

  function _compileBaseMaritimeRegistry() {
    var def = _createDefaultVesselStyle();
    return Object.freeze({
      cargo:      _vesselStyle({}),   // default hull — green-grey
      tanker:     _vesselStyle({ hullColorHex: '#f97583', accentColorHex: '#ea4a5a' }),
      ferry:      _vesselStyle({ hullColorHex: '#79b8ff', accentColorHex: '#c8e1ff' }),
      service:    _vesselStyle({ hullColorHex: '#d2a8ff', accentColorHex: '#bc8cff' }),
      recreational: _vesselStyle({ hullColorHex: '#a5d6ff', compactScaleMultiplier: 0.60 }),
      fishing:    _vesselStyle({ hullColorHex: '#f2cc60', accentColorHex: '#d29922' }),
      passenger:  _vesselStyle({ hullColorHex: '#58a6ff', detailedScaleMultiplier: 1.10 }),
      tug:        _vesselStyle({ hullColorHex: '#ffa657', compactScaleMultiplier: 0.70 }),
      military:   _vesselStyle({ hullColorHex: '#8b949e', accentColorHex: '#6e7681' }),
      industrial: _vesselStyle({ hullColorHex: '#db6d28', accentColorHex: '#f0883e' }),
      unknown:    _vesselStyle({ hullColorHex: '#6e7681', accentColorHex: '#8b949e' }),
      'default':  def,
    });
  }

  // ── Override Validation ───────────────────────────────────────────────────────

  var _VALID_LAYER_KEYS = ['water', 'land', 'roads', 'labels', 'atmosphere', 'overlays'];
  var _VALID_PROVENANCE  = ['DEBUG_TOOL', 'SURFACE_RUNTIME', 'TEMPORARY'];

  // ── v1.0.2: StyleOverride schema now requires targetDomain === "MAP".
  // createdAtMs and updatedAtMs are accepted (not required — tooling may omit them).
  // This API is frozen for 0525C LiveStylePanel integration.

  function _validateOverride(override) {
    if (!override || typeof override !== 'object') {
      return 'override must be a non-null object';
    }
    if (typeof override.overrideId !== 'string' || !override.overrideId) {
      return 'override.overrideId must be a non-empty string';
    }
    // v1.0.2: targetDomain is required and must be "MAP"
    if (override.targetDomain !== 'MAP') {
      return 'MapStyleAuthority v1.0.2 accepts MAP overrides only; got: ' +
        JSON.stringify(override.targetDomain);
    }
    if (_VALID_LAYER_KEYS.indexOf(override.targetLayer) === -1) {
      return 'override.targetLayer must be one of: ' + _VALID_LAYER_KEYS.join(', ');
    }
    if (!override.values || typeof override.values !== 'object') {
      return 'override.values must be a non-null object';
    }
    if (_VALID_PROVENANCE.indexOf(override.provenance) === -1) {
      return 'override.provenance must be one of: ' + _VALID_PROVENANCE.join(', ');
    }
    if (override.expiresAtMs !== null && typeof override.expiresAtMs !== 'number') {
      return 'override.expiresAtMs must be null or a number';
    }
    return null; // valid
  }

  // ── MapStyleAuthority Singleton ───────────────────────────────────────────────

  // Internal mutable state — all other functions are pure
  var _activeRegistry     = _compileBaseRegistry();
  var _maritimeRegistry   = _compileBaseMaritimeRegistry();
  var _activeLiveOverride = null;  // StyleOverride | null

  // ── Style Resolution ─────────────────────────────────────────────────────────

  function _applySingleLayerOverride(baseStyle, override) {
    var result = {};
    var keys = Object.keys(baseStyle);
    for (var i = 0; i < keys.length; i++) {
      result[keys[i]] = baseStyle[keys[i]];
    }
    result[override.targetLayer] = Object.freeze(
      Object.assign({}, baseStyle[override.targetLayer], override.values)
    );
    return Object.freeze(result);
  }

  function _isOverrideExpired(override, nowMs) {
    if (override.expiresAtMs === null) return false;
    return nowMs > override.expiresAtMs;
  }

  function _resolveMapStyle(nowMs) {
    if (!_activeLiveOverride) return _activeRegistry;
    if (_isOverrideExpired(_activeLiveOverride, nowMs)) {
      _activeLiveOverride = null;  // self-expire
      return _activeRegistry;
    }
    return _applySingleLayerOverride(_activeRegistry, _activeLiveOverride);
  }

  // ── Visibility Envelope ───────────────────────────────────────────────────────
  // MapStyleAuthority may NEVER elevate a vessel above its assigned visibilityClass.
  // It may only tighten atmosphere further within the ATMOSPHERIC_HIDDEN envelope.

  function _applyVisibilityEnvelope(style, visibilityClass) {
    if (visibilityClass !== 'ATMOSPHERIC_HIDDEN') return style;
    return Object.freeze(Object.assign({}, style, {
      atmosphere: Object.freeze(Object.assign({}, style.atmosphere, {
        fogAlpha: Math.max(style.atmosphere.fogAlpha, 1.0),
      })),
      labels: Object.freeze(Object.assign({}, style.labels, {
        opacity:             0.0,
        suppressionStrength: 1.0,
      })),
    }));
  }

  // ── Manifest ID Generation ────────────────────────────────────────────────────

  function _manifestId(simulationTimeMs) {
    return 'map-style-manifest::' + simulationTimeMs;
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  /**
   * setSingleLiveOverride(override)
   *
   * Register a single ephemeral presentation override.
   * Only one override may be active at a time (single-writer rule).
   * Override is not persisted. Expires if expiresAtMs is set.
   *
   * @param {StyleOverride} override
   * @throws if override is invalid
   */
  function setSingleLiveOverride(override) {
    var err = _validateOverride(override);
    if (err) throw new Error('[MapStyleAuthority] Invalid override: ' + err);
    _activeLiveOverride = Object.freeze(override);
  }

  /**
   * clearLiveOverride()
   *
   * Remove the active live override. Returns to base registry.
   */
  function clearLiveOverride() {
    _activeLiveOverride = null;
  }

  /**
   * generateManifest(simulationTimeMs, visibilityClass, createdAtMs?)
   *
   * Generate an immutable MapStyleManifest for this render frame.
   * The manifest is NOT runtime truth. It is consumed by presentation systems.
   *
   * @param  {number}               simulationTimeMs  — current simulation clock
   * @param  {string|null}          visibilityClass   — from AtmosphericReadability
   * @param  {number}               [createdAtMs]     — wall-clock timestamp (optional)
   * @return {MapStyleManifest}
   */
  function generateManifest(simulationTimeMs, visibilityClass, createdAtMs) {
    var nowMs            = typeof createdAtMs === 'number' ? createdAtMs : Date.now();
    var resolvedMapStyle = _resolveMapStyle(nowMs);
    var constrainedStyle = _applyVisibilityEnvelope(resolvedMapStyle, visibilityClass || null);

    // Maritime style registry: prefer SBE.MaritimeStyleRegistry (0525B) when
    // available — it owns the full VesselStyle schema including hoverCard and
    // densityResponse. Fall back to our own compiled registry for environments
    // where MaritimeStyleRegistry has not yet been loaded.
    var resolvedMaritimeStyle =
      (global.SBE && global.SBE.MaritimeStyleRegistry)
        ? global.SBE.MaritimeStyleRegistry.getRegistry()
        : _maritimeRegistry;

    return Object.freeze({
      manifestId:       _manifestId(simulationTimeMs),
      version:          VERSION,
      simulationTimeMs: simulationTimeMs,
      createdAtMs:      nowMs,
      mapStyle:         constrainedStyle,
      maritimeStyle:    resolvedMaritimeStyle,
      activeOverrides:  Object.freeze(_activeLiveOverride ? [_activeLiveOverride] : []),
      visibilityClass:  visibilityClass || null,
    });
  }

  /**
   * getVesselStyle(vesselClass)
   *
   * Resolve the VesselStyle for a given MaritimeVesselStyleKey.
   * Falls back to 'default' if the class is not registered.
   *
   * @param  {string} vesselClass
   * @return {VesselStyle}
   */
  function getVesselStyle(vesselClass) {
    // Prefer SBE.MaritimeStyleRegistry (0525B) for full VesselStyle schema.
    var MSR = global.SBE && global.SBE.MaritimeStyleRegistry;
    if (MSR) return MSR.resolveVesselStyle(vesselClass).vesselStyle;
    var key = (vesselClass || '').toLowerCase();
    return _maritimeRegistry[key] || _maritimeRegistry['default'];
  }

  /**
   * getMapStyleRegistry()
   *
   * Return the current base registry (without active overrides applied).
   * For diagnostics and tooling only.
   *
   * @return {MapStyleRegistry}
   */
  function getMapStyleRegistry() {
    return _activeRegistry;
  }

  /**
   * getMaritimeStyleRegistry()
   *
   * Return the maritime vessel style registry.
   * For diagnostics and tooling only.
   *
   * @return {MaritimeStyleRegistry}
   */
  function getMaritimeStyleRegistry() {
    return _maritimeRegistry;
  }

  /**
   * getActiveLiveOverride()
   *
   * Return the current active override, or null if none is set.
   *
   * @return {StyleOverride|null}
   */
  function getActiveLiveOverride() {
    return _activeLiveOverride;
  }

  /**
   * resetToBaseRegistry()
   *
   * Recompile and restore the base registries to spec defaults.
   * Clears any active live override.
   * For use during surface transitions and development resets.
   */
  function resetToBaseRegistry() {
    _activeRegistry   = _compileBaseRegistry();
    _maritimeRegistry = _compileBaseMaritimeRegistry();
    _activeLiveOverride = null;
  }

  // ── Export ────────────────────────────────────────────────────────────────────

  SBE.MapStyleAuthority = Object.freeze({
    // Lifecycle
    resetToBaseRegistry:  resetToBaseRegistry,

    // Manifest generation (primary public interface)
    generateManifest:     generateManifest,

    // Override governance
    setSingleLiveOverride: setSingleLiveOverride,
    clearLiveOverride:     clearLiveOverride,
    getActiveLiveOverride: getActiveLiveOverride,

    // Registry accessors (for diagnostics / tooling)
    getVesselStyle:          getVesselStyle,
    getMapStyleRegistry:     getMapStyleRegistry,
    getMaritimeStyleRegistry: getMaritimeStyleRegistry,

    // System constants (read-only access for consumers)
    CONSTANTS: Object.freeze({
      VERSION,
      MAX_SINGLE_OVERRIDE_COUNT,
      DEFAULT_VISUAL_EASING_MS,
      DEFAULT_FAR_LIGHT_ALPHA,
      DEFAULT_FOG_ALPHA,
      DEFAULT_HARBOR_DARKNESS,
      DEFAULT_TWINKLE_STRENGTH,
      DEFAULT_WAKE_ALPHA_MULTIPLIER,
      VALID_LAYER_KEYS: Object.freeze(_VALID_LAYER_KEYS.slice()),
      VALID_PROVENANCE:  Object.freeze(_VALID_PROVENANCE.slice()),
    }),
  });

})(window);
