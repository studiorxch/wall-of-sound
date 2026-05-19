(function (global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  SBE.DocumentRegistry.register({
    type:   "simulation",
    label:  "Simulation",
    icon:   "⬡",
    accent: "#22d3ee",

    capabilities: {
      simulation: true,
      drawing:    false,
      audio:      true,
      timeline:   true,
      geography:  true,
      export:     false,
    },

    panels: {
      lower:     "simulationLowerPanel",
      sidebar:   "simulationSidebar",
      inspector: "simulationInspector",
    },

    createDocument: function (options) {
      return {
        type:    "simulation",
        name:    options.name || "Simulation",
        runtime: null,
        data:    options.data || {},
        version: "0518G.1",
      };
    },
  });

})(window);
