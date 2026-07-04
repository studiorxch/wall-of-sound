(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});

  // ── WosPresentationRouter — presentation mode routing and renderer dispatch ───
  //
  // STATUS: DORMANT INFRASTRUCTURE
  //
  // Presentation router is installed for future display targets.
  // Current WALL UI has no presentation tabs.
  // Transport tabs remain flight/drive/walk/bike/transit/orbital only.
  //
  // Nothing in the current WALL UI calls selectPresentationMode().
  // Do not wire presentation controls into traversalControlDeck.js
  // unless explicitly requested.
  //
  // Owns: display target selection, renderer activation, placeholder fallback.
  // Does NOT call selectTransport(). Does NOT own movement or camera.
  //
  // Renderer contract: { mode, enter(ctx), exit(), isActive() }
  // Missing renderer: shows diagnostic placeholder — never falls back to map.
  //
  // Diagnostics:
  //   [WOS Presentation] SELECT
  //   [WOS Presentation] RENDERER ACTIVE
  //   [WOS Presentation] PLACEHOLDER
  //   [WOS Presentation] BLOCKED
  //   [WOS Presentation] ROUTING REPORT

  var _pmState = SBE.WosPresentationModeState;
  var MODES    = _pmState ? _pmState.MODES : {
    MAP: 'map', CARD: 'card', SPLIT: 'split',
    WEBSITE: 'website', CANVAS: 'canvas',
    KINETIC_FISH: 'kinetic_fish', EXTRACTED_THEME: 'extracted_theme'
  };

  var _known = (function () {
    var list = [];
    for (var k in MODES) { if (Object.prototype.hasOwnProperty.call(MODES, k)) list.push(MODES[k]); }
    return list;
  })();

  var _state       = _pmState ? _pmState.createDefault() : { activeMode: 'map', previousMode: null, activeRenderer: 'map', missingRenderer: null };
  var _renderers   = {};
  var _lastAction  = null;
  var _errors      = [];

  // ── Map renderer — wraps default map view ────────────────────────────────────

  _renderers['map'] = {
    mode:     'map',
    enter:    function () { /* map is always visible, nothing to activate */ },
    exit:     function () { /* map stays — other modes overlay or replace it */  },
    isActive: function () { return _state.activeMode === 'map'; }
  };

  // ── Placeholder ───────────────────────────────────────────────────────────────

  var _CSS_ID         = 'wos-presentation-placeholder-css';
  var _PLACEHOLDER_ID = 'wos-presentation-placeholder';

  function _ensurePlaceholderCSS() {
    if (document.getElementById(_CSS_ID)) return;
    var s = document.createElement('style');
    s.id = _CSS_ID;
    s.textContent = [
      '#' + _PLACEHOLDER_ID + ' {',
      '  display: none; position: fixed; inset: 0; z-index: 500;',
      '  background: rgba(2,6,14,0.96); pointer-events: none;',
      '  align-items: center; justify-content: center; flex-direction: column; gap: 8px;',
      '  font-family: "Share Tech Mono","IBM Plex Mono","Courier New",monospace;',
      '  letter-spacing: 0.10em; text-transform: uppercase;',
      '}',
      '#' + _PLACEHOLDER_ID + '.wos-ph--visible { display: flex; }',
      '#' + _PLACEHOLDER_ID + ' .wos-ph-mode {',
      '  font-size: 15px; font-weight: 700; letter-spacing: 0.22em;',
      '  color: rgba(0,215,255,0.90); margin-bottom: 6px;',
      '}',
      '#' + _PLACEHOLDER_ID + ' .wos-ph-line {',
      '  font-size: 9px; color: rgba(160,210,255,0.50);',
      '}',
      '#' + _PLACEHOLDER_ID + ' .wos-ph-transport {',
      '  font-size: 9px; color: rgba(120,180,220,0.38); margin-top: 4px;',
      '}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function _getPlaceholderEl() {
    var el = document.getElementById(_PLACEHOLDER_ID);
    if (!el) {
      _ensurePlaceholderCSS();
      el = document.createElement('div');
      el.id = _PLACEHOLDER_ID;
      document.body.appendChild(el);
    }
    return el;
  }

  function _hidePlaceholder() {
    var el = document.getElementById(_PLACEHOLDER_ID);
    if (el) el.classList.remove('wos-ph--visible');
  }

  function showPlaceholder(mode, reason) {
    var el  = _getPlaceholderEl();
    var lbl = mode.toUpperCase().replace(/_/g, ' ') + ' VIEW';

    var transport = 'flight';
    try {
      var tcd = SBE.TraversalControlDeck;
      if (tcd && tcd.getRouteState) {
        var rs = tcd.getRouteState();
        if (rs && rs.transport) transport = rs.transport;
      }
    } catch (e) {}

    el.innerHTML = [
      '<div class="wos-ph-mode">' + lbl + '</div>',
      '<div class="wos-ph-line">' + (reason || 'Renderer not implemented yet.') + '</div>',
      '<div class="wos-ph-line">Presentation mode is active.</div>',
      '<div class="wos-ph-transport">Transport mode remains: ' + transport + '</div>'
    ].join('');
    el.classList.add('wos-ph--visible');

    console.info(
      '[WOS Presentation] PLACEHOLDER\n' +
      '  mode: '   + mode + '\n' +
      '  reason: ' + (reason || 'no renderer registered')
    );
  }

  // ── Renderer registry ─────────────────────────────────────────────────────────

  function registerRenderer(mode, renderer) {
    if (!renderer || typeof renderer.enter !== 'function') {
      console.warn('[WOS Presentation] registerRenderer — invalid renderer for mode: ' + mode);
      return;
    }
    _renderers[mode] = renderer;
  }

  // ── Core routing ──────────────────────────────────────────────────────────────

  function _deactivateCurrent() {
    var prev = _state.activeMode;
    var r    = _renderers[prev];
    if (r && r.exit) { try { r.exit(); } catch (e) {} }
    document.body.classList.remove('wos-presentation-' + prev);
    _hidePlaceholder();
  }

  function selectPresentationMode(mode) {
    _lastAction = 'selectPresentationMode(' + mode + ')';

    if (_known.indexOf(mode) === -1) {
      var msg = '[WOS Presentation] BLOCKED unknown presentation mode: ' + mode;
      console.warn(msg);
      _errors.push(msg);
      return;
    }

    console.info(
      '[WOS Presentation] SELECT\n' +
      '  mode: '     + mode + '\n' +
      '  previous: ' + _state.activeMode
    );

    _deactivateCurrent();

    _state.previousMode = _state.activeMode;
    _state.activeMode   = mode;

    document.body.classList.add('wos-presentation-' + mode);

    var renderer = _renderers[mode];
    if (renderer) {
      _state.activeRenderer  = mode;
      _state.missingRenderer = null;
      try { renderer.enter({ previousMode: _state.previousMode }); } catch (e) {}
      console.info('[WOS Presentation] RENDERER ACTIVE\n  mode: ' + mode);
    } else {
      _state.activeRenderer  = 'placeholder_' + mode;
      _state.missingRenderer = mode;
      showPlaceholder(mode);
    }
  }

  function getPresentationMode() {
    return _state.activeMode;
  }

  function getRoutingReport() {
    var transport = 'unknown';
    try {
      var tcd = SBE.TraversalControlDeck;
      if (tcd && tcd.getRouteState) {
        var rs = tcd.getRouteState();
        if (rs && rs.transport) transport = rs.transport;
      }
    } catch (e) {}

    var report = {
      activePresentationMode: _state.activeMode,
      activeTransportMode:    transport,
      activeRenderer:         _state.activeRenderer,
      knownRenderers:         Object.keys(_renderers),
      lastAction:             _lastAction,
      fallbackUsed:           !!_state.missingRenderer,
      errors:                 _errors.slice()
    };
    console.info('[WOS Presentation] ROUTING REPORT', report);
    return report;
  }

  SBE.WosPresentationRouter = Object.freeze({
    selectPresentationMode: selectPresentationMode,
    getPresentationMode:    getPresentationMode,
    registerRenderer:       registerRenderer,
    getRoutingReport:       getRoutingReport,
    showPlaceholder:        showPlaceholder
  });

  console.info('[WOS Presentation] router ready  known modes: ' + _known.join(', '));

})(window);
