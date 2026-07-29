// ── WOSMapsGallery v1.0.0 ─────────────────────────────────────────────────────
// 0729B_MAPS_Studio_Integration_Recovery
// Status: active | Classification: maps-ui (gallery)
//
// Full-width palette gallery for the MAPS product (wall/maps/). Structurally
// modeled on MUSIC's Library grid (music/src/ui/CollectionGrid.tsx +
// PlaylistsGrid.tsx) — large cards, real preview art, title, swatch row — but
// implemented fresh here, not imported from Studio or MUSIC.
//
// Owns exactly ONE shared, offscreen/dockable Mapbox preview instance — used
// both to render per-card thumbnails (cached, invalidated on change) and,
// docked into the detail page, as the live single-palette preview. This is
// NOT a second independent map runtime — it's a lightweight preview canvas
// reading the same SBE.MapsPaletteAuthority/Registry the live Broadcast map
// uses; no world/traffic/actor systems are duplicated.
//
// Placement: wall/maps/palettesGallery.js
// Load: AFTER mapsPaletteAuthority.js and paletteDetail.js, BEFORE mapsShell.js.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var doc = global.document;

  var WOS_STYLE       = 'mapbox://styles/studiorich/cm3goyx23003901qkb60ff29p';
  var PREVIEW_CENTER  = [-74.0165, 40.7015];
  var PREVIEW_ZOOM    = 12.8;
  var PREVIEW_BEARING = -12;
  var PREVIEW_PITCH   = 30;
  var MAP_LOAD_TIMEOUT_MS = 15000;

  var _map              = null;
  var _mapEl             = null;
  var _offscreenHolder   = null;
  var _thumbCache        = {};
  var _contentEl         = null;
  var _selectedPaletteId = null;
  var _pendingReadyCallbacks = [];
  var _ready             = false;

  function _el(tag, cls, text) {
    var e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // Tears down a stuck/incomplete map instance so a genuinely new Map() gets
  // created on the next _ensurePreviewMap() call. Without this, retrying
  // after a stalled style load just re-awaits the SAME stuck instance —
  // clicking Retry must actually retry, not just wait longer on the same one.
  function _discardStuckMap() {
    if (_map) { try { _map.remove(); } catch (e) {} }
    _map = null;
    _ready = false;
    if (_offscreenHolder && _offscreenHolder.parentNode) _offscreenHolder.parentNode.removeChild(_offscreenHolder);
    _offscreenHolder = null;
    _mapEl = null;
  }

  // ── Shared preview map lifecycle ──────────────────────────────────────────
  function _ensurePreviewMap(onReady) {
    if (_ready) { onReady(_map); return; }
    _pendingReadyCallbacks.push(onReady);
    if (_map) return;

    if (!global.mapboxgl) { _flushReady(null); return; }
    var token = (global.SBE && global.SBE.MapboxToken) || global.MAPBOX_TOKEN || '';
    if (!token) { _flushReady(null); return; }
    global.mapboxgl.accessToken = token;

    _offscreenHolder = _el('div', 'mp-offscreen-holder');
    _offscreenHolder.style.cssText = 'position:fixed; left:-9999px; top:0; width:480px; height:320px;';
    doc.body.appendChild(_offscreenHolder);

    _mapEl = _el('div', 'mp-live-map');
    _mapEl.style.cssText = 'width:100%; height:100%;';
    _offscreenHolder.appendChild(_mapEl);

    try {
      _map = new global.mapboxgl.Map({
        container: _mapEl,
        style: WOS_STYLE,
        center: PREVIEW_CENTER,
        zoom: PREVIEW_ZOOM,
        bearing: PREVIEW_BEARING,
        pitch: PREVIEW_PITCH,
        attributionControl: false,
        preserveDrawingBuffer: true,
      });
    } catch (e) {
      console.warn('[WOSMapsGallery] preview map creation failed:', e && e.message || e);
      _flushReady(null);
      return;
    }

    _map.on('error', function (e) {
      console.warn('[WOSMapsGallery] preview map error:', e && e.error && e.error.message);
    });

    // style.load, not the full load/tile-decode event — the registry only
    // ever calls getStyle()/getLayer()/setPaintProperty(), none of which need
    // tiles to have arrived.
    _map.on('style.load', function () {
      var authority = global.SBE && global.SBE.MapsPaletteAuthority;
      if (authority && !authority.isInitialized()) authority.init(_map);
      _ready = true;
      _flushReady(_map);
    });
  }

  function _flushReady(map) {
    var cbs = _pendingReadyCallbacks;
    _pendingReadyCallbacks = [];
    cbs.forEach(function (fn) { try { fn(map); } catch (e) {} });
  }

  function dockPreviewMap(containerEl) {
    _ensurePreviewMap(function (map) {
      if (!map || !_mapEl) return;
      containerEl.appendChild(_mapEl);
      map.resize();
    });
  }

  function undockPreviewMap() {
    if (_mapEl && _offscreenHolder && _mapEl.parentNode !== _offscreenHolder) {
      _offscreenHolder.appendChild(_mapEl);
      if (_map) _map.resize();
    }
  }

  function invalidateThumbnail(paletteId) { delete _thumbCache[paletteId]; }

  function _captureThumbnail(paletteId, done) {
    if (_thumbCache[paletteId]) { done(_thumbCache[paletteId]); return; }
    _ensurePreviewMap(function (map) {
      if (!map) { done(null); return; }
      var authority = global.SBE.MapsPaletteAuthority;
      undockPreviewMap();
      authority.previewPalette(paletteId);
      map.once('idle', function () {
        var dataUrl = null;
        try { dataUrl = map.getCanvas().toDataURL('image/png'); } catch (e) {}
        if (dataUrl) _thumbCache[paletteId] = dataUrl;
        authority.endPreview();
        done(dataUrl);
      });
      map.triggerRepaint();
    });
  }

  // ── Gallery ────────────────────────────────────────────────────────────────
  function _renderGallery(body) {
    body.innerHTML = '';
    var authority = global.SBE.MapsPaletteAuthority;
    if (!authority) { body.appendChild(_el('div', 'maps-error', 'MapsPaletteAuthority not loaded.')); return; }

    var toolbar = _el('div', 'mg-toolbar');
    toolbar.appendChild(_el('div', 'mg-title', 'Palettes'));
    var newBtn = _el('button', 'mg-new-btn', '+ New Palette');
    newBtn.type = 'button';
    newBtn.addEventListener('click', function () {
      var p = authority.createPalette();
      invalidateThumbnail(p.id);
      _openDetail(p.id);
    });
    toolbar.appendChild(newBtn);
    body.appendChild(toolbar);

    var palettes = authority.listPalettes();
    if (!palettes.length) {
      body.appendChild(_el('div', 'mg-empty', 'No palettes yet.'));
      return;
    }

    var grid = _el('div', 'mg-grid');
    body.appendChild(grid);
    var activeId = authority.getActiveId();
    palettes.forEach(function (p) { grid.appendChild(_buildCard(p, activeId)); });
  }

  function _representativeSwatchColors(p) {
    var authority = global.SBE.MapsPaletteAuthority;
    var registry  = authority.getRegistry();
    var seen = {};
    var colors = [];
    registry.forEach(function (r) {
      if (seen[r.group]) return;
      seen[r.group] = true;
      var v = p.values[r.id];
      var display = (typeof v === 'string' && /^#|^rgba?\(/i.test(v)) ? v : (r.displayColor || '#666');
      colors.push(display);
    });
    return colors.slice(0, 8);
  }

  function _buildCard(p, activeId) {
    var authority = global.SBE.MapsPaletteAuthority;
    var isActive = p.id === activeId;
    var card = _el('div', 'mg-card' + (isActive ? ' mg-card--active' : ''));

    var art = _el('div', 'mg-card-art');
    var img = doc.createElement('img');
    img.className = 'mg-card-art-img';
    img.alt = p.title;
    art.appendChild(img);
    if (isActive) {
      var star = _el('span', 'mg-star', '★');
      star.title = 'Active palette';
      art.appendChild(star);
    }
    card.appendChild(art);

    _captureThumbnail(p.id, function (dataUrl) { if (dataUrl) img.src = dataUrl; });

    var info = _el('div', 'mg-card-info');
    info.appendChild(_el('div', 'mg-card-title', p.title));
    var swatches = _el('div', 'mg-card-swatches');
    _representativeSwatchColors(p).forEach(function (color) {
      var sw = _el('span', 'mg-card-swatch');
      sw.style.background = color;
      swatches.appendChild(sw);
    });
    info.appendChild(swatches);
    card.appendChild(info);

    var actions = _el('div', 'mg-card-actions');
    var dupBtn = _el('button', 'mg-icon-btn', '⧉');
    dupBtn.type = 'button';
    dupBtn.title = 'Duplicate';
    dupBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      var copy = authority.duplicatePalette(p.id);
      if (copy) { invalidateThumbnail(copy.id); _renderGallery(_contentEl); }
    });
    actions.appendChild(dupBtn);

    if (!isActive) {
      var activateBtn = _el('button', 'mg-icon-btn', '✓');
      activateBtn.type = 'button';
      activateBtn.title = 'Set Active';
      activateBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        authority.activatePalette(p.id);
        _renderGallery(_contentEl);
      });
      actions.appendChild(activateBtn);
    }
    card.appendChild(actions);

    card.addEventListener('click', function () { _openDetail(p.id); });
    return card;
  }

  function _openDetail(paletteId) {
    _selectedPaletteId = paletteId;
    if (global.WOSMapsPaletteDetail) {
      global.WOSMapsPaletteDetail.render(_contentEl, paletteId, {
        onBack: function () {
          undockPreviewMap();
          _selectedPaletteId = null;
          _renderGallery(_contentEl);
        },
        onChanged: function (id) { invalidateThumbnail(id != null ? id : paletteId); },
      });
    }
  }

  // ── Public entry (called by mapsShell.js) ─────────────────────────────────
  function enter(contentEl) {
    _contentEl = contentEl;
    var authority = global.SBE.MapsPaletteAuthority;
    if (authority && authority.isInitialized()) { _showCurrent(); return; }

    contentEl.innerHTML = '';
    contentEl.appendChild(_el('div', 'maps-loading', 'Loading palette system…'));

    var timedOut = false;
    var timer = global.setTimeout(function () {
      timedOut = true;
      if (_contentEl !== contentEl) return;
      contentEl.innerHTML = '';
      var msg = _el('div', 'maps-error');
      msg.appendChild(_el('div', null, 'Preview map is taking longer than expected'));
      var retryBtn = _el('button', 'maps-error-retry', 'Retry');
      retryBtn.addEventListener('click', function () { _discardStuckMap(); enter(contentEl); });
      msg.appendChild(retryBtn);
      contentEl.appendChild(msg);
    }, MAP_LOAD_TIMEOUT_MS);

    _ensurePreviewMap(function () {
      global.clearTimeout(timer);
      if (timedOut || _contentEl !== contentEl) return;
      _showCurrent();
    });
  }

  function _showCurrent() {
    if (_selectedPaletteId) _openDetail(_selectedPaletteId);
    else _renderGallery(_contentEl);
  }

  global.WOSMapsGallery = {
    enter: enter,
    dockPreviewMap: dockPreviewMap,
    undockPreviewMap: undockPreviewMap,
    retry: function () { _discardStuckMap(); if (_contentEl) enter(_contentEl); },
  };

  console.log('[WOSMapsGallery] loaded');

})(window);
