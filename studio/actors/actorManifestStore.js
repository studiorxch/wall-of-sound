// ── WOS ActorManifestStore ─────────────────────────────────────────────────────
// 0613_WOS_3DCanvasLabLockedArchitecture_v1.0.0
// Persistence: localStorage key 'wos-actors' (browser-local atomic write).
// Shape: { version: "1", actors: [WOSActorManifest, ...] }
// Manifest stores assetId — NEVER assetPath.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var STORAGE_KEY = 'wos-actors';
  var VERSION = '1';

  function _uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  function _load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { version: VERSION, actors: [] };
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.actors)) {
        console.warn('[ActorManifestStore] malformed store — resetting');
        return { version: VERSION, actors: [] };
      }
      return parsed;
    } catch (e) {
      console.warn('[ActorManifestStore] load error:', e);
      return { version: VERSION, actors: [] };
    }
  }

  function _write(store) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch (e) {
      console.error('[ActorManifestStore] write error:', e);
    }
  }

  function _stamp() {
    try { return new Date().toISOString(); } catch (e) { return ''; }
  }

  var Store = {
    load: function () { return _load(); },

    list: function () { return _load().actors; },

    get: function (objectId) {
      return _load().actors.filter(function (a) { return a.objectId === objectId; })[0] || null;
    },

    add: function (manifest) {
      if (!manifest || typeof manifest !== 'object') return null;
      if ('assetPath' in manifest) {
        console.error('[ActorManifestStore] REJECTED — manifest must not contain assetPath');
        return null;
      }
      var store = _load();
      var m = {
        objectId:      manifest.objectId || _uuid(),
        actorCategory: manifest.actorCategory || 'prop',
        actorType:     manifest.actorType || 'custom',
        assetId:       manifest.assetId || '',
        anchor: {
          lat:        (manifest.anchor && manifest.anchor.lat)        || 0,
          lon:        (manifest.anchor && manifest.anchor.lon)        || 0,
          altM:       (manifest.anchor && manifest.anchor.altM)       || 0,
          headingDeg: (manifest.anchor && manifest.anchor.headingDeg) || 0,
        },
        meta: {
          specVersion: '1.0.0',
          authoredAt:  _stamp(),
          promoted:    false,
        },
      };
      store.actors.push(m);
      _write(store);
      return m;
    },

    update: function (objectId, patch) {
      if ('assetPath' in (patch || {})) {
        console.error('[ActorManifestStore] REJECTED — patch must not contain assetPath');
        return false;
      }
      var store = _load();
      var found = false;
      store.actors = store.actors.map(function (a) {
        if (a.objectId !== objectId) return a;
        found = true;
        var updated = Object.assign({}, a, patch);
        // anchor merge
        if (patch.anchor) updated.anchor = Object.assign({}, a.anchor, patch.anchor);
        // meta is not patchable from outside
        updated.meta = a.meta;
        updated.objectId = objectId;
        return updated;
      });
      if (found) _write(store);
      return found;
    },

    remove: function (objectId) {
      var store = _load();
      var before = store.actors.length;
      store.actors = store.actors.filter(function (a) { return a.objectId !== objectId; });
      if (store.actors.length !== before) { _write(store); return true; }
      return false;
    },

    // duplicate — copy actor with new objectId, fresh authoredAt, promoted: false.
    duplicate: function (objectId) {
      var store = _load();
      var src = null;
      store.actors.forEach(function (a) { if (a.objectId === objectId) src = a; });
      if (!src) return null;
      var copy = JSON.parse(JSON.stringify(src));
      copy.objectId = _uuid();
      copy.anchor = Object.assign({}, src.anchor, {
        lat: src.anchor.lat + 0.0001,
        lon: src.anchor.lon + 0.0001,
      });
      copy.meta = Object.assign({}, src.meta, {
        authoredAt: _stamp(),
        promoted: false,
        promotedAt: null,
      });
      store.actors.push(copy);
      _write(store);
      return copy;
    },

    // replace — full manifest replacement by objectId (Phase 2 save contract).
    // Caller supplies the complete next manifest; store validates no assetPath.
    replace: function (objectId, nextManifest) {
      if (!nextManifest || typeof nextManifest !== 'object') return false;
      if ('assetPath' in nextManifest) {
        console.error('[ActorManifestStore] REJECTED — replace must not contain assetPath');
        return false;
      }
      var store = _load();
      var found = false;
      store.actors = store.actors.map(function (a) {
        if (a.objectId !== objectId) return a;
        found = true;
        // Preserve authoredAt from original; update specVersion
        var next = Object.assign({}, nextManifest, { objectId: objectId });
        next.meta = Object.assign({}, nextManifest.meta || {});
        next.meta.authoredAt = a.meta && a.meta.authoredAt ? a.meta.authoredAt : _stamp();
        next.meta.specVersion = '1.0.0';
        next.meta.promoted = false;
        return next;
      });
      if (found) _write(store);
      return found;
    },

    // setLifecycleState — Phase 4. Only permitted meta mutation route for lifecycle fields.
    // Merges extraMeta into actor.meta; never touches non-meta fields.
    setLifecycleState: function (objectId, state, extraMeta) {
      var store = _load();
      var found = false;
      store.actors = store.actors.map(function (a) {
        if (a.objectId !== objectId) return a;
        found = true;
        var meta = Object.assign({}, a.meta, extraMeta || {}, { lifecycleState: state });
        if (state === 'PROMOTED')   meta.promoted = true;
        if (state === 'DRAFT')      meta.promoted = false;
        if (state === 'DEPRECATED') { /* promoted stays true for runtime compat */ }
        return Object.assign({}, a, { meta: meta });
      });
      if (found) _write(store);
      return found;
    },

    // fork — Phase 4. Create new DRAFT with new objectId, supersedes pointer,
    // changeReason, fresh authoredAt, promoted:false, lifecycleState:'DRAFT'.
    fork: function (objectId, changeReason) {
      var store = _load();
      var src = null;
      store.actors.forEach(function (a) { if (a.objectId === objectId) src = a; });
      if (!src) return null;
      var copy = JSON.parse(JSON.stringify(src));
      copy.objectId = _uuid();
      copy.meta = Object.assign({}, src.meta, {
        authoredAt:     _stamp(),
        promoted:       false,
        promotedAt:     null,
        promotedBy:     null,
        lifecycleState: 'DRAFT',
        changeReason:   changeReason || '',
        supersedes:     src.objectId,
        supersededBy:   null,
      });
      store.actors.push(copy);
      _write(store);
      return copy;
    },

    // retire — Phase 4. Mark actor as retired in the manifest (permanent).
    retire: function (objectId, reason) {
      var store = _load();
      var found = false;
      store.actors = store.actors.map(function (a) {
        if (a.objectId !== objectId) return a;
        found = true;
        return Object.assign({}, a, {
          meta: Object.assign({}, a.meta, {
            lifecycleState: 'RETIRED',
            promoted:       false,
            retiredAt:      _stamp(),
            retireReason:   reason || '',
          }),
        });
      });
      if (found) _write(store);
      return found;
    },

    clear: function () { _write({ version: VERSION, actors: [] }); },

    exportJson: function () { return JSON.stringify(_load(), null, 2); },
  };

  global.WOSActorManifestStore = Store;
  console.log('[ActorManifestStore] ready — ' + Store.list().length + ' actor(s) in store');
})(window);
