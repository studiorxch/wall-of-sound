// ── WOS GizmoController ────────────────────────────────────────────────────────
// 0613_WOS_3DCanvasLabPhase3AuthoringUX_v1.0.0_BUILD
// Translate gizmo — HTML overlay positioned over Mapbox map.
// Drag preview updates anchor display only; single atomic manifest write on release.
// Coordinates with ThreeDCanvasView via publish/subscribe on global event bus.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var _map      = null;
  var _el       = null;    // gizmo DOM element
  var _objectId = null;    // currently selected actor's objectId
  var _dragging = false;
  var _listeners = { move: [], commit: [], cancel: [], rotate: [], 'rotate-commit': [] };

  function _store()    { return global.WOSActorManifestStore; }
  function _undoCtrl() { return global.WOSUndoRedoController; }
  function _emit(ev, data) {
    (_listeners[ev] || []).forEach(function (fn) { try { fn(data); } catch (e) {} });
  }

  // ── DOM ──────────────────────────────────────────────────────────────────────
  function _createGizmo(mapContainer) {
    var g = document.createElement('div');
    g.className = 'gizmo-root';
    g.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:10;display:none;';
    mapContainer.style.position = 'relative';
    mapContainer.appendChild(g);

    var ring = document.createElement('div');
    ring.className = 'gizmo-ring';
    ring.title = 'Drag to move';
    g.appendChild(ring);

    var hX = document.createElement('div');
    hX.className = 'gizmo-handle gizmo-handle--x';
    hX.title = 'Drag to move (X/Y)';
    g.appendChild(hX);

    // Rotate arc — SVG arc rendered as a CSS circle arc via clip-path
    var rotateArc = document.createElement('div');
    rotateArc.className = 'gizmo-rotate-arc';
    rotateArc.title = 'Drag to rotate (headingDeg)';
    g.appendChild(rotateArc);

    var rotateHandle = document.createElement('div');
    rotateHandle.className = 'gizmo-rotate-handle';
    rotateHandle.title = 'Drag to rotate';
    g.appendChild(rotateHandle);

    return g;
  }

  // ── Positioning ──────────────────────────────────────────────────────────────
  function _reposition(lat, lon) {
    if (!_map || !_el) return;
    try {
      var px = _map.project([lon, lat]);
      _el.style.left = px.x + 'px';
      _el.style.top  = px.y + 'px';
    } catch (e) {}
  }

  // ── Drag handling ────────────────────────────────────────────────────────────
  function _startDrag(e) {
    if (!_objectId || !_map) return;
    e.preventDefault();
    e.stopPropagation();
    _dragging = true;
    _map.dragPan.disable();
    _el.classList.add('gizmo-root--dragging');

    var mapCanvas = _map.getCanvas();
    var rect = mapCanvas.getBoundingClientRect();

    function onMove(ev) {
      if (!_dragging) return;
      var cx = (ev.touches ? ev.touches[0].clientX : ev.clientX) - rect.left;
      var cy = (ev.touches ? ev.touches[0].clientY : ev.clientY) - rect.top;
      try {
        var lngLat = _map.unproject([cx, cy]);
        _reposition(lngLat.lat, lngLat.lng);
        _emit('move', { objectId: _objectId, lat: lngLat.lat, lon: lngLat.lng });
      } catch (err) {}
    }

    function onUp(ev) {
      _dragging = false;
      _map.dragPan.enable();
      _el.classList.remove('gizmo-root--dragging');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);

      var cx = (ev.changedTouches ? ev.changedTouches[0].clientX : ev.clientX) - rect.left;
      var cy = (ev.changedTouches ? ev.changedTouches[0].clientY : ev.clientY) - rect.top;
      try {
        var lngLat = _map.unproject([cx, cy]);
        _commit(lngLat.lat, lngLat.lng);
      } catch (err) { _emit('cancel', { objectId: _objectId }); }
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend',  onUp);
  }

  function _commit(lat, lon) {
    var store = _store();
    if (!store || !_objectId) return;
    var before = store.get(_objectId);
    if (!before) return;
    var undo = _undoCtrl();
    var after = JSON.parse(JSON.stringify(before));
    after.anchor.lat = lat;
    after.anchor.lon = lon;
    if (undo) undo.record('move', { before: before, after: after });
    store.update(_objectId, { anchor: { lat: lat, lon: lon } });
    _emit('commit', { objectId: _objectId, lat: lat, lon: lon });
  }

  // ── Rotate drag ───────────────────────────────────────────────────────────────
  function _startRotate(e) {
    if (!_objectId || !_map || !_el) return;
    e.preventDefault();
    e.stopPropagation();

    var store = _store();
    var actor = store && store.get(_objectId);
    if (!actor) return;
    var startHeading = (actor.anchor && actor.anchor.headingDeg) || 0;

    // Center of the gizmo in page coords
    var rect = _el.getBoundingClientRect();
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;

    var startAngle = Math.atan2(
      (e.touches ? e.touches[0].clientY : e.clientY) - cy,
      (e.touches ? e.touches[0].clientX : e.clientX) - cx
    ) * 180 / Math.PI;

    var currentHeading = startHeading;

    function onMove(ev) {
      var angle = Math.atan2(
        (ev.touches ? ev.touches[0].clientY : ev.clientY) - cy,
        (ev.touches ? ev.touches[0].clientX : ev.clientX) - cx
      ) * 180 / Math.PI;
      var delta = angle - startAngle;
      var heading = ((startHeading + delta) % 360 + 360) % 360;
      currentHeading = Math.round(heading * 10) / 10;
      _updateRotateHandle(currentHeading);
      _emit('rotate', { objectId: _objectId, headingDeg: currentHeading });

      // Notify InspectorController for live display
      var insp = global.WOSInspectorController;
      if (insp && insp.draft() && insp.draft().objectId === _objectId) {
        insp.observeHeadingDeg(currentHeading);
      }
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);

      // Atomic commit
      var store2 = _store();
      if (store2 && _objectId) {
        var before = store2.get(_objectId);
        var undo = _undoCtrl();
        var after = before ? JSON.parse(JSON.stringify(before)) : null;
        if (after) after.anchor.headingDeg = currentHeading;
        if (undo && before) undo.record('move', { before: before, after: after });
        store2.update(_objectId, { anchor: { headingDeg: currentHeading } });
        _emit('rotate-commit', { objectId: _objectId, headingDeg: currentHeading });
      }
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onUp);
  }

  function _updateRotateHandle(headingDeg) {
    if (!_el) return;
    var handle = _el.querySelector('.gizmo-rotate-handle');
    if (!handle) return;
    // Position handle on the rotate arc at the heading angle
    // 0° = north = up (-90deg from CSS angle which starts at right)
    var rad = ((headingDeg - 90) * Math.PI) / 180;
    var r = 38; // px from center
    var hx = Math.cos(rad) * r;
    var hy = Math.sin(rad) * r;
    handle.style.transform = 'translate(' + hx + 'px,' + hy + 'px) translate(-50%,-50%)';
  }

  // ── Public API ───────────────────────────────────────────────────────────────
  var Controller = {
    init: function (map, mapContainerEl) {
      _map = map;
      _el  = _createGizmo(mapContainerEl);

      // Translate handles
      var handle = _el.querySelector('.gizmo-handle--x');
      var ring   = _el.querySelector('.gizmo-ring');
      function addDrag(node) {
        if (!node) return;
        node.style.pointerEvents = 'all';
        node.addEventListener('mousedown',  _startDrag);
        node.addEventListener('touchstart', _startDrag, { passive: false });
      }
      addDrag(handle);
      addDrag(ring);

      // Rotate handles
      var rotateArc    = _el.querySelector('.gizmo-rotate-arc');
      var rotateHandle = _el.querySelector('.gizmo-rotate-handle');
      function addRotate(node) {
        if (!node) return;
        node.style.pointerEvents = 'all';
        node.addEventListener('mousedown',  _startRotate);
        node.addEventListener('touchstart', _startRotate, { passive: false });
      }
      addRotate(rotateArc);
      addRotate(rotateHandle);

      // Reposition on map move
      _map.on('move', function () {
        if (_objectId) {
          var store = _store();
          var actor = store && store.get(_objectId);
          if (actor) _reposition(actor.anchor.lat, actor.anchor.lon);
        }
      });
    },

    // Show gizmo for actor
    show: function (actor) {
      if (!_el) return;
      _objectId = actor.objectId;
      _el.style.display = 'block';
      _reposition(actor.anchor.lat, actor.anchor.lon);
      _updateRotateHandle((actor.anchor && actor.anchor.headingDeg) || 0);
    },

    // Hide gizmo (deselect)
    hide: function () {
      if (!_el) return;
      _objectId = null;
      _el.style.display = 'none';
      _dragging = false;
    },

    // Move gizmo to transient anchor (during drag from external caller)
    moveTo: function (lat, lon) { _reposition(lat, lon); },

    on:  function (ev, fn) { if (_listeners[ev]) _listeners[ev].push(fn); },
    off: function (ev, fn) { if (_listeners[ev]) _listeners[ev] = _listeners[ev].filter(function (f) { return f !== fn; }); },
  };

  global.WOSGizmoController = Controller;
  console.log('[GizmoController] ready');
})(window);
