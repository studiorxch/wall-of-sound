// ── WOS Composition Store ──────────────────────────────────────────────────────
// 0616K_WOS_MapObjectCompositionPass_v1.0.0_BUILD
// Studio-local composition recipe store.
// Compositions are reusable placement recipes — NOT actors, NOT runtime entities.
// Each composition expands into normal actor manifests via existing placement APIs.
// Persists only to: wos.studio.compositions.v1
// Never writes composition fields to actor manifests.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var STORAGE_KEY  = 'wos.studio.compositions.v1';
  var ID_PREFIX    = 'studio.composition.';
  var MAX_CHILDREN = 100;
  var MAX_BOUNDS_M = 1000;

  var KNOWN_ACTOR_CATEGORIES = { vehicle: 1, maritime: 1, prop: 1, structure: 1, aircraft: 1 };

  // Fields that must never appear on a composition child record
  var FORBIDDEN_CHILD_FIELDS = [
    'shapeRecipe', 'materialRecipe', 'glbPath', 'objectUrl', 'assetPath',
    'compositionRecipe', 'compositionChildren', 'compositionAssetId',
    'compositionSource', 'childOffsets', 'kitRecipe', 'groupRecipe',
  ];

  // _compositions: compositionId → record
  // _history: compositionId → PlacementBatch[]
  var _compositions = {};
  var _history      = {};  // { compositionId: [{ composedAt, childObjectIds }] }
  var _lastError    = null;

  // ── Persistence ──────────────────────────────────────────────────────────────

  function _save() {
    try {
      var payload = { compositions: _compositions, history: _history };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
      _lastError = 'persist_failed: ' + e.message;
    }
  }

  function _load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var data = JSON.parse(raw);
      if (data && data.compositions && typeof data.compositions === 'object') {
        _compositions = data.compositions;
      }
      if (data && data.history && typeof data.history === 'object') {
        _history = data.history;
      }
    } catch (e) {
      _lastError = 'load_failed: ' + e.message;
    }
  }

  // ── ID generation ─────────────────────────────────────────────────────────────

  function _slug(label) {
    return (label || 'kit')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'kit';
  }

  function _nextId(category, label) {
    var cat  = (category || 'misc').toLowerCase().replace(/[^a-z0-9]/g, '-');
    var slug = _slug(label);
    var prefix = ID_PREFIX + cat + '.' + slug + '.';
    var max = 0;
    Object.keys(_compositions).forEach(function (id) {
      if (id.indexOf(prefix) === 0) {
        var nnn = parseInt(id.slice(prefix.length), 10);
        if (!isNaN(nnn) && nnn > max) max = nnn;
      }
    });
    return prefix + String(max + 1).padStart(3, '0');
  }

  // ── Geo helpers ───────────────────────────────────────────────────────────────

  // Approximate meters-per-degree at a given latitude
  function _metersPerDeg(lat) {
    var latRad = lat * Math.PI / 180;
    return {
      lat: 111132.92 - 559.82 * Math.cos(2 * latRad) + 1.175 * Math.cos(4 * latRad),
      lon: 111412.84 * Math.cos(latRad) - 93.5 * Math.cos(3 * latRad),
    };
  }

  function _computeCentroid(actors) {
    var latSum = 0, lonSum = 0, n = actors.length;
    actors.forEach(function (a) { latSum += a.anchor.lat; lonSum += a.anchor.lon; });
    return { lat: latSum / n, lon: lonSum / n };
  }

  function _latLonToOffsetM(lat, lon, centroid) {
    var mpd = _metersPerDeg(centroid.lat);
    return {
      x: (lon - centroid.lon) * mpd.lon,
      y: (lat - centroid.lat) * mpd.lat,
    };
  }

  function _offsetMToLatLon(offsetM, anchor) {
    var mpd = _metersPerDeg(anchor.lat);
    return {
      lat: anchor.lat + offsetM.y / mpd.lat,
      lon: anchor.lon + offsetM.x / mpd.lon,
    };
  }

  function _computeBoundsM(children) {
    if (!children.length) return { widthM: 0, depthM: 0, heightM: 0 };
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, maxZ = 0;
    children.forEach(function (c) {
      var o = c.offsetM || {};
      var x = o.x || 0, y = o.y || 0, z = Math.abs(o.z || 0);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (z > maxZ) maxZ = z;
    });
    return {
      widthM: Math.round((maxX - minX) * 100) / 100,
      depthM: Math.round((maxY - minY) * 100) / 100,
      heightM: Math.round(maxZ * 100) / 100,
    };
  }

  // ── Actor eligibility check ───────────────────────────────────────────────────

  var FORBIDDEN_ACTOR_FIELDS = [
    'shapeRecipe', 'materialRecipe', 'shapeDraft', 'materialDraft',
    'compositionRecipe', 'compositionChildren', 'compositionAssetId',
    'compositionSource', 'childOffsets', 'kitRecipe', 'groupRecipe',
    'glbPath', 'objectUrl', 'assetPath',
  ];

  function _checkActorEligible(actor) {
    if (!actor) return 'actor_null';
    var state = (actor.meta && actor.meta.lifecycleState) ||
                (actor.meta && actor.meta.promoted ? 'PROMOTED' : 'DRAFT');
    if (state !== 'DRAFT') return 'not_draft: ' + state;
    if (!actor.assetId) return 'no_assetId';
    var anchor = actor.anchor;
    if (!anchor || !isFinite(anchor.lat) || !isFinite(anchor.lon)) return 'invalid_anchor';
    var resolver = global.WOSAssetResolver;
    if (resolver) {
      var r = resolver.resolve(actor.assetId);
      if (r.placeholder) return 'assetId_unresolved: ' + actor.assetId;
    }
    for (var i = 0; i < FORBIDDEN_ACTOR_FIELDS.length; i++) {
      if (actor[FORBIDDEN_ACTOR_FIELDS[i]] !== undefined) return 'forbidden_field: ' + FORBIDDEN_ACTOR_FIELDS[i];
    }
    return null;  // eligible
  }

  // ── Composition validation ────────────────────────────────────────────────────

  function _validateComposition(rec) {
    var errors = [];
    if (!rec || !rec.id) { errors.push('id_missing'); return errors; }
    if (rec.source !== 'studio-composition') errors.push('invalid_source');
    var comp = rec.composition;
    if (!comp || !Array.isArray(comp.children)) { errors.push('children_missing'); return errors; }
    if (comp.children.length < 1)  errors.push('childCount_zero');
    if (comp.children.length > MAX_CHILDREN) errors.push('childCount_exceeds_100');
    if (comp.childCount !== comp.children.length) errors.push('childCount_mismatch');

    var resolver = global.WOSAssetResolver;
    comp.children.forEach(function (child, i) {
      var prefix = 'child[' + i + '] ';
      if (!child.assetId) { errors.push(prefix + 'no_assetId'); return; }
      if (child.assetId.indexOf(ID_PREFIX) === 0) errors.push(prefix + 'nested_composition_forbidden');
      if (resolver) {
        var r = resolver.resolve(child.assetId);
        if (r.placeholder) errors.push(prefix + 'assetId_unresolved: ' + child.assetId);
      }
      if (!KNOWN_ACTOR_CATEGORIES[child.actorCategory]) {
        // warn, not block — categories can be extended
      }
      var o = child.offsetM || {};
      if (!isFinite(o.x) || !isFinite(o.y) || !isFinite(o.z)) errors.push(prefix + 'offset_not_finite');

      FORBIDDEN_CHILD_FIELDS.forEach(function (f) {
        if (child[f] !== undefined) errors.push(prefix + 'forbidden_field: ' + f);
      });
    });

    var b = comp.boundsM || {};
    if (!isFinite(b.widthM) || !isFinite(b.depthM) || !isFinite(b.heightM)) errors.push('bounds_not_finite');
    if (b.widthM > MAX_BOUNDS_M || b.depthM > MAX_BOUNDS_M) errors.push('bounds_exceed_1000m');

    return errors;
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  function list() {
    return Object.keys(_compositions).map(function (k) { return _compositions[k]; });
  }

  function get(compositionId) {
    return _compositions[compositionId] || null;
  }

  function createFromActors(actors, options) {
    options = options || {};
    var label    = options.label || 'Composition';
    var category = options.category || 'misc';
    var now      = new Date().toISOString();

    // Eligibility check
    var blocked = [];
    actors.forEach(function (a) {
      var reason = _checkActorEligible(a);
      if (reason) blocked.push({ objectId: a.objectId, reason: reason });
    });
    if (blocked.length) {
      _lastError = 'ineligible_actors';
      return { ok: false, reason: 'ineligible_actors', blocked: blocked };
    }
    if (!actors.length) {
      _lastError = 'no_actors';
      return { ok: false, reason: 'no_actors' };
    }

    var centroid     = _computeCentroid(actors);
    var compHeading  = 0;

    var children = actors.map(function (actor, i) {
      var offset2d = _latLonToOffsetM(actor.anchor.lat, actor.anchor.lon, centroid);
      var assetLabel = actor.meta && actor.meta.displayLabel ? actor.meta.displayLabel : (actor.assetId || '');
      return {
        childId:          'child_' + String(i + 1).padStart(3, '0'),
        assetId:          actor.assetId,
        actorCategory:    actor.actorCategory || 'prop',
        actorType:        actor.actorType || 'custom',
        displayLabel:     assetLabel,
        offsetM:          { x: Math.round(offset2d.x * 100) / 100,
                            y: Math.round(offset2d.y * 100) / 100,
                            z: Math.round((actor.anchor.altM || 0) * 100) / 100 },
        headingOffsetDeg: ((actor.anchor.headingDeg || 0) - compHeading + 360) % 360,
        scaleHint:        1,
      };
    });

    var bounds = _computeBoundsM(children);
    var id = _nextId(category, label);

    var rec = {
      id:     id,
      key:    id,
      label:  label,
      source: 'studio-composition',
      editable: true,
      category: category,
      tags:   ['composition', 'studio', category],

      composition: {
        version:    '1.0.0',
        anchorMode: 'centroid',
        childCount: children.length,
        boundsM:    bounds,
        children:   children,
      },

      authoring: {
        editable:  true,
        locked:    false,
        version:   '1.0.0',
        createdAt: now,
        updatedAt: now,
      },

      metadata: {},
    };

    var errs = _validateComposition(rec);
    if (errs.length) {
      _lastError = 'validation_failed: ' + errs.join(', ');
      return { ok: false, reason: 'validation_failed', errors: errs };
    }

    _compositions[id] = rec;
    _save();
    _lastError = null;
    return { ok: true, compositionId: id, record: rec };
  }

  function placeComposition(compositionId, anchor, options) {
    var rec = _compositions[compositionId];
    if (!rec) { _lastError = 'composition_not_found'; return { ok: false, reason: 'composition_not_found' }; }

    var errs = _validateComposition(rec);
    if (errs.length) {
      _lastError = 'composition_invalid: ' + errs.join(', ');
      return { ok: false, reason: 'composition_invalid', errors: errs };
    }

    var placementCtrl = global.WOSActorPlacementController;
    if (!placementCtrl || !placementCtrl.placeActorAt) {
      _lastError = 'placement_controller_unavailable';
      return { ok: false, reason: 'placement_controller_unavailable' };
    }

    anchor = anchor || { lat: 0, lon: 0, altM: 0, headingDeg: 0 };
    options = options || {};
    var compHeading = anchor.headingDeg || 0;
    var now         = new Date().toISOString();

    var childObjectIds = [];
    var failures       = [];

    rec.composition.children.forEach(function (child) {
      var ll      = _offsetMToLatLon({ x: child.offsetM.x, y: child.offsetM.y }, anchor);
      var altM    = (anchor.altM || 0) + (child.offsetM.z || 0);
      var heading = (compHeading + (child.headingOffsetDeg || 0)) % 360;

      var resolver = global.WOSAssetResolver;
      var defaults = resolver && resolver.resolvePlacementDefaults
        ? resolver.resolvePlacementDefaults(child.assetId)
        : { actorCategory: child.actorCategory || 'prop', actorType: child.actorType || 'custom', resolved: true };

      var manifest = {
        assetId:       child.assetId,
        actorCategory: defaults.actorCategory || child.actorCategory || 'prop',
        actorType:     defaults.actorType     || child.actorType     || 'custom',
        anchor: {
          lat:        ll.lat,
          lon:        ll.lon,
          altM:       altM,
          headingDeg: heading,
        },
        meta: {
          displayLabel: child.displayLabel || null,
        },
      };

      var result = placementCtrl.placeActorAt(manifest);
      if (result && result.ok && result.objectId) {
        childObjectIds.push(result.objectId);
      } else {
        failures.push({ childId: child.childId, reason: result ? result.reason : 'unknown' });
      }
    });

    // Record placement history (Studio-local only)
    if (!_history[compositionId]) _history[compositionId] = [];
    _history[compositionId].push({
      compositionId:   compositionId,
      placedAt:        now,
      childObjectIds:  childObjectIds,
    });
    _save();

    _lastError = failures.length ? 'partial_failures' : null;
    return {
      ok:              failures.length === 0,
      compositionId:   compositionId,
      childObjectIds:  childObjectIds,
      failures:        failures,
      placedAt:        now,
    };
  }

  function update(compositionId, patch) {
    var rec = _compositions[compositionId];
    if (!rec) { _lastError = 'composition_not_found'; return { ok: false, reason: 'composition_not_found' }; }
    if (!rec.editable || (rec.authoring && rec.authoring.locked)) {
      _lastError = 'composition_locked';
      return { ok: false, reason: 'composition_locked' };
    }
    if (patch.label !== undefined)    rec.label = patch.label;
    if (patch.category !== undefined) rec.category = patch.category;
    if (patch.metadata !== undefined) rec.metadata = Object.assign({}, rec.metadata, patch.metadata);
    rec.authoring.updatedAt = new Date().toISOString();
    _save();
    return { ok: true, compositionId: compositionId };
  }

  function fork(compositionId, options) {
    var src = _compositions[compositionId];
    if (!src) { _lastError = 'composition_not_found'; return { ok: false, reason: 'composition_not_found' }; }
    options  = options || {};
    var now  = new Date().toISOString();
    var label    = options.label || src.label + ' (Fork)';
    var category = options.category || src.category;
    var newId    = _nextId(category, label);

    var rec = JSON.parse(JSON.stringify(src));
    rec.id          = newId;
    rec.key         = newId;
    rec.label       = label;
    rec.category    = category;
    rec.tags        = ['composition', 'studio', category];
    rec.authoring   = { editable: true, locked: false, version: '1.0.0', createdAt: now, updatedAt: now };
    rec.metadata    = {};

    _compositions[newId] = rec;
    _save();
    return { ok: true, compositionId: newId, record: rec, forkedFrom: compositionId };
  }

  function remove(compositionId, options) {
    var rec = _compositions[compositionId];
    if (!rec) { _lastError = 'composition_not_found'; return { ok: false, reason: 'composition_not_found' }; }
    options = options || {};

    // Usage check — soft-block if placed children history exists and strict mode not bypassed
    if (!options.force) {
      var batches = _history[compositionId] || [];
      var activeBatches = batches.filter(function (b) { return b.childObjectIds && b.childObjectIds.length > 0; });
      if (activeBatches.length > 0) {
        var totalChildren = activeBatches.reduce(function (sum, b) { return sum + b.childObjectIds.length; }, 0);
        return {
          ok:      false,
          reason:  'has_placement_history',
          message: 'Composition has ' + activeBatches.length + ' placement batch(es) creating ' + totalChildren + ' child actor(s). Pass { force: true } to remove the recipe only (child actors are NOT removed).',
          batchCount:   activeBatches.length,
          childCount:   totalChildren,
        };
      }
    }

    delete _compositions[compositionId];
    // keep history for reference but mark recipe as removed
    if (_history[compositionId]) {
      delete _history[compositionId];
    }
    _save();
    _lastError = null;
    return { ok: true, compositionId: compositionId };
  }

  function exportOne(compositionId) {
    var rec = _compositions[compositionId];
    if (!rec) { _lastError = 'composition_not_found'; return { ok: false, reason: 'composition_not_found' }; }
    var payload = {};
    payload[compositionId] = JSON.parse(JSON.stringify(rec));
    return {
      ok: true,
      payload: {
        schema:     'wos.studio.compositions',
        version:    '1.0.0',
        exportedAt: new Date().toISOString(),
        compositions: payload,
      },
    };
  }

  function exportJSON() {
    var payload = {};
    Object.keys(_compositions).forEach(function (k) {
      payload[k] = JSON.parse(JSON.stringify(_compositions[k]));
    });
    return {
      schema:     'wos.studio.compositions',
      version:    '1.0.0',
      exportedAt: new Date().toISOString(),
      compositions: payload,
    };
  }

  function importJSON(payload, options) {
    options = options || {};
    if (!payload || payload.schema !== 'wos.studio.compositions') {
      _lastError = 'invalid_schema';
      return { ok: false, reason: 'invalid_schema' };
    }
    var comps = payload.compositions;
    if (!comps || typeof comps !== 'object') {
      _lastError = 'no_compositions';
      return { ok: false, reason: 'no_compositions' };
    }
    var imported = 0, skipped = 0, errors = [];
    Object.keys(comps).forEach(function (id) {
      var rec = comps[id];
      if (!rec || rec.source !== 'studio-composition') { skipped++; return; }
      if (_compositions[id] && !options.overwrite) { skipped++; return; }
      var errs = _validateComposition(rec);
      if (errs.length && !options.skipValidation) {
        errors.push({ id: id, errors: errs });
        skipped++;
        return;
      }
      _compositions[id] = rec;
      imported++;
    });
    if (imported > 0) _save();
    return { ok: true, imported: imported, skipped: skipped, errors: errors };
  }

  function usageSummary(compositionId) {
    var rec = _compositions[compositionId] || null;
    var batches = (_history[compositionId] || []);
    var lastPlacedAt = batches.length ? batches[batches.length - 1].placedAt : null;
    var allChildIds  = [];
    batches.forEach(function (b) { allChildIds = allChildIds.concat(b.childObjectIds || []); });
    return {
      compositionId:     compositionId,
      exists:            !!rec,
      childCount:        rec ? rec.composition.childCount : 0,
      placedCount:       batches.length,
      lastPlacedAt:      lastPlacedAt,
      placementBatchIds: batches.map(function (b) { return b.placedAt; }),
    };
  }

  function getSnapshot() {
    return {
      compositionCount: Object.keys(_compositions).length,
      compositions:     list().map(function (r) {
        return { id: r.id, label: r.label, category: r.category, childCount: r.composition.childCount };
      }),
      historyCount:     Object.keys(_history).length,
      lastError:        _lastError,
    };
  }

  // ── Boot ──────────────────────────────────────────────────────────────────────

  _load();

  global.WOSCompositionStore = {
    list:               list,
    get:                get,
    createFromActors:   createFromActors,
    placeComposition:   placeComposition,
    update:             update,
    fork:               fork,
    remove:             remove,
    exportOne:          exportOne,
    exportJSON:         exportJSON,
    importJSON:         importJSON,
    usageSummary:       usageSummary,
    getSnapshot:        getSnapshot,
  };

  console.log('[CompositionStore] ready — 0616K');
})(window);
