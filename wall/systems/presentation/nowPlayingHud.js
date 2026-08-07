// ── NowPlayingHud v1.1.0 ───────────────────────────────────────────────────────
// HUD Recovery Addendum (0729C v1.1)
// 0805B_MAPS_Live_Map_Presentation_Surface_and_Shortcut_Registry
// Status: active | Classification: observational-telemetry
//
// v1.1.0 (0805B): tagged with data-watch-hide so body.presentation's (Tab)
// universal hide/restore now reaches this element too — previously it lived
// entirely outside that mechanism (appended straight to document.body, no
// opt-in), so Tab never hid it, a confirmed gap against this build's spec.
//
// Purpose:
//   Restores the "Now Playing" HUD on canonical LIVE MAP. The prior
//   implementation (music/src/ui/BroadcastSecondaryLayer.tsx, inside
//   BroadcastHudShell) went unreachable when top-nav's "Broadcast → Maps"
//   internal link (workspaceMode: "broadcast_hud") was replaced by a direct
//   external link straight to this same-origin runtime (commit c21159f) —
//   BroadcastHudShell's React tree, and therefore that HUD, is simply never
//   mounted on the path a user actually takes to LIVE MAP anymore. This is a
//   NEW read-only overlay living on the canonical surface itself, not a
//   revival of that old React component.
//
// Authority:
//   READS ONLY: localStorage key 'wos:nowPlaying:snapshot', written by
//   music/src/runtime/nowPlayingBroadcastBridge.ts (publishNowPlayingSnapshot),
//   itself fed by music/src/audio/playbackAuthority.ts's buildSurfaceSnapshot
//   — the ONE place MUSIC computes current playback state. This module does
//   not compute, cache independently, or own any playback state of its own;
//   it only renders whatever the authority last published. Removing the
//   localStorage key (no track playing) hides the panel — never a fabricated
//   "nothing playing" row where a real track title could have been.
//   MUST NOT: control playback, write back to the snapshot key, or read any
//   other MUSIC/RADIO state.
//
// Same-origin only, by design (same limitation the palette bridge already
// documents): localStorage is scoped per-origin. This reaches MUSIC when
// LIVE MAP is opened same-origin at localhost:5176/wall-app/. It will NOT
// reach MUSIC when this page is loaded at the deprecated standalone
// localhost:5500 — that is a different origin and no cross-origin sync is
// built here, matching the standing decision already made for palettes.
//
// Placement: wall/systems/presentation/nowPlayingHud.js
// Load: anywhere after DOM is parseable; self-initializes on
//       DOMContentLoaded, matching traversalHUD.js's pattern (no palette-
//       gated init() call needed — this is an always-on ambient HUD, not an
//       opt-in overlay).
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  var STORAGE_KEY = 'wos:nowPlaying:snapshot';
  var _el = null;

  function _injectCSS() {
    if (document.getElementById('wos-now-playing-css')) return;
    var s = document.createElement('style');
    s.id = 'wos-now-playing-css';
    s.textContent = [
      '#wos-now-playing {',
      '  position: fixed;',
      '  bottom: 110px; left: 22px;',
      '  z-index: 950;',
      '  width: 224px;',
      '  padding: 0;',
      '  background: none;',
      '  border: none;',
      '  font-family: "SF Mono","Fira Mono",ui-monospace,monospace;',
      '  font-size: 10px;',
      '  line-height: 1.2;',
      '  color: rgba(255,255,255,0.82);',
      '  pointer-events: none;',
      '  user-select: none;',
      '}',
      '#wos-now-playing.np-hidden { display: none; }',
      '#wos-now-playing::before {',
      '  content: "";',
      '  position: absolute;',
      '  inset: -30px -22px -30px -56px;',
      '  background: radial-gradient(',
      '    ellipse 110% 110% at -2% 102%,',
      '    rgba(0,0,2,0.45) 0%,',
      '    rgba(0,0,2,0.18) 45%,',
      '    transparent 72%);',
      '  pointer-events: none;',
      '  z-index: -1;',
      '}',
      '#wos-now-playing * {',
      '  text-shadow:',
      '    0 1px 2px rgba(0,0,0,1.0),',
      '    0 0  10px rgba(0,0,0,0.85),',
      '    0 0  26px rgba(0,0,0,0.50);',
      '}',
      '.np-label {',
      '  font-size: 7.5px;',
      '  font-weight: 700;',
      '  letter-spacing: 0.20em;',
      '  text-transform: uppercase;',
      '  color: rgba(255,255,255,0.30);',
      '  margin-bottom: 6px;',
      '}',
      '.np-label.playing { color: rgba(160,255,190,0.48); }',
      '.np-label.paused   { color: rgba(255,220,140,0.48); }',
      '.np-title {',
      '  font-size: 12px;',
      '  font-weight: 500;',
      '  color: rgba(255,255,255,0.85);',
      '  white-space: nowrap;',
      '  overflow: hidden;',
      '  text-overflow: ellipsis;',
      '  max-width: 224px;',
      '}',
      '.np-artist {',
      '  font-size: 9.5px;',
      '  color: rgba(255,255,255,0.55);',
      '  margin-top: 2px;',
      '  white-space: nowrap;',
      '  overflow: hidden;',
      '  text-overflow: ellipsis;',
      '  max-width: 224px;',
      '}',
      '.np-progress-track {',
      '  margin-top: 8px;',
      '  height: 2px;',
      '  width: 100%;',
      '  background: rgba(255,255,255,0.14);',
      '}',
      '.np-progress-fill {',
      '  height: 100%;',
      '  background: rgba(255,255,255,0.55);',
      '}',
    ].join('\n');
    document.head.appendChild(s);
  }

  function _createEl() {
    if (_el) return _el;
    _el = document.createElement('div');
    _el.id = 'wos-now-playing';
    _el.className = 'np-hidden';
    // 0805B — opt into body.presentation's (Tab) universal hide/restore so
    // Now Playing hides consistently with the rest of the interface instead
    // of staying visible underneath it; a data-* attribute survives this
    // module's own className reassignments in _render() below, unlike a
    // plain class would.
    _el.setAttribute('data-watch-hide', '');
    _el.innerHTML =
      '<div class="np-label"></div>' +
      '<div class="np-title"></div>' +
      '<div class="np-artist"></div>' +
      '<div class="np-progress-track"><div class="np-progress-fill" style="width:0%"></div></div>';
    document.body.appendChild(_el);
    return _el;
  }

  function _fmtTime(s) {
    if (typeof s !== 'number' || isNaN(s) || s < 0) return '';
    var m = Math.floor(s / 60);
    var sec = Math.floor(s % 60);
    return m + ':' + String(sec).padStart(2, '0');
  }

  function _readSnapshot() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return (parsed && typeof parsed === 'object') ? parsed : null;
    } catch (e) { return null; }
  }

  function _render() {
    var snap = _readSnapshot();
    var el = _createEl();
    if (!snap || !snap.title) {
      el.className = 'np-hidden';
      return;
    }
    el.className = '';
    var label = snap.isTransitioning ? 'Transitioning' : snap.isPlaying ? 'Now Playing' : snap.isPaused ? 'Paused' : 'Now Playing';
    var labelClass = 'np-label' + (snap.isPlaying ? ' playing' : snap.isPaused ? ' paused' : '');
    el.querySelector('.np-label').textContent = label;
    el.querySelector('.np-label').className = labelClass;
    el.querySelector('.np-title').textContent = snap.title || '';
    el.querySelector('.np-artist').textContent = snap.artist || '';

    var pct = 0;
    if (typeof snap.durationSeconds === 'number' && snap.durationSeconds > 0 && typeof snap.positionSeconds === 'number') {
      pct = Math.max(0, Math.min(100, (snap.positionSeconds / snap.durationSeconds) * 100));
    }
    el.querySelector('.np-progress-fill').style.width = pct + '%';
  }

  function _onStorage(e) {
    if (e.key === STORAGE_KEY || e.key === null) _render();
  }

  function init() {
    _injectCSS();
    _createEl();
    _render();
    window.addEventListener('storage', _onStorage);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  SBE.NowPlayingHud = Object.freeze({ VERSION: VERSION });

})(window);
