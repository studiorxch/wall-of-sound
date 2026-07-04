// ── ThreeViewStyleParityLock v1.0.0 ──────────────────────────────────────────
// 0612F_WOS_ThreeViewStyleParityLock_v1.0.0_BUILD
// Status: active | Classification: support-system, governance-diagnostic, diagnostic-orchestration
// 0612G reclassification:
//   This module verifies and requests visual parity across Wall and Studio contexts.
//   It is not runtime truth.
//   It may report divergence and request convergence.
//   It must not own map style truth, replacement truth, manifest truth, or
//   building source truth.
//
// Purpose:
//   Single shared visual authority state for the three WOS building-edit views:
//     1. Wall (wall/index.html) — SBE.MapboxViewportRuntime
//     2. Studio Author (studio/index.html Map Lab, author mode) — WOSMapLab.MapboxAdapter
//     3. Studio Preview (studio/index.html Map Lab, preview mode) — same map, preview mode
//
//   Loaded in BOTH Wall and Studio via their respective index.html files.
//   Auto-detects context (Wall vs Studio) and reads/writes localStorage for
//   cross-tab state synchronization.
//
//   Canonical parity state: dark-v11 basemap, no Mapbox Standard import,
//   no Standard 3D buildings, WOS replacement layer present.
//
// Cross-tab mechanism:
//   Each context writes its snapshot to: wos:parityState:<context>
//   apply() writes desired lock to: wos:parityState:lock
//   storage event listener picks up changes from other tabs
//
// Authority:
//   READS:   MapboxViewportRuntime, WOSMapLab.MapboxAdapter, BuildingPreviewRuntime,
//            EditableBasemapAuthority, BuildingReplacementRuntime, localStorage
//   WRITES:  localStorage parity snapshots; calls EditableBasemapAuthority.activate()
//            in Wall; calls WOSMapLab.MapboxAdapter.setStyle('dark') in Studio
//   MUST NOT: modify replacement manifest, actor archetypes, suppression IDs,
//             atmosphere systems, camera, audio, overlay grammar
//
// Placement: wall/systems/presentation/threeViewStyleParityLock.js
// Load Wall:   AFTER editableBasemapAuthority.js
// Load Studio: AFTER mapboxAdapter.js (added to studio/index.html)
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var VERSION = '1.0.0';

  // ── Storage keys ─────────────────────────────────────────────────────────────

  var STORAGE_KEY_WALL   = 'wos:parityState:wall';
  var STORAGE_KEY_STUDIO = 'wos:parityState:studio';
  var STORAGE_KEY_LOCK   = 'wos:parityState:lock';

  // Canonical editable style — dark-v11 in both Wall and Studio
  var CANONICAL_STYLE_URL = 'mapbox://styles/mapbox/dark-v11';

  // ── Context detection ─────────────────────────────────────────────────────────
  // Wall:   SBE.MapboxViewportRuntime is present
  // Studio: WOSMapLab.MapboxAdapter is present
  // Detection is deferred to first use to handle load-order edge cases.

  var _context = null;  // 'wall' | 'studio' | 'unknown'
  var _snapshotTimer = null;

  function _detectContext() {
    if (_context) return _context;
    var hasSBE    = !!(global.SBE && global.SBE.MapboxViewportRuntime);
    var hasStudio = !!(global.WOSMapLab && global.WOSMapLab.MapboxAdapter);
    // Prefer the more specific runtime; if both present (shouldn't happen), Wall wins
    if (hasSBE)    _context = 'wall';
    else if (hasStudio) _context = 'studio';
    else _context = 'unknown';
    return _context;
  }

  // ── Map access ────────────────────────────────────────────────────────────────

  function _getWallMap() {
    try {
      var mvr = global.SBE && global.SBE.MapboxViewportRuntime;
      return (mvr && typeof mvr.getMap === 'function') ? mvr.getMap() : null;
    } catch (e) { return null; }
  }

  function _getStudioMap() {
    try {
      var adp = global.WOSMapLab && global.WOSMapLab.MapboxAdapter;
      return (adp && typeof adp.getMap === 'function') ? adp.getMap() : null;
    } catch (e) { return null; }
  }

  // ── Shared style detection helpers ────────────────────────────────────────────

  function _detectStandardImports(map) {
    try {
      var imports = (map.getStyle().imports) || [];
      return imports.some(function (i) {
        return i && i.url && i.url.indexOf('mapbox/standard') !== -1;
      });
    } catch (e) { return false; }
  }

  function _detectStandard3dLayers(map) {
    try {
      var layers = (map.getStyle().layers) || [];
      return layers.some(function (l) {
        return l.type === 'model' ||
          (l.type === 'fill-extrusion' &&
           (l['source-layer'] === 'building' || l['source-layer'] === 'buildings'));
      });
    } catch (e) { return false; }
  }

  function _getActiveStyleUrl(map) {
    try {
      var style   = map.getStyle();
      var imports = (style && style.imports) || [];
      if (imports.length > 0 && imports[0].url) return imports[0].url;
      // For non-import styles, use the sprite URL as a proxy or fall back
      return style && style.sprite ? style.sprite.split('/sprite')[0] : null;
    } catch (e) { return null; }
  }

  function _getReplacementLayerPaint(map) {
    try {
      var color   = null;
      var opacity = null;
      try { color   = map.getPaintProperty('wos-replacement-layer', 'fill-extrusion-color');   } catch (e) {}
      try { opacity = map.getPaintProperty('wos-replacement-layer', 'fill-extrusion-opacity'); } catch (e) {}
      return { color: color, opacity: opacity };
    } catch (e) { return { color: null, opacity: null }; }
  }

  // ── Wall snapshot ─────────────────────────────────────────────────────────────

  function _snapshotWallState() {
    var map = _getWallMap();
    if (!map) return { context: 'wall', error: 'map_not_ready', capturedAt: Date.now() };

    var mvr = global.SBE && global.SBE.MapboxViewportRuntime;
    var eba = global.SBE && global.SBE.EditableBasemapAuthority;
    var brt = global.SBE && global.SBE.BuildingReplacementRuntime;
    var proj = global.SBE && global.SBE.BuildingEditProjectionRuntime;

    var isPresentationMode = mvr && typeof mvr.isPresentationMode === 'function'
      ? mvr.isPresentationMode() : null;

    var ebaState = null;
    try {
      ebaState = eba && typeof eba.state === 'function' ? eba.state() : null;
    } catch (e) {}

    var editableActive = !!(ebaState && ebaState.active);

    var brtStatus = null;
    try { brtStatus = brt && typeof brt.status === 'function' ? brt.status() : null; } catch (e) {}

    var selectedBuildingKey = null;
    try {
      if (proj && typeof proj.status === 'function') {
        var ps = proj.status();
        selectedBuildingKey = (ps && ps.activeBuildingKey) || null;
      }
    } catch (e) {}

    var sourceHiddenState = {};
    try {
      if (proj && typeof proj.getSuppressionIds === 'function') {
        var ids = proj.getSuppressionIds();
        (ids || []).forEach(function (id) { sourceHiddenState[id] = true; });
      }
    } catch (e) {}

    var styleUrl = editableActive
      ? CANONICAL_STYLE_URL
      : _getActiveStyleUrl(map);

    return {
      context:                       'wall',
      capturedAt:                    Date.now(),
      styleMode:                     editableActive ? 'editable-flat'
                                     : isPresentationMode ? 'presentation' : 'operator',
      styleUrl:                      styleUrl,
      presentationMode:              isPresentationMode,
      editableBasemapActive:         editableActive,
      atmosphericFilterProfile:      null,   // reserved
      standardImportPresence:        _detectStandardImports(map),
      standard3dBuildingLayerPresence: _detectStandard3dLayers(map),
      replacementLayerPaint:         _getReplacementLayerPaint(map),
      selectedBuildingKey:           selectedBuildingKey,
      selectedReplacementArchetype:  null,   // reserved
      selectedReplacementColor:      null,   // reserved
      sourceHiddenState:             sourceHiddenState,
      wosReplacementLayerExists:     !!(function () {
        try { return !!map.getLayer('wos-replacement-layer'); } catch (e) { return false; }
      })(),
      activeReplacementCount:        brtStatus ? brtStatus.activeReplacements : 0,
      studioMode:                    null,
    };
  }

  // ── Studio snapshot ───────────────────────────────────────────────────────────

  function _snapshotStudioState() {
    var map = _getStudioMap();
    if (!map) return { context: 'studio', error: 'map_not_ready', capturedAt: Date.now() };

    var adp   = global.WOSMapLab.MapboxAdapter;
    var preRt = global.WOSMapLab.BuildingPreviewRuntime;
    var sel   = global.WOSMapLab.MapSelection;

    var parityData = null;
    try { parityData = adp && typeof adp.styleParityStatus === 'function'
      ? adp.styleParityStatus() : null; } catch (e) {}

    var studioMode = 'author';
    try {
      studioMode = preRt && typeof preRt.getMode === 'function'
        ? preRt.getMode() : 'author';
    } catch (e) {}

    var selectedBuildingKey = null;
    try {
      selectedBuildingKey = sel && typeof sel.getSelection === 'function'
        ? sel.getSelection() : null;
    } catch (e) {}

    var activeStyleUrl = (parityData && parityData.activeStyleUrl) || _getActiveStyleUrl(map);

    var sourceHiddenState = {};
    try {
      if (parityData && parityData.sourceSuppressionActive) {
        // MapboxAdapter tracks hidden IDs internally; report count only
        sourceHiddenState._hiddenCount = parityData.hiddenSourceProjectionCount || 0;
      }
    } catch (e) {}

    var previewLayerPaint = _getReplacementLayerPaint(map);
    try {
      // If preview layer has a different ID in Studio, try it
      if (!previewLayerPaint.color) {
        var c = map.getPaintProperty('maplab-preview-layer', 'fill-extrusion-color');
        var o = map.getPaintProperty('maplab-preview-layer', 'fill-extrusion-opacity');
        if (c) previewLayerPaint = { color: c, opacity: o };
      }
    } catch (e) {}

    return {
      context:                       'studio',
      capturedAt:                    Date.now(),
      styleMode:                     activeStyleUrl === CANONICAL_STYLE_URL ? 'editable-flat'
                                     : activeStyleUrl ? 'presentation' : 'unknown',
      styleUrl:                      activeStyleUrl,
      presentationMode:              activeStyleUrl !== CANONICAL_STYLE_URL,
      editableBasemapActive:         activeStyleUrl === CANONICAL_STYLE_URL,
      atmosphericFilterProfile:      null,
      standardImportPresence:        _detectStandardImports(map),
      standard3dBuildingLayerPresence: _detectStandard3dLayers(map),
      replacementLayerPaint:         previewLayerPaint,
      selectedBuildingKey:           selectedBuildingKey,
      selectedReplacementArchetype:  null,
      selectedReplacementColor:      null,
      sourceHiddenState:             sourceHiddenState,
      wosReplacementLayerExists:     !!(function () {
        try { return !!map.getLayer('wos-replacement-layer'); } catch (e) { return false; }
      })(),
      activeReplacementCount:        0,   // Studio doesn't run BuildingReplacementRuntime
      studioMode:                    studioMode,
    };
  }

  // ── Snapshot write / read ─────────────────────────────────────────────────────

  function _writeSnapshot() {
    var ctx = _detectContext();
    try {
      var snap = ctx === 'wall' ? _snapshotWallState() : _snapshotStudioState();
      var key  = ctx === 'wall' ? STORAGE_KEY_WALL : STORAGE_KEY_STUDIO;
      global.localStorage.setItem(key, JSON.stringify(snap));
    } catch (e) {}
  }

  function _readStoredSnapshot(context) {
    try {
      var key = context === 'wall' ? STORAGE_KEY_WALL : STORAGE_KEY_STUDIO;
      var raw = global.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  // ── Mismatch detection ────────────────────────────────────────────────────────
  //
  // Fields that MUST match for visual debugging to be valid.
  // selectedBuildingKey and sourceHiddenState are data-state — not forced by apply().

  var PARITY_FIELDS = [
    'styleUrl',
    'standardImportPresence',
    'standard3dBuildingLayerPresence',
    'editableBasemapActive',
    'presentationMode',
  ];

  function _detectMismatches(wallSnap, studioSnap) {
    var mismatches = [];
    if (!wallSnap || !studioSnap) return mismatches;
    PARITY_FIELDS.forEach(function (field) {
      var wv = wallSnap[field];
      var sv = studioSnap[field];
      if (JSON.stringify(wv) !== JSON.stringify(sv)) {
        mismatches.push({
          field:        field,
          wall:         wv,
          studioAuthor: sv,
          studioPreview: sv,
        });
      }
    });
    // replacementLayerPaint — compare color only (opacity may legitimately differ)
    var wPaint = wallSnap.replacementLayerPaint;
    var sPaint = studioSnap.replacementLayerPaint;
    if (wPaint && sPaint && wPaint.color !== sPaint.color && wPaint.color && sPaint.color) {
      mismatches.push({
        field:         'replacementLayerPaint.color',
        wall:          wPaint.color,
        studioAuthor:  sPaint.color,
        studioPreview: sPaint.color,
      });
    }
    return mismatches;
  }

  // ── Apply canonical state ─────────────────────────────────────────────────────

  function _applyToWall() {
    var map = _getWallMap();
    if (!map) { console.warn('[ThreeViewStyleParityLock] apply: Wall map not ready'); return false; }
    var eba = global.SBE && global.SBE.EditableBasemapAuthority;
    if (!eba || typeof eba.activate !== 'function') {
      console.warn('[ThreeViewStyleParityLock] apply: EditableBasemapAuthority not available');
      return false;
    }
    // Only switch if not already on the editable basemap
    var ebaState = null;
    try { ebaState = eba.state(); } catch (e) {}
    if (!ebaState || !ebaState.active) {
      console.log('[ThreeViewStyleParityLock] apply: activating editable basemap on Wall');
      eba.activate();
    } else {
      console.log('[ThreeViewStyleParityLock] apply: Wall already on editable basemap');
    }
    return true;
  }

  function _applyToStudio() {
    var map = _getStudioMap();
    if (!map) { console.warn('[ThreeViewStyleParityLock] apply: Studio map not ready'); return false; }
    var adp = global.WOSMapLab && global.WOSMapLab.MapboxAdapter;
    if (!adp || typeof adp.setStyle !== 'function') {
      console.warn('[ThreeViewStyleParityLock] apply: WOSMapLab.MapboxAdapter.setStyle not available');
      return false;
    }
    var current = null;
    try { current = map.getStyle(); } catch (e) {}
    var currentUrl = _getActiveStyleUrl(map);
    if (currentUrl !== CANONICAL_STYLE_URL) {
      console.log('[ThreeViewStyleParityLock] apply: switching Studio to dark-v11');
      adp.setStyle('dark');
    } else {
      console.log('[ThreeViewStyleParityLock] apply: Studio already on dark-v11');
    }
    return true;
  }

  // ── Cross-tab notification ────────────────────────────────────────────────────

  function _writeLock() {
    try {
      global.localStorage.setItem(STORAGE_KEY_LOCK, JSON.stringify({
        desiredStyleMode: 'editable-flat',
        desiredStyleUrl:  CANONICAL_STYLE_URL,
        requestedAt:      Date.now(),
        requestedBy:      _detectContext(),
      }));
    } catch (e) {}
  }

  function _onStorageEvent(e) {
    if (e.key !== STORAGE_KEY_LOCK) return;
    try {
      var lock = e.newValue ? JSON.parse(e.newValue) : null;
      if (!lock) return;
      // Another tab requested parity — apply to this context
      console.log('[ThreeViewStyleParityLock] received lock request from', lock.requestedBy,
        '— applying to', _detectContext());
      var ctx = _detectContext();
      if (ctx === 'wall') _applyToWall();
      else if (ctx === 'studio') _applyToStudio();
      // Write updated snapshot
      setTimeout(_writeSnapshot, 500);
    } catch (e) {
      console.warn('[ThreeViewStyleParityLock] storage event error:', e.message || e);
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  // report() — raw state snapshot of all three views from localStorage + current context.
  function report() {
    _writeSnapshot();   // refresh current context first
    var wallSnap   = _readStoredSnapshot('wall');
    var studioSnap = _readStoredSnapshot('studio');

    // Studio author/preview share the same underlying map state; only mode differs
    var studioAuthorSnap  = studioSnap
      ? Object.assign({}, studioSnap, { studioMode: 'author' }) : null;
    var studioPreviewSnap = studioSnap
      ? Object.assign({}, studioSnap, { studioMode: 'preview' }) : null;

    return {
      version:     VERSION,
      capturedAt:  Date.now(),
      currentContext: _detectContext(),
      views: {
        wall:          wallSnap,
        studioAuthor:  studioAuthorSnap,
        studioPreview: studioPreviewSnap,
      },
    };
  }

  // verify() — returns parity report with mismatch list.
  function verify() {
    _writeSnapshot();
    var wallSnap   = _readStoredSnapshot('wall');
    var studioSnap = _readStoredSnapshot('studio');

    var mismatches = _detectMismatches(wallSnap, studioSnap);
    var parityOk   = mismatches.length === 0
      && !!wallSnap && !wallSnap.error
      && !!studioSnap && !studioSnap.error;

    var studioAuthorSnap  = studioSnap
      ? Object.assign({}, studioSnap, { studioMode: 'author' }) : null;
    var studioPreviewSnap = studioSnap
      ? Object.assign({}, studioSnap, { studioMode: 'preview' }) : null;

    var result = {
      version:        VERSION,
      parityOk:       parityOk,
      currentContext: _detectContext(),
      views: {
        wall:          wallSnap,
        studioAuthor:  studioAuthorSnap,
        studioPreview: studioPreviewSnap,
      },
      mismatches: mismatches,
    };

    console.log('[ThreeViewStyleParityLock] verify:', parityOk ? 'PASS' : 'FAIL',
      '|', mismatches.length, 'mismatch(es)',
      mismatches.length ? '| fields: ' + mismatches.map(function (m) { return m.field; }).join(', ') : '');

    return result;
  }

  // apply() — forces current context into canonical parity state,
  // writes lock to localStorage so the other tab applies it too.
  function apply() {
    var ctx = _detectContext();
    console.log('[ThreeViewStyleParityLock] apply() called from context:', ctx);

    var ok = false;
    if (ctx === 'wall') ok = _applyToWall();
    else if (ctx === 'studio') ok = _applyToStudio();

    // Write lock for other tab to pick up via storage event
    _writeLock();

    // Write this context's snapshot after a brief wait for style to settle
    setTimeout(function () {
      _writeSnapshot();
      var v = verify();
      console.log('[ThreeViewStyleParityLock] apply() post-verify | parityOk:', v.parityOk,
        '| mismatches:', v.mismatches.length);
    }, 300);

    return {
      version:       VERSION,
      appliedContext: ctx,
      applyOk:        ok,
      lockWritten:    true,
    };
  }

  // ── Auto-snapshot on style events ─────────────────────────────────────────────

  function _hookStyleEvents() {
    var ctx = _detectContext();
    if (ctx === 'wall') {
      var mvr = global.SBE && global.SBE.MapboxViewportRuntime;
      if (mvr && typeof mvr.onStyleLoad === 'function') {
        mvr.onStyleLoad(function () { setTimeout(_writeSnapshot, 200); });
      }
    } else if (ctx === 'studio') {
      var map = _getStudioMap();
      if (map) {
        map.on('styledata', function () {
          if (_snapshotTimer) clearTimeout(_snapshotTimer);
          _snapshotTimer = setTimeout(_writeSnapshot, 300);
        });
      }
    }
  }

  // ── Initialization ────────────────────────────────────────────────────────────

  function _rewireDebug() {
    global._wos             = global._wos             || {};
    global._wos.debug       = global._wos.debug       || {};
    global._wos.debug.mapViewParity = {
      verify:        verify,
      apply:         apply,
      report:        report,
      writeSnapshot: _writeSnapshot,
    };
  }

  function init() {
    var ctx = _detectContext();
    if (ctx === 'unknown') {
      // Retry once in case neither runtime has initialized yet
      setTimeout(function () {
        _context = null;  // reset so detection re-runs
        var ctx2 = _detectContext();
        if (ctx2 !== 'unknown') {
          console.log('[ThreeViewStyleParityLock] v' + VERSION + ' initialized (delayed) | context:', ctx2);
          _hookStyleEvents();
          _writeSnapshot();
        } else {
          console.warn('[ThreeViewStyleParityLock] could not detect context — neither Wall nor Studio runtime found');
        }
      }, 1000);
      return;
    }
    try { global.addEventListener('storage', _onStorageEvent); } catch (e) {}
    _hookStyleEvents();
    _writeSnapshot();

    // Re-wire debug surface after main.js's onReady callback fires and wipes _wos.debug.
    // Wall: use MapboxViewportRuntime.onReady() so this fires after main.js's callback.
    // Studio: use setTimeout as fallback (no equivalent onReady chain).
    if (ctx === 'wall') {
      var mvr = global.SBE && global.SBE.MapboxViewportRuntime;
      if (mvr && typeof mvr.onReady === 'function') {
        mvr.onReady(_rewireDebug);
      } else {
        setTimeout(_rewireDebug, 3000);
      }
    } else {
      // Studio boots synchronously; main.js doesn't run here, so immediate wire is fine.
      _rewireDebug();
    }

    console.log('[ThreeViewStyleParityLock] v' + VERSION + ' initialized | context:', ctx);
  }

  // ── Export ────────────────────────────────────────────────────────────────────

  var _api = Object.freeze({
    VERSION:        VERSION,
    CANONICAL_STYLE_URL: CANONICAL_STYLE_URL,
    report:         report,
    verify:         verify,
    apply:          apply,
    writeSnapshot:  _writeSnapshot,
  });

  // Wall: SBE namespace
  if (global.SBE) {
    global.SBE.ThreeViewStyleParityLock = _api;
  }

  // Studio: WOSMapLab namespace
  if (global.WOSMapLab) {
    global.WOSMapLab.ThreeViewStyleParityLock = _api;
  }

  // Top-level console shortcuts
  global.wosParityVerify = verify;
  global.wosParityApply  = apply;
  global.wosParityReport = report;

  init();

  console.log('[ThreeViewStyleParityLock] v' + VERSION +
    ' loaded | _wos.debug.mapViewParity.verify() | .apply() | .report()');

})(window);
