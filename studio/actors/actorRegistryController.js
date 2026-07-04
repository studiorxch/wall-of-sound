// ── WOS ActorRegistryController ───────────────────────────────────────────────
// 0613_WOS_3DCanvasLabPhase4Governance_v1.0.0_BUILD
// Canonical actor registry — localStorage-backed (key: wos-registry).
// Mirrors shape of data/actors/wos-registry.json.
// All writes are atomic (single localStorage.setItem — browser equivalent of
// write-to-temp-then-rename). objectId uniqueness enforced at write time.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var KEY = 'wos-registry';

  function _load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return { version: '1', entries: [] };
      var parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.entries)) return { version: '1', entries: [] };
      return parsed;
    } catch (e) { return { version: '1', entries: [] }; }
  }

  function _write(registry) {
    localStorage.setItem(KEY, JSON.stringify(registry));
  }

  function _stamp() { try { return new Date().toISOString(); } catch (e) { return ''; } }

  var Registry = {
    load: function () { return _load(); },

    list: function () { return _load().entries; },

    get: function (objectId) {
      return _load().entries.filter(function (e) { return e.objectId === objectId; })[0] || null;
    },

    // Add new promoted entry. Returns { ok, reason } — blocks on duplicate objectId.
    addEntry: function (objectId, opts) {
      var r = _load();
      var exists = r.entries.some(function (e) { return e.objectId === objectId; });
      if (exists) return { ok: false, reason: 'duplicate_objectId' };
      opts = opts || {};
      r.entries.push({
        objectId:    objectId,
        status:      'promoted',
        specVersion: opts.specVersion || '1.0.0',
        promotedAt:  _stamp(),
        promotedBy:  opts.promotedBy || 'author',
        supersedes:  opts.supersedes  || null,
        supersededBy: null,
        dependents:  [],
        retiredAt:   null,
        retiredBy:   null,
        retireReason: null,
      });
      _write(r);
      return { ok: true };
    },

    // Retire an entry. Writes retiredAt/retiredBy/retireReason, status → 'retired'.
    retireEntry: function (objectId, retiredBy, reason) {
      var r = _load();
      var found = false;
      r.entries = r.entries.map(function (e) {
        if (e.objectId !== objectId) return e;
        found = true;
        return Object.assign({}, e, {
          status:      'retired',
          retiredAt:   _stamp(),
          retiredBy:   retiredBy || 'author',
          retireReason: reason || '',
        });
      });
      if (!found) return { ok: false, reason: 'not_found' };
      _write(r);
      return { ok: true };
    },

    // When fork is promoted: write supersededBy on old entry, supersedes on new entry.
    supersede: function (originalId, newId) {
      var r = _load();
      r.entries = r.entries.map(function (e) {
        if (e.objectId === originalId) return Object.assign({}, e, { status: 'deprecated', supersededBy: newId });
        return e;
      });
      _write(r);
    },

    addDependent: function (objectId, specId) {
      var r = _load();
      r.entries = r.entries.map(function (e) {
        if (e.objectId !== objectId) return e;
        var deps = (e.dependents || []).slice();
        if (!deps.some(function (d) { return d.specId === specId; })) {
          deps.push({ specId: specId, declaredAt: _stamp() });
        }
        return Object.assign({}, e, { dependents: deps });
      });
      _write(r);
    },

    // Gate results store (adjacent to registry, keyed by objectId)
    getGateResult: function (objectId) {
      try {
        var raw = localStorage.getItem('wos-gate-result:' + objectId);
        return raw ? JSON.parse(raw) : null;
      } catch (e) { return null; }
    },

    writeGateResult: function (objectId, result) {
      localStorage.setItem('wos-gate-result:' + objectId, JSON.stringify(result));
    },

    exportJson: function () { return JSON.stringify(_load(), null, 2); },
    clear:      function () { _write({ version: '1', entries: [] }); },
  };

  global.WOSActorRegistryController = Registry;
  console.log('[ActorRegistryController] ready — ' + Registry.list().length + ' registry entries');
})(window);
