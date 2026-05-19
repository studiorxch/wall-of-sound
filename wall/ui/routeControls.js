(function (global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  function init() {
    if (SBE.RoutePanel) SBE.RoutePanel.init();
    if (SBE.WorkspaceEventBus) {
      SBE.WorkspaceEventBus.on("surface:opened", function () {
        if (SBE.RoutePanel) SBE.RoutePanel.render();
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  SBE.RouteControls = { init: init };

})(window);
