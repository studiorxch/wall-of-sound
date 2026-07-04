// ── WOS LibraryController ─────────────────────────────────────────────────────
// 0613 Phase 3 · 0615 Readability Pass
// Library panel: search filter, drag initiation, badge rendering, actor filter.
// Does NOT own the panel DOM — StudioShell owns the container.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var _searchQuery = '';
  var _listeners = { search: [] };

  function _store()    { return global.WOSActorManifestStore; }
  function _resolver() { return global.WOSAssetResolver; }
  function _emit(ev, data) {
    (_listeners[ev] || []).forEach(function (fn) { try { fn(data); } catch (e) {} });
  }

  // ── Badge ────────────────────────────────────────────────────────────────────
  function makeBadge(promoted) {
    var span = document.createElement('span');
    span.className = promoted ? 'lib-badge lib-badge--promoted' : 'lib-badge lib-badge--draft';
    span.textContent = promoted ? 'Promoted' : 'Draft';
    return span;
  }

  // ── Search filter ────────────────────────────────────────────────────────────
  function matchesSearch(text, query) {
    if (!query) return true;
    return text.toLowerCase().indexOf(query.toLowerCase()) !== -1;
  }

  function filterAssets(assets, query) {
    if (!query) return assets;
    return assets.filter(function (a) {
      return matchesSearch(a.name || a.assetId, query) || matchesSearch(a.category || '', query);
    });
  }

  function filterActors(actors, query) {
    if (!query) return actors;
    return actors.filter(function (a) {
      // 0615B: include location searchText from resolver session cache
      var loc = global.WOSActorLocationResolver && global.WOSActorLocationResolver.get(a.objectId);
      var locationText = (loc && loc.searchText) || '';
      return matchesSearch(a.assetId || '', query) ||
             matchesSearch(a.actorCategory || '', query) ||
             matchesSearch((a.meta && a.meta.displayLabel) || '', query) ||
             matchesSearch(a.objectId || '', query) ||
             matchesSearch(locationText, query);
    });
  }

  // 0615: filter actors by the canvas visibility filter key (mirrors threeDCanvasView logic)
  function filterActorsByVisibility(actors, filterKey) {
    if (!filterKey || filterKey === 'all') return actors;
    return actors.filter(function (a) {
      var meta     = a.meta || {};
      var promoted = meta.promoted;
      var state    = meta.lifecycleState;
      if (filterKey === 'draft')     return !promoted && state !== 'RETIRED';
      if (filterKey === 'promoted')  return promoted || state === 'PROMOTED';
      if (filterKey === 'structure') return a.actorCategory === 'structure';
      if (filterKey === 'vehicle')   return a.actorCategory === 'vehicle';
      if (filterKey === 'maritime')  return a.actorCategory === 'marine' || a.actorCategory === 'maritime';
      if (filterKey === 'prop')      return a.actorCategory === 'prop';
      return true;
    });
  }

  // ── Drag initiation ───────────────────────────────────────────────────────────
  function makeDraggable(el, assetId) {
    el.draggable = true;
    el.addEventListener('dragstart', function (e) {
      e.dataTransfer.setData('application/wos-asset-id', assetId);
      e.dataTransfer.effectAllowed = 'copy';
    });
  }

  // ── Search input builder ─────────────────────────────────────────────────────
  function buildSearchInput(container, onSearch) {
    var wrap = document.createElement('div');
    wrap.className = 'lib-search-wrap';
    var inp = document.createElement('input');
    inp.type = 'search';
    inp.placeholder = 'Search assets and actors…';
    inp.className = 'lib-search-input';
    inp.value = _searchQuery;
    inp.addEventListener('input', function () {
      _searchQuery = inp.value;
      _emit('search', _searchQuery);
      if (onSearch) onSearch(_searchQuery);
    });
    wrap.appendChild(inp);
    container.insertBefore(wrap, container.firstChild);
    return inp;
  }

  // ── Public API ────────────────────────────────────────────────────────────────
  var Controller = {
    searchQuery:             function () { return _searchQuery; },
    setSearch:               function (q) { _searchQuery = q; },
    filterAssets:            filterAssets,
    filterActors:            filterActors,
    filterActorsByVisibility: filterActorsByVisibility,
    makeBadge:               makeBadge,
    makeDraggable:           makeDraggable,
    buildSearchInput:        buildSearchInput,
    on:  function (ev, fn) { if (_listeners[ev]) _listeners[ev].push(fn); },
    off: function (ev, fn) { if (_listeners[ev]) _listeners[ev] = _listeners[ev].filter(function (f) { return f !== fn; }); },
  };

  global.WOSLibraryController = Controller;
  console.log('[LibraryController] ready — 0615 readability pass');
})(window);
