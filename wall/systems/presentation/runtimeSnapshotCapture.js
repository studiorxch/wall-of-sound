// ── RuntimeSnapshotCapture v1.0.0 ─────────────────────────────────────────────
// 0606A_WOS_TraversalControlUXSnapshotCameraMenu_v1.0.0
// Status: active | Classification: presentation-snapshot
//
// HUD-free PNG snapshot export of the live WOS scene + coordinate metadata, so a
// view can be archived and returned to without console work. Hides the HUD via a
// body class, captures the Mapbox canvas (`toDataURL`), downloads an archive-named
// PNG + optional sidecar JSON, then restores the HUD. SVG full-scene export is
// honestly unsupported (WebGL+terrain+3D is raster-first). READ-ONLY to the world:
// mutates no actor truth, route geometry, camera authority, or Mapbox style — it
// only toggles a presentation body class during capture. Never throws publicly.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';
  var CLEAN_CLASS = 'snapshot-clean';

  function _mvr() { return SBE.MapboxViewportRuntime; }
  function _map() { var m = _mvr(); try { return (m && typeof m.getMap === 'function') ? m.getMap() : null; } catch (e) { return null; } }
  function _doc() { return global.document || null; }

  var _debug = false;
  var _state = { lastCaptureAt: null, lastFilename: null, lastMetadata: null, lastError: null, composition: 'mapbox_canvas' };
  var _stats = { captures: 0, failures: 0, metadataWrites: 0, recenters: 0 };

  function _pad(n) { return (n < 10 ? '0' : '') + n; }
  function _safe(s) { return String(s == null ? '' : s).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'na'; }

  function _now() {
    var d = new Date();
    var h24 = d.getHours(); var ampm = h24 < 12 ? 'AM' : 'PM'; var h12 = h24 % 12; if (h12 === 0) h12 = 12;
    return {
      iso: d.toISOString(),
      date: d.getFullYear() + '-' + _pad(d.getMonth() + 1) + '-' + _pad(d.getDate()),
      time: _pad(h12) + '-' + _pad(d.getMinutes()) + '-' + _pad(d.getSeconds()),
      ampm: ampm,
      local: d.toLocaleString(),
    };
  }

  // Gather camera/transport/route context for the filename + metadata.
  function _context() {
    var map = _map();
    var center = null, zoom = null, pitch = null, bearing = null;
    if (map) {
      try { var c = map.getCenter(); center = { lng: c.lng, lat: c.lat }; } catch (e) {}
      try { zoom = map.getZoom(); } catch (e) {}
      try { pitch = map.getPitch(); } catch (e) {}
      try { bearing = map.getBearing(); } catch (e) {}
    }
    var auth = SBE.TransportScopedPOVAuthority;
    var transportMode = auth && typeof auth.getTransportMode === 'function' ? auth.getTransportMode() : (global._wos && _wos.nav && _wos.nav.transport) || 'drive';
    var cameraMode = 'external';
    if (auth && typeof auth.getViewFamily === 'function') {
      try {
        var fam = auth.getViewFamily();
        cameraMode = (fam === 'internal') ? ('int-' + (auth.getInternalView ? auth.getInternalView() : 'pov') + '-pov') : ('ext-' + (auth.getExternalView ? auth.getExternalView() : 'follow'));
      } catch (e) {}
    }
    var lens = SBE.CameraLensControlPass;
    var lensProfile = lens && typeof lens.getState === 'function' ? (lens.getState().autoProfile ? 'auto' : lens.getLensProfile()) : null;
    var route = null;
    var hv = SBE.HeroVehicleRuntime, ft = SBE.RegionalFlightTripRuntime;
    var rs = (transportMode === 'drive' && hv && hv.getState) ? hv.getState() : ((ft && ft.getState) ? ft.getState() : null);
    if (rs) route = { from: rs.from || null, to: rs.to || null, active: !!rs.active, paused: !!rs.paused };
    return { center: center, zoom: zoom, pitch: pitch, bearing: bearing, transportMode: transportMode, cameraMode: cameraMode, lensProfile: lensProfile, route: route };
  }

  function _filename(prefix, ctx, t) {
    var lat = ctx.center ? (Math.round(ctx.center.lat * 1e6) / 1e6) : 'na';
    var lng = ctx.center ? (Math.round(ctx.center.lng * 1e6) / 1e6) : 'na';
    return [_safe(prefix || 'WOS'), t.date, t.time, t.ampm, _safe(ctx.transportMode), _safe(ctx.cameraMode), lat, lng].join('_') + '.png';
  }

  function _buildMetadata(ctx, t, filename) {
    return {
      app: 'WOS', capturedAtISO: t.iso, localLabel: t.local, filename: filename,
      map: { centerLng: ctx.center ? ctx.center.lng : null, centerLat: ctx.center ? ctx.center.lat : null, zoom: ctx.zoom, pitch: ctx.pitch, bearing: ctx.bearing },
      transportMode: ctx.transportMode, cameraMode: ctx.cameraMode, lensProfile: ctx.lensProfile, route: ctx.route,
      composition: 'mapbox_canvas',
      coordinateReturnHint: 'Paste lat,lng into destination or run _wos.debug.snapshot.recenter(lng, lat, zoom).',
    };
  }

  function _download(dataUrl, filename) {
    var doc = _doc();
    if (!doc || typeof doc.createElement !== 'function') return false;
    try {
      var a = doc.createElement('a'); a.href = dataUrl; a.download = filename;
      if (doc.body && doc.body.appendChild) { doc.body.appendChild(a); a.click(); doc.body.removeChild(a); }
      else a.click();
      return true;
    } catch (e) { return false; }
  }
  function _downloadJSON(obj, filename) {
    try { var blob = 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(obj, null, 2)); return _download(blob, filename); } catch (e) { return false; }
  }

  function _setClean(on) {
    var doc = _doc();
    if (!doc || !doc.body || !doc.body.classList) return;
    try { if (on) doc.body.classList.add(CLEAN_CLASS); else doc.body.classList.remove(CLEAN_CLASS); } catch (e) {}
  }

  // ── capturePNG(options) → Promise<result> ───────────────────────────────────
  function capturePNG(options) {
    options = options || {};
    var hideHUD = options.hideHUD !== false;
    var includeMeta = options.includeMetadata !== false;
    var download = options.download !== false;
    var prefix = options.filenamePrefix || 'WOS';

    var map = _map();
    if (!map || typeof map.getCanvas !== 'function') { _state.lastError = 'map_unavailable'; _stats.failures++; return Promise.resolve({ ok: false, reason: 'map_unavailable' }); }

    var t = _now();
    return new Promise(function (resolve) {
      function finish() {
        var ctx = _context();
        var filename = _filename(prefix, ctx, t);
        var dataUrl = null;
        try { var cv = map.getCanvas(); dataUrl = cv && cv.toDataURL ? cv.toDataURL('image/png') : null; } catch (e) { dataUrl = null; }
        if (hideHUD) _setClean(false);   // restore HUD immediately after read
        if (!dataUrl) { _state.lastError = 'canvas_capture_failed'; _stats.failures++; resolve({ ok: false, reason: 'canvas_capture_failed', filename: filename }); return; }
        var meta = includeMeta ? _buildMetadata(ctx, t, filename) : null;
        var dl = download ? _download(dataUrl, filename) : false;
        if (includeMeta) { if (download) _downloadJSON(meta, filename.replace(/\.png$/, '.json')); _stats.metadataWrites++; }
        _state.lastCaptureAt = Date.now(); _state.lastFilename = filename; _state.lastMetadata = meta; _state.lastError = null; _stats.captures++;
        if (_debug) console.log('[Snapshot]', filename, '| downloaded:', dl, '| meta:', !!meta);
        resolve({ ok: true, filename: filename, dataUrl: dataUrl, metadata: meta, downloaded: dl, composition: 'mapbox_canvas' });
      }
      if (hideHUD) _setClean(true);
      // Capture after a fresh render so the WebGL buffer is populated.
      var captured = false;
      function once() { if (captured) return; captured = true; finish(); }
      try {
        if (typeof map.once === 'function') { map.once('render', once); }
        if (typeof map.triggerRepaint === 'function') map.triggerRepaint();
        // Safety: capture anyway shortly after, in case no render event fires.
        if (typeof global.setTimeout === 'function') global.setTimeout(once, 60);
        else once();
      } catch (e) { once(); }
    });
  }

  function recenter(lng, lat, zoom) {
    _stats.recenters++;
    var map = _map();
    if (!map) { _state.lastError = 'map_unavailable'; return { ok: false, reason: 'map_unavailable' }; }
    var nlng = Number(lng), nlat = Number(lat);
    if (!isFinite(nlng) || !isFinite(nlat)) { _state.lastError = 'invalid_coordinates'; return { ok: false, reason: 'invalid_coordinates' }; }
    var opts = { center: [nlng, nlat] };
    if (isFinite(Number(zoom))) opts.zoom = Number(zoom);
    try { if (typeof map.easeTo === 'function') map.easeTo(opts); else if (typeof map.jumpTo === 'function') map.jumpTo(opts); } catch (e) { _state.lastError = 'recenter_failed'; return { ok: false, reason: 'recenter_failed' }; }
    return { ok: true, lng: nlng, lat: nlat, zoom: opts.zoom != null ? opts.zoom : null };
  }

  function svgStatus() { return { svgAvailable: false, reason: 'webgl_scene_not_vector_stable', note: 'Future: SVG overlay export only (not full 3D/terrain/WebGL scene).' }; }

  function setDebug(on) { _debug = on !== false; return _debug; }
  function getState() {
    return { version: VERSION, lastCaptureAt: _state.lastCaptureAt, lastFilename: _state.lastFilename,
      lastMetadata: _state.lastMetadata, composition: _state.composition, cleanClass: CLEAN_CLASS,
      svg: svgStatus(), mapAvailable: !!_map(), lastError: _state.lastError };
  }
  function getStats() { var o = {}; for (var k in _stats) o[k] = _stats[k]; return o; }

  SBE.RuntimeSnapshotCapture = Object.freeze({
    VERSION:    VERSION,
    capturePNG: capturePNG,
    recenter:   recenter,
    svgStatus:  svgStatus,
    getState:   getState,
    getStats:   getStats,
    setDebug:   setDebug,
  });

  console.log('[RuntimeSnapshotCapture] v' + VERSION + ' loaded (HUD-free PNG + metadata)');
})(window);
