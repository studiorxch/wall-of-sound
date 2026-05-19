(function (global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  SBE.DocumentRegistry.register({
    type:   "route",
    label:  "Route",
    icon:   "⬡",
    accent: "#4a9eff",

    capabilities: {
      simulation: true,
      drawing:    false,
      audio:      true,
      timeline:   true,
      geography:  true,
      export:     true,
    },

    panels: {
      lower:     "routeLowerPanel",
      sidebar:   "routeSidebar",
      inspector: "routeInspector",
    },

    createDocument: function (options) {
      return {
        type:    "route",
        name:    options.name || "Route",
        runtime: "routeWorld",
        data:    options.data || {},
        version: "0518A.1",
      };
    },
  });

})(window);
