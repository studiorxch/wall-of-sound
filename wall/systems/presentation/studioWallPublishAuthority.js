// ── StudioWallPublishAuthority v1.0.0 ────────────────────────────────────────
// 0612L_WOS_StudioToWallPublishAuthority_v1.0.0_BUILD
// Status: active | Classification: authority-build (publish boundary)
//
// Purpose:
//   Formal publishing boundary between Studio (authoring) and Wall
//   (presentation). Draft, Modified, and Published states are explicit and
//   derived from data (hash compare), never manually tracked.
//
//   Studio → Draft Registry (wos.maplab.buildings)
//        publish()
//   Published Registry (wos_building_published) → Wall
//
//   Wall never writes edits. Wall consumers (BuildingReplacementRuntime,
//   BuildingEditProjectionRuntime) read ONLY the published registry.
//
// Context detection (same pattern as ThreeViewStyleParityLock):
//   Wall:   SBE.MapboxViewportRuntime present → consume published, listen for
//           publish events, reload runtimes on publish.
//   Studio: WOSMapLab present → header UI (state chip + publish button),
//           publish() operation.
//
// Placement: wall/systems/presentation/studioWallPublishAuthority.js
// Load Wall:   AFTER buildingReplacementRuntime.js / projection runtime
// Load Studio: AFTER studioShell.js dependencies (before studioShell.js is fine;
//              UI injection waits for DOM)
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var VERSION = '1.0.0';

  // ── Registry keys ─────────────────────────────────────────────────────────────
  // DRAFT_KEY is the existing Studio BuildingEditRegistry storage key — it IS the
  // draft registry (spec alias: wos_building_draft).
  var DRAFT_KEY     = 'wos.maplab.buildings';
  var PUBLISHED_KEY = 'wos_building_published';
  var PUBLISH_META_KEY = 'wos_building_published_meta';

  var _context = null;   // 'wall' | 'studio' | 'unknown'

  function _detectContext() {
    if (_context) return _context;
    var hasSBE    = !!(global.SBE && global.SBE.MapboxViewportRuntime);
    var hasStudio = !!(global.WOSMapLab && global.WOSMapLab.MapboxAdapter);
    if (hasSBE)         _context = 'wall';
    else if (hasStudio) _context = 'studio';
    else                _context = 'unknown';
    return _context;
  }

  // ── Hash (FNV-1a over the raw registry string) ───────────────────────────────

  function _hash(str) {
    if (str == null) return null;
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h * 0x01000193) >>> 0;
    }
    return ('0000000' + h.toString(16)).slice(-8);
  }

  function _rawDraft()     { try { return global.localStorage.getItem(DRAFT_KEY); }     catch (e) { return null; } }
  function _rawPublished() { try { return global.localStorage.getItem(PUBLISHED_KEY); } catch (e) { return null; } }

  function _draftHasContent(raw) {
    if (!raw) return false;
    try {
      var p = JSON.parse(raw);
      return !!(p && p.buildings && Object.keys(p.buildings).length > 0);
    } catch (e) { return false; }
  }

  // ── State derivation — truth from data, no manual tracking ──────────────────

  // state() → 'DRAFT' | 'MODIFIED' | 'PUBLISHED'
  //   DRAFT     — draft content exists, nothing ever published
  //   MODIFIED  — published exists, draft differs
  //   PUBLISHED — draft and published hashes equal (incl. both empty)
  function state() {
    var draft = _rawDraft();
    var pub   = _rawPublished();
    if (pub == null) {
      return _draftHasContent(draft) ? 'DRAFT' : 'PUBLISHED';
    }
    return (_hash(draft || '') === _hash(pub || '')) ? 'PUBLISHED' : 'MODIFIED';
  }

  function status() {
    var meta = null;
    try { meta = JSON.parse(global.localStorage.getItem(PUBLISH_META_KEY) || 'null'); } catch (e) {}
    var s = {
      version:        VERSION,
      context:        _detectContext(),
      state:          state(),
      draftHash:      _hash(_rawDraft() || ''),
      publishedHash:  _rawPublished() == null ? null : _hash(_rawPublished() || ''),
      lastPublishedAt: meta ? meta.publishedAt : null,
      publishCount:    meta ? meta.publishCount : 0,
    };
    return s;
  }

  // ── Publish operation (Studio only) ──────────────────────────────────────────

  function publish() {
    var ctx = _detectContext();
    if (ctx === 'wall') {
      console.warn('[StudioWallPublishAuthority] publish() refused — Wall never creates authoring state');
      return { ok: false, reason: 'WALL_CANNOT_PUBLISH' };
    }
    var draft = _rawDraft();
    try {
      global.localStorage.setItem(PUBLISHED_KEY, draft == null ? '{"buildings":{}}' : draft);
      var meta = { publishedAt: Date.now(), publishCount: 1 };
      try {
        var prior = JSON.parse(global.localStorage.getItem(PUBLISH_META_KEY) || 'null');
        if (prior && typeof prior.publishCount === 'number') meta.publishCount = prior.publishCount + 1;
      } catch (e) {}
      global.localStorage.setItem(PUBLISH_META_KEY, JSON.stringify(meta));
    } catch (e) {
      return { ok: false, reason: String(e && e.message || e) };
    }
    console.log('[StudioWallPublishAuthority] published | hash:', _hash(draft || ''));
    _updateStudioUI();
    // Other tabs (Wall) receive the storage event automatically.
    return { ok: true, state: state(), publishedHash: _hash(_rawPublished() || '') };
  }

  // ── Wall side: consume publish events, reload runtimes ───────────────────────

  function _reloadWallRuntimes() {
    var SBE = global.SBE || {};
    var notes = [];
    try {
      var brt = SBE.BuildingReplacementRuntime;
      if (brt && typeof brt.reload === 'function') { brt.reload(); notes.push('replacement:reloaded'); }
      if (brt && typeof brt.repairDominance === 'function') { brt.repairDominance(); }
    } catch (e) { notes.push('replacement:error ' + (e.message || e)); }
    try {
      var proj = SBE.BuildingEditProjectionRuntime;
      if (proj && typeof proj.reload === 'function') { proj.reload(); notes.push('projection:reloaded'); }
      else if (proj && typeof proj.apply === 'function') { proj.apply(); notes.push('projection:applied'); }
    } catch (e) { notes.push('projection:error ' + (e.message || e)); }
    try {
      var cda = SBE.CityDensityAuthority;
      if (cda && typeof cda.report === 'function' && cda.report().enabled) {
        cda.enable();   // re-applies treatment idempotently
        notes.push('density:reapplied');
      }
    } catch (e) { notes.push('density:error ' + (e.message || e)); }
    console.log('[StudioWallPublishAuthority] Wall runtimes reloaded after publish |', notes.join(' | '));
    return notes;
  }

  function _onStorageEvent(e) {
    if (!e || e.key !== PUBLISHED_KEY) return;
    if (_detectContext() !== 'wall') return;
    console.log('[StudioWallPublishAuthority] publish event received — reloading Wall runtimes');
    setTimeout(_reloadWallRuntimes, 150);
  }

  // ── Studio side: header UI ────────────────────────────────────────────────────

  var _chipEl = null;
  var _btnEl  = null;
  var _pollTimer = null;

  function _updateStudioUI() {
    if (!_chipEl || !_btnEl) return;
    var s = state();
    _chipEl.textContent = s === 'PUBLISHED' ? 'Published' : s === 'MODIFIED' ? 'Modified' : 'Draft';
    _chipEl.className = 'studio-publish-chip studio-publish-chip--' + s.toLowerCase();
    if (s === 'PUBLISHED') {
      _btnEl.textContent = 'Published ✓';
      _btnEl.disabled = true;
    } else {
      _btnEl.textContent = 'Publish';
      _btnEl.disabled = false;
    }
  }

  function _injectStudioUI() {
    var doc = global.document;
    var topbar = doc.querySelector('.studio-topbar');
    if (!topbar || _chipEl) return;

    _chipEl = doc.createElement('span');
    _chipEl.className = 'studio-publish-chip';

    _btnEl = doc.createElement('button');
    _btnEl.className = 'studio-publish-btn';
    _btnEl.addEventListener('click', function () {
      var r = publish();
      if (!r.ok) console.warn('[StudioWallPublishAuthority] publish failed:', r.reason);
      _updateStudioUI();
    });

    // Insert before the "Open Wall →" link
    var wallLink = topbar.querySelector('.studio-walllink');
    if (wallLink) { topbar.insertBefore(_chipEl, wallLink); topbar.insertBefore(_btnEl, wallLink); }
    else { topbar.appendChild(_chipEl); topbar.appendChild(_btnEl); }

    _updateStudioUI();

    // Draft writes happen in this same tab (no storage event) — poll cheaply.
    _pollTimer = setInterval(_updateStudioUI, 1500);
  }

  // ── Init ──────────────────────────────────────────────────────────────────────

  function init() {
    var ctx = _detectContext();
    if (ctx === 'unknown') { setTimeout(function () { _context = null; init(); }, 1000); return; }

    try { global.addEventListener('storage', _onStorageEvent); } catch (e) {}

    if (ctx === 'studio') {
      if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', _injectStudioUI);
      } else {
        _injectStudioUI();
      }
    }
    console.log('[StudioWallPublishAuthority] v' + VERSION + ' initialized | context:', ctx,
      '| state:', state());
  }

  // ── Export ────────────────────────────────────────────────────────────────────

  var _api = Object.freeze({
    VERSION:        VERSION,
    DRAFT_KEY:      DRAFT_KEY,
    PUBLISHED_KEY:  PUBLISHED_KEY,
    state:          state,
    status:         status,
    publish:        publish,
    reloadWallRuntimes: _reloadWallRuntimes,
  });

  if (global.SBE)       global.SBE.StudioWallPublishAuthority = _api;
  if (global.WOSMapLab) global.WOSMapLab.StudioWallPublishAuthority = _api;

  function _wireDebug() {
    global._wos       = global._wos       || {};
    global._wos.debug = global._wos.debug || {};
    global._wos.debug.publish = _api;
  }
  _wireDebug();
  (function _rewireAfterBoot() {
    var mvr = global.SBE && global.SBE.MapboxViewportRuntime;
    if (mvr && typeof mvr.onReady === 'function') mvr.onReady(_wireDebug);
  })();

  init();

  console.log('[StudioWallPublishAuthority] v' + VERSION +
    ' loaded | _wos.debug.publish.{state, status, publish}');

})(window);
