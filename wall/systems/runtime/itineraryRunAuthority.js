// ── ItineraryRunAuthority v1.4.0 ──────────────────────────────────────────────
// 0730D_MAPS_Itinerary_Runner_and_Active_Orb_Traversal
// 0730E_MAPS_RunPresentationControlsVisibilityFixAbsoluteClock
// 0730F_MAPS_CameraFollowHero
// 0805A_MAPS_Itinerary_Presentation_Foundation_Repairs
// 0805B_MAPS_Live_Map_Presentation_Surface_and_Shortcut_Registry
// Status: active | Classification: runtime / itinerary-run-authority
//
// Cross-context command/snapshot surface for the Itinerary Runner. Runs ONLY
// on canonical LIVE MAP (wall/index.html) — never loaded in music/index.html.
// MUSIC has no real map/HeroVehicleRuntime/OrbProfileRenderer to execute
// against, so it never calls this module directly; it sends commands over
// the same `wos:*` localStorage + 'storage'-event transport every other MAPS
// authority already uses (confirmed: no BroadcastChannel exists anywhere in
// this codebase), and reads back published snapshots the same way.
//
// This is the FIRST heartbeat/stale-lock-reclaim pattern in this codebase —
// deliberately minimal (no takeover UI, no distributed consensus beyond a
// single read-then-write lock acquisition — a genuine, documented v1
// limitation, not an oversight). If multiple LIVE MAP tabs are open, only
// the tab that successfully acquires wos:itineraryRun:owner executes; every
// other tab stays a passive snapshot reader.
//
// Delegates all actual animation to ItineraryRunController — this file owns
// the public lifecycle surface (Start/Pause/Resume/Stop/Restart), the lock,
// snapshot publication, and camera-touching presentation (Locate Hero,
// Follow Hero, launch readiness, keyboard shortcuts) — the controller owns
// the RAF loop and never touches the camera itself.
//
// v1.3.0 (0805A):
//   - Launch readiness handshake: wos:liveMap:readyRequest/ready, matched by
//     requestId. A crashed tab can leave a stale `ready` value behind with no
//     beforeunload ever firing to clear it — MUSIC must never treat an old
//     artifact as "ready right now," only a response whose requestId matches
//     the request it just issued.
//   - Camera-follow is now a damped, RAF-driven loop (replacing the old
//     250ms-interval `setCenter` step) targeting
//     ItineraryRunController.getPresentationEntity() — the SAME smoothed
//     entity the visible hero renders from, not the raw authoritative
//     position, so the camera and the hero move in lockstep instead of the
//     camera leading a laggier/jerkier visible actor. Started/stopped
//     alongside the snapshot-publish interval's own lifecycle (not on every
//     follow toggle), internally gated by _followEnabled each frame — same
//     shape as the interval it replaces. Never uses flyTo()/setCamera() —
//     only direct map.setCenter() calls, so there is no repeated animation
//     queue. The existing manual-interaction-disables-follow mechanism
//     (_ensureMapInteractionListeners/_onUserMapInteraction/
//     _boundInteractionMap) is reused completely unchanged.
//   - F/L/0/Esc keyboard shortcuts directly on canonical LIVE MAP (toggle
//     Follow / one-time Locate / release to Free Camera), guarded against
//     typing targets and key-repeat, scoped to the executing (owner) tab.
//   - setHeroVisualLift command (mirrors setHeroAltitude).
//   - Automatic Start → Locate → Follow on a successful start (no manual
//     Locate/Follow click required for the default launch path) — see
//     _handleStart's sequencing note on why Follow's engagement is delayed
//     slightly rather than fired the same instant as Locate's flyTo().
//
// v1.4.0 (0805B):
//   - F/L/0/Esc no longer bind their own raw `keydown` listener — they are
//     registered into SBE.KeyboardShortcutRegistry instead (4 register()
//     calls at load time, gated `enabled: () => _isOwner`), so this module's
//     shortcuts are documented/dispatched through the one canonical LIVE MAP
//     presentation-shortcut registry rather than a private listener. Behavior
//     is unchanged — same keys, same guards (typing-target + event.repeat,
//     now enforced once inside the registry's handleKeydown instead of here).
//
// Placement: wall/systems/runtime/itineraryRunAuthority.js
// Load: AFTER itineraryRouteSampler.js, itineraryRunController.js, and
// keyboardShortcutRegistry.js (this file registers into it at load time).
// BEFORE itineraryPresentationSurface.js (which subscribes to this module).
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.3.0';

  var STORAGE_COMMAND_KEY  = 'wos:itineraryRun:command';
  var STORAGE_SNAPSHOT_KEY = 'wos:itineraryRun:snapshot';
  var STORAGE_OWNER_KEY    = 'wos:itineraryRun:owner';

  // 0805A — launch readiness handshake keys.
  var STORAGE_LIVEMAP_REQUEST_KEY = 'wos:liveMap:readyRequest';
  var STORAGE_LIVEMAP_READY_KEY   = 'wos:liveMap:ready';

  var HEARTBEAT_MS         = 2000;
  // 0730E — widened from 2 (4s tolerance). setInterval-driven heartbeat writes
  // are themselves subject to background-tab timer throttling (browsers
  // commonly clamp hidden-tab timers to ~once/minute), so a genuinely-still-
  // owning-but-backgrounded tab was at real risk of having its lock wrongly
  // reclaimed as "crashed." ~80s tolerates that throttling; a truly crashed/
  // closed tab still reclaims eventually, just later — a deliberate trade-off,
  // not a silent constant tweak.
  var STALE_MULTIPLIER     = 40; // a lock older than HEARTBEAT_MS * this is reclaimable (~80s)
  var SNAPSHOT_PUBLISH_MS  = 250;

  // 0805A — camera-follow damping. Slightly snappier than actor smoothing
  // (which it damps ON TOP of) since it's tracking an already-smoothed target.
  var CAMERA_SMOOTH_K = 8;

  var _tabId = 'tab-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  var _isOwner = false;
  var _heartbeatInterval = null;
  var _snapshotInterval = null;
  var _listeners = [];

  // 0730F — Follow Hero state. Deliberately simple: one boolean, no stored
  // "mode" object, no queued camera moves.
  var _followEnabled = false;
  // Tracks the actual map INSTANCE listeners were bound to (not a plain
  // boolean) — a boolean would stay stuck `true` forever after binding onto
  // any one map object (e.g. a test's throwaway stub, or a real map instance
  // that later gets torn down/recreated on style reload), permanently
  // skipping rebinding onto whatever the real current map is afterward.
  var _boundInteractionMap = null;

  // 0805A — camera-follow RAF loop state.
  var _cameraRafId = null;
  var _cameraLastMs = 0;
  var _cameraSmoothedLng = null;
  var _cameraSmoothedLat = null;

  // 0805A — launch readiness.
  var _liveMapReady = false;
  var _followEnableTimer = null;

  function _controller() { return global.SBE && SBE.ItineraryRunController; }

  function _notify() {
    _listeners.slice().forEach(function (fn) {
      try { fn(); } catch (e) { console.warn('[ItineraryRunAuthority] subscriber threw:', e && e.message || e); }
    });
  }

  // ── Owner lock (localStorage CAS-ish — single read-then-write, no async
  // re-verify; a genuine, documented race window if two tabs call start() in
  // the same millisecond — acceptable for v1's "fail clearly" scope). ───────
  function _readOwnerLock() {
    try {
      var raw = global.localStorage.getItem(STORAGE_OWNER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function _writeOwnerLock(lock) {
    try { global.localStorage.setItem(STORAGE_OWNER_KEY, JSON.stringify(lock)); } catch (e) {}
  }
  function _clearOwnerLock() {
    try { global.localStorage.removeItem(STORAGE_OWNER_KEY); } catch (e) {}
  }
  function _isLockStale(lock) {
    if (!lock || !lock.heartbeatAt) return true;
    return (Date.now() - lock.heartbeatAt) > HEARTBEAT_MS * STALE_MULTIPLIER;
  }
  function _tryAcquireLock(itineraryId) {
    var existing = _readOwnerLock();
    if (existing && existing.ownerId !== _tabId && !_isLockStale(existing)) {
      return false; // a different, live tab already owns an active run
    }
    _writeOwnerLock({ ownerId: _tabId, itineraryId: itineraryId, runId: null, startedAt: new Date().toISOString(), heartbeatAt: Date.now() });
    return true;
  }
  function _releaseOwnership() {
    _isOwner = false;
    _stopHeartbeat();
    _stopSnapshotPublishing();
    _stopCameraLoop();
    if (_followEnableTimer != null) { global.clearTimeout(_followEnableTimer); _followEnableTimer = null; }
    var lock = _readOwnerLock();
    if (lock && lock.ownerId === _tabId) _clearOwnerLock();
  }

  function _startHeartbeat() {
    _stopHeartbeat();
    _heartbeatInterval = global.setInterval(function () {
      if (!_isOwner) return;
      var lock = _readOwnerLock();
      if (lock && lock.ownerId === _tabId) {
        lock.heartbeatAt = Date.now();
        _writeOwnerLock(lock);
      }
    }, HEARTBEAT_MS);
  }
  function _stopHeartbeat() {
    if (_heartbeatInterval != null) { global.clearInterval(_heartbeatInterval); _heartbeatInterval = null; }
  }

  // Merges current Follow Hero state into every published/returned snapshot,
  // in exactly one place, so no call site can publish a snapshot that's
  // silently stale on this one field.
  function _withFollowState(snapshot) {
    if (!snapshot) return snapshot;
    return Object.assign({}, snapshot, { followHeroEnabled: _followEnabled });
  }

  function _publishSnapshot(snapshot) {
    try { global.localStorage.setItem(STORAGE_SNAPSHOT_KEY, JSON.stringify(_withFollowState(snapshot))); } catch (e) {}
  }
  function _startSnapshotPublishing() {
    _stopSnapshotPublishing();
    _snapshotInterval = global.setInterval(function () {
      if (!_isOwner) return;
      _publishSnapshot(_controller().getSnapshot());
    }, SNAPSHOT_PUBLISH_MS);
  }
  function _stopSnapshotPublishing() {
    if (_snapshotInterval != null) { global.clearInterval(_snapshotInterval); _snapshotInterval = null; }
  }

  function _controllerSnapshotOrNull() {
    var controller = _controller();
    return controller ? controller.getSnapshot() : null;
  }

  // ── Follow Hero (0730F) — interaction detection unchanged from 0730F ──────
  function _ensureMapInteractionListeners(map) {
    if (!map || map === _boundInteractionMap || typeof map.on !== 'function') return;
    ['dragstart', 'zoomstart', 'rotatestart', 'pitchstart'].forEach(function (evt) {
      map.on(evt, _onUserMapInteraction);
    });
    _boundInteractionMap = map;
  }

  // Mapbox sets `e.originalEvent` only when a `*start` event was triggered by
  // real user input (mouse/touch/keyboard) — our own `map.setCenter()` calls
  // never fire these `*start` events at all, so this listener only ever sees
  // genuine manual interaction, never our own follow-camera nudges.
  function _onUserMapInteraction(e) {
    if (!_followEnabled) return;
    if (!e || !e.originalEvent) return;
    _followEnabled = false;
    _publishSnapshot(_controllerSnapshotOrNull());
    _notify();
  }

  function _expFactor(k, dt) { return 1 - Math.exp(-k * dt); }

  // 0805A — damped per-frame camera-follow tick. Targets
  // controller.getPresentationEntity() (the SAME smoothed entity the visible
  // hero renders from) rather than the raw authoritative position, so the
  // camera never leads the hero. dtOverride is test-only (deterministic
  // convergence testing without depending on real Date.now() deltas).
  function _cameraTick(dtOverride) {
    if (!_isOwner || !_followEnabled) return;
    var controller = _controller();
    if (!controller || typeof controller.getPresentationEntity !== 'function') return;
    var target = controller.getPresentationEntity();
    if (!target || target.lng == null || target.lat == null) return;
    var mvr = global.SBE && SBE.MapboxViewportRuntime;
    var map = mvr && typeof mvr.getMap === 'function' ? mvr.getMap() : null;
    if (!map || typeof map.setCenter !== 'function') return;
    _ensureMapInteractionListeners(map);

    var dt;
    if (typeof dtOverride === 'number') {
      dt = dtOverride;
    } else {
      var real = Date.now();
      dt = (_cameraLastMs > 0) ? Math.min((real - _cameraLastMs) / 1000, 0.1) : 0.016;
      _cameraLastMs = real;
    }

    if (_cameraSmoothedLng == null) {
      _cameraSmoothedLng = target.lng;
      _cameraSmoothedLat = target.lat;
    } else {
      var f = _expFactor(CAMERA_SMOOTH_K, dt);
      _cameraSmoothedLng += (target.lng - _cameraSmoothedLng) * f;
      _cameraSmoothedLat += (target.lat - _cameraSmoothedLat) * f;
    }
    // setCenter() only ever changes center — zoom/pitch/bearing are
    // untouched, per the explicit requirement to preserve them. Never
    // flyTo()/setCamera() — no repeated animation queue.
    try { map.setCenter([_cameraSmoothedLng, _cameraSmoothedLat]); } catch (e) {}
  }

  function _cameraFrame() {
    _cameraRafId = global.requestAnimationFrame(_cameraFrame);
    _cameraTick();
  }

  // Started/stopped alongside the snapshot-publish interval's own lifecycle
  // (run start/stop), NOT on every follow toggle — matches the shape of the
  // interval it replaces and avoids start/stop race bookkeeping around rapid
  // toggling. The loop body's own _followEnabled gate does the real work of
  // turning camera-following on/off.
  function _startCameraLoop() {
    if (_cameraRafId != null) return;
    _cameraLastMs = 0;
    _cameraSmoothedLng = null;
    _cameraSmoothedLat = null;
    _cameraRafId = global.requestAnimationFrame(_cameraFrame);
  }
  function _stopCameraLoop() {
    if (_cameraRafId != null) { try { global.cancelAnimationFrame(_cameraRafId); } catch (e) {} _cameraRafId = null; }
    _cameraLastMs = 0;
    _cameraSmoothedLng = null;
    _cameraSmoothedLat = null;
  }

  // One-shot, immediate re-center — used only at the instant Follow is
  // enabled, preserving 0730F's proven "enabling follow immediately
  // re-centers" behavior. Seeds the damped loop's smoothed state to the
  // current target so subsequent frames damp forward from the true position
  // instead of a stale/zero one.
  function _snapCameraToTargetNow() {
    var controller = _controller();
    var target = controller && typeof controller.getPresentationEntity === 'function' ? controller.getPresentationEntity() : null;
    if (!target || target.lng == null || target.lat == null) return;
    var mvr = global.SBE && SBE.MapboxViewportRuntime;
    var map = mvr && typeof mvr.getMap === 'function' ? mvr.getMap() : null;
    if (!map || typeof map.setCenter !== 'function') return;
    _ensureMapInteractionListeners(map);
    _cameraSmoothedLng = target.lng;
    _cameraSmoothedLat = target.lat;
    _cameraLastMs = Date.now();
    try { map.setCenter([target.lng, target.lat]); } catch (e) {}
  }

  function setFollowHero(enabled) {
    _followEnabled = !!enabled;
    if (_followEnabled) _snapCameraToTargetNow();
    _publishSnapshot(_controllerSnapshotOrNull());
    _notify();
    return { ok: true, followHeroEnabled: _followEnabled };
  }

  function getFollowHero() { return _followEnabled; }

  // 0730E — one-shot camera jump to the current run's position. Deliberately
  // NOT continuous camera-follow: a single flyTo, no stored mode, no repeat
  // calls. Only meaningful on the executing tab, which is the only one with a
  // real map/camera. Uses the AUTHORITATIVE position (not the presentation-
  // smoothed one) — a deliberate one-time locate should land exactly on
  // truth, not a lagged target.
  function _locateHero() {
    var controller = _controller();
    var mvr = global.SBE && SBE.MapboxViewportRuntime;
    if (!controller || !mvr || typeof mvr.flyTo !== 'function') return;
    var snapshot = controller.getSnapshot();
    if (snapshot.longitude == null || snapshot.latitude == null) return;
    try {
      // Zoom 17 matches the marker/Orb's own "full scale" threshold
      // (heroVehicleRenderer.js's _zoomScale()) — without an explicit zoom,
      // flyTo keeps whatever wide flight-planning zoom the camera was already
      // at, which can leave the hero too small to actually see.
      mvr.flyTo({ center: [snapshot.longitude, snapshot.latitude], zoom: 17, duration: 800, speed: 1.2 });
    } catch (e) {}
  }

  // ── Command handling (from MUSIC, via 'storage' events) ───────────────────
  function _handleStart(payload, speedMultiplier, heroAltitudeMeters, heroVisualLiftPixels, initialFollowEnabled) {
    var controller = _controller();
    if (!controller) return;
    if (!_tryAcquireLock(payload.itineraryId)) {
      return; // another live tab already owns an active run — stay a passive reader
    }
    _isOwner = true;
    var result = controller.start(payload, speedMultiplier, heroAltitudeMeters, heroVisualLiftPixels);
    if (!result.ok) {
      _releaseOwnership();
      _publishSnapshot(Object.assign({}, controller.getSnapshot(), { status: 'error', errorCode: result.reason, errorMessage: 'start failed: ' + result.reason }));
      _notify();
      return;
    }
    var lock = _readOwnerLock();
    if (lock) { lock.runId = result.runId; lock.heartbeatAt = Date.now(); _writeOwnerLock(lock); }
    _startHeartbeat();
    _startSnapshotPublishing();
    _startCameraLoop();

    // 0805A — automatic Start → Locate → Follow. Locate's flyTo() (~800ms,
    // also sets a usable zoom) and Follow's own setCenter() would otherwise
    // fight each other — Mapbox cancels an in-progress flyTo() the instant
    // any setCenter() call lands. Sequencing them (locate completes first,
    // follow engages ~50ms after) lets the opening view resolve cleanly
    // before the damped follow loop takes over from that same position — the
    // run itself starts immediately regardless; only the CAMERA behavior is
    // sequenced, matching the spec's own explicit flow ordering.
    _locateHero();
    var followDefault = initialFollowEnabled !== false; // default true
    if (_followEnableTimer != null) { global.clearTimeout(_followEnableTimer); _followEnableTimer = null; }
    if (followDefault) {
      var runIdAtStart = result.runId;
      _followEnableTimer = global.setTimeout(function () {
        _followEnableTimer = null;
        // Guard: only apply if this exact run is still the one executing
        // (not stopped/restarted in the interim).
        if (!_isOwner) return;
        var current = _controllerSnapshotOrNull();
        if (!current || current.runId !== runIdAtStart) return;
        _followEnabled = true;
        _snapCameraToTargetNow();
        _publishSnapshot(current);
        _notify();
      }, 850);
    }

    _publishSnapshot(controller.getSnapshot());
    _notify();
  }

  function _handleCommand(cmd) {
    var controller = _controller();
    if (!controller || !cmd || !cmd.type) return;
    if (cmd.type === 'start') {
      _handleStart(cmd.payload, cmd.speedMultiplier, cmd.heroAltitudeMeters, cmd.heroVisualLiftPixels, cmd.initialFollowEnabled);
      return;
    }
    if (!_isOwner) return; // all other commands only apply to the executing tab
    switch (cmd.type) {
      case 'pause': controller.pause(); break;
      case 'resume': controller.resume(); break;
      case 'restart': controller.restart(); break;
      case 'setPlaybackRate': controller.setPlaybackRate(cmd.rate); break;
      case 'setHeroAltitude': controller.setHeroAltitude(cmd.meters); break;
      case 'setHeroVisualLift': controller.setHeroVisualLift(cmd.pixels); break;
      case 'setFollowHero':
        _followEnabled = !!cmd.enabled;
        if (_followEnabled) _snapCameraToTargetNow();
        break;
      case 'locate': _locateHero(); return; // no state change — no snapshot republish needed
      case 'stop':
        controller.stop();
        _followEnabled = false; // explicit: Stop disables Follow Hero
        if (_followEnableTimer != null) { global.clearTimeout(_followEnableTimer); _followEnableTimer = null; }
        _publishSnapshot(controller.getSnapshot());
        _releaseOwnership();
        _notify();
        return;
      default: return;
    }
    _publishSnapshot(controller.getSnapshot());
    _notify();
  }

  function _onStorageEvent(e) {
    if (e.key !== STORAGE_COMMAND_KEY || !e.newValue) return;
    var cmd;
    try { cmd = JSON.parse(e.newValue); } catch (err) { return; }
    _handleCommand(cmd);
  }

  // ── Launch readiness handshake (0805A) ─────────────────────────────────────
  // MUSIC writes a fresh {requestId, issuedAt} to STORAGE_LIVEMAP_REQUEST_KEY
  // per launch attempt and waits ONLY for a STORAGE_LIVEMAP_READY_KEY response
  // whose requestId matches — never treating a leftover value (e.g. from a
  // crashed tab that never fired beforeunload) as proof of current readiness.
  function _respondToLiveMapRequest() {
    try {
      var raw = global.localStorage.getItem(STORAGE_LIVEMAP_REQUEST_KEY);
      if (!raw) return;
      var req = JSON.parse(raw);
      if (!req || !req.requestId) return;
      global.localStorage.setItem(STORAGE_LIVEMAP_READY_KEY, JSON.stringify({ requestId: req.requestId, ready: true, at: Date.now() }));
    } catch (e) {}
  }
  function _onLiveMapRequestStorageEvent(e) {
    if (e.key !== STORAGE_LIVEMAP_REQUEST_KEY || !e.newValue) return;
    // If not yet ready, the onReady handler below responds once it fires,
    // reading whatever the LATEST request is at that time — so both orderings
    // (request arrives before vs. after the map finishes loading) are correct.
    if (_liveMapReady) _respondToLiveMapRequest();
  }
  (function _setupLiveMapReadiness() {
    var mvr = global.SBE && SBE.MapboxViewportRuntime;
    if (mvr && typeof mvr.onReady === 'function') {
      try {
        mvr.onReady(function () {
          _liveMapReady = true;
          _respondToLiveMapRequest();
        });
      } catch (e) {}
    }
    try { global.addEventListener('storage', _onLiveMapRequestStorageEvent); } catch (e) {}
  })();

  // ── Keyboard shortcuts (0805A; dispatched via KeyboardShortcutRegistry as
  // of 0805B) — F/L/0/Esc directly on canonical LIVE MAP, scoped to the
  // executing (owner) tab. Registered once at load time; the registry itself
  // (loaded BEFORE this file) owns the actual keydown listener, typing-target
  // guard, and event.repeat guard — this module only supplies definitions.
  (function _registerItineraryShortcuts() {
    var registry = global.SBE && SBE.KeyboardShortcutRegistry;
    if (!registry) return; // registry not loaded — shortcuts simply unavailable, no crash
    registry.register({
      id: 'itinerary-toggle-follow', keys: ['f'], label: 'Toggle Follow',
      description: 'Enable/disable continuous camera follow of the itinerary actor.',
      group: 'Camera', context: 'itinerary', userFacing: true,
      enabled: function () { return _isOwner; },
      handler: function (e) { e.preventDefault(); setFollowHero(!_followEnabled); },
    });
    registry.register({
      id: 'itinerary-locate', keys: ['l'], label: 'Locate Actor',
      description: 'One-time camera jump to the actor\'s current position.',
      group: 'Camera', context: 'itinerary', userFacing: true,
      enabled: function () { return _isOwner; },
      handler: function (e) { e.preventDefault(); _locateHero(); },
    });
    registry.register({
      id: 'itinerary-free-camera-0', keys: ['0', 'Digit0'], label: 'Free Camera',
      description: 'Release the camera from Follow.',
      group: 'Camera', context: 'itinerary', userFacing: true,
      enabled: function () { return _isOwner; },
      handler: function (e) { e.preventDefault(); if (_followEnabled) setFollowHero(false); },
    });
    registry.register({
      id: 'itinerary-free-camera-esc', keys: ['Escape'], label: 'Release Camera Automation',
      description: 'Release the camera from Follow.',
      group: 'Camera', context: 'itinerary', userFacing: true,
      enabled: function () { return _isOwner; },
      handler: function (e) { e.preventDefault(); if (_followEnabled) setFollowHero(false); },
    });
  })();

  // ── Public API ─────────────────────────────────────────────────────────────
  // getSnapshot(): local controller state if this tab owns the active run,
  // otherwise the last snapshot published by whichever tab does (or an idle
  // default) — same-tab consumers (e.g. traversalHUD.js in THIS document)
  // read this directly; cross-context MUSIC reads the localStorage key itself.
  function getSnapshot() {
    if (_isOwner) return _withFollowState(_controller().getSnapshot());
    try {
      var raw = global.localStorage.getItem(STORAGE_SNAPSHOT_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return _controller() ? _withFollowState(_controller().getSnapshot()) : null;
  }

  function isOwner() { return _isOwner; }

  function subscribe(fn) {
    _listeners.push(fn);
    return function unsubscribe() {
      var i = _listeners.indexOf(fn);
      if (i >= 0) _listeners.splice(i, 1);
    };
  }

  try { global.addEventListener('storage', _onStorageEvent); } catch (e) {}
  try {
    global.addEventListener('beforeunload', function () {
      // Teardown — one of the explicit clearActorPosition() triggers. Also
      // publish the resulting idle snapshot before releasing ownership, so
      // MUSIC's UI doesn't keep showing stale "running" telemetry after this
      // tab closes/reloads — "reload returns runner to idle" must be visible
      // cross-context, not just true in this tab's own (about-to-vanish) memory.
      if (_isOwner) {
        var controller = _controller();
        if (controller) {
          controller.teardown();
          _followEnabled = false;
          _publishSnapshot(controller.getSnapshot());
        }
        _releaseOwnership();
      }
      // Defense-in-depth: also clear the readiness flag directly (in addition
      // to the requestId-matching check MUSIC always performs) so a clean
      // close never even leaves an ambiguous artifact behind.
      try { global.localStorage.removeItem(STORAGE_LIVEMAP_READY_KEY); } catch (e2) {}
    });
  } catch (e) {}

  SBE.ItineraryRunAuthority = Object.freeze({
    VERSION: VERSION,
    getSnapshot: getSnapshot,
    isOwner: isOwner,
    subscribe: subscribe,
    setFollowHero: setFollowHero,
    getFollowHero: getFollowHero,
    // Test-only accessors — never surfaced in production UI.
    __test: {
      tabId: _tabId,
      STORAGE_COMMAND_KEY: STORAGE_COMMAND_KEY,
      STORAGE_SNAPSHOT_KEY: STORAGE_SNAPSHOT_KEY,
      STORAGE_OWNER_KEY: STORAGE_OWNER_KEY,
      STORAGE_LIVEMAP_REQUEST_KEY: STORAGE_LIVEMAP_REQUEST_KEY,
      STORAGE_LIVEMAP_READY_KEY: STORAGE_LIVEMAP_READY_KEY,
      simulateCommand: function (cmd) { _handleCommand(cmd); },
      // 0805B — F/L/0/Esc dispatch through the shared KeyboardShortcutRegistry
      // now, not a private listener; route the simulated event the same way
      // production keydown events reach it.
      simulateKeydown: function (e) {
        var registry = global.SBE && SBE.KeyboardShortcutRegistry;
        if (registry) registry.handleKeydown(e);
      },
      readOwnerLock: _readOwnerLock,
      isLockStale: _isLockStale,
      HEARTBEAT_MS: HEARTBEAT_MS,
      STALE_MULTIPLIER: STALE_MULTIPLIER,
      cameraTick: function (dtOverride) { _cameraTick(dtOverride); },
      isCameraLoopRunning: function () { return _cameraRafId != null; },
      respondToLiveMapRequestNow: function () { _respondToLiveMapRequest(); },
      setLiveMapReady: function (v) { _liveMapReady = !!v; },
    },
  });

  console.log('[ItineraryRunAuthority] v' + VERSION + ' loaded, tab', _tabId);

})(window);
