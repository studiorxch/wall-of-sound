// ── WOS Composition Controller ────────────────────────────────────────────────
// 0616K_WOS_MapObjectCompositionPass_v1.0.0_BUILD
// Minimal multi-selection buffer for composition capture and placement.
// Maintains a set of selected objectIds for createCompositionFromSelection,
// and tracks last created/placed composition for debug surface.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var _selectedObjectIds       = [];   // objectIds added for composition
  var _selectedCompositionId   = null; // composition selected in Library for placement
  var _lastCreatedCompositionId = null;
  var _lastPlacedCompositionId  = null;
  var _lastPlacedChildObjectIds = [];
  var _lastImportResult         = null;
  var _lastError                = null;

  function addActor(objectId) {
    if (!objectId) return { ok: false, reason: 'no_objectId' };
    if (_selectedObjectIds.indexOf(objectId) !== -1) return { ok: true, alreadyAdded: true };
    _selectedObjectIds.push(objectId);
    return { ok: true, selectedCount: _selectedObjectIds.length };
  }

  function removeActor(objectId) {
    var idx = _selectedObjectIds.indexOf(objectId);
    if (idx === -1) return { ok: false, reason: 'not_in_selection' };
    _selectedObjectIds.splice(idx, 1);
    return { ok: true, selectedCount: _selectedObjectIds.length };
  }

  function clearSelection() {
    _selectedObjectIds = [];
    return { ok: true };
  }

  function selectedObjectIds() {
    return _selectedObjectIds.slice();
  }

  function selectComposition(compositionId) {
    _selectedCompositionId = compositionId || null;
    return { ok: true, selectedCompositionId: _selectedCompositionId };
  }

  function createCompositionFromSelection(options) {
    options = options || {};
    var store     = global.WOSCompositionStore;
    var actorStore = global.WOSActorManifestStore;
    if (!store)      { _lastError = 'WOSCompositionStore unavailable'; return { ok: false, reason: _lastError }; }
    if (!actorStore) { _lastError = 'WOSActorManifestStore unavailable'; return { ok: false, reason: _lastError }; }
    if (_selectedObjectIds.length === 0) {
      _lastError = 'no_actors_selected';
      return { ok: false, reason: 'no_actors_selected' };
    }
    var actors = _selectedObjectIds.map(function (id) { return actorStore.get(id); }).filter(Boolean);
    if (actors.length === 0) {
      _lastError = 'actors_not_found';
      return { ok: false, reason: 'actors_not_found' };
    }
    var result = store.createFromActors(actors, options);
    if (result.ok) {
      _lastCreatedCompositionId = result.compositionId;
      _lastError = null;
    } else {
      _lastError = result.reason;
    }
    return result;
  }

  function placeSelectedComposition(anchor, options) {
    var store = global.WOSCompositionStore;
    if (!store) { _lastError = 'WOSCompositionStore unavailable'; return { ok: false, reason: _lastError }; }
    var compositionId = _selectedCompositionId;
    if (!compositionId) { _lastError = 'no_composition_selected'; return { ok: false, reason: _lastError }; }
    var result = store.placeComposition(compositionId, anchor, options);
    if (result.ok || result.childObjectIds) {
      _lastPlacedCompositionId  = compositionId;
      _lastPlacedChildObjectIds = result.childObjectIds || [];
      _lastError = result.failures && result.failures.length ? 'partial_failures' : null;
    } else {
      _lastError = result.reason;
    }
    return result;
  }

  function recordImportResult(result) {
    _lastImportResult = result || null;
  }

  function getSnapshot() {
    return {
      enabled:                   true,
      compositionCount:          (function () {
        var s = global.WOSCompositionStore;
        return s ? s.list().length : 0;
      }()),
      selectedCompositionId:     _selectedCompositionId,
      selectedObjectIds:         _selectedObjectIds.slice(),
      lastCreatedCompositionId:  _lastCreatedCompositionId,
      lastPlacedCompositionId:   _lastPlacedCompositionId,
      lastPlacedChildObjectIds:  _lastPlacedChildObjectIds.slice(),
      lastImportResult:          _lastImportResult,
      lastError:                 _lastError,
    };
  }

  global.WOSCompositionController = {
    addActor:                    addActor,
    removeActor:                 removeActor,
    clearSelection:              clearSelection,
    selectedObjectIds:           selectedObjectIds,
    selectComposition:           selectComposition,
    createCompositionFromSelection: createCompositionFromSelection,
    placeSelectedComposition:    placeSelectedComposition,
    recordImportResult:          recordImportResult,
    getSnapshot:                 getSnapshot,
  };

  console.log('[CompositionController] ready — 0616K');
})(window);
