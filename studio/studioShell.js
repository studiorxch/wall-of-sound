// ── WOS Studio Shell v1.0.0 ───────────────────────────────────────────────────
// 0603N_WOS_WallStudioWorkspaceSplit_v1.0.0
// Status: active | Classification: workspace-architecture (Studio shell)
//
// Studio authoring shell. Reads SHARED registries (no duplication) and exposes a
// proof-stage UI. Starts NO live feeds, NO Drive, NO Hero runtime; mutates NO
// Mapbox style (Studio has no map in v1). Safe empty states when a system is
// unavailable. Exposes _wos.debug.studio.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';
  var doc = global.document;

  var MODES = ['asset-library', 'actor-library', 'glyph-lab', 'palette-lab', 'proof-stage'];
  var STAGE_TITLES = {
    'asset-library': 'Asset Library',
    'actor-library': 'Actor Library — Preview',
    'glyph-lab': 'Glyph Lab',
    'palette-lab': 'Palette Lab',
    'proof-stage': 'Proof Stage',
  };

  var _state = { active: true, mode: 'asset-library',
                 selectedIdentityKey: null, selectedAssetId: null, selectedVariantKey: null,
                 selectedInspectorContext: 'asset', assignPanelOpen: false, assignStatus: null,
                 lastError: null };

  function _byId(id) { return doc.getElementById(id); }
  function _el(tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function _hex(v) { return '#' + ('000000' + ((v >>> 0).toString(16))).slice(-6); }

  // ── Shared system accessors (never required; safe empty state if absent) ─────
  function _identityProfiles() {
    try { return (SBE.ActorVisualIdentityAuthority && SBE.ActorVisualIdentityAuthority.listIdentityProfiles)
      ? SBE.ActorVisualIdentityAuthority.listIdentityProfiles() : []; } catch (e) { return []; }
  }
  function _palettes() {
    try { return (SBE.ActorPresentationPaletteRegistry && SBE.ActorPresentationPaletteRegistry.listPalettes)
      ? SBE.ActorPresentationPaletteRegistry.listPalettes() : []; } catch (e) { return []; }
  }
  function _toCategory(type) {
    if (type === 'vehicle.synthetic') return 'Synthetic';
    var c = (SBE.ActorTypes && SBE.ActorTypes.toCategory) ? SBE.ActorTypes.toCategory(type) : (type || '').split('.')[0];
    return ({ vehicle: 'Road', bike: 'Road', marine: 'Marine', aircraft: 'Aircraft',
              transit: 'Transit', civic: 'Civic', world: 'World' })[c] || 'Other';
  }
  var CATEGORY_ORDER = ['Road', 'Marine', 'Aircraft', 'Transit', 'Civic', 'World', 'Synthetic', 'Other'];

  // ── Library panel (mode-aware: assets in Asset Library, identities elsewhere) ─
  function _renderLibrary() {
    var body = _byId('studio-library-body');
    body.innerHTML = '';
    if (_state.mode === 'asset-library') return _renderAssetRows(body);
    return _renderIdentityRows(body);
  }

  function _renderAssetRows(body) {
    var assets = _assets();
    if (!assets.length) { body.appendChild(_el('div', 'studio-empty', 'ActorAssetLibraryAuthority unavailable.')); return; }
    var groups = {};
    assets.forEach(function (a) { (groups[a.category] = groups[a.category] || []).push(a); });
    ['road', 'marine', 'aircraft', 'transit', 'civic', 'world', 'synthetic', 'debug'].forEach(function (cat) {
      if (!groups[cat]) return;
      var g = _el('div', 'studio-cat'); g.appendChild(_el('div', 'studio-cat-name', cat));
      groups[cat].forEach(function (a) {
        var row = _el('div', 'studio-asset studio-asset-row');
        row.dataset.assetid = a.id;
        if (a.id === _state.selectedAssetId) row.classList.add('selected');
        row.appendChild(_el('span', 'k', a.label)); row.appendChild(_el('span', 's', a.silhouetteClass || ''));
        row.addEventListener('click', function () { selectAsset(a.id); });
        g.appendChild(row);
      });
      body.appendChild(g);
    });
  }

  function _renderIdentityRows(body) {
    var profiles = _identityProfiles().filter(function (p) { return p.sourceId; });
    if (!profiles.length) { body.appendChild(_el('div', 'studio-empty', 'ActorVisualIdentityAuthority unavailable.')); return; }
    var groups = {};
    profiles.forEach(function (p) { var c = _toCategory(p.actorType); (groups[c] = groups[c] || []).push(p); });
    CATEGORY_ORDER.forEach(function (cat) {
      if (!groups[cat]) return;
      var g = _el('div', 'studio-cat'); g.appendChild(_el('div', 'studio-cat-name', cat));
      groups[cat].forEach(function (p) {
        var row = _el('div', 'studio-identity studio-identity-row'); row.dataset.key = p.key;
        if (p.key === _state.selectedIdentityKey) row.classList.add('selected');
        row.appendChild(_el('span', 'k', p.key)); row.appendChild(_el('span', 's', p.silhouetteClass || ''));
        row.addEventListener('click', function () { _selectIdentity(p.key); });
        g.appendChild(row);
      });
      body.appendChild(g);
    });
  }

  function _selectIdentity(key) {
    if (key !== _state.selectedIdentityKey) { _state.assignPanelOpen = false; _state.assignStatus = null; }
    _state.selectedIdentityKey = key;
    _state.selectedInspectorContext = 'identity';
    var rows = doc.querySelectorAll('.studio-identity-row');
    for (var i = 0; i < rows.length; i++) rows[i].classList.toggle('selected', rows[i].dataset.key === key);
    var prof = null; _identityProfiles().forEach(function (p) { if (p.key === key) prof = p; });
    _renderIdentityInspector(prof);
    return key;
  }

  // ── Inspector context header ──────────────────────────────────────────────────
  function _inspectorHeader(body, label) {
    var pill = _el('div', 'studio-inspector-context');
    pill.appendChild(_el('span', 'studio-context-pill', 'Inspecting: ' + label));
    body.appendChild(pill);
  }
  function _paletteSwatches(body, paletteRef) {
    var pal = null;
    try { pal = SBE.ActorPresentationPaletteRegistry && SBE.ActorPresentationPaletteRegistry.resolvePalette(paletteRef); } catch (e) {}
    if (!pal) return;
    var sw = _el('div', 'studio-swatches'); sw.style.marginTop = '10px';
    ['body', 'roof', 'side', 'glass', 'accent', 'light'].forEach(function (c) {
      var d = _el('div', 'studio-swatch'); d.style.background = _hex(pal[c]); d.title = c + ' ' + _hex(pal[c]); sw.appendChild(d);
    });
    body.appendChild(sw);
  }

  // ── Identity inspector (+ assigned asset, read-only) ─────────────────────────
  function _renderIdentityInspector(prof) {
    var body = _byId('studio-inspector-body'); body.innerHTML = '';
    _inspectorHeader(body, 'Identity');
    if (!prof) { body.appendChild(_el('div', 'studio-empty', 'Select an actor identity to inspect.')); return; }
    ['key', 'actorType', 'sourceId', 'silhouetteClass', 'paletteRef', 'glyphRef', 'accentRef',
     'materialClass', 'lightClass', 'decalClass', 'scaleClass', 'priorityClass', 'readableName'].forEach(function (f) {
      if (prof[f] == null) return;
      body.appendChild(_metaLine(f, prof[f]));
    });
    // 0603R — assignment block (in-memory).
    _renderAssignmentBlock(body, prof);
    if (prof.tags && prof.tags.length) {
      var cr = _el('div', 'studio-chip-row'); prof.tags.forEach(function (t) { cr.appendChild(_el('span', 'studio-chip', t)); });
      body.appendChild(cr);
    }
    _paletteSwatches(body, prof.paletteRef);
  }

  // ── 0603R Identity → Asset assignment (in-memory only) ───────────────────────
  // v1.0.1 — single refresh helper so every assignment pathway updates all the
  // dependent Studio views immediately (no mode switch / reload / reselection).
  function _refreshAssignmentViews(identityKey) {
    if (_state.mode === 'actor-library' && identityKey && _state.selectedIdentityKey === identityKey) {
      var p = null;
      _identityProfiles().forEach(function (x) { if (x.key === identityKey) p = x; });
      if (p) _renderIdentityInspector(p);
    }
    if (_state.mode === 'asset-library') {
      _renderStage();            // refreshes the assignment table in the asset stage
      _renderAssetInspector();   // refreshes the asset inspector when visible
    }
  }

  function _assignedAsset(identityKey) {
    var ala = SBE.ActorAssetLibraryAuthority;
    if (!ala) return null;
    if (ala.getAssignment) { var g = ala.getAssignment(identityKey); if (g) return g.asset; }
    return null;
  }
  function _compatibleAssets(prof) {
    var assets = _assets(), compat = [], other = [];
    assets.forEach(function (a) {
      var ok = (a.actorTypes && a.actorTypes.indexOf(prof.actorType) !== -1) ||
               (a.identityKeys && a.identityKeys.indexOf(prof.key) !== -1) ||
               (a.silhouetteClass && a.silhouetteClass === prof.silhouetteClass);
      (ok ? compat : other).push(a);
    });
    return { compatible: compat, other: other };
  }
  function _renderAssignmentBlock(body, prof) {
    var assigned = _assignedAsset(prof.key);
    body.appendChild(_el('div', 'studio-note', 'Assigned Asset:'));
    body.appendChild(_metaLine('assetId', assigned ? assigned.id : '(none)'));
    if (assigned) body.appendChild(_metaLine('assetLabel', assigned.label));

    var controls = _el('div', 'studio-assign-controls');
    var bChange = _el('button', 'studio-btn', _state.assignPanelOpen ? 'Hide Asset List' : 'Change Asset');
    bChange.addEventListener('click', function () { _state.assignPanelOpen = !_state.assignPanelOpen; _renderIdentityInspector(prof); });
    var bReset = _el('button', 'studio-btn', 'Reset Assignments');
    bReset.addEventListener('click', function () {
      var ala = SBE.ActorAssetLibraryAuthority;
      if (ala && ala.resetAssignments) { ala.resetAssignments(); _state.assignStatus = 'Assignments reset to defaults.'; }
      _renderIdentityInspector(prof);
      _refreshAssignmentViews(prof.key);
    });
    controls.appendChild(bChange); controls.appendChild(bReset);
    body.appendChild(controls);

    if (_state.assignStatus) body.appendChild(_el('div', 'studio-assign-status', _state.assignStatus));
    body.appendChild(_el('div', 'studio-note studio-assign-warn', 'Assignments are in-memory only — export/import to persist.'));

    // 0603S — manual export / import persistence (no autosave, no localStorage).
    _renderPersistenceBlock(body, prof);

    if (_state.assignPanelOpen) {
      var groups = _compatibleAssets(prof);
      var list = _el('div', 'studio-assign-list');
      function addGroup(label, arr, experimental) {
        if (!arr.length) return;
        list.appendChild(_el('div', 'studio-cat-name', label));
        arr.forEach(function (a) {
          var row = _el('div', 'studio-assign-row' + (assigned && a.id === assigned.id ? ' active' : ''));
          var meta = _el('div', 'studio-assign-meta');
          meta.appendChild(_el('div', 'studio-assign-label', a.label + (experimental ? '  · experimental' : '')));
          meta.appendChild(_el('div', 'studio-assign-sub', a.id + '  ·  ' + a.category + '  ·  ' + (a.silhouetteClass || '-') + '  ·  ' + (a.paletteRef || '-')));
          row.appendChild(meta);
          var bAssign = _el('button', 'studio-btn' + (assigned && a.id === assigned.id ? '' : ' primary'), assigned && a.id === assigned.id ? 'Assigned' : 'Assign');
          bAssign.addEventListener('click', function () {
            var ala = SBE.ActorAssetLibraryAuthority;
            if (!ala || !ala.assignIdentity) return;
            var r = ala.assignIdentity(prof.key, a.id);
            _state.assignStatus = r.ok ? ('Assigned ' + prof.key + ' → ' + a.label) : ('Assign failed: ' + r.reason);
            _renderIdentityInspector(prof);
            _refreshAssignmentViews(prof.key);
          });
          row.appendChild(bAssign);
          list.appendChild(row);
        });
      }
      addGroup('Compatible Assets', groups.compatible, false);
      addGroup('Other Assets (experimental)', groups.other, true);
      body.appendChild(list);
    }
  }

  // ── 0603S Persistence (manual export/import only) ────────────────────────────
  function _downloadJson(filename, data) {
    try {
      if (!global.Blob || !global.URL || !global.URL.createObjectURL) return false;
      var blob = new global.Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      var url = global.URL.createObjectURL(blob);
      var a = doc.createElement('a'); a.href = url; a.download = filename; a.click();
      global.URL.revokeObjectURL(url);
      return true;
    } catch (e) { return false; }
  }
  function _isoDate() { try { return new Date().toISOString().slice(0, 10); } catch (e) { return 'export'; } }
  function _parsePayload(text) { try { return JSON.parse(text); } catch (e) { return null; } }

  function _renderPersistenceBlock(body, prof) {
    var ala = SBE.ActorAssetLibraryAuthority;
    var wrap = _el('details', 'studio-persist');
    wrap.appendChild(_el('summary', null, 'Export / Import assignments'));

    // Export
    var bExport = _el('button', 'studio-btn', 'Export Assignments');
    bExport.addEventListener('click', function () {
      if (!ala || !ala.exportAssignments) return;
      var data = ala.exportAssignments();
      var ok = _downloadJson('wos_actor_asset_assignments_' + _isoDate() + '.json', data);
      _state.assignStatus = ok ? ('Exported ' + data.assignmentCount + ' assignments.') : 'Export unavailable (no Blob/URL).';
      _refreshAssignmentViews(prof.key);
    });
    wrap.appendChild(bExport);

    // Import textarea
    wrap.appendChild(_el('div', 'studio-note', 'Paste assignment JSON, then choose an import action (no auto-apply):'));
    var ta = _el('textarea', 'studio-import-ta'); ta.placeholder = '{ "schema": "wos.actorAssetAssignments", "assignments": { ... } }';
    wrap.appendChild(ta);

    var actions = _el('div', 'studio-assign-controls');
    var summaryHost = _el('div', 'studio-import-summary');
    function runImport(opts, label) {
      var payload = _parsePayload(ta.value);
      if (!payload) { _renderImportSummary(summaryHost, { ok: false, reason: 'invalid_json' }); return; }
      if (!ala || !ala.importAssignments) { _renderImportSummary(summaryHost, { ok: false, reason: 'authority_unavailable' }); return; }
      var res = ala.importAssignments(payload, opts);
      _renderImportSummary(summaryHost, res);
      if (!opts.dryRun && res.ok) {
        _state.assignStatus = label + ' — applied ' + res.appliedCount + ', skipped ' + res.skippedCount + '.';
        _renderIdentityInspector(prof);   // rebuilds block; summary persists below until next render
      }
      _refreshAssignmentViews(prof.key);
    }
    var bDry = _el('button', 'studio-btn', 'Dry Run');
    bDry.addEventListener('click', function () { runImport({ dryRun: true, mode: 'merge' }, 'Dry run'); });
    var bMerge = _el('button', 'studio-btn primary', 'Import Merge');
    bMerge.addEventListener('click', function () { runImport({ mode: 'merge', dryRun: false }, 'Import (merge)'); });
    var bReplace = _el('button', 'studio-btn', 'Import Replace');
    bReplace.addEventListener('click', function () { runImport({ mode: 'replace', dryRun: false }, 'Import (replace)'); });
    actions.appendChild(bDry); actions.appendChild(bMerge); actions.appendChild(bReplace);
    wrap.appendChild(actions);
    wrap.appendChild(summaryHost);
    body.appendChild(wrap);
  }
  function _renderImportSummary(host, res) {
    host.innerHTML = '';
    if (!res) return;
    if (!res.ok) { host.appendChild(_el('div', 'studio-assign-status', 'Import failed: ' + (res.reason || 'unknown'))); return; }
    host.appendChild(_el('div', 'studio-assign-status',
      'valid: ' + res.appliedCount + ' | invalid: ' + res.skippedCount +
      ' | mode: ' + res.mode + ' | dryRun: ' + res.dryRun +
      ' | applied: ' + res.appliedCount + ' | skipped: ' + res.skippedCount));
    if (res.invalid && res.invalid.length) {
      host.appendChild(_table(['identityKey', 'assetId', 'reason'],
        res.invalid.map(function (i) { return [i.identityKey, i.assetId, i.reason]; })));
    }
  }

  // ── Stage panel (mode-dependent) ─────────────────────────────────────────────
  function _renderStage() {
    var title = _byId('studio-stage-title'); title.textContent = STAGE_TITLES[_state.mode] || 'Preview Stage';
    var body = _byId('studio-stage-body'); body.innerHTML = '';
    if (_state.mode === 'asset-library') return _renderAssetLibrary(body);
    if (_state.mode === 'palette-lab') return _renderPaletteLab(body);
    if (_state.mode === 'proof-stage') return _renderProofStage(body);
    if (_state.mode === 'glyph-lab')   return _renderGlyphLab(body);
    return _renderActorPreview(body);
  }

  function _assets() {
    try { return (SBE.ActorAssetLibraryAuthority && SBE.ActorAssetLibraryAuthority.listAssets)
      ? SBE.ActorAssetLibraryAuthority.listAssets() : []; } catch (e) { return []; }
  }
  function _getAsset(id) {
    var ala = SBE.ActorAssetLibraryAuthority;
    return (ala && ala.getAsset) ? ala.getAsset(id) : null;
  }
  // Resolve palette → CSS custom property map (safe fallback Studio colours).
  function _paletteVars(paletteRef) {
    var pal = null;
    try { pal = SBE.ActorPresentationPaletteRegistry && SBE.ActorPresentationPaletteRegistry.resolvePalette(paletteRef); } catch (e) {}
    var fb = { body: 0x4a5560, roof: 0x78e6ff, side: 0x2c3640, glass: 0x0c1620, accent: 0x9fd6ec, light: 0xdffbff };
    var p = pal || fb;
    return { '--asset-body': _hex(p.body), '--asset-roof': _hex(p.roof), '--asset-side': _hex(p.side),
             '--asset-glass': _hex(p.glass), '--asset-accent': _hex(p.accent), '--asset-light': _hex(p.light) };
  }

  // Center panel in Asset Library = preview card (asset list lives in left panel).
  function _renderAssetLibrary(body) {
    var ala = SBE.ActorAssetLibraryAuthority;
    if (!_assets().length) { body.appendChild(_el('div', 'studio-empty', 'ActorAssetLibraryAuthority unavailable.')); return; }
    body.appendChild(_buildPreviewCard());
    if (ala && ala.listAssignments) {
      var det = _el('details', 'studio-assignments');
      det.appendChild(_el('summary', null, 'Identity → Asset assignments'));
      var m = ala.listAssignments();
      det.appendChild(_table(['visualIdentityKey', 'assetId'], Object.keys(m).map(function (k) { return [k, m[k]]; })));
      body.appendChild(det);
    }
  }

  // Symbolic DOM/CSS preview shape per silhouette (no canvas/WebGL).
  function _previewShape(silhouette) {
    var stage = _el('div', 'asset-preview-stage');
    // sub-parts so shapes read by structure, not colour alone
    // 0603T — map new marine silhouettes to existing/CSS-only preview structures.
    var MARINE_PREVIEW = {
      'tug-boat': 'vessel-generic', 'pilot-boat': 'vessel-generic', 'service-boat': 'vessel-generic',
      'police-boat': 'vessel-generic', 'fire-boat': 'vessel-generic', 'unknown-vessel': 'vessel-generic',
      'cargo-ship': 'cargo-ship', 'container-ship': 'cargo-ship', 'tanker': 'tanker', 'barge': 'barge',
      'cruise-ship': 'passenger-ferry', 'yacht': 'yacht', 'sailboat': 'sailboat', 'fishing-boat': 'vessel-generic',
    };
    var key = MARINE_PREVIEW[silhouette] || silhouette;
    var shapeClass = 'asset-preview-shape asset-preview-shape--' + (key || 'generic-actor');
    var parts = {
      'city-bus':        ['body', 'roof', 'window', 'accent'],
      'utility-truck':   ['body', 'box', 'beacon'],
      'station-node':    ['cap', 'pin', 'puck'],
      'vessel-generic':  ['hull', 'bow', 'cabin'],
      'passenger-ferry': ['hull', 'bow', 'cabin', 'cabin2'],
      'cargo-ship':      ['hull', 'bow', 'stack', 'stack2'],
      'tanker':          ['hull', 'bow', 'manifold'],
      'barge':           ['flat'],
      'yacht':           ['hull', 'bow', 'cabin'],
      'sailboat':        ['hull', 'mast', 'sail'],
      'aircraft-light':  ['wing', 'fuse', 'tail'],
      'subway-train':    ['car', 'car', 'car'],
      'ambient-car':     ['body', 'roof'],
      'alert-marker':    ['diamond'],
      'world-prop':      ['cube'],
      'generic-actor':   ['dot'],
    }[key] || ['dot'];
    var shape = _el('div', shapeClass);
    parts.forEach(function (cls, i) { var d = _el('div', 'ap-' + cls + ' ap-i' + i); shape.appendChild(d); });
    stage.appendChild(shape);
    return stage;
  }

  function _buildPreviewCard() {
    var a = _state.selectedAssetId ? _getAsset(_state.selectedAssetId) : null;
    var card = _el('div', 'asset-preview-card');
    if (!a) { card.appendChild(_el('div', 'studio-empty', 'Select an asset to preview.')); return card; }

    // apply palette CSS vars to the card
    var vars = _paletteVars(a.paletteRef);
    for (var k in vars) if (vars.hasOwnProperty(k)) card.style.setProperty(k, vars[k]);

    var head = _el('div', 'asset-preview-head');
    head.appendChild(_el('div', 'asset-preview-title', a.label));
    head.appendChild(_el('div', 'asset-preview-id', a.id));
    card.appendChild(head);

    // variant tabs
    var tabs = _el('div', 'asset-variant-tabs');
    var vkeys = Object.keys(a.variants || {});
    if (!_state.selectedVariantKey || !a.variants[_state.selectedVariantKey]) {
      _state.selectedVariantKey = (a.defaultVariant && a.variants[a.defaultVariant]) ? a.defaultVariant : (vkeys[0] || null);
    }
    vkeys.forEach(function (vk) {
      var b = _el('button', 'asset-variant-tab' + (vk === _state.selectedVariantKey ? ' active' : ''), vk);
      b.addEventListener('click', function () { selectVariant(vk); });
      tabs.appendChild(b);
    });
    card.appendChild(tabs);

    // symbolic preview
    card.appendChild(_previewShape(a.silhouetteClass));

    // meta line under preview
    var v = a.variants[_state.selectedVariantKey] || {};
    var meta = _el('div', 'asset-preview-meta');
    meta.appendChild(_metaLine('Variant', _state.selectedVariantKey || '-'));
    meta.appendChild(_metaLine('Render Variant', v.renderVariant || '-'));
    meta.appendChild(_metaLine('Silhouette', a.silhouetteClass || '-'));
    card.appendChild(meta);
    return card;
  }
  function _metaLine(label, value) {
    var row = _el('div', 'studio-field');
    row.appendChild(_el('span', 'label', label)); row.appendChild(_el('span', 'value', String(value)));
    return row;
  }

  // ── Selection API (also used by debug) ───────────────────────────────────────
  function selectAsset(assetId) {
    var a = _getAsset(assetId);
    if (!a) { _state.lastError = 'asset_not_found'; return false; }
    _state.selectedAssetId = assetId;
    _state.selectedInspectorContext = 'asset';
    _state.selectedVariantKey = (a.defaultVariant && a.variants[a.defaultVariant]) ? a.defaultVariant
      : (Object.keys(a.variants || {})[0] || null);
    if (_state.mode !== 'asset-library') { setMode('asset-library'); }
    else { _renderStage(); }
    // highlight in left asset list (no shared highlight with identity rows)
    var rows = doc.querySelectorAll('.studio-asset-row');
    for (var i = 0; i < rows.length; i++) rows[i].classList.toggle('selected', rows[i].dataset.assetid === assetId);
    _renderAssetInspector();
    return true;
  }
  function selectVariant(variantKey) {
    var a = _state.selectedAssetId ? _getAsset(_state.selectedAssetId) : null;
    if (!a || !a.variants || !a.variants[variantKey]) { _state.lastError = 'variant_not_found'; return false; }
    _state.selectedVariantKey = variantKey;
    _state.selectedInspectorContext = 'asset';
    if (_state.mode === 'asset-library') _renderStage();
    _renderAssetInspector();
    return true;
  }

  // Inspector for the selected asset (fields + variant + file slots + swatches).
  function _renderAssetInspector() {
    var body = _byId('studio-inspector-body'); body.innerHTML = '';
    _inspectorHeader(body, 'Asset');
    var a = _state.selectedAssetId ? _getAsset(_state.selectedAssetId) : null;
    if (!a) { body.appendChild(_el('div', 'studio-empty', 'Select an asset to inspect.')); return; }
    ['id', 'key', 'category', 'label', 'silhouetteClass', 'paletteRef', 'glyphRef', 'materialClass',
     'lightClass', 'scaleClass', 'priorityClass', 'defaultVariant', 'source', 'editable'].forEach(function (f) {
      if (a[f] == null) return;
      body.appendChild(_metaLine(f, a[f]));
    });
    // selected variant
    var v = a.variants && a.variants[_state.selectedVariantKey];
    if (v) {
      body.appendChild(_el('div', 'studio-note', 'Variant: ' + _state.selectedVariantKey));
      ['kind', 'renderVariant', 'uri', 'minZoom', 'maxZoom'].forEach(function (f) {
        body.appendChild(_metaLine(f, v[f] == null ? '-' : v[f]));
      });
    }
    // file slots
    var fs = _el('div', 'asset-file-slots');
    fs.appendChild(_el('div', 'studio-note', 'File slots:'));
    var files = a.files || {};
    ['svg', 'glb', 'webp', 'thumbnail'].forEach(function (k) {
      var row = _el('div', 'studio-field');
      row.appendChild(_el('span', 'label', k));
      row.appendChild(_el('span', 'value', files[k] ? 'present' : 'empty'));
      fs.appendChild(row);
    });
    body.appendChild(fs);
    // tags
    if (a.tags && a.tags.length) {
      var cr = _el('div', 'studio-chip-row'); a.tags.forEach(function (t) { cr.appendChild(_el('span', 'studio-chip', t)); });
      body.appendChild(cr);
    }
    // palette swatches
    var pal = null;
    try { pal = SBE.ActorPresentationPaletteRegistry && SBE.ActorPresentationPaletteRegistry.resolvePalette(a.paletteRef); } catch (e) {}
    if (pal) {
      var sw = _el('div', 'studio-swatches'); sw.style.marginTop = '10px';
      ['body', 'roof', 'side', 'glass', 'accent', 'light'].forEach(function (c) {
        var d = _el('div', 'studio-swatch'); d.style.background = _hex(pal[c]); d.title = c + ' ' + _hex(pal[c]); sw.appendChild(d);
      });
      body.appendChild(sw);
    }
  }

  function _renderActorPreview(body) {
    var profiles = _identityProfiles();
    if (!profiles.length) { body.appendChild(_el('div', 'studio-empty', 'No identity profiles available.')); return; }
    body.appendChild(_el('div', 'studio-note', profiles.length + ' identity profiles. Select one from the Library to inspect.'));
    var tbl = _table(['key', 'actorType', 'silhouetteClass', 'paletteRef', 'scaleClass', 'priorityClass'],
      profiles.map(function (p) { return [p.key, p.actorType, p.silhouetteClass, p.paletteRef, p.scaleClass, p.priorityClass]; }));
    body.appendChild(tbl);
  }

  function _renderPaletteLab(body) {
    var pals = _palettes();
    if (!pals.length) { body.appendChild(_el('div', 'studio-empty', 'ActorPresentationPaletteRegistry unavailable.')); return; }
    pals.forEach(function (p) {
      var row = _el('div', 'studio-pal');
      row.appendChild(_el('div', 'studio-pal-key', p.key));
      var sw = _el('div', 'studio-swatches');
      ['body', 'roof', 'side', 'glass', 'accent', 'light', 'shadow'].forEach(function (c) {
        var d = _el('div', 'studio-swatch'); d.style.background = _hex(p[c]); d.title = c + ' ' + _hex(p[c]); sw.appendChild(d);
      });
      row.appendChild(sw);
      body.appendChild(row);
    });
  }

  function _renderGlyphLab(body) {
    // Glyph Lab migration is staged: Wall keeps its current glyph section; Studio
    // provides the full-page home for the future grid/preview/metadata tools.
    body.appendChild(_el('div', 'studio-note', 'Glyph Lab (Studio) — full-page workspace placeholder.'));
    var reg = SBE.GlyphRegistry;
    if (reg && typeof reg.list === 'function') {
      try {
        var glyphs = reg.list();
        body.appendChild(_el('div', 'studio-note', (glyphs ? glyphs.length : 0) + ' glyphs in SBE.GlyphRegistry.'));
      } catch (e) { body.appendChild(_el('div', 'studio-empty', 'GlyphRegistry read failed.')); }
    } else {
      body.appendChild(_el('div', 'studio-empty', 'SBE.GlyphRegistry not present yet — Glyph Lab tools land in a follow-up. The current Wall glyph section remains functional.'));
    }
  }

  function _wa() { return global._wos && global._wos.debug && global._wos.debug.worldActors; }
  function _renderProofStage(body) {
    var wa = _wa();
    var actions = _el('div', 'studio-stage-actions');
    var bSpawn = _el('button', 'studio-btn primary', 'Spawn Proof Lineup');
    var bClear = _el('button', 'studio-btn', 'Clear Proof Lineup');
    var bRefresh = _el('button', 'studio-btn', 'Refresh State');
    actions.appendChild(bSpawn); actions.appendChild(bClear); actions.appendChild(bRefresh);
    body.appendChild(actions);

    var note = _el('div', 'studio-note',
      wa ? 'Proof actors flow through the real TruthActorRuntime → ActorRenderAuthority pipeline. (Studio has no map, so meshes are not drawn here — identity/payload data is shown.)'
         : 'Proof harness (_wos.debug.worldActors) unavailable.');
    body.appendChild(note);
    var tableHost = _el('div'); tableHost.id = 'studio-proof-table'; body.appendChild(tableHost);

    function refresh() {
      tableHost.innerHTML = '';
      if (!wa || !wa.visualProofState) { tableHost.appendChild(_el('div', 'studio-empty', 'No proof state available.')); return; }
      var st = wa.visualProofState();
      tableHost.appendChild(_el('div', 'studio-note', 'proofActorCount: ' + st.proofActorCount +
        ' | rendered: ' + st.renderedCount + ' | suppressed: ' + st.suppressedCount));
      var rows = (st.actors || []).map(function (a) {
        return [a.proofKey, a.actorType, a.visualIdentityKey, a.silhouetteClass, a.paletteRef, String(a.rendered)]; });
      if (rows.length) tableHost.appendChild(_table(['proofKey', 'actorType', 'identity', 'silhouette', 'palette', 'rendered'], rows));
    }
    bSpawn.addEventListener('click', function () { if (wa && wa.visualProofLineup) { wa.visualProofLineup(); refresh(); } });
    bClear.addEventListener('click', function () { if (wa && wa.clearVisualProofLineup) { wa.clearVisualProofLineup(); refresh(); } });
    bRefresh.addEventListener('click', refresh);
    refresh();   // initial (does NOT auto-spawn)
  }

  function _table(headers, rows) {
    var t = _el('table', 'studio-table');
    var thead = _el('thead'); var htr = _el('tr');
    headers.forEach(function (h) { htr.appendChild(_el('th', null, h)); });
    thead.appendChild(htr); t.appendChild(thead);
    var tb = _el('tbody');
    rows.forEach(function (r) { var tr = _el('tr'); r.forEach(function (c) { tr.appendChild(_el('td', null, c == null ? '-' : String(c))); }); tb.appendChild(tr); });
    t.appendChild(tb); return t;
  }

  // ── Mode / routing ───────────────────────────────────────────────────────────
  function setMode(name) {
    if (MODES.indexOf(name) === -1) name = 'asset-library';
    _state.mode = name;
    var tabs = doc.querySelectorAll('#studio-tabs button');
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('active', tabs[i].dataset.mode === name);
    try { global.location.hash = name; } catch (e) {}
    _state.assignStatus = null; _state.assignPanelOpen = false;   // clear assignment status on mode switch
    _renderLibrary();   // left panel is mode-aware (assets vs identities)
    _renderStage();
    // Inspector context follows the mode (no stale cross-context display).
    if (name === 'asset-library') { _state.selectedInspectorContext = 'asset'; _renderAssetInspector(); }
    else if (name === 'actor-library') {
      _state.selectedInspectorContext = _state.selectedIdentityKey ? 'identity' : 'empty';
      if (_state.selectedIdentityKey) { var p = null; _identityProfiles().forEach(function (x) { if (x.key === _state.selectedIdentityKey) p = x; }); _renderIdentityInspector(p); }
      else _renderEmptyInspector('Select an actor identity to inspect.');
    }
    else if (name === 'palette-lab') { _state.selectedInspectorContext = 'palette'; _renderEmptyInspector('Inspecting palettes — select a palette swatch in the stage.'); }
    else if (name === 'proof-stage') { _state.selectedInspectorContext = 'proof'; _renderProofInspector(); }
    else { _state.selectedInspectorContext = 'empty'; _renderEmptyInspector('—'); }
    return name;
  }
  function _renderEmptyInspector(msg) {
    var body = _byId('studio-inspector-body'); body.innerHTML = '';
    var label = ({ asset: 'Asset', identity: 'Identity', palette: 'Palette', proof: 'Proof', empty: 'None' })[_state.selectedInspectorContext] || 'None';
    _inspectorHeader(body, label);
    body.appendChild(_el('div', 'studio-empty', msg || '—'));
  }
  function _renderProofInspector() {
    var body = _byId('studio-inspector-body'); body.innerHTML = '';
    _inspectorHeader(body, 'Proof');
    var wa = _wa();
    if (wa && wa.visualProofState) {
      try { var st = wa.visualProofState();
        body.appendChild(_metaLine('proofActorCount', st.proofActorCount));
        body.appendChild(_metaLine('rendered', st.renderedCount));
        body.appendChild(_metaLine('suppressed', st.suppressedCount));
        return;
      } catch (e) {}
    }
    body.appendChild(_el('div', 'studio-empty', 'Use the Proof Stage controls to spawn a lineup.'));
  }

  function _initHash() {
    var h = (global.location.hash || '').replace('#', '');
    if (MODES.indexOf(h) !== -1) _state.mode = h;
  }

  function _boot() {
    _initHash();
    var tabs = doc.querySelectorAll('#studio-tabs button');
    for (var i = 0; i < tabs.length; i++) {
      (function (btn) { btn.addEventListener('click', function () { setMode(btn.dataset.mode); }); })(tabs[i]);
    }
    global.addEventListener('hashchange', function () { _initHash(); setMode(_state.mode); });
    _renderLibrary();
    // 0603P — auto-select the first asset only (no proof spawn / feed / Drive).
    var assets = _assets();
    if (assets.length && !_state.selectedAssetId) {
      _state.selectedAssetId = assets[0].id;
      var a0 = assets[0];
      _state.selectedVariantKey = (a0.defaultVariant && a0.variants[a0.defaultVariant]) ? a0.defaultVariant : Object.keys(a0.variants || {})[0] || null;
    }
    setMode(_state.mode);
    console.log('[StudioShell] v' + VERSION + ' ready (no feeds / Drive / map auto-started)');
  }

  // ── Debug namespace ───────────────────────────────────────────────────────────
  function _loadedModules() {
    return ['ActorTypes', 'ActorSourceRegistry', 'ActorIdentityRegistry', 'ActorVisualRegistry',
            'TruthActorVisualLODPolicy', 'ActorRenderAuthority', 'ActorVisualIdentityAuthority',
            'ActorPresentationPaletteRegistry', 'TruthActorRuntime']
      .filter(function (k) { return !!SBE[k]; });
  }
  global._wos = global._wos || {};
  global._wos.debug = global._wos.debug || {};
  global._wos.debug.studio = {
    state: function () { return { active: _state.active, mode: _state.mode,
      selectedIdentityKey: _state.selectedIdentityKey, selectedAssetId: _state.selectedAssetId,
      selectedVariantKey: _state.selectedVariantKey, selectedInspectorContext: _state.selectedInspectorContext,
      loadedModules: _loadedModules(), lastError: _state.lastError }; },
    mode: function (name) { return setMode(name); },
    refresh: function () { _renderLibrary(); _renderStage(); return true; },
    inspectorContext: function () { return _state.selectedInspectorContext; },
    // 0603Q — identity selection (and back-compat selectActor → selectIdentity).
    selectIdentity: function (key) { if (_state.mode !== 'actor-library') setMode('actor-library'); return _selectIdentity(key); },
    selectActor: function (key) { return this.selectIdentity(key); },
    selectedIdentity: function () {
      var p = null; if (_state.selectedIdentityKey) _identityProfiles().forEach(function (x) { if (x.key === _state.selectedIdentityKey) p = x; });
      return { selectedIdentityKey: _state.selectedIdentityKey, identity: p };
    },
    // 0603P/Q — asset preview controls.
    selectedAsset: function () {
      var a = _state.selectedAssetId ? _getAsset(_state.selectedAssetId) : null;
      var v = a && a.variants ? a.variants[_state.selectedVariantKey] : null;
      return { selectedAssetId: _state.selectedAssetId, selectedVariantKey: _state.selectedVariantKey, asset: a, variant: v };
    },
    selectAsset: function (assetId) { return selectAsset(assetId); },
    selectVariant: function (variantKey) { return selectVariant(variantKey); },
    assetPreviewState: function () {
      return { active: _state.active, mode: _state.mode, selectedAssetId: _state.selectedAssetId,
        selectedVariantKey: _state.selectedVariantKey, assetCount: _assets().length, lastError: _state.lastError };
    },
    // 0603R — in-memory identity → asset assignment controls.
    assignIdentityAsset: function (identityKey, assetId) {
      var ala = SBE.ActorAssetLibraryAuthority;
      if (!ala || !ala.assignIdentity) return { ok: false, reason: 'authority_unavailable' };
      var r = ala.assignIdentity(identityKey, assetId);
      if (r.ok) { _state.assignStatus = 'Assigned ' + identityKey + ' → ' + (r.asset ? r.asset.label : assetId); }
      _refreshAssignmentViews(identityKey);
      return r;
    },
    resetAssetAssignments: function () {
      var ala = SBE.ActorAssetLibraryAuthority;
      if (!ala || !ala.resetAssignments) return { ok: false, reason: 'authority_unavailable' };
      var s = ala.resetAssignments();
      _state.assignStatus = 'Assignments reset to defaults.';
      _refreshAssignmentViews(_state.selectedIdentityKey);
      return s;
    },
    assignmentState: function (identityKey) {
      var ala = SBE.ActorAssetLibraryAuthority;
      if (!ala) return null;
      var g = ala.getAssignment ? ala.getAssignment(identityKey) : null;
      var prof = null; _identityProfiles().forEach(function (x) { if (x.key === identityKey) prof = x; });
      var comp = prof ? _compatibleAssets(prof).compatible.length : 0;
      return { identityKey: identityKey, assetId: g ? g.assetId : null,
        assetLabel: g && g.asset ? g.asset.label : null, compatibleAssetCount: comp };
    },
    compatibleAssets: function (identityKey) {
      var prof = null; _identityProfiles().forEach(function (x) { if (x.key === identityKey) prof = x; });
      if (!prof) return [];
      return _compatibleAssets(prof).compatible.map(function (a) {
        return { assetId: a.id, label: a.label, category: a.category, silhouetteClass: a.silhouetteClass, paletteRef: a.paletteRef };
      });
    },
    // 0603U — marine taxonomy resolver (advisory, read-only).
    marineTaxonomyState: function () {
      var r = SBE.MarineVesselTaxonomyResolver;
      return (r && r.getState) ? r.getState() : null;
    },
    marineTaxonomyRules: function () {
      var r = SBE.MarineVesselTaxonomyResolver;
      return (r && r.listRules) ? r.listRules() : null;
    },
    marineTaxonomyResolve: function (input) {
      var r = SBE.MarineVesselTaxonomyResolver;
      return (r && r.resolveVessel) ? r.resolveVessel(input || {}) : null;
    },
    marineTaxonomyAssets: function () {
      var r = SBE.MarineVesselTaxonomyResolver;
      return (r && r.listMarineAssets) ? r.listMarineAssets().map(function (a) {
        return { assetId: a.id, label: a.label, vesselRole: a.metadata && a.metadata.vesselRole,
          expectedAISShipTypes: a.metadata && a.metadata.expectedAISShipTypes }; }) : [];
    },
    // 0603V — marine taxonomy asset bridge state.
    marineAssetBridgeState: function () {
      var b = SBE.MarineTaxonomyAssetBridge;
      return (b && b.getState) ? b.getState() : null;
    },
    // 0603Y — AIS vessel metadata audit (read-only; clean empty state in Studio).
    aisMetadataAudit: function () {
      var au = SBE.AISVesselMetadataAudit;
      return (au && au.audit) ? au.audit() : { marineActorCount: 0, warnings: ['audit_unavailable'], actors: [] };
    },
    aisMetadataSample: function (options) {
      var au = SBE.AISVesselMetadataAudit;
      return (au && au.sample) ? au.sample(options || {}) : [];
    },
    // 0603X — marine palette tokens.
    marinePalettes: function () {
      var reg = SBE.ActorPresentationPaletteRegistry;
      if (!reg || !reg.listPalettes) return { count: 0, palettes: [] };
      var pals = reg.listPalettes().filter(function (p) { return /^marine\./.test(p.key); });
      return { count: pals.length, palettes: pals };
    },
    // 0603T — marine asset pack listing.
    marineAssets: function () {
      var ala = SBE.ActorAssetLibraryAuthority;
      if (!ala || !ala.listByCategory) return { count: 0, assets: [] };
      var list = ala.listByCategory('marine');
      return { count: list.length, assets: list.map(function (a) {
        return { assetId: a.id, label: a.label, silhouetteClass: a.silhouetteClass, scaleClass: a.scaleClass,
          priorityClass: a.priorityClass, paletteRef: a.paletteRef, vesselRole: a.metadata && a.metadata.vesselRole }; }) };
    },
    // 0603S — manual persistence (export / validate / import).
    exportAssetAssignments: function () {
      var ala = SBE.ActorAssetLibraryAuthority;
      return (ala && ala.exportAssignments) ? ala.exportAssignments() : null;
    },
    validateAssetAssignments: function (payload) {
      var ala = SBE.ActorAssetLibraryAuthority;
      return (ala && ala.validateAssignments) ? ala.validateAssignments(payload) : null;
    },
    importAssetAssignments: function (payload, options) {
      var ala = SBE.ActorAssetLibraryAuthority;
      if (!ala || !ala.importAssignments) return { ok: false, reason: 'authority_unavailable' };
      var res = ala.importAssignments(payload, options || {});
      if (res.ok && !res.dryRun) {
        _state.assignStatus = 'Import (' + res.mode + ') — applied ' + res.appliedCount + ', skipped ' + res.skippedCount + '.';
        _refreshAssignmentViews(_state.selectedIdentityKey);
      }
      return res;
    },
  };

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', _boot);
  else _boot();

  console.log('[StudioShell] v' + VERSION + ' loaded');
})(window);
