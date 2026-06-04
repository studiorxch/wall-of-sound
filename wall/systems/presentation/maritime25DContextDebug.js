// ── Maritime25DContextDebug v1.0.0 ────────────────────────────────────────────
// 0527D_WOS_Maritime2_5DContextPass_v1.0.0 — debug companion
// Status: active
// Classification: debug-companion — do NOT load in production
//
// Binds _wos.debug.maritime25d with:
//   enabled(bool)   — toggle Maritime25DContext on/off
//   mode(str)       — set render mode: 'auto' | 'flat' | 'grounded'
//   tiers()         — show tier for every active vessel at current camera
//   shadows(bool)   — force-display shadow params for current camera
//   context(bool)   — toggle contextDepth reporting
//   audit()         — full 2.5D state report
//
// Placement: wall/systems/presentation/maritime25DContextDebug.js
// Load: AFTER main.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  global._wos       = global._wos       || {};
  global._wos.debug = global._wos.debug || {};

  var VERSION = '1.0.0';

  function _m25()  { return global.SBE && global.SBE.Maritime25DContext; }
  function _mvr()  { return global.SBE && global.SBE.MapboxViewportRuntime; }
  function _ais()  { return global.SBE && global.SBE.AISRuntime; }
  function _vcp()  { return global.SBE && global.SBE.VesselClassPresentation; }

  function _cam() {
    var mvr = _mvr();
    return (mvr && mvr.getCamera) ? mvr.getCamera() : { zoom: 12, pitch: 0, bearing: 0, center: [0, 0] };
  }

  function _pad(s, w) {
    s = String(s);
    while (s.length < w) s += ' ';
    return s;
  }

  // ── enabled(bool) ─────────────────────────────────────────────────────────────

  function enabled(val) {
    var m = _m25();
    if (!m) { console.warn('[Maritime25DContextDebug] Maritime25DContext not loaded'); return; }
    if (val === undefined) val = !m.getState().enabled;
    m.setEnabled(val);
    return m.getState().enabled;
  }

  // ── forceGrounded(bool) ───────────────────────────────────────────────────────
  // Forces ALL non-dot vessels through the geo-projected grounded hull path.
  // Use for screenshot testing: compare forceGrounded(true) vs forceGrounded(false).

  function forceGrounded(val) {
    var m = _m25();
    if (!m) { console.warn('[Maritime25DContextDebug] Maritime25DContext not loaded'); return; }
    if (val === undefined) val = !m.getState().forceGrounded;
    m.setForceGrounded(val);
    if (m.getState().forceGrounded) {
      console.log('[Maritime25DContextDebug] forceGrounded ON — all non-dot vessels use geo-projected hull');
      console.log('  Compare: _wos.debug.maritime25d.forceGrounded(false) to revert');
    } else {
      console.log('[Maritime25DContextDebug] forceGrounded OFF — normal tier-based routing restored');
    }
    return m.getState().forceGrounded;
  }

  // ── billboards(bool) ──────────────────────────────────────────────────────────
  // Suppress all screen-space vessel silhouettes — forces every non-dot vessel
  // through geo-projected grounded hull. Useful for verifying hull geometry and
  // ensuring correct water-plane alignment at any camera pitch.
  //
  // billboards(false) — suppress screen-space icons (all vessels grounded)
  // billboards(true)  — restore screen-space icons (normal tier-based routing)
  // billboards()      — toggle

  function billboards(val) {
    var m = _m25();
    if (!m) { console.warn('[Maritime25DContextDebug] Maritime25DContext not loaded'); return; }
    if (val === undefined) val = !m.getState().suppressBillboards;
    // billboards(false) = suppress = setSuppressBillboards(true)
    m.setSuppressBillboards(!val);
    var suppressed = m.getState().suppressBillboards;
    if (suppressed) {
      console.log('[Maritime25DContextDebug] billboards OFF — all non-dot vessels use geo-projected hull');
    } else {
      console.log('[Maritime25DContextDebug] billboards ON — screen-space silhouettes restored');
    }
    return !suppressed;
  }

  // ── groundedOnly(bool) ───────────────────────────────────────────────────────
  // Forces ALL non-dot non-far vessels through the geo-projected grounded hull
  // path regardless of pitch or tier. Equivalent to forceGrounded(true).
  //
  // groundedOnly(true)  — all vessels grounded
  // groundedOnly(false) — normal pitch-based routing restored
  // groundedOnly()      — toggle

  function groundedOnly(val) {
    var m = _m25();
    if (!m) { console.warn('[Maritime25DContextDebug] Maritime25DContext not loaded'); return; }
    if (val === undefined) val = !m.getState().forceGrounded;
    m.setForceGrounded(val);
    if (m.getState().forceGrounded) {
      console.log('[Maritime25DContextDebug] groundedOnly ON — all non-dot vessels use geo-projected hull');
      console.log('  Pitch irrelevant. Restore: _wos.debug.maritime25d.groundedOnly(false)');
    } else {
      console.log('[Maritime25DContextDebug] groundedOnly OFF — normal pitch-based routing restored');
    }
    return m.getState().forceGrounded;
  }

  // ── mode(str) ─────────────────────────────────────────────────────────────────

  function mode(str) {
    var m = _m25();
    if (!m) { console.warn('[Maritime25DContextDebug] Maritime25DContext not loaded'); return; }
    if (str === undefined) {
      console.log('[Maritime25DContextDebug] current mode:', m.getState().mode);
      console.log('  Options: auto | flat | grounded');
      return m.getState().mode;
    }
    m.setMode(str);
    return m.getState().mode;
  }

  // ── tiers() ───────────────────────────────────────────────────────────────────
  // Table of all active vessels with their current 2.5D tier + compressY.

  function tiers() {
    var m   = _m25();
    var ais = _ais();
    var vcp = _vcp();
    var cam = _cam();

    if (!m)   { console.warn('[Maritime25DContextDebug] Maritime25DContext not loaded'); return []; }
    if (!ais || !ais.getActiveVessels) { console.warn('[Maritime25DContextDebug] AISRuntime not available'); return []; }

    var vessels = ais.getActiveVessels();
    var rows = [];

    for (var i = 0; i < vessels.length; i++) {
      var v  = vessels[i];
      var cp = vcp ? vcp.resolveVesselRenderProfile(v, cam.zoom) : null;
      var p  = m.resolveVessel25DProfile(v, cam, cp);
      rows.push({
        mmsi:       v.mmsi,
        name:       (v.vesselName || '').slice(0, 18),
        cls:        cp ? cp.resolvedClass : '?',
        tier25d:    p.tier,
        compressY:  p.compressY.toFixed(3),
        distAlpha:  p.distanceAlpha.toFixed(3),
        shadow:     p.shadow.enabled ? (p.shadow.offsetX.toFixed(1) + ',' + p.shadow.offsetY.toFixed(1)) : 'off',
        grounded:   p.useGroundedHull ? 'Y' : 'N',
      });
    }

    console.group('[Maritime25DContextDebug] tiers() — ' + rows.length +
      ' vessels | zoom=' + (cam.zoom || 0).toFixed(1) +
      ' pitch=' + (cam.pitch || 0).toFixed(1) + '°' +
      ' bearing=' + (cam.bearing || 0).toFixed(1) + '°');
    console.log(
      _pad('MMSI', 12) + _pad('NAME', 20) + _pad('CLASS', 14) +
      _pad('25D-TIER', 22) + _pad('compY', 8) + _pad('dAlpha', 8) +
      _pad('shadow(x,y)', 14) + 'hull'
    );
    console.log('─'.repeat(104));
    for (var ri = 0; ri < rows.length; ri++) {
      var r = rows[ri];
      console.log(
        _pad(r.mmsi, 12)    + _pad(r.name, 20)    + _pad(r.cls, 14) +
        _pad(r.tier25d, 22) + _pad(r.compressY, 8) + _pad(r.distAlpha, 8) +
        _pad(r.shadow, 14)  + r.grounded
      );
    }
    console.groupEnd();
    return rows;
  }

  // ── renderMode() ─────────────────────────────────────────────────────────────
  // Prints the last-frame render branch for every active vessel:
  //   mmsi, lod (dot/capsule/shape/full), pitch, branch (geoHull|sprite|dot)
  //
  // 'geoHull' — vessel was rendered via _drawGroundedHull() (geo-projected, correct)
  // 'sprite'  — vessel was rendered as a screen-space silhouette (may stand upright)
  // 'dot'     — orientation-less dot (no grounding needed)

  function renderMode() {
    var mor = global.SBE && SBE.MarineRenderer;
    if (!mor || !mor.getRenderBranches) {
      console.warn('[Maritime25DContextDebug] MarineRenderer.getRenderBranches not available');
      return [];
    }
    var branches = mor.getRenderBranches();
    var cam      = _cam();

    console.group('[Maritime25DContextDebug] renderMode() — ' + branches.length +
      ' vessels | pitch=' + (cam.pitch || 0).toFixed(1) + '°');
    console.log(
      _pad('MMSI', 12) + _pad('LOD', 10) + _pad('pitch°', 8) + 'branch'
    );
    console.log('─'.repeat(48));

    var geoCount    = 0;
    var spriteCount = 0;
    var dotCount    = 0;

    for (var bi = 0; bi < branches.length; bi++) {
      var b = branches[bi];
      if (b.branch === 'geoHull') geoCount++;
      else if (b.branch === 'sprite') spriteCount++;
      else dotCount++;
      var flag = b.branch === 'sprite' ? ' ← SCREEN-SPACE (check pitch)' : '';
      console.log(
        _pad(b.mmsi, 12) + _pad(b.lod, 10) + _pad((b.pitch || 0).toFixed(1), 8) + b.branch + flag
      );
    }

    console.log('─'.repeat(48));
    console.log('geoHull: ' + geoCount + '  sprite: ' + spriteCount + '  dot: ' + dotCount);
    if (spriteCount > 0 && (cam.pitch || 0) >= 28) {
      console.warn('[Maritime25DContextDebug] ' + spriteCount + ' vessel(s) still sprite at pitch ' +
        (cam.pitch || 0).toFixed(1) + '° — expected 0. Check hard gate.');
    }
    console.groupEnd();
    return branches;
  }

  // ── visibleRenderer() ────────────────────────────────────────────────────────
  // Identifies which renderer(s) are actually drawing vessels and what branch each
  // vessel took: geoHull (correct), sprite (screen-space, bad at pitch), or dot.
  //
  // Queries both MarineRenderer.getRenderBranches() and
  // MaritimeOccupancyRenderer.getMORRenderBranches() to determine which is active.
  //
  // If both have 0 vessels: neither renderer is drawing — check isEnabled().
  // If only MOR has vessels: MOR is the active renderer (typical production setup).
  // If only MarineRenderer has vessels: MarineRenderer is active.
  // If both have vessels: both are rendering (may draw duplicate vessels).

  function visibleRenderer() {
    var cam     = _cam();
    var pitch   = (cam.pitch || 0);
    var morSys  = global.SBE && SBE.MaritimeOccupancyRenderer;
    var marSys  = global.SBE && SBE.MarineRenderer;

    var morBranches = (morSys && morSys.getMORRenderBranches) ? morSys.getMORRenderBranches() : null;
    var marBranches = (marSys && marSys.getRenderBranches)    ? marSys.getRenderBranches()    : null;

    var morCount = morBranches ? morBranches.length : 0;
    var marCount = marBranches ? marBranches.length : 0;

    // Branches that are screen-space oriented glyphs — bad at pitch >= 28°
    var _screenSpaceBranches = { sprite: 1, dot: 1 };

    function _branchSummary(branches) {
      var counts = { geoHull: 0, farDot: 0, sprite: 0, dot: 0, staticPin: 0, lightOnly: 0, other: 0 };
      if (!branches) return counts;
      for (var i = 0; i < branches.length; i++) {
        var br = branches[i].branch;
        if (counts[br] !== undefined) counts[br]++;
        else counts.other++;
      }
      return counts;
    }

    var morSum = _branchSummary(morBranches);
    var marSum = _branchSummary(marBranches);

    // Screen-space sprites at pitch >= 28 = bug
    var morBadSprites = (morSum.sprite || 0);
    var morBadDots    = (morSum.dot    || 0); // dot = underway chevron; still bad at pitch

    console.group('[Maritime25DContextDebug] visibleRenderer() — pitch=' + pitch.toFixed(1) + '°');

    if (morCount === 0 && marCount === 0) {
      console.warn('  NO vessels drawn by either renderer. Check .enabled() / .isEnabled().');
    } else {
      if (morCount > 0) {
        var morBugFlag = (pitch >= 28 && (morBadSprites + morBadDots) > 0)
          ? ' ← ' + (morBadSprites + morBadDots) + ' SCREEN-SPACE GLYPHS AT PITCH (bug)'
          : '';
        console.log('  MaritimeOccupancyRenderer: ' + morCount + ' vessels' + morBugFlag);
        console.log('    geoHull=' + morSum.geoHull + '  farDot=' + morSum.farDot +
          '  sprite=' + morSum.sprite + '  dot=' + morSum.dot +
          '  staticPin=' + morSum.staticPin + '  lightOnly=' + morSum.lightOnly);
      } else {
        console.log('  MaritimeOccupancyRenderer: not drawing vessels (0 branches)');
      }
      if (marCount > 0) {
        console.log('  MarineRenderer:            ' + marCount + ' vessels' +
          ' | geoHull=' + (marSum.geoHull || 0) + '  sprite=' + (marSum.sprite || 0) + '  dot=' + (marSum.dot || 0));
      } else {
        console.log('  MarineRenderer:            not drawing vessels (0 branches)');
      }
    }

    // Per-vessel table for whichever renderer is active
    var activeBranches = morCount > 0 ? morBranches : marBranches;
    var activeLabel    = morCount > 0 ? 'MOR' : 'MarineRenderer';
    if (activeBranches && activeBranches.length > 0) {
      console.log('');
      console.log('  ' + activeLabel + ' vessel detail:');
      console.log('  ' + _pad('MMSI', 14) + _pad('LOD', 10) + _pad('pitch°', 8) + 'branch');
      console.log('  ' + '─'.repeat(55));
      for (var bi = 0; bi < activeBranches.length; bi++) {
        var b    = activeBranches[bi];
        var bPitch = b.pitch || 0;
        var flag = (_screenSpaceBranches[b.branch] && bPitch >= 28)
          ? ' ← screen-space glyph at pitch (should be geoHull/farDot)'
          : '';
        console.log('  ' + _pad(b.mmsi, 14) + _pad(b.lod, 10) + _pad(bPitch.toFixed(1), 8) + b.branch + flag);
      }
    }

    console.groupEnd();
    return { morBranches: morBranches, marBranches: marBranches };
  }

  // ── sources() ────────────────────────────────────────────────────────────────
  // Print current vessel source toggle state and live vessel counts.

  function sources() {
    var rf  = global.SBE && global.SBE.runtimeFlags;
    var ais = global.SBE && global.SBE.AISRuntime;
    var mse = global.SBE && global.SBE.MaritimeSpawnEcology;
    var mor = global.SBE && global.SBE.MaritimeOccupancyRenderer;

    var showAIS = !rf || rf.showAISVessels !== false;
    var showSyn = !!(rf && rf.showSyntheticVessels === true);
    var showSeed= !!(rf && rf.showSeedVessels === true);

    var aisCount  = (ais && ais.getActiveVessels)          ? ais.getActiveVessels().length          : '?';
    var synCount  = (mse && mse.getActiveSyntheticVessels) ? mse.getActiveSyntheticVessels().length : '?';
    var snap      = (mor && mor.getDebugSnapshot)          ? mor.getDebugSnapshot()                 : null;
    var seedCount = snap ? snap.totalSeedVessels : '?';

    console.group('[Maritime25DContextDebug] sources()');
    console.log(_pad('source', 12) + _pad('enabled', 10) + 'live count');
    console.log('─'.repeat(34));
    console.log(_pad('ais',       12) + _pad(showAIS  ? 'ON' : 'OFF', 10) + aisCount);
    console.log(_pad('synthetic', 12) + _pad(showSyn  ? 'ON' : 'OFF', 10) + synCount);
    console.log(_pad('seed',      12) + _pad(showSeed ? 'ON' : 'OFF', 10) + seedCount);
    console.log('');
    console.log('Toggle: _wos.debug.maritime25d.source("ais"|"synthetic"|"seed", true|false)');
    console.groupEnd();

    return { ais: showAIS, synthetic: showSyn, seed: showSeed };
  }

  // ── source(name, val) ─────────────────────────────────────────────────────────
  // Toggle a vessel source on or off.
  // name: 'ais' | 'synthetic' | 'seed'
  // val:  true | false | undefined (toggle)

  function source(name, val) {
    var rf = global.SBE && global.SBE.runtimeFlags;
    if (!rf) {
      console.warn('[Maritime25DContextDebug] SBE.runtimeFlags not available');
      return;
    }

    var flagMap = { ais: 'showAISVessels', synthetic: 'showSyntheticVessels', seed: 'showSeedVessels' };
    var defaultOn = { ais: true, synthetic: false, seed: false };

    var flag = flagMap[(name || '').toLowerCase()];
    if (!flag) {
      console.warn('[Maritime25DContextDebug] Unknown source "' + name + '". Use: ais | synthetic | seed');
      return;
    }

    var current = (rf[flag] !== undefined) ? rf[flag] : defaultOn[name];
    if (val === undefined) val = !current;
    rf[flag] = !!val;

    console.log('[Maritime25DContextDebug] source("' + name + '") → ' + (rf[flag] ? 'ON' : 'OFF'));
    sources();
    return rf[flag];
  }

  // ── shadows(bool) ─────────────────────────────────────────────────────────────
  // Print shadow params for the current camera at each 2.5D tier.

  function shadows(show) {
    var m   = _m25();
    var cam = _cam();
    if (!m) { console.warn('[Maritime25DContextDebug] Maritime25DContext not loaded'); return; }

    var tiers25d = ['flat_symbol', 'grounded_silhouette', 'grounded_topology', 'compressed_far_mark'];
    console.group('[Maritime25DContextDebug] shadows() — pitch=' + (cam.pitch || 0).toFixed(1) + '° bearing=' + (cam.bearing || 0).toFixed(1) + '°');
    for (var ti = 0; ti < tiers25d.length; ti++) {
      var s = m.resolveWaterlineShadow(cam, tiers25d[ti]);
      console.log(
        _pad(tiers25d[ti], 26),
        s.enabled
          ? 'enabled  offsetX=' + s.offsetX.toFixed(2) + ' offsetY=' + s.offsetY.toFixed(2) + ' alpha=' + s.alpha.toFixed(3)
          : 'disabled'
      );
    }
    console.groupEnd();
  }

  // ── context(bool) ─────────────────────────────────────────────────────────────
  // Print harbor context depth overlay params for the current camera.
  // Shows what the overlay system would draw at the current pitch/bearing.

  function context(show) {
    var m   = _m25();
    var cam = _cam();
    if (!m) { console.warn('[Maritime25DContextDebug] Maritime25DContext not loaded'); return; }

    var pitch  = (cam && typeof cam.pitch === 'number') ? cam.pitch : 0;
    var tier   = m.resolve25DTier(cam);

    if (!m.resolveContextDepthOverlay) {
      console.log('[Maritime25DContextDebug] context depth factor:',
        Math.max(0, Math.min(1, (pitch - m.PITCH.flatMax) / 40)).toFixed(3),
        '| tier:', tier);
      return;
    }

    // Use a nominal 1280×720 canvas for printable values
    var ov = m.resolveContextDepthOverlay(cam, 1280, 720);

    console.group('[Maritime25DContextDebug] context() — pitch=' + pitch.toFixed(1) + '°');
    if (!ov) {
      console.log('overlay: inactive (pitch below threshold)');
    } else {
      console.log('depth factor         :', ov.depth.toFixed(3));
      console.log('horizonY (of 720)    :', ov.horizonY.toFixed(1) + 'px');
      console.log('haze band            : y=' + ov.haze.y.toFixed(0) + 'px height=' + ov.haze.height.toFixed(0) + 'px alpha=' + ov.haze.alpha.toFixed(3));
      console.log('shoreline stripe     : y=' + ov.stripe.y.toFixed(0) + 'px height=' + ov.stripe.height.toFixed(1) + 'px alpha=' + ov.stripe.alpha.toFixed(3));
      console.log('vignette             : alpha=' + ov.vignette.alpha.toFixed(3));
    }
    console.groupEnd();
    return ov;
  }

  // ── audit() ───────────────────────────────────────────────────────────────────
  // Full 2.5D state report.

  function audit() {
    var m   = _m25();
    var ais = _ais();
    var cam = _cam();

    if (!m) { console.warn('[Maritime25DContextDebug] Maritime25DContext not loaded'); return; }

    var state = m.getState();
    var tier  = m.resolve25DTier(cam);

    var vessels     = (ais && ais.getActiveVessels) ? ais.getActiveVessels() : [];
    var countFlat   = 0;
    var countGround = 0;
    var countMark   = 0;
    var vcp         = _vcp();

    for (var i = 0; i < vessels.length; i++) {
      var cp = vcp ? vcp.resolveVesselRenderProfile(vessels[i], cam.zoom) : null;
      var p  = m.resolveVessel25DProfile(vessels[i], cam, cp);
      if (p.tier === 'flat_symbol')                          countFlat++;
      else if (p.tier === 'compressed_far_mark')             countMark++;
      else                                                   countGround++;
    }

    var shadowSample = m.resolveWaterlineShadow(cam, tier);

    console.group('[Maritime25DContextDebug] audit()');
    console.log('── System ─────────────────────────────────────');
    console.log('enabled              :', state.enabled);
    console.log('mode                 :', state.mode);
    console.log('forceGrounded        :', state.forceGrounded);
    console.log('suppressBillboards   :', state.suppressBillboards);
    console.log('version              :', state.version);
    console.log('');
    console.log('── Camera ─────────────────────────────────────');
    console.log('zoom                 :', (cam.zoom    || 0).toFixed(2));
    console.log('pitch                :', (cam.pitch   || 0).toFixed(1) + '°');
    console.log('bearing              :', (cam.bearing || 0).toFixed(1) + '°');
    console.log('active 25D tier      :', tier);
    console.log('');
    console.log('── Vessels ────────────────────────────────────');
    console.log('total active         :', vessels.length);
    console.log('flat_symbol          :', countFlat);
    console.log('grounded (sil+topo)  :', countGround);
    console.log('compressed_far_mark  :', countMark);
    console.log('');
    console.log('── Shadow (current camera) ────────────────────');
    console.log('enabled              :', shadowSample.enabled);
    if (shadowSample.enabled) {
      console.log('offsetX              :', shadowSample.offsetX.toFixed(3));
      console.log('offsetY              :', shadowSample.offsetY.toFixed(3));
      console.log('alpha                :', shadowSample.alpha.toFixed(3));
    }
    console.log('');
    console.log('── Context Depth Overlay ──────────────────────');
    var overlayState = m.resolveContextDepthOverlay ? m.resolveContextDepthOverlay(cam, 1280, 720) : null;
    if (!overlayState) {
      console.log('overlay              : inactive (pitch ≤' + m.PITCH.groundedMin + '°)');
    } else {
      console.log('overlay              : active');
      console.log('depth factor         :', overlayState.depth.toFixed(3));
      console.log('horizonY (of 720)    :', overlayState.horizonY.toFixed(1) + 'px');
      console.log('haze alpha           :', overlayState.haze.alpha.toFixed(3));
      console.log('stripe alpha         :', overlayState.stripe.alpha.toFixed(3));
      console.log('vignette alpha       :', overlayState.vignette.alpha.toFixed(3));
    }
    console.log('');
    console.log('── Pitch Thresholds ───────────────────────────');
    console.log('flatMax              : ≤' + m.PITCH.flatMax + '°  → flat_symbol');
    console.log('groundedMin          : >' + m.PITCH.groundedMin + '° → grounded_silhouette + overlay');
    console.log('fullMin              : >' + m.PITCH.fullMin + '° → grounded_topology');
    console.log('horizonCullMin       : >' + m.PITCH.horizonCullMin + '° → above-horizon dash cull');
    console.groupEnd();
  }

  // ── visualMode(name?) ─────────────────────────────────────────────────────────
  // With no argument: report current VesselVisualProfile state.
  // With argument:    switch active palette (e.g. 'cinematic_harbor', 'high_contrast').

  function visualMode(name) {
    var vvp = global.SBE && global.SBE.VesselVisualProfile;
    if (!vvp) { console.warn('[Maritime25DContextDebug] VesselVisualProfile not loaded'); return; }

    if (name === undefined) {
      var s = vvp.getState();
      console.group('[Maritime25DContextDebug] visualMode() — VesselVisualProfile state');
      console.log('version         :', s.version);
      console.log('activePalette   :', s.activePalette);
      console.log('availablePalettes:', s.availablePalettes.join(', '));
      console.log('cacheSize       :', s.cacheSize, 'entries');
      console.log('cacheVersion    :', s.cacheVersion);
      console.log('');
      console.log('To switch: _wos.debug.maritime25d.palette("high_contrast")');
      console.groupEnd();
    } else {
      vvp.setPalette(String(name));
    }
  }

  // ── visualProfile(mmsi) ───────────────────────────────────────────────────────
  // Print the resolved VVP profile for a specific vessel by MMSI.
  // If no MMSI given, prints profiles for the first 5 active vessels.

  function visualProfile(mmsi) {
    var vvp = global.SBE && global.SBE.VesselVisualProfile;
    var ais = _ais();
    if (!vvp) { console.warn('[Maritime25DContextDebug] VesselVisualProfile not loaded'); return; }

    var vessels = (ais && ais.getActiveVessels) ? ais.getActiveVessels() : [];
    var cam     = _cam();

    if (mmsi !== undefined) {
      var found = null;
      for (var i = 0; i < vessels.length; i++) {
        if (String(vessels[i].mmsi) === String(mmsi)) { found = vessels[i]; break; }
      }
      if (!found) {
        console.warn('[Maritime25DContextDebug] visualProfile: MMSI ' + mmsi + ' not found in active vessels');
        return;
      }
      vessels = [found];
    } else {
      vessels = vessels.slice(0, 5);
    }

    console.group('[Maritime25DContextDebug] visualProfile(' + (mmsi !== undefined ? mmsi : 'first 5') + ')');
    for (var j = 0; j < vessels.length; j++) {
      var v = vessels[j];
      var vc = (v.vesselClass || v.shipType || 'UNKNOWN');
      var prof = vvp.resolveProfile(v, cam, { classKey: vc });
      console.group('MMSI ' + (v.mmsi || '?') + ' — class:' + vc + ' → key:' + prof.classKey);
      console.log('palette     :', prof.paletteUsed);
      console.log('hullColor   :', prof.hullColor);
      console.log('strokeColor :', prof.strokeColor);
      console.log('deckColor   :', prof.deckColor);
      console.log('accentColor :', prof.accentColor);
      console.log('detailTier  :', prof.detailTier, '(0=none, 1=centerline, 2=deck block)');
      console.log('fromCache   :', prof.fromCache);
      console.groupEnd();
    }
    console.groupEnd();
  }

  // ── palette(name?) ────────────────────────────────────────────────────────────
  // With no argument: list available palettes and show current.
  // With argument:    switch to named palette.

  function palette(name) {
    var vvp = global.SBE && global.SBE.VesselVisualProfile;
    if (!vvp) { console.warn('[Maritime25DContextDebug] VesselVisualProfile not loaded'); return; }

    if (name === undefined) {
      var avail = vvp.listPalettes();
      var cur   = vvp.getPalette();
      console.group('[Maritime25DContextDebug] palette()');
      console.log('active palette :', cur);
      console.log('available      :', avail.join(' | '));
      console.log('To switch      : _wos.debug.maritime25d.palette("high_contrast")');
      console.groupEnd();
    } else {
      var ok = vvp.setPalette(String(name));
      if (ok) {
        console.log('[Maritime25DContextDebug] palette → "' + name + '" — cache cleared, next frame uses new colors');
      }
    }
  }

  // ── Bind ──────────────────────────────────────────────────────────────────────

  function _bind() {
    global._wos       = global._wos       || {};
    global._wos.debug = global._wos.debug || {};
    global._wos.debug.maritime25d = {
      enabled:         enabled,
      mode:            mode,
      forceGrounded:   forceGrounded,
      groundedOnly:    groundedOnly,
      billboards:      billboards,
      renderMode:      renderMode,
      visibleRenderer: visibleRenderer,
      sources:         sources,
      source:          source,
      tiers:           tiers,
      shadows:         shadows,
      context:         context,
      audit:           audit,
      visualMode:      visualMode,
      visualProfile:   visualProfile,
      palette:         palette,
    };
    console.log('[Maritime25DContextDebug] v' + VERSION + ' ready — _wos.debug.maritime25d bound');
    console.log('  Commands: .enabled() · .mode() · .forceGrounded() · .groundedOnly() · .billboards() · .renderMode() · .visibleRenderer() · .sources() · .source(name,bool) · .tiers() · .shadows() · .context() · .audit() · .visualMode(name?) · .visualProfile(mmsi?) · .palette(name?)');
  }

  _bind();

  // Retry-safe — main.js may overwrite _wos after this script loads
  var _attempts = 0;
  var _timer = global.setInterval(function () {
    _attempts++;
    if (!global._wos || !global._wos.debug || !global._wos.debug.maritime25d) {
      _bind();
    }
    if (_attempts >= 20) global.clearInterval(_timer);
  }, 250);

})(window);
