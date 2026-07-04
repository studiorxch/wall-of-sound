#!/usr/bin/env node
// ── WOS Local Publish Server ──────────────────────────────────────────────────
// 0614_WOS_Phase8ProductionPublishToWallRuntime_v1.0.0_BUILD
// Dev-tooling only — not production Studio code.
//
// Receives assembled actor bundles from StudioPublisher (browser) and writes
// them atomically to wall/data/wos-wall-runtime-bundle.json.
// Archives the previous bundle before writing the new one.
//
// Usage:
//   node studio/systems/publish/localPublishServer.js [port]
//   WOS_PUBLISH_PORT=5503 node studio/systems/publish/localPublishServer.js
//
// POST /wos/publish   — receive bundle JSON, archive previous, write new
// GET  /wos/status    — returns current bundle metadata (bundleVersion, publishedAt)
// ──────────────────────────────────────────────────────────────────────────────

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT         = parseInt(process.env.WOS_PUBLISH_PORT || process.argv[2] || '5503', 10);
const PROJECT_ROOT = path.resolve(__dirname, '../../../');
const BUNDLE_PATH  = path.join(PROJECT_ROOT, 'wall/data/wos-wall-runtime-bundle.json');
const PREV_PATH    = path.join(PROJECT_ROOT, 'wall/data/wos-wall-runtime-bundle.previous.json');
const TEMP_PATH    = BUNDLE_PATH + '.tmp';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-Asset-Id, X-Package-Filename, X-Metadata, X-Package-Id',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

const GLB_DIR = path.join(PROJECT_ROOT, 'wall/assets/glb');
const TEX_DIR = path.join(PROJECT_ROOT, 'wall/assets/textures/buildings');

const ALLOWED_TEX_EXTS = ['.png', '.jpg', '.jpeg', '.webp'];

function sendJSON(res, status, obj) {
  var body = JSON.stringify(obj, null, 2);
  res.writeHead(status, Object.assign({ 'Content-Type': 'application/json' }, CORS_HEADERS));
  res.end(body);
}

function handlePublish(req, res) {
  var body = '';
  req.on('data', function (chunk) { body += chunk; });
  req.on('end', function () {
    var bundle;
    try {
      bundle = JSON.parse(body);
    } catch (e) {
      return sendJSON(res, 400, { ok: false, error: 'invalid_json: ' + e.message });
    }

    // Basic schema validation
    if (!bundle.bundleVersion || !bundle.publishedAt || !Array.isArray(bundle.actors)) {
      return sendJSON(res, 400, { ok: false, error: 'missing_required_bundle_fields (bundleVersion, publishedAt, actors)' });
    }
    if (!bundle.metadata || bundle.metadata.source !== 'studio') {
      return sendJSON(res, 400, { ok: false, error: 'metadata.source must be "studio"' });
    }

    // Ensure output directory exists
    try {
      fs.mkdirSync(path.dirname(BUNDLE_PATH), { recursive: true });
    } catch (e) {}

    // Archive current bundle → .previous.json
    if (fs.existsSync(BUNDLE_PATH)) {
      try {
        fs.copyFileSync(BUNDLE_PATH, PREV_PATH);
        console.log('[WOSPublishServer] archived previous bundle → ' + PREV_PATH);
      } catch (e) {
        console.warn('[WOSPublishServer] could not archive previous bundle:', e.message);
      }
    }

    // Write atomically via temp → rename
    try {
      fs.writeFileSync(TEMP_PATH, JSON.stringify(bundle, null, 2), 'utf8');
      fs.renameSync(TEMP_PATH, BUNDLE_PATH);
    } catch (e) {
      return sendJSON(res, 500, { ok: false, error: 'write_failed: ' + e.message });
    }

    console.log(
      '[WOSPublishServer] published v' + bundle.bundleVersion +
      ' | actors: ' + bundle.actors.length +
      ' | ' + bundle.publishedAt
    );

    sendJSON(res, 200, {
      ok:            true,
      bundleVersion: bundle.bundleVersion,
      publishedAt:   bundle.publishedAt,
      actorCount:    bundle.actors.length,
      bundlePath:    BUNDLE_PATH,
    });
  });
}

function handleStatus(req, res) {
  if (!fs.existsSync(BUNDLE_PATH)) {
    return sendJSON(res, 200, { ok: true, bundle: null, message: 'no_bundle_written_yet' });
  }
  try {
    var raw  = fs.readFileSync(BUNDLE_PATH, 'utf8');
    var data = JSON.parse(raw);
    sendJSON(res, 200, {
      ok:            true,
      bundleVersion: data.bundleVersion,
      publishedAt:   data.publishedAt,
      actorCount:    Array.isArray(data.actors) ? data.actors.length : 0,
      bundlePath:    BUNDLE_PATH,
    });
  } catch (e) {
    sendJSON(res, 500, { ok: false, error: 'bundle_read_failed: ' + e.message });
  }
}

// ── 0617C: POST /wos/package-glb ─────────────────────────────────────────────
// Receives GLB binary via octet-stream body, writes to wall/assets/glb/.
// Headers: X-Asset-Id, X-Package-Filename, X-Metadata (JSON string)
function handlePackageGlb(req, res) {
  var assetId      = req.headers['x-asset-id']         || '';
  var pkgFileName  = req.headers['x-package-filename'] || '';
  var metaRaw      = req.headers['x-metadata']         || '{}';

  if (!assetId || !pkgFileName) {
    return sendJSON(res, 400, { ok: false, error: 'missing_X-Asset-Id_or_X-Package-Filename' });
  }
  if (!/^[a-z0-9_]+__[a-f0-9]{6}\.glb$/.test(pkgFileName)) {
    return sendJSON(res, 400, { ok: false, error: 'invalid_package_filename_format' });
  }

  var chunks = [];
  req.on('data', function (chunk) { chunks.push(chunk); });
  req.on('end', function () {
    var buf = Buffer.concat(chunks);
    if (buf.length === 0) {
      return sendJSON(res, 400, { ok: false, error: 'empty_body' });
    }

    try { fs.mkdirSync(GLB_DIR, { recursive: true }); } catch (e) {}

    var outPath  = path.join(GLB_DIR, pkgFileName);
    var tempPath = outPath + '.tmp';

    // Compute SHA-256 hash of the binary
    var crypto   = require('crypto');
    var hash     = crypto.createHash('sha256').update(buf).digest('hex');

    try {
      fs.writeFileSync(tempPath, buf);
      fs.renameSync(tempPath, outPath);
    } catch (e) {
      return sendJSON(res, 500, { ok: false, error: 'write_failed: ' + e.message });
    }

    var packageId = 'glb.pkg.' + pkgFileName.replace('.glb', '');
    console.log('[WOSPublishServer] packaged GLB: ' + pkgFileName + ' | ' + buf.length + ' bytes | ' + assetId);

    sendJSON(res, 200, {
      ok:            true,
      packageId:     packageId,
      runtimeUrl:    './assets/glb/' + pkgFileName,
      fileSizeBytes: buf.length,
      contentHash:   hash,
    });
  });
}

// ── 0618B: POST /wos/package-building-texture ─────────────────────────────────
// Accepts image binary, validates extension, writes to wall/assets/textures/buildings/.
// Headers: X-Package-Filename, X-Metadata
function handlePackageBuildingTexture(req, res) {
  var pkgFileName = req.headers['x-package-filename'] || '';
  var metaRaw     = req.headers['x-metadata']         || '{}';

  if (!pkgFileName) {
    return sendJSON(res, 400, { ok: false, error: 'missing_X-Package-Filename' });
  }

  var ext = path.extname(pkgFileName).toLowerCase();
  if (ALLOWED_TEX_EXTS.indexOf(ext) === -1) {
    return sendJSON(res, 400, { ok: false, error: 'disallowed_extension: ' + ext });
  }

  // Validate filename: building_tex_<slug>__<6hex>.<ext>
  if (!/^building_tex_[a-z0-9_]+__[a-f0-9]{6}\.[a-z]+$/.test(pkgFileName)) {
    return sendJSON(res, 400, { ok: false, error: 'invalid_package_filename_format' });
  }

  var chunks = [];
  req.on('data', function (chunk) { chunks.push(chunk); });
  req.on('end', function () {
    var buf = Buffer.concat(chunks);
    if (buf.length === 0) {
      return sendJSON(res, 400, { ok: false, error: 'empty_body' });
    }

    try { fs.mkdirSync(TEX_DIR, { recursive: true }); } catch (e) {}

    var outPath  = path.join(TEX_DIR, pkgFileName);
    var tempPath = outPath + '.tmp';
    var crypto   = require('crypto');
    var hash     = crypto.createHash('sha256').update(buf).digest('hex');

    try {
      fs.writeFileSync(tempPath, buf);
      fs.renameSync(tempPath, outPath);
    } catch (e) {
      return sendJSON(res, 500, { ok: false, error: 'write_failed: ' + e.message });
    }

    console.log('[WOSPublishServer] packaged texture: ' + pkgFileName + ' | ' + buf.length + ' bytes');
    sendJSON(res, 200, {
      ok:              true,
      packageFileName: pkgFileName,
      runtimeUrl:      './assets/textures/buildings/' + pkgFileName,
      fileSizeBytes:   buf.length,
      contentHash:     hash,
    });
  });
}

const server = http.createServer(function (req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    return res.end();
  }
  if (req.method === 'POST' && req.url === '/wos/publish')                   return handlePublish(req, res);
  if (req.method === 'POST' && req.url === '/wos/package-glb')               return handlePackageGlb(req, res);
  if (req.method === 'POST' && req.url === '/wos/package-building-texture')  return handlePackageBuildingTexture(req, res);
  if (req.method === 'GET'  && req.url === '/wos/status')                    return handleStatus(req, res);
  sendJSON(res, 404, { ok: false, error: 'not_found', routes: [
    'POST /wos/publish', 'POST /wos/package-glb',
    'POST /wos/package-building-texture', 'GET /wos/status'] });
});

server.listen(PORT, function () {
  console.log('[WOSPublishServer] listening on http://localhost:' + PORT);
  console.log('[WOSPublishServer] bundle path:  ' + BUNDLE_PATH);
  console.log('[WOSPublishServer] POST /wos/publish  — write bundle');
  console.log('[WOSPublishServer] GET  /wos/status   — current bundle metadata');
});
