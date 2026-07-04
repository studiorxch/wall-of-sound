(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});

  // ── WosMapStyleTokens — extract active map style identity for Orbital overlays ─
  //
  // Tokens are captured before Orbital entry and updated if the style changes.
  // Orbital overlays consume tokens — cyan is never hard-coded.
  //
  // WOS default style: mapbox://styles/studiorich/cm3goyx23003901qkb60ff29p
  // Default token set reflects current cyan presentation theme.

  var _WOS_DEFAULTS = Object.freeze({
    styleId:          'wos-default',
    accentColor:      '#00d7ff',
    secondaryColor:   '#1a5fa8',
    backgroundColor:  '#05080d',
    lineColor:        '#1a4a7a',
    routeColor:       '#28d4c8',
    hudColor:         '#d8f7ff',
    lineOpacity:      0.72,
    glowStrength:     0.35,
    grainStrength:    0.12,
    scanlineStrength: 0.10,
    // Orbital Earth readability tokens — clean defaults, FX panel is opt-in
    orbitalLineOpacity:       0.58,
    orbitalSurfaceBrightness: 0.45,
    orbitalAtmosphereOpacity: 0.22,  // soft rim glow only
    orbitalRimOpacity:        0.22,
    orbitalRimRadius:         84,    // narrow rim, close to edge
    orbitalStarOpacity:       0,     // off by default — opt-in via FX panel
    orbitalStarDensity:       8,
    orbitalHazeOpacity:       0,     // no center haze by default
    orbitalOriginOpacity:     0.60
  });

  var _current = Object.assign({}, _WOS_DEFAULTS);

  // ── capture — extract tokens from live Mapbox map object ─────────────────────

  function capture(map) {
    if (!map) { _current = Object.assign({}, _WOS_DEFAULTS); return _current; }

    var tokens = Object.assign({}, _WOS_DEFAULTS);

    try {
      // Style ID
      var style = map.getStyle && map.getStyle();
      if (style) {
        tokens.styleId = style.name || style.id || 'wos-default';
      }

      // Try to extract accent color from known WOS layer paint properties
      // WOS presentation style uses road/street layers with line-color
      var accentExtracted = false;
      if (style && style.layers) {
        for (var i = 0; i < style.layers.length; i++) {
          var layer = style.layers[i];
          // Look for primary road or street layer
          if (layer.type === 'line' && layer.paint) {
            var lc = layer.paint['line-color'];
            if (lc && typeof lc === 'string' && lc !== '#ffffff' && lc !== '#000000') {
              tokens.accentColor = lc;
              tokens.lineColor   = lc;
              accentExtracted = true;
              break;
            }
          }
        }
      }

      // If we couldn't extract, keep defaults (current WOS cyan)
      if (!accentExtracted) {
        tokens.accentColor = _WOS_DEFAULTS.accentColor;
        tokens.lineColor   = _WOS_DEFAULTS.lineColor;
      }

      // Try background color from background layer
      if (style && style.layers) {
        for (var j = 0; j < style.layers.length; j++) {
          var bl = style.layers[j];
          if (bl.type === 'background' && bl.paint && bl.paint['background-color']) {
            var bc = bl.paint['background-color'];
            if (typeof bc === 'string') { tokens.backgroundColor = bc; break; }
          }
        }
      }
    } catch (e) {
      // Style not accessible — keep defaults
    }

    _current = Object.freeze(tokens);
    return _current;
  }

  // ── getTokens / getLastTokens — returns last captured or default tokens ────────

  function getTokens() {
    return _current;
  }

  // Alias expected by QA console checks
  function getLastTokens() {
    return _current;
  }

  // ── toCssVars — returns a CSS custom-property string for injection ─────────────

  function toCssVars(tokens) {
    var t = tokens || _current;
    return [
      '--orb-accent:'        + t.accentColor              + ';',
      '--orb-secondary:'     + t.secondaryColor           + ';',
      '--orb-bg:'            + t.backgroundColor          + ';',
      '--orb-line:'          + t.lineColor                + ';',
      '--orb-route:'         + t.routeColor               + ';',
      '--orb-hud:'           + t.hudColor                 + ';',
      '--orb-glow:'          + t.glowStrength             + ';',
      '--orb-grain:'         + t.grainStrength            + ';',
      '--orb-line-opacity:'  + (t.orbitalLineOpacity       !== undefined ? t.orbitalLineOpacity       : 0.58) + ';',
      '--orb-brightness:'    + (t.orbitalSurfaceBrightness !== undefined ? t.orbitalSurfaceBrightness : 0.45) + ';',
      '--orb-atm-opacity:'   + (t.orbitalAtmosphereOpacity !== undefined ? t.orbitalAtmosphereOpacity : 0.18) + ';',
      '--orb-rim-opacity:'   + (t.orbitalRimOpacity        !== undefined ? t.orbitalRimOpacity        : 0.32) + ';',
      '--orb-rim-radius:'    + (t.orbitalRimRadius         !== undefined ? t.orbitalRimRadius         : 78)   + '%;',
      '--orb-star-opacity:'  + (t.orbitalStarOpacity       !== undefined ? t.orbitalStarOpacity       : 0)    + ';',
      '--orb-haze-opacity:'  + (t.orbitalHazeOpacity       !== undefined ? t.orbitalHazeOpacity       : 0)    + ';',
      '--orb-origin-opacity:'+ (t.orbitalOriginOpacity     !== undefined ? t.orbitalOriginOpacity     : 0.72) + ';'
    ].join(' ');
  }

  SBE.WosMapStyleTokens = Object.freeze({
    capture:       capture,
    getTokens:     getTokens,
    getLastTokens: getLastTokens,
    toCssVars:     toCssVars,
    DEFAULTS:      _WOS_DEFAULTS
  });

})(window);
