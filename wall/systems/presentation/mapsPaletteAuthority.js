// ── MapsPaletteAuthority v1.0.0 ───────────────────────────────────────────────
// 0729A_MAPS_Palette_Audit_Default_Wiring
// Status: active | Classification: presentation-authority / palette-authority
//
// Single source of truth for MAPS palettes: canonical Default, saved palette
// CRUD, Active/Preview/Inactive state, persistence, and cross-tab sync.
//
// Authority boundary:
//   OWNS: palette records, active/preview state, application of wired
//         properties (via MapsPaletteApplyAdapters) to whichever map instance
//         this tab's init(map) was called with.
//   READS: MapsPaletteRegistry (wired property list + deferred audit).
//   WRITES: localStorage (wos:mapsPalette:*) for cross-tab sync — mirrors the
//           established pattern in wosMapStyleAuthority.js.
//   MUST NOT: touch deferred systems (actors/vessels/aircraft/traffic/orbital/
//             atmosphere/sky/general UI/per-building overrides/legacy
//             MapStyleAuthority) — no setter APIs exist there in this build.
//
// Cross-tab sync:
//   activatePalette() writes the active id to localStorage; the other tab's
//   'storage' listener re-applies. Palette record edits (create/duplicate/
//   swatch edits) are written as one JSON blob and picked up the same way.
//   Preview is NEVER written to storage — it is in-memory/per-tab only, so it
//   can never leak into another tab's active state or survive a reload.
//
// Schema invariant: every saved palette (including Default) always carries the
// COMPLETE current wired-property set — enforced at load/migrate time, not by
// trusting what was serialized.
//
// Placement: wall/systems/presentation/mapsPaletteAuthority.js
// Load: AFTER mapsPaletteRegistry.js and mapsPaletteApplyAdapters.js.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  var STORAGE_RECORDS_KEY = 'wos:mapsPalette:records';
  var STORAGE_ACTIVE_KEY  = 'wos:mapsPalette:activeId';
  var STORAGE_SCHEMA_KEY  = 'wos:mapsPalette:schemaVersion';
  var STORAGE_SEEDED_KEY  = 'wos:mapsPalette:seeded';
  var EPISODE_2_SEED_ID   = 'episode-2';
  var SCHEMA_VERSION      = 1;
  var DEFAULT_PALETTE_ID  = 'default';
  var DIAGNOSTIC_ID       = '__diagnostic__';

  var _map             = null;
  var _registryRecords = null;
  var _palettes         = {};
  var _activeId         = DEFAULT_PALETTE_ID;
  var _previewId        = null;
  var _listeners        = [];

  // In-tab reactivity: the existing 'storage' listener above only fires in
  // OTHER tabs/windows, never the one that made the change — a caller in this
  // same document (e.g. a React bridge) has no way to know state changed.
  // This is a plain synchronous notify, not a new authority: it does not
  // store, serialize, or gate anything; it only tells already-subscribed
  // callers to re-read via the existing getters/listPalettes/getPalette.
  function _notify() {
    _listeners.slice().forEach(function (fn) {
      try { fn(); } catch (e) { console.warn('[MapsPaletteAuthority] subscriber threw:', e && e.message || e); }
    });
  }

  function _genId() {
    return 'palette-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }

  // ── Persistence ────────────────────────────────────────────────────────────
  function _loadRecords() {
    try {
      var raw = global.localStorage.getItem(STORAGE_RECORDS_KEY);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (e) { return {}; }
  }

  function _saveRecords() {
    try {
      var toStore = {};
      Object.keys(_palettes).forEach(function (id) {
        if (id === DEFAULT_PALETTE_ID) return; // Default is never serialized — always regenerated live
        toStore[id] = _palettes[id];
      });
      global.localStorage.setItem(STORAGE_RECORDS_KEY, JSON.stringify(toStore));
    } catch (e) { console.warn('[MapsPaletteAuthority] _saveRecords failed:', e && e.message || e); }
  }

  function _loadActiveId() {
    try { return global.localStorage.getItem(STORAGE_ACTIVE_KEY) || DEFAULT_PALETTE_ID; }
    catch (e) { return DEFAULT_PALETTE_ID; }
  }

  function _saveActiveId(id) {
    try { global.localStorage.setItem(STORAGE_ACTIVE_KEY, id); } catch (e) {}
  }

  // ── Schema migration — every palette always covers the full wired set ─────
  function _migrateAgainst(stored, defaultPalette) {
    var values = {};
    Object.keys(defaultPalette.values).forEach(function (id) {
      values[id] = (stored.values && Object.prototype.hasOwnProperty.call(stored.values, id))
        ? stored.values[id] : defaultPalette.values[id];
    });
    // Preserve any extra/unknown keys already stored (future-compatible data — never dropped).
    Object.keys(stored.values || {}).forEach(function (id) {
      if (!(id in values)) values[id] = stored.values[id];
    });
    return Object.assign({}, stored, { values: values });
  }

  function _buildDefaultPalette() {
    var values = {};
    _registryRecords.forEach(function (r) { values[r.id] = r.currentValue; });
    var now = Date.now();
    return { id: DEFAULT_PALETTE_ID, title: 'Default', values: values, createdAt: now, updatedAt: now };
  }

  // ── Apply ──────────────────────────────────────────────────────────────────
  function _applyValues(values) {
    var adapters = SBE.MapsPaletteApplyAdapters;
    if (!adapters) { console.warn('[MapsPaletteAuthority] MapsPaletteApplyAdapters not loaded'); return; }
    _registryRecords.forEach(function (r) {
      if (!Object.prototype.hasOwnProperty.call(values, r.id)) return; // schema-drift guard
      try { adapters.apply(r, values[r.id], _map); }
      catch (e) { console.warn('[MapsPaletteAuthority] apply failed for', r.id, ':', e && e.message || e); }
    });
  }

  // ── Cross-tab sync ─────────────────────────────────────────────────────────
  function _onStorageEvent(e) {
    if (e.key === STORAGE_ACTIVE_KEY) {
      var id = e.newValue;
      if (!id || id === _activeId) return;
      if (!_palettes[id]) {
        var incoming = _loadRecords();
        Object.keys(incoming).forEach(function (pid) {
          _palettes[pid] = _migrateAgainst(incoming[pid], _palettes[DEFAULT_PALETTE_ID]);
        });
      }
      if (!_palettes[id]) return; // still unknown — nothing safe to apply
      _activeId  = id;
      _previewId = null;
      _applyValues(_palettes[id].values);
      console.log('[MapsPaletteAuthority] cross-tab active palette →', id);
      _notify();
    } else if (e.key === STORAGE_RECORDS_KEY) {
      var records = _loadRecords();
      Object.keys(records).forEach(function (pid) {
        if (pid === DEFAULT_PALETTE_ID) return;
        _palettes[pid] = _migrateAgainst(records[pid], _palettes[DEFAULT_PALETTE_ID]);
      });
      // A property edit (not an activate/preview switch) on the palette this
      // tab is currently showing must still repaint this tab's own map —
      // same condition setPropertyValue() uses locally. Without this, only
      // switching which palette is active re-applies; editing a value on the
      // palette that's ALREADY active/previewed here silently no-ops until
      // the next activate, even though the edit is visible in the Library
      // that made it.
      var liveId = _previewId != null ? _previewId : _activeId;
      if (Object.prototype.hasOwnProperty.call(records, liveId) && _palettes[liveId]) {
        _applyValues(_palettes[liveId].values);
      }
      _notify();
    }
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  function init(map) {
    _map = map;
    var registry = SBE.MapsPaletteRegistry;
    if (!registry) { console.error('[MapsPaletteAuthority] MapsPaletteRegistry not loaded'); return { ok: false }; }
    _registryRecords = registry.buildRegistry(map);

    var defaultPalette = _buildDefaultPalette();
    _palettes = {};
    _palettes[DEFAULT_PALETTE_ID] = defaultPalette;

    var stored = _loadRecords();
    Object.keys(stored).forEach(function (id) {
      if (id === DEFAULT_PALETTE_ID) return;
      _palettes[id] = _migrateAgainst(stored[id], defaultPalette);
    });

    // Durable one-time seed: a fresh browser profile (never seeded before, no
    // saved palettes yet) receives Episode 2 as a real, persisted palette —
    // not something that only ever existed via manual console authoring.
    // Colors come from SBE.MapsPaletteSeeds (data, not UI code) and are
    // computed against THIS live registry, so schema always matches exactly.
    var alreadySeeded = false;
    try { alreadySeeded = !!global.localStorage.getItem(STORAGE_SEEDED_KEY); } catch (e) {}
    if (!alreadySeeded && Object.keys(stored).length === 0 && SBE.MapsPaletteSeeds) {
      try {
        var seed = SBE.MapsPaletteSeeds.buildEpisode2Seed(_registryRecords);
        var now = Date.now();
        _palettes[EPISODE_2_SEED_ID] = {
          id: EPISODE_2_SEED_ID, title: seed.title, values: seed.values,
          createdAt: now, updatedAt: now,
        };
        try { global.localStorage.setItem(STORAGE_SEEDED_KEY, '1'); } catch (e2) {}
      } catch (e) { console.warn('[MapsPaletteAuthority] Episode 2 seed failed:', e && e.message || e); }
    }

    _activeId = _loadActiveId();
    if (!_palettes[_activeId]) _activeId = DEFAULT_PALETTE_ID;
    _previewId = null; // never promote a preview on load — spec §8.2

    try { global.localStorage.setItem(STORAGE_SCHEMA_KEY, String(SCHEMA_VERSION)); } catch (e) {}
    _saveRecords();

    _applyValues(_palettes[_activeId].values);

    try { global.addEventListener('storage', _onStorageEvent); } catch (e) {}

    console.log('[MapsPaletteAuthority] init — ' + _registryRecords.length + ' wired properties, active:', _activeId);
    return { ok: true, wiredCount: _registryRecords.length, activeId: _activeId };
  }

  function isInitialized() { return !!_registryRecords; }
  function getRegistry() { return _registryRecords ? _registryRecords.slice() : []; }
  function getDeferredAudit() { return SBE.MapsPaletteRegistry ? SBE.MapsPaletteRegistry.getDeferredAudit() : []; }

  // ── CRUD ───────────────────────────────────────────────────────────────────
  function listPalettes() {
    return Object.keys(_palettes).map(function (id) { return _palettes[id]; })
      .sort(function (a, b) {
        if (a.id === DEFAULT_PALETTE_ID) return -1;
        if (b.id === DEFAULT_PALETTE_ID) return 1;
        return (a.createdAt || 0) - (b.createdAt || 0);
      });
  }

  function getPalette(id) { return _palettes[id] || null; }

  function createPalette(title) {
    var id   = _genId();
    var base = _palettes[DEFAULT_PALETTE_ID];
    var now  = Date.now();
    var p = { id: id, title: title || 'New Palette', values: Object.assign({}, base.values), createdAt: now, updatedAt: now };
    _palettes[id] = p;
    _saveRecords();
    _notify();
    return p;
  }

  function duplicatePalette(sourceId) {
    var src = _palettes[sourceId];
    if (!src) return null;
    var id  = _genId();
    var now = Date.now();
    var p = { id: id, title: src.title + ' Copy', values: Object.assign({}, src.values), createdAt: now, updatedAt: now };
    _palettes[id] = p;
    _saveRecords();
    _notify();
    return p;
  }

  // Default is a real, editable, inspectable palette — not locked infrastructure.
  // It represents the current map exactly at the moment it was generated; if a
  // user edits it directly that's a legitimate correction to the baseline, not
  // drift. (New named palettes should still be built by duplicating Default
  // first, per the standard workflow — that's a UI/process convention, not an
  // enforced restriction here.)
  function setPropertyValue(paletteId, propId, value) {
    var p = _palettes[paletteId];
    if (!p) return { ok: false, reason: 'not_found' };
    p.values[propId] = value;
    p.updatedAt = Date.now();
    _saveRecords();
    if (paletteId === _previewId || (paletteId === _activeId && _previewId == null)) {
      _applyValues(p.values);
    }
    _notify();
    return { ok: true };
  }

  // Default's title is protected (0729B §9) — swatch values remain editable
  // (0729A direction), but Default must stay identifiable as the canonical
  // baseline across sessions and screenshots, so renaming it is blocked.
  function renamePalette(id, title) {
    if (id === DEFAULT_PALETTE_ID) return { ok: false, reason: 'default_protected' };
    var p = _palettes[id];
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
  function activatePalette(id) {
    var p = _palettes[id];
    if (!p) return { ok: false, reason: 'not_found' };
    _activeId  = id;
    _previewId = null;
    _saveActiveId(id);
    _applyValues(p.values);
    _notify();
    return { ok: true };
  }

  function previewPalette(id) {
    var p = _palettes[id];
    if (!p) return { ok: false, reason: 'not_found' };
    _previewId = id;
    _applyValues(p.values);
    _notify();
    return { ok: true };
  }

  function endPreview() {
    if (_previewId == null) return { ok: true, noop: true };
    _previewId = null;
    var active = _palettes[_activeId];
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
    'Vehicles':   '#00ff88',
    'HUD':        '#8800ff',
  };

  function buildDiagnosticPalette() {
    var values = {};
    _registryRecords.forEach(function (r) {
      values[r.id] = DIAGNOSTIC_GROUP_COLORS[r.group] || '#ff2bd6';
    });
    return { id: DIAGNOSTIC_ID, title: 'Diagnostic Wiring Palette', values: values, diagnostic: true };
  }

  function _snapshotLive() {
    var adapters = SBE.MapsPaletteApplyAdapters;
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
  // *why*, rather than assuming it's a bug. Restores the prior active palette
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
    vehicle: ['HeroVehicleRenderer'],
    hud: ['EnvironmentalTelemetryHUD'],
  };
  function _sourceModulePresent(record) {
    var names = SOURCE_MODULE_NAMES[record.source];
    if (!names) return null; // not applicable (e.g. mapbox-style)
    return names.some(function (n) { return !!SBE[n]; });
  }

  function reconcileDiagnosticCoverage() {
    var savedActiveId  = _activeId;
    var savedPreviewId = _previewId;
    var baselineValues = (_palettes[_activeId] || _palettes[DEFAULT_PALETTE_ID]).values;
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
    var baselineValues = (_palettes[_activeId] || _palettes[DEFAULT_PALETTE_ID]).values;
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
    global._wos.debug.mapsPalette = {
      init:                 init,
      isInitialized:        isInitialized,
      list:                 listPalettes,
      get:                  getPalette,
      create:               createPalette,
      duplicate:            duplicatePalette,
      rename:               renamePalette,
      setPropertyValue:     setPropertyValue,
      activate:             activatePalette,
      preview:              previewPalette,
      endPreview:           endPreview,
      getActiveId:          getActiveId,
      getPreviewId:         getPreviewId,
      getRegistry:          getRegistry,
      getDeferredAudit:     getDeferredAudit,
      buildDiagnosticPalette: buildDiagnosticPalette,
      runDiagnosticSequence:  runDiagnosticSequence,
      reconcileDiagnosticCoverage: reconcileDiagnosticCoverage,
      runTests: function () {
        return SBE.MapsPaletteAuthorityTests ? SBE.MapsPaletteAuthorityTests.run() : { ok: false, reason: 'tests_not_loaded' };
      },
      // Network-independent: forces (re)init against a mock map first, so
      // this always runs regardless of real Mapbox/tile availability.
      runTestsOffline: function () {
        if (!SBE.MapsPaletteAuthorityTests) return { ok: false, reason: 'tests_not_loaded' };
        return SBE.MapsPaletteAuthorityTests.run(SBE.MapsPaletteAuthorityTests.createMockMap());
      },
    };
  }
  _wireDebug();

  SBE.MapsPaletteAuthority = {
    VERSION: VERSION,
    init: init,
    isInitialized: isInitialized,
    getRegistry: getRegistry,
    getDeferredAudit: getDeferredAudit,
    listPalettes: listPalettes,
    getPalette: getPalette,
    createPalette: createPalette,
    duplicatePalette: duplicatePalette,
    renamePalette: renamePalette,
    setPropertyValue: setPropertyValue,
    activatePalette: activatePalette,
    previewPalette: previewPalette,
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
    DEFAULT_PALETTE_ID: DEFAULT_PALETTE_ID,
    DIAGNOSTIC_ID: DIAGNOSTIC_ID,
    // Test-only accessors — never surfaced in production UI (Creative Interface
    // Doctrine applies to UI, not internal test hooks). Used by
    // mapsPaletteAuthority.tests.js only.
    __test: {
      getMap: function () { return _map; },
      getActiveIdFromStorage: function () {
        try { return global.localStorage.getItem(STORAGE_ACTIVE_KEY); } catch (e) { return null; }
      },
      migrateAgainstDefault: function (storedPaletteLike) {
        return _migrateAgainst(storedPaletteLike, _palettes[DEFAULT_PALETTE_ID]);
      },
      removePalette: function (id) { delete _palettes[id]; _saveRecords(); },
    },
  };

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

  console.log('[MapsPaletteAuthority] v' + VERSION + ' loaded');

})(window);
