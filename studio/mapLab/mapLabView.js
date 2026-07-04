// ── MapLab — View Coordinator v1.16.0 ────────────────────────────────────────
// 0610O_WOS_MapLabAuthorCueIsolation_v1.0.0_BUILD
// Prior: 0610N_WOS_MapboxStyleParityAudit_v1.0.0_BUILD
// Prior: 0610M_WOS_SourceBuildingHideAuthority_v1.0.0_BUILD
// Prior: 0610L_WOS_ReplacementDeleteAuthority_v1.0.0_BUILD
// Prior: 0610K_WOS_CompoundBuildingAuthority_v1.0.0_BUILD
// Prior: 0610J_WOS_ReplacementBuildingGroupAuthority_v1.0.0_BUILD
// Prior: 0610G_WOS_ReplacementStudioWallParity_v1.0.0_BUILD
// Prior: 0610D_WOS_ReplacementGeometryAlignmentAudit_v1.0.0
// Prior: 0609U_WOS_BuildingReplacementProjection
// Status: active | Classification: studio-maplab
//
// v1.16.0 — Author mode footprint suppression parity (0610Q): all Author-mode
//            applyRegistryEdits() calls replaced with _applyAuthorRegistryState()
//            which passes full manifest (buildings+groups+compounds) so adapter
//            performs footprint-aware, group-aware, compound-aware suppression.
// v1.15.2 — Author mode source suppression (0610P): _onHiddenChange() now calls
//            adapter.applyRegistryEdits() in Author mode so hidden:true buildings
//            immediately disappear from the Studio map. No color/replacement projection.
// v1.15.1 — Author cue isolation (0610O): _updateAuthorBadge() helper wired into
//            onChange, _refreshAfterChange, _refreshAfterHideRestore. Badge updates
//            on selection/edit change, clears on deselect. No map paint mutation.
// v1.14.0 — Style parity (0610N): _addBuildingLayer no longer repaints
//            style-owned fill-extrusion layers on load. Track _fallbackBuildingLayerCreated.
//            styleParityStatus() debug shortcut exposed.
// v1.13.0 — Source building hide/restore (0610M): _onHideSourceBuilding(),
//            _onRestoreSourceBuilding(). Persist hidden: true/false on untouched
//            Mapbox buildings. Refresh visual without clearing selection. Renames
//            inspector button labels. WOSMapLab.sourceHideStatus() debug shortcut.
// v1.12.0 — Delete Authored Edit (0610L): _onDeleteSelected() — hierarchy-aware
//            deletion (compound > group > standalone). Confirms before group/
//            compound delete. Clears selection + refreshes visual + re-renders
//            inspector. WOSMapLab.deleteSelectedTarget() debug shortcut.
// v1.11.0 — Compound buildings (0610K): compound draft state (_compoundDraft),
//            compound callbacks (_onStartCompound, _onAddToCompound,
//            _onFinishCompound, _onCancelCompound, _onUngroupCompound,
//            _onCompoundMetaChange). _computeCompoundState(bKey). 3-tier
//            _onReplacementChange routing (compound > group > standalone).
//            WOSMapLab.compoundStatus() debug shortcut.
// v1.10.0 — Building groups: group draft state (_groupDraft), group callbacks
//            (_onStartGroup, _onAddToGroup, _onFinishGroup, _onCancelGroup,
//            _onUngroup). Inspector receives groupState / groupDraftCount /
//            groupMemberCount. onReplacementChange routes to group when selection
//            belongs to a group. WOSMapLab.groupStatus() debug shortcut.
// v1.9.0 — Author/Preview mode toggle: BuildingPreviewRuntime wired; mode bar
//           injected into map wrapper; setMode/refresh called on replacement changes
//           and style loads; WOSMapLab.previewStatus() shortcut exposed.
// v1.8.0 — geometry capture on selection: _persistGeometry() captures a compact
//           geometry snapshot (centroid, bounds, widthM, depthM, areaM2, heading,
//           height, featureId, capturedAt) from the selected Mapbox building feature
//           via MapSelection.normalizeFeatureGeometry() and persists it into
//           BuildingEditRegistry immediately on every selection event.
//           Wall BuildingReplacementRuntime prefers this manifest geometry over its
//           own querySourceFeatures result (geometryAuthority: "manifest").
// v1.7.0 — replacement authoring: _onReplacementChange(); inspector wired with
//           onReplacementChange; savedEdit passes replacement to inspector;
//           applyRegistryEdits called after replacement change; debugReplacements().
// v1.6.0 — persist color/hidden/notes/tags via BuildingEditRegistry; restore on
//           style load; inspector wired to onNotesChange/onTagsChange/onHiddenChange
//           /onReset callbacks; exportEdits/importEdits/clearEdits on MapLabView API.
// v1.5.2 — status bar shows active style key (Style[dark] / Style[wos]).
// v1.5.1 — resize canvas at 50ms+250ms after init; tile-error detection.
// v1.5.0 — fix init freeze: _updateStatus() try/catch; debugInit().
// v1.4.1 — fix re-entrant enter() via early _initialized = true.
// v1.4.0 — outline layer, status banner, inspector layer metadata.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var CONTAINER_ID  = 'maplab-map';
  var INSPECTOR_ID  = 'studio-inspector-body';
  var STAGE_ID      = 'studio-stage-body';

  var _initialized  = false;
  var _unsubscribe  = null;
  var _clickHandler = null;
  var _resizeObs    = null;
  var _wrapperEl    = null; // persisted across studioShell body clears
  var _statusEl     = null; // status banner element (child of _wrapperEl)
  var _modeBtnAuthor  = null;  // 0610G: Author mode button ref
  var _modeBtnPreview = null;  // 0610G: Preview mode button ref
  var _libBtnEl       = null;  // 0612H: Library overlay toggle button

  // 0610J: building group draft — null when no draft is active.
  // { memberKeys: string[] } during group construction.
  var _groupDraft = null;

  // 0610K: compound draft — null when no draft is active.
  // { name: string, kind: string, members: string[] } during compound construction.
  var _compoundDraft = null;

  // 0610N: true when WOS created the fallback maplab-buildings-3d layer
  // (i.e., no fill-extrusion layer existed in the active Mapbox style).
  var _fallbackBuildingLayerCreated = false;

  // 0610O: floating author-badge DOM element (child of _wrapperEl).
  var _badgeEl = null;

  function _adapter()   { return global.WOSMapLab && global.WOSMapLab.MapboxAdapter; }
  function _selection() { return global.WOSMapLab && global.WOSMapLab.MapSelection; }
  function _inspector() { return global.WOSMapLab && global.WOSMapLab.MapInspector; }
  function _registry()  { return global.WOSMapLab && global.WOSMapLab.BuildingEditRegistry; }
  function _preview()   { return global.WOSMapLab && global.WOSMapLab.BuildingPreviewRuntime; }

  // ── Stage rendering ───────────────────────────────────────────────────────────

  function renderStage() {
    var body = global.document.getElementById(STAGE_ID);
    if (!body) return;
    body.innerHTML = '';

    if (!_wrapperEl) {
      _wrapperEl = global.document.createElement('div');
      _wrapperEl.id        = 'maplab-map-wrapper';
      _wrapperEl.className = 'maplab-map-wrapper';

      var mapEl = global.document.createElement('div');
      mapEl.id        = CONTAINER_ID;
      mapEl.className = 'maplab-map-container';

      var hint = global.document.createElement('div');
      hint.className   = 'maplab-hint';
      hint.textContent = 'Click any building to select it.';

      _statusEl = global.document.createElement('div');
      _statusEl.id        = 'maplab-status-bar';
      _statusEl.className = 'maplab-status-bar';
      _statusEl.textContent = 'Map Lab · initializing…';

      // 0610G: Author / Preview mode toggle bar
      var modeBar = global.document.createElement('div');
      modeBar.className = 'maplab-mode-bar';

      _modeBtnAuthor = global.document.createElement('button');
      _modeBtnAuthor.className   = 'maplab-mode-btn active';
      _modeBtnAuthor.textContent = 'Author';
      _modeBtnAuthor.title       = 'Authoring view — editing cues and selection active';
      _modeBtnAuthor.addEventListener('click', function () { _setMapMode('author'); });

      _modeBtnPreview = global.document.createElement('button');
      _modeBtnPreview.className   = 'maplab-mode-btn';
      _modeBtnPreview.textContent = 'Preview';
      _modeBtnPreview.title       = 'Preview view — replacement actors rendered, originals suppressed';
      _modeBtnPreview.addEventListener('click', function () { _setMapMode('preview'); });

      modeBar.appendChild(_modeBtnAuthor);
      modeBar.appendChild(_modeBtnPreview);

      // 0610O: author badge — floats near top-center of map, shows authored state
      _badgeEl = global.document.createElement('div');
      _badgeEl.className = 'maplab-author-badge';
      _badgeEl.style.display = 'none'; // hidden until a building with authored state is selected

      // 0612H: Library toggle button — top-left overlay, opens library as drawer
      _libBtnEl = global.document.createElement('button');
      _libBtnEl.className   = 'maplab-lib-btn';
      _libBtnEl.textContent = 'Library';
      _libBtnEl.title       = 'Toggle Library panel';
      _libBtnEl.addEventListener('click', function () {
        var shell = global.document.querySelector('.studio-shell');
        if (!shell) return;
        var isOpen = shell.classList.toggle('maplab-lib-open');
        _libBtnEl.classList.toggle('open', isOpen);
      });

      _wrapperEl.appendChild(mapEl);
      _wrapperEl.appendChild(modeBar);
      _wrapperEl.appendChild(_libBtnEl);
      _wrapperEl.appendChild(_badgeEl);
      _wrapperEl.appendChild(hint);
      _wrapperEl.appendChild(_statusEl);
    }

    body.appendChild(_wrapperEl);
  }

  // ── Mode toggle (0610G) ───────────────────────────────────────────────────────

  // _setMapMode — single visual authority gate (0610H).
  //
  //   Author  → Preview:  clear author cue projection first, then activate preview actor.
  //   Preview → Author:   deactivate preview actor first, then restore author cue from registry.
  //
  // Only one visual system is active at a time. Neither transition crashes on partial
  // failure — errors are caught and the mode buttons still update to reflect intent.
  function _setMapMode(mode) {
    var pr       = _preview();
    var adapter  = _adapter();
    var registry = _registry();
    try {
      if (mode === 'preview') {
        // 1. Kill author cue so replacement archetype colors don't persist under the preview actor.
        if (adapter && typeof adapter.clearRegistryProjection === 'function') {
          try { adapter.clearRegistryProjection(); } catch (e) {}
        }
        // 2. Activate preview layer + suppression.
        if (pr && typeof pr.setMode === 'function') pr.setMode('preview');
      } else {
        // 1. Deactivate preview layer + restore original building opacity.
        if (pr && typeof pr.setMode === 'function') pr.setMode('author');
        // 2. Re-project author cues from registry so editable buildings are visible again.
        if (adapter && registry) {
          try { _applyAuthorRegistryState(adapter, registry); } catch (e) {}
        }
      }
    } catch (e) {
      console.warn('[MapLabView] _setMapMode error:', e.message || e);
    }
    // Update button active state regardless of any partial error
    if (_modeBtnAuthor)  _modeBtnAuthor.className  = 'maplab-mode-btn' + (mode === 'author'  ? ' active' : '');
    if (_modeBtnPreview) _modeBtnPreview.className = 'maplab-mode-btn' + (mode === 'preview' ? ' active preview-active' : '');
  }

  // _isPreviewMode — true when the preview runtime is currently in preview mode.
  function _isPreviewMode() {
    var pr = _preview();
    return !!(pr && typeof pr.getMode === 'function' && pr.getMode() === 'preview');
  }

  // ── Status banner ─────────────────────────────────────────────────────────────

  function _updateStatus() {
    if (!_statusEl) return;
    try {
      var adapter = _adapter();
      if (!adapter) { _statusEl.textContent = 'Map Lab · adapter not loaded'; return; }
      var s = adapter.getStatus();
      var dots = [
        _dot(s.mapLoaded,           'Map'),
        _dot(s.styleLoaded,         'Style[' + (s.activeStyle || '?') + ']'),
        _dot(s.candidateLayers > 0, 'Layers:' + s.candidateLayers),
        _dot(s.outlineLayer,        'Outline'),
      ];
      var selected = s.selectedId != null
        ? ('Selected: ' + s.selectedLayerId + ' #' + s.selectedId)
        : 'Selected: —';
      _statusEl.textContent = dots.join(' · ') + ' · ' + selected;
    } catch (e) {
      try { _statusEl.textContent = 'Map Lab · status error'; } catch (_) {}
    }
  }

  function _dot(ok, label) {
    return (ok ? '✓' : '○') + ' ' + label;
  }

  // ── Layer setup ───────────────────────────────────────────────────────────────

  function _setupLayers(map, adapter, inspector) {
    _addBuildingLayer(map);
    var discovered = adapter.discoverBuildingLayers();
    adapter.addOutlineLayer();
    console.log('[MapLabView] discovered building layers:', discovered.map(function(l){return l.id;}));
    _restoreEdits(adapter);
    if (inspector) inspector.renderEmpty(INSPECTOR_ID, 'Click a building to select it.');
    _updateStatus();
    // 0610G: hand map to preview runtime so it can track style reloads
    var pr = _preview();
    if (pr && typeof pr.init === 'function') {
      try { pr.init(map); } catch (e) {}
    }
  }

  // ── Edit persistence ──────────────────────────────────────────────────────────

  function _restoreEdits(adapter) {
    var reg = _registry();
    if (!reg) return;
    var adp = adapter || _adapter();
    try {
      var restored = _applyAuthorRegistryState(adp, reg);
      if (restored) console.log('[MapLabView] restored', restored, 'persisted edit(s)');
    } catch (e) {
      console.warn('[MapLabView] _restoreEdits failed:', e.message || e);
    }
  }

  // _applyAuthorRegistryState — 0610Q: centralized helper so all Author-mode call
  // sites pass the full manifest (buildings + groups + compounds) to the adapter.
  // This enables footprint-aware, group-aware, compound-aware hidden suppression.
  function _applyAuthorRegistryState(adp, reg) {
    if (!adp || !reg || typeof adp.applyRegistryEdits !== 'function') return 0;
    var edits     = reg.getAll ? reg.getAll() : {};
    var groups    = reg.getGroups    ? reg.getGroups()    : {};
    var compounds = reg.getCompounds ? reg.getCompounds() : {};
    return adp.applyRegistryEdits(edits, { groups: groups, compounds: compounds });
  }

  // ── Building candidate test ───────────────────────────────────────────────────

  function _isBuildingFeature(f) {
    if (!f || !f.layer) return false;
    var type = f.layer.type;
    var sl   = f.sourceLayer || (f.layer && f.layer['source-layer']) || '';
    if (type === 'fill-extrusion') return true;
    if ((type === 'fill') && /building/i.test(sl)) return true;
    if (/building/i.test(f.layer.id || '')) return true;
    return false;
  }

  // ── Geometry capture (0610D) ──────────────────────────────────────────────────

  // _persistGeometry — captures a compact geometry snapshot from the raw Mapbox
  // building feature and persists it into BuildingEditRegistry under the building
  // key. Called immediately on every selection event so the Wall replacement
  // runtime can use Studio-authoritative geometry instead of guessing via
  // querySourceFeatures.
  //
  // The snapshot is additive; existing edits (color, hidden, replacement, etc.)
  // are unchanged. The registry's isEmpty guard preserves entries with geometry
  // even when no other edits are present.
  function _persistGeometry(feature, bKey, registry) {
    try {
      var selModule = _selection();
      if (!selModule || typeof selModule.normalizeFeatureGeometry !== 'function') return;
      var geomSnap = selModule.normalizeFeatureGeometry(feature);
      if (!geomSnap) return;
      registry.set(bKey, { geometry: geomSnap });
    } catch (e) {
      console.warn('[MapLabView] geometry capture failed:', e.message || e);
    }
  }

  // ── Group state helpers (0610J) ───────────────────────────────────────────────

  // _computeGroupState(bKey) — returns group state for the given building key.
  // Priority: existing group membership > active draft.
  function _computeGroupState(bKey) {
    if (!bKey) return { state: 'none' };
    var registry = _registry();
    if (!registry) return { state: 'none' };

    // Is this building a member of an existing group?
    var groupId = null;
    try { groupId = registry.findGroupByMember(bKey); } catch (e) {}
    if (groupId) {
      var group = null;
      try { group = registry.getGroup(groupId); } catch (e) {}
      return {
        state:        'member',
        groupId:      groupId,
        memberCount:  group ? group.members.length : 0,
        replacement:  group ? (group.replacement || null) : null,
      };
    }

    // Is there an active group draft?
    if (_groupDraft) {
      return {
        state:      'draft',
        memberCount: _groupDraft.memberKeys.length,
      };
    }

    return { state: 'none' };
  }

  // ── Compound state helpers (0610K) ───────────────────────────────────────────

  // _computeCompoundState(bKey) — returns compound state for the selected building.
  // Checks direct compound membership first, then membership via group.
  function _computeCompoundState(bKey) {
    if (!bKey) return { state: 'none' };
    var registry = _registry();
    if (!registry) return { state: 'none' };

    // Direct compound membership?
    var compoundId = null;
    try { compoundId = registry.findCompoundByMember(bKey); } catch (e) {}

    // Via group?
    if (!compoundId) {
      var groupId = null;
      try { groupId = registry.findGroupByMember(bKey); } catch (e) {}
      if (groupId) {
        try { compoundId = registry.findCompoundByMember(groupId); } catch (e) {}
      }
    }

    if (compoundId) {
      var compound = null;
      try { compound = registry.getCompound(compoundId); } catch (e) {}
      return {
        state:       'member',
        compoundId:  compoundId,
        name:        compound ? (compound.name || 'Compound') : 'Compound',
        kind:        compound ? (compound.kind || 'custom')   : 'custom',
        memberCount: compound ? compound.members.length       : 0,
        replacement: compound ? (compound.replacement || null) : null,
      };
    }

    // Is there an active compound draft?
    if (_compoundDraft) {
      return {
        state:       'draft',
        memberCount: _compoundDraft.members.length,
        name:        _compoundDraft.name,
        kind:        _compoundDraft.kind,
      };
    }

    return { state: 'none' };
  }

  // ── Inspector render opts helper ──────────────────────────────────────────────

  // _buildInspectorOpts — assembles the full options object for inspector.render()
  // including all saved-edit fields and all callbacks.
  // Priority: compound replacement > group replacement > standalone replacement.
  function _buildInspectorOpts(savedEdit, extraOpts, callbacks) {
    var groupState    = (extraOpts && extraOpts._groupState)    || null;
    var compoundState = (extraOpts && extraOpts._compoundState) || null;

    // Authority: compound > group > standalone
    var replacement;
    if (compoundState && compoundState.state === 'member' && compoundState.replacement !== undefined) {
      replacement = compoundState.replacement;
    } else if (groupState && groupState.state === 'member' && groupState.replacement !== undefined) {
      replacement = groupState.replacement;
    } else {
      replacement = savedEdit ? (savedEdit.replacement || null) : null;
    }

    var baseOpts = {
      notes:          savedEdit ? (savedEdit.notes || '') : '',
      tags:           savedEdit ? (savedEdit.tags  || []) : [],
      hidden:         savedEdit ? !!(savedEdit.hidden)    : false,
      sourceHidden:   savedEdit ? !!(savedEdit.hidden)    : false,  // 0610M: same field, explicit label
      replacement:    replacement,
      // 0610J group fields
      groupState:        groupState ? groupState.state       : 'none',
      groupMemberCount:  groupState ? (groupState.memberCount || 0) : 0,
      groupDraftCount:   (_groupDraft) ? _groupDraft.memberKeys.length : 0,
      // 0610K compound fields
      compoundState:        compoundState ? compoundState.state       : 'none',
      compoundMemberCount:  compoundState ? (compoundState.memberCount || 0) : 0,
      compoundDraftCount:   (_compoundDraft) ? _compoundDraft.members.length : 0,
      compoundDraftName:    (_compoundDraft) ? _compoundDraft.name : '',
      compoundDraftKind:    (_compoundDraft) ? _compoundDraft.kind : 'custom',
      compoundName:         compoundState ? (compoundState.name || '') : '',
      compoundKind:         compoundState ? (compoundState.kind || 'custom') : 'custom',
    };
    // Remove internal sentinels before passing to inspector
    var mergedExtra = Object.assign({}, extraOpts);
    delete mergedExtra._groupState;
    delete mergedExtra._compoundState;
    return Object.assign(baseOpts, mergedExtra, callbacks);
  }

  // ── Author badge (0610O) ─────────────────────────────────────────────────────

  // _updateAuthorBadge — updates the floating badge near the top of the Map Lab
  // canvas to show the authored state of the currently selected building.
  // DOM/CSS only — no Mapbox paint mutation.
  var _ARCHETYPE_SHORT_LABELS = {
    'warehouse':          'Warehouse',
    'skyscraper':         'Skyscraper',
    'apartment':          'Apartment',
    'radio-tower':        'Radio Tower',
    'pagoda':             'Pagoda',
    'civic-block':        'Civic Block',
    'industrial-stack':   'Industrial Stack',
    'custom-placeholder': 'Placeholder',
  };

  function _updateAuthorBadge(sel, savedEdit, gs, cs) {
    if (!_badgeEl) return;
    if (!sel) {
      _badgeEl.style.display = 'none';
      _badgeEl.textContent = '';
      return;
    }
    var parts = [];

    var csState = cs && cs.state;
    var gsState = gs && gs.state;

    if (csState === 'member' && cs.name) {
      parts.push('Compound: ' + cs.name);
    } else if (gsState === 'member' && gs.memberCount) {
      parts.push('Group: ' + gs.memberCount + ' part' + (gs.memberCount !== 1 ? 's' : ''));
    }

    var rep = savedEdit && savedEdit.replacement;
    if (rep && rep.enabled) {
      parts.push('Replacement: ' + (_ARCHETYPE_SHORT_LABELS[rep.archetype] || rep.archetype || '?'));
    }

    if (savedEdit && savedEdit.hidden) {
      parts.push('Source Hidden');
    }

    if (!parts.length) {
      _badgeEl.style.display = 'none';
      _badgeEl.textContent = '';
      return;
    }

    _badgeEl.textContent = 'Selected · ' + parts.join(' · ');
    _badgeEl.style.display = '';
  }

  // ── Enter lifecycle ───────────────────────────────────────────────────────────

  function enter() {
    renderStage();

    if (_initialized) {
      var adapter = _adapter();
      if (adapter) setTimeout(function () { try { adapter.resize(); } catch (e) {} }, 50);
      _updateStatus();
      return;
    }

    var adapter   = _adapter();
    var selection = _selection();
    var inspector = _inspector();

    if (!adapter)   { console.error('[MapLabView] MapboxAdapter not loaded'); return; }
    if (!selection) { console.error('[MapLabView] MapSelection not loaded'); return; }

    _initialized = true;

    if (!adapter.isReady()) {
      var result = adapter.init(CONTAINER_ID);
      if (!result.ok) {
        _initialized = false;
        console.error('[MapLabView] map init failed:', result.reason);
        _statusEl && (_statusEl.textContent = 'Map Lab · init failed: ' + result.reason);
        return;
      }
    }

    var map = adapter.getMap();
    _updateStatus();

    setTimeout(function () { try { adapter.resize(); } catch (e) {} }, 50);
    setTimeout(function () { try { adapter.resize(); } catch (e) {} }, 250);

    var _layersSetUp = false;
    function _styleHasData() {
      try {
        var s = map.getStyle();
        return !!(s && s.layers && s.layers.length);
      } catch (e) { return false; }
    }
    function _doSetup() {
      if (_layersSetUp) return;
      if (!map.isStyleLoaded() && !_styleHasData()) return;
      _layersSetUp = true;
      _setupLayers(map, adapter, inspector);
      try { adapter.resize(); } catch (e) {}
    }
    _doSetup();
    map.on('load',      _doSetup);
    map.on('styledata', _doSetup);
    setTimeout(_doSetup, 300);
    setTimeout(_doSetup, 1000);
    setTimeout(_doSetup, 3000);

    map.on('error', function (e) {
      var msg = '';
      try { msg = (e && e.error && (e.error.message || String(e.error))) || ''; } catch (_) {}
      if (e && (e.sourceId || /tile|fetch|network/i.test(msg))) {
        if (_statusEl && /initializ/i.test(_statusEl.textContent)) {
          _statusEl.textContent = 'Map Lab · Mapbox tiles unavailable';
        }
      }
    });

    var _statusInterval = setInterval(function () {
      _updateStatus();
      if (adapter.getStatus().styleLoaded) clearInterval(_statusInterval);
    }, 800);

    // ── Edit callbacks ────────────────────────────────────────────────────────

    function _onColorChange(color) {
      var sel = selection.getSelection();
      if (!sel) return;
      adapter.setSelectionColor(sel, color);
      sel.editColor = color;
      var registry = _registry();
      if (registry) {
        var key = registry.buildingKey(sel);
        if (key) registry.set(key, { color: color });
      }
    }

    function _onNotesChange(notes) {
      var sel = selection.getSelection();
      if (!sel) return;
      var registry = _registry();
      if (!registry) return;
      var key = registry.buildingKey(sel);
      if (key) registry.set(key, { notes: notes });
    }

    function _onTagsChange(tags) {
      var sel = selection.getSelection();
      if (!sel) return;
      var registry = _registry();
      if (!registry) return;
      var key = registry.buildingKey(sel);
      if (key) registry.set(key, { tags: tags });
    }

    function _onHiddenChange(hidden) {
      var sel = selection.getSelection();
      if (!sel) return;
      var registry = _registry();
      if (!registry) return;
      var key = registry.buildingKey(sel);
      if (!key) return;
      registry.set(key, { hidden: hidden });
      // 0610P: immediately refresh visual suppression in Author mode, or preview in Preview mode
      if (_isPreviewMode()) {
        var pr = _preview();
        if (pr && typeof pr.refresh === 'function') { try { pr.refresh(); } catch (e) {} }
      } else {
        try { _applyAuthorRegistryState(adapter, registry); } catch (e) {}
      }
      _refreshAfterHideRestore(key, sel);
    }

    // ── Group callbacks (0610J) ───────────────────────────────────────────────

    // _refreshAfterChange — re-renders inspector + refreshes visual.
    // Used after any group or compound change.
    function _refreshAfterChange() {
      var sel = selection.getSelection();
      var pr  = _preview();
      if (_isPreviewMode()) {
        if (pr && typeof pr.refresh === 'function') { try { pr.refresh(); } catch (e) {} }
      } else {
        var reg = _registry();
        if (reg) { try { _applyAuthorRegistryState(adapter, reg); } catch (e) {} }
      }
      if (sel) {
        var reg2       = _registry();
        var bKey2      = reg2 ? reg2.buildingKey(sel) : null;
        var savedEdit2 = (reg2 && bKey2) ? reg2.get(bKey2) : null;
        var gs2        = _computeGroupState(bKey2);
        var cs2        = _computeCompoundState(bKey2);
        if (inspector) {
          inspector.render(INSPECTOR_ID, sel, _buildInspectorOpts(savedEdit2, {
            _groupState:    gs2,
            _compoundState: cs2,
            layerId:        sel._layerId,
            layerType:      sel._layerType,
            highlighted:    true,
          }, _buildAllCallbacks(bKey2)));
        }
        _updateAuthorBadge(sel, savedEdit2, gs2, cs2);
      }
      _updateStatus();
    }

    // Alias for backward-compat internal usage
    var _refreshAfterGroupChange = _refreshAfterChange;

    function _buildAllCallbacks(bKey) {
      return {
        onColorChange:       _onColorChange,
        onNotesChange:       _onNotesChange,
        onTagsChange:        _onTagsChange,
        onHiddenChange:      _onHiddenChange,
        onReplacementChange: _onReplacementChange,
        onReset:             _onReset,
        // Group callbacks
        onStartGroup:  function () { _onStartGroup(bKey); },
        onAddToGroup:  function () { _onAddToGroup(bKey); },
        onFinishGroup: function () { _onFinishGroup(); },
        onCancelGroup: function () { _onCancelGroup(); },
        onUngroup:     function () {
          var gs = _computeGroupState(bKey);
          if (gs.groupId) _onUngroup(gs.groupId);
        },
        // Compound callbacks (0610K)
        onStartCompound:     function () { _onStartCompound(bKey); },
        onAddToCompound:     function () { _onAddToCompound(bKey); },
        onFinishCompound:    function () { _onFinishCompound(); },
        onCancelCompound:    function () { _onCancelCompound(); },
        onUngroupCompound:   function () {
          var cs = _computeCompoundState(bKey);
          if (cs.compoundId) _onUngroupCompound(cs.compoundId);
        },
        onCompoundMetaChange: function (meta) { _onCompoundMetaChange(meta); },
        // Delete authority (0610L)
        onDeleteSelected: function () { _onDeleteSelected(); },
        // Source hide authority (0610M)
        onHideSourceBuilding:    function () { _onHideSourceBuilding(); },
        onRestoreSourceBuilding: function () { _onRestoreSourceBuilding(); },
      };
    }

    // Keep internal alias for call sites that still use old name
    var _buildGroupCallbacks = _buildAllCallbacks;

    function _onStartGroup(bKey) {
      if (!bKey) return;
      _groupDraft = { memberKeys: [bKey] };
      console.log('[MapLabView] group draft started with', bKey);
      _refreshAfterGroupChange();
    }

    function _onAddToGroup(bKey) {
      if (!bKey || !_groupDraft) return;
      if (_groupDraft.memberKeys.indexOf(bKey) === -1) {
        _groupDraft.memberKeys.push(bKey);
        console.log('[MapLabView] added to group draft:', bKey, '(total:', _groupDraft.memberKeys.length + ')');
      }
      _refreshAfterGroupChange();
    }

    function _onFinishGroup() {
      if (!_groupDraft || _groupDraft.memberKeys.length < 2) return;
      var reg = _registry();
      if (!reg) return;
      var groupId = null;
      try { groupId = reg.createGroup(_groupDraft.memberKeys); } catch (e) {
        console.warn('[MapLabView] createGroup failed:', e.message || e);
      }
      _groupDraft = null;
      if (groupId) console.log('[MapLabView] group created:', groupId);
      _refreshAfterGroupChange();
    }

    function _onCancelGroup() {
      _groupDraft = null;
      console.log('[MapLabView] group draft cancelled');
      _refreshAfterGroupChange();
    }

    function _onUngroup(groupId) {
      if (!groupId) return;
      var reg = _registry();
      if (!reg) return;
      try { reg.deleteGroup(groupId); } catch (e) {
        console.warn('[MapLabView] deleteGroup failed:', e.message || e);
      }
      console.log('[MapLabView] ungrouped:', groupId);
      _refreshAfterGroupChange();
    }

    // Compound callbacks (0610K) ─────────────────────────────────────────────────

    function _onStartCompound(bKey) {
      if (!bKey) return;
      _compoundDraft = { name: '', kind: 'custom', members: [bKey] };
      console.log('[MapLabView] compound draft started with', bKey);
      _refreshAfterChange();
    }

    function _onAddToCompound(bKey) {
      if (!bKey || !_compoundDraft) return;
      if (_compoundDraft.members.indexOf(bKey) === -1) {
        _compoundDraft.members.push(bKey);
        console.log('[MapLabView] added to compound draft:', bKey, '(total:', _compoundDraft.members.length + ')');
      }
      _refreshAfterChange();
    }

    function _onFinishCompound() {
      if (!_compoundDraft || _compoundDraft.members.length < 2) return;
      var reg = _registry();
      if (!reg) return;
      var compoundId = null;
      try {
        compoundId = reg.createCompound({
          name:    _compoundDraft.name || 'Compound',
          kind:    _compoundDraft.kind || 'custom',
          members: _compoundDraft.members,
        });
      } catch (e) {
        console.warn('[MapLabView] createCompound failed:', e.message || e);
      }
      _compoundDraft = null;
      if (compoundId) console.log('[MapLabView] compound created:', compoundId);
      _refreshAfterChange();
    }

    function _onCancelCompound() {
      _compoundDraft = null;
      console.log('[MapLabView] compound draft cancelled');
      _refreshAfterChange();
    }

    function _onUngroupCompound(compoundId) {
      if (!compoundId) return;
      var reg = _registry();
      if (!reg) return;
      try { reg.deleteCompound(compoundId); } catch (e) {
        console.warn('[MapLabView] deleteCompound failed:', e.message || e);
      }
      console.log('[MapLabView] compound deleted:', compoundId);
      _refreshAfterChange();
    }

    function _onCompoundMetaChange(meta) {
      if (!_compoundDraft || !meta) return;
      if (typeof meta.name === 'string') _compoundDraft.name = meta.name;
      if (typeof meta.kind === 'string') _compoundDraft.kind = meta.kind;
      // No refresh needed — meta fields update silently in draft
    }

    // _onReplacementChange — persists replacement metadata and re-applies visual cue.
    // 0610K: 3-tier routing: compound > group > standalone.
    // Registry normalizes the replacement object before storage.
    function _onReplacementChange(replacement) {
      var sel = selection.getSelection();
      if (!sel) return;
      var registry = _registry();
      if (!registry) return;
      var key = registry.buildingKey(sel);
      if (!key) return;

      // 3-tier routing: compound > group > standalone
      var compoundId = null, groupId = null;
      try { compoundId = registry.findCompoundByMember(key); } catch (e) {}
      if (!compoundId) {
        try { groupId = registry.findGroupByMember(key); } catch (e) {}
        if (groupId) {
          try { compoundId = registry.findCompoundByMember(groupId); } catch (e) {}
        }
      }
      if (compoundId) {
        registry.setCompoundReplacement(compoundId, replacement);
      } else if (groupId) {
        registry.setGroupReplacement(groupId, replacement);
      } else {
        registry.set(key, { replacement: replacement });
      }

      // 0610H: single visual authority gate — only one system projects at a time.
      var pr = _preview();
      if (_isPreviewMode()) {
        // Preview active: refresh preview actor only; do not reapply author cue.
        if (pr && typeof pr.refresh === 'function') {
          try { pr.refresh(); } catch (e) {}
        }
      } else {
        // Author active: re-apply registry cues; do not touch preview layer.
        _applyAuthorRegistryState(adapter, registry);
      }
    }

    function _onReset() {
      var sel = selection.getSelection();
      if (!sel) return;
      var registry = _registry();
      if (registry) {
        var key = registry.buildingKey(sel);
        if (key) registry.remove(key);
      }
      delete sel.editColor;
      // 0610H: single visual authority gate — re-apply author cue only when not in preview.
      if (_isPreviewMode()) {
        var pr = _preview();
        if (pr && typeof pr.refresh === 'function') { try { pr.refresh(); } catch (e) {} }
      } else if (registry) {
        _applyAuthorRegistryState(adapter, registry);
      } else {
        adapter.clearSelectionColor();
      }
      var insp = _inspector();
      if (insp) {
        var resetKey = _registry() ? _registry().buildingKey(sel) : null;
        var resetGs  = _computeGroupState(resetKey);
        var resetCs  = _computeCompoundState(resetKey);
        insp.render(INSPECTOR_ID, sel, _buildInspectorOpts(null, {
          highlighted:    false,
          _groupState:    resetGs,
          _compoundState: resetCs,
        }, _buildAllCallbacks(resetKey)));
      }
      _updateStatus();
    }

    // ── Delete Selected (0610L) ───────────────────────────────────────────────

    // _onDeleteSelected — hierarchy-aware delete with optional confirmation.
    // Deletes the highest active authored target: compound > group > standalone.
    // Clears selection, refreshes visual authority, and re-renders inspector.
    function _onDeleteSelected() {
      var sel = selection.getSelection();
      if (!sel) return { ok: false, reason: 'no_selection' };

      var registry = _registry();
      if (!registry) return { ok: false, reason: 'registry_missing' };

      var key = registry.buildingKey(sel);
      if (!key) return { ok: false, reason: 'missing_key' };

      // Determine what will be deleted before asking registry to do it,
      // so we can present the right confirm message.
      var cs = _computeCompoundState(key);
      var gs = _computeGroupState(key);

      if (cs.state === 'member') {
        if (!global.confirm('Delete this compound and return its parts to normal building edits?')) {
          return { ok: false, reason: 'cancelled' };
        }
      } else if (gs.state === 'member') {
        if (!global.confirm('Delete this group and return its parts to standalone building edits?')) {
          return { ok: false, reason: 'cancelled' };
        }
      }

      var result = registry.deleteSelectedTarget(key);
      if (!result || !result.ok) {
        console.log('[MapLabView] deleteSelectedTarget: nothing removed —', result && result.reason);
        return result;
      }

      console.log('[MapLabView] deleteSelectedTarget: removed', result.type, result.id);

      // Clear selection highlight
      try { adapter.clearHighlight(); } catch (e) {}
      try { adapter.clearSelectionColor(); } catch (e) {}
      try { selection.clear(); } catch (e) {}

      // Refresh visual authority
      if (_isPreviewMode()) {
        var pr = _preview();
        if (pr && typeof pr.refresh === 'function') { try { pr.refresh(); } catch (e) {} }
      } else {
        try { _applyAuthorRegistryState(adapter, registry); } catch (e) {}
      }

      // Re-render inspector empty state
      var insp = _inspector();
      if (insp) insp.renderEmpty(INSPECTOR_ID, 'Click a building to select it.');
      _updateStatus();
      return result;
    }

    // ── Source hide / restore (0610M) ────────────────────────────────────────

    // _refreshAfterHideRestore — re-renders inspector for current selection
    // without clearing it. Called after hide/restore operations.
    function _refreshAfterHideRestore(key, sel) {
      // Refresh visual authority
      if (_isPreviewMode()) {
        var pr = _preview();
        if (pr && typeof pr.refresh === 'function') { try { pr.refresh(); } catch (e) {} }
      } else {
        var reg = _registry();
        if (reg) { try { _applyAuthorRegistryState(adapter, reg); } catch (e) {} }
      }
      // Re-render inspector for current selection (keep selection)
      var reg2       = _registry();
      var savedEdit2 = (reg2 && key) ? reg2.get(key) : null;
      var gs2        = _computeGroupState(key);
      var cs2        = _computeCompoundState(key);
      var insp       = _inspector();
      if (insp && sel) {
        insp.render(INSPECTOR_ID, sel, _buildInspectorOpts(savedEdit2, {
          _groupState:    gs2,
          _compoundState: cs2,
          layerId:        sel._layerId,
          layerType:      sel._layerType,
          highlighted:    true,
        }, _buildAllCallbacks(key)));
        _updateAuthorBadge(sel, savedEdit2, gs2, cs2);
      }
      _updateStatus();
    }

    // _onHideSourceBuilding — creates hidden: true entry for selected building.
    // Does not clear selection. Refreshes visual and inspector.
    function _onHideSourceBuilding() {
      var sel = selection.getSelection();
      if (!sel) return { ok: false, reason: 'no_selection' };
      var registry = _registry();
      if (!registry) return { ok: false, reason: 'registry_missing' };
      var key = registry.buildingKey(sel);
      if (!key) return { ok: false, reason: 'missing_key' };
      var result = registry.hideSourceBuilding(key);
      if (!result || !result.ok) return result;
      console.log('[MapLabView] hideSourceBuilding:', key);
      _refreshAfterHideRestore(key, sel);
      return result;
    }

    // _onRestoreSourceBuilding — removes hidden flag from selected building.
    // Does not clear selection. Refreshes visual and inspector.
    function _onRestoreSourceBuilding() {
      var sel = selection.getSelection();
      if (!sel) return { ok: false, reason: 'no_selection' };
      var registry = _registry();
      if (!registry) return { ok: false, reason: 'registry_missing' };
      var key = registry.buildingKey(sel);
      if (!key) return { ok: false, reason: 'missing_key' };
      var result = registry.restoreSourceBuilding(key);
      if (!result || !result.ok) return result;
      console.log('[MapLabView] restoreSourceBuilding:', key);
      _refreshAfterHideRestore(key, sel);
      return result;
    }

    // ── Click handler ──────────────────────────────────────────────────────────

    _clickHandler = function (e) {
      var features = adapter.queryPoint(e.point);
      var building = null;
      for (var i = 0; i < features.length; i++) {
        if (_isBuildingFeature(features[i])) { building = features[i]; break; }
      }
      if (building) {
        adapter.highlightFeature(building);
        var sel = selection.select(building);

        // Stash layer info on sel for _refreshAfterGroupChange re-renders
        sel._layerId    = building.layer && building.layer.id;
        sel._layerType  = building.layer && building.layer.type;

        var registry  = _registry();
        var bKey      = registry ? registry.buildingKey(sel) : null;

        // 0610D: persist geometry snapshot immediately on selection so Wall
        // replacement runtime uses Studio-authoritative footprint coordinates.
        if (bKey && registry) _persistGeometry(building, bKey, registry);

        var savedEdit     = (registry && bKey) ? registry.get(bKey) : null;
        var groupState    = _computeGroupState(bKey);    // 0610J
        var compoundState = _computeCompoundState(bKey); // 0610K

        // Restore visual: replacement cue takes priority, then simple color
        if (savedEdit && savedEdit.replacement && savedEdit.replacement.enabled) {
          // Visual already handled by applyRegistryEdits on style load
        } else if (savedEdit && savedEdit.color) {
          sel.editColor = savedEdit.color;
          adapter.setSelectionColor(sel, savedEdit.color);
        }

        if (inspector) {
          inspector.render(INSPECTOR_ID, sel, _buildInspectorOpts(savedEdit, {
            layerId:        building.layer && building.layer.id,
            layerType:      building.layer && building.layer.type,
            highlighted:    true,
            _groupState:    groupState,
            _compoundState: compoundState,
          }, _buildAllCallbacks(bKey)));
        }
        _updateStatus();
      } else {
        adapter.clearHighlight();
        adapter.clearSelectionColor();
        selection.clear();
        if (inspector) inspector.renderEmpty(INSPECTOR_ID, 'Click a building to select it.');
        _updateStatus();
      }
    };
    map.on('click', _clickHandler);

    map.on('mousemove', function (e) {
      var features = adapter.queryPoint(e.point);
      var hovered = null;
      for (var i = 0; i < features.length; i++) {
        if (_isBuildingFeature(features[i])) { hovered = features[i]; break; }
      }
      if (hovered) {
        map.getCanvas().style.cursor = 'pointer';
        adapter.setHoverFeature(hovered);
      } else {
        map.getCanvas().style.cursor = '';
        adapter.clearHover();
      }
    });

    map.on('mouseleave', function () {
      map.getCanvas().style.cursor = '';
      adapter.clearHover();
    });

    // Inspector subscription (onChange from MapSelection)
    if (inspector && selection) {
      _unsubscribe = selection.onChange(function (sel) {
        if (sel) {
          var registry   = _registry();
          var bKey       = registry ? registry.buildingKey(sel) : null;
          var savedEdit  = (registry && bKey) ? registry.get(bKey) : null;
          var groupState    = _computeGroupState(bKey);
          var compoundState = _computeCompoundState(bKey);
          inspector.render(INSPECTOR_ID, sel, _buildInspectorOpts(savedEdit, {
            _groupState:    groupState,
            _compoundState: compoundState,
          }, _buildAllCallbacks(bKey)));
          _updateAuthorBadge(sel, savedEdit, groupState, compoundState);
        } else {
          inspector.renderEmpty(INSPECTOR_ID, 'Click a building to select it.');
          _updateAuthorBadge(null);
        }
      });
    }

    if (global.ResizeObserver) {
      var stageEl = global.document.getElementById('studio-stage');
      if (stageEl) {
        _resizeObs = new global.ResizeObserver(function () { adapter.resize(); });
        _resizeObs.observe(stageEl);
      }
    }

    console.log('[MapLabView] v1.9.0 entered — map initialized');
  }

  // ── Debug ─────────────────────────────────────────────────────────────────────

  function debugInit() {
    var adapter = _adapter();
    var mapExists = !!(adapter && adapter.isReady());
    var styleHasLayers = false;
    var lastError = null;
    if (mapExists) {
      try {
        var map = adapter.getMap();
        var sty = map.getStyle();
        styleHasLayers = !!(sty && sty.layers && sty.layers.length > 0);
      } catch (e) { lastError = String(e && e.message || e); }
    }
    var adState = null;
    try { adState = adapter && adapter.getState(); } catch (e) {}
    var registry = _registry();
    var editCount = 0;
    try { editCount = registry ? Object.keys(registry.getAll()).length : 0; } catch (e) {}
    var report = {
      initialized:        _initialized,
      adapterReady:       mapExists,
      mapExists:          mapExists,
      statusText:         _statusEl ? _statusEl.textContent : '(no status el)',
      styleHasLayers:     styleHasLayers,
      buildingLayerCount: adState ? adState.buildingLayers.length : 0,
      lastError:          lastError || (adState && adState.lastError) || null,
      persistedEdits:     editCount,
    };
    console.log('[MapLabView] debugInit:', JSON.stringify(report, null, 2));
    return report;
  }

  // ── Leave lifecycle ───────────────────────────────────────────────────────────

  function exit() {
    if (!_initialized) return;

    var adapter   = _adapter();
    var selection = _selection();

    if (_clickHandler && adapter && adapter.getMap()) {
      try { adapter.getMap().off('click', _clickHandler); } catch (e) {}
    }
    _clickHandler = null;

    if (_unsubscribe) { try { _unsubscribe(); } catch (e) {} }
    _unsubscribe = null;

    if (_resizeObs) { try { _resizeObs.disconnect(); } catch (e) {} }
    _resizeObs = null;

    if (selection) { try { selection.clearListeners(); selection.clear(); } catch (e) {} }

    if (adapter) adapter.destroy();

    // 0610G: ensure preview runtime resets to author mode on exit
    var pr = _preview();
    if (pr && typeof pr.setMode === 'function') { try { pr.setMode('author'); } catch (e) {} }

    _groupDraft    = null;   // 0610J: clear group draft on exit
    _compoundDraft = null;   // 0610K: clear compound draft on exit
    _wrapperEl      = null;
    _statusEl       = null;
    _modeBtnAuthor  = null;
    _modeBtnPreview = null;
    _initialized    = false;
    console.log('[MapLabView] exited — map destroyed');
  }

  // ── Inspector rendering (mode switch) ────────────────────────────────────────

  function renderInspector() {
    var inspector = _inspector();
    var selection = _selection();
    if (!inspector) return;
    var sel = selection ? selection.getSelection() : null;
    if (sel) inspector.render(INSPECTOR_ID, sel);
    else inspector.renderEmpty(INSPECTOR_ID, 'Click a building to select it.');
  }

  // ── 3D building layer ─────────────────────────────────────────────────────────

  function _addBuildingLayer(map) {
    try {
      var style  = map.getStyle();
      var layers = (style && style.layers) || [];
      var has3D  = layers.some(function (l) { return l.type === 'fill-extrusion'; });
      if (has3D) {
        // 0610N: Mapbox Studio style already has fill-extrusion building layers.
        // Do NOT repaint them — Studio is the colour authority for style-owned layers.
        // Selection/hover highlighting is handled by the outline layer + feature-state.
        return;
      }
      // No fill-extrusion in the active style — create a WOS fallback layer.
      var sources = (style && style.sources) || {};
      if (!sources['composite']) {
        map.addSource('composite', { type: 'vector', url: 'mapbox://mapbox.mapbox-streets-v8' });
      }
      map.addLayer({
        id: 'maplab-buildings-3d',
        type: 'fill-extrusion',
        source: 'composite',
        'source-layer': 'building',
        filter: ['==', 'extrude', 'true'],
        minzoom: 13,
        paint: {
          'fill-extrusion-color':   _defaultColorExpr(),
          'fill-extrusion-height':  ['interpolate', ['linear'], ['zoom'], 13, 0, 13.5, ['get', 'height']],
          'fill-extrusion-base':    ['interpolate', ['linear'], ['zoom'], 13, 0, 13.5, ['get', 'min_height']],
          'fill-extrusion-opacity': 0.85,
        },
      });
      _fallbackBuildingLayerCreated = true;  // 0610N
      console.log('[MapLabView] maplab-buildings-3d created (fallback — no fill-extrusion in active style)');
    } catch (e) {
      console.warn('[MapLabView] _addBuildingLayer error:', e);
    }
  }

  function _defaultColorExpr() {
    return ['case', ['boolean', ['feature-state', 'selected'], false], '#3dd8c5', '#1a2030'];
  }

  function _applySelectionPaint(map, layerId) {
    try {
      map.setPaintProperty(layerId, 'fill-extrusion-color', _defaultColorExpr());
      map.setPaintProperty(layerId, 'fill-extrusion-opacity', 0.85);
    } catch (e) {}
  }

  // ── Public edit API ───────────────────────────────────────────────────────────

  function exportEdits() {
    var registry = _registry();
    if (!registry) return null;
    var json = registry.exportJSON();
    console.log('[MapLabView] exportEdits:\n' + json);
    return json;
  }

  function importEdits(json) {
    var registry = _registry();
    if (!registry) return { ok: false, reason: 'registry_not_loaded' };
    var result = registry.importJSON(json);
    if (result.ok) {
      var adapter = _adapter();
      // 0610H: respect visual authority — refresh preview if in preview mode
      if (_isPreviewMode()) {
        var pr = _preview();
        if (pr && typeof pr.refresh === 'function') { try { pr.refresh(); } catch (e) {} }
      } else if (adapter) {
        _applyAuthorRegistryState(adapter, registry);
      }
    }
    return result;
  }

  function clearEdits() {
    var registry = _registry();
    if (!registry) return false;
    registry.clear();
    var adapter = _adapter();
    if (adapter) adapter.clearSelectionColor();
    console.log('[MapLabView] all building edits cleared');
    return true;
  }

  // deleteSelectedTarget() — 0610L public debug shortcut: deletes the highest
  // active authored target for the currently selected building.
  // Returns registry result object or { ok: false, reason } when nothing is selected.
  function deleteSelectedTarget() {
    var selModule = global.WOSMapLab && global.WOSMapLab.MapSelection;
    var sel       = selModule ? selModule.getSelection() : null;
    if (!sel) return { ok: false, reason: 'no_selection' };
    var registry = _registry();
    if (!registry) return { ok: false, reason: 'registry_missing' };
    var key = registry.buildingKey(sel);
    if (!key) return { ok: false, reason: 'missing_key' };
    return registry.deleteSelectedTarget(key);
  }

  // groupStatus() — 0610J debug: returns group counts and current draft state.
  function groupStatus() {
    var registry = _registry();
    var groups   = {};
    var groupCount = 0, groupedMemberCount = 0, ungroupedReplacementCount = 0;
    var lastError  = null;
    try {
      if (registry) {
        groups = registry.getGroups();
        groupCount = Object.keys(groups).length;
        Object.keys(groups).forEach(function (gid) {
          var g = groups[gid];
          if (g && g.members) groupedMemberCount += g.members.length;
        });
        var all = registry.getAll();
        Object.keys(all).forEach(function (bKey) {
          var edit = all[bKey];
          if (edit && edit.replacement && edit.replacement.enabled) {
            var gid = null;
            try { gid = registry.findGroupByMember(bKey); } catch (e) {}
            if (!gid) ungroupedReplacementCount++;
          }
        });
      }
    } catch (e) { lastError = String(e && e.message || e); }

    var pr = _preview();
    var activeGroupId = null;
    if (_groupDraft && _groupDraft.memberKeys.length) {
      // Draft — show first member's group if it has one (shouldn't usually)
      activeGroupId = null;
    }

    var report = {
      groupCount:                groupCount,
      activeGroupId:             activeGroupId,
      activeMemberCount:         activeGroupId ? (groups[activeGroupId] && groups[activeGroupId].members.length || 0) : 0,
      groupedMemberCount:        groupedMemberCount,
      ungroupedReplacementCount: ungroupedReplacementCount,
      draftActive:               !!_groupDraft,
      draftMemberCount:          _groupDraft ? _groupDraft.memberKeys.length : 0,
      lastError:                 lastError,
    };
    console.log('[MapLabView] groupStatus:', JSON.stringify(report, null, 2));
    return report;
  }

  // compoundStatus() — 0610K debug: returns compound counts and current draft state.
  function compoundStatus() {
    var registry      = _registry();
    var compoundCount = 0, totalMemberCount = 0, lastError = null;
    try {
      if (registry) {
        var compounds = registry.getCompounds();
        compoundCount = Object.keys(compounds).length;
        Object.keys(compounds).forEach(function (cid) {
          var c = compounds[cid];
          if (c && c.members) totalMemberCount += c.members.length;
        });
      }
    } catch (e) { lastError = String(e && e.message || e); }

    var report = {
      compoundCount:     compoundCount,
      totalMemberCount:  totalMemberCount,
      draftActive:       !!_compoundDraft,
      draftMemberCount:  _compoundDraft ? _compoundDraft.members.length : 0,
      draftName:         _compoundDraft ? _compoundDraft.name : null,
      draftKind:         _compoundDraft ? _compoundDraft.kind : null,
      lastError:         lastError,
    };
    console.log('[MapLabView] compoundStatus:', JSON.stringify(report, null, 2));
    return report;
  }

  // sourceHideStatus() — 0610M debug: returns hidden source building counts.
  function sourceHideStatus() {
    var registry   = _registry();
    var hiddenKeys = [];
    var lastError  = null;
    try {
      if (registry && typeof registry.getHiddenKeys === 'function') {
        hiddenKeys = registry.getHiddenKeys();
      }
    } catch (e) { lastError = String(e && e.message || e); }
    var selModule  = global.WOSMapLab && global.WOSMapLab.MapSelection;
    var sel        = selModule ? selModule.getSelection() : null;
    var selHidden  = false;
    if (sel && registry) {
      try {
        var selKey = registry.buildingKey(sel);
        selHidden  = !!(selKey && registry.isSourceHidden(selKey));
      } catch (e) {}
    }
    var report = {
      hiddenSourceCount: hiddenKeys.length,
      hiddenKeys:        hiddenKeys,
      selectedHidden:    selHidden,
      lastError:         lastError,
    };
    console.log('[MapLabView] sourceHideStatus:', JSON.stringify(report, null, 2));
    return report;
  }

  // debugReplacements() — lists all buildings with replacement.enabled in the registry.
  function debugReplacements() {
    var registry = _registry();
    if (!registry) { console.warn('[MapLabView] registry not loaded'); return null; }
    var all = registry.getAll();
    var replacements = {};
    Object.keys(all).forEach(function (k) {
      var edit = all[k];
      if (edit && edit.replacement && edit.replacement.enabled) {
        replacements[k] = edit.replacement;
      }
    });
    var count = Object.keys(replacements).length;
    console.log('[MapLabView] debugReplacements:', count, 'replacement(s)\n' +
      JSON.stringify(replacements, null, 2));
    return replacements;
  }

  // ── Style parity status (0610N) ───────────────────────────────────────────────

  // styleParityStatus — combined parity audit for Studio Map Lab.
  // Delegates to MapboxAdapter for paint-mutation data and augments with layer-type
  // diagnostics so callers can confirm Mapbox Studio is the colour authority.
  function styleParityStatus() {
    var adapter    = _adapter();
    var adSnap     = (adapter && typeof adapter.styleParityStatus === 'function')
      ? adapter.styleParityStatus() : null;
    var preview    = _preview();
    var mode       = preview ? preview.getMode() : 'author';
    var map        = adapter ? adapter.getMap() : null;
    var prevLayerPresent = false;
    if (map) {
      try { prevLayerPresent = !!map.getLayer('wos-preview-layer'); } catch (e) {}
    }
    var snap = {
      version:                '1.14.0',
      mode:                   mode,
      baseStyleAuthority:     'mapbox-studio',
      fallbackLayerPresent:   _fallbackBuildingLayerCreated,
      previewLayerPresent:    prevLayerPresent,
      sourceSuppressionActive: false,
      wosMutatedLayerCount:   adSnap ? adSnap.wosMutatedLayerCount  : null,
      buildingLayerCount:     adSnap ? adSnap.buildingLayerCount     : null,
      originalPaintSnapshots: adSnap ? adSnap.originalPaintSnapshots : null,
      overrideActive:         adSnap ? adSnap.overrideActive          : false,
      parityOk:               !!(adSnap && adSnap.parityOk),
      lastParityError:        adSnap ? adSnap.lastParityError : null,
    };
    console.log('[MapLabView] styleParityStatus:', JSON.stringify(snap, null, 2));
    return snap;
  }

  global.WOSMapLab = global.WOSMapLab || {};
  global.WOSMapLab.MapLabView = Object.freeze({
    enter:               enter,
    exit:                exit,
    renderStage:         renderStage,
    renderInspector:     renderInspector,
    exportEdits:         exportEdits,
    importEdits:         importEdits,
    clearEdits:          clearEdits,
    debugReplacements:   debugReplacements,
    groupStatus:         groupStatus,    // 0610J
    compoundStatus:      compoundStatus,      // 0610K
    deleteSelectedTarget: deleteSelectedTarget, // 0610L
    sourceHideStatus:    sourceHideStatus,   // 0610M
    styleParityStatus:   styleParityStatus,  // 0610N
  });
  global.WOSMapLab.debugInit            = debugInit;
  global.WOSMapLab.debugReplacements    = debugReplacements;
  global.WOSMapLab.groupStatus          = groupStatus;           // 0610J shortcut
  global.WOSMapLab.compoundStatus       = compoundStatus;        // 0610K shortcut
  global.WOSMapLab.deleteSelectedTarget = deleteSelectedTarget;  // 0610L shortcut
  global.WOSMapLab.sourceHideStatus     = sourceHideStatus;      // 0610M shortcut
  global.WOSMapLab.styleParityStatus    = styleParityStatus;     // 0610N shortcut

  console.log('[MapLabView] v1.16.0 loaded');
})(window);
