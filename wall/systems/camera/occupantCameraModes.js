// ── OccupantCameraModes v1.0.0 ────────────────────────────────────────────────
// 0605M_WOS_OccupantCameraModes_v1.0.0
// Status: active | Classification: presentation-camera-runtime
//
// User-selectable occupant POV modes. A runtime BRIDGE that composes the 0605L
// anchor resolver + existing camera stack — it creates no new lens/FOV/interior:
//
//     actor target → occupant anchor (0605L) → camera request → terrain enhance
//     (0605K) → viewport, owned per-frame until disengaged.
//
// "Occupancy before lens": the anchor says where the viewer sits; the mode adds a
// view direction (forward/left/right/rear) + pitch/zoom only. Occupant modes
// SUPERSEDE shot presets (more specific). READ-ONLY to the world — mutates no
// actor truth, anchors, shot defs, WSL, or Mapbox style. Load after
// occupantPOVCameraFramework.js. Never throws out of a public call.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  function _md(id, label, classes, anchor, bo, pitch, zoom, shot) {
    return Object.freeze({ id: id, label: label, actorClasses: classes, anchorId: anchor,
      viewBearingOffsetDeg: bo, pitch: pitch, zoom: zoom, defaultShotId: shot });
  }
  // Mode registry — view direction via bearing offset (forward 0 / left -90 / right +90 / rear 180).
  var MODES = {
    driver:          _md('driver', 'Driver', ['car'], 'driver_seat', 0, 82, 18, 'windshield'),
    passenger:       _md('passenger', 'Passenger', ['car'], 'front_passenger', 0, 82, 18, 'windshield'),
    rear_seat:       _md('rear_seat', 'Rear Seat', ['car'], 'rear_seat', 0, 80, 18, 'windshield'),
    left_window:     _md('left_window', 'Left Window', ['car'], 'left_window_view', -90, 78, 18, 'left_window'),
    right_window:    _md('right_window', 'Right Window', ['car'], 'right_window_view', 90, 78, 18, 'right_window'),
    rear_window:     _md('rear_window', 'Rear Window', ['car'], 'rear_window_view', 180, 80, 18, 'rear_window'),
    bus_front:       _md('bus_front', 'Bus Front', ['bus'], 'bus_front_window', 0, 82, 18, 'bus_front_window'),
    bus_passenger:   _md('bus_passenger', 'Bus Passenger', ['bus'], 'bus_passenger', 60, 78, 18, 'bus_side_window'),
    walker_head:     _md('walker_head', 'Walker Head', ['walker'], 'walker_head', 0, 84, 19, 'head_pov'),
    bike_rider:      _md('bike_rider', 'Bike Rider', ['bike'], 'bike_rider', 0, 84, 18.5, 'head_pov'),
    ferry_passenger: _md('ferry_passenger', 'Ferry Passenger', ['ferry'], 'ferry_passenger', 0, 80, 17, 'windshield'),
  };
  var ORDER = Object.keys(MODES);

  function _opf() { return SBE.OccupantPOVCameraFramework; }
  function _ct() { return SBE.TransitCameraTargeting; }
  function _ta() { return SBE.TerrainAwareActorCamera; }
  function _shotPresets() { return SBE.ActorCameraShotPresets; }
  function _mvr() { return SBE.MapboxViewportRuntime; }
  function _map() { var m = _mvr(); try { return (m && typeof m.getMap === 'function') ? m.getMap() : null; } catch (e) { return null; } }
  function _num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
  function _norm(b) { return ((b % 360) + 360) % 360; }

  // 0605N — shared look directions (front/left/right/rear) layered over any seat.
  var LOOK_OFFSET = { front: 0, left: -90, right: 90, rear: 180 };

  var _enabled = true, _active = false, _debug = false;
  var _current = 'driver', _rafId = null, _lastRequest = null, _lastError = null;
  // 0605N — engagement can be a baked mode OR an anchor+look internal view.
  var _kind = 'mode', _intAnchorId = null, _intLook = 'front', _intModeId = null;
  var _stats = { applies: 0, engagements: 0, disengagements: 0, cameraFrames: 0, noTarget: 0, anchorFails: 0, modeSwitches: 0 };

  // Target resolution — mirrors the repaired 0605I: transit target → hero car.
  function _resolveTarget() {
    var ct = _ct();
    if (ct) {
      var pos = null, tgt = null;
      try { if (typeof ct.getTargetPosition === 'function') pos = ct.getTargetPosition(); } catch (e) {}
      try { if (typeof ct.getTarget === 'function') tgt = ct.getTarget(); } catch (e) {}
      var heading = tgt ? (_num(tgt.headingDeg) || 0) : 0;
      if (!pos && tgt && tgt.presentationLng != null) pos = { lng: tgt.presentationLng, lat: tgt.presentationLat };
      if (pos && pos.lng != null && pos.lat != null) {
        return { actor: { actorId: tgt && tgt.actorId, actorType: tgt && tgt.targetType, lng: pos.lng, lat: pos.lat, headingDeg: heading, metadata: tgt }, heading: heading, source: 'transit' };
      }
    }
    var hv = SBE.HeroVehicleRuntime;
    if (hv && typeof hv.getState === 'function') {
      try { var s = hv.getState(); if (s && s.active && s.lng != null && s.lat != null) return { actor: { actorType: 'hero_car', lng: s.lng, lat: s.lat, headingDeg: s.headingDeg }, heading: _num(s.headingDeg) || 0, source: 'hero' }; } catch (e) {}
    }
    return null;
  }

  // Compose a camera request: occupant anchor world position + mode view direction.
  function _compose(mode) {
    var t = _resolveTarget();
    if (!t) { _stats.noTarget++; _lastError = 'no_target'; return { ok: false, reason: 'no_target' }; }
    var opf = _opf();
    if (!opf || typeof opf.resolveAnchor !== 'function') { _lastError = 'anchor_framework_unavailable'; return { ok: false, reason: 'anchor_framework_unavailable' }; }
    var anchor;
    try { anchor = opf.resolveAnchor(t.actor, mode.anchorId); } catch (e) { anchor = null; }
    if (!anchor || anchor.ok === false || anchor.lng == null || anchor.lat == null) { _stats.anchorFails++; _lastError = anchor && anchor.reason ? anchor.reason : 'anchor_resolve_failed'; return { ok: false, reason: _lastError }; }
    var heading = t.heading || 0;
    var vb = _norm(heading + mode.viewBearingOffsetDeg);
    var lt = _projectM(anchor.lng, anchor.lat, vb, 80);   // 0605P — look target ahead of eye
    var req = {
      source: 'occupant-camera-modes', modeId: mode.id, anchorId: mode.anchorId,
      actorId: t.actor.actorId || null, actorType: t.actor.actorType || null, vehicleClass: anchor.vehicleClass,
      lng: anchor.lng, lat: anchor.lat, offsetZ: anchor.heightM,
      headingDeg: heading, bearing: vb, pitch: mode.pitch, zoom: mode.zoom,
      pov: true, family: 'pov', shotId: mode.defaultShotId, reason: 'occupant:' + mode.id, easeMs: 600,
      // 0605P — true internal POV: eye AT the anchor; look target is AHEAD (Mapbox
      // center = look-at, not the eye).
      povInternal: true, eyeLng: anchor.lng, eyeLat: anchor.lat, eyeHeightM: anchor.heightM,
      viewBearing: vb, lookTargetLng: lt.lng, lookTargetLat: lt.lat,
    };
    // 0605O — lens control (anchor → look → LENS → terrain), then terrain.
    var lc = SBE.CameraLensControlPass;
    if (lc && typeof lc.applyLens === 'function') { try { req = lc.applyLens(req) || req; } catch (e) {} }
    // Terrain-aware enhancement (0605K) — adds clearance + grade pitch comp.
    var ta = _ta();
    if (ta && typeof ta.enhanceRequest === 'function') { try { req = ta.enhanceRequest(req) || req; } catch (e) {} }
    _lastError = null;
    return { ok: true, request: req, anchor: anchor, source: t.source };
  }

  // 0605N — internal view = seat anchor + shared look direction (bearing offset).
  function _composeInternal() {
    var t = _resolveTarget();
    if (!t) { _stats.noTarget++; _lastError = 'no_target'; return { ok: false, reason: 'no_target' }; }
    var opf = _opf();
    if (!opf || typeof opf.resolveAnchor !== 'function') { _lastError = 'anchor_framework_unavailable'; return { ok: false, reason: 'anchor_framework_unavailable' }; }
    var anchor;
    try { anchor = opf.resolveAnchor(t.actor, _intAnchorId); } catch (e) { anchor = null; }
    if (!anchor || anchor.ok === false || anchor.lng == null || anchor.lat == null) { _stats.anchorFails++; _lastError = anchor && anchor.reason ? anchor.reason : 'anchor_resolve_failed'; return { ok: false, reason: _lastError }; }
    var heading = t.heading || 0;
    var lookOff = LOOK_OFFSET[_intLook] != null ? LOOK_OFFSET[_intLook] : 0;
    var vb = _norm(heading + lookOff);
    var lt = _projectM(anchor.lng, anchor.lat, vb, 80);   // 0605P — look target ahead of eye
    var req = {
      source: 'occupant-camera-modes', modeId: _intModeId || ('internal:' + _intAnchorId), anchorId: _intAnchorId, lookDirection: _intLook,
      actorId: t.actor.actorId || null, actorType: t.actor.actorType || null, vehicleClass: anchor.vehicleClass,
      lng: anchor.lng, lat: anchor.lat, offsetZ: anchor.heightM,
      headingDeg: heading, bearing: vb, pitch: 80, zoom: 18,
      pov: true, family: 'pov', shotId: 'windshield', reason: 'occupant_internal:' + _intAnchorId + ':' + _intLook, easeMs: 600,
      // 0605P — true internal POV eye + view bearing + look target ahead.
      povInternal: true, eyeLng: anchor.lng, eyeLat: anchor.lat, eyeHeightM: anchor.heightM,
      viewBearing: vb, lookTargetLng: lt.lng, lookTargetLat: lt.lat,
    };
    // 0605O — lens control before terrain enhancement.
    var lc = SBE.CameraLensControlPass;
    if (lc && typeof lc.applyLens === 'function') { try { req = lc.applyLens(req) || req; } catch (e) {} }
    var ta = _ta();
    if (ta && typeof ta.enhanceRequest === 'function') { try { req = ta.enhanceRequest(req) || req; } catch (e) {} }
    _lastError = null;
    return { ok: true, request: req, anchor: anchor, source: t.source };
  }
  function _composeActive() { return (_kind === 'internal') ? _composeInternal() : _compose(MODES[_current]); }

  // Offset lng/lat by metres along a compass bearing (0 = north, clockwise).
  function _projectM(lng, lat, bearingDeg, distM) {
    var br = bearingDeg * Math.PI / 180;
    return { lng: lng + (distM * Math.sin(br)) / (111320 * Math.cos(lat * Math.PI / 180)), lat: lat + (distM * Math.cos(br)) / 111320 };
  }
  // 0605O.1 — TRUE internal POV: place the camera EYE at the occupant anchor and
  // look toward a target ahead (Mapbox `center` is the look-at, not the eye). Uses
  // FreeCamera (real eye placement + altitude) when available, else a forward-
  // centred high-pitch fallback so the viewport looks FROM the seat, not at the car.
  function _submitInternalPOV(req) {
    var map = _map();
    if (!map) { _lastError = 'map_unavailable'; return false; }
    var bearing = _norm(req.viewBearing != null ? req.viewBearing : (req.bearing || 0));
    var eyeLng = req.eyeLng != null ? req.eyeLng : req.lng;
    var eyeLat = req.eyeLat != null ? req.eyeLat : req.lat;
    // Preferred: FreeCamera eye-at-anchor, look far ahead (near horizon).
    var mgl = global.mapboxgl;
    if (typeof map.setFreeCameraOptions === 'function' && mgl && mgl.MercatorCoordinate) {
      try {
        var terrainElev = (req.terrainElevationM != null) ? req.terrainElevationM : 0;
        var eyeAlt = terrainElev + (req.eyeHeightM != null ? req.eyeHeightM : 1.5);
        var look = _projectM(eyeLng, eyeLat, bearing, 1000);
        var cam = (typeof map.getFreeCameraOptions === 'function') ? map.getFreeCameraOptions() : (mgl.FreeCameraOptions ? new mgl.FreeCameraOptions() : null);
        if (cam) {
          cam.position = mgl.MercatorCoordinate.fromLngLat([eyeLng, eyeLat], eyeAlt);
          if (typeof cam.lookAtPoint === 'function') cam.lookAtPoint([look.lng, look.lat]);
          map.setFreeCameraOptions(cam);
          _projectionPath = 'freecamera';
          return true;
        }
      } catch (e) {}
    }
    // Fallback: centre the framed point AHEAD of the eye and look forward at a high
    // pitch — the eye sits near the seat instead of orbiting the actor.
    var center = (req.lookTargetLng != null) ? { lng: req.lookTargetLng, lat: req.lookTargetLat } : _projectM(eyeLng, eyeLat, bearing, 80);
    var opts = { center: [center.lng, center.lat], bearing: bearing,
      pitch: Math.max(74, Math.min(85, req.pitch != null ? req.pitch : 80)), zoom: req.zoom != null ? req.zoom : 18 };
    try { if (typeof map.jumpTo === 'function') { map.jumpTo(opts); _projectionPath = 'fallback_center_ahead'; return true; } if (typeof map.easeTo === 'function') { map.easeTo(opts); _projectionPath = 'fallback_center_ahead'; return true; } } catch (e) {}
    _lastError = 'camera_unavailable';
    return false;
  }

  function _submit(req, live) {
    if (req && req.povInternal) return _submitInternalPOV(req);   // internal POV projection
    var map = _map();
    if (!map) { _lastError = 'map_unavailable'; return false; }
    var opts = { center: [req.lng, req.lat] };
    if (req.bearing != null) opts.bearing = _norm(req.bearing);
    if (req.pitch != null) opts.pitch = Math.max(0, Math.min(85, req.pitch));
    if (req.zoom != null) opts.zoom = req.zoom;
    try {
      if (live && typeof map.jumpTo === 'function') { map.jumpTo(opts); return true; }
      if (!live) { opts.duration = req.easeMs || 600; if (typeof map.easeTo === 'function') { map.easeTo(opts); return true; } }
      if (typeof map.jumpTo === 'function') { map.jumpTo(opts); return true; }
    } catch (e) {}
    _lastError = 'camera_unavailable';
    return false;
  }

  // 0605O.1 — hide the actor mesh while inside it (internal POV); restore on exit.
  var _actorHidden = false, _projectionPath = null;
  function _setActorHidden(h) {
    var hr = SBE.HeroVehicleRenderer;
    if (hr && typeof hr.setHidden === 'function') { try { hr.setHidden(!!h); } catch (e) {} }
    _actorHidden = !!h;
  }

  // ── Engagement (owns the viewport per-frame; hero loop yields) ───────────────
  function _claimVA() { var va = SBE.ViewportAuthority; if (va && typeof va.claim === 'function') { try { va.claim('shot'); } catch (e) {} } }
  function _releaseVA() { var va = SBE.ViewportAuthority; if (va && typeof va.release === 'function') { try { va.release('shot'); } catch (e) {} } }
  function _tick() {
    var c = _composeActive(); if (!c.ok) return;
    _lastRequest = c.request; _stats.cameraFrames++;
    _submit(c.request, true);
  }
  function _startLoop() {
    if (_rafId || typeof global.requestAnimationFrame !== 'function') return;
    var step = function () { if (!_active) { _rafId = null; return; } try { _tick(); } catch (e) {} _rafId = global.requestAnimationFrame(step); };
    _rafId = global.requestAnimationFrame(step);
  }
  function _stopLoop() { if (_rafId && typeof global.cancelAnimationFrame === 'function') { try { global.cancelAnimationFrame(_rafId); } catch (e) {} } _rafId = null; }

  // ── Public API ──────────────────────────────────────────────────────────────
  function setMode(modeId) { if (!MODES[modeId]) { _lastError = 'invalid_mode'; return false; } if (modeId !== _current) _stats.modeSwitches++; _current = modeId; return _current; }
  function getMode() { return _current; }
  function listModes() { return ORDER.map(function (k) { return MODES[k]; }); }
  function getModeDef(id) { return MODES[id] || null; }

  function _supersedeShot() { var sp = _shotPresets(); if (sp && typeof sp.isEngaged === 'function' && sp.isEngaged() && typeof sp.disengage === 'function') { try { sp.disengage(); } catch (e) {} } }

  function applyMode(modeId) {
    _stats.applies++;
    if (!_enabled) { _lastError = 'disabled'; return { ok: false, reason: 'disabled' }; }
    if (modeId != null && !setMode(modeId)) return { ok: false, reason: 'invalid_mode' };
    _supersedeShot();
    _kind = 'mode';
    var mode = MODES[_current];
    var c = _compose(mode);
    if (!c.ok) return { ok: false, reason: c.reason, modeId: _current, lastError: _lastError };
    _lastRequest = c.request;
    var submitted = _submit(c.request, false);   // initial smooth easeTo
    if (!_active) { _active = true; _stats.engagements++; _claimVA(); _setActorHidden(true); _startLoop(); }
    if (_debug) console.log('[OccupantMode]', _current, '→ anchor', mode.anchorId, '| source', c.source, '| submitted', submitted);
    return { ok: true, modeId: _current, anchorId: mode.anchorId, vehicleClass: c.request.vehicleClass, request: c.request, submitted: submitted, source: c.source, active: _active };
  }

  // 0605N — internal view = seat anchor + shared look direction (front/left/right/rear).
  function applyInternalView(anchorId, lookDirection, modeIdLabel) {
    _stats.applies++;
    if (!_enabled) { _lastError = 'disabled'; return { ok: false, reason: 'disabled' }; }
    if (!anchorId) { _lastError = 'invalid_mode'; return { ok: false, reason: 'invalid_mode' }; }
    _supersedeShot();
    _kind = 'internal'; _intAnchorId = anchorId; _intLook = (LOOK_OFFSET[lookDirection] != null) ? lookDirection : 'front'; _intModeId = modeIdLabel || null;
    var c = _composeInternal();
    if (!c.ok) return { ok: false, reason: c.reason, anchorId: anchorId, lookDirection: _intLook, lastError: _lastError };
    _lastRequest = c.request;
    var submitted = _submit(c.request, false);
    if (!_active) { _active = true; _stats.engagements++; _claimVA(); _setActorHidden(true); _startLoop(); }
    if (_debug) console.log('[OccupantMode] internal', anchorId, _intLook, '| bearing', Math.round(c.request.bearing), '| submitted', submitted);
    return { ok: true, kind: 'internal', anchorId: anchorId, lookDirection: _intLook, vehicleClass: c.request.vehicleClass, request: c.request, submitted: submitted, source: c.source, active: _active };
  }
  // applyView({ internalViewId, lookDirection, transportMode }) — maps a mode id
  // (driver/bus_front/…) to its seat anchor, then applies anchor + look.
  function applyView(opts) {
    opts = opts || {};
    var vid = opts.internalViewId;
    if (vid == null) { _lastError = 'invalid_mode'; return { ok: false, reason: 'invalid_mode' }; }
    var anchorId = (MODES[vid] ? MODES[vid].anchorId : vid);
    return applyInternalView(anchorId, opts.lookDirection || 'front', vid);
  }
  function reapply() { return (_kind === 'internal') ? applyInternalView(_intAnchorId, _intLook, _intModeId) : applyMode(_current); }

  function start() { _active = true; _claimVA(); _setActorHidden(true); _startLoop(); return true; }
  function stop() { return disengage(); }
  function isActive() { return _active; }
  function disengage() { var was = _active; _active = false; _stopLoop(); _releaseVA(); if (was) { _setActorHidden(false); _stats.disengagements++; } _projectionPath = null; return was; }

  function setEnabled(on) { _enabled = on !== false; if (!_enabled) disengage(); return _enabled; }
  function setDebug(on) { _debug = on !== false; return _debug; }

  function getState() {
    return { version: VERSION, active: _active, enabled: _enabled, debug: _debug, mode: _current,
      kind: _kind, actorHidden: _actorHidden, projectionPath: _projectionPath,   // 0605P
      modeCount: ORDER.length, lastRequest: _lastRequest, lastError: _lastError,
      mapAvailable: !!_map(), anchorFrameworkAvailable: !!(_opf() && typeof _opf().resolveAnchor === 'function'),
      terrainAvailable: !!(_ta() && typeof _ta().enhanceRequest === 'function') };
  }
  function getStats() { var o = {}; for (var k in _stats) o[k] = _stats[k]; return o; }

  SBE.OccupantCameraModes = Object.freeze({
    VERSION:    VERSION,
    setMode:    setMode,
    getMode:    getMode,
    listModes:  listModes,
    getModeDef: getModeDef,
    applyMode:  applyMode,
    applyInternalView: applyInternalView,
    applyView:  applyView,
    reapply:    reapply,
    start:      start,
    stop:       stop,
    isActive:   isActive,
    disengage:  disengage,
    setEnabled: setEnabled,
    setDebug:   setDebug,
    getState:   getState,
    getStats:   getStats,
  });

  console.log('[OccupantCameraModes] v' + VERSION + ' loaded — ' + ORDER.length + ' occupant modes');
})(window);
