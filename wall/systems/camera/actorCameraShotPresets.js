// ── ActorCameraShotPresets v1.0.0 ─────────────────────────────────────────────
// 0605I_WOS_ActorCameraShotPresets_v1.0.0
// Status: active | Classification: presentation-layer (camera language)
//
// Reusable, ACTOR-AGNOSTIC camera shot vocabulary. Camera targeting answers WHAT
// we follow (0605F); shot presets answer HOW we view it — external follow/chase/
// side/top, actor POV (windshield/windows/bumpers), transit (bus windows/door/roof/
// articulated joint), and walker (head/shoulder/street). No actor-specific
// assumptions, no interior geometry (virtual camera anchor only). READ-ONLY to the
// world: reads TransitCameraTargeting + actor presentation position/heading; writes
// only camera-request payloads (submitted to an existing camera authority, else
// camera_unavailable). Never mutates actors/truth/selector/smoothing/targeting/
// Mapbox style. Load AFTER transitCameraTargeting.js. Never throws publicly.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  // Shot preset registry. offsets in metres (X=right, Y=forward, Z=up);
  // lookAheadDistance leads the framed centre; bearingOffset/pitch in degrees;
  // followStrength 0..1 (higher = snappier ease).
  function _shot(id, family, group, o) {
    return Object.freeze({ id: id, family: family, group: group,
      offsetX: o.x || 0, offsetY: o.y || 0, offsetZ: o.z || 0,
      lookAheadDistance: o.look != null ? o.look : 0,
      pitch: o.pitch != null ? o.pitch : 45, bearingOffset: o.bo || 0,
      followStrength: o.fs != null ? o.fs : 0.5, zoom: o.zoom != null ? o.zoom : null, pov: !!o.pov });
  }
  var SHOTS = {
    // ── External ──
    external_follow: _shot('external_follow', 'external', 'cinematic', { y: -30, z: 18, look: 12, pitch: 55, fs: 0.4 }),
    front_lead:      _shot('front_lead', 'external', 'cinematic', { y: 28, z: 14, look: 0, pitch: 60, bo: 180, fs: 0.4 }),
    rear_chase:      _shot('rear_chase', 'external', 'cinematic', { y: -22, z: 10, look: 16, pitch: 62, fs: 0.55 }),
    left_side:       _shot('left_side', 'external', 'documentary', { x: -26, z: 12, pitch: 65, bo: 90, fs: 0.45 }),
    right_side:      _shot('right_side', 'external', 'documentary', { x: 26, z: 12, pitch: 65, bo: -90, fs: 0.45 }),
    top_down:        _shot('top_down', 'external', 'documentary', { z: 60, pitch: 0, fs: 0.5, zoom: 17 }),
    high_civic:      _shot('high_civic', 'external', 'cinematic', { y: -40, z: 80, pitch: 35, fs: 0.3, zoom: 15.5 }),
    orbit_inspect:   _shot('orbit_inspect', 'external', 'inspection', { y: -20, z: 16, pitch: 68, fs: 0.6 }),
    // ── Actor POV ──
    actor_pov:       _shot('actor_pov', 'pov', 'cinematic', { z: 2.4, look: 40, pitch: 80, fs: 0.7, pov: true, zoom: 18 }),
    windshield:      _shot('windshield', 'pov', 'cinematic', { y: 4, z: 2.6, look: 50, pitch: 82, fs: 0.7, pov: true, zoom: 18 }),
    left_window:     _shot('left_window', 'pov', 'documentary', { x: -1.4, z: 2.2, look: 10, pitch: 78, bo: 80, fs: 0.65, pov: true, zoom: 18 }),
    right_window:    _shot('right_window', 'pov', 'documentary', { x: 1.4, z: 2.2, look: 10, pitch: 78, bo: -80, fs: 0.65, pov: true, zoom: 18 }),
    rear_window:     _shot('rear_window', 'pov', 'documentary', { y: -4, z: 2.4, look: -20, pitch: 80, bo: 180, fs: 0.65, pov: true, zoom: 18 }),
    roof_mount:      _shot('roof_mount', 'pov', 'cinematic', { z: 4, look: 30, pitch: 70, fs: 0.6, pov: true, zoom: 17.5 }),
    bumper_front:    _shot('bumper_front', 'pov', 'inspection', { y: 6, z: 0.8, look: 30, pitch: 85, fs: 0.7, pov: true, zoom: 18 }),
    bumper_rear:     _shot('bumper_rear', 'pov', 'inspection', { y: -6, z: 0.8, look: -25, pitch: 85, bo: 180, fs: 0.7, pov: true, zoom: 18 }),
    // ── Transit ──
    bus_front_window:    _shot('bus_front_window', 'transit', 'cinematic', { y: 6, z: 3.2, look: 50, pitch: 82, fs: 0.7, pov: true, zoom: 18 }),
    bus_side_window:     _shot('bus_side_window', 'transit', 'documentary', { x: -1.8, z: 3.0, look: 8, pitch: 78, bo: 80, fs: 0.65, pov: true, zoom: 18 }),
    bus_rear_window:     _shot('bus_rear_window', 'transit', 'documentary', { y: -7, z: 3.2, look: -22, pitch: 80, bo: 180, fs: 0.65, pov: true, zoom: 18 }),
    bus_door_side:       _shot('bus_door_side', 'transit', 'documentary', { x: 2.4, z: 2.4, look: 0, pitch: 72, bo: -90, fs: 0.5, pov: true, zoom: 18 }),
    bus_roof:            _shot('bus_roof', 'transit', 'cinematic', { z: 5, look: 35, pitch: 68, fs: 0.55, pov: true, zoom: 17.5 }),
    articulated_joint_view: _shot('articulated_joint_view', 'transit', 'inspection', { y: -9, x: 2, z: 3.4, look: 6, pitch: 74, bo: -60, fs: 0.6, pov: true, zoom: 18 }),
    // ── Walker (inherited without framework change) ──
    head_pov:        _shot('head_pov', 'walker', 'cinematic', { z: 1.7, look: 25, pitch: 84, fs: 0.75, pov: true, zoom: 19 }),
    left_shoulder:   _shot('left_shoulder', 'walker', 'documentary', { x: -0.8, y: -1.2, z: 1.8, look: 8, pitch: 80, fs: 0.7, pov: true, zoom: 18.5 }),
    right_shoulder:  _shot('right_shoulder', 'walker', 'documentary', { x: 0.8, y: -1.2, z: 1.8, look: 8, pitch: 80, fs: 0.7, pov: true, zoom: 18.5 }),
    rear_follow:     _shot('rear_follow', 'walker', 'cinematic', { y: -6, z: 3, look: 8, pitch: 72, fs: 0.55, zoom: 18 }),
    street_level:    _shot('street_level', 'walker', 'documentary', { y: -10, z: 1.6, look: 12, pitch: 86, fs: 0.5, zoom: 18 }),
  };
  // Deterministic ordering for next/previous.
  var ORDER = Object.keys(SHOTS);

  function _ct() { return SBE.TransitCameraTargeting || null; }
  function _mvr() { return SBE.MapboxViewportRuntime || null; }
  function _map() { var m = _mvr(); try { return (m && typeof m.getMap === 'function') ? m.getMap() : null; } catch (e) { return null; } }
  function _num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }

  var _enabled = true, _debug = false;
  var _current = 'external_follow';
  // 0605K.2B — engagement: while a shot is active the preset system OWNS the
  // viewport (claims ViewportAuthority + drives a per-frame tracking loop) so the
  // hero camera loop yields instead of overriding the shot every frame.
  var _engaged = false, _rafId = null;
  var _stats = { applies: 0, cameraRequests: 0, cameraUnavailable: 0, noTarget: 0, shotSwitches: 0, lastError: null };
  var _lastRequest = null;

  function _metersToLatLng(lng, lat, bearingDeg, distM) {
    var br = bearingDeg * Math.PI / 180;
    var dLat = (distM * Math.cos(br)) / 111320;
    var dLng = (distM * Math.sin(br)) / (111320 * Math.cos(lat * Math.PI / 180));
    return { lng: lng + dLng, lat: lat + dLat };
  }

  // Resolve the current target position + heading. 0605K.2B — actor-agnostic:
  // prefer an explicit transit target (0605F), else fall back to the active hero
  // car / generic driven actor so shots work for cars, not just buses.
  function _resolveTarget() {
    var ct = _ct();
    if (ct) {
      var pos = null, heading = 0, tgt = null;
      try { if (typeof ct.getTargetPosition === 'function') pos = ct.getTargetPosition(); } catch (e) {}
      try { if (typeof ct.getTarget === 'function') tgt = ct.getTarget(); } catch (e) {}
      if (tgt) heading = _num(tgt.headingDeg) || 0;
      if (!pos && tgt && tgt.presentationLng != null) pos = { lng: tgt.presentationLng, lat: tgt.presentationLat };
      if (pos && pos.lng != null && pos.lat != null) return { lng: pos.lng, lat: pos.lat, heading: heading, target: tgt, source: 'transit' };
    }
    // Fallback: active hero car / generic actor (HeroVehicleRuntime).
    var hv = SBE.HeroVehicleRuntime;
    if (hv && typeof hv.getState === 'function') {
      try {
        var s = hv.getState();
        if (s && s.active && s.lng != null && s.lat != null) {
          return { lng: s.lng, lat: s.lat, heading: _num(s.headingDeg) || 0,
            target: { targetType: 'hero_car', targetKey: 'hero', headingDeg: s.headingDeg }, source: 'hero' };
        }
      } catch (e) {}
    }
    return null;
  }

  function _formRequest(shot, t) {
    // Frame centre = target position led by lookAhead along heading + lateral offset.
    var c = { lng: t.lng, lat: t.lat };
    if (shot.lookAheadDistance) c = _metersToLatLng(c.lng, c.lat, t.heading, shot.lookAheadDistance);
    if (shot.offsetX) c = _metersToLatLng(c.lng, c.lat, t.heading + 90, shot.offsetX);
    if (shot.offsetY) c = _metersToLatLng(c.lng, c.lat, t.heading, shot.offsetY);
    var easeMs = Math.round(300 + (1 - Math.max(0, Math.min(1, shot.followStrength))) * 1500);
    return {
      source: 'actor-camera-shot-presets', shotId: shot.id, family: shot.family, group: shot.group, pov: shot.pov,
      targetType: t.target ? t.target.targetType : null, targetKey: t.target ? t.target.targetKey : null,
      lng: c.lng, lat: c.lat, headingDeg: t.heading,
      bearing: t.heading + shot.bearingOffset, pitch: shot.pitch, zoom: shot.zoom,
      offsetX: shot.offsetX, offsetY: shot.offsetY, offsetZ: shot.offsetZ, lookAheadDistance: shot.lookAheadDistance,
      easeMs: easeMs, reason: 'shot:' + shot.id,
    };
  }
  function _submit(req) {
    var va = SBE.ViewportAuthority;
    if (va && typeof va.requestCamera === 'function') { try { va.requestCamera(req); _stats.cameraRequests++; return true; } catch (e) {} }
    var ag = SBE.AttentionGeography;
    if (ag && typeof ag.focusOn === 'function') { try { ag.focusOn(req); _stats.cameraRequests++; return true; } catch (e) {} }
    var map = _map();
    if (map) {
      var opts = { center: [req.lng, req.lat], duration: req.easeMs };
      if (req.bearing != null) opts.bearing = ((req.bearing % 360) + 360) % 360;
      if (req.pitch != null) opts.pitch = Math.max(0, Math.min(85, req.pitch));
      if (req.zoom != null) opts.zoom = req.zoom;
      try { if (typeof map.easeTo === 'function') { map.easeTo(opts); _stats.cameraRequests++; return true; }
        if (typeof map.flyTo === 'function') { map.flyTo(opts); _stats.cameraRequests++; return true; } } catch (e) {}
    }
    _stats.cameraUnavailable++; _stats.lastError = 'camera_authority_unavailable';
    return false;
  }

  // Per-frame live apply (jumpTo — no animation queue buildup, tracks the actor).
  function _applyLive(req) {
    var map = _map();
    if (!map) return false;
    var opts = { center: [req.lng, req.lat] };
    if (req.bearing != null) opts.bearing = ((req.bearing % 360) + 360) % 360;
    if (req.pitch != null) opts.pitch = Math.max(0, Math.min(85, req.pitch));
    if (req.zoom != null) opts.zoom = req.zoom;
    try { if (typeof map.jumpTo === 'function') { map.jumpTo(opts); return true; }
      if (typeof map.easeTo === 'function') { map.easeTo(opts); return true; } } catch (e) {}
    return false;
  }
  function _tickCamera() {
    var t = _resolveTarget();
    if (!t) return;
    var shot = SHOTS[_current];
    if (!shot) return;
    var req = _formRequest(shot, t);
    var ta = SBE.TerrainAwareActorCamera;
    if (ta && typeof ta.enhanceRequest === 'function') { try { req = ta.enhanceRequest(req) || req; } catch (e) {} }
    _lastRequest = req;
    _applyLive(req);
  }
  function _claimVA() { var va = SBE.ViewportAuthority; if (va && typeof va.claim === 'function') { try { va.claim('shot'); } catch (e) {} } }
  function _releaseVA() { var va = SBE.ViewportAuthority; if (va && typeof va.release === 'function') { try { va.release('shot'); } catch (e) {} } }
  function _startLoop() {
    if (_rafId || typeof global.requestAnimationFrame !== 'function') return;
    var step = function () { if (!_engaged) { _rafId = null; return; } try { _tickCamera(); } catch (e) {} _rafId = global.requestAnimationFrame(step); };
    _rafId = global.requestAnimationFrame(step);
  }
  function _stopLoop() { if (_rafId && typeof global.cancelAnimationFrame === 'function') { try { global.cancelAnimationFrame(_rafId); } catch (e) {} } _rafId = null; }
  function _engage() { if (_engaged) return; _engaged = true; _claimVA(); _startLoop(); }
  function disengage() { var was = _engaged; _engaged = false; _stopLoop(); _releaseVA(); return was; }
  function isEngaged() { return _engaged; }

  // ── Public API ──────────────────────────────────────────────────────────────
  function setShot(id) { if (!SHOTS[id]) { _stats.lastError = 'invalid_shot'; return false; } if (id !== _current) _stats.shotSwitches++; _current = id; return _current; }
  function getShot() { return _current; }
  function nextShot() { var i = ORDER.indexOf(_current); var n = ORDER[(i + 1) % ORDER.length]; setShot(n); return _current; }
  function previousShot() { var i = ORDER.indexOf(_current); var n = ORDER[(i - 1 + ORDER.length) % ORDER.length]; setShot(n); return _current; }
  function listShots() { return ORDER.map(function (k) { return SHOTS[k]; }); }
  function getShotDef(id) { return SHOTS[id] || null; }

  function applyShot(id) {
    _stats.applies++;
    if (!_enabled) { _stats.lastError = 'disabled'; return { ok: false, lastError: 'disabled' }; }
    if (id != null) { if (!setShot(id)) return { ok: false, lastError: 'invalid_shot' }; }
    var shot = SHOTS[_current];
    var t = _resolveTarget();
    if (!t) { _stats.noTarget++; _stats.lastError = 'no_target'; return { ok: false, shotId: _current, lastError: 'no_target' }; }
    var req = _formRequest(shot, t);
    // 0605K — terrain-aware enhancement (optional; passthrough when absent).
    var ta = SBE.TerrainAwareActorCamera;
    if (ta && typeof ta.enhanceRequest === 'function') { try { req = ta.enhanceRequest(req) || req; } catch (e) {} }
    _lastRequest = req;
    var submitted = _submit(req);             // initial smooth easeTo transition
    _engage();                                // claim viewport + per-frame tracking (hero loop yields)
    if (_debug) console.log('[ActorCameraShot]', _current, '→', submitted ? 'submitted' : 'camera_unavailable', '| source', t.source, req);
    return { ok: true, shotId: _current, submitted: submitted, request: req, source: t.source, engaged: _engaged, lastError: submitted ? null : 'camera_authority_unavailable' };
  }

  function setEnabled(on) { _enabled = on !== false; return _enabled; }
  function setDebug(on) { _debug = on !== false; return _debug; }

  function getState() {
    return { version: VERSION, enabled: _enabled, debug: _debug, currentShot: _current,
      shotCount: ORDER.length, families: ['external', 'pov', 'transit', 'walker'],
      lastRequest: _lastRequest, lastError: _stats.lastError };
  }
  function getStats() {
    return { applies: _stats.applies, cameraRequests: _stats.cameraRequests, cameraUnavailable: _stats.cameraUnavailable,
      noTarget: _stats.noTarget, shotSwitches: _stats.shotSwitches };
  }

  SBE.ActorCameraShotPresets = Object.freeze({
    VERSION:      VERSION,
    setShot:      setShot,
    getShot:      getShot,
    nextShot:     nextShot,
    previousShot: previousShot,
    listShots:    listShots,
    getShotDef:   getShotDef,
    applyShot:    applyShot,
    isEngaged:    isEngaged,
    disengage:    disengage,
    getState:     getState,
    getStats:     getStats,
    setEnabled:   setEnabled,
    setDebug:     setDebug,
  });

  console.log('[ActorCameraShotPresets] v' + VERSION + ' loaded — ' + ORDER.length + ' shots (actor-agnostic)');
})(window);
