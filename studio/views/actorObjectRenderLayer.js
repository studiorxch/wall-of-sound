// ── WOS ActorObjectRenderLayer ────────────────────────────────────────────────
// 0613_WOS_3DCanvasLabPhase5ObjectRenderLayer_v1.0.0_BUILD
// 0615D_WOS_3DAssetVisualAuthoringPass_v1.0.0_BUILD
// 0616C_WOS_ObjectColorMaterialAuthoringPass_v1.0.0_BUILD
// Owns full lifecycle of actor Object3D instances in the Three.js scene.
// Registered as a Mapbox GL JS custom layer. Uses the shared Mapbox WebGL context
// — no second renderer, no second canvas (§3.2, AC9).
// 0615D: proxyDetailMode, authoringScale, heading arrow, resync on mode change,
//        getVisualAuthoringSnapshot().
// 0615F: _resolveVisualCategory() fallback order (actorCategory → resolved asset
//        category → inferred → prop); proxy rebuilds on assetId/category swap.
// 0616B: setShapePreview/clearShapePreview/getShapePreview — Studio-only parametric
//        shape override for the selected actor's proxy. Session state only, never
//        written to manifests; survives resync/remount since _buildEntry reads it.
// 0616C: setMaterialPreview/clearMaterialPreview/getMaterialPreview — Studio-only
//        per-slot color/material override. Applied AFTER Phase 7's
//        MaterialOverrideController so the deterministic order is:
//        base proxy → Phase 7 override → 0616C preview (Studio-only, wins visually).
// 0616D: _savedShapeRecipeFor()/_applySavedMaterialRecipe() read a resolved
//        custom asset's shapeRecipe/materialRecipe (never an actor manifest
//        field) and apply them as the base layer, below Phase 7 and 0616C.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var LAYER_ID      = 'wos-actor-render-layer';
  var CYAN          = 0x00CED1;
  var OUTLINE_SCALE = 1.08;

  var LS_KEY_MODE  = 'wos.studio.proxyDetailMode';
  var LS_KEY_SCALE = 'wos.studio.authoringScale';

  // ── Coordinate helpers ────────────────────────────────────────────────────────
  function _buildMatrix(THREE, mgl, lat, lon, altM, headingDeg) {
    var mc = mgl.MercatorCoordinate.fromLngLat({ lng: lon, lat: lat }, altM || 0);
    var s  = mc.meterInMercatorCoordinateUnits();
    var m  = new THREE.Matrix4();
    m.makeTranslation(mc.x, mc.y, mc.z);
    m.scale(new THREE.Vector3(s, -s, s));
    m.multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    if (headingDeg) m.multiply(new THREE.Matrix4().makeRotationY(-headingDeg * Math.PI / 180));
    return m;
  }

  function _actorMatrix(THREE, mgl, actor, headingOverride, scaleMultiplier) {
    var a   = actor.anchor;
    var hdg = headingOverride != null ? headingOverride : (a.headingDeg || 0);
    var mc  = mgl.MercatorCoordinate.fromLngLat({ lng: a.lon, lat: a.lat }, a.altM || 0);
    var s   = mc.meterInMercatorCoordinateUnits() * (scaleMultiplier || 1);
    var m   = new THREE.Matrix4();
    m.makeTranslation(mc.x, mc.y, mc.z);
    m.scale(new THREE.Vector3(s, -s, s));
    m.multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    if (hdg) m.multiply(new THREE.Matrix4().makeRotationY(-hdg * Math.PI / 180));
    return m;
  }

  function _ringMatrix(THREE, mgl, actor) {
    return _buildMatrix(THREE, mgl, actor.anchor.lat, actor.anchor.lon, actor.anchor.altM || 0, 0);
  }

  // ── ActorObjectRenderLayer ────────────────────────────────────────────────────
  function ActorObjectRenderLayer(map, mapboxgl, deps) {
    this._map       = map;
    this._mgl       = mapboxgl;
    this._store     = deps.store;
    this._resolver  = deps.resolver;
    this._placement = deps.placementController;
    this._proxyFac  = deps.proxyFactory;
    this._matCtrl   = deps.materialOverrideCtrl || null;

    this._scene    = null;
    this._camera   = null;
    this._renderer = null;
    this._objects  = {};   // objectId → { mesh, outlineGroup, ring, arrow, category, actorType }
    this._selected = null;
    this._mounted  = false;
    this._onSelect = null;

    // 0615D: visual authoring state (session-only, never manifests)
    var savedMode  = null;
    var savedScale = null;
    try { savedMode  = localStorage.getItem(LS_KEY_MODE);  } catch (e) {}
    try { savedScale = localStorage.getItem(LS_KEY_SCALE); } catch (e) {}
    this._proxyDetailMode      = (['simple','readable','hero'].indexOf(savedMode) !== -1) ? savedMode : 'readable';
    this._authoringScaleEnabled = savedScale !== 'false';

    // 0616B: objectId → { template, params } — Studio session preview only
    this._shapePreviews = {};

    // 0616C: objectId → { slots, materialClass, roughness, metalness, opacity } — Studio session preview only
    this._materialPreviews = {};
  }

  // mount()
  ActorObjectRenderLayer.prototype.mount = function () {
    var self  = this;
    var THREE = global.THREE;
    var mgl   = this._mgl;
    if (!THREE || !mgl) { console.warn('[ActorObjectRenderLayer] THREE or Mapbox not available'); return; }

    this._scene  = new THREE.Scene();
    this._camera = new THREE.Camera();

    this._scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    var sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(0, 1, 0);
    this._scene.add(sun);

    this._map.addLayer({
      id:            LAYER_ID,
      type:          'custom',
      renderingMode: '3d',

      onAdd: function (map, gl) {
        self._renderer = new THREE.WebGLRenderer({
          canvas:    map.getCanvas(),
          context:   gl,
          antialias: true,
        });
        self._renderer.autoClear = false;
        self._mounted = true;
        self._loadAll();
      },

      render: function (gl, matrix) {
        if (!self._renderer || !self._scene || !self._camera) return;
        var mat = (matrix && matrix.mainMatrix) ? matrix.mainMatrix : matrix;
        self._camera.projectionMatrix = new THREE.Matrix4().fromArray(mat);
        self._camera.matrixWorldInverse.identity();
        self._renderer.resetState();
        self._renderer.render(self._scene, self._camera);
        self._map.triggerRepaint();
      },

      onRemove: function () { self._mounted = false; },
    });

    this._onSelect = function (actor) {
      self.setSelection(actor ? actor.objectId : null);
    };
    this._placement.on('select', this._onSelect);
  };

  // remount() — called by MapLookController after style switch destroys custom layers
  ActorObjectRenderLayer.prototype.remount = function () {
    var self = this;
    if (this._map.getLayer(LAYER_ID)) {
      try { this._map.removeLayer(LAYER_ID); } catch (e) {}
    }
    this._renderer = null;
    this._mounted  = false;
    // Preserve _objects entries — just re-add the layer; onAdd rebuilds scene refs
    var prevSelected = this._selected;
    this._selected = null;
    Object.keys(this._objects).forEach(function (id) {
      var e = self._objects[id];
      if (e.mesh && e.mesh.parent) e.mesh.parent.remove(e.mesh);
      if (e.ring && e.ring.parent) e.ring.parent.remove(e.ring);
      if (e.arrow && e.arrow.parent) e.arrow.parent.remove(e.arrow);
    });
    this._objects = {};
    this.mount();
    // Re-select after mount settles
    if (prevSelected) {
      var self2 = this;
      setTimeout(function () { self2.setSelection(prevSelected); }, 50);
    }
  };

  // unmount()
  ActorObjectRenderLayer.prototype.unmount = function () {
    if (this._placement && this._onSelect) {
      this._placement.off('select', this._onSelect);
      this._onSelect = null;
    }
    var self = this;
    Object.keys(this._objects).forEach(function (id) { self._removeEntry(id); });
    this._objects  = {};
    this._selected = null;
    if (this._map && this._map.getLayer(LAYER_ID)) {
      try { this._map.removeLayer(LAYER_ID); } catch (e) {}
    }
    this._renderer = null;
    this._mounted  = false;
  };

  // ── 0615D: visual authoring controls ─────────────────────────────────────────

  ActorObjectRenderLayer.prototype.setProxyDetailMode = function (mode) {
    if (['simple','readable','hero'].indexOf(mode) === -1) return;
    this._proxyDetailMode = mode;
    try { localStorage.setItem(LS_KEY_MODE, mode); } catch (e) {}
    this._resyncAll();
  };

  ActorObjectRenderLayer.prototype.getProxyDetailMode = function () {
    return this._proxyDetailMode;
  };

  ActorObjectRenderLayer.prototype.setAuthoringScaleEnabled = function (enabled) {
    this._authoringScaleEnabled = !!enabled;
    try { localStorage.setItem(LS_KEY_SCALE, String(!!enabled)); } catch (e) {}
    this._resyncAll();
  };

  ActorObjectRenderLayer.prototype.getAuthoringScaleEnabled = function () {
    return this._authoringScaleEnabled;
  };

  ActorObjectRenderLayer.prototype.getVisualAuthoringSnapshot = function () {
    var ids     = Object.keys(this._objects);
    var visible = ids.filter(function (id) {
      var e = this._objects[id]; return e && e.mesh && e.mesh.visible !== false;
    }, this);
    var cats = {};
    ids.forEach(function (id) {
      var c = this._objects[id].category || 'prop';
      cats[c] = (cats[c] || 0) + 1;
    }, this);
    var selEntry = this._selected && this._objects[this._selected];
    return {
      enabled:               true,
      selectedObjectId:      this._selected,
      objectCount:           ids.length,
      visibleObjectCount:    visible.length,
      proxyDetailMode:       this._proxyDetailMode,
      studioScaleEnabled:    this._authoringScaleEnabled,
      selectedHasBaseRing:   !!(selEntry && selEntry.ring && selEntry.ring.visible),
      selectedHasHeadingArrow: !!(selEntry && selEntry.arrow && selEntry.arrow.visible),
      categories:            cats,
    };
  };

  // ── Selection ─────────────────────────────────────────────────────────────────

  ActorObjectRenderLayer.prototype.setSelection = function (objectId) {
    this._clearHighlight(this._selected);
    this._selected = objectId;
    if (!objectId) return;
    this._applyHighlight(objectId);
  };

  // ── Preview / drag ────────────────────────────────────────────────────────────

  ActorObjectRenderLayer.prototype.setPreviewAnchor = function (objectId, lat, lon) {
    var THREE = global.THREE;
    var entry = this._objects[objectId];
    if (!entry) return;
    var actor = this._store.get(objectId);
    var altM  = actor ? (actor.anchor.altM  || 0) : 0;
    var hdg   = actor ? (actor.anchor.headingDeg || 0) : 0;
    var scale = this._scaleFor(entry.category, entry.actorType);
    this._applyMatrix(entry.mesh,  _buildMatrix(THREE, this._mgl, lat, lon, altM, hdg));
    if (entry.ring)  this._applyMatrix(entry.ring,  _buildMatrix(THREE, this._mgl, lat, lon, altM, 0));
    if (entry.arrow) this._applyMatrix(entry.arrow, _buildMatrix(THREE, this._mgl, lat, lon, altM, hdg));
    // Scale is baked into mesh matrix only when authoringScale is on
    if (this._authoringScaleEnabled && scale !== 1) {
      var sm = _actorMatrix(THREE, this._mgl, { anchor: { lat: lat, lon: lon, altM: altM, headingDeg: hdg } }, hdg, scale);
      this._applyMatrix(entry.mesh, sm);
    }
  };

  ActorObjectRenderLayer.prototype.setPreviewHeading = function (objectId, headingDeg) {
    var THREE = global.THREE;
    var entry = this._objects[objectId];
    if (!entry) return;
    var actor = this._store.get(objectId);
    if (!actor) return;
    var scale = this._scaleFor(entry.category, entry.actorType);
    this._applyMatrix(entry.mesh, _actorMatrix(THREE, this._mgl, actor, headingDeg, scale));
    // Rotate arrow with heading
    if (entry.arrow) {
      this._applyMatrix(entry.arrow, _buildMatrix(THREE, this._mgl,
        actor.anchor.lat, actor.anchor.lon, actor.anchor.altM || 0, headingDeg));
    }
  };

  // ── Lifecycle ─────────────────────────────────────────────────────────────────

  ActorObjectRenderLayer.prototype.onActorAdded = function (manifest) {
    this._buildEntry(manifest);
  };

  ActorObjectRenderLayer.prototype.onActorUpdated = function (manifest) {
    var THREE = global.THREE;
    var entry = this._objects[manifest.objectId];
    if (!entry) { this._buildEntry(manifest); return; }

    // 0615F: if assetId swap changed the resolved category/type, rebuild the
    // proxy rather than just moving it — a vehicle silhouette must become a
    // maritime silhouette immediately, not stay stale until next reload.
    var resolved = this._resolveVisualCategory(manifest);
    if (resolved.category !== entry.category || resolved.actorType !== entry.actorType) {
      var wasSelected = this._selected === manifest.objectId;
      this._buildEntry(manifest);
      if (wasSelected) this.setSelection(manifest.objectId);
      return;
    }

    var scale = this._scaleFor(entry.category, entry.actorType);
    this._applyMatrix(entry.mesh, _actorMatrix(THREE, this._mgl, manifest, null, scale));
    if (entry.ring)  this._applyMatrix(entry.ring,  _ringMatrix(THREE, this._mgl, manifest));
    if (entry.arrow) this._applyMatrix(entry.arrow, _buildMatrix(THREE, this._mgl,
      manifest.anchor.lat, manifest.anchor.lon, manifest.anchor.altM || 0, manifest.anchor.headingDeg || 0));
    this._applySavedMaterialRecipe(manifest.objectId, manifest); // 0616D: base layer
    if (this._matCtrl) this._matCtrl.applyFromManifest(manifest.objectId);
    this._applyMaterialPreview(manifest.objectId); // 0616C: re-apply after Phase 7 override
  };

  ActorObjectRenderLayer.prototype.getObject3D = function (objectId) {
    return (this._objects[objectId] && this._objects[objectId].mesh) || null;
  };

  // 0618D: Normalise all meshes in an actor's proxy so they use MeshStandardMaterial
  // with an explicit map slot — required before texture application.
  // Preserves base color from the existing material.
  ActorObjectRenderLayer.prototype.ensureTextureReadyObject = function (objectId) {
    var THREE = global.THREE;
    if (!THREE) return { ok: false, objectId: objectId, reason: 'THREE_unavailable' };
    var entry = this._objects[objectId];
    if (!entry || !entry.mesh) return { ok: false, objectId: objectId, reason: 'object_not_found' };
    var meshCount = 0;
    var textureReadyCount = 0;
    entry.mesh.traverse(function (node) {
      if (!node.isMesh) return;
      meshCount++;
      var mat = node.material;
      if (mat && mat.isMeshStandardMaterial && mat.map !== undefined) {
        textureReadyCount++;
        return;
      }
      // Replace non-standard material with MeshStandardMaterial preserving color
      var color = (mat && mat.color) ? mat.color.clone() : new THREE.Color(0xaaaaaa);
      var newMat = new THREE.MeshStandardMaterial({
        color:     color,
        roughness: 0.7,
        metalness: 0.05,
        map:       null,
        side:      THREE.FrontSide,
      });
      if (mat && mat.transparent) { newMat.transparent = true; newMat.opacity = mat.opacity != null ? mat.opacity : 1; }
      node.material = newMat;
      node.material.needsUpdate = true;
      textureReadyCount++;
    });
    return { ok: true, objectId: objectId, meshCount: meshCount, textureReadyCount: textureReadyCount };
  };

  ActorObjectRenderLayer.prototype.onActorRemoved = function (objectId) {
    this._removeEntry(objectId);
    delete this._shapePreviews[objectId];    // 0616B: drop stale preview for deleted actor
    delete this._materialPreviews[objectId]; // 0616C: drop stale preview for deleted actor
    if (this._selected === objectId) this._selected = null;
  };

  // ── 0616B: Studio-only parametric shape preview ──────────────────────────────
  ActorObjectRenderLayer.prototype.setShapePreview = function (objectId, shapeDraft) {
    this._shapePreviews[objectId] = shapeDraft;
    this._rebuildOne(objectId);
  };

  ActorObjectRenderLayer.prototype.clearShapePreview = function (objectId) {
    if (!this._shapePreviews[objectId]) return;
    delete this._shapePreviews[objectId];
    this._rebuildOne(objectId);
  };

  ActorObjectRenderLayer.prototype.getShapePreview = function (objectId) {
    return this._shapePreviews[objectId] || null;
  };

  ActorObjectRenderLayer.prototype.getShapeEditorSnapshot = function () {
    return {
      previewCount:     Object.keys(this._shapePreviews).length,
      previewObjectIds: Object.keys(this._shapePreviews),
    };
  };

  // ── 0616C: Studio-only object color/material preview ────────────────────────
  ActorObjectRenderLayer.prototype.setMaterialPreview = function (objectId, materialDraft) {
    this._materialPreviews[objectId] = materialDraft;
    this._applyMaterialPreview(objectId);
  };

  // Rebuilds the entry so material reverts cleanly to base proxy + Phase 7
  // override (whatever applyFromManifest would produce) — no separate stash
  // map needed, matching 0616B's clearShapePreview pattern.
  ActorObjectRenderLayer.prototype.clearMaterialPreview = function (objectId) {
    if (!this._materialPreviews[objectId]) return;
    delete this._materialPreviews[objectId];
    this._rebuildOne(objectId);
  };

  ActorObjectRenderLayer.prototype.getMaterialPreview = function (objectId) {
    return this._materialPreviews[objectId] || null;
  };

  ActorObjectRenderLayer.prototype.getObjectMaterialSnapshot = function () {
    return {
      previewCount:     Object.keys(this._materialPreviews).length,
      previewObjectIds: Object.keys(this._materialPreviews),
    };
  };

  // Applies a material draft's per-slot hex colors to the actor's current
  // Object3D. Meshes without an explicit slot color fall back to the 'body'
  // slot color if one is set; otherwise that mesh is left untouched. Shared by
  // the 0616C live preview AND the 0616D saved custom-asset materialRecipe —
  // both apply the same way, just at different points in the layering order.
  ActorObjectRenderLayer.prototype._applyMaterialDraftToEntry = function (objectId, draft) {
    if (!draft) return;
    var entry = this._objects[objectId];
    if (!entry || !entry.mesh) return;
    var THREE = global.THREE;
    if (!THREE) return;

    var slots         = draft.slots || {};
    var materialClass = draft.materialClass;
    var roughness      = draft.roughness;
    var metalness      = draft.metalness;
    var opacity        = draft.opacity;

    entry.mesh.traverse(function (child) {
      if (!child.isMesh || !child.material) return;
      var slotName = child.userData.materialSlot || 'body';
      var hex = slots[slotName] != null ? slots[slotName] : slots.body;
      var hasColor = hex != null;
      if (!hasColor && materialClass == null && roughness == null && metalness == null && opacity == null) return;

      // Clone before mutating — tagged separately from Phase 7's _wosCloned so
      // the two preview layers never fight over the "original material" stash.
      if (!child.material._wos616c) {
        child.material = child.material.clone();
        child.material._wos616c = true;
      }

      if (materialClass === 'standard' || materialClass === 'emissive') {
        if (!(child.material instanceof THREE.MeshStandardMaterial)) {
          var std = new THREE.MeshStandardMaterial({ color: child.material.color ? child.material.color.clone() : 0xffffff });
          std._wos616c = true;
          child.material = std;
        }
      } else if (materialClass === 'lambert' && child.material instanceof THREE.MeshStandardMaterial) {
        var lmb = new THREE.MeshLambertMaterial({ color: child.material.color.clone() });
        lmb._wos616c = true;
        child.material = lmb;
      }

      if (hasColor) { try { child.material.color.set(hex); } catch (e) {} }

      if (child.material instanceof THREE.MeshStandardMaterial) {
        if (roughness != null) child.material.roughness = roughness;
        if (metalness != null) child.material.metalness = metalness;
        if (materialClass === 'emissive' && hasColor) {
          try { child.material.emissive.set(hex); } catch (e) {}
        }
      }

      if (opacity != null) {
        child.material.transparent = opacity < 1;
        child.material.opacity = opacity;
      }

      child.material.needsUpdate = true;
    });
  };

  // 0616C live preview — Studio session state only.
  ActorObjectRenderLayer.prototype._applyMaterialPreview = function (objectId) {
    this._applyMaterialDraftToEntry(objectId, this._materialPreviews[objectId]);
  };

  // 0616D — base layer from a saved custom asset's materialRecipe, if the
  // actor's resolved asset has one. Applied BEFORE Phase 7's materialOverride
  // and BEFORE the 0616C live preview so the layering order in §9 holds:
  // base proxy/shapeRecipe → saved materialRecipe → Phase 7 override → 0616C preview.
  ActorObjectRenderLayer.prototype._applySavedMaterialRecipe = function (objectId, actor) {
    var resolver = global.WOSAssetResolver;
    if (!resolver) return;
    var resolved = resolver.resolve(actor.assetId);
    var asset = resolved && resolved.asset;
    if (!asset || !asset.materialRecipe) return;
    this._applyMaterialDraftToEntry(objectId, asset.materialRecipe);
  };

  // 0616D — saved custom asset's shapeRecipe, used as the proxy's shape draft
  // when no live 0616B shape preview is active for this actor.
  ActorObjectRenderLayer.prototype._savedShapeRecipeFor = function (actor) {
    var resolver = global.WOSAssetResolver;
    if (!resolver) return null;
    var resolved = resolver.resolve(actor.assetId);
    var asset = resolved && resolved.asset;
    return (asset && asset.shapeRecipe) ? asset.shapeRecipe : null;
  };

  ActorObjectRenderLayer.prototype._rebuildOne = function (objectId) {
    var store = this._store;
    var actor = store && store.get(objectId);
    if (!actor) return;
    var wasSelected = this._selected === objectId;
    this._buildEntry(actor);
    if (wasSelected) this.setSelection(objectId);
  };

  ActorObjectRenderLayer.prototype.resync = function () {
    this._resyncAll();
  };

  // ── Internal ──────────────────────────────────────────────────────────────────

  ActorObjectRenderLayer.prototype._scaleFor = function (category, actorType) {
    if (!this._authoringScaleEnabled) return 1;
    var fac = this._proxyFac;
    return (fac && fac.authoringScaleFor) ? fac.authoringScaleFor(category, actorType) : 1;
  };

  // 0615F: category/type resolution order — actor.actorCategory (manifest truth)
  // → resolved asset.category (ALA via AssetResolver) → inferred → prop fallback.
  ActorObjectRenderLayer.prototype._resolveVisualCategory = function (actor) {
    if (actor.actorCategory) {
      return { category: actor.actorCategory, actorType: actor.actorType || 'custom' };
    }
    var resolver = global.WOSAssetResolver;
    if (resolver && resolver.resolvePlacementDefaults) {
      var d = resolver.resolvePlacementDefaults(actor.assetId);
      return { category: d.actorCategory, actorType: d.actorType };
    }
    return { category: 'prop', actorType: 'custom' };
  };

  ActorObjectRenderLayer.prototype._loadAll = function () {
    var self  = this;
    var store = this._store;
    if (!store) return;
    store.list().forEach(function (a) { self._buildEntry(a); });
  };

  ActorObjectRenderLayer.prototype._resyncAll = function () {
    var self  = this;
    var store = this._store;
    if (!store) return;
    var prevSelected = this._selected;
    Object.keys(this._objects).forEach(function (id) { self._removeEntry(id); });
    this._objects  = {};
    this._selected = null;
    store.list().forEach(function (a) { self._buildEntry(a); });
    if (prevSelected) this.setSelection(prevSelected);
  };

  ActorObjectRenderLayer.prototype._buildEntry = function (actor) {
    if (!this._scene) return;
    var THREE = global.THREE;
    var mgl   = this._mgl;
    var fac   = this._proxyFac;
    if (!fac) return;

    this._removeEntry(actor.objectId);

    var resolved = this._resolveVisualCategory(actor);
    var category = resolved.category;
    var atype    = resolved.actorType;
    var scale    = this._scaleFor(category, atype);

    // 0616B live shape preview wins; else fall back to a saved custom asset's
    // shapeRecipe (0616D); else default 0615D category geometry.
    var shapeDraft = this._shapePreviews[actor.objectId] || this._savedShapeRecipeFor(actor) || null;
    var proxy = fac.create(category, atype, this._proxyDetailMode, shapeDraft ? { shapeDraft: shapeDraft } : null);
    proxy.traverse(function (c) { c.userData.objectId = actor.objectId; });
    proxy.userData.objectId = actor.objectId;
    this._applyMatrix(proxy, _actorMatrix(THREE, mgl, actor, null, scale));
    this._scene.add(proxy);

    // Heading arrow (Studio-only, hidden until selection)
    var arrow = null;
    if (fac.makeArrow) {
      arrow = fac.makeArrow(category);
      arrow.traverse(function (c) { c.userData.objectId = actor.objectId; });
      this._applyMatrix(arrow, _buildMatrix(THREE, mgl,
        actor.anchor.lat, actor.anchor.lon, actor.anchor.altM || 0, actor.anchor.headingDeg || 0));
      this._scene.add(arrow);
    }

    this._objects[actor.objectId] = {
      mesh:         proxy,
      outlineGroup: null,
      ring:         null,
      arrow:        arrow,
      category:     category,
      actorType:    atype,
    };

    this._applySavedMaterialRecipe(actor.objectId, actor); // 0616D: base layer from custom asset, if any
    if (this._matCtrl) this._matCtrl.applyFromManifest(actor.objectId);
    this._applyMaterialPreview(actor.objectId); // 0616C: re-apply after Phase 7 override; survives shape/resync/remount rebuilds

    // 0616J: imported GLB takes priority over standard GLB path; proxy remains as fallback
    var resolver616j = this._resolver;
    var resolved616j = resolver616j ? resolver616j.resolve(actor.assetId) : null;
    var asset616j    = resolved616j && resolved616j.asset;
    if (asset616j && asset616j.source === 'studio-glb-import') {
      this._tryImportedGLB(actor);
    } else {
      this._tryGLB(actor);
    }
  };

  ActorObjectRenderLayer.prototype._removeEntry = function (objectId) {
    var entry = this._objects[objectId];
    if (!entry) return;
    if (entry.ring  && entry.ring.parent)  entry.ring.parent.remove(entry.ring);
    if (entry.arrow && entry.arrow.parent) entry.arrow.parent.remove(entry.arrow);
    if (entry.mesh  && entry.mesh.parent)  entry.mesh.parent.remove(entry.mesh);
    delete this._objects[objectId];
  };

  ActorObjectRenderLayer.prototype._applyMatrix = function (obj, m) {
    obj.matrixAutoUpdate = false;
    obj.matrix.copy(m);
    obj.matrixWorldNeedsUpdate = true;
  };

  ActorObjectRenderLayer.prototype._makeOutline = function (group) {
    var THREE = global.THREE;
    var og = new THREE.Group();
    var found = false;
    group.traverse(function (child) {
      if (!child.isMesh) return;
      found = true;
      var mat  = new THREE.MeshBasicMaterial({ color: CYAN, side: THREE.BackSide });
      var mesh = new THREE.Mesh(child.geometry, mat);
      mesh.scale.multiplyScalar(OUTLINE_SCALE);
      mesh.position.copy(child.position);
      og.add(mesh);
    });
    return found ? og : null;
  };

  ActorObjectRenderLayer.prototype._makeRing = function (category, atype) {
    var THREE  = global.THREE;
    var fac    = this._proxyFac;
    var radius = (fac && fac.ringRadiusM) ? fac.ringRadiusM(category, atype) : 2;
    var N      = 64;
    var pts    = [];
    for (var i = 0; i <= N; i++) {
      var a = (i / N) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
    }
    var geom = new THREE.BufferGeometry().setFromPoints(pts);
    var mat  = new THREE.LineBasicMaterial({ color: CYAN, opacity: 0.7, transparent: true });
    var line = new THREE.Line(geom, mat);
    line.visible = false;
    return line;
  };

  ActorObjectRenderLayer.prototype._applyHighlight = function (objectId) {
    var THREE = global.THREE;
    var entry = this._objects[objectId];
    if (!entry) return;

    // Outline
    var og = this._makeOutline(entry.mesh);
    if (og) { entry.mesh.add(og); entry.outlineGroup = og; }

    // Ground ring
    if (!entry.ring) {
      var ring = this._makeRing(entry.category, entry.actorType);
      entry.ring = ring;
      var actor = this._store.get(objectId);
      if (actor) this._applyMatrix(ring, _ringMatrix(THREE, this._mgl, actor));
      this._scene.add(ring);
    }
    entry.ring.visible = true;

    // Heading arrow
    if (entry.arrow) entry.arrow.visible = true;
  };

  ActorObjectRenderLayer.prototype._clearHighlight = function (objectId) {
    if (!objectId) return;
    var entry = this._objects[objectId];
    if (!entry) return;
    if (entry.outlineGroup) {
      entry.mesh.remove(entry.outlineGroup);
      entry.outlineGroup = null;
    }
    if (entry.ring)  entry.ring.visible  = false;
    if (entry.arrow) entry.arrow.visible = false;
  };

  ActorObjectRenderLayer.prototype._tryGLB = function (actor) {
    var resolver = this._resolver;
    if (!resolver) return;
    var resolved = resolver.resolve(actor.assetId);
    if (!resolved || resolved.placeholder || !resolved.asset) return;
    var asset  = resolved.asset;
    var glbUrl = asset.glbUrl || asset.glbPath || asset.url || null;
    if (!glbUrl) return;
    var THREE      = global.THREE;
    var GLTFLoader = THREE && THREE.GLTFLoader;
    if (!GLTFLoader) return;
    var self = this;
    new GLTFLoader().load(glbUrl, function (gltf) {
      var entry = self._objects[actor.objectId];
      if (!entry) return;
      var glb = gltf.scene;
      glb.traverse(function (c) { c.userData.objectId = actor.objectId; });
      glb.userData.objectId = actor.objectId;
      var scale = self._scaleFor(entry.category, entry.actorType);
      self._applyMatrix(glb, _actorMatrix(THREE, self._mgl, actor, null, scale));
      if (entry.mesh.parent) entry.mesh.parent.remove(entry.mesh);
      self._scene.add(glb);
      entry.mesh = glb;
      self._applySavedMaterialRecipe(actor.objectId, actor); // 0616D
      if (self._matCtrl) self._matCtrl.applyFromManifest(actor.objectId);
      self._applyMaterialPreview(actor.objectId); // 0616C
      if (self._selected === actor.objectId) {
        entry.outlineGroup = null;
        self._applyHighlight(actor.objectId);
      }
    }, undefined, function (err) {
      console.warn('[ActorObjectRenderLayer] GLB load failed:', glbUrl, err);
    });
  };

  // ── 0616J: imported GLB render path ─────────────────────────────────────────
  // Fetches the session-local objectUrl from WOSGlbImportStore and loads it with
  // GLTFLoader.  The category proxy built in _buildEntry remains as fallback if
  // the objectUrl is missing (reload case — status 'missing-file').
  ActorObjectRenderLayer.prototype._tryImportedGLB = function (actor) {
    var glbStore = global.WOSGlbImportStore;
    if (!glbStore) return;
    var objectUrl = glbStore.getObjectUrl(actor.assetId);
    if (!objectUrl) {
      // objectUrl gone after reload — proxy remains as missing-file indicator
      console.warn('[ActorObjectRenderLayer] imported GLB missing-file:', actor.assetId);
      return;
    }
    var THREE      = global.THREE;
    var GLTFLoader = THREE && THREE.GLTFLoader;
    if (!GLTFLoader) return;

    var self = this;
    new GLTFLoader().load(objectUrl, function (gltf) {
      var entry = self._objects[actor.objectId];
      if (!entry) return;

      var scene = gltf.scene;

      // Normalize: center at local origin, apply scale
      var box    = new THREE.Box3().setFromObject(scene);
      var center = new THREE.Vector3();
      box.getCenter(center);
      scene.position.sub(center);

      var rec = glbStore.get(actor.assetId);
      var scale = rec && rec.glbImport ? rec.glbImport.scaleToMeters : 1;

      var wrapper = new THREE.Group();
      wrapper.name = 'ImportedGLBPreview:' + actor.assetId;
      wrapper.add(scene);
      wrapper.scale.setScalar(scale || 1);
      wrapper.traverse(function (c) { c.userData.objectId = actor.objectId; });
      wrapper.userData.objectId = actor.objectId;

      var actorScale = self._scaleFor(entry.category, entry.actorType);
      self._applyMatrix(wrapper, _actorMatrix(THREE, self._mgl, actor, null, actorScale));

      if (entry.mesh.parent) entry.mesh.parent.remove(entry.mesh);
      self._scene.add(wrapper);
      entry.mesh = wrapper;

      if (self._matCtrl) self._matCtrl.applyFromManifest(actor.objectId);
      self._applyMaterialPreview(actor.objectId);
      if (self._selected === actor.objectId) {
        entry.outlineGroup = null;
        self._applyHighlight(actor.objectId);
      }
    }, undefined, function (err) {
      console.warn('[ActorObjectRenderLayer] imported GLB load failed:', actor.assetId, err);
    });
  };

  global.WOSActorObjectRenderLayer = ActorObjectRenderLayer;
  console.log('[ActorObjectRenderLayer] ready — 0616J imported GLB bridge');
})(window);
