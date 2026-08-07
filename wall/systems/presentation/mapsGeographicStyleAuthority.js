// ── MapsGeographicStyleAuthority v1.0.0 ───────────────────────────────────────
// 0729A_MAPS_Palette_Audit_Default_Wiring; renamed from MapsPaletteAuthority by
// 0729D_MAPS_Vehicle_Overlay_Libraries_Foundation's terminology-migration gate
// (generic "palette" vocabulary → geographicStyle, now that Vehicle/Overlay
// get their own separate, equally-named authorities instead of overloading
// this one).
// Status: active | Classification: presentation-authority / geographic-style-authority
//
// Single source of truth for MAPS Geographic Styles: canonical Default, saved
// style CRUD, Active/Preview/Inactive state, persistence, and cross-tab sync.
//
// Authority boundary:
//   OWNS: Geographic Style records, active/preview state, application of wired
//         properties (via MapsGeographicStyleApplyAdapters) to whichever map
//         instance this tab's init(map) was called with.
//   READS: MapsGeographicStyleRegistry (wired property list + deferred audit).
//   WRITES: localStorage (wos:geographicStyle:*) for cross-tab sync — mirrors
//           the established pattern in wosMapStyleAuthority.js.
//   MUST NOT: touch deferred systems (actors/vessels/aircraft/traffic/orbital/
//             atmosphere/sky/general UI/per-building overrides/legacy
//             MapStyleAuthority) — no setter APIs exist there in this build.
//
// Cross-tab sync:
//   activateGeographicStyle() writes the active id to localStorage; the other
//   tab's 'storage' listener re-applies. Style record edits (create/duplicate/
//   swatch edits) are written as one JSON blob and picked up the same way.
//   Preview is NEVER written to storage — it is in-memory/per-tab only, so it
//   can never leak into another tab's active state or survive a reload.
//
// Schema invariant: every saved style (including Default) always carries the
// COMPLETE current wired-property set — enforced at load/migrate time, not by
// trusting what was serialized.
//
// Backward compatibility (temporary, 0729D): the old `wos:mapsPalette:*`
// storage keys and the old `SBE.MapsPaletteAuthority` global are still read/
// aliased below so an already-open tab (or a profile that hasn't reloaded
// yet) keeps syncing correctly during the rename. New code must use only
// `MapsGeographicStyleAuthority` / `wos:geographicStyle:*` — the old names are
// a one-way migration shim, not a second permanent API.
//
// Placement: wall/systems/presentation/mapsGeographicStyleAuthority.js
// Load: AFTER mapsGeographicStyleRegistry.js and mapsGeographicStyleApplyAdapters.js.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  var STORAGE_RECORDS_KEY = 'wos:geographicStyle:records';
  var STORAGE_ACTIVE_KEY  = 'wos:geographicStyle:activeId';
  var STORAGE_SCHEMA_KEY  = 'wos:geographicStyle:schemaVersion';
  var STORAGE_SEEDED_KEY  = 'wos:geographicStyle:seeded';
  // Old keys — read-only fallback for the migration window (0729D). Never
  // written to by this version; see _loadRecords/_loadActiveId/init below.
  var LEGACY_STORAGE_RECORDS_KEY = 'wos:mapsPalette:records';
  var LEGACY_STORAGE_ACTIVE_KEY  = 'wos:mapsPalette:activeId';
  var LEGACY_STORAGE_SEEDED_KEY  = 'wos:mapsPalette:seeded';
  var EPISODE_2_SEED_ID   = 'episode-2';
  var SCHEMA_VERSION      = 1;
  var DEFAULT_GEOGRAPHIC_STYLE_ID = 'default';
  var DIAGNOSTIC_ID       = '__diagnostic__';

  var _map             = null;
  var _registryRecords = null;
  var _styles           = {};
  var _activeId         = DEFAULT_GEOGRAPHIC_STYLE_ID;
  var _previewId        = null;
  var _listeners        = [];

  // In-tab reactivity: the existing 'storage' listener above only fires in
  // OTHER tabs/windows, never the one that made the change — a caller in this
  // same document (e.g. a React bridge) has no way to know state changed.
  // This is a plain synchronous notify, not a new authority: it does not
  // store, serialize, or gate anything; it only tells already-subscribed
  // callers to re-read via the existing getters/listGeographicStyles/getGeographicStyle.
  function _notify() {
    _listeners.slice().forEach(function (fn) {
      try { fn(); } catch (e) { console.warn('[MapsGeographicStyleAuthority] subscriber threw:', e && e.message || e); }
    });
  }

  function _genId() {
    return 'style-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }

  // ── Persistence ────────────────────────────────────────────────────────────
  function _loadRecords() {
    try {
      var raw = global.localStorage.getItem(STORAGE_RECORDS_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        return (parsed && typeof parsed === 'object') ? parsed : {};
      }
      // Migration fallback (0729D, temporary): new key never written yet on
      // this profile — read the old key so nothing is lost.
      var legacyRaw = global.localStorage.getItem(LEGACY_STORAGE_RECORDS_KEY);
      if (!legacyRaw) return {};
      var legacyParsed = JSON.parse(legacyRaw);
      return (legacyParsed && typeof legacyParsed === 'object') ? legacyParsed : {};
    } catch (e) { return {}; }
  }

  function _saveRecords() {
    try {
      var toStore = {};
      Object.keys(_styles).forEach(function (id) {
        if (id === DEFAULT_GEOGRAPHIC_STYLE_ID) return; // Default is never serialized — always regenerated live
        toStore[id] = _styles[id];
      });
      global.localStorage.setItem(STORAGE_RECORDS_KEY, JSON.stringify(toStore));
    } catch (e) { console.warn('[MapsGeographicStyleAuthority] _saveRecords failed:', e && e.message || e); }
  }

  function _loadActiveId() {
    try {
      var id = global.localStorage.getItem(STORAGE_ACTIVE_KEY);
      if (id) return id;
      // Migration fallback (0729D, temporary) — see _loadRecords.
      return global.localStorage.getItem(LEGACY_STORAGE_ACTIVE_KEY) || DEFAULT_GEOGRAPHIC_STYLE_ID;
    } catch (e) { return DEFAULT_GEOGRAPHIC_STYLE_ID; }
  }

  function _saveActiveId(id) {
    try { global.localStorage.setItem(STORAGE_ACTIVE_KEY, id); } catch (e) {}
  }

  // ── Schema migration — every style always covers the full wired set ───────
  function _migrateAgainst(stored, defaultStyle) {
    var values = {};
    Object.keys(defaultStyle.values).forEach(function (id) {
      values[id] = (stored.values && Object.prototype.hasOwnProperty.call(stored.values, id))
        ? stored.values[id] : defaultStyle.values[id];
    });
    // Preserve any extra/unknown keys already stored (future-compatible data — never dropped).
    Object.keys(stored.values || {}).forEach(function (id) {
      if (!(id in values)) values[id] = stored.values[id];
    });
    return Object.assign({}, stored, { values: values });
  }

  function _buildDefaultStyle() {
    var values = {};
    _registryRecords.forEach(function (r) { values[r.id] = r.currentValue; });
    var now = Date.now();
    return { id: DEFAULT_GEOGRAPHIC_STYLE_ID, title: 'Default', values: values, createdAt: now, updatedAt: now };
  }

  // ── Apply ──────────────────────────────────────────────────────────────────
  function _applyValues(values) {
    var adapters = SBE.MapsGeographicStyleApplyAdapters;
    if (!adapters) { console.warn('[MapsGeographicStyleAuthority] MapsGeographicStyleApplyAdapters not loaded'); return; }
    _registryRecords.forEach(function (r) {
      if (!Object.prototype.hasOwnProperty.call(values, r.id)) return; // schema-drift guard
      try { adapters.apply(r, values[r.id], _map); }
      catch (e) { console.warn('[MapsGeographicStyleAuthority] apply failed for', r.id, ':', e && e.message || e); }
    });
  }

  // ── Cross-tab sync ─────────────────────────────────────────────────────────
  // Listens for both new and legacy key names (0729D migration window) — an
  // already-open tab still running pre-rename code writes to the legacy keys;
  // this tab must still pick that up rather than silently going stale.
  function _onStorageEvent(e) {
    if (e.key === STORAGE_ACTIVE_KEY || e.key === LEGACY_STORAGE_ACTIVE_KEY) {
      var id = e.newValue;
      if (!id || id === _activeId) return;
      if (!_styles[id]) {
        var incoming = _loadRecords();
        Object.keys(incoming).forEach(function (pid) {
          _styles[pid] = _migrateAgainst(incoming[pid], _styles[DEFAULT_GEOGRAPHIC_STYLE_ID]);
        });
      }
      if (!_styles[id]) return; // still unknown — nothing safe to apply
      _activeId  = id;
      _previewId = null;
      _applyValues(_styles[id].values);
      console.log('[MapsGeographicStyleAuthority] cross-tab active style →', id);
      _notify();
    } else if (e.key === STORAGE_RECORDS_KEY || e.key === LEGACY_STORAGE_RECORDS_KEY) {
      var records = _loadRecords();
      Object.keys(records).forEach(function (pid) {
        if (pid === DEFAULT_GEOGRAPHIC_STYLE_ID) return;
        _styles[pid] = _migrateAgainst(records[pid], _styles[DEFAULT_GEOGRAPHIC_STYLE_ID]);
      });
      // A property edit (not an activate/preview switch) on the style this
      // tab is currently showing must still repaint this tab's own map —
      // same condition setPropertyValue() uses locally. Without this, only
      // switching which style is active re-applies; editing a value on the
      // style that's ALREADY active/previewed here silently no-ops until
      // the next activate, even though the edit is visible in the Library
      // that made it.
      var liveId = _previewId != null ? _previewId : _activeId;
      if (Object.prototype.hasOwnProperty.call(records, liveId) && _styles[liveId]) {
        _applyValues(_styles[liveId].values);
      }
      _notify();
    }
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  function init(map) {
    _map = map;
    var registry = SBE.MapsGeographicStyleRegistry;
    if (!registry) { console.error('[MapsGeographicStyleAuthority] MapsGeographicStyleRegistry not loaded'); return { ok: false }; }
    _registryRecords = registry.buildRegistry(map);

    var defaultStyle = _buildDefaultStyle();
    _styles = {};
    _styles[DEFAULT_GEOGRAPHIC_STYLE_ID] = defaultStyle;

    var stored = _loadRecords();
    Object.keys(stored).forEach(function (id) {
      if (id === DEFAULT_GEOGRAPHIC_STYLE_ID) return;
      _styles[id] = _migrateAgainst(stored[id], defaultStyle);
    });

    // Durable one-time seed: a fresh browser profile (never seeded before, no
    // saved styles yet) receives Episode 2 as a real, persisted style — not
    // something that only ever existed via manual console authoring. Colors
    // come from SBE.MapsGeographicStyleSeeds (data, not UI code) and are
    // computed against THIS live registry, so schema always matches exactly.
    var alreadySeeded = false;
    try {
      alreadySeeded = !!global.localStorage.getItem(STORAGE_SEEDED_KEY)
        || !!global.localStorage.getItem(LEGACY_STORAGE_SEEDED_KEY); // 0729D migration fallback
    } catch (e) {}
    if (!alreadySeeded && Object.keys(stored).length === 0 && SBE.MapsGeographicStyleSeeds) {
      try {
        var seed = SBE.MapsGeographicStyleSeeds.buildEpisode2Seed(_registryRecords);
        var now = Date.now();
        _styles[EPISODE_2_SEED_ID] = {
          id: EPISODE_2_SEED_ID, title: seed.title, values: seed.values,
          createdAt: now, updatedAt: now,
        };
        try { global.localStorage.setItem(STORAGE_SEEDED_KEY, '1'); } catch (e2) {}
      } catch (e) { console.warn('[MapsGeographicStyleAuthority] Episode 2 seed failed:', e && e.message || e); }
    }

    _activeId = _loadActiveId();
    if (!_styles[_activeId]) _activeId = DEFAULT_GEOGRAPHIC_STYLE_ID;
    _previewId = null; // never promote a preview on load — spec §8.2

    try { global.localStorage.setItem(STORAGE_SCHEMA_KEY, String(SCHEMA_VERSION)); } catch (e) {}
    _saveRecords();
    _saveActiveId(_activeId); // ensures the new key is populated even if this profile only ever had the legacy key

    _applyValues(_styles[_activeId].values);

    try { global.addEventListener('storage', _onStorageEvent); } catch (e) {}

    console.log('[MapsGeographicStyleAuthority] init — ' + _registryRecords.length + ' wired properties, active:', _activeId);
    return { ok: true, wiredCount: _registryRecords.length, activeId: _activeId };
  }

  function isInitialized() { return !!_registryRecords; }
  function getRegistry() { return _registryRecords ? _registryRecords.slice() : []; }
  function getDeferredAudit() { return SBE.MapsGeographicStyleRegistry ? SBE.MapsGeographicStyleRegistry.getDeferredAudit() : []; }

  // ── CRUD ───────────────────────────────────────────────────────────────────
  function listGeographicStyles() {
    return Object.keys(_styles).map(function (id) { return _styles[id]; })
      .sort(function (a, b) {
        if (a.id === DEFAULT_GEOGRAPHIC_STYLE_ID) return -1;
        if (b.id === DEFAULT_GEOGRAPHIC_STYLE_ID) return 1;
        return (a.createdAt || 0) - (b.createdAt || 0);
      });
  }

  function getGeographicStyle(id) { return _styles[id] || null; }

  function createGeographicStyle(title) {
    var id   = _genId();
    var base = _styles[DEFAULT_GEOGRAPHIC_STYLE_ID];
    var now  = Date.now();
    var p = { id: id, title: title || 'New Geographic Style', values: Object.assign({}, base.values), createdAt: now, updatedAt: now };
    _styles[id] = p;
    _saveRecords();
    _notify();
    return p;
  }

  function duplicateGeographicStyle(sourceId) {
    var src = _styles[sourceId];
    if (!src) return null;
    var id  = _genId();
    var now = Date.now();
    var p = { id: id, title: src.title + ' Copy', values: Object.assign({}, src.values), createdAt: now, updatedAt: now };
    _styles[id] = p;
    _saveRecords();
    _notify();
    return p;
  }

  // Default is a real, editable, inspectable style — not locked infrastructure.
  // It represents the current map exactly at the moment it was generated; if a
  // user edits it directly that's a legitimate correction to the baseline, not
  // drift. (New named styles should still be built by duplicating Default
  // first, per the standard workflow — that's a UI/process convention, not an
  // enforced restriction here.)
  function setPropertyValue(styleId, propId, value) {
    var p = _styles[styleId];
    if (!p) return { ok: false, reason: 'not_found' };
    p.values[propId] = value;
    p.updatedAt = Date.now();
    _saveRecords();
    if (styleId === _previewId || (styleId === _activeId && _previewId == null)) {
      _applyValues(p.values);
    }
    _notify();
    return { ok: true };
  }

  // Default's title is protected (0729B §9) — swatch values remain editable
  // (0729A direction), but Default must stay identifiable as the canonical
  // baseline across sessions and screenshots, so renaming it is blocked.
  function renameGeographicStyle(id, title) {
    if (id === DEFAULT_GEOGRAPHIC_STYLE_ID) return { ok: false, reason: 'default_protected' };
    var p = _styles[id];
    if (!p) return { ok: false, reason: 'not_found' };
    var trimmed = (title || '').trim();
    if (!trimmed) return { ok: false, reason: 'empty_title' };
    p.title = trimmed;
    p.updatedAt = Date.now();
    _saveRecords();
    _notify();
    return { ok: true };
  }

  // ── State machine — Active / Preview / Inactive ───────────────────────────
  function activateGeographicStyle(id) {
    var p = _styles[id];
    if (!p) return { ok: false, reason: 'not_found' };
    _activeId  = id;
    _previewId = null;
    _saveActiveId(id);
    _applyValues(p.values);
    _notify();
    return { ok: true };
  }

  function previewGeographicStyle(id) {
    var p = _styles[id];
    if (!p) return { ok: false, reason: 'not_found' };
    _previewId = id;
    _applyValues(p.values);
    _notify();
    return { ok: true };
  }

  function endPreview() {
    if (_previewId == null) return { ok: true, noop: true };
    _previewId = null;
    var active = _styles[_activeId];
    if (active) _applyValues(active.values);
    _notify();
    return { ok: true };
  }

  function getActiveId()  { return _activeId; }
  function getPreviewId() { return _previewId; }

  // ── Diagnostic transition (Default → Diagnostic → Default) ───────────────
  var DIAGNOSTIC_GROUP_COLORS = {
    'Base Map':   '#ff00ff',
    'Water':      '#00ffff',
    'Roads':      '#ffff00',
    'Labels':     '#ff0000',
    'Boundaries': '#00ff00',
    'Land':       '#ff8800',
    'Route':      '#ff0066',
  };

  function buildDiagnosticPalette() {
    var values = {};
    _registryRecords.forEach(function (r) {
      values[r.id] = DIAGNOSTIC_GROUP_COLORS[r.group] || '#ff2bd6';
    });
    return { id: DIAGNOSTIC_ID, title: 'Diagnostic Wiring Style', values: values, diagnostic: true };
  }

  function _snapshotLive() {
    var adapters = SBE.MapsGeographicStyleApplyAdapters;
    var snap = {};
    _registryRecords.forEach(function (r) {
      try { snap[r.id] = adapters.read(r, _map); } catch (e) { snap[r.id] = undefined; }
    });
    return snap;
  }

  // ── Diagnostic coverage reconciliation ────────────────────────────────────
  // For every wired property whose read-back value did NOT change during the
  // diagnostic pass, captures enough live detail (layer existence, zoom range,
  // layout visibility, raw before/requested/after-apply strings) to classify
  // *why*, rather than assuming it's a bug. Restores the prior active style
  // before returning; never persists anything.
  function _layerMeta(record) {
    if (record.source !== 'mapbox-style' || !_map) return null;
    var layer = null;
    try { layer = _map.getLayer(record.sourceObject); } catch (e) {}
    if (!layer) return { layerFound: false };
    var styleLayer = null;
    try {
      var style = _map.getStyle();
      var layers = (style && style.layers) || [];
      for (var i = 0; i < layers.length; i++) {
        if (layers[i].id === record.sourceObject) { styleLayer = layers[i]; break; }
      }
    } catch (e) {}
    var currentZoom = null;
    try { currentZoom = _map.getZoom(); } catch (e) {}
    var minzoom = styleLayer ? styleLayer.minzoom : undefined;
    var maxzoom = styleLayer ? styleLayer.maxzoom : undefined;
    var visibility = (styleLayer && styleLayer.layout && styleLayer.layout.visibility) || 'visible';
    var outOfZoomRange =
      (minzoom !== undefined && currentZoom != null && currentZoom < minzoom) ||
      (maxzoom !== undefined && currentZoom != null && currentZoom > maxzoom);
    return {
      layerFound: true, visibility: visibility, minzoom: minzoom, maxzoom: maxzoom,
      currentZoom: currentZoom, outOfZoomRange: !!outOfZoomRange,
    };
  }

  function _looksTransparent(value) {
    if (typeof value !== 'string') return false;
    var m = /rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)/i.exec(value);
    return m ? parseFloat(m[1]) === 0 : false;
  }

  // For non-mapbox-style sources: is the renderer module this record targets
  // actually loaded on the current page? Route/hero-vehicle/HUD are Wall-only
  // — they are not loaded by studio/index.html at all — so a page-context
  // absence is an expected, benign "conditionally inactive here" result, not
  // a failure. If the module IS present but the value still didn't move,
  // that's a real "failed to apply".
  var SOURCE_MODULE_NAMES = {
    route: ['MapboxOperatorRenderer', 'RoutePlannerRuntime', 'RoutePanel'],
  };
  function _sourceModulePresent(record) {
    var names = SOURCE_MODULE_NAMES[record.source];
    if (!names) return null; // not applicable (e.g. mapbox-style)
    return names.some(function (n) { return !!SBE[n]; });
  }

  function reconcileDiagnosticCoverage() {
    var savedActiveId  = _activeId;
    var savedPreviewId = _previewId;
    var baselineValues = (_styles[_activeId] || _styles[DEFAULT_GEOGRAPHIC_STYLE_ID]).values;
    var report = [];

    try {
      var beforeLive = _snapshotLive();
      var diag = buildDiagnosticPalette();
      _applyValues(diag.values);
      var duringLive = _snapshotLive();

      _registryRecords.forEach(function (r) {
        var before    = beforeLive[r.id];
        var requested = diag.values[r.id];
        var during    = duringLive[r.id];
        if (String(before) === String(during)) {
          var entry = {
            id: r.id, label: r.label, group: r.group, source: r.source, valueKind: r.valueKind,
            before: before, requestedDiagnostic: requested, readBackDuring: during,
          };
          if (String(requested) === String(before)) {
            entry.classification = 'diagnostic-value-already-matched';
          } else if (r.source === 'mapbox-style') {
            var meta = _layerMeta(r);
            entry.layerMeta = meta;
            entry.classification = (meta && meta.layerFound === false)
              ? 'incorrectly-classified-as-wired' : 'failed-to-apply';
          } else {
            var modulePresent = _sourceModulePresent(r);
            entry.sourceModulePresent = modulePresent;
            entry.classification = (modulePresent === false)
              ? 'conditionally-inactive' : 'failed-to-apply';
          }
          report.push(entry);
        }
      });
    } finally {
      _applyValues(baselineValues);
      _activeId  = savedActiveId;
      _previewId = savedPreviewId;
    }

    return { totalWired: _registryRecords.length, unchangedCount: report.length, unchanged: report };
  }

  // Not persisted anywhere — dev/test-only, per spec §9.4 / §13.
  function runDiagnosticSequence() {
    var savedActiveId  = _activeId;
    var savedPreviewId = _previewId;
    var baselineValues = (_styles[_activeId] || _styles[DEFAULT_GEOGRAPHIC_STYLE_ID]).values;
    var result = { ok: false, totalWired: _registryRecords.length };

    try {
      var beforeLive = _snapshotLive();
      var diag = buildDiagnosticPalette();
      _applyValues(diag.values);
      var duringLive = _snapshotLive();
      _applyValues(baselineValues);
      var afterLive = _snapshotLive();

      var changedDuring = 0;
      var mismatchedAfter = [];
      _registryRecords.forEach(function (r) {
        if (String(duringLive[r.id]) !== String(beforeLive[r.id])) changedDuring++;
        if (String(afterLive[r.id]) !== String(beforeLive[r.id])) mismatchedAfter.push(r.id);
      });

      result.propertiesChangedDuringDiagnostic = changedDuring;
      result.mismatchedAfterRestore = mismatchedAfter;
      result.restoredExactly = mismatchedAfter.length === 0;
      result.ok = result.restoredExactly && changedDuring > 0;
    } catch (e) {
      result.error = String(e && e.message || e);
      try { _applyValues(baselineValues); } catch (e2) {}
    }

    _activeId  = savedActiveId;
    _previewId = savedPreviewId;
    return result;
  }

  // ── Debug wiring ───────────────────────────────────────────────────────────
  function _wireDebug() {
    global._wos = global._wos || {};
    global._wos.debug = global._wos.debug || {};
    var debugApi = {
      init:                 init,
      isInitialized:        isInitialized,
      list:                 listGeographicStyles,
      get:                  getGeographicStyle,
      create:               createGeographicStyle,
      duplicate:            duplicateGeographicStyle,
      rename:               renameGeographicStyle,
      setPropertyValue:     setPropertyValue,
      activate:             activateGeographicStyle,
      preview:              previewGeographicStyle,
      endPreview:           endPreview,
      getActiveId:          getActiveId,
      getPreviewId:         getPreviewId,
      getRegistry:          getRegistry,
      getDeferredAudit:     getDeferredAudit,
      buildDiagnosticPalette: buildDiagnosticPalette,
      runDiagnosticSequence:  runDiagnosticSequence,
      reconcileDiagnosticCoverage: reconcileDiagnosticCoverage,
      runTests: function () {
        return SBE.MapsGeographicStyleAuthorityTests ? SBE.MapsGeographicStyleAuthorityTests.run() : { ok: false, reason: 'tests_not_loaded' };
      },
      // Network-independent: forces (re)init against a mock map first, so
      // this always runs regardless of real Mapbox/tile availability.
      runTestsOffline: function () {
        if (!SBE.MapsGeographicStyleAuthorityTests) return { ok: false, reason: 'tests_not_loaded' };
        return SBE.MapsGeographicStyleAuthorityTests.run(SBE.MapsGeographicStyleAuthorityTests.createMockMap());
      },
    };
    global._wos.debug.mapsGeographicStyle = debugApi;
    // Temporary compat alias (0729D) — remove once nothing references the old console path.
    global._wos.debug.mapsPalette = debugApi;
  }
  _wireDebug();

  SBE.MapsGeographicStyleAuthority = {
    VERSION: VERSION,
    init: init,
    isInitialized: isInitialized,
    getRegistry: getRegistry,
    getDeferredAudit: getDeferredAudit,
    listGeographicStyles: listGeographicStyles,
    getGeographicStyle: getGeographicStyle,
    createGeographicStyle: createGeographicStyle,
    duplicateGeographicStyle: duplicateGeographicStyle,
    renameGeographicStyle: renameGeographicStyle,
    setPropertyValue: setPropertyValue,
    activateGeographicStyle: activateGeographicStyle,
    previewGeographicStyle: previewGeographicStyle,
    endPreview: endPreview,
    getActiveId: getActiveId,
    getPreviewId: getPreviewId,
    // Same-tab reactivity for non-vanilla-JS consumers (e.g. a React bridge):
    // fires after any local mutation or cross-tab 'storage' sync. Returns an
    // unsubscribe function. Purely a notification side-channel — callers
    // re-read state via the getters above; nothing is passed to fn().
    subscribe: function (fn) {
      _listeners.push(fn);
      return function unsubscribe() {
        var i = _listeners.indexOf(fn);
        if (i >= 0) _listeners.splice(i, 1);
      };
    },
    buildDiagnosticPalette: buildDiagnosticPalette,
    runDiagnosticSequence: runDiagnosticSequence,
    reconcileDiagnosticCoverage: reconcileDiagnosticCoverage,
    DEFAULT_GEOGRAPHIC_STYLE_ID: DEFAULT_GEOGRAPHIC_STYLE_ID,
    DIAGNOSTIC_ID: DIAGNOSTIC_ID,
    // Test-only accessors — never surfaced in production UI (Creative Interface
    // Doctrine applies to UI, not internal test hooks). Used by
    // mapsGeographicStyleAuthority.tests.js only.
    __test: {
      getMap: function () { return _map; },
      getActiveIdFromStorage: function () {
        try { return global.localStorage.getItem(STORAGE_ACTIVE_KEY); } catch (e) { return null; }
      },
      migrateAgainstDefault: function (storedStyleLike) {
        return _migrateAgainst(storedStyleLike, _styles[DEFAULT_GEOGRAPHIC_STYLE_ID]);
      },
      removeGeographicStyle: function (id) { delete _styles[id]; _saveRecords(); },
    },
  };

  // Temporary compat alias (0729D terminology migration) — an already-open
  // tab or any code not yet updated to the new name keeps working during the
  // transition. New code must reference SBE.MapsGeographicStyleAuthority only.
  SBE.MapsPaletteAuthority = SBE.MapsGeographicStyleAuthority;

  // ── Wall self-wiring — auto-init once Wall's live map is ready ────────────
  // Studio does NOT auto-init here: its shared preview map is created lazily
  // by WOSPalettesView on first entry into the Palettes mode, which calls
  // init(map) itself once that map exists.
  (function () {
    // style.load (not the full load/tile-decode event) — the registry only
    // ever calls getStyle()/getLayer()/setPaintProperty(), none of which need
    // tiles to have arrived. Waiting for full tile decode here only slows
    // initialization down for no benefit.
    var mvr = global.SBE && global.SBE.MapboxViewportRuntime;
    if (mvr && typeof mvr.onStyleLoad === 'function') {
      mvr.onStyleLoad(function () { init(mvr.getMap()); });
    } else if (mvr && typeof mvr.onReady === 'function') {
      mvr.onReady(function () { init(mvr.getMap()); });
    }
  })();

  console.log('[MapsGeographicStyleAuthority] v' + VERSION + ' loaded');

})(window);
