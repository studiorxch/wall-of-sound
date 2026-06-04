// ── WOSBootDebug v1.0.0 ───────────────────────────────────────────────────────
// Binds _wos.debug.boot with boot audit tools.
//
// Commands:
//   _wos.debug.boot.audit()   — full boot stage timing report
//   _wos.debug.boot.stages()  — print stage table only
//   _wos.debug.boot.deferred()— print deferred system queue status
//
// Placement: wall/systems/boot/wosBootDebug.js
// Load: AFTER main.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  global._wos       = global._wos       || {};
  global._wos.debug = global._wos.debug || {};

  var VERSION = '1.0.0';

  function _bs() { return global.SBE && global.SBE.WOSBootSequencer; }

  function _pad(s, w) {
    s = String(s);
    while (s.length < w) s += ' ';
    return s;
  }

  function _relMs(stagesObj, stageName, refName) {
    var s = stagesObj[stageName];
    var r = stagesObj[refName || 'script_start'];
    if (!s) return '—';
    if (!r) return '+?';
    return '+' + Math.round(s.t - r.t) + 'ms';
  }

  // ── stages() ──────────────────────────────────────────────────────────────────

  var STAGE_ORDER = [
    'script_start',
    'dom_ready',
    'map_container_ready',
    'map_style_loaded',
    'first_visible_frame',
    'map_tiles_loaded',
    'geometry_loaded',
    'overlays_ready',
  ];

  function stages() {
    var bs = _bs();
    if (!bs) { console.warn('[WOSBootDebug] WOSBootSequencer not loaded'); return; }
    var st = bs.getStages();

    console.group('[WOSBootDebug] stages()');
    console.log(_pad('STAGE', 24) + _pad('TIME (ms)', 14) + 'FROM START');
    console.log('─'.repeat(55));

    for (var i = 0; i < STAGE_ORDER.length; i++) {
      var name = STAGE_ORDER[i];
      var s    = st[name];
      var tick = s ? Math.round(s.t) + 'ms' : '—';
      var rel  = s ? _relMs(st, name) : '—';
      var mark = s ? '✓' : '·';
      console.log(mark + ' ' + _pad(name, 23) + _pad(tick, 14) + rel);
    }

    // Any custom stages not in STAGE_ORDER
    for (var k in st) {
      if (STAGE_ORDER.indexOf(k) < 0) {
        console.log('• ' + _pad(k, 23) + _pad(Math.round(st[k].t) + 'ms', 14) + _relMs(st, k));
      }
    }
    console.groupEnd();
    return st;
  }

  // ── deferred() ────────────────────────────────────────────────────────────────

  function deferred() {
    var bs = _bs();
    if (!bs) { console.warn('[WOSBootDebug] WOSBootSequencer not loaded'); return; }
    var state = bs.getState();

    console.group('[WOSBootDebug] deferred queue — ' + state.deferredCount + ' entries');
    console.log('pending:', state.pendingCount, ' fired:', state.firedCount, ' errors:', state.errorCount);
    console.groupEnd();
    return state;
  }

  // ── audit() ───────────────────────────────────────────────────────────────────

  function audit() {
    var bs = _bs();

    console.group('[WOSBootDebug] audit()');

    console.log('── Boot Sequencer ─────────────────────────────────');
    console.log('WOSBootSequencer :', !!bs, bs ? 'v' + bs.VERSION : '');

    if (bs) {
      var st    = bs.getStages();
      var state = bs.getState();

      console.log('');
      console.log('── Stage Timing ───────────────────────────────────');
      console.log(_pad('STAGE', 24) + _pad('T (ms)', 12) + 'Δ FROM START');
      console.log('─'.repeat(55));
      for (var i = 0; i < STAGE_ORDER.length; i++) {
        var name = STAGE_ORDER[i];
        var s    = st[name];
        var tick = s ? Math.round(s.t) + 'ms' : '—';
        var rel  = s ? _relMs(st, name) : '—';
        var mark = s ? '✓' : '·';
        console.log(mark + ' ' + _pad(name, 23) + _pad(tick, 12) + rel);
      }

      // Key durations
      if (st.script_start && st.first_visible_frame) {
        var revealMs = Math.round(st.first_visible_frame.t - st.script_start.t);
        console.log('');
        console.log('── Key Durations ──────────────────────────────────');
        console.log('  script→reveal          :', revealMs + 'ms',
          revealMs <= 2000 ? '✓ GOOD' : revealMs <= 4000 ? '⚠ SLOW' : '✗ TOO SLOW');
        if (st.map_tiles_loaded) {
          var tilesMs = Math.round(st.map_tiles_loaded.t - st.script_start.t);
          var postRevealMs = Math.round(st.map_tiles_loaded.t - st.first_visible_frame.t);
          console.log('  script→tiles           :', tilesMs + 'ms');
          console.log('  reveal→tiles (post)    :', postRevealMs + 'ms');
        }
        if (st.geometry_loaded) {
          console.log('  reveal→geometry        :',
            Math.round(st.geometry_loaded.t - st.first_visible_frame.t) + 'ms post-reveal');
        }
      }

      console.log('');
      console.log('── Deferred Queue ─────────────────────────────────');
      console.log('  total:', state.deferredCount, ' pending:', state.pendingCount,
        ' fired:', state.firedCount, ' errors:', state.errorCount);
    }

    console.log('');
    console.log('── performance.mark entries ───────────────────────');
    try {
      var marks = performance.getEntriesByType('mark');
      var wosMark = marks.filter(function (m) { return m.name.indexOf('wos:') === 0; });
      if (wosMark.length) {
        for (var mi = 0; mi < wosMark.length; mi++) {
          console.log(' ', wosMark[mi].name, '—', Math.round(wosMark[mi].startTime) + 'ms');
        }
      } else {
        console.log('  (no wos: performance marks found)');
      }
    } catch (e) {
      console.log('  (performance.getEntriesByType not available)');
    }

    console.log('');
    console.log('── Usage ──────────────────────────────────────────');
    console.log('  stages()    — stage timing table');
    console.log('  deferred()  — deferred queue status');
    console.log('  audit()     — this report');

    console.groupEnd();
  }

  // ── Bind ──────────────────────────────────────────────────────────────────────

  function _bind() {
    global._wos       = global._wos       || {};
    global._wos.debug = global._wos.debug || {};
    global._wos.debug.boot = {
      audit:    audit,
      stages:   stages,
      deferred: deferred,
    };
    console.log('[WOSBootDebug] v' + VERSION + ' ready — _wos.debug.boot bound');
    console.log('  Commands: .audit() · .stages() · .deferred()');
  }

  _bind();

  var _attempts = 0;
  var _timer = global.setInterval(function () {
    _attempts++;
    if (!global._wos || !global._wos.debug || !global._wos.debug.boot) {
      _bind();
    }
    if (_attempts >= 20) global.clearInterval(_timer);
  }, 250);

})(window);
