// ── WOSMapsPaletteDetail v1.0.0 ───────────────────────────────────────────────
// 0729B_MAPS_Studio_Integration_Recovery
// Status: active | Classification: maps-ui (detail)
//
// Full-width palette detail page — replaces the gallery entirely (no
// Library/Stage/Inspector columns). Breadcrumb back to Palettes, a large
// docked live preview (the one shared Mapbox instance owned by
// WOSMapsGallery), inline-editable title (Default included — it's a real,
// named, inspectable palette, not locked infrastructure), grouped
// wired-property grid with inline hex editing (hex shown only while editing),
// and a compact, collapsed-by-default "Discovered, not yet editable" panel.
//
// Placement: wall/maps/paletteDetail.js
// Load: BEFORE palettesGallery.js (which references global.WOSMapsPaletteDetail).
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var doc = global.document;

  function _el(tag, cls, text) {
    var e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function _isColorString(v) {
    return typeof v === 'string' && /^#|^rgba?\(|^hsla?\(/i.test(v);
  }

  function _toHexForInput(color) {
    if (/^#[0-9a-fA-F]{6}$/.test(color || '')) return color;
    if (/^#[0-9a-fA-F]{3}$/.test(color || '')) {
      return '#' + color.slice(1).split('').map(function (c) { return c + c; }).join('');
    }
    var m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(color || '');
    if (m) {
      return '#' + [m[1], m[2], m[3]].map(function (n) {
        return ('0' + parseInt(n, 10).toString(16)).slice(-2);
      }).join('');
    }
    return '#888888';
  }

  function render(contentEl, paletteId, ctx) {
    var authority = global.SBE && global.SBE.MapsPaletteAuthority;
    contentEl.innerHTML = '';
    if (!authority) { contentEl.appendChild(_el('div', 'maps-error', 'MapsPaletteAuthority not loaded.')); return; }

    var palette = authority.getPalette(paletteId);
    if (!palette) { contentEl.appendChild(_el('div', 'maps-error', 'Palette not found.')); return; }

    var activeId  = authority.getActiveId();
    var previewId = authority.getPreviewId();
    var isActive  = paletteId === activeId;
    var isPreviewing = paletteId === previewId;

    function rerender() { render(contentEl, paletteId, ctx); }

    // ── Header ──────────────────────────────────────────────────────────────
    var header = _el('div', 'md-header');

    var crumb = _el('div', 'md-breadcrumb');
    var backLink = _el('a', null, '← Palettes');
    backLink.href = '#';
    backLink.addEventListener('click', function (e) { e.preventDefault(); ctx.onBack(); });
    crumb.appendChild(backLink);
    header.appendChild(crumb);

    var titleRow = _el('div', 'md-title-row');
    titleRow.appendChild(_buildTitle(authority, palette, rerender));
    if (isActive) {
      var star = _el('span', 'mg-star mg-star--lg', '★');
      star.title = 'Active palette';
      titleRow.appendChild(star);
    }
    header.appendChild(titleRow);

    var actions = _el('div', 'md-actions');

    var previewBtn = _el('button', 'md-btn', isPreviewing ? 'Stop Preview' : 'Preview');
    previewBtn.type = 'button';
    previewBtn.addEventListener('click', function () {
      if (isPreviewing) authority.endPreview();
      else authority.previewPalette(paletteId);
      rerender();
    });
    actions.appendChild(previewBtn);

    var dupBtn = _el('button', 'md-btn', 'Duplicate');
    dupBtn.type = 'button';
    dupBtn.addEventListener('click', function () {
      var copy = authority.duplicatePalette(paletteId);
      if (copy) { ctx.onChanged(copy.id); ctx.onBack(); }
    });
    actions.appendChild(dupBtn);

    if (isActive) {
      actions.appendChild(_el('span', 'md-active-label', 'Active'));
    } else {
      var activateBtn = _el('button', 'md-btn md-btn--primary', 'Set Active');
      activateBtn.type = 'button';
      activateBtn.addEventListener('click', function () {
        authority.activatePalette(paletteId);
        rerender();
      });
      actions.appendChild(activateBtn);
    }
    header.appendChild(actions);
    contentEl.appendChild(header);

    // ── Live preview (docked shared Mapbox instance) ───────────────────────
    var previewWrap = _el('div', 'md-preview');
    contentEl.appendChild(previewWrap);
    if (global.WOSMapsGallery && global.WOSMapsGallery.dockPreviewMap) {
      global.WOSMapsGallery.dockPreviewMap(previewWrap);
    } else {
      previewWrap.appendChild(_el('div', 'maps-error', 'Preview map unavailable.'));
    }

    // ── Swatch summary ──────────────────────────────────────────────────────
    var registry = authority.getRegistry();
    var summary  = _el('div', 'md-swatch-summary');
    var seenGroups = {};
    registry.forEach(function (r) {
      if (seenGroups[r.group]) return;
      seenGroups[r.group] = true;
      var v = palette.values[r.id];
      var display = _isColorString(v) ? v : (r.displayColor || '#666');
      var sw = _el('span', 'md-swatch-chip');
      sw.style.background = display;
      sw.title = r.group;
      summary.appendChild(sw);
    });
    contentEl.appendChild(summary);

    // ── Grouped property grid ───────────────────────────────────────────────
    var groups = {};
    var order  = [];
    registry.forEach(function (r) {
      if (!groups[r.group]) { groups[r.group] = []; order.push(r.group); }
      groups[r.group].push(r);
    });

    var grid = _el('div', 'md-grid');
    order.forEach(function (groupName) {
      var panel = _el('div', 'md-group-panel');
      panel.appendChild(_el('div', 'md-group-title', groupName));
      var rows = _el('div', 'md-group-rows');
      groups[groupName].forEach(function (r) {
        rows.appendChild(_buildPropertyRow(r, palette, function () {
          ctx.onChanged(paletteId);
          rerender();
        }));
      });
      panel.appendChild(rows);
      grid.appendChild(panel);
    });
    contentEl.appendChild(grid);

    // ── Discovered, not yet editable (secondary, collapsed by default) ─────
    var deferred = authority.getDeferredAudit();
    var deferredWrap = doc.createElement('details');
    deferredWrap.className = 'md-deferred';
    var summaryEl = doc.createElement('summary');
    summaryEl.className = 'md-deferred-summary';
    summaryEl.textContent = 'Discovered, not yet editable (' + deferred.length + ')';
    deferredWrap.appendChild(summaryEl);
    var deferredList = _el('div', 'md-deferred-list');
    deferred.forEach(function (d) {
      var row = _el('div', 'md-deferred-row');
      row.appendChild(_el('span', 'md-deferred-label', d.label));
      row.appendChild(_el('span', 'md-deferred-status md-deferred-status--' + d.status, d.status));
      row.appendChild(_el('span', 'md-deferred-owner', d.ownerModule));
      deferredList.appendChild(row);
    });
    deferredWrap.appendChild(deferredList);
    contentEl.appendChild(deferredWrap);
  }

  // Title is editable inline for every palette, including Default — Default
  // is a real, named, inspectable palette, not locked infrastructure.
  function _buildTitle(authority, palette, onRenamed) {
    var h2 = _el('h2', 'md-title', palette.title);
    h2.title = 'Click to rename';
    h2.addEventListener('click', function () {
      var input = doc.createElement('input');
      input.type = 'text';
      input.className = 'md-title-input';
      input.value = palette.title;
      h2.replaceWith(input);
      input.focus();
      input.select();

      function commit() {
        var next = input.value.trim();
        if (next && next !== palette.title) authority.renamePalette(palette.id, next);
        onRenamed();
      }
      input.addEventListener('blur', commit);
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        else if (e.key === 'Escape') { input.value = palette.title; input.blur(); }
      });
    });
    return h2;
  }

  function _buildPropertyRow(record, palette, onEdited) {
    var authority = global.SBE.MapsPaletteAuthority;
    var row = _el('div', 'md-property-row');
    row.appendChild(_el('span', 'md-property-label', record.label));

    var value   = palette.values[record.id];
    var display = _isColorString(value) ? value : (record.displayColor || '#666');

    var swatch = _el('button', 'md-property-swatch');
    swatch.type = 'button';
    swatch.style.background = display;
    swatch.title = record.label;
    row.appendChild(swatch);

    var editorRow = _el('div', 'md-property-editor');
    editorRow.style.display = 'none';
    var input = doc.createElement('input');
    input.type = 'color';
    input.value = _toHexForInput(display);
    var hexLabel = _el('span', 'md-property-hex', display);
    editorRow.appendChild(input);
    editorRow.appendChild(hexLabel);
    row.appendChild(editorRow);

    swatch.addEventListener('click', function () {
      var open = editorRow.style.display !== 'none';
      editorRow.style.display = open ? 'none' : 'flex';
    });

    input.addEventListener('input', function () { hexLabel.textContent = input.value; });
    input.addEventListener('change', function () {
      authority.setPropertyValue(palette.id, record.id, input.value);
      onEdited();
    });

    return row;
  }

  global.WOSMapsPaletteDetail = { render: render };

  console.log('[WOSMapsPaletteDetail] loaded');

})(window);
