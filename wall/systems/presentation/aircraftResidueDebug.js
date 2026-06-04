// ── AircraftResidueDebug v1.0.0 ───────────────────────────────────────────────
// 0528R_WOS_AircraftContrailAndNavLighting_v1.0.0 — debug companion
// Status: active
// Classification: debug-companion — do NOT load in production
//
// Binds _wos.debug.aircraftResidue with:
//   audit()           — full residue + atmospheric state report
//   contrails(bool)   — toggle contrail rendering
//   lights(bool)      — toggle nav light fog diffusion
//   clear()           — discard all active segments
//   density(v)        — set contrail visual density multiplier hint
//   lifespan(ms)      — override contrail lifespan for testing
//   glyphSeed(bool)   — enable glyph_seed residue type (future hook)
//
// Placement: wall/systems/presentation/aircraftResidueDebug.js
// Load: AFTER aircraftSkyResidueRenderer.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  global._wos       = global._wos       || {};
  global._wos.debug = global._wos.debug || {};

  var VERSION = '1.0.0';

  function _r() { return global.SBE && global.SBE.AircraftSkyResidueRenderer; }

  function _pad(s, w) {
    s = String(s);
    while (s.length < w) s += ' ';
    return s;
  }

  // ── audit() ───────────────────────────────────────────────────────────────────

  function audit() {
    var r = _r();
    if (!r) { console.warn('[AircraftResidueDebug] AircraftSkyResidueRenderer not loaded'); return; }

    var s    = r.getState();
    var acr  = global.SBE && global.SBE.AtmosphericContinuityRuntime;
    var atmo = acr ? acr.getState().atmosphere : null;

    console.group('[AircraftResidueDebug] audit()');

    console.log('── Renderer ────────────────────────────────────────');
    console.log('version         :', s.version);
    console.log('enabled         :', s.enabled);
    console.log('contrailsOn     :', s.contrailsOn);
    console.log('navLightsOn     :', s.navLightsOn);
    console.log('glyphSeedOn     :', s.glyphSeedOn, '(future)');

    console.log('');
    console.log('── Segments ────────────────────────────────────────');
    console.log('totalSegments   :', s.totalSegments, '/',
      s.caps.maxTotal, '  cap/aircraft:', s.caps.maxPerAircraft);

    var ids = Object.keys(s.segsByAircraft);
    if (ids.length === 0) {
      console.log('(no active contrails — fly at cruise altitude)');
    } else {
      ids.forEach(function (id) {
        console.log(' ', _pad(id, 22), s.segsByAircraft[id], 'segments');
      });
    }

    if (atmo) {
      console.log('');
      console.log('── Atmosphere ──────────────────────────────────────');
      console.log('fogDensity      :', atmo.fogDensity);
      console.log('hazeDensity     :', atmo.hazeDensity);
      console.log('pressure        :', atmo.pressureScalar);
      console.log('electric        :', atmo.electricalActivity);
      console.log('thermal         :', atmo.thermalDistortion);
      console.log('silence         :', atmo.silenceScalar);
    }

    console.log('');
    console.log('Quick test:');
    console.log('  .contrails(true)  .lights(true)  .clear()');
    console.log('  _wos.debug.regionalFlight.jump(0.5) to reach cruise');

    console.groupEnd();
    return s;
  }

  // ── contrails(bool) ───────────────────────────────────────────────────────────

  function contrails(val) {
    var r = _r();
    if (!r) { console.warn('[AircraftResidueDebug] renderer not loaded'); return; }
    if (val === undefined) {
      console.log('[AircraftResidueDebug] contrails:', r.getContrails() ? 'ON' : 'OFF');
      return r.getContrails();
    }
    r.setContrails(!!val);
    return !!val;
  }

  // ── lights(bool) ──────────────────────────────────────────────────────────────

  function lights(val) {
    var r = _r();
    if (!r) { console.warn('[AircraftResidueDebug] renderer not loaded'); return; }
    if (val === undefined) {
      console.log('[AircraftResidueDebug] navLights:', r.getNavLights() ? 'ON' : 'OFF');
      return r.getNavLights();
    }
    r.setNavLights(!!val);
    return !!val;
  }

  // ── clear() ───────────────────────────────────────────────────────────────────

  function clear() {
    var r = _r();
    if (!r) { console.warn('[AircraftResidueDebug] renderer not loaded'); return; }
    r.clearResidue();
  }

  // ── density(v) ────────────────────────────────────────────────────────────────
  // Approximated by toggling contrails + printing reminder.
  // Full density override is a future enhancement.

  function density(v) {
    console.log('[AircraftResidueDebug] density hint:', v,
      '— contrail opacity is driven by altitude + atmosphere. Use .contrails(false) to disable.');
  }

  // ── lifespan(ms) ──────────────────────────────────────────────────────────────
  // Lifespan is computed per-segment from cloud preset. This command prints
  // current effective values and hints for testing.

  function lifespan(ms) {
    var LIFE = { clear: 22000, thin: 30000, harbor_fog: 38000, storm_shelf: 45000 };
    if (ms === undefined) {
      console.group('[AircraftResidueDebug] contrail lifespan by preset');
      Object.keys(LIFE).forEach(function (k) {
        console.log(_pad(k, 14), Math.round(LIFE[k] / 1000) + 's');
      });
      console.log('Fog extends life (+25% at full pressure). Silence shortens (-40%).');
      console.groupEnd();
      return;
    }
    console.log('[AircraftResidueDebug] lifespan override not yet supported — segments use preset table.',
      'Requested:', ms + 'ms. Use _wos.debug.atmosphere.preset("storm_shelf") for long trails.');
  }

  // ── glyphSeed(bool) ───────────────────────────────────────────────────────────

  function glyphSeed(val) {
    var r = _r();
    if (!r) { console.warn('[AircraftResidueDebug] renderer not loaded'); return; }
    if (val === undefined) {
      console.log('[AircraftResidueDebug] glyphSeed:', r.getGlyphSeed() ? 'ON' : 'OFF',
        '(future GlyphLab hook — residueType:"glyph_seed" on new segments)');
      return r.getGlyphSeed();
    }
    r.setGlyphSeed(!!val);
    console.log('[AircraftResidueDebug] glyphSeed', !!val ? 'ON' : 'OFF',
      '— new segments will carry residueType:"glyph_seed"');
    return !!val;
  }

  // ── Bind ──────────────────────────────────────────────────────────────────────

  function _bind() {
    global._wos.debug.aircraftResidue = {
      audit:     audit,
      contrails: contrails,
      lights:    lights,
      clear:     clear,
      density:   density,
      lifespan:  lifespan,
      glyphSeed: glyphSeed,
    };
    console.log('[AircraftResidueDebug] v' + VERSION + ' ready — _wos.debug.aircraftResidue bound');
    console.log('  .audit()  .contrails(true)  .lights(true)  .clear()');
    console.log('  .glyphSeed(true)  — future GlyphLab residue hook');
  }

  _bind();

  var _attempts = 0;
  var _timer    = global.setInterval(function () {
    _attempts++;
    if (!global._wos || !global._wos.debug || !global._wos.debug.aircraftResidue) _bind();
    if (_attempts >= 20) global.clearInterval(_timer);
  }, 250);

})(window);
