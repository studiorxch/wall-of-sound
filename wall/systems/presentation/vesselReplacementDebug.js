// ── VesselReplacementDebug v1.0.0 ────────────────────────────────────────────
// 0527C_WOS_VesselReplacementPass_v1.0.0 — debug companion
// Status: active
// Classification: debug-companion — do NOT load in production
//
// Binds _wos.debug.vessels with:
//   classes()           — table of all active vessels with resolved class
//   sample()            — single vessel class resolution sample
//   debugLabels(bool)   — toggle showVesselClassDebug runtime flag
//   palette()           — print the full class color palette
//   tier(zoom)          — show which tier a given zoom level resolves to
//
// Placement: wall/systems/presentation/vesselReplacementDebug.js
// Load: AFTER main.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  global._wos       = global._wos       || {};
  global._wos.debug = global._wos.debug || {};

  var VERSION = '1.0.0';

  function _vcp() { return global.SBE && global.SBE.VesselClassPresentation; }
  function _ais() { return global.SBE && global.SBE.AISRuntime; }
  function _rf()  { return global.SBE && global.SBE.runtimeFlags; }

  function _pad(s, w) {
    s = String(s);
    while (s.length < w) s += ' ';
    return s;
  }

  // ── classes() ─────────────────────────────────────────────────────────────────
  // Print a table of all active vessels with their resolved class, confidence, tier.

  function classes() {
    var vcp     = _vcp();
    var ais     = _ais();

    if (!vcp) {
      console.warn('[VesselReplacementDebug] VesselClassPresentation not loaded');
      return [];
    }
    if (!ais || !ais.getActiveVessels) {
      console.warn('[VesselReplacementDebug] AISRuntime not available');
      return [];
    }

    var vessels = ais.getActiveVessels();
    var mvr     = global.SBE && global.SBE.MapboxViewportRuntime;
    var zoom    = mvr && mvr.getCamera ? (mvr.getCamera().zoom || 12) : 12;

    var rows = [];
    for (var i = 0; i < vessels.length; i++) {
      var v  = vessels[i];
      var cr = vcp.resolveVesselClass(v);
      var t  = vcp.resolveVesselRenderTier(v, zoom);
      rows.push({
        mmsi:     v.mmsi,
        name:     (v.vesselName || '').slice(0, 20),
        state:    (v.state || '').replace('STATUS_', ''),
        class:    cr.resolvedClass,
        confidence: cr.confidence,
        reason:   cr.reason.slice(0, 30),
        tier:     t,
        lenM:     v.lengthMeters || 0,
      });
    }

    console.group('[VesselReplacementDebug] classes() — ' + rows.length +
      ' vessels at zoom ' + zoom.toFixed(1));
    console.log(_pad('MMSI', 12) + _pad('NAME', 22) + _pad('STATE', 12) +
                _pad('CLASS', 14) + _pad('CONF', 12) + _pad('TIER', 18) + 'REASON');
    console.log('─'.repeat(100));
    for (var ri = 0; ri < rows.length; ri++) {
      var r = rows[ri];
      console.log(
        _pad(r.mmsi, 12)       + _pad(r.name, 22)       + _pad(r.state, 12) +
        _pad(r.class, 14)      + _pad(r.confidence, 12) + _pad(r.tier, 18)  + r.reason
      );
    }
    console.groupEnd();
    return rows;
  }

  // ── sample() ─────────────────────────────────────────────────────────────────
  // Resolve class for the first active vessel, print full profile.

  function sample() {
    var vcp = _vcp();
    var ais = _ais();

    if (!vcp) { console.warn('[VesselReplacementDebug] VesselClassPresentation not loaded'); return null; }
    if (!ais || !ais.getActiveVessels) { console.warn('[VesselReplacementDebug] AISRuntime not available'); return null; }

    var vessels = ais.getActiveVessels();
    if (!vessels.length) { console.log('[VesselReplacementDebug] no active vessels'); return null; }

    var mvr  = global.SBE && global.SBE.MapboxViewportRuntime;
    var zoom = mvr && mvr.getCamera ? (mvr.getCamera().zoom || 12) : 12;
    var v    = vessels[0];
    var prof = vcp.resolveVesselRenderProfile(v, zoom);

    console.group('[VesselReplacementDebug] sample() — MMSI ' + v.mmsi);
    console.log('name          :', v.vesselName || '(unnamed)');
    console.log('state         :', v.state);
    console.log('lenM / widM   :', (v.lengthMeters || 0) + ' / ' + (v.widthMeters || 0));
    console.log('resolvedClass :', prof.resolvedClass);
    console.log('confidence    :', prof.confidence);
    console.log('reason        :', prof.reason);
    console.log('tier          :', prof.tier);
    console.log('color         :', prof.color);
    console.log('strokeColor   :', prof.strokeColor);
    console.log('showDeckCue   :', prof.showDeckCue);
    console.groupEnd();

    return prof;
  }

  // ── debugLabels(bool) ─────────────────────────────────────────────────────────
  // Toggle SBE.runtimeFlags.showVesselClassDebug.
  // When true, marineRenderer draws class/confidence/tier labels on each vessel.

  function debugLabels(enabled) {
    var rf = _rf();
    if (!rf) {
      console.warn('[VesselReplacementDebug] SBE.runtimeFlags not available');
      return;
    }
    if (enabled === undefined) enabled = !rf.showVesselClassDebug;
    rf.showVesselClassDebug = !!enabled;
    console.log('[VesselReplacementDebug] showVesselClassDebug:', rf.showVesselClassDebug);
    console.log('  Labels show: class / confidence[0] / tier');
    console.log('  Example: cargo / c / mid-silhouette');
    return rf.showVesselClassDebug;
  }

  // ── palette() ─────────────────────────────────────────────────────────────────
  // Print the full class color palette with fill and stroke hex values.

  function palette() {
    var vcp = _vcp();
    if (!vcp) { console.warn('[VesselReplacementDebug] VesselClassPresentation not loaded'); return; }

    var pal = vcp.CLASS_PALETTE;
    console.group('[VesselReplacementDebug] palette() — ' + Object.keys(pal).length + ' classes');
    console.log(_pad('CLASS', 16) + _pad('FILL', 12) + 'STROKE');
    console.log('─'.repeat(42));
    Object.keys(pal).forEach(function (cls) {
      console.log(_pad(cls, 16) + _pad(pal[cls].fill, 12) + pal[cls].stroke);
    });
    console.groupEnd();
    return pal;
  }

  // ── tier(zoom) ────────────────────────────────────────────────────────────────
  // Show which render tier a zoom level resolves to.

  function tier(zoom) {
    var vcp = _vcp();
    if (!vcp) { console.warn('[VesselReplacementDebug] VesselClassPresentation not loaded'); return null; }

    var z = (zoom !== undefined) ? zoom : (function () {
      var mvr = global.SBE && global.SBE.MapboxViewportRuntime;
      return mvr && mvr.getCamera ? (mvr.getCamera().zoom || 12) : 12;
    })();

    var t = vcp.resolveVesselRenderTier({}, z);
    var tz = vcp.VESSEL_TIER_ZOOM;

    console.group('[VesselReplacementDebug] tier(zoom=' + z.toFixed(1) + ')');
    console.log('Resolved tier :', t);
    console.log('');
    console.log('Tier breakpoints:');
    console.log('  far_dot          zoom ≤', tz.farDotMaxZoom);
    console.log('  far_dash         zoom ≤', tz.farDashMaxZoom);
    console.log('  mid_silhouette   zoom ≤', tz.midSilhouetteMaxZoom);
    console.log('  near_topology    zoom ≤', tz.nearTopologyMaxZoom);
    console.log('  hero_topology    zoom  >', tz.nearTopologyMaxZoom);
    console.groupEnd();
    return t;
  }

  // ── Bind ──────────────────────────────────────────────────────────────────────

  global._wos.debug.vessels = {
    classes:     classes,
    sample:      sample,
    debugLabels: debugLabels,
    palette:     palette,
    tier:        tier,
  };

  console.log('[VesselReplacementDebug] v' + VERSION +
    ' ready — _wos.debug.vessels bound');
  console.log('  Commands: .classes() · .sample() · .debugLabels(bool) · .palette() · .tier(zoom)');

})(window);
