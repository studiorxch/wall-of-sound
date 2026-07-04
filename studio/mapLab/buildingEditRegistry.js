// ── MapLab — Building Edit Registry v1.7.0 ───────────────────────────────────
// 0612C_WOS_ExistingReplacementRuntimeSyncRepair_v1.0.0_BUILD
// Prior: 0610M_WOS_SourceBuildingHideAuthority_v1.0.0_BUILD
// Prior: 0610L_WOS_ReplacementDeleteAuthority_v1.0.0_BUILD
// Prior: 0610K_WOS_CompoundBuildingAuthority_v1.0.0_BUILD
// Prior: 0610J_WOS_ReplacementBuildingGroupAuthority_v1.0.0_BUILD
// Prior: 0610D_WOS_ReplacementGeometryAlignmentAudit_v1.0.0
// Prior: 0609U_WOS_BuildingReplacementProjection
// Status: active | Classification: studio-maplab
//
// v1.6.0 — source hide authority (0610M): adds hideSourceBuilding(),
//           restoreSourceBuilding(), isSourceHidden(), getHiddenKeys().
//           Persists hidden: true on untouched Mapbox source buildings so
//           Studio Preview and Wall can suppress them visually.
// v1.5.0 — delete authority (0610L): adds deleteSelectedTarget(buildingKey) —
//           hierarchy-aware deletion (compound > group > standalone). Never throws.
// v1.4.0 — compound buildings (0610K): adds optional top-level compounds
//           collection. Compounds sit above groups in authority. Adds
//           createCompound(), deleteCompound(), getCompound(), getCompounds(),
//           findCompoundByMember(), addMemberToCompound(),
//           removeMemberFromCompound(), setCompoundReplacement(), setCompoundMeta().
// v1.3.0 — building groups: adds optional top-level groups collection to the
//           manifest. A group combines multiple source features into one
//           replacement target with combined geometry. Adds createGroup(),
//           deleteGroup(), getGroup(), getGroups(), findGroupByMember(),
//           addMemberToGroup(), removeMemberFromGroup(), setGroupReplacement().
//           Updates load(), clear(), importJSON() to handle groups field.
//           Backward-compatible: old manifests without groups continue to work.
// v1.2.0 — geometry persistence: isEmpty guard updated to preserve entries that
//           carry a geometry snapshot (edit.geometry.centroid present) even with
//           no other edit fields. Geometry is additive and backward-compatible;
//           old manifests without geometry continue to work.
// v1.1.0 — replacement field: validation, normalization, isEmpty guard.
//           Adds VALID_ARCHETYPES / VALID_HEIGHT_MODES constants and
//           normalizeReplacement() to the public API.
// v1.0.0 — initial persistence (color, hidden, notes, tags).
//
// Storage key : wos.maplab.buildings
// Key format  : source:sourceLayer:featureId  (e.g. "composite:building:248143639")
// Group ID    : group_<sortedFeatureIds>       (e.g. "group_248143639_956471671")
// Compound ID : compound_<slug>_<shortHash>    (e.g. "compound_castle_clinton_a93f2c")
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var STORAGE_KEY     = 'wos.maplab.buildings';
  var SCHEMA_VERSION  = '1.0.0';

  var VALID_ARCHETYPES = [
    'warehouse', 'skyscraper', 'apartment', 'radio-tower',
    'pagoda', 'civic-block', 'industrial-stack', 'custom-placeholder',
  ];

  var VALID_HEIGHT_MODES = ['inherit', 'low', 'medium', 'tall', 'hero'];

  // Valid compound kinds
  var VALID_COMPOUND_KINDS = ['landmark', 'building', 'campus', 'pier', 'station', 'custom'];

  // Live data store — replaced wholesale on importJSON / load.
  var _data = { version: SCHEMA_VERSION, buildings: {}, groups: {}, compounds: {} };

  // ── Key helpers ───────────────────────────────────────────────────────────────

  // buildingKey(feature) → "composite:building:248143639" | null
  // Accepts raw Mapbox feature objects and normalized MapSelection objects
  // (both expose .source, .sourceLayer, .id).
  function buildingKey(feature) {
    if (!feature) return null;
    var src = feature.source      || 'composite';
    var sl  = feature.sourceLayer || 'building';
    var id  = feature.id != null  ? String(feature.id) : null;
    if (!id) return null;
    return src + ':' + sl + ':' + id;
  }

  // parseKey(key) → { source, sourceLayer, featureId } | null
  function parseKey(key) {
    if (!key || typeof key !== 'string') return null;
    var idx1 = key.indexOf(':');
    if (idx1 === -1) return null;
    var idx2 = key.indexOf(':', idx1 + 1);
    if (idx2 === -1) return null;
    return {
      source:      key.slice(0, idx1),
      sourceLayer: key.slice(idx1 + 1, idx2),
      featureId:   key.slice(idx2 + 1),
    };
  }

  // ── Group identity helpers ────────────────────────────────────────────────────

  // _groupIdFromMembers — deterministic group ID from sorted member key feature IDs.
  // e.g. ["composite:building:956471671","composite:building:278053568"]
  //   → "group_278053568_956471671"
  function _groupIdFromMembers(memberKeys) {
    var ids = memberKeys.map(function (k) {
      var last = k.lastIndexOf(':');
      return last >= 0 ? k.slice(last + 1) : k;
    }).sort();
    return 'group_' + ids.join('_');
  }

  // _computeGroupGeometry — derives combined axis-aligned bounds from member geometries.
  // Returns null if no member has a valid geometry snapshot.
  function _computeGroupGeometry(memberKeys) {
    var geoms = [];
    for (var i = 0; i < memberKeys.length; i++) {
      var edit = _data.buildings[memberKeys[i]];
      var g = edit && edit.geometry;
      if (!g || !g.centroid ||
          typeof g.centroid.lng !== 'number' ||
          typeof g.centroid.lat !== 'number') continue;
      geoms.push(g);
    }
    if (!geoms.length) return null;

    var minLng = Infinity, maxLng = -Infinity;
    var minLat = Infinity, maxLat = -Infinity;
    var sumLng = 0, sumLat = 0;
    var totalArea  = 0;
    var domGeom    = null;
    var domArea    = 0;

    for (var j = 0; j < geoms.length; j++) {
      var g = geoms[j];
      var cosLat = Math.cos(g.centroid.lat * Math.PI / 180) || 0.0001;
      var hw     = (typeof g.widthM === 'number' ? g.widthM : 0) / 2 / (111320 * cosLat);
      var hd     = (typeof g.depthM === 'number' ? g.depthM : 0) / 2 / 111320;
      if (g.centroid.lng - hw < minLng) minLng = g.centroid.lng - hw;
      if (g.centroid.lng + hw > maxLng) maxLng = g.centroid.lng + hw;
      if (g.centroid.lat - hd < minLat) minLat = g.centroid.lat - hd;
      if (g.centroid.lat + hd > maxLat) maxLat = g.centroid.lat + hd;
      sumLng    += g.centroid.lng;
      sumLat    += g.centroid.lat;
      var area   = typeof g.areaM2 === 'number' ? g.areaM2 : 0;
      totalArea += area;
      if (area > domArea) { domArea = area; domGeom = g; }
    }

    var centroid = { lng: sumLng / geoms.length, lat: sumLat / geoms.length };
    var cosLatC  = Math.cos(centroid.lat * Math.PI / 180) || 0.0001;
    var widthM   = (maxLng - minLng) * 111320 * cosLatC;
    var depthM   = (maxLat - minLat) * 111320;

    return {
      source:      'studio-maplab-group',
      centroid:    centroid,
      bounds:      { minLng: minLng, maxLng: maxLng, minLat: minLat, maxLat: maxLat },
      widthM:      Math.max(4, widthM),
      depthM:      Math.max(4, depthM),
      areaM2:      totalArea,
      heading:     domGeom ? (typeof domGeom.heading === 'number' ? domGeom.heading : 0) : 0,
      memberCount: geoms.length,
      capturedAt:  Date.now(),
    };
  }

  // ── Compound identity helpers (0610K) ────────────────────────────────────────

  // _compoundIdFromName — generates compound_<slug>_<shortHash> from a display name.
  // The hash incorporates the name + current ms so IDs are always unique.
  function _compoundIdFromName(name) {
    var slug = String(name || 'compound').toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 24) || 'compound';
    // djb2-style hash over name + timestamp
    var src = String(name || '') + String(Date.now());
    var h   = 5381;
    for (var i = 0; i < src.length; i++) {
      h = ((h * 33) ^ src.charCodeAt(i)) >>> 0;
    }
    return 'compound_' + slug + '_' + h.toString(16).slice(0, 6);
  }

  // _isGroupId — returns true when a member string looks like a group ID.
  function _isGroupId(member) {
    return typeof member === 'string' && member.indexOf('group_') === 0;
  }

  // _computeCompoundGeometry — combines geometry from building keys AND group IDs.
  // Uses the same axis-aligned bounds logic as _computeGroupGeometry but also
  // reads from _data.groups[member].geometry for group-type members.
  function _computeCompoundGeometry(members) {
    if (!Array.isArray(members)) return null;
    var geoms = [];
    for (var i = 0; i < members.length; i++) {
      var m = members[i];
      if (!m) continue;
      var g = null;
      if (_isGroupId(m)) {
        var grp = _data.groups && _data.groups[m];
        g = grp && grp.geometry;
      } else {
        var edit = _data.buildings && _data.buildings[m];
        g = edit && edit.geometry;
      }
      if (!g || !g.centroid ||
          typeof g.centroid.lng !== 'number' ||
          typeof g.centroid.lat !== 'number') continue;
      geoms.push(g);
    }
    if (!geoms.length) return null;

    var minLng = Infinity, maxLng = -Infinity;
    var minLat = Infinity, maxLat = -Infinity;
    var sumLng = 0, sumLat = 0;
    var totalArea = 0;
    var domGeom   = null;
    var domArea   = 0;

    for (var j = 0; j < geoms.length; j++) {
      var g2 = geoms[j];
      var cosLat = Math.cos(g2.centroid.lat * Math.PI / 180) || 0.0001;
      var hw     = (typeof g2.widthM === 'number' ? g2.widthM : 0) / 2 / (111320 * cosLat);
      var hd     = (typeof g2.depthM === 'number' ? g2.depthM : 0) / 2 / 111320;
      if (g2.centroid.lng - hw < minLng) minLng = g2.centroid.lng - hw;
      if (g2.centroid.lng + hw > maxLng) maxLng = g2.centroid.lng + hw;
      if (g2.centroid.lat - hd < minLat) minLat = g2.centroid.lat - hd;
      if (g2.centroid.lat + hd > maxLat) maxLat = g2.centroid.lat + hd;
      sumLng    += g2.centroid.lng;
      sumLat    += g2.centroid.lat;
      var area   = typeof g2.areaM2 === 'number' ? g2.areaM2 : 0;
      totalArea += area;
      if (area > domArea) { domArea = area; domGeom = g2; }
    }

    var centroid = { lng: sumLng / geoms.length, lat: sumLat / geoms.length };
    var cosLatC  = Math.cos(centroid.lat * Math.PI / 180) || 0.0001;
    var widthM   = (maxLng - minLng) * 111320 * cosLatC;
    var depthM   = (maxLat - minLat) * 111320;

    return {
      source:      'studio-maplab-compound',
      centroid:    centroid,
      bounds:      { minLng: minLng, maxLng: maxLng, minLat: minLat, maxLat: maxLat },
      widthM:      Math.max(4, widthM),
      depthM:      Math.max(4, depthM),
      areaM2:      totalArea,
      heading:     domGeom ? (typeof domGeom.heading === 'number' ? domGeom.heading : 0) : 0,
      memberCount: geoms.length,
      capturedAt:  Date.now(),
    };
  }

  // ── Replacement normalization ─────────────────────────────────────────────────

  // normalizeReplacement(r) — validates and normalizes a replacement object.
  // Invalid archetype → 'custom-placeholder'. Invalid heightMode → 'inherit'.
  // Returns null if input is not an object.
  function normalizeReplacement(r) {
    if (!r || typeof r !== 'object') return null;
    var archetype = (typeof r.archetype === 'string' && VALID_ARCHETYPES.indexOf(r.archetype) !== -1)
      ? r.archetype : 'custom-placeholder';
    var heightMode = (typeof r.heightMode === 'string' && VALID_HEIGHT_MODES.indexOf(r.heightMode) !== -1)
      ? r.heightMode : 'inherit';
    var scale = (typeof r.scale === 'number' && isFinite(r.scale) && r.scale > 0) ? r.scale : 1;
    return {
      enabled:    !!(r.enabled),
      archetype:  archetype,
      label:      (typeof r.label === 'string') ? r.label.slice(0, 64) : archetype,
      style:      (typeof r.style === 'string')  ? r.style.slice(0, 64) : '',
      scale:      scale,
      heightMode: heightMode,
    };
  }

  // ── Persistence ───────────────────────────────────────────────────────────────

  // load() — reads from localStorage; resets to empty on corrupt data.
  // Returns true on success, false on parse failure.
  function load() {
    try {
      var raw = global.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        _data = { version: SCHEMA_VERSION, buildings: {} };
        return true;
      }
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.buildings !== 'object') {
        console.warn('[BuildingEditRegistry] invalid schema — resetting');
        _data = { version: SCHEMA_VERSION, buildings: {} };
        return false;
      }
      _data = {
        version:   parsed.version || SCHEMA_VERSION,
        buildings: parsed.buildings,
        groups:    (parsed.groups    && typeof parsed.groups    === 'object') ? parsed.groups    : {},
        compounds: (parsed.compounds && typeof parsed.compounds === 'object') ? parsed.compounds : {},
      };
      var count  = Object.keys(_data.buildings).length;
      var gcount = Object.keys(_data.groups).length;
      var ccount = Object.keys(_data.compounds).length;
      if (count || gcount || ccount) console.log('[BuildingEditRegistry] loaded', count, 'building edit(s),', gcount, 'group(s),', ccount, 'compound(s)');
      return true;
    } catch (e) {
      console.warn('[BuildingEditRegistry] load failed (corrupt JSON):', e.message || e);
      _data = { version: SCHEMA_VERSION, buildings: {} };
      return false;
    }
  }

  // notifyReplacementRuntimeChanged — fires a same-window CustomEvent so
  // BuildingReplacementRuntime can reload without waiting for a cross-tab
  // storage event (same-document localStorage writes do not trigger storage).
  // Also calls the runtime reload directly if it is loaded in this window.
  function notifyReplacementRuntimeChanged(buildingKey) {
    try {
      global.dispatchEvent(new CustomEvent('wos:building-replacement-edit', {
        detail: { buildingKey: buildingKey || null, at: Date.now() },
      }));
    } catch (e) {}
    // Direct same-window reload — avoids the debounce delay for immediate feedback
    try {
      var rt = global.SBE && global.SBE.BuildingReplacementRuntime;
      if (rt && typeof rt.reload === 'function') rt.reload();
    } catch (e) {}
  }

  // save() — writes current state to localStorage and notifies the replacement runtime.
  function save() {
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(_data));
      notifyReplacementRuntimeChanged();
      return true;
    } catch (e) {
      console.warn('[BuildingEditRegistry] save failed:', e.message || e);
      return false;
    }
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────────

  // get(key) → edit object copy | null
  function get(key) {
    if (!key || !_data.buildings[key]) return null;
    return Object.assign({}, _data.buildings[key]);
  }

  // getAll() → shallow copy of the buildings map
  function getAll() {
    var out = {};
    Object.keys(_data.buildings).forEach(function (k) {
      out[k] = Object.assign({}, _data.buildings[k]);
    });
    return out;
  }

  // set(key, patch) — merges patch into the edit for key; validates replacement;
  // auto-cleans no-op entries. Returns true if saved successfully.
  function set(key, patch) {
    if (!key || !patch || typeof patch !== 'object') return false;
    var existing = _data.buildings[key] || {
      color:       null,
      hidden:      false,
      tags:        [],
      notes:       '',
      replacement: null,
    };
    var merged = Object.assign({}, existing, patch);

    // Validate / normalize replacement if present in patch
    if (Object.prototype.hasOwnProperty.call(patch, 'replacement')) {
      if (patch.replacement === null || patch.replacement === undefined) {
        merged.replacement = null;
      } else {
        merged.replacement = normalizeReplacement(patch.replacement);
      }
    }

    // Auto-remove entries with no meaningful data.
    // 0610D: geometry snapshot is also meaningful — preserve entries that have
    // valid geometry even if no color/replacement/hidden/notes/tags are set.
    var hasReplacement = !!(merged.replacement && merged.replacement.enabled);
    var hasGeometry    = !!(merged.geometry && merged.geometry.centroid);
    var isEmpty = !merged.color && !merged.hidden &&
                  !(merged.tags && merged.tags.length) && !merged.notes &&
                  !hasReplacement && !hasGeometry;
    if (isEmpty) {
      delete _data.buildings[key];
    } else {
      _data.buildings[key] = merged;
    }
    return save();
  }

  // remove(key) — deletes the edit for key (reset to defaults).
  function remove(key) {
    if (!key || !_data.buildings[key]) return false;
    delete _data.buildings[key];
    return save();
  }

  // clear() — removes all building edits, groups, and compounds.
  function clear() {
    _data = { version: SCHEMA_VERSION, buildings: {}, groups: {}, compounds: {} };
    return save();
  }

  // ── Export / Import ───────────────────────────────────────────────────────────

  // exportJSON() → pretty-printed JSON string of the full manifest.
  function exportJSON() {
    return JSON.stringify(_data, null, 2);
  }

  // importJSON(json) → { ok, count } | { ok: false, reason }
  // Replaces all current edits with the imported data.
  function importJSON(json) {
    try {
      var parsed = JSON.parse(json);
      if (!parsed || typeof parsed.buildings !== 'object') {
        return { ok: false, reason: 'invalid_schema' };
      }
      _data = {
        version:   parsed.version || SCHEMA_VERSION,
        buildings: parsed.buildings,
        groups:    (parsed.groups    && typeof parsed.groups    === 'object') ? parsed.groups    : {},
        compounds: (parsed.compounds && typeof parsed.compounds === 'object') ? parsed.compounds : {},
      };
      save();
      var count  = Object.keys(_data.buildings).length;
      var gcount = Object.keys(_data.groups).length;
      var ccount = Object.keys(_data.compounds).length;
      console.log('[BuildingEditRegistry] imported', count, 'building edit(s),', gcount, 'group(s),', ccount, 'compound(s)');
      return { ok: true, count: count, groupCount: gcount, compoundCount: ccount };
    } catch (e) {
      console.warn('[BuildingEditRegistry] importJSON failed:', e.message || e);
      return { ok: false, reason: String(e.message || e) };
    }
  }

  // ── Group CRUD ────────────────────────────────────────────────────────────────

  // createGroup(memberKeys) — creates a new group from the given building keys.
  // Computes combined geometry from member geometry snapshots.
  // Returns the new groupId on success, or null if memberKeys < 2 or invalid.
  function createGroup(memberKeys) {
    if (!Array.isArray(memberKeys) || memberKeys.length < 2) {
      console.warn('[BuildingEditRegistry] createGroup: need at least 2 member keys');
      return null;
    }
    // Deduplicate
    var seen = {}, unique = [];
    for (var i = 0; i < memberKeys.length; i++) {
      if (typeof memberKeys[i] === 'string' && !seen[memberKeys[i]]) {
        seen[memberKeys[i]] = true;
        unique.push(memberKeys[i]);
      }
    }
    if (unique.length < 2) return null;

    var groupId = _groupIdFromMembers(unique);
    if (!_data.groups) _data.groups = {};

    // If group already exists, merge members
    var existing = _data.groups[groupId];
    if (existing) {
      // Update members and recompute geometry
      existing.members = unique;
      existing.geometry = _computeGroupGeometry(unique) || existing.geometry;
      save();
      return groupId;
    }

    var geom = _computeGroupGeometry(unique);
    _data.groups[groupId] = {
      id:          groupId,
      members:     unique,
      replacement: null,
      geometry:    geom,
      notes:       '',
      tags:        [],
    };
    save();
    console.log('[BuildingEditRegistry] createGroup:', groupId, '(' + unique.length + ' members)');
    return groupId;
  }

  // deleteGroup(groupId) — removes a group entirely.
  function deleteGroup(groupId) {
    if (!groupId || !_data.groups || !_data.groups[groupId]) return false;
    delete _data.groups[groupId];
    save();
    console.log('[BuildingEditRegistry] deleteGroup:', groupId);
    return true;
  }

  // getGroup(groupId) → shallow copy of group | null
  function getGroup(groupId) {
    if (!groupId || !_data.groups || !_data.groups[groupId]) return null;
    var g = _data.groups[groupId];
    return {
      id:          g.id,
      members:     (g.members || []).slice(),
      replacement: g.replacement ? Object.assign({}, g.replacement) : null,
      geometry:    g.geometry    ? Object.assign({}, g.geometry)    : null,
      notes:       g.notes  || '',
      tags:        (g.tags  || []).slice(),
    };
  }

  // getGroups() → { [groupId]: groupCopy }
  function getGroups() {
    var out = {};
    var groups = _data.groups || {};
    Object.keys(groups).forEach(function (gid) {
      out[gid] = getGroup(gid);
    });
    return out;
  }

  // findGroupByMember(memberKey) → groupId | null
  function findGroupByMember(memberKey) {
    if (!memberKey || !_data.groups) return null;
    var gids = Object.keys(_data.groups);
    for (var i = 0; i < gids.length; i++) {
      var g = _data.groups[gids[i]];
      if (g && Array.isArray(g.members) && g.members.indexOf(memberKey) !== -1) {
        return gids[i];
      }
    }
    return null;
  }

  // addMemberToGroup(groupId, memberKey) — adds a member and recomputes geometry.
  function addMemberToGroup(groupId, memberKey) {
    if (!groupId || !memberKey || !_data.groups || !_data.groups[groupId]) return false;
    var g = _data.groups[groupId];
    if (!Array.isArray(g.members)) g.members = [];
    if (g.members.indexOf(memberKey) !== -1) return true; // already present
    g.members.push(memberKey);
    g.geometry = _computeGroupGeometry(g.members) || g.geometry;
    save();
    return true;
  }

  // removeMemberFromGroup(groupId, memberKey) — removes a member. Auto-deletes the
  // group if fewer than 2 members remain.
  function removeMemberFromGroup(groupId, memberKey) {
    if (!groupId || !memberKey || !_data.groups || !_data.groups[groupId]) return false;
    var g = _data.groups[groupId];
    if (!Array.isArray(g.members)) return false;
    var idx = g.members.indexOf(memberKey);
    if (idx === -1) return false;
    g.members.splice(idx, 1);
    if (g.members.length < 2) {
      delete _data.groups[groupId];
      console.log('[BuildingEditRegistry] removeMemberFromGroup: group auto-deleted (< 2 members)');
    } else {
      g.geometry = _computeGroupGeometry(g.members) || g.geometry;
    }
    save();
    return true;
  }

  // setGroupReplacement(groupId, replacement) — sets or updates the replacement
  // config for a group. Normalizes with normalizeReplacement().
  function setGroupReplacement(groupId, replacement) {
    if (!groupId || !_data.groups || !_data.groups[groupId]) return false;
    var g = _data.groups[groupId];
    if (replacement === null || replacement === undefined) {
      g.replacement = null;
    } else {
      g.replacement = normalizeReplacement(replacement);
    }
    save();
    return true;
  }

  // ── Compound CRUD (0610K) ─────────────────────────────────────────────────────

  // createCompound({ name, kind, members }) — creates a new compound.
  // members: array of building keys and/or group IDs.
  // Requires at least 2 members. Deduplicates member list automatically.
  // Returns compoundId on success, or null on validation failure.
  function createCompound(opts) {
    try {
      var name    = (opts && typeof opts.name    === 'string') ? opts.name.trim()  : '';
      var kind    = (opts && typeof opts.kind    === 'string') ? opts.kind         : 'custom';
      var members = (opts && Array.isArray(opts.members))      ? opts.members      : [];

      if (VALID_COMPOUND_KINDS.indexOf(kind) === -1) kind = 'custom';

      // Deduplicate
      var seen   = {};
      var unique = [];
      for (var i = 0; i < members.length; i++) {
        var m = members[i];
        if (!m || typeof m !== 'string') continue;
        if (!seen[m]) { seen[m] = true; unique.push(m); }
      }
      if (unique.length < 2) {
        console.warn('[BuildingEditRegistry] createCompound: need at least 2 members');
        return null;
      }

      if (!name) name = 'Compound';
      var compoundId = _compoundIdFromName(name);
      var geometry   = _computeCompoundGeometry(unique);

      if (!_data.compounds) _data.compounds = {};
      _data.compounds[compoundId] = {
        id:          compoundId,
        name:        name,
        kind:        kind,
        members:     unique,
        replacement: null,
        geometry:    geometry,
        notes:       '',
        tags:        [],
        createdAt:   Date.now(),
      };

      save();
      console.log('[BuildingEditRegistry] createCompound:', compoundId, '(' + unique.length + ' members)');
      return compoundId;
    } catch (e) {
      console.warn('[BuildingEditRegistry] createCompound error:', e.message || e);
      return null;
    }
  }

  // deleteCompound(compoundId) — removes the compound without touching buildings/groups.
  function deleteCompound(compoundId) {
    if (!compoundId || !(_data.compounds && _data.compounds[compoundId])) return false;
    delete _data.compounds[compoundId];
    save();
    console.log('[BuildingEditRegistry] deleteCompound:', compoundId);
    return true;
  }

  // getCompound(compoundId) → shallow copy | null
  function getCompound(compoundId) {
    var c = _data.compounds && _data.compounds[compoundId];
    if (!c) return null;
    return {
      id:          c.id,
      name:        c.name,
      kind:        c.kind,
      members:     c.members ? c.members.slice() : [],
      replacement: c.replacement ? Object.assign({}, c.replacement) : null,
      geometry:    c.geometry    ? Object.assign({}, c.geometry)    : null,
      notes:       c.notes  || '',
      tags:        c.tags   ? c.tags.slice() : [],
      createdAt:   c.createdAt || 0,
    };
  }

  // getCompounds() → { [compoundId]: compoundCopy }
  function getCompounds() {
    var out = {};
    if (!_data.compounds) return out;
    var ids = Object.keys(_data.compounds);
    for (var i = 0; i < ids.length; i++) out[ids[i]] = getCompound(ids[i]);
    return out;
  }

  // findCompoundByMember(memberKeyOrGroupId) → compoundId | null
  function findCompoundByMember(member) {
    if (!member || !_data.compounds) return null;
    var ids = Object.keys(_data.compounds);
    for (var i = 0; i < ids.length; i++) {
      var c = _data.compounds[ids[i]];
      if (!c || !Array.isArray(c.members)) continue;
      for (var j = 0; j < c.members.length; j++) {
        if (c.members[j] === member) return ids[i];
      }
    }
    return null;
  }

  // addMemberToCompound(compoundId, memberKeyOrGroupId) — adds a member.
  // Returns true on success, false if already a member or not found.
  function addMemberToCompound(compoundId, member) {
    try {
      var c = _data.compounds && _data.compounds[compoundId];
      if (!c || !member || typeof member !== 'string') return false;
      if (!Array.isArray(c.members)) c.members = [];
      for (var i = 0; i < c.members.length; i++) {
        if (c.members[i] === member) return false; // already present
      }
      c.members.push(member);
      c.geometry = _computeCompoundGeometry(c.members);
      return save();
    } catch (e) {
      console.warn('[BuildingEditRegistry] addMemberToCompound error:', e.message || e);
      return false;
    }
  }

  // removeMemberFromCompound(compoundId, memberKeyOrGroupId) — removes a member.
  // Auto-deletes the compound if fewer than 2 members remain.
  function removeMemberFromCompound(compoundId, member) {
    try {
      var c = _data.compounds && _data.compounds[compoundId];
      if (!c || !Array.isArray(c.members)) return false;
      var idx = c.members.indexOf(member);
      if (idx === -1) return false;
      c.members.splice(idx, 1);
      if (c.members.length < 2) {
        console.log('[BuildingEditRegistry] removeMemberFromCompound: auto-deleting compound', compoundId, '(< 2 members)');
        delete _data.compounds[compoundId];
      } else {
        c.geometry = _computeCompoundGeometry(c.members);
      }
      return save();
    } catch (e) {
      console.warn('[BuildingEditRegistry] removeMemberFromCompound error:', e.message || e);
      return false;
    }
  }

  // setCompoundReplacement(compoundId, replacement) — sets or updates replacement.
  function setCompoundReplacement(compoundId, replacement) {
    try {
      var c = _data.compounds && _data.compounds[compoundId];
      if (!c) return false;
      if (replacement === null || replacement === undefined) {
        c.replacement = null;
      } else {
        c.replacement = normalizeReplacement(replacement);
      }
      return save();
    } catch (e) {
      console.warn('[BuildingEditRegistry] setCompoundReplacement error:', e.message || e);
      return false;
    }
  }

  // setCompoundMeta(compoundId, { name, kind, notes, tags }) — updates display metadata.
  function setCompoundMeta(compoundId, meta) {
    try {
      var c = _data.compounds && _data.compounds[compoundId];
      if (!c || !meta) return false;
      if (typeof meta.name  === 'string') c.name  = meta.name.trim() || c.name;
      if (typeof meta.kind  === 'string') {
        c.kind = VALID_COMPOUND_KINDS.indexOf(meta.kind) !== -1 ? meta.kind : c.kind;
      }
      if (typeof meta.notes === 'string') c.notes = meta.notes;
      if (Array.isArray(meta.tags))        c.tags  = meta.tags.slice();
      return save();
    } catch (e) {
      console.warn('[BuildingEditRegistry] setCompoundMeta error:', e.message || e);
      return false;
    }
  }

  // ── Delete authority (0610L) ──────────────────────────────────────────────────

  // deleteSelectedTarget(buildingKey) — hierarchy-aware deletion.
  // Resolves compound > group > standalone and removes the highest matching record.
  // Returns { ok, type, id, removedCount } | { ok: false, type: 'none', reason }
  // Never throws. Always saves after mutation.
  function deleteSelectedTarget(buildingKey) {
    try {
      if (!buildingKey) return { ok: false, type: 'none', reason: 'missing_key' };

      // 1. Check compound membership (direct or via group)
      var compoundId = null;
      try { compoundId = findCompoundByMember(buildingKey); } catch (e) {}
      if (!compoundId) {
        var groupIdForCompound = null;
        try { groupIdForCompound = findGroupByMember(buildingKey); } catch (e) {}
        if (groupIdForCompound) {
          try { compoundId = findCompoundByMember(groupIdForCompound); } catch (e) {}
        }
      }

      if (compoundId && _data.compounds && _data.compounds[compoundId]) {
        var compoundMembers = (_data.compounds[compoundId].members || []).length;
        delete _data.compounds[compoundId];
        save();
        return { ok: true, type: 'compound', id: compoundId, removedCount: compoundMembers };
      }

      // 2. Check group membership
      var groupId = null;
      try { groupId = findGroupByMember(buildingKey); } catch (e) {}
      if (groupId && _data.groups && _data.groups[groupId]) {
        var groupMembers = (_data.groups[groupId].members || []).length;
        delete _data.groups[groupId];
        save();
        return { ok: true, type: 'group', id: groupId, removedCount: groupMembers };
      }

      // 3. Standalone building edit
      if (_data.buildings && _data.buildings[buildingKey]) {
        delete _data.buildings[buildingKey];
        save();
        return { ok: true, type: 'building', id: buildingKey, removedCount: 1 };
      }

      return { ok: false, type: 'none', reason: 'not_found' };
    } catch (e) {
      return { ok: false, type: 'none', reason: String(e && e.message || e) };
    }
  }

  // ── Source hide authority (0610M) ────────────────────────────────────────────

  // hideSourceBuilding(buildingKey) — creates or updates the registry entry with
  // hidden: true. Preserves existing color/notes/tags/replacement/geometry.
  // Returns { ok: true, key, hidden: true } or { ok: false, reason }.
  function hideSourceBuilding(buildingKey) {
    try {
      if (!buildingKey) return { ok: false, reason: 'missing_key' };
      set(buildingKey, { hidden: true });
      return { ok: true, key: buildingKey, hidden: true };
    } catch (e) {
      return { ok: false, reason: String(e && e.message || e) };
    }
  }

  // restoreSourceBuilding(buildingKey) — sets hidden: false; preserves other metadata.
  // The existing isEmpty guard in set() auto-cleans the entry when no other
  // authored data (color/notes/tags/replacement/geometry) remains.
  // Returns { ok: true, key, hidden: false } or { ok: false, reason }.
  function restoreSourceBuilding(buildingKey) {
    try {
      if (!buildingKey) return { ok: false, reason: 'missing_key' };
      set(buildingKey, { hidden: false });
      return { ok: true, key: buildingKey, hidden: false };
    } catch (e) {
      return { ok: false, reason: String(e && e.message || e) };
    }
  }

  // isSourceHidden(buildingKey) — returns true when entry exists and hidden === true.
  function isSourceHidden(buildingKey) {
    if (!buildingKey) return false;
    var edit = _data.buildings && _data.buildings[buildingKey];
    return !!(edit && edit.hidden === true);
  }

  // getHiddenKeys() — returns array of building keys with hidden === true.
  function getHiddenKeys() {
    var out = [];
    var buildings = _data.buildings || {};
    Object.keys(buildings).forEach(function (k) {
      if (buildings[k] && buildings[k].hidden === true) out.push(k);
    });
    return out;
  }

  // ── Init ──────────────────────────────────────────────────────────────────────

  load();

  global.WOSMapLab = global.WOSMapLab || {};
  global.WOSMapLab.BuildingEditRegistry = Object.freeze({
    VALID_ARCHETYPES:        VALID_ARCHETYPES,
    VALID_HEIGHT_MODES:      VALID_HEIGHT_MODES,
    normalizeReplacement:    normalizeReplacement,
    buildingKey:             buildingKey,
    parseKey:                parseKey,
    load:                    load,
    save:                    save,
    get:                     get,
    getAll:                  getAll,
    set:                     set,
    remove:                  remove,
    clear:                   clear,
    exportJSON:              exportJSON,
    importJSON:              importJSON,
    // 0610J — group API
    createGroup:             createGroup,
    deleteGroup:             deleteGroup,
    getGroup:                getGroup,
    getGroups:               getGroups,
    findGroupByMember:       findGroupByMember,
    addMemberToGroup:        addMemberToGroup,
    removeMemberFromGroup:   removeMemberFromGroup,
    setGroupReplacement:     setGroupReplacement,
    // 0610K — compound API
    VALID_COMPOUND_KINDS:        VALID_COMPOUND_KINDS,
    createCompound:              createCompound,
    deleteCompound:              deleteCompound,
    getCompound:                 getCompound,
    getCompounds:                getCompounds,
    findCompoundByMember:        findCompoundByMember,
    addMemberToCompound:         addMemberToCompound,
    removeMemberFromCompound:    removeMemberFromCompound,
    setCompoundReplacement:      setCompoundReplacement,
    setCompoundMeta:             setCompoundMeta,
    // 0610L — delete authority
    deleteSelectedTarget:        deleteSelectedTarget,
    // 0610M — source hide authority
    hideSourceBuilding:          hideSourceBuilding,
    restoreSourceBuilding:       restoreSourceBuilding,
    isSourceHidden:              isSourceHidden,
    getHiddenKeys:               getHiddenKeys,
    // 0612C — same-window replacement sync notification
    notifyReplacementRuntimeChanged: notifyReplacementRuntimeChanged,
  });

  console.log('[BuildingEditRegistry] v1.7.0 loaded');
})(window);
