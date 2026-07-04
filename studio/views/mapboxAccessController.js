// ── WOS Mapbox Access Controller ─────────────────────────────────────────────
// 0619F_WOS_MapboxAccessRecoveryPatch_v1.0.0_BUILD
//
// Single authority for Mapbox token resolution and style-access gating.
// Prevents the Map authoring surface from silently going black on 401 by
// classifying every access state and exposing it visibly and via debug.
//
// Token priority:
//   1. SBE.MapboxToken (set by wosMapStyleAuthority.js — shared with Broadcast)
//   2. localStorage wos.studio.mapboxToken (developer override only)
//   3. visible failure — no silent black map, no hardcoded fallback
//
// Safe initial style: mapbox://styles/mapbox/dark-v11 (public — never 401s).
// Custom StudioRich styles only allowed after status is 'ready'.
// ─────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SAFE_PUBLIC_STYLE  = 'mapbox://styles/mapbox/dark-v11';
  var LS_TOKEN_KEY       = 'wos.studio.mapboxToken';

  var _state = {
    tokenSource:         'missing',
    tokenValue:          null,
    tokenPresent:        false,
    tokenPreview:        null,
    initialStyle:        SAFE_PUBLIC_STYLE,
    activeStyle:         null,
    customStyleAllowed:  false,
    lastStatus:          'unknown',  // 'ready'|'missing-token'|'unauthorized'|'style-error'|'unknown'
    lastError:           null,
    lastErrorStatus:     null,
    updatedAt:           null,
  };

  // ── Token resolution ─────────────────────────────────────────────────────────
  function resolveToken() {
    // Priority 1: SBE bootstrap token
    var sbeToken = global.SBE && global.SBE.MapboxToken;
    if (sbeToken && typeof sbeToken === 'string' && sbeToken.length > 10) {
      _setState({ tokenSource: 'SBE.MapboxToken', tokenValue: sbeToken });
      return { ok: true, value: sbeToken, source: 'SBE.MapboxToken' };
    }

    // Priority 2: localStorage developer override
    try {
      var lsToken = localStorage.getItem(LS_TOKEN_KEY);
      if (lsToken && lsToken.length > 10) {
        _setState({ tokenSource: 'localStorage-dev-override', tokenValue: lsToken });
        return { ok: true, value: lsToken, source: 'localStorage-dev-override' };
      }
    } catch (e) {}

    // No token — fail visibly (no silent hardcoded fallback per 0619F v1.0.1)
    _setState({ tokenSource: 'missing', tokenValue: null, lastStatus: 'missing-token' });
    console.warn('[WOSMapboxAccessController] SBE.MapboxToken missing — Studio Mapbox token not available. Set SBE.MapboxToken or localStorage wos.studio.mapboxToken.');
    return { ok: false, reason: 'shared_broadcast_token_missing', source: 'missing' };
  }

  // ── Initial style selection ───────────────────────────────────────────────────
  // Always starts with a safe public style — custom looks apply AFTER load.
  function resolveInitialStyle() {
    _state.initialStyle = SAFE_PUBLIC_STYLE;
    return SAFE_PUBLIC_STYLE;
  }

  // ── Error recording ───────────────────────────────────────────────────────────
  function recordMapError(httpStatus, message) {
    var status = 'style-error';
    if (httpStatus === 401 || httpStatus === 403) status = 'unauthorized';
    _setState({
      lastStatus:      status,
      lastError:       message || ('HTTP ' + httpStatus),
      lastErrorStatus: httpStatus || null,
      customStyleAllowed: false,
    });
  }

  // ── Record successful load ────────────────────────────────────────────────────
  function recordStyleLoaded(styleUrl) {
    _setState({
      lastStatus:         'ready',
      activeStyle:        styleUrl || null,
      customStyleAllowed: true,
      lastError:          null,
      lastErrorStatus:    null,
    });
  }

  // ── Custom style guard ────────────────────────────────────────────────────────
  // MapLookController must call this before setStyle() with a custom URL.
  // Returns false when the last known access state was unauthorized/unknown.
  function canUseCustomStyle(styleUrl) {
    if (!styleUrl) return false;
    // Public Mapbox styles (mapbox://styles/mapbox/...) are always allowed
    if (styleUrl.indexOf('mapbox://styles/mapbox/') === 0) return true;
    // Custom styles only when status is ready
    return _state.lastStatus === 'ready';
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────
  function _setState(patch) {
    Object.keys(patch).forEach(function (k) { _state[k] = patch[k]; });
    _state.updatedAt  = new Date().toISOString();
    _state.tokenPresent = !!_state.tokenValue;
    _state.tokenPreview = _state.tokenValue ? _redact(_state.tokenValue) : null;
  }

  function _redact(token) {
    if (!token || token.length < 12) return '***';
    return token.slice(0, 6) + '…' + token.slice(-3);
  }

  // ── Snapshot ──────────────────────────────────────────────────────────────────
  function getSnapshot() {
    // Read shared broadcast style from WOSMapStyleAuthority for cross-reference
    var auth = global.SBE && global.SBE.WOSMapStyleAuthority;
    var sharedBroadcastStyle = auth && auth.getMapboxStyle ? auth.getMapboxStyle() : null;
    return {
      enabled:              true,
      tokenSource:          _state.tokenSource,
      tokenPresent:         _state.tokenPresent,
      tokenPreview:         _state.tokenPreview,
      initialStyle:         _state.initialStyle,
      activeStyle:          _state.activeStyle,
      sharedBroadcastStyle: sharedBroadcastStyle,
      customStyleAllowed:   _state.customStyleAllowed,
      lastStatus:           _state.lastStatus,
      lastError:            _state.lastError,
      lastErrorStatus:      _state.lastErrorStatus,
      updatedAt:            _state.updatedAt,
    };
  }

  global.WOSMapboxAccessController = {
    resolveToken:        resolveToken,
    resolveInitialStyle: resolveInitialStyle,
    recordMapError:      recordMapError,
    recordStyleLoaded:   recordStyleLoaded,
    canUseCustomStyle:   canUseCustomStyle,
    getSnapshot:         getSnapshot,
  };

  console.log('[WOSMapboxAccessController] ready — 0619F');
})(window);
