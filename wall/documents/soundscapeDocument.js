(function (global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  SBE.DocumentRegistry.register({
    type:   "soundscape",
    label:  "Soundscape",
    icon:   "♪",
    accent: "#34d399",

    capabilities: {
      simulation: false,
      drawing:    false,
      audio:      true,
      timeline:   true,
      geography:  false,
      export:     true,
    },

    panels: {
      lower:     "soundscapeLowerPanel",
      sidebar:   "soundscapeSidebar",
      inspector: "soundscapeInspector",
    },

    createDocument: function (options) {
      return {
        type:    "soundscape",
        name:    options.name || "Soundscape",
        runtime: null,
        data:    options.data || {},
        version: "0518A.1",
      };
    },
  });

})(window);
