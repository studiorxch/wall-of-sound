// ── WOS Building Texture Assignment Controller ────────────────────────────────
// 0618B_WOS_BuildingTexturePackageAuthoringPass_v1.0.0_BUILD
//
// Manages per-building texture package assignments.
// Assignments are building-scoped, not actor-scoped.
//
// buildingKey format: '<sourceId>|<sourceLayer>|<featureId>'
//
// Storage key: wos.studio.buildingTextureAssignments.v1
// ─────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var STORAGE_KEY = 'wos.studio.buildingTextureAssignments.v1';

  var _assignments = {};  // buildingKey → assignment record
  var _lastError   = null;

  // ── Persistence ───────────────────────────────────────────────────────────────
  function _save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_assignments)); } catch (e) {}
  }

  function _load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') _assignments = parsed;
    } catch (e) {}
  }

  // ── buildingKey helper ────────────────────────────────────────────────────────
  function buildingKey(selection) {
    if (!selection) return null;
    var sid = selection.sourceId    || 'composite';
    var sl  = selection.sourceLayer || 'building';
    var fid = selection.featureId   || '';
    if (!fid) return null;
    return sid + '|' + sl + '|' + fid;
  }

  // ── assign(selection, slotName, packageId, slotOpts) ─────────────────────────
  // Creates or updates an assignment for one slot on a selected building.
  // slotOpts: { textureRole, repeat, rotationDeg, opacity, blendMode }
  function assign(selection, slotName, packageId, slotOpts) {
    _lastError = null;
    var key = buildingKey(selection);
    if (!key) return { ok: false, reason: 'invalid_selection' };

    var store = global.WOSBuildingTexturePackageStore;
    if (store && !store.has(packageId)) {
      return { ok: false, reason: 'package_not_found: ' + packageId };
    }

    slotOpts = slotOpts || {};
    var slotRecord = {
      packageId:   packageId,
      textureRole: slotOpts.textureRole  || 'baseColor',
      repeat:      slotOpts.repeat       || { x: 1, y: 1 },
      rotationDeg: slotOpts.rotationDeg  != null ? slotOpts.rotationDeg  : 0,
      opacity:     slotOpts.opacity      != null ? slotOpts.opacity      : 1,
      blendMode:   slotOpts.blendMode    || 'multiply',
    };

    var existing = _assignments[key];
    if (existing) {
      existing.slots                = existing.slots || {};
      existing.slots[slotName]      = slotRecord;
      existing.updatedAt            = new Date().toISOString();
    } else {
      var assignmentId = 'building.texture.assign.' +
        (selection.featureId || 'unknown') + '.' + packageId.slice(-6);
      _assignments[key] = {
        assignmentId: assignmentId,
        buildingKey:  key,
        packageId:    packageId,
        target: {
          sourceId:    selection.sourceId    || 'composite',
          sourceLayer: selection.sourceLayer || 'building',
          featureId:   String(selection.featureId || ''),
          centroid:    selection.centroid    || { lat: 0, lon: 0 },
        },
        slots:     {},
        authoredAt: new Date().toISOString(),
        updatedAt:  new Date().toISOString(),
      };
      _assignments[key].slots[slotName] = slotRecord;
    }
    _save();
    return { ok: true, buildingKey: key, assignmentId: _assignments[key].assignmentId };
  }

  // ── removeSlot(selection, slotName) ──────────────────────────────────────────
  function removeSlot(selection, slotName) {
    var key = buildingKey(selection);
    if (!key || !_assignments[key]) return { ok: false, reason: 'not_found' };
    var a = _assignments[key];
    if (a.slots) delete a.slots[slotName];
    if (!Object.keys(a.slots || {}).length) {
      delete _assignments[key];
    } else {
      a.updatedAt = new Date().toISOString();
    }
    _save();
    return { ok: true };
  }

  // ── clearBuilding(selection) ──────────────────────────────────────────────────
  function clearBuilding(selection) {
    var key = buildingKey(selection);
    if (!key || !_assignments[key]) return { ok: false, reason: 'not_found' };
    delete _assignments[key];
    _save();
    return { ok: true };
  }

  function getForBuilding(selection) {
    var key = buildingKey(selection);
    return key ? (_assignments[key] || null) : null;
  }

  function get(key)  { return _assignments[key] || null; }
  function has(key)  { return Object.prototype.hasOwnProperty.call(_assignments, key); }
  function list()    { return Object.keys(_assignments).map(function (k) { return _assignments[k]; }); }

  // getForBundle(usedPackageIds) — sanitized, no binary/objectUrl
  // Returns { assignments, referencedPackageIds }
  function getForBundle(usedPackageIds) {
    var seen = {};
    (usedPackageIds || []).forEach(function (id) { seen[id] = true; });

    var assignments = [];
    var refIds = {};

    Object.keys(_assignments).forEach(function (key) {
      var a = _assignments[key];
      var slots = a.slots || {};
      var hasEligibleSlot = Object.keys(slots).some(function (s) {
        return seen[slots[s].packageId];
      });
      if (!hasEligibleSlot) return;

      var sanitizedSlots = {};
      Object.keys(slots).forEach(function (s) {
        var slot = slots[s];
        if (!seen[slot.packageId]) return;
        sanitizedSlots[s] = {
          packageId:   slot.packageId,
          textureRole: slot.textureRole,
          repeat:      slot.repeat,
          rotationDeg: slot.rotationDeg,
          opacity:     slot.opacity,
          blendMode:   slot.blendMode,
        };
        refIds[slot.packageId] = true;
      });

      assignments.push({
        buildingKey: key,
        target: {
          sourceId:    a.target.sourceId,
          sourceLayer: a.target.sourceLayer,
          featureId:   a.target.featureId,
          centroid:    a.target.centroid,
        },
        slots: sanitizedSlots,
      });
    });

    return { assignments: assignments, referencedPackageIds: Object.keys(refIds) };
  }

  function getSnapshot() {
    return {
      enabled:         true,
      assignmentCount: Object.keys(_assignments).length,
      lastError:       _lastError,
    };
  }

  _load();

  global.WOSBuildingTextureAssignmentController = {
    buildingKey:    buildingKey,
    assign:         assign,
    removeSlot:     removeSlot,
    clearBuilding:  clearBuilding,
    getForBuilding: getForBuilding,
    get:            get,
    has:            has,
    list:           list,
    getForBundle:   getForBundle,
    getSnapshot:    getSnapshot,
  };

  console.log('[WOSBuildingTextureAssignmentController] ready — 0618B | ' +
    Object.keys(_assignments).length + ' assignment(s)');
})(window);
