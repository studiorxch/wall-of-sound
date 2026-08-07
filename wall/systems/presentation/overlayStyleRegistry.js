// ── OverlayStyleRegistry v1.0.0 ───────────────────────────────────────────────
// 0729D_MAPS_Vehicle_Overlay_Libraries_Foundation
// Status: active | Classification: presentation-authority / overlay-style-registry
//
// Overlays are individual, separately-named real records — NOT one vague
// "Appearance" or "Default Overlay Style" blob. Each real presentation
// system outside the geographic base gets its own record here, owning only
// its own real, cited controls:
//
//   1. Atmosphere Composite   — 1 boolean field (on/off), atmosphereComposite.js
//   2. Environmental Telemetry HUD — 4 color fields, environmentalTelemetryHUD.js
//   3. Now Playing HUD        — 0 fields, presentation-only/read-only, nowPlayingHud.js
//   4. Flight Data HUD        — 0 UI-wired fields this build (its one real
//                               control, setDisplayMode/getDisplayMode, stays
//                               owned solely by traversalHUD.js — no duplicate
//                               control surface is created here)
//
// discoverOverlays() returns already record-shaped data (grouping happens
// HERE, not in a later TypeScript consolidation step), matching
// vehicleStyleRegistry.js's pattern. hud.environmental.* and
// overlay.atmosphere-composite.enabled moved OUT of
// mapsGeographicStyleRegistry.js in this same build, per the spec's "do not
// force … HUD/overlay effects into Geographic Styles." Property ids are
// reused unchanged from the 0729C Visual Property Authority Audit
// (reclassification, not a rename).
//
// Cross-document availability: all 4 records always appear, in every
// document. Atmosphere Composite and Environmental Telemetry HUD are
// live-discovered from their actual loaded module (dormant-until-called,
// safe to load anywhere — see music/index.html). Now Playing HUD and
// Flight Data HUD are STATIC metadata records instead: nowPlayingHud.js and
// traversalHUD.js each self-initialize on DOMContentLoaded and inject a
// live DOM HUD panel, so their real source files are deliberately NOT
// loaded into MUSIC's own page (that would run a second copy of a live
// overlay inside the Library UI, the exact "second runtime" this whole
// build avoids elsewhere) — but the record itself is not gated on the
// module being loaded. Real source file + `runtimeActive` (computed from
// whether the module actually IS present on the current document) are
// cited honestly instead: `runtimeActive: true` only on the canonical LIVE
// MAP page where the script genuinely runs; `false` everywhere else,
// including MUSIC's Library, where the record is real documentation of a
// real running system, not a live control.
//
// Placement: wall/systems/presentation/overlayStyleRegistry.js
// Load: AFTER whichever of atmosphereComposite.js/environmentalTelemetryHUD.js
//       this document actually loads. BEFORE overlayStyleApplyAdapters.js.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  /**
   * @typedef {"color"|"boolean"} OverlayFieldValueKind
   *
   * @typedef {Object} OverlayFieldRecord
   * @property {string} propId
   * @property {string} roleLabel
   * @property {OverlayFieldValueKind} valueKind
   * @property {string} currentValue
   * @property {string} sourceObject
   * @property {string} sourceProperty
   *
   * @typedef {Object} OverlayRecord
   * @property {string} id
   * @property {string} label
   * @property {string} category
   * @property {string} sourceObject
   * @property {string} sourceLocation   real file path this record documents
   * @property {boolean} editable
   * @property {boolean} runtimeActive   true only where the source module is
   *                                     actually loaded/running on THIS
   *                                     document (canonical LIVE MAP for
   *                                     Now Playing/Flight Data HUD); the
   *                                     record itself is always real and
   *                                     always present regardless
   * @property {OverlayFieldRecord[]} fields
   */

  // ── 1. Atmosphere Composite — atmosphereComposite.js ──────────────────────
  function _discoverAtmosphereComposite() {
    var ac = SBE.AtmosphereComposite;
    if (!ac || typeof ac.init !== 'function') return null;
    var enabled = typeof document !== 'undefined' && !!document.getElementById('atmosphere-composite');
    return {
      id: 'overlay.atmosphere-composite',
      label: 'Atmosphere Composite',
      category: 'Atmosphere',
      sourceObject: 'AtmosphereComposite',
      sourceLocation: 'wall/render/atmosphereComposite.js',
      editable: true,
      runtimeActive: true,
      fields: [{
        propId: 'overlay.atmosphere-composite.enabled',
        roleLabel: 'Enabled',
        valueKind: 'boolean',
        currentValue: enabled ? 'true' : 'false',
        sourceObject: 'AtmosphereComposite',
        sourceProperty: 'enabled',
      }],
    };
  }

  // ── 2. Environmental Telemetry HUD — environmentalTelemetryHUD.js ────────
  var HUD_FIELD_DEFAULTS = {
    live: 'rgba(120,220,120,0.70)', stale: 'rgba(220,180,80,0.60)', offline: 'rgba(255,255,255,0.15)',
    text: 'rgba(255,255,255,0.45)',
  };
  var HUD_FIELD_LABELS = {
    live: 'Status — Live', stale: 'Status — Stale', offline: 'Status — Offline',
    text: 'Reality Row Text',
  };

  function _discoverEnvironmentalTelemetryHud() {
    var hud = SBE.EnvironmentalTelemetryHUD;
    if (!hud || typeof hud.getColors !== 'function') return null;
    var colors = hud.getColors();
    var fields = Object.keys(HUD_FIELD_DEFAULTS).map(function (key) {
      var value = (colors && colors[key]) || HUD_FIELD_DEFAULTS[key];
      return {
        propId: 'hud.environmental.' + key,
        roleLabel: HUD_FIELD_LABELS[key],
        valueKind: 'color',
        currentValue: value,
        sourceObject: 'EnvironmentalTelemetryHUD',
        sourceProperty: key,
      };
    });
    return {
      id: 'overlay.environmental-telemetry-hud',
      label: 'Environmental Telemetry HUD',
      category: 'HUD',
      sourceObject: 'EnvironmentalTelemetryHUD',
      sourceLocation: 'wall/render/environmentalTelemetryHUD.js',
      editable: true,
      runtimeActive: true,
      fields: fields,
    };
  }

  // ── 3. Now Playing HUD — nowPlayingHud.js ─────────────────────────────────
  // Presentation-only/read-only, per Canonical Runtime Ownership: this
  // module owns zero editable style fields (all CSS is inline literal,
  // confirmed by research) — catalogued honestly with editable: false and
  // an empty fields list, not a fabricated control.
  //
  // STATIC record — not gated on SBE.NowPlayingHud being loaded. Its real
  // source file is nowPlayingHud.js regardless of whether this document
  // loaded it; `runtimeActive` reports whether it's actually running HERE
  // (true only on canonical LIVE MAP, since MUSIC deliberately never loads
  // this self-initializing, DOM-injecting module).
  function _discoverNowPlayingHud() {
    return {
      id: 'overlay.now-playing-hud',
      label: 'Now Playing HUD',
      category: 'HUD',
      sourceObject: 'NowPlayingHud',
      sourceLocation: 'wall/systems/presentation/nowPlayingHud.js',
      editable: false,
      runtimeActive: !!SBE.NowPlayingHud,
      fields: [],
    };
  }

  // ── 4. Flight Data HUD — traversalHUD.js (canonical, unchanged owner) ─────
  // traversalHUD.js keeps sole ownership of its one real non-color control
  // (setDisplayMode/getDisplayMode) — no duplicate control surface is wired
  // here this build; this record exists so Flight Data HUD is honestly
  // listed as a real Overlay, not omitted.
  //
  // STATIC record — same reasoning as Now Playing HUD above: real source
  // file cited regardless of load state; `runtimeActive` reflects whether
  // traversalHUD.js is actually running on THIS document.
  function _discoverFlightDataHud() {
    return {
      id: 'overlay.flight-data-hud',
      label: 'Flight Data HUD',
      category: 'HUD',
      sourceObject: 'TraversalHUD',
      sourceLocation: 'wall/systems/presentation/traversalHUD.js',
      editable: false,
      runtimeActive: !!SBE.TraversalHUD,
      fields: [],
    };
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  // No fictional overlay records. Atmosphere Composite/Environmental
  // Telemetry HUD are gated on their module actually being loaded (both are
  // safe to load anywhere). Now Playing HUD/Flight Data HUD are static real
  // records regardless of load state — see their runtimeActive field.
  function discoverOverlays() {
    var records = [];
    var candidates = [
      _discoverAtmosphereComposite(),
      _discoverEnvironmentalTelemetryHud(),
      _discoverNowPlayingHud(),
      _discoverFlightDataHud(),
    ];
    candidates.forEach(function (r) { if (r) records.push(r); });
    return records;
  }

  SBE.OverlayStyleRegistry = Object.freeze({
    VERSION: VERSION,
    discoverOverlays: discoverOverlays,
  });

  console.log('[OverlayStyleRegistry] v' + VERSION + ' loaded');

})(window);
