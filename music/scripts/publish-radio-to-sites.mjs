/**
 * Publish a completed MUSIC RADIO web export into the Sites project's
 * versioned public directory, and (by default) flip the active-station
 * pointer to it.
 *
 * This script does NOT touch MUSIC's publish/export pipeline (0723A-C) —
 * it only reads an already-exported, already-validated bundle from
 * library/music/RadioWebExports/<slug>/v<n>/ and copies it, byte-verified,
 * into the Sites project's public/radio/ directory. Every referenced file
 * is hash- and size-verified against the export's own checksums.json
 * BEFORE any copy happens. The copy itself lands in a temp directory and
 * is only made live via an atomic rename, and the active pointer is only
 * updated after that rename succeeds — so a failure at any point leaves
 * the previously-active version completely untouched.
 *
 * Usage:
 *   node scripts/publish-radio-to-sites.mjs <slug> [--version N] [--sites-root <path>] [--no-activate]
 *
 * Example:
 *   node scripts/publish-radio-to-sites.mjs soft-motion-radio
 */

import { readFileSync, statSync, existsSync, mkdirSync, rmSync, renameSync, readdirSync, copyFileSync, writeFileSync } from "fs";
import { createHash } from "crypto";
import { fileURLToPath } from "url";
import { dirname, resolve, join, relative } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../.."); // wall-of-sound/
const EXPORTS_ROOT = join(REPO_ROOT, "library/music/RadioWebExports");

function parseArgs(argv) {
  const args = { slug: null, version: null, sitesRoot: join(REPO_ROOT, "studiorich-orbital"), activate: true };
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--version") { args.version = Number(argv[++i]); continue; }
    if (arg === "--sites-root") { args.sitesRoot = resolve(argv[++i]); continue; }
    if (arg === "--no-activate") { args.activate = false; continue; }
    positional.push(arg);
  }
  args.slug = positional[0] ?? null;
  return args;
}

function fail(message) {
  console.error(`[publish-radio-to-sites] FAILED: ${message}`);
  process.exit(1);
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function resolveSourceVersionDir(slug, explicitVersion) {
  const stationDir = join(EXPORTS_ROOT, slug);
  if (!existsSync(stationDir)) fail(`no export found for slug "${slug}" under ${relative(REPO_ROOT, stationDir)}`);
  if (explicitVersion != null) {
    const dir = join(stationDir, `v${explicitVersion}`);
    if (!existsSync(dir)) fail(`version v${explicitVersion} not found for "${slug}" at ${relative(REPO_ROOT, dir)}`);
    return { dir, version: explicitVersion };
  }
  const versions = readdirSync(stationDir)
    .filter((name) => /^v\d+$/.test(name))
    .map((name) => Number(name.slice(1)))
    .sort((a, b) => b - a);
  if (versions.length === 0) fail(`no versioned export directories found for "${slug}" under ${relative(REPO_ROOT, stationDir)}`);
  return { dir: join(stationDir, `v${versions[0]}`), version: versions[0] };
}

function loadJson(path, label) {
  if (!existsSync(path)) fail(`${label} not found at ${relative(REPO_ROOT, path)}`);
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(`${label} is not valid JSON (${relative(REPO_ROOT, path)}): ${error.message}`);
  }
  return parsed;
}

function validateSource(sourceDir) {
  const manifest = loadJson(join(sourceDir, "radio-manifest.json"), "radio-manifest.json");
  const checksums = loadJson(join(sourceDir, "checksums.json"), "checksums.json");

  if (!manifest.schemaVersion) fail("radio-manifest.json is missing schemaVersion");
  if (!Array.isArray(manifest.entries) || manifest.entries.length === 0) fail("radio-manifest.json has no entries");
  if (!manifest.stationId || !manifest.title || typeof manifest.bundleVersion !== "number") {
    fail("radio-manifest.json is missing stationId, title, or bundleVersion");
  }
  if (!checksums.files || typeof checksums.files !== "object") fail("checksums.json has no files map");

  // Every audioUrl (and artworkUrl) referenced by the manifest must be present in checksums.
  const referenced = new Set(manifest.entries.map((e) => e.audioUrl));
  if (manifest.artworkUrl) referenced.add(manifest.artworkUrl);
  referenced.add("radio-manifest.json");
  referenced.add("playlist.json");
  for (const rel of referenced) {
    if (!checksums.files[rel]) fail(`checksums.json has no entry for referenced file "${rel}"`);
  }

  // Every file listed in checksums.json must exist on disk with matching size + sha256.
  const fileEntries = Object.entries(checksums.files);
  let totalBytes = 0;
  for (const [rel, expected] of fileEntries) {
    const absPath = join(sourceDir, rel);
    if (!existsSync(absPath)) fail(`missing file referenced by checksums.json: ${rel}`);
    const actualSize = statSync(absPath).size;
    if (actualSize !== expected.byteSize) {
      fail(`size mismatch for ${rel}: expected ${expected.byteSize} bytes, found ${actualSize}`);
    }
    const actualHash = sha256File(absPath);
    if (actualHash !== expected.sha256) {
      fail(`sha256 mismatch for ${rel}: expected ${expected.sha256}, computed ${actualHash}`);
    }
    totalBytes += actualSize;
  }

  return { manifest, checksums, fileList: fileEntries.map(([rel]) => rel), totalBytes };
}

function copyTree(sourceDir, destDir, fileList) {
  mkdirSync(destDir, { recursive: true });
  for (const rel of fileList) {
    const srcPath = join(sourceDir, rel);
    const destPath = join(destDir, rel);
    mkdirSync(dirname(destPath), { recursive: true });
    copyFileSync(srcPath, destPath);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.slug) fail("usage: node scripts/publish-radio-to-sites.mjs <slug> [--version N] [--sites-root <path>] [--no-activate]");
  if (!existsSync(args.sitesRoot)) fail(`Sites root not found at ${args.sitesRoot} — extract the Sites source first`);
  const hostingJsonPath = join(args.sitesRoot, ".openai/hosting.json");
  if (!existsSync(hostingJsonPath)) fail(`${relative(REPO_ROOT, hostingJsonPath)} not found — this does not look like the Sites project root`);

  const { dir: sourceDir, version } = resolveSourceVersionDir(args.slug, args.version);
  console.log(`[publish-radio-to-sites] validating ${relative(REPO_ROOT, sourceDir)} ...`);
  const { manifest, fileList, totalBytes } = validateSource(sourceDir);
  console.log(`[publish-radio-to-sites] validated ${fileList.length} files (${(totalBytes / 1e6).toFixed(2)} MB), ${manifest.entries.length} tracks`);

  const radioPublicRoot = join(args.sitesRoot, "public/radio");
  const finalDir = join(radioPublicRoot, args.slug, `v${version}`);
  const tempDir = join(radioPublicRoot, `.tmp-${args.slug}-v${version}-${process.pid}`);

  if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
  try {
    copyTree(sourceDir, tempDir, fileList);

    // Cheap post-copy sanity check before committing — every copied file must
    // exist with the exact same byte size as the validated source.
    for (const rel of fileList) {
      const destPath = join(tempDir, rel);
      const srcSize = statSync(join(sourceDir, rel)).size;
      const destSize = statSync(destPath).size;
      if (srcSize !== destSize) fail(`post-copy size mismatch for ${rel} — aborting, no live directory touched`);
    }

    // Atomic commit: replace the live version directory only now.
    if (existsSync(finalDir)) rmSync(finalDir, { recursive: true, force: true });
    mkdirSync(dirname(finalDir), { recursive: true });
    renameSync(tempDir, finalDir);
  } catch (error) {
    if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
    throw error;
  }
  console.log(`[publish-radio-to-sites] committed ${relative(args.sitesRoot, finalDir)}`);

  if (args.activate) {
    const manifestUrl = `radio/${args.slug}/v${version}/radio-manifest.json`;
    const activePointer = {
      schemaVersion: "1.0.0",
      stationSlug: args.slug,
      bundleVersion: version,
      manifestUrl,
      updatedAt: new Date().toISOString(),
    };
    const activePath = join(radioPublicRoot, "active.json");
    const activeTempPath = join(radioPublicRoot, "active.json.tmp");
    writeFileSync(activeTempPath, JSON.stringify(activePointer, null, 2) + "\n");
    renameSync(activeTempPath, activePath);
    console.log(`[publish-radio-to-sites] active pointer -> ${manifestUrl}`);
  } else {
    console.log("[publish-radio-to-sites] --no-activate: version deployed but not activated");
  }
}

main();
