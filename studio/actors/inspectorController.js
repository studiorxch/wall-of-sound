// ── WOS InspectorController ────────────────────────────────────────────────────
// Phase 2: field validation, cascade warnings, save sequence.
// Phase 4: LOD threshold editing, continuity scalars, liveTracking section,
//          changeReason field, rotate gizmo headingDeg observation.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var ACTOR_TYPES = {
    maritime:  ['vessel', 'buoy', 'beacon', 'wreck', 'mooring', 'platform', 'custom'],
    vehicle:   ['land_vehicle', 'aircraft', 'rail', 'emergency', 'custom'],
    structure: ['building', 'bridge', 'tower', 'facility', 'port_infra', 'custom'],
    prop:      ['static_marker', 'signage', 'environmental', 'custom'],
  };
  var ACTOR_CATEGORIES = Object.keys(ACTOR_TYPES);

  // Categories that support live tracking
  var LIVE_TRACKING_CATEGORIES = ['maritime', 'vehicle'];

  var DEFAULT_LOD = { highM: 500, medM: 2000, lowM: 8000, billboardM: 20000 };

  // ── Validation ───────────────────────────────────────────────────────────────
  function _validateDraft(draft, registeredAssetIds) {
    var errors = {};

    if (!draft.actorCategory || ACTOR_CATEGORIES.indexOf(draft.actorCategory) === -1) {
      errors.actorCategory = 'actorCategory is required.';
    }
    var validTypes = ACTOR_TYPES[draft.actorCategory] || [];
    if (!draft.actorType || validTypes.indexOf(draft.actorType) === -1) {
      errors.actorType = 'actorType is not valid for this category.';
    }

    var assetOk = draft.assetId === 'wos_placeholder_cube' ||
                  (registeredAssetIds && registeredAssetIds.indexOf(draft.assetId) !== -1);
    if (!draft.assetId || !assetOk) {
      errors.assetId = 'Select an asset or use the placeholder to save.';
    }

    var altM = parseFloat(draft.anchor && draft.anchor.altM);
    if (isNaN(altM) || altM < -500 || altM > 8849) {
      errors.altM = 'altM must be between -500 and 8849.';
    }

    var hdg = parseFloat(draft.anchor && draft.anchor.headingDeg);
    if (isNaN(hdg) || hdg < 0 || hdg >= 360) {
      errors.headingDeg = 'headingDeg must be between 0 and 360.';
    }

    var label = (draft.meta && draft.meta.displayLabel) || '';
    if (label.length > 64) {
      errors.displayLabel = 'Label must be 64 characters or fewer.';
    }

    // LOD threshold validation
    var lod = draft.lod || {};
    var h = parseFloat(lod.highM), m = parseFloat(lod.medM),
        l = parseFloat(lod.lowM), b = parseFloat(lod.billboardM);
    if (!isNaN(h) && !isNaN(m) && !isNaN(l) && !isNaN(b)) {
      if (!(h < m && m < l && l < b)) {
        errors.lod = 'Thresholds must be in ascending order.';
      }
    }

    return errors;
  }

  function _wrapHeading(val) {
    var n = parseFloat(val);
    if (isNaN(n)) return n;
    n = n % 360;
    if (n < 0) n += 360;
    if (n === 360) n = 0;
    return Math.round(n * 1000) / 1000;
  }

  // ── State ────────────────────────────────────────────────────────────────────
  var _draft = null;
  var _original = null;
  var _errors = {};
  var _assetEntries = [];
  var _registeredAssetIds = [];
  var _saveStatus = null;
  var _cascadeWarning = null;
  var _listeners = [];

  function _emit() {
    for (var i = 0; i < _listeners.length; i++) { try { _listeners[i](); } catch (e) {} }
  }

  function _store()    { return global.WOSActorManifestStore; }
  function _resolver() { return global.WOSAssetResolver; }

  function _loadAssets() {
    var r = _resolver();
    _assetEntries = r ? r.list() : [{ assetId: 'wos_placeholder_cube', name: 'Placeholder Cube', category: 'system' }];
    _registeredAssetIds = _assetEntries.map(function (e) { return e.assetId; });
  }

  function _normalizeLod(src) {
    var stored = src || {};
    return {
      highM:      stored.highM      != null ? stored.highM      : DEFAULT_LOD.highM,
      medM:       stored.medM       != null ? stored.medM       : DEFAULT_LOD.medM,
      lowM:       stored.lowM       != null ? stored.lowM       : DEFAULT_LOD.lowM,
      billboardM: stored.billboardM != null ? stored.billboardM : DEFAULT_LOD.billboardM,
    };
  }

  function _normalizeScalars(src) {
    var stored = src || {};
    return {
      continuityAlpha:     stored.continuityAlpha     != null ? stored.continuityAlpha     : null,
      deadReckoningWeight: stored.deadReckoningWeight  != null ? stored.deadReckoningWeight  : 0,
      coastAlpha:          stored.coastAlpha           != null ? stored.coastAlpha           : null,
      staleWeight:         stored.staleWeight          != null ? stored.staleWeight          : null,
      interpolationWeight: stored.interpolationWeight  != null ? stored.interpolationWeight  : null,
    };
  }

  // ── Public API ───────────────────────────────────────────────────────────────
  var Controller = {
    mount: function (objectId) {
      var store = _store();
      _original = store ? store.get(objectId) : null;
      if (!_original) { _draft = null; _errors = {}; _saveStatus = null; _emit(); return; }

      _loadAssets();

      _draft = {
        objectId:      _original.objectId,
        actorCategory: _original.actorCategory || 'prop',
        actorType:     _original.actorType     || 'custom',
        assetId:       _original.assetId       || 'wos_placeholder_cube',
        anchor: {
          lat:        _original.anchor ? _original.anchor.lat        : 0,
          lon:        _original.anchor ? _original.anchor.lon        : 0,
          altM:       _original.anchor ? (_original.anchor.altM || 0) : 0,
          headingDeg: _original.anchor ? (_original.anchor.headingDeg || 0) : 0,
        },
        lod:     _normalizeLod(_original.lod),
        scalars: _normalizeScalars(_original.scalars),
        liveTracking: _original.liveTracking ? JSON.parse(JSON.stringify(_original.liveTracking)) : null,
        meta: {
          specVersion:    '1.0.0',
          authoredAt:     _original.meta ? _original.meta.authoredAt   : '',
          promoted:       (_original.meta && _original.meta.promoted)   || false,
          lifecycleState: (_original.meta && _original.meta.lifecycleState) || 'DRAFT',
          displayLabel:   (_original.meta && _original.meta.displayLabel) || '',
          changeReason:   (_original.meta && _original.meta.changeReason) || '',
          supersedes:     (_original.meta && _original.meta.supersedes) || null,
        },
      };
      _cascadeWarning = null;
      _saveStatus = null;
      _errors = _validateDraft(_draft, _registeredAssetIds);
      _emit();
    },

    unmount: function () {
      _draft = null; _original = null; _errors = {}; _saveStatus = null;
      _cascadeWarning = null;
      _emit();
    },

    // Phase 2 field setters
    setActorCategory: function (val) {
      if (!_draft) return;
      if (_draft.actorType !== 'custom' && val !== _draft.actorCategory) {
        _cascadeWarning = { pendingCategory: val };
        _emit(); return;
      }
      _applyCategory(val);
    },

    confirmCategoryChange: function () {
      if (!_cascadeWarning) return;
      _applyCategory(_cascadeWarning.pendingCategory);
      _cascadeWarning = null;
    },

    cancelCategoryChange: function () { _cascadeWarning = null; _emit(); },

    setActorType: function (val) {
      if (!_draft) return;
      _draft.actorType = val;
      _errors = _validateDraft(_draft, _registeredAssetIds);
      _emit();
    },

    setAssetId: function (val) {
      if (!_draft) return;
      _draft.assetId = val;
      _errors = _validateDraft(_draft, _registeredAssetIds);
      _emit();
    },

    setAltM: function (val) {
      if (!_draft) return;
      _draft.anchor.altM = parseFloat(val);
      _errors = _validateDraft(_draft, _registeredAssetIds);
      _emit();
    },

    setHeadingDeg: function (raw) {
      if (!_draft) return;
      var wrapped = _wrapHeading(raw);
      _draft.anchor.headingDeg = wrapped;
      _errors = _validateDraft(_draft, _registeredAssetIds);
      _emit();
    },

    setDisplayLabel: function (val) {
      if (!_draft) return;
      _draft.meta.displayLabel = val;
      _errors = _validateDraft(_draft, _registeredAssetIds);
      _emit();
    },

    // Phase 4 field setters
    setChangeReason: function (val) {
      if (!_draft) return;
      _draft.meta.changeReason = val;
      _emit();
    },

    setLodField: function (field, val) {
      if (!_draft) return;
      _draft.lod[field] = parseFloat(val);
      _errors = _validateDraft(_draft, _registeredAssetIds);
      _emit();
      // Live LOD ring update
      var lodCtrl = global.WOSLODRingController;
      var gateCtrl = global.WOSPromotionGateController;
      var isDraft = !gateCtrl || gateCtrl.isDraft(_draft);
      if (lodCtrl && isDraft && _draft.anchor) {
        lodCtrl.show({ anchor: _draft.anchor, objectId: _draft.objectId }, _draft.lod);
      }
    },

    setScalar: function (field, val) {
      if (!_draft) return;
      _draft.scalars[field] = val === null ? null : parseFloat(val);
      _emit();
    },

    setLiveTrackingField: function (path, val) {
      if (!_draft) return;
      if (!_draft.liveTracking) _draft.liveTracking = {};
      // path like 'feedType', 'ais.hideOnSART', etc.
      var parts = path.split('.');
      var obj = _draft.liveTracking;
      for (var i = 0; i < parts.length - 1; i++) {
        if (!obj[parts[i]]) obj[parts[i]] = {};
        obj = obj[parts[i]];
      }
      obj[parts[parts.length - 1]] = val;
      _emit();
    },

    enableLiveTracking: function (feedType) {
      if (!_draft) return;
      var feedCtrl = global.WOSFeedBindingController;
      _draft.liveTracking = feedCtrl ? feedCtrl.defaultBlock(feedType) : { feedType: feedType };
      _emit();
    },

    disableLiveTracking: function () {
      if (!_draft) return;
      _draft.liveTracking = null;
      _emit();
    },

    // Observe heading update from rotate gizmo (transient — does not save)
    observeHeadingDeg: function (deg) {
      if (!_draft) return;
      _draft.anchor.headingDeg = _wrapHeading(deg);
      _emit();
    },

    save: function () {
      if (!_draft) return { ok: false, reason: 'no_draft' };

      // Block save for promoted/deprecated/retired actors
      var state = _draft.meta.lifecycleState || 'DRAFT';
      if (state === 'PROMOTED' || state === 'DEPRECATED' || state === 'RETIRED') {
        return { ok: false, reason: 'actor_is_' + state.toLowerCase() };
      }

      _errors = _validateDraft(_draft, _registeredAssetIds);
      if (Object.keys(_errors).length > 0) { _emit(); return { ok: false, reason: 'validation_failed' }; }

      _saveStatus = 'saving';
      _emit();

      var undoCtrl = global.WOSUndoRedoController;
      if (undoCtrl) undoCtrl.record('save', { before: _original, after: _draft });

      var store = _store();
      var ok = store ? store.replace(_draft.objectId, _draft) : false;

      if (ok) {
        _original = store.get(_draft.objectId);
        _saveStatus = 'saved';
        _emit();
        var self = this;
        setTimeout(function () { _saveStatus = null; _emit(); }, 1500);
        return { ok: true };
      } else {
        _saveStatus = 'error';
        _emit();
        return { ok: false, reason: 'store_write_failed' };
      }
    },

    // Accessors
    draft:          function () { return _draft; },
    errors:         function () { return _errors; },
    assetEntries:   function () { return _assetEntries; },
    saveStatus:     function () { return _saveStatus; },
    cascadeWarning: function () { return _cascadeWarning; },
    isValid:        function () { return Object.keys(_errors).length === 0; },
    isDirty:        function () {
      if (!_draft || !_original) return false;
      return JSON.stringify(_draft) !== JSON.stringify(_original);
    },
    supportsLiveTracking: function () {
      return _draft && LIVE_TRACKING_CATEGORIES.indexOf(_draft.actorCategory) !== -1;
    },
    validTypesFor:  function (cat) { return (ACTOR_TYPES[cat] || []).slice(); },
    categories:     function () { return ACTOR_CATEGORIES.slice(); },
    defaultLod:     function () { return Object.assign({}, DEFAULT_LOD); },

    on:  function (fn) { _listeners.push(fn); },
    off: function (fn) { _listeners = _listeners.filter(function (f) { return f !== fn; }); },
  };

  function _applyCategory(val) {
    _draft.actorCategory = val;
    _draft.actorType = 'custom';
    // Clear liveTracking if switching away from a live-tracking-compatible category
    if (LIVE_TRACKING_CATEGORIES.indexOf(val) === -1) _draft.liveTracking = null;
    _errors = _validateDraft(_draft, _registeredAssetIds);
    _emit();
  }

  global.WOSInspectorController = Controller;
  console.log('[InspectorController] ready');
})(window);
