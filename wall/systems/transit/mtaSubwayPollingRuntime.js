// ── MTASubwayPollingRuntime v1.0.0 ────────────────────────────────────────────
// 0818_SUBWAY_Live_Data_Foundation_v1.0.0_BUILD — Data Layer §12
// Status: active | Classification: runtime-authority (scheduler)
//
// Owns SUBWAY's realtime polling cadence, overlap protection, timeout,
// transient-failure handling, and last-known-valid preservation. This is the
// ONLY module that calls mtaSubwayRealtimeAdapter.fetchGroup()/fetchAlerts()
// on a timer and writes successful results into mtaSubwayTransitStore — a
// failed poll never touches the store, which is what preserves its last
// known valid state (the store itself already only mutates on an explicit
// applyRealtimeUpdate() call; this runtime simply never makes that call on
// failure).
//
// CADENCE DEFAULT — read before changing: previous StudioRich work (per the
// 2026-08-18 handoff docs) used approximately 30-60s, offered only as
// historical guidance, not a hard constraint. No MTA-published minimum
// polling interval was found during this build's source verification (the
// endpoints are unauthenticated and carry no documented rate-limit
// guidance). DEFAULT_CADENCE_MS below (30s) is a reasoned choice balancing
// that historical range against being a considerate, unauthenticated
// consumer of a free public endpoint — NOT a documented MTA requirement.
// Treat it as a starting point; SUBWAY_POLL_CADENCE_MS is overridable via
// start(opts).
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  var DEFAULT_CADENCE_MS = 30000;
  var MIN_CADENCE_MS = 20000;
  var DEFAULT_STALE_AFTER_MS = 90000;     // ~3x default cadence
  var DEFAULT_DISABLED_AFTER_MS = 300000; // 10 consecutive-failure windows worth

  function _rt() { return SBE.MTASubwayRealtimeAdapter || null; }
  function _store() { return SBE.MTASubwayTransitStore || null; }

  var _running = false;
  var _inFlight = false;
  var _pollTimer = null;
  var _opts = { groupIds: ['ace'], cadenceMs: DEFAULT_CADENCE_MS, pollAlerts: true, staleAfterMs: DEFAULT_STALE_AFTER_MS, disabledAfterMs: DEFAULT_DISABLED_AFTER_MS };

  var _state = {
    pollCount: 0, successCount: 0, failureCount: 0, overlapSkipCount: 0,
    consecutiveFailures: 0,
    lastPollAt: null, lastSuccessAt: null, lastFailureAt: null, lastFailureReason: null,
  };

  function _isStale() {
    if (!_state.lastSuccessAt) return true;
    return (Date.now() - _state.lastSuccessAt) > (_opts.staleAfterMs || DEFAULT_STALE_AFTER_MS);
  }
  function _isDisabled() {
    if (!_state.lastFailureAt) return false;
    var disabledAfter = _opts.disabledAfterMs || DEFAULT_DISABLED_AFTER_MS;
    return _state.consecutiveFailures >= 3 && (Date.now() - _state.lastSuccessAt > disabledAfter) === true;
  }

  // ── One poll cycle — single in-flight guard, never overlaps itself ─────────
  function _pollOnce() {
    if (_inFlight) { _state.overlapSkipCount++; return Promise.resolve({ ok: false, skipped: true, reason: 'overlap_skipped' }); }
    _inFlight = true;
    _state.pollCount++;
    _state.lastPollAt = Date.now();

    var rt = _rt(), store = _store();
    if (!rt || !store) { _inFlight = false; return Promise.resolve({ ok: false, reason: 'not_configured' }); }

    var groupIds = _opts.groupIds || ['ace'];
    var work = rt.fetchGroups(groupIds);
    if (_opts.pollAlerts) work = work.then(function (groupResult) { return rt.fetchAlerts().then(function (alertResult) { return { groupResult: groupResult, alertResult: alertResult }; }); });
    else work = work.then(function (groupResult) { return { groupResult: groupResult, alertResult: null }; });

    return work.then(function (combined) {
      _inFlight = false;
      var groupResult = combined.groupResult;
      if (!groupResult || !groupResult.ok) {
        _state.failureCount++;
        _state.consecutiveFailures++;
        _state.lastFailureAt = Date.now();
        var firstFail = (groupResult && groupResult.results || []).filter(function (r) { return r && !r.ok; })[0];
        _state.lastFailureReason = (firstFail && firstFail.failureReason) || 'unknown_error';
        // Deliberately does NOT call store.applyRealtimeUpdate() — the
        // store's prior trip/vehicle state is left exactly as it was.
        console.warn('[MTASubwayPollingRuntime] poll failed (' + _state.consecutiveFailures + ' consecutive):', _state.lastFailureReason);
        return { ok: false, failureReason: _state.lastFailureReason, staleState: _isStale() };
      }

      // Success: apply only the rows for the groups actually just fetched.
      var applyResult = store.applyRealtimeUpdate(rt.getTripUpdates(), rt.getVehicles(), groupIds);
      if (combined.alertResult && combined.alertResult.ok) store.applyAlerts(rt.getAlerts());

      _state.successCount++;
      _state.consecutiveFailures = 0;
      _state.lastSuccessAt = Date.now();
      _state.lastFailureReason = null;
      return { ok: true, tripCount: applyResult.tripCount, vehicleCount: applyResult.vehicleCount };
    }).catch(function (err) {
      _inFlight = false;
      _state.failureCount++;
      _state.consecutiveFailures++;
      _state.lastFailureAt = Date.now();
      _state.lastFailureReason = 'unknown_error';
      console.warn('[MTASubwayPollingRuntime] poll threw:', err);
      return { ok: false, failureReason: 'unknown_error' };
    });
  }

  // ── start/stop ───────────────────────────────────────────────────────────
  function start(opts) {
    if (_running) return true;
    _opts = Object.assign({}, _opts, opts || {});
    _opts.cadenceMs = Math.max(MIN_CADENCE_MS, _opts.cadenceMs || DEFAULT_CADENCE_MS);
    _running = true;
    _pollOnce(); // fire immediately, then on cadence
    _pollTimer = global.setInterval(function () { try { _pollOnce(); } catch (e) {} }, _opts.cadenceMs);
    console.log('[MTASubwayPollingRuntime] started — groups', JSON.stringify(_opts.groupIds), 'cadence', _opts.cadenceMs + 'ms');
    return true;
  }
  function stop() {
    _running = false;
    if (_pollTimer) { try { global.clearInterval(_pollTimer); } catch (e) {} _pollTimer = null; }
    return true;
  }
  function isRunning() { return _running; }
  function pollNow() { return _pollOnce(); }

  function getState() {
    return {
      version: VERSION,
      running: _running,
      inFlight: _inFlight,
      groupIds: (_opts.groupIds || []).slice(),
      cadenceMs: _opts.cadenceMs,
      pollCount: _state.pollCount, successCount: _state.successCount, failureCount: _state.failureCount,
      overlapSkipCount: _state.overlapSkipCount, consecutiveFailures: _state.consecutiveFailures,
      lastPollAt: _state.lastPollAt, lastSuccessAt: _state.lastSuccessAt,
      lastFailureAt: _state.lastFailureAt, lastFailureReason: _state.lastFailureReason,
      stale: _isStale(), disabled: _isDisabled(),
    };
  }

  SBE.MTASubwayPollingRuntime = Object.freeze({
    VERSION: VERSION,
    DEFAULT_CADENCE_MS: DEFAULT_CADENCE_MS,
    start: start,
    stop: stop,
    isRunning: isRunning,
    pollNow: pollNow,
    getState: getState,
  });

  console.log('[MTASubwayPollingRuntime] v' + VERSION + ' loaded (manual start — no auto-poll)');
})(window);
