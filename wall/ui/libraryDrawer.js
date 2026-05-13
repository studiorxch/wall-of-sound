// 0512_WOS_UniversalDrawerSystem_v1.0.0
// Library Drawer — mounts the existing #overlay-view-library into the drawer runtime.
// Vanilla IIFE. Registers with SBE.DrawerSystem.
// Load order: drawerSystem.js → libraryDrawer.js → controls.js
//
// Uses DOM-move pattern: mount() physically relocates #overlay-view-library
// into the drawer container so all existing IDs and event listeners are preserved.
// unmount() returns it to #overlay-panel__body for context-menu compatibility.

(function initLibraryDrawer(global) {
  "use strict";

  const SBE = (global.SBE = global.SBE || {});

  var OVERLAY_VIEW_ID = "overlay-view-library";

  // ── Mount ─────────────────────────────────────────────────────────────────

  function mount(container) {
    var el = document.getElementById(OVERLAY_VIEW_ID);
    if (!el) {
      container.innerHTML = '<div class="drawer-view"><div class="drawer-view__body"><p class="drawer-hint" style="opacity:0.4;">Library view not found.</p></div></div>';
      return;
    }

    var wrapper = document.createElement("div");
    wrapper.className = "drawer-view";
    wrapper.id = "drawer-library-wrapper";

    var header = document.createElement("div");
    header.className = "drawer-view__header";
    header.innerHTML = '<span class="drawer-view__title">Library</span>';

    var body = document.createElement("div");
    body.className = "drawer-view__body";

    el.style.display = "";
    body.appendChild(el);
    wrapper.appendChild(header);
    wrapper.appendChild(body);
    container.appendChild(wrapper);
  }

  // ── Unmount ───────────────────────────────────────────────────────────────

  function unmount(container) {
    var el = document.getElementById(OVERLAY_VIEW_ID);
    if (!el) return;

    el.style.display = "none";

    var originalParent = document.querySelector(".overlay-panel__body");
    if (originalParent) {
      originalParent.appendChild(el);
    }

    container.innerHTML = "";
  }

  // ── Registration ──────────────────────────────────────────────────────────

  SBE.DrawerSystem.registerDrawer({
    id:      "library",
    title:   "Library",
    side:    "right",
    width:   420,
    mount:   mount,
    unmount: unmount,
  });

})(window);
