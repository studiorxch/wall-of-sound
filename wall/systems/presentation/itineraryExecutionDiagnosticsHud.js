// ── ItineraryExecutionDiagnosticsHud v1.1.0 ──────────────────────────────────
// 0820_SUBWAY_Post_Launch_Execution_Investigation — TEMPORARY diagnostic
// tool, intended for removal once the reported post-launch stall (itinerary
// enters RUNNING/waiting_to_board but never visibly progresses) is
// root-caused on the machine where it actually reproduces.
//
// Runs directly in the real LIVE MAP tab (never a synthetic test harness) —
// polls the real, non-destructive diagnostics this build added to
// ItineraryRunController, ItineraryRunAuthority, and
// SubwayItineraryRideAuthority once per second, logs the full snapshot to
// console (so it can be copied verbatim), and renders a small on-screen
// panel so the exact failure point is visible without opening devtools.
//
// Deliberately quiet by default: only renders once an itinerary run/ride
// actually exists (DRIVE itineraryId set, or Transit status !== 'idle') —
// never shown for ordinary SUBWAY browsing with no active itinerary.
//
// 0821_SUBWAY_Dismissible_Debug_Overlays — a real [x] in the panel's own
// upper-right corner (never a browser confirm, never affecting any other
// HUD) sets a purely presentational _dismissed flag; _poll() itself is
// completely untouched by it — collection, console logging, and getLog()'s
// history all keep running on the same 1s interval whether the panel is
// visible or not, so reopening it (the [x] click, or
// SBE.ItineraryExecutionDiagnosticsHud.show() from DevTools) always shows
// fully caught-up state, never a gap.
//
// Placement: wall/systems/presentation/itineraryExecutionDiagnosticsHud.js
// Load: AFTER itineraryRunController.js, itineraryRunAuthority.js,
// subwayItineraryRideAuthority.js.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.1.0';
  var POLL_MS = 1000;

  var _root = null;
  var _body = null; // diagnostic text goes here only — keeps the close button from being wiped by re-render
  var _log = [];
  var MAX_LOG = 120; // 2 minutes at 1/s

  // 0821_SUBWAY_Dismissible_Debug_Overlays — visual-only: hides the panel,
  // never touches polling/logging/collection below. _poll() keeps running
  // and _log keeps growing on the exact same interval regardless of this
  // flag, so reopening (or SBE.ItineraryExecutionDiagnosticsHud.show()) any
  // time shows fully caught-up state, never a gap.
  var _dismissed = false;

  function _runController() { return global.SBE && SBE.ItineraryRunController; }
  function _runAuthority() { return global.SBE && SBE.ItineraryRunAuthority; }
  function _rideAuthority() { return global.SBE && SBE.SubwayItineraryRideAuthority; }

  function _ensureRoot() {
    if (_root) return _root;
    _root = global.document.createElement('div');
    _root.id = 'itinerary-execution-diagnostics-hud';
    _root.style.cssText = [
      'position:fixed', 'left:24px', 'top:96px', 'z-index:9999', 'width:340px',
      'max-height:70vh', 'overflow-y:auto',
      'padding:10px 12px', 'background:rgba(10,10,12,0.94)', 'border:1px solid rgba(255,80,80,0.6)',
      'border-radius:8px', 'color:#e0e0e0', 'font:11px/1.5 ui-monospace,monospace',
      'display:none',
    ].join(';');

    var closeBtn = global.document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = '×';
    closeBtn.title = 'Hide diagnostics panel (keeps logging — reopen via SBE.ItineraryExecutionDiagnosticsHud.show())';
    closeBtn.style.cssText = [
      'position:absolute', 'top:4px', 'right:6px', 'width:20px', 'height:20px',
      'background:transparent', 'border:none', 'color:#e0e0e0', 'font:14px/1 ui-monospace,monospace',
      'cursor:pointer', 'padding:0',
    ].join(';');
    closeBtn.addEventListener('click', function (e) { e.stopPropagation(); hide(); });
    _root.appendChild(closeBtn);

    _body = global.document.createElement('div');
    _body.style.cssText = 'white-space:pre-wrap;padding-right:14px;';
    _root.appendChild(_body);

    global.document.body.appendChild(_root);
    return _root;
  }

  // Visual-only — see _dismissed's own comment above. Never called by
  // _poll()/_collect(); only by the close button and this same public API.
  function hide() { _dismissed = true; _render(_collect()); }
  function show() { _dismissed = false; _render(_collect()); }

  function _fmtMs(ms) { return ms == null ? '—' : (ms < 2000 ? ms + 'ms' : (ms / 1000).toFixed(1) + 's'); }

  function _readFreshPendingCommand(key) {
    // Deliberately blunt: same 30s freshness window the boot-check itself
    // uses. This exists so the panel doesn't hide itself during the EXACT
    // failure it's meant to reveal — a command sitting unconsumed with
    // status still 'idle' is the reported stall itself, not a quiet moment.
    try {
      var raw = global.localStorage.getItem(key);
      if (!raw) return null;
      var cmd = JSON.parse(raw);
      if (!cmd || !cmd.issuedAt) return null;
      var ageMs = Date.now() - new Date(cmd.issuedAt).getTime();
      return (ageMs >= 0 && ageMs < 30000) ? cmd : null;
    } catch (e) { return null; }
  }
  function _pendingCommandLooksFresh(key) { return !!_readFreshPendingCommand(key); }

  // 0820_MAPS_Itinerary_Execution_Lifecycle_Repair — classification,
  // corrected this pass after a real capture exposed a bug in it: isOwner
  // ===false does NOT by itself mean "this tab lost a lock race" — that
  // requires this tab to have actually CALLED _handleStart (i.e.
  // handleStartCallCount>0). A real capture showed isOwner:false with
  // handleStartCallCount:0 and lockAcquireLog empty — this tab never
  // attempted acquisition at all, because it never received the command in
  // the first place. That is a DELIVERY gap (ownership/addressing), a
  // different bug from a genuine lost race, and the two must not collapse
  // into the same label. currentOwnerLock (read live, independent of this
  // tab's own history) answers "who owns it right now" for both cases.
  function _classifyDrive(ad, cd) {
    if (!ad || !cd) return null;
    var pending = _readFreshPendingCommand('wos:itineraryRun:command');
    if (pending && pending.commandId && pending.commandId !== ad.lastConsumedCommandId) {
      return 'COMMAND NOT CONSUMED';
    }
    if (ad.isOwner === false && ad.handleStartCallCount === 0) {
      var lock = ad.currentOwnerLock;
      var who = lock && lock.present ? ('owner=' + lock.ownerTabId + (lock.isStale ? ' (STALE)' : ' heartbeatAge=' + Math.round(lock.heartbeatAgeMs / 1000) + 's')) : 'no lock present';
      return 'RUNNING ELSEWHERE — this tab never received/attempted this command (handleStart calls=0). ' + who;
    }
    if (ad.isOwner === false && ad.handleStartCallCount > 0) {
      return 'COMMAND CONSUMED / EXECUTION NOT STARTED (this tab tried and lost the lock race — see lockAcquireLog)';
    }
    if (ad.handleStartCallCount > 0 && cd.startCallCount === 0) {
      return 'COMMAND CONSUMED / EXECUTION NOT STARTED (handleStart ran, controller.start did not)';
    }
    if (cd.invariantViolations && cd.invariantViolations.length) {
      return 'EXECUTION STARTED / RAF DIED — ' + cd.invariantViolations.join('; ');
    }
    return null; // no known-bad classification — either healthy or genuinely idle
  }

  function _collect() {
    var rc = _runController(), ra = _runAuthority(), ride = _rideAuthority();
    var runSnap = ra ? ra.getSnapshot() : null;
    var rideSnap = ride ? ride.getSnapshot() : null;
    var drivePendingFresh = _pendingCommandLooksFresh('wos:itineraryRun:command');
    var transitPendingFresh = _pendingCommandLooksFresh(ride && ride.STORAGE_COMMAND_KEY || 'wos:subwayRide:command');

    var driveActive = !!(runSnap && runSnap.itineraryId && (runSnap.status === 'running' || runSnap.status === 'paused' || runSnap.status === 'starting'))
      || (drivePendingFresh && !!ra); // command written but not yet (or never) consumed — the stall itself
    var transitActive = !!(rideSnap && rideSnap.status !== 'idle')
      || (transitPendingFresh && !!ride);

    return {
      at: Date.now(),
      visibility: { hidden: global.document.hidden, visibilityState: global.document.visibilityState, hasFocus: global.document.hasFocus() },
      driveActive: driveActive,
      transitActive: transitActive,
      drive: driveActive ? {
        status: runSnap.status,
        elapsedSeconds: runSnap.elapsedSeconds,
        distanceTraveledMeters: Math.round(runSnap.distanceTraveledMeters || 0),
        followHeroEnabled: runSnap.followHeroEnabled,
        controllerDiag: rc ? rc.getDiagnostics() : null,
        authorityDiag: ra ? ra.getDiagnostics() : null,
      } : null,
      transit: transitActive ? {
        status: rideSnap.status,
        currentStopId: rideSnap.currentStopId,
        nextStopId: rideSnap.nextStopId,
        selectedLogicalTrainId: rideSnap.selectedLogicalTrainId,
        rideDiag: ride ? ride.getDiagnostics() : null,
      } : null,
    };
  }

  function _render(snapshot) {
    var root = _ensureRoot();
    if (_dismissed || (!snapshot.driveActive && !snapshot.transitActive)) { root.style.display = 'none'; return; }
    root.style.display = 'block';

    var lines = [];
    lines.push('ITINERARY EXECUTION DIAGNOSTICS (temporary)');
    lines.push('visible=' + !snapshot.visibility.hidden + ' state=' + snapshot.visibility.visibilityState + ' focus=' + snapshot.visibility.hasFocus);
    lines.push('');

    if (snapshot.drive) {
      var d = snapshot.drive, cd = d.controllerDiag, ad = d.authorityDiag;
      var classification = _classifyDrive(ad, cd);
      lines.push('── DRIVE ──');
      if (classification) {
        lines.push('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
        lines.push('!! CLASSIFICATION: ' + classification);
        lines.push('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
      }
      lines.push('status=' + d.status + '  elapsed=' + d.elapsedSeconds.toFixed(1) + 's  dist=' + d.distanceTraveledMeters + 'm  follow=' + d.followHeroEnabled);
      if (ad) {
        lines.push('RUNNING ' + (ad.runningLocality === 'here' ? 'HERE (this tab is genuinely executing)' : 'ELSEWHERE (this tab is reading foreign/stored state, not executing it)'));
      }
      if (cd && cd.invariantViolations && cd.invariantViolations.length) {
        lines.push('!! INVARIANT VIOLATED:');
        cd.invariantViolations.forEach(function (v) { lines.push('   ' + v); });
      }
      if (ad) {
        lines.push('tabId=' + ad.tabId + '  isOwner=' + ad.isOwner);
        var lock = ad.currentOwnerLock;
        if (!lock || !lock.present) {
          lines.push('currentOwnerLock: (none — no lock currently held by any tab)');
        } else {
          lines.push('currentOwnerLock: owner=' + lock.ownerTabId + (lock.isThisTab ? ' (= this tab)' : ' (DIFFERENT tab)') + ' stale=' + lock.isStale + ' heartbeatAge=' + _fmtMs(lock.heartbeatAgeMs));
          lines.push('  itineraryId=' + lock.itineraryId + ' runId=' + (lock.runId || '—') + ' startedAt=' + lock.startedAt);
        }
        lines.push('lastConsumedCmd=' + (ad.lastConsumedCommandId || '—') + ' (' + (ad.lastConsumedCommandType || '—') + ') ' + _fmtMs(ad.lastConsumedCommandAt != null ? Date.now() - ad.lastConsumedCommandAt : null) + ' ago');
        lines.push('handleStart: calls=' + ad.handleStartCallCount + ' last=' + _fmtMs(ad.lastHandleStartAt != null ? Date.now() - ad.lastHandleStartAt : null) + ' ago');
        if (ad.lockAcquireLog && ad.lockAcquireLog.length) {
          lines.push('lock acquire log (latest last):');
          ad.lockAcquireLog.slice(-5).forEach(function (e) {
            lines.push('  [' + _fmtMs(Date.now() - e.at) + ' ago] ' + e.outcome + (e.existingOwnerId ? (' existingOwner=' + e.existingOwnerId + ' heartbeatAge=' + _fmtMs(e.existingHeartbeatAgeMs)) : ''));
          });
        } else {
          lines.push('lock acquire log: (never attempted)');
        }
      }
      if (cd) {
        lines.push('controller.start: calls=' + cd.startCallCount + ' last=' + _fmtMs(cd.msSinceStart) + ' ago');
        lines.push('RAF loop: active=' + cd.rafIdActive + ' scheduled=' + cd.rafScheduleCount + 'x entries=' + cd.frameCount + ' exits=' + cd.frameExitCount + ' lastFrame=' + _fmtMs(cd.msSinceLastFrame) + ' ago');
        lines.push('cancelAnimationFrame: calls=' + cd.stopRafCallCount + (cd.lastStopRafAt ? (' last=' + _fmtMs(Date.now() - cd.lastStopRafAt) + ' ago') : ''));
        if (cd.stopRafCallCount > 0 && cd.lastStopRafCaller) lines.push('  caller: ' + cd.lastStopRafCaller.split(' | ')[0]);
        if (cd.lastError) lines.push('!! FRAME EXCEPTION @frame ' + cd.lastError.frameCount + ': ' + cd.lastError.message);
      }
      if (ad) {
        lines.push('Camera loop: active=' + ad.cameraRafIdActive + ' ticks=' + ad.cameraTickCount + ' lastTick=' + _fmtMs(ad.msSinceLastCameraTick) + ' ago');
        lines.push('Camera last blocked by: ' + (ad.cameraLastBlockedReason || '(not blocked — reaching setCenter)'));
        lines.push('Follow-enable timer: pending=' + ad.followEnableTimerPending + ' outcome=' + (ad.followEnableTimerOutcome || '(not fired yet)'));
        if (ad.followEnableTimerOutcome === 'blocked_runid_mismatch') {
          lines.push('  runIdAtStart=' + ad.followEnableTimerRunIdAtStart + ' currentRunId=' + ad.followEnableTimerCurrentRunId);
        }
        lines.push('');
        lines.push('BOOT DELIVERY: liveMapReady=' + ad.liveMapReady + ' onReady.registered=' + ad.onReadyRegistered + ' onReady.fired=' + ad.onReadyFiredCount + 'x' + (ad.onReadyFiredAt ? (' @' + _fmtMs(Date.now() - ad.onReadyFiredAt) + ' ago') : ''));
        lines.push('storage(command) events seen: ' + ad.storageEventCount + (ad.storageEventLastAt ? (' last=' + _fmtMs(Date.now() - ad.storageEventLastAt) + ' ago key=' + ad.storageEventLastKey) : ''));
        if (ad.bootCheckLog && ad.bootCheckLog.length) {
          lines.push('bootCheck log (latest last):');
          ad.bootCheckLog.slice(-5).forEach(function (e) {
            lines.push('  [' + _fmtMs(Date.now() - e.at) + ' ago] ' + e.outcome + (e.commandId ? (' cmd=' + e.commandId + ' age=' + e.ageMs + 'ms') : ''));
          });
        } else {
          lines.push('bootCheck log: (never ran)');
        }
      }
      lines.push('');
    }

    if (snapshot.transit) {
      var t = snapshot.transit, rd = t.rideDiag;
      lines.push('── TRANSIT ──');
      lines.push('status=' + t.status + '  current=' + (t.currentStopId || '—') + '  next=' + (t.nextStopId || '—') + '  train=' + (t.selectedLogicalTrainId || '—'));
      if (rd) {
        lines.push('Tick timer: active=' + rd.tickTimerActive + ' ticks=' + rd.tickCount + ' lastTick=' + _fmtMs(rd.msSinceLastTick) + ' ago');
        lines.push('Last blocked by: ' + (rd.lastBlockedReason || '(not blocked)'));
        if (rd.lastError) lines.push('!! TICK EXCEPTION @tick ' + rd.lastError.tickCount + ': ' + rd.lastError.message);
        lines.push('storage(command) events seen: ' + rd.storageEventCount + (rd.storageEventLastAt ? (' last=' + _fmtMs(Date.now() - rd.storageEventLastAt) + ' ago key=' + rd.storageEventLastKey) : ''));
        if (rd.bootCheckLog && rd.bootCheckLog.length) {
          lines.push('bootCheck log (latest last):');
          rd.bootCheckLog.slice(-5).forEach(function (e) {
            lines.push('  [' + _fmtMs(Date.now() - e.at) + ' ago] ' + e.outcome + (e.commandId ? (' cmd=' + e.commandId + ' age=' + e.ageMs + 'ms') : ''));
          });
        } else {
          lines.push('bootCheck log: (never ran)');
        }
      }
    }

    _body.textContent = lines.join('\n'); // never root.textContent — that would also wipe the close button
  }

  function _poll() {
    var snapshot = _collect();
    if (snapshot.driveActive || snapshot.transitActive) {
      _log.push(snapshot);
      if (_log.length > MAX_LOG) _log.shift();
      console.log('[ItineraryExecutionDiagnostics]', JSON.stringify(snapshot));
    }
    _render(snapshot);
  }

  global.setInterval(_poll, POLL_MS);
  _poll();

  SBE.ItineraryExecutionDiagnosticsHud = Object.freeze({
    VERSION: VERSION,
    // Full recorded history since page load — copy this out with
    // JSON.stringify(SBE.ItineraryExecutionDiagnosticsHud.getLog()) for a
    // complete second-by-second record of a failed run.
    getLog: function () { return _log.slice(); },
    getLatest: function () { return _log.length ? _log[_log.length - 1] : null; },
    pollNow: _poll,
    // 0821_SUBWAY_Dismissible_Debug_Overlays — visual-only show/hide. The
    // panel's own [x] calls hide(); polling/logging/getLog() are completely
    // unaffected by either — reopen any time to see fully caught-up state.
    hide: hide,
    show: show,
    isHidden: function () { return _dismissed; },
  });

  console.log('[ItineraryExecutionDiagnosticsHud] v' + VERSION + ' loaded (TEMPORARY — remove once the post-launch stall is root-caused)');
})(window);
