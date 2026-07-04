(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});

  // ── WosPresentationModeState — presentation mode constants and state factory ──
  //
  // Presentation mode answers: "What are we showing?"
  // Transport mode answers:    "How are we moving?"
  //
  // These are separate systems. Do not pass presentation modes into selectTransport().
  //
  // Forbidden: selectTransport("card") / selectTransport("website")
  // Required:  SBE.WosPresentationRouter.selectPresentationMode("card")

  var PRESENTATION_MODES = Object.freeze({
    MAP:             'map',
    CARD:            'card',
    SPLIT:           'split',
    WEBSITE:         'website',
    CANVAS:          'canvas',
    KINETIC_FISH:    'kinetic_fish',
    EXTRACTED_THEME: 'extracted_theme'
  });

  function createDefaultPresentationState() {
    return {
      activeMode:      PRESENTATION_MODES.MAP,
      previousMode:    null,
      activeRenderer:  'map',
      missingRenderer: null,
      updatedAt:       null
    };
  }

  SBE.WosPresentationModeState = Object.freeze({
    MODES:         PRESENTATION_MODES,
    createDefault: createDefaultPresentationState
  });

})(window);
