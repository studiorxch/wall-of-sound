(function (global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  // ── RendererRegistry (0518A_WOS_DocumentRegistry_v1.0.0) ──────────────────
  // Maps renderer IDs to renderer descriptors. Renderers must never live inside
  // documents; all visualization logic resolves through this registry.

  var _registry = new Map();

  function register(descriptor) {
    if (!descriptor || !descriptor.id) {
      throw new Error("[RendererRegistry] descriptor missing required field: id");
    }
    if (_registry.has(descriptor.id)) {
      throw new Error("[RendererRegistry] duplicate renderer id: " + descriptor.id);
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

  SBE.RendererRegistry = { register: register, get: get, has: has, list: list };

})(window);
