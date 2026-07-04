// ── WOS Building Texture Package Store ────────────────────────────────────────
// 0618B_WOS_BuildingTexturePackageAuthoringPass_v1.0.0_BUILD
//
// Converts imported image textures into packaged, Broadcast-loadable building
// texture assets.
//
// Contract:
//   - Package records are metadata-only. No File/Blob/ArrayBuffer/objectUrl/base64 persisted.
//   - Binary written to wall/assets/textures/buildings/ via local publish server.
//   - Actor manifests are never touched.
//   - Wall/Broadcast reads from bundle.buildingTextures, not Studio localStorage.
//
// Storage key: wos.studio.buildingTexturePackages.v1
// ─────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var STORAGE_KEY      = 'wos.studio.buildingTexturePackages.v1';
  var PACKAGE_ENDPOINT = 'http://localhost:5503/wos/package-building-texture';

  var ALLOWED_EXTS     = ['png', 'jpg', 'jpeg', 'webp'];
  var ALLOWED_MIMES    = ['image/png', 'image/jpeg', 'image/webp'];
  var MAX_FILE_BYTES   = 8 * 1024 * 1024;
  var MAX_DIMENSION    = 4096;

  var _packages  = {};  // packageId → package record
  var _lastError = null;

  // ── Slug / hash / filename helpers ───────────────────────────────────────────
  function _slugify(s) {
    return (s || 'texture').toLowerCase()
      .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'texture';
  }

  function _fnv32(uint8Array) {
    var hash = 0x811c9dc5;
    for (var i = 0; i < uint8Array.length; i++) {
      hash ^= uint8Array[i];
      hash = (hash * 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0').slice(0, 6);
  }

  function _extFromMime(mime) {
    if (mime === 'image/png')  return 'png';
    if (mime === 'image/jpeg') return 'jpg';
    if (mime === 'image/webp') return 'webp';
    return 'png';
  }

  function _packageFileName(label, hash, ext) {
    var slug = _slugify(label);
    return 'building_tex_' + slug + '__' + hash + '.' + ext;
  }

  function _packageId(label, hash) {
    var slug = _slugify(label);
    return 'building.tex.pkg.' + slug + '.' + hash;
  }

  function _detectMime(file) {
    if (file.type && ALLOWED_MIMES.indexOf(file.type) !== -1) return file.type;
    var name = (file.name || '').toLowerCase();
    if (name.endsWith('.png'))  return 'image/png';
    if (name.endsWith('.jpg'))  return 'image/jpeg';
    if (name.endsWith('.jpeg')) return 'image/jpeg';
    if (name.endsWith('.webp')) return 'image/webp';
    return null;
  }

  // ── Persistence ───────────────────────────────────────────────────────────────
  function _save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_packages)); } catch (e) {}
  }

  function _load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') _packages = parsed;
    } catch (e) {}
  }

  // ── importTexture(file, opts, callback) ───────────────────────────────────────
  // Validates and registers a texture file in draft status.
  // opts: { label, materialClass, textureRole }
  // callback: function(err, { packageId })
  function importTexture(file, opts, callback) {
    callback = callback || function () {};
    opts     = opts || {};
    _lastError = null;

    if (!file || !(file instanceof File)) {
      return callback(new Error('invalid_file: must be a File object'), null);
    }

    var mime = _detectMime(file);
    if (!mime) {
      return callback(new Error('unsupported_format: use png, jpg, jpeg, or webp'), null);
    }

    if (file.size > MAX_FILE_BYTES) {
      return callback(new Error('file_too_large: max 8 MB'), null);
    }

    var reader = new FileReader();
    reader.onload = function (ev) {
      var buf   = ev.target.result;
      var uint8 = new Uint8Array(buf);
      var hash  = _fnv32(uint8);
      var ext   = _extFromMime(mime);
      var label = opts.label || file.name.replace(/\.[^.]+$/, '');
      var pkgId = _packageId(label, hash);
      var pkgFileName = _packageFileName(label, hash, ext);

      var rec = {
        packageId:       pkgId,
        label:           label,
        source:          'studio-building-texture-package',
        status:          'draft',
        imageFileName:   file.name,
        packageFileName: pkgFileName,
        runtimeUrl:      null,
        contentHash:     hash,
        fileSizeBytes:   file.size,
        mimeType:        mime,
        width:           null,
        height:          null,
        materialClass:   opts.materialClass  || 'facade',
        textureRole:     opts.textureRole    || 'baseColor',
        repeat:          { x: 1, y: 1 },
        rotationDeg:     0,
        opacity:         1,
        blendMode:       'multiply',
        colorTint:       null,
        createdAt:       new Date().toISOString(),
        updatedAt:       new Date().toISOString(),
      };

      // Measure image dimensions via Image element (no persistence of element)
      var img = new Image();
      var objUrl = URL.createObjectURL(file);
      img.onload = function () {
        rec.width  = img.naturalWidth  || null;
        rec.height = img.naturalHeight || null;
        URL.revokeObjectURL(objUrl);

        if (rec.width  && rec.width  > MAX_DIMENSION) {
          return callback(new Error('image_too_wide: max ' + MAX_DIMENSION + 'px'), null);
        }
        if (rec.height && rec.height > MAX_DIMENSION) {
          return callback(new Error('image_too_tall: max ' + MAX_DIMENSION + 'px'), null);
        }

        // Store the object URL temporarily for later packaging — only in-session memory
        if (!_objectUrls) _objectUrls = {};
        _objectUrls[pkgId] = { url: objUrl, file: null };
        // Re-create from buf to avoid GC issues
        var blob2 = new Blob([buf], { type: mime });
        _objectUrls[pkgId] = { buf: buf, mime: mime };

        _packages[pkgId] = rec;
        _save();
        callback(null, { packageId: pkgId });
      };
      img.onerror = function () {
        URL.revokeObjectURL(objUrl);
        callback(new Error('image_decode_failed'), null);
      };
      img.src = objUrl;
    };
    reader.onerror = function () { callback(new Error('file_read_failed'), null); };
    reader.readAsArrayBuffer(file);
  }

  // In-session binary cache (never persisted)
  var _objectUrls = {};

  // ── reattachFile(packageId, file, callback) ───────────────────────────────────
  function reattachFile(packageId, file, callback) {
    callback = callback || function () {};
    var rec = _packages[packageId];
    if (!rec) return callback(new Error('package_not_found'), null);
    var reader = new FileReader();
    reader.onload = function (ev) {
      var buf  = ev.target.result;
      var mime = _detectMime(file) || rec.mimeType;
      _objectUrls[packageId] = { buf: buf, mime: mime };
      rec.status    = rec.runtimeUrl ? 'packaged' : 'draft';
      rec.updatedAt = new Date().toISOString();
      _save();
      callback(null, { ok: true });
    };
    reader.onerror = function () { callback(new Error('file_read_failed'), null); };
    reader.readAsArrayBuffer(file);
  }

  // ── packageTexture(packageId, callback) ───────────────────────────────────────
  // Sends the binary to the local publish server.
  // callback: function(err, { packageId, runtimeUrl, packageRecord })
  function packageTexture(packageId, callback) {
    callback = callback || function () {};
    _lastError = null;

    var rec = _packages[packageId];
    if (!rec) {
      return callback(new Error('package_not_found: ' + packageId), null);
    }

    var binaryEntry = _objectUrls && _objectUrls[packageId];
    if (!binaryEntry || !binaryEntry.buf) {
      rec.status = 'missing-file';
      _save();
      return callback(new Error('Re-attach image file before packaging for Broadcast.'), null);
    }

    var buf  = binaryEntry.buf;
    var mime = binaryEntry.mime || rec.mimeType;
    var ext  = _extFromMime(mime);
    var hash  = rec.contentHash;
    var label = rec.label;
    var pkgFileName = rec.packageFileName || _packageFileName(label, hash, ext);

    var metadataPayload = JSON.stringify({
      packageId:     packageId,
      label:         label,
      mimeType:      mime,
      fileSizeBytes: buf.byteLength,
      contentHash:   hash,
      materialClass: rec.materialClass,
      textureRole:   rec.textureRole,
      width:         rec.width,
      height:        rec.height,
    });

    fetch(PACKAGE_ENDPOINT, {
      method:  'POST',
      headers: {
        'Content-Type':        'application/octet-stream',
        'X-Package-Filename':  pkgFileName,
        'X-Metadata':          metadataPayload,
      },
      body: buf,
    })
      .then(function (r) {
        if (!r.ok) return r.json().then(function (e) { throw new Error(e.error || 'server_error'); });
        return r.json();
      })
      .then(function (result) {
        if (!result.ok) throw new Error(result.error || 'server_rejected');
        rec.status          = 'packaged';
        rec.runtimeUrl      = result.runtimeUrl;
        rec.packageFileName = result.packageFileName || pkgFileName;
        rec.fileSizeBytes   = result.fileSizeBytes   || rec.fileSizeBytes;
        rec.contentHash     = result.contentHash     || hash;
        rec.updatedAt       = new Date().toISOString();
        _save();
        callback(null, { packageId: packageId, runtimeUrl: rec.runtimeUrl, packageRecord: rec });
      })
      .catch(function (err) {
        _lastError = err.message;
        rec.status = 'error';
        _save();
        callback(err, null);
      });
  }

  function get(packageId)    { return _packages[packageId] || null; }
  function has(packageId)    { return Object.prototype.hasOwnProperty.call(_packages, packageId); }
  function list()            { return Object.keys(_packages).map(function (id) { return _packages[id]; }); }

  function remove(packageId) {
    if (!_packages[packageId]) return { ok: false, reason: 'not_found' };
    delete _packages[packageId];
    if (_objectUrls) delete _objectUrls[packageId];
    _save();
    return { ok: true };
  }

  function updateMeta(packageId, fields) {
    var rec = _packages[packageId];
    if (!rec) return { ok: false, reason: 'not_found' };
    var allowed = ['label', 'materialClass', 'textureRole', 'repeat', 'rotationDeg', 'opacity', 'blendMode', 'colorTint'];
    allowed.forEach(function (k) {
      if (fields.hasOwnProperty(k)) rec[k] = fields[k];
    });
    rec.updatedAt = new Date().toISOString();
    _save();
    return { ok: true };
  }

  // getForBundle(packageIds) — sanitized records, no binary/objectUrl/local path
  function getForBundle(packageIds) {
    var result = [];
    (packageIds || Object.keys(_packages)).forEach(function (id) {
      var rec = _packages[id];
      if (!rec || rec.status !== 'packaged' || !rec.runtimeUrl) return;
      result.push({
        packageId:     rec.packageId,
        source:        'studio-building-texture-package',
        runtimeUrl:    rec.runtimeUrl,
        contentHash:   rec.contentHash,
        fileSizeBytes: rec.fileSizeBytes,
        mimeType:      rec.mimeType,
        width:         rec.width,
        height:        rec.height,
        materialClass: rec.materialClass,
        textureRole:   rec.textureRole,
      });
    });
    return result;
  }

  function getSnapshot() {
    var ids      = Object.keys(_packages);
    var packaged = ids.filter(function (id) { return _packages[id].status === 'packaged'; });
    var missing  = ids.filter(function (id) { return _packages[id].status === 'missing-file'; });
    return {
      enabled:        true,
      packageCount:   ids.length,
      packagedCount:  packaged.length,
      missingCount:   missing.length,
      packagedIds:    packaged,
      lastError:      _lastError,
    };
  }

  _load();

  global.WOSBuildingTexturePackageStore = {
    importTexture:  importTexture,
    reattachFile:   reattachFile,
    packageTexture: packageTexture,
    get:            get,
    has:            has,
    list:           list,
    remove:         remove,
    updateMeta:     updateMeta,
    getForBundle:   getForBundle,
    getSnapshot:    getSnapshot,
    PACKAGE_ENDPOINT: PACKAGE_ENDPOINT,
  };

  console.log('[WOSBuildingTexturePackageStore] ready — 0618B | ' + Object.keys(_packages).length + ' package(s)');
})(window);
