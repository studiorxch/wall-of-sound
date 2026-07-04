// ── MapLab — Map Inspector v1.9.0 ────────────────────────────────────────────
// 0610O_WOS_MapLabAuthorCueIsolation_v1.0.0_BUILD
// Prior: 0610M_WOS_SourceBuildingHideAuthority_v1.0.0_BUILD
// Prior: 0610L_WOS_ReplacementDeleteAuthority_v1.0.0_BUILD
// Prior: 0610K_WOS_CompoundBuildingAuthority_v1.0.0_BUILD
// Prior: 0610J_WOS_ReplacementBuildingGroupAuthority
// Status: active | Classification: studio-maplab
//
// v1.9.0 — Author Cue section (0610O): display-only section showing authored
//           replacement/hidden/group/compound/color state. Makes explicit that
//           source buildings are not visually mutated in Author mode. Section
//           renders only when at least one authored state is present.
// v1.8.0 — Source building hide/restore (0610M): renames "Reset Building" →
//           "Reset Edit", "Delete Selected" → "Delete Authored Edit". Adds
//           [Hide Source Building] / [Restore Source Building] toggle button
//           (amber / teal). Callbacks: onHideSourceBuilding, onRestoreSourceBuilding.
// v1.7.0 — Delete Authored Edit button in Edit section. Hierarchy-aware: deletes
//           the highest active target (compound > group > standalone). Confirms
//           before deleting groups/compounds. Callback: onDeleteSelected().
// v1.6.0 — Compound section above Group section. opts.compoundState:
//           'none' → [Start Compound]; 'draft' → draft count + name/kind inputs
//           + [Add] [Finish] [Cancel]; 'member' → compound name/kind/count
//           + [Ungroup Compound]. When compoundState === 'member', Replacement
//           title becomes "Compound Replacement" (overrides group title).
//           New callbacks: onStartCompound, onAddToCompound, onFinishCompound,
//           onCancelCompound, onUngroupCompound, onCompoundMetaChange.
// v1.5.0 — Group section: shows group controls above Replacement section.
//           opts.groupState: 'none' → [Start Group]
//                            'draft' → [Add to Group] [Finish Group] [Cancel Group]
//                            'member' → "Group: N parts" + [Ungroup]
//           When groupState === 'member', Replacement section title is "Group Replacement".
//           New callbacks: onStartGroup, onAddToGroup, onFinishGroup, onCancelGroup, onUngroup.
// v1.4.0 — Replacement section: enable toggle, archetype select, style input,
//           scale input, heightMode select. Callback: onReplacementChange(obj).
// v1.3.0 — Edit section: notes, tags, hidden toggle, Reset Building button.
//           Callbacks: onNotesChange, onTagsChange, onHiddenChange, onReset.
// v1.2.0 — color picker; raw properties section.
// v1.1.0 — selection status, geographic, geometry, source sections.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var doc = global.document;

  var VALID_COMPOUND_KINDS = ['landmark', 'building', 'campus', 'pier', 'station', 'custom'];

  var COMPOUND_KIND_LABELS = {
    'landmark': 'Landmark', 'building': 'Building', 'campus': 'Campus',
    'pier': 'Pier', 'station': 'Station', 'custom': 'Custom',
  };

  var VALID_ARCHETYPES = [
    'warehouse', 'skyscraper', 'apartment', 'radio-tower',
    'pagoda', 'civic-block', 'industrial-stack', 'custom-placeholder',
  ];

  var VALID_HEIGHT_MODES = ['inherit', 'low', 'medium', 'tall', 'hero'];

  // ── Archetype display labels ──────────────────────────────────────────────────
  var ARCHETYPE_LABELS = {
    'warehouse':          'Warehouse',
    'skyscraper':         'Skyscraper',
    'apartment':          'Apartment',
    'radio-tower':        'Radio Tower',
    'pagoda':             'Pagoda',
    'civic-block':        'Civic Block',
    'industrial-stack':   'Industrial Stack',
    'custom-placeholder': 'Custom Placeholder',
  };

  var HEIGHT_MODE_LABELS = {
    'inherit': 'Inherit',
    'low':     'Low',
    'medium':  'Medium',
    'tall':    'Tall',
    'hero':    'Hero',
  };

  // ── DOM helpers ───────────────────────────────────────────────────────────────

  function _el(tag, cls, text) {
    var e = doc.createElement(tag);
    if (cls)  e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function _row(label, value) {
    var row = _el('div', 'studio-meta-row');
    var k   = _el('span', 'studio-meta-key', label);
    var v   = _el('span', 'studio-meta-val', value != null ? String(value) : '—');
    row.appendChild(k);
    row.appendChild(v);
    return row;
  }

  function _section(title) {
    var s = _el('div', 'studio-insp-section');
    s.appendChild(_el('div', 'studio-insp-section-title', title));
    return s;
  }

  function _inputStyle(type) {
    var base = 'flex:1;font:11px/1.4 monospace;background:rgba(255,255,255,0.05);' +
      'color:rgba(255,255,255,0.75);border:1px solid rgba(255,255,255,0.12);' +
      'border-radius:2px;padding:3px 6px;';
    if (type === 'select') return base + 'cursor:pointer;';
    if (type === 'number') return base + 'width:60px;flex:none;';
    return base;
  }

  function _makeSelect(options, currentValue, onChange) {
    var sel = doc.createElement('select');
    sel.style.cssText = _inputStyle('select');
    options.forEach(function (opt) {
      var o = doc.createElement('option');
      o.value       = opt.value;
      o.textContent = opt.label;
      if (opt.value === currentValue) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', function () { onChange(sel.value); });
    return sel;
  }

  // ── Main render ───────────────────────────────────────────────────────────────

  function render(containerId, selection, options) {
    var body = doc.getElementById(containerId);
    if (!body) return;
    body.innerHTML = '';
    var opts = options || {};

    // Header
    var hdr = _el('div', 'studio-insp-header');
    hdr.appendChild(_el('span', 'studio-insp-title', 'Map Lab'));
    hdr.appendChild(_el('span', 'studio-insp-context', 'Building'));
    body.appendChild(hdr);

    if (!selection) {
      body.appendChild(_el('div', 'studio-empty', 'Click a building to select it.'));
      return;
    }

    // Selection Status
    var statusSection = _section('Selection');
    statusSection.appendChild(_row('Layer',      opts.layerId   || selection.source      || '—'));
    statusSection.appendChild(_row('Layer Type', opts.layerType || '—'));
    statusSection.appendChild(_row('Feature ID', selection.id != null ? String(selection.id) : '—'));
    statusSection.appendChild(_row('Highlighted', opts.highlighted ? '✓ active' : '—'));
    statusSection.appendChild(_row('Color',       selection.editColor || '#3dd8c5'));
    body.appendChild(statusSection);

    // Building
    var buildingSection = _section('Building');
    buildingSection.appendChild(_row('Building ID', selection.id != null ? selection.id : '(no id)'));
    buildingSection.appendChild(_row('Feature ID',  selection.id != null ? selection.id : '—'));
    body.appendChild(buildingSection);

    // Geographic
    var geoSection = _section('Geographic');
    if (selection.center) {
      geoSection.appendChild(_row('Longitude', selection.center.lng.toFixed(6)));
      geoSection.appendChild(_row('Latitude',  selection.center.lat.toFixed(6)));
    } else {
      geoSection.appendChild(_row('Longitude', '—'));
      geoSection.appendChild(_row('Latitude',  '—'));
    }
    body.appendChild(geoSection);

    // Geometry
    var geomSection = _section('Geometry');
    geomSection.appendChild(_row('Height',     selection.height    != null ? selection.height + ' m'    : '—'));
    geomSection.appendChild(_row('Min Height', selection.minHeight != null ? selection.minHeight + ' m' : '—'));
    geomSection.appendChild(_row('Type',       selection.geometry  ? selection.geometry.type : '—'));
    body.appendChild(geomSection);

    // Source
    var srcSection = _section('Source');
    srcSection.appendChild(_row('Source',       selection.source      || '—'));
    srcSection.appendChild(_row('Source Layer', selection.sourceLayer || '—'));
    body.appendChild(srcSection);

    // ── Edit ─────────────────────────────────────────────────────────────────────
    var editSection = _section('Edit');

    // Color picker
    var colorRow = _el('div', 'studio-meta-row');
    colorRow.appendChild(_el('span', 'studio-meta-key', 'Color'));
    var colorInput = doc.createElement('input');
    colorInput.type = 'color';
    colorInput.value = selection.editColor || '#3dd8c5';
    colorInput.style.cssText = 'border:none;background:none;cursor:pointer;width:36px;height:22px;padding:0;';
    if (typeof opts.onColorChange === 'function') {
      colorInput.addEventListener('input', function () {
        opts.onColorChange(colorInput.value);
        selection.editColor = colorInput.value;
      });
    }
    colorRow.appendChild(colorInput);
    editSection.appendChild(colorRow);

    // Hidden toggle
    var hiddenRow = _el('div', 'studio-meta-row');
    hiddenRow.appendChild(_el('span', 'studio-meta-key', 'Hidden'));
    var hiddenCheck = doc.createElement('input');
    hiddenCheck.type    = 'checkbox';
    hiddenCheck.checked = !!(opts.hidden);
    hiddenCheck.style.cssText = 'cursor:pointer;margin:0;';
    if (typeof opts.onHiddenChange === 'function') {
      hiddenCheck.addEventListener('change', function () {
        opts.onHiddenChange(hiddenCheck.checked);
      });
    }
    hiddenRow.appendChild(hiddenCheck);
    editSection.appendChild(hiddenRow);

    // Notes textarea
    var notesRow = _el('div', 'studio-meta-row');
    notesRow.style.cssText = 'flex-direction:column;align-items:flex-start;gap:4px;';
    notesRow.appendChild(_el('span', 'studio-meta-key', 'Notes'));
    var notesArea = doc.createElement('textarea');
    notesArea.value = opts.notes || '';
    notesArea.rows  = 3;
    notesArea.style.cssText = 'width:100%;box-sizing:border-box;resize:vertical;font:11px/1.4 monospace;' +
      'background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.75);' +
      'border:1px solid rgba(255,255,255,0.12);border-radius:2px;padding:4px 6px;';
    if (typeof opts.onNotesChange === 'function') {
      notesArea.addEventListener('input', function () {
        opts.onNotesChange(notesArea.value);
      });
    }
    notesRow.appendChild(notesArea);
    editSection.appendChild(notesRow);

    // Tags input (comma-separated)
    var tagsRow = _el('div', 'studio-meta-row');
    tagsRow.appendChild(_el('span', 'studio-meta-key', 'Tags'));
    var tagsInput = doc.createElement('input');
    tagsInput.type  = 'text';
    tagsInput.value = (opts.tags && opts.tags.length) ? opts.tags.join(', ') : '';
    tagsInput.placeholder = 'e.g. landmark, hero, replace';
    tagsInput.style.cssText = _inputStyle('text');
    if (typeof opts.onTagsChange === 'function') {
      tagsInput.addEventListener('input', function () {
        var tagArr = tagsInput.value.split(',')
          .map(function (t) { return t.trim(); })
          .filter(function (t) { return t.length > 0; });
        opts.onTagsChange(tagArr);
      });
    }
    tagsRow.appendChild(tagsInput);
    editSection.appendChild(tagsRow);

    // Reset Building button
    if (typeof opts.onReset === 'function') {
      var resetRow = _el('div', 'studio-meta-row');
      resetRow.style.cssText = 'justify-content:flex-end;padding-top:4px;';
      var resetBtn = _el('button', null, 'Reset Edit');
      resetBtn.style.cssText = 'font:10px/16px monospace;cursor:pointer;' +
        'background:rgba(255,80,80,0.15);color:rgba(255,120,120,0.85);' +
        'border:1px solid rgba(255,80,80,0.25);border-radius:2px;padding:2px 8px;';
      resetBtn.addEventListener('click', function () { opts.onReset(); });
      resetRow.appendChild(resetBtn);
      editSection.appendChild(resetRow);
    }

    // Delete Authored Edit button (0610L, renamed 0610M) — hierarchy-aware: compound > group > standalone
    if (typeof opts.onDeleteSelected === 'function') {
      var deleteRow = _el('div', 'studio-meta-row');
      deleteRow.style.cssText = 'justify-content:flex-end;padding-top:2px;';
      var deleteBtn = _el('button', null, 'Delete Authored Edit');
      deleteBtn.style.cssText = 'font:10px/16px monospace;cursor:pointer;' +
        'background:rgba(200,20,20,0.18);color:rgba(255,80,80,0.95);' +
        'border:1px solid rgba(220,40,40,0.50);border-radius:2px;padding:2px 8px;';
      deleteBtn.title = 'Deletes WOS-authored replacement/group/compound data. Does not delete Mapbox source geometry.';
      deleteBtn.addEventListener('click', function () { opts.onDeleteSelected(); });
      deleteRow.appendChild(deleteBtn);
      editSection.appendChild(deleteRow);
    }

    // Hide / Restore Source Building (0610M)
    if (typeof opts.onHideSourceBuilding === 'function' || typeof opts.onRestoreSourceBuilding === 'function') {
      var hideRow = _el('div', 'studio-meta-row');
      hideRow.style.cssText = 'justify-content:flex-end;padding-top:2px;';
      var isHidden = !!(opts.hidden);
      if (isHidden && typeof opts.onRestoreSourceBuilding === 'function') {
        var restoreBtn = _el('button', null, 'Restore Source Building');
        restoreBtn.style.cssText = 'font:10px/16px monospace;cursor:pointer;' +
          'background:rgba(61,216,197,0.18);color:#3dd8c5;' +
          'border:1px solid rgba(61,216,197,0.35);border-radius:2px;padding:2px 8px;';
        restoreBtn.title = 'Restores the original Mapbox source building by removing the hidden flag.';
        restoreBtn.addEventListener('click', function () { opts.onRestoreSourceBuilding(); });
        hideRow.appendChild(restoreBtn);
      } else if (!isHidden && typeof opts.onHideSourceBuilding === 'function') {
        var hideBtn = _el('button', null, 'Hide Source Building');
        hideBtn.style.cssText = 'font:10px/16px monospace;cursor:pointer;' +
          'background:rgba(255,200,80,0.18);color:#ffc850;' +
          'border:1px solid rgba(255,200,80,0.35);border-radius:2px;padding:2px 8px;';
        hideBtn.title = 'Suppresses the original Mapbox source building by creating a hidden edit record.';
        hideBtn.addEventListener('click', function () { opts.onHideSourceBuilding(); });
        hideRow.appendChild(hideBtn);
      }
      editSection.appendChild(hideRow);
    }

    body.appendChild(editSection);

    // ── Author Cue (0610O) ────────────────────────────────────────────────────────
    // Display-only: shows authored state without mutating source building paint.
    // Source buildings keep Mapbox Studio paint in Author mode; outline + badge + this
    // section are the only visual feedback.
    var csState = opts.compoundState || 'none';
    var gsState = opts.groupState    || 'none';
    var hasReplacement = !!(opts.replacement && opts.replacement.enabled);
    var hasHidden      = !!(opts.hidden || opts.sourceHidden);
    var hasGroup       = gsState === 'member';
    var hasCompound    = csState === 'member';
    var hasColor       = !!(selection && selection.editColor);
    var hasCue = hasReplacement || hasHidden || hasGroup || hasCompound || hasColor;

    if (hasCue) {
      var cueSection = _section('Author Cue');
      // Teal left border to distinguish from edit controls
      var cueSectionEl = cueSection.querySelector
        ? cueSection : cueSection;
      cueSection.style.borderLeft = '2px solid rgba(61,216,197,0.35)';
      cueSection.style.paddingLeft = '4px';

      if (hasCompound) {
        var cmpName = (opts.compoundName || '') + (opts.compoundKind ? ' · ' + opts.compoundKind : '');
        cueSection.appendChild(_row('Compound', cmpName || '—'));
      }
      if (hasGroup) {
        cueSection.appendChild(_row('Group', (opts.groupMemberCount || '?') + ' parts'));
      }
      if (hasReplacement) {
        var archLabel = ARCHETYPE_LABELS[opts.replacement.archetype] || opts.replacement.archetype || '—';
        cueSection.appendChild(_row('Replacement', archLabel));
      }
      if (hasHidden) {
        cueSection.appendChild(_row('Source Hidden', 'Yes'));
      }
      if (hasColor) {
        var colorCueRow = _el('div', 'studio-meta-row');
        colorCueRow.appendChild(_el('span', 'studio-meta-key', 'Saved Color'));
        var swatch = _el('span', null);
        swatch.style.cssText = 'display:inline-block;width:12px;height:12px;border-radius:2px;' +
          'margin-right:4px;background:' + (selection.editColor || '#3dd8c5') + ';';
        var colorValSpan = _el('span', null, selection.editColor || '—');
        colorValSpan.style.cssText = 'font:10px/1.4 monospace;color:rgba(255,255,255,0.55);';
        colorCueRow.appendChild(swatch);
        colorCueRow.appendChild(colorValSpan);
        cueSection.appendChild(colorCueRow);
      }

      // Output note — clarifies that Preview/Wall own the visual output
      var outputRow = _el('div', 'studio-meta-row');
      outputRow.style.cssText = 'margin-top:4px;';
      outputRow.appendChild(_el('span', 'studio-meta-key', 'Visual Output'));
      var outputVal = _el('span', null, 'Preview / Wall only');
      outputVal.style.cssText = 'font:9px/1.4 monospace;color:rgba(61,216,197,0.5);font-style:italic;';
      outputRow.appendChild(outputVal);
      cueSection.appendChild(outputRow);

      body.appendChild(cueSection);
    }

    // ── Compound (0610K) ─────────────────────────────────────────────────────────
    var compoundState   = opts.compoundState || 'none';  // 'none' | 'draft' | 'member'
    var compoundSection = _section('Compound');

    var cmpBtnStyle  = 'font:10px/16px monospace;cursor:pointer;border-radius:2px;padding:2px 8px;margin-right:4px;';
    var cmpBtnBase   = cmpBtnStyle + 'background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.65);border:1px solid rgba(255,255,255,0.18);';
    var cmpBtnAccent = cmpBtnStyle + 'background:rgba(255,200,80,0.18);color:#ffc850;border:1px solid rgba(255,200,80,0.35);';
    var cmpBtnDanger = cmpBtnStyle + 'background:rgba(255,80,80,0.12);color:rgba(255,120,120,0.8);border:1px solid rgba(255,80,80,0.22);';

    var cmpBtnsRow = _el('div', 'studio-meta-row');
    cmpBtnsRow.style.cssText = 'flex-wrap:wrap;gap:4px;padding:2px 0;';

    if (compoundState === 'none') {
      var cmpStartBtn = _el('button', null, 'Start Compound');
      cmpStartBtn.style.cssText = cmpBtnBase;
      cmpStartBtn.title = 'Begin a compound: group named structures (buildings and/or groups) into one replacement target';
      if (typeof opts.onStartCompound === 'function') {
        cmpStartBtn.addEventListener('click', function () { opts.onStartCompound(); });
      }
      cmpBtnsRow.appendChild(cmpStartBtn);

    } else if (compoundState === 'draft') {
      var cmpDraftCount = opts.compoundDraftCount || 0;
      var cmpDraftInfo  = _el('span', null, 'Compound Draft: ' + cmpDraftCount + ' part(s)');
      cmpDraftInfo.style.cssText = 'font:10px/1.4 monospace;color:rgba(255,255,255,0.4);display:block;margin-bottom:4px;';
      compoundSection.appendChild(cmpDraftInfo);

      // Name input
      var cmpNameRow = _el('div', 'studio-meta-row');
      cmpNameRow.appendChild(_el('span', 'studio-meta-key', 'Name'));
      var cmpNameInput = doc.createElement('input');
      cmpNameInput.type        = 'text';
      cmpNameInput.value       = opts.compoundDraftName || '';
      cmpNameInput.placeholder = 'e.g. Castle Clinton';
      cmpNameInput.style.cssText = _inputStyle('text');
      if (typeof opts.onCompoundMetaChange === 'function') {
        cmpNameInput.addEventListener('input', function () {
          opts.onCompoundMetaChange({ name: cmpNameInput.value });
        });
      }
      cmpNameRow.appendChild(cmpNameInput);
      compoundSection.appendChild(cmpNameRow);

      // Kind select
      var cmpKindRow = _el('div', 'studio-meta-row');
      cmpKindRow.appendChild(_el('span', 'studio-meta-key', 'Kind'));
      var cmpKindSel = _makeSelect(
        VALID_COMPOUND_KINDS.map(function (k) { return { value: k, label: COMPOUND_KIND_LABELS[k] || k }; }),
        opts.compoundDraftKind || 'custom',
        function (val) {
          if (typeof opts.onCompoundMetaChange === 'function') opts.onCompoundMetaChange({ kind: val });
        }
      );
      cmpKindRow.appendChild(cmpKindSel);
      compoundSection.appendChild(cmpKindRow);

      var cmpAddBtn = _el('button', null, 'Add to Compound');
      cmpAddBtn.style.cssText = cmpBtnAccent;
      cmpAddBtn.title = 'Add this building/group to the compound draft';
      if (typeof opts.onAddToCompound === 'function') {
        cmpAddBtn.addEventListener('click', function () { opts.onAddToCompound(); });
      }
      cmpBtnsRow.appendChild(cmpAddBtn);

      if (cmpDraftCount >= 2) {
        var cmpFinishBtn = _el('button', null, 'Finish Compound');
        cmpFinishBtn.style.cssText = cmpBtnAccent;
        cmpFinishBtn.title = 'Create the compound from all draft members';
        if (typeof opts.onFinishCompound === 'function') {
          cmpFinishBtn.addEventListener('click', function () { opts.onFinishCompound(); });
        }
        cmpBtnsRow.appendChild(cmpFinishBtn);
      }

      var cmpCancelBtn = _el('button', null, 'Cancel');
      cmpCancelBtn.style.cssText = cmpBtnDanger;
      cmpCancelBtn.title = 'Discard the compound draft';
      if (typeof opts.onCancelCompound === 'function') {
        cmpCancelBtn.addEventListener('click', function () { opts.onCancelCompound(); });
      }
      cmpBtnsRow.appendChild(cmpCancelBtn);

    } else if (compoundState === 'member') {
      var cmpName  = opts.compoundName    || 'Compound';
      var cmpKind  = opts.compoundKind    || 'custom';
      var cmpCount = opts.compoundMemberCount || 0;

      var cmpInfo = _el('div', null);
      cmpInfo.style.cssText = 'font:10px/1.6 monospace;color:rgba(255,200,80,0.8);margin-bottom:4px;';
      cmpInfo.innerHTML = 'Compound: <strong>' + cmpName + '</strong><br>' +
        'Kind: ' + (COMPOUND_KIND_LABELS[cmpKind] || cmpKind) + ' · Members: ' + cmpCount;
      compoundSection.appendChild(cmpInfo);

      var cmpUngroupBtn = _el('button', null, 'Ungroup Compound');
      cmpUngroupBtn.style.cssText = cmpBtnDanger;
      cmpUngroupBtn.title = 'Delete compound — members revert to group/standalone behavior';
      if (typeof opts.onUngroupCompound === 'function') {
        cmpUngroupBtn.addEventListener('click', function () { opts.onUngroupCompound(); });
      }
      cmpBtnsRow.appendChild(cmpUngroupBtn);
    }

    compoundSection.appendChild(cmpBtnsRow);
    body.appendChild(compoundSection);

    // ── Group (0610J) ──────────────────────────────────────────────────────────────
    var groupState   = opts.groupState   || 'none';  // 'none' | 'draft' | 'member'
    var groupSection = _section('Group');

    var groupBtnStyle = 'font:10px/16px monospace;cursor:pointer;border-radius:2px;' +
      'padding:2px 8px;margin-right:4px;';
    var groupBtnBase  = groupBtnStyle +
      'background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.65);' +
      'border:1px solid rgba(255,255,255,0.18);';
    var groupBtnAccent = groupBtnStyle +
      'background:rgba(61,216,197,0.18);color:#3dd8c5;' +
      'border:1px solid rgba(61,216,197,0.35);';
    var groupBtnDanger = groupBtnStyle +
      'background:rgba(255,80,80,0.12);color:rgba(255,120,120,0.8);' +
      'border:1px solid rgba(255,80,80,0.22);';

    var groupBtnsRow = _el('div', 'studio-meta-row');
    groupBtnsRow.style.cssText = 'flex-wrap:wrap;gap:4px;padding:2px 0;';

    if (groupState === 'none') {
      // No group — offer to start one
      var startBtn = _el('button', null, 'Start Group');
      startBtn.style.cssText = groupBtnBase;
      startBtn.title = 'Begin grouping multiple building features into one replacement target';
      if (typeof opts.onStartGroup === 'function') {
        startBtn.addEventListener('click', function () { opts.onStartGroup(); });
      }
      groupBtnsRow.appendChild(startBtn);

    } else if (groupState === 'draft') {
      // Draft active — show member count + action buttons
      var draftCount = opts.groupDraftCount || 0;
      var draftInfo  = _el('span', null, 'Draft: ' + draftCount + ' part(s) · ');
      draftInfo.style.cssText = 'font:10px/1.4 monospace;color:rgba(255,255,255,0.4);margin-right:4px;';
      groupBtnsRow.appendChild(draftInfo);

      var addBtn = _el('button', null, 'Add to Group');
      addBtn.style.cssText = groupBtnAccent;
      addBtn.title = 'Add this building to the current group draft';
      if (typeof opts.onAddToGroup === 'function') {
        addBtn.addEventListener('click', function () { opts.onAddToGroup(); });
      }
      groupBtnsRow.appendChild(addBtn);

      if (draftCount >= 2) {
        var finishBtn = _el('button', null, 'Finish Group');
        finishBtn.style.cssText = groupBtnAccent;
        finishBtn.title = 'Create the group from all draft members';
        if (typeof opts.onFinishGroup === 'function') {
          finishBtn.addEventListener('click', function () { opts.onFinishGroup(); });
        }
        groupBtnsRow.appendChild(finishBtn);
      }

      var cancelBtn = _el('button', null, 'Cancel');
      cancelBtn.style.cssText = groupBtnDanger;
      cancelBtn.title = 'Discard the group draft';
      if (typeof opts.onCancelGroup === 'function') {
        cancelBtn.addEventListener('click', function () { opts.onCancelGroup(); });
      }
      groupBtnsRow.appendChild(cancelBtn);

    } else if (groupState === 'member') {
      // Part of existing group
      var memberCount = opts.groupMemberCount || 0;
      var memberInfo  = _el('span', null, 'Group: ' + memberCount + ' part(s)');
      memberInfo.style.cssText = 'font:10px/1.4 monospace;color:rgba(61,216,197,0.75);margin-right:8px;';
      groupBtnsRow.appendChild(memberInfo);

      var ungroupBtn = _el('button', null, 'Ungroup');
      ungroupBtn.style.cssText = groupBtnDanger;
      ungroupBtn.title = 'Remove group — members become independent replacements again';
      if (typeof opts.onUngroup === 'function') {
        ungroupBtn.addEventListener('click', function () { opts.onUngroup(); });
      }
      groupBtnsRow.appendChild(ungroupBtn);
    }

    groupSection.appendChild(groupBtnsRow);
    body.appendChild(groupSection);

    // ── Replacement ───────────────────────────────────────────────────────────────
    // Authority: compound > group > standalone.
    var repTitle = 'Replacement';
    if (compoundState === 'member') repTitle = 'Compound Replacement';
    else if (groupState === 'member') repTitle = 'Group Replacement';
    var repSection = _section(repTitle);

    // Track the live replacement state in a closure object
    var savedReplacement = opts.replacement || null;
    var repState = {
      enabled:    !!(savedReplacement && savedReplacement.enabled),
      archetype:  (savedReplacement && savedReplacement.archetype) || 'custom-placeholder',
      style:      (savedReplacement && savedReplacement.style)     || '',
      scale:      (savedReplacement && savedReplacement.scale != null) ? savedReplacement.scale : 1,
      heightMode: (savedReplacement && savedReplacement.heightMode) || 'inherit',
    };

    function _fireReplacementChange() {
      if (typeof opts.onReplacementChange !== 'function') return;
      opts.onReplacementChange({
        enabled:    repState.enabled,
        archetype:  repState.archetype,
        label:      ARCHETYPE_LABELS[repState.archetype] || repState.archetype,
        style:      repState.style,
        scale:      repState.scale,
        heightMode: repState.heightMode,
      });
    }

    // Enable toggle
    var enableRow = _el('div', 'studio-meta-row');
    enableRow.appendChild(_el('span', 'studio-meta-key', 'Enable'));
    var enableCheck = doc.createElement('input');
    enableCheck.type    = 'checkbox';
    enableCheck.checked = repState.enabled;
    enableCheck.style.cssText = 'cursor:pointer;margin:0;';
    enableCheck.addEventListener('change', function () {
      repState.enabled = enableCheck.checked;
      _fireReplacementChange();
    });
    enableRow.appendChild(enableCheck);
    repSection.appendChild(enableRow);

    // Archetype select
    var archetypeRow = _el('div', 'studio-meta-row');
    archetypeRow.appendChild(_el('span', 'studio-meta-key', 'Archetype'));
    var archetypeSel = _makeSelect(
      VALID_ARCHETYPES.map(function (a) { return { value: a, label: ARCHETYPE_LABELS[a] || a }; }),
      repState.archetype,
      function (val) {
        repState.archetype = val;
        // Update the cue indicator color
        cueIndicator.style.background = _archetypeColor(val);
        _fireReplacementChange();
      }
    );
    archetypeRow.appendChild(archetypeSel);
    repSection.appendChild(archetypeRow);

    // Visual cue indicator — colored dot showing active archetype
    var cueRow = _el('div', 'studio-meta-row');
    cueRow.appendChild(_el('span', 'studio-meta-key', 'Cue'));
    var cueIndicator = _el('span', null);
    cueIndicator.style.cssText = 'display:inline-block;width:14px;height:14px;border-radius:2px;' +
      'background:' + _archetypeColor(repState.archetype) + ';vertical-align:middle;';
    var cueLabel = _el('span', null, ' ' + (ARCHETYPE_LABELS[repState.archetype] || repState.archetype));
    cueLabel.style.cssText = 'font:10px/1.4 monospace;color:rgba(255,255,255,0.5);margin-left:6px;';
    cueRow.appendChild(cueIndicator);
    cueRow.appendChild(cueLabel);
    repSection.appendChild(cueRow);

    // Style (text input)
    var styleRow = _el('div', 'studio-meta-row');
    styleRow.appendChild(_el('span', 'studio-meta-key', 'Style'));
    var styleInput = doc.createElement('input');
    styleInput.type        = 'text';
    styleInput.value       = repState.style;
    styleInput.placeholder = 'e.g. industrial, modern';
    styleInput.style.cssText = _inputStyle('text');
    styleInput.addEventListener('input', function () {
      repState.style = styleInput.value.trim();
      _fireReplacementChange();
    });
    styleRow.appendChild(styleInput);
    repSection.appendChild(styleRow);

    // Scale (number input)
    var scaleRow = _el('div', 'studio-meta-row');
    scaleRow.appendChild(_el('span', 'studio-meta-key', 'Scale'));
    var scaleInput = doc.createElement('input');
    scaleInput.type  = 'number';
    scaleInput.value = String(repState.scale);
    scaleInput.min   = '0.1';
    scaleInput.max   = '10';
    scaleInput.step  = '0.1';
    scaleInput.style.cssText = _inputStyle('number');
    scaleInput.addEventListener('input', function () {
      var v = parseFloat(scaleInput.value);
      repState.scale = (isFinite(v) && v > 0) ? v : 1;
      _fireReplacementChange();
    });
    scaleRow.appendChild(scaleInput);
    repSection.appendChild(scaleRow);

    // Height Mode select
    var hmRow = _el('div', 'studio-meta-row');
    hmRow.appendChild(_el('span', 'studio-meta-key', 'Height Mode'));
    var hmSel = _makeSelect(
      VALID_HEIGHT_MODES.map(function (h) { return { value: h, label: HEIGHT_MODE_LABELS[h] || h }; }),
      repState.heightMode,
      function (val) {
        repState.heightMode = val;
        _fireReplacementChange();
      }
    );
    hmRow.appendChild(hmSel);
    repSection.appendChild(hmRow);

    body.appendChild(repSection);

    // ── Raw Properties ────────────────────────────────────────────────────────────
    var props = selection.properties || {};
    var propKeys = Object.keys(props);
    if (propKeys.length) {
      var rawSection = _section('Raw Properties');
      propKeys.forEach(function (k) {
        rawSection.appendChild(_row(k, props[k]));
      });
      body.appendChild(rawSection);
    }
  }

  function _archetypeColor(archetype) {
    var COLORS = {
      'warehouse':          '#f2a23c',
      'skyscraper':         '#3dd8c5',
      'apartment':          '#a7c7e7',
      'radio-tower':        '#ff4b4b',
      'pagoda':             '#d85cff',
      'civic-block':        '#f5d76e',
      'industrial-stack':   '#8d6e63',
      'custom-placeholder': '#ffffff',
    };
    return COLORS[archetype] || '#ffffff';
  }

  function renderEmpty(containerId, msg) {
    var body = doc.getElementById(containerId);
    if (!body) return;
    body.innerHTML = '';
    var hdr = _el('div', 'studio-insp-header');
    hdr.appendChild(_el('span', 'studio-insp-title', 'Map Lab'));
    hdr.appendChild(_el('span', 'studio-insp-context', 'Building'));
    body.appendChild(hdr);
    body.appendChild(_el('div', 'studio-empty', msg || 'Click a building to select it.'));
  }

  global.WOSMapLab = global.WOSMapLab || {};
  global.WOSMapLab.MapInspector = Object.freeze({
    render:      render,
    renderEmpty: renderEmpty,
  });

  console.log('[MapInspector] v1.9.0 loaded');
})(window);
