// ── MapboxTileTelemetry v1.0.0 ────────────────────────────────────────────────
// 0528AB_WOS_MapboxTileTelemetryAndDeepCorridorWarmup_v1.0.0
// Status: active
// Classification: debug-telemetry — safe in production, overlay off by default
//
// Purpose:
//   Instruments the visible Mapbox map to capture tile load events, building
//   feature counts, and pop-in events. Answers the diagnostic question:
//
//     Is late geometry caused by insufficient preload horizon,
//     or by Mapbox streaming itself being the ceiling?
//
// Tracks:
//   tilesRequested / tilesLoaded / tilesPending — tile lifecycle
//   sourceLoads / idleEvents / styleReloads     — map lifecycle
//   fill-extrusion / road / water feature counts — per 2s audit
//   BUILDING POP events — >25% jump in extrusion count within 1s
//
// Exposes:
//   SBE.MapboxTileTelemetry   — runtime
//   _wos.debug.tiles.audit()  — full report
//   _wos.debug.tiles.state()  — compact one-liner
//   _wos.debug.tiles.overlay(bool) — show/hide HUD
//
// Placement: wall/systems/presentation/mapboxTileTelemetry.js
// Load: AFTER tilePreloadDebug.js, BEFORE traversalControlDeck.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  // ── Config ────────────────────────────────────────────────────────────────────

  var AUDIT_INTERVAL_MS  = 2000;    // feature count query cadence
  var HISTORY_DEPTH      = 30;      // rolling samples kept (~60 seconds)
  var POP_THRESHOLD      = 0.25;    // 25% relative jump triggers pop event
  var POP_MIN_ABS        = 20;      // minimum absolute increase to count
  var POP_COOLDOWN_MS    = 1500;    // ignore repeats within this window
  var MAX_POP_LOG        = 50;      // max stored pop events

  // ── State ─────────────────────────────────────────────────────────────────────

  var _enabled     = false;
  var _map         = null;
  var _auditTimer  = null;
  var _overlayEl   = null;
  var _overlayOn   = false;

  var _stats = {
    tilesRequested:  0,
    tilesLoaded:     0,
    tilesPending:    0,
    sourceLoads:     0,
    idleEvents:      0,
    styleReloads:    0,
    renderFrames:    0,
    lastIdleMs:      0,
    lastRenderMs:    0,
    isIdle:          false,
  };

  var _features = {
    extrusion:  0,
    roads:      0,
    water:      0,
    total:      0,
    lastMs:     0,
  };

  // Rolling history: [{ts, extrusion, roads, water, tilesLoaded, tilesPending, isIdle}]
  var _history   = [];

  // Pop events: [{ts, lat, lng, zoom, pitch, prevCount, newCount, delta, tilesPending}]
  var _popEvents = [];
  var _lastPopMs = 0;

  // Layer ID cache — populated on first audit from map style
  var _layers = {
    extrusion: null,   // string[]
    road:      null,   // string[]
    water:     null,   // string[]
  };

  // ── Map access ────────────────────────────────────────────────────────────────

  function _getMap() {
    if (_map) return _map;
    var mvr = global.SBE && SBE.MapboxViewportRuntime;
    return (mvr && typeof mvr.getMap === 'function') ? mvr.getMap() : null;
  }

  // ── Layer catalog (computed once, cached) ─────────────────────────────────────
  // Scans by type AND by layer ID / source-layer name patterns.
  // Mapbox styles may represent buildings through fill-extrusion layers whose
  // IDs don't contain "building" or through composite sources with a
  // "building" source-layer.

  function _ensureLayers(map) {
    if (_layers.extrusion) return;  // already computed
    try {
      var style = map.getStyle();
      if (!style || !style.layers) return;

      _layers.extrusion = [];
      _layers.road      = [];
      _layers.water     = [];

      style.layers.forEach(function (l) {
        if (!l.id) return;
        var id    = l.id.toLowerCase();
        var srcL  = ((l['source-layer'] || '')).toLowerCase();

        if (l.type === 'fill-extrusion') {
          // All fill-extrusion layers — covers 3D buildings, structures
          _layers.extrusion.push(l.id);
        } else if (
          id.indexOf('building') !== -1 || id.indexOf('extrusion') !== -1 ||
          id.indexOf('structure') !== -1 ||
          srcL.indexOf('building') !== -1 || srcL.indexOf('structure') !== -1
        ) {
          // Building-named fill/symbol layers that might hold building geometry
          _layers.extrusion.push(l.id);
        } else if (
          id.indexOf('road') !== -1 || id.indexOf('street') !== -1 ||
          id.indexOf('highway') !== -1 || id.indexOf('path') !== -1 ||
          srcL.indexOf('road') !== -1
        ) {
          _layers.road.push(l.id);
        } else if (
          id.indexOf('water') !== -1 || id.indexOf('ocean') !== -1 ||
          id.indexOf('sea')   !== -1 || id.indexOf('river') !== -1 ||
          srcL.indexOf('water') !== -1
        ) {
          _layers.water.push(l.id);
        }
      });

      console.log('[MapboxTileTelemetry] extrusion layers:', _layers.extrusion);
      console.log('[MapboxTileTelemetry] layers catalogued —',
        'extrusion:', _layers.extrusion.length,
        '| road:', _layers.road.length,
        '| water:', _layers.water.length);

      if (_layers.extrusion.length === 0) {
        console.warn('[MapboxTileTelemetry] No fill-extrusion layers found.',
          'Style may render buildings through a different layer/source or 3D terrain model.',
          'Fallback: will use broad queryRenderedFeatures scan.');
      }
    } catch (e) {
      console.warn('[MapboxTileTelemetry] layer catalog failed:', e.message);
    }
  }

  // ── Feature count query ───────────────────────────────────────────────────────
  // Queries rendered features for each layer group.
  // Called every AUDIT_INTERVAL_MS — NOT per frame.

  function _queryFeatures(map) {
    _ensureLayers(map);
    if (!map.isStyleLoaded || !map.isStyleLoaded()) return;

    var extCount   = 0;
    var roadCount  = 0;
    var waterCount = 0;

    try {
      if (_layers.extrusion && _layers.extrusion.length) {
        var ef = map.queryRenderedFeatures(undefined, { layers: _layers.extrusion });
        extCount = ef ? ef.length : 0;
      }
    } catch (e) { /* style not ready */ }

    // Fallback: if explicit layer query returns 0, scan all rendered features
    // for any that match building/extrusion patterns by layer type or ID.
    // This handles Mapbox styles where 3D buildings use non-standard layer IDs.
    if (extCount === 0) {
      try {
        var allFeatures = map.queryRenderedFeatures();
        if (allFeatures && allFeatures.length) {
          var fallbackCount = 0;
          for (var fi = 0; fi < allFeatures.length; fi++) {
            var f = allFeatures[fi];
            if (!f.layer) continue;
            var fType  = f.layer.type  || '';
            var fId    = (f.layer.id   || '').toLowerCase();
            var fSrcL  = (f.sourceLayer || '').toLowerCase();
            if (
              fType === 'fill-extrusion' ||
              fId.indexOf('building') !== -1 ||
              fId.indexOf('extrusion') !== -1 ||
              fId.indexOf('structure') !== -1 ||
              fSrcL.indexOf('building') !== -1 ||
              fSrcL.indexOf('structure') !== -1
            ) {
              fallbackCount++;
            }
          }
          extCount = fallbackCount;
        }
      } catch (e) { /* queryRenderedFeatures unavailable */ }
    }

    try {
      if (_layers.road && _layers.road.length) {
        var rf = map.queryRenderedFeatures(undefined, { layers: _layers.road });
        roadCount = rf ? rf.length : 0;
      }
    } catch (e) {}

    try {
      if (_layers.water && _layers.water.length) {
        var wf = map.queryRenderedFeatures(undefined, { layers: _layers.water });
        waterCount = wf ? wf.length : 0;
      }
    } catch (e) {}

    var prevExtrusion = _features.extrusion;
    _features.extrusion = extCount;
    _features.roads     = roadCount;
    _features.water     = waterCount;
    _features.total     = extCount + roadCount + waterCount;
    _features.lastMs    = Date.now();

    // ── Pop-in detection ────────────────────────────────────────────────────────
    var now    = Date.now();
    var delta  = extCount - prevExtrusion;
    var relJump = prevExtrusion > 0 ? delta / prevExtrusion : 0;

    if (delta > POP_MIN_ABS && relJump > POP_THRESHOLD &&
        (now - _lastPopMs) > POP_COOLDOWN_MS) {
      _lastPopMs = now;
      var center = map.getCenter();

      var popEvent = {
        ts:           now,
        lat:          Math.round(center.lat * 1e5) / 1e5,
        lng:          Math.round(center.lng * 1e5) / 1e5,
        zoom:         Math.round(map.getZoom() * 100) / 100,
        pitch:        Math.round(map.getPitch() * 10) / 10,
        prevCount:    prevExtrusion,
        newCount:     extCount,
        delta:        delta,
        relJump:      Math.round(relJump * 1000) / 1000,
        tilesPending: _stats.tilesPending,
        isIdle:       _stats.isIdle,
      };

      _popEvents.push(popEvent);
      if (_popEvents.length > MAX_POP_LOG) _popEvents.splice(0, _popEvents.length - MAX_POP_LOG);

      console.warn(
        '🏗️  BUILDING POP EVENT',
        '| ↑' + delta + ' buildings (+' + Math.round(relJump * 100) + '%)',
        '| lat', popEvent.lat, 'lng', popEvent.lng,
        '| zoom', popEvent.zoom, 'pitch', popEvent.pitch + '°',
        '| tiles pending:', _stats.tilesPending,
        '| idle:', _stats.isIdle
      );
    }
  }

  // ── History record ────────────────────────────────────────────────────────────

  function _recordHistory() {
    _history.push({
      ts:           Date.now(),
      extrusion:    _features.extrusion,
      roads:        _features.roads,
      water:        _features.water,
      tilesLoaded:  _stats.tilesLoaded,
      tilesPending: _stats.tilesPending,
      isIdle:       _stats.isIdle,
    });
    if (_history.length > HISTORY_DEPTH) _history.splice(0, _history.length - HISTORY_DEPTH);
  }

  // ── Overlay ───────────────────────────────────────────────────────────────────

  function _createOverlay() {
    if (_overlayEl && document.body.contains(_overlayEl)) return _overlayEl;

    _overlayEl = document.createElement('div');
    _overlayEl.id = 'wos-tile-telemetry-hud';
    _overlayEl.style.cssText = [
      'position:fixed',
      'left:12px',
      'top:12px',
      'z-index:9000',
      'background:rgba(4,5,7,0.88)',
      'border:1px solid rgba(255,255,255,0.10)',
      'border-radius:5px',
      'padding:10px 13px',
      'font-family:"SF Mono","Fira Mono",ui-monospace,monospace',
      'font-size:11px',
      'line-height:1.65',
      'color:rgba(255,255,255,0.75)',
      'pointer-events:none',
      'backdrop-filter:blur(8px)',
      '-webkit-backdrop-filter:blur(8px)',
      'min-width:160px',
      'white-space:pre',
    ].join(';');
    document.body.appendChild(_overlayEl);
    return _overlayEl;
  }

  function _removeOverlay() {
    if (_overlayEl && _overlayEl.parentElement) {
      _overlayEl.parentElement.removeChild(_overlayEl);
    }
    _overlayEl = null;
  }

  function _updateOverlay() {
    if (!_overlayOn || !_overlayEl) return;

    var map       = _getMap();
    var idle      = _stats.isIdle;
    var ptpr      = global.SBE && SBE.PredictiveTilePreloadRuntime;
    var ptprState = ptpr ? ptpr.getState() : null;

    var lookaheadKm = '—';
    if (ptprState && ptprState.preflight && ptprState.preflight.targetDistM > 0) {
      lookaheadKm = (ptprState.preflight.targetDistM / 1000).toFixed(0) + 'km';
    } else if (ptprState && ptprState.lookaheadOffsets && ptprState.lookaheadOffsets.length) {
      lookaheadKm = ptprState.lookaheadOffsets.length + '-pt rolling';
    }

    var warmupLine = '—';
    if (ptprState && ptprState.preflight) {
      var pf = ptprState.preflight;
      if (pf.active) {
        warmupLine = 'ACTIVE ' + pf.warmedCount + '/' +
          Math.ceil(pf.targetDistM / Math.max(1, pf.stepM)) + ' pos';
      } else if (pf.lastResult) {
        warmupLine = pf.lastResult.timedOut ? 'TIMEOUT' :
                     pf.lastResult.ok       ? 'DONE ' + pf.lastResult.warmedCount + ' pos' : '—';
      }
    }

    var popLine = _popEvents.length > 0
      ? _popEvents.length + ' events (last ' + Math.round((Date.now() - _popEvents[_popEvents.length - 1].ts) / 1000) + 's ago)'
      : 'none';

    var zoom  = map ? map.getZoom().toFixed(1) : '?';
    var pitch = map ? map.getPitch().toFixed(0) : '?';

    _overlayEl.textContent = [
      'TILES',
      '  Loaded   ' + _stats.tilesLoaded,
      '  Pending  ' + _stats.tilesPending,
      '  Requests ' + _stats.tilesRequested,
      '  Idle     ' + (idle ? 'YES' : 'no'),
      '',
      'BUILDINGS',
      '  Rendered ' + _features.extrusion.toLocaleString(),
      '  Roads    ' + _features.roads.toLocaleString(),
      '  Water    ' + _features.water.toLocaleString(),
      '',
      'CAMERA',
      '  z' + zoom + '  p' + pitch + '°',
      '',
      'LOOKAHEAD',
      '  ' + lookaheadKm,
      '',
      'WARMUP',
      '  ' + warmupLine,
      '',
      'POP-IN',
      '  ' + popLine,
    ].join('\n');
  }

  // ── Event listeners ───────────────────────────────────────────────────────────

  function _bindEvents(map) {
    // Tile lifecycle
    map.on('dataloading', function (e) {
      if (e.dataType === 'source' && e.tile) {
        _stats.tilesRequested++;
        _stats.tilesPending = Math.max(0, _stats.tilesPending + 1);
      }
    });

    map.on('sourcedata', function (e) {
      _stats.sourceLoads++;
      if (e.dataType === 'source' && e.tile) {
        // A tile-specific sourcedata event — tile loaded/updated
        _stats.tilesLoaded++;
        _stats.tilesPending = Math.max(0, _stats.tilesPending - 1);
      }
    });

    map.on('styledata', function () {
      _stats.styleReloads++;
      // Style changed — invalidate layer cache so next audit re-catalogues
      _layers.extrusion = null;
      _layers.road      = null;
      _layers.water     = null;
    });

    map.on('idle', function () {
      _stats.idleEvents++;
      _stats.lastIdleMs  = Date.now();
      _stats.isIdle      = true;
      _stats.tilesPending = 0;  // idle means all tiles resolved
    });

    map.on('render', function () {
      _stats.renderFrames++;
      _stats.lastRenderMs = Date.now();
      _stats.isIdle = false;   // any render means not idle
    });
  }

  // ── Audit loop ────────────────────────────────────────────────────────────────

  function _audit() {
    var map = _getMap();
    if (!map) return;

    // Sync idle state from map API (authoritative source)
    if (typeof map.areTilesLoaded === 'function') {
      _stats.isIdle = map.areTilesLoaded();
      if (_stats.isIdle) _stats.tilesPending = 0;
    }

    _queryFeatures(map);
    _recordHistory();
    _updateOverlay();
  }

  // ── Public controls ───────────────────────────────────────────────────────────

  function start() {
    if (_enabled) return;

    var map = _getMap();
    if (!map) {
      console.warn('[MapboxTileTelemetry] map not ready — retrying in 1s');
      global.setTimeout(start, 1000);
      return;
    }

    _map = map;
    _enabled = true;
    _bindEvents(map);
    _auditTimer = global.setInterval(_audit, AUDIT_INTERVAL_MS);
    _audit();   // immediate first pass

    console.log('[MapboxTileTelemetry] v' + VERSION + ' started — auditing every', AUDIT_INTERVAL_MS + 'ms');
  }

  function stop() {
    if (!_enabled) return;
    _enabled = false;
    if (_auditTimer) { global.clearInterval(_auditTimer); _auditTimer = null; }
    _removeOverlay();
    _overlayOn = false;
    console.log('[MapboxTileTelemetry] stopped');
  }

  function overlay(show) {
    if (show === undefined) show = !_overlayOn;
    _overlayOn = !!show;
    if (_overlayOn) {
      _createOverlay();
      if (!_enabled) start();
      _updateOverlay();
      console.log('[MapboxTileTelemetry] overlay ON');
    } else {
      _removeOverlay();
      console.log('[MapboxTileTelemetry] overlay OFF');
    }
  }

  function getState() {
    var map = _getMap();
    return {
      version:        VERSION,
      enabled:        _enabled,
      overlayOn:      _overlayOn,
      tiles: {
        requested:  _stats.tilesRequested,
        loaded:     _stats.tilesLoaded,
        pending:    _stats.tilesPending,
        isIdle:     _stats.isIdle,
        idleEvents: _stats.idleEvents,
        sourceLoads: _stats.sourceLoads,
        styleReloads: _stats.styleReloads,
        lastIdleMsAgo: _stats.lastIdleMs > 0 ? (Date.now() - _stats.lastIdleMs) : null,
      },
      features: {
        extrusion:  _features.extrusion,
        roads:      _features.roads,
        water:      _features.water,
        total:      _features.total,
        lastMsAgo:  _features.lastMs > 0 ? (Date.now() - _features.lastMs) : null,
      },
      layers: {
        extrusionCount: _layers.extrusion ? _layers.extrusion.length : null,
        roadCount:      _layers.road      ? _layers.road.length      : null,
        waterCount:     _layers.water     ? _layers.water.length     : null,
      },
      popEvents: {
        count:  _popEvents.length,
        recent: _popEvents.slice(-5),
      },
      history: {
        depth:    _history.length,
        recent:   _history.slice(-5),
      },
      camera: map ? {
        zoom:    Math.round(map.getZoom()    * 100) / 100,
        pitch:   Math.round(map.getPitch()   * 10)  / 10,
        bearing: Math.round(map.getBearing() * 10)  / 10,
      } : null,
    };
  }

  // ── Exports ───────────────────────────────────────────────────────────────────

  SBE.MapboxTileTelemetry = Object.freeze({
    VERSION:  VERSION,
    start:    start,
    stop:     stop,
    overlay:  overlay,
    getState: getState,
  });

  // ── Debug companion ───────────────────────────────────────────────────────────

  global._wos       = global._wos       || {};
  global._wos.debug = global._wos.debug || {};

  function _bar(scalar, len) {
    len = len || 20;
    var filled = Math.round(Math.max(0, Math.min(1, scalar)) * len);
    var bar = '';
    for (var i = 0; i < len; i++) bar += i < filled ? '█' : '░';
    return bar;
  }

  function debugAudit() {
    var t = SBE.MapboxTileTelemetry;
    if (!t) { console.warn('[Tiles Debug] not loaded'); return; }
    var s = t.getState();

    console.group('[MapboxTileTelemetry] audit()');

    console.log('── System ──────────────────────────────────────────');
    console.log('version       :', s.version);
    console.log('enabled       :', s.enabled);
    console.log('overlayOn     :', s.overlayOn);

    console.log('');
    console.log('── Tiles ───────────────────────────────────────────');
    console.log('requested     :', s.tiles.requested);
    console.log('loaded        :', s.tiles.loaded);
    console.log('pending       :', s.tiles.pending);
    console.log('idle          :', s.tiles.isIdle);
    console.log('idleEvents    :', s.tiles.idleEvents);
    console.log('sourceLoads   :', s.tiles.sourceLoads);
    console.log('styleReloads  :', s.tiles.styleReloads);
    if (s.tiles.lastIdleMsAgo !== null) {
      console.log('lastIdle      :', s.tiles.lastIdleMsAgo + 'ms ago');
    }

    console.log('');
    console.log('── Camera ──────────────────────────────────────────');
    if (s.camera) {
      console.log('zoom          :', s.camera.zoom);
      console.log('pitch         :', s.camera.pitch + '°');
      console.log('bearing       :', s.camera.bearing + '°');
    }

    console.log('');
    console.log('── Features (rendered) ─────────────────────────────');
    console.log('layers cached :', s.layers.extrusionCount !== null ? 'yes' : 'pending');
    if (s.layers.extrusionCount !== null) {
      console.log('  extrusion layers:', s.layers.extrusionCount,
        '  road layers:', s.layers.roadCount,
        '  water layers:', s.layers.waterCount);
    }
    console.log('extrusion     :', s.features.extrusion.toLocaleString(), 'features');
    console.log('roads         :', s.features.roads.toLocaleString(),     'features');
    console.log('water         :', s.features.water.toLocaleString(),     'features');
    if (s.features.lastMsAgo !== null) {
      console.log('last query    :', s.features.lastMsAgo + 'ms ago');
    }

    console.log('');
    console.log('── Pop-in events ───────────────────────────────────');
    console.log('total         :', s.popEvents.count);
    if (s.popEvents.recent.length) {
      s.popEvents.recent.forEach(function (p) {
        var ago = Math.round((Date.now() - p.ts) / 1000);
        console.log(' ↑' + p.delta + ' bldgs (+' + Math.round(p.relJump * 100) + '%)',
          '| lat', p.lat, 'lng', p.lng,
          '| z' + p.zoom, 'p' + p.pitch + '°',
          '| pending:', p.tilesPending,
          '| ' + ago + 's ago');
      });
    }

    console.log('');
    console.log('── History (last 5 samples) ────────────────────────');
    if (s.history.recent.length) {
      s.history.recent.forEach(function (h) {
        var ago = Math.round((Date.now() - h.ts) / 1000);
        console.log(' ' + ago + 's:',
          'ext=' + h.extrusion,
          '  roads=' + h.roads,
          '  pending=' + h.tilesPending,
          '  idle=' + h.isIdle);
      });
    }

    console.log('');
    console.log('  .overlay(true)  .state()  (auto-starts on overlay)');
    console.groupEnd();
    return s;
  }

  function debugState() {
    var t = SBE.MapboxTileTelemetry;
    if (!t) { console.warn('[Tiles Debug] not loaded'); return; }
    var s = t.getState();
    var idleIcon = s.tiles.isIdle ? '🟢' : '🔄';
    var popNote  = s.popEvents.count > 0 ? ' | 🏗️ ' + s.popEvents.count + ' pop' : '';
    console.log('[Tiles Debug]',
      idleIcon,
      'tiles loaded', s.tiles.loaded,
      '| pending', s.tiles.pending,
      '| extrusions', s.features.extrusion,
      '| roads', s.features.roads,
      '| pops', s.popEvents.count,
      popNote);
    return s;
  }

  function debugOverlay(show) {
    var t = SBE.MapboxTileTelemetry;
    if (!t) { console.warn('[Tiles Debug] not loaded'); return; }
    t.overlay(show);
  }

  // ── Debug bind (with retry guard) ─────────────────────────────────────────────
  // main.js or other scripts may overwrite global._wos after this file loads.
  // Re-bind at 250ms / 1000ms / 2500ms to survive any post-load reset.

  var _debugObj = {
    audit:   debugAudit,
    state:   debugState,
    overlay: debugOverlay,
  };

  function _bindDebug() {
    global._wos             = global._wos             || {};
    global._wos.debug       = global._wos.debug       || {};
    global._wos.debug.tiles = _debugObj;
    // Alias — both names resolve to the same object
    global._wos.debug.mapboxTiles = _debugObj;
  }

  _bindDebug();
  global.setTimeout(_bindDebug, 250);
  global.setTimeout(_bindDebug, 1000);
  global.setTimeout(_bindDebug, 2500);

  console.log('[MapboxTileTelemetry] v' + VERSION + ' loaded — _wos.debug.tiles + _wos.debug.mapboxTiles bound');
  console.log('  .overlay(true)  .audit()  .state()');
  console.log('  Auto-start on overlay() — or call SBE.MapboxTileTelemetry.start() manually');

})(window);
