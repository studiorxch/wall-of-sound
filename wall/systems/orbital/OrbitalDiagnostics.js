(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});

  // ── OrbitalDiagnostics — short, diagnostic-only console output ───────────────

  var _PREFIX = '[WOS Orbital]';
  var _verbose = false;

  function log(msg) {
    if (_verbose) console.log(_PREFIX, msg);
  }

  function info(msg) {
    console.log(_PREFIX, msg);
  }

  function warn(msg) {
    console.warn(_PREFIX, msg);
  }

  function error(msg) {
    console.error(_PREFIX, msg);
  }

  function setVerbose(v) {
    _verbose = !!v;
  }

  function dumpState(effectState) {
    console.log(_PREFIX, 'state =', JSON.stringify(effectState, null, 2));
  }

  SBE.OrbitalDiagnostics = Object.freeze({
    log:        log,
    info:       info,
    warn:       warn,
    error:      error,
    setVerbose: setVerbose,
    dumpState:  dumpState
  });

})(window);
