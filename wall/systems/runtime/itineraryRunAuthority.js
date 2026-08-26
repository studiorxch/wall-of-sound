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

  // TEMPORARY diagnostics (0820_SUBWAY_Post_Launch_Execution_Investigation) —
  // remove alongside this file's other diag blocks once the reported
  // post-launch stall is root-caused.
  var _diagFollowTimerFiredAt = null;
  var _diagFollowTimerOutcome = null; // null (never fired yet) | 'blocked_not_owner' | 'blocked_runid_mismatch' | 'enabled'
  var _diagFollowTimerRunIdAtStart = null;
  var _diagFollowTimerCurrentRunId = null;

  // TEMPORARY diagnostics — boot-time pending-command delivery path. Answers:
  // did the map's onReady callback register at all (mvr existed at THIS
  // script's own load time)? Did it fire (map genuinely became ready)? Did
  // the boot check run, and what did it see in localStorage at that moment?
  // Did the live cross-tab 'storage' listener ever fire as an alternate path?
  var _diagOnReadySetupAt = Date.now();
  var _diagOnReadyRegistered = null; // null (setup IIFE hasn't run yet — impossible after load) | true | false (mvr or mvr.onReady missing at registration time)
  var _diagOnReadyFiredAt = null;
  var _diagOnReadyFiredCount = 0;
  var _diagBootCheckLog = []; // [{at, outcome, commandId, issuedAt, ageMs}]
  var _diagStorageEventCount = 0;
  var _diagStorageEventLastAt = null;
  var _diagStorageEventLastKey = null;
  var MAX_DIAG_LOG = 20;

  // TEMPORARY diagnostic — the owner lock (_tryAcquireLock) gates whether
  // _handleStart() ever calls controller.start() at all. If it fails,
  // _handleStart() returns silently: no error, no publish, no notify, and
  // this tab's own getSnapshot() (non-owner branch) falls back to whatever
  // snapshot happens to already be sitting in STORAGE_SNAPSHOT_KEY — which
  // can be a stale/foreign snapshot from an earlier or different tab's run,
  // read back and displayed as if it were this tab's own live state, while
  // ItineraryRunController.getDiagnostics() (this tab's REAL, local
  // controller) correctly shows frameCount:0 / not running. That combination
  // — a "running" snapshot with real elapsed/distance values alongside a
  // controller that never ticked — is exactly the reported symptom. This log
  // makes a silent lock failure visible instead of indistinguishable from a
  // legitimate passive-reader tab. Remove alongside this file's other diag
  // blocks once the stall is root-caused.
  var _diagLockAcquireLog = []; // [{at, outcome:'acquired'|'blocked_existing_owner', existingOwnerId, existingHeartbeatAgeMs, thisTabId}]

  // TEMPORARY diagnostics (0820_MAPS_Itinerary_Execution_Lifecycle_Repair) —
  // _handleCommand() is the ONE canonical entry point every command source
  // (boot recovery, live 'storage' event) funnels through — confirmed by
  // grep, not assumed: it has exactly two production callers plus the test
  // hook. These fields make that entry point's own activity directly
  // provable instead of inferred from downstream effects.
  var _diagLastConsumedCommandId = null;
  var _diagLastConsumedCommandAt = null;
  var _diagLastConsumedCommandType = null;
  var _diagHandleStartCallCount = 0;
  var _diagLastHandleStartAt = null;

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
  function _diagLogLockAcquire(outcome, existing) {
    _diagLockAcquireLog.push({
      at: Date.now(), outcome: outcome, thisTabId: _tabId,
      existingOwnerId: existing ? existing.ownerId : null,
      existingHeartbeatAgeMs: existing && existing.heartbeatAt ? (Date.now() - existing.heartbeatAt) : null,
    });
    if (_diagLockAcquireLog.length > MAX_DIAG_LOG) _diagLockAcquireLog.shift();
  }
  // 0820_MAPS_Itinerary_Execution_Lifecycle_FocusPriority — a real, confirmed
  // production case: a fresh command reaches the tab the user is actually
  // looking at (COMMAND DELIVERY / HANDLE START both correct), but a
  // DIFFERENT, live, non-stale LIVE MAP tab already holds the lock (some
  // other open window/tab from earlier testing) and staleness-based
  // arbitration alone has no way to prefer "the one the user can see" over
  // "whichever tab happened to grab it first." A focused tab directly
  // represents what the user is looking at RIGHT NOW — the strongest signal
  // of intent available without inventing a new addressing/targeting
  // protocol. A focused tab therefore always wins acquisition, even against
  // a live non-stale owner. The old owner is never left running
  // uncoordinated: the self-demoting heartbeat below (already shipped and
  // tested in the prior checkpoint) discovers the supersession and stops
  // itself within one heartbeat interval (2s) regardless of why it lost the
  // lock, so this reuses existing, proven machinery rather than adding a
  // new mechanism.
  function _isThisTabFocused() {
    try { return !!(global.document && typeof global.document.hasFocus === 'function' && global.document.hasFocus()); } catch (e) { return false; }
  }
  function _tryAcquireLock(itineraryId) {
    var existing = _readOwnerLock();
    var focused = _isThisTabFocused();
    var blockedByLiveOwner = existing && existing.ownerId !== _tabId && !_isLockStale(existing);
    if (blockedByLiveOwner && !focused) {
      _diagLogLockAcquire('blocked_existing_owner', existing);
      return false; // a different, live tab already owns an active run, and this tab isn't the one the user is looking at
    }
    var isFocusOverride = blockedByLiveOwner && focused;
    _writeOwnerLock({ ownerId: _tabId, itineraryId: itineraryId, runId: null, startedAt: new Date().toISOString(), heartbeatAt: Date.now() });
    // Read-after-write verification (0820_MAPS_Itinerary_Execution_Lifecycle_Ownership)
    // — localStorage write-then-read-back is the narrowest check available
    // without a true cross-tab mutex (no navigator.locks usage anywhere in
    // this codebase to build on, and introducing one is a bigger change
    // than this checkpoint's scope). This does not fully close the race —
    // another tab's write can still land between this write and this read —
    // but it catches the common case directly, and the self-correcting
    // heartbeat below (_startHeartbeat) is the real backstop: even if this
    // check passes falsely, a superseded tab discovers it and stops itself
    // within one heartbeat interval (2s), never running indefinitely as an
    // uncoordinated second owner — confirmed as a REAL, persistent failure
    // mode this pass (a genuinely separate second LIVE MAP tab ran its own
    // full local execution, camera included, for over a minute with zero
    // self-correction, before this fix).
    var confirmed = _readOwnerLock();
    if (!confirmed || confirmed.ownerId !== _tabId) {
      _diagLogLockAcquire('blocked_lost_race_on_writeback', confirmed);
      return false;
    }
    _diagLogLockAcquire(isFocusOverride ? 'acquired_focus_override' : 'acquired', existing);
    return true;
  }
  // Stops this tab's own local execution/camera/publishing WITHOUT touching
  // the current owner lock (never clears or overwrites another tab's valid
  // lock) and WITHOUT publishing this tab's now-stopped state to the shared
  // snapshot key (which would clobber the real owner's live telemetry).
  // Called only when the heartbeat discovers this tab has been superseded.
  function _selfDemoteSuperseded() {
    var controller = _controller();
    if (controller) { try { controller.stop(); } catch (e) {} }
    _releaseOwnership();
    _notify();
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
        return;
      }
      // This tab believed it owned the run, but the stored lock now names
      // a different owner (or no owner at all) — a real, confirmed failure
      // mode: the initial acquisition race in _tryAcquireLock() can let two
      // tabs both briefly believe they've won before one write finally
      // supersedes the other. Previously this branch did nothing, so the
      // superseded tab kept running — its own controller, RAF, and camera
      // loop — indefinitely, with no way to discover it had lost. Self-
      // demote within one heartbeat interval instead of assuming the lock
      // stays valid forever once acquired.
      _diagLogLockAcquire('superseded_self_demoted', lock);
      _selfDemoteSuperseded();
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
  // TEMPORARY diagnostics (0820_SUBWAY_Post_Launch_Execution_Investigation) —
  // _cameraTick() has five silent early-return gates; any one of them
  // staying blocked forever would explain a persistent "CAMERA FREE" state
  // even though the RAF loop calling it is running fine. Recording exactly
  // which gate last blocked (if any) turns that into evidence instead of a
  // guess. Remove alongside itineraryRunController.js's matching block once
  // the stall is root-caused.
  var _diagCameraTickCount = 0;
  var _diagCameraLastBlockedReason = null;
  var _diagCameraLastTickAt = null;
  function _cameraTick(dtOverride) {
    _diagCameraTickCount++;
    _diagCameraLastTickAt = Date.now();
    if (!_isOwner) { _diagCameraLastBlockedReason = 'not_owner'; return; }
    if (!_followEnabled) { _diagCameraLastBlockedReason = 'follow_disabled'; return; }
    var controller = _controller();
    if (!controller || typeof controller.getPresentationEntity !== 'function') { _diagCameraLastBlockedReason = 'no_controller'; return; }
    var target = controller.getPresentationEntity();
    if (!target || target.lng == null || target.lat == null) { _diagCameraLastBlockedReason = 'no_presentation_entity'; return; }
    var mvr = global.SBE && SBE.MapboxViewportRuntime;
    var map = mvr && typeof mvr.getMap === 'function' ? mvr.getMap() : null;
    if (!map || typeof map.setCenter !== 'function') { _diagCameraLastBlockedReason = 'no_map'; return; }
    _diagCameraLastBlockedReason = null; // this tick genuinely reached setCenter() below
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
    _diagHandleStartCallCount++;
    _diagLastHandleStartAt = Date.now();
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
        _diagFollowTimerFiredAt = Date.now();
        // Guard: only apply if this exact run is still the one executing
        // (not stopped/restarted in the interim).
        if (!_isOwner) { _diagFollowTimerOutcome = 'blocked_not_owner'; return; }
        var current = _controllerSnapshotOrNull();
        if (!current || current.runId !== runIdAtStart) {
          // TEMPORARY diagnostic (0820_SUBWAY_Post_Launch_Execution_Investigation)
          // — a real candidate for a permanently-FREE camera: if this guard
          // trips, _followEnabled is NEVER set true and nothing else ever
          // retries it. Remove alongside this file's other diag blocks.
          _diagFollowTimerOutcome = 'blocked_runid_mismatch';
          _diagFollowTimerRunIdAtStart = runIdAtStart;
          _diagFollowTimerCurrentRunId = current ? current.runId : null;
          return;
        }
        _diagFollowTimerOutcome = 'enabled';
        _followEnabled = true;
        _snapCameraToTargetNow();
        _publishSnapshot(current);
        _notify();
      }, 850);
    }

    _publishSnapshot(controller.getSnapshot());
    _notify();
  }

  // De-duped by commandId — a command can legitimately be observed twice
  // (once via the boot-time pending-command check below, once via a live
  // 'storage' event that still fires shortly after) and must only ever
  // apply once. Same fix as subwayItineraryRideAuthority.js's own
  // _handleCommand — see that file's header for the full race writeup this
  // addresses (window.open() can end up navigating/reloading the CALLING
  // tab, not only a genuinely separate LIVE MAP tab).
  var _lastAppliedCommandId = null;
  function _handleCommand(cmd) {
    var controller = _controller();
    if (!controller || !cmd || !cmd.type || !cmd.commandId) return;
    if (cmd.commandId === _lastAppliedCommandId) return;
    _lastAppliedCommandId = cmd.commandId;
    _diagLastConsumedCommandId = cmd.commandId;
    _diagLastConsumedCommandAt = Date.now();
    _diagLastConsumedCommandType = cmd.type;
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
    _diagStorageEventCount++;
    _diagStorageEventLastAt = Date.now();
    _diagStorageEventLastKey = e.key;
    if (e.key !== STORAGE_COMMAND_KEY || !e.newValue) return;
    var cmd;
    try { cmd = JSON.parse(e.newValue); } catch (err) { return; }
    _handleCommand(cmd);
  }

  // ── Boot-time pending-command check — a real, reproduced race: a
  // launching MUSIC tab now writes STORAGE_COMMAND_KEY THEN opens/focuses
  // LIVE MAP (see wallItineraryRunBridge.ts's handleRun() callers); if that
  // same named window.open() call ends up navigating/reloading the MUSIC
  // tab's OWN browsing context (confirmed reproducible), MUSIC's own JS
  // never runs any code after the write — but the write itself already
  // landed in localStorage before that happened. A 'storage' event alone
  // would never fire for it (that event only ever fires in OTHER tabs, and
  // only for a write that happens AFTER this tab's listener attaches) — so
  // LIVE MAP must also explicitly check the CURRENT stored command value
  // once at load, mirroring _respondToLiveMapRequest()'s own pattern for
  // the same class of race. Only a FRESH command is consumed — never
  // replays a stale command left over from a much earlier session. ──
  var PENDING_COMMAND_MAX_AGE_MS = 30000;
  function _diagLogBootCheck(outcome, cmd, ageMs) {
    _diagBootCheckLog.push({
      at: Date.now(), outcome: outcome,
      commandId: cmd && cmd.commandId || null,
      issuedAt: cmd && cmd.issuedAt || null,
      ageMs: ageMs != null ? ageMs : null,
    });
    if (_diagBootCheckLog.length > MAX_DIAG_LOG) _diagBootCheckLog.shift();
  }
  function _checkPendingCommandOnBoot() {
    try {
      var raw = global.localStorage.getItem(STORAGE_COMMAND_KEY);
      if (!raw) { _diagLogBootCheck('no_raw_value', null, null); return; }
      var cmd = JSON.parse(raw);
      if (!cmd || !cmd.issuedAt) { _diagLogBootCheck('malformed', cmd, null); return; }
      var ageMs = Date.now() - new Date(cmd.issuedAt).getTime();
      if (ageMs < 0 || ageMs > PENDING_COMMAND_MAX_AGE_MS) { _diagLogBootCheck('stale_or_skewed', cmd, ageMs); return; } // stale or clock-skewed — never replay
      _diagLogBootCheck('consumed', cmd, ageMs);
      _handleCommand(cmd);
    } catch (e) {
      _diagLogBootCheck('threw:' + ((e && e.message) || String(e)), null, null);
    }
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
      _diagOnReadyRegistered = true;
      try {
        mvr.onReady(function () {
          _diagOnReadyFiredAt = Date.now();
          _diagOnReadyFiredCount++;
          _liveMapReady = true;
          _respondToLiveMapRequest();
          // Only once the map is genuinely ready — matches the exact
          // sequencing MUSIC's own wait-for-ready gate already relies on
          // (see this fix's header comment above _checkPendingCommandOnBoot).
          _checkPendingCommandOnBoot();
        });
      } catch (e) {}
    } else {
      _diagOnReadyRegistered = false; // mvr or mvr.onReady did not exist at THIS script's own load time
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

  // TEMPORARY (0820_SUBWAY_Post_Launch_Execution_Investigation) — real,
  // read-only proof of camera-follow loop/timer health. Remove alongside
  // this file's other diag blocks and itineraryRunController.js's matching
  // block once the stall is root-caused.
  // TEMPORARY diagnostic (0820_MAPS_Itinerary_Execution_Lifecycle_Ownership) —
  // reads the CURRENT owner lock live, independent of this tab's own history
  // — answers "who owns it right now" even when this tab never attempted
  // acquisition at all (handleStartCallCount:0), which the prior pass's
  // lockAcquireLog could not: that log only records THIS tab's own attempts,
  // and is empty by construction when this tab never tried.
  function _diagCurrentOwnerLockInfo() {
    var lock = _readOwnerLock();
    if (!lock) return { present: false };
    return {
      present: true,
      ownerTabId: lock.ownerId,
      isThisTab: lock.ownerId === _tabId,
      itineraryId: lock.itineraryId,
      runId: lock.runId,
      startedAt: lock.startedAt,
      heartbeatAt: lock.heartbeatAt,
      heartbeatAgeMs: lock.heartbeatAt ? (Date.now() - lock.heartbeatAt) : null,
      isStale: _isLockStale(lock),
    };
  }

  function getDiagnostics() {
    return {
      isOwner: _isOwner,
      currentOwnerLock: _diagCurrentOwnerLockInfo(),
      followEnabled: _followEnabled,
      cameraRafIdActive: _cameraRafId != null,
      cameraTickCount: _diagCameraTickCount,
      cameraLastTickAt: _diagCameraLastTickAt,
      msSinceLastCameraTick: _diagCameraLastTickAt != null ? (Date.now() - _diagCameraLastTickAt) : null,
      cameraLastBlockedReason: _diagCameraLastBlockedReason,
      followEnableTimerPending: _followEnableTimer != null,
      followEnableTimerFiredAt: _diagFollowTimerFiredAt,
      followEnableTimerOutcome: _diagFollowTimerOutcome,
      followEnableTimerRunIdAtStart: _diagFollowTimerRunIdAtStart,
      followEnableTimerCurrentRunId: _diagFollowTimerCurrentRunId,
      liveMapReady: _liveMapReady,
      onReadySetupAt: _diagOnReadySetupAt,
      onReadyRegistered: _diagOnReadyRegistered,
      onReadyFiredAt: _diagOnReadyFiredAt,
      onReadyFiredCount: _diagOnReadyFiredCount,
      bootCheckLog: _diagBootCheckLog.slice(),
      storageEventCount: _diagStorageEventCount,
      storageEventLastAt: _diagStorageEventLastAt,
      storageEventLastKey: _diagStorageEventLastKey,
      tabId: _tabId,
      lockAcquireLog: _diagLockAcquireLog.slice(),
      lastConsumedCommandId: _diagLastConsumedCommandId,
      lastConsumedCommandAt: _diagLastConsumedCommandAt,
      lastConsumedCommandType: _diagLastConsumedCommandType,
      handleStartCallCount: _diagHandleStartCallCount,
      lastHandleStartAt: _diagLastHandleStartAt,
      // Explicit locality label — required distinction (0820 ownership
      // checkpoint): getSnapshot()'s status field is IDENTICAL whether this
      // tab is genuinely executing or merely reading a foreign tab's
      // published state, so nothing downstream can tell them apart without
      // this. 'here' = this tab's own controller is the source of truth.
      // 'elsewhere' = whatever getSnapshot() reports belongs to a different
      // (or no-longer-existing) tab, read back from shared storage.
      runningLocality: _isOwner ? 'here' : 'elsewhere',
    };
  }

  SBE.ItineraryRunAuthority = Object.freeze({
    VERSION: VERSION,
    getDiagnostics: getDiagnostics,
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
