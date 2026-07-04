// ── WOS ThreeDCanvasView ───────────────────────────────────────────────────────
// 0613 Phase 1+3+5+6 · 0614 Phase 7+8 · 0615 Readability Pass · 0615B Location
// 0615C: MapLookController integration — Look dropdown + Labels/Buildings/Actors
// Spatial placement surface. Click map to place actor. Actors persist across reload.
// Phase 3: gizmo, LOD rings, drag/drop, duplicate/delete toolbar.
// Phase 5: ActorObjectRenderLayer (Three.js proxy/GLB scene).
// Phase 6: BuildingSelectionController + BuildingReplacementLayer.
// Phase 7: MaterialOverrideController.
// Phase 8: onPublish() discards all material drafts before bundle export.
// 0615:   focusActor, setActorVisibilityFilter, rich markers.
// 0615B:  WOSActorLocationResolver init, wire place/commit/remove/style-change.
// 0615C:  WOSMapLookController owns style; Authoring View toggle replaced by Look dropdown.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var _map = null;
  var _markers = {};           // objectId → mapboxgl.Marker
  var _placementMode = false;
  var _defaultAssetId = '';
  var _mapContainerEl = null;
  var _rl  = null;             // ActorObjectRenderLayer (Phase 5)
  var _bsc = null;             // BuildingSelectionController (Phase 6)
  var _brl = null;             // BuildingReplacementLayer (Phase 6)
  var _matCtrl = null;         // MaterialOverrideController (Phase 7)
  var _shapeCtrl = null;       // ProxyShapeEditorController (0616B)
  var _matAuthCtrl = null;     // ObjectMaterialAuthoringController (0616C)
  var _viewOptionsOpen = false; // 0617B: collapsed View Options panel

  // 0615F: last placement outcome — debug-only, never persisted to manifests
  var _lastPlacementResult = null; // 'ok' | 'error' | null
  var LS_KEY_ACTIVE_ASSET   = 'wos.studio.activeAssetId';
  var LS_KEY_LAST_PLACE_CAT = 'wos.studio.lastPlacementCategory';

  // 0619G: placement diagnostics — live readiness + last-result tracking
  var _placementDiag = {
    armed: false, activeAssetId: null, activeAssetLabel: null, activeAssetCategory: null,
    lastClick: null, lastResult: null, lastError: null,
    createdObjectId: null, markerAdded: false, proxyAdded: false,
  };

  function _updatePlacementStrip() {
    var el = document.getElementById('tdcv-placement-status');
    if (!el) return;
    var d = _placementDiag;
    if (d.armed) {
      el.textContent = 'Armed — click map to place ' + (d.activeAssetLabel || d.activeAssetId || 'asset');
      el.className = 'tdcv-placement-status tdcv-placement-status--armed';
    } else if (d.lastResult === 'ok') {
      el.textContent = 'Placed: ' + (d.activeAssetLabel || d.activeAssetId || 'actor');
      el.className = 'tdcv-placement-status tdcv-placement-status--ok';
    } else if (d.lastResult === 'error') {
      el.textContent = 'Placement failed — ' + (d.lastError || 'unknown error');
      el.className = 'tdcv-placement-status tdcv-placement-status--error';
    } else {
      el.textContent = 'Ready';
      el.className = 'tdcv-placement-status tdcv-placement-status--idle';
    }
  }

  function getPlacementSnapshot() {
    return {
      armed:               _placementDiag.armed,
      activeAssetId:       _placementDiag.activeAssetId,
      activeAssetLabel:    _placementDiag.activeAssetLabel,
      activeAssetCategory: _placementDiag.activeAssetCategory,
      lastClick:           _placementDiag.lastClick,
      lastResult:          _placementDiag.lastResult,
      lastError:           _placementDiag.lastError,
      createdObjectId:     _placementDiag.createdObjectId,
      markerAdded:         _placementDiag.markerAdded,
      proxyAdded:          _placementDiag.proxyAdded,
    };
  }

  function _showPlacementFlash(message, state) {
    if (!_mapContainerEl) return;
    var el = document.getElementById('tdcv-placement-flash');
    if (!el) {
      el = document.createElement('div');
      el.id = 'tdcv-placement-flash';
      _mapContainerEl.appendChild(el);
    }
    el.className = 'tdcv-placement-flash tdcv-placement-flash--' + (state || 'ok');
    el.textContent = message || '';
    if (el._wosClearTimer) clearTimeout(el._wosClearTimer);
    var ttl = state === 'error' ? 2200 : 1400;
    el._wosClearTimer = setTimeout(function () {
      el.classList.add('tdcv-placement-flash--hiding');
    }, ttl);
  }

  // 0615F: resolve {assetId, actorCategory, actorType} for the asset about to be
  // placed. Library selection drives these defaults — never hardcoded 'prop'.
  function _placementDefaults(assetId) {
    var resolver = _resolver();
    if (resolver && resolver.resolvePlacementDefaults) return resolver.resolvePlacementDefaults(assetId);
    return { assetId: assetId, actorCategory: 'prop', actorType: 'custom', resolved: false };
  }

  // 0615C: sync View Options toggle buttons to look-controller state
  function _syncToggleBtns() {
    var lc = _lookCtrl();
    if (!lc) return;
    var opts = lc.getOptions();
    var lb = document.getElementById('tdcv-toggle-labels');
    var bb = document.getElementById('tdcv-toggle-buildings');
    var ab = document.getElementById('tdcv-toggle-actors');
    if (lb) lb.classList.toggle('tdcv-btn--active', opts.labels       !== false);
    if (bb) bb.classList.toggle('tdcv-btn--active', opts.buildings    !== false);
    if (ab) ab.classList.toggle('tdcv-btn--active', opts.actorOverlay !== false);
  }

  // readability state — never written to manifests or bundles
  var _visibilityFilter = 'all';         // 'all'|'draft'|'promoted'|'structure'

  function _store()      { return global.WOSActorManifestStore; }
  function _resolver()   { return global.WOSAssetResolver; }
  function _controller() { return global.WOSActorPlacementController; }
  function _gizmo()      { return global.WOSGizmoController; }
  function _lod()        { return global.WOSLODRingController; }
  function _locResolver(){ return global.WOSActorLocationResolver; }
  function _lookCtrl()   { return global.WOSMapLookController; }

  // ── 0615: filter logic ───────────────────────────────────────────────────────
  function _actorMatchesFilter(actor, filterKey) {
    var meta     = actor.meta || {};
    var promoted = meta.promoted;
    var state    = meta.lifecycleState;
    if (filterKey === 'all')       return true;
    if (filterKey === 'draft')     return !promoted && state !== 'RETIRED';
    if (filterKey === 'promoted')  return promoted || state === 'PROMOTED';
    if (filterKey === 'structure') return actor.actorCategory === 'structure';
    if (filterKey === 'vehicle')   return actor.actorCategory === 'vehicle';
    if (filterKey === 'maritime')  return actor.actorCategory === 'marine' || actor.actorCategory === 'maritime';
    if (filterKey === 'prop')      return actor.actorCategory === 'prop';
    return true;
  }

  function _applyActorVisibilityFilter() {
    var store = _store();
    if (!store) return;
    store.list().forEach(function (actor) {
      var visible = _actorMatchesFilter(actor, _visibilityFilter);
      var m = _markers[actor.objectId];
      if (m) m.getElement().style.display = visible ? '' : 'none';
    });
    // Notify shell to re-render actor rows
    document.dispatchEvent(new CustomEvent('wos:actor-filter-changed', { detail: { filterKey: _visibilityFilter } }));
  }

  // ── 0615: lifecycle + category classes for marker ────────────────────────────
  function _markerLifecycleClass(actor) {
    var meta  = actor.meta || {};
    var state = meta.lifecycleState;
    if (state === 'RETIRED')      return 'tdcv-marker--retired';
    if (state === 'DEPRECATED')   return 'tdcv-marker--deprecated';
    if (state === 'GATE_PENDING') return 'tdcv-marker--pending';
    if (state === 'PROMOTED' || meta.promoted) return 'tdcv-marker--promoted';
    return 'tdcv-marker--draft';
  }

  function _markerCategoryClass(actor) {
    var cat = actor.actorCategory || '';
    if (cat === 'structure')           return 'tdcv-marker--structure';
    if (cat === 'vehicle')             return 'tdcv-marker--vehicle';
    if (cat === 'marine' || cat === 'maritime') return 'tdcv-marker--maritime';
    if (cat === 'aircraft')            return 'tdcv-marker--aircraft';
    return 'tdcv-marker--prop';
  }

  // ── Marker DOM ───────────────────────────────────────────────────────────────
  function _markerEl(actor, selected) {
    var el = document.createElement('div');
    var lifecycle = _markerLifecycleClass(actor);
    var category  = _markerCategoryClass(actor);
    el.className  = 'tdcv-marker ' + lifecycle + ' ' + category + (selected ? ' tdcv-marker--selected' : '');
    el.title = (actor.assetId || 'placeholder') + '\n' + actor.objectId;
    el.dataset.objectId = actor.objectId;

    var dot = document.createElement('div');
    dot.className = 'tdcv-marker-dot';
    el.appendChild(dot);

    var label = document.createElement('div');
    label.className = 'tdcv-marker-label';
    var displayLabel = actor.meta && actor.meta.displayLabel;
    label.textContent = displayLabel || actor.assetId || 'placeholder';
    el.appendChild(label);

    return el;
  }

  function _addMarker(actor) {
    if (!_map || !global.mapboxgl) return;
    if (_markers[actor.objectId]) _removeMarker(actor.objectId);
    var el = _markerEl(actor, false);
    el.addEventListener('click', function (e) {
      e.stopPropagation();
      _selectActor(actor.objectId);
    });
    var marker = new global.mapboxgl.Marker({ element: el, anchor: 'bottom' })
      .setLngLat([actor.anchor.lon, actor.anchor.lat])
      .addTo(_map);
    _markers[actor.objectId] = marker;
    // Apply current filter visibility
    if (!_actorMatchesFilter(actor, _visibilityFilter)) el.style.display = 'none';
  }

  function _removeMarker(objectId) {
    if (_markers[objectId]) { _markers[objectId].remove(); delete _markers[objectId]; }
  }

  function _highlightMarker(objectId) {
    Object.keys(_markers).forEach(function (id) {
      var el = _markers[id].getElement();
      el.classList.toggle('tdcv-marker--selected', id === objectId);
    });
    // 0615B: update selected marker label with location short label
    if (objectId && _markers[objectId]) {
      var labelEl = _markers[objectId].getElement().querySelector('.tdcv-marker-label');
      if (labelEl) {
        var store = _store();
        var actor = store && store.get(objectId);
        var loc   = _locResolver() && _locResolver().get(objectId);
        var displayLabel = actor && actor.meta && actor.meta.displayLabel;
        var line1 = displayLabel || (actor && actor.assetId) || 'Actor';
        var line2 = loc && loc.shortLabel ? loc.shortLabel : null;
        labelEl.textContent = line2 ? line1 + '\n' + line2 : line1;
      }
    }
  }

  function _updateMarkerPosition(objectId, lat, lon) {
    if (_markers[objectId]) _markers[objectId].setLngLat([lon, lat]);
  }

  // 0615: rebuild a marker element to reflect current lifecycle/category state
  function _refreshMarkerEl(objectId) {
    var store = _store();
    var actor = store && store.get(objectId);
    if (!actor || !_markers[objectId]) return;
    var ctrl = _controller();
    var selected = ctrl && ctrl.selectedObjectId() === objectId;
    var newEl = _markerEl(actor, selected);
    newEl.addEventListener('click', function (e) {
      e.stopPropagation();
      _selectActor(objectId);
    });
    _markers[objectId].setElement(newEl);
    if (!_actorMatchesFilter(actor, _visibilityFilter)) newEl.style.display = 'none';
  }

  // 0615: pulse a marker (brief attention animation)
  function _pulseMarker(objectId) {
    var m = _markers[objectId];
    if (!m) return;
    var el = m.getElement();
    el.classList.remove('tdcv-marker--pulse');
    // Force reflow so re-adding the class re-triggers the animation
    void el.offsetWidth;
    el.classList.add('tdcv-marker--pulse');
    setTimeout(function () { el.classList.remove('tdcv-marker--pulse'); }, 900);
  }

  // ── Actor selection ──────────────────────────────────────────────────────────
  function _selectActor(objectId) {
    var ctrl = _controller();
    if (ctrl) ctrl.select(objectId);
  }

  // ── Load existing actors ─────────────────────────────────────────────────────
  function _loadActors() {
    var store = _store();
    if (!store) return;
    store.list().forEach(function (a) { _addMarker(a); });
  }

  // ── Placement mode ───────────────────────────────────────────────────────────
  function _setPlacementMode(on) {
    if (on && _bsc && _bsc.isSelectionModeActive) _setBuildingSelectionMode(false);
    _placementMode = on;
    _placementDiag.armed = on;
    if (on) {
      _placementDiag.activeAssetId    = _defaultAssetId || null;
      _placementDiag.activeAssetLabel = _resolveAssetLabel(_defaultAssetId);
      var defaults = _placementDefaults(_defaultAssetId);
      _placementDiag.activeAssetCategory = defaults.actorCategory || null;
    }
    if (_map) _map.getCanvas().style.cursor = on ? 'crosshair' : '';
    var btn = document.getElementById('tdcv-place-btn');
    if (btn) {
      btn.classList.toggle('tdcv-btn--active', on);
      btn.textContent = on ? 'Placing… (click map)' : 'Place on Map';
    }
    _updatePlacementStrip();
    if (on) {
      _showPlacementFlash(
        'Click map to place ' + (_placementDiag.activeAssetLabel || _placementDiag.activeAssetId || 'asset'),
        'armed'
      );
    }
  }

  function _resolveAssetLabel(assetId) {
    if (!assetId) return null;
    var resolver = _resolver();
    if (!resolver || !resolver.list) return assetId;
    var entries = resolver.list();
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (e.assetId === assetId || e.id === assetId) return e.name || e.label || assetId;
    }
    return assetId;
  }

  // ── Building selection mode (Phase 6) ────────────────────────────────────────
  function _setBuildingSelectionMode(on) {
    if (on) {
      if (_placementMode) _setPlacementMode(false);
      if (_bsc) _bsc.activateSelectionMode();
    } else {
      if (_bsc) _bsc.deactivateSelectionMode();
      if (_map) _map.getCanvas().style.cursor = '';
    }
    var btn = document.getElementById('tdcv-bsel-btn');
    if (btn) btn.classList.toggle('tdcv-btn--active', on);
  }

  // ── Map click → place actor or select building ───────────────────────────────
  function _onMapClick(e) {
    if (_bsc && _bsc.isSelectionModeActive) {
      var selection = _bsc.handleMapClick(e.point);
      document.dispatchEvent(new CustomEvent('wos:building-selected', { detail: selection }));
      return;
    }
    if (!_placementMode) return;
    var lat = e.lngLat.lat;
    var lon = e.lngLat.lng;
    var assetId = _defaultAssetId || (_resolver() ? _resolver().placeholderAssetId() : '');
    var ctrl = _controller();
    if (!ctrl) return;
    var defaults = _placementDefaults(assetId);
    var result = ctrl.place(lat, lon, {
      assetId:       defaults.assetId,
      actorCategory: defaults.actorCategory,
      actorType:     defaults.actorType,
    });
    _lastPlacementResult = result.ok ? 'ok' : 'error';
    // 0619G: record placement outcome in diag
    _placementDiag.lastClick         = { lat: lat, lon: lon };
    _placementDiag.activeAssetId     = defaults.assetId;
    _placementDiag.activeAssetLabel  = _resolveAssetLabel(defaults.assetId);
    _placementDiag.activeAssetCategory = defaults.actorCategory || null;
    _placementDiag.lastResult        = _lastPlacementResult;
    _placementDiag.lastError         = result.ok ? null : (result.reason || 'unknown');
    _placementDiag.createdObjectId   = result.ok && result.manifest ? result.manifest.objectId : null;
    _placementDiag.markerAdded       = result.ok;
    _placementDiag.proxyAdded        = false; // proxy added async by ActorObjectRenderLayer

    if (result.ok) {
      _addMarker(result.manifest);

      if (ctrl && ctrl.select) ctrl.select(result.manifest.objectId);

      _pulseMarker(result.manifest.objectId);

      if (_map && result.manifest.anchor) {
        _map.easeTo({ center: [result.manifest.anchor.lon, result.manifest.anchor.lat], duration: 350, essential: true });
      }

      _showPlacementFlash(
        'Placed ' + (_placementDiag.activeAssetLabel || result.manifest.assetId || 'actor'),
        'ok'
      );

      document.dispatchEvent(new CustomEvent('wos:studio-placement-result', { detail: getPlacementSnapshot() }));

      _setPlacementMode(false);

      try { localStorage.setItem(LS_KEY_LAST_PLACE_CAT, defaults.actorCategory); } catch (err) {}
    } else {
      _showPlacementFlash(
        'Placement failed — ' + (result.reason || 'unknown error'),
        'error'
      );

      document.dispatchEvent(new CustomEvent('wos:studio-placement-result', { detail: getPlacementSnapshot() }));

      _updatePlacementStrip();
    }
  }

  // ── Controller callbacks ─────────────────────────────────────────────────────
  function _onControllerSelect(actor) {
    _highlightMarker(actor ? actor.objectId : null);
    var g = _gizmo();
    var l = _lod();
    if (actor) {
      if (g) g.show(actor);
      if (l) l.show(actor);
      _updateActionButtons(actor);
    } else {
      if (g) g.hide();
      if (l) l.hide();
      _updateActionButtons(null);
    }
    if (_rl) _rl.setSelection(actor ? actor.objectId : null);
  }

  function _onControllerRemove(ev) {
    var store = _store();
    var actor = ev.actor || (store && store.get(ev.objectId));
    if (_brl && actor &&
        actor.actorCategory === 'structure' &&
        actor.structure &&
        actor.structure.mapboxFeatureId != null) {
      _brl.restore(
        actor.structure.mapboxFeatureId,
        actor.structure.mapboxSourceId,
        actor.structure.mapboxSourceLayer
      );
    }
    _removeMarker(ev.objectId);
    var g = _gizmo(); if (g) g.hide();
    var l = _lod();   if (l) l.hide();
    _updateActionButtons(null);
    if (_rl) _rl.onActorRemoved(ev.objectId);
    // 0615B: clear cached location
    var locR0 = _locResolver();
    if (locR0) locR0.clear(ev.objectId);
  }

  function _onControllerPlace(manifest) {
    if (!_markers[manifest.objectId]) _addMarker(manifest);
    if (_rl) _rl.onActorAdded(manifest);
    _pulseMarker(manifest.objectId);
    // 0615B: resolve location after place
    var locR = _locResolver();
    if (locR) locR.resolveActor(manifest);
  }

  // ── 0615C: MapLookController callbacks (called by controller after style reload) ──
  function _onLookStyleReload() {
    if (_rl  && _rl.remount)  _rl.remount();
    if (_brl && _brl.remount) _brl.remount();
    if (_bsc && _bsc.remount) _bsc.remount();
  }

  function _onLookMapIdle() {
    var locR3 = _locResolver();
    if (locR3) locR3.resync();
  }

  // ── Toolbar DOM ──────────────────────────────────────────────────────────────
  // 0617B: minimal Map toolbar — asset context + Place on Map + View Options only.
  // All secondary controls (Look, Labels, Buildings, Actors, Show, Visual, Auth Scale,
  // Select Building, Duplicate, Delete) are moved into the View Options panel.
  function _buildToolbar(container) {
    var bar = document.createElement('div');
    bar.className = 'tdcv-toolbar';
    bar.id = 'tdcv-toolbar';

    // Left: selected asset context (visible only when an asset is active)
    var contextEl = document.createElement('div');
    contextEl.id = 'tdcv-asset-context';
    contextEl.className = 'tdcv-asset-context';
    bar.appendChild(contextEl);

    // Center: placement status strip
    var statusEl = document.createElement('div');
    statusEl.id = 'tdcv-placement-status';
    statusEl.className = 'tdcv-placement-status tdcv-placement-status--idle';
    statusEl.textContent = 'Ready';
    bar.appendChild(statusEl);

    // Right: View Options toggle
    var viewOptBtn = document.createElement('button');
    viewOptBtn.id = 'tdcv-viewopt-btn';
    viewOptBtn.className = 'tdcv-btn tdcv-btn--viewopt';
    viewOptBtn.textContent = _viewOptionsOpen ? 'View Options ▲' : 'View Options ▼';
    viewOptBtn.addEventListener('click', function () {
      _viewOptionsOpen = !_viewOptionsOpen;
      viewOptBtn.textContent = _viewOptionsOpen ? 'View Options ▲' : 'View Options ▼';
      _rebuildViewOptionsPanel(container);
    });
    bar.appendChild(viewOptBtn);

    container.appendChild(bar);
    _updateAssetContext();
    _updatePlacementStrip();
    if (_viewOptionsOpen) _buildViewOptionsPanel(container);
  }

  // Render the selected asset label + Place on Map button into #tdcv-asset-context.
  function _updateAssetContext() {
    var ctx = document.getElementById('tdcv-asset-context');
    if (!ctx) return;
    ctx.innerHTML = '';
    if (!_defaultAssetId) return;

    var label = _defaultAssetId;
    var resolver = _resolver();
    if (resolver && resolver.list) {
      var entries = resolver.list();
      for (var i = 0; i < entries.length; i++) {
        var e = entries[i];
        if (e.assetId === _defaultAssetId || e.id === _defaultAssetId) {
          label = e.name || e.label || _defaultAssetId;
          break;
        }
      }
    }

    var labelEl = document.createElement('span');
    labelEl.className = 'tdcv-selected-asset-label';
    labelEl.textContent = 'Selected: ' + label;
    ctx.appendChild(labelEl);

    var placeBtn = document.createElement('button');
    placeBtn.id = 'tdcv-place-btn';
    placeBtn.className = 'tdcv-btn tdcv-btn--place' + (_placementMode ? ' tdcv-btn--active' : '');
    placeBtn.textContent = _placementMode ? 'Placing… (click map)' : 'Place on Map';
    placeBtn.title = 'Arm placement — then click map to place actor';
    placeBtn.addEventListener('click', function () { _setPlacementMode(!_placementMode); });
    ctx.appendChild(placeBtn);
  }

  // Build the View Options panel beneath the toolbar.
  function _buildViewOptionsPanel(container) {
    var existing = document.getElementById('tdcv-viewopt-panel');
    if (existing) existing.parentNode.removeChild(existing);

    var panel = document.createElement('div');
    panel.id = 'tdcv-viewopt-panel';
    panel.className = 'tdcv-viewopt-panel';

    // ── Look ──────────────────────────────────────────────────────────────────
    var lookRow = _voRow();
    lookRow.appendChild(_voLabel('Look'));
    var lookSel = document.createElement('select');
    lookSel.id = 'tdcv-look-sel';
    lookSel.className = 'tdcv-select tdcv-look-sel';
    lookSel.title = 'Map look preset (Studio authoring only — not published)';
    [
      ['authoring',       'Authoring'],
      ['broadcast-dark',  'Broadcast Dark'],
      ['night',           'Night'],
      ['tron',            'Tron'],
      ['illustration',    'Illustration'],
    ].forEach(function (pair) {
      var opt = document.createElement('option');
      opt.value = pair[0]; opt.textContent = pair[1];
      lookSel.appendChild(opt);
    });
    var lc0 = _lookCtrl();
    if (lc0 && lc0.getLook) lookSel.value = lc0.getLook() || 'authoring';
    lookSel.addEventListener('change', function () {
      var lc = _lookCtrl(); if (lc) lc.setLook(lookSel.value);
    });
    lookRow.appendChild(lookSel);
    panel.appendChild(lookRow);

    // ── Labels / Buildings / Actors toggles ───────────────────────────────────
    var toggleRow = _voRow();
    var lc1 = _lookCtrl();
    var opts = lc1 ? (lc1.getOptions ? lc1.getOptions() : {}) : {};

    var labelsBtn = document.createElement('button');
    labelsBtn.id = 'tdcv-toggle-labels';
    labelsBtn.className = 'tdcv-btn tdcv-btn--toggle' + (opts.labels !== false ? ' tdcv-btn--active' : '');
    labelsBtn.title = 'Toggle map labels (Studio-only)';
    labelsBtn.textContent = 'Labels';
    labelsBtn.addEventListener('click', function () {
      var lc = _lookCtrl(); if (!lc) return;
      var on = !lc.getOptions().labels;
      lc.setOption('labels', on);
      labelsBtn.classList.toggle('tdcv-btn--active', on);
    });
    toggleRow.appendChild(labelsBtn);

    var buildingsBtn = document.createElement('button');
    buildingsBtn.id = 'tdcv-toggle-buildings';
    buildingsBtn.className = 'tdcv-btn tdcv-btn--toggle' + (opts.buildings !== false ? ' tdcv-btn--active' : '');
    buildingsBtn.title = 'Toggle 3D building extrusions (Studio-only)';
    buildingsBtn.textContent = 'Buildings';
    buildingsBtn.addEventListener('click', function () {
      var lc = _lookCtrl(); if (!lc) return;
      var on = !lc.getOptions().buildings;
      lc.setOption('buildings', on);
      buildingsBtn.classList.toggle('tdcv-btn--active', on);
    });
    toggleRow.appendChild(buildingsBtn);

    var actorsBtn = document.createElement('button');
    actorsBtn.id = 'tdcv-toggle-actors';
    actorsBtn.className = 'tdcv-btn tdcv-btn--toggle' + (opts.actorOverlay !== false ? ' tdcv-btn--active' : '');
    actorsBtn.title = 'Toggle actor marker overlay (Studio-only)';
    actorsBtn.textContent = 'Actors';
    actorsBtn.addEventListener('click', function () {
      var lc = _lookCtrl(); if (!lc) return;
      var on = !lc.getOptions().actorOverlay;
      lc.setOption('actorOverlay', on);
      actorsBtn.classList.toggle('tdcv-btn--active', on);
    });
    toggleRow.appendChild(actorsBtn);
    panel.appendChild(toggleRow);

    // ── Actor filter ──────────────────────────────────────────────────────────
    var filterRow = _voRow();
    filterRow.appendChild(_voLabel('Show actors'));
    var filterSel = document.createElement('select');
    filterSel.id = 'tdcv-filter-sel';
    filterSel.className = 'tdcv-select';
    [
      ['all',       'All'],
      ['promoted',  'Promoted'],
      ['draft',     'Draft'],
      ['structure', 'Structures'],
    ].forEach(function (pair) {
      var opt = document.createElement('option');
      opt.value = pair[0]; opt.textContent = pair[1];
      if (pair[0] === _visibilityFilter) opt.selected = true;
      filterSel.appendChild(opt);
    });
    filterSel.addEventListener('change', function () {
      _visibilityFilter = filterSel.value;
      _applyActorVisibilityFilter();
    });
    filterRow.appendChild(filterSel);
    panel.appendChild(filterRow);

    // ── Visual detail mode ────────────────────────────────────────────────────
    var visualRow = _voRow();
    visualRow.appendChild(_voLabel('Proxy detail'));
    var visualSel = document.createElement('select');
    visualSel.id = 'tdcv-visual-sel';
    visualSel.className = 'tdcv-select';
    visualSel.title = 'Proxy detail mode (Studio-only, not published)';
    [['simple','Simple'],['readable','Readable'],['hero','Hero']].forEach(function (p) {
      var opt = document.createElement('option');
      opt.value = p[0]; opt.textContent = p[1];
      visualSel.appendChild(opt);
    });
    var savedMode = null;
    try { savedMode = localStorage.getItem('wos.studio.proxyDetailMode'); } catch (e) {}
    visualSel.value = (['simple','readable','hero'].indexOf(savedMode) !== -1) ? savedMode : 'readable';
    visualSel.addEventListener('change', function () {
      if (_rl) _rl.setProxyDetailMode(visualSel.value);
    });
    visualRow.appendChild(visualSel);
    panel.appendChild(visualRow);

    // ── Auth Scale ────────────────────────────────────────────────────────────
    var scaleRow = _voRow();
    scaleRow.appendChild(_voLabel('Auth scale'));
    var scaleBtn = document.createElement('button');
    scaleBtn.id = 'tdcv-scale-btn';
    scaleBtn.className = 'tdcv-btn tdcv-btn--toggle tdcv-btn--active';
    scaleBtn.title = 'Toggle authoring scale multiplier (Studio-only, not published)';
    scaleBtn.textContent = 'On';
    var savedScale = null;
    try { savedScale = localStorage.getItem('wos.studio.authoringScale'); } catch (e) {}
    if (savedScale === 'false') { scaleBtn.classList.remove('tdcv-btn--active'); scaleBtn.textContent = 'Off'; }
    scaleBtn.addEventListener('click', function () {
      var on = !scaleBtn.classList.contains('tdcv-btn--active');
      scaleBtn.classList.toggle('tdcv-btn--active', on);
      scaleBtn.textContent = on ? 'On' : 'Off';
      if (_rl) _rl.setAuthoringScaleEnabled(on);
    });
    scaleRow.appendChild(scaleBtn);
    panel.appendChild(scaleRow);

    // ── Selection target ──────────────────────────────────────────────────────
    var selRow = _voRow();
    selRow.appendChild(_voLabel('Select target'));
    var bselBtn = document.createElement('button');
    bselBtn.id = 'tdcv-bsel-btn';
    bselBtn.className = 'tdcv-btn tdcv-btn--toggle' + (_bsc && _bsc.isSelectionModeActive ? ' tdcv-btn--active' : '');
    bselBtn.textContent = 'Buildings';
    bselBtn.title = 'Toggle Building Selection Mode — click a 3D building extrusion to select it';
    bselBtn.addEventListener('click', function () {
      _setBuildingSelectionMode(_bsc ? !_bsc.isSelectionModeActive : false);
    });
    selRow.appendChild(bselBtn);
    panel.appendChild(selRow);

    // Insert immediately after the toolbar bar
    var toolbar = document.getElementById('tdcv-toolbar');
    if (toolbar && toolbar.nextSibling) {
      toolbar.parentNode.insertBefore(panel, toolbar.nextSibling);
    } else if (container) {
      container.appendChild(panel);
    }
  }

  function _rebuildViewOptionsPanel(container) {
    var existing = document.getElementById('tdcv-viewopt-panel');
    if (existing) existing.parentNode.removeChild(existing);
    if (_viewOptionsOpen) _buildViewOptionsPanel(container);
  }

  function _voRow() {
    var row = document.createElement('div');
    row.className = 'tdcv-vo-row';
    return row;
  }

  function _voLabel(text) {
    var lbl = document.createElement('span');
    lbl.className = 'tdcv-vo-label';
    lbl.textContent = text;
    return lbl;
  }

  // Duplicate/Delete moved to Inspector — toolbar no longer has these buttons.
  function _updateActionButtons(actor) {
    // Place-btn armed state is unaffected by actor selection.
    // Inspector handles Duplicate/Delete; no toolbar DOM update needed.
  }

  // Hint text removed from toolbar in 0617B.
  function _updateHint(text) {
    // Placement state is conveyed by the Place on Map button label.
    // Kept as no-op so existing callers don't break.
  }

  // ── Map container + drop target ──────────────────────────────────────────────
  function _buildMapContainer(container) {
    var mapEl = document.createElement('div');
    mapEl.id = 'tdcv-map';
    mapEl.style.cssText = 'flex:1;min-height:0;width:100%;position:relative;';
    container.appendChild(mapEl);

    mapEl.addEventListener('dragover', function (e) {
      var types = e.dataTransfer.types;
      var hasAsset = false;
      for (var i = 0; i < types.length; i++) { if (types[i] === 'application/wos-asset-id') hasAsset = true; }
      if (!hasAsset) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });

    mapEl.addEventListener('drop', function (e) {
      var assetId = e.dataTransfer.getData('application/wos-asset-id');
      if (!assetId || !_map) return;
      e.preventDefault();
      var rect = mapEl.getBoundingClientRect();
      var cx = e.clientX - rect.left;
      var cy = e.clientY - rect.top;
      try {
        var lngLat = _map.unproject([cx, cy]);
        var ctrl = _controller();
        if (!ctrl) return;
        var defaults = _placementDefaults(assetId);
        var result = ctrl.place(lngLat.lat, lngLat.lng, {
          assetId:       defaults.assetId,
          actorCategory: defaults.actorCategory,
          actorType:     defaults.actorType,
        });
        _lastPlacementResult = result.ok ? 'ok' : 'error';
        if (result.ok) {
          _addMarker(result.manifest);
          try { localStorage.setItem(LS_KEY_LAST_PLACE_CAT, defaults.actorCategory); } catch (err2) {}
        }
      } catch (err) {}
    });

    return mapEl;
  }

  // ── Enter / exit ─────────────────────────────────────────────────────────────
  function enter(stageBody) {
    stageBody.innerHTML = '';
    // 0619E: reset diag state on each entry
    _diagState.toolbarMounted          = false;
    _diagState.mapboxAvailable         = false;
    _diagState.mapboxMapReady          = false;
    _diagState.styleLoaded             = false;
    _diagState.buildingSelectionReady  = false;
    _diagState.actorRenderLayerReady   = false;
    _diagState.lastError               = null;

    // 0615F: restore last active placement asset (preference only — never manifests)
    if (!_defaultAssetId) {
      try {
        var savedAsset = localStorage.getItem(LS_KEY_ACTIVE_ASSET);
        if (savedAsset) _defaultAssetId = savedAsset;
      } catch (e) {}
    }

    var wrap = document.createElement('div');
    wrap.id = 'tdcv-wrap';
    wrap.style.cssText = 'display:flex;flex-direction:column;height:100%;width:100%;';
    stageBody.appendChild(wrap);

    _buildToolbar(wrap);
    _buildDiagStrip(wrap);
    var mapEl = _buildMapContainer(wrap);
    _mapContainerEl = mapEl;

    _diagState.mapboxAvailable = !!global.mapboxgl;
    _updateDiagStrip();

    if (!global.mapboxgl) {
      mapEl.innerHTML = '<div style="padding:16px;color:#e07070;font-size:.8rem;">Mapbox GL JS not loaded — check network.</div>';
      return;
    }

    // 0619F: token and initial style via access controller
    var access = global.WOSMapboxAccessController;
    var tokenResult = access ? access.resolveToken() : { ok: false, reason: 'access_controller_unavailable' };
    if (!tokenResult.ok) {
      _showMapAccessError('Studio Mapbox token missing — Broadcast token not available to Studio.', null);
      _diagState.lastError = 'missing_token';
      _updateDiagStrip();
      return;
    }
    global.mapboxgl.accessToken = tokenResult.value;

    // 0619F: always start with safe public style; custom look applied after load
    var initialStyle = access ? access.resolveInitialStyle() : 'mapbox://styles/mapbox/dark-v11';

    _map = new global.mapboxgl.Map({
      container: mapEl,
      style: initialStyle,
      center: [-74.044, 40.689],
      zoom: 13,
      attributionControl: false,
    });

    _map.addControl(new global.mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    global._wosMapInstance = _map; // 0619E: expose for console debugging

    // 0619E/F: register error handler BEFORE look controller init.
    _map.on('error', function (e) {
      var httpStatus = (e && e.error && e.error.status) ? e.error.status : null;
      var msg = (e && e.error)
        ? (e.error.message || (httpStatus ? 'HTTP ' + httpStatus : String(e.error)))
        : 'map error';
      _diagState.lastError = msg;
      _updateDiagStrip();
      console.warn('[ThreeDCanvasView] map error:', msg, e);
      // 0619F: record in access controller
      var access = global.WOSMapboxAccessController;
      if (access) access.recordMapError(httpStatus, msg);
      // Show visible failure banner — spec §Recovery Behavior
      if (!_diagState.styleLoaded) _showMapAccessError(msg, httpStatus);
    });

    // 0615C Patch 4A: init MapLookController immediately after map object creation,
    // not inside load — look state needs the map object, not the full render stack.
    var lc = _lookCtrl();
    if (lc) {
      lc.init(_map, {
        onStyleReload: _onLookStyleReload,
        onMapIdle:     _onLookMapIdle,
      });
    }

    _map.on('load', function () {
      _diagState.mapboxMapReady = true;
      _diagState.styleLoaded    = true;
      _diagState.lastError      = null;
      _clearStyleFailureBanner();
      _clearMapAccessError();
      _updateDiagStrip();
      // 0619F: record successful load in access controller
      var access = global.WOSMapboxAccessController;
      if (access) {
        var styleUrl = null;
        try { var s = _map.getStyle(); styleUrl = s ? (s.sprite || '').replace(/\/sprite.*$/, '') : null; } catch(e) {}
        access.recordStyleLoaded(styleUrl);
      }
      _loadActors();

      var l = _lod();
      if (l) l.init(_map);

      // Phase 7
      if (global.WOSMaterialOverrideController) {
        _matCtrl = new global.WOSMaterialOverrideController(null, _store(), global.WOSActorProxyGeometryFactory);
        global.WOSMaterialOverrideControllerInstance = _matCtrl;
      }

      // Phase 5
      if (global.WOSActorObjectRenderLayer && global.WOSActorProxyGeometryFactory) {
        _rl = new global.WOSActorObjectRenderLayer(_map, global.mapboxgl, {
          store:                _store(),
          resolver:             _resolver(),
          placementController:  _controller(),
          proxyFactory:         global.WOSActorProxyGeometryFactory,
          materialOverrideCtrl: _matCtrl,
        });
        if (_matCtrl) _matCtrl.setRenderLayer(_rl);
        _rl.mount();
        global._wosRLInstance = _rl; // 0615D: debug handle for visualAuthoring snapshot
        _diagState.actorRenderLayerReady = true;
        _updateDiagStrip();

        // 0616B: Shape Editor controller — chicken-and-egg wiring like Phase 7's matCtrl
        if (global.WOSProxyShapeEditorController) {
          _shapeCtrl = new global.WOSProxyShapeEditorController(_rl, global.WOSActorProxyGeometryFactory);
          global.WOSProxyShapeEditorControllerInstance = _shapeCtrl;
        }
        // 0616C: Object Material Authoring controller — same chicken-and-egg wiring
        if (global.WOSObjectMaterialAuthoringController) {
          _matAuthCtrl = new global.WOSObjectMaterialAuthoringController(_rl);
          global.WOSObjectMaterialAuthoringControllerInstance = _matAuthCtrl;
        }
        // 0615D: sync Visual dropdown and Scale button to restored localStorage prefs
        var vSel = document.getElementById('tdcv-visual-sel');
        if (vSel) vSel.value = _rl.getProxyDetailMode();
        var sBtn = document.getElementById('tdcv-scale-btn');
        if (sBtn) sBtn.classList.toggle('tdcv-btn--active', _rl.getAuthoringScaleEnabled());
      }

      // Phase 6
      if (global.WOSBuildingSelectionController) {
        _bsc = new global.WOSBuildingSelectionController(_map, _store());
        _diagState.buildingSelectionReady = true;
        _updateDiagStrip();
        global.WOSBuildingSelectionControllerInstance = _bsc;
        _bsc.on('select', function (sel) {
          document.dispatchEvent(new CustomEvent('wos:building-selected', { detail: sel }));
        });
        _bsc.on('deselect', function () {
          document.dispatchEvent(new CustomEvent('wos:building-deselected'));
        });
        _bsc.on('select-error', function (err) {
          _updateHint(err.message || 'Building cannot be selected.');
          setTimeout(function () { _updateHint('Click a 3D building to select it.'); }, 4000);
        });
        _bsc.on('mode-change', function (ev) {
          var btn = document.getElementById('tdcv-bsel-btn');
          if (btn) btn.classList.toggle('tdcv-btn--active', ev.active);
          if (ev.active) _updateHint('Click a 3D building to select it.');
          else _updateHint('Click "+ Place Actor", then click the map.');
        });
      }
      if (global.WOSBuildingReplacementLayer) {
        _brl = new global.WOSBuildingReplacementLayer(_map, _store());
        global.WOSBuildingReplacementLayerInstance = _brl;
        _brl.mount();
      }

      // 0615B: initialize location resolver and resolve all existing actors
      var locR = _locResolver();
      if (locR) {
        locR.init(_map, _store());
        // Resolve after map is idle so rendered features are available
        _map.once('idle', function () { locR.resync(); });
      }

      // 0615C: sync quick-toggle button states; call immediately so saved look is reflected
      document.addEventListener('wos:map-look-changed', _syncToggleBtns);
      _syncToggleBtns();
    });

    _map.on('click', _onMapClick);

    _map.on('mousemove', function (e) {
      if (_bsc && _bsc.isSelectionModeActive) {
        _bsc.handleMapMouseMove(e.point); // 0615E: hover highlight
        _updateHint('Click a 3D building to select it.');
      }
      else if (_placementMode) _updateHint('Click to place actor here.');
      else _updateHint('Click "+ Place Actor", then click the map.');
    });

    var g = _gizmo();
    if (g) {
      g.init(_map, mapEl);

      g.on('move', function (ev) {
        _updateMarkerPosition(ev.objectId, ev.lat, ev.lon);
        var l2 = _lod();
        if (l2) l2.moveTo(ev.lat, ev.lon);
        _updateHint('lat ' + ev.lat.toFixed(5) + '  lon ' + ev.lon.toFixed(5));
        if (_rl) _rl.setPreviewAnchor(ev.objectId, ev.lat, ev.lon);
      });

      g.on('commit', function (ev) {
        var store = _store();
        var actor = store && store.get(ev.objectId);
        if (actor) {
          _removeMarker(ev.objectId);
          _addMarker(actor);
          _highlightMarker(ev.objectId);
          g.show(actor);
        }
        _updateHint('Click "+ Place Actor", then click the map.');
        if (_rl && actor) _rl.onActorUpdated(actor);
        // 0615B: re-resolve location after anchor commit
        var locR2 = _locResolver();
        if (locR2 && actor) locR2.resolveActor(actor);
      });

      g.on('rotate', function (ev) {
        if (_rl) _rl.setPreviewHeading(ev.objectId, ev.headingDeg);
      });

      g.on('rotate-commit', function (ev) {
        var store = _store();
        var actor = store && store.get(ev.objectId);
        if (_rl && actor) _rl.onActorUpdated(actor);
      });
    }

    var ctrl = _controller();
    if (ctrl) {
      ctrl.on('select', _onControllerSelect);
      ctrl.on('remove', _onControllerRemove);
      ctrl.on('place',  _onControllerPlace);
    }

    var undo = global.WOSUndoRedoController;
    if (undo) {
      undo.on(function () {
        Object.keys(_markers).forEach(function (id) { _removeMarker(id); });
        var store = _store();
        if (store) store.list().forEach(function (a) { _addMarker(a); });
        var ctrl2 = _controller();
        var selId = ctrl2 && ctrl2.selectedObjectId();
        if (selId) _highlightMarker(selId);
        if (_rl) _rl.resync();
      });
    }
  }

  function exit() {
    document.removeEventListener('wos:map-look-changed', _syncToggleBtns);
    if (_map) {
      var ctrl = _controller();
      if (ctrl) {
        ctrl.off('select', _onControllerSelect);
        ctrl.off('remove', _onControllerRemove);
        ctrl.off('place',  _onControllerPlace);
      }
      var g = _gizmo(); if (g) g.hide();
      var l = _lod();   if (l) l.hide();
      if (_bsc) {
        _bsc.deactivateSelectionMode();
        _bsc.removeSelectionPaint();
        global.WOSBuildingSelectionControllerInstance = null;
        _bsc = null;
      }
      if (_brl) {
        _brl.unmount();
        global.WOSBuildingReplacementLayerInstance = null;
        _brl = null;
      }
      if (_matCtrl) {
        global.WOSMaterialOverrideControllerInstance = null;
        _matCtrl = null;
      }
      if (_shapeCtrl) {
        global.WOSProxyShapeEditorControllerInstance = null;
        _shapeCtrl = null;
      }
      if (_matAuthCtrl) {
        global.WOSObjectMaterialAuthoringControllerInstance = null;
        _matAuthCtrl = null;
      }
      if (_rl) { _rl.unmount(); _rl = null; global._wosRLInstance = null; }
      _map.remove();
      _map = null;
    }
    _markers = {};
    _placementMode = false;
    _mapContainerEl = null;
  }

  // ── Public API ────────────────────────────────────────────────────────────────
  function setActiveAsset(assetId) {
    _defaultAssetId = assetId || '';
    try { localStorage.setItem(LS_KEY_ACTIVE_ASSET, _defaultAssetId); } catch (e) {}
    _updateAssetContext();
  }

  function getActiveAsset() { return _defaultAssetId; }

  function armPlacement(assetId) {
    if (assetId !== undefined) setActiveAsset(assetId);
    _setPlacementMode(true);
  }

  // 0615F: debug/UI helpers — active asset's resolved category, armed state, last result
  function getActiveAssetCategory() {
    return _placementDefaults(_defaultAssetId || (_resolver() ? _resolver().placeholderAssetId() : '')).actorCategory;
  }

  function getActiveAssetResolved() {
    return _placementDefaults(_defaultAssetId || '').resolved;
  }

  function isPlacementArmed() { return _placementMode; }

  function getLastPlacementResult() { return _lastPlacementResult; }

  function refreshActor(objectId) {
    var store = _store();
    var actor = store && store.get(objectId);
    if (!actor) return;
    _removeMarker(objectId);
    _addMarker(actor);
    if (_rl) _rl.onActorUpdated(actor);
  }

  // 0616F: rebuild every placed actor that uses the given assetId so an
  // Update Custom Asset call re-renders all instances, not just the selected one.
  // Does not mutate manifests. Keeps the currently selected actor selected.
  function refreshActorsByAsset(assetId) {
    if (!assetId) return { ok: false, reason: 'no_assetId' };
    var store = _store();
    if (!store) return { ok: false, reason: 'store_unavailable' };
    var affected = store.list().filter(function (a) { return a.assetId === assetId; });
    affected.forEach(function (a) { refreshActor(a.objectId); });
    return { ok: true, refreshedCount: affected.length };
  }

  // Phase 8: discard all material drafts before publish
  function onPublish() {
    if (_matCtrl) {
      var store = global.WOSActorManifestStore;
      if (store) {
        store.list().forEach(function (actor) {
          _matCtrl.discardDraft(actor.objectId);
        });
      }
    }
  }

  // 0615: focusActor — fly map to actor anchor, select it, pulse its marker
  function focusActor(objectId, options) {
    options = options || {};
    var store = _store();
    var actor = store && store.get(objectId);
    if (!actor || !_map) return { ok: false, reason: 'actor_or_map_unavailable' };
    _map.flyTo({
      center:   [actor.anchor.lon, actor.anchor.lat],
      zoom:     options.zoom    != null ? options.zoom    : 17,
      pitch:    options.pitch   != null ? options.pitch   : 55,
      bearing:  options.bearing != null ? options.bearing : _map.getBearing(),
      essential: true,
      duration: options.duration != null ? options.duration : 650,
    });
    _selectActor(objectId);
    // Pulse after fly settles (or immediately if map isn't moving yet)
    _map.once('moveend', function () { _pulseMarker(objectId); });
    return { ok: true };
  }

  // 0615: actor visibility filter
  function setActorVisibilityFilter(filterKey) {
    _visibilityFilter = filterKey || 'all';
    var sel = document.getElementById('tdcv-filter-sel');
    if (sel) sel.value = _visibilityFilter;
    _applyActorVisibilityFilter();
    return _visibilityFilter;
  }

  function getActorVisibilityFilter() { return _visibilityFilter; }

  // ── 0619E: Map Surface Diagnostic Strip ────────────────────────────────────
  var _diagState = {
    toolbarMounted:              false,
    mapboxAvailable:             false,
    mapboxMapReady:              false,
    styleLoaded:                 false,
    buildingSelectionReady:      false,
    actorRenderLayerReady:       false,
    lastError:                   null,
  };

  function _buildDiagStrip(container) {
    var strip = document.createElement('div');
    strip.id = 'tdcv-diag-strip';
    strip.className = 'tdcv-diag-strip';
    container.appendChild(strip);
    _diagState.toolbarMounted = true;
    _updateDiagStrip();
  }

  function _updateDiagStrip() {
    var strip = document.getElementById('tdcv-diag-strip');
    if (!strip) return;
    var s = _diagState;
    var items = [
      { key: 'toolbar',   label: 'toolbar mounted',        ok: s.toolbarMounted },
      { key: 'mapbox',    label: 'mapbox available',       ok: s.mapboxAvailable },
      { key: 'mapready',  label: 'map loaded',             ok: s.mapboxMapReady },
      { key: 'style',     label: 'style loaded',           ok: s.styleLoaded },
      { key: 'bsel',      label: 'building selection ready', ok: s.buildingSelectionReady },
      { key: 'rl',        label: 'render layer ready',     ok: s.actorRenderLayerReady },
    ];
    var allReady = items.every(function (i) { return i.ok; });
    strip.innerHTML = '';
    if (allReady) {
      strip.classList.add('tdcv-diag-strip--all-ready');
      return;
    }
    strip.classList.remove('tdcv-diag-strip--all-ready');
    strip.appendChild((function () {
      var lbl = document.createElement('span');
      lbl.className = 'tdcv-diag-item';
      lbl.textContent = 'Map Surface:';
      return lbl;
    })());
    items.forEach(function (item) {
      var span = document.createElement('span');
      span.className = 'tdcv-diag-item ' + (item.ok ? 'tdcv-diag-item--ok' : 'tdcv-diag-item--warn');
      span.textContent = (item.ok ? '✓ ' : '· ') + item.label;
      strip.appendChild(span);
    });
    if (s.lastError) {
      var errSpan = document.createElement('span');
      errSpan.className = 'tdcv-diag-item tdcv-diag-item--error';
      errSpan.textContent = '⚠ ' + s.lastError;
      strip.appendChild(errSpan);
    }
  }

  // ── 0619F: Map access error banner ───────────────────────────────────────────
  // Spec-prescribed classes: .tdcv-map-access-error / -title / -body / -action
  function _showMapAccessError(msg, httpStatus) {
    var mapEl = document.getElementById('tdcv-map');
    if (!mapEl) return;
    _clearMapAccessError();
    _clearStyleFailureBanner();
    var banner = document.createElement('div');
    banner.id = 'tdcv-map-access-error';
    banner.className = 'tdcv-map-access-error';
    var title = document.createElement('div');
    title.className = 'tdcv-map-access-error-title';
    title.textContent = httpStatus === 401 || httpStatus === 403
      ? 'Mapbox access error — ' + httpStatus + ' Unauthorized'
      : 'Map style failed to load';
    var body = document.createElement('div');
    body.className = 'tdcv-map-access-error-body';
    body.textContent = msg
      ? msg
      : 'Token/style request failed. Check SBE.MapboxToken or use a public authoring style.';
    var retryBtn = document.createElement('button');
    retryBtn.className = 'tdcv-map-access-error-action';
    retryBtn.textContent = 'Retry Safe Style';
    retryBtn.addEventListener('click', function () {
      _clearMapAccessError();
      if (_map) {
        _diagState.styleLoaded = false;
        _map.setStyle('mapbox://styles/mapbox/dark-v11');
        _map.once('styledata', function () {
          _diagState.styleLoaded    = true;
          _diagState.mapboxMapReady = true;
          _diagState.lastError      = null;
          var access = global.WOSMapboxAccessController;
          if (access) access.recordStyleLoaded('mapbox://styles/mapbox/dark-v11');
          _updateDiagStrip();
        });
      }
    });
    banner.appendChild(title);
    banner.appendChild(body);
    banner.appendChild(retryBtn);
    mapEl.appendChild(banner);
  }

  function _clearMapAccessError() {
    var el = document.getElementById('tdcv-map-access-error');
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  // Legacy alias kept so any existing call-sites still work
  function _showStyleFailureBanner(msg) { _showMapAccessError(msg, null); }
  function _clearStyleFailureBanner()   { _clearMapAccessError(); }

  function getMapSurfaceSnapshot() {
    var mapLoaded = false;
    var layerCount = 0;
    var styleName = null;
    var activeStyle = null;
    var buildingLayers = [];
    if (_map) {
      try { mapLoaded = _map.loaded(); } catch (e) {}
      try {
        var s = _map.getStyle();
        if (s) {
          layerCount  = s.layers ? s.layers.length : 0;
          styleName   = s.name || null;
          activeStyle = (s.sprite || '').replace(/\/sprite.*$/, '') || null;
          buildingLayers = (s.layers || []).filter(function(l) {
            return l.type === 'fill-extrusion' || (l.id && l.id.indexOf('building') !== -1);
          }).map(function(l) { return l.id; });
        }
      } catch (e) {}
    }
    var access = global.WOSMapboxAccessController;
    var accessSnap = access ? access.getSnapshot() : null;
    return {
      enabled:                    true,
      mode:                       'map',
      mapMounted:                 !!_mapContainerEl,
      toolbarMounted:             _diagState.toolbarMounted,
      viewOptionsButtonMounted:   !!document.getElementById('tdcv-viewopt-btn'),
      viewOptionsPanelMounted:    !!document.getElementById('tdcv-viewopt-panel'),
      mapboxAvailable:            _diagState.mapboxAvailable,
      mapboxMapReady:             _diagState.mapboxMapReady || mapLoaded,
      styleLoaded:                _diagState.styleLoaded || mapLoaded,
      layerCount:                 layerCount,
      styleName:                  styleName,
      activeStyle:                activeStyle,
      buildingLayers:             buildingLayers,
      tokenPresent:               accessSnap ? accessSnap.tokenPresent  : null,
      tokenSource:                accessSnap ? accessSnap.tokenSource   : null,
      tokenPreview:               accessSnap ? accessSnap.tokenPreview  : null,
      mapboxAccessStatus:         accessSnap ? accessSnap.lastStatus    : null,
      lastErrorStatus:            accessSnap ? accessSnap.lastErrorStatus : (_diagState.lastError ? null : null),
      customStyleAllowed:         accessSnap ? accessSnap.customStyleAllowed : null,
      buildingSelectionReady:     _diagState.buildingSelectionReady,
      buildingSelectionActive:    !!(_bsc && _bsc.isSelectionModeActive),
      actorRenderLayerReady:      _diagState.actorRenderLayerReady,
      selectedBuilding:           null,
      lastError:                  _diagState.lastError,
    };
  }

  // 0618C: returns Studio-side Three.js preview object for the building bound to selection.
  // Tries: replacement actor object → null (explicit fallback to caller).
  function getBuildingPreviewObject3D(selection) {
    if (!selection || !selection.featureId) return null;
    var store = _store();
    if (!store || !_rl) return null;
    var boundActor = null;
    store.list().forEach(function (a) {
      if (a.actorCategory === 'structure' && a.structure &&
          String(a.structure.mapboxFeatureId) === String(selection.featureId)) {
        boundActor = a;
      }
    });
    if (!boundActor) return null;
    return _rl.getObject3D(boundActor.objectId) || null;
  }

  global.WOSThreeDCanvasView = {
    enter:                    enter,
    exit:                     exit,
    setActiveAsset:           setActiveAsset,
    getActiveAsset:           getActiveAsset,
    armPlacement:             armPlacement,
    refreshActor:             refreshActor,
    refreshActorsByAsset:     refreshActorsByAsset,
    onPublish:                onPublish,
    focusActor:               focusActor,
    setActorVisibilityFilter: setActorVisibilityFilter,
    getActorVisibilityFilter:    getActorVisibilityFilter,
    // 0618C
    getBuildingPreviewObject3D:  getBuildingPreviewObject3D,
    // 0619E
    getMapSurfaceSnapshot:       getMapSurfaceSnapshot,
    // 0619G
    getPlacementSnapshot:        getPlacementSnapshot,
    // 0615F
    getActiveAssetCategory:   getActiveAssetCategory,
    getActiveAssetResolved:   getActiveAssetResolved,
    isPlacementArmed:         isPlacementArmed,
    getLastPlacementResult:   getLastPlacementResult,
  };
  console.log('[ThreeDCanvasView] ready — 0615F asset placement library pass');
})(window);
