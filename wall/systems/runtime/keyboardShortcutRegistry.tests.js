// ── KeyboardShortcutRegistry Tests v1.0.0 ─────────────────────────────────────
// 0805B_MAPS_Live_Map_Presentation_Surface_and_Shortcut_Registry
// Status: active | Classification: test-harness (dependency-free)
//
// Same rationale/convention as itineraryRunAuthority.tests.js — no test
// runner exists under wall/, so this mirrors the `_wos.debug.*`
// console-diagnostic pattern. Every test registers under a unique, test-only
// id prefix and unregisters itself afterward (try/finally), so running this
// harness never leaves stray shortcuts behind that could shadow/conflict with
// the real production shortcuts (itinerary F/L/0/Esc, Tab, ?) registered by
// itineraryRunAuthority.js/main.js at their own load time.
//
// Run via: _wos.debug.keyboardShortcutRegistry.runTests()
//
// Placement: wall/systems/runtime/keyboardShortcutRegistry.tests.js
// Load: AFTER keyboardShortcutRegistry.js. Not required for production operation.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  function _assert(name, cond, details) {
    return { name: name, pass: !!cond, details: details === undefined ? null : details };
  }

  function _fakeKeyEvent(key, repeat) {
    return { key: key, repeat: !!repeat, preventDefault: function () {} };
  }

  function run() {
    var registry = SBE.KeyboardShortcutRegistry;
    var results = [];

    if (!registry) {
      results.push(_assert('SBE.KeyboardShortcutRegistry is loaded', false));
      var failedEarly = { ok: false, total: 1, failed: 1, results: results };
      console.log('[KeyboardShortcutRegistryTests] FAIL — registry not loaded');
      return failedEarly;
    }

    // ── register()/unregister()/list() basics ───────────────────────────────
    (function () {
      var calls = [];
      registry.register({
        id: 'test-basic-a', keys: ['§'], label: 'Test Basic A',
        group: 'Debug', context: 'debug', userFacing: true,
        handler: function () { calls.push('a'); },
      });
      try {
        results.push(_assert('a registered user-facing shortcut appears in list()',
          registry.list().some(function (s) { return s.id === 'test-basic-a'; })));

        var dup = registry.register({
          id: 'test-basic-a', keys: ['¶'], label: 'Duplicate id', group: 'Debug', context: 'debug',
          handler: function () {},
        });
        results.push(_assert('register() rejects a duplicate id', dup === false));

        var conflict = registry.register({
          id: 'test-basic-conflict', keys: ['§'], label: 'Key conflict', group: 'Debug', context: 'debug',
          handler: function () {},
        });
        results.push(_assert('register() rejects a duplicate active key+context (no silent overwrite)', conflict === false));

        // Different context — same key must NOT be flagged a conflict (this
        // is exactly how the real close-keyboard-help (global) and
        // itinerary-free-camera-esc (itinerary) both legitimately use
        // "Escape" without register() rejecting either one).
        var otherContext = registry.register({
          id: 'test-basic-other-context', keys: ['§'], label: 'Same key, different context', group: 'Debug', context: 'itinerary',
          handler: function () {},
        });
        results.push(_assert('the same key in a DIFFERENT context is not treated as a conflict', otherContext === true));
        registry.unregister('test-basic-other-context');

        var unregResult = registry.unregister('test-basic-a');
        results.push(_assert('unregister() removes a previously-registered shortcut', unregResult === true));
        results.push(_assert('an unregistered shortcut no longer appears in list()',
          !registry.list().some(function (s) { return s.id === 'test-basic-a'; })));
      } finally {
        registry.unregister('test-basic-a');
        registry.unregister('test-basic-conflict');
        registry.unregister('test-basic-other-context');
      }
    })();

    // ── context filtering / userFacing / enabled() filtering ────────────────
    (function () {
      var itinEnabled = true;
      registry.register({
        id: 'test-ctx-itinerary', keys: ['µ'], label: 'Itinerary-context test', group: 'Camera', context: 'itinerary',
        userFacing: true, enabled: function () { return itinEnabled; }, handler: function () {},
      });
      registry.register({
        id: 'test-ctx-debug-hidden', keys: ['ª'], label: 'Debug-only test', group: 'Debug', context: 'debug',
        userFacing: false, handler: function () {},
      });
      try {
        results.push(_assert('list("itinerary") returns only itinerary-context entries',
          registry.list('itinerary').every(function (s) { return s.context === 'itinerary'; }) &&
          registry.list('itinerary').some(function (s) { return s.id === 'test-ctx-itinerary'; })));

        results.push(_assert('list() never includes a userFacing:false entry (debug-only shortcuts stay out of the help popup)',
          !registry.list().some(function (s) { return s.id === 'test-ctx-debug-hidden'; })));

        itinEnabled = false;
        results.push(_assert('list() excludes an entry whose enabled() currently returns false',
          !registry.list('itinerary').some(function (s) { return s.id === 'test-ctx-itinerary'; })));
        itinEnabled = true;
        results.push(_assert('the same entry reappears once enabled() returns true again',
          registry.list('itinerary').some(function (s) { return s.id === 'test-ctx-itinerary'; })));
      } finally {
        registry.unregister('test-ctx-itinerary');
        registry.unregister('test-ctx-debug-hidden');
      }
    })();

    // ── handleKeydown dispatch + guards ──────────────────────────────────────
    (function () {
      var fired = 0;
      registry.register({
        id: 'test-dispatch-x', keys: ['x'], label: 'Dispatch test', group: 'Debug', context: 'debug',
        handler: function () { fired++; },
      });
      try {
        registry.handleKeydown(_fakeKeyEvent('x', false));
        results.push(_assert('handleKeydown() dispatches to a matching, enabled shortcut', fired === 1));

        registry.handleKeydown(_fakeKeyEvent('x', true)); // repeat — must be ignored
        results.push(_assert('handleKeydown() ignores a repeated ("held") keydown', fired === 1));

        registry.handleKeydown(null);
        results.push(_assert('handleKeydown() tolerates a null/undefined event without throwing', fired === 1));
      } finally {
        registry.unregister('test-dispatch-x');
      }
    })();

    // ── typing-target guard ──────────────────────────────────────────────────
    (function () {
      if (!global.document || typeof global.document.createElement !== 'function') return;
      var fired = 0;
      registry.register({
        id: 'test-typing-guard-y', keys: ['y'], label: 'Typing guard test', group: 'Debug', context: 'debug',
        handler: function () { fired++; },
      });
      var input = global.document.createElement('input');
      global.document.body.appendChild(input);
      input.focus();
      try {
        registry.handleKeydown(_fakeKeyEvent('y', false));
        results.push(_assert('handleKeydown() is ignored while a real typing target (INPUT) is focused', fired === 0));
      } finally {
        input.blur();
        global.document.body.removeChild(input);
        registry.unregister('test-typing-guard-y');
      }
    })();

    // ── isModal precedence (Esc-closes-popup-before-camera-release shape) ──
    // Deliberately uses synthetic, non-colliding keys/ids (NOT 'Escape' or
    // any real production id) — this codebase's REAL 'close-keyboard-help'
    // (global, Escape, isModal) and 'itinerary-free-camera-esc' (itinerary,
    // Escape) already legitimately occupy that exact key+context combo; an
    // earlier version of this test reused 'Escape' directly and had both of
    // its own registrations silently rejected by the registry's own (correct)
    // duplicate-key-conflict guard, producing false failures. isModal gating
    // is global (any key triggers modalActive, not just the modal's own
    // key), so testing it with synthetic keys exercises the identical logic
    // path without touching real registrations at all.
    (function () {
      var modalOpen = true;
      var modalClosed = 0;
      var otherFired = 0;
      registry.register({
        id: 'test-modal-close', keys: ['¿'], label: 'Modal close', group: 'Interface', context: 'debug',
        userFacing: false, isModal: true,
        enabled: function () { return modalOpen; },
        handler: function () { modalClosed++; modalOpen = false; },
      });
      registry.register({
        id: 'test-modal-other', keys: ['¡'], label: 'Other action', group: 'Debug', context: 'debug',
        handler: function () { otherFired++; },
      });
      try {
        registry.handleKeydown(_fakeKeyEvent('¡', false));
        results.push(_assert('while an isModal shortcut is enabled, a DIFFERENT non-modal shortcut is skipped entirely for its own keypress',
          otherFired === 0));

        registry.handleKeydown(_fakeKeyEvent('¿', false));
        results.push(_assert('the isModal shortcut itself still fires normally while active', modalClosed === 1));

        // Modal now closed (enabled() returns false) — the other shortcut's
        // own key should now reach its handler normally.
        registry.handleKeydown(_fakeKeyEvent('¡', false));
        results.push(_assert('once the modal closes, the other shortcut dispatches normally again', otherFired === 1));
      } finally {
        registry.unregister('test-modal-close');
        registry.unregister('test-modal-other');
      }
    })();

    // ── Tab dual-behavior (spec §6) ──────────────────────────────────────────
    // Uses respectsInteractiveFocus (a generic opt-in flag) rather than the
    // real 'tab-toggle-presentation' id/key — that real shortcut is already
    // registered by main.js at page load with the literal "Tab" key; even
    // with a different id/context, dispatching a real "Tab" keydown here
    // would hit the REAL entry first (registration order — it was registered
    // first, at page load) and return before ever reaching this test's
    // handler, since handleKeydown() is first-match-wins across ALL
    // registered shortcuts regardless of context when no context filter is
    // passed. An earlier version of this test used the literal "Tab" key and
    // produced false failures for exactly this reason. A synthetic key
    // exercises the identical respectsInteractiveFocus gating logic in
    // handleKeydown() without that collision.
    (function () {
      if (!global.document || typeof global.document.createElement !== 'function') return;
      var fired = 0;
      registry.register({
        id: 'test-tab-dual-behavior', keys: ['¤'], label: 'Test Tab-like toggle', group: 'Interface', context: 'debug',
        respectsInteractiveFocus: true,
        handler: function () { fired++; },
      });
      try {
        // Map/body focus (nothing interactive focused) — should fire.
        if (global.document.activeElement && typeof global.document.activeElement.blur === 'function') {
          global.document.activeElement.blur();
        }
        registry.handleKeydown(_fakeKeyEvent('¤', false));
        results.push(_assert('a respectsInteractiveFocus shortcut fires when focus is on the map/body (not an interactive control)', fired === 1));

        var btn = global.document.createElement('button');
        global.document.body.appendChild(btn);
        btn.focus();
        try {
          registry.handleKeydown(_fakeKeyEvent('¤', false));
          results.push(_assert('a respectsInteractiveFocus shortcut does NOT fire while a real interactive control (BUTTON) is focused — normal focus nav proceeds instead',
            fired === 1));
        } finally {
          btn.blur();
          global.document.body.removeChild(btn);
        }
      } finally {
        registry.unregister('test-tab-dual-behavior');
      }
    })();

    var failed = results.filter(function (r) { return !r.pass; });
    var summary = { ok: failed.length === 0, total: results.length, failed: failed.length, results: results };

    console.log('[KeyboardShortcutRegistryTests] ' + (summary.ok ? 'PASS' : 'FAIL') +
      ' — ' + (results.length - failed.length) + '/' + results.length + ' assertions passed');
    if (failed.length) console.warn('[KeyboardShortcutRegistryTests] failures:', failed);

    return summary;
  }

  SBE.KeyboardShortcutRegistryTests = { run: run };

  global._wos = global._wos || {};
  global._wos.debug = global._wos.debug || {};
  global._wos.debug.keyboardShortcutRegistry = { runTests: run };

})(window);
