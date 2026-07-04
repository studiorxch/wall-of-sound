// ── WOS UndoRedoController ─────────────────────────────────────────────────────
// 0613_WOS_3DCanvasLabPhase3AuthoringUX_v1.0.0_BUILD
// Command stack: 50-op limit, before/after manifest snapshots.
// Ctrl+Z / Cmd+Z = undo. Ctrl+Shift+Z / Cmd+Shift+Z = redo.
// Stack is in-memory only; does not persist across sessions.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var MAX_OPS = 50;
  var _stack = [];   // [{type, before, after}]
  var _head  = -1;   // current position; -1 = empty
  var _listeners = [];

  function _store()    { return global.WOSActorManifestStore; }
  function _placCtrl() { return global.WOSActorPlacementController; }
  function _emit()     { for (var i = 0; i < _listeners.length; i++) { try { _listeners[i](); } catch (e) {} } }

  function _apply(op, direction) {
    var store = _store();
    if (!store) return false;
    var manifest = direction === 'undo' ? op.before : op.after;
    var remove   = direction === 'undo' ? op.after  : op.before;

    if (remove && manifest) {
      // replace — move/inspector-save: had before + after
      store.replace(manifest.objectId, manifest);
    } else if (manifest && !remove) {
      // re-add actor (undo of delete, or redo of place/duplicate)
      if (!store.get(manifest.objectId)) {
        var s = store.load();
        s.actors.push(manifest);
        // write via internal API — use a private path
        localStorage.setItem('wos-actors', JSON.stringify(s));
      } else {
        store.replace(manifest.objectId, manifest);
      }
    } else if (remove && !manifest) {
      // remove actor (undo of place/duplicate, redo of delete)
      store.remove(remove.objectId);
      var ctrl = _placCtrl();
      if (ctrl && ctrl.selectedObjectId() === remove.objectId) ctrl.deselect();
    }

    // Notify canvas/library to refresh
    _emit();
    return true;
  }

  var Controller = {
    // Called by placement/inspector before mutating the store.
    // type: 'place'|'move'|'duplicate'|'delete'|'save'
    // entry: { before: manifest|null, after: manifest|null }
    record: function (type, entry) {
      // Clear redo tail
      _stack = _stack.slice(0, _head + 1);
      _stack.push({ type: type, before: entry.before || null, after: entry.after || null });
      if (_stack.length > MAX_OPS) _stack.shift();
      _head = _stack.length - 1;
      _emit();
    },

    undo: function () {
      if (_head < 0) return false;
      var op = _stack[_head];
      _apply(op, 'undo');
      _head--;
      _emit();
      return true;
    },

    redo: function () {
      if (_head >= _stack.length - 1) return false;
      _head++;
      var op = _stack[_head];
      _apply(op, 'redo');
      _emit();
      return true;
    },

    canUndo: function () { return _head >= 0; },
    canRedo: function () { return _head < _stack.length - 1; },
    stackSize: function () { return _stack.length; },
    headIndex: function () { return _head; },

    on:  function (fn) { _listeners.push(fn); },
    off: function (fn) { _listeners = _listeners.filter(function (f) { return f !== fn; }); },
  };

  // ── Keyboard shortcuts ───────────────────────────────────────────────────────
  document.addEventListener('keydown', function (e) {
    var isUndo = (e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey;
    var isRedo = (e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey;
    var inInput = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT');
    if (inInput) return;
    if (isUndo) { e.preventDefault(); Controller.undo(); }
    if (isRedo) { e.preventDefault(); Controller.redo(); }
  });

  global.WOSUndoRedoController = Controller;
  console.log('[UndoRedoController] ready');
})(window);
