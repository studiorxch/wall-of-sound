(function (global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  SBE.DocumentRegistry.register({
    type:   "world",
    label:  "World",
    icon:   "◎",
    accent: "#fb923c",

    capabilities: {
      simulation: true,
      drawing:    false,
      audio:      true,
      timeline:   true,
      geography:  true,
      export:     true,
    },

    panels: {
      lower:     "worldLowerPanel",
      sidebar:   "worldSidebar",
      inspector: "worldInspector",
    },

    createDocument: function (options) {
      return {
        type:    "world",
        name:    options.name || "World",
        runtime: "worldRuntime",
        data:    options.data || {},
        version: "0518A.1",
      };
    },
  });

})(window);
