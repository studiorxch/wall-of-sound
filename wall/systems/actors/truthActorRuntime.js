// ── TruthActorRuntime v1.0.0 ──────────────────────────────────────────────────
// 0603A_WOS_TruthInfrastructureActorAuthority_v1.0.0
// Status: active | Classification: actor-authority (logic layer)
//
// Accepts NORMALIZED actor updates (from future feeds / debug), resolves identity
// + visual profile, maintains live actor state, upserts renderable actors into
// the existing WorldSpaceVehicleLayer, and prunes stale actors by TTL.
//
// Authority:
//   OWNS: truth/synthetic actor lifecycle (NOT hero, AIS, aircraft, showcase)
//   USES: ActorIdentityRegistry, ActorVisualRegistry, WorldSpaceVehicleLayer
//   MUST NOT: parse feeds, own meshes, route/interpolate truth, touch hero
// Load AFTER the actor registries and worldSpaceVehicleLayer.js.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.3.0';

  var _active  = false;
  var _actors  = {};   // actorId → live actor record
  var _stats   = { lastUpdateAt: 0, lastPruneAt: 0, lastError: null };

  function _now() { return Date.now(); }
  function _wsl() { return SBE.WorldSpaceVehicleLayer; }
  function _idReg() { return SBE.ActorIdentityRegistry; }
  function _visReg() { return SBE.ActorVisualRegistry; }

  // ── Lifecycle ─────────────────────────────────────────────────────────────────
  function start() {
    _active = true;
    // Enable the render layer only on start (never mutate hero behavior).
    var wsl = _wsl();
    try {
      if (wsl) {
        if (typeof wsl.isActive === 'function' && !wsl.isActive() && typeof wsl.start === 'function') wsl.start();
        if (typeof wsl.getEnabled === 'function' && !wsl.getEnabled() && typeof wsl.setEnabled === 'function') wsl.setEnabled(true);
      }
    } catch (e) { _stats.lastError = 'wsl_start_failed:' + (e && e.message ? e.message : e); }
    console.log('[TruthActorRuntime] v' + VERSION + ' started');
    return true;
  }

  function stop() { _active = false; console.log('[TruthActorRuntime] stopped'); return true; }

  function clear() {
    var wsl = _wsl();
    Object.keys(_actors).forEach(function (id) {
      try { if (wsl && typeof wsl.removeVehicle === 'function') wsl.removeVehicle(id); } catch (e) {}
    });
    _actors = {};
    console.log('[TruthActorRuntime] cleared');
    return true;
  }

  // ── Render bridge (0603G) ──────────────────────────────────────────────────────
  // All actor rendering is routed through ActorRenderAuthority, which fuses visual
  // profile + LOD policy into one canonical payload. A null payload means the LOD
  // policy suppressed the actor — truth persists, the rendered mesh is dropped.
  // Truth is never mutated; the authority is presentation-only.
  function _renderActor(record) {
    var wsl = _wsl();
    if (!wsl || typeof wsl.upsertVehicle !== 'function') return false;   // store state, don't throw
    var ara = SBE.ActorRenderAuthority;
    if (!ara || typeof ara.resolveRenderPayload !== 'function') { _stats.lastError = 'render_authority_missing'; return false; }
    try {
      var payload = ara.resolveRenderPayload(record);   // sets record._visual / _presentation

      if (!payload) {
        // Suppressed (hidden tier / outside viewport / density). Keep truth.
        if (record._rendered && typeof wsl.removeVehicle === 'function') {
          try { wsl.removeVehicle(record.actorId); } catch (e4) {}
        }
        record._rendered = false;
        return true;   // not an error — truth persists
      }

      // WSL contract uses `id`; the authority emits `actorId`.
      payload.id = payload.actorId;
      var ok = !!wsl.upsertVehicle(payload);
      if (ok && payload.opacity != null && typeof wsl.setActorOpacity === 'function') {
        try { wsl.setActorOpacity(payload.id, payload.opacity); } catch (e2) {}
      }
      record._rendered = ok;
      record._lastPayload = payload;
      return ok;
    } catch (e) { _stats.lastError = 'upsert_failed:' + (e && e.message ? e.message : e); return false; }
  }

  // ── upsertActor(normalizedUpdate) ──────────────────────────────────────────────
  function upsertActor(update) {
    if (!update || update.lat == null || update.lng == null) { _stats.lastError = 'invalid_update'; return null; }
    var idReg = _idReg();
    if (!idReg) { _stats.lastError = 'identity_registry_missing'; return null; }

    var ttlMs = update.ttlMs != null ? update.ttlMs : 30000;
    var identity = idReg.resolveIdentity({
      sourceId:       update.sourceId,
      sourceEntityId: update.sourceEntityId,
      actorType:      update.actorType,
      label:          update.label,
      ttlMs:          ttlMs,
      tags:           update.tags,
    });

    var visReg = _visReg();
    var profile = visReg && typeof visReg.getVisualProfile === 'function'
      ? visReg.getVisualProfile({ actorType: update.actorType }) : null;

    var now = _now();
    var record = _actors[identity.actorId] || {
      actorId: identity.actorId, sourceId: update.sourceId, actorType: update.actorType,
      firstSeenAt: now,
    };
    record.sourceEntityId = identity.sourceEntityId;
    record.label          = update.label || identity.label;
    record.lat            = update.lat;
    record.lng            = update.lng;
    record.headingDeg     = update.headingDeg || 0;
    record.speedMps       = update.speedMps != null ? update.speedMps : null;
    record.ttlMs          = ttlMs;
    record.lastSeenAt     = now;
    record.timestampMs    = update.timestampMs || now;
    record.metadata       = update.metadata || {};
    record.visualProfile  = profile;
    _actors[identity.actorId] = record;

    _renderActor(record);
    _stats.lastUpdateAt = now;
    return identity.actorId;
  }

  function removeActor(actorId) {
    var rec = _actors[actorId];
    if (!rec) return false;
    var wsl = _wsl();
    try { if (wsl && typeof wsl.removeVehicle === 'function') wsl.removeVehicle(actorId); }
    catch (e) { _stats.lastError = 'remove_failed:' + (e && e.message ? e.message : e); }
    // 0603F — keep the LOD density sets honest when an actor leaves entirely.
    var policy = SBE.TruthActorVisualLODPolicy;
    if (policy && typeof policy.notifyRemoved === 'function') { try { policy.notifyRemoved(rec.actorType, actorId); } catch (e5) {} }
    delete _actors[actorId];
    var idReg = _idReg();
    if (idReg && typeof idReg.remove === 'function') { try { idReg.remove(actorId); } catch (e2) {} }
    return true;
  }

  function getActor(actorId) { return _actors[actorId] || null; }
  function listActors() { return Object.keys(_actors).map(function (k) { return _actors[k]; }); }

  // ── TTL prune ─────────────────────────────────────────────────────────────────
  function prune(nowMs) {
    nowMs = nowMs || _now();
    var removed = [];
    Object.keys(_actors).forEach(function (id) {
      var a = _actors[id];
      if (a.ttlMs > 0 && (nowMs - a.lastSeenAt) > a.ttlMs) removed.push(id);
    });
    removed.forEach(function (id) { removeActor(id); });
    _stats.lastPruneAt = nowMs;
    return removed;
  }

  // ── State / audit ──────────────────────────────────────────────────────────────
  function getState() {
    var sourceCounts = {}, typeCounts = {};
    var bikeStationVisualized = 0, bikeStationFallback = 0, bikeStationErrors = 0;
    var presRendered = 0, presSuppressed = 0, presByReason = {}, presByType = {};
    Object.keys(_actors).forEach(function (id) {
      var a = _actors[id];
      sourceCounts[a.sourceId] = (sourceCounts[a.sourceId] || 0) + 1;
      typeCounts[a.actorType]  = (typeCounts[a.actorType] || 0) + 1;
      if (a.actorType === 'bike.station') {
        if (a._visual && a._visual.state && a._visual.state !== 'unknown') bikeStationVisualized++;
        else if (a._visual) bikeStationFallback++;
        else bikeStationErrors++;
      }
      if (a._rendered) presRendered++; else presSuppressed++;
      presByType[a.actorType] = presByType[a.actorType] || { rendered: 0, suppressed: 0 };
      if (a._rendered) presByType[a.actorType].rendered++; else presByType[a.actorType].suppressed++;
      var reason = a._presentation && a._presentation.reason ? a._presentation.reason : (a._rendered ? 'eligible' : 'unknown');
      presByReason[reason] = (presByReason[reason] || 0) + 1;
    });
    return {
      renderBridgeCounts: {
        bikeStationVisualized: bikeStationVisualized,
        bikeStationFallback:   bikeStationFallback,
        bikeStationErrors:     bikeStationErrors,
      },
      presentationCounts: {
        rendered:    presRendered,
        suppressed:  presSuppressed,
        byReason:    presByReason,
        byActorType: presByType,
      },
      version:      VERSION,
      active:       _active,
      actorCount:   Object.keys(_actors).length,
      sourceCounts: sourceCounts,
      typeCounts:   typeCounts,
      lastUpdateAt: _stats.lastUpdateAt,
      lastPruneAt:  _stats.lastPruneAt,
      lastError:    _stats.lastError,
    };
  }

  SBE.TruthActorRuntime = Object.freeze({
    VERSION:     VERSION,
    start:       start,
    stop:        stop,
    clear:       clear,
    upsertActor: upsertActor,
    removeActor: removeActor,
    getActor:    getActor,
    getState:    getState,
    listActors:  listActors,
    prune:       prune,
  });

  console.log('[TruthActorRuntime] v' + VERSION + ' loaded');
})(window);
