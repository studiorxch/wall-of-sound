// ── SubwayMezzanineDrawer v1.0.0 ───────────────────────────────────────────────
// STATION-04 — MAP → Station Cover presentation consolidation.
//
// Owns the Mezzanine Drawer's CONTAINER only: open/close, the resizable
// width (315-540px, default 360px, persisted locally), and triggering
// the existing centralized viewport resize sync (main.js's own
// SBE.WorkspaceViewportSync, the same hook DrawerSystem/inspector-collapse
// already use) after any width change — never a second, independently
// implemented resize-scheduling loop.
//
// Deliberately owns NO station-information rendering of its own. The
// drawer's actual content is a same-origin iframe pointing at the exact
// same music/station.html page Station Cover already built and tests
// (?embedded=1 — see stationCoverRuntime.ts's own STATION-04 doc) — this
// module never re-derives station identity, route styling, direction
// state, arrival rules, or line orientation. Reuse, not duplication.
//
// NOT `SBE.DrawerSystem` (wall/ui/drawerSystem.js): that system is an
// overlay/backdrop-based, closes-on-outside-click drawer for CREATOR
// TOOLS (Sampler/Library), explicitly suppressed in subway-public mode
// (see styles.css's own `body.subway-public #drawer-panel` rule) — the
// wrong shape for "MAP flexes beside it, never floats over it" (STATION-04's
// own explicit product requirement). This module instead drives a real
// CSS Grid column on `.app-body` (--mezzanine-drawer-width), the same
// pattern `#right-panel`/`--inspector-width` already use.
//
// Status: active | Classification: presentation (DOM/CSS var only — no
// fetch, no canonical identity of its own)
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  var MIN_WIDTH = 315;
  var DEFAULT_WIDTH = 360;
  var MAX_WIDTH = 540;
  var STORAGE_KEY = 'wos.subwayMezzanineDrawerWidth';

  var _openGtfsStopId = null;
  // The drawer's PREFERRED width while open (315-540, persisted) -- distinct
  // from the CSS var, which is this value while open but 0 while closed.
  // Conflating the two was a real bug caught by this module's own test
  // suite: close() must collapse the grid column to 0 so MAP actually
  // reclaims the space, but must NOT forget the user's chosen width for
  // the next open().
  var _openWidth = _clampWidth(DEFAULT_WIDTH);
  var _dom = null; // { drawerEl, frameEl, handleEl }
  var _dragging = false;
  var _dragStartX = 0;
  var _dragStartWidth = 0;
  var _persistedWidthLoaded = false;

  function _clampWidth(px) {
    return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(px)));
  }

  function _loadPersistedWidth() {
    try {
      var raw = global.localStorage ? global.localStorage.getItem(STORAGE_KEY) : null;
      var parsed = raw != null ? parseInt(raw, 10) : NaN;
      return Number.isFinite(parsed) ? _clampWidth(parsed) : DEFAULT_WIDTH;
    } catch (e) {
      return DEFAULT_WIDTH; // private-browsing/storage-denied — never throw, just fall back
    }
  }

  function _persistWidth(px) {
    try {
      if (global.localStorage) global.localStorage.setItem(STORAGE_KEY, String(px));
    } catch (e) { /* best-effort only — a failed write never blocks resizing */ }
  }

  function _scheduleViewportSync() {
    var sync = SBE.WorkspaceViewportSync;
    if (sync && typeof sync.schedule === 'function') sync.schedule();
  }

  // Sets the actual rendered CSS grid-column width. `px` is 0 while
  // closed, `_openWidth` while open -- this is the ONLY function that
  // touches the CSS var; `_openWidth` (the user's preference) is a
  // separate concern updated by `_setOpenWidth`.
  function _applyRenderedWidth(px) {
    global.document.documentElement.style.setProperty('--mezzanine-drawer-width', px + 'px');
  }

  function _setOpenWidth(px) {
    _openWidth = _clampWidth(px);
    if (isOpen()) _applyRenderedWidth(_openWidth);
  }

  function _ensureDom() {
    if (_dom || !global.document) return _dom;
    var drawerEl = global.document.getElementById('subway-mezzanine-drawer');
    var frameEl = global.document.getElementById('subway-mezzanine-drawer-frame');
    var handleEl = global.document.getElementById('subway-mezzanine-drawer-resize-handle');
    if (!drawerEl || !frameEl || !handleEl) return null; // static markup missing — fail closed, never synthesize it here
    handleEl.addEventListener('pointerdown', _onHandlePointerDown);
    _dom = { drawerEl: drawerEl, frameEl: frameEl, handleEl: handleEl };
    return _dom;
  }

  // ── Drawer → MAP: restore SubwayLineRibbon.showLineMode() ──────────────────
  // STATION-04A — the smallest appropriate drawer→MAP communication
  // mechanism: station.html (the drawer's own content, a separate
  // document) has no way to call a wall/-realm function directly, so it
  // posts a same-origin message instead; this module — which already owns
  // the one real reference to the specific iframe window the message must
  // have come from — validates it before acting. Never trusts event.data
  // merely because event.origin matches (a different same-origin page in
  // some OTHER iframe could otherwise spoof this); requires BOTH the
  // origin AND the exact source window to match this drawer's own iframe.
  var LINE_MODE_MESSAGE_TYPE = 'stationCover:showLineMode';

  function _onWindowMessage(event) {
    if (event.origin !== global.location.origin) return;
    if (!_dom || event.source !== _dom.frameEl.contentWindow) return;
    var data = event.data;
    if (!data || data.type !== LINE_MODE_MESSAGE_TYPE || typeof data.routeId !== 'string' || !data.routeId) return;
    var ribbon = SBE.SubwayLineRibbon;
    if (ribbon) ribbon.showLineMode('subway:route:' + data.routeId); // same canonical-id convention _buildLineBadge's own removed click handler used
  }
  global.addEventListener('message', _onWindowMessage);

  // ── Resize drag ────────────────────────────────────────────────────────────
  function _onHandlePointerDown(event) {
    var dom = _ensureDom();
    if (!dom || !isOpen()) return; // dragging a closed (0-width) drawer makes no sense
    _dragging = true;
    _dragStartX = event.clientX;
    _dragStartWidth = _openWidth;
    global.document.body.classList.add('subway-mezzanine-resizing');
    dom.handleEl.setPointerCapture(event.pointerId);
    global.document.addEventListener('pointermove', _onHandlePointerMove);
    global.document.addEventListener('pointerup', _onHandlePointerUp);
  }

  function _onHandlePointerMove(event) {
    if (!_dragging) return;
    // Handle sits on the drawer's LEFT edge — dragging left (negative dx)
    // widens the drawer, matching the physical direction of the drag.
    var dx = event.clientX - _dragStartX;
    _setOpenWidth(_dragStartWidth - dx);
    _scheduleViewportSync();
  }

  function _onHandlePointerUp() {
    if (!_dragging) return;
    _dragging = false;
    global.document.body.classList.remove('subway-mezzanine-resizing');
    global.document.removeEventListener('pointermove', _onHandlePointerMove);
    global.document.removeEventListener('pointerup', _onHandlePointerUp);
    _persistWidth(_openWidth);
    _scheduleViewportSync(); // final settle, in case the last move event was coalesced away
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  // `gtfsStopId` -- the real, station-level GTFS stop id (e.g. "R42"), the
  // exact same identity `stationTruth.ts`/`station.html?station=` already
  // key on -- never `studioRichStationId` (the caller, subwayStationHud.js,
  // already resolves this join via `record.authoritativeLink.gtfsStopId`).
  function open(gtfsStopId) {
    if (!gtfsStopId) return { ok: false, reason: 'missing_gtfs_stop_id' };
    var dom = _ensureDom();
    if (!dom) return { ok: false, reason: 'dom_unavailable' };

    if (_openGtfsStopId !== gtfsStopId) {
      // Same-origin, exact same page Station Cover already built/tests --
      // never a second implementation (see this file's own header).
      dom.frameEl.src = new URL('../station.html?station=' + encodeURIComponent(gtfsStopId) + '&embedded=1', global.location.href).href;
      _openGtfsStopId = gtfsStopId;
    }

    if (!_persistedWidthLoaded) {
      // First open this session only -- a later resize/persist during the
      // session is always the freshest truth, never re-read from storage
      // mid-session (that would fight a drag already applied via _setOpenWidth).
      _persistedWidthLoaded = true;
      _openWidth = _loadPersistedWidth();
    }
    _applyRenderedWidth(_openWidth); // grid column actually expands -- see close()'s own collapse
    global.document.body.classList.add('subway-mezzanine-open');
    dom.drawerEl.setAttribute('aria-hidden', 'false');
    _scheduleViewportSync();
    return { ok: true };
  }

  function close() {
    var dom = _ensureDom();
    _openGtfsStopId = null;
    if (dom) {
      global.document.body.classList.remove('subway-mezzanine-open');
      dom.drawerEl.setAttribute('aria-hidden', 'true');
      dom.frameEl.src = 'about:blank'; // stop the embedded page's own work while closed
    }
    _applyRenderedWidth(0); // MAP's own grid column reclaims the space -- the entire point of the Grid-based layout
    _scheduleViewportSync();
  }

  function isOpen() {
    return _openGtfsStopId !== null;
  }

  // The drawer's PREFERRED width (315-540) -- meaningful whether open or
  // closed (it's what the NEXT open() will use), unlike the CSS var itself
  // which is 0 while closed. See this file's own `_openWidth` doc above.
  function getWidth() {
    return _openWidth;
  }

  function getOpenGtfsStopId() {
    return _openGtfsStopId;
  }

  SBE.SubwayMezzanineDrawer = Object.freeze({
    VERSION: VERSION,
    MIN_WIDTH: MIN_WIDTH,
    DEFAULT_WIDTH: DEFAULT_WIDTH,
    MAX_WIDTH: MAX_WIDTH,
    open: open,
    close: close,
    isOpen: isOpen,
    getWidth: getWidth,
    getOpenGtfsStopId: getOpenGtfsStopId,
    // Test-only exposures — pure/deterministic, never mutate real DOM state.
    __test: {
      clampWidth: _clampWidth,
      setOpenWidth: _setOpenWidth,
      storageKey: STORAGE_KEY,
      handleWindowMessage: _onWindowMessage,
      lineModeMessageType: LINE_MODE_MESSAGE_TYPE,
    },
  });

  console.log('[SubwayMezzanineDrawer] v' + VERSION + ' loaded');
})(window);
