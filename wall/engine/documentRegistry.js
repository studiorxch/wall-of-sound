(function (global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  // ── DocumentRegistry (0518A_WOS_DocumentRegistry_v1.0.0) ──────────────────
  // Canonical source for document type metadata, runtime bindings, renderer
  // bindings, and capability flags. All document-type logic resolves here —
  // never through hardcoded `if (doc.type === …)` branches.

  var _registry = new Map();

  function register(descriptor) {
    if (!descriptor || !descriptor.type) {
      throw new Error("[DocumentRegistry] descriptor missing required field: type");
    }
    if (_registry.has(descriptor.type)) {
      throw new Error("[DocumentRegistry] duplicate document type: " + descriptor.type);
    }
    _registry.set(descriptor.type, Object.freeze(descriptor));
  }

  function get(type) {
    return _registry.get(type) || null;
  }

  function has(type) {
    return _registry.has(type);
  }

  function list() {
    return Array.from(_registry.values());
  }

  function create(type, options) {
    var descriptor = get(type);
    if (!descriptor) {
      throw new Error("[DocumentRegistry] unknown document type: " + type);
    }
    if (typeof descriptor.createDocument !== "function") {
      throw new Error("[DocumentRegistry] descriptor missing createDocument(): " + type);
    }
    return descriptor.createDocument(options || {});
  }

  SBE.DocumentRegistry = { register: register, get: get, has: has, list: list, create: create };

})(window);
