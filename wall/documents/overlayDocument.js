(function (global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  SBE.DocumentRegistry.register({
    type:   "overlay",
    label:  "Overlay",
    icon:   "◈",
    accent: "#f472b6",

    capabilities: {
      simulation: false,
      drawing:    true,
      audio:      false,
      timeline:   false,
      geography:  true,
      export:     true,
    },

    panels: {
      lower:     "overlayLowerPanel",
      sidebar:   "overlaySidebar",
      inspector: "overlayInspector",
    },

    createDocument: function (options) {
      return {
        type:    "overlay",
        name:    options.name || "Overlay",
        runtime: null,
        data:    options.data || {},
        version: "0518G.1",
      };
    },
  });

})(window);
