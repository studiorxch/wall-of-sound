// ── MaritimeWaterMemory v1.0.1 ────────────────────────────────────────────────
// 0526B_WOS_MaritimeWaterMemory_v1.0.1
// Status: active
// Classification: presentation-layer decaying wake-memory field
//
// Core Doctrine:
//   Water remembers motion briefly.
//   Wake memory is environmental presentation, not fluid simulation.
//   Memory may imply recent motion. Memory may not invent current entities.
//
// Authority boundaries:
//   OWNS: wake stamp recording, memory decay, water activity field presentation,
//     class-weighted wake residue, cell/stamp lifecycle, telemetry.
//   MAY OBSERVE: vessel class, speed, heading, zoom, visibility class,
//     population tier, wake profile, clutter pressure.
//   MAY NOT MUTATE: AIS truth, vessel coordinates, vessel state, wake authority,
//     continuity authority, route topology, map geometry, camera state,
//     population hierarchy, visibility class, renderer transforms,
//     Surface preset state.
//
// Governance prohibitions:
//   - Lane residue may not become route authority.
//   - Churn may not imply operational significance.
//   - Predictive navigation, traffic scoring, analytics — forbidden.
//
// Integration:
//   AISRuntime → MaritimeWakeSignature → MaritimeWaterMemory
//   → MaritimeOccupancyRenderer → Surface Presentation
//
// Placement: wall/systems/presentation/maritimeWaterMemory.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  // ── Version ───────────────────────────────────────────────────────────────────
  var VERSION = '1.0.1';

  // ── System Constants ──────────────────────────────────────────────────────────
  var DEFAULT_CELL_SIZE_PX          = 32;
  var MAX_ACTIVE_STAMPS             = 800;
  var MAX_ACTIVE_CELLS              = 1200;
  var DEFAULT_DECAY_HALF_LIFE_MS    = 4500;
  var MAX_PERSISTENCE_MS            = 14000;
  var MIN_STAMP_SPEED_KTS           = 0.8;
  var MEMORY_RENDER_ZOOM_MIN        = 11.0;
  var MEMORY_FULL_DETAIL_ZOOM       = 13.0;
  var DISCARD_THRESHOLD             = 0.015;

  // ── Wake Mode Constants (bridge from 0526A) ───────────────────────────────────
  var MODE_LINEAR      = 'LINEAR';
  var MODE_SPLIT_V     = 'SPLIT_V';
  var MODE_TURBULENT   = 'TURBULENT';
  var MODE_DRIFT       = 'DRIFT';
  var MODE_DISCIPLINED = 'DISCIPLINED';

  var VALID_WAKE_MODES = Object.freeze([
    MODE_LINEAR, MODE_SPLIT_V, MODE_TURBULENT, MODE_DRIFT, MODE_DISCIPLINED,
  ]);

  // ── Stamp Kind Constants ──────────────────────────────────────────────────────
  var KIND_WAKE_SPINE  = 'WAKE_SPINE';
  var KIND_WAKE_ARM    = 'WAKE_ARM';
  var KIND_TURBULENCE  = 'TURBULENCE';
  var KIND_DRIFT       = 'DRIFT';
  var KIND_CHURN       = 'CHURN';
  var KIND_LANE        = 'LANE';

  // ── Water Memory Profiles ─────────────────────────────────────────────────────
  //
  // baseIntensity      — starting cell intensity [0..1]
  // persistenceMs      — stamp time-to-live (before forced eviction)
  // halfLifeScale      — multiplier on DEFAULT_DECAY_HALF_LIFE_MS
  // widthScale         — multiplier on input widthPx
  // churnScale         — churn channel contribution [0..1]
  // laneFormationWeight — tendency to form visible lane residue [0..1]

  function _prof(vc, bi, pm, hl, ws, cs, lf) {
    return Object.freeze({
      vesselClass:          vc,
      baseIntensity:        bi,
      persistenceMs:        pm,
      halfLifeScale:        hl,
      widthScale:           ws,
      churnScale:           cs,
      laneFormationWeight:  lf,
    });
  }

  var _PROFILES = Object.freeze({
    CARGO:        _prof('CARGO',        0.42,  9000, 1.25, 1.00, 0.10, 0.70),
    TANKER:       _prof('TANKER',       0.34, 12000, 1.45, 1.35, 0.05, 0.55),
    FERRY:        _prof('FERRY',        0.58,  6500, 0.95, 1.10, 0.25, 0.90),
    TUG:          _prof('TUG',          0.72,  4200, 0.70, 1.20, 0.90, 0.10),
    RECREATIONAL: _prof('RECREATIONAL', 0.50,  3000, 0.55, 0.65, 0.20, 0.15),
    FISHING:      _prof('FISHING',      0.46,  5500, 0.90, 0.90, 0.35, 0.20),
    PASSENGER:    _prof('PASSENGER',    0.38,  8500, 1.15, 1.05, 0.08, 0.65),
    MILITARY:     _prof('MILITARY',     0.16,  3600, 0.65, 0.55, 0.02, 0.05),
    INDUSTRIAL:   _prof('INDUSTRIAL',   0.64,  7200, 1.00, 1.45, 0.75, 0.15),
    SERVICE:      _prof('SERVICE',      0.48,  4800, 0.80, 0.85, 0.35, 0.25),
    UNKNOWN:      _prof('UNKNOWN',      0.30,  4200, 0.80, 0.80, 0.15, 0.10),
  });

  // ── Runtime State ─────────────────────────────────────────────────────────────
  // stamps: WaterMemoryStamp[]  — ordered oldest-first
  // cells:  Map<cellId, WaterMemoryCell>  — mutable runtime accumulators

  var _stamps = [];          // Array<WaterMemoryStamp>
  var _cells  = {};          // plain object: cellId → WaterMemoryCell (mutable)
  var _cellKeys = [];        // maintained parallel to _cells for fast iteration

  // ── Telemetry ─────────────────────────────────────────────────────────────────
  var _tel = {
    stampsCreated:         0,
    stampsSuppressed:      0,
    cellsCreated:          0,
    cellsMerged:           0,
    cellsRendered:         0,
    cellsDiscarded:        0,
    totalIntensity:        0,
    maxIntensity:          0,
    laneCells:             0,
    churnCells:            0,
    viewportInvalidations: 0,
  };

  // ── Helper: clamp [0..1] ──────────────────────────────────────────────────────
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  // ── Helper: getNowMs ─────────────────────────────────────────────────────────
  // Preferred: input.nowMs → SBE.SimulationClock.now() → performance.now()
  function getNowMs(inputNowMs) {
    if (typeof inputNowMs === 'number' && inputNowMs > 0) return inputNowMs;
    if (SBE.SimulationClock && typeof SBE.SimulationClock.now === 'function') {
      return SBE.SimulationClock.now();
    }
    return (typeof performance !== 'undefined' && performance.now)
      ? performance.now()
      : Date.now();
  }

  // ── Helper: class normalization ───────────────────────────────────────────────
  function normalizeWaterMemoryClass(rawClass) {
    if (!rawClass) return 'UNKNOWN';
    var key = String(rawClass).toUpperCase().trim();
    switch (key) {
      case 'CARGO': case 'TANKER': case 'FERRY': case 'TUG':
      case 'RECREATIONAL': case 'FISHING': case 'PASSENGER':
      case 'MILITARY': case 'INDUSTRIAL': case 'SERVICE':
        return key;
      case 'SAILING': case 'YACHT': case 'PLEASURE': case 'SPEEDBOAT':
        return 'RECREATIONAL';
      case 'PILOT': case 'COAST_GUARD': case 'COASTGUARD':
      case 'SAR': case 'RESEARCH': case 'SUPPLY': case 'HOSPITAL':
      case 'STANDBY': case 'SURVEY':
        return 'SERVICE';
      case 'CRUISE':
        return 'PASSENGER';
      case 'BARGE': case 'DREDGER': case 'PLATFORM': case 'CRANE':
        return 'INDUSTRIAL';
      default:
        return 'UNKNOWN';
    }
  }

  // ── Helper: wake mode → stamp kind ───────────────────────────────────────────
  function wakeModeToStampKind(wakeMode) {
    switch (wakeMode) {
      case MODE_LINEAR:      return KIND_WAKE_SPINE;
      case MODE_SPLIT_V:     return KIND_WAKE_ARM;
      case MODE_TURBULENT:   return KIND_TURBULENCE;
      case MODE_DRIFT:       return KIND_DRIFT;
      case MODE_DISCIPLINED: return KIND_WAKE_SPINE;   // suppressed spine
      default:               return KIND_WAKE_SPINE;
    }
  }

  // ── Helper: profile resolution ────────────────────────────────────────────────
  function resolveMemoryProfile(vesselClass) {
    return _PROFILES[vesselClass] || _PROFILES.UNKNOWN;
  }

  // ── Helper: stamp ID ─────────────────────────────────────────────────────────
  function makeStampId(input, nowMs) {
    return (input.vesselId || 'anon') + '_' +
      Math.floor(input.x) + '_' + Math.floor(input.y) + '_' +
      Math.floor(nowMs);
  }

  // ── Helper: rebuild cell key list ─────────────────────────────────────────────
  function _rebuildCellKeys() {
    _cellKeys = Object.keys(_cells);
  }

  // ── Helper: enforce stamp limit ───────────────────────────────────────────────
  // Eviction order: oldest stamps by createdAtMs first.
  function enforceStampLimit(maxStamps) {
    if (_stamps.length <= maxStamps) return;
    // stamps are pushed in order, so oldest are at index 0
    var excess = _stamps.length - maxStamps;
    _stamps.splice(0, excess);
  }

  // ── Helper: enforce cell limit ────────────────────────────────────────────────
  // Eviction order: lowest-intensity cells first (preserve lane/high-intensity).
  function enforceCellLimit(maxCells) {
    _rebuildCellKeys();
    if (_cellKeys.length <= maxCells) return;

    // Sort by intensity ascending, prefer to keep lane-associated cells
    var sorted = _cellKeys.slice().sort(function (a, b) {
      var ca = _cells[a]; var cb = _cells[b];
      if (!ca) return -1; if (!cb) return 1;
      // LANE kind gets a survival bonus
      var bonusA = (ca.dominantKind === KIND_LANE) ? 0.3 : 0;
      var bonusB = (cb.dominantKind === KIND_LANE) ? 0.3 : 0;
      return (ca.intensity + bonusA) - (cb.intensity + bonusB);
    });

    var toRemove = sorted.slice(0, sorted.length - maxCells);
    for (var i = 0; i < toRemove.length; i++) {
      delete _cells[toRemove[i]];
    }
    _rebuildCellKeys();
  }

  // ── Helper: remove cells below intensity threshold ────────────────────────────
  function removeCellsBelowIntensity(threshold) {
    var keys = Object.keys(_cells);
    var discarded = 0;
    for (var i = 0; i < keys.length; i++) {
      var c = _cells[keys[i]];
      if (!c || c.intensity < threshold) {
        delete _cells[keys[i]];
        discarded++;
      }
    }
    _tel.cellsDiscarded += discarded;
    if (discarded > 0) _rebuildCellKeys();
  }

  // ── Helper: add stamp to cells ────────────────────────────────────────────────
  function addStampToCells(stamp) {
    var gridX  = Math.floor(stamp.x / DEFAULT_CELL_SIZE_PX);
    var gridY  = Math.floor(stamp.y / DEFAULT_CELL_SIZE_PX);
    var cellId = gridX + '_' + gridY;

    var headingRad     = stamp.headingDeg * Math.PI / 180;
    var headingVectorX = Math.sin(headingRad);
    var headingVectorY = -Math.cos(headingRad);
    var profile        = resolveMemoryProfile(stamp.vesselClass);
    var isChurnKind    = (stamp.kind === KIND_TURBULENCE || stamp.kind === KIND_CHURN);

    var existing = _cells[cellId];

    if (!existing) {
      _cells[cellId] = {
        cellId:         cellId,
        x:              gridX * DEFAULT_CELL_SIZE_PX + DEFAULT_CELL_SIZE_PX * 0.5,
        y:              gridY * DEFAULT_CELL_SIZE_PX + DEFAULT_CELL_SIZE_PX * 0.5,
        intensity:      stamp.intensity,
        ageMs:          0,
        createdAtMs:    stamp.createdAtMs,
        lastUpdatedMs:  stamp.createdAtMs,
        dominantClass:  stamp.vesselClass,
        dominantKind:   stamp.kind,
        headingVectorX: headingVectorX,
        headingVectorY: headingVectorY,
        churn:          isChurnKind ? profile.churnScale : 0,
      };
      _tel.cellsCreated++;
      _cellKeys = null; // invalidate; will rebuild lazily via _rebuildCellKeys
      enforceCellLimit(MAX_ACTIVE_CELLS);
    } else {
      var incomingDominates = stamp.intensity > existing.intensity;
      existing.intensity     = clamp01(existing.intensity + stamp.intensity * 0.4);
      existing.ageMs         = 0;
      existing.lastUpdatedMs = stamp.createdAtMs;
      _tel.cellsMerged++;

      if (incomingDominates) {
        existing.dominantClass  = stamp.vesselClass;
        existing.dominantKind   = stamp.kind;
        existing.headingVectorX = headingVectorX;
        existing.headingVectorY = headingVectorY;
      }
      if (isChurnKind) {
        existing.churn = clamp01(existing.churn + profile.churnScale * 0.3);
      }
    }
  }

  // Lazy rebuild helper (called before iteration if _cellKeys is null)
  function _ensureCellKeys() {
    if (!_cellKeys) _rebuildCellKeys();
  }

  // ── PUBLIC: stampWakeMemory ───────────────────────────────────────────────────
  function stampWakeMemory(input) {
    if (!input) { _tel.stampsSuppressed++; return; }
    if (input.visibilityClass === 'ATMOSPHERIC_HIDDEN') { _tel.stampsSuppressed++; return; }
    if ((input.speedKts || 0) < MIN_STAMP_SPEED_KTS) { _tel.stampsSuppressed++; return; }

    // Validate wake mode
    if (VALID_WAKE_MODES.indexOf(input.wakeMode) === -1) { _tel.stampsSuppressed++; return; }

    var nowMs   = getNowMs(input.nowMs);
    var profile = resolveMemoryProfile(input.vesselClass);
    var stamp   = {
      stampId:      makeStampId(input, nowMs),
      vesselId:     input.vesselId || null,
      vesselClass:  input.vesselClass,
      kind:         wakeModeToStampKind(input.wakeMode),
      x:            input.x,
      y:            input.y,
      headingDeg:   input.headingDeg || 0,
      lengthPx:     input.lengthPx   || 0,
      widthPx:      (input.widthPx   || 0) * profile.widthScale,
      intensity:    clamp01(input.intensity !== undefined ? input.intensity : profile.baseIntensity),
      persistenceMs: Math.min(profile.persistenceMs, MAX_PERSISTENCE_MS),
      createdAtMs:  nowMs,
      seed:         input.seed || 0,
    };
    // Freeze stamp for immutability guarantee
    Object.freeze(stamp);

    _stamps.push(stamp);
    _tel.stampsCreated++;
    enforceStampLimit(MAX_ACTIVE_STAMPS);
    addStampToCells(stamp);
  }

  // ── PUBLIC: updateWaterMemory ─────────────────────────────────────────────────
  function updateWaterMemory(deltaMs, nowMs) {
    nowMs = (typeof nowMs === 'number' && nowMs > 0) ? nowMs : getNowMs();
    deltaMs = Math.max(0, deltaMs || 0);

    // Expire stamps by persistenceMs
    var alive = [];
    for (var si = 0; si < _stamps.length; si++) {
      var s = _stamps[si];
      if (nowMs - s.createdAtMs < s.persistenceMs) alive.push(s);
    }
    _stamps = alive;

    // Decay cells
    _ensureCellKeys();
    var keys = _cellKeys;
    var removed = false;
    for (var ki = 0; ki < keys.length; ki++) {
      var cell = _cells[keys[ki]];
      if (!cell) continue;
      var profile   = resolveMemoryProfile(cell.dominantClass);
      var halfLifeMs = DEFAULT_DECAY_HALF_LIFE_MS * profile.halfLifeScale;
      cell.intensity *= Math.pow(0.5, deltaMs / halfLifeMs);
      cell.ageMs      = nowMs - cell.createdAtMs;
      if (cell.intensity < DISCARD_THRESHOLD) {
        delete _cells[keys[ki]];
        _tel.cellsDiscarded++;
        removed = true;
      }
    }
    if (removed) _rebuildCellKeys();

    enforceCellLimit(MAX_ACTIVE_CELLS);
  }

  // ── Render style ─────────────────────────────────────────────────────────────
  // "sheen"  — default atmospheric mode: long soft gradient bands, no visible cells
  // "debug"  — grid inspection: cell boundaries, heading arrow, kind label
  // "cell"   — legacy circular/directional strokes (inspection only)
  // "ribbon" — curved bezier strokes (inspection only)
  // "foam"   — scattered dash traces (inspection only)
  var VALID_RENDER_STYLES = Object.freeze(['sheen', 'debug', 'cell', 'ribbon', 'foam']);
  var _activeRenderStyle  = 'sheen';

  function _resolveRenderStyle() {
    var flag = global.SBE && global.SBE.runtimeFlags &&
               global.SBE.runtimeFlags.waterMemoryRenderStyle;
    if (flag && VALID_RENDER_STYLES.indexOf(flag) !== -1) return flag;
    return 'sheen';
  }

  // ── Viewport signature tracking ───────────────────────────────────────────────
  var _viewport = { width: 0, height: 0, dpr: 1 };

  // PUBLIC: notifyViewportChanged(sig)
  // sig: { width, height, dpr }
  // Clears memory and increments telemetry counter if any dimension changed.
  function notifyViewportChanged(sig) {
    if (!sig) return;
    var w   = sig.width  || 0;
    var h   = sig.height || 0;
    var dpr = sig.dpr    || 1;
    if (w !== _viewport.width || h !== _viewport.height || dpr !== _viewport.dpr) {
      _viewport.width  = w;
      _viewport.height = h;
      _viewport.dpr    = dpr;
      clearWaterMemory();
      _tel.viewportInvalidations = (_tel.viewportInvalidations || 0) + 1;
    }
  }

  // ── Deterministic jitter helper ───────────────────────────────────────────────
  // Returns a value in [-1, +1]. Sinusoidal hash on cell string id + integer salt.
  function _seededJitter(cellId, salt) {
    var h = 0;
    for (var ci = 0; ci < cellId.length; ci++) {
      h = (h * 31 + cellId.charCodeAt(ci)) | 0;
    }
    var raw = Math.sin(h * 9301.0 + salt * 49297.0 + 233.0) * 10000.0;
    return (raw - Math.floor(raw)) * 2.0 - 1.0;
  }

  // ── Cell color by dominant class ──────────────────────────────────────────────
  function _cellColor(vesselClass) {
    switch (vesselClass) {
      case 'CARGO':        return '#7ea8c0';
      case 'TANKER':       return '#6a9ab0';
      case 'FERRY':        return '#8cc0d8';
      case 'TUG':          return '#7890a0';
      case 'RECREATIONAL': return '#90c8e0';
      case 'FISHING':      return '#78a890';
      case 'PASSENGER':    return '#98c8e0';
      case 'MILITARY':     return '#708070';
      case 'INDUSTRIAL':   return '#708090';
      case 'SERVICE':      return '#80b0c8';
      default:             return '#80a8c0';
    }
  }

  // ── RGBA helper ───────────────────────────────────────────────────────────────
  function _rgba(color, alpha) {
    alpha = Math.max(0, Math.min(1, alpha || 0));
    var m = color.match(/^#([a-fA-F0-9]{2})([a-fA-F0-9]{2})([a-fA-F0-9]{2})$/);
    if (m) {
      return 'rgba(' + parseInt(m[1],16) + ',' + parseInt(m[2],16) + ',' +
        parseInt(m[3],16) + ',' + alpha.toFixed(3) + ')';
    }
    return 'rgba(128,168,192,' + alpha.toFixed(3) + ')';
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // ── PER-CELL DRAW PRIMITIVES ──────────────────────────────────────────────────
  // ctx.save/restore handled by renderWaterMemory outer loop.
  // opts: { color }
  // ══════════════════════════════════════════════════════════════════════════════

  // ── _drawSheenCell ────────────────────────────────────────────────────────────
  // Default atmospheric mode.
  // Draws 1–2 long, very low-alpha linear gradient bands aligned to the heading
  // vector. No visible cell boundaries, no dashes, no blobs, no labels.
  //
  // Per-kind tuning:
  //   WAKE_SPINE  (cargo/tanker/passenger) — single long narrow band, ~0.09 alpha
  //   WAKE_ARM    (ferry/service/recr.)    — two soft parallel bands, ~0.08 alpha
  //   TURBULENCE  (tug/industrial)         — single short wide band, ~0.10 alpha
  //   DRIFT       (fishing)                — single asymmetrically offset band
  //   default/CHURN/LANE                  — single medium band
  //
  // Max cell alpha kept ≤ 0.10 in normal sheen mode so the layer never
  // overwhelms active wakes or vessel sprites.
  function _drawSheenCell(ctx, cell, cellAlpha, opts) {
    var color = opts.color;
    var id    = cell.cellId;
    var S     = DEFAULT_CELL_SIZE_PX;
    var hvx   = cell.headingVectorX;
    var hvy   = cell.headingVectorY;
    // Perpendicular axis
    var pvx   = -hvy;
    var pvy   =  hvx;
    var kind  = cell.dominantKind;

    // Small seeded perpendicular offset breaks grid alignment between cells
    var perpOffset = _seededJitter(id, 0) * S * 0.38;

    // Inline gradient builder — fully transparent at both ends
    function _sheenGrad(x0, y0, x1, y1, peak) {
      var g = ctx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0.00, _rgba(color, 0));
      g.addColorStop(0.18, _rgba(color, peak * 0.40));
      g.addColorStop(0.50, _rgba(color, peak));
      g.addColorStop(0.82, _rgba(color, peak * 0.40));
      g.addColorStop(1.00, _rgba(color, 0));
      return g;
    }

    // Single band helper
    function _band(offX, offY, len, width, peak) {
      var ox = pvx * offX - pvy * offY;
      var oy = pvy * offX + pvx * offY;
      var x0 = cell.x + ox - hvx * len * 0.5;
      var y0 = cell.y + oy - hvy * len * 0.5;
      var x1 = cell.x + ox + hvx * len * 0.5;
      var y1 = cell.y + oy + hvy * len * 0.5;
      ctx.globalAlpha = 1;
      ctx.strokeStyle = _sheenGrad(x0, y0, x1, y1, peak);
      ctx.lineWidth   = Math.max(2, width);
      ctx.lineCap     = 'round';
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }

    if (kind === KIND_WAKE_SPINE) {
      // Long narrow: cargo, tanker, passenger — barely visible
      var spineLen = S * (3.8 + cell.intensity * 1.6);
      var spineW   = S * (0.22 + cell.intensity * 0.10);
      var spinePk  = Math.min(0.09, cellAlpha * 0.80);
      _band(perpOffset, 0, spineLen, spineW, spinePk);

    } else if (kind === KIND_WAKE_ARM) {
      // Two offset parallel bands: ferry, service, recreational
      var armLen = S * (2.8 + cell.intensity * 1.2);
      var armW   = S * (0.18 + cell.intensity * 0.08);
      var armPk  = Math.min(0.08, cellAlpha * 0.72);
      var spread = S * 0.30;
      _band(perpOffset + spread,  0, armLen, armW, armPk);
      _band(perpOffset - spread,  0, armLen, armW, armPk * 0.75);

    } else if (kind === KIND_TURBULENCE) {
      // Short, slightly wider cloudy smear: tug, industrial
      var turbLen = S * (1.8 + cell.churn * 0.8);
      var turbW   = S * (0.38 + cell.churn * 0.22);
      var turbPk  = Math.min(0.10, cellAlpha * 0.88);
      _band(perpOffset, 0, turbLen, turbW, turbPk);

    } else if (kind === KIND_DRIFT) {
      // Asymmetric smear: fishing — offset to one side
      var driftLen  = S * (2.4 + cell.intensity * 0.8);
      var driftW    = S * (0.28 + cell.intensity * 0.10);
      var driftPk   = Math.min(0.09, cellAlpha * 0.78);
      var asymOff   = S * 0.28;  // slight starboard bias
      _band(perpOffset + asymOff, 0, driftLen, driftW, driftPk);

    } else {
      // Generic / CHURN / LANE
      var genLen = S * (2.4 + cell.intensity * 1.0);
      var genW   = S * (0.26 + cell.intensity * 0.10);
      var genPk  = Math.min(0.09, cellAlpha * 0.76);
      _band(perpOffset, 0, genLen, genW, genPk);
    }

    // Optional second band when intensity is high enough (accumulated lane)
    if (cell.intensity > 0.45 && kind !== KIND_TURBULENCE) {
      var b2off = _seededJitter(id, 1) * S * 0.20;
      var b2len = S * (1.8 + cell.intensity * 0.8);
      var b2w   = S * 0.14;
      var b2pk  = Math.min(0.05, cellAlpha * 0.40);
      _band(b2off, 0, b2len, b2w, b2pk);
    }
  }

  // ── _drawDebugCell ────────────────────────────────────────────────────────────
  // Inspection overlay: cell boundary, heading arrow, kind/intensity label.
  function _drawDebugCell(ctx, cell, cellAlpha, opts) {
    var color = opts.color;
    var S     = DEFAULT_CELL_SIZE_PX;
    var hw    = S * 0.48;

    ctx.globalAlpha = Math.min(0.40, cellAlpha * 2.0);
    ctx.strokeStyle = color;
    ctx.lineWidth   = 0.5;
    ctx.strokeRect(cell.x - hw, cell.y - hw, S * 0.96, S * 0.96);

    ctx.globalAlpha = Math.min(0.20, cellAlpha * 1.5);
    ctx.fillStyle   = color;
    ctx.fillRect(cell.x - hw, cell.y - hw, S * 0.96, S * 0.96);

    var arrLen = hw * 0.75;
    ctx.globalAlpha = Math.min(0.85, cellAlpha * 4.0);
    ctx.strokeStyle = color;
    ctx.lineWidth   = 1.0;
    ctx.lineCap     = 'round';
    ctx.beginPath();
    ctx.moveTo(cell.x, cell.y);
    ctx.lineTo(cell.x + cell.headingVectorX * arrLen,
               cell.y + cell.headingVectorY * arrLen);
    ctx.stroke();

    ctx.globalAlpha = Math.min(0.80, cellAlpha * 4.0);
    ctx.fillStyle   = color;
    ctx.font        = '7px monospace';
    ctx.fillText(cell.dominantKind.slice(0, 3) + ' ' + cell.intensity.toFixed(2),
                 cell.x - hw + 1, cell.y - hw + 8);

    ctx.globalAlpha = 1;
  }

  // ── _drawRibbonCell / _drawFoamCell ──────────────────────────────────────────
  // Kept as inspection-only alternatives (setStyle("ribbon") / setStyle("foam")).
  // Not called in default sheen mode.

  function _drawRibbonCell(ctx, cell, cellAlpha, opts) {
    // Simplified: single gradient stroke along heading, seeded bend offset
    var color = opts.color;
    var id    = cell.cellId;
    var S     = DEFAULT_CELL_SIZE_PX;
    var len   = S * (2.0 + cell.intensity * 1.5);
    var width = Math.max(1.5, S * (0.15 + cell.intensity * 0.08));
    var jPerp = _seededJitter(id, 0) * S * 0.18;
    var hvx = cell.headingVectorX; var hvy = cell.headingVectorY;
    var pvx = -hvy; var pvy = hvx;
    var x0 = cell.x - hvx * len * 0.5 + pvx * jPerp;
    var y0 = cell.y - hvy * len * 0.5 + pvy * jPerp;
    var x1 = cell.x + hvx * len * 0.5 + pvx * jPerp;
    var y1 = cell.y + hvy * len * 0.5 + pvy * jPerp;
    var g  = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0,   _rgba(color, 0));
    g.addColorStop(0.3, _rgba(color, cellAlpha * 0.55));
    g.addColorStop(0.7, _rgba(color, cellAlpha * 0.55));
    g.addColorStop(1,   _rgba(color, 0));
    ctx.globalAlpha = 1;
    ctx.strokeStyle = g;
    ctx.lineWidth   = width;
    ctx.lineCap     = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }

  function _drawFoamCell(ctx, cell, cellAlpha, opts) {
    var color = opts.color;
    var id    = cell.cellId;
    var S     = DEFAULT_CELL_SIZE_PX;
    var n     = 4;
    for (var di = 0; di < n; di++) {
      var ox   = _seededJitter(id, di * 3)     * S * 0.45;
      var oy   = _seededJitter(id, di * 3 + 1) * S * 0.45;
      var dlen = S * (0.25 + Math.abs(_seededJitter(id, di * 3 + 2)) * 0.20);
      var dang = Math.atan2(cell.headingVectorY, cell.headingVectorX) +
                 _seededJitter(id, di + 20) * 0.45;
      ctx.globalAlpha = cellAlpha * (0.28 + Math.abs(_seededJitter(id, di + 30)) * 0.22);
      ctx.strokeStyle = color;
      ctx.lineWidth   = Math.max(0.7, S * 0.09);
      ctx.lineCap     = 'round';
      ctx.beginPath();
      ctx.moveTo(cell.x + ox - Math.cos(dang) * dlen * 0.5,
                 cell.y + oy - Math.sin(dang) * dlen * 0.5);
      ctx.lineTo(cell.x + ox + Math.cos(dang) * dlen * 0.5,
                 cell.y + oy + Math.sin(dang) * dlen * 0.5);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // ── PUBLIC: renderWaterMemory ─────────────────────────────────────────────────
  //
  // options:
  //   zoom                   — map zoom
  //   globalAlphaModifier    — [0..1]
  //   clutterPressure        — [0..1]
  //   isAtmosphericSuppressed — hard suppress
  //   showLanes, showChurn   — boolean filters
  //   renderStyle            — overrides runtimeFlags (debug/testing only)
  function renderWaterMemory(ctx, options) {
    options = options || {};
    if (options.isAtmosphericSuppressed) return;

    var zoom = options.zoom || 12.0;
    if (zoom < MEMORY_RENDER_ZOOM_MIN) return;

    var style = options.renderStyle || _resolveRenderStyle();
    _activeRenderStyle = style;

    var clutter  = options.clutterPressure || 0;
    var alphaMod = (options.globalAlphaModifier !== undefined)
      ? options.globalAlphaModifier : 1.0;
    var showLanes = (options.showLanes !== false);
    var showChurn = (options.showChurn !== false);

    var zoomFade = Math.min(1.0, (zoom - MEMORY_RENDER_ZOOM_MIN) /
      (MEMORY_FULL_DETAIL_ZOOM - MEMORY_RENDER_ZOOM_MIN));

    if (clutter >= 0.90) return;
    var clutterMult = clutter < 0.40 ? 1.0
                    : clutter < 0.60 ? 0.85
                    : clutter < 0.75 ? 0.65
                    : 0.40;

    // Sheen base alpha is intentionally low — max ~0.10 at full intensity
    var sheenScale = (style === 'sheen') ? 0.12 : 1.0;
    var baseAlpha  = alphaMod * zoomFade * clutterMult * sheenScale;
    if (baseAlpha < 0.002) return;

    _ensureCellKeys();
    var keys     = _cellKeys;
    var rendered = 0;
    var totalInt = 0;
    var maxInt   = 0;
    var laneCt   = 0;
    var churnCt  = 0;

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';

    for (var ki = 0; ki < keys.length; ki++) {
      var cell = _cells[keys[ki]];
      if (!cell || cell.intensity < DISCARD_THRESHOLD) continue;

      var isChurnCell = cell.churn > 0.3;
      var isLaneCell  = cell.dominantKind === KIND_LANE ||
                        cell.dominantKind === KIND_WAKE_SPINE ||
                        (cell.dominantKind === KIND_WAKE_ARM && cell.intensity > 0.3);

      if (isChurnCell && !showChurn && clutter >= 0.75) continue;
      if (!isLaneCell && !isChurnCell && clutter >= 0.75) continue;

      var cellAlpha = cell.intensity * baseAlpha;
      if (cellAlpha < 0.002) continue;

      var color    = _cellColor(cell.dominantClass);
      var drawOpts = { color: color };

      if (style === 'sheen') {
        _drawSheenCell(ctx, cell, cellAlpha, drawOpts);
      } else if (style === 'ribbon') {
        _drawRibbonCell(ctx, cell, cellAlpha, drawOpts);
      } else if (style === 'foam') {
        _drawFoamCell(ctx, cell, cellAlpha, drawOpts);
      } else if (style === 'cell') {
        // Legacy circular/directional (inspection)
        var S2 = DEFAULT_CELL_SIZE_PX;
        var r  = S2 * 0.58;
        if (isChurnCell) {
          ctx.globalAlpha = cellAlpha * 0.55;
          ctx.fillStyle   = color;
          ctx.beginPath();
          ctx.arc(cell.x, cell.y, r * (1.0 + cell.churn * 0.8), 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        } else {
          var cdx = cell.headingVectorX * r * 1.4;
          var cdy = cell.headingVectorY * r * 1.4;
          var cg  = ctx.createLinearGradient(
            cell.x - cdx, cell.y - cdy, cell.x + cdx, cell.y + cdy);
          cg.addColorStop(0,   _rgba(color, 0));
          cg.addColorStop(0.3, _rgba(color, cellAlpha * 0.48));
          cg.addColorStop(0.7, _rgba(color, cellAlpha * 0.48));
          cg.addColorStop(1,   _rgba(color, 0));
          ctx.globalAlpha = 1;
          ctx.strokeStyle = cg;
          ctx.lineWidth   = r * (0.6 + cell.churn * 0.5);
          ctx.lineCap     = 'round';
          ctx.beginPath();
          ctx.moveTo(cell.x - cdx, cell.y - cdy);
          ctx.lineTo(cell.x + cdx, cell.y + cdy);
          ctx.stroke();
        }
      } else {
        // "debug"
        _drawDebugCell(ctx, cell, cellAlpha, drawOpts);
      }

      if (isLaneCell && showLanes) laneCt++;
      if (isChurnCell) churnCt++;
      rendered++;
      totalInt += cell.intensity;
      if (cell.intensity > maxInt) maxInt = cell.intensity;
    }

    ctx.globalAlpha = 1;
    ctx.restore();

    _tel.cellsRendered  = rendered;
    _tel.totalIntensity = totalInt;
    _tel.maxIntensity   = maxInt;
    _tel.laneCells      = laneCt;
    _tel.churnCells     = churnCt;
  }

  // ── PUBLIC: clearWaterMemory ──────────────────────────────────────────────────
  // Removes all cells and stamps. Resets telemetry counters.
  // Preserves: flags, constants, viewport signature, viewportInvalidations count.
  function clearWaterMemory() {
    _stamps   = [];
    _cells    = {};
    _cellKeys = [];
    // Preserve viewportInvalidations across clears (it counts total events)
    var prevInvalidations = _tel.viewportInvalidations || 0;
    _tel.stampsCreated      = 0;
    _tel.stampsSuppressed   = 0;
    _tel.cellsCreated       = 0;
    _tel.cellsMerged        = 0;
    _tel.cellsRendered      = 0;
    _tel.cellsDiscarded     = 0;
    _tel.totalIntensity     = 0;
    _tel.maxIntensity       = 0;
    _tel.laneCells          = 0;
    _tel.churnCells         = 0;
    _tel.viewportInvalidations = prevInvalidations;
  }

  // ── PUBLIC: getWaterMemorySnapshot ────────────────────────────────────────────
  function getWaterMemorySnapshot() {
    _ensureCellKeys();
    var keys = _cellKeys;
    var totalInt = 0;
    var maxInt   = 0;
    var domCounts = {};
    for (var ki = 0; ki < keys.length; ki++) {
      var c = _cells[keys[ki]];
      if (!c) continue;
      totalInt += c.intensity;
      if (c.intensity > maxInt) maxInt = c.intensity;
      domCounts[c.dominantClass] = (domCounts[c.dominantClass] || 0) + c.intensity;
    }
    var domClass = null;
    var domMax   = 0;
    var dks = Object.keys(domCounts);
    for (var di = 0; di < dks.length; di++) {
      if (domCounts[dks[di]] > domMax) { domMax = domCounts[dks[di]]; domClass = dks[di]; }
    }
    return Object.freeze({
      version:               VERSION,
      active:                keys.length > 0,
      stampCount:            _stamps.length,
      cellCount:             keys.length,
      totalIntensity:        totalInt,
      maxIntensity:          maxInt,
      dominantClass:         domClass,
      lastUpdateMs:          getNowMs(),
      renderStyle:           _activeRenderStyle,
      viewportInvalidations: _tel.viewportInvalidations || 0,
      lastViewportSignature: Object.freeze({
        width:  _viewport.width,
        height: _viewport.height,
        dpr:    _viewport.dpr,
      }),
    });
  }

  // ── PUBLIC: getCells ──────────────────────────────────────────────────────────
  function getCells() {
    _ensureCellKeys();
    var keys  = _cellKeys;
    var arr   = [];
    for (var ki = 0; ki < keys.length; ki++) {
      var c = _cells[keys[ki]];
      if (c) arr.push(c);
    }
    return Object.freeze(arr);
  }

  // ── PUBLIC: getConstants ──────────────────────────────────────────────────────
  function getConstants() {
    return Object.freeze({
      VERSION:                    VERSION,
      DEFAULT_CELL_SIZE_PX:       DEFAULT_CELL_SIZE_PX,
      MAX_ACTIVE_STAMPS:          MAX_ACTIVE_STAMPS,
      MAX_ACTIVE_CELLS:           MAX_ACTIVE_CELLS,
      DEFAULT_DECAY_HALF_LIFE_MS: DEFAULT_DECAY_HALF_LIFE_MS,
      MAX_PERSISTENCE_MS:         MAX_PERSISTENCE_MS,
      MIN_STAMP_SPEED_KTS:        MIN_STAMP_SPEED_KTS,
      MEMORY_RENDER_ZOOM_MIN:     MEMORY_RENDER_ZOOM_MIN,
      MEMORY_FULL_DETAIL_ZOOM:    MEMORY_FULL_DETAIL_ZOOM,
      DISCARD_THRESHOLD:          DISCARD_THRESHOLD,
      VALID_WAKE_MODES:           VALID_WAKE_MODES,
      VALID_RENDER_STYLES:        VALID_RENDER_STYLES,
      DEFAULT_RENDER_STYLE:       'sheen',
    });
  }

  // ── Export ────────────────────────────────────────────────────────────────────

  SBE.MaritimeWaterMemory = Object.freeze({
    // Public API
    stampWakeMemory:        stampWakeMemory,
    updateWaterMemory:      updateWaterMemory,
    renderWaterMemory:      renderWaterMemory,
    clearWaterMemory:       clearWaterMemory,
    notifyViewportChanged:  notifyViewportChanged,
    getWaterMemorySnapshot: getWaterMemorySnapshot,
    getCells:               getCells,
    getConstants:           getConstants,

    // Internal helpers exposed for debug companion and testing
    normalizeWaterMemoryClass: normalizeWaterMemoryClass,
    wakeModeToStampKind:       wakeModeToStampKind,
    resolveMemoryProfile:      resolveMemoryProfile,

    // Render primitives (inspection)
    _drawSheenCell:  _drawSheenCell,
    _drawRibbonCell: _drawRibbonCell,
    _drawFoamCell:   _drawFoamCell,
    _drawDebugCell:  _drawDebugCell,
    _seededJitter:   _seededJitter,
  });

  // ── Hard-disable on boot ──────────────────────────────────────────────────────
  // Force the flag off regardless of any prior runtimeFlags state.
  // Nothing in this module may produce visual output until
  // SBE.runtimeFlags.showMaritimeWaterMemory is explicitly set to true.
  if (!global.SBE)              global.SBE              = {};
  if (!global.SBE.runtimeFlags) global.SBE.runtimeFlags = {};
  global.SBE.runtimeFlags.showMaritimeWaterMemory = false;

  console.log('[MaritimeWaterMemory] v' + VERSION +
    ' loaded — ' + Object.keys(_PROFILES).length + ' class profiles, ' +
    'cell size ' + DEFAULT_CELL_SIZE_PX + 'px, ' +
    'max ' + MAX_ACTIVE_CELLS + ' cells / ' + MAX_ACTIVE_STAMPS + ' stamps');
  console.log('[MaritimeWaterMemory] DISABLED — no visual output until ' +
    '_wos.waterMemory.enable() or SBE.runtimeFlags.showMaritimeWaterMemory = true');

})(window);
