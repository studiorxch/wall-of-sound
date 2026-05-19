(function (global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  // ── ZonesPanel (0520_WOS_WorldRuntimeArchitecture_v1.0.0) ─────────────────
  // Renders the Zones sidebar panel into #zones-panel-content.
  // Shows zone list from WorldRuntime with add/delete controls.
  // Zone polygons are authored via the map (future: zone-edit interaction mode).

  var _container = null;

  function init() {
    _container = document.getElementById("zones-panel-content");
    if (!_container) return;

    // Re-render on zone changes
    var bus = SBE.WorkspaceEventBus;
    if (bus) {
      bus.on("world:zoneCreated", render);
      bus.on("world:zoneDeleted", render);
      bus.on("world:zoneChanged", render);
    }

    render();
    console.log("[ZonesPanel] initialized");
  }

  function render() {
    if (!_container) return;
    _container.innerHTML = "";

    var wr    = SBE.WorldRuntime;
    var ws    = SBE.Workspace;
    var zones = wr ? wr.getZones() : [];

    // ── Header ──────────────────────────────────────────────────────────────
    var header = document.createElement("div");
    header.className = "zone-panel-header";
    header.innerHTML =
      '<span class="zone-panel-title">Zones</span>' +
      '<button class="zone-add-btn" title="Create zone">+</button>';
    header.querySelector(".zone-add-btn").addEventListener("click", function () {
      if (!wr) return;
      var name = "Zone " + (zones.length + 1);
      wr.createZone({ name: name });
    });
    _container.appendChild(header);

    // ── Active world ─────────────────────────────────────────────────────────
    var world = wr ? wr.getActiveWorld() : null;
    if (world) {
      var worldRow = document.createElement("div");
      worldRow.className = "zone-world-row";
      worldRow.innerHTML =
        '<span class="zone-world-icon">◎</span>' +
        '<span class="zone-world-name">' + _esc(world.name) + '</span>';
      _container.appendChild(worldRow);
    }

    // ── Zone list ─────────────────────────────────────────────────────────────
    if (zones.length === 0) {
      var empty = document.createElement("div");
      empty.className = "zone-empty";
      empty.textContent = "No zones. Create a zone to define\na region inside the world.";
      _container.appendChild(empty);
    } else {
      var list = document.createElement("div");
      list.className = "zone-list";
      zones.forEach(function (zone) {
        list.appendChild(_makeZoneItem(zone));
      });
      _container.appendChild(list);
    }

    // ── Layer list ────────────────────────────────────────────────────────────
    var layers = wr ? wr.getLayers() : [];
    if (layers.length > 0) {
      var layerHeader = document.createElement("div");
      layerHeader.className = "zone-section-label";
      layerHeader.textContent = "System Layers";
      _container.appendChild(layerHeader);

      var layerList = document.createElement("div");
      layerList.className = "zone-layer-list";
      layers.forEach(function (layer) {
        var item = document.createElement("div");
        item.className = "zone-layer-item";

        var visBtn = document.createElement("button");
        visBtn.className = "zone-layer-vis" + (layer.visible ? "" : " zone-layer-vis--hidden");
        visBtn.textContent = layer.visible ? "◉" : "◎";
        visBtn.title = layer.visible ? "Hide layer" : "Show layer";
        visBtn.addEventListener("click", function () {
          if (wr) wr.setLayerVisible(layer.id, !layer.visible);
          render();
        });

        var nameEl = document.createElement("span");
        nameEl.className = "zone-layer-name";
        nameEl.textContent = layer.name;

        var typeEl = document.createElement("span");
        typeEl.className = "zone-layer-type";
        typeEl.textContent = layer.type;

        item.appendChild(visBtn);
        item.appendChild(nameEl);
        item.appendChild(typeEl);
        layerList.appendChild(item);
      });
      _container.appendChild(layerList);
    }
  }

  function _makeZoneItem(zone) {
    var item = document.createElement("div");
    item.className = "zone-item" + (!zone.visible ? " zone-item--hidden" : "");

    var header = document.createElement("div");
    header.className = "zone-item-header";

    var dot = document.createElement("span");
    dot.className = "zone-dot";

    var name = document.createElement("span");
    name.className = "zone-item-name";
    name.textContent = zone.name;

    var controls = document.createElement("div");
    controls.className = "zone-item-controls";

    var visBtn = document.createElement("button");
    visBtn.className = "zone-icon-btn";
    visBtn.textContent = zone.visible ? "◉" : "◎";
    visBtn.title = zone.visible ? "Hide" : "Show";
    visBtn.addEventListener("click", function () {
      if (SBE.WorldRuntime) SBE.WorldRuntime.updateZone(zone.id, { visible: !zone.visible });
      render();
    });

    var delBtn = document.createElement("button");
    delBtn.className = "zone-icon-btn";
    delBtn.textContent = "×";
    delBtn.title = "Delete zone";
    delBtn.addEventListener("click", function () {
      if (SBE.WorldRuntime) SBE.WorldRuntime.deleteZone(zone.id);
    });

    controls.appendChild(visBtn);
    controls.appendChild(delBtn);
    header.appendChild(dot);
    header.appendChild(name);
    header.appendChild(controls);
    item.appendChild(header);

    if (zone.polygon) {
      var info = document.createElement("div");
      info.className = "zone-item-info";
      info.textContent = "polygon · " + (zone.systems.length || 0) + " systems";
      item.appendChild(info);
    } else {
      var noGeo = document.createElement("div");
      noGeo.className = "zone-item-info";
      noGeo.textContent = "no polygon — switch to zone-edit to draw";
      item.appendChild(noGeo);
    }

    return item;
  }

  function _esc(str) {
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  SBE.ZonesPanel = { init: init, render: render };

  // Auto-init after DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})(window);
