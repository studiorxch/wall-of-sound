(function (global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  SBE.DocumentRegistry.register({
    type:   "media",
    label:  "Media",
    icon:   "▣",
    accent: "#a78bfa",

    capabilities: {
      simulation: false,
      drawing:    true,
      audio:      false,
      timeline:   true,
      geography:  false,
      export:     true,
    },

    panels: {
      lower:     "mediaLowerPanel",
      sidebar:   "mediaSidebar",
      inspector: "mediaInspector",
    },

    createDocument: function (options) {
      return {
        type:    "media",
        name:    options.name || "Media",
        runtime: null,
        data:    options.data || {},
        version: "0518G.1",
      };
    },
  });

})(window);
