(function (global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  // ── ID utility (0518F_WOS_RouteDocumentPersistence_v1.0.0) ────────────────
  // UUID v4 generator. Uses crypto.randomUUID() when available, falls back to
  // a Math.random()-based implementation for environments that lack it.

  function create() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    // RFC 4122 v4 fallback
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  SBE.ID = { create: create };

})(window);
