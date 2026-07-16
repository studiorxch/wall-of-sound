// ── BroadcastStyleCleanup v1.0.3 ─────────────────────────────────────────────
// 0709_WOS_HardenBroadcastMapStyleCleanup_v1.0.3
//
// Post-style-load cleanup pass for broadcast-safe Mapbox output.
// Targets compression-hostile paint properties baked into the custom map style.
// Only runs in broadcast/embed/OBS contexts — normal map rendering unchanged.
//
// Cleanup rules:
//   [1] line-blur > 0         → setPaintProperty(id, 'line-blur', 0)
//   [2] *-pattern             → setLayoutProperty(id, 'visibility', 'none')
//   [3] raster layers         → flagged in audit; hidden only if non-base
//   [4] soft/glow/casing lines → hidden when ID matches known soft-layer terms
//       + low opacity (≤ 0.35) or wide width (≥ 3px)
//   [5] transparent fill overlays → hidden when ID matches overlay terms
//       + low opacity (≤ 0.25)
//
// Console API:
//   _wos.debug.broadcast.styleCleanup.audit()
//   _wos.debug.broadcast.styleCleanup.status()
//   _wos.debug.broadcast.styleCleanup.force()
//   _wos.debug.broadcast.styleCleanup.disableLayer(id)
//   _wos.debug.broadcast.styleCleanup.enableLayer(id)
//
// Placement: wall/runtimes/broadcastStyleCleanup.js
// Load: after mapboxViewportRuntime.js
// ─────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  // ── Constants ─────────────────────────────────────────────────────────────────

  var VERSION = '1.0.3';

  // ID substrings that suggest a soft-glow / casing / halo road layer
  var SOFT_LINE_TERMS = [
    'glow', 'halo', 'blur', 'shadow', 'case', 'casing',
    'outer', 'aura', 'ghost', 'soft', 'blueprint', 'trace', 'trail', 'atmos',
  ];

  // ID substrings that suggest a haze/texture fill overlay
  var OVERLAY_FILL_TERMS = [
    'overlay', 'haze', 'tint', 'wash', 'texture', 'paper',
    'grain', 'noise', 'screen', 'fog', 'atmosphere', 'vignette',
  ];

  // Raster layer IDs known to be safe base tiles (never hidden)
  var RASTER_SAFE_IDS = ['satellite', 'hillshade', 'terrain'];

  // ── State ─────────────────────────────────────────────────────────────────────

  var _applied        = false;
  var _styleUrl       = 'unknown';
  var _lastError      = null;

  var _cleaned = {
    lineBlurZeroed:              [],  // { id, original }
    patternLayersHidden:         [],  // { id, type, property }
    rasterLayersFlagged:         [],  // { id } — audit only, not auto-hidden unless non-base
    rasterLayersHidden:          [],  // { id } — non-safe rasters that were hidden
    softLineLayersHidden:        [],  // { id, reason }
    transparentFillLayersHidden: [],  // { id, opacity }
  };
  var _skipped = [];  // { id, reason }

  // ── Map access ────────────────────────────────────────────────────────────────

  function _getMap() {
    var mvr = SBE.MapboxViewportRuntime;
    if (mvr && typeof mvr.getMap === 'function') return mvr.getMap();
    return null;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  function _idContains(id, terms) {
    var lower = (id || '').toLowerCase();
    for (var i = 0; i < terms.length; i++) {
      if (lower.indexOf(terms[i]) !== -1) return terms[i];
    }
    return null;
  }

  function _numericValue(val) {
    if (typeof val === 'number') return val;
    // expression arrays — can't extract a single number safely, return null
    return null;
  }

  function _setVisibility(map, id, vis) {
    try { map.setLayoutProperty(id, 'visibility', vis); return true; } catch (e) { return false; }
  }

  // ── Context detection ─────────────────────────────────────────────────────────

  function _context() {
    var html  = global.document && global.document.documentElement;
    var body  = global.document && global.document.body;
    var embed = !!(html && html.classList.contains('wos-embed'));
    var obs   = !!(html && html.classList.contains('wos-obs'));
    var pch   = !!(body && body.classList.contains('play-controls-hidden'));
    var iframe = (global.self !== global.top);
    var forced = (global.__WOS_BROADCAST_SAFE__ === true);
    return { embed: embed, obs: obs, playControlsHidden: pch, iframe: iframe, forced: forced };
  }

  function _isBroadcastContext() {
    var c = _context();
    return c.embed || c.obs || c.playControlsHidden || c.iframe || c.forced;
  }

  // ── Core apply ────────────────────────────────────────────────────────────────

  function apply() {
    var map = _getMap();
    if (!map) { console.warn('[BroadcastStyleCleanup] apply: map not ready'); return; }

    var style = null;
    try { style = map.getStyle(); } catch (e) {
      _lastError = 'getStyle: ' + (e && e.message);
      console.warn('[BroadcastStyleCleanup] apply: getStyle failed', e.message);
      return;
    }

    // Reset state
    _cleaned = {
      lineBlurZeroed: [], patternLayersHidden: [],
      rasterLayersFlagged: [], rasterLayersHidden: [],
      softLineLayersHidden: [], transparentFillLayersHidden: [],
    };
    _skipped = [];

    try {
      var sprite = style.sprite || '';
      var name   = style.name   || '';
      _styleUrl = name || sprite || 'unknown';
    } catch (e) {}

    (style.layers || []).forEach(function (layer) {
      var id     = layer.id   || '';
      var type   = layer.type || '';
      var paint  = layer.paint  || {};
      var layout = layer.layout || {};

      // Skip layers already hidden
      if (layout.visibility === 'none') {
        _skipped.push({ id: id, reason: 'already hidden' });
        return;
      }

      // ── [1] line-blur → 0 ────────────────────────────────────────────────────
      var blur = _numericValue(paint['line-blur']);
      if (blur !== null && blur > 0) {
        try {
          map.setPaintProperty(id, 'line-blur', 0);
          _cleaned.lineBlurZeroed.push({ id: id, original: blur });
        } catch (e) {
          _skipped.push({ id: id, reason: 'setPaintProperty line-blur failed: ' + (e && e.message) });
        }
      }

      // ── [2] *-pattern → hide ──────────────────────────────────────────────────
      var patternProp = null;
      if (paint['fill-pattern'])       patternProp = 'fill-pattern';
      else if (paint['line-pattern'])  patternProp = 'line-pattern';
      else if (paint['background-pattern']) patternProp = 'background-pattern';

      if (patternProp) {
        if (_setVisibility(map, id, 'none')) {
          _cleaned.patternLayersHidden.push({ id: id, type: type, property: patternProp });
        } else {
          _skipped.push({ id: id, reason: 'setLayoutProperty failed for ' + patternProp });
        }
        return; // no further checks needed for pattern layers
      }

      // ── [3] raster layers → flag; hide non-safe ones ─────────────────────────
      if (type === 'raster') {
        _cleaned.rasterLayersFlagged.push({ id: id });
        var isSafeRaster = false;
        for (var ri = 0; ri < RASTER_SAFE_IDS.length; ri++) {
          if (id.toLowerCase().indexOf(RASTER_SAFE_IDS[ri]) !== -1) { isSafeRaster = true; break; }
        }
        if (!isSafeRaster) {
          if (_setVisibility(map, id, 'none')) {
            _cleaned.rasterLayersHidden.push({ id: id });
          }
        }
        return;
      }

      // ── [4] soft/glow/casing line layers → hide when suspicious ──────────────
      if (type === 'line') {
        var softTerm = _idContains(id, SOFT_LINE_TERMS);
        if (softTerm) {
          var opacity = _numericValue(paint['line-opacity']);
          var width   = _numericValue(paint['line-width']);
          var isSoftOpacity = (opacity !== null && opacity <= 0.35);
          var isWide        = (width   !== null && width   >= 3);
          // Hide if: ID suggests glow AND (low opacity OR wide width OR blur was present)
          if (isSoftOpacity || isWide || (blur !== null && blur > 0)) {
            var reason = softTerm + (isSoftOpacity ? ' opacity=' + opacity : '') + (isWide ? ' width=' + width : '');
            if (_setVisibility(map, id, 'none')) {
              _cleaned.softLineLayersHidden.push({ id: id, reason: reason });
            } else {
              _skipped.push({ id: id, reason: 'setLayoutProperty failed for soft line' });
            }
            return;
          }
        }
      }

      // ── [5] transparent fill overlays → hide when suspicious ─────────────────
      if (type === 'fill') {
        var fillTerm = _idContains(id, OVERLAY_FILL_TERMS);
        if (fillTerm) {
          var fillOpacity = _numericValue(paint['fill-opacity']);
          if (fillOpacity !== null && fillOpacity > 0 && fillOpacity <= 0.25) {
            if (_setVisibility(map, id, 'none')) {
              _cleaned.transparentFillLayersHidden.push({ id: id, opacity: fillOpacity });
            } else {
              _skipped.push({ id: id, reason: 'setLayoutProperty failed for transparent fill' });
            }
          }
        }
      }
    });

    _applied = true;

    var totalHidden = (
      _cleaned.patternLayersHidden.length +
      _cleaned.rasterLayersHidden.length +
      _cleaned.softLineLayersHidden.length +
      _cleaned.transparentFillLayersHidden.length
    );

    console.log(
      '[BroadcastStyleCleanup] v' + VERSION + ' applied —',
      _cleaned.lineBlurZeroed.length + ' blur(s) zeroed,',
      totalHidden + ' layer(s) hidden,',
      _cleaned.rasterLayersFlagged.length + ' raster(s) flagged'
    );
    if (_cleaned.lineBlurZeroed.length)
      console.log('  blur zeroed:',  _cleaned.lineBlurZeroed.map(function (l) { return l.id; }).join(', '));
    if (_cleaned.patternLayersHidden.length)
      console.log('  patterns:',     _cleaned.patternLayersHidden.map(function (l) { return l.id; }).join(', '));
    if (_cleaned.softLineLayersHidden.length)
      console.log('  soft lines:',   _cleaned.softLineLayersHidden.map(function (l) { return l.id; }).join(', '));
    if (_cleaned.transparentFillLayersHidden.length)
      console.log('  fill overlays:',_cleaned.transparentFillLayersHidden.map(function (l) { return l.id; }).join(', '));
    if (_cleaned.rasterLayersHidden.length)
      console.log('  rasters hidden:',_cleaned.rasterLayersHidden.map(function (l) { return l.id; }).join(', '));
  }

  // ── Force — apply regardless of context detection ─────────────────────────────

  function force() {
    console.log('[BroadcastStyleCleanup] force() — bypassing context detection');
    apply();
  }

  // ── Audit — full risky-layer table ───────────────────────────────────────────

  function audit() {
    var map = _getMap();
    if (!map) { console.warn('[BroadcastStyleCleanup] audit: map not ready'); return []; }

    var style = null;
    try { style = map.getStyle(); } catch (e) {
      console.warn('[BroadcastStyleCleanup] getStyle failed:', e.message);
      return [];
    }

    var risky = [];

    (style.layers || []).forEach(function (layer) {
      var id     = layer.id   || '';
      var type   = layer.type || '';
      var paint  = layer.paint  || {};
      var layout = layer.layout || {};
      var source = layer.source || '';

      var risks   = [];
      var actions = [];

      var blur = _numericValue(paint['line-blur']);
      if (blur !== null && blur > 0) {
        risks.push('line-blur:' + blur);
        actions.push('setPaintProperty(line-blur,0)');
      }
      if (paint['fill-pattern'])       { risks.push('fill-pattern');       actions.push('hide'); }
      if (paint['line-pattern'])       { risks.push('line-pattern');       actions.push('hide'); }
      if (paint['background-pattern']){ risks.push('background-pattern'); actions.push('hide'); }
      if (type === 'raster') {
        risks.push('raster');
        actions.push(_idContains(id, RASTER_SAFE_IDS) ? 'flag-only' : 'hide');
      }

      var softTerm = (type === 'line') ? _idContains(id, SOFT_LINE_TERMS) : null;
      if (softTerm) {
        var op = _numericValue(paint['line-opacity']);
        var w  = _numericValue(paint['line-width']);
        if ((op !== null && op <= 0.35) || (w !== null && w >= 3)) {
          risks.push('soft-line[' + softTerm + '] op=' + op + ' w=' + w);
          actions.push('hide');
        }
      }

      var fillTerm = (type === 'fill') ? _idContains(id, OVERLAY_FILL_TERMS) : null;
      if (fillTerm) {
        var fo = _numericValue(paint['fill-opacity']);
        if (fo !== null && fo > 0 && fo <= 0.25) {
          risks.push('transparent-fill[' + fillTerm + '] op=' + fo);
          actions.push('hide');
        }
      }

      if (risks.length) {
        risky.push({
          id:     id,
          type:   type,
          source: source,
          risk:   risks.join(' | '),
          action: actions.join(' | '),
          vis:    layout.visibility || 'visible',
        });
      }
    });

    var ctx = _context();
    console.group('[BroadcastStyleCleanup] audit — ' + risky.length + ' risky layer(s) | context: ' +
      (ctx.iframe ? 'iframe ' : '') + (ctx.embed ? 'embed ' : '') + (ctx.obs ? 'obs ' : '') +
      (ctx.playControlsHidden ? 'play-hidden ' : '') + (ctx.forced ? 'forced' : ''));
    if (risky.length) {
      console.table(risky.map(function (r) {
        return { id: r.id, type: r.type, risk: r.risk, action: r.action, vis: r.vis };
      }));
    } else {
      console.log('  (none)');
    }
    console.groupEnd();

    return risky;
  }

  // ── Status ────────────────────────────────────────────────────────────────────

  function status() {
    var map = _getMap();
    var styleUrl = _styleUrl;
    try { if (map) styleUrl = (map.getStyle() || {}).name || _styleUrl; } catch (e) {}
    return {
      active:   _applied,
      version:  VERSION,
      styleUrl: styleUrl,
      context:  _context(),
      cleaned:  {
        lineBlurZeroed:              _cleaned.lineBlurZeroed.slice(),
        patternLayersHidden:         _cleaned.patternLayersHidden.slice(),
        rasterLayersFlagged:         _cleaned.rasterLayersFlagged.slice(),
        rasterLayersHidden:          _cleaned.rasterLayersHidden.slice(),
        softLineLayersHidden:        _cleaned.softLineLayersHidden.slice(),
        transparentFillLayersHidden: _cleaned.transparentFillLayersHidden.slice(),
      },
      skipped:    _skipped.slice(),
      lastError:  _lastError,
    };
  }

  // ── Per-layer helpers ─────────────────────────────────────────────────────────

  function disableLayer(id) {
    var map = _getMap();
    if (!map) { console.warn('[BroadcastStyleCleanup] disableLayer: map not ready'); return; }
    if (_setVisibility(map, id, 'none')) {
      console.log('[BroadcastStyleCleanup] disableLayer:', id);
    } else {
      console.warn('[BroadcastStyleCleanup] disableLayer failed:', id);
    }
  }

  function enableLayer(id) {
    var map = _getMap();
    if (!map) { console.warn('[BroadcastStyleCleanup] enableLayer: map not ready'); return; }
    if (_setVisibility(map, id, 'visible')) {
      console.log('[BroadcastStyleCleanup] enableLayer:', id);
    } else {
      console.warn('[BroadcastStyleCleanup] enableLayer failed:', id);
    }
  }

  // ── Auto-apply hooks ──────────────────────────────────────────────────────────

  function _hookStyleLoad() {
    var mvr = SBE.MapboxViewportRuntime;
    if (!mvr || typeof mvr.onStyleLoad !== 'function') return;
    mvr.onStyleLoad(function () {
      if (!_isBroadcastContext()) return;
      // Defer so all other style.load callbacks run first
      global.setTimeout(apply, 50);
    });
  }

  global.setTimeout(function () {
    _hookStyleLoad();
    // Watch for play-controls-hidden being set mid-session
    if (global.document && global.document.body) {
      var observer = new MutationObserver(function (mutations) {
        mutations.forEach(function (m) {
          if (m.type !== 'attributes' || m.attributeName !== 'class') return;
          if (!_applied && _isBroadcastContext()) apply();
        });
      });
      observer.observe(global.document.body, { attributes: true });
    }
  }, 0);

  // ── Public API ────────────────────────────────────────────────────────────────

  SBE.BroadcastStyleCleanup = Object.freeze({
    audit:        audit,
    apply:        apply,
    force:        force,
    status:       status,
    disableLayer: disableLayer,
    enableLayer:  enableLayer,
  });

  // Debug namespace — bound now AND re-bound after window load, because
  // main.js reassigns window._wos during boot and clobbers earlier bindings.
  function _bindDebug() {
    if (!global._wos)                      global._wos       = {};
    if (!global._wos.debug)                global._wos.debug = {};
    if (!global._wos.debug.broadcast)      global._wos.debug.broadcast = {};
    global._wos.debug.broadcast.styleCleanup = {
      audit:        audit,
      apply:        apply,
      force:        force,
      status:       status,
      disableLayer: disableLayer,
      enableLayer:  enableLayer,
    };
  }
  _bindDebug();
  global.addEventListener('load', function () { global.setTimeout(_bindDebug, 500); });

  console.log('[BroadcastStyleCleanup] v' + VERSION + ' loaded | _wos.debug.broadcast.styleCleanup.audit()');

})(window);
