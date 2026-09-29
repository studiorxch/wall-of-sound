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
 * This does NOT commit, push, or deploy anything — it only writes to the
 * local Sites project checkout's own working tree. Reaching the real
 * public domain still requires a separate `git push` from inside that
 * checkout to its own `origin/main` (see docs/architecture/DEPLOYMENT.md).
 *
 * RADIO-02 (batch 0929-2) — the core logic below (`validateSource`,
 * `copyTree`, `publishRadioToSites`) is also imported directly by
 * music/vite.config.ts's `/radio-publish-to-sites` dev-server route, so
 * MUSIC's own operator UI can trigger this without a Terminal. `fail()`
 * throws `PublishToSitesError` rather than calling `process.exit` so a
 * long-running server process can catch and report it instead of dying;
 * the CLI entry point below still turns that into the exact same
 * stderr+exit(1) behavior as before.
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
const REPO_ROOT = resolve(__dirname, "../.."); // wall-of-sound-beta01/
const DEFAULT_EXPORTS_ROOT = join(REPO_ROOT, "library/music/RadioWebExports");
const DEFAULT_SITES_ROOT = join(REPO_ROOT, "studiorich-orbital");

export class PublishToSitesError extends Error {}

function fail(message) {
  throw new PublishToSitesError(message);
}

export function parseArgs(argv) {
  const args = { slug: null, version: null, sitesRoot: DEFAULT_SITES_ROOT, activate: true };
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

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function resolveSourceVersionDir(exportsRoot, slug, explicitVersion) {
  const stationDir = join(exportsRoot, slug);
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

export function loadJson(path, label) {
  if (!existsSync(path)) fail(`${label} not found at ${relative(REPO_ROOT, path)}`);
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(`${label} is not valid JSON (${relative(REPO_ROOT, path)}): ${error.message}`);
  }
  return parsed;
}

export function validateSource(sourceDir) {
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

export function copyTree(sourceDir, destDir, fileList) {
  mkdirSync(destDir, { recursive: true });
  for (const rel of fileList) {
    const srcPath = join(sourceDir, rel);
    const destPath = join(destDir, rel);
    mkdirSync(dirname(destPath), { recursive: true });
    copyFileSync(srcPath, destPath);
  }
}

/**
 * Library entry point — importable from music/vite.config.ts's dev-server
 * route as well as from this file's own CLI wrapper below. Throws
 * `PublishToSitesError` for any expected/validated failure (bad slug,
 * missing Sites checkout, checksum mismatch, etc.) so a caller can turn it
 * into an HTTP error response instead of the process exiting. Any other
 * thrown error is unexpected (e.g. a real fs/IO failure) and should be
 * treated as a 500 by callers, not retried automatically.
 *
 * `exportsRoot` and `sitesRoot` are both REQUIRED here (no implicit
 * defaults) — the CLI wrapper below supplies its own historical defaults;
 * a server-side caller must pass its own already-resolved roots so this
 * never silently reads from a directory the caller didn't intend.
 */
export async function publishRadioToSites({ slug, version = null, exportsRoot, sitesRoot, activate = true, onProgress = () => {} }) {
  if (!slug) fail("slug is required");
  if (!exportsRoot) fail("exportsRoot is required");
  if (!sitesRoot) fail("sitesRoot is required");
  if (!existsSync(sitesRoot)) fail(`Sites root not found at ${sitesRoot} — extract or check out the Sites project first`);
  const hostingJsonPath = join(sitesRoot, ".openai/hosting.json");
  if (!existsSync(hostingJsonPath)) fail(`${hostingJsonPath} not found — this does not look like the Sites project root`);

  const { dir: sourceDir, version: resolvedVersion } = resolveSourceVersionDir(exportsRoot, slug, version);
  onProgress(`validating ${relative(exportsRoot, sourceDir)} ...`);
  const { manifest, fileList, totalBytes } = validateSource(sourceDir);
  onProgress(`validated ${fileList.length} files (${(totalBytes / 1e6).toFixed(2)} MB), ${manifest.entries.length} tracks`);

  const radioPublicRoot = join(sitesRoot, "public/radio");
  const finalDir = join(radioPublicRoot, slug, `v${resolvedVersion}`);
  const tempDir = join(radioPublicRoot, `.tmp-${slug}-v${resolvedVersion}-${process.pid}`);

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
  onProgress(`committed ${relative(sitesRoot, finalDir)}`);

  let manifestUrl = null;
  if (activate) {
    manifestUrl = `radio/${slug}/v${resolvedVersion}/radio-manifest.json`;
    const activePointer = {
      schemaVersion: "1.0.0",
      stationSlug: slug,
      bundleVersion: resolvedVersion,
      manifestUrl,
      updatedAt: new Date().toISOString(),
    };
    const activePath = join(radioPublicRoot, "active.json");
    const activeTempPath = join(radioPublicRoot, "active.json.tmp");
    writeFileSync(activeTempPath, JSON.stringify(activePointer, null, 2) + "\n");
    renameSync(activeTempPath, activePath);
    onProgress(`active pointer -> ${manifestUrl}`);
  } else {
    onProgress("--no-activate: version deployed but not activated");
  }

  return {
    slug,
    version: resolvedVersion,
    finalDir,
    relativeFinalDir: relative(sitesRoot, finalDir),
    fileCount: fileList.length,
    totalBytes,
    activated: activate,
    manifestUrl,
  };
}

async function runCli() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.slug) fail("usage: node scripts/publish-radio-to-sites.mjs <slug> [--version N] [--sites-root <path>] [--no-activate]");
  await publishRadioToSites({
    slug: args.slug,
    version: args.version,
    exportsRoot: DEFAULT_EXPORTS_ROOT,
    sitesRoot: args.sitesRoot,
    activate: args.activate,
    onProgress: (message) => console.log(`[publish-radio-to-sites] ${message}`),
  });
}

// CLI entry point — unchanged behavior from before this file became
// importable: prints `[publish-radio-to-sites] FAILED: <message>` and
// exits 1 on any error, exactly as the old inline `fail()` did.
if (import.meta.url === `file://${process.argv[1]}`) {
  runCli().catch((error) => {
    const message = error instanceof PublishToSitesError ? error.message : (error?.message ?? String(error));
    console.error(`[publish-radio-to-sites] FAILED: ${message}`);
    process.exit(1);
  });
}
