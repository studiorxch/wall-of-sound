// ── WOS GLB Import Store ───────────────────────────────────────────────────────
// 0616J_WOS_GLBImportBridgePass_v1.0.0_BUILD
// Owns Studio-local imported GLB metadata and transient object URLs.
//
// Contract:
//   - Metadata persisted to localStorage; objectUrl is NEVER persisted (revoked/
//     recreated per session).
//   - Actor manifests stay assetId-only. No glbPath/glbImport fields on actors.
//   - Registers through ActorAssetLibraryAuthority so Library/resolver see assets.
//   - Wall/publish files not touched.
// ─────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var STORAGE_KEY   = 'wos.studio.glbImports.v1';
  var ID_PREFIX     = 'studio.import.glb.';

  var MAX_GLB_FILE_BYTES = 10 * 1024 * 1024;  // 10 MB
  var MAX_BOUNDS_M       = 200;
  var MIN_BOUNDS_M       = 0.01;

  var _imports     = {};               // assetId → record (metadata only; objectUrl transient)
  var _objectUrls  = {};               // assetId → blob object URL (in-memory)
  var _lastCreatedAssetId = null;
  var _lastError          = null;

  // ── ALA accessor ─────────────────────────────────────────────────────────────
  function _ala() { return global.SBE && global.SBE.ActorAssetLibraryAuthority; }

  // ── Slug helper ──────────────────────────────────────────────────────────────
  function _slugify(s) {
    return (s || 'asset').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'asset';
  }

  function _nextId(category, slug) {
    var prefix = ID_PREFIX + category + '.' + slug + '.';
    var max = 0;
    Object.keys(_imports).forEach(function (id) {
      if (id.indexOf(prefix) === 0) {
        var n = parseInt(id.slice(prefix.length), 10);
        if (!isNaN(n) && n > max) max = n;
      }
    });
    return prefix + String(max + 1).padStart(3, '0');
  }

  // ── Persistence ─────────────────────────────────────────────────────────────
  function _metaOnly(rec) {
    var out = {};
    for (var k in rec) {
      if (rec.hasOwnProperty(k)) out[k] = rec[k];
    }
    // objectUrl is never persisted
    if (out.glbImport) {
      out.glbImport = Object.assign({}, out.glbImport, { objectUrl: null, status: 'missing-file' });
    }
    return out;
  }

  function _save() {
    try {
      var toSave = {};
      Object.keys(_imports).forEach(function (id) { toSave[id] = _metaOnly(_imports[id]); });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch (e) {}
  }

  function _load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        Object.keys(parsed).forEach(function (id) {
          _imports[id] = parsed[id];
          // objectUrl is gone after reload; status reflects that
          if (_imports[id].glbImport) _imports[id].glbImport.objectUrl = null;
        });
      }
    } catch (e) {}
  }

  function _registerOne(rec) {
    var ala = _ala();
    if (!ala || !ala.registerAsset) return false;
    return !!ala.registerAsset(rec);
  }

  function registerAll() {
    var count = 0;
    Object.keys(_imports).forEach(function (id) { if (_registerOne(_imports[id])) count++; });
    return count;
  }

  // ── File validation ──────────────────────────────────────────────────────────
  function validateFile(file) {
    var warnings = [];
    if (!file)                                     return { ok: false, reason: 'no_file' };
    if (!file.name.toLowerCase().endsWith('.glb')) return { ok: false, reason: 'not_a_glb_file' };
    if (file.size === 0)                           return { ok: false, reason: 'file_empty' };
    if (file.size > MAX_GLB_FILE_BYTES)            return { ok: false, reason: 'file_too_large', sizeBytes: file.size, maxBytes: MAX_GLB_FILE_BYTES };
    return { ok: true, warnings: warnings };
  }

  // ── Scene validation ─────────────────────────────────────────────────────────
  function validateScene(gltf) {
    var THREE = global.THREE;
    if (!THREE || !gltf || !gltf.scene) return { ok: false, reason: 'no_scene', warnings: [] };

    var warnings = [];
    var scene    = gltf.scene;
    var meshCount = 0, matCount = 0, hasTextures = false, hasAnim = false, hasSkin = false;

    scene.traverse(function (child) {
      if (child.isMesh) {
        meshCount++;
        if (child.material) {
          var mats = Array.isArray(child.material) ? child.material : [child.material];
          matCount += mats.length;
          mats.forEach(function (m) { if (m.map || m.normalMap || m.roughnessMap) hasTextures = true; });
        }
        if (child.skeleton) hasSkin = true;
      }
    });
    if (gltf.animations && gltf.animations.length) hasAnim = true;

    if (meshCount === 0) return { ok: false, reason: 'no_meshes', warnings: warnings };

    // Compute bounding box
    var box = new THREE.Box3().setFromObject(scene);
    if (!box.isBox3 || box.isEmpty()) return { ok: false, reason: 'bounds_empty', warnings: warnings };
    var size = new THREE.Vector3();
    box.getSize(size);
    if (!isFinite(size.x) || !isFinite(size.y) || !isFinite(size.z))
      return { ok: false, reason: 'bounds_not_finite', warnings: warnings };
    if (size.x < MIN_BOUNDS_M && size.y < MIN_BOUNDS_M && size.z < MIN_BOUNDS_M)
      return { ok: false, reason: 'bounds_too_small', boundsM: { x: size.x, y: size.y, z: size.z }, warnings: warnings };

    var boundsMax = Math.max(size.x, size.y, size.z);
    if (boundsMax > MAX_BOUNDS_M)
      warnings.push('bounds_large: max ' + boundsMax.toFixed(2) + 'm exceeds ' + MAX_BOUNDS_M + 'm');

    if (meshCount > 50)    warnings.push('mesh_count_high: ' + meshCount + ' meshes');
    if (matCount  > 20)    warnings.push('material_count_high: ' + matCount + ' materials');
    if (hasTextures)       warnings.push('textures_present: texture data will not be preserved in asset record');
    if (hasAnim)           warnings.push('animations_present: animations ignored in this pass');
    if (hasSkin)           warnings.push('skinning_present: skinned meshes may not display correctly');

    // NaN/Inf transform check (sample root)
    var badTransform = false;
    scene.traverse(function (child) {
      if (badTransform) return;
      var m = child.matrix.elements;
      for (var i = 0; i < 16; i++) { if (!isFinite(m[i])) { badTransform = true; break; } }
    });
    if (badTransform) return { ok: false, reason: 'nan_inf_transform', warnings: warnings };

    var center = new THREE.Vector3();
    box.getCenter(center);

    return {
      ok:         true,
      boundsM:    { x: size.x, y: size.y, z: size.z },
      centerOffsetM: { x: center.x, y: center.y, z: center.z },
      meshCount:  meshCount,
      matCount:   matCount,
      warnings:   warnings,
    };
  }

  // ── importFile ───────────────────────────────────────────────────────────────
  // options: { label, category, scaleToMeters }
  // callback: function(err, { assetId, record, warnings })
  function importFile(file, options, callback) {
    _lastError = null;
    options  = options  || {};
    callback = callback || function () {};

    var fileCheck = validateFile(file);
    if (!fileCheck.ok) {
      _lastError = fileCheck.reason;
      return callback(new Error(fileCheck.reason), null);
    }

    var THREE      = global.THREE;
    var GLTFLoader = THREE && THREE.GLTFLoader;
    if (!GLTFLoader) {
      _lastError = 'GLTFLoader_unavailable';
      return callback(new Error('GLTFLoader_unavailable'), null);
    }

    var objectUrl = URL.createObjectURL(file);

    new GLTFLoader().load(objectUrl, function (gltf) {
      var sceneResult = validateScene(gltf);
      if (!sceneResult.ok) {
        URL.revokeObjectURL(objectUrl);
        _lastError = sceneResult.reason;
        return callback(new Error(sceneResult.reason), null);
      }

      var category     = options.category || 'prop';
      var label        = options.label    || file.name.replace(/\.glb$/i, '');
      var slug         = _slugify(label);
      var scale        = typeof options.scaleToMeters === 'number' ? options.scaleToMeters : 1;
      var assetId      = _nextId(category, slug);
      var now          = new Date().toISOString();
      var importId     = 'imp-' + Date.now();

      var actorTypesMap = { structure: ['structure.building'], vehicle: ['vehicle.car'], maritime: ['marine.vessel'], prop: ['world.prop'], aircraft: ['aircraft.plane'] };

      var rec = {
        id:             assetId,
        key:            assetId,
        label:          label,
        source:         'studio-glb-import',
        editable:       true,
        category:       category,
        actorTypes:     actorTypesMap[category] || ['world.prop'],
        tags:           [],
        defaultVariant: 'glb-preview',
        variants: {
          'glb-preview': { kind: 'glb-import-preview', renderVariant: 'glb-preview', minZoom: 14, maxZoom: 22 },
        },
        glbImport: {
          importId:      importId,
          fileName:      file.name,
          fileSizeBytes: file.size,
          mimeType:      file.type || 'model/gltf-binary',
          objectUrl:     objectUrl,
          boundsM:       sceneResult.boundsM,
          centerOffsetM: sceneResult.centerOffsetM,
          scaleToMeters: scale,
          normalized:    true,
          validatedAt:   now,
          status:        'ready',
        },
        authoring: { editable: true, locked: false, version: '1.0.0', createdAt: now, updatedAt: now },
      };

      _imports[assetId]    = rec;
      _objectUrls[assetId] = objectUrl;
      _lastCreatedAssetId  = assetId;
      _registerOne(rec);
      _save();

      callback(null, { assetId: assetId, record: rec, warnings: sceneResult.warnings });
    },
    undefined,
    function (err) {
      URL.revokeObjectURL(objectUrl);
      _lastError = 'gltf_parse_failed';
      callback(new Error('gltf_parse_failed: ' + String(err)), null);
    });
  }

  // ── refreshObjectUrl ─────────────────────────────────────────────────────────
  function refreshObjectUrl(assetId, file, callback) {
    callback = callback || function () {};
    var rec = _imports[assetId];
    if (!rec) return callback(new Error('asset_not_found'), null);

    var fileCheck = validateFile(file);
    if (!fileCheck.ok) return callback(new Error(fileCheck.reason), null);

    // Revoke old URL
    if (_objectUrls[assetId]) { try { URL.revokeObjectURL(_objectUrls[assetId]); } catch(e){} }

    var url = URL.createObjectURL(file);
    _objectUrls[assetId] = url;
    rec.glbImport.objectUrl = url;
    rec.glbImport.status = 'ready';
    rec.authoring.updatedAt = new Date().toISOString();
    _save();
    callback(null, { assetId: assetId, objectUrl: url });
  }

  function getObjectUrl(assetId) { return _objectUrls[assetId] || null; }

  function list() { return Object.keys(_imports).map(function (id) { return _imports[id]; }); }

  function get(assetId) { return _imports[assetId] || null; }

  function remove(assetId) {
    var rec = _imports[assetId];
    if (!rec) { _lastError = 'asset_not_found'; return { ok: false, reason: 'asset_not_found' }; }
    var store  = global.WOSActorManifestStore;
    var inUse  = store && store.list().some(function (a) { return a.assetId === assetId; });
    if (inUse) { _lastError = 'asset_in_use'; return { ok: false, reason: 'asset_in_use' }; }
    if (_objectUrls[assetId]) { try { URL.revokeObjectURL(_objectUrls[assetId]); } catch(e){} }
    delete _objectUrls[assetId];
    rec._glbImportRemoved = true;
    delete _imports[assetId];
    _save();
    return { ok: true };
  }

  function getSnapshot() {
    var ids    = Object.keys(_imports);
    var ready  = ids.filter(function (id) { return _imports[id].glbImport && _imports[id].glbImport.status === 'ready'; });
    var missing = ids.filter(function (id) { return _imports[id].glbImport && _imports[id].glbImport.status === 'missing-file'; });
    var invalid = ids.filter(function (id) { return _imports[id].glbImport && _imports[id].glbImport.status === 'invalid'; });
    return {
      enabled:            true,
      importedAssetCount: ids.length,
      readyCount:         ready.length,
      missingFileCount:   missing.length,
      invalidCount:       invalid.length,
      lastCreatedAssetId: _lastCreatedAssetId,
      lastError:          _lastError,
    };
  }

  _load();
  registerAll();

  global.WOSGlbImportStore = {
    importFile:       importFile,
    get:              get,
    list:             list,
    remove:           remove,
    refreshObjectUrl: refreshObjectUrl,
    getObjectUrl:     getObjectUrl,
    validateFile:     validateFile,
    validateScene:    validateScene,
    registerAll:      registerAll,
    getSnapshot:      getSnapshot,
  };
  console.log('[WOSGlbImportStore] ready — 0616J | ' + Object.keys(_imports).length + ' imported GLB(s) loaded');
})(window);
