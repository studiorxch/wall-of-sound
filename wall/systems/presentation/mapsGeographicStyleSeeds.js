// ── MapsGeographicStyleSeeds v1.0.0 ───────────────────────────────────────────
// 0729C_MAPS_Episode2_Durable_Seed; renamed from MapsPaletteSeeds by
// 0729D_MAPS_Vehicle_Overlay_Libraries_Foundation's terminology-migration gate.
// Status: active | Classification: presentation-authority / geographic-style-seed-data
//
// Durable seed data for the "Episode 2" Geographic Style — a rule-based,
// group/label-pattern-aware color assignment (not a hardcoded per-id map), so
// it produces correct, complete coverage against whatever the CURRENT live
// registry contains, regardless of exact layer ids or registry size. This is
// DATA, not UI code — no style colors live in palettesGallery.js/paletteDetail.js.
//
// Consumed once, by MapsGeographicStyleAuthority.init(), only when a fresh
// profile has no saved styles beyond Default. This makes Episode 2 durable/
// reproducible for any browser profile — it is no longer dependent on manual
// console authoring in one tester's session.
//
// Placement: wall/systems/presentation/mapsGeographicStyleSeeds.js
// Load: AFTER mapsGeographicStyleApplyAdapters.js, BEFORE mapsGeographicStyleAuthority.js.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  function _withAlphaFrom(currentValue, rgbTriple) {
    var m = /rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\s*\)/i.exec(currentValue || '');
    var alpha = m ? m[1] : '1';
    return 'rgba(' + rgbTriple + ',' + alpha + ')';
  }

  // Warm cinematic ember/amber/coral/maroon/charcoal direction (0729B §5),
  // preserving the original style's road-network prominence hierarchy and
  // water/land/route/HUD legibility, rather than one flat color per group.
  function episode2ColorFor(record) {
    var label = (record.label || '').toLowerCase();
    var group = record.group;

    if (group === 'Water' || /h2o/.test(label)) {
      if (/waterway/.test(label)) return /outline|shadow/.test(label) ? '#2e1a16' : '#3a2018';
      if (/depth/.test(label)) return /outline/.test(label) ? '#2e1a16' : '#1c1110';
      if (/outline|shadow/.test(label)) return '#2e1a16';
      return '#170d0e';
    }

    if (group === 'Land') {
      if (/park|pitch/.test(label)) return /outline/.test(label) ? '#6b6238' : '#4a4326';
      if (/structure/.test(label)) return /outline/.test(label) ? '#5a3d2c' : '#332218';
      if (/outline/.test(label)) return '#4a3226';
      return '#241a15';
    }

    if (group === 'Roads') {
      var isCase = /\bcase\b/.test(label);
      var isTunnel = /tunnel/.test(label);
      var isBridge = /bridge/.test(label);
      var isMotorwayTrunk = /motorway|trunk/.test(label);
      var isPrimary = /primary/.test(label);
      var isTurning = /turning/.test(label);
      if (isTurning) return isCase ? '#3a2820' : '#8a5a35';
      if (isCase) return isTunnel ? '#2e2018' : '#3a2820';
      if (isTunnel) return '#4a3528';
      if (isMotorwayTrunk) return isBridge ? '#b06a30' : '#c47838';
      if (isPrimary) return '#a8672f';
      if (isBridge) return '#8a5a35';
      if (/construction/.test(label)) return '#5a4030';
      return '#7a5030';
    }

    if (group === 'Labels') return /halo/.test(label) ? '#1a0d0a' : '#f0e0c8';

    if (group === 'Boundaries') return '#5a2f28';

    if (group === 'Base Map') {
      if (/hillshade/.test(label)) return '#1c130f';
      if (/contour/.test(label)) return '#3a2418';
      return '#0d0806';
    }

    if (group === 'Route') {
      if (/selection|handle/.test(label)) return '#ffdcb0';
      if (/panel|indicator|dot/.test(label)) return '#ff8c4a';
      return '#ff6a3d';
    }

    if (group === 'Vehicles') {
      if (/body/.test(label)) return '#c9432e';
      if (/roof/.test(label)) return '#5a1f18';
      if (/windshield/.test(label)) return '#f0e0c8';
      if (/rear.?glass/.test(label)) return '#c9a878';
      if (/chevron|heading/.test(label)) return '#ffb347';
      if (/headlight/.test(label)) return '#fff4d6';
      return '#c9432e';
    }

    if (group === 'HUD') {
      if (/live/.test(label)) return _withAlphaFrom(record.currentValue, '168,192,112');
      if (/stale/.test(label)) return _withAlphaFrom(record.currentValue, '217,162,74');
      if (/offline/.test(label)) return _withAlphaFrom(record.currentValue, '74,63,56');
      return _withAlphaFrom(record.currentValue, '232,216,192');
    }

    return record.currentValue;
  }

  // Returns { title, values } for every record in the given registry —
  // always exact schema coverage, whatever the registry's current size/ids are.
  //
  // episode2ColorFor() only makes sense for actual color records — it
  // pattern-matches group/label to a hex value. Opacity (0729_MAPS_Visual_
  // Property_Authority_Audit) and boolean records aren't colors at all;
  // running them through it produced a hex string in a numeric/boolean slot
  // (e.g. opacity "0.6" became "#241a15"). Neither has an Episode 2 creative
  // direction defined, so both pass through the record's own live-discovered
  // currentValue — the same neutral-fallback principle _migrateAgainst()
  // already uses for palettes that predate a property.
  function buildEpisode2Seed(registry) {
    var values = {};
    registry.forEach(function (r) {
      values[r.id] = (r.valueKind === 'opacity' || r.valueKind === 'boolean')
        ? r.currentValue
        : episode2ColorFor(r);
    });
    return { title: 'Episode 2', values: values };
  }

  SBE.MapsGeographicStyleSeeds = Object.freeze({
    buildEpisode2Seed: buildEpisode2Seed,
  });

  // Temporary compat alias (0729D terminology migration) — remove once
  // nothing references the old name. New code must use MapsGeographicStyleSeeds.
  SBE.MapsPaletteSeeds = SBE.MapsGeographicStyleSeeds;

  console.log('[MapsGeographicStyleSeeds] loaded');

})(window);
