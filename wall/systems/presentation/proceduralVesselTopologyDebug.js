// ── ProceduralVesselTopologyDebug v1.0.1 ─────────────────────────────────────
// 0525F_WOS_ProceduralVesselTopologyDebug_v1.0.1
// Status: active
// Classification: debug-companion — do NOT load in production
//
// Debug companion for ProceduralVesselTopology.
// Binds to _wos.vesselTopology namespace (additive — safe post-main.js).
//
// Methods:
//   catalog()             — all blueprints with primitive counts and LOD spread
//   inspect("cargo")      — deep-inspect one blueprint
//   preview("tanker")     — ASCII-style spatial map of primitives
//   previewAll()          — preview() for every registered class
//   lodMatrix("cargo")    — primitive counts per LOD threshold
//   emit("tug")           — createTopologyInstance + emitGeometryPlan, log result
//   validate()            — run validateBlueprints() and report
//   constants()           — print all system constants
//
// Placement: wall/systems/presentation/proceduralVesselTopologyDebug.js
// Load:  AFTER main.js  (uses additive _wos init)
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  global._wos = global._wos || {};

  var _pvt = global.SBE && global.SBE.ProceduralVesselTopology;

  // ── Guard ─────────────────────────────────────────────────────────────────────
  if (!_pvt) {
    console.warn('[ProceduralVesselTopologyDebug] SBE.ProceduralVesselTopology not found — ' +
      'ensure proceduralVesselTopology.js is loaded first.');
    global._wos.vesselTopology = { _error: 'runtime not loaded' };
    return;
  }

  var C   = _pvt.CONSTANTS;
  var LR  = C.LOD_RANK;
  var VL  = C.VALID_LODS;

  // ── Helpers ───────────────────────────────────────────────────────────────────

  function _rank(lodStr) { return LR[lodStr] !== undefined ? LR[lodStr] : -1; }

  function _lodLabel(lodStr) {
    var names = { LIGHT:'LGT', MARKER:'MRK', SILHOUETTE:'SIL', TOPOLOGY:'TOP', CLOSE_DETAIL:'CDT' };
    return names[lodStr] || lodStr;
  }

  // Pad string right to width
  function _pad(s, w) {
    s = String(s);
    while (s.length < w) s += ' ';
    return s;
  }
  function _lpad(s, w) {
    s = String(s);
    while (s.length < w) s = ' ' + s;
    return s;
  }

  // Count primitives visible at or before a given LOD
  function _countAtLOD(primitives, lodStr) {
    var rank = _rank(lodStr);
    var n = 0;
    for (var i = 0; i < primitives.length; i++) {
      if (_rank(primitives[i].visibleFromLOD) <= rank) n++;
    }
    return n;
  }

  // ── catalog() ─────────────────────────────────────────────────────────────────

  function catalog() {
    var bps = _pvt.getAllBlueprints();
    var keys = Object.keys(bps).sort();

    console.group('[PVT] Blueprint Catalog — ' + keys.length + ' classes  (v' + C.VERSION + ')');
    console.log(
      _pad('CLASS', 14) +
      _pad('PRIMS', 7) +
      _pad('SIL', 5) +
      _pad('TOP', 5) +
      _pad('CDT', 5) +
      'HULL PARAMS'
    );
    console.log('─'.repeat(62));

    for (var i = 0; i < keys.length; i++) {
      var bp    = bps[keys[i]];
      var prims = bp.primitives;
      var hull  = null;
      for (var j = 0; j < prims.length; j++) {
        if (prims[j].role === 'hull') { hull = prims[j]; break; }
      }
      var hullParams = hull
        ? ('bow=' + (hull.bowShoulderFrac !== undefined ? hull.bowShoulderFrac.toFixed(2) : '—') +
           ' str=' + (hull.sternWidthFrac !== undefined ? hull.sternWidthFrac.toFixed(2) : '—'))
        : '—';

      console.log(
        _pad(keys[i], 14) +
        _lpad(prims.length, 4) + '  ' +
        _lpad(_countAtLOD(prims, 'SILHOUETTE'),   3) + '  ' +
        _lpad(_countAtLOD(prims, 'TOPOLOGY'),     3) + '  ' +
        _lpad(_countAtLOD(prims, 'CLOSE_DETAIL'), 3) + '  ' +
        hullParams
      );
    }
    console.groupEnd();
  }

  // ── inspect(classKey) ─────────────────────────────────────────────────────────

  function inspect(classKey) {
    var bp = _pvt.getTopologyBlueprint(classKey);
    if (!bp) { console.warn('[PVT] inspect: no blueprint for', classKey); return; }

    console.group('[PVT] inspect(' + bp.classKey + ') — ' + bp.blueprintId);
    console.log('version      :', bp.version);
    console.log('primitives   :', bp.primitives.length);
    console.log('variation    :', JSON.stringify(bp.variation));
    console.log('lodPolicy    :', JSON.stringify(bp.lodPolicy));
    console.log('');

    var prims = bp.primitives;
    console.log(
      _pad('#', 3) +
      _pad('ID', 16) +
      _pad('TYPE', 14) +
      _pad('ROLE', 16) +
      _pad('LOD', 5) +
      _pad('FILL', 8) +
      _pad('xN', 6) + _pad('yN', 6) +
      _pad('wN', 6) + _pad('hN', 6) +
      'EXTRA'
    );
    console.log('─'.repeat(94));

    for (var i = 0; i < prims.length; i++) {
      var p    = prims[i];
      var extra = '';
      if (p.bowShoulderFrac !== undefined) extra += 'bow=' + p.bowShoulderFrac.toFixed(2) + ' ';
      if (p.sternWidthFrac  !== undefined) extra += 'str=' + p.sternWidthFrac.toFixed(2)  + ' ';
      if (p.rotationDeg     !== undefined) extra += 'rot=' + p.rotationDeg + '° ';
      console.log(
        _lpad(i, 2) + ' ' +
        _pad(p.primitiveId,    16) +
        _pad(p.type,           14) +
        _pad(p.role,           16) +
        _pad(_lodLabel(p.visibleFromLOD), 5) +
        _pad(p.fillRole,       8) +
        _lpad(p.xNorm.toFixed(2), 5) + ' ' +
        _lpad(p.yNorm.toFixed(2), 5) + ' ' +
        _lpad(p.wNorm.toFixed(2), 5) + ' ' +
        _lpad(p.hNorm.toFixed(2), 5) + ' ' +
        extra
      );
    }
    console.groupEnd();
  }

  // ── preview(classKey) ─────────────────────────────────────────────────────────
  // ASCII spatial map in blueprint space (xNorm=bow=left, yNorm=port=top).
  // Grid: 40 cols (xNorm), 20 rows (yNorm).

  function preview(classKey) {
    var COLS = 40; var ROWS = 20;
    var bp   = _pvt.getTopologyBlueprint(classKey);
    if (!bp)  { console.warn('[PVT] preview: no blueprint for', classKey); return; }

    // Build grid
    var grid = [];
    for (var r = 0; r < ROWS; r++) {
      var row = [];
      for (var c = 0; c < COLS; c++) row.push(' ');
      grid.push(row);
    }

    var prims = bp.primitives;
    // Draw in reverse so hull (index 0) is painted last (on top in text)
    var CHARS = { hull:'█', deck:'▒', accent:'▓', shadow:'░', light:'·' };

    function _putPrim(p) {
      var ch = CHARS[p.fillRole] || '?';
      var x0 = Math.max(0, Math.round((p.xNorm - p.wNorm / 2) * (COLS - 1)));
      var x1 = Math.min(COLS - 1, Math.round((p.xNorm + p.wNorm / 2) * (COLS - 1)));
      var y0 = Math.max(0, Math.round((p.yNorm - p.hNorm / 2) * (ROWS - 1)));
      var y1 = Math.min(ROWS - 1, Math.round((p.yNorm + p.hNorm / 2) * (ROWS - 1)));
      for (var row = y0; row <= y1; row++) {
        for (var col = x0; col <= x1; col++) {
          grid[row][col] = (row === y0 || row === y1 || col === x0 || col === x1)
            ? (p.role === 'hull' ? '█' : ch)
            : (p.role === 'hull' ? '▒' : ch);
        }
      }
    }

    // Paint hull first, then overlays (paint in order)
    for (var i = 0; i < prims.length; i++) _putPrim(prims[i]);

    console.group('[PVT] preview(' + bp.classKey + ')  ← bow    stern →   (port↑ stbd↓)');
    console.log('    ' + '·'.repeat(COLS));
    for (var row = 0; row < ROWS; row++) {
      var label = (row === 0) ? 'P ' : (row === ROWS - 1) ? 'S ' : '  ';
      console.log(label + '|' + grid[row].join('') + '|');
    }
    console.log('    ' + '·'.repeat(COLS));
    console.log('Legend: █hull  ▒deck  ▓accent  ░shadow  ·light');
    console.groupEnd();
  }

  // ── previewAll() ──────────────────────────────────────────────────────────────

  function previewAll() {
    var bps  = _pvt.getAllBlueprints();
    var keys = Object.keys(bps).sort();
    console.group('[PVT] previewAll — ' + keys.length + ' classes');
    for (var i = 0; i < keys.length; i++) preview(keys[i]);
    console.groupEnd();
  }

  // ── lodMatrix(classKey) ───────────────────────────────────────────────────────

  function lodMatrix(classKey) {
    var bp = _pvt.getTopologyBlueprint(classKey);
    if (!bp) { console.warn('[PVT] lodMatrix: no blueprint for', classKey); return; }

    var prims = bp.primitives;
    console.group('[PVT] lodMatrix(' + bp.classKey + ')');
    console.log(_pad('LOD', 14) + _pad('RANK', 6) + _pad('CUMULATIVE', 11) + 'ADDED AT THIS LOD');
    console.log('─'.repeat(52));

    var prev = 0;
    for (var i = 0; i < VL.length; i++) {
      var lod  = VL[i];
      var rank = _rank(lod);
      var cum  = _countAtLOD(prims, lod);
      var added = cum - prev;
      console.log(
        _pad(lod, 14) +
        _lpad(rank, 4) + '  ' +
        _lpad(cum, 8) + '   ' +
        (added > 0 ? '+' + added : '—')
      );
      prev = cum;
    }

    // Primitive table per LOD threshold
    console.log('');
    console.log('Primitive LOD gates:');
    for (var j = 0; j < prims.length; j++) {
      var p = prims[j];
      console.log(
        '  ' + _pad(p.primitiveId, 16) +
        _pad(_lodLabel(p.visibleFromLOD), 5) +
        '  ' + p.type + '/' + p.role
      );
    }
    console.groupEnd();
  }

  // ── emit(classKey, opts) ──────────────────────────────────────────────────────

  function emit(classKey, opts) {
    opts = opts || {};
    var input = {
      classKey:       classKey,
      vesselSeed:     opts.seed       !== undefined ? opts.seed       : 42,
      visibilityClass: opts.visibility || 'FULL',
      zoom:           opts.zoom        !== undefined ? opts.zoom       : 13.5,
      populationTier: opts.tier        || 'MID',
      lenPx:          opts.lenPx       !== undefined ? opts.lenPx      : 80,
      beamPx:         opts.beamPx      !== undefined ? opts.beamPx     : 22,
    };

    var instance = _pvt.createTopologyInstance(input);
    var plan     = _pvt.emitGeometryPlan(instance);

    console.group('[PVT] emit(' + classKey + ')  →  LOD: ' + instance.lod +
      '  seed: ' + instance.seed + '  prims: ' + plan.length);
    console.log('instance:', JSON.stringify(instance));
    console.log('');
    console.log(_pad('#', 3) + _pad('ID', 16) + _pad('TYPE', 14) + _pad('FILL', 8) +
      _pad('xN', 7) + _pad('yN', 7) + _pad('wN', 7) + _pad('hN', 7));
    console.log('─'.repeat(72));
    for (var i = 0; i < plan.length; i++) {
      var p = plan[i];
      console.log(
        _lpad(i, 2) + ' ' +
        _pad(p.primitiveId, 16) +
        _pad(p.type,        14) +
        _pad(p.fillRole,     8) +
        _lpad(p.xNorm.toFixed(3), 6) + ' ' +
        _lpad(p.yNorm.toFixed(3), 6) + ' ' +
        _lpad(p.wNorm.toFixed(3), 6) + ' ' +
        _lpad(p.hNorm.toFixed(3), 6)
      );
    }
    if (plan.length === 0) console.log('  (no geometry at this LOD — renderer handles LIGHT/MARKER independently)');
    console.groupEnd();

    return { instance: instance, plan: plan };
  }

  // ── validate() ────────────────────────────────────────────────────────────────

  function validate() {
    var result = _pvt.validateBlueprints();
    if (result.pass) {
      console.log('[PVT] validate() ✓ all blueprints valid (' +
        Object.keys(_pvt.getAllBlueprints()).length + ' classes)');
    } else {
      console.group('[PVT] validate() ✗ ' + result.errors.length + ' error(s)');
      for (var i = 0; i < result.errors.length; i++) {
        console.error('  [' + i + '] ' + result.errors[i]);
      }
      console.groupEnd();
    }
    return result;
  }

  // ── constants() ───────────────────────────────────────────────────────────────

  function constants() {
    console.group('[PVT] constants — v' + C.VERSION);
    console.log('VERSION                      :', C.VERSION);
    console.log('DEFAULT_MIN_TOPOLOGY_ZOOM    :', C.DEFAULT_MIN_TOPOLOGY_ZOOM);
    console.log('DEFAULT_MIN_CLOSE_DETAIL_ZOOM:', C.DEFAULT_MIN_CLOSE_DETAIL_ZOOM);
    console.log('DEFAULT_MAX_JITTER_NORM      :', C.DEFAULT_MAX_JITTER_NORM);
    console.log('MAX_PRIMITIVES_PER_TOPOLOGY  :', C.MAX_PRIMITIVES_PER_TOPOLOGY);
    console.log('MAX_PRIMITIVES_PER_CLOSE_DETAIL:', C.MAX_PRIMITIVES_PER_CLOSE_DETAIL);
    console.log('CANONICAL_CLASSES            :', C.CANONICAL_CLASSES.join(', '));
    console.log('VALID_LODS                   :', C.VALID_LODS.join(', '));
    console.log('VALID_PRIMITIVE_TYPES        :', C.VALID_PRIMITIVE_TYPES.join(', '));
    console.log('VALID_FILL_ROLES             :', C.VALID_FILL_ROLES.join(', '));
    console.log('LOD_RANK                     :', JSON.stringify(C.LOD_RANK));
    console.groupEnd();
  }

  // ── Bind ─────────────────────────────────────────────────────────────────────

  global._wos.vesselTopology = Object.freeze({
    catalog:    catalog,
    inspect:    inspect,
    preview:    preview,
    previewAll: previewAll,
    lodMatrix:  lodMatrix,
    emit:       emit,
    validate:   validate,
    constants:  constants,
  });

  console.log('[ProceduralVesselTopologyDebug] v' + C.VERSION +
    ' ready — _wos.vesselTopology bound (' +
    Object.keys(_pvt.getAllBlueprints()).length + ' classes)');

})(window);
