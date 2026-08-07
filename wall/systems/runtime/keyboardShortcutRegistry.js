// ── KeyboardShortcutRegistry v1.0.0 ───────────────────────────────────────────
// 0805B_MAPS_Live_Map_Presentation_Surface_and_Shortcut_Registry
// Status: active | Classification: runtime / keyboard-shortcut-registry
//
// The canonical dispatcher for canonical LIVE MAP's PRESENTATION/RUNTIME
// keyboard shortcuts (Tab, ?, F, L, 0, Esc) — NOT a claim to own every global
// keyboard listener in this codebase. main.js's own GlyphLab/canvas-tool
// keydown handler (bindGlobalKeyboardShortcuts(), see main.js's own header)
// continues to run as a completely separate, unmigrated listener; so does
// wosSnapshotRuntime.js's debug screenshot capture (S/Shift+S) — deliberately
// NOT migrated here, since main.js already binds plain "S" live for a
// GlyphLab tool shortcut, and moving screenshot capture into this registry
// under the same key would preserve/worsen that collision. This registry's
// scope is intentionally narrow: presentation/runtime shortcuts only.
//
// One registry is the single source of truth for BOTH dispatch (handleKeydown
// is the one keydown handler LIVE MAP's own presentation shortcuts route
// through) and documentation (the keyboard-help popup renders directly from
// list(), never a hard-coded parallel description).
//
// Shortcut definition shape:
//   { id, keys: string[], label, description?, group, context, userFacing,
//     isModal?, respectsInteractiveFocus?, enabled(): boolean, handler(event) }
// - keys: matched case-insensitively against event.key (plus event.code for
//   digit/symbol keys where event.key can vary — e.g. "0").
// - context: which surface this applies to ("itinerary" | "global" |
//   "debug" | "legacy") — list(context) filters to it.
// - userFacing: false entries never appear in list()'s help-popup output.
// - enabled(): re-checked on every keydown, not just at register() time — a
//   shortcut can be temporarily inert (e.g. itinerary shortcuts only apply
//   while this tab owns the run) without unregistering/re-registering it.
// - respectsInteractiveFocus: true opts a shortcut into the Tab dual-behavior
//   rule (spec §6) — skipped (letting native focus-nav proceed) whenever
//   focus is on a genuinely interactive non-text control (button/link/
//   [tabindex]). Tab is the only production shortcut that sets this; it is a
//   generic opt-in flag, not a hard-coded id check, so it's independently
//   testable without colliding with the real Tab registration's id.
//
// Guards (typing-target, event.repeat) live ONCE in handleKeydown, not
// per-shortcut. Duplicate active (key+context) registrations are rejected
// with a console.warn, never silently overwritten.
//
// isModal: true marks a shortcut (e.g. the keyboard-help popup's own
// Escape-to-close) that, while its own enabled() is true, claims the
// keyboard EXCLUSIVELY for that keydown — every non-isModal shortcut is
// skipped for that one keypress regardless of registration order. This is
// the precedence mechanism for "Esc closes the popup first, without also
// releasing camera automation in the same press" (spec §9) without any
// direct coupling between the popup and whatever else is listening for Esc.
//
// Placement: wall/systems/runtime/keyboardShortcutRegistry.js
// Load: BEFORE itineraryRunAuthority.js (which registers its F/L/0/Esc
// shortcuts into this registry at its own load time) and BEFORE
// itineraryPresentationSurface.js. Load AFTER nothing in particular — this
// module has no dependencies of its own.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  var _shortcuts = []; // ordered array of registered shortcut definitions

  function _isTypingTarget() {
    var el = global.document && global.document.activeElement;
    var tag = el && el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!(el && el.isContentEditable);
  }

  // Interactive-but-not-a-text-field focus targets — buttons, links, and any
  // explicit [tabindex] element (including inside the keyboard-help dialog).
  // Used only to give Tab its dual behavior (spec §6) — every OTHER shortcut
  // keeps using the plain typing-target guard above.
  function _isInteractiveFocusTarget() {
    var el = global.document && global.document.activeElement;
    if (!el) return false;
    var tag = el.tagName;
    if (tag === 'BUTTON' || tag === 'A') return true;
    if (el.hasAttribute && el.hasAttribute('tabindex')) return true;
    return false;
  }

  function _matches(shortcut, event) {
    var key = (event.key || '').toLowerCase();
    var code = event.code || '';
    return shortcut.keys.some(function (k) {
      var kk = String(k).toLowerCase();
      return kk === key || kk === code.toLowerCase();
    });
  }

  function _findActiveConflict(keys, context) {
    return _shortcuts.find(function (s) {
      if (s.context !== context) return false;
      return s.keys.some(function (k) { return keys.indexOf(k) !== -1; });
    }) || null;
  }

  function register(shortcut) {
    if (!shortcut || !shortcut.id || !Array.isArray(shortcut.keys) || typeof shortcut.handler !== 'function') {
      console.warn('[KeyboardShortcutRegistry] register: invalid shortcut definition', shortcut);
      return false;
    }
    if (_shortcuts.some(function (s) { return s.id === shortcut.id; })) {
      console.warn('[KeyboardShortcutRegistry] register: duplicate id, ignored:', shortcut.id);
      return false;
    }
    var conflict = _findActiveConflict(shortcut.keys, shortcut.context);
    if (conflict) {
      console.warn('[KeyboardShortcutRegistry] register: key conflict in context "' + shortcut.context + '" between',
        shortcut.id, 'and', conflict.id, '— ignored');
      return false;
    }
    _shortcuts.push({
      id: shortcut.id,
      keys: shortcut.keys,
      label: shortcut.label || shortcut.id,
      description: shortcut.description || '',
      group: shortcut.group || 'Interface',
      context: shortcut.context || 'global',
      userFacing: shortcut.userFacing !== false,
      isModal: !!shortcut.isModal,
      // Opt-in dual behavior (spec §6, Tab specifically): when true, this
      // shortcut is skipped (letting native focus navigation proceed) if
      // focus is currently on a genuinely interactive non-text control.
      respectsInteractiveFocus: !!shortcut.respectsInteractiveFocus,
      enabled: typeof shortcut.enabled === 'function' ? shortcut.enabled : function () { return true; },
      handler: shortcut.handler,
    });
    return true;
  }

  function unregister(id) {
    var before = _shortcuts.length;
    _shortcuts = _shortcuts.filter(function (s) { return s.id !== id; });
    return _shortcuts.length !== before;
  }

  // Returns only active (enabled() === true right now), user-facing entries —
  // exactly what the keyboard-help popup should render. `context` is
  // optional; omit to list every user-facing context at once.
  function list(context) {
    return _shortcuts.filter(function (s) {
      if (!s.userFacing) return false;
      if (context && s.context !== context) return false;
      try { return !!s.enabled(); } catch (e) { return false; }
    });
  }

  // True while ANY currently-enabled shortcut is flagged isModal (e.g. the
  // keyboard-help popup's own Escape-to-close, only enabled while it's
  // open). While true, ONLY isModal-flagged shortcuts are eligible this
  // keydown — everything else (including itineraryRunAuthority's own Esc/0
  // camera-release) is skipped for this one keypress, regardless of
  // registration order. This is what guarantees "Esc closes the popup
  // first, without also releasing the camera in the same press" without
  // requiring any cross-module coupling between the popup and whatever else
  // happens to be listening for the same key.
  function _isModalActive() {
    return _shortcuts.some(function (s) {
      if (!s.isModal) return false;
      try { return !!s.enabled(); } catch (e) { return false; }
    });
  }

  // The one keydown handler LIVE MAP's presentation shortcuts route through.
  // `context`, if passed, restricts dispatch to shortcuts registered under
  // that context (or 'global') — omit to consider every registered shortcut.
  function handleKeydown(event, context) {
    if (!event || event.repeat) return;
    if (_isTypingTarget()) return;

    var modalActive = _isModalActive();

    for (var i = 0; i < _shortcuts.length; i++) {
      var s = _shortcuts[i];
      if (modalActive && !s.isModal) continue;
      if (context && s.context !== context && s.context !== 'global') continue;
      if (!_matches(s, event)) continue;

      // Dual behavior (spec §6, opted into by Tab specifically): let native
      // focus navigation proceed (no preventDefault/handler call) when focus
      // is on a genuinely interactive non-text control (button/link/
      // [tabindex]) rather than the map/body.
      if (s.respectsInteractiveFocus && _isInteractiveFocusTarget()) continue;

      var ok;
      try { ok = !!s.enabled(); } catch (e) { ok = false; }
      if (!ok) continue;

      try { s.handler(event); } catch (e) { console.warn('[KeyboardShortcutRegistry] handler threw for', s.id, e); }
      return; // first match wins — registration order is dispatch-priority order
    }
  }

  SBE.KeyboardShortcutRegistry = Object.freeze({
    VERSION: VERSION,
    register: register,
    unregister: unregister,
    list: list,
    handleKeydown: handleKeydown,
  });

  // This module owns the one real `keydown` listener for LIVE MAP's
  // presentation/runtime shortcuts (Tab/?/F/L/0/Esc) — no context filter, so
  // every registered shortcut is considered regardless of which module
  // registered it; each shortcut's own `enabled()` narrows applicability
  // (e.g. itinerary shortcuts gate on tab-ownership). This is separate from
  // main.js's own GlyphLab keydown listener, which is unaffected.
  try { global.addEventListener('keydown', function (e) { handleKeydown(e); }); } catch (e) {}

  console.log('[KeyboardShortcutRegistry] v' + VERSION + ' loaded');

})(window);
