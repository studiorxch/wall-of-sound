// ── ActorIdentityRegistry v1.0.0 ──────────────────────────────────────────────
// 0603A_WOS_TruthInfrastructureActorAuthority_v1.0.0
// Status: active | Classification: actor-authority (data layer)
//
// Stable, DETERMINISTIC identity mapping across feeds. Truth-backed actors get
// `${category}:${sourceId}:${sourceEntityId}` — never random. Synthetic actors
// may use generated IDs, always prefixed `synthetic:`. Load AFTER actorTypes.js.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  var _identities = {};   // actorId → identity
  var _synCounter = 0;

  function _now() { return Date.now(); }
  function _toCategory(type) {
    return (SBE.ActorTypes && typeof SBE.ActorTypes.toCategory === 'function')
      ? SBE.ActorTypes.toCategory(type)
      : (type && type.indexOf('.') > 0 ? type.slice(0, type.indexOf('.')) : (type || 'unknown'));
  }
  function _isTruthSource(sourceId) {
    return !!(SBE.ActorSourceRegistry && typeof SBE.ActorSourceRegistry.isTruthSource === 'function'
      && SBE.ActorSourceRegistry.isTruthSource(sourceId));
  }

  // Build a deterministic actorId. Synthetic sources/types get a generated id.
  function _buildActorId(input) {
    var type = input.actorType || 'unknown';
    var category = _toCategory(type);
    var synthetic = (type === 'vehicle.synthetic') || !_isTruthSource(input.sourceId);
    if (synthetic && (input.sourceEntityId == null || input.sourceEntityId === '')) {
      _synCounter++;
      return 'synthetic:' + (input.sourceId || 'synthetic') + ':' + _synCounter;
    }
    var base = category + ':' + (input.sourceId || 'unknown') + ':' + String(input.sourceEntityId);
    return synthetic ? ('synthetic:' + base) : base;
  }

  // resolveIdentity({ sourceId, sourceEntityId, actorType, label, ttlMs, tags })
  function resolveIdentity(input) {
    input = input || {};
    var actorId = _buildActorId(input);
    var now = _now();
    var existing = _identities[actorId];
    if (existing) {
      existing.lastSeenAt = now;
      if (input.label) existing.label = input.label;
      if (input.ttlMs != null) existing.ttlMs = input.ttlMs;
      if (input.tags) existing.tags = input.tags;
      return existing;
    }
    var truth = _isTruthSource(input.sourceId);
    var identity = {
      actorId:        actorId,
      sourceId:       input.sourceId || null,
      sourceEntityId: input.sourceEntityId != null ? String(input.sourceEntityId) : null,
      actorType:      input.actorType || 'unknown',
      label:          input.label || actorId,
      firstSeenAt:    now,
      lastSeenAt:     now,
      ttlMs:          input.ttlMs != null ? input.ttlMs : 30000,
      tags:           input.tags || (truth ? ['truth'] : ['synthetic']),
    };
    _identities[actorId] = identity;
    return identity;
  }

  function getIdentity(actorId) { return _identities[actorId] || null; }
  function listIdentities() {
    return Object.keys(_identities).map(function (k) { return _identities[k]; });
  }
  function pruneExpired(nowMs) {
    nowMs = nowMs || _now();
    var removed = [];
    Object.keys(_identities).forEach(function (id) {
      var idn = _identities[id];
      if (idn.ttlMs > 0 && (nowMs - idn.lastSeenAt) > idn.ttlMs) {
        removed.push(id); delete _identities[id];
      }
    });
    return removed;
  }
  function remove(actorId) { if (_identities[actorId]) { delete _identities[actorId]; return true; } return false; }
  function clear() { _identities = {}; }

  SBE.ActorIdentityRegistry = Object.freeze({
    VERSION:         VERSION,
    resolveIdentity: resolveIdentity,
    getIdentity:     getIdentity,
    listIdentities:  listIdentities,
    pruneExpired:    pruneExpired,
    remove:          remove,
    clear:           clear,
  });

  console.log('[ActorIdentityRegistry] v' + VERSION + ' loaded');
})(window);
