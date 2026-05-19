(function (global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  SBE.DocumentRegistry.register({
    type:   "canvas",
    label:  "Canvas",
    icon:   "◻",
    accent: "#a78bfa",

    capabilities: {
      simulation: false,
      drawing:    true,
      audio:      false,
      timeline:   false,
      geography:  false,
      export:     true,
    },

    panels: {
      lower:     "canvasLowerPanel",
      sidebar:   "canvasSidebar",
      inspector: "canvasInspector",
    },

    createDocument: function (options) {
      return {
        type:    "canvas",
        name:    options.name || "Canvas",
        runtime: null,
        data:    options.data || {},
        version: "0518A.1",
      };
    },
  });

})(window);
