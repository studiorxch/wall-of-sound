(function (global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  // ── RuntimeRegistry (0518A_WOS_DocumentRegistry_v1.0.0) ───────────────────
  // Maps runtime IDs to factory descriptors. Documents reference a runtime ID;
  // RuntimeManager resolves the factory here at attach time.

  var _registry = new Map();

  function register(descriptor) {
    if (!descriptor || !descriptor.id) {
      throw new Error("[RuntimeRegistry] descriptor missing required field: id");
    }
    if (_registry.has(descriptor.id)) {
      throw new Error("[RuntimeRegistry] duplicate runtime id: " + descriptor.id);
    }
    _registry.set(descriptor.id, Object.freeze(descriptor));
  }

  function get(id) {
    return _registry.get(id) || null;
  }

  function has(id) {
    return _registry.has(id);
  }

  function list() {
    return Array.from(_registry.values());
  }

  SBE.RuntimeRegistry = { register: register, get: get, has: has, list: list };

})(window);
