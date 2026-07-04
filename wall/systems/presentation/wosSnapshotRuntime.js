// ── WosSnapshotRuntime v1.0.0 ────────────────────────────────────────────────
// 0628E_WOS_FlightSnapshotShortcut_v1.0.0
// Status: active
// Classification: capture-utility
//
// Keyboard shortcuts:
//   S                   — capture current map frame (HUD visible)
//   Shift+S             — capture clean frame (HUD hidden for ~100ms)
//
// Filename: YYYYMMDD_WOS_<CHANNEL>_HHMMSS.png
//
// Authority:
//   READS: MapboxViewportRuntime, RegionalFlightTripRuntime, _wos.nav
//   DOES NOT: mutate any runtime, interrupt traversal, add UI chrome
//
// Placement: wall/systems/presentation/wosSnapshotRuntime.js
// Load: AFTER traversalHUD.js
// ─────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  // ── Filename builder ──────────────────────────────────────────────────────────

  function _pad(n, w) { return String(n).padStart(w || 2, '0'); }

  function _datePart() {
    var d  = new Date();
    var yy = d.getFullYear();
    var mo = _pad(d.getMonth() + 1);
    var dd = _pad(d.getDate());
    return '' + yy + mo + dd;
  }

  function _timePart() {
    var d  = new Date();
    var hh = _pad(d.getHours());
    var mm = _pad(d.getMinutes());
    var ss = _pad(d.getSeconds());
    return hh + mm + ss;
  }

  function _slug(str) {
    if (!str) return 'UNKNOWN';
    return str.toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24);
  }

  function _getChannel() {
    // Try URL param first
    var params = new URLSearchParams(global.location && global.location.search);
    var ch = params.get('channel');
    if (ch) return _slug(ch);
    // Fall back to transport/mode slug
    if (document.body.classList.contains('wos-orbital-earth-active')) return 'ORBITAL';
    var nav = global._wos && global._wos.nav;
    var t   = nav && nav.transport;
    if (t) return _slug(t);
    return 'FLIGHT';
  }

  function _buildFilename(clean) {
    var suffix = clean ? '_CLEAN' : '';
    return _datePart() + '_WOS_' + _getChannel() + '_' + _timePart() + suffix + '.png';
  }

  // ── Canvas capture ────────────────────────────────────────────────────────────

  function _getCanvas() {
    // Primary: Mapbox GL canvas
    var mvr = SBE.MapboxViewportRuntime;
    var map = mvr && typeof mvr.getMap === 'function' ? mvr.getMap() : null;
    if (map) {
      try { return map.getCanvas(); } catch (e) {}
    }
    // Fallback: first canvas on the page
    return document.querySelector('canvas');
  }

  function _triggerDownload(dataUrl, filename) {
    var a = document.createElement('a');
    a.href     = dataUrl;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    // Clean up after a tick
    global.setTimeout(function () { document.body.removeChild(a); }, 200);
  }

  function _showToast(msg) {
    var el = document.getElementById('wos-snap-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'wos-snap-toast';
      el.style.cssText = [
        'position:fixed', 'bottom:20px', 'left:50%',
        'transform:translateX(-50%)',
        'background:rgba(0,0,0,0.55)',
        'color:rgba(255,255,255,0.82)',
        'font:10px/1.4 "SF Mono","Fira Mono",ui-monospace,monospace',
        'padding:5px 12px',
        'border-radius:4px',
        'pointer-events:none',
        'z-index:9999',
        'transition:opacity 300ms ease',
        'white-space:nowrap',
      ].join(';');
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = '1';
    // Auto-fade after 1.8s
    global.clearTimeout(el._fadeTimer);
    el._fadeTimer = global.setTimeout(function () { el.style.opacity = '0'; }, 1800);
  }

  // ── Capture ───────────────────────────────────────────────────────────────────

  function capture(opts) {
    opts = opts || {};
    var clean    = !!opts.clean;   // hide HUD for capture
    var filename = _buildFilename(clean);

    function _doCapture() {
      var canvas = _getCanvas();
      if (!canvas) {
        _showToast('⚠ No canvas found');
        console.warn('[WosSnapshot] No map canvas available for capture');
        return;
      }
      var dataUrl;
      try {
        // preserveDrawingBuffer must be true on the map for toDataURL to work.
        // Mapbox GL JS requires this to be set at map init time.
        dataUrl = canvas.toDataURL('image/png');
      } catch (e) {
        _showToast('⚠ Canvas capture blocked (CORS or tainted)');
        console.warn('[WosSnapshot] toDataURL failed:', e);
        return;
      }
      _triggerDownload(dataUrl, filename);
      var label = clean ? '✦ ' : '';
      _showToast(label + filename);
      console.info('[WosSnapshot] captured →', filename, clean ? '(clean)' : '');
    }

    if (clean) {
      // Add body class to hide HUD elements, capture after one frame, restore.
      document.body.classList.add('snapshot-clean');
      // rAF twice: first rAF applies CSS, second rAF ensures repaint
      global.requestAnimationFrame(function () {
        global.requestAnimationFrame(function () {
          _doCapture();
          global.setTimeout(function () {
            document.body.classList.remove('snapshot-clean');
          }, 50);
        });
      });
    } else {
      _doCapture();
    }
  }

  // ── Keyboard handler ──────────────────────────────────────────────────────────

  function _onKeydown(e) {
    // Ignore if focus is in an input/textarea (user is typing)
    var tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    // S            — snapshot with HUD
    // Shift+S      — clean snapshot (HUD hidden)
    if (e.key.toUpperCase() !== 'S') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;   // leave Ctrl/Cmd/Alt combos alone

    e.preventDefault();
    capture({ clean: e.shiftKey });
  }

  document.addEventListener('keydown', _onKeydown);

  // ── Exports ───────────────────────────────────────────────────────────────────

  SBE.WosSnapshotRuntime = Object.freeze({
    VERSION: VERSION,
    capture: capture,
  });

  console.log('[WosSnapshotRuntime] v' + VERSION + ' loaded — S: snapshot, Shift+S: clean snapshot');

})(window);
