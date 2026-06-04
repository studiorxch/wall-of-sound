// ── LiveStylePanel v1.0.1 ─────────────────────────────────────────────────────
// 0525C_WOS_LiveStylePanel_v1.0.1
// Status: active
// Classification: developer-facing-presentation-tuning-support-system
//
// Developer-only live presentation override panel for WOS style registries.
// Provides controlled live adjustment for map and maritime style values without
// mutating runtime truth.
//
// Authority boundaries (constitutional):
//   LiveStylePanel OWNS: developer-facing presentation controls, slider/input
//     binding for style override values, override draft staging, validation
//     before applying style overrides, active override visibility, reset/clear
//     controls, export handoff to future preset serialization.
//
//   LiveStylePanel MAY OBSERVE: MapStyleAuthority active manifest and live
//     override, MaritimeStyleRegistry class styles, valid override provenance
//     values, current Surface preset identity.
//
//   LiveStylePanel MAY NOT MUTATE: AIS runtime, MaritimeContinuityEngine,
//     AtmosphericReadability, WakeAuthority, PopulationHierarchy,
//     ContinuityDensity, ObservabilityCamera, OverlayGrammar semantic schema,
//     MarineRenderer internals, scheduler state, Surface orchestration state.
//
// Write path (only approved path):
//   LiveStylePanel
//   → StyleOverrideDraft
//   → validateStyleOverrideDraft()
//   → convertDraftToStyleOverride()
//   → MapStyleAuthority.setSingleLiveOverride()
//   → MapStyleManifest
//   → MarineRenderer
//
// Forbidden paths:
//   LiveStylePanel → direct MarineRenderer mutation
//   LiveStylePanel → runtime state mutation
//
// Override governance:
//   Only one active override may exist at a time (0525A single-writer rule).
//   Maritime editing: staged and validated but not directly applied as MAP
//   StyleOverrides in v1.0.1. Requires future adapter or preset serialization.
//
// Determinism note:
//   Date.now() is permitted for draft IDs and timestamps only.
//   These are ephemeral tooling records, not runtime truth.
//   Production presets require separate serialization governance (0525G).
//
// Placement: wall/ui/liveStylePanel.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  // ── Version ───────────────────────────────────────────────────────────────────
  var VERSION = '1.0.1';

  // ── System Constants ──────────────────────────────────────────────────────────
  var LIVE_STYLE_PANEL_VERSION         = VERSION;
  var MAX_ACTIVE_OVERRIDE_COUNT        = 1;
  var DEFAULT_OVERRIDE_PROVENANCE      = 'DEBUG_TOOL';
  var DEFAULT_DRAFT_EXPIRATION_MS      = null;   // drafts do not auto-expire in v1.0.1
  var FIELD_CHANGE_DEBOUNCE_MS         = 120;
  var SLIDER_PREVIEW_THROTTLE_MS       = 80;
  var MAX_NUMERIC_FIELD_VALUE          = 9999;
  var MIN_ALPHA_VALUE                  = 0.0;
  var MAX_ALPHA_VALUE                  = 1.0;
  var MAX_TWINKLE_RATE_HZ              = 1.0;    // > 1.0 Hz risks urgency semantics
  var MAX_HOVER_HOLD_MS                = 3200;   // prevents UI panel-like persistence

  // ── Panel Mode ────────────────────────────────────────────────────────────────
  var MODE_INACTIVE               = 'INACTIVE';
  var MODE_DRAFT                  = 'DRAFT';
  var MODE_LIVE_OVERRIDE          = 'LIVE_OVERRIDE';
  var MODE_INVALID                = 'INVALID';
  var MODE_SERIALIZATION_CANDIDATE = 'SERIALIZATION_CANDIDATE';

  // ── Allowed Field Maps ────────────────────────────────────────────────────────
  // Only explicitly listed fields may be submitted through LiveStylePanel.
  // Unlisted fields are blocked with authorityViolation: true.
  //
  // atmosphere.visibilityFalloffKm is intentionally excluded:
  //   it risks semantic overlap with AtmosphericReadability distance authority.

  var MAP_LAYER_ALLOWED_FIELDS = Object.freeze({
    water: Object.freeze(['baseColor', 'shimmerStrength', 'reflectionOpacity',
                          'currentBandAlpha', 'coastlineContrast', 'harborDarkness']),
    land:  Object.freeze(['landColorHex', 'districtContrast', 'coastlineVisibility',
                          'infrastructureShadowStrength', 'nighttimeDarkness']),
    roads: Object.freeze(['arterialOpacity', 'localRoadOpacity', 'glowStrength',
                          'labelSuppression', 'nighttimeFade']),
    labels: Object.freeze(['density', 'opacity', 'suppressionStrength']),
    atmosphere: Object.freeze(['fogAlpha', 'hazeStrength', 'grainOpacity',
                               'glowRadius', 'bloomSoftness']),
                               // visibilityFalloffKm: excluded — AtmosphericReadability boundary
    overlays: Object.freeze(['hudOpacity', 'scannerStrength', 'typographyGlow',
                             'telemetrySoftness', 'noiseSuppression']),
  });

  var MARITIME_SECTION_ALLOWED_FIELDS = Object.freeze({
    symbolic: Object.freeze(['hullColorHex', 'deckColorHex', 'accentColorHex',
                             'strokeWidthPx', 'compactScaleMultiplier',
                             'detailedScaleMultiplier', 'silhouetteWeight',
                             'markerRadiusPx']),
    lighting: Object.freeze(['farLightAlpha', 'farLightHaloPx', 'twinkleStrength',
                             'twinkleRateHz', 'lowVisibilityDamping', 'classTintStrength']),
    wakePresentation: Object.freeze(['visualAlphaMultiplier', 'edgeSoftnessScalar',
                                     'classTintStrength', 'densitySuppressionStrength']),
    motionPresentation: Object.freeze(['headingVisualSmoothing', 'visualEasingMs']),
    // interpolationCurve excluded: enum type requires adapter, not a simple slider
    hoverCardPresentation: Object.freeze(['backgroundAlpha', 'borderAlpha',
                                          'borderRadiusPx', 'classAccentStrength',
                                          'glowStrength', 'fadeInMs', 'holdMs',
                                          'fadeOutMs', 'maxWidthPx']),
    densityResponse: Object.freeze([
      'clutterSuppressionStrength', 'farLightSuppressionStrength',
      'wakeSuppressionStrength',
      // labelVisualSuppressionStrength: marked pendingImplementation until
      // renderer path confirmed to consume it
    ]),
  });

  // Fields pending renderer implementation — exposed for validation but flagged
  var _PENDING_IMPLEMENTATION_FIELDS = Object.freeze(['labelVisualSuppressionStrength']);

  var _VALID_MAP_LAYER_KEYS = Object.keys(MAP_LAYER_ALLOWED_FIELDS);
  var _VALID_MARITIME_SECTION_KEYS = Object.keys(MARITIME_SECTION_ALLOWED_FIELDS);
  var _VALID_PROVENANCE = ['DEBUG_TOOL', 'SURFACE_RUNTIME', 'TEMPORARY'];

  // ── Internal Panel State ──────────────────────────────────────────────────────

  var _panelOpen    = false;
  var _activeDraft  = null;   // StyleOverrideDraft | null
  var _mode         = MODE_INACTIVE;
  var _lastValidation = { pass: true, errors: [] };

  // ── Mode Computation ──────────────────────────────────────────────────────────

  function _computeMode() {
    var MSA       = global.SBE && SBE.MapStyleAuthority;
    var hasActive = !!(MSA && MSA.getActiveLiveOverride());

    if (!_activeDraft && !hasActive) return MODE_INACTIVE;
    if (hasActive)                   return MODE_LIVE_OVERRIDE;
    if (!_activeDraft)               return MODE_INACTIVE;

    var validation = validateStyleOverrideDraft(_activeDraft);
    if (!validation.pass)            return MODE_INVALID;
    return MODE_DRAFT;
  }

  function _syncMode() {
    _mode = _computeMode();
  }

  // ── Draft Lifecycle ───────────────────────────────────────────────────────────

  /**
   * createStyleOverrideDraft(targetDomain, targetLayerOrClass, maritimeSectionKey?)
   *
   * Create a new StyleOverrideDraft. Replaces any existing draft.
   * Date.now() is used for draft IDs — this is intentional tooling exception.
   *
   * @param  {'MAP'|'MARITIME'}  targetDomain
   * @param  {string}            targetLayerOrClass  — layer key (MAP) or vessel class (MARITIME)
   * @param  {string}            [maritimeSectionKey]
   * @return {StyleOverrideDraft}
   */
  function createStyleOverrideDraft(targetDomain, targetLayerOrClass, maritimeSectionKey) {
    var nowMs = Date.now();
    _activeDraft = Object.freeze({
      draftId:           'style-draft::' + nowMs,
      targetDomain:      targetDomain,
      targetLayer:       targetDomain === 'MAP' ? targetLayerOrClass : undefined,
      maritimeClassKey:  targetDomain === 'MARITIME' ? targetLayerOrClass : undefined,
      maritimeSectionKey: targetDomain === 'MARITIME' ? maritimeSectionKey : undefined,
      values:            {},          // mutable copy managed separately
      createdAtMs:       nowMs,
      updatedAtMs:       nowMs,
    });
    // values is the only mutable part — keep as plain object
    _activeDraft = Object.assign({}, _activeDraft, { values: {} });
    _syncMode();
    return _activeDraft;
  }

  function _requireDraft(fnName) {
    if (!_activeDraft) {
      throw new Error('[LiveStylePanel] ' + fnName + ': no active draft. Call createStyleOverrideDraft() first.');
    }
  }

  // ── Field Resolution ──────────────────────────────────────────────────────────

  /**
   * getAllowedFieldsForTarget(targetDomain, targetLayer?, maritimeSectionKey?)
   *
   * Return the explicit allowlist for a given target.
   * Empty array = no fields allowed (target unknown/unsupported).
   *
   * @return {string[]}
   */
  function getAllowedFieldsForTarget(targetDomain, targetLayer, maritimeSectionKey) {
    if (targetDomain === 'MAP') {
      if (!targetLayer) return [];
      return MAP_LAYER_ALLOWED_FIELDS[targetLayer] || [];
    }
    if (targetDomain === 'MARITIME') {
      if (!maritimeSectionKey) return [];
      return MARITIME_SECTION_ALLOWED_FIELDS[maritimeSectionKey] || [];
    }
    return [];
  }

  /**
   * isAllowedStyleField(draft, fieldKey)
   *
   * Return true if fieldKey is in the explicit allowlist for this draft's target.
   *
   * @param  {StyleOverrideDraft} draft
   * @param  {string}             fieldKey
   * @return {boolean}
   */
  function isAllowedStyleField(draft, fieldKey) {
    var allowed = getAllowedFieldsForTarget(
      draft.targetDomain,
      draft.targetLayer,
      draft.maritimeSectionKey
    );
    return allowed.indexOf(fieldKey) !== -1;
  }

  // ── Validation ────────────────────────────────────────────────────────────────

  /**
   * validateStyleOverrideDraft(draft)
   *
   * Validate all fields in a draft against the allowlist and governance rules.
   * Blocked fields produce authorityViolation: true.
   * Range violations produce authorityViolation: false.
   *
   * @param  {StyleOverrideDraft} draft
   * @return {StylePanelValidationResult}
   */
  function validateStyleOverrideDraft(draft) {
    var errors = [];
    var fieldKeys = Object.keys(draft.values || {});

    for (var i = 0; i < fieldKeys.length; i++) {
      var fieldKey = fieldKeys[i];
      var value    = draft.values[fieldKey];

      // Allowlist gate — any field not explicitly listed is blocked
      if (!isAllowedStyleField(draft, fieldKey)) {
        errors.push({
          fieldKey: fieldKey,
          message:  'Field is not owned by LiveStylePanel presentation authority.',
          authorityViolation: true,
        });
        continue;
      }

      // Pending implementation flag — allowed but not yet wired to renderer
      if (_PENDING_IMPLEMENTATION_FIELDS.indexOf(fieldKey) !== -1) {
        errors.push({
          fieldKey: fieldKey,
          message:  'Field is pending renderer implementation.',
          authorityViolation: false,
        });
        continue;
      }

      var num = Number(value);

      // Governance: twinkle rate cap — > 1.0 Hz encodes urgency semantics
      if (fieldKey === 'twinkleRateHz' && num > MAX_TWINKLE_RATE_HZ) {
        errors.push({
          fieldKey: fieldKey,
          message:  'twinkleRateHz may not exceed 1.0 Hz — higher rates risk urgency semantics.',
          authorityViolation: true,
        });
      }

      // Governance: hover hold cap — prevents panel-like persistence
      if (fieldKey === 'holdMs' && num > MAX_HOVER_HOLD_MS) {
        errors.push({
          fieldKey: fieldKey,
          message:  'hover hold may not exceed ' + MAX_HOVER_HOLD_MS + 'ms.',
          authorityViolation: true,
        });
      }

      // Range: alpha/opacity/strength/damping fields → [0.0, 1.0]
      if (fieldKey.endsWith('Alpha')   || fieldKey.endsWith('Opacity')  ||
          fieldKey.endsWith('Strength') || fieldKey.endsWith('Damping')) {
        if (!isNaN(num) && (num < MIN_ALPHA_VALUE || num > MAX_ALPHA_VALUE)) {
          errors.push({
            fieldKey: fieldKey,
            message:  fieldKey + ' must be between 0.0 and 1.0 (got ' + num + ').',
            authorityViolation: false,
          });
        }
      }

      // Color fields — basic hex validation
      if ((fieldKey.endsWith('ColorHex') || fieldKey.endsWith('Color')) &&
          typeof value === 'string') {
        if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value)) {
          errors.push({
            fieldKey: fieldKey,
            message:  fieldKey + ' must be a valid hex color string.',
            authorityViolation: false,
          });
        }
      }

      // Timing fields — non-negative finite number
      if (fieldKey.endsWith('Ms') && typeof value === 'number') {
        if (!isFinite(value) || value < 0) {
          errors.push({
            fieldKey: fieldKey,
            message:  fieldKey + ' must be a non-negative finite number.',
            authorityViolation: false,
          });
        }
      }

      // Pixel fields — non-negative
      if (fieldKey.endsWith('Px') && typeof value === 'number') {
        if (!isFinite(value) || value < 0) {
          errors.push({
            fieldKey: fieldKey,
            message:  fieldKey + ' must be a non-negative finite number.',
            authorityViolation: false,
          });
        }
      }
    }

    var result = { pass: errors.length === 0, errors: Object.freeze(errors) };
    _lastValidation = result;
    return result;
  }

  // ── Draft → StyleOverride Conversion ─────────────────────────────────────────

  /**
   * convertDraftToStyleOverride(draft)
   *
   * Convert a validated MAP draft to a StyleOverride for MapStyleAuthority.
   * Maritime drafts cannot be directly converted — requires adapter or preset path.
   *
   * @param  {StyleOverrideDraft} draft
   * @return {StyleOverride}
   * @throws if draft is not MAP domain or has no targetLayer
   */
  function convertDraftToStyleOverride(draft) {
    if (draft.targetDomain !== 'MAP') {
      throw new Error(
        '[LiveStylePanel] convertDraftToStyleOverride: v1.0.1 may only apply MAP ' +
        'StyleOverride records directly to MapStyleAuthority. Maritime section edits ' +
        'require adapter support or future preset serialization (0525G).'
      );
    }
    if (!draft.targetLayer) {
      throw new Error('[LiveStylePanel] convertDraftToStyleOverride: MAP draft requires targetLayer.');
    }

    var nowMs = Date.now();
    return Object.freeze({
      overrideId:    'override::' + draft.draftId,
      targetDomain:  'MAP',
      targetLayer:   draft.targetLayer,
      values:        Object.freeze(Object.assign({}, draft.values)),
      createdAtMs:   draft.createdAtMs,
      updatedAtMs:   nowMs,
      expiresAtMs:   DEFAULT_DRAFT_EXPIRATION_MS,
      provenance:    DEFAULT_OVERRIDE_PROVENANCE,
    });
  }

  // ── Apply / Clear ─────────────────────────────────────────────────────────────

  /**
   * applyDraftAsLiveOverride()
   *
   * Validate and apply the active draft as a live MAP override.
   * Returns validation result — check .pass before proceeding.
   *
   * @return {StylePanelValidationResult}
   */
  function applyDraftAsLiveOverride() {
    _requireDraft('applyDraftAsLiveOverride');
    var validation = validateStyleOverrideDraft(_activeDraft);
    if (!validation.pass) {
      _mode = MODE_INVALID;
      return validation;
    }

    var override = convertDraftToStyleOverride(_activeDraft);
    var MSA = global.SBE && SBE.MapStyleAuthority;
    if (!MSA) throw new Error('[LiveStylePanel] SBE.MapStyleAuthority not available.');
    MSA.setSingleLiveOverride(override);
    _mode = MODE_LIVE_OVERRIDE;
    return validation;
  }

  /**
   * clearLiveStyleOverride()
   *
   * Remove the active live override from MapStyleAuthority.
   * Clears draft and returns panel to INACTIVE.
   */
  function clearLiveStyleOverride() {
    var MSA = global.SBE && SBE.MapStyleAuthority;
    if (MSA) MSA.clearLiveOverride();
    _activeDraft = null;
    _mode = MODE_INACTIVE;
  }

  // ── Field Mutation ────────────────────────────────────────────────────────────

  /**
   * setField(fieldKey, value)
   *
   * Set a field value on the active draft (does not apply; call apply() separately).
   *
   * @param {string}  fieldKey
   * @param {unknown} value
   */
  function setField(fieldKey, value) {
    _requireDraft('setField');
    _activeDraft.values[fieldKey] = value;
    _activeDraft.updatedAtMs = Date.now();
    _syncMode();
  }

  /**
   * removeField(fieldKey)
   *
   * Remove a field from the active draft.
   *
   * @param {string} fieldKey
   */
  function removeField(fieldKey) {
    _requireDraft('removeField');
    delete _activeDraft.values[fieldKey];
    _activeDraft.updatedAtMs = Date.now();
    _syncMode();
  }

  // ── Snapshot ──────────────────────────────────────────────────────────────────

  /**
   * getSnapshot()
   *
   * Return a StylePanelSnapshot of the current panel state.
   * For debug display and tooling observation.
   *
   * @return {StylePanelSnapshot}
   */
  function getSnapshot() {
    _syncMode();
    var MSA         = global.SBE && SBE.MapStyleAuthority;
    var activeOver  = MSA ? MSA.getActiveLiveOverride() : null;
    var manifest    = MSA ? MSA.generateManifest(0, null) : null;

    return Object.freeze({
      mode:             _mode,
      panelOpen:        _panelOpen,
      activeOverrideId: activeOver ? activeOver.overrideId : null,
      targetDomain:     _activeDraft ? _activeDraft.targetDomain : null,
      draft:            _activeDraft ? Object.freeze(Object.assign({}, _activeDraft)) : null,
      validation:       _activeDraft ? validateStyleOverrideDraft(_activeDraft) : { pass: true, errors: [] },
      manifestId:       manifest ? manifest.manifestId : null,
    });
  }

  // ── Panel Open/Close ──────────────────────────────────────────────────────────

  function open() {
    _panelOpen = true;
    _syncMode();
    console.group('[LiveStylePanel] Panel opened — mode: ' + _mode);
    console.log('version:', VERSION);
    _logPanelState();
    console.groupEnd();
  }

  function close() {
    _panelOpen = false;
    console.log('[LiveStylePanel] Panel closed');
  }

  function _logPanelState() {
    var snap = getSnapshot();
    console.log('mode:             ', snap.mode);
    console.log('activeOverrideId: ', snap.activeOverrideId || '—');
    console.log('draft target:     ', snap.targetDomain || '—');
    console.log('draft fields:     ', snap.draft ? Object.keys(snap.draft.values).length : 0);
    console.log('manifestId:       ', snap.manifestId || '—');
    if (!snap.validation.pass) {
      console.warn('validation errors:', snap.validation.errors.length);
      snap.validation.errors.forEach(function(e) {
        console.warn('  ✗', e.fieldKey + ':', e.message,
          e.authorityViolation ? '[AUTHORITY VIOLATION]' : '');
      });
    }
  }

  // ── Export ────────────────────────────────────────────────────────────────────

  SBE.LiveStylePanel = Object.freeze({
    // Draft lifecycle
    createStyleOverrideDraft:   createStyleOverrideDraft,
    setField:                   setField,
    removeField:                removeField,

    // Resolution
    getAllowedFieldsForTarget:   getAllowedFieldsForTarget,
    isAllowedStyleField:        isAllowedStyleField,

    // Validation
    validateStyleOverrideDraft: validateStyleOverrideDraft,

    // Apply / clear
    convertDraftToStyleOverride: convertDraftToStyleOverride,
    applyDraftAsLiveOverride:    applyDraftAsLiveOverride,
    clearLiveStyleOverride:      clearLiveStyleOverride,

    // State
    getSnapshot:  getSnapshot,
    open:         open,
    close:        close,

    // Constants
    CONSTANTS: Object.freeze({
      VERSION:                  VERSION,
      MAX_ACTIVE_OVERRIDE_COUNT: MAX_ACTIVE_OVERRIDE_COUNT,
      DEFAULT_OVERRIDE_PROVENANCE: DEFAULT_OVERRIDE_PROVENANCE,
      FIELD_CHANGE_DEBOUNCE_MS: FIELD_CHANGE_DEBOUNCE_MS,
      SLIDER_PREVIEW_THROTTLE_MS: SLIDER_PREVIEW_THROTTLE_MS,
      MAX_TWINKLE_RATE_HZ:      MAX_TWINKLE_RATE_HZ,
      MAX_HOVER_HOLD_MS:        MAX_HOVER_HOLD_MS,
      VALID_MAP_LAYER_KEYS:     Object.freeze(_VALID_MAP_LAYER_KEYS.slice()),
      VALID_MARITIME_SECTION_KEYS: Object.freeze(_VALID_MARITIME_SECTION_KEYS.slice()),
      MAP_LAYER_ALLOWED_FIELDS: MAP_LAYER_ALLOWED_FIELDS,
      MARITIME_SECTION_ALLOWED_FIELDS: MARITIME_SECTION_ALLOWED_FIELDS,
    }),
  });

  // ── _wos.liveStyle debug API ──────────────────────────────────────────────────
  // Deferred until DOMContentLoaded so _wos is guaranteed to exist.

  function _initDebugAPI() {
    global._wos = global._wos || {};
    var LSP = SBE.LiveStylePanel;

    global._wos.liveStyle = Object.freeze({

      /**
       * _wos.liveStyle.open()
       * Open the panel and display current state.
       */
      open: function() { LSP.open(); },

      /**
       * _wos.liveStyle.close()
       * Close the panel.
       */
      close: function() { LSP.close(); },

      /**
       * _wos.liveStyle.snapshot() → StylePanelSnapshot
       * Return and log current panel state.
       */
      snapshot: function() {
        var snap = LSP.getSnapshot();
        console.log('[LiveStylePanel] snapshot:');
        console.table([{
          mode:            snap.mode,
          panelOpen:       snap.panelOpen,
          activeOverride:  snap.activeOverrideId || '—',
          draftTarget:     snap.targetDomain ? (snap.targetDomain + ':' + (snap.draft && (snap.draft.targetLayer || snap.draft.maritimeClassKey) || '?')) : '—',
          draftFields:     snap.draft ? Object.keys(snap.draft.values).length : 0,
          validationPass:  snap.validation.pass,
          errors:          snap.validation.errors.length,
          manifestId:      snap.manifestId || '—',
        }]);
        return snap;
      },

      /**
       * _wos.liveStyle.createDraft(domain, target, maritimeSectionKey?)
       * Create a new draft and return it.
       *
       * @example _wos.liveStyle.createDraft('MAP', 'atmosphere')
       * @example _wos.liveStyle.createDraft('MARITIME', 'ferry', 'lighting')
       */
      createDraft: function(domain, target, maritimeSectionKey) {
        var draft = LSP.createStyleOverrideDraft(domain, target, maritimeSectionKey);
        console.log('[LiveStylePanel] draft created:', draft.draftId,
          '| target:', domain + ':' + target + (maritimeSectionKey ? '.' + maritimeSectionKey : ''));
        return draft;
      },

      /**
       * _wos.liveStyle.setField(fieldKey, value)
       * Set a field in the active draft.
       *
       * @example _wos.liveStyle.setField('fogAlpha', 0.4)
       */
      setField: function(fieldKey, value) {
        LSP.setField(fieldKey, value);
        // Inline validation feedback
        var snap = LSP.getSnapshot();
        var fieldValid = !snap.validation.errors.some(function(e) { return e.fieldKey === fieldKey; });
        console.log('[LiveStylePanel] setField:', fieldKey, '=', value,
          fieldValid ? '✓' : '✗ (validation issue)');
      },

      /**
       * _wos.liveStyle.validate() → StylePanelValidationResult
       * Validate and display current draft.
       */
      validate: function() {
        var snap = LSP.getSnapshot();
        if (!snap.draft) {
          console.log('[LiveStylePanel] validate: no active draft');
          return { pass: true, errors: [] };
        }
        var v = LSP.validateStyleOverrideDraft(snap.draft);
        if (v.pass) {
          console.log('[LiveStylePanel] validate: PASS ✓ (' +
            Object.keys(snap.draft.values).length + ' fields)');
        } else {
          console.warn('[LiveStylePanel] validate: FAIL ✗ (' + v.errors.length + ' errors)');
          v.errors.forEach(function(e) {
            console.warn('  ✗', e.fieldKey + ':', e.message,
              e.authorityViolation ? '[AUTHORITY VIOLATION]' : '[RANGE ERROR]');
          });
        }
        return v;
      },

      /**
       * _wos.liveStyle.apply() → StylePanelValidationResult
       * Validate and apply draft as live MAP override.
       */
      apply: function() {
        var result = LSP.applyDraftAsLiveOverride();
        if (result.pass) {
          console.log('[LiveStylePanel] apply: LIVE_OVERRIDE active ✓');
        } else {
          console.warn('[LiveStylePanel] apply: BLOCKED — validation failed');
        }
        return result;
      },

      /**
       * _wos.liveStyle.clear()
       * Remove active override and clear draft.
       */
      clear: function() {
        LSP.clearLiveStyleOverride();
        console.log('[LiveStylePanel] cleared — mode: INACTIVE');
      },

      /**
       * _wos.liveStyle.inspectActiveOverride() → StyleOverride | null
       * Return and log the active live override.
       */
      inspectActiveOverride: function() {
        var MSA      = global.SBE && SBE.MapStyleAuthority;
        var override = MSA ? MSA.getActiveLiveOverride() : null;
        if (!override) {
          console.log('[LiveStylePanel] inspectActiveOverride: no active override');
          return null;
        }
        console.group('[LiveStylePanel] Active override: ' + override.overrideId);
        console.log('targetDomain:', override.targetDomain);
        console.log('targetLayer: ', override.targetLayer);
        console.log('provenance:  ', override.provenance);
        console.log('expires:     ', override.expiresAtMs === null ? 'never (ephemeral)' : override.expiresAtMs);
        console.log('values:');
        console.table([override.values]);
        console.groupEnd();
        return override;
      },

      /**
       * _wos.liveStyle.allowedFields(domain, target, maritimeSectionKey?)
       * Print allowed fields for a given target.
       *
       * @example _wos.liveStyle.allowedFields('MAP', 'atmosphere')
       * @example _wos.liveStyle.allowedFields('MARITIME', 'ferry', 'lighting')
       */
      allowedFields: function(domain, target, maritimeSectionKey) {
        var fields = LSP.getAllowedFieldsForTarget(domain, target, maritimeSectionKey);
        console.log('[LiveStylePanel] allowed fields for ' +
          domain + ':' + target + (maritimeSectionKey ? '.' + maritimeSectionKey : '') +
          ' (' + fields.length + '):');
        console.log(' ', fields.join(', ') || '(none)');
        return fields;
      },

      /**
       * _wos.liveStyle.quickApply(domain, target, fieldKey, value, maritimeSectionKey?)
       * Convenience: create draft, set field, apply — all in one call.
       * Useful for rapid iteration.
       *
       * @example _wos.liveStyle.quickApply('MAP', 'water', 'shimmerStrength', 0.6)
       */
      quickApply: function(domain, target, fieldKey, value, maritimeSectionKey) {
        LSP.createStyleOverrideDraft(domain, target, maritimeSectionKey);
        LSP.setField(fieldKey, value);
        var result = LSP.applyDraftAsLiveOverride();
        if (result.pass) {
          console.log('[LiveStylePanel] quickApply:', domain + ':' + target + '.' + fieldKey, '=', value, '✓ live');
        } else {
          console.warn('[LiveStylePanel] quickApply blocked:', result.errors);
        }
        return result;
      },

      /**
       * _wos.liveStyle.constants()
       * Log all system constants.
       */
      constants: function() {
        console.log('[LiveStylePanel] System constants:');
        console.table(Object.keys(LSP.CONSTANTS)
          .filter(function(k) { return typeof LSP.CONSTANTS[k] !== 'object'; })
          .reduce(function(acc, k) { acc[k] = LSP.CONSTANTS[k]; return acc; }, {}));
        return LSP.CONSTANTS;
      },
    });

    console.log('[LiveStylePanel] v' + VERSION + ' loaded — _wos.liveStyle ready');
    console.log('[LiveStylePanel] Quick start: _wos.liveStyle.quickApply("MAP", "atmosphere", "fogAlpha", 0.4)');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _initDebugAPI);
  } else {
    _initDebugAPI();
  }

})(window);
