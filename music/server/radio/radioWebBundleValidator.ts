// 0718B_RADIO_Web_Publication_Asset_Export_Bridge — the bundle validator
// (spec §Export preflight / after-export validation). Node-only. Takes a
// bundle ROOT PATH so tests can validate a bundle copied unchanged to any
// other local directory (portability proof); HTTP routes must resolve the
// root themselves from {slug, version} — never from a client path.
//
// Checks: JSON parse + schema shape, exact package bindings (optional,
// when a trackLibraryRoot is provided), relative-POSIX-only URL policy,
// path-traversal and absolute-path rejection, referenced-file existence
// beneath the bundle root, per-file hash + byte-size verification,
// playlist order + totals, byte-identity of exported Opus with the
// decode-verified immutable packages (sha256 equality), unexpected-file
// detection, and an explicit PRIVACY SCAN over every exported JSON string
// (source references, local library path fragments, home-dir/username
// patterns, machine hostnames — 0718B plan correction).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readJsonSafe } from "./radioFsUtils";
import { sha256File } from "./radioVersionCloneHelper";
import { trackPackageVersionDir } from "./radioTrackPackageWriter";
import type { RadioTrackPackageManifest } from "../../src/data/radioTrackPackageTypes";
import type {
  RadioWebBundleValidationResult,
  RadioWebChecksumsFile,
  RadioWebManifest,
  RadioWebPlaylistFile,
} from "../../src/data/radioWebBundleTypes";
import type { RadioValidationIssue } from "../../src/data/radioLoopTypes";

const AUDIO_URL_PATTERN = /^audio\/(rtrack_\d{6})-v(\d+)\.opus$/;

function issue(code: string, message: string): RadioValidationIssue {
  return { code, message, severity: "error" };
}

function isPortableRelativePath(p: string): boolean {
  if (!p || path.isAbsolute(p) || /^[a-zA-Z]:[\\/]/.test(p)) return false;
  if (p.includes("\\")) return false; // POSIX only
  if (p.startsWith("file://") || p.includes("://")) return false;
  const segments = p.split("/");
  if (segments.some((s) => s === ".." || s === "" || s === ".")) return false;
  return true;
}

// Recursively collects every string value in a parsed JSON document.
function collectStrings(value: unknown, out: string[]): void {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) collectStrings(v, out);
  else if (value && typeof value === "object") for (const v of Object.values(value)) collectStrings(v, out);
}

// The privacy scan — rejects source references, absolute paths, local
// library fragments, user-directory patterns, the local username, and the
// machine hostname anywhere in exported JSON.
export function findPrivacyViolations(jsonFileName: string, parsed: unknown): RadioValidationIssue[] {
  const issues: RadioValidationIssue[] = [];
  const strings: string[] = [];
  collectStrings(parsed, strings);

  const username = (() => {
    try { return os.userInfo().username; } catch { return null; }
  })();
  const hostname = (() => {
    try { return os.hostname(); } catch { return null; }
  })();
  const homedir = (() => {
    try { return os.homedir(); } catch { return null; }
  })();

  const violation = (kind: string, value: string) =>
    issues.push(issue("RADIO_WEB_BUNDLE_PRIVACY_VIOLATION", `${jsonFileName}: ${kind} leaked in exported JSON: "${value.slice(0, 120)}"`));

  const escapeRegExp = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  for (const s of strings) {
    if (/^\//.test(s) || /^[a-zA-Z]:[\\/]/.test(s)) violation("absolute path", s);
    if (/file:\/\//i.test(s)) violation("file:// URL", s);
    if (/source-reference/i.test(s)) violation("source reference", s);
    if (/library\/music/i.test(s) || /RadioTrackLibrary/i.test(s) || /RadioLoopLibrary/i.test(s)) violation("local library path fragment", s);
    if (/\/Users\/[^/\s]+/.test(s) || /\/home\/[^/\s]+/.test(s)) violation("user home-directory pattern", s);
    if (homedir && homedir.length > 3 && s.includes(homedir)) violation("home directory", s);
    // Username only in PATH-LIKE contexts (…/studio, studio/…): a bare
    // word check would false-positive on legitimate music titles that
    // happen to contain the username as a word.
    if (username && username.length >= 3 && new RegExp(`[\\\\/]${escapeRegExp(username)}([\\\\/]|$)`, "i").test(s)) violation("local username in path", s);
    if (hostname && hostname.length >= 5 && s.toLowerCase().includes(hostname.toLowerCase())) violation("machine hostname", s);
  }
  return issues;
}

function walkFiles(root: string, dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(root, abs, out);
    else out.push(path.relative(root, abs).split(path.sep).join("/"));
  }
}

export interface ValidateWebBundleOptions {
  // When provided, every entry's exact package binding is checked and the
  // exported audio's sha256 must byte-match the decode-verified package
  // asset. Omit when validating a bundle copied to a machine without the
  // internal library (pure portability validation).
  trackLibraryRoot?: string;
}

export function validateWebBundle(bundleRoot: string, options: ValidateWebBundleOptions = {}): RadioWebBundleValidationResult {
  const issues: RadioValidationIssue[] = [];
  const checkedAt = new Date().toISOString();

  const allFiles: string[] = [];
  if (!fs.existsSync(bundleRoot) || !fs.statSync(bundleRoot).isDirectory()) {
    return { ok: false, checkedAt, fileCount: 0, issues: [issue("RADIO_WEB_BUNDLE_ROOT_MISSING", `Bundle root not found: ${bundleRoot}`)] };
  }
  walkFiles(bundleRoot, bundleRoot, allFiles);

  // 1 — parse every JSON document.
  const manifest = readJsonSafe<RadioWebManifest>(path.join(bundleRoot, "radio-manifest.json"));
  const playlist = readJsonSafe<RadioWebPlaylistFile>(path.join(bundleRoot, "playlist.json"));
  const checksums = readJsonSafe<RadioWebChecksumsFile>(path.join(bundleRoot, "checksums.json"));
  if (!manifest) issues.push(issue("RADIO_WEB_BUNDLE_MANIFEST_UNPARSEABLE", "radio-manifest.json missing or unparseable"));
  if (!playlist) issues.push(issue("RADIO_WEB_BUNDLE_PLAYLIST_UNPARSEABLE", "playlist.json missing or unparseable"));
  if (!checksums) issues.push(issue("RADIO_WEB_BUNDLE_CHECKSUMS_UNPARSEABLE", "checksums.json missing or unparseable"));
  if (!manifest || !playlist || !checksums) return { ok: false, checkedAt, fileCount: allFiles.length, issues };

  // 2 — schema shape.
  if (manifest.schemaVersion == null || !Array.isArray(manifest.entries) || typeof manifest.stationId !== "string" || typeof manifest.bundleVersion !== "number") {
    issues.push(issue("RADIO_WEB_BUNDLE_MANIFEST_SCHEMA", "radio-manifest.json fails schema shape"));
  }
  if (playlist.schemaVersion == null || !Array.isArray(playlist.entries)) {
    issues.push(issue("RADIO_WEB_BUNDLE_PLAYLIST_SCHEMA", "playlist.json fails schema shape"));
  }
  if (checksums.schemaVersion == null || typeof checksums.contentSignature !== "string" || typeof checksums.files !== "object") {
    issues.push(issue("RADIO_WEB_BUNDLE_CHECKSUMS_SCHEMA", "checksums.json fails schema shape"));
  }

  // 3 — portable-relative-path policy + traversal/absolute rejection for
  // every referenced URL.
  const referenced: string[] = [];
  if (manifest.artworkUrl != null) referenced.push(manifest.artworkUrl);
  for (const entry of manifest.entries) referenced.push(entry.audioUrl);
  for (const rel of referenced) {
    if (!isPortableRelativePath(rel)) {
      issues.push(issue("RADIO_WEB_BUNDLE_NONPORTABLE_PATH", `Non-portable/traversal path reference: "${rel}"`));
      continue;
    }
    const resolved = path.resolve(bundleRoot, rel);
    if (!(resolved === bundleRoot || resolved.startsWith(bundleRoot + path.sep))) {
      issues.push(issue("RADIO_WEB_BUNDLE_PATH_ESCAPE", `Reference escapes the bundle root: "${rel}"`));
      continue;
    }
    if (!fs.existsSync(resolved)) {
      issues.push(issue("RADIO_WEB_BUNDLE_MISSING_ASSET", `Referenced file does not exist in the bundle: "${rel}"`));
    }
  }

  // 4 — privacy scan over every exported JSON.
  issues.push(...findPrivacyViolations("radio-manifest.json", manifest));
  issues.push(...findPrivacyViolations("playlist.json", playlist));
  issues.push(...findPrivacyViolations("checksums.json", checksums));

  // 5 — checksums cover exactly every file except checksums.json itself
  // (unexpected-file detection both directions).
  const expected = new Set(Object.keys(checksums.files));
  for (const file of allFiles) {
    if (file === "checksums.json") continue;
    if (!expected.has(file)) issues.push(issue("RADIO_WEB_BUNDLE_UNEXPECTED_FILE", `File present but not declared in checksums.json: "${file}"`));
  }
  for (const declared of expected) {
    if (!allFiles.includes(declared)) issues.push(issue("RADIO_WEB_BUNDLE_DECLARED_FILE_MISSING", `checksums.json declares a file that does not exist: "${declared}"`));
  }

  // 6 — per-file hash + byte-size verification.
  for (const [rel, expectation] of Object.entries(checksums.files)) {
    const abs = path.resolve(bundleRoot, rel);
    if (!isPortableRelativePath(rel) || !(abs === bundleRoot || abs.startsWith(bundleRoot + path.sep))) {
      issues.push(issue("RADIO_WEB_BUNDLE_NONPORTABLE_PATH", `checksums.json contains a non-portable path: "${rel}"`));
      continue;
    }
    if (!fs.existsSync(abs)) continue; // already reported above
    const byteSize = fs.statSync(abs).size;
    if (byteSize !== expectation.byteSize) {
      issues.push(issue("RADIO_WEB_BUNDLE_SIZE_MISMATCH", `"${rel}" is ${byteSize} bytes, checksums.json says ${expectation.byteSize}`));
    }
    if (sha256File(abs) !== expectation.sha256) {
      issues.push(issue("RADIO_WEB_BUNDLE_HASH_MISMATCH", `"${rel}" fails its checksums.json sha256`));
    }
  }

  // 7 — playlist order + audio-filename/id agreement + totals.
  if (manifest.entries.length !== playlist.entries.length) {
    issues.push(issue("RADIO_WEB_BUNDLE_ORDER_MISMATCH", "radio-manifest.json and playlist.json entry counts differ"));
  } else {
    for (let i = 0; i < manifest.entries.length; i++) {
      const m = manifest.entries[i];
      const p = playlist.entries[i];
      if (m.radioTrackId !== p.radioTrackId || m.packageVersion !== p.packageVersion) {
        issues.push(issue("RADIO_WEB_BUNDLE_ORDER_MISMATCH", `Entry ${i} differs between radio-manifest.json and playlist.json`));
      }
      const audioMatch = AUDIO_URL_PATTERN.exec(m.audioUrl);
      if (!audioMatch || audioMatch[1] !== m.radioTrackId || Number(audioMatch[2]) !== m.packageVersion) {
        issues.push(issue("RADIO_WEB_BUNDLE_AUDIO_NAME_MISMATCH", `Entry ${i} audioUrl "${m.audioUrl}" does not encode its exact binding`));
      }
    }
  }
  const sumDuration = manifest.entries.reduce((sum, e) => sum + e.durationSeconds, 0);
  const sumBytes = manifest.entries.reduce((sum, e) => sum + e.byteSize, 0) + (manifest.artworkUrl ? (checksums.files[manifest.artworkUrl]?.byteSize ?? 0) : 0);
  if (Math.abs(sumDuration - manifest.totalDurationSeconds) > 0.01) {
    issues.push(issue("RADIO_WEB_BUNDLE_TOTALS_MISMATCH", `totalDurationSeconds ${manifest.totalDurationSeconds} != entry sum ${sumDuration}`));
  }
  if (sumBytes !== manifest.totalByteSize) {
    issues.push(issue("RADIO_WEB_BUNDLE_TOTALS_MISMATCH", `totalByteSize ${manifest.totalByteSize} != entry+artwork sum ${sumBytes}`));
  }

  // 8 — exact-binding + byte-identity proof against the immutable,
  // previously decode-verified packages (sha256 equality — spec's
  // sanctioned alternative to re-decoding).
  if (options.trackLibraryRoot) {
    for (const entry of manifest.entries) {
      const pkgDir = trackPackageVersionDir(options.trackLibraryRoot, entry.radioTrackId, entry.packageVersion);
      const metadata = readJsonSafe<RadioTrackPackageManifest>(path.join(pkgDir, "metadata.json"));
      if (!metadata) {
        issues.push(issue("RADIO_WEB_BUNDLE_BINDING_INVALID", `Bound package ${entry.radioTrackId} v${entry.packageVersion} is missing`));
        continue;
      }
      if (metadata.audio.primary.sha256 !== entry.sha256) {
        issues.push(issue("RADIO_WEB_BUNDLE_BINDING_HASH_MISMATCH", `Entry ${entry.radioTrackId} v${entry.packageVersion} hash differs from its package manifest`));
      }
      if (metadata.verification?.decodeVerifyOk !== true) {
        issues.push(issue("RADIO_WEB_BUNDLE_BINDING_UNVERIFIED", `Bound package ${entry.radioTrackId} v${entry.packageVersion} has no decode-verification record`));
      }
    }
  }

  return { ok: issues.length === 0, checkedAt, fileCount: allFiles.length, issues };
}
