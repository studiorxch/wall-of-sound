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

  // 0617A: Studio surfaces simplified to Library | Map | Canvas | Broadcast.
  //   Inspector removed from top nav — persistent right-side panel only.
  //   'map' replaces '3d-canvas' (world placement surface).
  //   'canvas' is blank 3D staging space.
  //   palette-lab preserved for debug via #palette-lab hash.
  var MODES = ['library', 'map', 'canvas', 'palette-lab'];
  var STAGE_TITLES = {
    'library':    'Library',
    'map':        'Map',
    'canvas':     'Canvas',
    'palette-lab': 'Palette Lab',
  };

  var _state = { active: true, mode: 'map',
                 selectedIdentityKey: null, selectedAssetId: null, selectedVariantKey: null,
                 selectedInspectorContext: 'asset', assignPanelOpen: false, assignStatus: null,
                 lastError: null,
                 selectedBuilding: null,       // Phase 6: BuildingSelection | null
                 lastSelectedObjectId: null,   // Phase 7: for draft discard on deselect
                 advancedOpen: false };         // 0617A: collapsed Advanced library section

  // 0619G: Library section collapse state — persisted to localStorage
  var LS_SECTION_KEY = 'wos.studio.library.sectionState';
  var _libSections = null;
  var _SECTION_DEFAULTS = { assets:true, structure:true, road:false, marine:false, aircraft:false, prop:false, transit:false, civic:false, world:false, system:false, synthetic:false, debug:false, unknown:false, actors:false, imports:false, advanced:false };

  function _getSectionOpen(key) {
    if (!_libSections) {
      try { var raw = localStorage.getItem(LS_SECTION_KEY); _libSections = raw ? Object.assign({}, _SECTION_DEFAULTS, JSON.parse(raw)) : Object.assign({}, _SECTION_DEFAULTS); }
      catch (e) { _libSections = Object.assign({}, _SECTION_DEFAULTS); }
    }
    return (key in _libSections) ? _libSections[key] : true;
  }

  function _setSectionOpen(key, open) {
    _getSectionOpen(key);
    _libSections[key] = open;
    try { localStorage.setItem(LS_SECTION_KEY, JSON.stringify(_libSections)); } catch (e) {}
  }

  // Helper: renders a collapsible section toggle + body
  function _renderLibSection(parentBody, key, label, renderFn, opts) {
    var isSub = opts && opts.sub;
    var open = _getSectionOpen(key);
    var section = _el('div', 'lib-section' + (isSub ? ' lib-section--sub' : ''));
    var head = _el('button', 'lib-section-head' + (isSub ? ' lib-section-head--sub' : ''), (open ? '▾ ' : '▸ ') + label);
    head.addEventListener('click', function () { _setSectionOpen(key, !open); _refreshActorRows(); });
    section.appendChild(head);
    if (open) {
      var body = _el('div', 'lib-section-body');
      renderFn(body);
      section.appendChild(body);
    }
    parentBody.appendChild(section);
  }

  // 0619G: Placement diagnostics — updated by threeDCanvasView events
  var _placementDiag = {
    armed: false, activeAssetId: null, activeAssetLabel: null,
    lastClick: null, lastResult: null, lastError: null,
    createdObjectId: null, markerAdded: false, proxyAdded: false,
  };

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

  // ── Library panel — unified assets + actors (0613) ──────────────────────────
  function _renderLibrary() {
    var body = _byId('studio-library-body');
    body.innerHTML = '';
    // Always render unified library regardless of mode
    _renderUnifiedLibrary(body);
  }

  function _renderUnifiedLibrary(body) {
    var libCtrl = global.WOSLibraryController;
    var query = libCtrl ? libCtrl.searchQuery() : '';

    // Search input
    if (libCtrl) {
      libCtrl.buildSearchInput(body, function () { _refreshActorRows(); });
    }

    // Active placement indicator (above sections — always visible when active)
    _renderActiveAssetIndicator(body);

    // ── Assets section (collapsible, open by default) ─────────────────────────
    _renderLibSection(body, 'assets', 'Assets', function (inner) {
      _renderAssetRowsBySectionedCategory(inner, query);
    });

    // ── Actors section (collapsed by default) ─────────────────────────────────
    _renderLibSection(body, 'actors', 'Actors', function (inner) {
      _renderActorRows(inner, query);
    });

    // ── Imports section (collapsed by default) ────────────────────────────────
    var importCount = _getImportCount();
    _renderLibSection(body, 'imports', importCount ? 'Imports [' + importCount + ']' : 'Imports', function (inner) {
      _renderGlbImportSection(inner);
      _renderBuildingTextureSection(inner);
      _renderCompositionSection(inner);
    });

    // ── Advanced section (collapsed by default) ───────────────────────────────
    _renderLibSection(body, 'advanced', 'Advanced', function (inner) {
      _renderCustomObjectLibrarySection(inner);
      _renderAdvancedSection(inner);
    });
  }

  function _getImportCount() {
    var count = 0;
    var glbStore = global.WOSGlbImportStore;
    if (glbStore) count += (glbStore.list() || []).length;
    var texStore = global.WOSBuildingTexturePackageStore;
    if (texStore) count += (texStore.list() || []).length;
    var compStore = global.WOSCompositionStore;
    if (compStore) count += (compStore.list() || []).length;
    return count;
  }

  // 0619G: Asset rows split into collapsible per-category sub-sections
  function _renderAssetRowsBySectionedCategory(parentBody, query) {
    var resolver = global.WOSAssetResolver;
    var libCtrl  = global.WOSLibraryController;
    var rawAssets = resolver ? resolver.list() : [];
    var assets = (libCtrl && query) ? libCtrl.filterAssets(rawAssets, query) : rawAssets;
    if (!assets.length) {
      parentBody.appendChild(_el('div', 'studio-empty', query ? 'No assets match "' + query + '".' : 'ActorAssetLibraryAuthority unavailable.'));
      return;
    }
    var groups = {};
    assets.forEach(function (a) { var cat = a.category || 'unknown'; (groups[cat] = groups[cat] || []).push(a); });
    ['structure', 'road', 'marine', 'aircraft', 'transit', 'civic', 'world', 'prop', 'system', 'synthetic', 'debug', 'unknown'].forEach(function (cat) {
      if (!groups[cat]) return;
      var label = cat.charAt(0).toUpperCase() + cat.slice(1) + ' (' + groups[cat].length + ')';
      _renderLibSection(parentBody, cat, label, function (inner) {
        groups[cat].forEach(function (a) { _renderAssetRow(inner, a); });
      }, { sub: true });
    });
  }

  function _renderAssetRow(parentBody, a) {
    var resolver = global.WOSAssetResolver;
    var libCtrl  = global.WOSLibraryController;
    var assetId = a.assetId || a.id;
    var isSelected = assetId === _state.selectedAssetId;
    var readiness = resolver && resolver.placementReadiness ? resolver.placementReadiness(assetId) : 'placeable';
    var row = _el('div', 'studio-asset studio-asset-row lib-asset-row lib-asset-row--' + readiness);
    row.dataset.assetid = assetId;
    if (isSelected) row.classList.add('selected');
    row.appendChild(_el('span', 'k', a.name || a.label || assetId));
    row.appendChild(_el('span', 's', a.silhouetteClass || ''));
    if (a.source === 'studio-glb-import') row.appendChild(_el('span', 'lib-asset-glb-tag', 'Imported GLB'));
    if (a.source === 'studio-custom')     row.appendChild(_el('span', 'lib-asset-custom-tag', 'Custom'));
    if (readiness !== 'placeable')        row.appendChild(_el('span', 'lib-asset-readiness-tag', readiness));
    // Place on Map — shown only on selected row
    if (isSelected) {
      var placeBtn = _el('button', 'studio-btn lib-place-btn', 'Place on Map');
      placeBtn.title = 'Switch to Map and arm placement for this asset';
      placeBtn.addEventListener('click', function (e) { e.stopPropagation(); _armPlacementFromLibrary(assetId); });
      row.appendChild(placeBtn);
    }
    if (libCtrl) libCtrl.makeDraggable(row, assetId);
    row.addEventListener('click', function () { _selectLibraryAsset(assetId); });
    row.addEventListener('dblclick', function () { _armPlacementFromLibrary(assetId); });
    parentBody.appendChild(row);
  }

  function _renderAdvancedSection(parentBody) {
    var section = _el('div', 'studio-advanced-section');
    var head = _el('div', 'studio-advanced-head');
    var toggleBtn = _el('button', 'studio-btn studio-advanced-toggle', _state.advancedOpen ? '▲ Advanced' : '▼ Advanced');
    toggleBtn.title = 'Show export, import, and management tools';
    toggleBtn.addEventListener('click', function () {
      _state.advancedOpen = !_state.advancedOpen;
      _refreshActorRows();
    });
    head.appendChild(toggleBtn);
    section.appendChild(head);

    if (_state.advancedOpen) {
      var body = _el('div', 'studio-advanced-body');

      // Custom object bulk ops
      var customStore = global.WOSCustomStudioAssetStore;
      if (customStore) {
        body.appendChild(_el('div', 'studio-advanced-group-label', 'Custom Objects'));
        var customStatusEl = _el('div', 'studio-advanced-status');

        var exportSelBtn = _el('button', 'studio-btn studio-btn--xs', 'Export Selected');
        exportSelBtn.disabled = !_customLibState.selected;
        exportSelBtn.addEventListener('click', function () {
          if (!_customLibState.selected) return;
          var result = customStore.exportOne(_customLibState.selected);
          if (!result.ok) { customStatusEl.textContent = 'Export failed: ' + result.reason; return; }
          _downloadJSON('custom-asset-' + _customLibState.selected + '.json', result.payload);
          customStatusEl.textContent = 'Exported ' + _customLibState.selected + '.';
        });
        body.appendChild(exportSelBtn);

        var exportAllBtn = _el('button', 'studio-btn studio-btn--xs', 'Export All');
        exportAllBtn.addEventListener('click', function () {
          var payload = customStore.exportJSON();
          _downloadJSON('custom-assets-all.json', payload);
          customStatusEl.textContent = 'Exported ' + Object.keys(payload.assets || {}).length + ' assets.';
        });
        body.appendChild(exportAllBtn);

        var removeSelBtn = _el('button', 'studio-btn studio-btn--xs', 'Remove Selected');
        removeSelBtn.disabled = !_customLibState.selected;
        removeSelBtn.addEventListener('click', function () {
          var id = _customLibState.selected;
          if (!id) return;
          var usage = customStore.actorsUsing(id).length;
          if (usage > 0) { customStatusEl.textContent = 'Cannot remove — ' + usage + ' actor(s) using this asset.'; return; }
          var result = customStore.remove(id);
          if (!result.ok) { customStatusEl.textContent = 'Remove failed: ' + result.reason; return; }
          _customLibState.selected = null;
          customStatusEl.textContent = 'Removed ' + id + '.';
          _refreshActorRows();
        });
        body.appendChild(removeSelBtn);

        var customImportToggle = _el('button', 'studio-btn studio-btn--xs', _customLibState.importOpen ? '▲ Cancel' : '▼ Import JSON');
        customImportToggle.addEventListener('click', function () {
          _customLibState.importOpen = !_customLibState.importOpen;
          _refreshActorRows();
        });
        body.appendChild(customImportToggle);

        if (_customLibState.importOpen) {
          var importWrap = _el('div', 'custom-obj-lib-import-wrap');
          var importTA = doc.createElement('textarea');
          importTA.className = 'custom-obj-lib-import-ta';
          importTA.placeholder = 'Paste wos.studio.customAssets JSON here…';
          importTA.rows = 6;
          importWrap.appendChild(importTA);
          var importBtn = _el('button', 'studio-btn studio-btn--xs primary', 'Import');
          importBtn.addEventListener('click', function () {
            try {
              var payload = JSON.parse(importTA.value);
              var result = customStore.importJSON(payload);
              _customLibState.lastImportResult = result;
              if (!result.ok) { customStatusEl.textContent = 'Import failed: ' + result.reason; return; }
              customStatusEl.textContent = 'Imported ' + result.importedCount + ' asset(s).';
              _customLibState.importOpen = false;
              _refreshActorRows();
            } catch (e) { customStatusEl.textContent = 'Import error: invalid JSON.'; }
          });
          importWrap.appendChild(importBtn);
          body.appendChild(importWrap);
        }
        body.appendChild(customStatusEl);
      }

      // Composition bulk ops
      var compStore = global.WOSCompositionStore;
      if (compStore) {
        body.appendChild(_el('div', 'studio-advanced-group-label', 'Compositions'));
        var compAdvStatusEl = _el('div', 'studio-advanced-status');

        var compExportAllBtn = _el('button', 'studio-btn studio-btn--xs', 'Export All Compositions');
        compExportAllBtn.addEventListener('click', function () {
          var payload = compStore.exportJSON();
          _downloadJSON('compositions-all.json', payload);
          compAdvStatusEl.textContent = 'Exported ' + (payload.compositions ? payload.compositions.length : 0) + ' composition(s).';
        });
        body.appendChild(compExportAllBtn);

        var compImportToggle = _el('button', 'studio-btn studio-btn--xs', _compState.importOpen ? '▲ Cancel' : '▼ Import Compositions JSON');
        compImportToggle.addEventListener('click', function () {
          _compState.importOpen = !_compState.importOpen;
          _refreshActorRows();
        });
        body.appendChild(compImportToggle);

        if (_compState.importOpen) {
          var compImportWrap = _el('div', 'custom-obj-lib-import-wrap');
          var compImportTA = doc.createElement('textarea');
          compImportTA.className = 'custom-obj-lib-import-ta';
          compImportTA.placeholder = 'Paste wos.studio.compositions JSON here…';
          compImportTA.rows = 6;
          compImportWrap.appendChild(compImportTA);
          var compImportBtn = _el('button', 'studio-btn studio-btn--xs primary', 'Import');
          compImportBtn.addEventListener('click', function () {
            try {
              var parsed = JSON.parse(compImportTA.value);
              var r = compStore.importJSON(parsed);
              _compState.lastImportResult = r;
              if (!r.ok) { compAdvStatusEl.textContent = 'Import failed: ' + r.reason; return; }
              compAdvStatusEl.textContent = 'Imported ' + r.importedCount + ' composition(s).';
              _compState.importOpen = false;
              _refreshActorRows();
            } catch (e) { compAdvStatusEl.textContent = 'Import error: invalid JSON.'; }
          });
          compImportWrap.appendChild(compImportBtn);
          body.appendChild(compImportWrap);
        }
        body.appendChild(compAdvStatusEl);
      }

      section.appendChild(body);
    }

    parentBody.appendChild(section);
  }

  // ── 0616J: GLB Import Bridge section ─────────────────────────────────────────
  var _glbImportState = {
    open:        false,    // panel expanded
    label:       '',
    category:    'prop',
    scaleToMeters: 1,
    lastResult:  null,
    lastError:   null,
    selected:    null,     // assetId of selected imported asset row
  };

  function _renderGlbImportSection(parentBody) {
    var glbStore = global.WOSGlbImportStore;
    var glbCtrl  = global.WOSGlbImportController;
    if (!glbStore) return;

    var section = _el('div', 'glb-import-section');

    // Header + toggle
    var head = _el('div', 'glb-import-head');
    var title = _el('span', 'glb-import-title', 'GLB Import Bridge');
    var importedList = glbStore.list();
    if (importedList.length > 0) {
      title.appendChild(_el('span', 'custom-obj-lib-count', String(importedList.length)));
    }
    var toggleBtn = _el('button', 'studio-btn glb-import-toggle', _glbImportState.open ? '▲ Close' : '▼ Import GLB');
    toggleBtn.addEventListener('click', function () {
      _glbImportState.open = !_glbImportState.open;
      _refreshActorRows();
    });
    head.appendChild(title);
    head.appendChild(toggleBtn);
    section.appendChild(head);

    // Imported GLB asset rows (always visible when there are any)
    if (importedList.length > 0) {
      var importedRowsEl = _el('div', 'glb-import-list');
      importedList.forEach(function (asset) {
        var isSelected = _glbImportState.selected === asset.id;
        var gi = asset.glbImport || {};
        var row = _el('div', 'glb-import-row' + (isSelected ? ' selected' : ''));
        var rowTop = _el('div', 'glb-import-row-top');
        rowTop.appendChild(_el('span', 'glb-import-row-label', asset.label || asset.id));
        rowTop.appendChild(_el('span', 'glb-import-row-status glb-status-' + (gi.status || 'missing-file'), gi.status || 'missing-file'));
        var glbBrSt = _broadcastStatus(asset.id);
        rowTop.appendChild(_el('span', 'broadcast-badge broadcast-badge--' + glbBrSt, glbBrSt));
        // 0617C: package status badge
        var pkgStore = global.WOSGlbRuntimePackageStore;
        var pkgRec   = pkgStore && pkgStore.get(asset.id);
        var pkgStatus = pkgRec ? pkgRec.status : 'unpackaged';
        rowTop.appendChild(_el('span', 'glb-pkg-badge glb-pkg-badge--' + pkgStatus, pkgStatus));
        row.appendChild(rowTop);
        var rowBot = _el('div', 'glb-import-row-bot');
        rowBot.appendChild(_el('span', 'glb-import-row-id', asset.id));
        if (gi.fileName) rowBot.appendChild(_el('span', 'glb-import-row-file', gi.fileName));
        row.appendChild(rowBot);

        row.addEventListener('click', function () {
          _glbImportState.selected = isSelected ? null : asset.id;
          _refreshActorRows();
        });

        // Refresh file (re-attach objectUrl after reload)
        var refreshLbl = _el('label', 'studio-btn studio-btn--xs glb-import-refresh-label', 'Re-attach File');
        var refreshInp = doc.createElement('input');
        refreshInp.type = 'file'; refreshInp.accept = '.glb'; refreshInp.style.display = 'none';
        refreshInp.addEventListener('change', function () {
          var f = refreshInp.files[0];
          if (!f) return;
          glbStore.refreshObjectUrl(asset.id, f, function (err) {
            if (err) { section.querySelector('.glb-import-status').textContent = 'Re-attach failed: ' + err.message; return; }
            var view = global.WOSThreeDCanvasView;
            if (view && view.refreshActorsByAsset) view.refreshActorsByAsset(asset.id);
            _refreshActorRows();
          });
        });
        refreshLbl.appendChild(refreshInp);
        row.appendChild(refreshLbl);

        // Remove
        var rmBtn = _el('button', 'studio-btn studio-btn--xs', 'Remove');
        rmBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          var result = glbStore.remove(asset.id);
          if (!result.ok) { section.querySelector('.glb-import-status').textContent = 'Remove failed: ' + result.reason; return; }
          if (_glbImportState.selected === asset.id) _glbImportState.selected = null;
          _refreshActorRows();
        });
        row.appendChild(rmBtn);

        importedRowsEl.appendChild(row);
      });
      section.appendChild(importedRowsEl);

      // Detail panel for selected imported asset
      if (_glbImportState.selected) {
        var selRec = glbStore.get(_glbImportState.selected);
        if (selRec) {
          var detailEl = _el('div', 'glb-import-detail');
          var gi2 = selRec.glbImport || {};
          // 0617C: package record fields
          var pkgStore2  = global.WOSGlbRuntimePackageStore;
          var pkgRec2    = pkgStore2 && pkgStore2.get(selRec.id);
          var dfields = [
            ['assetId',       selRec.id],
            ['label',         selRec.label || '—'],
            ['category',      selRec.category || '—'],
            ['status',        gi2.status || '—'],
            ['fileName',      gi2.fileName || '—'],
            ['fileSizeBytes', gi2.fileSizeBytes ? (gi2.fileSizeBytes / 1024).toFixed(1) + ' KB' : '—'],
            ['boundsM',       gi2.boundsM ? 'x:' + (gi2.boundsM.x||0).toFixed(2) + ' y:' + (gi2.boundsM.y||0).toFixed(2) + ' z:' + (gi2.boundsM.z||0).toFixed(2) : '—'],
            ['centerOffset',  gi2.centerOffsetM ? 'x:' + (gi2.centerOffsetM.x||0).toFixed(2) + ' y:' + (gi2.centerOffsetM.y||0).toFixed(2) + ' z:' + (gi2.centerOffsetM.z||0).toFixed(2) : '—'],
            ['scaleToMeters', String(gi2.scaleToMeters != null ? gi2.scaleToMeters : 1)],
            ['validatedAt',   gi2.validatedAt ? gi2.validatedAt.replace('T',' ').replace(/\.\d+Z$/,' UTC') : '—'],
            ['packageStatus', pkgRec2 ? pkgRec2.status : 'unpackaged'],
            ['packageId',     pkgRec2 ? pkgRec2.packageId : '—'],
            ['runtimeUrl',    pkgRec2 ? pkgRec2.runtimeUrl : '—'],
            ['packagedAt',    pkgRec2 && pkgRec2.packagedAt ? pkgRec2.packagedAt.replace('T',' ').replace(/\.\d+Z$/,' UTC') : '—'],
            ['contentHash',   pkgRec2 ? pkgRec2.contentHash : '—'],
            ['pkgSizeBytes',  pkgRec2 && pkgRec2.fileSizeBytes ? (pkgRec2.fileSizeBytes / 1024).toFixed(1) + ' KB' : '—'],
          ];
          dfields.forEach(function (p) { detailEl.appendChild(_inspReadOnly(p[0], p[1])); });

          // Package for Broadcast / Re-package button
          if (pkgStore2) {
            var pkgActionWrap = _el('div', 'glb-import-pkg-actions');
            var pkgBtn = _el('button', 'studio-btn primary glb-pkg-action-btn', pkgRec2 ? 'Re-package' : 'Package for Broadcast');
            pkgBtn.title = 'Packages this GLB into the Broadcast runtime asset directory (wall/assets/glb/).';
            var pkgStatusEl = _el('div', 'glb-pkg-action-status');
            pkgBtn.addEventListener('click', function () {
              pkgBtn.disabled = true;
              pkgBtn.textContent = 'Packaging…';
              pkgStatusEl.textContent = '';
              pkgStore2.packageGlb(selRec.id, function (err, result) {
                pkgBtn.disabled = false;
                if (err) {
                  pkgBtn.textContent = pkgRec2 ? 'Re-package' : 'Package for Broadcast';
                  pkgStatusEl.textContent = 'Error: ' + err.message;
                  return;
                }
                pkgBtn.textContent = 'Re-package';
                pkgStatusEl.textContent = 'Packaged — ' + result.runtimeUrl;
                _renderUnifiedLibrary(doc.getElementById('studio-library-body'));
              });
            });
            pkgActionWrap.appendChild(pkgBtn);
            pkgActionWrap.appendChild(pkgStatusEl);
            detailEl.appendChild(pkgActionWrap);
          }

          section.appendChild(detailEl);
        }
      }
    }

    var statusEl = _el('div', 'glb-import-status');

    if (_glbImportState.open) {
      var formEl = _el('div', 'glb-import-form');

      // Label input
      var labelWrap = _el('div', 'insp-field-wrap');
      labelWrap.appendChild(_el('label', 'insp-label', 'label'));
      var labelInp = doc.createElement('input');
      labelInp.type = 'text'; labelInp.maxLength = 80;
      labelInp.className = 'insp-input'; labelInp.value = _glbImportState.label;
      labelInp.addEventListener('input', function () { _glbImportState.label = labelInp.value; });
      labelWrap.appendChild(labelInp);
      formEl.appendChild(labelWrap);

      // Category select
      var catWrap = _el('div', 'insp-field-wrap');
      catWrap.appendChild(_el('label', 'insp-label', 'category'));
      var catSel = doc.createElement('select');
      catSel.className = 'insp-select';
      ['prop', 'structure', 'vehicle', 'maritime', 'aircraft'].forEach(function (c) {
        var opt = doc.createElement('option');
        opt.value = c; opt.textContent = c;
        if (c === _glbImportState.category) opt.selected = true;
        catSel.appendChild(opt);
      });
      catSel.addEventListener('change', function () { _glbImportState.category = catSel.value; });
      catWrap.appendChild(catSel);
      formEl.appendChild(catWrap);

      // Scale input
      var scaleWrap = _el('div', 'insp-field-wrap');
      scaleWrap.appendChild(_el('label', 'insp-label', 'scaleToMeters'));
      var scaleInp = doc.createElement('input');
      scaleInp.type = 'number'; scaleInp.step = '0.01'; scaleInp.min = '0.001'; scaleInp.max = '1000';
      scaleInp.className = 'insp-input'; scaleInp.value = String(_glbImportState.scaleToMeters);
      scaleInp.addEventListener('input', function () {
        var v = parseFloat(scaleInp.value);
        if (isFinite(v) && v > 0) _glbImportState.scaleToMeters = v;
      });
      scaleWrap.appendChild(scaleInp);
      formEl.appendChild(scaleWrap);

      // File picker + import button
      var fileWrap = _el('div', 'glb-import-file-wrap');
      var fileLbl  = _el('label', 'studio-btn primary glb-import-file-label', 'Choose .glb file');
      var fileInp  = doc.createElement('input');
      fileInp.type = 'file'; fileInp.accept = '.glb'; fileInp.style.display = 'none';

      fileInp.addEventListener('change', function () {
        var f = fileInp.files[0];
        if (!f) return;
        var fileCheck = glbStore.validateFile(f);
        if (!fileCheck.ok) {
          statusEl.textContent = 'Invalid file: ' + fileCheck.reason;
          if (glbCtrl) glbCtrl.recordImportError(fileCheck.reason);
          return;
        }
        statusEl.textContent = 'Parsing ' + f.name + '…';
        glbStore.importFile(f, {
          label:         _glbImportState.label || null,
          category:      _glbImportState.category,
          scaleToMeters: _glbImportState.scaleToMeters,
        }, function (err, result) {
          if (err) {
            statusEl.textContent = 'Import failed: ' + err.message;
            if (glbCtrl) glbCtrl.recordImportError(err.message);
            return;
          }
          if (glbCtrl) glbCtrl.recordImportResult(result.assetId, result.warnings);
          _glbImportState.selected = result.assetId;
          statusEl.textContent = 'Imported ' + result.assetId +
            (result.warnings.length ? ' | ' + result.warnings.length + ' warning(s)' : '');
          _refreshActorRows();
        });
      });

      fileLbl.appendChild(fileInp);
      fileWrap.appendChild(fileLbl);
      formEl.appendChild(fileWrap);

      section.appendChild(formEl);
    }

    section.appendChild(statusEl);

    // Separator
    var sep = _el('div', '');
    sep.style.cssText = 'border-top:1px solid rgba(255,255,255,.06); margin:8px 0 0;';
    section.appendChild(sep);

    parentBody.appendChild(section);
  }

  // ── 0618B: Building Texture section ──────────────────────────────────────────
  var _buildingTexState = { open: false, selected: null };

  function _renderBuildingTextureSection(parentBody) {
    var texStore  = global.WOSBuildingTexturePackageStore;
    var assignCtl = global.WOSBuildingTextureAssignmentController;
    if (!texStore) return;

    var section = _el('div', 'btex-section');
    var head    = _el('div', 'btex-head');
    var texList = texStore.list();
    var title   = _el('span', 'btex-title', 'Building Textures');
    if (texList.length > 0) {
      title.appendChild(_el('span', 'custom-obj-lib-count', String(texList.length)));
    }
    var toggleBtn = _el('button', 'studio-btn btex-toggle',
      _buildingTexState.open ? '▲ Close' : '▼ Import Texture');
    toggleBtn.addEventListener('click', function () {
      _buildingTexState.open = !_buildingTexState.open;
      _renderUnifiedLibrary(doc.getElementById('studio-library-body'));
    });
    head.appendChild(title);
    head.appendChild(toggleBtn);
    section.appendChild(head);

    // Texture rows
    if (texList.length > 0) {
      var rowsEl = _el('div', 'btex-list');
      texList.forEach(function (pkg) {
        var isSel = _buildingTexState.selected === pkg.packageId;
        var row   = _el('div', 'btex-row' + (isSel ? ' selected' : ''));
        var top   = _el('div', 'btex-row-top');
        top.appendChild(_el('span', 'btex-row-label', pkg.label || pkg.packageId));
        top.appendChild(_el('span', 'btex-status-badge btex-status--' + (pkg.status || 'draft'), pkg.status || 'draft'));
        row.appendChild(top);
        var bot = _el('div', 'btex-row-bot');
        if (pkg.width && pkg.height) bot.appendChild(_el('span', 'btex-row-dim', pkg.width + '×' + pkg.height));
        if (pkg.fileSizeBytes) bot.appendChild(_el('span', 'btex-row-size', (pkg.fileSizeBytes / 1024).toFixed(1) + ' KB'));
        if (pkg.materialClass) bot.appendChild(_el('span', 'btex-row-class', pkg.materialClass));
        row.appendChild(bot);
        row.addEventListener('click', function () {
          _buildingTexState.selected = isSel ? null : pkg.packageId;
          _renderUnifiedLibrary(doc.getElementById('studio-library-body'));
        });

        // Package / Re-package
        var pkgBtn = _el('button', 'studio-btn studio-btn--xs', pkg.status === 'packaged' ? 'Re-package' : 'Package');
        pkgBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          pkgBtn.disabled = true; pkgBtn.textContent = 'Packaging…';
          texStore.packageTexture(pkg.packageId, function (err) {
            pkgBtn.disabled = false;
            if (err) { pkgBtn.textContent = 'Error'; return; }
            pkgBtn.textContent = 'Re-package';
            _renderUnifiedLibrary(doc.getElementById('studio-library-body'));
          });
        });
        row.appendChild(pkgBtn);

        // Remove
        var rmBtn = _el('button', 'studio-btn studio-btn--xs', 'Remove');
        rmBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          texStore.remove(pkg.packageId);
          if (_buildingTexState.selected === pkg.packageId) _buildingTexState.selected = null;
          _renderUnifiedLibrary(doc.getElementById('studio-library-body'));
        });
        row.appendChild(rmBtn);
        rowsEl.appendChild(row);
      });
      section.appendChild(rowsEl);

      // Detail panel for selected texture
      if (_buildingTexState.selected) {
        var selPkg = texStore.get(_buildingTexState.selected);
        if (selPkg) {
          var detail = _el('div', 'btex-detail');
          var dfields = [
            ['packageId',     selPkg.packageId],
            ['label',         selPkg.label || '—'],
            ['status',        selPkg.status || '—'],
            ['mimeType',      selPkg.mimeType || '—'],
            ['dimensions',    selPkg.width ? selPkg.width + '×' + selPkg.height : '—'],
            ['fileSizeBytes', selPkg.fileSizeBytes ? (selPkg.fileSizeBytes / 1024).toFixed(1) + ' KB' : '—'],
            ['materialClass', selPkg.materialClass || '—'],
            ['textureRole',   selPkg.textureRole   || '—'],
            ['runtimeUrl',    selPkg.runtimeUrl    || '—'],
            ['contentHash',   selPkg.contentHash   || '—'],
            ['packagedAt',    selPkg.packagedAt ? selPkg.packagedAt.replace('T', ' ').replace(/\.\d+Z$/, ' UTC') : '—'],
          ];
          dfields.forEach(function (p) { detail.appendChild(_inspReadOnly(p[0], p[1])); });
          section.appendChild(detail);
        }
      }
    }

    // Import form
    if (_buildingTexState.open) {
      var statusEl = _el('div', 'btex-status');
      var form     = _el('div', 'btex-form');

      var labelWrap = _el('div', 'insp-field-wrap');
      labelWrap.appendChild(_el('label', 'insp-label', 'label'));
      var labelInp = doc.createElement('input');
      labelInp.type = 'text'; labelInp.className = 'insp-input'; labelInp.maxLength = 80;
      labelInp.placeholder = 'Texture label';
      labelWrap.appendChild(labelInp);
      form.appendChild(labelWrap);

      var classWrap = _el('div', 'insp-field-wrap');
      classWrap.appendChild(_el('label', 'insp-label', 'materialClass'));
      var classSel = doc.createElement('select');
      classSel.className = 'insp-select';
      ['facade', 'roof', 'base', 'accent'].forEach(function (c) {
        var o = doc.createElement('option'); o.value = c; o.textContent = c;
        classSel.appendChild(o);
      });
      classWrap.appendChild(classSel);
      form.appendChild(classWrap);

      var fileLbl = _el('label', 'studio-btn primary btex-file-label', 'Choose Image');
      var fileInp = doc.createElement('input');
      fileInp.type = 'file'; fileInp.accept = 'image/png,image/jpeg,image/webp'; fileInp.style.display = 'none';
      fileInp.addEventListener('change', function () {
        var f = fileInp.files[0];
        if (!f) return;
        statusEl.textContent = 'Importing…';
        texStore.importTexture(f, { label: labelInp.value || f.name, materialClass: classSel.value }, function (err, result) {
          if (err) { statusEl.textContent = 'Import failed: ' + err.message; return; }
          statusEl.textContent = 'Imported — ' + result.packageId;
          _buildingTexState.open = false;
          _renderUnifiedLibrary(doc.getElementById('studio-library-body'));
        });
      });
      fileLbl.appendChild(fileInp);
      form.appendChild(fileLbl);
      section.appendChild(form);
      section.appendChild(statusEl);
    }

    var sep = _el('div', '');
    sep.style.cssText = 'border-top:1px solid rgba(255,255,255,.06); margin:8px 0 0;';
    section.appendChild(sep);
    parentBody.appendChild(section);
  }

  // ── 0616K: Composition section ────────────────────────────────────────────────
  var _compState = {
    open:           false,
    query:          '',
    filter:         'all',   // all | in-use | unused | by-category
    selected:       null,    // selected compositionId
    importOpen:     false,
    lastImportResult: null,
    lastStatus:     '',
  };

  function _filterCompositions(compositions, filter, query) {
    var q = (query || '').toLowerCase();
    return compositions.filter(function (rec) {
      if (q && rec.label.toLowerCase().indexOf(q) === -1 && rec.id.indexOf(q) === -1) return false;
      if (filter === 'in-use') {
        var store = global.WOSCompositionStore;
        var s = store ? store.usageSummary(rec.id) : null;
        return s && s.placedCount > 0;
      }
      if (filter === 'unused') {
        var store2 = global.WOSCompositionStore;
        var s2 = store2 ? store2.usageSummary(rec.id) : null;
        return !s2 || s2.placedCount === 0;
      }
      return true;
    });
  }

  function _renderCompositionSection(parentBody) {
    var compStore = global.WOSCompositionStore;
    var compCtrl  = global.WOSCompositionController;

    var section = _el('div', 'comp-section');

    // Section header
    var head = _el('div', 'comp-head');
    var titleSpan = _el('span', 'comp-title', 'Compositions');
    var allComps = compStore ? compStore.list() : [];
    if (allComps.length > 0) {
      titleSpan.appendChild(_el('span', 'custom-obj-lib-count', String(allComps.length)));
    }
    var toggleHead = _el('button', 'studio-btn comp-toggle', _compState.open ? '▲' : '▼');
    toggleHead.title = 'Toggle Compositions';
    toggleHead.addEventListener('click', function () {
      _compState.open = !_compState.open;
      _refreshActorRows();
    });
    head.appendChild(titleSpan);
    head.appendChild(toggleHead);
    section.appendChild(head);

    if (!_compState.open) {
      parentBody.appendChild(section);
      return;
    }

    // Search
    var searchWrap = _el('div', 'comp-search-wrap');
    var searchInp = doc.createElement('input');
    searchInp.type = 'text'; searchInp.placeholder = 'Search compositions…';
    searchInp.className = 'insp-input comp-search-inp';
    searchInp.value = _compState.query;
    searchInp.addEventListener('input', function () { _compState.query = searchInp.value; _refreshActorRows(); });
    searchWrap.appendChild(searchInp);
    section.appendChild(searchWrap);

    // Filter pills
    var filters = [
      { key: 'all', label: 'All' },
      { key: 'in-use', label: 'In Use' },
      { key: 'unused', label: 'Unused' },
    ];
    var filterBar = _el('div', 'custom-obj-filter-bar');
    filters.forEach(function (f) {
      var pill = _el('button', 'custom-obj-filter-pill' + (_compState.filter === f.key ? ' active' : ''), f.label);
      pill.addEventListener('click', function () { _compState.filter = f.key; _refreshActorRows(); });
      filterBar.appendChild(pill);
    });
    section.appendChild(filterBar);

    // Selection buffer display
    if (compCtrl) {
      var selIds = compCtrl.selectedObjectIds();
      var bufWrap = _el('div', 'comp-sel-buf');
      var bufLabel = _el('span', 'comp-sel-buf-label', 'Selection buffer: ' + selIds.length + ' actor(s)');
      bufWrap.appendChild(bufLabel);
      if (selIds.length > 0) {
        var clearBufBtn = _el('button', 'studio-btn studio-btn--xs', 'Clear');
        clearBufBtn.addEventListener('click', function () {
          compCtrl.clearSelection();
          _refreshActorRows();
        });
        bufWrap.appendChild(clearBufBtn);
      }
      section.appendChild(bufWrap);

      // Add selected actor to buffer
      var placementCtrl = global.WOSActorPlacementController;
      var selectedObjectId = placementCtrl && placementCtrl.selectedObjectId ? placementCtrl.selectedObjectId() : null;
      if (selectedObjectId) {
        var alreadyAdded = selIds.indexOf(selectedObjectId) !== -1;
        var addBtn = _el('button', 'studio-btn studio-btn--xs', alreadyAdded ? '✓ In Buffer' : '+ Add Selected Actor');
        addBtn.disabled = alreadyAdded;
        addBtn.addEventListener('click', function () {
          compCtrl.addActor(selectedObjectId);
          _refreshActorRows();
        });
        bufWrap.appendChild(addBtn);
      }

      // Create From Selection
      if (selIds.length >= 1) {
        var createWrap = _el('div', 'comp-create-wrap');
        var labelInp = doc.createElement('input');
        labelInp.type = 'text'; labelInp.placeholder = 'Composition label…';
        labelInp.className = 'insp-input'; labelInp.style.marginBottom = '4px';
        createWrap.appendChild(labelInp);

        var catSel = doc.createElement('select');
        catSel.className = 'insp-input';
        catSel.style.marginBottom = '4px';
        ['misc', 'event', 'rooftop', 'dock', 'street', 'carnival', 'transit', 'prop', 'structure'].forEach(function (c) {
          var opt = _el('option', null, c); opt.value = c; catSel.appendChild(opt);
        });
        createWrap.appendChild(catSel);

        var createBtn = _el('button', 'studio-btn', 'Create From Selection (' + selIds.length + ')');
        createBtn.addEventListener('click', function () {
          var result = compCtrl.createCompositionFromSelection({
            label:    labelInp.value || 'Composition',
            category: catSel.value,
          });
          _compState.lastStatus = result.ok
            ? 'Created: ' + result.compositionId
            : 'Error: ' + result.reason + (result.blocked ? ' (' + result.blocked.length + ' blocked)' : '');
          if (result.ok) {
            _compState.selected = result.compositionId;
            compCtrl.clearSelection();
          }
          _refreshActorRows();
        });
        createWrap.appendChild(createBtn);
        section.appendChild(createWrap);
      }
    }

    // Status line
    var statusEl = _el('div', 'comp-status', _compState.lastStatus);
    section.appendChild(statusEl);

    // Composition rows
    var filtered = _filterCompositions(allComps, _compState.filter, _compState.query);
    if (filtered.length > 0) {
      var rowsWrap = _el('div', 'comp-rows');
      filtered.forEach(function (rec) {
        var isSelected = _compState.selected === rec.id;
        var usage = compStore ? compStore.usageSummary(rec.id) : null;
        var b = rec.composition.boundsM || {};
        var row = _el('div', 'comp-row' + (isSelected ? ' selected' : ''));
        var rowTop = _el('div', 'comp-row-top');
        var compBrSt = (function () {
          var analyzer = global.WOSBroadcastReadinessAnalyzer;
          if (!analyzer) return 'unknown';
          try { return (analyzer.analyzeComposition(rec).readiness || 'UNKNOWN').toLowerCase(); } catch (e) { return 'unknown'; }
        }());
        rowTop.appendChild(_el('span', 'comp-row-label', rec.label));
        rowTop.appendChild(_el('span', 'comp-row-cat', rec.category));
        rowTop.appendChild(_el('span', 'comp-row-count', rec.composition.childCount + ' child' + (rec.composition.childCount !== 1 ? 'ren' : '')));
        rowTop.appendChild(_el('span', 'broadcast-badge broadcast-badge--' + compBrSt, compBrSt));
        row.appendChild(rowTop);
        var rowBot = _el('div', 'comp-row-bot');
        rowBot.appendChild(_el('span', 'comp-row-id', rec.id));
        var boundsText = b.widthM + 'm × ' + b.depthM + 'm';
        rowBot.appendChild(_el('span', 'comp-row-bounds', boundsText));
        if (usage) rowBot.appendChild(_el('span', 'comp-row-usage', 'placed ' + usage.placedCount + 'x'));
        row.appendChild(rowBot);

        row.addEventListener('click', function () {
          _compState.selected = isSelected ? null : rec.id;
          if (compCtrl) compCtrl.selectComposition(_compState.selected);
          _refreshActorRows();
        });
        rowsWrap.appendChild(row);
      });
      section.appendChild(rowsWrap);
    } else if (allComps.length === 0) {
      section.appendChild(_el('div', 'comp-empty', 'No compositions yet. Select Draft actors, then create.'));
    }

    // Detail panel for selected composition
    if (_compState.selected && compStore) {
      var selRec = compStore.get(_compState.selected);
      if (selRec) {
        var detail = _el('div', 'comp-detail');
        detail.appendChild(_el('div', 'custom-obj-detail-title', 'Composition Detail'));
        var rows = [
          ['ID',          selRec.id],
          ['Label',       selRec.label],
          ['Category',    selRec.category],
          ['Source',      selRec.source],
          ['Editable',    String(selRec.editable)],
          ['Children',    String(selRec.composition.childCount)],
          ['Bounds W',    (selRec.composition.boundsM.widthM || 0) + 'm'],
          ['Bounds D',    (selRec.composition.boundsM.depthM || 0) + 'm'],
          ['Bounds H',    (selRec.composition.boundsM.heightM || 0) + 'm'],
          ['Anchor Mode', selRec.composition.anchorMode],
          ['Created',     selRec.authoring.createdAt ? selRec.authoring.createdAt.slice(0, 10) : ''],
          ['Updated',     selRec.authoring.updatedAt ? selRec.authoring.updatedAt.slice(0, 10) : ''],
        ];
        rows.forEach(function (pair) {
          var r = _el('div', 'comp-detail-row');
          r.appendChild(_el('span', 'comp-detail-key', pair[0]));
          r.appendChild(_el('span', 'comp-detail-val', pair[1]));
          detail.appendChild(r);
        });

        // Child list
        detail.appendChild(_el('div', 'custom-obj-detail-subtitle', 'Children'));
        selRec.composition.children.forEach(function (child) {
          var cr = _el('div', 'comp-child-row');
          cr.appendChild(_el('span', 'comp-child-id', child.childId));
          cr.appendChild(_el('span', 'comp-child-asset', child.assetId));
          cr.appendChild(_el('span', 'comp-child-cat', child.actorCategory + '/' + child.actorType));
          detail.appendChild(cr);
        });

        // Place button
        var placeBtn = _el('button', 'studio-btn', 'Place Composition');
        placeBtn.title = 'Arms placement mode — click map to place all ' + selRec.composition.childCount + ' children';
        placeBtn.addEventListener('click', function () {
          _armCompositionPlacement(selRec.id);
        });
        detail.appendChild(placeBtn);

        // Fork + Export + Remove
        var actionsRow = _el('div', 'comp-detail-actions');
        var forkBtn = _el('button', 'studio-btn studio-btn--xs', 'Fork');
        forkBtn.addEventListener('click', function () {
          var r = compStore.fork(selRec.id, {});
          _compState.lastStatus = r.ok ? 'Forked: ' + r.compositionId : 'Fork failed: ' + r.reason;
          if (r.ok) _compState.selected = r.compositionId;
          _refreshActorRows();
        });
        actionsRow.appendChild(forkBtn);

        var exportBtn = _el('button', 'studio-btn studio-btn--xs', 'Export');
        exportBtn.addEventListener('click', function () {
          var r = compStore.exportOne(selRec.id);
          if (r.ok) {
            var blob = new Blob([JSON.stringify(r.payload, null, 2)], { type: 'application/json' });
            var url  = URL.createObjectURL(blob);
            var a    = doc.createElement('a');
            a.href = url; a.download = selRec.id + '.json'; a.click();
            URL.revokeObjectURL(url);
          }
        });
        actionsRow.appendChild(exportBtn);

        var removeBtn = _el('button', 'studio-btn studio-btn--xs', 'Remove');
        removeBtn.addEventListener('click', function () {
          var r = compStore.remove(selRec.id);
          if (!r.ok && r.reason === 'has_placement_history') {
            _compState.lastStatus = r.message;
            _refreshActorRows();
            return;
          }
          if (!r.ok) {
            _compState.lastStatus = 'Remove failed: ' + r.reason;
            _refreshActorRows();
            return;
          }
          _compState.selected = null;
          if (compCtrl) compCtrl.selectComposition(null);
          _compState.lastStatus = 'Removed.';
          _refreshActorRows();
        });
        actionsRow.appendChild(removeBtn);

        var forceRemoveBtn = _el('button', 'studio-btn studio-btn--xs', 'Force Remove');
        forceRemoveBtn.title = 'Remove recipe only — placed child actors are kept';
        forceRemoveBtn.addEventListener('click', function () {
          var r = compStore.remove(selRec.id, { force: true });
          _compState.selected = null;
          if (compCtrl) compCtrl.selectComposition(null);
          _compState.lastStatus = r.ok ? 'Removed (forced).' : 'Remove failed: ' + r.reason;
          _refreshActorRows();
        });
        actionsRow.appendChild(forceRemoveBtn);

        detail.appendChild(actionsRow);
        section.appendChild(detail);
      }
    }

    var botSep = _el('div', '');
    botSep.style.cssText = 'border-top:1px solid rgba(255,255,255,.06); margin:8px 0 0;';
    section.appendChild(botSep);

    parentBody.appendChild(section);
  }

  // Arms composition placement mode — when user clicks the map a composition expands
  var _pendingPlacementCompositionId = null;
  function _armCompositionPlacement(compositionId) {
    _pendingPlacementCompositionId = compositionId;
    var view = global.WOSThreeDCanvasView;
    if (view && view.armCompositionPlacement) {
      view.armCompositionPlacement(compositionId);
      _compState.lastStatus = 'Click map to place composition…';
    } else {
      // Fallback: direct placement at map center / last clicked anchor if available
      var ctrl = global.WOSActorPlacementController;
      var lastAnchor = ctrl && ctrl.getLastPlacementAnchor ? ctrl.getLastPlacementAnchor() : null;
      if (lastAnchor) {
        _doPlaceComposition(compositionId, lastAnchor);
      } else {
        _compState.lastStatus = 'Open Map and click to set placement anchor first.';
      }
    }
    _refreshActorRows();
  }

  function _doPlaceComposition(compositionId, anchor) {
    var compStore = global.WOSCompositionStore;
    var compCtrl  = global.WOSCompositionController;
    if (!compStore) { _compState.lastStatus = 'CompositionStore unavailable'; return; }
    var result = compStore.placeComposition(compositionId, anchor);
    _compState.lastStatus = result.ok
      ? 'Placed ' + (result.childObjectIds || []).length + ' actors from composition.'
      : 'Placement failed: ' + result.reason;
    if (compCtrl) {
      compCtrl.selectComposition(compositionId);
    }
    _pendingPlacementCompositionId = null;
    _refreshActorRows();
  }

  // Expose placement callback for threeDCanvasView to call after composition arm+click
  global._wosCompositionPlacementCallback = function (anchor) {
    if (_pendingPlacementCompositionId) {
      _doPlaceComposition(_pendingPlacementCompositionId, anchor);
    }
  };

  // ── 0616I: Custom Object Library management section ───────────────────────────
  // State lives on a plain object keyed by panel instance — no module-level vars
  // that could bleed between renders.
  var _customLibState = {
    filter:   'all',    // 'all'|'in-use'|'unused'|'needs-review'|cat names
    query:    '',
    selected: null,     // assetId of selected row
    importOpen: false,
    lastImportResult: null,
    lastExportAssetId: null,
    lastRemovedAssetId: null,
    lastError: null,
  };

  function _broadcastStatus(assetId) {
    var analyzer = global.WOSBroadcastReadinessAnalyzer;
    if (!analyzer) return 'unknown';
    try {
      var result = analyzer.analyzeAsset(assetId);
      return (result.readiness || 'UNKNOWN').toLowerCase();
    } catch (e) { return 'unknown'; }
  }

  function _govStatus(assetId) {
    var validator = global.WOSCustomAssetGovernanceValidator;
    if (!validator) return 'unknown';
    var checks   = validator.validateAssetById(assetId);
    var failures = checks.filter(function (c) { return c.result === 'fail'; });
    var warnings = checks.filter(function (c) { return c.result === 'warned'; });
    if (failures.length > 0) return 'blocked';
    if (warnings.length > 0) return 'warnings';
    return 'ready';
  }

  function _matchesCustomSearch(asset, q) {
    if (!q) return true;
    var lq = q.toLowerCase();
    var fields = [
      asset.id, asset.label,
      asset.category,
      asset.shapeRecipe && asset.shapeRecipe.template,
      (asset.actorTypes || []).join(' '),
      (asset.tags || []).join(' '),
    ];
    return fields.some(function (f) { return f && f.toLowerCase().indexOf(lq) !== -1; });
  }

  function _filterCustomAssets(assets, filter, query) {
    var customStore = global.WOSCustomStudioAssetStore;
    return assets.filter(function (a) {
      if (!_matchesCustomSearch(a, query)) return false;
      if (filter === 'all') return true;
      var usage = customStore ? customStore.actorsUsing(a.id).length : 0;
      if (filter === 'in-use')  return usage > 0;
      if (filter === 'unused')  return usage === 0;
      if (filter === 'needs-review') return _govStatus(a.id) !== 'ready';
      // category filter
      return a.category === filter;
    });
  }

  function _downloadJSON(filename, obj) {
    try {
      var blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
      var url  = URL.createObjectURL(blob);
      var a    = doc.createElement('a');
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { _customLibState.lastError = 'download_failed: ' + String(e); }
  }

  function _renderCustomObjectLibrarySection(parentBody) {
    var customStore = global.WOSCustomStudioAssetStore;
    if (!customStore) return;

    var resolver = global.WOSAssetResolver;
    var allRaw   = resolver ? resolver.listByCategory ? null : null : null;
    // Use store.list() which filters _customAssetRemoved
    var allAssets = customStore.list();
    if (!allAssets || allAssets.length === 0 && _customLibState.filter === 'all' && !_customLibState.query) {
      // still show the header + import so users can import
    }

    // ── Section header ─────────────────────────────────────────────────────────
    var section = _el('div', 'custom-obj-lib-section');

    var head = _el('div', 'custom-obj-lib-head');
    var headLabel = _el('span', 'custom-obj-lib-title', 'Custom Objects');
    var headCount = _el('span', 'custom-obj-lib-count', String(allAssets.length));
    head.appendChild(headLabel);
    head.appendChild(headCount);
    section.appendChild(head);

    // ── Search ─────────────────────────────────────────────────────────────────
    var searchWrap = _el('div', 'custom-obj-lib-search-wrap');
    var searchInp  = doc.createElement('input');
    searchInp.type = 'text';
    searchInp.className = 'insp-input custom-obj-lib-search';
    searchInp.placeholder = 'search custom assets…';
    searchInp.value = _customLibState.query;
    searchInp.addEventListener('input', function () {
      _customLibState.query = searchInp.value;
      _refreshActorRows();
    });
    searchWrap.appendChild(searchInp);
    section.appendChild(searchWrap);

    // ── Filter pills ───────────────────────────────────────────────────────────
    var filterBar = _el('div', 'custom-obj-filter-bar');
    var FILTERS = [
      { key: 'all',          label: 'All' },
      { key: 'in-use',       label: 'In Use' },
      { key: 'unused',       label: 'Unused' },
      { key: 'needs-review', label: 'Needs Review' },
      { key: 'structure',    label: 'Structure' },
      { key: 'vehicle',      label: 'Vehicle' },
      { key: 'maritime',     label: 'Maritime' },
      { key: 'prop',         label: 'Prop' },
      { key: 'aircraft',     label: 'Aircraft' },
    ];
    FILTERS.forEach(function (f) {
      var pill = _el('button', 'custom-obj-filter-pill' + (_customLibState.filter === f.key ? ' active' : ''), f.label);
      pill.addEventListener('click', function () {
        _customLibState.filter = f.key;
        _refreshActorRows();
      });
      filterBar.appendChild(pill);
    });
    section.appendChild(filterBar);

    // ── Asset rows ─────────────────────────────────────────────────────────────
    var visible = _filterCustomAssets(allAssets, _customLibState.filter, _customLibState.query);
    var listEl  = _el('div', 'custom-obj-lib-list');

    if (visible.length === 0) {
      listEl.appendChild(_el('div', 'studio-empty', 'No custom assets match current filter.'));
    } else {
      visible.forEach(function (asset) {
        var usage    = customStore.actorsUsing(asset.id).length;
        var govSt  = _govStatus(asset.id);
        var brSt   = _broadcastStatus(asset.id);
        var isSelected = _customLibState.selected === asset.id;
        var row = _el('div', 'custom-obj-lib-row' + (isSelected ? ' selected' : ''));

        var rowTop = _el('div', 'custom-obj-lib-row-top');
        rowTop.appendChild(_el('span', 'custom-obj-lib-label', asset.label || '(unlabeled)'));
        rowTop.appendChild(_el('span', 'custom-obj-lib-cat', asset.category || '?'));
        var govEl = _el('span', 'custom-obj-lib-gov gov-' + govSt, govSt);
        rowTop.appendChild(govEl);
        rowTop.appendChild(_el('span', 'broadcast-badge broadcast-badge--' + brSt, brSt));
        row.appendChild(rowTop);

        var rowMid = _el('div', 'custom-obj-lib-row-mid');
        rowMid.appendChild(_el('span', 'custom-obj-lib-id', asset.id));
        row.appendChild(rowMid);

        var rowBot = _el('div', 'custom-obj-lib-row-bot');
        rowBot.appendChild(_el('span', 'custom-obj-lib-usage', usage + ' actor' + (usage !== 1 ? 's' : '')));
        rowBot.appendChild(_el('span', 'custom-obj-lib-recipe', asset.shapeRecipe ? 'shape ✓' : 'shape —'));
        rowBot.appendChild(_el('span', 'custom-obj-lib-recipe', asset.materialRecipe ? 'mat ✓' : 'mat —'));
        if (asset.authoring && asset.authoring.updatedAt) {
          rowBot.appendChild(_el('span', 'custom-obj-lib-updated', asset.authoring.updatedAt.slice(0,10)));
        }
        row.appendChild(rowBot);

        row.addEventListener('click', function () {
          _customLibState.selected = isSelected ? null : asset.id;
          _refreshActorRows();
        });

        listEl.appendChild(row);
      });
    }
    section.appendChild(listEl);

    var statusEl = _el('div', 'custom-obj-lib-status');
    section.appendChild(statusEl);

    // ── Selected asset detail panel ────────────────────────────────────────────
    if (_customLibState.selected) {
      var detail = customStore.get(_customLibState.selected);
      if (detail) {
        _renderCustomObjectDetail(section, detail, customStore);
      }
    }

    parentBody.appendChild(section);
  }

  function _renderCustomObjectDetail(section, detail, customStore) {
    var detailEl = _el('div', 'custom-obj-detail');
    detailEl.appendChild(_el('div', 'custom-obj-detail-title', 'Custom Object Detail'));

    var fields = [
      ['assetId',     detail.id],
      ['label',       detail.label || '—'],
      ['category',    detail.category || '—'],
      ['source',      detail.source || '—'],
      ['editable',    detail.editable ? 'yes' : 'no'],
      ['shapeRecipe template', detail.shapeRecipe ? detail.shapeRecipe.template : 'missing'],
      ['shapeRecipe params',   detail.shapeRecipe ? Object.keys(detail.shapeRecipe.params || {}).length + ' params' : '—'],
      ['materialRecipe slots', detail.materialRecipe ? Object.keys(detail.materialRecipe.slots || {}).length + ' slots' : 'missing'],
    ];
    if (detail.authoring) {
      fields.push(['createdAt', (detail.authoring.createdAt || '—').replace('T',' ').replace(/\.\d+Z$/,' UTC')]);
      fields.push(['updatedAt', (detail.authoring.updatedAt || '—').replace('T',' ').replace(/\.\d+Z$/,' UTC')]);
    }

    var summary = customStore.usageSummary(detail.id);
    fields.push(['usage', summary.actorCount + ' actor' + (summary.actorCount !== 1 ? 's' : '')]);
    fields.push(['governance', _govStatus(detail.id)]);

    fields.forEach(function (pair) { detailEl.appendChild(_inspReadOnly(pair[0], pair[1])); });

    // Used-by actors
    if (summary.actorCount > 0) {
      var usedHead = _el('div', 'custom-obj-detail-subtitle', 'Used By Actors');
      detailEl.appendChild(usedHead);
      var store = global.WOSActorManifestStore;
      var view  = global.WOSThreeDCanvasView;
      var ctrl  = global.WOSActorPlacementController;
      summary.objectIds.forEach(function (objectId) {
        var actor = store ? store.get(objectId) : null;
        var state = actor && actor.meta ? (actor.meta.lifecycleState || 'DRAFT') : 'DRAFT';
        var usedRow = _el('div', 'custom-obj-used-row');
        usedRow.appendChild(_el('span', 'custom-obj-used-id', objectId.slice(0, 12) + '…'));
        usedRow.appendChild(_el('span', 'custom-obj-used-state', state));
        var selBtn = _el('button', 'studio-btn studio-btn--xs', 'Select');
        selBtn.addEventListener('click', function () {
          if (ctrl && ctrl.setSelectedObjectId) ctrl.setSelectedObjectId(objectId);
          _renderSelectedActorInspector(_byId('studio-inspector-body'));
        });
        usedRow.appendChild(selBtn);
        if (view && view.focusActor) {
          var focusBtn = _el('button', 'studio-btn studio-btn--xs', 'Focus');
          focusBtn.addEventListener('click', function () { view.focusActor(objectId); });
          usedRow.appendChild(focusBtn);
        }
        detailEl.appendChild(usedRow);
      });
    }

    section.appendChild(detailEl);
  }

  function _renderActorRows(body, query) {
    var store    = global.WOSActorManifestStore;
    var libCtrl  = global.WOSLibraryController;
    var gateCtrl = global.WOSPromotionGateController;
    var canvasView = global.WOSThreeDCanvasView;
    var actors = store ? store.list() : [];

    // 0615: apply search query
    if (libCtrl && query) actors = libCtrl.filterActors(actors, query);

    // 0615: apply canvas visibility filter to Library rows as well
    var filterKey = canvasView && canvasView.getActorVisibilityFilter
      ? canvasView.getActorVisibilityFilter()
      : 'all';
    if (libCtrl && libCtrl.filterActorsByVisibility) {
      actors = libCtrl.filterActorsByVisibility(actors, filterKey);
    }

    // 0615: "Delete All Draft Actors" action header when drafts exist
    var allActors = store ? store.list() : [];
    var draftCount = allActors.filter(function (a) {
      var meta = a.meta || {};
      return !meta.promoted && meta.lifecycleState !== 'RETIRED' &&
             meta.lifecycleState !== 'GATE_PENDING' &&
             meta.lifecycleState !== 'DEPRECATED';
    }).length;
    if (draftCount > 0) {
      var cleanupRow = _el('div', 'lib-actor-cleanup-row');
      var cleanupBtn = _el('button', 'lib-cleanup-btn', 'Delete All Drafts (' + draftCount + ')');
      cleanupBtn.title = 'Remove all Draft actors. Promoted actors are not affected.';
      cleanupBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        var confirmed = global.confirm(
          'Delete all ' + draftCount + ' Draft actor(s)?\n\nPromoted, Pending, Deprecated, and Retired actors will not be affected.'
        );
        if (!confirmed) return;
        var ctrl = global.WOSActorPlacementController;
        if (!ctrl) return;
        var drafts = (store ? store.list() : []).filter(function (a) {
          var meta = a.meta || {};
          return !meta.promoted &&
                 meta.lifecycleState !== 'PROMOTED' &&
                 meta.lifecycleState !== 'GATE_PENDING' &&
                 meta.lifecycleState !== 'DEPRECATED' &&
                 meta.lifecycleState !== 'RETIRED';
        });
        drafts.forEach(function (a) { ctrl.remove(a.objectId); });
        _refreshActorRows();
      });
      cleanupRow.appendChild(cleanupBtn);
      body.appendChild(cleanupRow);
    }

    if (!actors.length) {
      body.appendChild(_el('div', 'studio-empty',
        query ? 'No actors match "' + query + '".' :
        filterKey !== 'all' ? 'No actors match the current filter.' :
        'No actors placed yet. Open Map to place one.'));
      return;
    }

    actors.forEach(function (a) {
      var ctrl = global.WOSActorPlacementController;
      var isSelected = ctrl && ctrl.selectedObjectId() === a.objectId;
      var state = gateCtrl ? gateCtrl.getState(a) : ((a.meta && a.meta.promoted) ? 'PROMOTED' : 'DRAFT');
      var isDraft = state === 'DRAFT' || !a.meta || !a.meta.promoted;

      var row = _el('div', 'studio-identity studio-identity-row lib-actor-row lib-actor-row--rich');
      row.dataset.key = a.objectId;
      if (isSelected) row.classList.add('selected');

      // Row main area: badge + labels
      var rowMain = _el('div', 'lib-actor-main');
      rowMain.appendChild(_lifecycleBadge(state));

      var displayLabel = a.meta && a.meta.displayLabel;
      var nameEl = _el('span', 'lib-actor-name', displayLabel || a.assetId || 'placeholder');
      rowMain.appendChild(nameEl);

      var typeEl = _el('div', 'lib-actor-type',
        (a.actorCategory || '—') + ' · ' + (a.actorType || 'custom') + ' · ' + (a.assetId || '—'));
      rowMain.appendChild(typeEl);

      // 0615B: location summary line
      var loc = global.WOSActorLocationResolver && global.WOSActorLocationResolver.get(a.objectId);
      var locEl = _el('div', 'lib-actor-location');
      if (loc) {
        locEl.textContent = loc.summary || (a.anchor.lat.toFixed(4) + ', ' + a.anchor.lon.toFixed(4) + ' · location unknown');
      } else {
        locEl.textContent = 'Resolving location…';
        locEl.classList.add('lib-actor-location--pending');
      }
      rowMain.appendChild(locEl);

      var coordEl = _el('div', 'lib-actor-coords',
        a.anchor.lat.toFixed(4) + ', ' + a.anchor.lon.toFixed(4) +
        ' · #' + a.objectId.slice(-6));
      rowMain.appendChild(coordEl);

      row.appendChild(rowMain);

      // Row actions
      var rowActions = _el('div', 'lib-actor-actions');

      // Focus button
      var focusBtn = _el('button', 'lib-actor-btn lib-actor-btn--focus', 'Focus');
      focusBtn.title = 'Focus Map on this actor';
      focusBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        _focusActorFromLibrary(a.objectId);
      });
      rowActions.appendChild(focusBtn);

      // Delete button — Draft only
      if (isDraft) {
        var delBtn = _el('button', 'lib-actor-btn lib-actor-btn--delete', 'Delete');
        delBtn.title = 'Delete this Draft actor';
        delBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          var ctrl2 = global.WOSActorPlacementController;
          if (ctrl2) ctrl2.remove(a.objectId);
          _refreshActorRows();
        });
        rowActions.appendChild(delBtn);
      }

      row.appendChild(rowActions);

      // Clicking row main area selects + focuses
      rowMain.addEventListener('click', function () {
        if (ctrl) ctrl.select(a.objectId);
        _focusActorFromLibrary(a.objectId);
        _refreshActorRows();
      });

      body.appendChild(row);
    });
  }

  // 0615: focus actor — if Map is active, call focusActor directly;
  //       otherwise switch to Map first, then focus after enter() settles.
  function _focusActorFromLibrary(objectId) {
    var view = global.WOSThreeDCanvasView;
    if (!view) return;
    if (_state.mode === 'map') {
      view.focusActor(objectId);
    } else {
      setMode('map');
      setTimeout(function () {
        var v = global.WOSThreeDCanvasView;
        if (v && v.focusActor) v.focusActor(objectId);
      }, 200);
    }
  }

  function _lifecycleBadge(state) {
    var libCtrl = global.WOSLibraryController;
    if (!state || state === 'DRAFT') return libCtrl ? libCtrl.makeBadge(false) : _el('span');
    if (state === 'PROMOTED')     return _badgeSpan('Promoted',  'lib-badge lib-badge--promoted');
    if (state === 'GATE_PENDING') return _badgeSpan('Pending',   'lib-badge lib-badge--pending');
    if (state === 'DEPRECATED')   return _badgeSpan('Deprecated','lib-badge lib-badge--deprecated');
    if (state === 'RETIRED')      return _badgeSpan('Retired',   'lib-badge lib-badge--retired');
    return libCtrl ? libCtrl.makeBadge(false) : _el('span');
  }

  function _badgeSpan(text, cls) {
    var s = _el('span', cls, text);
    return s;
  }

  function _refreshActorRows() {
    var body = _byId('studio-library-body');
    if (body) { body.innerHTML = ''; _renderUnifiedLibrary(body); }
  }

  // 0615F: Active Placement Asset indicator — shows which asset is armed for
  // placement in 3D Canvas. Reflects Library/toolbar state only; never persisted
  // beyond the allowed wos.studio.activeAssetId localStorage preference.
  function _renderActiveAssetIndicator(body) {
    var resolver = global.WOSAssetResolver;
    var view = global.WOSThreeDCanvasView;
    var assetId = _state.selectedAssetId ||
      (view && view.getActiveAsset && view.getActiveAsset()) || '';
    if (!assetId) return;

    var defaults = resolver && resolver.resolvePlacementDefaults
      ? resolver.resolvePlacementDefaults(assetId)
      : { actorCategory: 'prop', actorType: 'custom' };

    var box = _el('div', 'lib-active-asset-box');
    box.appendChild(_el('div', 'lib-active-asset-label', 'Active Placement Asset'));
    box.appendChild(_el('div', 'lib-active-asset-value',
      assetId + ' · ' + defaults.actorCategory + '/' + defaults.actorType));
    body.appendChild(box);
  }

  function _renderAssetRows(body, query) {
    var resolver = global.WOSAssetResolver;
    var libCtrl  = global.WOSLibraryController;
    var rawAssets = resolver ? resolver.list() : [];
    var assets = (libCtrl && query) ? libCtrl.filterAssets(rawAssets, query) : rawAssets;
    if (!assets.length) { body.appendChild(_el('div', 'studio-empty', query ? 'No assets match "' + query + '".' : 'ActorAssetLibraryAuthority unavailable.')); return; }
    var groups = {};
    assets.forEach(function (a) { var cat = a.category || 'unknown'; (groups[cat] = groups[cat] || []).push(a); });
    // 0616A: 'structure' and 'prop' added for the Studio Asset Pack categories
    ['structure', 'road', 'marine', 'aircraft', 'transit', 'civic', 'world', 'prop', 'system', 'synthetic', 'debug', 'unknown'].forEach(function (cat) {
      if (!groups[cat]) return;
      var g = _el('div', 'studio-cat'); g.appendChild(_el('div', 'studio-cat-name', cat));
      groups[cat].forEach(function (a) {
        var assetId = a.assetId || a.id;
        var isSelected = assetId === _state.selectedAssetId;
        // 0615F: row readiness state — selected/placeable/unresolved/experimental
        var readiness = resolver && resolver.placementReadiness ? resolver.placementReadiness(assetId) : 'placeable';
        var row = _el('div', 'studio-asset studio-asset-row lib-asset-row lib-asset-row--' + readiness);
        row.dataset.assetid = assetId;
        if (isSelected) row.classList.add('selected');
        row.appendChild(_el('span', 'k', a.name || a.label || assetId));
        row.appendChild(_el('span', 's', a.silhouetteClass || ''));
        // 0616D: tag custom-saved assets so they read distinctly from the starter pack
        if (a.source === 'studio-glb-import') {
          row.appendChild(_el('span', 'lib-asset-glb-tag', 'Imported GLB'));
        }
        if (a.source === 'studio-custom') {
          row.appendChild(_el('span', 'lib-asset-custom-tag', 'Custom'));
        }
        if (readiness !== 'placeable') {
          row.appendChild(_el('span', 'lib-asset-readiness-tag', readiness));
        }

        // "Place on Map" button — shown only on selected row
        if (isSelected) {
          var placeBtn = _el('button', 'studio-btn lib-place-btn', 'Place on Map');
          placeBtn.title = 'Switch to Map and arm placement for this asset';
          placeBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            _armPlacementFromLibrary(assetId);
          });
          row.appendChild(placeBtn);
        }

        // Make asset rows draggable to the Map
        if (libCtrl) libCtrl.makeDraggable(row, assetId);
        // Single click — select asset (no mode change)
        row.addEventListener('click', function () { _selectLibraryAsset(assetId); });
        // Double-click — arm placement directly
        row.addEventListener('dblclick', function () { _armPlacementFromLibrary(assetId); });
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

  // ── Library asset selection (Phase 4 UX patch) ───────────────────────────────
  // Select an asset without leaving Map or switching mode.
  function _selectLibraryAsset(assetId) {
    _state.selectedAssetId = assetId;
    // Sync toolbar in Map view
    var view = global.WOSThreeDCanvasView;
    if (view && view.setActiveAsset) view.setActiveAsset(assetId);
    // Refresh library rows to update highlight + show Place button
    var body = _byId('studio-library-body');
    if (body) { body.innerHTML = ''; _renderUnifiedLibrary(body); }
  }

  // Arm placement from Library: switch to Map if needed, then arm.
  function _armPlacementFromLibrary(assetId) {
    _state.selectedAssetId = assetId;
    var view = global.WOSThreeDCanvasView;
    if (_state.mode !== 'map') {
      setMode('map');
      // setMode re-enters the view; armPlacement must run after enter() completes
      setTimeout(function () {
        var v = global.WOSThreeDCanvasView;
        if (v && v.armPlacement) v.armPlacement(assetId);
      }, 50);
    } else {
      if (view && view.armPlacement) view.armPlacement(assetId);
    }
  }

  // ── Stage panel (0613 three-mode nav) ────────────────────────────────────────
  function _renderStage() {
    var title = _byId('studio-stage-title'); title.textContent = STAGE_TITLES[_state.mode] || 'Map';
    var body = _byId('studio-stage-body'); body.innerHTML = '';
    if (_state.mode === 'map')        return _render3DCanvas(body);
    if (_state.mode === 'canvas')     return _renderCanvas(body);
    if (_state.mode === 'library')    return _renderLibraryStage(body);
    if (_state.mode === 'inspector')  return _renderInspectorStage(body);
    if (_state.mode === 'palette-lab') return _renderPaletteLab(body);
    // Legacy fallback routes (not in primary nav — debug only)
    if (_state.mode === 'asset-library') return _renderAssetLibrary(body);
    if (_state.mode === 'proof-stage')   return _renderProofStage(body);
    if (_state.mode === 'map-lab')       return _renderMapLab(body);
    if (_state.mode === 'canvas-lab')    return _renderCanvasLab(body);
    return _render3DCanvas(body);
  }

  function _render3DCanvas(body) {
    var view = global.WOSThreeDCanvasView;
    if (!view) {
      var unavail = _el('div', 'studio-surface-unavail');
      unavail.appendChild(_el('div', 'studio-surface-unavail-title', 'Map unavailable'));
      unavail.appendChild(_el('div', 'studio-surface-unavail-msg', 'Check Mapbox token, local server, or map style.'));
      var retryBtn = _el('button', 'studio-btn studio-surface-unavail-retry', 'Retry Map');
      retryBtn.addEventListener('click', function () { _renderStage(); });
      unavail.appendChild(retryBtn);
      body.appendChild(unavail);
      return;
    }
    view.enter(body);
  }

  function _renderCanvas(body) {
    var wrap = _el('div', 'studio-canvas-surface');
    var header = _el('div', 'studio-canvas-surface-header', 'Canvas');
    wrap.appendChild(header);
    var sub = _el('div', 'studio-canvas-surface-sub', 'Blank 3D staging space — preview imported GLBs, check object scale, assemble kits before map placement.');
    wrap.appendChild(sub);
    var actions = _el('div', 'studio-canvas-surface-actions');
    // Preview selected asset on canvas if a canvas-capable renderer is available
    var selectedAssetId = _state.selectedAssetId;
    var placeBtn = _el('button', 'studio-btn', selectedAssetId ? 'Preview Selected on Canvas' : 'Select an Asset in Library first');
    placeBtn.disabled = !selectedAssetId;
    placeBtn.title = 'Place selected asset into blank staging view';
    placeBtn.addEventListener('click', function () {
      // Delegate to threeDCanvasView canvas mode if available, else stub
      var view = global.WOSThreeDCanvasView;
      if (view && view.enterCanvasMode) {
        view.enterCanvasMode(body, selectedAssetId);
      } else {
        var note = body.querySelector('.studio-canvas-surface-note');
        if (note) note.textContent = 'Canvas placement coming next — full staging editor in 0617B.';
      }
    });
    actions.appendChild(placeBtn);
    var resetBtn = _el('button', 'studio-btn', 'Reset View');
    resetBtn.addEventListener('click', function () {
      var view = global.WOSThreeDCanvasView;
      if (view && view.resetCanvasView) view.resetCanvasView();
    });
    actions.appendChild(resetBtn);
    wrap.appendChild(actions);
    var note = _el('div', 'studio-canvas-surface-note', 'Canvas placement coming next — full staging editor in 0617B.');
    wrap.appendChild(note);
    body.appendChild(wrap);
  }

  function _renderLibraryStage(body) {
    // When Library tab is active, the main stage shows asset detail / actor list.
    _renderAssetLibrary(body);
  }

  function _renderInspectorStage(body) {
    // When Inspector tab is active, mirror the inspector panel content in the stage.
    _renderSelectedActorInspector(body);
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

  // ── Phase 6 / 0615E Building Replacement panel ───────────────────────────────
  // 0615E: building info card with optional feature properties, explicit
  // Create/Assign action buttons (no generic "Assign"), Restore Original Building
  // with governance-gated fork path, Focus/Select linked-actor buttons.
  function _renderBuildingReplacementSection(body, selection) {
    _inspectorHeader(body, 'Building');

    // Read-only selected building info
    body.appendChild(_el('div', 'insp-section-label', 'Selected Building'));
    body.appendChild(_inspReadOnly('featureId',   selection.featureId));
    body.appendChild(_inspReadOnly('sourceId',    selection.sourceId));
    body.appendChild(_inspReadOnly('sourceLayer', selection.sourceLayer));
    body.appendChild(_inspReadOnly('layerId',     selection.layerId));
    body.appendChild(_el('div', 'insp-section-label', 'Centroid (approx. footprint center)'));
    body.appendChild(_inspReadOnly('lat', selection.centroid.lat.toFixed(6)));
    body.appendChild(_inspReadOnly('lon', selection.centroid.lon.toFixed(6)));
    var props0 = selection.properties || {};
    var ht = props0.height != null ? props0.height : (props0.render_height != null ? props0.render_height : null);
    body.appendChild(_inspReadOnly('height', ht != null ? ht + ' m' : '—'));

    // 0615E: optional building properties — only fields actually present on the feature
    var props = selection.properties || {};
    var propKeys = Object.keys(props);
    if (propKeys.length) {
      body.appendChild(_el('div', 'insp-section-label', 'Building Properties'));
      propKeys.forEach(function (k) {
        body.appendChild(_inspReadOnly(k, String(props[k])));
      });
    }

    var store = global.WOSActorManifestStore;

    // One-building-one-actor check: find any actor already bound to this featureId
    var existingBound = null;
    if (store) {
      store.list().forEach(function (a) {
        if (a.actorCategory === 'structure' && a.structure &&
            String(a.structure.mapboxFeatureId) === String(selection.featureId)) {
          existingBound = a;
        }
      });
    }

    if (existingBound) {
      var boundLabel = (existingBound.meta && existingBound.meta.displayLabel) ||
                       existingBound.assetId || existingBound.objectId;
      body.appendChild(_el('div', 'insp-section-label', 'Current Replacement'));
      body.appendChild(_inspReadOnly('actor', boundLabel));

      var statusEl0 = _el('div', 'insp-building-status');

      var actionsRow = _el('div', 'insp-building-actions');

      var focusBtn = _el('button', 'studio-btn', 'Focus Actor');
      focusBtn.addEventListener('click', function () {
        var view = global.WOSThreeDCanvasView;
        if (view && view.focusActor) view.focusActor(existingBound.objectId);
      });
      actionsRow.appendChild(focusBtn);

      var selectBtn = _el('button', 'studio-btn', 'Select Actor');
      selectBtn.addEventListener('click', function () {
        // Transfers Inspector focus from building card to actor — clears building
        // selection first so the actor panel takes over (§7 constraint).
        var bsc2 = global.WOSBuildingSelectionControllerInstance;
        if (bsc2) bsc2.clearSelection();
        var ctrl2 = global.WOSActorPlacementController;
        if (ctrl2) ctrl2.select(existingBound.objectId);
      });
      actionsRow.appendChild(selectBtn);

      body.appendChild(actionsRow);

      // Governance gate — promoted actors cannot have their binding mutated directly.
      var gate = global.WOSPromotionGateController;
      var isPromoted = gate && gate.isPromoted ? gate.isPromoted(existingBound) : false;

      if (isPromoted) {
        var warn = _el('div', 'insp-building-promoted-warn', 'Promoted actor. Fork actor to change replacement binding.');
        body.appendChild(warn);
        var forkBtn = _el('button', 'studio-btn', 'Fork Actor');
        forkBtn.addEventListener('click', function () {
          if (!gate || !gate.fork) { statusEl0.textContent = 'Fork unavailable.'; return; }
          var r = gate.fork(existingBound.objectId, 'building-restore-binding');
          if (!r.ok) { statusEl0.textContent = 'Fork failed: ' + r.reason; return; }
          var ctrl3 = global.WOSActorPlacementController;
          if (ctrl3) ctrl3.select(r.manifest.objectId);
          var bsc3 = global.WOSBuildingSelectionControllerInstance;
          if (bsc3) bsc3.clearSelection();
        });
        body.appendChild(forkBtn);
      } else {
        var restoreBtn = _el('button', 'studio-btn insp-remove-btn', 'Restore Original Building');
        restoreBtn.addEventListener('click', function () {
          // Unbind: set structure.mapboxFeatureId → null, keep actor in store
          store.update(existingBound.objectId, {
            structure: { mapboxFeatureId: null, mapboxSourceId: null, mapboxSourceLayer: null, mapboxLayerId: null },
          });
          // Restore Mapbox extrusion
          var brl = global.WOSBuildingReplacementLayerInstance;
          if (brl) brl.restore(selection.featureId, selection.sourceId, selection.sourceLayer);
          // Refresh actor 3D object
          var view2 = global.WOSThreeDCanvasView;
          if (view2 && view2.refreshActor) view2.refreshActor(existingBound.objectId);
          // Dismiss building selection
          var bsc4 = global.WOSBuildingSelectionControllerInstance;
          if (bsc4) bsc4.clearSelection();
          // Inspector returns to actor state
          _renderSelectedActorInspector(_byId('studio-inspector-body'));
        });
        body.appendChild(restoreBtn);
      }

      body.appendChild(statusEl0);
      // 0620A: proof actions always visible in building inspector
      _renderBuildingTextureAssignmentSection(body, selection);
      return;
    }

    // ── No existing binding — explicit Create / Assign actions (§10) ──────────
    body.appendChild(_el('div', 'insp-section-label', 'Assign Structure Actor'));

    var structureActors = store ? store.list().filter(function (a) { return a.actorCategory === 'structure'; }) : [];

    var statusEl = _el('div', 'insp-building-status');

    var brl0 = global.WOSBuildingReplacementLayerInstance;
    var bsc0 = global.WOSBuildingSelectionControllerInstance;
    var view0 = global.WOSThreeDCanvasView;
    var ctrl0 = global.WOSActorPlacementController;

    function _finish(objectId) {
      if (brl0) brl0.suppress(selection.featureId, selection.sourceId, selection.sourceLayer, selection.layerId);
      if (view0 && view0.refreshActor) view0.refreshActor(objectId);
      if (ctrl0) ctrl0.select(objectId);
      if (bsc0) bsc0.clearSelection();
    }

    // A. Create new replacement actor
    // 0615F: use the active Library placement asset if it resolves to 'structure',
    // otherwise fall back to the placeholder cube — never breaks 0615E behavior.
    var createBtn = _el('button', 'studio-btn primary', 'Create Structure Replacement');
    createBtn.addEventListener('click', function () {
      if (!ctrl0) { statusEl.textContent = 'PlacementController unavailable.'; return; }
      var resolver0 = global.WOSAssetResolver;
      var activeAssetId = _state.selectedAssetId ||
        (view0 && view0.getActiveAsset && view0.getActiveAsset()) || '';
      var activeDefaults = activeAssetId && resolver0 && resolver0.resolvePlacementDefaults
        ? resolver0.resolvePlacementDefaults(activeAssetId) : null;
      var useActiveAsset = activeDefaults && activeDefaults.actorCategory === 'structure';
      var result = ctrl0.place(selection.centroid.lat, selection.centroid.lon, {
        assetId:       useActiveAsset ? activeDefaults.assetId : 'wos_placeholder_cube',
        actorCategory: 'structure',
        actorType:     'building',
      });
      if (!result.ok) { statusEl.textContent = 'Placement failed: ' + result.reason; return; }
      var newId = result.manifest.objectId;
      store.update(newId, {
        structure: {
          mapboxFeatureId:   selection.featureId,
          mapboxSourceId:    selection.sourceId,
          mapboxSourceLayer: selection.sourceLayer,
          mapboxLayerId:     selection.layerId,
        },
      });
      _finish(newId);
    });
    body.appendChild(createBtn);

    body.appendChild(_el('div', 'insp-section-label', 'or assign an existing structure actor'));

    var actorSel = _el('select', 'insp-select');
    structureActors.forEach(function (a) {
      var opt = doc.createElement('option');
      opt.value = a.objectId;
      var lbl = (a.meta && a.meta.displayLabel) || a.assetId || a.objectId;
      opt.textContent = lbl + ' · ' + a.anchor.lat.toFixed(4) + ', ' + a.anchor.lon.toFixed(4);
      actorSel.appendChild(opt);
    });
    body.appendChild(actorSel);

    // B. Assign existing structure actor
    var assignBtn = _el('button', 'studio-btn', 'Assign Existing Structure Actor');
    assignBtn.disabled = structureActors.length === 0;
    assignBtn.addEventListener('click', function () {
      var val = actorSel.value;
      var actor = store && store.get(val);
      if (!actor) { statusEl.textContent = 'Actor not found.'; return; }
      // If actor is already bound to a different building, clear that binding
      if (actor.structure && actor.structure.mapboxFeatureId != null &&
          String(actor.structure.mapboxFeatureId) !== String(selection.featureId)) {
        if (brl0) brl0.restore(actor.structure.mapboxFeatureId, actor.structure.mapboxSourceId, actor.structure.mapboxSourceLayer);
      }
      store.update(val, {
        anchor: { lat: selection.centroid.lat, lon: selection.centroid.lon },
        structure: {
          mapboxFeatureId:   selection.featureId,
          mapboxSourceId:    selection.sourceId,
          mapboxSourceLayer: selection.sourceLayer,
          mapboxLayerId:     selection.layerId,
        },
      });
      _finish(val);
    });
    body.appendChild(assignBtn);
    body.appendChild(statusEl);

    // ── 0618B: Building Texture assignment subsection ─────────────────────────
    _renderBuildingTextureAssignmentSection(body, selection);
  }

  function _renderBuildingTextureAssignmentSection(body, selection) {
    var texStore   = global.WOSBuildingTexturePackageStore;
    var assignCtl  = global.WOSBuildingTextureAssignmentController;
    var previewCtl = global.WOSBuildingTexturePreviewController;
    if (!texStore || !assignCtl) return;

    var packaged = texStore.list().filter(function (p) { return p.status === 'packaged'; });
    var key      = assignCtl.buildingKey(selection);
    if (!key) return;
    var existing = assignCtl.getForBuilding(selection);

    body.appendChild(_el('div', 'insp-section-label', 'Building Textures'));

    // ── 0618D: Visible proof action ───────────────────────────────────────────
    var proofCtl = global.WOSBuildingTextureProofController;
    var proofActionsEl = _el('div', 'btex-proof-actions');
    var proofBtn = _el('button', 'studio-btn primary btex-proof-btn', 'Apply Test Texture');
    proofBtn.title = 'Generates an obvious checker texture and applies it directly to the replacement object.';
    var proofStatusEl = _el('div', 'btex-proof-status');

    // Show last proof result if any
    var lastProof = proofCtl && proofCtl.getSnapshot().lastProof;
    if (lastProof && lastProof.buildingKey === key) {
      var psCls = 'btex-proof-result btex-proof-result--' + lastProof.status.toLowerCase();
      var psEl  = _el('div', psCls,
        'Texture Proof: ' + lastProof.status + (lastProof.reason ? ' — ' + lastProof.reason : ''));
      if (lastProof.appliedObjectId) {
        psEl.appendChild(_el('span', 'btex-proof-detail', 'obj: ' + lastProof.appliedObjectId));
      }
      if (lastProof.meshCount != null) {
        psEl.appendChild(_el('span', 'btex-proof-detail', 'meshes: ' + lastProof.meshCount + ' / tex-ready: ' + lastProof.textureReadyCount));
      }
      proofActionsEl.appendChild(psEl);
    }

    if (proofCtl) {
      proofBtn.addEventListener('click', function () {
        proofBtn.disabled = true; proofBtn.textContent = 'Applying…';
        proofStatusEl.textContent = '';
        proofCtl.applyVisibleProof(selection, function (err, result) {
          proofBtn.disabled = false; proofBtn.textContent = 'Apply Test Texture';
          if (err || !result) { proofStatusEl.textContent = 'Error: ' + (err ? err.message : 'unknown'); return; }
          _renderSelectedActorInspector(_byId('studio-inspector-body'));
        });
      });
    }

    var clearProofBtn = _el('button', 'studio-btn studio-btn--xs', 'Reset Texture Proof');
    clearProofBtn.addEventListener('click', function () {
      if (proofCtl) proofCtl.clearProof(selection);
      _renderSelectedActorInspector(_byId('studio-inspector-body'));
    });

    proofActionsEl.appendChild(proofBtn);
    proofActionsEl.appendChild(clearProofBtn);
    proofActionsEl.appendChild(proofStatusEl);
    body.appendChild(proofActionsEl);

    // Current assignment display
    if (existing && Object.keys(existing.slots || {}).length) {
      body.appendChild(_el('div', 'btex-assignment-head', 'Current Assignment'));
      var slotsEl = _el('div', 'btex-assigned-slots');
      Object.keys(existing.slots).forEach(function (slotName) {
        var slot  = existing.slots[slotName];
        var pkg   = texStore.get(slot.packageId);
        var state = previewCtl && previewCtl.getPreviewState(key);
        var stateForSlot = (state && state.slotName === slotName) ? state : null;

        var slotRow = _el('div', 'btex-slot-row');
        slotRow.appendChild(_el('span', 'btex-slot-name', slotName));
        slotRow.appendChild(_el('span', 'btex-slot-pkg', pkg ? (pkg.label || slot.packageId) : slot.packageId));

        // Preview state badge
        if (stateForSlot) {
          var badgeCls = 'btex-preview-state btex-preview-state--' + stateForSlot.status.toLowerCase();
          slotRow.appendChild(_el('span', badgeCls, 'Preview: ' + _btexPreviewLabel(stateForSlot.status)));
          if (stateForSlot.reason) {
            slotRow.appendChild(_el('span', 'btex-preview-reason', stateForSlot.reason));
          }
        } else {
          slotRow.appendChild(_el('span', 'btex-preview-state btex-preview-state--none', 'Preview: Not Run'));
        }

        var removeSlotBtn = _el('button', 'studio-btn studio-btn--xs', 'Remove');
        removeSlotBtn.addEventListener('click', (function (sn) { return function () {
          assignCtl.removeSlot(selection, sn);
          if (previewCtl) previewCtl.clearPreview(key);
          _renderSelectedActorInspector(_byId('studio-inspector-body'));
        }; })(slotName));
        slotRow.appendChild(removeSlotBtn);
        slotsEl.appendChild(slotRow);
      });
      body.appendChild(slotsEl);

      // Preview actions
      if (previewCtl) {
        var previewActionsEl = _el('div', 'btex-preview-actions');
        var previewBtn = _el('button', 'studio-btn studio-btn--xs', 'Preview Texture');
        previewBtn.addEventListener('click', function () {
          previewBtn.disabled = true;
          previewBtn.textContent = 'Previewing…';
          previewCtl.previewBuilding(selection, {}, function (err, result) {
            previewBtn.disabled = false;
            previewBtn.textContent = 'Preview Texture';
            _renderSelectedActorInspector(_byId('studio-inspector-body'));
          });
        });
        var clearPreviewBtn = _el('button', 'studio-btn studio-btn--xs', 'Clear Preview');
        clearPreviewBtn.addEventListener('click', function () {
          previewCtl.clearPreview(key);
          _renderSelectedActorInspector(_byId('studio-inspector-body'));
        });
        previewActionsEl.appendChild(previewBtn);
        previewActionsEl.appendChild(clearPreviewBtn);
        body.appendChild(previewActionsEl);
      }

      var clearBtn = _el('button', 'studio-btn studio-btn--xs', 'Clear Building Textures');
      clearBtn.addEventListener('click', function () {
        if (previewCtl) previewCtl.clearPreview(key);
        assignCtl.clearBuilding(selection);
        _renderSelectedActorInspector(_byId('studio-inspector-body'));
      });
      body.appendChild(clearBtn);
    } else {
      body.appendChild(_el('div', 'btex-no-assignment', 'No texture assigned.'));
    }

    if (!packaged.length) {
      body.appendChild(_el('div', 'btex-no-pkgs', 'No packaged textures available. Package a texture in the Library first.'));
      return;
    }

    // Assign slot controls
    body.appendChild(_el('div', 'btex-assignment-head', 'Assign Texture'));
    var assignWrap = _el('div', 'btex-assign-wrap');

    var slotSel = doc.createElement('select');
    slotSel.className = 'insp-select';
    ['facade', 'roof', 'base', 'accent'].forEach(function (s) {
      var o = doc.createElement('option'); o.value = s; o.textContent = s;
      slotSel.appendChild(o);
    });
    assignWrap.appendChild(slotSel);

    var pkgSel = doc.createElement('select');
    pkgSel.className = 'insp-select';
    packaged.forEach(function (p) {
      var o = doc.createElement('option'); o.value = p.packageId;
      o.textContent = (p.label || p.packageId) + ' (' + (p.mimeType || '') + ')';
      pkgSel.appendChild(o);
    });
    assignWrap.appendChild(pkgSel);

    var doAssignBtn = _el('button', 'studio-btn primary', 'Assign');
    var assignStatusEl = _el('div', 'btex-assign-status');
    doAssignBtn.addEventListener('click', function () {
      var result = assignCtl.assign(selection, slotSel.value, pkgSel.value, {});
      if (!result.ok) {
        assignStatusEl.textContent = 'Assign failed: ' + result.reason;
        return;
      }
      // AC3: auto-preview after assign
      if (previewCtl) {
        previewCtl.previewBuilding(selection, { slotName: slotSel.value }, function () {
          _renderSelectedActorInspector(_byId('studio-inspector-body'));
        });
      } else {
        _renderSelectedActorInspector(_byId('studio-inspector-body'));
      }
    });
    assignWrap.appendChild(doAssignBtn);
    body.appendChild(assignWrap);
    body.appendChild(assignStatusEl);
  }

  function _btexPreviewLabel(status) {
    if (status === 'APPLIED')  return 'Applied';
    if (status === 'FALLBACK') return 'Fallback';
    if (status === 'MISSING')  return 'Missing';
    return status;
  }

  // ── 0616B: Shape Editor section ────────────────────────────────────────────────
  // Studio-only parametric proxy preview. Never writes shapeRecipe to the actor
  // manifest — render-layer preview only (see proxyShapeEditorController.js).
  function _renderShapeEditorSection(body, actor) {
    var shapeCtrl = global.WOSProxyShapeEditorControllerInstance;
    if (!shapeCtrl) return;

    var objectId = actor.objectId;
    var draft = shapeCtrl.selectActor(actor);
    if (!draft) return; // no template available for this category — nothing to edit yet

    var fac = global.WOSActorProxyGeometryFactory;
    _inspectorHeader(body, 'Shape Editor');

    var templates = shapeCtrl.availableTemplates(actor);
    if (templates.length > 1) {
      body.appendChild(_inspDropdown('template', draft.template, templates,
        function (t) { return t; }, function (t) { return t; }, null,
        function (v) {
          shapeCtrl.setTemplate(objectId, v);
          _renderSelectedActorInspector(_byId('studio-inspector-body'));
        }));
    } else {
      body.appendChild(_inspReadOnly('template', draft.template));
    }

    var paramKeys = fac && fac.paramKeysFor ? fac.paramKeysFor(draft.template) : Object.keys(draft.params || {});
    paramKeys.forEach(function (key) {
      body.appendChild(_inspNumber(key, draft.params[key], 'm', -100, 200, null,
        function (v) {
          shapeCtrl.setParam(objectId, key, v);
          // Update only the dirty/preview indicator, not a full re-render — keeps focus in the input
          var dirtyEl = _byId('insp-shape-dirty-' + objectId);
          if (dirtyEl) dirtyEl.textContent = shapeCtrl.isDirty(objectId) ? 'Preview active (Studio-only, not saved)' : '';
        }));
    });

    var dirtyTag = _el('div', 'insp-shape-dirty', shapeCtrl.isDirty(objectId) ? 'Preview active (Studio-only, not saved)' : '');
    dirtyTag.id = 'insp-shape-dirty-' + objectId;
    body.appendChild(dirtyTag);

    var btnRow = _el('div', 'insp-btn-row');

    var previewBtn = _el('button', 'studio-btn', 'Preview Shape');
    previewBtn.addEventListener('click', function () {
      shapeCtrl.previewShape(objectId);
      _renderSelectedActorInspector(_byId('studio-inspector-body'));
    });
    btnRow.appendChild(previewBtn);

    var resetBtn = _el('button', 'studio-btn', 'Reset Shape');
    resetBtn.addEventListener('click', function () {
      shapeCtrl.resetShape(objectId);
      _renderSelectedActorInspector(_byId('studio-inspector-body'));
    });
    btnRow.appendChild(resetBtn);

    body.appendChild(btnRow);
  }

  // ── 0616C: Object Material Editor section ─────────────────────────────────────
  // Studio-only object color/material preview. Never writes materialRecipe/
  // materialDraft/slot colors to the actor manifest — render-layer preview only
  // (see objectMaterialAuthoringController.js). Separate from Phase 7's
  // MaterialOverrideController below, which remains untouched.
  function _renderObjectMaterialEditorSection(body, actor) {
    var matAuthCtrl = global.WOSObjectMaterialAuthoringControllerInstance;
    if (!matAuthCtrl) return;

    var objectId = actor.objectId;
    var draft = matAuthCtrl.selectActor(actor);
    if (!draft) return;

    _inspectorHeader(body, 'Object Material Editor');

    var SLOT_LABELS = ['body', 'roof', 'glass', 'accent', 'edge', 'emissive'];
    SLOT_LABELS.forEach(function (slot) {
      var wrap = _el('div', 'insp-field-wrap');
      var lbl = _el('label', 'insp-label', slot + ' color');
      var row = _el('div', 'insp-input-row');
      var inp = doc.createElement('input');
      inp.type = 'color';
      inp.className = 'insp-color-input';
      inp.value = draft.slots[slot] || matAuthCtrl.defaultSlotSuggestion(slot);
      inp.addEventListener('input', function () {
        matAuthCtrl.setSlot(objectId, slot, inp.value);
      });
      row.appendChild(inp);

      var clearBtn = _el('button', 'studio-btn', 'Clear');
      clearBtn.style.cssText = 'font-size:.68rem;padding:2px 7px;margin-left:6px;';
      clearBtn.addEventListener('click', function () {
        matAuthCtrl.setSlot(objectId, slot, null);
        _renderSelectedActorInspector(_byId('studio-inspector-body'));
      });
      row.appendChild(clearBtn);

      wrap.appendChild(lbl); wrap.appendChild(row);
      body.appendChild(wrap);
    });

    body.appendChild(_inspDropdown('materialClass', draft.materialClass || '',
      ['', 'lambert', 'standard', 'emissive'],
      function (v) { return v; }, function (v) { return v === '' ? 'asset default' : v; }, null,
      function (v) {
        matAuthCtrl.setMaterialClass(objectId, v || null);
        _renderSelectedActorInspector(_byId('studio-inspector-body'));
      }));

    body.appendChild(_inspNumber('roughness', draft.roughness, '', 0, 1, null,
      function (v) { matAuthCtrl.setScalar(objectId, 'roughness', v); }));
    body.appendChild(_inspNumber('metalness', draft.metalness, '', 0, 1, null,
      function (v) { matAuthCtrl.setScalar(objectId, 'metalness', v); }));
    body.appendChild(_inspNumber('opacity', draft.opacity, '', 0, 1, null,
      function (v) { matAuthCtrl.setScalar(objectId, 'opacity', v); }));

    var dirtyTag = _el('div', 'insp-shape-dirty',
      matAuthCtrl.isDirty(objectId) ? 'Preview active (Studio-only, not saved)' : '');
    body.appendChild(dirtyTag);

    var btnRow = _el('div', 'insp-btn-row');

    var previewBtn = _el('button', 'studio-btn', 'Preview Material');
    previewBtn.addEventListener('click', function () {
      matAuthCtrl.previewMaterial(objectId);
      _renderSelectedActorInspector(_byId('studio-inspector-body'));
    });
    btnRow.appendChild(previewBtn);

    var resetBtn = _el('button', 'studio-btn', 'Reset Material');
    resetBtn.addEventListener('click', function () {
      matAuthCtrl.resetMaterial(objectId);
      _renderSelectedActorInspector(_byId('studio-inspector-body'));
    });
    btnRow.appendChild(resetBtn);

    body.appendChild(btnRow);
  }

  // ── 0616G: Custom Asset Governance section ────────────────────────────────────
  // Shows promotion-gate governance status for custom-asset actors.
  // Only visible when actor uses a studio-custom asset.
  function _renderCustomAssetGovernanceSection(body, actor) {
    var validator = global.WOSCustomAssetGovernanceValidator;
    var resolver  = global.WOSAssetResolver;
    if (!validator || !resolver) return;

    var resolved = resolver.resolve(actor.assetId);
    var asset    = resolved && resolved.asset;
    if (!asset || asset.source !== 'studio-custom') return;

    _inspectorHeader(body, 'Custom Asset Governance');

    var checks   = validator.validateForActor(actor);
    var failures = checks.filter(function (c) { return c.result === 'fail'; });
    var warnings = checks.filter(function (c) { return c.result === 'warned'; });
    var ready    = failures.length === 0;

    var summaryEl = _el('div', 'gov-summary ' + (ready ? 'gov-pass' : 'gov-fail'));
    summaryEl.textContent = ready
      ? 'Promotion ready: yes' + (warnings.length > 0 ? ' (' + warnings.length + ' warning' + (warnings.length !== 1 ? 's' : '') + ')' : '')
      : 'Promotion ready: no — ' + failures.length + ' blocking failure' + (failures.length !== 1 ? 's' : '');
    body.appendChild(summaryEl);

    // Key field summary
    var shapeCheck = checks.filter(function (c) { return c.id === 'A_CUSTOM_ASSET_SHAPE_RECIPE_VALID'; })[0];
    var matCheck   = checks.filter(function (c) { return c.id === 'A_CUSTOM_ASSET_MATERIAL_RECIPE_VALID'; })[0];
    var catCheck   = checks.filter(function (c) { return c.id === 'A_CUSTOM_ASSET_CATEGORY_COMPATIBLE'; })[0];
    var mfstCheck  = checks.filter(function (c) { return c.id === 'A_CUSTOM_ASSET_MANIFEST_CLEAN'; })[0];

    function _govRow(label, check) {
      if (!check) return;
      var icon = check.result === 'pass' ? '✓' : (check.result === 'fail' ? '✗' : '⚠');
      var cls  = 'gov-row gov-' + check.result;
      var row  = _el('div', cls);
      row.textContent = icon + ' ' + label + ': ' + (check.result === 'pass' ? 'pass' : check.message);
      body.appendChild(row);
    }

    body.appendChild(_inspReadOnly('assetId', asset.id));
    body.appendChild(_inspReadOnly('source', asset.source));
    _govRow('shapeRecipe', shapeCheck);
    _govRow('materialRecipe', matCheck);
    _govRow('category compatibility', catCheck);
    _govRow('manifest cleanliness', mfstCheck);
  }

  // ── 0616F: Custom Asset section ───────────────────────────────────────────────
  // Full editable custom asset inspector: Update / Fork / Fork+Apply / Save-new.
  // Never writes shapeRecipe/materialRecipe/draft fields to actor manifests.
  // Update path calls refreshActorsByAsset so ALL instances of the asset refresh.
  // Fork path passes current editor drafts as explicit override recipes so the
  // fork captures the in-progress edits, not just the previously saved state.
  function _renderCustomAssetSection(body, actor) {
    var customStore  = global.WOSCustomStudioAssetStore;
    if (!customStore) return;

    var objectId     = actor.objectId;
    var resolver     = global.WOSAssetResolver;
    var shapeCtrl    = global.WOSProxyShapeEditorControllerInstance;
    var matAuthCtrl  = global.WOSObjectMaterialAuthoringControllerInstance;
    var resolved     = resolver ? resolver.resolve(actor.assetId) : { asset: null };
    var currentAsset = resolved.asset;
    var isCustom     = !!(currentAsset && currentAsset.source === 'studio-custom');
    var isEditable   = isCustom && currentAsset.editable === true;
    var usageCount   = isCustom ? customStore.actorsUsing(currentAsset.id).length : 0;

    var shapeActive  = shapeCtrl  ? shapeCtrl.previewActive(objectId)   : false;
    var matActive    = matAuthCtrl ? matAuthCtrl.previewActive(objectId) : false;
    var shapeDirty   = shapeCtrl  ? shapeCtrl.isDirty(objectId)          : false;
    var matDirty     = matAuthCtrl ? matAuthCtrl.isDirty(objectId)        : false;
    var hasEdits     = shapeDirty || matDirty;

    _inspectorHeader(body, 'Custom Asset');

    // ── Metadata panel ─────────────────────────────────────────────────────────
    if (isCustom) {
      body.appendChild(_inspReadOnly('assetId', currentAsset.id));
      body.appendChild(_inspReadOnly('label', currentAsset.label || '—'));
      body.appendChild(_inspReadOnly('source', currentAsset.source));
      body.appendChild(_inspReadOnly('editable', currentAsset.editable ? 'yes' : 'no'));
      body.appendChild(_inspReadOnly('shapeRecipe', currentAsset.shapeRecipe ? 'present' : 'missing'));
      body.appendChild(_inspReadOnly('materialRecipe', currentAsset.materialRecipe ? 'present' : 'missing'));
      body.appendChild(_inspReadOnly('actors using this asset', String(usageCount)));
      if (currentAsset.authoring && currentAsset.authoring.updatedAt) {
        body.appendChild(_inspReadOnly('last updated', currentAsset.authoring.updatedAt.replace('T', ' ').replace(/\.\d+Z$/, ' UTC')));
      }
    } else {
      body.appendChild(_inspReadOnly('asset source', currentAsset ? (currentAsset.source || 'system') : 'unresolved'));
    }

    // ── Dirty state indicators ─────────────────────────────────────────────────
    if (shapeActive || matActive || hasEdits) {
      var stateWrap = _el('div', 'custom-asset-state-wrap');
      if (shapeActive) stateWrap.appendChild(_el('span', 'custom-asset-state-tag preview', 'Shape preview active'));
      if (matActive)   stateWrap.appendChild(_el('span', 'custom-asset-state-tag preview', 'Material preview active'));
      if (hasEdits)    stateWrap.appendChild(_el('span', 'custom-asset-state-tag unsaved', 'Unsaved custom asset edits'));
      body.appendChild(stateWrap);
    }

    // ── Label input ────────────────────────────────────────────────────────────
    var labelWrap = _el('div', 'insp-field-wrap');
    labelWrap.appendChild(_el('label', 'insp-label', 'asset label'));
    var labelInp = doc.createElement('input');
    labelInp.type = 'text'; labelInp.maxLength = 80;
    labelInp.className = 'insp-input';
    if (isCustom) labelInp.value = currentAsset.label || '';
    else labelInp.placeholder = 'optional — auto-generated if blank';
    labelWrap.appendChild(labelInp);
    body.appendChild(labelWrap);

    var statusEl = _el('div', 'insp-building-status');

    // ── Helpers ────────────────────────────────────────────────────────────────

    function _currentDraftRecipes() {
      var shapeDraft = shapeCtrl  ? shapeCtrl.getDraft(objectId)   : null;
      var matDraft   = matAuthCtrl ? matAuthCtrl.getDraft(objectId) : null;
      return {
        shapeRecipe: shapeDraft ? { template: shapeDraft.template, params: Object.assign({}, shapeDraft.params) } : null,
        materialRecipe: matDraft ? {
          slots: Object.assign({}, matDraft.slots), materialClass: matDraft.materialClass,
          roughness: matDraft.roughness, metalness: matDraft.metalness, opacity: matDraft.opacity,
        } : null,
      };
    }

    function _applyToActor(newAssetId) {
      var store = global.WOSActorManifestStore;
      if (store) store.update(objectId, { assetId: newAssetId });
      var view = global.WOSThreeDCanvasView;
      if (view && view.refreshActor) view.refreshActor(objectId);
    }

    function _refreshAll(affectedAssetId) {
      var view = global.WOSThreeDCanvasView;
      if (view && view.refreshActorsByAsset) view.refreshActorsByAsset(affectedAssetId);
      _refreshActorRows();
      _renderSelectedActorInspector(_byId('studio-inspector-body'));
    }

    // ── Update (only for editable custom assets, DRAFT actor) ─────────────────
    if (isEditable) {
      var updateInfo = _el('div', 'custom-asset-update-info');
      updateInfo.textContent = 'Update will affect ' + usageCount + ' actor' + (usageCount !== 1 ? 's' : '');
      body.appendChild(updateInfo);

      var updateBtn = _el('button', 'studio-btn primary', 'Update Custom Asset');
      updateBtn.addEventListener('click', function () {
        var recipes = _currentDraftRecipes();
        var patch = {};
        if (recipes.shapeRecipe)    patch.shapeRecipe    = recipes.shapeRecipe;
        if (recipes.materialRecipe) patch.materialRecipe = recipes.materialRecipe;
        var label = labelInp.value.trim();
        if (label && label !== currentAsset.label) patch.label = label;
        var result = customStore.update(currentAsset.id, patch);
        if (!result.ok) { statusEl.textContent = 'Update failed: ' + result.reason; return; }
        statusEl.textContent = 'Updated ' + currentAsset.id + ' (' + usageCount + ' actor' + (usageCount !== 1 ? 's' : '') + ' refreshed).';
        _refreshAll(currentAsset.id);
      });
      body.appendChild(updateBtn);
    }

    // ── Fork (only for custom assets, DRAFT actor) ─────────────────────────────
    if (isCustom) {
      var forkBtn = _el('button', 'studio-btn', 'Fork Custom Asset');
      forkBtn.addEventListener('click', function () {
        var recipes = _currentDraftRecipes();
        var forkOpts = { label: labelInp.value.trim() };
        if (recipes.shapeRecipe)    forkOpts.shapeRecipe    = recipes.shapeRecipe;
        if (recipes.materialRecipe) forkOpts.materialRecipe = recipes.materialRecipe;
        var result = customStore.fork(currentAsset.id, forkOpts);
        if (!result.ok) { statusEl.textContent = 'Fork failed: ' + result.reason; return; }
        statusEl.textContent = 'Forked as ' + result.assetId + '.';
        _refreshAll(currentAsset.id);
      });
      body.appendChild(forkBtn);

      var forkApplyBtn = _el('button', 'studio-btn', 'Fork + Apply to Actor');
      forkApplyBtn.addEventListener('click', function () {
        var recipes = _currentDraftRecipes();
        var forkOpts = { label: labelInp.value.trim() };
        if (recipes.shapeRecipe)    forkOpts.shapeRecipe    = recipes.shapeRecipe;
        if (recipes.materialRecipe) forkOpts.materialRecipe = recipes.materialRecipe;
        var result = customStore.fork(currentAsset.id, forkOpts);
        if (!result.ok) { statusEl.textContent = 'Fork + Apply failed: ' + result.reason; return; }
        _applyToActor(result.assetId);
        statusEl.textContent = 'Forked as ' + result.assetId + ' and applied.';
        _refreshAll(result.assetId);
      });
      body.appendChild(forkApplyBtn);
    }

    // ── Reset Editors to Saved Asset ───────────────────────────────────────────
    if (isCustom) {
      var resetEditorsBtn = _el('button', 'studio-btn', 'Reset Editors to Saved Asset');
      resetEditorsBtn.addEventListener('click', function () {
        if (shapeCtrl)   shapeCtrl.resetShape(objectId);
        if (matAuthCtrl) matAuthCtrl.resetMaterial(objectId);
        statusEl.textContent = 'Editors reset to saved asset baseline.';
        _renderSelectedActorInspector(_byId('studio-inspector-body'));
      });
      body.appendChild(resetEditorsBtn);
    }

    // ── Save as new (always available for Draft) ───────────────────────────────
    var saveBtn = _el('button', 'studio-btn', 'Save as Custom Asset');
    saveBtn.addEventListener('click', function () {
      var result = customStore.createFromActor(actor, { label: labelInp.value });
      if (!result.ok) { statusEl.textContent = 'Save failed: ' + result.reason; return; }
      statusEl.textContent = 'Saved as ' + result.assetId + '.';
      _refreshAll(result.assetId);
    });
    body.appendChild(saveBtn);

    var saveApplyBtn = _el('button', 'studio-btn', 'Save + Apply to Actor');
    saveApplyBtn.addEventListener('click', function () {
      var result = customStore.createFromActor(actor, { label: labelInp.value });
      if (!result.ok) { statusEl.textContent = 'Save failed: ' + result.reason; return; }
      _applyToActor(result.assetId);
      statusEl.textContent = 'Saved as ' + result.assetId + ' and applied to actor.';
      _refreshAll(result.assetId);
    });
    body.appendChild(saveApplyBtn);

    body.appendChild(statusEl);
  }

  // ── Phase 7: Material Override section ───────────────────────────────────────
  function _renderMaterialOverrideSection(body, actor) {
    var matCtrl = global.WOSMaterialOverrideControllerInstance;
    if (!matCtrl) return;

    var objectId = actor.objectId;
    var draft    = matCtrl.getDraft(objectId) || {};
    var palette  = global.WOSPalette || {};

    body.appendChild(_el('div', 'insp-section-label', 'Material Override'));

    // Resolve current effective materialClass for conditional slider visibility
    var resolvedClass = draft.materialClass;
    if (!resolvedClass && draft.paletteRef && palette[draft.paletteRef]) {
      resolvedClass = palette[draft.paletteRef].materialClass;
    }

    // ── Palette grid ─────────────────────────────────────────────────────────
    var grid = _el('div', 'mat-palette-grid');
    Object.keys(palette).forEach(function (name) {
      var entry   = palette[name];
      var isActive = draft.paletteRef === name;
      var wrap    = _el('div', 'mat-swatch-wrap');
      var swatch  = _el('div', 'mat-palette-swatch' + (isActive ? ' mat-palette-swatch--active' : ''));
      swatch.style.background = entry.color;
      swatch.title = name + ' (' + entry.materialClass + ')';
      swatch.addEventListener('click', function () {
        matCtrl.setPreviewField(objectId, 'paletteRef', name);
        _renderSelectedActorInspector(_byId('studio-inspector-body'));
      });
      var label = _el('div', 'mat-palette-swatch-name', name.replace('_', ' '));
      wrap.appendChild(swatch);
      wrap.appendChild(label);
      grid.appendChild(wrap);
    });
    body.appendChild(grid);

    // Clear palette
    if (draft.paletteRef) {
      var clearPal = _el('button', 'studio-btn', 'Clear Palette');
      clearPal.style.cssText = 'font-size:.7rem;padding:2px 8px;margin:2px 0 6px;';
      clearPal.addEventListener('click', function () {
        matCtrl.setPreviewField(objectId, 'paletteRef', null);
        _renderSelectedActorInspector(_byId('studio-inspector-body'));
      });
      body.appendChild(clearPal);
    }

    // ── Free hex colour ───────────────────────────────────────────────────────
    var hexRow  = _el('div', 'mat-hex-row');
    var hexLabel = _el('label', 'insp-label', 'Color');
    hexLabel.style.cssText = 'flex:0 0 48px;';
    var hexInp  = doc.createElement('input');
    hexInp.type        = 'text';
    hexInp.className   = 'mat-hex-input';
    hexInp.maxLength   = 7;
    hexInp.placeholder = '#RRGGBB';
    hexInp.value       = draft.color || '';
    var hexErr = _el('div', 'mat-hex-error');
    hexInp.addEventListener('input', function () {
      var v = hexInp.value.trim();
      if (!v) { hexErr.textContent = ''; matCtrl.setPreviewField(objectId, 'color', null); return; }
      if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(v)) {
        hexErr.textContent = '';
        hexInp.classList.remove('mat-invalid');
        matCtrl.setPreviewField(objectId, 'color', v);
      } else {
        hexErr.textContent = 'Must be #RGB or #RRGGBB';
        hexInp.classList.add('mat-invalid');
      }
    });
    hexRow.appendChild(hexLabel);
    hexRow.appendChild(hexInp);
    body.appendChild(hexRow);
    body.appendChild(hexErr);

    // ── Material class dropdown ───────────────────────────────────────────────
    body.appendChild(_inspDropdown('materialClass',
      draft.materialClass || '',
      ['', 'lambert', 'standard'],
      function (v) { return v; },
      function (v) { return v === '' ? 'asset default' : v; },
      null,
      function (v) {
        matCtrl.setPreviewField(objectId, 'materialClass', v || null);
        _renderSelectedActorInspector(_byId('studio-inspector-body'));
      }
    ));

    // ── PBR sliders (standard only) ───────────────────────────────────────────
    if (resolvedClass === 'standard') {
      var roughnessWrap = _el('div', 'mat-slider-wrap');
      roughnessWrap.appendChild(_el('label', null, 'roughness'));
      var roughSlider  = doc.createElement('input');
      roughSlider.type  = 'range'; roughSlider.className = 'mat-slider';
      roughSlider.min   = '0'; roughSlider.max = '1'; roughSlider.step = '0.01';
      roughSlider.value = draft.roughness != null ? draft.roughness : '0.5';
      var roughVal = _el('span', 'mat-slider-val', roughSlider.value);
      roughSlider.addEventListener('input', function () {
        roughVal.textContent = parseFloat(roughSlider.value).toFixed(2);
        matCtrl.setPreviewField(objectId, 'roughness', parseFloat(roughSlider.value));
      });
      roughnessWrap.appendChild(roughSlider);
      roughnessWrap.appendChild(roughVal);
      body.appendChild(roughnessWrap);

      var metalnessWrap = _el('div', 'mat-slider-wrap');
      metalnessWrap.appendChild(_el('label', null, 'metalness'));
      var metSlider  = doc.createElement('input');
      metSlider.type  = 'range'; metSlider.className = 'mat-slider';
      metSlider.min   = '0'; metSlider.max = '1'; metSlider.step = '0.01';
      metSlider.value = draft.metalness != null ? draft.metalness : '0';
      var metVal = _el('span', 'mat-slider-val', metSlider.value);
      metSlider.addEventListener('input', function () {
        metVal.textContent = parseFloat(metSlider.value).toFixed(2);
        matCtrl.setPreviewField(objectId, 'metalness', parseFloat(metSlider.value));
      });
      metalnessWrap.appendChild(metSlider);
      metalnessWrap.appendChild(metVal);
      body.appendChild(metalnessWrap);
    }

    // ── Save / Reset ─────────────────────────────────────────────────────────
    var actionsRow = _el('div', 'mat-override-actions');
    var saveStatus = _el('div', 'mat-save-status');

    var saveBtn = _el('button', 'studio-btn primary', 'Save Override');
    saveBtn.addEventListener('click', function () {
      matCtrl.commitDraft(objectId);
      saveStatus.textContent = 'Saved.';
      setTimeout(function () { saveStatus.textContent = ''; }, 2000);
    });

    var resetBtn = _el('button', 'studio-btn', 'Reset');
    resetBtn.title = 'Remove material override and restore default material';
    resetBtn.addEventListener('click', function () {
      matCtrl.reset(objectId);
      _renderSelectedActorInspector(_byId('studio-inspector-body'));
    });

    actionsRow.appendChild(saveBtn);
    actionsRow.appendChild(resetBtn);
    body.appendChild(actionsRow);
    body.appendChild(saveStatus);
  }

  // ── Phase 2 Inspector (0613_WOS_3DCanvasLabPhase2Properties) ─────────────────
  function _renderSelectedActorInspector(body) {
    body.innerHTML = '';

    // Phase 6: Building Replacement panel takes over when a building is selected
    if (_state.selectedBuilding) {
      _renderBuildingReplacementSection(body, _state.selectedBuilding);
      return;
    }

    _inspectorHeader(body, 'Actor');

    var insp = global.WOSInspectorController;
    var placCtrl = global.WOSActorPlacementController;
    var actor = placCtrl ? placCtrl.selectedActor() : null;

    if (!actor) {
      body.appendChild(_el('div', 'studio-empty', 'Select an actor to edit its properties.'));
      return;
    }

    if (!insp) {
      // Fallback: read-only display
      body.appendChild(_metaLine('objectId', actor.objectId));
      return;
    }

    // Mount inspector for this actor if needed
    var draft = insp.draft();
    if (!draft || draft.objectId !== actor.objectId) {
      insp.mount(actor.objectId);
      draft = insp.draft();
    }

    if (!draft) { body.appendChild(_el('div', 'studio-empty', '—')); return; }

    var errors = insp.errors();
    var entries = insp.assetEntries();

    // ── 0615B: Location section ───────────────────────────────────────────────
    _renderActorLocationSection(body, actor);

    // ── Read-only fields ─────────────────────────────────────────────────────
    body.appendChild(_el('div', 'insp-section-label', 'Identity'));
    body.appendChild(_inspReadOnly('objectId', draft.objectId));
    body.appendChild(_inspReadOnly('lat', draft.anchor.lat));
    body.appendChild(_inspReadOnly('lon', draft.anchor.lon));
    body.appendChild(_inspReadOnly('specVersion', draft.meta.specVersion));
    body.appendChild(_inspReadOnly('authoredAt', draft.meta.authoredAt));
    body.appendChild(_inspReadOnly('promoted', String(draft.meta.promoted)));
    // 0616E: show resolved asset fields so custom-asset actors are unmistakable
    if (actor.assetId) {
      body.appendChild(_inspReadOnly('assetId', actor.assetId));
      var _r16e = global.WOSAssetResolver ? global.WOSAssetResolver.resolve(actor.assetId) : { asset: null };
      if (_r16e.asset) {
        body.appendChild(_inspReadOnly('asset source', _r16e.asset.source || 'system'));
        body.appendChild(_inspReadOnly('asset category', _r16e.asset.category || actor.actorCategory || '—'));
      }
    }

    // ── Editable fields ──────────────────────────────────────────────────────
    body.appendChild(_el('div', 'insp-section-label', 'Properties'));

    // actorCategory
    body.appendChild(_inspDropdown('actorCategory', draft.actorCategory, insp.categories(),
      function (v) { return v; }, function (v) { return v; },
      errors.actorCategory, function (v) { insp.setActorCategory(v); _renderSelectedActorInspector(_byId('studio-inspector-body')); }));

    // Cascade warning
    var cw = insp.cascadeWarning();
    if (cw) {
      var warn = _el('div', 'insp-warn', 'Changing category will reset actor type to custom. Continue?');
      var btnRow = _el('div', 'insp-btn-row');
      var bOk = _el('button', 'studio-btn primary', 'Confirm');
      bOk.addEventListener('click', function () { insp.confirmCategoryChange(); _renderSelectedActorInspector(_byId('studio-inspector-body')); });
      var bNo = _el('button', 'studio-btn', 'Cancel');
      bNo.addEventListener('click', function () { insp.cancelCategoryChange(); _renderSelectedActorInspector(_byId('studio-inspector-body')); });
      btnRow.appendChild(bOk); btnRow.appendChild(bNo);
      body.appendChild(warn); body.appendChild(btnRow);
    }

    // actorType
    var validTypes = insp.validTypesFor(draft.actorCategory);
    body.appendChild(_inspDropdown('actorType', draft.actorType, validTypes,
      function (v) { return v; }, function (v) { return v; },
      errors.actorType, function (v) { insp.setActorType(v); _renderSelectedActorInspector(_byId('studio-inspector-body')); }));

    // assetId dropdown
    body.appendChild(_inspAssetDropdown(draft, entries, errors.assetId, insp));

    // 0615F: asset/actor category compatibility note — display-only, never blocks save
    // 0616A: extended with a display-only asset metadata block (category/type/readiness/tags)
    var resolverI = global.WOSAssetResolver;
    if (resolverI && resolverI.resolvePlacementDefaults && draft.assetId) {
      var assetDefaults = resolverI.resolvePlacementDefaults(draft.assetId);
      if (assetDefaults.resolved && assetDefaults.actorCategory !== draft.actorCategory) {
        body.appendChild(_el('div', 'insp-warn insp-asset-category-warn',
          'Asset category differs from actor category. Proxy may use actor category until saved.'));
      }

      var resolvedEntry = resolverI.resolve(draft.assetId);
      var readiness = resolverI.placementReadiness ? resolverI.placementReadiness(draft.assetId) : 'placeable';
      var tags = (resolvedEntry.asset && resolvedEntry.asset.tags) || [];
      var metaBox = _el('div', 'insp-asset-meta-box');
      metaBox.appendChild(_inspReadOnly('resolved category', resolvedEntry.asset ? (resolvedEntry.asset.category || '—') : '—'));
      metaBox.appendChild(_inspReadOnly('placement actorCategory', assetDefaults.actorCategory));
      metaBox.appendChild(_inspReadOnly('placement actorType', assetDefaults.actorType));
      metaBox.appendChild(_inspReadOnly('readiness', readiness));
      if (tags.length) metaBox.appendChild(_inspReadOnly('tags', tags.join(', ')));
      body.appendChild(metaBox);
    }

    // anchor.altM
    body.appendChild(_inspNumber('altM', draft.anchor.altM, 'm', -500, 8849, errors.altM,
      function (v) { insp.setAltM(v); _revalidateInspector(); }));

    // anchor.headingDeg
    body.appendChild(_inspNumber('headingDeg', draft.anchor.headingDeg, 'deg', 0, 359.999, errors.headingDeg,
      function (v) { insp.setHeadingDeg(v); _revalidateInspector(); }));

    // meta.displayLabel
    body.appendChild(_inspText('displayLabel', draft.meta.displayLabel || '', 64, errors.displayLabel,
      function (v) { insp.setDisplayLabel(v); _revalidateInspector(); }));

    // ── LOD Thresholds ────────────────────────────────────────────────────────
    body.appendChild(_el('div', 'insp-section-label', 'LOD Thresholds'));
    var lod = draft.lod || {};
    var lodError = errors.lod;
    ['highM', 'medM', 'lowM', 'billboardM'].forEach(function (field) {
      body.appendChild(_inspNumber(field, lod[field], 'm', 0, 999999, lodError || null,
        function (v) { insp.setLodField(field, v); _revalidateInspector(); }));
    });
    if (lodError) body.appendChild(_el('div', 'insp-error', lodError));

    // ── Live Tracking ─────────────────────────────────────────────────────────
    if (insp.supportsLiveTracking()) {
      body.appendChild(_el('div', 'insp-section-label', 'Live Tracking'));
      _renderLiveTrackingSection(body, draft, insp);
    }

    // ── Scalars (live-tracking only) ──────────────────────────────────────────
    if (draft.liveTracking && draft.liveTracking.drEnabled) {
      body.appendChild(_el('div', 'insp-section-label', 'Continuity Scalars'));
      _renderScalarsSection(body, draft, insp);
    }

    // ── Change Reason ─────────────────────────────────────────────────────────
    body.appendChild(_el('div', 'insp-section-label', 'Governance'));
    body.appendChild(_inspText('changeReason', draft.meta.changeReason || '', 500, null,
      function (v) { insp.setChangeReason(v); }));

    // ── Save button ──────────────────────────────────────────────────────────
    var lifecycleState = (draft.meta && draft.meta.lifecycleState) || 'DRAFT';
    var isEditable = (lifecycleState === 'DRAFT' || lifecycleState === 'GATE_PENDING');
    var saveStatus = insp.saveStatus();
    var isValid = insp.isValid();
    var saveWrap = _el('div', 'insp-save-wrap');

    if (isEditable && lifecycleState === 'DRAFT') {
      var saveBtn = _el('button', 'studio-btn primary insp-save-btn',
        saveStatus === 'saved'  ? 'Saved' :
        saveStatus === 'saving' ? 'Saving…' :
        saveStatus === 'error'  ? 'Error' :
        !isValid ? 'Fix errors to save' : 'Save');
      saveBtn.disabled = !isValid || saveStatus === 'saving' || saveStatus === 'saved';
      saveBtn.addEventListener('click', function () {
        var result = insp.save();
        _renderSelectedActorInspector(_byId('studio-inspector-body'));
        if (result.ok) {
          var ctrl2 = global.WOSActorPlacementController;
          if (ctrl2) ctrl2.select(draft.objectId);
          // 0615F: refresh 3D proxy immediately — assetId/category swap must be visible without reload
          var view3 = global.WOSThreeDCanvasView;
          if (view3 && view3.refreshActor) view3.refreshActor(draft.objectId);
        }
      });
      saveWrap.appendChild(saveBtn);
      if (saveStatus === 'error') {
        saveWrap.appendChild(_el('div', 'insp-save-error', 'Save failed. Your changes are not persisted.'));
      }
    }
    body.appendChild(saveWrap);

    // ── Phase 4 lifecycle actions ────────────────────────────────────────────
    _renderLifecycleActions(body, actor, draft, lifecycleState, insp);

    // ── 0616B: Shape Editor — Draft actors only; Promoted/Retired must fork first ──
    if (lifecycleState === 'DRAFT') {
      _renderShapeEditorSection(body, actor);
    }

    // ── 0616C: Object Material Editor — Draft actors only; Promoted/Retired/Pending hidden ──
    if (lifecycleState === 'DRAFT') {
      _renderObjectMaterialEditorSection(body, actor);
    }

    // ── 0616D: Custom Asset — Draft actors only; never mutates promoted actors ──
    if (lifecycleState === 'DRAFT') {
      _renderCustomAssetSection(body, actor);
    }

    // ── 0616G: Custom Asset Governance — Draft + Gate Pending ────────────────
    if (lifecycleState === 'DRAFT' || lifecycleState === 'GATE_PENDING') {
      _renderCustomAssetGovernanceSection(body, actor);
    }

    // ── Phase 7: Material Override ────────────────────────────────────────────
    if (lifecycleState === 'DRAFT') {
      _renderMaterialOverrideSection(body, actor);
    }

    // ── Remove actor (DRAFT only) ─────────────────────────────────────────────
    if (lifecycleState === 'DRAFT') {
      var rm = _el('button', 'studio-btn insp-remove-btn', 'Remove Actor');
      rm.addEventListener('click', function () {
        insp.unmount();
        var ctrl2 = global.WOSActorPlacementController;
        if (ctrl2) ctrl2.remove(actor.objectId);
      });
      body.appendChild(rm);
    }
  }

  // ── Live Tracking section ─────────────────────────────────────────────────────
  function _renderLiveTrackingSection(body, draft, insp) {
    var lt = draft.liveTracking;
    var feedCtrl = global.WOSFeedBindingController;

    // Enable/disable toggle
    var enableWrap = _el('div', 'insp-field-wrap');
    var enableLbl = _el('label', 'insp-label', 'Enable live tracking');
    var enableToggle = doc.createElement('input');
    enableToggle.type = 'checkbox';
    enableToggle.className = 'insp-toggle';
    enableToggle.checked = !!lt;
    enableToggle.addEventListener('change', function () {
      if (enableToggle.checked) insp.enableLiveTracking('ais');
      else insp.disableLiveTracking();
      _revalidateInspector();
    });
    enableWrap.appendChild(enableLbl);
    enableWrap.appendChild(enableToggle);
    body.appendChild(enableWrap);

    if (!lt) return;

    // feedType dropdown
    body.appendChild(_inspDropdown('feedType', lt.feedType || 'ais', ['ais', 'gtfs_rt', 'gbfs'],
      function (v) { return v; }, function (v) { return v; }, null,
      function (v) { insp.enableLiveTracking(v); _revalidateInspector(); }));

    // feedSourceId
    body.appendChild(_inspText('feedSourceId', lt.feedSourceId || '', 128, null,
      function (v) { insp.setLiveTrackingField('feedSourceId', v); }));

    // bindingKey
    var bkeys = feedCtrl ? feedCtrl.bindingKeysFor(lt.feedType) : [];
    if (bkeys.length) {
      body.appendChild(_inspDropdown('bindingKey', lt.bindingKey || bkeys[0], bkeys,
        function (v) { return v; }, function (v) { return v; }, null,
        function (v) { insp.setLiveTrackingField('bindingKey', v); }));
    }

    // bindingValue + validate
    var bvWrap = _el('div', 'insp-field-wrap');
    bvWrap.appendChild(_el('label', 'insp-label', 'bindingValue'));
    var bvRow = _el('div', 'insp-input-row');
    var bvInp = doc.createElement('input');
    bvInp.type = 'text'; bvInp.className = 'insp-input'; bvInp.value = lt.bindingValue || '';
    bvInp.addEventListener('change', function () { insp.setLiveTrackingField('bindingValue', bvInp.value); });
    var valBtn = _el('button', 'studio-btn insp-validate-btn', 'Validate');
    var valResult = _el('span', 'insp-val-result', '');
    valBtn.addEventListener('click', function () {
      valResult.textContent = '…';
      valResult.className = 'insp-val-result';
      if (feedCtrl) {
        feedCtrl.validate(lt.feedType, lt.feedSourceId, lt.bindingKey, bvInp.value, function (res) {
          valResult.textContent = res.status;
          valResult.className = 'insp-val-result insp-val--' + res.status.replace(/[^a-z]/gi, '').toLowerCase();
        });
      }
    });
    bvRow.appendChild(bvInp); bvRow.appendChild(valBtn); bvRow.appendChild(valResult);
    bvWrap.appendChild(bvRow);
    body.appendChild(bvWrap);

    // pollHz + drEnabled
    body.appendChild(_inspNumber('pollHz', lt.pollHz, 'Hz', 0.001, 60, null,
      function (v) { insp.setLiveTrackingField('pollHz', parseFloat(v)); }));
    var drWrap = _el('div', 'insp-field-wrap');
    drWrap.appendChild(_el('label', 'insp-label', 'drEnabled'));
    var drToggle = doc.createElement('input');
    drToggle.type = 'checkbox'; drToggle.className = 'insp-toggle';
    drToggle.checked = !!lt.drEnabled;
    drToggle.addEventListener('change', function () {
      insp.setLiveTrackingField('drEnabled', drToggle.checked);
      _revalidateInspector();
    });
    drWrap.appendChild(drToggle);
    body.appendChild(drWrap);

    if (lt.drEnabled) {
      body.appendChild(_inspNumber('drMaxSec', lt.drMaxSec, 's', 0, 86400, null,
        function (v) { insp.setLiveTrackingField('drMaxSec', parseInt(v, 10)); }));
    }
  }

  // ── Scalars section ───────────────────────────────────────────────────────────
  function _renderScalarsSection(body, draft, insp) {
    var scalars = draft.scalars || {};
    var SCALAR_FIELDS = [
      { key: 'continuityAlpha',     label: 'continuityAlpha',     nullable: true },
      { key: 'deadReckoningWeight', label: 'deadReckoningWeight',  nullable: false },
      { key: 'coastAlpha',          label: 'coastAlpha',           nullable: true },
      { key: 'staleWeight',         label: 'staleWeight',          nullable: true },
      { key: 'interpolationWeight', label: 'interpolationWeight',  nullable: true },
    ];
    SCALAR_FIELDS.forEach(function (sf) {
      var val = scalars[sf.key];
      var wrap = _el('div', 'insp-field-wrap');
      wrap.appendChild(_el('label', 'insp-label', sf.label));

      if (sf.nullable) {
        var isNull = val === null || val === undefined;
        var useDefaultRow = _el('div', 'insp-scalar-toggle-row');
        var useDefaultToggle = doc.createElement('input');
        useDefaultToggle.type = 'checkbox'; useDefaultToggle.className = 'insp-toggle';
        useDefaultToggle.checked = isNull;
        var useDefaultLbl = _el('span', 'insp-scalar-default-lbl', 'Use runtime default');
        useDefaultRow.appendChild(useDefaultToggle);
        useDefaultRow.appendChild(useDefaultLbl);
        wrap.appendChild(useDefaultRow);

        var numInp = doc.createElement('input');
        numInp.type = 'number'; numInp.step = '0.01'; numInp.min = '0'; numInp.max = '1';
        numInp.className = 'insp-input';
        numInp.value = isNull ? '' : val;
        numInp.disabled = isNull;
        numInp.addEventListener('change', function () {
          insp.setScalar(sf.key, parseFloat(numInp.value));
        });
        useDefaultToggle.addEventListener('change', function () {
          if (useDefaultToggle.checked) {
            numInp.disabled = true; numInp.value = '';
            insp.setScalar(sf.key, null);
          } else {
            numInp.disabled = false; numInp.value = '0';
            insp.setScalar(sf.key, 0);
          }
        });
        wrap.appendChild(numInp);
      } else {
        var inp2 = doc.createElement('input');
        inp2.type = 'number'; inp2.step = '0.01'; inp2.min = '0'; inp2.max = '1';
        inp2.className = 'insp-input';
        inp2.value = val != null ? val : '0';
        inp2.addEventListener('change', function () { insp.setScalar(sf.key, parseFloat(inp2.value)); });
        wrap.appendChild(inp2);
      }
      body.appendChild(wrap);
    });
  }

  // ── 0615B: Actor Location section (read-only, authoring session only) ────────
  function _renderActorLocationSection(body, actor) {
    var locResolver = global.WOSActorLocationResolver;
    var loc = locResolver && locResolver.get(actor.objectId);

    body.appendChild(_el('div', 'insp-section-label', 'Location'));

    var wrap = _el('div', 'insp-location-wrap');

    if (!loc) {
      wrap.appendChild(_el('div', 'insp-location-pending', 'Resolving location…'));
      body.appendChild(wrap);
      return;
    }

    // Summary line
    var summaryRow = _el('div', 'insp-location-summary', loc.summary || '—');
    wrap.appendChild(summaryRow);

    // Field rows — only show fields with values
    var fields = [
      ['Borough',       loc.borough],
      ['Neighborhood',  loc.neighborhood || loc.locality],
      ['Nearest Road',  loc.nearestRoad],
      ['Nearest Place', loc.nearestPlace],
      ['Waterbody',     loc.waterbody],
      ['Building',      loc.nearestBuildingName],
      ['Coordinates',   actor.anchor.lat.toFixed(4) + ', ' + actor.anchor.lon.toFixed(4)],
      ['Confidence',    loc.confidence],
    ];
    fields.forEach(function (pair) {
      if (!pair[1]) return;
      var row = _el('div', 'insp-location-row');
      row.appendChild(_el('span', 'insp-location-key',   pair[0]));
      row.appendChild(_el('span', 'insp-location-value', pair[1]));
      wrap.appendChild(row);
    });

    body.appendChild(wrap);
  }

  // ── Phase 4 lifecycle action buttons ──────────────────────────────────────────
  function _renderLifecycleActions(body, actor, draft, lifecycleState, insp) {
    var gateCtrl = global.WOSPromotionGateController;
    var retireCtrl = global.WOSRetirementController;
    var reg = global.WOSActorRegistryController;
    var objectId = actor.objectId;

    var section = _el('div', 'insp-lifecycle-section');

    if (lifecycleState === 'DRAFT') {
      // Submit for Promotion
      var submitBtn = _el('button', 'studio-btn primary insp-promote-btn', 'Submit for Promotion');
      submitBtn.addEventListener('click', function () {
        if (!gateCtrl) return;
        var result = gateCtrl.submit(objectId);
        _renderSelectedActorInspector(_byId('studio-inspector-body'));
        _refreshActorRows();
      });
      section.appendChild(submitBtn);
    }

    else if (lifecycleState === 'GATE_PENDING') {
      // Gate result display
      var gr = gateCtrl ? gateCtrl.gateResult(objectId) : null;
      if (gr) {
        var grWrap = _el('div', 'gate-result-wrap');
        grWrap.appendChild(_el('div', 'gate-result-title', 'Gate Result — ' + (gr.outcome || 'pending')));
        var failA = (gr.checks || []).filter(function (c) { return c.result === 'fail' && c.group === 'A'; });
        var warnB = (gr.checks || []).filter(function (c) { return c.result === 'warned'; });
        if (failA.length) {
          grWrap.appendChild(_el('div', 'gate-section-label', 'Blocking failures:'));
          failA.forEach(function (c) {
            var row = _el('div', 'gate-check gate-check--fail');
            row.appendChild(_el('span', 'gate-check-id', c.id));
            row.appendChild(_el('span', 'gate-check-msg', c.message || ''));
            grWrap.appendChild(row);
          });
        }
        if (warnB.length) {
          grWrap.appendChild(_el('div', 'gate-section-label', 'Warnings (overridable):'));
          warnB.forEach(function (c) {
            var row = _el('div', 'gate-check gate-check--warn');
            row.appendChild(_el('span', 'gate-check-id', c.id));
            row.appendChild(_el('span', 'gate-check-msg', c.message || ''));
            grWrap.appendChild(row);
          });
        }
        var passA = (gr.checks || []).filter(function (c) { return c.result === 'pass' && c.group === 'A'; });
        if (passA.length && !failA.length) {
          grWrap.appendChild(_el('div', 'gate-check gate-check--pass', 'All Group A checks passed.'));
        }
        section.appendChild(grWrap);
      }

      var hasBlocking = gr && (gr.checks || []).some(function (c) { return c.result === 'fail' && c.group === 'A'; });
      if (!hasBlocking) {
        var promoteBtn = _el('button', 'studio-btn primary insp-promote-btn', 'Promote');
        promoteBtn.addEventListener('click', function () {
          if (!gateCtrl) return;
          var r = gateCtrl.promote(objectId, []);
          if (!r.ok && r.reason === 'unacknowledged_warnings') {
            // Auto-acknowledge with a note for unblocking warnings
            var acks = (r.warnings || []).map(function (w) {
              return { checkId: w.id, note: 'Acknowledged by author during Phase 4 Lab promotion.' };
            });
            gateCtrl.promote(objectId, acks);
          }
          _renderSelectedActorInspector(_byId('studio-inspector-body'));
          _refreshActorRows();
        });
        section.appendChild(promoteBtn);
      }

      var withdrawBtn = _el('button', 'studio-btn insp-withdraw-btn', 'Withdraw');
      withdrawBtn.addEventListener('click', function () {
        if (!gateCtrl) return;
        gateCtrl.withdraw(objectId);
        _renderSelectedActorInspector(_byId('studio-inspector-body'));
        _refreshActorRows();
      });
      section.appendChild(withdrawBtn);
    }

    else if (lifecycleState === 'PROMOTED' || lifecycleState === 'DEPRECATED') {
      var regEntry = reg ? reg.get(objectId) : null;
      var deps = (regEntry && regEntry.dependents) || [];

      // Fork button
      var forkBtn = _el('button', 'studio-btn primary insp-fork-btn', 'Fork Actor');
      forkBtn.addEventListener('click', function () {
        if (!gateCtrl) return;
        var changeReason = (draft.meta && draft.meta.changeReason) || '';
        var result = gateCtrl.fork(objectId, changeReason);
        if (result.ok) {
          var ctrl2 = global.WOSActorPlacementController;
          if (ctrl2) ctrl2.emit('place', result.manifest);
          _refreshActorRows();
          _renderSelectedActorInspector(_byId('studio-inspector-body'));
        } else if (result.reason === 'unacknowledged_dependents') {
          var depNote = window.prompt(
            'This actor has ' + deps.length + ' dependents. Enter a note (min 10 chars) to proceed:');
          if (depNote && depNote.length >= 10) {
            var r2 = gateCtrl.fork(objectId, changeReason, { note: depNote });
            if (r2.ok) {
              var ctrl3 = global.WOSActorPlacementController;
              if (ctrl3) ctrl3.emit('place', r2.manifest);
              _refreshActorRows();
            }
          }
        }
      });
      section.appendChild(forkBtn);

      // Retire button
      var retireBtn = _el('button', 'studio-btn insp-retire-btn', 'Retire Actor');
      retireBtn.addEventListener('click', function () {
        if (!retireCtrl) return;
        var canCheck = retireCtrl.canRetire(objectId);
        if (!canCheck.ok) {
          alert('Cannot retire: ' + canCheck.reason);
          return;
        }
        var reason = window.prompt('Enter retirement reason (min 20 characters):');
        if (!reason || reason.trim().length < 20) {
          alert('Retirement reason must be at least 20 characters.');
          return;
        }
        var confirmed = window.confirm(
          'Retiring this actor will remove it from the WOS runtime permanently. This cannot be undone.\n\nProceed?');
        if (!confirmed) return;
        var result = retireCtrl.retire(objectId, reason);
        if (result.ok) {
          insp.unmount();
          _refreshActorRows();
          _renderSelectedActorInspector(_byId('studio-inspector-body'));
        } else {
          alert('Retirement failed: ' + result.reason);
        }
      });
      section.appendChild(retireBtn);

      section.appendChild(_el('div', 'insp-promoted-note',
        lifecycleState === 'PROMOTED'
          ? 'Promoted actor. To edit, fork a new Draft.'
          : 'Deprecated — superseded by a newer actor. Retire when no longer needed.'));
    }

    else if (lifecycleState === 'RETIRED') {
      section.appendChild(_el('div', 'insp-promoted-note', 'Retired. This actor is archived and will not load in the runtime.'));
    }

    body.appendChild(section);
  }

  function _revalidateInspector() {
    // Re-render just the error states + save button without full remount
    _renderSelectedActorInspector(_byId('studio-inspector-body'));
  }

  // ── Inspector field helpers ──────────────────────────────────────────────────
  function _inspReadOnly(label, value) {
    var row = _el('div', 'insp-ro-row');
    row.appendChild(_el('span', 'insp-label', label));
    row.appendChild(_el('span', 'insp-ro-value', value == null ? '—' : String(value)));
    return row;
  }

  function _inspDropdown(label, current, options, toValue, toLabel, errorMsg, onChange) {
    var wrap = _el('div', 'insp-field-wrap');
    var lbl = _el('label', 'insp-label', label);
    var sel = _el('select', 'insp-select' + (errorMsg ? ' insp-invalid' : ''));
    options.forEach(function (opt) {
      var o = doc.createElement('option');
      o.value = toValue(opt);
      o.textContent = toLabel(opt);
      if (toValue(opt) === current) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', function () { onChange(sel.value); });
    wrap.appendChild(lbl);
    wrap.appendChild(sel);
    if (errorMsg) wrap.appendChild(_el('div', 'insp-error', errorMsg));
    return wrap;
  }

  function _inspAssetDropdown(draft, entries, errorMsg, insp) {
    var wrap = _el('div', 'insp-field-wrap');
    wrap.appendChild(_el('label', 'insp-label', 'assetId'));

    var sel = _el('select', 'insp-select' + (errorMsg ? ' insp-invalid' : ''));
    var currentFound = false;
    entries.forEach(function (e) {
      var o = doc.createElement('option');
      o.value = e.assetId;
      o.textContent = e.name + '  ·  ' + e.assetId;
      if (e.assetId === draft.assetId) { o.selected = true; currentFound = true; }
      sel.appendChild(o);
    });

    // Current assetId not in registry — show it as a flagged entry
    if (!currentFound && draft.assetId) {
      var o2 = doc.createElement('option');
      o2.value = draft.assetId;
      o2.textContent = '[unresolved] ' + draft.assetId;
      o2.selected = true;
      sel.insertBefore(o2, sel.firstChild);
    }

    sel.addEventListener('change', function () { insp.setAssetId(sel.value); _revalidateInspector(); });
    wrap.appendChild(sel);

    var resolver = global.WOSAssetResolver;
    if (resolver) {
      var res = resolver.resolve(draft.assetId);
      if (res.placeholder && draft.assetId !== 'wos_placeholder_cube') {
        wrap.appendChild(_el('div', 'insp-warn-badge', 'Asset not found in registry. Actor renders as placeholder.'));
      }
    }
    if (errorMsg) wrap.appendChild(_el('div', 'insp-error', errorMsg));
    return wrap;
  }

  function _inspNumber(label, value, unit, min, max, errorMsg, onChange) {
    var wrap = _el('div', 'insp-field-wrap');
    var lbl = _el('label', 'insp-label', label);
    var row = _el('div', 'insp-input-row');
    var inp = doc.createElement('input');
    inp.type = 'number'; inp.step = 'any'; inp.min = min; inp.max = max;
    inp.value = value != null ? value : '';
    inp.className = 'insp-input' + (errorMsg ? ' insp-invalid' : '');
    inp.addEventListener('change', function () { onChange(inp.value); });
    inp.addEventListener('blur',   function () { onChange(inp.value); });
    row.appendChild(inp);
    row.appendChild(_el('span', 'insp-unit', unit));
    wrap.appendChild(lbl); wrap.appendChild(row);
    if (errorMsg) wrap.appendChild(_el('div', 'insp-error', errorMsg));
    return wrap;
  }

  function _inspText(label, value, maxLen, errorMsg, onChange) {
    var wrap = _el('div', 'insp-field-wrap');
    var lbl = _el('label', 'insp-label', label);
    var inp = doc.createElement('input');
    inp.type = 'text'; inp.maxLength = maxLen;
    inp.value = value || '';
    inp.placeholder = 'optional label shown above actor';
    inp.className = 'insp-input' + (errorMsg ? ' insp-invalid' : '');
    inp.addEventListener('input',  function () { onChange(inp.value); });
    inp.addEventListener('change', function () { onChange(inp.value); });
    wrap.appendChild(lbl); wrap.appendChild(inp);
    if (errorMsg) wrap.appendChild(_el('div', 'insp-error', errorMsg));
    return wrap;
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
    // 0609A — ColorLab is the external authoring source for palettes. It exists as
    // src-2026May24.zip and is not yet integrated. Future bridge: ColorLab →
    // Palette Package Export → Studio Palette Lab → Map Style / Style Swapper.
    var colorLabNote = _el('div', 'studio-note', 'ColorLab external source detected (src-2026May24.zip). Integration pending. Current palettes come from SBE.ActorPresentationPaletteRegistry.');
    body.appendChild(colorLabNote);
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

  // 0612P: _renderGlyphLab removed. Glyph Lab was a false authority — it rendered
  // only a redirect notice pointing at Canvas/Symbols (wall/ui/symbolDrawer.js,
  // SBE.DrawerSystem id:"symbols"). Canvas owns glyph/symbol authoring; the
  // Symbols drawer never left it. See 0609J for the original source identification.

  // ── Canvas Lab — native canvas mount via self-contained canvas.html iframe ──
  function _renderCanvasLab(body) {
    var frame = doc.createElement('iframe');
    frame.src = './canvasLab/canvas.html';
    frame.style.cssText = 'width:100%;height:100%;border:none;display:block;background:#0f1014;';
    frame.title = 'Canvas Studio';
    body.appendChild(frame);
  }

  // ── Map Lab — delegates stage rendering and lifecycle to MapLabView ───────────
  function _renderMapLab() {
    var view = global.WOSMapLab && global.WOSMapLab.MapLabView;
    if (!view) {
      var body = _byId('studio-stage-body');
      if (body) { body.innerHTML = ''; body.appendChild(_el('div', 'studio-empty', 'Map Lab modules not loaded — check console.')); }
      return;
    }
    view.enter();
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
  function _shell() { return doc.querySelector('.studio-shell'); }

  function setMode(name) {
    if (MODES.indexOf(name) === -1) name = 'map';

    // Tear down Map (3D canvas view) if leaving it
    var leaving3D = (_state.mode === 'map' && name !== 'map');
    // Tear down Map Lab if leaving it (legacy debug mode)
    var leavingMapLab = (_state.mode === 'map-lab' && name !== 'map-lab');

    _state.mode = name;
    var tabs = doc.querySelectorAll('#studio-tabs button');
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('active', tabs[i].dataset.mode === name);
    try { global.location.hash = name; } catch (e) {}
    _state.assignStatus = null; _state.assignPanelOpen = false;

    if (leaving3D) {
      var canvasView = global.WOSThreeDCanvasView;
      if (canvasView) { try { canvasView.exit(); } catch (e) {} }
    }
    if (leavingMapLab) {
      var mapView = global.WOSMapLab && global.WOSMapLab.MapLabView;
      if (mapView) { try { mapView.exit(); } catch (e) {} }
      var s = _shell(); if (s) { s.classList.remove('studio-shell--maplab', 'maplab-lib-open'); }
    }
    if (name === 'map-lab') {
      var s2 = _shell(); if (s2) s2.classList.add('studio-shell--maplab');
    }

    _renderLibrary();
    _renderStage();

    // Inspector panel follows selection state
    if (name === 'map' || name === 'canvas' || name === 'library') {
      _state.selectedInspectorContext = 'actor';
      _renderSelectedActorInspector(_byId('studio-inspector-body'));
    }
    else if (name === 'palette-lab') { _state.selectedInspectorContext = 'palette'; _renderEmptyInspector('Inspecting palettes.'); }
    else if (name === 'proof-stage') { _state.selectedInspectorContext = 'proof'; _renderProofInspector(); }
    else if (name === 'map-lab') {
      _state.selectedInspectorContext = 'map-lab';
      var mapV = global.WOSMapLab && global.WOSMapLab.MapLabView;
      if (mapV) mapV.renderInspector(); else _renderEmptyInspector('Map Lab modules not loaded.');
    }
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

  // ── Phase 8: Publish Actors button + modal ───────────────────────────────────
  function _showPublishModal() {
    var publisher = global.WOSStudioPublisher;
    if (!publisher) { alert('WOSStudioPublisher not loaded.'); return; }

    var preview = publisher.previewBundle();
    var s = preview._summary || {};

    // Build modal overlay
    var overlay = doc.createElement('div');
    overlay.id = 'wos-publish-modal-overlay';
    overlay.style.cssText = [
      'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;',
      'display:flex;align-items:center;justify-content:center;',
    ].join('');

    var box = doc.createElement('div');
    box.style.cssText = [
      'background:#1a1a1a;color:#e0e0e0;border:1px solid #444;border-radius:6px;',
      'padding:24px 28px;min-width:320px;max-width:460px;font-family:monospace;font-size:13px;',
    ].join('');

    var title = doc.createElement('div');
    title.textContent = 'Publish to Broadcast';
    title.style.cssText = 'font-size:15px;font-weight:600;margin-bottom:16px;color:#fff;';
    box.appendChild(title);

    var lines = [
      ['Promoted actors', s.eligibleCount || 0],
      ['Structure replacements', s.structureCount || 0],
      ['Material overrides', s.materialCount || 0],
      ['Live feed actors', s.feedCount || 0],
      ['Draft (excluded)', s.draftCount || 0],
      ['Retired (excluded)', s.retiredCount || 0],
    ];
    lines.forEach(function (pair) {
      var row = doc.createElement('div');
      row.style.cssText = 'display:flex;justify-content:space-between;margin-bottom:6px;';
      var lbl = doc.createElement('span'); lbl.textContent = pair[0]; lbl.style.color = '#999';
      var val = doc.createElement('span'); val.textContent = pair[1]; val.style.color = '#fff;font-weight:600';
      row.appendChild(lbl); row.appendChild(val);
      box.appendChild(row);
    });

    if ((s.eligibleCount || 0) === 0) {
      var warn = doc.createElement('div');
      warn.textContent = 'No promoted actors to publish.';
      warn.style.cssText = 'margin-top:12px;color:#f0a000;';
      box.appendChild(warn);
    }

    var status = doc.createElement('div');
    status.style.cssText = 'margin-top:12px;min-height:20px;color:#6cf;font-size:12px;';
    box.appendChild(status);

    var actions = doc.createElement('div');
    actions.style.cssText = 'display:flex;gap:10px;margin-top:18px;justify-content:flex-end;';

    var cancelBtn = doc.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = 'padding:6px 14px;background:#333;border:1px solid #555;color:#ccc;border-radius:4px;cursor:pointer;';
    cancelBtn.addEventListener('click', function () { doc.body.removeChild(overlay); });

    var publishBtn = doc.createElement('button');
    publishBtn.textContent = 'Publish';
    publishBtn.style.cssText = 'padding:6px 14px;background:#2a7;border:none;color:#fff;border-radius:4px;cursor:pointer;font-weight:600;';
    if ((s.eligibleCount || 0) === 0) publishBtn.disabled = true;

    publishBtn.addEventListener('click', function () {
      publishBtn.disabled = true;
      publishBtn.textContent = 'Publishing…';
      status.textContent = '';

      // Discard all drafts before publish (spec AC4)
      var canvasView = global.WOSThreeDCanvasView;
      if (canvasView && canvasView.onPublish) canvasView.onPublish();

      var publisher2 = global.WOSStudioPublisher;
      publisher2.publish({}, function (err, result) {
        if (err) {
          status.style.color = '#f55';
          status.textContent = 'Error: ' + err.message;
          publishBtn.disabled = false;
          publishBtn.textContent = 'Retry';
        } else {
          status.style.color = '#6cf';
          status.textContent = 'Published v' + result.bundleVersion + ' — ' + result.actorCount + ' actors';
          publishBtn.textContent = 'Done';
          setTimeout(function () { doc.body.removeChild(overlay); }, 1800);
        }
      });
    });

    actions.appendChild(cancelBtn);
    actions.appendChild(publishBtn);
    box.appendChild(actions);
    overlay.appendChild(box);

    // Close on overlay click
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) doc.body.removeChild(overlay);
    });
    doc.body.appendChild(overlay);
  }

  function _initPublishButton() {
    var topbar = doc.querySelector('.studio-topbar');
    if (!topbar) return;

    // studioWallPublishAuthority (wall/systems/presentation) injects its own chip +
    // button into the topbar. Keep the status chip (.studio-publish-chip); remove the
    // authority's action button (.studio-publish-btn) — it is superseded by this modal.
    var authBtn = topbar.querySelector('.studio-publish-btn');
    if (authBtn) authBtn.parentNode.removeChild(authBtn);

    // 0619G: Import tool cluster — GLB, Texture, Custom Object
    var importBtn = doc.createElement('button');
    importBtn.id = 'wos-import-btn';
    importBtn.textContent = 'Import ▾';
    importBtn.title = 'Import GLB, building textures, or custom objects';
    importBtn.className = 'studio-topbar-import-btn';
    importBtn.addEventListener('click', function (e) {
      var existing = doc.getElementById('wos-import-dropdown');
      if (existing) { existing.parentNode.removeChild(existing); return; }
      var dropdown = doc.createElement('div');
      dropdown.id = 'wos-import-dropdown';
      dropdown.className = 'studio-import-dropdown';
      var rect = importBtn.getBoundingClientRect();
      dropdown.style.cssText = 'position:fixed;top:' + (rect.bottom + 4) + 'px;left:' + rect.left + 'px;z-index:9000;';
      var items = [
        { label: 'Import GLB', action: function () { _glbImportState.open = true; _setSectionOpen('imports', true); setMode('library'); _refreshActorRows(); } },
        { label: 'Import Texture', action: function () { _buildingTexState.open = true; _setSectionOpen('imports', true); setMode('library'); _refreshActorRows(); } },
        { label: 'Import Custom Object', action: function () { _customLibState.importOpen = true; _setSectionOpen('advanced', true); setMode('library'); _refreshActorRows(); } },
      ];
      items.forEach(function (item) {
        var row = doc.createElement('button');
        row.className = 'studio-import-dropdown-item';
        row.textContent = item.label;
        row.addEventListener('click', function () {
          doc.body.removeChild(dropdown);
          item.action();
        });
        dropdown.appendChild(row);
      });
      doc.body.appendChild(dropdown);
      var closeOnOutside = function (ev) {
        if (!dropdown.contains(ev.target) && ev.target !== importBtn) {
          if (dropdown.parentNode) dropdown.parentNode.removeChild(dropdown);
          doc.removeEventListener('click', closeOnOutside);
        }
      };
      setTimeout(function () { doc.addEventListener('click', closeOnOutside); }, 0);
      e.stopPropagation();
    });
    topbar.appendChild(importBtn);

    var btn = doc.createElement('button');
    btn.id = 'wos-publish-actors-btn';
    btn.textContent = 'Publish';
    btn.title = 'Publishes safe promoted Studio changes to Broadcast.';
    btn.style.cssText = [
      'margin-left:8px;padding:4px 12px;background:#2a7;border:none;',
      'color:#fff;border-radius:4px;font-size:12px;cursor:pointer;font-weight:600;',
    ].join('');
    btn.addEventListener('click', _showPublishModal);
    topbar.appendChild(btn);
  }

  function _boot() {
    _initHash();
    var tabs = doc.querySelectorAll('#studio-tabs button');
    for (var i = 0; i < tabs.length; i++) {
      (function (btn) { btn.addEventListener('click', function () { setMode(btn.dataset.mode); }); })(tabs[i]);
    }
    global.addEventListener('hashchange', function () { _initHash(); setMode(_state.mode); });

    // Wire PlacementController → inspector + library refresh (0613)
    var ctrl = global.WOSActorPlacementController;
    if (ctrl) {
      ctrl.on('select', function (actor) {
        // Phase 7: discard material override draft when switching actors
        var matCtrl = global.WOSMaterialOverrideControllerInstance;
        var prevId  = _state.lastSelectedObjectId;
        if (matCtrl && prevId && (!actor || actor.objectId !== prevId)) {
          matCtrl.discardDraft(prevId);
        }
        _state.lastSelectedObjectId = actor ? actor.objectId : null;

        // Mount InspectorController for the newly selected actor
        var insp = global.WOSInspectorController;
        if (insp) {
          if (actor) insp.mount(actor.objectId);
          else insp.unmount();
        }
        _renderSelectedActorInspector(_byId('studio-inspector-body'));
        _refreshActorRows();
      });
      ctrl.on('remove', function () {
        var insp = global.WOSInspectorController;
        if (insp) insp.unmount();
        _renderSelectedActorInspector(_byId('studio-inspector-body'));
        _refreshActorRows();
      });
      ctrl.on('place', function (ev) {
        // 0619G: update placement diag from controller event
        if (ev && ev.manifest) {
          _placementDiag.createdObjectId = ev.manifest.objectId || null;
          _placementDiag.lastResult = 'ok';
          _placementDiag.lastError  = null;
          _placementDiag.markerAdded = true;
        }
        _refreshActorRows();
      });
    }

    // Wire UndoRedoController → library + inspector refresh (Phase 3)
    var undoCtrl = global.WOSUndoRedoController;
    if (undoCtrl) {
      undoCtrl.on(function () {
        _refreshActorRows();
        _renderSelectedActorInspector(_byId('studio-inspector-body'));
      });
    }

    // 0619G v1.0.1: placement result → refresh library + inspector
    doc.addEventListener('wos:studio-placement-result', function (ev) {
      _placementDiag = Object.assign({}, _placementDiag, ev.detail || {});
      _refreshActorRows();
      var body = _byId('studio-inspector-body');
      var ctrl2 = global.WOSActorPlacementController;
      var selectedObjectId = ctrl2 && ctrl2.selectedObjectId ? ctrl2.selectedObjectId() : null;
      if (body && selectedObjectId) _renderSelectedActorInspector(body);
    });

    // Phase 6: building selection events from ThreeDCanvasView
    doc.addEventListener('wos:building-selected', function (e) {
      _state.selectedBuilding = e.detail;
      _renderSelectedActorInspector(_byId('studio-inspector-body'));
    });
    doc.addEventListener('wos:building-deselected', function () {
      _state.selectedBuilding = null;
      _renderSelectedActorInspector(_byId('studio-inspector-body'));
    });

    // Phase 8: "Publish Actors" button in topbar
    _initPublishButton();

    // 0615: re-render actor rows when canvas visibility filter changes
    doc.addEventListener('wos:actor-filter-changed', function () {
      _refreshActorRows();
    });

    // 0615B: refresh rows + inspector when a location resolves
    doc.addEventListener('wos:location-resolved', function (e) {
      _refreshActorRows();
      // Also refresh inspector if the resolved actor is currently selected
      var detail  = e.detail || {};
      var placCtrl = global.WOSActorPlacementController;
      if (placCtrl && placCtrl.selectedObjectId() === detail.objectId) {
        _renderSelectedActorInspector(_byId('studio-inspector-body'));
      }
    });

    // 0615C: re-render library header when look changes (title bar look indicator)
    doc.addEventListener('wos:map-look-changed', function (e) {
      var detail = (e && e.detail) || {};
      var lc = global.WOSMapLookController;
      if (lc) {
        var lookKey = detail.lookKey || lc.getLook();
        // Update any look indicator in the shell (no-op if element absent)
        var ind = _byId('studio-look-indicator');
        if (ind) ind.textContent = lookKey;
      }
    });

    // 0615F: restore last active placement asset selection (preference only)
    try {
      var savedActiveAsset = localStorage.getItem('wos.studio.activeAssetId');
      if (savedActiveAsset) _state.selectedAssetId = savedActiveAsset;
    } catch (e) {}

    _renderLibrary();
    setMode(_state.mode);
    console.log('[StudioShell] v' + VERSION + ' ready — 3D Canvas Lab (0613) + 0615 readability + 0615F asset placement');
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
    // 0619G: placement diagnostics
    placement: function () {
      var view = global.WOSThreeDCanvasView;
      var viewSnap = view && view.getPlacementSnapshot ? view.getPlacementSnapshot() : null;
      return {
        armed:            viewSnap ? viewSnap.armed            : _placementDiag.armed,
        activeAssetId:    viewSnap ? viewSnap.activeAssetId    : _placementDiag.activeAssetId,
        activeAssetLabel: viewSnap ? viewSnap.activeAssetLabel : _placementDiag.activeAssetLabel,
        lastClick:        viewSnap ? viewSnap.lastClick        : _placementDiag.lastClick,
        lastResult:       viewSnap ? viewSnap.lastResult       : _placementDiag.lastResult,
        lastError:        viewSnap ? viewSnap.lastError        : _placementDiag.lastError,
        createdObjectId:  viewSnap ? viewSnap.createdObjectId  : _placementDiag.createdObjectId,
        markerAdded:      viewSnap ? viewSnap.markerAdded      : _placementDiag.markerAdded,
        proxyAdded:       viewSnap ? viewSnap.proxyAdded       : _placementDiag.proxyAdded,
      };
    },
    // 0615E: building authoring debug
    // 0615F: asset placement debug
    // 0616A: asset pack inventory debug
    // 0616B: shape editor debug
    // 0616C: object material debug
    // 0616D: custom studio asset debug
    customAssets: function () {
      var customStore = global.WOSCustomStudioAssetStore;
      var ctrl   = global.WOSActorPlacementController;
      var store  = global.WOSActorManifestStore;
      var resolver = global.WOSAssetResolver;
      var shapeCtrl = global.WOSProxyShapeEditorControllerInstance;
      var matAuthCtrl = global.WOSObjectMaterialAuthoringControllerInstance;
      if (!customStore) return { enabled: false, reason: 'WOSCustomStudioAssetStore not loaded' };

      var snap = customStore.getSnapshot();
      var objectId = ctrl && ctrl.selectedObjectId ? ctrl.selectedObjectId() : null;
      var actor = objectId && store ? store.get(objectId) : null;
      var resolved = actor && resolver ? resolver.resolve(actor.assetId) : { asset: null };
      var isCustom = !!(resolved.asset && resolved.asset.source === 'studio-custom');

      return {
        enabled:                     true,
        customAssetCount:            snap.customAssetCount,
        registeredCount:             snap.registeredCount,
        selectedObjectId:            objectId,
        selectedActorAssetId:        actor ? actor.assetId : null,
        selectedActorIsCustomAsset:  isCustom,
        selectedShapeDraftActive:    shapeCtrl ? shapeCtrl.previewActive(objectId) : false,
        selectedMaterialDraftActive: matAuthCtrl ? matAuthCtrl.previewActive(objectId) : false,
        lastCreatedAssetId:          snap.lastCreatedAssetId,
        lastError:                   snap.lastError,
      };
    },
    saveSelectedAsCustomAsset: function (label) {
      var customStore = global.WOSCustomStudioAssetStore;
      var ctrl  = global.WOSActorPlacementController;
      var store = global.WOSActorManifestStore;
      if (!customStore || !ctrl) return { ok: false, reason: 'unavailable' };
      var objectId = ctrl.selectedObjectId ? ctrl.selectedObjectId() : null;
      var actor = objectId && store ? store.get(objectId) : null;
      if (!actor) return { ok: false, reason: 'no_selected_actor' };
      return customStore.createFromActor(actor, { label: label });
    },
    applyCustomAsset: function (assetId) {
      var ctrl  = global.WOSActorPlacementController;
      var store = global.WOSActorManifestStore;
      var view  = global.WOSThreeDCanvasView;
      if (!ctrl || !store) return { ok: false, reason: 'unavailable' };
      var objectId = ctrl.selectedObjectId ? ctrl.selectedObjectId() : null;
      if (!objectId) return { ok: false, reason: 'no_selected_actor' };
      store.update(objectId, { assetId: assetId });
      if (view && view.refreshActor) view.refreshActor(objectId);
      return { ok: true, objectId: objectId, assetId: assetId };
    },
    // 0616E — full placement-path snapshot
    customAssetPlacement: function () {
      var customStore = global.WOSCustomStudioAssetStore;
      var view      = global.WOSThreeDCanvasView;
      var ctrl      = global.WOSActorPlacementController;
      var store     = global.WOSActorManifestStore;
      var resolver  = global.WOSAssetResolver;
      var shapeCtrl = global.WOSProxyShapeEditorControllerInstance;
      var matCtrl   = global.WOSObjectMaterialAuthoringControllerInstance;

      var activeAssetId    = view && view.getActiveAsset ? view.getActiveAsset() : null;
      var activeResolved   = activeAssetId && resolver ? resolver.resolve(activeAssetId) : { asset: null };
      var activeIsCustom   = !!(activeResolved.asset && activeResolved.asset.source === 'studio-custom');
      var customCount      = customStore ? customStore.getSnapshot().customAssetCount : 0;
      var objectId         = ctrl && ctrl.selectedObjectId ? ctrl.selectedObjectId() : null;
      var actor            = objectId && store ? store.get(objectId) : null;
      var selResolved      = actor && resolver ? resolver.resolve(actor.assetId) : { asset: null };
      var selIsCustom      = !!(selResolved.asset && selResolved.asset.source === 'studio-custom');
      var selAsset         = selResolved.asset;

      return {
        enabled:                       true,
        activeAssetId:                 activeAssetId,
        activeAssetIsCustom:           activeIsCustom,
        customAssetCount:              customCount,
        selectedObjectId:              objectId,
        selectedActorAssetId:          actor ? actor.assetId : null,
        selectedActorIsCustom:         selIsCustom,
        selectedHasSavedShapeRecipe:   !!(selAsset && selAsset.shapeRecipe),
        selectedHasSavedMaterialRecipe: !!(selAsset && selAsset.materialRecipe),
        selectedShapePreviewActive:    shapeCtrl ? shapeCtrl.previewActive(objectId) : false,
        selectedMaterialPreviewActive: matCtrl ? matCtrl.previewActive(objectId) : false,
        lastPlacementResult:           view && view.getLastPlacementResult ? view.getLastPlacementResult() : null,
        lastError:                     customStore ? customStore.getSnapshot().lastError : null,
      };
    },
    placeCustomAsset: function (assetId) {
      var view = global.WOSThreeDCanvasView;
      if (!view || !view.armPlacement) return { ok: false, reason: 'unavailable' };
      view.armPlacement(assetId);
      return { ok: true, assetId: assetId, armed: true };
    },

    // ── 0616F debug commands ─────────────────────────────────────────────────
    customAssetEdit: function () {
      var customStore  = global.WOSCustomStudioAssetStore;
      var placement    = global.WOSActorPlacementController;
      var store        = global.WOSActorManifestStore;
      var resolver     = global.WOSAssetResolver;
      var shapeCtrl    = global.WOSProxyShapeEditorControllerInstance;
      var matAuthCtrl  = global.WOSObjectMaterialAuthoringControllerInstance;
      var objectId     = placement && placement.selectedObjectId ? placement.selectedObjectId() : null;
      var actor        = objectId && store ? store.get(objectId) : null;
      var resolved     = actor && resolver ? resolver.resolve(actor.assetId) : { asset: null };
      var asset        = resolved.asset;
      var isCustom     = !!(asset && asset.source === 'studio-custom');
      var isEditable   = isCustom && asset.editable === true;
      var isDraft      = actor ? (actor.lifecycleState === 'draft' || !actor.lifecycleState) : false;
      var usageCount   = isCustom && customStore ? customStore.actorsUsing(asset.id).length : 0;
      var snap         = customStore ? customStore.getSnapshot() : {};
      return {
        enabled: true,
        selectedObjectId: objectId || null,
        selectedActorAssetId: actor ? (actor.assetId || null) : null,
        selectedActorIsDraft: isDraft,
        selectedAssetIsCustom: isCustom,
        selectedAssetEditable: isEditable,
        selectedAssetLabel: isCustom ? (asset.label || null) : null,
        selectedHasSavedShapeRecipe: isCustom ? !!asset.shapeRecipe : false,
        selectedHasSavedMaterialRecipe: isCustom ? !!asset.materialRecipe : false,
        selectedShapeDraftDirty: shapeCtrl  ? shapeCtrl.isDirty(objectId)   : false,
        selectedMaterialDraftDirty: matAuthCtrl ? matAuthCtrl.isDirty(objectId) : false,
        selectedShapePreviewActive: shapeCtrl  ? shapeCtrl.previewActive(objectId)   : false,
        selectedMaterialPreviewActive: matAuthCtrl ? matAuthCtrl.previewActive(objectId) : false,
        actorUsageCount: usageCount,
        lastUpdatedAssetId: snap.lastUpdatedAssetId || null,
        lastForkedAssetId: snap.lastForkedAssetId || null,
        lastError: snap.lastError || null,
      };
    },

    updateSelectedCustomAsset: function () {
      var customStore  = global.WOSCustomStudioAssetStore;
      var placement    = global.WOSActorPlacementController;
      var store        = global.WOSActorManifestStore;
      var resolver     = global.WOSAssetResolver;
      var shapeCtrl    = global.WOSProxyShapeEditorControllerInstance;
      var matAuthCtrl  = global.WOSObjectMaterialAuthoringControllerInstance;
      var view         = global.WOSThreeDCanvasView;
      if (!customStore) return { ok: false, reason: 'WOSCustomStudioAssetStore unavailable' };
      var objectId = placement && placement.selectedObjectId ? placement.selectedObjectId() : null;
      if (!objectId) return { ok: false, reason: 'no_selected_actor' };
      var actor = store ? store.get(objectId) : null;
      if (!actor) return { ok: false, reason: 'actor_not_found' };
      var resolved = resolver ? resolver.resolve(actor.assetId) : { asset: null };
      var asset = resolved.asset;
      if (!asset || asset.source !== 'studio-custom' || !asset.editable) {
        return { ok: false, reason: 'actor_asset_not_editable_custom' };
      }
      var shapeDraft = shapeCtrl  ? shapeCtrl.getDraft(objectId)   : null;
      var matDraft   = matAuthCtrl ? matAuthCtrl.getDraft(objectId) : null;
      var patch = {};
      if (shapeDraft) patch.shapeRecipe = { template: shapeDraft.template, params: Object.assign({}, shapeDraft.params) };
      if (matDraft) patch.materialRecipe = { slots: Object.assign({}, matDraft.slots), materialClass: matDraft.materialClass, roughness: matDraft.roughness, metalness: matDraft.metalness, opacity: matDraft.opacity };
      var result = customStore.update(asset.id, patch);
      if (!result.ok) return result;
      if (view && view.refreshActorsByAsset) view.refreshActorsByAsset(asset.id);
      return { ok: true, updatedAssetId: asset.id };
    },

    forkSelectedCustomAsset: function (label, apply) {
      var customStore  = global.WOSCustomStudioAssetStore;
      var placement    = global.WOSActorPlacementController;
      var store        = global.WOSActorManifestStore;
      var resolver     = global.WOSAssetResolver;
      var shapeCtrl    = global.WOSProxyShapeEditorControllerInstance;
      var matAuthCtrl  = global.WOSObjectMaterialAuthoringControllerInstance;
      var view         = global.WOSThreeDCanvasView;
      if (!customStore) return { ok: false, reason: 'WOSCustomStudioAssetStore unavailable' };
      var objectId = placement && placement.selectedObjectId ? placement.selectedObjectId() : null;
      if (!objectId) return { ok: false, reason: 'no_selected_actor' };
      var actor = store ? store.get(objectId) : null;
      if (!actor) return { ok: false, reason: 'actor_not_found' };
      var resolved = resolver ? resolver.resolve(actor.assetId) : { asset: null };
      var asset = resolved.asset;
      if (!asset || asset.source !== 'studio-custom') return { ok: false, reason: 'actor_asset_not_custom' };
      var shapeDraft = shapeCtrl  ? shapeCtrl.getDraft(objectId)   : null;
      var matDraft   = matAuthCtrl ? matAuthCtrl.getDraft(objectId) : null;
      var forkOpts = { label: label || '' };
      if (shapeDraft) forkOpts.shapeRecipe = { template: shapeDraft.template, params: Object.assign({}, shapeDraft.params) };
      if (matDraft) forkOpts.materialRecipe = { slots: Object.assign({}, matDraft.slots), materialClass: matDraft.materialClass, roughness: matDraft.roughness, metalness: matDraft.metalness, opacity: matDraft.opacity };
      var result = customStore.fork(asset.id, forkOpts);
      if (!result.ok) return result;
      if (apply && store) {
        store.update(objectId, { assetId: result.assetId });
        if (view && view.refreshActor) view.refreshActor(objectId);
      }
      return { ok: true, forkedAssetId: result.assetId, applied: !!apply };
    },

    refreshActorsByAsset: function (assetId) {
      var view = global.WOSThreeDCanvasView;
      if (!view || !view.refreshActorsByAsset) return { ok: false, reason: 'unavailable' };
      return view.refreshActorsByAsset(assetId);
    },

    // ── 0616G debug commands ─────────────────────────────────────────────────
    customAssetGovernance: function () {
      var validator  = global.WOSCustomAssetGovernanceValidator;
      var placement  = global.WOSActorPlacementController;
      var store      = global.WOSActorManifestStore;
      var resolver   = global.WOSAssetResolver;
      if (!validator) return { enabled: false, reason: 'WOSCustomAssetGovernanceValidator unavailable' };
      var objectId = placement && placement.selectedObjectId ? placement.selectedObjectId() : null;
      var actor    = objectId && store ? store.get(objectId) : null;
      var resolved = actor && resolver ? resolver.resolve(actor.assetId) : { asset: null };
      var asset    = resolved.asset;
      var isCustom = !!(asset && asset.source === 'studio-custom');
      var checks   = actor ? validator.validateForActor(actor) : [];
      var failures = checks.filter(function (c) { return c.result === 'fail'; });
      var warnings = checks.filter(function (c) { return c.result === 'warned'; });
      return {
        enabled: true,
        selectedObjectId: objectId || null,
        selectedActorAssetId: actor ? (actor.assetId || null) : null,
        selectedActorIsCustom: isCustom,
        selectedLifecycleState: actor && actor.meta ? (actor.meta.lifecycleState || 'DRAFT') : null,
        selectedCanPromote: isCustom && failures.length === 0,
        checks: checks,
        failureCount: failures.length,
        warningCount: warnings.length,
        lastError: null,
      };
    },

    validateSelectedCustomAsset: function () {
      var validator = global.WOSCustomAssetGovernanceValidator;
      var placement = global.WOSActorPlacementController;
      var store     = global.WOSActorManifestStore;
      if (!validator) return { ok: false, reason: 'WOSCustomAssetGovernanceValidator unavailable' };
      var objectId = placement && placement.selectedObjectId ? placement.selectedObjectId() : null;
      if (!objectId) return { ok: false, reason: 'no_selected_actor' };
      var actor = store ? store.get(objectId) : null;
      if (!actor) return { ok: false, reason: 'actor_not_found' };
      var checks   = validator.validateForActor(actor);
      var failures = checks.filter(function (c) { return c.result === 'fail'; });
      var warnings = checks.filter(function (c) { return c.result === 'warned'; });
      return { ok: true, checks: checks, failureCount: failures.length, warningCount: warnings.length };
    },

    validateCustomAsset: function (assetId) {
      var validator = global.WOSCustomAssetGovernanceValidator;
      if (!validator) return { ok: false, reason: 'WOSCustomAssetGovernanceValidator unavailable' };
      if (!assetId) return { ok: false, reason: 'no_assetId' };
      var checks   = validator.validateAssetById(assetId);
      var failures = checks.filter(function (c) { return c.result === 'fail'; });
      var warnings = checks.filter(function (c) { return c.result === 'warned'; });
      return { ok: true, assetId: assetId, checks: checks, failureCount: failures.length, warningCount: warnings.length };
    },

    // ── 0616H debug commands ─────────────────────────────────────────────────
    customAssetPublish: function () {
      var publisher  = global.WOSStudioPublisher;
      var store      = global.WOSActorManifestStore;
      var resolver   = global.WOSAssetResolver;
      var validator  = global.WOSCustomAssetGovernanceValidator;
      if (!publisher) return { enabled: false, reason: 'WOSStudioPublisher unavailable' };

      var allActors  = store ? store.list() : [];
      var promoted   = allActors.filter(function (a) {
        var meta = a.meta || {};
        return meta.promoted && meta.lifecycleState === 'PROMOTED';
      });

      var customActorIds = [];
      var seen = {};
      var publishable = [];
      var rejected = [];

      promoted.forEach(function (a) {
        var assetId = a.assetId;
        if (!assetId) return;
        if (seen[assetId]) return;
        seen[assetId] = true;
        var resolved = resolver ? resolver.resolve(assetId) : { asset: null };
        var asset    = resolved && resolved.asset;
        if (!asset || asset.source !== 'studio-custom') return;
        customActorIds.push(assetId);
        if (asset._customAssetRemoved) {
          rejected.push({ assetId: assetId, reason: 'custom_asset_removed' });
          return;
        }
        if (validator) {
          var checks   = validator.validateAssetById(assetId);
          var failures = checks.filter(function (c) { return c.result === 'fail'; });
          if (failures.length > 0) {
            rejected.push({ assetId: assetId, reason: 'governance_failed: ' + failures.map(function (c) { return c.id; }).join(', ') });
            return;
          }
        }
        publishable.push(assetId);
      });

      return {
        enabled:                   true,
        promotedActorCount:        promoted.length,
        customAssetActorCount:     customActorIds.length,
        publishableCustomAssetCount: publishable.length,
        rejectedCustomAssetCount:  rejected.length,
        customAssetIds:            publishable,
        rejected:                  rejected,
        lastBundleCustomAssetCount: 0, // not tracked at session level
        lastError:                 null,
      };
    },

    // ── 0616I debug commands ─────────────────────────────────────────────────
    customObjectLibrary: function () {
      var customStore = global.WOSCustomStudioAssetStore;
      var validator   = global.WOSCustomAssetGovernanceValidator;
      if (!customStore) return { enabled: false, reason: 'WOSCustomStudioAssetStore unavailable' };
      var all     = customStore.list();
      var visible = _filterCustomAssets(all, _customLibState.filter, _customLibState.query);
      return {
        enabled:               true,
        customAssetCount:      all.length,
        visibleCustomAssetCount: visible.length,
        selectedCustomAssetId: _customLibState.selected,
        activeFilters:         [_customLibState.filter],
        searchQuery:           _customLibState.query,
        assets: all.map(function (a) {
          var usage = customStore.actorsUsing(a.id).length;
          return {
            assetId:           a.id,
            label:             a.label || '',
            category:          a.category || '',
            source:            a.source  || '',
            usageCount:        usage,
            governanceStatus:  validator ? _govStatus(a.id) : 'unknown',
            hasShapeRecipe:    !!a.shapeRecipe,
            hasMaterialRecipe: !!a.materialRecipe,
            updatedAt:         a.authoring ? a.authoring.updatedAt : null,
          };
        }),
        lastImportResult:    _customLibState.lastImportResult,
        lastExportAssetId:   _customLibState.lastExportAssetId,
        lastRemovedAssetId:  _customLibState.lastRemovedAssetId,
        lastError:           _customLibState.lastError,
      };
    },

    customObject: function (assetId) {
      var customStore = global.WOSCustomStudioAssetStore;
      if (!customStore) return { ok: false, reason: 'WOSCustomStudioAssetStore unavailable' };
      var asset = customStore.get(assetId);
      if (!asset) return { ok: false, reason: 'asset_not_found' };
      var summary = customStore.usageSummary(assetId);
      return { ok: true, asset: asset, usage: summary, governanceStatus: _govStatus(assetId) };
    },

    exportCustomObject: function (assetId) {
      var customStore = global.WOSCustomStudioAssetStore;
      if (!customStore) return { ok: false, reason: 'WOSCustomStudioAssetStore unavailable' };
      if (!assetId) return { ok: false, reason: 'no_assetId' };
      var result = customStore.exportOne(assetId);
      if (result.ok) _customLibState.lastExportAssetId = assetId;
      return result;
    },

    exportCustomObjects: function () {
      var customStore = global.WOSCustomStudioAssetStore;
      if (!customStore) return { ok: false, reason: 'WOSCustomStudioAssetStore unavailable' };
      return { ok: true, payload: customStore.exportJSON() };
    },

    removeCustomObject: function (assetId) {
      var customStore = global.WOSCustomStudioAssetStore;
      if (!customStore) return { ok: false, reason: 'WOSCustomStudioAssetStore unavailable' };
      if (!assetId) return { ok: false, reason: 'no_assetId' };
      var usage = customStore.actorsUsing(assetId).length;
      if (usage > 0) return { ok: false, reason: 'asset_in_use', usageCount: usage };
      var result = customStore.remove(assetId);
      if (result.ok) {
        _customLibState.lastRemovedAssetId = assetId;
        if (_customLibState.selected === assetId) _customLibState.selected = null;
        _refreshActorRows();
      }
      return result;
    },

    // ── 0616J debug commands ─────────────────────────────────────────────────
    glbImport: function () {
      var glbCtrl = global.WOSGlbImportController;
      if (!glbCtrl) return { enabled: false, reason: 'WOSGlbImportController unavailable' };
      return glbCtrl.getSnapshot();
    },

    importedGlbAssets: function () {
      var glbStore = global.WOSGlbImportStore;
      if (!glbStore) return { enabled: false, reason: 'WOSGlbImportStore unavailable' };
      var snap = glbStore.getSnapshot();
      snap.assets = glbStore.list().map(function (a) {
        var gi = a.glbImport || {};
        return {
          assetId:       a.id,
          label:         a.label,
          category:      a.category,
          source:        a.source,
          status:        gi.status,
          fileName:      gi.fileName,
          fileSizeBytes: gi.fileSizeBytes,
          boundsM:       gi.boundsM,
          scaleToMeters: gi.scaleToMeters,
        };
      });
      return snap;
    },

    importedGlbAsset: function (assetId) {
      var glbStore = global.WOSGlbImportStore;
      if (!glbStore) return { ok: false, reason: 'WOSGlbImportStore unavailable' };
      var rec = glbStore.get(assetId);
      if (!rec) return { ok: false, reason: 'asset_not_found' };
      return { ok: true, record: rec, objectUrlPresent: !!glbStore.getObjectUrl(assetId) };
    },

    // ── 0616K debug commands ─────────────────────────────────────────────────
    compositions: function () {
      var compStore = global.WOSCompositionStore;
      var compCtrl  = global.WOSCompositionController;
      if (!compStore) return { enabled: false, reason: 'WOSCompositionStore unavailable' };
      var snap = compStore.getSnapshot();
      snap.controllerSnapshot = compCtrl ? compCtrl.getSnapshot() : null;
      return snap;
    },

    composition: function (compositionId) {
      var compStore = global.WOSCompositionStore;
      if (!compStore) return { ok: false, reason: 'WOSCompositionStore unavailable' };
      var rec = compStore.get(compositionId);
      if (!rec) return { ok: false, reason: 'composition_not_found' };
      var usage = compStore.usageSummary(compositionId);
      var errs  = [];
      // basic validation check
      try {
        var v = compStore.placeComposition;
        // we don't want to actually place — just show record + usage
      } catch (e) {}
      return { ok: true, record: rec, usage: usage };
    },

    createCompositionFromSelection: function (label) {
      var compCtrl = global.WOSCompositionController;
      if (!compCtrl) return { ok: false, reason: 'WOSCompositionController unavailable' };
      var result = compCtrl.createCompositionFromSelection({ label: label || 'Debug Composition' });
      if (result.ok) _compState.selected = result.compositionId;
      _refreshActorRows();
      return result;
    },

    placeComposition: function (compositionId, anchorOverride) {
      var compStore = global.WOSCompositionStore;
      if (!compStore) return { ok: false, reason: 'WOSCompositionStore unavailable' };
      var anchor = anchorOverride || (function () {
        var ctrl = global.WOSActorPlacementController;
        return ctrl && ctrl.getLastPlacementAnchor ? ctrl.getLastPlacementAnchor() : { lat: 0, lon: 0, altM: 0, headingDeg: 0 };
      }());
      var result = compStore.placeComposition(compositionId, anchor);
      _compState.lastStatus = result.ok ? 'Placed ' + (result.childObjectIds || []).length + ' actors.' : 'Failed: ' + result.reason;
      _refreshActorRows();
      return result;
    },

    exportComposition: function (compositionId) {
      var compStore = global.WOSCompositionStore;
      if (!compStore) return { ok: false, reason: 'WOSCompositionStore unavailable' };
      return compStore.exportOne(compositionId);
    },

    exportCompositions: function () {
      var compStore = global.WOSCompositionStore;
      if (!compStore) return { ok: false, reason: 'WOSCompositionStore unavailable' };
      return compStore.exportJSON();
    },

    // ── 0617C debug commands ─────────────────────────────────────────────────
    glbRuntimePackages: function () {
      var store = global.WOSGlbRuntimePackageStore;
      if (!store) return { enabled: false, reason: 'WOSGlbRuntimePackageStore unavailable' };
      return store.getSnapshot();
    },
    glbRuntimePackage: function (assetId) {
      var store = global.WOSGlbRuntimePackageStore;
      if (!store) return { enabled: false, reason: 'WOSGlbRuntimePackageStore unavailable' };
      var rec = store.get(assetId);
      return rec ? { found: true, record: rec } : { found: false, assetId: assetId };
    },
    packageImportedGlb: function (assetId) {
      var store = global.WOSGlbRuntimePackageStore;
      if (!store) return { ok: false, reason: 'WOSGlbRuntimePackageStore unavailable' };
      store.packageGlb(assetId, function (err, result) {
        if (err) { console.error('[packageImportedGlb]', err.message); }
        else      { console.log('[packageImportedGlb]', result); }
      });
      return { ok: true, status: 'packaging_started', assetId: assetId };
    },

    // ── 0618B debug commands ─────────────────────────────────────────────────
    buildingTextures: function () {
      var store     = global.WOSBuildingTexturePackageStore;
      var assignCtl = global.WOSBuildingTextureAssignmentController;
      if (!store) return { enabled: false, reason: 'WOSBuildingTexturePackageStore unavailable' };
      return {
        packages:    store.list(),
        assignments: assignCtl ? assignCtl.list() : [],
      };
    },
    buildingTexture: function (packageId) {
      var store = global.WOSBuildingTexturePackageStore;
      if (!store) return { enabled: false };
      var rec = store.get(packageId);
      return rec ? { found: true, record: rec } : { found: false, packageId: packageId };
    },
    packageBuildingTexture: function (packageId) {
      var store = global.WOSBuildingTexturePackageStore;
      if (!store) return { ok: false, reason: 'WOSBuildingTexturePackageStore unavailable' };
      store.packageTexture(packageId, function (err, result) {
        if (err) { console.error('[packageBuildingTexture]', err.message); }
        else      { console.log('[packageBuildingTexture]', result); }
      });
      return { ok: true, status: 'packaging_started', packageId: packageId };
    },
    mapSurface: function () {
      var v = global.WOSThreeDCanvasView;
      if (!v || !v.getMapSurfaceSnapshot) return { enabled: false, reason: 'WOSThreeDCanvasView unavailable' };
      return v.getMapSurfaceSnapshot();
    },
    buildingTextureProof: function () {
      var ctl  = global.WOSBuildingTextureProofController;
      var bsc  = global.WOSBuildingSelectionControllerInstance;
      var sel  = _state.selectedBuilding;
      var snap = ctl ? ctl.getSnapshot() : null;
      var lp   = snap && snap.lastProof;
      return {
        selectionModeActive: !!(bsc && bsc.isSelectionModeActive),
        selectedBuilding: sel ? {
          featureId:   sel.featureId   != null ? String(sel.featureId) : null,
          sourceId:    sel.sourceId    || null,
          sourceLayer: sel.sourceLayer || null,
          centroid:    sel.centroid    || null,
          height:      (sel.properties && sel.properties.height != null) ? sel.properties.height
                       : (sel.properties && sel.properties.render_height != null) ? sel.properties.render_height
                       : null,
        } : null,
        lastClick:          sel ? (sel.centroid || null) : null,
        lastResult:         lp ? (lp.status === 'APPLIED' ? 'ok' : lp.status === 'FALLBACK' ? 'fallback' : 'error') : null,
        lastError:          lp && lp.status !== 'APPLIED' ? (lp.reason || null) : null,
        proofApplied:       !!(lp && lp.status === 'APPLIED'),
        proofMode:          lp ? 'test-texture' : null,
        visualLayerUpdated: !!(lp && lp.status === 'APPLIED' && lp.textureReady),
      };
    },
    buildingTexturePreview: function (buildingKey) {
      var ctl = global.WOSBuildingTexturePreviewController;
      if (!ctl) return { enabled: false, reason: 'WOSBuildingTexturePreviewController unavailable' };
      if (buildingKey) {
        var s = ctl.getPreviewState(buildingKey);
        return s ? { found: true, state: s } : { found: false, buildingKey: buildingKey };
      }
      return ctl.getSnapshot();
    },

    // ── 0616L debug commands ─────────────────────────────────────────────────
    broadcastReadiness: function () {
      var analyzer = global.WOSBroadcastReadinessAnalyzer;
      if (!analyzer) return { enabled: false, reason: 'WOSBroadcastReadinessAnalyzer unavailable' };
      return analyzer.getSnapshot();
    },

    analyzeAsset: function (assetId) {
      var analyzer = global.WOSBroadcastReadinessAnalyzer;
      if (!analyzer) return { ok: false, reason: 'WOSBroadcastReadinessAnalyzer unavailable' };
      return analyzer.analyzeAsset(assetId);
    },

    analyzeSelectedActorBroadcast: function () {
      var analyzer  = global.WOSBroadcastReadinessAnalyzer;
      var ctrl      = global.WOSActorPlacementController;
      var store     = global.WOSActorManifestStore;
      if (!analyzer) return { ok: false, reason: 'WOSBroadcastReadinessAnalyzer unavailable' };
      var objectId = ctrl && ctrl.selectedObjectId ? ctrl.selectedObjectId() : null;
      if (!objectId) return { ok: false, reason: 'no_selected_actor' };
      var actor = store ? store.get(objectId) : null;
      if (!actor) return { ok: false, reason: 'actor_not_found' };
      return analyzer.analyzeActor(actor);
    },

    objectMaterial: function () {
      var matAuthCtrl = global.WOSObjectMaterialAuthoringControllerInstance;
      var ctrl  = global.WOSActorPlacementController;
      var store = global.WOSActorManifestStore;
      if (!matAuthCtrl) return { enabled: false, reason: 'WOSObjectMaterialAuthoringController not mounted (open 3D Canvas first)' };
      var objectId = ctrl && ctrl.selectedObjectId ? ctrl.selectedObjectId() : null;
      var actor = objectId && store ? store.get(objectId) : null;
      return matAuthCtrl.getSnapshot(objectId, actor);
    },
    previewObjectMaterial: function (objectId, draft) {
      var matAuthCtrl = global.WOSObjectMaterialAuthoringControllerInstance;
      var store = global.WOSActorManifestStore;
      if (!matAuthCtrl) return { ok: false, reason: 'unavailable' };
      var actor = objectId && store ? store.get(objectId) : null;
      if (!actor) return { ok: false, reason: 'actor_not_found' };
      matAuthCtrl.selectActor(actor);
      draft = draft || {};
      if (draft.slots) {
        Object.keys(draft.slots).forEach(function (slot) { matAuthCtrl.setSlot(objectId, slot, draft.slots[slot]); });
      }
      if (draft.materialClass !== undefined) matAuthCtrl.setMaterialClass(objectId, draft.materialClass);
      ['roughness', 'metalness', 'opacity'].forEach(function (k) {
        if (draft[k] !== undefined) matAuthCtrl.setScalar(objectId, k, draft[k]);
      });
      return { ok: true, objectId: objectId };
    },
    clearObjectMaterialPreview: function (objectId) {
      var matAuthCtrl = global.WOSObjectMaterialAuthoringControllerInstance;
      if (!matAuthCtrl) return { ok: false, reason: 'unavailable' };
      matAuthCtrl.clearPreview(objectId);
      return { ok: true, objectId: objectId };
    },
    shapeEditor: function () {
      var shapeCtrl = global.WOSProxyShapeEditorControllerInstance;
      var ctrl      = global.WOSActorPlacementController;
      var store     = global.WOSActorManifestStore;
      if (!shapeCtrl) return { enabled: false, reason: 'WOSProxyShapeEditorController not mounted (open 3D Canvas first)' };
      var objectId = ctrl && ctrl.selectedObjectId ? ctrl.selectedObjectId() : null;
      var actor = objectId && store ? store.get(objectId) : null;
      return shapeCtrl.getSnapshot(objectId, actor);
    },
    // 0616B: optional preview helpers — Studio-only, never persisted
    previewShape: function (opts) {
      var shapeCtrl = global.WOSProxyShapeEditorControllerInstance;
      var ctrl      = global.WOSActorPlacementController;
      if (!shapeCtrl || !ctrl) return { ok: false, reason: 'unavailable' };
      var objectId = ctrl.selectedObjectId ? ctrl.selectedObjectId() : null;
      if (!objectId) return { ok: false, reason: 'no_selected_actor' };
      opts = opts || {};
      if (opts.template) shapeCtrl.setTemplate(objectId, opts.template);
      if (opts.params) {
        Object.keys(opts.params).forEach(function (k) { shapeCtrl.setParam(objectId, k, opts.params[k]); });
      }
      return { ok: true, objectId: objectId };
    },
    clearShapePreview: function () {
      var shapeCtrl = global.WOSProxyShapeEditorControllerInstance;
      var ctrl      = global.WOSActorPlacementController;
      if (!shapeCtrl || !ctrl) return { ok: false, reason: 'unavailable' };
      var objectId = ctrl.selectedObjectId ? ctrl.selectedObjectId() : null;
      if (!objectId) return { ok: false, reason: 'no_selected_actor' };
      shapeCtrl.clearPreview(objectId);
      return { ok: true, objectId: objectId };
    },
    assetPack: function () {
      var resolver = global.WOSAssetResolver;
      var view     = global.WOSThreeDCanvasView;
      var entries  = resolver ? resolver.list() : [];

      var BUCKET_KEYS = ['structure', 'road', 'marine', 'aircraft', 'prop', 'system'];
      var categories  = { structure: 0, road: 0, marine: 0, aircraft: 0, prop: 0, system: 0, unknown: 0 };
      var placeableCount = 0, unresolvedCount = 0, experimentalCount = 0;

      entries.forEach(function (e) {
        var cat = e.category || 'unknown';
        if (BUCKET_KEYS.indexOf(cat) !== -1) categories[cat]++;
        else categories.unknown++;

        var readiness = resolver && resolver.placementReadiness ? resolver.placementReadiness(e.assetId) : 'placeable';
        if (readiness === 'placeable')    placeableCount++;
        else if (readiness === 'unresolved')   unresolvedCount++;
        else if (readiness === 'experimental') experimentalCount++;
      });

      var activeAssetId = _state.selectedAssetId ||
        (view && view.getActiveAsset && view.getActiveAsset()) || null;
      var activeDefaults = activeAssetId && resolver && resolver.resolvePlacementDefaults
        ? resolver.resolvePlacementDefaults(activeAssetId) : null;

      return {
        assetCount:         entries.length,
        categories:         categories,
        placeableCount:     placeableCount,
        unresolvedCount:    unresolvedCount,
        experimentalCount:  experimentalCount,
        activeAssetId:      activeAssetId,
        activeAssetCategory: activeDefaults ? activeDefaults.actorCategory : 'unknown',
        lastError:          _state.lastError,
      };
    },
    assetPlacement: function () {
      var view     = global.WOSThreeDCanvasView;
      var resolver = global.WOSAssetResolver;
      var ctrl     = global.WOSActorPlacementController;
      var store    = global.WOSActorManifestStore;

      var activeAssetId = _state.selectedAssetId ||
        (view && view.getActiveAsset && view.getActiveAsset()) || null;
      var defaults = activeAssetId && resolver && resolver.resolvePlacementDefaults
        ? resolver.resolvePlacementDefaults(activeAssetId) : null;

      var selectedId = ctrl && ctrl.selectedObjectId ? ctrl.selectedObjectId() : null;
      var selectedActor = selectedId && store ? store.get(selectedId) : null;

      return {
        activeAssetId:        activeAssetId,
        activeAssetCategory:  defaults ? defaults.actorCategory : 'unknown',
        activeAssetResolved:  defaults ? defaults.resolved : false,
        armedPlacement:       view && view.isPlacementArmed ? view.isPlacementArmed() : false,
        selectedActorId:      selectedId,
        selectedActorAssetId: selectedActor ? selectedActor.assetId : null,
        selectedActorCategory: selectedActor ? selectedActor.actorCategory : null,
        lastPlacementResult:  view && view.getLastPlacementResult ? view.getLastPlacementResult() : null,
        lastError:            _state.lastError,
      };
    },
    buildingAuthoring: function () {
      var bsc   = global.WOSBuildingSelectionControllerInstance;
      var brl   = global.WOSBuildingReplacementLayerInstance;
      var store = global.WOSActorManifestStore;
      var sel   = bsc && bsc.selectedBuilding;
      var linkedActorId = null;
      if (sel && store) {
        store.list().forEach(function (a) {
          if (a.actorCategory === 'structure' && a.structure &&
              String(a.structure.mapboxFeatureId) === String(sel.featureId)) linkedActorId = a.objectId;
        });
      }
      return {
        selectionModeActive: bsc ? bsc.isSelectionModeActive : false,
        hoveredFeatureId:    bsc ? bsc.hoveredFeatureId : null,
        selectedFeatureId:   sel ? sel.featureId   : null,
        selectedSourceId:    sel ? sel.sourceId    : null,
        selectedSourceLayer: sel ? sel.sourceLayer : null,
        linkedActorId:       linkedActorId,
        previewActive:       bsc ? bsc.previewActive : false,
        suppressedCount:     brl && brl.suppressedCount ? brl.suppressedCount() : 0,
        lastError:           bsc ? bsc.lastError : null,
      };
    },
    // 0615D: visual authoring debug
    visualAuthoring: function () {
      var rl = global.WOSThreeDCanvasView && window._wosRenderLayerRef;
      // Reach render layer via the instance stored on window by threeDCanvasView
      var inst = global._wosRLInstance;
      if (inst && inst.getVisualAuthoringSnapshot) return inst.getVisualAuthoringSnapshot();
      return { enabled: false, reason: 'render layer not mounted or not in 3D Canvas mode' };
    },
    // 0615B: actor location intelligence debug
    actorLocations: function () {
      var locR = global.WOSActorLocationResolver;
      return locR ? locR.debugSnapshot() : { ready: false, reason: 'WOSActorLocationResolver not loaded' };
    },
    // 0615C: map look debug
    mapLook: function () {
      var lc = global.WOSMapLookController;
      return lc ? lc.debugSnapshot() : { ready: false, reason: 'WOSMapLookController not loaded' };
    },
    setMapLook: function (lookKey) {
      var lc = global.WOSMapLookController;
      if (!lc) return { ok: false, reason: 'WOSMapLookController not loaded' };
      return lc.setLook(lookKey);
    },
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
