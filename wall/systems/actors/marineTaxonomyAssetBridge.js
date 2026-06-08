// ── MarineTaxonomyAssetBridge v1.0.0 ──────────────────────────────────────────
// 0603V_WOS_MarineTaxonomyAssetBridge_v1.0.0
// Status: active | Classification: render-authority-bridge
//
// Applies the advisory MarineVesselTaxonomyResolver result to an individual
// marine actor's render payload (PER-ACTOR), overriding only asset-related fields
// when confidence is high enough. Never mutates AIS truth, actor records, the
// global assignment map, default assignments, asset records, or the renderer.
// Load AFTER marineVesselTaxonomyResolver.js, before actorRenderAuthority.js
// (ARA guards if absent). Never throws.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  var _enabled = true, _debug = false, _minConfidence = 0.60, _applyUnknown = false, _cacheEnabled = true;
  var _cache = {};
  var _stats = { appliedCount: 0, skippedCount: 0, lastAppliedAt: 0, lastSkippedReason: null, lastError: null };

  function _resolver() { return SBE.MarineVesselTaxonomyResolver; }
  function _ala() { return SBE.ActorAssetLibraryAuthority; }
  function _isMarine(type) { return (type || '').indexOf('marine') === 0; }
  function _num(v) { return (typeof v === 'number' && isFinite(v)) ? v : (typeof v === 'string' && /^\d+$/.test(v) ? parseInt(v, 10) : null); }

  function _cacheKey(actor) {
    var md = (actor && actor.metadata) || {};
    var st = actor && actor.shipType != null ? actor.shipType : (md.shipType != null ? md.shipType : (md.ship_type != null ? md.ship_type : ''));
    return [actor && actor.actorId, st, (actor && (actor.name || actor.label)) || '', (actor && actor.lengthM) || md.lengthM || '', actor && actor.sourceId].join('|');
  }

  // Variant from candidate asset for the current lod tier (same spirit as ALA).
  function _resolveAssetVariant(asset, lodTier) {
    if (!asset || !asset.variants) return null;
    var v = asset.variants, want;
    if (lodTier === 'hidden') return null;
    else if (lodTier === 'dot')   want = v.dot ? 'dot' : null;
    else if (lodTier === 'node')  want = v.lowpoly ? 'lowpoly' : (v.icon ? 'icon' : (v.dot ? 'dot' : null));
    else if (lodTier === 'icon')  want = v.icon ? 'icon' : (v.lowpoly ? 'lowpoly' : (v.dot ? 'dot' : null));
    else if (lodTier === 'model') want = v.lowpoly ? 'lowpoly' : (v.hero ? 'hero' : (v.icon ? 'icon' : null));
    else if (lodTier === 'hero')  want = v.hero ? 'hero' : (v.lowpoly ? 'lowpoly' : (v.icon ? 'icon' : null));
    if (!want) want = (asset.defaultVariant && v[asset.defaultVariant]) ? asset.defaultVariant : null;
    if (!want) { for (var k in v) { if (v.hasOwnProperty(k)) { want = k; break; } } }
    return want && v[want] ? { variantKey: want, renderVariant: v[want].renderVariant } : null;
  }

  // Compute the bridge decision (does NOT mutate). Returns a decision object.
  function resolveBridge(actor, lodTier) {
    if (!_enabled) return { apply: false, reason: 'disabled' };
    if (!actor || !_isMarine(actor.actorType)) return { apply: false, reason: 'not_marine_actor' };
    var resolver = _resolver();
    if (!resolver || typeof resolver.resolveAssetCandidate !== 'function') return { apply: false, reason: 'resolver_unavailable' };

    var key = _cacheKey(actor);
    var res;
    if (_cacheEnabled && _cache[key]) res = _cache[key];
    else { try { res = resolver.resolveAssetCandidate(actor); } catch (e) { _stats.lastError = 'resolve_failed'; return { apply: false, reason: 'resolver_error' }; }
      if (_cacheEnabled) _cache[key] = res; }

    if (!res || res.ok === false) return { apply: false, reason: (res && res.reason) || 'no_candidate', res: res };
    if (res.role === 'unknown' && !_applyUnknown) return { apply: false, reason: 'unknown_role', res: res };
    if (typeof res.confidence === 'number' && res.confidence < _minConfidence) return { apply: false, reason: 'below_confidence', res: res };

    var ala = _ala();
    var asset = ala && ala.getAsset ? ala.getAsset(res.assetId) : null;
    if (!asset) return { apply: false, reason: 'candidate_asset_missing', res: res };

    return { apply: true, reason: 'applied', res: res, asset: asset, variant: _resolveAssetVariant(asset, lodTier) };
  }

  function _clone(o) { var c = {}; for (var k in o) if (o.hasOwnProperty(k)) c[k] = o[k]; return c; }

  // applyToPayload(actor, payload) — per-actor asset override (shallow copy on change).
  function applyToPayload(actor, payload) {
    payload = payload || {};
    var d = resolveBridge(actor, payload.lodTier);

    if (!d.apply) {
      // annotate (non-mutating to actor truth); keep base asset fields.
      var keep = _clone(payload);
      keep.taxonomyApplied = false;
      keep.taxonomyReason = d.reason;
      if (d.res) { keep.taxonomyRole = d.res.role; keep.taxonomyConfidence = d.res.confidence; keep.taxonomyAssetId = d.res.assetId; }
      _stats.skippedCount++; _stats.lastSkippedReason = d.reason;
      if (_debug) console.log('[MarineBridge] skip', actor && actor.actorId, d.reason);
      return keep;
    }

    var asset = d.asset, res = d.res, out = _clone(payload);
    out.assetId        = asset.id;
    out.assetKey       = asset.key;
    out.assetCategory  = asset.category;
    out.assetLabel     = asset.label;
    out.assetEditable  = asset.editable;
    out.silhouetteClass = asset.silhouetteClass || out.silhouetteClass;
    out.paletteRef     = asset.paletteRef || out.paletteRef;
    out.glyphRef       = asset.glyphRef || out.glyphRef;
    out.materialClass  = asset.materialClass || out.materialClass;
    out.lightClass     = asset.lightClass || out.lightClass;
    out.scaleClass     = asset.scaleClass || out.scaleClass;
    out.priorityClass  = asset.priorityClass || out.priorityClass;
    out.assetTags      = asset.tags;
    out.assetMetadata  = asset.metadata;
    if (d.variant && d.variant.renderVariant) { out.renderVariant = d.variant.renderVariant; out.variant = d.variant.renderVariant; }
    out.taxonomyRole        = res.role;
    out.taxonomyConfidence  = res.confidence;
    out.taxonomyReason      = res.reason;
    out.taxonomySource      = res.source;
    out.taxonomyAssetId     = res.assetId;
    out.taxonomyFallbackUsed = res.fallbackUsed;
    out.taxonomyApplied     = true;

    _stats.appliedCount++; _stats.lastAppliedAt = Date.now();
    if (_debug) console.log('[MarineBridge] apply', actor && actor.actorId, '→', asset.id, '(' + res.role + ', ' + res.confidence + ')');
    return out;
  }

  function shouldApply(actor, lodTier) { return resolveBridge(actor, lodTier).apply; }

  // ── Audit (read-only) ────────────────────────────────────────────────────────
  function auditActor(actorId) {
    var tar = SBE.TruthActorRuntime;
    if (!tar || typeof tar.getActor !== 'function') return { ok: false, reason: 'runtime_unavailable' };
    var a = tar.getActor(actorId);
    if (!a) return { ok: false, reason: 'actor_not_found' };
    var d = resolveBridge(a, (a._lastPayload && a._lastPayload.lodTier) || 'model');
    return { ok: true, actorId: actorId, apply: d.apply, reason: d.reason, role: d.res && d.res.role,
      confidence: d.res && d.res.confidence, assetId: d.res && d.res.assetId };
  }
  function auditPayload(actorId) {
    var tar = SBE.TruthActorRuntime;
    if (!tar || typeof tar.getActor !== 'function') return { ok: false, reason: 'runtime_unavailable' };
    var a = tar.getActor(actorId);
    if (!a) return { ok: false, reason: 'actor_not_found' };
    var base = a._lastPayload || {};
    var d = resolveBridge(a, base.lodTier || 'model');
    return {
      actorId: actorId, actorType: a.actorType, sourceId: a.sourceId,
      baseAssetId: base.assetId || null,
      taxonomyAssetId: d.res ? d.res.assetId : null,
      taxonomyRole: d.res ? d.res.role : null,
      taxonomyConfidence: d.res ? d.res.confidence : null,
      applied: d.apply, reason: d.reason,
      renderVariant: d.apply && d.variant ? d.variant.renderVariant : (base.renderVariant || null),
      silhouetteClass: d.apply && d.asset ? d.asset.silhouetteClass : (base.silhouetteClass || null),
      paletteRef: d.apply && d.asset ? d.asset.paletteRef : (base.paletteRef || null),
    };
  }

  function getState() {
    return { version: VERSION, enabled: _enabled, debug: _debug, minConfidence: _minConfidence,
      applyUnknown: _applyUnknown, cacheEnabled: _cacheEnabled,
      appliedCount: _stats.appliedCount, skippedCount: _stats.skippedCount,
      lastAppliedAt: _stats.lastAppliedAt, lastSkippedReason: _stats.lastSkippedReason, lastError: _stats.lastError,
      cacheSize: Object.keys(_cache).length };
  }
  function setEnabled(on) { _enabled = on !== false; return _enabled; }
  function setDebug(on) { _debug = on !== false; return _debug; }
  function setMinConfidence(n) { var v = Number(n); if (isFinite(v)) _minConfidence = Math.max(0, Math.min(1, v)); return _minConfidence; }
  function clearCache() { _cache = {}; return true; }

  SBE.MarineTaxonomyAssetBridge = Object.freeze({
    VERSION:          VERSION,
    applyToPayload:   applyToPayload,
    resolveBridge:    resolveBridge,
    shouldApply:      shouldApply,
    getState:         getState,
    setEnabled:       setEnabled,
    setDebug:         setDebug,
    setMinConfidence: setMinConfidence,
    clearCache:       clearCache,
    auditActor:       auditActor,
    auditPayload:     auditPayload,
  });

  console.log('[MarineTaxonomyAssetBridge] v' + VERSION + ' loaded');
})(window);
