// ── WOS ActorPlacementController ───────────────────────────────────────────────
// 0613_WOS_3DCanvasLabLockedArchitecture_v1.0.0
// Maps world position → anchor.lat/lon, writes manifest before visual placement,
// resolves assetId through resolver, falls back to placeholder when unresolved.
// Selects newly placed actor after successful save.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var _selectedObjectId = null;
  var _listeners = { select: [], place: [], remove: [] };

  function _emit(event, data) {
    var cbs = _listeners[event] || [];
    for (var i = 0; i < cbs.length; i++) { try { cbs[i](data); } catch (e) {} }
  }

  function _store() { return global.WOSActorManifestStore; }
  function _resolver() { return global.WOSAssetResolver; }

  var Controller = {
    // Place a new actor at world coordinates. Returns { ok, manifest } or { ok: false, reason }.
    place: function (lat, lon, opts) {
      var store = _store();
      var resolver = _resolver();
      if (!store) return { ok: false, reason: 'store_unavailable' };

      opts = opts || {};
      var assetId = opts.assetId || (resolver ? resolver.placeholderAssetId() : 'wos_placeholder_cube');

      var manifest = store.add({
        actorCategory: opts.actorCategory || 'prop',
        actorType:     opts.actorType     || 'custom',
        assetId:       assetId,
        anchor: {
          lat:        lat,
          lon:        lon,
          altM:       opts.altM       || 0,
          headingDeg: opts.headingDeg || 0,
        },
      });

      if (!manifest) return { ok: false, reason: 'store_rejected' };

      var undoCtrl = global.WOSUndoRedoController;
      if (undoCtrl) undoCtrl.record('place', { before: null, after: manifest });

      _selectedObjectId = manifest.objectId;
      _emit('place', manifest);
      _emit('select', manifest);
      return { ok: true, manifest: manifest };
    },

    select: function (objectId) {
      _selectedObjectId = objectId;
      var actor = objectId ? (_store() ? _store().get(objectId) : null) : null;
      _emit('select', actor);
    },

    deselect: function () {
      _selectedObjectId = null;
      _emit('select', null);
    },

    remove: function (objectId) {
      var store = _store();
      if (!store) return { ok: false, reason: 'store_unavailable' };
      var actor = store.get(objectId);
      if (actor && actor.meta && actor.meta.promoted) {
        return { ok: false, reason: 'promoted', message: 'This actor is promoted and cannot be deleted in Phase 3. Use the Phase 4 governance flow.' };
      }
      var undoCtrl = global.WOSUndoRedoController;
      if (undoCtrl) undoCtrl.record('delete', { before: actor, after: null });
      var ok = store.remove(objectId);
      if (ok) {
        if (_selectedObjectId === objectId) { _selectedObjectId = null; _emit('select', null); }
        _emit('remove', { objectId: objectId, actor: actor });
      }
      return { ok: ok };
    },

    duplicate: function (objectId) {
      var store = _store();
      if (!store) return { ok: false, reason: 'store_unavailable' };
      var copy = store.duplicate(objectId);
      if (!copy) return { ok: false, reason: 'source_not_found' };
      var undoCtrl = global.WOSUndoRedoController;
      if (undoCtrl) undoCtrl.record('duplicate', { before: null, after: copy });
      _selectedObjectId = copy.objectId;
      _emit('place', copy);
      _emit('select', copy);
      return { ok: true, manifest: copy };
    },

    // emit — allow external controllers (e.g. RetirementController) to fire events
    emit: function (event, data) { _emit(event, data); },

    selectedObjectId: function () { return _selectedObjectId; },

    selectedActor: function () {
      if (!_selectedObjectId) return null;
      var store = _store();
      return store ? store.get(_selectedObjectId) : null;
    },

    on: function (event, fn) {
      if (_listeners[event]) _listeners[event].push(fn);
    },

    off: function (event, fn) {
      if (!_listeners[event]) return;
      _listeners[event] = _listeners[event].filter(function (f) { return f !== fn; });
    },
  };

  global.WOSActorPlacementController = Controller;
  console.log('[ActorPlacementController] ready');
})(window);
