// 0512_WOS_UniversalDrawerSystem_v1.0.0
// Drawer System — unified expandable drawer registry for WOS.
// Vanilla IIFE. Attaches to SBE.DrawerSystem.
// Load order: drawerSystem.js → glyphDrawer.js → samplerDrawer.js → libraryDrawer.js → controls.js
//
// ═══════════════════════════════════════════════════════════════════════════
// PRINCIPLE
//   toolbar = launchers
//   drawer  = system workspace
//
//   Drawers are temporary contextual systems.
//   They MUST NOT: directly mutate unrelated UI, reposition canvas,
//   create floating windows, or permanently occupy screen space.
//
// REGISTRATION
//   SBE.DrawerSystem.registerDrawer({
//     id:     "sampler",
//     title:  "Sampler",
//     side:   "right",
//     width:  420,           // px — sets --drawer-width CSS var
//     render:  fn(container),          // inject HTML — for stub/generated drawers
//     mount:   fn(container),          // move existing DOM node in — preferred
//     unmount: fn(container),          // move DOM node back out
//   });
//
// USAGE
//   SBE.DrawerSystem.openDrawer("sampler")  → opens drawer, calls mount/render
//   SBE.DrawerSystem.closeDrawer()          → closes active drawer, calls unmount
//   SBE.DrawerSystem.getActiveId()          → id string or null
//   SBE.DrawerSystem.getDrawer("sampler")   → drawer config or null
//   SBE.DrawerSystem.getAllDrawers()        → array of all registered drawers
//
// INPUT HANDLING (centralized — do not duplicate in controls.js)
//   • pointerdown outside drawer+rail  → closeDrawer()
//   • Escape key while drawer open     → closeDrawer()
// ═══════════════════════════════════════════════════════════════════════════

(function initDrawerSystem(global) {
  "use strict";

  const SBE = (global.SBE = global.SBE || {});

  const registry = {};
  var _activeId = null;

  // ── Width profiles ────────────────────────────────────────────────────────
  var DRAWER_WIDTHS = {
    narrow: 280,
    medium: 420,
    wide:   560,
    // "full" is computed at open time
  };

  function _resolveWidth(w) {
    if (!w) return DRAWER_WIDTHS.medium + "px";
    if (typeof w === "number") return w + "px";
    if (w === "full") {
      // Full = viewport minus inspector and launcher rail columns
      var iw = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--inspector-width"))   || 250;
      var lw = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--launcher-rail-width")) || 56;
      var lr = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--left-rail-width"))    || 50;
      return (window.innerWidth - iw - lw - lr) + "px";
    }
    return (DRAWER_WIDTHS[w] || DRAWER_WIDTHS.medium) + "px";
  }

  // ── Registry ──────────────────────────────────────────────────────────────

  function registerDrawer(config) {
    if (!config || !config.id) {
      console.warn("[DrawerSystem] registerDrawer: missing id", config);
      return;
    }
    registry[config.id] = config;
    console.log("[DrawerSystem] registered:", config.id, "—", config.title || "(untitled)");
  }

  function getDrawer(id) {
    return registry[id] || null;
  }

  function getAllDrawers() {
    return Object.values(registry);
  }

  function getActiveId() {
    return _activeId;
  }

  // ── Open / Close ──────────────────────────────────────────────────────────

  function openDrawer(id) {
    var panel   = document.getElementById("drawer-panel");
    var content = document.getElementById("drawer-content");
    if (!panel || !content) {
      console.warn("[DrawerSystem] openDrawer: #drawer-panel or #drawer-content not found");
      return;
    }

    // If a different drawer is open, tear it down first (content only, keep panel visible)
    if (_activeId !== null && _activeId !== id) {
      _doClose(panel, content, /* suppressPanelHide */ true);
    }

    var drawer = registry[id];
    if (!drawer) {
      console.warn("[DrawerSystem] openDrawer: no drawer registered for id:", id);
      return;
    }

    _activeId = id;
    _syncState(id);
    _syncLaunchers(id);
    _syncBodyClass(true);

    // Update --drawer-width CSS variable from registered width (resolves named profiles)
    document.documentElement.style.setProperty("--drawer-width", _resolveWidth(drawer.width));

    panel.classList.add("open");
    panel.removeAttribute("hidden");
    panel.setAttribute("aria-hidden", "false");

    // Activate backdrop
    _getBackdrop().classList.add("active");

    // Prefer mount() (DOM-move — preserves existing event listeners and IDs)
    // Fall back to render() (HTML injection — for stub/generated drawers)
    if (typeof drawer.mount === "function") {
      drawer.mount(content);
    } else if (typeof drawer.render === "function") {
      content.innerHTML = "";
      drawer.render(content);
    }

    console.log("[DrawerSystem] opened:", id);
  }

  function closeDrawer() {
    var panel   = document.getElementById("drawer-panel");
    var content = document.getElementById("drawer-content");
    if (!panel || !content) return;
    _doClose(panel, content, /* suppressPanelHide */ false);
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  function _doClose(panel, content, suppressPanelHide) {
    if (_activeId !== null) {
      var drawer = registry[_activeId];
      if (drawer && typeof drawer.unmount === "function") {
        drawer.unmount(content);
      } else {
        content.innerHTML = "";
      }
      console.log("[DrawerSystem] closed:", _activeId);
    }

    _activeId = null;
    _syncState(null);
    _syncLaunchers(null);
    _syncBodyClass(false);

    // Deactivate backdrop
    var backdrop = document.getElementById("drawer-backdrop-layer");
    if (backdrop) backdrop.classList.remove("active");

    if (!suppressPanelHide) {
      panel.classList.remove("open");
      panel.setAttribute("aria-hidden", "true");
    }
  }

  function _syncState(id) {
    var state = global._wos && global._wos.state;
    if (state && state.ui) state.ui.activeDrawer = id;
  }

  function _syncLaunchers(id) {
    document.querySelectorAll(".launcher-btn").forEach(function (btn) {
      btn.classList.toggle("active", btn.dataset.drawer === id);
    });
  }

  function _syncBodyClass(open) {
    if (open) {
      document.body.classList.add("drawer-is-open");
    } else {
      document.body.classList.remove("drawer-is-open");
    }
  }

  // Lazily creates the backdrop element once, appended to body.
  // The backdrop covers canvas only (right edge stops at launcher+inspector).
  // Clicking backdrop closes the drawer.
  function _getBackdrop() {
    var el = document.getElementById("drawer-backdrop-layer");
    if (!el) {
      el = document.createElement("div");
      el.id = "drawer-backdrop-layer";
      el.className = "drawer-backdrop-layer";
      el.addEventListener("pointerdown", function () {
        closeDrawer();
      });
      document.body.appendChild(el);
    }
    return el;
  }

  // ── Centralized input handling ─────────────────────────────────────────────
  // One listener owns outside-click and ESC — do not duplicate in controls.js.

  // Outside-click: close when clicking outside drawer panel and launcher rail.
  // Runs in capture phase so it fires before any stopPropagation inside the drawer.
  document.addEventListener("pointerdown", function (e) {
    if (_activeId === null) return;
    var panel = document.getElementById("drawer-panel");
    if (panel && panel.contains(e.target)) return;  // click inside drawer — keep open
    if (e.target.closest && e.target.closest(".launcher-btn")) return;  // click on launcher — handled by toggle

    // Respect per-drawer closeOnOutsideClick flag (default: true)
    var drawer = registry[_activeId];
    if (drawer && drawer.closeOnOutsideClick === false) return;

    closeDrawer();
  }, /* capture */ true);

  // ESC closes the active drawer.
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && _activeId !== null) {
      closeDrawer();
    }
  });

  // ── Public API ────────────────────────────────────────────────────────────

  SBE.DrawerSystem = {
    registerDrawer: registerDrawer,
    getDrawer:      getDrawer,
    getAllDrawers:  getAllDrawers,
    getActiveId:   getActiveId,
    openDrawer:    openDrawer,
    closeDrawer:   closeDrawer,
  };

  console.log("[WOS DrawerSystem] Loaded — Universal Drawer System v1.0.0");
})(window);
