(function (global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  var _container = null;

  // ── Geocoding ──────────────────────────────────────────────────────────────
  function _geocode(query) {
    var token = global.mapboxgl && global.mapboxgl.accessToken;
    if (!token || !query) return Promise.resolve(null);
    var url = "https://api.mapbox.com/geocoding/v5/mapbox.places/" +
              encodeURIComponent(query) + ".json?access_token=" + token + "&limit=1";
    return fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.features && data.features[0]) {
          var f = data.features[0];
          return {
            name: f.place_name,
            longitude: f.center[0],
            latitude: f.center[1]
          };
        }
        return null;
      })
      .catch(function () { return null; });
  }

  // ── Stop field resolve ─────────────────────────────────────────────────────
  function _makeStopFromInput(val, fallback) {
    if (val && val._resolved) return Promise.resolve(val._resolved);
    return _geocode(val).then(function (geo) {
      if (geo) return geo;
      return fallback || { name: val || "", longitude: 0, latitude: 0 };
    });
  }

  // ── Render helpers ─────────────────────────────────────────────────────────
  function _icon(label, title) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "route-icon-btn";
    b.title = title || label;
    b.textContent = label;
    return b;
  }

  function _renderRouteList(list, routes) {
    list.innerHTML = "";
    if (!routes.length) {
      var empty = document.createElement("div");
      empty.className = "route-empty";
      empty.textContent = "No routes yet.";
      list.appendChild(empty);
      return;
    }
    routes.forEach(function (route) {
      var item = document.createElement("div");
      item.className = "route-item" + (route.locked ? " route-item--locked" : "");

      var header = document.createElement("div");
      header.className = "route-item-header";

      var dot = document.createElement("span");
      dot.className = "route-dot";
      dot.style.background = route.visible ? "#3dd8c5" : "rgba(255,255,255,0.2)";

      var nameEl = document.createElement("span");
      nameEl.className = "route-item-name";
      nameEl.textContent = route.name;

      var controls = document.createElement("div");
      controls.className = "route-item-controls";

      var eyeBtn = _icon(route.visible ? "◉" : "○", route.visible ? "Hide" : "Show");
      eyeBtn.addEventListener("click", function () {
        SBE.RouteInputSystem.setVisible(route.id, !route.visible);
      });

      var lockBtn = _icon(route.locked ? "🔒" : "🔓", route.locked ? "Unlock" : "Lock");
      lockBtn.addEventListener("click", function () {
        SBE.RouteInputSystem.setLocked(route.id, !route.locked);
      });

      var fitBtn = _icon("⊡", "Fit to view");
      fitBtn.addEventListener("click", function () {
        SBE.RouteInputSystem.fitRoute(route.id);
      });

      var delBtn = _icon("✕", "Delete route");
      delBtn.addEventListener("click", function () {
        if (confirm("Delete route \"" + route.name + "\"?")) {
          SBE.RouteInputSystem.deleteRoute(route.id);
        }
      });

      controls.appendChild(eyeBtn);
      controls.appendChild(lockBtn);
      controls.appendChild(fitBtn);
      controls.appendChild(delBtn);

      header.appendChild(dot);
      header.appendChild(nameEl);
      header.appendChild(controls);

      var info = document.createElement("div");
      info.className = "route-item-info";
      var originName = route.origin && route.origin.name ? route.origin.name : "Origin";
      var destName = route.destination && route.destination.name ? route.destination.name : "Destination";
      var km = route.metadata.distanceKm || 0;
      var min = route.metadata.durationMinutes || 0;
      info.textContent = originName + " → " + destName + (km ? " · " + km + " km · " + min + " min" : "");

      item.appendChild(header);
      item.appendChild(info);

      if (route.stops.length) {
        var expand = document.createElement("details");
        expand.className = "route-stops-expand";
        var summary = document.createElement("summary");
        summary.textContent = route.stops.length + " stop" + (route.stops.length !== 1 ? "s" : "");
        expand.appendChild(summary);
        route.stops.forEach(function (stop, idx) {
          var stopRow = document.createElement("div");
          stopRow.className = "route-stop-entry";
          var stopName = document.createElement("span");
          stopName.textContent = (idx + 1) + ". " + (stop.name || "Stop");
          var removeBtn = _icon("✕", "Remove stop");
          removeBtn.addEventListener("click", function () {
            SBE.RouteInputSystem.removeStop(route.id, stop.id);
          });
          stopRow.appendChild(stopName);
          stopRow.appendChild(removeBtn);
          expand.appendChild(stopRow);
        });
        item.appendChild(expand);
      }

      list.appendChild(item);
    });
  }

  // ── Main render ────────────────────────────────────────────────────────────
  function render() {
    if (!_container) return;
    var routes = SBE.RouteInputSystem ? SBE.RouteInputSystem.getRoutes() : [];

    // Preserve existing input values across re-renders
    var prevOrigin = _container.querySelector("#route-origin-input");
    var prevDest = _container.querySelector("#route-dest-input");
    var prevName = _container.querySelector("#route-name-input");
    var savedOrigin = prevOrigin ? prevOrigin.value : "";
    var savedDest = prevDest ? prevDest.value : "";
    var savedName = prevName ? prevName.value : "";
    var savedOriginResolved = prevOrigin && prevOrigin._resolved;
    var savedDestResolved = prevDest && prevDest._resolved;

    _container.innerHTML = "";

    var panel = document.createElement("div");
    panel.className = "route-panel";

    // ── Input section ────────────────────────────────────────────────────────
    var inputSec = document.createElement("div");
    inputSec.className = "route-input-section";

    var nameGroup = document.createElement("div");
    nameGroup.className = "route-field-group";
    var nameLbl = document.createElement("label");
    nameLbl.textContent = "Name";
    var nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.id = "route-name-input";
    nameInput.placeholder = "Route name…";
    nameInput.value = savedName || "Route " + (routes.length + 1);
    nameGroup.appendChild(nameLbl);
    nameGroup.appendChild(nameInput);

    var originGroup = document.createElement("div");
    originGroup.className = "route-field-group";
    var originLbl = document.createElement("label");
    originLbl.textContent = "Origin";
    var originInput = document.createElement("input");
    originInput.type = "text";
    originInput.id = "route-origin-input";
    originInput.placeholder = "Address or place…";
    originInput.value = savedOrigin;
    if (savedOriginResolved) originInput._resolved = savedOriginResolved;
    originInput.addEventListener("change", function () {
      originInput._resolved = null;
    });
    originGroup.appendChild(originLbl);
    originGroup.appendChild(originInput);

    var destGroup = document.createElement("div");
    destGroup.className = "route-field-group";
    var destLbl = document.createElement("label");
    destLbl.textContent = "Destination";
    var destInput = document.createElement("input");
    destInput.type = "text";
    destInput.id = "route-dest-input";
    destInput.placeholder = "Address or place…";
    destInput.value = savedDest;
    if (savedDestResolved) destInput._resolved = savedDestResolved;
    destInput.addEventListener("change", function () {
      destInput._resolved = null;
    });
    destGroup.appendChild(destLbl);
    destGroup.appendChild(destInput);

    // Intermediate stops builder (dynamic)
    var stopsContainer = document.createElement("div");
    stopsContainer.id = "route-stops-builder";
    stopsContainer.className = "route-stops-builder";
    var pendingStops = []; // { input, resolved }

    var addStopBtn = document.createElement("button");
    addStopBtn.type = "button";
    addStopBtn.className = "route-add-stop-btn";
    addStopBtn.textContent = "+ Add Stop";
    addStopBtn.addEventListener("click", function () {
      var stopGroup = document.createElement("div");
      stopGroup.className = "route-field-group route-field-group--stop";
      var stopLbl = document.createElement("label");
      stopLbl.textContent = "Stop " + (pendingStops.length + 1);
      var stopInput = document.createElement("input");
      stopInput.type = "text";
      stopInput.placeholder = "Address or place…";
      var removeStopBtn = document.createElement("button");
      removeStopBtn.type = "button";
      removeStopBtn.className = "route-stop-remove-btn";
      removeStopBtn.textContent = "✕";
      var entry = { input: stopInput, resolved: null };
      pendingStops.push(entry);
      stopInput.addEventListener("change", function () { entry.resolved = null; });
      removeStopBtn.addEventListener("click", function () {
        pendingStops.splice(pendingStops.indexOf(entry), 1);
        stopsContainer.removeChild(stopGroup);
      });
      stopGroup.appendChild(stopLbl);
      stopGroup.appendChild(stopInput);
      stopGroup.appendChild(removeStopBtn);
      stopsContainer.appendChild(stopGroup);
    });

    var genBtn = document.createElement("button");
    genBtn.type = "button";
    genBtn.className = "route-gen-btn";
    genBtn.textContent = "Generate Route";
    genBtn.addEventListener("click", function () {
      var originVal = originInput.value.trim();
      var destVal = destInput.value.trim();
      if (!originVal || !destVal) {
        alert("Please enter an origin and destination.");
        return;
      }
      genBtn.disabled = true;
      genBtn.textContent = "Generating…";

      var originPromise = originInput._resolved
        ? Promise.resolve(originInput._resolved)
        : _geocode(originVal).then(function (geo) {
            return geo || { name: originVal, longitude: 0, latitude: 0 };
          });
      var destPromise = destInput._resolved
        ? Promise.resolve(destInput._resolved)
        : _geocode(destVal).then(function (geo) {
            return geo || { name: destVal, longitude: 0, latitude: 0 };
          });
      var stopPromises = pendingStops.map(function (entry) {
        var v = entry.input.value.trim();
        if (!v) return Promise.resolve(null);
        if (entry.resolved) return Promise.resolve(entry.resolved);
        return _geocode(v).then(function (geo) {
          return geo || { name: v, longitude: 0, latitude: 0 };
        });
      });

      Promise.all([originPromise, destPromise].concat(stopPromises)).then(function (results) {
        var origin = results[0];
        var dest = results[1];
        var stops = results.slice(2).filter(Boolean);

        origin.id = origin.id || ("stop_" + Math.random().toString(36).slice(2));
        dest.id = dest.id || ("stop_" + Math.random().toString(36).slice(2));
        stops.forEach(function (s) { s.id = s.id || ("stop_" + Math.random().toString(36).slice(2)); });

        originInput._resolved = origin;
        destInput._resolved = dest;

        var routeName = nameInput.value.trim() || "Route";
        var r = SBE.RouteInputSystem.createRoute(routeName, origin, dest);
        stops.forEach(function (s) { SBE.RouteInputSystem.addStop(r.id, s); });

        return SBE.RouteInputSystem.generateGeometry(r.id).then(function () {
          SBE.RouteInputSystem.fitRoute(r.id);
          genBtn.disabled = false;
          genBtn.textContent = "Generate Route";
          // Clear inputs for next route
          nameInput.value = "Route " + (SBE.RouteInputSystem.getRoutes().length + 1);
          originInput.value = "";
          originInput._resolved = null;
          destInput.value = "";
          destInput._resolved = null;
          stopsContainer.innerHTML = "";
          pendingStops.length = 0;
        });
      }).catch(function (err) {
        console.error("[RoutePanel] generate error", err);
        genBtn.disabled = false;
        genBtn.textContent = "Generate Route";
      });
    });

    inputSec.appendChild(nameGroup);
    inputSec.appendChild(originGroup);
    inputSec.appendChild(stopsContainer);
    inputSec.appendChild(destGroup);
    inputSec.appendChild(addStopBtn);
    inputSec.appendChild(genBtn);

    // ── Route list section ───────────────────────────────────────────────────
    var listSec = document.createElement("div");
    listSec.className = "route-list";
    _renderRouteList(listSec, routes);

    panel.appendChild(inputSec);
    panel.appendChild(listSec);
    _container.appendChild(panel);
  }

  function init() {
    _container = document.getElementById("route-panel-content");
    if (!_container) return;
    render();
    if (SBE.WorkspaceEventBus) {
      SBE.WorkspaceEventBus.on("routes:changed", render);
    }
  }

  SBE.RoutePanel = { init: init, render: render };

})(window);
